/**
 * Memoised selectors & permission-aware projections for Helix Knowledge Base.
 */
import { useMemo } from 'react';
import { usePermissions, useSessionUser } from '@/store/selectors';
import * as access from './access';
import { computeFreshness, type FreshnessInfo } from './constants';
import { useWiki } from './store';
import type { UserWikiState, WikiArticle, WikiCollection, WikiSpace } from './types';

const EMPTY_USER_STATE: UserWikiState = {
  bookmarks: [],
  readSlugs: [],
  recentSlugs: [],
  runbookChecks: {},
};

export function useWikiViewer(): access.WikiViewer | null {
  const user = useSessionUser();
  const perms = usePermissions();
  return useMemo(
    () => (user ? { userId: user.id, roleIds: user.roleIds, perms } : null),
    [user, perms],
  );
}

export interface WikiCaps {
  canUse: boolean;
  canWrite: boolean;
  canManage: boolean;
}

export function useWikiCaps(): WikiCaps {
  const v = useWikiViewer();
  return useMemo(
    () => ({
      canUse: access.canUseWiki(v),
      canWrite: access.canWriteWiki(v),
      canManage: access.canManageWiki(v),
    }),
    [v],
  );
}

export interface SpaceView {
  space: WikiSpace;
  readable: boolean;
  articleCount: number;
  verifiedCount: number;
  attentionCount: number;
}

export function useSpaceViews(): SpaceView[] {
  const v = useWikiViewer();
  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);
  return useMemo(
    () =>
      spaces.map((space) => {
        const readable = access.canReadSpace(v, space);
        const inSpace = readable ? articles.filter((a) => a.spaceId === space.id) : [];
        let verifiedCount = 0;
        let attentionCount = 0;
        for (const a of inSpace) {
          const f = computeFreshness(a);
          if (f.state === 'verified') verifiedCount += 1;
          else attentionCount += 1;
        }
        return {
          space,
          readable,
          articleCount: inSpace.length,
          verifiedCount,
          attentionCount,
        };
      }),
    [v, spaces, articles],
  );
}

export function useVisibleArticles(): WikiArticle[] {
  const v = useWikiViewer();
  const spaces = useWiki((s) => s.spaces);
  const articles = useWiki((s) => s.articles);
  return useMemo(() => {
    if (!v) return [];
    const allowed = access.readableSpaceIds(v, spaces);
    return articles.filter((a) => allowed.has(a.spaceId));
  }, [v, spaces, articles]);
}

export function useMyWikiState(): UserWikiState {
  const me = useSessionUser();
  const map = useWiki((s) => s.userState);
  return me ? map[me.id] ?? EMPTY_USER_STATE : EMPTY_USER_STATE;
}

export interface EnrichedCollection {
  collection: WikiCollection;
  articles: WikiArticle[];
  readCount: number;
  totalCount: number;
  pct: number;
  totalMins: number;
}

export function useVisibleCollections(): EnrichedCollection[] {
  const collections = useWiki((s) => s.collections);
  const visible = useVisibleArticles();
  const myState = useMyWikiState();
  return useMemo(() => {
    const bySlug = new Map(visible.map((a) => [a.slug, a]));
    const readSet = new Set(myState.readSlugs);
    return collections
      .map((c) => {
        const articles = c.articleSlugs.map((slug) => bySlug.get(slug)).filter((a): a is WikiArticle => !!a);
        const readCount = articles.filter((a) => readSet.has(a.slug)).length;
        const totalCount = articles.length;
        const totalMins = articles.reduce((sum, a) => sum + a.readMins, 0);
        return {
          collection: c,
          articles,
          readCount,
          totalCount,
          pct: totalCount ? Math.round((readCount / totalCount) * 100) : 0,
          totalMins,
        };
      })
      .filter((c) => c.totalCount > 0);
  }, [collections, visible, myState.readSlugs]);
}

export interface GovernanceItem {
  article: WikiArticle;
  freshness: FreshnessInfo;
}

export function useGovernanceQueue() {
  const visible = useVisibleArticles();
  const proposals = useWiki((s) => s.proposals);
  const comments = useWiki((s) => s.comments);
  return useMemo(() => {
    const visibleById = new Map(visible.map((a) => [a.id, a]));
    const pendingProposals = proposals.filter((p) => p.status === 'pending' && visibleById.has(p.articleId));
    const decidedProposals = proposals.filter((p) => p.status !== 'pending' && visibleById.has(p.articleId));
    const attentionArticles: GovernanceItem[] = visible
      .map((article) => ({ article, freshness: computeFreshness(article) }))
      .filter((x) => x.freshness.state !== 'verified')
      .sort((a, b) => Number(b.freshness.flagged) - Number(a.freshness.flagged) || a.freshness.daysRemaining - b.freshness.daysRemaining);
    const openQuestions = comments.filter((c) => c.kind === 'question' && !c.resolved && visibleById.has(c.articleId));
    const verifiedPct = visible.length
      ? Math.round(((visible.length - attentionArticles.length) / visible.length) * 100)
      : 100;
    return {
      pendingProposals,
      decidedProposals,
      attentionArticles,
      openQuestions,
      verifiedPct,
      totalVisible: visible.length,
    };
  }, [visible, proposals, comments]);
}
