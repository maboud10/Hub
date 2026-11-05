/**
 * Talent Hub vocabulary: pipeline stages, labels, colours and templates.
 * UI and engine code import from here so wording stays consistent.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CalendarCheck,
  Crosshair,
  Gavel,
  Globe,
  HandHeart,
  Handshake,
  Linkedin,
  MessagesSquare,
  PartyPopper,
  Radar,
  Recycle,
  Send,
  Signature,
  Sparkles,
  Ticket,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import type {
  ApplicationStatus,
  CandidateSource,
  EmploymentType,
  InterviewKind,
  OfferStatus,
  OnboardingPhase,
  OutreachChannel,
  OutreachStatus,
  OutreachTone,
  Recommendation,
  RejectionReason,
  ReqPriority,
  ReqStatus,
  Seniority,
  StageId,
  StagePhase,
  TaskOwner,
  WorkModel,
} from './types';

export const TALENT_DATA_VERSION = 2;

// ───────────────────────── pipeline ─────────────────────────
export interface StageMeta {
  id: StageId;
  label: string;
  /** Verb shown on "advance" buttons. */
  verb: string;
  phase: StagePhase;
  icon: LucideIcon;
  /** Hue used for the stage colour (hsl). */
  hue: number;
  /** Target days in stage before it is flagged as stale. */
  slaDays: number;
  description: string;
}

export const STAGES: StageMeta[] = [
  { id: 'sourced', label: 'Sourced', verb: 'Source', phase: 'Acquire', icon: Radar, hue: 196, slaDays: 5, description: 'Found on LinkedIn, in the pool or via referral — not contacted yet.' },
  { id: 'contacted', label: 'Engaged', verb: 'Engage', phase: 'Acquire', icon: Send, hue: 214, slaDays: 7, description: 'Outreach sent. Waiting for a reply or following up.' },
  { id: 'applied', label: 'Interested', verb: 'Confirm interest', phase: 'Acquire', icon: HandHeart, hue: 248, slaDays: 3, description: 'Candidate opted in and gave consent to be considered.' },
  { id: 'screen', label: 'Screen', verb: 'Screen', phase: 'Assess', icon: MessagesSquare, hue: 272, slaDays: 5, description: 'Recruiter screen: motivation, logistics, compensation fit.' },
  { id: 'interview', label: 'Interviews', verb: 'Interview', phase: 'Assess', icon: Users, hue: 296, slaDays: 10, description: 'Structured interview loop with scorecards per competency.' },
  { id: 'final', label: 'Debrief', verb: 'Debrief', phase: 'Decide', icon: Gavel, hue: 326, slaDays: 4, description: 'Panel debrief — the hiring manager records the hire decision.' },
  { id: 'offer', label: 'Offer', verb: 'Offer', phase: 'Decide', icon: Signature, hue: 32, slaDays: 7, description: 'Offer drafted, approved, sent and signed.' },
  { id: 'hired', label: 'Hired', verb: 'Hire', phase: 'Onboard', icon: PartyPopper, hue: 152, slaDays: 0, description: 'Offer accepted — handed off to HR Portal onboarding.' },
];

export const STAGE_ORDER: StageId[] = STAGES.map((s) => s.id);
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageMeta>;
export const stageIndex = (id: StageId) => STAGE_ORDER.indexOf(id);
export const STAGE_PHASES: StagePhase[] = ['Acquire', 'Assess', 'Decide', 'Onboard'];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  active: 'Active',
  rejected: 'Not progressing',
  withdrawn: 'Withdrew',
  hired: 'Hired',
};

export const REJECTION_REASONS: { id: RejectionReason; label: string }[] = [
  { id: 'skills', label: 'Skills gap' },
  { id: 'experience', label: 'Experience level' },
  { id: 'compensation', label: 'Compensation mismatch' },
  { id: 'location', label: 'Location / work model' },
  { id: 'culture', label: 'Values alignment' },
  { id: 'position-filled', label: 'Position filled' },
  { id: 'candidate-withdrew', label: 'Candidate withdrew' },
  { id: 'no-response', label: 'No response' },
  { id: 'other', label: 'Other' },
];
export const REJECTION_LABEL = Object.fromEntries(REJECTION_REASONS.map((r) => [r.id, r.label])) as Record<RejectionReason, string>;

