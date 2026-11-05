/**
 * HR Portal vocabulary and Helix people policy: leave types & allowances,
 * public holidays, benefit plans, allowances, perks, letter templates,
 * policies, case categories and new-hire pulse questions.
 * UI and engine code import from here so wording stays consistent.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Baby,
  BadgeCheck,
  Banknote,
  BookOpen,
  Brain,
  CalendarOff,
  Dumbbell,
  FileBadge,
  FileCheck,
  FilePen,
  FileText,
  Globe,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  HeartPulse,
  IdCard,
  Landmark,
  LifeBuoy,
  MoonStar,
  Palmtree,
  Plane,
  Receipt,
  ScrollText,
  ShieldPlus,
  Smile,
  Sofa,
  Stamp,
  Thermometer,
  Umbrella,
  Wallet,
} from 'lucide-react';
import type {
  AllowanceId,
  CaseCategory,
  CaseStatus,
  ClaimStatus,
  DocKind,
  ElectionStatus,
  HealthTier,
  LeaveStatus,
  LeaveTypeId,
  LetterKind,
  LetterStatus,
  PulseMilestone,
  PulseQuestion,
  Relation,
} from './types';

export const HR_DATA_VERSION = 1;
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const DAY = 86_400_000;
const NOW = Date.now();

// ───────────────────────── time off ─────────────────────────
export interface LeaveTypeMeta {
  id: LeaveTypeId;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Hue for colour coding (hsl). */
  hue: number;
  /** Working days per calendar year (null = no fixed allowance). */
  allowance: number | null;
  paid: boolean;
  halfDays: boolean;
  description: string;
  /** Longer requests need a supporting document. */
  attachmentAfterDays?: number;
  /** Requests up to this many days are approved instantly. */
  autoApproveUpTo?: number;
  /** Recommended notice (shown as a gentle warning, never blocking). */
  noticeDays?: number;
  oncePerEmployment?: boolean;
  /** Colleagues only see "Away", never the type (health, family). */
  private?: boolean;
}

export const LEAVE_TYPES: LeaveTypeMeta[] = [
  {
    id: 'annual',
    label: 'Annual leave',
    short: 'Annual',
    icon: Palmtree,
    hue: 160,
    allowance: 25,
    paid: true,
    halfDays: true,
    noticeDays: 14,
    description: '25 working days a year, pro-rated in your first year. Up to 5 unused days carry over into the next year.',
  },
  {
    id: 'wfa',
    label: 'Work from anywhere',
    short: 'Anywhere',
    icon: Globe,
    hue: 199,
    allowance: 20,
    paid: true,
    halfDays: false,
    noticeDays: 7,
    description: '20 days a year to work from anywhere with a reliable connection. You stay online, just somewhere else.',
  },
  {
    id: 'sick',
    label: 'Sick leave',
    short: 'Sick',
    icon: Thermometer,
    hue: 350,
    allowance: 15,
    paid: true,
    halfDays: true,
    attachmentAfterDays: 2,
    autoApproveUpTo: 2,
    private: true,
    description: '15 days on full pay. Up to 2 days need no note and are approved instantly; longer absences need a medical certificate.',
  },
  {
    id: 'parental',
    label: 'Parental leave',
    short: 'Parental',
    icon: Baby,
    hue: 300,
    allowance: 60,
    paid: true,
    halfDays: false,
    noticeDays: 30,
    private: true,
    description: '60 working days on full pay for the primary carer and 10 for the secondary carer, plus a phased return to work.',
  },
  {
    id: 'compassionate',
    label: 'Compassionate leave',
    short: 'Compassionate',
    icon: HeartHandshake,
    hue: 270,
    allowance: 5,
    paid: true,
    halfDays: true,
    private: true,
    description: 'Up to 5 days when you lose someone close or need to care for family. No notice needed.',
  },
  {
    id: 'study',
    label: 'Study & exam leave',
    short: 'Study',
    icon: GraduationCap,
    hue: 45,
    allowance: 10,
    paid: true,
    halfDays: true,
    noticeDays: 14,
    description: '10 days a year for exams, certifications and courses that grow your career.',
  },
  {
    id: 'hajj',
    label: 'Hajj leave',
    short: 'Hajj',
    icon: MoonStar,
    hue: 30,
    allowance: 30,
    paid: true,
    halfDays: false,
    noticeDays: 30,
    oncePerEmployment: true,
    description: 'Up to 30 days on full pay, once during your time with Helix.',
  },
  {
    id: 'unpaid',
    label: 'Unpaid leave',
    short: 'Unpaid',
    icon: CalendarOff,
    hue: 220,
    allowance: null,
    paid: false,
    halfDays: false,
    noticeDays: 30,
    description: 'Extended personal time without pay. Your manager decides; benefits continue for up to 30 days.',
  },
];
export const LEAVE_TYPE_BY_ID = Object.fromEntries(LEAVE_TYPES.map((t) => [t.id, t])) as Record<LeaveTypeId, LeaveTypeMeta>;
export const ANNUAL_CARRY_OVER_MAX = 5;

