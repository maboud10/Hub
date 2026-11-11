/**
 * Spaces — "Orbit · Desks, rooms, visitors & workplace pulse".
 * Domain model for the NEXUS workplace app: four hub sites with isometric
 * floor plans (zones, desks, rooms with live sensors), bookings for desks,
 * rooms, parking and lockers, visitors with a badge-to-checkout journey,
 * facility requests and the workplace analytics that power Insights.
 *
 * Times are always SITE-LOCAL: `date` is the site's ISO day and hours are
 * decimal hours on the site's wall clock (London rooms run on London time).
 */
import type { BridgeSource } from '@/lib/appBridge';

export type SiteId = 'dubai' | 'london' | 'singapore' | 'newyork';
/** Hub city label used by the App Bridge (`BridgePresence.site`). */
export type HubCity = 'Dubai' | 'London' | 'Singapore' | 'New York';

export type ZoneKind = 'focus' | 'collab' | 'quiet' | 'phone' | 'wellness';
export type Amenity = 'dual-monitor' | 'standing' | 'window';
export type RoomGear = 'holomeet' | 'whiteboard' | 'vc' | 'display';
export type RoomKind = 'boardroom' | 'meeting' | 'huddle' | 'pod' | 'phone' | 'wellness';
export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'clear' | 'humid';

export interface Sensors {
  /** CO₂ in ppm. */
  co2: number;
  tempC: number;
  /** Ambient noise in dB(A). */
  noiseDb: number;
}

export interface SiteFloor {
  id: string;
  /** "L41" style short label. */
  label: string;
  desks: number;
  /** The floor drawn as the isometric plan. */
  plan: boolean;
  /** Share of the site's desk demand this floor absorbs on a typical day (0..1). */
  share: number;
}

export interface Site {
  id: SiteId;
  city: HubCity;
  /** "Dubai HQ". */
  label: string;
  /** Building name (proper noun). */
  building: string;
  timezone: string;
  currency: 'AED' | 'GBP' | 'SGD' | 'USD';
  /** People whose home office this is. */
  headcount: number;
  floors: SiteFloor[];
  /** Plan grid size in floor units. */
  grid: { w: number; h: number };
  weather: { tempC: number; kind: WeatherKind; commuteMins: number; transit: string };
  /** Fully loaded cost of one open desk for a day (local currency): energy, HVAC, cleaning, services. */
  costPerDeskDay: number;
  /** Operational CO₂e of one open desk for a day (kg). */
  kgCo2PerDeskDay: number;
  /** Average building energy per weekday (kWh). */
  kwhPerDay: number;
  renewablePct: number;
  /** Typical desk occupancy Mon..Sun (0..1). */
  rhythm: number[];
  wifiSsid: string;
  /** Accent used for the site's glyphs. */
  color: string;
}

export interface Zone {
  id: string;
  site: SiteId;
  kind: ZoneKind;
  /** Team neighbourhood that sits here (desk zones only). */
  team?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sensors: Sensors;
}

export interface Desk {
  id: string;
  /** Human code, e.g. `F-03`. */
  code: string;
  site: SiteId;
  zoneId: string;
  /** Desk centre on the plan grid. */
  x: number;
  y: number;
  amenities: Amenity[];
}

/** The subset of Helix Calendar's `SpatialRoom` that Spaces reads (no static import of Calendar). */
export interface CalRoomLite {
  id: string;
  name: string;
  code: string;
  hub: string;
  floor: string;
  capacity: number;
  color: string;
  status: 'available' | 'occupied' | 'pre_warming';
  currentEventTitle?: string;
  nextFreeLabel: string;
  equipment: string[];
  telemetry: { co2Ppm: number; tempC: number; acousticDb: number; holoArrayHealth: number };
}

/** The subset of a Helix Calendar event that Spaces reads. */
export interface CalEventLite {
  id: string;
  title: string;
  category: string;
  dayOffset: number;
  startHour: number;
  durationMins: number;
  organizerId: string;
  attendeeIds: string[];
  roomId?: string;
  linkedContext?: { app: string };
}

export interface Room {
  id: string;
  /** Proper name, e.g. `Nebula`. */
  name: string;
  code: string;
  site: SiteId;
  floor: string;
  capacity: number;
  kind: RoomKind;
  gear: RoomGear[];
  zoneId?: string;
  /** Footprint on the plan grid (absent → listed but not drawn). */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  sensors: Sensors;
  /** Ventilation factor: how hard CO₂ climbs when the room is busy (1 = normal). */
  co2Load: number;
  color: string;
  source: 'calendar' | 'spaces';
  /** Live hint mirrored from Calendar. */
  calendarStatus?: 'available' | 'occupied' | 'pre_warming';
  calendarTitle?: string;
  calendarNextFree?: string;
}

export interface ParkingSpot {
  id: string;
  site: SiteId;
  code: string;
  ev: boolean;
  accessible?: boolean;
  level: string;
  /** EV charger power in kW. */
  kw?: number;
}

