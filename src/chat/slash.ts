/**
 * Slash commands (pure): registry for the composer autocomplete + argument parsers.
 */
import type { KudosValue, Presence } from '@/types';

export interface SlashCommandDef {
  name: SlashName;
  usage: string;
  description: string;
}

export type SlashName = 'poll' | 'kudos' | 'standup' | 'huddle' | 'spark' | 'coffee' | 'remind' | 'task' | 'ticket' | 'status' | 'shrug';

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: 'poll', usage: '/poll Question? | Option A | Option B', description: 'Create a poll — add --multi or --anon' },
  { name: 'kudos', usage: '/kudos @name [value] message', description: 'Celebrate a teammate (lands on the Hub wall)' },
  { name: 'standup', usage: '/standup', description: 'Post your async standup' },
  { name: 'huddle', usage: '/huddle', description: 'Start or join the huddle here' },
  { name: 'spark', usage: '/spark [your answer]', description: 'Answer today’s Daily Spark' },
  { name: 'coffee', usage: '/coffee', description: 'Spin Coffee Roulette' },
  { name: 'remind', usage: '/remind in 20m | 1h | tomorrow …', description: 'Set yourself a reminder' },
  { name: 'task', usage: '/task Title of the task', description: 'Create a Helix Projects task' },
  { name: 'ticket', usage: '/ticket What’s wrong', description: 'Raise an IT Helpdesk ticket' },
  { name: 'status', usage: '/status focus Heads down', description: 'Set your presence and status' },
  { name: 'shrug', usage: '/shrug [message]', description: 'Append ¯\\_(ツ)_/¯' },
];

/** Markdown-escaped shrug: renders as ¯\_(ツ)_/¯. */
export const SHRUG = String.raw`¯\\\_(ツ)\_/¯`;

/** Suggestions while the user types `/xy` (before the first space). */
export function matchSlash(input: string): SlashCommandDef[] {
  const m = /^\/([a-z]*)$/i.exec(input.trim());
  if (!m) return [];
  const q = m[1].toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q)).concat(q ? SLASH_COMMANDS.filter((c) => !c.name.startsWith(q) && c.name.includes(q)) : []);
}

export type SlashParse =
  | { cmd: 'poll'; question: string; options: string[]; multi: boolean; anonymous: boolean }
  | { cmd: 'kudos'; handle?: string; value?: KudosValue; message: string }
  | { cmd: 'standup' }
  | { cmd: 'huddle' }
  | { cmd: 'coffee' }
  | { cmd: 'spark'; answer: string }
  | { cmd: 'remind'; at?: number; when?: string; text: string }
  | { cmd: 'task'; title: string }
  | { cmd: 'ticket'; subject: string }
  | { cmd: 'status'; presence?: Presence; message: string }
  | { cmd: 'shrug'; text: string }
  | { cmd: 'unknown'; name: string };

const KUDOS_WORDS: Record<string, KudosValue> = {
  teamwork: 'teamwork',
  team: 'teamwork',
  innovation: 'innovation',
  innovative: 'innovation',
  customer: 'customer',
  customers: 'customer',
  ownership: 'ownership',
  owner: 'ownership',
  craft: 'craft',
  quality: 'craft',
};

const PRESENCE_WORDS: Record<string, Presence> = {
  online: 'online',
  available: 'online',
  active: 'online',
  focus: 'focus',
  focusing: 'focus',
  busy: 'focus',
  dnd: 'focus',
  meeting: 'meeting',
  call: 'meeting',
  away: 'away',
  brb: 'away',
  lunch: 'away',
  offline: 'offline',
};