export const LEAVE_STATUS_META: Record<LeaveStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

// ───────────────────────── public holidays ─────────────────────────
export interface PublicHoliday {
  date: string;
  name: string;
  /** Islamic holidays follow moon sighting; dates are confirmed nearer the time. */
  expected?: boolean;
}

const span = (name: string, expected: boolean, ...dates: string[]): PublicHoliday[] => dates.map((date) => ({ date, name, expected: expected || undefined }));

/** UAE public holidays (private sector). */
export const UAE_HOLIDAYS: PublicHoliday[] = [
  ...span('New Year’s Day', false, '2025-01-01'),
  ...span('Eid al-Fitr', false, '2025-03-30', '2025-03-31', '2025-04-01'),
  ...span('Arafat Day', false, '2025-06-05'),
  ...span('Eid al-Adha', false, '2025-06-06', '2025-06-07', '2025-06-08'),
  ...span('Islamic New Year', false, '2025-06-26'),
  ...span('Prophet Muhammad’s Birthday', false, '2025-09-05'),
  ...span('Commemoration Day', false, '2025-12-01'),
  ...span('National Day', false, '2025-12-02', '2025-12-03'),
  ...span('New Year’s Day', false, '2026-01-01'),
  ...span('Eid al-Fitr', true, '2026-03-20', '2026-03-21', '2026-03-22'),
  ...span('Arafat Day', true, '2026-05-26'),
  ...span('Eid al-Adha', true, '2026-05-27', '2026-05-28', '2026-05-29'),
  ...span('Islamic New Year', true, '2026-06-16'),
  ...span('Prophet Muhammad’s Birthday', true, '2026-08-25'),
  ...span('Commemoration Day', false, '2026-12-01'),
  ...span('National Day', false, '2026-12-02', '2026-12-03'),
  ...span('New Year’s Day', false, '2027-01-01'),
  ...span('Eid al-Fitr', true, '2027-03-10', '2027-03-11', '2027-03-12'),
  ...span('Arafat Day', true, '2027-05-15'),
  ...span('Eid al-Adha', true, '2027-05-16', '2027-05-17', '2027-05-18'),
  ...span('Islamic New Year', true, '2027-06-06'),
  ...span('Prophet Muhammad’s Birthday', true, '2027-08-14'),
  ...span('Commemoration Day', false, '2027-12-01'),
  ...span('National Day', false, '2027-12-02', '2027-12-03'),
];

const UAE_LOCATION = /dubai|abu dhabi|sharjah|ajman|uae|emirates/i;
export const isUaeLocation = (location: string) => UAE_LOCATION.test(location);

/** The holiday calendar that applies to someone's work location. */
export function holidaysFor(location: string): PublicHoliday[] {
  return isUaeLocation(location) ? UAE_HOLIDAYS : [];
}

// ───────────────────────── benefits ─────────────────────────
export interface HealthPlanMeta {
  id: HealthTier;
  label: string;
  insurer: string;
  network: string;
  /** Annual benefit limit (AED). */
  annualLimit: number;
  /** Employee contribution per month (AED); Helix pays the rest. */
  monthlyEmployee: number;
  monthlyPerDependent: number;
  highlights: string[];
  hue: number;
  recommended?: boolean;
}