export interface Locker {
  id: string;
  site: SiteId;
  code: string;
  bank: string;
  size: 'S' | 'M' | 'L';
}

export type BookingKind = 'desk' | 'room' | 'parking' | 'locker';
export type BookingStatus = 'booked' | 'checked_in' | 'checked_out' | 'released' | 'cancelled';
export type CateringKind = 'coffee' | 'breakfast' | 'lunch' | 'snacks';

export interface Catering {
  kind: CateringKind;
  headcount: number;
  note?: string;
}

export interface Booking {
  id: string;
  kind: BookingKind;
  userId: string;
  site: SiteId;
  resourceId: string;
  /** Resource code people see (`F-03`, `Nebula`, `P-04`, `L-12`). */
  label: string;
  /** Site-local ISO day. */
  date: string;
  /** Site-local decimal hours. */
  start: number;
  end: number;
  status: BookingStatus;
  createdAt: number;
  checkedInAt?: number;
  checkedOutAt?: number;
  releasedAt?: number;
  releaseReason?: 'ghost' | 'no_show' | 'user';
  recurrenceId?: string;
  nearUserId?: string;
  title?: string;
  attendeeIds?: string[];
  calendarEventId?: string;
  meetRoomId?: string;
  catering?: Catering;
  /** Digital locker key / parking gate code. */
  accessCode?: string;
  source?: BridgeSource;
  origin: 'seed' | 'user';
}

export type VisitorStage = 'invited' | 'preregistered' | 'arrived' | 'badged' | 'checked_out' | 'cancelled';
export type VisitPurpose = 'meeting' | 'interview' | 'delivery' | 'contractor' | 'event' | 'other';
export type VisitorAction = 'preregister' | 'arrive' | 'sign_nda' | 'badge' | 'checkout' | 'cancel';

export interface VisitorWatch {
  /** Why screening flagged the guest (seeded denied-party scenario). */
  reason: string;
  caseId?: string;
  caseTo?: string;
  escalatedAt?: number;
  /** Escalation could not reach Security Center; kept on the front-desk log. */
  queuedLocally?: boolean;
  cleared?: boolean;
}

export interface Visitor {
  id: string;
  name: string;
  company: string;
  email?: string;
  hostId: string;
  site: SiteId;
  date: string;
  hour: number;
  purpose: VisitPurpose;
  note?: string;
  ndaRequired: boolean;
  ndaSigned: boolean;
  idVerified: boolean;
  parking: boolean;
  parkingCode?: string;
  stage: VisitorStage;
  invitedAt: number;
  preRegisteredAt?: number;
  arrivedAt?: number;
  badgeAt?: number;
  checkedOutAt?: number;
  badge?: string;
  hostPingedAt?: number;
  hostPingTo?: string;
  inviteSentAt?: number;
  inviteTo?: string;
  watch?: VisitorWatch;
  source?: BridgeSource;
  origin: 'seed' | 'user';
}

export type ServiceKind = 'maintenance' | 'cleaning' | 'catering' | 'it_setup' | 'parking' | 'locker' | 'lost_found';
export type ServiceStage = 'submitted' | 'assigned' | 'in_progress' | 'done' | 'cancelled';
export type ServicePriority = 'low' | 'normal' | 'high';

export interface ServiceRequest {
  id: string;
  /** `FR-2041`. */
  code: string;
  kind: ServiceKind;
  title: string;
  detail?: string;
  site: SiteId;
  /** Where in the office (zone, room or desk label). */
  where?: string;
  requesterId: string;
  assignee?: string;
  priority: ServicePriority;
  stage: ServiceStage;
  createdAt: number;
  assignedAt?: number;
  startedAt?: number;
  doneAt?: number;
  rating?: number;
  ticketId?: string;
  ticketTo?: string;
  source?: BridgeSource;
  origin: 'seed' | 'user';
}

export interface Announcement {
  id: string;
  site: SiteId | 'all';
  kind: 'facilities' | 'event' | 'safety' | 'transport';
  title: string;
  body: string;
  /** Days from today the announcement is about (0 = today). */
  dayOffset: number;
  pinned?: boolean;
}

/** An upcoming business trip to a hub city (Travel & Expenses or a seeded fallback). */
export interface TripLite {
  id: string;
  reference: string;
  userId: string;
  city: HubCity;
  site: SiteId;
  /** ISO days (inclusive). */
  from: string;
  to: string;
  title: string;
  source: 'expenses' | 'seed';
}

export interface SpacesData {
  version: number;
  /** Ops-day (Dubai) the seeded records were generated for; a new day rolls them forward. */
  seededFor: string;
  bookings: Booking[];
  visitors: Visitor[];
  requests: ServiceRequest[];
  /** People who switched off "share my office presence". */
  hiddenPresence: string[];
  /** Last site each person looked at. */
  siteByUser: Record<string, SiteId>;
  /** Dismissed Nova suggestions / recommendations. */
  dismissed: string[];
  /** Counter for human codes (FR-xxxx, badges). */
  seq: number;
}
