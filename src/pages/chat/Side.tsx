/**
 * Conversation navigator — used as the Neo side panel on desktop and as the home list on phones.
 * Sections: Live huddles, Starred, Channels, Direct messages, Apps. Jump search also finds people.
 */
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AudioLines,
  BellOff,
  Check,
  ChevronDown,
  CircleDot,
  Compass,
  Copy,
  Eye,
  Hash,
  ListFilter,
  LogOut,
  MessageCirclePlus,
  Plus,
  Star,
  StarOff,
  X,
} from 'lucide-react';
import { NeoMenu, NeoPopover, NeoSearch, NeoSideGroup, NeoSideItem, Typing, useContextMenu, type MenuEntry } from '@/components/neo';
import { Avatar, PRESENCE_LABEL } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { fuzzyScore } from '@/lib/fuzzy';
import type { Presence } from '@/types';
import { canCreateChannel, canLeave } from '@/chat/access';
import { dmId } from '@/chat/ids';
import { useChat } from '@/chat/store';
import { useNames, useSideSections, useTyping, useViewer, type ConvRow } from './hooks';
import { ConvIcon } from './parts';
import { useChatUI } from './ui';

function RowMeta({ row, viewerId }: { row: ConvRow; viewerId?: string }) {
  const typing = useTyping(row.conv.id, viewerId);
  const live = useChat((s) => !!s.huddles[row.conv.id]);
  if (typing.length) return <Typing label={`${typing.length} typing`} />;
  return (
    <span className="pc-side-meta">
      {live && <AudioLines className="pc-live-icon" aria-label="Huddle live" />}
      {row.muted && <BellOff className="pc-muted-icon" aria-label="Muted" />}
      {row.state.mentions > 0 && !row.muted ? (
        <span className="neo-count neo-count--app">{row.state.mentions > 99 ? '99+' : row.state.mentions}</span>
      ) : row.state.unread > 0 && !row.muted ? (
        <span className="pc-unread-dot" aria-label={`${row.state.unread} unread`} />
      ) : null}
    </span>
  );
}

function Section({ id, label, rows, action, collapsed, onToggle, onOpen, activeId, viewerId, onContext }: {
  id: string;
  label: string;
  rows: ConvRow[];
  action?: React.ReactNode;
  collapsed: boolean;
  onToggle: (id: string) => void;
  onOpen?: () => void;
  activeId?: string;
  viewerId?: string;
  onContext: (e: MouseEvent, row: ConvRow) => void;
}) {
  if (!rows.length && !action) return null;
  const visible = collapsed ? rows.filter((r) => r.conv.id === activeId || r.state.unread > 0) : rows;
  return (
    <NeoSideGroup
      label={
        <button type="button" className="pc-group-toggle" onClick={() => onToggle(id)} aria-expanded={!collapsed}>
          <ChevronDown className={cx('pc-chev', collapsed && 'is-collapsed')} />
          {label}
        </button>
      }
      action={action}
    >
      {visible.map((r) => (
        <NeoSideItem
          key={r.conv.id}
          to={`/chat/c/${r.conv.id}`}
          onClick={onOpen}
          active={r.conv.id === activeId}
          unread={r.state.unread > 0 && !r.muted}
          icon={<ConvIcon conv={r.conv} viewerId={viewerId} size={r.conv.kind === 'channel' ? 22 : 24} />}
          label={<span className={cx(r.muted && 'pc-dim')}>{r.title}</span>}
          meta={<RowMeta row={r} viewerId={viewerId} />}
          title={r.conv.kind === 'channel' ? `#${r.title}${r.conv.topic ? ` — ${r.conv.topic}` : ''}` : r.title}
          onContextMenu={(e) => onContext(e, r)}
        />
      ))}
    </NeoSideGroup>
  );
}

