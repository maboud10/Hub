/**
 * Stratos · Cloud Console — pure domain engine.
 *
 * Computes live telemetry, SLO error-budget burn rates, multi-region health,
 * policy guardrails for provisioning, observability logs/traces, FinOps
 * budgets/forecasts/anomalies/rightsizing, GreenOps carbon intensity, and
 * explainable Nova copilot answers.
 */
import type { BridgeCloudSpend, BridgeServiceHealth } from '@/lib/appBridge';
import {
  ALERT_RULES,
  ANOMALIES,
  BATCH_JOBS,
  HEADCOUNT,
  QUOTAS,
  REGIONS,
  REGION_BY_ID,
  REQUIRED_TAGS,
  SERVICES,
  SERVICE_BY_ID,
  SHARED_COST,
  STATIC_RECS,
  STORY_SEED,
  TEAMS,
  TEAM_BY_ID,
  TEMPLATE_BY_ID,
  buildResources,
} from './seed';
import type {
  AnomalyDef,
  BatchJob,
  CloudData,
  CostCategory,
  HealthStatus,
  LiveAlert,
  LogLevel,
  LogLine,
  MetricId,
  PolicyCheck,
  ProvisionRequest,
  ProvisionSpec,
  ProvisionTemplate,
  Quota,
  Recommendation,
  Region,
  RegionId,
  Resource,
  ServiceDef,
  ServiceId,
  Story,
  Team,
  TeamId,
  Trace,
} from './types';

export { canUseCloud, computeCloudCapabilities, viewerCapabilities } from './access';

const MIN = 60_000;
const DAY = 86_400_000;

/* ───────────────────────── storyline & telemetry ───────────────────────── */

export function isStoryDegraded(story: Story, now = Date.now()): boolean {
  return story.recoveredAt === null || story.recoveredAt > now;
}

export interface ServiceTelemetry {
  service: ServiceDef;
  status: HealthStatus;
  p95: number;
  errorRate: number;
  rps: number;
  cpuUtil: number;
  series: Record<MetricId, number[]>;
}

function wave(seed: number, idx: number, amp: number): number {
  return Math.sin((seed * 7 + idx * 1.3) * 0.6) * amp + Math.cos((seed * 3 + idx * 0.7) * 0.5) * (amp * 0.45);
}

export function serviceTelemetry(serviceId: ServiceId, story: Story, region?: RegionId, now = Date.now()): ServiceTelemetry {
  const svc = SERVICE_BY_ID[serviceId];
  const degraded =
    serviceId === STORY_SEED.service &&
    isStoryDegraded(story, now) &&
    (!region || region === STORY_SEED.region);

  const regShare = region ? (svc.regionMix[region] ?? 0.2) : 1;
  const p95 = degraded ? STORY_SEED.degradedP95 : Math.round(svc.baseP95 * (region === 'ap-southeast-1' ? 1.06 : 1));
  const errorRate = degraded ? STORY_SEED.degradedErrorRate : svc.baseErrorRate;
  const rps = Math.max(10, Math.round(svc.baseRps * regShare));
  const cpuUtil = degraded ? 0.78 : svc.cpuUtil;
  const status: HealthStatus = degraded ? 'degraded' : 'healthy';

  const seed = SERVICE_BY_ID[serviceId].baseP95;
  const pts = 20;
  const p95Series: number[] = [];
  const errSeries: number[] = [];
  const rpsSeries: number[] = [];
  const cpuSeries: number[] = [];

  for (let i = 0; i < pts; i++) {
    const spike = degraded && i >= pts - 7 ? (i - (pts - 8)) / 7 : 0;
    const baseL = svc.baseP95 + wave(seed, i, svc.baseP95 * 0.08);
    p95Series.push(Math.round(baseL + spike * (STORY_SEED.degradedP95 - svc.baseP95)));
    const baseE = svc.baseErrorRate * 100 + Math.max(0, wave(seed + 2, i, svc.baseErrorRate * 35));
    errSeries.push(Number((baseE + spike * (STORY_SEED.degradedErrorRate * 100 - baseE)).toFixed(3)));
    rpsSeries.push(Math.max(5, Math.round(rps * (1 + wave(seed + 5, i, 0.09) + spike * 0.22))));
    cpuSeries.push(Math.round(Math.min(0.98, Math.max(0.08, svc.cpuUtil + wave(seed + 9, i, 0.05) + spike * 0.36)) * 100));
  }

  return {
    service: svc,
    status,
    p95,
    errorRate,
    rps,
    cpuUtil,
    series: { p95: p95Series, errors: errSeries, rps: rpsSeries, cpu: cpuSeries },
  };
}

export function allServicesTelemetry(story: Story, region?: RegionId, now = Date.now()): ServiceTelemetry[] {
  return SERVICES.map((s) => serviceTelemetry(s.id, story, region, now));
}

export function buildBridgeServiceHealth(story: Story, now = Date.now()): BridgeServiceHealth[] {
  return SERVICES.map((s) => {
    const t = serviceTelemetry(s.id, story, undefined, now);
    return {
      service: s.id,
      status: t.status,
      region: s.primaryRegion,
      latencyMs: t.p95,
      errorRate: t.errorRate,
      to: `/cloud/services?service=${s.id}`,
    };
  });
}

/* ───────────────────────── SLO & error budget burn ───────────────────────── */

