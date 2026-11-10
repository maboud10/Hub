import { useMemo, type ReactNode } from 'react';
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
import { Chip, NeoBanner, NeoBanners, NeoEmpty, NeoKpi, NeoKpis, NeoPanel } from '@/components/neo';
import { formatDate } from '@/lib/format';
import { formatDay } from '@/hr/calendar';
import { useMySpendSummary } from '@/expenses/selectors';
import type { ExpenseReport } from '@/expenses/types';
import { usePayroll } from '@/payroll/store';
import { useHub } from '@/store/hub';
import {
  compactAed,
  formatAed,
  ReportStatusBadge,
  useActivePaydayInfo,
} from './shared';

type StepNodeState = 'done' | 'active' | 'pending';

// 1: Submitted, 2: Manager Approved, 3: Finance Audited & GL Coded, 4: Queued in Payroll, 5: Disbursed via WPS
function computeStepStates(rep: ExpenseReport): [StepNodeState, StepNodeState, StepNodeState, StepNodeState, StepNodeState] {
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
}

export function ReimbursementsView() {
  const navigate = useNavigate();
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

  return (
    <div className="neo-stack">
      <NeoKpis label="Reimbursements at a glance" className="ex-kpis-flush">
        <NeoKpi icon={<Clock />} label="In review" value={compactAed(inReviewAed)} sub="Manager or Finance sign-off" />
        <NeoKpi
          icon={<Wallet />}
          label="Queued for payday"
          value={compactAed(summary.queuedPayrollAed)}
          sub={`Synced into the ${payday.label} run`}
          tone={summary.queuedPayrollAed > 0 ? 'success' : undefined}
        />
        <NeoKpi icon={<Banknote />} label="Reimbursed YTD" value={compactAed(summary.reimbursedYtdAed)} sub="Tax-free on your payslips" />
        <NeoKpi
          icon={<CalendarClock />}
          label="Next payday"
          value={formatDay(payday.payDate, { day: 'numeric', month: 'short' })}
          sub={payday.statusLabel}
        />
      </NeoKpis>

      {/* Live Payroll Console Sync */}
      <NeoBanners>
        <NeoBanner tone="cyan" icon={<CalendarClock />} title={`Cut-off ${formatDay(payday.cutoffDate, { day: 'numeric', month: 'short' })} → payday ${formatDay(payday.payDate, { day: 'numeric', month: 'short' })}`} meta={payday.label}>
          Claims audited before cut-off ride the {payday.label} WPS batch and land tax-free on your HR payslip.
        </NeoBanner>
      </NeoBanners>

      {/* Claim-by-Claim Audit & Payday Timelines */}
      <NeoPanel hud="Claims" title="Claim tracker" actions={<Chip size="sm">{trackedClaims.length}</Chip>}>
        {trackedClaims.length === 0 ? (
          <NeoEmpty
            compact
            icon={<Wallet />}
            title="No submitted or settled claims yet"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--sm"
                onClick={() => navigate('/expenses/reports?new=1')}
              >
                Submit an expense report <ArrowRight />
              </button>
            }
          >
            Once you submit a report, every approval step, Finance GL check, payroll period and WPS payout reference is tracked here.
          </NeoEmpty>
        ) : (
          <ul className="ex-claims">
            {trackedClaims.map((rep) => {
              const states = computeStepStates(rep);
              const mgr = rep.managerReviewerId ? usersById.get(rep.managerReviewerId) : undefined;
              const fin = rep.financeReviewerId ? usersById.get(rep.financeReviewerId) : undefined;
              const targetRun = rep.payrollPeriod ? runsByPeriod.get(rep.payrollPeriod) : undefined;
              const nodes: { icon: ReactNode; title: string; meta: string }[] = [
                {
                  icon: <CheckCircle2 />,
                  title: 'Submitted',
                  meta: `${rep.submittedAt ? formatDate(rep.submittedAt) : 'Pending submission'} · ${rep.receiptIds.length} receipt${rep.receiptIds.length === 1 ? '' : 's'}`,
                },
                {
                  icon: <ShieldCheck />,
                  title: 'Manager approved',
                  meta: rep.managerDecidedAt ? `${mgr?.name ?? 'Manager'} · ${formatDate(rep.managerDecidedAt)}` : 'Awaiting manager sign-off',
                },
                {
                  icon: <FileCheck2 />,
                  title: 'Finance & GL coded',
                  meta: rep.financeQueuedAt
                    ? `${fin?.name ?? 'Finance'} · VAT ${formatAed(rep.vatTotalAed, true)}`
                    : states[2] === 'active'
                      ? 'In the Finance audit inbox'
                      : 'After manager review',
                },
                {
                  icon: <CalendarClock />,
                  title: `Queued${rep.payrollPeriod ? ` · ${rep.payrollPeriod}` : ' in payroll'}`,
                  meta: rep.payrollPeriod
                    ? targetRun
                      ? `Payday ${formatDay(targetRun.payDate)} (${targetRun.status.replace('_', ' ')})`
                      : `Scheduled for the ${rep.payrollPeriod} run`
                    : 'Assigned at Finance audit',
                },
                {
                  icon: <Banknote />,
                  title: 'Paid via WPS',
                  meta:
                    rep.status === 'reimbursed'
                      ? `Ref ${rep.paymentRef ?? 'WPS-PAID'}${rep.reimbursedAt ? ` · ${formatDate(rep.reimbursedAt)}` : ''}`
                      : `Expected ${formatDay(targetRun?.payDate ?? payday.payDate)}`,
                },
              ];

              return (
                <li key={rep.id} className="ex-claim">
                  <div className="ex-claim__head">
                    <div className="ex-claim__text">
                      <div className="ex-chips">
                        <span className="neo-mono ex-faint">{rep.reference}</span>
                        <ReportStatusBadge status={rep.status} size="sm" />
                        <Chip size="sm">{rep.costCenter}</Chip>
                      </div>
                      <h3 className="ex-claim__title">{rep.title}</h3>
                    </div>
                    <div className="ex-amt ex-amt--lg">
                      <span className="neo-hud">Out-of-pocket</span>
                      <b className={rep.status === 'reimbursed' ? 'neo-num ex-pos' : 'neo-num neo-tint'}>{formatAed(rep.reimbursableAed, true)}</b>
                      {rep.corporateCardAed > 0 && <span>+ {formatAed(rep.corporateCardAed)} on the virtual card</span>}
                    </div>
                  </div>

                  {/* 5-Stage Audit Timeline (vertical on phones) */}
                  <ol className="ex-tl">
                    {nodes.map((n, idx) => (
                      <li key={n.title} className="ex-tl__node" data-state={states[idx]}>
                        <span className="ex-tl__dot" aria-hidden="true">
                          {n.icon}
                        </span>
                        <span className="ex-tl__text">
                          <b>
                            {idx + 1}. {n.title}
                          </b>
                          <span>{n.meta}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  {/* Footer Action Row */}
                  <div className="ex-claim__foot">
                    <span className="ex-faint">
                      {rep.reviewNote ? `Audit note: “${rep.reviewNote}”` : 'Tax-free employee expense settlement'}
                    </span>
                    <Link
                      to="/hr/documents?tab=payslips"
                      className={rep.status === 'reimbursed' ? 'neo-btn neo-btn--success neo-btn--sm' : 'neo-btn neo-btn--ghost neo-btn--sm'}
                    >
                      HR payslip <ExternalLink />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </NeoPanel>
    </div>
  );
}
