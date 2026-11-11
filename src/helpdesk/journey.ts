/**
 * Journey trackers (pure) — where a ticket or a catalog request is in its
 * lifecycle, for the NeoTracker "pizza tracker" UI.
 *
 *  - Fix tracker: Received → Triaged → In progress → Resolved. Waiting on the
 *    requester *pauses* "In progress" (like its SLA clock) instead of adding a
 *    stage, so the courier never runs backwards when the requester replies.
 *  - Request tracker: Requested → each approval step → Fulfilment → Delivered.
 *    A declined step blocks the journey; a cancelled request parks it.
 *  - Pacing: the courier sits at the share of the live stage's expected time
 *    already used — the SLA clock for tickets, the typical decision time for
 *    approvals (median of past decisions by that role), the catalog lead time
 *    for fulfilment.
 *
 * Wording lives in the UI layer (`pages/helpdesk/trackers.tsx`).
 */
import type { ApprovalRole, ApprovalStep, CatalogItem, CatalogRequest, Ticket, TicketEvent, TicketStatus } from './types';
import { median, resolveSla, responseSla, type SlaState } from './sla';
import { DAY, HOUR } from './meta';

export type TrackMood = 'active' | 'blocked' | 'paused' | 'done';

/** Share of `expected` already elapsed, clamped to 0..1. */
const share = (elapsed: number, expected: number) => (expected > 0 ? Math.max(0, Math.min(1, elapsed / expected)) : 0);

const earliest = (events: TicketEvent[], match: (e: TicketEvent) => boolean): number | undefined => {
  let at: number | undefined;
  for (const e of events) if (match(e) && (at === undefined || e.at < at)) at = e.at;
  return at;
};

/* ---------------------------------------------------------------- tickets */

export const TICKET_STAGES = ['received', 'triaged', 'in_progress', 'resolved'] as const;
export type TicketStage = (typeof TICKET_STAGES)[number];

const TICKET_STAGE_OF: Record<TicketStatus, number> = { new: 0, triaged: 1, in_progress: 2, waiting: 2, resolved: TICKET_STAGES.length };

export interface TicketTrack {
  /** Live stage index; `TICKET_STAGES.length` once resolved. */
  current: number;
  mood: TrackMood;
  /** When each stage was first reached (only the ones the ticket actually went through). */
  at: Partial<Record<TicketStage, number>>;
  /** First-response clock. */
  reply: SlaState;
  /** Resolution clock — the fix ETA. */
  fix: SlaState;
  /** The clock pacing the live stage: `reply` until IT first responds, then `fix`. */
  clock: SlaState;
  /** 0..1 — share of the live clock used (where the courier sits in the live segment). */
  progress: number;
}

export function ticketTrack(t: Ticket, now: number): TicketTrack {
  const current = TICKET_STAGE_OF[t.status] ?? 0;
  const mood: TrackMood = t.status === 'resolved' ? 'done' : t.status === 'waiting' ? 'paused' : 'active';
  const at: TicketTrack['at'] = { received: t.createdAt };
  if (current >= 1) {
    const owned = earliest(t.events, (e) => (e.kind === 'assign' && !!e.to) || (e.kind === 'status' && (e.to === 'triaged' || e.to === 'in_progress' || e.to === 'waiting')));
    if (owned !== undefined) at.triaged = owned;
  }
  if (current >= 2) {
    const started = earliest(t.events, (e) => e.kind === 'status' && (e.to === 'in_progress' || e.to === 'waiting')) ?? (t.status !== 'resolved' ? t.firstResponseAt : undefined);
    if (started !== undefined) at.in_progress = started;
  }
  if (t.status === 'resolved' && t.resolvedAt !== undefined) at.resolved = t.resolvedAt;

  const reply = responseSla(t, now);
  const fix = resolveSla(t, now);
  const clock = !t.firstResponseAt && current < 2 ? reply : fix;
  const progress = mood === 'done' ? 1 : share(clock.pct, 1);
  return { current, mood, at, reply, fix, clock, progress };
}

/* ---------------------------------------------------------------- catalog requests */

export type RequestStageKind = 'requested' | ApprovalRole | 'fulfilment' | 'delivered';

export interface RequestStage {
  kind: RequestStageKind;
  /** Approval stages: the underlying step. */
  step?: ApprovalStep;
  /** When the stage finished (submitted / decided / handed over). */
  doneAt?: number;
}

