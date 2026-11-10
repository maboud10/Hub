/**
 * Pulse Chat — domain model.
 *
 * Conversation ids
 *  - Channels: `ch-<slug>` (e.g. `ch-general`).
 *  - DMs / group DMs / app (bot) conversations are deterministic:
 *      `dm-` + member ids sorted alphabetically and joined with `--`
 *      e.g. `dm-u-mei--u-omar`, `dm-u-alex--u-mei--u-omar`, `dm-bot-helpdesk--u-mei`.
 *    See `dmId()` in `./ids`. They are created lazily the first time they're opened.
 *
 * Message text is "markdown-lite" (see `./markdown`): **bold**, _italic_, ~~strike~~, `code`,
 * ``` code blocks ```, > quotes, - lists, [links](url), `@handle` mentions (first name, lowercase —
 * see `buildHandles()`), `@here` / `@channel`, `#channel-name` references and `:shortcodes:`.
 */
import type { BridgeCard, WorkspaceAppId } from '@/lib/appBridge';
import type { KudosValue } from '@/types';

export type ConvKind = 'channel' | 'dm' | 'group' | 'app';
export type BotId = 'bot-projects' | 'bot-drive' | 'bot-helpdesk' | 'bot-nova';
export type Mood = 1 | 2 | 3 | 4 | 5;
export type NotifyLevel = 'all' | 'mentions' | 'none';
export type SendEffect = 'confetti' | 'spotlight' | 'lasers' | 'echo';

export interface Conversation {
  id: string;
  kind: ConvKind;
  /** Channel slug without `#` (e.g. `design-crit`). Optional custom name for group DMs; empty for DMs. */
  name: string;
  /** Emoji glyph for channels (user content). */
  icon?: string;
  topic?: string;
  description?: string;
  /** Private channels are visible to members only. DMs, groups and app conversations are always `private`. */
  visibility: 'public' | 'private';
  /** `admins` = announcement-only: channel admins + `hub.news.publish` holders may post. */
  posting: 'everyone' | 'admins';
  memberIds: string[];
  /** Channel admins: edit topic, remove members. */
  adminIds: string[];
  createdBy: string;
  createdAt: number;
  pinnedIds: string[];
  /** `app` conversations: the integration bot on the other side. */
  botId?: BotId;
  /** Linked workspace object, e.g. the Helix Projects project behind `#proj-prism`. */
  linked?: { app: WorkspaceAppId; label: string; to: string };
  /** Mandatory channels can't be left (e.g. #general). */
  mandatory?: boolean;
  archived?: boolean;
}

/* ---------- message payloads ---------- */

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Downscaled data-URL preview (images only). */
  preview?: string;
  width?: number;
  height?: number;
}

/** A Helix Drive file shared into chat (mirrors `BridgeFile`). */
export interface DriveFileRef {
  id: string;
  name: string;
  /** doc | sheet | slides | pdf | image | video | code | archive | other */
  kind: string;
  to: string;
  ownerId: string;
  updatedAt: number;
  /** public | internal | confidential | restricted */
  sensitivity: string;
  size?: number;
}

export interface PollOption {
  id: string;
  text: string;
}

export interface Poll {
  question: string;
  options: PollOption[];
  multi: boolean;
  anonymous: boolean;
  closed: boolean;
  closedAt?: number;
  /** optionId → voter user ids */
  votes: Record<string, string[]>;
}

/** Kudos card. The message `text` is the kudos note. */
export interface KudosPayload {
  toId: string;
  value: KudosValue;
  /** Id of the mirrored entry on the Hub kudos wall (`useHub().kudos`), when one exists. */
  hubKudosId?: string;
}

export interface StandupPayload {
  yesterday: string[];
  today: string[];
  blockers: string[];
}

export interface CelebrationSigner {
  userId: string;
  note: string;
  at: number;
}

export interface CelebrationPayload {
  type: 'birthday' | 'anniversary' | 'welcome';
  /** The person being celebrated. */
  userId: string;
  /** Work anniversaries: number of years. */
  years?: number;
  /** ISO date (yyyy-mm-dd) of the occasion. */
  date: string;
  /** Stable key: `${type}:${userId}:${yyyy}` — one card per occasion. */
  key: string;
  signers: CelebrationSigner[];
}

export interface HuddleActionItem {
  id: string;
  text: string;
  ownerId?: string;
  /** Set once a Helix Projects task was created for it. */
  taskTo?: string;
}

export interface HuddleRecap {
  startedAt: number;
  endedAt: number;
  participantIds: string[];
  keyPoints: string[];
  actionItems: HuddleActionItem[];
}

