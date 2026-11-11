/**
 * Talent Hub journey trackers — the shared NeoTracker ("pizza tracker") fed by
 * live store data, so everyone sees where a journey is, who is holding it and
 * what happens next:
 *
 *  - OfferTracker             Drafted → Approvals → Ready to send → With candidate → Signed
 *  - CandidateJourneyTracker  Acquire → Assess → Decide → Hired (the 8 stages grouped by phase)
 *  - ReqTracker               Drafted → Headcount approval → Sourcing & interviews → Offer → Filled
 *  - OnboardingTracker        Pre-boarding → Day one → First week → 30 → 60 → 90 days
 *
 * The `build*Track` functions are pure (people lookups are injected) and cheap
 * enough for compact list rows; the components wire in the store hooks.
 * Names, dates and quotes render in their own nodes so the copy around them
 * stays translatable. Couriers move on real data: approvals signed, share of
 * the offer window used, pipeline depth, onboarding tasks done.
 */
import { useMemo, type ReactNode } from 'react';
import {
  CalendarDays,
  FilePen,
  Flag,
  Gavel,
  Mail,
  MessagesSquare,
  PartyPopper,
  Radar,
  Rocket,
  Send,
  ShieldCheck,
  Signature,
  Sparkles,
  Sunrise,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import type { Application, Interview, Offer, OnboardingJourney, OnboardingPhase, OnboardingTask, Requisition, StagePhase } from '@/talent/types';
import {
  APPLICATION_STATUS_LABEL,
  APPROVAL_STEP_LABEL,
  OFFER_STATUS_META,
  OWNER_META,
  PHASE_META,
  PHASE_ORDER,
  REJECTION_LABEL,
  REQ_STATUS_META,
  STAGES,
  STAGE_BY_ID,
  STAGE_PHASES,
  stageIndex,
} from '@/talent/constants';
import { nextAction, type GateContext } from '@/talent/gates';
import { daysUntilStart, journeyProgress, parseISODate, taskDueDate } from '@/talent/onboarding';
import { useGateContext } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { usersWithPermission } from '@/lib/rbac';
import { pluralize, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { fmtDay, fmtRelativeDay } from './components/format';
import { DAY, expiryInfo, isActiveOffer } from './reqs/helpers';

// ───────────────────────── people ─────────────────────────
export interface TalentPeople {
  /** The viewer — "Waiting on you" beats "Waiting on Sara" when Sara is reading. */
  me?: string;
  /** First name of a hub user. */
  first: (id?: string | null) => string | undefined;
  /** Active People Ops offer approvers (viewer first), minus `exclude`. */
  offerPool: (exclude: (string | undefined)[]) => string[];
  /** Active recruiters who may approve headcount — never the hiring manager. */
  headcountPool: (hiringManagerId: string) => string[];
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

export function useTalentPeople(): TalentPeople {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const me = useSessionUser()?.id;
  return useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u]));
    // Resolved on first use only — most trackers never wait on an approver pool.
    const pools = new Map<string, string[]>();
    const holders = (perm: string) => {
      let ids = pools.get(perm);
      if (!ids) {
        ids = usersWithPermission(users, roles, perm)
          .filter((u) => u.active)
          .map((u) => u.id);
        pools.set(perm, ids);
      }
      return ids;
    };
    const meFirst = (ids: string[]) => (me && ids.includes(me) ? [me, ...ids.filter((id) => id !== me)] : ids);
    return {
      me,
      first: (id) => {
        const u = id ? byId.get(id) : undefined;
        return u ? firstOf(u.name) : undefined;
      },
      offerPool: (exclude) => meFirst(holders('talent.offers.approve').filter((id) => !exclude.includes(id))),
      headcountPool: (hm) => meFirst(holders('talent.manage').filter((id) => id !== hm)),
    };
  }, [users, roles, me]);
}

/** First name — or "you" for the viewer (only where the grammar allows: "Waiting on …"). */
const waitee = (id: string | undefined, p: TalentPeople) => (id && id === p.me ? 'you' : p.first(id));

/** "Sara" · "Sara or Daniel" · "Sara, Daniel or a colleague". */
function anyOf(ids: string[], p: TalentPeople): ReactNode {
  const named = ids.map((id) => waitee(id, p)).filter((n): n is string => !!n);
  if (!named.length) return null;
  return (
    <>
      <b>{named[0]}</b>
      {named.length === 2 && (
        <>
          {' or '}
          <b>{named[1]}</b>
        </>
      )}
      {named.length > 2 && (
        <>
          {', '}
          <b>{named[1]}</b>
          {' or a colleague'}
        </>
      )}
    </>
  );
}

/** "Sara" · "Sara and Omar" · "Sara, Omar and Lina". */
function allOf(ids: string[], p: TalentPeople): ReactNode {
  const named = [...new Set(ids)].map((id) => p.first(id)).filter((n): n is string => !!n);
  if (!named.length) return null;
  return named.map((n, i) => (
    <span key={`${n}-${i}`}>
      {i > 0 && (i === named.length - 1 ? ' and ' : ', ')}
      <b>{n}</b>
    </span>
  ));
}

