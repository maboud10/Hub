/**
 * 1:1s — shared helpers: mood scale, cadence & relationship labels, timing
 * (countdown, live window, slots) and the Nova talking-point signals built
 * from OKRs, feedback, reviews, growth goals and overdue actions.
 *
 * Privacy: every signal is filtered through `access.ts` for the viewer
 * (OKR visibility, feedback visibility, growth visibility, manager-only review
 * signals) so suggestions never leak what the viewer couldn't open themselves.
 */
import { useMemo, type ReactElement } from 'react';
import { Annoyed, Frown, Laugh, Meh, MessageSquareHeart, NotebookPen, Smile, Sparkles, Target } from 'lucide-react';
import type { Tone } from '@/components/neo';
import { canViewFeedback, canViewGrowth, canViewObjective, isManagerOf } from '@/performance/access';
import { CADENCE_DAYS } from '@/performance/constants';
import { getPhase } from '@/performance/cycle';
import { suggestTopics, type SuggestedTopic } from '@/performance/nova';
import { forecastKr, formatValue, krStatus } from '@/performance/okr';
import { currentPeriod, primaryCycle, reviewOf } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { AgendaItem, Cadence, OneOnOneSeries, PerfData } from '@/performance/types';
import type { PerfCtx } from './hooks';

export const DAY = 86_400_000;
export const MIN = 60_000;

/* ───────── Labels ───────── */

export const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };
/** Same spacing the store uses when it rolls a series forward. */
export { CADENCE_DAYS };
export const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/** Who the partner is, from the viewer's point of view. */
export type Relation = 'manager' | 'report' | 'mentor' | 'mentee';

export const RELATION: Record<Relation, { label: string; eyebrow: string; group: 'manager' | 'reports' | 'mentoring' }> = {
  manager: { label: 'Your manager', eyebrow: '1:1 with your manager', group: 'manager' },
  report: { label: 'Your report', eyebrow: '1:1 with your report', group: 'reports' },
  mentor: { label: 'Your mentor', eyebrow: 'Mentoring 1:1', group: 'mentoring' },
  mentee: { label: 'Your mentee', eyebrow: 'Mentoring 1:1', group: 'mentoring' },
};

export const partnerOf = (s: Pick<OneOnOneSeries, 'leadId' | 'memberId'>, me: string) => (s.leadId === me ? s.memberId : s.leadId);

export function relationOf(s: Pick<OneOnOneSeries, 'leadId' | 'kind'>, me: string): Relation {
  if (s.kind === 'mentor') return s.leadId === me ? 'mentee' : 'mentor';
  return s.leadId === me ? 'report' : 'manager';
}

/* ───────── Mood ───────── */

export interface MoodMeta {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
  icon: ReactElement;
  tone: Tone;
}

export const MOODS: MoodMeta[] = [
  { value: 1, label: 'Rough', icon: <Frown aria-hidden="true" />, tone: 'rose' },
  { value: 2, label: 'Meh', icon: <Annoyed aria-hidden="true" />, tone: 'orange' },
  { value: 3, label: 'Okay', icon: <Meh aria-hidden="true" />, tone: 'amber' },
  { value: 4, label: 'Good', icon: <Smile aria-hidden="true" />, tone: 'emerald' },
  { value: 5, label: 'Great', icon: <Laugh aria-hidden="true" />, tone: 'violet' },
];

export const moodMeta = (v?: number | null): MoodMeta | undefined => (v ? MOODS[Math.max(1, Math.min(5, Math.round(v))) - 1] : undefined);

/* ───────── Agenda sources ───────── */

export const SOURCE_META: Record<NonNullable<AgendaItem['source']>, { label: string; icon: ReactElement; tone: Tone }> = {
  nova: { label: 'Nova', icon: <Sparkles aria-hidden="true" />, tone: 'violet' },
  okr: { label: 'OKR', icon: <Target aria-hidden="true" />, tone: 'pink' },
  feedback: { label: 'Feedback', icon: <MessageSquareHeart aria-hidden="true" />, tone: 'emerald' },
  review: { label: 'Review', icon: <NotebookPen aria-hidden="true" />, tone: 'amber' },
};

/* ───────── Time ───────── */

export type MeetingPhase = 'live' | 'soon' | 'today' | 'upcoming' | 'overdue';

/** Where we are relative to the next meeting (live = 5 min before start → end). */
export function meetingPhase(s: Pick<OneOnOneSeries, 'nextAt' | 'durationMin'>, now: number): MeetingPhase {
  const end = s.nextAt + s.durationMin * MIN;
  if (now >= s.nextAt - 5 * MIN && now <= end) return 'live';
  if (now > end) return 'overdue';
  if (s.nextAt - now <= 60 * MIN) return 'soon';
  if (new Date(s.nextAt).toDateString() === new Date(now).toDateString()) return 'today';
  return 'upcoming';
}

