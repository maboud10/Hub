/**
 * DevHub ("Forge") — NEO shell for /devhub/*
 * 6 sections: Cockpit, Reviews, Pipelines, Deploys, Services, Insights.
 */
import '@/styles/neo.css';
import '@/styles/devhub.css';
import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  BarChart3,
  Boxes,
  Cloud,
  Flame,
  GitBranch,
  GitPullRequest,
  Lock,
  Rocket,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Chip, NeoAppFrame, NeoTabs, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { reviewQueue } from '@/devhub/engine';
import { useDevHub } from '@/devhub/store';
import { CockpitView } from './CockpitView';
import { DeploysView } from './DeploysView';
import { InsightsView } from './InsightsView';
import { PipelinesView } from './PipelinesView';
import { ReviewsView } from './ReviewsView';
import { ServicesView } from './ServicesView';
import { DEVHUB_TINT, NovaForgeDrawer, useDevHubLive } from './parts';

interface SectionMeta {
  to: string;
  key: 'cockpit' | 'reviews' | 'pipelines' | 'deploys' | 'services' | 'insights';
  label: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/devhub',
    key: 'cockpit',
    label: 'Cockpit',
    end: true,
    icon: <GitBranch />,
    eyebrow: 'DevHub deck',
    title: 'Forge Engineering Cockpit',
    sub: 'Commit-to-production delivery stream, Nova AI review copilot, canary health gates and SLA queues.',
  },
  {
    to: '/devhub/reviews',
    key: 'reviews',
    label: 'Reviews',
    icon: <GitPullRequest />,
    eyebrow: 'DevHub deck · Reviews',
    title: 'Pull Requests & Code Reviews',
    sub: 'Explainable risk breakdown, CODEOWNERS suggestions, syntax-tinted diffs and Aegis push protection.',
  },
  {
    to: '/devhub/pipelines',
    key: 'pipelines',
    label: 'Pipelines',
    icon: <Activity />,
    eyebrow: 'DevHub deck · Pipelines',
    title: 'CI/CD Pipelines & Flaky Radar',
    sub: '5-stage SLSA L3 build tracker, remote cache & runner cost telemetry, and flaky test quarantine.',
  },
  {
    to: '/devhub/deploys',
    key: 'deploys',
    label: 'Deploys',
    icon: <Rocket />,
    eyebrow: 'DevHub deck · Deploys',
    title: 'Progressive Deploys & Canary Control',
    sub: 'Interactive canary traffic dial, automated SLO health gates, 1-click rollbacks and feature flags.',
  },
  {
    to: '/devhub/services',
    key: 'services',
    label: 'Services',
    icon: <Boxes />,
    eyebrow: 'DevHub deck · Services',
    title: 'Service Catalog & Golden Path',
    sub: 'Ownership scorecards, dependency blast radius, 6-step service scaffolder and cross-repo code search.',
  },
  {
    to: '/devhub/insights',
    key: 'insights',
    label: 'Insights',
    icon: <BarChart3 />,
    eyebrow: 'DevHub deck · Insights',
    title: 'DORA Metrics & Review Equity',
    sub: 'Four keys velocity, end-to-end cycle time breakdown, reviewer load balance and DevEx pulse.',
  },
];

export function DevHubPage() {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const live = useDevHubLive();

  const prs = useDevHub((s) => s.prs);
  const runs = useDevHub((s) => s.runs);
  const deploys = useDevHub((s) => s.deploys);
  const resetDemo = useDevHub((s) => s.resetDemo);

  const [novaOpen, setNovaOpen] = useState(false);
  const [novaPrompt, setNovaPrompt] = useState<string | undefined>(undefined);

  const openNova = (prompt?: string) => {
    setNovaPrompt(prompt);
    setNovaOpen(true);
  };

  const counts = useMemo(() => {
    const rev = reviewQueue(prs, userId).length;
    const failedRuns = runs.filter((r) => r.status === 'failed').length;
    const activeCanaries = deploys.filter((d) => d.env === 'production' && d.status === 'in_progress').length;
    return { rev, failedRuns, activeCanaries };
  }, [prs, runs, deploys, userId]);

  const items: NeoNavItem[] = [
    { to: '/devhub', label: 'Cockpit', icon: <GitBranch />, end: true, title: 'Forge Engineering Cockpit' },
    {
      to: '/devhub/reviews',
      label: 'Reviews',
      icon: <GitPullRequest />,
      badge: counts.rev || null,
      title: 'Pull requests & code reviews',
    },
    {
      to: '/devhub/pipelines',
      label: 'Pipelines',
      icon: <Activity />,
      badge: counts.failedRuns || null,
      badgeTone: 'danger',
      title: 'CI/CD pipeline runs',
    },
    {
      to: '/devhub/deploys',
      label: 'Deploys',
      icon: <Rocket />,
      badge: counts.activeCanaries || null,
      title: 'Canary rollouts & rollback control',
    },
    { to: '/devhub/services', label: 'Services', icon: <Boxes />, title: 'Service catalog & golden path' },
    { to: '/devhub/insights', label: 'Insights', icon: <BarChart3 />, title: 'DORA metrics & review load' },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/devhub';

  const actions = (
    <>
      {live.freezeState.frozen && (
        <Chip tone="danger" icon={<Lock />}>
          <span>Deploy Freeze</span>
        </Chip>
      )}
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetDemo}
        title="Reset DevHub demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={() => openNova()}
        data-qa="devhub-nova-btn"
      >
        <Sparkles />
        <span className="neo-btn__label">Nova Copilot</span>
      </button>
    </>
  );

  const toolbar = (
    <div className="dh-top-tabs">
      <NeoTabs<SectionMeta['key']>
        label="DevHub navigation"
        value={section.key}
        onChange={(key) => {
          const target = SECTIONS.find((s) => s.key === key);
          if (target) navigate(target.to);
        }}
        items={SECTIONS.map((s) => ({
          value: s.key,
          label: s.label,
          icon: s.icon,
          count:
            s.key === 'reviews'
              ? counts.rev || null
              : s.key === 'pipelines'
                ? counts.failedRuns || null
                : s.key === 'deploys'
                  ? counts.activeCanaries || null
                  : null,
        }))}
      />
    </div>
  );

  return (
    <NeoAppFrame
      app="devhub"
      tint={DEVHUB_TINT}
      className="devhub-page"
      brand={{ icon: <GitBranch />, label: 'DevHub Forge', to: '/devhub' }}
      items={items}
      footer={[
        { to: '/cloud', label: 'Cloud', icon: <Cloud />, title: 'Open Cloud Console (Stratos)' },
        { to: '/incidents', label: 'Incidents', icon: <Flame />, title: 'Open Incident Command (Sentinel)' },
      ]}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions,
      }}
      toolbar={toolbar}
      overlays={
        <NovaForgeDrawer
          open={novaOpen}
          onClose={() => setNovaOpen(false)}
          initialPrompt={novaPrompt}
        />
      }
    >
      <Routes>
        <Route index element={<CockpitView onOpenNova={openNova} />} />
        <Route path="reviews" element={<ReviewsView />} />
        <Route path="pipelines" element={<PipelinesView />} />
        <Route path="deploys" element={<DeploysView />} />
        <Route path="services" element={<ServicesView />} />
        <Route path="insights" element={<InsightsView />} />
        <Route path="*" element={<Navigate to="/devhub" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default DevHubPage;
