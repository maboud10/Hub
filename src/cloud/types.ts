/**
 * Stratos · Cloud Console — domain types.
 *
 * Telemetry, spend and carbon are *derived* from deterministic models in
 * `engine.ts` (relative to "now" and to the shared storyline in `Story`);
 * the persisted store only keeps what people did (acks, applied
 * recommendations, provisioning requests, schedules…).
 */

export type RegionId = 'me-central-1' | 'eu-west-2' | 'ap-southeast-1' | 'us-east-1';
export type ServiceId = 'hub-web' | 'mail-api' | 'chat-realtime' | 'payments-svc' | 'identity-svc' | 'search-svc' | 'notifications-svc' | 'data-pipeline';
export type TeamId = 'platform' | 'payments' | 'collab' | 'identity' | 'data';
export type HealthStatus = 'healthy' | 'degraded' | 'down';
export type MetricId = 'p95' | 'errors' | 'rps' | 'cpu';
export type CostCategory = 'compute' | 'database' | 'storage' | 'network' | 'observability' | 'ai';
export type DataClass = 'public' | 'internal' | 'confidential' | 'uae-personal' | 'eu-personal';

export interface Region {
  id: RegionId;
  /** Short HUD code, e.g. `ME1`. */
  code: string;
  /** Display name (translated by the shell), e.g. `UAE`, `London`. */
  name: string;
  city: string;
  lat: number;
  lon: number;
  /** UTC offset in hours (November). */
  utcOffset: number;
  /** Data-residency rule shown by the provisioning wizard (null = none). */
  residency: string | null;
  /** Average grid carbon intensity, gCO₂e/kWh. */
  gridIntensity: number;
  /** Carbon-free energy share, 0..1. */
  cfe: number;
  pue: number;
  /** Price multiplier vs us-east-1. */
  priceFactor: number;
}

export interface SloSpec {
  /** Availability target, e.g. 0.999. */
  target: number;
  /** p95 latency objective in ms. */
  latencyMs: number;
  windowDays: number;
}

export interface ServiceDef {
  id: ServiceId;
  name: string;
  team: TeamId;
  ownerId: string;
  onCallId: string;
  tier: 'critical' | 'high' | 'standard';
  runtime: string;
  description: string;
  regions: RegionId[];
  primaryRegion: RegionId;
  slo: SloSpec;
  baseP95: number;
  baseErrorRate: number;
  baseRps: number;
  /** Downstream dependencies (service ids or data-store node ids). */
  deps: string[];
  repo: string;
  /** Seeded last deploy (used when DevHub has no data). */
  lastDeploy: { version: string; authorId: string; minsAgo: number };
  /** Base daily cost in USD. */
  dailyCostUsd: number;
  costMix: Partial<Record<CostCategory, number>>;
  regionMix: Partial<Record<RegionId, number>>;
  /** Average running vCPUs (carbon model). */
  vcpus: number;
  /** Average CPU utilisation, 0..1. */
  cpuUtil: number;
  /** Past error-budget hits inside the SLO window. */
  budgetHits: { daysAgo: number; consumed: number; label: string }[];
}

export interface TopoNode {
  id: string;
  label: string;
  kind: 'edge' | 'service' | 'postgres' | 'redis' | 'queue' | 'warehouse' | 'search';
  x: number;
  y: number;
}

export interface Team {
  id: TeamId;
  name: string;
  leadId: string;
  budgetUsd: number;
  costCenter: string;
  color: string;
}

export type ResourceKind = 'k8s' | 'nodepool' | 'postgres' | 'redis' | 'bucket' | 'queue' | 'cdn' | 'notebook' | 'namespace';

export interface DriftItem {
  field: string;
  code: string;
  live: string;
  risk: 'low' | 'medium' | 'high';
}

export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  region: RegionId;
  service?: ServiceId;
  team: TeamId;
  size: string;
  /** Ascending size ladder used by rightsizing (each step ≈ 2× the previous). */
  sizeLadder?: string[];
  count?: number;
  parentId?: string;
  monthlyUsd: number;
  /** p95 utilisation over 14 days, 0..1. */
  cpu?: number;
  mem?: number;
  tags: Record<string, string>;
  encrypted: boolean;
  publicAccess?: boolean;
  dataClass: DataClass;
  managedBy: 'terraform' | 'console';
  drift?: DriftItem[];
  status: 'running' | 'provisioning' | 'idle';
  createdAt: number;
  detail: string;
}

