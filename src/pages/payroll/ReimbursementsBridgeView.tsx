/**
 * Reimbursements Bridge — connects Travel & Expenses (`manager_approved` and
 * `payroll_queued` reports) and HR Portal (`approved` benefit allowance claims)
 * into the monthly WPS Pay Run or instant Express Off-Cycle Wire settlement.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  HeartHandshake,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import { canAuditExpenses, canFinanceAuditReport } from '@/expenses/access';
import { useExpenses } from '@/expenses/store';
import { useHr } from '@/hr/store';
import { periodFromTimestamp } from '@/payroll/engine';
import { useLivePayrollRuns, usePayrollViewer, useReimbursementQueueSummary } from '@/payroll/selectors';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { formatDateTime } from '@/lib/format';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoEmpty, NeoKpi, NeoKpis, NeoPanel } from '@/components/neo';
import { ALLOWANCE_LABELS, compactAed, formatAed } from './shared';

export function ReimbursementsBridgeView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const viewer = usePayrollViewer();
  const runs = useLivePayrollRuns();

  const reports = useExpenses((s) => s.reports);
  const financeAuditReport = useExpenses((s) => s.financeAuditReport);
  const disburseExpressReimbursement = useExpenses((s) => s.disburseExpressReimbursement);
  const claims = useHr((s) => s.claims);

  const summary = useReimbursementQueueSummary();
  const [auditNotes, setAuditNotes] = useState<Record<string, string>>({});

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const activePeriod = useMemo(() => runs[0]?.period ?? periodFromTimestamp(Date.now(), 0), [runs]);

  const managerApprovedReports = useMemo(() => reports.filter((r) => r.status === 'manager_approved'), [reports]);
  const managerPendingCount = useMemo(() => reports.filter((r) => r.status === 'submitted').length, [reports]);
  const paidHrClaims = useMemo(() => claims.filter((c) => c.status === 'paid'), [claims]);

  const settledTotalAed = useMemo(
    () =>
      summary.settledExpenses.reduce((s, r) => s + r.reimbursableAed, 0) +
      paidHrClaims.reduce((s, c) => s + c.amount, 0),
    [summary.settledExpenses, paidHrClaims],
  );

  const hasAuditPerm = useMemo(() => canAuditExpenses(viewer), [viewer]);

  const handleQueueReport = (reportId: string) => {
    const note = auditNotes[reportId] || '';
    const res = financeAuditReport(reportId, 'payroll_queued', activePeriod, note);
    toast.result(res, `Queued into ${activePeriod} payroll`);
  };

  const handleExpressWire = (reportId: string) => {
    const res = disburseExpressReimbursement(reportId);
    toast.result(res, 'Express off-cycle wire sent');
  };

  return (
    <div className="py-view">
      {/* Bridge KPI Strip */}
      <NeoKpis label="Reimbursements bridge metrics">
        <NeoKpi
          icon={<ShieldCheck />}
          label="Awaiting finance audit"
          value={managerApprovedReports.length}
          sub={managerPendingCount > 0 ? `+ ${managerPendingCount} in manager review` : 'Ready to queue into payroll'}
          tone={managerApprovedReports.length ? 'warning' : undefined}
        />
        <NeoKpi
          icon={<Receipt />}
          label="Queued T&E reports"
          value={compactAed(summary.queuedExpenseTotalAed)}
          sub={`${summary.queuedExpenses.length} report${summary.queuedExpenses.length === 1 ? '' : 's'} for ${activePeriod}`}
        />
        <NeoKpi
          icon={<HeartHandshake />}
          label="Approved HR claims"
          value={compactAed(summary.approvedHrClaimsTotalAed)}
          sub={`${summary.approvedHrClaims.length} allowance claim${summary.approvedHrClaims.length === 1 ? '' : 's'} synced`}
        />
        <NeoKpi
          icon={<CheckCircle2 />}
          label="Settled reimbursements"
          value={compactAed(settledTotalAed)}
          sub={`${summary.settledExpenses.length} T&E + ${paidHrClaims.length} HR claims paid`}
        />
      </NeoKpis>

      {/* Two-Column Bridge: 1) Awaiting Finance Audit  2) Queued for Monthly Payday */}
      <div className="py-bridge-grid">
        {/* Column 1: Awaiting Finance Audit */}
        <NeoPanel
          hud="Step 1 · Finance audit"
          title="Awaiting finance audit"
          actions={
            <>
              <span className="neo-count">{managerApprovedReports.length}</span>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/expenses/approvals')}>
                T&E desk <ArrowRight />
              </button>
            </>
          }
        >
          <p className="py-panel-sub">
            Manager-approved Travel & Expense reports ready for Finance VAT/GL sign-off into <code>{activePeriod}</code>.
          </p>

          {managerPendingCount > 0 && (
            <div className="py-note" style={{ marginBottom: 12 }}>
              <Receipt />
              <span>
                <b>{managerPendingCount}</b> submitted expense report{managerPendingCount === 1 ? ' is' : 's are'} awaiting line-manager review in{' '}
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/expenses/approvals')}>
                  /expenses/approvals →
                </button>
              </span>
            </div>
          )}

          {managerApprovedReports.length === 0 ? (
            <NeoEmpty
              compact
              icon={<ShieldCheck />}
              title="Finance audit inbox is clear"
              action={
                <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => navigate('/expenses/approvals')}>
                  Open Travel & Expense Desk <ExternalLink />
                </button>
              }
            >
              All manager-approved expense reports have been audited and queued into Payroll.
            </NeoEmpty>
          ) : (
            <div className="py-awards">
              {managerApprovedReports.map((rep) => {
                const emp = userById.get(rep.userId);
                const mgr = rep.managerReviewerId ? userById.get(rep.managerReviewerId) : undefined;
                const gate = canFinanceAuditReport(viewer, rep);

                return (
                  <article key={rep.id} className="py-award">
                    <div className="py-award__head">
                      {emp && <Avatar user={emp} size={36} />}
                      <div className="py-award__who">
                        <div className="py-award__name">
                          <b>{emp?.name ?? rep.userId}</b>
                          <Chip size="sm" tone="slate">
                            {rep.reference}
                          </Chip>
                          <Chip size="sm" tone="cyan">
                            {rep.costCenter}
                          </Chip>
                        </div>
                        <div className="py-award__title" style={{ marginTop: 3 }}>
                          {rep.title}
                        </div>
                        <div className="py-award__meta">
                          {rep.receiptIds.length} receipt{rep.receiptIds.length === 1 ? '' : 's'} · VAT {formatAed(rep.vatTotalAed)}
                          {mgr ? ` · Mgr approved by ${mgr.name}` : ''}
                        </div>
                      </div>
                      <div className="py-award__amt">
                        <b>{formatAed(rep.reimbursableAed)}</b>
                        <span>{rep.corporateCardAed > 0 ? `Corp card ${formatAed(rep.corporateCardAed)}` : '100% out-of-pocket'}</span>
                      </div>
                    </div>

                    {!gate.ok ? (
                      <div className="py-note" data-tone="warning">
                        <ShieldAlert />
                        <span>{gate.reason}</span>
                      </div>
                    ) : (
                      <div className="py-award__foot">
                        <div className="py-award__decide">
                          <input
                            type="text"
                            className="neo-input neo-input--sm"
                            value={auditNotes[rep.id] ?? ''}
                            onChange={(e) => setAuditNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))}
                            placeholder="Optional VAT/GL audit note…"
                          />
                        </div>
                        <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => handleQueueReport(rep.id)}>
                          <ShieldCheck /> Audit & queue into {activePeriod}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </NeoPanel>

        {/* Column 2: Queued for Monthly Payday */}
        <NeoPanel
          hud="Step 2 · Settlement queue"
          title="Queued for monthly payday"
          actions={
            <>
              <span className="neo-count">{summary.queuedExpenses.length + summary.approvedHrClaims.length}</span>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => navigate('/payroll')}>
                <Wallet /> Pay run
              </button>
            </>
          }
        >
          <p className="py-panel-sub">Settles automatically when disbursing the monthly Pay Run, or send an instant off-cycle wire.</p>

          {summary.queuedExpenses.length === 0 && summary.approvedHrClaims.length === 0 ? (
            <NeoEmpty compact icon={<Receipt />} title="No pending reimbursements in queue">
              Audited T&E reports and approved HR allowance claims appear here automatically.
            </NeoEmpty>
          ) : (
            <div className="py-awards">
              {summary.queuedExpenses.map((rep) => {
                const emp = userById.get(rep.userId);
                const isSelf = Boolean(viewer && viewer.userId === rep.userId && !viewer.perms.has('*'));
                const canExpress = hasAuditPerm && !isSelf;

                return (
                  <article key={rep.id} className="py-award">
                    <div className="py-award__head">
                      {emp && <Avatar user={emp} size={36} />}
                      <div className="py-award__who">
                        <div className="py-award__name">
                          <b>{emp?.name ?? rep.userId}</b>
                          <Chip size="sm" tone="slate">
                            {rep.reference}
                          </Chip>
                          <Chip size="sm" tone="cyan">
                            T&E queued
                          </Chip>
                        </div>
                        <div className="py-award__title" style={{ marginTop: 3 }}>
                          {rep.title}
                        </div>
                        <div className="py-award__meta">
                          Cost center <code>{rep.costCenter}</code> · Total spend {formatAed(rep.totalSpendAed)}
                          {rep.corporateCardAed > 0 && (
                            <>
                              {' '}
                              · <CreditCard size={11} style={{ verticalAlign: '-1px' }} /> Corp card {formatAed(rep.corporateCardAed)}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="py-award__amt">
                        <b>{formatAed(rep.reimbursableAed)}</b>
                        <span>Period: {rep.payrollPeriod ?? activePeriod}</span>
                      </div>
                    </div>

                    <div className="py-award__foot">
                      <span className="py-sub">
                        Auto-settles in <b>{rep.payrollPeriod ?? activePeriod}</b> WPS batch
                      </span>
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--sm"
                        disabled={!canExpress}
                        title={
                          !hasAuditPerm
                            ? 'Requires Finance (expenses.audit) permission'
                            : isSelf
                              ? 'Separation of duties: another Finance approver must wire your own claim'
                              : 'Disburse immediate off-cycle wire transfer'
                        }
                        onClick={() => handleExpressWire(rep.id)}
                      >
                        <Zap /> Express off-cycle wire
                      </button>
                    </div>
                  </article>
                );
              })}

              {summary.approvedHrClaims.map((cl) => {
                const emp = userById.get(cl.userId);
                return (
                  <article key={cl.id} className="py-award">
                    <div className="py-award__head">
                      {emp && <Avatar user={emp} size={36} />}
                      <div className="py-award__who">
                        <div className="py-award__name">
                          <b>{emp?.name ?? cl.userId}</b>
                          <Chip size="sm" tone="success">
                            HR allowance approved
                          </Chip>
                        </div>
                        <div className="py-award__title" style={{ marginTop: 3 }}>
                          {ALLOWANCE_LABELS[cl.allowance]} · {cl.merchant}
                        </div>
                        <div className="py-award__meta">
                          {cl.description} ({cl.date})
                        </div>
                      </div>
                      <div className="py-award__amt">
                        <b>{formatAed(cl.amount)}</b>
                        <span>Period: {cl.payrollMonth ?? activePeriod}</span>
                      </div>
                    </div>

                    <div className="py-award__foot">
                      <span className="py-sub">Synced from HR Portal Benefits — settles with monthly Pay Run</span>
                      <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/hr/benefits')}>
                        Inspect in HR Benefits →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </NeoPanel>
      </div>

      {/* Recently Reimbursed Ledger */}
      <NeoPanel
        flush
        hud="Audit log"
        title="Recently reimbursed ledger (T&E + HR allowances)"
        actions={
          <>
            <span className="neo-count">{summary.settledExpenses.length + paidHrClaims.length}</span>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/hr/documents?tab=payslips')}>
              HR payslips <ExternalLink />
            </button>
          </>
        }
      >
        <p className="py-panel-sub">
          Verified bank batch references (<code>WPS-HX-...</code> &amp; <code>EXP-FAST-...</code>) reconciled with employee payslips.
        </p>

        {summary.settledExpenses.length === 0 && paidHrClaims.length === 0 ? (
          <NeoEmpty compact icon={<CheckCircle2 />} title="No settled reimbursements yet">
            Once a monthly Pay Run or express off-cycle wire is released, payment references appear here.
          </NeoEmpty>
        ) : (
          <div className="neo-table-wrap">
            <table className="neo-table py-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Source & reference</th>
                  <th>Description & cost center</th>
                  <th>Payroll period</th>
                  <th>Payment reference</th>
                  <th className="is-right">Reimbursed (AED)</th>
                  <th className="is-right">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {summary.settledExpenses.map((rep) => {
                  const emp = userById.get(rep.userId);
                  const isExpress = rep.paymentRef?.startsWith('EXP-FAST');
                  return (
                    <tr key={rep.id}>
                      <td>
                        <div className="py-person">
                          {emp && <Avatar user={emp} size={32} />}
                          <div className="py-person__text">
                            <b>{emp?.name ?? rep.userId}</b>
                            <span>{rep.department}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="py-ccy">{rep.reference}</span>
                        <div className="py-sub">Travel & Expense</div>
                      </td>
                      <td>
                        <div className="py-cell-title">{rep.title}</div>
                        <div className="py-cell-sub">
                          {rep.costCenter}
                          {rep.reimbursedAt ? ` · ${formatDateTime(rep.reimbursedAt)}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="py-ccy">{rep.payrollPeriod ?? '—'}</span>
                      </td>
                      <td>
                        <Chip size="sm" tone={isExpress ? 'warning' : 'success'} className="py-mono-chip">
                          {rep.paymentRef ?? `WPS-HX-${rep.payrollPeriod}`}
                        </Chip>
                      </td>
                      <td className="is-right">
                        <span className="py-amt py-amt--net">{formatAed(rep.reimbursableAed)}</span>
                      </td>
                      <td className="is-right">
                        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/hr/documents?tab=payslips')}>
                          Payslip →
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {paidHrClaims.map((cl) => {
                  const emp = userById.get(cl.userId);
                  return (
                    <tr key={cl.id}>
                      <td>
                        <div className="py-person">
                          {emp && <Avatar user={emp} size={32} />}
                          <div className="py-person__text">
                            <b>{emp?.name ?? cl.userId}</b>
                            <span>{emp?.department ?? 'Staff'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="py-ccy">HR-{cl.id.toUpperCase()}</span>
                        <div className="py-sub">HR Benefit Claim</div>
                      </td>
                      <td>
                        <div className="py-cell-title">
                          {ALLOWANCE_LABELS[cl.allowance]} · {cl.merchant}
                        </div>
                        <div className="py-cell-sub">{cl.description}</div>
                      </td>
                      <td>
                        <span className="py-ccy">{cl.payrollMonth ?? '—'}</span>
                      </td>
                      <td>
                        <Chip size="sm" tone="success" className="py-mono-chip">
                          WPS-HX-{cl.payrollMonth ?? activePeriod}
                        </Chip>
                      </td>
                      <td className="is-right">
                        <span className="py-amt py-amt--net">{formatAed(cl.amount)}</span>
                      </td>
                      <td className="is-right">
                        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/hr/documents?tab=payslips')}>
                          Payslip →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </NeoPanel>
    </div>
  );
}
