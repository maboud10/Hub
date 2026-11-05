/**
 * Memoised selectors & 7-stage journey progress projections for Travel & Expenses.
 */
import { useMemo } from 'react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import * as access from './access';
import { DEPT_QUARTERLY_TRAVEL_BUDGET_AED } from './constants';
import { useExpenses } from './store';
import type { ExpenseReport, ReceiptItem, SpendFlowStage, TravelRequest } from './types';

export function useExpensesViewer(): access.ExpensesViewer | null {
  const user = useSessionUser();
  const perms = usePermissions();
  return useMemo(() => (user ? { userId: user.id, perms } : null), [user, perms]);
}

export interface ExpensesCaps {
  canUse: boolean;
  canApprove: boolean;
  canAudit: boolean;
  isManager: boolean;
}

export function useExpensesCaps(): ExpensesCaps {
  const v = useExpensesViewer();
  const users = useHub((s) => s.users);
  return useMemo(() => {
    if (!v) return { canUse: false, canApprove: false, canAudit: false, isManager: false };
    const isManager = users.some((u) => u.active && u.managerId === v.userId);
    return {
      canUse: access.canUseExpenses(v),
      canApprove: access.canApproveExpenses(v) || isManager,
      canAudit: access.canAuditExpenses(v),
      isManager,
    };
  }, [v, users]);
}

/** Compute the exact 1..7 process stage for any Trip + optional linked ExpenseReport. */
export function computeJourneyStage(
  trip: TravelRequest | undefined,
  report: ExpenseReport | undefined,
  unbundledReceiptsCount = 0,
): SpendFlowStage {
  if (report) {
    if (report.status === 'reimbursed') return 7;
    if (report.status === 'payroll_queued') return 6;
    if (report.status === 'submitted' || report.status === 'manager_approved') return 5;
    return 4;
  }
  if (unbundledReceiptsCount > 0) return 3;
  if (trip) {
    if (trip.status === 'approved' || trip.status === 'booked' || trip.status === 'completed') return 2;
    return 1;
  }
  return 1;
}

export function useMySpendSummary() {
  const me = useSessionUser();
  const trips = useExpenses((s) => s.trips);
  const receipts = useExpenses((s) => s.receipts);
  const reports = useExpenses((s) => s.reports);

  return useMemo(() => {
    const uid = me?.id ?? '';
    const myTrips = trips.filter((t) => t.userId === uid);
    const myReceipts = receipts.filter((r) => r.userId === uid);
    const unbundledReceipts = myReceipts.filter((r) => !r.reportId);
    const myReports = reports.filter((r) => r.userId === uid);

    const pendingReimbursementAed = myReports
      .filter((r) => r.status === 'submitted' || r.status === 'manager_approved' || r.status === 'payroll_queued')
      .reduce((sum, r) => sum + r.reimbursableAed, 0);

    const queuedPayrollAed = myReports
      .filter((r) => r.status === 'payroll_queued')
      .reduce((sum, r) => sum + r.reimbursableAed, 0);

    const reimbursedYtdAed = myReports
      .filter((r) => r.status === 'reimbursed')
      .reduce((sum, r) => sum + r.reimbursableAed, 0);

    const unsubmittedVaultAed = unbundledReceipts
      .filter((r) => r.paymentMethod === 'personal_reimbursable')
      .reduce((sum, r) => sum + r.amountAed, 0);

    return {
      myTrips,
      myReceipts,
      unbundledReceipts,
      myReports,
      pendingReimbursementAed,
      queuedPayrollAed,
      reimbursedYtdAed,
      unsubmittedVaultAed,
    };
  }, [me, trips, receipts, reports]);
}

export interface SpendApprovalQueue {
  pendingTrips: TravelRequest[];
  managerReports: ExpenseReport[];
  financeReports: ExpenseReport[];
  totalCount: number;
}

export function computeSpendApprovals(
  v: access.ExpensesViewer | null,
  trips: TravelRequest[],
  reports: ExpenseReport[],
  users: User[],
): SpendApprovalQueue {
  if (!v) return { pendingTrips: [], managerReports: [], financeReports: [], totalCount: 0 };
  const byId = new Map(users.map((u) => [u.id, u]));
  const pendingTrips = trips.filter((t) => access.canDecideTrip(v, t, byId.get(t.userId)).ok);
  const managerReports = reports.filter((r) => access.canManagerDecideReport(v, r, byId.get(r.userId)).ok);
  const financeReports = reports.filter((r) => access.canFinanceAuditReport(v, r).ok);
  return {
    pendingTrips,
    managerReports,
    financeReports,
    totalCount: pendingTrips.length + managerReports.length + financeReports.length,
  };
}

export function useSpendApprovals(): SpendApprovalQueue {
  const v = useExpensesViewer();
  const trips = useExpenses((s) => s.trips);
  const reports = useExpenses((s) => s.reports);
  const users = useHub((s) => s.users);
  return useMemo(() => computeSpendApprovals(v, trips, reports, users), [v, trips, reports, users]);
}

export function useDeptTravelBudget() {
  const me = useSessionUser();
  const trips = useExpenses((s) => s.trips);
  return useMemo(() => {
    const dept = me?.department ?? 'Engineering';
    const budgetAed = DEPT_QUARTERLY_TRAVEL_BUDGET_AED[dept] ?? 40_000;
    const committedAed = trips
      .filter((t) => t.department === dept && t.status !== 'rejected' && t.status !== 'cancelled')
      .reduce((sum, t) => sum + t.totalEstimatedAed, 0);
    const pct = Math.min(100, Math.round((committedAed / budgetAed) * 100));
    return { dept, budgetAed, committedAed, remainingAed: Math.max(0, budgetAed - committedAed), pct };
  }, [me, trips]);
}

export function useVisibleReceipts(): ReceiptItem[] {
  const v = useExpensesViewer();
  const receipts = useExpenses((s) => s.receipts);
  const users = useHub((s) => s.users);
  return useMemo(() => {
    if (!v || !access.canUseExpenses(v)) return [];
    if (access.canAuditExpenses(v)) return receipts;
    const byId = new Map(users.map((u) => [u.id, u]));
    return receipts.filter((r) => r.userId === v.userId || byId.get(r.userId)?.managerId === v.userId);
  }, [v, receipts, users]);
}
