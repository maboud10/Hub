/**
 * DevHub ("Forge") — deterministic seed data relative to `now`.
 *
 * Shared storyline with Cloud Console + Incident Command:
 *  - 8 services across 4 regions (me-central-1, eu-west-2, ap-southeast-1, us-east-1)
 *  - ~40m ago Priya (`u-priya`) shipped `payments-svc v2.41.0` (PR #1842) to `eu-west-2`
 *  - Canary is auto-paused at 25% traffic by health-gate warnings (p95 820ms vs 240ms baseline)
 *  - INC-2047 (SEV2) is open; Lucas (`u-lucas`) opened hotfix PR #1847 to revert retry budget
 *  - Push protection caught leaked credentials on PR #1841 (`sec-find-1`) and #1849
 */
import { DAY, HOUR, MIN, REGIONS } from './engine';
import { buildPrs, hunk } from './seedPrs';
import type {
  ActivityEntry,
  ChangeWindow,
  CodeFile,
  CodeOwner,
  CommitItem,
  Deploy,
  DevExItem,
  DevHubData,
  FeatureFlag,
  FlakyTest,
  HealthReading,
  MergedPrStat,
  PipelineJob,
  PipelineRun,
  PullRequest,
  RegionId,
  Service,
  ServiceId,
} from './types';

export { buildPrs, hunk };
export const DEVHUB_DATA_VERSION = 2;

export function buildServices(): Service[] {
  return [
    {
      id: 'payments-svc',
      repo: 'helix/payments-svc',
      team: 'Payments',
      ownerId: 'u-priya',
      tier: 1,
      language: 'Go',
      description: 'Card acquiring, ledger postings, settlement batches and idempotent refunds.',
      regions: [...REGIONS],
      rotation: 'Payments On-Call',
      dependsOn: ['identity-svc'],
      scorecard: { coverage: 0.91, docs: true, runbook: true, slo: true, depsFreshness: 0.94, vulns: { critical: 0, high: 0, medium: 1 } },
      sloTarget: 99.95,
      baselineP95: 240,
      latencySloMs: 900,
      version: 'v2.41.0',
    },
    {
      id: 'identity-svc',
      repo: 'helix/identity-svc',
      team: 'Security & IAM',
      ownerId: 'u-ethan',
      tier: 1,
      language: 'Rust',
      description: 'Zero-trust session tokens, WebAuthn passkeys, SCIM provisioning and KMS envelope signing.',
      regions: [...REGIONS],
      rotation: 'Security On-Call',
      dependsOn: [],
      scorecard: { coverage: 0.95, docs: true, runbook: true, slo: true, depsFreshness: 0.97, vulns: { critical: 0, high: 0, medium: 0 } },
      sloTarget: 99.99,
      baselineP95: 48,
      latencySloMs: 160,
      version: 'v3.14.2',
    },
    {
      id: 'hub-web',
      repo: 'helix/hub-web',
      team: 'Platform',
      ownerId: 'u-omar',
      tier: 1,
      language: 'TypeScript',
      description: 'NEXUS workspace shell, Launchpad widgets, command palette and bilingual RTL engine.',
      regions: [...REGIONS],
      rotation: 'Platform Primary',
      dependsOn: ['identity-svc', 'search-svc', 'notifications-svc'],
      scorecard: { coverage: 0.86, docs: true, runbook: true, slo: true, depsFreshness: 0.9, vulns: { critical: 0, high: 0, medium: 2 } },
      sloTarget: 99.95,
      baselineP95: 120,
      latencySloMs: 360,
      version: 'v5.18.4',
    },
    {
      id: 'mail-api',
      repo: 'helix/mail-api',
      team: 'Comms',
      ownerId: 'u-priya',
      tier: 1,
      language: 'Go',
      description: 'Nova Inbox triage pipeline, trust-radar screener, DLP outbound gateway and SMTP relay.',
      regions: [...REGIONS],
      rotation: 'Platform Primary',
      dependsOn: ['identity-svc', 'notifications-svc'],
      scorecard: { coverage: 0.89, docs: true, runbook: true, slo: true, depsFreshness: 0.88, vulns: { critical: 0, high: 1, medium: 1 } },
      sloTarget: 99.95,
      baselineP95: 185,
      latencySloMs: 480,
      version: 'v2.9.1',
    },
    {
      id: 'chat-realtime',
      repo: 'helix/chat-realtime',
      team: 'Comms',
      ownerId: 'u-lucas',
      tier: 1,
      language: 'Elixir',
      description: 'Low-latency channel fan-out, presence diffing, typing state and HoloMeet signaling.',
      regions: [...REGIONS],
      rotation: 'Platform Primary',
      dependsOn: ['identity-svc'],
      scorecard: { coverage: 0.92, docs: true, runbook: true, slo: true, depsFreshness: 0.93, vulns: { critical: 0, high: 0, medium: 0 } },
      sloTarget: 99.95,
      baselineP95: 62,
      latencySloMs: 220,
      version: 'v4.6.0',
    },
    {
      id: 'search-svc',
      repo: 'helix/search-svc',
      team: 'Data & Search',
      ownerId: 'u-kwame',
      tier: 2,
      language: 'Kotlin',
      description: 'Cross-app semantic + lexical indexing with Arabic morphology and permission-aware ranking.',
      regions: ['me-central-1', 'eu-west-2', 'ap-southeast-1'],
      rotation: 'Platform Primary',
      dependsOn: ['identity-svc'],
      scorecard: { coverage: 0.83, docs: true, runbook: false, slo: true, depsFreshness: 0.85, vulns: { critical: 0, high: 0, medium: 2 } },
      sloTarget: 99.9,
      baselineP95: 140,
      latencySloMs: 420,
      version: 'v1.22.0',
    },
    {
      id: 'notifications-svc',
      repo: 'helix/notifications-svc',
      team: 'Platform',
      ownerId: 'u-lucas',
      tier: 2,
      language: 'TypeScript',
      description: 'Quiet-hours aware push fan-out, token-bucket rate smoothing and webhook delivery.',
      regions: [...REGIONS],
      rotation: 'Platform Primary',
      dependsOn: ['identity-svc'],
      scorecard: { coverage: 0.88, docs: true, runbook: true, slo: true, depsFreshness: 0.91, vulns: { critical: 0, high: 0, medium: 1 } },
      sloTarget: 99.9,
      baselineP95: 95,
      latencySloMs: 310,
      version: 'v2.11.3',
    },
    {
      id: 'data-pipeline',
      repo: 'helix/data-pipeline',
      team: 'Data & Search',
      ownerId: 'u-kwame',
      tier: 3,
      language: 'Python',
      description: 'Regional event partitioning, FinOps ledger snapshots and DORA warehouse ingestion.',
      regions: ['me-central-1', 'eu-west-2'],
      rotation: 'Data Platform',
      dependsOn: ['payments-svc'],
      scorecard: { coverage: 0.76, docs: false, runbook: true, slo: false, depsFreshness: 0.79, vulns: { critical: 0, high: 1, medium: 3 } },
      sloTarget: 99.5,
      baselineP95: 420,
      latencySloMs: 1200,
      version: 'v1.8.7',
    },
  ];
}

