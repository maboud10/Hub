import '@/styles/neo.css';
import '@/styles/crm.css';
import { useMemo, type ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import {
  Building2,
  Columns3,
  Orbit,
  Plus,
  Radar,
  RotateCcw,
  Sliders,
  Workflow,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { useCrm } from '@/crm/store';
import { AccountsView } from './AccountsView';
import { CommandView } from './CommandView';
import { PipelineView } from './PipelineView';
import { PlaybooksView } from './PlaybooksView';
import { SimulatorView } from './SimulatorView';
import { DealInspectorDrawer, NewDealModal } from './shared';

const CRM_TINT = { c1: '#fb923c', c2: '#ec4899' };

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
    to: '/crm',
    end: true,
    icon: <Orbit />,
    eyebrow: 'Helix CRM · Autonomous Revenue & Growth Orbit',
    title: 'Revenue Command',
    sub: 'Live ARR telemetry, Nova deal synthesis, tri-band forecast curves & 1-click autonomous closing plays.',
  },
  {
    to: '/crm/pipeline',
    icon: <Columns3 />,
    eyebrow: 'Helix CRM · Deal Pipeline & MEDDPICC Matrix',
    title: 'Deal Pipeline & MEDDPICC',
    sub: 'Interactive 8-pillar MEDDPICC qualification, neural win-probability scoring & stage progression.',
  },
  {
    to: '/crm/accounts',
    icon: <Building2 />,
    eyebrow: 'Helix CRM · Customer 360 & Expansion Radar',
    title: 'Customer 360 & White-Space',
    sub: 'Enterprise seat utilization, NRR health, and 5-module product adoption white-space radar.',
  },
  {
    to: '/crm/playbooks',
    icon: <Workflow />,
    eyebrow: 'Helix CRM · Autonomous Growth Loops',
    title: 'Playbooks & Dark-Funnel Signals',
    sub: 'Real-time buying intent surges wired to zero-touch expansion, Arabic RTL outreach & security auto-rooms.',
  },
  {
    to: '/crm/simulator',
    icon: <Sliders />,
    eyebrow: 'Helix CRM · Revenue & Quota Simulator',
    title: 'Revenue & Quota Simulator',
    sub: 'Model win-rate uplift, cycle compression, NDR & Nova AI attach across global regional pods.',
  },
];

export function CrmPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const deals = useCrm((s) => s.deals);
  const accounts = useCrm((s) => s.accounts);
  const playbooks = useCrm((s) => s.playbooks);
  const growthPlays = useCrm((s) => s.growthPlays);
  const selectedDealId = useCrm((s) => s.selectedDealId);
  const setSelectedDealId = useCrm((s) => s.setSelectedDealId);
  const resetCrm = useCrm((s) => s.resetCrm);

  const isNewDealOpen = searchParams.get('new') === '1';

  const openNewDeal = () => {
    const next = new URLSearchParams(searchParams);
    next.set('new', '1');
    setSearchParams(next);
  };

  const closeNewDeal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };

  const openDealsCount = useMemo(
    () => deals.filter((d) => d.stage !== 'won').length,
    [deals],
  );
  const activePlaysCount = useMemo(
    () => growthPlays.filter((p) => !p.executed).length,
    [growthPlays],
  );
  const armedPlaybooksCount = useMemo(
    () => playbooks.filter((p) => p.enabled).length,
    [playbooks],
  );

  const items: NeoNavItem[] = [
    {
      to: '/crm',
      label: 'Command',
      icon: <Orbit />,
      end: true,
      badge: activePlaysCount || null,
      title: 'Revenue Command & Nova Copilot',
    },
    {
      to: '/crm/pipeline',
      label: 'Pipeline',
      icon: <Columns3 />,
      badge: openDealsCount || null,
      title: 'Deal Pipeline & 8-Pillar MEDDPICC Matrix',
    },
    {
      to: '/crm/accounts',
      label: 'Accounts',
      icon: <Building2 />,
      badge: accounts.length || null,
      title: 'Customer 360 & Expansion White-Space Radar',
    },
    {
      to: '/crm/playbooks',
      label: 'Playbooks',
      icon: <Workflow />,
      badge: armedPlaybooksCount || null,
      title: 'Autonomous Growth Loops & Dark-Funnel Signals',
    },
    {
      to: '/crm/simulator',
      label: 'Simulator',
      icon: <Sliders />,
      title: 'Revenue & Quota Simulator',
    },
  ];

  const section =
    SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/crm';

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={() => navigate('/crm/simulator')}
      >
        <Radar />
        <span className="neo-btn__label">Quota Simulator</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetCrm}
        title="Reset CRM demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={openNewDeal}
        data-qa="crm-new-deal"
      >
        <Plus />
        <span className="neo-btn__label">New Deal</span>
      </button>
    </>
  );

  return (
    <NeoAppFrame
      app="crm"
      tint={CRM_TINT}
      className="crm-page"
      brand={{ icon: <Orbit />, label: 'Helix CRM', to: '/crm' }}
      items={items}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions,
      }}
      overlays={
        <>
          <DealInspectorDrawer
            dealId={selectedDealId}
            onClose={() => setSelectedDealId(null)}
          />
          <NewDealModal open={isNewDealOpen} onClose={closeNewDeal} />
        </>
      }
    >
      <Routes>
        <Route index element={<CommandView />} />
        <Route
          path="pipeline"
          element={<PipelineView onOpenNewDeal={openNewDeal} />}
        />
        <Route path="accounts" element={<AccountsView />} />
        <Route path="playbooks" element={<PlaybooksView />} />
        <Route path="simulator" element={<SimulatorView />} />
        <Route path="*" element={<Navigate to="/crm" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default CrmPage;
