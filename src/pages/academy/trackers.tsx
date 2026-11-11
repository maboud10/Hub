/**
 * Helix Academy journey trackers — every multi-step learning journey rendered
 * as a NEXUS `NeoTracker` ("pizza tracker"), derived from live Academy data:
 *
 *  - Course journey    Assigned / Enrolled → Lessons → Quiz → Certified
 *  - Learning path     one stage per course; the courier rides the live course
 *  - Recertification   Earned → Valid → Renewal window → Recertify
 *  - Onboarding        new-hire training milestones grouped by HR phase
 *
 * The derivations (`courseJourney`, `pathJourney`, `recertJourney`,
 * `onboardingJourney`) are pure; the components resolve people and the clock.
 *
 * i18n: NEXUS translates with a DOM-text dictionary, so static copy sits in its
 * own text node and dynamic values (names, counts, dates, titles) in their own
 * elements — e.g. `<b>{name}</b> assigned this`.
 */
import { useMemo, type ReactNode } from 'react';
import {
  Award,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Flag,
  Mail,
  Play,
  Rocket,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { enrollmentProgressPct, type EnrichedCourseItem } from '@/academy/selectors';
import { useAcademy } from '@/academy/store';
import type { AssignmentSource, Certificate, Course, Enrollment } from '@/academy/types';
import type { OnboardingPhase } from '@/talent/types';
import { useUserById } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { firstName, formatDate } from '@/lib/format';
import { cx } from '@/lib/cx';
import { FORMAT_ICON, formatMins, minutesLeft } from './shared';

const DAY = 86_400_000;
/** A credential's renewal window opens this many days before it expires. */
export const RENEWAL_WINDOW_DAYS = 30;
/** Courses with more lessons than this split the Lessons stage into sequential chunks. */
const MAX_SINGLE_LESSON_STAGE = 6;

export interface TrackerJourney {
  steps: NeoTrackStep[];
  current: number;
  state: NeoTrackState;
  /** 0..1 courier position inside the live stage. */
  progress: number;
}

const shortDate = (ts: number) => formatDate(ts, { day: 'numeric', month: 'short' });
const monthYear = (ts: number) => formatDate(ts, { month: 'short', year: 'numeric' });
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** ETA chip copy — mirrors `DuePill`: "Overdue by 2d" · "Due today" · "Due in 3d" · "Due Fri, Nov 13". */
function dueChip(dueDate: string, today: string): ReactNode {
  const days = daysBetween(today, dueDate);
  if (days < 0) {
    return (
      <>
        Overdue by <span>{Math.abs(days)}d</span>
      </>
    );
  }
  if (days === 0) return 'Due today';
  if (days <= 7) {
    return (
      <>
        Due in <span>{days}d</span>
      </>
    );
  }
  return (
    <>
      Due <span>{formatDay(dueDate)}</span>
    </>
  );
}

/* ==========================================================================
   Course journey
   ========================================================================== */

interface CourseStatus {
  lessonsDone: number;
  /** Assigned and untouched: no lesson, no quiz attempt yet. */
  notStarted: boolean;
  /** Every lesson done, took the quiz, never reached the pass mark. */
  quizBlocked: boolean;
}

function courseStatus(course: Course, e: Enrollment | undefined): CourseStatus {
  const done = new Set(e?.completedLessonIds ?? []);
  const lessonsDone = course.lessons.filter((l) => done.has(l.id)).length;
  return {
    lessonsDone,
    notStarted: !!e && e.status === 'assigned' && lessonsDone === 0 && e.attempts === 0,
    quizBlocked:
      !!e &&
      e.status !== 'completed' &&
      lessonsDone >= course.lessons.length &&
      course.quiz.length > 0 &&
      e.attempts > 0 &&
      (e.bestQuizScore ?? 0) < course.passScore,
  };
}

interface LessonChunk {
  from: number;
  to: number;
  ids: string[];
  mins: number;
}

/** One Lessons stage, or up to 4 sequential chunks for long courses (keeps trackers at 3–7 stages). */
function lessonChunks(course: Course): LessonChunk[] {
  const n = course.lessons.length;
  if (!n) return [];
  const count = n <= MAX_SINGLE_LESSON_STAGE ? 1 : Math.min(4, Math.ceil(n / 4));
  const size = Math.ceil(n / count);
  const out: LessonChunk[] = [];
  for (let i = 0; i < n; i += size) {
    const slice = course.lessons.slice(i, i + size);
    out.push({ from: i + 1, to: i + slice.length, ids: slice.map((l) => l.id), mins: slice.reduce((s, l) => s + l.durationMins, 0) });
  }
  return out;
}

const SOURCE_SUB: Record<AssignmentSource, string | undefined> = {
  onboarding: 'HR Onboarding',
  compliance: 'Compliance',
  manager: undefined,
  self: undefined,
};

const SOURCE_ICON: Record<AssignmentSource, ReactNode> = {
  onboarding: <Rocket />,
  compliance: <ShieldCheck />,
  manager: <UserCheck />,
  self: <Play />,
};

/**
 * Live stage of a course:
 *  enrol (not enrolled) · queued (assigned, untouched) · lessons · quiz ·
 *  certified (expired credential, or a quiz-less course) · complete.
 */
export type CourseStage = 'enrol' | 'queued' | 'lessons' | 'quiz' | 'certified' | 'complete';

export interface CourseJourney extends TrackerJourney {
  stage: CourseStage;
  title: string;
  message: ReactNode;
  eta?: ReactNode;
  /** First lesson still to do (powers "Resume" in the course player). */
  nextLessonId?: string;
}

export interface CourseJourneyInput {
  course: Course;
  enrollment?: Enrollment;
  certificate?: Certificate;
  /** Full names, resolved by the caller. */
  assignerName?: string;
  instructorName?: string;
  now?: number;
  /** Answers picked in the quiz attempt currently on screen (course player). */
  quizAnswered?: number;
  /** Score of a failed attempt currently on screen (course player). */
  lastAttemptScore?: number;
}

export function courseJourney(input: CourseJourneyInput): CourseJourney {
  const { course, enrollment: e, certificate: cert, quizAnswered = 0, lastAttemptScore } = input;
  const now = input.now ?? Date.now();
  const today = todayISO(now);
  const st = courseStatus(course, e);
  const done = new Set(e?.completedLessonIds ?? []);
  const chunks = lessonChunks(course);
  const hasQuiz = course.quiz.length > 0;
  const completed = e?.status === 'completed';
  const expiresAt = completed ? cert?.expiresAt : undefined;
  const expired = expiresAt !== undefined && expiresAt <= now;
  const openLessons = course.lessons.filter((l) => !done.has(l.id));
  const assigner = input.assignerName ? firstName(input.assignerName) : undefined;
  const instructor = input.instructorName ? firstName(input.instructorName) : undefined;

  // ---- live stage --------------------------------------------------------
  const quizIdx = 1 + chunks.length;
  const certIdx = quizIdx + (hasQuiz ? 1 : 0);
  const openChunk = completed ? -1 : chunks.findIndex((c) => c.ids.some((id) => !done.has(id)));

  let stage: CourseStage;
  let current: number;
  let state: NeoTrackState = 'active';
  let progress = 0;

  if (!e) {
    stage = 'enrol';
    current = 0;
    state = 'paused';
  } else if (completed) {
    stage = expired ? 'certified' : 'complete';
    current = expired ? certIdx : certIdx + 1;
    state = expired ? 'blocked' : 'done';
    progress = 1;
  } else if (openChunk >= 0) {
    const c = chunks[openChunk];
    const finished = c.ids.filter((id) => done.has(id)).length;
    // A scenario lab answered (but not yet optimally) earns half credit.
    const tried = c.ids.filter((id) => !done.has(id) && !!e.scenarioAnswers?.[id]).length;
    stage = st.notStarted ? 'queued' : 'lessons';
    current = 1 + openChunk;
    state = st.notStarted ? 'paused' : 'active';
    progress = (finished + tried * 0.5) / c.ids.length;
  } else if (hasQuiz) {
    stage = 'quiz';
    current = quizIdx;
    if (lastAttemptScore !== undefined) state = 'blocked';
    else if (quizAnswered > 0) progress = quizAnswered / course.quiz.length;
    else if (st.quizBlocked) state = 'blocked';
  } else {
    stage = 'certified';
    current = certIdx;
    state = 'paused';
  }

  // ---- stages ------------------------------------------------------------
  const steps: NeoTrackStep[] = [
    {
      id: 'start',
      label: !e ? 'Enrol' : e.source === 'self' && !e.assignedBy ? 'Enrolled' : 'Assigned',
      sub: e ? (assigner ?? SOURCE_SUB[e.source]) : undefined,
      at: e ? shortDate(e.assignedAt) : undefined,
      icon: e ? SOURCE_ICON[e.source] : <Play />,
    },
  ];

  chunks.forEach((c, i) => {
    const finished = c.ids.filter((id) => done.has(id)).length;
    const live = (stage === 'lessons' || stage === 'queued') && i === openChunk;
    const minsLeft = course.lessons
      .filter((l) => c.ids.includes(l.id) && !done.has(l.id))
      .reduce((s, l) => s + l.durationMins, 0);
    steps.push({
      id: `lessons-${c.from}`,
      label: 'Lessons',
      sub: chunks.length > 1 ? `${c.from}–${c.to}` : `${finished}/${c.ids.length}`,
      at: live ? `~${formatMins(minsLeft)}` : finished === 0 ? formatMins(c.mins) : undefined,
      icon: <BookOpen />,
    });
  });

  if (hasQuiz) {
    const attempted = !!e && e.attempts > 0 && e.bestQuizScore !== undefined;
    steps.push({
      id: 'quiz',
      label: 'Quiz',
      sub: attempted ? (
        <>
          Best <b>{e?.bestQuizScore}%</b>
        </>
      ) : (
        <>
          Pass <b>{course.passScore}%</b>
        </>
      ),
      at: stage === 'quiz' && state === 'active' && quizAnswered > 0 ? `${quizAnswered}/${course.quiz.length}` : undefined,
      icon: <ClipboardCheck />,
    });
  }

  steps.push({
    id: 'cert',
    label: 'Certified',
    sub: expired ? 'Expired' : <>+{course.xp} XP</>,
    at: completed && cert ? shortDate(expired && expiresAt !== undefined ? expiresAt : cert.issuedAt) : undefined,
    icon: <Award />,
  });

  // ---- copy ----------------------------------------------------------------
  const dueIn = e?.dueDate && !completed ? daysBetween(today, e.dueDate) : null;
  let title: string;
  let message: ReactNode;

  switch (stage) {
    case 'enrol':
      title = 'Your route to the credential';
      message = instructor ? (
        <>
          <b>{instructor}</b> is your instructor — enrol to unlock the first lesson
        </>
      ) : (
        'Enrol to unlock the first lesson'
      );
      break;
    case 'queued': {
      const lead = assigner ? (
        <>
          <b>{assigner}</b> assigned this
        </>
      ) : e?.source === 'onboarding' ? (
        'Part of your onboarding plan'
      ) : e?.source === 'compliance' ? (
        'Required compliance training'
      ) : (
        'Queued up'
      );
      const tail =
        dueIn !== null && dueIn < 0
          ? '— it’s overdue, let’s get rolling'
          : dueIn !== null && dueIn <= 3
            ? '— due soon, let’s get rolling'
            : '— dive in whenever you’re ready';
      title = 'Ready when you are';
      message = (
        <>
          {lead} {tail}
        </>
      );
      break;
    }
    case 'lessons': {
      const next = openLessons[0];
      title = 'Learning in progress';
      message =
        openLessons.length > 1 ? (
          <>
            <b>{openLessons.length}</b> lessons to go — next up: <b>‘{next.title}’</b>
          </>
        ) : hasQuiz ? (
          <>
            Last lesson — the quiz unlocks after <b>‘{next.title}’</b>
          </>
        ) : (
          <>
            Last lesson to go: <b>‘{next.title}’</b>
          </>
        );
      break;
    }
    case 'quiz':
      if (state === 'blocked') {
        title = 'Not there yet';
        message = (
          <>
            Scored <b>{lastAttemptScore ?? e?.bestQuizScore ?? 0}%</b> — you need <b>{course.passScore}%</b> to earn the credential. One more
            try?
          </>
        );
      } else if (quizAnswered > 0) {
        title = 'Quiz in progress';
        message =
          quizAnswered >= course.quiz.length ? (
            'All answered — submit to see your score'
          ) : (
            <>
              <b>
                {quizAnswered}/{course.quiz.length}
              </b>{' '}
              answered — keep going!
            </>
          );
      } else {
        title = 'Quiz unlocked';
        message = (
          <>
            All lessons done — score <b>{course.passScore}%</b> to earn your credential
          </>
        );
      }
      break;
    case 'complete':
      title = 'Credential earned';
      message =
        expiresAt === undefined ? (
          'Certified! Skills endorsed on your NEXUS profile'
        ) : expiresAt - now <= RENEWAL_WINDOW_DAYS * DAY ? (
          <>
            Renewal window is open — recertify by <b>{shortDate(expiresAt)}</b>
          </>
        ) : (
          <>
            Certified! Recertify by <b>{monthYear(expiresAt)}</b>
          </>
        );
      break;
    default:
      // 'certified': the credential expired — or a course without a quiz has no lessons left.
      if (expired && expiresAt !== undefined) {
        title = 'Credential expired';
        message = (
          <>
            Credential expired on <b>{shortDate(expiresAt)}</b> — retake the quiz to recertify
          </>
        );
      } else {
        title = 'All lessons done';
        message = 'Nice work — every lesson is complete';
      }
  }

  let eta: ReactNode;
  if (completed) {
    if (expiresAt !== undefined) {
      eta = expired ? (
        <>
          Expired <span>{shortDate(expiresAt)}</span>
        </>
      ) : (
        <>
          Valid thru <span>{formatDate(expiresAt)}</span>
        </>
      );
    }
  } else if (e?.dueDate) {
    eta = dueChip(e.dueDate, today);
  } else if (e) {
    eta = (
      <>
        <span>~{formatMins(minutesLeft(course, enrollmentProgressPct(course, e)))}</span> left
      </>
    );
  }

  return {
    steps,
    current,
    state,
    progress: clamp01(progress),
    stage,
    title,
    message,
    eta,
    nextLessonId: openLessons[0]?.id,
  };
}

interface CourseTrackerBase {
  course: Course;
  enrollment?: Enrollment;
  /** Defaults to the enrolled learner's certificate for the course. */
  certificate?: Certificate;
}

interface QuizLive {
  quizAnswered?: number;
  lastAttemptScore?: number;
}

/** Course journey with the assigner / instructor resolved and a minute clock (expiry, due dates). */
export function useCourseJourney({ course, enrollment, certificate, quizAnswered, lastAttemptScore }: CourseTrackerBase & QuizLive): CourseJourney {
  const assignerName = useUserById(enrollment?.assignedBy)?.name;
  const instructorName = useUserById(course.instructorId)?.name;
  const storedCert = useAcademy((s) =>
    certificate || !enrollment ? undefined : s.certificates.find((c) => c.userId === enrollment.userId && c.courseId === course.id),
  );
  const now = useNow(60_000);
  const cert = certificate ?? storedCert;
  return useMemo(
    () => courseJourney({ course, enrollment, certificate: cert, assignerName, instructorName, now, quizAnswered, lastAttemptScore }),
    [course, enrollment, cert, assignerName, instructorName, now, quizAnswered, lastAttemptScore],
  );
}

/** Full course tracker card (course player). `actions` gets the derived journey for contextual CTAs. */
export function CourseTracker({
  actions,
  className,
  ...input
}: CourseTrackerBase & QuizLive & { actions?: (journey: CourseJourney) => ReactNode; className?: string }) {
  const j = useCourseJourney(input);
  return (
    <NeoTracker
      className={cx('ac-trk', className)}
      hud="Course tracker"
      title={j.title}
      steps={j.steps}
      current={j.current}
      state={j.state}
      progress={j.progress}
      eta={j.eta}
      message={<span className="ac-trk-msg">{j.message}</span>}
      actions={actions?.(j)}
    />
  );
}

/** Slim course tracker for rows and cards; `status` adds the live status line underneath. */
export function CourseTrackerCompact({ status, className, ...input }: CourseTrackerBase & { status?: boolean; className?: string }) {
  const j = useCourseJourney(input);
  const bar = (
    <NeoTracker
      compact
      className={status ? undefined : className}
      label={input.course.title}
      steps={j.steps}
      current={j.current}
      state={j.state}
      progress={j.progress}
    />
  );
  if (!status) return bar;
  return (
    <div className={cx('ac-trk-row', className)}>
      {bar}
      <p className="ac-trk-line" data-state={j.state}>
        {j.message}
      </p>
    </div>
  );
}

/* ==========================================================================
   Learning path journey — one stage per course
   ========================================================================== */

export function pathJourney(items: EnrichedCourseItem[]): TrackerJourney {
  const steps: NeoTrackStep[] = items.map(({ course }) => {
    const Icon = FORMAT_ICON[course.format];
    return { id: course.id, label: course.title, icon: <Icon /> };
  });
  const idx = items.findIndex((x) => x.enrollment?.status !== 'completed');
  if (idx < 0) return { steps, current: steps.length, state: 'done', progress: 1 };
  const live = items[idx];
  const st = courseStatus(live.course, live.enrollment);
  return {
    steps,
    current: idx,
    state: !live.enrollment || st.notStarted ? 'paused' : st.quizBlocked ? 'blocked' : 'active',
    progress: clamp01(live.progressPct / 100),
  };
}

export function PathTrackerCompact({ items, label, className }: { items: EnrichedCourseItem[]; label?: string; className?: string }) {
  const j = useMemo(() => pathJourney(items), [items]);
  if (!j.steps.length) return null;
  return (
    <NeoTracker compact className={className} label={label} steps={j.steps} current={j.current} state={j.state} progress={j.progress} />
  );
}

/* ==========================================================================
   Recertification journey — Earned → Valid → Renewal window → Recertify
   ========================================================================== */

export type RecertPhase = 'valid' | 'window' | 'expired';

export interface RecertJourney extends TrackerJourney {
  phase: RecertPhase;
  message: ReactNode;
  eta: ReactNode;
}

/** `null` for credentials that never expire. */
export function recertJourney(cert: Certificate, now: number): RecertJourney | null {
  const exp = cert.expiresAt;
  if (!exp) return null;
  const windowStart = Math.max(cert.issuedAt + (exp - cert.issuedAt) / 2, exp - RENEWAL_WINDOW_DAYS * DAY);
  const phase: RecertPhase = now >= exp ? 'expired' : now >= windowStart ? 'window' : 'valid';
  const daysLeft = Math.max(0, Math.ceil((exp - now) / DAY));
  const left = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;

  const steps: NeoTrackStep[] = [
    { id: 'earned', label: 'Earned', sub: `${cert.score}%`, at: shortDate(cert.issuedAt), icon: <Award /> },
    { id: 'valid', label: 'Valid', sub: phase === 'valid' ? left : undefined, icon: <ShieldCheck /> },
    { id: 'window', label: 'Renewal window', sub: phase === 'window' ? left : undefined, at: shortDate(windowStart), icon: <CalendarClock /> },
    { id: 'recertify', label: 'Recertify', sub: phase === 'expired' ? 'Expired' : undefined, at: shortDate(exp), icon: <RotateCcw /> },
  ];

  if (phase === 'expired') {
    return {
      steps,
      current: 3,
      state: 'blocked',
      progress: 1,
      phase,
      message: (
        <>
          Credential expired on <b>{shortDate(exp)}</b> — retake the quiz to recertify
        </>
      ),
      eta: (
        <>
          Expired <span>{shortDate(exp)}</span>
        </>
      ),
    };
  }

  const eta = (
    <>
      Valid thru <span>{formatDate(exp)}</span>
    </>
  );
  if (phase === 'window') {
    return {
      steps,
      current: 2,
      state: 'active',
      progress: clamp01((now - windowStart) / (exp - windowStart)),
      phase,
      message: (
        <>
          Renewal window is open — recertify by <b>{shortDate(exp)}</b>
        </>
      ),
      eta,
    };
  }
  return {
    steps,
    current: 1,
    state: 'active',
    progress: clamp01((now - cert.issuedAt) / (windowStart - cert.issuedAt)),
    phase,
    message: (
      <>
        Certified! Recertify by <b>{monthYear(exp)}</b>
      </>
    ),
    eta,
  };
}

export function RecertTracker({
  certificate,
  now,
  compact,
  actions,
  className,
}: {
  certificate: Certificate;
  now: number;
  compact?: boolean;
  actions?: (journey: RecertJourney) => ReactNode;
  className?: string;
}) {
  const j = useMemo(() => recertJourney(certificate, now), [certificate, now]);
  if (!j) return null;
  if (compact) {
    return (
      <NeoTracker
        compact
        className={className}
        label={certificate.courseTitle}
        steps={j.steps}
        current={j.current}
        state={j.state}
        progress={j.progress}
      />
    );
  }
  return (
    <NeoTracker
      className={cx('ac-trk', className)}
      hud="Recertification tracker"
      title={certificate.courseTitle}
      steps={j.steps}
      current={j.current}
      state={j.state}
      progress={j.progress}
      eta={j.eta}
      message={<span className="ac-trk-msg">{j.message}</span>}
      actions={actions?.(j)}
    />
  );
}

/* ==========================================================================
   New-hire onboarding journey — training milestones grouped by HR phase
   ========================================================================== */

export const ONBOARDING_PHASE_LABEL: Record<OnboardingPhase, string> = {
  'pre-boarding': 'Pre-boarding',
  'day-1': 'Day 1',
  'week-1': 'Week 1',
  'day-30': 'Day 30',
  'day-60': 'Day 60',
  'day-90': 'Day 90',
};

const PHASE_ORDER = Object.keys(ONBOARDING_PHASE_LABEL) as OnboardingPhase[];

/** Sort key for onboarding phases (pre-boarding → day-90). */
export const onboardingPhaseRank = (phase: OnboardingPhase): number => PHASE_ORDER.indexOf(phase);

const PHASE_ICON: Record<OnboardingPhase, ReactNode> = {
  'pre-boarding': <Mail />,
  'day-1': <Rocket />,
  'week-1': <CalendarDays />,
  'day-30': <Flag />,
  'day-60': <Flag />,
  'day-90': <Award />,
};

export interface OnboardingMilestone {
  id: string;
  phaseKey: OnboardingPhase;
  title: string;
  courseId: string;
  done: boolean;
  item?: EnrichedCourseItem;
  /** ISO date. */
  dueDate?: string;
}

export interface OnboardingJourneyResult extends TrackerJourney {
  /** The milestone to act on next (a failed quiz first, then the soonest due). */
  focus?: OnboardingMilestone;
  blocked: boolean;
}

export function onboardingJourney(milestones: OnboardingMilestone[], today = todayISO()): OnboardingJourneyResult {
  const groups = PHASE_ORDER.map((phase) => ({ phase, items: milestones.filter((m) => m.phaseKey === phase) })).filter(
    (g) => g.items.length > 0,
  );
  const steps: NeoTrackStep[] = groups.map(({ phase, items }) => {
    const dues = items
      .map((m) => m.dueDate)
      .filter((d): d is string => !!d)
      .sort();
    return {
      id: phase,
      label: ONBOARDING_PHASE_LABEL[phase],
      sub: `${items.filter((m) => m.done).length}/${items.length}`,
      at: dues.length ? formatDay(dues[dues.length - 1], { day: 'numeric', month: 'short' }) : undefined,
      icon: PHASE_ICON[phase],
    };
  });

  const idx = groups.findIndex((g) => g.items.some((m) => !m.done));
  if (idx < 0) return { steps, current: steps.length, state: 'done', progress: 1, blocked: false };

  const { items } = groups[idx];
  const open = items.filter((m) => !m.done);
  const statusOf = (m: OnboardingMilestone) => (m.item ? courseStatus(m.item.course, m.item.enrollment) : undefined);
  const stuck = open.find((m) => statusOf(m)?.quizBlocked);
  const dueRank = (m: OnboardingMilestone) => (m.dueDate ? daysBetween(today, m.dueDate) : Number.POSITIVE_INFINITY);
  const next = [...open].sort((a, b) => dueRank(a) - dueRank(b) || (b.item?.progressPct ?? 0) - (a.item?.progressPct ?? 0))[0];
  const idle = open.every((m) => !m.item?.enrollment || statusOf(m)?.notStarted);

  return {
    steps,
    current: idx,
    state: stuck ? 'blocked' : idle ? 'paused' : 'active',
    progress: clamp01(items.reduce((s, m) => s + (m.done ? 1 : (m.item?.progressPct ?? 0) / 100), 0) / items.length),
    focus: stuck ?? next,
    blocked: !!stuck,
  };
}

/**
 * Bare onboarding tracker for the "New-hire onboarding bridge" panel. Names
 * whoever gets pinged when the next course is passed: the assigner, else the
 * learner's manager (mirrors the store's completion notifications).
 */
export function OnboardingTracker({
  milestones,
  managerId,
  viewerId,
  className,
}: {
  milestones: OnboardingMilestone[];
  managerId?: string;
  viewerId?: string;
  className?: string;
}) {
  const now = useNow(60_000);
  const today = todayISO(now);
  const j = useMemo(() => onboardingJourney(milestones, today), [milestones, today]);
  const assignedBy = j.focus?.item?.enrollment?.assignedBy;
  const ping = useUserById(assignedBy && assignedBy !== viewerId ? assignedBy : managerId);
  if (!j.steps.length) return null;

  const focus = j.focus;
  const message = !focus ? (
    'Onboarding training complete — welcome aboard!'
  ) : j.blocked ? (
    <>
      <b>{focus.title}</b> needs another quiz attempt
    </>
  ) : ping ? (
    <>
      <b>{focus.title}</b> is next — <b>{firstName(ping.name)}</b> gets a ping the moment you pass
    </>
  ) : (
    <>
      <b>{focus.title}</b> is next — every pass ticks off your HR checklist
    </>
  );

  return (
    <NeoTracker
      bare
      className={cx('ac-onb-trk', className)}
      label="Onboarding tracker"
      steps={j.steps}
      current={j.current}
      state={j.state}
      progress={j.progress}
      eta={focus?.dueDate ? dueChip(focus.dueDate, today) : undefined}
      message={<span className="ac-trk-msg">{message}</span>}
    />
  );
}
