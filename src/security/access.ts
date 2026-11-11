/**
 * Security Center — capability calculation for RBAC + role-aware views.
 *
 * - Full-time employees (`app:security` or `*`): personal posture, phishing training,
 *   Report Something Suspicious modal, read-only visibility into org telemetry.
 * - SOC (`*` or department `IT & Security`): full threat response playbooks, stage transitions,
 *   DLP policy overrides, compliance pack generation, org-wide posture score on bridge.
 * - Engineers (`app:devhub` or department `Engineering`): CVE patching & code/cloud posture remediation.
 */
import { useMemo } from 'react';
import type { BridgeViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import type { Role, User } from '@/types';

export interface SecurityCapabilities {
  canAccess: boolean;
  isSoc: boolean;
  isEngineer: boolean;
  isAuditor: boolean;
}

export function computeSecurityCapabilities(user: User | null | undefined, perms: ReadonlySet<string>): SecurityCapabilities {
  if (!user || !user.active) {
    return { canAccess: false, isSoc: false, isEngineer: false, isAuditor: false };
  }
  const isAdmin = perms.has('*');
  const canAccess = isAdmin || perms.has('app:*') || perms.has('app:security');
  const isSoc = isAdmin || (canAccess && user.department === 'IT & Security');
  const isEngineer = isSoc || (canAccess && (perms.has('app:devhub') || user.department === 'Engineering'));
  const isAuditor = isSoc || (canAccess && (user.department === 'Finance' || user.department === 'People Ops'));
  return { canAccess, isSoc, isEngineer, isAuditor };
}

export function viewerCapabilities(viewer: BridgeViewer | null | undefined): SecurityCapabilities {
  if (!viewer) return { canAccess: false, isSoc: false, isEngineer: false, isAuditor: false };
  return computeSecurityCapabilities(viewer.user, viewer.perms);
}

export function userCapabilities(user: User | null | undefined, roles: Role[]): SecurityCapabilities {
  if (!user) return { canAccess: false, isSoc: false, isEngineer: false, isAuditor: false };
  return computeSecurityCapabilities(user, effectivePermissions(user, roles));
}

export function useSecurityAccess(): SecurityCapabilities {
  const me = useSessionUser();
  const roles = useHub((s) => s.roles);
  return useMemo(() => userCapabilities(me, roles), [me, roles]);
}
