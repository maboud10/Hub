/**
 * Pure Payroll Console calculations:
 * - Global FX normalization to AED (supporting AED, GBP, SGD, INR, EUR, USD, CAD, TRY)
 * - Monthly Pay Run builder integrating HR Comp, Pro-rata Starters, Unpaid Leave,
 *   Pension & Benefits deductions, HR Allowance Claims, Travel & Expense Reimbursements,
 *   Variable Bonuses, and Manual Adjustments
 * - Statutory UAE End-of-Service Gratuity (EOSB) liability calculator
 * - Salary Band Compa-Ratio, Penetration & Total Rewards analytics
 * - UAE Central Bank WPS `.SIF` & CSV generators
 */
import type { Department, User } from '@/types';
import type { BenefitClaim, BenefitElection, CompRecord, LeaveRequest } from '@/hr/types';
import type { ExpenseReport } from '@/expenses/types';
import { COMPANY_PREMIUM, electionCost } from '@/hr/engine';
import { daysBetween, toISODate } from '@/hr/calendar';
import { isEmployee } from '@/hr/seed';
import type {
  BonusAward,
  BonusKind,
  ManualLineAdjustment,
  PayrollEmployeeLine,
  PayrollRun,
  PayrollRunStatus,
  SalaryBand,
} from './types';

export const PAYROLL_FX_TO_AED: Record<string, number> = {
  AED: 1,
  USD: 3.6725,
  GBP: 4.66,
  EUR: 3.98,
  SGD: 2.74,
  INR: 0.0438,
  CAD: 2.65,
  TRY: 0.106,
  SAR: 0.979,
  JPY: 0.0245,
};

export const fxToAedFor = (currency: string): number => PAYROLL_FX_TO_AED[currency] ?? 1;

export const BONUS_KIND_META: Record<
  BonusKind,
  { label: string; color: string; description: string }
> = {
  performance: {
    label: 'Performance Bonus',
    color: '#10b981',
    description: 'Quarterly or project delivery impact tied to measurable outcomes.',
  },
  spot: {
    label: 'Spot Recognition',
    color: '#38bdf8',
    description: 'Immediate peer or manager recognition for craft, incident response, or customer delight.',
  },
  signing: {
    label: 'Signing / Cohort',
    color: '#a78bfa',
    description: 'Contractual sign-on or 30-day onboarding milestone payout.',
  },
  milestone: {
    label: 'SLO / Milestone',
    color: '#f59e0b',
    description: 'Engineering reliability, product launch, or revenue expansion milestone.',
  },
  retention: {
    label: 'Retention Award',
    color: '#fb7185',
    description: 'Key-talent retention cliff scheduled on a target payday.',
  },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function periodFromTimestamp(ts = Date.now(), offsetMonths = 0): string {
  const d = new Date(ts);
  const shifted = new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}`;
}

export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${MONTH_NAMES[m - 1] ?? period} ${y}`;
}

export function periodDates(period: string, defaultPayDay = 25) {
  const [y, m] = period.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const payDay = Math.min(defaultPayDay, dim);
  const cutoffDay = Math.max(1, payDay - 7);
  return {
    year: y,
    month: m,
    daysInMonth: dim,
    monthStart: `${period}-01`,
    monthEnd: `${period}-${pad2(dim)}`,
    cutoffDate: `${period}-${pad2(cutoffDay)}`,
    payDate: `${period}-${pad2(payDay)}`,
  };
}

export interface BuildPayrollRunInput {
  period: string;
  users: User[];
  comp: CompRecord[];
  leave: LeaveRequest[];
  claims: BenefitClaim[];
  elections: BenefitElection[];
  expenseReports: ExpenseReport[];
  bonuses: BonusAward[];
  manualAdjustments: ManualLineAdjustment[];
  status?: PayrollRunStatus;
  existingMeta?: Partial<
    Pick<
      PayrollRun,
      | 'id'
      | 'status'
      | 'preparedBy'
      | 'preparedAt'
      | 'approvedBy'
      | 'approvedAt'
      | 'approvalNote'
      | 'disbursedBy'
      | 'disbursedAt'
      | 'wpsBatchRef'
      | 'updatedAt'
    >
  >;
  now?: number;
}

/**
 * Rebuilds a PayrollRun deterministically from live HR, Expenses, and Bonus stores.
 * Paid runs keep settled items (`reimbursed` / `paid` for `period`); active runs
 * pull `payroll_queued` ExpenseReports, `approved` HR BenefitClaims, and
 * `approved_queued` BonusAwards targeting `period` (or earlier unsettled periods).
 */