// ───────────────────────── shared model ─────────────────────────
export interface TrackModel {
  steps: NeoTrackStep[];
  current: number;
  state: NeoTrackState;
  /** 0..1 courier position inside the live segment. */
  progress: number;
  message?: ReactNode;
  eta?: ReactNode;
  /** Status headline for the full tracker. */
  title?: ReactNode;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** Share of the window [from, to] already behind us. */
const elapsed = (from: number, to: number, now: number) => clamp01((now - from) / Math.max(1, to - from));
const shortDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const glyph = (Icon: LucideIcon) => <Icon aria-hidden="true" />;

// ───────────────────────── offers ─────────────────────────
const OFFER_STEPS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'draft', label: 'Draft', icon: FilePen },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'ready', label: 'Ready to send', icon: Send },
  { id: 'sent', label: 'With candidate', icon: Mail },
  { id: 'signed', label: 'Signed', icon: Signature },
];

/** Where an offer is — or where it stopped. `OFFER_STEPS.length` = signed. */
export function offerStageIndex(o: Offer): number {
  switch (o.status) {
    case 'draft':
      return o.approvals.some((a) => a.decision === 'rejected') ? 1 : 0;
    case 'pending-approval':
      return 1;
    case 'approved':
      return 2;
    case 'sent':
      return 3;
    case 'declined':
      return 4;
    case 'accepted':
      return OFFER_STEPS.length;
    case 'rescinded':
      return o.sentAt ? 3 : o.approvals.every((a) => a.decision === 'approved') ? 2 : o.approvals.some((a) => a.decision !== 'pending') ? 1 : 0;
  }
}

export interface OfferTrackInput {
  offer: Offer;
  req?: Requisition;
  /** Candidate's full name. */
  candName?: string;
  now: number;
  people: TalentPeople;
  compact?: boolean;
}

