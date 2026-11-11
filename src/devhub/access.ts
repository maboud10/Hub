/**
 * DevHub ("Forge") — in-app capability checks derived from the signed-in
 * viewer's roles, permissions and department.
 */
import type { BridgeViewer } from '@/lib/appBridge';
import { currentViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import type { User } from '@/types';

export interface DevHubCapabilities {
  canView: boolean;
  canReview: boolean;
  canMerge: boolean;
  canDeploy: boolean;
  canFreeze: boolean;
  canManageCatalog: boolean;
  isLead: boolean;
  isContractor: boolean;
}

export function capabilitiesFor(viewer: BridgeViewer | null): DevHubCapabilities {
  if (!viewer) {
    return {
      canView: false,
      canReview: false,
      canMerge: false,
      canDeploy: false,
      canFreeze: false,
      canManageCatalog: false,
      isLead: false,
      isContractor: false,
    };
  }
  const { user, perms } = viewer;
  const isAdmin = perms.has('*');
  const canView = isAdmin || perms.has('app:devhub');
  const isContractor = user.roleIds.includes('contractor');
  const isManager = user.roleIds.includes('manager');
  const isLead = isAdmin || isManager || user.id === 'u-priya' || user.id === 'u-lucas';
  const canFreeze = isLead || perms.has('app:incidents') || user.department === 'IT & Security';

  return {
    canView,
    canReview: canView,
    canMerge: canView,
    canDeploy: canView && !isContractor,
    canFreeze: canView && canFreeze,
    canManageCatalog: canView && !isContractor,
    isLead,
    isContractor,
  };
}

export function capabilitiesForUser(user: User | null | undefined): DevHubCapabilities {
  if (!user) return capabilitiesFor(null);
  const roles = useHub.getState().roles;
  const perms = effectivePermissions(user, roles);
  return capabilitiesFor({ user, roles, perms });
}

export function useDevHubAccess(): DevHubCapabilities {
  const sessionUserId = useHub((s) => s.sessionUserId);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const user = users.find((u) => u.id === sessionUserId) ?? null;
  if (!user) return capabilitiesFor(null);
  return capabilitiesFor({ user, roles, perms: effectivePermissions(user, roles) });
}

export function hasBridgeReadAccess(viewer: BridgeViewer | null | undefined): boolean {
  if (!viewer) return false;
  return (
    viewer.perms.has('*') ||
    viewer.perms.has('app:devhub') ||
    viewer.perms.has('app:incidents') ||
    viewer.perms.has('app:cloud')
  );
}

export function hasBridgeFreezeAccess(viewer: BridgeViewer | null | undefined): boolean {
  if (!viewer) return false;
  return viewer.perms.has('*') || viewer.perms.has('app:devhub') || viewer.perms.has('app:incidents');
}

export { currentViewer };
