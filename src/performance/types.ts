/**
 * Performance & OKRs — domain model.
 *
 * Three pillars, one store:
 *  - Align   — periods, objectives (company → team → individual), key results with check-ins.
 *  - Reflect — quarterly check-in cycles (self / peer / upward / manager reviews, calibration,
 *              release & acknowledgement), continuous feedback, feedback requests, private notes, 1:1s.
 *  - Grow    — career ladders, levels, development plans, evidence timeline.
 */
import type { Department, KudosValue } from '@/types';
import type { BridgeSource } from '@/lib/appBridge';

/** Every store action behaves like an API call. */
export type PerfResult<T extends object = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

/* ───────────────────────── Competencies & ratings ───────────────────────── */

export type CompetencyId = 'craft' | 'collaboration' | 'ownership' | 'impact' | 'customer';
/** Competency rating 1 (developing) … 5 (role model). */
export type Score5 = 1 | 2 | 3 | 4 | 5;
export type OverallRating = 'exceptional' | 'exceeds' | 'meets' | 'developing' | 'below';
export type Potential = 'low' | 'medium' | 'high';

/* ───────────────────────── Align — OKRs ───────────────────────── */

export type OkrLevel = 'company' | 'team' | 'individual';
export type KrStatus = 'on-track' | 'at-risk' | 'off-track' | 'done';
export type MetricType = 'number' | 'percent' | 'currency' | 'boolean' | 'milestone';
export type Visibility = 'public' | 'private';

export interface Period {
  /** e.g. `q4-2026` */
  id: string;
  /** e.g. `Q4 2026` */
  label: string;
  start: number;
  end: number;
}

export interface KrCheckin {
  id: string;
  at: number;
  value: number;
  /** 1..10 */
  confidence: number;
  note?: string;
  byId: string;
}

export interface KrMilestone {
  id: string;
  title: string;
  done: boolean;
  doneAt?: number;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  metric: MetricType;
  start: number;
  target: number;
  current: number;
  /** Display unit, e.g. `tickets/mo`, `days`, `ms`, `logos` (percent/currency imply their own). */
  unit?: string;
  /** Decimal places to show (uptime → 2). */
  decimals?: number;
  /** Lower is better and the target is a ceiling to stay under (e.g. "≤ 2 P1 incidents"). */
  ceiling?: boolean;
  ownerId: string;
  /** 1..10 — how sure the owner is that the target will be hit. */
  confidence: number;
  checkins: KrCheckin[];
  milestones?: KrMilestone[];
  /** Auto-progress from a linked Helix project (share of its tasks completed). */
  autoProjectId?: string;
  /** End-of-quarter grade 0.0–1.0 (0.7 = great for an ambitious KR). */
  score?: number;
  order: number;
  createdAt: number;
}

