/**
 * OKR engine — pure functions (no React, no store) so they are easy to test and
 * could run server-side unchanged.
 *
 *  - progress   direction-aware (increase / decrease / ceiling / boolean / milestone)
 *  - forecast   least-squares trend over recent check-ins, anchored at the latest value,
 *               with a cone that widens with residual error, remaining time and low confidence
 *  - status     derived from the forecast vs target, stalls and owner confidence
 *  - scoring    0.0–1.0 grades (0.7 = great) and objective roll-ups
 */
import type { KeyResult, KrStatus, Period } from './types';

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const round = (v: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

type KrShape = Pick<KeyResult, 'metric' | 'start' | 'target' | 'ceiling' | 'milestones'>;

/** Total steps of a milestone KR. */
export const milestoneTotal = (kr: Pick<KeyResult, 'milestones' | 'target'>) => kr.milestones?.length || kr.target || 1;

/** Unclamped progress (can exceed 1 when ahead, or go below 0 when moving backwards). */
export function rawProgress(kr: KrShape, value: number): number {
  if (kr.metric === 'boolean') return value >= 1 ? 1 : 0;
  if (kr.metric === 'milestone') return value / milestoneTotal(kr);
  if (kr.ceiling) {
    if (value <= kr.target) return 1;
    return 1 - (value - kr.target) / Math.max(kr.target, 1);
  }
  const span = kr.target - kr.start;
  if (span === 0) return value === kr.target ? 1 : 0;
  return (value - kr.start) / span;
}

/** Progress 0..1 for a given value. */
export const progressOf = (kr: KrShape, value: number) => clamp01(rawProgress(kr, value));
export const krProgress = (kr: KrShape & Pick<KeyResult, 'current'>) => progressOf(kr, kr.current);

/** Share of the period that has elapsed, 0..1. */
export function elapsed(period: Pick<Period, 'start' | 'end'>, now: number) {
  return clamp01((now - period.start) / Math.max(1, period.end - period.start));
}

/** Where the value "should" be at `at` on a straight line from start to target. */
export function idealValue(kr: KrShape, period: Pick<Period, 'start' | 'end'>, at: number) {
  if (kr.ceiling) return kr.target;
  if (kr.metric === 'milestone') return milestoneTotal(kr) * elapsed(period, at);
  if (kr.metric === 'boolean') return elapsed(period, at);
  return kr.start + (kr.target - kr.start) * elapsed(period, at);
}

export interface TrendPoint {
  t: number;
  v: number;
}

/** Points used for trend analysis: the baseline at period start plus every check-in up to `now`. */
export function trendPoints(kr: Pick<KeyResult, 'start' | 'checkins'>, period: Pick<Period, 'start'>, now: number): TrendPoint[] {
  const cks = kr.checkins.filter((c) => c.at <= now).sort((a, b) => a.at - b.at);
  const pts: TrendPoint[] = cks.map((c) => ({ t: c.at, v: c.value }));
  if (!pts.length || pts[0].t - period.start > 2 * DAY) pts.unshift({ t: period.start, v: kr.start });
  return pts;
}

export interface Regression {
  slope: number; // value per ms
  intercept: number;
  n: number;
  tMean: number;
  sxx: number;
  stderr: number;
}

/** Ordinary least squares on (t, v). */
export function linearRegression(points: TrendPoint[]): Regression | null {
  const n = points.length;
  if (n < 2) return null;
  const tMean = points.reduce((s, p) => s + p.t, 0) / n;
  const vMean = points.reduce((s, p) => s + p.v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.t - tMean) ** 2;
    sxy += (p.t - tMean) * (p.v - vMean);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = vMean - slope * tMean;
  let sse = 0;
  for (const p of points) sse += (p.v - (intercept + slope * p.t)) ** 2;
  const stderr = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, n, tMean, sxx, stderr };
}