export const HEALTH_PLANS: HealthPlanMeta[] = [
  {
    id: 'essential',
    label: 'Essential',
    insurer: 'Daman',
    network: 'Comprehensive UAE network',
    annualLimit: 1_000_000,
    monthlyEmployee: 0,
    monthlyPerDependent: 350,
    highlights: ['In-patient & out-patient care', 'Maternity cover', '20% co-pay on consultations', 'Annual dental check-up'],
    hue: 199,
  },
  {
    id: 'plus',
    label: 'Plus',
    insurer: 'Daman',
    network: 'Premium UAE network + GCC',
    annualLimit: 3_000_000,
    monthlyEmployee: 150,
    monthlyPerDependent: 520,
    highlights: ['10% co-pay', 'Worldwide emergency cover', '20 physio & therapy sessions', 'Optical every 2 years'],
    hue: 262,
    recommended: true,
  },
  {
    id: 'premier',
    label: 'Premier',
    insurer: 'Bupa Global',
    network: 'Worldwide, including the US',
    annualLimit: 10_000_000,
    monthlyEmployee: 450,
    monthlyPerDependent: 900,
    highlights: ['No co-pay', 'Worldwide cover incl. the US', 'Unlimited mental-health support', 'Fertility & wellness benefits'],
    hue: 32,
  },
];
export const HEALTH_PLAN_BY_ID = Object.fromEntries(HEALTH_PLANS.map((p) => [p.id, p])) as Record<HealthTier, HealthPlanMeta>;

/** Optional add-ons (AED per month, employee contribution). */
export const ADD_ONS = {
  dental: { label: 'Dental plus', monthly: 45, description: 'Fillings, root canals and orthodontics up to AED 15,000 a year.' },
  vision: { label: 'Vision', monthly: 25, description: 'Eye test plus AED 1,500 for glasses or contact lenses every year.' },
} as const;

/** Life cover multiples of annual base salary → employee contribution per month (AED). */
export const LIFE_COVER: Record<2 | 3 | 4, number> = { 2: 0, 3: 30, 4: 60 };

export const RELATION_LABEL: Record<Relation, string> = { spouse: 'Spouse', child: 'Child', parent: 'Parent' };

export const ELECTION_STATUS_META: Record<ElectionStatus, { label: string; tone: Tone }> = {
  'not-started': { label: 'Not enrolled', tone: 'warning' },
  submitted: { label: 'Submitted · awaiting People Ops', tone: 'info' },
  confirmed: { label: 'Active', tone: 'success' },
};

export interface AllowanceMeta {
  id: AllowanceId;
  label: string;
  icon: LucideIcon;
  hue: number;
  /** Annual budget in AED. */
  annual: number;
  description: string;
  examples: string[];
}

export const ALLOWANCES: AllowanceMeta[] = [
  {
    id: 'learning',
    label: 'Learning budget',
    icon: BookOpen,
    hue: 45,
    annual: 7500,
    description: 'Courses, conferences, books and certifications that grow your craft.',
    examples: ['Conference ticket', 'AWS / Google Cloud certification', 'Online course', 'Books'],
  },
  {
    id: 'wellness',
    label: 'Wellness allowance',
    icon: Dumbbell,
    hue: 160,
    annual: 3000,
    description: 'Gym, classes, sports gear, therapy and mindfulness apps.',
    examples: ['Gym membership', 'Yoga classes', 'Running shoes', 'Headspace / Calm'],
  },
  {
    id: 'home-office',
    label: 'Home office',
    icon: Sofa,
    hue: 199,
    annual: 2000,
    description: 'A healthy set-up for remote days: desk, chair, monitor, headset.',
    examples: ['Ergonomic chair', 'Monitor', 'Standing desk', 'Headset'],
  },
  {
    id: 'flight',
    label: 'Annual flight home',
    icon: Plane,
    hue: 262,
    annual: 3500,
    description: 'One economy return ticket to your home country each year.',
    examples: ['Return flight home'],
  },
];
export const ALLOWANCE_BY_ID = Object.fromEntries(ALLOWANCES.map((a) => [a.id, a])) as Record<AllowanceId, AllowanceMeta>;

