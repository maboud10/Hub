/**
 * React hooks over the Pulse Chat store (viewer, names, parse context, conversation lists).
 */
import { useMemo } from 'react';
import type { Presence, User } from '@/types';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { canView, toViewer, type ChatViewer } from '@/chat/access';
import { BOTS } from '@/chat/constants';
import { buildHandles, isBotId } from '@/chat/ids';
import type { ParseContext } from '@/chat/markdown';
import { toPlainText } from '@/chat/markdown';
import { convState, emptyPerson, indexMessages, type ConvState } from '@/chat/selectors';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation, UserChatState } from '@/chat/types';
import { useChatUI } from './ui';

export interface ViewerInfo {
  user: User;
  viewer: ChatViewer;
  handle: string | undefined;
}

export function useViewer(): ViewerInfo | null {
  const user = useSessionUser();
  const perms = usePermissions();
  const users = useHub((s) => s.users);
  return useMemo(() => (user ? { user, viewer: toViewer(user, perms), handle: buildHandles(users).byUser.get(user.id) } : null), [user, perms, users]);
}

export function usePerson(): UserChatState {
  const id = useHub((s) => s.sessionUserId);
  return useChat((s) => (id ? s.people[id] : undefined)) ?? EMPTY_PERSON;
}
const EMPTY_PERSON = emptyPerson();

export interface Names {
  name: (id: string) => string;
  first: (id: string) => string;
  handle: (id: string) => string | undefined;
  user: (id: string) => User | undefined;
  presence: (id: string) => Presence;
}

export function useNames(): Names {
  const users = useHub((s) => s.users);
  const live = useChatUI((s) => s.presence);
  return useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u]));
    const handles = buildHandles(users);
    const name = (id: string) => (id === 'system' ? 'Pulse' : isBotId(id) ? BOTS[id].name : (byId.get(id)?.name ?? 'Unknown'));
    return {
      name,
      first: (id: string) => name(id).split(' ')[0],
      handle: (id: string) => handles.byUser.get(id),
      user: (id: string) => byId.get(id),
      presence: (id: string) => live[id] ?? byId.get(id)?.presence ?? 'offline',
    };
  }, [users, live]);
}

/** Resolution context for markdown-lite (mentions + channel references). */
export function useParseCtx(): ParseContext {
  const users = useHub((s) => s.users);
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => {
    const handles = buildHandles(users);
    const channels = new Map(conversations.filter((c) => c.kind === 'channel').map((c) => [c.name, c.id]));
    return { resolveUser: (h: string) => handles.byHandle.get(h), resolveChannel: (n: string) => channels.get(n) };
  }, [users, conversations]);
}

export function usePlain() {
  const ctx = useParseCtx();
  const names = useNames();
  return useMemo(() => (m: Pick<ChatMessage, 'text'>) => toPlainText(m.text, ctx, { userName: names.name }), [ctx, names]);
}

export function convTitle(c: Conversation, viewerId: string | undefined, names: Pick<Names, 'name' | 'first'>): string {
  if (c.kind === 'channel') return c.name;
  if (c.kind === 'app' && c.botId) return BOTS[c.botId].name;
  if (c.name) return c.name;
  const others = c.memberIds.filter((m) => m !== viewerId);
  if (!others.length) return `${names.name(viewerId ?? '')} (you)`;
  if (c.kind === 'group') return others.map(names.first).join(', ');
  return names.name(others[0]);
}

/** Primary “other person” of a DM (undefined for channels/groups). */
export const dmPeer = (c: Conversation, viewerId: string | undefined) => (c.kind === 'dm' ? (c.memberIds.find((m) => m !== viewerId) ?? viewerId) : undefined);

export interface ConvRow {
  conv: Conversation;
  title: string;
  state: ConvState;
  starred: boolean;
  muted: boolean;
}

/** Conversations shown in the side panel for the viewer (members only, not hidden). */
export function useConvRows(): ConvRow[] {
  const v = useViewer();
  const conversations = useChat((s) => s.conversations);
  const messages = useChat((s) => s.messages);
  const person = usePerson();
  const names = useNames();
  return useMemo(() => {
    if (!v) return [];
    const idx = indexMessages(messages);
    const rows: ConvRow[] = [];
    for (const c of conversations) {
      if (c.archived || !c.memberIds.includes(v.user.id) || !canView(c, v.viewer)) continue;
      const state = convState(c, idx.byConv.get(c.id), person, v.user.id, v.handle);
      if (person.hidden.includes(c.id) && !state.unread) continue;
      rows.push({ conv: c, title: convTitle(c, v.user.id, names), state, starred: person.starred.includes(c.id), muted: person.muted.includes(c.id) });
    }
    return rows;
  }, [v, conversations, messages, person, names]);
}

export interface SideSections {
  starred: ConvRow[];
  channels: ConvRow[];
  direct: ConvRow[];
  apps: ConvRow[];
  /** Flattened order used for alt+↑/↓ navigation. */
  order: ConvRow[];
}

export function useSideSections(filter: 'all' | 'unread' = 'all'): SideSections {
  const rows = useConvRows();
  return useMemo(() => {
    const keep = (r: ConvRow) => filter === 'all' || r.state.unread > 0;
    const byName = (a: ConvRow, b: ConvRow) => a.title.localeCompare(b.title);
    const byRecent = (a: ConvRow, b: ConvRow) => b.state.lastAt - a.state.lastAt;
    const starred = rows.filter((r) => r.starred && keep(r)).sort(byName);
    const rest = rows.filter((r) => !r.starred && keep(r));
    const channels = rest.filter((r) => r.conv.kind === 'channel').sort(byName);
    const direct = rest.filter((r) => r.conv.kind === 'dm' || r.conv.kind === 'group').sort(byRecent).slice(0, 14);
    const apps = rest.filter((r) => r.conv.kind === 'app').sort(byName);
    return { starred, channels, direct, apps, order: [...starred, ...channels, ...direct, ...apps] };
  }, [rows, filter]);
}

/** Totals for rail badges. */
export function useUnreadTotals() {
  const rows = useConvRows();
  return useMemo(() => {
    let mentions = 0;
    let unread = 0;
    for (const r of rows) {
      if (r.muted) continue;
      mentions += r.state.mentions;
      unread += r.state.unread;
    }
    return { mentions, unread };
  }, [rows]);
}

/** Who's typing in a conversation right now (excluding the viewer). */
export function useTyping(convId: string | undefined, viewerId: string | undefined): string[] {
  const list = useChatUI((s) => (convId ? s.typing[convId] : undefined));
  return useMemo(() => (list ?? []).filter((t) => t.until > Date.now() && t.userId !== viewerId).map((t) => t.userId), [list, viewerId]);
}

export const chatLink = (convId: string, opts: { msg?: string; thread?: string } = {}) => {
  const q = new URLSearchParams();
  if (opts.thread) q.set('thread', opts.thread);
  if (opts.msg) q.set('msg', opts.msg);
  const s = q.toString();
  return `/chat/c/${convId}${s ? `?${s}` : ''}`;
};
