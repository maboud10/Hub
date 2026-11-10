/**
 * Performance & OKRs permissions and privacy — pure functions.
 *
 *  - Employees: own OKRs (create/edit individual), view public OKRs, own check-ins,
 *    give/request feedback, own 1:1s and growth plan.
 *  - Managers (anyone with direct reports via `managerId`): team view, manager reviews
 *    for direct reports, calibration for their org, reports' "recipient + manager" feedback.
 *  - `performance.manage`: cycles, all reviews (viewing someone else's packet is audited),
 *    calibration across the org, insights.
 *  - Private notes: author only. Peer anonymity is respected toward the employee.
 *    Upward feedback is only ever shown aggregated, and only with enough responses.
 *
 * The store re-checks all of this on every action (the UI hiding a button is only UX).
 */
import type { User } from '@/types';
import { hasPermission } from '@/lib/rbac';
import type { CycleFeedback, Feedback, Objective, OkrLevel, OneOnOneSeries, Review } from './types';

export const ADMIN_PERM = 'performance.manage';
export const APP_PERM = 'app:performance';

export interface PerfViewer {
  id: string;
  perms: ReadonlySet<string>;
}

type Dir = Pick<User, 'id' | 'managerId' | 'active'>[];

export type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

export const isAdmin = (v: PerfViewer) => hasPermission(v.perms, ADMIN_PERM);
export const hasApp = (v: PerfViewer) => hasPermission(v.perms, APP_PERM);

/* ───────── Org chart ───────── */

export function directReportIds(users: Dir, managerId: string): string[] {
  return users.filter((u) => u.active && u.managerId === managerId).map((u) => u.id);
}

export const hasReports = (users: Dir, id: string) => users.some((u) => u.active && u.managerId === id);

/** Managers above `userId`, nearest first (cycle-safe). */
export function managerChain(users: Dir, userId: string): string[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const chain: string[] = [];
  let cur = byId.get(userId)?.managerId;
  while (cur && !chain.includes(cur) && cur !== userId) {
    chain.push(cur);
    cur = byId.get(cur)?.managerId;
  }
  return chain;
}

export const isManagerOf = (users: Dir, managerId: string, userId: string) => users.find((u) => u.id === userId)?.managerId === managerId;
export const isAbove = (users: Dir, leaderId: string, userId: string) => leaderId !== userId && managerChain(users, userId).includes(leaderId);

/** Everyone below `leaderId` (transitively). */
export function orgIds(users: Dir, leaderId: string): string[] {
  return users.filter((u) => u.active && isAbove(users, leaderId, u.id)).map((u) => u.id);
}

/* ───────── OKRs ───────── */

export const isObjectiveOwner = (v: PerfViewer, o: Pick<Objective, 'ownerId' | 'coOwnerIds'>) => o.ownerId === v.id || o.coOwnerIds.includes(v.id);

export function canViewObjective(v: PerfViewer, users: Dir, o: Pick<Objective, 'visibility' | 'ownerId' | 'coOwnerIds'>): boolean {
  if (o.visibility === 'public') return true;
  if (isObjectiveOwner(v, o)) return true;
  if (isAbove(users, v.id, o.ownerId)) return true;
  return isAdmin(v);
}

export function canEditObjective(v: PerfViewer, users: Dir, o: Pick<Objective, 'level' | 'ownerId' | 'coOwnerIds'>): boolean {
  if (isObjectiveOwner(v, o) || isAdmin(v)) return true;
  return o.level !== 'company' && isAbove(users, v.id, o.ownerId);
}

export function canCreateObjective(v: PerfViewer, users: Dir, level: OkrLevel, ownerId: string): Check {
  if (level === 'company') return isAdmin(v) ? yes : no('Company objectives are set by People Ops and leadership.');
  if (level === 'team') {
    if (!(isAdmin(v) || hasReports(users, v.id))) return no('Team objectives are set by people managers.');
    if (ownerId !== v.id && !isAdmin(v) && !isAbove(users, v.id, ownerId)) return no('Team objectives can be owned by you or someone in your org.');
    return yes;
  }
  if (ownerId === v.id || isAdmin(v) || isAbove(users, v.id, ownerId)) return yes;
  return no('You can create objectives for yourself or for people in your org.');
}

export function canCheckIn(v: PerfViewer, users: Dir, krOwnerId: string, o: Pick<Objective, 'level' | 'ownerId' | 'coOwnerIds' | 'state'>): Check {
  if (o.state === 'closed') return no('This objective is closed.');
  if (krOwnerId === v.id || canEditObjective(v, users, o)) return yes;
  return no('Only the key result owner, objective owners and their managers can check in.');
}

/* ───────── Reviews ───────── */

export type ReviewRole = 'employee' | 'manager' | 'skip' | 'admin' | 'none';

export function reviewRole(v: PerfViewer, users: Dir, r: Pick<Review, 'employeeId' | 'managerId'>): ReviewRole {
  if (r.employeeId === v.id) return 'employee';
  if (r.managerId === v.id) return 'manager';
  if (isAbove(users, v.id, r.employeeId)) return 'skip';
  if (isAdmin(v)) return 'admin';
  return 'none';
}

