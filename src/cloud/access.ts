/**
 * Stratos · Cloud Console — role & capability helpers.
 *
 * Engineering role (`app:devhub`) gets full infrastructure + provisioning +
 * observability + FinOps capabilities. Finance role (`app:cloud` without
 * `app:devhub`) gets a tailored FinOps & read-only reliability view.
 * Admin (`*`) gets everything.
 */
import type { BridgeViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';

export interface CloudCapabilities {
  canView: boolean;
  isEngineer: boolean;
  isFinOpsOnly: boolean;
  canProvision: boolean;
  canManageInfra: boolean;
  canManageAlerts: boolean;
  canDeclareIncident: boolean;
  canManageFinOps: boolean;
}

export function canUseCloud(perms: ReadonlySet<string>): boolean {
  return perms.has('*') || perms.has('app:cloud');
}

export function computeCloudCapabilities(perms: ReadonlySet<string>, department?: string): CloudCapabilities {
  const admin = perms.has('*');
  const canView = admin || perms.has('app:cloud');
  const eng = admin || perms.has('app:devhub') || department === 'Engineering' || department === 'IT & Security';
  const finOpsOnly = canView && !eng;
  return {
    canView,
    isEngineer: eng,
    isFinOpsOnly: finOpsOnly,
    canProvision: canView && eng,
    canManageInfra: canView && eng,
    canManageAlerts: canView && eng,
    canDeclareIncident: canView && (eng || perms.has('app:incidents')),
    canManageFinOps: canView,
  };
}

export function viewerCapabilities(viewer: BridgeViewer | null): CloudCapabilities {
  if (!viewer) {
    return {
      canView: false,
      isEngineer: false,
      isFinOpsOnly: false,
      canProvision: false,
      canManageInfra: false,
      canManageAlerts: false,
      canDeclareIncident: false,
      canManageFinOps: false,
    };
  }
  return computeCloudCapabilities(viewer.perms, viewer.user.department);
}

export function useCloudCapabilities(): CloudCapabilities {
  const sessionUserId = useHub((s) => s.sessionUserId);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const user = users.find((u) => u.id === sessionUserId);
  if (!user) {
    return computeCloudCapabilities(new Set());
  }
  const perms = effectivePermissions(user, roles);
  return computeCloudCapabilities(perms, user.department);
}
