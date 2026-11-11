/**
 * Helix Wellbeing — pure engine (no React, no stores). Unit-tested in
 * `wellbeing.test.ts`. Everything here is explainable on purpose: each score
 * and prescription carries the facts it was derived from so the UI can say
 * *why* — "2.8h of meetings + 5.5h sleep → block a 25-min reset at 14:30".
 *
 * Strings returned here are static English labels (translated by the shell's
 * DOM translator); dynamic values are always returned separately.
 */
import { hasPermission, type PermissionSet } from '@/lib/rbac';
import {
  ACTIVITY_BY_ID,
  DIMENSIONS,
  ENERGY_LEVELS,
  MILESTONES,
  MOODS,
  STEPS_PER_KM,
  TEAMS,
  WALLET_ALLOWANCE,
  hashStr,
  isoDay,
  rng,
  startOfDay,
} from './seed';
import type {
  ActivityKind,
  BreathPattern,
  BreathPhaseId,
  BreathSession,
  CalEventLite,
  CareBooking,
  CareFormat,
  CareLanguage,
  CareTopic,
  ChallengeState,
  CheckIn,
  Counsellor,
  DimensionId,
  LeaveLite,
  Level5,
  Mood,
  PerkClaimStatus,
  QuietHoursSettings,
  SignalId,
  SignalLevel,
  TeamId,
  UserWellbeing,
} from './types';

export { teamOf } from './seed';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (v: number) => Math.round(v * 10) / 10;

/* ───────────────────────── access ───────────────────────── */

export const WELLBEING_PERM = 'app:wellness';
/** `app:wellness` (or any wildcard that covers it, e.g. `*`). */
export const canUseWellbeing = (perms: PermissionSet) => hasPermission(perms, WELLBEING_PERM);

/* ───────────────────────── dates & formatting ───────────────────────── */

export function parseDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n).getTime());
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY);
}

export const isWeekendDay = (iso: string) => {
  const d = new Date(parseDay(iso)).getDay();
  return d === 0 || d === 6;
};

export const hourOf = (ts: number) => {
  const d = new Date(ts);
  return d.getHours() + d.getMinutes() / 60;
};

