/**
 * Talent Hub module shell — "Talent deck".
 * NEO workspace: rail (Deck · Pipeline · Sourcing · Reqs · Pool · Interviews ·
 * Offers, badged with the tasks waiting on you) + glass stage. The header
 * follows the active section (requisition pages show the role itself); views
 * add section-specific actions to it through <HeadActions> (components/head).
 */
import '@/styles/talent.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Briefcase, CalendarClock, Eye, FilePlus2, Gauge, Radar, Signature, Sparkles, SquareKanban, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { initTalentBackend } from '@/talent/store';
import { useMyTalentTasks, useTalentCaps, useTalentScope, type TalentCaps, type TalentTask } from '@/talent/selectors';
import { REQ_STATUS_META, WORK_MODEL_LABEL } from '@/talent/constants';
import { useSessionUser } from '@/store/selectors';
import { firstName, greeting } from '@/lib/format';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { HeadSlotContext } from './components/head';
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

const TINT = { c1: '#f59e0b', c2: '#f43f5e' };

export interface TalentTab {
  to: string;
  label: string;
  /** Short rail label. */
  short: string;
  icon: LucideIcon;
  end?: boolean;
  visible: (caps: TalentCaps) => boolean;
  /** Task kinds whose count is shown on the tab. */
  badge?: TalentTask['kind'][];
}

export const TALENT_TABS: TalentTab[] = [
  { to: '/talent', label: 'Command deck', short: 'Deck', icon: Gauge, end: true, visible: () => true },
  { to: '/talent/pipeline', label: 'Pipeline', short: 'Pipeline', icon: SquareKanban, visible: () => true, badge: ['decision', 'follow-up'] },
  { to: '/talent/sourcing', label: 'AI Sourcing', short: 'Sourcing', icon: Radar, visible: (c) => c.source },
  { to: '/talent/requisitions', label: 'Requisitions', short: 'Reqs', icon: Briefcase, visible: () => true, badge: ['req-approval'] },
  { to: '/talent/candidates', label: 'Talent pool', short: 'Pool', icon: Users, visible: () => true },
  { to: '/talent/interviews', label: 'Interviews', short: 'Interviews', icon: CalendarClock, visible: () => true, badge: ['scorecard'] },
  { to: '/talent/offers', label: 'Offers', short: 'Offers', icon: Signature, visible: (c) => c.manage || c.approveOffers || c.hire, badge: ['offer-approval', 'send-offer'] },
];

interface Section {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
  /** Full-bleed body (boards with their own scroll). */
  pad?: boolean;
}

/** Route → header. Order matters: the first match wins. */
const SECTIONS: Section[] = [
  { to: '/talent', end: true, icon: <Gauge />, eyebrow: 'Talent deck', title: '', sub: '' },
  { to: '/talent/pipeline', icon: <SquareKanban />, eyebrow: 'Talent · Pipeline', title: 'Pipeline', sub: 'Every candidate, every step — exit criteria keep the process honest.' },
  { to: '/talent/sourcing', icon: <Radar />, eyebrow: 'Talent · AI sourcing', title: 'AI Sourcing studio', sub: 'From job description to first message: rediscover your pool, search LinkedIn, draft outreach.' },
  { to: '/talent/requisitions/new', icon: <FilePlus2 />, eyebrow: 'Talent · Requisitions', title: 'New requisition', sub: 'Describe the role, decode the JD, plan the loop and route headcount approval.' },
  { to: '/talent/requisitions', icon: <Briefcase />, eyebrow: 'Talent · Requisitions', title: 'Requisitions', sub: 'Open roles, headcount approvals and JD health in one place.' },
  { to: '/talent/candidates', icon: <Users />, eyebrow: 'Talent · Talent pool', title: 'Talent pool', sub: 'Everyone you have met or sourced — searchable, consent-aware and ranked by fit.' },
  { to: '/talent/interviews', icon: <CalendarClock />, eyebrow: 'Talent · Interviews', title: 'Interviews', sub: 'Your agenda, structured loops and the scorecards that are due.' },
  { to: '/talent/offers', icon: <Signature />, eyebrow: 'Talent · Offers', title: 'Offers', sub: 'Four-eyes approvals, signatures and a clean hand-off to onboarding.' },
];

const REQ_DETAIL = /^\/talent\/requisitions\/([^/]+)\/?$/;

