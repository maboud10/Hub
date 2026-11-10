/**
 * Shared HR Portal building blocks used across Home, Time off, Benefits,
 * Documents, Approvals and People Ops.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, EyeOff } from 'lucide-react';
import type { LeaveTypeId } from '@/hr/types';
import { LEAVE_TYPE_BY_ID } from '@/hr/constants';
import type { LeaveBalance } from '@/hr/engine';
import { formatDays } from '@/hr/calendar';
import { useUserById } from '@/store/selectors';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { formatMoney } from '@/pages/talent/components/format';

export { ToneBadge, type Tone } from '@/pages/talent/components/shared';

/** Leave type chip; `hidden` renders a neutral "Away" (privacy for peers). */
export function LeaveTypeBadge({ type, hidden = false, size = 'sm' }: { type?: LeaveTypeId; hidden?: boolean; size?: 'sm' | 'md' }) {
  if (!type || hidden)
    return (
      <span className={cx('hr-leave-badge', 'hr-leave-badge--away', size === 'md' && 'hr-leave-badge--md')} style={{ '--lt-h': 220 } as CSSProperties} title="Details are private">
        <EyeOff aria-hidden="true" /> Away
      </span>
    );
  const m = LEAVE_TYPE_BY_ID[type];
  const Icon = m.icon;
  return (
    <span className={cx('hr-leave-badge', size === 'md' && 'hr-leave-badge--md')} style={{ '--lt-h': m.hue } as CSSProperties}>
      <Icon aria-hidden="true" /> {m.short}
    </span>
  );
}

/** Circular balance meter: available of entitled (unlimited types show "Flexible"). */
export function BalanceRing({ balance, size = 92, label = true }: { balance: LeaveBalance; size?: number; label?: boolean }) {
  const m = LEAVE_TYPE_BY_ID[balance.type];
  const Icon = m.icon;
  const entitled = balance.entitled ?? 0;
  const available = balance.available ?? 0;
  const used = balance.taken + balance.booked;
  const stroke = Math.max(5, Math.round(size / 13));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = entitled > 0 ? Math.max(0, Math.min(1, available / entitled)) : balance.entitled === null ? 1 : 0;
  const pendingPct = entitled > 0 ? Math.min(1 - pct, balance.pending / entitled) : 0;
  return (
    <div className="hr-ring" style={{ '--size': `${size}px`, '--lt-h': m.hue } as CSSProperties} role="img" aria-label={balance.entitled === null ? `${m.label}: no fixed allowance` : `${m.label}: ${available} of ${entitled} days available`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {pendingPct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="hr-ring__pending"
            strokeWidth={stroke}
            strokeDasharray={`${c * pendingPct} ${c}`}
            strokeDashoffset={-c * pct}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="hr-ring__fill" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="hr-ring__center">
        <Icon aria-hidden="true" />
        <b>{balance.entitled === null ? '∞' : Number.isInteger(available) ? available : available.toFixed(1)}</b>
        {label && <small>{balance.entitled === null ? 'flexible' : `of ${entitled}`}</small>}
      </div>
      <span className="sr-only">
        {used ? `${formatDays(used)} used. ` : ''}
        {balance.pending ? `${formatDays(balance.pending)} pending.` : ''}
      </span>
    </div>
  );
}

/** Avatar + name + secondary line for a NEXUS colleague. */
export function UserLine({ userId, sub, size = 32, right }: { userId: string | undefined; sub?: ReactNode; size?: number; right?: ReactNode }) {
  const u = useUserById(userId);
  if (!u) return <span className="faint text-sm">Unknown</span>;
  return (
    <span className="hr-user-line">
      <Avatar user={u} size={size} />
      <span className="hr-user-line__text">
        <span className="hr-user-line__name truncate">{u.name}</span>
        <span className="hr-user-line__sub truncate">{sub ?? `${u.title} · ${u.department}`}</span>
      </span>
      {right}
    </span>
  );
}

export function Money({ amount, currency, compact }: { amount: number; currency: string; compact?: boolean }) {
  return <span className="hr-money">{formatMoney(amount, currency, { compact })}</span>;
}

/**
 * Section card in the NEO panel anatomy (same markup as `NeoPanel`): a mono
 * HUD eyebrow (`hud`, 2–3 words), a sentence-case `title`, an optional
 * one-line `sub` and right-aligned `actions` (e.g. `<AllLink />`).
 */
export function HrPanel({
  hud,
  title,
  sub,
  actions,
  children,
  className,
  id,
  flush,
  labelledBy,
}: {
  hud?: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  /** No inner padding (edge-to-edge lists and tables). */
  flush?: boolean;
  /** Id for the title, so the section can be labelled by it. */
  labelledBy?: string;
  /** @deprecated Panels follow the Support Deck anatomy (no icon tile); the prop is ignored. */
  icon?: ReactNode;
}) {
  return (
    <section className={cx('neo-panel hr-panel', flush && 'neo-panel--flush', className)} id={id} aria-labelledby={title && labelledBy ? labelledBy : undefined}>
      {(hud || title || sub || actions) && (
        <header className="neo-panel__head hr-panel__head">
          <div className="neo-panel__titles">
            {hud && <div className="neo-hud">{hud}</div>}
            {title && (
              <h2 className="neo-panel__title" id={labelledBy}>
                {title}
              </h2>
            )}
            {sub && <p className="hr-panel__sub">{sub}</p>}
          </div>
          {actions && <div className="neo-panel__actions hr-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** The panel-header "All →" link (ghost, extra small). */
export function AllLink({ to, children = 'All', label }: { to: string; children?: ReactNode; label?: string }) {
  return (
    <Link to={to} className="neo-btn neo-btn--ghost neo-btn--xs" aria-label={label}>
      {children} <ArrowRight aria-hidden="true" />
    </Link>
  );
}
