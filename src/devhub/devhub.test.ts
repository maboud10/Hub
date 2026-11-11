import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeViewer } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { capabilitiesFor } from './access';
import {
  aggregateJobs,
  canaryDecision,
  canPromote,
  cycleBreakdown,
  dependents,
  detectFlaky,
  doraMetrics,
  effectiveFreeze,
  evaluateGates,
  gateVerdict,
  liveRun,
  prStage,
  promoteDeploy,
  reviewLoad,
  reviewQueue,
  reviewSla,
  riskScore,
  rollbackDeploy,
  rollbackTarget,
  scorecardGrade,
  searchCode,
  suggestReviewers,
  tokenize,
} from './engine';
import { api } from './public';
import { buildDevHubSeed, SEED_COMMITS, SEED_DEPLOYS, SEED_PIPELINES, SEED_PRS, SEED_SERVICES } from './seed';
import { useDevHub } from './store';

function viewerFor(userId: string, perms: string[]): BridgeViewer {
  const user = useHub.getState().users.find((u) => u.id === userId) ?? useHub.getState().users[0];
  return { user, roles: useHub.getState().roles, perms: new Set(perms) };
}

describe('DevHub ("Forge") — engine, store & bridge', () => {
  beforeEach(() => {
    useDevHub.getState().resetDemo();
  });

  it('1. seeds the shared storyline: payments-svc v2.41.0 by u-priya ~40m ago in eu-west-2 + PRs #1842..#1835 + sec-find-1 on #1841', () => {
    const seed = buildDevHubSeed(1_700_000_000_000);
    expect(SEED_SERVICES.length).toBeGreaterThanOrEqual(8);
    expect(SEED_PIPELINES.length).toBeGreaterThanOrEqual(8);
    expect(SEED_DEPLOYS.length).toBeGreaterThanOrEqual(8);
    expect(SEED_COMMITS.length).toBeGreaterThanOrEqual(5);
    expect(SEED_PRS.some((p) => p.number === 1842)).toBe(true);
    expect(SEED_PRS.some((p) => p.number === 1835)).toBe(true);

    const canary = seed.deploys.find((d) => d.id === 'dep-pay-2410-euw2');
    expect(canary).toBeDefined();
    expect(canary?.service).toBe('payments-svc');
    expect(canary?.version).toBe('v2.41.0');
    expect(canary?.authorId).toBe('u-priya');
    expect(canary?.region).toBe('eu-west-2');
    expect(canary?.status).toBe('in_progress');

    const pr1841 = seed.prs.find((p) => p.number === 1841);
    expect(pr1841?.secret?.id).toBe('sec-find-1');
    expect(pr1841?.secret?.status).toBe('blocking');
  });

  it('2. computes explainable PR risk scores across size, hot paths, migrations, security & secret findings', () => {
    const seed = useDevHub.getState();
    const svcPay = seed.services.find((s) => s.id === 'payments-svc');
    const pr1842 = seed.prs.find((p) => p.number === 1842)!;
    const r1842 = riskScore(pr1842, svcPay);
    expect(r1842.score).toBeGreaterThanOrEqual(20);
    expect(r1842.factors.some((f) => f.key === 'hot')).toBe(true);
    expect(r1842.factors.some((f) => f.key === 'tier')).toBe(true);

    const pr1841 = seed.prs.find((p) => p.number === 1841)!;
    const r1841 = riskScore(pr1841, svcPay);
    expect(r1841.factors.some((f) => f.key === 'secret' && f.points === 30)).toBe(true);
    expect(r1841.score).toBeGreaterThan(r1842.score);
  });

  it('3. suggests reviewers from CODEOWNERS longest prefix with review-load penalty', () => {
    const seed = useDevHub.getState();
    const pr1847 = seed.prs.find((p) => p.number === 1847)!;
    const suggestions = suggestReviewers(pr1847, seed.owners, { 'u-priya': 4, 'u-omar': 0 });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.userId !== pr1847.authorId)).toBe(true);
    expect(suggestions[0].userId).toBe('u-priya');
  });

  it('4. calculates review queue, SLA states (hotfix 30m vs tier-1 4h) and PR tracker stages', () => {
    const seed = useDevHub.getState();
    const priyaQueue = reviewQueue(seed.prs, 'u-priya');
    expect(priyaQueue.some((p) => p.number === 1847)).toBe(true);

    const pr1847 = seed.prs.find((p) => p.number === 1847)!;
    const sla = reviewSla(pr1847, pr1847.reviewers[0], 1, seed.seededAt);
    expect(sla.slaMins).toBe(30);
    expect(sla.state).toBe('ok');

    const pr1841 = seed.prs.find((p) => p.number === 1841)!;
    expect(prStage(pr1841).state).toBe('blocked');
    const pr1836 = seed.prs.find((p) => p.number === 1836)!;
    expect(prStage(pr1836)).toEqual({ current: 4, state: 'active' });
  });

  it('5. aggregates pipeline jobs, projects live runs, and distinguishes flaky from broken tests', () => {
    const seed = useDevHub.getState();
    const running = seed.runs.find((r) => r.id === 'run-9921')!;
    expect(aggregateJobs(running.jobs)).toBe('running');

    const projected = liveRun(running, running.startedAt + 50_000);
    expect(projected.progress).toBeGreaterThan(0.2);
    expect(projected.activeStage).toBe('test');

    const finished = liveRun(running, running.startedAt + 250_000);
    expect(finished.run.status).toBe('success');

    const flakes = detectFlaky(seed.flaky);
    expect(flakes.length).toBeGreaterThanOrEqual(2);
    expect(flakes[0].flaky).toBe(true);
  });

  it('6. evaluates canary health gates on payments-svc v2.41.0 in eu-west-2', () => {
    const seed = useDevHub.getState();
    const svc = seed.services.find((s) => s.id === 'payments-svc')!;
    const reading = seed.health.find((h) => h.service === 'payments-svc' && h.region === 'eu-west-2')!;
    const gates = evaluateGates(reading, svc);
    expect(gates).toHaveLength(3);
    expect(gateVerdict(gates)).toBe('warn');
    expect(canaryDecision(gates)).toBe('hold');
  });

  it('7. enforces freeze and gate rules on canary promotion and supports override', () => {
    const seed = useDevHub.getState();
    const dep = seed.deploys.find((d) => d.id === 'dep-pay-2410-euw2')!;

    expect(canPromote(dep, { blockingFreeze: true, verdict: 'pass' })).toEqual({ ok: false, code: 'frozen' });
    expect(canPromote(dep, { blockingFreeze: false, verdict: 'fail' })).toEqual({ ok: false, code: 'gate-fail' });
    expect(canPromote(dep, { blockingFreeze: false, verdict: 'warn', override: false })).toEqual({ ok: false, code: 'gate-warn' });
    expect(canPromote(dep, { blockingFreeze: false, verdict: 'warn', override: true })).toEqual({ ok: true });

    const promoted = promoteDeploy(dep, 'u-priya', seed.seededAt + 60_000, 'Manual promote');
    expect(promoted.canary?.step).toBe(3);
  });

  it('8. computes effective freeze from manual freeze or SEV1/SEV2 incidents', () => {
    const manual = { frozen: false, reason: '', setBy: 'u-omar', at: 1000 };
    const sev2 = [
      {
        id: 'inc-1',
        code: 'INC-2047',
        title: 'Elevated payment latency in EU',
        severity: 'SEV2' as const,
        status: 'mitigating' as const,
        services: ['payments-svc'],
        startedAt: 900,
        to: '/incidents',
      },
    ];
    const effSev2 = effectiveFreeze(manual, sev2);
    expect(effSev2.advisory).toBe(true);
    expect(effSev2.blocking).toBe(false);

    const effManual = effectiveFreeze({ ...manual, frozen: true, reason: 'SEV1 lock' }, sev2);
    expect(effManual.blocking).toBe(true);
    expect(effManual.frozen).toBe(true);
  });

  it('9. finds rollback target v2.40.3 and executes 1-click rollback restoring service health', () => {
    const seed = useDevHub.getState();
    const bad = seed.deploys.find((d) => d.id === 'dep-pay-2410-euw2')!;
    const target = rollbackTarget(seed.deploys, bad);
    expect(target?.version).toBe('v2.40.3');

    const pureRb = rollbackDeploy(seed.deploys, 'dep-pay-2410-euw2', 'u-lucas', seed.seededAt + 10_000);
    expect(pureRb?.rollback.version).toBe('v2.40.3');

    const rb = useDevHub.getState().rollback('dep-pay-2410-euw2', 'u-lucas');
    expect(rb).not.toBeNull();
    expect(rb?.version).toBe('v2.40.3');
    expect(rb?.status).toBe('rolled_back');

    const after = useDevHub.getState();
    const updatedBad = after.deploys.find((d) => d.id === 'dep-pay-2410-euw2');
    expect(updatedBad?.status).toBe('failed');
    expect(updatedBad?.rolledBackBy).toBe(rb?.id);

    const restoredHealth = after.health.find((h) => h.service === 'payments-svc' && h.region === 'eu-west-2');
    expect(restoredHealth?.status).toBe('healthy');
  });

  it('10. computes DORA metrics, cycle breakdown, review load, scorecards, code search & tokenizer', () => {
    const seed = useDevHub.getState();
    const dora = doraMetrics({ deploys: seed.deploys, merged: seed.merged, now: seed.seededAt });
    expect(dora.deployFreq.total).toBeGreaterThan(5);
    expect(dora.leadTime.hours).toBeGreaterThan(0);

    const cycle = cycleBreakdown(seed.merged, seed.seededAt);
    expect(cycle.total).toBeGreaterThan(0);
    expect(cycle.weeks).toHaveLength(4);

    const load = reviewLoad(seed.merged, seed.prs, ['u-priya', 'u-lucas', 'u-omar', 'u-ethan'], seed.seededAt);
    expect(load.rows).toHaveLength(4);

    const grade = scorecardGrade(seed.services[0].scorecard);
    expect(grade.score).toBeGreaterThan(80);
    expect(dependents(seed.services, 'identity-svc')).toContain('payments-svc');

    const hits = searchCode(seed.files, 'lang:go RetryPolicy');
    expect(hits.length).toBeGreaterThan(0);
    expect(tokenize('func Next(attempt int)', 'go').some((t) => t.k === 'kw' && t.v === 'func')).toBe(true);
  });

  it('11. store review actions: submitReview, addComment, applySuggestion', () => {
    useDevHub.getState().submitReview('pr-1847', 'u-priya', 'approved', 'LGTM — ship the revert');
    const pr = useDevHub.getState().prs.find((p) => p.id === 'pr-1847')!;
    expect(pr.state).toBe('approved');
    expect(pr.reviewers.find((r) => r.reviewerId === 'u-priya')?.state).toBe('approved');

    const applied = useDevHub.getState().applySuggestion('pr-1839', 'c1839n', 'u-ethan');
    expect(applied).toBe(true);
    const pr1839 = useDevHub.getState().prs.find((p) => p.id === 'pr-1839')!;
    expect(pr1839.comments.find((c) => c.id === 'c1839n')?.applied).toBe(true);
  });

  it('12. blocks queueing/merging PR #1841 until secret finding sec-find-1 is rotated', () => {
    const blocked = useDevHub.getState().enqueuePr('pr-1841', 'u-priya');
    expect(blocked.ok).toBe(false);

    useDevHub.getState().updateSecretStatus('pr-1841', { status: 'rotated', requestTo: '/vault/secrets' }, 'u-priya');
    const queued = useDevHub.getState().enqueuePr('pr-1841', 'u-priya');
    expect(queued.ok).toBe(true);

    const merged = useDevHub.getState().mergePr('pr-1841', 'u-priya');
    expect(merged.ok).toBe(true);
    expect(useDevHub.getState().prs.find((p) => p.id === 'pr-1841')?.state).toBe('merged');
  });

  it('13. store pipeline & golden-path wizard actions work end-to-end', () => {
    const retried = useDevHub.getState().retryRun('run-9915', 'u-alex');
    expect(retried?.status).toBe('success');
    const pr1851 = useDevHub.getState().prs.find((p) => p.id === 'pr-1851')!;
    expect(pr1851.checks.find((c) => c.name === 'unit-tests')?.status).toBe('success');

    useDevHub.getState().startWizard({ name: 'billing-worker', template: 'go-service', team: 'Payments', tier: 2, ownerId: 'u-priya' });
    for (let i = 0; i < 6; i++) useDevHub.getState().advanceWizard();
    expect(useDevHub.getState().wizard?.done).toBe(true);
    expect(useDevHub.getState().services.some((s) => s.id === 'billing-worker')).toBe(true);
  });

  it('14. DevHubBridge recentDeploys and reviewQueue enforce viewer permissions', () => {
    const engViewer = viewerFor('u-priya', ['app:devhub']);
    const contractorViewer = viewerFor('u-alex', []);

    expect(capabilitiesFor(engViewer).canView).toBe(true);
    expect(capabilitiesFor(contractorViewer).canView).toBe(false);

    const deploys = api.recentDeploys(engViewer, { service: 'payments-svc', limit: 3 });
    expect(deploys.length).toBeGreaterThan(0);
    expect(deploys[0].service).toBe('payments-svc');
    expect(api.recentDeploys(contractorViewer)).toEqual([]);

    const queue = api.reviewQueue(engViewer);
    expect(queue.length).toBeGreaterThan(0);
    expect(api.reviewQueue(contractorViewer)).toEqual([]);
  });

  it('15. DevHubBridge setDeployFreeze and paletteEntries enforce permissions and validate input', () => {
    const incidentCommander = viewerFor('u-lucas', ['app:incidents']);
    const unauthorized = viewerFor('u-sara', ['app:hr']);

    expect(api.setDeployFreeze(unauthorized, { frozen: true, reason: 'Test' }).ok).toBe(false);
    expect(api.setDeployFreeze(incidentCommander, { frozen: true, reason: '' }).ok).toBe(false);

    const froze = api.setDeployFreeze(incidentCommander, {
      frozen: true,
      reason: 'INC-2047 SEV2 mitigation',
      source: { app: 'incidents', label: 'INC-2047', to: '/incidents' },
    });
    expect(froze).toEqual({ ok: true, frozen: true });
    expect(useDevHub.getState().freeze.frozen).toBe(true);

    const engViewer = viewerFor('u-omar', ['app:devhub']);
    expect(api.paletteEntries(engViewer).length).toBeGreaterThan(8);
    expect(api.paletteEntries(unauthorized)).toEqual([]);
  });
});
