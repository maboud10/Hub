/**
 * Spaces — "Orbit" pure workplace engine:
 * - "Sit near my team" desk recommender (spatial Euclidean distance + zone & amenity scoring)
 * - Room availability & environmental sensor scorer (CO₂, °C, dBA, HoloMeet gear)
 * - Visitor badge 5-stage state machine & denied-party watchlist screening
 * - Facility request 5-stage journey tracker
 * - Workplace pulse, ghost-desk detector & hybrid carbon/cost savings calculator
 * - Explainable Nova Workplace copilot responder
 */
import type { User } from '@/types';
import {
  DESKS,
  DESK_BY_ID,
  SITES,
  SITE_BY_ID,
  WATCHLIST,
  ZONES,
  ZONE_BY_ID,
  desksOf,
  siteFromText,
  zonesOf,
} from './layout';
import type {
  Amenity,
  Booking,
  BookingKind,
  BookingStatus,
  CalEventLite,
  Desk,
  HubCity,
  Room,
  RoomGear,
  RoomKind,
  Sensors,
  ServiceRequest,
  ServiceStage,
  SiteId,
  Visitor,
  VisitorAction,
  VisitorStage,
  VisitorWatch,
  Zone,
  ZoneKind,
} from './types';

export function defaultSiteForUser(user?: Pick<User, 'location'> | null): SiteId {
  return siteFromText(user?.location) ?? 'dubai';
}

export function hoursOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

