/**
 * Pure HR calculations: leave balances (first-year pro-rating, carry-over,
 * pending requests), allowance usage, benefit costs, payslips, tenure and the
 * new-hire pulse schedule. No React, no store — unit-tested in hr.test.ts.
 */
import type { User } from '@/types';
import { ADD_ONS, ALLOWANCES, HEALTH_PLAN_BY_ID, LEAVE_TYPES, LIFE_COVER, PULSE_MILESTONES, type LeaveTypeMeta } from './constants';
import { addDaysISO, daysBetween, toISODate } from './calendar';
import type {
  AllowanceId,
  BenefitClaim,
  BenefitElection,
  CompRecord,
  HealthTier,
  LeaveAdjustment,
  LeaveRequest,
  LeaveTypeId,
  PulseMilestone,
  PulseResponse,
} from './types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

// ───────────────────────── leave balances ─────────────────────────
export interface LeaveBalance {
  type: LeaveTypeId;
  /** Policy allowance for the year (pro-rated in the first year); null = no fixed allowance. */
  allowance: number | null;
  /** Carry-over and People Ops adjustments. */
  adjustments: number;
  entitled: number | null;
  /** Approved days already taken. */
  taken: number;
  /** Approved days still to come. */
  booked: number;
  pending: number;
  /** entitled − taken − booked − pending (null when there's no fixed allowance). */
  available: number | null;
}

/** Allowance for a leave type in a year, pro-rating annual leave in the joining year. */
export function allowanceFor(type: LeaveTypeMeta, startDate: string, year: number): number | null {
  if (type.allowance === null) return null;
  const [sy, sm] = startDate.split('-').map(Number);
  if (sy > year) return 0;
  if (type.id === 'annual' && sy === year) return Math.round(((type.allowance * (12 - (sm - 1))) / 12) * 2) / 2;
  return type.allowance;
}

export function computeBalances(
  user: Pick<User, 'id' | 'startDate'>,
  leave: LeaveRequest[],
  adjustments: LeaveAdjustment[],
  year: number,
  today: string,
): LeaveBalance[] {
  const mine = leave.filter((r) => r.userId === user.id);
  return LEAVE_TYPES.map((t) => {
    const reqs = mine.filter((r) => r.type === t.id && (t.oncePerEmployment || r.start.startsWith(String(year))));
    const adj = sum(adjustments.filter((a) => a.userId === user.id && a.type === t.id && a.year === year).map((a) => a.days));
    const allowance = allowanceFor(t, user.startDate, year);
    const approved = reqs.filter((r) => r.status === 'approved');
    const taken = sum(approved.filter((r) => r.end < today).map((r) => r.days));
    const booked = sum(approved.filter((r) => r.end >= today).map((r) => r.days));
    const pending = sum(reqs.filter((r) => r.status === 'pending').map((r) => r.days));
    const entitled = allowance === null ? null : allowance + adj;
    return {
      type: t.id,
      allowance,
      adjustments: adj,
      entitled,
      taken,
      booked,
      pending,
      available: entitled === null ? null : round1(entitled - taken - booked - pending),
    };
  });
}

export const balanceOf = (balances: LeaveBalance[], type: LeaveTypeId) => balances.find((b) => b.type === type)!;

// ───────────────────────── allowances & benefits ─────────────────────────
export interface AllowanceUsage {
  id: AllowanceId;
  budget: number;
  /** Approved + paid. */
  spent: number;
  pending: number;
  remaining: number;
}

export function allowanceUsage(userId: string, claims: BenefitClaim[], year: number): AllowanceUsage[] {
  const mine = claims.filter((c) => c.userId === userId && c.date.startsWith(String(year)));
  return ALLOWANCES.map((a) => {
    const of = mine.filter((c) => c.allowance === a.id);
    const spent = sum(of.filter((c) => c.status === 'approved' || c.status === 'paid').map((c) => c.amount));
    const pending = sum(of.filter((c) => c.status === 'submitted').map((c) => c.amount));
    return { id: a.id, budget: a.annual, spent, pending, remaining: Math.max(0, a.annual - spent - pending) };
  });
}

/** Indicative Helix premium per month (AED) — shown to make the benefit visible. */
export const COMPANY_PREMIUM: Record<HealthTier, number> = { essential: 1100, plus: 1650, premier: 2900 };

