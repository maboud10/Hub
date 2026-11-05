/**
 * Helix Academy domain model: interactive courses, branching workplace
 * scenarios, graded certifications, learning paths, and live onboarding sync.
 */
import type { Department } from '@/types';
import type { OnboardingPhase } from '@/talent/types';

export type AcademyTrack = 'onboarding' | 'security' | 'ai' | 'engineering' | 'product' | 'leadership';
export type CourseLevel = 'foundations' | 'practitioner' | 'advanced';
export type CourseFormat = 'interactive' | 'scenario' | 'certification' | 'workshop';

export type LessonBlock =
  | { kind: 'paragraph'; heading?: string; text: string }
  | { kind: 'bullets'; heading?: string; items: string[] }
  | { kind: 'callout'; tone: 'tip' | 'warning' | 'policy' | 'insight'; title: string; text: string }
  | { kind: 'code'; label: string; code: string }
  | { kind: 'flashcheck'; question: string; answer: string };

export interface ConceptLesson {
  id: string;
  kind: 'concept';
  title: string;
  durationMins: number;
  summary: string;
  blocks: LessonBlock[];
  keyTakeaways: string[];
}

export interface ScenarioChoice {
  id: string;
  label: string;
  optimal: boolean;
  impact: string;
  feedback: string;
}

export interface ScenarioLesson {
  id: string;
  kind: 'scenario';
  title: string;
  durationMins: number;
  summary: string;
  contextLabel: string;
  artifact?: { kind: 'message' | 'email' | 'code' | 'document'; header: string; body: string };
  prompt: string;
  choices: ScenarioChoice[];
}

export type Lesson = ConceptLesson | ScenarioLesson;

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  track: AcademyTrack;
  level: CourseLevel;
  format: CourseFormat;
  durationMins: number;
  xp: number;
  hue: number;
  instructorId: string;
  skills: string[];
  /** Universal annual compliance course. */
  mandatory?: boolean;
  /** Days until recertification is required (e.g. 365). */
  recertDays?: number;
  /** Minimum quiz percentage (0–100) to pass & earn credential. */
  passScore: number;
  /** Linked Knowledge Base playbook slugs for instant reference. */
  companionSlugs: string[];
  lessons: Lesson[];
  quiz: QuizQuestion[];
  featured?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type EnrollmentStatus = 'assigned' | 'in-progress' | 'completed';
export type AssignmentSource = 'onboarding' | 'compliance' | 'manager' | 'self';

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  status: EnrollmentStatus;
  required: boolean;
  source: AssignmentSource;
  assignedBy?: string;
  assignedAt: number;
  /** ISO date YYYY-MM-DD when required. */
  dueDate?: string;
  /** Linked HR Portal onboarding journey id when source === 'onboarding'. */
  journeyId?: string;
  note?: string;
  completedLessonIds: string[];
  /** lessonId -> chosen choiceId */
  scenarioAnswers: Record<string, string>;
  lastLessonId?: string;
  bestQuizScore?: number;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
  /** lessonId -> personal study note */
  notes: Record<string, string>;
}

export interface Certificate {
  id: string;
  credentialCode: string;
  verificationHash: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  track: AcademyTrack;
  score: number;
  xpEarned: number;
  skills: string[];
  issuedAt: number;
  expiresAt?: number;
  issuedBy: string;
}

export interface LearningPath {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  track: AcademyTrack;
  hue: number;
  badgeTitle: string;
  targetAudience: string;
  courseIds: string[];
}

/** Rule determining which courses auto-assign when a new hire's onboarding journey starts. */
export interface OnboardingRule {
  id: string;
  courseId: string;
  phase: OnboardingPhase;
  dueOffsetDays: number;
  /** Empty = all departments. */
  departments: Department[];
  /** Empty = all roles. */
  roleIds: string[];
  enabled: boolean;
  rationale: string;
}

export interface AcademyData {
  version: number;
  courses: Course[];
  paths: LearningPath[];
  enrollments: Enrollment[];
  certificates: Certificate[];
  rules: OnboardingRule[];
}
