/**
 * Catalog eligibility & approval chains (pure).
 *
 *  - Eligibility by role/department/contractor status, existing devices and
 *    open requests — always with human-readable reasons.
 *  - Approval chain: Manager → IT → Security (sensitive). Steps activate in
 *    order; the requester can never approve their own request.
 */
import type { User } from '@/types';
import type { ApprovalRole, ApprovalStep, CatalogItem, CatalogRequest, Device } from './types';
import { DAY } from './meta';

export type EligibilityStatus = 'eligible' | 'conditional' | 'ineligible';

export interface Eligibility {
  status: EligibilityStatus;
  /** Why it's conditional / not available (empty when simply eligible). */
  reasons: string[];
  /** Whether a written justification is required to submit. */
  needsJustification: boolean;
}

export const isContractor = (u: Pick<User, 'roleIds'>) => u.roleIds.includes('contractor');

const REFRESH_MONTHS = 36;

export function checkEligibility(
  item: CatalogItem,
  ctx: { user: Pick<User, 'id' | 'roleIds' | 'department'>; devices: Device[]; requests: CatalogRequest[]; now: number },
): Eligibility {
  const reasons: string[] = [];
  let status = 'eligible' as EligibilityStatus;
  const downgrade = (to: EligibilityStatus, why: string) => {
    reasons.push(why);
    if (to === 'ineligible' || status === 'eligible') status = to;
  };

  if (isContractor(ctx.user) && !item.contractors) downgrade('ineligible', 'Not available to contractors — ask your Helix sponsor to request it for the team.');

  if (item.departments && !item.departments.includes(ctx.user.department as never)) {
    if (item.strictDepartments) downgrade('ineligible', `Limited to ${listJoin(item.departments)}.`);
    else downgrade('conditional', `Standard for ${listJoin(item.departments)} — tell us how you’ll use it.`);
  }

  const open = ctx.requests.find((r) => r.itemId === item.id && r.requesterId === ctx.user.id && (r.status === 'pending' || r.status === 'approved'));
  if (open) downgrade('ineligible', `You already have ${open.id} in progress.`);

  if (item.kind === 'hardware' && item.deviceKind) {
    const mine = ctx.devices.filter((d) => d.assigneeId === ctx.user.id && d.kind === item.deviceKind && (d.status === 'in_use' || d.status === 'loaner'));
    if (item.deviceKind === 'laptop' && mine.length) {
      const newest = mine.reduce((a, b) => (a.purchasedAt > b.purchasedAt ? a : b));
      const months = Math.floor((ctx.now - newest.purchasedAt) / (30 * DAY));
      if (newest.status !== 'loaner' && months < REFRESH_MONTHS)
        downgrade('conditional', `Your ${newest.model} is ${months} months old (refresh at ${REFRESH_MONTHS}) — explain why you need another.`);
    } else if (mine.length && item.deviceKind !== 'monitor' && item.deviceKind !== 'security-key') {
      downgrade('conditional', `You already have a ${mine[0].model} — tell us what’s wrong with it.`);
    } else if (item.deviceKind === 'security-key' && mine.length >= 2) {
      downgrade('ineligible', 'You already have a primary and a backup security key.');
    }
  }

  if (item.sensitive && status !== 'ineligible') reasons.push('Sensitive access: needs manager, IT and Security approval.');
  return { status, reasons, needsJustification: status === 'conditional' || !!item.sensitive || item.kind === 'access' };
}

function listJoin(xs: readonly string[]): string {
  if (xs.length <= 2) return xs.join(' and ');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Ordered approval chain for a request. */
export function approvalChain(item: CatalogItem, requester: Pick<User, 'id' | 'managerId'>): ApprovalStep[] {
  const steps: ApprovalStep[] = [];
  const needsManager = item.cost > 0 || item.kind === 'access' || !!item.sensitive;
  if (needsManager) {
    steps.push(
      requester.managerId && requester.managerId !== requester.id
        ? { role: 'manager', approverId: requester.managerId, state: 'waiting' }
        : { role: 'manager', state: 'skipped', note: 'No manager on file' },
    );
  }
  steps.push({ role: 'it', state: 'waiting' });
  if (item.sensitive) steps.push({ role: 'security', state: 'waiting' });
  return activateNext(steps);
}

/** Mark the first waiting step as pending (if none is pending already). */
export function activateNext(steps: ApprovalStep[]): ApprovalStep[] {
  if (steps.some((s) => s.state === 'pending' || s.state === 'denied')) return steps;
  const i = steps.findIndex((s) => s.state === 'waiting');
  if (i === -1) return steps;
  return steps.map((s, j) => (j === i ? { ...s, state: 'pending' } : s));
}

export const currentStep = (r: Pick<CatalogRequest, 'steps' | 'status'>) => (r.status === 'pending' ? r.steps.find((s) => s.state === 'pending') : undefined);

export interface Approver {
  id: string;
  isIT: boolean;
  isSecurity: boolean;
}

/** Can this person decide the request's current step? */
export function canDecide(r: CatalogRequest, who: Approver): { ok: boolean; reason?: string } {
  const step = currentStep(r);
  if (!step) return { ok: false, reason: 'Nothing to approve' };
  if (r.requesterId === who.id) return { ok: false, reason: 'You can’t approve your own request' };
  if (step.role === 'manager') return step.approverId === who.id ? { ok: true } : { ok: false, reason: 'Waiting on the requester’s manager' };
  if (step.role === 'it') return who.isIT ? { ok: true } : { ok: false, reason: 'Waiting on IT' };
  return who.isSecurity ? { ok: true } : { ok: false, reason: 'Waiting on Security' };
}

/** Pure transition for approve / deny of the current step. */
export function decide(r: CatalogRequest, who: Approver, approve: boolean, note: string | undefined, now: number): CatalogRequest {
  const step = currentStep(r);
  if (!step || !canDecide(r, who).ok) return r;
  const idx = r.steps.indexOf(step);
  let steps = r.steps.map((s, i) => (i === idx ? { ...s, state: (approve ? 'approved' : 'denied') as ApprovalStep['state'], decidedBy: who.id, decidedAt: now, note } : s));
  if (!approve) return { ...r, steps, status: 'denied', updatedAt: now };
  steps = activateNext(steps);
  const done = steps.every((s) => s.state === 'approved' || s.state === 'skipped');
  return { ...r, steps, status: done ? 'approved' : 'pending', updatedAt: now };
}

/** Who should be notified for the step that is now pending. */
export function pendingRole(r: CatalogRequest): ApprovalRole | undefined {
  return currentStep(r)?.role;
}
