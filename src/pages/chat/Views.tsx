/**
 * Secondary Pulse Chat screens: Activity, Saved & reminders, Browse channels, Search.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  AlarmClock,
  AtSign,
  Bookmark,
  CheckCircle2,
  Compass,
  Hash,
  Lock,
  MessageSquareReply,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  SmilePlus,
  Trash2,
  Trophy,
  Users,
  X,
  Filter,
  CalendarDays,
  Paperclip,
} from 'lucide-react';
import { Avatars, Chip, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoTabs, Spark, type MenuEntry } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { canCreateChannel, canJoin, canView } from '@/chat/access';
import { dateKey, dmId } from '@/chat/ids';
import { emptyQuery, formatQuery, highlightParts, isEmptyQuery, matchMessage, parseSearch, snippetFor, type SearchQuery } from '@/chat/search';
import { activityFeed, indexMessages, type ActivityItem } from '@/chat/selectors';
import { useChat } from '@/chat/store';
import type { ChatMessage } from '@/chat/types';
import { chatLink, convTitle, useNames, usePerson, usePlain, useViewer } from './hooks';
import { AuthorAvatar, ConvIcon, Md } from './parts';
import { useChatShell } from './shell';

/* ---------------------------------------------------------------- shared */

function useVisibleConvIds(memberOnly = true) {
  const v = useViewer();
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => {
    const set = new Set<string>();
    if (!v) return set;
    for (const c of conversations) if (canView(c, v.viewer) && (!memberOnly || c.memberIds.includes(v.user.id))) set.add(c.id);
    return set;
  }, [conversations, v, memberOnly]);
}

function useConvLabel() {
  const v = useViewer();
  const names = useNames();
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => {
    const byId = new Map(conversations.map((c) => [c.id, c]));
    return (id: string) => {
      const c = byId.get(id);
      if (!c) return 'Conversation';
      const t = convTitle(c, v?.user.id, names);
      return c.kind === 'channel' ? `#${t}` : t;
    };
  }, [conversations, v, names]);
}

/* ---------------------------------------------------------------- activity */

type ActTab = 'all' | 'mention' | 'thread' | 'reaction' | 'kudos';

export function useActivity() {
  const v = useViewer();
  const messages = useChat((s) => s.messages);
  const reactionTimes = useChat((s) => s.reactionTimes);
  const visible = useVisibleConvIds(true);
  return useMemo(() => {
    if (!v) return [];
    return activityFeed({ messages }, { userId: v.user.id, handle: v.handle, visible: (id) => visible.has(id), now: Date.now(), reactionTimes: new Map(Object.entries(reactionTimes)) });
  }, [messages, v, visible, reactionTimes]);
}

export function useNewActivityCount() {
  const items = useActivity();
  const person = usePerson();
  return useMemo(() => items.filter((i) => i.at > person.activitySeenAt).length, [items, person.activitySeenAt]);
}

const ACT_ICON: Record<ActivityItem['kind'], typeof AtSign> = { mention: AtSign, thread: MessageSquareReply, reaction: SmilePlus, kudos: Trophy };

