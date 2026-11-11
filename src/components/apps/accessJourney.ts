/**
 * Access-request journey — the pure, store-shaped logic behind the access
 * tracker (Requested → Manager review → Security check → Access granted).
 *
 * Everything is derived from real hub data: the request itself, the
 * requester's manager, and the approvers the store would route it to
 * (`requestAccess`: delegated reviewers who hold the app, else active System
 * Admins). The policy checks (`reviewRequest`: separation of duties,
 * delegated approval, active requester, time-boxed grant) run at decision
 * time, so "Security check" completes together with an approval.
 * No React here so it stays unit-testable (see accessJourney.test.ts).
 */
import type { AccessRequest, HubApp, Role, User } from '@/types';
import { appPermissionId } from '@/data/permissions';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import { effectivePermissions, expiryFor, hasPermission, requestRisk, type RiskLevel } from '@/lib/rbac';

const MIN = 60_000;
const DAY = 86_400_000;

/** Review window Control Center works to ("Over 24h — act soon"). */
export const REVIEW_SLA_MS = DAY;
/** How long a decision stays on the requester's tracker after it lands. */
export const RECENT_DECISION_MS = 7 * DAY;

/** Ordered stages; `current === ACCESS_STAGE_COUNT` means access was granted. */
export const ACCESS_STAGE_COUNT = 4;
export const REVIEW_STAGE = 1;

/** How the person on the review stage relates to the requester. */
export type ReviewerKind = 'manager' | 'admin' | 'holder';

export type AccessJourneyState = 'active' | 'blocked' | 'paused' | 'done';

export interface AccessJourneyInputs {
  users: User[];
  roles: Role[];
  apps: HubApp[];
  /** Every request in the hub (used for reviewers' past turnaround). */
  requests: AccessRequest[];
  now: number;
}