export function buildOfferTrack({ offer: o, req, candName, now, people: p, compact }: OfferTrackInput): TrackModel {
  const cand = candName ? firstOf(candName) : undefined;
  const drafter = p.first(o.createdBy);
  const hm = o.approvals.find((a) => a.step === 'hiring-manager');
  const po = o.approvals.find((a) => a.step === 'people-ops');
  const hmId = hm?.approverId ?? req?.hiringManagerId;
  const hmName = p.first(hmId);
  const signed = o.approvals.filter((a) => a.decision === 'approved');
  const signedAt = signed.reduce((m, a) => Math.max(m, a.at ?? 0), 0) || undefined;
  const pending = o.approvals.filter((a) => a.decision === 'pending');
  const returned = o.status === 'draft' ? o.approvals.find((a) => a.decision === 'rejected') : undefined;
  const returner = returned ? (p.first(returned.approverId) ?? APPROVAL_STEP_LABEL[returned.step]) : undefined;
  const exp = expiryInfo(o.expiresAt, now);
  const lapsed = o.status === 'sent' && exp.tone === 'expired';
  const terminal = o.status === 'declined' || o.status === 'rescinded';
  const live = offerStageIndex(o);
  const state: NeoTrackState = o.status === 'accepted' ? 'done' : terminal || returned || lapsed ? 'blocked' : 'active';
  const stepName = (a: { step: keyof typeof APPROVAL_STEP_LABEL }) => (a.step === 'hiring-manager' ? (hmName ?? APPROVAL_STEP_LABEL[a.step]) : APPROVAL_STEP_LABEL[a.step]);

  /** Who is holding each stage (shown next to the live label in compact rows). */
  const holder = [drafter, returner ?? (pending.map(stepName).join(' · ') || undefined), drafter, undefined, undefined];

  const steps: NeoTrackStep[] = OFFER_STEPS.map((s, i) => {
    const isLive = i === live;
    const done = i < live;
    let label = s.label;
    if (isLive && terminal) label = OFFER_STATUS_META[o.status].label;
    else if (isLive && returned) label = 'Returned';
    let sub: ReactNode;
    let at: ReactNode;
    switch (s.id) {
      case 'draft':
        sub = drafter;
        at = relativeTime(o.createdAt, now);
        break;
      case 'approvals':
        if (isLive && returned) {
          sub = returner;
          at = returned?.at ? relativeTime(returned.at, now) : undefined;
        } else if (done) {
          sub = signed.map((a) => p.first(a.approverId)).filter(Boolean).join(' · ') || undefined;
          at = signedAt ? relativeTime(signedAt, now) : undefined;
        } else if (isLive) {
          sub = pending.map(stepName).join(' · ');
          at = `${signed.length}/${o.approvals.length}`;
        } else sub = `${APPROVAL_STEP_LABEL['hiring-manager']} · ${APPROVAL_STEP_LABEL['people-ops']}`;
        break;
      case 'ready':
        sub = done || isLive ? drafter : undefined;
        at = (done || isLive) && signedAt ? relativeTime(signedAt, now) : undefined;
        break;
      case 'sent':
        sub = cand;
        at = o.sentAt ? relativeTime(o.sentAt, now) : undefined;
        break;
      case 'signed':
        sub = o.status === 'declined' ? cand : <>Starts {fmtDay(o.startDate)}</>;
        at = o.respondedAt && (o.status === 'accepted' || o.status === 'declined') ? relativeTime(o.respondedAt, now) : undefined;
        break;
    }
    if (compact && isLive && holder[i]) label = `${label} · ${holder[i]}`;
    return { id: s.id, label, icon: glyph(s.icon), sub, at };
  });

  const candEl = <b>{cand ?? 'the candidate'}</b>;
  const hmEl = <b>{waitee(hmId, p) ?? 'the hiring manager'}</b>;
  let message: ReactNode = null;
  let title = '';
  switch (o.status) {
    case 'draft':
      if (returned) {
        title = 'Needs changes';
        message = returned.note ? (
          <>
            <b>{returner}</b> sent it back: <q>{returned.note}</q>
          </>
        ) : (
          <>
            <b>{returner}</b> sent it back for changes
          </>
        );
      } else {
        title = 'Being drafted';
        message = (
          <>
            <b>{drafter ?? 'The recruiter'}</b> is putting the package together — next stop: approvals
          </>
        );
      }
      break;
    case 'pending-approval': {
      title = 'Waiting on approvals';
      const hmPending = hm?.decision === 'pending';
      const poPending = po?.decision === 'pending';
      const pool = poPending && !hmPending && !compact ? p.offerPool([o.createdBy, hm?.approverId]) : [];
      if (hmPending && poPending)
        message = (
          <>
            Waiting on {hmEl} and People Ops to sign off
          </>
        );
      else if (poPending)
        message = pool.length ? (
          <>
            <b>{hmName ?? 'The hiring manager'}</b> signed off — now with People Ops: {anyOf(pool, p)}
          </>
        ) : (
          <>
            <b>{hmName ?? 'The hiring manager'}</b> signed off — People Ops is checking the numbers
          </>
        );
      else
        message = (
          <>
            {po?.approverId ? (
              <>
                <b>{p.first(po.approverId)}</b> approved for People Ops
              </>
            ) : (
              'People Ops approved'
            )}{' '}
            — waiting on {hmEl} for the final nod
          </>
        );
      break;
    }
    case 'approved':
      title = 'Ready to send';
      message = (
        <>
          Both sign-offs are in — <b>{drafter ?? 'the recruiter'}</b> can send it to {candEl}
        </>
      );
      break;
    case 'sent':
      if (lapsed) {
        title = 'Signing window closed';
        message = (
          <>
            The signing window closed <span>{relativeTime(o.expiresAt, now)}</span> — time for <b>{drafter ?? 'the recruiter'}</b> to check in with {candEl}
          </>
        );
      } else {
        title = 'Out for signature';
        message = (
          <>
            The offer is with {candEl} — <b>{drafter ?? 'the recruiter'}</b> sent it <span>{relativeTime(o.sentAt ?? o.createdAt, now)}</span>
          </>
        );
      }
      break;
    case 'accepted':
      title = 'Signed — it’s a hire!';
      message = (
        <>
          {candEl} signed — day one is <span>{fmtDay(o.startDate)}</span>
        </>
      );
      break;
    case 'declined':
      title = 'Declined';
      message = o.note ? (
        <>
          {candEl} declined: <q>{o.note}</q>
        </>
      ) : (
        <>
          {candEl} declined the offer
        </>
      );
      break;
    case 'rescinded':
      title = 'Rescinded';
      message = o.note ? (
        <>
          Rescinded: <q>{o.note}</q>
        </>
      ) : (
        'The offer was rescinded'
      );
      break;
  }

  const progress =
    o.status === 'pending-approval'
      ? signed.length / Math.max(1, o.approvals.length)
      : o.status === 'sent'
        ? elapsed(o.sentAt ?? o.createdAt, o.expiresAt, now)
        : o.status === 'approved'
          ? elapsed(signedAt ?? o.createdAt, o.expiresAt, now)
          : o.status === 'draft'
            ? elapsed(o.createdAt, o.expiresAt, now)
            : 1;

  return {
    steps,
    current: live,
    state,
    progress,
    message,
    title,
    eta: o.status === 'accepted' ? <>Starts {fmtDay(o.startDate)}</> : terminal ? undefined : exp.label,
  };
}

// ───────────────────────── candidate journey ─────────────────────────
const PHASE_STEP: Record<StagePhase, { label: string; icon: LucideIcon }> = {
  Acquire: { label: 'Acquire', icon: Radar },
  Assess: { label: 'Assess', icon: MessagesSquare },
  Decide: { label: 'Decide', icon: Gavel },
  Onboard: { label: 'Hired', icon: PartyPopper },
};
/** Pipeline index of the first stage in each phase. */
const PHASE_START = STAGE_PHASES.map((ph) => stageIndex(STAGES.find((s) => s.phase === ph)!.id));

