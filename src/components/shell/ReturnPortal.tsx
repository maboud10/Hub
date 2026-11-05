import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, ArrowUpRight, ChevronDown, Compass, CornerUpLeft, History, Sparkles } from 'lucide-react';
import { useNavTrail, type NavEntry } from '@/store/navigation';
import { getIcon } from '@/icons';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';

function EntryBadge({ entry, size = 24 }: { entry: NavEntry; size?: number }) {
  const Icon = getIcon(entry.icon);
  return (
    <span
      className="return-portal__orb"
      style={
        {
          '--c1': entry.gradient[0],
          '--c2': entry.gradient[1],
          '--size': `${size}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}

/**
 * Creative "Return Portal" back button in the TopBar.
 * Appears automatically whenever a user enters an app (or deep-links into one),
 * remembering the exact page they were on before clicking the app, plus a
 * Time-Travel Journey Trail popover to hop back to any previous step.
 */
export function ReturnPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useNavTrail((s) => s.current);
  const appOrigin = useNavTrail((s) => s.appOrigin);
  const trail = useNavTrail((s) => s.trail);
  const recordLocation = useNavTrail((s) => s.recordLocation);

  const [open, setOpen] = useState(false);
  const [warping, setWarping] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    recordLocation(location.pathname, location.search);
  }, [location.pathname, location.search, recordLocation]);

  // Close trail popover on route change or outside click
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const w = Math.min(340, vw - 20);
      const left = Math.max(10, Math.min(r.left, vw - w - 10));
      setPos({ top: r.bottom + 8, left });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Alt+ArrowLeft keyboard shortcut to warp back to origin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft' && current?.isApp && appOrigin) {
        e.preventDefault();
        triggerWarp(appOrigin.path);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const triggerWarp = (targetPath: string) => {
    setWarping(true);
    setOpen(false);
    window.setTimeout(() => {
      navigate(targetPath);
      window.setTimeout(() => setWarping(false), 260);
    }, 110);
  };

  // When on a core Hub page (Home, Apps, People, etc.), show a compact "Resume last app" chip if the user was just in an app
  const lastVisitedApp = !current?.isApp ? trail.find((t) => t.isApp && t.path !== current?.path) : undefined;

  if (!current?.isApp && !lastVisitedApp) {
    return null;
  }

  // Subtle "Return to active app" chip when on a core Hub page after visiting an app
  if (!current?.isApp && lastVisitedApp) {
    return (
      <div className="return-portal return-portal--resume" ref={wrapRef}>
        <button
          type="button"
          className="return-portal__resume-btn"
          onClick={() => triggerWarp(lastVisitedApp.path)}
          title={`Resume ${lastVisitedApp.label} (${lastVisitedApp.sublabel ?? lastVisitedApp.path})`}
        >
          <EntryBadge entry={lastVisitedApp} size={22} />
          <span className="return-portal__resume-text">
            <span className="return-portal__eyebrow">Resume app</span>
            <span className="return-portal__dest truncate">{lastVisitedApp.label}</span>
          </span>
          <ArrowUpRight className="return-portal__resume-arrow" />
        </button>
      </div>
    );
  }

  const origin = appOrigin ?? {
    path: '/',
    areaKey: 'home',
    label: 'Launchpad',
    sublabel: 'Home workspace',
    icon: 'Sparkles',
    gradient: ['#6366f1', '#22d3ee'] as [string, string],
    isApp: false,
    at: Date.now(),
  };

  const recentSteps = trail.filter((t) => t.path !== current?.path).slice(0, 6);
  const style = {
    '--rp-c1': origin.gradient[0],
    '--rp-c2': origin.gradient[1],
    '--app-c1': current?.gradient[0] ?? '#6366f1',
    '--app-c2': current?.gradient[1] ?? '#22d3ee',
  } as CSSProperties;

  return (
    <div ref={wrapRef} className={cx('return-portal', warping && 'is-warping')} style={style}>
      <button
        type="button"
        className="return-portal__main"
        onClick={() => triggerWarp(origin.path)}
        aria-label={`Back to ${origin.label}`}
        title={`Return to ${origin.label}${origin.sublabel ? ` · ${origin.sublabel}` : ''} (Alt + ←)`}
      >
        <span className="return-portal__ring" aria-hidden="true">
          <ArrowLeft className="return-portal__arrow" />
        </span>
        <EntryBadge entry={origin} size={24} />
        <span className="return-portal__copy">
          <span className="return-portal__eyebrow">
            Back to origin <span className="return-portal__from">· from {current?.label}</span>
          </span>
          <span className="return-portal__dest truncate">
            {origin.label}
            {origin.sublabel && origin.sublabel !== 'Home workspace' && origin.sublabel !== 'All applications' ? (
              <span className="return-portal__sub"> · {origin.sublabel}</span>
            ) : null}
          </span>
        </span>
        <span className="kbd return-portal__kbd" aria-hidden="true">
          ⌥←
        </span>
      </button>

      <button
        type="button"
        className={cx('return-portal__trail-btn', open && 'is-open')}
        onClick={() => setOpen((o) => !o)}
        aria-label="Open navigation trail"
        aria-expanded={open}
        title="Journey trail & recent pages"
      >
        <ChevronDown />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            className="return-portal__pop"
            style={{
              top: pos?.top ?? 64,
              left: pos?.left ?? 16,
              width: Math.min(340, window.innerWidth - 20),
            }}
            role="dialog"
            aria-label="Navigation trail"
          >
            <div className="return-portal__pop-head">
              <Sparkles size={14} />
              <span>Return Portal · Journey Trail</span>
              <span className="mono text-xs faint" style={{ marginLeft: 'auto' }}>
                Alt + ←
              </span>
            </div>

            <div className="return-portal__pop-section">
              <div className="return-portal__pop-label">Origin before launching {current?.label}</div>
              <button
                type="button"
                className="return-portal__origin-card"
                onClick={() => triggerWarp(origin.path)}
              >
                <EntryBadge entry={origin} size={34} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="return-portal__origin-title">{origin.label}</div>
                  <div className="text-xs muted truncate">
                    {origin.sublabel ?? origin.path} · <span className="mono">{origin.path}</span>
                  </div>
                </div>
                <span className="return-portal__warp-pill">
                  <CornerUpLeft size={13} /> Return
                </span>
              </button>
            </div>

            {recentSteps.length > 0 && (
              <div className="return-portal__pop-section">
                <div className="return-portal__pop-label">
                  <History size={12} /> Recent steps in session
                </div>
                <div className="return-portal__list">
                  {recentSteps.map((step) => (
                    <button
                      key={step.path}
                      type="button"
                      className="return-portal__step"
                      onClick={() => triggerWarp(step.path)}
                    >
                      <EntryBadge entry={step} size={24} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="return-portal__step-title truncate">
                          {step.label}
                          {step.sublabel ? <span className="muted"> · {step.sublabel}</span> : null}
                        </div>
                        <div className="text-xs faint mono truncate">{step.path}</div>
                      </div>
                      <span className="text-xs faint">{relativeTime(step.at)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="return-portal__pop-foot">
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => triggerWarp('/')}>
                <Sparkles size={13} /> Launchpad
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => triggerWarp('/apps')}>
                <Compass size={13} /> All Apps
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
