import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Bookmark, Compass, History, ListChecks } from 'lucide-react';
import { Bar, NeoEmpty, NeoHome, NeoPanel } from '@/components/neo';
import { computeFreshness } from '@/wiki/constants';
import { useMyWikiState, useVisibleArticles } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { WikiArticle } from '@/wiki/types';
import { ArticleCard, FreshDot, FreshTabs, TagFilter, type FreshFilter } from './wikiUi';

export function BookmarksView() {
  const visibleArticles = useVisibleArticles();
  const myState = useMyWikiState();
  const spaces = useWiki((s) => s.spaces);

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

  const recentlyViewed = useMemo(() => {
    const bySlug = new Map(visibleArticles.map((a) => [a.slug, a]));
    return myState.recentSlugs
      .map((slug) => bySlug.get(slug))
      .filter((a): a is WikiArticle => !!a)
      .slice(0, 5);
  }, [myState.recentSlugs, visibleArticles]);

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
  const spaceName = (a: WikiArticle) => spaces.find((s) => s.id === a.spaceId)?.name ?? 'Knowledge Base';

  return (
    <NeoHome
      sideLabel="Reading activity"
      main={
        <>
          {bookmarkedArticles.length > 0 && (
            <>
              <div className="wk-filters">
                <FreshTabs
                  label="Filter bookmarks by freshness"
                  value={freshFilter}
                  onChange={setFreshFilter}
                  counts={{ all: bookmarkedArticles.length, verified: verifiedCount, attention: attentionCount }}
                />
                <span className="neo-hud">{bookmarkedArticles.length} saved</span>
              </div>
              <TagFilter tags={tags} value={selectedTag} onChange={setSelectedTag} label="Filter bookmarks by tag" total={bookmarkedArticles.length} />
            </>
          )}

          {bookmarkedArticles.length === 0 ? (
            <NeoPanel>
              <NeoEmpty
                icon={<Bookmark />}
                title="Your bookmark shelf is empty"
                action={
                  <Link to="/wiki" className="neo-btn neo-btn--soft">
                    <Compass /> Explore Knowledge Spaces
                  </Link>
                }
              >
                Tap the bookmark icon on any playbook or incident runbook to pin it here for 1-click access.
              </NeoEmpty>
            </NeoPanel>
          ) : filtered.length === 0 ? (
            <NeoPanel>
              <NeoEmpty
                icon={<Bookmark />}
                title="No saved playbooks match these filters"
                action={
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => {
                      setFreshFilter('all');
                      setSelectedTag('all');
                    }}
                  >
                    Reset filters
                  </button>
                }
              />
            </NeoPanel>
          ) : (
            <div className="wk-cards neo-stagger">
              {filtered.map((article, i) => (
                <div key={article.id} className="wk-cards__cell" style={{ ['--i' as string]: i }}>
                  <ArticleCard article={article} />
                </div>
              ))}
            </div>
          )}
        </>
      }
      side={
        <>
          {/* Active Runbook Checklists Section */}
          <NeoPanel hud="In progress" title="Runbook checklists" icon={<ListChecks />}>
            {activeRunbooks.length > 0 ? (
              <div className="neo-list">
                {activeRunbooks.map(({ article, done, total }) => {
                  const pct = Math.round((done / total) * 100);
                  return (
                    <Link key={article.id} to={`/wiki/doc/${article.slug}`} className="neo-li wk-runrow">
                      <span className="wk-runrow__text">
                        <span className="wk-runrow__top">
                          <span className="wk-mini__title">{article.title}</span>
                          <span className="wk-runrow__pct">
                            {done}/{total}
                          </span>
                        </span>
                        <Bar value={pct / 100} label={`${pct}% of steps ticked`} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="wk-allclear">
                <ListChecks aria-hidden="true" />
                <div>
                  <b>No runbooks in progress</b>
                  <span>Tick steps inside any interactive runbook and your progress shows up here.</span>
                </div>
              </div>
            )}
          </NeoPanel>

          <NeoPanel
            hud="History"
            title="Recently viewed"
            icon={<History />}
            actions={
              <Link to="/wiki" className="neo-btn neo-btn--ghost neo-btn--xs">
                Explore <ArrowRight />
              </Link>
            }
          >
            {recentlyViewed.length > 0 ? (
              <div className="neo-list">
                {recentlyViewed.map((article) => (
                  <Link key={article.id} to={`/wiki/doc/${article.slug}`} className="neo-li wk-mini">
                    <FreshDot article={article} />
                    <span className="wk-mini__text">
                      <span className="wk-mini__title">{article.title}</span>
                      <span className="wk-mini__meta">
                        {spaceName(article)} · {article.readMins} min
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="wk-allclear">
                <History aria-hidden="true" />
                <div>
                  <b>Nothing viewed yet</b>
                  <span>Pages you open will collect here for quick return trips.</span>
                </div>
              </div>
            )}
          </NeoPanel>
        </>
      }
    />
  );
}
