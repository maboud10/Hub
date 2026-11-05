const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

/** "just now", "5m ago", "3h ago", "2d ago" — or future: "in 5d". */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const future = diff > 0;
  let value: string;
  if (abs < MIN) return future ? 'in a moment' : 'just now';
  if (abs < HOUR) value = `${Math.round(abs / MIN)}m`;
  else if (abs < DAY) value = `${Math.round(abs / HOUR)}h`;
  else if (abs < 30 * DAY) value = `${Math.round(abs / DAY)}d`;
  else return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return future ? `in ${value}` : `${value} ago`;
}

export function formatTime(date: Date | number, timeZone?: string): string {
  return new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
}

export function formatDate(date: Date | number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(date).toLocaleDateString(undefined, opts);
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function firstName(name: string) {
  return name.split(' ')[0];
}

/** Time-zone abbreviation-ish label, e.g. "GMT+4". */
export function tzLabel(timeZone?: string, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mmss(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
