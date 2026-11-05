/**
 * HR calendar math: working days (weekends + public holidays excluded),
 * ranges and display helpers. Weekend is Saturday–Sunday (UAE since 2022).
 * Dates are ISO `YYYY-MM-DD` interpreted as local midnight.
 */
import { addDaysISO, parseISODate, toISODate } from '@/talent/onboarding';
import { holidaysFor, type PublicHoliday } from './constants';
import type { HalfDay } from './types';

export { addDaysISO, parseISODate, toISODate };

const DAY = 86_400_000;

export const todayISO = (now = Date.now()) => toISODate(now);

export function isWeekend(iso: string): boolean {
  const d = new Date(parseISODate(iso)).getDay();
  return d === 0 || d === 6;
}

/** Every date from start to end inclusive (capped at ~1 year for safety). */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  for (let i = 0; cur <= end && i < 400; i += 1) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

export function holidaySet(location: string): Set<string> {
  return new Set(holidaysFor(location).map((h) => h.date));
}

/** Working days in a range (half-day requests count 0.5). */
export function workingDays(start: string, end: string, holidays: ReadonlySet<string>, halfDay?: HalfDay): number {
  if (!start || !end || end < start) return 0;
  const n = eachDay(start, end).filter((d) => !isWeekend(d) && !holidays.has(d)).length;
  return halfDay && start === end ? n * 0.5 : n;
}

/** Holidays that fall inside a range (to explain why fewer days are deducted). */
export function holidaysInRange(start: string, end: string, location: string): PublicHoliday[] {
  return holidaysFor(location).filter((h) => h.date >= start && h.date <= end && !isWeekend(h.date));
}

export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd;

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b) - parseISODate(a)) / DAY);
}

/** Next working day on or after `iso`. */
export function nextWorkingDay(iso: string, holidays: ReadonlySet<string>): string {
  let cur = iso;
  for (let i = 0; i < 30 && (isWeekend(cur) || holidays.has(cur)); i += 1) cur = addDaysISO(cur, 1);
  return cur;
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const d = new Date(parseISODate(iso)).getDay();
  return addDaysISO(iso, d === 0 ? -6 : 1 - d);
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(parseISODate(iso)).toLocaleDateString(undefined, opts);

/** "Thu 12 Nov", "12–16 Nov", "28 Nov – 2 Dec", "Thu 12 Nov (morning)". */
export function formatRange(start: string, end: string, halfDay?: HalfDay): string {
  if (start === end) return `${fmt(start, { weekday: 'short', day: 'numeric', month: 'short' })}${halfDay ? ` (${halfDay === 'am' ? 'morning' : 'afternoon'})` : ''}`;
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (sameMonth) return `${fmt(start, { day: 'numeric' })}–${fmt(end, { day: 'numeric', month: 'short' })}`;
  return `${fmt(start, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmt(end, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })}`;
}

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return fmt(iso, opts);
}

export function formatDays(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? '' : 's'}`;
}
