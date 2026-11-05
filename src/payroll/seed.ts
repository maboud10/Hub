/**
 * Seed data for Helix Payroll Console:
 * - 5 calibrated Salary Bands (IC2..IC4, M3..M4)
 * - 6 BonusAwards spanning paid historical awards, approved awards queued in the
 *   current pay run, and pending nominations ready for four-eyes approval
 * - 2 historical settled (`paid`) monthly Pay Runs + 1 active `draft` Pay Run
 *   synced with HR Comp, Benefits, Leave, and Travel & Expense reimbursements
 */
import type { User } from '@/types';
import { SEED_USERS } from '@/data/users';
import { createHrSeed } from '@/hr/seed';
import { buildExpensesSeed } from '@/expenses/seed';
import { buildPayrollRunForPeriod, periodFromTimestamp } from './engine';
import {
  PAYROLL_DATA_VERSION,
  type BonusAward,
  type CompAdjustmentRecord,
  type ManualLineAdjustment,
  type PayrollData,
  type PayrollRun,
  type SalaryBand,
} from './types';

const DAY = 86_400_000;

export const SEED_SALARY_BANDS: SalaryBand[] = [
  {
    id: 'IC2',
    level: 'IC2',
    title: 'Mid-Level Specialist / Engineer',
    track: 'IC',
    minMonthlyFixedAed: 18_000,
    midMonthlyFixedAed: 24_000,
    maxMonthlyFixedAed: 30_000,
    targetBonusPct: 10,
  },
  {
    id: 'IC3',
    level: 'IC3',
    title: 'Senior Individual Contributor',
    track: 'IC',
    minMonthlyFixedAed: 23_000,
    midMonthlyFixedAed: 29_500,
    maxMonthlyFixedAed: 36_000,
    targetBonusPct: 12,
  },
  {
    id: 'IC4',
    level: 'IC4',
    title: 'Staff / Principal Contributor',
    track: 'IC',
    minMonthlyFixedAed: 30_000,
    midMonthlyFixedAed: 37_500,
    maxMonthlyFixedAed: 45_000,
    targetBonusPct: 15,
  },
  {
    id: 'M3',
    level: 'M3',
    title: 'Manager / Functional Lead',
    track: 'Management',
    minMonthlyFixedAed: 32_000,
    midMonthlyFixedAed: 44_000,
    maxMonthlyFixedAed: 57_000,
    targetBonusPct: 18,
  },
  {
    id: 'M4',
    level: 'M4',
    title: 'Director / VP / Executive',
    track: 'Management',
    minMonthlyFixedAed: 45_000,
    midMonthlyFixedAed: 58_000,
    maxMonthlyFixedAed: 72_000,
    targetBonusPct: 25,
  },
];

