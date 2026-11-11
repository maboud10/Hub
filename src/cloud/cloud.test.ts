import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeViewer } from '@/lib/appBridge';
import type { Department, User } from '@/types';
import {
  PROVISION_STEPS,
  allRegionSummaries,
  askCloudNova,
  buildDefaultProvisionSpec,
  canUseCloud,
  computeCarbonSummary,
  computeCloudCapabilities,
  computeFinOpsSummary,
  computeLiveAlerts,
  computeRecommendations,
  effectiveResources,
  estimateProvisionMonthlyUsd,
  evaluateProvisionPolicies,
  isStoryDegraded,
  missingTags,
  provisionJourneyStage,
  resourcesWithDrift,
  rightsizeStepDown,
  serviceSloSummary,
  serviceTelemetry,
} from './engine';
import { arcPath, landDots, project } from './geo';
import { api as cloudBridge } from './public';
import { buildCloudSeed, buildSeedStory } from './seed';
import { useCloud } from './store';

function makeViewer(perms: string[], department: Department = 'Engineering'): BridgeViewer {
  const user: User = {
    id: 'u-test',
    name: 'Test Engineer',
    email: 'test@helix.co',
    title: 'Staff Engineer',
    department,
    location: 'Dubai',
    timezone: 'Asia/Dubai',
    roleIds: ['r-eng'],
    grants: [],
    active: true,
    presence: 'online',
    avatarHue: 200,
    skills: ['Kubernetes', 'Rust'],
    phone: '+971-50-000-0000',
    employeeId: 'EMP-900',
    startDate: '2024-01-01',
  };
  return { user, roles: [], perms: new Set(perms) };
}

