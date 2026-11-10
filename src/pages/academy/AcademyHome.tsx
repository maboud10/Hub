import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Compass,
  ExternalLink,
  Flame,
  MessageSquareQuote,
  Play,
  Rocket,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  NeoBanner,
  NeoBanners,
  NeoEmpty,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
} from '@/components/neo';
import { TRACK_META } from '@/academy/constants';
import { useAcademyCaps, useMyLearning, useTeamCompliance } from '@/academy/selectors';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { useTalent } from '@/talent/store';
import { firstName, formatDate } from '@/lib/format';
import { cx } from '@/lib/cx';
import {
  CourseCard,
  DuePill,
  ProgressRing,
  SkillRadarChart,
  SourceBadge,
  TrackBadge,
  dueWords,
  formatMins,
  minutesLeft,
  useCertParam,
  useNovaPick,
} from './shared';

const PHASE_LABEL: Record<string, string> = {
  'pre-boarding': 'Pre-boarding',
  'day-1': 'Day 1',
  'week-1': 'Week 1',
  'day-30': 'Day 30',
  'day-60': 'Day 60',
  'day-90': 'Day 90',
};

const NOVA_SUGGESTIONS = [
  'Passkeys & zero-trust',
  'Incident command',
  'Giving feedback',
  'AI safety with Gemini',
];

