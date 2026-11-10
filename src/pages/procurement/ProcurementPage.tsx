/**
 * Helix Procurement — "Autonomous Source-to-Pay & Vendor Orbit"
 * NEO Workspace shell with 5 interactive views:
 *   - /procurement           -> Intake & Command (`CommandView`)
 *   - /procurement/requests  -> Requisitions & Approval Constellation (`RequestsView`)
 *   - /procurement/vendors   -> Vendor 360 & License Optimization Radar (`VendorsView`)
 *   - /procurement/contracts -> Contract Vault, AI Redlines & Renewal Radar (`ContractsView`)
 *   - /procurement/orders    -> Purchase Orders & 3-Way Match Engine (`OrdersView`)
 */
import '@/styles/neo.css';
import '@/styles/procurement.css';
import { useMemo, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import {
  Building2,
  FileCheck2,
  FileSignature,
  Orbit,
  Plus,
  Radar,
  RotateCcw,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { calculateVendorIdleSeats } from '@/procurement/engine';
import { useProcurement } from '@/procurement/store';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { CommandView } from './CommandView';
import { ContractsView } from './ContractsView';
import { OrdersView } from './OrdersView';
import { NewRequestModal, RequestsView } from './RequestsView';
import { VendorsView } from './VendorsView';

const TINT = { c1: '#fbbf24', c2: '#10b981' };

interface SectionMeta {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/procurement',
    end: true,
    icon: <Orbit />,
    eyebrow: 'Helix Procurement · Autonomous Source-to-Pay',
    title: 'Autonomous Source-to-Pay & Vendor Orbit',
    sub: 'Scope any purchase with Nova P25 peer benchmarks, route across the 5-stage parallel approval constellation, and reclaim idle SaaS spend.',
  },
  {
    to: '/procurement/requests',
    icon: <Radar />,
    eyebrow: 'Helix Procurement · Approval Constellation',
    title: 'Requisitions & 5-Stage Parallel Approvals',
    sub: 'Requester → Budget Owner → Security & Privacy (SOC2/DPA) → Legal Redline → Finance Controller in 1.8 days.',
  },
  {
    to: '/procurement/vendors',
    icon: <Building2 />,
    eyebrow: 'Helix Procurement · Vendor 360 & SCIM Radar',
    title: 'Vendor 360 & License Optimization Radar',
    sub: 'Live SOC2/ISO/PDPL compliance rings, SCIM seat utilization telemetry, and 1-click idle license reclamation.',
  },
  {
    to: '/procurement/contracts',
    icon: <FileSignature />,
    eyebrow: 'Helix Procurement · Contract Vault & Redlines',
    title: 'Contract Vault, AI Redlines & Renewal Radar',
    sub: '30d/60d/90d renewal cliff radar, AI legal clause redlines, and 1-click Nova P25 counter-offers.',
  },
  {
    to: '/procurement/orders',
    icon: <FileCheck2 />,
    eyebrow: 'Helix Procurement · 3-Way Match Engine',
    title: 'Purchase Orders & 3-Way Match Engine',
    sub: 'Automated verification across Purchase Order ↔ SCIM/Goods Receipt ↔ Vendor Invoice with department budget envelopes.',
  },
];

export function ProcurementPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const [sp, setSp] = useSearchParams();

  const requests = useProcurement((s) => s.requests);
  const vendors = useProcurement((s) => s.vendors);
  const contracts = useProcurement((s) => s.contracts);
  const purchaseOrders = useProcurement((s) => s.purchaseOrders);
  const resetProcurement = useProcurement((s) => s.resetProcurement);

  const openRequestsCount = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === 'pending_approval' ||
          r.status === 'negotiating' ||
          r.status === 'approved',
      ).length,
    [requests],
  );

  const vendorsWithIdleCount = useMemo(
    () => vendors.filter((v) => calculateVendorIdleSeats(v).idleSeats > 0).length,
    [vendors],
  );

  const urgentRenewalsCount = useMemo(
    () => contracts.filter((c) => c.daysUntilCliff <= 30 && !c.counterOfferApplied).length,
    [contracts],
  );

  const variancePosCount = useMemo(
    () => purchaseOrders.filter((p) => p.matchStatus === 'variance_flagged').length,
    [purchaseOrders],
  );

  const items: NeoNavItem[] = [
    {
      to: '/procurement',
      label: 'Command',
      icon: <Orbit />,
      end: true,
      title: 'Intake & Command Center',
    },
    {
      to: '/procurement/requests',
      label: 'Requests',
      icon: <Radar />,
      badge: openRequestsCount || null,
      title: `Requisitions & Approvals · ${openRequestsCount} active`,
    },
    {
      to: '/procurement/vendors',
      label: 'Vendors',
      icon: <Building2 />,
      badge: vendorsWithIdleCount || null,
      title: `Vendor 360 · ${vendorsWithIdleCount} vendors with reclaimable seats`,
    },
    {
      to: '/procurement/contracts',
      label: 'Contracts',
      icon: <FileSignature />,
      badge: urgentRenewalsCount || null,
      badgeTone: urgentRenewalsCount > 0 ? 'danger' : 'app',
      title: `Contract Vault · ${urgentRenewalsCount} urgent renewal cliffs`,
    },
    {
      to: '/procurement/orders',
      label: 'Orders',
      icon: <FileCheck2 />,
      badge: variancePosCount || null,
      badgeTone: variancePosCount > 0 ? 'danger' : 'app',
      title: `Purchase Orders & 3-Way Match · ${variancePosCount} variance flagged`,
    },
  ];

  const footer: NeoNavItem[] = [
    {
      to: '/expenses',
      label: 'Spend',
      icon: <Wallet />,
      title: 'Open Travel & Expenses Deck',
    },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/procurement';
  const isNewModalOpen = sp.get('new') === '1';

  const openNewModal = () => {
    const next = new URLSearchParams(sp);
    next.set('new', '1');
    setSp(next, { replace: true });
  };

  const closeNewModal = () => {
    const next = new URLSearchParams(sp);
    next.delete('new');
    setSp(next, { replace: true });
  };

  const headActions = (
    <div className="pr-row-actions">
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        title="Reset procurement demo data"
        onClick={() => {
          resetProcurement();
          toast.info('Procurement workspace reset to initial seed state');
        }}
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        data-qa="pr-header-new-request"
        onClick={openNewModal}
      >
        <Plus />
        <span className="neo-btn__label">New Purchase Request</span>
      </button>
    </div>
  );

  return (
    <NeoAppFrame
      app="procurement"
      tint={TINT}
      className="pr-page"
      brand={{ icon: <ShoppingBag />, label: 'Helix Procurement', to: '/procurement' }}
      items={items}
      footer={footer}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions: headActions,
      }}
      overlays={<NewRequestModal open={isNewModalOpen} onClose={closeNewModal} />}
    >
      <Routes>
        <Route index element={<CommandView />} />
        <Route path="requests" element={<RequestsView />} />
        <Route path="vendors" element={<VendorsView />} />
        <Route path="contracts" element={<ContractsView />} />
        <Route path="orders" element={<OrdersView />} />
        <Route path="*" element={<Navigate to="/procurement" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}
