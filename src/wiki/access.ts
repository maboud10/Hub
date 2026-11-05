/**
 * Permission rules for Helix Knowledge Base:
 *  - `app:wiki` unlocks Knowledge Base.
 *  - Spaces with non-empty `audienceRoleIds` restrict read visibility to holders
 *    of those roles (or `wiki.manage` / System Admin `*`). Contractors (`contractor`)
 *    only see open spaces (`handbook`, `onboarding`, `security`), and Cortex Q&A
 *    strictly filters through `canReadArticle` before generating answers.
 *  - `wiki.write` unlocks authoring pages, proposing edits, freshness checks & comments.
 *  - `wiki.manage` unlocks space curation, locking canonical docs, and approving
 *    change proposals (with separation of duties: authors don't self-approve).
 */
import { hasPermission } from '@/lib/rbac';
import type { ChangeProposal, SpaceId, WikiArticle, WikiSpace } from './types';

export interface WikiViewer {
  userId: string;
  roleIds: string[];
  perms: Set<string>;
}

export const canUseWiki = (v: WikiViewer | null): boolean => !!v && hasPermission(v.perms, 'app:wiki');

export const canWriteWiki = (v: WikiViewer | null): boolean =>
  !!v && canUseWiki(v) && hasPermission(v.perms, 'wiki.write');

export const canManageWiki = (v: WikiViewer | null): boolean =>
  !!v && canUseWiki(v) && hasPermission(v.perms, 'wiki.manage');

export function canReadSpace(v: WikiViewer | null, space: WikiSpace | undefined): boolean {
  if (!v || !space || !canUseWiki(v)) return false;
  if (space.audienceRoleIds.length === 0) return true;
  if (hasPermission(v.perms, '*') || canManageWiki(v)) return true;
  return space.audienceRoleIds.some((rid) => v.roleIds.includes(rid));
}

export function canReadArticle(
  v: WikiViewer | null,
  article: WikiArticle | undefined,
  spaces: WikiSpace[],
): boolean {
  if (!v || !article) return false;
  const space = spaces.find((s) => s.id === article.spaceId);
  return canReadSpace(v, space);
}

export function canDirectEdit(
  v: WikiViewer | null,
  article: WikiArticle | undefined,
  spaces: WikiSpace[],
): boolean {
  if (!v || !article || !canReadArticle(v, article, spaces) || !canWriteWiki(v)) return false;
  if (!article.locked) return true;
  return canManageWiki(v) || article.ownerId === v.userId;
}

export function canProposeEdit(
  v: WikiViewer | null,
  article: WikiArticle | undefined,
  spaces: WikiSpace[],
): boolean {
  return !!v && !!article && canReadArticle(v, article, spaces) && canWriteWiki(v);
}

export function canVerifyFreshness(
  v: WikiViewer | null,
  article: WikiArticle | undefined,
  spaces: WikiSpace[],
): boolean {
  if (!v || !article || !canReadArticle(v, article, spaces) || !canWriteWiki(v)) return false;
  return canManageWiki(v) || article.ownerId === v.userId;
}

export function canReviewProposal(
  v: WikiViewer | null,
  proposal: ChangeProposal | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!v || !canManageWiki(v)) return { ok: false, reason: 'Requires `wiki.manage` curation permission.' };
  if (!proposal || proposal.status !== 'pending') return { ok: false, reason: 'This proposal has already been decided.' };
  if (proposal.authorId === v.userId && !hasPermission(v.perms, '*')) {
    return { ok: false, reason: 'Separation of duties: another curator must review your own change proposal.' };
  }
  return { ok: true };
}

export function readableSpaceIds(v: WikiViewer | null, spaces: WikiSpace[]): Set<SpaceId> {
  return new Set(spaces.filter((s) => canReadSpace(v, s)).map((s) => s.id));
}
