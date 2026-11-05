import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Compass,
  ExternalLink,
  Flame,
  GraduationCap,
  MessageSquareQuote,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { FORMAT_LABEL, LEVEL_META } from '@/academy/constants';
import { useMyLearning } from '@/academy/selectors';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { useTalent } from '@/talent/store';
import { Avatar } from '@/components/ui/primitives';
import { firstName } from '@/lib/format';
import { cx } from '@/lib/cx';
import { DuePill, ProgressRing, SkillRadarChart, SourceBadge, TrackBadge } from './shared';

const PHASE_LABEL: Record<string, string> = {
  'pre-boarding': 'Pre-boarding',
  'day-1': 'Day 1',
  'week-1': 'Week 1',
  'day-30': 'Day 30',
  'day-60': 'Day 60',
  'day-90': 'Day 90',
};

export function AcademyHome() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const journeys = useTalent((s) => s.onboarding);
  const navigate = useNavigate();
  const { all, active, radar, paths } = useMyLearning();

  // Locate active onboarding journey for signed-in learner (via hubUserId or onboarding enrollment)
  const onboardingCtx = useMemo(() => {
    if (!me) return null;
    const onboardingEnrollments = all.filter((x) => x.enrollment?.source === 'onboarding');
    const linkedJourneyId = onboardingEnrollments.find((x) => x.enrollment?.journeyId)?.enrollment?.journeyId;
    const journey =
      journeys.find((j) => j.hubUserId === me.id && j.status !== 'completed') ??
      (linkedJourneyId ? journeys.find((j) => j.id === linkedJourneyId) : undefined);

    if (!journey && onboardingEnrollments.length === 0) return null;

    // Build Day-1 -> Day-30 training checklist items
    const checklist = journey
      ? journey.tasks
          .filter((t) => !!t.courseId)
          .map((t) => {
            const enriched = all.find((x) => x.course.id === t.courseId);
            const done = t.done || enriched?.enrollment?.status === 'completed';
            return {
              id: t.id,
              phase: PHASE_LABEL[t.phase] ?? t.phase,
              title: enriched?.course.title ?? t.title,
              courseId: t.courseId!,
              done,
            };
          })
      : [];

    // Also append any onboarding-enrolled courses not already listed in journey.tasks
    for (const item of onboardingEnrollments) {
      if (!checklist.some((c) => c.courseId === item.course.id)) {
        checklist.push({
          id: item.enrollment!.id,
          phase: 'Day 30',
          title: item.course.title,
          courseId: item.course.id,
          done: item.enrollment!.status === 'completed',
        });
      }
    }

    const doneCount = checklist.filter((c) => c.done).length;
    return {
      journey,
      checklist,
      doneCount,
      totalCount: checklist.length,
    };
  }, [me, journeys, all]);

  // Recommended next courses (not yet enrolled, prioritizing featured & user's track/skills)
  const recommended = useMemo(() => {
    const unenrolled = all.filter((x) => !x.enrollment);
    return unenrolled
      .sort((a, b) => Number(!!b.course.featured) - Number(!!a.course.featured) || b.course.xp - a.course.xp)
      .slice(0, 3);
  }, [all]);

  return (
    <div className="stack stack--lg">
      {/* 1. Connected HR Onboarding Curriculum Banner */}
      {onboardingCtx && onboardingCtx.totalCount > 0 && (
        <section className="ac-onb-banner hud" aria-label="Connected HR Onboarding Curriculum">
          <div className="ac-onb-banner__top">
            <div className="ac-onb-banner__head">
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                <Rocket size={13} /> Live HR Portal Sync · Day 1 → Day 30 Curriculum
              </div>
              <div className="ac-onb-banner__title">
                <span>Your New-Hire Onboarding Bridge</span>
                <span className="badge badge--success">
                  {onboardingCtx.doneCount}/{onboardingCtx.totalCount} milestones complete
                </span>
              </div>
              <p className="text-sm muted" style={{ marginTop: 6, maxWidth: '68ch' }}>
                Every certification quiz you pass here in Helix Academy automatically ticks off the matching milestone on your HR Portal onboarding checklist and endorses your NEXUS profile skills.
              </p>
            </div>
            <div className="ac-onb-banner__links">
              {onboardingCtx.journey && (
                <Link to={`/hr/onboarding/${onboardingCtx.journey.id}`} className="btn btn--sm ac-btn-indigo">
                  <Rocket /> Open HR Onboarding Journey <ExternalLink size={13} />
                </Link>
              )}
              <Link to="/wiki/collections/col-new-hire" className="btn btn--sm">
                <BookOpen /> First-Week Reading Pack
              </Link>
            </div>
          </div>

          <div className="ac-onb-steps">
            {onboardingCtx.checklist.map((step) => (
              <button
                key={step.id}
                type="button"
                className={cx('ac-onb-step', step.done && 'is-done')}
                onClick={() => navigate(`/academy/course/${step.courseId}`)}
              >
                <span className="ac-onb-step__check">{step.done ? <Check /> : <Play />}</span>
                <div className="grow">
                  <div className="ac-onb-step__phase">{step.phase}</div>
                  <div className="ac-onb-step__name">{step.title}</div>
                </div>
                <ArrowRight size={14} className="faint" style={{ flex: 'none' }} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2. Main Split: Action Queue (Left) + Interactive Skill Radar (Right) */}
      <div className="ac-home-grid">
        <section className="stack" style={{ minWidth: 0 }}>
          <div className="section-head" style={{ marginBottom: 2 }}>
            <h2 className="section-title">
              <Flame size={18} style={{ color: '#818cf8' }} /> Action Queue — Required & In Progress
              <span className="count">{active.length}</span>
            </h2>
            <Link to="/academy/catalog" className="btn btn--ghost btn--sm">
              Explore catalog <ArrowRight />
            </Link>
          </div>

          {active.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '34px 20px' }}>
              <ShieldCheck size={34} style={{ color: 'var(--success)', margin: '0 auto 10px' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 650 }}>
                Zero open trainings — you’re 100% caught up!
              </div>
              <p className="text-sm muted" style={{ maxWidth: 420, margin: '6px auto 16px' }}>
                All mandatory certifications and assigned courses are complete. Dive into an advanced scenario lab or role path below.
              </p>
              <Link to="/academy/catalog" className="btn ac-btn-indigo btn--sm">
                <Compass /> Browse Learning Paths
              </Link>
            </div>
          ) : (
            <div className="ac-queue-list">
              {active.map((item) => {
                const { course, enrollment, progressPct, daysUntilDue, overdue, dueSoon } = item;
                const assigner = enrollment?.assignedBy ? users.find((u) => u.id === enrollment.assignedBy) : undefined;
                const started = (enrollment?.completedLessonIds.length ?? 0) > 0 || enrollment?.status === 'in-progress';
                const totalStages = course.lessons.length + (course.quiz.length ? 1 : 0);

                return (
                  <article
                    key={course.id}
                    className={cx('ac-course-row', overdue && 'ac-course-row--overdue')}
                    style={{ '--th': course.hue } as CSSProperties}
                  >
                    <div className="ac-course-row__head">
                      <div className="stack stack--sm" style={{ minWidth: 0 }}>
                        <div className="row row--wrap" style={{ gap: 6 }}>
                          <TrackBadge track={course.track} short />
                          {enrollment && (
                            <SourceBadge
                              source={enrollment.source}
                              managerName={assigner ? firstName(assigner.name) : undefined}
                            />
                          )}
                          {enrollment?.required && <span className="tag">Required</span>}
                          <DuePill
                            dueDate={enrollment?.dueDate}
                            daysUntilDue={daysUntilDue}
                            overdue={overdue}
                            dueSoon={dueSoon}
                          />
                        </div>
                        <Link to={`/academy/course/${course.id}`} className="ac-course-row__title">
                          {course.title}
                        </Link>
                        <p className="text-xs muted clamp-2">{course.tagline}</p>
                      </div>
                    </div>

                    {enrollment?.note && (
                      <div className="ac-course-row__note">
                        <MessageSquareQuote />
                        <span>
                          {assigner ? <strong style={{ color: 'var(--text)' }}>{firstName(assigner.name)}: </strong> : null}
                          {enrollment.note}
                        </span>
                      </div>
                    )}

                    <div className="ac-course-row__foot">
                      <div className="ac-progress-inline">
                        <div className="ac-bar" style={{ '--th': course.hue } as CSSProperties}>
                          <i style={{ width: `${Math.max(4, progressPct)}%` }} />
                        </div>
                        <span className="mono text-xs muted">
                          {enrollment?.completedLessonIds.length ?? 0}/{totalStages} stages · {progressPct}%
                        </span>
                      </div>

                      <div className="row" style={{ gap: 10 }}>
                        <span className="mono text-xs faint">
                          {course.durationMins}m · +{course.xp} XP
                        </span>
                        <Link to={`/academy/course/${course.id}`} className="btn btn--sm ac-btn-indigo">
                          <Play /> {started ? 'Continue' : 'Start'}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. Interactive SVG Skill Radar & Mastery Breakdown */}
        <SkillRadarChart
          domains={radar}
          skills={me?.skills ?? []}
          onSelectTrack={(track) => navigate(`/academy/catalog?track=${track}`)}
        />
      </div>

      {/* 4. Curated Role Learning Paths Preview */}
      <section className="section" style={{ marginTop: 8 }}>
        <div className="section-head">
          <h2 className="section-title">
            <GraduationCap size={19} style={{ color: '#818cf8' }} /> Curated Role Learning Paths
            <span className="count">{paths.length}</span>
          </h2>
          <Link to="/academy/catalog" className="btn btn--ghost btn--sm">
            All paths & courses <ArrowRight />
          </Link>
        </div>

        <div className="ac-paths-grid">
          {paths.map(({ path, items, done, total, pct, totalMins }) => {
            const nextCourse = items.find((x) => x.progressPct < 100)?.course ?? items[0]?.course;
            return (
              <div key={path.id} className="ac-path-card" style={{ '--th': path.hue } as CSSProperties}>
                <div className="ac-path-card__top">
                  <div className="stack stack--sm" style={{ minWidth: 0 }}>
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <TrackBadge track={path.track} short />
                      <span className="tag">{path.badgeTitle}</span>
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 650 }}>{path.title}</h3>
                    <p className="text-xs muted">{path.tagline}</p>
                  </div>
                  <ProgressRing pct={pct} hue={path.hue} size={52} />
                </div>

                <div className="ac-path-steps">
                  {items.map((step, i) => {
                    const isDone = step.progressPct === 100;
                    return (
                      <button
                        key={step.course.id}
                        type="button"
                        className={cx('ac-path-step', isDone && 'is-done')}
                        onClick={() => navigate(`/academy/course/${step.course.id}`)}
                      >
                        <span className="ac-path-step__idx">{isDone ? <Check /> : i + 1}</span>
                        <span className="truncate grow">{step.course.title}</span>
                        <span className="mono text-xs faint">{step.course.durationMins}m</span>
                      </button>
                    );
                  })}
                </div>

                <div className="row row--between" style={{ marginTop: 'auto', paddingTop: 4 }}>
                  <span className="text-xs muted">
                    {done}/{total} complete · {totalMins} mins · {path.targetAudience}
                  </span>
                  {nextCourse && (
                    <Link to={`/academy/course/${nextCourse.id}`} className="btn btn--sm">
                      {pct === 100 ? 'Review' : pct > 0 ? 'Continue' : 'Start Path'}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Recommended Next Courses Rail */}
      {recommended.length > 0 && (
        <section className="section" style={{ marginTop: 6 }}>
          <div className="section-head">
            <h2 className="section-title">
              <Sparkles size={18} style={{ color: '#818cf8' }} /> Recommended Next for You
            </h2>
            <Link to="/academy/catalog" className="btn btn--ghost btn--sm">
              Full catalog <ArrowRight />
            </Link>
          </div>

          <div className="ac-courses-grid">
            {recommended.map(({ course }) => {
              const instructor = users.find((u) => u.id === course.instructorId);
              const levelMeta = LEVEL_META[course.level];
              return (
                <article key={course.id} className="ac-course-card" style={{ '--th': course.hue } as CSSProperties}>
                  <div className="row row--between row--wrap" style={{ gap: 6 }}>
                    <TrackBadge track={course.track} short />
                    <span className={`badge badge--${levelMeta.badgeTone}`}>{levelMeta.label}</span>
                  </div>

                  <Link to={`/academy/course/${course.id}`} className="ac-course-card__title">
                    {course.title}
                  </Link>
                  <p className="text-xs muted clamp-2">{course.tagline}</p>

                  <div className="row row--wrap" style={{ gap: 5 }}>
                    {course.skills.slice(0, 3).map((sk) => (
                      <span key={sk} className="tag">
                        {sk}
                      </span>
                    ))}
                  </div>

                  <div className="ac-course-card__meta">
                    <span>
                      <Clock /> {course.durationMins} mins
                    </span>
                    <span>
                      <Zap /> +{course.xp} XP
                    </span>
                    <span>{FORMAT_LABEL[course.format]}</span>
                  </div>

                  <div className="ac-course-card__foot">
                    {instructor ? (
                      <div className="row" style={{ gap: 8, minWidth: 0 }}>
                        <Avatar user={instructor} size={26} />
                        <span className="text-xs muted truncate">{instructor.name}</span>
                      </div>
                    ) : (
                      <span />
                    )}
                    <Link to={`/academy/course/${course.id}`} className="btn btn--sm ac-btn-indigo">
                      Start <ArrowRight />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
