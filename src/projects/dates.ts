/**
 * Local calendar-day helpers. All ISO strings are LOCAL `yyyy-mm-dd`
 * (never `toISOString()`, which would shift days across time zones).
 */
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const MIN = 60_000;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function iso(d: Date | number): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Local midnight for an ISO day. */
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseIso(s);
  return iso(d) === s;
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** Whole calendar days from `a` to `b` (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY);
}

export function todayIso(now = Date.now()): string {
  return iso(now);
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const d = parseIso(s);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return iso(d);
}

export function endOfMonth(s: string): string {
  const d = parseIso(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function isWeekend(s: string): boolean {
  const g = parseIso(s).getDay();
  return g === 0 || g === 6;
}

/** Epoch ms for a local day + optional `HH:mm`. */
export function atTime(day: string, time?: string): number {
  const d = parseIso(day);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  }
  return d.getTime();
}

export function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${pad(m)}${suffix}` : `${h12}${suffix}`;
}

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export function dueState(due: string | undefined, now = Date.now()): DueState | null {
  if (!due) return null;
  const t = todayIso(now);
  const d = diffDays(t, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (due <= addDays(startOfWeek(t), 6)) return 'week';
  return 'later';
}

/** "Today", "Tomorrow", "Yesterday", "Fri", "12 Nov", "12 Nov 2027". */
export function formatDue(due: string, now = Date.now(), time?: string): string {
  const t = todayIso(now);
  const d = diffDays(t, due);
  let label: string;
  if (d === 0) label = 'Today';
  else if (d === 1) label = 'Tomorrow';
  else if (d === -1) label = 'Yesterday';
  else if (d > 1 && d < 7) label = WEEKDAYS[parseIso(due).getDay()];
  else {
    const x = parseIso(due);
    label = `${x.getDate()} ${MONTHS[x.getMonth()]}${x.getFullYear() !== parseIso(t).getFullYear() ? ` ${x.getFullYear()}` : ''}`;
  }
  return time ? `${label} ${formatClock(time)}` : label;
}

/** "2d overdue", "due today", "in 3d". */
export function dueDistance(due: string, now = Date.now()): string {
  const d = diffDays(todayIso(now), due);
  if (d === 0) return 'due today';
  if (d < 0) return `${-d}d overdue`;
  return `in ${d}d`;
}

export function shortDate(s: string): string {
  const x = parseIso(s);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
}
