/**
 * Knowledge Base journeys on the shared NeoTracker ("pizza tracker"):
 *  - ProposalTracker — four-eyes change proposals: Proposed → Curator review → Published.
 *    Declined = blocked at review, approved = complete, no eligible curator = paused.
 *  - FreshnessTracker — the verification cycle: Verified → Review due (or Flagged) → Overdue.
 *
 * Every stage, person, timestamp and courier position is derived from the wiki store,
 * hub users and RBAC — nothing is simulated. Copy keeps each static phrase in its own
 * text node (names and times render as separate nodes) so the DOM translator can
 * localise it.
 */
import { useMemo, type ReactNode } from 'react';
import { BadgeCheck, CalendarClock, GitPullRequest, RefreshCw, Rocket, ShieldCheck } from 'lucide-react';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { useHub } from '@/store/hub';
import { useRoles, useSessionUser, useUserById } from '@/store/selectors';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import { firstName, relativeTime } from '@/lib/format';
import { canReviewProposal } from '@/wiki/access';
import { computeFreshness } from '@/wiki/constants';
import { useWikiViewer } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { ChangeProposal, WikiArticle, WikiSpace } from '@/wiki/types';
import type { User } from '@/types';

const DAY = 86_400_000;
/** `computeFreshness` turns "due-soon" this many days before the review date. */
const REVIEW_WINDOW_DAYS = 14;
/** How long an author keeps seeing the outcome of a decided proposal on the page and in the studio. */
export const RECENT_DECISION_MS = 14 * DAY;

/** `card` = glass card, `bare` = inside an existing card/panel, `compact` = slim bar for rows. */
export type TrackerVariant = 'card' | 'bare' | 'compact';

const first = (u: Pick<User, 'name'> | null | undefined, fallback: string) => (u ? firstName(u.name) : fallback);

/** A person's name inside a live status line (its own text node for the translator). */
function Who({ children }: { children: ReactNode }) {
  return <b className="wk-trk__who">{children}</b>;
}

interface Curator {
  user: User;
  /** System Admins (`*`) may sign off their own proposals (see `canReviewProposal`). */
  admin: boolean;
}

/** Active people who can decide change proposals (`app:wiki` + `wiki.manage`). */
function useWikiCurators(): Curator[] {
  const users = useHub((s) => s.users);
  const roles = useRoles();
  return useMemo(() => {
    const out: Curator[] = [];
    for (const user of users) {
      if (!user.active) continue;
      const perms = effectivePermissions(user, roles);
      if (hasPermission(perms, 'app:wiki') && hasPermission(perms, 'wiki.manage')) {
        out.push({ user, admin: hasPermission(perms, '*') });
      }
    }
    return out;
  }, [users, roles]);
}

/** The article version an approved proposal published (`decideProposal` stamps it with `reviewedAt` + the author). */
export function publishedVersionOf(p: ChangeProposal, article?: WikiArticle): number | undefined {
  if (p.status !== 'approved' || !article) return undefined;
  return article.versions.find((v) => v.at === p.reviewedAt && v.authorId === p.authorId)?.version;
}

/** The signed-in author's proposals on one article: pending first, then outcomes decided in the last 14 days. */
export function useMyArticleProposals(articleId: string | undefined, limit = 2): ChangeProposal[] {
  const me = useSessionUser();
  const proposals = useWiki((s) => s.proposals);
  return useMemo(() => {
    if (!me || !articleId) return [];
    const since = Date.now() - RECENT_DECISION_MS;
    return proposals
      .filter(
        (p) =>
          p.articleId === articleId &&
          p.authorId === me.id &&
          (p.status === 'pending' || (p.reviewedAt ?? 0) >= since),
      )
      .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt - a.createdAt)
      .slice(0, limit);
  }, [me, articleId, proposals, limit]);
}

/* ==========================================================================
   Change proposal · Proposed → Curator review → Published
   ========================================================================== */

