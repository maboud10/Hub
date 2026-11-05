/**
 * Persisted Zustand store for Helix Payroll Console (`nexus-payroll`).
 * Bridges HR Portal (`useHr` comp, leave, benefit claims, payslips) and
 * Travel & Expenses (`useExpenses` queued expense reports) into a single
 * four-eyes monthly Payday & Variable Pay workflow.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { uid } from '@/lib/id';
import { useHub } from '@/store/hub';
import { useHr } from '@/hr/store';
import { useExpenses } from '@/expenses/store';
import * as access from './access';
import { buildPayrollRunForPeriod, periodFromTimestamp } from './engine';
import { createPayrollSeed } from './seed';
import {
  PAYROLL_DATA_VERSION,
  type BonusKind,
  type CompAdjustmentRecord,
  type ManualLineAdjustment,
  type PayrollData,
  type PayrollRun,
} from './types';

export interface NominateBonusInput {
  userId: string;
  kind: BonusKind;
  title: string;
  reason: string;
  amountAed: number;
  payrollPeriod?: string;
}

export interface PayrollActions {
  /** Recompute non-paid runs from live HR Comp, Leave, BenefitClaims, ExpenseReports & Bonuses. */
  syncActiveRun(): void;
  /** Add or clear a one-off line adjustment on an open run (`draft` or `pending_signoff`). */
  setLineAdjustment(period: string, userId: string, amountAed: number, note: string): ActionResult;
  /** Step 1 -> Step 2: Preparer submits draft run for four-eyes sign-off. */
  submitRunForSignoff(period: string): ActionResult;
  /** Step 2 -> Step 3: Counter-signer (different from `preparedBy`) approves run for WPS release. */
  approvePayRun(period: string, note?: string): ActionResult;
  /** Return a pending/approved (not yet paid) run back to `draft` for edits. */
  reopenRunToDraft(period: string): ActionResult;
  /**
   * Step 3 -> Step 4 (Payday!): Disburses WPS batch, flips all queued Travel & Expense
   * reports to `reimbursed`, marks HR BenefitClaims as `paid`, marks queued Bonuses as `paid`,
   * and publishes official payslips to every employee's HR Portal!
   */
  disbursePayRun(period: string): ActionResult & { settledExpenses?: number; settledBonuses?: number };
  /** Nominate an employee for a Spot, Performance, Signing, Milestone, or Retention bonus. */
  nominateBonus(input: NominateBonusInput): ActionResult & { bonusId?: string };
  /** Approve (and queue for payroll) or decline a pending bonus nomination (enforces separation of duties). */
  decideBonus(
    bonusId: string,
    decision: 'approved_queued' | 'declined',
    payrollPeriod?: string,
    note?: string,
  ): ActionResult;
  /** Adjust an employee's monthly base salary in `useHr` and record an auditable comp change. */
  adjustBaseCompensation(userId: string, newBaseLocal: number, reason: string): ActionResult;
  resetPayrollDemo(): void;
}

export type PayrollStore = PayrollData & PayrollActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const round2 = (n: number) => Math.round(n * 100) / 100;

