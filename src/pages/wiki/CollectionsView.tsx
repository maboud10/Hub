import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  GraduationCap,
  Layers,
  Rocket,
} from 'lucide-react';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { computeFreshness } from '@/wiki/constants';
import { useMyWikiState, useVisibleCollections } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { FreshFilter } from './SpaceView';
import { FreshnessPill, ProgressRing, SpacePill } from './wikiUi';

export function CollectionsIndex() {
  const collections = useVisibleCollections();
  const [freshFilter, setFreshFilter] = useState<FreshFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of collections) {
      for (const a of c.articles) {
        for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [collections]);

  const filteredPacks = useMemo(() => {
    return collections.filter((pack) => {
      if (selectedTag !== 'all' && !pack.articles.some((a) => a.tags.includes(selectedTag))) {
        return false;
      }
      if (freshFilter === 'verified') {
        return pack.articles.every((a) => computeFreshness(a).state === 'verified');
      }
      if (freshFilter === 'attention') {
        return pack.articles.some((a) => computeFreshness(a).state !== 'verified');
      }
      return true;
    });
  }, [collections, freshFilter, selectedTag]);

  return (
    <div className="stack stack--lg">
      <div className="wk-filter-bar">
        <div className="stack stack--sm">
          <h2 className="section-title" style={{ margin: 0 }}>
            <Layers style={{ width: 19, height: 19, color: 'var(--wk-ink)' }} />
            Curated Reading Packs
            <span className="count">{filteredPacks.length}</span>
          </h2>
          <p className="text-sm muted" style={{ margin: 0 }}>
            Structured playbook sequences with persisted reading progress for onboarding, on-call, and people leadership.
          </p>
        </div>

        <Segmented<FreshFilter>
          label="Filter reading packs by freshness"
          value={freshFilter}
          onChange={setFreshFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'verified', label: 'Verified', icon: <CheckCircle2 style={{ color: 'var(--success)' }} /> },
            { value: 'attention', label: 'Needs review', icon: <AlertTriangle style={{ color: 'var(--warning)' }} /> },
          ]}
        />
      </div>

      {allTags.length > 0 && (
        <div className="chips" role="group" aria-label="Filter packs by tag">
          <button
            type="button"
            className={cx('chip', selectedTag === 'all' && 'is-active')}
            onClick={() => setSelectedTag('all')}
          >
            All topics
          </button>
          {allTags.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              className={cx('chip', selectedTag === tag && 'is-active')}
              onClick={() => setSelectedTag(selectedTag === tag ? 'all' : tag)}
            >
              #{tag} <span className="count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {filteredPacks.length > 0 ? (
        <div className="wk-packs-grid">
          {filteredPacks.map(({ collection, articles, readCount, totalCount, pct, totalMins }) => (
            <Link
              key={collection.id}
              to={`/wiki/collections/${collection.slug}`}
              className="wk-pack-card"
              style={{ '--pk-h': collection.hue } as CSSProperties}
            >
              <div className="row row--between" style={{ gap: 12, alignItems: 'flex-start' }}>
                <div className="row row--wrap" style={{ gap: 6 }}>
                  <span className="tag">{collection.audienceLabel}</span>
                  {collection.onboardingPack && (
                    <span className="badge" style={{ '--b-rgb': '45 212 191' } as CSSProperties}>
                      <Rocket /> Week-1 Onboarding
                    </span>
                  )}
                </div>
                <ProgressRing done={readCount} total={totalCount} size={56} sublabel="read" />
              </div>

              <div className="stack stack--sm">
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 650, margin: 0 }}>
                  {collection.title}
                </h3>
                <p className="text-sm muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  {collection.description}
                </p>
              </div>

              <div className="stack stack--sm" style={{ marginTop: 2 }}>
                {articles.slice(0, 3).map((a, idx) => (
                  <div key={a.id} className="row" style={{ gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
                    <span className="mono faint">0{idx + 1}</span>
                    <span className="truncate">{a.title}</span>
                    <span className="spacer" />
                    <span className="mono faint">{a.readMins}m</span>
                  </div>
                ))}
                {articles.length > 3 && (
                  <span className="text-xs faint">+{articles.length - 3} more playbooks in pack</span>
                )}
              </div>

              <div style={{ marginTop: 'auto', paddingTop: 10 }}>
                <div className="progress">
                  <span style={{ width: `${pct}%`, background: 'var(--wk-grad)' }} />
                </div>
                <div className="row row--between" style={{ marginTop: 8 }}>
                  <span className="text-xs muted">
                    {readCount} of {totalCount} completed · ~{totalMins} mins
                  </span>
                  <span className="text-xs mono" style={{ color: 'var(--wk-ink)', fontWeight: 600 }}>
                    Open pack <ArrowRight style={{ width: 12, height: 12, verticalAlign: '-2px' }} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Layers />}
            title="No reading packs match these filters"
            action={
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setFreshFilter('all');
                  setSelectedTag('all');
                }}
              >
                Reset filters
              </button>
            }
          >
            Clear the active freshness or tag filter to see all reading packs cleared for your role.
          </EmptyState>
        </div>
      )}
    </div>
  );
}