export const CLAIM_STATUS_META: Record<ClaimStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Submitted', tone: 'warning' },
  approved: { label: 'Approved · next payroll', tone: 'info' },
  rejected: { label: 'Declined', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
};

export interface PerkMeta {
  id: string;
  label: string;
  icon: LucideIcon;
  hue: number;
  description: string;
  detail: string;
}

export const PERKS: PerkMeta[] = [
  {
    id: 'eap',
    label: 'Employee Assistance Programme',
    icon: LifeBuoy,
    hue: 199,
    description: '24/7 confidential counselling for you and your family.',
    detail: '8 free sessions a year with licensed therapists, in 20+ languages. Nobody at Helix ever sees who uses it.',
  },
  {
    id: 'life',
    label: 'Life & disability cover',
    icon: Umbrella,
    hue: 262,
    description: '2× annual salary life cover from day one, at no cost.',
    detail: 'Increase it to 3× or 4× during enrolment. Includes permanent disability and critical illness cover.',
  },
  {
    id: 'mental',
    label: 'Mental health days',
    icon: Brain,
    hue: 300,
    description: 'Two company-wide recharge days each year.',
    detail: 'Everyone logs off together, so there is no inbox waiting for you.',
  },
  {
    id: 'checkup',
    label: 'Annual health check',
    icon: HeartPulse,
    hue: 350,
    description: 'A full medical check-up every year, fully paid.',
    detail: 'Book at any partner clinic; results stay between you and your doctor.',
  },
  {
    id: 'savings',
    label: 'Savings plan',
    icon: HandCoins,
    hue: 45,
    description: 'Helix matches 50% of voluntary savings up to 5% of base.',
    detail: 'A DEWS-style end-of-service savings plan with low-cost global funds.',
  },
  {
    id: 'family',
    label: 'Family support',
    icon: Smile,
    hue: 160,
    description: 'Back-to-school bonus and a new-baby gift box.',
    detail: 'AED 2,000 per child every August, and a phased return after parental leave.',
  },
];

// ───────────────────────── documents & letters ─────────────────────────
export const DOC_KIND_META: Record<DocKind, { label: string; icon: LucideIcon; hue: number }> = {
  offer: { label: 'Offer letter', icon: FileBadge, hue: 32 },
  contract: { label: 'Contract', icon: FilePen, hue: 262 },
  nda: { label: 'Agreement', icon: ShieldPlus, hue: 199 },
  letter: { label: 'Letter', icon: FileText, hue: 160 },
  certificate: { label: 'Certificate', icon: BadgeCheck, hue: 45 },
  id: { label: 'Identity', icon: IdCard, hue: 220 },
  payslip: { label: 'Payslip', icon: Receipt, hue: 140 },
  other: { label: 'Document', icon: FileCheck, hue: 210 },
};

export interface LetterMeta {
  id: LetterKind;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Generated instantly (no review). */
  instant: boolean;
  defaultAddressee: string;
  salary: 'always' | 'optional' | 'never';
  needsTravel?: boolean;
  turnaround: string;
}

export const LETTER_TYPES: LetterMeta[] = [
  {
    id: 'salary-certificate',
    label: 'Salary certificate',
    icon: Banknote,
    description: 'Confirms your employment and monthly salary, for banks, landlords or visas.',
    instant: true,
    defaultAddressee: 'To whom it may concern',
    salary: 'always',
    turnaround: 'Instant',
  },
  {
    id: 'employment',
    label: 'Employment letter',
    icon: BadgeCheck,
    description: 'Confirms your role, start date and employment status.',
    instant: true,
    defaultAddressee: 'To whom it may concern',
    salary: 'optional',
    turnaround: 'Instant',
  },
  {
    id: 'bank',
    label: 'Bank letter',
    icon: Landmark,
    description: 'Salary transfer letter for a new account, card or loan.',
    instant: true,
    defaultAddressee: 'The Branch Manager',
    salary: 'always',
    turnaround: 'Instant',
  },
  {
    id: 'embassy',
    label: 'Embassy letter',
    icon: Plane,
    description: 'Supports a tourist or business visa application, with your travel dates.',
    instant: false,
    defaultAddressee: 'The Consular Section',
    salary: 'optional',
    needsTravel: true,
    turnaround: 'Within 1 working day',
  },
  {
    id: 'noc',
    label: 'No-objection certificate',
    icon: Stamp,
    description: 'Helix has no objection, e.g. to a driving licence, a visa or a side project.',
    instant: false,
    defaultAddressee: 'To whom it may concern',
    salary: 'never',
    turnaround: 'Within 1 working day',
  },
];
export const LETTER_BY_ID = Object.fromEntries(LETTER_TYPES.map((l) => [l.id, l])) as Record<LetterKind, LetterMeta>;

