/**
 * Talent Hub domain model.
 *
 * Every top-level interface maps 1:1 to a document in the `talenthub` Firestore
 * database (collection names = keys of `TalentData`). Locally the documents live
 * in a persisted Zustand store; the Firestore backend mirrors them unchanged.
 * Timestamps are epoch milliseconds (portable, rule-friendly); calendar dates
 * that have no time component (start dates) are ISO `YYYY-MM-DD` strings.
 *
 * Pipeline: Acquire (sourced → engaged → interested) → Assess (screen → interviews)
 *           → Decide (final → offer) → Hired → hand-off to HR Portal onboarding.
 */
import type { Department } from '@/types';

export type { Department };

// ───────────────────────── shared enums ─────────────────────────
export type StageId = 'sourced' | 'contacted' | 'applied' | 'screen' | 'interview' | 'final' | 'offer' | 'hired';
export type StagePhase = 'Acquire' | 'Assess' | 'Decide' | 'Onboard';

export type CandidateSource = 'linkedin' | 'referral' | 'inbound' | 'agency' | 'internal' | 'silver-medalist' | 'event';
export type WorkModel = 'onsite' | 'hybrid' | 'remote';
export type EmploymentType = 'full-time' | 'contract' | 'part-time' | 'internship';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | 'executive';
export type ReqStatus = 'draft' | 'pending-approval' | 'open' | 'on-hold' | 'filled' | 'closed';
export type ReqPriority = 'low' | 'normal' | 'high' | 'critical';
export type AiEngine = 'gemini' | 'offline';

// ───────────────────────── job description intelligence ─────────────────────────
export interface SkillRequirement {
  /** Canonical skill label from the taxonomy, e.g. "React". */
  skill: string;
  /** 3 = core, 2 = important, 1 = supporting. */
  weight: 1 | 2 | 3;
  /** Must-have vs nice-to-have. */
  must: boolean;
}

export type JDFlagKind = 'inclusive' | 'clarity' | 'length' | 'salary' | 'requirements' | 'benefits';

export interface JDFlag {
  kind: JDFlagKind;
  severity: 'info' | 'warning';
  message: string;
  /** Offending term (for inclusive-language flags). */
  term?: string;
  suggestion?: string;
}

export interface JDQuality {
  /** 0–100 "JD health" score. */
  score: number;
  flags: JDFlag[];
}

export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
  period: 'year' | 'month';
}

/** The decoded "Search DNA" of a job description. */
export interface JobProfile {
  title: string;
  seniority: Seniority;
  yearsMin: number | null;
  department: Department | null;
  location: string | null;
  workModel: WorkModel | null;
  employmentType: EmploymentType;
  summary: string;
  skills: SkillRequirement[];
  responsibilities: string[];
  /** Alternative titles used to widen searches (LinkedIn Boolean, X-ray). */
  titleAliases: string[];
  /** Domain / industry keywords (payments, fintech, B2B SaaS…). */
  keywords: string[];
  salary: SalaryRange | null;
  quality: JDQuality;
  engine: AiEngine;
  analyzedAt: number;
}

// ───────────────────────── requisitions ─────────────────────────
export type InterviewKind = 'screen' | 'technical' | 'system-design' | 'portfolio' | 'case' | 'culture' | 'panel' | 'final';

export interface InterviewStep {
  id: string;
  kind: InterviewKind;
  label: string;
  durationMins: number;
  interviewerIds: string[];
  /** Competencies assessed in this step (become scorecard rows). */
  focus: string[];
}

export interface Requisition {
  id: string;
  title: string;
  department: Department;
  location: string;
  workModel: WorkModel;
  employmentType: EmploymentType;
  seniority: Seniority;
  /** Internal level / band, e.g. "E5". */
  band: string;
  /** Sensitive — visible with `talent.comp.view`. */
  salary: { min: number; max: number; currency: string } | null;
  headcount: number;
  /** Seats already filled. */
  hires: number;
  status: ReqStatus;
  priority: ReqPriority;
  hiringManagerId: string;
  recruiterId: string;
  interviewPlan: InterviewStep[];
  jd: { text: string; fileName?: string; profile: JobProfile | null };
  createdBy: string;
  createdAt: number;
  openedAt?: number;
  approvedBy?: string;
  /** ISO date. */
  targetStartDate?: string;
  closedAt?: number;
}

// ───────────────────────── candidates (talent pool) ─────────────────────────
export interface Experience {
  title: string;
  company: string;
  /** ISO year-month, e.g. "2021-03". */
  start: string;
  end: string | null;
  summary?: string;
}