export interface Forecast {
  /** Projected value at the end of the period. */
  value: number;
  low: number;
  high: number;
  /** Trend per week in value units (signed). */
  perWeek: number;
  /** Projected progress at period end (unclamped: >1 = ahead of target). */
  progress: number;
  /** The anchor the projection starts from (latest known value). */
  from: TrendPoint;
  method: 'trend' | 'flat';
}

function clampValue(kr: KrShape, v: number) {
  if (kr.metric === 'percent') return Math.max(0, Math.min(100, v));
  if (kr.metric === 'milestone') return Math.max(0, Math.min(milestoneTotal(kr), v));
  if (kr.metric === 'boolean') return Math.max(0, Math.min(1, v));
  return Math.max(0, v);
}

/**
 * Forecast the end-of-period value from the most recent check-ins (up to 5 points):
 * slope from least squares, anchored at the latest value so the cone starts where the
 * line ends. The cone widens with residual error and with low owner confidence.
 */
export function forecastKr(kr: KeyResult, period: Pick<Period, 'start' | 'end'>, now: number): Forecast {
  const pts = trendPoints(kr, period, now);
  const recent = pts.slice(-5);
  const last = pts[pts.length - 1] ?? { t: period.start, v: kr.start };
  const from = { t: Math.min(last.t, period.end), v: kr.current };
  const span = Math.abs(kr.target - kr.start) || Math.abs(kr.target) || 1;
  const remaining = Math.max(0, period.end - from.t);
  const reg = kr.metric === 'boolean' ? null : linearRegression(recent);
  const confFactor = 0.6 + (10 - Math.max(1, Math.min(10, kr.confidence))) * 0.08;

  if (!reg) {
    const v = clampValue(kr, kr.current);
    const w = span * 0.3 * (remaining / Math.max(1, period.end - period.start)) * confFactor;
    return { value: v, low: clampValue(kr, v - w), high: clampValue(kr, v + w), perWeek: 0, progress: rawProgress(kr, v), from, method: 'flat' };
  }

  let slope = reg.slope;
  // Cumulative counters (ceilings, milestones) never go down.
  if ((kr.ceiling || kr.metric === 'milestone') && slope < 0) slope = 0;
  const value = clampValue(kr, from.v + slope * remaining);
  const tEnd = period.end;
  const spread = reg.stderr * Math.sqrt(1 + 1 / reg.n + (tEnd - reg.tMean) ** 2 / reg.sxx);
  const base = Math.max(spread, span * 0.04) * (remaining > 0 ? 1 : 0);
  const width = base * confFactor;
  return {
    value,
    low: clampValue(kr, value - width),
    high: clampValue(kr, value + width),
    perWeek: slope * WEEK,
    progress: rawProgress(kr, value),
    from,
    method: 'trend',
  };
}

/** No movement across check-ins spanning 14+ days while behind plan. */
export function isStalled(kr: KeyResult, period: Pick<Period, 'start' | 'end'>, now: number): boolean {
  if (kr.metric === 'boolean' || kr.ceiling) return false;
  const cks = kr.checkins.filter((c) => c.at <= now).sort((a, b) => a.at - b.at);
  if (cks.length < 3) return false;
  const lastVal = cks[cks.length - 1].value;
  const span = Math.abs(kr.target - kr.start) || 1;
  // walk back while the value stays flat
  let i = cks.length - 1;
  while (i > 0 && Math.abs(cks[i - 1].value - lastVal) <= span * 0.01) i -= 1;
  const flatSince = cks[i].at;
  const flatCount = cks.length - i;
  return flatCount >= 3 && now - flatSince >= 14 * DAY && krProgress(kr) < elapsed(period, now);
}

const ORDER: KrStatus[] = ['on-track', 'at-risk', 'off-track'];
const downgrade = (s: KrStatus): KrStatus => (s === 'done' ? s : ORDER[Math.min(2, ORDER.indexOf(s) + 1)]);

/** Status implied by confidence alone (used before there is enough trend data). */
export function confidenceStatus(confidence: number): KrStatus {
  if (confidence >= 7) return 'on-track';
  if (confidence >= 4) return 'at-risk';
  return 'off-track';
}