export function buildPayrollRunForPeriod(input: BuildPayrollRunInput): PayrollRun {
  const {
    period,
    users,
    comp,
    leave,
    claims,
    elections,
    expenseReports,
    bonuses,
    manualAdjustments,
    existingMeta,
    now = Date.now(),
  } = input;

  const status: PayrollRunStatus = input.status ?? existingMeta?.status ?? 'draft';
  const isSettled = status === 'paid';
  const { year, daysInMonth, monthStart, monthEnd, cutoffDate, payDate } = periodDates(period);

  const compByUser = new Map(comp.map((c) => [c.userId, c]));
  const staff = users.filter((u) => isEmployee(u) && u.startDate <= monthEnd && compByUser.has(u.id));

  const lines: PayrollEmployeeLine[] = staff.map((u) => {
    const c = compByUser.get(u.id)!;
    const fx = fxToAedFor(c.currency);

    const startsThisMonth = u.startDate.startsWith(period);
    const startDay = startsThisMonth ? Math.max(1, Number(u.startDate.slice(8, 10))) : 1;
    const proRataFraction = startsThisMonth ? (daysInMonth - startDay + 1) / daysInMonth : 1;

    const fullFixedAed = round2((c.baseMonthly + c.housingMonthly + c.transportMonthly) * fx);
    const baseAed = round2(c.baseMonthly * proRataFraction * fx);
    const housingAed = round2(c.housingMonthly * proRataFraction * fx);
    const transportAed = round2(c.transportMonthly * proRataFraction * fx);

    // Unpaid leave approved overlapping this month
    const unpaidLeaveDays = leave
      .filter(
        (lv) =>
          lv.userId === u.id &&
          lv.type === 'unpaid' &&
          lv.status === 'approved' &&
          lv.start <= monthEnd &&
          lv.end >= monthStart,
      )
      .reduce((acc, lv) => acc + lv.days, 0);

    const dailyBasicAed = (c.baseMonthly * fx) / 22;
    const unpaidLeaveDeductionAed = unpaidLeaveDays > 0 ? round2(unpaidLeaveDays * dailyBasicAed) : 0;

    // Pension & employee benefit share (already stored in AED in HR constants for benefit plans)
    const pensionDeductionAed = c.pensionRate ? round2(baseAed * c.pensionRate) : 0;
    const election = elections.find((el) => el.userId === u.id && el.year === year && el.status === 'confirmed');
    const benefitsDeductionAed = election ? round2(electionCost(election).employeeMonthly) : 0;

    // Bonuses for this employee & period
    const matchedBonuses = bonuses.filter((b) => {
      if (b.userId !== u.id) return false;
      if (isSettled) return b.status === 'paid' && b.payrollPeriod === period;
      return (b.status === 'approved_queued' || b.status === 'paid') && b.payrollPeriod === period;
    });
    const bonusesAed = round2(sum(matchedBonuses.map((b) => b.amountAed)));

    // Travel & Expense Reimbursements from /expenses
    const matchedExpenses = expenseReports.filter((r) => {
      if (r.userId !== u.id || r.reimbursableAed <= 0) return false;
      if (isSettled) return r.status === 'reimbursed' && r.payrollPeriod === period;
      return (
        (r.status === 'payroll_queued' && (!r.payrollPeriod || r.payrollPeriod <= period)) ||
        (r.status === 'reimbursed' && r.payrollPeriod === period)
      );
    });
    const expenseReimbursementsAed = round2(sum(matchedExpenses.map((r) => r.reimbursableAed)));

    // HR Allowance BenefitClaims from /hr/benefits
    const matchedClaims = claims.filter((cl) => {
      if (cl.userId !== u.id) return false;
      if (isSettled) return cl.status === 'paid' && cl.payrollMonth === period;
      return (
        (cl.status === 'approved' && (!cl.payrollMonth || cl.payrollMonth <= period)) ||
        (cl.status === 'paid' && cl.payrollMonth === period)
      );
    });
    const hrClaimsAed = round2(sum(matchedClaims.map((cl) => cl.amount)));

    // Manual payroll line adjustment
    const adj = manualAdjustments.find((m) => m.period === period && m.userId === u.id);
    const manualAdjustmentAed = adj ? round2(adj.amountAed) : 0;

    const grossAed = round2(
      baseAed +
        housingAed +
        transportAed +
        bonusesAed +
        expenseReimbursementsAed +
        hrClaimsAed +
        Math.max(0, manualAdjustmentAed),
    );

    const negativeManualAed = manualAdjustmentAed < 0 ? Math.abs(manualAdjustmentAed) : 0;
    const totalDeductionsAed = round2(
      unpaidLeaveDeductionAed + pensionDeductionAed + benefitsDeductionAed + negativeManualAed,
    );

    const netAed = Math.max(0, round2(grossAed - totalDeductionsAed));
    const netLocal = round2(netAed / fx);

    const baselineNetAed = Math.max(
      1,
      round2(fullFixedAed - fullFixedAed * (c.pensionRate ?? 0) - benefitsDeductionAed),
    );
    const variancePct = round2(((netAed - baselineNetAed) / baselineNetAed) * 100);

    const varianceFlags: string[] = [];
    if (startsThisMonth && proRataFraction < 1) {
      varianceFlags.push(`Starter pro-rata (${Math.round(proRataFraction * 100)}% of month)`);
    }
    if (expenseReimbursementsAed > 0) {
      varianceFlags.push(`T&E reimbursement +AED ${expenseReimbursementsAed.toLocaleString()}`);
    }
    if (hrClaimsAed > 0) {
      varianceFlags.push(`HR allowance claim +AED ${hrClaimsAed.toLocaleString()}`);
    }
    if (bonusesAed > 0) {
      varianceFlags.push(`Bonus award +AED ${bonusesAed.toLocaleString()}`);
    }
    if (unpaidLeaveDays > 0) {
      varianceFlags.push(`Unpaid leave (${unpaidLeaveDays}d) −AED ${unpaidLeaveDeductionAed.toLocaleString()}`);
    }
    if (manualAdjustmentAed !== 0) {
      varianceFlags.push(
        `Adjustment ${manualAdjustmentAed > 0 ? '+' : '−'}AED ${Math.abs(manualAdjustmentAed).toLocaleString()}`,
      );
    }

    return {
      userId: u.id,
      department: u.department,
      location: u.location,
      localCurrency: c.currency,
      fxToAed: fx,
      proRataFraction: round2(proRataFraction),
      baseAed,
      housingAed,
      transportAed,
      bonusesAed,
      bonusIds: matchedBonuses.map((b) => b.id),
      expenseReimbursementsAed,
      expenseReportIds: matchedExpenses.map((r) => r.id),
      hrClaimsAed,
      hrClaimIds: matchedClaims.map((cl) => cl.id),
      manualAdjustmentAed,
      manualAdjustmentNote: adj?.note,
      unpaidLeaveDays,
      unpaidLeaveDeductionAed,
      pensionDeductionAed,
      benefitsDeductionAed,
      grossAed,
      totalDeductionsAed,
      netAed,
      netLocal,
      bankName: c.bank.name,
      ibanLast4: c.bank.ibanLast4,
      variancePct,
      varianceFlags,
    };
  });

  lines.sort((a, b) => b.netAed - a.netAed);

  const totalFixedAed = round2(sum(lines.map((l) => l.baseAed + l.housingAed + l.transportAed)));
  const totalVariableBonusesAed = round2(sum(lines.map((l) => l.bonusesAed)));
  const totalReimbursementsAed = round2(
    sum(lines.map((l) => l.expenseReimbursementsAed + l.hrClaimsAed)),
  );
  const totalGrossAed = round2(sum(lines.map((l) => l.grossAed)));
  const totalDeductionsAed = round2(sum(lines.map((l) => l.totalDeductionsAed)));
  const totalNetAed = round2(sum(lines.map((l) => l.netAed)));

  return {
    id: existingMeta?.id ?? `pr-${period}`,
    period,
    label: formatPeriodLabel(period),
    cutoffDate,
    payDate,
    status,
    lines,
    headcount: lines.length,
    totalFixedAed,
    totalVariableBonusesAed,
    totalReimbursementsAed,
    totalGrossAed,
    totalDeductionsAed,
    totalNetAed,
    preparedBy: existingMeta?.preparedBy,
    preparedAt: existingMeta?.preparedAt,
    approvedBy: existingMeta?.approvedBy,
    approvedAt: existingMeta?.approvedAt,
    approvalNote: existingMeta?.approvalNote,
    disbursedBy: existingMeta?.disbursedBy,
    disbursedAt: existingMeta?.disbursedAt,
    wpsBatchRef: existingMeta?.wpsBatchRef,
    updatedAt: existingMeta?.updatedAt ?? now,
  };
}