// ───────────────────────── sources ─────────────────────────
export const SOURCE_META: Record<CandidateSource, { label: string; icon: LucideIcon; hue: number }> = {
  linkedin: { label: 'LinkedIn', icon: Linkedin, hue: 207 },
  referral: { label: 'Referral', icon: Handshake, hue: 152 },
  inbound: { label: 'Applied', icon: Globe, hue: 262 },
  agency: { label: 'Agency', icon: Building2, hue: 32 },
  internal: { label: 'Internal', icon: UserRoundCheck, hue: 186 },
  'silver-medalist': { label: 'Silver medalist', icon: Recycle, hue: 45 },
  event: { label: 'Event', icon: Ticket, hue: 330 },
};

// ───────────────────────── requisitions ─────────────────────────
export const REQ_STATUS_META: Record<ReqStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  draft: { label: 'Draft', tone: 'muted' },
  'pending-approval': { label: 'Awaiting approval', tone: 'warning' },
  open: { label: 'Open', tone: 'success' },
  'on-hold': { label: 'On hold', tone: 'info' },
  filled: { label: 'Filled', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
};

export const PRIORITY_META: Record<ReqPriority, { label: string; tone: 'danger' | 'warning' | 'info' | 'muted' }> = {
  critical: { label: 'Critical', tone: 'danger' },
  high: { label: 'High', tone: 'warning' },
  normal: { label: 'Normal', tone: 'info' },
  low: { label: 'Low', tone: 'muted' },
};

export const WORK_MODEL_LABEL: Record<WorkModel, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  'full-time': 'Full-time',
  contract: 'Contract',
  'part-time': 'Part-time',
  internship: 'Internship',
};
export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
  staff: 'Staff',
  principal: 'Principal',
  lead: 'Lead',
  manager: 'Manager',
  director: 'Director',
  executive: 'Executive',
};
/** Typical minimum years per seniority, used when a JD doesn't state one. */
export const SENIORITY_YEARS: Record<Seniority, number> = {
  intern: 0,
  junior: 1,
  mid: 3,
  senior: 5,
  staff: 8,
  principal: 10,
  lead: 7,
  manager: 7,
  director: 10,
  executive: 14,
};

export const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'SGD', 'INR'] as const;

// ───────────────────────── interviews ─────────────────────────
export const INTERVIEW_KIND_META: Record<InterviewKind, { label: string; icon: LucideIcon; defaultMins: number; focus: string[] }> = {
  screen: { label: 'Recruiter screen', icon: MessagesSquare, defaultMins: 30, focus: ['Motivation', 'Communication', 'Logistics & expectations'] },
  technical: { label: 'Technical deep-dive', icon: Sparkles, defaultMins: 60, focus: ['Technical depth', 'Problem solving', 'Code quality'] },
  'system-design': { label: 'System design', icon: Crosshair, defaultMins: 60, focus: ['Architecture', 'Trade-offs', 'Scalability'] },
  portfolio: { label: 'Portfolio review', icon: Sparkles, defaultMins: 60, focus: ['Craft', 'Storytelling', 'Impact'] },
  case: { label: 'Case study', icon: Crosshair, defaultMins: 60, focus: ['Structured thinking', 'Judgement', 'Communication'] },
  culture: { label: 'Values & collaboration', icon: HandHeart, defaultMins: 45, focus: ['Ownership', 'Collaboration', 'Customer focus'] },
  panel: { label: 'Panel', icon: Users, defaultMins: 60, focus: ['Role expertise', 'Collaboration', 'Communication'] },
  final: { label: 'Hiring manager', icon: CalendarCheck, defaultMins: 45, focus: ['Role fit', 'Growth potential', 'Leadership'] },
};

export const RECOMMENDATION_META: Record<Recommendation, { label: string; short: string; tone: 'success' | 'danger'; value: number }> = {
  'strong-yes': { label: 'Strong hire', short: 'Strong yes', tone: 'success', value: 4 },
  yes: { label: 'Hire', short: 'Yes', tone: 'success', value: 3 },
  no: { label: 'No hire', short: 'No', tone: 'danger', value: 2 },
  'strong-no': { label: 'Strong no hire', short: 'Strong no', tone: 'danger', value: 1 },
};

export const RATING_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: 'Below bar', 2: 'Mixed', 3: 'Meets bar', 4: 'Exceptional' };

