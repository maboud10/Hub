import { useLocation } from 'react-router';
import { useHub } from '@/store/hub';
import { usePrefs } from '@/store/selectors';
import { useUI } from '@/store/ui';

/**
 * Immersive workspace apps get the full width: the Hub sidebar tucks into its
 * icon rail while they're open and springs back when you leave. Expanding it
 * inside an app is remembered for the session.
 *
 * Every in-hub app runs on the NEO workspace kit (rail + glass stage), so they
 * all behave the same way: Projects, Drive, Pulse Chat, IT Helpdesk,
 * Performance & OKRs, Talent Hub, HR Portal, Knowledge Base, Academy,
 * Travel & Expenses, Payroll Console and the Control Center.
 */
export const IMMERSIVE_ROUTE = /^\/(projects|drive|chat|helpdesk|performance|talent|hr|wiki|academy|expenses|travel|payroll|procurement|crm|insights|admin)(\/|$)/;

export function useSidebarState() {
  const { pathname } = useLocation();
  const prefs = usePrefs();
  const expandedInApp = useUI((s) => s.immersiveExpanded);
  const setExpandedInApp = useUI((s) => s.setImmersiveExpanded);
  const immersive = IMMERSIVE_ROUTE.test(pathname);
  const collapsed = prefs.sidebarCollapsed || (immersive && !expandedInApp);

  const toggle = () => {
    const { updatePrefs } = useHub.getState();
    if (!immersive) {
      updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
      return;
    }
    if (collapsed) {
      if (prefs.sidebarCollapsed) updatePrefs({ sidebarCollapsed: false });
      setExpandedInApp(true);
    } else setExpandedInApp(false);
  };

  return { immersive, collapsed, toggle };
}
