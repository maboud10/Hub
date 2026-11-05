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
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { ALLOWANCE_LABELS, formatAed } from './shared';

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
  const activePeriod = useMemo(
    () => runs[0]?.period ?? periodFromTimestamp(Date.now(), 0),
    [runs],
  );

  const managerApprovedReports = useMemo(
    () => reports.filter((r) => r.status === 'manager_approved'),
    [reports],
  );
  const managerPendingCount = useMemo(
    () => reports.filter((r) => r.status === 'submitted').length,
    [reports],
  );
  const paidHrClaims = useMemo(
    () => claims.filter((c) => c.status === 'paid'),
    [claims],
  );

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
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Bridge KPI Strip */}
      <section className="py-kpi-grid py-kpi-grid--4" aria-label="Reimbursements bridge metrics">
        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Awaiting Finance Audit</span>
            <ShieldCheck />
          </div>
          <div className="py-kpi__val">{managerApprovedReports.length}</div>
          <div className="py-kpi__foot">
            {managerPendingCount > 0
              ? `+ ${managerPendingCount} in manager review`
              : 'Ready to queue into payroll'}
          </div>
        </div>

        <div className="py-kpi py-kpi--highlight">
          <div className="py-kpi__label">
            <span>Queued T&E Reports</span>
            <Receipt />
          </div>
          <div className="py-kpi__val">{formatAed(summary.queuedExpenseTotalAed)}</div>
          <div className="py-kpi__foot">
            {summary.queuedExpenses.length} report
            {summary.queuedExpenses.length === 1 ? '' : 's'} for {activePeriod}
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Approved HR Benefit Claims</span>
            <HeartHandshake />
          </div>
          <div className="py-kpi__val">{formatAed(summary.approvedHrClaimsTotalAed)}</div>
          <div className="py-kpi__foot">
            {summary.approvedHrClaims.length} allowance claim
            {summary.approvedHrClaims.length === 1 ? '' : 's'} synced
          </div>
        </div>

        <div className="py-kpi">
          <div className="py-kpi__label">
            <span>Settled Reimbursements</span>
            <CheckCircle2 />
          </div>
          <div className="py-kpi__val">{formatAed(settledTotalAed)}</div>
          <div className="py-kpi__foot">
            {summary.settledExpenses.length} T&E + {paidHrClaims.length} HR claims paid
          </div>
        </div>
      </section>

      {/* Two-Column Bridge: 1) Awaiting Finance Audit  2) Queued for Monthly Payday */}
      <div className="py-bridge-grid">
        {/* Column 1: Awaiting Finance Audit (manager_approved ExpenseReports) */}
        <section className="card" style={{ minWidth: 0 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Awaiting Finance Audit
                <span className="count">{managerApprovedReports.length}</span>
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Manager-approved Travel & Expense reports ready for Finance VAT/GL sign-off into <code>{activePeriod}</code>.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => navigate('/expenses/approvals')}
            >
              Travel & Expense Audit <ArrowRight />
            </button>
          </div>

          {managerPendingCount > 0 && (
            <div
              className="row row--between row--wrap"
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                marginBottom: 12,
                fontSize: 12.5,
              }}
            >
              <span className="muted">
                <b>{managerPendingCount}</b> additional submitted expense report
                {managerPendingCount === 1 ? ' is' : 's are'} awaiting line-manager review.
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => navigate('/expenses/approvals')}
              >
                Open /expenses/approvals →
              </button>
            </div>
          )}

          {managerApprovedReports.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title="Finance audit inbox is clear"
              action={
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => navigate('/expenses/approvals')}
                >
                  Open Travel & Expense Desk <ExternalLink />
                </button>
              }
            >
              All manager-approved expense reports have been audited and queued into Payroll.
            </EmptyState>
          ) : (
            <div className="stack">
              {managerApprovedReports.map((rep) => {
                const emp = userById.get(rep.userId);
                const mgr = rep.managerReviewerId
                  ? userById.get(rep.managerReviewerId)
                  : undefined;
                const gate = canFinanceAuditReport(viewer, rep);

                return (
                  <article key={rep.id} className="py-claim-card">
                    <div className="py-claim-card__head">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {emp && <Avatar user={emp} size={36} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 6 }}>
                            <strong>{emp?.name ?? rep.userId}</strong>
                            <span className="tag">{rep.reference}</span>
                            <span className="tag">{rep.costCenter}</span>
                          </div>
                          <div style={{ fontWeight: 550, fontSize: 13, marginTop: 2 }}>
                            {rep.title}
                          </div>
                          <div className="text-xs muted" style={{ marginTop: 2 }}>
                            {rep.receiptIds.length} receipt
                            {rep.receiptIds.length === 1 ? '' : 's'} · VAT{' '}
                            {formatAed(rep.vatTotalAed)}
                            {mgr ? ` · Mgr approved by ${mgr.name}` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 17,
                            fontWeight: 700,
                          }}
                        >
                          {formatAed(rep.reimbursableAed)}
                        </div>
                        <div className="text-xs muted mono">
                          {rep.corporateCardAed > 0
                            ? `Corp card ${formatAed(rep.corporateCardAed)}`
                            : '100% out-of-pocket'}
                        </div>
                      </div>
                    </div>

                    {!gate.ok ? (
                      <div className="py-sod-banner" style={{ marginTop: 2 }}>
                        <ShieldAlert />
                        <div>{gate.reason}</div>
                      </div>
                    ) : (
                      <div className="py-claim-card__foot">
                        <input
                          type="text"
                          className="input"
                          style={{ height: 34, flex: '1 1 180px', fontSize: 12.5 }}
                          value={auditNotes[rep.id] ?? ''}
                          onChange={(e) =>
                            setAuditNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))
                          }
                          placeholder="Optional VAT/GL audit note..."
                        />
                        <button
                          type="button"
                          className="btn btn--sm py-btn-emerald"
                          onClick={() => handleQueueReport(rep.id)}
                        >
                          <ShieldCheck /> Audit & Queue into {activePeriod}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Column 2: Queued for Monthly Payday (payroll_queued ExpenseReports + approved HR BenefitClaims) */}
        <section className="card" style={{ minWidth: 0 }}>
          <div className="section-head">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Queued for Monthly Payday
                <span className="count">
                  {summary.queuedExpenses.length + summary.approvedHrClaims.length}
                </span>
              </h2>
              <p className="text-xs muted" style={{ marginTop: 3 }}>
                Settles automatically when disbursing the monthly Pay Run, or send an instant off-cycle wire.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--sm py-btn-emerald"
              onClick={() => navigate('/payroll')}
            >
              <Wallet /> Open Pay Run
            </button>
          </div>

          {summary.queuedExpenses.length === 0 && summary.approvedHrClaims.length === 0 ? (
            <EmptyState icon={<Receipt />} title="No pending reimbursements in queue">
              Audited T&E reports and approved HR allowance claims appear here automatically.
            </EmptyState>
          ) : (
            <div className="stack">
              {summary.queuedExpenses.map((rep) => {
                const emp = userById.get(rep.userId);
                const isSelf = Boolean(viewer && viewer.userId === rep.userId && !viewer.perms.has('*'));
                const canExpress = hasAuditPerm && !isSelf;

                return (
                  <article key={rep.id} className="py-claim-card">
                    <div className="py-claim-card__head">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {emp && <Avatar user={emp} size={36} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 6 }}>
                            <strong>{emp?.name ?? rep.userId}</strong>
                            <span className="tag">{rep.reference}</span>
                            <span className="badge badge--info">T&E Queued</span>
                          </div>
                          <div style={{ fontWeight: 550, fontSize: 13, marginTop: 2 }}>
                            {rep.title}
                          </div>
                          <div className="text-xs muted" style={{ marginTop: 2 }}>
                            Cost Center <code>{rep.costCenter}</code> · Total Spend{' '}
                            {formatAed(rep.totalSpendAed)}
                            {rep.corporateCardAed > 0 && (
                              <>
                                {' '}
                                · <CreditCard size={11} style={{ verticalAlign: '-1px' }} /> Corp Card{' '}
                                {formatAed(rep.corporateCardAed)}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 17,
                            fontWeight: 700,
                            color: 'var(--text)',
                          }}
                        >
                          {formatAed(rep.reimbursableAed)}
                        </div>
                        <div className="text-xs muted mono">
                          Period: {rep.payrollPeriod ?? activePeriod}
                        </div>
                      </div>
                    </div>

                    <div className="py-claim-card__foot">
                      <span className="text-xs muted">
                        Auto-settles in <b>{rep.payrollPeriod ?? activePeriod}</b> WPS batch
                      </span>
                      <button
                        type="button"
                        className="btn btn--sm"
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
                        <Zap style={{ color: 'var(--warning)' }} /> Send Express Off-Cycle Wire
                      </button>
                    </div>
                  </article>
                );
              })}

              {summary.approvedHrClaims.map((cl) => {
                const emp = userById.get(cl.userId);
                return (
                  <article key={cl.id} className="py-claim-card">
                    <div className="py-claim-card__head">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {emp && <Avatar user={emp} size={36} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 6 }}>
                            <strong>{emp?.name ?? cl.userId}</strong>
                            <span className="badge badge--success">HR Allowance Approved</span>
                          </div>
                          <div style={{ fontWeight: 550, fontSize: 13, marginTop: 2 }}>
                            {ALLOWANCE_LABELS[cl.allowance]} · {cl.merchant}
                          </div>
                          <div className="text-xs muted" style={{ marginTop: 2 }}>
                            {cl.description} ({cl.date})
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 17,
                            fontWeight: 700,
                          }}
                        >
                          {formatAed(cl.amount)}
                        </div>
                        <div className="text-xs muted mono">
                          Period: {cl.payrollMonth ?? activePeriod}
                        </div>
                      </div>
                    </div>

                    <div className="py-claim-card__foot">
                      <span className="text-xs muted">
                        Synced from HR Portal Benefits — settles with monthly Pay Run
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => navigate('/hr/benefits')}
                      >
                        Inspect in HR Benefits →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Recently Reimbursed Ledger */}
      <section className="card py-table-card">
        <div className="py-table-card__head">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              Recently Reimbursed Ledger (T&E + HR Allowances)
              <span className="count">
                {summary.settledExpenses.length + paidHrClaims.length}
              </span>
            </h2>
            <p className="text-xs muted" style={{ marginTop: 3 }}>
              Verified bank batch references (<code>WPS-HX-...</code> &amp; <code>EXP-FAST-...</code>) reconciled with employee payslips.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => navigate('/hr/documents?tab=payslips')}
          >
            Inspect HR Portal Payslips <ExternalLink />
          </button>
        </div>

        {summary.settledExpenses.length === 0 && paidHrClaims.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="No settled reimbursements yet">
            Once a monthly Pay Run or express off-cycle wire is released, payment references appear here.
          </EmptyState>
        ) : (
          <div className="py-table-wrap">
            <table className="py-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Source & Reference</th>
                  <th>Description & Cost Center</th>
                  <th>Payroll Period</th>
                  <th>Payment Reference</th>
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
                        <div className="py-emp-cell">
                          {emp && <Avatar user={emp} size={32} />}
                          <div className="py-emp-cell__meta">
                            <div className="py-emp-cell__name">{emp?.name ?? rep.userId}</div>
                            <div className="py-emp-cell__sub">{rep.department}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="tag">{rep.reference}</span>
                        <div className="py-num-sub">Travel & Expense</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{rep.title}</div>
                        <div className="text-xs muted">
                          {rep.costCenter}
                          {rep.reimbursedAt ? ` · ${formatDateTime(rep.reimbursedAt)}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="tag">{rep.payrollPeriod ?? '—'}</span>
                      </td>
                      <td>
                        <span
                          className={`badge mono ${isExpress ? 'badge--warning' : 'badge--success'}`}
                        >
                          {rep.paymentRef ?? `WPS-HX-${rep.payrollPeriod}`}
                        </span>
                      </td>
                      <td className="is-right">
                        <span className="py-num py-num--net">
                          {formatAed(rep.reimbursableAed)}
                        </span>
                      </td>
                      <td className="is-right">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => navigate('/hr/documents?tab=payslips')}
                        >
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
                        <div className="py-emp-cell">
                          {emp && <Avatar user={emp} size={32} />}
                          <div className="py-emp-cell__meta">
                            <div className="py-emp-cell__name">{emp?.name ?? cl.userId}</div>
                            <div className="py-emp-cell__sub">{emp?.department ?? 'Staff'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="tag">HR-{cl.id.toUpperCase()}</span>
                        <div className="py-num-sub">HR Benefit Claim</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {ALLOWANCE_LABELS[cl.allowance]} · {cl.merchant}
                        </div>
                        <div className="text-xs muted">{cl.description}</div>
                      </td>
                      <td>
                        <span className="tag">{cl.payrollMonth ?? '—'}</span>
                      </td>
                      <td>
                        <span className="badge badge--success mono">
                          WPS-HX-{cl.payrollMonth ?? activePeriod}
                        </span>
                      </td>
                      <td className="is-right">
                        <span className="py-num py-num--net">{formatAed(cl.amount)}</span>
                      </td>
                      <td className="is-right">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => navigate('/hr/documents?tab=payslips')}
                        >
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
      </section>
    </div>
  );
}