export interface VoiceNote {
  durationSec: number;
  transcript?: string;
  /** 0..1 amplitudes used to draw the waveform (24–48 values). */
  peaks: number[];
}

export interface CoffeeCard {
  userIds: [string, string];
  /** Conversation starter. */
  prompt: string;
}

/** Answer to the Daily Spark; the message `text` is the answer. */
export interface SparkPayload {
  /** yyyy-mm-dd */
  date: string;
  question: string;
}

export interface DecisionPayload {
  title: string;
  context?: string;
  decidedBy: string;
  decidedAt: number;
  status: 'decided' | 'proposed' | 'reversed';
}

export type SystemEvent = 'join' | 'leave' | 'topic' | 'huddle-start' | 'pin' | 'created' | 'info';

export interface ChatMessage {
  id: string;
  convId: string;
  /** Hub user id, a bot id (`bot-*`) or `system` (rendered as “Pulse”). */
  authorId: string;
  /** markdown-lite (see file header). */
  text: string;
  at: number;
  editedAt?: number;
  /** Soft-deleted: content wiped, tombstone rendered. */
  deleted?: boolean;
  /** Thread replies point at their parent. */
  parentId?: string;
  /** Thread reply that was also sent to the conversation. */
  broadcast?: boolean;
  /** emoji → user ids */
  reactions: Record<string, string[]>;
  attachments?: Attachment[];
  files?: DriveFileRef[];
  /** Rich card from another workspace app. */
  card?: BridgeCard;
  system?: SystemEvent;
  poll?: Poll;
  kudos?: KudosPayload;
  standup?: StandupPayload;
  celebration?: CelebrationPayload;
  huddle?: HuddleRecap;
  voice?: VoiceNote;
  coffee?: CoffeeCard;
  spark?: SparkPayload;
  decision?: DecisionPayload;
  /** “Send with effect” — animates for everyone viewing when it arrives. */
  effect?: SendEffect;
  forwarded?: { messageId: string; convId: string; authorId: string; at: number; text: string };
  /** Bot posts made through the App Bridge: the person on whose behalf the bot posted. */
  via?: string;
}

/* ---------- per-person state (keyed by hub user id) ---------- */

export interface SavedItem {
  messageId: string;
  savedAt: number;
  /** Reminder time (ms). */
  remindAt?: number;
  /** Reminder already delivered. */
  reminded?: boolean;
  done?: boolean;
}

export interface UserChatState {
  /** convId → timestamp of the newest message the person has read. Missing = nothing read. */
  lastRead: Record<string, number>;
  /** thread parent id → timestamp of the newest reply read. */
  threadRead: Record<string, number>;
  /** Starred conversation ids (sidebar “Starred”). */
  starred: string[];
  muted: string[];
  /** DMs closed from the sidebar (re-open on new activity). */
  hidden: string[];
  saved: SavedItem[];
  /** convId (or `thread:<parentId>`) → draft text. */
  drafts: Record<string, string>;
  lastConvId?: string;
  emojiRecents: string[];
  /** Activity items newer than this are “new”. */
  activitySeenAt: number;
  notify: Record<string, NotifyLevel>;
  coffeeOptIn: boolean;
}

export interface EngagementStats {
  /** yyyy-mm-dd keys of days with any chat activity (streaks). */
  activeDays: string[];
  messages: number;
  reactions: number;
  polls: number;
  kudosGiven: number;
  huddles: number;
  sparks: number;
  coffees: number;
  cardsSigned: number;
}

export interface ActiveHuddle {
  convId: string;
  startedAt: number;
  startedBy: string;
  participantIds: string[];
}

export interface ScheduledMessage {
  id: string;
  convId: string;
  authorId: string;
  text: string;
  deliverAt: number;
  createdAt: number;
  parentId?: string;
  effect?: SendEffect;
}

export interface CoffeeMatchRecord {
  id: string;
  userIds: [string, string];
  at: number;
  convId: string;
}

export interface ChatData {
  conversations: Conversation[];
  messages: ChatMessage[];
  people: Record<string, UserChatState>;
  stats: Record<string, EngagementStats>;
  /** Live huddles by conversation id. */
  huddles: Record<string, ActiveHuddle>;
  scheduled: ScheduledMessage[];
  /** yyyy-mm-dd → userId → mood (anonymous in the UI; only aggregates are shown). */
  vibes: Record<string, Record<string, Mood>>;
  coffee: { matches: CoffeeMatchRecord[] };
}

export type ChatResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