describe('Stratos · Cloud Console domain, store & bridge', () => {
  beforeEach(() => {
    useCloud.getState().resetDemo();
  });

  it('1. identifies payments-svc degraded telemetry during the active v2.41.0 storyline', () => {
    const story = buildSeedStory(1_700_000_000_000);
    expect(isStoryDegraded(story, 1_700_000_000_000)).toBe(true);
    const payments = serviceTelemetry('payments-svc', story, 'eu-west-2', 1_700_000_000_000);
    expect(payments.status).toBe('degraded');
    expect(payments.p95).toBe(820);
    expect(payments.errorRate).toBeCloseTo(0.023, 4);

    const healthyInUae = serviceTelemetry('payments-svc', story, 'me-central-1', 1_700_000_000_000);
    expect(healthyInUae.status).toBe('healthy');
    expect(healthyInUae.p95).toBe(240);
  });

  it('2. computes multi-window SLO error budget burn rate and fast-burn flag', () => {
    const story = buildSeedStory(1_700_000_000_000);
    const paymentsSlo = serviceSloSummary('payments-svc', story, 1_700_000_000_000);
    expect(paymentsSlo.burnRate1h).toBeGreaterThan(14.4);
    expect(paymentsSlo.fastBurn).toBe(true);
    expect(paymentsSlo.burnCurve.length).toBeGreaterThan(25);

    const identitySlo = serviceSloSummary('identity-svc', story, 1_700_000_000_000);
    expect(identitySlo.fastBurn).toBe(false);
    expect(identitySlo.remainingFraction).toBeGreaterThan(0.8);
  });

  it('3. computes regional summaries, quotas, and drift across all 4 regions', () => {
    const data = buildCloudSeed();
    const story = buildSeedStory();
    const resources = effectiveResources(data);
    const regions = allRegionSummaries(resources, story);
    expect(regions.map((r) => r.region.id)).toEqual([
      'me-central-1',
      'eu-west-2',
      'ap-southeast-1',
      'us-east-1',
    ]);
    const eu = regions.find((r) => r.region.id === 'eu-west-2')!;
    expect(eu.status).toBe('degraded');
    expect(eu.driftCount).toBeGreaterThan(0);
    expect(resourcesWithDrift(resources).length).toBeGreaterThanOrEqual(3);
  });

  it('4. detects missing showback tags and rightsizing candidates', () => {
    const resources = effectiveResources(buildCloudSeed());
    const notebook = resources.find((r) => r.id === 'nb-embeddings-lab')!;
    expect(missingTags(notebook)).toContain('env');
    expect(missingTags(notebook)).toContain('cost-center');

    const overprovisioned = resources.find((r) => r.id === 'mail-pg-analytics')!;
    const step = rightsizeStepDown(overprovisioned);
    expect(step).not.toBeNull();
    expect(step?.nextSize).toBe('db.r6g.xlarge');
    expect(step?.savingsUsd).toBeGreaterThan(500);
  });

  it('5. evaluates all 5 provisioning policy guardrails including UAE/EU data residency', () => {
    const validSpec = buildDefaultProvisionSpec('postgres', 'payments');
    const validChecks = evaluateProvisionPolicies(validSpec);
    expect(validChecks).toHaveLength(5);
    expect(validChecks.every((c) => c.outcome !== 'fail')).toBe(true);

    const badSpec = {
      ...validSpec,
      region: 'us-east-1' as const,
      dataClass: 'uae-personal' as const,
      encrypted: false,
      publicAccess: true,
      tags: { team: 'payments' },
    };
    const badChecks = evaluateProvisionPolicies(badSpec);
    expect(badChecks.find((c) => c.id === 'residency')?.outcome).toBe('fail');
    expect(badChecks.find((c) => c.id === 'encryption')?.outcome).toBe('fail');
    expect(badChecks.find((c) => c.id === 'public')?.outcome).toBe('fail');
    expect(badChecks.find((c) => c.id === 'tags')?.outcome).toBe('fail');
  });

  it('6. tracks the 5-stage provisioning journey from Draft & sizing to Live & monitored', () => {
    expect(PROVISION_STEPS.map((s) => s.label)).toEqual([
      'Draft & sizing',
      'Policy & security check',
      'FinOps budget check',
      'Terraform plan & apply',
      'Live & monitored',
    ]);
    const spec = buildDefaultProvisionSpec('redis', 'collab');
    const req = useCloud.getState().submitProvisionRequest(spec, 'u-lucas');
    expect(estimateProvisionMonthlyUsd(spec)).toBeGreaterThan(50);

    const early = provisionJourneyStage(req, req.createdAt + 500);
    expect(early.current).toBe(0);
    expect(early.state).toBe('active');

    useCloud.getState().completeProvisionRequest(req.id);
    const updated = useCloud.getState().requests.find((r) => r.id === req.id)!;
    const done = provisionJourneyStage(updated, req.createdAt + 1000);
    expect(done.current).toBe(5);
    expect(done.state).toBe('done');

    const allRes = effectiveResources(useCloud.getState());
    expect(allRes.some((r) => r.name === spec.name)).toBe(true);
  });

  it('7. computes FinOps budget, forecast, anomalies, and reduces spend when recommendations are applied', () => {
    const st0 = useCloud.getState();
    const initial = computeFinOpsSummary(st0, st0.story);
    expect(initial.budgetUsd).toBe(220_000);
    expect(initial.openAnomaliesCount).toBe(3);
    expect(initial.forecastUsd).toBeGreaterThan(initial.budgetUsd);

    useCloud.getState().resolveAnomaly('an-egress');
    useCloud.getState().applyRecommendation('rec-sp');
    const st1 = useCloud.getState();
    const after = computeFinOpsSummary(st1, st1.story);
    expect(after.openAnomaliesCount).toBe(2);
    expect(after.forecastUsd).toBeLessThan(initial.forecastUsd);
    expect(after.realisedSavingsUsd).toBeGreaterThanOrEqual(18_200 + 3_940);
  });

  it('8. computes GreenOps carbon intensity and batch job window shifting savings', () => {
    const before = computeCarbonSummary(useCloud.getState());
    expect(before.totalMonthlyKg).toBeGreaterThan(1000);
    expect(before.potentialSavingsKg).toBeGreaterThan(0);

    const job = before.batchJobs.find((b) => b.job.id === 'job-uae-ledger')!;
    expect(job.shifted).toBe(false);
    useCloud.getState().shiftBatchJob('job-uae-ledger', job.recommendedHourUtc);

    const after = computeCarbonSummary(useCloud.getState());
    const updatedJob = after.batchJobs.find((b) => b.job.id === 'job-uae-ledger')!;
    expect(updatedJob.shifted).toBe(true);
    expect(after.potentialSavingsKg).toBeLessThan(before.potentialSavingsKg);
  });

  it('9. computes firing observability alerts and supports acknowledge / silence / rollback', () => {
    const st0 = useCloud.getState();
    const alerts0 = computeLiveAlerts(st0, st0.story);
    expect(alerts0.length).toBeGreaterThanOrEqual(4);

    useCloud.getState().acknowledgeAlert(alerts0[0].id, 'u-lucas');
    expect(useCloud.getState().alerts[alerts0[0].id]?.status).toBe('acknowledged');

    useCloud.getState().recoverStory();
    const st1 = useCloud.getState();
    const alertsAfterRollback = computeLiveAlerts(st1, st1.story);
    expect(alertsAfterRollback.length).toBeLessThan(alerts0.length);
  });

  it('10. rightsizes a resource and reconciles Terraform drift in the store', () => {
    useCloud.getState().rightsizeResource('mail-pg-analytics');
    const resAfter = effectiveResources(useCloud.getState()).find((r) => r.id === 'mail-pg-analytics')!;
    expect(resAfter.size).toBe('db.r6g.xlarge');

    useCloud.getState().reconcileDrift('helix-pipeline-exports');
    const bucketAfter = effectiveResources(useCloud.getState()).find((r) => r.id === 'helix-pipeline-exports')!;
    expect(bucketAfter.drift).toEqual([]);
  });

  it('11. answers Nova queries with explainable root-cause, FinOps, and GreenOps insights', () => {
    const st = useCloud.getState();
    const latencyAns = askCloudNova('Why is payments-svc latency spiking in eu-west-2?', st, st.story);
    expect(latencyAns.headline).toContain('payments-svc');
    expect(latencyAns.bullets.length).toBeGreaterThanOrEqual(3);

    const finopsAns = askCloudNova('Explain the FinOps egress anomaly', st, st.story);
    expect(finopsAns.headline).toContain('FinOps Forecast');

    const carbonAns = askCloudNova('How can we cut carbon on batch jobs?', st, st.story);
    expect(carbonAns.headline).toContain('GreenOps');
  });

  it('12. projects world map coordinates and generates land dot matrix + traffic arcs', () => {
    const dubai = project(55.3, 25.2);
    const london = project(-0.13, 51.5);
    expect(dubai.x).toBeGreaterThan(london.x);
    expect(london.y).toBeLessThan(dubai.y);

    const dots = landDots(4);
    expect(dots.count).toBeGreaterThan(100);
    expect(dots.d.startsWith('M')).toBe(true);

    const arc = arcPath(london, dubai);
    expect(arc).toContain('Q');
  });

  it('13. separates Engineering vs FinOps-only capabilities in access control', () => {
    expect(canUseCloud(new Set(['app:cloud']))).toBe(true);
    expect(canUseCloud(new Set(['app:spaces']))).toBe(false);

    const engCaps = computeCloudCapabilities(new Set(['app:cloud', 'app:devhub']), 'Engineering');
    expect(engCaps.isEngineer).toBe(true);
    expect(engCaps.isFinOpsOnly).toBe(false);
    expect(engCaps.canProvision).toBe(true);

    const finCaps = computeCloudCapabilities(new Set(['app:cloud']), 'Finance');
    expect(finCaps.isEngineer).toBe(false);
    expect(finCaps.isFinOpsOnly).toBe(true);
    expect(finCaps.canProvision).toBe(false);
    expect(finCaps.canManageFinOps).toBe(true);
  });

  it('14. gates CloudBridge methods by viewer permissions', () => {
    const unauth = makeViewer(['app:spaces'], 'Marketing');
    expect(cloudBridge.paletteEntries(unauth)).toEqual([]);
    expect(cloudBridge.serviceHealth(unauth)).toEqual([]);
    expect(cloudBridge.spend(unauth)).toEqual({ mtdUsd: 0, forecastUsd: 0, budgetUsd: 0, anomalies: 0 });

    const eng = makeViewer(['app:cloud', 'app:devhub'], 'Engineering');
    const health = cloudBridge.serviceHealth(eng);
    expect(health).toHaveLength(8);
    expect(health.find((h) => h.service === 'payments-svc')?.status).toBe('degraded');

    const spend = cloudBridge.spend(eng);
    expect(spend.budgetUsd).toBe(220_000);
    expect(spend.anomalies).toBe(3);
    expect(cloudBridge.paletteEntries(eng).length).toBeGreaterThan(10);
  });

  it('15. resets demo state cleanly via CloudBridge.resetDemo()', () => {
    useCloud.getState().resolveAnomaly('an-egress');
    expect(computeFinOpsSummary(useCloud.getState(), useCloud.getState().story).openAnomaliesCount).toBe(2);

    cloudBridge.resetDemo();
    expect(computeFinOpsSummary(useCloud.getState(), useCloud.getState().story).openAnomaliesCount).toBe(3);
    expect(computeRecommendations(effectiveResources(useCloud.getState()), useCloud.getState()).length).toBeGreaterThanOrEqual(5);
  });
});
