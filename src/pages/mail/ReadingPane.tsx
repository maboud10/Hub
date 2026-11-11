/**
 * Helix Mail — reading pane: Nova TL;DR + mood, extracted action items →
 * Projects, meeting detection → Calendar / HoloMeet, smart replies, EN↔AR
 * translation, and one-click Pulse Chat / Helpdesk / CRM integrations.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Archive,
  BellOff,
  Briefcase,
  CalendarPlus,
  Check,
  Clock3,
  CornerUpLeft,
  Forward,
  Hash,
  Languages,
  LifeBuoy,
  ListChecks,
  MailWarning,
  MoreHorizontal,
  Newspaper,
  Receipt,
  ReplyAll,
  Share2,
  Star,
  Trash2,
  Video,
  Inbox,
  CalendarClock,
  ExternalLink,
} from 'lucide-react';
import { Chip, Meter, NeoMenu, NeoPopover, NeoSkeleton, NovaChip, type MenuEntry, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { loadBridge, type BridgeCard, type BridgeChannel } from '@/lib/appBridge';
import { useI18n } from '@/lib/i18n';
import { hasPermission } from '@/lib/rbac';
import { toast } from '@/store/toast';
import { atLocal, detectMeeting, extractActions, isHubKey, lastInbound, lastMessage, sentimentOf, smartRepliesFor, snippetOf, tldrFor, translatePhrases, type RankedThread } from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { MailThread } from '@/mail/types';
import { AttachmentChip, ContactAvatar, ReasonChip, firstOf, useFmt, type MailCtx } from './parts';
import { composeFor } from './ui';

const MOOD: Record<string, { label: string; tone: Tone }> = {
  positive: { label: 'Positive', tone: 'success' },
  neutral: { label: 'Neutral', tone: 'slate' },
  tense: { label: 'Tense', tone: 'warning' },
  negative: { label: 'Negative', tone: 'danger' },
};

interface CrmOptions {
  deals: { id: string; title: string; accountName: string; stage: string }[];
  accounts: { id: string; name: string }[];
}

export function ReadingPane({
  thread: t,
  ctx,
  rank,
  now,
  onBack,
  onArchive,
  onTrash,
  onSnooze,
}: {
  thread: MailThread;
  ctx: MailCtx;
  rank: RankedThread;
  now: number;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onSnooze: (anchor: HTMLElement) => void;
}) {
  const fmt = useFmt();
  const navigate = useNavigate();
  const locale = useI18n((s) => s.locale);
  const { toggleStar, setRead, toggleMute, moveToStream, linkCrm, setThreadTicket, noteChatShare, noteProjectTasks } = useMail.getState();
  const [lang, setLang] = useState<'en' | 'ar'>(locale === 'ar' && t.ar ? 'ar' : 'en');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(() => new Set([lastMessage(t).id]));
  const [busy, setBusy] = useState<string | null>(null);
  const [projectLink, setProjectLink] = useState<string | null>(null);
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
  const [channels, setChannels] = useState<BridgeChannel[] | null>(null);
  const [crmAnchor, setCrmAnchor] = useState<HTMLElement | null>(null);
  const [crm, setCrm] = useState<CrmOptions | null>(null);

  const inbound = lastInbound(t, ctx.ownerId) ?? lastMessage(t);
  const lead = ctx.resolve(inbound.from);
  const tldr = tldrFor(t, ctx.ownerId);
  const mood = sentimentOf(t);
  const baseActions = useMemo(() => (t.nova?.actions?.length ? t.nova.actions : extractActions(inbound.body)), [t.nova?.actions, inbound.body]);
  const meeting = useMemo(() => t.nova?.meeting ?? detectMeeting(t.messages.map((m) => m.body).join('\n'), now), [t.nova?.meeting, t.messages, now]);
  const replies = smartRepliesFor(t, lang);
  const participants = useMemo(() => [...new Set(t.messages.flatMap((m) => [m.from, ...m.to, ...m.cc]))].filter((k) => k !== ctx.ownerId), [t.messages, ctx.ownerId]);
  const hubPeople = participants.filter(isHubKey);
  const customerOrg = t.nova?.customer ?? participants.map((k) => ctx.contactMap.get(k)).find((c) => c?.kind === 'customer')?.org;
  const isCustomer = !!customerOrg;
  const canCrm = !!ctx.viewer && (hasPermission(ctx.viewer.perms, 'app:crm') || hasPermission(ctx.viewer.perms, '*'));
  const source = { app: 'mail' as const, label: t.subject, to: `/mail?thread=${t.id}` };

  const showAr = lang === 'ar';
  const meWord = locale === 'ar' ? 'أنا' : 'me';
  // Seeded Arabic renderings carry their own action items; otherwise keep the extracted ones.
  const actions = showAr && t.ar?.actions?.length === baseActions.length ? t.ar.actions : baseActions;
  const subject = showAr && t.ar ? t.ar.subject : t.subject;
  const tldrShown = showAr ? (t.ar?.tldr ?? translatePhrases(tldr).text) : tldr;
  const bodyOf = (i: number, body: string) => (showAr ? (t.ar?.bodies[i] ?? translatePhrases(body).text) : body);

  const sendToProjects = async () => {
    if (!ctx.viewer || !picked.size) return;
    const titles = actions.filter((_, i) => picked.has(i));
    setBusy('projects');
    try {
      const projects = await loadBridge('projects');
      const results = titles.map((title) => projects.createTask(ctx.viewer!, { title, notes: `${t.subject}\n\n${tldr}`, source }));
      const ok = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
      const failed = results.find((r) => !r.ok);
      if (ok.length) {
        noteProjectTasks(t.id, titles.slice(0, ok.length));
        setProjectLink(ok[0].to);
        toast.success('Sent to Projects', titles.slice(0, ok.length).join(' · '));
      }
      if (failed && !failed.ok) toast.error('Couldn’t create a task', failed.error);
      setPicked(new Set());
    } catch {
      toast.error('Helix Projects is unavailable');
    } finally {
      setBusy(null);
    }
  };

  const addToCalendar = async () => {
    if (!meeting) return;
    setBusy('calendar');
    try {
      const { useCalendar } = await import('@/calendar/store');
      useCalendar.getState().createEvent({
        title: t.subject.length > 60 ? `${t.subject.slice(0, 58)}…` : t.subject,
        description: tldr,
        category: isCustomer ? 'customer' : t.nova?.category === 'hiring' ? 'interview' : 'meet',
        dayOffset: meeting.dayOffset,
        startHour: meeting.startHour,
        durationMins: meeting.durationMins,
        organizerId: ctx.ownerId,
        attendeeIds: [ctx.ownerId, ...hubPeople].slice(0, 8),
        linkedContext: { app: 'mail', label: t.subject, to: `/mail?thread=${t.id}` },
        agendaBullets: actions.slice(0, 3),
      });
      setCalendarAdded(true);
    } catch {
      toast.error('Helix Calendar is unavailable');
    } finally {
      setBusy(null);
    }
  };

  const startMeet = async () => {
    setBusy('meet');
    try {
      const { useMeet } = await import('@/meet/store');
      const cat = t.nova?.category;
      const room = useMeet.getState().launchInstantRoom(t.subject, isCustomer ? 'customer' : cat === 'security' || cat === 'ops' ? 'incident' : 'design');
      navigate(`/meet/room?room=${room.id}`);
    } catch {
      toast.error('HoloMeet is unavailable');
      setBusy(null);
    }
  };

  const openShare = (el: HTMLElement) => {
    setShareAnchor(el);
    if (!ctx.viewer) return;
    setChannels(null);
    loadBridge('chat')
      .then((b) => setChannels(b.listChannels(ctx.viewer!).filter((c) => c.kind === 'channel').slice(0, 8)))
      .catch(() => setChannels([]));
  };

  const shareTo = async (target: { kind: 'channel' | 'dm'; id: string; name: string }) => {
    if (!ctx.viewer) return;
    setShareAnchor(null);
    try {
      const chat = await loadBridge('chat');
      const card: BridgeCard = { app: 'mail', title: t.subject, subtitle: `${lead.name} · ${snippetOf(tldr, 90)}`, to: `/mail?thread=${t.id}`, status: 'Shared' };
      const text = `📧 ${t.subject}`;
      const r = target.kind === 'channel' ? chat.postToChannel(ctx.viewer, { channelId: target.id, text, card }) : chat.sendDirect(ctx.viewer, { toUserId: target.id, text, card });
      if (r.ok) {
        noteChatShare(t.id);
        toast.success('Shared to Pulse Chat', target.name);
      } else toast.error('Couldn’t share', r.error);
    } catch {
      toast.error('Pulse Chat is unavailable');
    }
  };

  const createTicket = async () => {
    if (!ctx.viewer) return;
    setBusy('ticket');
    try {
      const hd = await loadBridge('helpdesk');
      const r = hd.createTicket(ctx.viewer, {
        subject: t.subject,
        description: `${tldr}\n\nFrom: ${lead.name} <${lead.email}>\n\n${snippetOf(inbound.body, 600)}`,
        category: t.nova?.category === 'security' ? 'security' : t.nova?.category === 'ops' ? 'software' : 'other',
        priority: mood.urgency >= 75 ? 'P2' : 'P3',
        source,
      });
      if (r.ok) {
        setThreadTicket(t.id, { id: r.ticketId, to: r.to });
        toast.success('Helpdesk ticket created', r.ticketId);
      } else toast.error('Couldn’t create a ticket', r.error);
    } catch {
      toast.error('IT Helpdesk is unavailable');
    } finally {
      setBusy(null);
    }
  };

  const openCrm = (el: HTMLElement) => {
    setCrmAnchor(el);
    setCrm(null);
    import('@/crm/store')
      .then(({ useCrm }) => {
        const s = useCrm.getState();
        setCrm({
          deals: s.deals.map((d) => ({ id: d.id, title: d.title, accountName: d.accountName, stage: d.stage })),
          accounts: s.accounts.map((a) => ({ id: a.id, name: a.name })),
        });
      })
      .catch(() => {
        setCrmAnchor(null);
        toast.error('Helix CRM is unavailable');
      });
  };

  const crmSuggest = useMemo(() => {
    if (!crm) return { deals: [], accounts: [], restDeals: [], restAccounts: [] };
    const token = (customerOrg ?? '').toLowerCase().split(/\s+/)[0] ?? '';
    const hit = (s: string) => !!token && s.toLowerCase().includes(token);
    const deals = crm.deals.filter((d) => hit(d.accountName) || hit(d.title));
    const accounts = crm.accounts.filter((a) => hit(a.name));
    return {
      deals,
      accounts,
      restDeals: crm.deals.filter((d) => !deals.includes(d)).slice(0, 6),
      restAccounts: crm.accounts.filter((a) => !accounts.includes(a)).slice(0, 5),
    };
  }, [crm, customerOrg]);

  const pickCrm = (kind: 'deal' | 'account', id: string, label: string) => {
    setCrmAnchor(null);
    linkCrm(t.id, { kind, id, label, to: kind === 'deal' ? `/crm/pipeline?deal=${id}` : '/crm/accounts' });
    toast.success('Logged to CRM', label);
  };

  const more: MenuEntry[] = [
    { label: 'Mark as unread', icon: <MailWarning />, onSelect: () => setRead([t.id], false) },
    { label: t.muted ? 'Unmute thread' : 'Mute thread', icon: <BellOff />, onSelect: () => toggleMute(t.id) },
    { kind: 'sep' },
    { kind: 'label', label: 'Move to stream' },
    { label: 'Priority', icon: <Inbox />, onSelect: () => moveToStream([t.id], 'priority'), disabled: t.stream === 'priority' },
    { label: 'Feed', icon: <Newspaper />, onSelect: () => moveToStream([t.id], 'feed'), disabled: t.stream === 'feed' },
    { label: 'Paper trail', icon: <Receipt />, onSelect: () => moveToStream([t.id], 'paper'), disabled: t.stream === 'paper' },
  ];

  const mm = MOOD[mood.sentiment] ?? MOOD.neutral;
  const meetingAt = meeting ? atLocal(now, meeting.dayOffset, meeting.startHour) : 0;

  return (
    <article className="ml-reading" aria-label={subject}>
      <header className="ml-read__head">
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm ml-read__back" onClick={onBack}>
          <ArrowLeft className="ml-flip" /> <span>Inbox</span>
        </button>
        <div className="ml-read__titles">
          <h2 className="ml-read__subject" data-no-i18n dir="auto">
            {subject}
          </h2>
          <div className="ml-read__meta">
            {rank.reasons.slice(0, 3).map((r) => (
              <ReasonChip key={r.id} r={r} now={now} />
            ))}
            {t.labels.map((l) => (
              <span key={l} className="ml-label">
                {l}
              </span>
            ))}
            {t.source && (
              <Chip tone="indigo" size="sm">
                <span>Sent from</span> {t.source.label}
              </Chip>
            )}
          </div>
        </div>
        <div className="ml-read__tools" role="toolbar" aria-label="Thread actions">
          <button type="button" className="neo-iconbtn" onClick={() => composeFor(t, 'reply', ctx.ownerId)} aria-label="Reply" title="Reply (R)">
            <CornerUpLeft className="ml-flip" />
          </button>
          <button type="button" className="neo-iconbtn" onClick={() => composeFor(t, 'replyAll', ctx.ownerId)} aria-label="Reply all" title="Reply all (A)">
            <ReplyAll className="ml-flip" />
          </button>
          <button type="button" className="neo-iconbtn" onClick={() => composeFor(t, 'forward', ctx.ownerId)} aria-label="Forward" title="Forward (F)">
            <Forward className="ml-flip" />
          </button>
          <span className="ml-tools__sep" aria-hidden="true" />
          {t.folder === 'inbox' && (
            <button type="button" className="neo-iconbtn" onClick={onArchive} aria-label="Archive" title="Archive (E)">
              <Archive />
            </button>
          )}
          <button type="button" className="neo-iconbtn ml-read__snooze" onClick={(e) => onSnooze(e.currentTarget)} aria-label="Snooze" title="Snooze (S)">
            <Clock3 />
          </button>
          <button type="button" className="neo-iconbtn" onClick={() => toggleStar(t.id)} aria-label="Star thread" aria-pressed={t.starred} title="Star" data-on={t.starred || undefined}>
            <Star />
          </button>
          <button type="button" className="neo-iconbtn" onClick={onTrash} aria-label="Delete" title="Delete (#)">
            <Trash2 />
          </button>
          <NeoMenu
            items={more}
            label="More actions"
            trigger={(p) => (
              <button {...p} type="button" className="neo-iconbtn" aria-label="More actions">
                <MoreHorizontal />
              </button>
            )}
          />
        </div>
      </header>

      <div className="ml-read__scroll">
        <section className="ml-nova neo-nova" aria-label="Nova summary">
          <div className="neo-nova__glow" aria-hidden="true" />
          <header className="ml-nova__head">
            <NovaChip>TL;DR</NovaChip>
            <div className="ml-mood" title="Sentiment and urgency">
              <Chip tone={mm.tone} size="sm">
                {mm.label}
              </Chip>
              <Meter value={Math.max(1, Math.round(mood.urgency / 20))} segments={5} label="Urgency" />
              <span className="ml-mood__u">
                <span>Urgency</span> <b>{fmt.num(mood.urgency)}</b>
              </span>
            </div>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setLang(showAr ? 'en' : 'ar')} aria-pressed={showAr}>
              <Languages /> <span>{showAr ? 'Show original' : 'Translate to Arabic'}</span>
            </button>
          </header>
          <p className="ml-nova__text" aria-live="polite" data-no-i18n dir="auto">
            {tldrShown}
          </p>
          {showAr && !t.ar && (
            <p className="ml-nova__note">
              <Languages aria-hidden="true" /> <span>Nova offline preview — phrase-level translation</span>
            </p>
          )}
        </section>

        <div className="ml-do" role="group" aria-label="Integrations">
          <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={(e) => openShare(e.currentTarget)}>
            <Share2 /> <span>Share to Pulse Chat</span>
            {(t.chatShares ?? 0) > 0 && <span className="neo-count">{fmt.num(t.chatShares ?? 0)}</span>}
          </button>
          {t.ticket ? (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => navigate(t.ticket!.to)}>
              <LifeBuoy /> <span>Ticket</span> <b className="neo-mono">{t.ticket.id}</b>
            </button>
          ) : (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={createTicket} disabled={busy === 'ticket'}>
              <LifeBuoy /> <span>Create Helpdesk ticket</span>
            </button>
          )}
          {isCustomer &&
            (t.crm ? (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => navigate(t.crm!.to)} title="Open in CRM">
                <Briefcase /> <span>CRM</span> <b data-no-i18n>{t.crm.label}</b> <ExternalLink />
              </button>
            ) : (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={(e) => openCrm(e.currentTarget)} disabled={!canCrm} title={canCrm ? 'Link this thread to a CRM deal or account' : 'Requires CRM access'}>
                <Briefcase /> <span>Log to CRM</span>
              </button>
            ))}
        </div>

        {actions.length > 0 && (
          <section className="ml-card" aria-label="Extracted action items">
            <header className="ml-card__head">
              <ListChecks aria-hidden="true" />
              <span className="neo-hud grow">Extracted action items</span>
              {projectLink && (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate(projectLink)}>
                  <ExternalLink /> <span>Open in Projects</span>
                </button>
              )}
              <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={sendToProjects} disabled={!picked.size || busy === 'projects'}>
                <Briefcase /> <span>Send to Projects</span> {picked.size > 0 && <span className="neo-count">{fmt.num(picked.size)}</span>}
              </button>
            </header>
            <ul className="ml-actions">
              {actions.map((a, i) => {
                const sent = !!(t.projectTasks?.includes(a) || t.projectTasks?.includes(baseActions[i]));
                return (
                  <li key={a}>
                    <label className="ml-actions__item" data-done={sent || undefined}>
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        disabled={sent}
                        onChange={() =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (n.has(i)) n.delete(i);
                            else n.add(i);
                            return n;
                          })
                        }
                      />
                      <span data-no-i18n dir="auto">{a}</span>
                    </label>
                    {sent && (
                      <Chip tone="success" size="sm" icon={<Check />}>
                        <span>In Projects</span>
                      </Chip>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {meeting && (
          <section className="ml-card ml-meetcard" aria-label="Meeting detected">
            <span className="ml-meetcard__icon" aria-hidden="true">
              <CalendarClock />
            </span>
            <div className="ml-meetcard__text">
              <div className="neo-hud">Meeting detected</div>
              <b className="ml-meetcard__label">{locale === 'ar' ? fmt.dayTime(meetingAt) : <span data-no-i18n>{meeting.label}?</span>}</b>
              <span className="ml-meetcard__when">
                {fmt.full(meetingAt)} · <b>{fmt.num(meeting.durationMins)}</b> <span>min</span>
              </span>
            </div>
            <div className="ml-meetcard__acts">
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={addToCalendar} disabled={calendarAdded || busy === 'calendar'}>
                {calendarAdded ? <Check /> : <CalendarPlus />} <span>{calendarAdded ? 'Added to Calendar' : 'Add to Calendar'}</span>
              </button>
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={startMeet} disabled={busy === 'meet'}>
                <Video /> <span>Start HoloMeet now</span>
              </button>
            </div>
          </section>
        )}

        <ol className="ml-msgs">
          {t.messages.map((m, i) => {
            const from = ctx.resolve(m.from);
            const open = opened.has(m.id);
            const body = bodyOf(i, m.body);
            return (
              <li key={m.id} className="ml-msg" data-open={open || undefined}>
                <button
                  type="button"
                  className="ml-msg__head"
                  aria-expanded={open}
                  onClick={() =>
                    setOpened((o) => {
                      const n = new Set(o);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    })
                  }
                >
                  <ContactAvatar c={from} size={36} presence />
                  <span className="ml-msg__who">
                    <b>{m.from === ctx.ownerId ? <span>You</span> : from.name}</b>
                    <span className="ml-msg__email" data-no-i18n>
                      {from.email}
                    </span>
                  </span>
                  {from.external && (
                    <Chip tone="warning" size="sm">
                      <span>External</span>
                    </Chip>
                  )}
                  <span className="ml-msg__time">{fmt.full(m.at)}</span>
                </button>
                {open ? (
                  <div className="ml-msg__body">
                    <div className="ml-msg__to">
                      <span>To</span> <NameList keys={m.to} ctx={ctx} meWord={meWord} />
                      {m.cc.length > 0 && (
                        <>
                          {' · '}
                          <span>Cc</span> <NameList keys={m.cc} ctx={ctx} meWord={meWord} />
                        </>
                      )}
                    </div>
                    <div className="ml-msg__text" data-no-i18n dir={showAr ? 'rtl' : 'auto'}>
                      {body.split(/\n{2,}/).map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                    </div>
                    {!!m.attachments?.length && (
                      <div className="ml-msg__atts">
                        {m.attachments.map((a) => (
                          <AttachmentChip key={a.id} a={a} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="ml-msg__peek" data-no-i18n dir="auto">
                    {snippetOf(body, 110)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div className="ml-replies" role="group" aria-label="Smart replies">
          <span className="neo-hud">Smart replies</span>
          <div className="ml-replies__row">
            {replies.map((r) => (
              <button key={r} type="button" className="ml-reply-chip" onClick={() => composeFor(t, 'reply', ctx.ownerId, r)} data-no-i18n>
                {r}
              </button>
            ))}
          </div>
          <button type="button" className="ml-replybar" onClick={() => composeFor(t, 'reply', ctx.ownerId)}>
            <CornerUpLeft className="ml-flip" aria-hidden="true" /> <span>Reply to</span> <b>{lead.hub ? firstOf(lead.name) : lead.name}</b>
            <kbd className="kbd">R</kbd>
          </button>
        </div>
      </div>

      <NeoPopover open={!!shareAnchor} anchor={shareAnchor} onClose={() => setShareAnchor(null)} placement="bottom-start" width={290} label="Share to Pulse Chat">
        <div role="menu" aria-label="Share to Pulse Chat">
          <div className="neo-menu__label">Share to Pulse Chat</div>
          {channels === null ? (
            <NeoSkeleton rows={3} />
          ) : channels.length ? (
            channels.map((c) => (
              <button key={c.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => shareTo({ kind: 'channel', id: c.id, name: c.name })}>
                <Hash />
                <span className="grow truncate">{c.name}</span>
              </button>
            ))
          ) : (
            <div className="neo-menu__label">No channels</div>
          )}
          {hubPeople.length > 0 && (
            <>
              <div className="neo-menu__sep" role="separator" />
              <div className="neo-menu__label">Direct message</div>
              {hubPeople.slice(0, 5).map((uid) => {
                const u = ctx.userMap.get(uid);
                if (!u) return null;
                return (
                  <button key={uid} type="button" role="menuitem" className="neo-menu__item" onClick={() => shareTo({ kind: 'dm', id: uid, name: u.name })}>
                    <Avatar user={u} size={22} presence />
                    <span className="grow truncate">{u.name}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </NeoPopover>

      <NeoPopover open={!!crmAnchor} anchor={crmAnchor} onClose={() => setCrmAnchor(null)} placement="bottom-start" width={320} label="Log to CRM">
        <div role="menu" aria-label="Log to CRM" className="ml-crm-pop">
          {!crm ? (
            <NeoSkeleton rows={4} />
          ) : (
            <>
              {(crmSuggest.deals.length > 0 || crmSuggest.accounts.length > 0) && <div className="neo-menu__label">Suggested by Nova</div>}
              {crmSuggest.deals.map((d) => (
                <button key={d.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => pickCrm('deal', d.id, d.title)}>
                  <Briefcase />
                  <span className="grow truncate">{d.title}</span>
                  <span className="neo-menu__hint">{d.accountName}</span>
                </button>
              ))}
              {crmSuggest.accounts.map((a) => (
                <button key={a.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => pickCrm('account', a.id, a.name)}>
                  <Briefcase />
                  <span className="grow truncate">{a.name}</span>
                  <span className="neo-menu__hint">Account</span>
                </button>
              ))}
              <div className="neo-menu__label">Deals</div>
              {crmSuggest.restDeals.map((d) => (
                <button key={d.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => pickCrm('deal', d.id, d.title)}>
                  <Briefcase />
                  <span className="grow truncate">{d.title}</span>
                  <span className="neo-menu__hint">{d.accountName}</span>
                </button>
              ))}
              <div className="neo-menu__label">Accounts</div>
              {crmSuggest.restAccounts.map((a) => (
                <button key={a.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => pickCrm('account', a.id, a.name)}>
                  <Briefcase />
                  <span className="grow truncate">{a.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </NeoPopover>
    </article>
  );
}

/** Recipient first names, one text node each (the shell translator localises known names). */
function NameList({ keys, ctx, meWord }: { keys: string[]; ctx: MailCtx; meWord: string }) {
  return (
    <span className="ml-names">
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && <span aria-hidden="true">{meWord === 'me' ? ', ' : '، '}</span>}
          <span>{k === ctx.ownerId ? meWord : firstOf(ctx.resolve(k).name)}</span>
        </span>
      ))}
    </span>
  );
}
