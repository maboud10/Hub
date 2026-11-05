import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Compass,
  ListChecks,
} from 'lucide-react';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { computeFreshness } from '@/wiki/constants';
import { useMyWikiState, useVisibleArticles } from '@/wiki/selectors';
import type { FreshFilter } from './SpaceView';
import { ArticleCard } from './wikiUi';

export function BookmarksView() {
  const visibleArticles = useVisibleArticles();
  const myState = useMyWikiState();

  const [freshFilter, setFreshFilter] = useState<FreshFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const bookmarkedArticles = useMemo(() => {
    const bySlug = new Map(visibleArticles.map((a) => [a.slug, a]));
    return myState.bookmarks
      .map((slug) => bySlug.get(slug))
      .filter((a): a is NonNullable<typeof a> => !!a);
  }, [myState.bookmarks, visibleArticles]);

  const activeRunbooks = useMemo(() => {
    return visibleArticles
      .map((article) => {
        const total = article.sections.reduce((n, s) => n + (s.checklist?.length ?? 0), 0);
        const done = (myState.runbookChecks[article.id] ?? []).length;
        return { article, done, total };
      })
      .filter((x) => x.total > 0 && x.done > 0);
  }, [visibleArticles, myState.runbookChecks]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of bookmarkedArticles) {
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [bookmarkedArticles]);

  const filtered = useMemo(() => {
    return bookmarkedArticles.filter((a) => {
      const f = computeFreshness(a);
      if (freshFilter === 'verified' && f.state !== 'verified') return false;
      if (freshFilter === 'attention' && f.state === 'verified') return false;
      if (selectedTag !== 'all' && !a.tags.includes(selectedTag)) return false;
      return true;
    });
  }, [bookmarkedArticles, freshFilter, selectedTag]);

  const verifiedCount = bookmarkedArticles.filter((a) => computeFreshness(a).state === 'verified').length;
  const attentionCount = bookmarkedArticles.length - verifiedCount;

  return (
    <div className="stack stack--lg">
      <div className="wk-filter-bar" style={{ marginBottom: 0 }}>
        <div className="stack stack--sm">
          <h2 className="section-title" style={{ margin: 0 }}>
            <Bookmark style={{ width: 18, height: 18, color: 'var(--wk-ink)' }} />
            My Saved Bookmarks
            <span className="count">{bookmarkedArticles.length}</span>
          </h2>
          <p className="text-sm muted" style={{ margin: 0 }}>
            Quick-access playbooks, incident runbooks, and canonical policies saved to your personal NEXUS shelf.
          </p>
        </div>

        {bookmarkedArticles.length > 0 && (
          <Segmented<FreshFilter>
            label="Filter bookmarks by freshness"
            value={freshFilter}
            onChange={setFreshFilter}
            options={[
              { value: 'all', label: `All (${bookmarkedArticles.length})` },
              {
                value: 'verified',
                label: `Verified (${verifiedCount})`,
                icon: <CheckCircle2 style={{ color: 'var(--success)' }} />,
              },
              {
                value: 'attention',
                label: `Needs review (${attentionCount})`,
                icon: <AlertTriangle style={{ color: 'var(--warning)' }} />,
              },
            ]}
          />
        )}
      </div>

      {tags.length > 0 && (
        <div className="chips" role="group" aria-label="Filter bookmarks by tag">
          <button
            type="button"
            className={cx('chip', selectedTag === 'all' && 'is-active')}
            onClick={() => setSelectedTag('all')}
          >
            All tags <span className="count">{bookmarkedArticles.length}</span>
          </button>
          {tags.map(([tag, count]) => (
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

      {bookmarkedArticles.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Bookmark />}
            title="Your bookmark shelf is empty"
            action={
              <Link to="/wiki" className="btn btn--primary">
                <Compass /> Explore Knowledge Spaces
              </Link>
            }
          >
            Tap the bookmark icon on any playbook or incident runbook to pin it here for 1-click access.
          </EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Bookmark />}
            title="No saved playbooks match these filters"
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
          />
        </div>
      ) : (
        <div className="wk-articles-grid">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* Active Runbook Checklists Section */}
      {activeRunbooks.length > 0 && (
        <section className="section" style={{ marginTop: 8 }}>
          <div className="section-head">
            <h3 className="section-title">
              <ListChecks style={{ width: 18, height: 18, color: 'var(--wk-ink)' }} />
              My Runbook Checklists in Progress
              <span className="count">{activeRunbooks.length}</span>
            </h3>
          </div>
          <div className="card stack" style={{ padding: 14 }}>
            {activeRunbooks.map(({ article, done, total }) => {
              const pct = Math.round((done / total) * 100);
              return (
                <Link
                  key={article.id}
                  to={`/wiki/doc/${article.slug}`}
                  className="list-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="grow stack stack--sm" style={{ minWidth: 0 }}>
                    <div className="row row--between" style={{ gap: 10 }}>
                      <strong className="truncate">{article.title}</strong>
                      <span className="text-xs mono" style={{ color: 'var(--wk-ink)' }}>
                        {done}/{total} steps ({pct}%)
                      </span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${pct}%`, background: 'var(--wk-grad)' }} />
                    </div>
                  </div>
                  <ArrowRight style={{ width: 16, height: 16, color: 'var(--text-3)', flex: 'none' }} />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
