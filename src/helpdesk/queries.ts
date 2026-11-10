/**
 * Read-side helpers (pure): derived lists, health of services, queue stats,
 * approvals for a viewer, unread markers. Used by the UI, the bridge and tests.
 */
import type { Role, User } from '@/types';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import type { CatalogRequest, Incident, Maintenance, Service, ServiceHealth, Ticket } from './types';
import { canDecide, currentStep } from './eligibility';
import { isStaff, type Viewer, isIT, isSecurity, canSeeInternal } from './access';
import { isBreaching, median } from './sla';
import { DAY } from './meta';
import { triage, type IntentId, intentById } from './triage';

export const isOpen = (t: Ticket) => t.status !== 'resolved';

export const activeIncidents = (incidents: Incident[]) => incidents.filter((i) => i.status !== 'resolved');

export function serviceHealth(svc: Service, incidents: Incident[], maintenance: Maintenance[], now: number): { health: ServiceHealth; incident?: Incident; maintenance?: Maintenance } {
  const inc = activeIncidents(incidents)
    .filter((i) => i.serviceIds.includes(svc.id))
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))[0];
  if (inc) return { health: inc.severity === 'critical' ? 'outage' : inc.severity === 'major' ? 'partial' : 'degraded', incident: inc };
  const mnt = maintenance.find((m) => m.serviceIds.includes(svc.id) && m.startsAt <= now && m.endsAt > now);
  if (mnt) return { health: 'maintenance', maintenance: mnt };
  return { health: 'operational' };
}
const sevRank = (s: Incident['severity']) => (s === 'critical' ? 3 : s === 'major' ? 2 : 1);

export const uptimePct = (s: Service) => s.uptime.reduce((a, b) => a + b, 0) / Math.max(1, s.uptime.length);

/** IT team members tickets can be assigned to: resolver staff + console operators. */
export function assignableAgents(users: User[], roles: Role[]): User[] {
  return users.filter((u) => u.active && (isStaff(u.id) || hasPermission(effectivePermissions(u, roles), 'helpdesk.manage')));
}

/** The last public activity from someone other than `userId` is newer than their last visit. */
export function isUnread(t: Ticket, seenAt: number | undefined, userId: string, internalVisible = false): boolean {
  const last = [...t.events].reverse().find((e) => e.actorId !== userId && (e.kind === 'reply' || e.kind === 'status' || (internalVisible && e.kind === 'note')));
  if (!last) return false;
  return !seenAt || last.at > seenAt;
}

export function requestsAwaiting(viewer: Viewer, requests: CatalogRequest[]): CatalogRequest[] {
  const who = { id: viewer.user.id, isIT: isIT(viewer), isSecurity: isSecurity(viewer) };
  return requests.filter((r) => r.status === 'pending' && canDecide(r, who).ok);
}

export const fulfilmentQueue = (requests: CatalogRequest[]) => requests.filter((r) => r.status === 'approved').sort((a, b) => a.updatedAt - b.updatedAt);

export function queueStats(tickets: Ticket[], now: number) {
  const open = tickets.filter(isOpen);
  const recent = tickets.filter((t) => now - t.createdAt < 30 * DAY);
  const frt = recent.filter((t) => t.firstResponseAt && !t.selfService).map((t) => (t.firstResponseAt! - t.createdAt) / 60_000);
  const rated = tickets.filter((t) => t.csat && now - t.csat.at < 30 * DAY);
  return {
    open: open.length,
    unassigned: open.filter((t) => !t.assigneeId).length,
    breaching: open.filter((t) => isBreaching(t, now)).length,
    frtMedianMin: Math.round(median(frt)),
    csat: rated.length ? rated.reduce((s, t) => s + t.csat!.score, 0) / rated.length : 0,
    csatCount: rated.length,
    selfService: tickets.filter((t) => t.selfService && now - t.createdAt < 30 * DAY).length,
  };
}

/** Most common issues (by Nova intent) across tickets. */
export function topIssues(tickets: Ticket[], limit = 5): { intent: IntentId; title: string; count: number }[] {
  const counts = new Map<IntentId, number>();
  for (const t of tickets) {
    const r = triage(`${t.subject}. ${t.description}`, { now: t.createdAt, office: 'Remote', devices: [], incidents: [] });
    if (r.intent) counts.set(r.intent, (counts.get(r.intent) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([intent, count]) => ({ intent, title: intentById(intent).title, count }));
}

/** Pending step for display ("Waiting on Omar Khalid"). */
export function waitingOn(r: CatalogRequest, users: User[]): string {
  const step = currentStep(r);
  if (!step) return '';
  if (step.role === 'manager') return users.find((u) => u.id === step.approverId)?.name ?? 'Manager';
  return step.role === 'it' ? 'IT' : 'Security';
}

export const visibleEvents = (t: Ticket, viewer: Viewer) => (canSeeInternal(viewer) ? t.events : t.events.filter((e) => e.kind !== 'note'));
