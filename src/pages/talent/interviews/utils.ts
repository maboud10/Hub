/**
 * Interview helpers for the Interviews tab and the schedule / scorecard
 * modals: time maths, agenda grouping, panel availability, smart slot
 * suggestions, week-grid lane layout and location parsing. Pure functions.
 */
import type { Interview, InterviewKind, Recommendation, Requisition, Scorecard } from '@/talent/types';
import { INTERVIEW_KIND_META } from '@/talent/constants';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Colour per interview format (kind tiles, week blocks). */
export const KIND_HUE: Record<InterviewKind, number> = {
  screen: 272,
  technical: 196,
  'system-design': 222,
  portfolio: 320,
  case: 32,
  culture: 152,
  panel: 292,
  final: 346,
};

export const REC_ORDER: Recommendation[] = ['strong-no', 'no', 'yes', 'strong-yes'];

// ───────────────────────── time ─────────────────────────
export const ivEnd = (iv: Pick<Interview, 'scheduledAt' | 'durationMins'>) => iv.scheduledAt + iv.durationMins * MIN;
export const hasEnded = (iv: Pick<Interview, 'scheduledAt' | 'durationMins'>, now: number) => ivEnd(iv) <= now;
export const isOpenStatus = (iv: Pick<Interview, 'status'>) => iv.status === 'scheduled' || iv.status === 'completed';
export const isLive = (iv: Interview, now: number) => isOpenStatus(iv) && iv.scheduledAt <= now && now < ivEnd(iv);

export function startOfDay(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(ts: number, n: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()).getTime();
}

/** Monday 00:00 of the week containing `ts`. */
export function startOfWeek(ts: number) {
  const d = new Date(ts);
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

export const isWeekend = (ts: number) => {
  const day = new Date(ts).getDay();
  return day === 0 || day === 6;
};

export function fmtTime(ts: number, timeZone?: string) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
  } catch {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}

export function fmtDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ts).toLocaleDateString(undefined, opts);
}

/** "Thu 5" (some locales render weekday + day as "5 Thu"). */
export const fmtDayShort = (ts: number) => `${new Date(ts).toLocaleDateString(undefined, { weekday: 'short' })} ${new Date(ts).getDate()}`;

/** "9:30 AM" / "09:30" without a leading zero where the locale allows. */
export const fmtTimeShort = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Today", "Tomorrow", "Yesterday" or "Thursday". */
export function dayLabel(ts: number, now: number) {
  const diff = Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
}

/** "in 45m", "in 2h 10m", "in 3 days", "5m ago", "2 days ago". */
export function relTime(ts: number, now: number) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  let v: string;
  if (abs < MIN) return diff >= 0 ? 'now' : 'just now';
  if (abs < HOUR) v = `${Math.round(abs / MIN)}m`;
  else if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.round((abs % HOUR) / MIN);
    v = m && h < 6 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  } else {
    const d = Math.round(abs / DAY);
    v = `${d} day${d === 1 ? '' : 's'}`;
  }
  return diff >= 0 ? `in ${v}` : `${v} ago`;
}

/** Hour (0–23) of `ts` in an IANA time zone. */
export function hourIn(ts: number, timeZone?: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone }).formatToParts(new Date(ts));
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return Number.isFinite(h) ? h + m / 60 : new Date(ts).getHours();
  } catch {
    return new Date(ts).getHours();
  }
}

export const viewerTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** Local working hours used for "outside hours" warnings. */
export const WORK_HOURS = { from: 8, to: 19 } as const;
export const outsideHours = (ts: number, timeZone?: string) => {
  const h = hourIn(ts, timeZone);
  return h < WORK_HOURS.from || h >= WORK_HOURS.to;
};

// ───────────────────────── date inputs ─────────────────────────
export const toDateInput = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const toTimeInput = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export function fromInputs(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const ts = new Date(y, m - 1, d, hh, mm).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// ───────────────────────── availability ─────────────────────────
export interface Clash {
  userId: string;
  interview: Interview;
}

/** Scheduled interviews that overlap a window for any of `userIds` (mirrors the store's clash rule). */
export function findClashes(all: Interview[], userIds: string[], start: number, mins: number, excludeId?: string): Clash[] {
  const end = start + mins * MIN;
  const out: Clash[] = [];
  for (const iv of all) {
    if (iv.id === excludeId || iv.status !== 'scheduled') continue;
    if (!(start < ivEnd(iv) && iv.scheduledAt < end)) continue;
    for (const id of iv.interviewerIds) if (userIds.includes(id)) out.push({ userId: id, interview: iv });
  }
  return out;
}

/** The candidate already has another interview in this window. */
export function candidateClash(all: Interview[], candidateId: string, start: number, mins: number, excludeId?: string) {
  const end = start + mins * MIN;
  return all.find((iv) => iv.id !== excludeId && iv.candidateId === candidateId && iv.status === 'scheduled' && start < ivEnd(iv) && iv.scheduledAt < end);
}

export interface SlotSuggestion {
  at: number;
  /** Interviewers outside their local working hours at this time. */
  offHours: number;
  best?: boolean;
}

/**
 * Smart slots: the next `days` business days, 09:00–17:00 on the hour /
 * half-hour, with no overlapping interview for any selected interviewer (or
 * the candidate). Picks a morning and an afternoon option per day, favouring
 * times inside everyone's local working hours.
 */
export function suggestSlots(opts: {
  interviews: Interview[];
  interviewerIds: string[];
  durationMins: number;
  now: number;
  candidateId?: string;
  excludeId?: string;
  timeZones?: (string | undefined)[];
  days?: number;
  perDay?: number;
  max?: number;
}): SlotSuggestion[] {
  const { interviews, interviewerIds, durationMins, now, candidateId, excludeId, timeZones = [], days = 5, perDay = 2, max = 8 } = opts;
  const out: SlotSuggestion[] = [];
  const base = new Date(now);
  let counted = 0;
  for (let offset = 0; counted < days && offset < 21; offset += 1) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 17, 0).getTime();
    if (dayEnd - durationMins * MIN < now + 30 * MIN) continue; // nothing left today
    counted += 1;
    const free: SlotSuggestion[] = [];
    for (let m = 9 * 60; m + durationMins <= 17 * 60; m += 30) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60).getTime();
      if (at < now + 30 * MIN) continue;
      if (findClashes(interviews, interviewerIds, at, durationMins, excludeId).length) continue;
      if (candidateId && candidateClash(interviews, candidateId, at, durationMins, excludeId)) continue;
      free.push({ at, offHours: timeZones.filter((tz) => outsideHours(at, tz) || outsideHours(at + durationMins * MIN - MIN, tz)).length });
    }
    if (!free.length) continue;
    const pick = (list: SlotSuggestion[]) => [...list].sort((a, b) => a.offHours - b.offHours || a.at - b.at)[0];
    const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 30).getTime();
    const chosen = [pick(free.filter((s) => s.at < noon)), pick(free.filter((s) => s.at >= noon))].filter((s): s is SlotSuggestion => !!s);
    if (!chosen.length) chosen.push(pick(free));
    out.push(...chosen.slice(0, perDay).sort((a, b) => a.at - b.at));
  }
  const list = out.slice(0, max);
  const best = [...list].sort((a, b) => a.offHours - b.offHours || a.at - b.at)[0];
  return list.map((s) => (s === best ? { ...s, best: true } : s));
}

