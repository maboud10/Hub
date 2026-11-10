/**
 * Pulse Chat — public App Bridge (see src/lib/appBridge.ts).
 * Powers the global ⌘K palette, Settings → Reset demo and cross-app messaging from Projects, Drive,
 * IT Helpdesk and Performance. Every call re-checks the viewer's permissions (API boundary).
 */
import { AtSign, Bookmark, Bot, Hash, HeartPulse, Headphones, Lock, MessageCirclePlus, MessagesSquare, Sparkles, Trophy, Users, Vote } from 'lucide-react';
import type { BridgeCard, BridgeChannel, BridgeViewer, ChatBridge, PaletteEntry } from '@/lib/appBridge';
import { hasPermission } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { canBotPost, canPost, canView, toViewer } from './access';
import { BOTS } from './constants';
import { dmId, isBotId } from './ids';
import { actorFor, useChat } from './store';
import type { BotId, Conversation } from './types';

const BOT_FOR_APP: Partial<Record<BridgeCard['app'], BotId>> = { projects: 'bot-projects', drive: 'bot-drive', helpdesk: 'bot-helpdesk' };

function nameOf(id: string): string {
  if (id === 'system') return 'Pulse';
  if (isBotId(id)) return BOTS[id].name;
  return useHub.getState().users.find((u) => u.id === id)?.name ?? 'Someone';
}

function convTitle(c: Conversation, viewerId: string): string {
  if (c.kind === 'channel') return `#${c.name}`;
  if (c.kind === 'app' && c.botId) return BOTS[c.botId].name;
  if (c.name) return c.name;
  const others = c.memberIds.filter((m) => m !== viewerId);
  if (!others.length) return `${nameOf(viewerId)} (you)`;
  return others.map((m) => (c.kind === 'group' ? nameOf(m).split(' ')[0] : nameOf(m))).join(', ');
}

const kindOf = (c: Conversation): BridgeChannel['kind'] => (c.kind === 'channel' ? 'channel' : c.kind === 'group' ? 'group' : 'dm');
const routeOf = (c: Conversation | string, messageId?: string) => `/chat/c/${typeof c === 'string' ? c : c.id}${messageId ? `?msg=${messageId}` : ''}`;
const canChat = (v: BridgeViewer) => v.user.active && hasPermission(v.perms, 'app:chat');

