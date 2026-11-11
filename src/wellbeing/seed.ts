/**
 * Helix Wellbeing — catalogs + deterministic, per-person seed data.
 *
 * Every person gets their own private history generated from a hash of their
 * user id, relative to "now" (day offsets / minutes ago), so switching personas
 * shows a genuinely different aura. Nobody has checked in *today* in the seed,
 * so the 20-second check-in is always the first thing Aura offers.
 */
import { SEED_USERS } from '@/data/users';
import type {
  ActivityKind,
  ActivityLog,
  BreathPattern,
  BreathPatternId,
  BreathSession,
  Campaign,
  CareBooking,
  CareFormat,
  CareLanguage,
  CareTopic,
  ChallengeState,
  CheckIn,
  CircleId,
  Counsellor,
  DaySteps,
  DimensionId,
  JournalEntry,
  Level5,
  Mood,
  Partner,
  PerkCategory,
  PerkCity,
  PerkClaim,
  QuietHoursSettings,
  SoundscapeId,
  TeamId,
  UserWellbeing,
  WellbeingData,
} from './types';

export const WELLBEING_DATA_VERSION = 1;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ───────────────────────── small deterministic helpers ───────────────────────── */

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG (0..1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local `YYYY-MM-DD` for a timestamp. */
export function isoDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const toLevel = (v: number) => clampN(Math.round(v), 1, 5) as Level5;

/* ───────────────────────── catalogs ───────────────────────── */

export interface DimensionMeta {
  id: DimensionId;
  label: string;
  color: string;
  weight: number;
  blurb: string;
}

/** Order = petal order around the aura (clockwise from the top). */
export const DIMENSIONS: DimensionMeta[] = [
  { id: 'sleep', label: 'Sleep', color: '#818cf8', weight: 0.26, blurb: 'Last night’s rest against your 7.5-hour target' },
  { id: 'movement', label: 'Movement', color: '#34d399', weight: 0.18, blurb: 'Steps today and active minutes this week' },
  { id: 'focus', label: 'Focus', color: '#22d3ee', weight: 0.2, blurb: 'Meeting load versus protected deep work today' },
  { id: 'connection', label: 'Connection', color: '#fbbf24', weight: 0.14, blurb: '1:1s, recognition and the people around you' },
  { id: 'calm', label: 'Calm', color: '#f472b6', weight: 0.22, blurb: 'Stress today, breathwork and after-hours load' },
];
export const DIMENSION_BY_ID = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d])) as Record<DimensionId, DimensionMeta>;

export const MOODS: { v: Mood; emoji: string; label: string }[] = [
  { v: 1, emoji: '😫', label: 'Drained' },
  { v: 2, emoji: '😕', label: 'Meh' },
  { v: 3, emoji: '😐', label: 'Okay' },
  { v: 4, emoji: '🙂', label: 'Good' },
  { v: 5, emoji: '🤩', label: 'Energised' },
];

export const ENERGY_LEVELS: { v: Level5; label: string }[] = [
  { v: 1, label: 'Running on empty' },
  { v: 2, label: 'Low battery' },
  { v: 3, label: 'Steady' },
  { v: 4, label: 'Charged' },
  { v: 5, label: 'Fully charged' },
];

export const STRESS_LEVELS: { v: Level5; label: string }[] = [
  { v: 1, label: 'Calm' },
  { v: 2, label: 'Settled' },
  { v: 3, label: 'Busy' },
  { v: 4, label: 'Stretched' },
  { v: 5, label: 'Overwhelmed' },
];

export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: 'box',
    label: 'Box breathing',
    short: '4-4-4-4',
    description: 'Steadies your nerves before a big moment, used by pilots and athletes.',
    phases: [
      { phase: 'inhale', secs: 4 },
      { phase: 'hold', secs: 4 },
      { phase: 'exhale', secs: 4 },
      { phase: 'hold', secs: 4 },
    ],
  },
  {
    id: 'relax',
    label: '4-7-8 Relax',
    short: '4-7-8',
    description: 'A long exhale switches on your rest-and-digest system. Lovely before sleep.',
    phases: [
      { phase: 'inhale', secs: 4 },
      { phase: 'hold', secs: 7 },
      { phase: 'exhale', secs: 8 },
    ],
  },
  {
    id: 'coherent',
    label: 'Coherent breathing',
    short: '5.5 · 5.5',
    description: 'About five and a half breaths a minute balances your heart-rate variability.',
    phases: [
      { phase: 'inhale', secs: 5.5 },
      { phase: 'exhale', secs: 5.5 },
    ],
  },
  {
    id: 'energise',
    label: 'Energise',
    short: '2-1-4',
    description: 'Quick inhale, short hold, steady exhale: a gentle lift for the afternoon slump.',
    phases: [
      { phase: 'inhale', secs: 2 },
      { phase: 'hold', secs: 1 },
      { phase: 'exhale', secs: 4 },
    ],
  },
];
export const BREATH_PATTERN_BY_ID = Object.fromEntries(BREATH_PATTERNS.map((p) => [p.id, p])) as Record<BreathPatternId, BreathPattern>;