// ───────────────────────── plan & competencies ─────────────────────────
export const planStepFor = (req: Requisition | undefined, kind: InterviewKind) => req?.interviewPlan.find((p) => p.kind === kind);

export function competenciesFor(iv: Pick<Interview, 'kind'>, req?: Requisition): string[] {
  const step = planStepFor(req, iv.kind);
  return step?.focus?.length ? step.focus : INTERVIEW_KIND_META[iv.kind].focus;
}

export type PlanState = 'done' | 'scheduled' | 'todo';

/** Where each interview-plan step stands for one application. */
export function planProgress(req: Requisition | undefined, appInterviews: Interview[], cards: Scorecard[], now: number) {
  if (!req) return [];
  return req.interviewPlan.map((step) => {
    const ivs = appInterviews.filter((i) => i.kind === step.kind && (i.status === 'scheduled' || i.status === 'completed'));
    const done = ivs.find((i) => hasEnded(i, now) || cards.some((s) => s.interviewId === i.id));
    const upcoming = ivs.find((i) => !hasEnded(i, now));
    const state: PlanState = done ? 'done' : upcoming ? 'scheduled' : 'todo';
    return { step, state, interview: done ?? upcoming };
  });
}

/** Others' scorecards stay hidden from a panelist until they submit their own. */
export function canSeePanelFeedback(viewerId: string, iv: Pick<Interview, 'id' | 'interviewerIds'>, cards: Scorecard[]) {
  if (!iv.interviewerIds.includes(viewerId)) return true;
  return cards.some((s) => s.interviewId === iv.id && s.interviewerId === viewerId);
}

// ───────────────────────── week grid ─────────────────────────
export interface Laned<T> {
  item: T;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for overlapping blocks within one day column. */
export function layoutLanes<T>(items: T[], range: (t: T) => [number, number]): Laned<T>[] {
  const sorted = [...items].sort((a, b) => range(a)[0] - range(b)[0] || range(b)[1] - range(a)[1]);
  const out: Laned<T>[] = [];
  let cluster: Laned<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) c.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const [s, e] = range(item);
    if (s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else laneEnds[lane] = e;
    clusterEnd = Math.max(cluster.length ? clusterEnd : -Infinity, e);
    cluster.push({ item, lane, lanes: 1 });
  }
  if (cluster.length) flush();
  return out;
}

// ───────────────────────── location ─────────────────────────
export type LocationKind = 'video' | 'phone' | 'room' | 'other';

export function parseLocation(location: string): { kind: LocationKind; label: string; url?: string } {
  const raw = location.trim() || 'Google Meet';
  const link = raw.match(/https?:\/\/\S+/i)?.[0] ?? raw.match(/\b(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com)\/[\w\-/?=&.]+/i)?.[0];
  const url = link ? (link.startsWith('http') ? link : `https://${link}`) : undefined;
  const kind: LocationKind = /meet|zoom|teams|video/i.test(raw) || url ? 'video' : /phone|call|\+\d/i.test(raw) ? 'phone' : /hq|room|office|atrium|floor|building|desk/i.test(raw) ? 'room' : 'other';
  return { kind, label: raw, url };
}

const MEET_ALPHABET = 'abcdefghijkmnopqrstuvwxyz';
/** A Google Meet style code, e.g. `kfw-hqzt-rmb`. */
export function meetCode(rand: () => number = Math.random) {
  const part = (n: number) => Array.from({ length: n }, () => MEET_ALPHABET[Math.floor(rand() * MEET_ALPHABET.length)]).join('');
  return `${part(3)}-${part(4)}-${part(3)}`;
}
export const meetLocation = (code = meetCode()) => `Google Meet · meet.google.com/${code}`;
export const HQ_ROOM = 'Dubai HQ · Atrium room';
export const PHONE_LOCATION = 'Phone · candidate’s mobile';