export interface AccessJourney {
  request: AccessRequest;
  app?: HubApp;
  requester?: User;
  /** The requester's manager (from the directory), when set. */
  manager?: User;
  /** Who handles (pending) or handled (decided) the review stage. */
  lead?: User;
  leadKind?: ReviewerKind;
  /** People who can decide right now (pending only) — mirrors the store's routing. */
  approvers: User[];
  /** Nobody holds the app, so the request went to System Admins. */
  routedToAdmins: boolean;
  risk: RiskLevel;
  /** 0-based live stage (`ACCESS_STAGE_COUNT` = complete). */
  current: number;
  state: AccessJourneyState;
  /** Why a pending request can't move. */
  stall?: 'requester-inactive' | 'no-approver';
  /** Pending: when the 24h review window closes. */
  dueAt: number;
  /** Pending: share of the review window already used (0..1). */
  elapsed: number;
  /** Median time the lead took on their past decisions (null without history). */
  typicalMs: number | null;
  /** Approved: when the grant lapses (`null` = permanent). */
  expiresAt?: number | null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const kindOf = (u: User, requester: User | undefined, routedToAdmins: boolean): ReviewerKind =>
  requester?.managerId === u.id ? 'manager' : routedToAdmins || u.roleIds.includes(SUPER_ADMIN_ROLE_ID) ? 'admin' : 'holder';

/** Median decision time of a reviewer (approved/denied requests they signed), floored at 5 minutes. */
export function reviewerTurnaround(requests: AccessRequest[], reviewerId: string): number | null {
  const spans = requests
    .filter((r) => r.reviewedBy === reviewerId && r.reviewedAt && (r.status === 'approved' || r.status === 'denied'))
    .map((r) => r.reviewedAt! - r.createdAt)
    .filter((d) => d >= 0);
  return spans.length ? Math.max(5 * MIN, median(spans)) : null;
}

/**
 * Who can approve a request right now, exactly like `requestAccess` routes it:
 * active reviewers (`hub.requests.review`) who hold the app themselves, else
 * active System Admins. The requester never reviews their own request.
 */
export function approversFor(request: AccessRequest, users: User[], roles: Role[], now: number): { approvers: User[]; routedToAdmins: boolean } {
  const perm = appPermissionId(request.appId);
  const holders = users.filter((u) => {
    if (u.id === request.userId) return false;
    const p = effectivePermissions(u, roles, now);
    return hasPermission(p, 'hub.requests.review') && hasPermission(p, perm);
  });
  if (holders.length) return { approvers: holders, routedToAdmins: false };
  return {
    approvers: users.filter((u) => u.active && u.id !== request.userId && u.roleIds.includes(SUPER_ADMIN_ROLE_ID)),
    routedToAdmins: true,
  };
}

export function buildAccessJourney(request: AccessRequest, { users, roles, apps, requests, now }: AccessJourneyInputs): AccessJourney {
  const requester = users.find((u) => u.id === request.userId);
  const manager = requester?.managerId ? users.find((u) => u.id === requester.managerId) : undefined;
  const app = apps.find((a) => a.id === request.appId);
  const risk: RiskLevel = app && requester ? requestRisk(app, requester, roles, request.grantedDuration ?? request.duration) : 'high';
  const dueAt = request.createdAt + REVIEW_SLA_MS;

  const base = { request, app, requester, manager, risk, dueAt, approvers: [] as User[], routedToAdmins: false, typicalMs: null, elapsed: 0 };

  if (request.status !== 'pending') {
    const lead = request.reviewedBy ? users.find((u) => u.id === request.reviewedBy) : undefined;
    const leadKind = lead ? kindOf(lead, requester, false) : undefined;
    if (request.status === 'approved') {
      const perm = appPermissionId(request.appId);
      const grant = request.reviewedAt ? requester?.grants.find((g) => g.permission === perm && g.grantedAt === request.reviewedAt) : undefined;
      const expiresAt = grant ? grant.expiresAt : request.reviewedAt ? expiryFor(request.grantedDuration ?? request.duration, request.reviewedAt) : undefined;
      return { ...base, lead, leadKind, current: ACCESS_STAGE_COUNT, state: 'done', expiresAt };
    }
    // Denied stops at the review stage; a withdrawn request is parked there.
    return { ...base, lead, leadKind, current: REVIEW_STAGE, state: request.status === 'denied' ? 'blocked' : 'paused' };
  }

  // Pending — the review stage is live. Lead with the requester's manager, then
  // someone from their department, then directory order (all are notified).
  const { approvers, routedToAdmins } = approversFor(request, users, roles, now);
  const closeness = (u: User) => (u.id === requester?.managerId ? 0 : u.department === requester?.department ? 1 : 2);
  const lead = [...approvers].sort((a, b) => closeness(a) - closeness(b))[0];
  const leadKind = lead ? kindOf(lead, requester, routedToAdmins) : undefined;
  const elapsed = Math.min(1, Math.max(0, (now - request.createdAt) / REVIEW_SLA_MS));
  const typicalMs = lead ? reviewerTurnaround(requests, lead.id) : null;

  // The store refuses to review requests from deactivated or missing users.
  const stall = !requester || !requester.active ? 'requester-inactive' : !lead ? 'no-approver' : undefined;
  const state: AccessJourneyState = stall === 'requester-inactive' ? 'blocked' : stall === 'no-approver' ? 'paused' : 'active';

  return { ...base, lead, leadKind, approvers, routedToAdmins, current: REVIEW_STAGE, state, stall, elapsed, typicalMs };
}

/** The viewer's latest request for an app, if it is pending or was decided recently (cancelled ones are skipped). */
export function latestTrackedRequest(requests: AccessRequest[], userId: string, appId: string, now: number): AccessRequest | undefined {
  const mine = requests.filter((r) => r.userId === userId && r.appId === appId && r.status !== 'cancelled').sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!mine) return undefined;
  if (mine.status === 'pending') return mine;
  return mine.reviewedAt && now - mine.reviewedAt <= RECENT_DECISION_MS ? mine : undefined;
}

/** `95 min` → `2h` style span for "usually replies in ~2h". */
export function shortSpan(ms: number): string {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`;
  return `${Math.round(ms / DAY)}d`;
}