/**
 * KR health:
 *  - done when the target is reached (ceilings: when the period ends within the limit)
 *  - otherwise from the forecast: ≥95% of target → on track, ≥70% → at risk, else off track
 *  - stalled KRs can't be "on track"; confidence ≤ 3 downgrades one level
 */
export function krStatus(kr: KeyResult, period: Pick<Period, 'start' | 'end'>, now: number): KrStatus {
  const ended = now >= period.end;
  if (kr.metric === 'boolean') {
    if (kr.current >= 1) return 'done';
    if (ended) return 'off-track';
    const e = elapsed(period, now);
    const s = confidenceStatus(kr.confidence);
    return e > 0.75 && s === 'on-track' ? 'at-risk' : s;
  }
  if (kr.ceiling) {
    if (kr.current > kr.target) return 'off-track';
    if (ended) return 'done';
    const f = forecastKr(kr, period, now);
    const s: KrStatus = f.value > kr.target ? 'at-risk' : 'on-track';
    return kr.confidence <= 3 ? downgrade(s) : s;
  }
  const p = rawProgress(kr, kr.current);
  if (p >= 1) return 'done';
  if (ended) return p >= 0.7 ? 'at-risk' : 'off-track';
  const e = elapsed(period, now);
  const f = forecastKr(kr, period, now);
  let s: KrStatus;
  if (f.method === 'flat' || e < 0.08) s = confidenceStatus(kr.confidence);
  else s = f.progress >= 0.95 ? 'on-track' : f.progress >= 0.7 ? 'at-risk' : 'off-track';
  if (s === 'on-track' && isStalled(kr, period, now)) s = 'at-risk';
  if (kr.confidence <= 3) s = downgrade(s);
  return s;
}

/** Average KR progress (equal weights). */
export function objectiveProgress(krs: KeyResult[]): number {
  if (!krs.length) return 0;
  return krs.reduce((s, k) => s + krProgress(k), 0) / krs.length;
}

/** Roll KR statuses up: all done → done; half or more off track → off track; any risk → at risk. */
export function rollupStatus(statuses: KrStatus[]): KrStatus {
  if (!statuses.length) return 'on-track';
  if (statuses.every((s) => s === 'done')) return 'done';
  const off = statuses.filter((s) => s === 'off-track').length;
  const risk = statuses.filter((s) => s === 'at-risk').length;
  if (off > 0 && off >= Math.ceil(statuses.length / 2)) return 'off-track';
  if (off + risk > 0) return 'at-risk';
  return 'on-track';
}

export function objectiveStatus(krs: KeyResult[], period: Pick<Period, 'start' | 'end'>, now: number): KrStatus {
  return rollupStatus(krs.map((k) => krStatus(k, period, now)));
}

/* ───────── Grading ───────── */

/** Suggested end-of-quarter grade, rounded to 0.1. */
export function suggestedScore(kr: KeyResult): number {
  return round(krProgress(kr), 1);
}

/** Average grade across KRs (uses suggestions for ungraded KRs). */
export function objectiveScore(krs: KeyResult[]): number | null {
  if (!krs.length) return null;
  return round(krs.reduce((s, k) => s + (k.score ?? suggestedScore(k)), 0) / krs.length, 2);
}

export function scoreLabel(score: number): string {
  if (score >= 0.9) return 'Nailed it';
  if (score >= 0.7) return 'Great';
  if (score >= 0.4) return 'Solid progress';
  return 'Missed';
}

/* ───────── Formatting ───────── */

export function compactNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${round(v / 1_000_000, a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 10_000) return `${round(v / 1000, 0)}K`;
  if (a >= 1000) return `${round(v / 1000, 1)}K`;
  return `${round(v, 2)}`;
}

