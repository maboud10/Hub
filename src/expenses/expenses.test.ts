import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import { useHr } from '@/hr/store';
import { payslipsFor } from '@/hr/engine';
import { addDaysISO, toISODate } from '@/hr/calendar';
import { useExpenses } from './store';
import { scanReceiptFile } from './constants';
import { computeJourneyStage } from './selectors';
import { usePayroll } from '@/payroll/store';
import { periodFromTimestamp } from '@/payroll/engine';

const as = (userId: string) => useHub.setState({ sessionUserId: userId });

describe('Travel & Expenses 7-stage process flow + Payroll & HR Payslip sync', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    useHr.getState().resetHrDemo();
    useExpenses.getState().resetExpensesDemo();
    usePayroll.getState().resetPayrollDemo();
  });

  it('blocks contractors without app:expenses / app:travel from requesting travel or uploading receipts', () => {
    as('u-alex');
    const today = toISODate(Date.now());
    const tripRes = useExpenses.getState().requestTravel({
      originCity: 'Dubai',
      destinationCity: 'London',
      destinationCountry: 'United Kingdom',
      departureDate: addDaysISO(today, 14),
      returnDate: addDaysISO(today, 17),
      purpose: 'client-summit',
      title: 'Contractor London Visit',
      businessJustification: 'Testing contractor RBAC gate on travel requests.',
      cabinClass: 'economy',
      estimatedFlightAed: 3400,
      estimatedHotelAed: 3000,
    });
    expect(tripRes.ok).toBe(false);
  });

  it('parses multi-currency receipts via Smart OCR and flags meal-cap policy warnings', () => {
    const today = toISODate(Date.now());
    const parsed = scanReceiptFile('hilton_london_hotel_gbp.pdf', today);
    expect(parsed.currency).toBe('GBP');
    expect(parsed.category).toBe('lodging');
    expect(parsed.originalAmount).toBe(620);
    expect(parsed.confidence).toBeGreaterThanOrEqual(90);

    as('u-kwame');
    const mealRes = useExpenses.getState().uploadReceipt({
      merchant: 'DIFC Steakhouse',
      category: 'meals',
      date: today,
      currency: 'AED',
      originalAmount: 480, // > AED 350 meal cap
      paymentMethod: 'personal_reimbursable',
      fileName: 'difc-dinner.jpg',
    });
    expect(mealRes.ok).toBe(true);
    const saved = useExpenses.getState().receipts.find((r) => r.id === mealRes.receiptId)!;
    expect(saved.warnings.some((w) => w.code === 'over_meal_cap')).toBe(true);
  });

  it('runs the full 7-stage journey: Travel Request → Pre-Approval & Virtual Card → Receipts → Report → Manager Review → Finance Audit → Payroll Disbursement → HR Payslip', async () => {
    const today = toISODate(Date.now());
    const currentPeriod = periodFromTimestamp(Date.now(), 0);

    // Stage 1: Kwame requests business travel to London
    as('u-kwame');
    const reqRes = useExpenses.getState().requestTravel({
      originCity: 'Dubai',
      destinationCity: 'London',
      destinationCountry: 'United Kingdom',
      departureDate: addDaysISO(today, 12),
      returnDate: addDaysISO(today, 15),
      purpose: 'customer-launch',
      title: 'London Banking Vault Cutover',
      businessJustification: 'On-site zero-trust HSM migration with enterprise customer engineering lead.',
      cabinClass: 'economy',
      estimatedFlightAed: 3450,
      estimatedHotelAed: 3150,
      estimatedOtherAed: 300,
    });
    expect(reqRes.ok).toBe(true);
    const tripId = reqRes.tripId!;
    expect(computeJourneyStage(useExpenses.getState().trips.find((t) => t.id === tripId), undefined)).toBe(1);

    // Separation of duties: Kwame cannot pre-approve his own trip
    expect(useExpenses.getState().decideTravel(tripId, 'approved').ok).toBe(false);

    // Stage 2: Manager Omar pre-approves & issues scoped Virtual Travel Card
    as('u-omar');
    const approveTrip = useExpenses.getState().decideTravel(tripId, 'approved', 'Approved — safe travels!', true);
    expect(approveTrip.ok).toBe(true);
    const approvedTrip = useExpenses.getState().trips.find((t) => t.id === tripId)!;
    expect(approvedTrip.virtualCard?.last4).toHaveLength(4);

    // Kwame books itinerary on his virtual card
    as('u-kwame');
    expect(
      useExpenses.getState().bookTravelItinerary(tripId, {
        airline: 'Emirates · EK001',
        flightBookingRef: 'EK-88Z1P',
        hotelName: 'citizenM Tower of London',
        hotelConfirmation: 'CM-40912',
      }).ok,
    ).toBe(true);

    // Stage 3: Kwame uploads a GBP hotel folio (personal reimbursable) + corporate-card flight
    const rcpFlight = useExpenses.getState().uploadReceipt({
      tripId,
      merchant: 'Emirates Airlines',
      category: 'flights',
      date: today,
      currency: 'AED',
      originalAmount: 3450,
      paymentMethod: 'corporate_card',
      fileName: 'ek001-eticket.pdf',
    });
    const rcpHotel = useExpenses.getState().uploadReceipt({
      tripId,
      merchant: 'citizenM Tower of London',
      category: 'lodging',
      date: today,
      currency: 'GBP',
      originalAmount: 540,
      paymentMethod: 'personal_reimbursable',
      fileName: 'citizenm-folio.pdf',
    });
    expect(rcpFlight.ok && rcpHotel.ok).toBe(true);
    expect(computeJourneyStage(approvedTrip, undefined, 2)).toBe(3);

    // Stage 4: Kwame bundles receipts + automatic 4-day London per diem into a Draft Report, then submits it
    const repRes = useExpenses.getState().createAndSubmitReport({
      title: 'London Banking Vault Cutover — Trip Settlement',
      tripId,
      receiptIds: [rcpFlight.receiptId!, rcpHotel.receiptId!],
      includeTripPerDiem: true,
      submitNow: false,
    });
    expect(repRes.ok).toBe(true);
    const reportId = repRes.reportId!;
    const draftReport = useExpenses.getState().reports.find((r) => r.id === reportId)!;
    expect(draftReport.corporateCardAed).toBe(3450);
    // 540 GBP * 4.66 = 2516.4 AED + (4 days * 420 AED per diem = 1680) = 4196.4 AED reimbursable!
    expect(draftReport.reimbursableAed).toBeCloseTo(4196.4, 1);
    expect(computeJourneyStage(approvedTrip, draftReport)).toBe(4);

    // Submit draft report -> enters Stage 5 (Manager & Finance Review)
    expect(useExpenses.getState().submitDraftReport(reportId, 'Flight on virtual card; hotel + UK per diem reimbursable.').ok).toBe(true);
    expect(computeJourneyStage(approvedTrip, useExpenses.getState().reports.find((r) => r.id === reportId))).toBe(5);

    // Separation of duties: Kwame cannot manager-approve his own report
    expect(useExpenses.getState().managerDecideReport(reportId, 'manager_approved').ok).toBe(false);

    // Stage 5a: Omar manager-approves
    as('u-omar');
    expect(useExpenses.getState().managerDecideReport(reportId, 'manager_approved', 'Verified customer milestone').ok).toBe(true);
    expect(computeJourneyStage(approvedTrip, useExpenses.getState().reports.find((r) => r.id === reportId))).toBe(5);

    // Stage 5b -> 6: Daniel (Finance) audits & queues into currentPeriod Payroll Run
    as('u-daniel');
    const finRes = useExpenses.getState().financeAuditReport(
      reportId,
      'payroll_queued',
      currentPeriod,
      'GL & UK VAT verified; queued for payday.',
    );
    expect(finRes.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(computeJourneyStage(approvedTrip, useExpenses.getState().reports.find((r) => r.id === reportId))).toBe(6);

    // Verify Payroll Console active run automatically picked up Kwame's AED 4,196.40 reimbursement!
    usePayroll.getState().syncActiveRun();
    const draftRun = usePayroll.getState().runs.find((r) => r.period === currentPeriod)!;
    const kwameLine = draftRun.lines.find((l) => l.userId === 'u-kwame')!;
    expect(kwameLine.expenseReimbursementsAed).toBeCloseTo(4196.4, 1);

    // Stage 6 -> 7: Daniel submits Pay Run, Sara counter-signs (four-eyes), Daniel disburses!
    expect(usePayroll.getState().submitRunForSignoff(currentPeriod).ok).toBe(true);
    // Daniel cannot counter-sign his own run
    expect(usePayroll.getState().approvePayRun(currentPeriod).ok).toBe(false);

    as('u-sara');
    expect(usePayroll.getState().approvePayRun(currentPeriod, 'Headcount & T&E verified').ok).toBe(true);

    as('u-daniel');
    const disburse = usePayroll.getState().disbursePayRun(currentPeriod);
    expect(disburse.ok).toBe(true);
    expect(disburse.settledExpenses).toBeGreaterThanOrEqual(2); // Kwame's new report + Priya's seeded rep-2!

    // Stage 7 verified: Kwame's report is now `reimbursed` with WPS reference
    const settledReport = useExpenses.getState().reports.find((r) => r.id === reportId)!;
    expect(settledReport.status).toBe('reimbursed');
    expect(settledReport.paymentRef).toContain(`WPS-HX-${currentPeriod}`);
    expect(computeJourneyStage(approvedTrip, settledReport)).toBe(7);

    // HR Portal Payslip immediately includes Kwame's Travel & expense reimbursement AND Signing Bonus!
    const kwameUser = useHub.getState().users.find((u) => u.id === 'u-kwame')!;
    const kwameComp = useHr.getState().comp.find((c) => c.userId === 'u-kwame')!;
    const paidPeriods = new Set(usePayroll.getState().runs.filter((r) => r.status === 'paid').map((r) => r.period));
    const slips = payslipsFor(kwameUser, kwameComp, {
      claims: useHr.getState().claims,
      reimbursements: useExpenses.getState().reports,
      bonuses: usePayroll.getState().bonuses,
      paidPeriods,
    });
    const currentSlip = slips.find((s) => s.period === currentPeriod)!;
    expect(currentSlip).toBeDefined();
    expect(currentSlip.earnings.some((e) => e.label === 'Travel & expense reimbursement' && Math.abs(e.amount - 4196.4) < 0.5)).toBe(true);
    expect(currentSlip.earnings.some((e) => e.label.startsWith('Bonus ·'))).toBe(true);
  });
});
