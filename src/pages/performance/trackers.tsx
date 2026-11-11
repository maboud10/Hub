/**
 * Journey trackers — the NeoTracker "pizza tracker", fed by real Performance data.
 *
 *  - `reviewJourney` — one review packet: self-reflection → peer feedback → manager review →
 *    calibration → release (complete once the employee acknowledges). Worded for whoever is
 *    looking: the employee reads "Omar is writing your manager review", their manager reads
 *    "Priya is writing the self-reflection". The employee never sees the manager's draft status
 *    before release (same as the rest of the app), so their manager stage follows the calendar.
 *  - `peerJourney`   — the employee's 360 before release: nominations → approval → responses → themes.
 *  - `cycleJourney`  — the cycle calendar with completion tallies (leaders, People Ops, anyone
 *    without a managed packet of their own).
 *
 * Stages, the courier position (`progress`), the mood (blocked = declined / overdue, paused =
 * waiting for a window to open or on someone outside the flow), the status line and the ETA all
 * come from the store. i18n: NEXUS translates DOM text nodes, so names, counts and dates always
 * sit in their own element (`<b>Omar</b> is writing…`, `Due <span>Dec 4</span>`) next to a
 * static, reusable phrase.
 */
import { useMemo, type ReactNode } from 'react';
import { BadgeCheck, Grid3x3, NotebookPen, PenLine, Sparkles, UserCheck, UserPlus, Users } from 'lucide-react';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { cx } from '@/lib/cx';
import { reviewAccess, type ReviewRole } from '@/performance/access';
import { PHASES } from '@/performance/constants';
import { currentPhaseKey, getPhase, timelineSegments } from '@/performance/cycle';
import { usePerf } from '@/performance/store';
import type { Cycle, CycleFeedback, CyclePhase, PhaseKey, Review, ReviewTemplate } from '@/performance/types';
import { DAY, clamp01, managerProgress, selfProgress, templateFor } from './checkins-shared';
import { dayLabel, shortDate, type PerfCtx } from './hooks';

/* ───────── Shape ───────── */

/** Everything a NeoTracker needs, derived from store data. */
export interface Journey {
  steps: NeoTrackStep[];
  /** 0-based live stage; `steps.length` = complete. */
  current: number;
  state: NeoTrackState;
  /** 0..1 — courier position inside the live stage (sub-items done, or share of its window elapsed). */
  progress: number;
  message: ReactNode;
  eta?: ReactNode;
}

export const isComplete = (j: Pick<Journey, 'current' | 'steps'>) => j.current >= j.steps.length;

/* ───────── Wording (one dynamic value per element, static phrase beside it) ───────── */

/** `<b>Omar</b> is writing your manager review` · `<b>3/4</b> peers have answered` */
function lead(value: ReactNode, phrase: string): ReactNode {
  return (
    <>
      <b>{value}</b> {phrase}
    </>
  );
}

/** `Calibration opens <b>Dec 4</b>` · `Ready to share with <b>Priya</b>` */
function then(phrase: string, value: ReactNode): ReactNode {
  return (
    <>
      {phrase} <b>{value}</b>
    </>
  );
}

/** Two beats in one status line, joined by a quiet separator. */
function both(a: ReactNode, b: ReactNode): ReactNode {
  return (
    <>
      {a}
      <span className="pf-trk__sep" aria-hidden="true">
        {' · '}
      </span>
      {b}
    </>
  );
}

