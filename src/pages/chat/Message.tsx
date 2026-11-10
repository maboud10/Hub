/**
 * A single chat message: header, markdown body, rich cards, reactions, thread summary,
 * hover toolbar + right-click menu, inline editing, read receipts and send effects.
 */
import { memo, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  AlarmClock,
  AudioLines,
  Bookmark,
  BookmarkCheck,
  ClipboardCopy,
  EyeOff,
  Forward,
  Gavel,
  Link2,
  LifeBuoy,
  MessageSquareReply,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Sparkles,
  Target,
  Trash2,
  Wand2,
} from 'lucide-react';
import { NeoMenu, NeoPopover, useContextMenu, type MenuEntry } from '@/components/neo';
import { cx } from '@/lib/cx';
import { formatDateTime, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useToasts } from '@/store/toast';
import { canEditMessage, canPin, deleteMode, isMember } from '@/chat/access';
import { DEFAULT_QUICK_REACTIONS, SEND_EFFECTS } from '@/chat/constants';
import { emojiName } from '@/chat/emoji';
import { isBotId } from '@/chat/ids';
import { isEmojiOnly, mentions } from '@/chat/markdown';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation } from '@/chat/types';
import {
  AppCard,
  AttachmentsView,
  CelebrationCard,
  CoffeeMatchCard,
  DecisionCard,
  DriveFileCard,
  ForwardedView,
  HuddleRecapCard,
  KudosCard,
  PollCard,
  SparkAnswer,
  StandupCard,
  VoiceCard,
} from './Cards';
import { EmojiPopover } from './EmojiPicker';
import { playEffect } from './effects';
import { useNames, usePerson, useViewer } from './hooks';
import { AuthorAvatar, fmtTime, Md, ProfileCard } from './parts';
import { useChatUI } from './ui';

export type MessageAction = 'task' | 'ticket' | 'forward';

export interface MessageProps {
  m: ChatMessage;
  conv: Conversation;
  grouped?: boolean;
  replies?: ChatMessage[];
  inThread?: boolean;
  highlight?: boolean;
  seen?: boolean;
  threadUnread?: boolean;
  onReply?: (m: ChatMessage) => void;
  onAction?: (kind: MessageAction, m: ChatMessage) => void;
}

const MIN = 60_000;

