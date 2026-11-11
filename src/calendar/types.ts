/**
 * Helix Calendar — "Chronos · Neural Time & Spatial Scheduling Orbit"
 * Domain types for intelligent events, circadian time-zone weaving,
 * spatial rooms & pods, smart booking links, and Maker/Manager time telemetry.
 */
import type { SigilId } from '@/projects/sigils';

export type EventCategory = 'meet' | 'focus' | '1on1' | 'customer' | 'interview' | 'learning';

export type EventStatus = 'confirmed' | 'tentative' | 'live';

export type HubTimezoneId =
  | 'Asia/Dubai'
  | 'Europe/London'
  | 'Europe/Berlin'
  | 'Asia/Singapore'
  | 'America/New_York';

export interface LinkedAppContext {
  app: 'crm' | 'projects' | 'performance' | 'talent' | 'wiki' | 'chat' | 'mail' | 'wellbeing' | 'devhub' | 'cloud' | 'incidents' | 'vault' | 'security' | 'spaces';
  label: string;
  to: string;
  entityId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  sigil: SigilId;
  color: string;
  /** Offset in days from today (-2 .. +4) so the week grid is always populated around today */
  dayOffset: number;
  /** Start hour in 24h decimal (e.g. 9.5 = 09:30, 14.0 = 14:00) */
  startHour: number;
  /** Duration in minutes (15, 30, 45, 60, 90, 120) */
  durationMins: number;
  organizerId: string;
  attendeeIds: string[];
  roomId?: string;
  roomName: string;
  meetRoomId?: string;
  linkedContext?: LinkedAppContext;
  agendaBullets: string[];
  aiPrepBrief?: string;
  autoProtected?: boolean;
  highSignalScore: number; // 0..100
}

export interface SpatialRoom {
  id: string;
  name: string;
  code: string;
  hub: 'Dubai' | 'London' | 'Singapore';
  floor: string;
  capacity: number;
  sigil: SigilId;
  color: string;
  status: 'available' | 'occupied' | 'pre_warming';
  currentEventTitle?: string;
  nextFreeLabel: string;
  equipment: string[];
  telemetry: {
    co2Ppm: number;
    tempC: number;
    acousticDb: number;
    holoArrayHealth: number;
  };
}

export interface SmartBookingLink {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: EventCategory;
  durationMins: 15 | 30 | 45 | 60;
  sigil: SigilId;
  color: string;
  hostIds: string[];
  routingMode: 'round_robin' | 'collective' | 'crm_region';
  bufferMins: number;
  dailyCap: number;
  bookingsThisMonth: number;
  conversionPct: number;
  active: boolean;
  linkedApp?: 'crm' | 'talent' | 'performance' | 'projects';
}

export interface TimezoneSlotScore {
  utcHour: number;
  dubaiHour: number;
  londonHour: number;
  singaporeHour: number;
  newYorkHour: number;
  harmonyScore: number; // 0..100
  label: 'golden' | 'viable' | 'off_hours';
  note: string;
}

export interface NovaScheduleDraft {
  prompt: string;
  title: string;
  category: EventCategory;
  dayOffset: number;
  startHour: number;
  durationMins: number;
  attendeeIds: string[];
  roomId: string;
  roomName: string;
  meetRoomId: string;
  harmonyScore: number;
  rationale: string;
  agendaBullets: string[];
}

export interface ChronosAnalyticsSummary {
  makerHoursWeek: number;
  managerHoursWeek: number;
  deepWorkShieldPct: number;
  fragmentedGapsCount: number;
  weeklyMeetingBurnUsd: number;
  reclaimableHoursWeek: number;
  categoryBreakdown: {
    category: EventCategory;
    label: string;
    hours: number;
    pct: number;
    color: string;
  }[];
}

export interface CalendarData {
  version: number;
  selectedDayOffset: number;
  viewMode: 'day' | 'week';
  activeCategoryFilter: EventCategory | 'all';
  autoDefragEnabled: boolean;
  focusShieldActive: boolean;
  events: CalendarEvent[];
  rooms: SpatialRoom[];
  bookingLinks: SmartBookingLink[];
  activeNovaDraft: NovaScheduleDraft | null;
}
