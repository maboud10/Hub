import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronRight, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { usePrefs } from '@/store/selectors';
import type { AccentId } from '@/types';
import { cx } from '@/lib/cx';
import { NovaChip, type Tone } from './Bits';
import { NeoHead, NeoRail, NeoStage, NeoWorkspace, type NeoNavItem, type NeoTint } from './Workspace';

/* ==========================================================================
   NEO composite kit — one anatomy for every NEXUS screen
   (modelled on the IT Helpdesk "Support Deck"):

     <NeoAppFrame …>              rail + glass stage + header + scroll body
     <NeoPage …>                  rail-less variant for core hub pages
     <NeoHome main side />        main column + status side column
     <NeoBanners><NeoBanner/>     attention strips (incidents, approvals…)
     <NeoKpis><NeoKpi/></NeoKpis> HUD stat ribbon
     <NeoPanel hud title actions> glass card with mono HUD eyebrow + title
     <NeoNovaPrompt …/>           Nova AI prompt (orb, input, suggestions)
     <NeoSkeleton/>               stage loading state
   ========================================================================== */

/* ---------- Tints ---------- */

/** Hub accent → plasma tint (mirrors `[data-accent]` tokens). */
export const ACCENT_TINTS: Record<AccentId, NeoTint> = {
  cyan: { c1: '#22d3ee', c2: '#8b5cf6' },
  violet: { c1: '#a78bfa', c2: '#ec4899' },
  magenta: { c1: '#f472b6', c2: '#fb923c' },
  lime: { c1: '#a3e635', c2: '#22d3ee' },
  amber: { c1: '#fbbf24', c2: '#f43f5e' },
};

/** Tint for core hub pages: follows the person's chosen accent. */
export function useHubTint(): NeoTint {
  const prefs = usePrefs();
  return ACCENT_TINTS[prefs.accent] ?? ACCENT_TINTS.cyan;
}

/* ---------- Frames ---------- */

export interface NeoHeadProps {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
}

/** Scrolls the stage body back to the top whenever the route changes. */
function useScrollReset(ref: RefObject<HTMLDivElement | null>) {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    ref.current?.scrollTo?.({ top: 0 });
  }, [pathname, ref]);
}

export interface NeoAppFrameProps {
  /** App id → `data-app` on the workspace (scope app CSS with `.neo[data-app='…']`). */
  app: string;
  tint: NeoTint;
  /** Extra class on the workspace root (keep legacy scoping classes here, e.g. `hr`). */
  className?: string;
  style?: CSSProperties;
  brand: { icon: ReactNode; label: string; to: string };
  items: NeoNavItem[];
  footer?: NeoNavItem[];
  /** Header for the active route. */
  head: NeoHeadProps;
  /** Optional toolbar row under the header (filters, sub-tabs). */
  toolbar?: ReactNode;
  /** Pad the scroll body (default). Use `false` for full-bleed screens (editors, players, boards). */
  pad?: boolean;
  bodyClassName?: string;
  label?: string;
  /** Rendered inside the workspace but outside the stage (modals, sheets, hosts). */
  overlays?: ReactNode;
  children: ReactNode;
}

/**
 * Standard frame for NEXUS apps: `NeoWorkspace` › `NeoRail` › `NeoStage` ›
 * `NeoHead` + scroll body. Apps keep their own routes as children.
 */
export function NeoAppFrame({ app, tint, className, style, brand, items, footer, head, toolbar, pad = true, bodyClassName, label, overlays, children }: NeoAppFrameProps) {
  const body = useRef<HTMLDivElement>(null);
  useScrollReset(body);
  return (
    <NeoWorkspace app={app} tint={tint} className={className}>
      <NeoRail brand={brand} items={items} footer={footer} label={label ?? brand.label} />
      <NeoStage label={label ?? brand.label}>
        <NeoHead {...head} />
        {toolbar && <div className="neo-toolbar">{toolbar}</div>}
        <div ref={body} className={cx('neo-body', pad && 'neo-pad', bodyClassName)} style={style}>
          {children}
        </div>
      </NeoStage>
      {overlays}
    </NeoWorkspace>
  );
}

