import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Compass, CornerUpLeft, History, MapPin, Sparkles, X } from 'lucide-react';
import { useNavTrail, type NavEntry } from '@/store/navigation';
import { getIcon } from '@/icons';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/* ==========================================================================
   Return Portal — the Hub's back button (TopBar)

   Inside an app it reads like a native back control:  ‹ [orb] Back to Launchpad
   - Click (or ⌥/Alt + ←) rewinds to the exact page you came from, with a light
     "rewind" sweep in the destination's colours.
   - The memory deck (stacked orbs of recent places) opens "Your journey": a
     subway-line timeline of the session — you're here → back target → earlier
     stops. Right-click or long-press the back button for the same.
   On core Hub pages a mirrored "Resume ›› app" capsule jumps back into the last app.
   ========================================================================== */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const BACK_KEYS = isMac ? '⌥ ←' : 'Alt ←';
const GENERIC_SUBS = new Set(['Home workspace', 'All applications', 'App workspace']);
// Path-derived sublabels ("Okrs") read better with their proper names.
const PRETTY: Record<string, string> = { okrs: 'OKRs', checkins: 'Check-ins', 'one on ones': '1:1s' };
const pretty = (s?: string) => (s ? (PRETTY[s.toLowerCase()] ?? s) : undefined);

const HOME: NavEntry = { path: '/', areaKey: 'home', label: 'Launchpad', sublabel: 'Home workspace', icon: 'Sparkles', gradient: ['#6366f1', '#22d3ee'], isApp: false, at: 0 };
const APPS: NavEntry = { path: '/apps', areaKey: 'apps', label: 'Apps Catalog', sublabel: 'All applications', icon: 'Compass', gradient: ['#38bdf8', '#818cf8'], isApp: false, at: 0 };

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const detail = (e: NavEntry) => (e.sublabel && !GENERIC_SUBS.has(e.sublabel) ? pretty(e.sublabel) : undefined);

function EntryBadge({ entry, size = 24, style }: { entry: Pick<NavEntry, 'icon' | 'gradient'>; size?: number; style?: CSSProperties }) {
  const Icon = getIcon(entry.icon);
  return (
    <span className="return-portal__orb" style={{ '--c1': entry.gradient[0], '--c2': entry.gradient[1], '--size': `${size}px`, ...style } as CSSProperties} aria-hidden="true">
      <Icon />
    </span>
  );
}

type Warp = { entry: NavEntry; dir: 'back' | 'fwd' };