export interface JourneyTrackInput {
  app: Application;
  ctx: GateContext | null;
  now: number;
  people: TalentPeople;
  compact?: boolean;
}

export function buildJourneyTrack({ app, ctx, now, people: p, compact }: JourneyTrackInput): TrackModel {
  const req = ctx?.requisition;
  const hired = app.status === 'hired';
  const closed = app.status === 'rejected' || app.status === 'withdrawn';
  const stage = STAGE_BY_ID[app.stage];
  const phaseIdx = STAGE_PHASES.indexOf(stage.phase);
  const current = hired ? STAGE_PHASES.length : phaseIdx;
  const na = ctx && app.status === 'active' ? nextAction(app, ctx) : null;
  const onHold = app.status === 'active' && req?.status === 'on-hold';
  const offers = [...(ctx?.offers ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const accepted = offers.find((o) => o.status === 'accepted');
  const latest = offers[0];
  const offerModel =
    app.status === 'active' && app.stage === 'offer' && latest ? buildOfferTrack({ offer: latest, req, candName: ctx?.candidate.name, now, people: p, compact }) : null;

  const reachedAt = (minIdx: number) => app.history.filter((h) => stageIndex(h.stage) >= minIdx).reduce<number | undefined>((m, h) => (m === undefined || h.at < m ? h.at : m), undefined);

  const steps: NeoTrackStep[] = STAGE_PHASES.map((ph, i) => {
    const meta = PHASE_STEP[ph];
    const isLive = !hired && i === phaseIdx;
    const doneAt = i < current ? (i + 1 < STAGE_PHASES.length ? reachedAt(PHASE_START[i + 1]) : app.stageEnteredAt) : undefined;
    let label = isLive && closed ? APPLICATION_STATUS_LABEL[app.status] : meta.label;
    if (compact && isLive) label = `${label} · ${stage.label}`;
    const sub =
      ph === 'Onboard'
        ? accepted
          ? `Starts ${fmtDay(accepted.startDate)}`
          : undefined
        : isLive
          ? stage.label
          : STAGES.filter((s) => s.phase === ph)
              .map((s) => s.label)
              .join(' · ');
    return {
      id: ph,
      label,
      icon: glyph(isLive ? stage.icon : meta.icon),
      sub,
      at: isLive ? relativeTime(app.stageEnteredAt, now) : doneAt ? relativeTime(doneAt, now) : undefined,
    };
  });

  const blocked = closed || na?.kind === 'reject' || (offerModel?.state === 'blocked' && !hired);
  const state: NeoTrackState = hired ? 'done' : blocked ? 'blocked' : onHold || na?.kind === 'log-reply' ? 'paused' : 'active';

  // Courier: position inside the live phase (stage within phase + time used of its SLA,
  // or the offer's own progress once we are in the Offer stage).
  const inPhase = STAGES.filter((s) => s.phase === stage.phase);
  const pos = Math.max(0, inPhase.findIndex((s) => s.id === app.stage));
  const within =
    offerModel && latest
      ? clamp01((Math.min(offerStageIndex(latest), OFFER_STEPS.length - 1) + offerModel.progress) / OFFER_STEPS.length)
      : stage.slaDays
        ? Math.min(0.9, (now - app.stageEnteredAt) / (stage.slaDays * DAY))
        : 0.5;
  const progress = clamp01((pos + within) / inPhase.length);

  let eta: ReactNode;
  if (hired) eta = accepted ? `Starts ${fmtDay(accepted.startDate)}` : undefined;
  else if (offerModel && !blocked) eta = offerModel.eta;
  else if (app.status === 'active' && !onHold && !blocked && stage.slaDays) {
    const due = app.stageEnteredAt + stage.slaDays * DAY;
    eta = now > due ? `${Math.ceil((now - due) / DAY)}d past target` : `Target ${shortDay(due)}`;
  }

  return {
    steps,
    current,
    state,
    progress,
    eta,
    title: req?.title,
    message: compact ? undefined : journeyMessage({ app, ctx, na, req, onHold, offerModel, latest, now, p }),
  };
}

function journeyMessage({
  app,
  ctx,
  na,
  req,
  onHold,
  offerModel,
  latest,
  now,
  p,
}: {
  app: Application;
  ctx: GateContext | null;
  na: ReturnType<typeof nextAction> | null;
  req?: Requisition;
  onHold: boolean;
  offerModel: TrackModel | null;
  latest?: Offer;
  now: number;
  p: TalentPeople;
}): ReactNode {
  const stage = STAGE_BY_ID[app.stage];
  const cand = <b>{ctx ? firstOf(ctx.candidate.name) : 'The candidate'}</b>;
  const owner = <b>{p.first(app.ownerId) ?? p.first(req?.recruiterId) ?? 'the recruiter'}</b>;
  const hm = <b>{p.first(req?.hiringManagerId) ?? 'the hiring manager'}</b>;

  if (app.status === 'hired')
    return ctx?.handedOff ? (
      <>{cand} is hired — onboarding is live in HR Portal</>
    ) : (
      <>
        {cand} is hired — {owner} hands off to HR Portal next
      </>
    );
  if (app.status === 'withdrawn')
    return (
      <>
        {cand} withdrew at <b>{stage.label}</b>
      </>
    );
  if (app.status === 'rejected') {
    const why = app.rejection ? REJECTION_LABEL[app.rejection.reason] : undefined;
    return (
      <>
        Closed out at <b>{stage.label}</b>
        {why ? <>: {why}</> : null}
      </>
    );
  }
  if (onHold)
    return (
      <>
        The role is on hold — {cand} stays at <b>{stage.label}</b> until it reopens
      </>
    );
  if (!ctx || !na) return stage.description;

  const ivs = ctx.interviews.filter((i) => i.status !== 'cancelled');
  const screens = ivs.filter((i) => i.kind === 'screen');
  const loop = ivs.filter((i) => i.kind !== 'screen');
  const carded = new Set(ctx.scorecards.map((s) => `${s.interviewId}|${s.interviewerId}`));
  const owing = (list: Interview[]) =>
    list.filter((i) => i.status !== 'no-show' && i.scheduledAt + i.durationMins * 60_000 < now).flatMap((i) => i.interviewerIds.filter((id) => !carded.has(`${i.id}|${id}`)));
  const nextUp = (list: Interview[]) => list.filter((i) => i.status === 'scheduled' && i.scheduledAt > now).sort((a, b) => a.scheduledAt - b.scheduledAt)[0];

  switch (na.kind) {
    case 'outreach':
      return (
        <>
          {owner} is writing the first message to {cand}
        </>
      );
    case 'follow-up':
      return <>No reply yet — {owner} is sending a follow-up</>;
    case 'log-reply':
      return (
        <>
          Waiting on {cand} to reply to {owner}
        </>
      );
    case 'consent':
      return (
        <>
          {owner} is collecting consent from {cand}
        </>
      );
    case 'schedule-screen':
      return (
        <>
          {owner} is booking a recruiter screen with {cand}
        </>
      );
    case 'schedule-interview':
      return <>{owner} is booking the interview loop</>;
    case 'scorecard': {
      if (app.stage === 'screen') {
        const next = nextUp(screens);
        if (na.waiting && next)
          return (
            <>
              {cand} meets {allOf(next.interviewerIds, p) ?? owner} for the screen · <span>{fmtRelativeDay(next.scheduledAt, now)}</span>
            </>
          );
        const due = owing(screens);
        return due.length ? <>Screen done — waiting on {allOf(due, p)} for the scorecard</> : <>Screen done — the scorecard is due</>;
      }
      const next = nextUp(loop);
      if (na.waiting && next)
        return (
          <>
            Next up: <b>{next.title}</b> with {allOf(next.interviewerIds, p) ?? 'the panel'} · <span>{fmtRelativeDay(next.scheduledAt, now)}</span>
          </>
        );
      const due = owing(loop);
      return due.length ? <>Interviews done — waiting on {allOf(due, p)} for feedback</> : <>Interviews done — feedback is due</>;
    }
    case 'advance':
      if (app.stage === 'screen') return <>Screen passed — {owner} is lining up the interview loop</>;
      if (app.stage === 'interview') return <>Loop complete — {hm} runs the debrief</>;
      if (app.stage === 'offer') return 'Offer accepted — welcome aboard!';
      return na.to ? (
        <>
          Ready for <b>{STAGE_BY_ID[na.to].label}</b> — over to {owner}
        </>
      ) : (
        stage.description
      );
    case 'reject':
      if (app.stage === 'offer' && offerModel) return offerModel.message;
      if (app.stage === 'contacted') return <>{cand} isn’t interested right now — {owner} will close out kindly</>;
      if (app.stage === 'final') return <>{hm} decided not to hire — {owner} will close out kindly</>;
      return <>The screen didn’t recommend advancing — {owner} will close out kindly</>;
    case 'decision':
      return (
        <>
          Waiting on <b>{waitee(req?.hiringManagerId, p) ?? 'the hiring manager'}</b> to make the call after the debrief
        </>
      );
    case 'draft-offer':
      if (latest?.status === 'rescinded') return <>The last offer was rescinded — {owner} is preparing a new one</>;
      if (app.decision?.verdict === 'hire')
        return (
          <>
            It’s a yes from {hm}! {owner} is drafting the offer
          </>
        );
      return <>{owner} is drafting the offer</>;
    case 'submit-offer':
    case 'approve-offer':
    case 'send-offer':
    case 'record-response':
      return offerModel?.message ?? na.detail;
    default:
      return na.detail || stage.description;
  }
}

// ───────────────────────── requisitions ─────────────────────────
const REQ_STEPS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'draft', label: 'Draft', icon: FilePen },
  { id: 'approval', label: 'Headcount approval', icon: ShieldCheck },
  { id: 'sourcing', label: 'Sourcing & interviews', icon: Radar },
  { id: 'offer', label: 'Offer', icon: Signature },
  { id: 'filled', label: 'Filled', icon: PartyPopper },
];

