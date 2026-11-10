/**
 * Live layer: runs the simulated-teammate engine, Nova replies in the Nova DM, scheduled-message delivery,
 * reminders and gentle ambient presence changes. Mounted once by <ChatPage>.
 */
import { useEffect } from 'react';
import { useHub } from '@/store/hub';
import { currentViewer } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import type { Presence } from '@/types';
import { canView, toViewer } from '@/chat/access';
import { BOTS } from '@/chat/constants';
import { ambientPost, planResponses } from '@/chat/engine';
import { buildHandles, dmId, hash, isBotId } from '@/chat/ids';
import { toPlainText } from '@/chat/markdown';
import { novaAnswer, type NovaWorld } from '@/chat/nova';
import { emptyQuery, matchMessage, parseSearch } from '@/chat/search';
import { convState, emptyPerson, indexMessages } from '@/chat/selectors';
import { useChat } from '@/chat/store';
import type { ChatMessage, Conversation } from '@/chat/types';
import { useChatUI } from './ui';

const PRESENCES: Presence[] = ['online', 'online', 'online', 'focus', 'meeting', 'away'];

function nameOf(id: string) {
  if (id === 'system') return 'Pulse';
  if (isBotId(id)) return BOTS[id].name;
  return useHub.getState().users.find((u) => u.id === id)?.name ?? 'Someone';
}