export const usePayroll = create<PayrollStore>()(
  persist(
    (set, get) => {
      const hub = () => useHub.getState();

      const viewer = (): { user: User; v: access.PayrollViewer } | null => {
        const h = hub();
        const user = h.users.find((u) => u.id === h.sessionUserId) ?? null;
        const v = access.buildPayrollViewer(user, h.roles);
        return user && v ? { user, v } : null;
      };

      const audit = (entry: {
        action: string;
        target: string;
        detail?: string;
        outcome?: 'success' | 'denied';
        severity?: 'info' | 'warning' | 'critical';
      }) => {
        hub().logAudit({
          outcome: 'success',
          severity: 'info',
          ...entry,
        });
      };

      const notify = (
        userIds: string[],
        n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read'>,
      ) => {
        hub().pushNotifications(userIds, n);
      };

      const buildSeed = () => createPayrollSeed(Date.now(), hub().users);

      const recomputeRuns = (
        runs: PayrollRun[],
        bonuses = get().bonuses,
        manualAdjustments = get().manualAdjustments,
      ): PayrollRun[] => {
        const h = hub();
        const hr = useHr.getState();
        const exp = useExpenses.getState();
        const currentPeriod = periodFromTimestamp(Date.now(), 0);

        const hasCurrent = runs.some((r) => r.period === currentPeriod);
        const baseList: PayrollRun[] = hasCurrent
          ? runs
          : [
              buildPayrollRunForPeriod({
                period: currentPeriod,
                users: h.users,
                comp: hr.comp,
                leave: hr.leave,
                claims: hr.claims,
                elections: hr.elections,
                expenseReports: exp.reports,
                bonuses,
                manualAdjustments,
                status: 'draft',
              }),
              ...runs,
            ];

        return baseList
          .map((r) => {
            if (r.status === 'paid') return r;
            return buildPayrollRunForPeriod({
              period: r.period,
              users: h.users,
              comp: hr.comp,
              leave: hr.leave,
              claims: hr.claims,
              elections: hr.elections,
              expenseReports: exp.reports,
              bonuses,
              manualAdjustments,
              status: r.status,
              existingMeta: r,
            });
          })
          .sort((a, b) => b.period.localeCompare(a.period));
      };

      return {
        ...buildSeed(),

        syncActiveRun() {
          set((s) => ({
            runs: recomputeRuns(s.runs, s.bonuses, s.manualAdjustments),
          }));
        },

        setLineAdjustment(period, userId, amountAed, note) {
          const ctx = viewer();
          if (!ctx || !access.canRunPayroll(ctx.v)) {
            return fail('Editing pay-run adjustments requires `payroll.run` permission.');
          }
          const run = get().runs.find((r) => r.period === period);
          if (!run) return fail('Pay run not found.');
          if (run.status === 'paid' || run.status === 'approved_ready') {
            return fail('Reopen the pay run to draft before changing line adjustments.');
          }
          const cleanNote = note.trim();
          if (amountAed !== 0 && cleanNote.length < 3) {
            return fail('Add a short audit reason for this payroll adjustment.');
          }

          const now = Date.now();
          const filtered = get().manualAdjustments.filter(
            (m) => !(m.period === period && m.userId === userId),
          );
          const nextAdjustments: ManualLineAdjustment[] =
            amountAed === 0
              ? filtered
              : [
                  ...filtered,
                  {
                    period,
                    userId,
                    amountAed: round2(amountAed),
                    note: cleanNote,
                    updatedBy: ctx.user.id,
                    updatedAt: now,
                  },
                ];

          set((s) => ({
            manualAdjustments: nextAdjustments,
            runs: recomputeRuns(s.runs, s.bonuses, nextAdjustments),
          }));

          const empName = hub().users.find((u) => u.id === userId)?.name ?? userId;
          audit({
            action: 'payroll.line.adjusted',
            target: `${period} · ${empName}`,
            detail:
              amountAed === 0
                ? 'Cleared manual adjustment'
                : `${amountAed > 0 ? '+' : '−'}AED ${Math.abs(amountAed).toLocaleString()} (${cleanNote})`,
          });

          return ok(
            amountAed === 0
              ? `Cleared adjustment for ${empName}.`
              : `Applied ${amountAed > 0 ? '+' : '−'}AED ${Math.abs(amountAed).toLocaleString()} adjustment for ${empName}.`,
          );
        },

        submitRunForSignoff(period) {
          const ctx = viewer();
          if (!ctx || !access.canRunPayroll(ctx.v)) {
            return fail('Preparing payroll requires `payroll.run` permission.');
          }
          get().syncActiveRun();
          const run = get().runs.find((r) => r.period === period);
          if (!run) return fail('Pay run not found.');
          if (run.status !== 'draft') {
            return fail('Only a draft pay run can be submitted for sign-off.');
          }

          const now = Date.now();
          set((s) => ({
            runs: s.runs.map((r) =>
              r.period === period
                ? {
                    ...r,
                    status: 'pending_signoff',
                    preparedBy: ctx.user.id,
                    preparedAt: now,
                    updatedAt: now,
                  }
                : r,
            ),
          }));

          const counterSigners = ['u-sara', 'u-daniel', 'u-layla'].filter(
            (id) => id !== ctx.user.id,
          );
          notify(counterSigners, {
            kind: 'hr',
            title: `Payroll sign-off needed · ${run.label}`,
            body: `${ctx.user.name} prepared ${run.headcount} payslips totaling AED ${Math.round(run.totalNetAed).toLocaleString()} net.`,
            link: '/payroll',
          });

          audit({
            action: 'payroll.run.submitted',
            target: `${run.id} · ${run.label}`,
            detail: `${run.headcount} employees · Net AED ${run.totalNetAed.toLocaleString()}`,
          });

          return ok(
            `Submitted ${run.label} payroll (AED ${Math.round(run.totalNetAed).toLocaleString()} net) for four-eyes sign-off.`,
          );
        },

        approvePayRun(period, note) {
          const ctx = viewer();
          const run = get().runs.find((r) => r.period === period);
          const gate = access.canCounterSignRun(ctx?.v ?? null, run);
          if (!ctx || !run || !gate.ok) {
            audit({
              action: 'payroll.run.signoff_denied',
              target: run?.id ?? period,
              detail: gate.ok ? 'Not found' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Pay run not found.' : gate.reason);
          }

          const now = Date.now();
          set((s) => ({
            runs: s.runs.map((r) =>
              r.period === period
                ? {
                    ...r,
                    status: 'approved_ready',
                    approvedBy: ctx.user.id,
                    approvedAt: now,
                    approvalNote: note?.trim() || 'Four-eyes payroll & variance audit verified.',
                    updatedAt: now,
                  }
                : r,
            ),
          }));

          if (run.preparedBy && run.preparedBy !== ctx.user.id) {
            notify([run.preparedBy], {
              kind: 'hr',
              title: `${run.label} pay run counter-signed ✓`,
              body: `${ctx.user.name} approved the ${run.label} run — ready for WPS bank release.`,
              link: '/payroll',
            });
          }

          audit({
            action: 'payroll.run.approved',
            target: `${run.id} · ${run.label}`,
            detail: `Counter-signed by ${ctx.user.name}${note ? ` — ${note.trim()}` : ''}`,
            severity: 'critical',
          });

          return ok(`Counter-signed ${run.label}! Ready for WPS bank file release & disbursement.`);
        },

        reopenRunToDraft(period) {
          const ctx = viewer();
          if (!ctx || (!access.canRunPayroll(ctx.v) && !access.canApprovePayroll(ctx.v))) {
            return fail('Permission denied.');
          }
          const run = get().runs.find((r) => r.period === period);
          if (!run) return fail('Pay run not found.');
          if (run.status === 'paid') {
            return fail('Settled pay runs are locked for audit integrity.');
          }
          const now = Date.now();
          set((s) => ({
            runs: recomputeRuns(
              s.runs.map((r) =>
                r.period === period
                  ? {
                      ...r,
                      status: 'draft',
                      approvedBy: undefined,
                      approvedAt: undefined,
                      approvalNote: undefined,
                      updatedAt: now,
                    }
                  : r,
              ),
              s.bonuses,
              s.manualAdjustments,
            ),
          }));
          return ok(`Reopened ${run.label} pay run to draft.`);
        },

        disbursePayRun(period) {
          const ctx = viewer();
          const run = get().runs.find((r) => r.period === period);
          const gate = access.canDisburseRun(ctx?.v ?? null, run);
          if (!ctx || !run || !gate.ok) {
            audit({
              action: 'payroll.run.disburse_denied',
              target: run?.id ?? period,
              detail: gate.ok ? 'Not found' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Pay run not found.' : gate.reason);
          }

          const now = Date.now();
          const wpsBatchRef = `WPS-HX-${period}`;

          // 1. Settle queued Travel & Expense reports in useExpenses
          const settledExpenses = useExpenses
            .getState()
            .markReportsReimbursedByPayroll(period, run.id, wpsBatchRef);

          // 2. Settle approved HR BenefitClaims for this period in useHr
          const hrState = useHr.getState();
          const hasApprovedClaims = hrState.claims.some(
            (cl) => cl.status === 'approved' && (!cl.payrollMonth || cl.payrollMonth <= period),
          );
          if (hasApprovedClaims) {
            useHr.setState((s) => ({
              claims: s.claims.map((cl) =>
                cl.status === 'approved' && (!cl.payrollMonth || cl.payrollMonth <= period)
                  ? { ...cl, status: 'paid', payrollMonth: period }
                  : cl,
              ),
            }));
          }

          // 3. Mark queued Bonuses for this period as paid
          const eligibleBonusIds = new Set(
            get()
              .bonuses.filter((b) => b.status === 'approved_queued' && b.payrollPeriod === period)
              .map((b) => b.id),
          );
          const nextBonuses = get().bonuses.map((b) =>
            eligibleBonusIds.has(b.id)
              ? { ...b, status: 'paid' as const, paidRunId: run.id, paidAt: now }
              : b,
          );

          // 4. Freeze final paid PayrollRun snapshot with settled items
          const updatedHr = useHr.getState();
          const updatedExp = useExpenses.getState();
          const settledRun = buildPayrollRunForPeriod({
            period,
            users: hub().users,
            comp: updatedHr.comp,
            leave: updatedHr.leave,
            claims: updatedHr.claims,
            elections: updatedHr.elections,
            expenseReports: updatedExp.reports,
            bonuses: nextBonuses,
            manualAdjustments: get().manualAdjustments,
            status: 'paid',
            existingMeta: {
              ...run,
              status: 'paid',
              disbursedBy: ctx.user.id,
              disbursedAt: now,
              wpsBatchRef,
              updatedAt: now,
            },
            now,
          });

          set((s) => ({
            bonuses: nextBonuses,
            runs: s.runs.map((r) => (r.period === period ? settledRun : r)),
          }));

          // Notify paid employees that their payslip is live in HR Portal!
          notify(
            settledRun.lines.map((l) => l.userId),
            {
              kind: 'hr',
              title: `Payday! Your ${settledRun.label} payslip is ready 🎉`,
              body: `Salary, approved bonuses, and reimbursements have been disbursed (${wpsBatchRef}).`,
              link: '/hr/documents?tab=payslips',
            },
          );

          audit({
            action: 'payroll.run.disbursed',
            target: `${settledRun.id} · ${wpsBatchRef}`,
            detail: `${settledRun.headcount} employees · Net AED ${settledRun.totalNetAed.toLocaleString()} · ${settledExpenses} T&E claims settled · ${eligibleBonusIds.size} bonuses paid`,
            severity: 'critical',
          });

          return {
            ok: true,
            message: `Disbursed ${settledRun.label} (${wpsBatchRef}) — AED ${Math.round(settledRun.totalNetAed).toLocaleString()} net paid, ${settledExpenses} expense report${settledExpenses === 1 ? '' : 's'} reimbursed, and official payslips published to HR Portal!`,
            settledExpenses,
            settledBonuses: eligibleBonusIds.size,
          };
        },

        nominateBonus(input) {
          const ctx = viewer();
          if (!ctx || !access.canNominateBonus(ctx.v)) {
            return fail('Nominating bonuses requires manager, People Ops, or Finance access.');
          }
          const recipient = hub().users.find((u) => u.id === input.userId && u.active);
          if (!recipient) return fail('Select an active employee.');
          if (recipient.roleIds.includes('contractor')) {
            return fail('Contractors are compensated via vendor invoices rather than payroll bonuses.');
          }
          const title = input.title.trim();
          const reason = input.reason.trim();
          if (title.length < 4) return fail('Provide a clear bonus title.');
          if (reason.length < 8) return fail('Include a short citation explaining the impact.');
          if (!Number.isFinite(input.amountAed) || input.amountAed <= 0) {
            return fail('Bonus amount must be greater than zero.');
          }

          const now = Date.now();
          const targetPeriod = input.payrollPeriod || periodFromTimestamp(now, 0);
          const seq = 46 + get().bonuses.length;
          const reference = `HX-BON-${new Date(now).getFullYear()}-${String(seq).padStart(4, '0')}`;
          const id = uid('bon');

          // If an approver nominates someone else AND holds `*`, keep pending so four-eyes workflow is visible,
          // or let another approver sign off.
          const bonus = {
            id,
            reference,
            userId: recipient.id,
            department: recipient.department,
            kind: input.kind,
            title,
            reason,
            amountAed: round2(input.amountAed),
            payrollPeriod: targetPeriod,
            status: 'pending_approval' as const,
            nominatedBy: ctx.user.id,
            nominatedAt: now,
          };

          set((s) => ({
            bonuses: [bonus, ...s.bonuses],
          }));

          const approvers = ['u-sara', 'u-daniel', 'u-layla'].filter((uidItem) => uidItem !== ctx.user.id);
          notify(approvers, {
            kind: 'hr',
            title: `Bonus nomination · ${recipient.name}`,
            body: `${reference} · AED ${bonus.amountAed.toLocaleString()} (${title}) nominated by ${ctx.user.name}.`,
            link: '/payroll/bonuses',
          });

          audit({
            action: 'payroll.bonus.nominated',
            target: `${reference} · ${recipient.name}`,
            detail: `AED ${bonus.amountAed.toLocaleString()} (${input.kind}) for ${targetPeriod}`,
          });

          return {
            ok: true,
            message: `Submitted ${reference} (AED ${bonus.amountAed.toLocaleString()} for ${recipient.name}) for four-eyes approval.`,
            bonusId: id,
          };
        },

        decideBonus(bonusId, decision, payrollPeriod, note) {
          const ctx = viewer();
          const bonus = get().bonuses.find((b) => b.id === bonusId);
          const gate = access.canDecideBonus(ctx?.v ?? null, bonus);
          if (!ctx || !bonus || !gate.ok) {
            audit({
              action: 'payroll.bonus.decide_denied',
              target: bonus?.reference ?? bonusId,
              detail: gate.ok ? 'Not found' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Bonus nomination not found.' : gate.reason);
          }

          const now = Date.now();
          const targetPeriod = payrollPeriod || bonus.payrollPeriod || periodFromTimestamp(now, 0);
          const nextBonuses = get().bonuses.map((b) =>
            b.id === bonus.id
              ? {
                  ...b,
                  status: decision,
                  payrollPeriod: targetPeriod,
                  decidedBy: ctx.user.id,
                  decidedAt: now,
                  decisionNote: note?.trim() || undefined,
                }
              : b,
          );

          set((s) => ({
            bonuses: nextBonuses,
            runs: recomputeRuns(s.runs, nextBonuses, s.manualAdjustments),
          }));

          const recipient = hub().users.find((u) => u.id === bonus.userId);
          if (decision === 'approved_queued') {
            notify([bonus.userId, bonus.nominatedBy], {
              kind: 'hr',
              title: `Bonus approved · AED ${bonus.amountAed.toLocaleString()} 🎉`,
              body: `${bonus.title} (${bonus.reference}) is queued for the ${targetPeriod} payroll run.`,
              link: '/hr/documents?tab=payslips',
            });
          } else {
            notify([bonus.nominatedBy], {
              kind: 'hr',
              title: `Update on bonus nomination ${bonus.reference}`,
              body: note?.trim() || 'Declined during compensation review.',
              link: '/payroll/bonuses',
            });
          }

          audit({
            action: `payroll.bonus.${decision}`,
            target: `${bonus.reference} · ${recipient?.name ?? bonus.userId}`,
            detail: `AED ${bonus.amountAed.toLocaleString()} · ${targetPeriod}`,
          });

          return ok(
            decision === 'approved_queued'
              ? `Approved ${bonus.reference} — queued AED ${bonus.amountAed.toLocaleString()} into ${targetPeriod} payroll.`
              : `Declined ${bonus.reference}.`,
          );
        },

        adjustBaseCompensation(userId, newBaseLocal, reason) {
          const ctx = viewer();
          if (!ctx || !access.canApprovePayroll(ctx.v)) {
            return fail('Adjusting base compensation requires `payroll.approve` permission.');
          }
          if (userId === ctx.user.id && !ctx.v.perms.has('*')) {
            return fail('Separation of duties: you cannot adjust your own base salary.');
          }
          const cleanReason = reason.trim();
          if (cleanReason.length < 6) {
            return fail('Include a clear business/band justification for the compensation change.');
          }
          if (!Number.isFinite(newBaseLocal) || newBaseLocal <= 0) {
            return fail('Enter a valid monthly base salary.');
          }

          const hrState = useHr.getState();
          const currentComp = hrState.comp.find((c) => c.userId === userId);
          if (!currentComp) return fail('Compensation record not found for employee.');

          const roundedNew = round2(newBaseLocal);
          if (roundedNew === currentComp.baseMonthly) {
            return fail('New base salary matches current base salary.');
          }

          // Update HR store's CompRecord so HR Portal & Payroll stay 100% synced
          useHr.setState((s) => ({
            comp: s.comp.map((c) =>
              c.userId === userId ? { ...c, baseMonthly: roundedNew } : c,
            ),
          }));

          const now = Date.now();
          const effectivePeriod = periodFromTimestamp(now, 0);
          const rec: CompAdjustmentRecord = {
            id: uid('cadj'),
            userId,
            effectivePeriod,
            previousBaseLocal: currentComp.baseMonthly,
            newBaseLocal: roundedNew,
            currency: currentComp.currency,
            reason: cleanReason,
            actorId: ctx.user.id,
            createdAt: now,
          };

          set((s) => ({
            compHistory: [rec, ...s.compHistory],
            runs: recomputeRuns(s.runs, s.bonuses, s.manualAdjustments),
          }));

          const empName = hub().users.find((u) => u.id === userId)?.name ?? userId;
          notify([userId], {
            kind: 'hr',
            title: 'Compensation update letter available',
            body: `Your monthly basic compensation was updated to ${currentComp.currency} ${roundedNew.toLocaleString()} effective ${effectivePeriod}.`,
            link: '/hr',
          });

          audit({
            action: 'payroll.comp.adjusted',
            target: empName,
            detail: `${currentComp.currency} ${currentComp.baseMonthly.toLocaleString()} → ${roundedNew.toLocaleString()} (${cleanReason})`,
            severity: 'critical',
          });

          return ok(
            `Updated ${empName}'s monthly base to ${currentComp.currency} ${roundedNew.toLocaleString()} and synced active payroll.`,
          );
        },

        resetPayrollDemo() {
          set(buildSeed());
        },
      };
    },
    {
      name: 'nexus-payroll',
      version: PAYROLL_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PayrollData => ({
        version: s.version,
        runs: s.runs,
        bonuses: s.bonuses,
        bands: s.bands,
        manualAdjustments: s.manualAdjustments,
        compHistory: s.compHistory,
      }),
      migrate: (persisted, version) =>
        version === PAYROLL_DATA_VERSION
          ? (persisted as PayrollData)
          : createPayrollSeed(Date.now(), useHub.getState().users),
    },
  ),
);

let initialized = false;
export function initPayroll() {
  if (initialized) {
    usePayroll.getState().syncActiveRun();
    return;
  }
  initialized = true;
  usePayroll.getState().syncActiveRun();
}