export interface ReqTrackInput {
  req: Requisition;
  /** This requisition's applications. */
  apps: Application[];
  /** This requisition's offers. */
  offers: Offer[];
  candName: (id: string) => string | undefined;
  now: number;
  people: TalentPeople;
  /** Typical raised → approved time across requisitions (drives the approval courier). */
  typicalApprovalMs: number;
  /** Interviews booked from now on. */
  upcoming?: number;
  compact?: boolean;
}

export function buildReqTrack({ req, apps, offers, candName, now, people: p, typicalApprovalMs, upcoming = 0, compact }: ReqTrackInput): TrackModel {
  const active = apps.filter((a) => a.status === 'active');
  const activeOffer = offers.filter(isActiveOffer).sort((a, b) => b.createdAt - a.createdAt)[0];
  const offerCand = activeOffer ? candName(activeOffer.candidateId) : undefined;
  const offerFirst = offerCand ? firstOf(offerCand) : undefined;
  const current =
    req.status === 'draft' ? 0 : req.status === 'pending-approval' ? 1 : req.status === 'filled' ? REQ_STEPS.length : req.status === 'closed' ? (req.openedAt ? 2 : 0) : activeOffer ? 3 : 2;
  const state: NeoTrackState = req.status === 'filled' ? 'done' : req.status === 'closed' ? 'blocked' : req.status === 'on-hold' ? 'paused' : 'active';
  const creator = p.first(req.createdBy);
  const recruiter = p.first(req.recruiterId);
  const holder = [creator, undefined, `${active.length} active`, offerFirst, undefined];

  const steps: NeoTrackStep[] = REQ_STEPS.map((s, i) => {
    const isLive = i === current;
    const done = i < current;
    let label = s.label;
    if (isLive && req.status === 'closed') label = REQ_STATUS_META.closed.label;
    else if (isLive && compact && req.status === 'on-hold') label = REQ_STATUS_META['on-hold'].label;
    else if (isLive && compact && holder[i]) label = `${label} · ${holder[i]}`;
    let sub: ReactNode;
    let at: ReactNode;
    switch (s.id) {
      case 'draft':
        sub = creator;
        at = relativeTime(req.createdAt, now);
        break;
      case 'approval':
        sub = done ? p.first(req.approvedBy) : isLive ? REQ_STATUS_META['pending-approval'].label : undefined;
        at = done && req.openedAt ? relativeTime(req.openedAt, now) : isLive ? relativeTime(req.createdAt, now) : undefined;
        break;
      case 'sourcing':
        sub = req.openedAt ? `${active.length} active` : undefined;
        at = req.openedAt && (done || isLive) ? relativeTime(req.openedAt, now) : undefined;
        break;
      case 'offer':
        sub = offerFirst;
        at = activeOffer ? relativeTime(activeOffer.createdAt, now) : undefined;
        break;
      case 'filled':
        sub = `${req.hires}/${req.headcount} hired`;
        at = req.status === 'filled' && req.closedAt ? relativeTime(req.closedAt, now) : undefined;
        break;
    }
    return { id: s.id, label, icon: glyph(s.icon), sub, at };
  });

  let message: ReactNode = null;
  switch (req.status) {
    case 'draft':
      message = (
        <>
          <b>{creator ?? 'The hiring manager'}</b> is drafting this role — next stop: headcount approval
        </>
      );
      break;
    case 'pending-approval': {
      const pool = compact ? [] : p.headcountPool(req.hiringManagerId);
      message = pool.length ? <>Waiting on {anyOf(pool, p)} to approve the headcount</> : 'Waiting for a recruiter to approve the headcount';
      break;
    }
    case 'open':
      message = activeOffer ? (
        <>
          Offer in flight for <b>{offerFirst ?? 'a candidate'}</b> · {OFFER_STATUS_META[activeOffer.status].label}
        </>
      ) : active.length ? (
        <>
          <b>{recruiter ?? 'The recruiter'}</b> is running the search — <span>{pluralize(active.length, 'candidate')} in flight</span>
          {upcoming > 0 && (
            <>
              , <span>{pluralize(upcoming, 'interview')} booked</span>
            </>
          )}
        </>
      ) : (
        <>
          Ready for sourcing — over to <b>{recruiter ?? 'the recruiter'}</b>
        </>
      );
      break;
    case 'on-hold':
      message = (
        <>
          Paused — candidates stay put until <b>{recruiter ?? 'the recruiter'}</b> reopens it
        </>
      );
      break;
    case 'filled':
      message = req.headcount > 1 ? `All ${req.headcount} seats filled — onboarding continues in HR Portal` : 'Seat filled — onboarding continues in HR Portal';
      break;
    case 'closed':
      message = `Closed with ${req.hires} of ${req.headcount} seats filled`;
      break;
  }

  const ready = [req.title.trim(), req.jd.text.trim(), req.jd.profile, req.salary, req.interviewPlan.length, req.hiringManagerId && req.recruiterId, req.targetStartDate];
  const deepest = Math.max(0, ...active.map((a) => stageIndex(a.stage)));
  const progress =
    req.status === 'draft'
      ? ready.filter(Boolean).length / ready.length
      : req.status === 'pending-approval'
        ? clamp01((now - req.createdAt) / Math.max(DAY, typicalApprovalMs))
        : current === 3 && activeOffer
          ? clamp01((offerStageIndex(activeOffer) + 0.5) / OFFER_STEPS.length)
          : current === 2
            ? clamp01(deepest / stageIndex('offer'))
            : 1;

  const eta =
    req.status === 'filled'
      ? req.closedAt
        ? `Filled ${fmtDay(req.closedAt)}`
        : undefined
      : req.status !== 'closed' && req.targetStartDate
        ? `Target start ${fmtDay(req.targetStartDate)}`
        : undefined;

  return { steps, current, state, progress, message, eta };
}

