/**
 * Incident Command ("Sentinel") — deterministic seed & pure signal/postmortem helpers.
 * Relative to `now` so timestamps, active clocks, and 7-day pager metrics stay fresh.
 */
import { DAY, HOUR, MIN, RUNBOOKS, SERVICES } from './meta';
import { rid, startOfUtcDay } from './engine';
import type {
  AlertEvent,
  AlertGroup,
  AlertGroupState,
  ComponentStatus,
  DayBar,
  DeploySignal,
  HealthSignal,
  Incident,
  IncidentsData,
  Maintenance,
  NoiseSuggestion,
  Override,
  PageRecord,
  Postmortem,
  Rotation,
  RoutingRule,
  StatusUpdate,
  SubscriberChannel,
} from './types';

export const INCIDENTS_DATA_VERSION = 2;

export function fingerprintOf(e: Pick<AlertEvent, 'service' | 'source' | 'title'>): string {
  const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  return `${e.service}:${e.source}:${slug}`;
}

export function runbookForService(services: string[], doneCount = 0, doneBy = 'u-lucas', baseAt = Date.now()) {
  const key = services.find((s) => RUNBOOKS[s]) ?? 'generic';
  const items = RUNBOOKS[key] ?? RUNBOOKS.generic;
  return items.map((text, idx) => ({
    id: `rb-${key}-${idx + 1}`,
    text,
    done: idx < doneCount,
    doneBy: idx < doneCount ? doneBy : undefined,
    doneAt: idx < doneCount ? baseAt + (idx + 1) * 4 * MIN : undefined,
  }));
}

