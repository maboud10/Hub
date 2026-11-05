/**
 * Inline callout for the pipeline dialogs (info / success / warning / danger
 * / muted), with an optional title and trailing action.
 */
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheckBig, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/cx';

type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'accent';

const ICON: Record<CalloutTone, LucideIcon> = {
  info: Info,
  success: CircleCheckBig,
  warning: TriangleAlert,
  danger: CircleAlert,
  muted: Info,
  accent: Info,
};

export function Callout({
  tone = 'info',
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: CalloutTone;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icon ?? ICON[tone];
  return (
    <div className={cx('tl-mm-callout', `tl-mm-callout--${tone}`, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="tl-mm-callout__icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="tl-mm-callout__body">
        {title && <div className="tl-mm-callout__title">{title}</div>}
        {children && <div className="tl-mm-callout__text">{children}</div>}
      </div>
      {action && <div className="tl-mm-callout__action">{action}</div>}
    </div>
  );
}
