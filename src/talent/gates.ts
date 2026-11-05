/**
 * Stage gates + "next best action" — the step-by-step engine of the pipeline.
 *
 * Moving a candidate forward requires the exit criteria of every stage it
 * passes through (outreach logged → interest + consent → screen → scorecards →
 * hire decision → accepted offer). Recruiters may override with a reason,
 * which is written to the audit trail. Moving backwards is always allowed.
 */
import type { Application, Candidate, CandidateSource, Interview, Offer, Outreach, Requisition, Scorecard, StageId } from './types';
import { STAGE_BY_ID, STAGE_ORDER, stageIndex } from './constants';

export type NextActionKind =
  | 'outreach'
  | 'follow-up'
  | 'log-reply'
  | 'consent'
  | 'schedule-screen'
  | 'scorecard'
  | 'schedule-interview'
  | 'decision'
  | 'draft-offer'
  | 'submit-offer'
  | 'approve-offer'
  | 'send-offer'
  | 'record-response'
  | 'handoff'
  | 'advance'
  | 'reject'
  | 'none';

export interface GateContext {
  candidate: Candidate;
  /** Outreach to this candidate. */
  outreach: Outreach[];
  /** Interviews for this application. */
  interviews: Interview[];
  /** Scorecards for this application. */
  scorecards: Scorecard[];
  /** Offers for this application. */
  offers: Offer[];
  requisition?: Requisition;
  /** Whether an onboarding journey already exists. */
  handedOff?: boolean;
  now?: number;
}

export interface GateCheck {
  id: string;
  stage: StageId;
  label: string;
  done: boolean;
  hint: string;
  action: NextActionKind;
}

export interface GateResult {
  to: StageId;
  ok: boolean;
  backwards: boolean;
  checks: GateCheck[];
}

const WARM_SOURCES: CandidateSource[] = ['inbound', 'referral', 'internal', 'silver-medalist', 'event', 'agency'];
const DAY = 86_400_000;

interface Facts {
  warm: boolean;
  sent: Outreach[];
  interested: boolean;
  consent: boolean;
  screens: Interview[];
  screenCards: Scorecard[];
  screenAdvance: boolean;
  loop: Interview[];
  loopCards: Scorecard[];
  loopOutstanding: Interview[];
  plannedLoop: number;
  offer?: Offer;
}

function facts(app: Application, ctx: GateContext): Facts {
  const sent = ctx.outreach.filter((o) => o.status !== 'draft');
  const screens = ctx.interviews.filter((i) => i.kind === 'screen' && i.status !== 'cancelled');
  const screenIds = new Set(screens.map((i) => i.id));
  const screenCards = ctx.scorecards.filter((s) => screenIds.has(s.interviewId));
  const loop = ctx.interviews.filter((i) => i.kind !== 'screen' && i.status !== 'cancelled');
  const loopIds = new Set(loop.map((i) => i.id));
  const loopCards = ctx.scorecards.filter((s) => loopIds.has(s.interviewId));
  const carded = new Set(loopCards.map((s) => s.interviewId));
  const offer = [...ctx.offers].sort((a, b) => b.createdAt - a.createdAt)[0];
  return {
    warm: WARM_SOURCES.includes(ctx.candidate.source),
    sent,
    interested: ctx.outreach.some((o) => o.status === 'interested'),
    consent: ctx.candidate.consent.given,
    screens,
    screenCards,
    screenAdvance: screenCards.some((s) => s.recommendation === 'yes' || s.recommendation === 'strong-yes'),
    loop,
    loopCards,
    loopOutstanding: loop.filter((i) => !carded.has(i.id) && i.status !== 'no-show'),
    plannedLoop: ctx.requisition?.interviewPlan.filter((s) => s.kind !== 'screen').length ?? 2,
    offer: app.status === 'hired' ? ctx.offers.find((o) => o.status === 'accepted') ?? offer : offer,
  };
}

