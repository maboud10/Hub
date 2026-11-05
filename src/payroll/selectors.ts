import { useMemo } from 'react';
import { useHub } from '@/store/hub';
import { useHr } from '@/hr/store';
import { useExpenses } from '@/expenses/store';
import * as access from './access';
import {
  buildPayrollRunForPeriod,
  computeCompAnalytics,
  periodFromTimestamp,
  type CompAnalyticsReport,
} from './engine';
import { usePayroll } from './store';
import type { PayrollRun } from './types';

export function usePayrollViewer(): access.PayrollViewer | null {
  const sessionUserId = useHub((s) => s.sessionUserId);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => {
    const u = users.find((x) => x.id === sessionUserId) ?? null;
    return access.buildPayrollViewer(u, roles);
  }, [sessionUserId, users, roles]);
}

export function usePayrollCaps() {
  const v = usePayrollViewer();
  return useMemo(
    () => ({
      viewer: v,
      canUse: access.canUsePayroll(v),
      canRun: access.canRunPayroll(v),
      canApprove: access.canApprovePayroll(v),
      canNominateBonus: access.canNominateBonus(v),
      canSeeSensitiveComp: access.canSeeSensitiveComp(v),
    }),
    [v],
  );
}

/**
 * Live-computed PayrollRun list so changes in HR (`comp`, `leave`, `claims`) or
 * Expenses (`payroll_queued` / `reimbursed`) immediately reflect in the Console UI.
 */
export function useLivePayrollRuns(): PayrollRun[] {
  const users = useHub((s) => s.users);
  const comp = useHr((s) => s.comp);
  const leave = useHr((s) => s.leave);
  const claims = useHr((s) => s.claims);
  const elections = useHr((s) => s.elections);
  const expenseReports = useExpenses((s) => s.reports);
  const runs = usePayroll((s) => s.runs);
  const bonuses = usePayroll((s) => s.bonuses);
  const manualAdjustments = usePayroll((s) => s.manualAdjustments);

  return useMemo(() => {
    const currentPeriod = periodFromTimestamp(Date.now(), 0);
    const hasCurrent = runs.some((r) => r.period === currentPeriod);
    const base = hasCurrent
      ? runs
      : [
          buildPayrollRunForPeriod({
            period: currentPeriod,
            users,
            comp,
            leave,
            claims,
            elections,
            expenseReports,
            bonuses,
            manualAdjustments,
            status: 'draft',
          }),
          ...runs,
        ];

    return base
      .map((r) =>
        r.status === 'paid'
          ? r
          : buildPayrollRunForPeriod({
              period: r.period,
              users,
              comp,
              leave,
              claims,
              elections,
              expenseReports,
              bonuses,
              manualAdjustments,
              status: r.status,
              existingMeta: r,
            }),
      )
      .sort((a, b) => b.period.localeCompare(a.period));
  }, [users, comp, leave, claims, elections, expenseReports, runs, bonuses, manualAdjustments]);
}

export function useCompReport(): CompAnalyticsReport {
  const users = useHub((s) => s.users);
  const comp = useHr((s) => s.comp);
  const elections = useHr((s) => s.elections);
  const bonuses = usePayroll((s) => s.bonuses);
  const bands = usePayroll((s) => s.bands);

  return useMemo(
    () => computeCompAnalytics(users, comp, elections, bonuses, bands),
    [users, comp, elections, bonuses, bands],
  );
}

export function useReimbursementQueueSummary() {
  const reports = useExpenses((s) => s.reports);
  const claims = useHr((s) => s.claims);

  return useMemo(() => {
    const queuedExpenses = reports.filter((r) => r.status === 'payroll_queued');
    const inReviewExpenses = reports.filter(
      (r) => r.status === 'submitted' || r.status === 'manager_approved',
    );
    const settledExpenses = reports.filter((r) => r.status === 'reimbursed');
    const approvedHrClaims = claims.filter((c) => c.status === 'approved');

    return {
      queuedExpenses,
      inReviewExpenses,
      settledExpenses,
      approvedHrClaims,
      queuedExpenseTotalAed: queuedExpenses.reduce((s, r) => s + r.reimbursableAed, 0),
      approvedHrClaimsTotalAed: approvedHrClaims.reduce((s, c) => s + c.amount, 0),
    };
  }, [reports, claims]);
}
