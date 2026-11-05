/**
 * Benefits area helpers shared by the coverage hero, enrolment wizard, claims
 * and perks: the signed-in person's election and pay record, deadline maths,
 * money formatting and a reduced-motion-aware celebration.
 */
import { useSessionUser } from '@/store/selectors';
import { useHr } from '@/hr/store';
import { daysBetween, todayISO } from '@/hr/calendar';
import type { AllowanceId, BenefitElection, CompRecord } from '@/hr/types';
import { ALLOWANCES } from '@/hr/constants';
import { burstConfetti } from '@/lib/confetti';

export type LifeEvent = 'baby' | 'marriage';
export const LIFE_EVENTS: readonly LifeEvent[] = ['baby', 'marriage'];

export const isLifeEvent = (v: string | null): v is LifeEvent => !!v && (LIFE_EVENTS as readonly string[]).includes(v);
export const isAllowanceId = (v: string | null): v is AllowanceId => !!v && ALLOWANCES.some((a) => a.id === v);

/** Current plan year (elections are stored per calendar year). */
export const planYear = () => new Date().getFullYear();

/** My election for this plan year (a stable store reference, safe as a selector). */
export function useMyElection(): BenefitElection | undefined {
  const me = useSessionUser();
  const uid = me?.id;
  const year = planYear();
  return useHr((s) => (uid ? s.elections.find((e) => e.userId === uid && e.year === year) : undefined));
}

/** My own pay record (employees always see their own pay). */
export function useMyComp(): CompRecord | undefined {
  const me = useSessionUser();
  const uid = me?.id;
  return useHr((s) => (uid ? s.comp.find((c) => c.userId === uid) : undefined));
}

/** Currency formatting; shows cents only when the amount has them (or when forced). */
export function money(amount: number, currency: string, opts: { cents?: boolean; compact?: boolean } = {}): string {
  const digits = opts.cents ? 2 : Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: opts.compact ? 0 : digits,
      maximumFractionDigits: opts.compact ? 1 : digits,
      notation: opts.compact ? 'compact' : 'standard',
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

/** Benefit prices and allowances are set in AED. */
export const aed = (amount: number, opts?: { cents?: boolean; compact?: boolean }) => money(amount, 'AED', opts);

export interface DeadlineInfo {
  left: number;
  overdue: boolean;
  urgent: boolean;
  label: string;
  /** Share of the 30-day enrolment window already used (0–1). */
  elapsed: number;
}

export function deadlineInfo(deadline: string | undefined, today = todayISO()): DeadlineInfo | null {
  if (!deadline) return null;
  const left = daysBetween(today, deadline);
  const label = left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : left === 0 ? 'Due today' : `${left} day${left === 1 ? '' : 's'} left`;
  return { left, overdue: left < 0, urgent: left <= 7, label, elapsed: Math.max(0, Math.min(1, (30 - left) / 30)) };
}

/** "Nov payroll" (adds the year when it isn't this year). */
export function payrollLabel(month: string | undefined): string | null {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 1, 1);
  return `${d.toLocaleDateString(undefined, { month: 'short', ...(y === new Date().getFullYear() ? {} : { year: 'numeric' }) })} payroll`;
}

/** Confetti for the big moments, skipped when the person prefers less motion. */
export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  burstConfetti(origin);
}

/** Total of every annual allowance (part of "total rewards"). */
export const ALLOWANCES_TOTAL = ALLOWANCES.reduce((n, a) => n + a.annual, 0);
