import { useLocation } from 'react-router';
import { useHub } from '@/store/hub';
import { usePrefs } from '@/store/selectors';
import { useUI } from '@/store/ui';

/**
 * Immersive workspace apps get ONE navigation rail — the app's own NEO rail.
 * While an app is open the Hub sidebar steps aside and becomes a slide-over
 * "Hub drawer" (opened from the NEXUS orb in the top bar, closed by Esc, the
 * scrim or any navigation); on core hub pages it is the regular sidebar again.
 * The way back sits under the app's last rail icon (see shell/RailReturn).
 *
 * Every in-hub app runs on the NEO workspace kit (rail + glass stage), so they
 * all behave the same way: Projects, Drive, Pulse Chat, IT Helpdesk,
 * Performance & OKRs, Talent Hub, HR Portal, Knowledge Base, Academy,
 * Travel & Expenses, Payroll Console, Procurement, CRM, Insights, Meet,
 * Calendar, Mail, Wellbeing, DevHub, Cloud Console, Incident Command, Vault,
 * Security Center, Spaces and the Control Center.
 */
export const IMMERSIVE_ROUTE =
  /^\/(projects|drive|chat|helpdesk|performance|talent|hr|wiki|academy|expenses|travel|payroll|procurement|crm|insights|meet|calendar|mail|wellbeing|devhub|cloud|incidents|vault|security|spaces|admin)(\/|$)/;

export function useSidebarState() {
  const { pathname } = useLocation();
  const prefs = usePrefs();
  const drawerOpen = useUI((s) => s.immersiveExpanded);
  const setDrawerOpen = useUI((s) => s.setImmersiveExpanded);
  const immersive = IMMERSIVE_ROUTE.test(pathname);
  const drawer = immersive && drawerOpen;
  // Inside an app the sidebar only ever appears as the drawer — always fully labelled.
  const collapsed = immersive ? false : prefs.sidebarCollapsed;

  const toggle = () => {
    if (immersive) {
      setDrawerOpen(!drawerOpen);
      return;
    }
    useHub.getState().updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
  };
  const closeDrawer = () => setDrawerOpen(false);

  return { immersive, collapsed, drawer, toggle, closeDrawer };
}