export function buildIncidentsSeed(now = Date.now()): IncidentsData {
  const day0 = startOfUtcDay(now);

  const rotations: Rotation[] = [
    {
      id: 'rot-platform',
      name: 'Core Platform Follow-the-Sun',
      kind: 'follow-the-sun',
      services: ['hub-web', 'mail-api', 'chat-realtime', 'search-svc', 'notifications-svc', 'incident-paging'],
      shifts: [
        { id: 'sh-sg', hub: 'Singapore', userId: 'u-priya', startUtc: 0, endUtc: 6, tz: 'Asia/Kolkata' },
        { id: 'sh-dxb', hub: 'Dubai', userId: 'u-omar', startUtc: 6, endUtc: 12, tz: 'Asia/Dubai' },
        { id: 'sh-eu', hub: 'Berlin–London', userId: 'u-lucas', startUtc: 12, endUtc: 18, tz: 'Europe/Berlin' },
        { id: 'sh-na', hub: 'Toronto–New York', userId: 'u-ethan', startUtc: 18, endUtc: 24, tz: 'America/Toronto' },
      ],
      escalationIds: ['u-omar', 'u-layla'],
      color: '#f97316',
    },
    {
      id: 'rot-payments',
      name: 'Payments & Ledger Primary',
      kind: 'weekly',
      services: ['payments-svc'],
      members: ['u-priya', 'u-lucas', 'u-omar', 'u-kwame'],
      anchor: day0 - 14 * DAY,
      escalationIds: ['u-omar', 'u-grace'],
      color: '#ef4444',
    },
    {
      id: 'rot-security',
      name: 'Security & Identity Response',
      kind: 'weekly',
      services: ['identity-svc'],
      members: ['u-ethan', 'u-layla', 'u-lucas'],
      anchor: day0 - 21 * DAY,
      escalationIds: ['u-layla', 'u-omar'],
      color: '#ec4899',
    },
    {
      id: 'rot-data',
      name: 'Data & Telemetry Pipeline',
      kind: 'weekly',
      services: ['data-pipeline'],
      members: ['u-kwame', 'u-priya', 'u-omar'],
      anchor: day0 - 7 * DAY,
      escalationIds: ['u-omar', 'u-aisha'],
      color: '#38bdf8',
    },
    {
      id: 'rot-ic',
      name: 'Incident Commander Duty',
      kind: 'weekly',
      services: [],
      members: ['u-omar', 'u-layla', 'u-lucas', 'u-priya'],
      anchor: day0 - 28 * DAY,
      escalationIds: ['u-layla'],
      color: '#a855f7',
    },
  ];

  const overrides: Override[] = [
    {
      id: 'ov-1',
      rotationId: 'rot-platform',
      fromUserId: 'u-lucas',
      toUserId: 'u-priya',
      start: day0 + 12 * HOUR,
      end: day0 + 18 * HOUR,
      reason: 'Post-incident recovery window after overnight EU pager load',
      state: 'accepted',
      requestedBy: 'u-lucas',
      requestedAt: now - 3 * HOUR,
      acceptedAt: now - 90 * MIN,
    },
    {
      id: 'ov-2',
      rotationId: 'rot-payments',
      fromUserId: 'u-priya',
      toUserId: 'u-kwame',
      start: day0 + DAY,
      end: day0 + 2 * DAY,
      reason: 'Deep-work architecture review block',
      state: 'requested',
      requestedBy: 'u-priya',
      requestedAt: now - 75 * MIN,
    },
    {
      id: 'ov-3',
      rotationId: 'rot-security',
      fromUserId: 'u-ethan',
      toUserId: 'u-layla',
      start: day0 - DAY,
      end: day0,
      reason: 'Toronto pen-test debrief window',
      state: 'applied',
      requestedBy: 'u-ethan',
      requestedAt: now - 36 * HOUR,
      acceptedAt: now - 34 * HOUR,
      appliedAt: now - 33 * HOUR,
      calendarAdded: true,
    },
  ];

  const incidents: Incident[] = [
    {
      id: 'inc-2047',
      code: 'INC-2047',
      title: 'Elevated payment latency in EU',
      severity: 'SEV2',
      status: 'mitigating',
      summary:
        'EU card authorization p95 jumped from 320ms to 1,840ms in eu-west-2 following payments-svc v2.41.0 rollout. Shifting EU checkout traffic to me-central-1 and rolling back v2.41.0.',
      services: ['payments-svc'],
      regions: ['eu-west-2', 'me-central-1'],
      impactedApps: ['expenses', 'procurement'],
      roles: {
        commander: 'u-omar',
        ops: 'u-lucas',
        comms: 'u-aisha',
        scribe: 'u-priya',
      },
      startedAt: now - 42 * MIN,
      ackAt: now - 39 * MIN,
      mitigatingAt: now - 26 * MIN,
      declaredBy: 'u-lucas',
      impact: 64,
      impactNote: '38% of EU card checkouts experiencing >1.5s latency; 4.8% timeout rate on 3DS verification',
      cause: 'deploy',
      timeline: [
        {
          id: 'tl-2047-1',
          at: now - 46 * MIN,
          kind: 'deploy',
          source: 'devhub',
          authorId: 'u-priya',
          key: 'deploy:payments-svc:v2.41.0',
          text: 'DevHub deployed payments-svc v2.41.0 to production (eu-west-2) — connection pool retry tune',
        },
        {
          id: 'tl-2047-2',
          at: now - 42 * MIN,
          kind: 'alert',
          source: 'cloud',
          key: 'alert:payments-svc:eu-west-2:p95',
          text: 'Cloud Console alert fired: payments-svc eu-west-2 p95 latency 1,840ms (SLO threshold 450ms)',
        },
        {
          id: 'tl-2047-3',
          at: now - 42 * MIN,
          kind: 'page',
          source: 'sentinel',
          text: 'Paged Payments & Ledger Primary (Priya Raman) and Incident Commander Duty (Omar Khalid)',
        },
        {
          id: 'tl-2047-4',
          at: now - 39 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-lucas',
          status: 'acknowledged',
          text: 'Acknowledged page; opening War Room and inspecting eu-west-2 connection pool metrics',
        },
        {
          id: 'tl-2047-5',
          at: now - 34 * MIN,
          kind: 'nova',
          source: 'nova',
          text: 'Nova correlated latency spike (+475%) with deploy payments-svc v2.41.0 landed 4m prior (96% confidence)',
        },
        {
          id: 'tl-2047-6',
          at: now - 31 * MIN,
          kind: 'freeze',
          source: 'devhub',
          authorId: 'u-omar',
          text: 'Production deploy freeze engaged via DevHub bridge for INC-2047',
        },
        {
          id: 'tl-2047-7',
          at: now - 26 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-lucas',
          status: 'mitigating',
          text: 'Shifting 60% of EU card traffic to me-central-1 and initiating rollback of payments-svc v2.41.0 → v2.40.9',
        },
      ],
      runbook: runbookForService(['payments-svc'], 3, 'u-lucas', now - 38 * MIN),
      paging: {
        targets: [
          { userId: 'u-priya', rotationId: 'rot-payments' },
          { userId: 'u-omar', rotationId: 'rot-ic' },
        ],
        pagedAt: now - 42 * MIN,
        ackDueAt: now - 37 * MIN,
        ackBy: 'u-lucas',
        ackAt: now - 39 * MIN,
        escalations: 0,
      },
      freeze: {
        active: true,
        reason: 'Frozen during INC-2047 — payments-svc v2.41.0 rollback in progress',
        at: now - 31 * MIN,
        synced: true,
      },
      chatPosts: 2,
      mails: 1,
      statusPosts: 1,
      lastCommsAt: now - 18 * MIN,
    },
    {
      id: 'inc-2046',
      code: 'INC-2046',
      title: 'SMS paging delays via EU carrier',
      severity: 'SEV3',
      status: 'monitoring',
      summary:
        'Upstream EU SMS aggregator queued delivery receipts by 4–6 minutes for Berlin and London responders. Failed over SMS traffic to secondary carrier and enabled push + voice fallback.',
      services: ['incident-paging'],
      regions: ['eu-west-2'],
      impactedApps: ['incidents'],
      roles: {
        commander: 'u-lucas',
        ops: 'u-ethan',
        comms: 'u-omar',
      },
      startedAt: now - 96 * MIN,
      ackAt: now - 92 * MIN,
      mitigatingAt: now - 74 * MIN,
      monitoringAt: now - 28 * MIN,
      declaredBy: 'u-lucas',
      impact: 22,
      impactNote: 'SMS delivery delayed in EU; push and automated voice pages unaffected (100% delivery)',
      cause: 'dependency',
      timeline: [
        {
          id: 'tl-2046-1',
          at: now - 96 * MIN,
          kind: 'alert',
          source: 'alerts',
          text: 'Carrier webhook synthetic check exceeded 180s delivery SLA in eu-west-2',
        },
        {
          id: 'tl-2046-2',
          at: now - 92 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-lucas',
          status: 'acknowledged',
          text: 'Acknowledged carrier degradation; inspecting primary EU SMPP bind queue',
        },
        {
          id: 'tl-2046-3',
          at: now - 74 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-ethan',
          status: 'mitigating',
          text: 'Failed over EU SMS routing to secondary carrier and forced push + voice fallback',
        },
        {
          id: 'tl-2046-4',
          at: now - 28 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-lucas',
          status: 'monitoring',
          text: 'Test pages across all 4 hubs delivered in <4s; monitoring carrier queue drain before resolving',
        },
      ],
      runbook: runbookForService(['incident-paging'], 4, 'u-ethan', now - 90 * MIN),
      paging: {
        targets: [{ userId: 'u-lucas', rotationId: 'rot-platform' }],
        pagedAt: now - 96 * MIN,
        ackDueAt: now - 91 * MIN,
        ackBy: 'u-lucas',
        ackAt: now - 92 * MIN,
        escalations: 0,
      },
      chatPosts: 1,
      mails: 0,
      statusPosts: 1,
      lastCommsAt: now - 28 * MIN,
    },
    {
      id: 'inc-2044',
      code: 'INC-2044',
      title: 'Search index shard lag after schema migration',
      severity: 'SEV2',
      status: 'resolved',
      summary:
        'Wiki and Drive full-text search queries returned stale results for 47 minutes while search-svc rebalanced shards in me-central-1.',
      services: ['search-svc'],
      regions: ['me-central-1', 'eu-west-2'],
      impactedApps: ['wiki', 'drive'],
      roles: {
        commander: 'u-omar',
        ops: 'u-priya',
        comms: 'u-aisha',
        scribe: 'u-kwame',
      },
      startedAt: now - 2 * DAY - 3 * HOUR,
      ackAt: now - 2 * DAY - 3 * HOUR + 3 * MIN,
      mitigatingAt: now - 2 * DAY - 3 * HOUR + 14 * MIN,
      monitoringAt: now - 2 * DAY - 3 * HOUR + 34 * MIN,
      resolvedAt: now - 2 * DAY - 3 * HOUR + 47 * MIN,
      declaredBy: 'u-priya',
      impact: 0,
      impactNote: 'Resolved — search index replication lag back under 120ms',
      cause: 'config',
      resolution: 'Throttled background re-index workers to 25% IOPS and promoted warm read replica in me-central-1.',
      postmortemId: 'pm-2044',
      timeline: [
        {
          id: 'tl-2044-1',
          at: now - 2 * DAY - 3 * HOUR,
          kind: 'alert',
          source: 'cloud',
          text: 'search-svc ingestion lag crossed 30s in me-central-1',
        },
        {
          id: 'tl-2044-2',
          at: now - 2 * DAY - 3 * HOUR + 3 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-priya',
          status: 'acknowledged',
          text: 'Acknowledged; unthrottled re-index migration saturating shard IOPS',
        },
        {
          id: 'tl-2044-3',
          at: now - 2 * DAY - 3 * HOUR + 47 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-omar',
          status: 'resolved',
          text: 'Resolved after capping re-index concurrency and verifying fresh query results',
        },
      ],
      runbook: runbookForService(['search-svc'], 5, 'u-priya', now - 2 * DAY - 3 * HOUR),
      paging: {
        targets: [{ userId: 'u-priya', rotationId: 'rot-platform' }],
        pagedAt: now - 2 * DAY - 3 * HOUR,
        ackDueAt: now - 2 * DAY - 3 * HOUR + 5 * MIN,
        ackBy: 'u-priya',
        ackAt: now - 2 * DAY - 3 * HOUR + 3 * MIN,
        escalations: 0,
      },
      chatPosts: 3,
      mails: 1,
      statusPosts: 2,
    },
    {
      id: 'inc-2041',
      code: 'INC-2041',
      title: 'Identity token signing key rotation stall',
      severity: 'SEV1',
      status: 'resolved',
      summary:
        'Automated JWKS key rotation published a new key id before edge caches in ap-southeast-1 refreshed, causing 6.2% SSO token refresh retries for 31 minutes.',
      services: ['identity-svc', 'hub-web'],
      regions: ['ap-southeast-1', 'eu-west-2'],
      impactedApps: [],
      roles: {
        commander: 'u-layla',
        ops: 'u-ethan',
        comms: 'u-omar',
        scribe: 'u-lucas',
      },
      startedAt: now - 5 * DAY - 5 * HOUR,
      ackAt: now - 5 * DAY - 5 * HOUR + 2 * MIN,
      mitigatingAt: now - 5 * DAY - 5 * HOUR + 9 * MIN,
      monitoringAt: now - 5 * DAY - 5 * HOUR + 21 * MIN,
      resolvedAt: now - 5 * DAY - 5 * HOUR + 31 * MIN,
      declaredBy: 'u-ethan',
      impact: 0,
      impactNote: 'Resolved — dual-signing overlap window extended to 24h',
      cause: 'certificate',
      resolution: 'Pinned previous JWKS verification key in edge cache and enforced 24-hour dual-key overlap policy.',
      postmortemId: 'pm-2041',
      timeline: [
        {
          id: 'tl-2041-1',
          at: now - 5 * DAY - 5 * HOUR,
          kind: 'alert',
          source: 'alerts',
          text: 'identity-svc JWT verification error rate > 5% in ap-southeast-1',
        },
        {
          id: 'tl-2041-2',
          at: now - 5 * DAY - 5 * HOUR + 31 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-layla',
          status: 'resolved',
          text: 'Resolved — JWKS cache warm-up verified across all 4 regions',
        },
      ],
      runbook: runbookForService(['identity-svc'], 5, 'u-ethan', now - 5 * DAY - 5 * HOUR),
      paging: {
        targets: [
          { userId: 'u-ethan', rotationId: 'rot-security' },
          { userId: 'u-layla', rotationId: 'rot-ic' },
        ],
        pagedAt: now - 5 * DAY - 5 * HOUR,
        ackDueAt: now - 5 * DAY - 5 * HOUR + 4 * MIN,
        ackBy: 'u-ethan',
        ackAt: now - 5 * DAY - 5 * HOUR + 2 * MIN,
        escalations: 0,
      },
      chatPosts: 4,
      mails: 2,
      statusPosts: 3,
    },
    {
      id: 'inc-2038',
      code: 'INC-2038',
      title: 'Analytics warehouse nightly dbt freshness lag',
      severity: 'SEV3',
      status: 'resolved',
      summary:
        'Upstream billing export schema added two nullable columns that stalled incremental dbt merge in us-east-1 for 58 minutes.',
      services: ['data-pipeline'],
      regions: ['us-east-1'],
      impactedApps: ['analytics'],
      roles: {
        commander: 'u-omar',
        ops: 'u-kwame',
        comms: 'u-aisha',
      },
      startedAt: now - 9 * DAY - 2 * HOUR,
      ackAt: now - 9 * DAY - 2 * HOUR + 4 * MIN,
      mitigatingAt: now - 9 * DAY - 2 * HOUR + 19 * MIN,
      monitoringAt: now - 9 * DAY - 2 * HOUR + 45 * MIN,
      resolvedAt: now - 9 * DAY - 2 * HOUR + 58 * MIN,
      declaredBy: 'u-kwame',
      impact: 0,
      impactNote: 'Resolved — schema evolution policy set to append_new_columns',
      cause: 'data',
      resolution: 'Enabled automatic schema evolution on staging incremental models and re-ran cohort mart.',
      postmortemId: 'pm-2038',
      timeline: [
        {
          id: 'tl-2038-1',
          at: now - 9 * DAY - 2 * HOUR,
          kind: 'alert',
          source: 'cloud',
          text: 'data-pipeline dbt freshness SLA > 45m on mart_revenue_daily',
        },
        {
          id: 'tl-2038-2',
          at: now - 9 * DAY - 2 * HOUR + 58 * MIN,
          kind: 'status',
          source: 'human',
          authorId: 'u-kwame',
          status: 'resolved',
          text: 'Backfill complete; Insights dashboards verified current',
        },
      ],
      runbook: runbookForService(['data-pipeline'], 5, 'u-kwame', now - 9 * DAY - 2 * HOUR),
      paging: {
        targets: [{ userId: 'u-kwame', rotationId: 'rot-data' }],
        pagedAt: now - 9 * DAY - 2 * HOUR,
        ackDueAt: now - 9 * DAY - 2 * HOUR + 5 * MIN,
        ackBy: 'u-kwame',
        ackAt: now - 9 * DAY - 2 * HOUR + 4 * MIN,
        escalations: 0,
      },
      chatPosts: 2,
      mails: 1,
      statusPosts: 1,
    },
  ];

  // Seed page records across the week, including night pages for Lucas & Priya (for fatigue radar)
  const pages: PageRecord[] = [
    { id: 'pg-1', userId: 'u-priya', at: now - 42 * MIN, service: 'payments-svc', rotationId: 'rot-payments', incidentId: 'inc-2047', ackMins: 3 },
    { id: 'pg-2', userId: 'u-omar', at: now - 42 * MIN, service: 'payments-svc', rotationId: 'rot-ic', incidentId: 'inc-2047', ackMins: 3 },
    { id: 'pg-3', userId: 'u-lucas', at: now - 96 * MIN, service: 'incident-paging', rotationId: 'rot-platform', incidentId: 'inc-2046', ackMins: 4 },
    // Night pages in Berlin (01:30, 03:15, 23:30 UTC+1 -> 00:30, 02:15, 22:30 UTC)
    { id: 'pg-4', userId: 'u-lucas', at: day0 - DAY + 1 * HOUR + 20 * MIN, service: 'chat-realtime', rotationId: 'rot-platform', ackMins: 5 },
    { id: 'pg-5', userId: 'u-lucas', at: day0 - 2 * DAY + 2 * HOUR + 10 * MIN, service: 'payments-svc', rotationId: 'rot-payments', ackMins: 4 },
    { id: 'pg-6', userId: 'u-lucas', at: day0 - 3 * DAY + 22 * HOUR + 30 * MIN, service: 'search-svc', rotationId: 'rot-platform', ackMins: 6 },
    { id: 'pg-7', userId: 'u-lucas', at: day0 - 4 * DAY + 14 * HOUR, service: 'hub-web', rotationId: 'rot-platform', ackMins: 2 },
    // Night pages in Bengaluru (UTC+5:30 -> 23:30 IST = 18:00 UTC)
    { id: 'pg-8', userId: 'u-priya', at: day0 - 2 * DAY + 18 * HOUR + 15 * MIN, service: 'search-svc', rotationId: 'rot-platform', incidentId: 'inc-2044', ackMins: 3 },
    { id: 'pg-9', userId: 'u-priya', at: day0 - 4 * DAY + 19 * HOUR, service: 'payments-svc', rotationId: 'rot-payments', ackMins: 4 },
    { id: 'pg-10', userId: 'u-ethan', at: now - 5 * DAY - 5 * HOUR, service: 'identity-svc', rotationId: 'rot-security', incidentId: 'inc-2041', ackMins: 2 },
    { id: 'pg-11', userId: 'u-layla', at: now - 5 * DAY - 5 * HOUR, service: 'identity-svc', rotationId: 'rot-ic', incidentId: 'inc-2041', ackMins: 2 },
    { id: 'pg-12', userId: 'u-kwame', at: now - 3 * DAY - 4 * HOUR, service: 'data-pipeline', rotationId: 'rot-data', ackMins: 4 },
  ];

  const alertEvents: AlertEvent[] = [
    {
      id: 'al-1',
      at: now - 4 * MIN,
      service: 'payments-svc',
      region: 'eu-west-2',
      source: 'apm',
      title: 'Card authorization p95 latency > 1,500ms (eu-west-2)',
      severity: 'critical',
      incidentId: 'inc-2047',
    },
    {
      id: 'al-2',
      at: now - 19 * MIN,
      service: 'payments-svc',
      region: 'eu-west-2',
      source: 'apm',
      title: 'Card authorization p95 latency > 1,500ms (eu-west-2)',
      severity: 'critical',
      incidentId: 'inc-2047',
    },
    {
      id: 'al-3',
      at: now - 42 * MIN,
      service: 'payments-svc',
      region: 'eu-west-2',
      source: 'apm',
      title: 'Card authorization p95 latency > 1,500ms (eu-west-2)',
      severity: 'critical',
      incidentId: 'inc-2047',
    },
    {
      id: 'al-4',
      at: now - 12 * MIN,
      service: 'payments-svc',
      region: 'eu-west-2',
      source: 'synthetics',
      title: '3DS checkout synthetic probe timeout > 4%',
      severity: 'high',
      incidentId: 'inc-2047',
    },
    {
      id: 'al-5',
      at: now - 35 * MIN,
      service: 'incident-paging',
      region: 'eu-west-2',
      source: 'carrier',
      title: 'EU SMS carrier DLR queue delay > 180s',
      severity: 'warning',
      incidentId: 'inc-2046',
    },
    {
      id: 'al-6',
      at: now - 14 * MIN,
      service: 'chat-realtime',
      region: 'eu-west-2',
      source: 'cloud',
      title: 'WebSocket pod CPU burst > 75% for 60s',
      severity: 'warning',
    },
    {
      id: 'al-7',
      at: now - 52 * MIN,
      service: 'chat-realtime',
      region: 'eu-west-2',
      source: 'cloud',
      title: 'WebSocket pod CPU burst > 75% for 60s',
      severity: 'warning',
    },
    {
      id: 'al-8',
      at: now - 25 * MIN,
      service: 'data-pipeline',
      region: 'us-east-1',
      source: 'cloud',
      title: 'Kafka consumer lag transient spike on clickstream-ingest',
      severity: 'info',
    },
    {
      id: 'al-9',
      at: now - 48 * MIN,
      service: 'mail-api',
      region: 'me-central-1',
      source: 'synthetics',
      title: 'IMAP idle keepalive retry in me-central-1',
      severity: 'info',
    },
  ];

  const fpPay = fingerprintOf(alertEvents[0]);
  const fp3ds = fingerprintOf(alertEvents[3]);
  const fpSms = fingerprintOf(alertEvents[4]);
  const fpWs = fingerprintOf(alertEvents[5]);
  const fpKafka = fingerprintOf(alertEvents[7]);

  const alertStates: Record<string, AlertGroupState> = {
    [fpPay]: { state: 'acknowledged', ackBy: 'u-lucas', ackAt: now - 39 * MIN, incidentId: 'inc-2047', escalated: true },
    [fp3ds]: { state: 'firing', incidentId: 'inc-2047' },
    [fpSms]: { state: 'acknowledged', ackBy: 'u-ethan', ackAt: now - 74 * MIN, incidentId: 'inc-2046' },
    [fpWs]: { state: 'firing' },
    [fpKafka]: { state: 'firing' },
  };

  const rules: RoutingRule[] = [
    {
      id: 'rule-1',
      name: 'Critical core service alerts → Page service rotation + IC',
      match: { severity: ['critical'] },
      action: 'page',
      target: 'rot-platform',
      enabled: true,
      hits7d: 9,
      createdBy: 'u-omar',
    },
    {
      id: 'rule-2',
      name: 'Payments high/critical → Page Payments & Ledger Primary',
      match: { service: 'payments-svc', severity: ['critical', 'high'] },
      action: 'page',
      target: 'rot-payments',
      enabled: true,
      hits7d: 6,
      createdBy: 'u-priya',
    },
    {
      id: 'rule-3',
      name: 'Transient IMAP keepalive probes → Suppress auto-page',
      match: { service: 'mail-api', severity: ['info'] },
      action: 'suppress',
      target: '#sre-noise-log',
      enabled: true,
      hits7d: 42,
      createdBy: 'u-lucas',
      nova: true,
    },
  ];

  const postmortems: Postmortem[] = [
    {
      id: 'pm-2044',
      incidentId: 'inc-2044',
      title: 'INC-2044 · Search index shard lag after schema migration',
      status: 'review',
      authorId: 'u-priya',
      createdAt: now - 2 * DAY,
      updatedAt: now - 6 * HOUR,
      novaDrafted: true,
      reviewerIds: ['u-omar', 'u-lucas', 'u-kwame'],
      sections: {
        summary:
          'During a planned search-svc index mapping migration in me-central-1, background re-index workers consumed 92% of NVMe IOPS, delaying live document indexing for Wiki and Drive by up to 47 minutes.',
        impact:
          'Zero data loss; search queries worked against existing documents but newly edited Wiki pages and Drive files took up to 47 minutes to appear in search results.',
        rootCause:
          'The migration job lacked an IOPS token-bucket rate limiter when running alongside peak Dubai business-hours traffic.',
        contributing: [
          'Migration dry-run executed on staging with 15% of production shard volume',
          'Missing alert on search-svc background worker disk queue depth',
        ],
        wentWell: [
          'Paged on-call acknowledged within 3 minutes',
          'Warm read replica promotion restored query latency in under 12 minutes',
        ],
        lessons: [
          'All online index migrations must enforce dynamic IOPS throttling tied to p95 query latency',
          'Staging load tests for storage migrations must replay production write concurrency',
        ],
        whys: [
          'Why did Wiki and Drive search return stale results? Because live indexing queues backed up behind re-index batches.',
          'Why did live indexing queues back up? Because re-index workers saturated shard disk IOPS at 92%.',
          'Why did workers saturate disk IOPS? Because the migration CLI was invoked without `--max-iops-pct`.',
          'Why was `--max-iops-pct` omitted? Because the flag was optional and defaulted to unlimited.',
          'Why did it default to unlimited? Because the migration runner template predated multi-tenant NVMe pools.',
        ],
      },
      actions: [
        {
          id: 'act-2044-1',
          title: 'Enforce mandatory 30% IOPS cap in search-svc migration runner',
          ownerId: 'u-priya',
          due: new Date(now + 3 * DAY).toISOString().slice(0, 10),
          priority: 'P1',
          done: true,
        },
        {
          id: 'act-2044-2',
          title: 'Add Cloud Console alert on search-svc ingestion queue age > 10s',
          ownerId: 'u-lucas',
          due: new Date(now + 5 * DAY).toISOString().slice(0, 10),
          priority: 'P2',
          done: false,
        },
        {
          id: 'act-2044-3',
          title: 'Add automatic migration pause when p95 query latency > 250ms',
          ownerId: 'u-kwame',
          due: new Date(now + 7 * DAY).toISOString().slice(0, 10),
          priority: 'P2',
          done: false,
        },
      ],
    },
    {
      id: 'pm-2041',
      incidentId: 'inc-2041',
      title: 'INC-2041 · Identity token signing key rotation stall',
      status: 'published',
      authorId: 'u-ethan',
      createdAt: now - 5 * DAY,
      updatedAt: now - 4 * DAY,
      publishedAt: now - 4 * DAY,
      wikiTo: '/wiki',
      novaDrafted: true,
      reviewerIds: ['u-layla', 'u-omar'],
      sections: {
        summary:
          'Automated JWKS key rotation promoted a new signing key before ap-southeast-1 edge nodes refreshed their public key cache, causing transient token verification retries for 31 minutes.',
        impact:
          '6.2% of token refresh requests in Singapore required an automatic client retry; active user sessions remained intact.',
        rootCause:
          'JWKS cache TTL at edge proxies was set to 30 minutes while key activation delay after publication was set to 5 minutes.',
        contributing: [
          'Vault secret rotation schedule triggered during APAC morning login peak',
          'Edge cache purge webhook timed out on one Singapore POP',
        ],
        wentWell: [
          'Security & Identity on-call (Ethan) and IC (Layla) joined the HoloMeet bridge in 120 seconds',
          'One-click JWKS dual-key pin mitigated customer impact in 9 minutes',
        ],
        lessons: [
          'Signing keys must be published to JWKS 24 hours prior to active signing promotion',
          'Schedule cryptographic rotations outside regional login peaks',
        ],
        whys: [
          'Why did SSO token verification fail? Because edge proxies did not recognize the new `kid` header.',
          'Why did edge proxies lack the new `kid`? Because their cached JWKS document was up to 30 minutes old.',
          'Why did identity-svc sign with the new key before caches expired? Because activation delay was only 5 minutes.',
          'Why was activation delay 5 minutes? Because it matched staging TTLs rather than production CDN TTLs.',
          'Why was the mismatch not caught? Because synthetic rotation tests queried origin directly, bypassing edge cache.',
        ],
      },
      actions: [
        {
          id: 'act-2041-1',
          title: 'Enforce 24-hour staged JWKS publication before signing activation',
          ownerId: 'u-ethan',
          due: new Date(now - 2 * DAY).toISOString().slice(0, 10),
          priority: 'P1',
          done: true,
        },
        {
          id: 'act-2041-2',
          title: 'Route synthetic auth probes through regional edge POPs',
          ownerId: 'u-lucas',
          due: new Date(now + 2 * DAY).toISOString().slice(0, 10),
          priority: 'P2',
          done: true,
        },
      ],
    },
    {
      id: 'pm-2038',
      incidentId: 'inc-2038',
      title: 'INC-2038 · Analytics warehouse nightly dbt freshness lag',
      status: 'actions-complete',
      authorId: 'u-kwame',
      createdAt: now - 9 * DAY,
      updatedAt: now - 7 * DAY,
      publishedAt: now - 8 * DAY,
      wikiTo: '/wiki',
      novaDrafted: true,
      reviewerIds: ['u-omar', 'u-aisha'],
      sections: {
        summary:
          'Nightly dbt incremental merge on `mart_revenue_daily` halted for 58 minutes when an upstream billing export introduced two new nullable columns.',
        impact: 'Executive Insights revenue widgets showed yesterday’s snapshot for 58 minutes; zero data loss.',
        rootCause: 'Incremental model configured with `on_schema_change: fail` instead of `append_new_columns`.',
        contributing: ['Upstream schema change merged without data contract check in CI'],
        wentWell: ['Automated backfill recovered all downstream marts in 13 minutes'],
        lessons: ['Enforce data contract checks in DevHub CI and default non-breaking column additions to auto-append'],
        whys: [
          'Why were Insights dashboards stale? Because `mart_revenue_daily` failed its incremental run.',
          'Why did the run fail? Because two new columns appeared in `raw_billing_events`.',
          'Why did new columns break the model? Because `on_schema_change` was set to `fail`.',
          'Why was it set to `fail`? Because the model used the strict legacy template.',
          'Why did CI not warn us? Because producer and consumer repos lacked a shared schema contract check.',
        ],
      },
      actions: [
        {
          id: 'act-2038-1',
          title: 'Set `on_schema_change: append_new_columns` across all staging incremental models',
          ownerId: 'u-kwame',
          due: new Date(now - 5 * DAY).toISOString().slice(0, 10),
          priority: 'P1',
          done: true,
        },
      ],
    },
  ];

  const updates: StatusUpdate[] = [
    {
      id: 'su-1',
      at: now - 24 * MIN,
      incidentId: 'inc-2047',
      phase: 'identified',
      title: 'Elevated payment latency in EU (INC-2047)',
      body: 'We have identified a connection-pool regression in payments-svc v2.41.0 affecting EU card checkouts. Traffic is shifting to me-central-1 while we roll back.',
      componentIds: ['payments-svc', 'expenses', 'procurement'],
      authorId: 'u-aisha',
    },
    {
      id: 'su-2',
      at: now - 28 * MIN,
      incidentId: 'inc-2046',
      phase: 'monitoring',
      title: 'SMS paging delays via EU carrier (INC-2046)',
      body: 'EU SMS responder pages have been failed over to our secondary carrier with push and voice fallback active. Monitoring delivery latency.',
      componentIds: ['incident-paging', 'incidents'],
      authorId: 'u-omar',
    },
    {
      id: 'su-3',
      at: now - 2 * DAY - 2 * HOUR,
      incidentId: 'inc-2044',
      phase: 'resolved',
      title: 'Search index shard lag resolved (INC-2044)',
      body: 'Search indexing across Wiki and Drive has returned to normal sub-second freshness.',
      componentIds: ['search-svc', 'wiki', 'drive'],
      authorId: 'u-aisha',
    },
  ];

  const maintenance: Maintenance[] = [
    {
      id: 'mnt-1',
      title: 'me-central-1 PostgreSQL minor engine upgrade (zero-downtime failover)',
      componentIds: ['payments-svc', 'data-pipeline'],
      start: day0 + 2 * DAY + 2 * HOUR,
      end: day0 + 2 * DAY + 3 * HOUR,
      createdBy: 'u-lucas',
      notify: true,
    },
  ];

  const subscribers: SubscriberChannel[] = [
    { id: 'email', count: 1420 },
    { id: 'chat', count: 38 },
    { id: 'sms', count: 610 },
    { id: 'webhook', count: 94 },
  ];

  const deploys: DeploySignal[] = [
    {
      id: 'dep-2047',
      service: 'payments-svc',
      version: 'v2.41.0',
      env: 'production',
      status: 'success',
      authorId: 'u-priya',
      at: now - 46 * MIN,
      region: 'eu-west-2',
      to: '/devhub/deploys',
    },
    {
      id: 'dep-2046',
      service: 'payments-svc',
      version: 'v2.40.9',
      env: 'production',
      status: 'success',
      authorId: 'u-omar',
      at: now - 19 * HOUR,
      region: 'me-central-1',
      to: '/devhub/deploys',
    },
    {
      id: 'dep-2045',
      service: 'incident-paging',
      version: 'v1.18.4',
      env: 'production',
      status: 'success',
      authorId: 'u-lucas',
      at: now - 6 * HOUR,
      region: 'eu-west-2',
      to: '/devhub/deploys',
    },
    {
      id: 'dep-2044',
      service: 'hub-web',
      version: 'v4.12.0',
      env: 'production',
      status: 'success',
      authorId: 'u-priya',
      at: now - 3 * HOUR,
      region: 'me-central-1',
      to: '/devhub/deploys',
    },
  ];

  const health: HealthSignal[] = [
    { service: 'payments-svc', status: 'degraded', region: 'eu-west-2', latencyMs: 1840, errorRate: 0.048, to: '/cloud/services' },
    { service: 'incident-paging', status: 'degraded', region: 'eu-west-2', latencyMs: 620, errorRate: 0.019, to: '/cloud/services' },
    { service: 'hub-web', status: 'healthy', region: 'me-central-1', latencyMs: 68, errorRate: 0.0004, to: '/cloud/services' },
    { service: 'mail-api', status: 'healthy', region: 'me-central-1', latencyMs: 94, errorRate: 0.0008, to: '/cloud/services' },
    { service: 'chat-realtime', status: 'healthy', region: 'eu-west-2', latencyMs: 42, errorRate: 0.001, to: '/cloud/services' },
    { service: 'identity-svc', status: 'healthy', region: 'ap-southeast-1', latencyMs: 55, errorRate: 0.0003, to: '/cloud/services' },
    { service: 'search-svc', status: 'healthy', region: 'me-central-1', latencyMs: 118, errorRate: 0.0012, to: '/cloud/services' },
    { service: 'notifications-svc', status: 'healthy', region: 'us-east-1', latencyMs: 81, errorRate: 0.0006, to: '/cloud/services' },
    { service: 'data-pipeline', status: 'healthy', region: 'us-east-1', latencyMs: 210, errorRate: 0.0015, to: '/cloud/services' },
  ];

  return {
    version: INCIDENTS_DATA_VERSION,
    incidents,
    alertEvents,
    alertStates,
    rules,
    dismissedSuggestions: [],
    rotations,
    overrides,
    pages,
    postmortems,
    updates,
    maintenance,
    subscribers,
    serviceStatus: {
      'payments-svc': 'degraded',
      'incident-paging': 'degraded',
    },
    deploys,
    health,
    managedApps: ['incidents', 'expenses', 'procurement'],
  };
}

