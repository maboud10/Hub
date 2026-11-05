import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { KudosValue, User } from '@/types';
import { useHub } from '@/store/hub';
import { uid } from '@/lib/id';
import type {
  ActiveHuddle,
  ChatChannel,
  ChatKudosBadge,
  ChatMessage,
  DeepLinkRef,
  NovaCatchUpSummary,
  PulseVibe,
  ShipItPayload,
  StandupPayload,
  ThreadReply,
} from './types';
import {
  COFFEE_SPOTS,
  createChatSeed,
  FALLBACK_CHAT_USERS,
  ICEBREAKER_PROMPTS,
} from './seed';

const BADGE_TO_HUB_VALUE: Record<ChatKudosBadge, KudosValue> = {
  Teamwork: 'teamwork',
  Craft: 'craft',
  Ownership: 'ownership',
  'Customer Love': 'customer',
  Spark: 'innovation',
};

const INTEREST_POOL = [
  'Specialty Coffee ☕',
  'Design Systems 🎨',
  'Sci-Fi Cinema 🎬',
  'Desert Padel 🏓',
  'Mechanical Keyboards ⌨️',
  'AI Agents 🤖',
  'Street Food 🍜',
  'Analog Photography 📷',
  'Lo-Fi Beats 🎧',
  'Running & Trail Hikes 🏃',
];

const CAPTION_LINES: { speakerId: string; text: string }[] = [
  {
    speakerId: 'u-mei',
    text: '“I just shared the updated Prism v2.4 motion tokens on screen — notice how the spring curve settles in 220ms.”',
  },
  {
    speakerId: 'u-omar',
    text: '“Latency across our Dubai and Singapore edge nodes stayed under 19ms during the canary rollout.”',
  },
  {
    speakerId: 'u-layla',
    text: '“Passkey hardware attestation is 100% live — let’s capture the final action items with Nova Huddle Notes.”',
  },
];

export function getAllChatUsers(hubUsers?: User[]): User[] {
  const base = hubUsers ?? useHub.getState().users;
  const map = new Map<string, User>();
  for (const u of base) map.set(u.id, u);
  for (const [id, u] of Object.entries(FALLBACK_CHAT_USERS)) {
    if (!map.has(id)) map.set(id, u);
  }
  return Array.from(map.values());
}

export function resolveChatUser(userId: string, hubUsers?: User[]): User {
  const base = hubUsers ?? useHub.getState().users;
  const found = base.find((u) => u.id === userId) ?? FALLBACK_CHAT_USERS[userId];
  if (found) return found;
  return {
    id: userId,
    name: userId.replace(/^u-/, '').replace(/-/g, ' '),
    email: `${userId}@helix.co`,
    title: 'Team Member',
    department: 'Engineering',
    location: 'Dubai',
    timezone: 'Asia/Dubai',
    roleIds: ['employee'],
    grants: [],
    active: true,
    presence: 'online',
    avatarHue: 195,
    skills: [],
    phone: '—',
    employeeId: 'HX-0999',
    startDate: '2024-01-01',
  };
}

export function canViewChannel(channel: ChatChannel, user: User | null): boolean {
  if (!channel.excludeRoleIds?.length) return true;
  if (!user) return false;
  const isExcluded = user.roleIds.every((r) => channel.excludeRoleIds!.includes(r));
  return !isExcluded;
}

function getCurrentUserId(overrideId?: string): string {
  if (overrideId) return overrideId;
  return useHub.getState().sessionUserId ?? 'u-layla';
}

export interface ChatStoreState {
  channels: ChatChannel[];
  messages: ChatMessage[];
  vibes: Record<string, PulseVibe>;
  activeChannelId: string;
  threadMessageId: string | null;
  activeHuddle: ActiveHuddle | null;
  catchUpSummaries: Record<string, NovaCatchUpSummary>;
  searchQuery: string;
  filterStarredOnly: boolean;

  // Navigation & UI
  setActiveChannel(channelId: string): void;
  openThread(messageId: string | null): void;
  setSearchQuery(query: string): void;
  setFilterStarredOnly(starredOnly: boolean): void;

  // Core Messaging & Reactions
  sendMessage(
    channelId: string,
    body: string,
    opts?: {
      authorId?: string;
      attachments?: DeepLinkRef[];
    },
  ): ChatMessage;
  toggleReaction(messageId: string, emoji: string, userId?: string): void;
  togglePinMessage(messageId: string): void;
  toggleStarMessage(messageId: string, userId?: string): void;
  toggleStarChannel(channelId: string): void;

