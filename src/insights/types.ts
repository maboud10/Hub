/**
 * Helix Insights — "Quantum Telemetry & Growth Cortex"
 * Domain types for governed metrics, Nova causal copilot, full-lifecycle funnel,
 * A/B experimentation lab, cohort NDR heatmaps, Z-score anomaly radar, and
 * Monte-Carlo $100M ARR forecasting.
 */

export type InsightsSegment = 'all' | 'mena' | 'enterprise' | 'plg';

export type TelemetryCanvasMode = 'waterfall' | 'north_star' | 'regional_mix' | 'rule_of_40';

export type CohortMode = 'ndr' | 'logo';

export type AnomalyCategory = 'breakout' | 'friction';

export type AnomalyStatus = 'active' | 'investigating' | 'resolved';

export type ScenarioPresetId = 'baseline' | 'gcc_sovereign' | 'ai_supercycle' | 'macro_stress';

export interface GovernedMetric {
  id: string;
  code: string;
  name: string;
  category: 'growth' | 'retention' | 'efficiency' | 'activation' | 'ai';
  value: string;
  numericValue: number;
  unit: string;
  delta: string;
  deltaPositive: boolean;
  ownerId: string;
  sigil: string;
  color: string;
  freshnessMinutes: number;
  warehouseTable: string;
  formula: string;
  spark: number[];
  certified: boolean;
}

export interface NovaDriverBar {
  label: string;
  impact: string;
  /** Normalized 0..1 bar width */
  weight: number;
  tone: 'emerald' | 'cyan' | 'indigo' | 'amber' | 'rose';
}

export interface NovaInsightAnswer {
  id: string;
  question: string;
  headline: string;
  narrative: string;
  sqlSnippet: string;
  lineageModels: string[];
  confidence: number;
  drivers: NovaDriverBar[];
  recommendedAction: string;
  createdAt: number;
  pinned: boolean;
}

export interface FunnelStage {
  id: string;
  order: number;
  name: string;
  subtitle: string;
  sigil: string;
  color: string;
  ownerId: string;
  segmentVolumes: Record<InsightsSegment, number>;
  medianTimeHours: Record<InsightsSegment, number>;
  bottleneckDiagnosis: string;
  /** Annualized ARR impact ($K) of +1.0% stage conversion lift */
  plusOnePctArrImpactK: number;
}

export interface ComputedFunnelStage extends FunnelStage {
  volume: number;
  conversionFromPrevPct: number;
  cumulativeConversionPct: number;
  dropOffPct: number;
  dropOffCount: number;
  medianHours: number;
}

export interface GrowthExperiment {
  id: string;
  code: string;
  title: string;
  hypothesis: string;
  targetStageId: string;
  segment: InsightsSegment;
  ownerId: string;
  sigil: string;
  color: string;
  status: 'running' | 'shipped';
  controlRatePct: number;
  variantRatePct: number;
  relativeUpliftPct: number;
  /** 0..1 statistical confidence (e.g. 0.994 = 99.4%) */
  confidence: number;
  sampleSize: number;
  arrLiftK: number;
  shippedAt?: number;
}

export interface CohortRow {
  id: string;
  quarter: string;
  segment: InsightsSegment;
  startingLogoCount: number;
  startingArrM: number;
  /** Q0 through Q7 Net Dollar Retention % (null for future unelapsed quarters) */
  ndrByQuarter: (number | null)[];
  /** Q0 through Q7 Logo Retention % (null for future unelapsed quarters) */
  logoByQuarter: (number | null)[];
}

export interface CausalFeatureDriver {
  id: string;
  featureName: string;
  appBadge: string;
  sigil: string;
  color: string;
  ownerId: string;
  retention90dWithPct: number;
  retention90dWithoutPct: number;
  causalLiftPct: number;
  pearsonR: number;
  adoptionPct: Record<InsightsSegment, number>;
  thresholdHabit: string;
}

export interface AnomalySignal {
  id: string;
  code: string;
  title: string;
  metricName: string;
  category: AnomalyCategory;
  status: AnomalyStatus;
  /** Signed statistical Z-score (|Z| > 2.5σ) */
  zScore: number;
  deltaLabel: string;
  segmentLabel: string;
  driverAttribution: string;
  ownerId: string;
  detectedAt: string;
  sigil: string;
  color: string;
  baselineSeries: number[];
  actualSeries: number[];
  upperBand: number;
  lowerBand: number;
  growthPlayCreated?: boolean;
}

export interface ForecastLevers {
  topOfFunnelGrowthPct: number;
  activationConversionPct: number;
  annualGrossChurnPct: number;
  netExpansionRatePct: number;
  novaAiAttachRatePct: number;
}

export interface ForecastQuarterPoint {
  quarter: string;
  p10ArrM: number;
  p50ArrM: number;
  p90ArrM: number;
  newArrM: number;
  expansionArrM: number;
  churnedArrM: number;
}

export interface ForecastProjection {
  points: ForecastQuarterPoint[];
  currentArrM: number;
  endingP50ArrM: number;
  endingP90ArrM: number;
  endingP10ArrM: number;
  quartersTo100M: number | null;
  target100MQuarterLabel: string;
  yoyGrowthPct: number;
  fcfMarginPct: number;
  ruleOf40Score: number;
  burnMultiple: number;
  magicNumber: number;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  presetId: ScenarioPresetId | 'custom';
  levers: ForecastLevers;
  endingP50ArrM: number;
  ruleOf40Score: number;
  quartersTo100M: number | null;
  createdAt: number;
  authorId: string;
}

export interface WaterfallStep {
  id: string;
  label: string;
  valueM: number;
  kind: 'start' | 'positive' | 'negative' | 'total';
  sub: string;
}

export interface RegionalArrSlice {
  id: string;
  region: string;
  arrM: number;
  sharePct: number;
  yoyGrowthPct: number;
  ndrPct: number;
  color: string;
  leadOwnerId: string;
  flagshipHub: string;
}

export interface InsightsData {
  version: number;
  activeSegment: InsightsSegment;
  canvasMode: TelemetryCanvasMode;
  cohortMode: CohortMode;
  metrics: GovernedMetric[];
  activeNovaAnswer: NovaInsightAnswer;
  pinnedCards: NovaInsightAnswer[];
  funnelStages: FunnelStage[];
  experiments: GrowthExperiment[];
  cohorts: CohortRow[];
  causalDrivers: CausalFeatureDriver[];
  anomalies: AnomalySignal[];
  activePreset: ScenarioPresetId | 'custom';
  forecastLevers: ForecastLevers;
  snapshots: ScenarioSnapshot[];
}