export function ProposalTracker({
  proposal: p,
  article,
  space,
  variant = 'card',
  hud = 'Change tracker',
  title,
  actions,
  className,
}: {
  proposal: ChangeProposal;
  article?: WikiArticle;
  space?: WikiSpace;
  variant?: TrackerVariant;
  hud?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const viewer = useWikiViewer();
  const me = useSessionUser();
  const curators = useWikiCurators();
  const author = useUserById(p.authorId);
  const decider = useUserById(p.reviewedBy);

  const now = Date.now();
  const approved = p.status === 'approved';
  const declined = p.status === 'declined';
  const decided = approved || declined;
  const isMine = !!viewer && p.authorId === viewer.userId;
  const iCanReview = !isMine && canReviewProposal(viewer, p).ok;

  const roleTag = (id: string) =>
    id === space?.stewardId ? 'Space steward' : id === article?.ownerId ? 'Page owner' : 'Curator';
  const tagged = (u: User) => `${u.name} · ${u.id === viewer?.userId ? 'You' : roleTag(u.id)}`;

  /**
   * Who holds the second pair of eyes while pending. Nobody is assigned in the model, so:
   * you (when it sits in your queue) → the space steward → the page owner → any curator.
   * Authors never count unless they are the only (admin) curator left.
   */
  let lead: User | null = null;
  if (!decided) {
    if (iCanReview && me) {
      lead = me;
    } else {
      const eligible = curators.filter((c) => c.user.id !== p.authorId || c.admin);
      const others = eligible.filter((c) => c.user.id !== p.authorId);
      const pool = others.length ? others : eligible;
      lead =
        [space?.stewardId, article?.ownerId]
          .map((id) => pool.find((c) => c.user.id === id)?.user)
          .find((u): u is User => !!u) ??
        pool[0]?.user ??
        null;
    }
  }

  const version = publishedVersionOf(p, article);
  const steps: NeoTrackStep[] = [
    {
      id: 'proposed',
      label: 'Proposed',
      icon: <GitPullRequest />,
      sub: author ? (isMine ? `${author.name} · You` : author.name) : 'A teammate',
      at: relativeTime(p.createdAt, now),
    },
    {
      id: 'review',
      label: approved ? 'Approved' : declined ? 'Sent back' : 'Curator review',
      icon: <ShieldCheck />,
      sub: decided ? (decider ? tagged(decider) : 'A curator') : lead ? tagged(lead) : 'Awaiting a curator',
      at: p.reviewedAt ? relativeTime(p.reviewedAt, now) : undefined,
    },
    {
      id: 'published',
      label: 'Published',
      icon: <Rocket />,
      sub: approved ? (version ? `v${version} · Live now` : 'Live now') : declined ? 'Live page unchanged' : 'Goes live on approval',
      at: approved && p.reviewedAt ? relativeTime(p.reviewedAt, now) : undefined,
    },
  ];
  const current = approved ? steps.length : 1;
  const state: NeoTrackState = declined ? 'blocked' : !decided && !lead ? 'paused' : 'active';

  const label = 'Change tracker';
  if (variant === 'compact') {
    return <NeoTracker compact steps={steps} current={current} state={state} label={label} className={className} />;
  }

  const deciderName = first(decider, 'A curator');
  const iDecided = !!viewer && p.reviewedBy === viewer.userId;
  let message: ReactNode;
  if (approved) {
    message = iDecided ? (
      'You approved this edit — it’s live'
    ) : (
      <>
        <Who>{deciderName}</Who>
        {isMine ? ' approved it — your edit is live' : ' approved it — this edit is live'}
      </>
    );
  } else if (declined) {
    message = iDecided ? (
      'You sent this edit back'
    ) : (
      <>
        <Who>{deciderName}</Who>
        {isMine ? ' sent your edit back' : ' sent this edit back'}
      </>
    );
  } else if (!lead) {
    message = 'Waiting for a curator to pick this up';
  } else if (isMine) {
    message =
      lead.id === p.authorId ? (
        'No other curator is free — you can sign this off yourself'
      ) : (
        <>
          <Who>{first(lead, 'A curator')}</Who>
          {' is giving your edit a second pair of eyes'}
        </>
      );
  } else if (iCanReview) {
    message = (
      <>
        {'Your turn — '}
        <Who>{first(author, 'A teammate')}</Who>
        {' is waiting on your review'}
      </>
    );
  } else {
    message = (
      <>
        <Who>{first(lead, 'A curator')}</Who>
        {' is giving this edit a second pair of eyes'}
      </>
    );
  }
  if (decided && p.reviewNote) {
    message = (
      <>
        {message}
        {/* The curator's own words — never machine-translated */}
        <span className="wk-trk__note" data-no-i18n>
          “{p.reviewNote}”
        </span>
      </>
    );
  }

  return (
    <NeoTracker
      steps={steps}
      current={current}
      state={state}
      hud={hud}
      title={title}
      message={message}
      actions={actions}
      bare={variant === 'bare'}
      label={label}
      className={className}
    />
  );
}

/* ==========================================================================
   Freshness cycle · Verified → Review due (or Flagged) → Overdue
   ========================================================================== */

export function FreshnessTracker({
  article,
  variant = 'bare',
  hud,
  className,
}: {
  article: WikiArticle;
  variant?: TrackerVariant;
  hud?: ReactNode;
  className?: string;
}) {
  const viewer = useWikiViewer();
  const owner = useUserById(article.ownerId);
  const verifier = useUserById(article.lastVerifiedBy);
  const flagger = useUserById(article.flaggedStale?.by);

  const now = Date.now();
  const f = computeFreshness(article, now);
  const flag = article.flaggedStale;
  const pastDue = f.daysRemaining < 0;
  const dueAt = article.lastVerifiedAt + article.reviewCadenceDays * DAY;
  const windowAt = Math.max(article.lastVerifiedAt, dueAt - REVIEW_WINDOW_DAYS * DAY);

  // Fresh → review window (or a reader flag) → past the review date.
  const current = pastDue ? 2 : flag || f.state === 'due-soon' ? 1 : 0;
  const state: NeoTrackState = pastDue || flag ? 'blocked' : 'active';
  // The courier rides real time: share of the fresh window, then of the review window, already elapsed.
  const elapsed = (from: number, to: number) => (to > from ? (now - from) / (to - from) : 1);
  const progress = current === 0 ? elapsed(article.lastVerifiedAt, windowAt) : elapsed(windowAt, dueAt);

  const isOwner = !!viewer && viewer.userId === article.ownerId;
  const named = (u: User | null) => (u ? (u.id === viewer?.userId ? `${u.name} · You` : u.name) : undefined);
  const ownerSub = named(owner) ?? 'Page owner';
  const overdueDays = Math.abs(f.daysRemaining);
  const flaggedEarly = !!flag && !pastDue;

  const steps: NeoTrackStep[] = [
    {
      id: 'verified',
      label: 'Verified',
      icon: <BadgeCheck />,
      sub: named(verifier),
      at: relativeTime(article.lastVerifiedAt, now),
    },
    {
      id: 'due',
      label: flaggedEarly ? 'Flagged' : 'Review due',
      icon: <CalendarClock />,
      sub: ownerSub,
      at: flaggedEarly && flag ? relativeTime(flag.at, now) : relativeTime(dueAt, now),
    },
    {
      id: 'overdue',
      label: pastDue ? 'Overdue' : 'Re-verify',
      icon: <RefreshCw />,
      sub: pastDue ? ownerSub : undefined,
      at: pastDue ? (overdueDays === 1 ? '1 day' : `${overdueDays} days`) : undefined,
    },
  ];

  const label = 'Freshness tracker';
  if (variant === 'compact') {
    return (
      <NeoTracker compact steps={steps} current={current} state={state} progress={progress} label={label} className={className} />
    );
  }

  const ownerFirst = first(owner, 'The owner');
  const dueIn = dueAt > now ? relativeTime(dueAt, now) : 'today';
  let message: ReactNode;
  if (flag) {
    message = isOwner ? (
      <>
        <Who>{first(flagger, 'A teammate')}</Who>
        {' flagged something outdated — please give it a fresh check'}
      </>
    ) : (
      <>
        <Who>{first(flagger, 'A teammate')}</Who>
        {' flagged something outdated — '}
        <Who>{ownerFirst}</Who>
        {' needs to give it a fresh check'}
      </>
    );
  } else if (pastDue) {
    message = isOwner ? (
      'Past its review date — please give it a fresh check'
    ) : (
      <>
        {'Past its review date — '}
        <Who>{ownerFirst}</Who>
        {' needs to give it a fresh check'}
      </>
    );
  } else if (current === 1) {
    message = isOwner ? (
      <>
        {'Your freshness check is due '}
        <span>{dueIn}</span>
      </>
    ) : (
      <>
        <Who>{ownerFirst}</Who>
        {' is up for a freshness check '}
        <span>{dueIn}</span>
      </>
    );
  } else {
    message = isOwner ? (
      'Fresh and trusted — nothing to do yet'
    ) : (
      <>
        {'Fresh and trusted — '}
        <Who>{ownerFirst}</Who>
        {' has it covered'}
      </>
    );
  }

  return (
    <NeoTracker
      steps={steps}
      current={current}
      state={state}
      progress={progress}
      hud={hud}
      message={message}
      bare={variant === 'bare'}
      label={label}
      className={className}
    />
  );
}