export interface Education {
  school: string;
  degree: string;
  year?: number;
}

export interface Consent {
  given: boolean;
  at?: number;
  /** GDPR / UAE PDPL retention horizon. */
  retentionUntil?: number;
  method?: 'email' | 'linkedin' | 'application' | 'verbal';
}

export interface Candidate {
  id: string;
  name: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  email?: string;
  /** Sensitive — visible with `talent.comp.view` or `talent.manage`. */
  phone?: string;
  linkedinUrl?: string;
  avatarHue: number;
  yearsExperience: number;
  skills: string[];
  experience: Experience[];
  education: Education[];
  source: CandidateSource;
  /** e.g. "LinkedIn · sample feed", "Referred by Priya Raman". */
  sourceDetail?: string;
  referrerId?: string;
  tags: string[];
  openToWork?: boolean;
  noticePeriodDays?: number;
  /** Sensitive — visible with `talent.comp.view`. */
  salaryExpectation?: { amount: number; currency: string; period: 'year' | 'month' };
  workModelPreference?: WorkModel;
  consent: Consent;
  status: 'active' | 'archived' | 'do-not-contact';
  /** Generated demo profile (not a real person). */
  sample?: boolean;
  /** Free-text recent signal used for personalised outreach. */
  recentActivity?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  lastContactedAt?: number;
}

// ───────────────────────── applications (pipeline) ─────────────────────────
export type ApplicationStatus = 'active' | 'rejected' | 'withdrawn' | 'hired';
export type RejectionReason =
  | 'skills'
  | 'experience'
  | 'compensation'
  | 'location'
  | 'culture'
  | 'position-filled'
  | 'candidate-withdrew'
  | 'no-response'
  | 'other';

export interface StageEvent {
  stage: StageId;
  at: number;
  by: string;
  note?: string;
  /** Gate was overridden by a recruiter (audited). */
  override?: boolean;
}

export interface MatchResult {
  /** 0–100 overall fit. */
  score: number;
  breakdown: { skills: number; experience: number; location: number; title: number; signals: number };
  /** Must-have skills the person covers. */
  matched: string[];
  /** Must-have skills not found. */
  missing: string[];
  /** Nice-to-have skills covered. */
  bonus: string[];
  /** Human-readable explanation, best first. */
  reasons: string[];
  engine: AiEngine;
}

