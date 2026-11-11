/**
 * Stratos · Cloud Console — deterministic seed (relative to "now").
 *
 * Shared storyline (kept consistent with DevHub and Incident Command):
 * ~40 minutes ago Priya shipped `payments-svc v2.41.0` to production in
 * eu-west-2 → p95 820ms vs a 240ms baseline and 2.3% errors; Incident
 * Command runs SEV2 INC-2047 "Elevated payment latency in EU". FinOps sees
 * `data-pipeline` egress up +340% this week.
 */
import type {
  AlertRule,
  AnomalyDef,
  BatchJob,
  CloudContract,
  CloudData,
  Commitment,
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
  TopoNode,
} from './types';

export const CLOUD_DATA_VERSION = 1;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ───────────────────────── regions ───────────────────────── */

export const REGIONS: Region[] = [
  {
    id: 'me-central-1',
    code: 'ME1',
    name: 'UAE',
    city: 'Dubai',
    lat: 25.2,
    lon: 55.3,
    utcOffset: 4,
    residency: 'UAE personal data must stay in me-central-1',
    gridIntensity: 410,
    cfe: 0.18,
    pue: 1.3,
    priceFactor: 1.15,
  },
  { id: 'eu-west-2', code: 'EUW2', name: 'London', city: 'London', lat: 51.5, lon: -0.13, utcOffset: 0, residency: 'EU/UK personal data stays in eu-west-2', gridIntensity: 190, cfe: 0.62, pue: 1.15, priceFactor: 1.08 },
  { id: 'ap-southeast-1', code: 'APSE1', name: 'Singapore', city: 'Singapore', lat: 1.35, lon: 103.8, utcOffset: 8, residency: null, gridIntensity: 470, cfe: 0.04, pue: 1.25, priceFactor: 1.12 },
  { id: 'us-east-1', code: 'USE1', name: 'Virginia', city: 'Ashburn', lat: 38.9, lon: -77.4, utcOffset: -5, residency: null, gridIntensity: 360, cfe: 0.38, pue: 1.15, priceFactor: 1 },
];
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;
export const REGION_IDS = REGIONS.map((r) => r.id);

/* ───────────────────────── teams ───────────────────────── */

export const TEAMS: Team[] = [
  { id: 'platform', name: 'Platform', leadId: 'u-omar', budgetUsd: 64_000, costCenter: 'CC-4100', color: '#38bdf8' },
  { id: 'collab', name: 'Collaboration', leadId: 'u-lucas', budgetUsd: 58_000, costCenter: 'CC-4300', color: '#a78bfa' },
  { id: 'payments', name: 'Payments', leadId: 'u-priya', budgetUsd: 32_000, costCenter: 'CC-4200', color: '#f472b6' },
  { id: 'identity', name: 'Identity & Security', leadId: 'u-ethan', budgetUsd: 14_000, costCenter: 'CC-4400', color: '#34d399' },
  { id: 'data', name: 'Data & Search', leadId: 'u-kwame', budgetUsd: 52_000, costCenter: 'CC-4500', color: '#fbbf24' },
];
export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t])) as Record<TeamId, Team>;

/** Company headcount for unit economics. */
export const HEADCOUNT = 1_240;
/** FinOps contact for "Notify Finance". */
export const FINOPS_CONTACT_ID = 'u-grace';

/* ───────────────────────── services ───────────────────────── */

