import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  ListChecks,
  Rocket,
} from 'lucide-react';
import { Bar, NeoEmpty, NeoHome, NeoPanel, Ring } from '@/components/neo';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { computeFreshness } from '@/wiki/constants';
import { useMyWikiState, useVisibleCollections } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import { FreshnessPill, FreshTabs, SpacePill, TagFilter, WikiHeadActions, type FreshFilter } from './wikiUi';

export function CollectionsIndex() {
  const collections = useVisibleCollections();
  const myState = useMyWikiState();
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

  const readSet = new Set(myState.readSlugs);

  return (
    <div className="wk-stack">
      <div className="wk-filters">
        <FreshTabs label="Filter reading packs by freshness" value={freshFilter} onChange={setFreshFilter} />
        <span className="neo-hud">
          {filteredPacks.length} of {collections.length} packs
        </span>
      </div>
      <TagFilter tags={allTags} value={selectedTag} onChange={setSelectedTag} label="Filter packs by tag" allLabel="All topics" />

      {filteredPacks.length > 0 ? (
        <div className="wk-packs neo-stagger">
          {filteredPacks.map(({ collection, articles, readCount, totalCount, pct, totalMins }, i) => (
            <Link
              key={collection.id}
              to={`/wiki/collections/${collection.slug}`}
              className="wk-pack"
              style={{ '--pk-h': collection.hue, '--i': i } as CSSProperties}
            >
              <span className="wk-pack__top">
                <span className="wk-pack__chips">
                  <span className="wk-tag">{collection.audienceLabel}</span>
                  {collection.onboardingPack && (
                    <span className="neo-chip neo-chip--sm" data-tone="app">
                      <Rocket /> Week-1 onboarding
                    </span>
                  )}
                </span>
                <Ring value={totalCount ? readCount / totalCount : 0} size={54} stroke={5} label={`${readCount} of ${totalCount} read`}>
                  {pct}%
                </Ring>
              </span>

              <span className="wk-pack__title">{collection.title}</span>
              <span className="wk-pack__desc">{collection.description}</span>

              <ol className="wk-pack__steps">
                {articles.slice(0, 3).map((a, idx) => (
                  <li key={a.id} className={cx('wk-pack__step', readSet.has(a.slug) && 'is-read')}>
                    <span className="wk-pack__step-n">{readSet.has(a.slug) ? <Check /> : String(idx + 1).padStart(2, '0')}</span>
                    <span className="wk-pack__step-t">{a.title}</span>
                    <span className="wk-pack__step-m">{a.readMins}m</span>
                  </li>
                ))}
                {articles.length > 3 && <li className="wk-pack__more">+{articles.length - 3} more playbooks in pack</li>}
              </ol>

              <span className="wk-pack__foot">
                <Bar value={totalCount ? readCount / totalCount : 0} label={`${pct}% of ${collection.title} read`} />
                <span className="wk-pack__meta">
                  <span>
                    {readCount} of {totalCount} completed · ~{totalMins} mins
                  </span>
                  <span className="wk-pack__go">
                    Open pack <ArrowRight aria-hidden="true" />
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <NeoPanel>
          <NeoEmpty
            icon={<Layers />}
            title="No reading packs match these filters"
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
          >
            Clear the active freshness or tag filter to see all reading packs cleared for your role.
          </NeoEmpty>
        </NeoPanel>
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
      <NeoPanel>
        <NeoEmpty
          icon={<BookOpen />}
          title="Reading Pack unavailable"
          action={
            <Link to="/wiki/collections" className="neo-btn neo-btn--soft">
              <ArrowLeft /> Browse Reading Packs
            </Link>
          }
        >
          This reading pack does not exist or its playbooks belong to spaces outside your role clearance.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  const readSet = new Set(myState.readSlugs);
  const nextUnread = pack.articles.find((a) => !readSet.has(a.slug));
  const remainingMins = pack.articles.filter((a) => !readSet.has(a.slug)).reduce((sum, a) => sum + a.readMins, 0);
  const verifiedCount = pack.articles.filter((a) => computeFreshness(a).state === 'verified').length;

  const markAllRead = () => {
    for (const a of pack.articles) {
      markRead(a.slug, true);
    }
    toast.success(`Completed all ${pack.totalCount} playbooks in “${pack.collection.title}”! 🎉`);
  };

  return (
    <>
      <WikiHeadActions>
        {pack.readCount < pack.totalCount && (
          <button type="button" className="neo-btn neo-btn--soft" onClick={markAllRead}>
            <Check /> <span className="neo-btn__label">Mark all read</span>
          </button>
        )}
        {nextUnread ? (
          <Link to={`/wiki/doc/${nextUnread.slug}`} className="neo-btn neo-btn--plasma" title={`Continue: ${nextUnread.title}`}>
            <ArrowRight /> <span className="neo-btn__label">{pack.readCount > 0 ? 'Continue reading' : 'Start pack'}</span>
          </Link>
        ) : (
          <span className="neo-chip neo-chip--lg" data-tone="success">
            <CheckCircle2 /> Pack complete
          </span>
        )}
      </WikiHeadActions>

      <NeoHome
        sideLabel="Pack progress"
        main={
          <NeoPanel
            flush
            hud="Reading order"
            title={`${pack.totalCount} playbooks · ~${pack.totalMins} min`}
            icon={<ListChecks />}
            className="wk-steps-panel"
          >
            {/* Filters */}
            <div className="wk-steps-panel__filters">
              <FreshTabs
                label="Filter steps by freshness"
                value={freshFilter}
                onChange={setFreshFilter}
                counts={{ all: pack.articles.length, verified: verifiedCount, attention: pack.articles.length - verifiedCount }}
              />
              <TagFilter tags={packTags} value={selectedTag} onChange={setSelectedTag} label="Filter steps by tag" />
            </div>

            {/* Numbered Reading Steps */}
            {visibleSteps.length > 0 ? (
              <ol className="wk-steps">
                {visibleSteps.map(({ article, stepNumber }) => {
                  const isRead = readSet.has(article.slug);
                  const isSaved = myState.bookmarks.includes(article.slug);
                  const sp = spaceMap.get(article.spaceId);

                  return (
                    <li key={article.id} className={cx('wk-step', isRead && 'is-read')}>
                      <span className="wk-step__num">{isRead ? <Check /> : String(stepNumber).padStart(2, '0')}</span>

                      <div className="wk-step__body">
                        <div className="wk-step__chips">
                          {sp && <SpacePill space={sp} />}
                          <FreshnessPill article={article} compact />
                          <span className="wk-step__mins">
                            <Clock aria-hidden="true" /> {article.readMins} min read
                          </span>
                          {article.relatedCourseIds.length > 0 && (
                            <span className="neo-chip neo-chip--sm" data-tone="blue">
                              <GraduationCap /> +{article.relatedCourseIds.length} Academy lab
                            </span>
                          )}
                        </div>
                        <Link to={`/wiki/doc/${article.slug}`} className="wk-step__title">
                          {article.title}
                        </Link>
                        <p className="wk-step__tldr">{article.tldr}</p>
                      </div>

                      <div className="wk-step__acts">
                        <button
                          type="button"
                          className={cx('neo-btn neo-btn--xs', isRead ? 'neo-btn--success' : 'neo-btn--ghost')}
                          onClick={() => {
                            markRead(article.slug, !isRead);
                            toast.info(isRead ? 'Marked unread' : `Marked “${article.title}” as read ✓`);
                          }}
                        >
                          <CheckCircle2 />
                          {isRead ? 'Read' : 'Mark read'}
                        </button>
                        <button
                          type="button"
                          className={cx('neo-iconbtn wk-bm', isSaved && 'is-on')}
                          aria-label={isSaved ? 'Remove bookmark' : 'Bookmark'}
                          aria-pressed={isSaved}
                          onClick={() => toast.result(toggleBookmark(article.slug))}
                        >
                          <Bookmark fill={isSaved ? 'currentColor' : 'none'} />
                        </button>
                        <Link to={`/wiki/doc/${article.slug}`} className="neo-btn neo-btn--soft neo-btn--xs">
                          Read <ArrowRight />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <NeoEmpty compact icon={<Layers />} title="No steps match these filters">
                Reset the freshness or tag filter to see the whole sequence.
              </NeoEmpty>
            )}
          </NeoPanel>
        }
        side={
          <>
            <NeoPanel hud="Your progress" title={pack.readCount === pack.totalCount ? 'All done — nice work' : 'Keep the streak going'}>
              <div className="wk-progress">
                <Ring value={pack.totalCount ? pack.readCount / pack.totalCount : 0} size={112} stroke={9} label={`${pack.pct}% complete`}>
                  <span className="wk-progress__ring">
                    <b>{pack.pct}%</b>
                    <small>complete</small>
                  </span>
                </Ring>
                <div className="wk-progress__stats">
                  <span>
                    <b>{pack.readCount}</b>
                    <small>read</small>
                  </span>
                  <span>
                    <b>{pack.totalCount - pack.readCount}</b>
                    <small>to go</small>
                  </span>
                  <span>
                    <b>~{remainingMins}m</b>
                    <small>left</small>
                  </span>
                </div>
                <Bar value={pack.totalCount ? pack.readCount / pack.totalCount : 0} label="Reading completion" />
              </div>
              {nextUnread && (
                <Link to={`/wiki/doc/${nextUnread.slug}`} className="wk-next">
                  <span className="neo-hud">Up next · {nextUnread.readMins} min</span>
                  <b>{nextUnread.title}</b>
                  <ArrowRight className="wk-next__go" aria-hidden="true" />
                </Link>
              )}
            </NeoPanel>
            <NeoPanel hud="About this pack" title={pack.collection.audienceLabel} icon={pack.collection.onboardingPack ? <Rocket /> : <Layers />}>
              <p className="wk-about__desc">{pack.collection.description}</p>
              {pack.collection.onboardingPack && (
                <p className="wk-about__note">
                  <Rocket aria-hidden="true" /> Synced with the HR Portal onboarding journey — finishing steps here keeps both in step.
                </p>
              )}
              <Link to="/wiki/collections" className="neo-btn neo-btn--ghost neo-btn--sm">
                <ArrowLeft /> All reading packs
              </Link>
            </NeoPanel>
          </>
        }
      />
    </>
  );
}