export interface SloSummary {
  serviceId: ServiceId;
  target: number;
  latencyObjectiveMs: number;
  windowDays: number;
  attained: number;
  burnRate1h: number;
  burnRate6h: number;
  consumedFraction: number;
  remainingFraction: number;
  budgetMinutesTotal: number;
  budgetMinutesRemaining: number;
  fastBurn: boolean;
  burnCurve: number[];
}

export function serviceSloSummary(serviceId: ServiceId, story: Story, now = Date.now()): SloSummary {
  const svc = SERVICE_BY_ID[serviceId];
  const tel = serviceTelemetry(serviceId, story, undefined, now);
  const allowedError = Math.max(0.0001, 1 - svc.slo.target);
  const burnRate1h = Number((tel.errorRate / allowedError).toFixed(2));
  const burnRate6h = Number(((tel.errorRate * 0.65 + svc.baseErrorRate * 0.35) / allowedError).toFixed(2));

  const pastConsumed = svc.budgetHits.reduce((acc, h) => acc + h.consumed, 0);
  const liveConsumed = tel.status === 'degraded' ? 0.36 : 0.04;
  const consumedFraction = Math.min(0.98, Math.max(0.02, Number((pastConsumed + liveConsumed).toFixed(2))));
  const remainingFraction = Number((1 - consumedFraction).toFixed(2));
  const budgetMinutesTotal = Math.round(svc.slo.windowDays * 1440 * allowedError * 10) / 10;
  const budgetMinutesRemaining = Math.max(0, Math.round(budgetMinutesTotal * remainingFraction * 10) / 10);
  const attained = Number((1 - allowedError * consumedFraction).toFixed(5));

  const burnCurve: number[] = [];
  let rem = 100;
  for (let day = svc.slo.windowDays; day >= 0; day--) {
    for (const hit of svc.budgetHits) {
      if (hit.daysAgo === day) rem -= hit.consumed * 100;
    }
    if (day === 0 && tel.status === 'degraded') rem -= 36;
    else rem -= 0.12;
    burnCurve.push(Math.max(2, Math.round(rem)));
  }

  return {
    serviceId,
    target: svc.slo.target,
    latencyObjectiveMs: svc.slo.latencyMs,
    windowDays: svc.slo.windowDays,
    attained,
    burnRate1h,
    burnRate6h,
    consumedFraction,
    remainingFraction,
    budgetMinutesTotal,
    budgetMinutesRemaining,
    fastBurn: burnRate1h >= 14.4,
    burnCurve,
  };
}

export function allSloSummaries(story: Story, now = Date.now()): SloSummary[] {
  return SERVICES.map((s) => serviceSloSummary(s.id, story, now));
}

/* ───────────────────────── resources, regions & drift ───────────────────────── */

export function effectiveResources(data: CloudData, now = Date.now()): Resource[] {
  const base = buildResources(now).map((r) => {
    const patch = data.patches[r.id];
    return patch ? { ...r, ...patch, tags: { ...r.tags, ...(patch.tags ?? {}) } } : r;
  });

  const provisioned: Resource[] = data.requests
    .filter((req) => !req.cancelled && isRequestDelivered(req, now))
    .map((req) => ({
      id: `prov-${req.id}`,
      name: req.spec.name,
      kind: TEMPLATE_BY_ID[req.spec.template].kind,
      region: req.spec.region,
      service: req.spec.service,
      team: req.spec.team,
      size: req.spec.size,
      monthlyUsd: req.monthlyUsd,
      cpu: 0.34,
      mem: 0.42,
      tags: req.spec.tags,
      encrypted: req.spec.encrypted,
      publicAccess: req.spec.publicAccess,
      dataClass: req.spec.dataClass,
      managedBy: 'terraform',
      status: 'running',
      createdAt: req.createdAt,
      detail: `Provisioned via Stratos · ${TEMPLATE_BY_ID[req.spec.template].label}`,
    }));

  return [...provisioned, ...base];
}

export function missingTags(resource: Resource): string[] {
  return REQUIRED_TAGS.filter((k) => !resource.tags[k] || !resource.tags[k].trim());
}

export function resourcesWithDrift(resources: Resource[]): Resource[] {
  return resources.filter((r) => (r.drift?.length ?? 0) > 0);
}

export function rightsizeStepDown(resource: Resource): { nextSize: string; nextMonthlyUsd: number; savingsUsd: number } | null {
  if (!resource.sizeLadder || resource.status !== 'running') return null;
  const idx = resource.sizeLadder.indexOf(resource.size);
  if (idx <= 0) return null;
  if ((resource.cpu ?? 1) >= 0.35) return null;
  const nextSize = resource.sizeLadder[idx - 1];
  const savingsUsd = Math.round(resource.monthlyUsd * 0.42);
  const nextMonthlyUsd = Math.max(40, resource.monthlyUsd - savingsUsd);
  return { nextSize, nextMonthlyUsd, savingsUsd };
}

export interface RegionSummary {
  region: Region;
  status: HealthStatus;
  services: ServiceDef[];
  p95: number;
  rps: number;
  errorRate: number;
  resourceCount: number;
  monthlyUsd: number;
  driftCount: number;
  quotas: Quota[];
}