export const PHASE_LABEL: Record<BreathPattern['phases'][number]['phase'], string> = {
  inhale: 'Breathe in',
  hold: 'Hold breath',
  exhale: 'Breathe out',
};

export const SOUNDSCAPES: { id: SoundscapeId; label: string; hint: string; c1: string; c2: string }[] = [
  { id: 'desert', label: 'Desert wind', hint: 'Warm dunes at dusk', c1: '#fbbf24', c2: '#fb7185' },
  { id: 'ocean', label: 'Ocean', hint: 'Slow Gulf swells', c1: '#22d3ee', c2: '#6366f1' },
  { id: 'rain', label: 'Rain', hint: 'Soft rain on glass', c1: '#60a5fa', c2: '#a855f7' },
  { id: 'forest', label: 'Forest', hint: 'Birdsong and leaves', c1: '#34d399', c2: '#a3e635' },
  { id: 'brown', label: 'Brown noise', hint: 'Deep, steady hum', c1: '#f472b6', c2: '#fb923c' },
];

export interface MicroReset {
  id: string;
  title: string;
  blurb: string;
  minutes: number;
  icon: 'stretch' | 'eye' | 'posture' | 'water' | 'hands' | 'stand';
  steps: { label: string; secs: number }[];
}

export const MICRO_RESETS: MicroReset[] = [
  {
    id: 'neck',
    title: 'Neck & shoulder release',
    blurb: 'Undo the laptop hunch in four gentle moves.',
    minutes: 2,
    icon: 'stretch',
    steps: [
      { label: 'Roll your shoulders back slowly', secs: 20 },
      { label: 'Tilt your right ear to your shoulder', secs: 20 },
      { label: 'Tilt your left ear to your shoulder', secs: 20 },
      { label: 'Clasp your hands and push them forward', secs: 20 },
    ],
  },
  {
    id: 'eyes',
    title: '20-20-20 eye break',
    blurb: 'Every 20 minutes, look 20 feet away for 20 seconds.',
    minutes: 1,
    icon: 'eye',
    steps: [
      { label: 'Look at something far away', secs: 20 },
      { label: 'Blink slowly ten times', secs: 10 },
      { label: 'Palm your eyes and breathe', secs: 15 },
    ],
  },
  {
    id: 'posture',
    title: 'Posture check',
    blurb: 'Reset feet, hips, back and screen height.',
    minutes: 1,
    icon: 'posture',
    steps: [
      { label: 'Feet flat, knees at hip height', secs: 10 },
      { label: 'Sit back, lower back supported', secs: 10 },
      { label: 'Screen top at eye level', secs: 10 },
      { label: 'Relax your jaw and shoulders', secs: 10 },
    ],
  },
  {
    id: 'water',
    title: 'Hydration refill',
    blurb: 'Walk to the water point and drink a full glass.',
    minutes: 2,
    icon: 'water',
    steps: [
      { label: 'Stand up and stretch tall', secs: 10 },
      { label: 'Walk to the nearest water point', secs: 60 },
      { label: 'Drink a full glass slowly', secs: 30 },
    ],
  },
  {
    id: 'hands',
    title: 'Wrist & hand release',
    blurb: 'For long typing or trackpad sessions.',
    minutes: 1,
    icon: 'hands',
    steps: [
      { label: 'Stretch your fingers wide', secs: 10 },
      { label: 'Gently pull each wrist back', secs: 20 },
      { label: 'Make soft fists and release', secs: 15 },
    ],
  },
  {
    id: 'stand',
    title: 'Standing reset',
    blurb: 'Get blood moving between meetings.',
    minutes: 1,
    icon: 'stand',
    steps: [
      { label: 'Stand and do ten calf raises', secs: 20 },
      { label: 'Reach up, then fold forward', secs: 20 },
      { label: 'Shake out your arms and legs', secs: 15 },
    ],
  },
];

export const ACTIVITY_KINDS: { id: ActivityKind; label: string; stepsPerMin: number }[] = [
  { id: 'walk', label: 'Walk', stepsPerMin: 110 },
  { id: 'run', label: 'Jog', stepsPerMin: 165 },
  { id: 'cycle', label: 'Bike ride', stepsPerMin: 95 },
  { id: 'yoga', label: 'Yoga', stepsPerMin: 45 },
  { id: 'swim', label: 'Swim', stepsPerMin: 100 },
];
export const ACTIVITY_BY_ID = Object.fromEntries(ACTIVITY_KINDS.map((a) => [a.id, a])) as Record<ActivityKind, (typeof ACTIVITY_KINDS)[number]>;

/** Step-equivalent per kilometre (keeps cycling and swimming fair in the challenge). */
export const STEPS_PER_KM = 1300;