// ───────────────────────── Statutory UAE EOSB Gratuity ─────────────────────────

export interface EosbEstimate {
  userId: string;
  tenureYears: number;
  eligible: boolean;
  monthlyBasicAed: number;
  accruedAed: number;
  tierLabel: string;
}

/**
 * UAE Labour Law End-of-Service Benefits (EOSB) gratuity calculation:
 * - < 1 year continuous service: AED 0 statutory entitlement (accrual shown pro-forma as 0 eligible)
 * - Years 1 to 5: 21 calendar days of basic wage per year of service
 * - Above 5 years: 30 calendar days of basic wage for each year beyond 5
 * - Capped at 24 months total remuneration
 */
export function computeEosbLiability(
  user: Pick<User, 'id' | 'startDate'>,
  comp: CompRecord | undefined,
  now = Date.now(),
): EosbEstimate {
  if (!comp) {
    return {
      userId: user.id,
      tenureYears: 0,
      eligible: false,
      monthlyBasicAed: 0,
      accruedAed: 0,
      tierLabel: 'No comp record',
    };
  }
  const fx = fxToAedFor(comp.currency);
  const monthlyBasicAed = round2(comp.baseMonthly * fx);
  const monthlyTotalFixedAed = round2(
    (comp.baseMonthly + comp.housingMonthly + comp.transportMonthly) * fx,
  );
  const days = Math.max(0, daysBetween(user.startDate, toISODate(now)));
  const tenureYears = round2(days / 365.25);

  if (tenureYears < 1) {
    return {
      userId: user.id,
      tenureYears,
      eligible: false,
      monthlyBasicAed,
      accruedAed: 0,
      tierLabel: '< 1 yr cliff (vesting)',
    };
  }

  const dailyBasic = monthlyBasicAed / 30;
  const firstFiveYears = Math.min(5, tenureYears);
  const beyondFiveYears = Math.max(0, tenureYears - 5);
  const rawGratuity = firstFiveYears * 21 * dailyBasic + beyondFiveYears * 30 * dailyBasic;
  const maxCap = monthlyTotalFixedAed * 24;
  const accruedAed = round2(Math.min(rawGratuity, maxCap));

  return {
    userId: user.id,
    tenureYears,
    eligible: true,
    monthlyBasicAed,
    accruedAed,
    tierLabel: tenureYears > 5 ? '30d/yr (>5 yrs)' : '21d/yr (1–5 yrs)',
  };
}