export interface Application {
  id: string;
  candidateId: string;
  requisitionId: string;
  stage: StageId;
  stageEnteredAt: number;
  status: ApplicationStatus;
  history: StageEvent[];
  match: MatchResult | null;
  decision?: { verdict: 'hire' | 'no-hire'; by: string; at: number; note?: string };
  rejection?: { reason: RejectionReason; note?: string; by: string; at: number };
  /** Recruiter who owns the application. */
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

// ───────────────────────── interviews & scorecards ─────────────────────────
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

export interface Interview {
  id: string;
  applicationId: string;
  candidateId: string;
  requisitionId: string;
  kind: InterviewKind;
  title: string;
  scheduledAt: number;
  durationMins: number;
  interviewerIds: string[];
  location: string;
  status: InterviewStatus;
  createdBy: string;
  createdAt: number;
}

export type Recommendation = 'strong-no' | 'no' | 'yes' | 'strong-yes';
export type Rating = 1 | 2 | 3 | 4;

export interface Scorecard {
  id: string;
  interviewId: string;
  applicationId: string;
  interviewerId: string;
  /** competency → 1 (poor) … 4 (exceptional) */
  ratings: Record<string, Rating>;
  recommendation: Recommendation;
  notes: string;
  submittedAt: number;
}

// ───────────────────────── offers ─────────────────────────
export type OfferStatus = 'draft' | 'pending-approval' | 'approved' | 'sent' | 'accepted' | 'declined' | 'rescinded';
export type ApprovalStep = 'hiring-manager' | 'people-ops';

export interface OfferApproval {
  step: ApprovalStep;
  approverId?: string;
  decision: 'pending' | 'approved' | 'rejected';
  at?: number;
  note?: string;
}

export interface Offer {
  id: string;
  applicationId: string;
  candidateId: string;
  requisitionId: string;
  title: string;
  band: string;
  /** Sensitive — `talent.comp.view`. */
  baseSalary: number;
  currency: string;
  bonusPct: number;
  equity: string;
  signOnBonus: number;
  /** ISO date. */
  startDate: string;
  expiresAt: number;
  status: OfferStatus;
  approvals: OfferApproval[];
  createdBy: string;
  createdAt: number;
  sentAt?: number;
  respondedAt?: number;
  note?: string;
}

// ───────────────────────── outreach ─────────────────────────
export type OutreachChannel = 'linkedin-connect' | 'linkedin-inmail' | 'email';
export type OutreachTone = 'warm' | 'concise' | 'visionary' | 'technical';
export type OutreachStatus = 'draft' | 'sent' | 'replied' | 'interested' | 'not-interested' | 'no-response';

export interface Outreach {
  id: string;
  candidateId: string;
  requisitionId: string | null;
  channel: OutreachChannel;
  tone: OutreachTone;
  subject?: string;
  body: string;
  /** 1 = first touch, 2–3 = follow-ups. */
  step: 1 | 2 | 3;
  status: OutreachStatus;
  engine: AiEngine;
  createdBy: string;
  createdAt: number;
  sentAt?: number;
  respondedAt?: number;
  /** When the next follow-up is planned. */
  followUpAt?: number;
}

// ───────────────────────── onboarding (HR Portal hand-off) ─────────────────────────
export type OnboardingPhase = 'pre-boarding' | 'day-1' | 'week-1' | 'day-30' | 'day-60' | 'day-90';
export type TaskOwner = 'people-ops' | 'it' | 'manager' | 'buddy' | 'new-hire';
export type OnboardingStatus = 'pre-boarding' | 'active' | 'completed';

export interface OnboardingTask {
  id: string;
  phase: OnboardingPhase;
  title: string;
  owner: TaskOwner;
  /** Due date relative to the start date (negative = before day one). */
  dueOffsetDays: number;
  /** Linked Academy course — completing the course auto-completes this task. */
  courseId?: string;
  /** Linked Knowledge Base playbook or guide slug. */
  articleSlug?: string;
  done: boolean;
  doneAt?: number;
  doneBy?: string;
}

export interface OnboardingJourney {
  id: string;
  candidateId: string;
  applicationId: string;
  requisitionId: string;
  offerId: string;
  name: string;
  /** Personal email until the work account exists. */
  email: string;
  title: string;
  department: Department;
  location: string;
  managerId: string;
  buddyId?: string;
  /** ISO date. */
  startDate: string;
  status: OnboardingStatus;
  tasks: OnboardingTask[];
  avatarHue: number;
  /** Set once the NEXUS account is provisioned. */
  hubUserId?: string;
  workEmail?: string;
  welcomeNote?: string;
  handedOffBy: string;
  handedOffAt: number;
}

// ───────────────────────── activity timeline ─────────────────────────
export type ActivityKind =
  | 'created'
  | 'import'
  | 'stage'
  | 'outreach'
  | 'reply'
  | 'interview'
  | 'scorecard'
  | 'decision'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'note'
  | 'handoff'
  | 'requisition';

export interface TalentActivity {
  id: string;
  at: number;
  actorId: string;
  kind: ActivityKind;
  text: string;
  candidateId?: string;
  applicationId?: string;
  requisitionId?: string;
}

// ───────────────────────── database shape ─────────────────────────
export interface TalentData {
  version: number;
  requisitions: Requisition[];
  candidates: Candidate[];
  applications: Application[];
  interviews: Interview[];
  scorecards: Scorecard[];
  offers: Offer[];
  outreach: Outreach[];
  onboarding: OnboardingJourney[];
  activity: TalentActivity[];
}

export type TalentCollection = Exclude<keyof TalentData, 'version'>;

// ───────────────────────── LinkedIn ─────────────────────────
/** A LinkedIn profile surfaced by the connector — not yet in the talent pool. */
export interface Prospect {
  id: string;
  name: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  yearsExperience: number;
  skills: string[];
  experience: Experience[];
  education: Education[];
  openToWork: boolean;
  /** Empty for generated sample profiles (they are not real members). */
  profileUrl: string;
  avatarHue: number;
  connectionDegree: 1 | 2 | 3;
  mutualConnections: number;
  recentActivity?: string;
  sample: boolean;
}

/** Anything the matcher can score: candidates, prospects, internal employees. */
export interface Matchable {
  skills: string[];
  yearsExperience: number;
  location: string;
  currentTitle: string;
  headline?: string;
  openToWork?: boolean;
  source?: CandidateSource;
  workModelPreference?: WorkModel;
}
