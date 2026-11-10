/**
 * Payroll Console — "Payday Deck".
 * NEO workspace: rail (Pay run · Bonuses · Bands · Claims) + glass stage.
 * The header follows the active section; the Pay run home adds attention
 * banners and a live HUD ribbon (period, payday countdown, net, queues).
 */
import '@/styles/payroll.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Award, BadgeDollarSign, CalendarClock, Download, Landmark, Receipt, Scale, ShieldCheck, Wallet } from 'lucide-react';
import { NeoAppFrame, NeoBanner, NeoBanners, NeoKpi, NeoKpis, isNavActive, type NeoNavItem } from '@/components/neo';
import { generateWpsSif } from '@/payroll/engine';
import { useCompReport, useLivePayrollRuns, usePayrollCaps, useReimbursementQueueSummary } from '@/payroll/selectors';
import { initPayroll, usePayroll } from '@/payroll/store';
import { useExpenses } from '@/expenses/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { firstName, greeting } from '@/lib/format';
import { PayRunView } from './PayRunView';
import { BonusesView } from './BonusesView';
import { CompensationView } from './CompensationView';
import { ReimbursementsBridgeView } from './ReimbursementsBridgeView';
import { compactAed, daysUntilIso, downloadTextFile, formatAed, NominateBonusModal, RUN_STATUS_META, WpsSifModal } from './shared';

const TINT = { c1: '#4ade80', c2: '#0d9488' };

interface Section {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: Section[] = [
  { to: '/payroll', end: true, icon: <Wallet />, eyebrow: 'Payday deck', title: 'Pay run & payday', sub: 'Live sync from HR, Expenses and Bonuses → four-eyes sign-off → WPS file → payday.' },
  { to: '/payroll/bonuses', icon: <Award />, eyebrow: 'Payroll · Variable pay', title: 'Bonuses & spot awards', sub: 'Nominate performance, spot, signing, milestone and retention awards with four-eyes approval.' },
  { to: '/payroll/compensation', icon: <Scale />, eyebrow: 'Payroll · Compensation intelligence', title: 'Compensation & bands', sub: 'Salary bands, compa-ratio equity, total rewards and statutory UAE end-of-service liability.' },
  { to: '/payroll/reimbursements', icon: <Receipt />, eyebrow: 'Payroll · Settlement bridge', title: 'Reimbursements bridge', sub: 'Approved travel & expense claims and HR allowances, settled on payday or by express wire.' },
];

export function PayrollPage() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
  const pendingBonuses = useMemo(() => bonuses.filter((b) => b.status === 'pending_approval'), [bonuses]);
  const pendingBonusAed = useMemo(() => pendingBonuses.reduce((s, b) => s + b.amountAed, 0), [pendingBonuses]);
  const financeReadyCount = useMemo(() => expenseReports.filter((r) => r.status === 'manager_approved').length, [expenseReports]);
  const bridgeBadgeCount = reimbSummary.queuedExpenses.length + reimbSummary.approvedHrClaims.length + financeReadyCount;
  const queuedBridgeTotalAed = reimbSummary.queuedExpenseTotalAed + reimbSummary.approvedHrClaimsTotalAed;

  const paydayCountdown = useMemo(() => {
    if (!activeRun) return '—';
    if (activeRun.status === 'paid') return 'Settled';
    const d = daysUntilIso(activeRun.payDate);
    if (d === 0) return 'Today';
    if (d > 0) return `${d} day${d === 1 ? '' : 's'}`;
    return `${Math.abs(d)}d late`;
  }, [activeRun]);

  const items: NeoNavItem[] = [
    { to: '/payroll', label: 'Pay run', icon: <Wallet />, end: true, badge: activeRun?.status === 'pending_signoff' ? 1 : null, badgeTone: 'danger', title: 'Pay run & payday' },
    { to: '/payroll/bonuses', label: 'Bonuses', icon: <Award />, badge: pendingBonuses.length || null, title: pendingBonuses.length ? `Bonuses · ${pendingBonuses.length} awaiting sign-off` : 'Bonuses & variable pay' },
    { to: '/payroll/compensation', label: 'Bands', icon: <Scale />, badge: compReport.outliers.length || null, title: compReport.outliers.length ? `Compensation · ${compReport.outliers.length} band outliers` : 'Compensation & bands' },
    { to: '/payroll/reimbursements', label: 'Claims', icon: <Receipt />, badge: bridgeBadgeCount || null, title: 'Reimbursements bridge' },
  ];
  const footer: NeoNavItem[] = [{ to: '/expenses/approvals', label: 'T&E audit', icon: <ShieldCheck />, title: 'Travel & Expense audit (opens Travel & Expenses)' }];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/payroll';

