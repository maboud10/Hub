import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Bell, Keyboard, LayoutGrid, Moon, Search, Sun } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { usePrefs, useSessionUser, useUnreadCount } from '@/store/selectors';
import { Avatar } from '@/components/ui/primitives';
import { useNow } from '@/hooks/useNow';
import { useResolvedTheme } from '@/hooks/useApplyTheme';
import { formatTime, tzLabel } from '@/lib/format';
import { LanguageOrbButton } from '@/lib/i18n';
import { BRAND } from '@/config/brand';
import { BrandMark } from './Brand';
import { FocusPill } from './Sidebar';
import { ReturnPortal } from './ReturnPortal';
import { useSidebarState } from './immersive';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar() {
  const user = useSessionUser();
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const unread = useUnreadCount();
  const { setPaletteOpen, setNotificationsOpen, setShortcutsOpen, setMobileMenuOpen } = useUI();
  const now = useNow(15_000);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isDark = useResolvedTheme() === 'dark';
  const { immersive, drawer, toggle } = useSidebarState();

  return (
    <header className={'topbar' + (scrolled ? ' is-scrolled' : '')}>
      {immersive && (
        <button
          type="button"
          className={'hub-orb' + (drawer ? ' is-open' : '')}
          onClick={toggle}
          aria-label={drawer ? 'Close hub menu' : 'Open hub menu — home, apps and people'}
          aria-expanded={drawer}
          aria-controls="hub-sidebar"
          data-tip="Hub · home, apps & people"
          data-tip-pos="bottom"
          data-qa="hub-orb"
        >
          <BrandMark withText={false} />
          <span className="hub-orb__badge" aria-hidden="true">
            <LayoutGrid />
          </span>
        </button>
      )}
      <Link to="/" className="topbar__brand" aria-label="Home">
        <BrandMark sub="Hub" />
      </Link>

      <ReturnPortal />

      <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
        <Search size={18} />
        <span className="search-trigger__text">{`Ask ${BRAND.assistant} or search apps, people, actions…`}</span>
        <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span>
        <span className="kbd">K</span>
      </button>

      <div className="topbar__actions">
        <span className="topbar__desktop-only">
          <FocusPill />
        </span>
        {user && (
          <span className="topbar__clock" title="Local time">
            {formatTime(now)} {tzLabel()}
          </span>
        )}
        <LanguageOrbButton />
        <button
          className="icon-btn topbar__desktop-only"
          onClick={() => updatePrefs({ theme: isDark ? 'light' : 'dark' })}
          aria-label="Toggle theme"
          data-tip={`Theme (${prefs.theme})`}
          data-tip-pos="bottom"
        >
          {isDark ? <Sun /> : <Moon />}
        </button>
        <button className="icon-btn topbar__desktop-only" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" data-tip="Shortcuts" data-tip-pos="bottom">
          <Keyboard />
        </button>
        <button
          className="icon-btn"
          onClick={() => setNotificationsOpen(true)}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          data-tip="Notifications"
          data-tip-pos="bottom"
        >
          <Bell />
          {unread > 0 && <span className="counter">{unread > 9 ? '9+' : unread}</span>}
        </button>
        {user && (
          <button className="icon-btn mobile-only" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
            <Avatar user={user} size={32} presence />
          </button>
        )}
      </div>
    </header>
  );
}
