/**
 * DevHub — "Forge" domain types.
 *
 * Shared storyline with Cloud Console + Incident Command: eight services in four
 * regions; ~40 minutes ago Priya shipped `payments-svc v2.41.0` to production in
 * eu-west-2, its canary is held by a health-gate warning and INC-2047 (SEV2) is open.
 */
import type { BridgeSource } from '@/lib/appBridge';

export type ServiceId = 'hub-web' | 'mail-api' | 'chat-realtime' | 'payments-svc' | 'identity-svc' | 'search-svc' | 'notifications-svc' | 'data-pipeline' | (string & {});
export type RegionId = 'me-central-1' | 'eu-west-2' | 'ap-southeast-1' | 'us-east-1';
export type EnvId = 'preview' | 'staging' | 'production';
export type Language = 'TypeScript' | 'Go' | 'Rust' | 'Kotlin' | 'Python' | 'Elixir';

/* ───────────────────────── catalog ───────────────────────── */

export interface Scorecard {
  /** Test coverage 0..1 */
  coverage: number;
  docs: boolean;
  runbook: boolean;
  slo: boolean;
  /** Share of dependencies on a current major/minor, 0..1 */
  depsFreshness: number;
  vulns: { critical: number; high: number; medium: number };
}

export interface Service {
  id: ServiceId;
  repo: string;
  team: string;
  ownerId: string;
  tier: 1 | 2 | 3;
  language: Language;
  description: string;
  regions: RegionId[];
  /** On-call rotation name (matched against Incident Command rotations). */
  rotation: string;
  dependsOn: ServiceId[];
  scorecard: Scorecard;
  /** Availability objective, e.g. 99.95 */
  sloTarget: number;
  /** Normal p95 in ms. */
  baselineP95: number;
  /** p95 objective in ms — a canary above it fails the latency gate. */
  latencySloMs: number;
  /** Production version (most regions). */
  version: string;
  /** Created through the golden path in this session. */
  scaffolded?: boolean;
}

export interface CodeOwner {
  /** `repo-name/path/prefix` */
  prefix: string;
  owners: { userId: string; share: number }[];
}

/* ───────────────────────── pull requests ───────────────────────── */

export type PrState = 'draft' | 'open' | 'changes_requested' | 'approved' | 'queued' | 'merged' | 'closed';
export type FileLang = 'go' | 'ts' | 'tsx' | 'rs' | 'sql' | 'yaml' | 'py' | 'kt' | 'ex' | 'css' | 'env' | 'md';

export interface DiffLine {
  kind: 'ctx' | 'add' | 'del';
  text: string;
  oldNo?: number;
  newNo?: number;
}

export interface DiffHunk {
  id: string;
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  lang: FileLang;
  hunks: DiffHunk[];
}

export interface Suggestion {
  /** Exact text of the line to replace (new side). */
  replace: string;
  with: string;
}

export interface ReviewComment {
  id: string;
  authorId: string;
  at: number;
  body: string;
  file?: string;
  /** New-side line number the thread hangs off. */
  line?: number;
  suggestion?: Suggestion;
  applied?: boolean;
  resolved?: boolean;
  /** Written by Nova (the AI reviewer). */
  nova?: boolean;
}

export type ReviewState = 'pending' | 'approved' | 'changes_requested' | 'commented';

export interface Review {
  reviewerId: string;
  state: ReviewState;
  requestedAt: number;
  at?: number;
}

export type CheckStatus = 'success' | 'failure' | 'running' | 'queued' | 'skipped';

export interface CheckRun {
  name: string;
  status: CheckStatus;
  durationSec?: number;
  required: boolean;
}

export interface SecretFinding {
  id?: string;
  file: string;
  line: number;
  kind: string;
  preview: string;
  status: 'blocking' | 'reported' | 'rotated';
  caseId?: string;
  caseTo?: string;
  requestTo?: string;
}

export interface CommitItem {
  sha: string;
  service: ServiceId;
  repo: string;
  branch: string;
  message: string;
  authorId: string;
  at: number;
  prNumber?: number;
}

export interface PullRequest {
  id: string;
  number: number;
  repo: string;
  service: ServiceId;
  title: string;
  body: string;
  authorId: string;
  branch: string;
  base: string;
  state: PrState;
  createdAt: number;
  updatedAt: number;
  /** When the first commit landed on the branch (lead-time clock start). */
  firstCommitAt: number;
  reviewers: Review[];
  labels: string[];
  files: DiffFile[];
  comments: ReviewComment[];
  checks: CheckRun[];
  mentions: string[];
  runId?: string;
  linkedTask?: { id: string; title: string; to: string };
  incident?: string;
  queuePosition?: number;
  mergedAt?: number;
  deployedAt?: number;
  deployId?: string;
  secret?: SecretFinding;
  evidenceLogged?: boolean;
  chatShared?: number;
  /** Seeded Nova insight about this change (English + Arabic). */
  nova?: { en: string; ar: string };
}

/* ───────────────────────── pipelines ───────────────────────── */

export type RunStatus = 'success' | 'failed' | 'running' | 'queued' | 'canceled';
export type JobStatus = RunStatus | 'skipped';
export type PipelineStage = 'build' | 'test' | 'scan' | 'package' | 'deploy';
export type LogLevel = 'cmd' | 'info' | 'warn' | 'error' | 'ok' | 'dim';

export interface LogLine {
  /** Seconds since the job started. */
  t: number;
  level: LogLevel;
  text: string;
}

export interface PipelineJob {
  id: string;
  name: string;
  stage: PipelineStage;
  status: JobStatus;
  /** Seconds after the run started. */
  startSec: number;
  durationSec: number;
  needs: string[];
  cacheHit?: boolean;
  log: LogLine[];
}

