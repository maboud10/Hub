import { useCallback } from 'react';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { appPermissionId } from '@/data/permissions';
import { effectivePermissions, hasPermission } from '@/lib/rbac';

/**
 * Launch an app by id. Granted → records usage and plays the secure launch
 * sequence. Locked / pending → opens the app sheet (request access flow).
 */
export function useLaunchApp() {
  const startLaunch = useUI((s) => s.startLaunch);
  const openAppSheet = useUI((s) => s.openAppSheet);

  return useCallback(
    (appId: string, action?: string) => {
      const state = useHub.getState();
      const user = state.users.find((u) => u.id === state.sessionUserId);
      const app = state.apps.find((a) => a.id === appId);
      if (!user || !app) return;
      const allowed = app.enabled && hasPermission(effectivePermissions(user, state.roles), appPermissionId(appId));
      if (!allowed) {
        openAppSheet(appId);
        return;
      }
      const res = state.recordLaunch(appId);
      if (!res.ok) {
        toast.result(res);
        return;
      }
      startLaunch(appId, action);
    },
    [startLaunch, openAppSheet],
  );
}
