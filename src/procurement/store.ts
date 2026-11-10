/**
 * Helix Procurement — Persisted Zustand store (`nexus-procurement-v1`).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from '@/store/toast';
import {
  advanceRequestApproval,
  applyCounterOfferToContract,
  buildPurchaseOrderFromRequest,
  createRequestFromInput,
  formatUsd,
  negotiateRequestWithNova,
  parseNovaIntake,
  reclaimIdleSeatsForVendor,
  verifyOrderThreeWayMatch,
} from './engine';
import { createProcurementSeed } from './seed';
import type {
  NewRequestInput,
  NovaIntakeDraft,
  ProcurementData,
  PurchaseOrder,
  PurchaseRequest,
} from './types';

function notifyToast(
  kind: 'success' | 'info' | 'warning' | 'error',
  title: string,
  description?: string,
) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, description);
  }
}

const memoryStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};

export interface ProcurementStore extends ProcurementData {
  activeIntakeDraft: NovaIntakeDraft | null;
  runNovaIntake(prompt: string): NovaIntakeDraft;
  clearNovaIntake(): void;
  createRequestFromNovaDraft(draft?: NovaIntakeDraft, requesterId?: string): PurchaseRequest | null;
  createRequest(input: NewRequestInput): PurchaseRequest;
  advanceApproval(requestId: string): {
    ok: boolean;
    stageApproved?: string | null;
    allApproved?: boolean;
  };
  issuePurchaseOrder(requestId: string): PurchaseOrder | null;
  negotiateRequest(requestId: string): { ok: boolean; savingsUsd: number };
  reclaimVendorSeats(vendorId: string): {
    ok: boolean;
    reclaimedSeats: number;
    savingsUsd: number;
  };
  applyContractCounterOffer(contractId: string): { ok: boolean; savingsUsd: number };
  verifyThreeWayMatch(poId: string): { ok: boolean; varianceClampedUsd: number };
  executeSavingsPlaybook(playbookId: string): { ok: boolean; savingsUsd: number };
  resetProcurement(): void;
}

export const useProcurement = create<ProcurementStore>()(
  persist(
    (set, get) => ({
      ...createProcurementSeed(),
      activeIntakeDraft: null,

      runNovaIntake(prompt) {
        const draft = parseNovaIntake(prompt, get().vendors);
        set({ activeIntakeDraft: draft });
        return draft;
      },

      clearNovaIntake() {
        set({ activeIntakeDraft: null });
      },

      createRequestFromNovaDraft(draftArg, requesterId = 'u-layla') {
        const draft = draftArg ?? get().activeIntakeDraft;
        if (!draft) return null;
        const created = get().createRequest({
          title: draft.title,
          vendorId: draft.vendorId,
          category: draft.category,
          department: draft.department,
          location: draft.location,
          quantity: draft.quantity,
          unitLabel: draft.unitLabel,
          quotedAnnualUsd: draft.quotedAnnualUsd,
          currency: 'USD',
          termMonths: draft.termMonths,
          priority: draft.recommendedAnnualUsd >= 250_000 ? 'critical' : 'high',
          justification: `Nova Autonomous Intake (${draft.prompt}) · Target counter-offer ${formatUsd(draft.recommendedAnnualUsd)}/yr.`,
          requesterId,
        });
        set({ activeIntakeDraft: null });
        return created;
      },

      createRequest(input) {
        const state = get();
        const req = createRequestFromInput(input, state.vendors, state.requests.length);
        const initialSavings = Math.max(0, req.quotedAnnualUsd - req.negotiatedAnnualUsd);
        set((s) => ({
          requests: [req, ...s.requests],
          extraNegotiatedSavingsUsd: s.extraNegotiatedSavingsUsd + initialSavings,
          budgets: s.budgets.map((b) =>
            b.department.toLowerCase().includes(req.department.toLowerCase().split(' ')[0])
              ? { ...b, committedUsd: b.committedUsd + req.negotiatedAnnualUsd }
              : b,
          ),
        }));
        notifyToast(
          'success',
          `Created ${req.id} · ${req.vendorName}`,
          `Routed to 5-stage parallel constellation with ${formatUsd(initialSavings)} Nova benchmark savings.`,
        );
        return req;
      },

      advanceApproval(requestId) {
        const req = get().requests.find((r) => r.id === requestId);
        if (!req) return { ok: false };
        const { updated, approvedStageLabel, allApproved } = advanceRequestApproval(req);
        set((s) => ({
          requests: s.requests.map((r) => (r.id === requestId ? updated : r)),
        }));
        if (approvedStageLabel) {
          notifyToast(
            'success',
            `${req.id} · ${approvedStageLabel} signed off`,
            allApproved
              ? 'All 5 approval gates cleared — ready to issue Purchase Order.'
              : 'Advanced to next stage in parallel approval constellation.',
          );
        }
        return { ok: true, stageApproved: approvedStageLabel, allApproved };
      },

      issuePurchaseOrder(requestId) {
        const state = get();
        const req = state.requests.find((r) => r.id === requestId);
        if (!req) return null;
        if (req.linkedPoId) {
          const existingPo = state.purchaseOrders.find((p) => p.id === req.linkedPoId) ?? null;
          return existingPo;
        }
        const po = buildPurchaseOrderFromRequest(req, state.purchaseOrders.length);
        const approvedStages = req.stages.map((st) => ({
          ...st,
          status: 'approved' as const,
          completedAt: st.completedAt ?? Date.now(),
        }));
        set((s) => ({
          purchaseOrders: [po, ...s.purchaseOrders],
          requests: s.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: 'po_issued',
                  linkedPoId: po.id,
                  stages: approvedStages,
                  updatedAt: Date.now(),
                }
              : r,
          ),
        }));
        notifyToast(
          'success',
          `Issued ${po.id} (${formatUsd(po.poAmountUsd)})`,
          `Dispatched to ${req.vendorName} & registered in 3-Way Match Engine.`,
        );
        return po;
      },

      negotiateRequest(requestId) {
        const req = get().requests.find((r) => r.id === requestId);
        if (!req) return { ok: false, savingsUsd: 0 };
        const { updated, additionalSavingsUsd } = negotiateRequestWithNova(req);
        set((s) => ({
          requests: s.requests.map((r) => (r.id === requestId ? updated : r)),
          extraNegotiatedSavingsUsd: s.extraNegotiatedSavingsUsd + additionalSavingsUsd,
        }));
        notifyToast(
          'success',
          `Nova negotiated ${formatUsd(additionalSavingsUsd)} additional savings`,
          `${req.id} locked at ${formatUsd(updated.negotiatedAnnualUsd)}/yr (Peer P25 target).`,
        );
        return { ok: true, savingsUsd: additionalSavingsUsd };
      },

      reclaimVendorSeats(vendorId) {
        const vendor = get().vendors.find((v) => v.id === vendorId);
        if (!vendor) return { ok: false, reclaimedSeats: 0, savingsUsd: 0 };
        const { updatedVendor, reclaimedSeats, savingsUsd } = reclaimIdleSeatsForVendor(vendor);
        if (reclaimedSeats <= 0) {
          notifyToast('info', `${vendor.name} is already at 100% seat utilization`);
          return { ok: false, reclaimedSeats: 0, savingsUsd: 0 };
        }
        set((s) => ({
          vendors: s.vendors.map((v) => (v.id === vendorId ? updatedVendor : v)),
          extraNegotiatedSavingsUsd: s.extraNegotiatedSavingsUsd + savingsUsd,
          playbooks: s.playbooks.map((pb) =>
            pb.vendorId === vendorId && pb.actionKind === 'reclaim_seats'
              ? { ...pb, executed: true }
              : pb,
          ),
        }));
        notifyToast(
          'success',
          `Reclaimed ${reclaimedSeats} idle ${vendor.name} seats`,
          `Added ${formatUsd(savingsUsd)}/yr to Nova Negotiated Savings.`,
        );
        return { ok: true, reclaimedSeats, savingsUsd };
      },

      applyContractCounterOffer(contractId) {
        const contract = get().contracts.find((c) => c.id === contractId);
        if (!contract || contract.counterOfferApplied) {
          return { ok: false, savingsUsd: 0 };
        }
        const { updatedContract, savingsUsd } = applyCounterOfferToContract(contract);
        set((s) => ({
          contracts: s.contracts.map((c) => (c.id === contractId ? updatedContract : c)),
          vendors: s.vendors.map((v) =>
            v.id === contract.vendorId
              ? { ...v, annualSpendUsd: updatedContract.annualValueUsd }
              : v,
          ),
          extraNegotiatedSavingsUsd: s.extraNegotiatedSavingsUsd + savingsUsd,
          playbooks: s.playbooks.map((pb) =>
            pb.contractId === contractId && pb.actionKind === 'counter_offer'
              ? { ...pb, executed: true }
              : pb,
          ),
        }));
        notifyToast(
          'success',
          `Counter-offer locked on ${contract.vendorName}`,
          `Saved ${formatUsd(savingsUsd)}/yr vs vendor renewal proposal (${contract.upliftCapPct}% uplift cap enforced).`,
        );
        return { ok: true, savingsUsd };
      },

      verifyThreeWayMatch(poId) {
        const po = get().purchaseOrders.find((p) => p.id === poId);
        if (!po || po.matchStatus === 'verified_queued') {
          return { ok: false, varianceClampedUsd: 0 };
        }
        const { updatedOrder, varianceClampedUsd } = verifyOrderThreeWayMatch(po);
        set((s) => ({
          purchaseOrders: s.purchaseOrders.map((p) => (p.id === poId ? updatedOrder : p)),
          extraNegotiatedSavingsUsd: s.extraNegotiatedSavingsUsd + varianceClampedUsd,
          budgets: s.budgets.map((b) =>
            b.department.toLowerCase().includes(po.department.toLowerCase().split(' ')[0])
              ? { ...b, actualSpentUsd: Math.min(b.annualBudgetUsd, b.actualSpentUsd + po.poAmountUsd) }
              : b,
          ),
        }));
        notifyToast(
          'success',
          `3-Way Match Verified · ${po.id}`,
          varianceClampedUsd > 0
            ? `Clamped ${formatUsd(varianceClampedUsd)} invoice variance & queued ${formatUsd(po.poAmountUsd)} to Helix Ledger.`
            : `PO, Receipt (${po.receiptConfirmedUnits} ${po.unitLabel}) & Invoice (${po.invoiceNumber}) matched — queued to Ledger.`,
        );
        return { ok: true, varianceClampedUsd };
      },

      executeSavingsPlaybook(playbookId) {
        const pb = get().playbooks.find((p) => p.id === playbookId);
        if (!pb || pb.executed) return { ok: false, savingsUsd: 0 };
        if (pb.actionKind === 'reclaim_seats' && pb.vendorId) {
          const res = get().reclaimVendorSeats(pb.vendorId);
          set((s) => ({
            playbooks: s.playbooks.map((p) => (p.id === playbookId ? { ...p, executed: true } : p)),
          }));
          return { ok: res.ok, savingsUsd: res.savingsUsd };
        }
        if (pb.actionKind === 'counter_offer' && pb.contractId) {
          const res = get().applyContractCounterOffer(pb.contractId);
          set((s) => ({
            playbooks: s.playbooks.map((p) => (p.id === playbookId ? { ...p, executed: true } : p)),
          }));
          return { ok: res.ok, savingsUsd: res.savingsUsd };
        }
        set((s) => ({
          playbooks: s.playbooks.map((p) => (p.id === playbookId ? { ...p, executed: true } : p)),
          extraNegotiatedSavingsUsd: s.extraNegotiatedSavingsUsd + pb.estimatedSavingsUsd,
        }));
        notifyToast(
          'success',
          `Executed Playbook · ${pb.title}`,
          `Saved ${formatUsd(pb.estimatedSavingsUsd)}/yr.`,
        );
        return { ok: true, savingsUsd: pb.estimatedSavingsUsd };
      },

      resetProcurement() {
        set({
          ...createProcurementSeed(),
          activeIntakeDraft: null,
        });
      },
    }),
    {
      name: 'nexus-procurement-v1',
      storage: createJSONStorage(() =>
        typeof localStorage !== 'undefined' ? localStorage : memoryStorage,
      ),
    },
  ),
);

export function resetProcurement() {
  useProcurement.getState().resetProcurement();
}
