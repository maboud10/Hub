/**
 * Incident Command — on-call engine (pure, unit-tested): time-zone math via
 * Intl, follow-the-sun + weekly rotations, applied overrides, the swap flow
 * (Requested → Accepted → Applied) and pager fatigue (night pages measured in
 * each person's own local time).
 */
import { DAY, HOUR, MIN, SERVICES, WEEK } from './meta';
import { startOfUtcDay } from './engine';
import type { Fatigue, OnCallSlot, Override, PageRecord, PageTarget, Rotation, Severity, Shift } from './types';

/* ───────────────────────── time zones ───────────────────────── */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Minutes the zone is ahead of UTC at `ts` (Berlin in November → 60). */
export function tzOffsetMinutes(ts: number, tz: string): number {
  try {
    const parts = fmt(tz).formatToParts(new Date(ts));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const hour = get('hour') % 24;
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / MIN);
  } catch {
    return 0;
  }
}

/** Local wall-clock hour (decimal) in `tz`. */
export function localHour(ts: number, tz: string): number {
  const d = new Date(ts + tzOffsetMinutes(ts, tz) * MIN);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** Epoch ms for `hour:minute` local time in `tz`, `dayOffset` local days from `now`. DST-safe. */
export function zonedTime(now: number, tz: string, dayOffset: number, hour: number, minute = 0): number {
  const off = tzOffsetMinutes(now, tz);
  const local = new Date(now + off * MIN);
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour, minute) - off * MIN;
  const off2 = tzOffsetMinutes(guess, tz);
  return guess + (off - off2) * MIN;
}

/** Night = 22:00–07:00 in the person's own time zone. */
export function isNightIn(ts: number, tz: string): boolean {
  const h = localHour(ts, tz);
  return h >= 22 || h < 7;
}

/* ───────────────────────── rotations ───────────────────────── */

export function shiftCovering(rot: Rotation, ts: number): Shift | undefined {
  const d = new Date(ts);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return rot.shifts?.find((s) => h >= s.startUtc && h < s.endUtc);
}

function baseSlot(rot: Rotation, ts: number): { userId: string; from: number; until: number; shift?: Shift } {
  if (rot.kind === 'follow-the-sun' && rot.shifts?.length) {
    const shift = shiftCovering(rot, ts) ?? rot.shifts[0];
    const day = startOfUtcDay(ts);
    return { userId: shift.userId, from: day + shift.startUtc * HOUR, until: day + shift.endUtc * HOUR, shift };
  }
  const members = rot.members?.length ? rot.members : ['u-layla'];
  const anchor = rot.anchor ?? 0;
  const idx = Math.floor((ts - anchor) / WEEK);
  const userId = members[((idx % members.length) + members.length) % members.length];
  return { userId, from: anchor + idx * WEEK, until: anchor + (idx + 1) * WEEK };
}

/** Who carries the pager for `rot` at `ts`, after applied overrides. */
export function onCallAt(rot: Rotation, ts: number, overrides: Override[]): OnCallSlot {
  const base = baseSlot(rot, ts);
  const ov = overrides.find((o) => o.rotationId === rot.id && o.state === 'applied' && o.start <= ts && ts < o.end && o.fromUserId === base.userId);
  if (ov) return { rotationId: rot.id, userId: ov.toUserId, baseUserId: base.userId, from: Math.max(base.from, ov.start), until: Math.min(base.until, ov.end), shift: base.shift, overrideId: ov.id };
  return { rotationId: rot.id, userId: base.userId, baseUserId: base.userId, from: base.from, until: base.until, shift: base.shift };
}

export function onCallNow(rotations: Rotation[], ts: number, overrides: Override[]): OnCallSlot[] {
  return rotations.map((r) => onCallAt(r, ts, overrides));
}

/** Rotations to page for an incident: each service's rotations, plus commanders for SEV1/SEV2. SEV4 pages nobody. */
export function rotationsFor(services: string[], severity: Severity, rotations: Rotation[]): Rotation[] {
  if (severity === 'SEV4') return [];
  const ids = new Set<string>();
  for (const s of services) for (const r of SERVICES.find((x) => x.id === s)?.rotations ?? ['rot-platform']) ids.add(r);
  if (!services.length) ids.add('rot-platform');
  if (severity === 'SEV1' || severity === 'SEV2') ids.add('rot-ic');
  return rotations.filter((r) => ids.has(r.id));
}

