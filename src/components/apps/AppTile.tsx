import { useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { ArrowUpRight, Clock, Ellipsis, Hourglass, Info, LockKeyhole, Pin, PinOff } from 'lucide-react';
import type { AppStatus, AppWithAccess } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { usePrefs } from '@/store/selectors';
import { useLongPress } from '@/hooks/useLongPress';
import { useLaunchApp } from './useLaunchApp';
import { AppIcon } from '@/components/ui/primitives';
import { Chip, Orb, useContextMenu, type MenuEntry, type Tone } from '@/components/neo';
import { getIcon } from '@/icons';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';

export type TileVariant = 'card' | 'icon' | 'row';

export const STATUS_LABEL: Record<AppStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  maintenance: 'Maintenance',
};

const STATUS_TONE: Record<AppStatus, Tone> = { operational: 'success', degraded: 'warning', maintenance: 'blue' };

const DAY = 86_400_000;

function accessLabel(item: AppWithAccess) {
  const { app, access } = item;
  if (access === 'locked') return `${app.name}, locked. Request access.`;
  if (access === 'pending') return `${app.name}, access request pending.`;
  if (access === 'disabled') return `${app.name}, disabled by an administrator.`;
  return `Open ${app.name}${app.notifications ? `, ${app.notifications} new` : ''}`;
}

