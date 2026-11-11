/**
 * DevHub — pure, unit-tested logic: explainable PR risk, code-ownership
 * reviewer suggestions, review SLAs, pipeline aggregation + live runs, flaky
 * detection, canary health gates, freeze/promote/rollback rules, DORA four
 * keys, cycle-time + review-load analytics, code search and syntax tinting.
 * No React, no stores, no side effects.
 */
import type { BridgeIncident } from '@/lib/appBridge';
import type {
  CheckRun,
  CheckStatus,
  CodeFile,
  CodeOwner,
  CodeSymbol,
  Deploy,
  DiffFile,
  FileLang,
  FlakyTest,
  FreezeState,
  GateResult,
  GateStatus,
  HealthReading,
  JobStatus,
  MergedPrStat,
  PipelineJob,
  PipelineRun,
  PipelineStage,
  PullRequest,
  Review,
  RegionId,
  RunStatus,
  Scorecard,
  Service,
  ServiceId,
} from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/* ───────────────────────── reference data ───────────────────────── */

export const SERVICE_IDS: ServiceId[] = ['hub-web', 'mail-api', 'chat-realtime', 'payments-svc', 'identity-svc', 'search-svc', 'notifications-svc', 'data-pipeline'];
export const REGIONS: RegionId[] = ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'];
export const REGION_META: Record<RegionId, { label: string; city: string; flag: string }> = {
  'me-central-1': { label: 'UAE', city: 'Dubai', flag: '🇦🇪' },
  'eu-west-2': { label: 'London', city: 'London', flag: '🇬🇧' },
  'ap-southeast-1': { label: 'Singapore', city: 'Singapore', flag: '🇸🇬' },
  'us-east-1': { label: 'Virginia', city: 'Virginia', flag: '🇺🇸' },
};

/** Progressive delivery traffic steps (%). */
export const CANARY_STEPS = [1, 5, 25, 50, 100] as const;

/** The signature delivery stream: Code → … → Production. */
export const STREAM_LANES = ['code', 'review', 'build', 'test', 'scan', 'staging', 'canary', 'production'] as const;
export type StreamLane = (typeof STREAM_LANES)[number];

/** Merge-queue tracker steps for a pull request. */
export const PR_TRACK = ['Opened', 'Review', 'Checks', 'Approved', 'Merge queue', 'Merged', 'Deployed'] as const;

/** Golden-path "New service" journey. */
export const WIZARD_STEPS = ['Template', 'Repo', 'CI', 'Cloud project', 'Vault secrets', 'Catalog'] as const;

/** Files with high churn or incident history: changes here carry extra risk. */
export const HOT_PATHS = [
  'payments-svc/internal/charge/',
  'payments-svc/config/regions/',
  'identity-svc/src/session/',
  'hub-web/src/widgets/',
  'data-pipeline/jobs/ledger',
  'chat-realtime/lib/presence/',
];

export const repoName = (repo: string) => repo.split('/').pop() ?? repo;
export const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ───────────────────────── diffs ───────────────────────── */

export function fileStats(f: DiffFile): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const h of f.hunks)
    for (const l of h.lines) {
      if (l.kind === 'add') additions += 1;
      else if (l.kind === 'del') deletions += 1;
    }
  return { additions, deletions };
}

export function diffStats(files: DiffFile[]): { additions: number; deletions: number; files: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    const s = fileStats(f);
    additions += s.additions;
    deletions += s.deletions;
  }
  return { additions, deletions, files: files.length };
}

export const isTestPath = (p: string) => /(^|\/)(tests?|__tests__|spec)\//i.test(p) || /(_test\.(go|py|exs?)|\.(test|spec)\.(t|j)sx?|Test\.kt|_spec\.rb)$/i.test(p) || /(^|\/)test_[\w-]+\.py$/i.test(p);
export const isMigrationPath = (p: string) => /(^|\/)migrations?\//i.test(p) || /\.sql$/i.test(p);
export const isSecurityPath = (p: string) => /(^|\/)(auth|session|crypto|keys?|iam|secrets?|tokens?|scim)(\/|\.|_)/i.test(p);
export const isConfigPath = (p: string) => /(^|\/)(config|deploy|infra|helm)\//i.test(p) || /\.(ya?ml|env|toml)$/i.test(p);
const isDocPath = (p: string) => /\.(md|mdx|txt)$/i.test(p);
const isSourcePath = (p: string) => !isTestPath(p) && !isMigrationPath(p) && !isConfigPath(p) && !isDocPath(p) && !/\.css$/i.test(p);

/* ───────────────────────── explainable risk ───────────────────────── */

export type RiskKey = 'size' | 'hot' | 'tests' | 'migration' | 'security' | 'config' | 'tier' | 'secret';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  key: RiskKey;
  points: number;
  /** Changed lines (size), or how thin the tests are (tests: 'none' | 'thin'). */
  value?: number | string;
  files?: string[];
}

