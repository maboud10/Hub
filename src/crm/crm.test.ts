import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeAccountWhitespace,
  computeCrmCommandKpis,
  computeDealWinProbability,
  computeMeddpiccScore,
  computeSimulatorProjection,
  computeTriBandTrajectory,
  createExpansionDealFromAccount,
  generateNovaCrmResponse,
} from './engine';
import { SEED_ACCOUNTS, SEED_DEALS, SIMULATOR_PRESETS } from './seed';
import { resetCrm, useCrm } from './store';

describe('Helix CRM — Engine & Store', () => {
  beforeEach(() => {
    resetCrm();
  });

  it('computes 8-pillar MEDDPICC coverage and dynamically adjusts neural win probability', () => {
    const deal = structuredClone(SEED_DEALS.find((d) => d.id === 'deal-nordic-vault')!);
    const initialMed = computeMeddpiccScore(deal.meddpicc);
    expect(initialMed.totalCount).toBe(8);
    expect(initialMed.completedCount).toBe(6);
    expect(initialMed.missingPillars).toContain('Economic Buyer');
    expect(initialMed.missingPillars).toContain('Paper Process');

    const initialProb = computeDealWinProbability(deal);
    expect(initialProb).toBeGreaterThan(40);
    expect(initialProb).toBeLessThan(90);

    // Toggling Economic Buyer ON strictly increases neural win probability
    deal.meddpicc.economicBuyer = true;
    const afterEbProb = computeDealWinProbability(deal);
    expect(afterEbProb).toBeGreaterThan(initialProb);

    // Toggling Paper Process ON strictly increases neural win probability further
    deal.meddpicc.paperProcess = true;
    const fullMedProb = computeDealWinProbability(deal);
    expect(fullMedProb).toBeGreaterThan(afterEbProb);

    // Closed Won deals always report 99% neural win probability
    deal.stage = 'won';
    expect(computeDealWinProbability(deal)).toBe(99);
  });

  it('computes Command KPIs and Tri-Band Revenue Trajectory from live accounts and pipeline', () => {
    const { accounts, deals } = useCrm.getState();
    const kpis = computeCrmCommandKpis(accounts, deals);

    expect(kpis.liveArr).toBe(42_800_000);
    expect(kpis.weightedPipeline).toBeGreaterThan(18_000_000);
    expect(kpis.pipelineCoverageRatio).toBeGreaterThanOrEqual(3.0);
    expect(kpis.netDollarRetention).toBeGreaterThanOrEqual(130);
    expect(kpis.neuralWinRate).toBeGreaterThan(35);
    expect(kpis.q4ExpansionVelocity).toBeGreaterThan(5_000_000);

    const trajectory = computeTriBandTrajectory(accounts, deals);
    expect(trajectory).toHaveLength(4);
    expect(trajectory[3].quarter).toBe('Q4');
    expect(trajectory[3].bestCaseArr).toBeGreaterThan(trajectory[3].neuralForecastArr);
    expect(trajectory[3].neuralForecastArr).toBeGreaterThan(trajectory[3].committedArr);
  });

  it('calculates Customer 360 expansion white-space and launches a new pipeline deal', () => {
    const neom = useCrm.getState().accounts.find((a) => a.id === 'acc-neom')!;
    const ws = computeAccountWhitespace(neom);

    expect(ws.seatUtilizationPct).toBe(98);
    expect(ws.isSeatConstrained).toBe(true);
    expect(ws.totalWhitespaceArr).toBe(2_300_000); // $1.45M Nova AI + $850K Workflow Auto
    expect(ws.openModules[0].moduleId).toBe('novaCopilot');

    const dealCountBefore = useCrm.getState().deals.length;
    const created = useCrm.getState().launchAccountExpansion('acc-emirates', 'novaCopilot');

    expect(created).not.toBeNull();
    expect(created?.accountName).toBe('Emirates Flight Catering');
    expect(created?.targetModule).toBe('novaCopilot');
    expect(created?.acv).toBe(740_000);
    expect(useCrm.getState().deals.length).toBe(dealCountBefore + 1);

    // Module state on the account updates to 'trial'
    const updatedEmirates = useCrm.getState().accounts.find((a) => a.id === 'acc-emirates')!;
    expect(updatedEmirates.modules.novaCopilot.state).toBe('trial');

    // Pure helper also works standalone
    const standalone = createExpansionDealFromAccount(SEED_ACCOUNTS[0], 'workflowAuto', 1700000000000);
    expect(standalone.acv).toBe(850_000);
    expect(standalone.region).toBe('MENA & GCC');
  });

  it('executes autonomous growth plays and dark-funnel playbooks, boosting pipeline metrics', () => {
    const store = useCrm.getState();
    const nordicBefore = store.deals.find((d) => d.id === 'deal-nordic-vault')!;
    const probBefore = computeDealWinProbability(nordicBefore);

    store.executeGrowthPlay('play-nordic-multithread');

    const afterState = useCrm.getState();
    const playAfter = afterState.growthPlays.find((p) => p.id === 'play-nordic-multithread')!;
    const nordicAfter = afterState.deals.find((d) => d.id === 'deal-nordic-vault')!;

    expect(playAfter.executed).toBe(true);
    expect(nordicAfter.meddpicc.economicBuyer).toBe(true);
    expect(computeDealWinProbability(nordicAfter)).toBeGreaterThan(probBefore);

    // Run a playbook and verify run count + pipeline generated increase
    const pbBefore = afterState.playbooks.find((p) => p.id === 'pb-seat-surge')!;
    afterState.runPlaybook('pb-seat-surge');
    const pbAfter = useCrm.getState().playbooks.find((p) => p.id === 'pb-seat-surge')!;
    expect(pbAfter.runsCount).toBe(pbBefore.runsCount + 1);
    expect(pbAfter.pipelineGenerated).toBeGreaterThan(pbBefore.pipelineGenerated);
  });

  it('projects FY27 ARR, New vs Expansion mix, and Regional Pod Quota Attainment in Simulator', () => {
    const { accounts, deals } = useCrm.getState();
    const conservative = computeSimulatorProjection(SIMULATOR_PRESETS.conservative, accounts, deals);
    const base = computeSimulatorProjection(SIMULATOR_PRESETS.base, accounts, deals);
    const hyper = computeSimulatorProjection(SIMULATOR_PRESETS.hypergrowth, accounts, deals);

    expect(hyper.fy27ProjectedArr).toBeGreaterThan(base.fy27ProjectedArr);
    expect(base.fy27ProjectedArr).toBeGreaterThan(conservative.fy27ProjectedArr);
    expect(hyper.expansionArr).toBeGreaterThan(conservative.expansionArr);
    expect(hyper.avgCycleDays).toBeLessThan(conservative.avgCycleDays);
    expect(hyper.regionalPods).toHaveLength(4);
    expect(hyper.regionalPods.map((p) => p.region)).toEqual([
      'MENA & GCC',
      'North America',
      'Europe',
      'APAC',
    ]);
  });

  it('generates structured Nova CRM Copilot responses with executable recommendations', () => {
    const resNeom = useCrm
      .getState()
      .askNovaCrm('Generate executive closing plan for NEOM Cognitive Mobility');
    expect(resNeom.headline).toContain('NEOM Cognitive Mobility');
    expect(resNeom.recommendedAction?.dealId).toBe('deal-neom-q4');

    const resRisk = generateNovaCrmResponse(
      'Which Q4 enterprise deals have champion or security risk?',
      SEED_ACCOUNTS,
      SEED_DEALS,
    );
    expect(resRisk.bullets.length).toBeGreaterThanOrEqual(3);
    expect(resRisk.recommendedAction?.playId).toBe('play-nordic-multithread');
  });
});