export function CollectionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const collections = useVisibleCollections();
  const spaces = useWiki((s) => s.spaces);
  const markRead = useWiki((s) => s.markRead);
  const toggleBookmark = useWiki((s) => s.toggleBookmark);
  const myState = useMyWikiState();

  const [freshFilter, setFreshFilter] = useState<FreshFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const pack = collections.find((c) => c.collection.slug === slug || c.collection.id === slug);
  const spaceMap = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const packTags = useMemo(() => {
    if (!pack) return [];
    const counts = new Map<string, number>();
    for (const a of pack.articles) {
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [pack]);

  const visibleSteps = useMemo(() => {
    if (!pack) return [];
    return pack.articles
      .map((article, index) => ({ article, stepNumber: index + 1 }))
      .filter(({ article }) => {
        const f = computeFreshness(article);
        if (freshFilter === 'verified' && f.state !== 'verified') return false;
        if (freshFilter === 'attention' && f.state === 'verified') return false;
        if (selectedTag !== 'all' && !article.tags.includes(selectedTag)) return false;
        return true;
      });
  }, [pack, freshFilter, selectedTag]);

  if (!pack) {
    return (
      <div className="card">
        <EmptyState
          icon={<BookOpen />}
          title="Reading Pack unavailable"
          action={
            <Link to="/wiki/collections" className="btn btn--primary">
              <ArrowLeft /> Browse Reading Packs
            </Link>
          }
        >
          This reading pack does not exist or its playbooks belong to spaces outside your role clearance.
        </EmptyState>
      </div>
    );
  }

  const readSet = new Set(myState.readSlugs);
  const nextUnread = pack.articles.find((a) => !readSet.has(a.slug));

  const markAllRead = () => {
    for (const a of pack.articles) {
      markRead(a.slug, true);
    }
    toast.success(`Completed all ${pack.totalCount} playbooks in “${pack.collection.title}”! 🎉`);
  };

  return (
    <div className="stack stack--lg">
      <nav className="wk-breadcrumb" aria-label="Breadcrumb">
        <Link to="/wiki">Knowledge Base</Link>
        <ChevronRight />
        <Link to="/wiki/collections">Reading Packs</Link>
        <ChevronRight />
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{pack.collection.title}</span>
      </nav>

      {/* Pack Header Card */}
      <div
        className="card hud"
        style={
          {
            background: `radial-gradient(520px 200px at 100% 0%, hsl(${pack.collection.hue} 82% 58% / 0.16), transparent 72%), var(--tile-bg)`,
          } as CSSProperties
        }
      >
        <div className="row row--between row--wrap" style={{ gap: 20, alignItems: 'center' }}>
          <div className="row" style={{ gap: 18, alignItems: 'center', minWidth: 0, flex: '1 1 320px' }}>
            <ProgressRing done={pack.readCount} total={pack.totalCount} size={72} sublabel="done" />
            <div className="stack stack--sm" style={{ minWidth: 0 }}>
              <div className="row row--wrap" style={{ gap: 8 }}>
                <span className="tag">{pack.collection.audienceLabel}</span>
                {pack.collection.onboardingPack && (
                  <span className="badge" style={{ '--b-rgb': '45 212 191' } as CSSProperties}>
                    <Rocket /> Synced Onboarding Pack
                  </span>
                )}
                <span className="text-xs muted">
                  <Clock style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> ~{pack.totalMins} mins total
                </span>
              </div>
              <h2 className="page-title" style={{ fontSize: 'clamp(22px, 2.8vw, 30px)' }}>
                {pack.collection.title}
              </h2>
              <p className="muted text-sm" style={{ margin: 0, maxWidth: '65ch' }}>
                {pack.collection.description}
              </p>
            </div>
          </div>

          <div className="row row--wrap" style={{ gap: 8 }}>
            {nextUnread ? (
              <Link to={`/wiki/doc/${nextUnread.slug}`} className="wk-btn-cortex">
                Continue: {nextUnread.title} <ArrowRight />
              </Link>
            ) : (
              <span className="badge badge--success" style={{ height: 36, padding: '0 14px', fontSize: 13 }}>
                <CheckCircle2 /> Pack 100% Complete
              </span>
            )}
            {pack.readCount < pack.totalCount && (
              <button type="button" className="btn btn--sm" onClick={markAllRead}>
                <Check /> Mark all read
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="row row--between text-xs muted" style={{ marginBottom: 6 }}>
            <span>
              Reading completion: <strong style={{ color: 'var(--text)' }}>{pack.readCount}</strong> of{' '}
              <strong style={{ color: 'var(--text)' }}>{pack.totalCount}</strong> playbooks
            </span>
            <span className="mono">{pack.pct}%</span>
          </div>
          <div className="progress">
            <span style={{ width: `${pack.pct}%`, background: 'var(--wk-grad)' }} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="stack">
        <div className="wk-filter-bar" style={{ marginBottom: 6 }}>
          <Segmented<FreshFilter>
            label="Filter steps by freshness"
            value={freshFilter}
            onChange={setFreshFilter}
            options={[
              { value: 'all', label: `All (${pack.articles.length})` },
              { value: 'verified', label: 'Verified', icon: <CheckCircle2 style={{ color: 'var(--success)' }} /> },
              { value: 'attention', label: 'Needs review', icon: <AlertTriangle style={{ color: 'var(--warning)' }} /> },
            ]}
          />
        </div>
        {packTags.length > 0 && (
          <div className="chips" role="group" aria-label="Filter steps by tag">
            <button
              type="button"
              className={cx('chip', selectedTag === 'all' && 'is-active')}
              onClick={() => setSelectedTag('all')}
            >
              All tags
            </button>
            {packTags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                className={cx('chip', selectedTag === tag && 'is-active')}
                onClick={() => setSelectedTag(selectedTag === tag ? 'all' : tag)}
              >
                #{tag} <span className="count">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Numbered Reading Steps */}
      <div className="wk-step-list">
        {visibleSteps.map(({ article, stepNumber }) => {
          const isRead = readSet.has(article.slug);
          const isSaved = myState.bookmarks.includes(article.slug);
          const sp = spaceMap.get(article.spaceId);

          return (
            <div key={article.id} className={cx('wk-step-row', isRead && 'is-read')}>
              <span className="wk-step-num">
                {isRead ? <Check style={{ width: 17, height: 17 }} /> : String(stepNumber).padStart(2, '0')}
              </span>

              <div className="stack stack--sm" style={{ minWidth: 0 }}>
                <div className="row row--wrap" style={{ gap: 7 }}>
                  {sp && <SpacePill space={sp} />}
                  <FreshnessPill article={article} />
                  <span className="text-xs mono muted">
                    <Clock style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> {article.readMins} min read
                  </span>
                  {article.relatedCourseIds.length > 0 && (
                    <span className="badge badge--info">
                      <GraduationCap /> +{article.relatedCourseIds.length} Academy lab
                    </span>
                  )}
                </div>

                <Link
                  to={`/wiki/doc/${article.slug}`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 650,
                    color: 'var(--text)',
                    textDecoration: 'none',
                  }}
                >
                  {article.title}
                </Link>

                <p className="text-sm muted clamp-2" style={{ margin: 0 }}>
                  {article.tldr}
                </p>
              </div>

              <div className="row row--wrap" style={{ gap: 8 }}>
                <button
                  type="button"
                  className={cx('btn btn--sm', isRead && 'btn--success')}
                  onClick={() => {
                    markRead(article.slug, !isRead);
                    toast.info(isRead ? 'Marked unread' : `Marked “${article.title}” as read ✓`);
                  }}
                >
                  <CheckCircle2 />
                  {isRead ? 'Read ✓' : 'Mark read'}
                </button>

                <button
                  type="button"
                  className={cx('wk-bookmark-btn', isSaved && 'is-saved')}
                  aria-label={isSaved ? 'Remove bookmark' : 'Bookmark'}
                  onClick={() => toast.result(toggleBookmark(article.slug))}
                >
                  <Bookmark fill={isSaved ? 'currentColor' : 'none'} />
                </button>

                <Link to={`/wiki/doc/${article.slug}`} className="btn btn--sm">
                  Read playbook <ArrowRight />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
