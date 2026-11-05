/**
 * Memoised selectors & pure analytics helpers for Helix Academy.
 */
import { useMemo } from 'react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { daysBetween, todayISO } from '@/hr/calendar';
import { isEmployee } from '@/hr/seed';
import * as access from './access';
import { learnerRank, SKILL_RADAR_DOMAINS } from './constants';
import { useAcademy } from './store';
import type { AcademyTrack, Certificate, Course, Enrollment, LearningPath } from './types';

export function useAcademyViewer(): access.AcademyViewer | null {
  const user = useSessionUser();
  const perms = usePermissions();
  return useMemo(() => (user ? { userId: user.id, perms } : null), [user, perms]);
}

export interface AcademyCaps {
  canUse: boolean;
  manage: boolean;
  manager: boolean;
  reportIds: string[];
}

export function useAcademyCaps(): AcademyCaps {
  const v = useAcademyViewer();
  const users = useHub((s) => s.users);
  return useMemo(() => {
    if (!v) return { canUse: false, manage: false, manager: false, reportIds: [] };
    const reportIds = users.filter((u) => u.active && u.managerId === v.userId && isEmployee(u)).map((u) => u.id);
    return {
      canUse: access.canUseAcademy(v),
      manage: access.canManageAcademy(v),
      manager: reportIds.length > 0,
      reportIds,
    };
  }, [v, users]);
}

export function enrollmentProgressPct(course: Course | undefined, enrollment: Enrollment | undefined): number {
  if (!course || !enrollment) return 0;
  if (enrollment.status === 'completed') return 100;
  const totalSteps = course.lessons.length + (course.quiz.length > 0 ? 1 : 0);
  if (!totalSteps) return 0;
  return Math.min(95, Math.round((enrollment.completedLessonIds.length / totalSteps) * 100));
}

export interface EnrichedCourseItem {
  course: Course;
  enrollment?: Enrollment;
  progressPct: number;
  daysUntilDue: number | null;
  overdue: boolean;
  dueSoon: boolean;
}

export function computeUserCourses(
  userId: string,
  courses: Course[],
  enrollments: Enrollment[],
  today = todayISO(),
): EnrichedCourseItem[] {
  const byCourse = new Map(enrollments.filter((e) => e.userId === userId).map((e) => [e.courseId, e]));
  return courses.map((course) => {
    const enrollment = byCourse.get(course.id);
    const progressPct = enrollmentProgressPct(course, enrollment);
    const daysUntilDue =
      enrollment && enrollment.status !== 'completed' && enrollment.dueDate
        ? daysBetween(today, enrollment.dueDate)
        : null;
    const overdue = daysUntilDue !== null && daysUntilDue < 0;
    const dueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7;
    return { course, enrollment, progressPct, daysUntilDue, overdue, dueSoon };
  });
}

