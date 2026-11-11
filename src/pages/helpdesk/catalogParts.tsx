/**
 * Catalog atoms: item visual, eligibility badge and the price/ETA line.
 * (The approval route — Requested → Manager → IT → Security → Delivered — is
 * drawn by `RequestTracker` in `trackers.tsx`.)
 */
import { Check, Clock3, ShieldCheck, Wrench, X } from 'lucide-react';
import type { CatalogItem } from '@/helpdesk/types';
import type { Eligibility } from '@/helpdesk/eligibility';
import { formatMoney } from '@/helpdesk/meta';
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
