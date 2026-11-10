/**
 * Pulse engagement logic (pure): streaks, XP & levels, badges, celebrations, Coffee Roulette matching,
 * team-vibe aggregates, kudos leaderboards and the workspace heartbeat.
 */
import type { Department, User } from '@/types';
import { dateKey } from './ids';
import type { ChatMessage, EngagementStats, Mood } from './types';

const DAY = 86_400_000;

export function emptyStats(): EngagementStats {
  return { activeDays: [], messages: 0, reactions: 0, polls: 0, kudosGiven: 0, huddles: 0, sparks: 0, coffees: 0, cardsSigned: 0 };
}

/* ---------------------------------------------------------------- streaks */

/** Current streak counts consecutive active days ending today — or yesterday (today still counts as “alive”). */
export function streakOf(activeDays: string[], now = Date.now()): { current: number; best: number; activeToday: boolean } {
  const set = new Set(activeDays);
  const today = dateKey(now);
  const activeToday = set.has(today);
  let current = 0;
  let cursor = activeToday ? now : now - DAY;
  while (set.has(dateKey(cursor))) {
    current += 1;
    cursor -= DAY;
  }
  // best streak across history
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of sorted) {
    const [y, m, d] = k.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best: Math.max(best, current), activeToday };
}

/* ---------------------------------------------------------------- XP & levels */

export const XP_WEIGHTS: Record<Exclude<keyof EngagementStats, 'activeDays'>, number> = {
  messages: 2,
  reactions: 1,
  polls: 15,
  kudosGiven: 20,
  huddles: 12,
  sparks: 10,
  coffees: 25,
  cardsSigned: 8,
};

export function xpOf(s: EngagementStats): number {
  let xp = s.activeDays.length * 5;
  for (const [k, w] of Object.entries(XP_WEIGHTS) as [keyof typeof XP_WEIGHTS, number][]) xp += (s[k] ?? 0) * w;
  return xp;
}

/** Level n starts at 60·n·(n−1) XP (0, 120, 360, 720, 1200 …). */
export function levelOf(xp: number): { level: number; floor: number; next: number; progress: number } {
  let level = 1;
  while (60 * (level + 1) * level <= xp) level += 1;
  const floor = 60 * level * (level - 1);
  const next = 60 * (level + 1) * level;
  return { level, floor, next, progress: Math.min(1, (xp - floor) / (next - floor)) };
}

export const LEVEL_TITLES = ['Newcomer', 'Regular', 'Connector', 'Catalyst', 'Amplifier', 'Culture Carrier', 'Pulse Legend'];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 2))];

/* ---------------------------------------------------------------- badges */

export interface BadgeDef {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name hint for the UI. */
  icon: 'vote' | 'trophy' | 'headphones' | 'sparkles' | 'coffee' | 'heart' | 'flame' | 'message' | 'zap' | 'award';
  target: number;
  value: (s: EngagementStats, streak: number) => number;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-poll', label: 'First poll', description: 'Ask the team with a poll', icon: 'vote', target: 1, value: (s) => s.polls },
  { id: 'spark-starter', label: 'Spark starter', description: 'Answer a Daily Spark', icon: 'sparkles', target: 1, value: (s) => s.sparks },
  { id: 'kudos-champion', label: 'Kudos champion', description: 'Give 10 kudos', icon: 'trophy', target: 10, value: (s) => s.kudosGiven },
  { id: 'huddle-hero', label: 'Huddle hero', description: 'Join 10 huddles', icon: 'headphones', target: 10, value: (s) => s.huddles },
  { id: 'coffee-connector', label: 'Coffee connector', description: 'Meet 3 people via Coffee Roulette', icon: 'coffee', target: 3, value: (s) => s.coffees },
  { id: 'heart-of-gold', label: 'Heart of gold', description: 'Sign 5 celebration cards', icon: 'heart', target: 5, value: (s) => s.cardsSigned },
  { id: 'on-fire', label: 'On fire', description: 'Keep a 7-day streak', icon: 'flame', target: 7, value: (_s, streak) => streak },
  { id: 'conversationalist', label: 'Conversationalist', description: 'Send 250 messages', icon: 'message', target: 250, value: (s) => s.messages },
  { id: 'reaction-machine', label: 'Reaction machine', description: 'React 300 times', icon: 'zap', target: 300, value: (s) => s.reactions },
  { id: 'poll-master', label: 'Poll master', description: 'Run 10 polls', icon: 'award', target: 10, value: (s) => s.polls },
];

export function badgeProgress(s: EngagementStats, streak: number) {
  return BADGES.map((b) => {
    const v = b.value(s, streak);
    return { ...b, current: Math.min(v, b.target), earned: v >= b.target, progress: Math.min(1, v / b.target) };
  });
}

/* ---------------------------------------------------------------- celebrations */

export interface Occasion {
  type: 'birthday' | 'anniversary' | 'welcome';
  userId: string;
  /** yyyy-mm-dd */
  date: string;
  /** Days from today (0 = today; negative = recent welcome). */
  inDays: number;
  years?: number;
  key: string;
}

const atMidnight = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Next occurrence (today or later) of a month/day. */
function nextOccurrence(month: number, day: number, now: number): Date {
  const today = new Date(atMidnight(now));
  const d = new Date(today.getFullYear(), month - 1, day);
  if (d.getTime() < today.getTime()) d.setFullYear(today.getFullYear() + 1);
  return d;
}

export const occasionKey = (type: Occasion['type'], userId: string, date: string) => `${type}:${userId}:${date.slice(0, 4)}`;

