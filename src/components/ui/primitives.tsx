import type { CSSProperties, ReactNode } from 'react';
import { Lock } from 'lucide-react';
import type { HubApp, Presence, User } from '@/types';
import { getIcon } from '@/icons';
import { initials } from '@/lib/format';
import { cx } from '@/lib/cx';

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'Available',
  focus: 'Focusing',
  meeting: 'In a meeting',
  away: 'Away',
  offline: 'Offline',
};

export function Avatar({
  user,
  size = 36,
  presence = false,
  className,
}: {
  user: Pick<User, 'name' | 'avatarHue'> & { presence?: Presence };
  size?: number;
  presence?: boolean;
  className?: string;
}) {
  const h = user.avatarHue;
  const style = {
    '--size': `${size}px`,
    background: `linear-gradient(135deg, hsl(${h} 85% 62%), hsl(${(h + 45) % 360} 78% 44%))`,
  } as CSSProperties;
  return (
    <span className={cx('avatar', className)} style={style} aria-hidden="true">
      {initials(user.name)}
      {presence && user.presence && <span className={`avatar__presence dot dot--${user.presence}`} />}
    </span>
  );
}

export function AppIcon({
  app,
  size = 48,
  locked = false,
  className,
}: {
  app: Pick<HubApp, 'icon' | 'gradient'>;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const Icon = getIcon(app.icon);
  return (
    <span
      className={cx('app-icon', locked && 'is-locked', className)}
      style={{ '--size': `${size}px`, '--c1': app.gradient[0], '--c2': app.gradient[1] } as CSSProperties}
      aria-hidden="true"
    >
      <Icon strokeWidth={1.75} />
      {locked && (
        <span className="app-icon__lock">
          <Lock strokeWidth={2.4} />
        </span>
      )}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      {children && <p className="text-sm muted" style={{ maxWidth: 380 }}>{children}</p>}
      {action}
    </div>
  );
}

/** Signal-bar style clearance meter, e.g. ▮▮▮▯▯ L3 */
export function ClearanceBadge({ level, label, compact = false }: { level: number; label?: string; compact?: boolean }) {
  return (
    <span className={cx('clearance', compact && 'clearance--compact')} title={`Clearance level ${level} of 5`}>
      <span className="clearance__bars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= level ? 'on' : ''} style={{ height: `${4 + i * 2}px` }} />
        ))}
      </span>
      <span className="clearance__level">L{level}</span>
      {label && !compact && <span className="clearance__label">{label}</span>}
    </span>
  );
}

export function RoleChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span className="role-chip" style={{ '--role': color } as CSSProperties}>
      <i />
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
          ×
        </button>
      )}
    </span>
  );
}