export function buildOwners(): CodeOwner[] {
  return [
    { prefix: 'payments-svc/internal/charge', owners: [{ userId: 'u-priya', share: 0.65 }, { userId: 'u-lucas', share: 0.35 }] },
    { prefix: 'payments-svc/internal/refunds', owners: [{ userId: 'u-priya', share: 0.6 }, { userId: 'u-kwame', share: 0.4 }] },
    { prefix: 'payments-svc/config', owners: [{ userId: 'u-lucas', share: 0.6 }, { userId: 'u-omar', share: 0.4 }] },
    { prefix: 'payments-svc', owners: [{ userId: 'u-priya', share: 0.55 }, { userId: 'u-lucas', share: 0.25 }, { userId: 'u-omar', share: 0.2 }] },
    { prefix: 'identity-svc/src/session', owners: [{ userId: 'u-ethan', share: 0.6 }, { userId: 'u-layla', share: 0.4 }] },
    { prefix: 'identity-svc', owners: [{ userId: 'u-ethan', share: 0.55 }, { userId: 'u-priya', share: 0.25 }, { userId: 'u-layla', share: 0.2 }] },
    { prefix: 'hub-web/src/widgets', owners: [{ userId: 'u-omar', share: 0.55 }, { userId: 'u-priya', share: 0.45 }] },
    { prefix: 'hub-web', owners: [{ userId: 'u-omar', share: 0.6 }, { userId: 'u-alex', share: 0.25 }, { userId: 'u-elena', share: 0.15 }] },
    { prefix: 'mail-api', owners: [{ userId: 'u-priya', share: 0.6 }, { userId: 'u-lucas', share: 0.4 }] },
    { prefix: 'chat-realtime', owners: [{ userId: 'u-lucas', share: 0.65 }, { userId: 'u-omar', share: 0.35 }] },
    { prefix: 'search-svc', owners: [{ userId: 'u-kwame', share: 0.65 }, { userId: 'u-priya', share: 0.35 }] },
    { prefix: 'notifications-svc', owners: [{ userId: 'u-lucas', share: 0.6 }, { userId: 'u-ethan', share: 0.4 }] },
    { prefix: 'data-pipeline', owners: [{ userId: 'u-kwame', share: 0.6 }, { userId: 'u-priya', share: 0.4 }] },
  ];
}

