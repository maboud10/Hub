/**
 * Pipeline area helpers (pure, no React components): phase grouping, who may
 * move what where, who owns each gate action, the gate "Do it" runner and the
 * locally generated close-out messages used by the reject flow.
 */
import type { CSSProperties } from 'react';
import type { Application, Candidate, CandidateSource, MatchResult, RejectionReason, Requisition, StageId, StagePhase } from '@/talent/types';
import { STAGES, STAGE_BY_ID, STAGE_ORDER, STAGE_PHASES, stageIndex, type StageMeta } from '@/talent/constants';
import * as access from '@/talent/access';
import type { GateCheck, NextActionKind } from '@/talent/gates';
import { scoreMatch } from '@/talent/ai/engine';
import { useTalent } from '@/talent/store';
import { useTalentUI } from '@/talent/ui';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { runNextAction } from '../components/actionRunner';

const DAY = 86_400_000;

// ───────────────────────── phases & stages ─────────────────────────
export interface PhaseGroup {
  phase: StagePhase;
  hue: number;
  blurb: string;
  stages: StageMeta[];
}

const PHASE_HUE: Record<StagePhase, number> = { Acquire: 205, Assess: 284, Decide: 345, Onboard: 152 };
const PHASE_BLURB: Record<StagePhase, string> = {
  Acquire: 'Find, engage, confirm interest',
  Assess: 'Screen and interview loop',
  Decide: 'Debrief, decision and offer',
  Onboard: 'Signed and handed to HR',
};

export const PHASE_GROUPS: PhaseGroup[] = STAGE_PHASES.map((phase) => ({
  phase,
  hue: PHASE_HUE[phase],
  blurb: PHASE_BLURB[phase],
  stages: STAGES.filter((s) => s.phase === phase),
}));

/** `--stage-h` custom property for a stage (drives every stage-tinted surface). */
export const stageVars = (stage: StageId): CSSProperties => ({ '--stage-h': STAGE_BY_ID[stage].hue }) as CSSProperties;
export const hueVars = (hue: number): CSSProperties => ({ '--stage-h': hue }) as CSSProperties;
export const nextStageOf = (s: StageId): StageId | undefined => STAGE_ORDER[stageIndex(s) + 1];

export const WARM_SOURCES: ReadonlySet<CandidateSource> = new Set<CandidateSource>(['inbound', 'referral', 'internal', 'silver-medalist', 'event', 'agency']);
export const isWarm = (c: Pick<Candidate, 'source'>) => WARM_SOURCES.has(c.source);
export const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'Candidate';
export const isClosedApp = (a: Pick<Application, 'status'>) => a.status === 'rejected' || a.status === 'withdrawn';

// ───────────────────────── permissions ─────────────────────────
export interface MoveTarget {
  stage: StageId;
  ok: boolean;
  reason?: string;
  current: boolean;
  backwards: boolean;
}

/** Every stage with whether this viewer may move the application there. */
export function moveTargets(viewer: access.TalentViewer | null, app: Application, req: Requisition | undefined): MoveTarget[] {
  return STAGE_ORDER.map((stage) => {
    const current = stage === app.stage;
    const backwards = stageIndex(stage) < stageIndex(app.stage);
    if (current) return { stage, ok: false, current, backwards, reason: 'Current stage' };
    if (!viewer || !req) return { stage, ok: false, current, backwards, reason: 'Not available' };
    if (app.status === 'hired') return { stage, ok: false, current, backwards, reason: 'Already hired. Onboarding continues in the HR Portal.' };
    if (app.status !== 'active') return { stage, ok: false, current, backwards, reason: 'This application is closed. Reopen it first.' };
    const v = access.canMoveApplication(viewer, app, req, stage);
    return { stage, ok: v.ok, reason: v.reason, current, backwards };
  });
}

const yes: access.Verdict = { ok: true };
const no = (reason: string): access.Verdict => ({ ok: false, reason });

