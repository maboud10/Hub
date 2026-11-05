import type { Department } from '@/types';

export const PAYROLL_DATA_VERSION = 1;

export type PayrollRunStatus = 'draft' | 'pending_signoff' | 'approved_ready' | 'paid';

export type BonusKind = 'performance' | 'spot' | 'signing' | 'milestone' | 'retention';

export type BonusStatus = 'pending_approval' | 'approved_queued' | 'paid' | 'declined';

export interface PayrollEmployeeLine {
  userId: string;
  department: Department;
  location: string;
  localCurrency: string;
  fxToAed: number;
  proRataFraction: number;
  baseAed: number;
  housingAed: number;
  transportAed: number;
  bonusesAed: number;
  bonusIds: string[];
  expenseReimbursementsAed: number;
  expenseReportIds: string[];
  hrClaimsAed: number;
  hrClaimIds: string[];
  manualAdjustmentAed: number;
  manualAdjustmentNote?: string;
  unpaidLeaveDays: number;
  unpaidLeaveDeductionAed: number;
  pensionDeductionAed: number;
  benefitsDeductionAed: number;
  grossAed: number;
  totalDeductionsAed: number;
  netAed: number;
  netLocal: number;
  bankName: string;
  ibanLast4: string;
  variancePct: number;
  varianceFlags: string[];
}

export interface PayrollRun {
  id: string;
  /** YYYY-MM */
  period: string;
  label: string;
  /** YYYY-MM-DD */
  cutoffDate: string;
  /** YYYY-MM-DD */
  payDate: string;
  status: PayrollRunStatus;
  lines: PayrollEmployeeLine[];
  headcount: number;
  totalFixedAed: number;
  totalVariableBonusesAed: number;
  totalReimbursementsAed: number;
  totalGrossAed: number;
  totalDeductionsAed: number;
  totalNetAed: number;
  preparedBy?: string;
  preparedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  approvalNote?: string;
  disbursedBy?: string;
  disbursedAt?: number;
  wpsBatchRef?: string;
  updatedAt: number;
}

export interface BonusAward {
  id: string;
  reference: string;
  userId: string;
  department: Department;
  kind: BonusKind;
  title: string;
  reason: string;
  amountAed: number;
  /** YYYY-MM */
  payrollPeriod: string;
  status: BonusStatus;
  nominatedBy: string;
  nominatedAt: number;
  decidedBy?: string;
  decidedAt?: number;
  decisionNote?: string;
  paidRunId?: string;
  paidAt?: number;
}

export interface SalaryBand {
  id: string;
  level: string;
  title: string;
  track: 'IC' | 'Management';
  minMonthlyFixedAed: number;
  midMonthlyFixedAed: number;
  maxMonthlyFixedAed: number;
  targetBonusPct: number;
}

export interface ManualLineAdjustment {
  period: string;
  userId: string;
  amountAed: number;
  note: string;
  updatedBy: string;
  updatedAt: number;
}

export interface CompAdjustmentRecord {
  id: string;
  userId: string;
  effectivePeriod: string;
  previousBaseLocal: number;
  newBaseLocal: number;
  currency: string;
  reason: string;
  actorId: string;
  createdAt: number;
}

export interface PayrollData {
  version: number;
  runs: PayrollRun[];
  bonuses: BonusAward[];
  bands: SalaryBand[];
  manualAdjustments: ManualLineAdjustment[];
  compHistory: CompAdjustmentRecord[];
}
