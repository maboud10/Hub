import { createContext, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { PanelLeft } from 'lucide-react';
import { cx } from '@/lib/cx';
import { RailReturn } from '@/components/shell/RailReturn';

/* ==========================================================================
   NEO workspace layout
   <NeoWorkspace app tint side sidePeek>
     <NeoRail brand items footer />          primary app navigation (dock)
     <NeoSide title actions>…</NeoSide>      optional secondary panel
     <NeoStage>                              main column (glass plane)
       <NeoHead … />
       <div className="neo-body">…</div>     scroll region
     </NeoStage>
   </NeoWorkspace>
   ========================================================================== */

export interface NeoTint {
  /** Primary plasma colour (hex). */
  c1: string;
  /** Secondary plasma colour (hex). */
  c2: string;
  /** Text colour on top of the plasma gradient. Defaults to white. */
  on?: string;
}

/** `#22d3ee` → `34 211 238` (space separated, for `rgb(var(--x) / a)`). */
export function hexToRgb(hex: string): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return '148 163 184';
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function tintVars(tint: NeoTint): Record<string, string> {
  return {
    '--app-c1': tint.c1,
    '--app-c2': tint.c2,
    '--app-rgb': hexToRgb(tint.c1),
    '--app-rgb-2': hexToRgb(tint.c2),
    '--app-on': tint.on ?? '#ffffff',
  };
}

const TintContext = createContext<NeoTint | null>(null);
/** The tint of the closest <NeoWorkspace>, if any. */
export const useNeoTint = () => useContext(TintContext);

interface WorkspaceProps {
  /** App id, exposed as `data-app` for app-scoped CSS (e.g. `.neo[data-app='drive']`). */
  app: string;
  tint: NeoTint;
  /** Render with a secondary side panel column. */
  side?: boolean;
  /** On narrow screens the side panel floats; `sidePeek` shows it. */
  sidePeek?: boolean;
  onSidePeekChange?: (open: boolean) => void;
  /** Keep a fixed viewport height on phones too (chat-like layouts). */
  fixed?: boolean;
  /**
   * Set to `false` for rail-less screens (core hub pages such as Launchpad,
   * Apps or Settings) — the stage then spans the whole workspace.
   */
  rail?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Root of every Neo app. Sets the plasma tint (also mirrored onto <body> so
 * portaled overlays inherit it) and drives the cursor spotlight on `.neo-spot`.
 */
export function NeoWorkspace({ app, tint, side, sidePeek, onSidePeekChange, fixed, rail = true, className, children }: WorkspaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const vars = tintVars(tint);

  // Mirror tint onto <body> for portals (menus, modals, sheets, toasts), and
  // mark the body so legacy `.modal` / `.sheet` overlays adopt the app tint too
  // (see styles/neo-bridge.css).
  useLayoutEffect(() => {
    const body = document.body;
    for (const [k, v] of Object.entries(vars)) body.style.setProperty(k, v);
    body.dataset.neoApp = app;
    return () => {
      for (const k of Object.keys(vars)) body.style.removeProperty(k);
      if (body.dataset.neoApp === app) delete body.dataset.neoApp;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tint.c1, tint.c2, tint.on, app]);

  // Cursor spotlight: one rAF-throttled listener for the whole workspace.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        const target = (last.target as Element | null)?.closest?.('.neo-spot') as HTMLElement | null;
        if (!target) return;
        const r = target.getBoundingClientRect();
        target.style.setProperty('--mx', `${last.clientX - r.left}px`);
        target.style.setProperty('--my', `${last.clientY - r.top}px`);
      });
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <TintContext.Provider value={tint}>
      <div
        ref={ref}
        className={cx('neo', className)}
        data-app={app}
        data-side={side ? 'open' : undefined}
        data-side-peek={side && sidePeek ? 'true' : undefined}
        data-fixed={fixed ? 'true' : undefined}
        data-rail={rail ? undefined : 'none'}
        style={vars as CSSProperties}
      >
        {children}
        {side && <div className="neo-scrim" onClick={() => onSidePeekChange?.(false)} aria-hidden="true" />}
      </div>
    </TintContext.Provider>
  );
}

/* ---------- Rail ---------- */

export interface NeoNavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number | string | null;
  badgeTone?: 'app' | 'danger';
  /** Exact match only (for index routes). */
  end?: boolean;
  /** Custom active matcher (receives the current pathname). */
  match?: (pathname: string) => boolean;
  /** Tooltip / accessible description. */
  title?: string;
}

