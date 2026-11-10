/**
 * Travel & Expenses — "Spend deck".
 * NEO workspace: rail (Flow · Travel · Receipts · Reports · Payday, plus
 * Approvals and the Payroll bridge in the footer) + glass stage. The header
 * follows the active section; the Flow home adds attention banners, a HUD
 * ribbon and the Nova smart-receipt prompt (see OverviewView).
 */
import '@/styles/expenses.css';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  ExternalLink,
  FileSpreadsheet,
  Landmark,
  Plane,
  Plus,
  Receipt,
  Route as RouteIcon,
  ScanLine,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  useExpensesCaps,
  useMySpendSummary,
  useSpendApprovals,
} from '@/expenses/selectors';
import { initPayroll } from '@/payroll/store';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { RECEIPT_FILE_INPUT_ID } from './shared';
import { OverviewView } from './OverviewView';
import { TravelDeskView } from './TravelDeskView';
import { ReceiptVaultView } from './ReceiptVaultView';
import { ReportsView } from './ReportsView';
import { ReimbursementsView } from './ReimbursementsView';
import { ApprovalsView } from './ApprovalsView';

const TINT = { c1: '#2dd4bf', c2: '#0891b2' };

interface Section {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: Section[] = [
  { to: '/expenses', end: true, icon: <RouteIcon />, eyebrow: 'Spend deck', title: 'Trip-to-paycheck flow', sub: 'Describe a spend or a trip — Nova files it, policy-checks it and tracks it to payday.' },
  { to: '/expenses/travel', icon: <Plane />, eyebrow: 'Travel & Expenses · Travel desk', title: 'Travel desk', sub: 'Benchmark a trip, get pre-approval and a scoped virtual card in one flow.' },
  { to: '/expenses/receipts', icon: <ScanLine />, eyebrow: 'Travel & Expenses · Smart receipts', title: 'Receipt vault', sub: 'Drop a receipt — merchant, FX to AED, GL code and VAT are extracted for you.' },
  { to: '/expenses/reports', icon: <FileSpreadsheet />, eyebrow: 'Travel & Expenses · Claims', title: 'Expense reports', sub: 'Bundle receipts and per diem, split card vs out-of-pocket, submit for sign-off.' },
  { to: '/expenses/reimbursements', icon: <Wallet />, eyebrow: 'Travel & Expenses · Payday', title: 'Where’s my money?', sub: 'Every claim from manager sign-off to the WPS payout and your payslip.' },
  { to: '/expenses/approvals', icon: <ShieldCheck />, eyebrow: 'Travel & Expenses · Control', title: 'Approvals & audit', sub: 'Four-eyes review of trips and claims, then queue them into payroll.' },
];

export function ExpensesPage() {
  const me = useSessionUser();
  const perms = usePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const caps = useExpensesCaps();
  const summary = useMySpendSummary();
  const approvals = useSpendApprovals();

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

  const queuedReportsCount = useMemo(
    () => summary.myReports.filter((r) => r.status === 'payroll_queued').length,
    [summary.myReports],
  );

  const items: NeoNavItem[] = [
    { to: '/expenses', label: 'Flow', icon: <RouteIcon />, end: true, title: 'Trip-to-paycheck flow' },
    {
      to: '/expenses/travel',
      label: 'Travel',
      icon: <Plane />,
      badge: activeTripsCount || null,
      title: activeTripsCount ? `Travel desk · ${activeTripsCount} active trip${activeTripsCount === 1 ? '' : 's'}` : 'Travel desk',
    },
    {
      to: '/expenses/receipts',
      label: 'Receipts',
      icon: <Receipt />,
      badge: summary.unbundledReceipts.length || null,
      title: summary.unbundledReceipts.length ? `Receipt vault · ${summary.unbundledReceipts.length} not on a report yet` : 'Receipt vault',
    },
    {
      to: '/expenses/reports',
      label: 'Reports',
      icon: <FileSpreadsheet />,
      badge: draftOrRevisionReportsCount || null,
      badgeTone: 'danger',
      title: draftOrRevisionReportsCount ? `Expense reports · ${draftOrRevisionReportsCount} draft or needing changes` : 'Expense reports',
    },
    {
      to: '/expenses/reimbursements',
      label: 'Payday',
      icon: <Wallet />,
      badge: queuedReportsCount || null,
      title: queuedReportsCount ? `Payday · ${queuedReportsCount} claim${queuedReportsCount === 1 ? '' : 's'} queued for payroll` : 'Reimbursements & payday',
    },
  ];

  const footer: NeoNavItem[] = [];
  if (showApprovalsTab) {
    footer.push({
      to: '/expenses/approvals',
      label: 'Approvals',
      icon: <ShieldCheck />,
      badge: approvals.totalCount || null,
      badgeTone: 'danger',
      title: approvals.totalCount ? `Approvals & audit · ${approvals.totalCount} awaiting you` : 'Approvals & audit',
    });
  }
  if (canOpenPayroll) {
    footer.push({ to: '/payroll/reimbursements', label: 'Payroll', icon: <Landmark />, title: 'Payroll reimbursements bridge (opens Payroll Console)' });
  }

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/expenses';

  /** Opens the vault's file picker in the same click (keeps the user gesture), or routes there. */
  const scanReceipt = () => {
    const input = document.getElementById(RECEIPT_FILE_INPUT_ID) as HTMLInputElement | null;
    if (input) input.click();
    else navigate('/expenses/receipts?scan=1');
  };

  const scanButton = (
    <button type="button" className="neo-btn neo-btn--soft" onClick={scanReceipt} data-qa="ex-scan-receipt">
      <ScanLine /> <span className="neo-btn__label">Scan receipt</span>
    </button>
  );
  const travelButton = (
    <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('/expenses/travel?new=1')} data-qa="ex-request-travel">
      <Plane /> <span className="neo-btn__label">Request travel</span>
    </button>
  );