function checksFor(stage: StageId, app: Application, f: Facts): GateCheck[] {
  switch (stage) {
    case 'contacted':
      return [
        {
          id: 'outreach',
          stage,
          label: f.warm ? 'Warm source (no cold outreach needed)' : 'Outreach sent',
          done: f.warm || f.sent.length > 0,
          hint: 'Send a personalised LinkedIn message or email and log it.',
          action: 'outreach',
        },
      ];
    case 'applied':
      return [
        {
          id: 'interest',
          stage,
          label: 'Interest confirmed',
          done: f.warm || f.interested,
          hint: 'Log the candidate’s reply as “Interested”.',
          action: 'log-reply',
        },
        {
          id: 'consent',
          stage,
          label: 'Data-processing consent recorded',
          done: f.consent,
          hint: 'Record consent (GDPR / UAE PDPL) before assessing the candidate.',
          action: 'consent',
        },
      ];
    case 'screen':
      return [
        {
          id: 'screen-scheduled',
          stage,
          label: 'Recruiter screen scheduled',
          done: f.screens.length > 0,
          hint: 'Schedule a 30-minute recruiter screen.',
          action: 'schedule-screen',
        },
      ];
    case 'interview':
      return [
        {
          id: 'screen-pass',
          stage,
          label: 'Screen scorecard recommends advancing',
          done: f.screenAdvance,
          hint: f.screenCards.length ? 'The screen scorecard did not recommend advancing.' : 'Submit the screen scorecard.',
          action: 'scorecard',
        },
      ];
    case 'final':
      return [
        {
          id: 'loop-cards',
          stage,
          label: `At least 2 interview scorecards (${Math.min(f.loopCards.length, 2)}/2)`,
          done: f.loopCards.length >= 2,
          hint: f.loop.length < 2 ? 'Schedule the interview loop.' : 'Collect the outstanding scorecards from the panel.',
          action: f.loop.length < 2 ? 'schedule-interview' : 'scorecard',
        },
        {
          id: 'loop-complete',
          stage,
          label: 'No interviews awaiting feedback',
          done: f.loop.length > 0 && f.loopOutstanding.length === 0,
          hint: `${f.loopOutstanding.length} interview${f.loopOutstanding.length === 1 ? '' : 's'} still need a scorecard.`,
          action: 'scorecard',
        },
      ];
    case 'offer':
      return [
        {
          id: 'decision',
          stage,
          label: 'Hiring manager decision: hire',
          done: app.decision?.verdict === 'hire',
          hint: 'The hiring manager records the debrief decision.',
          action: 'decision',
        },
      ];
    case 'hired':
      return [
        {
          id: 'offer-accepted',
          stage,
          label: 'Offer accepted',
          done: f.offer?.status === 'accepted',
          hint: 'Send the approved offer and record the signature.',
          action: f.offer ? (f.offer.status === 'sent' ? 'record-response' : 'send-offer') : 'draft-offer',
        },
      ];
    default:
      return [];
  }
}

/** Exit criteria for moving `app` to `to` (every stage passed through is checked). */
export function gateFor(app: Application, to: StageId, ctx: GateContext): GateResult {
  const from = stageIndex(app.stage);
  const target = stageIndex(to);
  if (target <= from) return { to, ok: true, backwards: true, checks: [] };
  const f = facts(app, ctx);
  const checks = STAGE_ORDER.slice(from + 1, target + 1).flatMap((s) => checksFor(s, app, f));
  return { to, ok: checks.every((c) => c.done), backwards: false, checks };
}

export interface NextAction {
  kind: NextActionKind;
  label: string;
  detail: string;
  /** Target stage for `advance`. */
  to?: StageId;
  /** Waiting on someone else (approval, signature, reply). */
  waiting?: boolean;
  urgent?: boolean;
}

const nextStage = (s: StageId): StageId | undefined => STAGE_ORDER[stageIndex(s) + 1];

