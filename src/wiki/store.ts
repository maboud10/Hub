/**
 * Helix Knowledge Base ("Cortex") store — permission-scoped playbooks,
 * versioned editing, four-eyes change proposals on locked canonical pages,
 * freshness verification, interactive runbook checklists, bookmarks & Q&A.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';
import { uid } from '@/lib/id';
import * as access from './access';
import { WIKI_DATA_VERSION } from './constants';
import { buildWikiSeed } from './seed';
import type {
  ArticleSection,
  ChangeProposal,
  SpaceId,
  UserWikiState,
  WikiArticle,
  WikiComment,
  WikiData,
} from './types';

export interface NewArticleInput {
  spaceId: SpaceId;
  title: string;
  subtitle: string;
  tldr: string;
  tags: string[];
  readMins?: number;
  reviewCadenceDays?: number;
  locked?: boolean;
  relatedCourseIds?: string[];
  sections: ArticleSection[];
}

export interface UpdateArticleInput {
  title: string;
  subtitle: string;
  tldr: string;
  tags: string[];
  sections: ArticleSection[];
  summary: string;
  relatedCourseIds?: string[];
}

export interface ProposeEditInput {
  summary: string;
  proposedTitle: string;
  proposedTldr: string;
  proposedSections: ArticleSection[];
}

export interface WikiActions {
  createArticle(input: NewArticleInput): ActionResult & { slug?: string };
  updateArticle(slug: string, input: UpdateArticleInput): ActionResult;
  proposeEdit(slug: string, input: ProposeEditInput): ActionResult & { proposalId?: string };
  decideProposal(proposalId: string, decision: 'approved' | 'declined', reviewNote?: string): ActionResult;
  verifyFreshness(slug: string): ActionResult;
  flagStale(slug: string, reason: string): ActionResult;
  toggleLock(slug: string): ActionResult;
  togglePin(slug: string): ActionResult;
  toggleBookmark(slug: string): ActionResult;
  markRead(slug: string, read?: boolean): void;
  recordView(slug: string): void;
  toggleHelpful(slug: string): ActionResult;
  toggleRunbookCheck(articleId: string, checkId: string): void;
  addComment(slug: string, text: string, kind: 'question' | 'note'): ActionResult;
  resolveComment(commentId: string): ActionResult;
  resetWikiDemo(): void;
}

export type WikiStore = WikiData & WikiActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 56) || 'playbook';

const emptyUserState = (): UserWikiState => ({
  bookmarks: [],
  readSlugs: [],
  recentSlugs: [],
  runbookChecks: {},
});

export const useWiki = create<WikiStore>()(
  persist(
    (set, get) => {
      const hub = () => useHub.getState();
      const viewer = (): { v: access.WikiViewer; user: User } | null => {
        const h = hub();
        const user = h.users.find((u) => u.id === h.sessionUserId && u.active);
        if (!user) return null;
        return {
          v: {
            userId: user.id,
            roleIds: user.roleIds,
            perms: effectivePermissions(user, h.roles),
          },
          user,
        };
      };

      const audit = (entry: {
        action: string;
        target: string;
        detail?: string;
        outcome?: 'success' | 'denied';
        severity?: 'info' | 'warning' | 'critical';
      }) => {
        const actorId = hub().sessionUserId ?? 'system';
        useHub.setState((s) => ({
          audit: [
            {
              id: uid('au'),
              at: Date.now(),
              actorId,
              outcome: entry.outcome ?? 'success',
              severity: entry.severity ?? 'info',
              action: entry.action,
              target: entry.target,
              detail: entry.detail,
            },
            ...s.audit,
          ].slice(0, 400),
        }));
      };

      const notify = (recipientIds: string[], n: Omit<HubNotification, 'id' | 'at' | 'read' | 'userId'>) => {
        const actorId = hub().sessionUserId;
        const targets = [...new Set(recipientIds.filter((id) => id && id !== actorId))];
        if (!targets.length) return;
        const now = Date.now();
        const items: HubNotification[] = targets.map((userId) => ({
          ...n,
          id: uid('n'),
          userId,
          at: now,
          read: false,
        }));
        useHub.setState((s) => ({ notifications: [...items, ...s.notifications].slice(0, 80) }));
      };

      return {
        ...buildWikiSeed(),

        createArticle(input) {
          const ctx = viewer();
          if (!ctx || !access.canWriteWiki(ctx.v)) {
            audit({
              action: 'wiki.article.denied',
              target: input.title || 'New article',
              detail: 'Missing wiki.write permission',
              outcome: 'denied',
              severity: 'warning',
            });
            return fail('Writing pages requires the Knowledge Base contributor (`wiki.write`) permission.');
          }
          const space = get().spaces.find((s) => s.id === input.spaceId);
          if (!access.canReadSpace(ctx.v, space)) {
            return fail('You do not have access to publish in that space.');
          }
          const title = input.title.trim();
          if (title.length < 4) return fail('Give your playbook a descriptive title (at least 4 characters).');
          const cleanSections = input.sections
            .map((s, idx) => ({
              ...s,
              id: s.id || `sec-${idx + 1}`,
              heading: s.heading.trim() || `Section ${idx + 1}`,
              body: s.body.trim(),
            }))
            .filter((s) => s.body.length > 0);
          if (cleanSections.length === 0) {
            return fail('Add at least one section with body content.');
          }

          const baseSlug = slugify(title);
          const existingSlugs = new Set(get().articles.map((a) => a.slug));
          let slug = baseSlug;
          let counter = 2;
          while (existingSlugs.has(slug)) {
            slug = `${baseSlug}-${counter++}`;
          }

          const now = Date.now();
          const wordCount = cleanSections.reduce((sum, s) => sum + s.body.split(/\s+/).length, 0);
          const readMins = input.readMins ?? Math.max(2, Math.round(wordCount / 160));
          const locked = input.locked && access.canManageWiki(ctx.v) ? true : false;
          const tldr = input.tldr.trim() || cleanSections[0].body.slice(0, 180);

          const article: WikiArticle = {
            id: uid('art'),
            slug,
            spaceId: input.spaceId,
            title,
            subtitle: input.subtitle.trim() || `${space?.name ?? 'Knowledge Base'} playbook`,
            tldr,
            tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
            ownerId: ctx.user.id,
            locked,
            readMins,
            reviewCadenceDays: input.reviewCadenceDays ?? 90,
            lastVerifiedAt: now,
            lastVerifiedBy: ctx.user.id,
            relatedCourseIds: input.relatedCourseIds ?? [],
            sections: cleanSections,
            versions: [
              {
                version: 1,
                at: now,
                authorId: ctx.user.id,
                summary: 'Initial publication',
                title,
                tldr,
                sections: cleanSections,
              },
            ],
            views: 1,
            helpfulUserIds: [ctx.user.id],
            createdAt: now,
            updatedAt: now,
          };

          set((s) => ({ articles: [article, ...s.articles] }));
          audit({
            action: 'wiki.article.created',
            target: article.title,
            detail: `Published in ${space?.name ?? input.spaceId} (/wiki/doc/${slug})`,
          });
          return { ok: true, message: `Published “${article.title}”.`, slug };
        },

        updateArticle(slug, input) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!article) return fail('Playbook not found.');
          if (!ctx || !access.canDirectEdit(ctx.v, article, state.spaces)) {
            audit({
              action: 'wiki.article.edit_denied',
              target: article.title,
              detail: article.locked ? 'Locked canonical page — submit a Change Proposal' : 'Missing wiki.write',
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(
              article.locked
                ? 'This canonical policy is locked. Submit a Change Proposal for curator review instead.'
                : 'You do not have permission to edit this page.',
            );
          }

          const title = input.title.trim();
          if (title.length < 4) return fail('Title must be at least 4 characters.');
          const cleanSections = input.sections
            .map((s, idx) => ({
              ...s,
              id: s.id || `sec-${idx + 1}`,
              heading: s.heading.trim() || `Section ${idx + 1}`,
              body: s.body.trim(),
            }))
            .filter((s) => s.body.length > 0);
          if (!cleanSections.length) return fail('Keep at least one non-empty section.');

          const now = Date.now();
          const nextVer = (article.versions[article.versions.length - 1]?.version ?? article.versions.length) + 1;
          const summary = input.summary.trim() || 'Updated content & verified accuracy';

          set((s) => ({
            articles: s.articles.map((a) =>
              a.id === article.id
                ? {
                    ...a,
                    title,
                    subtitle: input.subtitle.trim() || a.subtitle,
                    tldr: input.tldr.trim() || a.tldr,
                    tags: input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
                    relatedCourseIds: input.relatedCourseIds ?? a.relatedCourseIds,
                    sections: cleanSections,
                    lastVerifiedAt: now,
                    lastVerifiedBy: ctx.user.id,
                    flaggedStale: undefined,
                    updatedAt: now,
                    versions: [
                      ...a.versions,
                      {
                        version: nextVer,
                        at: now,
                        authorId: ctx.user.id,
                        summary,
                        title,
                        tldr: input.tldr.trim() || a.tldr,
                        sections: cleanSections,
                      },
                    ],
                  }
                : a,
            ),
          }));

          audit({
            action: 'wiki.article.updated',
            target: title,
            detail: `v${nextVer}: ${summary}`,
          });
          return ok(`Saved v${nextVer} of “${title}”.`);
        },

        proposeEdit(slug, input) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!article) return fail('Playbook not found.');
          if (!ctx || !access.canProposeEdit(ctx.v, article, state.spaces)) {
            return fail('Proposing edits requires `wiki.write` permission and access to this space.');
          }
          const summary = input.summary.trim();
          if (summary.length < 6) {
            return fail('Add a short summary explaining why this change is needed.');
          }
          const cleanSections = input.proposedSections
            .map((s, idx) => ({
              ...s,
              id: s.id || `sec-${idx + 1}`,
              heading: s.heading.trim() || `Section ${idx + 1}`,
              body: s.body.trim(),
            }))
            .filter((s) => s.body.length > 0);
          if (!cleanSections.length) return fail('Proposed article must contain at least one section.');

          const space = state.spaces.find((sp) => sp.id === article.spaceId);
          const proposal: ChangeProposal = {
            id: uid('prop'),
            articleId: article.id,
            authorId: ctx.user.id,
            createdAt: Date.now(),
            summary,
            proposedTitle: input.proposedTitle.trim() || article.title,
            proposedTldr: input.proposedTldr.trim() || article.tldr,
            proposedSections: cleanSections,
            status: 'pending',
          };

          set((s) => ({ proposals: [proposal, ...s.proposals] }));
          notify([article.ownerId, space?.stewardId ?? ''], {
            kind: 'learning',
            title: `Change proposal on “${article.title}”`,
            body: `${ctx.user.name}: ${summary}`,
            link: '/wiki/governance',
          });
          audit({
            action: 'wiki.proposal.submitted',
            target: article.title,
            detail: summary,
          });
          return { ok: true, message: 'Change proposal submitted for curator review.', proposalId: proposal.id };
        },

        decideProposal(proposalId, decision, reviewNote) {
          const ctx = viewer();
          const state = get();
          const proposal = state.proposals.find((p) => p.id === proposalId);
          const gate = access.canReviewProposal(ctx?.v ?? null, proposal);
          if (!ctx || !proposal || !gate.ok) {
            audit({
              action: 'wiki.proposal.review_denied',
              target: proposalId,
              detail: gate.ok ? 'Unknown proposal' : gate.reason,
              outcome: 'denied',
              severity: 'warning',
            });
            return fail(gate.ok ? 'Proposal not found.' : gate.reason);
          }

          const article = state.articles.find((a) => a.id === proposal.articleId);
          if (!article) return fail('Target playbook no longer exists.');
          const now = Date.now();
          const nextVer = (article.versions[article.versions.length - 1]?.version ?? article.versions.length) + 1;

          set((s) => ({
            proposals: s.proposals.map((p) =>
              p.id === proposalId
                ? {
                    ...p,
                    status: decision,
                    reviewedBy: ctx.user.id,
                    reviewedAt: now,
                    reviewNote: reviewNote?.trim() || undefined,
                  }
                : p,
            ),
            articles:
              decision === 'approved'
                ? s.articles.map((a) =>
                    a.id === article.id
                      ? {
                          ...a,
                          title: proposal.proposedTitle,
                          tldr: proposal.proposedTldr,
                          sections: proposal.proposedSections,
                          lastVerifiedAt: now,
                          lastVerifiedBy: ctx.user.id,
                          flaggedStale: undefined,
                          updatedAt: now,
                          versions: [
                            ...a.versions,
                            {
                              version: nextVer,
                              at: now,
                              authorId: proposal.authorId,
                              summary: `${proposal.summary} (reviewed by ${ctx.user.name})`,
                              title: proposal.proposedTitle,
                              tldr: proposal.proposedTldr,
                              sections: proposal.proposedSections,
                            },
                          ],
                        }
                      : a,
                  )
                : s.articles,
          }));

          notify([proposal.authorId], {
            kind: 'learning',
            title:
              decision === 'approved'
                ? `Your Knowledge Base edit to “${article.title}” is live`
                : `Update on your proposal for “${article.title}”`,
            body: reviewNote?.trim() || proposal.summary,
            link: `/wiki/doc/${article.slug}`,
          });

          audit({
            action: decision === 'approved' ? 'wiki.proposal.approved' : 'wiki.proposal.declined',
            target: article.title,
            detail: `${proposal.summary}${reviewNote ? ` — ${reviewNote}` : ''}`,
          });

          return ok(
            decision === 'approved'
              ? `Approved & published v${nextVer} of “${article.title}”.`
              : `Declined proposal on “${article.title}”.`,
          );
        },

        verifyFreshness(slug) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canVerifyFreshness(ctx.v, article, state.spaces)) {
            return fail('Only the page owner or a Knowledge Base curator (`wiki.manage`) can verify freshness.');
          }
          const now = Date.now();
          set((s) => ({
            articles: s.articles.map((a) =>
              a.id === article.id
                ? { ...a, lastVerifiedAt: now, lastVerifiedBy: ctx.user.id, flaggedStale: undefined }
                : a,
            ),
          }));
          audit({
            action: 'wiki.article.verified',
            target: article.title,
            detail: `Verified up-to-date for ${article.reviewCadenceDays}d cycle`,
          });
          return ok(`Marked “${article.title}” verified today.`);
        },

        flagStale(slug, reason) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canReadArticle(ctx.v, article, state.spaces) || !access.canWriteWiki(ctx.v)) {
            return fail('Flagging pages requires `wiki.write` permission.');
          }
          const clean = reason.trim();
          if (clean.length < 4) return fail('Briefly note what looks outdated so the owner can fix it quickly.');
          const now = Date.now();
          set((s) => ({
            articles: s.articles.map((a) =>
              a.id === article.id ? { ...a, flaggedStale: { by: ctx.user.id, at: now, reason: clean } } : a,
            ),
          }));
          notify([article.ownerId], {
            kind: 'learning',
            title: `“${article.title}” flagged for freshness review`,
            body: `${ctx.user.name}: ${clean}`,
            link: `/wiki/doc/${article.slug}`,
          });
          audit({
            action: 'wiki.article.flagged_stale',
            target: article.title,
            detail: clean,
          });
          return ok('Flagged for owner & curator review.');
        },

        toggleLock(slug) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canManageWiki(ctx.v)) {
            return fail('Locking or unlocking canonical pages requires `wiki.manage`.');
          }
          const nextLocked = !article.locked;
          set((s) => ({
            articles: s.articles.map((a) => (a.id === article.id ? { ...a, locked: nextLocked } : a)),
          }));
          audit({
            action: nextLocked ? 'wiki.article.locked' : 'wiki.article.unlocked',
            target: article.title,
          });
          return ok(nextLocked ? 'Page locked — edits now require a Change Proposal.' : 'Page unlocked for direct edits.');
        },

        togglePin(slug) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canManageWiki(ctx.v)) {
            return fail('Pinning featured playbooks requires `wiki.manage`.');
          }
          const nextPinned = !article.pinned;
          set((s) => ({
            articles: s.articles.map((a) => (a.id === article.id ? { ...a, pinned: nextPinned } : a)),
          }));
          return ok(nextPinned ? 'Pinned to Knowledge Base highlights.' : 'Unpinned from highlights.');
        },

        toggleBookmark(slug) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canReadArticle(ctx.v, article, state.spaces)) {
            return fail('Playbook unavailable.');
          }
          const cur = state.userState[ctx.user.id] ?? emptyUserState();
          const exists = cur.bookmarks.includes(slug);
          const bookmarks = exists ? cur.bookmarks.filter((x) => x !== slug) : [slug, ...cur.bookmarks];
          set((s) => ({
            userState: { ...s.userState, [ctx.user.id]: { ...cur, bookmarks } },
          }));
          return ok(exists ? 'Removed from bookmarks.' : 'Saved to your bookmarks.');
        },

        markRead(slug, read = true) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canReadArticle(ctx.v, article, state.spaces)) return;
          const cur = state.userState[ctx.user.id] ?? emptyUserState();
          const has = cur.readSlugs.includes(slug);
          if (read && has) return;
          if (!read && !has) return;
          const readSlugs = read ? [...cur.readSlugs, slug] : cur.readSlugs.filter((x) => x !== slug);
          set((s) => ({
            userState: { ...s.userState, [ctx.user.id]: { ...cur, readSlugs } },
          }));
        },

        recordView(slug) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canReadArticle(ctx.v, article, state.spaces)) return;
          const cur = state.userState[ctx.user.id] ?? emptyUserState();
          const alreadyTop = cur.recentSlugs[0] === slug;
          const recentSlugs = [slug, ...cur.recentSlugs.filter((x) => x !== slug)].slice(0, 8);
          set((s) => ({
            userState: { ...s.userState, [ctx.user.id]: { ...cur, recentSlugs } },
            articles: alreadyTop
              ? s.articles
              : s.articles.map((a) => (a.id === article.id ? { ...a, views: a.views + 1 } : a)),
          }));
        },

        toggleHelpful(slug) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canReadArticle(ctx.v, article, state.spaces)) {
            return fail('Playbook unavailable.');
          }
          const voted = article.helpfulUserIds.includes(ctx.user.id);
          set((s) => ({
            articles: s.articles.map((a) =>
              a.id === article.id
                ? {
                    ...a,
                    helpfulUserIds: voted
                      ? a.helpfulUserIds.filter((id) => id !== ctx.user.id)
                      : [...a.helpfulUserIds, ctx.user.id],
                  }
                : a,
            ),
          }));
          return ok(voted ? 'Vote removed.' : 'Thanks — marked helpful!');
        },

        toggleRunbookCheck(articleId, checkId) {
          const ctx = viewer();
          if (!ctx || !access.canUseWiki(ctx.v)) return;
          const cur = get().userState[ctx.user.id] ?? emptyUserState();
          const prev = cur.runbookChecks[articleId] ?? [];
          const next = prev.includes(checkId) ? prev.filter((x) => x !== checkId) : [...prev, checkId];
          set((s) => ({
            userState: {
              ...s.userState,
              [ctx.user.id]: {
                ...cur,
                runbookChecks: { ...cur.runbookChecks, [articleId]: next },
              },
            },
          }));
        },

        addComment(slug, text, kind) {
          const ctx = viewer();
          const state = get();
          const article = state.articles.find((a) => a.slug === slug);
          if (!ctx || !article || !access.canReadArticle(ctx.v, article, state.spaces) || !access.canWriteWiki(ctx.v)) {
            return fail('Posting comments or questions requires `wiki.write`.');
          }
          const clean = text.trim();
          if (clean.length < 3) return fail('Write a brief question or note first.');
          const comment: WikiComment = {
            id: uid('wc'),
            articleId: article.id,
            authorId: ctx.user.id,
            at: Date.now(),
            text: clean,
            kind,
            resolved: kind === 'note',
          };
          set((s) => ({ comments: [comment, ...s.comments] }));
          if (kind === 'question') {
            notify([article.ownerId], {
              kind: 'learning',
              title: `New question on “${article.title}”`,
              body: `${ctx.user.name}: ${clean}`,
              link: `/wiki/doc/${article.slug}`,
            });
          }
          return ok(kind === 'question' ? 'Question posted — page owner notified.' : 'Note added.');
        },

        resolveComment(commentId) {
          const ctx = viewer();
          const state = get();
          const comment = state.comments.find((c) => c.id === commentId);
          if (!ctx || !comment) return fail('Comment not found.');
          const article = state.articles.find((a) => a.id === comment.articleId);
          const allowed =
            access.canManageWiki(ctx.v) ||
            comment.authorId === ctx.user.id ||
            article?.ownerId === ctx.user.id;
          if (!allowed) return fail('Only the author, page owner, or a curator can resolve this thread.');
          set((s) => ({
            comments: s.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
          }));
          return ok('Updated thread status.');
        },

        resetWikiDemo() {
          set(buildWikiSeed());
        },
      };
    },
    {
      name: 'nexus-wiki',
      version: WIKI_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): WikiData => ({
        version: s.version,
        spaces: s.spaces,
        collections: s.collections,
        articles: s.articles,
        proposals: s.proposals,
        comments: s.comments,
        userState: s.userState,
      }),
      migrate: (persisted, version) => (version === WIKI_DATA_VERSION ? (persisted as WikiData) : buildWikiSeed()),
    },
  ),
);