export function buildAllPrs(now: number): PullRequest[] {
  const ago = (mins: number) => now - mins * MIN;
  const base = buildPrs(now);
  const extra: PullRequest[] = [
    {
      id: 'pr-1841',
      number: 1841,
      repo: 'helix/payments-svc',
      service: 'payments-svc',
      title: 'Add webhook verifier for EU acquirer callbacks',
      body: 'Validates HMAC signatures on incoming acquirer settlement webhooks in eu-west-2.',
      authorId: 'u-priya',
      branch: 'feat/eu-webhook-hmac',
      base: 'main',
      state: 'open',
      createdAt: ago(190),
      updatedAt: ago(55),
      firstCommitAt: ago(240),
      reviewers: [
        { reviewerId: 'u-ethan', state: 'changes_requested', requestedAt: ago(185), at: ago(120) },
        { reviewerId: 'u-omar', state: 'pending', requestedAt: ago(185) },
      ],
      labels: ['payments', 'security'],
      files: [
        {
          path: 'internal/charge/webhook.go',
          lang: 'go',
          status: 'added',
          hunks: [
            hunk('h1841a', 0, 1, '', [
              '+package charge',
              '+func VerifyAcquirerHmac(payload []byte, sig string, secret string) bool {',
              '+\treturn hmacEqual(signSHA256(payload, secret), sig)',
              '+}',
            ]),
          ],
        },
        {
          path: 'config/regions/eu-west-2-webhooks.env',
          lang: 'env',
          status: 'added',
          hunks: [
            hunk('h1841b', 0, 1, '', [
              '+WEBHOOK_TOLERANCE_SEC=180',
              '+ACQUIRER_WEBHOOK_SECRET=whsec_live_9a8b7c6d5e4f3a2b1c0d9e8f4f2c',
            ]),
          ],
        },
      ],
      comments: [
        {
          id: 'c1841a',
          authorId: 'u-ethan',
          at: ago(120),
          body: 'Push protection flagged a live acquirer webhook secret in `eu-west-2-webhooks.env`. Rotate in Aegis Vault and inject via secret ref.',
          file: 'config/regions/eu-west-2-webhooks.env',
          line: 2,
        },
      ],
      checks: [
        { name: 'build', status: 'success', durationSec: 84, required: true },
        { name: 'unit-tests', status: 'success', durationSec: 172, required: true },
        { name: 'secret-scan', status: 'failure', durationSec: 11, required: true },
        { name: 'security-scan', status: 'failure', durationSec: 39, required: true },
      ],
      mentions: ['u-priya', 'u-ethan'],
      runId: 'run-9905',
      secret: {
        id: 'sec-find-1',
        file: 'config/regions/eu-west-2-webhooks.env',
        line: 2,
        kind: 'Acquirer live webhook secret',
        preview: 'whsec_live_9a8b••••••••••••4f2c',
        status: 'blocking',
      },
      nova: {
        en: 'Push protection blocked merge (`sec-find-1`): a live webhook signing secret is committed in plain text. Rotate the key in Vault and reference `vault://payments-svc/eu-west-2/webhook-secret`.',
        ar: 'منعت حماية الدفع الدمج (`sec-find-1`): تم إيداع سر توقيع ويبهوك حي كنص صريح. قم بتدوير المفتاح في الخزنة واستخدم مرجع الخزنة.',
      },
    },
    {
      id: 'pr-1835',
      number: 1835,
      repo: 'helix/hub-web',
      service: 'hub-web',
      title: 'Keyboard navigation for command palette groups',
      body: 'Arrow-key roving focus across Actions and Work groups in ⌘K palette.',
      authorId: 'u-omar',
      branch: 'a11y/palette-roving-focus',
      base: 'main',
      state: 'merged',
      createdAt: ago(38 * 60),
      updatedAt: ago(18 * 60),
      firstCommitAt: ago(44 * 60),
      reviewers: [{ reviewerId: 'u-priya', state: 'approved', requestedAt: ago(37 * 60), at: ago(20 * 60) }],
      labels: ['frontend', 'a11y'],
      files: [
        {
          path: 'src/components/CommandPalette.tsx',
          lang: 'tsx',
          status: 'modified',
          hunks: [hunk('h1835a', 42, 42, '', [' const nextIndex = (idx + dir + items.length) % items.length;', '+items[nextIndex]?.focus();'])],
        },
      ],
      comments: [],
      checks: [
        { name: 'build', status: 'success', durationSec: 92, required: true },
        { name: 'unit-tests', status: 'success', durationSec: 164, required: true },
      ],
      mentions: [],
      mergedAt: ago(18 * 60),
      deployedAt: ago(16 * 60),
    },
  ];
  return [...base, ...extra];
}

