/**
 * Knowledge Base — "Knowledge Deck" (Helix Cortex).
 * NEO workspace: rail (Explore · Packs · Bookmarks · Review) + glass stage.
 * The header follows the active route (home, space, pack, page, studio) and
 * always carries the live search; views add their own header actions through
 * <WikiHeadActions>. Ask Nova Docs opens as a modal via `?ask=1&q=…`.
 */
import '@/styles/wiki.css';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, matchPath, Navigate, Route, Routes, useLocation } from 'react-router';
import { Bookmark, BookOpen, Compass, Layers, Library, Lock, LockKeyhole, PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import { NeoAppFrame, type NeoNavItem } from '@/components/neo';
import { useSessionUser } from '@/store/selectors';
import { firstName, greeting } from '@/lib/format';
import { canReadArticle, canReadSpace } from '@/wiki/access';
import {
  useGovernanceQueue,
  useMyWikiState,
  useVisibleArticles,
  useVisibleCollections,
  useWikiCaps,
  useWikiViewer,
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
import { WikiSearch } from './WikiSearch';
import { resolveSpaceIcon, useCortex, WikiHeadSlotProvider } from './wikiUi';

const TINT = { c1: '#2dd4bf', c2: '#0ea5e9' };

/** `browse` = Ask Nova Docs + Write; `space` = Ask + write in this space; `none` = the view supplies its own actions. */
type HeadActionsKind = 'browse' | 'space' | 'none';

interface RouteHead {
  icon: ReactNode;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  actions: HeadActionsKind;
  spaceId?: string;
}

const isExploreRoute = (p: string) =>
  p === '/wiki' ||
  p === '/wiki/' ||
  p.startsWith('/wiki/space/') ||
  p.startsWith('/wiki/doc/') ||
  p.startsWith('/wiki/edit/') ||
  p.startsWith('/wiki/new');

export function WikiPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const cortex = useCortex();

  const viewer = useWikiViewer();
  const caps = useWikiCaps();
  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);
  const visibleArticles = useVisibleArticles();
  const collections = useVisibleCollections();
  const myState = useMyWikiState();
  const { pendingProposals, attentionArticles } = useGovernanceQueue();

  /** Element inside the header action bar that views portal their own buttons into. */
  const [headSlot, setHeadSlot] = useState<HTMLSpanElement | null>(null);

  const bookmarkCount = useMemo(() => {
    const allowedSlugs = new Set(visibleArticles.map((a) => a.slug));
    return myState.bookmarks.filter((slug) => allowedSlugs.has(slug)).length;
  }, [myState.bookmarks, visibleArticles]);

  const governanceBadgeCount = pendingProposals.length + attentionArticles.length;

  const items: NeoNavItem[] = [
    { to: '/wiki', label: 'Explore', icon: <Compass />, match: isExploreRoute, title: 'Explore spaces & playbooks' },
    { to: '/wiki/collections', label: 'Packs', icon: <Layers />, title: 'Curated reading packs' },
    {
      to: '/wiki/bookmarks',
      label: 'Saved',
      icon: <Bookmark />,
      badge: bookmarkCount || null,
      title: bookmarkCount ? `My bookmarks · ${bookmarkCount} saved` : 'My bookmarks',
    },
  ];
  const footer: NeoNavItem[] = [
    {
      to: '/wiki/governance',
      label: 'Review',
      icon: <ShieldCheck />,
      badge: governanceBadgeCount || null,
      badgeTone: caps.canManage && pendingProposals.length > 0 ? 'danger' : undefined,
      title: governanceBadgeCount
        ? `Governance & freshness · ${pendingProposals.length} proposals · ${attentionArticles.length} pages need review`
        : 'Governance & freshness',
    },
  ];

  const head = useMemo<RouteHead>(() => {
    const match = (pattern: string) => matchPath({ path: pattern, end: true }, pathname);

    const doc = match('/wiki/doc/:slug');
    if (doc) {
      const article = articles.find((a) => a.slug === doc.params.slug);
      const space = spaces.find((s) => s.id === article?.spaceId);
      if (!article) {
        return { icon: <BookOpen />, eyebrow: 'Knowledge Base', title: 'Playbook not found', sub: 'The link may be old, or the page was archived.', actions: 'browse' };
      }
      if (!canReadArticle(viewer, article, spaces)) {
        return {
          icon: <LockKeyhole />,
          eyebrow: 'Knowledge Base · Permission boundary',
          title: 'Restricted playbook',
          sub: `Requires ${space?.name ?? 'space'} clearance.`,
          actions: 'browse',
        };
      }
      const Icon = space ? resolveSpaceIcon(space.icon) : BookOpen;
      return {
        icon: <Icon />,
        eyebrow: `${space?.name ?? 'Knowledge Base'} · ${article.locked ? 'Canonical policy' : 'Playbook'}`,
        title: article.title,
        sub: article.subtitle,
        actions: 'none',
      };
    }

    const edit = match('/wiki/edit/:slug');
    if (edit || match('/wiki/new')) {
      if (!caps.canWrite) {
        return {
          icon: <Lock />,
          eyebrow: 'Knowledge Base · Studio',
          title: 'Authoring is read-only for you',
          sub: 'Your access covers reading open spaces and asking Nova Docs.',
          actions: 'browse',
        };
      }
      if (edit) {
        const article = articles.find((a) => a.slug === edit.params.slug);
        return {
          icon: <PenLine />,
          eyebrow: 'Knowledge Base · Studio',
          title: article ? article.title : 'Playbook not found',
          sub: 'Publish a verified revision — or route it through four-eyes review.',
          actions: 'none',
        };
      }
      return {
        icon: <PenLine />,
        eyebrow: 'Knowledge Base · Studio',
        title: 'Write a new page',
        sub: 'Pick a blueprint, compose structured sections, preview — then publish.',
        actions: 'none',
      };
    }

    const sp = match('/wiki/space/:spaceId');
    if (sp) {
      const space = spaces.find((s) => s.id === sp.params.spaceId);
      if (!space) {
        return { icon: <Compass />, eyebrow: 'Knowledge Base', title: 'Space not found', sub: 'No Knowledge Base space matches this link.', actions: 'browse' };
      }
      const Icon = resolveSpaceIcon(space.icon);
      const readable = canReadSpace(viewer, space);
      return {
        icon: <Icon />,
        eyebrow: readable ? 'Knowledge Base · Space' : 'Knowledge Base · Restricted space',
        title: space.name,
        sub: space.tagline,
        actions: readable ? 'space' : 'browse',
        spaceId: space.id,
      };
    }

    const pack = match('/wiki/collections/:slug');
    if (pack) {
      const found = collections.find((c) => c.collection.slug === pack.params.slug || c.collection.id === pack.params.slug);
      if (!found) {
        return {
          icon: <Layers />,
          eyebrow: 'Knowledge Base · Reading packs',
          title: 'Reading pack unavailable',
          sub: 'It doesn’t exist, or its playbooks sit outside your clearance.',
          actions: 'browse',
        };
      }
      return {
        icon: <Layers />,
        eyebrow: `Reading pack · ${found.collection.audienceLabel}`,
        title: found.collection.title,
        sub: found.collection.tagline,
        actions: 'none',
      };
    }

    if (match('/wiki/collections')) {
      return {
        icon: <Layers />,
        eyebrow: 'Knowledge Base · Learning paths',
        title: 'Reading packs',
        sub: 'Curated playbook sequences with saved progress — onboarding, on-call and leadership.',
        actions: 'browse',
      };
    }
    if (match('/wiki/bookmarks')) {
      return {
        icon: <Bookmark />,
        eyebrow: 'Knowledge Base · Your shelf',
        title: 'Bookmarks',
        sub: 'Playbooks, runbooks and policies you saved for one-click access.',
        actions: 'browse',
      };
    }
    if (match('/wiki/governance')) {
      return {
        icon: <ShieldCheck />,
        eyebrow: 'Knowledge Base · Governance',
        title: 'Governance & freshness',
        sub: 'Four-eyes change proposals, freshness verification and open reader questions.',
        actions: 'browse',
      };
    }
    return {
      icon: <Library />,
      eyebrow: 'Knowledge deck',
      title: `${greeting()}${me ? `, ${firstName(me.name)}` : ''}`,
      sub: 'Verified playbooks, zero guesswork — permission-scoped and grounded by Nova Docs.',
      actions: 'browse',
    };
  }, [pathname, articles, spaces, collections, viewer, caps.canWrite, me]);

  const spaceForWrite = head.spaceId ? spaces.find((s) => s.id === head.spaceId) : undefined;

  const actions = (
    <>
      <span ref={setHeadSlot} className="wk-head-slot" />
      {head.actions !== 'none' && (
        <>
          <button type="button" className="neo-btn neo-btn--nova" onClick={() => cortex.open()} data-tip="Grounded answers with citations">
            <Sparkles /> <span className="neo-btn__label">Ask Nova Docs</span>
          </button>
          {caps.canWrite ? (
            <Link
              to={head.actions === 'space' && spaceForWrite ? `/wiki/new?space=${spaceForWrite.id}` : '/wiki/new'}
              className="neo-btn neo-btn--plasma"
              title={head.actions === 'space' && spaceForWrite ? `Write in ${spaceForWrite.name}` : 'Write a page'}
            >
              <PenLine /> <span className="neo-btn__label">{head.actions === 'space' ? 'New page' : 'Write a page'}</span>
            </Link>
          ) : (
            <span
              className="neo-chip neo-chip--lg wk-readonly"
              data-tone="amber"
              title="Contractors have read access to open spaces and Nova Docs; authoring requires wiki.write."
            >
              <Lock /> <span className="neo-btn__label">Read-only access</span>
            </span>
          )}
        </>
      )}
    </>
  );

  return (
    <NeoAppFrame
      app="wiki"
      tint={TINT}
      brand={{ icon: <Library />, label: 'Knowledge Base', to: '/wiki' }}
      label="Knowledge Base"
      items={items}
      footer={footer}
      bodyClassName="wk-body"
      head={{
        icon: head.icon,
        eyebrow: head.eyebrow,
        title: head.title,
        sub: head.sub,
        center: <WikiSearch onAsk={(q) => cortex.open(q)} />,
        actions,
      }}
      overlays={
        /* Ask Nova Docs Modal (?ask=1) */
        <CortexModal open={cortex.isOpen} initialQuery={cortex.query} onClose={cortex.close} />
      }
    >
      <WikiHeadSlotProvider value={headSlot}>
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
      </WikiHeadSlotProvider>
    </NeoAppFrame>
  );
}