  let actions: ReactNode;
  switch (section.to) {
    case '/expenses/receipts':
      actions = (
        <>
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/expenses/reports?new=1')}>
            <FileSpreadsheet /> <span className="neo-btn__label">Bundle report</span>
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={scanReceipt} data-qa="ex-upload-receipt">
            <Upload /> <span className="neo-btn__label">Upload receipt</span>
          </button>
        </>
      );
      break;
    case '/expenses/reports':
      actions = (
        <>
          {scanButton}
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('/expenses/reports?new=1')} data-qa="ex-new-report">
            <Plus /> <span className="neo-btn__label">New report</span>
          </button>
        </>
      );
      break;
    case '/expenses/reimbursements':
      actions = (
        <>
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/hr/documents?tab=payslips')}>
            <ExternalLink /> <span className="neo-btn__label">My payslips</span>
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('/expenses/reports?new=1')}>
            <FileSpreadsheet /> <span className="neo-btn__label">Submit a report</span>
          </button>
        </>
      );
      break;
    case '/expenses/approvals':
      actions = canOpenPayroll ? (
        <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/payroll/reimbursements')}>
          <Landmark /> <span className="neo-btn__label">Settle in payroll</span>
        </button>
      ) : undefined;
      break;
    default:
      actions = (
        <>
          {scanButton}
          {travelButton}
        </>
      );
  }

  return (
    <NeoAppFrame
      app="expenses"
      tint={TINT}
      className="ex-page"
      brand={{ icon: <Receipt />, label: 'Travel & Expenses', to: '/expenses' }}
      items={items}
      footer={footer}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions,
      }}
    >
      <Routes>
        <Route index element={<OverviewView />} />
        <Route path="travel" element={<TravelDeskView />} />
        <Route path="receipts" element={<ReceiptVaultView />} />
        <Route path="reports" element={<ReportsView />} />
        <Route path="reimbursements" element={<ReimbursementsView />} />
        <Route path="approvals" element={<ApprovalsView />} />
        <Route path="*" element={<Navigate to="/expenses" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}