export const TEAMS: { id: TeamId; label: string; hue: number; route: string; routeKm: number }[] = [
  { id: 'dubai', label: 'Dubai', hue: 32, route: 'Dubai Marina loop', routeKm: 2.1 },
  { id: 'london', label: 'London', hue: 212, route: 'Regent’s Canal towpath', routeKm: 2.4 },
  { id: 'singapore', label: 'Singapore', hue: 350, route: 'Marina Bay waterfront', routeKm: 2.0 },
  { id: 'newyork', label: 'New York', hue: 265, route: 'High Line walk', routeKm: 2.3 },
  { id: 'remote', label: 'Remote', hue: 160, route: 'Your neighbourhood loop', routeKm: 2.0 },
];
export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t])) as Record<TeamId, (typeof TEAMS)[number]>;

/** Hub team for a work location (anything that isn't a hub city races for Remote). */
export function teamOf(location: string | undefined): TeamId {
  const l = (location ?? '').toLowerCase();
  if (l.includes('remote')) return 'remote';
  if (l.includes('dubai')) return 'dubai';
  if (l.includes('london')) return 'london';
  if (l.includes('singapore')) return 'singapore';
  if (l.includes('new york')) return 'newyork';
  return 'remote';
}

export const MILESTONES: { label: string; pct: number; sub: string }[] = [
  { label: 'Base camp', pct: 0.25, sub: '25% of the route' },
  { label: 'Ridge', pct: 0.5, sub: 'Halfway there' },
  { label: 'Summit', pct: 0.75, sub: 'Three quarters' },
  { label: 'Victory lap', pct: 1, sub: 'Route complete' },
];

export const CARE_TOPICS: { id: CareTopic; label: string }[] = [
  { id: 'stress', label: 'Stress' },
  { id: 'burnout', label: 'Burnout' },
  { id: 'anxiety', label: 'Anxiety' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'grief', label: 'Grief & loss' },
  { id: 'finances', label: 'Money worries' },
  { id: 'parenting', label: 'Parenting' },
];
export const CARE_TOPIC_LABEL = Object.fromEntries(CARE_TOPICS.map((t) => [t.id, t.label])) as Record<CareTopic, string>;

export const CARE_LANGUAGES: { id: CareLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ar', label: 'Arabic' },
];

export const CARE_FORMATS: { id: CareFormat; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'phone', label: 'Phone' },
  { id: 'in-person', label: 'In person' },
];

export const COUNSELLORS: Counsellor[] = [
  {
    id: 'cs-noor',
    name: 'Dr. Noor Al-Hashimi',
    credentials: 'Clinical psychologist · DHA licensed',
    bio: 'Warm, practical CBT for stress, anxiety and life transitions.',
    hue: 18,
    hub: 'Dubai',
    specialties: ['stress', 'anxiety', 'relationships', 'burnout'],
    languages: ['ar', 'en'],
    formats: ['video', 'in-person', 'phone'],
    slots: [
      { id: 's1', dayOffset: 1, hour: 18 },
      { id: 's2', dayOffset: 2, hour: 12.5 },
      { id: 's3', dayOffset: 3, hour: 9 },
    ],
    rating: 4.9,
  },
  {
    id: 'cs-james',
    name: 'James Whitfield',
    credentials: 'Counsellor · MBACP (Accred.)',
    bio: 'Person-centred support through grief, burnout and big changes.',
    hue: 205,
    hub: 'London',
    specialties: ['grief', 'burnout', 'sleep', 'stress'],
    languages: ['en'],
    formats: ['video', 'phone'],
    slots: [
      { id: 's1', dayOffset: 1, hour: 13 },
      { id: 's2', dayOffset: 2, hour: 17 },
      { id: 's3', dayOffset: 4, hour: 11 },
    ],
    rating: 4.8,
  },
  {
    id: 'cs-meiling',
    name: 'Dr. Mei-Ling Koh',
    credentials: 'Family therapist · SAC registered',
    bio: 'Parenting, expat life and relationships, with a gentle systemic lens.',
    hue: 330,
    hub: 'Singapore',
    specialties: ['parenting', 'relationships', 'anxiety', 'sleep'],
    languages: ['en'],
    formats: ['video', 'in-person'],
    slots: [
      { id: 's1', dayOffset: 2, hour: 10 },
      { id: 's2', dayOffset: 3, hour: 15.5 },
      { id: 's3', dayOffset: 5, hour: 9.5 },
    ],
    rating: 4.9,
  },
  {
    id: 'cs-yara',
    name: 'Yara Mansour',
    credentials: 'Licensed professional counsellor',
    bio: 'Money worries, family pressure and relationships, in Arabic or English.',
    hue: 280,
    hub: 'Remote',
    specialties: ['finances', 'relationships', 'parenting', 'stress'],
    languages: ['ar', 'en'],
    formats: ['phone', 'video'],
    slots: [
      { id: 's1', dayOffset: 0, hour: 19 },
      { id: 's2', dayOffset: 1, hour: 20 },
      { id: 's3', dayOffset: 3, hour: 18.5 },
    ],
    rating: 4.7,
  },
  {
    id: 'cs-elena',
    name: 'Dr. Elena Vasquez',
    credentials: 'Psychologist · sleep medicine (CBT-I)',
    bio: 'Insomnia, burnout recovery and grief, evidence-based and kind.',
    hue: 150,
    hub: 'Remote',
    specialties: ['sleep', 'burnout', 'grief', 'anxiety'],
    languages: ['en'],
    formats: ['video', 'phone'],
    slots: [
      { id: 's1', dayOffset: 1, hour: 16 },
      { id: 's2', dayOffset: 2, hour: 19 },
      { id: 's3', dayOffset: 4, hour: 14 },
    ],
    rating: 4.8,
  },
];
export const COUNSELLOR_BY_ID = Object.fromEntries(COUNSELLORS.map((c) => [c.id, c])) as Record<string, Counsellor>;

