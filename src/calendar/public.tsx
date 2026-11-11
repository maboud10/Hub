/**
 * Public App Bridge for Helix Calendar (see src/lib/appBridge.ts).
 *
 * Powers the global ⌘K Command Palette and Settings → Reset demo for
 * Chronos events, smart spatial rooms, and global time-zone scheduling.
 */
import { Building2, CalendarDays, Clock, Globe2, Link2, Sparkles } from 'lucide-react';
import type { AppPublicApi, BridgeViewer, PaletteEntry } from '@/lib/appBridge';
import { formatHourRange } from './engine';
import { EVENT_CATEGORY_META } from './seed';
import { useCalendar } from './store';

function hasCalendarAccess(viewer: BridgeViewer): boolean {
  return viewer.perms.has('*') || viewer.perms.has('app:calendar');
}

export const api: AppPublicApi = {
  appId: 'calendar',

  paletteEntries(viewer) {
    if (!hasCalendarAccess(viewer)) return [];
    const st = useCalendar.getState();
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `calendar:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['calendar', 'chronos', 'schedule', 'time', ...keywords], hint: 'Open' });

    action('grid', 'Chronos Time Grid & Focus Runway', '/calendar', <CalendarDays />, ['grid', 'agenda', 'today', 'week', 'events'], 'Neural schedule, deep work shields & defrag');
    action('nova', 'Schedule or Defrag with Nova AI', '/calendar?new=1', <Sparkles />, ['nova', 'book', 'new event', 'defrag', 'focus'], 'Natural-language multi-timezone scheduling');
    action('scheduler', 'Global Time-Zone Weaver', '/calendar/scheduler', <Globe2 />, ['timezone', 'dubai', 'london', 'singapore', 'overlap', 'circadian'], 'Find golden circadian overlap across hubs');
    action('rooms', 'Smart Rooms & Spatial Pods', '/calendar/rooms', <Building2 />, ['rooms', 'pods', 'book room', 'nebula', 'orbit'], 'Live environmental telemetry & instant pod booking');
    action('links', 'Smart Booking Links & Routing', '/calendar/links', <Link2 />, ['links', 'calendly', 'routing', 'round robin'], 'CRM & Talent auto-routed booking pages');
    action('analytics', 'Chronos Maker vs. Manager Telemetry', '/calendar/analytics', <Clock />, ['analytics', 'focus', 'maker', 'burn', 'audit'], 'Deep work ratio & meeting cost audit');

    for (const ev of st.events) {
      const meta = EVENT_CATEGORY_META[ev.category];
      out.push({
        id: `calendar:ev:${ev.id}`,
        group: 'Work',
        title: ev.title,
        subtitle: `${meta.label} · ${formatHourRange(ev.startHour, ev.durationMins)} · ${ev.roomName}`,
        icon: <CalendarDays />,
        glyphColor: ev.color,
        keywords: ['calendar', 'event', 'meeting', ev.title.toLowerCase(), ev.category, ev.roomName.toLowerCase()],
        hint: ev.meetRoomId ? 'Open / Join' : 'Inspect',
        to: `/calendar?event=${ev.id}`,
      });
    }

    for (const rm of st.rooms) {
      out.push({
        id: `calendar:room:${rm.id}`,
        group: 'Work',
        title: rm.name,
        subtitle: `${rm.hub} · ${rm.capacity} seats · ${rm.status.toUpperCase()} · CO₂ ${rm.telemetry.co2Ppm}ppm`,
        icon: <Building2 />,
        glyphColor: rm.color,
        keywords: ['calendar', 'room', 'pod', rm.name.toLowerCase(), rm.hub.toLowerCase(), rm.code.toLowerCase()],
        hint: 'Book pod',
        to: '/calendar/rooms',
      });
    }

    return out;
  },

  resetDemo() {
    useCalendar.getState().resetCalendar();
  },
};
