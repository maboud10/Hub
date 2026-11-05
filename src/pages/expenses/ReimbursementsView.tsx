import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatDate } from '@/lib/format';
import { formatDay } from '@/hr/calendar';
import { useMySpendSummary } from '@/expenses/selectors';
import type { ExpenseReport } from '@/expenses/types';
import { usePayroll } from '@/payroll/store';
import { useHub } from '@/store/hub';
import { usePermissions } from '@/store/selectors';
import { hasPermission } from '@/lib/rbac';
import { EmptyState } from '@/components/ui/primitives';
import {
  formatAed,
  ReportStatusBadge,
  useActivePaydayInfo,
} from './shared';

export function ReimbursementsView() {
  const navigate = useNavigate();
  const perms = usePermissions();
  const users = useHub((s) => s.users);
  const summary = useMySpendSummary();
  const payday = useActivePaydayInfo();
  const payrollRuns = usePayroll((s) => s.runs);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const runsByPeriod = useMemo(() => new Map(payrollRuns.map((r) => [r.period, r])), [payrollRuns]);

  const inReviewAed = useMemo(
    () =>
      summary.myReports
        .filter((r) => r.status === 'submitted' || r.status === 'manager_approved')
        .reduce((s, r) => s + r.reimbursableAed, 0),
    [summary.myReports],
  );

  const trackedClaims = useMemo(
    () =>
      summary.myReports.filter(
        (r) =>
          r.status === 'submitted' ||
          r.status === 'manager_approved' ||
          r.status === 'payroll_queued' ||
          r.status === 'reimbursed' ||
          r.status === 'changes_requested',
      ),
    [summary.myReports],
  );

  type StepNodeState = 'done' | 'active' | 'pending';
  const computeStepStates = (rep: ExpenseReport): [StepNodeState, StepNodeState, StepNodeState, StepNodeState, StepNodeState] => {
    // 1: Submitted, 2: Manager Approved, 3: Finance Audited & GL Coded, 4: Queued in Payroll, 5: Disbursed via WPS
    if (rep.status === 'reimbursed') {
      return ['done', 'done', 'done', 'done', 'done'];
    }
    if (rep.status === 'payroll_queued') {
      return ['done', 'done', 'done', 'active', 'pending'];
    }
    if (rep.status === 'manager_approved') {
      return ['done', 'done', 'active', 'pending', 'pending'];
    }
    if (rep.status === 'submitted') {
      return ['done', 'active', 'pending', 'pending', 'pending'];
    }
    return ['active', 'pending', 'pending', 'pending', 'pending'];
  };

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* 4 Summary KPI Cards */}
      <div className="ex-kpi-grid">
        <div className="ex-stat-card">
          <div className="ex-stat-card__label">
            <span>In Review (Manager / Finance)</span>
            <Clock />
          </div>
          <div className="ex-stat-card__val mono">{formatAed(inReviewAed, true)}</div>
          <div className="ex-stat-card__sub">Awaiting manager or Finance GL sign-off</div>
        </div>

        <div className="ex-stat-card">
          <div className="ex-stat-card__label">
            <span>Queued for Next Payday</span>
            <Wallet />
          </div>
          <div className="ex-stat-card__val mono" style={{ color: 'var(--ex-ink)' }}>
            {formatAed(summary.queuedPayrollAed, true)}
          </div>
          <div className="ex-stat-card__sub">
            Synced into {payday.label} Payroll Run
          </div>
        </div>

        <div className="ex-stat-card">
          <div className="ex-stat-card__label">
            <span>Total Reimbursed YTD</span>
            <Banknote />
          </div>
          <div className="ex-stat-card__val mono" style={{ color: 'var(--success)' }}>
            {formatAed(summary.reimbursedYtdAed, true)}
          </div>
          <div className="ex-stat-card__sub">100% tax-free on HR Portal payslips</div>
        </div>

        <div className="ex-stat-card">
          <div className="ex-stat-card__label">
            <span>Next Payroll PayDate</span>
            <CalendarClock />
          </div>
          <div className="ex-stat-card__val">
            {formatDay(payday.payDate, { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div className="ex-stat-card__sub">
            Run status: <b>{payday.statusLabel}</b>
          </div>
        </div>
      </div>

      {/* Live Payroll Console Sync Banner */}
      <div
        className="card row row--between row--wrap"
        style={{
          padding: '14px 18px',
          borderColor: 'rgb(var(--ex-1-rgb) / 0.32)',
          background: 'rgb(var(--ex-1-rgb) / 0.06)',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="text-sm" style={{ fontWeight: 650 }}>
            Where is my money? — Real-Time Payroll &amp; WPS Bank Sync
          </div>
          <div className="text-xs muted" style={{ marginTop: 2 }}>
            Approved expense reports audited before cutoff (<code className="mono">{payday.cutoffDate}</code>) settle automatically in the{' '}
            <b>{payday.label}</b> WPS batch and appear as a tax-free reimbursement line on your HR Portal Payslip.
          </div>
        </div>

        <div className="row row--wrap" style={{ gap: 8 }}>
          <Link to="/hr/documents?tab=payslips" className="btn btn--sm">
            My HR Payslips <ExternalLink />
          </Link>
          {hasPermission(perms, 'app:payroll') && (
            <Link to="/payroll/reimbursements" className="btn btn--sm ex-btn-teal">
              Open Payroll Console →
            </Link>
          )}
        </div>
      </div>

      {/* Claim-by-Claim Audit & Payday Timelines */}
      {trackedClaims.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="No submitted or settled reimbursement claims yet"
          action={
            <button
              type="button"
              className="btn ex-btn-teal"
              onClick={() => navigate('/expenses/reports?new=1')}
            >
              Submit an Expense Report <ArrowRight />
            </button>
          }
        >
          Once you submit an Expense Report, every approval step, Finance GL check, Payroll period assignment, and WPS payout reference is tracked right here.
        </EmptyState>
      ) : (
        <div className="stack">
          {trackedClaims.map((rep) => {
            const states = computeStepStates(rep);
            const mgr = rep.managerReviewerId ? usersById.get(rep.managerReviewerId) : undefined;
            const fin = rep.financeReviewerId ? usersById.get(rep.financeReviewerId) : undefined;
            const targetRun = rep.payrollPeriod ? runsByPeriod.get(rep.payrollPeriod) : undefined;

            return (
              <article key={rep.id} className="card stack" style={{ minWidth: 0 }}>
                <div className="row row--between row--wrap" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row row--wrap" style={{ gap: 8 }}>
                      <span className="mono text-xs muted">{rep.reference}</span>
                      <ReportStatusBadge status={rep.status} />
                      <span className="badge badge--muted">{rep.costCenter}</span>
                    </div>
                    <h3 style={{ fontWeight: 650, fontSize: 16, marginTop: 4 }}>{rep.title}</h3>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div className="text-xs muted">Out-of-Pocket Reimbursable</div>
                    <div
                      className="mono"
                      style={{
                        fontWeight: 700,
                        fontSize: 18,
                        color: rep.status === 'reimbursed' ? 'var(--success)' : 'var(--ex-ink)',
                      }}
                    >
                      {formatAed(rep.reimbursableAed, true)}
                    </div>
                    {rep.corporateCardAed > 0 && (
                      <div className="text-xs muted">
                        + {formatAed(rep.corporateCardAed)} Virtual Card reconciled
                      </div>
                    )}
                  </div>
                </div>

                {/* 5-Stage Horizontal / Responsive Vertical Audit Timeline */}
                <div className="ex-timeline">
                  {/* Step 1: Submitted */}
                  <div className={cx('ex-tl-node', states[0] === 'done' && 'is-done', states[0] === 'active' && 'is-active')}>
                    <div className="ex-tl-node__head">
                      <CheckCircle2 style={{ color: states[0] === 'done' ? 'var(--success)' : 'var(--ex-ink)' }} />
                      <span>1. Submitted</span>
                    </div>
                    <div className="ex-tl-node__meta">
                      {rep.submittedAt ? formatDate(rep.submittedAt) : 'Pending submission'} · {rep.receiptIds.length} receipt{rep.receiptIds.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  {/* Step 2: Manager Approved */}
                  <div className={cx('ex-tl-node', states[1] === 'done' && 'is-done', states[1] === 'active' && 'is-active')}>
                    <div className="ex-tl-node__head">
                      <ShieldCheck style={{ color: states[1] === 'done' ? 'var(--success)' : states[1] === 'active' ? 'var(--ex-ink)' : 'var(--text-3)' }} />
                      <span>2. Manager Approved</span>
                    </div>
                    <div className="ex-tl-node__meta">
                      {rep.managerDecidedAt
                        ? `${mgr?.name ?? 'Manager'} · ${formatDate(rep.managerDecidedAt)}`
                        : 'Awaiting manager sign-off'}
                    </div>
                  </div>

                  {/* Step 3: Finance Audited & GL Coded */}
                  <div className={cx('ex-tl-node', states[2] === 'done' && 'is-done', states[2] === 'active' && 'is-active')}>
                    <div className="ex-tl-node__head">
                      <FileCheck2 style={{ color: states[2] === 'done' ? 'var(--success)' : states[2] === 'active' ? 'var(--ex-ink)' : 'var(--text-3)' }} />
                      <span>3. Finance &amp; GL Coded</span>
                    </div>
                    <div className="ex-tl-node__meta">
                      {rep.financeQueuedAt
                        ? `${fin?.name ?? 'Finance'} · VAT ${formatAed(rep.vatTotalAed, true)}`
                        : states[2] === 'active'
                          ? 'In Finance Audit inbox'
                          : 'Pending manager review'}
                    </div>
                  </div>

                  {/* Step 4: Queued in Payroll Period YYYY-MM */}
                  <div className={cx('ex-tl-node', states[3] === 'done' && 'is-done', states[3] === 'active' && 'is-active')}>
                    <div className="ex-tl-node__head">
                      <CalendarClock style={{ color: states[3] === 'done' ? 'var(--success)' : states[3] === 'active' ? 'var(--ex-ink)' : 'var(--text-3)' }} />
                      <span>
                        4. Queued {rep.payrollPeriod ? `(${rep.payrollPeriod})` : 'in Payroll'}
                      </span>
                    </div>
                    <div className="ex-tl-node__meta">
                      {rep.payrollPeriod
                        ? targetRun
                          ? `PayDate ${formatDay(targetRun.payDate)} (${targetRun.status.replace('_', ' ')})`
                          : `Scheduled for ${rep.payrollPeriod} run`
                        : 'Assigned upon Finance audit'}
                    </div>
                  </div>

                  {/* Step 5: Disbursed via WPS Ref */}
                  <div className={cx('ex-tl-node', states[4] === 'done' && 'is-done', states[4] === 'active' && 'is-active')}>
                    <div className="ex-tl-node__head">
                      <Banknote style={{ color: states[4] === 'done' ? 'var(--success)' : 'var(--text-3)' }} />
                      <span>5. Disbursed via WPS</span>
                    </div>
                    <div className="ex-tl-node__meta">
                      {rep.status === 'reimbursed'
                        ? `Ref ${rep.paymentRef ?? 'WPS-PAID'} · ${rep.reimbursedAt ? formatDate(rep.reimbursedAt) : ''}`
                        : `Paid on ${formatDay(targetRun?.payDate ?? payday.payDate)}`}
                    </div>
                  </div>
                </div>

                {/* Footer Action Row */}
                <div className="row row--between row--wrap" style={{ gap: 10 }}>
                  <div className="text-xs muted">
                    {rep.reviewNote ? `Audit note: “${rep.reviewNote}”` : 'Tax-free employee expense settlement'}
                  </div>

                  {rep.status === 'reimbursed' ? (
                    <Link to="/hr/documents?tab=payslips" className="btn btn--sm btn--success">
                      View on HR Portal Payslip → <ExternalLink />
                    </Link>
                  ) : (
                    <Link to="/hr/documents?tab=payslips" className="btn btn--sm btn--ghost">
                      View on HR Portal Payslip → <ExternalLink />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
