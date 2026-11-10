/**
 * Conversation screen: header (huddle, members, details), live strips, message list (grouping, day and
 * “New messages” dividers, Nova catch-up, jump-to-latest), composer and the right inspector.
 * Deep links: ?thread=<id> · ?msg=<id> · ?huddle=1 · ?compose=poll|kudos|standup|spark · ?details=about|members|pinned|files
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowDown,
  ArrowLeft,
  AudioLines,
  BellOff,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Headphones,
  Info,
  LogOut,
  MoreHorizontal,
  Pin,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Trophy,
  Undo2,
} from 'lucide-react';
import { Avatars, NeoEmpty, NeoHead, NeoMenu, NovaChip, Typing, useTypewriter, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { PRESENCE_LABEL } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/cx';
import { useToasts, toast } from '@/store/toast';
import { canGiveKudos, canLeave, canView } from '@/chat/access';
import { sparkOfDay } from '@/chat/constants';
import { digest, digestMarkdown } from '@/chat/nova';
import { indexMessages } from '@/chat/selectors';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation, DriveFileRef } from '@/chat/types';
import { Composer, type ComposerDialog } from './Composer';
import { DrivePickerDialog, ForwardDialog, KudosDialog, PollDialog, StandupDialog, TaskDialog, TicketDialog } from './Dialogs';
import { joinHuddle } from './Huddle';
import { DetailsPanel, ThreadPanel } from './Inspector';
import { Message, type MessageAction } from './Message';
import { convTitle, dmPeer, useNames, usePerson, usePlain, useViewer } from './hooks';
import { ConvIcon, dayLabel, localTime, Md } from './parts';
import { useChatShell } from './shell';
import { useChatUI } from './ui';

const GROUP_GAP = 5 * 60_000;
const PAGE = 140;

type DetailsTab = 'about' | 'members' | 'pinned' | 'files';

/* ---------------------------------------------------------------- route */

export function ConversationRoute() {
  const { convId = '' } = useParams();
  const v = useViewer();
  const conv = useChat((s) => s.conversations.find((c) => c.id === convId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!v || conv) return;
    const res = useChat.getState().ensureConversation(convId);
    if (!res.ok) setError(res.error);
  }, [convId, conv, v]);

  if (!v) return null;
  if (conv && !canView(conv, v.viewer)) return <NoAccess text="This conversation is private. Ask a member to add you." />;
  if (error) return <NoAccess text={error} />;
  if (!conv) return null;
  return <ConversationScreen key={conv.id} conv={conv} />;
}

