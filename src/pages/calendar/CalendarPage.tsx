/**
 * Helix Calendar — "Chronos · Neural Time & Spatial Scheduling Orbit"
 * Top-level NEO Support Deck shell for /calendar/*
 */
import '@/styles/neo.css';
import '@/styles/calendar.css';
import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Building2,
  CalendarDays,
  Clock,
  Globe2,
  Link2,
  RotateCcw,
  Video,
  Wand2,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { useCalendar } from '@/calendar/store';
import { GridView } from './GridView';
import { SchedulerView } from './SchedulerView';
import { RoomsView } from './RoomsView';
import { LinksView } from './LinksView';
import { AnalyticsView } from './AnalyticsView';

const CALENDAR_TINT = { c1: '#f472b6', c2: '#8b5cf6' };

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
    to: '/calendar',
    end: true,
    icon: <CalendarDays />,
    eyebrow: 'Time deck',
    title: 'Chronos Time Grid',
    sub: 'Natural-language Nova scheduling, Deep Work shields, cross-app context & 1-click HoloMeet rooms.',
  },
  {
    to: '/calendar/scheduler',
    icon: <Globe2 />,
    eyebrow: 'Time deck · Timezones',
    title: 'Global Time-Zone Weaver',
    sub: 'Real-time circadian harmony across Dubai (GST), London (GMT), Singapore (SGT) & New York (EST).',
  },
  {
    to: '/calendar/rooms',
    icon: <Building2 />,
    eyebrow: 'Time deck · Rooms',
    title: 'Smart Rooms & Focus Capsules',
    sub: 'Live CO₂, acoustic isolation, thermal comfort & HoloMeet hardware telemetry across global hubs.',
  },
  {
    to: '/calendar/links',
    icon: <Link2 />,
    eyebrow: 'Time deck · Booking links',
    title: 'Smart Booking Links',
    sub: 'Territory-routed CRM executive briefings, round-robin Talent interview loops & 1:1 office hours.',
  },
  {
    to: '/calendar/analytics',
    icon: <Clock />,
    eyebrow: 'Time deck · Focus',
    title: 'Chronos Time & Focus Audit',
    sub: 'Protect deep work blocks, audit synchronous meeting burn, and deflect status calls to Async Clips.',
  },
];

export function CalendarPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const events = useCalendar((s) => s.events);
  const rooms = useCalendar((s) => s.rooms);
  const bookingLinks = useCalendar((s) => s.bookingLinks);
  const defragSchedule = useCalendar((s) => s.defragSchedule);
  const resetCalendar = useCalendar((s) => s.resetCalendar);

  const todayCount = events.filter((e) => e.dayOffset === 0).length;
  const availableRooms = rooms.filter((r) => r.status === 'available').length;
  const activeLinks = bookingLinks.filter((l) => l.active).length;

  const items: NeoNavItem[] = [
    {
      to: '/calendar',
      label: 'Schedule',
      icon: <CalendarDays />,
      end: true,
      badge: todayCount || null,
      title: 'Chronos Time Grid & Focus Runway',
    },
    {
      to: '/calendar/scheduler',
      label: 'Timezones',
      icon: <Globe2 />,
      title: 'Global Time-Zone Weaver & Circadian Overlap',
    },
    {
      to: '/calendar/rooms',
      label: 'Rooms',
      icon: <Building2 />,
      badge: availableRooms || null,
      title: 'Smart Rooms & Spatial Pods',
    },
    {
      to: '/calendar/links',
      label: 'Links',
      icon: <Link2 />,
      badge: activeLinks || null,
      title: 'Smart Booking Links & Territory Routers',
    },
    {
      to: '/calendar/analytics',
      label: 'Focus',
      icon: <Clock />,
      title: 'Chronos Maker vs. Manager Time Telemetry',
    },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/calendar';

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={() => defragSchedule(0)}
      >
        <Wand2 />
        <span className="neo-btn__label">Defrag Today</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetCalendar}
        title="Reset Calendar demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={() => navigate('/meet/room')}
        data-qa="cal-open-holomeet"
      >
        <Video />
        <span className="neo-btn__label">Launch HoloMeet</span>
      </button>
    </>
  );

  return (
    <NeoAppFrame
      app="calendar"
      tint={CALENDAR_TINT}
      className="cal-page"
      brand={{ icon: <CalendarDays />, label: 'Helix Calendar', to: '/calendar' }}
      items={items}
      footer={[
        {
          to: '/meet',
          label: 'Meet',
          icon: <Video />,
          title: 'Open Helix Meet · Spatial Video & AI Scribe',
        },
      ]}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions,
      }}
    >
      <Routes>
        <Route index element={<GridView />} />
        <Route path="scheduler" element={<SchedulerView />} />
        <Route path="rooms" element={<RoomsView />} />
        <Route path="links" element={<LinksView />} />
        <Route path="analytics" element={<AnalyticsView />} />
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default CalendarPage;