export interface PipelineRun {
  id: string;
  number: number;
  service: ServiceId;
  branch: string;
  sha: string;
  message: string;
  authorId: string;
  trigger: 'push' | 'pull_request' | 'merge_queue' | 'schedule' | 'manual';
  prId?: string;
  status: RunStatus;
  /** Final outcome for live runs (applied when the clock passes the end). */
  outcome?: RunStatus;
  startedAt: number;
  durationSec: number;
  jobs: PipelineJob[];
  costUsd: number;
  cacheHitPct: number;
  retryOf?: string;
}

export interface FlakyTest {
  id: string;
  name: string;
  service: ServiceId;
  file: string;
  ownerId: string;
  /** Last runs, oldest first: P pass · F hard fail · R failed then passed on retry. */
  history: string;
  lastFlakeAt: number;
  quarantined: boolean;
}

/* ───────────────────────── deploys ───────────────────────── */

export type DeployStatus = 'success' | 'failed' | 'in_progress' | 'rolled_back';
export type GateMetric = 'latency' | 'errors' | 'saturation';
export type GateStatus = 'pass' | 'warn' | 'fail';

export interface GateResult {
  metric: GateMetric;
  value: number;
  baseline: number;
  warnAt: number;
  failAt: number;
  status: GateStatus;
}

export interface CanaryState {
  /** Index into CANARY_STEPS. */
  step: number;
  paused: boolean;
  /** Auto-paused by a health gate (vs. paused by a person). */
  autoPaused?: boolean;
  startedAt: number;
  stepAt: number;
  history: { step: number; at: number; by: string; note?: string }[];
}

export interface Deploy {
  id: string;
  service: ServiceId;
  version: string;
  sha: string;
  env: EnvId;
  region: RegionId;
  status: DeployStatus;
  authorId: string;
  at: number;
  finishedAt?: number;
  prId?: string;
  prNumber?: number;
  canary?: CanaryState;
  /** This record restores `rollbackOf` (a rollback deploy). */
  rollbackOf?: string;
  fromVersion?: string;
  /** Set on a deploy that was later rolled back. */
  rolledBackBy?: string;
  /** Time service health was restored after a failed change (MTTR). */
  restoredAt?: number;
  note?: string;
}

export interface FreezeState {
  frozen: boolean;
  reason: string;
  source?: BridgeSource;
  setBy: string;
  at: number;
}

export interface ChangeWindow {
  id: string;
  title: string;
  kind: 'freeze' | 'release' | 'maintenance';
  start: number;
  end: number;
  services: ServiceId[];
  note: string;
  calendarEventId?: string;
}

export interface FeatureFlag {
  key: string;
  description: string;
  service: ServiceId;
  ownerId: string;
  enabled: Record<EnvId, boolean>;
  rollout: Record<EnvId, number>;
  updatedAt: number;
  updatedBy: string;
}

/** Cloud-style health reading (bridge or seeded fallback). */
export interface HealthReading {
  service: ServiceId;
  region: RegionId;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  errorRate: number;
  saturation: number;
}

/* ───────────────────────── code index ───────────────────────── */

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'type' | 'const' | 'class' | 'module';
  line: number;
}

export interface CodeFile {
  repo: string;
  service: ServiceId;
  path: string;
  lang: FileLang;
  lines: string[];
  symbols: CodeSymbol[];
}

/* ───────────────────────── insights ───────────────────────── */

/** A merged PR from the last weeks (lead time, cycle time, review load). */
export interface MergedPrStat {
  id: string;
  number: number;
  service: ServiceId;
  title: string;
  authorId: string;
  reviewerIds: string[];
  firstCommitAt: number;
  openedAt: number;
  firstReviewAt: number;
  approvedAt: number;
  mergedAt: number;
  deployedAt: number;
  size: number;
}

export interface DevExItem {
  id: string;
  question: string;
  score: number;
  trend: number;
}

/* ───────────────────────── golden path ───────────────────────── */

export type WizardTemplate = 'ts-api' | 'go-service' | 'py-worker' | 'web-app';

export interface WizardRun {
  id: string;
  name: string;
  template: WizardTemplate;
  team: string;
  tier: 1 | 2 | 3;
  ownerId: string;
  /** Completed steps (0..6). */
  step: number;
  startedAt: number;
  done: boolean;
  vaultRequest?: string;
}

/* ───────────────────────── activity ───────────────────────── */

export interface ActivityEntry {
  id: string;
  at: number;
  actorId: string;
  kind: 'deploy' | 'rollback' | 'freeze' | 'merge' | 'review' | 'pipeline' | 'flag' | 'catalog' | 'secret';
  text: string;
  to?: string;
}

/* ───────────────────────── store data ───────────────────────── */

export interface DevHubData {
  version: number;
  seededAt: number;
  services: Service[];
  owners: CodeOwner[];
  prs: PullRequest[];
  runs: PipelineRun[];
  flaky: FlakyTest[];
  deploys: Deploy[];
  freeze: FreezeState;
  windows: ChangeWindow[];
  flags: FeatureFlag[];
  health: HealthReading[];
  /** Canary metric series (oldest first) keyed by deploy id. */
  canarySeries: Record<string, { latency: number[]; errors: number[] }>;
  files: CodeFile[];
  merged: MergedPrStat[];
  devex: DevExItem[];
  /** Viewer DevEx answers keyed by user id. */
  devexVotes: Record<string, Record<string, number>>;
  wizard: WizardRun | null;
  activity: ActivityEntry[];
  nextPr: number;
  nextRun: number;
}