/** Deduplicate raw alert events by fingerprint and enrich with 7d noise signals. */
export function buildAlertGroups(events: AlertEvent[], states: Record<string, AlertGroupState>, now: number): AlertGroup[] {
  const byFp = new Map<string, AlertEvent[]>();
  for (const e of events) {
    const fp = fingerprintOf(e);
    const arr = byFp.get(fp);
    if (arr) arr.push(e);
    else byFp.set(fp, [e]);
  }
  const groups: AlertGroup[] = [];
  for (const [fp, list] of byFp.entries()) {
    const sorted = [...list].sort((a, b) => b.at - a.at);
    const head = sorted[0];
    const tail = sorted[sorted.length - 1];
    const st = states[fp];
    const snoozedActive = st?.state === 'snoozed' && st.snoozedUntil && st.snoozedUntil > now;
    const state = snoozedActive ? 'snoozed' : st?.state ?? 'firing';
    const noisy = head.service === 'chat-realtime' || head.service === 'data-pipeline' || head.severity === 'info';
    const flapping = head.service === 'chat-realtime' || sorted.length >= 2;
    const base7d = head.service === 'chat-realtime' ? 38 : head.service === 'data-pipeline' ? 27 : head.service === 'mail-api' ? 19 : sorted.length * 4;
    groups.push({
      fingerprint: fp,
      title: head.title,
      service: head.service,
      region: head.region,
      source: head.source,
      severity: head.severity,
      count: sorted.length,
      count7d: Math.max(sorted.length, base7d),
      firstAt: tail.at,
      lastAt: head.at,
      state,
      snoozedUntil: st?.snoozedUntil,
      ackBy: st?.ackBy,
      incidentId: st?.incidentId ?? head.incidentId,
      escalated: st?.escalated,
      noisy,
      flapping,
    });
  }
  const sevRank = { critical: 0, high: 1, warning: 2, info: 3 };
  return groups.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.lastAt - a.lastAt);
}