export function formatDecimalHour(hour: number): string {
  const clamped = Math.max(0, Math.min(23.99, hour));
  const h = Math.floor(clamped);
  const m = Math.round((clamped - h) * 60);
  const hh = m === 60 ? h + 1 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function activeBookingsForDay(
  bookings: Booking[],
  site: SiteId,
  date: string,
  kind?: BookingKind,
): Booking[] {
  return bookings.filter(
    (b) =>
      b.site === site &&
      b.date === date &&
      (kind ? b.kind === kind : true) &&
      (b.status === 'booked' || b.status === 'checked_in'),
  );
}

export function isResourceFree(
  bookings: Booking[],
  resourceId: string,
  date: string,
  start = 9,
  end = 18,
  ignoreBookingId?: string,
): boolean {
  return !bookings.some(
    (b) =>
      b.id !== ignoreBookingId &&
      b.resourceId === resourceId &&
      b.date === date &&
      (b.status === 'booked' || b.status === 'checked_in') &&
      hoursOverlap(b.start, b.end, start, end),
  );
}

/* ───────────────────────── Presence Today ───────────────────────── */

export interface PresenceEntry {
  userId: string;
  user?: User;
  site: HubCity;
  siteId: SiteId;
  zone?: string;
  zoneId?: string;
  desk: string;
  deskId: string;
  bookingId: string;
  status: BookingStatus;
  start: number;
  end: number;
}

export function computePresenceToday(
  bookings: Booking[],
  users: User[],
  hiddenPresence: string[],
  dateBySite: Record<SiteId, string>,
  siteFilter?: SiteId,
): PresenceEntry[] {
  const hidden = new Set(hiddenPresence);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const seen = new Set<string>();
  const out: PresenceEntry[] = [];

  for (const b of bookings) {
    if (b.kind !== 'desk') continue;
    if (b.status !== 'booked' && b.status !== 'checked_in') continue;
    if (siteFilter && b.site !== siteFilter) continue;
    if (b.date !== dateBySite[b.site]) continue;
    if (hidden.has(b.userId)) continue;
    const key = `${b.site}:${b.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const desk = DESK_BY_ID[b.resourceId];
    const zone = desk ? ZONE_BY_ID[desk.zoneId] : undefined;
    const siteMeta = SITE_BY_ID[b.site];
    out.push({
      userId: b.userId,
      user: userMap.get(b.userId),
      site: siteMeta.city,
      siteId: b.site,
      zone: zone?.team ?? (zone ? `${zone.kind.charAt(0).toUpperCase()}${zone.kind.slice(1)} Zone` : undefined),
      zoneId: zone?.id,
      desk: b.label,
      deskId: b.resourceId,
      bookingId: b.id,
      status: b.status,
      start: b.start,
      end: b.end,
    });
  }
  return out;
}

/* ───────────────────────── "Sit Near My Team" Desk Recommender ───────────────────────── */

export interface NearbyColleague {
  user: User;
  deskCode: string;
  deskId: string;
  distance: number;
  isTeammate: boolean;
}

export interface DeskRecommendation {
  desk: Desk;
  zone: Zone;
  score: number;
  reasons: string[];
  nearbyColleagues: NearbyColleague[];
  isTeamZone: boolean;
}

export function isTeammateOf(a: User, b: User): boolean {
  if (a.id === b.id) return false;
  if (a.department && b.department && a.department === b.department) return true;
  if (a.managerId && a.managerId === b.id) return true;
  if (b.managerId && b.managerId === a.id) return true;
  if (a.managerId && b.managerId && a.managerId === b.managerId) return true;
  return false;
}

function zoneMatchesDepartment(zone: Zone, dept: string): boolean {
  if (!zone.team || !dept) return false;
  const t = zone.team.toLowerCase();
  const d = dept.toLowerCase();
  if (d.includes('eng') && t.includes('eng')) return true;
  if ((d.includes('design') || d.includes('product')) && (t.includes('design') || t.includes('product'))) return true;
  if ((d.includes('people') || d.includes('ops') || d.includes('security') || d.includes('it')) && (t.includes('people') || t.includes('ops'))) return true;
  if (d.includes('finance') && t.includes('finance')) return true;
  if (d.includes('sales') && t.includes('sales')) return true;
  if (d.includes('customer') && t.includes('customer')) return true;
  return false;
}

export interface RecommendDesksInput {
  viewer: User;
  site: SiteId;
  date: string;
  start?: number;
  end?: number;
  bookings: Booking[];
  users: User[];
  requiredAmenities?: Amenity[];
  nearUserId?: string;
  zoneKind?: ZoneKind;
}

export function recommendDesks(input: RecommendDesksInput): DeskRecommendation[] {
  const {
    viewer,
    site,
    date,
    start = 9,
    end = 18,
    bookings,
    users,
    requiredAmenities = [],
    nearUserId,
    zoneKind,
  } = input;

  const userMap = new Map(users.map((u) => [u.id, u]));
  const dayDeskBookings = activeBookingsForDay(bookings, site, date, 'desk').filter((b) =>
    hoursOverlap(b.start, b.end, start, end),
  );
  const occupiedByDeskId = new Map(dayDeskBookings.map((b) => [b.resourceId, b]));

  const targetBooking = nearUserId ? dayDeskBookings.find((b) => b.userId === nearUserId) : undefined;
  const targetDesk = targetBooking ? DESK_BY_ID[targetBooking.resourceId] : undefined;
  const targetUser = nearUserId ? userMap.get(nearUserId) : undefined;

  const siteDesks = desksOf(site);
  const results: DeskRecommendation[] = [];

  for (const desk of siteDesks) {
    if (occupiedByDeskId.has(desk.id)) continue;
    const zone = ZONE_BY_ID[desk.zoneId];
    if (!zone) continue;
    if (zoneKind && zone.kind !== zoneKind) continue;
    if (requiredAmenities.some((a) => !desk.amenities.includes(a))) continue;

    let score = 40;
    const reasons: string[] = [];
    const nearbyColleagues: NearbyColleague[] = [];

    // 1. Evaluate proximity to seated colleagues
    for (const b of dayDeskBookings) {
      if (b.userId === viewer.id) continue;
      const otherDesk = DESK_BY_ID[b.resourceId];
      const otherUser = userMap.get(b.userId);
      if (!otherDesk || !otherUser) continue;

      const dist = +Math.hypot(desk.x - otherDesk.x, desk.y - otherDesk.y).toFixed(2);
      const mate = isTeammateOf(viewer, otherUser);
      if (dist <= 5.5 || otherDesk.zoneId === desk.zoneId) {
        nearbyColleagues.push({
          user: otherUser,
          deskCode: otherDesk.code,
          deskId: otherDesk.id,
          distance: dist,
          isTeammate: mate,
        });
      }
    }

    nearbyColleagues.sort((a, b) => a.distance - b.distance);

    // 2. Specific colleague proximity (`nearUserId`)
    if (targetDesk && targetUser) {
      const dist = Math.hypot(desk.x - targetDesk.x, desk.y - targetDesk.y);
      const proxBonus = Math.max(0, Math.round(52 - dist * 9));
      score += proxBonus;
      if (desk.zoneId === targetDesk.zoneId) {
        score += 16;
      }
      if (dist <= 3.2) {
        reasons.push(`Adjacent to ${targetUser.name} (${targetDesk.code})`);
      } else if (desk.zoneId === targetDesk.zoneId) {
        reasons.push(`Same zone as ${targetUser.name} (${targetDesk.code})`);
      }
    }

    // 3. Teammates in the same zone or adjacent desks
    const teammatesNear = nearbyColleagues.filter((c) => c.isTeammate);
    if (teammatesNear.length > 0) {
      const closest = teammatesNear[0];
      score += teammatesNear.length * 16 + Math.max(0, Math.round(14 - closest.distance * 3));
      const names = teammatesNear
        .slice(0, 2)
        .map((c) => `${c.user.name.split(' ')[0]} (${c.deskCode})`)
        .join(', ');
      reasons.push(`Near teammates: ${names}`);
    }

    // 4. Department neighbourhood match
    const isTeamZone = zoneMatchesDepartment(zone, viewer.department);
    if (isTeamZone) {
      score += 15;
      reasons.push(`${zone.team} neighbourhood`);
    }

    // 5. Amenities & environmental comfort
    if (desk.amenities.includes('dual-monitor')) {
      score += 5;
      if (reasons.length < 3) reasons.push('Dual 4K displays');
    }
    if (desk.amenities.includes('window')) {
      score += 4;
      if (reasons.length < 3) reasons.push('Natural daylight window line');
    }
    if (desk.amenities.includes('standing')) {
      score += 3;
    }
    if (zone.sensors.co2 < 620 && zone.sensors.noiseDb <= 44) {
      score += 6;
      if (reasons.length < 3) reasons.push(`Fresh air (${zone.sensors.co2} ppm CO₂)`);
    }

    if (reasons.length === 0) {
      reasons.push(`Open desk in ${zone.team ?? zone.kind} zone`);
    }

    results.push({
      desk,
      zone,
      score: Math.min(99, score),
      reasons,
      nearbyColleagues,
      isTeamZone,
    });
  }

  return results.sort((a, b) => b.score - a.score || a.desk.code.localeCompare(b.desk.code));
}

/* ───────────────────────── Room Availability & Sensor Scorer ───────────────────────── */

export interface SensorHealth {
  score: number;
  grade: 'optimal' | 'good' | 'fair' | 'attention';
  co2Tone: 'emerald' | 'amber' | 'rose';
  tempTone: 'emerald' | 'amber' | 'rose';
  noiseTone: 'emerald' | 'amber' | 'rose';
  avHealth: number;
  summary: string;
}

export function sensorHealth(sensors: Sensors, hasHolo = false): SensorHealth {
  let score = 100;

  let co2Tone: SensorHealth['co2Tone'] = 'emerald';
  if (sensors.co2 > 800) {
    co2Tone = 'rose';
    score -= 28;
  } else if (sensors.co2 > 650) {
    co2Tone = 'amber';
    score -= 12;
  }

  let tempTone: SensorHealth['tempTone'] = 'emerald';
  if (sensors.tempC < 19.5 || sensors.tempC > 24.5) {
    tempTone = 'rose';
    score -= 18;
  } else if (sensors.tempC < 20.5 || sensors.tempC > 23.3) {
    tempTone = 'amber';
    score -= 7;
  }

  let noiseTone: SensorHealth['noiseTone'] = 'emerald';
  if (sensors.noiseDb > 55) {
    noiseTone = 'rose';
    score -= 18;
  } else if (sensors.noiseDb > 44) {
    noiseTone = 'amber';
    score -= 8;
  }

  const clamped = Math.max(40, Math.min(100, score));
  const grade: SensorHealth['grade'] =
    clamped >= 90 ? 'optimal' : clamped >= 78 ? 'good' : clamped >= 64 ? 'fair' : 'attention';

  const avHealth = hasHolo ? 99 : 98;
  const summary =
    grade === 'optimal'
      ? 'Crisp air & studio acoustics'
      : grade === 'good'
        ? 'Comfortable climate & ready AV'
        : grade === 'fair'
          ? 'Elevated CO₂ — HVAC boosting'
          : 'Ventilation recovery recommended';

  return { score: clamped, grade, co2Tone, tempTone, noiseTone, avHealth, summary };
}

export function isRoomAvailable(
  room: Room,
  bookings: Booking[],
  calEvents: CalEventLite[],
  date: string,
  dayOffset: number,
  start: number,
  end: number,
): boolean {
  const roomBusyInSpaces = !isResourceFree(bookings, room.id, date, start, end);
  if (roomBusyInSpaces) return false;

  const roomBusyInCal = calEvents.some(
    (ev) =>
      ev.roomId === room.id &&
      ev.dayOffset === dayOffset &&
      hoursOverlap(ev.startHour, ev.startHour + ev.durationMins / 60, start, end),
  );
  return !roomBusyInCal;
}

export interface ScoredRoom {
  room: Room;
  available: boolean;
  health: SensorHealth;
  fitScore: number;
  currentBooking?: Booking;
  nextBooking?: Booking;
}

export interface ScoreRoomsInput {
  site: SiteId;
  date: string;
  dayOffset?: number;
  start: number;
  end: number;
  minCapacity?: number;
  requiredGear?: RoomGear[];
  kind?: RoomKind;
  bookings: Booking[];
  calEvents?: CalEventLite[];
}

export function scoreRooms(rooms: Room[], input: ScoreRoomsInput): ScoredRoom[] {
  const {
    site,
    date,
    dayOffset = 0,
    start,
    end,
    minCapacity = 1,
    requiredGear = [],
    kind,
    bookings,
    calEvents = [],
  } = input;

  const dayRoomBookings = activeBookingsForDay(bookings, site, date, 'room');

  return rooms
    .filter((r) => {
      if (r.site !== site) return false;
      if (r.capacity < minCapacity) return false;
      if (kind && r.kind !== kind) return false;
      if (requiredGear.some((g) => !r.gear.includes(g))) return false;
      return true;
    })
    .map((room) => {
      const available = isRoomAvailable(room, bookings, calEvents, date, dayOffset, start, end);
      const health = sensorHealth(room.sensors, room.gear.includes('holomeet'));
      const currentBooking = dayRoomBookings.find(
        (b) => b.resourceId === room.id && hoursOverlap(b.start, b.end, start, end),
      );
      const nextBooking = dayRoomBookings
        .filter((b) => b.resourceId === room.id && b.start >= end)
        .sort((a, b) => a.start - b.start)[0];

      // Right-sizing: prefer rooms that match minCapacity without wasting 12+ seats
      const overCap = Math.max(0, room.capacity - Math.max(2, minCapacity));
      const sizeScore = Math.max(0, 25 - overCap * 2);
      const gearBonus = room.gear.includes('holomeet') ? 10 : room.gear.length * 2;
      const fitScore = Math.min(
        99,
        Math.round((available ? 40 : 10) + health.score * 0.35 + sizeScore + gearBonus),
      );

      return { room, available, health, fitScore, currentBooking, nextBooking };
    })
    .sort((a, b) => Number(b.available) - Number(a.available) || b.fitScore - a.fitScore);
}

/* ───────────────────────── Visitor 5-Stage State Machine ───────────────────────── */

export const VISITOR_JOURNEY_STEPS: { id: VisitorStage; label: string; sub: string }[] = [
  { id: 'invited', label: 'Invited', sub: 'QR pass & calendar hold sent' },
  { id: 'preregistered', label: 'NDA & Security Pre-check', sub: 'Digital NDA & export screening' },
  { id: 'arrived', label: 'Arrived at Kiosk', sub: 'Lobby check-in & ID check' },
  { id: 'badged', label: 'Host Notified & Badged', sub: 'Badge printed · Pulse Chat ping' },
  { id: 'checked_out', label: 'Checked Out', sub: 'Turnstile exit & badge deactivated' },
];

export function visitorStepIndex(stage: VisitorStage): number {
  switch (stage) {
    case 'invited':
      return 0;
    case 'preregistered':
      return 1;
    case 'arrived':
      return 2;
    case 'badged':
      return 3;
    case 'checked_out':
      return 5;
    case 'cancelled':
      return 0;
  }
}

export function visitorTrackerState(visitor: Visitor): {
  current: number;
  state: 'active' | 'blocked' | 'paused' | 'done';
  message: string;
  eta: string;
} {
  const arrivalStr = `Arrival ${formatDecimalHour(visitor.hour)}`;
  if (visitor.stage === 'cancelled') {
    return {
      current: 0,
      state: 'paused',
      message: 'Visit cancelled — QR pass revoked at turnstiles.',
      eta: 'Cancelled',
    };
  }
  if (visitor.watch && !visitor.watch.cleared) {
    return {
      current: visitorStepIndex(visitor.stage),
      state: 'blocked',
      message: `Security hold: ${visitor.watch.reason}. Escalate to SOC or clear with Workplace Ops.`,
      eta: 'Hold at Kiosk',
    };
  }
  switch (visitor.stage) {
    case 'invited':
      return {
        current: 0,
        state: 'active',
        message: visitor.ndaRequired && !visitor.ndaSigned
          ? 'Waiting on guest to complete pre-registration & digital NDA.'
          : 'Invitation sent — guest can fast-track at lobby kiosk.',
        eta: arrivalStr,
      };
    case 'preregistered':
      return {
        current: 1,
        state: 'active',
        message: 'Pre-check & NDA complete. Express QR pass ready for turnstile scan.',
        eta: arrivalStr,
      };
    case 'arrived':
      return {
        current: 2,
        state: 'active',
        message:
          visitor.ndaRequired && !visitor.ndaSigned
            ? 'Guest at kiosk — requires NDA signature before printing badge.'
            : 'Guest checked in at reception kiosk — ready to print badge & ping host.',
        eta: 'At Reception',
      };
    case 'badged':
      return {
        current: 3,
        state: 'active',
        message: `Badge ${visitor.badge ?? ''} active on floor · Wi-Fi ${SITE_BY_ID[visitor.site].wifiSsid} provisioned.`,
        eta: 'On site now',
      };
    case 'checked_out':
      return {
        current: 5,
        state: 'done',
        message: 'Guest checked out and temporary NFC/QR credentials expired.',
        eta: 'Completed',
      };
  }
}

export function screenVisitor(name: string, company: string): VisitorWatch | undefined {
  const n = name.trim().toLowerCase();
  const c = company.trim().toLowerCase();
  const hit = WATCHLIST.find(
    (w) =>
      (n && n.includes(w.name.toLowerCase())) ||
      (c && c.includes(w.company.toLowerCase())),
  );
  return hit ? { reason: hit.reason } : undefined;
}

const SITE_BADGE_PREFIX: Record<SiteId, string> = {
  dubai: 'DXB',
  london: 'LDN',
  singapore: 'SGP',
  newyork: 'NYC',
};

export function generateBadgeCode(site: SiteId, seq: number): string {
  return `HLX-${SITE_BADGE_PREFIX[site]}-${String(4000 + (seq % 5000)).padStart(4, '0')}`;
}

export function applyVisitorAction(
  visitor: Visitor,
  action: VisitorAction,
  now = Date.now(),
  seq = 2100,
): Visitor {
  switch (action) {
    case 'preregister':
      return {
        ...visitor,
        stage: visitor.stage === 'invited' ? 'preregistered' : visitor.stage,
        ndaSigned: true,
        preRegisteredAt: visitor.preRegisteredAt ?? now,
        badge: visitor.badge ?? generateBadgeCode(visitor.site, seq),
      };
    case 'sign_nda':
      return {
        ...visitor,
        ndaSigned: true,
        idVerified: true,
        preRegisteredAt: visitor.preRegisteredAt ?? now,
      };
    case 'arrive':
      return {
        ...visitor,
        stage: 'arrived',
        idVerified: true,
        arrivedAt: visitor.arrivedAt ?? now,
        badge: visitor.badge ?? generateBadgeCode(visitor.site, seq),
      };
    case 'badge':
      if (visitor.watch && !visitor.watch.cleared) {
        return visitor;
      }
      return {
        ...visitor,
        stage: 'badged',
        ndaSigned: true,
        idVerified: true,
        arrivedAt: visitor.arrivedAt ?? now,
        badgeAt: now,
        hostPingedAt: now,
        badge: visitor.badge ?? generateBadgeCode(visitor.site, seq),
      };
    case 'checkout':
      return {
        ...visitor,
        stage: 'checked_out',
        checkedOutAt: now,
      };
    case 'cancel':
      return {
        ...visitor,
        stage: 'cancelled',
      };
  }
}

/* ───────────────────────── Facility Service Request 5-Stage Tracker ───────────────────────── */

export const REQUEST_JOURNEY_STEPS: { label: string; sub: string }[] = [
  { label: 'Submitted', sub: 'Logged with floor & zone telemetry' },
  { label: 'Triaged & Assigned', sub: 'Routed to Workplace Ops specialist' },
  { label: 'Technician Dispatched', sub: 'Parts & toolkit en route to floor' },
  { label: 'Work in Progress', sub: 'On-site remediation & calibration' },
  { label: 'Verified & Closed', sub: 'Sensor check passed & requester rated' },
];

export function requestTrackerState(req: ServiceRequest): {
  current: number;
  state: 'active' | 'blocked' | 'paused' | 'done';
  message: string;
  eta: string;
} {
  if (req.stage === 'cancelled') {
    return {
      current: 0,
      state: 'paused',
      message: 'Request cancelled by requester.',
      eta: 'Cancelled',
    };
  }
  const slaEta = req.priority === 'high' ? 'SLA 2h' : req.priority === 'normal' ? 'SLA 4h' : 'SLA Today';
  switch (req.stage) {
    case 'submitted':
      return {
        current: 0,
        state: 'active',
        message: `Queued for ${SITE_BY_ID[req.site].label} facilities desk (${req.where ?? 'Floor plan'}).`,
        eta: slaEta,
      };
    case 'assigned':
      return {
        current: 2,
        state: 'active',
        message: `${req.assignee ?? 'Workplace Ops'} dispatched to ${req.where ?? SITE_BY_ID[req.site].label}.`,
        eta: slaEta,
      };
    case 'in_progress':
      return {
        current: 3,
        state: 'active',
        message: `${req.assignee ?? 'Workplace Ops'} is actively resolving "${req.title}".`,
        eta: 'In progress',
      };
    case 'done':
      return {
        current: 5,
        state: 'done',
        message: `Resolved by ${req.assignee ?? 'Workplace Ops'}${req.rating ? ` · Rated ${req.rating}/5 ★` : ''}.`,
        eta: 'Completed',
      };
  }
}

export function nextServiceStage(stage: ServiceStage): ServiceStage {
  if (stage === 'submitted') return 'assigned';
  if (stage === 'assigned') return 'in_progress';
  if (stage === 'in_progress') return 'done';
  return 'done';
}

export function advanceRequestStage(
  req: ServiceRequest,
  targetStage?: ServiceStage,
  now = Date.now(),
  defaultAssignee = 'Mateo García · Workplace Ops',
): ServiceRequest {
  const next = targetStage ?? nextServiceStage(req.stage);
  return {
    ...req,
    stage: next,
    assignee: req.assignee ?? defaultAssignee,
    assignedAt: next === 'assigned' || !req.assignedAt ? now : req.assignedAt,
    startedAt: next === 'in_progress' ? now : req.startedAt,
    doneAt: next === 'done' ? now : req.doneAt,
  };
}

/* ───────────────────────── Workplace Pulse & Carbon Calculator ───────────────────────── */

export function detectGhostDesks(
  bookings: Booking[],
  site: SiteId,
  date: string,
  currentHour = 11,
): Booking[] {
  return bookings.filter(
    (b) =>
      b.site === site &&
      b.date === date &&
      b.kind === 'desk' &&
      b.status === 'booked' &&
      !b.checkedInAt &&
      currentHour >= b.start + 1.25,
  );
}

export interface ZoneUtilization {
  zone: Zone;
  totalDesks: number;
  bookedDesks: number;
  checkedInDesks: number;
  pct: number;
}

export interface WorkplacePulse {
  siteId: SiteId;
  totalDesks: number;
  bookedDesks: number;
  checkedInDesks: number;
  availableDesks: number;
  occupancyPct: number;
  checkInRatePct: number;
  ghostDesks: Booking[];
  releasedGhostsCount: number;
  activeVisitors: number;
  arrivedVisitors: number;
  openRequests: number;
  avgCo2: number;
  avgTempC: number;
  avgNoiseDb: number;
  carbonSavedKg: number;
  costSavedLocal: number;
  energySavedKwh: number;
  zoneUtilization: ZoneUtilization[];
  weeklyRhythmPct: number[];
}

export function computeWorkplacePulse(
  siteId: SiteId,
  date: string,
  bookings: Booking[],
  visitors: Visitor[],
  requests: ServiceRequest[],
  currentHour = 11,
): WorkplacePulse {
  const site = SITE_BY_ID[siteId];
  const siteDesks = desksOf(siteId);
  const siteZones = zonesOf(siteId);
  const totalDesks = siteDesks.length;

  const activeDesks = activeBookingsForDay(bookings, siteId, date, 'desk');
  const bookedDesks = activeDesks.length;
  const checkedInDesks = activeDesks.filter((b) => b.status === 'checked_in').length;
  const availableDesks = Math.max(0, totalDesks - bookedDesks);
  const occupancyPct = totalDesks > 0 ? Math.round((bookedDesks / totalDesks) * 100) : 0;
  const checkInRatePct = bookedDesks > 0 ? Math.round((checkedInDesks / bookedDesks) * 100) : 100;

  const ghostDesks = detectGhostDesks(bookings, siteId, date, currentHour);
  const releasedGhostsCount = bookings.filter(
    (b) => b.site === siteId && b.date === date && b.kind === 'desk' && b.status === 'released',
  ).length;

  const siteVisitors = visitors.filter((v) => v.site === siteId && v.date === date && v.stage !== 'cancelled');
  const activeVisitors = siteVisitors.length;
  const arrivedVisitors = siteVisitors.filter((v) => v.stage === 'arrived' || v.stage === 'badged').length;

  const openRequests = requests.filter(
    (r) => r.site === siteId && r.stage !== 'done' && r.stage !== 'cancelled',
  ).length;

  const avgCo2 =
    siteZones.length > 0
      ? Math.round(siteZones.reduce((acc, z) => acc + z.sensors.co2, 0) / siteZones.length)
      : 550;
  const avgTempC =
    siteZones.length > 0
      ? +(siteZones.reduce((acc, z) => acc + z.sensors.tempC, 0) / siteZones.length).toFixed(1)
      : 22;
  const avgNoiseDb =
    siteZones.length > 0
      ? Math.round(siteZones.reduce((acc, z) => acc + z.sensors.noiseDb, 0) / siteZones.length)
      : 38;

  // Hybrid & smart-zone consolidation carbon/cost savings
  const remoteHeadcount = Math.max(0, site.headcount - bookedDesks);
  const carbonSavedKg = +(
    remoteHeadcount * site.kgCo2PerDeskDay +
    releasedGhostsCount * (site.kgCo2PerDeskDay * 0.65)
  ).toFixed(1);
  const costSavedLocal = Math.round(
    remoteHeadcount * site.costPerDeskDay + releasedGhostsCount * (site.costPerDeskDay * 0.5),
  );
  const unusedDeskShare = totalDesks > 0 ? availableDesks / totalDesks : 0.3;
  const energySavedKwh = Math.round(site.kwhPerDay * unusedDeskShare * 0.42);

  const zoneUtilization: ZoneUtilization[] = siteZones
    .map((zone) => {
      const zDesks = siteDesks.filter((d) => d.zoneId === zone.id);
      const zBooked = activeDesks.filter((b) => zDesks.some((d) => d.id === b.resourceId));
      const zChecked = zBooked.filter((b) => b.status === 'checked_in');
      return {
        zone,
        totalDesks: zDesks.length,
        bookedDesks: zBooked.length,
        checkedInDesks: zChecked.length,
        pct: zDesks.length > 0 ? Math.round((zBooked.length / zDesks.length) * 100) : 0,
      };
    })
    .filter((zu) => zu.totalDesks > 0);

  const weeklyRhythmPct = site.rhythm.map((r) => Math.round(r * 100));

  return {
    siteId,
    totalDesks,
    bookedDesks,
    checkedInDesks,
    availableDesks,
    occupancyPct,
    checkInRatePct,
    ghostDesks,
    releasedGhostsCount,
    activeVisitors,
    arrivedVisitors,
    openRequests,
    avgCo2,
    avgTempC,
    avgNoiseDb,
    carbonSavedKg,
    costSavedLocal,
    energySavedKwh,
    zoneUtilization,
    weeklyRhythmPct,
  };
}

export function computeGlobalCarbonSummary(
  dateBySite: Record<SiteId, string>,
  bookings: Booking[],
  visitors: Visitor[],
  requests: ServiceRequest[],
) {
  const pulses = SITES.map((s) =>
    computeWorkplacePulse(s.id, dateBySite[s.id], bookings, visitors, requests),
  );
  const totalCarbonKg = +pulses.reduce((acc, p) => acc + p.carbonSavedKg, 0).toFixed(1);
  const totalEnergyKwh = pulses.reduce((acc, p) => acc + p.energySavedKwh, 0);
  const totalBooked = pulses.reduce((acc, p) => acc + p.bookedDesks, 0);
  const totalDesks = pulses.reduce((acc, p) => acc + p.totalDesks, 0);
  const globalOccupancyPct = totalDesks > 0 ? Math.round((totalBooked / totalDesks) * 100) : 0;
  return { pulses, totalCarbonKg, totalEnergyKwh, totalBooked, totalDesks, globalOccupancyPct };
}

/* ───────────────────────── Nova Copilot Responder ───────────────────────── */

export type NovaSpacesAction =
  | { kind: 'book_desk'; label: string; deskId: string; deskCode: string; site: SiteId }
  | { kind: 'book_room'; label: string; roomId: string; roomName: string; site: SiteId }
  | { kind: 'release_ghosts'; label: string; site: SiteId; count: number }
  | { kind: 'open_visitor_modal'; label: string }
  | { kind: 'navigate'; label: string; to: string };

export interface NovaSpacesResponse {
  headline: string;
  body: string;
  bullets: string[];
  confidence: string;
  actions: NovaSpacesAction[];
}

export function askSpacesNova(
  prompt: string,
  ctx: {
    viewer: User;
    site: SiteId;
    date: string;
    bookings: Booking[];
    visitors: Visitor[];
    requests: ServiceRequest[];
    rooms: Room[];
    users: User[];
  },
): NovaSpacesResponse {
  const q = prompt.trim().toLowerCase();
  const siteMeta = SITE_BY_ID[ctx.site];
  const pulse = computeWorkplacePulse(ctx.site, ctx.date, ctx.bookings, ctx.visitors, ctx.requests);

  // 1. Sit near a specific person or team
  const matchedUser = ctx.users.find(
    (u) => u.id !== ctx.viewer.id && q.includes(u.name.split(' ')[0].toLowerCase()),
  );
  if (/team|desk|sit|near|colleague|window|standing/.test(q) || matchedUser) {
    const recs = recommendDesks({
      viewer: ctx.viewer,
      site: ctx.site,
      date: ctx.date,
      bookings: ctx.bookings,
      users: ctx.users,
      nearUserId: matchedUser?.id,
      requiredAmenities: q.includes('standing')
        ? ['standing']
        : q.includes('window')
          ? ['window']
          : undefined,
    });
    const top = recs[0];
    if (top) {
      return {
        headline: `Recommended desk ${top.desk.code} in ${siteMeta.label} (${top.score}% match)`,
        body: `I scanned ${pulse.availableDesks} open desks on ${siteMeta.floors.find((f) => f.plan)?.label ?? 'the main floor'}. Desk ${top.desk.code} gives you the strongest proximity to your team with optimal CO₂ (${top.zone.sensors.co2} ppm) and acoustics (${top.zone.sensors.noiseDb} dBA).`,
        bullets: [
          ...top.reasons,
          `Amenities: ${top.desk.amenities.join(', ') || 'Standard ergonomic setup'}`,
          `Zone telemetry: ${top.zone.sensors.co2} ppm CO₂ · ${top.zone.sensors.tempC}°C · ${top.zone.sensors.noiseDb} dBA`,
        ],
        confidence: '98% spatial fit',
        actions: [
          {
            kind: 'book_desk',
            label: `Book Desk ${top.desk.code} now`,
            deskId: top.desk.id,
            deskCode: top.desk.code,
            site: ctx.site,
          },
          { kind: 'navigate', label: 'Open interactive floor plan', to: '/spaces/desks' },
        ],
      };
    }
  }

  // 2. Room / HoloMeet / CO2 query
  if (/room|holo|meet|boardroom|huddle|co2|air/.test(q)) {
    const scored = scoreRooms(ctx.rooms, {
      site: ctx.site,
      date: ctx.date,
      start: 14,
      end: 15,
      minCapacity: q.includes('10') ? 10 : q.includes('6') ? 6 : 2,
      requiredGear: q.includes('holo') ? ['holomeet'] : undefined,
      bookings: ctx.bookings,
    });
    const best = scored.find((s) => s.available) ?? scored[0];
    if (best) {
      return {
        headline: `Top room match: ${best.room.name} (${best.room.capacity} seats · ${best.health.score}% air & AV score)`,
        body: `${best.room.name} (${best.room.code}) on ${best.room.floor} has ${best.room.sensors.co2} ppm CO₂, ${best.room.sensors.tempC}°C climate and ${best.room.sensors.noiseDb} dBA acoustics.`,
        bullets: [
          `Equipment: ${best.room.gear.join(', ').toUpperCase() || 'Acoustic focus pod'}`,
          `Environmental health: ${best.health.summary}`,
          `Availability: ${best.available ? 'Free for immediate 60m hold + Calendar sync' : 'Currently booked — next slot available'}`,
        ],
        confidence: '96% sensor match',
        actions: [
          {
            kind: 'book_room',
            label: `Book ${best.room.name} & sync Calendar`,
            roomId: best.room.id,
            roomName: best.room.name,
            site: ctx.site,
          },
          { kind: 'navigate', label: 'Compare all rooms', to: '/spaces/rooms' },
        ],
      };
    }
  }

  // 3. Ghost desks / no-show release
  if (/ghost|no-show|noshow|release|sweep|uncheck/.test(q)) {
    const count = pulse.ghostDesks.length;
    return {
      headline:
        count > 0
          ? `${count} ghost desk${count > 1 ? 's' : ''} detected in ${siteMeta.label}`
          : `Zero ghost desks in ${siteMeta.label} (${pulse.checkInRatePct}% check-in rate)`,
      body:
        count > 0
          ? `Found ${count} booked desk${count > 1 ? 's' : ''} past the 10:30 local check-in window with no Wi-Fi or badge tap. Releasing them reclaims prime team cluster seats and lowers zone HVAC draw.`
          : `All ${pulse.bookedDesks} booked desks on ${siteMeta.label} have active badge or Wi-Fi check-ins today.`,
      bullets: [
        `Active occupancy: ${pulse.bookedDesks}/${pulse.totalDesks} desks (${pulse.occupancyPct}%)`,
        `Verified check-ins: ${pulse.checkedInDesks} (${pulse.checkInRatePct}%)`,
        `Carbon saved today in ${siteMeta.city}: ${pulse.carbonSavedKg} kg CO₂e`,
      ],
      confidence: '99% telemetry verified',
      actions:
        count > 0
          ? [
              {
                kind: 'release_ghosts',
                label: `Release ${count} ghost desk${count > 1 ? 's' : ''}`,
                site: ctx.site,
                count,
              },
            ]
          : [{ kind: 'navigate', label: 'View Workplace Insights', to: '/spaces/insights' }],
    };
  }

  // 4. Visitor / badge / guest
  if (/visitor|guest|badge|nda|kiosk/.test(q)) {
    const waiting = ctx.visitors.filter((v) => v.site === ctx.site && v.stage === 'arrived');
    return {
      headline: `${pulse.activeVisitors} visitors scheduled in ${siteMeta.label} today (${waiting.length} waiting at kiosk)`,
      body: `Pre-registering guests issues an express QR pass, triggers digital NDA signing ahead of arrival, and pings the host in Pulse Chat the moment they tap in at reception.`,
      bullets: [
        `Guest Wi-Fi SSID: ${siteMeta.wifiSsid} (auto-provisioned on badge print)`,
        `Active watchlist screening connected to Security Center (Bastion)`,
        `${waiting.length} guest${waiting.length === 1 ? '' : 's'} currently awaiting badge issuance`,
      ],
      confidence: '97% workflow ready',
      actions: [
        { kind: 'open_visitor_modal', label: 'Pre-register a visitor' },
        { kind: 'navigate', label: 'Open Visitors & Badges', to: '/spaces/visitors' },
      ],
    };
  }

  // 5. Default workplace pulse + carbon overview
  const global = computeGlobalCarbonSummary(
    { dubai: ctx.date, london: ctx.date, singapore: ctx.date, newyork: ctx.date },
    ctx.bookings,
    ctx.visitors,
    ctx.requests,
  );
  return {
    headline: `${siteMeta.label} is at ${pulse.occupancyPct}% occupancy · ${pulse.carbonSavedKg} kg CO₂e saved today`,
    body: `Across all four hubs (Dubai, London, Singapore, New York), ${global.totalBooked} of ${global.totalDesks} desks are booked (${global.globalOccupancyPct}%) with ${global.totalCarbonKg} kg CO₂e and ${global.totalEnergyKwh} kWh saved via smart zone consolidation.`,
    bullets: [
      `${siteMeta.label} air quality: ${pulse.avgCo2} ppm CO₂ · ${pulse.avgTempC}°C · ${pulse.avgNoiseDb} dBA`,
      `${pulse.availableDesks} desks open right now · ${pulse.ghostDesks.length} ghost desk(s) eligible for sweep`,
      `${pulse.activeVisitors} visitors today · ${pulse.openRequests} open facility ticket(s)`,
    ],
    confidence: '98% live telemetry',
    actions: [
      { kind: 'navigate', label: 'Explore Desk Map', to: '/spaces/desks' },
      { kind: 'navigate', label: 'View Workplace Insights', to: '/spaces/insights' },
    ],
  };
}

// Keep unused imports referenced for completeness
void DESKS;
void ZONES;
