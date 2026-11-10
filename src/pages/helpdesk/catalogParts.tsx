/**
 * Catalog atoms: item visual, eligibility badge, price/ETA line and the
 * approval stepper (Submitted → Manager → IT → Security → Delivered).
 */
import { Check, Clock3, PackageCheck, Send, ShieldCheck, UserCheck, Wrench, X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useHub } from '@/store/hub';
import type { ApprovalStep, CatalogItem, CatalogRequest } from '@/helpdesk/types';
import type { Eligibility } from '@/helpdesk/eligibility';
import { formatMoney } from '@/helpdesk/meta';
import { firstNameOf } from '@/helpdesk/util';
import { DeviceGlyph } from './glyphs';
import { CATALOG_ICON } from './icons';

export function ItemVisual({ item, size = 64 }: { item: CatalogItem; size?: number }) {
  if (item.kind === 'hardware' && item.deviceKind)
    return (
      <span className="hd-itemvis hd-itemvis--hw" style={{ ['--accent' as string]: item.accent, width: size * 1.5, height: size }}>
        <DeviceGlyph kind={item.deviceKind} size={size * 1.35} />
      </span>
    );
  const Icon = CATALOG_ICON[item.icon ?? ''] ?? Wrench;
  return (
    <span className="hd-itemvis" style={{ ['--accent' as string]: item.accent, width: size, height: size }}>
      <Icon />
    </span>
  );
}

export const priceLabel = (item: CatalogItem) => (item.billing === 'free' || item.cost === 0 ? 'Free' : `${formatMoney(item.cost)}${item.billing === 'yearly' ? '/yr' : ''}`);
export const etaLabel = (item: CatalogItem) => (item.etaDays === 0 ? 'Instant' : item.etaDays === 1 ? 'Next day' : `${item.etaDays} days`);

export function EligibilityBadge({ e, item }: { e: Eligibility; item: CatalogItem }) {
  if (e.status === 'ineligible')
    return (
      <span className="hd-elig" data-s="no" title={e.reasons[0]}>
        <X /> Not available
      </span>
    );
  if (item.sensitive)
    return (
      <span className="hd-elig" data-s="sens" title={e.reasons.join(' ')}>
        <ShieldCheck /> 3 approvals
      </span>
    );
  if (e.status === 'conditional')
    return (
      <span className="hd-elig" data-s="cond" title={e.reasons[0]}>
        <Clock3 /> Needs a reason
      </span>
    );
  return (
    <span className="hd-elig" data-s="ok">
      <Check /> Eligible
    </span>
  );
}

const ROLE_ICON = { manager: UserCheck, it: Wrench, security: ShieldCheck } as const;
const ROLE_NAME = { manager: 'Manager', it: 'IT', security: 'Security' } as const;

/** Horizontal approval stepper. Works for live requests and previews. */
export function ApprovalStepper({ steps, status, createdAt, fulfilledAt, compact }: { steps: ApprovalStep[]; status?: CatalogRequest['status']; createdAt?: number; fulfilledAt?: number; compact?: boolean }) {
  const users = useHub((s) => s.users);
  const name = (id?: string) => users.find((u) => u.id === id)?.name;
  const nodes: { key: string; label: string; sub?: string; state: 'done' | 'active' | 'todo' | 'denied' | 'skipped'; icon: typeof Check }[] = [
    { key: 'sub', label: 'Submitted', sub: createdAt ? relativeTime(createdAt) : 'You', state: 'done', icon: Send },
    ...steps.map((s, i) => ({
      key: `${s.role}-${i}`,
      label: s.role === 'manager' && s.approverId ? firstNameOf(name(s.approverId)) || ROLE_NAME.manager : ROLE_NAME[s.role],
      sub:
        s.state === 'approved'
          ? `Approved${s.decidedAt ? ` · ${relativeTime(s.decidedAt)}` : ''}`
          : s.state === 'denied'
            ? 'Declined'
            : s.state === 'pending'
              ? 'Reviewing'
              : s.state === 'skipped'
                ? 'Skipped'
                : s.role === 'manager'
                  ? 'Manager'
                  : 'Next',
      state: (s.state === 'approved' ? 'done' : s.state === 'pending' ? 'active' : s.state === 'denied' ? 'denied' : s.state === 'skipped' ? 'skipped' : 'todo') as 'done',
      icon: ROLE_ICON[s.role],
    })),
    {
      key: 'done',
      label: 'Delivered',
      sub: status === 'fulfilled' ? (fulfilledAt ? relativeTime(fulfilledAt) : 'Done') : status === 'approved' ? 'With IT' : status === 'denied' || status === 'cancelled' ? '—' : 'Last step',
      state: status === 'fulfilled' ? 'done' : status === 'approved' ? 'active' : 'todo',
      icon: PackageCheck,
    },
  ];
  return (
    <ol className={cx('hd-steps', compact && 'hd-steps--compact')} data-status={status}>
      {nodes.map((n) => {
        const Icon = n.state === 'denied' ? X : n.state === 'done' ? Check : n.icon;
        return (
          <li key={n.key} className="hd-step" data-state={n.state}>
            <span className="hd-step__dot">
              <Icon />
            </span>
            <span className="hd-step__text">
              <b>{n.label}</b>
              {!compact && n.sub && <span>{n.sub}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