// ───────────────────────── Salary Bands & Compensation Analytics ─────────────────────────

export function matchBandForUser(user: User, bands: SalaryBand[]): SalaryBand {
  const t = user.title.toLowerCase();
  const isExecOrHead =
    t.includes('vp') ||
    t.includes('chief') ||
    t.includes('head of') ||
    t.includes('director') ||
    user.roleIds.includes('admin');
  if (isExecOrHead) return bands.find((b) => b.id === 'M4') ?? bands[bands.length - 1];

  const isMgr =
    t.includes('manager') || t.includes('lead') || user.roleIds.includes('manager');
  if (isMgr) return bands.find((b) => b.id === 'M3') ?? bands[bands.length - 1];

  if (t.includes('staff') || t.includes('principal')) {
    return bands.find((b) => b.id === 'IC4') ?? bands[0];
  }
  if (t.includes('senior') || t.includes('partner')) {
    return bands.find((b) => b.id === 'IC3') ?? bands[0];
  }
  return bands.find((b) => b.id === 'IC2') ?? bands[0];
}

export interface EmployeeCompRow {
  user: User;
  comp: CompRecord;
  band: SalaryBand;
  monthlyFixedAed: number;
  annualFixedAed: number;
  ytdBonusesAed: number;
  annualBenefitsCompanyAed: number;
  totalRewardsAnnualAed: number;
  compaRatio: number;
  /** 0..100+ position inside [min, max] */
  bandPenetrationPct: number;
  bandPosition: 'below_band' | 'in_band' | 'above_band';
  eosb: EosbEstimate;
}

export interface DepartmentCompSummary {
  department: Department;
  headcount: number;
  monthlyFixedAed: number;
  annualTotalRewardsAed: number;
  avgCompaRatio: number;
  ytdBonusesAed: number;
  eosbLiabilityAed: number;
}

