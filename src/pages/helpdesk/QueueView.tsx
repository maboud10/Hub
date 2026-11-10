/**
 * IT queue — the agent workspace: SLA health ribbon, quick filters, a
 * drag-and-drop Kanban (QueueBoard) or a sortable list, and an inspector to
 * work a ticket (assign, reply, resolve) without leaving the queue.
 *
 * URL state: ?view=list · who=mine|unassigned · late=1 · p=P1,P2 · cat ·
 * scope=open|resolved|all (list) · sort=-updated · t=<ticket id> (inspector).
 * Keys: J/K move · Enter/O open · Esc close · S search · V board/list.
 */
import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowRightLeft, ExternalLink, Hand, Hourglass, Inbox, LayoutGrid, Plus, Rows3, SearchX, Siren, SquareKanban, Star, Timer, UserCheck, UserRound, UserX, X } from 'lucide-react';
import { Chip, CountUp, NeoEmpty, NeoHead, NeoKpi, NeoKpis, NeoSearch, NeoStage, NeoTabs, Orb, Spark, useContextMenu, type MenuEntry } from '@/components/neo';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { Priority, Ticket, TicketStatus } from '@/helpdesk/types';
import { CATEGORIES, DAY, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL_AGENT, STATUS_ORDER } from '@/helpdesk/meta';
import { assignableAgents, isOpen, isUnread, queueStats } from '@/helpdesk/queries';
import { formatDuration, headlineSla } from '@/helpdesk/sla';
import { ResolveModal } from './Conversation';
import { QueueBoard, boardLanes } from './QueueBoard';
import { QueueInspector } from './queue-inspector';
import { QueueList } from './queue-list';
import { inScope, matchesQueue, readQueueParams, sortParam, sortTickets, urgencySort, type QueueMode, type QueueSort, type QueueWho } from './queue-model';
import { Kbd, plural, useOpenTicket, useViewer } from './ui';
import '@/styles/helpdesk/queue.css';

const overlayOpen = () => !!document.querySelector('.modal, .sheet, .neo-pop');
const isField = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable);
};

