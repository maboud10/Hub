import '@/styles/expenses.css';
import { useEffect, useMemo } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import {
  Banknote,
  Compass,
  FileSpreadsheet,
  Plane,
  Receipt,
  ScanLine,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { firstName, greeting } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { formatDay } from '@/hr/calendar';
import {
  useExpensesCaps,
  useMySpendSummary,
  useSpendApprovals,
} from '@/expenses/selectors';
import { initPayroll } from '@/payroll/store';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { formatAed, useActivePaydayInfo } from './shared';
import { OverviewView } from './OverviewView';
import { TravelDeskView } from './TravelDeskView';
import { ReceiptVaultView } from './ReceiptVaultView';
import { ReportsView } from './ReportsView';
import { ReimbursementsView } from './ReimbursementsView';
import { ApprovalsView } from './ApprovalsView';

interface ExpensesTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
  tone?: 'alert' | 'teal';
}

export function ExpensesPage() {
  const me = useSessionUser();
  const perms = usePermissions();
  const navigate = useNavigate();

  const caps = useExpensesCaps();
  const summary = useMySpendSummary();
  const approvals = useSpendApprovals();
  const payday = useActivePaydayInfo();

  useEffect(() => {
    initPayroll();
  }, []);

  const canOpenPayroll = hasPermission(perms, 'app:payroll');
  const showApprovalsTab = caps.canApprove || caps.canAudit;

  const draftOrRevisionReportsCount = useMemo(
    () =>
      summary.myReports.filter(
        (r) => r.status === 'draft' || r.status === 'changes_requested',
      ).length,
    [summary.myReports],
  );

  const activeTripsCount = useMemo(
    () =>
      summary.myTrips.filter(
        (t) => t.status === 'pending_approval' || t.status === 'approved' || t.status === 'booked',
      ).length,
    [summary.myTrips],
  );

  const tabs = useMemo<ExpensesTab[]>(() => {
    const items: ExpensesTab[] = [
      {
        to: '/expenses',
        label: 'Flow & Overview',
        icon: Compass,
        end: true,
      },
      {
        to: '/expenses/travel',
        label: 'Travel Desk',
        icon: Plane,
        count: activeTripsCount > 0 ? activeTripsCount : undefined,
      },
      {
        to: '/expenses/receipts',
        label: 'Smart Receipt Vault',
        icon: Receipt,
        count: summary.unbundledReceipts.length > 0 ? summary.unbundledReceipts.length : undefined,
        tone: 'teal',
      },
      {
        to: '/expenses/reports',
        label: 'Expense Reports',
        icon: FileSpreadsheet,
        count: draftOrRevisionReportsCount > 0 ? draftOrRevisionReportsCount : undefined,
        tone: draftOrRevisionReportsCount > 0 ? 'alert' : undefined,
      },
      {
        to: '/expenses/reimbursements',
        label: 'Payroll & Status',
        icon: Wallet,
        count: summary.queuedPayrollAed > 0 ? 1 : undefined,
        tone: 'teal',
      },
    ];

    if (showApprovalsTab) {
      items.push({
        to: '/expenses/approvals',
        label: 'Approvals & Audit',
        icon: ShieldCheck,
        count: approvals.totalCount > 0 ? approvals.totalCount : undefined,
        tone: approvals.totalCount > 0 ? 'alert' : undefined,
      });
    }

    return items;
  }, [
    activeTripsCount,
    summary.unbundledReceipts.length,
    draftOrRevisionReportsCount,
    summary.queuedPayrollAed,
    showApprovalsTab,
    approvals.totalCount,
  ]);

  return (
    <div className="page ex-page">
      {/* Atmospheric Ocean-Teal / Cyan Module Hero */}
      <header className="ex-hero hud">
        <div className="ex-hero__glow" aria-hidden="true" />
        <div className="ex-hero__main">
          <div className="eyebrow ex-hero__eyebrow">
            Spend &amp; Mobility · Travel, Smart Receipts &amp; Reimbursements
          </div>
          <h1 className="page-title">
            {greeting()}
            {me ? `, ${firstName(me.name)}` : ''}.{' '}
            <span className="ex-hero__accent">From trip pre-approval to payday</span>
          </h1>
          <p className="page-sub">
            Benchmark international itineraries, spend with scoped Virtual Corporate Cards, scan multi-currency receipts via AI OCR, and track tax-free WPS payroll reimbursements live.
          </p>

          <div className="ex-hero__pills">
            {/* Pending Reimbursement KPI Pill */}
            <button
              type="button"
              className="ex-kpi-pill ex-kpi-pill--teal"
              onClick={() => navigate('/expenses/reimbursements')}
              title="Total out-of-pocket claims in review or queued for payday"
            >
              <Wallet />
              <span>Pending reimbursement</span>
              <b>{formatAed(summary.pendingReimbursementAed, true)}</b>
            </button>

            {/* Queued for Payday KPI Pill */}
            <button
              type="button"
              className={cx('ex-kpi-pill', summary.queuedPayrollAed > 0 && 'ex-kpi-pill--ok')}
              onClick={() => navigate('/expenses/reimbursements')}
              title={`Next Payday: ${payday.payDate} (${payday.statusLabel})`}
            >
              <Banknote />
              <span>Queued for payday ({formatDay(payday.payDate, { day: 'numeric', month: 'short' })})</span>
              <b>{formatAed(summary.queuedPayrollAed, true)}</b>
            </button>

            {/* Unsubmitted Vault Items KPI Pill */}
            <button
              type="button"
              className="ex-kpi-pill"
              onClick={() => navigate('/expenses/receipts')}
            >
              <Receipt />
              <span>Unsubmitted vault items</span>
              <b>{summary.unbundledReceipts.length}</b>
            </button>

            {/* Manager / Finance Approvals Inbox Badge */}
            {showApprovalsTab && (
              <button
                type="button"
                className={cx(
                  'ex-kpi-pill',
                  approvals.totalCount > 0 ? 'ex-kpi-pill--warn' : 'ex-kpi-pill--ok',
                )}
                onClick={() => navigate('/expenses/approvals')}
              >
                <ShieldCheck />
                <span>Approvals inbox</span>
                <b>{approvals.totalCount}</b>
              </button>
            )}
          </div>
        </div>

        {/* Primary CTAs & Payroll Console Bridge */}
        <div className="ex-hero__cta">
          <button
            type="button"
            className="btn ex-btn-teal"
            onClick={() => navigate('/expenses/travel?new=1')}
          >
            <Plane /> Request travel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/expenses/receipts')}
          >
            <ScanLine /> Scan receipt
          </button>
          {canOpenPayroll && (
            <Link to="/payroll/reimbursements" className="ex-bridge-chip">
              Open Payroll Console →
            </Link>
          )}
        </div>
      </header>

      {/* Counter-Badged Navigation Tabs */}
      <nav className="tabs ex-tabs" aria-label="Travel & Expenses sections">
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
                <span
                  className={cx(
                    'ex-tab-count',
                    t.tone === 'alert' && 'ex-tab-count--alert',
                    t.tone === 'teal' && 'ex-tab-count--teal',
                  )}
                >
                  {t.count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Nested Workspace Routes */}
      <Routes>
        <Route index element={<OverviewView />} />
        <Route path="travel" element={<TravelDeskView />} />
        <Route path="receipts" element={<ReceiptVaultView />} />
        <Route path="reports" element={<ReportsView />} />
        <Route path="reimbursements" element={<ReimbursementsView />} />
        <Route path="approvals" element={<ApprovalsView />} />
        <Route path="*" element={<Navigate to="/expenses" replace />} />
      </Routes>
    </div>
  );
}
