/**
 * Derived data over the Performance store — pure functions (no React).
 */
import type { User } from '@/types';
import { canViewFeedback, canViewObjective, isAbove, isAdmin, reviewAccess, type PerfViewer } from './access';
import { currentPhaseKey, getPhase, managerUnlocked, periodFor } from './cycle';
import { checkinDue, krStatus, objectiveProgress, rollupStatus } from './okr';
import type { Cycle, KeyResult, KrStatus, Objective, PerfData, Period, Review } from './types';

const DAY = 86_400_000;

export function currentPeriod(d: Pick<PerfData, 'periods'>, now: number): Period {
  return periodFor(d.periods, now) ?? d.periods[0];
}

/** The main active cycle (current period first, earliest launched). */
export function primaryCycle(d: Pick<PerfData, 'cycles' | 'periods'>, now: number): Cycle | null {
  const p = currentPeriod(d, now);
  const active = d.cycles.filter((c) => c.status === 'active');
  const inPeriod = active.filter((c) => c.periodId === p?.id).sort((a, b) => (a.launchedAt ?? 0) - (b.launchedAt ?? 0));
  return inPeriod[0] ?? active.sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0))[0] ?? null;
}

/** Most recent closed cycle before `cycle` (for "last quarter" comparisons). */
export function previousCycle(d: Pick<PerfData, 'cycles' | 'periods'>, cycle: Cycle | null): Cycle | null {
  const order = d.periods.map((p) => p.id);
  const idx = cycle ? order.indexOf(cycle.periodId) : -1;
  return (
    d.cycles
      .filter((c) => c.id !== cycle?.id && c.status === 'closed')
      .sort((a, b) => order.indexOf(a.periodId) - order.indexOf(b.periodId))
      .find((c) => order.indexOf(c.periodId) > idx) ?? null
  );
}

export const reviewOf = (d: Pick<PerfData, 'reviews'>, cycleId: string | undefined, userId: string): Review | undefined =>
  cycleId ? d.reviews.find((r) => r.cycleId === cycleId && r.employeeId === userId) : undefined;

export const krsOf = (d: Pick<PerfData, 'keyResults'>, objectiveId: string): KeyResult[] =>
  d.keyResults.filter((k) => k.objectiveId === objectiveId).sort((a, b) => a.order - b.order);

export interface ObjectiveRollup {
  o: Objective;
  krs: KeyResult[];
  progress: number;
  status: KrStatus;
  statuses: Record<string, KrStatus>;
  period: Period;
}

export function rollup(d: Pick<PerfData, 'keyResults' | 'periods'>, o: Objective, now: number): ObjectiveRollup {
  const period = d.periods.find((p) => p.id === o.periodId) ?? d.periods[0];
  const krs = krsOf(d, o.id);
  const statuses: Record<string, KrStatus> = {};
  for (const k of krs) statuses[k.id] = krStatus(k, period, now);
  const status = o.state === 'closed' ? 'done' : rollupStatus(Object.values(statuses));
  return { o, krs, progress: objectiveProgress(krs), status, statuses, period };
}

export function visibleObjectives(d: Pick<PerfData, 'objectives'>, v: PerfViewer, users: User[], periodId?: string): Objective[] {
  return d.objectives.filter((o) => (!periodId || o.periodId === periodId) && canViewObjective(v, users, o));
}

/** Objectives a person owns or co-owns in a period. */
export const objectivesOwnedBy = (d: Pick<PerfData, 'objectives'>, userId: string, periodId: string) =>
  d.objectives.filter((o) => o.periodId === periodId && (o.ownerId === userId || o.coOwnerIds.includes(userId)));

/** Key results the user can check in on this period (owned KRs + KRs of owned objectives). */
export function myCheckinKrs(d: Pick<PerfData, 'objectives' | 'keyResults'>, userId: string, periodId: string): KeyResult[] {
  const owned = new Set(d.objectives.filter((o) => o.periodId === periodId && o.state === 'active' && (o.ownerId === userId || o.coOwnerIds.includes(userId))).map((o) => o.id));
  const active = new Set(d.objectives.filter((o) => o.periodId === periodId && o.state === 'active').map((o) => o.id));
  return d.keyResults.filter((k) => active.has(k.objectiveId) && (k.ownerId === userId || owned.has(k.objectiveId))).sort((a, b) => a.objectiveId.localeCompare(b.objectiveId) || a.order - b.order);
}

/* ───────── Home "up next" ───────── */

export interface Todo {
  id: string;
  kind: 'self' | 'ack' | 'peer' | 'upward' | 'request' | 'checkin' | 'nominations' | 'manager' | 'okr-first' | 'oneonone' | 'calibrate';
  title: string;
  sub: string;
  to: string;
  due?: number;
  priority: number;
}

