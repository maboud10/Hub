/**
 * Helix Mail — "Nova Inbox" domain model.
 *
 * Addressing: every participant is a *contact key* — a hub user id (`u-…`)
 * or an external contact id (`x-…`). Raw email addresses typed in the
 * composer are turned into external contacts when the mail is sent.
 *
 * The signed-in person is the mailbox owner. Each owner has their own
 * mailbox snapshot (threads, drafts, scheduled sends…); shared mailboxes and
 * external contacts are global so teammates see the same queue.
 */
import type { BridgeSource } from '@/lib/appBridge';

/** Nova streams (the inbox is split by intent, not by folder). */
export type MailStream = 'priority' | 'approvals' | 'updates' | 'feed' | 'paper' | 'other';

export type MailFolder = 'inbox' | 'archive' | 'trash' | 'spam' | 'screener' | 'quarantine' | 'sent';

export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export type AttachmentKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'archive' | 'other';

export interface MailAttachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  sizeKb: number;
  sensitivity: Sensitivity;
  /** Linked Helix Drive file. */
  driveId?: string;
  driveTo?: string;
  /** Sent as an authenticated, expiring protected link instead of a raw file. */
  protectedLink?: boolean;
  /** Moved to Drive by the storage cleanup (bytes reclaimed). */
  offloaded?: boolean;
}

/** Privacy-first delivery states — Nova Inbox never tracks opens. */
export type DeliveryState = 'delivered' | 'accepted' | 'scheduled' | 'bounced';

export interface MailMessage {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  at: number;
  body: string;
  attachments?: MailAttachment[];
  delivery?: DeliveryState;
  sensitivity?: DraftSensitivity;
}

export type Sentiment = 'positive' | 'neutral' | 'tense' | 'negative';

export type ThreadCategory = 'security' | 'customer' | 'finance' | 'hiring' | 'ops' | 'product' | 'press' | 'people' | 'leadership';

export interface MeetingSuggestion {
  /** Human label as written in the mail, e.g. "Thursday 14:00 Dubai". */
  label: string;
  dayOffset: number;
  /** Decimal local hour (14.5 = 14:30). */
  startHour: number;
  durationMins: number;
}

/** Signals Nova extracted from the thread (seeded "model output" + engine fallbacks). */
export interface NovaSignals {
  tldr?: string;
  sentiment?: Sentiment;
  /** 0..100 */
  urgency?: number;
  deadlineAt?: number | null;
  /** How many people are blocked waiting on the viewer. */
  blocking?: number;
  actions?: string[];
  meeting?: MeetingSuggestion | null;
  smartReplies?: string[];
  /** Account name used to suggest the CRM record. */
  customer?: string;
  category?: ThreadCategory;
  /** Receipt / invoice total shown in Paper trail. */
  amount?: string;
}

export interface CrmLink {
  kind: 'deal' | 'account';
  id: string;
  label: string;
  to: string;
}

export interface MailThread {
  id: string;
  subject: string;
  stream: MailStream;
  folder: MailFolder;
  labels: string[];
  messages: MailMessage[];
  unread: boolean;
  starred: boolean;
  muted?: boolean;
  snoozedUntil?: number | null;
  snoozedAt?: number | null;
  nova?: NovaSignals;
  /** Seeded Arabic rendering (bodies aligned with `messages`). */
  ar?: { subject: string; tldr?: string; bodies: string[]; actions?: string[] };
  crm?: CrmLink | null;
  ticket?: { id: string; to: string } | null;
  chatShares?: number;
  /** Titles of action items already sent to Helix Projects. */
  projectTasks?: string[];
  /** Follow-up radar for threads the owner sent. */
  followUp?: { active: boolean; afterDays: number } | null;
  /** Created by another app through the Mail bridge. */
  source?: BridgeSource;
}

export type ContactKind = 'customer' | 'vendor' | 'partner' | 'newsletter' | 'saas' | 'receipt' | 'internal' | 'person' | 'phish';

export type AuthResult = 'pass' | 'fail' | 'softfail' | 'none';

export interface TrustSignals {
  spf: AuthResult;
  dkim: AuthResult;
  dmarc: AuthResult;
  domainAgeDays: number;
  /** 0..100 (100 = every link points at reputable domains). */
  linkReputation: number;
  links: number;
}

export type ScreenerState = 'pending' | 'allowed' | 'blocked' | 'reported';

export type ScreenerDestination = 'inbox' | 'feed' | 'paper';

export interface MailContact {
  id: string;
  name: string;
  email: string;
  org: string;
  kind: ContactKind;
  domain: string;
  avatarHue: number;
  title?: string;
  vip?: boolean;
  timezone?: string;
  /** Internal Helix address that isn't a hub user (CEO office, system mailboxes). */
  internal?: boolean;
  trust?: TrustSignals;
  screener?: ScreenerState;
  screenerDestination?: ScreenerDestination;
  unsubscribed?: boolean;
  /** Newsletters: emails per month and share actually opened (Insights clutter). */
  monthlyVolume?: number;
  readRate?: number;
}

/** A resolved participant (hub user or external contact) for rendering. */
export interface ResolvedContact {
  key: string;
  name: string;
  email: string;
  org: string;
  title?: string;
  avatarHue: number;
  timezone?: string;
  presence?: 'online' | 'focus' | 'meeting' | 'away' | 'offline';
  external: boolean;
  hub: boolean;
  kind: ContactKind | 'hub';
  vip?: boolean;
}

export type DraftSensitivity = 'internal' | 'confidential' | 'encrypted';

