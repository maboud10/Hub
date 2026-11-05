import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Clock,
  Compass,
  Layers,
  ListChecks,
  Lock,
  LockKeyhole,
  Pin,
  Rocket,
  ShieldCheck,
  Terminal,
  ThumbsUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { getIcon } from '@/icons';
import { Avatar, ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { useClearance, usePrimaryRole, useRoles, useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { computeFreshness, type FreshnessInfo } from '@/wiki/constants';
import { useMyWikiState } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { WikiArticle, WikiSpace } from '@/wiki/types';

const SPACE_ICONS: Record<string, LucideIcon> = {
  Compass,
  Rocket,
  ShieldCheck,
  Layers,
  Terminal,
  Users,
};

export function resolveSpaceIcon(iconName: string): LucideIcon {
  return SPACE_ICONS[iconName] ?? getIcon(iconName);
}

export function SpaceIcon({
  space,
  size = 42,
  className,
}: {
  space: Pick<WikiSpace, 'icon' | 'hue'>;
  size?: number;
  className?: string;
}) {
  const Icon = resolveSpaceIcon(space.icon);
  return (
    <span
      className={cx('wk-space-icon', className)}
      style={{ '--sp-h': space.hue, '--sz': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <Icon strokeWidth={1.85} />
    </span>
  );
}

export function SpacePill({ space }: { space: Pick<WikiSpace, 'name' | 'icon' | 'hue'> }) {
  const Icon = resolveSpaceIcon(space.icon);
  return (
    <span className="wk-space-pill" style={{ '--sp-h': space.hue } as CSSProperties}>
      <Icon aria-hidden="true" />
      {space.name}
    </span>
  );
}

export function FreshnessPill({
  article,
  info,
}: {
  article?: Pick<WikiArticle, 'lastVerifiedAt' | 'reviewCadenceDays' | 'flaggedStale'>;
  info?: FreshnessInfo;
}) {
  const f = info ?? (article ? computeFreshness(article) : null);
  if (!f) return null;
  const Icon = f.state === 'verified' ? CheckCircle2 : f.state === 'due-soon' ? Clock : AlertTriangle;
  return (
    <span className={cx('wk-fresh', `wk-fresh--${f.state}`)}>
      <Icon aria-hidden="true" />
      {f.label}
    </span>
  );
}

export function ProgressRing({
  done,
  total,
  size = 62,
  sublabel = 'read',
}: {
  done: number;
  total: number;
  size?: number;
  sublabel?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const stroke = 5;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <span className="wk-ring" style={{ '--size': `${size}px` } as CSSProperties} aria-label={`${done} of ${total} ${sublabel}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="wk-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle className="wk-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="wk-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="wk-ring__label">
        <span>
          {done}/{total}
        </span>
        <small>{sublabel}</small>
      </span>
    </span>
  );
}

export function RoleAudienceChips({ roleIds }: { roleIds: string[] }) {
  const roles = useRoles();
  if (!roleIds.length) {
    return <span className="badge badge--success">All NEXUS members</span>;
  }
  return (
    <div className="row row--wrap" style={{ gap: 6 }}>
      {roleIds.map((rid) => {
        const r = roles.find((x) => x.id === rid);
        return r ? (
          <RoleChip key={rid} name={r.name} color={r.color} />
        ) : (
          <span key={rid} className="tag">
            {rid}
          </span>
        );
      })}
    </div>
  );
}

export function UserBadge({
  userId,
  size = 24,
  subtitle,
}: {
  userId: string;
  size?: number;
  subtitle?: string;
}) {
  const user = useUserById(userId);
  if (!user) {
    return <span className="text-xs muted">Helix Steward</span>;
  }
  return (
    <span className="row" style={{ gap: 8, minWidth: 0 }}>
      <Avatar user={user} size={size} />
      <span style={{ minWidth: 0, lineHeight: 1.25 }}>
        <span className="text-xs" style={{ fontWeight: 600, display: 'block', color: 'var(--text)' }}>
          {user.name}
        </span>
        {subtitle && (
          <span className="text-xs faint truncate" style={{ display: 'block' }}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}

export function ArticleCard({
  article,
  showSpace = true,
}: {
  article: WikiArticle;
  showSpace?: boolean;
}) {
  const spaces = useWiki((s) => s.spaces);
  const toggleBookmark = useWiki((s) => s.toggleBookmark);
  const myState = useMyWikiState();
  const space = spaces.find((s) => s.id === article.spaceId);
  const isSaved = myState.bookmarks.includes(article.slug);
  const isRead = myState.readSlugs.includes(article.slug);

  const totalChecks = article.sections.reduce((sum, sec) => sum + (sec.checklist?.length ?? 0), 0);
  const doneChecks = (myState.runbookChecks[article.id] ?? []).length;

  return (
    <article className="wk-article-card">
      <div className="wk-article-card__top">
        <div className="row row--wrap" style={{ gap: 6 }}>
          {showSpace && space && <SpacePill space={space} />}
          {article.locked && (
            <span className="badge badge--muted" data-tip="Canonical policy · Change Proposal workflow">
              <Lock /> Canonical
            </span>
          )}
          {article.pinned && (
            <span className="badge" data-tip="Pinned highlight">
              <Pin /> Pinned
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <FreshnessPill article={article} />
          <button
            type="button"
            className={cx('wk-bookmark-btn', isSaved && 'is-saved')}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark playbook'}
            data-tip={isSaved ? 'Bookmarked' : 'Save bookmark'}
            onClick={() => toast.result(toggleBookmark(article.slug))}
          >
            <Bookmark fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <Link to={`/wiki/doc/${article.slug}`} className="wk-article-card__link">
        <h3 className="wk-article-card__title">{article.title}</h3>
        <p className="wk-article-card__sub">{article.tldr || article.subtitle}</p>
      </Link>

      {article.tags.length > 0 && (
        <div className="wk-article-card__tags">
          {article.tags.slice(0, 4).map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="wk-article-card__foot">
        <UserBadge userId={article.ownerId} size={22} />
        <div className="wk-meta-inline">
          <span>
            <Clock aria-hidden="true" /> {article.readMins}m
          </span>
          {totalChecks > 0 && (
            <span title="Interactive runbook steps">
              <ListChecks aria-hidden="true" /> {doneChecks}/{totalChecks}
            </span>
          )}
          {article.helpfulUserIds.length > 0 && (
            <span>
              <ThumbsUp aria-hidden="true" /> {article.helpfulUserIds.length}
            </span>
          )}
          {isRead && (
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
              <CheckCircle2 aria-hidden="true" /> Read
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function SpaceBoundaryCard({
  space,
  title,
}: {
  space?: WikiSpace;
  title?: string;
}) {
  const clearance = useClearance();
  const primary = usePrimaryRole();

  return (
    <div className="card glow-border hud" style={{ maxWidth: 620, margin: '18px auto', textAlign: 'center', padding: '32px 24px' }}>
      <div className="empty__icon" style={{ margin: '0 auto 12px', color: 'var(--warning)' }}>
        <LockKeyhole />
      </div>
      <div className="eyebrow" style={{ justifyContent: 'center' }}>
        Permission Boundary · Space Clearance
      </div>
      <h2 className="page-title" style={{ fontSize: 24 }}>
        {title ?? (space ? `${space.name} is role-restricted` : 'Restricted Knowledge Space')}
      </h2>
      <p className="muted text-sm" style={{ maxWidth: 480, margin: '8px auto 18px', lineHeight: 1.55 }}>
        {space ? (
          <>
            The <strong>{space.name}</strong> space contains internal architecture, product, or people playbooks scoped to specific
            roles. Your active role{primary ? ` (${primary.name})` : ''} only sees cleared spaces — and Nova Docs automatically
            excludes restricted pages before synthesis.
          </>
        ) : (
          <>This playbook belongs to a space outside your current role clearance.</>
        )}
      </p>

      <div
        className="row row--wrap"
        style={{ justifyContent: 'center', gap: 22, padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)' }}
      >
        <div className="stack stack--sm" style={{ alignItems: 'center' }}>
          <span className="stat-label">Your Clearance</span>
          <ClearanceBadge level={clearance} compact />
        </div>
        {space && space.audienceRoleIds.length > 0 && (
          <div className="stack stack--sm" style={{ alignItems: 'center' }}>
            <span className="stat-label">Cleared Roles</span>
            <RoleAudienceChips roleIds={space.audienceRoleIds} />
          </div>
        )}
      </div>

      <div className="row row--wrap" style={{ justifyContent: 'center', marginTop: 20 }}>
        <Link to="/wiki" className="btn btn--primary">
          <ArrowLeft /> Back to Knowledge Base
        </Link>
      </div>
    </div>
  );
}
