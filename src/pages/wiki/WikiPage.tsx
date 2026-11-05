import '@/styles/wiki.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from 'react-router';
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Compass,
  Layers,
  Lock,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { cx } from '@/lib/cx';
import { firstName, greeting } from '@/lib/format';
import { searchArticles } from '@/wiki/cortex';
import {
  useGovernanceQueue,
  useMyWikiState,
  useSpaceViews,
  useVisibleArticles,
  useWikiCaps,
} from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import { ArticleEditor } from './ArticleEditor';
import { ArticleReader } from './ArticleReader';
import { BookmarksView } from './BookmarksView';
import { CollectionDetail, CollectionsIndex } from './CollectionsView';
import { CortexModal } from './CortexModal';
import { GovernanceView } from './GovernanceView';
import { SpaceView } from './SpaceView';
import { WikiHome } from './WikiHome';
import { FreshnessPill, SpacePill } from './wikiUi';

interface WikiTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
}

export function WikiPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const caps = useWikiCaps();
  const spaces = useWiki((s) => s.spaces);
  const spaceViews = useSpaceViews();
  const visibleArticles = useVisibleArticles();
  const myState = useMyWikiState();
  const { pendingProposals, attentionArticles, verifiedPct } = useGovernanceQueue();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const askOpen = searchParams.get('ask') === '1';
  const askQueryParam = searchParams.get('q') ?? '';

  const openCortex = (initialQ?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('ask', '1');
    if (initialQ && initialQ.trim()) {
      next.set('q', initialQ.trim());
    }
    setSearchParams(next, { replace: false });
    setSearchFocused(false);
  };

  const closeCortex = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('ask');
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  // Close live search dropdown on click outside or Escape
  useEffect(() => {
    if (!searchFocused) return;
    const onPointerDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchFocused(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchFocused]);

  const searchHits = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchArticles(searchQuery, visibleArticles).slice(0, 5);
  }, [searchQuery, visibleArticles]);

  const spaceMap = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const readableSpaceCount = spaceViews.filter((s) => s.readable).length;
  const bookmarkCount = useMemo(() => {
    const allowedSlugs = new Set(visibleArticles.map((a) => a.slug));
    return myState.bookmarks.filter((slug) => allowedSlugs.has(slug)).length;
  }, [myState.bookmarks, visibleArticles]);

  const governanceBadgeCount = pendingProposals.length + attentionArticles.length;

  const tabs = useMemo<WikiTab[]>(
    () => [
      { to: '/wiki', label: 'Explore', icon: Compass, end: true },
      { to: '/wiki/collections', label: 'Reading Packs', icon: Layers },
      {
        to: '/wiki/bookmarks',
        label: 'My Bookmarks',
        icon: Bookmark,
        count: bookmarkCount > 0 ? bookmarkCount : undefined,
      },
      {
        to: '/wiki/governance',
        label: 'Governance & Freshness',
        icon: ShieldCheck,
        count: governanceBadgeCount > 0 ? governanceBadgeCount : undefined,
      },
    ],
    [bookmarkCount, governanceBadgeCount],
  );

  const showDropdown = searchFocused && searchQuery.trim().length > 0;

  return (
    <div className="page wk-page">
      {/* Atmospheric Teal/Emerald Hero */}
      <header className="wk-hero hud">
        <div className="wk-hero__bg" aria-hidden="true">
          <div className="wk-hero__orb" />
        </div>

        <div className="wk-hero__main">
          <div className="wk-hero__eyebrow">Knowledge Base · Living Cortex</div>
          <h1 className="wk-hero__title">
            {greeting()}
            {me ? `, ${firstName(me.name)}` : ''}.{' '}
            <span className="wk-hero__accent">Verified playbooks, zero guesswork</span>
          </h1>
          <p className="wk-hero__sub">
            Permission-scoped handbooks, interactive incident runbooks, and four-eyes canonical governance — grounded
            live with Helix Academy.
          </p>

          {/* Live Search Bar with Instant Dropdown */}
          <div ref={searchWrapRef} className="wk-search">
            <div className="wk-search__box">
              <Search className="wk-search__icon" aria-hidden="true" />
              <input
                type="search"
                className="wk-search__input"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchFocused(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    e.preventDefault();
                    if (searchHits[0]) {
                      const top = searchHits[0];
                      setSearchFocused(false);
                      navigate(
                        `/wiki/doc/${top.article.slug}${top.matchedSectionId ? `#${top.matchedSectionId}` : ''}`,
                      );
                    } else {
                      openCortex(searchQuery);
                    }
                  }
                }}
                placeholder="Search playbooks, CLI runbooks, WFA leave, passkeys, or press Enter…"
                aria-label="Search Knowledge Base playbooks"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X />
                </button>
              )}
              <button
                type="button"
                className="wk-search__ask-btn"
                onClick={() => openCortex(searchQuery)}
              >
                <Sparkles style={{ width: 13, height: 13 }} />
                <span>Ask AI</span>
              </button>
            </div>

            {showDropdown && (
              <div className="wk-search__dropdown" role="listbox" aria-label="Instant playbook matches">
                <button
                  type="button"
                  className="wk-search__cortex-cta"
                  onClick={() => openCortex(searchQuery)}
                >
                  <Sparkles />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="text-xs" style={{ fontWeight: 700, color: 'var(--wk-ink)' }}>
                      Synthesize grounded answer with Nova Docs
                    </div>
                    <div className="text-xs muted truncate">“{searchQuery.trim()}”</div>
                  </div>
                  <ArrowRight style={{ width: 15, height: 15 }} />
                </button>

                {searchHits.length > 0 ? (
                  searchHits.map((hit) => {
                    const sp = spaceMap.get(hit.article.spaceId);
                    const to = `/wiki/doc/${hit.article.slug}${
                      hit.matchedSectionId ? `#${hit.matchedSectionId}` : ''
                    }`;
                    return (
                      <Link
                        key={hit.article.id}
                        to={to}
                        className="wk-search__hit"
                        onClick={() => setSearchFocused(false)}
                      >
                        <div className="wk-search__hit-top">
                          <span className="wk-search__hit-title">
                            {hit.article.title}
                            {hit.matchedHeading && (
                              <span className="muted" style={{ fontWeight: 450 }}>
                                {' '}
                                · § {hit.matchedHeading}
                              </span>
                            )}
                          </span>
                          <div className="row" style={{ gap: 6, flex: 'none' }}>
                            {sp && <SpacePill space={sp} />}
                            <FreshnessPill article={hit.article} />
                          </div>
                        </div>
                        <span className="wk-search__hit-snippet">{hit.snippet}</span>
                      </Link>
                    );
                  })
                ) : (
                  <div className="text-xs muted" style={{ padding: '10px 12px' }}>
                    No direct title/section match in your cleared spaces — click above to ask Nova Docs.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Status Chips */}
          <div className="wk-hero__chips">
            <button
              type="button"
              className="wk-hero-chip"
              onClick={() => navigate('/wiki/governance')}
            >
              <CheckCircle2 aria-hidden="true" />
              <b>{verifiedPct}%</b> verified freshness
            </button>

            <button
              type="button"
              className="wk-hero-chip"
              onClick={() => navigate('/wiki')}
            >
              <Compass aria-hidden="true" />
              <b>
                {readableSpaceCount}/{spaces.length}
              </b>{' '}
              readable spaces
            </button>

            <button
              type="button"
              className="wk-hero-chip"
              onClick={() => navigate('/wiki/bookmarks')}
            >
              <Bookmark aria-hidden="true" />
              <b>{bookmarkCount}</b> {bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}
            </button>
          </div>
        </div>

        {/* Hero CTAs */}
        <div className="wk-hero__actions">
          <button
            type="button"
            className="wk-btn-cortex"
            onClick={() => openCortex(searchQuery)}
          >
            <Sparkles /> Ask Nova Docs
          </button>

          {caps.canWrite ? (
            <button
              type="button"
              className="btn"
              onClick={() => navigate('/wiki/new')}
            >
              <PenLine /> Write a page
            </button>
          ) : (
            <div
              className="wk-readonly-pill"
              title="Contractors have read access to open spaces and Nova Docs; authoring requires wiki.write."
            >
              <Lock />
              <span>Read-only · Contractor</span>
            </div>
          )}
        </div>
      </header>

      {/* Module Navigation Tabs */}
      <nav className="tabs wk-tabs" aria-label="Knowledge Base sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cx('tab', isActive && 'is-active')}
            >
              <Icon aria-hidden="true" />
              {t.label}
              {t.count !== undefined && <span className="counter">{t.count}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Nested Knowledge Base Routes */}
      <Routes>
        <Route index element={<WikiHome />} />
        <Route path="space/:spaceId" element={<SpaceView />} />
        <Route path="collections" element={<CollectionsIndex />} />
        <Route path="collections/:slug" element={<CollectionDetail />} />
        <Route path="bookmarks" element={<BookmarksView />} />
        <Route path="doc/:slug" element={<ArticleReader />} />
        <Route path="new" element={<ArticleEditor mode="create" />} />
        <Route path="edit/:slug" element={<ArticleEditor mode="edit" />} />
        <Route path="governance" element={<GovernanceView />} />
        <Route path="*" element={<Navigate to="/wiki" replace />} />
      </Routes>

      {/* Ask Nova Docs Modal (?ask=1) */}
      <CortexModal
        open={askOpen}
        initialQuery={askQueryParam}
        onClose={closeCortex}
      />
    </div>
  );
}
