/**
 * HR Portal — "People deck". NEO workspace: rail (My HR · Time off · Benefits ·
 * Documents · Onboarding · Approvals, People Ops in the footer) + glass stage.
 * The header follows the active section (journey pages show the new hire);
 * section CTAs live in the header and drive the existing query-param flows
 * (`/hr?ask=1`, `/hr/time-off?new=1[&type=&from=&to=]`, `/hr/benefits?enrol=1|claim=1`,
 * `/hr/documents?tab=`). Time off, benefits and documents for everyone;
 * approvals for managers and People Ops; guided onboarding journeys handed
 * over from Talent Hub.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Contact,
  FileText,
  Globe,
  HeartHandshake,
  HeartPulse,
  MessageCircleQuestion,
  Palmtree,
  Plane,
  Receipt,
  Rocket,
  ShieldHalf,
  Stamp,
  Thermometer,
} from 'lucide-react';
import '@/styles/talent.css';
import '@/styles/hr.css';
import '@/styles/hr-portal.css';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { initTalentBackend, useTalent } from '@/talent/store';
import * as talentAccess from '@/talent/access';
import { useMyTalentTasks, useTalentCaps, useTalentViewer, useVisibleJourneys } from '@/talent/selectors';
import { initHr, useHr } from '@/hr/store';
import { useApprovals, useHrCaps, useMyHrTasks } from '@/hr/selectors';
import { holidaySet, nextWorkingDay, todayISO } from '@/hr/calendar';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { firstName, greeting } from '@/lib/format';
import { HRHome } from './HRHome';
import { TimeOffPage } from './TimeOffPage';
import { BenefitsPage } from './BenefitsPage';
import { DocumentsPage } from './DocumentsPage';
import { ApprovalsPage } from './ApprovalsPage';
import { PeopleOpsPage } from './PeopleOpsPage';
import { OnboardingBoard } from './OnboardingBoard';
import { JourneyDetail } from './JourneyDetail';
import { ageLabel } from './approvals/meta';

const TINT = { c1: '#c084fc', c2: '#7c3aed' };

interface Section {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: Section[] = [
  { to: '/hr', end: true, icon: <Contact />, eyebrow: 'People deck', title: 'My HR', sub: 'Time off, pay, benefits and documents in a few taps, and real people when you need them.' },
  { to: '/hr/time-off', icon: <Palmtree />, eyebrow: 'HR Portal · Leave & holidays', title: 'Time off', sub: 'Balances that explain themselves, two-tap requests and who’s away on your team.' },
  { to: '/hr/benefits', icon: <HeartPulse />, eyebrow: 'HR Portal · Cover & rewards', title: 'Benefits', sub: 'Your insurance card, allowances, perks and life events. Helix pays most of the premium.' },
  { to: '/hr/documents', icon: <FileText />, eyebrow: 'HR Portal · Paperwork', title: 'Documents', sub: 'Your vault, e-signatures, instant letters, payslips and policies. Always just yours.' },
  { to: '/hr/onboarding', icon: <Rocket />, eyebrow: 'HR Portal · Offer to day 90', title: 'Onboarding', sub: 'Every hire handed off from Talent Hub: pre-boarding, day one and the first 90 days.' },
  { to: '/hr/approvals', icon: <ClipboardCheck />, eyebrow: 'HR Portal · Decisions', title: 'Approvals', sub: 'One inbox for time off, claims, letters, benefits and Ask People Ops cases.' },
  { to: '/hr/ops', icon: <ShieldHalf />, eyebrow: 'HR Portal · Operations', title: 'People Ops console', sub: 'Run the people side of Helix. Separation of duties applies everywhere.' },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function HRPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const now = useNow(60_000);
  const talentCaps = useTalentCaps();
  const talentViewer = useTalentViewer();
  const caps = useHrCaps();
  const journeys = useVisibleJourneys();
  const talentTasks = useMyTalentTasks();
  const hrTasks = useMyHrTasks();
  const approvals = useApprovals();
  const showOnboarding = talentCaps.onboarding || journeys.length > 0;
  const showApprovals = caps.manage || caps.manager || approvals.length > 0;

  // Journey pages put the new hire in the header (only when the viewer may see the journey).
  const journeyMatch = useMatch('/hr/onboarding/:id');
  const journeyId = journeyMatch?.params.id;
  const journey = useTalent((s) => (journeyId ? s.onboarding.find((j) => j.id === journeyId) : undefined));
  const visibleJourney = journey && talentViewer && talentAccess.canSeeJourney(talentViewer, journey) ? journey : undefined;

  const year = new Date(now).getFullYear();
  const election = useHr((s) => (me ? s.elections.find((e) => e.userId === me.id && e.year === year) : undefined));

  useEffect(() => {
    void initTalentBackend();
    initHr();
    void import('@/academy/store').then((m) => m.initAcademy());
  }, []);

  const counts = useMemo(() => {
    const urgentApprovals = approvals.filter((a) => a.urgent).length;
    const oldest = approvals.length ? Math.min(...approvals.map((a) => a.at)) : now;
    return {
      docs: hrTasks.filter((t) => t.kind === 'sign' || t.kind === 'policy').length,
      benefits: hrTasks.filter((t) => t.kind === 'enrol').length,
      benefitsUrgent: hrTasks.some((t) => t.kind === 'enrol' && t.urgent),
      onboarding: talentTasks.filter((t) => t.kind === 'onboarding').length,
      urgentApprovals,
      oldestAge: ageLabel((now - oldest) / 3_600_000),
    };
  }, [approvals, hrTasks, talentTasks, now]);

  const items: NeoNavItem[] = [
    { to: '/hr', label: 'My HR', icon: <Contact />, end: true, title: 'My HR' },
    { to: '/hr/time-off', label: 'Time off', icon: <Palmtree />, title: 'Time off & holidays' },
    {
      to: '/hr/benefits',
      label: 'Benefits',
      icon: <HeartPulse />,
      badge: counts.benefits || null,
      badgeTone: counts.benefitsUrgent ? 'danger' : undefined,
      title: counts.benefits ? 'Benefits · enrolment open' : 'Benefits & allowances',
    },
    { to: '/hr/documents', label: 'Docs', icon: <FileText />, badge: counts.docs || null, title: counts.docs ? `Documents · ${plural(counts.docs, 'thing')} to sign or read` : 'Documents' },
  ];
  if (showOnboarding)
    items.push({ to: '/hr/onboarding', label: 'Onboard', icon: <Rocket />, badge: counts.onboarding || null, title: counts.onboarding ? `Onboarding · ${plural(counts.onboarding, 'task')} for you` : 'Onboarding journeys' });
  if (showApprovals)
    items.push({
      to: '/hr/approvals',
      label: 'Approvals',
      icon: <ClipboardCheck />,
      badge: approvals.length || null,
      badgeTone: counts.urgentApprovals ? 'danger' : undefined,
      title: approvals.length ? `Approvals · ${approvals.length} waiting on you` : 'Approvals',
    });
  const footer: NeoNavItem[] | undefined = caps.manage ? [{ to: '/hr/ops', label: 'Ops', icon: <ShieldHalf />, title: 'People Ops console' }] : undefined;

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/hr';
  const today = todayISO(now);
  const sickDay = me ? nextWorkingDay(today, holidaySet(me.location)) : today;
  const journeyBack = talentCaps.onboarding || journeys.length ? '/hr/onboarding' : '/hr';

  const btn = (kind: 'soft' | 'plasma', icon: ReactNode, label: string, to: string, qa?: string) => (
    <button type="button" className={`neo-btn neo-btn--${kind}`} onClick={() => navigate(to)} data-qa={qa}>
      {icon} <span className="neo-btn__label">{label}</span>
    </button>
  );

  let head: { icon: ReactNode; eyebrow: string; title: ReactNode; sub: ReactNode; actions?: ReactNode } = {
    icon: section.icon,
    eyebrow: section.eyebrow,
    title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
    sub: section.sub,
  };

  switch (section.to) {
    case '/hr':
      head.actions = (
        <>
          {btn('soft', <MessageCircleQuestion />, 'Ask People Ops', '/hr?ask=1', 'hr-head-ask')}
          {btn('plasma', <Plane />, 'Request time off', '/hr/time-off?new=1', 'hr-head-timeoff')}
        </>
      );
      break;
    case '/hr/time-off':
      head.actions = (
        <>
          {btn('soft', <Thermometer />, sickDay === today ? 'I’m sick today' : 'Sick next working day', `/hr/time-off?new=1&type=sick&from=${sickDay}&to=${sickDay}`)}
          {btn('soft', <Globe />, 'Work from anywhere', '/hr/time-off?new=1&type=wfa')}
          {btn('plasma', <Plane />, 'Request time off', '/hr/time-off?new=1')}
        </>
      );
      break;
    case '/hr/benefits':
      head.actions = (
        <>
          {btn('soft', <Receipt />, 'Make a claim', '/hr/benefits?claim=1')}
          {btn('plasma', <HeartPulse />, !election || election.status === 'not-started' ? 'Choose benefits' : 'Update my cover', '/hr/benefits?enrol=1')}
        </>
      );
      break;
    case '/hr/documents':
      head.actions = (
        <>
          {btn('soft', <Receipt />, 'Payslips', '/hr/documents?tab=payslips')}
          {btn('plasma', <Stamp />, 'Get a letter', '/hr/documents?tab=letters')}
        </>
      );
      break;
    case '/hr/onboarding':
      if (journeyId) {
        head = visibleJourney
          ? {
              icon: <HeartHandshake />,
              eyebrow: 'HR Portal · Onboarding journey',
              title: visibleJourney.name,
              sub: `${visibleJourney.title} · ${visibleJourney.department} · ${visibleJourney.location}`,
              actions: btn('soft', <ArrowLeft />, journeyBack === '/hr' ? 'My HR' : 'All journeys', journeyBack),
            }
          : { icon: <Rocket />, eyebrow: 'HR Portal · Onboarding journey', title: 'Onboarding journey', sub: 'Visible to People Ops, the hiring manager, the buddy and the new hire.', actions: btn('soft', <ArrowLeft />, 'Back', journeyBack) };
      } else if (talentCaps.hire || talentCaps.manage) {
        head.actions = btn('soft', <BriefcaseBusiness />, 'Talent Hub', '/talent');
      }
      break;
    case '/hr/approvals':
      head.sub = approvals.length
        ? `${plural(approvals.length, 'request')} need${approvals.length === 1 ? 's' : ''} you${counts.urgentApprovals ? ` · ${counts.urgentApprovals} urgent` : ''} · oldest waiting ${counts.oldestAge}${caps.manage ? ' · People Ops view' : caps.manager ? ` · ${plural(caps.reports, 'direct report')}` : ''}`
        : 'Inbox zero. Nothing is waiting on your decision.';
      head.actions = (
        <>
          {btn('soft', <CalendarDays />, 'Who’s away', '/hr/time-off')}
          {caps.manage && btn('soft', <ShieldHalf />, 'People Ops', '/hr/ops')}
        </>
      );
      break;
    case '/hr/ops':
      head.actions = (
        <>
          {btn('soft', <Rocket />, 'Onboarding', '/hr/onboarding')}
          {btn('plasma', <ClipboardCheck />, approvals.length ? `Review ${approvals.length} approval${approvals.length === 1 ? '' : 's'}` : 'Approvals', '/hr/approvals')}
        </>
      );
      break;
  }

  return (
    <NeoAppFrame app="hr" tint={TINT} className="hr" brand={{ icon: <HeartHandshake />, label: 'HR Portal', to: '/hr' }} items={items} footer={footer} head={head}>
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
    </NeoAppFrame>
  );
}
