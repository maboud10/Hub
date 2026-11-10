/**
 * Project metrics (progress, velocity, burn-up, forecast, health) and the
 * Nova status-update drafter. Pure: callers pass `now`.
 */
import { DAY, addDays, diffDays, iso, parseIso, shortDate, startOfWeek } from './dates';
import { openBlockers } from './graph';
import type { Project, ProjectStatus, Task } from './types';

export interface ProjectMetrics {
  total: number;
  done: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  blocked: number;
  /** 0..1 share of tasks completed */
  progress: number;
  /** 0..1 share of the timeline elapsed */
  elapsed: number;
  doneThisWeek: number;
}

export const taskKey = (p: Pick<Project, 'key'> | undefined, t: Pick<Task, 'number'>) => `${p?.key ?? 'MY'}-${t.number}`;

export function elapsedRatio(start: string, due: string, now: number): number {
  const s = parseIso(start).getTime();
  const e = parseIso(due).getTime() + DAY;
  if (e <= s) return 1;
  return Math.max(0, Math.min(1, (now - s) / (e - s)));
}

export function projectMetrics(project: Project, tasks: Task[], now: number): ProjectMetrics {
  const today = iso(now);
  const weekEnd = addDays(startOfWeek(today), 6);
  const weekStartTs = parseIso(startOfWeek(today)).getTime();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let done = 0;
  let overdue = 0;
  let dueThisWeek = 0;
  let blocked = 0;
  let doneThisWeek = 0;
  for (const t of tasks) {
    if (t.completedAt) {
      done += 1;
      if (t.completedAt >= weekStartTs) doneThisWeek += 1;
      continue;
    }
    if (t.dueDate && t.dueDate < today) overdue += 1;
    if (t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd) dueThisWeek += 1;
    if (openBlockers(t, byId).length) blocked += 1;
  }
  const total = tasks.length;
  return {
    total,
    done,
    open: total - done,
    overdue,
    dueThisWeek,
    blocked,
    progress: total ? done / total : 0,
    elapsed: elapsedRatio(project.startDate, project.dueDate, now),
    doneThisWeek,
  };
}

/** Tasks completed per calendar week (Mon–Sun), oldest → newest, current week last. */
export function velocity(tasks: Pick<Task, 'completedAt'>[], now: number, weeks = 6): number[] {
  const mon = parseIso(startOfWeek(iso(now))).getTime();
  const out = Array.from({ length: weeks }, () => 0);
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const wi = Math.floor((t.completedAt - mon) / (7 * DAY));
    const idx = weeks - 1 + wi;
    if (idx >= 0 && idx < weeks) out[idx] += 1;
  }
  return out;
}

/** Daily completions for the last `days` days (oldest → newest, today last). */
export function dailyDone(tasks: Pick<Task, 'completedAt'>[], now: number, days = 8): number[] {
  const today = iso(now);
  const out = Array.from({ length: days }, () => 0);
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const d = diffDays(iso(t.completedAt), today);
    if (d >= 0 && d < days) out[days - 1 - d] += 1;
  }
  return out;
}

export interface BurnPoint {
  day: string;
  scope: number;
  done: number;
}

/** Cumulative scope vs. completed per day from the project start to today. */
export function burnup(project: Project, tasks: Task[], now: number, maxPoints = 40): BurnPoint[] {
  const today = iso(now);
  const first = tasks.reduce((m, t) => Math.min(m, t.createdAt), parseIso(project.startDate).getTime());
  const start = iso(Math.min(first, parseIso(project.startDate).getTime()));
  const span = Math.max(1, diffDays(start, today));
  const step = Math.max(1, Math.ceil(span / maxPoints));
  const out: BurnPoint[] = [];
  for (let d = 0; d <= span; d += step) {
    const day = addDays(start, d);
    const end = parseIso(day).getTime() + DAY;
    out.push({
      day,
      scope: tasks.filter((t) => t.createdAt < end).length,
      done: tasks.filter((t) => t.completedAt && t.completedAt < end).length,
    });
  }
  if (out[out.length - 1]?.day !== today) {
    out.push({ day: today, scope: tasks.length, done: tasks.filter((t) => t.completedAt).length });
  }
  return out;
}

