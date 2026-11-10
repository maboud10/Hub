import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeCohortSummary,
  computeFunnelMetrics,
  filterAnomalies,
  runMonteCarloProjection,
  synthesizeNovaAnswer,
} from './engine';
import { SCENARIO_PRESETS } from './seed';
import { resetInsights, useInsights } from './store';

describe('Helix Insights — Quantum Telemetry & Growth Cortex', () => {
  beforeEach(() => {
    resetInsights();
  });

  it('computes 5-stage funnel conversion rates, drop-off bottlenecks, and segment filters accurately', () => {
    const stages = useInsights.getState().funnelStages;
    const allMetrics = computeFunnelMetrics(stages, 'all');

    expect(allMetrics).toHaveLength(5);
    expect(allMetrics[0].conversionFromPrevPct).toBe(100);
    expect(allMetrics[0].cumulativeConversionPct).toBe(100);
    // Stage 2: 19280 / 48200 = 40.0%
    expect(allMetrics[1].conversionFromPrevPct).toBe(40);
    expect(allMetrics[1].dropOffPct).toBe(60);
    expect(allMetrics[1].dropOffCount).toBe(48200 - 19280);

    // MENA & GCC segment filter has higher activation rate than PLG self-serve
    const menaMetrics = computeFunnelMetrics(stages, 'mena');
    const plgMetrics = computeFunnelMetrics(stages, 'plg');
    expect(menaMetrics[2].conversionFromPrevPct).toBeGreaterThan(plgMetrics[2].conversionFromPrevPct);
  });

  it('promotes an A/B experiment winner to 100% traffic and boosts downstream funnel conversion rates in real time', () => {
    const beforeStages = useInsights.getState().funnelStages;
    const beforeMenaActivation = computeFunnelMetrics(beforeStages, 'mena')[2].volume;
    const beforeAllExpansion = computeFunnelMetrics(beforeStages, 'all')[4].volume;

    const res = useInsights.getState().shipExperimentWinner('exp-rtl-gcc');
    expect(res.ok).toBe(true);

    const afterState = useInsights.getState();
    const shippedExp = afterState.experiments.find((e) => e.id === 'exp-rtl-gcc');
    expect(shippedExp?.status).toBe('shipped');

    const afterMenaActivation = computeFunnelMetrics(afterState.funnelStages, 'mena')[2].volume;
    const afterAllExpansion = computeFunnelMetrics(afterState.funnelStages, 'all')[4].volume;

    expect(afterMenaActivation).toBeGreaterThan(beforeMenaActivation);
    expect(afterAllExpansion).toBeGreaterThan(beforeAllExpansion);
  });

  it('calculates cohort Net Dollar Retention (NDR %) and Logo Retention averages across 8 quarterly cohorts', () => {
    const cohorts = useInsights.getState().cohorts;
    expect(cohorts).toHaveLength(8);

    const ndrSummary = computeCohortSummary(cohorts, 'ndr', 'all');
    expect(ndrSummary.q1Average).toBeGreaterThan(105);
    expect(ndrSummary.q4Average).toBeGreaterThan(130);
    expect(ndrSummary.peakRetentionPct).toBeGreaterThanOrEqual(145);

    const menaNdr = computeCohortSummary(cohorts, 'ndr', 'mena');
    const plgNdr = computeCohortSummary(cohorts, 'ndr', 'plg');
    expect(menaNdr.q4Average).toBeGreaterThan(plgNdr.q4Average);

    const logoSummary = computeCohortSummary(cohorts, 'logo', 'all');
    expect(logoSummary.q1Average).toBeGreaterThan(90);
    expect(logoSummary.q1Average).toBeLessThanOrEqual(100);
  });

  it('filters Z-score anomalies (|Z| > 2.5σ), acknowledges signals, and converts breakouts into growth plays', () => {
    const initialAnomalies = useInsights.getState().anomalies;
    const significant = filterAnomalies(initialAnomalies, { minAbsZ: 2.5 });
    expect(significant.length).toBe(initialAnomalies.length);
    expect(significant.every((a) => Math.abs(a.zScore) >= 2.5)).toBe(true);

    const breakouts = filterAnomalies(initialAnomalies, { category: 'breakout' });
    const frictions = filterAnomalies(initialAnomalies, { category: 'friction' });
    expect(breakouts.length).toBeGreaterThan(0);
    expect(frictions.length).toBeGreaterThan(0);

    // Acknowledge an active signal -> moves to 'investigating'
    const targetId = 'anom-mena-ndr';
    const ackRes = useInsights.getState().acknowledgeAnomaly(targetId);
    expect(ackRes.ok).toBe(true);
    expect(useInsights.getState().anomalies.find((a) => a.id === targetId)?.status).toBe('investigating');

    // Convert to Growth Play -> adds experiment to lab
    const prevExpCount = useInsights.getState().experiments.length;
    const playRes = useInsights.getState().convertAnomalyToGrowthPlay(targetId);
    expect(playRes.ok).toBe(true);
    expect(useInsights.getState().experiments.length).toBe(prevExpCount + 1);
  });

  it('projects 8-quarter Monte-Carlo ARR confidence fan (P10/P50/P90), Rule of 40, and $100M ARR countdown', () => {
    const baselineProj = runMonteCarloProjection(SCENARIO_PRESETS.baseline.levers);
    expect(baselineProj.points).toHaveLength(8);

    for (const pt of baselineProj.points) {
      expect(pt.p90ArrM).toBeGreaterThan(pt.p50ArrM);
      expect(pt.p50ArrM).toBeGreaterThan(pt.p10ArrM);
    }

    expect(baselineProj.endingP50ArrM).toBeGreaterThan(100);
    expect(baselineProj.quartersTo100M).not.toBeNull();
    expect(baselineProj.quartersTo100M!).toBeLessThanOrEqual(8);

    // AI Supercycle reaches $100M ARR faster and with higher ending ARR than Macro Stress Test
    const superProj = runMonteCarloProjection(SCENARIO_PRESETS.ai_supercycle.levers);
    const stressProj = runMonteCarloProjection(SCENARIO_PRESETS.macro_stress.levers);

    expect(superProj.endingP50ArrM).toBeGreaterThan(baselineProj.endingP50ArrM);
    expect(baselineProj.endingP50ArrM).toBeGreaterThan(stressProj.endingP50ArrM);
    expect(superProj.quartersTo100M!).toBeLessThanOrEqual(baselineProj.quartersTo100M!);
  });

  it('synthesizes Nova Natural-Language BI answers and pins cards to the Executive Board', () => {
    const ans = synthesizeNovaAnswer('Why did MENA Net Dollar Retention jump to 142%?');
    expect(ans.headline).toContain('142%');
    expect(ans.lineageModels.length).toBeGreaterThan(0);
    expect(ans.drivers.length).toBeGreaterThan(0);

    useInsights.getState().askNovaInsights('Compare Enterprise vs Mid-Market CAC payback');
    expect(useInsights.getState().activeNovaAnswer.headline).toContain('CAC Payback');

    const beforePinned = useInsights.getState().pinnedCards.length;
    const pinRes = useInsights.getState().pinInsightCard();
    expect(pinRes.ok).toBe(true);
    expect(useInsights.getState().pinnedCards.length).toBe(beforePinned + 1);
  });
});