/** ETA chip: static verb + the date in its own node (`Due Dec 4`). */
function etaChip(verb: 'Due' | 'Opens' | 'Wraps' | 'Lands', at: number): ReactNode {
  return (
    <>
      {verb} <span>{shortDate(at)}</span>
    </>
  );
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const daysUntil = (at: number, now: number) => Math.max(1, Math.round((at - now) / DAY));

/** Live stage time chip: `Today` · `in 3d` (the date once it has passed). */
function countdown(at: number, now: number): string {
  if (at < now) return shortDate(at);
  return sameDay(at, now) ? 'Today' : `in ${daysUntil(at, now)}d`;
}

/** Mid-sentence deadline: `today` · `in 3d`. */
const dueWhen = (at: number, now: number) => (sameDay(at, now) ? 'today' : `in ${daysUntil(at, now)}d`);

/** 0..1 share of a window that has elapsed. */
const elapsed = (from: number | undefined, to: number | undefined, now: number) =>
  from === undefined || to === undefined ? 0 : clamp01((now - from) / Math.max(1, to - from));

/* ───────── Stages ───────── */

const ORDER: PhaseKey[] = PHASES.map((p) => p.key);

/** Short, static, reusable stage names. */
export const STAGE_LABEL: Record<PhaseKey, string> = {
  self: 'Self-reflection',
  peer: 'Peer feedback',
  manager: 'Manager review',
  calibration: 'Calibration',
  release: 'Release',
};

const STAGE_ICON: Record<PhaseKey, ReactNode> = {
  self: <NotebookPen />,
  peer: <Users />,
  manager: <PenLine />,
  calibration: <Grid3x3 />,
  release: <BadgeCheck />,
};

function peerSplit(peers: CycleFeedback[]) {
  const active = peers.filter((f) => f.status === 'requested' || f.status === 'submitted');
  const answered = active.filter((f) => f.status === 'submitted');
  return {
    active,
    answered,
    waiting: active.filter((f) => f.status === 'requested'),
    proposed: peers.filter((f) => f.status === 'proposed').length,
    declined: peers.filter((f) => f.status === 'declined').length,
    lastAnswer: Math.max(0, ...answered.map((f) => f.submittedAt ?? 0)) || undefined,
  };
}

/* ───────── Review packet journey ───────── */

export interface ReviewJourneyInput {
  review: Review;
  cycle: Cycle;
  /** Who is looking (from `reviewAccess`). */
  role: Exclude<ReviewRole, 'none'>;
  viewerId: string;
  first: (id: string | undefined) => string;
  /** Peer (360) feedback about the employee in this cycle. */
  peers: CycleFeedback[];
  tpl?: ReviewTemplate;
  now: number;
}

export function reviewJourney({ review: r, cycle: c, role, viewerId, first, peers, tpl, now }: ReviewJourneyInput): Journey | null {
  // Without a manager there is no 360, manager review, calibration or release to track.
  if (!r.managerId) return null;
  const me = role === 'employee';
  const amMgr = r.managerId === viewerId;
  const emp = first(r.employeeId);
  const mgr = first(r.managerId);
  const ops = first(c.calibrationLockedBy ?? c.createdBy);
  const selfP = getPhase(c, 'self');
  const peerP = getPhase(c, 'peer');
  const mgrP = getPhase(c, 'manager');
  const calP = getPhase(c, 'calibration');
  const relP = getPhase(c, 'release');
  const past = (p?: CyclePhase) => !!p && now > p.end;
  const early = (p?: CyclePhase) => c.status === 'draft' || (!!p && now < p.start);
  const rel = r.release;
  const ackAt = rel?.acknowledgedAt;
  const moved = !!rel || c.status === 'closed';
  const selfIn = r.self.status === 'submitted';
  const mgrIn = r.manager.status === 'submitted';
  const pr = peerSplit(peers);

  // A stage is behind us once its part is done, its window has closed, or the review was shared.
  const done: Record<PhaseKey, boolean> = {
    self: selfIn || past(selfP) || moved,
    peer: (pr.active.length > 0 && !pr.waiting.length && !pr.proposed) || past(peerP) || moved,
    manager: moved || (me ? past(mgrP) : mgrIn),
    calibration: moved || !!c.calibrationLockedAt || past(calP),
    release: !!ackAt,
  };
  const firstOpen = ORDER.findIndex((k) => !done[k]);
  const current = firstOpen < 0 ? ORDER.length : firstOpen;
  const live: PhaseKey | undefined = ORDER[current];

  /** Time chip: when it happened · countdown while live · when it opens or is due. */
  const stamp = (k: PhaseKey, p: CyclePhase | undefined, doneAt?: number): ReactNode => {
    if (done[k]) return doneAt ? shortDate(doneAt) : p && p.end <= now ? shortDate(p.end) : undefined;
    if (!p) return undefined;
    if (k === live) return early(p) ? shortDate(p.start) : countdown(p.end, now);
    return shortDate(p.end);
  };

  const you = 'You';
  const steps: NeoTrackStep[] = [
    {
      id: 'self',
      label: STAGE_LABEL.self,
      icon: STAGE_ICON.self,
      sub: done.self && !selfIn ? 'Not submitted' : me ? you : emp,
      at: stamp('self', selfP, selfIn ? r.self.submittedAt : undefined),
    },
    {
      id: 'peer',
      label: STAGE_LABEL.peer,
      icon: STAGE_ICON.peer,
      sub: pr.active.length ? lead(`${pr.answered.length}/${pr.active.length}`, 'answered') : pr.proposed ? lead(pr.proposed, 'nominated') : 'None yet',
      at: stamp('peer', peerP, pr.active.length && !pr.waiting.length ? pr.lastAnswer : undefined),
    },
    {
      id: 'manager',
      label: STAGE_LABEL.manager,
      icon: STAGE_ICON.manager,
      sub: amMgr ? you : mgr,
      at: stamp('manager', mgrP, !me && mgrIn ? r.manager.submittedAt : undefined),
    },
    {
      id: 'calibration',
      label: STAGE_LABEL.calibration,
      icon: STAGE_ICON.calibration,
      sub: 'Leaders',
      at: stamp('calibration', calP, c.calibrationLockedAt),
    },
    {
      id: 'release',
      label: STAGE_LABEL.release,
      icon: STAGE_ICON.release,
      sub: rel ? (me ? you : emp) : amMgr ? you : mgr,
      at: rel && !ackAt ? shortDate(rel.releasedAt) : stamp('release', relP, ackAt),
    },
  ];

  let state: NeoTrackState = 'active';
  let progress = 0;
  let message: ReactNode = null;
  let eta: ReactNode;

  switch (live) {
    case 'self': {
      if (early(selfP)) {
        state = 'paused';
        if (selfP) {
          eta = etaChip('Opens', selfP.start);
          message = then('Self-reflections open', shortDate(selfP.start));
        }
        break;
      }
      if (selfP) eta = etaChip('Due', selfP.end);
      progress = me ? selfProgress(r.self, tpl).value : elapsed(selfP?.start, selfP?.end, now);
      if (me) {
        message =
          selfP && selfP.end - now <= 3 * DAY
            ? then('Your self-reflection is due', dueWhen(selfP.end, now))
            : r.self.status === 'draft'
              ? 'Your self-reflection is in draft — pick up where you left off'
              : 'Your turn — tell the story of your quarter';
      } else {
        const line = lead(emp, r.self.status === 'draft' ? 'is writing the self-reflection' : 'hasn’t started the self-reflection yet');
        message = amMgr ? both(line, 'Your review unlocks once it’s in') : line;
      }
      break;
    }
    case 'peer': {
      if (early(peerP)) {
        state = 'paused';
        if (peerP) {
          eta = etaChip('Opens', peerP.start);
          message = then('Peer feedback opens', shortDate(peerP.start));
        }
        break;
      }
      if (peerP) eta = etaChip('Due', peerP.end);
      if (!pr.active.length && !pr.proposed && pr.declined) {
        state = 'blocked';
        message = me ? 'Your peer reviewers declined — nominate someone new' : lead(emp, 'needs new peer reviewers — everyone declined');
      } else if (pr.proposed) {
        progress = pr.active.length / (pr.active.length + pr.proposed);
        message = me
          ? lead(mgr, 'is approving your peer reviewers')
          : amMgr
            ? lead(emp, 'nominated peers — approve them to send the invites')
            : lead(mgr, 'is approving the peer reviewers');
      } else if (!pr.active.length) {
        progress = elapsed(peerP?.start, peerP?.end, now);
        message = me ? 'Pick 2–4 colleagues who saw your work up close' : lead(emp, 'hasn’t picked peer reviewers yet');
      } else {
        progress = pr.answered.length / pr.active.length;
        const line = lead(`${pr.answered.length}/${pr.active.length}`, 'peers have answered');
        // Managers and leaders see peer authors; the employee only sees the count.
        message = !me && pr.waiting.length === 1 ? both(line, lead(first(pr.waiting[0].authorId), 'is still writing')) : line;
      }
      break;
    }
    case 'manager': {
      if (mgrP) eta = etaChip('Due', mgrP.end);
      const from = Math.min(r.self.submittedAt ?? selfP?.end ?? mgrP?.start ?? now, mgrP?.end ?? now);
      if (me) {
        progress = elapsed(from, mgrP?.end, now);
        message = lead(mgr, 'is writing your manager review');
      } else if (past(mgrP)) {
        state = 'blocked';
        message = amMgr ? 'Your review is past due — finish it before calibration locks' : lead(mgr, 'is past the manager-review deadline');
      } else if (amMgr) {
        progress = managerProgress(r.manager, tpl).value;
        message = r.manager.status === 'draft' ? 'Your draft is saved — finish it to send it to calibration' : lead(emp, 'is ready for your review');
      } else {
        progress = elapsed(from, mgrP?.end, now);
        message = lead(mgr, 'is writing the manager review');
      }
      break;
    }
    case 'calibration': {
      if (early(calP)) {
        state = 'paused';
        if (calP) {
          eta = etaChip('Opens', calP.start);
          const opens = then('Calibration opens', shortDate(calP.start));
          message = amMgr ? both('Your review is in', opens) : opens;
        }
        break;
      }
      if (calP) eta = etaChip('Wraps', calP.end);
      progress = elapsed(calP?.start, calP?.end, now);
      const panel = lead(ops, 'and the leadership panel are calibrating ratings');
      if (me) message = relP ? both(panel, then('Results land by', shortDate(relP.end))) : panel;
      else if (amMgr) message = both(panel, 'You can share the review once it locks');
      else message = r.calibration ? then('Placed on the 9-box by', first(r.calibration.byId)) : lead(emp, 'isn’t on the 9-box yet');
      break;
    }
    case 'release': {
      if (rel) {
        progress = 0.5; // shared ✓ · acknowledgement still to come
        message = me ? 'Your review is here — read it, then acknowledge' : lead(emp, amMgr ? 'is reading your review' : 'is reading the review');
      } else if (me && early(relP)) {
        state = 'paused';
        if (relP) {
          eta = etaChip('Opens', relP.start);
          message = then('Reviews are shared from', shortDate(relP.start));
        }
      } else {
        if (relP) eta = etaChip(me ? 'Lands' : 'Due', relP.end);
        progress = elapsed(relP?.start, relP?.end, now);
        message = me ? lead(mgr, 'is getting ready to share your review') : amMgr ? then('Ready to share with', emp) : lead(mgr, 'can share the review now');
      }
      break;
    }
    default: {
      state = 'done';
      const talk = rel?.conversationAt && rel.conversationAt > now ? then('Review 1:1', dayLabel(rel.conversationAt, now)) : null;
      const line = me ? 'All wrapped up — you acknowledged your review' : lead(emp, 'acknowledged the review');
      message = talk && (me || amMgr) ? both(line, talk) : line;
    }
  }

  return { steps, current, state, progress, message, eta };
}

/* ───────── 360 journey (employee, before release) ───────── */

const PEER_STEPS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'nominate', label: 'Nominations', icon: <UserPlus /> },
  { id: 'approve', label: 'Approval', icon: <UserCheck /> },
  { id: 'answer', label: 'Responses', icon: <Users /> },
  { id: 'themes', label: 'Themes', icon: <Sparkles /> },
];