function LiveHuddles({ activeId, onOpen }: { activeId?: string; onOpen?: () => void }) {
  const v = useViewer();
  const huddles = useChat((s) => s.huddles);
  const conversations = useChat((s) => s.conversations);
  const names = useNames();
  const navigate = useNavigate();
  const list = useMemo(
    () => Object.values(huddles).filter((h) => conversations.find((c) => c.id === h.convId)?.memberIds.includes(v?.user.id ?? '')),
    [huddles, conversations, v],
  );
  if (!list.length) return null;
  return (
    <NeoSideGroup label="Live now">
      {list.map((h) => {
        const c = conversations.find((x) => x.id === h.convId)!;
        return (
          <button
            key={h.convId}
            type="button"
            className={cx('pc-live-row', activeId === c.id && 'is-active')}
            onClick={() => {
              onOpen?.();
              navigate(`/chat/c/${c.id}?huddle=1`);
            }}
            data-qa="side-huddle"
          >
            <span className="pc-live-row__wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="grow truncate">
              <span className="pc-live-row__title">{c.kind === 'channel' ? `#${c.name}` : 'Huddle'}</span>
              <span className="pc-live-row__sub">{h.participantIds.map(names.first).join(', ')}</span>
            </span>
            <span className="pc-live-row__join">Join</span>
          </button>
        );
      })}
    </NeoSideGroup>
  );
}

const PRESENCE_ORDER: Presence[] = ['online', 'focus', 'meeting', 'away'];

export function PresenceDock() {
  const v = useViewer();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  if (!v) return null;
  const u = v.user;
  const set = (p: Presence, message?: string) => {
    const res = useChat.getState().setStatus(p, message);
    if (!res.ok) toast.error(res.error);
  };
  return (
    <div className="pc-dock">
      <button ref={ref} type="button" className="pc-dock__me" onClick={() => (setMsg(u.statusMessage ?? ''), setOpen((o) => !o))} aria-label="Set your status" data-qa="presence-dock">
        <Avatar user={u} size={34} presence />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="pc-dock__name truncate">{u.name}</span>
          <span className="pc-dock__status truncate">{u.statusMessage || PRESENCE_LABEL[u.presence]}</span>
        </span>
        <ChevronDown className="pc-chev" />
      </button>
      <NeoPopover open={open} anchor={ref.current} onClose={() => setOpen(false)} placement="top-start" width={280} label="Your status">
        <div className="neo-menu__label">Presence</div>
        {PRESENCE_ORDER.map((p) => (
          <button key={p} type="button" className="neo-menu__item" onClick={() => (set(p), setOpen(false))}>
            <span className={`dot dot--${p}`} />
            <span className="grow">{PRESENCE_LABEL[p]}</span>
            {u.presence === p && <Check style={{ color: 'var(--app-ink)' }} />}
          </button>
        ))}
        <div className="neo-menu__sep" />
        <div className="neo-menu__label">Status message</div>
        <form
          className="row"
          style={{ gap: 6, padding: '4px 6px 6px' }}
          onSubmit={(e) => {
            e.preventDefault();
            set(u.presence, msg);
            setOpen(false);
            toast.success('Status updated');
          }}
        >
          <input className="neo-input neo-input--sm" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="What’s happening?" maxLength={100} aria-label="Status message" />
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm">
            Save
          </button>
        </form>
        {u.statusMessage && (
          <button type="button" className="neo-menu__item" onClick={() => (useHub.getState().setPresence(u.presence, ''), setOpen(false))}>
            <X /> Clear status
          </button>
        )}
      </NeoPopover>
    </div>
  );
}