export interface CostLine {
  label: string;
  amount: number;
}

/** Employee contribution per month (AED) for a set of choices. */
export function electionCost(e: Pick<BenefitElection, 'health' | 'dental' | 'vision' | 'lifeMultiple' | 'dependents'>) {
  const plan = HEALTH_PLAN_BY_ID[e.health];
  const lines: CostLine[] = [{ label: `${plan.label} health plan`, amount: plan.monthlyEmployee }];
  if (e.dependents.length) lines.push({ label: `${e.dependents.length} dependent${e.dependents.length === 1 ? '' : 's'}`, amount: plan.monthlyPerDependent * e.dependents.length });
  if (e.dental) lines.push({ label: ADD_ONS.dental.label, amount: ADD_ONS.dental.monthly });
  if (e.vision) lines.push({ label: ADD_ONS.vision.label, amount: ADD_ONS.vision.monthly });
  if (LIFE_COVER[e.lifeMultiple]) lines.push({ label: `Life cover ${e.lifeMultiple}× salary`, amount: LIFE_COVER[e.lifeMultiple] });
  return { lines, employeeMonthly: sum(lines.map((l) => l.amount)), companyMonthly: COMPANY_PREMIUM[e.health] * (1 + e.dependents.length * 0.6) };
}

// ───────────────────────── pay ─────────────────────────
export interface PayLine {
  label: string;
  amount: number;
}