export interface PeerJourneyInput {
  review: Review;
  cycle: Cycle;
  /** Peer (360) feedback about the employee in this cycle. */
  peers: CycleFeedback[];
  first: (id: string | undefined) => string;
  now: number;
}

/** Nominate peers → the manager approves → peers answer → Nova's themes unlock when the review is shared. */
export function peerJourney({ review: r, cycle: c, peers, first, now }: PeerJourneyInput): Journey {
  const peerP = getPhase(c, 'peer');
  const relP = getPhase(c, 'release');
  const notYet = c.status === 'draft' || (!!peerP && now < peerP.start);
  const open = c.status === 'active' && !!peerP && !notYet && now <= peerP.end;
  const pr = peerSplit(peers);
  const nominated = pr.active.length + pr.proposed;
  const mgr = first(r.managerId);
  const done = [nominated > 0, nominated > 0 && (!pr.proposed || !open), pr.active.length ? !pr.waiting.length || !open : !open && !notYet, !!r.release];
  const firstOpen = done.findIndex((d) => !d);
  const current = firstOpen < 0 ? PEER_STEPS.length : firstOpen;

  const stamp = (i: number, end: number | undefined, doneAt?: number): ReactNode => {
    if (done[i]) return doneAt ? shortDate(doneAt) : undefined;
    if (end === undefined) return undefined;
    return i === current ? countdown(end, now) : shortDate(end);
  };
  const steps: NeoTrackStep[] = [
    { ...PEER_STEPS[0], sub: nominated ? lead(nominated, 'nominated') : 'None yet', at: stamp(0, peerP?.end) },
    { ...PEER_STEPS[1], sub: mgr, at: stamp(1, peerP?.end) },
    { ...PEER_STEPS[2], sub: pr.active.length ? lead(`${pr.answered.length}/${pr.active.length}`, 'answered') : 'None yet', at: stamp(2, peerP?.end, pr.lastAnswer) },
    { ...PEER_STEPS[3], sub: 'Nova', at: stamp(3, relP?.end, r.release?.releasedAt) },
  ];

  let state: NeoTrackState = 'active';
  let progress = 0;
  let message: ReactNode = null;
  let eta: ReactNode = peerP && current < 3 && open ? etaChip('Due', peerP.end) : undefined;
  switch (current) {
    case 0:
      if (notYet) {
        state = 'paused';
        if (peerP) {
          eta = etaChip('Opens', peerP.start);
          message = then('Peer feedback opens', shortDate(peerP.start));
        }
      } else if (!open) {
        state = 'paused';
        message = 'Peer feedback closed before anyone was nominated';
      } else if (pr.declined) {
        state = 'blocked';
        message = 'Your peer reviewers declined — nominate someone new';
      } else {
        progress = elapsed(peerP?.start, peerP?.end, now);
        message = 'Nominate 2–4 colleagues who worked closely with you this quarter';
      }
      break;
    case 1:
      progress = pr.active.length / Math.max(1, nominated);
      message = lead(mgr, 'is approving your peer reviewers');
      break;
    case 2:
      progress = pr.answered.length / Math.max(1, pr.active.length);
      message = lead(`${pr.answered.length}/${pr.active.length}`, 'peers have answered');
      break;
    case 3:
      // Waiting on the release, outside the 360 itself.
      state = 'paused';
      eta = relP && etaChip('Lands', relP.end);
      progress = elapsed(relP?.start, relP?.end, now);
      message = lead(mgr, 'unlocks your themes when the review is shared');
      break;
    default:
      state = 'done';
      message = 'Your peer themes are unlocked';
  }
  return { steps, current, state, progress, message, eta };
}

