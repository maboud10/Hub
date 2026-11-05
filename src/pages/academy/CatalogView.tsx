import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Check,
  Clock,
  Compass,
  FilterX,
  GraduationCap,
  Layers,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { FORMAT_LABEL, LEVEL_META, TRACK_META, TRACK_ORDER } from '@/academy/constants';
import { useMyLearning } from '@/academy/selectors';
import type { AcademyTrack, CourseFormat, CourseLevel } from '@/academy/types';
import { useHub } from '@/store/hub';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { ProgressRing, TrackBadge } from './shared';

const LEVEL_OPTIONS: { id: 'all' | CourseLevel; label: string }[] = [
  { id: 'all', label: 'All Levels' },
  { id: 'foundations', label: 'Foundations' },
  { id: 'practitioner', label: 'Practitioner' },
  { id: 'advanced', label: 'Advanced' },
];

const FORMAT_OPTIONS: { id: 'all' | CourseFormat; label: string }[] = [
  { id: 'all', label: 'All Formats' },
  { id: 'interactive', label: 'Interactive' },
  { id: 'scenario', label: 'Scenario Lab' },
  { id: 'certification', label: 'Certification' },
  { id: 'workshop', label: 'Workshop' },
];

export function CatalogView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const { all, paths } = useMyLearning();

  const paramTrack = searchParams.get('track') as AcademyTrack | null;
  const [query, setQuery] = useState('');
  const [track, setTrack] = useState<'all' | AcademyTrack>(
    paramTrack && TRACK_ORDER.includes(paramTrack) ? paramTrack : 'all',
  );
  const [level, setLevel] = useState<'all' | CourseLevel>('all');
  const [format, setFormat] = useState<'all' | CourseFormat>('all');

  useEffect(() => {
    if (paramTrack && TRACK_ORDER.includes(paramTrack)) {
      setTrack(paramTrack);
    }
  }, [paramTrack]);

  const selectTrack = (next: 'all' | AcademyTrack) => {
    setTrack(next);
    if (next === 'all') {
      searchParams.delete('track');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ track: next }, { replace: true });
    }
  };

  const trackCounts = useMemo(() => {
    const map: Record<string, number> = { all: all.length };
    for (const t of TRACK_ORDER) {
      map[t] = all.filter((x) => x.course.track === t).length;
    }
    return map;
  }, [all]);

  const filteredPaths = useMemo(() => {
    if (track === 'all') return paths;
    return paths.filter((p) => p.path.track === track);
  }, [paths, track]);

  const filteredCourses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(({ course }) => {
      if (track !== 'all' && course.track !== track) return false;
      if (level !== 'all' && course.level !== level) return false;
      if (format !== 'all' && course.format !== format) return false;
      if (!q) return true;
      const instructor = users.find((u) => u.id === course.instructorId);
      const hay = [
        course.title,
        course.tagline,
        course.description,
        ...course.skills,
        instructor?.name ?? '',
        TRACK_META[course.track].label,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [all, track, level, format, query, users]);

  const isFiltered = query.trim().length > 0 || track !== 'all' || level !== 'all' || format !== 'all';

  const clearFilters = () => {
    setQuery('');
    selectTrack('all');
    setLevel('all');
    setFormat('all');
  };

  return (
    <div className="stack stack--lg">
      {/* Search & Multi-Facet Filter Bar */}
      <div className="ac-filter-bar">
        <div className="ac-filter-row">
          <div className="input-wrap ac-filter-search">
            <Search />
            <input
              type="search"
              className="input"
              placeholder="Search courses, skills, scenarios, or instructors…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search Academy catalog"
            />
          </div>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 152 }}
            value={level}
            onChange={(e) => setLevel(e.target.value as 'all' | CourseLevel)}
            aria-label="Filter by level"
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 162 }}
            value={format}
            onChange={(e) => setFormat(e.target.value as 'all' | CourseFormat)}
            aria-label="Filter by format"
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          {isFiltered && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
              <FilterX /> Reset
            </button>
          )}
        </div>

        {/* Track Pills */}
        <div className="chips" role="tablist" aria-label="Filter by Academy track">
          <button
            type="button"
            className={cx('chip', track === 'all' && 'is-active')}
            onClick={() => selectTrack('all')}
          >
            All Tracks <span className="count">{trackCounts.all}</span>
          </button>
          {TRACK_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={cx('chip', track === t && 'is-active')}
              onClick={() => selectTrack(t)}
            >
              {TRACK_META[t].label} <span className="count">{trackCounts[t] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Role Learning Paths Section */}
      {filteredPaths.length > 0 && !query.trim() && (
        <section className="stack">
          <div className="section-head" style={{ marginBottom: 2 }}>
            <h2 className="section-title">
              <GraduationCap size={19} style={{ color: '#818cf8' }} /> Role Learning Paths
              <span className="count">{filteredPaths.length}</span>
            </h2>
            <span className="text-xs muted">Multi-course sequences unlocking specialist role badges</span>
          </div>

          <div className="ac-paths-grid">
            {filteredPaths.map(({ path, items, done, total, pct, totalMins }) => {
              const nextCourse = items.find((x) => x.progressPct < 100)?.course ?? items[0]?.course;
              return (
                <article key={path.id} className="ac-path-card" style={{ '--th': path.hue } as CSSProperties}>
                  <div className="ac-path-card__top">
                    <div className="stack stack--sm" style={{ minWidth: 0 }}>
                      <div className="row row--wrap" style={{ gap: 6 }}>
                        <TrackBadge track={path.track} short />
                        <span className="badge badge--info">{path.badgeTitle}</span>
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17.5, fontWeight: 650 }}>
                        {path.title}
                      </h3>
                      <p className="text-xs muted">{path.description}</p>
                    </div>
                    <ProgressRing pct={pct} hue={path.hue} size={54} />
                  </div>

                  <div className="row row--wrap" style={{ gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
                    <span>Audience: <strong style={{ color: 'var(--text-2)' }}>{path.targetAudience}</strong></span>
                    <span>· {totalMins} mins total</span>
                  </div>

                  <div className="ac-path-steps">
                    {items.map((step, idx) => {
                      const isDone = step.progressPct === 100;
                      return (
                        <button
                          key={step.course.id}
                          type="button"
                          className={cx('ac-path-step', isDone && 'is-done')}
                          onClick={() => navigate(`/academy/course/${step.course.id}`)}
                        >
                          <span className="ac-path-step__idx">{isDone ? <Check /> : idx + 1}</span>
                          <span className="truncate grow">{step.course.title}</span>
                          <span className="mono text-xs faint">
                            {isDone ? 'Done' : step.progressPct > 0 ? `${step.progressPct}%` : `${step.course.durationMins}m`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="row row--between" style={{ marginTop: 'auto', paddingTop: 4 }}>
                    <span className="mono text-xs muted">
                      {done}/{total} courses certified
                    </span>
                    {nextCourse && (
                      <Link to={`/academy/course/${nextCourse.id}`} className="btn btn--sm ac-btn-indigo">
                        {pct === 100 ? 'Review Path' : pct > 0 ? 'Continue Path' : 'Begin Path'} <ArrowRight />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Full Course Grid */}
      <section className="stack">
        <div className="section-head" style={{ marginBottom: 2 }}>
          <h2 className="section-title">
            <Layers size={18} style={{ color: '#818cf8' }} /> Interactive Course Catalog
            <span className="count">{filteredCourses.length}</span>
          </h2>
        </div>

        {filteredCourses.length === 0 ? (
          <EmptyState
            icon={<Compass />}
            title="No courses match those filters"
            action={
              <button type="button" className="btn btn--sm" onClick={clearFilters}>
                <FilterX /> Clear filters
              </button>
            }
          >
            Try broadening your track, difficulty level, or search keywords.
          </EmptyState>
        ) : (
          <div className="ac-courses-grid">
            {filteredCourses.map(({ course, enrollment, progressPct }) => {
              const instructor = users.find((u) => u.id === course.instructorId);
              const levelMeta = LEVEL_META[course.level];
              const isCompleted = enrollment?.status === 'completed';

              return (
                <article key={course.id} className="ac-course-card" style={{ '--th': course.hue } as CSSProperties}>
                  <div className="row row--between row--wrap" style={{ gap: 6 }}>
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <TrackBadge track={course.track} short />
                      {course.mandatory && (
                        <span className="badge badge--warning">
                          <ShieldCheck /> Mandatory
                        </span>
                      )}
                    </div>
                    <span className={`badge badge--${levelMeta.badgeTone}`}>{levelMeta.label}</span>
                  </div>

                  <Link to={`/academy/course/${course.id}`} className="ac-course-card__title">
                    {course.title}
                  </Link>
                  <p className="text-xs muted clamp-2">{course.tagline}</p>

                  {/* Skills Chips */}
                  <div className="row row--wrap" style={{ gap: 5 }}>
                    {course.skills.slice(0, 4).map((sk) => (
                      <span key={sk} className="tag">
                        {sk}
                      </span>
                    ))}
                  </div>

                  {/* Enrollment Progress if active or completed */}
                  {enrollment && (
                    <div className="stack stack--sm" style={{ marginTop: 2 }}>
                      <div className="row row--between text-xs">
                        <span className={isCompleted ? 'accent-ink' : 'muted'} style={{ fontWeight: 600 }}>
                          {isCompleted ? 'Certified ✓' : `In progress · ${progressPct}%`}
                        </span>
                        <span className="mono faint">
                          {enrollment.completedLessonIds.length}/{course.lessons.length} lessons
                        </span>
                      </div>
                      <div className="ac-bar" style={{ '--th': isCompleted ? 152 : course.hue } as CSSProperties}>
                        <i style={{ width: `${Math.max(5, progressPct)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="ac-course-card__meta">
                    <span>
                      <Clock /> {course.durationMins}m
                    </span>
                    <span>
                      <Zap /> +{course.xp} XP
                    </span>
                    <span>{FORMAT_LABEL[course.format]}</span>
                    <span>{course.lessons.length} lessons</span>
                  </div>

                  <div className="ac-course-card__foot">
                    {instructor ? (
                      <div className="row" style={{ gap: 8, minWidth: 0 }}>
                        <Avatar user={instructor} size={26} />
                        <div className="truncate">
                          <div className="text-xs truncate" style={{ fontWeight: 600, color: 'var(--text)' }}>
                            {instructor.name}
                          </div>
                          <div className="text-xs faint truncate">{instructor.title}</div>
                        </div>
                      </div>
                    ) : (
                      <span />
                    )}

                    <Link
                      to={`/academy/course/${course.id}`}
                      className={cx('btn btn--sm', isCompleted ? '' : 'ac-btn-indigo')}
                    >
                      {isCompleted ? 'Review' : enrollment ? 'Continue' : 'Open Course'} <ArrowRight />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
