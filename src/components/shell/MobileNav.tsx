import { NavLink, useNavigate } from 'react-router';
import { House, LayoutGrid, LogOut, Newspaper, Settings, ShieldHalf, UserCog, Users } from 'lucide-react';
import type { Presence } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useCan, useClearance, useIsAdminArea, usePrimaryRole, useReviewableRequests, useSessionUser } from '@/store/selectors';
import { Avatar, ClearanceBadge, PRESENCE_LABEL } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { NovaOrb } from './Brand';

/** Floating bottom tab bar for phones with a raised Nova orb in the middle. */
export function MobileNav() {
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const canPeople = useCan('hub.people.view');
  const item = (to: string, label: string, Icon: typeof House, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => 'mobile-nav__item' + (isActive ? ' is-active' : '')}>
      <Icon />
      {label}
    </NavLink>
  );
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {item('/', 'Home', House, true)}
      {item('/apps', 'Apps', LayoutGrid)}
      <NovaOrb size={58} className="mobile-nav__orb" onClick={() => setPaletteOpen(true)} label="Search and actions" />
      {item('/news', 'News', Newspaper)}
      {canPeople ? item('/people', 'People', Users) : item('/settings', 'Settings', Settings)}
    </nav>
  );
}

const PRESENCES: Presence[] = ['online', 'focus', 'meeting', 'away'];

/** Phone menu sheet: identity, status, secondary navigation, persona switch, sign out. */
export function MobileMenu() {
  const open = useUI((s) => s.mobileMenuOpen);
  const setOpen = useUI((s) => s.setMobileMenuOpen);
  const setPersonaSwitcherOpen = useUI((s) => s.setPersonaSwitcherOpen);
  const user = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const isAdmin = useIsAdminArea();
  const canPeople = useCan('hub.people.view');
  const pending = useReviewableRequests().length;
  const setPresence = useHub((s) => s.setPresence);
  const logout = useHub((s) => s.logout);
  const navigate = useNavigate();
  if (!user) return null;

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
      <div className="card card--tight glow-border" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar user={user} size={52} presence />
        <div className="grow">
          <div style={{ fontWeight: 650, fontSize: 16 }}>{user.name}</div>
          <div className="text-sm muted truncate">{user.title}</div>
          <div style={{ marginTop: 6 }}>
            <ClearanceBadge level={clearance} label={role?.name} />
          </div>
        </div>
      </div>

      <div className="stat-label" style={{ margin: '18px 0 8px' }}>
        Status
      </div>
      <div className="chips" style={{ flexWrap: 'wrap', mask: 'none' }}>
        {PRESENCES.map((p) => (
          <button key={p} className={'chip' + (user.presence === p ? ' is-active' : '')} onClick={() => setPresence(p)}>
            <span className={`dot dot--${p}`} /> {PRESENCE_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="stat-label" style={{ margin: '20px 0 6px' }}>
        Navigate
      </div>
      <div className="stack stack--sm">
        <button className="list-row" onClick={() => go('/')}>
          <House size={19} /> Home
        </button>
        <button className="list-row" onClick={() => go('/apps')}>
          <LayoutGrid size={19} /> App directory
        </button>
        {canPeople && (
          <button className="list-row" onClick={() => go('/people')}>
            <Users size={19} /> People
          </button>
        )}
        <button className="list-row" onClick={() => go('/news')}>
          <Newspaper size={19} /> Newsroom
        </button>
        {isAdmin && (
          <button className="list-row" onClick={() => go('/admin')}>
            <ShieldHalf size={19} /> Control Center <span className="spacer" />
            {pending > 0 && <span className="counter">{pending}</span>}
          </button>
        )}
        <button className="list-row" onClick={() => go('/settings')}>
          <Settings size={19} /> Settings
        </button>
      </div>

      <div className="divider" />
      <div className="stack stack--sm">
        <button className="list-row" onClick={() => setPersonaSwitcherOpen(true)}>
          <UserCog size={19} /> Switch persona <span className="spacer" />
          <span className="tag">Demo</span>
        </button>
        <button
          className="list-row"
          style={{ color: 'var(--danger)' }}
          onClick={() => {
            setOpen(false);
            logout();
            navigate('/login');
          }}
        >
          <LogOut size={19} /> Sign out
        </button>
      </div>
    </Sheet>
  );
}
