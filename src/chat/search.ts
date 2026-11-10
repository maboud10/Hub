/**
 * Message search (pure): query language + matcher.
 *
 *   from:@omar  in:#design-crit  in:@mei (DM)  has:file|link|poll|image|reaction|thread|card|kudos|voice
 *   is:pinned|saved|thread  before:2026-11-01  after:2026-10-01  on:2026-11-02  during:today|yesterday|week|month
 *   "exact phrase"  free words (all must match)
 */
import type { ChatMessage } from './types';

export type HasFilter = 'file' | 'link' | 'poll' | 'image' | 'reaction' | 'thread' | 'card' | 'kudos' | 'voice';
export type IsFilter = 'pinned' | 'saved' | 'thread';
export type During = 'today' | 'yesterday' | 'week' | 'month';

export interface SearchQuery {
  terms: string[];
  phrases: string[];
  from: string[];
  in: string[];
  has: HasFilter[];
  is: IsFilter[];
  before?: number;
  after?: number;
  during?: During;
}

const HAS: HasFilter[] = ['file', 'link', 'poll', 'image', 'reaction', 'thread', 'card', 'kudos', 'voice'];
const IS: IsFilter[] = ['pinned', 'saved', 'thread'];
const DURING: During[] = ['today', 'yesterday', 'week', 'month'];
const DAY = 86_400_000;