/** 14.5 → "14:30". */
export function formatHour(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** "Mon 30 Nov". */
export function formatDayLabel(iso: string): string {
  return new Date(parseDay(iso)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const moodLabel = (m: number) => MOODS.find((x) => x.v === m)?.label ?? 'Okay';
export const moodEmoji = (m: number) => MOODS.find((x) => x.v === m)?.emoji ?? '😐';
export const energyLabel = (e: number) => ENERGY_LEVELS.find((x) => x.v === e)?.label ?? 'Steady';

/* ───────────────────────── calendar reading ───────────────────────── */

export const isMine = (e: CalEventLite, userId: string) => e.organizerId === userId || e.attendeeIds.includes(userId);
export const endHour = (e: Pick<CalEventLite, 'startHour' | 'durationMins'>) => e.startHour + e.durationMins / 60;

/** The person's events on a day, earliest first. */
export function userDayEvents(events: CalEventLite[], userId: string, dayOffset = 0): CalEventLite[] {
  return events.filter((e) => e.dayOffset === dayOffset && isMine(e, userId)).sort((a, b) => a.startHour - b.startHour);
}

export const isMeeting = (e: CalEventLite) => e.category !== 'focus';

export interface MeetingStats {
  count: number;
  hours: number;
  focusHours: number;
  backToBack: number;
  oneOnOnes: number;
}

export function meetingStats(events: CalEventLite[], userId: string, dayOffset = 0): MeetingStats {
  const mine = userDayEvents(events, userId, dayOffset);
  const meetings = mine.filter(isMeeting);
  let backToBack = 0;
  for (let i = 1; i < meetings.length; i += 1) {
    if (meetings[i].startHour - endHour(meetings[i - 1]) < 10 / 60) backToBack += 1;
  }
  return {
    count: meetings.length,
    hours: round1(sum(meetings.map((m) => m.durationMins)) / 60),
    focusHours: round1(sum(mine.filter((e) => !isMeeting(e)).map((e) => e.durationMins)) / 60),
    backToBack,
    oneOnOnes: meetings.filter((m) => m.category === '1on1').length,
  };
}

/* ───────────────────────── free-gap finder ───────────────────────── */

export interface GapOptions {
  userId: string;
  dayOffset?: number;
  /** Current hour (decimal) — gaps never start in the past on day 0. */
  nowHour?: number;
  dayStart?: number;
  dayEnd?: number;
  /** Breathing room kept around events. */
  bufferMins?: number;
}

export interface Gap {
  start: number;
  end: number;
}

const FIVE = 5 / 60;
const ceil5 = (h: number) => Math.ceil(h / FIVE - 1e-9) * FIVE;
const floor5 = (h: number) => Math.floor(h / FIVE + 1e-9) * FIVE;

/** Free intervals inside the working day for one person. */
export function freeGaps(events: CalEventLite[], opts: GapOptions): Gap[] {
  const { userId, dayOffset = 0, nowHour, dayStart = 8, dayEnd = 18, bufferMins = 0 } = opts;
  const buf = bufferMins / 60;
  const busy = userDayEvents(events, userId, dayOffset)
    .map((e) => [e.startHour - buf, endHour(e) + buf] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of busy) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  let cursor = dayStart;
  if (dayOffset === 0 && nowHour !== undefined) cursor = Math.max(cursor, ceil5(nowHour));
  const gaps: Gap[] = [];
  for (const [s, e] of merged) {
    if (cursor >= dayEnd) break;
    if (s > cursor) gaps.push({ start: cursor, end: Math.min(s, dayEnd) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });
  return gaps.filter((g) => g.end - g.start > 1e-6);
}

/**
 * The free slot of `durationMins` closest to `preferHour` (default 14:30 — just
 * after the post-lunch dip), on 5-minute boundaries. `null` when the day is full.
 */
export function findFreeGap(events: CalEventLite[], opts: GapOptions & { durationMins: number; preferHour?: number }): { dayOffset: number; startHour: number; endHour: number } | null {
  const dur = opts.durationMins / 60;
  const prefer = opts.preferHour ?? 14.5;
  let best: { start: number; dist: number } | null = null;
  for (const g of freeGaps(events, opts)) {
    const lo = ceil5(g.start);
    const hi = floor5(g.end - dur);
    if (lo > hi + 1e-9) continue;
    const start = clamp(Math.round(prefer / FIVE) * FIVE, lo, hi);
    const dist = Math.abs(start - prefer);
    if (!best || dist < best.dist - 1e-9) best = { start, dist };
  }
  if (!best) return null;
  const startHour = Math.round(best.start * 60) / 60;
  return { dayOffset: opts.dayOffset ?? 0, startHour, endHour: startHour + dur };
}

/** Minutes until the next event if the person is free right now (0 when busy). */
export function freeNowMinutes(events: CalEventLite[], userId: string, nowHour: number, dayEnd = 18): number {
  const mine = userDayEvents(events, userId, 0);
  if (mine.some((e) => e.startHour <= nowHour && endHour(e) > nowHour)) return 0;
  const next = mine.find((e) => e.startHour > nowHour);
  return Math.max(0, Math.round(((next ? next.startHour : Math.max(nowHour, dayEnd)) - nowHour) * 60));
}

/* ───────────────────────── dimensions & recharge score ───────────────────────── */

export function sleepScore(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return clamp(Math.round(100 - Math.max(0, 7.5 - hours) * 22 - Math.max(0, hours - 9.5) * 8), 5, 100);
}

export function movementScore(stepsToday: number, goal: number, weekActiveMins: number): number {
  const s = goal > 0 ? Math.min(1, stepsToday / goal) : 0;
  const w = Math.min(1, weekActiveMins / 150);
  return clamp(Math.round(15 + 45 * s + 40 * w), 5, 100);
}

export function focusScore(m: Pick<MeetingStats, 'hours' | 'focusHours' | 'backToBack'>): number {
  return clamp(Math.round(92 - Math.max(0, m.hours - 1.5) * 13 + Math.min(2, m.focusHours) * 8 - m.backToBack * 6), 5, 100);
}

export function connectionScore(i: { mood: number; oneOnOnesWeek: number; circles: number; kudos30d: number }): number {
  return clamp(Math.round(48 + (i.mood - 3) * 9 + Math.min(2, i.oneOnOnesWeek) * 9 + Math.min(2, i.circles) * 6 + Math.min(3, i.kudos30d) * 5), 5, 100);
}

export function calmScore(i: { stress: number; calmMinsWeek: number; afterHours: number }): number {
  return clamp(Math.round(96 - (i.stress - 1) * 15 + Math.min(40, i.calmMinsWeek) * 0.45 - Math.min(10, i.afterHours) * 2.5), 5, 100);
}

/** Weighted blend of the five dimensions (weights sum to 1). */
export function rechargeScore(scores: Record<DimensionId, number>): number {
  let s = 0;
  for (const d of DIMENSIONS) s += d.weight * clamp(scores[d.id] ?? 0, 0, 100);
  return Math.round(s);
}

export interface Driver {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}

export interface DimensionReading {
  id: DimensionId;
  score: number;
  /** Derived from yesterday's check-in (today's is missing). */
  estimated: boolean;
  drivers: Driver[];
}

export interface AuraContext {
  /** Today's check-in, if any. */
  checkin: Pick<CheckIn, 'mood' | 'energy' | 'stress' | 'sleepHours'> | null;
  /** Most recent earlier check-in (used for estimates). */
  previous: Pick<CheckIn, 'mood' | 'energy' | 'stress' | 'sleepHours'> | null;
  stepsToday: number;
  stepGoal: number;
  weekActiveMins: number;
  meeting: MeetingStats;
  oneOnOnesWeek: number;
  circles: number;
  kudos30d: number;
  calmMinsWeek: number;
  afterHours: number;
}

const tone = (score: number): Driver['tone'] => (score >= 70 ? 'good' : score >= 45 ? 'warn' : 'bad');

export function readDimensions(ctx: AuraContext): DimensionReading[] {
  const base = ctx.checkin ?? ctx.previous ?? { mood: 3 as Mood, energy: 3 as Level5, stress: 3 as Level5, sleepHours: 7 };
  const estimated = !ctx.checkin;
  const sleep = sleepScore(base.sleepHours);
  const movement = movementScore(ctx.stepsToday, ctx.stepGoal, ctx.weekActiveMins);
  const focus = focusScore(ctx.meeting);
  const connection = connectionScore({ mood: base.mood, oneOnOnesWeek: ctx.oneOnOnesWeek, circles: ctx.circles, kudos30d: ctx.kudos30d });
  const calm = calmScore({ stress: base.stress, calmMinsWeek: ctx.calmMinsWeek, afterHours: ctx.afterHours });
  const debt = Math.max(0, 7.5 - base.sleepHours);
  return [
    {
      id: 'sleep',
      score: sleep,
      estimated,
      drivers: [
        { label: estimated ? 'Last check-in' : 'Last night', value: `${base.sleepHours}h`, tone: tone(sleep) },
        { label: 'Target', value: '7.5h' },
        debt > 0 ? { label: 'Sleep debt', value: `${round1(debt)}h`, tone: debt >= 1.5 ? 'bad' : 'warn' } : { label: 'On target', value: '✓', tone: 'good' },
      ],
    },
    {
      id: 'movement',
      score: movement,
      estimated: false,
      drivers: [
        { label: 'Steps today', value: ctx.stepsToday.toLocaleString('en-US'), tone: tone(Math.min(100, (ctx.stepsToday / Math.max(1, ctx.stepGoal)) * 100)) },
        { label: 'Daily goal', value: ctx.stepGoal.toLocaleString('en-US') },
        { label: 'Active minutes (7 days)', value: `${ctx.weekActiveMins}m`, tone: ctx.weekActiveMins >= 150 ? 'good' : ctx.weekActiveMins >= 75 ? 'warn' : 'bad' },
      ],
    },
    {
      id: 'focus',
      score: focus,
      estimated: false,
      drivers: [
        { label: 'Meetings today', value: `${ctx.meeting.count} · ${ctx.meeting.hours}h`, tone: ctx.meeting.hours >= 4 ? 'bad' : ctx.meeting.hours >= 2.5 ? 'warn' : 'good' },
        { label: 'Protected focus', value: `${ctx.meeting.focusHours}h`, tone: ctx.meeting.focusHours >= 1.5 ? 'good' : ctx.meeting.focusHours > 0 ? 'warn' : 'bad' },
        { label: 'Back-to-back', value: String(ctx.meeting.backToBack), tone: ctx.meeting.backToBack ? 'warn' : 'good' },
      ],
    },
    {
      id: 'connection',
      score: connection,
      estimated,
      drivers: [
        { label: '1:1s this week', value: String(ctx.oneOnOnesWeek), tone: ctx.oneOnOnesWeek ? 'good' : 'warn' },
        { label: 'Kudos received (30 days)', value: String(ctx.kudos30d), tone: ctx.kudos30d ? 'good' : undefined },
        { label: 'Care circles', value: String(ctx.circles) },
      ],
    },
    {
      id: 'calm',
      score: calm,
      estimated,
      drivers: [
        { label: estimated ? 'Last stress level' : 'Stress today', value: `${base.stress}/5`, tone: base.stress >= 4 ? 'bad' : base.stress === 3 ? 'warn' : 'good' },
        { label: 'Calm minutes (7 days)', value: `${ctx.calmMinsWeek}m`, tone: ctx.calmMinsWeek >= 20 ? 'good' : 'warn' },
        { label: 'After-hours activity', value: String(ctx.afterHours), tone: ctx.afterHours > 3 ? 'bad' : ctx.afterHours > 0 ? 'warn' : 'good' },
      ],
    },
  ];
}

export function scoresOf(readings: DimensionReading[]): Record<DimensionId, number> {
  return Object.fromEntries(readings.map((r) => [r.id, r.score])) as Record<DimensionId, number>;
}

export const EMPTY_MEETINGS: MeetingStats = { count: 0, hours: 0, focusHours: 0, backToBack: 0, oneOnOnes: 0 };

/**
 * Today's Recharge score from Wellbeing's own data only (no calendar) — the
 * bridge fallback when Aura hasn't recorded a fuller score yet. Null without a
 * check-in today.
 */
export function quickRecharge(user: UserWellbeing, now: number, meeting: MeetingStats = EMPTY_MEETINGS): number | null {
  const today = isoDay(now);
  const checkin = todaysCheckin(user.checkins, today);
  if (!checkin) return null;
  const readings = readDimensions({
    checkin,
    previous: null,
    stepsToday: stepsOn(user, today, now),
    stepGoal: user.stepGoal,
    weekActiveMins: weekActiveMinutes(user, now),
    meeting,
    oneOnOnesWeek: 0,
    circles: user.circles.length,
    kudos30d: 0,
    calmMinsWeek: calmMinutes(user.breaths, startOfDay(now) - 6 * DAY),
    afterHours: 0,
  });
  return rechargeScore(scoresOf(readings));
}

/** One-line headline about the weakest dimension (static sentence per dimension). */
export const WEAKEST_LINE: Record<DimensionId, string> = {
  sleep: 'Sleep is holding your aura back today. Protect tonight’s wind-down.',
  movement: 'Movement is your quietest dimension. A short walk lifts everything else.',
  focus: 'Your calendar is crowding out focus. Guard one deep-work block.',
  connection: 'Connection is running low. A walk-and-talk or a kind word helps.',
  calm: 'Calm is your lowest dimension. Two minutes of breathing goes a long way.',
};

export function weakest(readings: DimensionReading[]): DimensionReading {
  return [...readings].sort((a, b) => a.score - b.score)[0];
}

/** Visual parameters for the living aura orb. */
export function auraVisual(readings: DimensionReading[], recharge: number | null) {
  const sorted = [...readings].sort((a, b) => b.score - a.score);
  const color = (id: DimensionId) => DIMENSIONS.find((d) => d.id === id)?.color ?? '#fb7185';
  const calm = readings.find((r) => r.id === 'calm')?.score ?? 50;
  return {
    c1: color(sorted[0].id),
    c2: color(sorted[1].id),
    c3: color(sorted[sorted.length - 1].id),
    /** Calmer auras breathe slower. */
    pulseSecs: round1(3 + (calm / 100) * 3.5),
    scale: recharge === null ? 0.86 : round1(0.84 + (recharge / 100) * 0.24 + 0.001),
  };
}

/* ───────────────────────── energy forecast ───────────────────────── */

const gauss = (x: number, mu: number, s: number) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Typical circadian energy (0..100): morning rise, late-morning peak, post-lunch dip, second wind, wind-down. */
export function circadian(h: number): number {
  return 52 + 26 * gauss(h, 10.5, 1.6) - 16 * gauss(h, 14.25, 1.1) + 14 * gauss(h, 17, 1.3) - 18 * sigmoid((h - 20) * 1.4) - 10 * sigmoid((8 - h) * 2);
}

export interface ForecastInput {
  /** The person's events today. */
  events: CalEventLite[];
  checkin: Pick<CheckIn, 'energy' | 'stress' | 'sleepHours'> | null;
  fromHour?: number;
  toHour?: number;
  step?: number;
  /** Earliest start for the best-window search (e.g. the current hour). */
  peakFrom?: number;
}

export interface ForecastDip {
  hour: number;
  energy: number;
  reason: 'circadian' | 'meetings' | 'sleep';
}

/** Decayed minutes of meetings before `h` (half-life 75 minutes). */
export function meetingLoad(h: number, events: CalEventLite[]): number {
  let load = 0;
  for (const m of events) {
    if (!isMeeting(m)) continue;
    const end = Math.min(endHour(m), h);
    for (let t = m.startHour; t < end - 1e-9; t += 1 / 12) load += 5 * Math.pow(0.5, (h - t) / 1.25);
  }
  return load;
}

export function energyAt(h: number, input: ForecastInput): number {
  const c = input.checkin;
  const sleep = c?.sleepHours ?? 7;
  const debt = Math.max(0, 7.5 - sleep);
  const stress = c?.stress ?? 3;
  const drain = 1 + (stress - 3) * 0.15;
  let e = circadian(h) - debt * 5 - debt * 3 * gauss(h, 14.5, 1.2) + ((c?.energy ?? 3) - 3) * 5 - (stress - 3) * 2.5;
  e -= meetingLoad(h, input.events) * 0.11 * drain;
  if (input.events.some((m) => isMeeting(m) && m.startHour <= h && endHour(m) > h)) e -= 3;
  for (const r of input.events) {
    if (/^recharge/i.test(r.title) || r.linkedContext?.app === 'wellbeing') e += 8 * gauss(h, endHour(r) + 0.25, 0.6);
  }
  return clamp(Math.round(e), 5, 98);
}

export function energyForecast(input: ForecastInput) {
  const from = input.fromHour ?? 7;
  const to = input.toHour ?? 21;
  const step = input.step ?? 0.25;
  const points: { hour: number; energy: number }[] = [];
  for (let h = from; h <= to + 1e-9; h += step) points.push({ hour: Math.round(h * 100) / 100, energy: energyAt(h, input) });

  const debt = Math.max(0, 7.5 - (input.checkin?.sleepHours ?? 7));
  const raw: ForecastDip[] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    if (p.hour < 9 || p.hour > 19) continue;
    if (p.energy < points[i - 1].energy && p.energy <= points[i + 1].energy && p.energy < 52) {
      const load = meetingLoad(p.hour, input.events);
      const reason: ForecastDip['reason'] = load >= 45 ? 'meetings' : p.hour >= 13 && p.hour <= 16 ? 'circadian' : debt >= 1 ? 'sleep' : 'circadian';
      raw.push({ hour: p.hour, energy: p.energy, reason });
    }
  }
  const dips: ForecastDip[] = [];
  for (const d of raw.sort((a, b) => a.energy - b.energy)) {
    if (dips.length >= 3) break;
    if (dips.every((x) => Math.abs(x.hour - d.hour) >= 1.25)) dips.push(d);
  }
  dips.sort((a, b) => a.hour - b.hour);

  // Best 90-minute window inside the (remaining) working day.
  const span = Math.round(1.5 / step);
  const search = (startAt: number) => {
    let best = { start: 9, end: 10.5, energy: 0 };
    for (let i = 0; i + span < points.length; i += 1) {
      if (points[i].hour < startAt - 1e-9 || points[i + span].hour > 18) continue;
      const avg = sum(points.slice(i, i + span + 1).map((p) => p.energy)) / (span + 1);
      if (avg > best.energy) best = { start: points[i].hour, end: points[i + span].hour, energy: Math.round(avg) };
    }
    return best;
  };
  const from8 = Math.max(8, input.peakFrom ?? 8);
  let peak = search(Math.ceil(from8 / step) * step);
  if (peak.energy === 0) peak = search(8);
  return { points, dips, peak };
}

export const DIP_REASON: Record<ForecastDip['reason'], string> = {
  circadian: 'Post-lunch circadian dip',
  meetings: 'Back-to-back meetings',
  sleep: 'Sleep debt catching up',
};

/* ───────────────────────── breathing ───────────────────────── */

export const cycleSecs = (p: Pick<BreathPattern, 'phases'>) => sum(p.phases.map((x) => x.secs));

export interface PhaseState {
  index: number;
  phase: BreathPhaseId;
  secsInto: number;
  secsLeft: number;
  /** 0..1 progress through the current phase. */
  progress: number;
  /** Completed full cycles. */
  cycle: number;
}

export function phaseAt(p: Pick<BreathPattern, 'phases'>, elapsedSec: number): PhaseState {
  const total = cycleSecs(p);
  const e = Math.max(0, elapsedSec);
  const t = e % total;
  let acc = 0;
  for (let i = 0; i < p.phases.length; i += 1) {
    const ph = p.phases[i];
    if (t < acc + ph.secs - 1e-9) {
      const into = t - acc;
      return { index: i, phase: ph.phase, secsInto: into, secsLeft: ph.secs - into, progress: into / ph.secs, cycle: Math.floor(e / total + 1e-9) };
    }
    acc += ph.secs;
  }
  const last = p.phases[p.phases.length - 1];
  return { index: p.phases.length - 1, phase: last.phase, secsInto: last.secs, secsLeft: 0, progress: 1, cycle: Math.floor(e / total) };
}

/** Whole cycles that fit a session (at least one), so sessions end on an exhale. */
export const sessionCycles = (p: Pick<BreathPattern, 'phases'>, minutes: number) => Math.max(1, Math.round((minutes * 60) / cycleSecs(p)));
export const sessionSecs = (p: Pick<BreathPattern, 'phases'>, minutes: number) => sessionCycles(p, minutes) * cycleSecs(p);

/* ───────────────────────── streaks, journal & timeline ───────────────────────── */

/** Consecutive days with a check-in, ending today (or yesterday if today is still open). */
export function checkinStreak(checkins: Pick<CheckIn, 'date'>[], today: string): number {
  const days = new Set(checkins.map((c) => c.date));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor) && n < 3650) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Consecutive days with at least one breathwork session. */
export function calmStreak(breaths: Pick<BreathSession, 'at'>[], today: string): number {
  return checkinStreak(breaths.map((b) => ({ date: isoDay(b.at) })), today);
}

export function calmMinutes(breaths: Pick<BreathSession, 'at' | 'minutes'>[], sinceTs: number): number {
  return Math.round(sum(breaths.filter((b) => b.at >= sinceTs).map((b) => b.minutes)));
}

export function todaysCheckin(checkins: CheckIn[], today: string): CheckIn | null {
  return checkins.find((c) => c.date === today) ?? null;
}

export function previousCheckin(checkins: CheckIn[], today: string): CheckIn | null {
  return [...checkins].filter((c) => c.date < today).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}

/** Launchpad pulse vote for today, used to prefill the check-in mood. */
export function prefillMood(pulse: Record<string, { date: string; mood: number }>, userId: string, today: string): Mood | null {
  const v = pulse[userId];
  return v && v.date === today && v.mood >= 1 && v.mood <= 5 ? (v.mood as Mood) : null;
}

export function moodTimeline(checkins: CheckIn[], today: string, days = 7) {
  const out: { date: string; label: string; mood: Mood | null; energy: number | null }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const c = checkins.find((x) => x.date === date);
    out.push({
      date,
      label: new Date(parseDay(date)).toLocaleDateString('en-US', { weekday: 'short' }),
      mood: c?.mood ?? null,
      energy: c?.energy ?? null,
    });
  }
  return out;
}

/* ───────────────────────── movement ───────────────────────── */

export const activitySteps = (kind: ActivityKind, minutes: number) => Math.round(ACTIVITY_BY_ID[kind].stepsPerMin * Math.max(0, minutes));
export const stepsToKm = (steps: number) => Math.round((steps / STEPS_PER_KM) * 100) / 100;

/** Steps synced so far today (phone/watch), ramping across the waking day. */
export function passiveStepsToday(stepsAvg: number, now: number): number {
  const frac = clamp((hourOf(now) - 7) / 14, 0, 1);
  return Math.round(stepsAvg * 0.7 * frac);
}

export function stepsOn(user: Pick<UserWellbeing, 'steps' | 'activities' | 'profile'>, date: string, now: number): number {
  const passive = date === isoDay(now) ? passiveStepsToday(user.profile.stepsAvg, now) : (user.steps.find((s) => s.date === date)?.steps ?? 0);
  return passive + sum(user.activities.filter((a) => a.date === date).map((a) => a.steps));
}

export function weekSteps(user: Pick<UserWellbeing, 'steps' | 'activities' | 'profile'>, now: number) {
  const today = isoDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, label: new Date(parseDay(date)).toLocaleDateString('en-US', { weekday: 'short' }), steps: stepsOn(user, date, now), today: date === today };
  });
}

