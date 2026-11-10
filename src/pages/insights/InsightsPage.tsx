/**
 * Helix Insights — "Quantum Telemetry & Growth Cortex"
 * NEO workspace app for governed executive metrics, Nova Causal Copilot,
 * 5-stage growth funnel & A/B experimentation lab, 8-quarter cohort NDR
 * heatmaps, Z-score neural anomaly radar, and Monte-Carlo $100M ARR forecasting.
 */
import '@/styles/neo.css';
import '@/styles/insights.css';
import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  ChartNoAxesCombined,
  Filter,
  FlaskConical,
  Grid,
  LineChart,
  Orbit,
  Radar,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { useInsights } from '@/insights/store';
import { PulseView } from './PulseView';
import { FunnelView } from './FunnelView';
import { CohortsView } from './CohortsView';
import { AnomaliesView } from './AnomaliesView';
import { ForecastView } from './ForecastView';

const TINT = { c1: '#38bdf8', c2: '#6366f1' };

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
    to: '/insights',
    end: true,
    icon: <Activity />,
    eyebrow: 'Helix Insights · Quantum Telemetry & Growth Cortex',
    title: 'Executive Growth Pulse',
    sub: 'Governed North Star KPIs, Nova Natural-Language BI & Causal Copilot, and multi-layer revenue telemetry.',
  },
  {
    to: '/insights/funnel',
    icon: <Filter />,
    eyebrow: 'Helix Insights · Acquisition, Activation & Expansion',
    title: 'Full-Lifecycle Funnel & Experiment Lab',
    sub: '5-stage enterprise + PLG conversion architecture with 1-click A/B winner promotion.',
  },
  {
    to: '/insights/cohorts',
    icon: <Grid />,
    eyebrow: 'Helix Insights · Net Dollar Retention & Habit Loops',
    title: 'Retention Heatmap & Causal Feature Matrix',
    sub: '8-quarter NDR vintage heatmaps (108% → 145%) and propensity-matched causal feature drivers.',
  },
  {
    to: '/insights/anomalies',
    icon: <Radar />,
    eyebrow: 'Helix Insights · Real-Time Statistical Surveillance',
    title: 'Neural Anomaly & Signal Radar',
    sub: 'Automated Z-score breakout & friction detection (|Z| > 2.5σ) with root-cause attribution.',
  },
  {
    to: '/insights/forecast',
    icon: <LineChart />,
    eyebrow: 'Helix Insights · Stochastic FP&A Horizon',
    title: 'Monte-Carlo Growth & $100M ARR Modeler',
    sub: 'Interactive 8-quarter confidence fan (P10 / P50 / P90), Rule of 40 frontier, and board scenario snapshots.',
  },
];

export function InsightsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const experiments = useInsights((s) => s.experiments);
  const anomalies = useInsights((s) => s.anomalies);
  const resetInsights = useInsights((s) => s.resetInsights);

  const runningExpCount = experiments.filter((e) => e.status === 'running').length;
  const activeAnomCount = anomalies.filter((a) => a.status === 'active').length;

  const items: NeoNavItem[] = [
    {
      to: '/insights',
      label: 'Pulse',
      icon: <Activity />,
      end: true,
      title: 'Executive Growth Pulse & Nova Causal Copilot',
    },
    {
      to: '/insights/funnel',
      label: 'Funnel',
      icon: <FlaskConical />,
      badge: runningExpCount || null,
      title: `Full-Lifecycle Funnel & Experiment Lab (${runningExpCount} running)`,
    },
    {
      to: '/insights/cohorts',
      label: 'Cohorts',
      icon: <Grid />,
      title: 'Retention Heatmap & Causal Feature Matrix',
    },
    {
      to: '/insights/anomalies',
      label: 'Anomalies',
      icon: <Radar />,
      badge: activeAnomCount || null,
      badgeTone: 'danger',
      title: `Neural Anomaly & Signal Radar (${activeAnomCount} active)`,
    },
    {
      to: '/insights/forecast',
      label: 'Forecast',
      icon: <LineChart />,
      title: 'Monte-Carlo Growth & $100M ARR Modeler',
    },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={() => resetInsights()}
        title="Restore baseline telemetry seed"
        data-qa="ins-reset-demo"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Telemetry</span>
      </button>
      {section.to !== '/insights/forecast' ? (
        <button
          type="button"
          className="neo-btn neo-btn--plasma"
          onClick={() => navigate('/insights/forecast')}
          data-qa="ins-open-forecast"
        >
          <Sparkles />
          <span className="neo-btn__label">$100M ARR Modeler</span>
        </button>
      ) : (
        <button
          type="button"
          className="neo-btn neo-btn--plasma"
          onClick={() => navigate('/insights')}
        >
          <Activity />
          <span className="neo-btn__label">Executive Pulse</span>
        </button>
      )}
    </>
  );

  return (
    <NeoAppFrame
      app="insights"
      tint={TINT}
      className="ins-page"
      brand={{ icon: <ChartNoAxesCombined />, label: 'Helix Insights', to: '/insights' }}
      items={items}
      footer={[
        {
          to: '/crm',
          label: 'CRM',
          icon: <Orbit />,
          title: 'Open Helix CRM · Autonomous Revenue & Growth Orbit',
        },
      ]}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: section.title,
        sub: section.sub,
        actions,
      }}
    >
      <Routes>
        <Route index element={<PulseView />} />
        <Route path="funnel" element={<FunnelView />} />
        <Route path="cohorts" element={<CohortsView />} />
        <Route path="anomalies" element={<AnomaliesView />} />
        <Route path="forecast" element={<ForecastView />} />
        <Route path="*" element={<Navigate to="/insights" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default InsightsPage;