function parseDay(s: string): number | undefined {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function emptyQuery(): SearchQuery {
  return { terms: [], phrases: [], from: [], in: [], has: [], is: [] };
}

export function parseSearch(raw: string): SearchQuery {
  const q = emptyQuery();
  const re = /"([^"]*)"|“([^”]*)”|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m[1] !== undefined || m[2] !== undefined) {
      const p = (m[1] ?? m[2]).trim().toLowerCase();
      if (p) q.phrases.push(p);
      continue;
    }
    const tok = m[3];
    const f = /^(from|in|has|is|before|after|on|during):(.+)$/i.exec(tok);
    if (f) {
      const key = f[1].toLowerCase();
      const val = f[2].toLowerCase();
      if (key === 'from') q.from.push(val.replace(/^@/, ''));
      else if (key === 'in') q.in.push(val.replace(/^[#@]/, val.startsWith('@') ? '@' : ''));
      else if (key === 'has' && (HAS as string[]).includes(val)) q.has.push(val as HasFilter);
      else if (key === 'is' && (IS as string[]).includes(val)) q.is.push(val as IsFilter);
      else if (key === 'during' && (DURING as string[]).includes(val)) q.during = val as During;
      else if (key === 'before') q.before = parseDay(val);
      else if (key === 'after') q.after = parseDay(val);
      else if (key === 'on') {
        const d = parseDay(val);
        if (d !== undefined) {
          q.after = d;
          q.before = d + DAY;
        }
      } else q.terms.push(tok.toLowerCase());
      continue;
    }
    q.terms.push(tok.toLowerCase());
  }
  return q;
}

export function isEmptyQuery(q: SearchQuery): boolean {
  return !q.terms.length && !q.phrases.length && !q.from.length && !q.in.length && !q.has.length && !q.is.length && q.before === undefined && q.after === undefined && !q.during;
}

/** Inverse of `parseSearch` (used when a filter chip is removed). */
export function formatQuery(q: SearchQuery): string {
  const fmt = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return [
    ...q.from.map((f) => `from:@${f}`),
    ...q.in.map((i) => (i.startsWith('@') ? `in:${i}` : `in:#${i}`)),
    ...q.has.map((h) => `has:${h}`),
    ...q.is.map((i) => `is:${i}`),
    ...(q.during ? [`during:${q.during}`] : []),
    ...(q.after !== undefined ? [`after:${fmt(q.after)}`] : []),
    ...(q.before !== undefined ? [`before:${fmt(q.before)}`] : []),
    ...q.phrases.map((p) => `"${p}"`),
    ...q.terms,
  ].join(' ');
}

export interface SearchContext {
  now: number;
  /** Plain text of the message (markdown stripped). */
  plain: (m: ChatMessage) => string;
  /** Handle of a user id (`omar`), bots map to their name. */
  handleOf: (userId: string) => string | undefined;
  authorName: (userId: string) => string;
  /** Channel slug for channels, `@handle` of the other person for DMs. */
  convKeys: (convId: string) => string[];
  isSaved: (messageId: string) => boolean;
  isPinned: (m: ChatMessage) => boolean;
  replyCount: (messageId: string) => number;
}

/** Searchable text for a message: body + rich payloads + attachments. */
export function haystack(m: ChatMessage, ctx: Pick<SearchContext, 'plain' | 'authorName'>): string {
  const parts = [ctx.plain(m)];
  if (m.poll) parts.push(m.poll.question, ...m.poll.options.map((o) => o.text));
  if (m.card) parts.push(m.card.title, m.card.subtitle ?? '', m.card.status ?? '');
  if (m.files) parts.push(...m.files.map((f) => f.name));
  if (m.attachments) parts.push(...m.attachments.map((a) => a.name));
  if (m.standup) parts.push(...m.standup.yesterday, ...m.standup.today, ...m.standup.blockers);
  if (m.decision) parts.push(m.decision.title, m.decision.context ?? '');
  if (m.huddle) parts.push(...m.huddle.keyPoints, ...m.huddle.actionItems.map((a) => a.text));
  if (m.voice?.transcript) parts.push(m.voice.transcript);
  if (m.spark) parts.push(m.spark.question);
  return parts.join(' \n ').toLowerCase();
}

/** Score a message against a query (null = no match). */
export function matchMessage(m: ChatMessage, q: SearchQuery, ctx: SearchContext): number | null {
  if (m.deleted || m.system) return null;
  if (q.from.length) {
    const h = ctx.handleOf(m.authorId);
    const name = ctx.authorName(m.authorId).toLowerCase();
    if (!q.from.some((f) => f === h || name.startsWith(f) || m.authorId === f)) return null;
  }
  if (q.in.length) {
    const keys = ctx.convKeys(m.convId);
    if (!q.in.some((i) => keys.includes(i))) return null;
  }
  if (q.before !== undefined && m.at >= q.before) return null;
  if (q.after !== undefined && m.at < q.after) return null;
  if (q.during) {
    const today = startOfDay(ctx.now);
    const lo = q.during === 'today' ? today : q.during === 'yesterday' ? today - DAY : q.during === 'week' ? today - 6 * DAY : today - 29 * DAY;
    const hi = q.during === 'yesterday' ? today : Number.POSITIVE_INFINITY;
    if (m.at < lo || m.at >= hi) return null;
  }
  for (const h of q.has) {
    const ok =
      h === 'file'
        ? !!(m.files?.length || m.attachments?.length)
        : h === 'image'
          ? !!m.attachments?.some((a) => a.mime.startsWith('image/')) || !!m.files?.some((f) => f.kind === 'image')
          : h === 'link'
            ? /https?:\/\/|\]\(\//.test(m.text) || !!m.card
            : h === 'poll'
              ? !!m.poll
              : h === 'reaction'
                ? Object.values(m.reactions).some((u) => u.length)
                : h === 'thread'
                  ? ctx.replyCount(m.id) > 0
                  : h === 'card'
                    ? !!m.card
                    : h === 'kudos'
                      ? !!m.kudos
                      : !!m.voice;
    if (!ok) return null;
  }
  for (const i of q.is) {
    const ok = i === 'pinned' ? ctx.isPinned(m) : i === 'saved' ? ctx.isSaved(m.id) : !!m.parentId;
    if (!ok) return null;
  }

  let score = 1;
  if (q.terms.length || q.phrases.length) {
    const hay = haystack(m, ctx);
    const author = ctx.authorName(m.authorId).toLowerCase();
    for (const p of q.phrases) {
      if (!hay.includes(p)) return null;
      score += 12;
    }
    for (const t of q.terms) {
      const idx = hay.indexOf(t);
      if (idx === -1) {
        if (author.includes(t)) {
          score += 2;
          continue;
        }
        return null;
      }
      const wordStart = idx === 0 || /[^\p{L}\p{N}]/u.test(hay[idx - 1]);
      score += wordStart ? 6 : 3;
    }
  }
  // recency: up to +5 for today, fading over 30 days
  const ageDays = Math.max(0, (ctx.now - m.at) / DAY);
  score += Math.max(0, 5 - ageDays / 6);
  return score;
}

/** Split `text` into chunks marking matches of the query words (for highlighting). */
export function highlightParts(text: string, q: SearchQuery): { text: string; hit: boolean }[] {
  const words = [...q.phrases, ...q.terms].filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return [{ text, hit: false }];
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return text
    .split(re)
    .map((s, i) => ({ text: s, hit: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

/**
 * Human-readable excerpt for a search result: the first part of the message (body or rich payload —
 * poll, card, standup, decision, huddle recap, voice transcript, files) that contains a query word,
 * trimmed around the hit. Falls back to the body / first payload part.
 */
export function snippetFor(m: ChatMessage, q: SearchQuery, ctx: Pick<SearchContext, 'plain'>, max = 240): string {
  const parts: string[] = [ctx.plain(m)];
  if (m.poll) parts.push(`Poll: ${m.poll.question}`, ...m.poll.options.map((o) => o.text));
  if (m.card) parts.push([m.card.title, m.card.subtitle].filter(Boolean).join(' — '));
  if (m.standup) parts.push(...m.standup.yesterday.map((s) => `Yesterday: ${s}`), ...m.standup.today.map((s) => `Today: ${s}`), ...m.standup.blockers.map((s) => `Blocker: ${s}`));
  if (m.decision) parts.push(`Decision: ${m.decision.title}`, m.decision.context ?? '');
  if (m.huddle) parts.push(...m.huddle.keyPoints, ...m.huddle.actionItems.map((a) => `Action item: ${a.text}`));
  if (m.voice) parts.push(m.voice.transcript ? `Voice note: ${m.voice.transcript}` : 'Voice note');
  if (m.spark) parts.push(`Daily Spark: ${m.spark.question}`);
  if (m.files) parts.push(...m.files.map((f) => f.name));
  if (m.attachments) parts.push(...m.attachments.map((a) => a.name));
  const clean = parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const words = [...q.phrases, ...q.terms].filter((w) => w.length > 1);
  let s = (words.length ? clean.find((p) => words.some((w) => p.toLowerCase().includes(w))) : undefined) ?? clean[0] ?? '';
  if (s.length > max && words.length) {
    const lower = s.toLowerCase();
    const at = Math.min(...words.map((w) => (lower.includes(w) ? lower.indexOf(w) : Number.POSITIVE_INFINITY)));
    if (Number.isFinite(at) && at > max / 2) s = `…${s.slice(Math.max(0, at - 60))}`;
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
