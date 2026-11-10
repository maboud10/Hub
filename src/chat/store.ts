/**
 * Pulse Chat store (Zustand + persist under `nexus-chat-v2`).
 *
 * Every mutating action behaves like an API endpoint: it resolves the signed-in viewer, re-checks the
 * policy in `./access`, validates input, returns `{ ok: true, … } | { ok: false, error }`, writes the shared
 * audit trail for security-relevant events and notifies affected people (Hub bell, with deep links).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { KudosValue, Presence, User } from '@/types';
import { useHub } from '@/store/hub';
import { currentViewer, type BridgeCard, type BridgeViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { uid } from '@/lib/id';
import {
  canBotPost,
  canClosePoll,
  canCreateChannel,
  canEditMessage,
  canGiveKudos,
  canInvite,
  canJoin,
  canLeave,
  canManage,
  canPin,
  canPost,
  canRemoveMember,
  canView,
  deleteMode,
  isMember,
  toViewer,
  type ChatViewer,
} from './access';
import { BOTS, COFFEE_PROMPTS, sparkOfDay } from './constants';
import { buildHandles, dateKey, dmId, dmMembers, isBotId, slugifyChannel } from './ids';
import { mentionHandles, replaceShortcodes, toPlainText } from './markdown';
import { emptyStats, pickCoffeeMatch, type Occasion } from './pulse';
import { createChatSeed } from './seed';
import { emptyPerson, indexMessages } from './selectors';
import type {
  ActiveHuddle,
  Attachment,
  BotId,
  CelebrationPayload,
  ChatData,
  ChatMessage,
  ChatResult,
  CoffeeCard,
  Conversation,
  DecisionPayload,
  DriveFileRef,
  EngagementStats,
  HuddleActionItem,
  HuddleRecap,
  Mood,
  NotifyLevel,
  Poll,
  SendEffect,
  SparkPayload,
  StandupPayload,
  SystemEvent,
  UserChatState,
  VoiceNote,
} from './types';

export const CHAT_STORE_KEY = 'nexus-chat-v2';
export const CHAT_DATA_VERSION = 1;
const LEGACY_KEYS = ['nexus-pulse-chat-v1', 'nexus-chat', 'nexus-pulse-chat'];
const MAX_TEXT = 4000;

if (typeof localStorage !== 'undefined') {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

export interface ChatActor {
  user: User;
  viewer: ChatViewer;
}

export function actorFor(v: BridgeViewer | null | undefined): ChatActor | null {
  if (!v || !v.user.active) return null;
  return { user: v.user, viewer: toViewer(v.user, v.perms) };
}

const me = () => actorFor(currentViewer());

export interface SendInput {
  text?: string;
  parentId?: string;
  broadcast?: boolean;
  attachments?: Attachment[];
  files?: DriveFileRef[];
  card?: BridgeCard;
  effect?: SendEffect;
  poll?: Poll;
  standup?: StandupPayload;
  celebration?: CelebrationPayload;
  huddle?: HuddleRecap;
  voice?: VoiceNote;
  coffee?: CoffeeCard;
  spark?: SparkPayload;
  decision?: DecisionPayload;
  forwarded?: ChatMessage['forwarded'];
  kudos?: ChatMessage['kudos'];
  system?: SystemEvent;
}

interface SendOpts {
  /** Post as an integration bot (App Bridge). */
  bot?: BotId;
  /** Post as `system` (Pulse). */
  asSystem?: boolean;
  /** Skip the human posting policy (simulation / internal). */
  internal?: boolean;
  /** Don't fan out notifications. */
  silent?: boolean;
}

export type ChatState = ChatData & {
  version: number;
  seededAt: number;
  /** `${messageId}|${emoji}|${userId}` → when the reaction was added (activity feed). */
  reactionTimes: Record<string, number>;
};

export interface ChatActions {
  // messaging
  send(convId: string, input: SendInput, opts?: SendOpts, actor?: ChatActor | null): ChatResult<{ message: ChatMessage }>;
  editMessage(id: string, text: string): ChatResult;
  deleteMessage(id: string): ChatResult<{ mode: 'own' | 'moderator'; original: ChatMessage }>;
  restoreMessage(original: ChatMessage): ChatResult;
  toggleReaction(id: string, emoji: string): ChatResult<{ added: boolean }>;
  togglePin(id: string): ChatResult<{ pinned: boolean }>;
  forward(messageId: string, toConvId: string, note?: string): ChatResult<{ message: ChatMessage }>;
  logDecision(messageId: string, title?: string): ChatResult<{ message: ChatMessage }>;
  // personal state
  toggleSave(id: string): ChatResult<{ saved: boolean }>;
  setReminder(id: string, at: number | null): ChatResult;
  setSavedDone(id: string, done: boolean): ChatResult;
  markRead(convId: string, at?: number): void;
  markUnread(convId: string, messageId: string): void;
  markThreadRead(parentId: string): void;
  markActivitySeen(): void;
  setDraft(key: string, text: string): void;
  setLastConv(convId: string): void;
  toggleStar(convId: string): void;
  toggleMute(convId: string): void;
  setNotify(convId: string, level: NotifyLevel): void;
  hideConversation(convId: string): void;
  pushEmojiRecent(emoji: string): void;
  // conversations
  createChannel(input: { name: string; topic?: string; description?: string; visibility: 'public' | 'private'; memberIds: string[]; icon?: string }): ChatResult<{ conv: Conversation }>;
  joinChannel(convId: string): ChatResult;
  leaveChannel(convId: string): ChatResult;
  addMembers(convId: string, userIds: string[]): ChatResult<{ convId: string }>;
  removeMember(convId: string, userId: string): ChatResult;
  updateChannel(convId: string, patch: { topic?: string; description?: string; icon?: string }): ChatResult;
  openDm(userIds: string[], actor?: ChatActor | null): ChatResult<{ convId: string }>;
  ensureConversation(convId: string): ChatResult<{ conv: Conversation }>;
  // rich messages
  createPoll(convId: string, input: { question: string; options: string[]; multi: boolean; anonymous: boolean }): ChatResult<{ message: ChatMessage }>;
  votePoll(messageId: string, optionId: string): ChatResult;
  closePoll(messageId: string): ChatResult;
  sendKudos(input: { convId?: string; toId: string; value: KudosValue; message: string; effect?: SendEffect }): ChatResult<{ message: ChatMessage }>;
  postStandup(convId: string, standup: StandupPayload, note?: string): ChatResult<{ message: ChatMessage }>;
  signCard(occasion: Occasion, note: string): ChatResult<{ message: ChatMessage; created: boolean }>;
  answerSpark(text: string): ChatResult<{ message: ChatMessage }>;
  voteVibe(mood: Mood): ChatResult;
  setCoffeeOptIn(on: boolean): void;
  spinCoffee(rand?: number): ChatResult<{ partnerId: string; convId: string }>;
  setStatus(presence: Presence, message?: string): ChatResult;
  // huddles
  startHuddle(convId: string): ChatResult<{ joined: boolean }>;
  addHuddleParticipant(convId: string, userId: string): void;
  leaveHuddle(convId: string, recap: { keyPoints: string[]; actionItems: { text: string; ownerId?: string }[] }): ChatResult<{ message?: ChatMessage }>;
  setActionItemTask(messageId: string, actionId: string, taskTo: string): void;
  // scheduling & reminders
  schedule(convId: string, text: string, deliverAt: number, opts?: { parentId?: string; effect?: SendEffect }): ChatResult<{ id: string }>;
  cancelScheduled(id: string): ChatResult;
  deliverDue(now?: number): ChatMessage[];
  fireReminders(now?: number): { userId: string; messageId: string }[];
  // simulation (no policy — called by the local teammate engine)
  simPost(convId: string, authorId: string, text: string, extra?: Partial<ChatMessage>): ChatMessage | null;
  simReact(messageId: string, userId: string, emoji: string): void;
  botPost(convId: string, bot: BotId, text: string, extra?: Partial<ChatMessage>): ChatMessage | null;
  recordActive(kind?: keyof Omit<EngagementStats, 'activeDays'>, n?: number): void;
  reset(): void;
}

