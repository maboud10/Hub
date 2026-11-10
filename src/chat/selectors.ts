/**
 * Pure derived data over the chat store: message indexes, unread & mention counts, activity feed.
 * Everything is memoised on array identity so React re-renders stay cheap.
 */
import { mentions } from './markdown';
import { hash } from './ids';
import type { ChatData, ChatMessage, Conversation, UserChatState } from './types';

export interface MessageIndex {
  /** convId → top-level messages (+ broadcast thread replies), oldest first. */
  byConv: Map<string, ChatMessage[]>;
  /** parentId → replies, oldest first. */
  threads: Map<string, ChatMessage[]>;
  byId: Map<string, ChatMessage>;
}

const indexCache = new WeakMap<ChatMessage[], MessageIndex>();

export function indexMessages(messages: ChatMessage[]): MessageIndex {
  const hit = indexCache.get(messages);
  if (hit) return hit;
  const byConv = new Map<string, ChatMessage[]>();
  const threads = new Map<string, ChatMessage[]>();
  const byId = new Map<string, ChatMessage>();
  for (const m of messages) {
    byId.set(m.id, m);
    if (m.parentId) {
      const t = threads.get(m.parentId);
      if (t) t.push(m);
      else threads.set(m.parentId, [m]);
      if (!m.broadcast) continue;
    }
    const list = byConv.get(m.convId);
    if (list) list.push(m);
    else byConv.set(m.convId, [m]);
  }
  const asc = (a: ChatMessage, b: ChatMessage) => a.at - b.at;
  for (const l of byConv.values()) l.sort(asc);
  for (const l of threads.values()) l.sort(asc);
  const idx = { byConv, threads, byId };
  indexCache.set(messages, idx);
  return idx;
}

export function emptyPerson(): UserChatState {
  return {
    lastRead: {},
    threadRead: {},
    starred: [],
    muted: [],
    hidden: [],
    saved: [],
    drafts: {},
    emojiRecents: [],
    activitySeenAt: 0,
    notify: {},
    coffeeOptIn: true,
  };
}

export interface ConvState {
  unread: number;
  mentions: number;
  lastAt: number;
  last?: ChatMessage;
  /** First unread message id (for the “New messages” divider). */
  firstUnreadId?: string;
}

/** Unread + mention counts for one conversation and one person. */
export function convState(conv: Conversation, list: ChatMessage[] | undefined, person: UserChatState, userId: string, handle: string | undefined): ConvState {
  const msgs = list ?? [];
  const last = msgs[msgs.length - 1];
  const read = person.lastRead[conv.id] ?? 0;
  let unread = 0;
  let mentionCount = 0;
  let firstUnreadId: string | undefined;
  const direct = conv.kind !== 'channel';
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.at <= read) break;
    if (m.authorId === userId || m.deleted || (m.system && m.system !== 'huddle-start')) continue;
    unread += 1;
    firstUnreadId = m.id;
    if (direct || mentions(m.text, handle)) mentionCount += 1;
  }
  return { unread, mentions: mentionCount, lastAt: last?.at ?? conv.createdAt, last, firstUnreadId };
}

/* ---------------------------------------------------------------- activity */

export type ActivityKind = 'mention' | 'thread' | 'reaction' | 'kudos';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: number;
  convId: string;
  /** Message to jump to. */
  messageId: string;
  /** Thread parent (open the thread panel). */
  parentId?: string;
  /** People who did the thing (most recent first). */
  actorIds: string[];
  emoji?: string;
  /** The message that triggered the item (reply / mention / kudos). */
  message: ChatMessage;
}

export interface ActivityOptions {
  userId: string;
  handle: string | undefined;
  /** Conversations the person can see and is a member of. */
  visible: (convId: string) => boolean;
  now: number;
  /** Optional precise reaction timestamps: `${messageId}|${emoji}|${userId}` → at. */
  reactionTimes?: Map<string, number>;
  limit?: number;
}

/** Mentions, thread replies, reactions to my messages and kudos for me — newest first. */
export function activityFeed(data: Pick<ChatData, 'messages'>, o: ActivityOptions): ActivityItem[] {
  const idx = indexMessages(data.messages);
  const items: ActivityItem[] = [];
  const myThreads = new Set<string>();
  for (const m of data.messages) {
    if (m.authorId === o.userId) {
      if (m.parentId) myThreads.add(m.parentId);
      else if (idx.threads.has(m.id)) myThreads.add(m.id);
    }
  }

  for (const m of data.messages) {
    if (m.deleted || m.system || !o.visible(m.convId)) continue;
    // kudos for me
    if (m.kudos && m.kudos.toId === o.userId && m.authorId !== o.userId) {
      items.push({ id: `k:${m.id}`, kind: 'kudos', at: m.at, convId: m.convId, messageId: m.id, actorIds: [m.authorId], message: m });
      continue;
    }
    // direct mentions (not @here/@channel)
    if (m.authorId !== o.userId && mentions(m.text, o.handle, false)) {
      items.push({ id: `m:${m.id}`, kind: 'mention', at: m.at, convId: m.convId, messageId: m.id, parentId: m.parentId, actorIds: [m.authorId], message: m });
    }
    // reactions to my messages
    if (m.authorId === o.userId) {
      for (const [emoji, users] of Object.entries(m.reactions)) {
        const others = users.filter((u) => u !== o.userId);
        if (!others.length) continue;
        const times = others.map((u) => o.reactionTimes?.get(`${m.id}|${emoji}|${u}`) ?? Math.min(o.now, m.at + ((hash(`${m.id}${emoji}${u}`) % 90) + 2) * 60_000));
        const at = Math.max(...times);
        const ordered = others.map((u, i) => ({ u, t: times[i] })).sort((a, b) => b.t - a.t).map((x) => x.u);
        items.push({ id: `r:${m.id}:${emoji}`, kind: 'reaction', at, convId: m.convId, messageId: m.id, parentId: m.parentId, actorIds: ordered, emoji, message: m });
      }
    }
  }

  // thread replies (aggregated per thread) on threads I started or joined
  for (const parentId of myThreads) {
    const replies = (idx.threads.get(parentId) ?? []).filter((r) => r.authorId !== o.userId && !r.deleted);
    const parent = idx.byId.get(parentId);
    if (!replies.length || !parent || !o.visible(parent.convId)) continue;
    const mine = (idx.threads.get(parentId) ?? []).filter((r) => r.authorId === o.userId).map((r) => r.at);
    const since = parent.authorId === o.userId ? parent.at : Math.min(...mine);
    const after = replies.filter((r) => r.at > since);
    if (!after.length) continue;
    const latest = after[after.length - 1];
    const actors = [...new Set(after.map((r) => r.authorId).reverse())];
    items.push({ id: `t:${parentId}`, kind: 'thread', at: latest.at, convId: parent.convId, messageId: latest.id, parentId, actorIds: actors, message: latest });
  }

  return items.sort((a, b) => b.at - a.at).slice(0, o.limit ?? 120);
}