export const SERVICES: ServiceDef[] = [
  {
    id: 'hub-web',
    name: 'Hub Web',
    team: 'platform',
    ownerId: 'u-omar',
    onCallId: 'u-lucas',
    tier: 'critical',
    runtime: 'Next.js 15 · Edge + Node',
    description: 'The NEXUS employee hub front end and BFF.',
    regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'],
    primaryRegion: 'me-central-1',
    slo: { target: 0.999, latencyMs: 400, windowDays: 30 },
    baseP95: 180,
    baseErrorRate: 0.0004,
    baseRps: 2400,
    deps: ['identity-svc', 'mail-api', 'chat-realtime', 'payments-svc', 'search-svc', 'notifications-svc'],
    repo: 'helix/hub-web',
    lastDeploy: { version: 'v5.18.2', authorId: 'u-omar', minsAgo: 26 * 60 },
    dailyCostUsd: 1250,
    costMix: { compute: 0.62, network: 0.22, observability: 0.08, storage: 0.08 },
    regionMix: { 'me-central-1': 0.34, 'eu-west-2': 0.3, 'ap-southeast-1': 0.2, 'us-east-1': 0.16 },
    vcpus: 160,
    cpuUtil: 0.46,
    budgetHits: [{ daysAgo: 18, consumed: 0.12, label: 'CDN cache purge storm' }],
  },
  {
    id: 'mail-api',
    name: 'Mail API',
    team: 'collab',
    ownerId: 'u-omar',
    onCallId: 'u-lucas',
    tier: 'high',
    runtime: 'Go 1.23 · gRPC',
    description: 'Helix Mail delivery, threading and IMAP sync.',
    regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'],
    primaryRegion: 'me-central-1',
    slo: { target: 0.999, latencyMs: 350, windowDays: 30 },
    baseP95: 140,
    baseErrorRate: 0.0003,
    baseRps: 900,
    deps: ['identity-svc', 'search-svc', 'notifications-svc', 'mail-pg'],
    repo: 'helix/mail-api',
    lastDeploy: { version: 'v3.9.0', authorId: 'u-lucas', minsAgo: 3 * 24 * 60 },
    dailyCostUsd: 820,
    costMix: { compute: 0.45, database: 0.25, storage: 0.2, network: 0.1 },
    regionMix: { 'me-central-1': 0.4, 'eu-west-2': 0.25, 'ap-southeast-1': 0.2, 'us-east-1': 0.15 },
    vcpus: 96,
    cpuUtil: 0.41,
    budgetHits: [{ daysAgo: 7, consumed: 0.09, label: 'IMAP sync backlog' }],
  },
  {
    id: 'chat-realtime',
    name: 'Chat Realtime',
    team: 'collab',
    ownerId: 'u-lucas',
    onCallId: 'u-lucas',
    tier: 'critical',
    runtime: 'Elixir · Phoenix Channels',
    description: 'Pulse Chat WebSocket fan-out and presence.',
    regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'],
    primaryRegion: 'eu-west-2',
    slo: { target: 0.9995, latencyMs: 250, windowDays: 30 },
    baseP95: 95,
    baseErrorRate: 0.0002,
    baseRps: 5200,
    deps: ['identity-svc', 'notifications-svc', 'chat-redis'],
    repo: 'helix/chat-realtime',
    lastDeploy: { version: 'v1.62.1', authorId: 'u-lucas', minsAgo: 5 * 24 * 60 },
    dailyCostUsd: 760,
    costMix: { compute: 0.55, database: 0.2, network: 0.2, observability: 0.05 },
    regionMix: { 'me-central-1': 0.3, 'eu-west-2': 0.3, 'ap-southeast-1': 0.25, 'us-east-1': 0.15 },
    vcpus: 120,
    cpuUtil: 0.52,
    budgetHits: [{ daysAgo: 20, consumed: 0.18, label: 'WebSocket reconnect storm' }],
  },
  {
    id: 'payments-svc',
    name: 'Payments',
    team: 'payments',
    ownerId: 'u-priya',
    onCallId: 'u-lucas',
    tier: 'critical',
    runtime: 'Rust · Axum',
    description: 'Card charges, refunds, ledgers and payouts.',
    regions: ['eu-west-2', 'me-central-1', 'us-east-1'],
    primaryRegion: 'eu-west-2',
    slo: { target: 0.999, latencyMs: 300, windowDays: 30 },
    baseP95: 240,
    baseErrorRate: 0.0003,
    baseRps: 340,
    deps: ['identity-svc', 'notifications-svc', 'payments-pg', 'payments-events'],
    repo: 'helix/payments-svc',
    lastDeploy: { version: 'v2.41.0', authorId: 'u-priya', minsAgo: 40 },
    dailyCostUsd: 980,
    costMix: { compute: 0.5, database: 0.35, network: 0.1, observability: 0.05 },
    regionMix: { 'eu-west-2': 0.55, 'me-central-1': 0.25, 'us-east-1': 0.2 },
    vcpus: 64,
    cpuUtil: 0.38,
    budgetHits: [
      { daysAgo: 12, consumed: 0.22, label: 'Aurora failover' },
      { daysAgo: 4, consumed: 0.06, label: 'Card network timeouts' },
    ],
  },
  {
    id: 'identity-svc',
    name: 'Identity',
    team: 'identity',
    ownerId: 'u-ethan',
    onCallId: 'u-ethan',
    tier: 'critical',
    runtime: 'Go · OIDC + passkeys',
    description: 'Sign-in, sessions, tokens and device trust.',
    regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'],
    primaryRegion: 'me-central-1',
    slo: { target: 0.9995, latencyMs: 150, windowDays: 30 },
    baseP95: 48,
    baseErrorRate: 0.0001,
    baseRps: 3100,
    deps: ['identity-pg', 'session-redis'],
    repo: 'helix/identity-svc',
    lastDeploy: { version: 'v4.2.7', authorId: 'u-ethan', minsAgo: 2 * 24 * 60 },
    dailyCostUsd: 420,
    costMix: { compute: 0.55, database: 0.3, observability: 0.15 },
    regionMix: { 'me-central-1': 0.4, 'eu-west-2': 0.25, 'ap-southeast-1': 0.2, 'us-east-1': 0.15 },
    vcpus: 48,
    cpuUtil: 0.44,
    budgetHits: [{ daysAgo: 25, consumed: 0.05, label: 'JWKS rotation' }],
  },
  {
    id: 'search-svc',
    name: 'Search',
    team: 'data',
    ownerId: 'u-kwame',
    onCallId: 'u-kwame',
    tier: 'high',
    runtime: 'Kotlin · OpenSearch',
    description: 'Universal search, embeddings and ranking.',
    regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'],
    primaryRegion: 'eu-west-2',
    slo: { target: 0.995, latencyMs: 450, windowDays: 30 },
    baseP95: 210,
    baseErrorRate: 0.001,
    baseRps: 760,
    deps: ['search-cluster', 'data-pipeline'],
    repo: 'helix/search-svc',
    lastDeploy: { version: 'v2.7.3', authorId: 'u-kwame', minsAgo: 30 * 60 },
    dailyCostUsd: 690,
    costMix: { compute: 0.35, database: 0.45, storage: 0.1, ai: 0.1 },
    regionMix: { 'me-central-1': 0.3, 'eu-west-2': 0.35, 'ap-southeast-1': 0.2, 'us-east-1': 0.15 },
    vcpus: 88,
    cpuUtil: 0.29,
    budgetHits: [{ daysAgo: 2, consumed: 0.31, label: 'Reindex saturated the cluster' }],
  },
  {
    id: 'notifications-svc',
    name: 'Notifications',
    team: 'collab',
    ownerId: 'u-lucas',
    onCallId: 'u-lucas',
    tier: 'standard',
    runtime: 'Node.js · SQS workers',
    description: 'Push, email and in-app notification fan-out.',
    regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1', 'us-east-1'],
    primaryRegion: 'me-central-1',
    slo: { target: 0.995, latencyMs: 800, windowDays: 30 },
    baseP95: 320,
    baseErrorRate: 0.0012,
    baseRps: 1400,
    deps: ['events-queue'],
    repo: 'helix/notifications-svc',
    lastDeploy: { version: 'v1.14.0', authorId: 'u-lucas', minsAgo: 8 * 24 * 60 },
    dailyCostUsd: 310,
    costMix: { compute: 0.6, network: 0.25, observability: 0.15 },
    regionMix: { 'me-central-1': 0.35, 'eu-west-2': 0.3, 'ap-southeast-1': 0.2, 'us-east-1': 0.15 },
    vcpus: 40,
    cpuUtil: 0.33,
    budgetHits: [{ daysAgo: 9, consumed: 0.08, label: 'APNs certificate expiry' }],
  },
  {
    id: 'data-pipeline',
    name: 'Data Pipeline',
    team: 'data',
    ownerId: 'u-kwame',
    onCallId: 'u-kwame',
    tier: 'high',
    runtime: 'Python · Spark on K8s',
    description: 'Ingestion, ETL and warehouse exports.',
    regions: ['me-central-1', 'eu-west-2', 'us-east-1'],
    primaryRegion: 'eu-west-2',
    slo: { target: 0.99, latencyMs: 2500, windowDays: 30 },
    baseP95: 1150,
    baseErrorRate: 0.004,
    baseRps: 120,
    deps: ['events-queue', 'warehouse'],
    repo: 'helix/data-pipeline',
    lastDeploy: { version: 'v0.88.0', authorId: 'u-kwame', minsAgo: 7 * 24 * 60 + 90 },
    dailyCostUsd: 1050,
    costMix: { compute: 0.5, network: 0.17, storage: 0.2, database: 0.13 },
    regionMix: { 'me-central-1': 0.35, 'eu-west-2': 0.4, 'us-east-1': 0.25 },
    vcpus: 140,
    cpuUtil: 0.58,
    budgetHits: [{ daysAgo: 15, consumed: 0.1, label: 'Late partition backfill' }],
  },
];
export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, ServiceDef>;
export const SERVICE_IDS = SERVICES.map((s) => s.id);

