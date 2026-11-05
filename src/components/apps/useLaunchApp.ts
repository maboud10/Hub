import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useNavTrail } from '@/store/navigation';
import { toast } from '@/store/toast';
import { SEED_APPS } from '@/data/apps';
import { appPermissionId } from '@/data/permissions';
import { effectivePermissions, hasPermission } from '@/lib/rbac';

/**
 * Launch an app by id.
 * - Granted + in-app module (`route` on app or `SEED_APPS`) → records usage,
 *   captures the current page in `ReturnPortal`, and navigates directly to the
 *   actual in-app module (`/projects`, `/drive`, `/chat`, `/helpdesk`, `/hr`,
 *   `/talent`, `/wiki`, `/academy`, `/expenses`, `/travel`, `/payroll`).
 * - Granted + external app → plays the SSO launch overlay.
 * - Locked / pending → opens the app details sheet (request access flow).
 */
export function useLaunchApp() {
  const navigate = useNavigate();
  const startLaunch = useUI((s) => s.startLaunch);
  const openAppSheet = useUI((s) => s.openAppSheet);
  const closeAll = useUI((s) => s.closeAll);

  return useCallback(
    (appId: string, action?: string) => {
      const state = useHub.getState();
      const user = state.users.find((u) => u.id === state.sessionUserId);
      const app = state.apps.find((a) => a.id === appId);
      const seedApp = SEED_APPS.find((a) => a.id === appId);
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
      if (typeof window !== 'undefined') {
        useNavTrail.getState().captureOriginForLaunch(window.location.pathname, window.location.search, appId);
      }

      const baseRoute = app.route ?? seedApp?.route;
      const quickActions = app.quickActions?.some((q) => q.route) ? app.quickActions : seedApp?.quickActions;
      const inAppRoute = baseRoute
        ? (action ? quickActions?.find((q) => q.label === action)?.route : undefined) ?? baseRoute
        : null;

      if (inAppRoute) {
        closeAll();
        navigate(inAppRoute);
        return;
      }

      startLaunch(appId, action);
    },
    [navigate, startLaunch, openAppSheet, closeAll],
  );
}
