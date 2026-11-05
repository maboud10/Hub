import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Bell, Database, Keyboard, LayoutDashboard, Palette, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { ProfileSection } from './settings/ProfileSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { NotificationsSection, WidgetsSection } from './settings/PreferenceSections';
import { AccessSection } from './settings/AccessSection';
import { ShortcutsSection } from './settings/ShortcutsSection';
import { DemoSection } from './settings/DemoSection';

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile & status', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'widgets', label: 'Home widgets', icon: LayoutDashboard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'access', label: 'My access', icon: ShieldCheck },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'demo', label: 'Demo data', icon: Database },
];

const reducedMotion = () =>
  document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SettingsPage() {
  const me = useSessionUser();
  const signedIn = !!me;
  const location = useLocation();
  const [active, setActive] = useState(SECTIONS[0].id);
  /** Ignore scroll-spy updates while a nav click is smooth-scrolling. */
  const lockUntil = useRef(0);
  const navRef = useRef<HTMLElement>(null);

  const jumpTo = useCallback((id: string, smooth = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    lockUntil.current = Date.now() + 900;
    setActive(id);
    el.scrollIntoView({ behavior: smooth && !reducedMotion() ? 'smooth' : 'auto', block: 'start' });
    el.focus({ preventScroll: true });
  }, []);

  // Scroll-spy: highlight the section crossing the upper part of the viewport.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const inBand = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) inBand.set(e.target.id, e.isIntersecting);
        if (Date.now() < lockUntil.current) return;
        const first = SECTIONS.find((s) => inBand.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-22% 0px -68% 0px' },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 8) setActive(SECTIONS[SECTIONS.length - 1].id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [signedIn]);

  // Deep links: /settings#access (also reacts if the hash changes while we're here).
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!SECTIONS.some((s) => s.id === id)) return;
    const t = window.setTimeout(() => jumpTo(id, false), 80);
    return () => window.clearTimeout(t);
  }, [location.hash, location.key, jumpTo]);

  // Keep the active pill visible in the horizontal (mobile) nav.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  if (!me) return null;

  return (
    <div className="page set-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="page-title">Your hub, your rules</h1>
          <p className="page-sub">Profile, appearance, notifications and a transparent view of everything you can access.</p>
        </div>
        <div className="set-head-id">
          <Avatar user={me} size={40} presence />
          <div className="set-head-id__text">
            <span className="set-head-id__name truncate">{me.name}</span>
            <span className="set-head-id__mail mono truncate">{me.email}</span>
          </div>
        </div>
      </header>

      <div className="set-layout">
        <nav ref={navRef} className="set-nav" aria-label="Settings sections">
          <ul>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    data-section={s.id}
                    className={cx('set-nav__link', isActive && 'is-active')}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      jumpTo(s.id);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{s.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="set-sections">
          <ProfileSection me={me} />
          <AppearanceSection me={me} />
          <WidgetsSection />
          <NotificationsSection />
          <AccessSection me={me} />
          <ShortcutsSection />
          <DemoSection />
        </div>
      </div>
    </div>
  );
}