function makeJobs(opts: {
  build?: PipelineJob['status'];
  test?: PipelineJob['status'];
  scan?: PipelineJob['status'];
  pkg?: PipelineJob['status'];
  deploy?: PipelineJob['status'];
  failStage?: 'test' | 'scan';
  failLine?: string;
}): PipelineJob[] {
  const b = opts.build ?? 'success';
  const t = opts.test ?? 'success';
  const s = opts.scan ?? 'success';
  const p = opts.pkg ?? (t === 'failed' || s === 'failed' ? 'skipped' : 'success');
  const d = opts.deploy ?? (p === 'skipped' ? 'skipped' : 'success');
  return [
    {
      id: 'job-build',
      name: 'compile & typecheck',
      stage: 'build',
      status: b,
      startSec: 0,
      durationSec: 42,
      needs: [],
      cacheHit: true,
      log: [
        { t: 1, level: 'cmd', text: '$ forge build --cache=remote --target=linux-amd64' },
        { t: 9, level: 'info', text: 'Remote cache hit 89% (412/463 artifacts restored)' },
        { t: 41, level: 'ok', text: 'Build artifacts verified and signed (SLSA L3)' },
      ],
    },
    {
      id: 'job-test',
      name: 'unit & integration suite',
      stage: 'test',
      status: t,
      startSec: 42,
      durationSec: 68,
      needs: ['job-build'],
      cacheHit: true,
      log: [
        { t: 43, level: 'cmd', text: '$ forge test --race --coverage=out/cov.prof' },
        opts.failStage === 'test'
          ? { t: 98, level: 'error', text: opts.failLine ?? 'FAIL: TestLaunchpadTiles_SparklineAfterResize (timeout after 5000ms)' }
          : { t: 108, level: 'ok', text: 'PASS: 418 specs passed (coverage 91.4%)' },
      ],
    },
    {
      id: 'job-scan',
      name: 'SAST, SBOM & secret scan',
      stage: 'scan',
      status: s,
      startSec: 42,
      durationSec: 36,
      needs: ['job-build'],
      log: [
        { t: 44, level: 'cmd', text: '$ aegis-scan --secrets --sbom --policy=SEC-12' },
        opts.failStage === 'scan'
          ? { t: 72, level: 'error', text: opts.failLine ?? 'BLOCKED [sec-find-1]: High-entropy credential detected in env config' }
          : { t: 77, level: 'ok', text: '0 leaked secrets · 0 critical CVEs · SBOM attested' },
      ],
    },
    {
      id: 'job-pkg',
      name: 'OCI image & cosign',
      stage: 'package',
      status: p,
      startSec: 110,
      durationSec: 34,
      needs: ['job-test', 'job-scan'],
      cacheHit: true,
      log: [
        { t: 112, level: 'cmd', text: '$ cosign sign --key kms://helix-prod/oci-signing' },
        { t: 142, level: 'ok', text: 'Pushed ghcr.io/helix/service@sha256:9f3c2ab8e110' },
      ],
    },
    {
      id: 'job-deploy',
      name: 'staging + canary rollout',
      stage: 'deploy',
      status: d,
      startSec: 144,
      durationSec: 46,
      needs: ['job-pkg'],
      log: [
        { t: 146, level: 'cmd', text: '$ forge rollout --env=staging --canary=eu-west-2' },
        { t: 188, level: 'ok', text: 'Staging smoke green · Canary gate armed' },
      ],
    },
  ];
}

export function buildRuns(now: number): PipelineRun[] {
  const ago = (mins: number) => now - mins * MIN;
  return [
    {
      id: 'run-9921',
      number: 9921,
      service: 'payments-svc',
      branch: 'hotfix/inc-2047-retry-budget',
      sha: 'c41e90a',
      message: 'Revert retry budget to 2 attempts (INC-2047)',
      authorId: 'u-lucas',
      trigger: 'pull_request',
      prId: 'pr-1847',
      status: 'running',
      outcome: 'success',
      startedAt: now - 75_000,
      durationSec: 190,
      jobs: makeJobs({ build: 'success', test: 'running', scan: 'running', pkg: 'queued', deploy: 'queued' }),
      costUsd: 1.42,
      cacheHitPct: 92,
    },
    {
      id: 'run-9918',
      number: 9918,
      service: 'payments-svc',
      branch: 'main',
      sha: '9f3c2ab',
      message: 'Retry budget for card-network timeouts (#1842)',
      authorId: 'u-priya',
      trigger: 'push',
      prId: 'pr-1842',
      status: 'success',
      startedAt: ago(46),
      durationSec: 190,
      jobs: makeJobs({}),
      costUsd: 1.68,
      cacheHitPct: 89,
    },
    {
      id: 'run-9915',
      number: 9915,
      service: 'hub-web',
      branch: 'feat/launchpad-delivery-stream',
      sha: '7b2d19f',
      message: 'Delivery stream widget on Launchpad (#1851)',
      authorId: 'u-alex',
      trigger: 'pull_request',
      prId: 'pr-1851',
      status: 'failed',
      startedAt: ago(92),
      durationSec: 112,
      jobs: makeJobs({ test: 'failed', failStage: 'test', failLine: 'FAIL src/widgets/LaunchpadTiles.spec.tsx › renders sparkline after resize (flake R)' }),
      costUsd: 1.15,
      cacheHitPct: 84,
    },
    {
      id: 'run-9912',
      number: 9912,
      service: 'notifications-svc',
      branch: 'perf/fanout-token-bucket',
      sha: '3e91a4c',
      message: 'Batch push fan-out with token bucket (#1836)',
      authorId: 'u-lucas',
      trigger: 'merge_queue',
      prId: 'pr-1836',
      status: 'success',
      startedAt: ago(110),
      durationSec: 164,
      jobs: makeJobs({}),
      costUsd: 1.24,
      cacheHitPct: 94,
    },
    {
      id: 'run-9910',
      number: 9910,
      service: 'identity-svc',
      branch: 'sec/kms-envelope-keys',
      sha: '8d0f55b',
      message: 'Rotate session signing keys via KMS envelope (#1839)',
      authorId: 'u-ethan',
      trigger: 'pull_request',
      prId: 'pr-1839',
      status: 'success',
      startedAt: ago(140),
      durationSec: 205,
      jobs: makeJobs({}),
      costUsd: 1.95,
      cacheHitPct: 86,
    },
    {
      id: 'run-9908',
      number: 9908,
      service: 'data-pipeline',
      branch: 'data/ledger-snapshot-backfill',
      sha: '5a12c8e',
      message: 'Backfill job for ledger snapshots (#1833)',
      authorId: 'u-kwame',
      trigger: 'pull_request',
      prId: 'pr-1833',
      status: 'failed',
      startedAt: ago(210),
      durationSec: 96,
      jobs: makeJobs({ test: 'failed', failStage: 'test', failLine: 'FAIL migrations/0042_ledger_snapshots.sql: full-table lock exceeds 5000ms threshold' }),
      costUsd: 0.98,
      cacheHitPct: 78,
    },
    {
      id: 'run-9905',
      number: 9905,
      service: 'payments-svc',
      branch: 'feat/eu-webhook-hmac',
      sha: '1c77e3d',
      message: 'Add webhook verifier for EU acquirer callbacks (#1841)',
      authorId: 'u-priya',
      trigger: 'pull_request',
      prId: 'pr-1841',
      status: 'failed',
      startedAt: ago(225),
      durationSec: 82,
      jobs: makeJobs({ scan: 'failed', failStage: 'scan', failLine: 'BLOCKED [sec-find-1]: Acquirer live webhook secret in config/regions/eu-west-2-webhooks.env:2' }),
      costUsd: 0.88,
      cacheHitPct: 90,
    },
    {
      id: 'run-9902',
      number: 9902,
      service: 'search-svc',
      branch: 'search/arabic-normalizer',
      sha: '6f44b2a',
      message: 'Typo-tolerant ranking for Arabic queries (#1855)',
      authorId: 'u-kwame',
      trigger: 'pull_request',
      prId: 'pr-1855',
      status: 'success',
      startedAt: ago(260),
      durationSec: 178,
      jobs: makeJobs({}),
      costUsd: 1.54,
      cacheHitPct: 88,
    },
  ];
}

