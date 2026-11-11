/**
 * Catalog & learning paths. Filters live in the URL (`track`, `level`,
 * `format`, `q`) so Nova on the Learning home can deep-link a question:
 * `/academy/catalog?q=…` ranks courses by relevance — stemmed terms matched
 * across titles, skills, tracks, taglines, lessons and instructors.
 * The track tabs + search render in the stage toolbar (`CatalogToolbar`).
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Check, Compass, FilterX, Route as RouteIcon, Sparkles, X } from 'lucide-react';
import { NeoBanner, NeoBanners, NeoEmpty, NeoPanel, NeoSearch, NeoTabs } from '@/components/neo';
import { FORMAT_LABEL, TRACK_META, TRACK_ORDER } from '@/academy/constants';
import { useMyLearning, type EnrichedCourseItem } from '@/academy/selectors';
import type { AcademyTrack, Course, CourseFormat, CourseLevel } from '@/academy/types';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { CourseCard, ProgressRing, TrackBadge, usePatchParams, useParamText } from './shared';
import { PathTrackerCompact } from './trackers';

const LEVEL_OPTIONS: { id: 'all' | CourseLevel; label: string }[] = [
  { id: 'all', label: 'All levels' },
  { id: 'foundations', label: 'Foundations' },
  { id: 'practitioner', label: 'Practitioner' },
  { id: 'advanced', label: 'Advanced' },
];

const FORMAT_OPTIONS: { id: 'all' | CourseFormat; label: string }[] = [
  { id: 'all', label: 'All formats' },
  { id: 'interactive', label: 'Interactive' },
  { id: 'scenario', label: 'Scenario lab' },
  { id: 'certification', label: 'Certification' },
  { id: 'workshop', label: 'Workshop' },
];

type SortId = 'auto' | 'xp' | 'short' | 'az';

/* ---------- URL-driven filters ---------- */

export function useCatalogFilters() {
  const [sp] = useSearchParams();
  const patch = usePatchParams();
  const rawTrack = sp.get('track') as AcademyTrack | null;
  const track: 'all' | AcademyTrack = rawTrack && TRACK_ORDER.includes(rawTrack) ? rawTrack : 'all';
  const rawLevel = sp.get('level');
  const level = (LEVEL_OPTIONS.some((o) => o.id === rawLevel) ? rawLevel : 'all') as 'all' | CourseLevel;
  const rawFormat = sp.get('format');
  const format = (FORMAT_OPTIONS.some((o) => o.id === rawFormat) ? rawFormat : 'all') as 'all' | CourseFormat;
  const q = (sp.get('q') ?? '').trim();
  const set = (next: Partial<Record<'q' | 'track' | 'level' | 'format', string | null>>) =>
    patch(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v === 'all' ? null : v])));
  return {
    q,
    track,
    level,
    format,
    set,
    clear: () => set({ q: null, track: null, level: null, format: null }),
    isFiltered: !!q || track !== 'all' || level !== 'all' || format !== 'all',
  };
}

/* ---------- Nova relevance search ---------- */

const STOP = new Set(
  'a an the and or to for of in on at by with from my me i im want wanna learn learning how do does can could get better improve grow level up skill skills course courses class about into more some what is are be it this that helix need help like would should please teach show find start your our we you new really'.split(
    ' ',
  ),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ly')) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .map(stem);
}

const hits = (field: string[], t: string) => field.some((f) => f === t || (t.length >= 4 && f.length >= 4 && (f.startsWith(t) || t.startsWith(f))));

/** Relevance score per course (0 = no match). Falls back to plain substring search for stop-word-only queries. */
export function scoreCourses(courses: Course[], query: string, users: User[]): Map<string, number> {
  const out = new Map<string, number>();
  const qTerms = [...new Set(terms(query))];
  const raw = query.trim().toLowerCase();
  for (const c of courses) {
    const instructor = users.find((u) => u.id === c.instructorId)?.name ?? '';
    const fields: [string[], number][] = [
      [terms(c.title), 3],
      [terms(c.skills.join(' ')), 2.5],
      [terms(`${TRACK_META[c.track].label} ${TRACK_META[c.track].short}`), 2],
      [terms(c.tagline), 1.5],
      [terms(c.lessons.map((l) => l.title).join(' ')), 1.2],
      [terms(c.description), 1],
      [terms(`${instructor} ${FORMAT_LABEL[c.format]}`), 1],
    ];
    if (!qTerms.length) {
      const hay = `${c.title} ${c.tagline} ${c.description} ${c.skills.join(' ')} ${instructor}`.toLowerCase();
      out.set(c.id, raw && hay.includes(raw) ? 1 : 0);
      continue;
    }
    let score = 0;
    let matched = 0;
    for (const t of qTerms) {
      let best = 0;
      for (const [field, w] of fields) if (w > best && hits(field, t)) best = w;
      if (best) matched++;
      score += best;
    }
    if (matched === qTerms.length && qTerms.length > 1) score += 1.5;
    out.set(c.id, score);
  }
  return out;
}

