/**
 * RBAC & Four-Eyes Separation-of-Duties gates for Helix Payroll Console.
 */
import type { Role, User } from '@/types';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import type { BonusAward, PayrollRun } from './types';

export interface PayrollViewer {
  userId: string;
  perms: Set<string>;
}

export function buildPayrollViewer(user: User | null, roles: Role[]): PayrollViewer | null {
  if (!user || !user.active) return null;
  return {
    userId: user.id,
    perms: effectivePermissions(user, roles),
  };
}

export const canUsePayroll = (v: PayrollViewer | null): boolean =>
  Boolean(v && hasPermission(v.perms, 'app:payroll'));

export const canRunPayroll = (v: PayrollViewer | null): boolean =>
  Boolean(v && (hasPermission(v.perms, 'payroll.run') || hasPermission(v.perms, 'hr.people.manage')));

export const canApprovePayroll = (v: PayrollViewer | null): boolean =>
  Boolean(v && hasPermission(v.perms, 'payroll.approve'));

export const canSeeSensitiveComp = (v: PayrollViewer | null): boolean =>
  Boolean(
    v &&
      (hasPermission(v.perms, 'app:payroll') ||
        hasPermission(v.perms, 'talent.comp.view') ||
        hasPermission(v.perms, 'hub.people.sensitive')),
  );

export const canNominateBonus = (v: PayrollViewer | null): boolean =>
  Boolean(
    v &&
      (hasPermission(v.perms, 'app:payroll') ||
        hasPermission(v.perms, 'expenses.approve') ||
        hasPermission(v.perms, 'talent.hire')),
  );

export type GateResult = { ok: true } | { ok: false; reason: string };

/**
 * Four-eyes control on monthly Pay Run sign-off:
 * The person who prepared & submitted the run (`preparedBy`) CANNOT counter-sign
 * their own run (unless System Admin `*`). Typically Daniel (Finance) prepares and
 * Sara (People Ops) counter-signs, or vice-versa.
 */
export function canCounterSignRun(v: PayrollViewer | null, run: PayrollRun | undefined): GateResult {
  if (!v || !run) return { ok: false, reason: 'Pay run not found.' };
  if (!canApprovePayroll(v)) {
    return { ok: false, reason: 'Requires Payroll Sign-Off (`payroll.approve`) permission.' };
  }
  if (run.status !== 'pending_signoff') {
    return { ok: false, reason: 'Run must be submitted for sign-off first.' };
  }
  if (run.preparedBy === v.userId && !v.perms.has('*')) {
    return {
      ok: false,
      reason: 'Four-eyes separation of duties: a second Finance or People Ops leader must counter-sign the pay run you prepared.',
    };
  }
  return { ok: true };
}

/**
 * Disbursing an approved run (`approved_ready` -> `paid`).
 */
export function canDisburseRun(v: PayrollViewer | null, run: PayrollRun | undefined): GateResult {
  if (!v || !run) return { ok: false, reason: 'Pay run not found.' };
  if (!canRunPayroll(v) && !canApprovePayroll(v)) {
    return { ok: false, reason: 'Requires `payroll.run` or `payroll.approve` permission.' };
  }
  if (run.status !== 'approved_ready') {
    return { ok: false, reason: 'Pay run must complete four-eyes sign-off before WPS bank disbursement.' };
  }
  return { ok: true };
}

/**
 * Bonus approval enforces separation of duties:
 * You cannot approve a bonus awarded to yourself or one that you nominated yourself (unless `*`).
 */
export function canDecideBonus(v: PayrollViewer | null, bonus: BonusAward | undefined): GateResult {
  if (!v || !bonus) return { ok: false, reason: 'Bonus nomination not found.' };
  if (!canApprovePayroll(v)) {
    return { ok: false, reason: 'Requires `payroll.approve` permission.' };
  }
  if (bonus.status !== 'pending_approval') {
    return { ok: false, reason: 'This bonus has already been decided.' };
  }
  if (!v.perms.has('*')) {
    if (bonus.userId === v.userId) {
      return { ok: false, reason: 'Separation of duties: you cannot approve a bonus awarded to yourself.' };
    }
    if (bonus.nominatedBy === v.userId) {
      return { ok: false, reason: 'Four-eyes control: another People Ops or Finance approver must sign off a bonus you nominated.' };
    }
  }
  return { ok: true };
}
