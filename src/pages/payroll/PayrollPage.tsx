import '@/styles/payroll.css';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import {
  ArrowRight,
  Award,
  CalendarClock,
  Download,
  Receipt,
  Scale,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { generateWpsSif } from '@/payroll/engine';
import {
  useCompReport,
  useLivePayrollRuns,
  usePayrollCaps,
  useReimbursementQueueSummary,
} from '@/payroll/selectors';
import { initPayroll, usePayroll } from '@/payroll/store';
import { useExpenses } from '@/expenses/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { firstName, greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PayRunView } from './PayRunView';
import { BonusesView } from './BonusesView';
import { CompensationView } from './CompensationView';
import { ReimbursementsBridgeView } from './ReimbursementsBridgeView';
import {
  daysUntilIso,
  downloadTextFile,
  formatAed,
  NominateBonusModal,
  RUN_STATUS_META,
  WpsSifModal,
} from './shared';

interface PayrollTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
  warn?: boolean;
}

export function PayrollPage() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const navigate = useNavigate();
  const caps = usePayrollCaps();

  const runs = useLivePayrollRuns();
  const bonuses = usePayroll((s) => s.bonuses);
  const compReport = useCompReport();
  const reimbSummary = useReimbursementQueueSummary();
  const expenseReports = useExpenses((s) => s.reports);

  const [sifOpen, setSifOpen] = useState(false);
  const [nominateOpen, setNominateOpen] = useState(false);

  useEffect(() => {
    initPayroll();
  }, []);

  const activeRun = runs[0];

  const pendingBonuses = useMemo(
    () => bonuses.filter((b) => b.status === 'pending_approval'),
    [bonuses],
  );
  const pendingBonusAed = useMemo(
    () => pendingBonuses.reduce((s, b) => s + b.amountAed, 0),
    [pendingBonuses],
  );

  const financeReadyCount = useMemo(
    () => expenseReports.filter((r) => r.status === 'manager_approved').length,
    [expenseReports],
  );

  const bridgeBadgeCount =
    reimbSummary.queuedExpenses.length +
    reimbSummary.approvedHrClaims.length +
    financeReadyCount;

  const queuedBridgeTotalAed =
    reimbSummary.queuedExpenseTotalAed + reimbSummary.approvedHrClaimsTotalAed;

  const paydayCountdown = useMemo(() => {
    if (!activeRun) return '—';
    if (activeRun.status === 'paid') return 'Settled ✓';
    const d = daysUntilIso(activeRun.payDate);
    if (d === 0) return 'Today!';
    if (d > 0) return `In ${d} day${d === 1 ? '' : 's'}`;
    return `${Math.abs(d)}d past target`;
  }, [activeRun]);

  const tabs = useMemo<PayrollTab[]>(
    () => [
      {
        to: '/payroll',
        label: 'Pay Run & Payday',
        icon: Wallet,
        end: true,
        count:
          activeRun && activeRun.status === 'pending_signoff' ? 1 : undefined,
        warn: activeRun?.status === 'pending_signoff',
      },
      {
        to: '/payroll/bonuses',
        label: 'Bonuses & Variable Pay',
        icon: Award,
        count: pendingBonuses.length > 0 ? pendingBonuses.length : undefined,
        warn: pendingBonuses.length > 0,
      },
      {
        to: '/payroll/compensation',
        label: 'Compensation & Bands',
        icon: Scale,
        count: compReport.outliers.length > 0 ? compReport.outliers.length : undefined,
        warn: compReport.outliers.length > 0,
      },
      {
        to: '/payroll/reimbursements',
        label: 'Reimbursements Bridge',
        icon: Receipt,
        count: bridgeBadgeCount > 0 ? bridgeBadgeCount : undefined,
        warn: financeReadyCount > 0,
      },
    ],
    [
      activeRun,
      pendingBonuses.length,
      compReport.outliers.length,
      bridgeBadgeCount,
      financeReadyCount,
    ],
  );

  const handleDownloadWpsSif = () => {
    if (!activeRun) return;
    const sif = generateWpsSif(activeRun, users);
    downloadTextFile(`HELIX-WPS-${activeRun.period}.SIF`, sif, 'text/plain;charset=utf-8');
    toast.success(
      `Downloaded HELIX-WPS-${activeRun.period}.SIF`,
      `${activeRun.headcount} EDR records · ${formatAed(activeRun.totalNetAed)} net`,
    );
    setSifOpen(true);
  };

  return (
    <div className="page py-page">
      {/* Atmospheric Emerald-Green / Mint-Gold Hero */}
      <header className="py-hero hud">
        <div className="py-hero__glow" aria-hidden="true" />

        <div className="py-hero__top">
          <div className="py-hero__main">
            <div className="eyebrow py-hero__eyebrow">
              Payroll Console · Payday, Variable Pay & Compensation Intelligence
            </div>
            <h1 className="page-title">
              {greeting()}
              {me ? `, ${firstName(me.name)}` : ''}.{' '}
              <span className="py-hero__accent">
                Precision payday, four-eyes control & fair rewards
              </span>
            </h1>
            <p className="page-sub">
              Multi-currency WPS payroll engine uniting HR compensation, pro-rata &amp; leave, four-eyes variable bonuses, salary band equity, statutory UAE EOSB gratuity, and live Travel &amp; Expense settlements.
            </p>
          </div>

          <div className="py-hero__cta">
            <button
              type="button"
              className="btn py-btn-emerald"
              onClick={handleDownloadWpsSif}
            >
              <Download /> Download WPS .SIF
            </button>

            {caps.canNominateBonus && (
              <button
                type="button"
                className="btn"
                onClick={() => setNominateOpen(true)}
              >
                <Award /> Nominate Bonus
              </button>
            )}

            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate('/expenses/approvals')}
            >
              Travel &amp; Expense Audit <ArrowRight />
            </button>
          </div>
        </div>

        {/* Live Status Strip */}
        <div className="py-status-strip">
          <button
            type="button"
            className="py-status-tile"
            onClick={() => navigate('/payroll')}
          >
            <span className="py-status-tile__label">
              <ShieldCheck /> Active Run Period
            </span>
            <span className="py-status-tile__val">
              {activeRun?.label ?? '—'}
            </span>
            <span className="py-status-tile__sub">
              {activeRun ? RUN_STATUS_META[activeRun.status].label : 'Initializing'}
            </span>
          </button>

          <button
            type="button"
            className="py-status-tile"
            onClick={() => navigate('/payroll')}
          >
            <span className="py-status-tile__label">
              <CalendarClock /> Payday Countdown
            </span>
            <span className="py-status-tile__val">{paydayCountdown}</span>
            <span className="py-status-tile__sub">
              Value date {activeRun?.payDate ?? '—'} · Cut-off {activeRun?.cutoffDate ?? '—'}
            </span>
          </button>

          <button
            type="button"
            className="py-status-tile"
            onClick={() => navigate('/payroll')}
          >
            <span className="py-status-tile__label">
              <Wallet /> Total Net Payroll
            </span>
            <span className="py-status-tile__val">
              {activeRun ? formatAed(activeRun.totalNetAed) : '—'}
            </span>
            <span className="py-status-tile__sub">
              {activeRun?.headcount ?? 0} salaried employees synced
            </span>
          </button>

          <button
            type="button"
            className="py-status-tile"
            onClick={() => navigate('/payroll/reimbursements')}
          >
            <span className="py-status-tile__label">
              <Receipt /> Queued T&amp;E + Claims
            </span>
            <span className="py-status-tile__val">{formatAed(queuedBridgeTotalAed)}</span>
            <span className="py-status-tile__sub">
              {reimbSummary.queuedExpenses.length} T&amp;E + {reimbSummary.approvedHrClaims.length} HR
              {financeReadyCount > 0 ? ` · ${financeReadyCount} to audit` : ''}
            </span>
          </button>

          <button
            type="button"
            className="py-status-tile"
            onClick={() => navigate('/payroll/bonuses')}
          >
            <span className="py-status-tile__label">
              <Award /> Pending Bonus Sign-Offs
            </span>
            <span className="py-status-tile__val">
              {pendingBonuses.length} ({formatAed(pendingBonusAed)})
            </span>
            <span className="py-status-tile__sub">
              Four-eyes variable pay queue
            </span>
          </button>
        </div>
      </header>

      {/* Counter-Badged Navigation Tabs */}
      <nav className="tabs py-tabs" aria-label="Payroll Console sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cx('tab', isActive && 'is-active')}
            >
              <Icon aria-hidden="true" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={cx('py-tab-count', t.warn && 'py-tab-count--warn')}>
                  {t.count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Nested Routes */}
      <Routes>
        <Route index element={<PayRunView />} />
        <Route path="bonuses" element={<BonusesView />} />
        <Route path="compensation" element={<CompensationView />} />
        <Route path="reimbursements" element={<ReimbursementsBridgeView />} />
        <Route path="*" element={<Navigate to="/payroll" replace />} />
      </Routes>

      {/* Modals launched from Hero CTAs */}
      <WpsSifModal
        open={sifOpen}
        onClose={() => setSifOpen(false)}
        run={activeRun}
        users={users}
      />
      <NominateBonusModal
        open={nominateOpen}
        onClose={() => setNominateOpen(false)}
        defaultPeriod={activeRun?.period}
      />
    </div>
  );
}
