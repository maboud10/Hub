/**
 * Cycle phase engine + period helpers — pure.
 *
 * A cycle has five phases, each with its own window. Windows may overlap (peers can
 * answer while self-reflections are still being written), but the *timeline* is shown
 * as consecutive deadlines: launch → self due → peers due → manager due → calibration
 * → release. The "current phase" is the timeline segment containing now.
 */
import { PHASES } from './constants';
import type { Cycle, CycleFeedback, CyclePhase, Period, PhaseKey, Review } from './types';

const DAY = 86_400_000;

/* ───────── Periods ───────── */

export function quarterLabel(t: number): string {
  const d = new Date(t);
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Current + two previous quarters, generated relative to `now` so the story always
 * works (the current quarter is ~39% elapsed). Labels come from each window's midpoint.
 */
export function buildPeriods(now: number): Period[] {
  const q4Start = startOfDay(now - 36 * DAY);
  const q4End = startOfDay(q4Start + 92 * DAY + 12 * 3_600_000) - 1;
  const q3Start = startOfDay(q4Start - 92 * DAY + 12 * 3_600_000);
  const q2Start = startOfDay(q3Start - 91 * DAY + 12 * 3_600_000);
  const mk = (start: number, end: number): Period => {
    const label = quarterLabel((start + end) / 2);
    return { id: label.toLowerCase().replace(' ', '-'), label, start, end };
  };
  return [mk(q4Start, q4End), mk(q3Start, q4Start - 1), mk(q2Start, q3Start - 1)];
}

export function periodFor(periods: Period[], t: number): Period | undefined {
  return periods.find((p) => t >= p.start && t <= p.end);
}

/* ───────── Phases ───────── */

export type PhaseState = 'done' | 'open' | 'upcoming';

export function phaseState(phase: CyclePhase, now: number): PhaseState {
  if (now > phase.end) return 'done';
  if (now >= phase.start) return 'open';
  return 'upcoming';
}

export function getPhase(cycle: Pick<Cycle, 'phases'>, key: PhaseKey): CyclePhase | undefined {
  return cycle.phases.find((p) => p.key === key);
}

export interface Segment {
  key: PhaseKey;
  from: number;
  to: number;
}

/** Consecutive timeline segments (previous deadline → this deadline). */
export function timelineSegments(cycle: Pick<Cycle, 'phases' | 'launchedAt' | 'createdAt'>): Segment[] {
  const ordered = PHASES.map((p) => cycle.phases.find((x) => x.key === p.key)).filter((p): p is CyclePhase => !!p);
  let from = Math.min(cycle.launchedAt ?? Infinity, ordered[0]?.start ?? Infinity);
  if (!Number.isFinite(from)) from = cycle.createdAt;
  return ordered.map((p) => {
    const seg = { key: p.key, from, to: Math.max(from, p.end) };
    from = seg.to;
    return seg;
  });
}

/** The phase whose timeline segment contains now (null before launch / after the end). */
export function currentPhaseKey(cycle: Pick<Cycle, 'phases' | 'launchedAt' | 'createdAt' | 'status'>, now: number): PhaseKey | null {
  if (cycle.status === 'draft') return null;
  const segs = timelineSegments(cycle);
  if (!segs.length || now < segs[0].from) return null;
  return segs.find((s) => now <= s.to)?.key ?? null;
}

/** 0..1 position of now along the whole timeline. */
export function timelineProgress(cycle: Pick<Cycle, 'phases' | 'launchedAt' | 'createdAt'>, now: number): number {
  const segs = timelineSegments(cycle);
  if (!segs.length) return 0;
  const a = segs[0].from;
  const b = segs[segs.length - 1].to;
  return Math.max(0, Math.min(1, (now - a) / Math.max(1, b - a)));
}

/** Soonest upcoming deadline of a phase that is open or upcoming. */
export function nextDeadline(cycle: Pick<Cycle, 'phases'>, now: number): CyclePhase | null {
  return [...cycle.phases].filter((p) => p.end >= now).sort((a, b) => a.end - b.end)[0] ?? null;
}

export function isOpen(cycle: Pick<Cycle, 'phases' | 'status'>, key: PhaseKey, now: number) {
  const p = getPhase(cycle, key);
  return cycle.status === 'active' && !!p && phaseState(p, now) === 'open';
}

/** The employee can edit their self-reflection until the self phase closes (and before release). */
export function canEditSelf(cycle: Pick<Cycle, 'phases' | 'status'>, review: Pick<Review, 'release'>, now: number) {
  return isOpen(cycle, 'self', now) && !review.release;
}

/** Manager reviews unlock once the self-reflection is submitted, or once the self phase has closed. */
export function managerUnlocked(cycle: Pick<Cycle, 'phases' | 'status'>, review: Pick<Review, 'self'>, now: number) {
  if (cycle.status !== 'active') return false;
  const self = getPhase(cycle, 'self');
  return review.self.status === 'submitted' || (!!self && now > self.end);
}

/** Managers may write until calibration locks the cycle (or it closes). */
export function canWriteManager(cycle: Pick<Cycle, 'phases' | 'status' | 'calibrationLockedAt'>, review: Pick<Review, 'self' | 'release'>, now: number) {
  if (review.release || cycle.calibrationLockedAt) return false;
  const mgr = getPhase(cycle, 'manager');
  const cal = getPhase(cycle, 'calibration');
  const end = Math.max(mgr?.end ?? 0, cal?.end ?? 0);
  return managerUnlocked(cycle, review, now) && now <= end;
}

export function canAnswerPeer(cycle: Pick<Cycle, 'phases' | 'status'>, now: number) {
  const p = getPhase(cycle, 'peer');
  return cycle.status === 'active' && !!p && now <= p.end;
}

/* ───────── Building & validating phases ───────── */

/** Default offsets (days after launch) for each phase deadline. */
export const DEFAULT_PHASE_OFFSETS: Record<PhaseKey, number> = { self: 14, peer: 18, manager: 26, calibration: 30, release: 37 };

export function makePhases(launchAt: number, offsets: Record<PhaseKey, number> = DEFAULT_PHASE_OFFSETS): CyclePhase[] {
  const at = (d: number) => launchAt + d * DAY;
  return [
    { key: 'self', start: launchAt, end: at(offsets.self) },
    { key: 'peer', start: launchAt, end: at(offsets.peer) },
    { key: 'manager', start: launchAt, end: at(offsets.manager) },
    { key: 'calibration', start: at(offsets.manager), end: at(offsets.calibration) },
    { key: 'release', start: at(offsets.calibration), end: at(offsets.release) },
  ];
}

/** Returns an error message, or null when the phases are valid. */
export function validatePhases(phases: CyclePhase[]): string | null {
  const ordered = PHASES.map((p) => phases.find((x) => x.key === p.key));
  if (ordered.some((p) => !p)) return 'Every phase needs dates.';
  const ps = ordered as CyclePhase[];
  for (const p of ps) if (!(p.end > p.start)) return 'Each phase must end after it starts.';
  for (let i = 1; i < ps.length; i += 1) if (ps[i].end < ps[i - 1].end) return 'Phase deadlines must be in order.';
  return null;
}

/* ───────── Completion ───────── */

export interface Tally {
  done: number;
  total: number;
}
export const pct = (t: Tally) => (t.total ? t.done / t.total : 0);

export interface CycleCompletion {
  self: Tally;
  peer: Tally;
  upward: Tally;
  manager: Tally;
  released: Tally;
  acknowledged: Tally;
  /** Submitted self + peer + upward ÷ requested. */
  overall: Tally;
}

export function cycleCompletion(cycleId: string, reviews: Review[], feedback: CycleFeedback[]): CycleCompletion {
  const rs = reviews.filter((r) => r.cycleId === cycleId);
  const fb = feedback.filter((f) => f.cycleId === cycleId && f.status !== 'proposed' && f.status !== 'declined');
  const self = { done: rs.filter((r) => r.self.status === 'submitted').length, total: rs.length };
  const peers = fb.filter((f) => f.kind === 'peer');
  const ups = fb.filter((f) => f.kind === 'upward');
  const peer = { done: peers.filter((f) => f.status === 'submitted').length, total: peers.length };
  const upward = { done: ups.filter((f) => f.status === 'submitted').length, total: ups.length };
  const manager = { done: rs.filter((r) => r.manager.status === 'submitted').length, total: rs.length };
  const released = { done: rs.filter((r) => r.release).length, total: rs.length };
  const acknowledged = { done: rs.filter((r) => r.release?.acknowledgedAt).length, total: released.done };
  const overall = { done: self.done + peer.done + upward.done, total: self.total + peer.total + upward.total };
  return { self, peer, upward, manager, released, acknowledged, overall };
}
