/**
 * Public App Bridge for Spaces — "Orbit" (see src/lib/appBridge.ts).
 *
 * Powers ⌘K command palette, Settings → Reset demo, Launchpad / People
 * office presence (`presenceToday`), cross-app desk booking (`bookDesk`),
 * and cross-app visitor registration (`registerVisitor`).
 */
import { BadgeCheck, BarChart3, Building2, CalendarClock, MapPin, UserPlus, Wrench } from 'lucide-react';
import type { BridgeViewer, PaletteEntry, SpacesBridge } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { hasSpacesAccess } from './access';
import { computePresenceToday, defaultSiteForUser } from './engine';
import {
  FALLBACK_CAL_ROOMS,
  SITE_BY_ID,
  buildRooms,
  dateMapForOffset,
  siteFromText,
} from './seed';
import { useSpaces } from './store';
import type { VisitPurpose } from './types';

const VALID_PURPOSES = new Set<VisitPurpose>([
  'meeting',
  'interview',
  'delivery',
  'contractor',
  'event',
  'other',
]);

function normalizePurpose(raw?: string): VisitPurpose {
  const clean = (raw ?? '').trim().toLowerCase() as VisitPurpose;
  return VALID_PURPOSES.has(clean) ? clean : 'meeting';
}

export const api: SpacesBridge = {
  appId: 'spaces',

  paletteEntries(viewer: BridgeViewer): PaletteEntry[] {
    if (!hasSpacesAccess(viewer)) return [];
    const st = useSpaces.getState();
    const out: PaletteEntry[] = [];

    const addAction = (
      id: string,
      title: string,
      subtitle: string,
      to: string,
      icon: PaletteEntry['icon'],
      keywords: string[],
    ) => {
      out.push({
        id: `spaces:action:${id}`,
        group: 'Actions',
        title,
        subtitle,
        to,
        icon,
        glyphColor: '#e879f9',
        keywords: ['spaces', 'orbit', 'office', 'workplace', ...keywords],
        hint: 'Open',
      });
    };

    addAction(
      'today',
      "Who's in today",
      'Live hub presence, weather, commute & office announcements',
      '/spaces',
      <Building2 />,
      ['today', 'presence', 'who is in', 'colleagues'],
    );
    addAction(
      'desks',
      'Book a desk',
      'Interactive floor plan with "Sit near my team" & EV parking',
      '/spaces/desks',
      <MapPin />,
      ['desk', 'hot desk', 'floor plan', 'seat', 'parking', 'locker'],
    );
    addAction(
      'rooms',
      'Book a room',
      'HoloMeet rooms with live CO₂, temperature & acoustic scores',
      '/spaces/rooms',
      <CalendarClock />,
      ['room', 'meeting room', 'holomeet', 'boardroom', 'pod'],
    );
    addAction(
      'visitor',
      'Register a visitor',
      'Issue QR badge pass, NDA pre-check & host Pulse Chat ping',
      '/spaces/visitors?new=1',
      <UserPlus />,
      ['visitor', 'guest', 'badge', 'kiosk', 'nda'],
    );
    addAction(
      'requests',
      'Raise a facility request',
      'AV setup, HVAC climate, catering, cleaning & smart lockers',
      '/spaces/requests',
      <Wrench />,
      ['facility', 'maintenance', 'catering', 'cleaning', 'ticket'],
    );
    addAction(
      'insights',
      'Workplace Insights',
      'Occupancy, check-in rate, ghost-desk sweep & carbon saved',
      '/spaces/insights',
      <BarChart3 />,
      ['insights', 'occupancy', 'carbon', 'co2', 'ghost desks'],
    );

    const rooms = buildRooms(FALLBACK_CAL_ROOMS).slice(0, 8);
    for (const r of rooms) {
      out.push({
        id: `spaces:room:${r.id}`,
        group: 'Work',
        title: `Room ${r.name} (${r.code})`,
        subtitle: `${SITE_BY_ID[r.site].label} · ${r.floor} · ${r.capacity} seats · ${r.sensors.co2} ppm CO₂`,
        icon: <CalendarClock />,
        glyphColor: r.color,
        keywords: ['room', r.name.toLowerCase(), r.code.toLowerCase(), r.site],
        hint: 'Book room',
        to: `/spaces/rooms?room=${r.id}`,
      });
    }

    for (const v of st.visitors.slice(0, 6)) {
      out.push({
        id: `spaces:visitor:${v.id}`,
        group: 'Work',
        title: `${v.name} · ${v.company}`,
        subtitle: `Visitor (${v.stage}) · ${SITE_BY_ID[v.site].label} · ${v.badge ?? 'Pending badge'}`,
        icon: <BadgeCheck />,
        glyphColor: '#e879f9',
        keywords: ['visitor', 'badge', v.name.toLowerCase(), v.company.toLowerCase()],
        hint: 'View badge',
        to: `/spaces/visitors?visitor=${v.id}`,
      });
    }

    return out;
  },

  resetDemo() {
    useSpaces.getState().resetDemo();
  },

  presenceToday(viewer) {
    if (!hasSpacesAccess(viewer)) return [];
    const st = useSpaces.getState();
    const users = useHub.getState().users;
    const entries = computePresenceToday(
      st.bookings,
      users,
      st.hiddenPresence,
      dateMapForOffset(0),
    );
    return entries.map((e) => ({
      userId: e.userId,
      site: e.site,
      zone: e.zone,
      desk: e.desk,
    }));
  },

  bookDesk(viewer, input) {
    if (!hasSpacesAccess(viewer)) {
      return { ok: false, error: 'You do not have permission to book desks in Spaces.' };
    }
    const site = siteFromText(input.site) ?? defaultSiteForUser(viewer.user);
    const res = useSpaces.getState().bookDesk({
      userId: viewer.user.id,
      site,
      dayOffset: input.dayOffset,
      nearUserId: input.nearUserId,
      source: input.source,
    });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
    return {
      ok: true,
      bookingId: res.booking.id,
      desk: res.booking.label,
      to: `/spaces/desks?site=${site}&desk=${res.booking.resourceId}`,
    };
  },

  registerVisitor(viewer, input) {
    if (!hasSpacesAccess(viewer)) {
      return { ok: false, error: 'You do not have permission to register visitors in Spaces.' };
    }
    if (!input.name || !input.name.trim()) {
      return { ok: false, error: 'Visitor name is required.' };
    }
    const site = siteFromText(input.site) ?? defaultSiteForUser(viewer.user);
    const visitor = useSpaces.getState().registerVisitor({
      hostId: viewer.user.id,
      name: input.name,
      company: input.company,
      email: input.email,
      dayOffset: input.dayOffset,
      hour: input.hour,
      site,
      purpose: normalizePurpose(input.purpose),
      source: input.source,
    });
    return {
      ok: true,
      visitorId: visitor.id,
      to: `/spaces/visitors?visitor=${visitor.id}`,
    };
  },
};
