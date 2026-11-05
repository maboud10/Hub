/**
 * Talent Hub selectors: permission-scoped views, the personal "my next
 * actions" list and pipeline analytics. Pure helpers are exported for tests;
 * hooks memoise them over the stores.
 */
import { useMemo } from 'react';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import type { User } from '@/types';
import { useTalent } from './store';
import * as access from './access';
import { nextAction, type GateContext, type NextAction } from './gates';
import { STAGE_ORDER, stageIndex } from './constants';
import { taskDueDate } from './onboarding';
import type { Application, ApprovalStep, Candidate, CandidateSource, Requisition, StageId, TalentData } from './types';

const DAY = 86_400_000;

// ───────────────────────── viewer ─────────────────────────
export function useTalentViewer(): access.TalentViewer | null {
  const user = useSessionUser();
  const perms = usePermissions();
  return useMemo(() => (user ? { userId: user.id, perms } : null), [user, perms]);
}

export interface TalentCaps {
  manage: boolean;
  hire: boolean;
  source: boolean;
  comp: boolean;
  approveOffers: boolean;
  onboarding: boolean;
  contact: boolean;
}

export function useTalentCaps(): TalentCaps {
  const v = useTalentViewer();
  return useMemo(
    () =>
      v
        ? {
            manage: access.canManage(v),
            hire: access.canHire(v),
            source: access.canSource(v),
            comp: access.canSeeComp(v),
            approveOffers: access.can(v, access.TALENT_PERMS.approveOffers),
            onboarding: access.canManageOnboarding(v),
            contact: access.canSeeContact(v),
          }
        : { manage: false, hire: false, source: false, comp: false, approveOffers: false, onboarding: false, contact: false },
    [v],
  );
}

// ───────────────────────── scoped data ─────────────────────────
export function scopeTalent(v: access.TalentViewer | null, data: Pick<TalentData, 'requisitions' | 'applications' | 'candidates'>) {
  if (!v) return { requisitions: [] as Requisition[], applications: [] as Application[], candidates: [] as Candidate[], reqIds: new Set<string>() };
  const requisitions = data.requisitions.filter((r) => access.canSeeRequisition(v, r));
  const reqIds = new Set(requisitions.map((r) => r.id));
  const applications = data.applications.filter((a) => reqIds.has(a.requisitionId));
  const manage = access.canManage(v) || access.canSource(v);
  const candIds = new Set(applications.map((a) => a.candidateId));
  const candidates = manage ? data.candidates : data.candidates.filter((c) => candIds.has(c.id));
  return { requisitions, applications, candidates, reqIds };
}

/** Requisitions, applications and candidates this user may see. */
export function useTalentScope() {
  const v = useTalentViewer();
  const requisitions = useTalent((s) => s.requisitions);
  const applications = useTalent((s) => s.applications);
  const candidates = useTalent((s) => s.candidates);
  return useMemo(() => scopeTalent(v, { requisitions, applications, candidates }), [v, requisitions, applications, candidates]);
}

/** Id → entity maps for fast rendering. */
export function useTalentLookups() {
  const requisitions = useTalent((s) => s.requisitions);
  const candidates = useTalent((s) => s.candidates);
  const applications = useTalent((s) => s.applications);
  const users = useHub((s) => s.users);
  return useMemo(
    () => ({
      reqById: new Map(requisitions.map((r) => [r.id, r])),
      candById: new Map(candidates.map((c) => [c.id, c])),
      appById: new Map(applications.map((a) => [a.id, a])),
      userById: new Map<string, User>(users.map((u) => [u.id, u])),
    }),
    [requisitions, candidates, applications, users],
  );
}

// ───────────────────────── gates & next actions ─────────────────────────
export function buildGateContext(app: Application, data: TalentData, now = Date.now()): GateContext | null {
  const candidate = data.candidates.find((c) => c.id === app.candidateId);
  if (!candidate) return null;
  return {
    candidate,
    outreach: data.outreach.filter((o) => o.candidateId === app.candidateId && (o.requisitionId === app.requisitionId || o.requisitionId === null)),
    interviews: data.interviews.filter((i) => i.applicationId === app.id),
    scorecards: data.scorecards.filter((s) => s.applicationId === app.id),
    offers: data.offers.filter((o) => o.applicationId === app.id),
    requisition: data.requisitions.find((r) => r.id === app.requisitionId),
    handedOff: data.onboarding.some((j) => j.applicationId === app.id),
    now,
  };
}

