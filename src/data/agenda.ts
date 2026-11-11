import type { IconName } from '@/icons';
import { useCalendar } from '@/calendar/store';
import { SEED_CALENDAR_EVENTS } from '@/calendar/seed';

export interface AgendaItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  appId: string;
  icon: IconName;
  location: string;
  attendees: number;
}

const TEMPLATES: { title: string; appId: string; icon: IconName; location: string; attendees: number; mins: number }[] = [
  { title: 'Team stand-up', appId: 'meet', icon: 'Video', location: 'Meet', attendees: 8, mins: 15 },
  { title: 'Design critique: onboarding v3', appId: 'meet', icon: 'Palette', location: 'Atrium · Room Nebula', attendees: 6, mins: 45 },
  { title: 'Lunch & Learn: AI at work', appId: 'learning', icon: 'GraduationCap', location: 'Academy Live', attendees: 64, mins: 60 },
  { title: '1:1 with your manager', appId: 'meet', icon: 'Users', location: 'Meet', attendees: 2, mins: 30 },
  { title: 'Focus block', appId: 'calendar', icon: 'Hourglass', location: 'Do not disturb', attendees: 1, mins: 90 },
  { title: 'Q4 planning sync', appId: 'projects', icon: 'SquareKanban', location: 'Room Orbit', attendees: 5, mins: 30 },
];

const SEED_IDS = new Set(SEED_CALENDAR_EVENTS.map((e) => e.id));

/**
 * Demo agenda generated relative to the current time, so there is always a
 * "happening now" and "up next" item regardless of when the hub is opened,
 * plus any custom events created live in Helix Calendar / Helix Meet.
 */
export function buildAgenda(now = new Date()): AgendaItem[] {
  const base = new Date(now);
  base.setMinutes(base.getMinutes() < 30 ? 0 : 30, 0, 0);
  const offsets = [-180, -90, -15, 45, 120, 210]; // minutes relative to the current half-hour
  const core = TEMPLATES.map((t, i) => {
    const start = new Date(base.getTime() + offsets[i] * 60_000);
    const end = new Date(start.getTime() + t.mins * 60_000);
    return { id: `ev-${i}`, title: t.title, appId: t.appId, icon: t.icon, location: t.location, attendees: t.attendees, start, end };
  });

  try {
    const customEvents = useCalendar
      .getState()
      .events.filter((e) => e.dayOffset === 0 && !SEED_IDS.has(e.id));

    const extra: AgendaItem[] = customEvents.map((ev, idx) => {
      const start = new Date(base.getTime() + (30 + idx * 35) * 60_000);
      const end = new Date(start.getTime() + ev.durationMins * 60_000);
      return {
        id: ev.id,
        title: ev.title,
        appId: ev.category === 'focus' ? 'calendar' : 'meet',
        icon: ev.category === 'focus' ? 'Hourglass' : 'Video',
        location: ev.roomName,
        attendees: Math.max(1, ev.attendeeIds.length),
        start,
        end,
      };
    });
    return [...core, ...extra].sort((a, b) => a.start.getTime() - b.start.getTime());
  } catch {
    return core;
  }
}