export function isNavActive(item: Pick<NeoNavItem, 'to' | 'end' | 'match'>, pathname: string) {
  if (item.match) return item.match(pathname);
  const to = item.to.split('?')[0];
  if (item.end) return pathname === to || pathname === `${to}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function RailLink({ item, pathname }: { item: NeoNavItem; pathname: string }) {
  const active = isNavActive(item, pathname);
  const showBadge = item.badge !== undefined && item.badge !== null && item.badge !== 0 && item.badge !== '';
  return (
    <Link
      to={item.to}
      className={cx('neo-rail__item', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
      title={item.title ?? item.label}
    >
      {item.icon}
      <span className="neo-rail__label">{item.label}</span>
      {showBadge && (
        <span className="neo-rail__badge" data-tone={item.badgeTone === 'danger' ? 'danger' : undefined}>
          {typeof item.badge === 'number' && item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
}

export function NeoRail({
  brand,
  items,
  footer,
  label = 'App navigation',
}: {
  brand: { icon: ReactNode; label: string; to: string };
  items: NeoNavItem[];
  footer?: NeoNavItem[];
  label?: string;
}) {
  const { pathname } = useLocation();
  return (
    <nav className="neo-plane neo-rail" aria-label={label} data-dense={items.length + (footer?.length ?? 0) > 8 || undefined}>
      <Link to={brand.to} className="neo-rail__brand" title={brand.label} aria-label={`${brand.label} home`}>
        {brand.icon}
      </Link>
      {items.map((it) => (
        <RailLink key={it.to + it.label} item={it} pathname={pathname} />
      ))}
      {/* The way back lives under the last app icon (replaces the top-bar pill on desktop). */}
      <RailReturn />
      {footer && footer.length > 0 && (
        <>
          <div className="neo-rail__spacer" />
          <div className="neo-rail__sep" />
          {footer.map((it) => (
            <RailLink key={it.to + it.label} item={it} pathname={pathname} />
          ))}
        </>
      )}
    </nav>
  );
}

/* ---------- Side panel ---------- */

export function NeoSide({
  title,
  actions,
  top,
  children,
  label,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  /** Rendered under the title (e.g. a search field). */
  top?: ReactNode;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <aside className={cx('neo-plane neo-side', className)} aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      {(title || actions) && (
        <div className="neo-side__head">
          {title && <div className="neo-side__title grow">{title}</div>}
          {actions}
        </div>
      )}
      {top && <div style={{ padding: '0 12px 6px' }}>{top}</div>}
      <div className="neo-side__body">{children}</div>
    </aside>
  );
}

export function NeoSideGroup({ label, action, children }: { label: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div role="group">
      <div className="neo-side__group">
        <span>{label}</span>
        {action && <span className="neo-side__group-act">{action}</span>}
      </div>
      {children}
    </div>
  );
}

export function NeoSideItem({
  to,
  onClick,
  icon,
  label,
  meta,
  active,
  unread,
  title,
  onContextMenu,
}: {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  unread?: boolean;
  title?: string;
  onContextMenu?: (e: MouseEvent) => void;
}) {
  const cls = cx('neo-side__item', active && 'is-active', unread && 'is-unread');
  const inner = (
    <>
      {icon}
      <span className="neo-side__label">{label}</span>
      {meta !== undefined && meta !== null && meta !== false && <span className="neo-side__meta">{meta}</span>}
    </>
  );
  if (to)
    return (
      <Link to={to} className={cls} aria-current={active ? 'page' : undefined} onClick={onClick} title={title} onContextMenu={onContextMenu}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={active} title={title} onContextMenu={onContextMenu}>
      {inner}
    </button>
  );
}

/* ---------- Stage & header ---------- */

export function NeoStage({ children, bare, className, label }: { children: ReactNode; bare?: boolean; className?: string; label?: string }) {
  return (
    <section className={cx('neo-plane neo-stage', className)} data-variant={bare ? 'bare' : undefined} aria-label={label}>
      {children}
    </section>
  );
}

export function NeoHead({
  icon,
  eyebrow,
  title,
  sub,
  center,
  actions,
  onToggleSide,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  /** When provided, shows a panel toggle on narrow screens (for the side panel). */
  onToggleSide?: () => void;
  className?: string;
}) {
  return (
    <header className={cx('neo-head', className)}>
      {onToggleSide && (
        <button type="button" className="neo-iconbtn neo-side-toggle" onClick={onToggleSide} aria-label="Toggle panel">
          <PanelLeft />
        </button>
      )}
      {icon && <div className="neo-head__icon">{icon}</div>}
      <div className="neo-head__text">
        {eyebrow && <div className="neo-head__eyebrow">{eyebrow}</div>}
        <h1 className="neo-head__title">{title}</h1>
        {sub && <div className="neo-head__sub">{sub}</div>}
      </div>
      {center && <div className="neo-head__center">{center}</div>}
      {actions && <div className="neo-head__actions">{actions}</div>}
    </header>
  );
}
