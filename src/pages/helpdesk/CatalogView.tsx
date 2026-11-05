import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  Cpu,
  Headphones,
  KeyRound,
  Laptop,
  Monitor,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { useHelpdesk } from '@/helpdesk/store';
import type { CatalogItemCategory } from '@/helpdesk/types';
import { DeviceTagChip, formatUsd } from './shared';

const CATALOG_CAT_LABELS: Record<CatalogItemCategory | 'all', string> = {
  all: 'All Catalog',
  monitor: 'Displays',
  peripheral: 'Peripherals & Audio',
  security_key: 'Security Keys',
  ergonomics: 'Ergonomics',
  software_license: 'Software & AI Seats',
  network_access: 'Network & VPN',
  laptop: 'Workstations',
};

export function CatalogView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const catalog = useHelpdesk((s) => s.catalog);
  const requestCatalogItem = useHelpdesk((s) => s.requestCatalogItem);

  const [catFilter, setCatFilter] = useState<CatalogItemCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [requestedIds, setRequestedIds] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return catalog.filter((item) => {
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.vendor.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalog, catFilter, query]);

  const handleRequest = (itemId: string) => {
    const res = requestCatalogItem(itemId, { requesterId: me?.id ?? 'u-mei' });
    if (toast.result(res) && res.ticket) {
      setRequestedIds((prev) => ({ ...prev, [itemId]: res.ticket!.id }));
    }
  };

  return (
    <div className="hd-catalog-view">
      <div className="hd-catalog-head">
        <div>
          <div className="hd-panel__eyebrow">ZERO-TOUCH HARDWARE & SAAS PROVISIONING</div>
          <h3 className="hd-panel__title">
            <Package size={18} /> IT Hardware & Software Request Catalog ({catalog.length} curated items)
          </h3>
          <p className="text-xs muted">
            Pre-approved peripherals, FIDO2 keys, and SCIM-provisioned software licenses create an automated SLA fulfillment ticket in 1 click.
          </p>
        </div>

        <div className="hd-search-box hd-search-box--wide">
          <Search size={14} />
          <input
            type="search"
            placeholder="Search Studio Display, Keychron, YubiKey, Claude Code, Figma…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="hd-filter-pills">
        {(['all', 'monitor', 'peripheral', 'security_key', 'ergonomics', 'software_license', 'network_access'] as const).map(
          (c) => (
            <button
              key={c}
              type="button"
              className={cx('hd-filter-pill', catFilter === c && 'is-active')}
              onClick={() => setCatFilter(c)}
            >
              {CATALOG_CAT_LABELS[c]}
            </button>
          ),
        )}
      </div>

      <div className="hd-catalog-grid">
        {filtered.map((item) => {
          const ticketId = requestedIds[item.id];
          const Icon =
            item.category === 'monitor'
              ? Monitor
              : item.category === 'security_key'
                ? KeyRound
                : item.category === 'software_license'
                  ? Cpu
                  : item.category === 'peripheral'
                    ? Headphones
                    : Laptop;

          const priceSuffix =
            item.billingModel === 'monthly_seat'
              ? '/mo'
              : item.billingModel === 'annual_seat'
                ? '/yr'
                : ' one-time';

          return (
            <article key={item.id} className="hd-catalog-card">
              <div className="hd-catalog-card__top">
                <span className="hd-catalog-card__icon">
                  <Icon size={18} />
                </span>
                <div className="grow min-w-0">
                  <div className="hd-catalog-card__vendor text-xs muted">
                    {item.vendor} · {item.specsOrTier}
                  </div>
                  <h4 className="hd-catalog-card__name">{item.name}</h4>
                </div>
                {item.popular && <span className="hd-pill hd-pill--info">Popular</span>}
              </div>

              <p className="hd-catalog-card__desc text-sm">{item.summary}</p>

              <div className="hd-tag-list">
                {item.recommendedTags.map((tag) => (
                  <DeviceTagChip
                    key={tag}
                    tag={tag}
                    onClick={() => navigate(`/helpdesk/inventory?tag=${tag}`)}
                  />
                ))}
              </div>

              <div className="hd-catalog-card__meta">
                <div>
                  <span className="text-xs muted block">Cost & Billing</span>
                  <strong>
                    {formatUsd(item.costUsd)}
                    <span className="text-xs muted">{priceSuffix}</span>
                  </strong>
                </div>
                <div>
                  <span className="text-xs muted block">Fulfillment SLA</span>
                  <strong className="text-xs">{item.deliverySla}</strong>
                </div>
                <div>
                  <span className="text-xs muted block">Approval Policy</span>
                  <span
                    className={cx(
                      'hd-pill',
                      item.requiresManagerApproval ? 'hd-pill--warning' : 'hd-pill--success',
                    )}
                  >
                    {item.requiresManagerApproval ? 'Manager Approval' : 'Auto-Approved'}
                  </span>
                </div>
              </div>

              <div className="hd-catalog-card__foot">
                <span className="text-xs muted">
                  <ShieldCheck size={12} />{' '}
                  {item.billingModel === 'one_time'
                    ? `${item.inStockCount} in depot stock`
                    : 'SCIM pool active'}
                </span>

                {ticketId ? (
                  <button
                    type="button"
                    className="btn btn--xs btn--ghost"
                    onClick={() => navigate(`/helpdesk/tickets?ticket=${ticketId}`)}
                  >
                    <CheckCircle2 size={13} className="text-success" /> View Ticket →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--xs btn--primary"
                    onClick={() => handleRequest(item.id)}
                  >
                    <Sparkles size={13} /> Request Item
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
