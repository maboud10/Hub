/**
 * Onboarding journey helpers shared by the Talent Hub hand-off and HR Portal.
 */
import type { OnboardingJourney, OnboardingPhase, OnboardingTask } from './types';
import { ONBOARDING_TEMPLATE, PHASE_ORDER } from './constants';

const DAY = 86_400_000;

/** Parse an ISO date (YYYY-MM-DD) as local midnight. */
export function parseISODate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export function toISODate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso: string, days: number): string {
  return toISODate(parseISODate(iso) + days * DAY);
}

/** Clone the default plan into concrete tasks for a journey. */
export function buildJourneyTasks(idPrefix: string): OnboardingTask[] {
  return ONBOARDING_TEMPLATE.map((t, i) => ({ id: `${idPrefix}-t${i + 1}`, ...t, done: false }));
}

export function taskDueDate(j: Pick<OnboardingJourney, 'startDate'>, t: Pick<OnboardingTask, 'dueOffsetDays'>): number {
  return parseISODate(j.startDate) + t.dueOffsetDays * DAY;
}

/** Whole days until day one (negative once started). */
export function daysUntilStart(j: Pick<OnboardingJourney, 'startDate'>, now = Date.now()): number {
  const start = parseISODate(j.startDate);
  const today = new Date(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((start - midnight) / DAY);
}

/** The phase the new hire is in today, based on the calendar. */
export function calendarPhase(j: Pick<OnboardingJourney, 'startDate'>, now = Date.now()): OnboardingPhase {
  const d = -daysUntilStart(j, now); // days since start
  if (d < 0) return 'pre-boarding';
  if (d === 0) return 'day-1';
  if (d < 7) return 'week-1';
  if (d < 30) return 'day-30';
  if (d < 60) return 'day-60';
  return 'day-90';
}

export interface PhaseProgress {
  phase: OnboardingPhase;
  done: number;
  total: number;
  overdue: number;
}

export function journeyProgress(j: OnboardingJourney, now = Date.now()) {
  const phases: PhaseProgress[] = PHASE_ORDER.map((phase) => {
    const tasks = j.tasks.filter((t) => t.phase === phase);
    return {
      phase,
      done: tasks.filter((t) => t.done).length,
      total: tasks.length,
      overdue: tasks.filter((t) => !t.done && taskDueDate(j, t) < now - DAY).length,
    };
  });
  const done = j.tasks.filter((t) => t.done).length;
  const total = j.tasks.length;
  return {
    phases,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    overdue: phases.reduce((n, p) => n + p.overdue, 0),
    current: calendarPhase(j, now),
  };
}

/** Journey status derived from the calendar + task completion. */
export function deriveJourneyStatus(j: OnboardingJourney, now = Date.now()): OnboardingJourney['status'] {
  if (j.tasks.length && j.tasks.every((t) => t.done)) return 'completed';
  return daysUntilStart(j, now) > 0 ? 'pre-boarding' : 'active';
}
