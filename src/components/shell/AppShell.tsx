import { Suspense } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useFocus } from '@/store/focus';
import { useAppAccessMap, usePrefs } from '@/store/selectors';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useResolvedTheme } from '@/hooks/useApplyTheme';
import { useI18n } from '@/lib/i18n';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { AppDetailsSheet } from '@/components/apps/AppDetailsSheet';
import { LaunchOverlay } from '@/components/apps/LaunchOverlay';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { KudosDialog } from '@/components/KudosDialog';
import { PersonaSwitcher, ShortcutsDialog } from '@/components/Dialogs';
import { FocusEngine, startFocusSession, stopFocusSession } from '@/components/FocusEngine';
import { AmbientBackground } from './Brand';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileMenu, MobileNav } from './MobileNav';
import { useSidebarState } from './immersive';

function GlobalHotkeys() {
  const navigate = useNavigate();
  const ui = useUI();
  const prefs = usePrefs();
  const accessMap = useAppAccessMap();
  const theme = useResolvedTheme();
  const launch = useLaunchApp();
  const anyOverlay = ui.paletteOpen || ui.launch || ui.appSheetId || ui.kudos.open || ui.shortcutsOpen || ui.personaSwitcherOpen;

  const pinnedGranted = prefs.pinned.filter((id) => accessMap.get(id)?.access === 'granted');
  const numberKeys = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      String(i + 1),
      () => {
        if (anyOverlay) return;
        const id = pinnedGranted[i];
        if (id) launch(id);
      },
    ]),
  );

  useHotkeys({
    'mod+k': (e) => {
      e.preventDefault();
      ui.setPaletteOpen(!ui.paletteOpen);
    },
    '/': (e) => {
      if (anyOverlay) return;
      e.preventDefault();
      ui.setPaletteOpen(true);
    },
    '?': () => !anyOverlay && ui.setShortcutsOpen(true),
    'g h': () => navigate('/'),
    'g a': () => navigate('/apps'),
    'g p': () => navigate('/people'),
    'g n': () => navigate('/news'),
    'g s': () => navigate('/settings'),
    'g x': () => navigate('/admin'),
    t: () => !anyOverlay && useHub.getState().updatePrefs({ theme: theme === 'dark' ? 'light' : 'dark' }),
    l: () => !anyOverlay && useI18n.getState().toggleLocale(),
    f: () => {
      if (anyOverlay) return;
      if (useFocus.getState().mode === 'idle') startFocusSession(25);
      else stopFocusSession();
    },
    n: () => !anyOverlay && ui.setNotificationsOpen(!ui.notificationsOpen),
    ...numberKeys,
  });
  return null;
}

function PageFallback() {
  return (
    <div className="page" aria-busy="true">
      <div className="skeleton" style={{ height: 34, width: 260, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 16, width: 420, marginBottom: 30 }} />
      <div className="grid-auto" style={{ ['--min' as string]: '240px' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 160, borderRadius: 22 }} />
        ))}
      </div>
    </div>
  );
}

export function AppShell() {
  const { collapsed, immersive } = useSidebarState();
  return (
    <div className="shell" data-collapsed={collapsed} data-immersive={immersive || undefined}>
      <AmbientBackground />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="shell__main">
        <TopBar />
        <main id="main" className="shell__content" tabIndex={-1}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <MobileMenu />
      <CommandPalette />
      <NotificationsPanel />
      <AppDetailsSheet />
      <LaunchOverlay />
      <KudosDialog />
      <ShortcutsDialog />
      <PersonaSwitcher />
      <FocusEngine />
      <GlobalHotkeys />
    </div>
  );
}
