import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NeoTracker } from '@/components/neo';
import { addDaysISO, todayISO } from '@/hr/calendar';
import type { ExpenseAuditStep, ExpenseReport, TravelRequest } from '@/expenses/types';
import type { PayrollRun } from '@/payroll/types';
import type { User } from '@/types';
import { journeyTrack, pickLeadClaim, reportTrack, tripTrack, type SpendTrackCtx } from './trackers';

const NOW = new Date(2026, 10, 10, 10, 0).getTime();
const H = 3_600_000;
const PERIOD = '2026-11';

const person = (id: string, name: string, managerId?: string) => ({ id, name, managerId }) as unknown as User;

function ctxWith(runs: Partial<PayrollRun>[] = [], viewerId = 'u-priya'): SpendTrackCtx {
  return {
    usersById: new Map(
      [
        person('u-priya', 'Priya Raman', 'u-omar'),
        person('u-omar', 'Omar Khalid', 'u-layla'),
        person('u-daniel', 'Daniel Okafor', 'u-layla'),
        person('u-layla', 'Layla Haddad'),
      ].map((u) => [u.id, u]),
    ),
    runsByPeriod: new Map(runs.map((r) => [r.period as string, r as PayrollRun])),
    viewerId,
    now: NOW,
  };
}

const text = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node)).replace(/<[^>]+>/g, '');

function report(status: ExpenseReport['status'], extra: Partial<ExpenseReport> = {}, history: ExpenseAuditStep[] = []): ExpenseReport {
  return {
    id: 'rep-t',
    reference: 'HX-EXP-2026-9999',
    userId: 'u-priya',
    department: 'Engineering',
    title: 'London sprint',
    costCenter: 'CC-410',
    receiptIds: ['r1', 'r2'],
    totalSpendAed: 1200,
    corporateCardAed: 200,
    reimbursableAed: 1000,
    vatTotalAed: 50,
    status,
    submittedAt: status === 'draft' ? undefined : NOW - 5 * H,
    payrollPeriod: status === 'payroll_queued' || status === 'reimbursed' ? PERIOD : undefined,
    history: [
      { at: NOW - 6 * H, actorId: 'u-priya', action: 'created' },
      ...(status === 'draft' ? [] : [{ at: NOW - 5 * H, actorId: 'u-priya', action: 'submitted' as const }]),
      ...history,
    ],
    createdAt: NOW - 6 * H,
    updatedAt: NOW - H,
    ...extra,
  };
}

function trip(status: TravelRequest['status'], extra: Partial<TravelRequest> = {}): TravelRequest {
  const today = todayISO(NOW);
  return {
    id: 'trp-t',
    reference: 'HX-TRV-2026-0999',
    userId: 'u-priya',
    department: 'Engineering',
    originCity: 'Dubai',
    destinationCity: 'London',
    destinationCountry: 'United Kingdom',
    departureDate: addDaysISO(today, 10),
    returnDate: addDaysISO(today, 13),
    days: 4,
    purpose: 'engineering-onsite',
    title: 'Architecture sprint',
    businessJustification: 'Platform alignment',
    cabinClass: 'economy',
    flightHours: 7.5,
    estimatedFlightAed: 3450,
    estimatedHotelAed: 3150,
    perDiemRateAed: 420,
    estimatedPerDiemAed: 1680,
    estimatedOtherAed: 320,
    totalEstimatedAed: 8600,
    co2Kg: 1480,
    policyFlags: [],
    status,
    approverId: 'u-omar',
    createdAt: NOW - 48 * H,
    updatedAt: NOW - H,
    ...extra,
  };
}