export function buildFlaky(now: number): FlakyTest[] {
  const ago = (mins: number) => now - mins * MIN;
  return [
    {
      id: 'flk-1',
      name: 'LaunchpadTiles › renders sparkline after resize',
      service: 'hub-web',
      file: 'src/widgets/LaunchpadTiles.spec.tsx',
      ownerId: 'u-omar',
      history: 'PPRPPPRPPRPRPPPRPPPR',
      lastFlakeAt: ago(92),
      quarantined: false,
    },
    {
      id: 'flk-2',
      name: 'TestAcquirerWebhookRetryJitter',
      service: 'payments-svc',
      file: 'internal/charge/retry_test.go',
      ownerId: 'u-priya',
      history: 'PPPPRPPPPPRPPPPPRPPP',
      lastFlakeAt: ago(320),
      quarantined: false,
    },
    {
      id: 'flk-3',
      name: 'PresenceDiffTest › fanout under 5k sockets',
      service: 'chat-realtime',
      file: 'test/presence/diff_test.exs',
      ownerId: 'u-lucas',
      history: 'PPPRPPRPPPPPPPPRPPPP',
      lastFlakeAt: ago(540),
      quarantined: true,
    },
  ];
}

export function buildDeploys(now: number): Deploy[] {
  const ago = (mins: number) => now - mins * MIN;
  const base: Deploy[] = [
    {
      id: 'dep-pay-2410-euw2',
      service: 'payments-svc',
      version: 'v2.41.0',
      sha: '9f3c2ab',
      env: 'production',
      region: 'eu-west-2',
      status: 'in_progress',
      authorId: 'u-priya',
      at: ago(40),
      prId: 'pr-1842',
      prNumber: 1842,
      note: 'Canary held at 25% — eu-west-2 p95 latency 820ms (3.4× baseline)',
      canary: {
        step: 2,
        paused: true,
        autoPaused: true,
        startedAt: ago(40),
        stepAt: ago(28),
        history: [
          { step: 0, at: ago(40), by: 'u-priya', note: 'Canary started at 1% traffic' },
          { step: 1, at: ago(35), by: 'u-priya', note: 'Promoted to 5%' },
          { step: 2, at: ago(28), by: 'u-priya', note: 'Auto-paused at 25% — latency gate warning (820ms p95)' },
        ],
      },
    },
    {
      id: 'dep-pay-2410-stg',
      service: 'payments-svc',
      version: 'v2.41.0',
      sha: '9f3c2ab',
      env: 'staging',
      region: 'eu-west-2',
      status: 'success',
      authorId: 'u-priya',
      at: ago(58),
      finishedAt: ago(52),
      prId: 'pr-1842',
      prNumber: 1842,
    },
    {
      id: 'dep-pay-2403-euw2',
      service: 'payments-svc',
      version: 'v2.40.3',
      sha: '4a8b11e',
      env: 'production',
      region: 'eu-west-2',
      status: 'success',
      authorId: 'u-lucas',
      at: ago(26 * 60),
      finishedAt: ago(25.5 * 60),
    },
    {
      id: 'dep-pay-2403-mec1',
      service: 'payments-svc',
      version: 'v2.40.3',
      sha: '4a8b11e',
      env: 'production',
      region: 'me-central-1',
      status: 'success',
      authorId: 'u-lucas',
      at: ago(26 * 60),
      finishedAt: ago(25.5 * 60),
    },
    {
      id: 'dep-hub-5184-mec1',
      service: 'hub-web',
      version: 'v5.18.4',
      sha: 'e12a94c',
      env: 'production',
      region: 'me-central-1',
      status: 'success',
      authorId: 'u-omar',
      at: ago(16 * 60),
      finishedAt: ago(15.7 * 60),
      prId: 'pr-1835',
      prNumber: 1835,
    },
    {
      id: 'dep-chat-460-euw2',
      service: 'chat-realtime',
      version: 'v4.6.0',
      sha: 'b04d82e',
      env: 'production',
      region: 'eu-west-2',
      status: 'success',
      authorId: 'u-lucas',
      at: ago(25 * 60),
      finishedAt: ago(24.6 * 60),
      prId: 'pr-1844',
      prNumber: 1844,
    },
    {
      id: 'dep-id-3142-mec1',
      service: 'identity-svc',
      version: 'v3.14.2',
      sha: '7c99f10',
      env: 'production',
      region: 'me-central-1',
      status: 'success',
      authorId: 'u-ethan',
      at: ago(48 * 60),
      finishedAt: ago(47.5 * 60),
      prId: 'pr-1830',
      prNumber: 1830,
    },
    {
      id: 'dep-notif-2113-stg',
      service: 'notifications-svc',
      version: 'v2.11.4-rc1',
      sha: '3e91a4c',
      env: 'staging',
      region: 'me-central-1',
      status: 'success',
      authorId: 'u-lucas',
      at: ago(95),
      finishedAt: ago(90),
      prId: 'pr-1836',
      prNumber: 1836,
    },
  ];

  // Historical 14-day production cadence for DORA & sparklines
  const histServices: { svc: ServiceId; ver: string; author: string; reg: RegionId }[] = [
    { svc: 'hub-web', ver: 'v5.18.3', author: 'u-omar', reg: 'me-central-1' },
    { svc: 'mail-api', ver: 'v2.9.1', author: 'u-priya', reg: 'eu-west-2' },
    { svc: 'search-svc', ver: 'v1.22.0', author: 'u-kwame', reg: 'me-central-1' },
    { svc: 'notifications-svc', ver: 'v2.11.3', author: 'u-lucas', reg: 'ap-southeast-1' },
    { svc: 'identity-svc', ver: 'v3.14.1', author: 'u-ethan', reg: 'us-east-1' },
    { svc: 'payments-svc', ver: 'v2.40.2', author: 'u-priya', reg: 'me-central-1' },
  ];
  for (let d = 1; d <= 13; d++) {
    const pick = histServices[d % histServices.length];
    const at = now - d * DAY - (d % 4) * HOUR;
    base.push({
      id: `dep-hist-${d}`,
      service: pick.svc,
      version: pick.ver,
      sha: `a${d}9f0${d}b`,
      env: 'production',
      region: pick.reg,
      status: 'success',
      authorId: pick.author,
      at,
      finishedAt: at + 12 * MIN,
    });
  }
  return base;
}

