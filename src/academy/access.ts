/**
 * Permission rules for Helix Academy.
 *
 *  - `app:learning` unlocks the Academy module.
 *  - `academy.manage` (People Ops / L&D / System Admin) manages the catalog,
 *    company-wide compliance, onboarding training rules, and bulk assignments.
 *  - Managers can view their direct reports' training progress and assign or
 *    recommend courses to their own team (separation of duties: never assign
 *    mandatory compliance to someone outside your reporting line without `academy.manage`).
 */
import type { User } from '@/types';
import { hasPermission } from '@/lib/rbac';

export interface AcademyViewer {
  userId: string;
  perms: Set<string>;
}

export const canUseAcademy = (v: AcademyViewer | null): boolean => !!v && hasPermission(v.perms, 'app:learning');

export const canManageAcademy = (v: AcademyViewer | null): boolean =>
  !!v && canUseAcademy(v) && hasPermission(v.perms, 'academy.manage');

export const isDirectManager = (v: AcademyViewer | null, target: User | undefined): boolean =>
  !!v && !!target && target.managerId === v.userId;

export function canViewLearner(v: AcademyViewer | null, target: User | undefined): boolean {
  if (!v || !target || !canUseAcademy(v)) return false;
  if (v.userId === target.id) return true;
  if (canManageAcademy(v)) return true;
  return isDirectManager(v, target);
}

export function canAssignCourse(
  v: AcademyViewer | null,
  target: User | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!v || !canUseAcademy(v)) return { ok: false, reason: 'Academy access is required.' };
  if (!target || !target.active) return { ok: false, reason: 'Choose an active team member.' };
  if (canManageAcademy(v)) return { ok: true };
  if (isDirectManager(v, target)) return { ok: true };
  return { ok: false, reason: 'Only People Ops / L&D or the person’s direct manager can assign training.' };
}
