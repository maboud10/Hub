/**
 * HR journey trackers (the NEXUS "pizza tracker"): pure derivations of the
 * stages, live stage, mood, live status line, ETA and courier position for the
 * journeys people wait on in the HR Portal — time off, allowance claims,
 * letters and benefits enrolment — computed from the HR records themselves
 * (timestamps, approver, decider, payroll month, who is away…), never faked.
 *
 * Status lines are lists of parts: names are their own parts (rendered bold)
 * and the phrases around them stay fixed strings, so the DOM translator can
 * translate every piece. Rendering lives in `pages/hr/components/trackers.tsx`.
 */
import type { User } from '@/types';
import { relativeTime } from '@/lib/format';
import { formatDay, parseISODate, todayISO } from './calendar';
import type { BenefitClaim, BenefitElection, LeaveRequest, LetterRequest } from './types';

const HOUR = 3_600_000;

/** Expected turnaround in hours — the promises made in the UI copy ("usually decides within 2 days"…). */
export const TURNAROUND_HOURS = { leave: 48, claim: 72, letter: 24, election: 24 } as const;
/** After 3 days People Ops also sees a pending time-off request (same rule as `computeApprovals`). */
export const LEAVE_ESCALATION_HOURS = 72;
/** Approved claims are paid on the 25th of their payroll month (see `syncEmployees`). */
export const CLAIM_PAY_DAY = 25;

export type TrackJourney = keyof typeof TURNAROUND_HOURS;
export type TrackMood = 'active' | 'blocked' | 'paused' | 'done';
export type TrackIcon = 'send' | 'review' | 'calendar' | 'receipt' | 'payroll' | 'paid' | 'stamp' | 'download' | 'shield' | 'card';

export interface TrackStage {
  id: string;
  label: string;
  /** Who handles (or handled) the stage, or a short detail. */
  sub?: string;
  /** Time chip: "2h ago", "25 Nov". */
  at?: string;
  icon: TrackIcon;
}

/** One piece of a status line; `who` marks a person (or team) name. */
export interface TrackPart {
  text: string;
  who?: boolean;
}

export interface Track {
  journey: TrackJourney;
  stages: TrackStage[];
  /** 0-based live stage; `stages.length` once the journey is complete. */
  current: number;
  state: TrackMood;
  message: TrackPart[];
  /** "ETA · 1d", "ETA · 25 Nov" or "Running late" — for the requester, while someone still has to act. */
  eta?: string;
  /** Courier position inside the live segment: elapsed vs expected turnaround (0.1–0.9). */
  progress?: number;
  /** Someone still has to act (worth a full tracker); otherwise the journey has settled. */
  inFlight: boolean;
}

export interface TrackContext {
  now: number;
  users: User[];
  /** Everyone holding `hr.people.manage` (see `peopleOpsDesk`). */
  peopleOps: User[];
  /** All time off, to notice an approver who is away. */
  leave?: LeaveRequest[];
  /** Who is looking: the requester by default; someone deciding gets "You" and a "waiting on you" line. */
  viewerId?: string;
}

// ───────────────────────── helpers ─────────────────────────
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const firstName = (u: Pick<User, 'name'>) => u.name.split(/\s+/)[0];
const who = (text: string): TrackPart => ({ text, who: true });
const say = (text: string): TrackPart => ({ text });
const LATE = ' — it’s taking longer than usual';

/** Compact duration: "45m", "5h", "2d". */
export function durationLabel(ms: number): string {
  const h = Math.max(0, ms) / HOUR;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 23.5) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** Courier position: share of the expected turnaround already used, kept inside the segment. */
export function courier(since: number, hours: number, now: number): number {
  return clamp((now - since) / (hours * HOUR), 0.1, 0.9);
}

const isLate = (since: number, hours: number, now: number) => now - since > hours * HOUR;

function etaFor(since: number, hours: number, now: number): string {
  const left = since + hours * HOUR - now;
  return left > 0 ? `ETA · ${durationLabel(left)}` : 'Running late';
}

const shortDay = (iso: string) => formatDay(iso, { day: 'numeric', month: 'short' });

/** "Nov payroll" (with the year when it isn't this year). */
function payrollName(month: string, now: number): string {
  const [y, m] = month.split('-').map(Number);
  const sameYear = y === new Date(now).getFullYear();
  return `${new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} payroll`;
}

