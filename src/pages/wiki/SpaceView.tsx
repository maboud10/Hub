import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  PenLine,
  Search,
} from 'lucide-react';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { canReadSpace } from '@/wiki/access';
import { computeFreshness } from '@/wiki/constants';
import { useWikiCaps, useWikiViewer } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import {
  ArticleCard,
  RoleAudienceChips,
  SpaceBoundaryCard,
  SpaceIcon,
  UserBadge,
} from './wikiUi';

export type FreshFilter = 'all' | 'verified' | 'attention';

export function SpaceView() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const viewer = useWikiViewer();
  const caps = useWikiCaps();
  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);

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
      <div className="card">
        <EmptyState
          icon={<BookOpen />}
          title="Space not found"
          action={
            <Link to="/wiki" className="btn btn--primary">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          }
        >
          No Knowledge Base space matches “{spaceId}”.
        </EmptyState>
      </div>
    );
  }

  if (!readable) {
    return <SpaceBoundaryCard space={space} />;
  }

  const verifiedCount = spaceArticles.filter((a) => computeFreshness(a).state === 'verified').length;
  const attentionCount = spaceArticles.length - verifiedCount;

  return (
    <div className="stack stack--lg">
      {/* Breadcrumb */}
      <nav className="wk-breadcrumb" aria-label="Breadcrumb">
        <Link to="/wiki">Knowledge Base</Link>
        <ChevronRight />
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{space.name}</span>
      </nav>

      {/* Space Header Card */}
      <div
        className="card"
        style={
          {
            '--sp-h': space.hue,
            background: `radial-gradient(480px 180px at 100% 0%, hsl(${space.hue} 82% 56% / 0.14), transparent 72%), var(--tile-bg)`,
          } as CSSProperties
        }
      >
        <div className="row row--between row--wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start', minWidth: 0, flex: '1 1 320px' }}>
            <SpaceIcon space={space} size={52} />
            <div className="stack stack--sm" style={{ minWidth: 0 }}>
              <h2 className="page-title" style={{ fontSize: 'clamp(22px, 2.8vw, 30px)' }}>
                {space.name}
              </h2>
              <p className="muted text-sm" style={{ margin: 0, maxWidth: '64ch' }}>
                {space.description}
              </p>
              <div className="row row--wrap" style={{ gap: 12, marginTop: 4 }}>
                <UserBadge userId={space.stewardId} size={24} subtitle="Space Steward" />
                <span className="text-xs muted">Audience:</span>
                <RoleAudienceChips roleIds={space.audienceRoleIds} />
              </div>
            </div>
          </div>

          {caps.canWrite && (
            <Link to={`/wiki/new?space=${space.id}`} className="wk-btn-cortex">
              <PenLine /> Write in {space.name}
            </Link>
          )}
        </div>
      </div>

      {/* Freshness & Tag Filter Bar */}
      <div className="stack">
        <div className="wk-filter-bar">
          <Segmented<FreshFilter>
            label="Filter by freshness"
            value={freshFilter}
            onChange={setFreshFilter}
            options={[
              { value: 'all', label: `All (${spaceArticles.length})` },
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

          <div className="input-wrap" style={{ width: 'min(280px, 100%)' }}>
            <Search />
            <input
              type="search"
              className="input"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder={`Filter in ${space.name}…`}
              aria-label={`Filter playbooks in ${space.name}`}
              style={{ height: 36, fontSize: 13 }}
            />
          </div>
        </div>

        {tags.length > 0 && (
          <div className="chips" role="group" aria-label="Filter by tag">
            <button
              type="button"
              className={cx('chip', selectedTag === 'all' && 'is-active')}
              onClick={() => setSelectedTag('all')}
            >
              All tags <span className="count">{spaceArticles.length}</span>
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
      </div>

      {/* Playbooks Grid */}
      {filtered.length > 0 ? (
        <div className="wk-articles-grid">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} showSpace={false} />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<BookOpen />}
            title="No playbooks match these filters"
            action={
              <button
                type="button"
                className="btn btn--sm"
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
          </EmptyState>
        </div>
      )}
    </div>
  );
}
