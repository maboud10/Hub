/**
 * Who may see / do what in the Helpdesk (pure). Mirrors a backend policy:
 * every store action and bridge call re-checks these.
 */
import type { User } from '@/types';
import { hasPermission } from '@/lib/rbac';
import type { Device, Ticket, TicketCategory } from './types';

export interface Viewer {
  user: User;
  perms: ReadonlySet<string>;
}

/** IT console operators. */
export const isIT = (v: Viewer | null | undefined) => !!v && hasPermission(v.perms, 'helpdesk.manage');
export const isAdmin = (v: Viewer | null | undefined) => !!v && v.perms.has('*');
/** Security approvals & incident escalations. */
export const isSecurity = (v: Viewer | null | undefined) => !!v && (v.user.department === 'IT & Security' || isAdmin(v));

/**
 * Resolver groups: people who work tickets (assignable), even if they don't
 * run the full IT console. Layla (IT lead), Ethan (Security), Mateo (Workplace).
 */
export const STAFF_IDS = ['u-layla', 'u-ethan', 'u-mateo'] as const;
export const isStaff = (userId: string | undefined) => !!userId && (STAFF_IDS as readonly string[]).includes(userId);

export const STAFF_ROLE: Record<string, string> = {
  'u-layla': 'IT lead · escalations',
  'u-ethan': 'Security',
  'u-mateo': 'Workplace & hardware',
};

/** Category-aware routing for new tickets (never the requester themselves). */
export function pickAgent(category: TicketCategory, requesterId: string): string {
  const order: Record<TicketCategory, string[]> = {
    security: ['u-ethan', 'u-layla'],
    hardware: ['u-mateo', 'u-layla'],
    network: ['u-layla', 'u-ethan'],
    software: ['u-layla', 'u-mateo'],
    access: ['u-layla', 'u-ethan'],
    email: ['u-layla', 'u-mateo'],
    other: ['u-layla', 'u-mateo'],
  };
  return order[category].find((id) => id !== requesterId) ?? 'u-layla';
}

export function canViewTicket(v: Viewer, t: Ticket): boolean {
  return isIT(v) || t.requesterId === v.user.id || t.assigneeId === v.user.id;
}

/** Agent powers on a ticket: IT console, or the staff member it's assigned to. */
export function canWorkTicket(v: Viewer, t: Ticket): boolean {
  if (t.requesterId === v.user.id && !isIT(v)) return false;
  return isIT(v) || (isStaff(v.user.id) && t.assigneeId === v.user.id);
}

/** Internal notes are visible to IT and resolver staff only. */
export const canSeeInternal = (v: Viewer) => isIT(v) || isStaff(v.user.id);

export function canViewDevice(v: Viewer, d: Device): boolean {
  return isIT(v) || d.assigneeId === v.user.id;
}

export const isDirectReport = (users: Pick<User, 'id' | 'managerId'>[], managerId: string, reportId: string) =>
  users.some((u) => u.id === reportId && u.managerId === managerId);
