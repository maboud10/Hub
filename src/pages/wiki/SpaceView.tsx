import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Lock, PenLine, Sparkles } from 'lucide-react';
import { NeoEmpty, NeoHome, NeoPanel, NeoSearch, Ring } from '@/components/neo';
import { pluralize } from '@/lib/format';
import { canReadSpace } from '@/wiki/access';
import { computeFreshness } from '@/wiki/constants';
import { useSpaceViews, useWikiCaps, useWikiViewer } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import {
  ArticleCard,
  FreshTabs,
  RoleAudienceChips,
  SpaceBoundaryCard,
  SpaceIcon,
  TagFilter,
  UserBadge,
  useCortex,
  type FreshFilter,
} from './wikiUi';

export type { FreshFilter } from './wikiUi';

export function SpaceView() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const viewer = useWikiViewer();
  const caps = useWikiCaps();
  const cortex = useCortex();
  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);
  const spaceViews = useSpaceViews();

  const [freshFilter, setFreshFilter] = useState<FreshFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [textFilter, setTextFilter] = useState('');

  const space = spaces.find((s) => s.id === spaceId);
  const readable = canReadSpace(viewer, space);

  const spaceArticles = useMemo(() => {
    if (!space || !readable) return [];
    return articles.filter((a) => a.spaceId === space.id);
  }, [space, readable, articles]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of spaceArticles) {
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [spaceArticles]);

  const filtered = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    return spaceArticles.filter((a) => {
      const f = computeFreshness(a);
      if (freshFilter === 'verified' && f.state !== 'verified') return false;
      if (freshFilter === 'attention' && f.state === 'verified') return false;
      if (selectedTag !== 'all' && !a.tags.includes(selectedTag)) return false;
      if (q && !`${a.title} ${a.subtitle} ${a.tldr} ${a.tags.join(' ')}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [spaceArticles, freshFilter, selectedTag, textFilter]);

  if (!space) {
    return (
      <NeoPanel>
        <NeoEmpty
          icon={<BookOpen />}
          title="Space not found"
          action={
            <Link to="/wiki" className="neo-btn neo-btn--soft">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          No Knowledge Base space matches “{spaceId}”.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  if (!readable) {
    return <SpaceBoundaryCard space={space} />;
  }

  const verifiedCount = spaceArticles.filter((a) => computeFreshness(a).state === 'verified').length;
  const attentionCount = spaceArticles.length - verifiedCount;
  const healthPct = spaceArticles.length ? Math.round((verifiedCount / spaceArticles.length) * 100) : 100;
  const otherSpaces = spaceViews.filter((v) => v.space.id !== space.id);

  return (
    <NeoHome
      sideLabel={`About ${space.name}`}
      main={
        <>
          {/* Freshness & Tag Filter Bar */}
          <div className="wk-filters">
            <FreshTabs
              label="Filter by freshness"
              value={freshFilter}
              onChange={setFreshFilter}
              counts={{ all: spaceArticles.length, verified: verifiedCount, attention: attentionCount }}
            />
            <NeoSearch
              value={textFilter}
              onChange={setTextFilter}
              placeholder={`Filter in ${space.name}…`}
              label={`Filter playbooks in ${space.name}`}
              size="sm"
              className="wk-filters__search"
            />
          </div>
          <TagFilter tags={tags} value={selectedTag} onChange={setSelectedTag} label="Filter by tag" total={spaceArticles.length} />

          {/* Playbooks Grid */}
          {filtered.length > 0 ? (
            <div className="wk-cards neo-stagger">
              {filtered.map((article, i) => (
                <div key={article.id} className="wk-cards__cell" style={{ ['--i' as string]: i }}>
                  <ArticleCard article={article} showSpace={false} />
                </div>
              ))}
            </div>
          ) : (
            <NeoPanel>
              <NeoEmpty
                icon={<BookOpen />}
                title="No playbooks match these filters"
                action={
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => {
                      setFreshFilter('all');
                      setSelectedTag('all');
                      setTextFilter('');
                    }}
                  >
                    Reset filters
                  </button>
                }
              >
                Try clearing the tag or freshness filter to see all {spaceArticles.length} playbooks in {space.name}.
              </NeoEmpty>
            </NeoPanel>
          )}
        </>
      }
      side={
        <>
          <NeoPanel hud="About this space" title={space.name} icon={<SpaceIcon space={space} size={34} />}>
            <p className="wk-about__desc">{space.description}</p>
            <div className="wk-about__health">
              <Ring value={healthPct / 100} size={58} stroke={5} label={`${healthPct}% verified`}>
                {healthPct}%
              </Ring>
              <div>
                <b>
                  {verifiedCount} of {pluralize(spaceArticles.length, 'playbook')} verified
                </b>
                <span>{attentionCount > 0 ? `${attentionCount} due for review or flagged` : 'Everything is inside its review cycle'}</span>
              </div>
            </div>
            <dl className="neo-kv wk-about__kv">
              <dt>Steward</dt>
              <dd>
                <UserBadge userId={space.stewardId} size={24} subtitle="Space steward" />
              </dd>
              <dt>Audience</dt>
              <dd>
                <RoleAudienceChips roleIds={space.audienceRoleIds} />
              </dd>
            </dl>
            <div className="wk-about__acts">
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={() => cortex.open(`What should I know about ${space.name}?`)}
              >
                <Sparkles /> Ask about this space
              </button>
              {caps.canWrite && (
                <Link to={`/wiki/new?space=${space.id}`} className="neo-btn neo-btn--ghost neo-btn--sm">
                  <PenLine /> Write in {space.name}
                </Link>
              )}
            </div>
          </NeoPanel>

          <NeoPanel
            hud="Keep exploring"
            title="Other spaces"
            actions={
              <Link to="/wiki" className="neo-btn neo-btn--ghost neo-btn--xs">
                All <ArrowRight />
              </Link>
            }
          >
            <div className="neo-list">
              {otherSpaces.map(({ space: other, readable: canRead, articleCount }) =>
                canRead ? (
                  <Link key={other.id} to={`/wiki/space/${other.id}`} className="neo-li wk-mini">
                    <SpaceIcon space={other} size={30} />
                    <span className="wk-mini__text">
                      <span className="wk-mini__title">{other.name}</span>
                      <span className="wk-mini__meta">{pluralize(articleCount, 'playbook')}</span>
                    </span>
                    <ChevronRight className="wk-chev" aria-hidden="true" />
                  </Link>
                ) : (
                  <div key={other.id} className="neo-li wk-mini wk-mini--locked" title="Restricted to specific roles">
                    <SpaceIcon space={other} size={30} />
                    <span className="wk-mini__text">
                      <span className="wk-mini__title">{other.name}</span>
                      <span className="wk-mini__meta">Role-restricted</span>
                    </span>
                    <Lock className="wk-chev" aria-hidden="true" />
                  </div>
                ),
              )}
            </div>
          </NeoPanel>
        </>
      }
    />
  );
}
