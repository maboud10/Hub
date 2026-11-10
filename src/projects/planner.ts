/**
 * Focus Runway planner — slots your most important open tasks into today's
 * free time around meetings. Pure & deterministic.
 */
import { MIN, atTime, diffDays, iso } from './dates';
import type { PlanSlot, Priority } from './types';

export interface Busy {
  start: number;
  end: number;
  title?: string;
}

export interface PlanTask {
  id: string;
  title: string;
  priority: Priority;
  dueDate?: string;
  dueTime?: string;
  /** hours */
  estimate?: number;
  blocked: boolean;
  done?: boolean;
}

export interface PlanOptions {
  now: number;
  /** Day window, e.g. 08:00 → 20:00 */
  dayStart: number;
  dayEnd: number;
  busy: Busy[];
  tasks: PlanTask[];
  maxSlots?: number;
  /** Breathing room after meetings and between slots (minutes). */
  bufferMin?: number;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { urgent: 40, high: 26, medium: 14, low: 6, none: 4 };
const STEP = 15 * MIN;

export const roundUp = (ts: number, step = STEP) => Math.ceil(ts / step) * step;

/** Gaps between busy blocks inside [from, to), each block padded by `buffer`. */
export function freeGaps(busy: Busy[], from: number, to: number, bufferMin = 5): { start: number; end: number }[] {
  const buf = bufferMin * MIN;
  const blocks = busy
    .map((b) => ({ start: b.start - buf, end: b.end + buf }))
    .filter((b) => b.end > from && b.start < to)
    .sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = from;
  for (const b of blocks) {
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, to) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= to) break;
  }
  if (cursor < to) gaps.push({ start: cursor, end: to });
  return gaps.filter((g) => g.end - g.start >= 20 * MIN);
}

/** Higher = do sooner. Blocked or finished work never gets slotted. */
export function scoreTask(t: PlanTask, now: number): number {
  if (t.done || t.blocked) return -Infinity;
  let s = PRIORITY_WEIGHT[t.priority];
  if (t.dueDate) {
    const d = diffDays(iso(now), t.dueDate);
    if (d < 0) s += 45 + Math.min(10, -d * 2);
    else if (d === 0) s += 38;
    else if (d === 1) s += 22;
    else if (d <= 3) s += 12;
    else if (d <= 7) s += 6;
    if (d === 0 && t.dueTime) s += 4; // hard deadline later today
  }
  // Quick wins get a nudge so the runway always has momentum.
  const est = t.estimate ?? 1;
  if (est <= 1) s += 3;
  if (est >= 8) s -= 4;
  return s;
}

export function slotMinutes(t: PlanTask): number {
  const est = (t.estimate ?? 1) * 60;
  return Math.max(30, Math.min(120, Math.round(est / 15) * 15));
}

export function planDay(opts: PlanOptions): PlanSlot[] {
  const { now, dayStart, dayEnd, busy, tasks, maxSlots = 5, bufferMin = 5 } = opts;
  const from = roundUp(Math.max(now, dayStart));
  if (from >= dayEnd) return [];
  const gaps = freeGaps(busy, from, dayEnd, bufferMin);
  const ranked = tasks
    .map((t) => ({ t, s: scoreTask(t, now) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => b.s - a.s || (a.t.dueDate ?? '9999').localeCompare(b.t.dueDate ?? '9999') || a.t.title.localeCompare(b.t.title));
  const slots: PlanSlot[] = [];
  for (const { t } of ranked) {
    if (slots.length >= maxSlots) break;
    const want = slotMinutes(t) * MIN;
    // earliest gap that fits ≥ 75% of the block (important work goes first), else any gap ≥ 30 min
    const min75 = Math.max(30 * MIN, Math.round((want * 0.75) / STEP) * STEP);
    let gi = gaps.findIndex((g) => g.end - g.start >= min75);
    if (gi === -1) gi = gaps.findIndex((g) => g.end - g.start >= 30 * MIN);
    if (gi === -1) break;
    const len = Math.min(want, Math.floor((gaps[gi].end - gaps[gi].start) / STEP) * STEP);
    const g = gaps[gi];
    const slot = { taskId: t.id, start: g.start, end: g.start + len };
    slots.push(slot);
    const rest = slot.end + bufferMin * MIN;
    const nextStart = roundUp(rest, 5 * MIN);
    if (g.end - nextStart >= 20 * MIN) gaps[gi] = { start: nextStart, end: g.end };
    else gaps.splice(gi, 1);
  }
  return slots.sort((a, b) => a.start - b.start);
}

/** Default runway window for a day: 08:00 → 20:00 local. */
export function runwayWindow(now: number): { start: number; end: number } {
  const day = iso(now);
  return { start: atTime(day, '08:00'), end: atTime(day, '20:00') };
}

/** Move a slot to a new start, snapped to 15 minutes and kept inside the window. */
export function moveSlot(slot: PlanSlot, newStart: number, window: { start: number; end: number }): PlanSlot {
  const len = slot.end - slot.start;
  const s = Math.max(window.start, Math.min(window.end - len, Math.round(newStart / STEP) * STEP));
  return { ...slot, start: s, end: s + len };
}

export function totalMinutes(slots: PlanSlot[]): number {
  return Math.round(slots.reduce((a, s) => a + (s.end - s.start), 0) / MIN);
}
