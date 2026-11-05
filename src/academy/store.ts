/**
 * Helix Academy store — interactive course progress, scenario simulations,
 * graded certification quizzes, onboarding auto-assignment sync, team/L&D
 * assignments, and course authoring.
 *
 * Every mutating action re-verifies RBAC permissions, logs security/compliance
 * events to the shared NEXUS audit trail, and fans out `learning` notifications.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';
import { uid } from '@/lib/id';
import { addDaysISO } from '@/hr/calendar';
import { useTalent } from '@/talent/store';
import * as access from './access';
import { ACADEMY_DATA_VERSION, buildCredentialCode } from './constants';
import { createAcademySeed } from './seed';
import type {
  AcademyData,
  AcademyTrack,
  Certificate,
  Course,
  CourseFormat,
  CourseLevel,
  Enrollment,
  Lesson,
  QuizQuestion,
} from './types';

const DAY = 86_400_000;

export interface QuizSubmissionResult {
  ok: boolean;
  error?: string;
  passed?: boolean;
  score?: number;
  correctCount?: number;
  total?: number;
  certificateId?: string;
  syncedOnboarding?: { journeyId: string; taskTitle: string } | null;
}

export interface AssignCourseInput {
  userIds: string[];
  courseId: string;
  dueDate?: string;
  required: boolean;
  note?: string;
}

export interface NewCourseInput {
  title: string;
  tagline: string;
  description: string;
  track: AcademyTrack;
  level: CourseLevel;
  format: CourseFormat;
  durationMins: number;
  skills: string[];
  mandatory?: boolean;
  companionSlugs?: string[];
  lessonTitle: string;
  lessonSummary: string;
  lessonBody: string;
  quizPrompt: string;
  quizOptions: string[];
  quizCorrectIndex: number;
  quizExplanation: string;
}

export interface AcademyActions {
  enrol(courseId: string): ActionResult;
  setLastLesson(courseId: string, lessonId: string): void;
  completeLesson(courseId: string, lessonId: string): ActionResult;
  answerScenario(courseId: string, lessonId: string, choiceId: string): ActionResult & { optimal?: boolean };
  saveLessonNote(courseId: string, lessonId: string, note: string): ActionResult;
  submitQuiz(courseId: string, answers: number[]): QuizSubmissionResult;
  assignCourse(input: AssignCourseInput): ActionResult & { count?: number };
  nudgeLearner(userId: string, courseId: string): ActionResult;
  toggleOnboardingRule(ruleId: string, enabled: boolean): ActionResult;
  createCourse(input: NewCourseInput): ActionResult & { courseId?: string };
  syncOnboarding(): number;
  resetAcademyDemo(): void;
}

export type AcademyStore = AcademyData & AcademyActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const first = (name: string) => name.split(/\s+/)[0];
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'course';

export const useAcademy = create<AcademyStore>()(
  persist(
    (set, get) => {
      const hub = () => useHub.getState();
      const viewer = (): { v: access.AcademyViewer; user: User } | null => {
        const h = hub();
        const user = h.users.find((u) => u.id === h.sessionUserId && u.active);
        if (!user) return null;
        return { v: { userId: user.id, perms: effectivePermissions(user, h.roles) }, user };
      };

      const audit = (entry: { action: string; target: string; detail?: string; outcome?: 'success' | 'denied'; severity?: 'info' | 'warning' | 'critical' }) => {
        const actorId = hub().sessionUserId ?? 'system';
        useHub.setState((s) => ({
          audit: [
            {
              id: uid('au'),
              at: Date.now(),
              actorId,
              outcome: entry.outcome ?? 'success',
              severity: entry.severity ?? 'info',
              action: entry.action,
              target: entry.target,
              detail: entry.detail,
            },
            ...s.audit,
          ].slice(0, 500),
        }));
      };

      const notify = (userIds: (string | undefined)[], item: { title: string; body?: string; link?: string }) => {
        const actorId = hub().sessionUserId;
        const targets = [...new Set(userIds.filter((x): x is string => !!x && x !== actorId))];
        if (!targets.length) return;
        const at = Date.now();
        const fresh: HubNotification[] = targets.map((userId) => ({
          id: uid('n'),
          userId,
          at,
          kind: 'learning',
          read: false,
          ...item,
        }));
        useHub.setState((s) => ({ notifications: [...fresh, ...s.notifications].slice(0, 400) }));
      };

      const ensureEnrollment = (userId: string, courseId: string): Enrollment => {
        const existing = get().enrollments.find((e) => e.userId === userId && e.courseId === courseId);
        if (existing) return existing;
        const now = Date.now();
        const course = get().courses.find((c) => c.id === courseId);
        const created: Enrollment = {
          id: `enr-${userId}-${courseId}`,
          userId,
          courseId,
          status: 'in-progress',
          required: false,
          source: 'self',
          assignedAt: now,
          startedAt: now,
          completedLessonIds: [],
          scenarioAnswers: {},
          lastLessonId: course?.lessons[0]?.id,
          attempts: 0,
          notes: {},
        };
        set((s) => ({ enrollments: [...s.enrollments, created] }));
        return created;
      };

      return {
        ...createAcademySeed(),

        enrol(courseId) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) {
            audit({ action: 'academy.enrol.denied', target: courseId, outcome: 'denied', severity: 'warning' });
            return fail('You need Academy access to enrol in courses.');
          }
          const course = get().courses.find((c) => c.id === courseId);
          if (!course) return fail('Course not found.');
          const existing = get().enrollments.find((e) => e.userId === auth.user.id && e.courseId === courseId);
          if (existing) {
            if (existing.status === 'assigned') {
              set((s) => ({
                enrollments: s.enrollments.map((e) =>
                  e.id === existing.id ? { ...e, status: 'in-progress', startedAt: e.startedAt ?? Date.now(), lastLessonId: e.lastLessonId ?? course.lessons[0]?.id } : e,
                ),
              }));
            }
            return ok(`Resuming ${course.title}`);
          }
          ensureEnrollment(auth.user.id, courseId);
          audit({ action: 'academy.enrolled', target: course.title });
          return ok(`Enrolled in ${course.title}`);
        },

        setLastLesson(courseId, lessonId) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) return;
          const existing = ensureEnrollment(auth.user.id, courseId);
          set((s) => ({
            enrollments: s.enrollments.map((e) =>
              e.id === existing.id
                ? { ...e, lastLessonId: lessonId, status: e.status === 'assigned' ? 'in-progress' : e.status, startedAt: e.startedAt ?? Date.now() }
                : e,
            ),
          }));
        },

        completeLesson(courseId, lessonId) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) return fail('Academy access required.');
          const course = get().courses.find((c) => c.id === courseId);
          const lesson = course?.lessons.find((l) => l.id === lessonId);
          if (!course || !lesson) return fail('Lesson not found.');
          const enr = ensureEnrollment(auth.user.id, courseId);
          const idx = course.lessons.findIndex((l) => l.id === lessonId);
          const nextLesson = course.lessons[idx + 1]?.id ?? lessonId;
          const completedLessonIds = enr.completedLessonIds.includes(lessonId)
            ? enr.completedLessonIds
            : [...enr.completedLessonIds, lessonId];
          set((s) => ({
            enrollments: s.enrollments.map((e) =>
              e.id === enr.id
                ? {
                    ...e,
                    completedLessonIds,
                    lastLessonId: nextLesson,
                    status: e.status === 'completed' ? 'completed' : 'in-progress',
                    startedAt: e.startedAt ?? Date.now(),
                  }
                : e,
            ),
          }));
          return ok('Lesson completed ✓');
        },

        answerScenario(courseId, lessonId, choiceId) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) return fail('Academy access required.');
          const course = get().courses.find((c) => c.id === courseId);
          const lesson = course?.lessons.find((l) => l.id === lessonId);
          if (!course || !lesson || lesson.kind !== 'scenario') return fail('Scenario not found.');
          const choice = lesson.choices.find((c) => c.id === choiceId);
          if (!choice) return fail('Choice not found.');
          const enr = ensureEnrollment(auth.user.id, courseId);
          const completedLessonIds =
            choice.optimal && !enr.completedLessonIds.includes(lessonId)
              ? [...enr.completedLessonIds, lessonId]
              : enr.completedLessonIds;
          set((s) => ({
            enrollments: s.enrollments.map((e) =>
              e.id === enr.id
                ? {
                    ...e,
                    scenarioAnswers: { ...e.scenarioAnswers, [lessonId]: choiceId },
                    completedLessonIds,
                    status: e.status === 'completed' ? 'completed' : 'in-progress',
                    startedAt: e.startedAt ?? Date.now(),
                  }
                : e,
            ),
          }));
          return { ok: true, optimal: choice.optimal, message: choice.optimal ? 'Optimal move! Lesson marked complete.' : 'Review the impact feedback and try the optimal response.' };
        },

        saveLessonNote(courseId, lessonId, note) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) return fail('Academy access required.');
          const enr = ensureEnrollment(auth.user.id, courseId);
          set((s) => ({
            enrollments: s.enrollments.map((e) =>
              e.id === enr.id ? { ...e, notes: { ...e.notes, [lessonId]: note } } : e,
            ),
          }));
          return ok('Study note saved');
        },

        submitQuiz(courseId, answers) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) return { ok: false, error: 'Academy access required.' };
          const course = get().courses.find((c) => c.id === courseId);
          if (!course) return { ok: false, error: 'Course not found.' };
          if (!course.quiz.length) return { ok: false, error: 'This course has no quiz.' };
          if (answers.length < course.quiz.length || answers.some((a) => a < 0 || a === undefined)) {
            return { ok: false, error: 'Answer every question before submitting.' };
          }
          const correctCount = course.quiz.reduce((n, q, i) => n + (answers[i] === q.correctIndex ? 1 : 0), 0);
          const total = course.quiz.length;
          const score = Math.round((correctCount / total) * 100);
          const passed = score >= course.passScore;
          const now = Date.now();
          const enr = ensureEnrollment(auth.user.id, courseId);
          const bestQuizScore = Math.max(enr.bestQuizScore ?? 0, score);

          if (!passed) {
            set((s) => ({
              enrollments: s.enrollments.map((e) =>
                e.id === enr.id
                  ? { ...e, attempts: e.attempts + 1, bestQuizScore, status: e.status === 'completed' ? 'completed' : 'in-progress' }
                  : e,
              ),
            }));
            return { ok: true, passed: false, score, correctCount, total };
          }

          // Passed! Complete enrollment, issue or refresh certificate, and auto-sync linked HR onboarding task.
          const allLessons = course.lessons.map((l) => l.id);
          const existingCert = get().certificates.find((c) => c.userId === auth.user.id && c.courseId === courseId);
          const cred = buildCredentialCode(auth.user.id, courseId, existingCert?.issuedAt ?? now);
          const cert: Certificate = existingCert
            ? { ...existingCert, score: Math.max(existingCert.score, score) }
            : {
                id: `cert-${auth.user.id}-${courseId}`,
                credentialCode: cred.code,
                verificationHash: cred.hash,
                userId: auth.user.id,
                courseId,
                courseTitle: course.title,
                track: course.track,
                score,
                xpEarned: course.xp,
                skills: course.skills,
                issuedAt: now,
                expiresAt: course.recertDays ? now + course.recertDays * DAY : undefined,
                issuedBy: 'Helix Academy',
              };

          // Also add newly mastered skills onto the user's directory profile!
          const missingSkills = course.skills.filter((sk) => !auth.user.skills.includes(sk));
          if (missingSkills.length) {
            useHub.setState((s) => ({
              users: s.users.map((u) => (u.id === auth.user.id ? { ...u, skills: [...u.skills, ...missingSkills].slice(0, 12) } : u)),
            }));
          }

          set((s) => ({
            enrollments: s.enrollments.map((e) =>
              e.id === enr.id
                ? {
                    ...e,
                    status: 'completed',
                    completedLessonIds: allLessons,
                    attempts: e.attempts + 1,
                    bestQuizScore,
                    completedAt: e.completedAt ?? now,
                  }
                : e,
            ),
            certificates: existingCert
              ? s.certificates.map((c) => (c.id === existingCert.id ? cert : c))
              : [cert, ...s.certificates],
          }));

          const syncedOnboarding = useTalent.getState().completeOnboardingCourseTask(auth.user.id, courseId);

          audit({
            action: 'academy.course.completed',
            target: `${auth.user.name} · ${course.title}`,
            detail: `${score}% · ${cert.credentialCode}${syncedOnboarding ? ` · synced onboarding (${syncedOnboarding.taskTitle})` : ''}`,
          });

          if (enr.assignedBy && enr.assignedBy !== auth.user.id) {
            notify([enr.assignedBy], {
              title: `${auth.user.name} completed ${course.title} 🎓`,
              body: `Scored ${score}% · Credential ${cert.credentialCode}`,
              link: '/academy/manage',
            });
          } else if (enr.source === 'onboarding' && auth.user.managerId) {
            notify([auth.user.managerId], {
              title: `Onboarding training complete: ${first(auth.user.name)}`,
              body: `${course.title} (${score}%)`,
              link: syncedOnboarding ? `/hr/onboarding/${syncedOnboarding.journeyId}` : '/academy/manage',
            });
          }

          return {
            ok: true,
            passed: true,
            score,
            correctCount,
            total,
            certificateId: cert.id,
            syncedOnboarding,
          };
        },

        assignCourse(input) {
          const auth = viewer();
          if (!auth || !access.canUseAcademy(auth.v)) return fail('Academy access required.');
          const course = get().courses.find((c) => c.id === input.courseId);
          if (!course) return fail('Course not found.');
          if (!input.userIds.length) return fail('Select at least one team member.');
          const users = hub().users;
          for (const uidTarget of input.userIds) {
            const target = users.find((u) => u.id === uidTarget);
            const verdict = access.canAssignCourse(auth.v, target);
            if (!verdict.ok) {
              audit({ action: 'academy.assign.denied', target: `${target?.name ?? uidTarget} · ${course.title}`, detail: verdict.reason, outcome: 'denied', severity: 'warning' });
              return fail(verdict.reason);
            }
          }
          const now = Date.now();
          const manage = access.canManageAcademy(auth.v);
          let assignedCount = 0;
          set((s) => {
            const next = [...s.enrollments];
            for (const userId of input.userIds) {
              const idx = next.findIndex((e) => e.userId === userId && e.courseId === course.id);
              if (idx >= 0) {
                if (next[idx].status !== 'completed') {
                  next[idx] = {
                    ...next[idx],
                    required: input.required || next[idx].required,
                    dueDate: input.dueDate ?? next[idx].dueDate,
                    assignedBy: auth.user.id,
                    note: input.note?.trim() || next[idx].note,
                  };
                  assignedCount++;
                }
              } else {
                next.push({
                  id: `enr-${userId}-${course.id}`,
                  userId,
                  courseId: course.id,
                  status: 'assigned',
                  required: input.required,
                  source: manage ? 'compliance' : 'manager',
                  assignedBy: auth.user.id,
                  assignedAt: now,
                  dueDate: input.dueDate,
                  note: input.note?.trim() || undefined,
                  completedLessonIds: [],
                  scenarioAnswers: {},
                  lastLessonId: course.lessons[0]?.id,
                  attempts: 0,
                  notes: {},
                });
                assignedCount++;
              }
            }
            return { enrollments: next };
          });

          if (assignedCount > 0) {
            notify(input.userIds, {
              title: `${input.required ? 'Required training' : 'Recommended course'}: ${course.title}`,
              body: `${first(auth.user.name)} assigned this${input.dueDate ? ` · due ${input.dueDate}` : ''}${input.note ? ` — “${input.note.trim()}”` : ''}`,
              link: `/academy/course/${course.id}`,
            });
            audit({
              action: 'academy.course.assigned',
              target: course.title,
              detail: `${assignedCount} learner${assignedCount === 1 ? '' : 's'}${input.dueDate ? ` · due ${input.dueDate}` : ''}`,
            });
          }
          return { ...ok(assignedCount ? `Assigned to ${assignedCount} team member${assignedCount === 1 ? '' : 's'}` : 'Everyone selected has already completed this course'), count: assignedCount };
        },

        nudgeLearner(userId, courseId) {
          const auth = viewer();
          const target = hub().users.find((u) => u.id === userId);
          const course = get().courses.find((c) => c.id === courseId);
          const verdict = access.canAssignCourse(auth?.v ?? null, target);
          if (!verdict.ok) {
            audit({ action: 'academy.nudge.denied', target: target?.name ?? userId, detail: verdict.reason, outcome: 'denied', severity: 'warning' });
            return fail(verdict.reason);
          }
          if (!target || !course) return fail('Learner or course not found.');
          notify([userId], {
            title: `Friendly reminder: ${course.title}`,
            body: `From ${auth!.user.name} · ${course.durationMins} mins to complete in Academy.`,
            link: `/academy/course/${course.id}`,
          });
          audit({ action: 'academy.learner.nudged', target: `${target.name} · ${course.title}` });
          return ok(`Sent a friendly reminder to ${first(target.name)}`);
        },

        toggleOnboardingRule(ruleId, enabled) {
          const auth = viewer();
          if (!auth || !access.canManageAcademy(auth.v)) {
            audit({ action: 'academy.rule.denied', target: ruleId, outcome: 'denied', severity: 'warning' });
            return fail('Only People Ops / Academy admins can edit onboarding training rules.');
          }
          const rule = get().rules.find((r) => r.id === ruleId);
          if (!rule) return fail('Rule not found.');
          set((s) => ({ rules: s.rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r)) }));
          const course = get().courses.find((c) => c.id === rule.courseId);
          audit({
            action: 'academy.rule.updated',
            target: course?.title ?? rule.courseId,
            detail: `Auto-assign on ${rule.phase} → ${enabled ? 'enabled' : 'paused'}`,
            severity: 'warning',
          });
          if (enabled) get().syncOnboarding();
          return ok(`${course?.title ?? 'Rule'} ${enabled ? 'enabled' : 'paused'} for new hires`);
        },

        createCourse(input) {
          const auth = viewer();
          if (!auth || !access.canManageAcademy(auth.v)) {
            audit({ action: 'academy.course.denied', target: input.title, outcome: 'denied', severity: 'warning' });
            return fail('Only Academy managers (`academy.manage`) can publish new courses.');
          }
          if (input.title.trim().length < 4) return fail('Give the course a clear title (4+ characters).');
          if (input.lessonBody.trim().length < 20) return fail('Add a bit more substance to the lesson content.');
          const cleanOpts = input.quizOptions.map((o) => o.trim()).filter(Boolean);
          if (cleanOpts.length < 2) return fail('Provide at least 2 quiz options.');
          const now = Date.now();
          const id = uid('c');
          const trackHue: Record<AcademyTrack, number> = { onboarding: 292, security: 346, ai: 192, engineering: 148, product: 36, leadership: 252 };
          const lesson: Lesson = {
            id: `${id}-l1`,
            kind: 'concept',
            title: input.lessonTitle.trim() || 'Core Concepts & Playbook',
            durationMins: Math.max(5, Math.round(input.durationMins * 0.7)),
            summary: input.lessonSummary.trim() || input.tagline.trim(),
            blocks: input.lessonBody
              .trim()
              .split(/\n{2,}/)
              .map((para) => ({ kind: 'paragraph' as const, text: para.trim() })),
            keyTakeaways: [input.tagline.trim() || input.title.trim()],
          };
          const quiz: QuizQuestion[] = [
            {
              id: `${id}-q1`,
              prompt: input.quizPrompt.trim() || `Which takeaway best reflects ${input.title.trim()}?`,
              options: cleanOpts,
              correctIndex: Math.min(Math.max(0, input.quizCorrectIndex), cleanOpts.length - 1),
              explanation: input.quizExplanation.trim() || 'Verified against the Helix Academy standard.',
            },
          ];
          const course: Course = {
            id,
            slug: `${slugify(input.title)}-${id.slice(-4)}`,
            title: input.title.trim(),
            tagline: input.tagline.trim() || input.description.trim().slice(0, 90),
            description: input.description.trim() || input.tagline.trim(),
            track: input.track,
            level: input.level,
            format: input.format,
            durationMins: Math.max(5, Math.min(180, Math.round(input.durationMins) || 20)),
            xp: Math.max(100, Math.round((input.durationMins || 20) * 10)),
            hue: trackHue[input.track],
            instructorId: auth.user.id,
            skills: input.skills.length ? input.skills : ['Continuous Learning'],
            mandatory: !!input.mandatory,
            recertDays: input.mandatory ? 365 : undefined,
            passScore: 80,
            companionSlugs: input.companionSlugs ?? [],
            lessons: [lesson],
            quiz,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ courses: [course, ...s.courses] }));
          audit({ action: 'academy.course.published', target: course.title, detail: `${course.track} · ${course.durationMins}m` });
          return { ...ok(`Published “${course.title}” to the catalog`), courseId: course.id };
        },

        syncOnboarding() {
          const journeys = useTalent.getState().onboarding;
          const users = hub().users;
          const { rules, courses, enrollments } = get();
          const activeRules = rules.filter((r) => r.enabled);
          const courseById = new Map(courses.map((c) => [c.id, c]));
          const next = [...enrollments];
          const addedByUser = new Map<string, string[]>();
          const now = Date.now();

          for (const j of journeys) {
            if (!j.hubUserId) continue;
            const u = users.find((x) => x.id === j.hubUserId && x.active);
            if (!u) continue;
            for (const r of activeRules) {
              const deptOk = r.departments.length === 0 || r.departments.includes(u.department);
              const roleOk = r.roleIds.length === 0 || r.roleIds.some((rid) => u.roleIds.includes(rid));
              if (!deptOk && !roleOk && r.departments.length > 0 && r.roleIds.length > 0) continue;
              if (r.departments.length > 0 && r.roleIds.length === 0 && !deptOk) continue;
              if (r.roleIds.length > 0 && r.departments.length === 0 && !roleOk) continue;
              if (next.some((e) => e.userId === u.id && e.courseId === r.courseId)) continue;
              const course = courseById.get(r.courseId);
              if (!course) continue;
              const linkedTask = j.tasks.find((t) => t.courseId === r.courseId);
              const alreadyDone = !!linkedTask?.done;
              next.push({
                id: `enr-${u.id}-${r.courseId}`,
                userId: u.id,
                courseId: r.courseId,
                status: alreadyDone ? 'completed' : 'assigned',
                required: true,
                source: 'onboarding',
                assignedAt: now,
                dueDate: addDaysISO(j.startDate, r.dueOffsetDays),
                journeyId: j.id,
                note: r.rationale,
                completedLessonIds: alreadyDone ? course.lessons.map((l) => l.id) : [],
                scenarioAnswers: {},
                lastLessonId: course.lessons[0]?.id,
                attempts: alreadyDone ? 1 : 0,
                bestQuizScore: alreadyDone ? 100 : undefined,
                completedAt: alreadyDone ? linkedTask?.doneAt ?? now : undefined,
                notes: {},
              });
              if (!alreadyDone) {
                const arr = addedByUser.get(u.id) ?? [];
                arr.push(course.title);
                addedByUser.set(u.id, arr);
              }
            }
          }

          const createdCount = next.length - enrollments.length;
          if (createdCount > 0) {
            set({ enrollments: next });
            for (const [uidTarget, titles] of addedByUser) {
              notify([uidTarget], {
                title: `${titles.length} onboarding training${titles.length === 1 ? '' : 's'} ready in Academy`,
                body: titles.slice(0, 3).join(' · '),
                link: '/academy',
              });
            }
          }
          return createdCount;
        },

        resetAcademyDemo() {
          set(createAcademySeed());
        },
      };
    },
    {
      name: 'nexus-academy',
      version: ACADEMY_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): AcademyData => ({
        version: s.version,
        courses: s.courses,
        paths: s.paths,
        enrollments: s.enrollments,
        certificates: s.certificates,
        rules: s.rules,
      }),
      migrate: (persisted, version) => (version === ACADEMY_DATA_VERSION ? (persisted as AcademyData) : createAcademySeed()),
    },
  ),
);

let academySynced = false;
export function initAcademy() {
  if (academySynced) return;
  academySynced = true;
  useAcademy.getState().syncOnboarding();
}
