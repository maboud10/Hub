/**
 * IT queue model (pure): URL-backed filters, search, sorting and the
 * keyboard navigation order shared by the board, the list and the view.
 */
import type { User } from '@/types';
import type { Priority, Ticket, TicketCategory } from '@/helpdesk/types';
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES } from '@/helpdesk/meta';
import { headlineSla, isBreaching } from '@/helpdesk/sla';

export type QueueMode = 'board' | 'list';
export type QueueWho = 'all' | 'mine' | 'unassigned';
export type QueueScope = 'open' | 'resolved' | 'all';
export type QueueSortKey = 'priority' | 'sla' | 'subject' | 'requester' | 'assignee' | 'updated';
export interface QueueSort {
  key: QueueSortKey;
  dir: 1 | -1;
}

export interface QueueFilter {
  q: string;
  who: QueueWho;
  late: boolean;
  prios: Priority[];
  cat: TicketCategory | '';
  scope: QueueScope;
}

export const PRIO_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
const SORT_KEYS: QueueSortKey[] = ['priority', 'sla', 'subject', 'requester', 'assignee', 'updated'];

/** Read the queue state from the URL (`?view=list&who=mine&late=1&p=P1,P2&cat=network&scope=all&sort=-updated&t=HX-1042`). */
export function readQueueParams(sp: URLSearchParams) {
  const who = sp.get('who');
  const scope = sp.get('scope');
  const cat = sp.get('cat') ?? '';
  const rawSort = sp.get('sort') ?? 'sla';
  const sortKey = rawSort.replace(/^-/, '') as QueueSortKey;
  return {
    mode: (sp.get('view') === 'list' ? 'list' : 'board') as QueueMode,
    who: (who === 'mine' || who === 'unassigned' ? who : 'all') as QueueWho,
    late: sp.get('late') === '1',
    prios: (sp.get('p') ?? '').split(',').filter((p): p is Priority => (PRIORITIES as string[]).includes(p)),
    cat: (CATEGORIES.some((c) => c.id === cat) ? cat : '') as TicketCategory | '',
    scope: (scope === 'resolved' || scope === 'all' ? scope : 'open') as QueueScope,
    sort: { key: SORT_KEYS.includes(sortKey) ? sortKey : 'sla', dir: rawSort.startsWith('-') ? -1 : 1 } as QueueSort,
    selected: sp.get('t') ?? undefined,
  };
}

export const sortParam = (s: QueueSort) => (s.key === 'sla' && s.dir === 1 ? null : `${s.dir === -1 ? '-' : ''}${s.key}`);

export function ticketSearchText(t: Ticket, users: Pick<User, 'id' | 'name'>[]): string {
  const name = (id?: string) => (id ? (users.find((u) => u.id === id)?.name ?? '') : '');
  return `${t.id} ${t.subject} ${t.description} ${CATEGORY_LABEL[t.category]} ${t.deviceTag ?? ''} ${name(t.requesterId)} ${name(t.assigneeId)} ${t.priority}`.toLowerCase();
}

/** Everything except the status scope (the board shows every lane). */
export function matchesQueue(t: Ticket, f: Omit<QueueFilter, 'scope'>, ctx: { me: string; now: number; users: Pick<User, 'id' | 'name'>[] }): boolean {
  if (f.who === 'mine' && t.assigneeId !== ctx.me) return false;
  if (f.who === 'unassigned' && (t.assigneeId || t.status === 'resolved')) return false;
  if (f.late && !isBreaching(t, ctx.now)) return false;
  if (f.prios.length && !f.prios.includes(t.priority)) return false;
  if (f.cat && t.category !== f.cat) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = ticketSearchText(t, ctx.users);
    if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
  }
  return true;
}

export const inScope = (t: Ticket, scope: QueueScope) => (scope === 'all' ? true : scope === 'resolved' ? t.status === 'resolved' : t.status !== 'resolved');

/** Lower = more urgent. Breached clocks are negative; paused and resolved tickets sink. */
export function slaUrgency(t: Ticket, now: number): number {
  if (t.status === 'resolved') return Number.MAX_SAFE_INTEGER - (t.resolvedAt ?? 0);
  const s = headlineSla(t, now);
  return s.state === 'paused' ? 1e13 + s.remaining : s.remaining;
}

/** Default board order inside a lane: priority, then the most urgent SLA clock. */
export function urgencySort(list: Ticket[], now: number): Ticket[] {
  return [...list].sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || slaUrgency(a, now) - slaUrgency(b, now));
}

export function sortTickets(list: Ticket[], sort: QueueSort, ctx: { now: number; users: Pick<User, 'id' | 'name'>[] }): Ticket[] {
  const name = (id?: string) => (id ? (ctx.users.find((u) => u.id === id)?.name ?? '~') : '~~');
  const cmp: Record<QueueSortKey, (a: Ticket, b: Ticket) => number> = {
    priority: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || slaUrgency(a, ctx.now) - slaUrgency(b, ctx.now),
    sla: (a, b) => slaUrgency(a, ctx.now) - slaUrgency(b, ctx.now),
    subject: (a, b) => a.subject.localeCompare(b.subject),
    requester: (a, b) => name(a.requesterId).localeCompare(name(b.requesterId)),
    assignee: (a, b) => name(a.assigneeId).localeCompare(name(b.assigneeId)),
    updated: (a, b) => b.updatedAt - a.updatedAt,
  };
  return [...list].sort((a, b) => cmp[sort.key](a, b) * sort.dir || b.updatedAt - a.updatedAt);
}