export function regionSummary(regionId: RegionId, resources: Resource[], story: Story, now = Date.now()): RegionSummary {
  const region = REGION_BY_ID[regionId];
  const services = SERVICES.filter((s) => s.regions.includes(regionId));
  const tels = services.map((s) => serviceTelemetry(s.id, story, regionId, now));
  const degraded = tels.some((t) => t.status === 'degraded');
  const regResources = resources.filter((r) => r.region === regionId);
  const rps = tels.reduce((a, t) => a + t.rps, 0);
  const p95 = Math.round(tels.reduce((a, t) => Math.max(a, t.p95), 0));
  const errorRate = Number((tels.reduce((a, t) => a + t.errorRate, 0) / Math.max(1, tels.length)).toFixed(4));
  const monthlyUsd = regResources.reduce((a, r) => a + (r.status === 'idle' ? r.monthlyUsd : r.monthlyUsd), 0);
  const driftCount = regResources.reduce((a, r) => a + (r.drift?.length ?? 0), 0);
  const quotas = QUOTAS.filter((q) => q.region === regionId);

  return {
    region,
    status: degraded ? 'degraded' : 'healthy',
    services,
    p95,
    rps,
    errorRate,
    resourceCount: regResources.length,
    monthlyUsd,
    driftCount,
    quotas,
  };
}

export function allRegionSummaries(resources: Resource[], story: Story, now = Date.now()): RegionSummary[] {
  return REGIONS.map((r) => regionSummary(r.id, resources, story, now));
}

/* ───────────────────────── provisioning & policy guardrails ───────────────────────── */

export const PROVISION_STEPS = [
  { id: 'draft', label: 'Draft & sizing', sub: 'Template, region & capacity' },
  { id: 'policy', label: 'Policy & security check', sub: 'Tags, KMS, residency & public block' },
  { id: 'budget', label: 'FinOps budget check', sub: 'Showback & team budget gate' },
  { id: 'terraform', label: 'Terraform plan & apply', sub: 'Declarative IaC & Vault lease' },
  { id: 'live', label: 'Live & monitored', sub: 'SLOs, alerts & cost telemetry wired' },
] as const;

export function buildDefaultProvisionSpec(template: ProvisionTemplate = 'postgres', team: TeamId = 'payments'): ProvisionSpec {
  const tpl = TEMPLATE_BY_ID[template];
  const teamDef = TEAM_BY_ID[team];
  return {
    template,
    name: `${team}-${template === 'gpu-notebook' ? 'notebook' : template}-01`,
    team,
    service: team === 'payments' ? 'payments-svc' : team === 'collab' ? 'mail-api' : 'hub-web',
    region: team === 'payments' ? 'eu-west-2' : 'me-central-1',
    size: tpl.defaultSize,
    env: 'production',
    dataClass: team === 'payments' ? 'confidential' : 'uae-personal',
    encrypted: true,
    publicAccess: false,
    tags: {
      team,
      env: 'production',
      'cost-center': teamDef.costCenter,
      owner: 'priya.raman',
    },
    hoursPerDay: template === 'gpu-notebook' ? 8 : undefined,
  };
}

export function estimateProvisionMonthlyUsd(spec: ProvisionSpec): number {
  const tpl = TEMPLATE_BY_ID[spec.template];
  const sizeObj = tpl.sizes.find((s) => s.id === spec.size) ?? tpl.sizes[0];
  const reg = REGION_BY_ID[spec.region];
  const hours = spec.template === 'gpu-notebook' ? Math.max(1, Math.min(24, spec.hoursPerDay ?? 8)) * 22 : 730;
  const multiAz = spec.template === 'postgres' && spec.env === 'production' ? 1.8 : 1;
  return Math.max(12, Math.round(sizeObj.hourlyUsd * hours * reg.priceFactor * multiAz));
}

export function evaluateProvisionPolicies(spec: ProvisionSpec): PolicyCheck[] {
  const missing = REQUIRED_TAGS.filter((k) => !spec.tags[k] || !spec.tags[k].trim());
  const tagsCheck: PolicyCheck =
    missing.length === 0
      ? { id: 'tags', outcome: 'pass', detail: 'All required showback tags present' }
      : { id: 'tags', outcome: 'fail', detail: 'Missing required showback tags', values: [...missing] };

  const encCheck: PolicyCheck = spec.encrypted
    ? { id: 'encryption', outcome: 'pass', detail: 'KMS customer-managed key encryption enabled' }
    : spec.env === 'production' || spec.dataClass !== 'public'
      ? { id: 'encryption', outcome: 'fail', detail: 'Encryption at rest is required for production and non-public data' }
      : { id: 'encryption', outcome: 'warn', detail: 'Unencrypted resource in non-production environment' };

  let resCheck: PolicyCheck = { id: 'residency', outcome: 'pass', detail: 'Region satisfies data residency policy' };
  if (spec.dataClass === 'uae-personal' && spec.region !== 'me-central-1') {
    resCheck = { id: 'residency', outcome: 'fail', detail: 'UAE personal data must stay in me-central-1' };
  } else if (spec.dataClass === 'eu-personal' && spec.region !== 'eu-west-2') {
    resCheck = { id: 'residency', outcome: 'fail', detail: 'EU/UK personal data stays in eu-west-2' };
  }

  const pubCheck: PolicyCheck = !spec.publicAccess
    ? { id: 'public', outcome: 'pass', detail: 'Private network endpoint only' }
    : spec.dataClass !== 'public'
      ? { id: 'public', outcome: 'fail', detail: 'Public access is blocked for non-public data classes' }
      : { id: 'public', outcome: 'warn', detail: 'Public endpoint enabled for public data class' };

  const monthlyUsd = estimateProvisionMonthlyUsd(spec);
  const budgetCheck: PolicyCheck =
    monthlyUsd > 1200 || (spec.env === 'production' && monthlyUsd > 750)
      ? { id: 'budget', outcome: 'warn', detail: 'Requires FinOps & team lead approval above $750/mo' }
      : { id: 'budget', outcome: 'pass', detail: 'Within team auto-approved monthly budget' };

  return [tagsCheck, encCheck, resCheck, pubCheck, budgetCheck];
}

