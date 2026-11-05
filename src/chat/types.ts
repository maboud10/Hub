import type { KudosValue } from '@/types';

export type ChannelKind = 'public' | 'private' | 'dm' | 'group_dm';

export type ChannelCategory = 'Pulse Core' | 'Culture & Fun' | 'Teams & Hubs' | 'Direct Messages';

export interface ChatChannel {
  id: string;
  name: string;
  topic: string;
  description: string;
  kind: ChannelKind;
  category: ChannelCategory;
  /** Icon / emoji badge for channel */
  emoji?: string;
  /** For DMs / private channels: participant user IDs */
  memberIds: string[];
  /** Optional role restriction (e.g., non-contractors for #exec-sync) */
  excludeRoleIds?: string[];
  unreadCount?: number;
  mentionCount?: number;
  pinnedMessageIds: string[];
  starred?: boolean;
  muted?: boolean;
}

export interface PulseVibe {
  userId: string;
  emoji: string;
  text: string;
  soundTag?: string;
  updatedAt: number;
  expiresLabel?: string;
}

export type MessageKind =
  | 'message'
  | 'poll'
  | 'kudos'
  | 'icebreaker'
  | 'coffee_match'
  | 'standup'
  | 'ship_it'
  | 'voice_note'
  | 'huddle_notes';

export interface PollOption {
  id: string;
  label: string;
  emoji?: string;
  voterIds: string[];
}

export interface PollPayload {
  question: string;
  options: PollOption[];
  anonymous?: boolean;
  multiSelect?: boolean;
  closed?: boolean;
}

export type ChatKudosBadge = 'Teamwork' | 'Craft' | 'Ownership' | 'Customer Love' | 'Spark';

export interface KudosPayload {
  recipientId: string;
  badge: ChatKudosBadge;
  hubValue: KudosValue;
  headline: string;
  boostCount: number;
  boosterIds: string[];
}

export interface IcebreakerAnswer {
  id: string;
  userId: string;
  text: string;
  at: number;
}

export interface IcebreakerPayload {
  question: string;
  category: string;
  promptIndex: number;
  answers: IcebreakerAnswer[];
}

export interface CoffeeMatchPayload {
  pairUserIds: [string, string];
  commonInterests: string[];
  suggestedSpot: string;
  scheduledAt?: string;
  status: 'matched' | 'scheduled' | 'completed';
}

export interface DeepLinkRef {
  label: string;
  route: string;
  kind: 'project' | 'drive' | 'wiki' | 'app';
  meta?: string;
}

export interface StandupPayload {
  yesterday: string;
  today: string;
  blockers: string;
  moodEmoji: string;
  links: DeepLinkRef[];
}

export interface ShipItPayload {
  title: string;
  version: string;
  impact: string;
  highlights: string[];
  teamIds: string[];
  links: DeepLinkRef[];
}

export interface VoiceNotePayload {
  durationSec: number;
  waveform: number[]; // normalized 0.15 - 1.0 heights
  transcript: string;
}

export interface HuddleNotesPayload {
  durationMin: number;
  attendeeIds: string[];
  summary: string;
  decisions: string[];
  actionItems: { id: string; text: string; ownerId: string; done: boolean }[];
}

export interface ThreadReply {
  id: string;
  authorId: string;
  body: string;
  createdAt: number;
  reactions: Record<string, string[]>;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: number;
  editedAt?: number;
  kind: MessageKind;
  pinned?: boolean;
  starredByIds: string[];
  /** emoji -> array of userIds */
  reactions: Record<string, string[]>;
  replies: ThreadReply[];
  // Optional rich payloads by kind
  poll?: PollPayload;
  kudos?: KudosPayload;
  icebreaker?: IcebreakerPayload;
  coffeeMatch?: CoffeeMatchPayload;
  standup?: StandupPayload;
  shipIt?: ShipItPayload;
  voiceNote?: VoiceNotePayload;
  huddleNotes?: HuddleNotesPayload;
  attachments?: DeepLinkRef[];
}

export interface HuddleFloatingReaction {
  id: string;
  userId: string;
  emoji: string;
  at: number;
}

export interface ActiveHuddle {
  channelId: string;
  startedAt: number;
  topic: string;
  participantIds: string[];
  speakingIds: string[];
  mutedIds: string[];
  screenSharerId: string | null;
  screenShareTitle: string;
  captionsEnabled: boolean;
  liveCaptionText: string;
  liveCaptionSpeakerId: string;
  floatingReactions: HuddleFloatingReaction[];
}

export interface NovaCatchUpSummary {
  channelId: string;
  generatedAt: number;
  headline: string;
  messageCount: number;
  keyHighlights: string[];
  decisions: string[];
  openPolls: { messageId: string; question: string; totalVotes: number }[];
  recentKudos: { recipientId: string; badge: ChatKudosBadge; fromId: string }[];
}