/** What should happen next for this application — drives buttons on cards and sheets. */
export function nextAction(app: Application, ctx: GateContext): NextAction {
  const now = ctx.now ?? Date.now();
  if (app.status === 'hired')
    return ctx.handedOff
      ? { kind: 'none', label: 'Onboarding in HR Portal', detail: 'Handed off. Track progress in the HR Portal.' }
      : { kind: 'handoff', label: 'Hand off to HR Portal', detail: 'Create the onboarding journey for this hire.', urgent: true };
  if (app.status !== 'active') return { kind: 'none', label: 'Closed', detail: 'This application is no longer active.' };

  const f = facts(app, ctx);
  const advance = (detail: string): NextAction => {
    const to = nextStage(app.stage)!;
    return { kind: 'advance', label: `Move to ${STAGE_BY_ID[to].label}`, detail, to };
  };

  switch (app.stage) {
    case 'sourced':
      if (!f.warm && !f.sent.length) return { kind: 'outreach', label: 'Send outreach', detail: 'Draft a personalised LinkedIn message with AI.' };
      return advance('Outreach logged. Mark as engaged.');
    case 'contacted': {
      if (!f.warm && !f.interested) {
        const last = [...f.sent].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];
        const declined = f.sent.some((o) => o.status === 'not-interested');
        if (declined) return { kind: 'reject', label: 'Close out', detail: 'Candidate isn’t interested. Close politely and keep them warm.' };
        if (last?.status === 'sent' && last.sentAt && now - last.sentAt > 4 * DAY && last.step < 3)
          return { kind: 'follow-up', label: `Send follow-up #${last.step}`, detail: `No reply for ${Math.floor((now - last.sentAt) / DAY)} days.`, urgent: true };
        return { kind: 'log-reply', label: 'Log reply', detail: 'Waiting for a reply. Log it when it lands.', waiting: true };
      }
      if (!f.consent) return { kind: 'consent', label: 'Record consent', detail: 'Capture data-processing consent before assessment.' };
      return advance('Interested and consent recorded.');
    }
    case 'applied':
      if (!f.consent) return { kind: 'consent', label: 'Record consent', detail: 'Capture data-processing consent before assessment.' };
      if (!f.screens.length) return { kind: 'schedule-screen', label: 'Schedule screen', detail: 'Book a 30-minute recruiter screen.' };
      return advance('Screen is booked.');
    case 'screen':
      if (!f.screens.length) return { kind: 'schedule-screen', label: 'Schedule screen', detail: 'Book a 30-minute recruiter screen.' };
      if (!f.screenCards.length) {
        const s = f.screens[0];
        return s.scheduledAt > now
          ? { kind: 'scorecard', label: 'Screen upcoming', detail: `Screen on ${new Date(s.scheduledAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`, waiting: true }
          : { kind: 'scorecard', label: 'Submit screen scorecard', detail: 'The screen happened. Capture the feedback.', urgent: true };
      }
      if (f.screenAdvance) return advance('Screen passed. Start the interview loop.');
      return { kind: 'reject', label: 'Close out', detail: 'The screen did not recommend advancing.' };
    case 'interview':
      if (f.loop.length < Math.min(2, f.plannedLoop)) return { kind: 'schedule-interview', label: 'Schedule interviews', detail: `Book the loop (${f.loop.length}/${f.plannedLoop} scheduled).` };
      if (f.loopOutstanding.length) {
        const overdue = f.loopOutstanding.filter((i) => i.scheduledAt + i.durationMins * 60_000 < now);
        return overdue.length
          ? { kind: 'scorecard', label: `${overdue.length} scorecard${overdue.length === 1 ? '' : 's'} due`, detail: 'Interviews done, feedback outstanding.', urgent: true }
          : { kind: 'scorecard', label: 'Interviews upcoming', detail: `${f.loopOutstanding.length} interview${f.loopOutstanding.length === 1 ? '' : 's'} on the calendar.`, waiting: true };
      }
      if (f.loopCards.length >= 2) return advance('Loop complete. Run the debrief.');
      return { kind: 'schedule-interview', label: 'Schedule interviews', detail: 'At least two interview scorecards are needed.' };
    case 'final':
      if (!app.decision) return { kind: 'decision', label: 'Record hire decision', detail: 'Hiring manager decides after the debrief.', urgent: true };
      if (app.decision.verdict === 'no-hire') return { kind: 'reject', label: 'Close out', detail: 'Decision was no-hire. Send a thoughtful close-out.' };
      return { kind: 'draft-offer', label: 'Draft offer', detail: 'Decision: hire. Prepare the offer.' };
    case 'offer': {
      const o = f.offer;
      if (!o || o.status === 'rescinded' || o.status === 'declined')
        return o?.status === 'declined'
          ? { kind: 'reject', label: 'Offer declined', detail: 'Close out or revise the offer.' }
          : { kind: 'draft-offer', label: 'Draft offer', detail: 'Prepare the offer package.' };
      if (o.status === 'draft') return { kind: 'submit-offer', label: 'Submit for approval', detail: 'Route to the hiring manager and People Ops.' };
      if (o.status === 'pending-approval') {
        const pending = o.approvals.filter((a) => a.decision === 'pending').length;
        return { kind: 'approve-offer', label: 'Awaiting approval', detail: `${pending} approval${pending === 1 ? '' : 's'} outstanding.`, waiting: true };
      }
      if (o.status === 'approved') return { kind: 'send-offer', label: 'Send offer', detail: 'All approvals in. Send it to the candidate.', urgent: true };
      if (o.status === 'sent') return { kind: 'record-response', label: 'Awaiting signature', detail: `Expires ${new Date(o.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`, waiting: true };
      return advance('Offer accepted. Welcome aboard!');
    }
    default:
      return { kind: 'none', label: '', detail: '' };
  }
}
