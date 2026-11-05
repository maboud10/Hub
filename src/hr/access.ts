/**
 * HR Portal authorisation rules — pure functions (no React), mirrored by the
 * store (which re-checks them) and future Firestore rules.
 *
 *  app:hr               Use the HR Portal (every employee; not contractors)
 *  hr.people.manage     People Ops: decide any request, adjust balances, confirm
 *                       benefits, issue letters, answer cases (never their own)
 *  hub.people.sensitive See pay data of others (everyone sees their own)
 *
 * Line managers approve their direct reports' time off by relationship.
 */
import { hasPermission, type PermissionSet } from '@/lib/rbac';
import type { User } from '@/types';
import type { BenefitClaim, BenefitElection, HrCase, LeaveRequest, LetterRequest } from './types';

export const HR_PERMS = {
  app: 'app:hr',
  manage: 'hr.people.manage',
  sensitive: 'hub.people.sensitive',
} as const;

export interface HrViewer {
  userId: string;
  perms: PermissionSet;
}

export interface Verdict {
  ok: boolean;
  reason?: string;
}

const yes: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export const canUseHR = (v: HrViewer) => hasPermission(v.perms, HR_PERMS.app);
export const canManageHR = (v: HrViewer) => hasPermission(v.perms, HR_PERMS.manage);
/** Pay data: your own, or with `hub.people.sensitive`. */
export const canSeePay = (v: HrViewer, userId: string) => v.userId === userId || hasPermission(v.perms, HR_PERMS.sensitive);
/** Another person's HR records (documents, balances, cases): People Ops only. */
export const canSeeRecords = (v: HrViewer, userId: string) => v.userId === userId || canManageHR(v);

export const isManagerOf = (v: HrViewer, user: Pick<User, 'managerId'> | undefined | null) => !!user && user.managerId === v.userId;

/** Who decides someone's time off: their active line manager, else People Ops. */
export function approverFor(user: Pick<User, 'id' | 'managerId'>, users: Pick<User, 'id' | 'active'>[]): string | undefined {
  const m = user.managerId ? users.find((u) => u.id === user.managerId) : undefined;
  return m && m.active && m.id !== user.id ? m.id : undefined;
}

// ───────────────────────── time off ─────────────────────────
export function canDecideLeave(v: HrViewer, req: LeaveRequest, requester: Pick<User, 'managerId'> | undefined): Verdict {
  if (req.userId === v.userId) return no('Separation of duties: you can’t approve your own time off.');
  if (req.status !== 'pending') return no('This request has already been decided.');
  if (isManagerOf(v, requester) || req.approverId === v.userId) return yes;
  if (canManageHR(v)) return yes;
  return no('Only their manager or People Ops can decide this request.');
}

export function canCancelLeave(v: HrViewer, req: LeaveRequest, today: string): Verdict {
  if (req.status === 'cancelled' || req.status === 'rejected') return no('This request is already closed.');
  if (req.userId === v.userId) {
    if (req.status === 'pending') return yes;
    return req.start > today ? yes : no('Time off that has started can only be changed by People Ops.');
  }
  return canManageHR(v) ? yes : no('Only the requester or People Ops can cancel this.');
}

/** Peers see "Away"; the requester, their manager and People Ops see the type and reason. */
export function canSeeLeaveDetail(v: HrViewer, req: LeaveRequest, requester: Pick<User, 'managerId'> | undefined) {
  return req.userId === v.userId || isManagerOf(v, requester) || canManageHR(v);
}

export function canAdjustBalance(v: HrViewer, userId: string): Verdict {
  if (!canManageHR(v)) return no('Requires “Run HR operations”.');
  if (userId === v.userId) return no('Separation of duties: ask another People Ops partner to adjust your own balance.');
  return yes;
}

// ───────────────────────── benefits, letters, cases ─────────────────────────
function peopleOpsDecision(v: HrViewer, ownerId: string, what: string): Verdict {
  if (ownerId === v.userId) return no(`Separation of duties: you can’t approve your own ${what}.`);
  return canManageHR(v) ? yes : no('Requires “Run HR operations”.');
}

export const canDecideClaim = (v: HrViewer, c: BenefitClaim) => (c.status !== 'submitted' ? no('This claim has already been decided.') : peopleOpsDecision(v, c.userId, 'claim'));
export const canDecideLetter = (v: HrViewer, l: LetterRequest) => (l.status !== 'pending' ? no('This letter has already been handled.') : peopleOpsDecision(v, l.userId, 'letter'));
export const canConfirmElection = (v: HrViewer, e: BenefitElection) => (e.status !== 'submitted' ? no('Nothing to confirm.') : peopleOpsDecision(v, e.userId, 'benefits enrolment'));

export const canSeeCase = (v: HrViewer, c: HrCase) => c.userId === v.userId || canManageHR(v);
export function canReplyCase(v: HrViewer, c: HrCase): Verdict {
  if (c.status === 'closed') return no('This case is resolved. Open a new one if you need more help.');
  if (c.userId === v.userId) return yes;
  return canManageHR(v) ? yes : no('Only People Ops can reply to this case.');
}