export function ConvNavigator({ onNavigate, searchRef, compact }: { onNavigate?: () => void; searchRef?: React.Ref<HTMLInputElement>; compact?: boolean }) {
  const v = useViewer();
  const { convId } = useParams();
  const activeId = useChatUI((s) => s.activeConvId) ?? convId;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const sections = useSideSections(filter);
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const ctx = useContextMenu();
  const users = useHub((s) => s.users);
  const conversations = useChat((s) => s.conversations);

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const open = (to: string) => {
    onNavigate?.();
    navigate(to);
  };

  const matches = useMemo(() => {
    const s = q.trim();
    if (!s || !v) return null;
    const rows = sections.order.length ? sections.order : [];
    const convHits = rows
      .map((r) => ({ r, sc: fuzzyScore(s, r.title, [r.conv.topic ?? '']) }))
      .filter((x) => x.sc)
      .sort((a, b) => b.sc!.score - a.sc!.score)
      .slice(0, 8)
      .map((x) => x.r);
    const have = new Set(convHits.flatMap((r) => (r.conv.kind === 'dm' ? r.conv.memberIds : [])));
    const people = users
      .filter((u) => u.active && u.id !== v.user.id && !have.has(u.id))
      .map((u) => ({ u, sc: fuzzyScore(s, u.name, [u.title, u.department]) }))
      .filter((x) => x.sc)
      .sort((a, b) => b.sc!.score - a.sc!.score)
      .slice(0, 5)
      .map((x) => x.u);
    const channels = conversations
      .filter((c) => c.kind === 'channel' && c.visibility === 'public' && !c.memberIds.includes(v.user.id) && !v.viewer.contractor)
      .filter((c) => fuzzyScore(s, c.name, [c.topic ?? '']))
      .slice(0, 4);
    return { convHits, people, channels };
  }, [q, sections.order, users, conversations, v]);

  const onContext = (e: MouseEvent, row: ConvRow) => {
    const s = useChat.getState();
    const items: MenuEntry[] = [
      { label: row.starred ? 'Unstar' : 'Star', icon: row.starred ? <StarOff /> : <Star />, onSelect: () => s.toggleStar(row.conv.id) },
      { label: row.muted ? 'Unmute' : 'Mute', icon: <BellOff />, onSelect: () => s.toggleMute(row.conv.id) },
      { label: 'Mark as read', icon: <Eye />, disabled: !row.state.unread, onSelect: () => s.markRead(row.conv.id) },
      { label: 'Copy link', icon: <Copy />, onSelect: () => void navigator.clipboard?.writeText(`${location.origin}/chat/c/${row.conv.id}`).then(() => toast.success('Link copied')).catch(() => undefined) },
    ];
    if (row.conv.kind === 'channel' && v && canLeave(row.conv, v.viewer))
      items.push({ kind: 'sep' }, { label: `Leave #${row.conv.name}`, icon: <LogOut />, danger: true, onSelect: () => toast.result(s.leaveChannel(row.conv.id), `Left #${row.conv.name}`) });
    if (row.conv.kind !== 'channel') items.push({ kind: 'sep' }, { label: 'Close conversation', icon: <X />, onSelect: () => s.hideConversation(row.conv.id) });
    ctx.open(e, items);
  };

  const canCreate = !!v && canCreateChannel(v.viewer);
  const newMenu: MenuEntry[] = [
    { label: 'New message', icon: <MessageCirclePlus />, hint: 'C', onSelect: () => open('?new=dm') },
    { label: 'Create channel', icon: <Plus />, disabled: !canCreate, onSelect: () => open('?new=channel') },
    { label: 'Browse channels', icon: <Compass />, disabled: !!v?.viewer.contractor, onSelect: () => open('/chat/browse') },
  ];

  return (
    <div className={cx('pc-nav', compact && 'pc-nav--compact')}>
      <div className="pc-nav__top">
        <NeoSearch
          value={q}
          onChange={setQ}
          placeholder="Jump to…"
          kbd="S"
          size="sm"
          inputRef={searchRef}
          label="Jump to a conversation or person"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches) {
              const first = matches.convHits[0];
              if (first) open(`/chat/c/${first.conv.id}`);
              else if (matches.people[0] && v) open(`/chat/c/${dmId([v.user.id, matches.people[0].id])}`);
              else if (matches.channels[0]) open(`/chat/c/${matches.channels[0].id}`);
              setQ('');
            }
          }}
        />
        <button type="button" className={cx('neo-iconbtn', filter === 'unread' && 'is-on')} onClick={() => setFilter((f) => (f === 'all' ? 'unread' : 'all'))} aria-pressed={filter === 'unread'} data-tip={filter === 'unread' ? 'Show all' : 'Unreads only'} aria-label="Toggle unreads only">
          <ListFilter />
        </button>
        <NeoMenu
          items={newMenu}
          label="New"
          trigger={(p) => (
            <button {...p} type="button" className="neo-iconbtn pc-new-btn" aria-label="New conversation" data-qa="side-new">
              <Plus />
            </button>
          )}
        />
      </div>

      <div className="pc-nav__body">
        {matches ? (
          <div className="pc-jump">
            {matches.convHits.map((r) => (
              <NeoSideItem key={r.conv.id} to={`/chat/c/${r.conv.id}`} onClick={() => (setQ(''), onNavigate?.())} icon={<ConvIcon conv={r.conv} viewerId={v?.user.id} />} label={r.title} meta={<RowMeta row={r} viewerId={v?.user.id} />} />
            ))}
            {matches.people.length > 0 && <div className="neo-side__group">People</div>}
            {matches.people.map((u) => (
              <NeoSideItem key={u.id} to={`/chat/c/${dmId([v!.user.id, u.id])}`} onClick={() => (setQ(''), onNavigate?.())} icon={<Avatar user={u} size={24} presence />} label={u.name} meta={<span className="neo-faint text-xs">{u.department}</span>} />
            ))}
            {matches.channels.length > 0 && <div className="neo-side__group">Channels to join</div>}
            {matches.channels.map((c) => (
              <NeoSideItem key={c.id} to={`/chat/c/${c.id}`} onClick={() => (setQ(''), onNavigate?.())} icon={<ConvIcon conv={c} />} label={c.name} meta={<Hash className="pc-muted-icon" />} />
            ))}
            {!matches.convHits.length && !matches.people.length && !matches.channels.length && <div className="pc-jump__empty">No matches for “{q}”</div>}
          </div>
        ) : (
          <>
            <LiveHuddles activeId={activeId} onOpen={onNavigate} />
            <Section id="starred" label="Starred" rows={sections.starred} collapsed={!!collapsed.starred} onToggle={toggle} onOpen={onNavigate} activeId={activeId} viewerId={v?.user.id} onContext={onContext} />
            <Section
              id="channels"
              label="Channels"
              rows={sections.channels}
              collapsed={!!collapsed.channels}
              onToggle={toggle}
              onOpen={onNavigate}
              activeId={activeId}
              viewerId={v?.user.id}
              onContext={onContext}
              action={
                canCreate ? (
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => open('?new=channel')} aria-label="Create channel" data-tip="Create channel">
                    <Plus />
                  </button>
                ) : undefined
              }
            />
            <Section
              id="direct"
              label="Direct messages"
              rows={sections.direct}
              collapsed={!!collapsed.direct}
              onToggle={toggle}
              onOpen={onNavigate}
              activeId={activeId}
              viewerId={v?.user.id}
              onContext={onContext}
              action={
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => open('?new=dm')} aria-label="New message" data-tip="New message">
                  <Plus />
                </button>
              }
            />
            <AppsSection rows={sections.apps} collapsed={!!collapsed.apps} onToggle={toggle} onOpen={onNavigate} activeId={activeId} onContext={onContext} />
            {filter === 'unread' && !sections.order.length && (
              <div className="pc-jump__empty">
                <CircleDot /> You’re all caught up
              </div>
            )}
          </>
        )}
      </div>
      {ctx.element}
    </div>
  );
}