/** Snapshot of the talent store data (stable between renders of the same state). */
export function useTalentData(): TalentData {
  const s = useTalent();
  return useMemo(
    () => ({
      version: s.version,
      requisitions: s.requisitions,
      candidates: s.candidates,
      applications: s.applications,
      interviews: s.interviews,
      scorecards: s.scorecards,
      offers: s.offers,
      outreach: s.outreach,
      onboarding: s.onboarding,
      activity: s.activity,
    }),
    [s.version, s.requisitions, s.candidates, s.applications, s.interviews, s.scorecards, s.offers, s.outreach, s.onboarding, s.activity],
  );
}

export function useGateContext(applicationId: string | null | undefined): GateContext | null {
  const data = useTalentData();
  const minute = useNow(60_000);
  return useMemo(() => {
    const app = applicationId ? data.applications.find((a) => a.id === applicationId) : undefined;
    return app ? buildGateContext(app, data, minute) : null;
  }, [applicationId, data, minute]);
}

/** Next best action for every application (keyed by id). */
export function useNextActions(): Map<string, NextAction> {
  const data = useTalentData();
  const minute = useNow(60_000);
  return useMemo(() => {
    const map = new Map<string, NextAction>();
    for (const app of data.applications) {
      const ctx = buildGateContext(app, data, minute);
      if (ctx) map.set(app.id, nextAction(app, ctx));
    }
    return map;
  }, [data, minute]);
}

// ───────────────────────── my tasks ─────────────────────────
export type TalentTaskKind =
  | 'scorecard'
  | 'interview'
  | 'decision'
  | 'offer-approval'
  | 'req-approval'
  | 'send-offer'
  | 'follow-up'
  | 'onboarding';

export interface TalentTask {
  id: string;
  kind: TalentTaskKind;
  title: string;
  detail: string;
  link: string;
  at: number;
  urgent?: boolean;
  applicationId?: string;
  candidateId?: string;
  interviewId?: string;
  offerId?: string;
  requisitionId?: string;
  journeyId?: string;
  step?: ApprovalStep;
}

