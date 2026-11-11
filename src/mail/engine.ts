/**
 * Helix Mail — pure engine (no React, no store). Everything here is unit-tested
 * in `mail.test.ts`: Nova ranking + reason chips, search operators, snooze,
 * quiet-hours scheduling, undo-send, DLP, trust radar / lookalike detection,
 * screener decisions, shared-inbox SLA + collision, approvals fallback,
 * Wellbeing rhythm, Insights stats and the deterministic "Nova" mocks.
 */
import type {
  ApprovalDecision,
  ApprovalItem,
  DraftSensitivity,
  MailAttachment,
  MailContact,
  MailDraft,
  MailHistory,
  MailMessage,
  MailPrefs,
  MailStream,
  MailThread,
  MeetingSuggestion,
  NovaTone,
  ResolvedContact,
  PhishReport,
  ScheduleReason,
  ScheduledSend,
  ScreenerDestination,
  Sensitivity,
  SharedConversation,
  SharedMailbox,
  ThreadCategory,
  TrustSignals,
} from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/* ==========================================================================
   Time helpers (viewer-local clock)
   ========================================================================== */

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local timestamp `dayOffset` days from `base` at decimal `hour` (14.5 = 14:30). */
export function atLocal(base: number, dayOffset: number, hour: number): number {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  const h = Math.floor(hour);
  d.setHours(h, Math.round((hour - h) * 60), 0, 0);
  return d.getTime();
}

/** Days until the next `weekday` (0 = Sun … 6 = Sat) at `hour`; 0 when today and still ahead. */
export function nextWeekdayOffset(now: number, weekday: number, hour = 9): number {
  const today = new Date(now).getDay();
  let diff = (weekday - today + 7) % 7;
  if (diff === 0 && atLocal(now, 0, hour) <= now) diff = 7;
  return diff;
}

export function nextWeekdayAt(now: number, weekday: number, hour = 9): number {
  return atLocal(now, nextWeekdayOffset(now, weekday, hour), hour);
}

/** The coming Monday (strictly after today) at `hour`. */
export function nextMondayAt(now: number, hour: number): number {
  const wd = new Date(now).getDay();
  return atLocal(now, (1 - wd + 7) % 7 || 7, hour);
}

/** Calendar days between `now` and `ts` (negative = past). */
export function dayOffsetOf(ts: number, now: number): number {
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `14.5` → `14:30`. */
export function formatHM(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function zonedParts(tz: string | undefined, ts: number): { hour: number; minute: number; weekday: number } {
  if (!tz) {
    const d = new Date(ts);
    return { hour: d.getHours(), minute: d.getMinutes(), weekday: d.getDay() };
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }).formatToParts(ts);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { hour: Number(get('hour')) % 24, minute: Number(get('minute')), weekday: Math.max(0, days.indexOf(get('weekday'))) };
  } catch {
    const d = new Date(ts);
    return { hour: d.getHours(), minute: d.getMinutes(), weekday: d.getDay() };
  }
}

/** Decimal local hour in a time zone (viewer's clock when `tz` is missing). */
export function localHourIn(tz: string | undefined, ts: number): number {
  const p = zonedParts(tz, ts);
  return p.hour + p.minute / 60;
}

export function localWeekdayIn(tz: string | undefined, ts: number): number {
  return zonedParts(tz, ts).weekday;
}

/** Working hours there (08–19 local, Mon–Fri) — used for the composer's "after hours there" hint. */
export function isAfterHoursThere(tz: string | undefined, ts: number): boolean {
  const h = localHourIn(tz, ts);
  const wd = localWeekdayIn(tz, ts);
  return h < 8 || h >= 19 || wd === 0 || wd === 6;
}

/* ==========================================================================
   Contacts
   ========================================================================== */

export const HELIX_DOMAIN = 'helix.co';

export const isHubKey = (key: string) => key.startsWith('u-');

export function isValidEmail(s: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(s.trim());
}

export function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase().trim() ?? '';
}