export const CARE_CIRCLES: { id: CircleId; name: string; blurb: string; members: number; meets: string; hue: number }[] = [
  { id: 'new-parents', name: 'New parents', blurb: 'Sleep, feeding, returning to work, and laughing about it.', members: 34, meets: 'Tuesdays · 12:30', hue: 300 },
  { id: 'caregivers', name: 'Caregivers', blurb: 'Looking after a parent, partner or child who needs extra care.', members: 21, meets: 'Every other Monday · 18:00', hue: 200 },
  { id: 'ramadan', name: 'Ramadan wellbeing', blurb: 'Fasting-friendly energy, sleep and work rhythms.', members: 58, meets: 'Daily in Ramadan · after iftar', hue: 40 },
  { id: 'grief', name: 'Grief & loss', blurb: 'A gentle, facilitated space to remember and be heard.', members: 12, meets: 'Thursdays · 17:30', hue: 260 },
  { id: 'neurodiversity', name: 'Neurodiversity', blurb: 'ADHD, autism, dyslexia and everything in between.', members: 27, meets: 'Wednesdays · 13:00', hue: 170 },
  { id: 'expat', name: 'Expat life', blurb: 'New city, far from family, building your people.', members: 46, meets: 'Fridays · 16:00', hue: 20 },
];

export interface CrisisResource {
  id: 'uae' | 'uk' | 'sg' | 'us' | 'remote';
  label: string;
  lines: { label: string; number: string; note: string }[];
}

/** Published public services (always shown with the local emergency number first). */
export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    id: 'uae',
    label: 'UAE',
    lines: [
      { label: 'Police emergency', number: '999', note: '24/7' },
      { label: 'Ambulance', number: '998', note: '24/7' },
      { label: 'National mental support line', number: '800 4673', note: '800 HOPE' },
    ],
  },
  {
    id: 'uk',
    label: 'UK',
    lines: [
      { label: 'Emergency services', number: '999', note: '24/7' },
      { label: 'Samaritans', number: '116 123', note: 'Free · 24/7' },
      { label: 'NHS 111 · mental health', number: '111', note: 'Option 2' },
    ],
  },
  {
    id: 'sg',
    label: 'Singapore',
    lines: [
      { label: 'Ambulance', number: '995', note: '24/7' },
      { label: 'Samaritans of Singapore', number: '1767', note: '24/7' },
      { label: 'IMH mental health helpline', number: '6389 2222', note: '24/7' },
    ],
  },
  {
    id: 'us',
    label: 'USA',
    lines: [
      { label: 'Emergency services', number: '911', note: '24/7' },
      { label: '988 Suicide & Crisis Lifeline', number: '988', note: 'Call or text' },
    ],
  },
  {
    id: 'remote',
    label: 'Remote',
    lines: [
      { label: 'Local emergency number', number: '112', note: 'EU & most mobiles' },
      { label: 'Find a helpline', number: 'findahelpline.com', note: 'Free, by country' },
    ],
  },
];

export const PERK_CATEGORIES: { id: PerkCategory; label: string }[] = [
  { id: 'fitness', label: 'Fitness' },
  { id: 'mind', label: 'Mind' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'physio', label: 'Physio' },
  { id: 'sleep', label: 'Sleep' },
];
export const PERK_CATEGORY_LABEL = Object.fromEntries(PERK_CATEGORIES.map((c) => [c.id, c.label])) as Record<PerkCategory, string>;

export const PERK_CITIES: PerkCity[] = ['Dubai', 'London', 'Singapore', 'Global'];