export const api: ChatBridge = {
  appId: 'chat',

  paletteEntries(viewer) {
    if (!canChat(viewer)) return [];
    const v = toViewer(viewer.user, viewer.perms);
    const s = useChat.getState();
    const hidden = new Set(s.people[viewer.user.id]?.hidden ?? []);
    const entries: PaletteEntry[] = [
      { id: 'chat:open-general', group: 'Actions', title: 'Open #general', subtitle: 'Pulse Chat', icon: <Hash />, keywords: ['general', 'chat', 'channel', 'slack'], hint: 'Open', to: '/chat/c/ch-general' },
      { id: 'chat:new-message', group: 'Actions', title: 'New message', subtitle: 'Start a DM or group conversation', icon: <MessageCirclePlus />, keywords: ['dm', 'direct message', 'chat', 'write'], hint: 'Compose', to: '/chat?new=dm' },
      { id: 'chat:huddle', group: 'Actions', title: 'Start a huddle', subtitle: 'Live audio with your team', icon: <Headphones />, keywords: ['huddle', 'call', 'voice', 'meet', 'audio'], hint: 'Start', to: '/chat?huddle=1' },
      { id: 'chat:poll', group: 'Actions', title: 'Create a poll', subtitle: 'Ask the team in Pulse Chat', icon: <Vote />, keywords: ['poll', 'vote', 'survey', 'ask'], hint: 'Create', to: '/chat?compose=poll' },
      { id: 'chat:pulse', group: 'Actions', title: 'Pulse hub', subtitle: 'Team vibe, Daily Spark, kudos & celebrations', icon: <HeartPulse />, keywords: ['pulse', 'vibe', 'mood', 'spark', 'coffee', 'celebrations', 'streak'], hint: 'Open', to: '/chat/pulse' },
      { id: 'chat:activity', group: 'Actions', title: 'Chat activity', subtitle: 'Mentions, reactions & thread replies', icon: <AtSign />, keywords: ['mentions', 'activity', 'replies', 'reactions'], hint: 'Open', to: '/chat/activity' },
      { id: 'chat:saved', group: 'Actions', title: 'Saved messages & reminders', subtitle: 'Pulse Chat', icon: <Bookmark />, keywords: ['saved', 'bookmarks', 'later', 'reminders'], hint: 'Open', to: '/chat/saved' },
    ];
    if (hasPermission(viewer.perms, 'hub.kudos.give'))
      entries.splice(4, 0, { id: 'chat:kudos', group: 'Actions', title: 'Send kudos', subtitle: 'Celebrate a teammate in #kudos', icon: <Trophy />, keywords: ['kudos', 'thanks', 'praise', 'shoutout', 'recognition'], hint: 'Send', to: '/chat?compose=kudos' });
    if (!v.contractor)
      entries.push({ id: 'chat:browse', group: 'Actions', title: 'Browse channels', subtitle: 'Find and join channels', icon: <Hash />, keywords: ['channels', 'browse', 'join', 'directory'], hint: 'Browse', to: '/chat/browse' });

    for (const c of s.conversations) {
      if (c.archived || !canView(c, v)) continue;
      if (c.kind !== 'channel' && (hidden.has(c.id) || !c.memberIds.includes(viewer.user.id))) continue;
      const title = convTitle(c, viewer.user.id);
      const others = c.memberIds.filter((m) => m !== viewer.user.id);
      const member = c.memberIds.includes(viewer.user.id);
      entries.push({
        id: `chat:conv:${c.id}`,
        group: 'Work',
        title,
        subtitle:
          c.kind === 'channel'
            ? `${c.topic ?? 'Channel'}${member ? '' : ' · not joined'}`
            : c.kind === 'app'
              ? 'App · Pulse Chat'
              : c.kind === 'group'
                ? `Group · ${others.length + 1} people`
                : (useHub.getState().users.find((u) => u.id === others[0])?.title ?? 'Direct message'),
        icon: c.kind === 'channel' ? c.visibility === 'private' ? <Lock /> : <Hash /> : c.kind === 'app' ? c.botId === 'bot-nova' ? <Sparkles /> : <Bot /> : c.kind === 'group' ? <Users /> : <MessagesSquare />,
        keywords: [c.name, c.topic ?? '', ...others.map(nameOf), c.kind === 'channel' ? 'channel' : 'dm direct message'].filter(Boolean),
        hint: 'Open',
        to: routeOf(c),
      });
    }
    return entries;
  },

  resetDemo() {
    useChat.getState().reset();
  },

  listChannels(viewer) {
    if (!canChat(viewer)) return [];
    const v = toViewer(viewer.user, viewer.perms);
    return useChat
      .getState()
      .conversations.filter((c) => !c.archived && canView(c, v))
      .map((c) => ({ id: c.id, name: convTitle(c, viewer.user.id), kind: kindOf(c), to: routeOf(c) }));
  },

  postToChannel(viewer, input) {
    const actor = actorFor(viewer);
    if (!actor) return { ok: false, error: 'You are not signed in.' };
    const s = useChat.getState();
    const c = s.conversations.find((x) => x.id === input.channelId);
    if (!c || c.kind !== 'channel') return { ok: false, error: 'Channel not found.' };
    const bot = input.asBot ? (input.card ? BOT_FOR_APP[input.card.app] : undefined) : undefined;
    if (input.asBot) {
      const gate = canBotPost(c, actor.viewer);
      if (!gate.ok) {
        useHub.getState().logAudit({ action: 'chat.bridge.post.denied', target: `#${c.name}`, detail: gate.reason, outcome: 'denied', severity: 'warning' });
        return { ok: false, error: gate.reason };
      }
    } else {
      if (!canChat(viewer)) return { ok: false, error: 'Pulse Chat isn’t enabled for your account.' };
      const gate = canPost(c, actor.viewer);
      if (!gate.ok) return { ok: false, error: gate.reason };
    }
    const res = s.send(c.id, { text: input.text, card: input.card }, input.asBot ? (bot ? { bot, internal: true } : { asSystem: true, internal: true }) : {}, actor);
    if (!res.ok) return res;
    return { ok: true, messageId: res.message.id, to: routeOf(c, res.message.id) };
  },

  sendDirect(viewer, input) {
    const actor = actorFor(viewer);
    if (!actor) return { ok: false, error: 'You are not signed in.' };
    const to = useHub.getState().users.find((u) => u.id === input.toUserId);
    if (!to) return { ok: false, error: 'That person isn’t in the directory.' };
    if (!to.active) return { ok: false, error: `${to.name} is no longer active.` };
    const s = useChat.getState();
    if (input.asBot) {
      const bot = (input.card && BOT_FOR_APP[input.card.app]) || 'bot-nova';
      const id = dmId([bot, to.id]);
      const res = s.send(id, { text: input.text, card: input.card }, { bot, internal: true }, actor);
      if (!res.ok) return res;
      return { ok: true, messageId: res.message.id, to: routeOf(id, res.message.id) };
    }
    if (!canChat(viewer)) return { ok: false, error: 'Pulse Chat isn’t enabled for your account.' };
    const opened = s.openDm([to.id], actor);
    if (!opened.ok) return opened;
    const res = s.send(opened.convId, { text: input.text, card: input.card }, {}, actor);
    if (!res.ok) return res;
    return { ok: true, messageId: res.message.id, to: routeOf(opened.convId, res.message.id) };
  },

  dmRoute(viewer, userId) {
    if (!viewer.user.active) return '/chat';
    return `/chat/c/${dmId([viewer.user.id, userId])}`;
  },
};
