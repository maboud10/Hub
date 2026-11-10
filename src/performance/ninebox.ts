/**
 * 9-box talent grid — pure helpers.
 * Performance (x) × potential (y), each 1 = low · 2 = moderate · 3 = high.
 */
import { BOX_META, potentialToAxis, RATINGS, ratingToAxis } from './constants';
import type { BoxAxis, Review } from './types';

export interface Placement {
  userId: string;
  performance: BoxAxis;
  potential: BoxAxis;
  /** calibrated = moved on the board · manager = from the manager's rating · previous = carried from last cycle */
  source: 'calibrated' | 'manager' | 'previous';
  note?: string;
}

export const boxKey = (performance: BoxAxis, potential: BoxAxis) => `${performance}${potential}`;
export const boxLabel = (performance: BoxAxis, potential: BoxAxis) => BOX_META[boxKey(performance, potential)]?.label ?? '—';

/** Where someone sits on the board this cycle (calibrated > manager rating > last cycle). */
export function placementFor(userId: string, review: Review | undefined, previous: Review | undefined): Placement | null {
  if (review?.calibration) return { userId, performance: review.calibration.performance, potential: review.calibration.potential, source: 'calibrated', note: review.calibration.note };
  if (review?.manager.overall && review.manager.potential)
    return { userId, performance: ratingToAxis(review.manager.overall), potential: potentialToAxis(review.manager.potential), source: 'manager' };
  if (previous?.calibration) return { userId, performance: previous.calibration.performance, potential: previous.calibration.potential, source: 'previous' };
  if (previous?.manager.overall && previous.manager.potential)
    return { userId, performance: ratingToAxis(previous.manager.overall), potential: potentialToAxis(previous.manager.potential), source: 'previous' };
  return null;
}

export function gridCounts(placements: Placement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of placements) out[boxKey(p.performance, p.potential)] = (out[boxKey(p.performance, p.potential)] ?? 0) + 1;
  return out;
}

/** Guidance for the performance axis, derived from the rating curve (high = exceeds+). */
export const PERFORMANCE_GUIDANCE: Record<BoxAxis, number> = {
  3: RATINGS.filter((r) => r.value >= 4).reduce((s, r) => s + r.guidance, 0),
  2: RATINGS.filter((r) => r.value === 3).reduce((s, r) => s + r.guidance, 0),
  1: RATINGS.filter((r) => r.value <= 2).reduce((s, r) => s + r.guidance, 0),
};

export interface AxisDistribution {
  axis: BoxAxis;
  count: number;
  share: number;
  guidance: number;
  delta: number;
}

export function performanceDistribution(placements: Placement[]): AxisDistribution[] {
  const total = placements.length || 1;
  return ([3, 2, 1] as BoxAxis[]).map((axis) => {
    const count = placements.filter((p) => p.performance === axis).length;
    const share = count / total;
    return { axis, count, share, guidance: PERFORMANCE_GUIDANCE[axis], delta: share - PERFORMANCE_GUIDANCE[axis] };
  });
}

/** A short, human note on how the board compares with the guidance curve. */
export function distributionNote(placements: Placement[]): string {
  if (placements.length < 4) return 'Too few people placed to compare with the guidance curve.';
  const d = performanceDistribution(placements);
  const high = d.find((x) => x.axis === 3)!;
  const low = d.find((x) => x.axis === 1)!;
  const pctS = (v: number) => `${Math.round(v * 100)}%`;
  if (high.delta > 0.12) return `High performance is ${pctS(high.share)} vs ${pctS(high.guidance)} guidance — pressure-test who is truly above the bar.`;
  if (low.delta > 0.1) return `Low performance is ${pctS(low.share)} vs ${pctS(low.guidance)} guidance — make sure each has a support plan.`;
  if (high.delta < -0.15) return `Only ${pctS(high.share)} rated high vs ${pctS(high.guidance)} guidance — are strong performers being under-recognised?`;
  return `Distribution is close to guidance (high ${pctS(high.share)} · moderate ${pctS(d[1].share)} · low ${pctS(low.share)}).`;
}
