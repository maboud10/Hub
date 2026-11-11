import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Compass, CornerUpLeft, Sparkles, Undo2 } from 'lucide-react';
import { useNavTrail, type NavEntry } from '@/store/navigation';
import { getIcon } from '@/icons';
import { relativeTime } from '@/lib/format';
import { portalNavigate } from '@/lib/portalTransition';
import { cx } from '@/lib/cx';
import { APPS, BACK_KEYS, EntryBadge, HOME, detail, pretty } from './ReturnPortal';

/* ==========================================================================
   Rail Return — the app's way back, docked under the last rail icon.

     ┆            a dashed "return path" tether with a signal travelling up
    (◉↺)          an orb in the colours of where you came from (its icon inside,
    Back          a rewind badge on the rim) — click to go back, ⌥/Alt + ←
                  works anywhere

   Hover (or right-click / long-press / → key) opens the return-path card:
   the exact page you came from, earlier stops of the session, and shortcuts
   to the Launchpad and All apps. Replaces the floating "Back to …" pill in the
   top bar on desktop (the top-bar pill remains on phones).
   ========================================================================== */

type Pos = { top: number; left?: number; right?: number };

export function RailReturn() {
  const navigate = useNavigate();
  const current = useNavTrail((s) => s.current);
  const appOrigin = useNavTrail((s) => s.appOrigin);
  const trail = useNavTrail((s) => s.trail);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(pressTimer.current);
    },
    [],
  );

  // Place the card beside the rail (mirrors in RTL), keep it on screen.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const rtl = document.documentElement.dir === 'rtl';
      const h = cardRef.current?.offsetHeight ?? 260;
      const top = Math.max(12, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 12));
      setPos(rtl ? { top, right: window.innerWidth - r.left + 14 } : { top, left: r.right + 14 });
    };
    place();
    const raf = requestAnimationFrame(place);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || cardRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  if (!current?.isApp) return null;
  const origin = appOrigin ?? HOME;
  const originSub = detail(origin);
  const stops = trail.filter((t) => t.path !== current.path && t.path !== origin.path).slice(0, 3);
  const OriginIcon = getIcon(origin.icon);
  const vars = { '--rr-c1': origin.gradient[0], '--rr-c2': origin.gradient[1] } as CSSProperties;

  const go = (entry: NavEntry) => {
    setOpen(false);
    const kind = entry.isApp ? 'switch' : 'return';
    if (!portalNavigate(navigate, entry.path, { kind, appId: current.appId })) navigate(entry.path);
  };

  const scheduleOpen = () => {
    window.clearTimeout(closeTimer.current);
    if (open) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), 260);
  };
  const scheduleClose = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 220);
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => cardRef.current?.querySelector<HTMLElement>('[data-rr-stop]')?.focus({ preventScroll: true }));
    }
  };
  const onCardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const els = [...(cardRef.current?.querySelectorAll<HTMLElement>('[data-rr-stop]') ?? [])];
    if (!els.length) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[n]?.focus();
  };

  return (
    <div
      ref={wrapRef}
      className={cx('neo-rail__return', open && 'is-open')}
      style={vars}
      onPointerEnter={(e) => e.pointerType === 'mouse' && scheduleOpen()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClose()}
    >
      <span className="neo-rail__tether" aria-hidden="true">
        <i />
      </span>
      <button
        ref={btnRef}
        type="button"
        className="neo-rail__back"
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          go(origin);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          longPressed.current = false;
          window.clearTimeout(pressTimer.current);
          pressTimer.current = window.setTimeout(() => {
            longPressed.current = true;
            setOpen(true);
            navigator.vibrate?.(10);
          }, 460);
        }}
        onPointerUp={() => window.clearTimeout(pressTimer.current)}
        onPointerCancel={() => window.clearTimeout(pressTimer.current)}
        onKeyDown={onKeyDown}
        aria-label={`Back to ${origin.label}${originSub ? `, ${originSub}` : ''}`}
        aria-keyshortcuts="Alt+ArrowLeft"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-qa="rail-back"
      >
        <span className="neo-rail__back-orb" aria-hidden="true">
          <span className="neo-rail__back-ring" />
          <OriginIcon />
          <span className="neo-rail__back-badge">
            <Undo2 />
          </span>
        </span>
        <span className="neo-rail__label">Back</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={cardRef}
            className="neo-portal rr-card"
            style={{ ...vars, top: pos?.top ?? -9999, left: pos?.left, right: pos?.right, visibility: pos ? 'visible' : 'hidden' }}
            role="dialog"
            aria-label="Return path"
            onPointerEnter={() => window.clearTimeout(closeTimer.current)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClose()}
            onKeyDown={onCardKeyDown}
          >
            <header className="rr-card__head">
              <span className="rr-card__title">
                <CornerUpLeft aria-hidden="true" /> Return path
              </span>
              <kbd className="kbd">{BACK_KEYS}</kbd>
            </header>
            <button type="button" className="rr-card__origin" onClick={() => go(origin)} data-rr-stop>
              <EntryBadge entry={origin} size={34} />
              <span className="rr-card__text">
                <span className="rr-card__eyebrow">Back to</span>
                <b>{origin.label}</b>
                {originSub && <span className="rr-card__sub">{originSub}</span>}
              </span>
              <span className="rr-card__go">Return</span>
            </button>
            {stops.length > 0 && (
              <>
                <div className="rr-card__label">Earlier stops</div>
                <ol className="rr-card__stops">
                  {stops.map((s) => (
                    <li key={s.path}>
                      <button type="button" className="rr-card__stop" onClick={() => go(s)} data-rr-stop>
                        <EntryBadge entry={s} size={24} />
                        <span className="rr-card__text">
                          <b>{s.label}</b>
                          {s.sublabel && <span className="rr-card__sub">{pretty(s.sublabel)}</span>}
                        </span>
                        <span className="rr-card__time">{relativeTime(s.at)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <footer className="rr-card__foot">
              <button type="button" className="rr-card__chip" onClick={() => go(HOME)} data-rr-stop>
                <Sparkles aria-hidden="true" /> Launchpad
              </button>
              <button type="button" className="rr-card__chip" onClick={() => go(APPS)} data-rr-stop>
                <Compass aria-hidden="true" /> All apps
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </div>
  );
}
