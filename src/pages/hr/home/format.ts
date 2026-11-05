/**
 * Small, locale-aware display helpers for the HR Home and People Ops screens.
 * `Intl.DateTimeFormat#formatRange` reads naturally in every locale
 * ("Nov 9 – 13" in en-US, "9–13 Nov" in en-GB).
 */
import type { PulseMilestone } from '@/hr/types';
import { parseISODate } from '@/hr/calendar';
import { relativeTime } from '@/lib/format';

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, o);

/** "Thu, Nov 12", "Nov 9 – 13", "Nov 28 – Dec 2", "Thu, Nov 12 (morning)". */
export function fmtRange(start: string, end: string, halfDay?: 'am' | 'pm'): string {
  const a = new Date(parseISODate(start));
  if (start === end) return `${dtf({ weekday: 'short', day: 'numeric', month: 'short' }).format(a)}${halfDay ? ` (${halfDay === 'am' ? 'morning' : 'afternoon'})` : ''}`;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return dtf({ day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).formatRange(a, new Date(parseISODate(end)));
}

/** Relative time that never reads "in a moment" for things that just happened (the minute clock lags). */
export const ago = (ts: number, now: number) => relativeTime(ts, Math.max(now, ts));

/** "first-week", "30-day"… for "Your 30-day check-in". */
export const MILESTONE_NOUN: Record<PulseMilestone, string> = {
  'week-1': 'first-week',
  'day-30': '30-day',
  'day-60': '60-day',
  'day-90': '90-day',
};