/** Apps: the four integration bots — always listed (conversations are created lazily). */
function AppsSection({ rows, collapsed, onToggle, onOpen, activeId, onContext }: { rows: ConvRow[]; collapsed: boolean; onToggle: (id: string) => void; onOpen?: () => void; activeId?: string; onContext: (e: MouseEvent, row: ConvRow) => void }) {
  const v = useViewer();
  const all = useMemo(() => {
    if (!v) return [];
    const bots = ['bot-nova', 'bot-projects', 'bot-drive', 'bot-helpdesk'] as const;
    return bots.map((b) => ({ bot: b, id: dmId([b, v.user.id]), row: rows.find((r) => r.conv.botId === b) }));
  }, [rows, v]);
  return (
    <NeoSideGroup
      label={
        <button type="button" className="pc-group-toggle" onClick={() => onToggle('apps')} aria-expanded={!collapsed}>
          <ChevronDown className={cx('pc-chev', collapsed && 'is-collapsed')} />
          Apps
        </button>
      }
    >
      {all
        .filter((a) => !collapsed || a.id === activeId || (a.row?.state.unread ?? 0) > 0)
        .map((a) => (
          <NeoSideItem
            key={a.bot}
            to={`/chat/c/${a.id}`}
            onClick={onOpen}
            active={a.id === activeId}
            unread={(a.row?.state.unread ?? 0) > 0}
            icon={<ConvIcon conv={{ id: a.id, kind: 'app', name: '', visibility: 'private', posting: 'everyone', memberIds: [a.bot, v!.user.id], adminIds: [], createdBy: '', createdAt: 0, pinnedIds: [], botId: a.bot }} viewerId={v?.user.id} size={24} />}
            label={a.bot === 'bot-nova' ? <span className="neo-nova-text">Nova</span> : a.row?.title ?? labelFor(a.bot)}
            meta={a.row ? <RowMeta row={a.row} viewerId={v?.user.id} /> : undefined}
            onContextMenu={a.row ? (e) => onContext(e, a.row!) : undefined}
          />
        ))}
    </NeoSideGroup>
  );
}

const labelFor = (b: string) => ({ 'bot-projects': 'Helix Projects', 'bot-drive': 'Helix Drive', 'bot-helpdesk': 'IT Helpdesk', 'bot-nova': 'Nova' })[b] ?? b;
