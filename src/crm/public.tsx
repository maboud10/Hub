/**
 * Public App Bridge for Helix CRM (see src/lib/appBridge.ts).
 *
 * Powers the global ⌘K Command Palette, Settings → Reset demo, and cross-app
 * growth play triggers from Helix Insights.
 */
import { Building2, Columns3, Cpu, Flame, Radar, Sparkles, Zap } from 'lucide-react';
import type { AppPublicApi, BridgeViewer, PaletteEntry } from '@/lib/appBridge';
import { computeDealWinProbability, formatCompactUsd } from './engine';
import { DEAL_STAGES } from './seed';
import { useCrm } from './store';

function hasCrmAccess(viewer: BridgeViewer): boolean {
  return viewer.perms.has('*') || viewer.perms.has('app:crm');
}

export const api: AppPublicApi = {
  appId: 'crm',

  paletteEntries(viewer) {
    if (!hasCrmAccess(viewer)) return [];
    const st = useCrm.getState();
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `crm:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['crm', 'revenue', 'sales', 'growth', ...keywords], hint: 'Open' });

    action('command', 'Revenue Command Center', '/crm', <Radar />, ['command', 'forecast', 'quota', 'pipeline'], 'AI revenue pulse & next-best actions');
    action('pipeline', 'Deal Pipeline & MEDDPICC', '/crm/pipeline', <Columns3 />, ['pipeline', 'deals', 'kanban', 'meddpicc', 'win probability'], 'Inspect active enterprise deals');
    action('accounts', 'Account 360 & Champion Graph', '/crm/accounts', <Building2 />, ['accounts', 'customers', 'nrr', 'churn', 'expansion', 'health'], 'Product telemetry & stakeholder graph');
    action('playbooks', 'Autonomous Growth Playbooks', '/crm/playbooks', <Zap />, ['playbooks', 'plays', 'automation', 'pql', 'signals'], 'Trigger AI expansion & rescue plays');
    action('simulator', 'ARR Growth Simulator', '/crm/simulator', <Cpu />, ['simulator', 'monte carlo', 'arr', 'projection', 'what-if'], 'Model win-rate & NRR compounding');
    action('autopilot', 'Run Nova Growth Autopilot', '/crm/playbooks', <Sparkles />, ['nova', 'autopilot', 'ai', 'accelerate'], 'Execute autonomous revenue plays');

    for (const d of st.deals) {
      const stageMeta = DEAL_STAGES.find((s) => s.id === d.stage);
      const winProb = computeDealWinProbability(d);
      out.push({
        id: `crm:deal:${d.id}`,
        group: 'Work',
        title: `${d.accountName} · ${d.title}`,
        subtitle: `${stageMeta?.label ?? d.stage} · ${formatCompactUsd(d.acv)} ACV · ${winProb}% win prob`,
        icon: <Flame />,
        glyphColor: stageMeta?.color ?? d.color,
        keywords: ['crm', 'deal', d.id.toLowerCase(), d.title.toLowerCase(), d.accountName.toLowerCase(), d.stage, d.region.toLowerCase()],
        hint: 'Inspect deal',
        to: `/crm/pipeline?deal=${d.id}`,
      });
    }

    for (const a of st.accounts) {
      out.push({
        id: `crm:acc:${a.id}`,
        group: 'Work',
        title: a.name,
        subtitle: `${a.segment} · ${formatCompactUsd(a.arr)} ARR · ${a.nrr}% NRR · Health ${a.healthScore}/100`,
        icon: <Building2 />,
        glyphColor: a.color,
        keywords: ['crm', 'account', 'customer', a.name.toLowerCase(), a.industry.toLowerCase(), a.region.toLowerCase(), a.segment.toLowerCase()],
        hint: 'Account 360',
        to: `/crm/accounts?account=${a.id}`,
      });
    }

    return out;
  },

  resetDemo() {
    useCrm.getState().resetCrm();
  },
};
