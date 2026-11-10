/**
 * Queue list — sortable neo-table (priority, SLA, subject, requester,
 * assignee, updated) with multi-select and a bulk action bar
 * (assign to me / someone, move lane, resolve with a resolution code).
 */
import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRightLeft, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, UserCheck, UserRound, X } from 'lucide-react';
import { NeoMenu, PeoplePicker } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import type { ResolutionCode, Ticket, TicketStatus } from '@/helpdesk/types';
import { CATEGORY_LABEL, RESOLUTION_LABEL, STATUS_LABEL_AGENT, STATUS_ORDER } from '@/helpdesk/meta';
import { assignableAgents } from '@/helpdesk/queries';
import type { QueueSort, QueueSortKey } from './queue-model';
import { CategoryGlyph, Person, PriorityPill, SlaChip, StatusPill, plural } from './ui';

export function QueueList({
  tickets,
  sort,
  onSort,
  selected,
  onSelect,
  onOpen,
  onContextMenu,
  unread,
  me,
}: {
  tickets: Ticket[];
  sort: QueueSort;
  onSort: (s: QueueSort) => void;
  selected?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onContextMenu?: (e: ReactMouseEvent, t: Ticket) => void;
  unread?: ReadonlySet<string>;
  me: string;
}) {
  const now = useNow(30_000);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  // Only keep ticks for rows that are still visible.
  const checked = useMemo(() => new Set(tickets.filter((t) => picked.has(t.id)).map((t) => t.id)), [tickets, picked]);
  const all = tickets.length > 0 && checked.size === tickets.length;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setPicked(all ? new Set() : new Set(tickets.map((t) => t.id)));

  return (
    <div className="hd-queue-listwrap">
      <div className="neo-table-wrap hd-queue-tablewrap">
        <table className="neo-table hd-queue-table" aria-label="Queue tickets">
          <thead>
            <tr>
              <th className="hd-queue-th-check">
                <input
                  type="checkbox"
                  className="neo-check"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = checked.size > 0 && !all;
                  }}
                  onChange={toggleAll}
                  aria-label={all ? 'Clear selection' : 'Select all visible tickets'}
                />
              </th>
              <SortTh k="priority" sort={sort} onSort={onSort}>
                Pri
              </SortTh>
              <SortTh k="sla" sort={sort} onSort={onSort}>
                SLA
              </SortTh>
              <SortTh k="subject" sort={sort} onSort={onSort} className="hd-queue-th-subj">
                Subject
              </SortTh>
              <SortTh k="requester" sort={sort} onSort={onSort}>
                Requester
              </SortTh>
              <SortTh k="assignee" sort={sort} onSort={onSort}>
                Assignee
              </SortTh>
              <SortTh k="updated" sort={sort} onSort={onSort}>
                Updated
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr
                key={t.id}
                className={cx(t.id === selected && 'is-selected', checked.has(t.id) && 'is-checked')}
                data-p={t.priority}
                tabIndex={0}
                aria-selected={t.id === selected}
                onClick={() => onSelect(t.id)}
                onDoubleClick={() => onOpen(t.id)}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, t) : undefined}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (t.id === selected) onOpen(t.id);
                    else onSelect(t.id);
                  } else if (e.key === 'x') {
                    e.preventDefault();
                    toggle(t.id);
                  }
                }}
                data-qa={`qrow-${t.id}`}
              >
                <td className="hd-queue-td-check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="neo-check" checked={checked.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.id}`} />
                </td>
                <td className="hd-queue-td-prio">
                  <PriorityPill priority={t.priority} />
                </td>
                <td className="hd-queue-td-sla">
                  <SlaChip ticket={t} compact />
                </td>
                <td className="hd-queue-td-subj">
                  <div className="hd-queue-subj">
                    <CategoryGlyph category={t.category} size={30} />
                    <div className="hd-queue-subj__text">
                      <span className="hd-queue-subj__title">
                        {t.subject}
                        {unread?.has(t.id) && <span className="hd-unread" aria-label="New activity" />}
                      </span>
                      <span className="hd-queue-subj__meta">
                        <span className="neo-mono">{t.id}</span>
                        <span>{CATEGORY_LABEL[t.category]}</span>
                        <StatusPill status={t.status} agent size="sm" />
                        {t.escalated && <span className="hd-esc">Sec</span>}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="hd-queue-td-person">
                  <Person userId={t.requesterId} size={24} nameOnly />
                </td>
                <td className="hd-queue-td-person">{t.assigneeId ? <Person userId={t.assigneeId} size={24} nameOnly /> : <span className="hd-queue-none">{t.sim ? 'Matching…' : 'Unassigned'}</span>}</td>
                <td className="hd-queue-td-when">
                  <time dateTime={new Date(t.updatedAt).toISOString()}>{relativeTime(t.updatedAt, now)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {checked.size > 0 && <BulkBar ids={[...checked]} me={me} onDone={() => setPicked(new Set())} />}
    </div>
  );
}