export interface RiskReport {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

export const riskLevel = (score: number): RiskLevel => (score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low');

/**
 * Explainable 0–100 risk for a change: size, hot files, missing tests,
 * migrations, security-sensitive paths, config changes, blast radius (tier)
 * and push-protection findings. Every point is attributable to a factor.
 */
export function riskScore(pr: Pick<PullRequest, 'repo' | 'files' | 'secret'>, service?: Pick<Service, 'tier'> | null): RiskReport {
  const factors: RiskFactor[] = [];
  const repo = repoName(pr.repo);
  const { additions, deletions } = diffStats(pr.files);
  const lines = additions + deletions;
  const sizePts = lines <= 20 ? 2 : lines <= 80 ? 6 : lines <= 200 ? 12 : lines <= 400 ? 18 : lines <= 800 ? 24 : 30;
  factors.push({ key: 'size', points: sizePts, value: lines, files: pr.files.map((f) => f.path) });

  const hot = pr.files.filter((f) => HOT_PATHS.some((h) => `${repo}/${f.path}`.startsWith(h))).map((f) => f.path);
  if (hot.length) factors.push({ key: 'hot', points: Math.min(16, hot.length * 8), files: hot });

  const src = pr.files.filter((f) => isSourcePath(f.path));
  const tests = pr.files.filter((f) => isTestPath(f.path));
  if (src.length) {
    const srcLines = src.reduce((s, f) => s + fileStats(f).additions, 0);
    const testLines = tests.reduce((s, f) => s + fileStats(f).additions, 0);
    if (!tests.length) factors.push({ key: 'tests', points: 14, value: 'none', files: src.map((f) => f.path) });
    else if (srcLines > testLines * 3) factors.push({ key: 'tests', points: 6, value: 'thin', files: tests.map((f) => f.path) });
  }

  const migrations = pr.files.filter((f) => isMigrationPath(f.path)).map((f) => f.path);
  if (migrations.length) factors.push({ key: 'migration', points: 14, files: migrations });

  const security = pr.files.filter((f) => isSecurityPath(f.path)).map((f) => f.path);
  if (security.length) factors.push({ key: 'security', points: Math.min(20, security.length * 10), files: security });

  const config = pr.files.filter((f) => isConfigPath(f.path) && !isMigrationPath(f.path)).map((f) => f.path);
  if (config.length) factors.push({ key: 'config', points: 6, files: config });

  if (service?.tier === 1) factors.push({ key: 'tier', points: 8, value: 1 });
  if (pr.secret && pr.secret.status !== 'rotated') factors.push({ key: 'secret', points: 30, files: [pr.secret.file] });

  const score = clamp(factors.reduce((s, f) => s + f.points, 0), 0, 100);
  return { score, level: riskLevel(score), factors: factors.sort((a, b) => b.points - a.points) };
}

/* ───────────────────────── code ownership ───────────────────────── */

export interface ReviewerSuggestion {
  userId: string;
  /** Share of the touched lines this person owns, 0..1 */
  share: number;
  /** Open review requests already waiting on them. */
  load: number;
  score: number;
}

/** Ownership of the touched lines (longest CODEOWNERS prefix wins per file). */
export function ownershipFor(pr: Pick<PullRequest, 'repo' | 'files'>, owners: CodeOwner[]): Map<string, number> {
  const repo = repoName(pr.repo);
  const out = new Map<string, number>();
  let total = 0;
  for (const f of pr.files) {
    const key = `${repo}/${f.path}`;
    const match = owners.filter((o) => key.startsWith(o.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    const { additions, deletions } = fileStats(f);
    const lines = Math.max(1, additions + deletions);
    if (!match) continue;
    total += lines;
    for (const o of match.owners) out.set(o.userId, (out.get(o.userId) ?? 0) + lines * o.share);
  }
  if (total > 0) for (const [k, v] of out) out.set(k, v / total);
  return out;
}

/** Suggested reviewers from code ownership, gently penalised by their current review load. */
export function suggestReviewers(pr: Pick<PullRequest, 'repo' | 'files' | 'authorId'>, owners: CodeOwner[], load: Record<string, number>, limit = 3): ReviewerSuggestion[] {
  const share = ownershipFor(pr, owners);
  return [...share.entries()]
    .filter(([id]) => id !== pr.authorId)
    .map(([userId, s]) => {
      const l = load[userId] ?? 0;
      return { userId, share: s, load: l, score: Math.max(0, s - 0.06 * l) };
    })
    .sort((a, b) => b.score - a.score || b.share - a.share)
    .slice(0, limit);
}

/* ───────────────────────── reviews ───────────────────────── */

export function checksSummary(checks: Pick<CheckRun, 'status' | 'required'>[]): CheckStatus {
  const relevant = checks.filter((c) => c.status !== 'skipped');
  if (!relevant.length) return 'skipped';
  if (relevant.some((c) => c.status === 'failure' && c.required)) return 'failure';
  if (relevant.some((c) => c.status === 'running')) return 'running';
  if (relevant.some((c) => c.status === 'queued')) return 'queued';
  if (relevant.some((c) => c.status === 'failure')) return 'failure';
  return 'success';
}

export const isAwaiting = (pr: Pick<PullRequest, 'state' | 'authorId' | 'reviewers'>, userId: string) =>
  pr.authorId !== userId && !['draft', 'merged', 'closed'].includes(pr.state) && pr.reviewers.some((r) => r.reviewerId === userId && r.state === 'pending');

/** Pull requests waiting on `userId`, longest-waiting first. */
export function reviewQueue<T extends Pick<PullRequest, 'state' | 'authorId' | 'reviewers'>>(prs: T[], userId: string): T[] {
  const reqAt = (p: T) => p.reviewers.find((r) => r.reviewerId === userId)?.requestedAt ?? 0;
  return prs.filter((p) => isAwaiting(p, userId)).sort((a, b) => reqAt(a) - reqAt(b));
}

export interface SlaState {
  slaMins: number;
  waitedMins: number;
  remainingMins: number;
  state: 'ok' | 'warn' | 'breached';
}

/** Review SLA: 30 min for hotfixes, 4 h on tier-1 services, 8 h otherwise. */
export function reviewSla(pr: Pick<PullRequest, 'labels'>, review: Pick<Review, 'requestedAt'>, tier: number, now: number): SlaState {
  const slaMins = pr.labels.includes('hotfix') ? 30 : tier === 1 ? 240 : 480;
  const waitedMins = Math.max(0, Math.round((now - review.requestedAt) / MIN));
  const remainingMins = slaMins - waitedMins;
  const state = remainingMins < 0 ? 'breached' : remainingMins < slaMins * 0.25 ? 'warn' : 'ok';
  return { slaMins, waitedMins, remainingMins, state };
}

export interface PrBuckets<T> {
  draft: T[];
  review: T[];
  changes: T[];
  approved: T[];
  queued: T[];
}

export function myPrBuckets<T extends Pick<PullRequest, 'state' | 'authorId'>>(prs: T[], userId: string): PrBuckets<T> {
  const mine = prs.filter((p) => p.authorId === userId);
  return {
    draft: mine.filter((p) => p.state === 'draft'),
    review: mine.filter((p) => p.state === 'open'),
    changes: mine.filter((p) => p.state === 'changes_requested'),
    approved: mine.filter((p) => p.state === 'approved'),
    queued: mine.filter((p) => p.state === 'queued'),
  };
}

export interface PrStage {
  current: number;
  state: 'active' | 'blocked' | 'paused' | 'done';
}

/** Where a PR sits on Opened → Review → Checks → Approved → Merge queue → Merged → Deployed. */
export function prStage(pr: Pick<PullRequest, 'state' | 'reviewers' | 'checks' | 'deployedAt' | 'secret'>, deploy?: Pick<Deploy, 'status'> | null): PrStage {
  const checks = checksSummary(pr.checks);
  if (pr.state === 'draft') return { current: 0, state: 'paused' };
  if (pr.state === 'closed') return { current: 1, state: 'paused' };
  if (pr.state === 'merged') {
    if (deploy?.status === 'in_progress') return { current: 6, state: 'active' };
    if (pr.deployedAt) return { current: 7, state: 'done' };
    return { current: 5, state: 'active' };
  }
  if (pr.state === 'queued') return { current: 4, state: 'active' };
  if (pr.state === 'approved') return checks === 'failure' ? { current: 2, state: 'blocked' } : checks === 'success' ? { current: 3, state: 'active' } : { current: 2, state: 'active' };
  if (pr.state === 'changes_requested') return { current: 1, state: 'blocked' };
  const approved = pr.reviewers.some((r) => r.state === 'approved');
  if (approved) return { current: 2, state: checks === 'failure' || pr.secret?.status === 'blocking' ? 'blocked' : 'active' };
  return { current: 1, state: pr.secret?.status === 'blocking' ? 'blocked' : 'active' };
}

/* ───────────────────────── pipelines ───────────────────────── */

/** Run status from its jobs: any failure wins, then cancel, then work in flight, else success. */
export function aggregateJobs(jobs: Pick<PipelineJob, 'status'>[]): RunStatus {
  if (!jobs.length) return 'queued';
  if (jobs.some((j) => j.status === 'failed')) return 'failed';
  if (jobs.some((j) => j.status === 'canceled')) return 'canceled';
  if (jobs.some((j) => j.status === 'running')) return 'running';
  if (jobs.some((j) => j.status === 'queued')) return jobs.some((j) => j.status === 'success') ? 'running' : 'queued';
  return 'success';
}

export interface LiveRun {
  run: PipelineRun;
  elapsedSec: number;
  /** 0..1 */
  progress: number;
  /** Job currently executing (first running), for the stream lane. */
  activeStage: PipelineStage | null;
}

/** Project a running run onto the clock: jobs queue → run → finish with their planned outcome. */
export function liveRun(run: PipelineRun, now: number): LiveRun {
  if (run.status !== 'running') return { run, elapsedSec: run.durationSec, progress: 1, activeStage: null };
  const elapsedSec = Math.max(0, (now - run.startedAt) / 1000);
  const jobs = run.jobs.map((j) => {
    let status: JobStatus = j.status;
    if (elapsedSec < j.startSec) status = 'queued';
    else if (elapsedSec < j.startSec + j.durationSec) status = 'running';
    return { ...j, status };
  });
  const done = elapsedSec >= run.durationSec;
  const status = done ? (run.outcome ?? aggregateJobs(run.jobs)) : aggregateJobs(jobs);
  const active = jobs.find((j) => j.status === 'running');
  return { run: { ...run, jobs, status }, elapsedSec: Math.min(elapsedSec, run.durationSec), progress: clamp(elapsedSec / Math.max(1, run.durationSec), 0, 1), activeStage: active?.stage ?? null };
}

export interface FlakyReport {
  test: FlakyTest;
  rate: number;
  flakes: number;
  hardFails: number;
  runs: number;
  flaky: boolean;
  broken: boolean;
}

/** Flake = failed then passed on retry (R). Hard failures (F) on half the runs mean "broken", not flaky. */
export function flakeReport(test: FlakyTest, threshold = 0.03): FlakyReport {
  const runs = test.history.length;
  const flakes = [...test.history].filter((c) => c === 'R').length;
  const hardFails = [...test.history].filter((c) => c === 'F').length;
  const rate = runs ? flakes / runs : 0;
  const broken = runs > 0 && hardFails / runs >= 0.5;
  return { test, rate, flakes, hardFails, runs, broken, flaky: !broken && flakes >= 2 && rate >= threshold };
}

export function detectFlaky(tests: FlakyTest[], threshold = 0.03): FlakyReport[] {
  return tests
    .map((t) => flakeReport(t, threshold))
    .filter((r) => r.flaky)
    .sort((a, b) => b.rate - a.rate);
}

export interface PipelineKpis {
  successRate: number;
  medianMins: number;
  cacheHitPct: number;
  costPerRun: number;
  running: number;
  failed: number;
}

export function pipelineKpis(runs: PipelineRun[]): PipelineKpis {
  const finished = runs.filter((r) => r.status === 'success' || r.status === 'failed');
  const ok = finished.filter((r) => r.status === 'success').length;
  return {
    successRate: finished.length ? ok / finished.length : 1,
    medianMins: round1(median(finished.map((r) => r.durationSec / 60))),
    cacheHitPct: runs.length ? Math.round(runs.reduce((s, r) => s + r.cacheHitPct, 0) / runs.length) : 0,
    costPerRun: runs.length ? Math.round((runs.reduce((s, r) => s + r.costUsd, 0) / runs.length) * 100) / 100 : 0,
    running: runs.filter((r) => r.status === 'running' || r.status === 'queued').length,
    failed: runs.filter((r) => r.status === 'failed').length,
  };
}

/* ───────────────────────── canary health gates ───────────────────────── */

export const BASELINE_ERRORS = 0.003;
export const BASELINE_SATURATION = 0.55;

/**
 * Latency warns on a 1.5× regression vs. baseline and fails above the p95 SLO;
 * errors warn above 1 % and fail above 5 %; saturation warns at 75 %, fails at 90 %.
 */
export function evaluateGates(reading: Pick<HealthReading, 'latencyMs' | 'errorRate' | 'saturation'>, service: Pick<Service, 'baselineP95' | 'latencySloMs'>): GateResult[] {
  const grade = (v: number, warnAt: number, failAt: number): GateStatus => (v > failAt ? 'fail' : v > warnAt ? 'warn' : 'pass');
  const latWarn = Math.round(service.baselineP95 * 1.5);
  return [
    { metric: 'latency', value: reading.latencyMs, baseline: service.baselineP95, warnAt: latWarn, failAt: service.latencySloMs, status: grade(reading.latencyMs, latWarn, service.latencySloMs) },
    { metric: 'errors', value: reading.errorRate, baseline: BASELINE_ERRORS, warnAt: 0.01, failAt: 0.05, status: grade(reading.errorRate, 0.01, 0.05) },
    { metric: 'saturation', value: reading.saturation, baseline: BASELINE_SATURATION, warnAt: 0.75, failAt: 0.9, status: grade(reading.saturation, 0.75, 0.9) },
  ];
}

export const gateVerdict = (gates: Pick<GateResult, 'status'>[]): GateStatus => (gates.some((g) => g.status === 'fail') ? 'fail' : gates.some((g) => g.status === 'warn') ? 'warn' : 'pass');
export const canaryDecision = (gates: Pick<GateResult, 'status'>[]): 'promote' | 'hold' | 'rollback' => {
  const v = gateVerdict(gates);
  return v === 'fail' ? 'rollback' : v === 'warn' ? 'hold' : 'promote';
};

/* ───────────────────────── freeze · promote · rollback ───────────────────────── */

export interface EffectiveFreeze {
  frozen: boolean;
  /** Blocking freeze (explicit, or implied by an open SEV1). */
  blocking: boolean;
  /** SEV2 without an explicit freeze → advise, don't block. */
  advisory: boolean;
  reason: string;
  incident?: Pick<BridgeIncident, 'code' | 'title' | 'severity' | 'to' | 'commanderId' | 'startedAt' | 'services'>;
  manual: FreezeState | null;
}

/** Explicit freezes always block production; an open SEV1 implies one; an open SEV2 advises one. */
export function effectiveFreeze(freeze: FreezeState, incidents: Pick<BridgeIncident, 'code' | 'title' | 'severity' | 'status' | 'to' | 'commanderId' | 'startedAt' | 'services'>[]): EffectiveFreeze {
  const open = incidents.filter((i) => i.status !== 'resolved');
  const sev1 = open.find((i) => i.severity === 'SEV1');
  const sev2 = open.find((i) => i.severity === 'SEV2');
  const incident = sev1 ?? sev2;
  if (freeze.frozen) return { frozen: true, blocking: true, advisory: false, reason: freeze.reason, incident, manual: freeze };
  if (sev1) return { frozen: true, blocking: true, advisory: false, reason: `${sev1.code} · ${sev1.title}`, incident: sev1, manual: null };
  if (sev2) return { frozen: false, blocking: false, advisory: true, reason: `${sev2.code} · ${sev2.title}`, incident: sev2, manual: null };
  return { frozen: false, blocking: false, advisory: false, reason: '', manual: null };
}

export type PromoteBlock = 'not-canary' | 'frozen' | 'gate-fail' | 'gate-warn' | 'complete';

export function canPromote(deploy: Pick<Deploy, 'status' | 'env' | 'canary'>, ctx: { blockingFreeze: boolean; verdict: GateStatus; override?: boolean }): { ok: true } | { ok: false; code: PromoteBlock } {
  if (deploy.status !== 'in_progress' || !deploy.canary) return { ok: false, code: 'not-canary' };
  if (deploy.canary.step >= CANARY_STEPS.length - 1) return { ok: false, code: 'complete' };
  if (deploy.env === 'production' && ctx.blockingFreeze) return { ok: false, code: 'frozen' };
  if (ctx.verdict === 'fail') return { ok: false, code: 'gate-fail' };
  if (ctx.verdict === 'warn' && !ctx.override) return { ok: false, code: 'gate-warn' };
  return { ok: true };
}

/** Next traffic step; reaching 100 % completes the deploy. */
export function promoteDeploy(deploy: Deploy, actorId: string, now: number, note?: string): Deploy {
  if (!deploy.canary) return deploy;
  const step = Math.min(CANARY_STEPS.length - 1, deploy.canary.step + 1);
  const done = step === CANARY_STEPS.length - 1;
  return {
    ...deploy,
    status: done ? 'success' : 'in_progress',
    finishedAt: done ? now : deploy.finishedAt,
    canary: { ...deploy.canary, step, paused: false, autoPaused: false, stepAt: now, history: [...deploy.canary.history, { step, at: now, by: actorId, note }] },
  };
}

/** Version a rollback restores: the last healthy deploy of the same service/env/region before `bad`. */
export function rollbackTarget(deploys: Deploy[], bad: Deploy): Deploy | null {
  return (
    deploys
      .filter((d) => d.id !== bad.id && d.service === bad.service && d.env === bad.env && d.region === bad.region && d.at < bad.at && d.status === 'success' && !d.rolledBackBy)
      .sort((a, b) => b.at - a.at)[0] ?? null
  );
}

export function previousPatch(version: string): string {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return version;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return pat > 0 ? `v${maj}.${min}.${pat - 1}` : `v${maj}.${Math.max(0, min - 1)}.0`;
}

export function bumpVersion(version: string, kind: 'major' | 'minor' | 'patch' = 'patch'): string {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return version;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `v${maj + 1}.0.0`;
  if (kind === 'minor') return `v${maj}.${min + 1}.0`;
  return `v${maj}.${min}.${pat + 1}`;
}

/**
 * Roll back `deployId`: creates a `rolled_back` deploy that restores the last
 * healthy version and marks the bad change failed (it counts toward CFR, and
 * its restore time toward MTTR). Rollbacks are always allowed — even in a freeze.
 */
export function rollbackDeploy(deploys: Deploy[], deployId: string, actorId: string, now: number, rid = `dep-rb-${now.toString(36)}`): { deploys: Deploy[]; rollback: Deploy } | null {
  const bad = deploys.find((d) => d.id === deployId);
  if (!bad || bad.rolledBackBy || bad.status === 'rolled_back') return null;
  const target = rollbackTarget(deploys, bad);
  const rollback: Deploy = {
    id: rid,
    service: bad.service,
    version: target?.version ?? previousPatch(bad.version),
    sha: target?.sha ?? bad.sha,
    env: bad.env,
    region: bad.region,
    status: 'rolled_back',
    authorId: actorId,
    at: now,
    finishedAt: now + 95_000,
    rollbackOf: bad.id,
    fromVersion: bad.version,
    note: `Rollback of ${bad.version}`,
  };
  const updated: Deploy = {
    ...bad,
    status: 'failed',
    rolledBackBy: rollback.id,
    finishedAt: now,
    restoredAt: now + 95_000,
    canary: bad.canary ? { ...bad.canary, paused: true, autoPaused: false } : undefined,
  };
  return { deploys: [rollback, ...deploys.map((d) => (d.id === bad.id ? updated : d))], rollback };
}

/* ───────────────────────── DORA four keys ───────────────────────── */

export type DoraLevel = 'elite' | 'high' | 'medium' | 'low';
export const DORA_SCORE: Record<DoraLevel, number> = { elite: 1, high: 0.75, medium: 0.5, low: 0.25 };

export interface DoraMetrics {
  deployFreq: { perDay: number; perWeek: number; total: number; level: DoraLevel };
  leadTime: { hours: number; samples: number; level: DoraLevel };
  cfr: { rate: number; failed: number; total: number; level: DoraLevel };
  mttr: { minutes: number; samples: number; level: DoraLevel; openMinutes: number | null };
  overall: DoraLevel;
}

export const freqLevel = (perDay: number): DoraLevel => (perDay >= 1 ? 'elite' : perDay * 7 >= 1 ? 'high' : perDay * 30 >= 1 ? 'medium' : 'low');
export const leadLevel = (hours: number): DoraLevel => (hours < 24 ? 'elite' : hours < 168 ? 'high' : hours < 720 ? 'medium' : 'low');
export const cfrLevel = (rate: number): DoraLevel => (rate <= 0.05 ? 'elite' : rate <= 0.1 ? 'high' : rate <= 0.15 ? 'medium' : 'low');
export const mttrLevel = (mins: number): DoraLevel => (mins < 60 ? 'elite' : mins < 1440 ? 'high' : mins < 10080 ? 'medium' : 'low');

/**
 * Deployment frequency (production changes/day), lead time for changes
 * (median first commit → production), change failure rate (failed or
 * rolled-back production changes) and time to restore (median failed change →
 * restored; open incidents are reported live).
 */
export function doraMetrics(input: { deploys: Deploy[]; merged: Pick<MergedPrStat, 'firstCommitAt' | 'deployedAt'>[]; now: number; days?: number; openIncidents?: { startedAt: number }[] }): DoraMetrics {
  const days = input.days ?? 28;
  const start = input.now - days * DAY;
  const prod = input.deploys.filter((d) => d.env === 'production' && d.at >= start && d.at <= input.now && !d.rollbackOf);
  const perDay = prod.length / days;
  const lead = input.merged.filter((m) => m.deployedAt >= start && m.deployedAt <= input.now).map((m) => (m.deployedAt - m.firstCommitAt) / HOUR);
  const failed = prod.filter((d) => d.status === 'failed' || !!d.rolledBackBy);
  const restores = failed.filter((d) => d.restoredAt).map((d) => ((d.restoredAt as number) - d.at) / MIN);
  const open = (input.openIncidents ?? []).filter((i) => i.startedAt <= input.now);
  const openMinutes = open.length ? Math.round(Math.max(...open.map((i) => input.now - i.startedAt)) / MIN) : null;
  const leadHours = round1(median(lead));
  const rate = prod.length ? failed.length / prod.length : 0;
  const mttrMins = Math.round(median(restores));
  const levels: DoraLevel[] = [freqLevel(perDay), leadLevel(leadHours), cfrLevel(rate), mttrLevel(mttrMins)];
  const avg = levels.reduce((s, l) => s + DORA_SCORE[l], 0) / levels.length;
  return {
    deployFreq: { perDay: round1(perDay), perWeek: round1(perDay * 7), total: prod.length, level: levels[0] },
    leadTime: { hours: leadHours, samples: lead.length, level: levels[1] },
    cfr: { rate, failed: failed.length, total: prod.length, level: levels[2] },
    mttr: { minutes: mttrMins, samples: restores.length, level: levels[3], openMinutes },
    overall: avg >= 0.9 ? 'elite' : avg >= 0.7 ? 'high' : avg >= 0.45 ? 'medium' : 'low',
  };
}

/** Daily production deploy counts (oldest first) for sparklines. */
export function deploySeries(deploys: Deploy[], now: number, days = 14): { deploys: number[]; failures: number[] } {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOf(now);
  const out = { deploys: Array<number>(days).fill(0), failures: Array<number>(days).fill(0) };
  for (const d of deploys) {
    if (d.env !== 'production' || d.rollbackOf) continue;
    const idx = days - 1 - Math.round((today - startOf(d.at)) / DAY);
    if (idx < 0 || idx >= days) continue;
    out.deploys[idx] += 1;
    if (d.status === 'failed' || d.rolledBackBy) out.failures[idx] += 1;
  }
  return out;
}

/* ───────────────────────── cycle time & review load ───────────────────────── */

export interface CycleBreakdown {
  coding: number;
  pickup: number;
  review: number;
  deploy: number;
  total: number;
  weeks: { coding: number; pickup: number; review: number; deploy: number }[];
}

/** Median hours per phase: first commit → open → first review → merge → production. */
export function cycleBreakdown(merged: MergedPrStat[], now: number, weeks = 4): CycleBreakdown {
  const phase = (list: MergedPrStat[]) => ({
    coding: round1(median(list.map((m) => (m.openedAt - m.firstCommitAt) / HOUR))),
    pickup: round1(median(list.map((m) => (m.firstReviewAt - m.openedAt) / HOUR))),
    review: round1(median(list.map((m) => (m.mergedAt - m.firstReviewAt) / HOUR))),
    deploy: round1(median(list.map((m) => (m.deployedAt - m.mergedAt) / HOUR))),
  });
  const all = phase(merged);
  const series = Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * 7 * DAY;
    return phase(merged.filter((m) => m.mergedAt > end - 7 * DAY && m.mergedAt <= end));
  });
  return { ...all, total: round1(all.coding + all.pickup + all.review + all.deploy), weeks: series };
}

export interface ReviewLoadRow {
  userId: string;
  days: number[];
  total: number;
  share: number;
  pending: number;
  overloaded: boolean;
}

/** Reviews done per reviewer per day (oldest first) + what's waiting on them now. */
export function reviewLoad(merged: Pick<MergedPrStat, 'reviewerIds' | 'firstReviewAt'>[], prs: Pick<PullRequest, 'state' | 'authorId' | 'reviewers'>[], reviewers: string[], now: number, days = 14): { rows: ReviewLoadRow[]; max: number; fairShare: number } {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOf(now);
  const grid = new Map(reviewers.map((r) => [r, Array<number>(days).fill(0)]));
  const add = (uid: string, at: number) => {
    const row = grid.get(uid);
    if (!row) return;
    const idx = days - 1 - Math.round((today - startOf(at)) / DAY);
    if (idx >= 0 && idx < days) row[idx] += 1;
  };
  for (const m of merged) for (const r of m.reviewerIds) add(r, m.firstReviewAt);
  for (const p of prs) for (const r of p.reviewers) if (r.at && r.state !== 'pending') add(r.reviewerId, r.at);
  const totals = reviewers.map((r) => (grid.get(r) ?? []).reduce((s, n) => s + n, 0));
  const sum = totals.reduce((s, n) => s + n, 0) || 1;
  const fairShare = reviewers.length ? 1 / reviewers.length : 0;
  let max = 0;
  const rows = reviewers.map((userId, i) => {
    const d = grid.get(userId) ?? [];
    max = Math.max(max, ...d);
    const share = totals[i] / sum;
    const pending = reviewQueue(prs, userId).length;
    return { userId, days: d, total: totals[i], share, pending, overloaded: share >= Math.max(0.3, fairShare * 1.6) || pending >= 4 };
  });
  return { rows, max, fairShare };
}

/* ───────────────────────── catalog ───────────────────────── */

export function scorecardGrade(s: Scorecard): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  const vulnPenalty = Math.min(15, s.vulns.critical * 10 + s.vulns.high * 4 + s.vulns.medium);
  const score = Math.round(s.coverage * 30 + (s.docs ? 10 : 0) + (s.runbook ? 15 : 0) + (s.slo ? 15 : 0) + s.depsFreshness * 15 + (15 - vulnPenalty));
  return { score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F' };
}

/** Services that depend on `id` (blast radius). */
export const dependents = (services: Pick<Service, 'id' | 'dependsOn'>[], id: ServiceId) => services.filter((s) => s.dependsOn.includes(id)).map((s) => s.id);

/* ───────────────────────── delivery stream ───────────────────────── */

export interface LaneItem {
  id: string;
  label: string;
  to: string;
  tone: 'app' | 'warning' | 'danger' | 'success';
}

export interface LaneState {
  key: StreamLane;
  count: number;
  items: LaneItem[];
  alert: 'warn' | 'fail' | null;
}

/** Live occupancy of every lane, with alerts where work is stuck. */
export function streamLanes(input: {
  prs: PullRequest[];
  runs: LiveRun[];
  deploys: Deploy[];
  now: number;
  canaryVerdict: (d: Deploy) => GateStatus;
  frozen: boolean;
}): LaneState[] {
  const lanes = new Map<StreamLane, LaneState>(STREAM_LANES.map((k) => [k, { key: k, count: 0, items: [], alert: null }]));
  const push = (k: StreamLane, item: LaneItem, alert: 'warn' | 'fail' | null = null) => {
    const l = lanes.get(k);
    if (!l) return;
    l.count += 1;
    l.items.push(item);
    if (alert === 'fail' || (alert === 'warn' && l.alert !== 'fail')) l.alert = alert;
  };
  for (const p of input.prs) {
    const to = `/devhub/reviews?pr=${p.id}`;
    const label = `#${p.number}`;
    if (p.state === 'draft') push('code', { id: p.id, label, to, tone: p.secret?.status === 'blocking' ? 'danger' : 'app' }, p.secret?.status === 'blocking' ? 'fail' : null);
    else if (p.state === 'open' || p.state === 'changes_requested') push('review', { id: p.id, label, to, tone: p.state === 'changes_requested' ? 'warning' : 'app' }, p.state === 'changes_requested' ? 'warn' : null);
    else if (p.state === 'approved' || p.state === 'queued') push('build', { id: p.id, label, to, tone: 'app' });
  }
  for (const r of input.runs) {
    if (r.run.status !== 'running' && r.run.status !== 'queued') continue;
    const k: StreamLane = r.activeStage === 'test' ? 'test' : r.activeStage === 'scan' ? 'scan' : 'build';
    push(k, { id: r.run.id, label: `#${r.run.number}`, to: `/devhub/pipelines?run=${r.run.id}`, tone: 'app' });
  }
  for (const d of input.deploys) {
    const to = `/devhub/deploys?deploy=${d.id}`;
    if (d.env === 'staging' && d.at >= input.now - 6 * HOUR && d.status !== 'failed') push('staging', { id: d.id, label: d.version, to, tone: 'success' });
    if (d.env !== 'production') continue;
    if (d.status === 'in_progress') {
      const v = input.canaryVerdict(d);
      push('canary', { id: d.id, label: d.version, to, tone: v === 'pass' ? 'app' : v === 'warn' ? 'warning' : 'danger' }, v === 'pass' ? (d.canary?.paused ? 'warn' : null) : v);
    } else if (d.at >= input.now - DAY && (d.status === 'success' || d.status === 'rolled_back')) {
      push('production', { id: d.id, label: d.version, to, tone: d.status === 'rolled_back' ? 'warning' : 'success' });
    }
  }
  if (input.frozen) {
    const p = lanes.get('production');
    if (p && !p.alert) p.alert = 'warn';
  }
  return STREAM_LANES.map((k) => lanes.get(k) as LaneState);
}

/* ───────────────────────── code search ───────────────────────── */

export interface CodeQuery {
  phrase: string;
  lang?: string;
  repo?: string;
  sym?: string;
}

export function parseCodeQuery(q: string): CodeQuery {
  const out: CodeQuery = { phrase: '' };
  const rest: string[] = [];
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    const m = /^(lang|repo|sym):(.+)$/i.exec(tok);
    if (m) out[m[1].toLowerCase() as 'lang' | 'repo' | 'sym'] = m[2].toLowerCase();
    else rest.push(tok);
  }
  out.phrase = rest.join(' ');
  return out;
}

export interface SearchHit {
  file: CodeFile;
  line: number;
  text: string;
  ranges: [number, number][];
  symbol?: CodeSymbol;
  score: number;
}

const LANG_ALIASES: Record<string, FileLang[]> = { go: ['go'], ts: ['ts', 'tsx'], typescript: ['ts', 'tsx'], rust: ['rs'], rs: ['rs'], kotlin: ['kt'], kt: ['kt'], python: ['py'], py: ['py'], sql: ['sql'], elixir: ['ex'], ex: ['ex'], yaml: ['yaml'] };

/** Literal, case-insensitive search across the seeded code index with `lang:`, `repo:` and `sym:` filters. */
export function searchCode(files: CodeFile[], query: string, limit = 40): SearchHit[] {
  const q = parseCodeQuery(query);
  const phrase = q.phrase.toLowerCase();
  if (!phrase && !q.sym) return [];
  const hits: SearchHit[] = [];
  for (const f of files) {
    if (q.lang && !(LANG_ALIASES[q.lang] ?? [q.lang as FileLang]).includes(f.lang)) continue;
    if (q.repo && !`${f.repo} ${f.service}`.toLowerCase().includes(q.repo)) continue;
    if (q.sym) {
      for (const s of f.symbols) {
        if (!s.name.toLowerCase().includes(q.sym)) continue;
        const text = f.lines[s.line - 1] ?? '';
        const at = text.toLowerCase().indexOf(s.name.toLowerCase());
        hits.push({ file: f, line: s.line, text, ranges: at >= 0 ? [[at, at + s.name.length]] : [], symbol: s, score: 20 + (s.name.toLowerCase() === q.sym ? 5 : 0) });
      }
      if (!phrase) continue;
    }
    f.lines.forEach((text, i) => {
      const low = text.toLowerCase();
      if (!phrase || !low.includes(phrase)) return;
      const ranges: [number, number][] = [];
      let from = 0;
      for (;;) {
        const at = low.indexOf(phrase, from);
        if (at < 0) break;
        ranges.push([at, at + phrase.length]);
        from = at + Math.max(1, phrase.length);
      }
      const symbol = f.symbols.find((s) => s.line === i + 1);
      const exact = text.includes(q.phrase) ? 2 : 0;
      hits.push({ file: f, line: i + 1, text, ranges, symbol, score: (symbol ? 10 : 0) + exact + (f.path.toLowerCase().includes(phrase) ? 1 : 0) + ranges.length * 0.1 });
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path) || a.line - b.line).slice(0, limit);
}

/** Split `text` into plain / highlighted segments for `ranges` (sorted, non-overlapping output). */
export function highlightSegments(text: string, ranges: [number, number][]): { text: string; hit: boolean }[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [s0, e0] of sorted) {
    const s = Math.max(s0, pos);
    const e = Math.min(text.length, e0);
    if (e <= s) continue;
    if (s > pos) out.push({ text: text.slice(pos, s), hit: false });
    out.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

/* ───────────────────────── syntax tinting ───────────────────────── */

export type TokKind = 'kw' | 'str' | 'com' | 'num' | 'fn' | 'key' | 'p';

const KEYWORDS: Partial<Record<FileLang, string[]>> = {
  go: ['package', 'import', 'func', 'return', 'type', 'struct', 'var', 'const', 'if', 'else', 'for', 'range', 'go', 'defer', 'nil', 'true', 'false', 'interface', 'map', 'chan', 'switch', 'case', 'err'],
  ts: ['import', 'export', 'from', 'const', 'let', 'function', 'return', 'if', 'else', 'for', 'of', 'await', 'async', 'new', 'type', 'interface', 'extends', 'true', 'false', 'null', 'undefined', 'class', 'default'],
  rs: ['fn', 'let', 'mut', 'pub', 'use', 'mod', 'impl', 'struct', 'enum', 'match', 'if', 'else', 'return', 'async', 'await', 'Ok', 'Err', 'Some', 'None', 'self', 'Self', 'crate'],
  sql: ['CREATE', 'TABLE', 'INDEX', 'ON', 'ALTER', 'ADD', 'COLUMN', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'REFERENCES', 'DEFAULT', 'INSERT', 'INTO', 'SELECT', 'FROM', 'WHERE', 'BEGIN', 'COMMIT', 'IF', 'EXISTS', 'UNIQUE'],
  py: ['def', 'return', 'import', 'from', 'class', 'if', 'else', 'elif', 'for', 'in', 'with', 'as', 'None', 'True', 'False', 'yield', 'async', 'await', 'not', 'and', 'or'],
  kt: ['fun', 'val', 'var', 'class', 'object', 'return', 'if', 'else', 'when', 'import', 'package', 'private', 'override', 'null', 'true', 'false', 'data'],
  ex: ['def', 'defp', 'defmodule', 'do', 'end', 'fn', 'case', 'when', 'with', 'alias', 'import', 'nil', 'true', 'false'],
};
KEYWORDS.tsx = KEYWORDS.ts;

/** Lightweight per-line tokenizer for diff/code tinting (keywords, strings, comments, numbers, calls, keys). */
export function tokenize(line: string, lang: FileLang): { k: TokKind; v: string }[] {
  const out: { k: TokKind; v: string }[] = [];
  const kw = new Set(KEYWORDS[lang] ?? []);
  const hashComment = lang === 'py' || lang === 'yaml' || lang === 'env' || lang === 'ex';
  if (lang === 'yaml' || lang === 'env') {
    const m = lang === 'yaml' ? /^(\s*-?\s*)([\w.-]+)(:)(.*)$/.exec(line) : /^(\s*)([A-Z0-9_]+)(=)(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) {
      if (m[1]) out.push({ k: 'p', v: m[1] });
      out.push({ k: 'key', v: m[2] }, { k: 'p', v: m[3] });
      if (m[4]) out.push(...tokenize(m[4], 'ts').map((t) => (t.k === 'kw' || t.k === 'fn' ? { k: 'p' as TokKind, v: t.v } : t)));
      return out;
    }
  }
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ k: 'p', v: buf });
    buf = '';
  };
  while (i < line.length) {
    const rest = line.slice(i);
    const ch = line[i];
    if ((!hashComment && rest.startsWith('//')) || (hashComment && ch === '#') || (lang === 'sql' && rest.startsWith('--'))) {
      flush();
      out.push({ k: 'com', v: rest });
      break;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      flush();
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      out.push({ k: 'str', v: line.slice(i, Math.min(line.length, j + 1)) });
      i = j + 1;
      continue;
    }
    const num = /^\d[\d_.]*(ms|s|m|h)?\b/.exec(rest);
    if (num && !/[\w$]/.test(line[i - 1] ?? '')) {
      flush();
      out.push({ k: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const w = word[0];
      const isKw = lang === 'sql' ? kw.has(w.toUpperCase()) : kw.has(w);
      if (isKw) {
        flush();
        out.push({ k: 'kw', v: w });
      } else if (line[i + w.length] === '(') {
        flush();
        out.push({ k: 'fn', v: w });
      } else buf += w;
      i += w.length;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/* ───────────────────────── misc ───────────────────────── */

/** `{ h, m, s }` for a duration in seconds (units are rendered by the UI per language). */
export function durParts(sec: number): { h: number; m: number; s: number } {
  const t = Math.max(0, Math.round(sec));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

export const CHECK_TO_RUN: Record<CheckStatus, RunStatus> = { success: 'success', failure: 'failed', running: 'running', queued: 'queued', skipped: 'success' };