export function buildNoiseSuggestions(groups: AlertGroup[], dismissed: string[]): NoiseSuggestion[] {
  const out: NoiseSuggestion[] = [];
  for (const g of groups) {
    if (dismissed.includes(g.fingerprint)) continue;
    if (g.service === 'chat-realtime') {
      out.push({
        id: `ns-${g.fingerprint}`,
        kind: 'threshold',
        fingerprint: g.fingerprint,
        service: g.service,
        title: 'Raise WebSocket CPU burst window from 60s → 180s to stop auto-heal flapping',
        savings: 14,
        confidence: 0.94,
        evidence: [
          { label: '7d fires', value: `${g.count7d}` },
          { label: 'Actionable rate', value: '0%' },
          { label: 'Auto-healed', value: '38 / 38 under 90s' },
        ],
      });
    } else if (g.service === 'data-pipeline') {
      out.push({
        id: `ns-${g.fingerprint}`,
        kind: 'suppress',
        fingerprint: g.fingerprint,
        service: g.service,
        title: 'Suppress transient Kafka clickstream lag spikes during hourly compaction',
        savings: 9,
        confidence: 0.91,
        evidence: [
          { label: '7d fires', value: `${g.count7d}` },
          { label: 'Escalations', value: '0 incidents' },
          { label: 'Pattern', value: 'Hourly at :05 UTC' },
        ],
      });
    } else if (g.severity === 'info') {
      out.push({
        id: `ns-${g.fingerprint}`,
        kind: 'route',
        fingerprint: g.fingerprint,
        service: g.service,
        title: `Route ${g.service} info probes to #sre-noise-log instead of paging on-call`,
        savings: 6,
        confidence: 0.89,
        evidence: [
          { label: '7d fires', value: `${g.count7d}` },
          { label: 'Severity', value: 'Info' },
        ],
      });
    }
  }
  return out;
}

