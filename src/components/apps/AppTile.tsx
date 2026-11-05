import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { Ellipsis, Hourglass, LockKeyhole, Pin, PinOff, Clock } from 'lucide-react';
import type { AppStatus, AppWithAccess } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { usePrefs } from '@/store/selectors';
import { useLongPress } from '@/hooks/useLongPress';
import { useLaunchApp } from './useLaunchApp';
import { AppIcon } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';

export type TileVariant = 'card' | 'icon' | 'row';

export const STATUS_LABEL: Record<AppStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  maintenance: 'Maintenance',
};

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
  const pinned = prefs.pinned.includes(app.id);
  const granted = access === 'granted';
  const { handlers, wasLongPress } = useLongPress(() => openAppSheet(app.id));

  const onActivate = () => {
    if (wasLongPress()) return;
    if (access === 'disabled') return openAppSheet(app.id);
    launch(app.id);
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
  /** Long-press + spotlight/tilt handlers merged so neither overrides the other. */
  const pointer = {
    ...handlers,
    onPointerMove: (e: PointerEvent) => {
      handlers.onPointerMove(e);
      onMove(e);
    },
    onPointerLeave: () => {
      handlers.onPointerLeave();
      onLeave();
    },
  };

  const style = { '--c1': app.gradient[0], '--c2': app.gradient[1], '--i': index } as CSSProperties;
  const pin = () => toast.result(togglePin(app.id));
  const expiringSoon = expiresAt && expiresAt - Date.now() < 7 * DAY;

  // ───────── Icon (phone) ─────────
  if (variant === 'icon') {
    return (
      <div className={cx('tile-ico', `tile-ico--${access}`)} style={style} role="listitem">
        <button className="tile-ico__btn" onClick={onActivate} aria-label={accessLabel(item)} {...handlers}>
          <AppIcon app={app} size={60} locked={!granted} />
          {granted && !!app.notifications && <span className="counter">{app.notifications}</span>}
          {access === 'pending' && (
            <span className="tile-ico__pending badge badge--warning" style={{ height: 18, padding: '0 5px' }}>
              <Clock />
            </span>
          )}
        </button>
        <span className="tile-ico__name">{app.name}</span>
      </div>
    );
  }

  const statusNode =
    access === 'locked' ? (
      <span className="tile__lockline">
        <LockKeyhole /> Request access
      </span>
    ) : access === 'pending' ? (
      <span className="badge badge--warning">
        <span className="dot dot--pulse dot--away" /> Pending review
      </span>
    ) : access === 'disabled' ? (
      <span className="badge badge--muted">Disabled</span>
    ) : expiresAt ? (
      <span className={cx('badge', expiringSoon ? 'badge--warning' : 'badge--info')} title="Temporary access">
        <Hourglass /> Expires {relativeTime(expiresAt)}
      </span>
    ) : (
      <span className="tile__status">
        <span className={cx('dot', `dot--${app.status}`, app.status !== 'operational' && 'dot--pulse')} />
        <span className="tile-row__status-label">
          {app.status === 'operational' && app.route ? 'Workspace App' : STATUS_LABEL[app.status]}
        </span>
      </span>
    );

  const actions = (
    <>
      {granted && (
        <button
          className={cx('icon-btn icon-btn--sm tile__pin', pinned && 'is-pinned')}
          onClick={pin}
          aria-label={pinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
          aria-pressed={pinned}
          data-tip={pinned ? 'Unpin' : 'Pin to dock'}
        >
          {pinned ? <PinOff /> : <Pin />}
        </button>
      )}
      <button className="icon-btn icon-btn--sm" onClick={() => openAppSheet(app.id)} aria-label={`${app.name} details`} data-tip="Details">
        <Ellipsis />
      </button>
    </>
  );

  // ───────── Row (list) ─────────
  if (variant === 'row') {
    return (
      <div ref={ref} className={cx('tile-row', `tile-row--${access}`)} style={style} role="listitem" {...pointer}>
        <button className="tile__hit" onClick={onActivate} aria-label={accessLabel(item)} />
        <AppIcon app={app} size={42} locked={!granted} />
        <div className="grow">
          <div className="tile-row__name">
            <span className="truncate">{app.name}</span>
            {app.badge && <span className={cx('badge', app.badge === 'new' ? 'badge--solid' : 'badge--info')}>{app.badge}</span>}
            {granted && !!app.notifications && <span className="counter">{app.notifications}</span>}
          </div>
          <div className="text-sm muted truncate">{app.tagline}</div>
        </div>
        <div className="tile-row__aside">
          <span className="tile-row__cat">{app.category}</span>
          {statusNode}
          {actions}
        </div>
      </div>
    );
  }

  // ───────── Card ─────────
  return (
    <div
      ref={ref}
      className={cx('tile', `tile--${access}`, pinned && 'is-pinned')}
      style={style}
      role="listitem"
      {...pointer}
    >
      <button className="tile__hit" onClick={onActivate} aria-label={accessLabel(item)} />
      {pinned && <span className="tile__pin-flag" aria-hidden="true" />}
      <div className="tile__top">
        <AppIcon app={app} size={52} locked={!granted} />
        <div className="tile__badges">
          {app.badge && <span className={cx('badge', app.badge === 'new' ? 'badge--solid' : 'badge--info')}>{app.badge}</span>}
          {granted && !!app.notifications && <span className="counter">{app.notifications}</span>}
        </div>
      </div>
      <div className="tile__body">
        <div className="tile__name">{app.name}</div>
        <div className="tile__tagline">{app.tagline}</div>
      </div>
      <div className="tile__foot">
        {statusNode}
        <div className="tile__actions">{actions}</div>
      </div>
    </div>
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
