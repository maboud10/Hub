/**
 * Incident Command — pure lifecycle + metrics engine (unit-tested).
 * Severity ordering, status transitions, the six-stage lifecycle tracker,
 * MTTA / MTTR math, durations and live clocks. No React, no stores.
 */
import { DAY, HOUR, LIFECYCLE_LABELS, MIN, WEEK } from './meta';
import type { Incident, IncidentStatus, Postmortem, Severity, TimelineEntry } from './types';

export const SEV_RANK: Record<Severity, number> = { SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 3 };

export const isActive = (i: Pick<Incident, 'status'>) => i.status !== 'resolved';

/** Most severe first, then the longest-running, then by code. */
export function sortBySeverity<T extends Pick<Incident, 'severity' | 'startedAt' | 'code'>>(list: T[]): T[] {
  return [...list].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.startedAt - b.startedAt || a.code.localeCompare(b.code));
}

export function activeIncidents(list: Incident[]): Incident[] {
  return sortBySeverity(list.filter(isActive));
}

/** Allowed status moves. `monitoring → mitigating` covers a regression; resolved is terminal (reopen = new incident). */
export const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  triggered: ['acknowledged', 'mitigating', 'monitoring', 'resolved'],
  acknowledged: ['mitigating', 'monitoring', 'resolved'],
  mitigating: ['monitoring', 'resolved'],
  monitoring: ['mitigating', 'resolved'],
  resolved: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

const STATUS_TEXT: Record<IncidentStatus, string> = {
  triggered: 'Incident triggered',
  acknowledged: 'Acknowledged',
  mitigating: 'Mitigation in progress',
  monitoring: 'Fix applied, monitoring recovery',
  resolved: 'Resolved',
};

let seq = 0;
export const rid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function timelineEntry(e: Omit<TimelineEntry, 'id'> & { id?: string }): TimelineEntry {
  return { id: e.id ?? rid('tl'), ...e };
}

export type TransitionResult = { ok: true; incident: Incident } | { ok: false; error: string };

/** Move an incident to `to`, stamping lifecycle timestamps and a timeline entry. */
export function applyTransition(inc: Incident, to: IncidentStatus, at: number, actorId?: string, note?: string): TransitionResult {
  if (inc.status === to) return { ok: false, error: `Already ${to}.` };
  if (!canTransition(inc.status, to)) return { ok: false, error: `Can’t move from ${inc.status} to ${to}.` };
  const next: Incident = { ...inc, status: to };
  if (!next.ackAt) next.ackAt = at;
  if (to === 'mitigating' && !next.mitigatingAt) next.mitigatingAt = at;
  if (to === 'monitoring') {
    if (!next.mitigatingAt) next.mitigatingAt = at;
    next.monitoringAt = at;
  }
  if (to === 'resolved') {
    next.resolvedAt = at;
    if (!next.mitigatingAt) next.mitigatingAt = at;
    if (!next.monitoringAt) next.monitoringAt = at;
  }
  if (to === 'acknowledged' && !next.paging.ackAt) next.paging = { ...next.paging, ackAt: at, ackBy: actorId ?? next.paging.targets[0]?.userId };
  next.timeline = [...inc.timeline, timelineEntry({ at, kind: 'status', source: actorId ? 'human' : 'sentinel', status: to, authorId: actorId, text: note?.trim() || STATUS_TEXT[to] })];
  return { ok: true, incident: next };
}

/**
 * Live stage for the lifecycle NeoTracker
 * (Triggered → Acknowledged → Mitigating → Monitoring → Resolved → Postmortem).
 * Resolved incidents sit on "Postmortem" until it is published (then complete = 6).
 */
export function lifecycleCurrent(inc: Pick<Incident, 'status'>, pm?: Pick<Postmortem, 'status'> | null): number {
  switch (inc.status) {
    case 'triggered':
      return 0;
    case 'acknowledged':
      return 1;
    case 'mitigating':
      return 2;
    case 'monitoring':
      return 3;
    case 'resolved':
      return pm && (pm.status === 'published' || pm.status === 'actions-complete') ? LIFECYCLE_LABELS.length : 5;
  }
}

/** Timestamps reached for each lifecycle stage (undefined = not reached). */
export function lifecycleTimes(inc: Incident, pm?: Pick<Postmortem, 'publishedAt'> | null): (number | undefined)[] {
  return [inc.startedAt, inc.ackAt, inc.mitigatingAt, inc.monitoringAt, inc.resolvedAt, pm?.publishedAt];
}

/** Effective status for read-only callers: a page whose simulated ack is due counts as acknowledged. */
export function effectiveStatus(inc: Incident, now: number): IncidentStatus {
  if (inc.status === 'triggered' && now >= inc.paging.ackDueAt) return 'acknowledged';
  return inc.status;
}

export function pagingView(inc: Incident, now: number): { state: 'paged' | 'acknowledged'; ackBy?: string; ackAt?: number } {
  if (inc.paging.ackAt) return { state: 'acknowledged', ackBy: inc.paging.ackBy, ackAt: inc.paging.ackAt };
  if (now >= inc.paging.ackDueAt) return { state: 'acknowledged', ackBy: inc.paging.targets[0]?.userId, ackAt: inc.paging.ackDueAt };
  return { state: 'paged' };
}

/* ───────────────────────── metrics ───────────────────────── */

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Mean time to acknowledge, in minutes, for incidents started since `since`. */
export function mttaMinutes(list: Incident[], since = 0): number {
  const vals = list.filter((i) => i.startedAt >= since && i.ackAt !== undefined).map((i) => (i.ackAt! - i.startedAt) / MIN);
  return Math.round(mean(vals) * 10) / 10;
}

/** Mean time to resolve, in minutes, for resolved incidents started since `since`. */
export function mttrMinutes(list: Incident[], since = 0): number {
  const vals = list.filter((i) => i.startedAt >= since && i.resolvedAt !== undefined).map((i) => (i.resolvedAt! - i.startedAt) / MIN);
  return Math.round(mean(vals));
}

/** Weekly series (oldest → newest) of MTTA / MTTR minutes or incident counts. */
export function weeklyTrend(list: Incident[], metric: 'mtta' | 'mttr' | 'count', weeks: number, now: number): number[] {
  return Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * WEEK;
    const start = end - WEEK;
    const inWeek = list.filter((x) => x.startedAt >= start && x.startedAt < end);
    if (metric === 'count') return inWeek.length;
    return metric === 'mtta' ? mttaMinutes(inWeek) : mttrMinutes(inWeek);
  });
}

export function countBySeverity(list: Incident[]): Record<Severity, number> {
  const out: Record<Severity, number> = { SEV1: 0, SEV2: 0, SEV3: 0, SEV4: 0 };
  for (const i of list) out[i.severity] += 1;
  return out;
}

/* ───────────────────────── durations & clocks ───────────────────────── */

export function durParts(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/** `HH:MM:SS` (hours keep counting past 24). */
export function clockText(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Compact English duration from minutes: `45m`, `1h 12m`, `2d 3h`. */
export function minutesText(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return `${d}d${h ? ` ${h}h` : ''}`;
}

export const startOfUtcDay = (ts: number) => Math.floor(ts / DAY) * DAY;
export const hoursBetween = (a: number, b: number) => Math.abs(b - a) / HOUR;

/** Next incident code (`INC-2048`) after the highest existing one. */
export function nextCode(list: Pick<Incident, 'code'>[]): string {
  const max = list.reduce((m, i) => Math.max(m, Number.parseInt(i.code.replace(/\D/g, ''), 10) || 0), 2000);
  return `INC-${max + 1}`;
}