export function ActivityView() {
  const items = useActivity();
  const person = usePerson();
  const names = useNames();
  const label = useConvLabel();
  const shell = useChatShell();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ActTab>('all');
  const [seenAt] = useState(person.activitySeenAt);
  useEffect(() => {
    const t = window.setTimeout(() => useChat.getState().markActivitySeen(), 1200);
    return () => window.clearTimeout(t);
  }, []);
  const counts = useMemo(() => {
    const c = { all: items.length, mention: 0, thread: 0, reaction: 0, kudos: 0 } as Record<ActTab, number>;
    for (const i of items) c[i.kind] += 1;
    return c;
  }, [items]);
  const shown = tab === 'all' ? items : items.filter((i) => i.kind === tab);
  const fresh = items.filter((i) => i.at > seenAt).length;

  const describe = (i: ActivityItem) => {
    const who = i.actorIds.length > 1 ? `${names.first(i.actorIds[0])} and ${i.actorIds.length - 1} other${i.actorIds.length > 2 ? 's' : ''}` : names.first(i.actorIds[0]);
    switch (i.kind) {
      case 'mention':
        return (
          <>
            <strong>{who}</strong> mentioned you in <strong>{label(i.convId)}</strong>
          </>
        );
      case 'thread':
        return (
          <>
            <strong>{who}</strong> replied to a thread in <strong>{label(i.convId)}</strong>
          </>
        );
      case 'reaction':
        return (
          <>
            <strong>{who}</strong> reacted {i.emoji} to your message in <strong>{label(i.convId)}</strong>
          </>
        );
      case 'kudos':
        return (
          <>
            <strong>{who}</strong> sent you kudos in <strong>{label(i.convId)}</strong> 🎉
          </>
        );
    }
  };

  return (
    <>
      <NeoHead
        icon={<AtSign />}
        eyebrow="Pulse Chat"
        title="Activity"
        sub={fresh ? `${fresh} new since you last looked` : 'Mentions, reactions, thread replies and kudos'}
        onToggleSide={shell.toggleSide}
        actions={
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => (useChat.getState().markActivitySeen(), toast.success('All caught up'))}>
            <CheckCircle2 /> <span className="neo-btn__label">Mark all seen</span>
          </button>
        }
      />
      <div className="neo-toolbar">
        <NeoTabs
          value={tab}
          onChange={setTab}
          label="Activity filter"
          items={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'mention', label: 'Mentions', count: counts.mention || null },
            { value: 'thread', label: 'Threads', count: counts.thread || null },
            { value: 'reaction', label: 'Reactions', count: counts.reaction || null },
            { value: 'kudos', label: 'Kudos', count: counts.kudos || null },
          ]}
        />
      </div>
      <div className="neo-body neo-pad">
        {shown.length ? (
          <div className="pc-feed neo-stagger">
            {shown.map((i, n) => {
              const Icon = ACT_ICON[i.kind];
              const isNew = i.at > seenAt;
              return (
                <button key={i.id} type="button" className={cx('pc-feed__item neo-spot', isNew && 'is-new')} style={{ ['--i' as string]: n }} onClick={() => navigate(chatLink(i.convId, { msg: i.messageId, thread: i.parentId }))} data-qa="activity-item">
                  <span className="pc-feed__icon" data-kind={i.kind}>
                    <Icon />
                  </span>
                  <span className="pc-feed__avatars">
                    {i.actorIds.slice(0, 3).map((id) => (
                      <AuthorAvatar key={id} id={id} size={26} names={names} />
                    ))}
                  </span>
                  <span className="pc-feed__body">
                    <span className="pc-feed__title">{describe(i)}</span>
                    <span className="pc-feed__preview">
                      <Md text={i.message.text || i.message.card?.title || i.message.poll?.question || i.message.decision?.title || 'Attachment'} className="pc-md--flat" still />
                    </span>
                  </span>
                  <span className="pc-feed__time">
                    {isNew && <span className="pc-unread-dot" />}
                    {relativeTime(i.at)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <NeoEmpty icon={<AtSign />} title={tab === 'all' ? 'No activity yet' : 'Nothing here yet'} action={<Link className="neo-btn neo-btn--soft" to="/chat/c/ch-general">Go to #general</Link>}>
            When someone mentions you, replies to your threads, reacts to your messages or sends you kudos, it shows up here.
          </NeoEmpty>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- saved */

type SavedTab = 'saved' | 'reminders' | 'done';

export function SavedView() {
  const person = usePerson();
  const messages = useChat((s) => s.messages);
  const names = useNames();
  const label = useConvLabel();
  const shell = useChatShell();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SavedTab>('saved');
  const idx = indexMessages(messages);
  const rows = person.saved.map((s) => ({ s, m: idx.byId.get(s.messageId) })).filter((r): r is { s: typeof r.s; m: ChatMessage } => !!r.m);
  const lists = {
    saved: rows.filter((r) => !r.s.done),
    reminders: rows.filter((r) => r.s.remindAt && !r.s.done).sort((a, b) => (a.s.remindAt ?? 0) - (b.s.remindAt ?? 0)),
    done: rows.filter((r) => r.s.done),
  };
  const due = lists.reminders.filter((r) => (r.s.remindAt ?? 0) <= Date.now()).length;
  const st = useChat.getState;
  const remind = (id: string, at: number | null, msg: string) => toast.result(st().setReminder(id, at), msg);
  const at9 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };
  return (
    <>
      <NeoHead icon={<Bookmark />} eyebrow="Pulse Chat" title="Saved" sub={due ? `${due} reminder${due === 1 ? '' : 's'} due` : 'Messages you saved for later and your reminders'} onToggleSide={shell.toggleSide} />
      <div className="neo-toolbar">
        <NeoTabs
          value={tab}
          onChange={setTab}
          label="Saved filter"
          items={[
            { value: 'saved', label: 'In progress', count: lists.saved.length },
            { value: 'reminders', label: 'Reminders', count: lists.reminders.length || null },
            { value: 'done', label: 'Done', count: lists.done.length || null },
          ]}
        />
      </div>
      <div className="neo-body neo-pad">
        {lists[tab].length ? (
          <div className="pc-saved neo-stagger">
            {lists[tab].map(({ s, m }, n) => {
              const overdue = !!s.remindAt && s.remindAt <= Date.now() && !s.done;
              const menu: MenuEntry[] = [
                { kind: 'label', label: 'Remind me' },
                { label: 'In 20 minutes', icon: <AlarmClock />, onSelect: () => remind(m.id, Date.now() + 20 * 60_000, 'Reminder set') },
                { label: 'In 1 hour', icon: <AlarmClock />, onSelect: () => remind(m.id, Date.now() + 3_600_000, 'Reminder set') },
                { label: 'Tomorrow 9:00', icon: <AlarmClock />, onSelect: () => remind(m.id, at9(), 'Reminder set') },
                ...(s.remindAt ? [{ label: 'Clear reminder', icon: <X />, onSelect: () => remind(m.id, null, 'Reminder cleared') }] : []),
                { kind: 'sep' },
                { label: 'Remove from saved', icon: <Trash2 />, danger: true, onSelect: () => toast.result(st().toggleSave(m.id), 'Removed') },
              ];
              return (
                <div key={m.id} className={cx('pc-saved__item', overdue && 'is-due', s.done && 'is-done')} style={{ ['--i' as string]: n }}>
                  <button type="button" className="pc-saved__check" onClick={() => toast.result(st().setSavedDone(m.id, !s.done), s.done ? 'Moved back to In progress' : 'Marked done')} aria-label={s.done ? 'Mark not done' : 'Mark done'}>
                    {s.done ? <RotateCcw /> : <CheckCircle2 />}
                  </button>
                  <button type="button" className="pc-saved__main" onClick={() => navigate(chatLink(m.convId, { msg: m.id, thread: m.parentId }))}>
                    <span className="row" style={{ gap: 8 }}>
                      <AuthorAvatar id={m.authorId} size={22} names={names} />
                      <strong className="text-sm">{names.name(m.authorId)}</strong>
                      <span className="neo-faint text-xs">in {label(m.convId)} · {relativeTime(m.at)}</span>
                    </span>
                    <Md text={m.deleted ? '_This message was deleted._' : m.text || m.card?.title || m.poll?.question || m.decision?.title || 'Attachment'} className="pc-saved__text" still />
                  </button>
                  <span className="pc-saved__side">
                    {s.remindAt && !s.done && (
                      <Chip tone={overdue ? 'danger' : 'app'} size="sm" icon={<AlarmClock />}>
                        {overdue ? `Due ${relativeTime(s.remindAt)}` : relativeTime(s.remindAt)}
                      </Chip>
                    )}
                    <NeoMenu
                      items={menu}
                      label="Saved item"
                      trigger={(p) => (
                        <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Saved item actions">
                          <MoreHorizontal />
                        </button>
                      )}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <NeoEmpty icon={tab === 'reminders' ? <AlarmClock /> : <Bookmark />} title={tab === 'reminders' ? 'No reminders' : tab === 'done' ? 'Nothing completed yet' : 'Nothing saved'}>
            {tab === 'reminders' ? 'Use “Remind me” on any message, or ask Nova: “remind me to … in 1h”.' : 'Hover a message and click the bookmark to save it for later.'}
          </NeoEmpty>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- browse */

type BrowseFilter = 'all' | 'joined' | 'open' | 'private';

export function BrowseView() {
  const v = useViewer();
  const names = useNames();
  const conversations = useChat((s) => s.conversations);
  const messages = useChat((s) => s.messages);
  const shell = useChatShell();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<BrowseFilter>('all');
  const [sort, setSort] = useState<'activity' | 'members' | 'name'>('activity');
  const idx = indexMessages(messages);
  const today = dateKey(Date.now());

  const rows = useMemo(() => {
    if (!v) return [];
    const s = q.trim().toLowerCase();
    return conversations
      .filter((c) => c.kind === 'channel' && !c.archived && canView(c, v.viewer))
      .filter((c) => !s || `${c.name} ${c.topic ?? ''} ${c.description ?? ''}`.toLowerCase().includes(s))
      .filter((c) => (filter === 'joined' ? c.memberIds.includes(v.user.id) : filter === 'open' ? !c.memberIds.includes(v.user.id) : filter === 'private' ? c.visibility === 'private' : true))
      .map((c) => {
        const list = idx.byConv.get(c.id) ?? [];
        const days = Array.from({ length: 7 }, (_, i) => dateKey(Date.now() - (6 - i) * 86_400_000));
        const spark = days.map((d) => list.filter((m) => dateKey(m.at) === d && !m.system).length);
        return { c, spark, last: list[list.length - 1]?.at ?? c.createdAt, todayCount: list.filter((m) => dateKey(m.at) === today).length };
      })
      .sort((a, b) => (sort === 'name' ? a.c.name.localeCompare(b.c.name) : sort === 'members' ? b.c.memberIds.length - a.c.memberIds.length : b.last - a.last));
  }, [conversations, v, q, filter, sort, idx, today]);

  const create = !!v && canCreateChannel(v.viewer);
  return (
    <>
      <NeoHead
        icon={<Compass />}
        eyebrow="Pulse Chat"
        title="Browse channels"
        sub={v?.viewer.contractor ? 'Channels you’ve been added to' : 'Find your people — join any public channel'}
        onToggleSide={shell.toggleSide}
        actions={
          create ? (
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('?new=channel')} data-qa="browse-create">
              <Plus /> <span className="neo-btn__label">Create channel</span>
            </button>
          ) : undefined
        }
      />
      <div className="neo-toolbar">
        <NeoSearch value={q} onChange={setQ} placeholder="Search channels…" size="sm" label="Search channels" className="pc-toolbar-search" />
        <NeoTabs
          value={filter}
          onChange={setFilter}
          label="Channel filter"
          items={[
            { value: 'all', label: 'All' },
            { value: 'joined', label: 'Joined' },
            ...(!v?.viewer.contractor ? [{ value: 'open' as const, label: 'Not joined' }] : []),
            { value: 'private', label: 'Private' },
          ]}
        />
        <span className="grow" />
        <select className="neo-select neo-select--sm pc-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort channels">
          <option value="activity">Most active</option>
          <option value="members">Most members</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div className="neo-body neo-pad">
        {rows.length ? (
          <div className="neo-grid neo-stagger pc-browse" style={{ ['--min' as string]: '300px' }}>
            {rows.map(({ c, spark, last, todayCount }, n) => {
              const member = !!v && c.memberIds.includes(v.user.id);
              const users = c.memberIds.map((id) => names.user(id)).filter((u): u is NonNullable<typeof u> => !!u);
              return (
                <div key={c.id} className="neo-card neo-card--hover neo-spot pc-chcard" style={{ ['--i' as string]: n }} onClick={() => navigate(`/chat/c/${c.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/chat/c/${c.id}`)} data-qa="channel-card">
                  <div className="row" style={{ gap: 12 }}>
                    <ConvIcon conv={c} size={40} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="pc-chcard__name">
                        #{c.name} {c.visibility === 'private' && <Lock className="pc-hud-icon" />}
                      </div>
                      <div className="neo-faint text-xs">
                        {todayCount ? `${todayCount} messages today` : `Active ${relativeTime(last)}`}
                      </div>
                    </div>
                    <Spark data={spark} width={74} height={28} />
                  </div>
                  <p className="pc-chcard__topic clamp-2">{c.topic || c.description || 'No topic yet'}</p>
                  <div className="row row--between">
                    <span className="row" style={{ gap: 8 }}>
                      <Avatars users={users} max={4} size={22} />
                      <span className="pc-chcard__count neo-faint text-xs">
                        <Users className="pc-hud-icon" /> {users.length}
                      </span>
                    </span>
                    {member ? (
                      <Chip tone="success" size="sm">
                        Joined
                      </Chip>
                    ) : v && canJoin(c, v.viewer) ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (toast.result(useChat.getState().joinChannel(c.id), `Joined #${c.name}`)) navigate(`/chat/c/${c.id}`);
                        }}
                        data-qa="join"
                      >
                        <Plus /> Join
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <NeoEmpty icon={<Hash />} title="No channels match" action={create ? <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('?new=channel')}><Plus /> Create #{q.trim() ? q.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'a channel'}</button> : undefined}>
            Try a different search or filter{create ? ' — or start the channel yourself.' : '.'}
          </NeoEmpty>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- search */

export function SearchView() {
  const v = useViewer();
  const names = useNames();
  const plain = usePlain();
  const label = useConvLabel();
  const shell = useChatShell();
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const conversations = useChat((s) => s.conversations);
  const messages = useChat((s) => s.messages);
  const person = usePerson();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const input = useRef<HTMLInputElement>(null);
  const visible = useVisibleConvIds(false);
  const idx = indexMessages(messages);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (text.trim()) next.set('q', text);
      else next.delete('q');
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    input.current?.focus();
    const len = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(len, len);
  }, []);

  const q: SearchQuery = useMemo(() => parseSearch(text), [text]);
  const handles = useMemo(() => new Map(users.map((u) => [u.id, names.handle(u.id)])), [users, names]);

  const results = useMemo(() => {
    if (!v || isEmptyQuery(q)) return [];
    const byId = new Map(conversations.map((c) => [c.id, c]));
    const ctx = {
      now: Date.now(),
      plain,
      handleOf: (id: string) => handles.get(id) ?? undefined,
      authorName: names.name,
      convKeys: (id: string) => {
        const c = byId.get(id);
        if (!c) return [];
        return c.kind === 'channel' ? [c.name] : c.memberIds.filter((m) => m !== v.user.id).map((m) => `@${handles.get(m) ?? m}`);
      },
      isSaved: (id: string) => person.saved.some((s) => s.messageId === id),
      isPinned: (m: ChatMessage) => !!byId.get(m.convId)?.pinnedIds.includes(m.id),
      replyCount: (id: string) => idx.threads.get(id)?.length ?? 0,
    };
    return messages
      .filter((m) => visible.has(m.convId))
      .map((m) => ({ m, s: matchMessage(m, q, ctx) }))
      .filter((r): r is { m: ChatMessage; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s || b.m.at - a.m.at)
      .slice(0, 80)
      .map((r) => r.m);
  }, [v, q, conversations, messages, visible, plain, handles, names, person.saved, idx]);

  const peopleHits = useMemo(() => {
    const t = [...q.terms, ...q.phrases].join(' ').trim().toLowerCase();
    if (!t || q.from.length || q.in.length) return [];
    return users.filter((u) => u.active && u.id !== v?.user.id && `${u.name} ${u.title}`.toLowerCase().includes(t)).slice(0, 4);
  }, [q, users, v]);
  const channelHits = useMemo(() => {
    const t = [...q.terms].join(' ').trim().toLowerCase();
    if (!t || !v || q.from.length || q.in.length) return [];
    return conversations.filter((c) => c.kind === 'channel' && canView(c, v.viewer) && `${c.name} ${c.topic ?? ''}`.toLowerCase().includes(t)).slice(0, 4);
  }, [q, conversations, v]);

  const addToken = (tok: string) => {
    const next = `${tok} ${text}`.replace(/\s+/g, ' ').trimStart();
    setText(next);
    input.current?.focus();
  };
  const removeFilter = (patch: Partial<SearchQuery>) => setText(`${formatQuery({ ...q, ...patch })} `);

  const myConvs = useMemo(() => (v ? conversations.filter((c) => c.kind === 'channel' && c.memberIds.includes(v.user.id)) : []), [conversations, v]);
  const fromMenu: MenuEntry[] = users.filter((u) => u.active).slice(0, 18).map((u) => ({ label: u.name, icon: <Avatar user={u} size={18} />, onSelect: () => addToken(`from:@${handles.get(u.id)}`) }));
  const inMenu: MenuEntry[] = myConvs.map((c) => ({ label: `#${c.name}`, icon: <Hash />, onSelect: () => addToken(`in:#${c.name}`) }));
  const hasMenu: MenuEntry[] = (['file', 'link', 'poll', 'image', 'reaction', 'thread', 'card', 'kudos', 'voice'] as const).map((h) => ({ label: h[0].toUpperCase() + h.slice(1), onSelect: () => addToken(`has:${h}`) }));
  const dateMenu: MenuEntry[] = (['today', 'yesterday', 'week', 'month'] as const).map((d) => ({ label: d === 'week' ? 'Last 7 days' : d === 'month' ? 'Last 30 days' : d[0].toUpperCase() + d.slice(1), onSelect: () => addToken(`during:${d}`) }));

  const chips: { key: string; label: string; clear: () => void }[] = [
    ...q.from.map((f) => ({ key: `f${f}`, label: `From @${f}`, clear: () => removeFilter({ from: q.from.filter((x) => x !== f) }) })),
    ...q.in.map((i) => ({ key: `i${i}`, label: `In ${i.startsWith('@') ? i : `#${i}`}`, clear: () => removeFilter({ in: q.in.filter((x) => x !== i) }) })),
    ...q.has.map((h) => ({ key: `h${h}`, label: `Has ${h}`, clear: () => removeFilter({ has: q.has.filter((x) => x !== h) }) })),
    ...q.is.map((h) => ({ key: `s${h}`, label: `Is ${h}`, clear: () => removeFilter({ is: q.is.filter((x) => x !== h) }) })),
    ...(q.during ? [{ key: 'd', label: q.during === 'week' ? 'Last 7 days' : q.during === 'month' ? 'Last 30 days' : q.during, clear: () => removeFilter({ during: undefined }) }] : []),
    ...(q.after !== undefined || q.before !== undefined ? [{ key: 'r', label: 'Date range', clear: () => removeFilter({ after: undefined, before: undefined }) }] : []),
  ];

  return (
    <>
      <NeoHead icon={<SearchIcon />} eyebrow="Pulse Chat" title="Search" sub="Messages, files, polls and people you can see" onToggleSide={shell.toggleSide} />
      <div className="neo-toolbar pc-searchbar">
        <NeoSearch value={text} onChange={setText} inputRef={input} placeholder="Search — try from:@mei in:#design-crit has:file" label="Search messages" className="pc-bigsearch" />
        <div className="row row--wrap" style={{ gap: 6 }}>
          <NeoMenu items={fromMenu} label="From" width={240} trigger={(p) => <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm"><Users /> From</button>} />
          <NeoMenu items={inMenu} label="In" width={240} trigger={(p) => <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm"><Hash /> In</button>} />
          <NeoMenu items={hasMenu} label="Has" width={200} trigger={(p) => <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm"><Paperclip /> Has</button>} />
          <NeoMenu items={dateMenu} label="Date" width={200} trigger={(p) => <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm"><CalendarDays /> Date</button>} />
          {chips.map((c) => (
            <span key={c.key} className="pc-token">
              <Filter className="pc-hud-icon" /> {c.label}
              <button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`}>
                <X />
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="neo-body neo-pad">
        {isEmptyQuery(q) ? (
          <div className="pc-search-help">
            <NeoEmpty icon={<SearchIcon />} title="Search everything you can see">
              Combine words with filters: <code className="pc-code">from:@omar</code> <code className="pc-code">in:#ship-it</code> <code className="pc-code">has:poll</code> <code className="pc-code">during:week</code> or use quotes for an exact phrase.
            </NeoEmpty>
            <div className="row row--wrap" style={{ gap: 8, justifyContent: 'center' }}>
              {['has:poll', 'has:file', 'is:pinned', 'during:today', '"passkeys"', 'from:@mei'].map((s) => (
                <button key={s} type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setText(`${s} `)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 16 }}>
            {(peopleHits.length > 0 || channelHits.length > 0) && (
              <div className="pc-search-quick">
                {peopleHits.map((u) => (
                  <Link key={u.id} to={`/chat/c/${dmId([v!.user.id, u.id])}`} className="pc-quickhit">
                    <Avatar user={u} size={28} presence />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <strong className="truncate" style={{ display: 'block' }}>{u.name}</strong>
                      <span className="neo-faint text-xs truncate" style={{ display: 'block' }}>{u.title}</span>
                    </span>
                    <span className="neo-hud neo-hud--tint">Message</span>
                  </Link>
                ))}
                {channelHits.map((c) => (
                  <Link key={c.id} to={`/chat/c/${c.id}`} className="pc-quickhit">
                    <ConvIcon conv={c} size={28} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <strong className="truncate" style={{ display: 'block' }}>#{c.name}</strong>
                      <span className="neo-faint text-xs truncate" style={{ display: 'block' }}>{c.topic}</span>
                    </span>
                    <span className="neo-hud neo-hud--tint">Open</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="neo-hud">{results.length ? `${results.length}${results.length === 80 ? '+' : ''} message${results.length === 1 ? '' : 's'}` : 'No messages match'}</div>
            {results.length ? (
              <div className="pc-results" data-qa="search-results">
                {results.map((m) => {
                  const text = snippetFor(m, q, { plain }, 280);
                  return (
                    <button key={m.id} type="button" className="pc-result neo-spot" onClick={() => navigate(chatLink(m.convId, { msg: m.id, thread: m.parentId }))}>
                      <AuthorAvatar id={m.authorId} size={32} names={names} />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="row" style={{ gap: 8 }}>
                          <strong className="text-sm">{names.name(m.authorId)}</strong>
                          <span className="neo-faint text-xs">
                            {label(m.convId)}
                            {m.parentId ? ' · in thread' : ''} · {relativeTime(m.at)}
                          </span>
                        </span>
                        <span className="pc-result__text">
                          {highlightParts(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
                        </span>
                      </span>
                      {m.poll && <Chip size="sm" tone="violet">Poll</Chip>}
                      {(m.files?.length || m.attachments?.length) && <Chip size="sm" tone="blue">File</Chip>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <NeoEmpty icon={<SearchIcon />} title="No results" compact action={<button type="button" className="neo-btn neo-btn--soft" onClick={() => setText(formatQuery({ ...emptyQuery(), terms: q.terms, phrases: q.phrases }))}>Clear filters</button>}>
                Try fewer words, or remove a filter.
              </NeoEmpty>
            )}
          </div>
        )}
      </div>
    </>
  );
}

