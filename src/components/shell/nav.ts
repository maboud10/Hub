import { House, LayoutGrid, Newspaper, Settings, ShieldHalf, Users, type LucideIcon } from 'lucide-react';
import { ADMIN_PERMISSIONS } from '@/data/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  perm?: string | readonly string[];
  group: 'workspace' | 'governance' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: House, end: true, group: 'workspace' },
  { to: '/apps', label: 'Apps', icon: LayoutGrid, group: 'workspace' },
  { to: '/people', label: 'People', icon: Users, perm: 'hub.people.view', group: 'workspace' },
  { to: '/news', label: 'Newsroom', icon: Newspaper, group: 'workspace' },
  { to: '/admin', label: 'Control Center', icon: ShieldHalf, perm: ADMIN_PERMISSIONS, group: 'governance' },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'system' },
];
