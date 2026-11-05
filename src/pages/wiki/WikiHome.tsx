import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  History,
  Layers,
  Lock,
  Pin,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { pluralize } from '@/lib/format';
import {
  useMyWikiState,
  useSpaceViews,
  useVisibleArticles,
  useVisibleCollections,
} from '@/wiki/selectors';
import {
  ArticleCard,
  FreshnessPill,
  ProgressRing,
  RoleAudienceChips,
  SpaceIcon,
  SpacePill,
  UserBadge,
} from './wikiUi';
import { useWiki } from '@/wiki/store';

export function WikiHome() {
  const spaces = useWiki((s) => s.spaces);
  const spaceViews = useSpaceViews();
  const visibleArticles = useVisibleArticles();
  const collections = useVisibleCollections();
  const myState = useMyWikiState();

  const onboardingPack = useMemo(
    () => collections.find((c) => c.collection.slug === 'col-new-hire' || c.collection.onboardingPack),
    [collections],
  );

  const hasUnreadOnboarding = !!onboardingPack && onboardingPack.readCount < onboardingPack.totalCount;

  const nextUnreadOnboardingArticle = useMemo(() => {
    if (!onboardingPack) return null;
    const readSet = new Set(myState.readSlugs);
    return onboardingPack.articles.find((a) => !readSet.has(a.slug)) ?? null;
  }, [onboardingPack, myState.readSlugs]);

  const pinnedArticles = useMemo(
    () => visibleArticles.filter((a) => a.pinned),
    [visibleArticles],
  );

  const recentArticles = useMemo(() => {
    const bySlug = new Map(visibleArticles.map((a) => [a.slug, a]));
    const recent = myState.recentSlugs
      .map((slug) => bySlug.get(slug))
      .filter((a): a is NonNullable<typeof a> => !!a);
    if (recent.length > 0) return recent.slice(0, 4);
    return visibleArticles.slice(0, 3);
  }, [myState.recentSlugs, visibleArticles]);

  const spaceMap = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  return (
    <div>
      {/* Onboarding Spotlight Banner when col-new-hire has unread items */}
      {hasUnreadOnboarding && onboardingPack && (
        <section className="wk-spotlight hud" aria-label="New-Hire Week-1 Reading Pack">
          <ProgressRing
            done={onboardingPack.readCount}
            total={onboardingPack.totalCount}
            size={66}
            sublabel="read"
          />
          <div className="wk-spotlight__body">
            <div className="row row--wrap" style={{ gap: 8 }}>
              <span className="badge" style={{ '--b-rgb': '45 212 191' } as CSSProperties}>
                <Rocket /> Onboarding Spotlight
              </span>
              <span className="text-xs muted">
                {onboardingPack.readCount} of {onboardingPack.totalCount} completed · ~{onboardingPack.totalMins}m total
              </span>
            </div>
            <h2 className="wk-spotlight__title">{onboardingPack.collection.title}</h2>
            <p className="text-sm muted" style={{ margin: 0 }}>
              {onboardingPack.collection.tagline}
              {nextUnreadOnboardingArticle && (
                <>
                  {' '}
                  — Up next: <strong style={{ color: 'var(--text)' }}>{nextUnreadOnboardingArticle.title}</strong>
                </>
              )}
            </p>
            <div className="wk-spotlight__bar" aria-hidden="true">
              <span style={{ width: `${onboardingPack.pct}%` }} />
            </div>
          </div>
          <div className="wk-spotlight__cta row row--wrap" style={{ gap: 8 }}>
            <Link to={`/wiki/collections/${onboardingPack.collection.slug}`} className="wk-btn-cortex">
              Open Reading Pack <ArrowRight />
            </Link>
            {nextUnreadOnboardingArticle && (
              <Link to={`/wiki/doc/${nextUnreadOnboardingArticle.slug}`} className="btn btn--sm">
                Read next ({nextUnreadOnboardingArticle.readMins}m)
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Knowledge Spaces Grid (all 6 spaces: readable + locked clearance boundary) */}
      <section aria-labelledby="wk-spaces-heading">
        <div className="section-head">
          <h2 id="wk-spaces-heading" className="section-title">
            <Compass style={{ width: 19, height: 19, color: 'var(--wk-ink)' }} />
            Knowledge Spaces
            <span className="count">
              {spaceViews.filter((s) => s.readable).length}/{spaceViews.length} cleared
            </span>
          </h2>
          <Link to="/wiki?ask=1" className="btn btn--ghost btn--sm">
            <Sparkles /> Synthesize across spaces
          </Link>
        </div>

        <div className="wk-spaces-grid">
          {spaceViews.map(({ space, readable, articleCount, verifiedCount, attentionCount }) => {
            if (readable) {
              const healthPct = articleCount ? Math.round((verifiedCount / articleCount) * 100) : 100;
              return (
                <Link
                  key={space.id}
                  to={`/wiki/space/${space.id}`}
                  className="wk-space-card"
                  style={{ '--sp-h': space.hue } as CSSProperties}
                >
                  <div className="wk-space-card__head">
                    <SpaceIcon space={space} size={44} />
                    <div className="row" style={{ gap: 6 }}>
                      {attentionCount > 0 ? (
                        <span className="wk-fresh wk-fresh--due-soon">
                          <AlertTriangle /> {attentionCount} to review
                        </span>
                      ) : (
                        <span className="wk-fresh wk-fresh--verified">
                          <CheckCircle2 /> {healthPct}% verified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="stack stack--sm">
                    <h3 className="wk-space-card__title">{space.name}</h3>
                    <p className="wk-space-card__tagline">{space.description}</p>
                  </div>

                  <div className="wk-space-card__foot">
                    <UserBadge userId={space.stewardId} size={22} subtitle="Steward" />
                    <span className="text-xs mono" style={{ color: 'var(--wk-ink)', fontWeight: 600 }}>
                      {pluralize(articleCount, 'playbook')} →
                    </span>
                  </div>
                </Link>
              );
            }

            return (
              <div
                key={space.id}
                className="wk-space-card wk-space-card--locked"
                style={{ '--sp-h': space.hue } as CSSProperties}
                aria-label={`${space.name} — restricted space`}
              >
                <div className="wk-space-card__head">
                  <SpaceIcon space={space} size={44} />
                  <span className="badge badge--warning">
                    <Lock /> Restricted Clearance
                  </span>
                </div>

                <div className="stack stack--sm">
                  <h3 className="wk-space-card__title">{space.name}</h3>
                  <p className="wk-space-card__tagline">{space.tagline}</p>
                </div>

                <div className="wk-locked-roles">
                  <span className="wk-locked-roles__label">
                    <Lock /> Visible to roles
                  </span>
                  <RoleAudienceChips roleIds={space.audienceRoleIds} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pinned Canonical Highlights */}
      <section className="section" aria-labelledby="wk-pinned-heading">
        <div className="section-head">
          <h2 id="wk-pinned-heading" className="section-title">
            <Pin style={{ width: 18, height: 18, color: 'var(--wk-ink)' }} />
            Pinned Canonical Highlights
            <span className="count">{pinnedArticles.length}</span>
          </h2>
          <Link to="/wiki/governance" className="btn btn--ghost btn--sm">
            Freshness & Governance →
          </Link>
        </div>

        {pinnedArticles.length > 0 ? (
          <div className="wk-articles-grid">
            {pinnedArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon={<BookOpen />} title="No pinned highlights in your spaces">
              Explore any cleared space above to browse verified playbooks.
            </EmptyState>
          </div>
        )}
      </section>

      {/* Continue Reading / Recently Viewed & Reading Packs Rails */}
      <div className="wk-home-rails">
        <section aria-labelledby="wk-recent-heading">
          <div className="section-head">
            <h2 id="wk-recent-heading" className="section-title">
              <History style={{ width: 18, height: 18, color: 'var(--wk-ink)' }} />
              {myState.recentSlugs.length > 0 ? 'Continue Reading & Recent' : 'Recommended Starting Playbooks'}
            </h2>
            <Link to="/wiki/bookmarks" className="btn btn--ghost btn--sm">
              My Bookmarks →
            </Link>
          </div>

          <div className="card stack" style={{ padding: 14 }}>
            {recentArticles.map((article) => {
              const sp = spaceMap.get(article.spaceId);
              const totalChecks = article.sections.reduce((n, s) => n + (s.checklist?.length ?? 0), 0);
              const doneChecks = (myState.runbookChecks[article.id] ?? []).length;
              const isRead = myState.readSlugs.includes(article.slug);

              return (
                <Link
                  key={article.id}
                  to={`/wiki/doc/${article.slug}`}
                  className="list-row"
                  style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}
                >
                  <div className="grow stack stack--sm" style={{ minWidth: 0 }}>
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      {sp && <SpacePill space={sp} />}
                      <FreshnessPill article={article} />
                      {isRead && (
                        <span className="badge badge--success">
                          <CheckCircle2 /> Read
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 650, fontSize: 14.5 }}>{article.title}</div>
                    <p className="text-xs muted clamp-2" style={{ margin: 0 }}>
                      {article.subtitle}
                    </p>
                    {totalChecks > 0 && (
                      <span className="text-xs mono" style={{ color: 'var(--wk-ink)' }}>
                        Runbook checklist: {doneChecks}/{totalChecks} steps ticked
                      </span>
                    )}
                  </div>
                  <span className="text-xs mono muted" style={{ whiteSpace: 'nowrap', paddingTop: 3 }}>
                    <Clock style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> {article.readMins}m
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="wk-packs-rail-heading">
          <div className="section-head">
            <h2 id="wk-packs-rail-heading" className="section-title">
              <Layers style={{ width: 18, height: 18, color: 'var(--wk-ink)' }} />
              Curated Reading Packs
              <span className="count">{collections.length}</span>
            </h2>
            <Link to="/wiki/collections" className="btn btn--ghost btn--sm">
              All packs →
            </Link>
          </div>

          <div className="stack">
            {collections.map(({ collection, readCount, totalCount, pct, totalMins }) => (
              <Link
                key={collection.id}
                to={`/wiki/collections/${collection.slug}`}
                className="wk-pack-card"
                style={{ '--pk-h': collection.hue, padding: 16 } as CSSProperties}
              >
                <div className="row row--between" style={{ gap: 12 }}>
                  <div className="grow stack stack--sm" style={{ minWidth: 0 }}>
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <span className="tag">{collection.audienceLabel}</span>
                      {collection.onboardingPack && <span className="badge badge--info">Week-1 Pack</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 650, fontSize: 16 }}>
                      {collection.title}
                    </div>
                    <div className="text-xs muted">
                      {readCount}/{totalCount} read · ~{totalMins} mins
                    </div>
                  </div>
                  <ProgressRing done={readCount} total={totalCount} size={52} sublabel={`${pct}%`} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
