/**
 * Helix Procurement — journey view-models for the NeoTracker "pizza trackers".
 * Pure functions (no React) so stage ordering and SLA maths stay unit-testable:
 *   - derivePurchaseJourney(): purchase request → approval gates in the order the
 *     request actually travelled, the live gate, its mood and SLA clock → PO issued.
 *   - derivePoJourney(): purchase order → receipt → invoice → 3-way match → ledger.
 * UI strings for these trackers live in ./PurchaseTracker.tsx.
 */
import type { ApprovalStageId, ApprovalStep, PurchaseOrder, PurchaseRequest } from '@/procurement/types';

const HOUR = 3_600_000;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Short tracker labels for each approval gate (full names stay on the constellation cards). */
export const GATE_LABEL: Record<ApprovalStageId, string> = {
  requester: 'Requested',
  budget_owner: 'Budget',
  security_privacy: 'Security',
  legal_redline: 'Legal',
  finance_controller: 'Finance',
};

/** Final stage of every purchase journey (and first stage of the PO journey). */
export const PO_STEP_LABEL = 'PO issued';

/** PO journey: issued → goods / SCIM receipt → vendor invoice → 3-way match → Helix Ledger. */
export const PO_JOURNEY_LABELS = [PO_STEP_LABEL, 'Receipt', 'Invoice', '3-way match', 'Ledger'] as const;

export type JourneyMood = 'active' | 'blocked' | 'paused' | 'done';

export type PurchaseJourneyReason =
  /** A gate is reviewing the request. */
  | 'review'
  /** The live gate flagged it (changes requested). */
  | 'flagged'
  /** The request was declined. */
  | 'rejected'
  /** Held while Nova negotiates the price with the vendor. */
  | 'negotiating'
  /** Back with the requester (their own intake gate is open again). */
  | 'with_requester'
  /** Every gate signed — waiting for someone to issue the PO. */
  | 'ready_for_po'
  /** PO issued — journey complete. */
  | 'po_issued';

export interface StageSla {
  /** When the gate's clock started: the last earlier gate's sign-off, or intake. */
  startedAt: number;
  dueAt: number;
  slaHours: number;
  /** Hours until the SLA is due — negative once it is overdue. */
  hoursLeft: number;
  overdue: boolean;
  /** 0..1 share of the SLA window already used (drives the courier). */
  elapsed: number;
}

export interface PurchaseJourney {
  /** Approval gates in travel order: cleared gates by sign-off time, then the live gate, then the queue. */
  gates: ApprovalStep[];
  /** 0-based live index into `[...gates, PO issued]`; `totalSteps` = complete. */
  current: number;
  totalSteps: number;
  mood: JourneyMood;
  reason: PurchaseJourneyReason;
  /** The gate holding the request (absent once every gate has signed). */
  live?: ApprovalStep;
  sla?: StageSla;
  /** Most recent sign-off. */
  lastCleared?: ApprovalStep;
}

/**
 * SLA clock for an open gate. Gates activate one after another (see
 * `advanceRequestApproval`), so a gate's clock starts when the last gate
 * before it signed — or at intake when nothing before it has signed yet.
 */
export function stageSla(req: PurchaseRequest, stage: ApprovalStep, now = Date.now()): StageSla {
  const idx = req.stages.findIndex((s) => s.id === stage.id);
  const startedAt = req.stages
    .slice(0, Math.max(0, idx))
    .reduce((latest, s) => (s.status === 'approved' && s.completedAt ? Math.max(latest, s.completedAt) : latest), req.createdAt);
  const windowMs = Math.max(1, stage.slaHours) * HOUR;
  const dueAt = startedAt + stage.slaHours * HOUR;
  const hoursLeft = (dueAt - now) / HOUR;
  return {
    startedAt,
    dueAt,
    slaHours: stage.slaHours,
    hoursLeft,
    overdue: hoursLeft < 0,
    elapsed: clamp01((now - startedAt) / windowMs),
  };
}

