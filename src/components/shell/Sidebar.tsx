import { NavLink } from 'react-router';
import { PanelLeftClose, PanelLeftOpen, Timer } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useAppAccessMap, usePermissions, usePrefs, useReviewableRequests } from '@/store/selectors';
import { hasAny, hasPermission } from '@/lib/rbac';
import { AppIcon } from '@/components/ui/primitives';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { useFocus } from '@/store/focus';
import { useNow } from '@/hooks/useNow';
import { mmss } from '@/lib/format';
import { BrandMark } from './Brand';
import { NAV_ITEMS, type NavItem } from './nav';
import { UserMenu } from './UserMenu';

function useNavAllowed() {
  const perms = usePermissions();
  return (item: NavItem) =>
    !item.perm || (typeof item.perm === 'string' ? hasPermission(perms, item.perm) : hasAny(perms, item.perm));
}

export function FocusPill() {
  const mode = useFocus((s) => s.mode);
  return mode === 'idle' ? null : <ActiveFocusPill />;
}

function ActiveFocusPill() {
  const { mode, endsAt, pausedRemaining } = useFocus();
  useNow(1000);
  const remaining = pausedRemaining ?? (endsAt ? endsAt - Date.now() : 0);
  return (
    <span className="focus-pill" title={mode === 'focus' ? 'Focus session' : 'Break'}>
      <span className="dot dot--pulse" />
      <Timer />
      <span className="focus-pill__label">{mode === 'focus' ? 'Focus' : 'Break'}</span>
      {mmss(remaining)}
    </span>
  );
}

export function Sidebar() {
  const allowed = useNavAllowed();
  const prefs = usePrefs();
  const updatePrefs = useHub((s) => s.updatePrefs);
  const reviewable = useReviewableRequests();
  const accessMap = useAppAccessMap();
  const launch = useLaunchApp();
  const pins = prefs.pinned.filter((id) => accessMap.get(id)?.access === 'granted').slice(0, 5);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const count = item.to === '/admin' ? reviewable.length : 0;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}
        data-tip={prefs.sidebarCollapsed ? item.label : undefined}
        data-tip-pos="right"
        data-count={count || undefined}
      >
        <Icon />
        <span className="nav-item__label">{item.label}</span>
        {count > 0 && <span className="counter">{count}</span>}
      </NavLink>
    );
  };

  const workspace = NAV_ITEMS.filter((i) => i.group === 'workspace' && allowed(i));
  const governance = NAV_ITEMS.filter((i) => i.group === 'governance' && allowed(i));
  const system = NAV_ITEMS.filter((i) => i.group === 'system' && allowed(i));

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <NavLink to="/" aria-label="NEXUS home">
          <BrandMark />
        </NavLink>
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        <div className="sidebar__label">Workspace</div>
        {workspace.map(renderItem)}
        {governance.length > 0 && <div className="sidebar__label">Governance</div>}
        {governance.map(renderItem)}
        {system.map(renderItem)}
      </nav>

      {pins.length > 0 && (
        <div className="sidebar__pins">
          <div className="sidebar__label">Pinned</div>
          {pins.map((id) => {
            const a = accessMap.get(id)!;
            return (
              <button key={id} className="pin-link" onClick={() => launch(id)} data-tip={prefs.sidebarCollapsed ? a.app.name : undefined} data-tip-pos="right">
                <AppIcon app={a.app} size={26} />
                <span className="pin-link__name truncate">{a.app.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="sidebar__foot">
        <FocusPill />
        <UserMenu />
        <button
          className="icon-btn icon-btn--sm collapse-btn"
          onClick={() => updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed })}
          aria-label={prefs.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-tip={prefs.sidebarCollapsed ? 'Expand' : 'Collapse'}
          data-tip-pos="right"
        >
          {prefs.sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
    </aside>
  );
}

export { useNavAllowed };