function remindAt(kind: '20m' | '1h' | 'tomorrow') {
  if (kind === '20m') return Date.now() + 20 * MIN;
  if (kind === '1h') return Date.now() + 60 * MIN;
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function EditBox({ m, onDone }: { m: ChatMessage; onDone: () => void }) {
  const [text, setText] = useState(m.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(240, el.scrollHeight)}px`;
  }, []);
  const save = () => {
    const res = useChat.getState().editMessage(m.id, text);
    if (!res.ok) return toast.error(res.error);
    onDone();
  };
  return (
    <div className="pc-edit">
      <textarea
        ref={ref}
        className="neo-textarea pc-edit__input"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(240, e.target.scrollHeight)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
        aria-label="Edit message"
        rows={1}
      />
      <div className="pc-edit__bar">
        <span className="neo-faint text-xs">
          Enter to save · Esc to cancel
        </span>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

function Reactions({ m, conv }: { m: ChatMessage; conv: Conversation }) {
  const v = useViewer();
  const names = useNames();
  const [pick, setPick] = useState(false);
  const add = useRef<HTMLButtonElement>(null);
  const entries = Object.entries(m.reactions).filter(([, u]) => u.length);
  if (!entries.length) return null;
  const member = !!v && isMember(conv, v.user.id);
  const toggle = (e: string) => {
    const res = useChat.getState().toggleReaction(m.id, e);
    if (!res.ok) toast.error(res.error);
  };
  return (
    <div className="pc-reactions">
      {entries.map(([emoji, users]) => {
        const mine = !!v && users.includes(v.user.id);
        const who = users.map((u) => (u === v?.user.id ? 'You' : names.first(u)));
        const tip = `${who.length > 3 ? `${who.slice(0, 3).join(', ')} and ${who.length - 3} others` : who.join(who.length === 2 ? ' and ' : ', ')} reacted with :${emojiName(emoji)}:`;
        return (
          <button key={emoji} type="button" className={cx('pc-react', mine && 'is-mine')} onClick={() => toggle(emoji)} data-tip={tip} aria-pressed={mine} aria-label={tip} disabled={!member}>
            <span className="pc-react__e">{emoji}</span>
            <span className="pc-react__n">{users.length}</span>
          </button>
        );
      })}
      {member && (
        <>
          <button ref={add} type="button" className="pc-react pc-react--add" onClick={() => setPick(true)} aria-label="Add reaction">
            <SmilePlus />
          </button>
          <EmojiPopover open={pick} anchor={add.current} onClose={() => setPick(false)} onPick={toggle} placement="bottom-start" />
        </>
      )}
    </div>
  );
}

function ThreadSummary({ replies, unread, onOpen }: { replies: ChatMessage[]; unread?: boolean; onOpen: () => void }) {
  const names = useNames();
  const live = replies.filter((r) => !r.deleted);
  if (!live.length) return null;
  const people = [...new Set(live.map((r) => r.authorId).reverse())].slice(0, 3);
  const last = live[live.length - 1];
  return (
    <button type="button" className={cx('pc-threadsum', unread && 'is-unread')} onClick={(e) => (e.stopPropagation(), onOpen())} data-qa="thread-summary">
      <span className="pc-threadsum__avatars">
        {people.map((id) => (
          <AuthorAvatar key={id} id={id} size={20} names={names} />
        ))}
      </span>
      <span className="pc-threadsum__count">
        {live.length} {live.length === 1 ? 'reply' : 'replies'}
      </span>
      <span className="pc-threadsum__last">Last reply {relativeTime(last.at)}</span>
      <span className="pc-threadsum__view">View thread</span>
      {unread && <span className="pc-unread-dot" aria-label="New replies" />}
    </button>
  );
}

function AuthorName({ id, via }: { id: string; via?: string }) {
  const names = useNames();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const person = !isBotId(id) && id !== 'system';
  return (
    <>
      <button ref={ref} type="button" className="pc-msg__name" onClick={(e) => (e.stopPropagation(), person && setOpen((o) => !o))} disabled={!person}>
        {names.name(id)}
      </button>
      {!person && <span className="pc-apptag">App</span>}
      {via && <span className="pc-msg__via">via {names.first(via)}</span>}
      {person && (
        <NeoPopover open={open} anchor={ref.current} onClose={() => setOpen(false)} width={300} label="Profile" autoFocus={false}>
          <ProfileCard userId={id} onClose={() => setOpen(false)} />
        </NeoPopover>
      )}
    </>
  );
}

function SystemLine({ m, conv }: { m: ChatMessage; conv: Conversation }) {
  const names = useNames();
  const huddleLive = useChat((s) => !!s.huddles[conv.id]);
  return (
    <div className={cx('pc-sys', m.system === 'huddle-start' && 'is-huddle')} id={`msg-${m.id}`} data-msg={m.id}>
      <AuthorAvatar id={m.authorId} size={20} names={names} />
      {m.system === 'huddle-start' && <AudioLines className="pc-sys__icon" />}
      <span className="pc-sys__text">
        <strong>{names.name(m.authorId)}</strong> <Md text={m.text} className="pc-md--inline" />
      </span>
      <span className="pc-sys__time" title={formatDateTime(m.at)}>
        {fmtTime(m.at)}
      </span>
      {m.system === 'huddle-start' && huddleLive && (
        <a className="neo-btn neo-btn--soft neo-btn--xs" href={`?huddle=1`} onClick={(e) => (e.preventDefault(), window.dispatchEvent(new CustomEvent('pc:join-huddle', { detail: conv.id })))}>
          Join
        </a>
      )}
    </div>
  );
}

export const Message = memo(function Message({ m, conv, grouped, replies, inThread, highlight, seen, threadUnread, onReply, onAction }: MessageProps) {
  const v = useViewer();
  const person = usePerson();
  const editing = useChatUI((s) => s.editingId === m.id);
  const ref = useRef<HTMLDivElement>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const pickBtn = useRef<HTMLButtonElement>(null);
  const ctx = useContextMenu();

  // Send-with-effect: play once for everyone viewing while it's fresh.
  useEffect(() => {
    if (!m.effect || !ref.current) return;
    const ui = useChatUI.getState();
    const key = `${v?.user.id}:${m.id}`;
    if (ui.played[key] || Date.now() - m.at > 10 * MIN) return;
    ui.markPlayed(key);
    const el = ref.current;
    const t = window.setTimeout(() => playEffect(m.effect!, el), 120);
    return () => window.clearTimeout(t);
  }, [m.effect, m.id, m.at, v?.user.id]);

  if (m.system) return <SystemLine m={m} conv={conv} />;

  const me = v?.user.id;
  const saved = person.saved.some((s) => s.messageId === m.id);
  const pinned = conv.pinnedIds.includes(m.id);
  const member = !!v && isMember(conv, v.user.id);
  const mentioned = !!v && m.authorId !== me && mentions(m.text, v.handle, false);
  const broadcast = !mentioned && !!v && m.authorId !== me && conv.kind === 'channel' && /(^|\s)@(here|channel|everyone)\b/.test(m.text);
  const quick = (person.emojiRecents.length >= 3 ? person.emojiRecents.slice(0, 3) : DEFAULT_QUICK_REACTIONS).slice(0, 3);
  const s = useChat.getState;

  const react = (e: string) => {
    const res = s().toggleReaction(m.id, e);
    if (!res.ok) toast.error(res.error);
  };
  const copyLink = () => {
    const url = `${location.origin}/chat/c/${conv.id}?${m.parentId ? `thread=${m.parentId}&` : ''}msg=${m.id}`;
    void navigator.clipboard?.writeText(url).then(() => toast.success('Link copied')).catch(() => toast.info('Link', url));
  };
  const del = () => {
    const res = s().deleteMessage(m.id);
    if (!res.ok) return toast.error(res.error);
    if (res.mode === 'own') {
      const id = useToasts.getState().push({ kind: 'info', title: 'Message deleted', description: 'Press ⌘Z or click Undo in the conversation bar to restore it.' }, 6000);
      window.dispatchEvent(new CustomEvent('pc:undo-delete', { detail: { original: res.original, toastId: id } }));
    } else toast.warning('Message removed', 'Moderation action recorded in the audit log.');
  };

  const mode = v ? deleteMode(m, conv, v.viewer) : null;
  const canEdit = !!v && canEditMessage(m, v.viewer) && !m.poll && !m.kudos;
  const menu: MenuEntry[] = [
    ...(canEdit ? [{ label: 'Edit message', icon: <Pencil />, hint: 'E', onSelect: () => useChatUI.getState().setEditing(m.id) }] : []),
    { label: saved ? 'Remove from saved' : 'Save for later', icon: saved ? <BookmarkCheck /> : <Bookmark />, onSelect: () => toast.result(s().toggleSave(m.id), saved ? 'Removed from saved' : 'Saved for later') },
    { kind: 'label', label: 'Remind me' },
    { label: 'In 20 minutes', icon: <AlarmClock />, onSelect: () => toast.result(s().setReminder(m.id, remindAt('20m')), 'Reminder set for 20 minutes') },
    { label: 'In 1 hour', icon: <AlarmClock />, onSelect: () => toast.result(s().setReminder(m.id, remindAt('1h')), 'Reminder set for 1 hour') },
    { label: 'Tomorrow at 9:00', icon: <AlarmClock />, onSelect: () => toast.result(s().setReminder(m.id, remindAt('tomorrow')), 'Reminder set for tomorrow 9:00') },
    { kind: 'sep' },
    ...(v && canPin(conv, v.viewer) && !m.parentId ? [{ label: pinned ? 'Unpin' : 'Pin to conversation', icon: pinned ? <PinOff /> : <Pin />, onSelect: () => toast.result(s().togglePin(m.id), pinned ? 'Unpinned' : 'Pinned') }] : []),
    { label: 'Copy link', icon: <Link2 />, onSelect: copyLink },
    { label: 'Copy text', icon: <ClipboardCopy />, disabled: !m.text, onSelect: () => void navigator.clipboard?.writeText(m.text).then(() => toast.success('Copied')).catch(() => undefined) },
    ...(!m.parentId ? [{ label: 'Mark unread', icon: <EyeOff />, onSelect: () => s().markUnread(conv.id, m.id) }] : []),
    { kind: 'sep' },
    { label: 'Create task…', icon: <Target />, onSelect: () => onAction?.('task', m) },
    { label: 'Report to IT…', icon: <LifeBuoy />, onSelect: () => onAction?.('ticket', m) },
    ...(member && !m.decision && m.text
      ? [
          {
            label: 'Log as decision',
            icon: <Gavel />,
            onSelect: () => {
              const r = s().logDecision(m.id);
              if (r.ok) toast.success('Decision logged');
              else toast.error(r.error);
            },
          },
        ]
      : []),
    ...(m.effect ? [{ label: `Replay ${SEND_EFFECTS.find((e) => e.id === m.effect)?.label ?? 'effect'}`, icon: <Wand2 />, onSelect: () => ref.current && playEffect(m.effect!, ref.current) }] : []),
    ...(mode ? [{ kind: 'sep' as const }, { label: mode === 'own' ? 'Delete message' : 'Delete (moderator)', icon: <Trash2 />, danger: true, onSelect: del }] : []),
  ];

  const onContext = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, input, textarea')) return;
    ctx.open(e, menu);
  };

  const bodyText = m.kudos || m.spark ? '' : m.text;
  const jumbo = !!bodyText && !m.card && !m.files && !m.attachments && isEmojiOnly(bodyText);

  return (
    <div
      ref={ref}
      id={`msg-${m.id}`}
      data-msg={m.id}
      className={cx('pc-msg', grouped && 'is-grouped', mentioned && 'is-mention', broadcast && 'is-broadcast', highlight && 'is-highlight', pinned && !inThread && 'is-pinned', m.deleted && 'is-deleted', editing && 'is-editing')}
      onContextMenu={m.deleted ? undefined : onContext}
      onDoubleClick={() => canEdit && useChatUI.getState().setEditing(m.id)}
    >
      {pinned && !inThread && !grouped && (
        <div className="pc-msg__pinned">
          <Pin /> Pinned
        </div>
      )}
      <div className="pc-msg__gutter">
        {grouped ? (
          <span className="pc-msg__hovertime" title={formatDateTime(m.at)}>
            {fmtTime(m.at)}
          </span>
        ) : (
          <AuthorAvatar id={m.authorId} size={38} />
        )}
      </div>
      <div className="pc-msg__main">
        {!grouped && (
          <div className="pc-msg__head">
            <AuthorName id={m.authorId} via={m.via} />
            <time className="pc-msg__time" dateTime={new Date(m.at).toISOString()} title={formatDateTime(m.at)}>
              {fmtTime(m.at)}
            </time>
            {m.effect && (
              <button type="button" className="pc-fxtag" onClick={() => ref.current && playEffect(m.effect!, ref.current)} data-tip="Replay effect" aria-label="Replay effect">
                <Sparkles />
              </button>
            )}
          </div>
        )}
        {m.deleted ? (
          <div className="pc-msg__deleted">This message was deleted.</div>
        ) : editing ? (
          <EditBox m={m} onDone={() => useChatUI.getState().setEditing(null)} />
        ) : (
          <>
            {m.forwarded && <ForwardedView m={m} />}
            {m.spark ? <SparkAnswer m={m} /> : bodyText ? <Md text={bodyText} className={cx(jumbo && 'is-jumbo')} /> : null}
            {m.editedAt && <span className="pc-edited">(edited)</span>}
            {m.attachments?.length ? <AttachmentsView list={m.attachments} /> : null}
            {m.files?.map((f) => <DriveFileCard key={f.id} file={f} />)}
            {m.card && <AppCard card={m.card} via={m.via} />}
            {m.poll && <PollCard m={m} conv={conv} />}
            {m.kudos && <KudosCard m={m} />}
            {m.standup && <StandupCard m={m} />}
            {m.celebration && <CelebrationCard m={m} />}
            {m.huddle && <HuddleRecapCard m={m} conv={conv} />}
            {m.voice && <VoiceCard m={m} />}
            {m.coffee && <CoffeeMatchCard m={m} />}
            {m.decision && <DecisionCard m={m} />}
            <Reactions m={m} conv={conv} />
            {!inThread && replies && replies.length > 0 && <ThreadSummary replies={replies} unread={threadUnread} onOpen={() => onReply?.(m)} />}
            {m.broadcast && !inThread && (
              <button type="button" className="pc-textbtn pc-broadcast" onClick={() => onReply?.({ ...m, id: m.parentId! })}>
                Replied to a thread
              </button>
            )}
            {seen && <span className="pc-seen">Seen</span>}
          </>
        )}
      </div>

      {!m.deleted && !editing && member && (
        <div className="pc-toolbar" role="toolbar" aria-label="Message actions" onClick={(e) => e.stopPropagation()}>
          {quick.map((e) => (
            <button key={e} type="button" className="pc-toolbar__btn pc-toolbar__emoji" onClick={() => react(e)} aria-label={`React with ${e}`}>
              {e}
            </button>
          ))}
          <button ref={pickBtn} type="button" className="pc-toolbar__btn" onClick={() => setPickOpen(true)} aria-label="Add reaction" data-tip="Add reaction">
            <SmilePlus />
          </button>
          {!inThread && !m.parentId && (
            <button type="button" className="pc-toolbar__btn" onClick={() => onReply?.(m)} aria-label="Reply in thread" data-tip="Reply in thread">
              <MessageSquareReply />
            </button>
          )}
          <button type="button" className={cx('pc-toolbar__btn', saved && 'is-on')} onClick={() => toast.result(s().toggleSave(m.id), saved ? 'Removed from saved' : 'Saved for later')} aria-label={saved ? 'Unsave' : 'Save for later'} data-tip={saved ? 'Saved' : 'Save for later'}>
            {saved ? <BookmarkCheck /> : <Bookmark />}
          </button>
          <button type="button" className="pc-toolbar__btn" onClick={() => onAction?.('forward', m)} aria-label="Share message" data-tip="Share">
            <Forward />
          </button>
          <NeoMenu
            items={menu}
            width={240}
            label="More actions"
            trigger={(p) => (
              <button {...p} type="button" className="pc-toolbar__btn" aria-label="More actions" data-qa="msg-more">
                <MoreHorizontal />
              </button>
            )}
          />
          <EmojiPopover open={pickOpen} anchor={pickBtn.current} onClose={() => setPickOpen(false)} onPick={react} placement="bottom-end" />
        </div>
      )}
      {ctx.element}
    </div>
  );
});