export function AppTile({ item, variant = 'card', index = 0 }: { item: AppWithAccess; variant?: TileVariant; index?: number }) {
  const { app, access, expiresAt } = item;
  const prefs = usePrefs();
  const togglePin = useHub((s) => s.togglePin);
  const openAppSheet = useUI((s) => s.openAppSheet);
  const launch = useLaunchApp();
  const ref = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<string>('mouse');
  const ctx = useContextMenu();
  const pinned = prefs.pinned.includes(app.id);
  const granted = access === 'granted';
  const { handlers, wasLongPress } = useLongPress(() => openAppSheet(app.id));

  const onActivate = () => {
    if (wasLongPress()) return;
    if (access === 'disabled') return openAppSheet(app.id);
    launch(app.id);
  };

  const pin = () => toast.result(togglePin(app.id));

  /** Desktop right-click menu (touch long-press keeps opening the details sheet). */
  const menu = (): MenuEntry[] => {
    const details: MenuEntry = { label: 'Details', icon: <Info />, onSelect: () => openAppSheet(app.id) };
    if (access === 'locked') return [{ label: 'Request access…', icon: <LockKeyhole />, onSelect: () => openAppSheet(app.id) }, details];
    if (access === 'pending') return [{ label: 'View pending request', icon: <Clock />, onSelect: () => openAppSheet(app.id) }, details];
    if (access === 'disabled') return [details];
    return [
      { label: `Open ${app.name}`, icon: <ArrowUpRight />, hint: '↵', onSelect: () => launch(app.id) },
      ...(app.quickActions ?? []).slice(0, 3).map((qa): MenuEntry => {
        const Icon = getIcon(qa.icon);
        return { label: qa.label, icon: <Icon />, onSelect: () => launch(app.id, qa.label) };
      }),
      { kind: 'sep' },
      { label: pinned ? 'Unpin from dock' : 'Pin to dock', icon: pinned ? <PinOff /> : <Pin />, onSelect: pin },
      details,
    ];
  };

  const onContextMenu = (e: MouseEvent) => {
    if (lastPointer.current !== 'mouse') return handlers.onContextMenu(e);
    e.preventDefault();
    const r = ref.current?.getBoundingClientRect();
    // Keyboard-invoked menus (Shift+F10 / menu key) report 0,0 — anchor to the tile instead.
    if (!e.clientX && !e.clientY && r) ctx.open({ clientX: r.left + 24, clientY: r.top + 36 }, menu());
    else ctx.open(e, menu());
  };

  // Cursor-follow spotlight + subtle 3D tilt (mouse only, skipped for reduced motion)
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const el = ref.current;
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
    if (document.documentElement.dataset.motion !== 'reduced' && variant === 'card') {
      el.style.setProperty('--rx', `${((y / r.height - 0.5) * -6).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x / r.width - 0.5) * 7).toFixed(2)}deg`);
    }
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  /** Long-press + spotlight/tilt + context-menu handlers merged so neither overrides the other. */
  const pointer = {
    ...handlers,
    onPointerDown: (e: PointerEvent) => {
      lastPointer.current = e.pointerType;
      handlers.onPointerDown(e);
    },
    onPointerMove: (e: PointerEvent) => {
      handlers.onPointerMove(e);
      onMove(e);
    },
    onPointerLeave: () => {
      handlers.onPointerLeave();
      onLeave();
    },
    onContextMenu,
  };

  const style = { '--c1': app.gradient[0], '--c2': app.gradient[1], '--i': index } as CSSProperties;
  const expiringSoon = expiresAt && expiresAt - Date.now() < 7 * DAY;

  // ───────── Icon (phone) ─────────
  if (variant === 'icon') {
    return (
      <div className={cx('tile-ico', `tile-ico--${access}`)} style={style} role="listitem">
        <button className="tile-ico__btn" onClick={onActivate} aria-label={accessLabel(item)} {...handlers}>
          <AppIcon app={app} size={60} locked={!granted} />
          {granted && !!app.notifications && <span className="counter">{app.notifications}</span>}
          {access === 'pending' && (
            <span className="tile-ico__pending" aria-hidden="true">
              <Clock />
            </span>
          )}
        </button>
        <span className="tile-ico__name">{app.name}</span>
      </div>
    );
  }

  const badge = app.badge && (
    <Chip tone={app.badge === 'new' ? 'app' : 'violet'} size="sm" solid={app.badge === 'new'} className="tile__flag">
      {app.badge}
    </Chip>
  );

  const statusNode =
    access === 'locked' ? (
      <span className="tile__lockline">
        <LockKeyhole /> Request access
      </span>
    ) : access === 'pending' ? (
      <Chip tone="warning" size="sm" icon={<Orb tone="warning" pulse size={6} />}>
        Pending review
      </Chip>
    ) : access === 'disabled' ? (
      <Chip tone="slate" size="sm">
        Disabled
      </Chip>
    ) : expiresAt ? (
      <Chip tone={expiringSoon ? 'warning' : 'blue'} size="sm" icon={<Hourglass />} title="Temporary access">
        Expires {relativeTime(expiresAt)}
      </Chip>
    ) : (
      <span className="tile__status" title={STATUS_LABEL[app.status]}>
        <Orb tone={STATUS_TONE[app.status]} pulse={app.status !== 'operational'} size={6} />
        <span className="tile-row__status-label">
          {app.status !== 'operational' ? STATUS_LABEL[app.status] : variant === 'row' ? (app.route ? 'Workspace app' : 'Single sign-on') : app.route ? 'Workspace' : 'SSO'}
        </span>
      </span>
    );

  const actions = (
    <>
      {granted && (
        <button
          type="button"
          className={cx('icon-btn icon-btn--sm tile__pin', pinned && 'is-pinned')}
          onClick={pin}
          aria-label={pinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
          aria-pressed={pinned}
          data-tip={pinned ? 'Unpin' : 'Pin to dock'}
        >
          {pinned ? <PinOff /> : <Pin />}
        </button>
      )}
      <button type="button" className="icon-btn icon-btn--sm" onClick={() => openAppSheet(app.id)} aria-label={`${app.name} details`} data-tip="Details">
        <Ellipsis />
      </button>
    </>
  );

  // ───────── Row (list) ─────────
  if (variant === 'row') {
    return (
      <>
      <div ref={ref} className={cx('tile-row neo-spot', `tile-row--${access}`)} style={style} role="listitem" {...pointer}>
        <button className="tile__hit" onClick={onActivate} aria-label={accessLabel(item)} />
        <AppIcon app={app} size={40} locked={!granted} />
        <div className="tile-row__main">
          <div className="tile-row__name">
            <span className="truncate">{app.name}</span>
            {badge}
            {granted && !!app.notifications && <span className="counter">{app.notifications}</span>}
          </div>
          <div className="tile-row__tagline">{app.tagline}</div>
        </div>
        <div className="tile-row__aside">
          <span className="tile-row__cat">{app.category}</span>
          {statusNode}
          {actions}
        </div>
      </div>
      {ctx.element}
      </>
    );
  }

  // ───────── Card ─────────
  return (
    <>
    <div ref={ref} className={cx('tile neo-spot', `tile--${access}`, pinned && 'is-pinned')} style={style} role="listitem" {...pointer}>
      <button className="tile__hit" onClick={onActivate} aria-label={accessLabel(item)} />
      <span className="tile__aura" aria-hidden="true" />
      {pinned && <span className="tile__pin-flag" aria-hidden="true" />}
      <div className="tile__top">
        <AppIcon app={app} size={46} locked={!granted} />
        <div className="tile__badges">
          {badge}
          {granted && !!app.notifications && <span className="counter">{app.notifications}</span>}
        </div>
      </div>
      <div className="tile__body">
        <div className="tile__name">{app.name}</div>
        <div className="tile__tagline">{app.tagline}</div>
      </div>
      <div className="tile__foot">
        <span className="tile__meta">{app.category}</span>
        {statusNode}
        {granted && <div className="tile__actions">{actions}</div>}
      </div>
    </div>
    {ctx.element}
    </>
  );
}

export function AppGrid({ items, variant }: { items: AppWithAccess[]; variant: TileVariant }) {
  return (
    <div
      className={cx('app-grid', 'stagger', variant === 'icon' && 'app-grid--icons', variant === 'row' && 'app-grid--list')}
      role="list"
    >
      {items.map((item, i) => (
        <AppTile key={item.app.id} item={item} variant={variant} index={i} />
      ))}
    </div>
  );
}