export interface CompAnalyticsReport {
  rows: EmployeeCompRow[];
  byDepartment: DepartmentCompSummary[];
  headcount: number;
  monthlyPayrollRunRateAed: number;
  annualFixedRunRateAed: number;
  annualBenefitsRunRateAed: number;
  ytdBonusesTotalAed: number;
  annualTotalRewardsAed: number;
  medianCompaRatio: number;
  inBandPct: number;
  totalEosbLiabilityAed: number;
  outliers: EmployeeCompRow[];
}

export function computeCompAnalytics(
  users: User[],
  comp: CompRecord[],
  elections: BenefitElection[],
  bonuses: BonusAward[],
  bands: SalaryBand[],
  now = Date.now(),
): CompAnalyticsReport {
  const year = new Date(now).getFullYear();
  const compByUser = new Map(comp.map((c) => [c.userId, c]));
  const staff = users.filter((u) => isEmployee(u) && compByUser.has(u.id));

  const rows: EmployeeCompRow[] = staff.map((user) => {
    const c = compByUser.get(user.id)!;
    const fx = fxToAedFor(c.currency);
    const band = matchBandForUser(user, bands);
    const monthlyFixedAed = round2((c.baseMonthly + c.housingMonthly + c.transportMonthly) * fx);
    const annualFixedAed = round2(monthlyFixedAed * 12);

    const ytdBonusesAed = round2(
      sum(
        bonuses
          .filter(
            (b) =>
              b.userId === user.id &&
              (b.status === 'paid' || b.status === 'approved_queued') &&
              b.payrollPeriod.startsWith(String(year)),
          )
          .map((b) => b.amountAed),
      ),
    );

    const election = elections.find((el) => el.userId === user.id && el.year === year);
    const companyMonthlyBenefits = election
      ? COMPANY_PREMIUM[election.health] * (1 + election.dependents.length * 0.6)
      : COMPANY_PREMIUM.plus;
    const annualBenefitsCompanyAed = round2(companyMonthlyBenefits * 12 + 9900); // includes wellness/learning/home-office allowances

    const totalRewardsAnnualAed = round2(annualFixedAed + ytdBonusesAed + annualBenefitsCompanyAed);
    const compaRatio = round2(monthlyFixedAed / Math.max(1, band.midMonthlyFixedAed));
    const span = Math.max(1, band.maxMonthlyFixedAed - band.minMonthlyFixedAed);
    const bandPenetrationPct = round2(((monthlyFixedAed - band.minMonthlyFixedAed) / span) * 100);

    const bandPosition: EmployeeCompRow['bandPosition'] =
      monthlyFixedAed < band.minMonthlyFixedAed
        ? 'below_band'
        : monthlyFixedAed > band.maxMonthlyFixedAed
          ? 'above_band'
          : 'in_band';

    const eosb = computeEosbLiability(user, c, now);

    return {
      user,
      comp: c,
      band,
      monthlyFixedAed,
      annualFixedAed,
      ytdBonusesAed,
      annualBenefitsCompanyAed,
      totalRewardsAnnualAed,
      compaRatio,
      bandPenetrationPct,
      bandPosition,
      eosb,
    };
  });

  rows.sort((a, b) => b.monthlyFixedAed - a.monthlyFixedAed);

  const deptMap = new Map<Department, EmployeeCompRow[]>();
  for (const row of rows) {
    const list = deptMap.get(row.user.department) ?? [];
    list.push(row);
    deptMap.set(row.user.department, list);
  }

  const byDepartment: DepartmentCompSummary[] = [...deptMap.entries()]
    .map(([department, list]) => ({
      department,
      headcount: list.length,
      monthlyFixedAed: round2(sum(list.map((r) => r.monthlyFixedAed))),
      annualTotalRewardsAed: round2(sum(list.map((r) => r.totalRewardsAnnualAed))),
      avgCompaRatio: round2(sum(list.map((r) => r.compaRatio)) / Math.max(1, list.length)),
      ytdBonusesAed: round2(sum(list.map((r) => r.ytdBonusesAed))),
      eosbLiabilityAed: round2(sum(list.map((r) => r.eosb.accruedAed))),
    }))
    .sort((a, b) => b.monthlyFixedAed - a.monthlyFixedAed);

  const sortedRatios = rows.map((r) => r.compaRatio).sort((a, b) => a - b);
  const medianCompaRatio = sortedRatios.length
    ? sortedRatios[Math.floor(sortedRatios.length / 2)]
    : 1;

  const inBandCount = rows.filter((r) => r.bandPosition === 'in_band').length;
  const inBandPct = rows.length ? Math.round((inBandCount / rows.length) * 100) : 100;

  return {
    rows,
    byDepartment,
    headcount: rows.length,
    monthlyPayrollRunRateAed: round2(sum(rows.map((r) => r.monthlyFixedAed))),
    annualFixedRunRateAed: round2(sum(rows.map((r) => r.annualFixedAed))),
    annualBenefitsRunRateAed: round2(sum(rows.map((r) => r.annualBenefitsCompanyAed))),
    ytdBonusesTotalAed: round2(sum(rows.map((r) => r.ytdBonusesAed))),
    annualTotalRewardsAed: round2(sum(rows.map((r) => r.totalRewardsAnnualAed))),
    medianCompaRatio,
    inBandPct,
    totalEosbLiabilityAed: round2(sum(rows.map((r) => r.eosb.accruedAed))),
    outliers: rows.filter((r) => r.bandPosition !== 'in_band' || r.compaRatio < 0.88 || r.compaRatio > 1.15),
  };
}