export function createPayrollSeed(
  now = Date.now(),
  users: User[] = SEED_USERS,
): PayrollData {
  const hr = createHrSeed(now, users);
  const exp = buildExpensesSeed(now);

  const pMinus2 = periodFromTimestamp(now, -2);
  const pMinus1 = periodFromTimestamp(now, -1);
  const pCurrent = periodFromTimestamp(now, 0);

  const bonuses: BonusAward[] = [
    {
      id: 'bon-1',
      reference: 'HX-BON-2026-0038',
      userId: 'u-lucas',
      department: 'Engineering',
      kind: 'milestone',
      title: '99.995% EU-Cell Availability SLO Milestone',
      reason: 'Led multi-region chaos drill and zero-incident failover validation across 14 stateful services.',
      amountAed: 6_000,
      payrollPeriod: pMinus1,
      status: 'paid',
      nominatedBy: 'u-omar',
      nominatedAt: now - 38 * DAY,
      decidedBy: 'u-sara',
      decidedAt: now - 35 * DAY,
      decisionNote: 'Approved for monthly payroll disbursement.',
      paidRunId: `pr-${pMinus1}`,
      paidAt: now - 10 * DAY,
    },
    {
      id: 'bon-2',
      reference: 'HX-BON-2026-0041',
      userId: 'u-kwame',
      department: 'Engineering',
      kind: 'signing',
      title: 'New-Hire Relocation & Signing Tranche',
      reason: 'Contractual signing bonus tranche upon joining Core Platform team (Talent Hub Offer of-4).',
      amountAed: 10_000,
      payrollPeriod: pCurrent,
      status: 'approved_queued',
      nominatedBy: 'u-sara',
      nominatedAt: now - 20 * DAY,
      decidedBy: 'u-daniel',
      decidedAt: now - 18 * DAY,
      decisionNote: 'Verified against signed offer letter of-4; queued for payday.',
    },
    {
      id: 'bon-3',
      reference: 'HX-BON-2026-0042',
      userId: 'u-priya',
      department: 'Engineering',
      kind: 'performance',
      title: 'London EU-Cell Zero-Downtime Cutover Award',
      reason: 'Executed cross-region PostgreSQL logical cutover ahead of schedule with 0ms customer impact.',
      amountAed: 8_500,
      payrollPeriod: pCurrent,
      status: 'approved_queued',
      nominatedBy: 'u-omar',
      nominatedAt: now - 9 * DAY,
      decidedBy: 'u-sara',
      decidedAt: now - 7 * DAY,
      decisionNote: 'Exceptional execution — queued into active pay run.',
    },
    {
      id: 'bon-4',
      reference: 'HX-BON-2026-0044',
      userId: 'u-mei',
      department: 'Design',
      kind: 'spot',
      title: 'Prism v4 Design Tokens & Accessibility Audit',
      reason: 'Shipped unified WCAG AA token system across Talent Hub, HR Portal, Cortex, and Spend.',
      amountAed: 3_500,
      payrollPeriod: pCurrent,
      status: 'pending_approval',
      nominatedBy: 'u-omar',
      nominatedAt: now - 2 * DAY,
    },
    {
      id: 'bon-5',
      reference: 'HX-BON-2026-0045',
      userId: 'u-aisha',
      department: 'Product',
      kind: 'performance',
      title: 'GCC Enterprise Advisory Board Expansion',
      reason: 'Secured 6-account enterprise renewal commitments ($1.8M ARR cohort) during Riyadh summit.',
      amountAed: 9_000,
      payrollPeriod: pCurrent,
      status: 'pending_approval',
      nominatedBy: 'u-layla',
      nominatedAt: now - 1 * DAY,
    },
    {
      id: 'bon-6',
      reference: 'HX-BON-2026-0033',
      userId: 'u-noah',
      department: 'Engineering',
      kind: 'spot',
      title: 'AI Sourcing Evaluation Harness Breakthrough',
      reason: 'Reduced LLM latency by 44% on candidate rubric synthesis.',
      amountAed: 4_500,
      payrollPeriod: pMinus2,
      status: 'paid',
      nominatedBy: 'u-omar',
      nominatedAt: now - 68 * DAY,
      decidedBy: 'u-daniel',
      decidedAt: now - 66 * DAY,
      paidRunId: `pr-${pMinus2}`,
      paidAt: now - 40 * DAY,
    },
  ];

  const manualAdjustments: ManualLineAdjustment[] = [];

  const runMinus2: PayrollRun = buildPayrollRunForPeriod({
    period: pMinus2,
    users,
    comp: hr.comp,
    leave: hr.leave,
    claims: hr.claims,
    elections: hr.elections,
    expenseReports: exp.reports,
    bonuses,
    manualAdjustments,
    status: 'paid',
    existingMeta: {
      id: `pr-${pMinus2}`,
      status: 'paid',
      preparedBy: 'u-daniel',
      preparedAt: now - 44 * DAY,
      approvedBy: 'u-sara',
      approvedAt: now - 42 * DAY,
      approvalNote: 'Reconciled headcount, pension rates, and FX spot sheet.',
      disbursedBy: 'u-daniel',
      disbursedAt: now - 40 * DAY,
      wpsBatchRef: `WPS-HX-${pMinus2}`,
      updatedAt: now - 40 * DAY,
    },
    now,
  });

  const runMinus1: PayrollRun = buildPayrollRunForPeriod({
    period: pMinus1,
    users,
    comp: hr.comp,
    leave: hr.leave,
    claims: hr.claims,
    elections: hr.elections,
    expenseReports: exp.reports,
    bonuses,
    manualAdjustments,
    status: 'paid',
    existingMeta: {
      id: `pr-${pMinus1}`,
      status: 'paid',
      preparedBy: 'u-daniel',
      preparedAt: now - 14 * DAY,
      approvedBy: 'u-sara',
      approvedAt: now - 12 * DAY,
      approvalNote: 'Verified Mei T&E reimbursement + Lucas SLO milestone bonus.',
      disbursedBy: 'u-daniel',
      disbursedAt: now - 10 * DAY,
      wpsBatchRef: `WPS-HX-${pMinus1}`,
      updatedAt: now - 10 * DAY,
    },
    now,
  });

  const runCurrent: PayrollRun = buildPayrollRunForPeriod({
    period: pCurrent,
    users,
    comp: hr.comp,
    leave: hr.leave,
    claims: hr.claims,
    elections: hr.elections,
    expenseReports: exp.reports,
    bonuses,
    manualAdjustments,
    status: 'draft',
    existingMeta: {
      id: `pr-${pCurrent}`,
      status: 'draft',
      updatedAt: now - 1 * DAY,
    },
    now,
  });

  const compHistory: CompAdjustmentRecord[] = [
    {
      id: 'cadj-1',
      userId: 'u-fatima',
      effectivePeriod: pMinus2,
      previousBaseLocal: 22_000,
      newBaseLocal: 24_000,
      currency: 'AED',
      reason: 'Mid-year calibration to Senior People Partner IC3 band.',
      actorId: 'u-sara',
      createdAt: now - 55 * DAY,
    },
    {
      id: 'cadj-2',
      userId: 'u-noah',
      effectivePeriod: pMinus1,
      previousBaseLocal: 9_200,
      newBaseLocal: 9_800,
      currency: 'USD',
      reason: 'Staff scope expansion across Talent & Cortex AI pipelines.',
      actorId: 'u-omar',
      createdAt: now - 25 * DAY,
    },
  ];

  return {
    version: PAYROLL_DATA_VERSION,
    runs: [runCurrent, runMinus1, runMinus2],
    bonuses,
    bands: SEED_SALARY_BANDS,
    manualAdjustments,
    compHistory,
  };
}