/**
 * People Ops partners who can pick up someone's request: active holders of
 * `hr.people.manage`, never the requester (separation of duties), People Ops
 * team first — admins only when nobody in the team can.
 */
export function peopleOpsDesk(peopleOps: User[], requesterId: string): User[] {
  const pool = peopleOps.filter((u) => u.active && u.id !== requesterId);
  const team = pool.filter((u) => u.department === 'People Ops');
  return team.length ? team : pool;
}

/** "Sara or Fatima in People Ops" · "Sara in People Ops" · "People Ops". */
function deskParts(desk: User[]): TrackPart[] {
  if (!desk.length) return [who('People Ops')];
  if (desk.length === 1) return [who(firstName(desk[0])), say(' in People Ops')];
  return [who(firstName(desk[0])), say(' or '), who(firstName(desk[1])), say(' in People Ops')];
}

/** Last day of the full-day approved time off someone is on today, if any. */
export function awayUntil(userId: string, leave: LeaveRequest[], today: string): string | null {
  let until: string | null = null;
  for (const r of leave) if (r.userId === userId && r.status === 'approved' && !r.halfDay && r.start <= today && r.end >= today && (!until || r.end > until)) until = r.end;
  return until;
}

function scope(ctx: TrackContext, requesterId: string) {
  const userOf = (id?: string) => (id ? ctx.users.find((u) => u.id === id) : undefined);
  const requester = userOf(requesterId);
  return {
    userOf,
    desk: peopleOpsDesk(ctx.peopleOps, requesterId),
    /** Someone other than the requester is looking (approvals inbox). */
    decider: ctx.viewerId && ctx.viewerId !== requesterId ? ctx.viewerId : undefined,
    waitingOnYou: (late: boolean): TrackPart[] => [who(requester ? firstName(requester) : 'Someone'), say(' is waiting on you'), ...(late ? [say(LATE)] : [])],
    requesterName: requester ? firstName(requester) : 'Someone',
  };
}

// ───────────────────────── time off ─────────────────────────
/** Submitted → Manager (or People Ops) review → Approved & synced to the team calendar. Cancelled requests have no tracker. */
export function leaveTrack(req: LeaveRequest, ctx: TrackContext): Track | null {
  if (req.status === 'cancelled') return null;
  const { now } = ctx;
  const s = scope(ctx, req.userId);
  const approver = s.userOf(req.approverId);
  const auto = req.decidedBy === 'system';
  const decidedBy = auto ? undefined : s.userOf(req.decidedBy);
  const pending = req.status === 'pending';
  const byManager = pending ? !!approver : !!req.decidedBy && req.decidedBy === req.approverId;
  const deciderName = decidedBy ? firstName(decidedBy) : 'People Ops';

  const stages: TrackStage[] = [
    { id: 'sent', label: 'Submitted', at: relativeTime(req.createdAt, now), icon: 'send' },
    {
      id: 'review',
      label: auto ? 'Auto-approved' : req.status === 'rejected' ? 'Declined' : byManager ? 'Manager review' : 'People Ops review',
      sub: auto
        ? 'Within policy'
        : !pending
          ? (decidedBy?.name ?? 'People Ops')
          : approver
            ? s.decider === approver.id
              ? 'You'
              : approver.name
            : s.decider
              ? 'You'
              : 'People Ops',
      at: !pending && req.decidedAt ? relativeTime(req.decidedAt, now) : undefined,
      icon: 'review',
    },
    { id: 'synced', label: 'Approved & synced', sub: 'Team calendar', icon: 'calendar' },
  ];
  const base = { journey: 'leave' as const, stages };

  if (req.status === 'approved')
    return {
      ...base,
      current: stages.length,
      state: 'done',
      inFlight: false,
      message: auto ? [say('Approved instantly'), say(' — synced to the team calendar')] : [say('Approved by '), who(deciderName), say(' — synced to the team calendar')],
    };
  if (req.status === 'rejected') return { ...base, current: 1, state: 'blocked', inFlight: false, message: [say('Declined by '), who(deciderName), say(' — pick new dates whenever you’re ready')] };

  const hours = TURNAROUND_HOURS.leave;
  const late = isLate(req.createdAt, hours, now);
  const progress = courier(req.createdAt, hours, now);
  const live = { ...base, current: 1, inFlight: true, progress };

  if (s.decider) {
    // Approvals inbox: the approver (or People Ops for requests without one) is up; People Ops can step in for a manager.
    return {
      ...live,
      state: 'active',
      message:
        approver && approver.id !== s.decider
          ? [who(s.requesterName), say(' is waiting on '), who(firstName(approver)), say(' — you can step in as People Ops')]
          : s.waitingOnYou(late),
    };
  }
  if (approver) {
    const away = awayUntil(approver.id, ctx.leave ?? [], todayISO(now));
    if (away) return { ...live, state: 'paused', message: [who(firstName(approver)), say(' is away until '), say(formatDay(away)), say(' — People Ops can step in if it can’t wait')] };
    if (now - req.createdAt > LEAVE_ESCALATION_HOURS * HOUR) return { ...live, state: 'active', eta: 'Running late', message: [who(firstName(approver)), say(' hasn’t decided yet'), say(' — People Ops can now step in too')] };
    return { ...live, state: 'active', eta: etaFor(req.createdAt, hours, now), message: [who(firstName(approver)), say(' is reviewing your request'), say(' — usually decides within 2 days')] };
  }
  return { ...live, state: 'active', eta: etaFor(req.createdAt, hours, now), message: [...deskParts(s.desk), say(' will review your request'), say(late ? LATE : ' — usually within 2 days')] };
}