/** Forecast finish date from the last 3 weeks of velocity. Null when there is no signal. */
export function forecastFinish(tasks: Task[], now: number): string | null {
  const open = tasks.filter((t) => !t.completedAt).length;
  if (!open) return iso(now);
  const recent = tasks.filter((t) => t.completedAt && now - t.completedAt <= 21 * DAY).length;
  if (!recent) return null;
  const perDay = recent / 21;
  return addDays(iso(now), Math.ceil(open / perDay));
}

/** Nova's read of project health from the numbers. */
export function suggestStatus(project: Project, m: ProjectMetrics): ProjectStatus {
  if (project.status === 'on-hold') return 'on-hold';
  if (m.total > 0 && m.done === m.total) return 'complete';
  const gap = m.elapsed - m.progress;
  const overdueShare = m.open ? m.overdue / m.open : 0;
  if (gap > 0.3 || overdueShare > 0.35) return 'off-track';
  if (gap > 0.12 || m.overdue >= 2 || overdueShare > 0.15) return 'at-risk';
  return 'on-track';
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
  'on-hold': 'On hold',
  complete: 'Complete',
};

export interface StatusDraft {
  status: ProjectStatus;
  title: string;
  body: string;
}

/** Drafts a weekly status update from real project data. */
export function draftStatusUpdate(project: Project, tasks: Task[], now: number, nameOf: (id: string | null | undefined) => string): StatusDraft {
  const m = projectMetrics(project, tasks, now);
  const status = suggestStatus(project, m);
  const today = iso(now);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const key = (t: Task) => taskKey(project, t);
  const first = (id: string | null | undefined) => nameOf(id).split(' ')[0];

  const shipped = tasks.filter((t) => t.completedAt && now - t.completedAt <= 7 * DAY).sort((a, b) => b.completedAt! - a.completedAt!);
  const overdue = tasks
    .filter((t) => !t.completedAt && t.dueDate && t.dueDate < today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const blocked = tasks.filter((t) => !t.completedAt && openBlockers(t, byId).length);
  const milestones = tasks
    .filter((t) => t.kind === 'milestone' && !t.completedAt && t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 2);

  const lines: string[] = [];
  lines.push(
    shipped.length
      ? `**Shipped this week** — ${shipped.length} ${shipped.length === 1 ? 'task' : 'tasks'}: ${shipped
          .slice(0, 3)
          .map((t) => `${t.title} (${first(t.completedBy ?? t.assigneeId)})`)
          .join(', ')}${shipped.length > 3 ? ` and ${shipped.length - 3} more` : ''}.`
      : '**Shipped this week** — nothing closed yet; focus is on in-flight work.',
  );
  if (overdue.length)
    lines.push(
      `**Overdue** — ${overdue
        .slice(0, 3)
        .map((t) => `${key(t)} ${t.title} (${first(t.assigneeId)}, ${diffDays(t.dueDate!, today)}d late)`)
        .join('; ')}.`,
    );
  if (blocked.length)
    lines.push(
      `**Blockers** — ${blocked
        .slice(0, 3)
        .map((t) => `${key(t)} waits on ${openBlockers(t, byId).map((b) => key(b)).join(', ')}`)
        .join('; ')}.`,
    );
  if (milestones.length)
    lines.push(`**Next milestones** — ${milestones.map((t) => `${t.title} on ${shortDate(t.dueDate!)} (in ${diffDays(today, t.dueDate!)}d)`).join('; ')}.`);
  lines.push(`**Progress** — ${Math.round(m.progress * 100)}% complete with ${Math.round(m.elapsed * 100)}% of the timeline elapsed.`);

  const headline =
    status === 'complete'
      ? 'Everything shipped'
      : status === 'on-track'
        ? shipped.length
          ? `${shipped.length} shipped, on plan`
          : 'Steady progress, on plan'
        : overdue.length
          ? `${overdue.length} overdue${blocked.length ? `, ${blocked.length} blocked` : ''}`
          : blocked.length
            ? `${blocked.length} blocked ${blocked.length === 1 ? 'task' : 'tasks'} slowing us down`
            : 'Behind the timeline';
  return { status, title: `${STATUS_LABEL[status]} — ${headline}`, body: lines.join('\n') };
}
