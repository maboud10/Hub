import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Globe, Megaphone, Pin, Send, Trash2, Users, X } from 'lucide-react';
import type { AnnouncementCategory, AnnouncementPriority } from '@/types';
import { useHub } from '@/store/hub';
import { useRoles, useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, Segmented, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CATEGORY_ICON, NEWS_CATEGORIES, PRIORITIES, PRIORITY_META, prefersReducedMotion } from './newsMeta';

const TITLE_MAX = 120;
const BODY_MAX = 1200;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);

interface ComposerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Collapsed "Share an update…" card that expands into the full announcement composer. Drafts survive collapsing. */
export function Composer({ open, onOpenChange }: ComposerProps) {
  const me = useSessionUser();
  const roles = useRoles();
  const users = useHub((s) => s.users);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('Company');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [audience, setAudience] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [touched, setTouched] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** Set when the user collapses the composer so focus can return to the trigger card. */
  const focusTriggerNext = useRef(false);

  // Mirrors the store's fan-out rule: active colleagues other than the author.
  const eligible = useMemo(() => users.filter((u) => u.active && u.id !== me?.id), [users, me?.id]);
  const reach = useMemo(
    () => (audience.length ? eligible.filter((u) => u.roleIds.some((r) => audience.includes(r))).length : eligible.length),
    [eligible, audience],
  );
  const roleCounts = useMemo(() => new Map(roles.map((r) => [r.id, eligible.filter((u) => u.roleIds.includes(r.id)).length])), [roles, eligible]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      titleRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const titleLen = title.trim().length;
  const bodyLen = body.trim().length;
  const hasDraft = titleLen > 0 || bodyLen > 0;

  const collapse = () => {
    focusTriggerNext.current = true;
    onOpenChange(false);
  };

  const reset = () => {
    setTitle('');
    setBody('');
    setCategory('Company');
    setPriority('normal');
    setAudience([]);
    setPinned(false);
    setTouched(false);
  };

  const submit = () => {
    setTouched(true);
    // The store validates and re-checks `hub.news.publish` (API semantics); we surface its answer.
    const res = useHub.getState().publishAnnouncement({ title, body, category, priority, audienceRoleIds: audience, pinned });
    if (toast.result(res, 'Published')) {
      reset();
      collapse();
    } else if (titleLen < 4) titleRef.current?.focus();
    else if (bodyLen < 10) bodyRef.current?.focus();
  };

  const toggleRole = (id: string) => setAudience((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      collapse();
    }
  };

  if (!me) return null;

  if (!open) {
    return (
      <button
        ref={(el) => {
          if (el && focusTriggerNext.current) {
            focusTriggerNext.current = false;
            el.focus({ preventScroll: true });
          }
        }}
        type="button"
        className="news-trigger card"
        onClick={() => onOpenChange(true)}
        aria-label={hasDraft ? 'Continue your announcement draft' : 'Compose an announcement'}
      >
        <Avatar user={me} size={40} />
        <span className="news-trigger__text">
          {hasDraft ? (
            <>
              <span className="badge badge--warning">Draft</span>
              <span className="truncate">{title.trim() || body.trim()}</span>
            </>
          ) : (
            <span className="truncate">Share an update…</span>
          )}
        </span>
        <span className="btn btn--primary btn--sm news-trigger__cta" aria-hidden="true">
          <Megaphone /> <span>{hasDraft ? 'Continue' : 'Post'}</span>
        </span>
      </button>
    );
  }

  const share = eligible.length ? Math.round((reach / eligible.length) * 100) : 0;
  const PrioIcon = PRIORITY_META[priority].icon;
  const CatIcon = CATEGORY_ICON[category];

  return (
    <section ref={rootRef} className={cx('news-composer card', `news-composer--${priority}`)} aria-labelledby="news-composer-title" onKeyDown={onKeyDown}>
      <header className="news-composer__head">
        <Avatar user={me} size={38} />
        <div className="grow">
          <h2 id="news-composer-title" className="news-composer__eyebrow">
            New announcement
          </h2>
          <div className="text-sm muted truncate">
            Posting as <strong>{me.name}</strong>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={collapse} aria-label="Collapse composer — your draft is kept" data-tip="Collapse">
          <X />
        </button>
      </header>

      <div className="field">
        <label className="field-label" htmlFor="news-title">
          Headline
        </label>
        <input
          id="news-title"
          ref={titleRef}
          className="input news-composer__title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What’s happening?"
          aria-invalid={touched && titleLen < 4}
          aria-describedby="news-title-hint"
          autoComplete="off"
        />
        <div className="news-hint-row" id="news-title-hint">
          <span className={cx('field-hint', touched && titleLen < 4 && 'news-hint--error')}>At least 4 characters</span>
          <span className="field-hint mono">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="news-body">
          Details
        </label>
        <textarea
          id="news-body"
          ref={bodyRef}
          className="textarea"
          rows={4}
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share the context, key dates and what people should do…"
          aria-invalid={touched && bodyLen < 10}
          aria-describedby="news-body-hint"
        />
        <div className="news-hint-row" id="news-body-hint">
          <span className={cx('field-hint', touched && bodyLen < 10 && 'news-hint--error')}>At least 10 characters</span>
          <span className="field-hint mono">
            {body.length}/{BODY_MAX}
          </span>
        </div>
      </div>

      <div className="news-composer__grid">
        <div className="field">
          <label className="field-label" htmlFor="news-category">
            Category
          </label>
          <div className="news-select">
            <CatIcon aria-hidden="true" />
            <select id="news-category" className="select" value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}>
              {NEWS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Priority</span>
          <Segmented<AnnouncementPriority>
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => {
              const Icon = PRIORITY_META[p].icon;
              return { value: p, label: PRIORITY_META[p].label, icon: <Icon />, title: PRIORITY_META[p].hint };
            })}
          />
        </div>
      </div>
      <p className={cx('news-prio-hint', `news-prio-hint--${priority}`)}>
        <PrioIcon aria-hidden="true" /> {PRIORITY_META[priority].hint}
      </p>

      <div className="field">
        <div className="news-hint-row">
          <span className="field-label" id="news-audience-label">
            Audience
          </span>
          <span className="news-reach" aria-live="polite">
            <Users aria-hidden="true" /> Reaches <strong>{reach}</strong> {reach === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="news-audience-picker" role="group" aria-labelledby="news-audience-label">
          <button type="button" className={cx('news-aud', !audience.length && 'is-active')} aria-pressed={!audience.length} onClick={() => setAudience([])}>
            <Globe aria-hidden="true" /> Everyone
          </button>
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cx('news-aud news-aud--role', audience.includes(r.id) && 'is-active')}
              style={{ '--role': r.color } as CSSProperties}
              aria-pressed={audience.includes(r.id)}
              onClick={() => toggleRole(r.id)}
            >
              <i aria-hidden="true" />
              {r.name}
              <span className="count">{roleCounts.get(r.id) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="news-reach-meter" aria-hidden="true">
          <span style={{ width: `${share}%` }} />
        </div>
        <span className="field-hint">
          {audience.length
            ? `Only holders of the selected roles will see this post (publishers always can).`
            : `Everyone in the company will see this post.`}
        </span>
      </div>

      <footer className="news-composer__foot">
        <label className="news-pin-toggle">
          <Switch checked={pinned} onChange={setPinned} label="Pin to top of the feed" />
          <span>
            <Pin aria-hidden="true" /> Pin to top
          </span>
        </label>
        <span className="spacer" />
        {hasDraft && (
          <button type="button" className="btn btn--ghost" onClick={reset} aria-label="Discard draft">
            <Trash2 /> <span className="news-hide-xs">Discard</span>
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={submit} aria-keyshortcuts={isMac ? 'Meta+Enter' : 'Control+Enter'}>
          <Send /> Publish
          <span className="news-kbd-hint" aria-hidden="true">
            {isMac ? '⌘' : 'Ctrl'}↵
          </span>
        </button>
      </footer>
    </section>
  );
}