export function ReturnPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useNavTrail((s) => s.current);
  const appOrigin = useNavTrail((s) => s.appOrigin);
  const trail = useNavTrail((s) => s.trail);
  const recordLocation = useNavTrail((s) => s.recordLocation);
  const isPhone = useMediaQuery('(max-width: 720px)');

  const [open, setOpen] = useState(false);
  const [warp, setWarp] = useState<Warp | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  useEffect(() => {
    recordLocation(location.pathname, location.search);
  }, [location.pathname, location.search, recordLocation]);

  // A new page closes the journey.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  // Journey placement, outside click, Esc — and focus the back target for keyboard users.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const w = Math.min(360, vw - 20);
      setPos({ top: r.bottom + 10, left: Math.max(10, Math.min(r.left, vw - w - 10)) });
    };
    place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      deckRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    const raf = requestAnimationFrame(() => popRef.current?.querySelector<HTMLElement>('[data-rp-origin]')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const go = (entry: NavEntry, dir: Warp['dir'] = 'back') => {
    setOpen(false);
    if (reducedMotion()) {
      navigate(entry.path);
      return;
    }
    const w: Warp = { entry, dir };
    setWarp(w);
    window.setTimeout(() => navigate(entry.path), 150);
    window.setTimeout(() => setWarp((x) => (x === w ? null : x)), 540);
  };

  // ⌥/Alt + ← rewinds from anywhere inside an app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.key !== 'ArrowLeft' || !current?.isApp) return;
      e.preventDefault();
      go(appOrigin ?? HOME);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const warpEl = warp
    ? createPortal(<span className="rp-warp" data-dir={warp.dir} style={{ '--rp-c1': warp.entry.gradient[0], '--rp-c2': warp.entry.gradient[1] } as CSSProperties} aria-hidden="true" />, document.body)
    : null;

  /* ── Core Hub page: offer to resume the last app ── */
  if (!current?.isApp) {
    const app = trail.find((t) => t.isApp && t.path !== current?.path);
    if (!app) return warpEl;
    const sub = detail(app);
    return (
      <>
        <div className={cx('return-portal return-portal--resume', warp && 'is-warping')} style={{ '--rp-c1': app.gradient[0], '--rp-c2': app.gradient[1], '--rp-cur': app.gradient[1] } as CSSProperties}>
          <button type="button" className="return-portal__back" onClick={() => go(app, 'fwd')} aria-label={`Resume ${app.label}${sub ? `, ${sub}` : ''}`} data-tip={`Jump back into ${app.label}${sub ? ` · ${sub}` : ''}`} data-tip-pos="bottom" data-qa="return-resume">
            <EntryBadge entry={app} size={24} />
            <span className="return-portal__label">
              <span className="return-portal__hint">Resume</span>
              <span className="return-portal__dest">{app.label}</span>
            </span>
            <span className="return-portal__chev return-portal__chev--fwd" aria-hidden="true">
              <ChevronRight />
              <ChevronRight />
            </span>
            <span className="return-portal__streak" aria-hidden="true" />
          </button>
        </div>
        {warpEl}
      </>
    );
  }

  /* ── Inside an app: back to where you came from ── */
  const origin = appOrigin ?? HOME;
  const originSub = detail(origin);
  const stops = trail.filter((t) => t.path !== current.path && t.path !== origin.path).slice(0, 6);
  const deck = stops.slice(0, 3);
  const vars = { '--rp-c1': origin.gradient[0], '--rp-c2': origin.gradient[1], '--rp-cur': current.gradient[0] } as CSSProperties;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    longPressed.current = false;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setOpen(true);
      navigator.vibrate?.(10);
    }, 460);
  };
  const endPress = () => window.clearTimeout(pressTimer.current);
  const onBack = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    go(origin);
  };
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <div ref={wrapRef} className={cx('return-portal', warp && 'is-warping', open && 'is-open')} style={vars}>
        <button
          type="button"
          className="return-portal__back"
          onClick={onBack}
          onContextMenu={onContextMenu}
          onPointerDown={onPointerDown}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          aria-label={`Back to ${origin.label}${originSub ? `, ${originSub}` : ''}`}
          aria-keyshortcuts="Alt+ArrowLeft"
          data-tip={`Back to ${origin.label}${originSub ? ` · ${originSub}` : ''}  ${BACK_KEYS}`}
          data-tip-pos="bottom"
          data-qa="return-back"
        >
          <span className="return-portal__chev" aria-hidden="true">
            <ChevronLeft />
            <ChevronLeft />
          </span>
          <EntryBadge entry={origin} size={24} />
          <span className="return-portal__label">
            <span className="return-portal__hint">Back to</span>
            <span className="return-portal__dest">{origin.label}</span>
          </span>
          <span className="return-portal__streak" aria-hidden="true" />
        </button>
        <button
          ref={deckRef}
          type="button"
          className={cx('return-portal__deck-btn', open && 'is-open')}
          onClick={() => setOpen((o) => !o)}
          aria-label={`Your journey${stops.length ? ` — ${stops.length} recent ${stops.length === 1 ? 'place' : 'places'}` : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-tip="Your journey"
          data-tip-pos="bottom"
          data-qa="return-journey"
        >
          {deck.length ? (
            <span className="return-portal__deck" aria-hidden="true">
              {deck.map((s, i) => (
                <EntryBadge key={s.path} entry={s} size={18} style={{ '--i': i } as CSSProperties} />
              ))}
            </span>
          ) : (
            <History className="return-portal__deck-icon" aria-hidden="true" />
          )}
          {stops.length > 3 && <span className="return-portal__more">+{stops.length - 3}</span>}
        </button>
      </div>

      {open &&
        createPortal(
          <Journey current={current} origin={origin} stops={stops} vars={vars} pos={pos} sheet={isPhone} popRef={popRef} onGo={go} onClose={() => setOpen(false)} />,
          document.body,
        )}
      {warpEl}
    </>
  );
}

/* ───────── "Your journey" — subway-line timeline of the session ───────── */

function Journey({
  current,
  origin,
  stops,
  vars,
  pos,
  sheet,
  popRef,
  onGo,
  onClose,
}: {
  current: NavEntry;
  origin: NavEntry;
  stops: NavEntry[];
  vars: CSSProperties;
  pos: { top: number; left: number } | null;
  sheet: boolean;
  popRef: RefObject<HTMLDivElement | null>;
  onGo: (e: NavEntry, dir?: Warp['dir']) => void;
  onClose: () => void;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const els = [...(popRef.current?.querySelectorAll<HTMLElement>('[data-rp-stop]') ?? [])];
    if (!els.length) return;
    e.preventDefault();
    e.stopPropagation();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[n]?.focus();
  };
  const hereSub = detail(current);
  return (
    <>
      {sheet && <div className="rp-scrim" onClick={onClose} aria-hidden="true" />}
      <div
        ref={popRef}
        className={cx('rp-journey', sheet && 'is-sheet')}
        style={{ ...vars, ...(sheet ? {} : { top: pos?.top ?? 64, left: pos?.left ?? 16, visibility: pos ? 'visible' : 'hidden' }) }}
        role="dialog"
        aria-label="Your journey"
        onKeyDown={onKeyDown}
      >
        <header className="rp-journey__head">
          <span className="rp-journey__title">
            <History aria-hidden="true" /> Your journey
          </span>
          <span className="rp-journey__hint">
            Back <kbd className="kbd">{BACK_KEYS}</kbd>
          </span>
          {sheet && (
            <button type="button" className="rp-journey__close" onClick={onClose} aria-label="Close journey">
              <X />
            </button>
          )}
        </header>

        <ol className="rp-journey__line">
          <li className="rp-stop is-here">
            <div className="rp-stop__row">
              <span className="rp-stop__node">
                <EntryBadge entry={current} size={30} />
                <i className="rp-stop__pulse" aria-hidden="true" />
              </span>
              <span className="rp-stop__text">
                <span className="rp-stop__eyebrow">
                  <MapPin aria-hidden="true" /> You’re here
                </span>
                <b>{current.label}</b>
                {hereSub && <span className="rp-stop__sub">{hereSub}</span>}
              </span>
            </div>
          </li>
          <li className="rp-stop is-origin">
            <button type="button" className="rp-stop__row" onClick={() => onGo(origin)} data-rp-stop data-rp-origin>
              <span className="rp-stop__node">
                <EntryBadge entry={origin} size={30} />
              </span>
              <span className="rp-stop__text">
                <span className="rp-stop__eyebrow">
                  <CornerUpLeft aria-hidden="true" /> Back to
                </span>
                <b>{origin.label}</b>
                {origin.sublabel && <span className="rp-stop__sub">{pretty(origin.sublabel)}</span>}
              </span>
              <span className="rp-stop__go">Return</span>
            </button>
          </li>
          {stops.map((s) => {
            return (
              <li key={s.path} className="rp-stop">
                <button type="button" className="rp-stop__row" onClick={() => onGo(s)} data-rp-stop>
                  <span className="rp-stop__node">
                    <EntryBadge entry={s} size={26} />
                  </span>
                  <span className="rp-stop__text">
                    <b>{s.label}</b>
                    {s.sublabel && <span className="rp-stop__sub">{pretty(s.sublabel)}</span>}
                  </span>
                  <span className="rp-stop__time">{relativeTime(s.at)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!stops.length && <p className="rp-journey__empty">Earlier stops from this session will collect here.</p>}

        <footer className="rp-journey__foot">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onGo(HOME)} data-rp-stop>
            <Sparkles size={14} /> Launchpad
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onGo(APPS)} data-rp-stop>
            <Compass size={14} /> All apps
          </button>
        </footer>
      </div>
    </>
  );
}
