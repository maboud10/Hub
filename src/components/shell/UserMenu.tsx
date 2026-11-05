import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Keyboard, LogOut, Settings, UserCog } from 'lucide-react';
import type { Presence } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { usePrimaryRole, useSessionUser, useClearance } from '@/store/selectors';
import { Avatar, ClearanceBadge, PRESENCE_LABEL } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

const PRESENCES: Presence[] = ['online', 'focus', 'meeting', 'away'];

/** Sidebar user card with a popover: status, persona switch, settings, sign out. */
export function UserMenu() {
  const user = useSessionUser();
  const role = usePrimaryRole();
  const clearance = useClearance();
  const setPresence = useHub((s) => s.setPresence);
  const logout = useHub((s) => s.logout);
  const setPersonaSwitcherOpen = useUI((s) => s.setPersonaSwitcherOpen);
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-card" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} data-tip-pos="right">
        <Avatar user={user} size={38} presence />
        <span className="user-card__meta grow">
          <div className="user-card__name truncate">{user.name}</div>
          <div className="user-card__role truncate">{role?.name ?? 'Member'} · L{clearance}</div>
        </span>
      </button>
      {open && (
        <div className="menu menu--up" role="menu">
          <div className="row" style={{ padding: '8px 10px 10px' }}>
            <Avatar user={user} size={40} presence />
            <div className="grow">
              <div style={{ fontWeight: 600 }} className="truncate">
                {user.name}
              </div>
              <div className="text-xs faint truncate">{user.email}</div>
            </div>
            <ClearanceBadge level={clearance} compact />
          </div>
          <div className="menu__sep" />
          <div className="menu__label">Set status</div>
          {PRESENCES.map((p) => (
            <button key={p} role="menuitemradio" aria-checked={user.presence === p} className={cx('menu__item', user.presence === p && 'is-current')} onClick={go(() => setPresence(p))}>
              <span className={`dot dot--${p}`} />
              {PRESENCE_LABEL[p]}
              {user.presence === p && <span className="spacer" />}
              {user.presence === p && <span className="tag">Current</span>}
            </button>
          ))}
          <div className="menu__sep" />
          <button role="menuitem" className="menu__item" onClick={go(() => setPersonaSwitcherOpen(true))}>
            <UserCog /> Switch persona <span className="spacer" />
            <span className="tag">Demo</span>
          </button>
          <button role="menuitem" className="menu__item" onClick={go(() => navigate('/settings'))}>
            <Settings /> Settings
          </button>
          <button role="menuitem" className="menu__item" onClick={go(() => setShortcutsOpen(true))}>
            <Keyboard /> Keyboard shortcuts <span className="spacer" />
            <span className="kbd">?</span>
          </button>
          <div className="menu__sep" />
          <button
            role="menuitem"
            className="menu__item menu__item--danger"
            onClick={go(() => {
              logout();
              navigate('/login');
            })}
          >
            <LogOut /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