export type ChatStore = ChatState & ChatActions;

const fail = (error: string) => ({ ok: false as const, error });

function freshState(): ChatState {
  const data = createChatSeed();
  return { ...data, version: CHAT_DATA_VERSION, seededAt: Date.now(), reactionTimes: {} };
}

function userName(id: string): string {
  if (id === 'system') return 'Pulse';
  if (isBotId(id)) return BOTS[id].name;
  return useHub.getState().users.find((u) => u.id === id)?.name ?? 'Someone';
}
const firstOf = (id: string) => userName(id).split(' ')[0];

export const useChat = create<ChatStore>()(
  persist(
    (set, get) => {
      /* ------------------------------------------------------------ helpers */
      const conv = (id: string) => get().conversations.find((c) => c.id === id);
      const msg = (id: string) => get().messages.find((m) => m.id === id);
      const person = (userId: string): UserChatState => get().people[userId] ?? emptyPerson();
      const patchPerson = (userId: string, fn: (p: UserChatState) => UserChatState) =>
        set((s) => ({ people: { ...s.people, [userId]: fn(s.people[userId] ?? emptyPerson()) } }));
      const patchConv = (id: string, fn: (c: Conversation) => Conversation) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) }));
      const patchMsg = (id: string, fn: (m: ChatMessage) => ChatMessage) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }));
      const hub = () => useHub.getState();
      const users = () => hub().users;
      const handleMaps = () => buildHandles(users());
      const label = (c: Conversation) => (c.kind === 'channel' ? `#${c.name}` : c.name || c.memberIds.map(firstOf).join(', '));
      const plain = (text: string) => toPlainText(text, {}, {});
      const link = (convId: string, m?: ChatMessage) => (m?.parentId ? `/chat/c/${convId}?thread=${m.parentId}&msg=${m.id}` : `/chat/c/${convId}${m ? `?msg=${m.id}` : ''}`);

      const bump = (userId: string, kind?: keyof Omit<EngagementStats, 'activeDays'>, n = 1) =>
        set((s) => {
          const st = s.stats[userId] ?? emptyStats();
          const today = dateKey(Date.now());
          const activeDays = st.activeDays.includes(today) ? st.activeDays : [...st.activeDays, today].slice(-120);
          return { stats: { ...s.stats, [userId]: { ...st, activeDays, ...(kind ? { [kind]: (st[kind] ?? 0) + n } : {}) } } };
        });

      const nextAt = (convId: string) => {
        const list = indexMessages(get().messages).byConv.get(convId);
        const last = list?.[list.length - 1]?.at ?? 0;
        return Math.max(Date.now(), last + 1);
      };

      const notify = (userIds: string[], n: { kind: 'work' | 'kudos' | 'system'; title: string; body?: string; link?: string }) => {
        const ids = userIds.filter((id) => !isBotId(id) && id !== 'system');
        if (ids.length) hub().pushNotifications(ids, n);
      };

      /** Create the DM / group / app conversation for these members if needed. */
      const ensureDm = (memberIds: string[], creator: string): Conversation => {
        const ids = [...new Set(memberIds)];
        const id = dmId(ids);
        const existing = conv(id);
        if (existing) return existing;
        const bot = ids.find(isBotId);
        const c: Conversation = {
          id,
          kind: bot ? 'app' : ids.length > 2 ? 'group' : 'dm',
          name: '',
          visibility: 'private',
          posting: 'everyone',
          memberIds: ids,
          adminIds: [],
          createdBy: creator,
          createdAt: Date.now(),
          pinnedIds: [],
          botId: bot,
        };
        set((s) => ({ conversations: [...s.conversations, c] }));
        return c;
      };

      const unhide = (c: Conversation) =>
        set((s) => {
          let changed = false;
          const people = { ...s.people };
          for (const uid of c.memberIds) {
            const p = people[uid];
            if (p?.hidden.includes(c.id)) {
              people[uid] = { ...p, hidden: p.hidden.filter((h) => h !== c.id) };
              changed = true;
            }
          }
          return changed ? { people } : {};
        });

      /* ------------------------------------------------------------ core send */
      const send: ChatActions['send'] = (convId, input, opts = {}, actorArg) => {
        const a = actorArg === undefined ? me() : actorArg;
        if (!a) return fail('You are not signed in.');
        let c = conv(convId);
        if (!c && convId.startsWith('dm-')) {
          const members = dmMembers(convId);
          if (members.includes(a.user.id) || (opts.bot && members.includes(opts.bot))) c = ensureDm(members, a.user.id);
        }
        if (!c) return fail('Conversation not found.');
        const text = replaceShortcodes((input.text ?? '').replace(/\s+$/, ''));
        const hasPayload = !!(input.attachments?.length || input.files?.length || input.card || input.poll || input.standup || input.celebration || input.huddle || input.voice || input.coffee || input.decision || input.forwarded || input.kudos || input.system);
        if (!text.trim() && !hasPayload) return fail('Type a message first.');
        if (text.length > MAX_TEXT) return fail(`Messages are limited to ${MAX_TEXT.toLocaleString()} characters.`);

        if (!opts.internal) {
          const gate = opts.bot || opts.asSystem ? canBotPost(c, a.viewer) : canPost(c, a.viewer);
          if (!gate.ok) {
            if (c.posting === 'admins' || c.visibility === 'private')
              hub().logAudit({ action: 'chat.post.denied', target: label(c), detail: gate.reason, outcome: 'denied', severity: 'warning' });
            return fail(gate.reason);
          }
        }
        let parent: ChatMessage | undefined;
        if (input.parentId) {
          parent = msg(input.parentId);
          if (!parent || parent.convId !== c.id || parent.parentId) return fail('That thread no longer exists.');
          if (parent.deleted) return fail('That message was deleted.');
        }
        const authorId = opts.bot ?? (opts.asSystem ? 'system' : a.user.id);
        const m: ChatMessage = {
          id: uid('m'),
          convId: c.id,
          authorId,
          text,
          at: nextAt(c.id),
          reactions: {},
          ...(input.parentId ? { parentId: input.parentId } : {}),
          ...(input.broadcast && input.parentId ? { broadcast: true } : {}),
          ...(input.attachments?.length ? { attachments: input.attachments } : {}),
          ...(input.files?.length ? { files: input.files } : {}),
          ...(input.card ? { card: input.card } : {}),
          ...(input.effect ? { effect: input.effect } : {}),
          ...(input.poll ? { poll: input.poll } : {}),
          ...(input.standup ? { standup: input.standup } : {}),
          ...(input.celebration ? { celebration: input.celebration } : {}),
          ...(input.huddle ? { huddle: input.huddle } : {}),
          ...(input.voice ? { voice: input.voice } : {}),
          ...(input.coffee ? { coffee: input.coffee } : {}),
          ...(input.spark ? { spark: input.spark } : {}),
          ...(input.decision ? { decision: input.decision } : {}),
          ...(input.forwarded ? { forwarded: input.forwarded } : {}),
          ...(input.kudos ? { kudos: input.kudos } : {}),
          ...(input.system ? { system: input.system } : {}),
          ...(opts.bot || opts.asSystem ? { via: a.user.id } : {}),
        };
        set((s) => ({ messages: [...s.messages, m] }));
        unhide(c);
        if (!opts.bot && !opts.asSystem) {
          patchPerson(a.user.id, (p) => {
            const drafts = { ...p.drafts };
            delete drafts[input.parentId ? `thread:${input.parentId}` : c!.id];
            return {
              ...p,
              drafts,
              lastRead: input.parentId && !input.broadcast ? p.lastRead : { ...p.lastRead, [c!.id]: Math.max(p.lastRead[c!.id] ?? 0, m.at) },
              threadRead: input.parentId ? { ...p.threadRead, [input.parentId]: m.at } : p.threadRead,
            };
          });
          if (!input.system) bump(a.user.id, 'messages');
        }

        if (!opts.silent && !input.system) {
          const who = opts.bot ? userName(opts.bot) : opts.asSystem ? 'Pulse' : a.user.name;
          const excerpt = plain(text).slice(0, 120) || (input.card ? input.card.title : input.poll ? `Poll: ${input.poll.question}` : 'Sent an attachment');
          if (c.kind === 'channel') {
            const handles = handleMaps();
            const targets = mentionHandles(text)
              .map((h) => handles.byHandle.get(h))
              .filter((id): id is string => !!id && id !== authorId && c!.memberIds.includes(id));
            if (targets.length) notify(targets, { kind: 'work', title: `${who} mentioned you in #${c.name}`, body: excerpt, link: link(c.id, m) });
          } else {
            const recipients = c.memberIds.filter((id) => id !== authorId && id !== a.user.id);
            if (recipients.length)
              notify(recipients, { kind: 'work', title: c.kind === 'group' ? `${who} in ${label(c)}` : `New message from ${who}`, body: excerpt, link: link(c.id, m) });
          }
        }
        return { ok: true, message: m };
      };

      const systemPost = (c: Conversation, event: SystemEvent, text: string, actorId: string) => {
        const m: ChatMessage = { id: uid('m'), convId: c.id, authorId: actorId, text, at: nextAt(c.id), reactions: {}, system: event };
        set((s) => ({ messages: [...s.messages, m] }));
        return m;
      };

      /* ------------------------------------------------------------ store */
      return {
        ...freshState(),

        send,

        editMessage(id, text) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(id);
          if (!m) return fail('Message not found.');
          if (!canEditMessage(m, a.viewer)) return fail('You can only edit your own messages.');
          const t = replaceShortcodes(text.trim());
          if (!t && !m.attachments?.length && !m.files?.length && !m.poll) return fail('A message can’t be empty — delete it instead.');
          if (t.length > MAX_TEXT) return fail('That message is too long.');
          if (t === m.text) return { ok: true };
          patchMsg(id, (x) => ({ ...x, text: t, editedAt: Date.now() }));
          return { ok: true };
        },

        deleteMessage(id) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(id);
          const c = m && conv(m.convId);
          if (!m || !c) return fail('Message not found.');
          const mode = deleteMode(m, c, a.viewer);
          if (!mode) {
            hub().logAudit({ action: 'chat.message.delete', target: label(c), detail: `Not allowed to delete a message by ${userName(m.authorId)}`, outcome: 'denied', severity: 'warning' });
            return fail('You can only delete your own messages.');
          }
          const original = m;
          patchMsg(id, (x) => ({ id: x.id, convId: x.convId, authorId: x.authorId, at: x.at, parentId: x.parentId, broadcast: x.broadcast, text: '', reactions: {}, deleted: true }));
          patchConv(c.id, (x) => ({ ...x, pinnedIds: x.pinnedIds.filter((p) => p !== id) }));
          if (mode === 'moderator')
            hub().logAudit({
              action: 'chat.message.moderated',
              target: label(c),
              detail: `Deleted a message by ${userName(m.authorId)}: “${plain(m.text).slice(0, 80)}”`,
              outcome: 'success',
              severity: 'warning',
            });
          return { ok: true, mode, original };
        },

        restoreMessage(original) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const cur = msg(original.id);
          if (!cur?.deleted || original.authorId !== a.user.id) return fail('Nothing to restore.');
          patchMsg(original.id, () => original);
          return { ok: true };
        },

        toggleReaction(id, emoji) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(id);
          const c = m && conv(m.convId);
          if (!m || !c || m.deleted) return fail('Message not found.');
          if (!isMember(c, a.user.id)) return fail(c.kind === 'channel' && canJoin(c, a.viewer) ? `Join #${c.name} to react.` : 'You’re not a member of this conversation.');
          const list = m.reactions[emoji] ?? [];
          const added = !list.includes(a.user.id);
          const next = added ? [...list, a.user.id] : list.filter((u) => u !== a.user.id);
          const reactions = { ...m.reactions };
          if (next.length) reactions[emoji] = next;
          else delete reactions[emoji];
          patchMsg(id, (x) => ({ ...x, reactions }));
          if (added) {
            bump(a.user.id, 'reactions');
            get().pushEmojiRecent(emoji);
            set((s) => {
              const rt = { ...s.reactionTimes, [`${id}|${emoji}|${a.user.id}`]: Date.now() };
              const keys = Object.keys(rt);
              if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete rt[k];
              return { reactionTimes: rt };
            });
          }
          return { ok: true, added };
        },

        togglePin(id) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(id);
          const c = m && conv(m.convId);
          if (!m || !c || m.deleted) return fail('Message not found.');
          if (!canPin(c, a.viewer)) return fail('Only members can pin messages.');
          const pinned = !c.pinnedIds.includes(id);
          patchConv(c.id, (x) => ({ ...x, pinnedIds: pinned ? [id, ...x.pinnedIds].slice(0, 30) : x.pinnedIds.filter((p) => p !== id) }));
          return { ok: true, pinned };
        },

        forward(messageId, toConvId, note) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(messageId);
          const from = m && conv(m.convId);
          if (!m || !from || m.deleted) return fail('Message not found.');
          if (!canView(from, a.viewer)) return fail('You can’t see that message.');
          const dest = conv(toConvId);
          if (dest && dest.visibility === 'public' && from.visibility === 'private' && from.kind === 'channel')
            return fail(`Messages from the private channel ${label(from)} can’t be shared to a public channel.`);
          return send(toConvId, {
            text: note ?? '',
            forwarded: { messageId: m.id, convId: from.id, authorId: m.authorId, at: m.at, text: m.text || (m.card?.title ?? m.poll?.question ?? '') },
            files: m.files,
            attachments: m.attachments,
            card: m.card,
          });
        },

        logDecision(messageId, title) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(messageId);
          if (!m || m.deleted) return fail('Message not found.');
          const t = (title ?? plain(m.text)).replace(/\s+/g, ' ').trim().slice(0, 120);
          if (t.length < 4) return fail('Give the decision a title.');
          return send(m.convId, {
            text: '',
            parentId: undefined,
            decision: { title: t, context: `From ${firstOf(m.authorId)}’s message`, decidedBy: a.user.id, decidedAt: Date.now(), status: 'decided' },
          });
        },

        /* ---------------- personal state ---------------- */
        toggleSave(id) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(id);
          if (!m) return fail('Message not found.');
          const c = conv(m.convId);
          if (!c || !canView(c, a.viewer)) return fail('You can’t see that message.');
          const p = person(a.user.id);
          const saved = !p.saved.some((s) => s.messageId === id);
          patchPerson(a.user.id, (x) => ({ ...x, saved: saved ? [{ messageId: id, savedAt: Date.now() }, ...x.saved] : x.saved.filter((s) => s.messageId !== id) }));
          return { ok: true, saved };
        },

        setReminder(id, at) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(id);
          if (!m) return fail('Message not found.');
          if (at !== null && at < Date.now() - 60_000) return fail('Pick a time in the future.');
          patchPerson(a.user.id, (x) => {
            const exists = x.saved.some((s) => s.messageId === id);
            const saved = exists
              ? x.saved.map((s) => (s.messageId === id ? { ...s, remindAt: at ?? undefined, reminded: false, done: false } : s))
              : [{ messageId: id, savedAt: Date.now(), remindAt: at ?? undefined }, ...x.saved];
            return { ...x, saved };
          });
          return { ok: true };
        },

        setSavedDone(id, done) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          patchPerson(a.user.id, (x) => ({ ...x, saved: x.saved.map((s) => (s.messageId === id ? { ...s, done } : s)) }));
          return { ok: true };
        },

        markRead(convId, at) {
          const a = me();
          if (!a) return;
          const list = indexMessages(get().messages).byConv.get(convId);
          const target = at ?? list?.[list.length - 1]?.at ?? 0;
          const cur = person(a.user.id).lastRead[convId] ?? 0;
          if (target <= cur) return;
          patchPerson(a.user.id, (p) => ({ ...p, lastRead: { ...p.lastRead, [convId]: target } }));
        },

        markUnread(convId, messageId) {
          const a = me();
          const m = msg(messageId);
          if (!a || !m) return;
          patchPerson(a.user.id, (p) => ({ ...p, lastRead: { ...p.lastRead, [convId]: m.at - 1 } }));
        },

        markThreadRead(parentId) {
          const a = me();
          if (!a) return;
          const replies = indexMessages(get().messages).threads.get(parentId);
          const last = replies?.[replies.length - 1]?.at ?? 0;
          if ((person(a.user.id).threadRead[parentId] ?? 0) >= last) return;
          patchPerson(a.user.id, (p) => ({ ...p, threadRead: { ...p.threadRead, [parentId]: last } }));
        },

        markActivitySeen() {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, activitySeenAt: Date.now() }));
        },

        setDraft(key, text) {
          const a = me();
          if (!a) return;
          const cur = person(a.user.id).drafts[key] ?? '';
          if (cur === text) return;
          patchPerson(a.user.id, (p) => {
            const drafts = { ...p.drafts };
            if (text.trim()) drafts[key] = text;
            else delete drafts[key];
            return { ...p, drafts };
          });
        },

        setLastConv(convId) {
          const a = me();
          if (!a || person(a.user.id).lastConvId === convId) return;
          patchPerson(a.user.id, (p) => ({ ...p, lastConvId: convId }));
        },

        toggleStar(convId) {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, starred: p.starred.includes(convId) ? p.starred.filter((x) => x !== convId) : [...p.starred, convId] }));
        },

        toggleMute(convId) {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, muted: p.muted.includes(convId) ? p.muted.filter((x) => x !== convId) : [...p.muted, convId] }));
        },

        setNotify(convId, level) {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, notify: { ...p.notify, [convId]: level }, muted: level === 'none' ? [...new Set([...p.muted, convId])] : p.muted.filter((x) => x !== convId) }));
        },

        hideConversation(convId) {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, hidden: [...new Set([...p.hidden, convId])], starred: p.starred.filter((x) => x !== convId) }));
        },

        pushEmojiRecent(emoji) {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, emojiRecents: [emoji, ...p.emojiRecents.filter((e) => e !== emoji)].slice(0, 24) }));
        },

        /* ---------------- conversations ---------------- */
        createChannel(input) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          if (!canCreateChannel(a.viewer)) {
            hub().logAudit({ action: 'chat.channel.create', target: input.name, detail: 'Contractors can’t create channels', outcome: 'denied', severity: 'warning' });
            return fail('Your account can’t create channels — ask an employee to create it for you.');
          }
          const slug = slugifyChannel(input.name);
          if (slug.length < 2) return fail('Channel names need at least 2 letters or numbers.');
          if (get().conversations.some((c) => c.kind === 'channel' && c.name === slug)) return fail(`#${slug} already exists.`);
          let id = `ch-${slug}`;
          for (let n = 2; conv(id); n++) id = `ch-${slug}-${n}`;
          const valid = new Set(users().filter((u) => u.active).map((u) => u.id));
          const memberIds = [...new Set([a.user.id, ...input.memberIds.filter((x) => valid.has(x))])];
          const c: Conversation = {
            id,
            kind: 'channel',
            name: slug,
            icon: input.icon?.trim() || (input.visibility === 'private' ? '🔒' : '💬'),
            topic: input.topic?.trim() || undefined,
            description: input.description?.trim() || undefined,
            visibility: input.visibility,
            posting: 'everyone',
            memberIds,
            adminIds: [a.user.id],
            createdBy: a.user.id,
            createdAt: Date.now(),
            pinnedIds: [],
          };
          set((s) => ({ conversations: [...s.conversations, c] }));
          systemPost(c, 'created', `created #${slug}${c.topic ? ` — ${c.topic}` : ''}`, a.user.id);
          patchPerson(a.user.id, (p) => ({ ...p, lastRead: { ...p.lastRead, [id]: Date.now() + 1 } }));
          const added = memberIds.filter((x) => x !== a.user.id);
          if (added.length) notify(added, { kind: 'work', title: `${a.user.name} added you to #${slug}`, body: c.topic, link: `/chat/c/${id}` });
          hub().logAudit({ action: 'chat.channel.created', target: `#${slug}`, detail: `${input.visibility} · ${memberIds.length} members`, outcome: 'success', severity: 'info' });
          return { ok: true, conv: c };
        },

        joinChannel(convId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Channel not found.');
          if (!canJoin(c, a.viewer)) {
            if (c.visibility === 'private' || a.viewer.contractor)
              hub().logAudit({ action: 'chat.channel.join', target: label(c), detail: 'Join denied', outcome: 'denied', severity: 'warning' });
            return fail(c.visibility === 'private' ? 'This channel is private — ask a member to add you.' : 'You can’t join this channel.');
          }
          patchConv(convId, (x) => ({ ...x, memberIds: [...x.memberIds, a.user.id] }));
          const m = systemPost(c, 'join', 'joined the channel', a.user.id);
          patchPerson(a.user.id, (p) => ({ ...p, lastRead: { ...p.lastRead, [convId]: m.at } }));
          return { ok: true };
        },

        leaveChannel(convId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Channel not found.');
          if (!canLeave(c, a.viewer)) return fail(c.mandatory ? `Everyone stays in #${c.name}.` : 'You can’t leave this conversation.');
          systemPost(c, 'leave', 'left the channel', a.user.id);
          patchConv(convId, (x) => ({ ...x, memberIds: x.memberIds.filter((u) => u !== a.user.id), adminIds: x.adminIds.filter((u) => u !== a.user.id || x.adminIds.length === 1) }));
          patchPerson(a.user.id, (p) => ({ ...p, starred: p.starred.filter((x) => x !== convId) }));
          return { ok: true };
        },

        addMembers(convId, userIds) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Conversation not found.');
          const valid = users().filter((u) => u.active && userIds.includes(u.id) && !c.memberIds.includes(u.id));
          if (!valid.length) return fail('Pick at least one person who isn’t here yet.');
          if (c.kind === 'dm') {
            const res = get().openDm([...c.memberIds.filter((x) => x !== a.user.id), ...valid.map((u) => u.id)]);
            return res.ok ? { ok: true, convId: res.convId } : res;
          }
          if (!canInvite(c, a.viewer)) return fail('You can’t add people here.');
          if (c.kind === 'channel' && c.visibility === 'private')
            hub().logAudit({ action: 'chat.channel.members.added', target: label(c), detail: valid.map((u) => u.name).join(', '), outcome: 'success', severity: 'info' });
          patchConv(convId, (x) => ({ ...x, memberIds: [...x.memberIds, ...valid.map((u) => u.id)] }));
          const names = valid.map((u) => `@${handleMaps().byUser.get(u.id) ?? u.name}`);
          systemPost(c, 'join', `added ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`, a.user.id);
          notify(
            valid.map((u) => u.id),
            { kind: 'work', title: `${a.user.name} added you to ${label(c)}`, body: c.topic, link: `/chat/c/${c.id}` },
          );
          return { ok: true, convId };
        },

        removeMember(convId, userId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Channel not found.');
          const gate = canRemoveMember(c, a.viewer, userId);
          if (!gate.ok) {
            hub().logAudit({ action: 'chat.channel.member.remove', target: label(c), detail: gate.reason, outcome: 'denied', severity: 'warning' });
            return fail(gate.reason);
          }
          patchConv(convId, (x) => ({ ...x, memberIds: x.memberIds.filter((u) => u !== userId), adminIds: x.adminIds.filter((u) => u !== userId) }));
          systemPost(c, 'leave', `removed @${handleMaps().byUser.get(userId) ?? userName(userId)} from the channel`, a.user.id);
          hub().logAudit({ action: 'chat.channel.member.removed', target: label(c), detail: userName(userId), outcome: 'success', severity: 'info' });
          return { ok: true };
        },

        updateChannel(convId, patch) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Channel not found.');
          if (!canManage(c, a.viewer)) {
            hub().logAudit({ action: 'chat.channel.update', target: label(c), detail: 'Not a channel admin', outcome: 'denied', severity: 'warning' });
            return fail('Only channel admins can change this.');
          }
          const topic = patch.topic !== undefined ? patch.topic.trim().slice(0, 250) : c.topic;
          const description = patch.description !== undefined ? patch.description.trim().slice(0, 600) : c.description;
          patchConv(convId, (x) => ({ ...x, topic: topic || undefined, description: description || undefined, icon: patch.icon?.trim() || x.icon }));
          if (patch.topic !== undefined && (topic ?? '') !== (c.topic ?? '')) systemPost(c, 'topic', topic ? `set the topic: ${topic}` : 'cleared the topic', a.user.id);
          return { ok: true };
        },

        openDm(userIds, actorArg) {
          const a = actorArg === undefined ? me() : actorArg;
          if (!a) return fail('You are not signed in.');
          const all = users();
          const others = [...new Set(userIds)].filter((id) => id !== a.user.id);
          for (const id of others) {
            if (isBotId(id)) continue;
            const u = all.find((x) => x.id === id);
            if (!u) return fail('That person isn’t in the directory.');
            if (!u.active) return fail(`${u.name} is no longer active.`);
          }
          if (others.length > 8) return fail('Group messages are limited to 9 people — create a channel instead.');
          const c = ensureDm([a.user.id, ...others], a.user.id);
          unhide(c);
          return { ok: true, convId: c.id };
        },

        ensureConversation(convId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (c) return canView(c, a.viewer) ? { ok: true, conv: c } : fail('You don’t have access to this conversation.');
          if (!convId.startsWith('dm-')) return fail('Conversation not found.');
          const members = dmMembers(convId);
          if (!members.includes(a.user.id)) {
            hub().logAudit({ action: 'chat.dm.open', target: convId, detail: 'Tried to open someone else’s DM', outcome: 'denied', severity: 'warning' });
            return fail('You don’t have access to this conversation.');
          }
          const all = users();
          if (members.some((id) => !isBotId(id) && !all.some((u) => u.id === id && u.active))) return fail('Someone in this conversation is no longer active.');
          return { ok: true, conv: ensureDm(members, a.user.id) };
        },

        /* ---------------- rich messages ---------------- */
        createPoll(convId, input) {
          const question = input.question.trim();
          const options = [...new Set(input.options.map((o) => o.trim()).filter(Boolean))];
          if (question.length < 3) return fail('Ask a question (3+ characters).');
          if (options.length < 2) return fail('Add at least two options.');
          if (options.length > 10) return fail('Polls support up to 10 options.');
          const poll: Poll = {
            question: question.slice(0, 200),
            options: options.map((text, i) => ({ id: `o${i + 1}`, text: text.slice(0, 80) })),
            multi: input.multi,
            anonymous: input.anonymous,
            closed: false,
            votes: {},
          };
          const res = send(convId, { text: '', poll });
          if (res.ok) {
            const a = me();
            if (a) bump(a.user.id, 'polls');
          }
          return res;
        },

        votePoll(messageId, optionId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(messageId);
          const c = m && conv(m.convId);
          if (!m?.poll || !c) return fail('Poll not found.');
          if (!isMember(c, a.user.id)) return fail('Join the conversation to vote.');
          if (m.poll.closed) return fail('This poll is closed.');
          if (!m.poll.options.some((o) => o.id === optionId)) return fail('Unknown option.');
          const votes: Record<string, string[]> = {};
          for (const o of m.poll.options) {
            const list = m.poll.votes[o.id] ?? [];
            const has = list.includes(a.user.id);
            if (o.id === optionId) votes[o.id] = has ? list.filter((u) => u !== a.user.id) : [...list, a.user.id];
            else votes[o.id] = m.poll.multi ? list : list.filter((u) => u !== a.user.id);
          }
          patchMsg(messageId, (x) => ({ ...x, poll: { ...x.poll!, votes } }));
          bump(a.user.id);
          return { ok: true };
        },

        closePoll(messageId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const m = msg(messageId);
          const c = m && conv(m.convId);
          if (!m?.poll || !c) return fail('Poll not found.');
          if (!canClosePoll(m, c, a.viewer)) return fail('Only the poll author or a channel admin can close it.');
          patchMsg(messageId, (x) => ({ ...x, poll: { ...x.poll!, closed: true, closedAt: Date.now() } }));
          return { ok: true };
        },

        sendKudos(input) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          if (!canGiveKudos(a.viewer)) return fail('Kudos are available to Helix employees.');
          if (input.toId === a.user.id) return fail('Kudos are for others 😄');
          const to = users().find((u) => u.id === input.toId && u.active);
          if (!to) return fail('Pick someone to celebrate.');
          const message = input.message.trim();
          if (message.length < 5) return fail('Say a little more (5+ characters).');
          const convId = input.convId ?? 'ch-kudos';
          const c = conv(convId);
          if (!c) return fail('Conversation not found.');
          const gate = canPost(c, a.viewer);
          if (!gate.ok) return fail(gate.reason);
          const res = hub().giveKudos(to.id, input.value, message);
          if (!res.ok) return fail(res.error);
          const top = hub().kudos[0];
          const hubKudosId = top && top.fromId === a.user.id && top.toId === to.id ? top.id : undefined;
          const sent = send(convId, { text: message, kudos: { toId: to.id, value: input.value, hubKudosId }, effect: input.effect ?? 'confetti' }, { silent: c.kind !== 'channel' });
          if (sent.ok) bump(a.user.id, 'kudosGiven');
          return sent;
        },

        postStandup(convId, standup, note) {
          const clean = (l: string[]) => l.map((s) => s.trim()).filter(Boolean).slice(0, 8);
          const s: StandupPayload = { yesterday: clean(standup.yesterday), today: clean(standup.today), blockers: clean(standup.blockers) };
          if (!s.yesterday.length && !s.today.length) return fail('Add at least one item for yesterday or today.');
          return send(convId, { text: note?.trim() ?? '', standup: s });
        },

        signCard(occasion, note) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          if (occasion.userId === a.user.id) return fail('No peeking — this one’s for you 🤫');
          const text = note.trim();
          if (text.length < 2) return fail('Write a short note.');
          const existing = get().messages.find((m) => m.celebration?.key === occasion.key && !m.deleted);
          if (existing) {
            const c = conv(existing.convId);
            if (!c || !canView(c, a.viewer)) return fail('You can’t see that card.');
            const already = existing.celebration!.signers.some((s) => s.userId === a.user.id);
            patchMsg(existing.id, (x) => ({
              ...x,
              celebration: {
                ...x.celebration!,
                signers: already ? x.celebration!.signers.map((s) => (s.userId === a.user.id ? { ...s, note: text, at: Date.now() } : s)) : [...x.celebration!.signers, { userId: a.user.id, note: text, at: Date.now() }],
              },
            }));
            if (!already) bump(a.user.id, 'cardsSigned');
            return { ok: true, message: msg(existing.id)!, created: false };
          }
          const celebration: CelebrationPayload = {
            type: occasion.type,
            userId: occasion.userId,
            years: occasion.years,
            date: occasion.date,
            key: occasion.key,
            signers: [{ userId: a.user.id, note: text, at: Date.now() }],
          };
          const who = firstOf(occasion.userId);
          const handle = handleMaps().byUser.get(occasion.userId) ?? who.toLowerCase();
          const intro =
            occasion.type === 'birthday'
              ? `It’s @${handle}’s birthday ${occasion.inDays === 0 ? 'today' : occasion.inDays === 1 ? 'tomorrow' : `in ${occasion.inDays} days`} 🎂 Sign the card!`
              : occasion.type === 'anniversary'
                ? `@${handle} celebrates ${occasion.years} year${occasion.years === 1 ? '' : 's'} at Helix ${occasion.inDays === 0 ? 'today' : occasion.inDays === 1 ? 'tomorrow' : `in ${occasion.inDays} days`} 🎉 Sign the card!`
                : `Let’s give @${handle} a warm welcome to Helix 👋 Sign the card!`;
          const res = send('ch-celebrations', { text: intro, celebration });
          if (!res.ok) return res;
          bump(a.user.id, 'cardsSigned');
          return { ok: true, message: res.message, created: true };
        },

        answerSpark(text) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const answer = text.trim();
          if (answer.length < 2) return fail('Share an answer first.');
          const today = dateKey(Date.now());
          const mine = get().messages.find((m) => m.spark?.date === today && m.authorId === a.user.id && !m.deleted);
          if (mine) {
            patchMsg(mine.id, (x) => ({ ...x, text: answer.slice(0, 600), editedAt: Date.now() }));
            return { ok: true, message: msg(mine.id)! };
          }
          const res = send('ch-watercooler', { text: answer.slice(0, 600), spark: { date: today, question: sparkOfDay() } });
          if (res.ok) bump(a.user.id, 'sparks');
          return res;
        },

        voteVibe(mood) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          if (![1, 2, 3, 4, 5].includes(mood)) return fail('Pick a mood from 1 to 5.');
          const today = dateKey(Date.now());
          set((s) => ({ vibes: { ...s.vibes, [today]: { ...(s.vibes[today] ?? {}), [a.user.id]: mood } } }));
          hub().votePulse(mood);
          bump(a.user.id);
          return { ok: true };
        },

        setCoffeeOptIn(on) {
          const a = me();
          if (!a) return;
          patchPerson(a.user.id, (p) => ({ ...p, coffeeOptIn: on }));
        },

        spinCoffee(rand = Math.random()) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          if (a.viewer.contractor) return fail('Coffee Roulette is for Helix employees.');
          const recent = get()
            .coffee.matches.filter((m) => m.userIds.includes(a.user.id))
            .slice(-4)
            .flatMap((m) => m.userIds.filter((u) => u !== a.user.id));
          const people = get().people;
          const candidates = users()
            .filter((u) => !u.roleIds.includes('contractor'))
            .map((u) => ({ id: u.id, department: u.department, active: u.active, optedIn: people[u.id]?.coffeeOptIn ?? true }));
          const partnerId = pickCoffeeMatch(a.user, candidates, rand, recent);
          if (!partnerId) return fail('No one is available for Coffee Roulette right now — try again later.');
          patchPerson(a.user.id, (p) => ({ ...p, coffeeOptIn: true }));
          const c = ensureDm([a.user.id, partnerId], a.user.id);
          const prompt = COFFEE_PROMPTS[Math.floor(rand * 997) % COFFEE_PROMPTS.length];
          send(c.id, { text: '', coffee: { userIds: [a.user.id, partnerId], prompt } }, { asSystem: true, internal: true, silent: true });
          send(c.id, { text: `Hey ${firstOf(partnerId)}! Coffee Roulette paired us ☕ Up for a 15-minute chat this week?` }, { silent: true });
          set((s) => ({ coffee: { matches: [...s.coffee.matches, { id: uid('cm'), userIds: [a.user.id, partnerId], at: Date.now(), convId: c.id }] } }));
          bump(a.user.id, 'coffees');
          notify([partnerId], { kind: 'kudos', title: `You were matched with ${a.user.name} for Coffee Roulette ☕`, body: prompt, link: `/chat/c/${c.id}` });
          return { ok: true, partnerId, convId: c.id };
        },

        setStatus(presence, message) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          hub().setPresence(presence, message?.trim() ? message.trim().slice(0, 100) : undefined);
          return { ok: true };
        },

        /* ---------------- huddles ---------------- */
        startHuddle(convId) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Conversation not found.');
          if (c.kind === 'app') return fail('Huddles aren’t available with apps.');
          if (!isMember(c, a.user.id)) return fail(c.kind === 'channel' ? `Join #${c.name} to huddle.` : 'You’re not a member of this conversation.');
          const h = get().huddles[convId];
          if (h) {
            if (!h.participantIds.includes(a.user.id))
              set((s) => ({ huddles: { ...s.huddles, [convId]: { ...h, participantIds: [...h.participantIds, a.user.id] } } }));
            bump(a.user.id, 'huddles');
            return { ok: true, joined: true };
          }
          const huddle: ActiveHuddle = { convId, startedAt: Date.now(), startedBy: a.user.id, participantIds: [a.user.id] };
          set((s) => ({ huddles: { ...s.huddles, [convId]: huddle } }));
          systemPost(c, 'huddle-start', 'started a huddle', a.user.id);
          bump(a.user.id, 'huddles');
          const others = c.memberIds.filter((id) => id !== a.user.id);
          if (c.kind !== 'channel' && others.length)
            notify(others, { kind: 'work', title: `${a.user.name} started a huddle`, body: label(c), link: `/chat/c/${c.id}?huddle=1` });
          return { ok: true, joined: false };
        },

        addHuddleParticipant(convId, userId) {
          const h = get().huddles[convId];
          if (!h || h.participantIds.includes(userId)) return;
          set((s) => ({ huddles: { ...s.huddles, [convId]: { ...h, participantIds: [...h.participantIds, userId] } } }));
        },

        leaveHuddle(convId, recap) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const h = get().huddles[convId];
          const c = conv(convId);
          if (!h || !c) return fail('That huddle has ended.');
          const participants = [...new Set([...h.participantIds, a.user.id])];
          set((s) => {
            const huddles = { ...s.huddles };
            delete huddles[convId];
            return { huddles };
          });
          const endedAt = Date.now();
          if (endedAt - h.startedAt < 8_000 && !recap.keyPoints.length) return { ok: true };
          const actionItems: HuddleActionItem[] = recap.actionItems.map((x) => ({ id: uid('ai'), text: x.text, ownerId: x.ownerId }));
          const res = send(convId, { text: '', huddle: { startedAt: h.startedAt, endedAt, participantIds: participants, keyPoints: recap.keyPoints, actionItems } }, { asSystem: true, internal: true, silent: true });
          return res.ok ? { ok: true, message: res.message } : res;
        },

        setActionItemTask(messageId, actionId, taskTo) {
          patchMsg(messageId, (x) =>
            x.huddle ? { ...x, huddle: { ...x.huddle, actionItems: x.huddle.actionItems.map((ai) => (ai.id === actionId ? { ...ai, taskTo } : ai)) } } : x,
          );
        },

        /* ---------------- scheduling & reminders ---------------- */
        schedule(convId, text, deliverAt, opts = {}) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const c = conv(convId);
          if (!c) return fail('Conversation not found.');
          const gate = canPost(c, a.viewer);
          if (!gate.ok) return fail(gate.reason);
          const t = text.trim();
          if (!t) return fail('Type a message first.');
          if (deliverAt < Date.now() + 30_000) return fail('Pick a time at least a minute from now.');
          const id = uid('sch');
          set((s) => ({ scheduled: [...s.scheduled, { id, convId, authorId: a.user.id, text: replaceShortcodes(t), deliverAt, createdAt: Date.now(), parentId: opts.parentId, effect: opts.effect }] }));
          patchPerson(a.user.id, (p) => {
            const drafts = { ...p.drafts };
            delete drafts[opts.parentId ? `thread:${opts.parentId}` : convId];
            return { ...p, drafts };
          });
          return { ok: true, id };
        },

        cancelScheduled(id) {
          const a = me();
          if (!a) return fail('You are not signed in.');
          const s = get().scheduled.find((x) => x.id === id);
          if (!s || s.authorId !== a.user.id) return fail('Scheduled message not found.');
          set((st) => ({ scheduled: st.scheduled.filter((x) => x.id !== id) }));
          return { ok: true };
        },

        deliverDue(now = Date.now()) {
          const due = get().scheduled.filter((s) => s.deliverAt <= now);
          if (!due.length) return [];
          set((st) => ({ scheduled: st.scheduled.filter((s) => s.deliverAt > now) }));
          const out: ChatMessage[] = [];
          const roles = hub().roles;
          for (const s of due) {
            const author = users().find((u) => u.id === s.authorId);
            if (!author?.active) continue;
            const actor: ChatActor = { user: author, viewer: toViewer(author, effectivePermissions(author, roles)) };
            const res = send(s.convId, { text: s.text, parentId: s.parentId, effect: s.effect }, {}, actor);
            if (res.ok) out.push(res.message);
          }
          return out;
        },

        fireReminders(now = Date.now()) {
          const fired: { userId: string; messageId: string }[] = [];
          const people = get().people;
          for (const [userId, p] of Object.entries(people)) {
            for (const s of p.saved) if (s.remindAt && !s.reminded && !s.done && s.remindAt <= now) fired.push({ userId, messageId: s.messageId });
          }
          if (!fired.length) return [];
          set((st) => {
            const next = { ...st.people };
            for (const f of fired) {
              const p = next[f.userId];
              next[f.userId] = { ...p, saved: p.saved.map((s) => (s.messageId === f.messageId ? { ...s, reminded: true } : s)) };
            }
            return { people: next };
          });
          for (const f of fired) {
            const m = msg(f.messageId);
            const c = m && conv(m.convId);
            notify([f.userId], {
              kind: 'system',
              title: m ? `Reminder: ${userName(m.authorId).split(' ')[0]}’s message${c ? ` in ${label(c)}` : ''}` : 'Reminder',
              body: m ? plain(m.text).slice(0, 120) || m.card?.title : undefined,
              link: m && c ? link(c.id, m) : '/chat/saved',
            });
          }
          return fired;
        },

        /* ---------------- simulation ---------------- */
        simPost(convId, authorId, text, extra = {}) {
          const c = conv(convId);
          if (!c || !c.memberIds.includes(authorId)) return null;
          const m: ChatMessage = { id: uid('m'), convId, authorId, text: replaceShortcodes(text), at: nextAt(convId), reactions: {}, ...extra };
          set((s) => ({ messages: [...s.messages, m] }));
          unhide(c);
          return m;
        },

        simReact(messageId, userId, emoji) {
          const m = msg(messageId);
          if (!m || m.deleted) return;
          const list = m.reactions[emoji] ?? [];
          if (list.includes(userId)) return;
          patchMsg(messageId, (x) => ({ ...x, reactions: { ...x.reactions, [emoji]: [...list, userId] } }));
          set((s) => ({ reactionTimes: { ...s.reactionTimes, [`${messageId}|${emoji}|${userId}`]: Date.now() } }));
        },

        botPost(convId, bot, text, extra = {}) {
          const c = conv(convId);
          if (!c || !c.memberIds.includes(bot)) return null;
          const m: ChatMessage = { id: uid('m'), convId, authorId: bot, text, at: nextAt(convId), reactions: {}, ...extra };
          set((s) => ({ messages: [...s.messages, m] }));
          unhide(c);
          return m;
        },

        recordActive(kind, n) {
          const a = me();
          if (a) bump(a.user.id, kind, n);
        },

        reset() {
          set(freshState());
        },
      };
    },
    {
      name: CHAT_STORE_KEY,
      version: CHAT_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        version: s.version,
        seededAt: s.seededAt,
        conversations: s.conversations,
        messages: s.messages,
        people: s.people,
        stats: s.stats,
        huddles: s.huddles,
        scheduled: s.scheduled,
        vibes: s.vibes,
        coffee: s.coffee,
        reactionTimes: s.reactionTimes,
      }),
      migrate: () => freshState() as unknown as ChatStore,
      merge: (persisted, current) => {
        const p = persisted as Partial<ChatState> | undefined;
        if (!p || p.version !== CHAT_DATA_VERSION || !Array.isArray(p.messages) || !Array.isArray(p.conversations)) return current;
        return { ...current, ...p };
      },
    },
  ),
);

/** Snapshot helpers for non-React callers (bridge, tests). */
export const chatState = () => useChat.getState();