export const PARTNERS: Partner[] = [
  { id: 'p-oryx', name: 'Oryx Strength Lab', category: 'fitness', city: 'Dubai', area: 'Business Bay', offer: '25% off annual membership', priceAed: 560, credits: 400, hue: 28 },
  { id: 'p-sahara', name: 'Sahara Flow Yoga', category: 'mind', city: 'Dubai', area: 'Al Quoz', offer: '10-class pack for the price of 7', priceAed: 450, credits: 300, hue: 40 },
  { id: 'p-marina-physio', name: 'Marina Physio Co.', category: 'physio', city: 'Dubai', area: 'Dubai Marina', offer: 'Sports massage + assessment', priceAed: 320, hue: 190 },
  { id: 'p-canal', name: 'Canal Side Climbing', category: 'fitness', city: 'London', area: 'Hackney Wick', offer: 'First month free, then 20% off', priceAed: 380, credits: 350, hue: 210 },
  { id: 'p-southbank', name: 'Southbank Pilates Loft', category: 'fitness', city: 'London', area: 'Waterloo', offer: 'Intro week unlimited classes', priceAed: 240, credits: 200, hue: 330 },
  { id: 'p-thames-physio', name: 'Thames Physio Clinic', category: 'physio', city: 'London', area: 'London Bridge', offer: 'Desk-posture assessment', priceAed: 280, hue: 180 },
  { id: 'p-tanjong', name: 'Tanjong Pagar Boxing Club', category: 'fitness', city: 'Singapore', area: 'Tanjong Pagar', offer: '8 classes + free gloves', priceAed: 420, credits: 350, hue: 0 },
  { id: 'p-botanic', name: 'Botanic Breath Studio', category: 'mind', city: 'Singapore', area: 'Holland Village', offer: 'Breathwork & sound-bath pass', priceAed: 600, credits: 450, hue: 150 },
  { id: 'p-stillpoint', name: 'Stillpoint Meditation', category: 'mind', city: 'Global', area: 'iOS & Android app', offer: 'Free annual premium plan', priceAed: 0, credits: 150, hue: 265 },
  { id: 'p-nourish', name: 'Nourish Nutrition Coaching', category: 'nutrition', city: 'Global', area: 'Video sessions', offer: '3 sessions with a dietitian', priceAed: 690, credits: 500, hue: 95 },
  { id: 'p-sleepwell', name: 'SleepWell CBT-I Programme', category: 'sleep', city: 'Global', area: '6-week online course', offer: 'Clinically proven insomnia programme', priceAed: 520, credits: 400, hue: 240 },
  { id: 'p-flexpass', name: 'FlexPass multi-gym', category: 'fitness', city: 'Global', area: '2,000+ gyms worldwide', offer: '20 visits a month, any city', priceAed: 300, credits: 250, hue: 310 },
];
export const PARTNER_BY_ID = Object.fromEntries(PARTNERS.map((p) => [p.id, p])) as Record<string, Partner>;

export const WALLET_ALLOWANCE = 3000;
export const WALLET_CURRENCY = 'AED';

export const DEFAULT_QUIET: QuietHoursSettings = { enabled: true, startHour: 19, endHour: 8, weekendsOff: true, holdPolicy: 'hold' };

/* ───────────────────────── campaigns (next occurrence, relative to now) ───────────────────────── */

const RAMADAN_STARTS = ['2025-03-01', '2026-02-18', '2027-02-08', '2028-01-28', '2029-01-16'];
const MHAW_STARTS = ['2025-05-12', '2026-05-11', '2027-05-10', '2028-05-08', '2029-05-14'];

function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function nextWindow(starts: string[], days: number, now: number): { startsAt: number; endsAt: number } {
  for (const s of starts) {
    const startsAt = parseISO(s);
    const endsAt = startsAt + days * DAY - 1;
    if (endsAt >= now) return { startsAt, endsAt };
  }
  const last = parseISO(starts[starts.length - 1]);
  return { startsAt: last, endsAt: last + days * DAY - 1 };
}