/** Everything waiting on this person across Talent Hub and HR Portal (pure). */
export function computeTalentTasks(v: access.TalentViewer | null, data: TalentData, users: User[], now = Date.now()): TalentTask[] {
  if (!v) return [];
  const tasks: TalentTask[] = [];
  const name = (id: string) => data.candidates.find((c) => c.id === id)?.name ?? 'Candidate';
  const req = (id: string) => data.requisitions.find((r) => r.id === id);
  const fmt = (ts: number) => new Date(ts).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  for (const iv of data.interviews) {
    if (!iv.interviewerIds.includes(v.userId) || iv.status === 'cancelled') continue;
    const end = iv.scheduledAt + iv.durationMins * 60_000;
    const mine = data.scorecards.some((s) => s.interviewId === iv.id && s.interviewerId === v.userId);
    const app = data.applications.find((a) => a.id === iv.applicationId);
    if (app?.status !== 'active') continue;
    if (end < now && !mine)
      tasks.push({
        id: `sc-${iv.id}`,
        kind: 'scorecard',
        title: `Scorecard due: ${name(iv.candidateId)}`,
        detail: `${iv.title} · ${fmt(iv.scheduledAt)}`,
        link: '/talent/interviews',
        at: end,
        urgent: now - end > DAY,
        interviewId: iv.id,
        applicationId: iv.applicationId,
        candidateId: iv.candidateId,
      });
    else if (iv.scheduledAt >= now && iv.scheduledAt - now < 2 * DAY)
      tasks.push({
        id: `iv-${iv.id}`,
        kind: 'interview',
        title: `Interview: ${name(iv.candidateId)}`,
        detail: `${iv.title} · ${fmt(iv.scheduledAt)} · ${iv.location}`,
        link: '/talent/interviews',
        at: iv.scheduledAt,
        interviewId: iv.id,
        applicationId: iv.applicationId,
        candidateId: iv.candidateId,
      });
  }

  for (const a of data.applications) {
    const r = req(a.requisitionId);
    if (!r || a.status !== 'active') continue;
    if (a.stage === 'final' && !a.decision && r.hiringManagerId === v.userId)
      tasks.push({
        id: `dec-${a.id}`,
        kind: 'decision',
        title: `Decision needed: ${name(a.candidateId)}`,
        detail: `${r.title} · in debrief ${Math.max(1, Math.round((now - a.stageEnteredAt) / DAY))}d`,
        link: '/talent/pipeline',
        at: a.stageEnteredAt,
        urgent: now - a.stageEnteredAt > 2 * DAY,
        applicationId: a.id,
        candidateId: a.candidateId,
      });
  }

  for (const o of data.offers) {
    const r = req(o.requisitionId);
    if (!r) continue;
    if (o.status === 'pending-approval')
      for (const ap of o.approvals)
        if (ap.decision === 'pending' && access.canApproveOfferStep(v, o, r, ap.step).ok)
          tasks.push({
            id: `oa-${o.id}-${ap.step}`,
            kind: 'offer-approval',
            title: `Approve offer: ${name(o.candidateId)}`,
            detail: `${r.title} · ${ap.step === 'hiring-manager' ? 'hiring manager' : 'People Ops'} sign-off`,
            link: '/talent/offers',
            at: o.createdAt,
            urgent: true,
            offerId: o.id,
            applicationId: o.applicationId,
            candidateId: o.candidateId,
            step: ap.step,
          });
    if (o.status === 'approved' && access.canManage(v) && (o.createdBy === v.userId || r.recruiterId === v.userId))
      tasks.push({
        id: `so-${o.id}`,
        kind: 'send-offer',
        title: `Send offer: ${name(o.candidateId)}`,
        detail: `${r.title} · all approvals in`,
        link: '/talent/offers',
        at: o.createdAt,
        urgent: true,
        offerId: o.id,
        applicationId: o.applicationId,
        candidateId: o.candidateId,
      });
  }

  for (const r of data.requisitions)
    if (r.status === 'pending-approval' && access.canApproveRequisition(v, r).ok)
      tasks.push({ id: `ra-${r.id}`, kind: 'req-approval', title: `Approve headcount: ${r.title}`, detail: `${r.department} · ${r.headcount} seat${r.headcount === 1 ? '' : 's'}`, link: `/talent/requisitions/${r.id}`, at: r.createdAt, requisitionId: r.id });

  for (const o of data.outreach)
    if (o.status === 'sent' && o.followUpAt && o.followUpAt < now && o.createdBy === v.userId && o.step < 3)
      tasks.push({ id: `fu-${o.id}`, kind: 'follow-up', title: `Follow up: ${name(o.candidateId)}`, detail: `No reply since ${new Date(o.sentAt ?? o.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, link: '/talent/pipeline', at: o.followUpAt, candidateId: o.candidateId, requisitionId: o.requisitionId ?? undefined });

  const manageOnb = access.canManageOnboarding(v);
  for (const j of data.onboarding) {
    if (j.status === 'completed' || !access.canSeeJourney(v, j)) continue;
    const mine = j.tasks.filter((t) => {
      if (t.done) return false;
      const ownerMatch = (t.owner === 'manager' && j.managerId === v.userId) || (t.owner === 'buddy' && j.buddyId === v.userId) || (t.owner === 'new-hire' && j.hubUserId === v.userId) || (manageOnb && (t.owner === 'people-ops' || t.owner === 'it'));
      return ownerMatch && taskDueDate(j, t) < now + 7 * DAY;
    });
    if (mine.length) {
      const overdue = mine.filter((t) => taskDueDate(j, t) < now - DAY).length;
      tasks.push({
        id: `onb-${j.id}`,
        kind: 'onboarding',
        title: `Onboarding: ${j.name}`,
        detail: `${mine.length} task${mine.length === 1 ? '' : 's'} due${overdue ? ` · ${overdue} overdue` : ''} · ${mine[0].title}`,
        link: `/hr/onboarding/${j.id}`,
        at: Math.min(...mine.map((t) => taskDueDate(j, t))),
        urgent: overdue > 0,
        journeyId: j.id,
      });
    }
  }
  void users;
  return tasks.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || a.at - b.at);
}

export function useMyTalentTasks(): TalentTask[] {
  const v = useTalentViewer();
  const data = useTalentData();
  const users = useHub((s) => s.users);
  const minute = useNow(60_000);
  return useMemo(() => computeTalentTasks(v, data, users, minute), [v, data, users, minute]);
}

// ───────────────────────── analytics ─────────────────────────
export interface FunnelStep {
  stage: StageId;
  /** Applications currently in this stage. */
  current: number;
  /** Applications that ever reached this stage. */
  reached: number;
  /** Conversion from the previous stage (0–1). */
  conversion: number | null;
}

export function computeFunnel(apps: Application[]): FunnelStep[] {
  const reached = new Map<StageId, number>();
  for (const a of apps) {
    const max = Math.max(...a.history.map((h) => stageIndex(h.stage)), stageIndex(a.stage));
    const min = Math.min(...a.history.map((h) => stageIndex(h.stage)), stageIndex(a.stage));
    for (let i = min; i <= max; i += 1) reached.set(STAGE_ORDER[i], (reached.get(STAGE_ORDER[i]) ?? 0) + 1);
  }
  return STAGE_ORDER.map((stage, i) => {
    const r = reached.get(stage) ?? 0;
    const prev = i > 0 ? reached.get(STAGE_ORDER[i - 1]) ?? 0 : 0;
    return {
      stage,
      current: apps.filter((a) => a.status === 'active' && a.stage === stage).length + (stage === 'hired' ? apps.filter((a) => a.status === 'hired').length : 0),
      reached: r,
      conversion: i === 0 || !prev ? null : Math.min(1, r / prev),
    };
  });
}

export interface TalentStats {
  openReqs: number;
  openSeats: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  offersOut: number;
  hires90d: number;
  avgDaysToHire: number | null;
  avgMatch: number | null;
  staleCount: number;
  funnel: FunnelStep[];
  sourceMix: { source: CandidateSource; candidates: number; hires: number }[];
}

export function computeStats(data: Pick<TalentData, 'requisitions' | 'applications' | 'candidates' | 'interviews' | 'offers'>, now = Date.now()): TalentStats {
  const open = data.requisitions.filter((r) => r.status === 'open');
  const active = data.applications.filter((a) => a.status === 'active');
  const weekEnd = now + 7 * DAY;
  const hired = data.applications.filter((a) => a.status === 'hired');
  const hiredRecent = hired.filter((a) => now - a.stageEnteredAt < 90 * DAY);
  const durations = hired.map((a) => (a.stageEnteredAt - a.createdAt) / DAY).filter((d) => d > 0);
  const scores = active.map((a) => a.match?.score).filter((s): s is number => typeof s === 'number');
  const SLA: Record<StageId, number> = { sourced: 5, contacted: 7, applied: 3, screen: 5, interview: 10, final: 4, offer: 7, hired: 999 };
  const bySource = new Map<CandidateSource, { candidates: number; hires: number }>();
  const candById = new Map(data.candidates.map((c) => [c.id, c]));
  for (const a of data.applications) {
    const src = candById.get(a.candidateId)?.source;
    if (!src) continue;
    const e = bySource.get(src) ?? { candidates: 0, hires: 0 };
    e.candidates += 1;
    if (a.status === 'hired') e.hires += 1;
    bySource.set(src, e);
  }
  return {
    openReqs: open.length,
    openSeats: open.reduce((n, r) => n + Math.max(0, r.headcount - r.hires), 0),
    activeCandidates: active.length,
    interviewsThisWeek: data.interviews.filter((i) => i.status !== 'cancelled' && i.scheduledAt >= now - DAY && i.scheduledAt < weekEnd).length,
    offersOut: data.offers.filter((o) => o.status === 'pending-approval' || o.status === 'approved' || o.status === 'sent').length,
    hires90d: hiredRecent.length,
    avgDaysToHire: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    avgMatch: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    staleCount: active.filter((a) => (now - a.stageEnteredAt) / DAY > SLA[a.stage]).length,
    funnel: computeFunnel(data.applications),
    sourceMix: [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.candidates - a.candidates),
  };
}

export function useTalentStats(): TalentStats {
  const scope = useTalentScope();
  const interviews = useTalent((s) => s.interviews);
  const offers = useTalent((s) => s.offers);
  const minute = useNow(60_000);
  return useMemo(() => {
    const reqIds = scope.reqIds;
    return computeStats(
      {
        requisitions: scope.requisitions,
        applications: scope.applications,
        candidates: scope.candidates,
        interviews: interviews.filter((i) => reqIds.has(i.requisitionId)),
        offers: offers.filter((o) => reqIds.has(o.requisitionId)),
      },
      minute,
    );
  }, [scope, interviews, offers, minute]);
}

/** Onboarding journeys this user may see (HR Portal). */
export function useVisibleJourneys() {
  const v = useTalentViewer();
  const journeys = useTalent((s) => s.onboarding);
  return useMemo(() => (v ? journeys.filter((j) => access.canSeeJourney(v, j)) : []), [v, journeys]);
}
