import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SEED_COURSES } from '@/academy/seed';
import { computeUserCourses } from '@/academy/selectors';
import type { Certificate, Course, Enrollment } from '@/academy/types';
import {
  CourseTracker,
  CourseTrackerCompact,
  RecertTracker,
  courseJourney,
  onboardingJourney,
  pathJourney,
  recertJourney,
} from './trackers';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 10, 12).getTime();
const course = SEED_COURSES.find((c) => c.id === 'c-ai-101')!;
const lessonIds = course.lessons.map((l) => l.id);
// Stages: Assigned · Lessons · Quiz · Certified
const LESSONS = 1;
const QUIZ = 2;
const CERT = 3;

const enrollment = (patch: Partial<Enrollment> = {}): Enrollment => ({
  id: 'enr-test',
  userId: 'u-test',
  courseId: course.id,
  status: 'in-progress',
  required: true,
  source: 'manager',
  assignedBy: 'u-omar',
  assignedAt: NOW - 3 * DAY,
  completedLessonIds: [],
  scenarioAnswers: {},
  attempts: 0,
  notes: {},
  ...patch,
});

const certificate = (patch: Partial<Certificate> = {}): Certificate => ({
  id: 'cert-test',
  credentialCode: 'HX-CERT-2026-TEST01',
  verificationHash: 'ABCD-1234',
  userId: 'u-test',
  courseId: course.id,
  courseTitle: course.title,
  track: course.track,
  score: 92,
  xpEarned: course.xp,
  skills: course.skills,
  issuedAt: NOW - 100 * DAY,
  expiresAt: NOW + 265 * DAY,
  issuedBy: 'Helix Academy',
  ...patch,
});

describe('Academy course journey tracker', () => {
  it('previews the route, paused, before enrolment', () => {
    const j = courseJourney({ course, now: NOW });
    expect(j.steps.map((s) => s.label)).toEqual(['Enrol', 'Lessons', 'Quiz', 'Certified']);
    expect([j.stage, j.current, j.state]).toEqual(['enrol', 0, 'paused']);
  });

  it('pauses on Lessons while an assignment is untouched, naming the assigner', () => {
    const j = courseJourney({ course, enrollment: enrollment({ status: 'assigned' }), assignerName: 'Omar Khalid', now: NOW });
    expect([j.stage, j.current, j.state]).toEqual(['queued', LESSONS, 'paused']);
    expect(j.steps[0]).toMatchObject({ label: 'Assigned', sub: 'Omar' });
  });

  it('moves the courier with the share of lessons done (half credit for a tried lab)', () => {
    const lab = course.lessons.find((l) => l.kind === 'scenario')!;
    expect(lab.id).not.toBe(lessonIds[0]);
    const j = courseJourney({
      course,
      enrollment: enrollment({ completedLessonIds: [lessonIds[0]], scenarioAnswers: { [lab.id]: 'any' } }),
      now: NOW,
    });
    expect([j.stage, j.current, j.state]).toEqual(['lessons', LESSONS, 'active']);
    expect(j.progress).toBeCloseTo(1.5 / course.lessons.length);
    expect(j.nextLessonId).toBe(lessonIds[1]);
  });

  it('flags a quiz attempt below the pass mark as blocked', () => {
    const j = courseJourney({
      course,
      enrollment: enrollment({ completedLessonIds: lessonIds, attempts: 1, bestQuizScore: course.passScore - 20 }),
      now: NOW,
    });
    expect([j.stage, j.current, j.state]).toEqual(['quiz', QUIZ, 'blocked']);
  });

  it('follows live answers in the quiz; a failed result on screen stays blocked', () => {
    const e = enrollment({ completedLessonIds: lessonIds });
    const live = courseJourney({ course, enrollment: e, quizAnswered: 1, now: NOW });
    expect([live.stage, live.state]).toEqual(['quiz', 'active']);
    expect(live.progress).toBeCloseTo(1 / course.quiz.length);
    const failed = courseJourney({ course, enrollment: e, quizAnswered: course.quiz.length, lastAttemptScore: 40, now: NOW });
    expect(failed.state).toBe('blocked');
  });

  it('completes when certified and blocks once the credential has expired', () => {
    const e = enrollment({ status: 'completed', completedLessonIds: lessonIds, attempts: 1, bestQuizScore: 100, completedAt: NOW - 100 * DAY });
    const valid = courseJourney({ course, enrollment: e, certificate: certificate(), now: NOW });
    expect([valid.stage, valid.current, valid.state]).toEqual(['complete', valid.steps.length, 'done']);
    const lapsed = courseJourney({ course, enrollment: e, certificate: certificate({ expiresAt: NOW - DAY }), now: NOW });
    expect([lapsed.stage, lapsed.current, lapsed.state]).toEqual(['certified', CERT, 'blocked']);
  });

  it('chunks long courses so the tracker stays within 7 stages', () => {
    const long: Course = { ...course, lessons: Array.from({ length: 10 }, (_, i) => ({ ...course.lessons[0], id: `l-${i}` })) };
    const j = courseJourney({ course: long, enrollment: enrollment({ completedLessonIds: ['l-0', 'l-1', 'l-2', 'l-3', 'l-4'] }), now: NOW });
    expect(j.steps.filter((s) => s.label === 'Lessons')).toHaveLength(3);
    expect(j.steps.length).toBeLessThanOrEqual(7);
    expect([j.current, j.state]).toEqual([2, 'active']);
    expect(j.progress).toBeCloseTo(0.25);
  });
});

