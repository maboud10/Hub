import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ChevronRight, Fingerprint, History, KeyRound, LockKeyhole, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useSessionUser } from '@/store/selectors';
import { clearanceOf, primaryRole } from '@/lib/rbac';
import { AmbientBackground, BrandMark } from '@/components/shell/Brand';
import { AppIcon, Avatar, ClearanceBadge, RoleChip } from '@/components/ui/primitives';
import { Orb, tintVars } from '@/components/neo';
import { LanguageOrbButton } from '@/lib/i18n';
import { BRAND } from '@/config/brand';
import { cx } from '@/lib/cx';

const ORBIT_APPS = ['mail', 'chat', 'hr', 'devhub', 'analytics', 'spaces', 'learning', 'security'];
const LOGIN_TINT = tintVars({ c1: '#22d3ee', c2: '#8b5cf6' });

export function LoginPage() {
  const session = useSessionUser();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const login = useHub((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [scanning, setScanning] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (session && !scanning) return <Navigate to="/" replace />;

  const personas = users.filter((u) => u.persona);
  const from = (location.state as { from?: string } | null)?.from;
  const scanUser = users.find((u) => u.id === scanning);

  const pick = (id: string) => {
    if (scanning) return;
    const u = users.find((x) => x.id === id);
    if (!u?.active) {
      toast.error('This account is deactivated', 'Ask an admin to reactivate it in the Control Center.');
      return;
    }
    const reduced = document.documentElement.dataset.motion === 'reduced';
    const [t1, t2, t3] = reduced ? [10, 20, 30] : [650, 1300, 2000];
    setScanning(id);
    setPhase(0);
    timers.current = [
      window.setTimeout(() => setPhase(1), t1),
      window.setTimeout(() => setPhase(2), t2),
      window.setTimeout(() => {
        const res = login(id);
        if (res.ok) navigate(from && from !== '/login' ? from : '/', { replace: true });
        else {
          toast.result(res);
          setScanning(null);
        }
      }, t3),
    ];
  };

  const orbitApps = ORBIT_APPS.map((id) => apps.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <div className="login neo-portal" style={{ ...LOGIN_TINT } as CSSProperties}>
      <AmbientBackground />
      <div className="login__grid">
        <section className="login__hero">
          <div className="login__brand-row">
            <BrandMark />
            <div className="row" style={{ gap: 8 }}>
              <LanguageOrbButton />
              <span className="neo-chip" data-tone="emerald">
                <Orb tone="emerald" pulse size={7} /> Zero-trust SSO ready
              </span>
            </div>
          </div>
          <div className="neo-hud neo-hud--tint login__eyebrow">NEXUS WORKSPACE OS · CLEARANCE GATE</div>
          <h1 className="login__title">
            Your whole workday,
            <br />
            <span className="neo-grad-text">one secure orbit.</span>
          </h1>
          <p className="login__sub">
            {BRAND.product} brings every tool your team uses into a single, permission-aware launchpad — you see exactly what
            your role unlocks, and can request the rest in seconds.
          </p>
          <ul className="login__features">
            <li className="neo-card login__feature">
              <span className="login__feature-icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <div>
                <div className="neo-hud">Clearance L1–L5</div>
                <div className="login__feature-title">Role-based access with live policy checks</div>
              </div>
            </li>
            <li className="neo-card login__feature">
              <span className="login__feature-icon" aria-hidden="true">
                <KeyRound />
              </span>
              <div>
                <div className="neo-hud">Ephemeral elevation</div>
                <div className="login__feature-title">Time-boxed grants that expire automatically</div>
              </div>
            </li>
            <li className="neo-card login__feature">
              <span className="login__feature-icon" aria-hidden="true">
                <History />
              </span>
              <div>
                <div className="neo-hud">Full provenance</div>
                <div className="login__feature-title">Every decision captured in a tamper-evident audit trail</div>
              </div>
            </li>
          </ul>
        </section>

        <div className="login__panel-wrap">
          <div className="orbit-visual" aria-hidden="true">
            <span className="orbit-visual__ring orbit-visual__ring--1">
              {orbitApps.slice(0, 3).map((a, i) => (
                <span key={a.id} className="orbit-visual__sat" style={{ '--a': `${(360 / 3) * i + 30}deg` } as CSSProperties}>
                  <AppIcon app={a} size={40} />
                </span>
              ))}
            </span>
            <span className="orbit-visual__ring orbit-visual__ring--2">
              {orbitApps.slice(3).map((a, i) => (
                <span key={a.id} className="orbit-visual__sat" style={{ '--a': `${(360 / 5) * i}deg` } as CSSProperties}>
                  <AppIcon app={a} size={34} />
                </span>
              ))}
            </span>
          </div>

          <section className="login__panel neo-plane" aria-live="polite">
            {scanUser ? (
              <div className="scan">
                <div className="neo-hud neo-hud--tint">BIOMETRIC HANDSHAKE</div>
                <div className={cx('scan__reader', phase === 2 && 'is-granted')}>
                  <span className="scan__ring scan__ring--1" />
                  <span className="scan__ring scan__ring--2" />
                  <span className="scan__ring scan__ring--3" />
                  <span className="scan__core">{phase === 2 ? <ShieldCheck /> : phase === 1 ? <ScanFace /> : <Fingerprint />}</span>
                  {phase < 2 && <span className="scan__beam" />}
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
                  <Avatar user={scanUser} size={36} presence />
                  <strong>{scanUser.name}</strong>
                </div>
                <ol className="scan__steps">
                  <li className={cx(phase >= 0 && 'is-on', phase > 0 && 'is-done')}>
                    <span /> Verifying passkey
                  </li>
                  <li className={cx(phase >= 1 && 'is-on', phase > 1 && 'is-done')}>
                    <span /> Checking device trust
                  </li>
                  <li className={cx(phase >= 2 && 'is-on is-done')}>
                    <span /> Access granted · Clearance L{clearanceOf(scanUser, roles)}
                  </li>
                </ol>
              </div>
            ) : (
              <>
                <header className="login__panel-head">
                  <span className="neo-panel__icon" aria-hidden="true">
                    <Sparkles />
                  </span>
                  <div className="login__panel-titles">
                    <div className="neo-hud neo-hud--tint">Demo sign-in · Persona deck</div>
                    <h2 className="login__panel-title">Choose an identity</h2>
                  </div>
                  <span className="neo-count">{personas.length}</span>
                </header>
                <p className="login__panel-sub">
                  Each persona holds different roles, so you can explore how permissions shape the hub. No password needed.
                </p>
                <div className="persona-list neo-stagger">
                  {personas.map((u, i) => {
                    const role = primaryRole(u, roles);
                    return (
                      <button key={u.id} type="button" className="persona-row neo-spot" onClick={() => pick(u.id)} style={{ '--i': i } as CSSProperties}>
                        <Avatar user={u} size={44} presence />
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="row persona-row__name" style={{ gap: 8 }}>
                            <strong className="truncate">{u.name}</strong>
                            {role && <RoleChip name={role.name} color={role.color} />}
                          </span>
                          <span className="text-sm muted truncate" style={{ display: 'block' }}>
                            {u.title} · {u.department}
                          </span>
                          <span className="text-xs faint truncate" style={{ display: 'block' }}>
                            {u.personaBlurb}
                          </span>
                        </span>
                        <ClearanceBadge level={clearanceOf(u, roles)} compact />
                        <ChevronRight size={18} className="faint persona-row__go" />
                      </button>
                    );
                  })}
                </div>
                <div className="login__secure">
                  <LockKeyhole size={13} />
                  <span className="neo-hud">Passkeys · SSO · device trust — simulated for this demo</span>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
