import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** A titled settings card that doubles as an anchor target for the section nav. */
export function SettingsSection({
  id,
  icon,
  title,
  description,
  aside,
  children,
  className,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} tabIndex={-1} className={cx('set-section card', className)} aria-labelledby={`${id}-title`}>
      <header className="set-section__head">
        <span className="set-section__icon" aria-hidden="true">
          {icon}
        </span>
        <div className="set-section__heading">
          <h2 id={`${id}-title`} className="set-section__title">
            {title}
          </h2>
          {description && <p className="set-section__desc">{description}</p>}
        </div>
        {aside && <div className="set-section__aside">{aside}</div>}
      </header>
      <div className="set-section__body">{children}</div>
    </section>
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