export interface Objective {
  id: string;
  title: string;
  description?: string;
  level: OkrLevel;
  /** Team objectives belong to a department; individual ones inherit the owner's. */
  department?: Department;
  ownerId: string;
  coOwnerIds: string[];
  periodId: string;
  /** Alignment: the objective this one ladders up to. */
  parentId?: string;
  visibility: Visibility;
  tags: string[];
  state: 'active' | 'closed';
  /** Close-out reflection (grading). */
  reflection?: string;
  closedAt?: number;
  closedBy?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

export interface OkrComment {
  id: string;
  objectiveId: string;
  authorId: string;
  at: number;
  body: string;
  /** `update` = a status update post; `system` = auto-generated (check-ins, grading). */
  kind: 'comment' | 'update' | 'system';
}

/* ───────────────────────── Reflect — quarterly check-ins ───────────────────────── */

export type PhaseKey = 'self' | 'peer' | 'manager' | 'calibration' | 'release';

export interface CyclePhase {
  key: PhaseKey;
  start: number;
  end: number;
}

export interface Cycle {
  /** e.g. `cyc-2026-q4` */
  id: string;
  name: string;
  periodId: string;
  status: 'draft' | 'active' | 'closed';
  phases: CyclePhase[];
  /** null = everyone with Performance access. */
  departments: Department[] | null;
  participantIds: string[];
  templateId: string;
  /** Peers stay anonymous to the employee (their manager still sees authors). */
  peerAnonymous: boolean;
  /** Upward feedback is only shown aggregated once at least this many reports answered. */
  upwardMin: number;
  createdAt: number;
  createdBy: string;
  launchedAt?: number;
  calibrationLockedAt?: number;
  calibrationLockedBy?: string;
}

export interface TemplateQuestion {
  id: string;
  /** Asked to the employee (first person). */
  prompt: string;
  /** Asked to the manager about the employee. */
  managerPrompt: string;
  help?: string;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  questions: TemplateQuestion[];
  /** Include the five competency ratings. */
  competencies: boolean;
  updatedAt: number;
  updatedBy: string;
}

export type ReviewStatus = 'not-started' | 'draft' | 'submitted';

export interface ReviewPart {
  status: ReviewStatus;
  answers: Record<string, string>;
  ratings: Partial<Record<CompetencyId, Score5>>;
  /** Evidence ids dragged/inserted into answers (feeds the recency-bias check). */
  cited: string[];
  updatedAt?: number;
  submittedAt?: number;
}

export interface ManagerPart extends ReviewPart {
  authorId: string;
  overall?: OverallRating;
  potential?: Potential;
  /** Visible to the author only. */
  privateNote?: string;
}

/** 9-box coordinates: 1 = low, 2 = moderate, 3 = high. */
export type BoxAxis = 1 | 2 | 3;

export interface Calibration {
  performance: BoxAxis;
  potential: BoxAxis;
  note?: string;
  byId: string;
  at: number;
}

export interface Release {
  releasedAt: number;
  releasedBy: string;
  acknowledgedAt?: number;
  employeeComment?: string;
  /** Review conversation scheduled (also added to the 1:1 agenda). */
  conversationAt?: number;
}

/** A review packet: one employee in one cycle. */
export interface Review {
  /** e.g. `rv-q4-mei` */
  id: string;
  cycleId: string;
  employeeId: string;
  managerId: string;
  self: ReviewPart;
  manager: ManagerPart;
  calibration?: Calibration;
  release?: Release;
}

export type UpwardDimension = 'clarity' | 'feedback' | 'growth' | 'safety' | 'unblock';

/** Peer (360) or upward feedback inside a cycle. */
export interface CycleFeedback {
  id: string;
  cycleId: string;
  kind: 'peer' | 'upward';
  /** Who the feedback is about (for upward: the manager). */
  subjectId: string;
  authorId: string;
  /** proposed = nominated, awaiting manager approval. */
  status: 'proposed' | 'requested' | 'submitted' | 'declined';
  nominatedBy?: string;
  requestedAt: number;
  dueAt: number;
  submittedAt?: number;
  // peer
  start?: string;
  stop?: string;
  continue?: string;
  highlight?: CompetencyId;
  anonymous?: boolean;
  // upward
  scores?: Partial<Record<UpwardDimension, Score5>>;
  keep?: string;
  change?: string;
  declineReason?: string;
}

/* ───────────────────────── Continuous feedback ───────────────────────── */

export type FeedbackKind = 'praise' | 'constructive';
/** private = recipient only · manager = recipient + their manager · public = public praise. */
export type FeedbackVisibility = 'private' | 'manager' | 'public';

export interface Feedback {
  id: string;
  fromId: string;
  toId: string;
  at: number;
  kind: FeedbackKind;
  visibility: FeedbackVisibility;
  situation?: string;
  behaviour?: string;
  impact?: string;
  body: string;
  competency?: CompetencyId;
  objectiveId?: string;
  requestId?: string;
  kudosValue?: KudosValue;
  /** Recipient said thanks. */
  thankedAt?: number;
  sharedTo?: string;
}

export interface FeedbackRequest {
  id: string;
  requesterId: string;
  respondentIds: string[];
  topic: string;
  note?: string;
  createdAt: number;
  dueAt: number;
  responses: Record<string, { feedbackId?: string; declinedAt?: number; at: number }>;
  closedAt?: number;
}

/** Manager journal — visible to the author only. */
export interface PrivateNote {
  id: string;
  authorId: string;
  subjectId: string;
  body: string;
  at: number;
}

/* ───────────────────────── 1:1s ───────────────────────── */

export type Cadence = 'weekly' | 'biweekly' | 'monthly';

export interface AgendaItem {
  id: string;
  text: string;
  byId: string;
  createdAt: number;
  done: boolean;
  /** How many meetings this has been carried over. */
  carried?: number;
  source?: 'nova' | 'review' | 'okr' | 'feedback';
}

export interface ActionItem {
  id: string;
  text: string;
  ownerId: string;
  dueAt?: number;
  done: boolean;
  doneAt?: number;
  createdAt: number;
}

export interface Meeting {
  id: string;
  at: number;
  agenda: { text: string; byId: string; done: boolean }[];
  notes: string;
  moods: Record<string, number>;
}

export interface OneOnOneSeries {
  /** e.g. `oo-omar-mei` */
  id: string;
  /** Manager (or mentor). */
  leadId: string;
  /** Report (or mentee). */
  memberId: string;
  kind: 'manager' | 'mentor';
  cadence: Cadence;
  durationMin: number;
  nextAt: number;
  agenda: AgendaItem[];
  sharedNotes: string;
  /** Per participant — each sees only their own. */
  privateNotes: Record<string, string>;
  actionItems: ActionItem[];
  meetings: Meeting[];
  /** Mood check for the upcoming meeting, per participant (1..5). */
  moods: Record<string, number>;
  createdAt: number;
}

/* ───────────────────────── Grow ───────────────────────── */

export type LadderId = 'eng' | 'design' | 'product' | 'people' | 'gtm' | 'finance' | 'mgmt';

export interface LadderLevel {
  id: string;
  title: string;
  summary: string;
  expect: Record<CompetencyId, number>;
}

export interface Ladder {
  id: LadderId;
  name: string;
  track: string;
  levels: LadderLevel[];
}

export interface UserLevel {
  ladderId: LadderId;
  levelId: string;
  since: number;
}

export type GoalStatus = 'not-started' | 'in-progress' | 'done';

export interface GrowthGoal {
  id: string;
  userId: string;
  title: string;
  competency?: CompetencyId;
  why?: string;
  status: GoalStatus;
  dueAt?: number;
  actions: { id: string; text: string; done: boolean }[];
  learning: { title: string; to: string }[];
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** A pinned piece of evidence on someone's performance timeline. */
export interface Evidence {
  id: string;
  userId: string;
  title: string;
  detail?: string;
  source: BridgeSource;
  keyResultId?: string;
  at: number;
  addedBy: string;
}

/* ───────────────────────── Store data ───────────────────────── */

export interface PerfData {
  version: number;
  seededAt: number;
  periods: Period[];
  objectives: Objective[];
  keyResults: KeyResult[];
  comments: OkrComment[];
  cycles: Cycle[];
  templates: ReviewTemplate[];
  reviews: Review[];
  cycleFeedback: CycleFeedback[];
  feedback: Feedback[];
  requests: FeedbackRequest[];
  notes: PrivateNote[];
  series: OneOnOneSeries[];
  levels: Record<string, UserLevel>;
  goals: GrowthGoal[];
  evidence: Evidence[];
}