export function todosFor(d: PerfData, me: User, v: PerfViewer, users: User[], now: number): Todo[] {
  const out: Todo[] = [];
  const cycle = primaryCycle(d, now);
  const period = currentPeriod(d, now);
  const name = (id: string) => users.find((u) => u.id === id)?.name.split(' ')[0] ?? 'Someone';

  if (cycle) {
    const r = reviewOf(d, cycle.id, me.id);
    const self = getPhase(cycle, 'self');
    if (r && self && now <= self.end && r.self.status !== 'submitted')
      out.push({ id: 'self', kind: 'self', title: r.self.status === 'draft' ? 'Finish your self-reflection' : 'Write your self-reflection', sub: `${cycle.name} · Nova can draft it from your highlights`, to: `/performance/checkins/${r.id}`, due: self.end, priority: 100 });
    for (const f of d.cycleFeedback.filter((x) => x.cycleId === cycle.id && x.authorId === me.id && x.status === 'requested')) {
      out.push(
        f.kind === 'peer'
          ? { id: `peer:${f.id}`, kind: 'peer', title: `Give ${name(f.subjectId)} peer feedback`, sub: 'Start · Stop · Continue — 5 minutes', to: `/performance/checkins?answer=${f.id}`, due: f.dueAt, priority: 70 }
          : { id: `up:${f.id}`, kind: 'upward', title: `Share upward feedback for ${name(f.subjectId)}`, sub: 'Anonymous · shown only in aggregate', to: `/performance/checkins?answer=${f.id}`, due: f.dueAt, priority: 55 },
      );
    }
    // manager to-dos
    for (const rr of d.reviews.filter((x) => x.cycleId === cycle.id && x.managerId === me.id)) {
      const proposed = d.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.subjectId === rr.employeeId && f.status === 'proposed');
      if (proposed.length) out.push({ id: `noms:${rr.id}`, kind: 'nominations', title: `Approve ${name(rr.employeeId)}’s peer reviewers`, sub: `${proposed.length} nominated · keeps their 360 on schedule`, to: `/performance/checkins/${rr.id}?tab=peers`, priority: 80 });
      if (managerUnlocked(cycle, rr, now) && rr.manager.status !== 'submitted')
        out.push({ id: `mgr:${rr.id}`, kind: 'manager', title: `${rr.manager.status === 'draft' ? 'Finish' : 'Write'} ${name(rr.employeeId)}’s review`, sub: 'Self-reflection is in · evidence is ready', to: `/performance/checkins/${rr.id}?tab=manager`, due: getPhase(cycle, 'manager')?.end, priority: 60 });
    }
  }
  // released but unacknowledged reviews
  for (const r of d.reviews.filter((x) => x.employeeId === me.id && x.release && !x.release.acknowledgedAt)) {
    const c = d.cycles.find((x) => x.id === r.cycleId);
    out.push({ id: `ack:${r.id}`, kind: 'ack', title: `Read your ${c?.name ?? ''} review`, sub: 'Shared by your manager · acknowledge and reply', to: `/performance/checkins/${r.id}?tab=summary`, priority: 90 });
  }
  // feedback requests waiting on me
  for (const q of d.requests.filter((x) => !x.closedAt && x.respondentIds.includes(me.id) && !x.responses[me.id])) {
    out.push({ id: `req:${q.id}`, kind: 'request', title: `${name(q.requesterId)} asked for your feedback`, sub: `On “${q.topic}”`, to: `/performance/feedback?tab=requests&answer=${q.id}`, due: q.dueAt, priority: 75 });
  }
  // OKRs
  const mine = myCheckinKrs(d, me.id, period.id);
  const owned = objectivesOwnedBy(d, me.id, period.id);
  if (!owned.length && !mine.length) out.push({ id: 'okr-first', kind: 'okr-first', title: 'Set your first OKRs', sub: 'Nova drafts an objective and key results from one sentence', to: '/performance/okrs?new=1', priority: 85 });
  else {
    const due = mine.filter((k) => checkinDue(k, now));
    if (due.length) out.push({ id: 'checkin', kind: 'checkin', title: `Check in on ${due.length} key result${due.length === 1 ? '' : 's'}`, sub: 'Weekly check-ins keep forecasts honest', to: '/performance/okrs?checkin=1', priority: 65 });
  }
  // next 1:1 within 26h
  const series = d.series.filter((s) => s.leadId === me.id || s.memberId === me.id).sort((a, b) => a.nextAt - b.nextAt);
  const soon = series.find((s) => s.nextAt >= now && s.nextAt - now < 26 * 3_600_000);
  if (soon) out.push({ id: `1on1:${soon.id}`, kind: 'oneonone', title: `Prep your 1:1 with ${name(soon.leadId === me.id ? soon.memberId : soon.leadId)}`, sub: `${soon.agenda.filter((a) => !a.done).length} talking points on the agenda`, to: `/performance/one-on-ones/${soon.id}`, due: soon.nextAt, priority: 58 });
  // calibration (admins/managers) during calibration phase
  if (cycle && currentPhaseKey(cycle, now) === 'calibration' && !cycle.calibrationLockedAt && (isAdmin(v) || d.reviews.some((r) => r.cycleId === cycle.id && isAbove(users, me.id, r.employeeId))))
    out.push({ id: 'calibrate', kind: 'calibrate', title: 'Calibrate your org on the 9-box', sub: cycle.name, to: '/performance/calibration', due: getPhase(cycle, 'calibration')?.end, priority: 62 });

  return out.sort((a, b) => b.priority - a.priority || (a.due ?? Infinity) - (b.due ?? Infinity));
}

/* ───────── Feedback helpers ───────── */

export function visibleFeedback(d: Pick<PerfData, 'feedback'>, v: PerfViewer, users: User[]) {
  return d.feedback.filter((f) => canViewFeedback(v, users, f));
}

/** Reviews the viewer may open in a cycle. */
export function viewableReviews(d: Pick<PerfData, 'reviews'>, v: PerfViewer, users: User[], cycleId: string) {
  return d.reviews.filter((r) => r.cycleId === cycleId && reviewAccess(v, users, r).canView);
}

/** Days since the last completed 1:1 between two people (null if never). */
export function daysSinceLastOneOnOne(d: Pick<PerfData, 'series'>, a: string, b: string, now: number): number | null {
  const s = d.series.find((x) => (x.leadId === a && x.memberId === b) || (x.leadId === b && x.memberId === a));
  const last = s?.meetings[0]?.at;
  return last ? Math.floor((now - last) / DAY) : null;
}