export function isRequestDelivered(req: ProvisionRequest, now = Date.now()): boolean {
  if (req.cancelled) return false;
  if (req.delivered) return true;
  const totalMs = req.stageMs.reduce((a, b) => a + b, 0);
  return now - req.createdAt >= totalMs;
}

export function provisionJourneyStage(
  req: ProvisionRequest,
  now = Date.now(),
): { current: number; state: 'active' | 'blocked' | 'paused' | 'done'; progress: number; message: string } {
  if (req.cancelled) {
    return { current: 1, state: 'blocked', progress: 0.2, message: 'Provisioning request cancelled' };
  }
  const hasFail = req.checks.some((c) => c.outcome === 'fail');
  if (hasFail) {
    return { current: 1, state: 'blocked', progress: 0.35, message: 'Policy guardrail blocked provisioning' };
  }
  if (req.delivered) {
    return { current: 5, state: 'done', progress: 1, message: 'Resource is live, monitored & credentials stored in Vault' };
  }
  const elapsed = Math.max(0, now - req.createdAt);
  const [s0, s1, s2, s3] = req.stageMs;
  if (elapsed < s0) {
    return { current: 0, state: 'active', progress: Math.min(0.9, elapsed / Math.max(1, s0)), message: 'Validating sizing & regional capacity' };
  }
  if (elapsed < s0 + s1) {
    return { current: 1, state: 'active', progress: Math.min(0.9, (elapsed - s0) / Math.max(1, s1)), message: 'Running OPA policy & KMS encryption guardrails' };
  }
  if (elapsed < s0 + s1 + s2) {
    return { current: 2, state: 'active', progress: Math.min(0.9, (elapsed - s0 - s1) / Math.max(1, s2)), message: 'Verifying FinOps budget & cost-center allocation' };
  }
  if (elapsed < s0 + s1 + s2 + s3) {
    return { current: 3, state: 'active', progress: Math.min(0.9, (elapsed - s0 - s1 - s2) / Math.max(1, s3)), message: 'Applying Terraform plan & issuing Vault lease' };
  }
  return { current: 5, state: 'done', progress: 1, message: 'Resource is live, monitored & credentials stored in Vault' };
}

/* ───────────────────────── observability: alerts, logs, traces ───────────────────────── */

export function computeLiveAlerts(data: CloudData, story: Story, now = Date.now()): LiveAlert[] {
  const degraded = isStoryDegraded(story, now);
  const egressOpen = data.anomalies['an-egress']?.status !== 'resolved' && data.anomalies['an-egress']?.status !== 'dismissed';
  const out: LiveAlert[] = [];

  for (const rule of ALERT_RULES) {
    const enabled = data.rules[rule.id] ?? true;
    if (!enabled) continue;
    if (rule.storyFiring === 'incident' && degraded) {
      out.push({
        id: `alert-${rule.id}`,
        rule,
        since: story.deployAt + 4 * MIN,
        value: rule.kind === 'latency' ? '820ms p95' : rule.kind === 'burn' ? '23.0× burn' : '2.3% 5xx',
        region: 'eu-west-2',
      });
    } else if (rule.storyFiring === 'egress' && egressOpen) {
      out.push({
        id: `alert-${rule.id}`,
        rule,
        since: now - 7 * DAY,
        value: '$785/day (+340%)',
        region: 'eu-west-2',
      });
    } else if (rule.storyFiring === 'quota') {
      out.push({
        id: `alert-${rule.id}`,
        rule,
        since: now - 180 * MIN,
        value: '86% (880 / 1024 vCPU)',
        region: 'ap-southeast-1',
      });
    }
  }
  return out;
}

