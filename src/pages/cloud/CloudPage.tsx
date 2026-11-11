/**
 * Stratos · Cloud Console — NEO shell for /cloud/*
 * 6 sections: Overview, Services & SLOs, Clusters & Regions, Provisioning, Observability, FinOps & Carbon.
 */
import '@/styles/neo.css';
import '@/styles/cloud.css';
import { useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Activity,
  Cpu,
  Globe2,
  Plus,
  RotateCcw,
  Server,
  Siren,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { useCloudCapabilities } from '@/cloud/access';
import { computeFinOpsSummary, computeLiveAlerts } from '@/cloud/engine';
import { useCloud } from '@/cloud/store';
import { ClustersView } from './ClustersView';
import { FinOpsView } from './FinOpsView';
import { ObservabilityView } from './ObservabilityView';
import { OverviewView } from './OverviewView';
import { ProvisioningView } from './ProvisioningView';
import { ServicesView } from './ServicesView';
import { CloudNovaDrawer } from './parts';

const CLOUD_TINT = { c1: '#38bdf8', c2: '#0ea5e9' };

interface SectionMeta {
  to: string;
  end?: boolean;
  match?: (pathname: string) => boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/cloud',
    end: true,
    icon: <Globe2 />,
    eyebrow: 'Cloud deck',
    title: 'Stratos Cloud Console',
    sub: 'Multi-region infrastructure, SLO error budgets, policy-guarded provisioning, observability and FinOps & Carbon.',
  },
  {
    to: '/cloud/services',
    icon: <Activity />,
    eyebrow: 'Cloud deck · Services & SLOs',
    title: 'Services & SLOs',
    sub: 'Production service health, p95 latency, 30-day error-budget burn rates and blast-radius dependency graph.',
  },
  {
    to: '/cloud/clusters',
    match: (p) => p.startsWith('/cloud/clusters') || p === '/cloud/resources',
    icon: <Cpu />,
    eyebrow: 'Cloud deck · Clusters & Regions',
    title: 'Clusters & Regions',
    sub: 'Regional capacity quotas, Kubernetes nodepools, Aurora & Redis inventory, rightsizing and Terraform drift guard.',
  },
  {
    to: '/cloud/provisioning',
    icon: <Plus />,
    eyebrow: 'Cloud deck · Provisioning',
    title: 'Self-Service Provisioning',
    sub: 'Golden infrastructure templates with automated OPA security, UAE/EU residency and FinOps budget guardrails.',
  },
  {
    to: '/cloud/observability',
    icon: <Zap />,
    eyebrow: 'Cloud deck · Observability',
    title: 'Observability & Alerts',
    sub: 'Live firing alerts, OpenTelemetry distributed trace waterfalls, structured logs and Nova root-cause correlation.',
  },
  {
    to: '/cloud/finops',
    icon: <Wallet />,
    eyebrow: 'Cloud deck · FinOps & Carbon',
    title: 'FinOps & Carbon',
    sub: 'Team budgets, cost anomaly attribution, Savings Plans, rightsizing queue and GreenOps carbon-aware batch scheduling.',
  },
];

function ResourcesRouter() {
  const [params] = useSearchParams();
  if (params.get('new') === '1') {
    return <ProvisioningView />;
  }
  return <ClustersView />;
}

export function CloudPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const caps = useCloudCapabilities();
  const data = useCloud();
  const [novaOpen, setNovaOpen] = useState(false);

  const alerts = computeLiveAlerts(data, data.story);
  const finops = computeFinOpsSummary(data, data.story);

  const isProvisionDeepLink = pathname === '/cloud/resources' && params.get('new') === '1';

  const allItems: (NeoNavItem & { show: boolean })[] = [
    {
      to: '/cloud',
      label: 'Overview',
      icon: <Globe2 />,
      end: true,
      title: 'Global infrastructure map & fleet health',
      show: true,
    },
    {
      to: '/cloud/services',
      label: 'Services & SLOs',
      icon: <Activity />,
      badge: alerts.some((a) => a.rule.kind === 'burn') ? 1 : null,
      badgeTone: 'danger',
      title: 'Service catalog, SLOs & error budgets',
      show: true,
    },
    {
      to: '/cloud/clusters',
      label: 'Clusters & Regions',
      icon: <Cpu />,
      match: (p) => p.startsWith('/cloud/clusters') || (p === '/cloud/resources' && !isProvisionDeepLink),
      title: 'Regional clusters, inventory & drift guard',
      show: true,
    },
    {
      to: '/cloud/provisioning',
      label: 'Provisioning',
      icon: <Plus />,
      badge: data.requests.length || null,
      match: (p) => p.startsWith('/cloud/provisioning') || isProvisionDeepLink,
      title: 'Self-service IaC & 5-stage provisioning tracker',
      show: caps.canProvision,
    },
    {
      to: '/cloud/observability',
      label: 'Observability',
      icon: <Zap />,
      badge: alerts.length || null,
      badgeTone: 'danger',
      title: 'Live alerts, distributed traces & logs',
      show: caps.isEngineer,
    },
    {
      to: '/cloud/finops',
      label: 'FinOps & Carbon',
      icon: <Wallet />,
      badge: finops.openAnomaliesCount || null,
      title: 'Cloud spend, anomalies, commitments & GreenOps',
      show: true,
    },
  ];

  const items: NeoNavItem[] = allItems.filter((it) => it.show);

  const section = isProvisionDeepLink
    ? SECTIONS[3]
    : (SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0]);
  const isHome = section.to === '/cloud';

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={data.resetDemo}
        title="Reset Cloud Console demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--nova"
        onClick={() => setNovaOpen(true)}
        data-qa="cloud-nova-btn"
      >
        <Sparkles />
        <span className="neo-btn__label">Ask Nova</span>
      </button>
      {caps.canProvision && (
        <button
          type="button"
          className="neo-btn neo-btn--plasma"
          onClick={() => navigate('/cloud/provisioning')}
          data-qa="cloud-provision-btn"
        >
          <Plus />
          <span className="neo-btn__label">Provision</span>
        </button>
      )}
    </>
  );

  return (
    <NeoAppFrame
      app="cloud"
      tint={CLOUD_TINT}
      className="cloud-page"
      brand={{ icon: <Server />, label: 'Stratos Cloud', to: '/cloud' }}
      items={items}
      footer={
        caps.isEngineer
          ? [
              {
                to: '/incidents',
                label: 'Incidents',
                icon: <Siren />,
                title: 'Open Incident Command',
              },
            ]
          : undefined
      }
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions,
      }}
      overlays={<CloudNovaDrawer open={novaOpen} onClose={() => setNovaOpen(false)} />}
    >
      <Routes>
        <Route index element={<OverviewView />} />
        <Route path="services" element={<ServicesView />} />
        <Route path="clusters" element={<ClustersView />} />
        <Route path="provisioning" element={<ProvisioningView />} />
        <Route path="resources" element={<ResourcesRouter />} />
        <Route path="observability" element={<ObservabilityView />} />
        <Route path="finops" element={<FinOpsView />} />
        <Route path="*" element={<Navigate to="/cloud" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default CloudPage;