// ───────────────────────── offers ─────────────────────────
export const OFFER_STATUS_META: Record<OfferStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  draft: { label: 'Draft', tone: 'muted' },
  'pending-approval': { label: 'Awaiting approval', tone: 'warning' },
  approved: { label: 'Approved · ready to send', tone: 'info' },
  sent: { label: 'Sent · awaiting signature', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  rescinded: { label: 'Rescinded', tone: 'muted' },
};

export const APPROVAL_STEP_LABEL = { 'hiring-manager': 'Hiring manager', 'people-ops': 'People Ops' } as const;

// ───────────────────────── outreach ─────────────────────────
export const CHANNEL_META: Record<OutreachChannel, { label: string; short: string; limit: number; subjectLimit?: number; hint: string }> = {
  'linkedin-connect': {
    label: 'LinkedIn connection note',
    short: 'Connect note',
    limit: 300,
    hint: 'Personalised invitations are capped at 300 characters.',
  },
  'linkedin-inmail': {
    label: 'LinkedIn InMail',
    short: 'InMail',
    limit: 1900,
    subjectLimit: 200,
    hint: 'InMail: subject up to 200 characters, body up to 1,900.',
  },
  email: { label: 'Email', short: 'Email', limit: 3000, subjectLimit: 120, hint: 'Keep it scannable — under 150 words performs best.' },
};

export const TONE_META: Record<OutreachTone, { label: string; description: string }> = {
  warm: { label: 'Warm', description: 'Friendly, appreciative, human.' },
  concise: { label: 'Concise', description: 'Three lines. Respect their time.' },
  visionary: { label: 'Visionary', description: 'Lead with mission and impact.' },
  technical: { label: 'Technical', description: 'Stack, scale and hard problems.' },
};

export const OUTREACH_STATUS_META: Record<OutreachStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  draft: { label: 'Draft', tone: 'muted' },
  sent: { label: 'Sent', tone: 'info' },
  replied: { label: 'Replied', tone: 'info' },
  interested: { label: 'Interested', tone: 'success' },
  'not-interested': { label: 'Not interested', tone: 'danger' },
  'no-response': { label: 'No response', tone: 'warning' },
};

/** Follow-up cadence (days after the first touch). */
export const FOLLOW_UP_DAYS: Record<1 | 2 | 3, number> = { 1: 0, 2: 4, 3: 9 };

// ───────────────────────── onboarding ─────────────────────────
export const PHASE_META: Record<OnboardingPhase, { label: string; short: string; window: string; hue: number }> = {
  'pre-boarding': { label: 'Pre-boarding', short: 'Pre', window: 'Before day one', hue: 210 },
  'day-1': { label: 'Day one', short: 'D1', window: 'First day', hue: 262 },
  'week-1': { label: 'First week', short: 'W1', window: 'Days 2–7', hue: 290 },
  'day-30': { label: '30 days', short: '30', window: 'Learn', hue: 320 },
  'day-60': { label: '60 days', short: '60', window: 'Contribute', hue: 30 },
  'day-90': { label: '90 days', short: '90', window: 'Own', hue: 150 },
};
export const PHASE_ORDER: OnboardingPhase[] = ['pre-boarding', 'day-1', 'week-1', 'day-30', 'day-60', 'day-90'];

export const OWNER_META: Record<TaskOwner, { label: string; hue: number }> = {
  'people-ops': { label: 'People Ops', hue: 262 },
  it: { label: 'IT', hue: 196 },
  manager: { label: 'Manager', hue: 32 },
  buddy: { label: 'Buddy', hue: 152 },
  'new-hire': { label: 'New hire', hue: 330 },
};

