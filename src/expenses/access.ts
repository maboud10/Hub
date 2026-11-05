/**
 * Permission & separation-of-duties rules for Helix Spend & Mobility:
 *  - `app:expenses` or `app:travel` unlocks personal Travel & Expense workflows.
 *  - Managers (`expenses.approve` / `managerId`) pre-approve direct reports' trips
 *    and perform first-stage review on submitted Expense Reports.
 *  - Finance (`expenses.audit`) performs VAT/GL audit, queues approved reports
 *    into Payroll, and manages virtual corporate cards.
 *  - Strict separation of duties: nobody approves or audits their own trip/claim
 *    (except System Admin `*` break-glass in demo).
 */
import type { User } from '@/types';
import { hasAny, hasPermission } from '@/lib/rbac';
import type { ExpenseReport, TravelRequest } from './types';

export interface ExpensesViewer {
  userId: string;
  perms: Set<string>;
}

export type Gate = { ok: true } | { ok: false; reason: string };
const allow: Gate = { ok: true };
const deny = (reason: string): Gate => ({ ok: false, reason });

export const canUseExpenses = (v: ExpensesViewer | null): boolean =>
  !!v && hasAny(v.perms, ['app:expenses', 'app:travel']);

export const canApproveExpenses = (v: ExpensesViewer | null): boolean =>
  !!v && canUseExpenses(v) && hasAny(v.perms, ['expenses.approve', 'expenses.audit', 'hr.people.manage']);

export const canAuditExpenses = (v: ExpensesViewer | null): boolean =>
  !!v && hasAny(v.perms, ['expenses.audit', 'app:finance']);

export const isManagerOf = (v: ExpensesViewer | null, target: User | undefined): boolean =>
  !!v && !!target && target.managerId === v.userId;

export function canSeeTrip(v: ExpensesViewer | null, trip: TravelRequest, requester?: User): boolean {
  if (!v || !canUseExpenses(v)) return false;
  if (trip.userId === v.userId) return true;
  if (canAuditExpenses(v) || hasPermission(v.perms, 'hr.people.manage')) return true;
  return isManagerOf(v, requester);
}

export function canSeeReport(v: ExpensesViewer | null, report: ExpenseReport, requester?: User): boolean {
  if (!v || (!canUseExpenses(v) && !hasPermission(v.perms, 'app:payroll'))) return false;
  if (report.userId === v.userId) return true;
  if (canAuditExpenses(v) || hasPermission(v.perms, 'app:payroll') || hasPermission(v.perms, 'hr.people.manage')) {
    return true;
  }
  return isManagerOf(v, requester);
}

export function canDecideTrip(v: ExpensesViewer | null, trip: TravelRequest | undefined, requester?: User): Gate {
  if (!v || !canUseExpenses(v)) return deny('Travel & Expenses access required.');
  if (!trip || trip.status !== 'pending_approval') return deny('This travel request is no longer awaiting approval.');
  if (trip.userId === v.userId && !hasPermission(v.perms, '*')) {
    return deny('Separation of duties: your manager or Finance must approve your own travel request.');
  }
  if (isManagerOf(v, requester) || canAuditExpenses(v) || (canApproveExpenses(v) && !requester?.managerId)) {
    return allow;
  }
  return deny('Only the traveller’s manager or Finance can approve this trip.');
}

export function canManagerDecideReport(
  v: ExpensesViewer | null,
  report: ExpenseReport | undefined,
  requester?: User,
): Gate {
  if (!v || !canUseExpenses(v)) return deny('Expenses access required.');
  if (!report || report.status !== 'submitted') return deny('This report is not awaiting manager review.');
  if (report.userId === v.userId && !hasPermission(v.perms, '*')) {
    return deny('Separation of duties: you cannot approve your own expense report.');
  }
  if (isManagerOf(v, requester) || canAuditExpenses(v) || (canApproveExpenses(v) && !requester?.managerId)) {
    return allow;
  }
  return deny('Only the employee’s manager or Finance can review this report.');
}

export function canFinanceAuditReport(v: ExpensesViewer | null, report: ExpenseReport | undefined): Gate {
  if (!v || !canAuditExpenses(v)) return deny('Requires Finance Expense Audit (`expenses.audit`) permission.');
  if (!report || report.status !== 'manager_approved') {
    return deny('Report must pass manager review before Finance queues it for payroll.');
  }
  if (report.userId === v.userId && !hasPermission(v.perms, '*')) {
    return deny('Separation of duties: another Finance auditor must sign off your own expenses.');
  }
  return allow;
}
