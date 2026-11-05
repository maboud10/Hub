/**
 * Pure calculations for Helix Projects: progress, blocking, dependency cycles,
 * My Tasks bucketing, focus suggestions, workload, sprint burndown & velocity,
 * goal roll-ups, calendar/timeline projections, template instantiation and the
 * Nova status-update drafter. No React, no store — unit-tested.
 */
import type { User } from '@/types';
import { addDaysISO, daysBetween, toISODate } from '@/hr/calendar';
import { PRIORITY_META, WEEKLY_CAPACITY_HOURS } from './constants';
import type {
  Goal,
  MyTasksBucket,
  Project,
  ProjectHealth,
  ProjectSection,
  ProjectTemplate,
  Recurrence,
  Sprint,
  Task,
  TaskPriority,
} from './types';

const round = (n: number) => Math.round(n);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const slugKey = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 5) || 'PRJ';

export const taskRef = (project: Pick<Project, 'key'>, task: Pick<Task, 'number'>) => `${project.key}-${task.number}`;

export const isDone = (t: Pick<Task, 'status'>) => t.status === 'done';
export const isOverdue = (t: Pick<Task, 'status' | 'dueDate'>, today: string) => !isDone(t) && Boolean(t.dueDate && t.dueDate < today);
export const isDueToday = (t: Pick<Task, 'status' | 'dueDate'>, today: string) => !isDone(t) && t.dueDate === today;
export const isDueWithin = (t: Pick<Task, 'status' | 'dueDate'>, today: string, days: number) =>
  !isDone(t) && Boolean(t.dueDate && t.dueDate >= today && daysBetween(today, t.dueDate) <= days);

/** A task is blocked while any dependency is still open. */
export function isBlocked(t: Pick<Task, 'dependsOn' | 'status'>, byId: Map<string, Task>): boolean {
  if (isDone(t)) return false;
  return t.dependsOn.some((id) => {
    const dep = byId.get(id);
    return dep && !isDone(dep);
  });
}

export const blockersOf = (t: Pick<Task, 'dependsOn'>, byId: Map<string, Task>): Task[] =>
  t.dependsOn.map((id) => byId.get(id)).filter((x): x is Task => Boolean(x) && !isDone(x!));

export const dependentsOf = (taskId: string, tasks: Task[]): Task[] => tasks.filter((t) => t.dependsOn.includes(taskId));

/** Would making `taskId` depend on `dependsOnId` create a cycle? */
export function wouldCreateCycle(taskId: string, dependsOnId: string, byId: Map<string, Task>): boolean {
  if (taskId === dependsOnId) return true;
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const t = byId.get(cur);
    if (t) stack.push(...t.dependsOn);
  }
  return false;
}

export interface Progress {
  total: number;
  done: number;
  pct: number;
  overdue: number;
  blocked: number;
  dueSoon: number;
  inProgress: number;
  milestonesTotal: number;
  milestonesDone: number;
}

export function computeProgress(tasks: Task[], today: string): Progress {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const total = tasks.length;
  const done = tasks.filter(isDone).length;
  const milestones = tasks.filter((t) => t.type === 'milestone');
  return {
    total,
    done,
    pct: total ? round((done / total) * 100) : 0,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    blocked: tasks.filter((t) => isBlocked(t, byId)).length,
    dueSoon: tasks.filter((t) => isDueWithin(t, today, 7)).length,
    inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'in_review').length,
    milestonesTotal: milestones.length,
    milestonesDone: milestones.filter(isDone).length,
  };
}

/** Suggest a health from the numbers (used by the Nova status drafter and portfolio view). */
export function suggestHealth(p: Progress, project: Pick<Project, 'dueDate' | 'health'>, today: string): ProjectHealth {
  if (project.health === 'on_hold' || project.health === 'complete') return project.health;
  if (p.total > 0 && p.done === p.total) return 'complete';
  const overdueRatio = p.total ? p.overdue / p.total : 0;
  const daysLeft = daysBetween(today, project.dueDate);
  const expectedPct = daysLeft <= 0 ? 100 : Math.max(0, Math.min(100, 100 - (daysLeft / 90) * 100));
  if (overdueRatio > 0.25 || (daysLeft < 0 && p.pct < 90)) return 'off_track';
  if (overdueRatio > 0.1 || p.blocked > 2 || p.pct + 25 < expectedPct) return 'at_risk';
  return 'on_track';
}