export interface Quota {
  id: string;
  region: RegionId;
  label: string;
  used: number;
  limit: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertKind = 'latency' | 'errors' | 'burn' | 'cost' | 'saturation' | 'carbon';

export interface AlertRule {
  id: string;
  name: string;
  service?: ServiceId;
  kind: AlertKind;
  expr: string;
  forMins: number;
  severity: AlertSeverity;
  channel: string;
  /** Rule is firing in the storyline (until the cause recovers). */
  storyFiring?: 'incident' | 'egress' | 'quota';
  firingValue?: string;
}

export interface LiveAlert {
  id: string;
  rule: AlertRule;
  since: number;
  value: string;
  region?: RegionId;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  id: string;
  at: number;
  level: LogLevel;
  service: ServiceId;
  region: RegionId;
  msg: string;
  traceId?: string;
  attrs: Record<string, string | number>;
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  service: string;
  op: string;
  /** Offset from trace start, ms. */
  start: number;
  dur: number;
  status: 'ok' | 'error' | 'slow';
  note?: string;
}

export interface Trace {
  id: string;
  root: string;
  service: ServiceId;
  region: RegionId;
  at: number;
  durMs: number;
  status: 'ok' | 'error' | 'slow';
  spans: TraceSpan[];
}

export interface AnomalyDef {
  id: string;
  service: ServiceId;
  category: CostCategory;
  region: RegionId;
  title: string;
  /** Days the anomaly has been running. */
  days: number;
  /** Daily cost multiplier for the category while it runs (4.4 = +340%). */
  factor: number;
  drivers: string[];
  explanation: string;
  fix: string;
  /** Monthly saving when fixed. */
  savingsUsd: number;
}

export interface Recommendation {
  id: string;
  kind: 'rightsize' | 'commitment' | 'idle' | 'storage';
  resourceId?: string;
  title: string;
  detail: string;
  savingsUsd: number;
  carbonKg: number;
  effort: 'low' | 'medium' | 'high';
  team: TeamId;
}

export interface Commitment {
  id: string;
  label: string;
  provider: 'AWS' | 'GCP';
  coverage: number;
  target: number;
  utilisation: number;
  /** Suggested additional hourly commitment. */
  suggestHourlyUsd: number;
  suggestSavingsUsd: number;
  expiresInDays: number;
}

export interface CloudContract {
  id: string;
  provider: string;
  /** Annual committed spend. */
  commitUsd: number;
  /** Months elapsed in the current term year (0..12). */
  monthsElapsed: number;
  consumedUsd: number;
  renewal: string;
  vendorId?: string;
  source: 'procurement' | 'seed';
}

export interface BatchJob {
  id: string;
  name: string;
  service: ServiceId;
  region: RegionId;
  durationH: number;
  /** Scheduled start, UTC hour. */
  startHourUtc: number;
  /** Energy per run, kWh. */
  kwhPerRun: number;
  runsPerMonth: number;
  /** Data must stay in its region (only time can move). */
  pinned: boolean;
}

export type ProvisionTemplate = 'postgres' | 'redis' | 'namespace' | 'bucket' | 'gpu-notebook';
export type Env = 'production' | 'staging' | 'dev';

export interface ProvisionSpec {
  template: ProvisionTemplate;
  name: string;
  team: TeamId;
  service?: ServiceId;
  region: RegionId;
  size: string;
  env: Env;
  dataClass: DataClass;
  encrypted: boolean;
  publicAccess: boolean;
  tags: Record<string, string>;
  /** GPU notebooks auto-stop after this many hours per working day. */
  hoursPerDay?: number;
}

export type PolicyOutcome = 'pass' | 'warn' | 'fail';
export type PolicyId = 'tags' | 'encryption' | 'residency' | 'public' | 'budget';

export interface PolicyCheck {
  id: PolicyId;
  outcome: PolicyOutcome;
  /** English detail (static words; dynamic bits in `values`). */
  detail: string;
  values?: string[];
}

export interface ProvisionRequest {
  id: string;
  spec: ProvisionSpec;
  createdAt: number;
  requesterId: string;
  monthlyUsd: number;
  checks: PolicyCheck[];
  needsApproval: boolean;
  approverId: string;
  /** ms per stage: Requested, Policy check, Approval, Provisioning. */
  stageMs: [number, number, number, number];
  vaultPath: string;
  delivered?: boolean;
  cancelled?: boolean;
}

export interface StoryIncident {
  code: string;
  title: string;
  severity: string;
  status: string;
  to: string;
  startedAt: number;
  source: 'incidents' | 'seed';
}

/** The shared storyline: the payments-svc v2.41.0 deploy and its fallout. */
export interface Story {
  deployAt: number;
  version: string;
  authorId: string;
  deployTo: string;
  /** When the regression was rolled back (null = still degraded). */
  recoveredAt: number | null;
  source: 'devhub' | 'seed';
  incident: StoryIncident | null;
}

export interface AlertState {
  status: 'acknowledged' | 'silenced' | 'sent';
  at: number;
  by: string;
  until?: number;
  incidentTo?: string;
  incidentCode?: string;
}

export interface ActionState {
  status: 'acknowledged' | 'resolved' | 'applied' | 'task' | 'dismissed';
  at: number;
  by: string;
  taskTo?: string;
}

/** Persisted, user-made state. */
export interface CloudData {
  version: number;
  alerts: Record<string, AlertState>;
  rules: Record<string, boolean>;
  anomalies: Record<string, ActionState>;
  recs: Record<string, ActionState>;
  patches: Record<string, Partial<Resource>>;
  requests: ProvisionRequest[];
  schedules: Record<string, { startHourUtc: number; at: number; by: string }>;
  declared: Record<string, { incidentId: string; to: string; at: number }>;
  notified: Record<string, number>;
}