/** Shared platform cost (EKS control planes, observability stack, NAT) owned by Platform. */
export const SHARED_COST = {
  id: 'shared-platform',
  name: 'Shared platform',
  team: 'platform' as TeamId,
  dailyCostUsd: 820,
  costMix: { compute: 0.3, observability: 0.45, network: 0.25 },
  regionMix: { 'me-central-1': 0.3, 'eu-west-2': 0.3, 'ap-southeast-1': 0.2, 'us-east-1': 0.2 } as Partial<Record<RegionId, number>>,
};

/* ───────────────────────── dependency topology ───────────────────────── */

export const TOPO_NODES: TopoNode[] = [
  { id: 'edge', label: 'Edge · CDN', kind: 'edge', x: 70, y: 210 },
  { id: 'hub-web', label: 'hub-web', kind: 'service', x: 230, y: 210 },
  { id: 'mail-api', label: 'mail-api', kind: 'service', x: 430, y: 60 },
  { id: 'chat-realtime', label: 'chat-realtime', kind: 'service', x: 430, y: 160 },
  { id: 'payments-svc', label: 'payments-svc', kind: 'service', x: 430, y: 260 },
  { id: 'search-svc', label: 'search-svc', kind: 'service', x: 430, y: 360 },
  { id: 'identity-svc', label: 'identity-svc', kind: 'service', x: 650, y: 110 },
  { id: 'notifications-svc', label: 'notifications-svc', kind: 'service', x: 650, y: 230 },
  { id: 'data-pipeline', label: 'data-pipeline', kind: 'service', x: 650, y: 360 },
  { id: 'mail-pg', label: 'mail-pg', kind: 'postgres', x: 860, y: 30 },
  { id: 'identity-pg', label: 'identity-pg', kind: 'postgres', x: 860, y: 90 },
  { id: 'session-redis', label: 'session-redis', kind: 'redis', x: 860, y: 145 },
  { id: 'chat-redis', label: 'chat-redis', kind: 'redis', x: 650, y: 170 },
  { id: 'payments-pg', label: 'payments-pg', kind: 'postgres', x: 650, y: 290 },
  { id: 'payments-events', label: 'payments-events', kind: 'queue', x: 860, y: 270 },
  { id: 'events-queue', label: 'events-queue', kind: 'queue', x: 860, y: 215 },
  { id: 'search-cluster', label: 'search-cluster', kind: 'search', x: 650, y: 410 },
  { id: 'warehouse', label: 'warehouse', kind: 'warehouse', x: 860, y: 385 },
];

/* ───────────────────────── storyline ───────────────────────── */

export const STORY_SEED = {
  service: 'payments-svc' as ServiceId,
  region: 'eu-west-2' as RegionId,
  version: 'v2.41.0',
  authorId: 'u-priya',
  deployMinsAgo: 40,
  degradedP95: 820,
  degradedErrorRate: 0.023,
  incident: { code: 'INC-2047', title: 'Elevated payment latency in EU', severity: 'SEV2', status: 'mitigating', startedMinsAgo: 31 },
};

export function buildSeedStory(now = Date.now()): Story {
  return {
    deployAt: now - STORY_SEED.deployMinsAgo * MIN,
    version: STORY_SEED.version,
    authorId: STORY_SEED.authorId,
    deployTo: '/devhub/deploys',
    recoveredAt: null,
    source: 'seed',
    incident: {
      code: STORY_SEED.incident.code,
      title: STORY_SEED.incident.title,
      severity: STORY_SEED.incident.severity,
      status: STORY_SEED.incident.status,
      to: '/incidents',
      startedAt: now - STORY_SEED.incident.startedMinsAgo * MIN,
      source: 'seed',
    },
  };
}

/* ───────────────────────── resources ───────────────────────── */

const tags = (team: TeamId, env: string, owner: string, extra: Record<string, string> = {}) => ({
  team,
  env,
  'cost-center': TEAM_BY_ID[team].costCenter,
  owner,
  ...extra,
});

const NODE_LADDER = ['m6i.large', 'm6i.xlarge', 'm6i.2xlarge', 'm6i.4xlarge'];
const MEM_LADDER = ['r6i.xlarge', 'r6i.2xlarge', 'r6i.4xlarge'];
const PG_LADDER = ['db.r6g.large', 'db.r6g.xlarge', 'db.r6g.2xlarge', 'db.r6g.4xlarge'];
const REDIS_LADDER = ['cache.r6g.medium', 'cache.r6g.large', 'cache.r6g.xlarge'];