export interface Payslip {
  id: string;
  userId: string;
  /** YYYY-MM */
  period: string;
  payDate: string;
  currency: string;
  earnings: PayLine[];
  deductions: PayLine[];
  gross: number;
  net: number;
  /** First month, pro-rated from the start date. */
  partial?: boolean;
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

const COMP_FX_TO_AED: Record<string, number> = {
  AED: 1,
  USD: 3.6725,
  GBP: 4.66,
  EUR: 3.98,
  SGD: 2.74,
  INR: 0.0438,
  CAD: 2.65,
  TRY: 0.106,
};

/** Monthly payslips (newest first) since the start date, up to `count`. */
export function payslipsFor(
  user: Pick<User, 'id' | 'startDate'>,
  comp: CompRecord | undefined,
  opts: {
    claims?: BenefitClaim[];
    election?: BenefitElection | null;
    reimbursements?: { userId: string; status: string; payrollPeriod?: string; reimbursableAed: number; reference?: string }[];
    bonuses?: { userId: string; status: string; payrollPeriod: string; amountAed: number; title: string }[];
    paidPeriods?: Set<string> | string[];
    now?: number;
    count?: number;
  } = {},
): Payslip[] {
  if (!comp) return [];
  const now = opts.now ?? Date.now();
  const today = toISODate(now);
  const paidSet =
    opts.paidPeriods instanceof Set
      ? opts.paidPeriods
      : opts.paidPeriods
        ? new Set(opts.paidPeriods)
        : null;
  const fx = COMP_FX_TO_AED[comp.currency] ?? 1;
  const fromAed = (aed: number) => round2(aed / fx);

  const out: Payslip[] = [];
  const d = new Date(now);
  let y = d.getFullYear();
  let m = d.getMonth();
  for (let i = 0; i < 24 && out.length < (opts.count ?? 6); i += 1) {
    const dim = daysInMonth(y, m);
    const period = `${y}-${pad(m + 1)}`;
    const payDate = `${period}-${pad(Math.min(comp.payDay, dim))}`;
    const monthEnd = `${period}-${pad(dim)}`;
    if (monthEnd < user.startDate) break;
    if (payDate <= today || paidSet?.has(period)) {
      const startsThisMonth = user.startDate.startsWith(period);
      const fraction = startsThisMonth ? (dim - Number(user.startDate.slice(8, 10)) + 1) / dim : 1;
      const earnings: PayLine[] = [{ label: 'Basic salary', amount: round2(comp.baseMonthly * fraction) }];
      if (comp.housingMonthly) earnings.push({ label: 'Housing allowance', amount: round2(comp.housingMonthly * fraction) });
      if (comp.transportMonthly) earnings.push({ label: 'Transport allowance', amount: round2(comp.transportMonthly * fraction) });
      const reimbursed = (opts.claims ?? []).filter((c) => c.userId === user.id && c.status === 'paid' && c.payrollMonth === period);
      for (const a of ALLOWANCES) {
        const total = sum(reimbursed.filter((c) => c.allowance === a.id).map((c) => c.amount));
        if (total) earnings.push({ label: `${a.label} reimbursement`, amount: fromAed(total) });
      }
      const paidExpensesAed = sum(
        (opts.reimbursements ?? [])
          .filter((r) => r.userId === user.id && r.status === 'reimbursed' && r.payrollPeriod === period)
          .map((r) => r.reimbursableAed),
      );
      if (paidExpensesAed > 0) {
        earnings.push({ label: 'Travel & expense reimbursement', amount: fromAed(paidExpensesAed) });
      }
      const paidBonuses = (opts.bonuses ?? []).filter(
        (b) => b.userId === user.id && b.status === 'paid' && b.payrollPeriod === period,
      );
      for (const b of paidBonuses) {
        earnings.push({ label: `Bonus · ${b.title}`, amount: fromAed(b.amountAed) });
      }

      const deductions: PayLine[] = [];
      if (comp.pensionRate) deductions.push({ label: 'Pension / social security', amount: round2(comp.baseMonthly * fraction * comp.pensionRate) });
      if (opts.election && opts.election.status === 'confirmed') {
        const c = electionCost(opts.election).employeeMonthly;
        if (c) deductions.push({ label: 'Benefits contribution', amount: fromAed(c) });
      }
      const gross = round2(sum(earnings.map((e) => e.amount)));
      const net = round2(gross - sum(deductions.map((x) => x.amount)));
      out.push({ id: `ps-${user.id}-${period}`, userId: user.id, period, payDate, currency: comp.currency, earnings, deductions, gross, net, partial: startsThisMonth || undefined });
    }
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

/** Next pay date on or after today. */
export function nextPayDate(comp: Pick<CompRecord, 'payDay'>, now = Date.now()): string {
  const d = new Date(now);
  const thisMonth = toISODate(new Date(d.getFullYear(), d.getMonth(), Math.min(comp.payDay, daysInMonth(d.getFullYear(), d.getMonth()))).getTime());
  if (thisMonth >= toISODate(now)) return thisMonth;
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return toISODate(new Date(n.getFullYear(), n.getMonth(), Math.min(comp.payDay, daysInMonth(n.getFullYear(), n.getMonth()))).getTime());
}

// ───────────────────────── tenure & new hires ─────────────────────────
export function tenure(startDate: string, now = Date.now()) {
  const days = Math.max(0, daysBetween(startDate, toISODate(now)));
  const years = Math.floor(days / 365.25);
  const months = Math.floor((days - years * 365.25) / 30.44);
  const label = years ? `${years} yr${years === 1 ? '' : 's'}${months ? ` ${months} mo` : ''}` : months ? `${months} month${months === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'}`;
  return { days, years, months, label };
}

/** Within the first 100 days (the onboarding pulse window). */
export const isNewHire = (startDate: string, now = Date.now()) => {
  const d = daysBetween(startDate, toISODate(now));
  return d >= 0 && d <= 100;
};

// ───────────────────────── pulse ─────────────────────────
export interface PulseSlot {
  milestone: PulseMilestone;
  label: string;
  state: 'done' | 'open' | 'upcoming' | 'missed';
  opensOn: string;
  closesOn: string;
  response?: PulseResponse;
}

export function pulseSchedule(startDate: string, responses: PulseResponse[], now = Date.now()): PulseSlot[] {
  const day = daysBetween(startDate, toISODate(now));
  return PULSE_MILESTONES.map((m) => {
    const response = responses.find((r) => r.milestone === m.id);
    const state: PulseSlot['state'] = response ? 'done' : day < m.openDay ? 'upcoming' : day <= m.closeDay ? 'open' : 'missed';
    return { milestone: m.id, label: m.label, state, opensOn: addDaysISO(startDate, m.openDay), closesOn: addDaysISO(startDate, m.closeDay), response };
  });
}

export const pulseScore = (r: Pick<PulseResponse, 'scores'>) => round1(sum(Object.values(r.scores)) / Object.values(r.scores).length);

// ───────────────────────── references ─────────────────────────
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Deterministic 8-character verification code (no ambiguous characters). */
export function verificationCode(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i;
    out += ALPHABET[Math.abs(h) % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export const letterReference = (year: number, seq: number) => `HX-LTR-${year}-${String(seq).padStart(4, '0')}`;
