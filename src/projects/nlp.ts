/**
 * Quick Capture — natural-language task parser.
 *
 *   "Review token PR tomorrow 3pm @priya #prism !high +tokens"
 *     → title "Review token PR", due tomorrow 15:00, assignee Priya,
 *       project PRISM, priority high, tag "tokens"
 *
 * Dates:  today · tonight · tomorrow/tmrw · mon..sun (abbreviations need "on/by/next/this" or the end of the text)
 *         this|next <weekday> · next week · next month · this weekend · end of week/eow · end of month/eom
 *         in N days|weeks|months (also "in 3d", "in a week") · 12 Nov · Nov 12th · 12 November 2027
 *         11/12 (M/D; D/M when the first number is > 12) · 2026-11-12
 *         A date without a year that is already past rolls to next year.
 * Times:  3pm · 3:30pm · 15:00 · at 3 (1–7 → pm) · noon · midnight · eod
 *         A time without a date means today, or tomorrow if that time has passed.
 * People: @priya · @me · @priya.raman · fuzzy on first/last name
 * Project:#prism (key) · #passkeys (name word)
 * Priority: !urgent !high !medium !low !1..!4 · p1..p4
 * Tags:   +tag
 *
 * Pure & deterministic: everything depends on `ctx.now`.
 */
import { fuzzyMatch } from '@/lib/fuzzy';
import { addDays, endOfMonth, formatClock, formatDue, iso, parseIso, startOfWeek } from './dates';
import type { Priority } from './types';

export type TokenKind = 'date' | 'time' | 'assignee' | 'project' | 'priority' | 'tag';

export interface QuickToken {
  kind: TokenKind;
  start: number;
  end: number;
  raw: string;
  /** Machine value: ISO date, HH:mm, user id, project id, priority, tag. */
  value: string;
  /** Human label for the chip. */
  label: string;
}

export interface QuickParse {
  title: string;
  dueDate?: string;
  dueTime?: string;
  assigneeId?: string;
  projectId?: string;
  priority?: Priority;
  tags: string[];
  tokens: QuickToken[];
  /** `@name` / `#project` references that matched nobody (left in the title). */
  unresolved: { kind: 'assignee' | 'project'; raw: string; start: number; end: number }[];
}

export interface ParseContext {
  now: Date | number;
  users: { id: string; name: string }[];
  projects: { id: string; key: string; name: string }[];
  /** Resolves `@me`. */
  meId?: string;
}

const WEEKDAY: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};
const FULL_WEEKDAYS = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
const MONTH: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: 'urgent', '1': 'urgent',
  high: 'high', '2': 'high',
  medium: 'medium', med: 'medium', normal: 'medium', '3': 'medium',
  low: 'low', '4': 'low',
  none: 'none',
};
export const PRIORITY_NAME: Record<Priority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'No priority' };

const WD_NAMES = Object.keys(WEEKDAY).sort((a, b) => b.length - a.length).join('|');
const MONTH_NAMES = Object.keys(MONTH).sort((a, b) => b.length - a.length).join('|');
const CONN = String.raw`(?:(on|by|due|before|until)\s+)?`;
const START = String.raw`(?<=^|[\s(])`;
const END = String.raw`(?=$|[\s,.;:!?)])`;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ---------- resolvers ---------- */