// ───────────────────────── My Tasks ─────────────────────────
export function bucketFor(t: Task, today: string, override?: MyTasksBucket): MyTasksBucket {
  if (override) return override;
  if (!t.dueDate) return 'later';
  if (t.dueDate <= today) return 'today';
  if (daysBetween(today, t.dueDate) <= 7) return 'upcoming';
  return 'later';
}

export interface FocusSuggestion {
  task: Task;
  score: number;
  reason: string;
}

/** Nova "Plan my day": rank open tasks by urgency, blocking impact and priority. */
export function suggestFocus(tasks: Task[], allTasks: Task[], today: string, limit = 3): FocusSuggestion[] {
  const open = tasks.filter((t) => !isDone(t));
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  return open
    .map((task) => {
      let score = 0;
      const reasons: string[] = [];
      if (isOverdue(task, today)) {
        score += 50;
        reasons.push(`overdue by ${daysBetween(task.dueDate!, today)}d`);
      } else if (isDueToday(task, today)) {
        score += 40;
        reasons.push('due today');
      } else if (isDueWithin(task, today, 2)) {
        score += 20;
        reasons.push('due in 2 days');
      }
      const dependents = dependentsOf(task.id, allTasks).filter((d) => !isDone(d));
      if (dependents.length) {
        score += 12 * dependents.length;
        reasons.push(`unblocks ${dependents.length} task${dependents.length === 1 ? '' : 's'}`);
      }
      score += (4 - PRIORITY_META[task.priority].rank) * 5;
      if (task.priority === 'urgent') reasons.push('urgent');
      if (task.type === 'milestone') {
        score += 8;
        reasons.push('milestone');
      }
      if (task.type === 'approval') {
        score += 10;
        reasons.push('approval waiting');
      }
      if (isBlocked(task, byId)) score -= 30;
      if (task.status === 'in_progress') score += 6;
      return { task, score, reason: reasons.join(' · ') || 'next by priority' };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ───────────────────────── Workload ─────────────────────────
export interface WorkloadRow {
  userId: string;
  openTasks: number;
  overdue: number;
  hours: number;
  capacity: number;
  loadPct: number;
  state: 'under' | 'healthy' | 'over';
}

export function computeWorkload(tasks: Task[], users: Pick<User, 'id'>[], today: string, horizonDays = 7): WorkloadRow[] {
  return users
    .map((u) => {
      const mine = tasks.filter((t) => t.assigneeId === u.id && !isDone(t));
      const inWindow = mine.filter((t) => !t.dueDate || daysBetween(today, t.dueDate) <= horizonDays);
      const hours = sum(inWindow.map((t) => Math.max(0, (t.estimateHours ?? 4) - t.loggedHours)));
      const loadPct = round((hours / WEEKLY_CAPACITY_HOURS) * 100);
      return {
        userId: u.id,
        openTasks: mine.length,
        overdue: mine.filter((t) => isOverdue(t, today)).length,
        hours,
        capacity: WEEKLY_CAPACITY_HOURS,
        loadPct,
        state: loadPct > 100 ? 'over' : loadPct < 40 ? 'under' : 'healthy',
      } as WorkloadRow;
    })
    .sort((a, b) => b.loadPct - a.loadPct);
}

// ───────────────────────── Sprints ─────────────────────────
export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

const pointsOf = (t: Task) => t.storyPoints ?? Math.max(1, Math.round((t.estimateHours ?? 4) / 4));

export function sprintBurndown(sprint: Sprint, tasks: Task[], today: string): BurndownPoint[] {
  const scoped = tasks.filter((t) => t.sprintId === sprint.id);
  const total = sum(scoped.map(pointsOf));
  const days = Math.max(1, daysBetween(sprint.startDate, sprint.endDate));
  const out: BurndownPoint[] = [];
  for (let i = 0; i <= days; i += 1) {
    const date = addDaysISO(sprint.startDate, i);
    const ideal = Math.max(0, total - (total / days) * i);
    if (date > today) {
      out.push({ date, remaining: NaN, ideal });
      continue;
    }
    const doneBy = scoped.filter((t) => isDone(t) && t.completedAt && toISODate(t.completedAt) <= date);
    out.push({ date, remaining: total - sum(doneBy.map(pointsOf)), ideal });
  }
  return out;
}

export function sprintStats(sprint: Sprint, tasks: Task[]) {
  const scoped = tasks.filter((t) => t.sprintId === sprint.id);
  const committed = sum(scoped.map(pointsOf));
  const done = sum(scoped.filter(isDone).map(pointsOf));
  return { committed, done, remaining: committed - done, tasks: scoped.length, doneTasks: scoped.filter(isDone).length };
}

export function velocity(sprints: Sprint[]): number {
  const closed = sprints.filter((s) => s.state === 'completed' && typeof s.completedPoints === 'number');
  if (!closed.length) return 0;
  return round(sum(closed.map((s) => s.completedPoints!)) / closed.length);
}

// ───────────────────────── Goals ─────────────────────────
export function goalProgress(goal: Goal, projects: Project[], tasks: Task[], today: string): number {
  if (typeof goal.manualProgress === 'number') return Math.max(0, Math.min(100, goal.manualProgress));
  if (goal.metric && goal.metric.target > 0) return Math.max(0, Math.min(100, round((goal.metric.current / goal.metric.target) * 100)));
  const linked = projects.filter((p) => goal.projectIds.includes(p.id));
  if (!linked.length) return 0;
  const pcts = linked.map((p) => computeProgress(tasks.filter((t) => t.projectId === p.id), today).pct);
  return round(sum(pcts) / pcts.length);
}

// ───────────────────────── Calendar & timeline ─────────────────────────
export function monthGrid(year: number, month0: number): string[][] {
  const first = new Date(year, month0, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const start = new Date(year, month0, 1 - startOffset);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const week: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      week.push(toISODate(dt.getTime()));
    }
    weeks.push(week);
  }
  return weeks;
}

export interface TimelineRow {
  task: Task;
  start: string;
  end: string;
  /** 0..1 offsets inside the window */
  left: number;
  width: number;
  blockedBy: string[];
}

export function timelineRows(tasks: Task[], windowStart: string, windowEnd: string): TimelineRow[] {
  const span = Math.max(1, daysBetween(windowStart, windowEnd));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks
    .filter((t) => t.dueDate || t.startDate)
    .map((task) => {
      const end = task.dueDate ?? task.startDate!;
      const start = task.startDate ?? addDaysISO(end, task.type === 'milestone' ? 0 : -Math.max(1, Math.round((task.estimateHours ?? 8) / 8)));
      const left = Math.max(0, Math.min(1, daysBetween(windowStart, start) / span));
      const right = Math.max(0, Math.min(1, (daysBetween(windowStart, end) + 1) / span));
      return { task, start, end, left, width: Math.max(0.01, right - left), blockedBy: task.dependsOn.filter((id) => byId.has(id)) };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ───────────────────────── Templates & recurrence ─────────────────────────
export function instantiateTemplate(template: ProjectTemplate, startDate: string, sectionIds: string[]): { sections: ProjectSection[]; tasks: Omit<Task, 'id' | 'projectId' | 'number' | 'createdAt' | 'updatedAt' | 'activity'>[] } {
  const sections = template.sections.map((name, i) => ({ id: sectionIds[i], name }));
  const sectionByName = new Map(sections.map((s) => [s.name, s.id]));
  const tasks = template.tasks.map((tt, i) => ({
    sectionId: sectionByName.get(tt.section) ?? sections[0].id,
    title: tt.title,
    description: '',
    type: tt.type ?? ('task' as const),
    status: 'todo' as const,
    priority: tt.priority ?? ('medium' as TaskPriority),
    collaboratorIds: [],
    creatorId: '',
    dueDate: addDaysISO(startDate, tt.offsetDays),
    estimateHours: tt.estimateHours,
    loggedHours: 0,
    tags: tt.tags ?? [],
    customFieldValues: {},
    subtasks: (tt.subtasks ?? []).map((title, j) => ({ id: `st-${i}-${j}`, title, done: false })),
    dependsOn: [],
    attachments: [],
    comments: [],
    likes: [],
    order: i,
  }));
  return { sections, tasks };
}

export function nextRecurrence(dueDate: string, recurring: Recurrence): string {
  switch (recurring) {
    case 'daily':
      return addDaysISO(dueDate, 1);
    case 'weekly':
      return addDaysISO(dueDate, 7);
    case 'biweekly':
      return addDaysISO(dueDate, 14);
    case 'monthly': {
      const [y, m, d] = dueDate.split('-').map(Number);
      const next = new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
      return toISODate(next.getTime());
    }
  }
}

// ───────────────────────── Nova status drafter ─────────────────────────
export interface StatusDraft {
  health: ProjectHealth;
  title: string;
  summary: string;
  highlights: string[];
  blockers: string[];
  nextSteps: string[];
  progressPct: number;
}

export function draftStatusUpdate(project: Project, tasks: Task[], users: Pick<User, 'id' | 'name'>[], today: string): StatusDraft {
  const p = computeProgress(tasks, today);
  const health = suggestHealth(p, project, today);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const name = (id?: string) => users.find((u) => u.id === id)?.name.split(' ')[0] ?? 'unassigned';
  const weekAgo = Date.now() - 7 * 86_400_000;
  const shipped = tasks.filter((t) => isDone(t) && (t.completedAt ?? 0) >= weekAgo).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const overdue = tasks.filter((t) => isOverdue(t, today)).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const blocked = tasks.filter((t) => isBlocked(t, byId));
  const upcoming = tasks
    .filter((t) => !isDone(t) && t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 3);
  const nextMilestone = tasks.filter((t) => t.type === 'milestone' && !isDone(t) && t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  const daysLeft = daysBetween(today, project.dueDate);

  const highlights = shipped.slice(0, 3).map((t) => `${t.title} shipped by ${name(t.assigneeId)}`);
  if (!highlights.length && p.done) highlights.push(`${p.done} of ${p.total} tasks complete (${p.pct}%)`);
  const blockers = [
    ...overdue.slice(0, 2).map((t) => `${t.title} is ${daysBetween(t.dueDate!, today)}d overdue (${name(t.assigneeId)})`),
    ...blocked.slice(0, 2).map((t) => `${t.title} is waiting on ${blockersOf(t, byId).map((b) => b.title).join(', ') || 'a dependency'}`),
  ];
  const nextSteps = upcoming.map((t) => `${t.title} · due ${t.dueDate} (${name(t.assigneeId)})`);
  if (nextMilestone) nextSteps.unshift(`Milestone “${nextMilestone.title}” on ${nextMilestone.dueDate}`);

  const titleBy: Record<ProjectHealth, string> = {
    on_track: 'Steady progress — on track',
    at_risk: 'Watch-outs this week — at risk',
    off_track: 'Needs intervention — off track',
    on_hold: 'Paused',
    complete: 'Project complete 🎉',
  };
  const summary =
    `${p.done}/${p.total} tasks done (${p.pct}%) with ${daysLeft >= 0 ? `${daysLeft} days` : `${-daysLeft} days overrun`} to the target date. ` +
    `${shipped.length} item${shipped.length === 1 ? '' : 's'} shipped in the last 7 days; ${p.overdue} overdue and ${p.blocked} blocked. ` +
    (health === 'on_track' ? 'No escalations needed.' : health === 'at_risk' ? 'Owners are re-planning the slipping items.' : 'Scope or dates need a decision this week.');

  return { health, title: titleBy[health], summary, highlights, blockers, nextSteps, progressPct: p.pct };
}
