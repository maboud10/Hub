/**
 * Workload engine — estimated hours per person per week vs capacity, and a
 * greedy "Nova Rebalance" that moves work from overloaded weeks to teammates
 * with headroom. Pure & deterministic.
 */
import { addDays, diffDays, isWeekend, startOfWeek } from './dates';

export const CAPACITY = 32;
export const WEEKS = 6;

export interface LoadTask {
  id: string;
  title: string;
  assigneeId: string | null;
  estimate?: number;
  startDate?: string;
  dueDate?: string;
  done: boolean;
  priority?: string;
}

export interface PersonLoad {
  userId: string;
  /** hours per week column */
  hours: number[];
  /** task ids contributing to each week column */
  tasks: string[][];
  total: number;
}

export type LoadLevel = 'idle' | 'light' | 'balanced' | 'full' | 'over';

export function weekStarts(today: string, weeks = WEEKS): string[] {
  const mon = startOfWeek(today);
  return Array.from({ length: weeks }, (_, i) => addDays(mon, i * 7));
}

/**
 * Spread a task's estimate evenly over the working days between its start
 * (or today) and its due date. Overdue work lands today. Undated or
 * unestimated work is not scheduled.
 */
export function distribute(task: LoadTask, weeks: string[], today: string): number[] {
  const out = weeks.map(() => 0);
  if (task.done || !task.estimate || task.estimate <= 0 || !task.dueDate || !weeks.length) return out;
  const to = task.dueDate < today ? today : task.dueDate;
  let from = task.startDate && task.startDate > today ? task.startDate : today;
  if (from > to) from = to;
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) if (!isWeekend(d)) days.push(d);
  if (!days.length) days.push(to);
  const per = task.estimate / days.length;
  for (const d of days) {
    const wi = Math.floor(diffDays(weeks[0], d) / 7);
    if (wi >= 0 && wi < weeks.length) out[wi] += per;
  }
  return out;
}

export function workloadMatrix(tasks: LoadTask[], people: string[], weeks: string[], today: string): Map<string, PersonLoad> {
  const m = new Map<string, PersonLoad>(people.map((id) => [id, { userId: id, hours: weeks.map(() => 0), tasks: weeks.map(() => []), total: 0 }]));
  for (const t of tasks) {
    if (!t.assigneeId) continue;
    const row = m.get(t.assigneeId);
    if (!row) continue;
    distribute(t, weeks, today).forEach((h, i) => {
      if (h <= 0) return;
      row.hours[i] += h;
      row.tasks[i].push(t.id);
      row.total += h;
    });
  }
  for (const row of m.values()) row.hours = row.hours.map((h) => Math.round(h * 10) / 10);
  return m;
}

export function loadLevel(hours: number, capacity = CAPACITY): LoadLevel {
  if (hours <= 0.05) return 'idle';
  const r = hours / capacity;
  if (r < 0.5) return 'light';
  if (r < 0.85) return 'balanced';
  if (r <= 1) return 'full';
  return 'over';
}

export interface Suggestion {
  taskId: string;
  from: string;
  to: string;
  /** Week index that was overloaded */
  week: number;
  /** Hours of the task in that week */
  hours: number;
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
}

/**
 * Greedy rebalance: for each overloaded person-week (worst first), move the
 * task contributing the most hours (preferring later due dates, never urgent
 * work due within 2 days) to the eligible teammate with the most headroom,
 * as long as the move keeps that teammate at or under capacity every week.
 */
export function suggestRebalance(
  tasks: LoadTask[],
  matrix: Map<string, PersonLoad>,
  weeks: string[],
  today: string,
  candidates: (task: LoadTask) => string[],
  capacity = CAPACITY,
  max = 4,
): Suggestion[] {
  const hours = new Map([...matrix].map(([id, r]) => [id, [...r.hours]]));
  const owner = new Map(tasks.map((t) => [t.id, t.assigneeId]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: Suggestion[] = [];
  const moved = new Set<string>();

  for (let guard = 0; guard < 40 && out.length < max; guard++) {
    let worst: { person: string; week: number; over: number } | null = null;
    for (const [person, hs] of hours)
      hs.forEach((h, w) => {
        const over = h - capacity;
        if (over > 0.5 && (!worst || over > worst.over)) worst = { person, week: w, over };
      });
    if (!worst) break;
    const { person, week } = worst as { person: string; week: number; over: number };
    const pool = tasks
      .filter((t) => owner.get(t.id) === person && !moved.has(t.id) && !t.done)
      .map((t) => ({ t, dist: distribute(t, weeks, today) }))
      .filter(({ t, dist }) => dist[week] > 0 && !(t.priority === 'urgent' && t.dueDate && diffDays(today, t.dueDate) <= 2))
      .sort((a, b) => b.dist[week] - a.dist[week] || (b.t.dueDate ?? '').localeCompare(a.t.dueDate ?? ''));
    let done = false;
    for (const { t, dist } of pool) {
      const options = candidates(t)
        .filter((c) => c !== person && hours.has(c))
        .map((c) => ({ c, hs: hours.get(c)! }))
        .filter(({ hs }) => hs.every((h, i) => h + dist[i] <= capacity))
        .sort((a, b) => a.hs[week] - b.hs[week] || a.c.localeCompare(b.c));
      const pick = options[0];
      if (!pick) continue;
      const fromHs = hours.get(person)!;
      const s: Suggestion = {
        taskId: t.id,
        from: person,
        to: pick.c,
        week,
        hours: Math.round(dist[week] * 10) / 10,
        fromBefore: Math.round(fromHs[week] * 10) / 10,
        fromAfter: Math.round((fromHs[week] - dist[week]) * 10) / 10,
        toBefore: Math.round(pick.hs[week] * 10) / 10,
        toAfter: Math.round((pick.hs[week] + dist[week]) * 10) / 10,
      };
      dist.forEach((h, i) => {
        fromHs[i] -= h;
        pick.hs[i] += h;
      });
      owner.set(t.id, pick.c);
      moved.add(t.id);
      out.push(s);
      done = true;
      break;
    }
    if (!done) {
      // nothing movable for this cell — make sure we don't spin on it
      hours.get(person)![week] = Math.min(hours.get(person)![week], capacity);
    }
  }
  return out.filter((s) => byId.has(s.taskId));
}