export function resolveUser<U extends { id: string; name: string }>(query: string, users: U[], meId?: string): U | null {
  const q = norm(query).replace(/[._'-]+$/, '');
  if (!q) return null;
  if (q === 'me' && meId) return users.find((u) => u.id === meId) ?? null;
  let best: U | null = null;
  let bestScore = 0;
  for (const u of users) {
    const name = norm(u.name);
    const parts = name.split(/\s+/);
    const first = parts[0];
    const last = parts[parts.length - 1];
    const compact = parts.join('');
    const dotted = parts.join('.');
    let score = 0;
    if (first === q) score = 100;
    else if (compact === q || dotted === q) score = 98;
    else if (first.startsWith(q)) score = 80 - (first.length - q.length);
    else if (last === q) score = 72;
    else if (last.startsWith(q)) score = 60 - (last.length - q.length);
    else if (dotted.startsWith(q) || compact.startsWith(q)) score = 55;
    else if (q.length >= 3) {
      const f = fuzzyMatch(q, name);
      if (f && f.score >= 12) score = Math.min(30, f.score / 3);
    }
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

export function resolveProject<P extends { id: string; key: string; name: string }>(query: string, projects: P[]): P | null {
  const q = norm(query);
  if (!q) return null;
  let best: P | null = null;
  let bestScore = 0;
  for (const p of projects) {
    const key = p.key.toLowerCase();
    const name = norm(p.name);
    const words = name.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    if (key === q) score = 100;
    else if (key.startsWith(q)) score = 85 - (key.length - q.length);
    else if (words.includes(q)) score = 75;
    else if (words.some((w) => w.startsWith(q))) score = 65;
    else if (words.join('').startsWith(q)) score = 55;
    else if (q.length >= 3) {
      const f = fuzzyMatch(q, name);
      if (f && f.score >= 12) score = Math.min(30, f.score / 3);
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/* ---------- date math ---------- */

function nextWeekday(today: string, dow: number, mode: 'next-occurrence' | 'this' | 'next'): string {
  const cur = parseIso(today).getDay();
  if (mode === 'this') {
    // within the current Mon–Sun week (today counts)
    const mon = startOfWeek(today);
    const offset = (dow + 6) % 7;
    const cand = addDays(mon, offset);
    return cand < today ? addDays(cand, 7) : cand;
  }
  if (mode === 'next') {
    const mon = addDays(startOfWeek(today), 7);
    return addDays(mon, (dow + 6) % 7);
  }
  let delta = (dow - cur + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(today, delta);
}

function safeDate(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
  return iso(dt);
}

function explicitDate(today: string, month: number, day: number, year?: number): string | null {
  const ty = Number(today.slice(0, 4));
  if (year !== undefined) {
    const y = year < 100 ? 2000 + year : year;
    return safeDate(y, month, day);
  }
  const cand = safeDate(ty, month, day);
  if (!cand) return null;
  return cand < today ? safeDate(ty + 1, month, day) : cand;
}

/* ---------- parser ---------- */

interface Hit {
  kind: TokenKind;
  start: number;
  end: number;
  value: string;
  /** `tonight` suggests a time but an explicit time wins. */
  softTime?: string;
}

interface Matcher {
  kind: TokenKind;
  re: RegExp;
  handle: (m: RegExpExecArray) => { value: string; softTime?: string } | null;
}

export function parseQuickAdd(text: string, ctx: ParseContext): QuickParse {
  const nowTs = typeof ctx.now === 'number' ? ctx.now : ctx.now.getTime();
  const now = new Date(nowTs);
  const today = iso(now);
  const unresolved: QuickParse['unresolved'] = [];
  const trimmedEnd = text.replace(/\s+$/, '').length;

  const matchers: Matcher[] = [
    {
      kind: 'assignee',
      re: new RegExp(String.raw`${START}@([\p{L}\p{N}._'-]+)`, 'gu'),
      handle: (m) => {
        const u = resolveUser(m[1], ctx.users, ctx.meId);
        if (!u) {
          unresolved.push({ kind: 'assignee', raw: m[0], start: m.index, end: m.index + m[0].length });
          return null;
        }
        return { value: u.id };
      },
    },
    {
      kind: 'project',
      re: new RegExp(String.raw`${START}#([\p{L}\p{N}_-]+)`, 'gu'),
      handle: (m) => {
        const p = resolveProject(m[1], ctx.projects);
        if (!p) {
          unresolved.push({ kind: 'project', raw: m[0], start: m.index, end: m.index + m[0].length });
          return null;
        }
        return { value: p.id };
      },
    },
    {
      kind: 'priority',
      re: new RegExp(String.raw`${START}(?:!(urgent|high|medium|med|normal|low|none|[1-4])|p([1-4]))${END}`, 'gi'),
      handle: (m) => {
        const w = (m[1] ?? m[2]).toLowerCase();
        const p = PRIORITY_WORDS[w];
        return p ? { value: p } : null;
      },
    },
    {
      kind: 'tag',
      re: new RegExp(String.raw`${START}\+([\p{L}\p{N}_-]+)`, 'gu'),
      handle: (m) => ({ value: m[1].toLowerCase() }),
    },
    // ---- dates ----
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(today|tonight|tomorrow|tmrw|tmr)${END}`, 'gi'),
      handle: (m) => {
        const w = m[2].toLowerCase();
        if (w === 'today') return { value: today };
        if (w === 'tonight') return { value: today, softTime: '20:00' };
        return { value: addDays(today, 1) };
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(?:(next|this)\s+(week|month|weekend)|end\s+of\s+(?:the\s+)?(week|month)|(eow|eom)|(weekend))${END}`, 'gi'),
      handle: (m) => {
        const mod = m[2]?.toLowerCase();
        const unit = (m[3] ?? m[4] ?? '').toLowerCase();
        const short = m[5]?.toLowerCase();
        const weekend = m[6];
        const mon = startOfWeek(today);
        if (short === 'eow' || (unit === 'week' && !mod) || (mod === 'this' && unit === 'week')) {
          const fri = addDays(mon, 4);
          return { value: fri < today ? addDays(fri, 7) : fri };
        }
        if (short === 'eom' || (unit === 'month' && !mod)) return { value: endOfMonth(today) };
        if (mod === 'this' && unit === 'month') return { value: endOfMonth(today) };
        if (mod === 'next' && unit === 'week') return { value: addDays(mon, 7) };
        if (mod === 'next' && unit === 'month') {
          const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return { value: iso(d) };
        }
        if (unit === 'weekend' || weekend) {
          const sat = addDays(mon, mod === 'next' ? 12 : 5);
          return { value: sat < today ? addDays(sat, 7) : sat };
        }
        return null;
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(?:(next|this)\s+)?(${WD_NAMES})${END}`, 'gi'),
      handle: (m) => {
        const conn = m[1];
        const mod = m[2]?.toLowerCase() as 'next' | 'this' | undefined;
        const name = m[3].toLowerCase();
        const atEnd = m.index + m[0].length >= trimmedEnd;
        if (!FULL_WEEKDAYS.has(name) && !conn && !mod && !atEnd) return null;
        const dow = WEEKDAY[name];
        return { value: nextWeekday(today, dow, mod ?? 'next-occurrence') };
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}in\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(d|days?|w|wks?|weeks?|mo|months?)${END}`, 'gi'),
      handle: (m) => {
        const raw = m[2].toLowerCase();
        const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
        if (!n && n !== 0) return null;
        const unit = m[3].toLowerCase();
        if (unit.startsWith('d')) return { value: addDays(today, n) };
        if (unit.startsWith('w')) return { value: addDays(today, n * 7) };
        const d = new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
        return { value: iso(d) };
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})(?:,?\s+(\d{4}))?${END}`, 'gi'),
      handle: (m) => {
        const v = explicitDate(today, MONTH[m[3].toLowerCase()], Number(m[2]), m[4] ? Number(m[4]) : undefined);
        return v ? { value: v } : null;
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(${MONTH_NAMES})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?${END}`, 'gi'),
      handle: (m) => {
        const v = explicitDate(today, MONTH[m[2].toLowerCase()], Number(m[3]), m[4] ? Number(m[4]) : undefined);
        return v ? { value: v } : null;
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(\d{4})-(\d{2})-(\d{2})${END}`, 'g'),
      handle: (m) => {
        const v = safeDate(Number(m[2]), Number(m[3]) - 1, Number(m[4]));
        return v ? { value: v } : null;
      },
    },
    {
      kind: 'date',
      re: new RegExp(String.raw`${START}${CONN}(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?${END}`, 'g'),
      handle: (m) => {
        let a = Number(m[2]);
        let b = Number(m[3]);
        if (a > 12 && b <= 12) [a, b] = [b, a]; // D/M
        const v = explicitDate(today, a - 1, b, m[4] ? Number(m[4]) : undefined);
        return v ? { value: v } : null;
      },
    },
    // ---- times ----
    {
      kind: 'time',
      re: new RegExp(String.raw`${START}(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s?(am|pm)${END}`, 'gi'),
      handle: (m) => {
        let h = Number(m[1]);
        const min = Number(m[2] ?? 0);
        if (h < 1 || h > 12) return null;
        const pm = m[3].toLowerCase() === 'pm';
        if (pm && h !== 12) h += 12;
        if (!pm && h === 12) h = 0;
        return { value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
      },
    },
    {
      kind: 'time',
      re: new RegExp(String.raw`${START}(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)${END}`, 'g'),
      handle: (m) => ({ value: `${m[1].padStart(2, '0')}:${m[2]}` }),
    },
    {
      kind: 'time',
      re: new RegExp(String.raw`${START}at\s+(\d{1,2})${END}`, 'gi'),
      handle: (m) => {
        let h = Number(m[1]);
        if (h < 1 || h > 23) return null;
        if (h >= 1 && h <= 7) h += 12;
        return { value: `${String(h).padStart(2, '0')}:00` };
      },
    },
    {
      kind: 'time',
      re: new RegExp(String.raw`${START}(?:at\s+|by\s+)?(noon|midday|midnight|eod|end\s+of\s+day)${END}`, 'gi'),
      handle: (m) => {
        const w = m[1].toLowerCase();
        if (w === 'midnight') return { value: '23:59' };
        if (w === 'noon' || w === 'midday') return { value: '12:00' };
        return { value: '17:00' };
      },
    },
  ];

  const used = new Array<boolean>(text.length).fill(false);
  const free = (s: number, e: number) => {
    for (let i = s; i < e; i++) if (used[i]) return false;
    return true;
  };
  const hits: Hit[] = [];
  const taken = new Set<TokenKind>();

  for (const mt of matchers) {
    // only the first date / time / assignee / project / priority counts; tags can repeat
    if (mt.kind !== 'tag' && taken.has(mt.kind)) continue;
    mt.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = mt.re.exec(text))) {
      if (m[0].length === 0) {
        mt.re.lastIndex += 1;
        continue;
      }
      const start = m.index;
      const end = m.index + m[0].length;
      if (!free(start, end)) continue;
      const r = mt.handle(m);
      if (!r) continue;
      for (let i = start; i < end; i++) used[i] = true;
      hits.push({ kind: mt.kind, start, end, value: r.value, softTime: r.softTime });
      if (mt.kind !== 'tag') {
        taken.add(mt.kind);
        break;
      }
    }
  }

  hits.sort((a, b) => a.start - b.start);

  const out: QuickParse = { title: '', tags: [], tokens: [], unresolved: unresolved.filter((u) => free(u.start, u.end)) };
  let softTime: string | undefined;
  for (const h of hits) {
    const raw = text.slice(h.start, h.end);
    let label = raw;
    switch (h.kind) {
      case 'date':
        out.dueDate = h.value;
        softTime = h.softTime;
        label = formatDue(h.value, nowTs);
        break;
      case 'time':
        out.dueTime = h.value;
        label = formatClock(h.value);
        break;
      case 'assignee':
        out.assigneeId = h.value;
        label = ctx.users.find((u) => u.id === h.value)?.name ?? raw;
        break;
      case 'project': {
        out.projectId = h.value;
        const p = ctx.projects.find((x) => x.id === h.value);
        label = p ? p.name : raw;
        break;
      }
      case 'priority':
        out.priority = h.value as Priority;
        label = PRIORITY_NAME[h.value as Priority];
        break;
      case 'tag':
        if (!out.tags.includes(h.value)) out.tags.push(h.value);
        label = h.value;
        break;
    }
    out.tokens.push({ kind: h.kind, start: h.start, end: h.end, raw, value: h.value, label });
  }

  if (!out.dueTime && softTime) out.dueTime = softTime;
  if (out.dueTime && !out.dueDate) {
    const [hh, mm] = out.dueTime.split(':').map(Number);
    const at = new Date(now);
    at.setHours(hh, mm, 0, 0);
    out.dueDate = at.getTime() > nowTs ? today : addDays(today, 1);
  }

  let title = '';
  for (let i = 0; i < text.length; i++) title += used[i] ? ' ' : text[i];
  title = title.replace(/\s+/g, ' ').trim();
  // drop dangling connectors / separators left behind by removed tokens
  for (let i = 0; i < 3; i++) title = title.replace(/(?:\s+|^)(?:on|by|due|at|before|until|for)$/i, '').replace(/\s*[-–—,;:]+$/, '').trim();
  out.title = title;
  return out;
}

/* ---------- typing helpers (autocomplete) ---------- */

export interface ActiveTrigger {
  sigil: '@' | '#' | '!' | '+';
  query: string;
  start: number;
  end: number;
}

/** The `@…` / `#…` / `!…` / `+…` fragment the caret is currently in, if any. */
export function activeTrigger(text: string, caret: number): ActiveTrigger | null {
  let i = caret - 1;
  while (i >= 0 && /[\p{L}\p{N}._'-]/u.test(text[i])) i--;
  if (i < 0) return null;
  const sigil = text[i];
  if (sigil !== '@' && sigil !== '#' && sigil !== '!' && sigil !== '+') return null;
  if (i > 0 && !/[\s(]/.test(text[i - 1])) return null;
  let end = caret;
  while (end < text.length && /[\p{L}\p{N}._'-]/u.test(text[end])) end++;
  return { sigil, query: text.slice(i + 1, caret), start: i, end };
}

/** Replace the active trigger fragment with `replacement` (adds a trailing space). */
export function applyTrigger(text: string, t: ActiveTrigger, replacement: string): { text: string; caret: number } {
  const before = text.slice(0, t.start);
  const after = text.slice(t.end).replace(/^\s*/, '');
  const ins = `${replacement} `;
  return { text: before + ins + after, caret: before.length + ins.length };
}
