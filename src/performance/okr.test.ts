import { describe, expect, it } from 'vitest';
import {
  checkinStreak,
  DAY,
  forecastKr,
  formatRange,
  formatValue,
  isStalled,
  krProgress,
  krStatus,
  linearRegression,
  objectiveProgress,
  objectiveScore,
  objectiveStatus,
  progressOf,
  rollupStatus,
  scoreLabel,
  suggestedScore,
} from './okr';
import { createPerfSeed } from './seed';
import type { KeyResult, Period } from './types';

const NOW = new Date('2026-11-06T03:40:00+04:00').getTime();
const seed = createPerfSeed(NOW);
const q4 = seed.periods[0];
const krById = (id: string) => seed.keyResults.find((k) => k.id === id)!;
const krsOf = (objectiveId: string) => seed.keyResults.filter((k) => k.objectiveId === objectiveId);

const base = (over: Partial<KeyResult>): KeyResult => ({
  id: 'k',
  objectiveId: 'o',
  title: 'Test',
  metric: 'number',
  start: 0,
  target: 100,
  current: 0,
  ownerId: 'u-mei',
  confidence: 7,
  checkins: [],
  order: 0,
  createdAt: 0,
  ...over,
});

describe('progress', () => {
  it('handles increasing, decreasing, ceiling, boolean and milestone KRs', () => {
    expect(progressOf(base({ start: 62, target: 95 }), 73.5)).toBeCloseTo(0.348, 2);
    expect(progressOf(base({ start: 140, target: 20 }), 68)).toBeCloseTo(0.6, 2);
    expect(progressOf(base({ start: 0, target: 2, ceiling: true }), 1)).toBe(1);
    expect(progressOf(base({ start: 0, target: 2, ceiling: true }), 3)).toBeCloseTo(0.5, 5);
    expect(progressOf(base({ metric: 'boolean', target: 1 }), 1)).toBe(1);
    expect(progressOf(base({ metric: 'milestone', target: 4, milestones: [1, 2, 3, 4].map((i) => ({ id: `${i}`, title: `${i}`, done: i < 3 })) }), 2)).toBe(0.5);
    expect(progressOf(base({ start: 10, target: 20 }), 25)).toBe(1); // clamped
  });

  it('averages KR progress into objectives', () => {
    expect(objectiveProgress([base({ current: 50 }), base({ current: 100 })])).toBeCloseTo(0.75);
    expect(objectiveProgress([])).toBe(0);
  });
});

describe('forecast', () => {
  const period: Period = { id: 'p', label: 'P', start: 0, end: 100 * DAY };
  it('fits a straight line and projects it to the end of the period', () => {
    const k = base({
      current: 40,
      checkins: [0, 10, 20, 30, 40].map((d) => ({ id: `${d}`, at: d * DAY, value: d, confidence: 7, byId: 'u' })),
    });
    const f = forecastKr(k, period, 40 * DAY);
    expect(f.method).toBe('trend');
    expect(f.value).toBeCloseTo(100, 5);
    expect(f.perWeek).toBeCloseTo(7, 5);
    expect(f.progress).toBeCloseTo(1, 5);
  });

  it('widens the cone when confidence is low', () => {
    const pts = [0, 10, 20, 30].map((d, i) => ({ id: `${d}`, at: d * DAY, value: d + (i % 2 ? 3 : -3), confidence: 7, byId: 'u' }));
    const hi = forecastKr(base({ current: 27, confidence: 9, checkins: pts }), period, 30 * DAY);
    const lo = forecastKr(base({ current: 27, confidence: 2, checkins: pts }), period, 30 * DAY);
    expect(lo.high - lo.low).toBeGreaterThan(hi.high - hi.low);
  });

  it('never projects cumulative counters downwards', () => {
    const k = base({ start: 0, target: 2, ceiling: true, current: 1, checkins: [{ id: 'a', at: 10 * DAY, value: 1, confidence: 7, byId: 'u' }, { id: 'b', at: 20 * DAY, value: 1, confidence: 7, byId: 'u' }] });
    expect(forecastKr(k, period, 20 * DAY).value).toBeGreaterThanOrEqual(1);
  });

  it('regression returns null for a single point', () => {
    expect(linearRegression([{ t: 0, v: 1 }])).toBeNull();
  });
});

