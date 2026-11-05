/**
 * Helix Spend & Mobility store — orchestrates the full lifecycle from
 * Travel Pre-Approval -> Itinerary & Virtual Corporate Card -> Smart Receipt OCR
 * Vault -> Expense Report -> Manager + Finance Audit -> Payroll Queue -> Paid!
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';
import { uid } from '@/lib/id';
import { daysBetween, todayISO } from '@/hr/calendar';
import * as access from './access';
import {
  CATEGORY_META,
  convertToAed,
  DEPT_COST_CENTER,
  DESTINATION_PRESETS,
  evaluateReceiptWarnings,
  evaluateTripPolicy,
  EXPENSES_DATA_VERSION,
} from './constants';
import { buildExpensesSeed } from './seed';
import type {
  CabinClass,
  CurrencyCode,
  ExpenseCategory,
  ExpenseReport,
  ExpensesData,
  PaymentMethod,
  ReceiptItem,
  TravelRequest,
  TripPurpose,
} from './types';

export interface NewTravelInput {
  originCity: string;
  destinationCity: string;
  destinationCountry: string;
  departureDate: string;
  returnDate: string;
  purpose: TripPurpose;
  title: string;
  businessJustification: string;
  cabinClass: CabinClass;
  flightHours?: number;
  estimatedFlightAed: number;
  estimatedHotelAed: number;
  perDiemRateAed?: number;
  estimatedOtherAed?: number;
  needsVisaLetter?: boolean;
}

export interface NewReceiptInput {
  tripId?: string;
  merchant: string;
  category: ExpenseCategory;
  date: string;
  currency: CurrencyCode;
  originalAmount: number;
  vatAed?: number;
  paymentMethod: PaymentMethod;
  fileName?: string;
  ocrConfidence?: number;
  notes?: string;
  attendees?: string;
}

export interface CreateReportInput {
  title: string;
  tripId?: string;
  receiptIds: string[];
  includeTripPerDiem?: boolean;
  submitNow: boolean;
  note?: string;
}

export interface ExpensesActions {
  requestTravel(input: NewTravelInput): ActionResult & { tripId?: string };
  decideTravel(
    tripId: string,
    decision: 'approved' | 'changes_requested' | 'rejected',
    note?: string,
    issueVirtualCard?: boolean,
  ): ActionResult;
  bookTravelItinerary(
    tripId: string,
    input: { airline: string; flightBookingRef: string; hotelName: string; hotelConfirmation: string },
  ): ActionResult;
  completeTrip(tripId: string): ActionResult;
  uploadReceipt(input: NewReceiptInput): ActionResult & { receiptId?: string };
  generateTripPerDiemReceipt(tripId: string): ActionResult & { receiptId?: string };
  deleteReceipt(receiptId: string): ActionResult;
  createAndSubmitReport(input: CreateReportInput): ActionResult & { reportId?: string };
  submitDraftReport(reportId: string, note?: string): ActionResult;
  managerDecideReport(
    reportId: string,
    decision: 'manager_approved' | 'changes_requested' | 'rejected',
    note?: string,
  ): ActionResult;
  financeAuditReport(
    reportId: string,
    decision: 'payroll_queued' | 'changes_requested' | 'rejected',
    payrollPeriod?: string,
    note?: string,
  ): ActionResult;
  markReportsReimbursedByPayroll(period: string, payrollRunId: string, paymentRefPrefix: string): number;
  disburseExpressReimbursement(reportId: string): ActionResult;
  resetExpensesDemo(): void;
}

export type ExpensesStore = ExpensesData & ExpensesActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const round2 = (n: number) => Math.round(n * 100) / 100;

export function defaultPayrollPeriod(now = Date.now()): string {
  const d = new Date(now);
  // Cut-off on the 24th; after 24th rolls into next month's payroll run
  if (d.getDate() > 24) {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const useExpenses = create<ExpensesStore>()(
  persist(
    (set, get) => {
      const hub = () => useHub.getState();
      const viewer = (): { v: access.ExpensesViewer; user: User } | null => {
        const h = hub();
        const user = h.users.find((u) => u.id === h.sessionUserId && u.active);
        if (!user) return null;
        return { v: { userId: user.id, perms: effectivePermissions(user, h.roles) }, user };
      };

      const audit = (entry: {
        action: string;
        target: string;
        detail?: string;
        outcome?: 'success' | 'denied';
        severity?: 'info' | 'warning' | 'critical';
      }) => {
        const actorId = hub().sessionUserId ?? 'system';
        useHub.setState((s) => ({
          audit: [
            {
              id: uid('au'),
              at: Date.now(),
              actorId,
              outcome: entry.outcome ?? 'success',
              severity: entry.severity ?? 'info',
              action: entry.action,
              target: entry.target,
              detail: entry.detail,
            },
            ...s.audit,
          ].slice(0, 400),
        }));
      };

      const notify = (recipientIds: string[], n: Omit<HubNotification, 'id' | 'at' | 'read' | 'userId'>) => {
        const actorId = hub().sessionUserId;
        const targets = [...new Set(recipientIds.filter((id) => id && id !== actorId))];
        if (!targets.length) return;
        const now = Date.now();
        const items: HubNotification[] = targets.map((userId) => ({
          ...n,
          id: uid('n'),
          userId,
          at: now,
          read: false,
        }));
        useHub.setState((s) => ({ notifications: [...items, ...s.notifications].slice(0, 80) }));
      };

      return {
        ...buildExpensesSeed(),

        requestTravel(input) {
          const ctx = viewer();
          if (!ctx || !access.canUseExpenses(ctx.v)) {
            return fail('Travel & Expenses access is required to submit a trip request.');
          }
          const title = input.title.trim();
          const dest = input.destinationCity.trim();
          if (title.length < 4 || !dest) {
            return fail('Provide a trip title and destination city.');
          }
          if (!input.departureDate || !input.returnDate || input.returnDate < input.departureDate) {
            return fail('Return date must be on or after departure date.');
          }
          if (input.businessJustification.trim().length < 8) {
            return fail('Include a clear business justification so your manager can review quickly.');
          }

          const days = Math.max(1, daysBetween(input.departureDate, input.returnDate) + 1);
          const preset = DESTINATION_PRESETS.find((p) => p.city.toLowerCase() === dest.toLowerCase());
          const perDiemRateAed = input.perDiemRateAed ?? preset?.perDiemAed ?? 380;
          const estimatedPerDiemAed = round2(days * perDiemRateAed);
          const estimatedFlightAed = Math.max(0, round2(input.estimatedFlightAed));
          const estimatedHotelAed = Math.max(0, round2(input.estimatedHotelAed));
          const estimatedOtherAed = Math.max(0, round2(input.estimatedOtherAed ?? 250));
          const totalEstimatedAed = round2(
            estimatedFlightAed + estimatedHotelAed + estimatedPerDiemAed + estimatedOtherAed,
          );
          const flightHours = input.flightHours ?? preset?.flightHoursFromDubai ?? 6;
          const co2Kg = preset?.co2KgRoundtrip ?? Math.round(flightHours * 210);
          const now = Date.now();
          const policyFlags = evaluateTripPolicy({
            departureDate: input.departureDate,
            today: todayISO(now),
            cabinClass: input.cabinClass,
            flightHours,
            totalEstimatedAed,
          });

          const seq = 130 + get().trips.length;
          const reference = `HX-TRV-${new Date(now).getFullYear()}-${String(seq).padStart(4, '0')}`;
          const approverId = ctx.user.managerId ?? 'u-daniel';

          const trip: TravelRequest = {
            id: uid('trp'),
            reference,
            userId: ctx.user.id,
            department: ctx.user.department,
            originCity: input.originCity.trim() || ctx.user.location.split('·')[0].trim() || 'Dubai',
            destinationCity: dest,
            destinationCountry: input.destinationCountry.trim() || preset?.country || 'International',
            departureDate: input.departureDate,
            returnDate: input.returnDate,
            days,
            purpose: input.purpose,
            title,
            businessJustification: input.businessJustification.trim(),
            cabinClass: input.cabinClass,
            flightHours,
            estimatedFlightAed,
            estimatedHotelAed,
            perDiemRateAed,
            estimatedPerDiemAed,
            estimatedOtherAed,
            totalEstimatedAed,
            co2Kg,
            needsVisaLetter: input.needsVisaLetter ?? preset?.visaHint,
            policyFlags,
            status: 'pending_approval',
            approverId,
            createdAt: now,
            updatedAt: now,
          };

          set((s) => ({ trips: [trip, ...s.trips] }));
          notify([approverId], {
            kind: 'request',
            title: `Travel approval needed · ${ctx.user.name}`,
            body: `${trip.originCity} → ${trip.destinationCity} (${trip.days}d) · Est. AED ${trip.totalEstimatedAed.toLocaleString()}`,
            link: '/expenses/approvals',
          });
          audit({
            action: 'travel.request.submitted',
            target: `${reference} · ${trip.destinationCity}`,
            detail: `Est. AED ${trip.totalEstimatedAed.toLocaleString()} (${trip.days}d)`,
          });
          return {
            ok: true,
            message: `Travel request ${reference} sent for pre-approval.`,
            tripId: trip.id,
          };
        },

        decideTravel(tripId, decision, note, issueVirtualCard = true) {
          const ctx = viewer();
          const state = get();
          const trip = state.trips.find((t) => t.id === tripId);
          const requester = hub().users.find((u) => u.id === trip?.userId);
          const gate = access.canDecideTrip(ctx?.v ?? null, trip, requester);
          if (!ctx || !trip || !gate.ok) {
            audit({
              action: 'travel.request.decide_denied',
              target: trip?.reference ?? tripId,
              detail: gate.ok ? 'Not found' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Travel request not found.' : gate.reason);
          }
          if ((decision === 'rejected' || decision === 'changes_requested') && (!note || note.trim().length < 4)) {
            return fail('Include a brief note explaining what should change.');
          }

          const now = Date.now();
          const last4 = String(4100 + ((trip.reference.charCodeAt(trip.reference.length - 1) * 37) % 5800));
          const virtualCard =
            decision === 'approved' && issueVirtualCard
              ? {
                  last4,
                  limitAed: Math.ceil(trip.totalEstimatedAed / 500) * 500,
                  spentAed: 0,
                  activeFrom: trip.departureDate,
                  activeTo: trip.returnDate,
                }
              : trip.virtualCard;

          set((s) => ({
            trips: s.trips.map((t) =>
              t.id === trip.id
                ? {
                    ...t,
                    status: decision,
                    approverId: ctx.user.id,
                    approvedAt: decision === 'approved' ? now : t.approvedAt,
                    decisionNote: note?.trim() || undefined,
                    virtualCard,
                    updatedAt: now,
                  }
                : t,
            ),
          }));

          notify([trip.userId], {
            kind: 'request',
            title:
              decision === 'approved'
                ? `Trip to ${trip.destinationCity} pre-approved ✈️`
                : decision === 'changes_requested'
                  ? `Revision requested on ${trip.reference}`
                  : `Travel request ${trip.reference} declined`,
            body:
              decision === 'approved'
                ? `${ctx.user.name} approved your budget (AED ${trip.totalEstimatedAed.toLocaleString()})${virtualCard ? ` · Virtual Card •••• ${virtualCard.last4} ready` : ''}.`
                : note?.trim() ?? '',
            link: '/expenses/travel',
          });

          audit({
            action: `travel.request.${decision}`,
            target: `${trip.reference} · ${requester?.name ?? trip.userId}`,
            detail: note?.trim() || `Budget AED ${trip.totalEstimatedAed.toLocaleString()}`,
          });

          return ok(
            decision === 'approved'
              ? `Approved ${trip.reference}${virtualCard ? ` & issued Virtual Card •••• ${virtualCard.last4}` : ''}.`
              : `Updated ${trip.reference}.`,
          );
        },

        bookTravelItinerary(tripId, input) {
          const ctx = viewer();
          const trip = get().trips.find((t) => t.id === tripId);
          if (!ctx || !trip) return fail('Trip not found.');
          if (trip.userId !== ctx.user.id && !access.canAuditExpenses(ctx.v)) {
            return fail('Only the traveller or Finance/Travel Desk can confirm bookings.');
          }
          if (trip.status !== 'approved' && trip.status !== 'booked') {
            return fail('Trip must be pre-approved before confirming flight & hotel bookings.');
          }
          const now = Date.now();
          const virtualCard = trip.virtualCard ?? {
            last4: '5290',
            limitAed: Math.ceil(trip.totalEstimatedAed / 500) * 500,
            spentAed: 0,
            activeFrom: trip.departureDate,
            activeTo: trip.returnDate,
          };
          set((s) => ({
            trips: s.trips.map((t) =>
              t.id === trip.id
                ? {
                    ...t,
                    status: 'booked',
                    virtualCard,
                    itinerary: {
                      airline: input.airline.trim() || 'Emirates · EK001',
                      flightBookingRef: input.flightBookingRef.trim().toUpperCase() || 'HX-PNR9',
                      hotelName: input.hotelName.trim() || `${trip.destinationCity} Partner Hotel`,
                      hotelConfirmation: input.hotelConfirmation.trim().toUpperCase() || 'HTL-8821',
                      bookedAt: now,
                      dutyOfCareCheckIn: true,
                    },
                    updatedAt: now,
                  }
                : t,
            ),
          }));
          audit({
            action: 'travel.itinerary.booked',
            target: `${trip.reference} · ${trip.destinationCity}`,
            detail: `${input.airline} (${input.flightBookingRef})`,
          });
          return ok(`Itinerary confirmed for ${trip.destinationCity} · Duty-of-care active.`);
        },

        completeTrip(tripId) {
          const ctx = viewer();
          const trip = get().trips.find((t) => t.id === tripId);
          if (!ctx || !trip) return fail('Trip not found.');
          if (trip.userId !== ctx.user.id && !access.canAuditExpenses(ctx.v)) {
            return fail('Only the traveller or Finance can mark this trip completed.');
          }
          set((s) => ({
            trips: s.trips.map((t) => (t.id === trip.id ? { ...t, status: 'completed', updatedAt: Date.now() } : t)),
          }));
          return ok(`Marked ${trip.destinationCity} trip completed — ready to submit expenses.`);
        },

        uploadReceipt(input) {
          const ctx = viewer();
          if (!ctx || !access.canUseExpenses(ctx.v)) {
            return fail('Expenses access required to upload receipts.');
          }
          const merchant = input.merchant.trim();
          if (merchant.length < 2) return fail('Enter the merchant name.');
          if (!(input.originalAmount > 0)) return fail('Receipt amount must be greater than zero.');
          if (!input.date) return fail('Select the receipt date.');

          const { fxRate, amountAed } = convertToAed(input.originalAmount, input.currency);
          const vatAed = round2(input.vatAed ?? (input.currency === 'AED' && input.category !== 'flights' ? amountAed * 0.05 : 0));
          const myReceipts = get().receipts.filter((r) => r.userId === ctx.user.id);
          const warnings = evaluateReceiptWarnings({
            category: input.category,
            amountAed,
            hasFile: !!input.fileName?.trim() || input.category === 'per_diem',
            existingReceipts: myReceipts,
            merchant,
            date: input.date,
          });

          const receipt: ReceiptItem = {
            id: uid('rcp'),
            userId: ctx.user.id,
            tripId: input.tripId || undefined,
            merchant,
            category: input.category,
            date: input.date,
            currency: input.currency,
            originalAmount: round2(input.originalAmount),
            fxRateToAed: fxRate,
            amountAed,
            vatAed,
            paymentMethod: input.paymentMethod,
            fileName: input.fileName?.trim() || undefined,
            ocrConfidence: input.ocrConfidence ?? 96,
            notes: input.notes?.trim() || undefined,
            attendees: input.attendees?.trim() || undefined,
            glCode: CATEGORY_META[input.category].glCode,
            warnings,
            createdAt: Date.now(),
          };

          set((s) => ({
            receipts: [receipt, ...s.receipts],
            trips:
              input.tripId && input.paymentMethod === 'corporate_card'
                ? s.trips.map((t) =>
                    t.id === input.tripId && t.virtualCard
                      ? {
                          ...t,
                          virtualCard: {
                            ...t.virtualCard,
                            spentAed: round2(t.virtualCard.spentAed + amountAed),
                          },
                        }
                      : t,
                  )
                : s.trips,
          }));

          return {
            ok: true,
            message: `Receipt saved (AED ${amountAed.toLocaleString()})${warnings.length ? ` · ${warnings.length} policy note` : ''}.`,
            receiptId: receipt.id,
          };
        },

        generateTripPerDiemReceipt(tripId) {
          const ctx = viewer();
          const state = get();
          const trip = state.trips.find((t) => t.id === tripId);
          if (!ctx || !trip || trip.userId !== ctx.user.id) {
            return fail('Select one of your approved trips to calculate per diem.');
          }
          const existing = state.receipts.find((r) => r.tripId === trip.id && r.category === 'per_diem');
          if (existing) {
            return { ok: true, message: 'Per-diem allowance is already in your Receipt Vault.', receiptId: existing.id };
          }
          const amountAed = round2(trip.days * trip.perDiemRateAed);
          const item: ReceiptItem = {
            id: uid('rcp'),
            userId: ctx.user.id,
            tripId: trip.id,
            merchant: `${trip.destinationCity} Per Diem (${trip.days}d × AED ${trip.perDiemRateAed})`,
            category: 'per_diem',
            date: trip.returnDate,
            currency: 'AED',
            originalAmount: amountAed,
            fxRateToAed: 1,
            amountAed,
            vatAed: 0,
            paymentMethod: 'personal_reimbursable',
            ocrConfidence: 100,
            notes: `Auto-calculated statutory per diem for ${trip.reference}`,
            glCode: CATEGORY_META.per_diem.glCode,
            warnings: [],
            createdAt: Date.now(),
          };
          set((s) => ({ receipts: [item, ...s.receipts] }));
          return {
            ok: true,
            message: `Added ${trip.days}-day per diem (AED ${amountAed.toLocaleString()}) to Receipt Vault.`,
            receiptId: item.id,
          };
        },

        deleteReceipt(receiptId) {
          const ctx = viewer();
          const r = get().receipts.find((x) => x.id === receiptId);
          if (!ctx || !r || r.userId !== ctx.user.id) return fail('Receipt not found.');
          if (r.reportId) {
            const rep = get().reports.find((rp) => rp.id === r.reportId);
            if (rep && rep.status !== 'draft' && rep.status !== 'changes_requested') {
              return fail('Receipts attached to an active or settled report cannot be deleted.');
            }
          }
          set((s) => ({ receipts: s.receipts.filter((x) => x.id !== receiptId) }));
          return ok('Receipt removed from vault.');
        },

        createAndSubmitReport(input) {
          const ctx = viewer();
          if (!ctx || !access.canUseExpenses(ctx.v)) {
            return fail('Expenses access required.');
          }
          const title = input.title.trim();
          if (title.length < 4) return fail('Give your expense report a clear title.');

          let candidateIds = [...new Set(input.receiptIds)];
          if (input.tripId && input.includeTripPerDiem) {
            const pd = get().generateTripPerDiemReceipt(input.tripId);
            if (pd.ok && pd.receiptId && !candidateIds.includes(pd.receiptId)) {
              candidateIds = [...candidateIds, pd.receiptId];
            }
          }

          const state = get();
          const chosen = state.receipts.filter(
            (r) => r.userId === ctx.user.id && candidateIds.includes(r.id) && !r.reportId,
          );
          if (!chosen.length) {
            return fail('Select at least one unsubmitted receipt (or include trip per diem) to create a report.');
          }

          const totalSpendAed = round2(chosen.reduce((s, r) => s + r.amountAed, 0));
          const corporateCardAed = round2(
            chosen.filter((r) => r.paymentMethod === 'corporate_card').reduce((s, r) => s + r.amountAed, 0),
          );
          const reimbursableAed = round2(totalSpendAed - corporateCardAed);
          const vatTotalAed = round2(chosen.reduce((s, r) => s + r.vatAed, 0));
          const now = Date.now();
          const seq = 106 + state.reports.length;
          const reference = `HX-EXP-${new Date(now).getFullYear()}-${String(seq).padStart(4, '0')}`;
          const reportId = uid('rep');
          const status = input.submitNow ? 'submitted' : 'draft';

          const report: ExpenseReport = {
            id: reportId,
            reference,
            userId: ctx.user.id,
            department: ctx.user.department,
            title,
            tripId: input.tripId || undefined,
            costCenter: DEPT_COST_CENTER[ctx.user.department],
            receiptIds: chosen.map((r) => r.id),
            totalSpendAed,
            corporateCardAed,
            reimbursableAed,
            vatTotalAed,
            status,
            submittedAt: input.submitNow ? now : undefined,
            history: [
              { at: now, actorId: ctx.user.id, action: 'created' },
              ...(input.submitNow
                ? [{ at: now + 1, actorId: ctx.user.id, action: 'submitted' as const, note: input.note?.trim() || undefined }]
                : []),
            ],
            createdAt: now,
            updatedAt: now,
          };

          const chosenSet = new Set(report.receiptIds);
          set((s) => ({
            reports: [report, ...s.reports],
            receipts: s.receipts.map((r) => (chosenSet.has(r.id) ? { ...r, reportId } : r)),
            trips: input.tripId
              ? s.trips.map((t) =>
                  t.id === input.tripId
                    ? { ...t, linkedReportId: reportId, status: t.status === 'booked' ? 'completed' : t.status, updatedAt: now }
                    : t,
                )
              : s.trips,
          }));

          if (input.submitNow) {
            const approverId = ctx.user.managerId ?? 'u-daniel';
            notify([approverId], {
              kind: 'request',
              title: `Expense report submitted · ${ctx.user.name}`,
              body: `${reference} · AED ${reimbursableAed.toLocaleString()} reimbursable (${chosen.length} item${chosen.length === 1 ? '' : 's'})`,
              link: '/expenses/approvals',
            });
            audit({
              action: 'expenses.report.submitted',
              target: `${reference} · ${title}`,
              detail: `Total AED ${totalSpendAed.toLocaleString()} · Reimbursable AED ${reimbursableAed.toLocaleString()}`,
            });
          }

          return {
            ok: true,
            message: input.submitNow
              ? `Submitted ${reference} (AED ${reimbursableAed.toLocaleString()} reimbursable) to your manager.`
              : `Saved draft ${reference}.`,
            reportId,
          };
        },

        submitDraftReport(reportId, note) {
          const ctx = viewer();
          const report = get().reports.find((r) => r.id === reportId);
          if (!ctx || !report || report.userId !== ctx.user.id) return fail('Report not found.');
          if (report.status !== 'draft' && report.status !== 'changes_requested') {
            return fail('This report has already been submitted.');
          }
          const now = Date.now();
          set((s) => ({
            reports: s.reports.map((r) =>
              r.id === report.id
                ? {
                    ...r,
                    status: 'submitted',
                    submittedAt: now,
                    updatedAt: now,
                    history: [...r.history, { at: now, actorId: ctx.user.id, action: 'submitted', note: note?.trim() || undefined }],
                  }
                : r,
            ),
          }));
          notify([ctx.user.managerId ?? 'u-daniel'], {
            kind: 'request',
            title: `Expense report submitted · ${ctx.user.name}`,
            body: `${report.reference} · AED ${report.reimbursableAed.toLocaleString()}`,
            link: '/expenses/approvals',
          });
          return ok(`Submitted ${report.reference} for manager review.`);
        },

        managerDecideReport(reportId, decision, note) {
          const ctx = viewer();
          const state = get();
          const report = state.reports.find((r) => r.id === reportId);
          const requester = hub().users.find((u) => u.id === report?.userId);
          const gate = access.canManagerDecideReport(ctx?.v ?? null, report, requester);
          if (!ctx || !report || !gate.ok) {
            audit({
              action: 'expenses.report.manager_denied',
              target: report?.reference ?? reportId,
              detail: gate.ok ? 'Not found' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Report not found.' : gate.reason);
          }
          if (decision !== 'manager_approved' && (!note || note.trim().length < 4)) {
            return fail('Add a brief review note so the employee knows what to adjust.');
          }
          const now = Date.now();
          set((s) => ({
            reports: s.reports.map((r) =>
              r.id === report.id
                ? {
                    ...r,
                    status: decision,
                    managerReviewerId: ctx.user.id,
                    managerDecidedAt: now,
                    reviewNote: note?.trim() || r.reviewNote,
                    updatedAt: now,
                    history: [
                      ...r.history,
                      {
                        at: now,
                        actorId: ctx.user.id,
                        action: decision,
                        note: note?.trim() || undefined,
                      },
                    ],
                  }
                : r,
            ),
          }));

          if (decision === 'manager_approved') {
            notify(['u-daniel'], {
              kind: 'request',
              title: `Finance audit ready · ${report.reference}`,
              body: `${requester?.name ?? report.userId} · AED ${report.reimbursableAed.toLocaleString()} ready to queue for payroll.`,
              link: '/expenses/approvals',
            });
            notify([report.userId], {
              kind: 'request',
              title: `Manager approved ${report.reference}`,
              body: `${ctx.user.name} approved your expenses — now with Finance to queue for payroll.`,
              link: '/expenses/reimbursements',
            });
          } else {
            notify([report.userId], {
              kind: 'request',
              title: `Update on ${report.reference}`,
              body: note?.trim() ?? '',
              link: '/expenses/reports',
            });
          }

          audit({
            action: `expenses.report.${decision}`,
            target: `${report.reference} · ${requester?.name ?? report.userId}`,
            detail: `AED ${report.reimbursableAed.toLocaleString()}${note ? ` — ${note.trim()}` : ''}`,
          });

          return ok(
            decision === 'manager_approved'
              ? `Approved ${report.reference} — routed to Finance Audit.`
              : `Updated ${report.reference}.`,
          );
        },

        financeAuditReport(reportId, decision, payrollPeriod, note) {
          const ctx = viewer();
          const state = get();
          const report = state.reports.find((r) => r.id === reportId);
          const gate = access.canFinanceAuditReport(ctx?.v ?? null, report);
          if (!ctx || !report || !gate.ok) {
            audit({
              action: 'expenses.report.audit_denied',
              target: report?.reference ?? reportId,
              detail: gate.ok ? 'Not found' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Report not found.' : gate.reason);
          }
          if (decision !== 'payroll_queued' && (!note || note.trim().length < 4)) {
            return fail('Include an audit note explaining what needs attention.');
          }
          const now = Date.now();
          const targetPeriod = decision === 'payroll_queued' ? payrollPeriod || defaultPayrollPeriod(now) : undefined;

          set((s) => ({
            reports: s.reports.map((r) =>
              r.id === report.id
                ? {
                    ...r,
                    status: decision,
                    financeReviewerId: ctx.user.id,
                    financeQueuedAt: decision === 'payroll_queued' ? now : undefined,
                    payrollPeriod: targetPeriod,
                    reviewNote: note?.trim() || r.reviewNote,
                    updatedAt: now,
                    history: [
                      ...r.history,
                      {
                        at: now,
                        actorId: ctx.user.id,
                        action: decision === 'payroll_queued' ? 'finance_queued' : decision,
                        note:
                          note?.trim() ||
                          (targetPeriod ? `Audited & queued into ${targetPeriod} payroll run.` : undefined),
                      },
                    ],
                  }
                : r,
            ),
          }));

          notify([report.userId], {
            kind: 'request',
            title:
              decision === 'payroll_queued'
                ? `${report.reference} queued for ${targetPeriod} payroll 💸`
                : `Finance review note on ${report.reference}`,
            body:
              decision === 'payroll_queued'
                ? `AED ${report.reimbursableAed.toLocaleString()} verified by Finance and scheduled for your ${targetPeriod} payout.`
                : note?.trim() ?? '',
            link: '/expenses/reimbursements',
          });

          audit({
            action: decision === 'payroll_queued' ? 'expenses.report.payroll_queued' : `expenses.report.${decision}`,
            target: `${report.reference} · AED ${report.reimbursableAed.toLocaleString()}`,
            detail: targetPeriod ? `Queued for ${targetPeriod} payroll` : note?.trim(),
          });

          // Let Payroll Console refresh its draft run totals if loaded
          if (decision === 'payroll_queued') {
            void import('@/payroll/store').then((m) => m.usePayroll.getState().syncActiveRun());
          }

          return ok(
            decision === 'payroll_queued'
              ? `Queued ${report.reference} (AED ${report.reimbursableAed.toLocaleString()}) into ${targetPeriod} payroll!`
              : `Returned ${report.reference} with audit note.`,
          );
        },

        markReportsReimbursedByPayroll(period, payrollRunId, paymentRefPrefix) {
          const state = get();
          const eligible = state.reports.filter(
            (r) => r.status === 'payroll_queued' && (!r.payrollPeriod || r.payrollPeriod <= period),
          );
          if (!eligible.length) return 0;
          const now = Date.now();
          const actorId = hub().sessionUserId ?? 'u-daniel';
          const eligibleIds = new Set(eligible.map((r) => r.id));

          set((s) => ({
            reports: s.reports.map((r, idx) =>
              eligibleIds.has(r.id)
                ? {
                    ...r,
                    status: 'reimbursed',
                    payrollPeriod: period,
                    payrollRunId,
                    reimbursedAt: now,
                    paymentRef: `${paymentRefPrefix}-${String(idx + 1).padStart(4, '0')}`,
                    updatedAt: now,
                    history: [
                      ...r.history,
                      {
                        at: now,
                        actorId,
                        action: 'reimbursed',
                        note: `Settled via Payroll Console run ${period} (${paymentRefPrefix}).`,
                      },
                    ],
                  }
                : r,
            ),
          }));

          for (const rep of eligible) {
            notify([rep.userId], {
              kind: 'request',
              title: `Expense reimbursed · AED ${rep.reimbursableAed.toLocaleString()} 🎉`,
              body: `${rep.reference} was paid in the ${period} payroll run and added to your HR Portal payslip.`,
              link: '/expenses/reimbursements',
            });
          }
          return eligible.length;
        },

        disburseExpressReimbursement(reportId) {
          const ctx = viewer();
          const report = get().reports.find((r) => r.id === reportId);
          if (!ctx || !access.canAuditExpenses(ctx.v)) {
            return fail('Express off-cycle payout requires Finance (`expenses.audit`) permission.');
          }
          if (!report || report.status !== 'payroll_queued') {
            return fail('Report must pass Finance audit (`payroll_queued`) before express payout.');
          }
          if (report.userId === ctx.user.id && !effectivePermissions(ctx.user, hub().roles).has('*')) {
            return fail('Separation of duties: another Finance approver must disburse your own reimbursement.');
          }
          const now = Date.now();
          const period = report.payrollPeriod ?? defaultPayrollPeriod(now);
          const paymentRef = `EXP-FAST-${period}-${report.reference.slice(-4)}`;

          set((s) => ({
            reports: s.reports.map((r) =>
              r.id === report.id
                ? {
                    ...r,
                    status: 'reimbursed',
                    payrollPeriod: period,
                    reimbursedAt: now,
                    paymentRef,
                    updatedAt: now,
                    history: [
                      ...r.history,
                      {
                        at: now,
                        actorId: ctx.user.id,
                        action: 'reimbursed',
                        note: `Express off-cycle wire transfer (${paymentRef}).`,
                      },
                    ],
                  }
                : r,
            ),
          }));

          notify([report.userId], {
            kind: 'request',
            title: `Express reimbursement sent · AED ${report.reimbursableAed.toLocaleString()}`,
            body: `${report.reference} disbursed via instant wire (${paymentRef}).`,
            link: '/expenses/reimbursements',
          });
          audit({
            action: 'expenses.report.express_paid',
            target: `${report.reference} · AED ${report.reimbursableAed.toLocaleString()}`,
            detail: paymentRef,
          });
          void import('@/payroll/store').then((m) => m.usePayroll.getState().syncActiveRun());
          return ok(`Sent express payout ${paymentRef} (AED ${report.reimbursableAed.toLocaleString()}).`);
        },

        resetExpensesDemo() {
          set(buildExpensesSeed());
        },
      };
    },
    {
      name: 'nexus-expenses',
      version: EXPENSES_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ExpensesData => ({
        version: s.version,
        trips: s.trips,
        receipts: s.receipts,
        reports: s.reports,
      }),
      migrate: (persisted, version) =>
        version === EXPENSES_DATA_VERSION ? (persisted as ExpensesData) : buildExpensesSeed(),
    },
  ),
);
