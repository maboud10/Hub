/**
 * Queue inspector — work a ticket without leaving the queue: live SLA
 * clocks, the original request, the latest reply, agent controls
 * (TicketFacts) and a compact composer for replies and internal notes.
 */
import { useEffect } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CheckCircle2, Lock, Maximize2, MessageSquareText, RotateCcw, UserCheck, X } from 'lucide-react';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import type { Ticket } from '@/helpdesk/types';
import { CATEGORY_LABEL } from '@/helpdesk/meta';
import { firstNameOf } from '@/helpdesk/util';
import { Composer, TicketFacts } from './Conversation';
import { CategoryGlyph, PriorityPill, SlaPair, StatusPill, type HdViewer } from './ui';

export function QueueInspector({ ticket, viewer, onClose, onOpen, onResolve }: { ticket: Ticket; viewer: HdViewer; onClose: () => void; onOpen: () => void; onResolve: () => void }) {
  const users = useHub((s) => s.users);
  const now = useNow(30_000);
  const me = viewer.user.id;
  const resolved = ticket.status === 'resolved';
  const requester = users.find((u) => u.id === ticket.requesterId);
  const created = ticket.events.find((e) => e.kind === 'created');
  const last = [...ticket.events].reverse().find((e) => (e.kind === 'reply' || e.kind === 'note') && e.body);
  const lastActor = users.find((u) => u.id === last?.actorId);

  useEffect(() => {
    useHelpdesk.getState().markSeen(ticket.id);
  }, [ticket.id, ticket.updatedAt]);

  const assignMe = () => {
    const r = useHelpdesk.getState().assign(ticket.id, me);
    if (r.ok) toast.success(`${ticket.id} is yours`, ticket.subject);
    else toast.error(r.error);
  };
  const reopen = () => {
    const r = useHelpdesk.getState().reopen(ticket.id);
    if (r.ok) toast.info(`${ticket.id} reopened`, `${firstNameOf(requester?.name)} has been notified.`);
    else toast.error(r.error);
  };

  return (
    <aside className="neo-inspector hd-queue-insp" aria-label={`Ticket ${ticket.id}`} data-qa="queue-inspector">
      <header className="hd-queue-insp__head">
        <PriorityPill priority={ticket.priority} full />
        <span className="neo-mono hd-queue-insp__id">{ticket.id}</span>
        {ticket.escalated && <span className="hd-esc">Security</span>}
        <span className="grow" />
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onOpen} aria-label="Open full ticket" data-tip="Open ticket (O)">
          <Maximize2 />
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onClose} aria-label="Close inspector" data-tip="Close (Esc)">
          <X />
        </button>
      </header>
      <div className="hd-queue-insp__body">
        <div className="hd-queue-insp__hero">
          <CategoryGlyph category={ticket.category} size={40} />
          <div className="hd-queue-insp__titles">
            <h2 className="hd-queue-insp__title">{ticket.subject}</h2>
            <div className="hd-queue-insp__meta">
              <StatusPill status={ticket.status} agent size="sm" />
              <span>{CATEGORY_LABEL[ticket.category]}</span>
              <span>opened {relativeTime(ticket.createdAt, now)}</span>
            </div>
          </div>
        </div>

        <div className="hd-queue-insp__sla">
          <SlaPair ticket={ticket} size={44} />
        </div>

        <div className="hd-queue-insp__actions">
          {!resolved && ticket.assigneeId !== me && (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={assignMe} data-qa="insp-assign-me">
              <UserCheck /> Assign to me
            </button>
          )}
          {resolved ? (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={reopen}>
              <RotateCcw /> Reopen
            </button>
          ) : (
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onResolve} data-qa="insp-resolve">
              <CheckCircle2 /> Resolve
            </button>
          )}
          <Link to={`/helpdesk/tickets/${ticket.id}`} className="neo-btn neo-btn--ghost neo-btn--sm hd-queue-insp__open">
            Open <ArrowRight />
          </Link>
        </div>

        <section className="hd-queue-insp__quote">
          <div className="neo-hud">
            <MessageSquareText /> Request · {requester?.name ?? 'Unknown'}
          </div>
          <p>{created?.body ?? ticket.description}</p>
        </section>
        {last && (
          <section className="hd-queue-insp__quote" data-kind={last.kind}>
            <div className="neo-hud">
              {last.kind === 'note' ? <Lock /> : <MessageSquareText />}
              {last.kind === 'note' ? 'Internal note' : 'Latest reply'} · {last.actorId === me ? 'You' : (lastActor?.name ?? 'Someone')} · {relativeTime(last.at, now)}
            </div>
            <p>{last.body}</p>
          </section>
        )}

        <div className="neo-divider" />
        <TicketFacts ticket={ticket} viewer={viewer} />
      </div>
      <div className="hd-queue-insp__composer">
        <Composer key={ticket.id} ticket={ticket} viewer={viewer} compact />
      </div>
    </aside>
  );
}
