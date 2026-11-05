/**
 * Pure helpers for the People directory: time-zone maths, search, labels.
 */
import {
  Building,
  Cpu,
  Headphones,
  HeartHandshake,
  Megaphone,
  Palette,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Department, KudosValue, Presence, User } from '@/types';

export const PRESENCE_ORDER: Presence[] = ['online', 'focus', 'meeting', 'away', 'offline'];

export const DEPARTMENT_ICON: Record<Department, LucideIcon> = {
  Engineering: Cpu,
  Design: Palette,
  Product: Rocket,
  'People Ops': HeartHandshake,
  Finance: Wallet,
  Sales: TrendingUp,
  Marketing: Megaphone,
  'IT & Security': ShieldCheck,
  Operations: Building,
  'Customer Success': Headphones,
};

export const KUDOS_META: Record<KudosValue, { label: string; emoji: string }> = {
  teamwork: { label: 'Teamwork', emoji: '🤝' },
  innovation: { label: 'Innovation', emoji: '💡' },
  customer: { label: 'Customer love', emoji: '💙' },
  ownership: { label: 'Ownership', emoji: '🛡️' },
  craft: { label: 'Craft', emoji: '✨' },
};

// ───────────────────────── time zones ─────────────────────────

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const hourFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(map: Map<string, Intl.DateTimeFormat>, tz: string, make: () => Intl.DateTimeFormat) {
  let f = map.get(tz);
  if (!f) {
    f = make();
    map.set(tz, f);
  }
  return f;
}

/** Minutes east of UTC for `timeZone` at instant `at` (DST-aware). */
export function tzOffsetMinutes(timeZone: string | undefined, at: number): number {
  try {
    const key = timeZone ?? '';
    const fmt = cached(
      partsFormatters,
      key,
      () =>
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          hourCycle: 'h23',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
    );
    const parts = fmt.formatToParts(new Date(at));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((asUTC - Math.floor(at / 1000) * 1000) / 60_000);
  } catch {
    return -new Date(at).getTimezoneOffset();
  }
}

/** Local hour (0-23) in `timeZone`. */
export function localHour(timeZone: string | undefined, at: number): number {
  try {
    const fmt = cached(hourFormatters, timeZone ?? '', () => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }));
    return Number(fmt.format(new Date(at))) % 24;
  } catch {
    return new Date(at).getHours();
  }
}

/** "+3h", "−4h", "+1h 30m" or "same time". */
export function offsetLabel(diffMinutes: number): string {
  if (diffMinutes === 0) return 'same time';
  const sign = diffMinutes > 0 ? '+' : '−';
  const abs = Math.abs(diffMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''}`;
}

/** Longer, human version for tooltips: "4h behind you", "1h 30m ahead of you". */
export function offsetSentence(diffMinutes: number): string {
  if (diffMinutes === 0) return 'Same time zone as you';
  const label = offsetLabel(diffMinutes).slice(1);
  return `${label} ${diffMinutes > 0 ? 'ahead of' : 'behind'} you`;
}

export type DayPhase = 'work' | 'off' | 'night';

/** Rough "is it a good time to ping them?" signal. */
export function dayPhase(hour: number): DayPhase {
  if (hour >= 9 && hour < 18) return 'work';
  if (hour >= 7 && hour < 22) return 'off';
  return 'night';
}

export const DAY_PHASE_LABEL: Record<DayPhase, string> = {
  work: 'Working hours',
  off: 'Outside working hours',
  night: 'Night time — probably asleep',
};

// ───────────────────────── search ─────────────────────────

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function searchTokens(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

export function personHaystack(u: User): string {
  return fold([u.name, u.title, u.department, u.location, u.email, u.pronouns ?? '', ...u.skills].join(' '));
}

export function matchesTokens(u: User, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const hay = personHaystack(u);
  return tokens.every((t) => hay.includes(t));
}

// ───────────────────────── dates ─────────────────────────

const parseISODate = (iso: string) => new Date(`${iso}T00:00:00`);

export function formatStartDate(iso: string): string {
  const d = parseISODate(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "4y 2m", "7m", "Joined this month", "Starts soon". */
export function tenure(iso: string, now: number): string {
  const start = parseISODate(iso);
  if (Number.isNaN(start.getTime())) return '';
  const today = new Date(now);
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months -= 1;
  if (start.getTime() > now) return 'Starts soon';
  if (months <= 0) return 'Joined this month';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y}y` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

/** "MM-DD" → "17 April". */
export function formatBirthday(mmdd: string): string {
  const [mm, dd] = mmdd.split('-').map(Number);
  if (!mm || !dd) return mmdd;
  return new Date(2000, mm - 1, dd).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export function isBirthdayToday(mmdd: string | undefined, now: number): boolean {
  if (!mmdd) return false;
  const d = new Date(now);
  return mmdd === `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Visible-to-viewer filter: deactivated accounts are only shown to user managers. */
export const isVisibleTo = (u: User, canManageUsers: boolean) => u.active || canManageUsers;