/* ───────── Cycle calendar journey ───────── */

export interface CycleJourneyInput {
  cycle: Cycle;
  reviews: Review[];
  feedback: CycleFeedback[];
  /** Whose packets to count: `null` = everyone in the cycle, `[]` = no tallies. */
  scope: string[] | null;
  first: (id: string | undefined) => string;
  now: number;
}

export function cycleJourney({ cycle: c, reviews, feedback, scope, first, now }: CycleJourneyInput): Journey {
  const segs = timelineSegments(c);
  const counted = !scope || scope.length > 0;
  const inScope = (id: string) => !scope || scope.includes(id);
  const rs = counted ? reviews.filter((r) => r.cycleId === c.id && inScope(r.employeeId)) : [];
  const managed = rs.filter((r) => r.managerId);
  const pf = counted ? feedback.filter((f) => f.cycleId === c.id && f.kind === 'peer' && (f.status === 'requested' || f.status === 'submitted') && inScope(f.subjectId)) : [];
  const tallies: Record<PhaseKey, { done: number; total: number }> = {
    self: { done: rs.filter((r) => r.self.status === 'submitted').length, total: rs.length },
    peer: { done: pf.filter((f) => f.status === 'submitted').length, total: pf.length },
    manager: { done: managed.filter((r) => r.manager.status === 'submitted').length, total: managed.length },
    calibration: { done: managed.filter((r) => r.calibration).length, total: managed.length },
    release: { done: managed.filter((r) => r.release).length, total: managed.length },
  };
  const key = c.status === 'active' ? currentPhaseKey(c, now) : null;
  const before = c.status === 'draft' || (!!segs[0] && now < segs[0].from);
  const idx = key ? segs.findIndex((s) => s.key === key) : -1;
  const current = before ? 0 : idx >= 0 ? idx : segs.length;
  const live = before ? undefined : segs[current];

  const steps: NeoTrackStep[] = segs.map((s) => {
    const t = tallies[s.key];
    return {
      id: s.key,
      label: STAGE_LABEL[s.key],
      icon: STAGE_ICON[s.key],
      sub: t.total ? lead(`${t.done}/${t.total}`, 'done') : undefined,
      at: s === live ? countdown(s.to, now) : shortDate(s.to),
    };
  });

  let state: NeoTrackState = 'active';
  let progress = 0;
  let message: ReactNode;
  let eta: ReactNode;
  if (before) {
    state = 'paused';
    const opens = segs[0]?.from ?? c.createdAt;
    eta = etaChip('Opens', opens);
    message = then('Self-reflections open', shortDate(opens));
  } else if (live) {
    const t = tallies[live.key];
    const n = `${t.done}/${t.total}`;
    progress = t.total ? t.done / t.total : elapsed(live.from, live.to, now);
    eta = etaChip(live.key === 'calibration' ? 'Wraps' : 'Due', live.to);
    switch (live.key) {
      case 'self':
        message = t.total ? lead(n, 'self-reflections are in') : 'Self-reflections are open';
        break;
      case 'peer':
        message = t.total ? lead(n, 'peer reviews are in') : 'Peers are sharing feedback';
        break;
      case 'manager':
        message = t.total ? lead(n, 'manager reviews are written') : 'Managers are writing reviews';
        break;
      case 'calibration':
        message = lead(first(c.calibrationLockedBy ?? c.createdBy), 'and the leadership panel are calibrating ratings');
        break;
      default:
        message = t.total ? lead(n, 'reviews are shared') : 'Reviews are being shared';
    }
  } else {
    state = 'done';
    message = 'This cycle has wrapped';
  }
  return { steps, current, state, progress, message, eta };
}