// ───────────────────────── allowance claims ─────────────────────────
/** Submitted → Receipt check (People Ops) → Payroll → Paid. Declined claims stop at the receipt check. */
export function claimTrack(claim: BenefitClaim, ctx: TrackContext): Track {
  const { now } = ctx;
  const s = scope(ctx, claim.userId);
  const reviewer = s.userOf(claim.reviewerId);
  const decided = claim.status !== 'submitted';
  const payday = claim.payrollMonth ? `${claim.payrollMonth}-${CLAIM_PAY_DAY}` : undefined;
  const reviewerName = reviewer ? firstName(reviewer) : 'People Ops';

  const stages: TrackStage[] = [
    { id: 'sent', label: 'Submitted', at: relativeTime(claim.createdAt, now), icon: 'send' },
    {
      id: 'check',
      label: claim.status === 'rejected' ? 'Declined' : 'Receipt check',
      sub: decided ? (reviewer?.name ?? 'People Ops') : s.decider ? 'You' : 'People Ops',
      at: decided && claim.decidedAt ? relativeTime(claim.decidedAt, now) : undefined,
      icon: 'receipt',
    },
    { id: 'payroll', label: 'Payroll', sub: claim.payrollMonth ? payrollName(claim.payrollMonth, now) : 'Next payroll', icon: 'payroll' },
    { id: 'paid', label: 'Paid', sub: 'With your salary', at: payday ? shortDay(payday) : undefined, icon: 'paid' },
  ];
  const base = { journey: 'claim' as const, stages };

  switch (claim.status) {
    case 'paid':
      return { ...base, current: stages.length, state: 'done', inFlight: false, message: [say('Paid with your salary 💸')] };
    case 'rejected':
      return { ...base, current: 1, state: 'blocked', inFlight: false, message: [say('Declined by '), who(reviewerName), say(' — see the note for what would work')] };
    case 'approved': {
      const from = claim.decidedAt ?? claim.createdAt;
      const due = payday ? parseISODate(payday) : 0;
      return {
        ...base,
        current: 2,
        state: 'active',
        inFlight: true,
        eta: !s.decider && payday ? `ETA · ${shortDay(payday)}` : undefined,
        progress: due > from ? clamp((now - from) / (due - from), 0.1, 0.9) : undefined,
        message: [say('Approved by '), who(reviewerName), say(' — it lands with your next salary 💸')],
      };
    }
    case 'submitted': {
      const hours = TURNAROUND_HOURS.claim;
      const late = isLate(claim.createdAt, hours, now);
      return {
        ...base,
        current: 1,
        state: 'active',
        inFlight: true,
        eta: s.decider ? undefined : etaFor(claim.createdAt, hours, now),
        progress: courier(claim.createdAt, hours, now),
        message: s.decider ? s.waitingOnYou(late) : [...deskParts(s.desk), say(' will check your receipt'), say(late ? LATE : ' — usually within 3 days')],
      };
    }
  }
}