describe('Academy learning path tracker', () => {
  const ids = ['c-ai-privacy', 'c-ai-101', 'c-ai-eng'];
  const courses = SEED_COURSES.filter((c) => ids.includes(c.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const privacy = courses[0];

  it('rides the first unfinished course with its progress', () => {
    const items = computeUserCourses('u-test', courses, [
      enrollment({ id: 'e1', courseId: privacy.id, status: 'completed', completedLessonIds: privacy.lessons.map((l) => l.id) }),
      enrollment({ id: 'e2', courseId: course.id, completedLessonIds: [lessonIds[0]] }),
    ]);
    const j = pathJourney(items);
    expect(j.steps.map((s) => s.id)).toEqual(ids);
    expect([j.current, j.state]).toEqual([1, 'active']);
    expect(j.progress).toBeCloseTo(items[1].progressPct / 100);
  });

  it('pauses on a course not started yet and completes when all are certified', () => {
    const paused = pathJourney(computeUserCourses('u-test', courses, []));
    expect([paused.current, paused.state]).toEqual([0, 'paused']);
    const done = pathJourney(
      computeUserCourses(
        'u-test',
        courses,
        courses.map((c, i) => enrollment({ id: `e${i}`, courseId: c.id, status: 'completed', completedLessonIds: c.lessons.map((l) => l.id) })),
      ),
    );
    expect([done.current, done.state]).toEqual([3, 'done']);
  });
});

describe('Academy recertification tracker', () => {
  it('walks Earned → Valid → Renewal window → Recertify', () => {
    const cert = certificate();
    const exp = cert.expiresAt!;
    expect(recertJourney(cert, NOW)).toMatchObject({ phase: 'valid', current: 1, state: 'active' });
    expect(recertJourney(cert, exp - 5 * DAY)).toMatchObject({ phase: 'window', current: 2, state: 'active' });
    expect(recertJourney(cert, exp + DAY)).toMatchObject({ phase: 'expired', current: 3, state: 'blocked' });
    expect(recertJourney(certificate({ expiresAt: undefined }), NOW)).toBeNull();
  });
});

describe('Academy onboarding tracker', () => {
  it('groups milestones by HR phase and stops at the first phase with open training', () => {
    const j = onboardingJourney(
      [
        { id: 'a', phaseKey: 'week-1', title: 'Privacy', courseId: 'c2', done: false, dueDate: '2026-11-12' },
        { id: 'b', phaseKey: 'day-1', title: 'Security', courseId: 'c1', done: true },
        { id: 'c', phaseKey: 'week-1', title: 'Culture', courseId: 'c3', done: true },
        { id: 'd', phaseKey: 'day-30', title: 'AI', courseId: 'c4', done: false },
      ],
      '2026-11-10',
    );
    expect(j.steps.map((s) => s.label)).toEqual(['Day 1', 'Week 1', 'Day 30']);
    expect([j.current, j.state]).toEqual([1, 'paused']);
    expect(j.focus?.id).toBe('a');
    expect(j.progress).toBeCloseTo(0.5);
  });
});

describe('Academy tracker rendering', () => {
  it('renders the course tracker with names kept apart from static copy', () => {
    const html = renderToStaticMarkup(createElement(CourseTracker, { course, enrollment: enrollment({ status: 'assigned' }) }));
    expect(html).toContain('Course tracker');
    expect(html).toContain('Ready when you are');
    expect(html).toContain('<b>Omar</b> assigned this');
    expect(html).toContain('Stage 2 of 4');
  });

  it('renders a compact row tracker with a blocked status line', () => {
    const html = renderToStaticMarkup(
      createElement(CourseTrackerCompact, {
        course,
        enrollment: enrollment({ completedLessonIds: lessonIds, attempts: 2, bestQuizScore: 50 }),
        status: true,
      }),
    );
    expect(html).toContain('neo-tracker--compact');
    expect(html).toContain('data-state="blocked"');
    expect(html).toContain('to earn the credential. One more try?');
  });

  it('renders the recertification tracker', () => {
    const html = renderToStaticMarkup(createElement(RecertTracker, { certificate: certificate(), now: NOW }));
    expect(html).toContain('Recertification tracker');
    expect(html).toContain('Certified! Recertify by');
    expect(html).toContain('Renewal window');
  });
});
