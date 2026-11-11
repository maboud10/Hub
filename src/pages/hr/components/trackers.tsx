/**
 * HR journey trackers on screen: renders the pure derivations from
 * `@/hr/trackers` with the shared `<NeoTracker>` — a full (bare) tracker with
 * stages, the live status line and an ETA while someone still has to act, a
 * compact bar once the journey has settled — plus `useTrackContext()`, which
 * gathers what the derivations need (clock, directory, People Ops, time off).
 */
import { useMemo, type ReactNode } from 'react';
import { BadgeDollarSign, CalendarCheck, CreditCard, Download, Landmark, ReceiptText, Send, ShieldCheck, Stamp, UserRoundCheck } from 'lucide-react';
import { NeoTracker, type NeoTrackStep } from '@/components/neo';
import { HR_PERMS } from '@/hr/access';
import { useHr } from '@/hr/store';
import type { Track, TrackContext, TrackIcon, TrackJourney, TrackPart } from '@/hr/trackers';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { usersWithPermission } from '@/lib/rbac';
import { cx } from '@/lib/cx';

const ICON: Record<TrackIcon, ReactNode> = {
  send: <Send />,
  review: <UserRoundCheck />,
  calendar: <CalendarCheck />,
  receipt: <ReceiptText />,
  payroll: <Landmark />,
  paid: <BadgeDollarSign />,
  stamp: <Stamp />,
  download: <Download />,
  shield: <ShieldCheck />,
  card: <CreditCard />,
};

/** Mono HUD eyebrow (and accessible name) per journey. */
export const TRACK_HUD: Record<TrackJourney, string> = {
  leave: 'Leave tracker',
  claim: 'Claim tracker',
  letter: 'Letter tracker',
  election: 'Enrolment tracker',
};

/**
 * Everything the derivations read, refreshed every minute (ETAs and the
 * courier move with the clock). `viewerId` = someone deciding (approvals inbox).
 */
export function useTrackContext(viewerId?: string): TrackContext {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const leave = useHr((s) => s.leave);
  const now = useNow(60_000);
  const peopleOps = useMemo(() => usersWithPermission(users, roles, HR_PERMS.manage), [users, roles]);
  return useMemo(() => ({ now, users, peopleOps, leave, viewerId }), [now, users, peopleOps, leave, viewerId]);
}

/** Status line: names in bold; every fixed phrase stays its own text node for the translator. */
function TrackMessage({ parts }: { parts: TrackPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.who ? (
          <b key={i} className="hr-trk__who">
            {p.text}
          </b>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/**
 * One journey. `auto` (default) shows the full tracker while the journey is
 * in flight and the compact bar once it has settled; `progress` overrides the
 * courier (e.g. the approvals SLA).
 */
export function HrTracker({ track, variant = 'auto', progress, className }: { track: Track | null; variant?: 'auto' | 'full' | 'compact'; progress?: number; className?: string }) {
  if (!track) return null;
  const compact = variant === 'compact' || (variant === 'auto' && !track.inFlight);
  const steps: NeoTrackStep[] = track.stages.map((s) => ({ id: s.id, label: s.label, sub: s.sub, at: s.at, icon: ICON[s.icon] }));
  return (
    <NeoTracker
      steps={steps}
      current={track.current}
      state={track.state}
      hud={TRACK_HUD[track.journey]}
      message={!compact && track.message.length ? <TrackMessage parts={track.message} /> : undefined}
      eta={compact ? undefined : track.eta}
      progress={progress ?? track.progress}
      compact={compact}
      bare={!compact}
      className={cx('hr-trk', compact ? 'hr-trk--compact' : 'hr-trk--full', className)}
    />
  );
}