// ───────────────────────── onboarding ─────────────────────────
const PHASE_ICON: Record<OnboardingPhase, LucideIcon> = {
  'pre-boarding': Rocket,
  'day-1': Sunrise,
  'week-1': CalendarDays,
  'day-30': Sparkles,
  'day-60': Target,
  'day-90': Flag,
};
/** Calendar window of each phase, in days from day one (pre-boarding starts at hand-off). */
const PHASE_WINDOW: Record<OnboardingPhase, [number | null, number]> = {
  'pre-boarding': [null, 0],
  'day-1': [0, 1],
  'week-1': [1, 7],
  'day-30': [7, 30],
  'day-60': [30, 60],
  'day-90': [60, 90],
};

export interface OnboardingTrackInput {
  journey: OnboardingJourney;
  now: number;
  people: TalentPeople;
  compact?: boolean;
}

export function buildOnboardingTrack({ journey: j, now, people: p, compact }: OnboardingTrackInput): TrackModel {
  const prog = journeyProgress(j, now);
  const complete = j.status === 'completed' || (prog.total > 0 && prog.done === prog.total);
  const liveIdx = PHASE_ORDER.indexOf(prog.current);
  const current = complete ? PHASE_ORDER.length : liveIdx;
  const name = firstOf(j.name);
  const ownerName = (t: OnboardingTask) =>
    t.owner === 'manager' ? (p.first(j.managerId) ?? OWNER_META.manager.label) : t.owner === 'buddy' ? (p.first(j.buddyId) ?? OWNER_META.buddy.label) : t.owner === 'new-hire' ? name : OWNER_META[t.owner].label;

  const steps: NeoTrackStep[] = PHASE_ORDER.map((ph, i) => {
    const pp = prog.phases[i];
    const isLive = !complete && i === liveIdx;
    return {
      id: ph,
      label: compact && isLive && pp.total ? `${PHASE_META[ph].label} · ${pp.done}/${pp.total}` : PHASE_META[ph].label,
      icon: glyph(PHASE_ICON[ph]),
      sub: PHASE_META[ph].window,
      at: pp.total ? `${pp.done}/${pp.total}` : undefined,
    };
  });

  const open = j.tasks.filter((t) => !t.done).sort((a, b) => taskDueDate(j, a) - taskDueDate(j, b));
  const overdue = open.filter((t) => taskDueDate(j, t) < now - DAY);
  const liveOpen = open.filter((t) => t.phase === prog.current);
  const days = daysUntilStart(j, now);

  let message: ReactNode = null;
  if (complete)
    message = (
      <>
        <b>{name}</b> wrapped up the 90-day journey
      </>
    );
  else if (overdue.length)
    message = (
      <>
        Running late — <b>{ownerName(overdue[0])}</b> still owes <q>{overdue[0].title}</q>
      </>
    );
  else if (liveOpen.length) {
    const t = liveOpen[0];
    message = (
      <>
        <b>{ownerName(t)}</b> is on <q>{t.title}</q> · due <span>{relativeTime(taskDueDate(j, t), now)}</span>
      </>
    );
  } else if (prog.current === 'pre-boarding')
    message =
      days > 0 ? (
        <>
          All set for day one — <b>{name}</b> starts in <span>{pluralize(days, 'day')}</span>
        </>
      ) : (
        <>
          All set — <b>{name}</b> starts today
        </>
      );
  else {
    const next = PHASE_ORDER[liveIdx + 1];
    message = next ? (
      <>
        <span>{PHASE_META[prog.current].label}</span> is wrapped — next up: <span>{PHASE_META[next].label}</span>
      </>
    ) : (
      'Final stretch — every task is done'
    );
  }

  const pp = prog.phases[liveIdx];
  const start = parseISODate(j.startDate);
  const [from, to] = PHASE_WINDOW[prog.current];
  const timeShare = elapsed(from === null ? j.handedOffAt : start + from * DAY, start + to * DAY, now);
  const progress = complete ? 1 : pp?.total ? pp.done / pp.total : timeShare;
  const eta = complete ? undefined : days > 0 ? `Starts ${fmtDay(j.startDate)}` : `Day ${Math.min(90, 1 - days)} of 90`;

  return { steps, current, state: complete ? 'done' : 'active', progress, message, eta, title: 'First 90 days' };
}

