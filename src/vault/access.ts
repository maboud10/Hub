/**
 * Aegis Vault — Role & Capability Gating
 *
 * - Full-time employees (`app:vault` or `*`): Personal vault, team vaults, JIT requests.
 * - Engineers (`app:devhub` or `*`): Service Secrets & Rotation, Certificates & Keys.
 * - Security Admins (`*` or department `IT & Security` → Layla Haddad, Ethan Brooks):
 *   Tamper-evident Audit trail, JIT approvals queue, break-glass oversight, org-wide hygiene.
 */
import type { BridgeViewer } from '@/lib/appBridge';
import { currentViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import type { User } from '@/types';

export interface VaultCapabilities {
  canUseVault: boolean;
  isEngineer: boolean;
  isSecurityAdmin: boolean;
  canApproveJit: boolean;
  canViewAudit: boolean;
}

export function getCapabilitiesForViewer(viewer: BridgeViewer | null): VaultCapabilities {
  if (!viewer || !viewer.user) {
    return {
      canUseVault: false,
      isEngineer: false,
      isSecurityAdmin: false,
      canApproveJit: false,
      canViewAudit: false,
    };
  }
  const { user, perms } = viewer;
  const isAdmin = perms.has('*');
  const canUseVault = isAdmin || perms.has('app:vault');
  const isEngineer = canUseVault && (isAdmin || perms.has('app:devhub'));
  const isSecurityAdmin = canUseVault && (isAdmin || user.department === 'IT & Security');
  const isManager = user.roleIds.includes('role-manager');

  return {
    canUseVault,
    isEngineer,
    isSecurityAdmin,
    canApproveJit: isSecurityAdmin || (canUseVault && isManager),
    canViewAudit: isSecurityAdmin,
  };
}

export function getCapabilitiesForUser(user: User | null | undefined): VaultCapabilities {
  if (!user) return getCapabilitiesForViewer(null);
  const roles = useHub.getState().roles;
  const perms = effectivePermissions(user, roles);
  return getCapabilitiesForViewer({ user, roles, perms });
}

export function useVaultCapabilities(): VaultCapabilities {
  const sessionUserId = useHub((s) => s.sessionUserId);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const user = users.find((u) => u.id === sessionUserId);
  if (!user) return getCapabilitiesForViewer(null);
  const perms = effectivePermissions(user, roles);
  return getCapabilitiesForViewer({ user, roles, perms });
}

export function currentVaultCapabilities(): VaultCapabilities {
  return getCapabilitiesForViewer(currentViewer());
}
