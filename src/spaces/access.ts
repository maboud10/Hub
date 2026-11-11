/**
 * Spaces — capability & permission checks.
 * Full-time employees get `app:spaces`; Workplace Operations (`Operations`
 * department) and IT/Security admins get workplace ops capabilities (ghost-desk
 * sweeps, facility ticket dispatch, security watchlist clearance).
 */
import type { BridgeViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import type { User } from '@/types';
import type { ServiceRequest, Visitor } from './types';

export function hasSpacesPerm(perms: ReadonlySet<string>): boolean {
  return perms.has('*') || perms.has('app:spaces');
}

export function hasSpacesAccess(viewer: BridgeViewer | null | undefined): boolean {
  if (!viewer) return false;
  return hasSpacesPerm(viewer.perms);
}

export function isWorkplaceAdmin(user: User | null | undefined, perms: ReadonlySet<string>): boolean {
  if (!user) return false;
  if (perms.has('*')) return true;
  return (
    user.department === 'Operations' ||
    user.department === 'IT & Security' ||
    user.id === 'u-mateo' ||
    user.id === 'u-layla'
  );
}

export function canManageVisitor(
  user: User | null | undefined,
  perms: ReadonlySet<string>,
  visitor: Pick<Visitor, 'hostId'>,
): boolean {
  if (!user) return false;
  return isWorkplaceAdmin(user, perms) || visitor.hostId === user.id;
}

export function canManageRequest(
  user: User | null | undefined,
  perms: ReadonlySet<string>,
  req: Pick<ServiceRequest, 'requesterId'>,
): boolean {
  if (!user) return false;
  return isWorkplaceAdmin(user, perms) || req.requesterId === user.id;
}

export function useSpacesAccess() {
  const user = useSessionUser();
  const roles = useHub((s) => s.roles);
  const perms = user ? effectivePermissions(user, roles) : new Set<string>();
  const canAccess = hasSpacesPerm(perms);
  const isOpsAdmin = isWorkplaceAdmin(user, perms);
  return { user, perms, canAccess, isOpsAdmin };
}