/* ───────── Components ───────── */

interface Chrome {
  /** Slim bar + live label for rows and cards (no status line). */
  compact?: boolean;
  /** No card chrome — when already inside a panel or card. */
  bare?: boolean;
  hud?: ReactNode;
  /** Static title, or one picked from the journey (e.g. once it's complete). */
  title?: ReactNode | ((j: Journey) => ReactNode);
  /** Accessible name for the progress bar. */
  label?: string;
  className?: string;
}

function JourneyTracker({ journey: j, compact, bare, hud, title, label, className }: Chrome & { journey: Journey }) {
  const heading = typeof title === 'function' ? title(j) : title;
  return (
    <NeoTracker
      steps={j.steps}
      current={j.current}
      state={j.state}
      progress={j.progress}
      hud={compact ? undefined : hud}
      title={compact ? undefined : heading}
      message={compact ? undefined : j.message}
      eta={compact ? undefined : j.eta}
      compact={compact}
      bare={bare}
      label={label}
      className={cx('pf-trk', className)}
    />
  );
}

/** A review packet's journey, worded for the viewer. Renders nothing without access or a manager chain. */
export function ReviewTracker({ review, ctx, now, ...chrome }: Chrome & { review: Review; ctx: PerfCtx; now: number }) {
  const cycles = usePerf((s) => s.cycles);
  const feedback = usePerf((s) => s.cycleFeedback);
  const templates = usePerf((s) => s.templates);
  const journey = useMemo(() => {
    const cycle = cycles.find((c) => c.id === review.cycleId);
    const role = reviewAccess(ctx.v, ctx.users, review).role;
    if (!cycle || role === 'none') return null;
    const peers = feedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.subjectId === review.employeeId);
    return reviewJourney({ review, cycle, role, viewerId: ctx.me.id, first: ctx.first, peers, tpl: templateFor(templates, cycle), now });
  }, [cycles, feedback, templates, review, ctx, now]);
  return journey ? <JourneyTracker journey={journey} {...chrome} /> : null;
}

/** The employee's 360 before release (`peers` = peer items about them in this cycle). */
export function PeerTracker({ review, cycle, peers, ctx, now, ...chrome }: Chrome & { review: Review; cycle: Cycle; peers: CycleFeedback[]; ctx: PerfCtx; now: number }) {
  const journey = useMemo(() => peerJourney({ review, cycle, peers, first: ctx.first, now }), [review, cycle, peers, ctx, now]);
  return <JourneyTracker journey={journey} {...chrome} />;
}

/** The cycle calendar, with tallies for the viewer's scope (People Ops: everyone · leaders: their org). */
export function CycleTracker({ cycle, ctx, now, ...chrome }: Chrome & { cycle: Cycle; ctx: PerfCtx; now: number }) {
  const reviews = usePerf((s) => s.reviews);
  const feedback = usePerf((s) => s.cycleFeedback);
  const journey = useMemo(
    () => cycleJourney({ cycle, reviews, feedback, scope: ctx.isAdmin ? null : ctx.orgIds, first: ctx.first, now }),
    [cycle, reviews, feedback, ctx, now],
  );
  return <JourneyTracker journey={journey} {...chrome} />;
}
