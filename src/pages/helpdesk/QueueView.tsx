import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Lock,
  Search,
  Send,
  Star,
  Zap,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useHelpdesk } from '@/helpdesk/store';
import type { TicketPriority, TicketStatus } from '@/helpdesk/types';
import {
  AssetTagBadge,
  SLA_STATUS_META,
  TICKET_CATEGORY_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
} from './shared';

const IT_AGENTS = ['u-layla', 'u-ethan', 'u-mateo'];

export function QueueView({
  onInspectDevice,
}: {
  onInspectDevice: (deviceId: string) => void;
}) {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const tickets = useHelpdesk((s) => s.tickets);
  const devices = useHelpdesk((s) => s.devices);
  const updateTicketStatus = useHelpdesk((s) => s.updateTicketStatus);
  const assignTicket = useHelpdesk((s) => s.assignTicket);
  const updateTicketPriority = useHelpdesk((s) => s.updateTicketPriority);
  const addTicketComment = useHelpdesk((s) => s.addTicketComment);
  const runMdmCommand = useHelpdesk((s) => s.runMdmCommand);

  const [prioFilter, setPrioFilter] = useState<TicketPriority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusScope, setStatusScope] = useState<'active' | 'all' | 'resolved'>('active');
  const [query, setQuery] = useState('');
  const [noteByTicket, setNoteByTicket] = useState<Record<string, string>>({});
  const [internalByTicket, setInternalByTicket] = useState<Record<string, boolean>>({});

  const queueStats = useMemo(() => {
    const active = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed');
    const p1p2 = active.filter((t) => t.priority === 'p1' || t.priority === 'p2');
    const slaAttention = active.filter(
      (t) => t.slaStatus === 'at_risk' || t.slaStatus === 'breached',
    );
    const rated = tickets.filter((t) => typeof t.csatRating === 'number');
    const avgCsat = rated.length
      ? (rated.reduce((s, t) => s + (t.csatRating ?? 5), 0) / rated.length).toFixed(1)
      : '5.0';
    return {
      activeCount: active.length,
      p1p2Count: p1p2.length,
      slaAttentionCount: slaAttention.length,
      avgCsat,
    };
  }, [tickets]);

  const filteredQueue = useMemo(() => {
    return tickets.filter((t) => {
      const isResolved = t.status === 'resolved' || t.status === 'closed';
      if (statusScope === 'active' && isResolved) return false;
      if (statusScope === 'resolved' && !isResolved) return false;
      if (prioFilter !== 'all' && t.priority !== prioFilter) return false;
      if (assigneeFilter !== 'all' && t.assigneeId !== assigneeFilter) return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const req = users.find((u) => u.id === t.requesterId);
        const dev = devices.find((d) => d.id === t.deviceId);
        const match =
          t.number.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (req && req.name.toLowerCase().includes(q)) ||
          (dev && dev.assetTag.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [tickets, statusScope, prioFilter, assigneeFilter, query, users, devices]);

  const handlePostNote = (ticketId: string) => {
    const body = noteByTicket[ticketId]?.trim();
    if (!body) return;
    const isInternal = internalByTicket[ticketId] ?? true;
    const res = addTicketComment(ticketId, body, {
      internal: isInternal,
      authorId: me?.id ?? 'u-layla',
    });
    if (toast.result(res)) {
      setNoteByTicket((prev) => ({ ...prev, [ticketId]: '' }));
    }
  };

  return (
    <div className="hd-queue-view">
      {/* Queue KPI Cards */}
      <div className="hd-kpi-grid">
        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">ACTIVE TRIAGE QUEUE</div>
          <div className="hd-kpi-card__value">{queueStats.activeCount} Open</div>
          <div className="hd-kpi-card__sub">Across Dubai, Singapore, London & Berlin</div>
        </div>

        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">P1 / P2 HIGH PRIORITY</div>
          <div className="hd-kpi-card__value text-warning">
            {queueStats.p1p2Count} High Impact
          </div>
          <div className="hd-kpi-card__sub">1h–4h response SLA enforcement</div>
        </div>

        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">SLA AT-RISK / BREACHED</div>
          <div className="hd-kpi-card__value text-danger">
            {queueStats.slaAttentionCount} Escalated
          </div>
          <div className="hd-kpi-card__sub">Auto-paged to IT & Security on-call</div>
        </div>

        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">EMPLOYEE CSAT SCORE</div>
          <div className="hd-kpi-card__value text-success">
            <Star size={18} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
            {queueStats.avgCsat} / 5.0
          </div>
          <div className="hd-kpi-card__sub">98% first-contact resolution rate</div>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="hd-panel">
        <div className="hd-inv-toolbar">
          <div className="hd-search-box grow">
            <Search size={14} />
            <input
              type="search"
              placeholder="Filter queue by IT-1044, requester name, or asset tag HX-…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="hd-filter-pills">
            {(['active', 'all', 'resolved'] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                className={cx('hd-filter-pill', statusScope === sc && 'is-active')}
                onClick={() => setStatusScope(sc)}
              >
                {sc === 'active'
                  ? `Active Queue (${queueStats.activeCount})`
                  : sc === 'all'
                    ? `All (${tickets.length})`
                    : 'Resolved'}
              </button>
            ))}
          </div>

          <select
            className="input input--sm"
            aria-label="Filter by Priority"
            value={prioFilter}
            onChange={(e) => setPrioFilter(e.target.value as TicketPriority | 'all')}
          >
            <option value="all">All Priorities</option>
            <option value="p1">P1 · Critical (1h)</option>
            <option value="p2">P2 · High (4h)</option>
            <option value="p3">P3 · Normal (8h)</option>
            <option value="p4">P4 · Low (24h)</option>
          </select>

          <select
            className="input input--sm"
            aria-label="Filter by IT Assignee"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All IT Engineers</option>
            {IT_AGENTS.map((id) => {
              const u = users.find((x) => x.id === id);
              return (
                <option key={id} value={id}>
                  {u?.name ?? id}
                </option>
              );
            })}
          </select>
        </div>

        {/* Triage Cards List */}
        <div className="hd-triage-list">
          {filteredQueue.map((t) => {
            const reqUser = users.find((u) => u.id === t.requesterId);
            const dev = devices.find((d) => d.id === t.deviceId);
            const prioMeta = TICKET_PRIORITY_META[t.priority];
            const statMeta = TICKET_STATUS_META[t.status];
            const slaMeta = SLA_STATUS_META[t.slaStatus];
            const isInternal = internalByTicket[t.id] ?? true;

            return (
              <article key={t.id} className="hd-triage-card">
                <div className="hd-triage-card__top">
                  <div className="hd-triage-card__badges">
                    <span className="mono hd-ticket-number">{t.number}</span>
                    <span className={cx('hd-pill', `hd-pill--${prioMeta.tone}`)}>
                      {prioMeta.label}
                    </span>
                    <span className={cx('hd-pill', `hd-pill--${statMeta.tone}`)}>
                      {statMeta.label}
                    </span>
                    <span className={cx('hd-pill', `hd-pill--${slaMeta.tone}`)}>
                      <Clock size={12} /> {slaMeta.label}
                    </span>
                    <span className="hd-pill hd-pill--neutral">
                      {TICKET_CATEGORY_META[t.category].label}
                    </span>
                  </div>
                  <span className="text-xs muted">Filed {relativeTime(t.createdAt)}</span>
                </div>

                <div className="hd-triage-card__main">
                  <div className="grow min-w-0">
                    <h4 className="hd-triage-card__title">{t.title}</h4>
                    <p className="text-sm muted">{t.description}</p>

                    <div className="hd-triage-card__meta-row">
                      {reqUser && (
                        <div className="hd-person-chip">
                          <Avatar user={reqUser} size={24} presence />
                          <span className="text-xs">
                            <strong>{reqUser.name}</strong> · {reqUser.department} ({reqUser.location})
                          </span>
                        </div>
                      )}

                      {dev && (
                        <div className="hd-triage-device-pill">
                          <AssetTagBadge
                            assetTag={dev.assetTag}
                            category={dev.category}
                            onClick={() => onInspectDevice(dev.id)}
                          />
                          <span className="text-xs">{dev.model}</span>
                          {dev.compliance === 'patch_required' && (
                            <button
                              type="button"
                              className="btn btn--xs btn--ghost"
                              onClick={() => {
                                const res = runMdmCommand(dev.id, 'push_os_patch');
                                toast.result(res);
                              }}
                            >
                              <Zap size={12} /> Push MDM Patch
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Triage Controls */}
                  <div className="hd-triage-controls">
                    <div className="hd-triage-control-field">
                      <label className="text-xs muted">IT Assignee</label>
                      <select
                        className="input input--sm"
                        aria-label={`Assign ${t.number}`}
                        value={t.assigneeId ?? ''}
                        onChange={(e) => {
                          const res = assignTicket(t.id, e.target.value || undefined);
                          toast.result(res);
                        }}
                      >
                        <option value="">Unassigned</option>
                        {IT_AGENTS.map((id) => {
                          const u = users.find((x) => x.id === id);
                          return (
                            <option key={id} value={id}>
                              {u?.name ?? id}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="hd-triage-control-field">
                      <label className="text-xs muted">Priority & SLA</label>
                      <select
                        className="input input--sm"
                        aria-label={`Priority for ${t.number}`}
                        value={t.priority}
                        onChange={(e) => {
                          const res = updateTicketPriority(
                            t.id,
                            e.target.value as TicketPriority,
                          );
                          toast.result(res);
                        }}
                      >
                        <option value="p1">P1 (1h SLA)</option>
                        <option value="p2">P2 (4h SLA)</option>
                        <option value="p3">P3 (8h SLA)</option>
                        <option value="p4">P4 (24h SLA)</option>
                      </select>
                    </div>

                    <div className="hd-triage-control-field">
                      <label className="text-xs muted">Workflow Status</label>
                      <select
                        className="input input--sm"
                        aria-label={`Status for ${t.number}`}
                        value={t.status}
                        onChange={(e) => {
                          const res = updateTicketStatus(
                            t.id,
                            e.target.value as TicketStatus,
                          );
                          toast.result(res);
                        }}
                      >
                        {(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {TICKET_STATUS_META[st].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Quick Note / Resolution Bar */}
                <div className="hd-triage-card__foot">
                  <div className="hd-triage-note-box grow">
                    <button
                      type="button"
                      className={cx('hd-internal-toggle', isInternal && 'is-internal')}
                      onClick={() =>
                        setInternalByTicket((prev) => ({
                          ...prev,
                          [t.id]: !isInternal,
                        }))
                      }
                      title="Toggle between Internal IT Note and Public Requester Reply"
                    >
                      <Lock size={12} />
                      {isInternal ? 'Internal Note' : 'Public Reply'}
                    </button>
                    <input
                      type="text"
                      className="input input--sm grow"
                      placeholder={
                        isInternal
                          ? `Add internal triage note on ${t.number}…`
                          : `Send update to ${reqUser?.name.split(' ')[0] ?? 'requester'}…`
                      }
                      value={noteByTicket[t.id] ?? ''}
                      onChange={(e) =>
                        setNoteByTicket((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handlePostNote(t.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn--xs btn--ghost"
                      onClick={() => handlePostNote(t.id)}
                    >
                      <Send size={12} /> Post
                    </button>
                  </div>

                  {t.status !== 'resolved' && t.status !== 'closed' && (
                    <button
                      type="button"
                      className="btn btn--xs btn--primary"
                      onClick={() => {
                        const res = updateTicketStatus(t.id, 'resolved');
                        toast.result(res);
                      }}
                    >
                      <CheckCircle2 size={13} /> Resolve Ticket
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {filteredQueue.length === 0 && (
            <EmptyState
              icon={<CheckCircle2 size={26} />}
              title="Queue is clear for this filter"
            >
              All matching helpdesk tickets have been triaged or resolved.
            </EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