export function AcademyHome() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const journeys = useTalent((s) => s.onboarding);
  const navigate = useNavigate();
  const caps = useAcademyCaps();
  const { all, active, requiredOpen, certificates, totalXp, rank, radar, paths } = useMyLearning();
  const teamScope = caps.manage && !caps.manager ? 'company' : 'team';
  const complianceRows = useTeamCompliance(teamScope);
  const novaPick = useNovaPick();
  const { open: openCert } = useCertParam();

  const overdueItems = useMemo(() => requiredOpen.filter((x) => x.overdue), [requiredOpen]);
  const overdueSelfCount = overdueItems.length;
  const teamOverdueCount = useMemo(
    () => complianceRows.reduce((sum, row) => sum + row.overdueCount, 0),
    [complianceRows],
  );
  const showManageBanner = (caps.manage || caps.manager) && teamOverdueCount > 0;

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

  // Recommended next courses (not yet enrolled, prioritizing Nova pick, featured & XP)
  const recommended = useMemo(() => {
    const unenrolled = all.filter((x) => !x.enrollment);
    return unenrolled
      .sort(
        (a, b) =>
          Number(b.course.id === novaPick?.course.id) - Number(a.course.id === novaPick?.course.id) ||
          Number(!!b.course.featured) - Number(!!a.course.featured) ||
          b.course.xp - a.course.xp,
      )
      .slice(0, 3);
  }, [all, novaPick]);

  const minsLeftTotal = useMemo(
    () => active.reduce((sum, item) => sum + minutesLeft(item.course, item.progressPct), 0),
    [active],
  );

  const hasBanners = overdueSelfCount > 0 || requiredOpen.length > 0 || showManageBanner;

  return (
    <div className="neo-stack">
      {hasBanners && (
        <NeoBanners>
          {overdueSelfCount > 0 ? (
            <NeoBanner
              tone="danger"
              icon={<AlertTriangle />}
              title={`${overdueSelfCount} overdue required training${overdueSelfCount === 1 ? '' : 's'}`}
              meta={`${requiredOpen.length} required due`}
              to={`/academy/course/${overdueItems[0].course.id}`}
            >
              Finish {overdueItems[0].course.title} and pass the assessment to restore compliance standing.
            </NeoBanner>
          ) : requiredOpen.length > 0 ? (
            <NeoBanner
              tone="warning"
              icon={<ShieldCheck />}
              title={`${requiredOpen.length} required training${requiredOpen.length === 1 ? '' : 's'} due`}
              meta={
                requiredOpen[0].daysUntilDue !== null
                  ? `Next due ${dueWords(requiredOpen[0].daysUntilDue)}`
                  : 'Assigned curriculum'
              }
              to={`/academy/course/${requiredOpen[0].course.id}`}
            >
              Up next: {requiredOpen[0].course.title} — pass the certification quiz to earn +{requiredOpen[0].course.xp} XP.
            </NeoBanner>
          ) : null}

          {showManageBanner && (
            <NeoBanner
              tone="warning"
              icon={<Users />}
              title={`${teamOverdueCount} overdue training${teamOverdueCount === 1 ? '' : 's'} across your ${
                teamScope === 'company' ? 'organization' : 'team'
              }`}
              meta="Compliance studio"
              to="/academy/manage"
            >
              Review learner progress, send nudges, or adjust assignments in the Team &amp; Compliance studio.
            </NeoBanner>
          )}
        </NeoBanners>
      )}

      <NeoKpis label="Learning overview">
        <NeoKpi
          icon={<Sparkles />}
          label="Rank & level"
          value={`Lv.${rank.level} · ${rank.title}`}
          sub={`${totalXp}/${rank.nextXp} XP`}
        />
        <NeoKpi
          icon={<ShieldCheck />}
          label="Required due"
          value={requiredOpen.length}
          sub={
            overdueSelfCount > 0
              ? `${overdueSelfCount} overdue · action needed`
              : requiredOpen.length > 0
                ? `${requiredOpen.length} open requirement${requiredOpen.length === 1 ? '' : 's'}`
                : 'All required trainings current'
          }
          tone={overdueSelfCount > 0 ? 'danger' : requiredOpen.length > 0 ? 'warning' : undefined}
        />
        <NeoKpi
          icon={<Flame />}
          label="In progress"
          value={active.length}
          sub={active.length > 0 ? `~${formatMins(minsLeftTotal)} remaining` : 'Pick a course to start'}
        />
        <NeoKpi
          icon={<Award />}
          label="Certificates"
          value={certificates.length}
          sub={`of ${all.length} credentials earned`}
          to="/academy/certificates"
        />
      </NeoKpis>

      <NeoHome
        sideLabel="Skill mastery, paths & credentials"
        main={
          <>
            <NeoNovaPrompt
              hud="Nova · Learning coach"
              title="What do you want to learn or practice?"
              badge="Courses · scenarios · certs"
              placeholder="e.g. Passkeys & zero-trust, incident command, structured feedback, or Gemini safety…"
              suggestions={NOVA_SUGGESTIONS}
              submitLabel="Find courses"
              onSubmit={(q) => navigate(`/academy/catalog?q=${encodeURIComponent(q)}`)}
            />

            {onboardingCtx && onboardingCtx.totalCount > 0 && (
              <NeoPanel
                icon={<Rocket />}
                hud="Day 1 → Day 30 sync"
                title="New-hire onboarding bridge"
                actions={
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    <span className="neo-chip" data-tone="emerald">
                      {onboardingCtx.doneCount}/{onboardingCtx.totalCount} milestones
                    </span>
                    {onboardingCtx.journey && (
                      <Link
                        to={`/hr/onboarding/${onboardingCtx.journey.id}`}
                        className="neo-btn neo-btn--soft neo-btn--xs"
                      >
                        HR journey <ExternalLink size={12} />
                      </Link>
                    )}
                    <Link to="/wiki/collections/col-new-hire" className="neo-btn neo-btn--ghost neo-btn--xs">
                      <BookOpen /> Reading pack
                    </Link>
                  </div>
                }
              >
                <p className="ac-panel-lead">
                  Every certification quiz you pass here automatically ticks off the matching milestone on your HR Portal onboarding checklist and endorses your NEXUS profile skills.
                </p>
                <div className="ac-onb-steps">
                  {onboardingCtx.checklist.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      className={cx('ac-onb-step', step.done && 'is-done')}
                      onClick={() => navigate(`/academy/course/${step.courseId}`)}
                    >
                      <span className="ac-onb-step__check">{step.done ? <Check /> : <Play />}</span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="ac-onb-step__phase">{step.phase}</div>
                        <div className="ac-onb-step__name">{step.title}</div>
                      </div>
                      <ArrowRight size={14} className="faint" style={{ flex: 'none' }} />
                    </button>
                  ))}
                </div>
              </NeoPanel>
            )}

            <NeoPanel
              icon={<Flame />}
              hud="Action queue"
              title="Continue learning & required training"
              actions={
                <Link to="/academy/catalog" className="neo-btn neo-btn--ghost neo-btn--xs">
                  Catalog <ArrowRight />
                </Link>
              }
            >
              {active.length === 0 ? (
                <NeoEmpty
                  compact
                  icon={<ShieldCheck />}
                  title="Zero open trainings — you’re 100% caught up"
                  action={
                    <Link to="/academy/catalog" className="neo-btn neo-btn--soft neo-btn--sm">
                      <Compass /> Explore learning paths
                    </Link>
                  }
                >
                  All mandatory certifications and assigned courses are complete. Dive into an advanced scenario lab below.
                </NeoEmpty>
              ) : (
                <div className="ac-queue-list">
                  {active.map((item) => {
                    const { course, enrollment, progressPct, daysUntilDue, overdue, dueSoon } = item;
                    const assigner = enrollment?.assignedBy
                      ? users.find((u) => u.id === enrollment.assignedBy)
                      : undefined;
                    const started =
                      (enrollment?.completedLessonIds.length ?? 0) > 0 || enrollment?.status === 'in-progress';
                    const totalStages = course.lessons.length + (course.quiz.length ? 1 : 0);

                    return (
                      <article
                        key={course.id}
                        className={cx('ac-course-row neo-spot', overdue && 'ac-course-row--overdue')}
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
                              {enrollment?.required && (
                                <span className="neo-chip" data-tone="warning">
                                  Required
                                </span>
                              )}
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
                              {assigner ? (
                                <strong style={{ color: 'var(--text)' }}>{firstName(assigner.name)}: </strong>
                              ) : null}
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
                            <Link
                              to={`/academy/course/${course.id}`}
                              className="neo-btn neo-btn--plasma neo-btn--sm"
                            >
                              <Play /> {started ? 'Continue' : 'Start'}
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </NeoPanel>

            {recommended.length > 0 && (
              <NeoPanel
                icon={<Sparkles />}
                hud="Next up"
                title="Recommended for you"
                actions={
                  <Link to="/academy/catalog" className="neo-btn neo-btn--ghost neo-btn--xs">
                    All courses <ArrowRight />
                  </Link>
                }
              >
                <div className="ac-cgrid neo-stagger">
                  {recommended.map((item, i) => (
                    <CourseCard
                      key={item.course.id}
                      item={item}
                      i={i}
                      compact
                      pick={novaPick?.course.id === item.course.id}
                    />
                  ))}
                </div>
              </NeoPanel>
            )}
          </>
        }
        side={
          <>
            <NeoPanel
              hud="Mastery breakdown"
              title="Skill radar"
              actions={
                <Link to="/academy/catalog" className="neo-btn neo-btn--ghost neo-btn--xs">
                  Tracks <ArrowRight />
                </Link>
              }
            >
              <SkillRadarChart
                domains={radar}
                skills={me?.skills ?? []}
                onSelectTrack={(track) => navigate(`/academy/catalog?track=${track}`)}
              />
            </NeoPanel>

            <NeoPanel
              hud="Role sequences"
              title="Learning paths"
              actions={
                <Link to="/academy/catalog#ac-paths" className="neo-btn neo-btn--ghost neo-btn--xs">
                  All <ArrowRight />
                </Link>
              }
            >
              <div className="ac-side-list">
                {paths.map(({ path, items, done, total, pct, totalMins }) => {
                  const nextCourse = items.find((x) => x.progressPct < 100)?.course ?? items[0]?.course;
                  return (
                    <Link
                      key={path.id}
                      to={nextCourse ? `/academy/course/${nextCourse.id}` : '/academy/catalog'}
                      className="ac-side-row neo-spot"
                      style={{ '--th': path.hue } as CSSProperties}
                    >
                      <ProgressRing pct={pct} hue={path.hue} size={42} stroke={3.5} />
                      <div className="ac-side-row__body">
                        <div className="ac-side-row__top">
                          <TrackBadge track={path.track} short />
                          <span className="neo-hud">
                            {done}/{total} · {totalMins}m
                          </span>
                        </div>
                        <div className="ac-side-row__title">{path.title}</div>
                        <div className="ac-side-row__sub">{path.badgeTitle}</div>
                      </div>
                      <ArrowRight size={14} className="ac-side-row__chev" />
                    </Link>
                  );
                })}
              </div>
            </NeoPanel>

            <NeoPanel
              hud="Verified vault"
              title="Recent certificates"
              actions={
                <Link to="/academy/certificates" className="neo-btn neo-btn--ghost neo-btn--xs">
                  All <ArrowRight />
                </Link>
              }
            >
              {certificates.length === 0 ? (
                <NeoEmpty compact icon={<RouteIcon />} title="No certificates yet">
                  Pass any course assessment to mint a verifiable Helix credential.
                </NeoEmpty>
              ) : (
                <div className="ac-side-list">
                  {certificates.slice(0, 3).map((cert) => {
                    const meta = TRACK_META[cert.track];
                    return (
                      <button
                        key={cert.id}
                        type="button"
                        className="ac-side-row neo-spot"
                        style={{ '--th': meta.hue } as CSSProperties}
                        onClick={() => openCert(cert.id)}
                      >
                        <span className="ac-seal ac-seal--sm" style={{ '--th': meta.hue } as CSSProperties}>
                          <Award />
                        </span>
                        <div className="ac-side-row__body">
                          <div className="ac-side-row__title">{cert.courseTitle}</div>
                          <div className="ac-side-row__sub neo-mono">
                            {cert.credentialCode} · {cert.score}% · {formatDate(cert.issuedAt)}
                          </div>
                        </div>
                        <ArrowRight size={14} className="ac-side-row__chev" />
                      </button>
                    );
                  })}
                </div>
              )}
            </NeoPanel>
          </>
        }
      />
    </div>
  );
}