export function buildHealth(): HealthReading[] {
  const services = buildServices();
  const out: HealthReading[] = [];
  for (const s of services) {
    for (const r of s.regions) {
      if (s.id === 'payments-svc' && r === 'eu-west-2') {
        out.push({ service: s.id, region: r, status: 'degraded', latencyMs: 820, errorRate: 0.023, saturation: 0.78 });
      } else {
        out.push({
          service: s.id,
          region: r,
          status: 'healthy',
          latencyMs: s.baselineP95 + (r === 'us-east-1' ? 12 : 4),
          errorRate: 0.002,
          saturation: 0.48,
        });
      }
    }
  }
  return out;
}

export function buildCanarySeries(): Record<string, { latency: number[]; errors: number[] }> {
  return {
    'dep-pay-2410-euw2': {
      latency: [238, 244, 252, 310, 465, 610, 740, 805, 820, 818, 824, 820],
      errors: [0.002, 0.003, 0.003, 0.006, 0.011, 0.016, 0.019, 0.022, 0.023, 0.022, 0.023, 0.023],
    },
  };
}

export function buildFlags(now: number): FeatureFlag[] {
  const ago = (mins: number) => now - mins * MIN;
  return [
    {
      key: 'payments.eu_acquirer_retry_v2',
      description: 'Jittered 5-attempt exponential retry policy for EU card acquirers.',
      service: 'payments-svc',
      ownerId: 'u-priya',
      enabled: { preview: true, staging: true, production: true },
      rollout: { preview: 100, staging: 100, production: 25 },
      updatedAt: ago(40),
      updatedBy: 'u-priya',
    },
    {
      key: 'identity.kms_envelope_rotation',
      description: 'Versioned session signing keys wrapped via KMS data keys.',
      service: 'identity-svc',
      ownerId: 'u-ethan',
      enabled: { preview: true, staging: true, production: false },
      rollout: { preview: 100, staging: 50, production: 0 },
      updatedAt: ago(140),
      updatedBy: 'u-ethan',
    },
    {
      key: 'hub.launchpad_delivery_stream',
      description: 'Show live Forge delivery stream widget on Launchpad home.',
      service: 'hub-web',
      ownerId: 'u-omar',
      enabled: { preview: true, staging: false, production: false },
      rollout: { preview: 100, staging: 0, production: 0 },
      updatedAt: ago(95),
      updatedBy: 'u-alex',
    },
    {
      key: 'notifications.wellbeing_quiet_hours',
      description: 'Hold non-urgent push notifications during Wellbeing quiet hours.',
      service: 'notifications-svc',
      ownerId: 'u-lucas',
      enabled: { preview: true, staging: true, production: true },
      rollout: { preview: 100, staging: 100, production: 100 },
      updatedAt: ago(360),
      updatedBy: 'u-lucas',
    },
  ];
}