export interface RequestTrack {
  stages: RequestStage[];
  /** Live stage index; `stages.length` once fulfilled. */
  current: number;
  mood: TrackMood;
  /** When the live stage started. */
  since?: number;
  /** How long the live stage usually takes. */
  expected?: number;
  /** 0..1 — share of `expected` already used. */
  progress: number;
  /** Estimated hand-over while the request is still moving. */
  eta?: number;
}

/** Fallback turnarounds while there isn't enough decision history yet. */
export const DEFAULT_DECISION_MS: Record<ApprovalRole, number> = { manager: DAY, it: 8 * HOUR, security: DAY };

/** Median time an approver role took to decide (from step activation), or undefined with < 2 samples. */
export function typicalDecisionMs(history: readonly CatalogRequest[], role: ApprovalRole): number | undefined {
  const samples: number[] = [];
  for (const r of history) {
    let start = r.createdAt;
    for (const s of r.steps) {
      if (s.decidedAt === undefined) continue;
      if (s.role === role && s.decidedAt >= start) samples.push(s.decidedAt - start);
      start = Math.max(start, s.decidedAt);
    }
  }
  return samples.length >= 2 ? median(samples) : undefined;
}

export const decisionEstimate = (history: readonly CatalogRequest[], role: ApprovalRole) => typicalDecisionMs(history, role) ?? DEFAULT_DECISION_MS[role];

/** When the request cleared its last approval (undefined until it did). */
export function approvedAt(r: CatalogRequest): number | undefined {
  if (r.status !== 'approved' && r.status !== 'fulfilled') return undefined;
  const last = Math.max(0, ...r.steps.map((s) => s.decidedAt ?? 0));
  return last > 0 ? last : r.createdAt;
}

/** Catalog lead time from approval to hand-over (instant items still get a few hours of pacing). */
const leadTime = (item?: CatalogItem) => Math.max(4 * HOUR, (item?.etaDays ?? 1) * DAY);

export function requestTrack(r: CatalogRequest, opts: { now: number; item?: CatalogItem; history?: readonly CatalogRequest[] }): RequestTrack {
  const { now, item, history = [] } = opts;
  const stages: RequestStage[] = [
    { kind: 'requested', doneAt: r.createdAt },
    ...r.steps.map((s): RequestStage => ({ kind: s.role, step: s, doneAt: s.state === 'approved' || s.state === 'denied' ? s.decidedAt : undefined })),
    { kind: 'fulfilment', doneAt: r.fulfilment?.at },
    { kind: 'delivered', doneAt: r.fulfilment?.at },
  ];
  const fulfilIdx = 1 + r.steps.length;
  const stepIdx = (state: ApprovalStep['state']) => r.steps.findIndex((s) => s.state === state);
  const openIdx = () => {
    const pending = stepIdx('pending');
    if (pending !== -1) return pending;
    const next = r.steps.findIndex((s) => s.state !== 'approved' && s.state !== 'skipped');
    return next === -1 ? r.steps.length : next;
  };
  /** Live step's start: the latest decision before it, else submission. */
  const startOf = (idx: number) => Math.max(r.createdAt, ...r.steps.slice(0, idx).map((s) => s.decidedAt ?? 0));

  if (r.status === 'fulfilled') return { stages, current: stages.length, mood: 'done', progress: 1 };

  if (r.status === 'approved') {
    const since = approvedAt(r) ?? r.updatedAt;
    const expected = leadTime(item);
    return { stages, current: fulfilIdx, mood: 'active', since, expected, progress: share(now - since, expected), eta: since + (item?.etaDays ?? 0) * DAY };
  }

  if (r.status === 'denied') {
    const idx = stepIdx('denied');
    const at = idx === -1 ? openIdx() : idx;
    return { stages, current: 1 + at, mood: 'blocked', since: r.steps[at]?.decidedAt ?? r.updatedAt, progress: 1 };
  }

  if (r.status === 'cancelled') return { stages, current: 1 + openIdx(), mood: 'paused', since: r.updatedAt, progress: 1 };

  // pending — somewhere in the approval chain
  const idx = openIdx();
  if (idx >= r.steps.length) return { stages, current: fulfilIdx, mood: 'active', since: r.updatedAt, progress: 0 };
  const since = startOf(idx);
  const expected = decisionEstimate(history, r.steps[idx].role);
  let eta = now + Math.max(HOUR, expected - (now - since));
  for (const s of r.steps.slice(idx + 1)) if (s.state === 'waiting' || s.state === 'pending') eta += decisionEstimate(history, s.role);
  eta += (item?.etaDays ?? 0) * DAY;
  return { stages, current: 1 + idx, mood: 'active', since, expected, progress: share(now - since, expected), eta };
}
