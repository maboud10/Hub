import { Link, useLocation } from 'react-router';
import { LayoutGrid, Newspaper, Orbit, Rocket, Search, Settings, UsersRound } from 'lucide-react';
import { NeoEmpty, NeoPage } from '@/components/neo';
import { useCan } from '@/store/selectors';
import { useUI } from '@/store/ui';

/** 404 inside the hub shell — a holographic "signal lost" stage with ways back. */
export function NotFound() {
  const { pathname } = useLocation();
  const openPalette = useUI((s) => s.setPaletteOpen);
  const canPeople = useCan('hub.people.view');

  const ways = [
    { to: '/', icon: <Rocket />, label: 'Launchpad', hint: 'Your apps, widgets and pinned dock' },
    { to: '/apps', icon: <LayoutGrid />, label: 'All apps', hint: 'Browse and request every tool' },
    ...(canPeople ? [{ to: '/people', icon: <UsersRound />, label: 'People', hint: 'Find a colleague and their local time' }] : []),
    { to: '/news', icon: <Newspaper />, label: 'Newsroom', hint: 'Announcements aimed at you' },
    { to: '/settings', icon: <Settings />, label: 'Settings', hint: 'Profile, appearance and access' },
  ];

  return (
    <NeoPage
      className="nf-page"
      icon={<Orbit />}
      eyebrow="Hub · Error 404"
      title="Lost in orbit"
      sub="This page drifted out of range — pick a way back below."
      actions={
        <>
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => openPalette(true)}>
            <Search /> <span className="neo-btn__label">Search everything</span>
          </button>
          <Link to="/" className="neo-btn neo-btn--plasma">
            <Rocket /> <span className="neo-btn__label">Launchpad</span>
          </Link>
        </>
      }
    >
      <div className="nf">
        <div className="nf__glyph" aria-hidden="true">
          404
        </div>
        <NeoEmpty
          icon={<Orbit />}
          title="Signal lost"
          action={
            <div className="nf__actions">
              <Link to="/" className="neo-btn neo-btn--plasma">
                <Rocket /> Back to Launchpad
              </Link>
              <Link to="/apps" className="neo-btn neo-btn--soft">
                <LayoutGrid /> All apps
              </Link>
            </div>
          }
        >
          Nothing lives at <code className="nf__path neo-mono">{pathname}</code>. The link may be old, or the page has moved. Press{' '}
          <kbd className="kbd">⌘K</kbd> to search apps, people and actions.
        </NeoEmpty>

        <nav className="nf__ways neo-stagger" aria-label="Ways back">
          {ways.map((w, i) => (
            <Link key={w.to} to={w.to} className="nf__way neo-spot" style={{ ['--i' as string]: i }}>
              <span className="nf__way-icon">{w.icon}</span>
              <span className="nf__way-text">
                <b>{w.label}</b>
                <span>{w.hint}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </NeoPage>
  );
}
