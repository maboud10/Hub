import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Star,
  Ticket,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useHelpdesk } from '@/helpdesk/store';
import type { TicketStatus } from '@/helpdesk/types';
import {
  AssetTagBadge,
  SLA_STATUS_META,
  TICKET_CATEGORY_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
} from './shared';

export function TicketsView({
  onInspectDevice,
  onRaiseTicket,
}: {
  onInspectDevice: (deviceId: string) => void;
  onRaiseTicket: (deviceId?: string) => void;
}) {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const tickets = useHelpdesk((s) => s.tickets);
  const devices = useHelpdesk((s) => s.devices);
  const addTicketComment = useHelpdesk((s) => s.addTicketComment);
  const updateTicketStatus = useHelpdesk((s) => s.updateTicketStatus);
  const rateTicketCsat = useHelpdesk((s) => s.rateTicketCsat);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIdParam = searchParams.get('ticket');

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open_only' | 'resolved'>('all');
  const [query, setQuery] = useState('');
  const [replyText, setReplyText] = useState('');

  const myUserId = me?.id ?? 'u-mei';

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (scope === 'mine' && t.requesterId !== myUserId) return false;
      if (statusFilter === 'open_only' && (t.status === 'resolved' || t.status === 'closed'))
        return false;
      if (statusFilter === 'resolved' && t.status !== 'resolved' && t.status !== 'closed')
        return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const dev = devices.find((d) => d.id === t.deviceId);
        const match =
          t.number.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (dev && dev.assetTag.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [tickets, scope, myUserId, statusFilter, query, devices]);

  const activeTicket =
    tickets.find((t) => t.id === selectedIdParam) ??
    filteredTickets[0] ??
    tickets[0] ??
    null;

  const linkedDevice = activeTicket
    ? devices.find((d) => d.id === activeTicket.deviceId)
    : undefined;
  const requester = activeTicket
    ? users.find((u) => u.id === activeTicket.requesterId)
    : undefined;
  const assignee = activeTicket
    ? users.find((u) => u.id === activeTicket.assigneeId)
    : undefined;

  const handleSelectTicket = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('ticket', id);
    setSearchParams(next, { replace: true });
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    const res = addTicketComment(activeTicket.id, replyText, { authorId: myUserId });
    if (toast.result(res)) {
      setReplyText('');
    }
  };

  const handleStatusChange = (status: TicketStatus) => {
    if (!activeTicket) return;
    const res = updateTicketStatus(activeTicket.id, status, myUserId);
    toast.result(res);
  };

  return (
    <div className="hd-tickets-layout">
      {/* Left Column: Filterable Ticket List */}
      <div className="hd-tickets-list-pane">
        <div className="hd-tickets-toolbar">
          <div className="hd-scope-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'mine'}
              className={cx('hd-scope-tab', scope === 'mine' && 'is-active')}
              onClick={() => setScope('mine')}
            >
              My Tickets ({tickets.filter((t) => t.requesterId === myUserId).length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'all'}
              className={cx('hd-scope-tab', scope === 'all' && 'is-active')}
              onClick={() => setScope('all')}
            >
              All Team Tickets ({tickets.length})
            </button>
          </div>

          <div className="hd-search-box">
            <Search size={14} />
            <input
              type="search"
              placeholder="Search IT-1042, asset tag HX-…, or keyword…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="hd-filter-pills">
            {(['all', 'open_only', 'resolved'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={cx('hd-filter-pill', statusFilter === f && 'is-active')}
                onClick={() => setStatusFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'open_only' ? 'Active / Open' : 'Resolved'}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--xs btn--primary ml-auto"
              onClick={() => onRaiseTicket()}
            >
              <Plus size={13} /> New Ticket
            </button>
          </div>
        </div>

        <div className="hd-tickets-scroll">
          {filteredTickets.map((t) => {
            const prio = TICKET_PRIORITY_META[t.priority];
            const stat = TICKET_STATUS_META[t.status];
            const sla = SLA_STATUS_META[t.slaStatus];
            const dev = devices.find((d) => d.id === t.deviceId);
            const reqUser = users.find((u) => u.id === t.requesterId);
            const selected = activeTicket?.id === t.id;

            return (
              <button
                key={t.id}
                type="button"
                className={cx('hd-ticket-card', selected && 'is-selected')}
                onClick={() => handleSelectTicket(t.id)}
              >
                <div className="hd-ticket-card__top">
                  <span className="mono text-xs">{t.number}</span>
                  <span className={cx('hd-pill', `hd-pill--${prio.tone}`)}>{prio.short}</span>
                  <span className={cx('hd-pill', `hd-pill--${stat.tone}`)}>{stat.label}</span>
                  <span className={cx('hd-pill', `hd-pill--${sla.tone}`, 'ml-auto')}>
                    {sla.label}
                  </span>
                </div>

                <div className="hd-ticket-card__title">{t.title}</div>

                <div className="hd-ticket-card__foot">
                  {reqUser && (
                    <span className="text-xs muted">
                      {reqUser.name.split(' ')[0]} · {relativeTime(t.createdAt)}
                    </span>
                  )}
                  {dev && (
                    <AssetTagBadge
                      assetTag={dev.assetTag}
                      category={dev.category}
                      size="sm"
                    />
                  )}
                </div>
              </button>
            );
          })}

          {filteredTickets.length === 0 && (
            <EmptyState
              icon={<Ticket size={24} />}
              title="No matching tickets"
              action={
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => onRaiseTicket()}
                >
                  + Raise a Ticket
                </button>
              }
            >
              Try switching to “All Team Tickets” or clearing your search filter.
            </EmptyState>
          )}
        </div>
      </div>

      {/* Right Column: Ticket Detail, Linked Hardware Asset & Conversation */}
      <div className="hd-ticket-detail-pane">
        {activeTicket ? (
          <div className="hd-ticket-detail">
            <div className="hd-ticket-detail__head">
              <div className="hd-ticket-detail__badges">
                <span className="mono hd-ticket-number">{activeTicket.number}</span>
                <span
                  className={cx(
                    'hd-pill',
                    `hd-pill--${TICKET_PRIORITY_META[activeTicket.priority].tone}`,
                  )}
                >
                  {TICKET_PRIORITY_META[activeTicket.priority].label} (
                  {activeTicket.slaTargetHours}h SLA)
                </span>
                <span
                  className={cx(
                    'hd-pill',
                    `hd-pill--${TICKET_STATUS_META[activeTicket.status].tone}`,
                  )}
                >
                  {TICKET_STATUS_META[activeTicket.status].label}
                </span>
                <span
                  className={cx(
                    'hd-pill',
                    `hd-pill--${SLA_STATUS_META[activeTicket.slaStatus].tone}`,
                  )}
                >
                  <Clock size={12} /> {SLA_STATUS_META[activeTicket.slaStatus].label}
                </span>
              </div>

              <h2 className="hd-ticket-detail__title">{activeTicket.title}</h2>

              <div className="hd-ticket-detail__people">
                {requester && (
                  <div className="hd-person-chip">
                    <Avatar user={requester} size={26} />
                    <div>
                      <span className="text-xs muted block">Requester</span>
                      <strong className="text-xs">
                        {requester.name} ({requester.department})
                      </strong>
                    </div>
                  </div>
                )}
                {assignee && (
                  <div className="hd-person-chip">
                    <Avatar user={assignee} size={26} />
                    <div>
                      <span className="text-xs muted block">Assigned IT Engineer</span>
                      <strong className="text-xs">{assignee.name}</strong>
                    </div>
                  </div>
                )}
                <div className="hd-person-chip">
                  <div>
                    <span className="text-xs muted block">Category</span>
                    <strong className="text-xs">
                      {TICKET_CATEGORY_META[activeTicket.category].label}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Linked Hardware Asset Banner */}
            {linkedDevice && (
              <div className="hd-linked-device-banner">
                <div className="grow min-w-0">
                  <div className="text-xs muted">LINKED HARDWARE ASSET & MDM SNAPSHOT</div>
                  <div className="hd-linked-device-banner__row">
                    <AssetTagBadge
                      assetTag={linkedDevice.assetTag}
                      category={linkedDevice.category}
                      onClick={() => onInspectDevice(linkedDevice.id)}
                    />
                    <strong>{linkedDevice.name}</strong>
                    <span className="text-xs muted">
                      ({linkedDevice.model} · S/N {linkedDevice.serialNumber})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--xs btn--ghost"
                  onClick={() => onInspectDevice(linkedDevice.id)}
                >
                  Inspect Asset & QR Tag
                </button>
              </div>
            )}

            {/* Description & Telemetry Snapshot */}
            <div className="hd-ticket-detail__body">
              <p className="hd-ticket-detail__desc">{activeTicket.description}</p>
              {activeTicket.includeTelemetry && linkedDevice && (
                <div className="hd-telemetry-snippet">
                  <ShieldCheck size={14} className="text-success" />
                  <span>
                    Attached Telemetry: {linkedDevice.specs.osVersion ?? linkedDevice.model} ·
                    FileVault {linkedDevice.encrypted ? 'Escrowed' : 'Off'} · CrowdStrike EDR{' '}
                    {linkedDevice.edrActive ? 'Active' : 'Offline'} · Hub: {linkedDevice.location}
                  </span>
                </div>
              )}
            </div>

            {/* Status & CSAT Action Bar */}
            <div className="hd-ticket-detail__actions">
              {activeTicket.status !== 'resolved' && activeTicket.status !== 'closed' ? (
                <>
                  <button
                    type="button"
                    className="btn btn--xs btn--primary"
                    onClick={() => handleStatusChange('resolved')}
                  >
                    <CheckCircle2 size={13} /> Mark Resolved
                  </button>
                  <button
                    type="button"
                    className="btn btn--xs btn--ghost"
                    onClick={() => handleStatusChange('in_progress')}
                  >
                    Mark In Progress
                  </button>
                </>
              ) : (
                <div className="hd-csat-bar">
                  <span className="text-xs">
                    {activeTicket.csatRating
                      ? `Rated ${activeTicket.csatRating}/5 CSAT:`
                      : 'Rate IT resolution speed & quality:'}
                  </span>
                  <div className="hd-csat-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={cx(
                          'hd-star-btn',
                          (activeTicket.csatRating ?? 0) >= star && 'is-lit',
                        )}
                        onClick={() => {
                          const res = rateTicketCsat(activeTicket.id, star);
                          toast.result(res);
                        }}
                        aria-label={`Rate ${star} out of 5 stars`}
                      >
                        <Star size={15} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn--xs btn--ghost ml-auto"
                    onClick={() => handleStatusChange('open')}
                  >
                    Reopen Ticket
                  </button>
                </div>
              )}
            </div>

            {/* Activity & Comments Thread */}
            <div className="hd-comments">
              <h4 className="hd-comments__title">
                <MessageSquare size={15} /> Activity & Engineering Thread (
                {activeTicket.comments.length})
              </h4>

              <div className="hd-comments__list">
                {activeTicket.comments.map((cm) => {
                  const author = users.find((u) => u.id === cm.authorId);
                  return (
                    <div
                      key={cm.id}
                      className={cx('hd-comment', cm.internal && 'hd-comment--internal')}
                    >
                      {author && <Avatar user={author} size={28} />}
                      <div className="grow min-w-0">
                        <div className="hd-comment__head">
                          <strong>{author?.name ?? cm.authorId}</strong>
                          <span className="text-xs muted">{author?.title}</span>
                          {cm.internal && (
                            <span className="hd-pill hd-pill--warning">IT Internal Note</span>
                          )}
                          <span className="text-xs muted ml-auto">
                            {formatDateTime(cm.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm">{cm.body}</p>
                      </div>
                    </div>
                  );
                })}

                {activeTicket.comments.length === 0 && (
                  <p className="text-xs muted">
                    No comments yet — IT & Security has received your ticket and telemetry.
                  </p>
                )}
              </div>

              <form className="hd-reply-form" onSubmit={handleSendReply}>
                <input
                  type="text"
                  className="input grow"
                  placeholder={`Reply on ${activeTicket.number}…`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn--sm btn--primary"
                  disabled={!replyText.trim()}
                >
                  <Send size={14} /> Send Reply
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
