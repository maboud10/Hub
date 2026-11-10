import type { SigilId } from '@/projects/sigils';

export type DealStage = 'discovery' | 'poc' | 'security' | 'commit' | 'won';

export type CrmRegion = 'MENA & GCC' | 'Europe' | 'North America' | 'APAC';

export type CrmSegment = 'Sovereign & Megaproject' | 'Enterprise' | 'Mid-Market';

export type MeddpiccPillarId =
  | 'metrics'
  | 'economicBuyer'
  | 'decisionCriteria'
  | 'decisionProcess'
  | 'paperProcess'
  | 'identifyPain'
  | 'champion'
  | 'competition';

export type CrmModuleId =
  | 'coreHub'
  | 'novaCopilot'
  | 'zeroTrustVault'
  | 'gccResidency'
  | 'workflowAuto';

export type ModuleAdoptionState = 'adopted' | 'trial' | 'whitespace';

export interface MeddpiccPillarMeta {
  id: MeddpiccPillarId;
  short: string;
  label: string;
  weight: number;
  description: string;
}

export interface DealStakeholder {
  name: string;
  role: string;
  stance: 'champion' | 'supporter' | 'neutral' | 'blocker';
  lastTouch: string;
}

export interface DealActivity {
  id: string;
  ts: number;
  actorId: string;
  kind: 'ai_play' | 'stage_move' | 'meddpicc' | 'security_pack' | 'exec_sync';
  text: string;
}

export interface CrmDeal {
  id: string;
  title: string;
  accountId: string;
  accountName: string;
  sigil: SigilId;
  color: string;
  stage: DealStage;
  region: CrmRegion;
  segment: CrmSegment;
  acv: number; // Annual Contract Value in USD
  closeDate: string; // YYYY-MM-DD
  ownerId: string;
  execSponsorId: string;
  baseWinProb: number; // baseline 0..99 before MEDDPICC adjustments
  momentum: number[]; // 7-point velocity sparkline
  meddpicc: Record<MeddpiccPillarId, boolean>;
  meddpiccNotes: Record<MeddpiccPillarId, string>;
  riskFlags: string[];
  nextBestAction: string;
  stakeholders: DealStakeholder[];
  activities: DealActivity[];
  isExpansion?: boolean;
  targetModule?: CrmModuleId;
  updatedAt: number;
}

export interface AccountModuleSlot {
  moduleId: CrmModuleId;
  state: ModuleAdoptionState;
  potentialArr: number; // Expansion whitespace value in USD
  note?: string;
}

export interface CrmAccount {
  id: string;
  name: string;
  sigil: SigilId;
  color: string;
  region: CrmRegion;
  segment: CrmSegment;
  industry: string;
  ownerId: string;
  csmId: string;
  arr: number; // Current live ARR in USD
  nrr: number; // Net Revenue Retention % (e.g. 142)
  healthScore: number; // 0..100
  seatsLicensed: number;
  seatsActive: number;
  renewalDate: string;
  rtlTelemetryActive?: boolean;
  telemetryTrend: number[];
  modules: Record<CrmModuleId, AccountModuleSlot>;
  expansionSignal: string;
}

export interface GrowthPlay {
  id: string;
  title: string;
  subtitle: string;
  accountId: string;
  accountName: string;
  dealId?: string;
  sigil: SigilId;
  color: string;
  impactArr: number;
  confidence: number; // 0..99
  kind: 'multithread' | 'security_packet' | 'expansion_launch' | 'exec_brief';
  ctaLabel: string;
  executed: boolean;
  executedAt?: number;
  tags: string[];
}

export interface BuyingSignal {
  id: string;
  accountId: string;
  accountName: string;
  sigil: SigilId;
  color: string;
  region: CrmRegion;
  category: 'usage_surge' | 'security_vault' | 'champion_move' | 'rtl_localization' | 'ai_copilot';
  title: string;
  detail: string;
  intentScore: number; // 0..99
  ts: number;
  matchedPlaybookId: string;
  actioned?: boolean;
}

export interface GrowthPlaybook {
  id: string;
  title: string;
  trigger: string;
  actionSummary: string;
  sigil: SigilId;
  color: string;
  enabled: boolean;
  conversionUplift: string;
  pipelineGenerated: number;
  runsCount: number;
  lastRunAt: number;
  targetRegion: CrmRegion | 'All';
}

export type SimulatorPresetId = 'conservative' | 'base' | 'hypergrowth';

export interface SimulatorConfig {
  preset: SimulatorPresetId;
  winRateUplift: number; // 0..15 (%)
  cycleCompression: number; // 0..35 (%)
  netDollarRetention: number; // 110..160 (%)
  copilotAttachRate: number; // 20..90 (%)
}

export interface QuarterForecastPoint {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  committedArr: number;
  bestCaseArr: number;
  neuralForecastArr: number;
}

export interface RegionalPodQuota {
  region: CrmRegion;
  leadId: string;
  quotaArr: number;
  projectedArr: number;
  attainmentPct: number;
  dealCount: number;
  color: string;
}

export interface SimulatorProjection {
  fy27ProjectedArr: number;
  arrDeltaVsBase: number;
  newLogoArr: number;
  expansionArr: number;
  aiCopilotArr: number;
  effectiveWinRate: number;
  avgCycleDays: number;
  quarterlyCurve: {
    quarter: string;
    baselineArr: number;
    simulatedArr: number;
    expansionSlice: number;
  }[];
  regionalPods: RegionalPodQuota[];
}

export interface NovaCrmResponse {
  id: string;
  query: string;
  headline: string;
  summary: string;
  confidence: number;
  metrics: {
    label: string;
    value: string;
    sub?: string;
    tone?: 'emerald' | 'cyan' | 'amber' | 'rose' | 'violet';
  }[];
  bullets: string[];
  recommendedAction?: {
    label: string;
    kind: 'execute_play' | 'advance_deal' | 'launch_expansion' | 'inspect_deal';
    dealId?: string;
    accountId?: string;
    playId?: string;
  };
  createdAt: number;
}