export function weekActiveMinutes(user: Pick<UserWellbeing, 'activities'>, now: number): number {
  const since = startOfDay(now) - 6 * DAY;
  return sum(user.activities.filter((a) => a.at >= since).map((a) => a.minutes));
}

export interface TeamStanding {
  id: TeamId;
  label: string;
  km: number;
  pct: number;
  participants: number;
  rank: number;
  milestones: number;
}

/** Count of milestones reached for a route fraction. */
export const milestonesReached = (pct: number) => MILESTONES.filter((m) => pct + 1e-9 >= m.pct).length;

export function teamStandings(challenge: ChallengeState, users: Record<string, Pick<UserWellbeing, 'activities'>>): TeamStanding[] {
  const extra: Record<string, number> = {};
  for (const u of Object.values(users)) for (const a of u.activities) if (a.at >= challenge.startedAt) extra[a.teamId] = (extra[a.teamId] ?? 0) + a.km;
  const rows = challenge.teams.map((t) => {
    const km = Math.round((t.baseKm + (extra[t.id] ?? 0)) * 10) / 10;
    const pct = km / challenge.goalKm;
    return { id: t.id, label: TEAMS.find((x) => x.id === t.id)?.label ?? t.id, km, pct, participants: t.participants, rank: 0, milestones: milestonesReached(pct) };
  });
  [...rows].sort((a, b) => b.km - a.km).forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/* ───────────────────────── leave & recharge days ───────────────────────── */

const REST_TYPES = new Set(['annual', 'hajj', 'parental', 'compassionate', 'unpaid']);

/** Days since the end of the person's last restful leave (null when none is on record). */
export function daysSinceLastLeave(leave: LeaveLite[], userId: string, today: string): number | null {
  const past = leave.filter((l) => l.userId === userId && l.status === 'approved' && REST_TYPES.has(l.type) && l.start <= today);
  if (!past.length) return null;
  const lastEnd = past.map((l) => (l.end < today ? l.end : today)).sort().pop()!;
  return Math.max(0, daysBetween(lastEnd, today));
}

/** Days until the next booked (approved or pending) restful leave, or null. */
export function daysUntilNextLeave(leave: LeaveLite[], userId: string, today: string): number | null {
  const next = leave
    .filter((l) => l.userId === userId && (l.status === 'approved' || l.status === 'pending') && REST_TYPES.has(l.type) && l.start > today)
    .map((l) => l.start)
    .sort()[0];
  return next ? daysBetween(today, next) : null;
}

/**
 * The single leave day that buys the longest unbroken break (weekends + public
 * holidays around it), at least `minNotice` days out. Ties → earliest.
 */
export function bestBridgeDay(today: string, holidays: ReadonlySet<string>, opts: { minNotice?: number; horizon?: number } = {}): { date: string; daysOff: number; holiday: boolean } | null {
  const minNotice = opts.minNotice ?? 14;
  const horizon = opts.horizon ?? 75;
  const off = (d: string, leaveDay: string) => d === leaveDay || isWeekendDay(d) || holidays.has(d);
  let best: { date: string; daysOff: number; holiday: boolean } | null = null;
  for (let i = minNotice; i <= horizon; i += 1) {
    const d = addDays(today, i);
    if (isWeekendDay(d) || holidays.has(d)) continue;
    let start = d;
    let end = d;
    while (off(addDays(start, -1), d) && daysBetween(addDays(start, -1), d) < 30) start = addDays(start, -1);
    while (off(addDays(end, 1), d) && daysBetween(d, addDays(end, 1)) < 30) end = addDays(end, 1);
    const daysOff = daysBetween(start, end) + 1;
    let holiday = false;
    for (let x = start; x <= end; x = addDays(x, 1)) if (holidays.has(x)) holiday = true;
    if (!best || daysOff > best.daysOff) best = { date: d, daysOff, holiday };
  }
  return best;
}

/* ───────────────────────── Nova recharge prescriptions ───────────────────────── */

export type RxId = 'care' | 'reset' | 'breathe' | 'recharge-day' | 'walk1on1' | 'focus' | 'move' | 'wind-down' | 'win';

export interface Prescription {
  id: RxId;
  priority: number;
  title: string;
  /** Dynamic chip next to the title (time, date, name). */
  chip?: string;
  facts: { label: string; value: string }[];
  because: string;
  cta: string;
  tone: 'app' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose';
  payload?: { dayOffset?: number; startHour?: number; eventId?: string; date?: string };
}

export interface RxContext {
  checkin: Pick<CheckIn, 'mood' | 'energy' | 'stress' | 'sleepHours'>;
  meeting: MeetingStats;
  /** Best free slot for a 25-minute reset today. */
  gap: { dayOffset: number; startHour: number } | null;
  oneOnOne: { eventId: string; startHour: number; dayOffset: number; withName: string } | null;
  focusRunning: boolean;
  freeNowMins: number;
  daysSinceLeave: number | null;
  daysUntilLeave: number | null;
  bridgeDay: { date: string; daysOff: number; holiday: boolean } | null;
  stepsToday: number;
  stepGoal: number;
  hourNow: number;
  quietStart: number;
}

export function prescribe(ctx: RxContext, limit = 3): Prescription[] {
  const { checkin: c, meeting: m } = ctx;
  const out: Prescription[] = [];

  if (c.mood <= 2 || c.stress === 5) {
    out.push({
      id: 'care',
      priority: 100,
      title: 'Talk to someone today',
      facts: [
        { label: 'Mood', value: moodLabel(c.mood) },
        { label: 'Stress', value: `${c.stress}/5` },
      ],
      because: 'Confidential counsellors in English and Arabic, 24/7. Your employer never sees who uses Care.',
      cta: 'Open Care',
      tone: 'violet',
    });
  }

  const heavy = m.hours >= 2.5;
  const short = c.sleepHours < 6.5;
  if ((heavy || short || c.stress >= 4) && ctx.gap) {
    out.push({
      id: 'reset',
      priority: 80 + (c.sleepHours < 6 ? 6 : 0) + (m.hours >= 4 ? 6 : 0),
      title: 'Block a 25-min reset',
      chip: formatHour(ctx.gap.startHour),
      facts: [
        { label: 'Meetings today', value: `${m.hours}h` },
        { label: 'Sleep', value: `${c.sleepHours}h` },
      ],
      because: heavy && short
        ? 'Heavy meetings on short sleep make a sharper afternoon dip. A short reset beats a third coffee.'
        : heavy
          ? 'Meeting-heavy days drain focus. A 25-minute reset protects the rest of your afternoon.'
          : 'Short sleep lowers your afternoon energy. A reset now saves your evening.',
      cta: 'Block it',
      tone: 'app',
      payload: { dayOffset: ctx.gap.dayOffset, startHour: ctx.gap.startHour },
    });
  }

  if (c.stress >= 3) {
    out.push({
      id: 'breathe',
      priority: 60 + (c.stress - 3) * 12,
      title: 'Two-minute box breath',
      chip: 'Now',
      facts: [{ label: 'Stress', value: `${c.stress}/5` }],
      because: 'Slow, even breathing settles your nervous system in about 90 seconds.',
      cta: 'Breathe now',
      tone: 'cyan',
    });
  }

  const leaveSoon = ctx.daysUntilLeave !== null && ctx.daysUntilLeave <= 45;
  if (ctx.daysSinceLeave !== null && ctx.daysSinceLeave >= 60 && !leaveSoon) {
    out.push({
      id: 'recharge-day',
      priority: 55 + Math.min(25, (ctx.daysSinceLeave - 60) / 4),
      title: 'Plan a recharge day',
      chip: ctx.bridgeDay ? formatDayLabel(ctx.bridgeDay.date) : undefined,
      facts: [
        { label: 'Days since your last leave', value: String(ctx.daysSinceLeave) },
        ...(ctx.bridgeDay ? [{ label: 'Days off in a row', value: String(ctx.bridgeDay.daysOff) }] : []),
      ],
      because: ctx.bridgeDay?.holiday
        ? 'Nova found a bridge day next to a weekend and public holidays: one day of leave, a much longer break.'
        : 'A long weekend resets more than a weekend. Book it before you run on empty.',
      cta: 'Request day off',
      tone: 'emerald',
      payload: ctx.bridgeDay ? { date: ctx.bridgeDay.date } : undefined,
    });
  }

  if (ctx.oneOnOne && ctx.stepsToday < ctx.stepGoal * 0.75) {
    out.push({
      id: 'walk1on1',
      priority: 58,
      title: 'Walk your 1:1',
      chip: ctx.oneOnOne.withName,
      facts: [
        { label: '1:1 at', value: formatHour(ctx.oneOnOne.startHour) },
        { label: 'Steps today', value: ctx.stepsToday.toLocaleString('en-US') },
      ],
      because: 'Side-by-side conversations feel easier, and a 30-minute walk adds about 3,000 steps.',
      cta: 'Make it a walk',
      tone: 'amber',
      payload: { eventId: ctx.oneOnOne.eventId, dayOffset: ctx.oneOnOne.dayOffset, startHour: ctx.oneOnOne.startHour },
    });
  }

  if (!ctx.focusRunning && m.focusHours < 1 && ctx.freeNowMins >= 30) {
    out.push({
      id: 'focus',
      priority: 52,
      title: 'Start a 25-min focus sprint',
      facts: [
        { label: 'Protected focus today', value: `${m.focusHours}h` },
        { label: 'Free right now', value: `${ctx.freeNowMins}m` },
      ],
      because: 'One protected deep-work block lowers context-switching fatigue for the whole day.',
      cta: 'Start sprint',
      tone: 'violet',
    });
  }

  if (ctx.stepsToday < ctx.stepGoal * 0.4 && ctx.hourNow >= 12) {
    out.push({
      id: 'move',
      priority: 45,
      title: 'Take a 10-minute walk',
      facts: [
        { label: 'Steps today', value: ctx.stepsToday.toLocaleString('en-US') },
        { label: 'Daily goal', value: ctx.stepGoal.toLocaleString('en-US') },
      ],
      because: 'A short walk after your next meeting restores focus for the following hour.',
      cta: 'Log a walk',
      tone: 'emerald',
    });
  }

  if (c.sleepHours < 6.5 && ctx.hourNow < ctx.quietStart) {
    out.push({
      id: 'wind-down',
      priority: 40,
      title: 'Wind down early tonight',
      chip: formatHour(ctx.quietStart),
      facts: [{ label: 'Sleep last night', value: `${c.sleepHours}h` }],
      because: 'Quiet hours hold work pings in the evening so you can be in bed on time.',
      cta: 'Review quiet hours',
      tone: 'violet',
    });
  }

  if (c.mood >= 4 && c.energy >= 4) {
    out.push({
      id: 'win',
      priority: 35,
      title: 'Bank the good day',
      facts: [
        { label: 'Mood', value: moodLabel(c.mood) },
        { label: 'Energy', value: energyLabel(c.energy) },
      ],
      because: 'Writing down a small win makes good days easier to recall on harder ones.',
      cta: 'Log a win',
      tone: 'amber',
    });
  }

  return out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, limit);
}