export function useMyLearning() {
  const me = useSessionUser();
  const courses = useAcademy((s) => s.courses);
  const enrollments = useAcademy((s) => s.enrollments);
  const certificates = useAcademy((s) => s.certificates);
  const paths = useAcademy((s) => s.paths);

  return useMemo(() => {
    const uid = me?.id ?? '';
    const today = todayISO();
    const all = uid ? computeUserCourses(uid, courses, enrollments, today) : [];
    const myCerts = certificates.filter((c) => c.userId === uid).sort((a, b) => b.issuedAt - a.issuedAt);
    const totalXp = myCerts.reduce((sum, c) => sum + c.xpEarned, 0) +
      all
        .filter((x) => x.enrollment && x.enrollment.status !== 'completed')
        .reduce((sum, x) => sum + x.enrollment!.completedLessonIds.length * 25, 0);
    const rank = learnerRank(totalXp);
    const completedMins = all
      .filter((x) => x.enrollment?.status === 'completed')
      .reduce((sum, x) => sum + x.course.durationMins, 0);

    const active = all
      .filter((x) => x.enrollment && x.enrollment.status !== 'completed')
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          Number(!!b.enrollment?.required) - Number(!!a.enrollment?.required) ||
          (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999),
      );
    const requiredOpen = active.filter((x) => x.enrollment?.required);
    const completed = all.filter((x) => x.enrollment?.status === 'completed');

    // Skill radar 0–100 per track
    const radar = SKILL_RADAR_DOMAINS.map((d) => {
      const trackCourses = all.filter((x) => x.course.track === d.id);
      const earned = trackCourses.reduce((acc, x) => acc + x.progressPct, 0);
      const max = Math.max(100, trackCourses.length * 100);
      return {
        ...d,
        value: Math.min(100, Math.round((earned / max) * 100) + (trackCourses.some((x) => x.progressPct === 100) ? 18 : 0)),
        completedCount: trackCourses.filter((x) => x.progressPct === 100).length,
        totalCount: trackCourses.length,
      };
    });

    const enrichedPaths = paths.map((p: LearningPath) => {
      const items = p.courseIds.map((id) => all.find((x) => x.course.id === id)).filter((x): x is EnrichedCourseItem => !!x);
      const done = items.filter((x) => x.progressPct === 100).length;
      const totalMins = items.reduce((s, x) => s + x.course.durationMins, 0);
      return {
        path: p,
        items,
        done,
        total: items.length,
        pct: items.length ? Math.round((done / items.length) * 100) : 0,
        totalMins,
      };
    });

    return {
      all,
      active,
      requiredOpen,
      completed,
      certificates: myCerts,
      totalXp,
      rank,
      completedMins,
      radar,
      paths: enrichedPaths,
    };
  }, [me, courses, enrollments, certificates, paths]);
}

export interface LearnerComplianceRow {
  user: User;
  requiredTotal: number;
  requiredDone: number;
  overdueCount: number;
  inProgressCount: number;
  certificatesCount: number;
  items: EnrichedCourseItem[];
}

export function computeTeamCompliance(
  v: access.AcademyViewer | null,
  users: User[],
  courses: Course[],
  enrollments: Enrollment[],
  certificates: Certificate[],
  scope: 'team' | 'company',
  today = todayISO(),
): LearnerComplianceRow[] {
  if (!v || !access.canUseAcademy(v)) return [];
  const manage = access.canManageAcademy(v);
  const targetUsers = users.filter((u) => {
    if (!u.active || !isEmployee(u)) return false;
    if (scope === 'company' && manage) return true;
    return u.managerId === v.userId;
  });

  return targetUsers
    .map((user) => {
      const items = computeUserCourses(user.id, courses, enrollments, today);
      const reqItems = items.filter((x) => x.enrollment?.required);
      const requiredDone = reqItems.filter((x) => x.enrollment?.status === 'completed').length;
      const overdueCount = reqItems.filter((x) => x.overdue).length;
      const inProgressCount = items.filter((x) => x.enrollment && x.enrollment.status !== 'completed').length;
      const certificatesCount = certificates.filter((c) => c.userId === user.id).length;
      return {
        user,
        requiredTotal: reqItems.length,
        requiredDone,
        overdueCount,
        inProgressCount,
        certificatesCount,
        items,
      };
    })
    .sort((a, b) => b.overdueCount - a.overdueCount || a.requiredDone / Math.max(1, a.requiredTotal) - b.requiredDone / Math.max(1, b.requiredTotal));
}

export function useTeamCompliance(scope: 'team' | 'company') {
  const v = useAcademyViewer();
  const users = useHub((s) => s.users);
  const courses = useAcademy((s) => s.courses);
  const enrollments = useAcademy((s) => s.enrollments);
  const certificates = useAcademy((s) => s.certificates);
  return useMemo(
    () => computeTeamCompliance(v, users, courses, enrollments, certificates, scope),
    [v, users, courses, enrollments, certificates, scope],
  );
}

export const TRACK_COLOR_HUE: Record<AcademyTrack, number> = {
  onboarding: 292,
  security: 346,
  ai: 192,
  engineering: 148,
  product: 36,
  leadership: 252,
};