export interface NeoPageProps extends NeoHeadProps {
  /** Defaults to `hub`. */
  app?: string;
  /** Defaults to the person's accent. */
  tint?: NeoTint;
  className?: string;
  bodyClassName?: string;
  toolbar?: ReactNode;
  pad?: boolean;
  label?: string;
  children: ReactNode;
}

/** Rail-less NEO screen for core hub pages (Launchpad, Apps, People, News, Settings…). */
export function NeoPage({ app = 'hub', tint, className, bodyClassName, toolbar, pad = true, label, children, ...head }: NeoPageProps) {
  const hubTint = useHubTint();
  const body = useRef<HTMLDivElement>(null);
  useScrollReset(body);
  return (
    <NeoWorkspace app={app} tint={tint ?? hubTint} rail={false} className={className}>
      <NeoStage label={label ?? (typeof head.title === 'string' ? head.title : undefined)}>
        <NeoHead {...head} />
        {toolbar && <div className="neo-toolbar">{toolbar}</div>}
        <div ref={body} className={cx('neo-body', pad && 'neo-pad', bodyClassName)}>
          {children}
        </div>
      </NeoStage>
    </NeoWorkspace>
  );
}

/** App-home layout: wide main column + compact status column (stacks on narrow screens). */
export function NeoHome({ main, side, sideLabel, className }: { main: ReactNode; side?: ReactNode; sideLabel?: string; className?: string }) {
  return (
    <div className={cx('neo-home', !side && 'neo-home--single', className)}>
      <div className="neo-home__main">{main}</div>
      {side && (
        <aside className="neo-home__side" aria-label={sideLabel ?? 'Overview'}>
          {side}
        </aside>
      )}
    </div>
  );
}

/* ---------- Panel ---------- */