/** Birthdays and work anniversaries in the next `windowDays`, plus new joiners from the last 30 days. */
export function upcomingOccasions(users: Pick<User, 'id' | 'birthday' | 'startDate' | 'active'>[], now = Date.now(), windowDays = 14): Occasion[] {
  const out: Occasion[] = [];
  const today = atMidnight(now);
  for (const u of users) {
    if (!u.active) continue;
    if (u.birthday) {
      const [m, d] = u.birthday.split('-').map(Number);
      if (m && d) {
        const occ = nextOccurrence(m, d, now);
        const inDays = Math.round((occ.getTime() - today) / DAY);
        if (inDays <= windowDays) {
          const date = dateKey(occ.getTime());
          out.push({ type: 'birthday', userId: u.id, date, inDays, key: occasionKey('birthday', u.id, date) });
        }
      }
    }
    if (u.startDate) {
      const [y, m, d] = u.startDate.split('-').map(Number);
      if (y && m && d) {
        const start = new Date(y, m - 1, d).getTime();
        const sinceStart = Math.round((today - start) / DAY);
        if (sinceStart >= 0 && sinceStart <= 30) {
          out.push({ type: 'welcome', userId: u.id, date: u.startDate, inDays: -sinceStart, key: occasionKey('welcome', u.id, u.startDate) });
        } else {
          const occ = nextOccurrence(m, d, now);
          const years = occ.getFullYear() - y;
          const inDays = Math.round((occ.getTime() - today) / DAY);
          if (years >= 1 && inDays <= windowDays) {
            const date = dateKey(occ.getTime());
            out.push({ type: 'anniversary', userId: u.id, date, inDays, years, key: occasionKey('anniversary', u.id, date) });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/* ---------------------------------------------------------------- coffee roulette */

export interface CoffeeCandidate {
  id: string;
  department: Department;
  active: boolean;
  optedIn: boolean;
}

/**
 * Pick a Coffee Roulette partner: opted-in, active, someone else, preferably from another department and
 * not one of the recent partners. `rand` ∈ [0,1).
 */
export function pickCoffeeMatch(me: { id: string; department: Department }, candidates: CoffeeCandidate[], rand: number, recentPartnerIds: string[] = []): string | null {
  const base = candidates.filter((c) => c.active && c.optedIn && c.id !== me.id);
  const tiers = [
    base.filter((c) => c.department !== me.department && !recentPartnerIds.includes(c.id)),
    base.filter((c) => !recentPartnerIds.includes(c.id)),
    base,
  ];
  const pool = tiers.find((t) => t.length) ?? [];
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))].id;
}

/* ---------------------------------------------------------------- team vibe */

export interface VibeDay {
  date: string;
  avg: number | null;
  count: number;
}

export function vibeSeries(vibes: Record<string, Record<string, Mood>>, now = Date.now(), days = 14): VibeDay[] {
  const out: VibeDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dateKey(now - i * DAY);
    const votes = Object.values(vibes[date] ?? {});
    out.push({ date, count: votes.length, avg: votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null });
  }
  return out;
}

/** Distribution of today's moods (index 0 → mood 1). */
export function vibeDistribution(vibes: Record<string, Record<string, Mood>>, now = Date.now()): number[] {
  const dist = [0, 0, 0, 0, 0];
  for (const v of Object.values(vibes[dateKey(now)] ?? {})) dist[v - 1] += 1;
  return dist;
}

/* ---------------------------------------------------------------- kudos */

export interface KudosLike {
  fromId: string;
  toId: string;
  at: number;
}

export function kudosLeaders(list: KudosLike[], since: number, limit = 5) {
  const recv = new Map<string, number>();
  const give = new Map<string, number>();
  for (const k of list) {
    if (k.at < since) continue;
    recv.set(k.toId, (recv.get(k.toId) ?? 0) + 1);
    give.set(k.fromId, (give.get(k.fromId) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }));
  return { receivers: top(recv), givers: top(give) };
}

/* ---------------------------------------------------------------- heartbeat */

/** Message counts per bucket over the last `hours` (oldest first). */
export function heartbeat(messages: Pick<ChatMessage, 'at' | 'system'>[], now = Date.now(), hours = 24, bucketMinutes = 30): number[] {
  const bucket = bucketMinutes * 60_000;
  const n = Math.round((hours * 60) / bucketMinutes);
  const start = now - n * bucket;
  const out = Array.from({ length: n }, () => 0);
  for (const m of messages) {
    if (m.system || m.at < start || m.at > now) continue;
    const idx = Math.min(n - 1, Math.floor((m.at - start) / bucket));
    out[idx] += 1;
  }
  return out;
}

/**
 * Turn activity buckets into an ECG-like path (each bucket = a beat whose spike height follows activity).
 * Returns an SVG path in a `width × height` box.
 */
export function heartbeatPath(buckets: number[], width: number, height: number): string {
  if (!buckets.length) return '';
  const max = Math.max(1, ...buckets);
  const step = width / buckets.length;
  const mid = height * 0.62;
  let d = `M0,${mid.toFixed(1)}`;
  buckets.forEach((v, i) => {
    const x0 = i * step;
    const amp = (v / max) * (height * 0.55);
    if (amp < 1.5) {
      d += ` L${(x0 + step).toFixed(1)},${mid.toFixed(1)}`;
      return;
    }
    const p = (f: number) => (x0 + step * f).toFixed(1);
    d += ` L${p(0.3)},${mid.toFixed(1)} L${p(0.4)},${(mid + amp * 0.18).toFixed(1)} L${p(0.5)},${(mid - amp).toFixed(1)} L${p(0.6)},${(mid + amp * 0.32).toFixed(1)} L${p(0.7)},${mid.toFixed(1)} L${p(1)},${mid.toFixed(1)}`;
  });
  return d;
}
