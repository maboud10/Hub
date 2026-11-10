/**
 * Helix Procurement — "Autonomous Source-to-Pay & Vendor Orbit"
 * Core domain types for requisitions, 5-stage parallel approvals, Vendor 360,
 * AI contract redlines, renewal cliffs, and 3-way match purchase orders.
 */

export type ProcurementCategory =
  | 'cloud_infra'
  | 'ai_models'
  | 'security_iam'
  | 'product_design'
  | 'workplace_ops';

export type VendorTier = 'strategic' | 'preferred' | 'emerging';

export type CurrencyCode = 'USD' | 'AED';

export type ApprovalStageId =
  | 'requester'
  | 'budget_owner'
  | 'security_privacy'
  | 'legal_redline'
  | 'finance_controller';

export type ApprovalStageStatus = 'approved' | 'pending' | 'flagged' | 'waiting';

export interface ApprovalStep {
  id: ApprovalStageId;
  label: string;
  reviewerId: string;
  status: ApprovalStageStatus;
  slaHours: number;
  completedAt?: number;
  note?: string;
  checks?: string[];
}

export type RequisitionStatus =
  | 'pending_approval'
  | 'negotiating'
  | 'approved'
  | 'po_issued'
  | 'rejected';

export interface PriceBenchmark {
  unitLabel: string;
  quotedUnitUsd: number;
  p25Usd: number;
  medianUsd: number;
  p75Usd: number;
  targetCounterUsd: number;
  peerSampleSize: number;
  recommendation: string;
}

export interface PurchaseRequest {
  id: string;
  title: string;
  vendorId: string;
  vendorName: string;
  vendorSigil: string;
  vendorColor: string;
  category: ProcurementCategory;
  requesterId: string;
  department: string;
  location: string;
  quantity: number;
  unitLabel: string;
  quotedAnnualUsd: number;
  negotiatedAnnualUsd: number;
  currency: CurrencyCode;
  status: RequisitionStatus;
  priority: 'critical' | 'high' | 'normal';
  createdAt: number;
  updatedAt: number;
  justification: string;
  termMonths: 12 | 24 | 36;
  benchmark: PriceBenchmark;
  duplicateWarning?: string;
  stages: ApprovalStep[];
  linkedPoId?: string;
}

export interface ComplianceBadge {
  framework: 'SOC2 Type II' | 'ISO 27001' | 'UAE PDPL' | 'GDPR' | 'Zero Data Retention';
  score: number;
  status: 'verified' | 'expiring_soon' | 'in_review';
  validUntil: string;
}

export interface Vendor {
  id: string;
  name: string;
  tagline: string;
  category: ProcurementCategory;
  tier: VendorTier;
  sigil: string;
  color: string;
  ownerId: string;
  annualSpendUsd: number;
  provisionedSeats: number;
  activeSeats: number;
  unitCostPerSeatUsd: number;
  securityScore: number;
  slaUptimePct: number;
  renewalDate: string;
  daysToRenewal: number;
  noticeWindowDays: 30 | 60 | 90;
  autoRenew: boolean;
  regionResidency: string;
  primaryContact: {
    name: string;
    role: string;
    email: string;
  };
  compliance: ComplianceBadge[];
  spendTrend: number[];
  reclaimedSeatsCount: number;
}

export interface ContractClause {
  id: string;
  label: string;
  status: 'compliant' | 'redline_needed' | 'negotiated';
  standardTerm: string;
  vendorDraft: string;
  novaRedline: string;
}

export interface VendorContract {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorSigil: string;
  vendorColor: string;
  title: string;
  category: ProcurementCategory;
  ownerId: string;
  annualValueUsd: number;
  proposedRenewalUsd: number;
  novaCounterOfferUsd: number;
  counterOfferApplied: boolean;
  startDate: string;
  endDate: string;
  daysUntilCliff: number;
  noticeWindowDays: 30 | 60 | 90;
  status: 'renewal_window' | 'redlining' | 'active' | 'counter_locked';
  upliftCapPct: number;
  benchmark: PriceBenchmark;
  clauses: ContractClause[];
}

export type ThreeWayMatchStatus = 'matched' | 'variance_flagged' | 'verified_queued';

export interface PurchaseOrder {
  id: string;
  requestId: string;
  vendorId: string;
  vendorName: string;
  vendorSigil: string;
  vendorColor: string;
  title: string;
  category: ProcurementCategory;
  department: string;
  ownerId: string;
  issuedAt: string;
  glCode: string;
  poAmountUsd: number;
  receiptConfirmedUnits: number;
  orderedUnits: number;
  unitLabel: string;
  invoiceNumber: string;
  invoiceAmountUsd: number;
  varianceUsd: number;
  varianceReason?: string;
  matchStatus: ThreeWayMatchStatus;
  paymentTerms: 'Net 30' | 'Net 45' | 'Annual Upfront';
  ledgerQueuedAt?: number;
}

export interface DepartmentBudget {
  department: string;
  ownerId: string;
  annualBudgetUsd: number;
  committedUsd: number;
  actualSpentUsd: number;
  savingsLockedUsd: number;
}

export interface SavingsPlaybook {
  id: string;
  title: string;
  description: string;
  category: ProcurementCategory;
  vendorId?: string;
  contractId?: string;
  estimatedSavingsUsd: number;
  confidencePct: number;
  actionKind: 'reclaim_seats' | 'counter_offer' | 'consolidate';
  executed: boolean;
}

export interface NovaIntakeDraft {
  prompt: string;
  title: string;
  vendorId: string;
  vendorName: string;
  vendorSigil: string;
  vendorColor: string;
  category: ProcurementCategory;
  department: string;
  location: string;
  quantity: number;
  unitLabel: string;
  quotedAnnualUsd: number;
  recommendedAnnualUsd: number;
  estimatedSavingsUsd: number;
  termMonths: 12 | 24 | 36;
  benchmark: PriceBenchmark;
  duplicateWarning?: string;
  confidencePct: number;
  stagesPreview: {
    id: ApprovalStageId;
    label: string;
    reviewerId: string;
    slaHours: number;
  }[];
}

export interface NewRequestInput {
  title: string;
  vendorId: string;
  category: ProcurementCategory;
  department: string;
  location: string;
  quantity: number;
  unitLabel?: string;
  quotedAnnualUsd: number;
  currency: CurrencyCode;
  termMonths?: 12 | 24 | 36;
  priority?: 'critical' | 'high' | 'normal';
  justification: string;
  requesterId?: string;
}

export interface ProcurementData {
  vendors: Vendor[];
  requests: PurchaseRequest[];
  contracts: VendorContract[];
  purchaseOrders: PurchaseOrder[];
  budgets: DepartmentBudget[];
  playbooks: SavingsPlaybook[];
  baselineManagedSpendUsd: number;
  baselineSavingsUsd: number;
  extraNegotiatedSavingsUsd: number;
  autonomousCycleDays: number;
}
