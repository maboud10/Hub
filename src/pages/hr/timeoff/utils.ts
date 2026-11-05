/**
 * Time off UI helpers (pure, no React): leave-type groupings, plain-language
 * explanations of allowances and deductions, holiday grouping, "smart break"
 * bridge-day suggestions, quick date picks and a Monday-first month matrix
 * for the range picker.
 */
import type { HalfDay, LeaveTypeId } from '@/hr/types';
import type { LeaveTypeMeta, PublicHoliday } from '@/hr/constants';
import { addDaysISO, daysBetween, eachDay, formatDay, formatRange, isWeekend, nextWorkingDay, parseISODate, toISODate } from '@/hr/calendar';

const RANGE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const RANGE_Y = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Locale-aware date range: "Nov 23 – 27" (en-US) / "23–27 Nov" (en-GB); single
 * days keep the weekday and half-day wording from `formatRange`.
 */
export function fmtRange(start: string, end: string, halfDay?: HalfDay): string {
  if (!end || start === end) return formatRange(start, start, halfDay);
  try {
    return (start.slice(0, 4) === end.slice(0, 4) ? RANGE : RANGE_Y).formatRange(new Date(parseISODate(start)), new Date(parseISODate(end)));
  } catch {
    return formatRange(start, end, halfDay);
  }
}

const RANGE_WD = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Range with weekdays: "Wed, Dec 2 – Thu, Dec 3" / "Wed 2 – Thu 3 Dec". */
export function fmtRangeWd(start: string, end: string): string {
  const a = new Date(parseISODate(start));
  if (start === end) return RANGE_WD.format(a);
  try {
    return RANGE_WD.formatRange(a, new Date(parseISODate(end)));
  } catch {
    return `${RANGE_WD.format(a)} – ${RANGE_WD.format(new Date(parseISODate(end)))}`;
  }
}

/** Leave types shown up front (balances strip, first group in the picker). */
export const KEY_TYPES: LeaveTypeId[] = ['annual', 'wfa', 'sick', 'study', 'compassionate'];
/** Less common types, tucked behind "More types". */
export const MORE_TYPES: LeaveTypeId[] = ['parental', 'hajj', 'unpaid'];

const ALL_TYPES = new Set<string>([...KEY_TYPES, ...MORE_TYPES]);
export const isLeaveType = (s: string | null | undefined): s is LeaveTypeId => !!s && ALL_TYPES.has(s);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 6 → "6", 6.25 → "6.25", 6.5 → "6.5". */
export const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** First sentence of a policy description. */
export function policyLine(meta: LeaveTypeMeta): string {
  const m = meta.description.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : meta.description).trim();
}

/** Why the allowance is what it is (first-year pro-rating, once-only, flexible). */
export function allowanceStory(meta: LeaveTypeMeta, startDate: string, year: number): string {
  if (meta.allowance === null) return 'No fixed allowance: your manager decides each request.';
  const [sy, sm] = startDate.split('-').map(Number);
  if (sy > year) return `Your allowance starts when you join in ${sy}.`;
  if (meta.id === 'annual' && sy === year) {
    const months = 12 - (sm - 1);
    const exact = (meta.allowance * months) / 12;
    const rounded = Math.round(exact * 2) / 2;
    return `You joined in ${MONTHS[sm - 1]}, so this year counts ${months} of 12 months: ${meta.allowance} × ${months}/12 = ${num(exact)}${exact !== rounded ? `, rounded to the nearest half day: ${num(rounded)}` : ''}.`;
  }
  if (meta.oncePerEmployment) return `${meta.allowance} days, once during your time at Helix.`;
  return `${meta.allowance} working days every calendar year.`;
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks", "2 days ago"… */
export function relDay(iso: string, today: string): string {
  const d = daysBetween(today, iso);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 14) return `in ${d} days`;
  if (d >= 14 && d < 63) return `in ${Math.round(d / 7)} weeks`;
  if (d >= 63) return `in ${Math.round(d / 30.4)} months`;
  if (d > -14) return `${-d} days ago`;
  if (d > -63) return `${Math.round(-d / 7)} weeks ago`;
  return `${Math.round(-d / 30.4)} months ago`;
}

/** Calendar days, weekend days and holidays inside a range (to explain deductions). */
export function rangeShape(start: string, end: string, holidayDates: ReadonlySet<string>) {
  const days = start && end && end >= start ? eachDay(start, end) : [];
  return {
    days,
    calendar: days.length,
    weekends: days.filter(isWeekend).length,
    holidays: days.filter((d) => !isWeekend(d) && holidayDates.has(d)).length,
  };
}

// ───────────────────────── holidays ─────────────────────────
export interface HolidayBlock {
  name: string;
  start: string;
  end: string;
  dates: string[];
  expected: boolean;
}

/** Merge consecutive dates of the same holiday ("National Day · 2–3 Dec"). */
export function groupHolidays(list: PublicHoliday[]): HolidayBlock[] {
  const out: HolidayBlock[] = [];
  for (const h of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const last = out[out.length - 1];
    if (last && last.name === h.name && addDaysISO(last.end, 1) === h.date) {
      last.end = h.date;
      last.dates.push(h.date);
      last.expected = last.expected || !!h.expected;
    } else out.push({ name: h.name, start: h.date, end: h.date, dates: [h.date], expected: !!h.expected });
  }
  return out;
}

