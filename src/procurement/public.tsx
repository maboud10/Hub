/**
 * Public App Bridge for Helix Procurement (see src/lib/appBridge.ts).
 *
 * Powers the global ⌘K Command Palette and Settings → Reset demo for
 * autonomous intake, vendor radar, contracts, and purchase orders.
 */
import { Building2, FileSignature, PackageCheck, Radar, ShoppingBag, Sparkles } from 'lucide-react';
import type { AppPublicApi, BridgeViewer, PaletteEntry } from '@/lib/appBridge';
import { formatUsd } from './engine';
import { useProcurement } from './store';

function hasProcurementAccess(viewer: BridgeViewer): boolean {
  return viewer.perms.has('*') || viewer.perms.has('app:procurement');
}

export const api: AppPublicApi = {
  appId: 'procurement',

  paletteEntries(viewer) {
    if (!hasProcurementAccess(viewer)) return [];
    const st = useProcurement.getState();
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `procurement:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['procurement', 'purchasing', 'vendor', 'spend', ...keywords], hint: 'Open' });

    action('command', 'Source-to-Pay Command Center', '/procurement', <Radar />, ['command', 'spend', 'savings', 'maverick'], 'Spend velocity, savings radar & approval queue');
    action('intake', 'New AI Intake & Scoping Request', '/procurement/requests', <Sparkles />, ['intake', 'request', 'purchase', 'buy', 'software'], 'Draft a purchase requisition with Nova');
    action('vendors', 'Vendor Intelligence Matrix', '/procurement/vendors', <Building2 />, ['vendors', 'suppliers', 'security', 'esg', 'soc2'], 'Security, ESG & SLA telemetry');
    action('contracts', 'Contract Renewal Radar & Playbooks', '/procurement/contracts', <FileSignature />, ['contracts', 'renewals', 'negotiate', 'clauses'], 'Auto-renew countdowns & AI counter-offers');
    action('orders', 'Purchase Orders & 3-Way Match', '/procurement/orders', <PackageCheck />, ['orders', 'po', 'invoices', 'match'], 'POs, goods receipts & invoice verification');

    for (const r of st.requests) {
      out.push({
        id: `procurement:req:${r.id}`,
        group: 'Work',
        title: `${r.id} · ${r.title}`,
        subtitle: `${r.vendorName} · ${formatUsd(r.negotiatedAnnualUsd)} · ${r.status}`,
        icon: <ShoppingBag />,
        glyphColor: r.vendorColor,
        keywords: ['procurement', 'request', r.id.toLowerCase(), r.title.toLowerCase(), r.vendorName.toLowerCase(), r.category.toLowerCase(), r.department.toLowerCase()],
        hint: 'Inspect PR',
        to: '/procurement/requests',
      });
    }

    for (const v of st.vendors) {
      out.push({
        id: `procurement:ven:${v.id}`,
        group: 'Work',
        title: v.name,
        subtitle: `${v.tier} · ${formatUsd(v.annualSpendUsd)}/yr · Security ${v.securityScore}/100`,
        icon: <Building2 />,
        glyphColor: v.color,
        keywords: ['procurement', 'vendor', 'supplier', v.name.toLowerCase(), v.category.toLowerCase(), v.regionResidency.toLowerCase()],
        hint: 'Vendor 360',
        to: '/procurement/vendors',
      });
    }

    return out;
  },

  resetDemo() {
    useProcurement.getState().resetProcurement();
  },
};