function SortTh({ k, sort, onSort, children, className }: { k: QueueSortKey; sort: QueueSort; onSort: (s: QueueSort) => void; children: ReactNode; className?: string }) {
  const on = sort.key === k;
  // "Updated" naturally lists the newest first.
  const ascending = k === 'updated' ? sort.dir === -1 : sort.dir === 1;
  return (
    <th className={className} aria-sort={on ? (ascending ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="hd-queue-sort" data-on={on || undefined} onClick={() => onSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {children}
        {on ? sort.dir === 1 ? <ArrowUp /> : <ArrowDown /> : <ArrowUpDown />}
      </button>
    </th>
  );
}

/* ---------------------------------------------------------------- bulk actions */

function BulkBar({ ids, me, onDone }: { ids: string[]; me: string; onDone: () => void }) {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const team = useMemo(() => assignableAgents(users, roles), [users, roles]);
  const [resolveOpen, setResolveOpen] = useState(false);
  const n = ids.length;

  const assign = (to: string | null) => {
    const r = useHelpdesk.getState().bulkAssign(ids, to);
    if (!r.ok) return toast.error(r.error);
    toast.success(to ? `${plural(r.count, 'ticket')} assigned to ${to === me ? 'you' : (users.find((u) => u.id === to)?.name ?? 'the team')}` : `${plural(r.count, 'ticket')} unassigned`);
    onDone();
  };
  const move = (to: TicketStatus) => {
    const r = useHelpdesk.getState().bulkStatus(ids, to);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${plural(r.count, 'ticket')} → ${STATUS_LABEL_AGENT[to]}`);
    onDone();
  };

  return (
    <div className="hd-queue-bulk" role="toolbar" aria-label="Bulk actions">
      <span className="hd-queue-bulk__count">
        <b className="neo-num">{n}</b> selected
      </span>
      <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => assign(me)} data-qa="bulk-mine">
        <UserCheck /> <span className="neo-btn__label">Assign to me</span>
      </button>
      <PeoplePicker
        value={[]}
        onChange={(picked) => assign(picked[0] ?? null)}
        users={team}
        allowNone
        label="Assign to"
        placement="top-start"
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
            <UserRound /> <span className="neo-btn__label">Assign</span> <ChevronDown />
          </button>
        )}
      />
      <NeoMenu
        label="Move to"
        placement="top-start"
        items={STATUS_ORDER.filter((s) => s !== 'resolved').map((s) => ({ label: STATUS_LABEL_AGENT[s], icon: <ArrowRightLeft />, onSelect: () => move(s) }))}
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
            <ArrowRightLeft /> <span className="neo-btn__label">Move</span> <ChevronDown />
          </button>
        )}
      />
      <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => setResolveOpen(true)} data-qa="bulk-resolve">
        <CheckCircle2 /> <span className="neo-btn__label">Resolve</span>
      </button>
      <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onDone} aria-label="Clear selection">
        <X />
      </button>
      <BulkResolveModal
        ids={ids}
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onDone={() => {
          setResolveOpen(false);
          onDone();
        }}
      />
    </div>
  );
}

const CODES: ResolutionCode[] = ['fixed', 'workaround', 'replaced', 'no_fault', 'duplicate'];

function BulkResolveModal({ ids, open, onClose, onDone }: { ids: string[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState<ResolutionCode>('fixed');
  const [note, setNote] = useState('');
  const submit = () => {
    const st = useHelpdesk.getState();
    let count = 0;
    for (const id of ids) if (st.setStatus(id, 'resolved', { resolution: code, note }).ok) count++;
    if (!count) return toast.error('Nothing was resolved', 'Those tickets may already be closed.');
    toast.success(`${plural(count, 'ticket')} resolved`, 'Requesters were notified and asked for feedback.');
    setNote('');
    onDone();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Resolve ${plural(ids.length, 'ticket')}`}
      subtitle="Every requester gets your note and a feedback request."
      width={540}
      className="neo-portal hd-resolve"
      icon={
        <span className="hd-fixmodal__icon">
          <CheckCircle2 />
        </span>
      }
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} data-qa="bulk-resolve-confirm">
            <CheckCircle2 /> Resolve {ids.length}
          </button>
        </>
      }
    >
      <div className="neo-field">
        <span className="neo-label">Resolution</span>
        <div className="hd-chipset" role="radiogroup" aria-label="Resolution code">
          {CODES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={code === c} className="hd-choice" onClick={() => setCode(c)}>
              {RESOLUTION_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="neo-field" style={{ marginTop: 14 }}>
        <label className="neo-label" htmlFor="hd-queue-bulk-note">
          Note to requesters (optional)
        </label>
        <textarea id="hd-queue-bulk-note" className="neo-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The VPN gateway in Singapore was replaced — reconnect and you're set." />
      </div>
    </Modal>
  );
}