/** Split poll args on `|`, new lines or quoted strings. */
function splitPoll(rest: string): string[] {
  const quoted = [...rest.matchAll(/"([^"]+)"|“([^”]+)”/g)].map((m) => (m[1] ?? m[2]).trim());
  if (quoted.length >= 2) return quoted;
  return rest
    .split(/\s*\|\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse a time phrase at the start of `s` (“in 20m”, “in 2 hours”, “1h”, “tomorrow”, “tomorrow at 9”,
 * “at 15:30”, “monday”). Returns the timestamp, the matched label and the remaining text.
 */
export function parseWhen(s: string, now = Date.now()): { at: number; label: string; rest: string } | null {
  const str = s.trim();
  const lower = str.toLowerCase();
  let m: RegExpExecArray | null;

  m = /^(?:in\s+)?(\d{1,3})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b[,:]?\s*/i.exec(lower);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2][0];
    const ms = unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
    if (n > 0) return { at: now + ms, label: `in ${n}${unit === 'm' ? ' min' : unit === 'h' ? (n === 1 ? ' hour' : ' hours') : n === 1 ? ' day' : ' days'}`, rest: str.slice(m[0].length) };
  }

  m = /^tomorrow(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\b[,:]?\s*/i.exec(lower);
  if (m) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    let h = m[1] ? Number(m[1]) : 9;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    d.setHours(h, m[2] ? Number(m[2]) : 0, 0, 0);
    return { at: d.getTime(), label: `tomorrow ${String(h).padStart(2, '0')}:${m[2] ?? '00'}`, rest: str.slice(m[0].length) };
  }

  m = /^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b[,:]?\s*/i.exec(lower);
  if (m) {
    const d = new Date(now);
    let h = Number(m[1]);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23) return null;
    d.setHours(h, m[2] ? Number(m[2]) : 0, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return { at: d.getTime(), label: `at ${String(h).padStart(2, '0')}:${m[2] ?? '00'}`, rest: str.slice(m[0].length) };
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  m = /^(?:on\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b[,:]?\s*/i.exec(lower);
  if (m) {
    const target = days.indexOf(m[1]);
    const d = new Date(now);
    const delta = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    d.setHours(9, 0, 0, 0);
    return { at: d.getTime(), label: `${m[1][0].toUpperCase()}${m[1].slice(1)} 09:00`, rest: str.slice(m[0].length) };
  }
  return null;
}

/** Parse a full slash command. Returns null when the text isn't a command. */
export function parseSlash(text: string, now = Date.now()): SlashParse | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  const name = m[1].toLowerCase();
  const rest = (m[2] ?? '').trim();
  switch (name) {
    case 'poll': {
      let body = rest;
      const multi = /(^|\s)--?multi\b/i.test(body);
      const anonymous = /(^|\s)--?anon(ymous)?\b/i.test(body);
      body = body.replace(/(^|\s)--?(multi|anon(ymous)?)\b/gi, ' ').trim();
      const parts = splitPoll(body);
      const [question = '', ...options] = parts;
      return { cmd: 'poll', question, options, multi, anonymous };
    }
    case 'kudos': {
      const hm = /^@([a-z0-9][a-z0-9._-]*)\s*/i.exec(rest);
      const handle = hm ? hm[1].toLowerCase().replace(/[._-]+$/, '') : undefined;
      let after = hm ? rest.slice(hm[0].length) : rest;
      const vm = /^(\w+)\b[,:]?\s*/.exec(after);
      let value: KudosValue | undefined;
      if (vm && KUDOS_WORDS[vm[1].toLowerCase()]) {
        value = KUDOS_WORDS[vm[1].toLowerCase()];
        after = after.slice(vm[0].length);
      }
      return { cmd: 'kudos', handle, value, message: after.trim() };
    }
    case 'standup':
      return { cmd: 'standup' };
    case 'huddle':
      return { cmd: 'huddle' };
    case 'coffee':
      return { cmd: 'coffee' };
    case 'spark':
      return { cmd: 'spark', answer: rest };
    case 'remind': {
      const lead = rest.replace(/^me\s+/i, '');
      const w = parseWhen(lead, now);
      if (w) return { cmd: 'remind', at: w.at, when: w.label, text: w.rest.replace(/^(to|about)\s+/i, '').trim() };
      // trailing time: “/remind review the deck in 2h”
      const tm = /\s+(in\s+\d{1,3}\s*\w+|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i.exec(lead);
      if (tm) {
        const w2 = parseWhen(tm[1], now);
        if (w2) return { cmd: 'remind', at: w2.at, when: w2.label, text: lead.slice(0, tm.index).replace(/^(to|about)\s+/i, '').trim() };
      }
      return { cmd: 'remind', text: lead.replace(/^(to|about)\s+/i, '').trim() };
    }
    case 'task':
      return { cmd: 'task', title: rest };
    case 'ticket':
      return { cmd: 'ticket', subject: rest };
    case 'status': {
      const sm = /^(\w+)\b\s*/.exec(rest);
      const p = sm ? PRESENCE_WORDS[sm[1].toLowerCase()] : undefined;
      return { cmd: 'status', presence: p, message: (p && sm ? rest.slice(sm[0].length) : rest).trim() };
    }
    case 'shrug':
      return { cmd: 'shrug', text: `${rest ? `${rest} ` : ''}${SHRUG}` };
    default:
      return { cmd: 'unknown', name };
  }
}
