/**
 * HR Portal domain model: time off, benefits, documents & letters, policy
 * acknowledgements, new-hire pulse check-ins and "Ask People Ops" cases.
 *
 * Same conventions as Talent Hub (`src/talent/types.ts`): every top-level
 * interface maps 1:1 to a Firestore document (collections = keys of `HrData`),
 * timestamps are epoch milliseconds and calendar dates are ISO `YYYY-MM-DD`.
 * Onboarding journeys live in the Talent Hub store (they are handed over at hire).
 */

// ───────────────────────── time off ─────────────────────────
export type LeaveTypeId = 'annual' | 'sick' | 'wfa' | 'parental' | 'compassionate' | 'study' | 'hajj' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type HalfDay = 'am' | 'pm';

export interface LeaveRequest {
  id: string;
  userId: string;
  type: LeaveTypeId;
  /** Inclusive ISO dates. */
  start: string;
  end: string;
  /** Half-day requests are single-day only. */
  halfDay?: HalfDay;
  /** Working days deducted (weekends and public holidays excluded). */
  days: number;
  reason?: string;
  /** Colleague covering while you're away. */
  coverId?: string;
  /** Supporting document (e.g. medical certificate). */
  attachmentName?: string;
  status: LeaveStatus;
  /** Who should decide (line manager, or People Ops when there is none). */
  approverId?: string;
  decidedBy?: string;
  decidedAt?: number;
  decisionNote?: string;
  createdAt: number;
}

/** Manual balance change by People Ops (carry-over, corrections, time in lieu). */
export interface LeaveAdjustment {
  id: string;
  userId: string;
  type: LeaveTypeId;
  year: number;
  /** Positive adds days, negative removes them. */
  days: number;
  reason: string;
  by: string;
  at: number;
}

// ───────────────────────── benefits ─────────────────────────
export type HealthTier = 'essential' | 'plus' | 'premier';
export type Relation = 'spouse' | 'child' | 'parent';

export interface Dependent {
  id: string;
  name: string;
  relation: Relation;
  /** ISO date. */
  birthDate?: string;
}

export type ElectionStatus = 'not-started' | 'submitted' | 'confirmed';

/** A person's benefit choices for one plan year. */
export interface BenefitElection {
  /** `${userId}-${year}` */
  id: string;
  userId: string;
  year: number;
  health: HealthTier;
  dental: boolean;
  vision: boolean;
  /** Life cover as a multiple of annual base salary. */
  lifeMultiple: 2 | 3 | 4;
  dependents: Dependent[];
  status: ElectionStatus;
  /** ISO date. New hires must enrol within 30 days of starting. */
  deadline?: string;
  submittedAt?: number;
  confirmedAt?: number;
  confirmedBy?: string;
  /** Insurer member number once confirmed. */
  memberNumber?: string;
}

export type AllowanceId = 'learning' | 'wellness' | 'home-office' | 'flight';
export type ClaimStatus = 'submitted' | 'approved' | 'rejected' | 'paid';

export interface BenefitClaim {
  id: string;
  userId: string;
  allowance: AllowanceId;
  amount: number;
  currency: string;
  merchant: string;
  description: string;
  receiptName?: string;
  /** ISO date of the spend. */
  date: string;
  status: ClaimStatus;
  reviewerId?: string;
  decidedAt?: number;
  note?: string;
  /** Reimbursed with this payroll month (YYYY-MM). */
  payrollMonth?: string;
  createdAt: number;
}

// ───────────────────────── documents & letters ─────────────────────────
export type DocKind = 'offer' | 'contract' | 'nda' | 'letter' | 'certificate' | 'id' | 'payslip' | 'other';

export interface EmployeeDocument {
  id: string;
  userId: string;
  kind: DocKind;
  title: string;
  description?: string;
  /** Where it came from. */
  source: 'talent-hub' | 'people-ops' | 'self' | 'system';
  createdAt: number;
  /** E-signature workflow (contracts, agreements). */
  signature?: { required: boolean; signedAt?: number; signedName?: string };
  /** Linked records used to render the document. */
  offerId?: string;
  letterId?: string;
  /** Uploaded file name (self-service uploads). */
  fileName?: string;
  sizeKb?: number;
  confidential?: boolean;
}

export type LetterKind = 'salary-certificate' | 'employment' | 'bank' | 'embassy' | 'noc';
export type LetterStatus = 'issued' | 'pending' | 'rejected';

export interface LetterRequest {
  id: string;
  userId: string;
  kind: LetterKind;
  /** "To whom it may concern", "Emirates NBD", "Embassy of Japan"… */
  addressedTo: string;
  purpose: string;
  includeSalary: boolean;
  /** Embassy / NOC travel details. */
  country?: string;
  travelFrom?: string;
  travelTo?: string;
  status: LetterStatus;
  /** Human reference, e.g. HX-LTR-2026-0042. */
  reference: string;
  /** Code a third party can use to verify authenticity. */
  verifyCode: string;
  createdAt: number;
  issuedAt?: number;
  /** 'auto' for instantly generated letters, otherwise the reviewer. */
  issuedBy?: string;
  note?: string;
}

/** Signed-off reading of a policy version. */
export interface PolicyAck {
  id: string;
  policyId: string;
  userId: string;
  version: number;
  at: number;
}

// ───────────────────────── compensation (sensitive) ─────────────────────────
/** Monthly pay components. Visible to the employee and `hub.people.sensitive`. */
export interface CompRecord {
  userId: string;
  currency: string;
  baseMonthly: number;
  housingMonthly: number;
  transportMonthly: number;
  /** Employee pension / social security contribution rate (0–1). */
  pensionRate: number;
  bank: { name: string; ibanLast4: string };
  /** Pay day of the month. */
  payDay: number;
}

// ───────────────────────── new-hire pulse ─────────────────────────
export type PulseMilestone = 'week-1' | 'day-30' | 'day-60' | 'day-90';
export type PulseQuestion = 'welcome' | 'clarity' | 'tools' | 'belonging';

export interface PulseResponse {
  id: string;
  userId: string;
  journeyId?: string;
  milestone: PulseMilestone;
  /** 1 (not at all) … 5 (absolutely). */
  scores: Record<PulseQuestion, 1 | 2 | 3 | 4 | 5>;
  comment?: string;
  /** Comment visible to the manager (scores always aggregate to People Ops). */
  shareWithManager: boolean;
  at: number;
}

// ───────────────────────── Ask People Ops ─────────────────────────
export type CaseCategory = 'pay' | 'leave' | 'benefits' | 'documents' | 'visa' | 'wellbeing' | 'other';
export type CaseStatus = 'open' | 'answered' | 'closed';

export interface CaseMessage {
  id: string;
  by: string;
  at: number;
  text: string;
}

export interface HrCase {
  id: string;
  userId: string;
  category: CaseCategory;
  subject: string;
  /** Only People Ops (and the requester) can see it; never managers. */
  confidential: boolean;
  status: CaseStatus;
  messages: CaseMessage[];
  /** People Ops owner. */
  assigneeId?: string;
  createdAt: number;
  updatedAt: number;
}

// ───────────────────────── database shape ─────────────────────────
export interface HrData {
  version: number;
  leave: LeaveRequest[];
  adjustments: LeaveAdjustment[];
  elections: BenefitElection[];
  claims: BenefitClaim[];
  documents: EmployeeDocument[];
  letters: LetterRequest[];
  acks: PolicyAck[];
  comp: CompRecord[];
  pulses: PulseResponse[];
  cases: HrCase[];
}

export type HrCollection = Exclude<keyof HrData, 'version'>;