export function buildLogs(
  story: Story,
  now = Date.now(),
  filter?: { service?: ServiceId | 'all'; region?: RegionId | 'all'; level?: LogLevel | 'all'; query?: string },
): LogLine[] {
  const degraded = isStoryDegraded(story, now);
  const raw: LogLine[] = [
    ...(degraded
      ? [
          {
            id: 'log-1',
            at: now - 2 * MIN,
            level: 'error' as LogLevel,
            service: 'payments-svc' as ServiceId,
            region: 'eu-west-2' as RegionId,
            msg: 'postgres query timeout after 740ms on SELECT * FROM ledger_entries WHERE account_id = $1 (missing index idx_ledger_account_created)',
            traceId: 'tr-pay-820',
            attrs: { version: story.version, pool_wait_ms: 412, rows_scanned: 148200 },
          },
          {
            id: 'log-2',
            at: now - 5 * MIN,
            level: 'warn' as LogLevel,
            service: 'payments-svc' as ServiceId,
            region: 'eu-west-2' as RegionId,
            msg: 'HPA scaled payments-svc replicas 12 -> 19 due to connection pool saturation in eu-west-2',
            traceId: 'tr-pay-820',
            attrs: { cpu_pct: 78, active_conns: 618, max_conns: 640 },
          },
        ]
      : [
          {
            id: 'log-1-ok',
            at: now - 2 * MIN,
            level: 'info' as LogLevel,
            service: 'payments-svc' as ServiceId,
            region: 'eu-west-2' as RegionId,
            msg: 'rollback completed; ledger_entries query p95 restored to 235ms in eu-west-2',
            traceId: 'tr-pay-820',
            attrs: { version: 'v2.40.9', pool_wait_ms: 4 },
          },
        ]),
    {
      id: 'log-3',
      at: now - 9 * MIN,
      level: 'warn',
      service: 'data-pipeline',
      region: 'eu-west-2',
      msg: 'warehouse-sync exported 1.9 TB across eu-west-2 -> us-east-1 via NAT gateway instead of PrivateLink',
      attrs: { job: 'warehouse-sync', egress_gb: 1920, nat_gateway: 'nat-0a9f21' },
    },
    {
      id: 'log-4',
      at: now - 14 * MIN,
      level: 'info',
      service: 'hub-web',
      region: 'me-central-1',
      msg: 'edge cache hit ratio 94.2% across 2,410 req/s in me-central-1',
      traceId: 'tr-hub-180',
      attrs: { status: 200, p95_ms: 178 },
    },
    {
      id: 'log-5',
      at: now - 19 * MIN,
      level: 'info',
      service: 'identity-svc',
      region: 'me-central-1',
      msg: 'passkey WebAuthn assertion verified and OIDC token issued in 46ms',
      attrs: { tenant: 'helix-prod', mfa: 'passkey' },
    },
    {
      id: 'log-6',
      at: now - 25 * MIN,
      level: 'warn',
      service: 'search-svc',
      region: 'ap-southeast-1',
      msg: 'OpenSearch hybrid vector query p95 390ms during background embedding refresh',
      traceId: 'tr-search-390',
      attrs: { shard_queue: 14, heap_pct: 79 },
    },
    {
      id: 'log-7',
      at: now - 33 * MIN,
      level: 'info',
      service: 'mail-api',
      region: 'me-central-1',
      msg: 'Nova screener classified 412 inbound threads with 0 false-positive holds',
      traceId: 'tr-mail-140',
      attrs: { queue_depth: 120, latency_ms: 138 },
    },
  ];

  return raw.filter((l) => {
    if (filter?.service && filter.service !== 'all' && l.service !== filter.service) return false;
    if (filter?.region && filter.region !== 'all' && l.region !== filter.region) return false;
    if (filter?.level && filter.level !== 'all' && l.level !== filter.level) return false;
    if (filter?.query) {
      const q = filter.query.toLowerCase();
      const hay = `${l.service} ${l.region} ${l.level} ${l.msg} ${l.traceId ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildTraces(story: Story, now = Date.now(), service?: ServiceId | 'all'): Trace[] {
  const degraded = isStoryDegraded(story, now);
  const list: Trace[] = [
    {
      id: 'tr-pay-820',
      root: 'POST /v2/charges',
      service: 'payments-svc',
      region: 'eu-west-2',
      at: now - 3 * MIN,
      durMs: degraded ? 820 : 238,
      status: degraded ? 'error' : 'ok',
      spans: [
        { id: 'sp-1', service: 'hub-web', op: 'POST /api/payments/charge', start: 0, dur: degraded ? 820 : 238, status: degraded ? 'error' : 'ok' },
        { id: 'sp-2', parentId: 'sp-1', service: 'identity-svc', op: 'grpc.VerifySession', start: 6, dur: 18, status: 'ok' },
        { id: 'sp-3', parentId: 'sp-1', service: 'payments-svc', op: 'ChargeController::authorize', start: 28, dur: degraded ? 784 : 204, status: degraded ? 'error' : 'ok', note: degraded ? `Regression in ${story.version}` : 'Healthy' },
        { id: 'sp-4', parentId: 'sp-3', service: 'payments-pg', op: 'SELECT ledger_entries (seq scan)', start: 44, dur: degraded ? 742 : 148, status: degraded ? 'slow' : 'ok', note: degraded ? 'Missing idx_ledger_account_created' : 'Index scan' },
        { id: 'sp-5', parentId: 'sp-3', service: 'payments-events', op: 'kafka.produce charge.events', start: degraded ? 790 : 200, dur: 22, status: 'ok' },
      ],
    },
    {
      id: 'tr-hub-180',
      root: 'GET /api/workspace/bootstrap',
      service: 'hub-web',
      region: 'me-central-1',
      at: now - 8 * MIN,
      durMs: 180,
      status: 'ok',
      spans: [
        { id: 'sp-h1', service: 'hub-web', op: 'GET /api/workspace/bootstrap', start: 0, dur: 180, status: 'ok' },
        { id: 'sp-h2', parentId: 'sp-h1', service: 'identity-svc', op: 'VerifyPasskeySession', start: 8, dur: 32, status: 'ok' },
        { id: 'sp-h3', parentId: 'sp-h1', service: 'mail-api', op: 'ListPrioritySummary', start: 44, dur: 88, status: 'ok' },
        { id: 'sp-h4', parentId: 'sp-h1', service: 'chat-realtime', op: 'PresenceSnapshot', start: 52, dur: 64, status: 'ok' },
      ],
    },
    {
      id: 'tr-search-390',
      root: 'POST /v2/query/hybrid',
      service: 'search-svc',
      region: 'ap-southeast-1',
      at: now - 16 * MIN,
      durMs: 390,
      status: 'slow',
      spans: [
        { id: 'sp-s1', service: 'search-svc', op: 'HybridRank::query', start: 0, dur: 390, status: 'slow' },
        { id: 'sp-s2', parentId: 'sp-s1', service: 'search-cluster', op: 'knn_vector + bm25 shard fanout', start: 18, dur: 342, status: 'slow', note: 'Shard 4 GC pause 110ms' },
      ],
    },
  ];
  if (service && service !== 'all') {
    return list.filter((t) => t.service === service || t.spans.some((s) => s.service === service));
  }
  return list;
}

/* ───────────────────────── FinOps & Carbon ───────────────────────── */

export function computeRecommendations(resources: Resource[], data: CloudData): Recommendation[] {
  const dynamicRecs: Recommendation[] = [];
  for (const r of resources) {
    const step = rightsizeStepDown(r);
    if (!step) continue;
    const id = `rec-rs-${r.id}`;
    if (data.recs[id]?.status === 'dismissed') continue;
    dynamicRecs.push({
      id,
      kind: 'rightsize',
      resourceId: r.id,
      title: `Rightsize ${r.name} (${r.size} → ${step.nextSize})`,
      detail: `p95 CPU ${Math.round((r.cpu ?? 0.2) * 100)}% over 14d in ${r.region}`,
      savingsUsd: step.savingsUsd,
      carbonKg: Math.max(12, Math.round(step.savingsUsd * 0.045)),
      effort: 'low',
      team: r.team,
    });
  }
  const statics = STATIC_RECS.filter((r) => data.recs[r.id]?.status !== 'dismissed');
  return [...statics, ...dynamicRecs];
}

export interface TeamSpendRow {
  team: Team;
  mtdUsd: number;
  forecastUsd: number;
  budgetUsd: number;
  utilization: number;
}

export interface FinOpsSummary {
  mtdUsd: number;
  forecastUsd: number;
  budgetUsd: number;
  openAnomaliesCount: number;
  anomalies: AnomalyDef[];
  recommendations: Recommendation[];
  potentialSavingsUsd: number;
  realisedSavingsUsd: number;
  unitCostPerEmployee: number;
  byTeam: TeamSpendRow[];
  byCategory: { category: CostCategory; monthlyUsd: number; share: number }[];
  byService: { service: ServiceDef; dailyUsd: number; monthlyUsd: number }[];
  dailyTrend: { day: number; actual?: number; forecast: number; budget: number }[];
}

export function computeFinOpsSummary(data: CloudData, story: Story, now = Date.now()): FinOpsSummary {
  const resources = effectiveResources(data, now);
  const recs = computeRecommendations(resources, data);
  const budgetUsd = TEAMS.reduce((a, t) => a + t.budgetUsd, 0);

  const openAnomalies = ANOMALIES.filter((a) => {
    const st = data.anomalies[a.id]?.status;
    if (st === 'resolved' || st === 'dismissed') return false;
    if (a.id === 'an-payments' && !isStoryDegraded(story, now)) return false;
    return true;
  });

  const appliedRecSavings = recs
    .filter((r) => data.recs[r.id]?.status === 'applied')
    .reduce((a, r) => a + r.savingsUsd, 0);
  const resolvedAnomalySavings = ANOMALIES.filter(
    (a) => data.anomalies[a.id]?.status === 'resolved' || (a.id === 'an-payments' && !isStoryDegraded(story, now)),
  ).reduce((a, x) => a + x.savingsUsd, 0);

  const realisedSavingsUsd = appliedRecSavings + resolvedAnomalySavings;
  const potentialSavingsUsd =
    openAnomalies.reduce((a, x) => a + x.savingsUsd, 0) +
    recs.filter((r) => data.recs[r.id]?.status !== 'applied').reduce((a, r) => a + r.savingsUsd, 0);

  const byService = SERVICES.map((s) => {
    const extraDaily = openAnomalies
      .filter((a) => a.service === s.id)
      .reduce((acc, a) => acc + Math.round(a.savingsUsd / 30), 0);
    const dailyUsd = s.dailyCostUsd + extraDaily;
    return { service: s, dailyUsd, monthlyUsd: dailyUsd * 30 };
  });

  const baseMonthly = (SERVICES.reduce((a, s) => a + s.dailyCostUsd, 0) + SHARED_COST.dailyCostUsd) * 30;
  const anomalyUplift = openAnomalies.reduce((a, x) => a + x.savingsUsd, 0);
  const forecastUsd = Math.max(140_000, Math.round(baseMonthly + anomalyUplift - appliedRecSavings));
  const mtdUsd = Math.round(forecastUsd * (11 / 30));

  const byTeam: TeamSpendRow[] = TEAMS.map((t) => {
    const svcMonthly = byService.filter((x) => x.service.team === t.id).reduce((a, x) => a + x.monthlyUsd, 0);
    const shared = t.id === 'platform' ? SHARED_COST.dailyCostUsd * 30 : 0;
    const teamForecast = Math.max(4000, Math.round(svcMonthly + shared));
    const teamMtd = Math.round(teamForecast * (11 / 30));
    return {
      team: t,
      mtdUsd: teamMtd,
      forecastUsd: teamForecast,
      budgetUsd: t.budgetUsd,
      utilization: Number((teamForecast / t.budgetUsd).toFixed(2)),
    };
  });

  const catTotals: Record<CostCategory, number> = {
    compute: 0,
    database: 0,
    storage: 0,
    network: 0,
    observability: 0,
    ai: 0,
  };
  for (const row of byService) {
    for (const [cat, weight] of Object.entries(row.service.costMix)) {
      catTotals[cat as CostCategory] += Math.round(row.monthlyUsd * (weight ?? 0));
    }
  }
  const totalCat = Math.max(1, Object.values(catTotals).reduce((a, b) => a + b, 0));
  const byCategory = (Object.keys(catTotals) as CostCategory[]).map((category) => ({
    category,
    monthlyUsd: catTotals[category],
    share: Number((catTotals[category] / totalCat).toFixed(2)),
  }));

  const dailyBudget = Math.round(budgetUsd / 30);
  const dailyTrend = Array.from({ length: 30 }, (_, idx) => {
    const day = idx + 1;
    const isAnomalyWindow = day >= 5 && openAnomalies.length > 0;
    const dailyRun = Math.round((forecastUsd / 30) * (isAnomalyWindow ? 1.04 : 0.94) + Math.sin(day) * 180);
    return {
      day,
      actual: day <= 11 ? dailyRun : undefined,
      forecast: dailyRun,
      budget: dailyBudget,
    };
  });

  return {
    mtdUsd,
    forecastUsd,
    budgetUsd,
    openAnomaliesCount: openAnomalies.length,
    anomalies: ANOMALIES,
    recommendations: recs,
    potentialSavingsUsd,
    realisedSavingsUsd,
    unitCostPerEmployee: Number((forecastUsd / HEADCOUNT).toFixed(2)),
    byTeam,
    byCategory,
    byService,
    dailyTrend,
  };
}

export function buildBridgeSpend(data: CloudData, story: Story, now = Date.now()): BridgeCloudSpend {
  const s = computeFinOpsSummary(data, story, now);
  return {
    mtdUsd: s.mtdUsd,
    forecastUsd: s.forecastUsd,
    budgetUsd: s.budgetUsd,
    anomalies: s.openAnomaliesCount,
  };
}

export interface BatchJobCarbon {
  job: BatchJob;
  currentHourUtc: number;
  recommendedHourUtc: number;
  recommendedRegion: RegionId;
  monthlyKg: number;
  savingsKg: number;
  shifted: boolean;
}

export interface CarbonSummary {
  totalMonthlyKg: number;
  totalMonthlyKwh: number;
  avgGridIntensity: number;
  potentialSavingsKg: number;
  byRegion: { region: Region; monthlyKg: number; cfe: number; gridIntensity: number }[];
  byService: { service: ServiceDef; monthlyKg: number; kwh: number }[];
  batchJobs: BatchJobCarbon[];
}

export function optimalBatchWindow(job: BatchJob, data: CloudData): BatchJobCarbon {
  const override = data.schedules[job.id];
  const recommendedHourUtc = job.region === 'me-central-1' ? 9 : 3;
  const recommendedRegion: RegionId = job.pinned ? job.region : 'eu-west-2';
  const currentHourUtc = override ? override.startHourUtc : job.startHourUtc;
  const shifted = currentHourUtc === recommendedHourUtc;

  const reg = REGION_BY_ID[job.region];
  const targetReg = REGION_BY_ID[recommendedRegion];
  const peakFactor = currentHourUtc === recommendedHourUtc ? 0.72 : 1.12;
  const monthlyKwh = job.kwhPerRun * job.runsPerMonth * reg.pue;
  const monthlyKg = Math.round((monthlyKwh * reg.gridIntensity * peakFactor) / 1000);
  const optimalKg = Math.round((job.kwhPerRun * job.runsPerMonth * targetReg.pue * targetReg.gridIntensity * 0.72) / 1000);
  const savingsKg = Math.max(0, monthlyKg - optimalKg);

  return {
    job,
    currentHourUtc,
    recommendedHourUtc,
    recommendedRegion,
    monthlyKg,
    savingsKg,
    shifted,
  };
}

export function computeCarbonSummary(data: CloudData): CarbonSummary {
  const byService = SERVICES.map((s) => {
    const kwh = Math.round(s.vcpus * (0.12 + s.cpuUtil * 0.28) * 730 * 0.045);
    let weightedIntensity = 0;
    for (const [rId, mix] of Object.entries(s.regionMix)) {
      const reg = REGION_BY_ID[rId as RegionId];
      if (reg) weightedIntensity += reg.gridIntensity * reg.pue * (mix ?? 0);
    }
    const monthlyKg = Math.round((kwh * weightedIntensity) / 1000);
    return { service: s, monthlyKg, kwh };
  });

  const byRegion = REGIONS.map((r) => {
    const regKg = SERVICES.reduce((acc, s) => {
      const share = s.regionMix[r.id] ?? 0;
      const svcRow = byService.find((x) => x.service.id === s.id);
      return acc + (svcRow ? svcRow.monthlyKg * share : 0);
    }, 0);
    return {
      region: r,
      monthlyKg: Math.round(regKg),
      cfe: r.cfe,
      gridIntensity: r.gridIntensity,
    };
  });

  const batchJobs = BATCH_JOBS.map((j) => optimalBatchWindow(j, data));
  const totalMonthlyKg = byService.reduce((a, b) => a + b.monthlyKg, 0) + batchJobs.reduce((a, b) => a + b.monthlyKg, 0);
  const totalMonthlyKwh = byService.reduce((a, b) => a + b.kwh, 0);
  const avgGridIntensity = Math.round(REGIONS.reduce((a, r) => a + r.gridIntensity, 0) / REGIONS.length);
  const potentialSavingsKg = batchJobs.reduce((a, b) => a + b.savingsKg, 0);

  return {
    totalMonthlyKg,
    totalMonthlyKwh,
    avgGridIntensity,
    potentialSavingsKg,
    byRegion,
    byService,
    batchJobs,
  };
}

/* ───────────────────────── Nova AI Copilot ───────────────────────── */

export const NOVA_SUGGESTIONS = [
  'Why is payments-svc latency spiking in eu-west-2?',
  'Explain the $18.2k FinOps egress anomaly on data-pipeline',
  'Which resources can we rightsize today without SLO risk?',
  'How can we cut carbon emissions on nightly batch jobs?',
];

export interface NovaAnswer {
  headline: string;
  summary: string;
  bullets: string[];
  confidence: string;
  links: { label: string; to: string }[];
}

export function askCloudNova(query: string, data: CloudData, story: Story, now = Date.now()): NovaAnswer {
  const q = query.toLowerCase();
  const finops = computeFinOpsSummary(data, story, now);
  const carbon = computeCarbonSummary(data);
  const degraded = isStoryDegraded(story, now);

  if (q.includes('payment') || q.includes('latency') || q.includes('p95') || q.includes('burn') || q.includes('slo') || q.includes('incident')) {
    return {
      headline: degraded
        ? `Root-cause correlation: payments-svc ${story.version} in eu-west-2`
        : `Resolved: payments-svc latency restored to baseline (240ms)`,
      summary: degraded
        ? `p95 jumped from 240ms to 820ms (23.0× SLO burn rate) 4 minutes after ${story.version} deployed to eu-west-2. Distributed trace tr-pay-820 isolates 90% of span duration to a sequential scan on ledger_entries in payments-pg.`
        : `After rolling back ${story.version}, payments-svc p95 returned to 240ms and error rate dropped to 0.03%.`,
      bullets: [
        'Deploy correlation: v2.41.0 shipped by Priya Raman 40m ago in DevHub',
        'Database bottleneck: SELECT ledger_entries missing composite index idx_ledger_account_created (742ms span)',
        'Cost amplification: HPA scaled payments-svc 12 → 19 pods (+38% compute) due to client retries',
      ],
      confidence: '96% confidence · correlated across Traces, Logs & DevHub Deploys',
      links: [
        { label: 'Inspect payments-svc SLO', to: '/cloud/services?service=payments-svc' },
        { label: 'Open trace tr-pay-820', to: '/cloud/observability?trace=tr-pay-820' },
        { label: 'Open DevHub deploys', to: '/devhub/deploys' },
        { label: 'Open Incident Command', to: '/incidents' },
      ],
    };
  }

  if (q.includes('egress') || q.includes('finops') || q.includes('budget') || q.includes('spend') || q.includes('cost') || q.includes('anomaly')) {
    return {
      headline: `FinOps Forecast: $${finops.forecastUsd.toLocaleString()} vs $${finops.budgetUsd.toLocaleString()} budget`,
      summary: `We have ${finops.openAnomaliesCount} active cost anomalies and $${finops.potentialSavingsUsd.toLocaleString()}/mo in actionable savings. The largest driver is data-pipeline cross-region egress (+340% this week, $18,200/mo impact).`,
      bullets: [
        'data-pipeline copies full partitions eu-west-2 → us-east-1 through NAT gateway ($785/day vs $179/day baseline)',
        'Switch warehouse-sync to incremental CDC over Snowflake PrivateLink to save $18,200/mo',
        `Applying ${finops.recommendations.length} rightsizing & commitment recommendations brings forecast below the $${finops.budgetUsd.toLocaleString()} monthly budget`,
      ],
      confidence: '94% confidence · verified via flow logs & billing CUR',
      links: [
        { label: 'Open FinOps & Carbon', to: '/cloud/finops' },
        { label: 'View Procurement commits', to: '/procurement' },
      ],
    };
  }

  if (q.includes('carbon') || q.includes('green') || q.includes('batch') || q.includes('co2')) {
    return {
      headline: `GreenOps: ${(carbon.totalMonthlyKg / 1000).toFixed(1)} tCO₂e/mo across 4 regions`,
      summary: `Shifting nightly batch jobs to low-carbon solar/wind windows saves ${carbon.potentialSavingsKg} kg CO₂e/month with zero SLO impact.`,
      bullets: [
        'eu-west-2 (London) runs at 62% carbon-free energy (190 gCO₂e/kWh), lowest in the fleet',
        'me-central-1 (UAE) solar window peaks 08:00–13:00 UTC — shift uae-ledger-etl to 09:00 UTC',
        'Stopping idle GPU notebook nb-embeddings-lab in ap-southeast-1 saves $880/mo and 96 kg CO₂e/mo',
      ],
      confidence: '92% confidence · regional grid telemetry',
      links: [
        { label: 'Open GreenOps scheduler', to: '/cloud/finops#carbon' },
        { label: 'Inspect regional clusters', to: '/cloud/clusters' },
      ],
    };
  }

  return {
    headline: `Fleet Posture & Rightsizing: $${finops.potentialSavingsUsd.toLocaleString()}/mo available`,
    summary: `Across 4 regions (UAE, London, Singapore, Virginia), ${SERVICES.length} services are monitored. ${finops.recommendations.length} low-risk optimisations and 3 Terraform drift items are ready for one-click remediation.`,
    bullets: [
      'Downsize under-utilised nodepool np-use1-general (27% CPU) and replica mail-pg-analytics (17% CPU)',
      'Stop idle JupyterLab GPU notebook nb-embeddings-lab in ap-southeast-1 (2% GPU for 3 days)',
      'Reconcile S3 public-access block drift on helix-pipeline-exports and forward signal to Security Center',
    ],
    confidence: '95% confidence · 14-day p95 utilisation telemetry',
    links: [
      { label: 'Open Clusters & Regions', to: '/cloud/clusters' },
      { label: 'Provision a resource', to: '/cloud/provisioning' },
      { label: 'Open FinOps & Carbon', to: '/cloud/finops' },
    ],
  };
}