describe('status (seeded story)', () => {
  it('Make Helix passwordless is at risk: passkeys behind, resets ahead', () => {
    expect(krStatus(krById('kr-passkeys-adoption'), q4, NOW)).toBe('at-risk');
    expect(krStatus(krById('kr-password-resets'), q4, NOW)).toBe('on-track');
    expect(objectiveStatus(krsOf('obj-co-passwordless'), q4, NOW)).toBe('at-risk');
  });

  it('flags the stalled contrast KR', () => {
    const k = krById('kr-dsn-contrast');
    expect(isStalled(k, q4, NOW)).toBe(true);
    expect(krStatus(k, q4, NOW)).toBe('off-track');
  });

  it('has a mix of ahead and behind key results', () => {
    expect(krStatus(krById('kr-prism-adoption'), q4, NOW)).toBe('on-track');
    expect(krStatus(krById('kr-priya-p99'), q4, NOW)).toBe('on-track');
    expect(krStatus(krById('kr-fin-recon'), q4, NOW)).toBe('off-track');
    expect(krStatus(krById('kr-lucas-runbooks'), q4, NOW)).toBe('at-risk');
    expect(krStatus(krById('kr-p1-incidents'), q4, NOW)).toBe('at-risk');
  });

  it('rolls statuses up', () => {
    expect(rollupStatus(['done', 'done'])).toBe('done');
    expect(rollupStatus(['on-track', 'at-risk'])).toBe('at-risk');
    expect(rollupStatus(['off-track', 'on-track'])).toBe('off-track');
    expect(rollupStatus(['off-track', 'on-track', 'on-track'])).toBe('at-risk');
    expect(rollupStatus([])).toBe('on-track');
  });

  it('is done once the target is reached', () => {
    expect(krStatus(base({ current: 100 }), q4, NOW)).toBe('done');
  });
});

describe('grading & formatting', () => {
  it('suggests scores and averages them', () => {
    expect(suggestedScore(base({ current: 73 }))).toBe(0.7);
    expect(objectiveScore([base({ current: 100, score: 0.9 }), base({ current: 50 })])).toBeCloseTo(0.7);
    expect(scoreLabel(0.7)).toBe('Great');
    expect(scoreLabel(0.3)).toBe('Missed');
  });

  it('formats values per metric', () => {
    expect(formatValue(krById('kr-gcc-arr'), 1_020_000)).toBe('$1.02M');
    expect(formatValue(krById('kr-uptime'), 99.93)).toBe('99.93%');
    expect(formatValue(krById('kr-password-resets'), 68)).toBe('68 tickets/mo');
    expect(formatValue(krById('kr-priya-planner'), 3)).toBe('3/4');
    expect(formatRange(krById('kr-p1-incidents'))).toBe('≤ 2 P1s');
    expect(formatRange(krById('kr-passkeys-adoption'))).toBe('62% → 95%');
    expect(krProgress(krById('kr-passkeys-adoption'))).toBeGreaterThan(0.3);
  });
});

describe('check-in streaks', () => {
  it('counts consecutive weeks and tolerates an empty current week', () => {
    const now = new Date('2026-11-06T12:00:00').getTime();
    expect(checkinStreak([now - 1 * DAY, now - 8 * DAY, now - 15 * DAY], now)).toBe(3);
    expect(checkinStreak([now - 7 * DAY, now - 14 * DAY], now)).toBe(2);
    expect(checkinStreak([now - 30 * DAY], now)).toBe(0);
    expect(checkinStreak([], now)).toBe(0);
  });
});