export type DraftMode = 'new' | 'reply' | 'replyAll' | 'forward';

export type NovaTone = 'concise' | 'friendly' | 'formal';

export interface MailDraft {
  id: string;
  /** Contact keys or raw email addresses. */
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  attachments: MailAttachment[];
  sensitivity: DraftSensitivity;
  mode: DraftMode;
  threadId?: string;
  createdAt: number;
  updatedAt: number;
  source?: BridgeSource;
}

export type ScheduleReason = 'manual' | 'quiet-hours' | 'recipient-online' | 'tomorrow' | 'monday';

export interface ScheduledSend {
  id: string;
  draft: MailDraft;
  sendAt: number;
  reason: ScheduleReason;
  createdAt: number;
  status: 'scheduled' | 'sent' | 'cancelled';
  sentAt?: number;
  threadId?: string;
}

export interface PendingSend {
  id: string;
  draft: MailDraft;
  createdAt: number;
  commitAt: number;
}

export interface MailReminder {
  id: string;
  text: string;
  dueAt: number;
  threadId?: string;
  done: boolean;
}

/* ---------------- Shared mailboxes ---------------- */

export type SharedMailboxId = 'it-support' | 'people-ops' | 'sales' | 'procurement';

export type SharedStatus = 'new' | 'assigned' | 'waiting' | 'resolved';

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
}

export interface SharedMailbox {
  id: SharedMailboxId;
  address: string;
  name: string;
  description: string;
  members: string[];
  departments: string[];
  perms: string[];
  slaMins: number;
  canned: CannedResponse[];
}

export interface SharedNote {
  id: string;
  authorId: string;
  text: string;
  at: number;
}

export interface SharedMessage {
  id: string;
  from: string;
  at: number;
  body: string;
}

/** Simulated teammate presence on a conversation (collision detection). */
export interface PresenceSeed {
  userId: string;
  pattern: 'viewing' | 'typing-cycle';
}

export interface SharedConversation {
  id: string;
  mailboxId: SharedMailboxId;
  subject: string;
  from: string;
  messages: SharedMessage[];
  notes: SharedNote[];
  status: SharedStatus;
  assigneeId?: string | null;
  receivedAt: number;
  assignedAt?: number;
  firstReplyAt?: number;
  resolvedAt?: number;
  slaMins: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  watchers?: PresenceSeed[];
  ticket?: { id: string; to: string } | null;
}

/* ---------------- Approvals ---------------- */

export type ApprovalSource = 'procurement' | 'leave' | 'claim' | 'expense' | 'travel' | 'requisition';

export interface ApprovalItem {
  /** Stable id, e.g. `ap-leave-lv-01`. */
  id: string;
  source: ApprovalSource;
  /** Record id in the source app. */
  sourceId: string;
  title: string;
  requesterId: string;
  amount?: string;
  detail: string;
  steps: string[];
  /** 0-based live stage. */
  current: number;
  at: number;
  openTo: string;
  appLabel: string;
  /** Why it is waiting on the viewer. */
  relation: 'direct' | 'queue' | 'reviewer';
  noteRequiredForReject: boolean;
  canReject: boolean;
  /** true = synthesized from the source app's store; false = seeded demo. */
  live: boolean;
  flags?: string[];
}

export interface ApprovalDecision {
  decision: 'approved' | 'rejected';
  at: number;
  note?: string;
  message?: string;
  /** Snapshot of the item when it was decided (live items vanish from the source queue). */
  item?: ApprovalItem;
}

/* ---------------- Insights & prefs ---------------- */

export interface MailHistory {
  /** Median reply minutes for the last 8 weeks (oldest → newest). */
  replyMinsWeekly: number[];
  /** Baseline email activity: 7 rows (Mon..Sun) × 24 hours. */
  hourly: number[][];
}

export interface MailPrefs {
  /** Batch the Feed into two daily digests (08:30 · 16:30). */
  feedDigest: boolean;
  briefCollapsed: boolean;
  /** Hold sends composed inside quiet hours until they end. */
  holdLateSends: boolean;
  zeroStreak: number;
  zeroLastDay: string | null;
}

export interface PhishReport {
  reportedAt: number;
  ticketId?: string;
  ticketTo?: string;
}

/** Everything that belongs to one mailbox owner. */
export interface MailboxData {
  ownerId: string;
  threads: MailThread[];
  scheduled: ScheduledSend[];
  drafts: MailDraft[];
  reminders: MailReminder[];
  /** Seeded fallback approvals (used when no source app has anything pending). */
  approvals: ApprovalItem[];
  decisions: Record<string, ApprovalDecision>;
  phish: Record<string, PhishReport>;
  /** Timestamps of every message the owner sent (Insights + Wellbeing rhythm). */
  sentLog: number[];
  /** Reply durations (minutes) this week. */
  replyLog: number[];
  history: MailHistory;
  prefs: MailPrefs;
}

export interface MailData extends MailboxData {
  version: number;
  /** External contacts (global). */
  contacts: MailContact[];
  /** Shared mailbox conversations (global). */
  shared: SharedConversation[];
  /** Approvals synthesized from Procurement, HR, Expenses & Talent for the current owner. */
  liveApprovals: ApprovalItem[];
  liveApprovalsAt: number | null;
  pending: PendingSend | null;
  /** Mailboxes of other owners (persona switching). */
  others: Record<string, MailboxData>;
  /** Mail delivered to hub users whose mailbox hasn't been opened yet. */
  inbound: Record<string, MailThread[]>;
}
