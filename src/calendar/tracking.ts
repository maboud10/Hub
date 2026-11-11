/**
 * Helix Calendar — Chronos booking tracker model for the shared NeoTracker
 * (`components/neo/Tracker.tsx`).
 *
 * Maps the Nova scheduler flow onto five stages — Understood → Golden window →
 * Room → Invites → Booked — derived from the live `activeNovaDraft` (waiting on
 * your confirmation) or from the committed `CalendarEvent` (booked).
 */
import { formatDecimalHour, formatHourRange } from './engine';
import { EVENT_CATEGORY_META } from './seed';
import type { CalendarEvent, NovaScheduleDraft } from './types';

export type BookingStageId = 'understood' | 'window' | 'room' | 'invites' | 'booked';

export interface BookingStage {
  id: BookingStageId;
  label: string;
  sub?: string;
  at?: string;
}

export interface BookingTrack {
  steps: BookingStage[];
  /** 3 (Invites live) while the draft waits for confirmation, `steps.length` once booked. */
  current: number;
  state: 'active' | 'done';
  /** Solo Deep Work block: nobody to invite, no HoloMeet room. */
  solo: boolean;
  /** ETA chip, e.g. "Today · 12:00 GST". */
  when: string;
  /** Live status line for the tracker. */
  message: string;
}

type BookingSource = Pick<
  NovaScheduleDraft,
  'category' | 'dayOffset' | 'startHour' | 'durationMins' | 'attendeeIds' | 'roomName'
> & {
  /** Circadian harmony of the chosen window (drafts carry it; events don't). */
  harmonyScore?: number;
  organizerId?: string;
};

/** "Today" / "Tomorrow" / "Yesterday", else a signed day offset ("Day +3"). */
export function bookingDayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  return `Day ${offset > 0 ? '+' : ''}${offset}`;
}

/** "Room Nebula · Holo-Boardroom + HoloMeet" → "Room Nebula". */
export function shortRoomName(roomName: string): string {
  return roomName.replace(/\s*\+\s*HoloMeet\s*$/i, '').split('·')[0].trim() || roomName;
}

/** Invitees (everyone but the organizer) as "Omar, Mei +1"; `null` when nobody is invited. */
export function inviteeSummary(
  attendeeIds: string[],
  organizerId: string,
  nameOf: (userId: string) => string | undefined,
): string | null {
  const firstNames = attendeeIds
    .filter((id) => id !== organizerId)
    .map((id) => {
      const name = nameOf(id)?.trim();
      if (name) return name.split(/\s+/)[0];
      const raw = id.replace(/^u-/, '');
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    });
  if (!firstNames.length) return null;
  const shown = firstNames.slice(0, 2).join(', ');
  return firstNames.length > 2 ? `${shown} +${firstNames.length - 2}` : shown;
}

export function deriveBookingTrack(
  src: BookingSource,
  booked: boolean,
  nameOf: (userId: string) => string | undefined = () => undefined,
): BookingTrack {
  const solo = src.category === 'focus';
  const invitees = inviteeSummary(src.attendeeIds, src.organizerId ?? 'u-layla', nameOf);

  const steps: BookingStage[] = [
    { id: 'understood', label: 'Understood', sub: EVENT_CATEGORY_META[src.category].label, at: `${src.durationMins}m` },
    {
      id: 'window',
      label: 'Golden window',
      sub: `${formatHourRange(src.startHour, src.durationMins)} GST`,
      at: src.harmonyScore !== undefined ? `${src.harmonyScore}%` : undefined,
    },
    { id: 'room', label: 'Room', sub: shortRoomName(src.roomName) },
    { id: 'invites', label: 'Invites', sub: invitees ?? 'Just you' },
    { id: 'booked', label: 'Booked', sub: solo ? EVENT_CATEGORY_META.focus.label : 'HoloMeet room' },
  ];

  const message = booked
    ? solo
      ? 'Booked — your Deep Work shield is on the grid'
      : 'Booked — invites are out and the HoloMeet room is ready'
    : solo
      ? 'Nova is holding this golden window — confirm to shield it'
      : 'Nova is holding this golden window — confirm to send invites';

  return {
    steps,
    current: booked ? steps.length : 3,
    state: booked ? 'done' : 'active',
    solo,
    when: `${bookingDayLabel(src.dayOffset)} · ${formatDecimalHour(src.startHour)} GST`,
    message,
  };
}

/** Convenience wrappers for the two real sources of the journey. */
export const trackNovaDraft = (draft: NovaScheduleDraft, nameOf?: (userId: string) => string | undefined) =>
  deriveBookingTrack(draft, false, nameOf);

export const trackBookedEvent = (
  event: CalendarEvent,
  harmonyScore: number | undefined,
  nameOf?: (userId: string) => string | undefined,
) => deriveBookingTrack({ ...event, harmonyScore }, true, nameOf);
