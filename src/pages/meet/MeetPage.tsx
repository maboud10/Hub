/**
 * Helix Meet — "HoloMeet · Spatial Video, Live AI Scribe & Async Clips Studio"
 * Top-level NEO Support Deck shell for /meet/*
 */
import '@/styles/neo.css';
import '@/styles/calendar.css';
import '@/styles/meet.css';
import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  CalendarDays,
  Disc,
  Film,
  Radio,
  RotateCcw,
  Sparkles,
  Video,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { useMeet } from '@/meet/store';
import { LobbyView } from './LobbyView';
import { StageView } from './StageView';
import { RecordingsView } from './RecordingsView';
import { ClipsView } from './ClipsView';
import { AnalyticsView } from './AnalyticsView';

const MEET_TINT = { c1: '#34d399', c2: '#06b6d4' };

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
    to: '/meet',
    end: true,
    icon: <Video />,
    eyebrow: 'Meet deck',
    title: 'HoloMeet Command & Lobby',
    sub: '4K studio green-room, neural noise suppression, instant war-rooms & live-synced Calendar sessions.',
  },
  {
    to: '/meet/room',
    icon: <Radio />,
    eyebrow: 'Meet deck · Live stage',
    title: 'Spatial Meeting Stage',
    sub: 'Real-time EN ↔ AR simultaneous translation, Nova Live Scribe & 1-click push to Projects & CRM.',
  },
  {
    to: '/meet/recordings',
    icon: <Disc />,
    eyebrow: 'Meet deck · Replays',
    title: 'AI Recordings & Chapters',
    sub: 'Sentiment waveforms, chaptered replays, verified decisions & cross-app action item sync.',
  },
  {
    to: '/meet/clips',
    icon: <Film />,
    eyebrow: 'Meet deck · Clips',
    title: 'Async Clips Studio',
    sub: 'Replace recurring status calls with 3-minute async walkthroughs, 2x AI playback & timestamped reactions.',
  },
  {
    to: '/meet/analytics',
    icon: <Activity />,
    eyebrow: 'Meet deck · Pulse',
    title: 'Meeting Pulse & Equity',
    sub: 'Async hours saved, cross-hub talk-time balance, decision velocity & bilingual subtitle telemetry.',
  },
];

export function MeetPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const rooms = useMeet((s) => s.rooms);
  const recordings = useMeet((s) => s.recordings);
  const clips = useMeet((s) => s.clips);
  const launchInstantRoom = useMeet((s) => s.launchInstantRoom);
  const resetMeet = useMeet((s) => s.resetMeet);

  const items: NeoNavItem[] = [
    {
      to: '/meet',
      label: 'Lobby',
      icon: <Video />,
      end: true,
      title: 'HoloMeet Command & Green-Room Lobby',
    },
    {
      to: '/meet/room',
      label: 'Live',
      icon: <Radio />,
      badge: rooms.length || null,
      badgeTone: 'danger',
      title: 'Live Spatial Meeting Stage & Nova Scribe',
    },
    {
      to: '/meet/recordings',
      label: 'Replays',
      icon: <Disc />,
      badge: recordings.length || null,
      title: 'AI Recordings & Decision Intelligence Vault',
    },
    {
      to: '/meet/clips',
      label: 'Clips',
      icon: <Film />,
      badge: clips.length || null,
      title: 'Async Video Clips Studio',
    },
    {
      to: '/meet/analytics',
      label: 'Pulse',
      icon: <Activity />,
      title: 'Meeting Pulse & Talk-Time Equity Telemetry',
    },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/meet';

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={() => navigate('/calendar')}
      >
        <CalendarDays />
        <span className="neo-btn__label">Chronos Calendar</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetMeet}
        title="Reset Meet demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={() => {
          const created = launchInstantRoom('Executive Instant Sync', 'customer');
          navigate(`/meet/room?room=${created.id}`);
        }}
        data-qa="meet-instant-btn"
      >
        <Sparkles />
        <span className="neo-btn__label">Instant Room</span>
      </button>
    </>
  );

  return (
    <NeoAppFrame
      app="meet"
      tint={MEET_TINT}
      className="meet-page"
      brand={{ icon: <Video />, label: 'Helix Meet', to: '/meet' }}
      items={items}
      footer={[
        {
          to: '/calendar',
          label: 'Calendar',
          icon: <CalendarDays />,
          title: 'Open Helix Calendar · Chronos Time & Spatial Orbit',
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
        <Route index element={<LobbyView />} />
        <Route path="room" element={<StageView />} />
        <Route path="recordings" element={<RecordingsView />} />
        <Route path="clips" element={<ClipsView />} />
        <Route path="analytics" element={<AnalyticsView />} />
        <Route path="*" element={<Navigate to="/meet" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default MeetPage;
