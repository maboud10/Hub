/**
 * Helix Wellbeing — "Aura · Wellbeing OS" domain model.
 *
 * Privacy-first by construction:
 *  - Everything personal lives under `WellbeingData.users[userId]` and is only
 *    ever read for the signed-in person (UI + bridge both key by session user).
 *  - Managers only ever receive aggregated, anonymised team data (k ≥ 5) that is
 *    computed on the fly — no per-person record is ever exposed to them.
 *  - Care usage (bookings, topics, circles) is never surfaced outside the
 *    person's own Care view; calendar holds are titled "Personal appointment".
 *
 * Timestamps are epoch ms; calendar days are local ISO `YYYY-MM-DD`.
 */

export type DimensionId = 'sleep' | 'movement' | 'focus' | 'connection' | 'calm';
export type Mood = 1 | 2 | 3 | 4 | 5;
export type Level5 = 1 | 2 | 3 | 4 | 5;

/* ───────────────────────── check-ins & journal ───────────────────────── */

export interface CheckIn {
  id: string;
  /** Local calendar day. One per day — checking in again replaces it. */
  date: string;
  at: number;
  mood: Mood;
  /** 1 = running on empty … 5 = fully charged. */
  energy: Level5;
  /** 1 = calm … 5 = overwhelmed. */
  stress: Level5;
  sleepHours: number;
  /** Private note (never leaves the person's own view). */
  note?: string;
}

export type JournalKind = 'win' | 'gratitude';

export interface JournalEntry {
  id: string;
  at: number;
  kind: JournalKind;
  text: string;
}

/* ───────────────────────── breathwork ───────────────────────── */

export type BreathPatternId = 'box' | 'relax' | 'coherent' | 'energise';
export type BreathPhaseId = 'inhale' | 'hold' | 'exhale';

export interface BreathPhase {
  phase: BreathPhaseId;
  secs: number;
}

export interface BreathPattern {
  id: BreathPatternId;
  label: string;
  /** Rhythm shorthand, e.g. "4-4-4-4". */
  short: string;
  description: string;
  phases: BreathPhase[];
}

export interface BreathSession {
  id: string;
  at: number;
  patternId: BreathPatternId;
  minutes: number;
}

export type SoundscapeId = 'desert' | 'ocean' | 'rain' | 'forest' | 'brown';

/* ───────────────────────── movement ───────────────────────── */

export type ActivityKind = 'walk' | 'run' | 'cycle' | 'yoga' | 'swim';
export type TeamId = 'dubai' | 'london' | 'singapore' | 'newyork' | 'remote';

export interface ActivityLog {
  id: string;
  at: number;
  date: string;
  kind: ActivityKind;
  minutes: number;
  /** Step-equivalent credited to goals and the challenge. */
  steps: number;
  km: number;
  /** Hub team credited at the time of logging. */
  teamId: TeamId;
}

/** Passive (synced) steps for a past day. */
export interface DaySteps {
  date: string;
  steps: number;
}

export interface TeamState {
  id: TeamId;
  /** Distance logged by everyone else in the company (seeded). */
  baseKm: number;
  participants: number;
}

export interface ChallengeState {
  id: string;
  name: string;
  goalKm: number;
  startedAt: number;
  endsAt: number;
  teams: TeamState[];
}

/* ───────────────────────── care (confidential) ───────────────────────── */

export type CareTopic = 'stress' | 'sleep' | 'relationships' | 'grief' | 'finances' | 'parenting' | 'burnout' | 'anxiety';
export type CareLanguage = 'en' | 'ar';
export type CareFormat = 'video' | 'phone' | 'in-person';
/** 0 Request · 1 Matched · 2 Session booked · 3 Follow-up · 4 complete. */
export type CareStage = 0 | 1 | 2 | 3 | 4;

export interface CareSlot {
  id: string;
  dayOffset: number;
  hour: number;
}

export interface Counsellor {
  id: string;
  name: string;
  credentials: string;
  bio: string;
  hue: number;
  hub: string;
  specialties: CareTopic[];
  languages: CareLanguage[];
  formats: CareFormat[];
  slots: CareSlot[];
  rating: number;
}

export interface CareBooking {
  id: string;
  createdAt: number;
  topic: CareTopic;
  language: CareLanguage;
  format: CareFormat;
  stage: CareStage;
  counsellorId?: string;
  /** Absolute session start. */
  sessionAt?: number;
  calendarHold?: boolean;
  closedAt?: number;
  followUpAt?: number;
}

