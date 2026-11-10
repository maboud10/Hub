/**
 * My tickets — tabs (Open / Waiting on me / Resolved / All), search, live
 * SLA chips, unread markers and last-message previews.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Inbox, Plus, Sparkles, Star, Ticket as TicketIcon } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoSearch, NeoStage, NeoTabs, NovaChip } from '@/components/neo';
import { relativeTime } from '@/lib/format';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { Ticket } from '@/helpdesk/types';
import { CATEGORY_LABEL } from '@/helpdesk/meta';
import { isOpen, isUnread } from '@/helpdesk/queries';
import { firstNameOf } from '@/helpdesk/util';
import { CategoryGlyph, Kbd, SlaChip, StatusPill, useOpenTicket, useViewer, plural } from './ui';

type Tab = 'open' | 'waiting' | 'resolved' | 'all';

export function TicketsView() {
  const viewer = useViewer();
  const tickets = useHelpdesk((s) => s.tickets);
  const seen = useHelpdesk((s) => s.seen);
  const [sp, setSp] = useSearchParams();
  const tab = (['open', 'waiting', 'resolved', 'all'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'open') as Tab;
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const openTicket = useOpenTicket();
  const me = viewer?.user.id ?? '';
  useHotkeys({
    s: (e) => {
      e.preventDefault();
      search.current?.focus();
    },
  });

  const mine = useMemo(() => tickets.filter((t) => t.requesterId === me), [tickets, me]);
  const counts = useMemo(
    () => ({
      open: mine.filter(isOpen).length,
      waiting: mine.filter((t) => t.status === 'waiting').length,
      resolved: mine.filter((t) => t.status === 'resolved').length,
      all: mine.length,
    }),
    [mine],
  );
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return mine
      .filter((t) => (tab === 'open' ? isOpen(t) : tab === 'waiting' ? t.status === 'waiting' : tab === 'resolved' ? t.status === 'resolved' : true))
      .filter((t) => !term || `${t.id} ${t.subject} ${t.description} ${CATEGORY_LABEL[t.category]} ${t.deviceTag ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting') || Number(isOpen(b)) - Number(isOpen(a)) || b.updatedAt - a.updatedAt);
  }, [mine, tab, q]);

  const setTab = (v: Tab) => {
    const next = new URLSearchParams(sp);
    if (v === 'open') next.delete('tab');
    else next.set('tab', v);
    setSp(next, { replace: true });
  };

  return (
    <NeoStage label="My tickets">
      <NeoHead
        icon={<TicketIcon />}
        eyebrow="Support"
        title="My tickets"
        sub={counts.waiting ? `${plural(counts.open, 'open ticket')} · ${counts.waiting} waiting on you` : counts.open ? `${plural(counts.open, 'open ticket')} · we’re on it` : 'Nothing open right now'}
        actions={
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openTicket()} data-tip="New ticket (C)" data-qa="tickets-new">
            <Plus /> <span className="neo-btn__label">New ticket</span>
          </button>
        }
      />
      <div className="neo-toolbar hd-toolbar">
        <NeoTabs<Tab>
          label="Filter tickets"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'waiting', label: 'Waiting on me', count: counts.waiting || null },
            { value: 'resolved', label: 'Resolved', count: counts.resolved },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="grow" />
        <NeoSearch value={q} onChange={setQ} placeholder="Search tickets" kbd="S" inputRef={search} size="sm" className="hd-toolbar__search" />
      </div>
      <div className="neo-body neo-pad">
        {list.length === 0 ? (
          <NeoEmpty
            icon={tab === 'waiting' ? <Inbox /> : <TicketIcon />}
            title={q ? 'No tickets match' : tab === 'waiting' ? 'Nothing is waiting on you' : tab === 'resolved' ? 'No resolved tickets yet' : 'No open tickets — nice'}
            action={
              q ? (
                <button type="button" className="neo-btn neo-btn--soft" onClick={() => setQ('')}>
                  Clear search
                </button>
              ) : (
                <Link to="/helpdesk" className="neo-btn neo-btn--soft">
                  <Sparkles /> Describe an issue to Nova
                </Link>
              )
            }
          >
            {q ? `Nothing in “${tab}” matches “${q}”.` : 'When something breaks, Nova usually fixes it before you need a ticket.'}
          </NeoEmpty>
        ) : (
          <div className="hd-tlist neo-stagger" role="list">
            {list.map((t, i) => (
              <TicketRow key={t.id} t={t} i={i} unread={isOpen(t) && isUnread(t, seen[me]?.[t.id], me)} />
            ))}
          </div>
        )}
        {list.length > 0 && (
          <div className="hd-listfoot">
            <Kbd>S</Kbd> search · <Kbd>C</Kbd> new ticket
          </div>
        )}
      </div>
    </NeoStage>
  );
}

function TicketRow({ t, i, unread }: { t: Ticket; i: number; unread: boolean }) {
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name;
  const lastPublic = [...t.events].reverse().find((e) => (e.kind === 'reply' || e.kind === 'automation') && e.body);
  const preview = lastPublic ? `${lastPublic.kind === 'automation' ? 'Nova' : lastPublic.actorId === t.requesterId ? 'You' : firstNameOf(nameOf(lastPublic.actorId))}: ${lastPublic.body}` : t.description;
  return (
    <Link to={`/helpdesk/tickets/${t.id}`} className="hd-trow neo-spot" style={{ ['--i' as string]: i }} role="listitem" data-unread={unread || undefined} data-qa={`trow-${t.id}`}>
      <CategoryGlyph category={t.category} size={40} />
      <div className="hd-trow__main">
        <div className="hd-trow__top">
          <span className="hd-trow__subj">{t.subject}</span>
          {unread && <span className="hd-unread" aria-label="New activity" />}
        </div>
        <div className="hd-trow__meta">
          <span className="neo-mono">{t.id}</span>
          <span>{CATEGORY_LABEL[t.category]}</span>
          <span>{t.assigneeId ? `with ${firstNameOf(nameOf(t.assigneeId))}` : t.selfService ? 'self-service' : 'finding an agent'}</span>
          <span>updated {relativeTime(t.updatedAt, now)}</span>
        </div>
        <div className="hd-trow__preview">{preview.replace(/\s+/g, ' ')}</div>
      </div>
      <div className="hd-trow__side">
        {t.status === 'waiting' && <span className="hd-needs">Your reply needed</span>}
        {t.selfService ? <NovaChip>Fixed by Nova</NovaChip> : <StatusPill status={t.status} />}
        {t.status === 'resolved' ? (
          t.csat ? (
            <span className="hd-stars" aria-label={`Rated ${t.csat.score} of 5`}>
              {Array.from({ length: 5 }, (_, k) => (
                <Star key={k} data-on={k < t.csat!.score || undefined} />
              ))}
            </span>
          ) : (
            !t.selfService && <span className="hd-ratechip">Rate us</span>
          )
        ) : (
          <SlaChip ticket={t} />
        )}
      </div>
    </Link>
  );
}
