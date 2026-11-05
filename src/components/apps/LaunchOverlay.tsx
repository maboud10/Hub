import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, ExternalLink, Fingerprint, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useClearance } from '@/store/selectors';
import { useFocusTrap } from '@/hooks/useOverlay';
import { AppIcon } from '@/components/ui/primitives';
import { getIcon } from '@/icons';
import { BRAND } from '@/config/brand';
import { cx } from '@/lib/cx';

const STEP_MS = 420;

/**
 * Secure launch sequence: SSO handshake → clearance check → session, then a
 * preview window. In production the final step would hand off to the app URL.
 * Modules that run inside NEXUS (`app.route`) navigate in-app instead.
 */
export function LaunchOverlay() {
  const launch = useUI((s) => s.launch);
  const end = useUI((s) => s.endLaunch);
  const app = useHub((s) => (launch ? s.apps.find((a) => a.id === launch.appId) : undefined));
  const clearance = useClearance();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, !!launch);

  useEffect(() => {
    if (!launch) return;
    const reduced = document.documentElement.dataset.motion === 'reduced';
    setStep(reduced ? 4 : 0);
    if (reduced) return;
    const timers = [1, 2, 3, 4].map((s) => window.setTimeout(() => setStep(s), s * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [launch]);

  useEffect(() => {
    if (!launch) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && end();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launch, end]);

  // In-app modules: once the handshake completes, open the route inside NEXUS.
  const inAppRoute = app?.route ? (launch?.action ? app.quickActions?.find((q) => q.label === launch.action)?.route : undefined) ?? app.route : null;
  useEffect(() => {
    if (!launch || !inAppRoute || step < 4) return;
    const t = window.setTimeout(() => {
      end();
      navigate(inAppRoute);
    }, 240);
    return () => clearTimeout(t);
  }, [launch, inAppRoute, step, end, navigate]);

  if (!launch || !app) return null;
  const ready = step >= 4;
  const steps = [
    { icon: Fingerprint, label: 'Authenticating identity', done: 'Identity verified · passkey' },
    { icon: ShieldCheck, label: 'Verifying clearance', done: `Clearance L${clearance} · access confirmed` },
    { icon: Lock, label: 'Establishing secure session', done: inAppRoute ? `Opening ${app.name} inside ${BRAND.product}` : 'Encrypted SSO session ready' },
  ];
  const style = { '--c1': app.gradient[0], '--c2': app.gradient[1] } as CSSProperties;
  const ActionIcon = launch.action ? getIcon(app.quickActions?.find((q) => q.label === launch.action)?.icon ?? app.icon) : null;

  return createPortal(
    <div className="launch" style={style} role="dialog" aria-modal="true" aria-label={`Launching ${app.name}`} ref={ref} tabIndex={-1}>
      <div className="launch__backdrop" onClick={ready ? end : undefined} />
      {!ready || inAppRoute ? (
        <div className="launch__sequence" aria-live="polite">
          <div className="launch__orbit">
            <span className="launch__ring launch__ring--1" />
            <span className="launch__ring launch__ring--2" />
            <span className="launch__ring launch__ring--3" />
            <span className="launch__core">
              <AppIcon app={app} size={84} />
            </span>
          </div>
          <div className="launch__title">Launching {app.name}</div>
          <ol className="launch__steps">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const state = step > i ? 'done' : step === i ? 'active' : 'idle';
              return (
                <li key={s.label} className={cx('launch__step', `is-${state}`)}>
                  <span className="launch__step-icon">{state === 'done' ? <Check /> : <Icon />}</span>
                  <span>{state === 'done' ? s.done : s.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="launch__window">
          <div className="launch__chrome">
            <span className="launch__lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div className="launch__url">
              <Lock size={13} />
              <span className="truncate">{app.url.replace(/^https?:\/\//, '')}</span>
              <span className="tag" style={{ marginLeft: 'auto' }}>
                SSO
              </span>
            </div>
            <button className="btn btn--sm btn--ghost" onClick={end} data-autofocus>
              <ArrowLeft /> Hub
            </button>
          </div>
          <div className="launch__body">
            <div className="launch__hero">
              <AppIcon app={app} size={64} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Secure session established
                </div>
                <h2 className="launch__app-name">{launch.action ?? app.name}</h2>
                <p className="muted text-sm">
                  {launch.action ? `${app.name} · deep link` : app.tagline}
                </p>
              </div>
              {ActionIcon && (
                <span className="launch__action-icon">
                  <ActionIcon />
                </span>
              )}
            </div>
            {app.status !== 'operational' && (
              <div className="launch__warn">
                <TriangleAlert size={18} />
                {app.name} is currently {app.status === 'maintenance' ? 'under maintenance' : 'degraded'} — some features may be slow or unavailable.
              </div>
            )}
            <div className="launch__skeleton" aria-hidden="true">
              <div className="launch__skel-side">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="skeleton" style={{ height: 12, width: `${60 + ((i * 17) % 35)}%` }} />
                ))}
              </div>
              <div className="launch__skel-main">
                <span className="skeleton" style={{ height: 22, width: '45%' }} />
                <div className="launch__skel-cards">
                  {Array.from({ length: 3 }, (_, i) => (
                    <span key={i} className="skeleton" style={{ height: 84 }} />
                  ))}
                </div>
                {Array.from({ length: 4 }, (_, i) => (
                  <span key={i} className="skeleton" style={{ height: 12, width: `${92 - i * 14}%` }} />
                ))}
              </div>
            </div>
            <div className="launch__foot">
              <p className="text-sm muted grow">
                Demo launch — in production NEXUS hands your SSO session to <span className="mono accent-ink">{app.url}</span>.
              </p>
              <a className="btn btn--primary" href={app.url} target="_blank" rel="noopener noreferrer" onClick={end}>
                Open {app.name} <ExternalLink />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