/** Compact countdown: `45m`, `3h 20m`, `2d 4h`, `12d`. */
export function countdown(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 && h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Short "when" for list rows: `Today 16:00`, `Tomorrow 10:00`, `Thu 10:00`, `12 Dec`. */
export function whenShort(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date(now).toDateString()) return `Today · ${time}`;
  if (d.toDateString() === new Date(now + DAY).toDateString()) return `Tomorrow · ${time}`;
  if (at > now && at - now < 6 * DAY) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${time}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `datetime-local` value for a timestamp (local time). */
export function toLocalInput(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `date` input value (local) for a timestamp. */
export function toDateInput(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromLocalInput(v: string): number {
  if (!v) return Number.NaN;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}

/** Next weekday at `hour:00` (tomorrow at the earliest), skipping weekends. */
export function nextSlot(now: number, hour = 10, minDays = 1): number {
  const d = new Date(now + minDays * DAY);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** Next Monday at `hour:00`. */
export function nextMonday(now: number, hour = 10): number {
  const d = new Date(now + DAY);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/* ───────── Series lists ───────── */

/** The series to open by default: the next one that hasn't ended yet (else the soonest). */
export function pickDefault(list: OneOnOneSeries[], now: number): OneOnOneSeries | undefined {
  const sorted = [...list].sort((a, b) => a.nextAt - b.nextAt);
  return sorted.find((s) => s.nextAt + s.durationMin * MIN >= now) ?? sorted[0];
}

/** Meetings per week over the last `weeks` weeks (oldest first), across the given series. */
export function meetingRhythm(list: OneOnOneSeries[], now: number, weeks = 8): number[] {
  const out = Array.from({ length: weeks }, () => 0);
  for (const s of list)
    for (const m of s.meetings) {
      const w = Math.floor((now - m.at) / (7 * DAY));
      if (w >= 0 && w < weeks) out[weeks - 1 - w]++;
    }
  return out;
}

/** Average mood for one person across their last meetings (oldest first). */
export function moodTrail(s: OneOnOneSeries, userId: string, n = 6): number[] {
  return s.meetings
    .slice(0, n)
    .map((m) => m.moods[userId])
    .filter((v): v is number => typeof v === 'number')
    .reverse();
}

/* ───────── Nova talking points ───────── */

export function talkingPoints(d: PerfData, ctx: PerfCtx, s: OneOnOneSeries, now: number): SuggestedTopic[] {
  const member = s.memberId;
  const viewerIsLead = s.leadId === ctx.me.id;
  // Review-cycle signals only belong in a real manager ↔ report 1:1.
  const managerSeries = s.kind === 'manager' && isManagerOf(ctx.users, s.leadId, member);

  const period = currentPeriod(d, now);
  const objectives = new Set(d.objectives.filter((o) => o.periodId === period?.id && o.state === 'active' && canViewObjective(ctx.v, ctx.users, o)).map((o) => o.id));
  const rank = (st: string) => (st === 'off-track' ? 0 : 1);
  const atRiskKrs = period
    ? d.keyResults
        .filter((k) => k.ownerId === member && objectives.has(k.objectiveId))
        .map((k) => ({ k, status: krStatus(k, period, now) }))
        .filter((x) => x.status === 'at-risk' || x.status === 'off-track')
        .sort((a, b) => rank(a.status) - rank(b.status))
        .map(({ k, status }) => ({ title: k.title, status, forecast: formatValue(k, forecastKr(k, period, now).value), target: formatValue(k, k.target) }))
    : [];

  const cycle = primaryCycle(d, now);
  const review = managerSeries && cycle ? reviewOf(d, cycle.id, member) : undefined;
  const self = cycle ? getPhase(cycle, 'self') : undefined;
  const released = managerSeries ? d.reviews.find((r) => r.employeeId === member && r.managerId === s.leadId && r.release && !r.release.acknowledgedAt) : undefined;
  const releasedCycle = released ? d.cycles.find((c) => c.id === released.cycleId) : undefined;

  const since = s.meetings[0]?.at ?? s.createdAt;
  const newFeedback = d.feedback
    .filter((f) => f.toId === member && f.at > since && canViewFeedback(ctx.v, ctx.users, f))
    .map((f) => ({ fromFirst: ctx.first(f.fromId), kind: f.kind }));

  const growthGoalsDue = canViewGrowth(ctx.v, ctx.users, member)
    ? d.goals.filter((g) => g.userId === member && g.status !== 'done' && g.dueAt && g.dueAt - now < 21 * DAY && g.dueAt > now - 14 * DAY).map((g) => g.title)
    : [];

  return suggestTopics({
    memberFirstName: ctx.first(member),
    leadFirstName: ctx.first(s.leadId),
    viewerIsLead,
    atRiskKrs,
    selfDueInDays: review && self && now <= self.end ? Math.max(0, Math.ceil((self.end - now) / DAY)) : null,
    selfSubmitted: review?.self.status === 'submitted',
    releasedUnacked: !!released,
    releasedCycleName: releasedCycle?.name,
    newFeedback,
    overdueActions: s.actionItems.filter((a) => !a.done && !!a.dueAt && a.dueAt < now),
    daysSinceLast: s.meetings[0] ? Math.floor((now - s.meetings[0].at) / DAY) : null,
    growthGoalsDue,
    pendingNominations: managerSeries && viewerIsLead && !!cycle && d.cycleFeedback.some((f) => f.cycleId === cycle.id && f.subjectId === member && f.status === 'proposed'),
    lastMood: s.meetings[0]?.moods[member] ?? null,
    agendaTexts: s.agenda.map((a) => a.text),
    now,
  });
}

export function useTalkingPoints(ctx: PerfCtx, s: OneOnOneSeries, now: number): SuggestedTopic[] {
  const d = usePerf();
  return useMemo(() => talkingPoints(d, ctx, s, now), [d, ctx, s, now]);
}
