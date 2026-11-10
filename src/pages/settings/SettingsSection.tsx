import type { ReactNode } from 'react';
import { NeoPanel } from '@/components/neo';
import { cx } from '@/lib/cx';

const SECTION_HUD: Record<string, string> = {
  profile: 'Identity & availability',
  appearance: 'Theme & workspace',
  widgets: 'Preferences · Launchpad',
  notifications: 'Preferences · Alerts',
  access: 'Security & permissions',
  shortcuts: 'Keyboard navigation',
  demo: 'Sandbox controls',
};

/** A titled settings NeoPanel that doubles as an anchor target for the section nav. */
export function SettingsSection({
  id,
  icon,
  hud,
  title,
  description,
  aside,
  children,
  className,
}: {
  id: string;
  icon: ReactNode;
  hud?: ReactNode;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NeoPanel
      id={id}
      icon={icon}
      hud={hud ?? SECTION_HUD[id] ?? 'Settings'}
      title={<span id={`${id}-title`}>{title}</span>}
      actions={aside}
      className={cx('set-section', className)}
    >
      {description && <p className="set-section__desc">{description}</p>}
      <div className="set-section__body">{children}</div>
    </NeoPanel>
  );
}

/** Icon · title/description · control. */
export function SettingRow({
  icon,
  title,
  description,
  badge,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('set-row', className)}>
      {icon && (
        <span className="set-row__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="set-row__text">
        <div className="set-row__title">
          {title}
          {badge}
        </div>
        {description && <div className="set-row__desc">{description}</div>}
      </div>
      <div className="set-row__control">{children}</div>
    </div>
  );
}

/** Small mono sub-heading inside a section. */
export function SubHead({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="set-subhead">
      <span className="set-subhead__label">
        {icon}
        {children}
      </span>
      {aside}
    </div>
  );
}
