/**
 * SLA & priority engine (pure).
 *
 *  - Priority matrix: impact × urgency → P1..P4 (security incidents never drop below P2).
 *  - Targets per priority: first response + resolution.
 *  - The resolution clock pauses while a ticket waits on the requester.
 */
import type { Impact, Priority, Ticket, TicketCategory, Urgency } from './types';
import { HOUR, MIN } from './meta';

export const SLA_TARGETS: Record<Priority, { response: number; resolve: number }> = {
  P1: { response: 15 * MIN, resolve: 4 * HOUR },
  P2: { response: 1 * HOUR, resolve: 8 * HOUR },
  P3: { response: 4 * HOUR, resolve: 24 * HOUR },
  P4: { response: 8 * HOUR, resolve: 72 * HOUR },
};

const MATRIX: Record<Impact, Record<Urgency, Priority>> = {
  me: { low: 'P4', normal: 'P3', high: 'P2' },
  team: { low: 'P3', normal: 'P2', high: 'P1' },
  company: { low: 'P2', normal: 'P1', high: 'P1' },
};

const RANK: Record<Priority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

/** Higher of two priorities (P1 beats P2). */
export const maxPriority = (a: Priority, b: Priority): Priority => (RANK[a] <= RANK[b] ? a : b);

/** Impact × urgency → priority. Security incidents are at least P2. */
export function priorityFor(impact: Impact, urgency: Urgency, category?: TicketCategory): Priority {
  const p = MATRIX[impact]?.[urgency] ?? 'P3';
  return category === 'security' ? maxPriority(p, 'P2') : p;
}

/** "1h", "15m", "3d", "1h 30m" */
export function formatDuration(ms: number, opts: { compact?: boolean } = {}): string {
  const neg = ms < 0;
  let s = Math.round(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  let out: string;
  if (d > 0) out = h && !opts.compact ? `${d}d ${h}h` : `${d}d`;
  else if (h > 0) out = m && !opts.compact ? `${h}h ${m}m` : `${h}h`;
  else if (m > 0) out = m < 10 && sec && !opts.compact ? `${m}m ${sec}s` : `${m}m`;
  else out = `${sec}s`;
  return neg ? `-${out}` : out;
}

/** "First response within 1h · resolution within 8h" */
export function slaPreview(priority: Priority): string {
  const t = SLA_TARGETS[priority];
  return `First response within ${formatDuration(t.response)} · resolution within ${formatDuration(t.resolve)}`;
}

export type SlaStateKind = 'met' | 'missed' | 'ok' | 'risk' | 'breached' | 'paused';

export interface SlaState {
  kind: 'response' | 'resolve';
  target: number;
  due: number;
  /** ms until due (negative when overdue / missed). */
  remaining: number;
  /** Share of the target consumed (can exceed 1). */
  pct: number;
  state: SlaStateKind;
  /** When the clock stopped (met / missed). */
  stoppedAt?: number;
}

const RISK_SHARE = 0.25;

function classify(remaining: number, target: number): SlaStateKind {
  if (remaining < 0) return 'breached';
  if (remaining < target * RISK_SHARE) return 'risk';
  return 'ok';
}

type SlaTicket = Pick<Ticket, 'priority' | 'createdAt' | 'firstResponseAt' | 'resolvedAt' | 'pausedAt' | 'pausedMs' | 'status'>;

export function responseSla(t: SlaTicket, now: number): SlaState {
  const target = SLA_TARGETS[t.priority].response;
  const due = t.createdAt + target;
  const stop = t.firstResponseAt ?? (t.status === 'resolved' ? t.resolvedAt : undefined);
  if (stop !== undefined) {
    const remaining = due - stop;
    return { kind: 'response', target, due, remaining, pct: (stop - t.createdAt) / target, state: remaining >= 0 ? 'met' : 'missed', stoppedAt: stop };
  }
  const remaining = due - now;
  return { kind: 'response', target, due, remaining, pct: (now - t.createdAt) / target, state: classify(remaining, target) };
}

export function resolveSla(t: SlaTicket, now: number): SlaState {
  const target = SLA_TARGETS[t.priority].resolve;
  const pausedNow = t.pausedAt && t.status === 'waiting' ? Math.max(0, now - t.pausedAt) : 0;
  const paused = (t.pausedMs || 0) + pausedNow;
  const due = t.createdAt + target + paused;
  if (t.status === 'resolved' && t.resolvedAt) {
    const remaining = due - t.resolvedAt;
    const spent = t.resolvedAt - t.createdAt - (t.pausedMs || 0);
    return { kind: 'resolve', target, due, remaining, pct: spent / target, state: remaining >= 0 ? 'met' : 'missed', stoppedAt: t.resolvedAt };
  }
  const elapsed = now - t.createdAt - paused;
  const remaining = due - now;
  const state: SlaStateKind = t.status === 'waiting' && remaining >= 0 ? 'paused' : classify(remaining, target);
  return { kind: 'resolve', target, due, remaining, pct: elapsed / target, state };
}

export function slaClock(t: SlaTicket, now: number) {
  return { response: responseSla(t, now), resolve: resolveSla(t, now) };
}

/** The most urgent of the two clocks — what list rows and kanban chips show. */
export function headlineSla(t: SlaTicket, now: number): SlaState {
  const { response, resolve } = slaClock(t, now);
  if (t.status === 'resolved') return resolve;
  if (response.state === 'breached') return response;
  if (resolve.state === 'breached') return resolve;
  if (!t.firstResponseAt) return response.remaining < resolve.remaining ? response : resolve;
  return resolve;
}

export const isBreaching = (t: SlaTicket, now: number) => {
  if (t.status === 'resolved') return false;
  const { response, resolve } = slaClock(t, now);
  return response.state === 'breached' || resolve.state === 'breached';
};

export const SLA_TONE: Record<SlaStateKind, string> = {
  met: 'emerald',
  missed: 'rose',
  ok: 'emerald',
  risk: 'amber',
  breached: 'rose',
  paused: 'slate',
};

/** Short human label for a clock: "42m left", "Overdue 1h", "Met", "Paused". */
export function slaLabel(s: SlaState): string {
  switch (s.state) {
    case 'met':
      return 'Met';
    case 'missed':
      return 'Missed';
    case 'paused':
      return 'Paused';
    case 'breached':
      return `Overdue ${formatDuration(-s.remaining, { compact: true })}`;
    default:
      return `${formatDuration(s.remaining, { compact: s.remaining > 3_600_000 })} left`;
  }
}

/** Median of a list (0 for empty). */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