// ───────────────────────── letters ─────────────────────────
/** Requested → People Ops review (or generated instantly) → Ready to download. Declined letters stop at the review. */
export function letterTrack(letter: LetterRequest, ctx: TrackContext): Track {
  const { now } = ctx;
  const s = scope(ctx, letter.userId);
  const auto = letter.issuedBy === 'auto';
  const issuer = auto ? undefined : s.userOf(letter.issuedBy);

  const stages: TrackStage[] = [
    { id: 'sent', label: 'Requested', at: relativeTime(letter.createdAt, now), icon: 'send' },
    {
      id: 'review',
      label: letter.status === 'rejected' ? 'Declined' : auto ? 'Generated instantly' : 'People Ops review',
      sub: letter.status === 'pending' ? (s.decider ? 'You' : 'People Ops') : auto ? 'Automatic' : (issuer?.name ?? 'People Ops'),
      at: letter.status === 'issued' && letter.issuedAt ? relativeTime(letter.issuedAt, now) : undefined,
      icon: 'stamp',
    },
    { id: 'ready', label: 'Ready to download', sub: letter.status === 'issued' ? letter.reference : undefined, icon: 'download' },
  ];
  const base = { journey: 'letter' as const, stages };

  switch (letter.status) {
    case 'issued':
      return {
        ...base,
        current: stages.length,
        state: 'done',
        inFlight: false,
        message: auto ? [say('Generated instantly'), say(' — ready to download')] : [say('Signed by '), who(issuer ? firstName(issuer) : 'People Ops'), say(' — ready to download')],
      };
    case 'rejected':
      return { ...base, current: 1, state: 'blocked', inFlight: false, message: [say('Declined by '), who('People Ops'), say(' — see the note for what would work')] };
    case 'pending': {
      const hours = TURNAROUND_HOURS.letter;
      const late = isLate(letter.createdAt, hours, now);
      return {
        ...base,
        current: 1,
        state: 'active',
        inFlight: true,
        eta: s.decider ? undefined : etaFor(letter.createdAt, hours, now),
        progress: courier(letter.createdAt, hours, now),
        message: s.decider ? s.waitingOnYou(late) : [...deskParts(s.desk), say(' will prepare and sign it'), say(late ? LATE : ' — usually within 1 working day')],
      };
    }
  }
}

// ───────────────────────── benefits enrolment ─────────────────────────
/** Submitted → People Ops confirms with the insurer → Card goes live. Nothing to track before you enrol. */
export function electionTrack(election: BenefitElection, ctx: TrackContext): Track | null {
  if (election.status === 'not-started') return null;
  const { now } = ctx;
  const s = scope(ctx, election.userId);
  const confirmer = s.userOf(election.confirmedBy);
  const confirmed = election.status === 'confirmed';

  const stages: TrackStage[] = [
    { id: 'sent', label: 'Submitted', at: election.submittedAt ? relativeTime(election.submittedAt, now) : undefined, icon: 'send' },
    {
      id: 'confirm',
      label: 'People Ops confirms',
      sub: confirmed ? (confirmer?.name ?? 'People Ops') : s.decider ? 'You' : 'Usually within a day',
      at: confirmed && election.confirmedAt ? relativeTime(election.confirmedAt, now) : undefined,
      icon: 'shield',
    },
    { id: 'live', label: 'Card goes live', sub: confirmed ? election.memberNumber : election.memberNumber ? 'Same member number' : 'Member number issued', icon: 'card' },
  ];
  const base = { journey: 'election' as const, stages };

  if (confirmed)
    return {
      ...base,
      current: stages.length,
      state: 'done',
      inFlight: false,
      message: confirmer ? [say('Confirmed by '), who(firstName(confirmer)), say(' — your digital card is live 🎉')] : [say('Confirmed'), say(' — your digital card is live 🎉')],
    };
  const hours = TURNAROUND_HOURS.election;
  const since = election.submittedAt ?? now;
  const late = isLate(since, hours, now);
  return {
    ...base,
    current: 1,
    state: 'active',
    inFlight: true,
    eta: s.decider || !election.submittedAt ? undefined : etaFor(since, hours, now),
    progress: courier(since, hours, now),
    message: s.decider ? s.waitingOnYou(late) : [...deskParts(s.desk), say(' will confirm your choices with the insurer'), say(late ? LATE : ' — usually within a day')],
  };
}

/** Plain text of a status line (tests, aria). */
export const trackText = (t: Pick<Track, 'message'>) => t.message.map((p) => p.text).join('');