export function buildWindows(now: number): ChangeWindow[] {
  return [
    {
      id: 'win-1',
      title: 'EU peak checkout guard window',
      kind: 'release',
      start: now - 60 * MIN,
      end: now + 120 * MIN,
      services: ['payments-svc', 'identity-svc'],
      note: 'Requires canary health gates green at 1%, 5%, 25% before full rollout.',
    },
    {
      id: 'win-2',
      title: 'GCC weekend ledger maintenance',
      kind: 'maintenance',
      start: now + 2 * DAY,
      end: now + 2 * DAY + 3 * HOUR,
      services: ['data-pipeline', 'payments-svc'],
      note: 'Scheduled snapshot compaction in me-central-1.',
    },
  ];
}

export function buildFiles(): CodeFile[] {
  return [
    {
      repo: 'helix/payments-svc',
      service: 'payments-svc',
      path: 'internal/charge/retry.go',
      lang: 'go',
      lines: [
        'package charge',
        '',
        'import "time"',
        '',
        'type RetryPolicy struct {',
        '\tMaxAttempts int',
        '\tBackoff     time.Duration',
        '\tJitter      float64',
        '}',
        '',
        'var DefaultRetry = RetryPolicy{',
        '\tMaxAttempts: 5,',
        '\tBackoff:     250 * time.Millisecond,',
        '\tJitter:      0.2,',
        '}',
        '',
        'func (p RetryPolicy) Next(attempt int) time.Duration {',
        '\td := p.Backoff * time.Duration(1<<attempt)',
        '\treturn withJitter(d, p.Jitter)',
        '}',
      ],
      symbols: [
        { name: 'RetryPolicy', kind: 'type', line: 5 },
        { name: 'DefaultRetry', kind: 'const', line: 11 },
        { name: 'Next', kind: 'function', line: 17 },
      ],
    },
    {
      repo: 'helix/identity-svc',
      service: 'identity-svc',
      path: 'src/session/keys.rs',
      lang: 'rs',
      lines: [
        'use std::time::Duration;',
        'use crate::crypto::envelope::KmsEnvelope;',
        '',
        'pub struct SigningKey {',
        '    pub version: u32,',
        '    pub wrapped: Vec<u8>,',
        '    pub not_after: u64,',
        '}',
        '',
        'pub async fn rotate_signing_keys(kms: &KmsEnvelope) -> Result<SigningKey, KeyError> {',
        '    let ttl = Duration::from_secs(86400 * 30);',
        '    let next = kms.generate_data_key("session-signing").await?;',
        '    Ok(next.into())',
        '}',
      ],
      symbols: [
        { name: 'SigningKey', kind: 'type', line: 4 },
        { name: 'rotate_signing_keys', kind: 'function', line: 10 },
      ],
    },
    {
      repo: 'helix/search-svc',
      service: 'search-svc',
      path: 'src/main/kotlin/ranking/ArabicNormalizer.kt',
      lang: 'kt',
      lines: [
        'package ranking',
        '',
        'object ArabicNormalizer {',
        '    private val alef = Regex("[إأآا]")',
        '    fun normalize(q: String): String = q.replace(alef, "ا").replace("ة", "ه").replace("ـ", "").lowercase()',
        '}',
      ],
      symbols: [
        { name: 'ArabicNormalizer', kind: 'class', line: 3 },
        { name: 'normalize', kind: 'function', line: 5 },
      ],
    },
  ];
}

export function buildMerged(now: number): MergedPrStat[] {
  const items: MergedPrStat[] = [];
  const authors = ['u-priya', 'u-lucas', 'u-omar', 'u-ethan', 'u-kwame'];
  const services: ServiceId[] = ['payments-svc', 'hub-web', 'chat-realtime', 'identity-svc', 'search-svc', 'notifications-svc'];
  for (let i = 0; i < 16; i++) {
    const deployedAt = now - (i + 1) * 1.5 * DAY;
    const mergedAt = deployedAt - 1.2 * HOUR;
    const approvedAt = mergedAt - 0.8 * HOUR;
    const firstReviewAt = approvedAt - 2.4 * HOUR;
    const openedAt = firstReviewAt - 1.8 * HOUR;
    const firstCommitAt = openedAt - 3.2 * HOUR;
    const authorId = authors[i % authors.length];
    const r1 = authors[(i + 1) % authors.length];
    const r2 = authors[(i + 2) % authors.length];
    items.push({
      id: `m-${1820 - i}`,
      number: 1820 - i,
      service: services[i % services.length],
      title: `Release change #${1820 - i}`,
      authorId,
      reviewerIds: [r1, r2],
      firstCommitAt,
      openedAt,
      firstReviewAt,
      approvedAt,
      mergedAt,
      deployedAt,
      size: 60 + (i % 5) * 45,
    });
  }
  return items;
}