/** Human value for a KR, e.g. `74%`, `$1.05M`, `64 tickets/mo`, `3/4`, `Done`. */
export function formatValue(kr: Pick<KeyResult, 'metric' | 'unit' | 'decimals' | 'milestones' | 'target'>, value: number, opts: { unit?: boolean } = {}): string {
  const withUnit = opts.unit ?? true;
  const d = kr.decimals ?? (kr.metric === 'percent' && !Number.isInteger(value) ? 1 : 0);
  switch (kr.metric) {
    case 'percent':
      return `${round(value, d).toFixed(d)}%`;
    case 'currency':
      return `$${compactNumber(value)}`;
    case 'boolean':
      return value >= 1 ? 'Done' : 'Not yet';
    case 'milestone':
      return `${Math.round(value)}/${milestoneTotal(kr)}`;
    default: {
      const n = Math.abs(value) >= 10_000 ? compactNumber(value) : round(value, d).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
      return withUnit && kr.unit ? `${n} ${kr.unit}` : n;
    }
  }
}

/** `62% → 95%`, `140 → 20 tickets/mo`, `≤ 2 P1s`, `0/4 milestones`. */
export function formatRange(kr: KeyResult): string {
  if (kr.metric === 'boolean') return 'Yes / no';
  if (kr.metric === 'milestone') return `${milestoneTotal(kr)} milestones`;
  if (kr.ceiling) return `≤ ${formatValue(kr, kr.target)}`;
  return `${formatValue(kr, kr.start, { unit: false })} → ${formatValue(kr, kr.target)}`;
}

/** `+3.2 pts/wk`, `−12 tickets/mo per week` etc. */
export function formatPace(kr: KeyResult, perWeek: number): string {
  if (Math.abs(perWeek) < 1e-9) return 'flat';
  const sign = perWeek > 0 ? '+' : '−';
  const abs = Math.abs(perWeek);
  if (kr.metric === 'percent') return `${sign}${round(abs, abs < 1 ? 2 : 1)} pts/wk`;
  if (kr.metric === 'currency') return `${sign}$${compactNumber(abs)}/wk`;
  return `${sign}${round(abs, abs < 10 ? 1 : 0)}${kr.unit ? ` ${kr.unit}` : ''}/wk`;
}

/** Signed difference formatted in KR units (for check-in deltas). */
export function formatDelta(kr: KeyResult, delta: number): string {
  if (delta === 0) return '±0';
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(delta);
  if (kr.metric === 'percent') return `${sign}${round(abs, 2)} pts`;
  if (kr.metric === 'currency') return `${sign}$${compactNumber(abs)}`;
  if (kr.metric === 'milestone') return `${sign}${abs}`;
  return `${sign}${round(abs, kr.decimals ?? 1)}`;
}

/** Is a change "good" for this KR? */
export function isImprovement(kr: KrShape, delta: number) {
  if (delta === 0) return false;
  if (kr.ceiling) return delta < 0;
  return kr.target >= kr.start ? delta > 0 : delta < 0;
}

/* ───────── Check-in habits ───────── */

/** Monday 00:00 (local) of the week containing `t`. */
export function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/**
 * Consecutive weeks (ending this week) with at least one check-in. The current week
 * may still be empty without breaking the streak.
 */
export function checkinStreak(times: number[], now: number): number {
  if (!times.length) return 0;
  const thisWeek = startOfWeek(now);
  const weeks = new Set(times.filter((t) => t <= now).map((t) => Math.round((thisWeek - startOfWeek(t)) / WEEK)));
  let k = weeks.has(0) ? 0 : 1;
  let streak = 0;
  while (weeks.has(k)) {
    streak += 1;
    k += 1;
  }
  return streak;
}

export function lastCheckinAt(kr: Pick<KeyResult, 'checkins'>): number | null {
  return kr.checkins.reduce<number | null>((m, c) => (m === null || c.at > m ? c.at : m), null);
}

/** Check-in is "due" when the last one is a week old or more. */
export function checkinDue(kr: Pick<KeyResult, 'checkins' | 'createdAt'>, now: number) {
  const last = lastCheckinAt(kr) ?? kr.createdAt;
  return now - last >= 6 * DAY;
}
