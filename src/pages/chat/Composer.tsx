/**
 * Pulse Chat composer: auto-growing textarea with formatting toolbar, emoji picker, `@` / `#` / `:` / `/`
 * autocomplete, slash commands, uploads (+ paste / drop), Helix Drive files, voice notes, Nova smart replies,
 * send-with-effect, schedule send, per-conversation drafts and ↑ to edit your last message.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  AtSign,
  Bold,
  CalendarClock,
  ChevronDown,
  Code2,
  FileUp,
  HardDrive,
  Hash,
  Headphones,
  Italic,
  Link2,
  List,
  ListOrdered,
  Mic,
  Plus,
  Quote,
  SendHorizontal,
  Slash,
  Smile,
  SquareCode,
  Strikethrough,
  Trophy,
  Type,
  Vote,
  X,
  ClipboardList,
  Sparkles,
  Square,
} from 'lucide-react';
import { NeoMenu, NovaChip, Typing, type MenuEntry } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { uid } from '@/lib/id';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { canGiveKudos, canPost, canView } from '@/chat/access';
import { SEND_EFFECTS } from '@/chat/constants';
import { searchEmoji } from '@/chat/emoji';
import { dmId, wavePeaks } from '@/chat/ids';
import { smartReplies } from '@/chat/nova';
import { matchSlash, parseSlash, type SlashCommandDef } from '@/chat/slash';
import { indexMessages } from '@/chat/selectors';
import { useChat } from '@/chat/store';
import type { Attachment, ChatMessage, Conversation, DriveFileRef, SendEffect } from '@/chat/types';
import { createTaskQuick, raiseTicket } from './actions';
import { EmojiPopover } from './EmojiPicker';
import { useNames, usePerson, useTyping, useViewer } from './hooks';
import { bytes, ConvIcon, fileIcon, FILE_TONE } from './parts';
import { useChatUI } from './ui';

export type ComposerDialog = { kind: 'poll'; question?: string; options?: string[] } | { kind: 'kudos'; toId?: string; message?: string; value?: string } | { kind: 'standup' } | { kind: 'drive' };

interface Suggest {
  kind: 'mention' | 'channel' | 'emoji' | 'slash';
  start: number;
  items: { id: string; label: string; sub?: string; insert: string; icon?: React.ReactNode }[];
  index: number;
}

interface ComposerProps {
  conv: Conversation;
  parentId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onDialog: (d: ComposerDialog, attach?: (f: DriveFileRef) => void) => void;
  onHuddle: () => void;
}

/** Downscale an image file to a compact JPEG data URL. */
async function toPreview(file: File): Promise<{ preview: string; width: number; height: number } | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
    return { preview: canvas.toDataURL('image/jpeg', 0.74), width: w, height: h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function laterToday(): number | null {
  const d = new Date();
  if (d.getHours() >= 16) return null;
  d.setHours(17, 0, 0, 0);
  return d.getTime();
}
function tomorrowAt9(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export function Composer({ conv, parentId, placeholder, autoFocus, onDialog, onHuddle }: ComposerProps) {
  const v = useViewer();
  const names = useNames();
  const person = usePerson();
  const users = useHub((s) => s.users);
  const conversations = useChat((s) => s.conversations);
  const messages = useChat((s) => s.messages);
  const scheduled = useChat((s) => s.scheduled);
  const focusTick = useChatUI((s) => s.focusTick);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const draftKey = parentId ? `thread:${parentId}` : conv.id;
  const [text, setText] = useState(() => person.drafts[draftKey] ?? '');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<DriveFileRef[]>([]);
  const [fmt, setFmt] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState<{ start: number } | null>(null);
  const [recTick, setRecTick] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const typing = useTyping(conv.id, v?.user.id);

  const gate = v ? canPost(conv, v.viewer) : { ok: false as const, reason: 'Sign in to chat.' };

  // drafts: debounce + flush on unmount
  useEffect(() => {
    const t = window.setTimeout(() => useChat.getState().setDraft(draftKey, text), 400);
    return () => window.clearTimeout(t);
  }, [text, draftKey]);
  useEffect(() => () => useChat.getState().setDraft(draftKey, textRef.current), [draftKey]);

  const grow = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, isMobile ? 140 : 260)}px`;
  }, [isMobile]);
  useEffect(grow, [text, grow]);

  useEffect(() => {
    if (autoFocus && !isMobile) ta.current?.focus({ preventScroll: true });
  }, [autoFocus, isMobile, conv.id]);
  useEffect(() => {
    if (focusTick && !parentId) ta.current?.focus();
  }, [focusTick, parentId]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecTick((t) => t + 1), 120);
    return () => window.clearInterval(id);
  }, [recording]);

  const mySched = useMemo(() => scheduled.filter((s) => s.convId === conv.id && s.authorId === v?.user.id && (s.parentId ?? undefined) === parentId), [scheduled, conv.id, v, parentId]);

  const lastIncoming = useMemo(() => {
    if (parentId || conv.kind === 'channel' || conv.kind === 'app') return null;
    const list = indexMessages(messages).byConv.get(conv.id) ?? [];
    const last = list[list.length - 1];
    if (!last || last.authorId === v?.user.id || last.system || last.deleted || !last.text || Date.now() - last.at > 36 * 3_600_000) return null;
    return last;
  }, [messages, conv.id, conv.kind, parentId, v]);
  const replies = lastIncoming && !text && !atts.length ? smartReplies(lastIncoming.text) : [];

  /* ---------------- autocomplete ---------------- */
  const computeSuggest = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    if (!parentId && /^\/[a-z]*$/i.test(before)) {
      const cmds = matchSlash(before);
      return cmds.length
        ? ({ kind: 'slash', start: 0, index: 0, items: cmds.map((c: SlashCommandDef) => ({ id: c.name, label: `/${c.name}`, sub: c.description, insert: `/${c.name} `, icon: <Slash /> })) } satisfies Suggest)
        : null;
    }
    let m = /(^|\s)@([\w.-]{0,30})$/.exec(before);
    if (m) {
      const q = m[2].toLowerCase();
      const pool = users.filter((u) => u.active && u.id !== v?.user.id);
      const ranked = pool
        .map((u) => {
          const h = names.handle(u.id) ?? '';
          const member = conv.memberIds.includes(u.id);
          const hit = !q || h.startsWith(q) || u.name.toLowerCase().includes(q);
          return { u, h, member, hit };
        })
        .filter((x) => x.hit)
        .sort((a, b) => Number(b.member) - Number(a.member) || a.u.name.localeCompare(b.u.name))
        .slice(0, 7);
      const items: Suggest['items'] = ranked.map((x) => ({ id: x.u.id, label: x.u.name, sub: `@${x.h} · ${x.member ? 'in this conversation' : x.u.title}`, insert: `@${x.h} `, icon: <Avatar user={x.u} size={22} presence /> }));
      if (conv.kind === 'channel')
        for (const sp of ['here', 'channel'])
          if (sp.startsWith(q)) items.push({ id: sp, label: `@${sp}`, sub: sp === 'here' ? 'Notify everyone online' : 'Notify everyone in this channel', insert: `@${sp} `, icon: <AtSign /> });
      return items.length ? ({ kind: 'mention', start: before.length - m[2].length - 1, index: 0, items } satisfies Suggest) : null;
    }
    m = /(^|\s)#([\w-]{0,30})$/.exec(before);
    if (m && v) {
      const q = m[2].toLowerCase();
      const items = conversations
        .filter((c) => c.kind === 'channel' && canView(c, v.viewer) && c.name.includes(q))
        .sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, 7)
        .map((c) => ({ id: c.id, label: `#${c.name}`, sub: c.topic, insert: `#${c.name} `, icon: <ConvIcon conv={c} size={20} /> }));
      return items.length ? ({ kind: 'channel', start: before.length - m[2].length - 1, index: 0, items } satisfies Suggest) : null;
    }
    m = /(^|\s):([a-z0-9_+-]{2,30})$/i.exec(before);
    if (m) {
      const items = searchEmoji(m[2], 8).map((e) => ({ id: e.code, label: `:${e.code}:`, insert: `${e.e} `, icon: <span className="pc-ac__emoji">{e.e}</span> }));
      return items.length ? ({ kind: 'emoji', start: before.length - m[2].length - 1, index: 0, items } satisfies Suggest) : null;
    }
    return null;
  };

  const refreshSuggest = (value: string) => {
    const caret = ta.current?.selectionStart ?? value.length;
    setSuggest(computeSuggest(value, caret));
  };

  const applySuggest = (item: Suggest['items'][number]) => {
    if (!suggest) return;
    const caret = ta.current?.selectionStart ?? text.length;
    const next = text.slice(0, suggest.start) + item.insert + text.slice(caret);
    setText(next);
    setSuggest(null);
    const pos = suggest.start + item.insert.length;
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(pos, pos);
    });
  };

  /* ---------------- formatting ---------------- */
  const wrap = (before: string, after = before, placeholderText = 'text') => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = text.slice(s, e) || placeholderText;
    const next = text.slice(0, s) + before + sel + after + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const prefixLines = (prefix: (i: number) => string) => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    const block = text.slice(lineStart, e) || '';
    const lines = block.split('\n').map((l, i) => `${prefix(i)}${l}`);
    const next = text.slice(0, lineStart) + lines.join('\n') + text.slice(e);
    setText(next);
    requestAnimationFrame(() => el.focus());
  };
  const FORMATS: { label: string; icon: React.ReactNode; run: () => void; kbd?: string }[] = [
    { label: 'Bold', icon: <Bold />, run: () => wrap('**'), kbd: '⌘B' },
    { label: 'Italic', icon: <Italic />, run: () => wrap('_'), kbd: '⌘I' },
    { label: 'Strikethrough', icon: <Strikethrough />, run: () => wrap('~~') },
    { label: 'Code', icon: <Code2 />, run: () => wrap('`', '`', 'code') },
    { label: 'Link', icon: <Link2 />, run: () => wrap('[', '](https://)', 'link text') },
    { label: 'Quote', icon: <Quote />, run: () => prefixLines(() => '> ') },
    { label: 'Bulleted list', icon: <List />, run: () => prefixLines(() => '- ') },
    { label: 'Numbered list', icon: <ListOrdered />, run: () => prefixLines((i) => `${i + 1}. `) },
    { label: 'Code block', icon: <SquareCode />, run: () => wrap('```\n', '\n```', 'code') },
  ];

  /* ---------------- attachments ---------------- */
  const addFiles = async (list: FileList | File[]) => {
    const arr = [...list].slice(0, 6);
    const next: Attachment[] = [];
    for (const f of arr) {
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`${f.name} is larger than 25 MB`);
        continue;
      }
      const p = await toPreview(f);
      next.push({ id: uid('att'), name: f.name, mime: f.type || 'application/octet-stream', size: f.size, ...(p ?? {}) });
    }
    if (next.length) setAtts((a) => [...a, ...next].slice(0, 8));
  };
  const onPaste = (e: ClipboardEvent) => {
    const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      void addFiles(imgs);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  /* ---------------- sending ---------------- */
  const reset = () => {
    setText('');
    setAtts([]);
    setFiles([]);
    setSuggest(null);
    setBroadcast(false);
    useChat.getState().setDraft(draftKey, '');
  };

  const runSlash = (raw: string): boolean => {
    const cmd = parseSlash(raw);
    if (!cmd) return false;
    const s = useChat.getState();
    switch (cmd.cmd) {
      case 'poll':
        if (cmd.question && cmd.options.length >= 2) {
          const r = s.createPoll(conv.id, { question: cmd.question, options: cmd.options, multi: cmd.multi, anonymous: cmd.anonymous });
          if (!r.ok) toast.error(r.error);
        } else onDialog({ kind: 'poll', question: cmd.question, options: cmd.options });
        break;
      case 'kudos': {
        const toId = cmd.handle ? users.find((u) => names.handle(u.id) === cmd.handle)?.id : undefined;
        if (toId && cmd.message.length >= 5) {
          const r = s.sendKudos({ convId: conv.id, toId, value: cmd.value ?? 'teamwork', message: cmd.message });
          if (!r.ok) toast.error(r.error);
          else toast.success(`Kudos sent to ${names.first(toId)}! 🎉`, 'Also added to the Hub kudos wall.');
        } else onDialog({ kind: 'kudos', toId, message: cmd.message, value: cmd.value });
        break;
      }
      case 'standup':
        onDialog({ kind: 'standup' });
        break;
      case 'huddle':
        onHuddle();
        break;
      case 'spark':
        if (cmd.answer) {
          const r = s.answerSpark(cmd.answer);
          if (r.ok) toast.success('Spark shared ✨', 'Posted to #watercooler');
          else toast.error(r.error);
        } else navigate('/chat/pulse#spark');
        break;
      case 'coffee':
        navigate('/chat/pulse?spin=1');
        break;
      case 'remind': {
        if (!cmd.at) {
          toast.info('When should I remind you?', 'Try “/remind in 20m stretch” or “/remind tomorrow review the deck”.');
          return true;
        }
        if (!v) return true;
        const novaId = dmId(['bot-nova', v.user.id]);
        if (!s.conversations.some((c) => c.id === novaId)) s.ensureConversation(novaId);
        const note = s.botPost(novaId, 'bot-nova', `⏰ Reminder set for **${cmd.when}**: ${cmd.text || 'check back on this conversation'}${conv.kind === 'channel' ? ` (from #${conv.name})` : ''}`);
        if (note) {
          s.setReminder(note.id, cmd.at);
          s.markRead(novaId);
        }
        toast.success('Reminder set', `${cmd.when} · ${cmd.text || 'check back'}`);
        break;
      }
      case 'task':
        if (!cmd.title) {
          toast.info('Give the task a title', 'e.g. /task Update the release notes');
          return true;
        }
        void createTaskQuick(cmd.title, conv);
        break;
      case 'ticket':
        if (!cmd.subject) {
          toast.info('Describe the problem', 'e.g. /ticket VPN keeps dropping in Singapore');
          return true;
        }
        void raiseTicket({ subject: cmd.subject, conv });
        break;
      case 'status': {
        const p = cmd.presence ?? v?.user.presence ?? 'online';
        const r = s.setStatus(p, cmd.message);
        if (r.ok) toast.success('Status updated', cmd.message || undefined);
        break;
      }
      case 'shrug': {
        const r = s.send(conv.id, { text: cmd.text, parentId, broadcast });
        if (!r.ok) toast.error(r.error);
        break;
      }
      case 'unknown':
        toast.error(`Unknown command /${cmd.name}`, 'Type / to see what’s available.');
        return true;
    }
    reset();
    return true;
  };

  const send = (effect?: SendEffect) => {
    const body = text.trim();
    if (!body && !atts.length && !files.length) return;
    if (body.startsWith('/') && !atts.length && !files.length && runSlash(body)) return;
    const res = useChat.getState().send(conv.id, { text: body, parentId, broadcast: parentId ? broadcast : undefined, attachments: atts, files, effect });
    if (!res.ok) return toast.error(res.error);
    reset();
    requestAnimationFrame(() => ta.current?.focus({ preventScroll: true }));
  };

  const schedule = (at: number) => {
    const body = text.trim();
    if (!body) return toast.info('Write the message first, then schedule it.');
    if (atts.length || files.length) return toast.info('Scheduled messages can’t include attachments yet.');
    const res = useChat.getState().schedule(conv.id, body, at, { parentId });
    if (!res.ok) return toast.error(res.error);
    reset();
    toast.success('Message scheduled', new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }));
  };

  const editLast = () => {
    if (!v) return false;
    const idx = indexMessages(useChat.getState().messages);
    const list = parentId ? (idx.threads.get(parentId) ?? []) : (idx.byConv.get(conv.id) ?? []);
    const mine = [...list].reverse().find((x: ChatMessage) => x.authorId === v.user.id && !x.deleted && !x.system && !x.poll && !x.kudos);
    if (!mine) return false;
    useChatUI.getState().setEditing(mine.id);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest((s) => (s ? { ...s, index: (s.index + d + s.items.length) % s.items.length } : s));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggest(suggest.items[suggest.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSuggest(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrap('**');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrap('_');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'ArrowUp' && !text && !e.altKey && !e.metaKey) {
      if (editLast()) e.preventDefault();
    }
  };

  /* ---------------- voice notes ---------------- */
  const stopRecording = (keep: boolean) => {
    if (!recording) return;
    const secs = Math.max(1, Math.round((Date.now() - recording.start) / 1000));
    setRecording(null);
    if (!keep) return;
    if (secs < 1) return;
    const id = uid('vn');
    const res = useChat.getState().send(conv.id, { text: '', parentId, voice: { durationSec: secs, peaks: wavePeaks(id, 40) } });
    if (!res.ok) toast.error(res.error);
  };

  if (!gate.ok) {
    const joinable = conv.kind === 'channel' && !conv.memberIds.includes(v?.user.id ?? '') && gate.reason.startsWith('Join');
    return (
      <div className="pc-composer-wrap">
        <div className="pc-locked" data-qa="composer-locked">
          {joinable ? (
            <>
              <span>
                You’re previewing <strong>#{conv.name}</strong>
              </span>
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => toast.result(useChat.getState().joinChannel(conv.id), `Joined #${conv.name}`)} data-qa="join-channel">
                Join channel
              </button>
            </>
          ) : (
            <span>{gate.reason}</span>
          )}
        </div>
      </div>
    );
  }

  const later = laterToday();
  const sendMenu: MenuEntry[] = [
    { kind: 'label', label: 'Send with effect' },
    ...SEND_EFFECTS.map((fx) => ({ label: fx.label, hint: fx.blurb, icon: <Sparkles />, onSelect: () => send(fx.id) })),
    { kind: 'sep' },
    { kind: 'label', label: 'Schedule' },
    { label: 'In 1 hour', icon: <CalendarClock />, onSelect: () => schedule(Date.now() + 3_600_000) },
    ...(later ? [{ label: 'Later today · 17:00', icon: <CalendarClock />, onSelect: () => schedule(later) }] : []),
    { label: 'Tomorrow · 09:00', icon: <CalendarClock />, onSelect: () => schedule(tomorrowAt9()) },
  ];
  const plusMenu: MenuEntry[] = [
    { label: 'Upload a file', icon: <FileUp />, onSelect: () => fileInput.current?.click() },
    { label: 'From Helix Drive', icon: <HardDrive />, onSelect: () => onDialog({ kind: 'drive' }, (f) => setFiles((x) => (x.some((y) => y.id === f.id) ? x : [...x, f]))) },
    { kind: 'sep' },
    ...(!parentId
      ? ([
          { label: 'Poll', icon: <Vote />, hint: '/poll', onSelect: () => onDialog({ kind: 'poll' }) },
          ...(v && canGiveKudos(v.viewer) ? [{ label: 'Kudos', icon: <Trophy />, hint: '/kudos', onSelect: () => onDialog({ kind: 'kudos' }) }] : []),
          { label: 'Standup', icon: <ClipboardList />, hint: '/standup', onSelect: () => onDialog({ kind: 'standup' }) },
          ...(conv.kind !== 'app' ? [{ label: 'Huddle', icon: <Headphones />, hint: '/huddle', onSelect: onHuddle }] : []),
        ] as MenuEntry[])
      : []),
    { label: 'Voice note', icon: <Mic />, onSelect: () => setRecording({ start: Date.now() }) },
  ];
  const canSend = !!text.trim() || atts.length > 0 || files.length > 0;
  const recSecs = recording ? Math.floor((Date.now() - recording.start) / 1000) : 0;

  return (
    <div className={cx('pc-composer-wrap', parentId && 'is-thread')}>
      <div className="pc-composer-above">
        {typing.length > 0 ? (
          <div className="pc-typing" aria-live="polite">
            <Typing label="Typing" />
            <span>
              <strong>{typing.map(names.first).join(', ')}</strong> {typing.length > 1 ? 'are' : 'is'} typing…
            </span>
          </div>
        ) : replies.length > 0 ? (
          <div className="pc-smart" aria-label="Suggested replies">
            <NovaChip>Quick replies</NovaChip>
            {replies.map((r) => (
              <button key={r} type="button" className="pc-smart__chip" onClick={() => toast.result(useChat.getState().send(conv.id, { text: r }) as { ok: true } | { ok: false; error: string }, 'Sent')} data-qa="smart-reply">
                {r}
              </button>
            ))}
          </div>
        ) : null}
        {mySched.length > 0 && (
          <div className="pc-sched">
            <CalendarClock />
            <span className="grow truncate">
              {mySched.length} scheduled · next {new Date(Math.min(...mySched.map((s) => s.deliverAt))).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}: “{mySched[0].text.slice(0, 60)}”
            </span>
            <button type="button" className="pc-textbtn" onClick={() => mySched[0] && toast.result(useChat.getState().cancelScheduled(mySched[0].id), 'Scheduled message cancelled')}>
              Cancel
            </button>
            <button
              type="button"
              className="pc-textbtn"
              onClick={() => {
                const s0 = mySched[0];
                if (!s0) return;
                useChat.getState().cancelScheduled(s0.id);
                const r = useChat.getState().send(conv.id, { text: s0.text, parentId: s0.parentId });
                if (!r.ok) toast.error(r.error);
              }}
            >
              Send now
            </button>
          </div>
        )}
      </div>

      <div className={cx('pc-composer', dragging && 'is-dragging', suggest && 'has-suggest')} onDragOver={(e) => (e.preventDefault(), setDragging(true))} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-qa="composer">
        {suggest && (
          <div className="pc-ac" role="listbox" aria-label="Suggestions">
            <div className="pc-ac__head neo-hud">{suggest.kind === 'slash' ? 'Commands' : suggest.kind === 'mention' ? 'People' : suggest.kind === 'channel' ? 'Channels' : 'Emoji'}</div>
            {suggest.items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                role="option"
                aria-selected={i === suggest.index}
                className={cx('pc-ac__item', i === suggest.index && 'is-active')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSuggest((s) => (s ? { ...s, index: i } : s))}
                onClick={() => applySuggest(it)}
              >
                <span className="pc-ac__icon">{it.icon}</span>
                <span className="pc-ac__label">{it.label}</span>
                {it.sub && <span className="pc-ac__sub truncate">{it.sub}</span>}
              </button>
            ))}
            <div className="pc-ac__foot neo-faint">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd> to navigate · <kbd className="kbd">Enter</kbd> to select · <kbd className="kbd">Esc</kbd> to dismiss
            </div>
          </div>
        )}

        {fmt && (
          <div className="pc-fmtbar" role="toolbar" aria-label="Formatting">
            {FORMATS.map((f) => (
              <button key={f.label} type="button" className="neo-iconbtn neo-iconbtn--sm" onMouseDown={(e) => e.preventDefault()} onClick={f.run} aria-label={f.label} data-tip={f.kbd ? `${f.label} ${f.kbd}` : f.label}>
                {f.icon}
              </button>
            ))}
          </div>
        )}

        {(atts.length > 0 || files.length > 0) && (
          <div className="pc-pending">
            {atts.map((a) => (
              <div key={a.id} className="pc-pending__item">
                {a.preview ? <img src={a.preview} alt="" /> : <span className="pc-pending__icon">{(() => { const I = fileIcon('doc'); return <I />; })()}</span>}
                <span className="pc-pending__name truncate">{a.name}</span>
                <span className="neo-faint text-xs">{bytes(a.size)}</span>
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))} aria-label={`Remove ${a.name}`}>
                  <X />
                </button>
              </div>
            ))}
            {files.map((f) => {
              const I = fileIcon(f.kind);
              return (
                <div key={f.id} className="pc-pending__item is-drive">
                  <span className="pc-pending__icon" style={{ color: FILE_TONE[f.kind] }}>
                    <I />
                  </span>
                  <span className="pc-pending__name truncate">{f.name}</span>
                  <span className="neo-faint text-xs">Drive</span>
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label={`Remove ${f.name}`}>
                    <X />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {recording ? (
          <div className="pc-rec" data-tick={recTick}>
            <span className="pc-rec__dot" />
            <span className="neo-mono">{`${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')}`}</span>
            <span className="pc-rec__wave" aria-hidden="true">
              {Array.from({ length: 28 }, (_, i) => (
                <i key={i} style={{ height: `${20 + Math.abs(Math.sin((recTick + i) * 0.9)) * 80}%` }} />
              ))}
            </span>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => stopRecording(false)}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => stopRecording(true)}>
              <Square /> Send voice note
            </button>
          </div>
        ) : (
          <textarea
            ref={ta}
            className="pc-composer__input"
            value={text}
            rows={1}
            placeholder={placeholder ?? (conv.kind === 'channel' ? `Message #${conv.name}` : 'Write a message…')}
            aria-label={placeholder ?? 'Message'}
            onChange={(e) => {
              setText(e.target.value);
              refreshSuggest(e.target.value);
            }}
            onClick={() => refreshSuggest(text)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => window.setTimeout(() => setSuggest(null), 120)}
            data-qa="composer-input"
          />
        )}

        <div className="pc-composer__bar">
          <NeoMenu
            items={plusMenu}
            placement="top-start"
            width={240}
            label="Add to message"
            trigger={(p) => (
              <button {...p} type="button" className="neo-iconbtn pc-plus" aria-label="Add files, polls and more" data-qa="composer-plus">
                <Plus />
              </button>
            )}
          />
          <button type="button" className={cx('neo-iconbtn', fmt && 'is-on')} onClick={() => setFmt((f) => !f)} aria-label="Formatting" aria-pressed={fmt} data-tip="Formatting">
            <Type />
          </button>
          <button ref={emojiBtn} type="button" className={cx('neo-iconbtn', emoji && 'is-on')} onClick={() => setEmoji(true)} aria-label="Emoji" data-tip="Emoji">
            <Smile />
          </button>
          <button
            type="button"
            className="neo-iconbtn pc-hide-sm"
            onClick={() => {
              const next = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@`;
              setText(next);
              requestAnimationFrame(() => {
                ta.current?.focus();
                ta.current?.setSelectionRange(next.length, next.length);
                setSuggest(computeSuggest(next, next.length));
              });
            }}
            aria-label="Mention someone"
            data-tip="Mention"
          >
            <AtSign />
          </button>
          {!parentId && (
            <button
              type="button"
              className="neo-iconbtn pc-hide-sm"
              onClick={() => {
                setText('/');
                requestAnimationFrame(() => {
                  ta.current?.focus();
                  setSuggest(computeSuggest('/', 1));
                });
              }}
              aria-label="Slash commands"
              data-tip="Commands"
            >
              <Slash />
            </button>
          )}
          <button type="button" className="neo-iconbtn pc-hide-sm" onClick={() => setRecording({ start: Date.now() })} aria-label="Record a voice note" data-tip="Voice note">
            <Mic />
          </button>
          {parentId && conv.kind === 'channel' && (
            <label className="pc-alsosend">
              <input type="checkbox" className="neo-check" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)} />
              <span>
                Also send to <Hash className="pc-hud-icon" />
                {conv.name}
              </span>
            </label>
          )}
          <span className="grow" />
          {!isMobile && !parentId && <span className="pc-hint neo-faint">Enter to send · Shift+Enter new line</span>}
          <div className="pc-send">
            <button type="button" className="pc-send__main" onClick={() => send()} disabled={!canSend} aria-label="Send message" data-qa="send">
              <SendHorizontal />
            </button>
            <NeoMenu
              items={sendMenu}
              placement="top-end"
              width={270}
              label="Send options"
              trigger={(p) => (
                <button {...p} type="button" className="pc-send__more" disabled={!canSend} aria-label="Send with effect or schedule" data-qa="send-more">
                  <ChevronDown />
                </button>
              )}
            />
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <EmojiPopover
          open={emoji}
          anchor={emojiBtn.current}
          onClose={() => setEmoji(false)}
          onPick={(e) => {
            const el = ta.current;
            const pos = el?.selectionStart ?? text.length;
            const next = text.slice(0, pos) + e + text.slice(pos);
            setText(next);
            useChat.getState().pushEmojiRecent(e);
            requestAnimationFrame(() => {
              el?.focus();
              el?.setSelectionRange(pos + e.length, pos + e.length);
            });
          }}
        />
      </div>
    </div>
  );
}