// ───────────────────────── components ─────────────────────────
interface ViewProps {
  now: number;
  /** Slim bar + live label for rows and cards. */
  compact?: boolean;
  /** No card chrome (already inside a panel). */
  bare?: boolean;
  /** HUD eyebrow (full tracker); `false` hides it. */
  hud?: ReactNode | false;
  /** Headline (full tracker); defaults to the status headline, `false` hides it. */
  title?: ReactNode | false;
  actions?: ReactNode;
  /** Drop the live status line when the surrounding UI already says it. */
  quiet?: boolean;
  className?: string;
}

function TrackView({ model, hud, title, compact, bare, actions, quiet, className }: Omit<ViewProps, 'now'> & { model: TrackModel }) {
  return (
    <NeoTracker
      steps={model.steps}
      current={model.current}
      state={model.state}
      progress={model.progress}
      hud={compact || hud === false ? undefined : hud}
      title={compact || title === false ? undefined : (title ?? model.title)}
      message={compact || quiet ? undefined : model.message}
      eta={compact ? undefined : model.eta}
      actions={compact ? undefined : actions}
      compact={compact}
      bare={bare}
      label={typeof hud === 'string' ? hud : undefined}
      className={cx('tl-trk', className)}
    />
  );
}

/** Offer journey: draft → approvals → ready → with the candidate → signed. */
export function OfferTracker({ offer, req, candName, now, hud = 'Offer tracker', ...view }: ViewProps & { offer: Offer; req?: Requisition; candName?: string }) {
  const people = useTalentPeople();
  const model = buildOfferTrack({ offer, req, candName, now, people, compact: view.compact });
  return <TrackView model={model} hud={hud} {...view} />;
}

