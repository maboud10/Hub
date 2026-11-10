import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Bell, Database, Keyboard, LayoutDashboard, Palette, Settings, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useClearance, useMyRequests, usePrefs, useSessionUser } from '@/store/selectors';
import { Avatar, ClearanceBadge } from '@/components/ui/primitives';
import { NeoHead, NeoSide, NeoSideGroup, NeoSideItem, NeoStage, NeoWorkspace, useHubTint } from '@/components/neo';
import { ProfileSection } from './settings/ProfileSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { NOTIFICATION_KINDS, NotificationsSection, WIDGETS, WidgetsSection } from './settings/PreferenceSections';
import { AccessSection } from './settings/AccessSection';
import { ShortcutsSection } from './settings/ShortcutsSection';
import { DemoSection } from './settings/DemoSection';

interface SectionDef {
  id: string;
  label: string;
  group: 'account' | 'preferences' | 'system';
  icon: LucideIcon;
}

const SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'Profile & status', group: 'account', icon: UserRound },
  { id: 'appearance', label: 'Appearance', group: 'account', icon: Palette },
  { id: 'access', label: 'My access', group: 'account', icon: ShieldCheck },
  { id: 'widgets', label: 'Home widgets', group: 'preferences', icon: LayoutDashboard },
  { id: 'notifications', label: 'Notifications', group: 'preferences', icon: Bell },
  { id: 'shortcuts', label: 'Shortcuts', group: 'system', icon: Keyboard },
  { id: 'demo', label: 'Demo data', group: 'system', icon: Database },
];

const ALIAS_MAP: Record<string, string> = {
  preferences: 'widgets',
};

const reducedMotion = () =>
  document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SettingsPage() {
  const me = useSessionUser();
  const prefs = usePrefs();
  const clearance = useClearance();
  const requests = useMyRequests();
  const tint = useHubTint();
  const signedIn = !!me;
  const location = useLocation();
  const [params] = useSearchParams();
  const [active, setActive] = useState(SECTIONS[0].id);
  const [peek, setPeek] = useState(false);
  /** Ignore scroll-spy updates while a nav click is smooth-scrolling. */
  const lockUntil = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const jumpTo = useCallback((rawId: string, smooth = true) => {
    const id = ALIAS_MAP[rawId] ?? rawId;
    const el = document.getElementById(id);
    if (!el) return;
    lockUntil.current = Date.now() + 900;
    setActive(id);
    setPeek(false);
    el.scrollIntoView({ behavior: smooth && !reducedMotion() ? 'smooth' : 'auto', block: 'start' });
    el.focus({ preventScroll: true });
  }, []);

  // Scroll-spy: highlight the section crossing the upper part of the stage body (or viewport on mobile).
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const scroller = bodyRef.current;
    const inBand = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) inBand.set(e.target.id, e.isIntersecting);
        if (Date.now() < lockUntil.current) return;
        const first = SECTIONS.find((s) => inBand.get(s.id));
        if (first) setActive(first.id);
      },
      { root: scroller && scroller.scrollHeight > scroller.clientHeight ? scroller : null, rootMargin: '-18% 0px -68% 0px' },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        if (scroller.clientHeight + scroller.scrollTop >= scroller.scrollHeight - 12) {
          setActive(SECTIONS[SECTIONS.length - 1].id);
        }
      } else {
        const doc = document.documentElement;
        if (window.innerHeight + window.scrollY >= doc.scrollHeight - 8) setActive(SECTIONS[SECTIONS.length - 1].id);
      }
    };
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      scroller?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [signedIn]);

  // Deep links: /settings#access or /settings?section=access (also reacts if the hash/query changes while here).
  useEffect(() => {
    const raw = location.hash.slice(1) || params.get('section') || params.get('tab') || '';
    const id = ALIAS_MAP[raw] ?? raw;
    if (!SECTIONS.some((s) => s.id === id)) return;
    const t = window.setTimeout(() => jumpTo(id, false), 80);
    return () => window.clearTimeout(t);
  }, [location.hash, location.key, params, jumpTo]);

  if (!me) return null;

  const widgetsOn = WIDGETS.filter((w) => prefs.widgets[w.id] !== false).length;
  const notifyOn = NOTIFICATION_KINDS.filter((k) => prefs.notifyKinds[k.id] !== false).length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const metaFor = (id: string) => {
    if (id === 'access') return pendingCount > 0 ? `${pendingCount} pending` : `L${clearance}`;
    if (id === 'widgets') return `${widgetsOn}/${WIDGETS.length}`;
    if (id === 'notifications') return `${notifyOn}/${NOTIFICATION_KINDS.length}`;
    return undefined;
  };

  const renderGroup = (group: SectionDef['group'], title: string) => (
    <NeoSideGroup label={title}>
      {SECTIONS.filter((s) => s.group === group).map((s) => {
        const Icon = s.icon;
        return (
          <NeoSideItem
            key={s.id}
            icon={<Icon />}
            label={s.label}
            meta={metaFor(s.id)}
            active={active === s.id}
            onClick={() => {
              window.history.replaceState(null, '', `#${s.id}`);
              jumpTo(s.id);
            }}
          />
        );
      })}
    </NeoSideGroup>
  );

  return (
    <NeoWorkspace
      app="settings"
      tint={tint}
      rail={false}
      side
      sidePeek={peek}
      onSidePeekChange={setPeek}
      className="set-page"
    >
      <NeoSide title="Settings">
        <div className="set-side-id">
          <Avatar user={me} size={36} presence />
          <div className="set-side-id__text">
            <span className="set-side-id__name truncate">{me.name}</span>
            <span className="set-side-id__mail mono truncate">{me.email}</span>
          </div>
          <ClearanceBadge level={clearance} compact />
        </div>
        {renderGroup('account', 'Profile & access')}
        {renderGroup('preferences', 'Preferences')}
        {renderGroup('system', 'Workspace & demo')}
      </NeoSide>

      <NeoStage label="Settings">
        <NeoHead
          onToggleSide={() => setPeek((v) => !v)}
          icon={<Settings />}
          eyebrow="Hub · Settings"
          title="Your hub, your rules"
          sub="Profile, appearance, notifications and a transparent view of everything you can access."
          actions={
            <div className="set-head-id">
              <Avatar user={me} size={34} presence />
              <div className="set-head-id__text">
                <span className="set-head-id__name truncate">{me.name}</span>
                <span className="set-head-id__mail mono truncate">{me.email}</span>
              </div>
            </div>
          }
        />

        <div ref={bodyRef} className="neo-body neo-pad">
          <div className="set-sections neo-stack">
            <ProfileSection me={me} />
            <AppearanceSection me={me} />
            <AccessSection me={me} />
            <WidgetsSection />
            <NotificationsSection />
            <ShortcutsSection />
            <DemoSection />
          </div>
        </div>
      </NeoStage>
    </NeoWorkspace>
  );
}