export function buildResources(now = Date.now()): Resource[] {
  const ago = (days: number) => now - days * DAY;
  return [
    // ── Kubernetes ──
    { id: 'eks-prod-me1', name: 'eks-prod-me1', kind: 'k8s', region: 'me-central-1', team: 'platform', size: 'EKS 1.30', monthlyUsd: 146, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(410), detail: 'EKS 1.30 · 3 node pools · Karpenter' },
    { id: 'np-me1-general', name: 'general', kind: 'nodepool', parentId: 'eks-prod-me1', region: 'me-central-1', team: 'platform', size: 'm6i.2xlarge', sizeLadder: NODE_LADDER, count: 18, monthlyUsd: 5810, cpu: 0.58, mem: 0.66, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(410), detail: 'On-demand · 18 nodes · 144 vCPU' },
    { id: 'np-me1-memory', name: 'memory', kind: 'nodepool', parentId: 'eks-prod-me1', region: 'me-central-1', team: 'platform', size: 'r6i.2xlarge', sizeLadder: MEM_LADDER, count: 6, monthlyUsd: 2650, cpu: 0.41, mem: 0.72, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(300), detail: 'On-demand · 6 nodes · 48 vCPU' },
    { id: 'np-me1-batch', name: 'batch', kind: 'nodepool', parentId: 'eks-prod-me1', region: 'me-central-1', team: 'data', size: 'c6i.4xlarge', count: 4, monthlyUsd: 1620, cpu: 0.63, mem: 0.48, tags: tags('data', 'production', 'kwame.mensah'), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(220), detail: 'Spot · 4 nodes · UAE ledger ETL' },
    { id: 'eks-prod-euw2', name: 'eks-prod-euw2', kind: 'k8s', region: 'eu-west-2', team: 'platform', size: 'EKS 1.30', monthlyUsd: 146, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'eu-personal', managedBy: 'terraform', status: 'running', createdAt: ago(520), detail: 'EKS 1.30 · 3 node pools · Karpenter' },
    { id: 'np-euw2-general', name: 'general', kind: 'nodepool', parentId: 'eks-prod-euw2', region: 'eu-west-2', team: 'platform', size: 'm6i.2xlarge', sizeLadder: NODE_LADDER, count: 19, monthlyUsd: 5760, cpu: 0.81, mem: 0.7, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'eu-personal', managedBy: 'terraform', drift: [{ field: 'Autoscaler max nodes', code: '16', live: '24', risk: 'medium' }], status: 'running', createdAt: ago(520), detail: 'On-demand · scaled 12 → 19 nodes in 40 min' },
    { id: 'np-euw2-memory', name: 'memory', kind: 'nodepool', parentId: 'eks-prod-euw2', region: 'eu-west-2', team: 'platform', size: 'r6i.2xlarge', sizeLadder: MEM_LADDER, count: 6, monthlyUsd: 2490, cpu: 0.47, mem: 0.69, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'eu-personal', managedBy: 'terraform', status: 'running', createdAt: ago(380), detail: 'On-demand · 6 nodes · 48 vCPU' },
    { id: 'np-euw2-spark', name: 'spark', kind: 'nodepool', parentId: 'eks-prod-euw2', region: 'eu-west-2', team: 'data', size: 'r6i.4xlarge', sizeLadder: MEM_LADDER, count: 8, monthlyUsd: 6640, cpu: 0.62, mem: 0.74, tags: tags('data', 'production', 'kwame.mensah'), encrypted: true, dataClass: 'eu-personal', managedBy: 'terraform', status: 'running', createdAt: ago(260), detail: 'Spot + on-demand · Spark executors' },
    { id: 'eks-prod-apse1', name: 'eks-prod-apse1', kind: 'k8s', region: 'ap-southeast-1', team: 'platform', size: 'EKS 1.30', monthlyUsd: 146, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(330), detail: 'EKS 1.30 · 2 node pools' },
    { id: 'np-apse1-general', name: 'general', kind: 'nodepool', parentId: 'eks-prod-apse1', region: 'ap-southeast-1', team: 'platform', size: 'm6i.2xlarge', sizeLadder: NODE_LADDER, count: 14, monthlyUsd: 4390, cpu: 0.52, mem: 0.61, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(330), detail: 'On-demand · 14 nodes · 112 vCPU' },
    { id: 'np-apse1-gpu', name: 'gpu', kind: 'nodepool', parentId: 'eks-prod-apse1', region: 'ap-southeast-1', team: 'data', size: 'g5.2xlarge', count: 2, monthlyUsd: 1980, cpu: 0.07, mem: 0.12, tags: { team: 'data', env: 'production', 'cost-center': 'CC-4500' }, encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'idle', createdAt: ago(45), detail: 'NVIDIA A10G · embeddings refresh' },
    { id: 'eks-prod-use1', name: 'eks-prod-use1', kind: 'k8s', region: 'us-east-1', team: 'platform', size: 'EKS 1.30', monthlyUsd: 146, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(600), detail: 'EKS 1.30 · 1 node pool' },
    { id: 'np-use1-general', name: 'general', kind: 'nodepool', parentId: 'eks-prod-use1', region: 'us-east-1', team: 'platform', size: 'm6i.2xlarge', sizeLadder: NODE_LADDER, count: 10, monthlyUsd: 2800, cpu: 0.27, mem: 0.38, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(600), detail: 'On-demand · 10 nodes · 80 vCPU' },
    { id: 'eks-staging-euw2', name: 'eks-staging-euw2', kind: 'k8s', region: 'eu-west-2', team: 'platform', size: 'EKS 1.30', monthlyUsd: 146, tags: { team: 'platform', env: 'staging', owner: 'lucas.meyer' }, encrypted: true, dataClass: 'internal', managedBy: 'terraform', drift: [{ field: 'API endpoint access', code: 'Private', live: 'Public + private', risk: 'high' }], status: 'running', createdAt: ago(200), detail: 'Staging · 1 node pool' },
    { id: 'np-stg-general', name: 'general', kind: 'nodepool', parentId: 'eks-staging-euw2', region: 'eu-west-2', team: 'platform', size: 'm6i.xlarge', sizeLadder: NODE_LADDER, count: 6, monthlyUsd: 900, cpu: 0.19, mem: 0.31, tags: { team: 'platform', env: 'staging', owner: 'lucas.meyer' }, encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(200), detail: 'On-demand · 6 nodes · 24 vCPU' },
    // ── Databases ──
    { id: 'payments-pg', name: 'payments-pg', kind: 'postgres', region: 'eu-west-2', service: 'payments-svc', team: 'payments', size: 'db.r6g.2xlarge', sizeLadder: PG_LADDER, monthlyUsd: 2980, cpu: 0.74, mem: 0.63, tags: tags('payments', 'production', 'priya.raman', { 'data-class': 'confidential' }), encrypted: true, dataClass: 'confidential', managedBy: 'terraform', drift: [{ field: 'Parameter max_connections', code: '400', live: '640', risk: 'low' }], status: 'running', createdAt: ago(700), detail: 'Aurora PostgreSQL 15 · Multi-AZ · KMS CMK' },
    { id: 'identity-pg', name: 'identity-pg', kind: 'postgres', region: 'me-central-1', service: 'identity-svc', team: 'identity', size: 'db.r6g.xlarge', sizeLadder: PG_LADDER, monthlyUsd: 1690, cpu: 0.36, mem: 0.52, tags: tags('identity', 'production', 'ethan.brooks', { 'data-class': 'uae-personal' }), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(800), detail: 'Aurora PostgreSQL 15 · Multi-AZ · KMS CMK' },
    { id: 'mail-pg', name: 'mail-pg', kind: 'postgres', region: 'me-central-1', service: 'mail-api', team: 'collab', size: 'db.r6g.2xlarge', sizeLadder: PG_LADDER, monthlyUsd: 3050, cpu: 0.44, mem: 0.58, tags: tags('collab', 'production', 'omar.khalid', { 'data-class': 'uae-personal' }), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(640), detail: 'Aurora PostgreSQL 15 · Multi-AZ · KMS CMK' },
    { id: 'mail-pg-analytics', name: 'mail-pg-analytics', kind: 'postgres', region: 'eu-west-2', service: 'mail-api', team: 'collab', size: 'db.r6g.2xlarge', sizeLadder: PG_LADDER, monthlyUsd: 2640, cpu: 0.17, mem: 0.33, tags: tags('collab', 'production', 'omar.khalid', { 'data-class': 'internal' }), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(150), detail: 'Anonymised analytics replica' },
    { id: 'search-cluster', name: 'search-cluster', kind: 'postgres', region: 'eu-west-2', service: 'search-svc', team: 'data', size: 'r6g.2xlarge.search', sizeLadder: ['r6g.large.search', 'r6g.xlarge.search', 'r6g.2xlarge.search'], count: 6, monthlyUsd: 4100, cpu: 0.22, mem: 0.41, tags: tags('data', 'production', 'kwame.mensah'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(420), detail: 'OpenSearch 2.13 · 6 data nodes' },
    // ── Caches ──
    { id: 'chat-redis', name: 'chat-redis', kind: 'redis', region: 'eu-west-2', service: 'chat-realtime', team: 'collab', size: 'cache.r6g.xlarge', sizeLadder: REDIS_LADDER, monthlyUsd: 590, cpu: 0.38, mem: 0.61, tags: tags('collab', 'production', 'lucas.meyer'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(360), detail: 'ElastiCache Redis 7 · cluster mode' },
    { id: 'session-redis', name: 'session-redis', kind: 'redis', region: 'me-central-1', service: 'identity-svc', team: 'identity', size: 'cache.r6g.large', sizeLadder: REDIS_LADDER, monthlyUsd: 300, cpu: 0.22, mem: 0.35, tags: tags('identity', 'production', 'ethan.brooks'), encrypted: true, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(510), detail: 'ElastiCache Redis 7 · TLS + AUTH' },
    // ── Buckets ──
    { id: 'helix-uae-records', name: 'helix-uae-records', kind: 'bucket', region: 'me-central-1', team: 'identity', size: '18.4 TB', monthlyUsd: 480, tags: tags('identity', 'production', 'ethan.brooks', { 'data-class': 'uae-personal' }), encrypted: true, publicAccess: false, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(900), detail: 'S3 Standard · Object Lock · KMS CMK' },
    { id: 'helix-mail-attachments', name: 'helix-mail-attachments', kind: 'bucket', region: 'me-central-1', service: 'mail-api', team: 'collab', size: '64 TB', monthlyUsd: 1780, tags: tags('collab', 'production', 'omar.khalid', { 'data-class': 'uae-personal' }), encrypted: true, publicAccess: false, dataClass: 'uae-personal', managedBy: 'terraform', status: 'running', createdAt: ago(880), detail: 'S3 Standard · 71% not read in 90 days' },
    { id: 'helix-pipeline-exports', name: 'helix-pipeline-exports', kind: 'bucket', region: 'eu-west-2', service: 'data-pipeline', team: 'data', size: '9.2 TB', monthlyUsd: 230, tags: tags('data', 'production', 'kwame.mensah', { 'data-class': 'eu-personal' }), encrypted: true, publicAccess: false, dataClass: 'eu-personal', managedBy: 'terraform', drift: [{ field: 'Block public access', code: 'Enabled', live: 'Disabled', risk: 'high' }, { field: 'Lifecycle expiry', code: '30 days', live: 'Never', risk: 'medium' }], status: 'running', createdAt: ago(120), detail: 'S3 Standard · warehouse-sync staging' },
    { id: 'helix-cdn-assets', name: 'helix-cdn-assets', kind: 'bucket', region: 'us-east-1', service: 'hub-web', team: 'platform', size: '2.1 TB', monthlyUsd: 60, tags: tags('platform', 'production', 'omar.khalid', { 'data-class': 'public' }), encrypted: true, publicAccess: true, dataClass: 'public', managedBy: 'terraform', status: 'running', createdAt: ago(950), detail: 'Origin for CloudFront · OAC' },
    // ── Queues & streams ──
    { id: 'payments-events', name: 'payments-events', kind: 'queue', region: 'eu-west-2', service: 'payments-svc', team: 'payments', size: 'kafka.m5.large ×3', monthlyUsd: 1120, cpu: 0.34, mem: 0.45, tags: tags('payments', 'production', 'priya.raman'), encrypted: true, dataClass: 'confidential', managedBy: 'terraform', status: 'running', createdAt: ago(690), detail: 'MSK Kafka 3.6 · 3 brokers' },
    { id: 'events-queue', name: 'events-queue', kind: 'queue', region: 'me-central-1', service: 'notifications-svc', team: 'collab', size: 'SQS standard', monthlyUsd: 140, tags: tags('collab', 'production', 'lucas.meyer'), encrypted: true, dataClass: 'internal', managedBy: 'terraform', status: 'running', createdAt: ago(720), detail: 'SQS · 41M messages/month' },
    { id: 'pipeline-ingest', name: 'pipeline-ingest', kind: 'queue', region: 'eu-west-2', service: 'data-pipeline', team: 'data', size: 'Kinesis 8 shards', monthlyUsd: 260, tags: { team: 'data', env: 'production', 'cost-center': 'CC-4500' }, encrypted: true, dataClass: 'eu-personal', managedBy: 'terraform', status: 'running', createdAt: ago(240), detail: 'Kinesis Data Streams · 8 shards' },
    // ── CDN & notebooks ──
    { id: 'cdn-hub-web', name: 'cdn-hub-web', kind: 'cdn', region: 'us-east-1', service: 'hub-web', team: 'platform', size: '42 TB / month', monthlyUsd: 1950, tags: tags('platform', 'production', 'omar.khalid'), encrypted: true, publicAccess: true, dataClass: 'public', managedBy: 'terraform', status: 'running', createdAt: ago(960), detail: 'CloudFront · 94% cache hit ratio' },
    { id: 'nb-embeddings-lab', name: 'nb-embeddings-lab', kind: 'notebook', region: 'ap-southeast-1', service: 'search-svc', team: 'data', size: 'g5.2xlarge', monthlyUsd: 880, cpu: 0.02, mem: 0.06, tags: { team: 'data', owner: 'kwame.mensah' }, encrypted: true, dataClass: 'internal', managedBy: 'console', status: 'idle', createdAt: ago(9), detail: 'JupyterLab · idle for 3 days' },
  ];
}

/** Tags every resource must carry (policy + showback). */
export const REQUIRED_TAGS = ['team', 'env', 'cost-center', 'owner'] as const;

/* ───────────────────────── quotas ───────────────────────── */

export const QUOTAS: Quota[] = [
  { id: 'q-me1-vcpu', region: 'me-central-1', label: 'On-demand vCPUs', used: 1184, limit: 1536 },
  { id: 'q-me1-eip', region: 'me-central-1', label: 'Elastic IPs', used: 14, limit: 20 },
  { id: 'q-euw2-vcpu', region: 'eu-west-2', label: 'On-demand vCPUs', used: 1312, limit: 1600 },
  { id: 'q-euw2-nat', region: 'eu-west-2', label: 'NAT gateway Gbps', used: 38, limit: 45 },
  { id: 'q-apse1-vcpu', region: 'ap-southeast-1', label: 'On-demand vCPUs', used: 880, limit: 1024 },
  { id: 'q-apse1-gpu', region: 'ap-southeast-1', label: 'GPU vCPUs', used: 24, limit: 32 },
  { id: 'q-use1-vcpu', region: 'us-east-1', label: 'On-demand vCPUs', used: 1020, limit: 2048 },
  { id: 'q-use1-alb', region: 'us-east-1', label: 'Load balancers', used: 31, limit: 50 },
];

/* ───────────────────────── alerting ───────────────────────── */

export const ALERT_RULES: AlertRule[] = [
  { id: 'r-pay-p95', name: 'payments-svc p95 latency', service: 'payments-svc', kind: 'latency', expr: 'p95(http.server.duration{service="payments-svc"}) > 500ms', forMins: 5, severity: 'critical', channel: '#payments-oncall · PagerDuty', storyFiring: 'incident' },
  { id: 'r-pay-burn', name: 'payments-svc SLO burn rate', service: 'payments-svc', kind: 'burn', expr: 'burn_rate(1h) > 14.4 and burn_rate(5m) > 14.4', forMins: 2, severity: 'critical', channel: '#payments-oncall · PagerDuty', storyFiring: 'incident' },
  { id: 'r-pay-5xx', name: 'payments-svc 5xx ratio', service: 'payments-svc', kind: 'errors', expr: 'rate(http_5xx) / rate(http_total) > 1%', forMins: 5, severity: 'warning', channel: '#payments-oncall', storyFiring: 'incident' },
  { id: 'r-egress', name: 'data-pipeline egress spend', service: 'data-pipeline', kind: 'cost', expr: 'daily_cost{service="data-pipeline",category="network"} > $400', forMins: 60, severity: 'warning', channel: '#finops · email', storyFiring: 'egress' },
  { id: 'r-quota-apse1', name: 'vCPU quota ap-southeast-1', kind: 'saturation', expr: 'quota_used / quota_limit > 0.85', forMins: 30, severity: 'warning', channel: '#platform', storyFiring: 'quota' },
  { id: 'r-identity-p95', name: 'identity-svc p95 latency', service: 'identity-svc', kind: 'latency', expr: 'p95(http.server.duration{service="identity-svc"}) > 150ms', forMins: 5, severity: 'critical', channel: '#identity-oncall · PagerDuty' },
  { id: 'r-chat-ws', name: 'chat-realtime WebSocket disconnects', service: 'chat-realtime', kind: 'errors', expr: 'ws_disconnect_ratio > 2%', forMins: 10, severity: 'warning', channel: '#collab-oncall' },
  { id: 'r-mail-backlog', name: 'mail-api IMAP sync backlog', service: 'mail-api', kind: 'saturation', expr: 'queue_depth{queue="imap-sync"} > 5000', forMins: 15, severity: 'warning', channel: '#collab-oncall' },
  { id: 'r-search-heap', name: 'search-svc JVM heap', service: 'search-svc', kind: 'saturation', expr: 'jvm_heap_used_ratio > 0.85', forMins: 10, severity: 'warning', channel: '#data-oncall' },
  { id: 'r-carbon', name: 'Batch job in a high-carbon window', kind: 'carbon', expr: 'grid_intensity(region, job.start) > 400 gCO2e/kWh', forMins: 0, severity: 'info', channel: '#greenops' },
];

export const RUNBOOK_TO = '/wiki/doc/production-deploy-and-incident-runbook';
export const ONCALL_TO = '/wiki/collections/col-eng-oncall';

/* ───────────────────────── FinOps ───────────────────────── */

export const ANOMALIES: AnomalyDef[] = [
  {
    id: 'an-egress',
    service: 'data-pipeline',
    category: 'network',
    region: 'eu-west-2',
    title: 'Cross-region egress spike',
    days: 7,
    factor: 4.4,
    drivers: ['New warehouse-sync job copies full partitions eu-west-2 → us-east-1', 'Traffic leaves through the NAT gateway instead of PrivateLink', '1.9 TB/day transferred vs 0.4 TB/day baseline'],
    explanation:
      'Since warehouse-sync shipped 7 days ago, data-pipeline copies full partitions from eu-west-2 to the Snowflake account in us-east-1 every night. Inter-region transfer and NAT processing are billed per GB, so network spend went from about $179/day to $785/day.',
    fix: 'Switch warehouse-sync to incremental CDC exports and route it through the Snowflake PrivateLink endpoint in eu-west-2.',
    savingsUsd: 18_200,
  },
  {
    id: 'an-payments',
    service: 'payments-svc',
    category: 'compute',
    region: 'eu-west-2',
    title: 'Autoscaling surge on payments-svc',
    days: 0,
    factor: 1.38,
    drivers: ['HPA scaled payments-svc from 12 to 19 pods after v2.41.0', 'Clients retry up to 3× on 5xx', 'Correlated with p95 820ms in eu-west-2'],
    explanation:
      'payments-svc compute is up 38% since v2.41.0 reached production 40 minutes ago. Slow ledger queries hold connections longer, the HPA adds pods and client retries multiply traffic — classic retry-storm cost amplification.',
    fix: 'Roll back v2.41.0 (or add the missing ledger_entries index) and cap client retries with jittered backoff.',
    savingsUsd: 5_600,
  },
  {
    id: 'an-gpu',
    service: 'search-svc',
    category: 'ai',
    region: 'ap-southeast-1',
    title: 'Idle GPU notebook',
    days: 3,
    factor: 2.1,
    drivers: ['nb-embeddings-lab (g5.2xlarge) at 2% GPU for 3 days', 'Created in the console · no auto-stop', 'Missing cost-center tag'],
    explanation: 'A JupyterLab GPU notebook created by hand in ap-southeast-1 has been idle for three days with no auto-stop policy, billing about $29/day.',
    fix: 'Stop the notebook and recreate it from the GPU notebook template (auto-stop after 8h).',
    savingsUsd: 880,
  },
];

export const STATIC_RECS: Recommendation[] = [
  { id: 'rec-sp', kind: 'commitment', title: 'Compute Savings Plan +$18/h', detail: '1-year, no upfront · coverage 68% → 80%', savingsUsd: 3940, carbonKg: 0, effort: 'low', team: 'platform' },
  { id: 'rec-idle-nb', kind: 'idle', resourceId: 'nb-embeddings-lab', title: 'Stop idle GPU notebook', detail: 'nb-embeddings-lab · 2% GPU for 3 days', savingsUsd: 880, carbonKg: 96, effort: 'low', team: 'data' },
  { id: 'rec-tiering', kind: 'storage', resourceId: 'helix-mail-attachments', title: 'Intelligent-Tiering for mail attachments', detail: '71% of 64 TB not read in 90 days', savingsUsd: 1240, carbonKg: 38, effort: 'low', team: 'collab' },
];

export const COMMITMENTS: Commitment[] = [
  { id: 'cm-compute', label: 'Compute Savings Plan', provider: 'AWS', coverage: 0.68, target: 0.8, utilisation: 0.97, suggestHourlyUsd: 18, suggestSavingsUsd: 3940, expiresInDays: 210 },
  { id: 'cm-rds', label: 'Aurora reserved instances', provider: 'AWS', coverage: 0.74, target: 0.8, utilisation: 0.99, suggestHourlyUsd: 2.6, suggestSavingsUsd: 760, expiresInDays: 95 },
  { id: 'cm-cache', label: 'ElastiCache reserved nodes', provider: 'AWS', coverage: 0.52, target: 0.7, utilisation: 1, suggestHourlyUsd: 1.1, suggestSavingsUsd: 330, expiresInDays: 400 },
  { id: 'cm-gcp', label: 'Vertex AI committed use', provider: 'GCP', coverage: 0.4, target: 0.6, utilisation: 0.92, suggestHourlyUsd: 3, suggestSavingsUsd: 520, expiresInDays: 150 },
];

export const CONTRACTS_SEED: CloudContract[] = [
  { id: 'ct-aws', provider: 'AWS Enterprise Discount Program', commitUsd: 2_400_000, monthsElapsed: 7.4, consumedUsd: 1_468_000, renewal: '2027-04-01', source: 'seed' },
  { id: 'ct-gcp', provider: 'Google Cloud commit', commitUsd: 360_000, monthsElapsed: 10.3, consumedUsd: 262_000, renewal: '2027-01-01', source: 'seed' },
];

/* ───────────────────────── GreenOps ───────────────────────── */

export const BATCH_JOBS: BatchJob[] = [
  { id: 'job-warehouse-sync', name: 'warehouse-sync', service: 'data-pipeline', region: 'eu-west-2', durationH: 3, startHourUtc: 18, kwhPerRun: 210, runsPerMonth: 30, pinned: true },
  { id: 'job-uae-ledger', name: 'uae-ledger-etl', service: 'data-pipeline', region: 'me-central-1', durationH: 3, startHourUtc: 20, kwhPerRun: 160, runsPerMonth: 30, pinned: true },
  { id: 'job-reindex', name: 'search-reindex', service: 'search-svc', region: 'ap-southeast-1', durationH: 4, startHourUtc: 13, kwhPerRun: 240, runsPerMonth: 8, pinned: false },
  { id: 'job-embeddings', name: 'embeddings-refresh', service: 'search-svc', region: 'us-east-1', durationH: 3, startHourUtc: 22, kwhPerRun: 380, runsPerMonth: 12, pinned: false },
  { id: 'job-backups', name: 'mail-pg snapshots', service: 'mail-api', region: 'me-central-1', durationH: 2, startHourUtc: 21, kwhPerRun: 60, runsPerMonth: 30, pinned: true },
];

/* ───────────────────────── provisioning catalog ───────────────────────── */

export interface SizeOption {
  id: string;
  specs: string;
  hourlyUsd: number;
  vcpu: number;
  gpu?: number;
}

export interface TemplateDef {
  id: ProvisionTemplate;
  label: string;
  sub: string;
  sizes: SizeOption[];
  defaultSize: string;
  provisionMs: number;
  kind: Resource['kind'];
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    sub: 'Aurora PostgreSQL 15 · Multi-AZ in production',
    kind: 'postgres',
    defaultSize: 'db.r6g.large',
    provisionMs: 14_000,
    sizes: [
      { id: 'db.t4g.medium', specs: '2 vCPU · 4 GiB', hourlyUsd: 0.073, vcpu: 2 },
      { id: 'db.r6g.large', specs: '2 vCPU · 16 GiB', hourlyUsd: 0.26, vcpu: 2 },
      { id: 'db.r6g.xlarge', specs: '4 vCPU · 32 GiB', hourlyUsd: 0.52, vcpu: 4 },
      { id: 'db.r6g.2xlarge', specs: '8 vCPU · 64 GiB', hourlyUsd: 1.04, vcpu: 8 },
    ],
  },
  {
    id: 'redis',
    label: 'Redis',
    sub: 'ElastiCache Redis 7 · TLS and AUTH',
    kind: 'redis',
    defaultSize: 'cache.r6g.large',
    provisionMs: 9_000,
    sizes: [
      { id: 'cache.t4g.small', specs: '2 vCPU · 1.4 GiB', hourlyUsd: 0.034, vcpu: 2 },
      { id: 'cache.r6g.large', specs: '2 vCPU · 13 GiB', hourlyUsd: 0.206, vcpu: 2 },
      { id: 'cache.r6g.xlarge', specs: '4 vCPU · 26 GiB', hourlyUsd: 0.411, vcpu: 4 },
    ],
  },
  {
    id: 'namespace',
    label: 'K8s namespace',
    sub: 'Quotas, NetworkPolicy and OIDC RBAC on the regional EKS cluster',
    kind: 'namespace',
    defaultSize: 'ns-medium',
    provisionMs: 5_000,
    sizes: [
      { id: 'ns-small', specs: '4 vCPU · 8 GiB quota', hourlyUsd: 0.19, vcpu: 4 },
      { id: 'ns-medium', specs: '8 vCPU · 16 GiB quota', hourlyUsd: 0.38, vcpu: 8 },
      { id: 'ns-large', specs: '16 vCPU · 32 GiB quota', hourlyUsd: 0.77, vcpu: 16 },
    ],
  },
  {
    id: 'bucket',
    label: 'Object bucket',
    sub: 'S3 · versioning, KMS and public-access block',
    kind: 'bucket',
    defaultSize: 'standard-1tb',
    provisionMs: 4_000,
    sizes: [
      { id: 'standard-1tb', specs: '≈ 1 TB · Standard', hourlyUsd: 0.0315, vcpu: 0 },
      { id: 'standard-10tb', specs: '≈ 10 TB · Standard', hourlyUsd: 0.315, vcpu: 0 },
      { id: 'tiering-10tb', specs: '≈ 10 TB · Intelligent-Tiering', hourlyUsd: 0.19, vcpu: 0 },
    ],
  },
  {
    id: 'gpu-notebook',
    label: 'GPU notebook',
    sub: 'JupyterLab on NVIDIA L4 / A10G · auto-stop',
    kind: 'notebook',
    defaultSize: 'g6.xlarge',
    provisionMs: 8_000,
    sizes: [
      { id: 'g6.xlarge', specs: '1× L4 24 GB · 4 vCPU', hourlyUsd: 0.805, vcpu: 4, gpu: 1 },
      { id: 'g5.xlarge', specs: '1× A10G 24 GB · 4 vCPU', hourlyUsd: 1.006, vcpu: 4, gpu: 1 },
      { id: 'g5.2xlarge', specs: '1× A10G 24 GB · 8 vCPU', hourlyUsd: 1.212, vcpu: 8, gpu: 1 },
    ],
  },
];
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t])) as Record<ProvisionTemplate, TemplateDef>;

/* ───────────────────────── persisted seed ───────────────────────── */

export function buildCloudSeed(): CloudData {
  return {
    version: CLOUD_DATA_VERSION,
    alerts: {},
    rules: {},
    anomalies: {},
    recs: {},
    patches: {},
    requests: [],
    schedules: {},
    declared: {},
    notified: {},
  };
}