/** 90-day uptime bars for a service or hub app component. */
export function buildUptimeBars(componentId: string, incidents: Incident[], now: number, days = 45): DayBar[] {
  const day0 = startOfUtcDay(now);
  const svcIds = SERVICES.filter((s) => s.id === componentId || s.apps.includes(componentId)).map((s) => s.id);
  return Array.from({ length: days }, (_, idx) => {
    const dStart = day0 - (days - 1 - idx) * DAY;
    const dEnd = dStart + DAY;
    const hit = incidents.find((inc) => {
      const matches = inc.services.includes(componentId) || inc.impactedApps.includes(componentId) || inc.services.some((s) => svcIds.includes(s));
      if (!matches) return false;
      const end = inc.resolvedAt ?? now;
      return inc.startedAt < dEnd && end > dStart;
    });
    if (!hit) return { dayStart: dStart, status: 'operational', downMins: 0 };
    const end = Math.min(dEnd, hit.resolvedAt ?? now);
    const start = Math.max(dStart, hit.startedAt);
    const mins = Math.max(4, Math.round((end - start) / MIN));
    const status: ComponentStatus = hit.severity === 'SEV1' ? 'outage' : hit.severity === 'SEV2' ? 'partial' : 'degraded';
    return { dayStart: dStart, status, downMins: mins };
  });
}

