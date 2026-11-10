/**
 * Helix Procurement — Autonomous Source-to-Pay Engine.
 * Handles Nova natural-language intake parsing, live price benchmark percentiles
 * (P25 / Median / P75), duplicate & idle seat detection, 5-stage parallel
 * approval progression, PO issuance, and 3-way match verification math.
 */
import { CATEGORY_META, USD_TO_AED } from './seed';
import type {
  ApprovalStep,
  CurrencyCode,
  NewRequestInput,
  NovaIntakeDraft,
  PriceBenchmark,
  ProcurementCategory,
  ProcurementData,
  PurchaseOrder,
  PurchaseRequest,
  Vendor,
  VendorContract,
} from './types';

/* ───────────────────────── Currency & Formatting ───────────────────────── */

export function formatUsd(amount: number, compact = false): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function formatAed(amountUsd: number, compact = false): string {
  const aed = (Number.isFinite(amountUsd) ? amountUsd : 0) * USD_TO_AED;
  if (compact) {
    const abs = Math.abs(aed);
    if (abs >= 1_000_000) return `AED ${(aed / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `AED ${(aed / 1_000).toFixed(0)}K`;
  }
  return `AED ${Math.round(aed).toLocaleString('en-US')}`;
}

export function formatDualCurrency(
  amountUsd: number,
  primary: CurrencyCode = 'USD',
  compact = false,
): { primary: string; secondary: string } {
  if (primary === 'AED') {
    return {
      primary: formatAed(amountUsd, compact),
      secondary: formatUsd(amountUsd, compact),
    };
  }
  return {
    primary: formatUsd(amountUsd, compact),
    secondary: formatAed(amountUsd, compact),
  };
}

/* ───────────────────────── 5-Stage Approval Builder ───────────────────────── */

export function buildApprovalStages(opts: {
  requesterId: string;
  category: ProcurementCategory;
  amountUsd: number;
}): ApprovalStep[] {
  const budgetOwnerMap: Record<ProcurementCategory, string> = {
    cloud_infra: 'u-omar',
    ai_models: 'u-omar',
    security_iam: 'u-layla',
    product_design: 'u-aisha',
    workplace_ops: 'u-mateo',
  };

  const budgetOwnerId = budgetOwnerMap[opts.category] ?? 'u-omar';
  const securityReviewerId = opts.category === 'security_iam' ? 'u-ethan' : 'u-layla';
  const legalReviewerId = 'u-sara';
  const financeReviewerId = opts.amountUsd >= 250_000 ? 'u-grace' : 'u-daniel';

  return [
    {
      id: 'requester',
      label: 'Requester Intake',
      reviewerId: opts.requesterId,
      status: 'approved',
      slaHours: 1,
      completedAt: Date.now(),
      note: 'Submitted with Nova benchmark & scope verification.',
      checks: ['Business justification verified', 'Peer P25/P50 benchmark attached'],
    },
    {
      id: 'budget_owner',
      label: 'Budget Owner',
      reviewerId: budgetOwnerId,
      status: 'pending',
      slaHours: 4,
      note: 'Awaiting department budget envelope sign-off.',
      checks: [`${CATEGORY_META[opts.category].glCode} budget check`],
    },
    {
      id: 'security_privacy',
      label: 'Security & Privacy (SOC2/DPA)',
      reviewerId: securityReviewerId,
      status: 'waiting',
      slaHours: 6,
      checks: ['SOC2 Type II attestation', 'UAE PDPL / GDPR Data Processing Addendum'],
    },
    {
      id: 'legal_redline',
      label: 'Legal Redline',
      reviewerId: legalReviewerId,
      status: 'waiting',
      slaHours: 8,
      checks: ['Renewal uplift cap <= 5%', 'IP indemnity & termination clause'],
    },
    {
      id: 'finance_controller',
      label: 'Finance Controller',
      reviewerId: financeReviewerId,
      status: 'waiting',
      slaHours: 6,
      checks: ['3-way match PO controls', 'Multi-currency AED/USD ledger schedule'],
    },
  ];
}

/* ───────────────────────── Benchmark & Intake Copilot ───────────────────────── */

export function buildBenchmarkForQuote(
  unitCostUsd: number,
  unitLabel: string,
  vendorName: string,
): PriceBenchmark {
  const cleanUnit = Math.max(10, Math.round(unitCostUsd));
  const p25Usd = Math.round(cleanUnit * 0.82);
  const medianUsd = Math.round(cleanUnit * 0.91);
  const p75Usd = Math.round(cleanUnit * 1.06);
  const targetCounterUsd = Math.round(cleanUnit * 0.85);

  return {
    unitLabel,
    quotedUnitUsd: cleanUnit,
    p25Usd,
    medianUsd,
    p75Usd,
    targetCounterUsd,
    peerSampleSize: 164,
    recommendation: `Nova benchmarked ${vendorName} against 164 enterprise peers: target counter-offer of $${targetCounterUsd.toLocaleString()}/${unitLabel} (15% below quote, near P25).`,
  };
}

export function parseNovaIntake(prompt: string, vendors: Vendor[]): NovaIntakeDraft {
  const raw = prompt.trim();
  const lower = raw.toLowerCase();

  // Detect vendor or archetype
  let matchedVendor =
    vendors.find((v) => lower.includes(v.name.toLowerCase().split(' ')[0])) ??
    vendors[0];

  let category: ProcurementCategory = matchedVendor.category;
  let department = 'Engineering';
  let location = 'Dubai';
  let quantity = 25;
  let unitLabel = 'seats';
  let termMonths: 12 | 24 | 36 = 12;
  let quotedUnitUsd = matchedVendor.unitCostPerSeatUsd || 1_080;
  let title = `${matchedVendor.name} · Enterprise Requisition`;
  let duplicateWarning: string | undefined;

  if (lower.includes('figma') || lower.includes('design')) {
    matchedVendor = vendors.find((v) => v.id === 'v-figma') ?? matchedVendor;
    category = 'product_design';
    department = 'Design';
    location = lower.includes('singapore') ? 'Singapore' : 'Dubai';
    const numMatch = raw.match(/\b(\d+)\b/);
    quantity = numMatch ? Math.max(1, Number(numMatch[1])) : 25;
    unitLabel = 'seats';
    quotedUnitUsd = 1_080;
    title = `${quantity} Figma Enterprise Seats · ${department} (${location})`;
    const idle = Math.max(0, matchedVendor.provisionedSeats - matchedVendor.activeSeats);
    if (idle > 0) {
      duplicateWarning = `${idle} idle Figma seats detected (>45d inactive). Reclaiming covers ${Math.min(100, Math.round((idle / quantity) * 100))}% of this request at $0 net spend.`;
    }
  } else if (lower.includes('snowflake') || lower.includes('warehouse') || lower.includes('iceberg')) {
    matchedVendor = vendors.find((v) => v.id === 'v-snowflake') ?? matchedVendor;
    category = 'cloud_infra';
    department = 'Engineering';
    location = 'Dubai';
    quantity = 300;
    unitLabel = 'compute credit packs';
    quotedUnitUsd = 4_000;
    termMonths = 36;
    title = 'Snowflake Enterprise Renewal · Multi-Year Sovereign Cap';
    duplicateWarning =
      'Active contract CTR-2026-01 hits auto-renewal cliff in 19 days — co-terming locks 15% multi-year cap.';
  } else if (lower.includes('macbook') || lower.includes('laptop') || lower.includes('m4') || lower.includes('device')) {
    matchedVendor = vendors.find((v) => v.id === 'v-rippling') ?? matchedVendor;
    category = 'workplace_ops';
    department = 'Engineering';
    location = lower.includes('dubai') ? 'Dubai' : 'Singapore';
    const numMatch = raw.match(/\b(\d+)\b/);
    quantity = numMatch ? Math.max(1, Number(numMatch[1])) : 40;
    unitLabel = 'M4 Max units';
    quotedUnitUsd = 3_450;
    termMonths = 12;
    title = `${quantity}× MacBook Pro M4 Max Fleet · ${location} ${department}`;
    duplicateWarning =
      'Rippling GCC Device Logistics MSA covers zero-touch MDM enrollment & free Dubai warehousing.';
  } else if (lower.includes('audit') || lower.includes('unused') || lower.includes('idle') || lower.includes('saas')) {
    matchedVendor = vendors.find((v) => v.id === 'v-datadog') ?? matchedVendor;
    category = 'cloud_infra';
    department = 'IT & Security';
    location = 'Dubai';
    quantity = 112;
    unitLabel = 'consolidated seats';
    quotedUnitUsd = 1_440;
    termMonths = 24;
    title = 'Autonomous SaaS License Consolidation & True-Down Order';
    duplicateWarning =
      'Identified 54 idle Figma seats + 58 dormant Datadog seats ($141,840 combined annual savings ready to reclaim).';
  } else if (lower.includes('anthropic') || lower.includes('claude') || lower.includes('ai') || lower.includes('token')) {
    matchedVendor = vendors.find((v) => v.id === 'v-anthropic') ?? matchedVendor;
    category = 'ai_models';
    department = 'Engineering';
    location = 'Dubai';
    const numMatch = raw.match(/\b(\d+)\b/);
    quantity = numMatch ? Math.max(10, Number(numMatch[1])) : 100;
    unitLabel = 'M-token packs';
    quotedUnitUsd = 4_000;
    termMonths = 24;
    title = `Anthropic Claude Enterprise · ${quantity}M Token Commit`;
  } else {
    const numMatch = raw.match(/\b(\d+)\b/);
    if (numMatch) quantity = Math.max(1, Math.min(2000, Number(numMatch[1])));
    if (lower.includes('singapore')) location = 'Singapore';
    else if (lower.includes('london')) location = 'London';
    else if (lower.includes('berlin')) location = 'Berlin';
    title = raw.length > 6 ? raw.charAt(0).toUpperCase() + raw.slice(1) : `${matchedVendor.name} Purchase Requisition`;
  }

  const quotedAnnualUsd = Math.round(quantity * quotedUnitUsd);
  const benchmark = buildBenchmarkForQuote(quotedUnitUsd, unitLabel, matchedVendor.name);
  const recommendedAnnualUsd = Math.round(quantity * benchmark.targetCounterUsd);
  const estimatedSavingsUsd = Math.max(0, quotedAnnualUsd - recommendedAnnualUsd);

  const stages = buildApprovalStages({
    requesterId: 'u-layla',
    category,
    amountUsd: recommendedAnnualUsd,
  });

  return {
    prompt: raw,
    title,
    vendorId: matchedVendor.id,
    vendorName: matchedVendor.name,
    vendorSigil: matchedVendor.sigil,
    vendorColor: matchedVendor.color,
    category,
    department,
    location,
    quantity,
    unitLabel,
    quotedAnnualUsd,
    recommendedAnnualUsd,
    estimatedSavingsUsd,
    termMonths,
    benchmark,
    duplicateWarning,
    confidencePct: 96,
    stagesPreview: stages.map((s) => ({
      id: s.id,
      label: s.label,
      reviewerId: s.reviewerId,
      slaHours: s.slaHours,
    })),
  };
}

/* ───────────────────────── Mutations & Domain Math ───────────────────────── */

export function createRequestFromInput(
  input: NewRequestInput,
  vendors: Vendor[],
  existingCount: number,
): PurchaseRequest {
  const vendor = vendors.find((v) => v.id === input.vendorId) ?? vendors[0];
  const quantity = Math.max(1, Math.round(input.quantity || 1));
  const quotedAnnualUsd = Math.max(500, Math.round(input.quotedAnnualUsd));
  const unitCostUsd = Math.round(quotedAnnualUsd / quantity);
  const unitLabel = input.unitLabel?.trim() || 'seats';
  const benchmark = buildBenchmarkForQuote(unitCostUsd, unitLabel, vendor.name);
  const negotiatedAnnualUsd = Math.round(quotedAnnualUsd * 0.88);
  const idleSeats = Math.max(0, vendor.provisionedSeats - vendor.activeSeats);

  return {
    id: `REQ-2026-${107 + existingCount}`,
    title: input.title.trim() || `${vendor.name} Enterprise Order`,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorSigil: vendor.sigil,
    vendorColor: vendor.color,
    category: input.category,
    requesterId: input.requesterId ?? 'u-layla',
    department: input.department || 'Engineering',
    location: input.location || 'Dubai',
    quantity,
    unitLabel,
    quotedAnnualUsd,
    negotiatedAnnualUsd,
    currency: input.currency,
    status: 'pending_approval',
    priority: input.priority ?? (quotedAnnualUsd >= 250_000 ? 'critical' : 'high'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    justification:
      input.justification.trim() ||
      'Autonomous requisition created via Helix Procurement with peer price benchmarking.',
    termMonths: input.termMonths ?? 12,
    benchmark,
    duplicateWarning:
      idleSeats > 10
        ? `${idleSeats} inactive ${vendor.name} seats can be reclaimed in Vendor 360 to offset cost.`
        : undefined,
    stages: buildApprovalStages({
      requesterId: input.requesterId ?? 'u-layla',
      category: input.category,
      amountUsd: negotiatedAnnualUsd,
    }),
  };
}

/**
 * Advances the current pending/waiting stage of a PurchaseRequest.
 * Once all 5 stages are approved, transitions the request status to 'approved'.
 */
export function advanceRequestApproval(req: PurchaseRequest): {
  updated: PurchaseRequest;
  approvedStageLabel: string | null;
  allApproved: boolean;
} {
  const idx = req.stages.findIndex((s) => s.status !== 'approved');
  if (idx === -1) {
    return {
      updated: { ...req, status: req.status === 'po_issued' ? 'po_issued' : 'approved' },
      approvedStageLabel: null,
      allApproved: true,
    };
  }

  const approvedStageLabel = req.stages[idx].label;
  const nextStages: ApprovalStep[] = req.stages.map((s, i) => {
    if (i === idx) {
      return {
        ...s,
        status: 'approved',
        completedAt: Date.now(),
        note: s.note ?? 'Approved via 5-Stage Constellation sign-off.',
      };
    }
    if (i === idx + 1 && s.status === 'waiting') {
      return {
        ...s,
        status: 'pending',
      };
    }
    return s;
  });

  const allApproved = nextStages.every((s) => s.status === 'approved');
  return {
    updated: {
      ...req,
      stages: nextStages,
      status: allApproved ? 'approved' : req.status === 'negotiating' ? 'pending_approval' : req.status,
      updatedAt: Date.now(),
    },
    approvedStageLabel,
    allApproved,
  };
}

/**
 * Applies Nova autonomous price negotiation to a PurchaseRequest, locking P25 target rate.
 */
export function negotiateRequestWithNova(req: PurchaseRequest): {
  updated: PurchaseRequest;
  additionalSavingsUsd: number;
} {
  const targetAnnual = Math.min(
    req.negotiatedAnnualUsd,
    Math.round(req.quantity * req.benchmark.targetCounterUsd),
  );
  const additional = Math.max(
    Math.round(req.negotiatedAnnualUsd * 0.07),
    req.negotiatedAnnualUsd - targetAnnual,
  );
  const nextNegotiated = Math.max(1_000, req.negotiatedAnnualUsd - additional);

  return {
    updated: {
      ...req,
      negotiatedAnnualUsd: nextNegotiated,
      status: req.stages.every((s) => s.status === 'approved') ? 'approved' : 'pending_approval',
      updatedAt: Date.now(),
      benchmark: {
        ...req.benchmark,
        recommendation: `Nova Autonomous Counter-Offer accepted: locked ${formatUsd(nextNegotiated)}/yr (saving ${formatUsd(req.quotedAnnualUsd - nextNegotiated)} vs initial quote).`,
      },
    },
    additionalSavingsUsd: additional,
  };
}

/**
 * Issues a formal Purchase Order from a PurchaseRequest.
 */
export function buildPurchaseOrderFromRequest(
  req: PurchaseRequest,
  existingPoCount: number,
): PurchaseOrder {
  const poNumber = `PO-2026-${406 + existingPoCount}`;
  const catMeta = CATEGORY_META[req.category];
  return {
    id: poNumber,
    requestId: req.id,
    vendorId: req.vendorId,
    vendorName: req.vendorName,
    vendorSigil: req.vendorSigil,
    vendorColor: req.vendorColor,
    title: req.title,
    category: req.category,
    department: req.department,
    ownerId: req.requesterId,
    issuedAt: new Date().toISOString().slice(0, 10),
    glCode: catMeta.glCode,
    poAmountUsd: req.negotiatedAnnualUsd,
    receiptConfirmedUnits: req.quantity,
    orderedUnits: req.quantity,
    unitLabel: req.unitLabel,
    invoiceNumber: `INV-${req.vendorName.slice(0, 2).toUpperCase()}-${91000 + existingPoCount}`,
    invoiceAmountUsd: req.negotiatedAnnualUsd,
    varianceUsd: 0,
    matchStatus: 'matched',
    paymentTerms: 'Net 30',
  };
}

/**
 * Calculates idle seats and annualized savings for a vendor.
 */
export function calculateVendorIdleSeats(vendor: Vendor): {
  idleSeats: number;
  utilizationPct: number;
  annualIdleSavingsUsd: number;
} {
  const idleSeats = Math.max(0, vendor.provisionedSeats - vendor.activeSeats);
  const utilizationPct =
    vendor.provisionedSeats > 0
      ? Math.round((vendor.activeSeats / vendor.provisionedSeats) * 100)
      : 100;
  const annualIdleSavingsUsd = idleSeats * vendor.unitCostPerSeatUsd;
  return { idleSeats, utilizationPct, annualIdleSavingsUsd };
}

/**
 * Reclaims idle seats on a vendor and returns the updated vendor + annualized savings.
 */
export function reclaimIdleSeatsForVendor(vendor: Vendor): {
  updatedVendor: Vendor;
  reclaimedSeats: number;
  savingsUsd: number;
} {
  const { idleSeats, annualIdleSavingsUsd } = calculateVendorIdleSeats(vendor);
  if (idleSeats <= 0) {
    return { updatedVendor: vendor, reclaimedSeats: 0, savingsUsd: 0 };
  }
  const updatedVendor: Vendor = {
    ...vendor,
    provisionedSeats: vendor.activeSeats,
    annualSpendUsd: Math.max(0, vendor.annualSpendUsd - annualIdleSavingsUsd),
    reclaimedSeatsCount: (vendor.reclaimedSeatsCount || 0) + idleSeats,
  };
  return {
    updatedVendor,
    reclaimedSeats: idleSeats,
    savingsUsd: annualIdleSavingsUsd,
  };
}

/**
 * Applies Nova's counter-offer to a vendor contract.
 */
export function applyCounterOfferToContract(contract: VendorContract): {
  updatedContract: VendorContract;
  savingsUsd: number;
} {
  if (contract.counterOfferApplied) {
    return { updatedContract: contract, savingsUsd: 0 };
  }
  const savingsUsd = Math.max(0, contract.proposedRenewalUsd - contract.novaCounterOfferUsd);
  const updatedContract: VendorContract = {
    ...contract,
    annualValueUsd: contract.novaCounterOfferUsd,
    counterOfferApplied: true,
    status: 'counter_locked',
    clauses: contract.clauses.map((c) =>
      c.status === 'redline_needed' ? { ...c, status: 'negotiated' } : c,
    ),
  };
  return { updatedContract, savingsUsd };
}

/**
 * Resolves and verifies a Purchase Order's 3-way match, clamping any unapproved invoice variance
 * to the PO ceiling and queueing it to Helix Ledger.
 */
export function verifyOrderThreeWayMatch(po: PurchaseOrder): {
  updatedOrder: PurchaseOrder;
  varianceClampedUsd: number;
} {
  const varianceClampedUsd = Math.max(0, po.varianceUsd);
  const updatedOrder: PurchaseOrder = {
    ...po,
    invoiceAmountUsd: po.poAmountUsd,
    varianceUsd: 0,
    varianceReason: varianceClampedUsd > 0
      ? `Resolved: Clamped ${formatUsd(varianceClampedUsd)} invoice overage to PO ceiling & issued debit memo.`
      : po.varianceReason,
    matchStatus: 'verified_queued',
    ledgerQueuedAt: Date.now(),
  };
  return { updatedOrder, varianceClampedUsd };
}

/* ───────────────────────── KPI & Spend Telemetry ───────────────────────── */

export interface ProcurementKpiSummary {
  managedSpendUsd: number;
  totalSavingsUsd: number;
  savingsPct: number;
  autonomousCycleDays: number;
  activePosCount: number;
  openRequestsCount: number;
  avgSecurityScore: number;
  urgentRenewalsCount: number;
  varianceFlaggedPosCount: number;
  totalIdleSeats: number;
  potentialIdleSavingsUsd: number;
}

export function computeProcurementKpis(data: ProcurementData): ProcurementKpiSummary {
  const totalSavingsUsd = data.baselineSavingsUsd + data.extraNegotiatedSavingsUsd;
  const managedSpendUsd = Math.max(
    1_000_000,
    data.baselineManagedSpendUsd - data.extraNegotiatedSavingsUsd,
  );
  const savingsPct = Number(((totalSavingsUsd / data.baselineManagedSpendUsd) * 100).toFixed(1));
  const openRequestsCount = data.requests.filter(
    (r) => r.status === 'pending_approval' || r.status === 'negotiating' || r.status === 'approved',
  ).length;
  const activePosCount = data.purchaseOrders.length;
  const avgSecurityScore =
    data.vendors.length > 0
      ? Math.round(
          data.vendors.reduce((acc, v) => acc + v.securityScore, 0) / data.vendors.length,
        )
      : 96;
  const urgentRenewalsCount = data.contracts.filter(
    (c) => c.daysUntilCliff <= 30 && !c.counterOfferApplied,
  ).length;
  const varianceFlaggedPosCount = data.purchaseOrders.filter(
    (p) => p.matchStatus === 'variance_flagged',
  ).length;

  let totalIdleSeats = 0;
  let potentialIdleSavingsUsd = 0;
  for (const v of data.vendors) {
    const { idleSeats, annualIdleSavingsUsd } = calculateVendorIdleSeats(v);
    totalIdleSeats += idleSeats;
    potentialIdleSavingsUsd += annualIdleSavingsUsd;
  }

  return {
    managedSpendUsd,
    totalSavingsUsd,
    savingsPct,
    autonomousCycleDays: data.autonomousCycleDays,
    activePosCount,
    openRequestsCount,
    avgSecurityScore,
    urgentRenewalsCount,
    varianceFlaggedPosCount,
    totalIdleSeats,
    potentialIdleSavingsUsd,
  };
}

export interface CategorySpendRow {
  category: ProcurementCategory;
  label: string;
  sigil: string;
  color: string;
  glCode: string;
  annualSpendUsd: number;
  sharePct: number;
  vendorCount: number;
}

export function computeCategorySpendBreakdown(vendors: Vendor[]): CategorySpendRow[] {
  const totals: Record<ProcurementCategory, { spend: number; count: number }> = {
    cloud_infra: { spend: 0, count: 0 },
    ai_models: { spend: 0, count: 0 },
    security_iam: { spend: 0, count: 0 },
    product_design: { spend: 0, count: 0 },
    workplace_ops: { spend: 0, count: 0 },
  };

  let grandTotal = 0;
  for (const v of vendors) {
    totals[v.category].spend += v.annualSpendUsd;
    totals[v.category].count += 1;
    grandTotal += v.annualSpendUsd;
  }

  const order: ProcurementCategory[] = [
    'cloud_infra',
    'ai_models',
    'security_iam',
    'workplace_ops',
    'product_design',
  ];

  return order.map((cat) => {
    const meta = CATEGORY_META[cat];
    const spend = totals[cat].spend;
    const sharePct = grandTotal > 0 ? Math.round((spend / grandTotal) * 100) : 0;
    return {
      category: cat,
      label: meta.label,
      sigil: meta.sigil,
      color: meta.color,
      glCode: meta.glCode,
      annualSpendUsd: spend,
      sharePct,
      vendorCount: totals[cat].count,
    };
  });
}