// ───────────────────────── WPS (.SIF) & CSV Bank File Generators ─────────────────────────

/**
 * Generates a UAE Central Bank Wages Protection System (`.SIF`) file containing
 * `EDR` (Employee Detail Records) and `SCR` (Salary Control Record).
 */
export function generateWpsSif(run: PayrollRun, users: User[]): string {
  const userById = new Map(users.map((u) => [u.id, u]));
  const [y, m] = run.period.split('-');
  const dim = new Date(Number(y), Number(m), 0).getDate();
  const startDate = `${run.period}-01`;
  const endDate = `${run.period}-${pad2(dim)}`;

  const edrLines = run.lines.map((line, idx) => {
    const emp = userById.get(line.userId);
    const molId = (emp?.employeeId ?? `EMP${idx + 1}`).replace(/[^A-Z0-9]/gi, '').padStart(14, '0');
    const routingCode = `30262012${String((idx % 9) + 1)}`;
    const iban = `AE4702600010158849${line.ibanLast4.padStart(4, '0')}`;
    const fixedAed = round2(line.baseAed + line.housingAed + line.transportAed - line.totalDeductionsAed);
    const variableAed = round2(
      line.bonusesAed +
        line.expenseReimbursementsAed +
        line.hrClaimsAed +
        Math.max(0, line.manualAdjustmentAed),
    );
    return [
      'EDR',
      molId,
      routingCode,
      iban,
      startDate,
      endDate,
      String(Math.max(1, dim - line.unpaidLeaveDays)),
      Math.max(0, fixedAed).toFixed(2),
      Math.max(0, variableAed).toFixed(2),
      String(line.unpaidLeaveDays),
    ].join(',');
  });

  const scrLine = [
    'SCR',
    '0000849201441',
    '026',
    run.payDate,
    '1430',
    `${m}${y}`,
    String(run.lines.length),
    run.totalNetAed.toFixed(2),
    'AED',
    `HELIX-${run.period}`,
  ].join(',');

  return [...edrLines, scrLine].join('\n');
}

export function generatePayrollCsv(run: PayrollRun, users: User[]): string {
  const userById = new Map(users.map((u) => [u.id, u]));
  const headers = [
    'Period',
    'Employee ID',
    'Name',
    'Department',
    'Location',
    'Local Currency',
    'Basic (AED)',
    'Allowances (AED)',
    'Bonuses (AED)',
    'T&E Reimbursements (AED)',
    'HR Claims (AED)',
    'Gross (AED)',
    'Deductions (AED)',
    'Net Pay (AED)',
    'Net Pay (Local)',
    'Bank',
    'IBAN Last4',
  ];
  const rows = run.lines.map((l) => {
    const u = userById.get(l.userId);
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    return [
      run.period,
      u?.employeeId ?? l.userId,
      u?.name ?? l.userId,
      l.department,
      l.location,
      l.localCurrency,
      l.baseAed.toFixed(2),
      (l.housingAed + l.transportAed).toFixed(2),
      l.bonusesAed.toFixed(2),
      l.expenseReimbursementsAed.toFixed(2),
      l.hrClaimsAed.toFixed(2),
      l.grossAed.toFixed(2),
      l.totalDeductionsAed.toFixed(2),
      l.netAed.toFixed(2),
      l.netLocal.toFixed(2),
      l.bankName,
      l.ibanLast4,
    ]
      .map(esc)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}