/* ───────────────────────── care ───────────────────────── */

export function rankCounsellors(list: Counsellor[], want: { topic: CareTopic; language: CareLanguage; format: CareFormat }) {
  return list
    .filter((c) => c.languages.includes(want.language))
    .map((c) => {
      const reasons: string[] = [];
      let score = c.rating * 2 - Math.min(...c.slots.map((s) => s.dayOffset)) * 1.5;
      if (c.specialties.includes(want.topic)) {
        score += 50;
        reasons.push('Specialist in your topic');
      }
      if (c.formats.includes(want.format)) {
        score += 15;
        reasons.push('Offers your format');
      }
      if (want.language === 'ar') reasons.push('Speaks Arabic');
      return { counsellor: c, score: Math.round(score * 10) / 10, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export const slotAt = (slot: { dayOffset: number; hour: number }, now: number) => startOfDay(now) + slot.dayOffset * DAY + slot.hour * HOUR;

/** NeoTracker position for a care booking (Request → Matched → Session booked → Follow-up). */
export function careTracker(b: Pick<CareBooking, 'stage'> | null): { current: number; state: 'active' | 'done' } {
  if (!b) return { current: 0, state: 'active' };
  return { current: b.stage, state: b.stage >= 4 ? 'done' : 'active' };
}

/**
 * Calendar hold for a counselling session: deliberately generic — no topic, no
 * counsellor, no app link — so nobody who can see your calendar learns anything.
 */
export function privateHold(sessionAt: number, userId: string, now: number) {
  const dayOffset = Math.round((startOfDay(sessionAt) - startOfDay(now)) / DAY);
  return {
    title: 'Personal appointment',
    description: 'Private time.',
    category: 'focus' as const,
    dayOffset,
    startHour: hourOf(sessionAt),
    durationMins: 50,
    organizerId: userId,
    attendeeIds: [userId],
    roomName: 'Private',
    agendaBullets: ['Private'],
  };
}

/* ───────────────────────── rhythm: burnout radar ───────────────────────── */

export const SIGNAL_META: Record<SignalId, { label: string; tip: string; weight: number }> = {
  afterHours: { label: 'After-hours activity', tip: 'Emails and meetings inside your quiet hours this week.', weight: 0.2 },
  meetings: { label: 'Meeting density', tip: 'Average meeting hours per working day.', weight: 0.2 },
  focus: { label: 'Focus time', tip: 'Protected deep-work hours this week. More is better.', weight: 0.16 },
  weekend: { label: 'Weekend activity', tip: 'Work sessions on weekends over the last four weeks.', weight: 0.14 },
  leave: { label: 'Time since last leave', tip: 'Days since your last proper break.', weight: 0.16 },
  inbox: { label: 'Inbox load', tip: 'Unread priority mail and pressure to reply fast.', weight: 0.14 },
};
export const SIGNAL_ORDER: SignalId[] = ['afterHours', 'meetings', 'focus', 'weekend', 'leave', 'inbox'];

export interface RadarInput {
  afterHoursEmails: number;
  afterHoursEvents: number;
  meetingHoursPerDay: number;
  focusHoursWeek: number;
  weekendSessions: number;
  daysSinceLeave: number | null;
  unread: number;
  avgReplyMins: number;
}

export interface RadarSignal {
  id: SignalId;
  label: string;
  tip: string;
  risk: number;
  level: SignalLevel;
  value: string;
}

/** < 40 healthy · 40–69 watch · ≥ 70 high. */
export const signalLevel = (risk: number): SignalLevel => (risk >= 70 ? 'high' : risk >= 40 ? 'watch' : 'ok');

export function signalRisk(id: SignalId, i: RadarInput): number {
  switch (id) {
    case 'afterHours':
      return clamp(Math.round(i.afterHoursEmails * 6 + i.afterHoursEvents * 12), 0, 100);
    case 'meetings':
      return clamp(Math.round(((i.meetingHoursPerDay - 2) / 4) * 100), 0, 100);
    case 'focus':
      return clamp(Math.round(100 - (i.focusHoursWeek / 10) * 100), 0, 100);
    case 'weekend':
      return clamp(Math.round(i.weekendSessions * 15), 0, 100);
    case 'leave':
      return i.daysSinceLeave === null ? 30 : clamp(Math.round(((i.daysSinceLeave - 30) / 90) * 100), 0, 100);
    case 'inbox':
      return clamp(Math.round(i.unread * 3 + (i.avgReplyMins > 0 && i.avgReplyMins < 30 ? 15 : 0)), 0, 100);
  }
}

export function radarSignals(i: RadarInput): RadarSignal[] {
  const value: Record<SignalId, string> = {
    afterHours: String(i.afterHoursEmails + i.afterHoursEvents),
    meetings: `${round1(i.meetingHoursPerDay)}h`,
    focus: `${round1(i.focusHoursWeek)}h`,
    weekend: String(i.weekendSessions),
    leave: i.daysSinceLeave === null ? '—' : `${i.daysSinceLeave}d`,
    inbox: String(i.unread),
  };
  return SIGNAL_ORDER.map((id) => {
    const risk = signalRisk(id, i);
    return { id, label: SIGNAL_META[id].label, tip: SIGNAL_META[id].tip, risk, level: signalLevel(risk), value: value[id] };
  });
}

/** Sustainable Pace Index: 100 − weighted risk. */
export function paceIndex(signals: Pick<RadarSignal, 'id' | 'risk'>[]): number {
  let w = 0;
  let r = 0;
  for (const s of signals) {
    w += SIGNAL_META[s.id].weight;
    r += SIGNAL_META[s.id].weight * s.risk;
  }
  return w ? Math.round(100 - r / w) : 100;
}

export const paceBand = (pace: number) => (pace >= 70 ? 'Sustainable' : pace >= 50 ? 'Stretched' : 'Running hot');

/* ───────────────────────── quiet hours ───────────────────────── */

export function isQuietAt(q: QuietHoursSettings, date: Date): boolean {
  if (!q.enabled) return false;
  const dow = date.getDay();
  if (q.weekendsOff && (dow === 0 || dow === 6)) return true;
  const h = date.getHours() + date.getMinutes() / 60;
  if (q.startHour === q.endHour) return false;
  return q.startHour > q.endHour ? h >= q.startHour || h < q.endHour : h >= q.startHour && h < q.endHour;
}

export const quietSpanHours = (q: Pick<QuietHoursSettings, 'startHour' | 'endHour'>) => (q.startHour > q.endHour ? 24 - q.startHour + q.endHour : q.endHour - q.startHour);

/** The person's calendar events (last 7 days → today) that start inside their quiet window. */
export function afterHoursEvents(events: CalEventLite[], userId: string, q: QuietHoursSettings, now: number): number {
  const day0 = startOfDay(now);
  return events.filter((e) => e.dayOffset <= 0 && e.dayOffset >= -6 && isMine(e, userId) && isQuietAt(q, new Date(day0 + e.dayOffset * DAY + e.startHour * HOUR))).length;
}

/* ───────────────────────── manager view: k-anonymity ───────────────────────── */

export const K_ANON = 5;

export function directReports(users: { id: string; managerId?: string; active: boolean }[], managerId: string): string[] {
  return users.filter((u) => u.active && u.managerId === managerId).map((u) => u.id);
}

/** Who a viewer may see aggregates for: their directs, or the organisation for `*` admins without directs. */
export function managerScope(viewerId: string, perms: PermissionSet, users: { id: string; managerId?: string; active: boolean }[]): { kind: 'team' | 'org' | 'none'; memberIds: string[] } {
  const directs = directReports(users, viewerId);
  if (directs.length) return { kind: 'team', memberIds: directs };
  if (perms.has('*')) return { kind: 'org', memberIds: users.filter((u) => u.active && u.id !== viewerId).map((u) => u.id) };
  return { kind: 'none', memberIds: [] };
}

export const canSeeTeamView = (viewerId: string, perms: PermissionSet, users: { id: string; managerId?: string; active: boolean }[]) => managerScope(viewerId, perms, users).kind !== 'none';

/** Deterministic weekly risk baseline for a person (never shown individually). */
export function syntheticRisk(memberId: string, weekIdx: number, signal: SignalId): number {
  const bias = rng(hashStr(`bias:${memberId}:${signal}`))();
  const noise = rng(hashStr(`wk:${memberId}:${signal}:${weekIdx}`))();
  return clamp(Math.round(18 + bias * 46 + (noise - 0.5) * 30 + (weekIdx === 0 && signal === 'meetings' ? 6 : 0)), 0, 100);
}

export interface HeatWeek {
  label: string;
  /** Weeks before the current one (0 = this week). */
  ago: number;
  cells: Record<SignalId, number>;
  pace: number;
}

/**
 * Anonymised team heatmap: mean risk per (week × signal) rounded to 5 — or
 * `null` below the k-anonymity threshold so small teams can never be unmasked.
 */
export function teamHeatmap(memberIds: string[], weeks: number, valueFor: (memberId: string, weekIdx: number, signal: SignalId) => number, k = K_ANON): { n: number; weeks: HeatWeek[] } | null {
  if (memberIds.length < k) return null;
  const out: HeatWeek[] = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const cells = {} as Record<SignalId, number>;
    for (const s of SIGNAL_ORDER) cells[s] = Math.round(sum(memberIds.map((m) => valueFor(m, w, s))) / memberIds.length / 5) * 5;
    out.push({ label: w === 0 ? 'This week' : `${w}w ago`, ago: w, cells, pace: paceIndex(SIGNAL_ORDER.map((id) => ({ id, risk: cells[id] }))) });
  }
  return { n: memberIds.length, weeks: out };
}

/* ───────────────────────── perks: wallet & claims ───────────────────────── */

export function walletSummary(claims: { amount: number; status: PerkClaimStatus }[], allowance = WALLET_ALLOWANCE) {
  const by = (s: PerkClaimStatus[]) => sum(claims.filter((c) => s.includes(c.status)).map((c) => c.amount));
  const spent = by(['approved', 'paid']);
  const pending = by(['submitted']);
  const paid = by(['paid']);
  const remaining = Math.max(0, allowance - spent - pending);
  return { allowance, spent, pending, paid, remaining, usedPct: clamp((spent + pending) / allowance, 0, 1) };
}

/** NeoTracker position: Submitted → People Ops review → Approved → Paid with payroll. */
export function claimTracker(status: PerkClaimStatus): { current: number; state: 'active' | 'blocked' | 'done' } {
  switch (status) {
    case 'submitted':
      return { current: 1, state: 'active' };
    case 'approved':
      return { current: 3, state: 'active' };
    case 'paid':
      return { current: 4, state: 'done' };
    case 'rejected':
      return { current: 1, state: 'blocked' };
  }
}

/** Legal claim transitions (anything else keeps the current status). */
export function nextClaimStatus(status: PerkClaimStatus, event: 'approve' | 'reject' | 'pay'): PerkClaimStatus {
  if (status === 'submitted' && event === 'approve') return 'approved';
  if (status === 'submitted' && event === 'reject') return 'rejected';
  if (status === 'approved' && event === 'pay') return 'paid';
  return status;
}

export const isPerkStatus = (s: string): s is PerkClaimStatus => s === 'submitted' || s === 'approved' || s === 'paid' || s === 'rejected';

/* ───────────────────────── recharge credits ───────────────────────── */

export function creditsEarned(user: Pick<UserWellbeing, 'checkins' | 'breaths' | 'activities'>, today: string, teamMilestones: number, campaignCredits = 0) {
  const breakdown = [
    { label: 'Daily check-ins', credits: user.checkins.length * 5 },
    { label: 'Check-in streak bonus', credits: checkinStreak(user.checkins, today) * 10 },
    { label: 'Calm minutes', credits: Math.round(sum(user.breaths.map((b) => b.minutes))) },
    { label: 'Logged activities', credits: user.activities.length * 5 },
    { label: 'Team milestones', credits: teamMilestones * 50 },
    { label: 'Campaigns joined', credits: campaignCredits },
  ];
  return { total: sum(breakdown.map((b) => b.credits)), breakdown };
}