export const LETTER_STATUS_META: Record<LetterStatus, { label: string; tone: Tone }> = {
  issued: { label: 'Issued', tone: 'success' },
  pending: { label: 'Being prepared', tone: 'warning' },
  rejected: { label: 'Declined', tone: 'danger' },
};

// ───────────────────────── policies ─────────────────────────
export interface PolicyMeta {
  id: string;
  title: string;
  version: number;
  summary: string;
  /** Key points shown in the reader. */
  points: string[];
  mandatory: boolean;
  readMins: number;
  publishedAt: number;
  /** What changed in this version (shown as "Updated"). */
  changes?: string;
  icon: LucideIcon;
}

export const POLICIES: PolicyMeta[] = [
  {
    id: 'conduct',
    title: 'Code of Conduct',
    version: 2,
    summary: 'How we work together: integrity, respect, conflicts of interest and speaking up.',
    points: [
      'Act with integrity: never offer or accept gifts that could influence a decision.',
      'Declare conflicts of interest, including side projects and family relationships at work.',
      'Protect customer and colleague data as if it were your own.',
      'Speak up: raise concerns with your manager, People Ops or the anonymous ethics line. Retaliation is never tolerated.',
    ],
    mandatory: true,
    readMins: 8,
    publishedAt: NOW - 220 * DAY,
    icon: ScrollText,
  },
  {
    id: 'infosec',
    title: 'Information Security',
    version: 3,
    summary: 'Keeping Helix and our customers safe: devices, passwords, passkeys and data handling.',
    points: [
      'Passkeys (or MFA) are mandatory on every company account from 15 November.',
      'Lock your screen whenever you step away; full-disk encryption stays on.',
      'Classify data before sharing; confidential data never goes into personal tools or unapproved AI services.',
      'Report phishing or a lost device to IT & Security within one hour.',
    ],
    mandatory: true,
    readMins: 6,
    publishedAt: NOW - 5 * DAY,
    changes: 'v3: passkeys become mandatory and approved AI tools are listed.',
    icon: ShieldPlus,
  },
  {
    id: 'respect',
    title: 'Respect at Work',
    version: 1,
    summary: 'Our zero-tolerance stance on harassment and discrimination, and how to get help.',
    points: [
      'Everyone deserves to feel safe and respected, in the office, online and at work events.',
      'Harassment, bullying and discrimination of any kind are never acceptable.',
      'Report confidentially to People Ops through Ask People Ops (confidential) or the ethics line.',
      'Every report is investigated promptly, fairly and discreetly.',
    ],
    mandatory: true,
    readMins: 5,
    publishedAt: NOW - 400 * DAY,
    icon: HeartHandshake,
  },
  {
    id: 'flex',
    title: 'Flexible & Remote Work',
    version: 2,
    summary: 'Hybrid rhythm, core hours (10:00–15:00 GST) and 20 work-from-anywhere days.',
    points: [
      'Teams agree their own hybrid rhythm; most meet in person two days a week.',
      'Core collaboration hours are 10:00–15:00 Gulf time, adjusted for your time zone.',
      'Up to 20 work-from-anywhere days a year, booked like time off.',
      'Your wellness and home-office allowances support a healthy remote set-up.',
    ],
    mandatory: false,
    readMins: 4,
    publishedAt: NOW - 120 * DAY,
    icon: Globe,
  },
  {
    id: 'expenses',
    title: 'Travel & Expenses',
    version: 4,
    summary: 'Booking travel, per diems and claiming expenses and allowances.',
    points: [
      'Book through the Travel app; economy for flights under 6 hours, premium economy above.',
      'Submit claims with a receipt within 60 days; approved claims are paid with the next payroll.',
      'Per diems follow the published city rates.',
      'Personal benefit allowances (learning, wellness, home office) are claimed in the HR Portal.',
    ],
    mandatory: false,
    readMins: 5,
    publishedAt: NOW - 60 * DAY,
    icon: Wallet,
  },
];
export const POLICY_BY_ID = Object.fromEntries(POLICIES.map((p) => [p.id, p])) as Record<string, PolicyMeta>;