/** Stable external contact id for a raw email address. */
export function contactIdForEmail(email: string): string {
  return `x-${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** External = outside Helix (hub users and internal Helix addresses are not). */
export function isExternalRecipient(key: string, contacts: Map<string, MailContact>): boolean {
  if (isHubKey(key)) return false;
  if (key.includes('@')) return emailDomain(key) !== HELIX_DOMAIN;
  const c = contacts.get(key);
  if (!c) return true;
  return !c.internal && c.domain !== HELIX_DOMAIN;
}

/* ==========================================================================
   Nova ranking & reason chips
   ========================================================================== */

export type ReasonId = 'manager' | 'exec' | 'vip' | 'deadline' | 'blocking' | 'asked' | 'waiting' | 'team' | 'security' | 'meeting' | 'mention';

export type ChipTone = 'app' | 'danger' | 'warning' | 'success' | 'violet' | 'amber' | 'cyan' | 'rose' | 'slate' | 'emerald' | 'indigo' | 'orange' | 'blue';

export interface RankReason {
  id: ReasonId;
  weight: number;
  tone: ChipTone;
  /** Numeric part (people blocked, days waiting). */
  value?: number;
  /** Timestamp part (deadline). */
  at?: number;
}

export interface RankContext {
  ownerId: string;
  /** Contact key of the owner's manager (hub user id or the CEO office contact). */
  managerKey?: string;
  reportIds: string[];
  contacts: Map<string, MailContact>;
  now: number;
  ownerFirstName?: string;
}

export interface RankedThread {
  thread: MailThread;
  score: number;
  reasons: RankReason[];
}

export function lastMessage(t: MailThread): MailMessage {
  return t.messages[t.messages.length - 1];
}

/** Latest message someone else sent to the owner. */
export function lastInbound(t: MailThread, ownerId: string): MailMessage | undefined {
  for (let i = t.messages.length - 1; i >= 0; i--) if (t.messages[i].from !== ownerId) return t.messages[i];
  return undefined;
}

export function threadTime(t: MailThread): number {
  return lastMessage(t)?.at ?? 0;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** English chip text (tooltips, tests, aria). The UI renders the same parts in separate nodes for i18n. */
export function reasonText(r: RankReason, now: number): string {
  switch (r.id) {
    case 'manager':
      return 'From your manager';
    case 'exec':
      return 'Exec office';
    case 'vip':
      return 'VIP customer';
    case 'deadline': {
      if (!r.at) return 'Deadline';
      const off = dayOffsetOf(r.at, now);
      return off <= 0 ? 'Deadline today' : off === 1 ? 'Deadline tomorrow' : `Deadline ${WEEKDAY_SHORT[new Date(r.at).getDay()]}`;
    }
    case 'blocking':
      return `Blocks ${r.value ?? 2} people`;
    case 'asked':
      return 'Asks you';
    case 'waiting':
      return `Waiting ${r.value ?? 1}d`;
    case 'team':
      return 'From your team';
    case 'security':
      return 'Security';
    case 'meeting':
      return 'Meeting request';
    case 'mention':
      return 'Mentions you';
  }
}

export function rankThread(t: MailThread, ctx: RankContext): RankedThread {
  const reasons: RankReason[] = [];
  const push = (r: RankReason) => reasons.push(r);
  const last = lastInbound(t, ctx.ownerId) ?? lastMessage(t);
  const sender = last?.from ?? '';
  const contact = ctx.contacts.get(sender);
  const nova = t.nova ?? {};
  let score = 18;

  if (ctx.managerKey && sender === ctx.managerKey) push({ id: 'manager', weight: 34, tone: 'violet' });
  else if (contact?.internal && /ceo/i.test(contact.title ?? '')) push({ id: 'exec', weight: 26, tone: 'violet' });
  if (contact?.vip || t.messages.some((m) => ctx.contacts.get(m.from)?.vip)) push({ id: 'vip', weight: 28, tone: 'amber' });
  if (ctx.reportIds.includes(sender)) push({ id: 'team', weight: 9, tone: 'cyan' });

  if (nova.deadlineAt && nova.deadlineAt > ctx.now - 12 * HOUR) {
    const days = (nova.deadlineAt - ctx.now) / DAY;
    const weight = days <= 1 ? 30 : days <= 3 ? 24 : days <= 7 ? 12 : 4;
    push({ id: 'deadline', weight, tone: days <= 1 ? 'danger' : 'warning', at: nova.deadlineAt });
  }
  if ((nova.blocking ?? 0) >= 2) push({ id: 'blocking', weight: Math.min(24, 10 + 3 * (nova.blocking ?? 0)), tone: 'rose', value: nova.blocking });

  if (last && last.from !== ctx.ownerId) {
    const addressed = last.to.includes(ctx.ownerId);
    if (addressed && last.body.includes('?')) push({ id: 'asked', weight: 9, tone: 'blue' });
    const replied = t.messages.some((m) => m.from === ctx.ownerId && m.at > last.at);
    const waitedDays = Math.floor((ctx.now - last.at) / DAY);
    if (addressed && !replied && waitedDays >= 1 && t.stream === 'priority') push({ id: 'waiting', weight: Math.min(18, waitedDays * 6), tone: 'orange', value: waitedDays });
    const first = ctx.ownerFirstName?.toLowerCase();
    if (first && last.body.toLowerCase().includes(`@${first}`)) push({ id: 'mention', weight: 8, tone: 'cyan' });
  }
  if (nova.category === 'security' && t.stream !== 'feed') push({ id: 'security', weight: 8, tone: 'danger' });
  if (nova.meeting) push({ id: 'meeting', weight: 5, tone: 'emerald' });

  score += reasons.reduce((s, r) => s + r.weight, 0);
  score += (nova.urgency ?? 0) * 0.22;
  if (t.unread) score += 4;
  if (t.starred) score += 6;
  if (t.muted) score -= 40;
  const penalty: Record<MailStream, number> = { priority: 0, approvals: 0, updates: -14, feed: -38, paper: -28, other: -18 };
  score += penalty[t.stream];
  if (last && last.from !== ctx.ownerId && !last.to.includes(ctx.ownerId) && last.cc.includes(ctx.ownerId)) score -= 8;

  reasons.sort((a, b) => b.weight - a.weight);
  return { thread: t, score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function rankThreads(threads: MailThread[], ctx: RankContext): RankedThread[] {
  return threads.map((t) => rankThread(t, ctx)).sort((a, b) => b.score - a.score || threadTime(b.thread) - threadTime(a.thread));
}

/* ==========================================================================
   Streams, visibility, Feed digest, inbox-zero
   ========================================================================== */

export const STREAM_ORDER: MailStream[] = ['priority', 'approvals', 'updates', 'feed', 'paper', 'other'];

export const isSnoozed = (t: MailThread, now: number) => !!t.snoozedUntil && t.snoozedUntil > now;

/** Feed digest slots: 08:30 and 16:30 local. */
export function digestWindow(now: number): { last: number; next: number } {
  const slots = [-1, 0, 1].flatMap((d) => [atLocal(now, d, 8.5), atLocal(now, d, 16.5)]).sort((a, b) => a - b);
  const last = [...slots].reverse().find((s) => s <= now) ?? slots[0];
  const next = slots.find((s) => s > now) ?? slots[slots.length - 1];
  return { last, next };
}

/** In the Inbox right now (respects snooze and the Feed digest batching). */
export function inInbox(t: MailThread, now: number, prefs?: Pick<MailPrefs, 'feedDigest'>): boolean {
  if (t.folder !== 'inbox' || isSnoozed(t, now)) return false;
  if (prefs?.feedDigest && t.stream === 'feed') return threadTime(t) <= digestWindow(now).last;
  return true;
}

export function heldByDigest(threads: MailThread[], now: number): number {
  const { last } = digestWindow(now);
  return threads.filter((t) => t.folder === 'inbox' && t.stream === 'feed' && !isSnoozed(t, now) && threadTime(t) > last).length;
}

export function streamCounts(threads: MailThread[], now: number, prefs?: Pick<MailPrefs, 'feedDigest'>): Record<MailStream, { total: number; unread: number }> {
  const out = Object.fromEntries(STREAM_ORDER.map((s) => [s, { total: 0, unread: 0 }])) as Record<MailStream, { total: number; unread: number }>;
  for (const t of threads) {
    if (!inInbox(t, now, prefs)) continue;
    out[t.stream].total += 1;
    if (t.unread) out[t.stream].unread += 1;
  }
  return out;
}

/** Threads still standing between the owner and inbox zero (Feed & Paper trail don't count). */
export function toClear(threads: MailThread[], now: number): MailThread[] {
  return threads.filter((t) => t.folder === 'inbox' && !isSnoozed(t, now) && t.stream !== 'feed' && t.stream !== 'paper');
}

/* ==========================================================================
   Search operators
   ========================================================================== */

export interface ParsedSearch {
  text: string[];
  from: string[];
  to: string[];
  label: string[];
  has: string[];
  is: string[];
  in: string[];
}

const OPS = ['from', 'to', 'label', 'has', 'is', 'in'] as const;
type Op = (typeof OPS)[number];

export function parseSearch(q: string): ParsedSearch {
  const out: ParsedSearch = { text: [], from: [], to: [], label: [], has: [], is: [], in: [] };
  const re = /(\w+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    if (m[1]) {
      const op = m[1].toLowerCase();
      const val = (m[2] ?? m[3] ?? '').toLowerCase().trim();
      if (!val) continue;
      if ((OPS as readonly string[]).includes(op)) out[op as Op].push(val);
      else out.text.push(`${op}:${val}`);
    } else {
      const val = (m[4] ?? m[5] ?? '').toLowerCase().trim();
      if (val) out.text.push(val);
    }
  }
  return out;
}

export function isEmptySearch(p: ParsedSearch): boolean {
  return !p.text.length && !p.from.length && !p.to.length && !p.label.length && !p.has.length && !p.is.length && !p.in.length;
}

/** `resolve(key)` returns a searchable "name email org" string for a contact key. */
export function matchesSearch(t: MailThread, p: ParsedSearch, resolve: (key: string) => string, now = Date.now()): boolean {
  const who = (keys: string[]) => keys.map((k) => `${k} ${resolve(k)}`.toLowerCase()).join(' | ');
  if (p.from.length) {
    const senders = who(t.messages.map((m) => m.from));
    if (!p.from.every((v) => senders.includes(v))) return false;
  }
  if (p.to.length) {
    const rcpts = who(t.messages.flatMap((m) => [...m.to, ...m.cc]));
    if (!p.to.every((v) => rcpts.includes(v))) return false;
  }
  if (p.label.length) {
    const labels = t.labels.map((l) => l.toLowerCase());
    if (!p.label.every((v) => labels.some((l) => l.includes(v)))) return false;
  }
  for (const h of p.has) {
    if (h.startsWith('attach') && !t.messages.some((m) => m.attachments?.length)) return false;
    if (h === 'link' && !t.messages.some((m) => /https?:\/\//.test(m.body))) return false;
    if (h === 'meeting' && !t.nova?.meeting) return false;
  }
  for (const s of p.is) {
    if (s === 'unread' && !t.unread) return false;
    if (s === 'read' && t.unread) return false;
    if (s === 'starred' && !t.starred) return false;
    if (s === 'snoozed' && !isSnoozed(t, now)) return false;
  }
  for (const i of p.in) {
    if (i !== t.stream && i !== t.folder && !(i === 'paper-trail' && t.stream === 'paper')) return false;
  }
  if (p.text.length) {
    const hay = [t.subject, ...t.labels, ...t.messages.map((m) => m.body), who(t.messages.map((m) => m.from))].join(' \n ').toLowerCase();
    if (!p.text.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/* ==========================================================================
   Snooze
   ========================================================================== */

export interface TimePreset {
  id: string;
  label: string;
  at: number;
}

export function snoozePresets(now: number): TimePreset[] {
  const today17 = atLocal(now, 0, 17);
  const later = now < today17 - 2 * HOUR ? today17 : Math.ceil((now + 3 * HOUR) / HOUR) * HOUR;
  return [
    { id: 'later', label: 'Later today', at: later },
    { id: 'tomorrow', label: 'Tomorrow', at: atLocal(now, 1, 8) },
    { id: 'weekend', label: 'This weekend', at: nextWeekdayAt(now, 6, 9) },
    { id: 'nextweek', label: 'Next week', at: nextMondayAt(now, 8) },
  ];
}

/** Wake every thread whose snooze has expired: back to the top of the Inbox, unread. */
export function wakeDue(threads: MailThread[], now: number): { threads: MailThread[]; woke: string[] } {
  const woke: string[] = [];
  const next = threads.map((t) => {
    if (t.snoozedUntil && t.snoozedUntil <= now) {
      woke.push(t.id);
      return { ...t, snoozedUntil: null, snoozedAt: null, unread: true, folder: t.folder === 'archive' ? ('inbox' as const) : t.folder };
    }
    return t;
  });
  return { threads: woke.length ? next : threads, woke };
}

/* ==========================================================================
   Quiet hours & schedule send
   ========================================================================== */

export interface QuietWindow {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

export const DEFAULT_QUIET: QuietWindow = { enabled: true, startHour: 19, endHour: 8 };

export function isQuietHour(hour: number, q: QuietWindow): boolean {
  if (!q.enabled || q.startHour === q.endHour) return false;
  return q.startHour > q.endHour ? hour >= q.startHour || hour < q.endHour : hour >= q.startHour && hour < q.endHour;
}

export function isQuietAt(ts: number, q: QuietWindow): boolean {
  const d = new Date(ts);
  return isQuietHour(d.getHours() + d.getMinutes() / 60, q);
}

/** The next moment quiet hours end (today or tomorrow at `endHour`:00). */
export function nextQuietEnd(now: number, q: QuietWindow): number {
  const today = atLocal(now, 0, q.endHour);
  return today > now ? today : atLocal(now, 1, q.endHour);
}

/** First half-hour slot when every recipient is inside 09–18 local on a weekday. */
export function whenOnline(now: number, tzs: (string | undefined)[]): number {
  const zones = [...new Set(tzs.filter((z): z is string => !!z))];
  if (!zones.length) return now;
  const start = Math.ceil(now / (30 * MIN)) * 30 * MIN;
  const ok = (ts: number) =>
    zones.every((z) => {
      const h = localHourIn(z, ts);
      const wd = localWeekdayIn(z, ts);
      return h >= 9 && h < 18 && wd !== 0 && wd !== 6;
    });
  if (ok(now)) return now;
  for (let ts = start; ts < now + 7 * DAY; ts += 30 * MIN) if (ok(ts)) return ts;
  return start;
}

export interface SchedulePreset extends TimePreset {
  reason: ScheduleReason;
  /** `quiet`: composing inside quiet hours right now. `online`: recipients are already online. */
  active?: boolean;
}

export function schedulePresets(now: number, q: QuietWindow, tzs: (string | undefined)[]): SchedulePreset[] {
  const inQuiet = isQuietAt(now, q);
  const online = whenOnline(now, tzs);
  return [
    { id: 'tomorrow', label: 'Tomorrow 08:00', at: atLocal(now, 1, 8), reason: 'tomorrow' },
    { id: 'monday', label: 'Monday 09:00', at: nextMondayAt(now, 9), reason: 'monday' },
    { id: 'online', label: 'When they’re online', at: online, reason: 'recipient-online', active: online <= now },
    { id: 'quiet', label: 'Respect quiet hours', at: inQuiet ? nextQuietEnd(now, q) : now, reason: 'quiet-hours', active: inQuiet },
  ];
}

export function dueScheduled(list: ScheduledSend[], now: number): ScheduledSend[] {
  return list.filter((s) => s.status === 'scheduled' && s.sendAt <= now);
}

/* ==========================================================================
   Undo send
   ========================================================================== */

export const UNDO_MS = 5000;

export function undoRemaining(p: { commitAt: number } | null, now: number): number {
  return p ? Math.max(0, p.commitAt - now) : 0;
}

/* ==========================================================================
   DLP guard
   ========================================================================== */

export type DlpCode = 'external-restricted' | 'external-confidential' | 'external-confidential-encrypted' | 'external-internal' | 'confidential-body';

export interface DlpIssue {
  level: 'block' | 'warn';
  code: DlpCode;
  attachmentId?: string;
  name?: string;
  sensitivity?: Sensitivity;
  recipients: string[];
}

export interface DlpResult {
  level: 'ok' | 'warn' | 'block';
  issues: DlpIssue[];
  external: string[];
}

export function dlpCheck(d: Pick<MailDraft, 'to' | 'cc' | 'attachments'> & { sensitivity: DraftSensitivity }, isExternal: (key: string) => boolean): DlpResult {
  const external = [...d.to, ...d.cc].filter(isExternal);
  const issues: DlpIssue[] = [];
  if (external.length) {
    for (const a of d.attachments) {
      if (a.protectedLink) continue;
      const base = { attachmentId: a.id, name: a.name, sensitivity: a.sensitivity, recipients: external };
      if (a.sensitivity === 'restricted') issues.push({ ...base, level: 'block', code: 'external-restricted' });
      else if (a.sensitivity === 'confidential')
        issues.push(d.sensitivity === 'encrypted' ? { ...base, level: 'warn', code: 'external-confidential-encrypted' } : { ...base, level: 'block', code: 'external-confidential' });
      else if (a.sensitivity === 'internal') issues.push({ ...base, level: 'warn', code: 'external-internal' });
    }
    if (d.sensitivity === 'confidential') issues.push({ level: 'warn', code: 'confidential-body', recipients: external });
  }
  return { level: issues.some((i) => i.level === 'block') ? 'block' : issues.length ? 'warn' : 'ok', issues, external };
}

/* ==========================================================================
   Nova trust radar — SPF / DKIM / DMARC, domain age, lookalikes, links
   ========================================================================== */

const BRANDS: Record<string, string[]> = {
  helix: ['helix.co'],
  amazon: ['amazon.com', 'amazon.ae'],
  aws: ['aws.amazon.com', 'amazon.com'],
  okta: ['okta.com'],
  github: ['github.com'],
  microsoft: ['microsoft.com'],
  google: ['google.com'],
  docusign: ['docusign.com', 'docusign.net'],
  emirates: ['emirates.com'],
  aramex: ['aramex.com'],
  dpworld: ['dpworld.com'],
};

const SUSPICIOUS = ['secure', 'support', 'billing', 'login', 'verify', 'mail', 'account', 'sso', 'helpdesk', 'invoice'];

export function normalizeHomoglyphs(s: string): string {
  return s
    .toLowerCase()
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const isOfficial = (domain: string, off: string) => domain === off || domain.endsWith(`.${off}`);

/** Returns the brand domain a sender domain impersonates (e.g. `he1ix-co.com` → `helix.co`), or null. */
export function detectLookalike(domain: string): string | null {
  const d = domain.toLowerCase().trim();
  if (!d) return null;
  const labels = d.split('.');
  const base = labels.length > 1 ? labels.slice(0, -1).join('.') : d;
  const squash = (s: string) => normalizeHomoglyphs(s).replace(/[.\-_]/g, '');
  const dBase = squash(base);
  if (Object.values(BRANDS).some((offs) => offs.some((o) => isOfficial(d, o)))) return null;
  for (const [brand, offs] of Object.entries(BRANDS)) {
    for (const off of offs) {
      const offFull = squash(off);
      const offBase = squash(off.split('.').slice(0, -1).join('.'));
      if (dBase === offFull || dBase === offBase) return offs[0];
      if (offBase.length >= 5 && levenshtein(dBase, offBase) === 1) return offs[0];
    }
    const hasBrand = dBase.includes(brand);
    const tricky = d.includes('-') || SUSPICIOUS.some((w) => dBase.includes(w));
    if (hasBrand && tricky) return offs[0];
  }
  return null;
}

export interface TrustCheck {
  id: 'spf' | 'dkim' | 'dmarc' | 'age' | 'lookalike' | 'links';
  label: string;
  ok: boolean;
  warn?: boolean;
  detail: string;
}

export interface TrustReport {
  score: number;
  verdict: 'trusted' | 'caution' | 'danger';
  lookalikeOf: string | null;
  checks: TrustCheck[];
}

export function trustReport(c: Pick<MailContact, 'domain'> & { trust?: TrustSignals }): TrustReport {
  const t: TrustSignals = c.trust ?? { spf: 'none', dkim: 'none', dmarc: 'none', domainAgeDays: 365, linkReputation: 70, links: 0 };
  const lookalikeOf = detectLookalike(c.domain);
  let score = 100;
  score -= t.spf === 'fail' ? 25 : t.spf === 'softfail' ? 12 : t.spf === 'none' ? 10 : 0;
  score -= t.dkim === 'fail' ? 20 : t.dkim === 'none' ? 10 : 0;
  score -= t.dmarc === 'fail' ? 20 : t.dmarc === 'none' ? 8 : 0;
  score -= t.domainAgeDays < 30 ? 25 : t.domainAgeDays < 180 ? 10 : 0;
  if (lookalikeOf) score -= 35;
  if (t.links > 0) score -= t.linkReputation < 30 ? 20 : t.linkReputation < 60 ? 8 : 0;
  score = Math.max(0, Math.min(100, score));
  const auth = (r: string) => r === 'pass';
  const checks: TrustCheck[] = [
    { id: 'spf', label: 'SPF', ok: auth(t.spf), warn: t.spf === 'softfail' || t.spf === 'none', detail: t.spf },
    { id: 'dkim', label: 'DKIM', ok: auth(t.dkim), warn: t.dkim === 'none', detail: t.dkim },
    { id: 'dmarc', label: 'DMARC', ok: auth(t.dmarc), warn: t.dmarc === 'none', detail: t.dmarc },
    { id: 'age', label: 'Domain age', ok: t.domainAgeDays >= 180, warn: t.domainAgeDays >= 30 && t.domainAgeDays < 180, detail: `${t.domainAgeDays}d` },
    { id: 'lookalike', label: 'Lookalike', ok: !lookalikeOf, detail: lookalikeOf ?? 'none' },
    { id: 'links', label: 'Links', ok: t.links === 0 || t.linkReputation >= 60, warn: t.links > 0 && t.linkReputation >= 30 && t.linkReputation < 60, detail: `${t.linkReputation}` },
  ];
  return { score, verdict: score >= 75 ? 'trusted' : score >= 45 ? 'caution' : 'danger', lookalikeOf, checks };
}

/* ==========================================================================
   Screener
   ========================================================================== */

export type ScreenerDecision = { kind: 'allow'; destination: ScreenerDestination } | { kind: 'block' } | { kind: 'report' };

export function applyScreenerDecision(
  threads: MailThread[],
  contacts: MailContact[],
  contactId: string,
  decision: ScreenerDecision,
): { threads: MailThread[]; contacts: MailContact[]; moved: string[] } {
  const moved: string[] = [];
  const stream: MailStream = decision.kind === 'allow' ? (decision.destination === 'feed' ? 'feed' : decision.destination === 'paper' ? 'paper' : 'priority') : 'other';
  const folder = decision.kind === 'allow' ? 'inbox' : decision.kind === 'block' ? 'spam' : 'quarantine';
  const nextThreads = threads.map((t) => {
    if (t.folder !== 'screener' || !t.messages.some((m) => m.from === contactId)) return t;
    moved.push(t.id);
    return { ...t, folder, stream: decision.kind === 'allow' ? stream : t.stream } as MailThread;
  });
  const nextContacts = contacts.map((c) =>
    c.id === contactId
      ? {
          ...c,
          screener: decision.kind === 'allow' ? ('allowed' as const) : decision.kind === 'block' ? ('blocked' as const) : ('reported' as const),
          screenerDestination: decision.kind === 'allow' ? decision.destination : undefined,
        }
      : c,
  );
  return { threads: nextThreads, contacts: nextContacts, moved };
}

export const PHISH_STEPS = ['Reported', 'Quarantined', 'Security reviewed'] as const;
export const PHISH_REVIEW_MS = 2 * MIN;

/** 0-based live stage of the phishing-report journey (3 = complete). */
export function phishStage(r: PhishReport | undefined, now: number): number {
  if (!r) return 0;
  return now - r.reportedAt >= PHISH_REVIEW_MS ? 3 : 2;
}

/* ==========================================================================
   Shared mailboxes — visibility, SLA, collision, workflow
   ========================================================================== */

export interface SharedViewer {
  id: string;
  department?: string;
  perms: ReadonlySet<string>;
}

export function visibleMailboxes(mailboxes: SharedMailbox[], v: SharedViewer): { mailbox: SharedMailbox; observer: boolean }[] {
  const all = v.perms.has('*');
  const out = mailboxes.filter((m) => all || m.members.includes(v.id) || (!!v.department && m.departments.includes(v.department)) || m.perms.some((p) => v.perms.has(p)));
  if (!out.length && mailboxes[0]) return [{ mailbox: mailboxes[0], observer: true }];
  return out.map((mailbox) => ({ mailbox, observer: false }));
}

export interface SlaState {
  dueAt: number;
  /** Share of the first-response SLA consumed (0..1+). */
  pct: number;
  remainingMins: number;
  breached: boolean;
  met: boolean | null;
}

export function slaState(c: SharedConversation, now: number): SlaState {
  const dueAt = c.receivedAt + c.slaMins * MIN;
  const until = c.firstReplyAt ?? (c.status === 'resolved' ? (c.resolvedAt ?? now) : now);
  const pct = (until - c.receivedAt) / (c.slaMins * MIN);
  const met = c.firstReplyAt ? c.firstReplyAt <= dueAt : null;
  return { dueAt, pct: Math.max(0, pct), remainingMins: Math.round((dueAt - now) / MIN), breached: c.firstReplyAt ? !met : now > dueAt && c.status !== 'resolved', met };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface PresenceNow {
  userId: string;
  mode: 'viewing' | 'typing';
}

/** Simulated live presence on a conversation — deterministic for a given time. */
export function presenceAt(c: SharedConversation, now: number): PresenceNow[] {
  if (c.status === 'resolved') return [];
  return (c.watchers ?? []).map((w) => {
    if (w.pattern === 'viewing') return { userId: w.userId, mode: 'viewing' as const };
    const phase = (Math.floor(now / 9000) + hashStr(c.id + w.userId)) % 3;
    return { userId: w.userId, mode: phase === 0 ? ('viewing' as const) : ('typing' as const) };
  });
}

export function collision(c: SharedConversation, viewerId: string, now: number): { others: PresenceNow[]; typing: PresenceNow | null } {
  const others = presenceAt(c, now).filter((p) => p.userId !== viewerId);
  return { others, typing: others.find((p) => p.mode === 'typing') ?? null };
}

export function assignConversation(c: SharedConversation, userId: string | null, now: number): SharedConversation {
  return {
    ...c,
    assigneeId: userId,
    assignedAt: userId ? now : undefined,
    status: userId ? (c.status === 'new' ? 'assigned' : c.status) : c.status === 'assigned' ? 'new' : c.status,
    watchers: userId ? (c.watchers ?? []).filter((w) => w.userId !== userId) : c.watchers,
  };
}

export function replyToConversation(c: SharedConversation, fromKey: string, body: string, now: number): SharedConversation {
  return {
    ...c,
    messages: [...c.messages, { id: `${c.id}-r${c.messages.length + 1}`, from: fromKey, at: now, body }],
    firstReplyAt: c.firstReplyAt ?? now,
    assigneeId: c.assigneeId ?? fromKey,
    assignedAt: c.assignedAt ?? now,
    status: 'waiting',
  };
}

export const SHARED_STEPS = ['Received', 'Assigned', 'Replied', 'Resolved'] as const;

export function sharedStage(c: SharedConversation): number {
  if (c.status === 'resolved') return 4;
  if (c.firstReplyAt || c.status === 'waiting') return 3;
  if (c.assigneeId) return 2;
  return 1;
}

/* ==========================================================================
   Approvals — live synthesis with seeded fallback
   ========================================================================== */

export interface ApprovalsView {
  mode: 'live' | 'demo';
  pending: ApprovalItem[];
  decided: (ApprovalItem & { decision: ApprovalDecision })[];
}

/**
 * Live items from the source apps win; when nothing is pending anywhere (or
 * the imports failed) Nova falls back to the seeded demo approvals. Once the
 * owner has acted on a live item, the view stays live ("all caught up").
 */
export function mergeApprovals(
  live: ApprovalItem[],
  seeded: ApprovalItem[],
  decisions: Record<string, ApprovalDecision & { item?: ApprovalItem }>,
  now: number,
): ApprovalsView {
  const decidedEntries = Object.entries(decisions);
  const actedLive = decidedEntries.some(([, d]) => d.item?.live);
  const mode: 'live' | 'demo' = live.length > 0 || actedLive ? 'live' : 'demo';
  const base = mode === 'live' ? live : seeded;
  const pending = base.filter((i) => !decisions[i.id]).sort((a, b) => Number(b.relation === 'direct') - Number(a.relation === 'direct') || a.at - b.at);
  const decided = decidedEntries
    .filter(([, d]) => d.item && d.item.live === (mode === 'live') && now - d.at < 6 * HOUR)
    .map(([, d]) => ({ ...(d.item as ApprovalItem), decision: d }))
    .sort((a, b) => b.decision.at - a.decision.at);
  return { mode, pending, decided };
}

/* ==========================================================================
   Wellbeing rhythm & Insights
   ========================================================================== */

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function afterHoursCount(sentLog: number[], q: QuietWindow, since: number, until: number): number {
  return sentLog.filter((ts) => ts >= since && ts <= until && isQuietAt(ts, { ...q, enabled: true })).length;
}

export interface RhythmInput {
  sentLog: number[];
  replyLog: number[];
  unreadPriority: number;
  pendingApprovals: number;
}

export function computeRhythm(i: RhythmInput, q: QuietWindow, now: number): { afterHoursSentThisWeek: number; unread: number; avgReplyMins: number } {
  return {
    afterHoursSentThisWeek: afterHoursCount(i.sentLog, q, now - 7 * DAY, now),
    unread: i.unreadPriority + i.pendingApprovals,
    avgReplyMins: Math.round(median(i.replyLog)),
  };
}

/** 7 (Mon..Sun) × 24 activity grid: seeded baseline + the owner's real sends from the last 28 days. */
export function emailHeatmap(history: MailHistory, sentLog: number[], now: number): number[][] {
  const grid = history.hourly.map((row) => [...row]);
  for (const ts of sentLog) {
    if (ts < now - 28 * DAY || ts > now) continue;
    const d = new Date(ts);
    const row = (d.getDay() + 6) % 7;
    grid[row][d.getHours()] += 1;
  }
  return grid;
}

export function topCorrespondents(threads: MailThread[], ownerId: string, include: (key: string) => boolean, limit = 6): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (k: string) => k !== ownerId && include(k) && counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const t of threads) {
    if (t.folder === 'trash' || t.folder === 'spam' || t.folder === 'screener' || t.folder === 'quarantine') continue;
    for (const m of t.messages) {
      if (m.from === ownerId) [...m.to, ...m.cc].forEach(bump);
      else bump(m.from);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface ClutterRow {
  contact: MailContact;
  inMailbox: number;
  monthly: number;
  readRate: number;
  suggest: 'unsubscribe' | 'digest' | 'keep';
}

export function newsletterClutter(threads: MailThread[], contacts: MailContact[]): ClutterRow[] {
  return contacts
    .filter((c) => c.kind === 'newsletter' && !c.unsubscribed && c.screener !== 'pending')
    .map((c) => {
      const inMailbox = threads.filter((t) => t.folder !== 'trash' && t.messages.some((m) => m.from === c.id)).length;
      const readRate = c.readRate ?? 0.3;
      return { contact: c, inMailbox, monthly: c.monthlyVolume ?? 4, readRate, suggest: readRate < 0.2 ? ('unsubscribe' as const) : readRate < 0.5 ? ('digest' as const) : ('keep' as const) };
    })
    .sort((a, b) => a.readRate - b.readRate);
}

/** Estimated grams CO2e per MB stored for a year (≈2.5 kg / GB-year, a deliberately rough estimate). */
export const CARBON_G_PER_MB_YEAR = 2.5;

export interface StoredAttachment {
  threadId: string;
  subject: string;
  messageAt: number;
  attachment: MailAttachment;
}

export function attachmentStorage(threads: MailThread[]): { totalKb: number; items: StoredAttachment[]; carbonGramsYear: number; offloadedKb: number } {
  const items: StoredAttachment[] = [];
  let offloadedKb = 0;
  for (const t of threads) {
    if (t.folder === 'trash') continue;
    for (const m of t.messages)
      for (const a of m.attachments ?? []) {
        if (a.offloaded) offloadedKb += a.sizeKb;
        else items.push({ threadId: t.id, subject: t.subject, messageAt: m.at, attachment: a });
      }
  }
  items.sort((a, b) => b.attachment.sizeKb - a.attachment.sizeKb);
  const totalKb = items.reduce((s, i) => s + i.attachment.sizeKb, 0);
  return { totalKb, items, carbonGramsYear: Math.round((totalKb / 1024) * CARBON_G_PER_MB_YEAR * 10) / 10, offloadedKb };
}

/* ==========================================================================
   Nova mocks — TL;DR, actions, meetings, smart replies, brief, drafting
   ========================================================================== */

export function snippetOf(body: string, n = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 1).trimEnd()}…` : flat;
}

