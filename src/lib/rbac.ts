/**
 * Permission engine — pure functions, no React. Mirrors what a backend policy
 * service would do, so it can be moved server-side unchanged.
 */
import type {
  AccessRequest,
  AppWithAccess,
  Clearance,
  Grant,
  GrantDuration,
  HubApp,
  PermissionDef,
  Role,
  User,
} from '@/types';
import { HUB_PERMISSIONS, appPermissionId } from '@/data/permissions';

export type PermissionSet = ReadonlySet<string>;

const DAY = 86_400_000;

/** `*` matches everything; `app:*` / `hub.users.*` match by prefix. */
export function matchesPermission(granted: string, required: string): boolean {
  if (granted === required || granted === '*') return true;
  if (granted.endsWith('*')) return required.startsWith(granted.slice(0, -1));
  return false;
}

export function hasPermission(perms: PermissionSet, required: string): boolean {
  if (perms.has(required) || perms.has('*')) return true;
  for (const p of perms) if (p.endsWith('*') && matchesPermission(p, required)) return true;
  return false;
}

export const hasAny = (perms: PermissionSet, required: readonly string[]) => required.some((r) => hasPermission(perms, r));
export const hasAll = (perms: PermissionSet, required: readonly string[]) => required.every((r) => hasPermission(perms, r));

export const isGrantActive = (g: Grant, now = Date.now()) => g.expiresAt === null || g.expiresAt > now;

export function effectivePermissions(user: User | null | undefined, roles: Role[], now = Date.now()): Set<string> {
  const set = new Set<string>();
  if (!user || !user.active) return set;
  for (const roleId of user.roleIds) {
    const role = roles.find((r) => r.id === roleId);
    role?.permissions.forEach((p) => set.add(p));
  }
  for (const g of user.grants) if (isGrantActive(g, now)) set.add(g.permission);
  return set;
}

export function clearanceOf(user: User | null | undefined, roles: Role[]): Clearance | 0 {
  if (!user) return 0;
  let max = 0;
  for (const roleId of user.roleIds) {
    const role = roles.find((r) => r.id === roleId);
    if (role && role.clearance > max) max = role.clearance;
  }
  return max as Clearance | 0;
}

/** Highest-clearance role, used as the user's "headline" role. */
export function primaryRole(user: User, roles: Role[]): Role | undefined {
  return user.roleIds
    .map((id) => roles.find((r) => r.id === id))
    .filter((r): r is Role => !!r)
    .sort((a, b) => b.clearance - a.clearance)[0];
}

export function durationToMs(d: GrantDuration): number | null {
  switch (d) {
    case '7d':
      return 7 * DAY;
    case '30d':
      return 30 * DAY;
    case '90d':
      return 90 * DAY;
    default:
      return null;
  }
}

export const expiryFor = (d: GrantDuration, from = Date.now()) => {
  const ms = durationToMs(d);
  return ms === null ? null : from + ms;
};

export const DURATION_LABEL: Record<GrantDuration, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  permanent: 'Permanent',
};

export function rolesGranting(roles: Role[], permission: string): Role[] {
  return roles.filter((r) => r.permissions.some((p) => matchesPermission(p, permission)));
}

export interface AccessExplanation {
  roles: Role[];
  grant?: Grant;
}

/** "Why do I have access?" — transparency for users and auditors. */
export function explainAccess(user: User, roles: Role[], permission: string, now = Date.now()): AccessExplanation {
  const viaRoles = user.roleIds
    .map((id) => roles.find((r) => r.id === id))
    .filter((r): r is Role => !!r && r.permissions.some((p) => matchesPermission(p, permission)));
  const grant = user.grants.find((g) => g.permission === permission && isGrantActive(g, now));
  return { roles: viaRoles, grant };
}

/** Resolve every app's access state for a user. */
export function computeAppAccess(
  user: User | null,
  roles: Role[],
  apps: HubApp[],
  requests: AccessRequest[],
  now = Date.now(),
): AppWithAccess[] {
  if (!user) return [];
  const perms = effectivePermissions(user, roles, now);
  const canManage = hasPermission(perms, 'hub.apps.manage');
  const result: AppWithAccess[] = [];

  for (const app of apps) {
    const perm = appPermissionId(app.id);
    if (!app.enabled) {
      if (canManage) result.push({ app, access: 'disabled' });
      continue;
    }
    if (hasPermission(perms, perm)) {
      const viaRole = user.roleIds.some((id) => roles.find((r) => r.id === id)?.permissions.some((p) => matchesPermission(p, perm)));
      const grant = user.grants.find((g) => g.permission === perm && isGrantActive(g, now));
      result.push({ app, access: 'granted', expiresAt: !viaRole && grant ? grant.expiresAt : undefined });
      continue;
    }
    const pending = requests.find((r) => r.userId === user.id && r.appId === app.id && r.status === 'pending');
    if (pending) {
      result.push({ app, access: 'pending', pendingRequestId: pending.id });
      continue;
    }
    if (app.discoverable || canManage) result.push({ app, access: 'locked' });
  }
  return result;
}

export function usersWithPermission(users: User[], roles: Role[], permission: string, now = Date.now()): User[] {
  return users.filter((u) => hasPermission(effectivePermissions(u, roles, now), permission));
}

export type RiskLevel = 'low' | 'medium' | 'high';

/** Heuristic risk score shown to reviewers. */
export function requestRisk(app: HubApp, requester: User, roles: Role[], duration: GrantDuration): RiskLevel {
  let score = 0;
  if (app.category === 'Security' || app.category === 'Finance' || app.id === 'cloud' || app.id === 'payroll') score += 2;
  if (app.category === 'Engineering' || app.category === 'Growth') score += 1;
  if (clearanceOf(requester, roles) <= 1) score += 1;
  if (duration === 'permanent') score += 1;
  if (duration === '90d') score += 0.5;
  return score >= 3 ? 'high' : score >= 1.5 ? 'medium' : 'low';
}

/** Delegated approval: reviewers can only approve access they hold themselves. */
export function canReviewRequest(reviewerPerms: PermissionSet, appId: string): { ok: boolean; reason?: string } {
  if (!hasPermission(reviewerPerms, 'hub.requests.review')) return { ok: false, reason: 'You cannot review access requests.' };
  if (!hasPermission(reviewerPerms, appPermissionId(appId)))
    return { ok: false, reason: 'You can only approve access you hold yourself.' };
  return { ok: true };
}

/** Anti-escalation: actors can only assign/remove roles at or below their own clearance. */
export const canAssignRole = (actorClearance: number, role: Role) => role.clearance <= actorClearance;

export function buildPermissionCatalog(apps: HubApp[]): PermissionDef[] {
  return [
    ...HUB_PERMISSIONS,
    ...apps.map<PermissionDef>((a) => ({
      id: appPermissionId(a.id),
      label: a.name,
      description: a.tagline,
      category: 'Apps',
      sensitive: a.category === 'Security' || a.id === 'payroll' || a.id === 'cloud',
    })),
  ];
}