export type CircleId = 'new-parents' | 'caregivers' | 'ramadan' | 'grief' | 'neurodiversity' | 'expat';

/* ───────────────────────── rhythm ───────────────────────── */

export type HoldPolicy = 'hold' | 'digest' | 'urgent';

/** Right-to-disconnect window (superset of the bridge's `QuietHours`). */
export interface QuietHoursSettings {
  enabled: boolean;
  startHour: number;
  endHour: number;
  weekendsOff: boolean;
  holdPolicy: HoldPolicy;
}

export type SignalId = 'afterHours' | 'meetings' | 'focus' | 'weekend' | 'leave' | 'inbox';
export type SignalLevel = 'ok' | 'watch' | 'high';

/* ───────────────────────── perks ───────────────────────── */

export type PerkCategory = 'fitness' | 'mind' | 'nutrition' | 'physio' | 'sleep';
export type PerkCity = 'Dubai' | 'London' | 'Singapore' | 'Global';

export interface Partner {
  id: string;
  name: string;
  category: PerkCategory;
  city: PerkCity;
  area: string;
  offer: string;
  /** Claimable price from the wellbeing wallet (AED). */
  priceAed: number;
  /** Optional cost in recharge credits. */
  credits?: number;
  hue: number;
}

export type PerkClaimStatus = 'submitted' | 'approved' | 'paid' | 'rejected';

export interface PerkClaim {
  id: string;
  createdAt: number;
  merchant: string;
  partnerId?: string;
  category: PerkCategory;
  amount: number;
  /** ISO date of the purchase. */
  date: string;
  description: string;
  receiptName: string;
  status: PerkClaimStatus;
  /** Linked HR Portal benefit claim (wellness allowance), when filed there. */
  hrClaimId?: string;
  payrollMonth?: string;
  note?: string;
}

export interface Redemption {
  id: string;
  at: number;
  partnerId: string;
  credits: number;
}

export interface Campaign {
  id: string;
  name: string;
  window: string;
  description: string;
  startsAt: number;
  endsAt: number;
  credits: number;
}

/* ───────────────────────── per-person record ───────────────────────── */

export interface UserWellbeing {
  userId: string;
  checkins: CheckIn[];
  journal: JournalEntry[];
  breaths: BreathSession[];
  activities: ActivityLog[];
  steps: DaySteps[];
  stepGoal: number;
  focusSprints: { at: number; minutes: number }[];
  care: CareBooking[];
  circles: CircleId[];
  quiet: QuietHoursSettings;
  claims: PerkClaim[];
  redemptions: Redemption[];
  campaigns: string[];
  soundscape: SoundscapeId;
  /** Prescriptions acted on today (reset daily). */
  doneRx: { date: string; ids: string[] };
  /** Calendar 1:1s converted into walking meetings. */
  walkTalks: string[];
  /** Fallback when the HR Portal can't be reached. */
  lastLeaveDaysAgo: number;
  /** Weekend work sessions in the last 4 weeks (synced signal). */
  weekendSessions: number;
  /** Passive baselines for estimates (steps synced so far today, typical sleep). */
  profile: { stepsAvg: number; sleepAvg: number };
  /** Today's Recharge score as last computed by Aura (read by the bridge). */
  lastScore?: { date: string; score: number };
}

export interface WellbeingData {
  version: number;
  users: Record<string, UserWellbeing>;
  challenge: ChallengeState;
}

/* ───────────── structural shapes for other apps' data (no imports) ───────────── */

/** The subset of a Helix Calendar event that Wellbeing reads. */
export interface CalEventLite {
  id: string;
  title: string;
  category: string;
  dayOffset: number;
  startHour: number;
  durationMins: number;
  organizerId: string;
  attendeeIds: string[];
  linkedContext?: { app: string; label: string; to: string };
}

/** The subset of an HR Portal leave request that Wellbeing reads. */
export interface LeaveLite {
  userId: string;
  type: string;
  start: string;
  end: string;
  status: string;
}

/** The subset of an HR Portal benefit claim that Wellbeing reads. */
export interface HrClaimLite {
  id: string;
  userId: string;
  allowance: string;
  amount: number;
  merchant: string;
  description: string;
  date: string;
  status: string;
  payrollMonth?: string;
  note?: string;
}

export interface MailRhythmLite {
  afterHoursSentThisWeek: number;
  unread: number;
  avgReplyMins: number;
}