/**
 * Where a purchase request is on its way to a PO.
 *
 * The approval constellation runs gates in parallel, so a later gate can sign
 * before an earlier one (e.g. Legal before Budget). The tracker therefore lists
 * cleared gates in the order they actually signed, then the live gate, then the
 * queue — a cleared gate is never drawn as still waiting. Only the gates the
 * request really routes through (`req.stages`) are included.
 */
export function derivePurchaseJourney(req: PurchaseRequest, now = Date.now()): PurchaseJourney {
  const cleared = req.stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => stage.status === 'approved')
    .sort((a, b) => (a.stage.completedAt ?? 0) - (b.stage.completedAt ?? 0) || a.index - b.index)
    .map(({ stage }) => stage);
  const open = req.stages.filter((s) => s.status !== 'approved');
  // A flagged gate blocks the whole journey, so it becomes the live stage even if
  // an earlier gate is still reviewing in parallel.
  const live = open.find((s) => s.status === 'flagged') ?? open[0];
  const gates = [...cleared, ...(live ? [live] : []), ...open.filter((s) => s !== live)];
  const totalSteps = gates.length + 1;
  const lastCleared = cleared[cleared.length - 1];

  if (req.status === 'po_issued') {
    return { gates, current: totalSteps, totalSteps, mood: 'done', reason: 'po_issued', lastCleared };
  }

  let mood: JourneyMood = 'active';
  let reason: PurchaseJourneyReason = live ? 'review' : 'ready_for_po';
  if (req.status === 'rejected') {
    mood = 'blocked';
    reason = 'rejected';
  } else if (live?.status === 'flagged') {
    mood = 'blocked';
    reason = 'flagged';
  } else if (req.status === 'negotiating') {
    mood = 'paused';
    reason = 'negotiating';
  } else if (live?.id === 'requester') {
    mood = 'paused';
    reason = 'with_requester';
  }

  return {
    gates,
    // Cleared gates come first, so the live gate (or the PO step) sits right after them.
    current: cleared.length,
    totalSteps,
    mood,
    reason,
    live,
    sla: live ? stageSla(req, live, now) : undefined,
    lastCleared,
  };
}

export type PoJourneyReason = 'awaiting_receipt' | 'awaiting_invoice' | 'variance' | 'ready_to_queue' | 'queued';

export interface PoJourney {
  /** 0-based live index into `PO_JOURNEY_LABELS`; `PO_JOURNEY_LABELS.length` = complete. */
  current: number;
  mood: JourneyMood;
  reason: PoJourneyReason;
  /** Courier position inside the live stage, when the data says how far along it is. */
  progress?: number;
}

/** Where a purchase order is between issue and Helix Ledger (the PO itself always exists). */
export function derivePoJourney(po: PurchaseOrder): PoJourney {
  if (po.matchStatus === 'verified_queued') {
    return { current: PO_JOURNEY_LABELS.length, mood: 'done', reason: 'queued' };
  }
  const flagged = po.matchStatus === 'variance_flagged';
  if (po.receiptConfirmedUnits < po.orderedUnits) {
    return {
      current: 1,
      mood: flagged ? 'blocked' : 'active',
      reason: 'awaiting_receipt',
      progress: po.orderedUnits > 0 ? clamp01(po.receiptConfirmedUnits / po.orderedUnits) : undefined,
    };
  }
  if (!po.invoiceNumber) {
    return { current: 2, mood: 'active', reason: 'awaiting_invoice' };
  }
  if (flagged) {
    return { current: 3, mood: 'blocked', reason: 'variance' };
  }
  // Receipt and invoice agree with the PO — waiting for someone to verify and queue it to Ledger.
  return { current: 4, mood: 'active', reason: 'ready_to_queue' };
}

/** Compact duration for SLA chips: "45m", "6h", "2.5d", "12d". */
export function formatHours(hours: number): string {
  const abs = Math.abs(Number.isFinite(hours) ? hours : 0);
  const minutes = Math.round(abs * 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const h = Math.round(abs);
  if (h < 48) return `${h}h`;
  const days = abs / 24;
  return `${days < 10 ? Math.round(days * 10) / 10 : Math.round(days)}d`;
}

/** Hours between two timestamps (for cycle-time chips). */
export const hoursBetween = (from: number, to: number) => (to - from) / HOUR;
