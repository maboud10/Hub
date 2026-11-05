/**
 * Control Center tab metadata (no components here, so the shell / command
 * palette can import it without pulling in the admin screens).
 */
import { AppWindow, Gauge, Inbox, ScrollText, ShieldHalf, Users, type LucideIcon } from 'lucide-react';

export const ADMIN_BASE = '/admin';

export type AdminTabId = 'overview' | 'requests' | 'users' | 'roles' | 'apps' | 'audit';

export interface AdminTabDef {
  id: AdminTabId;
  label: string;
  /** Compact label (scope pills, palette chips). */
  short: string;
  description: string;
  icon: LucideIcon;
  /** Permission required to see the tab and open its route. */
  perm: string;
}

export const ADMIN_TABS: AdminTabDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    short: 'Analytics',
    description: 'KPIs, access coverage and security insights',
    icon: Gauge,
    perm: 'hub.analytics.view',
  },
  {
    id: 'requests',
    label: 'Requests',
    short: 'Requests',
    description: 'Approve or deny pending access requests',
    icon: Inbox,
    perm: 'hub.requests.review',
  },
  {
    id: 'users',
    label: 'Users',
    short: 'Users',
    description: 'Roles, direct grants and account status',
    icon: Users,
    perm: 'hub.users.manage',
  },
  {
    id: 'roles',
    label: 'Roles & Permissions',
    short: 'Roles',
    description: 'Role catalog and the permission matrix',
    icon: ShieldHalf,
    perm: 'hub.roles.manage',
  },
  {
    id: 'apps',
    label: 'App Catalog',
    short: 'Apps',
    description: 'Register apps, status, discoverability and access',
    icon: AppWindow,
    perm: 'hub.apps.manage',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    short: 'Audit',
    description: 'Security trail with filters and CSV export',
    icon: ScrollText,
    perm: 'hub.audit.view',
  },
];

/** Absolute link to a Control Center tab, e.g. `adminHref('users', { status: 'inactive' })`. */
export function adminHref(tab: AdminTabId, query?: Record<string, string | undefined>): string {
  const entries = Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1]);
  const qs = new URLSearchParams(entries).toString();
  return `${ADMIN_BASE}/${tab}${qs ? `?${qs}` : ''}`;
}