/** Build the data view Nova answers from (viewer-visible only). */
export function novaWorld(viewerId: string): NovaWorld | null {
  const v = currentViewer();
  if (!v || v.user.id !== viewerId) return null;
  const viewer = toViewer(v.user, v.perms);
  const s = useChat.getState();
  const hub = useHub.getState();
  const handles = buildHandles(hub.users);
  const idx = indexMessages(s.messages);
  const person = s.people[viewerId] ?? emptyPerson();
  const visible = s.conversations.filter((c) => canView(c, viewer));
  const label = (c: Conversation) => (c.kind === 'channel' ? `#${c.name}` : c.kind === 'app' && c.botId ? BOTS[c.botId].name : c.memberIds.filter((m) => m !== viewerId).map(nameOf).join(', ') || 'Notes');
  const plain = (m: ChatMessage) => toPlainText(m.text, {}, { userName: nameOf });
  const ctx = {
    meId: viewerId,
    meHandle: handles.byUser.get(viewerId),
    now: Date.now(),
    userName: nameOf,
    plain,
    convLabel: (id: string) => {
      const c = s.conversations.find((x) => x.id === id);
      return c ? label(c) : 'a conversation';
    },
    replyCount: (id: string) => idx.threads.get(id)?.length ?? 0,
  };
  const unread = visible
    .filter((c) => c.memberIds.includes(viewerId) && !person.muted.includes(c.id) && c.botId !== 'bot-nova')
    .map((c) => {
      const list = idx.byConv.get(c.id) ?? [];
      const read = person.lastRead[c.id] ?? 0;
      return { convId: c.id, label: label(c), messages: list.filter((m) => m.at > read && m.authorId !== viewerId && !m.system && !m.deleted) };
    });
  const searchCtx = {
    now: Date.now(),
    plain,
    handleOf: (id: string) => handles.byUser.get(id),
    authorName: nameOf,
    convKeys: (id: string) => {
      const c = s.conversations.find((x) => x.id === id);
      if (!c) return [];
      return c.kind === 'channel' ? [c.name] : c.memberIds.filter((m) => m !== viewerId).map((m) => `@${handles.byUser.get(m) ?? m}`);
    },
    isSaved: (id: string) => person.saved.some((x) => x.messageId === id),
    isPinned: (m: ChatMessage) => !!s.conversations.find((c) => c.id === m.convId)?.pinnedIds.includes(m.id),
    replyCount: (id: string) => idx.threads.get(id)?.length ?? 0,
  };
  const visibleIds = new Set(visible.map((c) => c.id));
  return {
    ctx,
    unread,
    recentFor: (key) => {
      const k = key.replace(/^[#@]/, '');
      const c =
        visible.find((x) => x.kind === 'channel' && x.name === k) ??
        (() => {
          const uid = handles.byHandle.get(k);
          return uid ? s.conversations.find((x) => x.id === dmId([viewerId, uid])) : undefined;
        })();
      if (!c || !visibleIds.has(c.id)) return null;
      return { convId: c.id, label: label(c), messages: idx.byConv.get(c.id) ?? [] };
    },
    online: hub.users.filter((u) => u.active && u.id !== viewerId && (useChatUI.getState().presence[u.id] ?? u.presence) === 'online').map((u) => u.name),
    search: (q) => {
      const query = parseSearch(q);
      const effective = query.terms.length || query.phrases.length || query.from.length || query.in.length ? query : emptyQuery();
      return s.messages
        .filter((m) => visibleIds.has(m.convId) && !m.system)
        .map((m) => ({ m, sc: matchMessage(m, effective, searchCtx) }))
        .filter((x): x is { m: ChatMessage; sc: number } => x.sc !== null)
        .sort((a, b) => b.sc - a.sc)
        .map((x) => x.m);
    },
    person: (h) => {
      const id = handles.byHandle.get(h);
      const u = id ? hub.users.find((x) => x.id === id) : undefined;
      return u ? { id: u.id, name: u.name, title: u.title } : null;
    },
    authoredBy: (uid) =>
      s.messages
        .filter((m) => m.authorId === uid && visibleIds.has(m.convId) && !m.deleted)
        .sort((a, b) => b.at - a.at),
    link: (convId, messageId) => `/chat/c/${convId}${messageId ? `?msg=${messageId}` : ''}`,
  };
}

const NOVA_WELCOME = (first: string) =>
  [
    `Hi ${first} — I’m **Nova**, your AI teammate in Pulse Chat ✨`,
    'Ask me to **catch you up**, **summarize #design-crit**, **remind me to … in 1h**, **find** anything, or **draft kudos for @someone**.',
  ].join('\n');

/** Post Nova's welcome the first time the Nova conversation is opened. */
export function ensureNovaWelcome(convId: string, viewerId: string) {
  const s = useChat.getState();
  const c = s.conversations.find((x) => x.id === convId);
  if (!c || c.botId !== 'bot-nova') return;
  if (s.messages.some((m) => m.convId === convId)) return;
  s.botPost(convId, 'bot-nova', NOVA_WELCOME(nameOf(viewerId).split(' ')[0]));
  s.markRead(convId);
}

const BOT_HELP: Record<string, string> = {
  'bot-projects': 'I post task assignments, approvals and milestones from **Helix Projects** here. Tip: type `/task Title` in any conversation, or use **More → Create task** on a message.',
  'bot-drive': 'I let you know when files are shared with you or someone comments in **Helix Drive**. Attach a Drive file to any message with **+ → From Drive**.',
  'bot-helpdesk': 'I keep you posted on your **IT Helpdesk** tickets. Type `/ticket What’s wrong` anywhere, or use **More → Report to IT** on a message.',
};

export function useLiveEngine(viewerId: string | undefined) {
  useEffect(() => {
    if (!viewerId) return;
    const timers = new Set<number>();
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const seen = new Set(useChat.getState().messages.map((m) => m.id));
    let ambientCount = 0;

    const handleViewerMessage = (m: ChatMessage) => {
      const s = useChat.getState();
      const ui = useChatUI.getState();
      const conv = s.conversations.find((c) => c.id === m.convId);
      if (!conv) return;

      if (conv.kind === 'app' && conv.botId) {
        const bot = conv.botId;
        const world = bot === 'bot-nova' ? novaWorld(viewerId) : null;
        later(450, () => useChatUI.getState().setTyping(conv.id, bot, 1800));
        later(bot === 'bot-nova' ? 1500 : 1100, () => {
          useChatUI.getState().clearTyping(conv.id, bot);
          if (bot === 'bot-nova' && world) {
            const ans = novaAnswer(toPlainText(m.text), world);
            const reply = useChat.getState().botPost(conv.id, 'bot-nova', ans.text);
            if (reply && ans.action?.kind === 'remind') {
              useChat.getState().setReminder(reply.id, ans.action.at);
            }
          } else {
            useChat.getState().botPost(conv.id, bot, BOT_HELP[bot] ?? 'Got it!');
          }
          if (useChatUI.getState().activeConvId === conv.id) useChat.getState().markRead(conv.id);
        });
        return;
      }

      const hub = useHub.getState();
      const plan = planResponses({
        conv,
        message: m,
        viewerId,
        users: hub.users,
        handles: buildHandles(hub.users),
        recent: indexMessages(s.messages).byConv.get(conv.id) ?? [],
        now: Date.now(),
        presenceOf: (id) => ui.presence[id] ?? hub.users.find((u) => u.id === id)?.presence ?? 'offline',
        lastSimulatedAt: ui.lastSim[conv.id],
      });
      for (const r of plan.replies) {
        useChatUI.getState().setLastSim(conv.id, Date.now() + r.delayMs + r.typingMs);
        later(r.delayMs, () => useChatUI.getState().setTyping(conv.id, r.authorId, r.typingMs + 600));
        later(r.delayMs + r.typingMs, () => {
          useChatUI.getState().clearTyping(conv.id, r.authorId);
          const posted = useChat.getState().simPost(conv.id, r.authorId, r.text, m.parentId ? { parentId: m.parentId } : {});
          if (!posted) return;
          const active = useChatUI.getState().activeConvId === conv.id && document.visibilityState === 'visible';
          if (active && !m.parentId) useChat.getState().markRead(conv.id);
          if (!active && conv.kind !== 'channel')
            useHub.getState().pushNotifications([viewerId], { kind: 'work', title: `New message from ${nameOf(r.authorId)}`, body: r.text.slice(0, 120), link: `/chat/c/${conv.id}?msg=${posted.id}` });
        });
      }
      for (const re of plan.reactions) later(re.delayMs, () => useChat.getState().simReact(m.id, re.userId, re.emoji));
    };

    const unsub = useChat.subscribe((state, prev) => {
      if (state.messages === prev.messages) return;
      const fresh: ChatMessage[] = [];
      for (let i = state.messages.length - 1; i >= 0 && fresh.length < 20; i--) {
        const m = state.messages[i];
        if (seen.has(m.id)) {
          if (i < state.messages.length - 25) break;
          continue;
        }
        seen.add(m.id);
        fresh.push(m);
      }
      for (const m of fresh.reverse()) {
        if (m.authorId === viewerId && !m.system && !m.via && Date.now() - m.at < 10_000) handleViewerMessage(m);
      }
    });

    // Scheduled delivery + reminders
    const tick = () => {
      const s = useChat.getState();
      s.deliverDue();
      const fired = s.fireReminders();
      for (const f of fired) {
        if (f.userId !== viewerId) continue;
        const m = useChat.getState().messages.find((x) => x.id === f.messageId);
        toast.info('Reminder', m ? `${nameOf(m.authorId).split(' ')[0]}: ${toPlainText(m.text).slice(0, 90) || m.card?.title || 'Saved message'}` : 'You asked me to remind you.');
      }
    };
    tick();
    const tickId = window.setInterval(tick, 15_000);

    // Ambient life: presence shifts + a rare post in a channel you're not looking at.
    const ambientId = window.setInterval(() => {
      const hub = useHub.getState();
      const s = useChat.getState();
      const ui = useChatUI.getState();
      const seed = hash(`${Date.now()}`);
      const pool = hub.users.filter((u) => u.active && u.id !== viewerId && !u.persona);
      if (pool.length) {
        const u = pool[seed % pool.length];
        ui.setPresence(u.id, PRESENCES[(seed >> 4) % PRESENCES.length]);
      }
      if (ambientCount >= 4 || (seed >> 8) % 3 !== 0) return;
      const viewerRec = currentViewer();
      if (!viewerRec) return;
      const v = toViewer(viewerRec.user, viewerRec.perms);
      const person = s.people[viewerId] ?? emptyPerson();
      const idx = indexMessages(s.messages);
      const candidates = s.conversations.filter(
        (c) => c.kind === 'channel' && c.memberIds.includes(viewerId) && canView(c, v) && c.id !== ui.activeConvId && !person.muted.includes(c.id) && convState(c, idx.byConv.get(c.id), person, viewerId, undefined).unread < 6,
      );
      if (!candidates.length) return;
      const conv = candidates[(seed >> 12) % candidates.length];
      const post = ambientPost(conv, hub.users, viewerId, seed >> 3, (id) => ui.presence[id] ?? hub.users.find((u) => u.id === id)?.presence ?? 'offline');
      if (!post) return;
      ambientCount += 1;
      ui.setTyping(conv.id, post.authorId, 2200);
      later(2200, () => {
        useChatUI.getState().clearTyping(conv.id, post.authorId);
        useChat.getState().simPost(conv.id, post.authorId, post.text);
      });
    }, 70_000);

    return () => {
      unsub();
      window.clearInterval(tickId);
      window.clearInterval(ambientId);
      for (const id of timers) window.clearTimeout(id);
    };
  }, [viewerId]);
}