function NoAccess({ text }: { text: string }) {
  const shell = useChatShell();
  return (
    <>
      <NeoHead icon={<ShieldAlert />} eyebrow="Pulse Chat" title="Can’t open this conversation" onToggleSide={shell.toggleSide} />
      <div className="neo-body">
        <NeoEmpty icon={<ShieldAlert />} title="No access" action={<Link to="/chat/c/ch-general" className="neo-btn neo-btn--plasma">Go to #general</Link>}>
          {text}
        </NeoEmpty>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- catch-up */

function CatchUp({ conv, unread, onClose }: { conv: Conversation; unread: ChatMessage[]; onClose: () => void }) {
  const v = useViewer();
  const names = useNames();
  const plain = usePlain();
  const messages = useChat((s) => s.messages);
  const [ready, setReady] = useState(false);
  const text = useMemo(() => {
    const idx = indexMessages(messages);
    const d = digest(unread, { meId: v?.user.id ?? '', meHandle: v?.handle, now: Date.now(), userName: names.name, plain, convLabel: () => conv.name, replyCount: (id) => idx.threads.get(id)?.length ?? 0 });
    return digestMarkdown(d, (l) => `/chat/c/${l.convId}?msg=${l.messageId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.length]);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 700);
    return () => window.clearTimeout(t);
  }, []);
  const [shown, done] = useTypewriter(ready ? text : '', 200);
  return (
    <div className="neo-nova pc-novacard pc-catchup" data-qa="catch-up">
      <span className="neo-nova__glow" />
      <div className="pc-novacard__head">
        <NovaChip>Catch-up</NovaChip>
        {!ready && <Typing label="Nova is reading" />}
        <span className="grow" />
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onClose}>
          Dismiss
        </button>
      </div>
      {ready && <Md text={shown + (done ? '' : ' ▍')} className="pc-novacard__body" />}
    </div>
  );
}

/* ---------------------------------------------------------------- list */

interface ListProps {
  conv: Conversation;
  readMark: number;
  focusId: string | null;
  onReply: (m: ChatMessage) => void;
  onAction: (k: MessageAction, m: ChatMessage) => void;
  onAtBottom: (b: boolean) => void;
}

function MessageList({ conv, readMark, focusId, onReply, onAction, onAtBottom }: ListProps) {
  const v = useViewer();
  const names = useNames();
  const person = usePerson();
  const messages = useChat((s) => s.messages);
  const people = useChat((s) => s.people);
  const idx = indexMessages(messages);
  const all = idx.byConv.get(conv.id) ?? [];
  const [limit, setLimit] = useState(PAGE);
  const [catchUp, setCatchUp] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastLen = useRef(all.length);
  const [newCount, setNewCount] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const didInit = useRef(false);
  const restore = useRef<number | null>(null);

  const list = all.length > limit ? all.slice(all.length - limit) : all;
  const firstUnread = useMemo(() => all.find((m) => m.at > readMark && m.authorId !== v?.user.id && !m.system), [all, readMark, v]);
  const unread = useMemo(() => all.filter((m) => m.at > readMark && m.authorId !== v?.user.id && !m.system && !m.deleted), [all, readMark, v]);

  // DM read receipt: last message I sent that the other person has read.
  const seenId = useMemo(() => {
    if (conv.kind !== 'dm' || !v) return null;
    const peer = dmPeer(conv, v.user.id);
    if (!peer || peer === v.user.id) return null;
    const theirRead = people[peer]?.lastRead[conv.id] ?? 0;
    const mine = [...all].reverse().find((m) => m.authorId === v.user.id && !m.deleted);
    return mine && theirRead >= mine.at ? mine.id : null;
  }, [conv, v, people, all]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Initial position: focused message → first unread → bottom
  useLayoutEffect(() => {
    if (didInit.current) return;
    const el = scroller.current;
    if (!el) return;
    didInit.current = true;
    if (focusId) {
      const target = el.querySelector<HTMLElement>(`[data-msg="${focusId}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        atBottom.current = false;
        return;
      }
    }
    if (firstUnread) {
      const div = el.querySelector<HTMLElement>('.pc-newdiv');
      if (div && el.scrollHeight > el.clientHeight) {
        el.scrollTop = Math.max(0, div.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 90);
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
        return;
      }
    }
    el.scrollTop = el.scrollHeight;
  });

  // Re-focus when ?msg changes while open
  useEffect(() => {
    if (!focusId || !didInit.current) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-msg="${focusId}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (all.some((m) => m.id === focusId)) setLimit(all.length);
  }, [focusId, all]);

  // New messages: stick to bottom or count them
  useLayoutEffect(() => {
    const grew = all.length > lastLen.current;
    const added = all.slice(lastLen.current);
    lastLen.current = all.length;
    if (restore.current !== null && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight - restore.current;
      restore.current = null;
      return;
    }
    if (!grew || !didInit.current) return;
    const mine = added.some((m) => m.authorId === v?.user.id);
    if (atBottom.current || mine) {
      requestAnimationFrame(() => scrollToBottom(true));
      setNewCount(0);
    } else setNewCount((n) => n + added.filter((m) => !m.system).length);
  }, [all, v, scrollToBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = dist < 140;
    if (bottom !== atBottom.current) {
      atBottom.current = bottom;
      onAtBottom(bottom);
    }
    if (bottom && newCount) setNewCount(0);
    setShowJump(dist > 700);
  };

  const loadEarlier = () => {
    const el = scroller.current;
    if (el) restore.current = el.scrollHeight - el.scrollTop;
    setLimit((l) => l + PAGE);
  };

  // One <section> per day: its pill sticks to the top while that day is on screen (rule lines stay put).
  const days: React.ReactNode[] = [];
  let rows: React.ReactNode[] = [];
  let prev: ChatMessage | undefined;
  let lastDay = '';
  const flushDay = () => {
    if (lastDay && rows.length) days.push(<section key={`d-${lastDay}`} className="pc-day">{rows}</section>);
    rows = [];
  };
  for (const m of list) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) {
      flushDay();
      rows.push(
        <div key="daydiv" className="pc-daydiv" role="separator" aria-label={dayLabel(m.at)}>
          <span>{dayLabel(m.at)}</span>
        </div>,
      );
      lastDay = day;
      prev = undefined;
    }
    if (firstUnread && m.id === firstUnread.id) {
      rows.push(
        <div key="new" className="pc-newdiv" role="separator" data-qa="new-divider">
          <span className="pc-newdiv__label">New</span>
          {unread.length >= 3 && !catchUp && (
            <button type="button" className="pc-newdiv__nova" onClick={() => setCatchUp(true)} data-qa="catch-up-btn">
              <Sparkles /> Catch me up · {unread.length} new
            </button>
          )}
        </div>,
      );
      if (catchUp) rows.push(<CatchUp key="catchup" conv={conv} unread={unread} onClose={() => setCatchUp(false)} />);
      prev = undefined;
    }
    const grouped = !!prev && prev.authorId === m.authorId && !prev.system && !m.system && m.at - prev.at < GROUP_GAP && !m.poll && !m.kudos && !m.celebration && !m.huddle && !prev.broadcast && !m.broadcast;
    const replies = idx.threads.get(m.id);
    const threadUnread = !!replies?.length && replies[replies.length - 1].at > (person.threadRead[m.id] ?? 0) && replies[replies.length - 1].authorId !== v?.user.id && (replies.some((r) => r.authorId === v?.user.id) || m.authorId === v?.user.id);
    rows.push(<Message key={m.id} m={m} conv={conv} grouped={grouped} replies={replies} highlight={focusId === m.id} seen={seenId === m.id} threadUnread={threadUnread} onReply={onReply} onAction={onAction} />);
    prev = m;
  }
  flushDay();

  const isEmpty = !all.length;
  return (
    <div className="pc-listwrap">
      <div className="neo-body pc-scroll" ref={scroller} onScroll={onScroll} data-qa="message-list">
        <div className="pc-list">
          {all.length > limit && (
            <button type="button" className="pc-earlier" onClick={loadEarlier}>
              <ChevronUp /> Show earlier messages
            </button>
          )}
          {(all.length <= limit || isEmpty) && <ConvIntro conv={conv} names={names} />}
          {days}
        </div>
      </div>
      {(newCount > 0 || showJump) && (
        <button type="button" className="pc-jumppill" onClick={() => (scrollToBottom(true), setNewCount(0))} data-qa="jump-latest">
          <ArrowDown /> {newCount > 0 ? `${newCount} new message${newCount === 1 ? '' : 's'}` : 'Jump to latest'}
        </button>
      )}
    </div>
  );
}

function ConvIntro({ conv, names }: { conv: Conversation; names: ReturnType<typeof useNames> }) {
  const v = useViewer();
  const navigate = useNavigate();
  const peer = dmPeer(conv, v?.user.id);
  const title = convTitle(conv, v?.user.id, names);
  const send = (text: string) => {
    const res = useChat.getState().send(conv.id, { text });
    if (!res.ok) toast.error(res.error);
  };
  return (
    <div className="pc-intro">
      <ConvIcon conv={conv} viewerId={v?.user.id} size={64} presence={false} />
      <div className="pc-intro__title">
        {conv.kind === 'channel' ? (
          <>
            Welcome to <span className="neo-grad-text">#{conv.name}</span>
          </>
        ) : conv.kind === 'app' ? (
          title
        ) : peer === v?.user.id ? (
          'Your private notes'
        ) : (
          <>This is the beginning of your conversation with {title}</>
        )}
      </div>
      <div className="pc-intro__sub">
        {conv.kind === 'channel'
          ? conv.description || conv.topic || 'Share updates, ask questions and celebrate wins here.'
          : conv.kind === 'app'
            ? 'Updates from this app arrive here. You can reply to ask for help.'
            : peer === v?.user.id
              ? 'Jot down drafts and links — only you can see this.'
              : 'Messages here are private between the people in this conversation.'}
      </div>
      {conv.kind === 'dm' && peer && peer !== v?.user.id && (
        <div className="row row--wrap" style={{ gap: 8, justifyContent: 'center' }}>
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => send('👋')}>
            Wave 👋
          </button>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => navigate(`?huddle=1`)}>
            <Headphones /> Start a huddle
          </button>
          {v && canGiveKudos(v.viewer) && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => navigate(`?compose=kudos`)}>
              <Trophy /> Send kudos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- spark dialog */

function SparkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const submit = () => {
    const res = useChat.getState().answerSpark(text);
    if (!res.ok) return toast.error(res.error);
    toast.success('Spark shared ✨', 'Posted to #watercooler');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daily Spark"
      subtitle={sparkOfDay()}
      icon={
        <span className="pc-dialog-icon">
          <Sparkles />
        </span>
      }
      className="neo-portal pc-dialog"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={text.trim().length < 2} onClick={submit}>
            Share answer
          </button>
        </>
      }
    >
      <textarea className="neo-textarea" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer…" aria-label="Your answer" maxLength={600} />
    </Modal>
  );
}

/* ---------------------------------------------------------------- screen */

function ConversationScreen({ conv }: { conv: Conversation }) {
  const v = useViewer();
  const names = useNames();
  const person = usePerson();
  const shell = useChatShell();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const huddle = useChat((s) => s.huddles[conv.id]);
  const runtime = useChatUI((s) => s.huddle);
  const [readMark] = useState(() => person.lastRead[conv.id] ?? 0);
  const [dialog, setDialog] = useState<ComposerDialog | null>(null);
  const attachRef = useRef<((f: DriveFileRef) => void) | null>(null);
  const [msgAction, setMsgAction] = useState<{ kind: MessageAction; m: ChatMessage } | null>(null);
  const [sparkOpen, setSparkOpen] = useState(false);
  const [undo, setUndo] = useState<{ original: ChatMessage; toastId: string } | null>(null);
  const atBottomRef = useRef(true);
  const messagesLen = useChat((s) => (indexMessages(s.messages).byConv.get(conv.id) ?? []).length);

  const threadId = params.get('thread');
  const focusId = params.get('msg');
  const detailsTab = params.get('details') as DetailsTab | null;
  const title = convTitle(conv, v?.user.id, names);
  const peer = dmPeer(conv, v?.user.id);
  const peerUser = peer && peer !== v?.user.id ? names.user(peer) : undefined;

  // Mark active + remember last conversation; mark read on open and while at bottom.
  useEffect(() => {
    useChatUI.getState().setActive(conv.id);
    useChat.getState().setLastConv(conv.id);
    if (conv.botId === 'bot-nova' && v) import('./live').then((m) => m.ensureNovaWelcome(conv.id, v.user.id));
    return () => useChatUI.getState().setActive(null);
  }, [conv.id, conv.botId, v]);
  useEffect(() => {
    if (document.visibilityState !== 'visible') return;
    if (atBottomRef.current || messagesLen < 2) useChat.getState().markRead(conv.id);
  }, [conv.id, messagesLen]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && atBottomRef.current && useChat.getState().markRead(conv.id);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [conv.id]);

  // Deep-link actions (?huddle=1, ?compose=…)
  useEffect(() => {
    const hud = params.get('huddle');
    const compose = params.get('compose');
    if (!hud && !compose) return;
    const next = new URLSearchParams(params);
    next.delete('huddle');
    next.delete('compose');
    setParams(next, { replace: true });
    if (hud) joinHuddle(conv.id);
    if (compose === 'poll') setDialog({ kind: 'poll' });
    else if (compose === 'kudos') setDialog({ kind: 'kudos' });
    else if (compose === 'standup') setDialog({ kind: 'standup' });
    else if (compose === 'spark') setSparkOpen(true);
  }, [params, setParams, conv.id]);

  // Join from a "huddle started" system line
  useEffect(() => {
    const on = (e: Event) => joinHuddle((e as CustomEvent<string>).detail);
    window.addEventListener('pc:join-huddle', on);
    return () => window.removeEventListener('pc:join-huddle', on);
  }, []);

  // Undo delete
  useEffect(() => {
    const on = (e: Event) => setUndo((e as CustomEvent<{ original: ChatMessage; toastId: string }>).detail);
    window.addEventListener('pc:undo-delete', on);
    return () => window.removeEventListener('pc:undo-delete', on);
  }, []);
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(t);
  }, [undo]);
  const doUndo = () => {
    if (!undo) return;
    const res = useChat.getState().restoreMessage(undo.original);
    useToasts.getState().dismiss(undo.toastId);
    setUndo(null);
    if (res.ok) toast.success('Message restored');
  };

  const setParam = useCallback(
    (k: string, val: string | null) => {
      const next = new URLSearchParams(params);
      if (val === null) next.delete(k);
      else next.set(k, val);
      if (k === 'thread' && val) next.delete('details');
      if (k === 'details' && val) next.delete('thread');
      setParams(next);
    },
    [params, setParams],
  );
  const openThread = useCallback((m: ChatMessage) => setParam('thread', m.parentId ?? m.id), [setParam]);
  const onAction = useCallback((kind: MessageAction, m: ChatMessage) => setMsgAction({ kind, m }), []);
  const onDialog = useCallback((d: ComposerDialog, attach?: (f: DriveFileRef) => void) => {
    attachRef.current = attach ?? null;
    setDialog(d);
  }, []);
  const toggleDetails = () => setParam('details', detailsTab ? null : 'about');

  useHotkeys({
    escape: () => {
      if (threadId) setParam('thread', null);
      else if (detailsTab) setParam('details', null);
    },
    ']': toggleDetails,
    e: (ev) => {
      if (!v) return;
      const list = indexMessages(useChat.getState().messages).byConv.get(conv.id) ?? [];
      const mine = [...list].reverse().find((x) => x.authorId === v.user.id && !x.deleted && !x.system && !x.poll && !x.kudos);
      if (mine) {
        ev.preventDefault();
        useChatUI.getState().setEditing(mine.id);
      }
    },
    h: () => joinHuddle(conv.id),
    'mod+z': (ev) => {
      if (undo) {
        ev.preventDefault();
        doUndo();
      }
    },
  });

  const s = useChat.getState;
  const starred = person.starred.includes(conv.id);
  const muted = person.muted.includes(conv.id);
  const more: MenuEntry[] = [
    { label: 'Search in conversation', icon: <Search />, onSelect: () => navigate(`/chat/search?q=${encodeURIComponent(conv.kind === 'channel' ? `in:#${conv.name} ` : peer ? `in:@${names.handle(peer)} ` : '')}`) },
    { label: 'Pinned messages', icon: <Pin />, onSelect: () => setParam('details', 'pinned') },
    { label: 'Files & links', icon: <FileText />, onSelect: () => setParam('details', 'files') },
    { kind: 'sep' },
    { label: starred ? 'Unstar' : 'Star', icon: <Star />, onSelect: () => s().toggleStar(conv.id) },
    { label: muted ? 'Unmute' : 'Mute', icon: <BellOff />, onSelect: () => s().toggleMute(conv.id) },
    { label: 'Copy link', icon: <Copy />, onSelect: () => void navigator.clipboard?.writeText(`${location.origin}/chat/c/${conv.id}`).then(() => toast.success('Link copied')).catch(() => undefined) },
    ...(conv.linked ? [{ label: `Open ${conv.linked.label}`, icon: <ExternalLink />, onSelect: () => navigate(conv.linked!.to) }] : []),
    ...(v && conv.kind === 'channel' && canLeave(conv, v.viewer) ? [{ kind: 'sep' as const }, { label: `Leave #${conv.name}`, icon: <LogOut />, danger: true, onSelect: () => (toast.result(s().leaveChannel(conv.id), `Left #${conv.name}`), navigate('/chat/c/ch-general')) }] : []),
  ];

  const members = conv.memberIds.filter((m) => !m.startsWith('bot-'));
  const memberUsers = members.map((id) => names.user(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const inThisHuddle = runtime?.convId === conv.id;
  const pinnedLatest = conv.pinnedIds.map((id) => useChat.getState().messages.find((m) => m.id === id)).find((m) => m && !m.deleted);

  const eyebrow =
    conv.kind === 'channel'
      ? `${conv.visibility === 'private' ? 'Private' : conv.posting === 'admins' ? 'Announcements' : 'Channel'} · ${members.length} members`
      : conv.kind === 'group'
        ? `Group · ${members.length} people`
        : conv.kind === 'app'
          ? 'App'
          : peerUser
            ? `Direct message · ${localTime(peerUser.timezone)} local`
            : 'Notes to self';
  const sub =
    conv.kind === 'channel'
      ? conv.topic || 'No topic yet'
      : peerUser
        ? `${peerUser.title} · ${PRESENCE_LABEL[names.presence(peerUser.id)]}${peerUser.statusMessage ? ` — ${peerUser.statusMessage}` : ''}`
        : conv.kind === 'group'
          ? memberUsers.map((u) => u.name.split(' ')[0]).join(', ')
          : undefined;

  const inspector = threadId ? (
    <ThreadPanel conv={conv} parentId={threadId} focusMsg={focusId} onClose={() => setParam('thread', null)} onAction={onAction} onDialog={onDialog} />
  ) : detailsTab ? (
    <DetailsPanel conv={conv} tab={detailsTab} onTab={(t) => setParam('details', t)} onClose={() => setParam('details', null)} />
  ) : null;

  return (
    <>
      <NeoHead
        className="pc-head"
        icon={isMobile ? undefined : <ConvIcon conv={conv} viewerId={v?.user.id} size={conv.kind === 'channel' ? 26 : 34} presence />}
        eyebrow={eyebrow}
        title={
          isMobile ? (
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="neo-iconbtn" onClick={() => navigate('/chat')} aria-label="Back to conversations" data-qa="back">
                <ArrowLeft />
              </button>
              <span className="truncate">{conv.kind === 'channel' ? `#${title}` : title}</span>
            </span>
          ) : conv.kind === 'channel' ? (
            `#${title}`
          ) : (
            title
          )
        }
        sub={
          sub ? (
            <button type="button" className="pc-topic" onClick={() => setParam('details', 'about')} title={sub}>
              {sub}
            </button>
          ) : undefined
        }
        onToggleSide={isMobile ? undefined : shell.toggleSide}
        actions={
          <>
            {conv.kind !== 'app' && (
              <button
                type="button"
                className={cx('neo-btn neo-btn--sm pc-huddle-btn', huddle ? (inThisHuddle ? 'neo-btn--soft is-in' : 'neo-btn--plasma is-live') : 'neo-btn--soft')}
                onClick={() => (inThisHuddle ? useChatUI.getState().setHuddle((h) => ({ ...h, mode: 'panel' })) : joinHuddle(conv.id))}
                data-qa="huddle-btn"
                data-tip={huddle ? undefined : 'Start a huddle (H)'}
              >
                {huddle ? <AudioLines /> : <Headphones />}
                <span className="neo-btn__label">{huddle ? (inThisHuddle ? 'In huddle' : `Join · ${huddle.participantIds.length}`) : 'Huddle'}</span>
              </button>
            )}
            {conv.kind !== 'dm' && conv.kind !== 'app' && (
              <button type="button" className="pc-members-btn" onClick={() => setParam('details', 'members')} aria-label={`${members.length} members`} data-qa="members-btn">
                <Avatars users={memberUsers} max={3} size={24} />
                <span className="neo-num">{members.length}</span>
              </button>
            )}
            <button type="button" className={cx('neo-iconbtn', detailsTab && 'is-on')} onClick={toggleDetails} aria-label="Conversation details" data-tip="Details ( ] )" data-qa="details-btn">
              <Info />
            </button>
            <NeoMenu
              items={more}
              width={240}
              label="Conversation menu"
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />

      {(huddle && !inThisHuddle) || pinnedLatest || conv.linked ? (
        <div className="pc-strip">
          {huddle && !inThisHuddle && (
            <button type="button" className="pc-strip__huddle" onClick={() => joinHuddle(conv.id)} data-qa="huddle-banner">
              <span className="pc-live-row__wave" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="truncate">
                <strong>Huddle live</strong> · {huddle.participantIds.map(names.first).join(', ')}
              </span>
              <span className="pc-strip__cta">Join</span>
            </button>
          )}
          {pinnedLatest && (
            <button type="button" className="pc-strip__pin" onClick={() => setParam('details', 'pinned')}>
              <Pin />
              <span className="neo-hud">{conv.pinnedIds.length} pinned</span>
              <span className="truncate neo-muted">{(pinnedLatest.text || pinnedLatest.card?.title || pinnedLatest.poll?.question || '').replace(/[*_`>#]/g, '').slice(0, 120)}</span>
            </button>
          )}
          {conv.linked && (
            <Link to={conv.linked.to} className="pc-strip__link">
              <ExternalLink /> {conv.linked.label}
            </Link>
          )}
        </div>
      ) : null}

      <div className={cx('pc-body', inspector && 'neo-split')}>
        <div className="pc-main">
          <MessageList conv={conv} readMark={readMark} focusId={focusId} onReply={openThread} onAction={onAction} onAtBottom={(b) => (atBottomRef.current = b, b && useChat.getState().markRead(conv.id))} />
          {undo && (
            <div className="pc-undo" role="status">
              <span>Message deleted</span>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={doUndo} data-qa="undo">
                <Undo2 /> Undo
              </button>
            </div>
          )}
          <Composer conv={conv} autoFocus onDialog={onDialog} onHuddle={() => joinHuddle(conv.id)} />
        </div>
        {inspector && <aside className="neo-inspector pc-inspector">{inspector}</aside>}
      </div>

      <PollDialog open={dialog?.kind === 'poll'} onClose={() => setDialog(null)} conv={conv} prefill={dialog?.kind === 'poll' ? dialog : undefined} />
      <KudosDialog open={dialog?.kind === 'kudos'} onClose={() => setDialog(null)} conv={conv} prefill={dialog?.kind === 'kudos' ? dialog : undefined} />
      <StandupDialog open={dialog?.kind === 'standup'} onClose={() => setDialog(null)} conv={conv} />
      <DrivePickerDialog open={dialog?.kind === 'drive'} onClose={() => setDialog(null)} onPick={(f) => attachRef.current?.(f)} />
      <ForwardDialog open={msgAction?.kind === 'forward'} onClose={() => setMsgAction(null)} message={msgAction?.kind === 'forward' ? msgAction.m : null} />
      <TaskDialog open={msgAction?.kind === 'task'} onClose={() => setMsgAction(null)} message={msgAction?.kind === 'task' ? msgAction.m : null} conv={conv} />
      <TicketDialog open={msgAction?.kind === 'ticket'} onClose={() => setMsgAction(null)} message={msgAction?.kind === 'ticket' ? msgAction.m : null} conv={conv} />
      <SparkDialog open={sparkOpen} onClose={() => setSparkOpen(false)} />
    </>
  );
}
