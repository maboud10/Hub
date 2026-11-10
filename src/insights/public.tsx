/**
 * Public App Bridge for Helix Insights (see src/lib/appBridge.ts).
 *
 * Powers the global ⌘K Command Palette and Settings → Reset demo for
 * governed metrics, funnels, retention cohorts, anomalies, and ARR scenarios.
 */
import { Activity, AlertTriangle, Cpu, Filter, Grid3x3, LineChart, Sparkles } from 'lucide-react';
import type { AppPublicApi, BridgeViewer, PaletteEntry } from '@/lib/appBridge';
import { useInsights } from './store';

function hasInsightsAccess(viewer: BridgeViewer): boolean {
  return viewer.perms.has('*') || viewer.perms.has('app:analytics') || viewer.perms.has('hub.analytics.view');
}

export const api: AppPublicApi = {
  appId: 'insights',

  paletteEntries(viewer) {
    if (!hasInsightsAccess(viewer)) return [];
    const st = useInsights.getState();
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `insights:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['insights', 'analytics', 'metrics', 'bi', ...keywords], hint: 'Open' });

    action('pulse', 'Executive Pulse & North Star', '/insights', <Activity />, ['pulse', 'north star', 'kpi', 'executive', 'ask nova'], 'Governed metrics & natural-language BI');
    action('funnel', 'Growth Funnel & Experiment Lab', '/insights/funnel', <Filter />, ['funnel', 'conversion', 'ab test', 'experiments', 'plg'], 'Conversion waterfall & live A/B tests');
    action('cohorts', 'Retention & NRR Cohort Matrix', '/insights/cohorts', <Grid3x3 />, ['cohorts', 'retention', 'nrr', 'churn', 'expansion'], '8-quarter logo & dollar retention heatmap');
    action('anomalies', 'AI Anomaly & Signal Radar', '/insights/anomalies', <AlertTriangle />, ['anomalies', 'radar', 'root cause', 'rca', 'signals'], 'Real-time Z-score deviation & root-cause engine');
    action('forecast', 'Monte-Carlo $100M ARR Modeler', '/insights/forecast', <Cpu />, ['forecast', 'monte carlo', 'arr', 'trajectory', 'projection'], '8-quarter Monte Carlo confidence fan');
    action('ask-nova', 'Ask Nova Natural-Language BI', '/insights', <Sparkles />, ['nova', 'nlq', 'query', 'sql', 'question'], 'Synthesize governed metrics in plain English');

    for (const m of st.metrics) {
      out.push({
        id: `insights:metric:${m.id}`,
        group: 'Work',
        title: m.name,
        subtitle: `${m.value} · ${m.delta} · ${m.category}`,
        icon: <LineChart />,
        glyphColor: m.color,
        keywords: ['insights', 'metric', 'kpi', m.code.toLowerCase(), m.name.toLowerCase(), m.category.toLowerCase(), m.warehouseTable.toLowerCase()],
        hint: 'Inspect metric',
        to: `/insights?metric=${m.id}`,
      });
    }

    for (const a of st.anomalies) {
      if (a.status === 'resolved') continue;
      out.push({
        id: `insights:anom:${a.id}`,
        group: 'Work',
        title: `${a.code} · ${a.title}`,
        subtitle: `${a.category.toUpperCase()} · ${a.deltaLabel} (${a.zScore > 0 ? '+' : ''}${a.zScore}σ) · ${a.segmentLabel}`,
        icon: <AlertTriangle />,
        glyphColor: a.category === 'friction' ? '#fb7185' : '#34d399',
        keywords: ['insights', 'anomaly', a.code.toLowerCase(), a.title.toLowerCase(), a.metricName.toLowerCase(), a.segmentLabel.toLowerCase()],
        hint: 'Root cause',
        to: '/insights/anomalies',
      });
    }

    return out;
  },

  resetDemo() {
    useInsights.getState().resetInsights();
  },
};