export function TalentPage() {
  const caps = useTalentCaps();
  const me = useSessionUser();
  const tasks = useMyTalentTasks();
  const { requisitions } = useTalentScope();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [slot, setSlot] = useState<HTMLSpanElement | null>(null);

  useEffect(() => {
    void initTalentBackend();
  }, []);

  // ── Rail: the old tabs, badged with the tasks waiting on you.
  const items = useMemo<NeoNavItem[]>(() => {
    const counts = new Map<string, { n: number; urgent: boolean }>();
    for (const t of tasks) {
      const c = counts.get(t.kind) ?? { n: 0, urgent: false };
      counts.set(t.kind, { n: c.n + 1, urgent: c.urgent || !!t.urgent });
    }
    return TALENT_TABS.filter((t) => t.visible(caps)).map((t) => {
      const Icon = t.icon;
      const hits = (t.badge ?? []).map((k) => counts.get(k)).filter(Boolean) as { n: number; urgent: boolean }[];
      const n = hits.reduce((s, h) => s + h.n, 0);
      return {
        to: t.to,
        end: t.end,
        label: t.short,
        icon: <Icon />,
        badge: n || null,
        badgeTone: hits.some((h) => h.urgent) ? 'danger' : undefined,
        title: n ? `${t.label} · ${n} waiting on you` : t.label,
      };
    });
  }, [tasks, caps]);

  // ── Header for the active route.
  const lens = caps.manage ? 'Recruiter' : caps.hire ? 'Hiring manager' : 'Viewer';
  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/talent';
  const reqMatch = REQ_DETAIL.exec(pathname);
  const req = reqMatch && reqMatch[1] !== 'new' ? requisitions.find((r) => r.id === reqMatch[1]) : undefined;

  let head = { icon: section.icon, eyebrow: section.eyebrow as ReactNode, title: section.title as ReactNode, sub: section.sub as ReactNode };
  if (isHome)
    head = {
      icon: <Gauge />,
      eyebrow: (
        <>
          Talent deck <span aria-hidden="true">·</span> {lens} lens
        </>
      ),
      title: `${greeting()}${me ? `, ${firstName(me.name)}` : ''}`,
      sub: caps.manage ? 'From job description to signed offer — AI sourcing, a step-by-step pipeline and a clean hand-off.' : 'Your roles, candidates and interviews. Give feedback, decide and welcome new hires.',
    };
  else if (reqMatch && reqMatch[1] !== 'new')
    head = {
      icon: <Briefcase />,
      eyebrow: req ? `Talent · Requisition · ${REQ_STATUS_META[req.status].label}` : 'Talent · Requisition',
      title: req?.title ?? 'Requisition',
      sub: req ? `${req.department} · ${req.location} · ${WORK_MODEL_LABEL[req.workModel]} · ${req.band} · ${req.hires}/${req.headcount} hired` : 'Headcount, pipeline, interview loop and offers for one role.',
    };

  // The deck's hero CTAs; every other section portals its own actions in (<HeadActions>).
  const own: ReactNode[] = [];
  if (isHome) {
    if (caps.hire)
      own.push(
        <button key="new-req" type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/talent/requisitions/new')} data-qa="talent-new-req">
          <Briefcase /> <span className="neo-btn__label">New requisition</span>
        </button>,
      );
    if (caps.source)
      own.push(
        <button key="source" type="button" className="neo-btn neo-btn--plasma" onClick={() => navigate('/talent/sourcing')} data-qa="talent-source">
          <Sparkles /> <span className="neo-btn__label">Source from a JD</span>
        </button>,
      );
    if (me && !caps.hire && !caps.source)
      own.push(
        <span key="ro" className="neo-chip" data-tone="slate" title="You can follow hiring, but not change it">
          <Eye /> Read-only
        </span>,
      );
  }

  return (
    <NeoAppFrame
      app="talent"
      tint={TINT}
      className="talent"
      brand={{ icon: <UserPlus />, label: 'Talent Hub', to: '/talent' }}
      items={items}
      pad={section.pad ?? true}
      head={{
        ...head,
        actions: (
          <>
            <span ref={setSlot} className="tl-headslot" />
            {own}
          </>
        ),
      }}
      overlays={
        <>
          <CandidateSheet />
          <TalentModalHost />
        </>
      }
    >
      <HeadSlotContext.Provider value={slot}>
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
      </HeadSlotContext.Provider>
    </NeoAppFrame>
  );
}