export function buildDevEx(): DevExItem[] {
  return [
    { id: 'dx-ci', question: 'CI feedback arrives fast enough to keep me in flow', score: 82, trend: 4 },
    { id: 'dx-rev', question: 'Code reviews are constructive and picked up within SLA', score: 78, trend: 2 },
    { id: 'dx-dep', question: 'Deploying and rolling back production changes feels safe', score: 91, trend: 6 },
    { id: 'dx-doc', question: 'Service runbooks and ownership are easy to find', score: 85, trend: 3 },
  ];
}

export function buildCommits(now: number): CommitItem[] {
  const ago = (mins: number) => now - mins * MIN;
  return [
    { sha: 'c41e90a', service: 'payments-svc', repo: 'helix/payments-svc', branch: 'hotfix/inc-2047-retry-budget', message: 'fix(charge): revert MaxAttempts to 2 and Backoff to 50ms (INC-2047)', authorId: 'u-lucas', at: ago(12), prNumber: 1847 },
    { sha: '9f3c2ab', service: 'payments-svc', repo: 'helix/payments-svc', branch: 'main', message: 'feat(charge): retry budget for EU card-network timeouts (#1842)', authorId: 'u-priya', at: ago(46), prNumber: 1842 },
    { sha: '1c77e3d', service: 'payments-svc', repo: 'helix/payments-svc', branch: 'feat/eu-webhook-hmac', message: 'feat(webhooks): verify EU acquirer HMAC signatures (#1841)', authorId: 'u-priya', at: ago(190), prNumber: 1841 },
    { sha: '8d0f55b', service: 'identity-svc', repo: 'helix/identity-svc', branch: 'sec/kms-envelope-keys', message: 'sec(session): wrap JWT signing keys in KMS envelope (#1839)', authorId: 'u-ethan', at: ago(140), prNumber: 1839 },
    { sha: '3e91a4c', service: 'notifications-svc', repo: 'helix/notifications-svc', branch: 'perf/fanout-token-bucket', message: 'perf(fanout): smooth tenant push bursts with token bucket (#1836)', authorId: 'u-lucas', at: ago(110), prNumber: 1836 },
    { sha: 'e12a94c', service: 'hub-web', repo: 'helix/hub-web', branch: 'main', message: 'a11y(palette): roving keyboard focus across groups (#1835)', authorId: 'u-omar', at: ago(18 * 60), prNumber: 1835 },
  ];
}

export function buildDevHubSeed(now = Date.now()): DevHubData {
  const ago = (mins: number) => now - mins * MIN;
  const activity: ActivityEntry[] = [
    { id: 'act-1', at: ago(12), actorId: 'u-lucas', kind: 'review', text: 'Opened hotfix PR #1847 to revert eu-west-2 retry budget (INC-2047)', to: '/devhub/reviews?pr=pr-1847' },
    { id: 'act-2', at: ago(28), actorId: 'u-priya', kind: 'deploy', text: 'Canary payments-svc v2.41.0 auto-paused at 25% in eu-west-2 (latency gate)', to: '/devhub/deploys?deploy=dep-pay-2410-euw2' },
    { id: 'act-3', at: ago(40), actorId: 'u-priya', kind: 'deploy', text: 'Started production canary for payments-svc v2.41.0 in eu-west-2', to: '/devhub/deploys?deploy=dep-pay-2410-euw2' },
    { id: 'act-4', at: ago(55), actorId: 'u-ethan', kind: 'secret', text: 'Push protection blocked PR #1841 on secret finding sec-find-1', to: '/devhub/reviews?pr=pr-1841' },
  ];
  return {
    version: DEVHUB_DATA_VERSION,
    seededAt: now,
    services: buildServices(),
    owners: buildOwners(),
    prs: buildAllPrs(now),
    runs: buildRuns(now),
    flaky: buildFlaky(now),
    deploys: buildDeploys(now),
    freeze: { frozen: false, reason: '', setBy: 'u-omar', at: ago(180) },
    windows: buildWindows(now),
    flags: buildFlags(now),
    health: buildHealth(),
    canarySeries: buildCanarySeries(),
    files: buildFiles(),
    merged: buildMerged(now),
    devex: buildDevEx(),
    devexVotes: {},
    wizard: null,
    activity,
    nextPr: 1862,
    nextRun: 9922,
  };
}

const SNAPSHOT_NOW = Date.now();
export const SEED_SERVICES = buildServices();
export const SEED_PRS = buildAllPrs(SNAPSHOT_NOW);
export const SEED_PIPELINES = buildRuns(SNAPSHOT_NOW);
export const SEED_DEPLOYS = buildDeploys(SNAPSHOT_NOW);
export const SEED_COMMITS = buildCommits(SNAPSHOT_NOW);