/** One application's journey through the pipeline, grouped by phase. */
export function CandidateJourneyTracker({ app, now, hud = 'Candidate journey', ...view }: ViewProps & { app: Application }) {
  const people = useTalentPeople();
  const ctx = useGateContext(app.id);
  const model = buildJourneyTrack({ app, ctx, now, people, compact: view.compact });
  return <TrackView model={model} hud={hud} {...view} />;
}

/** Typical raised → approved time across requisitions that went through approval. */
function useTypicalApprovalMs() {
  const reqs = useTalent((s) => s.requisitions);
  return useMemo(() => {
    const waits = reqs
      .map((r) => (r.openedAt ? r.openedAt - r.createdAt : 0))
      .filter((ms) => ms > 60_000)
      .sort((a, b) => a - b);
    return waits.length ? waits[Math.floor(waits.length / 2)] : 2 * DAY;
  }, [reqs]);
}

/** Requisition lifecycle: draft → headcount approval → sourcing → offer → filled. */
export function ReqTracker({ req, apps, now, hud = 'Requisition tracker', ...view }: ViewProps & { req: Requisition; apps: Application[] }) {
  const people = useTalentPeople();
  const offersAll = useTalent((s) => s.offers);
  const interviews = useTalent((s) => s.interviews);
  const candidates = useTalent((s) => s.candidates);
  const typicalApprovalMs = useTypicalApprovalMs();
  const offers = useMemo(() => offersAll.filter((o) => o.requisitionId === req.id), [offersAll, req.id]);
  const upcoming = useMemo(() => interviews.filter((i) => i.requisitionId === req.id && i.status === 'scheduled' && i.scheduledAt >= now).length, [interviews, req.id, now]);
  const model = buildReqTrack({
    req,
    apps,
    offers,
    candName: (id) => candidates.find((c) => c.id === id)?.name,
    now,
    people,
    typicalApprovalMs,
    upcoming,
    compact: view.compact,
  });
  return <TrackView model={model} hud={hud} {...view} />;
}

/** New-hire onboarding: pre-boarding → day one → first week → 30/60/90 days. */
export function OnboardingTracker({ journey, now, hud = 'Onboarding tracker', ...view }: ViewProps & { journey: OnboardingJourney }) {
  const people = useTalentPeople();
  const model = buildOnboardingTrack({ journey, now, people, compact: view.compact });
  return <TrackView model={model} hud={hud} {...view} />;
}
