import { createContext, useCallback, useContext, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Hash,
  Info,
  Layers,
  Lightbulb,
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
import { NeoEmpty, NeoTabs, Ring, type Tone } from '@/components/neo';
import { useClearance, usePrimaryRole, useRoles, useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { computeFreshness, type FreshnessInfo, type FreshnessState } from '@/wiki/constants';
import { useMyWikiState } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import type { ArticleSection, WikiArticle, WikiSpace } from '@/wiki/types';

/* ==========================================================================
   Shared Knowledge Base UI (NEO language, tinted by the app plasma).
   ========================================================================== */

export type FreshFilter = 'all' | 'verified' | 'attention';

/* ---------- Nova Docs (Cortex) modal via `?ask=1&q=…` ---------- */

/** Opens / closes the Nova Docs modal through query params so it deep-links and survives reloads. */
export function useCortex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = useCallback(
    (q?: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('ask', '1');
      const text = q?.trim();
      if (text) next.set('q', text);
      else next.delete('q');
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );
  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('ask');
    next.delete('q');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  return { isOpen: searchParams.get('ask') === '1', query: searchParams.get('q') ?? '', open, close };
}

/* ---------- Header action slot ---------- */

const HeadSlotContext = createContext<HTMLElement | null>(null);
export const WikiHeadSlotProvider = HeadSlotContext.Provider;

/** Renders view-specific buttons into the NeoHead action bar owned by the Knowledge Base shell. */
export function WikiHeadActions({ children }: { children: ReactNode }) {
  const el = useContext(HeadSlotContext);
  return el ? createPortal(children, el) : null;
}

/* ---------- Spaces ---------- */

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

/* ---------- Freshness ---------- */

export const FRESH_TONE: Record<FreshnessState, Tone> = {
  verified: 'success',
  'due-soon': 'warning',
  stale: 'danger',
};

export function FreshnessPill({
  article,
  info,
  compact,
}: {
  article?: Pick<WikiArticle, 'lastVerifiedAt' | 'reviewCadenceDays' | 'flaggedStale'>;
  info?: FreshnessInfo;
  compact?: boolean;
}) {
  const f = info ?? (article ? computeFreshness(article) : null);
  if (!f) return null;
  const Icon = f.state === 'verified' ? CheckCircle2 : f.state === 'due-soon' ? Clock : AlertTriangle;
  return (
    <span className={cx('neo-chip wk-fresh', compact && 'neo-chip--sm')} data-tone={FRESH_TONE[f.state]}>
      <Icon aria-hidden="true" />
      {f.label}
    </span>
  );
}

/** Freshness as a glowing dot (dense lists). */
export function FreshDot({ article }: { article: Pick<WikiArticle, 'lastVerifiedAt' | 'reviewCadenceDays' | 'flaggedStale'> }) {
  const f = computeFreshness(article);
  return <span className="neo-orb wk-fresh-dot" data-tone={FRESH_TONE[f.state]} title={f.label} aria-label={f.label} role="img" />;
}

/* ---------- Progress ---------- */

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
  return (
    <Ring
      value={total > 0 ? done / total : 0}
      size={size}
      stroke={Math.max(4, Math.round(size / 13))}
      label={`${done} of ${total} ${sublabel}`}
      className="wk-ring"
    >
      <span className="wk-ring__inner">
        <b>
          {done}/{total}
        </b>
        {size >= 56 && <small>{sublabel}</small>}
      </span>
    </Ring>
  );
}

/* ---------- People & roles ---------- */

export function RoleAudienceChips({ roleIds }: { roleIds: string[] }) {
  const roles = useRoles();
  if (!roleIds.length) {
    return (
      <span className="neo-chip" data-tone="success">
        All NEXUS members
      </span>
    );
  }
  return (
    <div className="wk-roles">
      {roleIds.map((rid) => {
        const r = roles.find((x) => x.id === rid);
        return r ? (
          <RoleChip key={rid} name={r.name} color={r.color} />
        ) : (
          <span key={rid} className="wk-tag">
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
    return <span className="wk-user__sub">Helix Steward</span>;
  }
  return (
    <span className="wk-user">
      <Avatar user={user} size={size} />
      <span className="wk-user__text">
        <span className="wk-user__name">{user.name}</span>
        {subtitle && <span className="wk-user__sub">{subtitle}</span>}
      </span>
    </span>
  );
}

/* ---------- Filters ---------- */

export function FreshTabs({
  value,
  onChange,
  counts,
  label,
}: {
  value: FreshFilter;
  onChange: (v: FreshFilter) => void;
  counts?: { all: number; verified: number; attention: number };
  label: string;
}) {
  return (
    <NeoTabs<FreshFilter>
      value={value}
      onChange={onChange}
      label={label}
      items={[
        { value: 'all', label: 'All', count: counts?.all },
        { value: 'verified', label: 'Verified', icon: <CheckCircle2 />, count: counts?.verified },
        { value: 'attention', label: 'Needs review', icon: <AlertTriangle />, count: counts?.attention },
      ]}
    />
  );
}

export function TagFilter({
  tags,
  value,
  onChange,
  label,
  allLabel = 'All tags',
  total,
}: {
  tags: [string, number][];
  value: string;
  onChange: (tag: string) => void;
  label: string;
  allLabel?: string;
  total?: number;
}) {
  if (!tags.length) return null;
  return (
    <div className="wk-tags" role="group" aria-label={label}>
      <button
        type="button"
        className="neo-chip"
        data-tone={value === 'all' ? 'app' : 'slate'}
        aria-pressed={value === 'all'}
        onClick={() => onChange('all')}
      >
        {allLabel}
        {total !== undefined && <span className="wk-tags__n">{total}</span>}
      </button>
      {tags.map(([tag, count]) => (
        <button
          key={tag}
          type="button"
          className="neo-chip"
          data-tone={value === tag ? 'app' : 'slate'}
          aria-pressed={value === tag}
          onClick={() => onChange(value === tag ? 'all' : tag)}
        >
          #{tag}
          <span className="wk-tags__n">{count}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Article card ---------- */

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
    <article className="wk-card neo-spot">
      <div className="wk-card__top">
        <div className="wk-card__chips">
          {showSpace && space && <SpacePill space={space} />}
          {article.locked && (
            <span className="neo-chip neo-chip--sm" data-tone="amber" data-tip="Canonical policy · Change Proposal workflow">
              <Lock /> Canonical
            </span>
          )}
          {article.pinned && (
            <span className="neo-chip neo-chip--sm" data-tone="app" data-tip="Pinned highlight">
              <Pin /> Pinned
            </span>
          )}
        </div>
        <div className="wk-card__acts">
          <FreshnessPill article={article} compact />
          <button
            type="button"
            className={cx('neo-iconbtn wk-bm', isSaved && 'is-on')}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark playbook'}
            aria-pressed={isSaved}
            data-tip={isSaved ? 'Bookmarked' : 'Save bookmark'}
            onClick={() => toast.result(toggleBookmark(article.slug))}
          >
            <Bookmark fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <Link to={`/wiki/doc/${article.slug}`} className="wk-card__link">
        <h3 className="wk-card__title">{article.title}</h3>
        <p className="wk-card__sub">{article.tldr || article.subtitle}</p>
      </Link>

      {article.tags.length > 0 && (
        <div className="wk-card__tags">
          {article.tags.slice(0, 4).map((t) => (
            <span key={t} className="wk-tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="wk-card__foot">
        <UserBadge userId={article.ownerId} size={22} />
        <div className="wk-meta">
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
            <span className="wk-meta__read">
              <CheckCircle2 aria-hidden="true" /> Read
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------- Document section (reader + studio preview) ---------- */

const CALLOUT_TONE: Record<NonNullable<ArticleSection['callout']>['tone'], Tone> = {
  tip: 'success',
  warning: 'warning',
  policy: 'app',
  info: 'blue',
};

const CALLOUT_ICON: Record<NonNullable<ArticleSection['callout']>['tone'], LucideIcon> = {
  tip: Lightbulb,
  warning: AlertTriangle,
  policy: ShieldCheck,
  info: Info,
};

export const sectionNumber = (idx: number) => String(idx + 1).padStart(2, '0');

export function DocSection({
  section,
  index,
  checkedIds,
  onToggleCheck,
  onCopyAnchor,
  onCopySnippet,
  copied,
  preview,
}: {
  section: ArticleSection;
  index: number;
  checkedIds?: Set<string>;
  onToggleCheck?: (itemId: string) => void;
  onCopyAnchor?: (sectionId: string) => void;
  onCopySnippet?: (sectionId: string, snippet: string) => void;
  copied?: boolean;
  /** Static rendering for the studio's live preview. */
  preview?: boolean;
}) {
  const checks = section.checklist ?? [];
  const done = checks.filter((c) => checkedIds?.has(c.id)).length;
  const CalloutIcon = section.callout ? CALLOUT_ICON[section.callout.tone] : Info;

  return (
    <section id={preview ? undefined : section.id} className="wk-sec">
      <header className="wk-sec__head">
        <span className="wk-sec__num">{sectionNumber(index)}</span>
        <h2 className="wk-sec__title">{section.heading}</h2>
        {onCopyAnchor && (
          <button
            type="button"
            className="neo-iconbtn neo-iconbtn--sm wk-sec__anchor"
            onClick={() => onCopyAnchor(section.id)}
            aria-label={`Copy link to ${section.heading}`}
            data-tip="Copy section link"
          >
            <Hash />
          </button>
        )}
      </header>

      {(section.body || preview) && <p className="wk-sec__body">{section.body || '(Empty section body)'}</p>}

      {section.callout && (
        <div className="wk-callout" data-tone={CALLOUT_TONE[section.callout.tone]}>
          <CalloutIcon className="wk-callout__icon" aria-hidden="true" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="wk-callout__title">{section.callout.title}</div>
            <div className="wk-callout__text">{section.callout.text}</div>
          </div>
        </div>
      )}

      {section.code && (
        <div className="wk-code">
          <div className="wk-code__head">
            <span className="wk-code__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="wk-code__label">{section.code.label}</span>
            {onCopySnippet && (
              <button type="button" className="wk-code__copy" onClick={() => onCopySnippet(section.id, section.code!.snippet)}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied!' : 'Copy snippet'}
              </button>
            )}
          </div>
          <pre className="wk-code__pre">
            <code>{section.code.snippet}</code>
          </pre>
        </div>
      )}

      {checks.length > 0 && (
        <div className="wk-checklist">
          <div className="wk-checklist__head">
            <span className="neo-hud">
              <ListChecks aria-hidden="true" /> {preview ? 'Interactive checklist' : 'Execution steps'}
            </span>
            <span className="neo-chip neo-chip--sm" data-tone={!preview && done === checks.length ? 'success' : 'app'}>
              {preview ? `${checks.length} steps` : `${done}/${checks.length} complete`}
            </span>
          </div>
          {checks.map((item) => {
            const checked = !!checkedIds?.has(item.id);
            if (preview || !onToggleCheck) {
              return (
                <div key={item.id} className="wk-check">
                  <span className="wk-check__box" aria-hidden="true" />
                  <span className="wk-check__label">{item.label}</span>
                </div>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                className={cx('wk-check', checked && 'is-checked')}
                onClick={() => onToggleCheck(item.id)}
              >
                <span className="wk-check__box" aria-hidden="true">
                  {checked && <Check strokeWidth={3} />}
                </span>
                <span className="wk-check__label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- Permission wall ---------- */

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
    <div className="neo-denied wk-wall">
      <NeoEmpty
        icon={<LockKeyhole />}
        title={title ?? (space ? `${space.name} is role-restricted` : 'Restricted Knowledge Space')}
        action={
          <div className="neo-denied__foot">
            <div className="neo-denied__chips">
              <span className="neo-hud">Your clearance</span>
              <ClearanceBadge level={clearance} compact />
              {space && space.audienceRoleIds.length > 0 && (
                <>
                  <span className="neo-hud">Cleared roles</span>
                  <RoleAudienceChips roleIds={space.audienceRoleIds} />
                </>
              )}
            </div>
            <Link to="/wiki" className="neo-btn neo-btn--soft">
              <ArrowLeft /> Back to Knowledge Base
            </Link>
          </div>
        }
      >
        {space ? (
          <>
            The <strong>{space.name}</strong> space contains internal architecture, product, or people playbooks scoped to specific
            roles. Your active role{primary ? ` (${primary.name})` : ''} only sees cleared spaces — and Nova Docs automatically
            excludes restricted pages before synthesis.
          </>
        ) : (
          <>This playbook belongs to a space outside your current role clearance.</>
        )}
      </NeoEmpty>
    </div>
  );
}