describe('reimbursement tracker model', () => {
  it('maps each report status to the live stage and mood', () => {
    const ctx = ctxWith();
    const cases: [ExpenseReport['status'], number, string][] = [
      ['draft', 0, 'paused'],
      ['submitted', 1, 'active'],
      ['manager_approved', 2, 'active'],
      ['payroll_queued', 3, 'active'],
      ['reimbursed', 5, 'done'],
    ];
    for (const [status, current, state] of cases) {
      const t = reportTrack(report(status), ctx);
      expect([status, t.current, t.state]).toEqual([status, current, state]);
      expect(t.steps).toHaveLength(5);
    }
    expect(reportTrack(report('draft'), ctx).steps[0].label).toBe('Draft');
  });

  it('names the people holding the live stage', () => {
    const ctx = ctxWith();
    expect(text(reportTrack(report('submitted'), ctx).message)).toBe('Omar is reviewing your receipts — Finance audit is next');
    expect(text(reportTrack(report('manager_approved', { managerReviewerId: 'u-omar' }), ctx).message)).toBe(
      'Omar approved it — Daniel in Finance is double-checking the receipts and VAT',
    );
  });

  it('blocks the stage that sent the report back', () => {
    const ctx = ctxWith();
    const byManager = reportTrack(
      report('changes_requested', { managerReviewerId: 'u-omar' }, [{ at: NOW - 2 * H, actorId: 'u-omar', action: 'changes_requested' }]),
      ctx,
    );
    expect([byManager.current, byManager.state]).toEqual([1, 'blocked']);
    expect(text(byManager.message)).toContain('Omar sent it back for a fix');

    const byFinance = reportTrack(
      report('rejected', { managerReviewerId: 'u-omar', financeReviewerId: 'u-daniel' }, [
        { at: NOW - 3 * H, actorId: 'u-omar', action: 'manager_approved' },
        { at: NOW - 2 * H, actorId: 'u-daniel', action: 'rejected' },
      ]),
      ctx,
    );
    expect([byFinance.current, byFinance.state]).toEqual([2, 'blocked']);
    expect(text(byFinance.message)).toBe('Daniel declined this claim');
  });

  it('follows the payroll run through sign-off', () => {
    const run: Partial<PayrollRun> = { period: PERIOD, status: 'pending_signoff', preparedBy: 'u-daniel', cutoffDate: '2026-11-18', payDate: '2026-11-25' };
    const t = reportTrack(report('payroll_queued', { financeReviewerId: 'u-daniel', financeQueuedAt: NOW - H }), ctxWith([run]));
    expect(t.progress).toBe(0.55);
    expect(text(t.message)).toBe('Daniel sent the November 2026 pay run for four-eyes sign-off');

    const html = renderToStaticMarkup(createElement(NeoTracker, { ...t, hud: 'Reimbursement tracker' }));
    expect(html).toContain('Stage 4 of 5');
    expect(html).toContain('Reimbursement tracker');
  });

  it('features the claim closest to the money', () => {
    const queued = report('payroll_queued', { id: 'q' });
    const submitted = report('submitted', { id: 's', updatedAt: NOW });
    const paidOld = report('reimbursed', { id: 'p1', updatedAt: NOW - 90 * H });
    const paidNew = report('reimbursed', { id: 'p2', updatedAt: NOW - 2 * H });
    expect(pickLeadClaim([submitted, queued, paidNew])?.id).toBe('q');
    expect(pickLeadClaim([paidOld, paidNew])?.id).toBe('p2');
    expect(pickLeadClaim([])).toBeUndefined();
  });
});

describe('trip tracker model', () => {
  it('tracks pre-approval, booking, travel and expensing', () => {
    const ctx = ctxWith();
    const pending = tripTrack(trip('pending_approval'), ctx);
    expect([pending.current, pending.state]).toEqual([1, 'active']);
    expect(text(pending.message)).toBe('Omar is reviewing your trip request — the virtual card is issued on approval');

    expect(tripTrack(trip('changes_requested'), ctx).state).toBe('blocked');
    expect(tripTrack(trip('approved', { approvedAt: NOW - H }), ctx).current).toBe(2);

    const today = todayISO(NOW);
    const travelling = tripTrack(trip('booked', { departureDate: addDaysISO(today, -1), returnDate: addDaysISO(today, 2) }), ctx);
    expect([travelling.current, travelling.progress]).toEqual([3, 0.5]);

    const expensed = tripTrack(trip('completed', { linkedReportId: 'rep-t' }), ctx);
    expect([expensed.current, expensed.state]).toEqual([5, 'done']);
  });

  it('speaks to the approver when it is their call', () => {
    const asOmar = ctxWith([], 'u-omar');
    expect(text(tripTrack(trip('pending_approval'), asOmar).message)).toBe('Waiting on your pre-approval');
    expect(text(tripTrack(trip('approved', { approvedAt: NOW - H }), asOmar).message)).toBe('You approved it — flight and hotel booking is next');
  });
});

describe('trip-to-paycheck journey rows', () => {
  it('derives mood from the trip and report', () => {
    const ctx = ctxWith();
    expect(journeyTrack(7, undefined, report('reimbursed'), ctx)).toMatchObject({ current: 7, state: 'done' });
    expect(journeyTrack(4, undefined, report('draft'), ctx)).toMatchObject({ current: 3, state: 'paused' });
    expect(journeyTrack(4, undefined, report('changes_requested'), ctx)).toMatchObject({ current: 3, state: 'blocked' });
    expect(journeyTrack(5, undefined, report('manager_approved'), ctx)).toMatchObject({ current: 4, state: 'active', progress: 0.75 });
  });
});