  // Threads
  replyInThread(parentMessageId: string, body: string, authorId?: string): ThreadReply | null;
  toggleReplyReaction(parentMessageId: string, replyId: string, emoji: string, userId?: string): void;

  // Interactive Cards: Polls
  createPoll(
    channelId: string,
    question: string,
    optionLabels: string[],
    opts?: { anonymous?: boolean; multiSelect?: boolean; authorId?: string },
  ): ChatMessage;
  votePoll(messageId: string, optionId: string, userId?: string): void;

  // Interactive Cards: Kudos & Celebration Drops
  sendKudosCard(
    channelId: string,
    recipientId: string,
    badge: ChatKudosBadge,
    headline: string,
    authorId?: string,
  ): ChatMessage;
  boostKudos(messageId: string, userId?: string): void;

  // Interactive Cards: Watercooler Icebreaker
  dropIcebreaker(channelId?: string, customQuestion?: string, authorId?: string): ChatMessage;
  spinIcebreakerQuestion(messageId: string): void;
  answerIcebreaker(messageId: string, answerText: string, userId?: string): void;

  // Interactive Cards: Coffee Roulette / Donut Match
  spinCoffeeMatch(channelId?: string, existingMessageId?: string): ChatMessage;
  scheduleCoffeeHuddle(messageId: string): void;

  // Interactive Cards: Standup, Ship-It & Voice Note
  postStandup(channelId: string, standup: StandupPayload, body?: string, authorId?: string): ChatMessage;
  postShipIt(channelId: string, shipIt: ShipItPayload, body?: string, authorId?: string): ChatMessage;
  sendVoiceNote(channelId: string, durationSec?: number, transcript?: string, authorId?: string): ChatMessage;

  // Employee Vibe & Mood Status
  setVibe(
    emoji: string,
    text: string,
    soundTag?: string,
    expiresLabel?: string,
    userId?: string,
  ): PulseVibe;
  clearVibe(userId?: string): void;

  // Live Huddles ("Pulse Wave" Audio & Screen Lounge)
  startOrJoinHuddle(channelId?: string, topic?: string): ActiveHuddle;
  leaveHuddle(): void;
  toggleHuddleMute(userId?: string): void;
  toggleHuddleScreenShare(title?: string): void;
  toggleHuddleCaptions(): void;
  cycleHuddleSpeaker(): void;
  throwHuddleReaction(emoji: string, userId?: string): void;
  generateHuddleNotes(channelId?: string): ChatMessage;
  toggleHuddleActionItem(messageId: string, actionItemId: string): void;

  // Nova AI "Catch Me Up" Summarizer
  generateCatchUpSummary(channelId?: string): NovaCatchUpSummary;
  dismissCatchUpSummary(channelId: string): void;