export function NeoPanel({
  hud,
  title,
  icon,
  actions,
  children,
  className,
  id,
  flush,
  style,
}: {
  /** Mono, tracked-caps eyebrow (e.g. "In flight", "Your setup"). */
  hud?: ReactNode;
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  /** No inner padding (lists, tables that run edge to edge). */
  flush?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={cx('neo-panel', flush && 'neo-panel--flush', className)} id={id} style={style}>
      {(title || hud || actions || icon) && (
        <header className="neo-panel__head">
          {icon && <span className="neo-panel__icon">{icon}</span>}
          <div className="neo-panel__titles">
            {hud && <div className="neo-hud">{hud}</div>}
            {title && <h2 className="neo-panel__title">{title}</h2>}
          </div>
          {actions && <div className="neo-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- Banners ---------- */

export function NeoBanners({ children }: { children: ReactNode }) {
  return <div className="neo-banners">{children}</div>;
}

export function NeoBanner({
  tone = 'warning',
  icon,
  title,
  children,
  meta,
  to,
  onClick,
  action,
}: {
  tone?: Tone;
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  meta?: ReactNode;
  /** Makes the whole banner a link. */
  to?: string;
  onClick?: () => void;
  /** Inline action (button) rendered before the chevron. */
  action?: ReactNode;
}) {
  const inner = (
    <>
      <span className="neo-banner__icon">{icon ?? <TriangleAlert />}</span>
      <span className="neo-banner__text">
        <b>{title}</b>
        {children && <span>{children}</span>}
      </span>
      {meta && <span className="neo-banner__meta">{meta}</span>}
      {action && <span className="neo-banner__action">{action}</span>}
      {(to || onClick) && <ChevronRight className="neo-banner__chev" aria-hidden="true" />}
    </>
  );
  // A clickable banner with its own inline action can't nest one interactive
  // element inside another: the whole banner gets a stretched hit target and
  // the action floats above it.
  if ((to || onClick) && action) {
    const hitLabel = typeof title === 'string' ? title : undefined;
    return (
      <div className="neo-banner neo-banner--split" data-tone={tone}>
        {to ? (
          <Link to={to} className="neo-banner__hit" aria-label={hitLabel} />
        ) : (
          <button type="button" className="neo-banner__hit" onClick={onClick} aria-label={hitLabel} />
        )}
        {inner}
      </div>
    );
  }
  if (to)
    return (
      <Link to={to} className="neo-banner" data-tone={tone}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className="neo-banner" data-tone={tone} onClick={onClick}>
        {inner}
      </button>
    );
  return (
    <div className="neo-banner" data-tone={tone} role="status">
      {inner}
    </div>
  );
}

/* ---------- KPI ribbon ---------- */

export function NeoKpis({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={cx('neo-kpis', className)} role="group" aria-label={label ?? 'Key numbers'}>
      {children}
    </div>
  );
}

export function NeoKpi({
  label,
  value,
  sub,
  icon,
  tone,
  spark,
  to,
  onClick,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  /** Colours the value (use for warnings / risks). */
  tone?: Tone;
  /** Tiny chart rendered bottom-right (e.g. <Spark />). */
  spark?: ReactNode;
  to?: string;
  onClick?: () => void;
  title?: string;
}) {
  const inner = (
    <>
      <span className="neo-kpi__label neo-hud">
        {icon}
        {label}
      </span>
      <span className="neo-kpi__value">{value}</span>
      {sub && <span className="neo-kpi__sub">{sub}</span>}
      {spark && <span className="neo-kpi__spark">{spark}</span>}
    </>
  );
  if (to)
    return (
      <Link to={to} className="neo-kpi" data-tone={tone} title={title}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className="neo-kpi" data-tone={tone} onClick={onClick} title={title}>
        {inner}
      </button>
    );
  return (
    <div className="neo-kpi" data-tone={tone} title={title}>
      {inner}
    </div>
  );
}

/* ---------- Nova prompt ---------- */

/**
 * Signature Nova console for app homes: orb + HUD + title, a prompt with a
 * plasma submit, and suggestion chips. Render results as children.
 */
export function NeoNovaPrompt({
  hud = 'Nova',
  title,
  badge,
  placeholder,
  suggestions,
  onSubmit,
  busy,
  submitLabel = 'Ask Nova',
  submitIcon,
  clearOnSubmit,
  autoFocus,
  children,
  className,
  label,
}: {
  hud?: ReactNode;
  title: ReactNode;
  /** Small gradient chip on the right of the header. */
  badge?: ReactNode;
  placeholder?: string;
  suggestions?: string[];
  onSubmit: (text: string) => void;
  busy?: boolean;
  submitLabel?: string;
  submitIcon?: ReactNode;
  clearOnSubmit?: boolean;
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const submit = (q: string) => {
    const t = q.trim();
    if (t.length < 2 || busy) {
      input.current?.focus();
      return;
    }
    onSubmit(t);
    setText(clearOnSubmit ? '' : t);
  };
  const onForm = (e: FormEvent) => {
    e.preventDefault();
    submit(text);
  };

  return (
    <section className={cx('neo-novaprompt neo-nova', className)} data-busy={busy || undefined} aria-label={label ?? (typeof title === 'string' ? title : 'Nova')}>
      <div className="neo-nova__glow" />
      <div className="neo-novaprompt__grid" aria-hidden="true" />
      <header className="neo-novaprompt__head">
        <span className="neo-novaorb" aria-hidden="true">
          <i />
        </span>
        <div className="neo-novaprompt__titles">
          <div className="neo-hud">{hud}</div>
          <h2 className="neo-novaprompt__title">{title}</h2>
        </div>
        {badge && <NovaChip>{badge}</NovaChip>}
      </header>
      <form className="neo-novaprompt__form" onSubmit={onForm}>
        <textarea
          ref={input}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          placeholder={placeholder}
          aria-label={typeof title === 'string' ? title : 'Ask Nova'}
        />
        <button type="submit" className="neo-btn neo-btn--plasma" disabled={busy}>
          {busy ? <Loader2 className="neo-spin" /> : (submitIcon ?? <Sparkles />)}
          <span>{submitLabel}</span>
        </button>
      </form>
      {!!suggestions?.length && (
        <div className="neo-novaprompt__chips" role="list" aria-label="Try one of these">
          {suggestions.map((s) => (
            <button key={s} type="button" role="listitem" className="neo-suggest" onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- Loading ---------- */

export function NeoSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="neo-skel" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