/* ---------- Toolbar (rendered under the stage header) ---------- */

export function CatalogToolbar() {
  const { track, set } = useCatalogFilters();
  const { all } = useMyLearning();
  const [text, setText] = useParamText('q');
  const search = useRef<HTMLInputElement>(null);
  useHotkeys({
    s: (e) => {
      e.preventDefault();
      search.current?.focus();
    },
  });

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: all.length };
    for (const t of TRACK_ORDER) m[t] = all.filter((x) => x.course.track === t).length;
    return m;
  }, [all]);

  return (
    <>
      <NeoTabs<'all' | AcademyTrack>
        label="Academy tracks"
        value={track}
        onChange={(t) => set({ track: t })}
        items={[
          { value: 'all', label: 'All', count: counts.all },
          ...TRACK_ORDER.map((t) => ({ value: t, label: TRACK_META[t].short, count: counts[t] ?? 0, title: TRACK_META[t].description })),
        ]}
      />
      <div className="grow" />
      <NeoSearch
        value={text}
        onChange={setText}
        placeholder="Search courses, skills, people…"
        kbd="S"
        inputRef={search}
        size="sm"
        className="ac-toolbar__search"
        label="Search the Academy catalog"
      />
    </>
  );
}

/* ---------- View ---------- */

export function CatalogView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const { all, paths } = useMyLearning();
  const { q, track, level, format, set, clear, isFiltered } = useCatalogFilters();
  const [sort, setSort] = useState<SortId>('auto');

  const scores = useMemo(() => (q ? scoreCourses(all.map((x) => x.course), q, users) : null), [all, q, users]);

  const filteredPaths = useMemo(() => (track === 'all' ? paths : paths.filter((p) => p.path.track === track)), [paths, track]);

  const list = useMemo(() => {
    const rows = all.filter(({ course }) => {
      if (track !== 'all' && course.track !== track) return false;
      if (level !== 'all' && course.level !== level) return false;
      if (format !== 'all' && course.format !== format) return false;
      if (scores && !(scores.get(course.id) ?? 0)) return false;
      return true;
    });
    const recommended = (a: EnrichedCourseItem, b: EnrichedCourseItem) =>
      Number(b.enrollment?.status === 'in-progress') - Number(a.enrollment?.status === 'in-progress') ||
      Number(a.enrollment?.status === 'completed') - Number(b.enrollment?.status === 'completed') ||
      Number(!!b.course.featured) - Number(!!a.course.featured) ||
      b.course.xp - a.course.xp;
    const by: Record<SortId, (a: EnrichedCourseItem, b: EnrichedCourseItem) => number> = {
      auto: scores ? (a, b) => (scores.get(b.course.id) ?? 0) - (scores.get(a.course.id) ?? 0) || recommended(a, b) : recommended,
      xp: (a, b) => b.course.xp - a.course.xp,
      short: (a, b) => a.course.durationMins - b.course.durationMins,
      az: (a, b) => a.course.title.localeCompare(b.course.title),
    };
    return [...rows].sort(by[sort]);
  }, [all, track, level, format, scores, sort]);

  const best = scores && list.length ? (scores.get(list[0].course.id) ?? 0) : 0;
  const strong = scores ? list.filter((x) => (scores.get(x.course.id) ?? 0) >= best * 0.6).length : 0;

  return (
    <div className="ac-catalog">
      {q && (
        <NeoBanners>
          <NeoBanner
            tone="indigo"
            icon={<Sparkles />}
            title={list.length ? `Nova found ${list.length} ${list.length === 1 ? 'course' : 'courses'}` : 'Nova found no direct match'}
            meta={list.length > 1 && strong < list.length ? `${strong} strong ${strong === 1 ? 'match' : 'matches'}` : undefined}
            action={
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => set({ q: null })}>
                <X /> Clear
              </button>
            }
          >
            for “{q}”{list.length ? ' — best matches first' : ' — try fewer words or another track'}
          </NeoBanner>
        </NeoBanners>
      )}

      {filteredPaths.length > 0 && !q && (
        <NeoPanel
          id="ac-paths"
          className="ac-paths"
          icon={<RouteIcon />}
          hud="Role paths"
          title="Learning paths"
          actions={<span className="ac-panel-note">Multi-course sequences that unlock role badges</span>}
        >
          <div className="ac-pgrid neo-stagger">
            {filteredPaths.map(({ path, items, done, total, pct, totalMins }, i) => {
              const nextCourse = items.find((x) => x.progressPct < 100)?.course ?? items[0]?.course;
              return (
                <article key={path.id} className="ac-path neo-spot" style={{ '--th': path.hue, '--i': i } as CSSProperties}>
                  <div className="ac-path__top">
                    <div className="ac-path__titles">
                      <div className="ac-path__chips">
                        <TrackBadge track={path.track} short />
                        <span className="neo-chip neo-chip--sm" data-tone="app">
                          {path.badgeTitle}
                        </span>
                      </div>
                      <h3 className="ac-path__title">{path.title}</h3>
                      <p className="ac-path__desc">{path.description}</p>
                    </div>
                    <ProgressRing pct={pct} hue={path.hue} size={54} />
                  </div>

                  <div className="ac-path__meta">
                    <span>
                      For <b>{path.targetAudience}</b>
                    </span>
                    <span>· {totalMins} mins total</span>
                  </div>

                  <PathTrackerCompact items={items} label={path.title} />

                  <ol className="ac-steps">
                    {items.map((step, idx) => {
                      const isDone = step.progressPct === 100;
                      return (
                        <li key={step.course.id}>
                          <button type="button" className={cx('ac-step', isDone && 'is-done')} onClick={() => navigate(`/academy/course/${step.course.id}`)}>
                            <span className="ac-step__idx">{isDone ? <Check /> : idx + 1}</span>
                            <span className="ac-step__name">{step.course.title}</span>
                            <span className="ac-step__meta">{isDone ? 'Done' : step.progressPct > 0 ? `${step.progressPct}%` : `${step.course.durationMins}m`}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="ac-path__foot">
                    <span className="ac-path__count">
                      {done}/{total} courses certified
                    </span>
                    {nextCourse && (
                      <Link to={`/academy/course/${nextCourse.id}`} className={cx('neo-btn neo-btn--sm', pct === 100 ? 'neo-btn--ghost' : 'neo-btn--soft')}>
                        {pct === 100 ? 'Review path' : pct > 0 ? 'Continue path' : 'Begin path'} <ArrowRight />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </NeoPanel>
      )}

      <NeoPanel
        className="ac-courses"
        icon={<Compass />}
        hud={q ? 'Best matches' : track === 'all' ? 'Full catalog' : TRACK_META[track].label}
        title={`${list.length} ${list.length === 1 ? 'course' : 'courses'}`}
        actions={
          <div className="ac-filters">
            <select className="neo-select neo-select--sm" value={level} onChange={(e) => set({ level: e.target.value })} aria-label="Filter by level">
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="neo-select neo-select--sm" value={format} onChange={(e) => set({ format: e.target.value })} aria-label="Filter by format">
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className="neo-select neo-select--sm" value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Sort courses">
              <option value="auto">{q ? 'Best match' : 'Recommended'}</option>
              <option value="xp">Most XP</option>
              <option value="short">Shortest first</option>
              <option value="az">A–Z</option>
            </select>
          </div>
        }
      >
        {list.length === 0 ? (
          <NeoEmpty
            icon={<Compass />}
            title={q ? 'Nothing in the catalog matches that yet' : 'No courses match those filters'}
            action={
              isFiltered ? (
                <button type="button" className="neo-btn neo-btn--soft" onClick={clear}>
                  <FilterX /> Clear filters
                </button>
              ) : undefined
            }
          >
            {q ? 'Try a broader word (e.g. “prompting”, “security”, “interviews”) or ask People Ops to author a course.' : 'Try another track, level or format.'}
          </NeoEmpty>
        ) : (
          <div className="ac-cgrid neo-stagger">
            {list.map((item, i) => (
              <CourseCard key={item.course.id} item={item} i={i} />
            ))}
          </div>
        )}
      </NeoPanel>
    </div>
  );
}
