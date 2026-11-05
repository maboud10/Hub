/**
 * Talent Hub store — the "API" for recruiting and onboarding.
 *
 * Every action re-checks the session user's permissions (UI hiding is only
 * UX), enforces stage gates / separation of duties, writes to the shared NEXUS
 * audit trail, notifies the right people and mirrors the document change to
 * the active backend (local by default, Firestore `talenthub` when enabled).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions, hasPermission, usersWithPermission } from '@/lib/rbac';
import { uid } from '@/lib/id';
import type {
  AiEngine,
  Application,
  ApprovalStep,
  Candidate,
  CandidateSource,
  Consent,
  Department,
  Education,
  EmploymentType,
  Experience,
  Interview,
  InterviewKind,
  InterviewStep,
  JobProfile,
  MatchResult,
  Offer,
  OnboardingJourney,
  OnboardingPhase,
  OnboardingTask,
  Outreach,
  OutreachChannel,
  OutreachStatus,
  OutreachTone,
  Prospect,
  Rating,
  Recommendation,
  RejectionReason,
  ReqPriority,
  ReqStatus,
  Requisition,
  Scorecard,
  Seniority,
  StageId,
  TalentActivity,
  TalentCollection,
  TalentData,
  TaskOwner,
  WorkModel,
} from './types';
import { APPROVAL_STEP_LABEL, CHANNEL_META, FOLLOW_UP_DAYS, REJECTION_LABEL, STAGE_BY_ID, TALENT_DATA_VERSION } from './constants';
import * as access from './access';
import { gateFor, type GateContext } from './gates';
import { buildJourneyTasks, deriveJourneyStatus, toISODate } from './onboarding';
import { analyzeJobDescription } from './ai/jd';
import { scoreMatch } from './ai/match';
import { connectTalentBackend, getTalentBackend, SEED_DEMO_DATA, TALENT_COLLECTIONS } from './backend';
import { createTalentSeed } from './seed';

const DAY = 86_400_000;

// ───────────────────────── inputs ─────────────────────────
export interface NewRequisitionInput {
  title: string;
  department: Department;
  location: string;
  workModel: WorkModel;
  employmentType: EmploymentType;
  seniority: Seniority;
  band: string;
  salary: { min: number; max: number; currency: string } | null;
  headcount: number;
  priority: ReqPriority;
  hiringManagerId: string;
  recruiterId: string;
  interviewPlan: InterviewStep[];
  jd: { text: string; fileName?: string; profile: JobProfile | null };
  targetStartDate?: string;
  /** false = save as draft; default submits (or opens directly when you may approve it). */
  submit?: boolean;
}

export interface NewCandidateInput {
  name: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  yearsExperience: number;
  skills: string[];
  source: CandidateSource;
  headline?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  experience?: Experience[];
  education?: Education[];
  sourceDetail?: string;
  referrerId?: string;
  tags?: string[];
  openToWork?: boolean;
  recentActivity?: string;
  avatarHue?: number;
  salaryExpectation?: Candidate['salaryExpectation'];
  noticePeriodDays?: number;
  workModelPreference?: WorkModel;
  sample?: boolean;
  /** Consent already captured (e.g. candidate applied or replied yes). */
  consentMethod?: Consent['method'];
}

export interface NewOutreachInput {
  candidateId: string;
  requisitionId: string | null;
  channel: OutreachChannel;
  tone: OutreachTone;
  subject?: string;
  body: string;
  step?: 1 | 2 | 3;
  engine: AiEngine;
  status: 'draft' | 'sent';
}

export interface NewInterviewInput {
  applicationId: string;
  kind: InterviewKind;
  title?: string;
  scheduledAt: number;
  durationMins: number;
  interviewerIds: string[];
  location: string;
}

export interface NewScorecardInput {
  interviewId: string;
  ratings: Record<string, Rating>;
  recommendation: Recommendation;
  notes: string;
}

export interface NewOfferInput {
  applicationId: string;
  baseSalary: number;
  currency: string;
  bonusPct: number;
  equity: string;
  signOnBonus: number;
  /** ISO date. */
  startDate: string;
  expiresInDays: number;
  band?: string;
  title?: string;
  note?: string;
  /** Route for approval immediately (default true). */
  submit?: boolean;
}

export interface NewOnboardingTaskInput {
  title: string;
  owner: TaskOwner;
  phase: OnboardingPhase;
  dueOffsetDays: number;
}

export type IdResult = ActionResult & { id?: string };

export interface TalentActions {
  // requisitions
  createRequisition(input: NewRequisitionInput): IdResult;
  updateRequisition(id: string, patch: Partial<Omit<Requisition, 'id' | 'status' | 'createdAt' | 'createdBy' | 'hires'>>): ActionResult;
  submitRequisition(id: string): ActionResult;
  approveRequisition(id: string, note?: string): ActionResult;
  setRequisitionStatus(id: string, status: Extract<ReqStatus, 'open' | 'on-hold' | 'closed'>, note?: string): ActionResult;
  // talent pool
  addCandidate(input: NewCandidateInput): IdResult;
  updateCandidate(id: string, patch: Partial<Omit<Candidate, 'id' | 'createdAt' | 'createdBy' | 'consent'>>): ActionResult;
  recordConsent(candidateId: string, method: NonNullable<Consent['method']>): ActionResult;
  addProspect(prospect: Prospect, requisitionId: string | null, match?: MatchResult | null): ActionResult & { candidateId?: string; applicationId?: string };
  addNote(candidateId: string, text: string, applicationId?: string): ActionResult;
  // pipeline
  addToPipeline(candidateId: string, requisitionId: string, opts?: { stage?: StageId; match?: MatchResult | null }): IdResult;
  moveStage(applicationId: string, to: StageId, opts?: { note?: string; override?: boolean; reason?: string }): ActionResult;
  rejectApplication(applicationId: string, reason: RejectionReason, note?: string): ActionResult;
  reopenApplication(applicationId: string): ActionResult;
  recordDecision(applicationId: string, verdict: 'hire' | 'no-hire', note?: string): ActionResult;
  // outreach
  logOutreach(input: NewOutreachInput): IdResult;
  updateOutreachStatus(id: string, status: OutreachStatus): ActionResult;
  // interviews
  scheduleInterview(input: NewInterviewInput): IdResult;
  updateInterview(id: string, patch: Partial<Pick<Interview, 'scheduledAt' | 'durationMins' | 'interviewerIds' | 'location' | 'status' | 'title'>>): ActionResult;
  submitScorecard(input: NewScorecardInput): IdResult;
  // offers
  draftOffer(input: NewOfferInput): IdResult;
  updateOffer(id: string, patch: Partial<Pick<Offer, 'baseSalary' | 'currency' | 'bonusPct' | 'equity' | 'signOnBonus' | 'startDate' | 'band' | 'title' | 'note'>>): ActionResult;
  submitOffer(id: string): ActionResult;
  decideOffer(id: string, step: ApprovalStep, decision: 'approved' | 'rejected', note?: string): ActionResult;
  sendOffer(id: string): ActionResult;
  recordOfferResponse(id: string, response: 'accepted' | 'declined', note?: string): ActionResult & { journeyId?: string };
  rescindOffer(id: string, note?: string): ActionResult;
  // onboarding (HR Portal)
  handOffToHR(applicationId: string): ActionResult & { journeyId?: string };
  toggleOnboardingTask(journeyId: string, taskId: string): ActionResult;
  addOnboardingTask(journeyId: string, task: NewOnboardingTaskInput): ActionResult;
  assignBuddy(journeyId: string, userId: string): ActionResult;
  updateJourney(journeyId: string, patch: Partial<Pick<OnboardingJourney, 'startDate' | 'welcomeNote' | 'location'>>): ActionResult;
  provisionHubAccount(journeyId: string): ActionResult;
  // demo
  resetTalentDemo(): void;
}

export type TalentStore = TalentData & TalentActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 22) || 'item';
const first = (name: string) => name.split(/\s+/)[0];
const ACTIVE_OFFER: Offer['status'][] = ['draft', 'pending-approval', 'approved', 'sent'];

type Doc<K extends TalentCollection> = TalentData[K][number];