  const handleDownloadWpsSif = () => {
    if (!activeRun) return;
    const sif = generateWpsSif(activeRun, users);
    downloadTextFile(`HELIX-WPS-${activeRun.period}.SIF`, sif, 'text/plain;charset=utf-8');
    toast.success(`Downloaded HELIX-WPS-${activeRun.period}.SIF`, `${activeRun.headcount} EDR records · ${formatAed(activeRun.totalNetAed)} net`);
    setSifOpen(true);
  };

  return (
    <NeoAppFrame
      app="payroll"
      tint={TINT}
      brand={{ icon: <Landmark />, label: 'Payroll Console', to: '/payroll' }}
      items={items}
      footer={footer}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: isHome ? 'Precision payday with four-eyes control — HR, Expenses and Bonuses synced live.' : section.sub,
        actions: (
          <>
            {caps.canNominateBonus && (
              <button type="button" className="neo-btn neo-btn--soft" onClick={() => setNominateOpen(true)}>
                <Award /> <span className="neo-btn__label">Nominate bonus</span>
              </button>
            )}
            <button type="button" className="neo-btn neo-btn--plasma" onClick={handleDownloadWpsSif} disabled={!activeRun}>
              <Download /> <span className="neo-btn__label">WPS .SIF</span>
            </button>
          </>
        ),
      }}
      overlays={
        <>
          <WpsSifModal open={sifOpen} onClose={() => setSifOpen(false)} run={activeRun} users={users} />
          <NominateBonusModal open={nominateOpen} onClose={() => setNominateOpen(false)} defaultPeriod={activeRun?.period} />
        </>
      }
    >
      {isHome && (
        <>
          {(activeRun?.status === 'pending_signoff' || financeReadyCount > 0) && (
            <NeoBanners>
              {activeRun?.status === 'pending_signoff' && (
                <NeoBanner tone="warning" icon={<ShieldCheck />} title={`${activeRun.label} awaits counter-signature`} meta={`Payday ${paydayCountdown.toLowerCase()}`}>
                  Four-eyes rule: the preparer can’t approve — a second Payroll approver must sign before the WPS file is released.
                </NeoBanner>
              )}
              {financeReadyCount > 0 && (
                <NeoBanner tone="cyan" icon={<Receipt />} title={`${financeReadyCount} expense report${financeReadyCount === 1 ? '' : 's'} ready for finance audit`} meta="Travel & Expenses" onClick={() => navigate('/expenses/approvals')}>
                  Audit GL codes and VAT, then queue them into this pay run.
                </NeoBanner>
              )}
            </NeoBanners>
          )}
          <NeoKpis label="Payroll at a glance">
            <NeoKpi icon={<ShieldCheck />} label="Active period" value={activeRun?.label ?? '—'} sub={activeRun ? RUN_STATUS_META[activeRun.status].label : 'Initializing'} />
            <NeoKpi icon={<CalendarClock />} label="Payday in" value={paydayCountdown} sub={`Value ${activeRun?.payDate ?? '—'} · cut-off ${activeRun?.cutoffDate ?? '—'}`} tone={activeRun && activeRun.status !== 'paid' && daysUntilIso(activeRun.payDate) < 0 ? 'danger' : undefined} />
            <NeoKpi icon={<BadgeDollarSign />} label="Total net" value={activeRun ? compactAed(activeRun.totalNetAed) : '—'} sub={`${activeRun?.headcount ?? 0} salaried employees`} />
            <NeoKpi icon={<Receipt />} label="Queued claims" value={compactAed(queuedBridgeTotalAed)} sub={`${reimbSummary.queuedExpenses.length} T&E · ${reimbSummary.approvedHrClaims.length} HR`} to="/payroll/reimbursements" />
            <NeoKpi icon={<Award />} label="Bonus sign-offs" value={pendingBonuses.length} sub={compactAed(pendingBonusAed)} tone={pendingBonuses.length ? 'warning' : undefined} to="/payroll/bonuses" />
          </NeoKpis>
        </>
      )}
      <Routes>
        <Route index element={<PayRunView />} />
        <Route path="bonuses" element={<BonusesView />} />
        <Route path="compensation" element={<CompensationView />} />
        <Route path="reimbursements" element={<ReimbursementsBridgeView />} />
        <Route path="*" element={<Navigate to="/payroll" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}