/** De-duplicated page targets (one page per person). */
export function pageTargets(services: string[], severity: Severity, rotations: Rotation[], overrides: Override[], ts: number): PageTarget[] {
  const seen = new Set<string>();
  const out: PageTarget[] = [];
  for (const r of rotationsFor(services, severity, rotations)) {
    const slot = onCallAt(r, ts, overrides);
    if (seen.has(slot.userId)) continue;
    seen.add(slot.userId);
    out.push({ userId: slot.userId, rotationId: r.id });
  }
  return out;
}

export interface ScheduleBlock {
  from: number;
  until: number;
  userId: string;
  overridden: boolean;
  hub?: Shift['hub'];
}

/** Day-by-day schedule blocks starting at `start` (UTC day boundaries). */
export function scheduleDays(rot: Rotation, start: number, days: number, overrides: Override[]): ScheduleBlock[][] {
  const day0 = startOfUtcDay(start);
  return Array.from({ length: days }, (_, d) => {
    const day = day0 + d * DAY;
    if (rot.kind === 'follow-the-sun' && rot.shifts?.length) {
      return rot.shifts.map((s) => {
        const from = day + s.startUtc * HOUR;
        const slot = onCallAt(rot, from + 30 * MIN, overrides);
        return { from, until: day + s.endUtc * HOUR, userId: slot.userId, overridden: !!slot.overrideId, hub: s.hub };
      });
    }
    const slot = onCallAt(rot, day + 12 * HOUR, overrides);
    return [{ from: day, until: day + DAY, userId: slot.userId, overridden: !!slot.overrideId }];
  });
}

/* ───────────────────────── swaps ───────────────────────── */

export const SWAP_STEPS = ['Requested', 'Accepted', 'Applied'] as const;

/** NeoTracker stage: the request itself is done the moment it exists. */
export function swapCurrent(o: Pick<Override, 'state' | 'acceptedAt'>): number {
  if (o.state === 'applied') return 3;
  if (o.state === 'accepted') return 2;
  if (o.state === 'declined') return o.acceptedAt ? 2 : 1;
  return 1;
}

export type SwapAction = 'accept' | 'apply' | 'decline';
export type SwapResult = { ok: true; override: Override } | { ok: false; error: string };

export function advanceSwap(o: Override, action: SwapAction, actor: { id: string; lead: boolean }, now: number): SwapResult {
  const counterpart = actor.id === o.toUserId;
  const involved = counterpart || actor.id === o.fromUserId || actor.id === o.requestedBy;
  if (action === 'accept') {
    if (o.state !== 'requested') return { ok: false, error: 'Only open requests can be accepted.' };
    if (!counterpart && !actor.lead) return { ok: false, error: 'Only the person covering (or an on-call lead) can accept.' };
    return { ok: true, override: { ...o, state: 'accepted', acceptedAt: now } };
  }
  if (action === 'apply') {
    if (o.state !== 'accepted') return { ok: false, error: 'Accept the swap before applying it.' };
    if (!involved && !actor.lead) return { ok: false, error: 'Only the people swapping (or an on-call lead) can apply it.' };
    return { ok: true, override: { ...o, state: 'applied', appliedAt: now } };
  }
  if (o.state !== 'requested' && o.state !== 'accepted') return { ok: false, error: 'This swap is already closed.' };
  if (!involved && !actor.lead) return { ok: false, error: 'You are not part of this swap.' };
  return { ok: true, override: { ...o, state: 'declined', declinedAt: now } };
}

/* ───────────────────────── fatigue ───────────────────────── */

export function fatigueFor(pages: PageRecord[], userId: string, tz: string, now: number): Fatigue {
  const week = pages.filter((p) => p.userId === userId && p.at > now - WEEK && p.at <= now);
  const nights = week.filter((p) => isNightIn(p.at, tz));
  const score = Math.min(100, week.length * 6 + nights.length * 14);
  const level: Fatigue['level'] = nights.length >= 3 || score >= 60 ? 'high' : nights.length >= 1 || score >= 30 ? 'elevated' : 'ok';
  const lastNightAt = nights.length ? Math.max(...nights.map((p) => p.at)) : undefined;
  return { userId, pagesThisWeek: week.length, nightPages: nights.length, lastNightAt, score, level };
}

export function pageLoadFor(pages: PageRecord[], userId: string, tz: string, now: number): { pagesThisWeek: number; nightPages: number } {
  const f = fatigueFor(pages, userId, tz, now);
  return { pagesThisWeek: f.pagesThisWeek, nightPages: f.nightPages };
}

/** Pages per local hour-of-day (0..23) for a person over the last 7 days — the fatigue clock. */
export function pageHours(pages: PageRecord[], userId: string, tz: string, now: number): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const p of pages) if (p.userId === userId && p.at > now - WEEK && p.at <= now) out[Math.floor(localHour(p.at, tz)) % 24] += 1;
  return out;
}