/** Nova AI blameless postmortem generator from an incident's captured timeline and metadata. */
export function draftPostmortemFor(inc: Incident, authorId: string, now = Date.now()): Postmortem {
  const durMins = Math.max(1, Math.round(((inc.resolvedAt ?? now) - inc.startedAt) / MIN));
  const ackMins = inc.ackAt ? Math.max(1, Math.round((inc.ackAt - inc.startedAt) / MIN)) : 2;
  const svcList = inc.services.join(', ') || 'core platform';
  const regList = inc.regions.join(', ') || 'global';
  const deployEntry = inc.timeline.find((t) => t.kind === 'deploy');

  return {
    id: `pm-${inc.code.toLowerCase().replace(/[^a-z0-9]/g, '')}-${rid('v').slice(-4)}`,
    incidentId: inc.id,
    title: `${inc.code} · ${inc.title}`,
    status: 'draft',
    authorId,
    createdAt: now,
    updatedAt: now,
    novaDrafted: true,
    reviewerIds: [inc.roles.commander ?? 'u-omar', inc.roles.ops ?? 'u-lucas'].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i),
    sections: {
      summary: `${inc.code} (${inc.severity}) impacted ${svcList} in ${regList} for ${durMins} minutes. ${inc.summary}`,
      impact: inc.impactNote || `Peak customer impact score reached ${inc.impact}/100 across ${svcList}.`,
      rootCause: deployEntry
        ? `Regression introduced by ${deployEntry.text}, which exhausted downstream capacity under regional traffic load.`
        : inc.resolution || `Upstream dependency degradation on ${svcList} in ${regList} triggered cascading retry timeouts.`,
      contributing: [
        `Canary observation window in ${regList} did not exercise peak concurrency`,
        `Alert threshold fired on symptom latency before saturation telemetry paged on-call`,
      ],
      wentWell: [
        `On-call responder acknowledged within ${ackMins}m and opened the Sentinel War Room`,
        `Cross-region failover and deploy freeze prevented broader blast radius`,
      ],
      lessons: [
        `Gate ${svcList} production rollouts on regional p95 latency and pool saturation SLOs`,
        `Automate traffic drain runbook step for ${regList} to cut mitigation time in half`,
      ],
      whys: [
        `Why did customers experience degradation on ${svcList}? Because regional request queues exceeded SLO latency.`,
        `Why did request queues saturate? Because retry storms amplified downstream connection hold times.`,
        `Why did retry storms trigger? Because ${deployEntry ? 'the recent deploy changed pool backoff parameters' : 'an upstream carrier/dependency stalled responses'}.`,
        `Why was the regression not caught in pre-prod? Because synthetic load did not mirror ${regList} burst traffic.`,
        `Why was burst traffic missing from pre-prod? Because regional shadow-traffic replay was not enabled for ${svcList}.`,
      ],
    },
    actions: [
      {
        id: rid('act'),
        title: `Add automated canary rollback gate for ${inc.services[0] ?? 'platform'} p95 latency`,
        ownerId: inc.roles.ops ?? 'u-lucas',
        due: new Date(now + 3 * DAY).toISOString().slice(0, 10),
        priority: 'P1',
        done: false,
      },
      {
        id: rid('act'),
        title: `Enable regional shadow-traffic replay in ${inc.regions[0] ?? 'eu-west-2'} staging`,
        ownerId: inc.roles.commander ?? 'u-omar',
        due: new Date(now + 5 * DAY).toISOString().slice(0, 10),
        priority: 'P2',
        done: false,
      },
      {
        id: rid('act'),
        title: `Codify one-click regional failover check into ${inc.services[0] ?? 'service'} runbook`,
        ownerId: authorId,
        due: new Date(now + 7 * DAY).toISOString().slice(0, 10),
        priority: 'P2',
        done: false,
      },
    ],
  };
}