export function tldrFor(t: MailThread, ownerId: string): string {
  if (t.nova?.tldr) return t.nova.tldr;
  const m = lastInbound(t, ownerId) ?? lastMessage(t);
  const body = m.body.replace(/^(hi|hello|dear|hey)[^\n]*\n+/i, '');
  const sentences = body.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]/g) ?? [body];
  return snippetOf(sentences.slice(0, 2).join(' '), 220);
}

const ACTION_RE = /\b(please|could you|can you|need you to|would you|kindly|action:)\b/i;

export function extractActions(text: string): string[] {
  const out: string[] = [];
  const sentences = text.replace(/\n+/g, ' ').match(/[^.!?]+[.!?]?/g) ?? [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!ACTION_RE.test(s) && !/\bby (monday|tuesday|wednesday|thursday|friday|eod|end of)/i.test(s)) continue;
    const clean = s
      .replace(/^(so |and |also,? |heads-up:? )/i, '')
      .replace(/^(please|kindly)\s+/i, '')
      .replace(/^(could|can|would) you( please)?\s+/i, '')
      .replace(/^i need you to\s+/i, '')
      .replace(/[?.!]+$/, '')
      .trim();
    if (clean.length < 8 || clean.length > 120) continue;
    out.push(clean[0].toUpperCase() + clean.slice(1));
    if (out.length >= 4) break;
  }
  return out;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TZ_WORDS: Record<string, string> = { dubai: 'Dubai', gst: 'GST', uae: 'UAE', london: 'London', uk: 'UK', singapore: 'Singapore', sgt: 'SGT' };