export interface ReviewAccess {
  role: ReviewRole;
  canView: boolean;
  seeSelf: boolean;
  editSelf: boolean;
  seeManager: boolean;
  editManager: boolean;
  seePrivateNote: boolean;
  /** none · anonymized (respect each peer's anonymity) · named (managers/admins see authors) */
  seePeers: 'none' | 'anonymized' | 'named';
  calibrate: boolean;
  release: boolean;
  acknowledge: boolean;
  /** Viewing writes an audit entry (People Ops looking at someone else's packet). */
  audited: boolean;
}

/** What `v` may see/do on a review packet (time windows are checked separately by the cycle engine). */
export function reviewAccess(v: PerfViewer, users: Dir, r: Review): ReviewAccess {
  const role = reviewRole(v, users, r);
  const released = !!r.release;
  const selfIn = r.self.status === 'submitted';
  const base: ReviewAccess = {
    role,
    canView: role !== 'none',
    seeSelf: false,
    editSelf: false,
    seeManager: false,
    editManager: false,
    seePrivateNote: false,
    seePeers: 'none',
    calibrate: false,
    release: false,
    acknowledge: false,
    audited: false,
  };
  switch (role) {
    case 'employee':
      return { ...base, seeSelf: true, editSelf: !released, seeManager: released, seePeers: released ? 'anonymized' : 'none', acknowledge: released && !r.release?.acknowledgedAt };
    case 'manager':
      return { ...base, seeSelf: selfIn || released, seeManager: true, editManager: !released, seePrivateNote: r.manager.authorId === v.id, seePeers: 'named', calibrate: true, release: !released };
    case 'skip':
      return { ...base, seeSelf: selfIn || released, seeManager: r.manager.status === 'submitted' || released, seePeers: 'named', calibrate: true, release: isAdmin(v) && !released };
    case 'admin':
      return { ...base, seeSelf: selfIn || released, seeManager: r.manager.status !== 'not-started', seePeers: 'named', calibrate: true, release: !released, audited: true };
    default:
      return base;
  }
}

/** Should the author of a peer item be shown to `v`? */
export function peerAuthorVisible(access: ReviewAccess, item: Pick<CycleFeedback, 'anonymous' | 'authorId'>, viewerId: string): boolean {
  if (item.authorId === viewerId) return true;
  if (access.seePeers === 'named') return true;
  if (access.seePeers === 'anonymized') return !item.anonymous;
  return false;
}

/** Upward feedback is visible (aggregated only) to the manager, their chain and admins — with ≥ `min` responses. */
export function upwardAccess(v: PerfViewer, users: Dir, managerId: string, items: Pick<CycleFeedback, 'status'>[], min: number): { allowed: boolean; visible: boolean; count: number } {
  const allowed = v.id === managerId || isAbove(users, v.id, managerId) || isAdmin(v);
  const count = items.filter((i) => i.status === 'submitted').length;
  return { allowed, visible: allowed && count >= min, count };
}

/* ───────── Continuous feedback ───────── */

export function canViewFeedback(v: PerfViewer, users: Dir, f: Pick<Feedback, 'fromId' | 'toId' | 'visibility'>): boolean {
  if (f.fromId === v.id || f.toId === v.id) return true;
  if (f.visibility === 'public') return true;
  if (f.visibility === 'manager') return isManagerOf(users, v.id, f.toId);
  return false;
}

/* ───────── 1:1s, growth, evidence ───────── */

export const isSeriesMember = (v: PerfViewer, s: Pick<OneOnOneSeries, 'leadId' | 'memberId'>) => s.leadId === v.id || s.memberId === v.id;

export function canViewGrowth(v: PerfViewer, users: Dir, userId: string) {
  return userId === v.id || isAbove(users, v.id, userId) || isAdmin(v);
}

export function canEditGrowth(v: PerfViewer, users: Dir, userId: string) {
  return userId === v.id || isManagerOf(users, v.id, userId) || isAdmin(v);
}

/** Evidence can be pinned by the person themself, their manager, or People Ops. */
export function canAddEvidence(v: PerfViewer, users: Dir, userId: string): Check {
  if (userId === v.id || isManagerOf(users, v.id, userId) || isAdmin(v)) return yes;
  return no('Only the person, their manager or People Ops can add evidence.');
}

/* ───────── Manager & admin surfaces ───────── */

export const canSeeTeam = (v: PerfViewer, users: Dir) => hasReports(users, v.id) || isAdmin(v);
export const canCalibrate = (v: PerfViewer, users: Dir) => hasReports(users, v.id) || isAdmin(v);
export const canSeeInsights = (v: PerfViewer, users: Dir) => hasReports(users, v.id) || isAdmin(v);

/** Who `v` may place on the 9-box (managers: their org; admins: everyone in scope). */
export function calibrationScope(v: PerfViewer, users: Dir, participantIds: string[]): string[] {
  if (isAdmin(v)) return participantIds.filter((id) => id !== v.id);
  const org = new Set(orgIds(users, v.id));
  return participantIds.filter((id) => org.has(id));
}

/** Who `v` may nudge about a cycle. */
export function canNudge(v: PerfViewer, users: Dir, userId: string): boolean {
  return isAdmin(v) || isAbove(users, v.id, userId);
}