/** May this viewer perform a gate / next-best action themselves? */
export function actionVerdict(kind: NextActionKind, v: access.TalentViewer | null, app: Application, req: Requisition | undefined): access.Verdict {
  if (!v) return no('Sign in first.');
  const sourcer = access.canSource(v) || access.canManage(v);
  switch (kind) {
    case 'outreach':
    case 'follow-up':
    case 'log-reply':
    case 'consent':
      return sourcer ? yes : no('The recruiter handles outreach, replies and consent.');
    case 'schedule-screen':
    case 'schedule-interview':
      return req ? access.canScheduleInterview(v, req) : no('Requisition not found.');
    case 'decision':
      return req ? access.canRecordDecision(v, req) : no('Requisition not found.');
    case 'draft-offer':
    case 'submit-offer':
    case 'send-offer':
    case 'record-response':
      return access.canDraftOffer(v);
    case 'handoff':
      return access.canManage(v) || access.canManageOnboarding(v) ? yes : no('People Ops hands hires off to onboarding.');
    case 'reject':
      return req && (access.canManage(v) || access.canMoveApplication(v, app, req).ok) ? yes : no('Only the recruiter or hiring manager can close out this candidate.');
    case 'advance':
      return req ? access.canMoveApplication(v, app, req) : no('Requisition not found.');
    default:
      return yes;
  }
}

/** Who usually owns a gate action (shown when the viewer can't do it). */
export function ownerOf(kind: NextActionKind): string {
  switch (kind) {
    case 'decision':
      return 'Hiring manager';
    case 'scorecard':
      return 'Interview panel';
    case 'schedule-screen':
    case 'schedule-interview':
      return 'Recruiter or HM';
    case 'approve-offer':
      return 'Approvers';
    default:
      return 'Recruiter';
  }
}

/**
 * Run the "Do it" shortcut for an unmet gate check — same mapping as
 * `runNextAction`, but a scorecard owed by someone else tells you who.
 */
export function runGateCheck(check: Pick<GateCheck, 'action' | 'label' | 'hint'>, app: Application, navigate?: (to: string) => void) {
  if (check.action === 'scorecard') {
    const store = useTalent.getState();
    const hub = useHub.getState();
    const me = hub.sessionUserId ?? '';
    const now = Date.now();
    const ivs = store.interviews.filter((i) => i.applicationId === app.id && i.status !== 'cancelled');
    const carded = (ivId: string, userId: string) => store.scorecards.some((s) => s.interviewId === ivId && s.interviewerId === userId);
    const mine = ivs.find((i) => i.interviewerIds.includes(me) && i.scheduledAt < now && !carded(i.id, me));
    if (mine) {
      useTalentUI.getState().openModal({ kind: 'scorecard', interviewId: mine.id });
      return;
    }
    const owing = [...new Set(ivs.filter((i) => !store.scorecards.some((s) => s.interviewId === i.id)).flatMap((i) => i.interviewerIds))];
    const names = owing.map((id) => firstName(hub.users.find((u) => u.id === id)?.name)).filter(Boolean);
    const upcoming = ivs.some((i) => i.scheduledAt > now && !store.scorecards.some((s) => s.interviewId === i.id));
    toast.info(
      names.length ? `Waiting on feedback from ${names.join(', ')}` : 'No scorecard is due from you',
      upcoming ? 'Some interviews are still on the calendar.' : 'Panel members submit scorecards from the Interviews tab.',
    );
    return;
  }
  runNextAction({ kind: check.action, label: check.label, detail: check.hint }, app, navigate);
}

// ───────────────────────── matching ─────────────────────────
/** Score a candidate against a requisition's decoded JD (null when the JD isn't decoded). */
export function matchFor(req: Requisition | undefined, cand: Candidate): MatchResult | null {
  return req?.jd.profile ? scoreMatch(req.jd.profile, cand, { location: req.location, workModel: req.workModel }) : null;
}

// ───────────────────────── dates ─────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2021-03" → "Mar 2021". */
export function fmtYearMonth(ym: string | null | undefined): string {
  if (!ym) return 'Present';
  const [y, m] = ym.split('-').map(Number);
  return m ? `${MONTHS[(m - 1) % 12]} ${y}` : String(y);
}