  // Channels & DMs
  startDirectMessage(targetUserId: string): ChatChannel;
  createChannel(input: {
    name: string;
    topic: string;
    description?: string;
    emoji?: string;
    kind?: 'public' | 'private';
  }): ChatChannel;
  resetChat(): void;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => {
      const seed = createChatSeed();

      const pickCoffeePair = (seedCount = 0): [string, string] => {
        const users = getAllChatUsers().filter((u) => u.active);
        const meId = getCurrentUserId();
        const meUser = resolveChatUser(meId);
        const diffDept = users.filter((u) => u.id !== meId && u.department !== meUser.department);
        const pool = diffDept.length >= 2 ? diffDept : users.filter((u) => u.id !== meId);
        const partner = pool[(seedCount + Math.floor(Math.random() * pool.length)) % Math.max(1, pool.length)] ?? resolveChatUser('u-mei');
        return [meUser.id, partner.id];
      };

      return {
        channels: seed.channels,
        messages: seed.messages,
        vibes: seed.vibes,
        activeChannelId: 'ch-general',
        threadMessageId: null,
        activeHuddle: null,
        catchUpSummaries: {},
        searchQuery: '',
        filterStarredOnly: false,

        setActiveChannel(channelId) {
          set((s) => ({
            activeChannelId: channelId,
            channels: s.channels.map((c) =>
              c.id === channelId ? { ...c, unreadCount: 0, mentionCount: 0 } : c,
            ),
          }));
        },

        openThread(messageId) {
          set({ threadMessageId: messageId });
        },

        setSearchQuery(query) {
          set({ searchQuery: query });
        },

        setFilterStarredOnly(starredOnly) {
          set({ filterStarredOnly: starredOnly });
        },

        sendMessage(channelId, body, opts = {}) {
          const authorId = getCurrentUserId(opts.authorId);
          const trimmed = body.trim();
          const msg: ChatMessage = {
            id: uid('msg'),
            channelId,
            authorId,
            body: trimmed,
            createdAt: Date.now(),
            kind: 'message',
            pinned: false,
            starredByIds: [],
            reactions: {},
            replies: [],
            attachments: opts.attachments,
          };
          set((s) => ({
            messages: [...s.messages, msg],
            channels: s.channels.map((c) =>
              c.id === channelId && !c.memberIds.includes(authorId)
                ? { ...c, memberIds: [...c.memberIds, authorId] }
                : c,
            ),
          }));
          return msg;
        },

        toggleReaction(messageId, emoji, userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId) return m;
              const current = m.reactions[emoji] ?? [];
              const exists = current.includes(actorId);
              const next = exists ? current.filter((id) => id !== actorId) : [...current, actorId];
              const nextReactions = { ...m.reactions };
              if (next.length === 0) {
                delete nextReactions[emoji];
              } else {
                nextReactions[emoji] = next;
              }
              return { ...m, reactions: nextReactions };
            }),
          }));
        },

        togglePinMessage(messageId) {
          const target = get().messages.find((m) => m.id === messageId);
          if (!target) return;
          const nextPinned = !target.pinned;
          set((s) => ({
            messages: s.messages.map((m) => (m.id === messageId ? { ...m, pinned: nextPinned } : m)),
            channels: s.channels.map((c) => {
              if (c.id !== target.channelId) return c;
              const ids = nextPinned
                ? [...new Set([...c.pinnedMessageIds, messageId])]
                : c.pinnedMessageIds.filter((id) => id !== messageId);
              return { ...c, pinnedMessageIds: ids };
            }),
          }));
        },

        toggleStarMessage(messageId, userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId) return m;
              const starred = m.starredByIds.includes(actorId);
              return {
                ...m,
                starredByIds: starred
                  ? m.starredByIds.filter((id) => id !== actorId)
                  : [...m.starredByIds, actorId],
              };
            }),
          }));
        },

        toggleStarChannel(channelId) {
          set((s) => ({
            channels: s.channels.map((c) => (c.id === channelId ? { ...c, starred: !c.starred } : c)),
          }));
        },

        replyInThread(parentMessageId, body, authorId) {
          const trimmed = body.trim();
          if (!trimmed) return null;
          const actorId = getCurrentUserId(authorId);
          const reply: ThreadReply = {
            id: uid('rep'),
            authorId: actorId,
            body: trimmed,
            createdAt: Date.now(),
            reactions: {},
          };
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === parentMessageId ? { ...m, replies: [...m.replies, reply] } : m,
            ),
          }));
          return reply;
        },

        toggleReplyReaction(parentMessageId, replyId, emoji, userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== parentMessageId) return m;
              return {
                ...m,
                replies: m.replies.map((r) => {
                  if (r.id !== replyId) return r;
                  const list = r.reactions[emoji] ?? [];
                  const next = list.includes(actorId)
                    ? list.filter((id) => id !== actorId)
                    : [...list, actorId];
                  const nextReactions = { ...r.reactions };
                  if (next.length === 0) delete nextReactions[emoji];
                  else nextReactions[emoji] = next;
                  return { ...r, reactions: nextReactions };
                }),
              };
            }),
          }));
        },

        createPoll(channelId, question, optionLabels, opts = {}) {
          const authorId = getCurrentUserId(opts.authorId);
          const cleanOptions = optionLabels
            .map((l) => l.trim())
            .filter(Boolean)
            .map((label, idx) => ({
              id: uid(`opt-${idx}`),
              label,
              voterIds: idx === 0 ? [authorId] : [],
            }));
          const msg: ChatMessage = {
            id: uid('msg-poll'),
            channelId,
            authorId,
            body: `📊 **Live Poll**: ${question.trim()}`,
            createdAt: Date.now(),
            kind: 'poll',
            pinned: false,
            starredByIds: [],
            reactions: { '📊': [authorId] },
            replies: [],
            poll: {
              question: question.trim(),
              options: cleanOptions,
              anonymous: opts.anonymous ?? false,
              multiSelect: opts.multiSelect ?? false,
            },
          };
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        votePoll(messageId, optionId, userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.poll) return m;
              const isMulti = Boolean(m.poll.multiSelect);
              const alreadyVotedThisOption = m.poll.options
                .find((o) => o.id === optionId)
                ?.voterIds.includes(actorId);

              const nextOptions = m.poll.options.map((o) => {
                if (o.id === optionId) {
                  return {
                    ...o,
                    voterIds: alreadyVotedThisOption
                      ? o.voterIds.filter((id) => id !== actorId)
                      : [...o.voterIds, actorId],
                  };
                }
                if (!isMulti) {
                  return {
                    ...o,
                    voterIds: o.voterIds.filter((id) => id !== actorId),
                  };
                }
                return o;
              });

              return {
                ...m,
                poll: {
                  ...m.poll,
                  options: nextOptions,
                },
              };
            }),
          }));
        },

        sendKudosCard(channelId, recipientId, badge, headline, authorId) {
          const actorId = getCurrentUserId(authorId);
          const hubValue = BADGE_TO_HUB_VALUE[badge] ?? 'teamwork';
          const recipient = resolveChatUser(recipientId);

          // Sync with central NEXUS Hub Kudos store when giving kudos to another colleague
          try {
            const hub = useHub.getState();
            if (hub.sessionUserId && recipientId !== hub.sessionUserId && headline.trim().length >= 5) {
              hub.giveKudos(recipientId, hubValue, headline.trim());
            }
          } catch {
            // Ignore if session lacks permission in a test context
          }

          const msg: ChatMessage = {
            id: uid('msg-kudos'),
            channelId,
            authorId: actorId,
            body: `🎉 Celebrating @${recipient.name.split(' ')[0]} with a **${badge}** Kudos drop!`,
            createdAt: Date.now(),
            kind: 'kudos',
            pinned: false,
            starredByIds: [],
            reactions: { '🎉': [actorId], '👏': [actorId] },
            replies: [],
            kudos: {
              recipientId,
              badge,
              hubValue,
              headline: headline.trim(),
              boostCount: 1,
              boosterIds: [actorId],
            },
          };
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        boostKudos(messageId, userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.kudos) return m;
              const nextBoosters = m.kudos.boosterIds.includes(actorId)
                ? m.kudos.boosterIds
                : [...m.kudos.boosterIds, actorId];
              return {
                ...m,
                kudos: {
                  ...m.kudos,
                  boostCount: m.kudos.boostCount + 1,
                  boosterIds: nextBoosters,
                },
              };
            }),
          }));
        },

        dropIcebreaker(channelId, customQuestion, authorId) {
          const targetChannel = channelId ?? get().activeChannelId;
          const actorId = getCurrentUserId(authorId);
          const idx = Math.floor(Math.random() * ICEBREAKER_PROMPTS.length);
          const prompt = ICEBREAKER_PROMPTS[idx];
          const msg: ChatMessage = {
            id: uid('msg-ib'),
            channelId: targetChannel,
            authorId: actorId,
            body: '🎲 **Watercooler Icebreaker of the Day** — spin a new prompt or drop your quick answer below!',
            createdAt: Date.now(),
            kind: 'icebreaker',
            pinned: false,
            starredByIds: [],
            reactions: { '☕': [actorId] },
            replies: [],
            icebreaker: {
              question: customQuestion?.trim() || prompt.question,
              category: customQuestion ? 'Community Prompt ✨' : prompt.category,
              promptIndex: idx,
              answers: [],
            },
          };
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        spinIcebreakerQuestion(messageId) {
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.icebreaker) return m;
              const nextIndex = (m.icebreaker.promptIndex + 1) % ICEBREAKER_PROMPTS.length;
              const nextPrompt = ICEBREAKER_PROMPTS[nextIndex];
              return {
                ...m,
                icebreaker: {
                  ...m.icebreaker,
                  promptIndex: nextIndex,
                  question: nextPrompt.question,
                  category: nextPrompt.category,
                },
              };
            }),
          }));
        },

        answerIcebreaker(messageId, answerText, userId) {
          const trimmed = answerText.trim();
          if (!trimmed) return;
          const actorId = getCurrentUserId(userId);
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.icebreaker) return m;
              return {
                ...m,
                icebreaker: {
                  ...m.icebreaker,
                  answers: [
                    ...m.icebreaker.answers,
                    {
                      id: uid('ib-ans'),
                      userId: actorId,
                      text: trimmed,
                      at: Date.now(),
                    },
                  ],
                },
              };
            }),
          }));
        },

        spinCoffeeMatch(channelId, existingMessageId) {
          const s = get();
          const pair = pickCoffeePair(s.messages.length);
          const spot = COFFEE_SPOTS[s.messages.length % COFFEE_SPOTS.length];
          const idx = s.messages.length % (INTEREST_POOL.length - 3);
          const commonInterests = INTEREST_POOL.slice(idx, idx + 3);

          if (existingMessageId) {
            let updated: ChatMessage | undefined;
            set((state) => ({
              messages: state.messages.map((m) => {
                if (m.id !== existingMessageId || !m.coffeeMatch) return m;
                updated = {
                  ...m,
                  coffeeMatch: {
                    pairUserIds: pair,
                    commonInterests,
                    suggestedSpot: spot,
                    status: 'matched',
                    scheduledAt: undefined,
                  },
                };
                return updated;
              }),
            }));
            if (updated) return updated;
          }

          const targetChannel = channelId ?? s.activeChannelId;
          const actorId = getCurrentUserId();
          const msg: ChatMessage = {
            id: uid('msg-coffee'),
            channelId: targetChannel,
            authorId: actorId,
            body: '☕ **Coffee Roulette Match!** Two colleagues from different teams have been paired for a 15-minute espresso or virtual lounge break:',
            createdAt: Date.now(),
            kind: 'coffee_match',
            pinned: false,
            starredByIds: [],
            reactions: { '☕': [pair[0], pair[1]] },
            replies: [],
            coffeeMatch: {
              pairUserIds: pair,
              commonInterests,
              suggestedSpot: spot,
              status: 'matched',
            },
          };
          set((state) => ({ messages: [...state.messages, msg] }));
          return msg;
        },

        scheduleCoffeeHuddle(messageId) {
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.coffeeMatch) return m;
              return {
                ...m,
                coffeeMatch: {
                  ...m.coffeeMatch,
                  status: 'scheduled',
                  scheduledAt: 'Today · 15:30 (15m Pulse Coffee Sync)',
                },
              };
            }),
          }));
        },

        postStandup(channelId, standup, body, authorId) {
          const actorId = getCurrentUserId(authorId);
          const msg: ChatMessage = {
            id: uid('msg-standup'),
            channelId,
            authorId: actorId,
            body: body?.trim() || '📋 **Daily Standup Update**',
            createdAt: Date.now(),
            kind: 'standup',
            pinned: false,
            starredByIds: [],
            reactions: { '🚀': [actorId] },
            replies: [],
            standup,
          };
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        postShipIt(channelId, shipIt, body, authorId) {
          const actorId = getCurrentUserId(authorId);
          const msg: ChatMessage = {
            id: uid('msg-ship'),
            channelId,
            authorId: actorId,
            body: body?.trim() || `🚀 **Ship-It Milestone**: ${shipIt.title} (${shipIt.version})`,
            createdAt: Date.now(),
            kind: 'ship_it',
            pinned: false,
            starredByIds: [],
            reactions: { '🚀': [actorId], '🎉': [actorId] },
            replies: [],
            shipIt,
          };
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        sendVoiceNote(channelId, durationSec = 24, transcript, authorId) {
          const actorId = getCurrentUserId(authorId);
          const author = resolveChatUser(actorId);
          const waveform = Array.from({ length: 24 }, (_, i) => {
            const val = 0.25 + Math.abs(Math.sin((i + 1) * 0.65)) * 0.72;
            return Number(val.toFixed(2));
          });
          const msg: ChatMessage = {
            id: uid('msg-vn'),
            channelId,
            authorId: actorId,
            body: `🎙️ Voice note from **${author.name.split(' ')[0]}** (${durationSec}s)`,
            createdAt: Date.now(),
            kind: 'voice_note',
            pinned: false,
            starredByIds: [],
            reactions: { '🎧': [actorId] },
            replies: [],
            voiceNote: {
              durationSec,
              waveform,
              transcript:
                transcript?.trim() ||
                `“Quick async voice update from ${author.name.split(' ')[0]}: all action items for the sprint milestone are green and synced to Helix Projects.”`,
            },
          };
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        setVibe(emoji, text, soundTag, expiresLabel = 'Today', userId) {
          const actorId = getCurrentUserId(userId);
          const vibe: PulseVibe = {
            userId: actorId,
            emoji: emoji || '✨',
            text: text.trim(),
            soundTag: soundTag?.trim() || undefined,
            updatedAt: Date.now(),
            expiresLabel,
          };
          set((s) => ({
            vibes: { ...s.vibes, [actorId]: vibe },
          }));
          try {
            const hub = useHub.getState();
            const currentUser = hub.users.find((u) => u.id === actorId);
            if (currentUser && hub.sessionUserId === actorId) {
              const statusMsg = `${vibe.emoji} ${vibe.text}${vibe.soundTag ? ` · ${vibe.soundTag}` : ''}`;
              hub.setPresence(currentUser.presence, statusMsg);
            }
          } catch {
            // Ignore in isolated test contexts
          }
          return vibe;
        },

        clearVibe(userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => {
            const next = { ...s.vibes };
            delete next[actorId];
            return { vibes: next };
          });
        },

        startOrJoinHuddle(channelId, topic) {
          const s = get();
          const targetChannelId = channelId ?? s.activeChannelId;
          const channel = s.channels.find((c) => c.id === targetChannelId);
          const meId = getCurrentUserId();

          if (s.activeHuddle && s.activeHuddle.channelId === targetChannelId) {
            if (!s.activeHuddle.participantIds.includes(meId)) {
              const updated: ActiveHuddle = {
                ...s.activeHuddle,
                participantIds: [...s.activeHuddle.participantIds, meId],
              };
              set({ activeHuddle: updated });
              return updated;
            }
            return s.activeHuddle;
          }

          const defaultPeers = ['u-amina', 'u-mei', 'u-marcus', 'u-omar'].filter((id) => id !== meId).slice(0, 3);
          const participantIds = [meId, ...defaultPeers];
          const huddle: ActiveHuddle = {
            channelId: targetChannelId,
            startedAt: Date.now(),
            topic:
              topic?.trim() ||
              (channel?.kind === 'dm'
                ? `1:1 Pulse Wave Sync · ${channel.name}`
                : `#${channel?.name ?? 'general'} Live Huddle Lounge`),
            participantIds,
            speakingIds: [meId, defaultPeers[0] ?? 'u-mei'],
            mutedIds: [],
            screenSharerId: null,
            screenShareTitle: 'Prism v2.4 Interactive Token Inspector · Figma & Drive Spec',
            captionsEnabled: true,
            liveCaptionText: CAPTION_LINES[0].text,
            liveCaptionSpeakerId: CAPTION_LINES[0].speakerId,
            floatingReactions: [],
          };
          set({ activeHuddle: huddle });
          return huddle;
        },

        leaveHuddle() {
          set({ activeHuddle: null });
        },

        toggleHuddleMute(userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => {
            if (!s.activeHuddle) return {};
            const isMuted = s.activeHuddle.mutedIds.includes(actorId);
            const mutedIds = isMuted
              ? s.activeHuddle.mutedIds.filter((id) => id !== actorId)
              : [...s.activeHuddle.mutedIds, actorId];
            const speakingIds = isMuted
              ? [...new Set([...s.activeHuddle.speakingIds, actorId])]
              : s.activeHuddle.speakingIds.filter((id) => id !== actorId);
            return {
              activeHuddle: {
                ...s.activeHuddle,
                mutedIds,
                speakingIds,
              },
            };
          });
        },

        toggleHuddleScreenShare(title) {
          const actorId = getCurrentUserId();
          set((s) => {
            if (!s.activeHuddle) return {};
            const sharing = s.activeHuddle.screenSharerId !== null;
            return {
              activeHuddle: {
                ...s.activeHuddle,
                screenSharerId: sharing ? null : actorId,
                screenShareTitle:
                  title ??
                  s.activeHuddle.screenShareTitle ??
                  'Prism v2.4 Token Spec & Canary Latency Telemetry',
              },
            };
          });
        },

        toggleHuddleCaptions() {
          set((s) => {
            if (!s.activeHuddle) return {};
            return {
              activeHuddle: {
                ...s.activeHuddle,
                captionsEnabled: !s.activeHuddle.captionsEnabled,
              },
            };
          });
        },

        cycleHuddleSpeaker() {
          set((s) => {
            if (!s.activeHuddle) return {};
            const idx =
              (CAPTION_LINES.findIndex((c) => c.text === s.activeHuddle?.liveCaptionText) + 1) %
              CAPTION_LINES.length;
            const nextCaption = CAPTION_LINES[idx];
            return {
              activeHuddle: {
                ...s.activeHuddle,
                liveCaptionText: nextCaption.text,
                liveCaptionSpeakerId: nextCaption.speakerId,
                speakingIds: [nextCaption.speakerId],
              },
            };
          });
        },

        throwHuddleReaction(emoji, userId) {
          const actorId = getCurrentUserId(userId);
          set((s) => {
            if (!s.activeHuddle) return {};
            const reaction = {
              id: uid('hreact'),
              userId: actorId,
              emoji,
              at: Date.now(),
            };
            return {
              activeHuddle: {
                ...s.activeHuddle,
                floatingReactions: [...s.activeHuddle.floatingReactions.slice(-9), reaction],
              },
            };
          });
        },

        generateHuddleNotes(channelId) {
          const s = get();
          const targetChannelId = channelId ?? s.activeHuddle?.channelId ?? s.activeChannelId;
          const actorId = getCurrentUserId();
          const attendees = s.activeHuddle?.participantIds ?? [actorId, 'u-mei', 'u-omar', 'u-marcus'];
          const channel = s.channels.find((c) => c.id === targetChannelId);

          const msg: ChatMessage = {
            id: uid('msg-hnotes'),
            channelId: targetChannelId,
            authorId: actorId,
            body: `✨ **Nova AI Huddle Notes** for **${s.activeHuddle?.topic ?? `#${channel?.name ?? 'general'}`}**`,
            createdAt: Date.now(),
            kind: 'huddle_notes',
            pinned: false,
            starredByIds: [actorId],
            reactions: { '✨': [actorId], '🚀': attendees.slice(0, 2) },
            replies: [],
            huddleNotes: {
              durationMin: 14,
              attendeeIds: attendees,
              summary:
                'Aligned on Prism v2.4 design token rollout, verified zero-downtime edge latency (<19ms p99), and locked the Q4 All-Hands lightning demo schedule.',
              decisions: [
                'Ship Dual Harmonic Cyan-Violet speaking ring animation as the default in Pulse Huddles',
                'Keep canary telemetry alerts routed to #ship-it and #ask-it with <10m SLA',
              ],
              actionItems: [
                {
                  id: uid('ai-1'),
                  text: 'Publish final Prism v2.4 token spec in Helix Drive (/drive/file/df-prism-tokens)',
                  ownerId: 'u-mei',
                  done: true,
                },
                {
                  id: uid('ai-2'),
                  text: 'Close milestone task t-p1 on Helix Projects board (/projects/p/prj-prism?task=t-p1)',
                  ownerId: 'u-omar',
                  done: false,
                },
                {
                  id: uid('ai-3'),
                  text: 'Verify hardware passkey attestation across remaining contractor laptops',
                  ownerId: 'u-marcus',
                  done: false,
                },
              ],
            },
            attachments: [
              {
                label: 'Prism Project Task · t-p1',
                route: '/projects/p/prj-prism?task=t-p1',
                kind: 'project',
                meta: 'ACTION ITEM',
              },
              {
                label: 'Prism Token Spec · df-prism-tokens',
                route: '/drive/file/df-prism-tokens',
                kind: 'drive',
                meta: 'REFERENCED SPEC',
              },
            ],
          };

          set((state) => ({ messages: [...state.messages, msg] }));
          return msg;
        },

        toggleHuddleActionItem(messageId, actionItemId) {
          set((s) => ({
            messages: s.messages.map((m) => {
              if (m.id !== messageId || !m.huddleNotes) return m;
              return {
                ...m,
                huddleNotes: {
                  ...m.huddleNotes,
                  actionItems: m.huddleNotes.actionItems.map((item) =>
                    item.id === actionItemId ? { ...item, done: !item.done } : item,
                  ),
                },
              };
            }),
          }));
        },

        generateCatchUpSummary(channelId) {
          const s = get();
          const targetId = channelId ?? s.activeChannelId;
          const channel = s.channels.find((c) => c.id === targetId);
          const chanMsgs = s.messages.filter((m) => m.channelId === targetId);

          const openPolls = chanMsgs
            .filter((m) => m.kind === 'poll' && m.poll)
            .map((m) => ({
              messageId: m.id,
              question: m.poll!.question,
              totalVotes: m.poll!.options.reduce((acc, o) => acc + o.voterIds.length, 0),
            }));

          const recentKudos = chanMsgs
            .filter((m) => m.kind === 'kudos' && m.kudos)
            .map((m) => ({
              recipientId: m.kudos!.recipientId,
              badge: m.kudos!.badge,
              fromId: m.authorId,
            }));

          const keyHighlights = chanMsgs.slice(-4).map((m) => {
            const author = resolveChatUser(m.authorId);
            const cleanBody = m.body.replace(/\*\*/g, '');
            return `${author.name.split(' ')[0]}: ${cleanBody.slice(0, 110)}${cleanBody.length > 110 ? '…' : ''}`;
          });

          const summary: NovaCatchUpSummary = {
            channelId: targetId,
            generatedAt: Date.now(),
            headline: `Nova AI synthesized ${chanMsgs.length} recent messages in ${channel?.kind === 'dm' ? channel.name : `#${channel?.name ?? 'general'}`}`,
            messageCount: chanMsgs.length,
            keyHighlights:
              keyHighlights.length > 0
                ? keyHighlights
                : ['Channel is quiet and caught up — start a poll, kudos drop, or live huddle!'],
            decisions: [
              'Prism v2.4 tokens and zero-downtime edge switchover are live in production',
              'Q4 Global All-Hands lightning demos & team lunch polls are actively collecting votes',
            ],
            openPolls,
            recentKudos,
          };

          set((state) => ({
            catchUpSummaries: { ...state.catchUpSummaries, [targetId]: summary },
          }));
          return summary;
        },

        dismissCatchUpSummary(channelId) {
          set((s) => {
            const next = { ...s.catchUpSummaries };
            delete next[channelId];
            return { catchUpSummaries: next };
          });
        },

        startDirectMessage(targetUserId) {
          const s = get();
          const meId = getCurrentUserId();
          const targetUser = resolveChatUser(targetUserId);
          const existing = s.channels.find(
            (c) =>
              c.kind === 'dm' &&
              (c.id === `dm-${targetUserId.replace(/^u-/, '')}` ||
                (c.memberIds.includes(targetUserId) && c.memberIds.includes(meId))),
          );

          if (existing) {
            set({ activeChannelId: existing.id });
            return existing;
          }

          const newDm: ChatChannel = {
            id: `dm-${targetUserId.replace(/^u-/, '')}`,
            name: targetUser.name,
            topic: `${targetUser.title} · ${targetUser.location}`,
            description: `Direct message with ${targetUser.name}`,
            kind: 'dm',
            category: 'Direct Messages',
            memberIds: [meId, targetUserId],
            unreadCount: 0,
            pinnedMessageIds: [],
          };

          set((state) => ({
            channels: [...state.channels, newDm],
            activeChannelId: newDm.id,
          }));
          return newDm;
        },

        createChannel(input) {
          const meId = getCurrentUserId();
          const slug = input.name
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const id = `ch-${slug || uid('c')}`;
          const existing = get().channels.find((c) => c.id === id);
          if (existing) {
            set({ activeChannelId: existing.id });
            return existing;
          }
          const ch: ChatChannel = {
            id,
            name: slug || input.name.trim(),
            emoji: input.emoji || '💬',
            topic: input.topic.trim() || 'Team collaboration channel',
            description: input.description?.trim() || input.topic.trim() || 'Team channel',
            kind: input.kind ?? 'public',
            category: 'Teams & Hubs',
            memberIds: [meId],
            unreadCount: 0,
            pinnedMessageIds: [],
          };
          set((s) => ({
            channels: [...s.channels, ch],
            activeChannelId: ch.id,
          }));
          return ch;
        },

        resetChat() {
          const fresh = createChatSeed();
          set({
            channels: fresh.channels,
            messages: fresh.messages,
            vibes: fresh.vibes,
            activeChannelId: 'ch-general',
            threadMessageId: null,
            activeHuddle: null,
            catchUpSummaries: {},
            searchQuery: '',
            filterStarredOnly: false,
          });
        },
      };
    },
    {
      name: 'nexus-pulse-chat-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
