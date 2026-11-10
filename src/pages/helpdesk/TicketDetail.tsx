/**
 * Ticket detail — header with live SLA rings, conversation timeline,
 * composer, requester/agent actions and a details inspector.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Copy, Lock, MessageSquareText, MoreHorizontal, PanelRight, RotateCcw, ShieldAlert, Link2, TicketX, UserCheck, X } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoMenu, NeoStage, Typing, type MenuEntry } from '@/components/neo';
import { relativeTime } from '@/lib/format';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import { canViewTicket, canWorkTicket } from '@/helpdesk/access';
import { CATEGORY_LABEL } from '@/helpdesk/meta';
import { firstNameOf } from '@/helpdesk/util';
import { CsatCard, Composer, ResolveModal, TicketFacts, Timeline, useTicketBridges } from './Conversation';
import { SlaPair, StatusPill, useViewer } from './ui';

const wide = () => typeof window !== 'undefined' && window.innerWidth > 1100;

export function TicketDetailView() {
  const { ticketId = '' } = useParams();
  const viewer = useViewer();
  const ticket = useHelpdesk((s) => s.tickets.find((t) => t.id === ticketId));
  const users = useHub((s) => s.users);
  const location = useLocation();
  const bridges = useTicketBridges();
  const [inspector, setInspector] = useState(wide);
  const [resolveOpen, setResolveOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const eventsCount = ticket?.events.length ?? 0;

  useHotkeys({
    ']': () => setInspector((v) => !v),
    '[': () => setInspector((v) => !v),
  });

  useEffect(() => {
    if (ticket && viewer && canViewTicket(viewer, ticket)) useHelpdesk.getState().markSeen(ticket.id);
  }, [ticket?.id, ticket?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (location.hash === '#rate') {
      requestAnimationFrame(() => document.getElementById('rate')?.scrollIntoView({ block: 'center' }));
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [ticketId, eventsCount, location.hash]);

  if (!viewer) return null;
  if (!ticket)
    return (
      <NeoStage>
        <NeoHead icon={<TicketX />} eyebrow="Tickets" title="Ticket not found" />
        <div className="neo-body">
          <NeoEmpty icon={<TicketX />} title={`No ticket called ${ticketId}`} action={<Link to="/helpdesk/tickets" className="neo-btn neo-btn--soft">Back to my tickets</Link>}>
            It may have been merged, or the link is mistyped.
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  if (!canViewTicket(viewer, ticket))
    return (
      <NeoStage>
        <NeoHead icon={<Lock />} eyebrow="Tickets" title="You don’t have access to this ticket" />
        <div className="neo-body">
          <NeoEmpty icon={<Lock />} title="This ticket belongs to someone else" action={<Link to="/helpdesk/tickets" className="neo-btn neo-btn--soft">Back to my tickets</Link>}>
            Tickets are visible to the requester, the assigned agent and the IT team.
          </NeoEmpty>
        </div>
      </NeoStage>
    );

  const agent = canWorkTicket(viewer, ticket);
  const isRequester = ticket.requesterId === viewer.user.id;
  const resolved = ticket.status === 'resolved';
  const requester = users.find((u) => u.id === ticket.requesterId);
  const back = agent && !isRequester ? '/helpdesk/queue' : '/helpdesk/tickets';
  const s = useHelpdesk.getState;

  const confirmFixed = (x: number, y: number) => {
    const r = s().confirmFixed(ticket.id);
    if (!r.ok) return toast.error(r.error);
    burstConfetti({ x, y });
    toast.success('Marked as fixed', 'Thanks! Mind rating the help you got?');
  };
  const reopen = () => {
    const r = s().reopen(ticket.id);
    if (!r.ok) return toast.error(r.error);
    toast.info(`${ticket.id} reopened`, ticket.assigneeId ? `${firstNameOf(users.find((u) => u.id === ticket.assigneeId)?.name)} has been notified.` : 'IT has been notified.');
  };

  const menu: MenuEntry[] = [];
  if (isRequester && ticket.assigneeId) menu.push({ label: `Chat with ${firstNameOf(users.find((u) => u.id === ticket.assigneeId)?.name)}`, icon: <MessageSquareText />, onSelect: () => bridges.chatWith(ticket.assigneeId!) });
  if (agent && !isRequester) menu.push({ label: `Chat with ${firstNameOf(requester?.name)}`, icon: <MessageSquareText />, onSelect: () => bridges.chatWith(ticket.requesterId) });
  if (viewer.it && ticket.assigneeId !== viewer.user.id && !resolved)
    menu.push({
      label: 'Assign to me',
      icon: <UserCheck />,
      onSelect: () => {
        const r = s().assign(ticket.id, viewer.user.id);
        if (r.ok) toast.success(`${ticket.id} is yours`);
        else toast.error(r.error);
      },
    });
  if (agent && !ticket.escalated && !resolved)
    menu.push({
      label: 'Escalate to Security',
      icon: <ShieldAlert />,
      onSelect: () => {
        const r = s().escalate(ticket.id);
        if (r.ok) toast.warning('Escalated to Security', 'Assigned to the security on-call.');
        else toast.error(r.error);
      },
    });
  if (agent) menu.push({ label: 'Create follow-up task', icon: <Link2 />, onSelect: () => bridges.followUp(ticket) });
  if (menu.length) menu.push({ kind: 'sep' });
  menu.push({
    label: 'Copy link',
    icon: <Copy />,
    onSelect: () => {
      void navigator.clipboard?.writeText(`${window.location.origin}/helpdesk/tickets/${ticket.id}`).catch(() => undefined);
      toast.success('Link copied');
    },
  });

  return (
    <NeoStage label={`Ticket ${ticket.id}`}>
      <NeoHead
        className="hd-thead"
        icon={
          <Link to={back} className="hd-back" aria-label="Back" data-tip="Back">
            <ArrowLeft />
          </Link>
        }
        eyebrow={
          <>
            <span className="neo-mono">{ticket.id}</span> · {CATEGORY_LABEL[ticket.category]}
            {ticket.escalated && <span className="hd-esc">Security</span>}
          </>
        }
        title={ticket.subject}
        sub={
          <span className="hd-thead__sub">
            <StatusPill status={ticket.status} agent={agent && !isRequester} size="sm" /> Opened {relativeTime(ticket.createdAt)} by {isRequester ? 'you' : requester?.name} · updated {relativeTime(ticket.updatedAt)}
          </span>
        }
        center={<SlaPair ticket={ticket} size={50} />}
        actions={
          <>
            {!resolved && isRequester && !agent && (
              <button
                type="button"
                className="neo-btn neo-btn--success"
                onClick={(e) => {
                  const b = e.currentTarget.getBoundingClientRect();
                  confirmFixed(b.left + b.width / 2, b.top);
                }}
                data-qa="its-fixed"
              >
                <CheckCircle2 /> <span className="neo-btn__label">It’s fixed</span>
              </button>
            )}
            {!resolved && agent && (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setResolveOpen(true)} data-qa="resolve">
                <CheckCircle2 /> <span className="neo-btn__label">Resolve</span>
              </button>
            )}
            {resolved && (isRequester || agent) && (
              <button type="button" className="neo-btn neo-btn--soft" onClick={reopen} data-qa="reopen">
                <RotateCcw /> <span className="neo-btn__label">Reopen</span>
              </button>
            )}
            <button type="button" className={cx('neo-iconbtn', inspector && 'is-on')} onClick={() => setInspector((v) => !v)} aria-label="Toggle details" aria-pressed={inspector} data-tip="Details ( ] )" data-qa="toggle-details">
              <PanelRight />
            </button>
            <NeoMenu
              items={menu}
              label="Ticket actions"
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />
      <div className={cx('neo-split hd-fill hd-tsplit', !inspector && 'is-solo')}>
        <div className="hd-convo">
          <div className="neo-body hd-convo__scroll" ref={scroller}>
            <div className="hd-convo__inner">
              <Timeline ticket={ticket} viewer={viewer} />
              {ticket.sim === 'pickup' && (
                <div className="hd-typing" role="status">
                  <Typing label="Matching an agent" /> Matching you with the right specialist…
                </div>
              )}
              {isRequester && resolved && !ticket.csat && !ticket.selfService && <CsatCard ticket={ticket} />}
            </div>
          </div>
          <Composer ticket={ticket} viewer={viewer} />
        </div>
        {inspector && (
          <aside className="neo-inspector hd-tinspector" aria-label="Ticket details">
            <header className="hd-tinspector__head">
              <span className="neo-hud">Details</span>
              <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setInspector(false)} aria-label="Close details">
                <X />
              </button>
            </header>
            <div className="hd-tinspector__body">
              <TicketFacts ticket={ticket} viewer={viewer} />
            </div>
          </aside>
        )}
      </div>
      <ResolveModal ticket={ticket} open={resolveOpen} onClose={() => setResolveOpen(false)} />
    </NeoStage>
  );
}