/** Finds "Thursday 14:00 Dubai" / "Tuesday at 10:30" / "tomorrow at 3pm" in free text. */
export function detectMeeting(text: string, now: number, durationMins = 30): MeetingSuggestion | null {
  const re = /\b(tomorrow|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b[,\s]*(?:at\s*)?(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?(?:\s+(dubai|gst|uae|london|uk|singapore|sgt)\b)?/i;
  const m = re.exec(text);
  if (!m) return null;
  let hour = Number(m[2]);
  const minutes = m[3] ? Number(m[3]) : 0;
  const ampm = m[4]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minutes > 59) return null;
  const startHour = hour + minutes / 60;
  const word = m[1].toLowerCase();
  const dayOffset = word === 'tomorrow' ? 1 : nextWeekdayOffset(now, WEEKDAYS.indexOf(word), startHour);
  const dayLabel = word === 'tomorrow' ? 'Tomorrow' : word[0].toUpperCase() + word.slice(1);
  const tz = m[5] ? TZ_WORDS[m[5].toLowerCase()] : '';
  return { label: `${dayLabel} ${formatHM(startHour)}${tz ? ` ${tz}` : ''}`, dayOffset, startHour, durationMins };
}

const DEFAULT_REPLIES: Record<ThreadCategory | 'default', string[]> = {
  security: ['Thanks — I’ll review and come back today.', 'Can we take this to a 15-minute call?', 'Looping in Ethan from Security.'],
  customer: ['Thank you — we’re on it and will share a plan shortly.', 'Could we set up a short call this week?', 'Looping in the account team.'],
  finance: ['Will send the numbers by end of day.', 'Can we align on this in our next sync?', 'Approved from my side.'],
  hiring: ['Works for me — please send the invite.', 'Let’s move fast on this one.', 'Can you share the scorecards first?'],
  ops: ['Thanks for the heads-up.', 'Approved — please go ahead.', 'Can we discuss options tomorrow?'],
  product: ['Love it — a few notes coming.', 'Can we walk through it live?', 'Approved from a security angle.'],
  press: ['Approved — please use it.', 'Let me tweak the wording first.', 'Let’s decline this one.'],
  people: ['Sounds good — see you then.', 'Let me add a couple of topics.', 'Thanks for preparing this.'],
  leadership: ['On it — I’ll share a draft shortly.', 'Can we find 20 minutes to align?', 'Thanks, will do.'],
  default: ['Thanks — noted.', 'Can we discuss live?', 'I’ll get back to you today.'],
};

const AR_REPLIES: Record<ThreadCategory | 'default', string[]> = {
  security: ['شكراً — سأراجع الأمر وأعود إليك اليوم.', 'هل يمكننا مناقشة ذلك في مكالمة مدتها 15 دقيقة؟', 'أضفت إيثان من فريق الأمن إلى المحادثة.'],
  customer: ['شكراً لكم — نعمل على الأمر وسنشارك خطة قريباً.', 'هل يمكننا ترتيب مكالمة قصيرة هذا الأسبوع؟', 'أضفت فريق الحساب إلى المحادثة.'],
  finance: ['سأرسل الأرقام قبل نهاية اليوم.', 'هل يمكننا الاتفاق على ذلك في اجتماعنا القادم؟', 'موافق من جهتي.'],
  hiring: ['يناسبني — أرسل الدعوة من فضلك.', 'لنتحرك بسرعة في هذا الأمر.', 'هل يمكنك مشاركة بطاقات التقييم أولاً؟'],
  ops: ['شكراً على التنبيه.', 'موافق — تفضّل بالمتابعة.', 'هل يمكننا مناقشة الخيارات غداً؟'],
  product: ['رائع — سأرسل بعض الملاحظات.', 'هل يمكننا استعراضه معاً مباشرة؟', 'موافق من الناحية الأمنية.'],
  press: ['موافق — يمكنكم استخدامه.', 'دعني أعدّل الصياغة أولاً.', 'لنعتذر عن هذا الطلب.'],
  people: ['يبدو جيداً — أراك حينها.', 'دعني أضيف موضوعين للنقاش.', 'شكراً على التحضير.'],
  leadership: ['أعمل عليه — سأشارك مسودة قريباً.', 'هل يمكننا تخصيص 20 دقيقة للتنسيق؟', 'شكراً، سأتولى الأمر.'],
  default: ['شكراً — تم الاطلاع.', 'هل يمكننا مناقشة الأمر مباشرة؟', 'سأعود إليك اليوم.'],
};

/** Three Nova smart replies; Arabic ones when the thread is being read in Arabic. */
export function smartRepliesFor(t: MailThread, locale: 'en' | 'ar' = 'en'): string[] {
  if (locale === 'ar') return AR_REPLIES[t.nova?.category ?? 'default'].slice(0, 3);
  return (t.nova?.smartReplies?.length ? t.nova.smartReplies : DEFAULT_REPLIES[t.nova?.category ?? 'default']).slice(0, 3);
}

export function sentimentOf(t: MailThread): { sentiment: 'positive' | 'neutral' | 'tense' | 'negative'; urgency: number } {
  if (t.nova?.sentiment) return { sentiment: t.nova.sentiment, urgency: t.nova.urgency ?? 40 };
  const text = t.messages.map((m) => m.body).join(' ').toLowerCase();
  const tense = /(urgent|escalat|breach|asap|unacceptable|immediately|blocked)/.test(text);
  const positive = /(thank|great|impressed|love|congrat)/.test(text);
  return { sentiment: tense ? 'tense' : positive ? 'positive' : 'neutral', urgency: t.nova?.urgency ?? (tense ? 70 : 35) };
}

/* ---------- Morning brief ---------- */

export interface BriefChip {
  id: string;
  label: string;
  kind: 'thread' | 'stream' | 'route';
  target: string;
  tone: ChipTone;
}

export interface BriefInput {
  locale: 'en' | 'ar';
  now: number;
  ranked: RankedThread[];
  ownerId: string;
  approvals: number;
  screener: number;
  feedCount: number;
  feedHeld: number;
  digestOn: boolean;
  nameOf: (key: string) => string;
  orgOf: (key: string) => string;
  weekdayName: (ts: number) => string;
  /** Marks VIP customer contacts — the brief names their organisation, not whoever forwarded the thread. */
  isVip?: (key: string) => boolean;
}

const shortSubject = (s: string) => {
  const cut = s.split(/[:—–]/)[0].trim();
  return cut.length > 46 ? `${cut.slice(0, 45).trimEnd()}…` : cut;
};

export function buildBrief(i: BriefInput): { text: string; count: number; chips: BriefChip[] } {
  const hour = new Date(i.now).getHours();
  const top = i.ranked.filter((r) => r.score >= 60 && r.thread.stream === 'priority' && r.thread.folder === 'inbox').slice(0, 2);
  const count = top.length + (i.approvals > 0 ? 1 : 0);
  const ar = i.locale === 'ar';
  const when = ar ? (hour < 12 ? 'هذا الصباح' : hour < 17 ? 'بعد ظهر اليوم' : 'هذا المساء') : hour < 12 ? 'this morning' : hour < 17 ? 'this afternoon' : 'tonight';
  const parts: string[] = [];
  const chips: BriefChip[] = [];
  for (const r of top) {
    const t = r.thread;
    const from = lastInbound(t, i.ownerId)?.from ?? lastMessage(t).from;
    const vipKey = r.reasons.some((x) => x.id === 'vip') ? [from, ...t.messages.map((m) => m.from)].find((k) => k !== i.ownerId && (i.isVip ? i.isVip(k) : true)) : undefined;
    const who = vipKey ? i.orgOf(vipKey) || i.nameOf(vipKey) : i.nameOf(from);
    const subj = ar && t.ar ? shortSubject(t.ar.subject) : shortSubject(t.subject);
    const deadline = r.reasons.find((x) => x.id === 'deadline');
    const meeting = t.nova?.meeting;
    if (ar) {
      if (deadline?.at) parts.push(`${who} بانتظار «${subj}» قبل ${i.weekdayName(deadline.at)}`);
      else if (meeting) {
        const at = atLocal(i.now, meeting.dayOffset, meeting.startHour);
        const dubai = /dubai|gst|uae/i.test(meeting.label) ? ' بتوقيت دبي' : '';
        parts.push(`${who} ${vipKey ? 'تطلب' : 'يطلب'} اجتماعاً بشأن «${subj}» (${i.weekdayName(at)} ${formatHM(meeting.startHour)}${dubai})`);
      }
      else parts.push(`${who} بانتظار ردّك على «${subj}»`);
    } else if (deadline?.at) parts.push(`${who} needs “${subj}” by ${i.weekdayName(deadline.at)}`);
    else if (meeting) parts.push(`${who} wants a call on “${subj}” (${meeting.label})`);
    else parts.push(`${who} is waiting on “${subj}”`);
    chips.push({ id: t.id, label: shortSubject(ar && t.ar ? t.ar.subject : t.subject), kind: 'thread', target: t.id, tone: deadline ? 'warning' : 'app' });
  }
  if (i.approvals > 0) {
    parts.push(ar ? `و${i.approvals} موافقات تنتظر قرارك` : `${i.approvals} approval${i.approvals === 1 ? ' is' : 's are'} waiting on you`);
    chips.push({ id: 'approvals', label: ar ? `الموافقات · ${i.approvals}` : `Approvals · ${i.approvals}`, kind: 'stream', target: 'approvals', tone: 'success' });
  }
  if (i.screener > 0) chips.push({ id: 'screener', label: ar ? `الفرز · ${i.screener}` : `Screener · ${i.screener}`, kind: 'route', target: '/mail/screener', tone: 'rose' });

  let text: string;
  if (ar) {
    const head = count === 0 ? `لا شيء عاجل ${when} — صندوقك تحت السيطرة.` : `${count === 1 ? 'أمر واحد يحتاجك' : `${count} أمور تحتاجك`} ${when}: `;
    text = head + (parts.length ? `${parts.join('؛ ')}.` : '');
    if (i.screener) text += ` ${i.screener} مرسلين جدد ينتظرون في الفرز.`;
    text += i.digestOn ? ` الخلاصة هادئة: ${i.feedHeld} نشرات ستصل في ملخص 16:30.` : ` في الخلاصة ${i.feedCount} نشرات يمكن قراءتها لاحقاً.`;
  } else {
    const head = count === 0 ? `Nothing urgent ${when} — your inbox is under control.` : `${count === 1 ? 'One thing needs you' : `${count} things need you`} ${when}: `;
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join('; ')}; and ${parts[parts.length - 1]}` : (parts[0] ?? '');
    text = head + (joined ? `${joined}.` : '');
    if (i.screener) text += ` ${i.screener} new sender${i.screener === 1 ? ' is' : 's are'} waiting in the Screener.`;
    text += i.digestOn
      ? ` Feed is calm: ${i.feedHeld} newsletter${i.feedHeld === 1 ? '' : 's'} will land in your 16:30 digest.`
      : ` ${i.feedCount} newsletter${i.feedCount === 1 ? '' : 's'} can wait in the Feed.`;
  }
  return { text, count, chips };
}

/* ---------- Drafting ---------- */

export interface NovaDraftInput {
  prompt: string;
  tone: NovaTone;
  toFirstNames: string[];
  meFirst: string;
  subject?: string;
  arNames?: (first: string) => string;
}

type Intent = 'thanks' | 'followup' | 'meeting' | 'decline' | 'approve' | 'intro' | 'delay' | 'update';

function intentOf(p: string): Intent {
  const s = p.toLowerCase();
  if (/(decline|say no|turn down|reject)/.test(s)) return 'decline';
  if (/(thank|appreciat|kudos)/.test(s)) return 'thanks';
  if (/(follow ?up|nudge|chase|remind)/.test(s)) return 'followup';
  if (/(meet|call|schedule|sync|catch up)/.test(s)) return 'meeting';
  if (/(approve|sign.?off|green.?light)/.test(s)) return 'approve';
  if (/(intro|introduc|connect)/.test(s)) return 'intro';
  if (/(delay|late|postpone|push back|more time)/.test(s)) return 'delay';
  return 'update';
}

function topicOf(p: string, subject?: string): string {
  const m = /\b(?:about|on|regarding|re|for)\s+(.{3,60}?)(?:[.,;!?]|$)/i.exec(p);
  const t = (m?.[1] ?? subject ?? '').replace(/^(re|fwd?):\s*/i, '').trim();
  return t || 'this';
}

const EN_BODY: Record<Intent, (n: string, topic: string) => string> = {
  thanks: (n, t) => `Thank you for your help on ${t}, ${n}. It made a real difference to the team and I wanted to say so properly.`,
  followup: (n, t) => `Just following up on ${t}. Could you share an update when you have a moment, ${n}? Happy to jump on a quick call if that’s easier.`,
  meeting: (_n, t) => `Could we find 30 minutes this week to go through ${t}? Thursday 14:00 or Friday 10:00 Dubai time both work on my side.`,
  decline: (_n, t) => `Thank you for thinking of us for ${t}. After looking at our priorities this quarter, we won’t be able to take it on right now, but I’d be glad to revisit in the new year.`,
  approve: (_n, t) => `I’ve reviewed ${t} and I’m happy to approve. Please go ahead, and flag anything that changes the scope or the budget.`,
  intro: (n, t) => `I’d like to introduce you to ${n} regarding ${t}. I think you’ll have a lot to talk about — I’ll let you take it from here.`,
  delay: (_n, t) => `A quick heads-up on ${t}: we need a few more days to get it right. I’ll share a revised date by tomorrow, and nothing else on the plan is affected.`,
  update: (_n, t) => `Quick update on ${t}: we’re on track, the open questions are being worked through, and I’ll share the next milestone by the end of the week.`,
};

const AR_BODY: Record<Intent, (n: string, topic: string) => string> = {
  thanks: (n, t) => `شكراً جزيلاً على دعمك في ${t} يا ${n}. لقد أحدث فرقاً حقيقياً للفريق وأردت أن أعبّر عن تقديري.`,
  followup: (n, t) => `أتابع معك بخصوص ${t}. هل يمكنك مشاركة آخر المستجدات عندما يتسنى لك يا ${n}؟ يسعدني إجراء مكالمة قصيرة إن كان ذلك أسهل.`,
  meeting: (_n, t) => `هل يمكننا تخصيص 30 دقيقة هذا الأسبوع لمناقشة ${t}؟ يناسبني الخميس الساعة 14:00 أو الجمعة الساعة 10:00 بتوقيت دبي.`,
  decline: (_n, t) => `شكراً لتفكيركم بنا بخصوص ${t}. بعد مراجعة أولوياتنا لهذا الربع، لن نتمكن من المضي قدماً حالياً، ويسعدني أن نعيد النظر في العام الجديد.`,
  approve: (_n, t) => `راجعت ${t} وأوافق عليه. يرجى المتابعة، وإبلاغي بأي تغيير في النطاق أو الميزانية.`,
  intro: (n, t) => `يسعدني أن أعرّفك على ${n} بخصوص ${t}. أعتقد أن لديكما الكثير لتتحدثا عنه، وسأترك لكما المتابعة.`,
  delay: (_n, t) => `تنبيه سريع بخصوص ${t}: نحتاج بضعة أيام إضافية لإنجازه بالشكل الصحيح. سأشارك موعداً معدّلاً بحلول الغد، ولن يتأثر باقي الخطة.`,
  update: (_n, t) => `تحديث سريع بخصوص ${t}: نسير وفق الخطة، ونعمل على الأسئلة المفتوحة، وسأشارك المرحلة التالية بنهاية الأسبوع.`,
};

const SUBJECTS: Record<Intent, string> = {
  thanks: 'Thank you',
  followup: 'Following up',
  meeting: '30 minutes this week?',
  decline: 'Re: your proposal',
  approve: 'Approved',
  intro: 'Introduction',
  delay: 'Revised timeline',
  update: 'Quick update',
};

export function novaDraft(i: NovaDraftInput): { subject: string; en: string; ar: string; intent: Intent } {
  const intent = intentOf(i.prompt);
  const topic = topicOf(i.prompt, i.subject);
  const names = i.toFirstNames.filter(Boolean);
  const n = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? 'there');
  const nAr = names.length ? names.map((x) => i.arNames?.(x) ?? x).join(' و') : 'الجميع';
  const core = EN_BODY[intent](n, topic);
  const coreAr = AR_BODY[intent](nAr, topic);
  let en: string;
  let ar: string;
  if (i.tone === 'concise') {
    en = `Hi ${n},\n\n${core.split('. ')[0].replace(/\.$/, '')}.\n\n${i.meFirst}`;
    ar = `مرحباً ${nAr}،\n\n${coreAr.split('. ')[0].replace(/\.$/, '')}.\n\n${i.arNames?.(i.meFirst) ?? i.meFirst}`;
  } else if (i.tone === 'formal') {
    en = `Dear ${n},\n\n${core}\n\nPlease let me know if you need anything further.\n\nKind regards,\n${i.meFirst}`;
    ar = `حضرة ${nAr} المحترم/ة،\n\n${coreAr}\n\nيرجى إعلامي إن احتجتم أي شيء إضافي.\n\nمع خالص التحية،\n${i.arNames?.(i.meFirst) ?? i.meFirst}`;
  } else {
    en = `Hi ${n},\n\nHope your week is going well! ${core}\n\nThanks so much,\n${i.meFirst}`;
    ar = `مرحباً ${nAr}،\n\nأتمنى أن يكون أسبوعك رائعاً! ${coreAr}\n\nشكراً جزيلاً،\n${i.arNames?.(i.meFirst) ?? i.meFirst}`;
  }
  const subject = i.subject?.trim() || (intent === 'update' || intent === 'followup' || intent === 'delay' ? `${SUBJECTS[intent]}: ${topic}` : SUBJECTS[intent]);
  return { subject, en, ar, intent };
}

/* ---------- Phrase-level translation (Nova offline preview) ---------- */

const PHRASES: [RegExp, string][] = (
  [
    ['as soon as possible', 'في أقرب وقت ممكن'],
    ['let me know', 'أخبرني'],
    ['kind regards', 'مع خالص التحية'],
    ['best regards', 'مع أطيب التحيات'],
    ['thank you', 'شكراً لك'],
    ['thanks so much', 'شكراً جزيلاً'],
    ['looking forward', 'أتطلع'],
    ['next week', 'الأسبوع المقبل'],
    ['this week', 'هذا الأسبوع'],
    ['could you', 'هل يمكنك'],
    ['can you', 'هل يمكنك'],
    ['tomorrow', 'غداً'],
    ['today', 'اليوم'],
    ['meeting', 'اجتماع'],
    ['update', 'تحديث'],
    ['deadline', 'الموعد النهائي'],
    ['approval', 'الموافقة'],
    ['invoice', 'الفاتورة'],
    ['security', 'الأمن'],
    ['customer', 'العميل'],
    ['please', 'من فضلك'],
    ['thanks', 'شكراً'],
    ['regards', 'تحياتي'],
    ['cheers', 'تحياتي'],
    ['hello', 'مرحباً'],
    ['dear', 'عزيزي'],
    ['best', 'مع أطيب التحيات'],
    ['hi', 'مرحباً'],
    ['yes', 'نعم'],
    ['no', 'لا'],
  ] as [string, string][]
).map(([en, ar]) => [new RegExp(`\\b${en}\\b`, 'gi'), ar]);

export function translatePhrases(text: string): { text: string; hits: number } {
  let hits = 0;
  let out = text;
  for (const [re, ar] of PHRASES)
    out = out.replace(re, () => {
      hits += 1;
      return ar;
    });
  return { text: out, hits };
}

/** Arabic count of days with the right plural form (يوم / يومان / أيام / يوماً). */
export function arDays(n: number): string {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

export function nudgeDraft(i: { first: string; subject: string; days: number; meFirst: string; locale?: 'en' | 'ar' }): { subject: string; body: string } {
  const subject = i.subject.startsWith('Re:') ? i.subject : `Re: ${i.subject}`;
  if (i.locale === 'ar') {
    return {
      subject,
      body: `مرحباً ${i.first}،\n\nأعيد طرح هذه الرسالة في حال ضاعت بين الرسائل — مضى ${arDays(i.days)}. هل يمكنك إلقاء نظرة عندما يتسنى لك؟ وإن أصبح شخص آخر مسؤولاً عنها، فأرشدني إليه.\n\nشكراً!\n${i.meFirst}`,
    };
  }
  return {
    subject,
    body: `Hi ${i.first},\n\nBumping this up in case it got buried — it’s been ${i.days} day${i.days === 1 ? '' : 's'}. Could you take a look when you get a moment? If someone else owns this now, just point me to them.\n\nThanks!\n${i.meFirst}`,
  };
}

export interface Snippet {
  id: string;
  title: string;
  body: string;
  /** Arabic body used when the interface is in Arabic. */
  bodyAr: string;
}

export const SNIPPETS: Snippet[] = [
  {
    id: 'thanks',
    title: 'Thanks + next step',
    body: 'Thanks for sending this over — I’ll review it today and come back with next steps by tomorrow.',
    bodyAr: 'شكراً على إرسال هذا — سأراجعه اليوم وأعود إليك بالخطوات التالية بحلول الغد.',
  },
  {
    id: 'meeting',
    title: 'Propose a meeting',
    body: 'Could we find 30 minutes this week? Thursday 14:00 or Friday 10:00 (Dubai) both work on my side.',
    bodyAr: 'هل يمكننا تخصيص 30 دقيقة هذا الأسبوع؟ يناسبني الخميس 14:00 أو الجمعة 10:00 (بتوقيت دبي).',
  },
  { id: 'loop', title: 'Loop someone in', body: 'Looping in a colleague who owns this — they’ll take it from here.', bodyAr: 'أضفت زميلاً مسؤولاً عن هذا الموضوع إلى المحادثة — سيتولى المتابعة من هنا.' },
  {
    id: 'ooo',
    title: 'Out of office',
    body: 'I’m out of office until Monday with limited access to email. For anything urgent, please contact it-support@helix.co.',
    bodyAr: 'أنا خارج المكتب حتى يوم الاثنين مع وصول محدود إلى البريد. للأمور العاجلة، يرجى التواصل مع it-support@helix.co.',
  },
  {
    id: 'secure',
    title: 'Secure link note',
    body: 'For security, the attached file is shared as a protected Helix link: you’ll be asked to verify your email and the link expires in 7 days.',
    bodyAr: 'لدواعٍ أمنية، تمت مشاركة الملف المرفق كرابط هيليكس محمي: سيُطلب منك تأكيد بريدك الإلكتروني، وتنتهي صلاحية الرابط خلال 7 أيام.',
  },
  {
    id: 'phish',
    title: 'Phishing reminder',
    body: 'Reminder: Helix will never ask for your password by email. If something looks off, use “Report phish” in Nova Inbox — false alarms are always welcome.',
    bodyAr: 'تذكير: لن تطلب هيليكس كلمة مرورك عبر البريد أبداً. إن بدا لك شيء مريباً، استخدم «الإبلاغ عن تصيّد» في نوفا إنبوكس — البلاغات الخاطئة مرحّب بها دائماً.',
  },
];

export const ATTACHMENT_KINDS: Record<string, MailAttachment['kind']> = {
  doc: 'doc',
  docx: 'doc',
  sheet: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  slides: 'slides',
  pptx: 'slides',
  pdf: 'pdf',
  image: 'image',
  png: 'image',
  jpg: 'image',
  zip: 'archive',
  archive: 'archive',
};

export function attachmentKindOf(nameOrKind: string): MailAttachment['kind'] {
  const k = nameOrKind.toLowerCase();
  const ext = k.includes('.') ? k.split('.').pop() ?? '' : k;
  return ATTACHMENT_KINDS[ext] ?? 'other';
}

/* ==========================================================================
   Contact resolution (hub users + external contacts)
   ========================================================================== */

export interface ResolvableUser {
  id: string;
  name: string;
  email: string;
  title: string;
  avatarHue: number;
  timezone: string;
  presence: 'online' | 'focus' | 'meeting' | 'away' | 'offline';
  location?: string;
}

export function resolveContact(key: string, users: Map<string, ResolvableUser>, contacts: Map<string, MailContact>): ResolvedContact {
  const u = users.get(key);
  if (u) return { key, name: u.name, email: u.email, org: 'Helix', title: u.title, avatarHue: u.avatarHue, timezone: u.timezone, presence: u.presence, external: false, hub: true, kind: 'hub' };
  const c = contacts.get(key);
  if (c) return { key, name: c.name, email: c.email, org: c.org, title: c.title, avatarHue: c.avatarHue, timezone: c.timezone, external: !c.internal && c.domain !== HELIX_DOMAIN, hub: false, kind: c.kind, vip: c.vip };
  if (key.includes('@')) {
    const domain = emailDomain(key);
    return { key, name: key, email: key, org: domain, avatarHue: 200, external: domain !== HELIX_DOMAIN, hub: false, kind: 'person' };
  }
  return { key, name: key, email: key, org: '', avatarHue: 200, external: true, hub: false, kind: 'person' };
}

/* ==========================================================================
   Sent mail & follow-up radar
   ========================================================================== */

export interface FollowUpItem {
  thread: MailThread;
  to: string[];
  sentAt: number;
  /** Whole days since the owner's last message. */
  days: number;
  dueAt: number;
  due: boolean;
}

/** Threads the owner is watching for a reply ("No reply from Daniel in 3 days"). */
export function followUpRadar(threads: MailThread[], ownerId: string, now: number): FollowUpItem[] {
  const out: FollowUpItem[] = [];
  for (const t of threads) {
    if (!t.followUp?.active || t.folder === 'trash') continue;
    const mine = [...t.messages].reverse().find((m) => m.from === ownerId);
    if (!mine || t.messages.some((m) => m.from !== ownerId && m.at > mine.at)) continue;
    const dueAt = mine.at + t.followUp.afterDays * DAY;
    out.push({ thread: t, to: mine.to, sentAt: mine.at, days: Math.floor((now - mine.at) / DAY), dueAt, due: now >= dueAt });
  }
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

/** Threads containing a message from the owner, newest own message first. */
export function sentThreads(threads: MailThread[], ownerId: string): { thread: MailThread; sentAt: number; replied: boolean }[] {
  return threads
    .filter((t) => t.folder !== 'trash' && t.messages.some((m) => m.from === ownerId))
    .map((t) => {
      const mine = [...t.messages].reverse().find((m) => m.from === ownerId)!;
      return { thread: t, sentAt: mine.at, replied: t.messages.some((m) => m.from !== ownerId && m.at > mine.at) };
    })
    .sort((a, b) => b.sentAt - a.sentAt);
}
