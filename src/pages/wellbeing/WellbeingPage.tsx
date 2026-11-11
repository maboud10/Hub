/**
 * Helix Wellbeing — "Aura · Wellbeing OS"
 * NEO shell for /wellbeing/*: living energy aura, breathwork, the Helix Hub
 * Cup, confidential Care, sustainable-pace Rhythm and the wellbeing wallet.
 * Privacy-first: personal data is only ever shown to the person themself.
 */
import '@/styles/neo.css';
import '@/styles/wellbeing.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { CalendarDays, Footprints, Gauge, Gift, HandHeart, HeartPulse, Orbit, RotateCcw, Wind } from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { isoDay } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import { AuraView } from './AuraView';
import { BreatheView } from './BreatheView';
import { CareView } from './CareView';
import { CheckInDialog } from './CheckInDialog';
import { MoveView } from './MoveView';
import { PerksView } from './PerksView';
import { RhythmView } from './RhythmView';
import { CheckInCtx, useMe } from './parts';

const WELLBEING_TINT = { c1: '#fb7185', c2: '#a855f7' };

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
    to: '/wellbeing',
    end: true,
    icon: <Orbit />,
    eyebrow: 'Wellbeing deck',
    title: 'Aura',
    sub: 'Your private energy aura: 20-second check-ins, Nova recharge prescriptions and an energy forecast tuned to your calendar.',
  },
  {
    to: '/wellbeing/breathe',
    icon: <Wind />,
    eyebrow: 'Wellbeing deck · Breathe',
    title: 'Breathwork Studio',
    sub: 'Guided breathing, ambient soundscapes and one-minute micro-resets for your desk.',
  },
  {
    to: '/wellbeing/move',
    icon: <Footprints />,
    eyebrow: 'Wellbeing deck · Movement',
    title: 'Helix Hub Cup',
    sub: 'A cross-hub movement race, your personal step goal and walk-and-talk 1:1s.',
  },
  {
    to: '/wellbeing/care',
    icon: <HandHeart />,
    eyebrow: 'Wellbeing deck · Care',
    title: 'Confidential Care',
    sub: 'Counsellors in English and Arabic, a 24/7 talk-now line, crisis resources and anonymous circles. Invisible to your employer.',
  },
  {
    to: '/wellbeing/rhythm',
    icon: <Gauge />,
    eyebrow: 'Wellbeing deck · Rhythm',
    title: 'Sustainable Pace',
    sub: 'A burnout radar from your real calendar, focus and inbox signals, plus right-to-disconnect quiet hours.',
  },
  {
    to: '/wellbeing/perks',
    icon: <Gift />,
    eyebrow: 'Wellbeing deck · Perks',
    title: 'Wellbeing Wallet',
    sub: 'Your allowance, recharge credits, partner perks and claims tracked all the way to payroll.',
  },
];

export function WellbeingPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const { data } = useMe();
  const resetDemo = useWellbeing((s) => s.resetDemo);
  const today = isoDay(useNow(60_000));
  const checkedIn = data.checkins.some((c) => c.date === today);

  const [checkInOpen, setCheckInOpen] = useState(false);
  const deepLink = params.get('checkin') === '1';
  useEffect(() => {
    if (deepLink) setCheckInOpen(true);
  }, [deepLink]);

  const openCheckIn = useCallback(() => setCheckInOpen(true), []);
  const closeCheckIn = useCallback(() => {
    setCheckInOpen(false);
    if (params.has('checkin')) {
      const next = new URLSearchParams(params);
      next.delete('checkin');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const items: NeoNavItem[] = [
    {
      to: '/wellbeing',
      label: 'Aura',
      icon: <Orbit />,
      end: true,
      badge: checkedIn ? null : 1,
      title: checkedIn ? 'Your living energy aura' : 'Your living energy aura · daily check-in waiting',
    },
    { to: '/wellbeing/breathe', label: 'Breathe', icon: <Wind />, title: 'Breathwork studio & micro-resets' },
    { to: '/wellbeing/move', label: 'Movement', icon: <Footprints />, title: 'Helix Hub Cup & walk-and-talks' },
    { to: '/wellbeing/care', label: 'Care', icon: <HandHeart />, title: 'Confidential support, invisible to your employer' },
    { to: '/wellbeing/rhythm', label: 'Rhythm', icon: <Gauge />, title: 'Sustainable pace & quiet hours' },
    { to: '/wellbeing/perks', label: 'Perks', icon: <Gift />, title: 'Wellbeing wallet & partner perks' },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/wellbeing';

  const actions = (
    <>
      <button type="button" className="neo-btn neo-btn--soft" onClick={resetDemo} title="Reset Wellbeing demo data">
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button type="button" className="neo-btn neo-btn--plasma" onClick={openCheckIn} data-qa="wb-checkin-btn">
        <HeartPulse />
        <span className="neo-btn__label">{checkedIn ? 'Update check-in' : 'Check in'}</span>
      </button>
    </>
  );

  return (
    <CheckInCtx.Provider value={openCheckIn}>
      <NeoAppFrame
        app="wellbeing"
        tint={WELLBEING_TINT}
        className="wellbeing-page"
        brand={{ icon: <HeartPulse />, label: 'Helix Wellbeing', to: '/wellbeing' }}
        items={items}
        footer={[
          {
            to: '/calendar',
            label: 'Calendar',
            icon: <CalendarDays />,
            title: 'Open Helix Calendar',
          },
        ]}
        head={{
          icon: section.icon,
          eyebrow: section.eyebrow,
          title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
          sub: section.sub,
          actions,
        }}
        overlays={<CheckInDialog open={checkInOpen} onClose={closeCheckIn} />}
      >
        <Routes>
          <Route index element={<AuraView />} />
          <Route path="breathe" element={<BreatheView />} />
          <Route path="move" element={<MoveView />} />
          <Route path="care" element={<CareView />} />
          <Route path="rhythm" element={<RhythmView />} />
          <Route path="perks" element={<PerksView />} />
          <Route path="*" element={<Navigate to="/wellbeing" replace />} />
        </Routes>
      </NeoAppFrame>
    </CheckInCtx.Provider>
  );
}

export default WellbeingPage;