export const useTalent = create<TalentStore>()(
  persist(
    (set, get) => {
      // ───────────────────────── context ─────────────────────────
      const hub = () => useHub.getState();
      const me = (): User | null => {
        const h = hub();
        return h.users.find((u) => u.id === h.sessionUserId) ?? null;
      };
      const viewerOf = (u: User | null): access.TalentViewer | null => (u ? { userId: u.id, perms: effectivePermissions(u, hub().roles) } : null);
      const userName = (id?: string) => hub().users.find((u) => u.id === id)?.name ?? 'Someone';
      const holders = (perm: string) => usersWithPermission(hub().users, hub().roles, perm).filter((u) => u.active);

      const audit = (e: { action: string; target: string; detail?: string; outcome?: 'success' | 'denied'; severity?: 'info' | 'warning' | 'critical' }) =>
        hub().logAudit({ outcome: 'success', severity: 'info', ...e });

      /** Notify users (never the actor themselves). */
      const notify = (ids: (string | undefined | null)[], n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read' | 'kind'>) => {
        const actor = hub().sessionUserId;
        const list = [...new Set(ids.filter((x): x is string => !!x && x !== actor))];
        if (list.length) hub().pushNotifications(list, { kind: 'talent', ...n });
      };

      const deny = (action: string, target: string, reason: string) => {
        audit({ action, target, detail: reason, outcome: 'denied', severity: 'warning' });
        return fail(reason);
      };

      /** Server-style gate: signed in, holds the module app, passes the specific rule. */
      const guard = (
        action: string,
        target: string,
        check: (v: access.TalentViewer) => access.Verdict | boolean,
        app: 'recruit' | 'hr' = 'recruit',
      ): { v: access.TalentViewer; user: User } | { error: ActionResult } => {
        const user = me();
        const v = viewerOf(user);
        if (!user || !v) return { error: fail('You are not signed in.') };
        if (!hasPermission(v.perms, `app:${app}`)) return { error: deny(action, target, `You don’t have access to ${app === 'hr' ? 'HR Portal' : 'Talent Hub'}.`) };
        const r = check(v);
        const verdict: access.Verdict = typeof r === 'boolean' ? (r ? { ok: true } : { ok: false, reason: 'You don’t have permission to do that.' }) : r;
        if (!verdict.ok) return { error: deny(action, target, verdict.reason ?? 'Not allowed.') };
        return { v, user };
      };

      // ───────────────────────── persistence helpers ─────────────────────────
      const put = <K extends TalentCollection>(col: K, doc: Doc<K>) => {
        set((s) => {
          const list = s[col] as Doc<K>[];
          const idx = list.findIndex((d) => (d as { id: string }).id === (doc as { id: string }).id);
          const next = idx >= 0 ? list.map((d, i) => (i === idx ? doc : d)) : [doc, ...list];
          return { [col]: next } as unknown as Partial<TalentStore>;
        });
        getTalentBackend().write(col, doc as { id: string });
      };

      const patch = <K extends TalentCollection>(col: K, id: string, fn: (d: Doc<K>) => Doc<K>): Doc<K> | null => {
        const current = (get()[col] as Doc<K>[]).find((d) => (d as { id: string }).id === id);
        if (!current) return null;
        const next = fn(current);
        put(col, next);
        return next;
      };

      const log = (a: Omit<TalentActivity, 'id' | 'at' | 'actorId'> & { actorId?: string }) => {
        const entry: TalentActivity = { id: uid('act'), at: Date.now(), actorId: a.actorId ?? hub().sessionUserId ?? 'system', ...a };
        set((s) => ({ activity: [entry, ...s.activity].slice(0, 600) }));
        getTalentBackend().write('activity', entry);
      };

      // ───────────────────────── lookups ─────────────────────────
      const reqOf = (id: string) => get().requisitions.find((r) => r.id === id);
      const candOf = (id: string) => get().candidates.find((c) => c.id === id);
      const appOf = (id: string) => get().applications.find((a) => a.id === id);
      const gateCtx = (a: Application): GateContext => {
        const s = get();
        return {
          candidate: candOf(a.candidateId)!,
          outreach: s.outreach.filter((o) => o.candidateId === a.candidateId && (o.requisitionId === a.requisitionId || o.requisitionId === null)),
          interviews: s.interviews.filter((i) => i.applicationId === a.id),
          scorecards: s.scorecards.filter((sc) => sc.applicationId === a.id),
          offers: s.offers.filter((o) => o.applicationId === a.id),
          requisition: reqOf(a.requisitionId),
          handedOff: s.onboarding.some((j) => j.applicationId === a.id),
        };
      };

      /** Move an application (no permission check — callers have already authorised). */
      const advance = (a: Application, to: StageId, by: string, note?: string, override = false) => {
        const now = Date.now();
        const next = patch('applications', a.id, (x) => ({
          ...x,
          stage: to,
          stageEnteredAt: now,
          updatedAt: now,
          history: [...x.history, { stage: to, at: now, by, note: note?.trim() || undefined, override: override || undefined }],
        }));
        const c = candOf(a.candidateId);
        log({
          kind: 'stage',
          text: `${c?.name ?? 'Candidate'} moved to ${STAGE_BY_ID[to].label}${override ? ' (gate overridden)' : ''}`,
          candidateId: a.candidateId,
          applicationId: a.id,
          requisitionId: a.requisitionId,
          actorId: by,
        });
        return next;
      };

      /** Try to auto-advance when a gate becomes satisfied (smart pipeline). */
      const autoAdvance = (applicationId: string, to: StageId, by: string, why: string) => {
        const a = appOf(applicationId);
        if (!a || a.status !== 'active') return false;
        const order = ['sourced', 'contacted', 'applied', 'screen', 'interview', 'final', 'offer', 'hired'];
        if (order.indexOf(to) !== order.indexOf(a.stage) + 1) return false;
        if (!gateFor(a, to, gateCtx(a)).ok) return false;
        advance(a, to, by, `Auto: ${why}`);
        return true;
      };

      const createJourney = (a: Application, actorId: string, offer?: Offer): OnboardingJourney | null => {
        const existing = get().onboarding.find((j) => j.applicationId === a.id);
        if (existing) return existing;
        const c = candOf(a.candidateId);
        const r = reqOf(a.requisitionId);
        if (!c || !r) return null;
        const o = offer ?? get().offers.find((x) => x.applicationId === a.id && x.status === 'accepted');
        const id = uid('j');
        const journey: OnboardingJourney = {
          id,
          candidateId: c.id,
          applicationId: a.id,
          requisitionId: r.id,
          offerId: o?.id ?? '',
          name: c.name,
          email: c.email ?? '',
          title: o?.title ?? r.title,
          department: r.department,
          location: r.location,
          managerId: r.hiringManagerId,
          startDate: o?.startDate ?? toISODate(Date.now() + 30 * DAY),
          status: 'pre-boarding',
          tasks: buildJourneyTasks(id),
          avatarHue: c.avatarHue,
          handedOffBy: actorId,
          handedOffAt: Date.now(),
        };
        put('onboarding', journey);
        log({ kind: 'handoff', text: `${c.name} handed off to HR Portal onboarding`, candidateId: c.id, applicationId: a.id, requisitionId: r.id, actorId });
        notify([r.hiringManagerId, ...holders('hr.onboarding.manage').map((u) => u.id)], {
          title: `Onboarding started: ${c.name}`,
          body: `${journey.title} · day one ${journey.startDate}. Pre-boarding checklist is live.`,
          link: `/hr/onboarding/${id}`,
        });
        audit({ action: 'onboarding.handoff', target: c.name, detail: `${journey.title} · starts ${journey.startDate}` });
        return journey;
      };

      const reviewersFor = (o: Offer, r: Requisition, step: ApprovalStep) => {
        if (step === 'hiring-manager') return [r.hiringManagerId];
        return holders('talent.offers.approve')
          .map((u) => u.id)
          .filter((id) => id !== o.createdBy);
      };

      return {
        ...createTalentSeed(),

        // ───────────────────────── requisitions ─────────────────────────
        createRequisition(input) {
          const title = input.title.trim();
          const g = guard('requisition.created', title || 'Requisition', (v) => access.canCreateRequisition(v));
          if ('error' in g) return g.error;
          const { v } = g;
          if (title.length < 3) return fail('Give the role a title (3+ characters).');
          if (input.headcount < 1 || input.headcount > 50) return fail('Headcount must be between 1 and 50.');
          const users = hub().users;
          if (!users.some((u) => u.id === input.hiringManagerId && u.active)) return fail('Pick an active hiring manager.');
          if (!users.some((u) => u.id === input.recruiterId && u.active)) return fail('Pick an active recruiter.');
          if (!access.canManage(v) && input.hiringManagerId !== v.userId) return fail('Hiring managers can only raise requisitions for their own team.');
          if (input.salary && input.salary.min > input.salary.max) return fail('Salary minimum is above the maximum.');
          const salary = access.canSeeComp(v) ? input.salary : null;
          const now = Date.now();
          const id = `req-${slug(title)}-${Math.random().toString(36).slice(2, 5)}`;
          const profile = input.jd.profile ?? (input.jd.text.trim() ? analyzeJobDescription(input.jd.text, { fileName: input.jd.fileName }) : null);
          const draft: Requisition = {
            id,
            title,
            department: input.department,
            location: input.location.trim() || 'Dubai',
            workModel: input.workModel,
            employmentType: input.employmentType,
            seniority: input.seniority,
            band: input.band,
            salary,
            headcount: Math.round(input.headcount),
            hires: 0,
            status: 'draft',
            priority: input.priority,
            hiringManagerId: input.hiringManagerId,
            recruiterId: input.recruiterId,
            interviewPlan: input.interviewPlan,
            jd: { text: input.jd.text, fileName: input.jd.fileName, profile },
            createdBy: v.userId,
            createdAt: now,
            targetStartDate: input.targetStartDate,
          };
          let message = `Saved “${title}” as a draft`;
          if (input.submit !== false) {
            if (access.canApproveRequisition(v, draft).ok) {
              draft.status = 'open';
              draft.openedAt = now;
              draft.approvedBy = v.userId;
              message = `“${title}” is open. Start sourcing!`;
            } else {
              draft.status = 'pending-approval';
              message = `“${title}” submitted for headcount approval`;
            }
          }
          put('requisitions', draft);
          log({ kind: 'requisition', text: `Requisition raised: ${title} (${draft.status === 'open' ? 'open' : draft.status === 'draft' ? 'draft' : 'awaiting approval'})`, requisitionId: id });
          audit({ action: 'requisition.created', target: title, detail: `${input.department} · ${input.headcount} seat${input.headcount === 1 ? '' : 's'} · ${draft.status}` });
          if (draft.status === 'pending-approval')
            notify(
              holders('talent.manage')
                .filter((u) => u.id !== draft.hiringManagerId)
                .map((u) => u.id),
              { title: 'Headcount approval needed', body: `${title} · ${input.department}, raised by ${userName(v.userId)}.`, link: '/talent/requisitions' },
            );
          if (draft.status === 'open') notify([draft.hiringManagerId, draft.recruiterId], { title: `Requisition open: ${title}`, body: 'The pipeline is ready for sourcing.', link: `/talent/requisitions/${id}` });
          return { ...ok(message), id };
        },

        updateRequisition(id, changes) {
          const r = reqOf(id);
          const g = guard('requisition.updated', r?.title ?? id, (v) => (r ? access.canEditRequisition(v, r) : false));
          if ('error' in g) return g.error;
          if (!r) return fail('Requisition not found.');
          const next = { ...changes };
          if ('salary' in next && !access.canSeeComp(g.v)) delete next.salary;
          if (next.headcount !== undefined && next.headcount < r.hires) return fail(`Headcount can’t go below the ${r.hires} seat(s) already filled.`);
          if (next.jd && next.jd.text !== r.jd.text && !next.jd.profile) next.jd = { ...next.jd, profile: analyzeJobDescription(next.jd.text, { fileName: next.jd.fileName }) };
          patch('requisitions', id, (x) => ({ ...x, ...next }));
          audit({ action: 'requisition.updated', target: r.title, detail: Object.keys(next).join(', ') });
          return ok('Requisition updated');
        },

        submitRequisition(id) {
          const r = reqOf(id);
          const g = guard('requisition.submitted', r?.title ?? id, (v) => (r ? access.canEditRequisition(v, r) : false));
          if ('error' in g) return g.error;
          if (!r) return fail('Requisition not found.');
          if (r.status !== 'draft') return fail('Only drafts can be submitted.');
          patch('requisitions', id, (x) => ({ ...x, status: 'pending-approval' }));
          notify(
            holders('talent.manage')
              .filter((u) => u.id !== r.hiringManagerId)
              .map((u) => u.id),
            { title: 'Headcount approval needed', body: `${r.title} · ${r.department}.`, link: '/talent/requisitions' },
          );
          log({ kind: 'requisition', text: `${r.title} submitted for approval`, requisitionId: id });
          return ok('Submitted for approval');
        },

        approveRequisition(id, note) {
          const r = reqOf(id);
          const g = guard('requisition.approved', r?.title ?? id, (v) => (r ? access.canApproveRequisition(v, r) : false));
          if ('error' in g) return g.error;
          if (!r) return fail('Requisition not found.');
          if (r.status !== 'pending-approval') return fail('This requisition is not awaiting approval.');
          const now = Date.now();
          patch('requisitions', id, (x) => ({ ...x, status: 'open', openedAt: now, approvedBy: g.v.userId }));
          audit({ action: 'requisition.approved', target: r.title, detail: note?.trim() || `${r.headcount} seat(s) · band ${r.band}`, severity: 'warning' });
          log({ kind: 'requisition', text: `${r.title} approved and opened by ${userName(g.v.userId)}`, requisitionId: id });
          notify([r.hiringManagerId, r.recruiterId, r.createdBy], { title: `Approved: ${r.title}`, body: `Opened by ${userName(g.v.userId)}. Start sourcing.`, link: `/talent/requisitions/${id}` });
          return ok(`${r.title} is open`);
        },

        setRequisitionStatus(id, status, note) {
          const r = reqOf(id);
          const g = guard(`requisition.${status}`, r?.title ?? id, (v) => access.canManage(v));
          if ('error' in g) return g.error;
          if (!r) return fail('Requisition not found.');
          if (r.status === status) return fail(`Already ${status}.`);
          if (r.status === 'draft' || r.status === 'pending-approval') return fail('Approve the requisition first.');
          const now = Date.now();
          patch('requisitions', id, (x) => ({ ...x, status, closedAt: status === 'closed' ? now : undefined, openedAt: status === 'open' ? x.openedAt ?? now : x.openedAt }));
          const label = status === 'on-hold' ? 'put on hold' : status === 'closed' ? 'closed' : 'reopened';
          audit({ action: `requisition.${status}`, target: r.title, detail: note?.trim() });
          log({ kind: 'requisition', text: `${r.title} ${label}${note ? `: ${note}` : ''}`, requisitionId: id });
          notify([r.hiringManagerId, r.recruiterId], { title: `${r.title} ${label}`, body: note?.trim() || `By ${userName(g.v.userId)}.`, link: `/talent/requisitions/${id}` });
          return ok(`Requisition ${label}`);
        },

        // ───────────────────────── talent pool ─────────────────────────
        addCandidate(input) {
          const name = input.name.trim();
          const g = guard('candidate.created', name || 'Candidate', (v) => access.canManage(v) || access.canSource(v));
          if ('error' in g) return g.error;
          if (name.split(/\s+/).length < 2) return fail('Add the candidate’s full name.');
          const email = input.email?.trim().toLowerCase();
          const li = input.linkedinUrl?.trim().replace(/\/$/, '');
          const dupe = get().candidates.find(
            (c) =>
              (email && c.email?.toLowerCase() === email) ||
              (li && c.linkedinUrl?.replace(/\/$/, '') === li) ||
              (c.name.toLowerCase() === name.toLowerCase() && c.currentCompany.toLowerCase() === input.currentCompany.trim().toLowerCase()),
          );
          if (dupe) return { ok: false, error: `${dupe.name} is already in your talent pool.`, id: dupe.id };
          const now = Date.now();
          const id = uid('c');
          const c: Candidate = {
            id,
            name,
            headline: input.headline?.trim() || `${input.currentTitle} at ${input.currentCompany}`,
            currentTitle: input.currentTitle.trim(),
            currentCompany: input.currentCompany.trim(),
            location: input.location.trim(),
            email,
            phone: input.phone?.trim() || undefined,
            linkedinUrl: li || undefined,
            avatarHue: input.avatarHue ?? Math.floor(Math.random() * 360),
            yearsExperience: Math.max(0, Math.round(input.yearsExperience)),
            skills: input.skills,
            experience: input.experience ?? [],
            education: input.education ?? [],
            source: input.source,
            sourceDetail: input.sourceDetail,
            referrerId: input.referrerId,
            tags: input.tags ?? [],
            openToWork: input.openToWork,
            noticePeriodDays: input.noticePeriodDays,
            salaryExpectation: input.salaryExpectation,
            workModelPreference: input.workModelPreference,
            consent: input.consentMethod ? { given: true, at: now, retentionUntil: now + 540 * DAY, method: input.consentMethod } : { given: false },
            status: 'active',
            sample: input.sample,
            recentActivity: input.recentActivity,
            createdAt: now,
            createdBy: g.v.userId,
            updatedAt: now,
          };
          put('candidates', c);
          log({ kind: 'import', text: `${name} added to the talent pool (${input.sourceDetail ?? input.source})`, candidateId: id });
          audit({ action: 'candidate.created', target: name, detail: `Source: ${input.sourceDetail ?? input.source}${c.consent.given ? ' · consent recorded' : ''}` });
          return { ...ok(`${name} added to the talent pool`), id };
        },

        updateCandidate(id, changes) {
          const c = candOf(id);
          const g = guard('candidate.updated', c?.name ?? id, (v) => access.canManage(v) || access.canSource(v));
          if ('error' in g) return g.error;
          if (!c) return fail('Candidate not found.');
          patch('candidates', id, (x) => ({ ...x, ...changes, updatedAt: Date.now() }));
          if (changes.status === 'do-not-contact') audit({ action: 'candidate.do-not-contact', target: c.name, severity: 'warning' });
          return ok('Profile updated');
        },

        recordConsent(candidateId, method) {
          const c = candOf(candidateId);
          const g = guard('candidate.consent', c?.name ?? candidateId, (v) => access.canManage(v) || access.canSource(v));
          if ('error' in g) return g.error;
          if (!c) return fail('Candidate not found.');
          const now = Date.now();
          patch('candidates', candidateId, (x) => ({ ...x, consent: { given: true, at: now, retentionUntil: now + 540 * DAY, method }, updatedAt: now }));
          log({ kind: 'note', text: `Data-processing consent recorded for ${c.name} (${method})`, candidateId });
          audit({ action: 'candidate.consent', target: c.name, detail: `Method: ${method} · retained 18 months` });
          // Interested + consent → move to "Interested" automatically.
          for (const a of get().applications.filter((x) => x.candidateId === candidateId && x.stage === 'contacted')) autoAdvance(a.id, 'applied', g.v.userId, 'interest + consent recorded');
          return ok('Consent recorded');
        },

        addProspect(prospect, requisitionId, match) {
          const g = guard('candidate.sourced', prospect.name, (v) => access.canSource(v));
          if ('error' in g) return g.error;
          const existing = get().candidates.find((c) => c.name.toLowerCase() === prospect.name.toLowerCase() && c.currentCompany === prospect.currentCompany);
          let candidateId = existing?.id;
          if (!candidateId) {
            const res = get().addCandidate({
              name: prospect.name,
              headline: prospect.headline,
              currentTitle: prospect.currentTitle,
              currentCompany: prospect.currentCompany,
              location: prospect.location,
              yearsExperience: prospect.yearsExperience,
              skills: prospect.skills,
              experience: prospect.experience,
              education: prospect.education,
              source: 'linkedin',
              sourceDetail: prospect.sample ? 'LinkedIn · sample feed' : 'LinkedIn',
              linkedinUrl: prospect.profileUrl || undefined,
              openToWork: prospect.openToWork,
              recentActivity: prospect.recentActivity,
              avatarHue: prospect.avatarHue,
              sample: prospect.sample,
            });
            if (!res.ok && !res.id) return res;
            candidateId = res.id;
          }
          if (!candidateId) return fail('Could not add this prospect.');
          if (!requisitionId) return { ...ok(`${prospect.name} saved to the talent pool`), candidateId };
          const added = get().addToPipeline(candidateId, requisitionId, { stage: 'sourced', match });
          if (!added.ok) return { ...added, candidateId };
          return { ...ok(`${prospect.name} added to the pipeline`), candidateId, applicationId: added.id };
        },

        addNote(candidateId, text, applicationId) {
          const c = candOf(candidateId);
          const a = applicationId ? appOf(applicationId) : undefined;
          const r = a ? reqOf(a.requisitionId) : undefined;
          const g = guard('candidate.note', c?.name ?? candidateId, (v) => access.canManage(v) || (!!r && access.canSeeRequisition(v, r)));
          if ('error' in g) return g.error;
          if (!c) return fail('Candidate not found.');
          if (text.trim().length < 3) return fail('Write a little more.');
          log({ kind: 'note', text: text.trim(), candidateId, applicationId, requisitionId: a?.requisitionId });
          return ok('Note added');
        },

        // ───────────────────────── pipeline ─────────────────────────
        addToPipeline(candidateId, requisitionId, opts = {}) {
          const c = candOf(candidateId);
          const r = reqOf(requisitionId);
          const g = guard('pipeline.added', `${c?.name ?? candidateId} → ${r?.title ?? requisitionId}`, (v) => access.canManage(v) || access.canSource(v));
          if ('error' in g) return g.error;
          if (!c || !r) return fail('Candidate or requisition not found.');
          if (r.status !== 'open') return fail(`${r.title} isn’t open for new candidates.`);
          if (c.status === 'do-not-contact') return fail(`${c.name} asked not to be contacted.`);
          const existing = get().applications.find((a) => a.candidateId === candidateId && a.requisitionId === requisitionId);
          if (existing && existing.status === 'active') return { ok: false, error: `${c.name} is already in this pipeline.`, id: existing.id };
          const warm = c.source !== 'linkedin';
          const stage: StageId = opts.stage ?? (warm ? 'applied' : 'sourced');
          const now = Date.now();
          const match = opts.match ?? (r.jd.profile ? scoreMatch(r.jd.profile, c, { location: r.location, workModel: r.workModel }) : null);
          const id = uid('a');
          const app: Application = {
            id,
            candidateId,
            requisitionId,
            stage,
            stageEnteredAt: now,
            status: 'active',
            history: [{ stage, at: now, by: g.v.userId }],
            match,
            ownerId: r.recruiterId,
            createdAt: now,
            updatedAt: now,
          };
          put('applications', app);
          log({ kind: 'created', text: `${c.name} added to ${r.title} (${STAGE_BY_ID[stage].label})`, candidateId, applicationId: id, requisitionId });
          if (stage !== 'sourced') notify([r.hiringManagerId], { title: `New candidate: ${c.name}`, body: `${r.title} · ${match ? `${match.score}% match` : STAGE_BY_ID[stage].label}`, link: '/talent/pipeline' });
          return { ...ok(`${c.name} added to ${r.title}`), id };
        },

        moveStage(applicationId, to, opts = {}) {
          const a = appOf(applicationId);
          const r = a ? reqOf(a.requisitionId) : undefined;
          const c = a ? candOf(a.candidateId) : undefined;
          const target = `${c?.name ?? applicationId} → ${STAGE_BY_ID[to].label}`;
          const g = guard('pipeline.moved', target, (v) => (a && r ? access.canMoveApplication(v, a, r, to) : false));
          if ('error' in g) return g.error;
          if (!a || !r || !c) return fail('Application not found.');
          if (a.status !== 'active') return fail('This application is closed. Reopen it first.');
          if (a.stage === to) return fail(`Already in ${STAGE_BY_ID[to].label}.`);
          if (to === 'hired') return fail('Candidates are hired when the offer is accepted.');
          const gate = gateFor(a, to, gateCtx(a));
          let override = false;
          if (!gate.ok) {
            const missing = gate.checks.filter((x) => !x.done).map((x) => x.label);
            if (!opts.override) return fail(`Not yet: ${missing.join(' · ')}`);
            if (!access.canManage(g.v)) return deny('pipeline.gate.override', target, 'Only recruiters can override stage gates.');
            if ((opts.reason?.trim().length ?? 0) < 10) return fail('Explain the override (10+ characters). It’s written to the audit trail.');
            override = true;
            audit({ action: 'pipeline.gate.override', target, detail: `Skipped: ${missing.join(', ')} · “${opts.reason!.trim()}”`, severity: 'warning' });
          }
          advance(a, to, g.v.userId, override ? opts.reason : opts.note, override);
          if (to === 'interview') notify([r.hiringManagerId], { title: `${c.name} advanced to interviews`, body: `${r.title} · schedule the loop.`, link: '/talent/pipeline' });
          if (to === 'final') notify([r.hiringManagerId], { title: `Debrief: decide on ${c.name}`, body: `${r.title} · all interview feedback is in.`, link: '/talent/pipeline' });
          if (to === 'offer') notify([r.recruiterId], { title: `Prepare an offer for ${c.name}`, body: r.title, link: '/talent/offers' });
          return ok(`${first(c.name)} moved to ${STAGE_BY_ID[to].label}`);
        },

        rejectApplication(applicationId, reason, note) {
          const a = appOf(applicationId);
          const r = a ? reqOf(a.requisitionId) : undefined;
          const c = a ? candOf(a.candidateId) : undefined;
          const g = guard('pipeline.rejected', c?.name ?? applicationId, (v) => (a && r ? access.canManage(v) || access.canMoveApplication(v, a, r).ok : false));
          if ('error' in g) return g.error;
          if (!a || !r || !c) return fail('Application not found.');
          if (a.status !== 'active') return fail('Already closed.');
          const now = Date.now();
          const withdrew = reason === 'candidate-withdrew';
          patch('applications', applicationId, (x) => ({ ...x, status: withdrew ? 'withdrawn' : 'rejected', rejection: { reason, note: note?.trim() || undefined, by: g.v.userId, at: now }, updatedAt: now }));
          for (const o of get().offers.filter((x) => x.applicationId === applicationId && ACTIVE_OFFER.includes(x.status)))
            patch('offers', o.id, (x) => ({ ...x, status: 'rescinded', note: `Auto-rescinded: ${REJECTION_LABEL[reason]}` }));
          for (const i of get().interviews.filter((x) => x.applicationId === applicationId && x.status === 'scheduled' && x.scheduledAt > now))
            patch('interviews', i.id, (x) => ({ ...x, status: 'cancelled' }));
          log({ kind: 'rejected', text: `${c.name} ${withdrew ? 'withdrew' : 'closed out'}: ${REJECTION_LABEL[reason]}${note ? ` (“${note.trim()}”)` : ''}`, candidateId: c.id, applicationId, requisitionId: r.id });
          audit({ action: withdrew ? 'pipeline.withdrawn' : 'pipeline.rejected', target: `${c.name} · ${r.title}`, detail: REJECTION_LABEL[reason] });
          if (g.v.userId !== r.recruiterId) notify([r.recruiterId], { title: `${c.name} closed out`, body: `${r.title} · ${REJECTION_LABEL[reason]} by ${userName(g.v.userId)}.`, link: '/talent/pipeline' });
          return ok(withdrew ? `${first(c.name)} marked as withdrawn` : `${first(c.name)} closed out. Send a kind note.`);
        },

        reopenApplication(applicationId) {
          const a = appOf(applicationId);
          const c = a ? candOf(a.candidateId) : undefined;
          const g = guard('pipeline.reopened', c?.name ?? applicationId, (v) => access.canManage(v));
          if ('error' in g) return g.error;
          if (!a || !c) return fail('Application not found.');
          if (a.status === 'active' || a.status === 'hired') return fail('This application is already active.');
          patch('applications', applicationId, (x) => ({ ...x, status: 'active', rejection: undefined, updatedAt: Date.now() }));
          log({ kind: 'stage', text: `${c.name} reopened in ${STAGE_BY_ID[a.stage].label}`, candidateId: c.id, applicationId, requisitionId: a.requisitionId });
          return ok(`${first(c.name)} is back in the pipeline`);
        },

        recordDecision(applicationId, verdict, note) {
          const a = appOf(applicationId);
          const r = a ? reqOf(a.requisitionId) : undefined;
          const c = a ? candOf(a.candidateId) : undefined;
          const g = guard('pipeline.decision', c?.name ?? applicationId, (v) => (r ? access.canRecordDecision(v, r) : false));
          if ('error' in g) return g.error;
          if (!a || !r || !c) return fail('Application not found.');
          if (a.status !== 'active') return fail('This application is closed.');
          if (a.stage !== 'final') return fail('Decisions are recorded at the Debrief stage.');
          if (verdict === 'no-hire' && (note?.trim().length ?? 0) < 10) return fail('Add a short rationale (10+ characters) for a no-hire decision.');
          const now = Date.now();
          patch('applications', applicationId, (x) => ({ ...x, decision: { verdict, by: g.v.userId, at: now, note: note?.trim() || undefined }, updatedAt: now }));
          log({ kind: 'decision', text: `Hire decision for ${c.name}: ${verdict === 'hire' ? 'Hire ✅' : 'No hire'}`, candidateId: c.id, applicationId, requisitionId: r.id });
          audit({ action: 'pipeline.decision', target: `${c.name} · ${r.title}`, detail: `${verdict}${note ? ` · ${note.trim().slice(0, 80)}` : ''}` });
          notify([r.recruiterId, r.hiringManagerId], {
            title: verdict === 'hire' ? `Hire decision: ${c.name} ✅` : `No-hire: ${c.name}`,
            body: verdict === 'hire' ? `${r.title}. Draft the offer next.` : `${r.title}. Please close out kindly.`,
            link: verdict === 'hire' ? '/talent/offers' : '/talent/pipeline',
          });
          if (verdict === 'hire') autoAdvance(applicationId, 'offer', g.v.userId, 'hire decision recorded');
          return ok(verdict === 'hire' ? `Hire decision recorded for ${first(c.name)}` : 'No-hire recorded');
        },

        // ───────────────────────── outreach ─────────────────────────
        logOutreach(input) {
          const c = candOf(input.candidateId);
          const g = guard('outreach.logged', c?.name ?? input.candidateId, (v) => access.canSource(v) || access.canManage(v));
          if ('error' in g) return g.error;
          if (!c) return fail('Candidate not found.');
          if (c.status === 'do-not-contact') return fail(`${c.name} asked not to be contacted.`);
          const body = input.body.trim();
          const meta = CHANNEL_META[input.channel];
          if (body.length < 20) return fail('The message is too short.');
          if (body.length > meta.limit) return fail(`${meta.label} is limited to ${meta.limit.toLocaleString()} characters (${body.length.toLocaleString()} now).`);
          if (meta.subjectLimit && (input.subject?.length ?? 0) > meta.subjectLimit) return fail(`Subject is limited to ${meta.subjectLimit} characters.`);
          const now = Date.now();
          const step = input.step ?? 1;
          const id = uid('o');
          const o: Outreach = {
            id,
            candidateId: c.id,
            requisitionId: input.requisitionId,
            channel: input.channel,
            tone: input.tone,
            subject: meta.subjectLimit ? input.subject?.trim() : undefined,
            body,
            step,
            status: input.status,
            engine: input.engine,
            createdBy: g.v.userId,
            createdAt: now,
            sentAt: input.status === 'sent' ? now : undefined,
            followUpAt: input.status === 'sent' && step < 3 ? now + (FOLLOW_UP_DAYS[(step + 1) as 2 | 3] - FOLLOW_UP_DAYS[step]) * DAY : undefined,
          };
          put('outreach', o);
          if (input.status === 'sent') {
            // Earlier messages in the sequence are superseded by the follow-up.
            for (const prev of get().outreach.filter((x) => x.id !== id && x.candidateId === c.id && x.requisitionId === input.requisitionId && x.status === 'sent'))
              patch('outreach', prev.id, (x) => ({ ...x, followUpAt: undefined, status: step > 1 ? 'no-response' : x.status }));
            patch('candidates', c.id, (x) => ({ ...x, lastContactedAt: now, updatedAt: now }));
            log({ kind: 'outreach', text: `${meta.short}${step > 1 ? ` follow-up #${step - 1}` : ''} sent to ${c.name}`, candidateId: c.id, requisitionId: input.requisitionId ?? undefined });
            const a = input.requisitionId ? get().applications.find((x) => x.candidateId === c.id && x.requisitionId === input.requisitionId && x.status === 'active') : undefined;
            if (a?.stage === 'sourced') autoAdvance(a.id, 'contacted', g.v.userId, 'outreach sent');
          }
          return { ...ok(input.status === 'sent' ? `Logged as sent to ${first(c.name)}` : 'Draft saved'), id };
        },

        updateOutreachStatus(id, status) {
          const o = get().outreach.find((x) => x.id === id);
          const c = o ? candOf(o.candidateId) : undefined;
          const g = guard('outreach.status', c?.name ?? id, (v) => access.canSource(v) || access.canManage(v));
          if ('error' in g) return g.error;
          if (!o || !c) return fail('Message not found.');
          const now = Date.now();
          const replied = status === 'replied' || status === 'interested' || status === 'not-interested';
          patch('outreach', id, (x) => ({ ...x, status, respondedAt: replied ? now : x.respondedAt, sentAt: status === 'sent' ? x.sentAt ?? now : x.sentAt, followUpAt: replied ? undefined : x.followUpAt }));
          if (replied) log({ kind: 'reply', text: `${c.name} replied: ${status === 'interested' ? 'interested 🙌' : status === 'not-interested' ? 'not interested' : 'replied'}`, candidateId: c.id, requisitionId: o.requisitionId ?? undefined });
          if (status === 'interested' && o.requisitionId) {
            const a = get().applications.find((x) => x.candidateId === c.id && x.requisitionId === o.requisitionId && x.status === 'active');
            if (a?.stage === 'sourced') autoAdvance(a.id, 'contacted', g.v.userId, 'reply received');
            const again = a ? appOf(a.id) : undefined;
            if (again?.stage === 'contacted') autoAdvance(again.id, 'applied', g.v.userId, 'interest + consent recorded');
          }
          return ok(status === 'interested' ? `${first(c.name)} is interested 🎉` : 'Status updated');
        },

        // ───────────────────────── interviews ─────────────────────────
        scheduleInterview(input) {
          const a = appOf(input.applicationId);
          const r = a ? reqOf(a.requisitionId) : undefined;
          const c = a ? candOf(a.candidateId) : undefined;
          const g = guard('interview.scheduled', c?.name ?? input.applicationId, (v) => (r ? access.canScheduleInterview(v, r) : false));
          if ('error' in g) return g.error;
          if (!a || !r || !c) return fail('Application not found.');
          if (a.status !== 'active') return fail('This application is closed.');
          if (!input.interviewerIds.length) return fail('Add at least one interviewer.');
          const users = hub().users;
          if (input.interviewerIds.some((id) => !users.some((u) => u.id === id && u.active))) return fail('All interviewers must be active colleagues.');
          if (input.scheduledAt < Date.now() - 5 * 60_000) return fail('Pick a time in the future.');
          if (input.durationMins < 15 || input.durationMins > 240) return fail('Interviews run 15–240 minutes.');
          const clash = get().interviews.find(
            (i) =>
              i.status === 'scheduled' &&
              i.interviewerIds.some((id) => input.interviewerIds.includes(id)) &&
              input.scheduledAt < i.scheduledAt + i.durationMins * 60_000 &&
              i.scheduledAt < input.scheduledAt + input.durationMins * 60_000,
          );
          if (clash) {
            const who = clash.interviewerIds.find((id) => input.interviewerIds.includes(id));
            return fail(`${userName(who)} already has an interview at that time.`);
          }
          const step = r.interviewPlan.find((p) => p.kind === input.kind);
          const id = uid('iv');
          const iv: Interview = {
            id,
            applicationId: a.id,
            candidateId: c.id,
            requisitionId: r.id,
            kind: input.kind,
            title: input.title?.trim() || step?.label || STAGE_BY_ID.interview.label,
            scheduledAt: input.scheduledAt,
            durationMins: input.durationMins,
            interviewerIds: input.interviewerIds,
            location: input.location.trim() || 'Google Meet',
            status: 'scheduled',
            createdBy: g.v.userId,
            createdAt: Date.now(),
          };
          put('interviews', iv);
          const when = new Date(input.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          log({ kind: 'interview', text: `${iv.title} scheduled with ${c.name} · ${when}`, candidateId: c.id, applicationId: a.id, requisitionId: r.id });
          notify(input.interviewerIds, { title: `Interview: ${c.name}`, body: `${iv.title} · ${when} · ${iv.location}`, link: '/talent/interviews' });
          if (input.kind === 'screen' && a.stage === 'applied') autoAdvance(a.id, 'screen', g.v.userId, 'screen scheduled');
          return { ...ok(`${iv.title} scheduled · ${when}`), id };
        },

        updateInterview(id, changes) {
          const iv = get().interviews.find((x) => x.id === id);
          const r = iv ? reqOf(iv.requisitionId) : undefined;
          const c = iv ? candOf(iv.candidateId) : undefined;
          const g = guard('interview.updated', c?.name ?? id, (v) => (r ? access.canScheduleInterview(v, r) : false));
          if ('error' in g) return g.error;
          if (!iv || !c) return fail('Interview not found.');
          patch('interviews', id, (x) => ({ ...x, ...changes }));
          if (changes.status === 'cancelled') {
            log({ kind: 'interview', text: `${iv.title} with ${c.name} cancelled`, candidateId: c.id, applicationId: iv.applicationId, requisitionId: iv.requisitionId });
            notify(iv.interviewerIds, { title: `Cancelled: ${c.name}`, body: iv.title, link: '/talent/interviews' });
            return ok('Interview cancelled');
          }
          if (changes.scheduledAt && changes.scheduledAt !== iv.scheduledAt)
            notify(changes.interviewerIds ?? iv.interviewerIds, {
              title: `Rescheduled: ${c.name}`,
              body: `${iv.title} · ${new Date(changes.scheduledAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`,
              link: '/talent/interviews',
            });
          return ok('Interview updated');
        },

        submitScorecard(input) {
          const iv = get().interviews.find((x) => x.id === input.interviewId);
          const c = iv ? candOf(iv.candidateId) : undefined;
          const g = guard('scorecard.submitted', c?.name ?? input.interviewId, (v) => (iv ? access.canSubmitScorecard(v, iv) : false));
          if ('error' in g) return g.error;
          if (!iv || !c) return fail('Interview not found.');
          const values = Object.values(input.ratings);
          if (!values.length || values.some((x) => x < 1 || x > 4)) return fail('Rate every competency from 1 to 4.');
          if (input.notes.trim().length < 15) return fail('Add evidence for your rating (15+ characters).');
          const now = Date.now();
          const existing = get().scorecards.find((s) => s.interviewId === iv.id && s.interviewerId === g.v.userId);
          const sc: Scorecard = {
            id: existing?.id ?? uid('sc'),
            interviewId: iv.id,
            applicationId: iv.applicationId,
            interviewerId: g.v.userId,
            ratings: input.ratings,
            recommendation: input.recommendation,
            notes: input.notes.trim(),
            submittedAt: now,
          };
          put('scorecards', sc);
          if (iv.status === 'scheduled') patch('interviews', iv.id, (x) => ({ ...x, status: 'completed' }));
          log({ kind: 'scorecard', text: `${userName(g.v.userId)} submitted a scorecard for ${c.name}: ${input.recommendation.replace('-', ' ')}`, candidateId: c.id, applicationId: iv.applicationId, requisitionId: iv.requisitionId });
          const r = reqOf(iv.requisitionId);
          if (r) {
            notify([r.recruiterId, r.hiringManagerId], { title: `Scorecard in: ${c.name}`, body: `${iv.title} · ${userName(g.v.userId)} → ${input.recommendation.replace('-', ' ')}`, link: '/talent/pipeline' });
            const a = appOf(iv.applicationId);
            if (a?.stage === 'interview' && gateFor(a, 'final', gateCtx(a)).ok)
              notify([r.hiringManagerId, r.recruiterId], { title: `Ready for debrief: ${c.name}`, body: `${r.title} · interview loop complete.`, link: '/talent/pipeline' });
          }
          return { ...ok(existing ? 'Scorecard updated' : 'Scorecard submitted. Thank you!'), id: sc.id };
        },

        // ───────────────────────── offers ─────────────────────────
        draftOffer(input) {
          const a = appOf(input.applicationId);
          const r = a ? reqOf(a.requisitionId) : undefined;
          const c = a ? candOf(a.candidateId) : undefined;
          const g = guard('offer.drafted', c?.name ?? input.applicationId, (v) => access.canDraftOffer(v));
          if ('error' in g) return g.error;
          if (!a || !r || !c) return fail('Application not found.');
          if (a.status !== 'active') return fail('This application is closed.');
          if (a.stage !== 'offer' && !(a.stage === 'final' && a.decision?.verdict === 'hire')) return fail('Offers follow a recorded hire decision.');
          if (get().offers.some((o) => o.applicationId === a.id && ACTIVE_OFFER.includes(o.status))) return fail('There’s already an active offer for this candidate.');
          if (!(input.baseSalary > 0)) return fail('Enter the base salary.');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return fail('Pick a start date.');
          const outOfBand = r.salary && r.salary.currency === input.currency && (input.baseSalary < r.salary.min || input.baseSalary > r.salary.max);
          if (outOfBand && (input.note?.trim().length ?? 0) < 10) return fail(`Out-of-band offer (${r.salary!.min.toLocaleString()}–${r.salary!.max.toLocaleString()} ${r.salary!.currency}) needs a justification note.`);
          if (a.stage === 'final') advance(a, 'offer', g.v.userId, 'Offer drafted');
          const now = Date.now();
          const id = uid('of');
          const offer: Offer = {
            id,
            applicationId: a.id,
            candidateId: c.id,
            requisitionId: r.id,
            title: input.title?.trim() || r.title,
            band: input.band || r.band,
            baseSalary: Math.round(input.baseSalary),
            currency: input.currency,
            bonusPct: input.bonusPct,
            equity: input.equity.trim() || '—',
            signOnBonus: Math.max(0, Math.round(input.signOnBonus)),
            startDate: input.startDate,
            expiresAt: now + Math.max(1, input.expiresInDays) * DAY,
            status: 'draft',
            approvals: [
              { step: 'hiring-manager', decision: 'pending' },
              { step: 'people-ops', decision: 'pending' },
            ],
            createdBy: g.v.userId,
            createdAt: now,
            note: input.note?.trim() || undefined,
          };
          put('offers', offer);
          log({ kind: 'offer', text: `Offer drafted for ${c.name}${outOfBand ? ' (out of band)' : ''}`, candidateId: c.id, applicationId: a.id, requisitionId: r.id });
          audit({ action: 'offer.drafted', target: `${c.name} · ${r.title}`, detail: `${offer.band}${outOfBand ? ' · OUT OF BAND' : ''}`, severity: outOfBand ? 'warning' : 'info' });
          if (input.submit !== false) {
            const res = get().submitOffer(id);
            return res.ok ? { ...ok('Offer drafted and routed for approval'), id } : { ...res, id };
          }
          return { ...ok('Offer saved as draft'), id };
        },

        updateOffer(id, changes) {
          const o = get().offers.find((x) => x.id === id);
          const g = guard('offer.updated', o ? candOf(o.candidateId)?.name ?? id : id, (v) => access.canDraftOffer(v));
          if ('error' in g) return g.error;
          if (!o) return fail('Offer not found.');
          if (o.status !== 'draft') return fail('Only draft offers can be edited.');
          patch('offers', id, (x) => ({ ...x, ...changes }));
          return ok('Offer updated');
        },

        submitOffer(id) {
          const o = get().offers.find((x) => x.id === id);
          const r = o ? reqOf(o.requisitionId) : undefined;
          const c = o ? candOf(o.candidateId) : undefined;
          const g = guard('offer.submitted', c?.name ?? id, (v) => access.canDraftOffer(v));
          if ('error' in g) return g.error;
          if (!o || !r || !c) return fail('Offer not found.');
          if (o.status !== 'draft') return fail('Only drafts can be submitted.');
          const next = patch('offers', id, (x) => ({
            ...x,
            status: 'pending-approval',
            approvals: x.approvals.map((ap) => ({ step: ap.step, decision: 'pending' as const })),
          }));
          if (next) for (const step of ['hiring-manager', 'people-ops'] as ApprovalStep[])
            notify(reviewersFor(next, r, step), { title: `Offer approval: ${c.name}`, body: `${APPROVAL_STEP_LABEL[step]} sign-off · ${r.title}`, link: '/talent/offers' });
          log({ kind: 'offer', text: `Offer for ${c.name} routed for approval`, candidateId: c.id, applicationId: o.applicationId, requisitionId: r.id });
          audit({ action: 'offer.submitted', target: `${c.name} · ${r.title}` });
          return ok('Routed to the hiring manager and People Ops');
        },

        decideOffer(id, step, decision, note) {
          const o = get().offers.find((x) => x.id === id);
          const r = o ? reqOf(o.requisitionId) : undefined;
          const c = o ? candOf(o.candidateId) : undefined;
          const target = `${c?.name ?? id} · ${APPROVAL_STEP_LABEL[step]}`;
          const g = guard(`offer.${decision}`, target, (v) => (o && r ? access.canApproveOfferStep(v, o, r, step) : false));
          if ('error' in g) return g.error;
          if (!o || !r || !c) return fail('Offer not found.');
          if (decision === 'rejected' && (note?.trim().length ?? 0) < 5) return fail('Tell the recruiter why (5+ characters).');
          const now = Date.now();
          const approvals = o.approvals.map((ap) => (ap.step === step ? { ...ap, approverId: g.v.userId, decision, at: now, note: note?.trim() || undefined } : ap));
          const allApproved = approvals.every((ap) => ap.decision === 'approved');
          const status: Offer['status'] = decision === 'rejected' ? 'draft' : allApproved ? 'approved' : 'pending-approval';
          patch('offers', id, (x) => ({ ...x, approvals: decision === 'rejected' ? approvals.map((ap) => (ap.step === step ? ap : { ...ap })) : approvals, status }));
          audit({ action: `offer.${decision}`, target: `${c.name} · ${r.title}`, detail: `${APPROVAL_STEP_LABEL[step]}${note ? ` · ${note.trim()}` : ''}`, severity: 'warning' });
          log({ kind: 'offer', text: `${APPROVAL_STEP_LABEL[step]} ${decision === 'approved' ? 'approved' : 'returned'} the offer for ${c.name}`, candidateId: c.id, applicationId: o.applicationId, requisitionId: r.id });
          if (decision === 'rejected') notify([o.createdBy, r.recruiterId], { title: `Offer returned: ${c.name}`, body: `${userName(g.v.userId)}: “${note?.trim()}”`, link: '/talent/offers' });
          else if (allApproved) notify([o.createdBy, r.recruiterId, r.hiringManagerId], { title: `Offer approved: ${c.name} ✅`, body: 'All approvals in. Ready to send.', link: '/talent/offers' });
          return ok(decision === 'rejected' ? 'Returned to the recruiter' : allApproved ? 'Approved. Ready to send!' : 'Approved. Waiting on the other approver');
        },

        sendOffer(id) {
          const o = get().offers.find((x) => x.id === id);
          const r = o ? reqOf(o.requisitionId) : undefined;
          const c = o ? candOf(o.candidateId) : undefined;
          const g = guard('offer.sent', c?.name ?? id, (v) => access.canDraftOffer(v));
          if ('error' in g) return g.error;
          if (!o || !r || !c) return fail('Offer not found.');
          if (o.status !== 'approved') return fail('Offers need both approvals before sending.');
          const now = Date.now();
          patch('offers', id, (x) => ({ ...x, status: 'sent', sentAt: now, expiresAt: x.expiresAt > now + DAY ? x.expiresAt : now + 7 * DAY }));
          log({ kind: 'offer', text: `Offer sent to ${c.name} ✉️`, candidateId: c.id, applicationId: o.applicationId, requisitionId: r.id });
          audit({ action: 'offer.sent', target: `${c.name} · ${r.title}` });
          notify([r.hiringManagerId], { title: `Offer sent to ${c.name}`, body: r.title, link: '/talent/offers' });
          return ok(`Offer sent to ${first(c.name)}`);
        },

        recordOfferResponse(id, response, note) {
          const o = get().offers.find((x) => x.id === id);
          const r = o ? reqOf(o.requisitionId) : undefined;
          const c = o ? candOf(o.candidateId) : undefined;
          const g = guard(`offer.${response}`, c?.name ?? id, (v) => access.canManage(v));
          if ('error' in g) return g.error;
          if (!o || !r || !c) return fail('Offer not found.');
          if (o.status !== 'sent') return fail('Only sent offers can be accepted or declined.');
          const now = Date.now();
          patch('offers', id, (x) => ({ ...x, status: response, respondedAt: now, note: note?.trim() || x.note }));
          if (response === 'declined') {
            log({ kind: 'offer', text: `${c.name} declined the offer${note ? `: ${note.trim()}` : ''}`, candidateId: c.id, applicationId: o.applicationId, requisitionId: r.id });
            audit({ action: 'offer.declined', target: `${c.name} · ${r.title}`, detail: note?.trim() });
            notify([r.hiringManagerId], { title: `${c.name} declined`, body: note?.trim() || r.title, link: '/talent/offers' });
            return ok('Recorded as declined');
          }
          // Accepted: hire, fill the seat, hand off to HR Portal.
          const a = appOf(o.applicationId);
          if (a) {
            const hiredAt = now;
            patch('applications', a.id, (x) => ({
              ...x,
              stage: 'hired',
              status: 'hired',
              stageEnteredAt: hiredAt,
              updatedAt: hiredAt,
              history: [...x.history, { stage: 'hired' as StageId, at: hiredAt, by: g.v.userId, note: 'Offer accepted' }],
            }));
          }
          const hires = r.hires + 1;
          patch('requisitions', r.id, (x) => ({ ...x, hires, status: hires >= x.headcount ? 'filled' : x.status, closedAt: hires >= x.headcount ? now : x.closedAt }));
          log({ kind: 'hired', text: `${c.name} accepted the offer 🎉`, candidateId: c.id, applicationId: o.applicationId, requisitionId: r.id });
          audit({ action: 'offer.accepted', target: `${c.name} · ${r.title}`, detail: `Start ${o.startDate}` });
          notify([r.hiringManagerId, r.recruiterId], { title: `${c.name} accepted! 🎉`, body: `${r.title} · starts ${o.startDate}.`, link: '/talent/pipeline' });
          const journey = a ? createJourney({ ...a, stage: 'hired', status: 'hired' }, g.v.userId, { ...o, status: 'accepted' }) : null;
          return { ...ok(`${first(c.name)} is hired. Onboarding handed to HR Portal`), journeyId: journey?.id };
        },

        rescindOffer(id, note) {
          const o = get().offers.find((x) => x.id === id);
          const c = o ? candOf(o.candidateId) : undefined;
          const g = guard('offer.rescinded', c?.name ?? id, (v) => access.canManage(v));
          if ('error' in g) return g.error;
          if (!o || !c) return fail('Offer not found.');
          if (!ACTIVE_OFFER.includes(o.status)) return fail('This offer is no longer active.');
          if ((note?.trim().length ?? 0) < 5) return fail('Add a reason (5+ characters).');
          patch('offers', id, (x) => ({ ...x, status: 'rescinded', note: note?.trim() }));
          audit({ action: 'offer.rescinded', target: c.name, detail: note?.trim(), severity: 'warning' });
          log({ kind: 'offer', text: `Offer for ${c.name} rescinded: ${note?.trim()}`, candidateId: c.id, applicationId: o.applicationId, requisitionId: o.requisitionId });
          return ok('Offer rescinded');
        },

        // ───────────────────────── onboarding (HR Portal) ─────────────────────────
        handOffToHR(applicationId) {
          const a = appOf(applicationId);
          const c = a ? candOf(a.candidateId) : undefined;
          const g = guard('onboarding.handoff', c?.name ?? applicationId, (v) => access.canManage(v) || access.canManageOnboarding(v));
          if ('error' in g) return g.error;
          if (!a || !c) return fail('Application not found.');
          if (a.status !== 'hired') return fail('Only hired candidates can be handed off.');
          const j = createJourney(a, g.v.userId);
          return j ? { ...ok(`${first(c.name)}’s onboarding journey is live in HR Portal`), journeyId: j.id } : fail('Could not create the journey.');
        },

        toggleOnboardingTask(journeyId, taskId) {
          const j = get().onboarding.find((x) => x.id === journeyId);
          const t = j?.tasks.find((x) => x.id === taskId);
          const g = guard('onboarding.task', `${j?.name ?? journeyId} · ${t?.title ?? taskId}`, (v) => (j && t ? access.canToggleTask(v, j, t) : false), 'hr');
          if ('error' in g) return g.error;
          if (!j || !t) return fail('Task not found.');
          const now = Date.now();
          const next = patch('onboarding', journeyId, (x) => {
            const tasks = x.tasks.map((y) => (y.id === taskId ? { ...y, done: !y.done, doneAt: !y.done ? now : undefined, doneBy: !y.done ? g.v.userId : undefined } : y));
            const updated = { ...x, tasks };
            return { ...updated, status: deriveJourneyStatus(updated, now) };
          });
          if (next?.status === 'completed' && j.status !== 'completed') {
            notify([j.managerId, j.buddyId, ...holders('hr.onboarding.manage').map((u) => u.id)], { title: `Onboarding complete: ${j.name} 🎓`, body: 'Every step of the 90-day journey is done.', link: `/hr/onboarding/${j.id}` });
            audit({ action: 'onboarding.completed', target: j.name });
          }
          return ok(t.done ? 'Marked as not done' : 'Done ✓');
        },

        addOnboardingTask(journeyId, task) {
          const j = get().onboarding.find((x) => x.id === journeyId);
          const g = guard('onboarding.task.added', j?.name ?? journeyId, (v) => (j ? access.canManageOnboarding(v) || j.managerId === v.userId : false), 'hr');
          if ('error' in g) return g.error;
          if (!j) return fail('Journey not found.');
          if (task.title.trim().length < 3) return fail('Describe the task.');
          const newTask: OnboardingTask = { id: uid('t'), ...task, title: task.title.trim(), done: false };
          patch('onboarding', journeyId, (x) => ({ ...x, tasks: [...x.tasks, newTask], status: x.status === 'completed' ? deriveJourneyStatus({ ...x, tasks: [...x.tasks, newTask] }) : x.status }));
          return ok('Task added');
        },

        assignBuddy(journeyId, userId) {
          const j = get().onboarding.find((x) => x.id === journeyId);
          const g = guard('onboarding.buddy', j?.name ?? journeyId, (v) => (j ? access.canManageOnboarding(v) || j.managerId === v.userId : false), 'hr');
          if ('error' in g) return g.error;
          if (!j) return fail('Journey not found.');
          const buddy = hub().users.find((u) => u.id === userId && u.active);
          if (!buddy) return fail('Pick an active colleague.');
          if (buddy.id === j.hubUserId) return fail('The new hire can’t be their own buddy.');
          if (buddy.id === j.managerId) return fail('Pick someone other than the manager. Buddies are peers.');
          const now = Date.now();
          patch('onboarding', journeyId, (x) => ({
            ...x,
            buddyId: buddy.id,
            tasks: x.tasks.map((t) => (t.title.startsWith('Assign an onboarding buddy') && !t.done ? { ...t, done: true, doneAt: now, doneBy: g.v.userId } : t)),
          }));
          notify([buddy.id], { title: 'You’re an onboarding buddy 🤝', body: `${userName(g.v.userId)} paired you with ${j.name} (${j.title}), starting ${j.startDate}.`, link: `/hr/onboarding/${j.id}` });
          return ok(`${first(buddy.name)} is ${first(j.name)}’s buddy`);
        },

        updateJourney(journeyId, changes) {
          const j = get().onboarding.find((x) => x.id === journeyId);
          const g = guard('onboarding.updated', j?.name ?? journeyId, (v) => (j ? access.canManageOnboarding(v) || (j.managerId === v.userId && !changes.startDate && !changes.location) : false), 'hr');
          if ('error' in g) return g.error;
          if (!j) return fail('Journey not found.');
          if (changes.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(changes.startDate)) return fail('Use a valid start date.');
          patch('onboarding', journeyId, (x) => {
            const updated = { ...x, ...changes };
            return { ...updated, status: deriveJourneyStatus(updated) };
          });
          if (changes.startDate && changes.startDate !== j.startDate)
            notify([j.managerId, j.buddyId], { title: `New start date: ${j.name}`, body: `Day one moved to ${changes.startDate}.`, link: `/hr/onboarding/${j.id}` });
          return ok('Journey updated');
        },

        provisionHubAccount(journeyId) {
          const j = get().onboarding.find((x) => x.id === journeyId);
          const g = guard('onboarding.provision', j?.name ?? journeyId, (v) => access.canManageOnboarding(v), 'hr');
          if ('error' in g) return g.error;
          if (!j) return fail('Journey not found.');
          if (j.hubUserId) return fail(`${j.name} already has a NEXUS account.`);
          const c = candOf(j.candidateId);
          const res = hub().provisionUser({
            name: j.name,
            title: j.title,
            department: j.department,
            location: j.location,
            managerId: j.managerId,
            startDate: j.startDate,
            avatarHue: j.avatarHue,
            skills: c?.skills ?? [],
          });
          if (!res.ok) return fail(res.error);
          const now = Date.now();
          patch('onboarding', journeyId, (x) => ({
            ...x,
            hubUserId: res.userId,
            workEmail: res.email,
            tasks: x.tasks.map((t) => (t.owner === 'it' && t.title.startsWith('Provision NEXUS account') && !t.done ? { ...t, done: true, doneAt: now, doneBy: g.v.userId } : t)),
          }));
          return ok(`NEXUS account ready: ${res.email}`);
        },

        resetTalentDemo() {
          set(createTalentSeed());
        },
      };
    },
    {
      name: 'nexus-talent',
      version: TALENT_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): TalentData => ({
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
      migrate: (persisted, version) => (version === TALENT_DATA_VERSION ? (persisted as TalentData) : createTalentSeed()),
    },
  ),
);

let backendInit: Promise<void> | null = null;

const EMPTY_TALENT: Omit<TalentData, 'version'> = {
  requisitions: [],
  candidates: [],
  applications: [],
  interviews: [],
  scorecards: [],
  offers: [],
  outreach: [],
  onboarding: [],
  activity: [],
};

/**
 * Connect the configured backend once per session. With Firestore enabled the
 * remote `talenthub` database becomes the source of truth: the NEXUS session
 * follows the Google account's allowlist entry (`members/{email}`), and an
 * empty database starts empty, or is seeded with the demo data only when
 * VITE_TALENT_SEED_DEMO=true (staging / demos).
 */
export function initTalentBackend(): Promise<void> {
  backendInit ??= (async () => {
    const snapshot = (): TalentData => useTalent.getState();
    const backend = await connectTalentBackend(snapshot);
    if (backend.kind !== 'firestore' || !backend.pull) return;
    const id = backend.identity;
    const hubState = useHub.getState();
    if (id && hubState.sessionUserId !== id.hubUserId && hubState.users.some((u) => u.id === id.hubUserId)) hubState.login(id.hubUserId);
    const remote = await backend.pull();
    const hasData = TALENT_COLLECTIONS.some((c) => (remote[c] as unknown[] | undefined)?.length);
    if (hasData) useTalent.setState({ ...EMPTY_TALENT, ...remote } as Partial<TalentStore>);
    else if (SEED_DEMO_DATA) await backend.seed?.(snapshot());
    else useTalent.setState(EMPTY_TALENT as Partial<TalentStore>);
  })().catch((e) => console.error('[talenthub] backend init failed', e));
  return backendInit;
}