// ───────────────────────── Ask People Ops ─────────────────────────
export const CASE_CATEGORY_META: Record<CaseCategory, { label: string; icon: LucideIcon; hint: string }> = {
  pay: { label: 'Pay & payslips', icon: Banknote, hint: 'Salary, payslips, bank details, reimbursements' },
  leave: { label: 'Time off', icon: Palmtree, hint: 'Balances, holidays, parental or long leave' },
  benefits: { label: 'Benefits', icon: HeartPulse, hint: 'Insurance, dependents, allowances' },
  documents: { label: 'Documents', icon: FileText, hint: 'Letters, contracts, certificates' },
  visa: { label: 'Visa & residency', icon: IdCard, hint: 'Residence visa, Emirates ID, family sponsorship' },
  wellbeing: { label: 'Wellbeing & support', icon: LifeBuoy, hint: 'Something is hard right now. We are here.' },
  other: { label: 'Something else', icon: FileCheck, hint: 'Anything else People Ops can help with' },
};

export const CASE_STATUS_META: Record<CaseStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'warning' },
  answered: { label: 'Answered', tone: 'info' },
  closed: { label: 'Resolved', tone: 'muted' },
};

// ───────────────────────── new-hire pulse ─────────────────────────
export const PULSE_QUESTIONS: { id: PulseQuestion; label: string }[] = [
  { id: 'welcome', label: 'I feel welcomed by my team' },
  { id: 'clarity', label: 'I know what is expected of me' },
  { id: 'tools', label: 'I have the tools and access I need' },
  { id: 'belonging', label: 'I can be myself at work' },
];

export const PULSE_MILESTONES: { id: PulseMilestone; label: string; openDay: number; closeDay: number }[] = [
  { id: 'week-1', label: 'First week', openDay: 4, closeDay: 14 },
  { id: 'day-30', label: '30 days', openDay: 25, closeDay: 40 },
  { id: 'day-60', label: '60 days', openDay: 55, closeDay: 70 },
  { id: 'day-90', label: '90 days', openDay: 85, closeDay: 100 },
];

export const PULSE_SCALE: { value: 1 | 2 | 3 | 4 | 5; label: string; emoji: string }[] = [
  { value: 1, label: 'Not at all', emoji: '😞' },
  { value: 2, label: 'Not really', emoji: '😕' },
  { value: 3, label: 'Somewhat', emoji: '😐' },
  { value: 4, label: 'Mostly', emoji: '🙂' },
  { value: 5, label: 'Absolutely', emoji: '🤩' },
];

// ───────────────────────── pay ─────────────────────────
/** Payroll currency by work location. */
export function currencyFor(location: string): string {
  const l = location.toLowerCase();
  if (isUaeLocation(l)) return 'AED';
  if (l.includes('london')) return 'GBP';
  if (l.includes('singapore')) return 'SGD';
  if (l.includes('bengaluru') || l.includes('bangalore')) return 'INR';
  if (l.includes('new york')) return 'USD';
  if (l.includes('toronto')) return 'CAD';
  if (l.includes('istanbul')) return 'TRY';
  if (l.includes('accra')) return 'GHS';
  if (/berlin|milan|lisbon|sofia|madrid|paris/.test(l)) return 'EUR';
  return 'AED';
}
