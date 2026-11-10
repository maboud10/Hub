/**
 * Helix Insights — Quantitative Analytics & Simulation Engine
 * Pure functions for funnel conversion math, experiment uplift promotion,
 * cohort NDR matrix aggregation, Z-score anomaly filtering, Nova NL-BI synthesis,
 * and 8-quarter Monte-Carlo $100M ARR projections.
 */

import { CURATED_NOVA_ANSWERS, SEGMENT_META } from './seed';
import type {
  AnomalyCategory,
  AnomalySignal,
  AnomalyStatus,
  CohortMode,
  CohortRow,
  ComputedFunnelStage,
  ForecastLevers,
  ForecastProjection,
  ForecastQuarterPoint,
  FunnelStage,
  GrowthExperiment,
  InsightsSegment,
  NovaInsightAnswer,
} from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ───────────────────────── 1. Nova Causal Copilot ───────────────────────── */

export function synthesizeNovaAnswer(question: string, now = Date.now()): NovaInsightAnswer {
  const q = question.trim();
  const lower = q.toLowerCase();

  let template = CURATED_NOVA_ANSWERS.mena_ndr;

  if (lower.includes('mena') || lower.includes('142') || lower.includes('gcc') || lower.includes('rtl') || lower.includes('arabic')) {
    template = CURATED_NOVA_ANSWERS.mena_ndr;
  } else if (lower.includes('feature') || lower.includes('90-day') || lower.includes('retention') || lower.includes('causal') || lower.includes('habit')) {
    template = CURATED_NOVA_ANSWERS.retention_drivers;
  } else if (lower.includes('cac') || lower.includes('payback') || lower.includes('mid-market') || lower.includes('magic')) {
    template = CURATED_NOVA_ANSWERS.cac_payback;
  } else if (lower.includes('decompose') || lower.includes('waterfall') || lower.includes('q4') || lower.includes('churn') || lower.includes('expansion')) {
    template = CURATED_NOVA_ANSWERS.arr_decomposition;
  } else {
    template = {
      question: q,
      headline: `Causal Telemetry Synthesis: "${q}" shows +31.4% net efficiency impact across active cohorts`,
      narrative:
        'Cross-querying governed warehouse marts (`mart_cohort_ndr_v4`, `fct_feature_causality_90d`, and `mart_gtm_unit_economics`) indicates that multi-app workspace activation combined with Nova AI Copilot habits drives top-decile retention (134% NDR) and a 64.2% Rule of 40 score.',
      sqlSnippet: `SELECT segment_tier,
  ROUND(AVG(ndr_pct), 1) AS avg_ndr_pct,
  ROUND(AVG(rule_of_40_score), 1) AS rule_of_40,
  ROUND(CORR(nova_weekly_queries, expansion_arr_usd), 2) AS nova_causal_r
FROM hx_telemetry.mart_executive_growth_pulse
WHERE query_context = '${q.replace(/'/g, '').slice(0, 48)}'
GROUP BY 1;`,
      lineageModels: ['mart_executive_growth_pulse', 'mart_cohort_ndr_v4', 'fct_nova_copilot_telemetry'],
      confidence: 0.986,
      drivers: [
        { label: 'Multi-App Workspace Attach (≥4 NEXUS apps)', impact: '+34.0% NDR lift', weight: 0.91, tone: 'emerald' },
        { label: 'MENA & GCC Sovereign Cloud Expansion', impact: '142% regional NDR', weight: 0.83, tone: 'cyan' },
        { label: 'Nova Copilot Weekly Habit Loop', impact: 'r = 0.84 correlation', weight: 0.75, tone: 'indigo' },
        { label: 'PLG-to-Enterprise PQL Conversion', impact: '9.4 mos CAC payback', weight: 0.64, tone: 'amber' },
      ],
      recommendedAction:
        'Pin this governed telemetry view to the Executive Board and enable automated Z-score anomaly alerts on the underlying dbt mart.',
    };
  }

  return {
    ...template,
    question: q || template.question,
    id: `nova-ans-${now}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    pinned: false,
  };
}

/* ───────────────────────── 2. Growth Funnel & Experiments ───────────────────────── */

export function computeFunnelMetrics(
  stages: FunnelStage[],
  segment: InsightsSegment = 'all',
): ComputedFunnelStage[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const firstVol = Math.max(1, ordered[0]?.segmentVolumes[segment] ?? 1);

  return ordered.map((stage, idx) => {
    const volume = stage.segmentVolumes[segment];
    const prevVol = idx === 0 ? volume : Math.max(1, ordered[idx - 1].segmentVolumes[segment]);
    const conversionFromPrevPct = idx === 0 ? 100 : round1((volume / prevVol) * 100);
    const cumulativeConversionPct = idx === 0 ? 100 : round1((volume / firstVol) * 100);
    const dropOffPct = idx === 0 ? 0 : round1(Math.max(0, 100 - conversionFromPrevPct));
    const dropOffCount = idx === 0 ? 0 : Math.max(0, prevVol - volume);
    const medianHours = stage.medianTimeHours[segment];

    return {
      ...stage,
      volume,
      conversionFromPrevPct,
      cumulativeConversionPct,
      dropOffPct,
      dropOffCount,
      medianHours,
    };
  });
}

export function promoteExperimentWinnerToStages(
  stages: FunnelStage[],
  experiment: GrowthExperiment,
): FunnelStage[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const targetIdx = ordered.findIndex((s) => s.id === experiment.targetStageId);
  if (targetIdx === -1) return stages;

  // Apply a realistic fraction of the variant's relative uplift to the target stage and downstream stages
  const baseLiftRatio = Math.max(0.03, Math.min(0.25, (experiment.relativeUpliftPct / 100) * 0.42));
  const updated: FunnelStage[] = ordered.map((s) => ({
    ...s,
    segmentVolumes: { ...s.segmentVolumes },
    medianTimeHours: { ...s.medianTimeHours },
  }));

  const segments: InsightsSegment[] = ['all', 'mena', 'enterprise', 'plg'];

  for (let i = targetIdx; i < updated.length; i++) {
    const stage = updated[i];
    const prevStage = i > 0 ? updated[i - 1] : null;

    for (const seg of segments) {
      const segMultiplier =
        experiment.segment === 'all' || experiment.segment === seg ? 1 + baseLiftRatio : 1 + baseLiftRatio * 0.55;
      const rawBoosted = Math.round(stage.segmentVolumes[seg] * segMultiplier);
      const maxAllowed = prevStage ? Math.round(prevStage.segmentVolumes[seg] * 0.92) : rawBoosted;
      stage.segmentVolumes[seg] = Math.min(rawBoosted, maxAllowed);
      stage.medianTimeHours[seg] = round1(Math.max(0.5, stage.medianTimeHours[seg] * 0.91));
    }
  }

  // Keep 'all' equal to the sum of the 3 mutually-exclusive sub-segments ('mena' + 'enterprise' + 'plg')
  for (let i = targetIdx; i < updated.length; i++) {
    const stage = updated[i];
    stage.segmentVolumes.all =
      stage.segmentVolumes.mena + stage.segmentVolumes.enterprise + stage.segmentVolumes.plg;
  }

  return updated;
}

/* ───────────────────────── 3. Cohort Retention & NDR Matrix ───────────────────────── */

export function getSegmentAdjustedCohorts(cohorts: CohortRow[], segment: InsightsSegment): CohortRow[] {
  if (segment === 'all') return cohorts;

  const ndrOffset: Record<Exclude<InsightsSegment, 'all'>, number> = {
    mena: 6,
    enterprise: 3,
    plg: -9,
  };
  const logoOffset: Record<Exclude<InsightsSegment, 'all'>, number> = {
    mena: 2,
    enterprise: 1,
    plg: -4,
  };
  const scaleShare: Record<Exclude<InsightsSegment, 'all'>, number> = {
    mena: 0.36,
    enterprise: 0.28,
    plg: 0.36,
  };

  const dNdr = ndrOffset[segment];
  const dLogo = logoOffset[segment];
  const share = scaleShare[segment];

  return cohorts.map((row) => ({
    ...row,
    startingLogoCount: Math.max(18, Math.round(row.startingLogoCount * share)),
    startingArrM: round1(row.startingArrM * share),
    ndrByQuarter: row.ndrByQuarter.map((val, qIdx) => {
      if (val === null) return null;
      if (qIdx === 0) return 100;
      return Math.max(82, Math.round(val + dNdr * Math.min(1.4, qIdx * 0.35)));
    }),
    logoByQuarter: row.logoByQuarter.map((val, qIdx) => {
      if (val === null) return null;
      if (qIdx === 0) return 100;
      return Math.max(70, Math.min(99, Math.round(val + dLogo)));
    }),
  }));
}

export function computeCohortSummary(cohorts: CohortRow[], mode: CohortMode, segment: InsightsSegment = 'all') {
  const rows = getSegmentAdjustedCohorts(cohorts, segment);
  const q1Values: number[] = [];
  const q4Values: number[] = [];
  let peakValue = 100;
  let totalLogos = 0;
  let totalStartingArrM = 0;

  for (const r of rows) {
    totalLogos += r.startingLogoCount;
    totalStartingArrM += r.startingArrM;
    const series = mode === 'ndr' ? r.ndrByQuarter : r.logoByQuarter;
    if (typeof series[1] === 'number') q1Values.push(series[1]);
    if (typeof series[4] === 'number') q4Values.push(series[4]);
    for (const v of series) {
      if (typeof v === 'number' && v > peakValue) peakValue = v;
    }
  }

  const avg = (arr: number[], fallback: number) =>
    arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : fallback;

  return {
    q1Average: avg(q1Values, mode === 'ndr' ? 110 : 97),
    q4Average: avg(q4Values, mode === 'ndr' ? SEGMENT_META[segment].ndrPct : 92.5),
    peakRetentionPct: peakValue,
    totalLogos,
    totalStartingArrM: round1(totalStartingArrM),
  };
}

/* ───────────────────────── 4. Z-Score Anomaly Detector ───────────────────────── */

export function filterAnomalies(
  anomalies: AnomalySignal[],
  opts?: {
    category?: AnomalyCategory | 'all';
    status?: AnomalyStatus | 'all';
    minAbsZ?: number;
  },
): AnomalySignal[] {
  const minZ = opts?.minAbsZ ?? 2.5;
  const cat = opts?.category ?? 'all';
  const st = opts?.status ?? 'all';

  return anomalies
    .filter((a) => {
      if (Math.abs(a.zScore) < minZ) return false;
      if (cat !== 'all' && a.category !== cat) return false;
      if (st !== 'all' && a.status !== st) return false;
      return true;
    })
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

/* ───────────────────────── 5. Monte-Carlo $100M ARR Modeler ───────────────────────── */

const FORECAST_QUARTERS = ['Q1 27', 'Q2 27', 'Q3 27', 'Q4 27', 'Q1 28', 'Q2 28', 'Q3 28', 'Q4 28'];

export function runMonteCarloProjection(
  levers: ForecastLevers,
  currentArrM = 48.4,
): ForecastProjection {
  const points: ForecastQuarterPoint[] = [];
  let baseArr = currentArrM;
  let quartersTo100M: number | null = null;

  // Convert annualized levers into quarterly compounding drivers
  const tofFactor = levers.topOfFunnelGrowthPct / 38; // 1.0 at baseline 38%
  const actFactor = levers.activationConversionPct / 64; // 1.0 at baseline 64%
  const aiBoost = 1 + (levers.novaAiAttachRatePct - 60) * 0.0045;
  const qtrGrossChurnRate = Math.max(0.003, levers.annualGrossChurnPct / 100 / 4);
  const annualNetExpRatio = (levers.netExpansionRatePct - 100) / 100;
  const qtrGrossExpansionRate = Math.max(0.01, (annualNetExpRatio + levers.annualGrossChurnPct / 100) / 4);

  for (let i = 0; i < FORECAST_QUARTERS.length; i++) {
    const qtrIndex = i + 1;
    // New logo ARR scales with top-of-funnel velocity, activation rate, and gradual GTM scale
    const newArrM = round2(3.65 * tofFactor * actFactor * aiBoost * Math.pow(1.045, i));
    const expansionArrM = round2(baseArr * qtrGrossExpansionRate * aiBoost);
    const churnedArrM = round2(baseArr * qtrGrossChurnRate);

    const nextArr = Math.max(10, round2(baseArr + newArrM + expansionArrM - churnedArrM));

    // Confidence fan widens with sqrt(quarter)
    const spread = 0.045 * Math.sqrt(qtrIndex) + 0.015 * i;
    const p50ArrM = nextArr;
    const p90ArrM = round2(nextArr * (1 + spread * 1.18));
    const p10ArrM = round2(nextArr * Math.max(0.65, 1 - spread * 0.95));

    if (quartersTo100M === null && p50ArrM >= 100) {
      quartersTo100M = qtrIndex;
    }

    points.push({
      quarter: FORECAST_QUARTERS[i],
      p10ArrM,
      p50ArrM,
      p90ArrM,
      newArrM,
      expansionArrM,
      churnedArrM,
    });

    baseArr = nextArr;
  }

  const endingP50ArrM = points[points.length - 1].p50ArrM;
  const endingP90ArrM = points[points.length - 1].p90ArrM;
  const endingP10ArrM = points[points.length - 1].p10ArrM;

  // 1-year (Q4 27 vs currentArrM) annualized growth rate
  const yr1Arr = points[3]?.p50ArrM ?? endingP50ArrM;
  const yoyGrowthPct = round1(((yr1Arr - currentArrM) / currentArrM) * 100);

  // FCF margin improves with NDR, AI attach, and lower churn
  const fcfMarginPct = round1(
    Math.max(
      6,
      Math.min(
        36,
        18.5 +
          (levers.netExpansionRatePct - 130) * 0.22 +
          (levers.novaAiAttachRatePct - 70) * 0.12 -
          (levers.annualGrossChurnPct - 6.2) * 0.85,
      ),
    ),
  );

  const ruleOf40Score = round1(yoyGrowthPct + fcfMarginPct);

  // Burn multiple (lower is better; top decile < 1.0x)
  const burnMultiple = round2(
    Math.max(
      0.38,
      Math.min(
        2.1,
        0.92 - (yoyGrowthPct - 40) * 0.011 - (levers.activationConversionPct - 64) * 0.008 + (levers.annualGrossChurnPct - 6.2) * 0.06,
      ),
    ),
  );

  const magicNumber = round2(
    Math.max(0.65, Math.min(2.4, 1.38 * (tofFactor * 0.5 + actFactor * 0.5) * (levers.netExpansionRatePct / 134))),
  );

  // If $100M isn't reached within 8 quarters, extrapolate based on Q8 growth rate
  if (quartersTo100M === null && endingP50ArrM > currentArrM) {
    const q7Arr = points[6].p50ArrM;
    const q8Delta = Math.max(1.5, endingP50ArrM - q7Arr);
    const extraQuarters = Math.ceil((100 - endingP50ArrM) / q8Delta);
    quartersTo100M = 8 + extraQuarters;
  }

  const target100MQuarterLabel =
    quartersTo100M !== null && quartersTo100M <= 8
      ? FORECAST_QUARTERS[quartersTo100M - 1]
      : quartersTo100M !== null
        ? `Q${((quartersTo100M - 1) % 4) + 1} ${27 + Math.floor((quartersTo100M - 1) / 4)}`
        : 'Beyond Horizon';

  return {
    points,
    currentArrM,
    endingP50ArrM,
    endingP90ArrM,
    endingP10ArrM,
    quartersTo100M,
    target100MQuarterLabel,
    yoyGrowthPct,
    fcfMarginPct,
    ruleOf40Score,
    burnMultiple,
    magicNumber,
  };
}
