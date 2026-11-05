/**
 * HR Portal module shell: personal hero, people-first tabs and nested routes.
 * Time off, benefits and documents for everyone; approvals for managers and
 * People Ops; guided onboarding journeys handed over from Talent Hub.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { ClipboardCheck, Contact, FileText, HeartPulse, MessageCircleQuestion, Palmtree, Plane, Rocket, ShieldHalf, type LucideIcon } from 'lucide-react';
import '@/styles/talent.css';
import '@/styles/hr.css';
import '@/styles/hr-portal.css';
import { initTalentBackend } from '@/talent/store';
import { useMyTalentTasks, useTalentCaps, useVisibleJourneys } from '@/talent/selectors';
import { initHr } from '@/hr/store';
import { useApprovals, useBalances, useHolidays, useHrCaps, useMyHrTasks } from '@/hr/selectors';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { useSessionUser } from '@/store/selectors';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { firstName, greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { HRHome } from './HRHome';
import { TimeOffPage } from './TimeOffPage';
import { BenefitsPage } from './BenefitsPage';
import { DocumentsPage } from './DocumentsPage';
import { ApprovalsPage } from './ApprovalsPage';
import { PeopleOpsPage } from './PeopleOpsPage';
import { OnboardingBoard } from './OnboardingBoard';
import { JourneyDetail } from './JourneyDetail';

interface HrTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
}

function HRHero() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const balances = useBalances();
  const { upcoming } = useHolidays();
  const annual = balances.find((b) => b.type === 'annual');
  const next = upcoming[0];
  const today = todayISO();
  return (
    <header className="hr-hero hud">
      <div className="hr-hero__glow" aria-hidden="true" />
      <div className="hr-hero__main">
        <div className="eyebrow">HR Portal · People-first</div>
        <h1 className="page-title">
          {greeting()}
          {me ? `, ${firstName(me.name)}` : ''}. <span className="hr-hero__accent">From offer to day 90</span>
        </h1>
        <p className="page-sub">Time off, benefits and documents in a few taps, plus guided onboarding for every new hire handed over from Talent Hub.</p>
        <div className="hr-hero__chips">
          {annual && annual.available !== null && (
            <button type="button" className="hr-hero-chip" onClick={() => navigate('/hr/time-off')}>
              <Palmtree aria-hidden="true" />
              <b>{annual.available}</b> annual days left
            </button>
          )}
          {next && (
            <span className="hr-hero-chip">
              <span aria-hidden="true">🎉</span>
              {next.name} · {daysBetween(today, next.date) === 0 ? 'today' : `in ${daysBetween(today, next.date)} days`} ({formatDay(next.date, { day: 'numeric', month: 'short' })})
            </span>
          )}
        </div>
      </div>
      <div className="hr-hero__cta">
        <button type="button" className="btn btn--primary" onClick={() => navigate('/hr/time-off?new=1')}>
          <Plane /> Request time off
        </button>
        <button type="button" className="btn" onClick={() => navigate('/hr?ask=1')}>
          <MessageCircleQuestion /> Ask People Ops
        </button>
      </div>
    </header>
  );
}

export function HRPage() {
  const talentCaps = useTalentCaps();
  const caps = useHrCaps();
  const journeys = useVisibleJourneys();
  const talentTasks = useMyTalentTasks();
  const hrTasks = useMyHrTasks();
  const approvals = useApprovals();
  const showOnboarding = talentCaps.onboarding || journeys.length > 0;
  const showApprovals = caps.manage || caps.manager || approvals.length > 0;

  useEffect(() => {
    void initTalentBackend();
    initHr();
  }, []);

  const tabs = useMemo<HrTab[]>(() => {
    const docs = hrTasks.filter((t) => t.kind === 'sign' || t.kind === 'policy').length;
    const benefits = hrTasks.filter((t) => t.kind === 'enrol').length;
    const list: HrTab[] = [
      { to: '/hr', label: 'My HR', icon: Contact, end: true },
      { to: '/hr/time-off', label: 'Time off', icon: Palmtree },
      { to: '/hr/benefits', label: 'Benefits', icon: HeartPulse, count: benefits },
      { to: '/hr/documents', label: 'Documents', icon: FileText, count: docs },
    ];
    if (showOnboarding) list.push({ to: '/hr/onboarding', label: 'Onboarding', icon: Rocket, count: talentTasks.filter((t) => t.kind === 'onboarding').length });
    if (showApprovals) list.push({ to: '/hr/approvals', label: 'Approvals', icon: ClipboardCheck, count: approvals.length });
    if (caps.manage) list.push({ to: '/hr/ops', label: 'People Ops', icon: ShieldHalf });
    return list;
  }, [hrTasks, talentTasks, approvals, showOnboarding, showApprovals, caps.manage]);

  return (
    <div className="page hr" style={{ '--hr-1': '#c084fc', '--hr-2': '#9333ea' } as CSSProperties}>
      <HRHero />
      <nav className="tabs hr-tabs" aria-label="HR Portal sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('tab', isActive && 'is-active')}>
              <Icon aria-hidden="true" />
              {t.label}
              {!!t.count && <span className="counter">{t.count}</span>}
            </NavLink>
          );
        })}
      </nav>
      <Routes>
        <Route index element={<HRHome />} />
        <Route path="time-off" element={<TimeOffPage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="approvals" element={showApprovals ? <ApprovalsPage /> : <Navigate to="/hr" replace />} />
        <Route path="ops" element={caps.manage ? <PeopleOpsPage /> : <AccessDenied area="People Ops" required={['hr.people.manage']} />} />
        <Route path="onboarding" element={showOnboarding ? <OnboardingBoard /> : <Navigate to="/hr" replace />} />
        <Route path="onboarding/:id" element={<JourneyDetail />} />
        <Route path="*" element={<Navigate to="/hr" replace />} />
      </Routes>
    </div>
  );
}