export function QueueView() {
  const viewer = useViewer();
  const tickets = useHelpdesk((s) => s.tickets);
  const seen = useHelpdesk((s) => s.seen);
  const history = useHelpdesk((s) => s.history);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const now = useNow(15_000);
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const openTicket = useOpenTicket();
  const ctxMenu = useContextMenu();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [resolving, setResolving] = useState<Ticket | null>(null);
  const me = viewer?.user.id ?? '';
  const { mode, who, late, prios, cat, scope, sort, selected: selectedId } = readQueueParams(sp);

  const patch = useCallback(
    (changes: Record<string, string | null>) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );

  const team = useMemo(() => assignableAgents(users, roles), [users, roles]);
  const selected = useMemo(() => (selectedId ? tickets.find((t) => t.id === selectedId) : undefined), [tickets, selectedId]);

  /* ---------- live numbers ---------- */
  const stats = useMemo(() => queueStats(tickets, now), [tickets, now]);
  const live = useMemo(() => {
    const open = tickets.filter(isOpen);
    const unassigned = open.filter((t) => !t.assigneeId);
    return {
      risk: open.filter((t) => headlineSla(t, now).state === 'risk').length,
      fresh: tickets.filter((t) => now - t.createdAt < DAY).length,
      waiting: open.filter((t) => t.status === 'waiting').length,
      oldest: unassigned.length ? Math.min(...unassigned.map((t) => t.createdAt)) : 0,
      mine: open.filter((t) => t.assigneeId === me).length,
      grabbable: unassigned.filter((t) => t.requesterId !== me).length,
    };
  }, [tickets, now, me]);
  const trend = useMemo(() => history.slice(-8), [history]);

  /* ---------- filtering ---------- */
  const prioKey = prios.join(',');
  const matched = useMemo(
    () => tickets.filter((t) => matchesQueue(t, { q, who, late, prios: prioKey ? (prioKey.split(',') as Priority[]) : [], cat }, { me, now, users })),
    [tickets, q, who, late, prioKey, cat, me, now, users],
  );
  const boardTickets = useMemo(() => urgencySort(matched, now), [matched, now]);
  const listTickets = useMemo(() => sortTickets(matched.filter((t) => inScope(t, scope)), sort, { now, users }), [matched, scope, sort, now, users]);
  const unread = useMemo(() => new Set(tickets.filter((t) => isOpen(t) && t.assigneeId === me && isUnread(t, seen[me]?.[t.id], me, true)).map((t) => t.id)), [tickets, seen, me]);
  const compact = !!selected && selected.status !== 'resolved';
  const order = useMemo(() => {
    if (mode === 'list') return listTickets.map((t) => t.id);
    const lanes = boardLanes(boardTickets);
    return STATUS_ORDER.filter((s) => !(s === 'resolved' && compact)).flatMap((s) => lanes[s].shown.map((t) => t.id));
  }, [mode, listTickets, boardTickets, compact]);
  const filtered = !!q.trim() || who !== 'all' || late || prios.length > 0 || !!cat;

  /* ---------- actions ---------- */
  const select = (id: string | null) => patch({ t: id });
  const openFull = (id: string) => navigate(`/helpdesk/tickets/${id}`);
  const setMode = (m: QueueMode) => patch({ view: m === 'list' ? 'list' : null });
  const setWho = (w: QueueWho) => patch({ who: who === w ? null : w });
  const togglePrio = (p: Priority) => {
    const next = prios.includes(p) ? prios.filter((x) => x !== p) : [...prios, p];
    patch({ p: PRIORITIES.filter((x) => next.includes(x)).join(',') || null });
  };
  const clearFilters = () => {
    setQ('');
    patch({ who: null, late: null, p: null, cat: null });
  };

  const assignTo = (t: Ticket, to: string | null) => {
    const r = useHelpdesk.getState().assign(t.id, to);
    if (!r.ok) return toast.error(r.error);
    toast.success(to === me ? `${t.id} is yours` : to ? `${t.id} assigned to ${users.find((u) => u.id === to)?.name ?? 'the team'}` : `${t.id} unassigned`, t.subject);
  };

  /** Board drops and "Move to" menu: status (+ claim when work starts); Resolved asks for a resolution. */
  const move = (t: Ticket, to: TicketStatus) => {
    if (to === 'resolved') {
      setResolving(t);
      return;
    }
    const st = useHelpdesk.getState();
    const claim = to === 'in_progress' && !t.assigneeId && st.assign(t.id, me).ok;
    const r = st.setStatus(t.id, to);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${t.id} → ${STATUS_LABEL_AGENT[to]}`, claim ? 'Assigned to you — the requester was notified.' : t.status === 'resolved' ? 'Reopened — the requester was notified.' : t.subject);
  };

  const grab = () => {
    const r = useHelpdesk.getState().grabNext();
    if (!r.ok) return toast.info(r.error);
    const t = useHelpdesk.getState().tickets.find((x) => x.id === r.ticketId);
    toast.success(`${r.ticketId} is yours`, t ? `${t.priority} · ${t.subject}` : undefined);
    select(r.ticketId);
  };

  const menuFor = (t: Ticket): MenuEntry[] => {
    const items: MenuEntry[] = [{ label: 'Open ticket', icon: <ExternalLink />, hint: 'O', onSelect: () => openFull(t.id) }];
    if (t.status !== 'resolved' && t.assigneeId !== me) items.push({ label: 'Assign to me', icon: <UserCheck />, onSelect: () => assignTo(t, me) });
    items.push({ kind: 'sep' }, { kind: 'label', label: 'Move to' });
    for (const s of STATUS_ORDER) if (s !== t.status) items.push({ label: s === 'resolved' ? 'Resolved…' : STATUS_LABEL_AGENT[s], icon: <ArrowRightLeft />, onSelect: () => move(t, s) });
    if (t.status !== 'resolved') {
      items.push({ kind: 'sep' }, { kind: 'label', label: 'Assign to' });
      for (const u of team) items.push({ label: u.name, checked: t.assigneeId === u.id, onSelect: () => assignTo(t, u.id) });
      items.push({ label: 'Unassigned', checked: !t.assigneeId, onSelect: () => assignTo(t, null) });
    }
    return items;
  };
  const onContextMenu = (e: ReactMouseEvent, t: Ticket) => ctxMenu.open(e, menuFor(t));

  /* ---------- keyboard ---------- */
  const focusTicket = (id: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-qa="qcard-${id}"], [data-qa="qrow-${id}"]`)?.focus());
  const step = (d: 1 | -1) => {
    if (!order.length || overlayOpen()) return;
    const i = selectedId ? order.indexOf(selectedId) : -1;
    const next = order[i < 0 ? (d === 1 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, i + d))];
    select(next);
    focusTicket(next);
  };
  useHotkeys({
    j: () => step(1),
    k: () => step(-1),
    o: () => {
      if (selectedId && !overlayOpen()) openFull(selectedId);
    },
    enter: (e) => {
      if (!selectedId || overlayOpen()) return;
      if ((e.target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [role="button"], tr[tabindex]')) return;
      openFull(selectedId);
    },
    escape: (e) => {
      if (!selectedId || isField(e.target) || overlayOpen() || document.querySelector('.hd-queue-board[data-dragging]')) return;
      select(null);
    },
    s: (e) => {
      e.preventDefault();
      searchRef.current?.focus();
    },
    v: () => {
      if (!overlayOpen()) setMode(mode === 'board' ? 'list' : 'board');
    },
  });

  if (!viewer) return null;

  return (
    <NeoStage label="IT queue">
      <NeoHead
        icon={<LayoutGrid />}
        eyebrow="IT console · Queue"
        title="Ticket queue"
        sub={`${plural(stats.open, 'open ticket')} · ${stats.unassigned} unassigned · ${stats.breaching ? `${stats.breaching} breaching SLA` : 'every SLA on track'}`}
        center={
          <NeoTabs<QueueMode>
            label="Queue layout"
            value={mode}
            onChange={setMode}
            items={[
              { value: 'board', label: 'Board', icon: <SquareKanban />, title: 'Board (V)' },
              { value: 'list', label: 'List', icon: <Rows3 />, title: 'List (V)' },
            ]}
          />
        }
        actions={
          <>
            <button
              type="button"
              className="neo-btn neo-btn--soft"
              onClick={grab}
              disabled={!live.grabbable}
              data-tip={live.grabbable ? `Take the most urgent unassigned ticket (${live.grabbable} waiting)` : 'Nothing unassigned'}
              data-qa="queue-grab"
            >
              <Hand /> <span className="neo-btn__label">Grab next</span>
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openTicket()} data-tip="New ticket (C)" data-qa="queue-new">
              <Plus /> <span className="neo-btn__label">New ticket</span>
            </button>
          </>
        }
      />

      <div className="neo-toolbar hd-toolbar hd-queue-toolbar">
        <NeoSearch value={q} onChange={setQ} placeholder="Search the queue" kbd="S" inputRef={searchRef} size="sm" className="hd-queue-search" />
        <div className="hd-queue-filters" role="group" aria-label="Quick filters">
          <Chip tone="app" icon={<UserRound />} pressed={who === 'mine'} onClick={() => setWho('mine')} title="Assigned to me">
            Mine <span className="hd-queue-chipn">{live.mine}</span>
          </Chip>
          <Chip tone="amber" icon={<UserX />} pressed={who === 'unassigned'} onClick={() => setWho('unassigned')} title="Nobody has picked these up">
            Unassigned <span className="hd-queue-chipn">{stats.unassigned}</span>
          </Chip>
          <Chip tone="rose" icon={<Siren />} pressed={late} onClick={() => patch({ late: late ? null : '1' })} title="An SLA clock is overdue">
            Breaching <span className="hd-queue-chipn">{stats.breaching}</span>
          </Chip>
          <span className="hd-queue-sep" aria-hidden="true" />
          <span className="hd-queue-prios" role="group" aria-label="Priority">
            {PRIORITIES.map((p) => (
              <button key={p} type="button" className="hd-queue-prio" data-p={p} aria-pressed={prios.includes(p)} onClick={() => togglePrio(p)} title={`${p} · ${PRIORITY_LABEL[p]}`}>
                {p}
              </button>
            ))}
          </span>
          <select className="neo-select neo-select--sm hd-queue-select" value={cat} onChange={(e) => patch({ cat: e.target.value || null })} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {mode === 'list' && (
            <select className="neo-select neo-select--sm hd-queue-select" value={scope} onChange={(e) => patch({ scope: e.target.value === 'open' ? null : e.target.value })} aria-label="Status scope">
              <option value="open">Open tickets</option>
              <option value="resolved">Resolved</option>
              <option value="all">All tickets</option>
            </select>
          )}
          {filtered && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={clearFilters} data-qa="queue-clear">
              <X /> Clear
            </button>
          )}
        </div>
        <span className="hd-queue-live" title="Updates live as tickets move">
          <Orb tone="success" pulse size={7} /> Live · {mode === 'list' ? listTickets.length : matched.filter(isOpen).length} shown
        </span>
      </div>

      <div className={cx('neo-split hd-fill hd-queue-split', !selected && 'is-solo')}>
        <div className={cx('neo-body neo-pad hd-queue-body', mode === 'board' && 'hd-queue-body--board')}>
          <NeoKpis label="SLA health" className="hd-queue-kpis">
            <NeoKpi
              label="Open"
              icon={<Inbox />}
              value={<CountUp value={stats.open} />}
              sub={`${live.fresh} new today · ${live.waiting} waiting`}
              onClick={filtered ? clearFilters : undefined}
              title={filtered ? 'Show the whole queue' : undefined}
            />
            <NeoKpi
              label="Unassigned"
              icon={<UserX />}
              tone={stats.unassigned ? 'warning' : 'success'}
              value={<CountUp value={stats.unassigned} />}
              sub={live.oldest ? `oldest ${relativeTime(live.oldest, now)}` : 'everything has an owner'}
              onClick={() => setWho('unassigned')}
              title="Filter to unassigned"
            />
            <NeoKpi
              label="Breaching"
              icon={<Siren />}
              tone={stats.breaching ? 'danger' : 'success'}
              value={<CountUp value={stats.breaching} />}
              sub={stats.breaching ? 'SLA clock overdue' : 'all clocks green'}
              onClick={() => patch({ late: late ? null : '1' })}
              title="Filter to breaching tickets"
            />
            <NeoKpi label="At risk" icon={<Hourglass />} tone={live.risk ? 'amber' : undefined} value={<CountUp value={live.risk} />} sub="under 25% of the clock left" />
            <NeoKpi
              label="First reply"
              icon={<Timer />}
              value={formatDuration(stats.frtMedianMin * 60_000, { compact: true })}
              sub="median · 30 days"
              spark={<Spark data={trend.map((w) => -w.frtMedianMin)} width={64} height={22} />}
            />
            <NeoKpi
              label="CSAT"
              icon={<Star />}
              value={
                <>
                  {stats.csat ? stats.csat.toFixed(1) : '—'}
                  <small>/5</small>
                </>
              }
              sub={`${plural(stats.csatCount, 'rating')} · 30d`}
              spark={<Spark data={trend.map((w) => w.csat)} width={64} height={22} />}
            />
          </NeoKpis>

          {matched.length === 0 && filtered ? (
            <NeoEmpty
              icon={<SearchX />}
              title="Nothing in the queue matches"
              action={
                <button type="button" className="neo-btn neo-btn--soft" onClick={clearFilters}>
                  Clear filters
                </button>
              }
            >
              {q ? `No ticket matches “${q}” with these filters.` : 'Try a different priority or category — or clear the filters.'}
            </NeoEmpty>
          ) : mode === 'board' ? (
            <QueueBoard
              tickets={boardTickets}
              selected={selectedId}
              onSelect={(id) => select(id)}
              onOpen={openFull}
              onMove={move}
              onContextMenu={onContextMenu}
              unread={unread}
              compactResolved={compact}
              onShowResolved={() => patch({ view: 'list', scope: 'resolved', t: null })}
            />
          ) : listTickets.length === 0 ? (
            <NeoEmpty icon={<Inbox />} title={scope === 'resolved' ? 'Nothing resolved yet' : 'The queue is clear'}>
              {scope === 'open' ? 'No open tickets right now — enjoy it while it lasts.' : 'Resolved tickets will show up here.'}
            </NeoEmpty>
          ) : (
            <QueueList
              tickets={listTickets}
              sort={sort}
              onSort={(s: QueueSort) => patch({ sort: sortParam(s) })}
              selected={selectedId}
              onSelect={(id) => select(id)}
              onOpen={openFull}
              onContextMenu={onContextMenu}
              unread={unread}
              me={me}
            />
          )}

          <div className="hd-queue-keys" aria-hidden="true">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> move · <Kbd>↵</Kbd> select / open · <Kbd>Esc</Kbd> close · <Kbd>S</Kbd> search · <Kbd>V</Kbd> board / list
            {mode === 'board' ? (
              <>
                {' '}
                · <Kbd>Space</Kbd> pick up a card, <Kbd>←</Kbd>
                <Kbd>→</Kbd> change lane
              </>
            ) : (
              <>
                {' '}
                · <Kbd>X</Kbd> tick a row
              </>
            )}
          </div>
        </div>
        {selected && <QueueInspector ticket={selected} viewer={viewer} onClose={() => select(null)} onOpen={() => openFull(selected.id)} onResolve={() => setResolving(selected)} />}
      </div>
      {ctxMenu.element}
      {resolving && <ResolveModal ticket={resolving} open onClose={() => setResolving(null)} />}
    </NeoStage>
  );
}