function windowLabel(startsAt: number, endsAt: number): string {
  const f = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(startsAt)} – ${f(endsAt)}`;
}

export function buildCampaigns(now = Date.now()): Campaign[] {
  const year = new Date(now).getFullYear();
  let movStart = new Date(year, 10, 1).getTime();
  let movEnd = new Date(year, 10, 30, 23, 59).getTime();
  if (movEnd < now) {
    movStart = new Date(year + 1, 10, 1).getTime();
    movEnd = new Date(year + 1, 10, 30, 23, 59).getTime();
  }
  const ramadan = nextWindow(RAMADAN_STARTS, 30, now);
  const mhaw = nextWindow(MHAW_STARTS, 7, now);
  return [
    { id: 'movember', name: 'Movember', window: windowLabel(movStart, movEnd), description: 'Move 60 km in November for men’s mental and physical health. Every logged walk counts.', startsAt: movStart, endsAt: movEnd, credits: 150 },
    { id: 'ramadan', name: 'Ramadan wellness', window: windowLabel(ramadan.startsAt, ramadan.endsAt), description: 'Fasting-friendly schedules, suhoor sleep tips, gentle evening movement and quiet hours shifted after iftar.', startsAt: ramadan.startsAt, endsAt: ramadan.endsAt, credits: 200 },
    { id: 'mhaw', name: 'Mental Health Awareness Week', window: windowLabel(mhaw.startsAt, mhaw.endsAt), description: 'Talks, open counsellor drop-ins and a company-wide no-meeting afternoon.', startsAt: mhaw.startsAt, endsAt: mhaw.endsAt, credits: 100 },
  ];
}

/* ───────────────────────── challenge ───────────────────────── */

export function buildChallenge(now = Date.now()): ChallengeState {
  const today = startOfDay(now);
  return {
    id: 'hub-cup-silk-road',
    name: 'Helix Hub Cup · Silk Road Relay',
    goalKm: 2000,
    startedAt: today - 12 * DAY,
    endsAt: today + 19 * DAY + 23 * HOUR,
    teams: [
      { id: 'dubai', baseKm: 1184, participants: 148 },
      { id: 'london', baseKm: 1046, participants: 121 },
      { id: 'singapore', baseKm: 1112, participants: 96 },
      { id: 'newyork', baseKm: 718, participants: 64 },
      { id: 'remote', baseKm: 1262, participants: 173 },
    ],
  };
}

/* ───────────────────────── per-person profiles ───────────────────────── */

interface Profile {
  sleepAvg: number;
  moodAvg: number;
  stressAvg: number;
  energyAvg: number;
  stepsAvg: number;
  /** Breathwork minutes in a typical week. */
  calmPerWeek: number;
  lastLeaveDaysAgo: number;
  weekendSessions: number;
  /** Consecutive daily check-ins ending yesterday. */
  streak: number;
  stepGoal: number;
  circles: CircleId[];
  soundscape: SoundscapeId;
  wins: string[];
}

const GENERIC_WINS = [
  'Took a proper lunch away from my desk',
  'Unblocked a teammate on a tricky problem',
  'Walked to the office instead of driving',
  'Said no to a meeting that could have been an email',
  'Called my parents on the way home',
  'Finished the week’s top priority by Thursday',
  'Slept before midnight three nights in a row',
];

const PROFILES: Record<string, Partial<Profile>> = {
  'u-layla': { sleepAvg: 6.0, moodAvg: 3.4, stressAvg: 3.7, energyAvg: 3.0, stepsAvg: 5200, calmPerWeek: 18, lastLeaveDaysAgo: 122, weekendSessions: 5, streak: 6, circles: ['caregivers'], soundscape: 'desert', wins: ['Passkeys now enforced in the London office', 'Cleared my inbox before Friday prayers', 'Coffee walk with Sara instead of a status call'] },
  'u-sara': { sleepAvg: 6.9, moodAvg: 3.9, stressAvg: 3.0, energyAvg: 3.6, stepsAvg: 7600, calmPerWeek: 40, lastLeaveDaysAgo: 125, weekendSessions: 1, streak: 11, circles: ['ramadan'], soundscape: 'ocean', wins: ['Benefits Q&A had zero unanswered questions', 'Bedtime story night with the kids'] },
  'u-omar': { sleepAvg: 6.4, moodAvg: 3.6, stressAvg: 3.4, energyAvg: 3.3, stepsAvg: 6100, calmPerWeek: 10, lastLeaveDaysAgo: 108, weekendSessions: 3, streak: 3, circles: [], soundscape: 'rain', wins: ['Release train left on time', 'Kwame’s 30-day check-in went brilliantly'] },
  'u-daniel': { sleepAvg: 6.0, moodAvg: 3.0, stressAvg: 3.9, energyAvg: 2.8, stepsAvg: 4300, calmPerWeek: 6, lastLeaveDaysAgo: 31, weekendSessions: 4, streak: 2, circles: ['expat'], soundscape: 'brown', wins: ['Month-end close reconciled a day early'] },
  'u-mei': { sleepAvg: 7.4, moodAvg: 4.1, stressAvg: 2.5, energyAvg: 3.9, stepsAvg: 9200, calmPerWeek: 36, lastLeaveDaysAgo: 206, weekendSessions: 0, streak: 9, circles: ['expat'], soundscape: 'forest', wins: ['Onboarding prototype tested with 6 users', 'Sunrise walk at Gardens by the Bay'] },
  'u-hana': { sleepAvg: 5.3, moodAvg: 3.5, stressAvg: 3.3, energyAvg: 2.6, stepsAvg: 5600, calmPerWeek: 12, lastLeaveDaysAgo: 3, weekendSessions: 0, streak: 4, circles: ['new-parents'], wins: ['Survived the first month as a new parent'] },
  'u-priya': { sleepAvg: 6.8, moodAvg: 3.8, stressAvg: 3.1, stepsAvg: 6900, lastLeaveDaysAgo: 178, circles: ['neurodiversity'] },
  'u-lucas': { sleepAvg: 6.5, moodAvg: 3.6, stressAvg: 3.5, stepsAvg: 8200, lastLeaveDaysAgo: 129, weekendSessions: 6 },
  'u-aisha': { sleepAvg: 7.0, moodAvg: 3.9, stressAvg: 3.0, stepsAvg: 8400, lastLeaveDaysAgo: 196 },
  'u-noah': { sleepAvg: 6.6, moodAvg: 3.7, stressAvg: 3.4, stepsAvg: 7800, lastLeaveDaysAgo: 150 },
  'u-kwame': { sleepAvg: 7.1, moodAvg: 4.0, stressAvg: 2.8, stepsAvg: 6400, lastLeaveDaysAgo: 26, circles: ['expat'] },
  'u-grace': { sleepAvg: 6.7, moodAvg: 3.7, stressAvg: 3.3, stepsAvg: 7000, lastLeaveDaysAgo: 196 },
  'u-fatima': { sleepAvg: 6.9, moodAvg: 3.9, stressAvg: 2.9, stepsAvg: 7300, lastLeaveDaysAgo: 168, circles: ['ramadan'] },
};

function profileFor(userId: string): Profile {
  const r = rng(hashStr(`profile:${userId}`));
  const p = PROFILES[userId] ?? {};
  return {
    sleepAvg: p.sleepAvg ?? Math.round((6.2 + r() * 1.4) * 10) / 10,
    moodAvg: p.moodAvg ?? 3.2 + r() * 1,
    stressAvg: p.stressAvg ?? 2.6 + r() * 1.2,
    energyAvg: p.energyAvg ?? 3 + r() * 0.9,
    stepsAvg: p.stepsAvg ?? Math.round(5200 + r() * 4200),
    calmPerWeek: p.calmPerWeek ?? Math.round(8 + r() * 30),
    lastLeaveDaysAgo: p.lastLeaveDaysAgo ?? Math.round(40 + r() * 150),
    weekendSessions: p.weekendSessions ?? Math.round(r() * 4),
    streak: p.streak ?? Math.round(1 + r() * 8),
    stepGoal: p.stepGoal ?? 8000,
    circles: p.circles ?? [],
    soundscape: p.soundscape ?? SOUNDSCAPES[Math.floor(r() * SOUNDSCAPES.length)].id,
    wins: p.wins ?? [GENERIC_WINS[Math.floor(r() * GENERIC_WINS.length)], GENERIC_WINS[(Math.floor(r() * GENERIC_WINS.length) + 3) % GENERIC_WINS.length]],
  };
}

/* ───────────────────────── per-person seed ───────────────────────── */

function seededClaims(userId: string, now: number): PerkClaim[] {
  const day = (n: number) => isoDay(now - n * DAY);
  const month = (back: number) => {
    const d = new Date(now);
    const m = new Date(d.getFullYear(), d.getMonth() - back, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  };
  const claim = (id: string, partnerId: string, amount: number, description: string, daysAgo: number, status: PerkClaim['status'], extra: Partial<PerkClaim> = {}): PerkClaim => {
    const p = PARTNER_BY_ID[partnerId];
    return {
      id: `wb-cl-${userId}-${id}`,
      createdAt: now - daysAgo * DAY + 2 * HOUR,
      merchant: p.name,
      partnerId,
      category: p.category,
      amount,
      date: day(daysAgo),
      description,
      receiptName: `${p.name.toLowerCase().replace(/[^a-z]+/g, '-')}-receipt.pdf`,
      status,
      ...extra,
    };
  };
  switch (userId) {
    case 'u-layla':
      return [
        claim('1', 'p-marina-physio', 320, 'Sports massage after the 10K', 3, 'submitted'),
        claim('2', 'p-sahara', 450, '10-class yoga pack', 41, 'paid', { payrollMonth: month(1) }),
      ];
    case 'u-omar':
      return [claim('1', 'p-oryx', 560, 'Annual strength membership', 6, 'approved', { payrollMonth: month(0) })];
    case 'u-mei':
      return [claim('1', 'p-botanic', 600, 'Breathwork & sound-bath pass', 33, 'paid', { payrollMonth: month(1) })];
    case 'u-daniel':
      return [claim('1', 'p-thames-physio', 280, 'Desk-posture assessment', 2, 'submitted')];
    case 'u-sara':
      return [claim('1', 'p-flexpass', 300, 'FlexPass monthly visits', 18, 'approved', { payrollMonth: month(0) })];
    default:
      return [];
  }
}

function seededCare(userId: string, now: number): CareBooking[] {
  const at = (dayOffset: number, hour: number) => startOfDay(now) + dayOffset * DAY + hour * HOUR;
  if (userId === 'u-daniel') {
    return [{ id: `care-${userId}-1`, createdAt: now - 2 * DAY, topic: 'stress', language: 'en', format: 'video', stage: 2, counsellorId: 'cs-james', sessionAt: at(2, 17), calendarHold: false }];
  }
  if (userId === 'u-hana') {
    return [{ id: `care-${userId}-1`, createdAt: now - 1 * DAY, topic: 'parenting', language: 'en', format: 'video', stage: 1 }];
  }
  return [];
}

/** Deterministic private history for one person (nothing for *today*). */
export function seedUserWellbeing(userId: string, now = Date.now()): UserWellbeing {
  const p = profileFor(userId);
  const r = rng(hashStr(`history:${userId}`));
  const today0 = startOfDay(now);
  const team = teamOf(SEED_USERS.find((u) => u.id === userId)?.location);

  const checkins: CheckIn[] = [];
  const steps: DaySteps[] = [];
  const activities: ActivityLog[] = [];
  const breaths: BreathSession[] = [];

  for (let d = 13; d >= 1; d -= 1) {
    const dayStart = today0 - d * DAY;
    const date = isoDay(dayStart);
    const dow = new Date(dayStart).getDay();
    const weekend = dow === 0 || dow === 6;

    // Streak: every day inside the streak; then the day right before it is skipped.
    const inStreak = d <= p.streak;
    const skip = d === p.streak + 1 || (!inStreak && r() < 0.3);
    if (!skip) {
      const sleep = clampN(Math.round((p.sleepAvg + (r() - 0.5) * 1.6 + (weekend ? 0.7 : 0)) * 2) / 2, 3.5, 10);
      const stress = toLevel(p.stressAvg + (r() - 0.5) * 1.6 - (weekend ? 0.8 : 0));
      checkins.push({
        id: `ci-${userId}-${date}`,
        date,
        at: dayStart + (8 + r() * 2) * HOUR,
        mood: toLevel(p.moodAvg + (r() - 0.5) * 1.6 + (weekend ? 0.4 : 0)) as Mood,
        energy: toLevel(p.energyAvg + (r() - 0.5) * 1.6 + (sleep - 7) * 0.3),
        stress,
        sleepHours: sleep,
      });
    }

    steps.push({ date, steps: Math.round(p.stepsAvg * (0.62 + r() * 0.7)) });

    if (r() < 0.5) {
      const kind = (['walk', 'walk', 'run', 'yoga', 'cycle', 'swim'] as ActivityKind[])[Math.floor(r() * 6)];
      const minutes = [20, 25, 30, 40, 45][Math.floor(r() * 5)];
      const st = Math.round(ACTIVITY_BY_ID[kind].stepsPerMin * minutes);
      activities.push({ id: `act-${userId}-${date}`, at: dayStart + (7 + r() * 11) * HOUR, date, kind, minutes, steps: st, km: Math.round((st / STEPS_PER_KM) * 100) / 100, teamId: team });
    }

    if (d <= 7 && r() < p.calmPerWeek / 22) {
      const patternId = BREATH_PATTERNS[Math.floor(r() * BREATH_PATTERNS.length)].id;
      breaths.push({ id: `br-${userId}-${date}`, at: dayStart + (11 + r() * 8) * HOUR, patternId, minutes: [2, 2, 5, 5, 10][Math.floor(r() * 5)] });
    }
  }

  const journal: JournalEntry[] = p.wins.map((text, i) => ({
    id: `jr-${userId}-${i}`,
    at: now - (i * 2 + 1) * DAY - Math.round(r() * 5) * HOUR,
    kind: i === 1 ? 'gratitude' : 'win',
    text,
  }));

  return {
    userId,
    checkins,
    journal,
    breaths,
    activities,
    steps,
    stepGoal: p.stepGoal,
    focusSprints: [],
    care: seededCare(userId, now),
    circles: [...p.circles],
    quiet: { ...DEFAULT_QUIET },
    claims: seededClaims(userId, now),
    redemptions: [],
    campaigns: [],
    soundscape: p.soundscape,
    doneRx: { date: isoDay(now), ids: [] },
    walkTalks: [],
    lastLeaveDaysAgo: p.lastLeaveDaysAgo,
    weekendSessions: p.weekendSessions,
    profile: { stepsAvg: p.stepsAvg, sleepAvg: p.sleepAvg },
  };
}

export function buildWellbeingSeed(now = Date.now()): WellbeingData {
  const users: Record<string, UserWellbeing> = {};
  for (const u of SEED_USERS) users[u.id] = seedUserWellbeing(u.id, now);
  return { version: WELLBEING_DATA_VERSION, users, challenge: buildChallenge(now) };
}

/** Anonymous alias shown in Care circles (stable per person, never their name). */
export function circleAlias(userId: string, locale: 'en' | 'ar' = 'en'): string {
  const adj = ['Quiet', 'Gentle', 'Bright', 'Steady', 'Kind', 'Calm', 'Brave', 'Warm'];
  const animal = ['Falcon', 'Oryx', 'Heron', 'Gazelle', 'Dolphin', 'Owl', 'Lynx', 'Turtle'];
  const h = hashStr(`alias:${userId}`);
  const a = h % adj.length;
  const n = (h >>> 8) % animal.length;
  if (locale !== 'ar') return `${adj[a]} ${animal[n]}`;
  // Arabic: noun first, adjective agrees with the noun's gender.
  const adjAr: [string, string][] = [
    ['هادئ', 'هادئة'],
    ['لطيف', 'لطيفة'],
    ['مشرق', 'مشرقة'],
    ['ثابت', 'ثابتة'],
    ['طيّب', 'طيّبة'],
    ['رزين', 'رزينة'],
    ['شجاع', 'شجاعة'],
    ['دافئ', 'دافئة'],
  ];
  const animalAr: [string, 0 | 1][] = [
    ['صقر', 0],
    ['مها', 1],
    ['بلشون', 0],
    ['غزال', 0],
    ['دلفين', 0],
    ['بومة', 1],
    ['وشق', 0],
    ['سلحفاة', 1],
  ];
  const [noun, fem] = animalAr[n];
  return `${noun} ${adjAr[a][fem]}`;
}