/** Default onboarding plan — cloned into every journey at hand-off. */
export const ONBOARDING_TEMPLATE: {
  phase: OnboardingPhase;
  title: string;
  owner: TaskOwner;
  dueOffsetDays: number;
  courseId?: string;
  articleSlug?: string;
}[] = [
  { phase: 'pre-boarding', title: 'Send welcome pack & first-day agenda', owner: 'people-ops', dueOffsetDays: -10, articleSlug: 'first-week-at-helix' },
  { phase: 'pre-boarding', title: 'Collect signed contract & ID documents', owner: 'people-ops', dueOffsetDays: -9 },
  { phase: 'pre-boarding', title: 'Start work permit, medical & Emirates ID', owner: 'people-ops', dueOffsetDays: -8 },
  { phase: 'pre-boarding', title: 'Order laptop & peripherals', owner: 'it', dueOffsetDays: -7 },
  { phase: 'pre-boarding', title: 'Provision NEXUS account, email & SSO', owner: 'it', dueOffsetDays: -3, articleSlug: 'passkeys-and-zero-trust' },
  { phase: 'pre-boarding', title: 'Assign an onboarding buddy', owner: 'manager', dueOffsetDays: -7, articleSlug: 'onboarding-buddy-playbook' },
  { phase: 'pre-boarding', title: 'Draft the 30/60/90 success plan', owner: 'manager', dueOffsetDays: -3, articleSlug: 'manager-30-60-90-guide' },
  { phase: 'pre-boarding', title: 'Send a welcome message', owner: 'buddy', dueOffsetDays: -2, articleSlug: 'onboarding-buddy-playbook' },
  { phase: 'pre-boarding', title: 'Complete personal details & bank info', owner: 'new-hire', dueOffsetDays: -5 },
  { phase: 'day-1', title: 'Welcome session & office tour', owner: 'people-ops', dueOffsetDays: 0 },
  { phase: 'day-1', title: 'Laptop hand-over, passkey & MFA set-up', owner: 'it', dueOffsetDays: 0, articleSlug: 'passkeys-and-zero-trust' },
  { phase: 'day-1', title: 'Kick-off 1:1 and team introductions', owner: 'manager', dueOffsetDays: 0 },
  { phase: 'day-1', title: 'Lunch with your buddy', owner: 'buddy', dueOffsetDays: 0 },
  { phase: 'day-1', title: 'Complete security awareness training', owner: 'new-hire', dueOffsetDays: 0, courseId: 'c-sec-101', articleSlug: 'passkeys-and-zero-trust' },
  { phase: 'week-1', title: 'Benefits & health insurance enrolment', owner: 'people-ops', dueOffsetDays: 3, articleSlug: 'benefits-and-time-off-guide' },
  { phase: 'week-1', title: 'Share team OKRs and a first project', owner: 'manager', dueOffsetDays: 2 },
  { phase: 'week-1', title: 'Shadow a team ritual (stand-up, review, demo)', owner: 'buddy', dueOffsetDays: 4 },
  { phase: 'week-1', title: 'Complete AI safety & data privacy training', owner: 'new-hire', dueOffsetDays: 4, courseId: 'c-ai-privacy', articleSlug: 'ai-safety-and-prompt-playbook' },
  { phase: 'week-1', title: 'Finish tool set-up and request app access', owner: 'new-hire', dueOffsetDays: 5, articleSlug: 'first-week-at-helix' },
  { phase: 'day-30', title: '30-day check-in', owner: 'manager', dueOffsetDays: 30 },
  { phase: 'day-30', title: '30-day onboarding pulse survey', owner: 'people-ops', dueOffsetDays: 30 },
  { phase: 'day-30', title: 'Complete AI Fundamentals certification', owner: 'new-hire', dueOffsetDays: 28, courseId: 'c-ai-101', articleSlug: 'ai-safety-and-prompt-playbook' },
  { phase: 'day-30', title: 'Ship a first contribution', owner: 'new-hire', dueOffsetDays: 28 },
  { phase: 'day-60', title: '60-day feedback conversation', owner: 'manager', dueOffsetDays: 60 },
  { phase: 'day-60', title: 'Own a workstream end-to-end', owner: 'new-hire', dueOffsetDays: 60 },
  { phase: 'day-90', title: 'Probation review & growth plan', owner: 'manager', dueOffsetDays: 90, articleSlug: 'manager-30-60-90-guide' },
  { phase: 'day-90', title: 'Confirm probation outcome', owner: 'people-ops', dueOffsetDays: 92 },
  { phase: 'day-90', title: 'Onboarding retrospective', owner: 'new-hire', dueOffsetDays: 90 },
];

/** Locations offered in pickers (free text is allowed too). */
export const LOCATIONS = [
  'Dubai',
  'Abu Dhabi',
  'Riyadh',
  'Doha',
  'Cairo',
  'London',
  'Berlin',
  'Lisbon',
  'Bengaluru',
  'Singapore',
  'New York',
  'Toronto',
  'Remote (EMEA)',
  'Remote',
];

export const BANDS = ['E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'M4', 'M5', 'M6'];
