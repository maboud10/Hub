import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import { useTalent } from '@/talent/store';
import { useHr } from '@/hr/store';
import { effectivePermissions } from '@/lib/rbac';
import * as access from './access';
import { useAcademy } from './store';
import { computeTeamCompliance, computeUserCourses } from './selectors';

const as = (userId: string) => useHub.setState({ sessionUserId: userId });

const viewerOf = (userId: string): access.AcademyViewer => {
  const h = useHub.getState();
  const u = h.users.find((x) => x.id === userId)!;
  return { userId, perms: effectivePermissions(u, h.roles) };
};

describe('Helix Academy engine & HR Onboarding bidirectional sync', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    useTalent.getState().resetTalentDemo();
    useHr.getState().resetHrDemo();
    useAcademy.getState().resetAcademyDemo();
  });

  it('denies contractors (u-alex) without app:learning from enrolling or taking quizzes', () => {
    expect(access.canUseAcademy(viewerOf('u-alex'))).toBe(false);
    as('u-alex');
    const res = useAcademy.getState().enrol('c-sec-101');
    expect(res.ok).toBe(false);
  });

  it('mints a verifiable certificate, adds profile skills, and auto-completes the linked HR Onboarding task when Kwame passes c-ai-101', () => {
    as('u-kwame');
    const course = useAcademy.getState().courses.find((c) => c.id === 'c-ai-101')!;
    const beforeJourney = useTalent.getState().onboarding.find((j) => j.id === 'j-2')!;
    const beforeTask = beforeJourney.tasks.find((t) => t.courseId === 'c-ai-101')!;
    expect(beforeTask.done).toBe(false);

    for (const lesson of course.lessons) {
      useAcademy.getState().completeLesson('c-ai-101', lesson.id);
    }

    const correctAnswers = course.quiz.map((q) => q.correctIndex);
    const quizRes = useAcademy.getState().submitQuiz('c-ai-101', correctAnswers);

    expect(quizRes.ok).toBe(true);
    expect(quizRes.passed).toBe(true);
    expect(quizRes.score).toBe(100);
    expect(quizRes.certificateId).toBeTruthy();
    expect(quizRes.syncedOnboarding?.journeyId).toBe('j-2');

    // Onboarding task in HR Portal is now automatically checked off!
    const afterJourney = useTalent.getState().onboarding.find((j) => j.id === 'j-2')!;
    const afterTask = afterJourney.tasks.find((t) => t.courseId === 'c-ai-101')!;
    expect(afterTask.done).toBe(true);
    expect(afterTask.doneBy).toBe('u-kwame');

    // Certificate issued & skills endorsed on NEXUS profile
    const cert = useAcademy.getState().certificates.find((c) => c.id === quizRes.certificateId);
    expect(cert?.credentialCode).toMatch(/^HX-/);
    const kwame = useHub.getState().users.find((u) => u.id === 'u-kwame')!;
    expect(kwame.skills).toEqual(expect.arrayContaining(course.skills.slice(0, 1)));
  });

  it('auto-enrols required role-based Academy courses when People Ops provisions a new hire NEXUS account (Salma j-1)', async () => {
    as('u-sara');
    const prov = useTalent.getState().provisionHubAccount('j-1');
    expect(prov.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 25));
    const salmaId = useTalent.getState().onboarding.find((j) => j.id === 'j-1')?.hubUserId;
    expect(salmaId).toBeTruthy();

    const salmaEnrollments = useAcademy
      .getState()
      .enrollments.filter((e) => e.userId === salmaId && e.source === 'onboarding');

    expect(salmaEnrollments.length).toBeGreaterThanOrEqual(4);
    const courseIds = salmaEnrollments.map((e) => e.courseId);
    expect(courseIds).toEqual(expect.arrayContaining(['c-sec-101', 'c-ai-privacy', 'c-culture-101', 'c-ai-101']));
  });

  it('scopes manager course assignments to direct reports while allowing People Ops company-wide management', () => {
    as('u-omar');
    // Omar manages u-kwame, not u-daniel
    const okTeam = useAcademy.getState().assignCourse({
      userIds: ['u-kwame'],
      courseId: 'c-ai-eng',
      required: true,
      note: 'Great prep for our Q4 RAG service sprint',
    });
    expect(okTeam.ok).toBe(true);

    const deniedCrossTeam = useAcademy.getState().assignCourse({
      userIds: ['u-daniel'],
      courseId: 'c-ai-eng',
      required: true,
    });
    expect(deniedCrossTeam.ok).toBe(false);

    // Team compliance view for Omar shows only his direct reports
    const h = useHub.getState();
    const a = useAcademy.getState();
    const omarRows = computeTeamCompliance(viewerOf('u-omar'), h.users, a.courses, a.enrollments, a.certificates, 'company');
    expect(omarRows.every((r) => r.user.managerId === 'u-omar')).toBe(true);

    // People Ops (u-sara) sees company-wide compliance & can author a new course
    as('u-sara');
    const saraRows = computeTeamCompliance(viewerOf('u-sara'), h.users, a.courses, a.enrollments, a.certificates, 'company');
    expect(saraRows.length).toBeGreaterThan(omarRows.length);

    const created = useAcademy.getState().createCourse({
      title: 'Global Export Controls 101',
      tagline: 'Cross-border SaaS compliance essentials',
      description: 'Understand embargoed jurisdictions and export screening.',
      track: 'security',
      level: 'foundations',
      format: 'interactive',
      durationMins: 15,
      skills: ['Export Compliance'],
      mandatory: true,
      companionSlugs: ['benefits-and-time-off-guide'],
      lessonTitle: 'Sanctions & Travel Guardrails',
      lessonSummary: 'Why WFA travel excludes embargoed territories.',
      lessonBody: 'Always verify destination clearance before travelling with a Helix workstation.',
      quizPrompt: 'Can you work remotely from an embargoed jurisdiction on a Helix laptop?',
      quizOptions: ['Yes, for under 5 days', 'No — strictly prohibited without exception', 'Only on cellular hotspot'],
      quizCorrectIndex: 1,
      quizExplanation: 'Helix zero-trust blocks connections from embargoed jurisdictions.',
    });
    expect(created.ok).toBe(true);
    const items = computeUserCourses('u-kwame', useAcademy.getState().courses, useAcademy.getState().enrollments);
    expect(items.some((x) => x.course.id === created.courseId)).toBe(true);
  });
});