export interface BridgeIdea {
  /** Leave request to book (holidays inside are never deducted). */
  start: string;
  end: string;
  /** Working days you'd actually spend. */
  cost: number;
  /** First and last day of the whole break, weekends included. */
  from: string;
  to: string;
  length: number;
  names: string[];
}

/**
 * "Smart breaks": holidays that sit 1–2 working days away from a weekend.
 * Booking the gap days turns them into a long stretch for very few days of leave.
 */
export function bridgeIdeas(holidays: PublicHoliday[], holidayDates: ReadonlySet<string>, today: string): BridgeIdea[] {
  const off = (d: string) => isWeekend(d) || holidayDates.has(d);
  const sorted = [...holidays].filter((h) => !isWeekend(h.date)).sort((a, b) => a.date.localeCompare(b.date));
  const ideas: BridgeIdea[] = [];
  const seen = new Set<string>();
  for (const h of sorted) {
    if (seen.has(h.date)) continue;
    // Cluster of consecutive days off around this holiday.
    let cs = h.date;
    let ce = h.date;
    while (off(addDaysISO(cs, -1)) && daysBetween(addDaysISO(cs, -1), h.date) < 12) cs = addDaysISO(cs, -1);
    while (off(addDaysISO(ce, 1)) && daysBetween(h.date, addDaysISO(ce, 1)) < 12) ce = addDaysISO(ce, 1);
    eachDay(cs, ce).forEach((d) => seen.add(d));
    const gap = (from: string, step: 1 | -1) => {
      const out: string[] = [];
      let cur = addDaysISO(from, step);
      while (!off(cur) && out.length < 3) {
        out.push(cur);
        cur = addDaysISO(cur, step);
      }
      return { days: out, closes: out.length < 3 && isWeekend(cur) };
    };
    const before = gap(cs, -1);
    const after = gap(ce, 1);
    const pick = [...(before.closes && before.days.length <= 2 ? before.days : []), ...(after.closes && after.days.length <= 2 ? after.days : [])].sort();
    if (!pick.length || pick.length > 3) continue;
    const start = pick[0];
    const end = pick[pick.length - 1];
    if (start <= today) continue;
    let from = start < cs ? start : cs;
    let to = end > ce ? end : ce;
    while (off(addDaysISO(from, -1)) && daysBetween(addDaysISO(from, -1), start) < 12) from = addDaysISO(from, -1);
    while (off(addDaysISO(to, 1)) && daysBetween(end, addDaysISO(to, 1)) < 12) to = addDaysISO(to, 1);
    const length = daysBetween(from, to) + 1;
    if (length - pick.length < 4) continue;
    const names = [...new Set(holidays.filter((x) => x.date >= from && x.date <= to).map((x) => x.name))];
    ideas.push({ start, end, cost: pick.length, from, to, length, names });
  }
  return ideas;
}

// ───────────────────────── quick picks ─────────────────────────
export interface QuickPick {
  id: string;
  label: string;
  start: string;
  end: string;
}

/** One-tap date presets for the request flow. */
export function quickPicks(type: LeaveTypeId, today: string, holidayDates: ReadonlySet<string>): QuickPick[] {
  const nwd = (iso: string) => nextWorkingDay(iso, holidayDates);
  const dow = new Date(parseISODate(today)).getDay();
  const nextMonday = addDaysISO(today, ((8 - dow) % 7) || 7);
  if (type === 'sick') {
    const first = nwd(today);
    return [
      { id: 'today', label: first === today ? 'Today' : `${formatDay(first, { weekday: 'long' })}`, start: first, end: first },
      { id: 'two', label: first === today ? 'Today & tomorrow' : 'Two days', start: first, end: nwd(addDaysISO(first, 1)) },
    ];
  }
  const tomorrow = nwd(addDaysISO(today, 1));
  const friday = addDaysISO(today, ((5 - dow + 7) % 7) || 7);
  const picks: QuickPick[] = [
    { id: 'tomorrow', label: tomorrow === addDaysISO(today, 1) ? 'Tomorrow' : formatDay(tomorrow, { weekday: 'long' }), start: tomorrow, end: tomorrow },
    { id: 'friday', label: `Long weekend (${formatDay(friday, { day: 'numeric', month: 'short' })})`, start: friday, end: friday },
    { id: 'next-week', label: 'All of next week', start: nextMonday, end: addDaysISO(nextMonday, 4) },
  ];
  return picks.filter((p, i, all) => all.findIndex((q) => q.start === p.start && q.end === p.end) === i);
}

// ───────────────────────── month matrix ─────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11" ± n months. */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Same day-of-month n months later (clamped to the month's length). */
export function shiftDateMonth(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dim = new Date(y, m - 1 + n + 1, 0).getDate();
  return toISODate(new Date(y, m - 1 + n, Math.min(d, dim)).getTime());
}

/** Monday-first weeks for a month, always 6 rows of 7 (null outside the month). */
export function monthWeeks(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= dim; d += 1) cells.push(`${y}-${pad(m)}-${pad(d)}`);
  while (cells.length < 42) cells.push(null);
  return Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const monthLabel = (ym: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) => new Date(parseISODate(`${ym}-01`)).toLocaleDateString(undefined, opts);