/** Tenure between two "YYYY-MM" values, e.g. "3 yrs 4 mos". */
export function tenure(start: string, end: string | null, now = Date.now()): string {
  const [sy, sm] = start.split('-').map(Number);
  const e = end ? end.split('-').map(Number) : [new Date(now).getFullYear(), new Date(now).getMonth() + 1];
  const months = Math.max(0, (e[0] - sy) * 12 + ((e[1] ?? 1) - (sm || 1)));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y === 1 ? '' : 's'}` : '', m ? `${m} mo${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || '< 1 mo';
}

export const daysBetween = (from: number, to = Date.now()) => Math.max(0, Math.floor((to - from) / DAY));

// ───────────────────────── close-out messages ─────────────────────────
const CLOSE_BODY: Record<RejectionReason, (role: string) => string> = {
  skills: (role) =>
    `After a lot of thought, we’ve decided to move forward with candidates whose experience lines up more closely with the specific skills the ${role} role needs right now. It was a close call, and it says nothing about the quality of your work.`,
  experience: (role) =>
    `We’ve decided to move forward with candidates whose level of experience is a closer match for the scope of the ${role} role at this moment. That’s about timing and scope, not about your potential.`,
  compensation: (role) =>
    `We weren’t able to land on a package for the ${role} role that does justice to your expectations, so we’ve decided not to move forward right now. We’d rather be upfront about that than stretch the process out.`,
  location: (role) =>
    `The location and working pattern for the ${role} role don’t line up with what you’re looking for, so we’ve decided not to move forward this time.`,
  culture: (role) =>
    `We’ve decided not to move forward with your application for the ${role} role. We really appreciated how openly you talked about the way you like to work.`,
  'position-filled': (role) =>
    `We’ve now filled the ${role} role, so we’re closing the process. You were part of a genuinely strong group, and we’re grateful for the time you gave us.`,
  'candidate-withdrew': (role) => `Thanks for letting us know you’d like to step back from the ${role} process. We completely respect your decision.`,
  'no-response': (role) => `We haven’t heard back for a little while, so we’ll pause your application for the ${role} role for now. If the timing changes, just reply to this message.`,
  other: (role) => `We’ve decided not to move forward with your application for the ${role} role at this stage.`,
};

const OPENERS: ((role: string) => string)[] = [
  (role) => `Thank you for the time and energy you’ve put into the ${role} process with us.`,
  (role) => `I wanted to personally follow up on your conversations with us about the ${role} role.`,
  (role) => `Thanks again for everything you shared with us during the ${role} process.`,
];

const CLOSERS = [
  'We wish you every success in your next step.',
  'Wishing you all the best with whatever comes next.',
  'Thank you again, and good luck with your search.',
];

/** A respectful, human close-out note drafted locally (never sent automatically). */
export function closeoutMessage(o: { reason: RejectionReason; first: string; role: string; sender: string; keepWarm: boolean; variant?: number }): string {
  const v = Math.abs(o.variant ?? 0) % OPENERS.length;
  const opener =
    o.reason === 'no-response'
      ? `I’m following up on my earlier note about the ${o.role} role.`
      : o.reason === 'candidate-withdrew'
        ? `Thanks for the time you spent with us on the ${o.role} role.`
        : OPENERS[v](o.role);
  const feedback = o.reason === 'skills' || o.reason === 'experience' || o.reason === 'other' ? 'If it would be useful, I’m happy to share some feedback on a short call.' : '';
  const warm = o.keepWarm
    ? 'With your permission, we’d love to keep your profile on file and reach out when a role that suits your strengths opens up.'
    : CLOSERS[v];
  return [`Hi ${o.first},`, '', opener, '', CLOSE_BODY[o.reason](o.role), '', [warm, feedback].filter(Boolean).join(' '), '', 'Warm regards,', o.sender].join('\n');
}
