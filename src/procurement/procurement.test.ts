import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculateVendorIdleSeats,
  computeCategorySpendBreakdown,
  computeProcurementKpis,
  formatAed,
  formatUsd,
  parseNovaIntake,
} from './engine';
import { createProcurementSeed } from './seed';
import { resetProcurement, useProcurement } from './store';

describe('Helix Procurement — Engine & Store', () => {
  beforeEach(() => {
    resetProcurement();
  });

  it('initializes seed catalog with 9 strategic/preferred/emerging vendors, contracts, requests, and POs', () => {
    const state = useProcurement.getState();
    expect(state.vendors).toHaveLength(9);
    expect(state.vendors.map((v) => v.name)).toEqual(
      expect.arrayContaining([
        'Anthropic',
        'Snowflake',
        'Emirates Sovereign Cloud',
        'Cloudflare',
        'Datadog',
        'Okta',
        'Figma',
        'Linear',
        'Rippling',
      ]),
    );
    expect(state.requests.length).toBeGreaterThanOrEqual(6);
    expect(state.contracts.length).toBeGreaterThanOrEqual(5);
    expect(state.purchaseOrders.length).toBeGreaterThanOrEqual(5);

    const kpis = computeProcurementKpis(state);
    expect(kpis.managedSpendUsd).toBe(18_400_000);
    expect(kpis.totalSavingsUsd).toBe(2_340_000);
    expect(kpis.savingsPct).toBeCloseTo(12.7, 1);
    expect(kpis.autonomousCycleDays).toBe(1.8);
    expect(kpis.avgSecurityScore).toBeGreaterThanOrEqual(95);
  });

  it('parses Nova natural-language intake prompts with P25/P50/P75 price benchmarks and duplicate detection', () => {
    const seed = createProcurementSeed();

    const figmaDraft = parseNovaIntake(
      '25 Figma Enterprise seats for Design in Singapore',
      seed.vendors,
    );
    expect(figmaDraft.vendorId).toBe('v-figma');
    expect(figmaDraft.category).toBe('product_design');
    expect(figmaDraft.location).toBe('Singapore');
    expect(figmaDraft.quantity).toBe(25);
    expect(figmaDraft.benchmark.p25Usd).toBeLessThan(figmaDraft.benchmark.medianUsd);
    expect(figmaDraft.benchmark.medianUsd).toBeLessThan(figmaDraft.benchmark.p75Usd);
    expect(figmaDraft.estimatedSavingsUsd).toBeGreaterThan(0);
    expect(figmaDraft.duplicateWarning).toContain('idle Figma seats');
    expect(figmaDraft.stagesPreview).toHaveLength(5);

    const snowflakeDraft = parseNovaIntake(
      'Renew Snowflake Enterprise with 15% multi-year cap',
      seed.vendors,
    );
    expect(snowflakeDraft.vendorId).toBe('v-snowflake');
    expect(snowflakeDraft.termMonths).toBe(36);
    expect(snowflakeDraft.duplicateWarning).toContain('auto-renewal cliff');

    const macbookDraft = parseNovaIntake(
      '40 MacBook Pro M4 Max units for Dubai Engineering',
      seed.vendors,
    );
    expect(macbookDraft.vendorId).toBe('v-rippling');
    expect(macbookDraft.quantity).toBe(40);
    expect(macbookDraft.location).toBe('Dubai');
  });

  it('creates a Purchase Request from Nova intake or modal and routes through 5-stage constellation', () => {
    const store = useProcurement.getState();
    const draft = store.runNovaIntake('25 Figma Enterprise seats for Design in Singapore');
    expect(useProcurement.getState().activeIntakeDraft).not.toBeNull();

    const created = useProcurement.getState().createRequestFromNovaDraft(draft, 'u-mei');
    expect(created).not.toBeNull();
    expect(created?.stages).toHaveLength(5);
    expect(created?.stages[0].status).toBe('approved');
    expect(created?.stages[1].status).toBe('pending');
    expect(useProcurement.getState().activeIntakeDraft).toBeNull();
  });

  it('advances 5-stage parallel approval constellation and issues a Purchase Order', () => {
    // REQ-2026-101 has 3 approved stages, 1 pending, 1 waiting
    const r1 = useProcurement.getState().advanceApproval('REQ-2026-101');
    expect(r1.ok).toBe(true);
    expect(r1.stageApproved).toBe('Legal Redline');
    expect(r1.allApproved).toBe(false);

    const r2 = useProcurement.getState().advanceApproval('REQ-2026-101');
    expect(r2.ok).toBe(true);
    expect(r2.stageApproved).toBe('Finance Controller');
    expect(r2.allApproved).toBe(true);

    const updatedReq = useProcurement.getState().requests.find((r) => r.id === 'REQ-2026-101');
    expect(updatedReq?.status).toBe('approved');

    const issuedPo = useProcurement.getState().issuePurchaseOrder('REQ-2026-101');
    expect(issuedPo).not.toBeNull();
    expect(issuedPo?.id).toMatch(/^PO-2026-/);
    expect(
      useProcurement.getState().requests.find((r) => r.id === 'REQ-2026-101')?.status,
    ).toBe('po_issued');
  });

  it('reclaims idle vendor licenses and increments Nova Negotiated Savings', () => {
    const beforeSavings = computeProcurementKpis(useProcurement.getState()).totalSavingsUsd;
    const figmaBefore = useProcurement.getState().vendors.find((v) => v.id === 'v-figma')!;
    const idleCalc = calculateVendorIdleSeats(figmaBefore);
    expect(idleCalc.idleSeats).toBe(54);
    expect(idleCalc.annualIdleSavingsUsd).toBe(54 * 1_080);

    const res = useProcurement.getState().reclaimVendorSeats('v-figma');
    expect(res.ok).toBe(true);
    expect(res.reclaimedSeats).toBe(54);
    expect(res.savingsUsd).toBe(58_320);

    const figmaAfter = useProcurement.getState().vendors.find((v) => v.id === 'v-figma')!;
    expect(figmaAfter.provisionedSeats).toBe(figmaAfter.activeSeats);
    expect(figmaAfter.reclaimedSeatsCount).toBe(54);

    const afterSavings = computeProcurementKpis(useProcurement.getState()).totalSavingsUsd;
    expect(afterSavings).toBe(beforeSavings + 58_320);
  });

  it('applies Nova contract counter-offers and resolves redline clauses', () => {
    const beforeSavings = computeProcurementKpis(useProcurement.getState()).totalSavingsUsd;
    const res = useProcurement.getState().applyContractCounterOffer('CTR-2026-01');
    expect(res.ok).toBe(true);
    expect(res.savingsUsd).toBe(4_514_400 - 3_887_400);

    const updatedContract = useProcurement
      .getState()
      .contracts.find((c) => c.id === 'CTR-2026-01')!;
    expect(updatedContract.counterOfferApplied).toBe(true);
    expect(updatedContract.status).toBe('counter_locked');
    expect(updatedContract.clauses.every((c) => c.status !== 'redline_needed')).toBe(true);

    const afterSavings = computeProcurementKpis(useProcurement.getState()).totalSavingsUsd;
    expect(afterSavings).toBe(beforeSavings + res.savingsUsd);
  });

  it('verifies 3-Way Match on Purchase Orders and clamps invoice variances', () => {
    const flaggedPo = useProcurement
      .getState()
      .purchaseOrders.find((p) => p.id === 'PO-2026-402')!;
    expect(flaggedPo.matchStatus).toBe('variance_flagged');
    expect(flaggedPo.varianceUsd).toBe(32_400);

    const res = useProcurement.getState().verifyThreeWayMatch('PO-2026-402');
    expect(res.ok).toBe(true);
    expect(res.varianceClampedUsd).toBe(32_400);

    const verifiedPo = useProcurement
      .getState()
      .purchaseOrders.find((p) => p.id === 'PO-2026-402')!;
    expect(verifiedPo.matchStatus).toBe('verified_queued');
    expect(verifiedPo.varianceUsd).toBe(0);
    expect(verifiedPo.invoiceAmountUsd).toBe(verifiedPo.poAmountUsd);
  });

  it('computes category spend breakdown and formats USD/AED accurately', () => {
    const rows = computeCategorySpendBreakdown(useProcurement.getState().vendors);
    expect(rows).toHaveLength(5);
    expect(formatUsd(18_400_000, true)).toBe('$18.40M');
    expect(formatAed(10_000)).toBe('AED 36,725');
  });
});
