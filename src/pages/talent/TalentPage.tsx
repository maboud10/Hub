/**
 * Talent Hub module shell: hero header, role-aware tabs and nested routes.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { Briefcase, CalendarClock, Gauge, Radar, Signature, Sparkles, SquareKanban, Users, type LucideIcon } from 'lucide-react';
import '@/styles/talent.css';
import { initTalentBackend } from '@/talent/store';
import { useMyTalentTasks, useTalentCaps, type TalentCaps, type TalentTask } from '@/talent/selectors';
import { usePrimaryRole, useSessionUser } from '@/store/selectors';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { cx } from '@/lib/cx';
import { SystemStatusChips } from './components/shared';
import { OverviewTab } from './OverviewTab';
import { PipelineTab } from './PipelineTab';
import { CandidatesTab } from './CandidatesTab';
import { SourcingStudio } from './SourcingStudio';
import { RequisitionsTab } from './RequisitionsTab';
import { RequisitionDetail } from './RequisitionDetail';
import { RequisitionWizard } from './RequisitionWizard';
import { InterviewsTab } from './InterviewsTab';
import { OffersTab } from './OffersTab';
import { CandidateSheet } from './CandidateSheet';
import { TalentModalHost } from './modals/TalentModalHost';

export interface TalentTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  visible: (caps: TalentCaps) => boolean;
  /** Task kinds whose count is shown on the tab. */
  badge?: TalentTask['kind'][];
}

export const TALENT_TABS: TalentTab[] = [
  { to: '/talent', label: 'Command deck', icon: Gauge, end: true, visible: () => true },
  { to: '/talent/pipeline', label: 'Pipeline', icon: SquareKanban, visible: () => true, badge: ['decision', 'follow-up'] },
  { to: '/talent/sourcing', label: 'AI Sourcing', icon: Radar, visible: (c) => c.source },
  { to: '/talent/requisitions', label: 'Requisitions', icon: Briefcase, visible: () => true, badge: ['req-approval'] },
  { to: '/talent/candidates', label: 'Talent pool', icon: Users, visible: () => true },
  { to: '/talent/interviews', label: 'Interviews', icon: CalendarClock, visible: () => true, badge: ['scorecard'] },
  { to: '/talent/offers', label: 'Offers', icon: Signature, visible: (c) => c.manage || c.approveOffers || c.hire, badge: ['offer-approval', 'send-offer'] },
];

function TalentHero() {
  const me = useSessionUser();
  const role = usePrimaryRole();
  const caps = useTalentCaps();
  const navigate = useNavigate();
  const lens = caps.manage ? 'Recruiter' : caps.hire ? 'Hiring manager' : 'Viewer';
  const sub = caps.manage
    ? 'From job description to signed offer. AI sourcing, a step-by-step pipeline and a clean hand-off to onboarding.'
    : 'Your requisitions, candidates and interviews. Give feedback, make decisions and welcome your new hires.';
  return (
    <header className="talent-hero hud">
      <div className="talent-hero__glow" aria-hidden="true" />
      <div className="talent-hero__main">
        <div className="eyebrow">
          Talent Hub · {lens} lens{role ? ` · ${role.name}` : ''}
        </div>
        <h1 className="page-title talent-hero__title">
          Hire brilliantly, <span className="talent-hero__accent">step by step</span>
        </h1>
        <p className="page-sub">{sub}</p>
        <SystemStatusChips />
      </div>
      <div className="talent-hero__cta">
        {caps.source && (
          <button type="button" className="btn btn--primary" onClick={() => navigate('/talent/sourcing')}>
            <Sparkles /> Source from a JD
          </button>
        )}
        {caps.hire && (
          <button type="button" className="btn" onClick={() => navigate('/talent/requisitions/new')}>
            <Briefcase /> New requisition
          </button>
        )}
        {me && !caps.hire && !caps.source && <span className="text-sm muted">Read-only access</span>}
      </div>
    </header>
  );
}

function TalentTabs() {
  const caps = useTalentCaps();
  const tasks = useMyTalentTasks();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.kind, (m.get(t.kind) ?? 0) + 1);
    return m;
  }, [tasks]);
  return (
    <nav className="tabs talent-tabs" aria-label="Talent Hub sections">
      {TALENT_TABS.filter((t) => t.visible(caps)).map((t) => {
        const Icon = t.icon;
        const n = (t.badge ?? []).reduce((sum, k) => sum + (counts.get(k) ?? 0), 0);
        return (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('tab', isActive && 'is-active')}>
            <Icon aria-hidden="true" />
            {t.label}
            {n > 0 && <span className="counter">{n}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function TalentPage() {
  const caps = useTalentCaps();
  useEffect(() => {
    void initTalentBackend();
  }, []);

  return (
    <div className="page talent" style={{ '--tl-1': '#f59e0b', '--tl-2': '#f43f5e' } as CSSProperties}>
      <TalentHero />
      <TalentTabs />
      <Routes>
        <Route index element={<OverviewTab />} />
        <Route path="pipeline" element={<PipelineTab />} />
        <Route path="sourcing" element={caps.source ? <SourcingStudio /> : <AccessDenied area="AI Sourcing" required={['talent.source']} />} />
        <Route path="requisitions" element={<RequisitionsTab />} />
        <Route path="requisitions/new" element={caps.hire ? <RequisitionWizard /> : <AccessDenied area="New requisition" required={['talent.hire', 'talent.manage']} />} />
        <Route path="requisitions/:id" element={<RequisitionDetail />} />
        <Route path="candidates" element={<CandidatesTab />} />
        <Route path="interviews" element={<InterviewsTab />} />
        <Route
          path="offers"
          element={caps.manage || caps.approveOffers || caps.hire ? <OffersTab /> : <AccessDenied area="Offers" required={['talent.manage', 'talent.offers.approve']} />}
        />
        <Route path="*" element={<Navigate to="/talent" replace />} />
      </Routes>
      <CandidateSheet />
      <TalentModalHost />
    </div>
  );
}
