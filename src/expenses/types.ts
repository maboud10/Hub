/**
 * Helix Spend & Mobility ("Travel & Expenses") domain model:
 * end-to-end flow from Travel Pre-Approval -> Itinerary & Virtual Card ->
 * Smart Receipt OCR Vault -> Expense Report -> Manager + Finance Audit ->
 * Payroll Queue -> Paid Reimbursement synced with HR Portal Payslips.
 */
import type { Department } from '@/types';

export type CurrencyCode = 'AED' | 'USD' | 'EUR' | 'GBP' | 'SGD' | 'SAR' | 'JPY';

export type ExpenseCategory =
  | 'flights'
  | 'lodging'
  | 'meals'
  | 'per_diem'
  | 'ground'
  | 'client'
  | 'conference'
  | 'software'
  | 'other';

export type TripPurpose =
  | 'client-summit'
  | 'engineering-onsite'
  | 'conference'
  | 'customer-launch'
  | 'leadership-offsite';

export type CabinClass = 'economy' | 'premium-economy' | 'business';

export type TripStatus =
  | 'draft'
  | 'pending_approval'
  | 'changes_requested'
  | 'approved'
  | 'booked'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export interface VirtualCard {
  last4: string;
  limitAed: number;
  spentAed: number;
  activeFrom: string;
  activeTo: string;
  frozen?: boolean;
}

export interface TravelItinerary {
  flightBookingRef?: string;
  airline?: string;
  hotelName?: string;
  hotelConfirmation?: string;
  bookedAt: number;
  dutyOfCareCheckIn?: boolean;
}

export interface TravelRequest {
  id: string;
  reference: string;
  userId: string;
  department: Department;
  originCity: string;
  destinationCity: string;
  destinationCountry: string;
  departureDate: string;
  returnDate: string;
  days: number;
  purpose: TripPurpose;
  title: string;
  businessJustification: string;
  cabinClass: CabinClass;
  flightHours: number;
  estimatedFlightAed: number;
  estimatedHotelAed: number;
  perDiemRateAed: number;
  estimatedPerDiemAed: number;
  estimatedOtherAed: number;
  totalEstimatedAed: number;
  co2Kg: number;
  needsVisaLetter?: boolean;
  policyFlags: string[];
  status: TripStatus;
  approverId?: string;
  approvedAt?: number;
  decisionNote?: string;
  virtualCard?: VirtualCard;
  itinerary?: TravelItinerary;
  linkedReportId?: string;
  createdAt: number;
  updatedAt: number;
}

export type PaymentMethod = 'personal_reimbursable' | 'corporate_card';

export interface PolicyWarning {
  code: 'missing_receipt' | 'over_meal_cap' | 'business_cabin_short_haul' | 'late_booking' | 'duplicate_suspect' | 'high_spend';
  severity: 'info' | 'warn';
  message: string;
}

export interface ReceiptItem {
  id: string;
  userId: string;
  tripId?: string;
  reportId?: string;
  merchant: string;
  category: ExpenseCategory;
  date: string;
  currency: CurrencyCode;
  originalAmount: number;
  fxRateToAed: number;
  amountAed: number;
  vatAed: number;
  paymentMethod: PaymentMethod;
  fileName?: string;
  ocrConfidence: number;
  notes?: string;
  attendees?: string;
  glCode: string;
  warnings: PolicyWarning[];
  createdAt: number;
}

export type ExpenseReportStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'manager_approved'
  | 'payroll_queued'
  | 'reimbursed'
  | 'rejected';

export interface ExpenseAuditStep {
  at: number;
  actorId: string;
  action:
    | 'created'
    | 'submitted'
    | 'manager_approved'
    | 'changes_requested'
    | 'finance_queued'
    | 'reimbursed'
    | 'rejected';
  note?: string;
}

export interface ExpenseReport {
  id: string;
  reference: string;
  userId: string;
  department: Department;
  title: string;
  tripId?: string;
  costCenter: string;
  receiptIds: string[];
  totalSpendAed: number;
  corporateCardAed: number;
  /** Net out-of-pocket amount owed to the employee via payroll/reimbursement. */
  reimbursableAed: number;
  vatTotalAed: number;
  status: ExpenseReportStatus;
  submittedAt?: number;
  managerReviewerId?: string;
  managerDecidedAt?: number;
  financeReviewerId?: string;
  financeQueuedAt?: number;
  /** Target or settled payroll period YYYY-MM. */
  payrollPeriod?: string;
  payrollRunId?: string;
  reimbursedAt?: number;
  paymentRef?: string;
  reviewNote?: string;
  history: ExpenseAuditStep[];
  createdAt: number;
  updatedAt: number;
}

/** End-to-end 7-step tracker stage for UI process visualization. */
export type SpendFlowStage =
  | 1 // Travel requested
  | 2 // Travel approved & booked
  | 3 // Receipts captured
  | 4 // Expense report submitted
  | 5 // Manager & Finance audited
  | 6 // Queued in Payroll
  | 7; // Paid & on Payslip

export interface ExpensesData {
  version: number;
  trips: TravelRequest[];
  receipts: ReceiptItem[];
  reports: ExpenseReport[];
}
