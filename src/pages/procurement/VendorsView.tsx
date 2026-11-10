/**
 * Helix Procurement — Vendor 360 & License Optimization Radar (`VendorsView`).
 * Features strategic vendor cards with <ProjectSigil />, Security & Compliance Rings,
 * SCIM Seat Utilization Bars, 1-click "Reclaim idle seats", and Vendor 360 Inspector.
 */
import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Globe,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoEmpty,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  NovaChip,
  Ring,
  Spark,
  type NeoTabItem,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import { ProjectSigil } from '@/projects/sigils';
import { useHub } from '@/store/hub';
import {
  calculateVendorIdleSeats,
  formatAed,
  formatUsd,
} from '@/procurement/engine';
import { CATEGORY_META } from '@/procurement/seed';
import { useProcurement } from '@/procurement/store';
import type { VendorTier } from '@/procurement/types';

type TierFilter = 'all' | VendorTier;

export function VendorsView() {
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('v-anthropic');

  const users = useHub((s) => s.users);
  const userList = users.length ? users : SEED_USERS;
  const userMap = useMemo(() => new Map(userList.map((u) => [u.id, u])), [userList]);

  const vendors = useProcurement((s) => s.vendors);
  const contracts = useProcurement((s) => s.contracts);
  const requests = useProcurement((s) => s.requests);
  const reclaimVendorSeats = useProcurement((s) => s.reclaimVendorSeats);

  const tabItems = useMemo<NeoTabItem<TierFilter>[]>(() => {
    const countBy = (t: VendorTier) => vendors.filter((v) => v.tier === t).length;
    return [
      { value: 'all', label: 'All Vendors', count: vendors.length },
      { value: 'strategic', label: 'Strategic', count: countBy('strategic') },
      { value: 'preferred', label: 'Preferred', count: countBy('preferred') },
      { value: 'emerging', label: 'Emerging', count: countBy('emerging') },
    ];
  }, [vendors]);

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((v) => {
      if (tierFilter !== 'all' && v.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.tagline.toLowerCase().includes(q) ||
        v.regionResidency.toLowerCase().includes(q) ||
        CATEGORY_META[v.category].label.toLowerCase().includes(q)
      );
    });
  }, [vendors, tierFilter, query]);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === selectedVendorId) ?? filteredVendors[0] ?? null,
    [vendors, selectedVendorId, filteredVendors],
  );

  const totalIdleStats = useMemo(() => {
    let seats = 0;
    let savings = 0;
    for (const v of vendors) {
      const st = calculateVendorIdleSeats(v);
      seats += st.idleSeats;
      savings += st.annualIdleSavingsUsd;
    }
    return { seats, savings };
  }, [vendors]);

  return (
    <div className="pr-stack">
      {/* Toolbar */}
      <div className="pr-toolbar">
        <NeoTabs
          value={tierFilter}
          onChange={setTierFilter}
          items={tabItems}
          label="Filter vendors by strategic tier"
        />
        <div className="pr-toolbar__right">
          <NovaChip>
            {totalIdleStats.seats} Idle Seats · {formatUsd(totalIdleStats.savings)} Reclaimable
          </NovaChip>
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Search vendor, category, residency…"
            className="pr-search-box"
          />
        </div>
      </div>

      {filteredVendors.length === 0 ? (
        <NeoPanel>
          <NeoEmpty
            icon={<Building2 />}
            title="No vendors match your search"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--soft"
                onClick={() => {
                  setTierFilter('all');
                  setQuery('');
                }}
              >
                Show all vendors
              </button>
            }
          />
        </NeoPanel>
      ) : (
        <div className="pr-vendor-layout">
          {/* Left: Vendor Cards Grid */}
          <div className="pr-vendor-grid">
            {filteredVendors.map((vendor) => {
              const cat = CATEGORY_META[vendor.category];
              const owner = userMap.get(vendor.ownerId);
              const { idleSeats, utilizationPct, annualIdleSavingsUsd } =
                calculateVendorIdleSeats(vendor);
              const isSelected = selectedVendor?.id === vendor.id;

              return (
                <article
                  key={vendor.id}
                  className={`pr-vendor-card neo-plane neo-spot ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedVendorId(vendor.id)}
                  data-qa={`pr-vendor-card-${vendor.id}`}
                >
                  <div className="pr-vendor-card__head">
                    <div className="pr-vendor-card__id">
                      <ProjectSigil icon={vendor.sigil} color={vendor.color} size={40} />
                      <div>
                        <div className="pr-eyebrow-row">
                          <Chip
                            tone={
                              vendor.tier === 'strategic'
                                ? 'amber'
                                : vendor.tier === 'preferred'
                                  ? 'emerald'
                                  : 'cyan'
                            }
                            size="sm"
                          >
                            {vendor.tier.toUpperCase()}
                          </Chip>
                          <Chip tone="slate" size="sm">
                            {cat.shortLabel}
                          </Chip>
                          {vendor.daysToRenewal <= 30 && (
                            <Chip tone="rose" size="sm">
                              Renewal in {vendor.daysToRenewal}d
                            </Chip>
                          )}
                        </div>
                        <h3 className="pr-vendor-card__name">{vendor.name}</h3>
                      </div>
                    </div>

                    <Ring
                      value={vendor.securityScore / 100}
                      size={48}
                      stroke={5}
                      color="#10b981"
                      label={`${vendor.name} security score ${vendor.securityScore}%`}
                    >
                      {vendor.securityScore}%
                    </Ring>
                  </div>

                  <p className="pr-vendor-card__tagline">{vendor.tagline}</p>

                  {/* Spend & Sparkline */}
                  <div className="pr-vendor-card__metrics">
                    <div>
                      <div className="pr-hud-label">Annual Contract Spend</div>
                      <div className="pr-vendor-card__spend">
                        {formatUsd(vendor.annualSpendUsd, true)}
                        <span>{formatAed(vendor.annualSpendUsd, true)}</span>
                      </div>
                    </div>
                    <Spark data={vendor.spendTrend} width={96} height={30} color={vendor.color} />
                  </div>

                  {/* Seat Utilization Bar */}
                  <div className="pr-seat-box">
                    <div className="pr-seat-box__head">
                      <span>
                        SCIM Seat Utilization: <b>{vendor.activeSeats}</b> /{' '}
                        {vendor.provisionedSeats} seats ({utilizationPct}%)
                      </span>
                      {idleSeats > 0 ? (
                        <span className="pr-warn-text">{idleSeats} idle (&gt;45d)</span>
                      ) : (
                        <span className="pr-pos">100% Optimized</span>
                      )}
                    </div>
                    <Bar
                      value={utilizationPct / 100}
                      fill={idleSeats > 25 ? '#fbbf24' : '#10b981'}
                      height={7}
                      label={`${vendor.name} seat utilization`}
                    />
                  </div>

                  {/* Compliance Chips */}
                  <div className="pr-compliance-row">
                    {vendor.compliance.map((c) => (
                      <span key={c.framework} className="pr-comp-pill">
                        <ShieldCheck /> {c.framework}
                      </span>
                    ))}
                  </div>

                  {/* Card Footer with 1-Click Reclaim Idle Seats */}
                  <div
                    className="pr-vendor-card__foot"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="pr-vendor-card__owner">
                      {owner && <Avatar user={owner} size={22} />}
                      <span>{owner?.name ?? vendor.ownerId}</span>
                    </div>

                    {idleSeats > 0 ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--plasma"
                        data-qa={`pr-reclaim-${vendor.id}`}
                        onClick={() => reclaimVendorSeats(vendor.id)}
                      >
                        <Zap />
                        <span>
                          Reclaim {idleSeats} Idle Seats (+{formatUsd(annualIdleSavingsUsd, true)})
                        </span>
                      </button>
                    ) : (
                      <span className="pr-reclaimed-tag">
                        <CheckCircle2 />
                        {vendor.reclaimedSeatsCount > 0
                          ? `Reclaimed ${vendor.reclaimedSeatsCount} seats`
                          : 'Zero idle seats'}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Right: Vendor 360 Inspector Drawer / Panel */}
          {selectedVendor && (
            <aside
              className="pr-inspector neo-plane"
              aria-label={`${selectedVendor.name} 360 Inspector`}
              data-qa="pr-vendor-inspector"
            >
              <div className="pr-inspector__head">
                <div className="pr-inspector__title-row">
                  <ProjectSigil
                    icon={selectedVendor.sigil}
                    color={selectedVendor.color}
                    size={46}
                  />
                  <div>
                    <div className="neo-hud">Vendor 360 Telemetry & Trust</div>
                    <h2 className="pr-inspector__title">{selectedVendor.name}</h2>
                    <div className="pr-inspector__sub">
                      {CATEGORY_META[selectedVendor.category].label} · SLA{' '}
                      <b>{selectedVendor.slaUptimePct}%</b>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="neo-iconbtn neo-iconbtn--sm"
                  onClick={() => setSelectedVendorId('')}
                  title="Close inspector"
                  aria-label="Close inspector"
                >
                  <X />
                </button>
              </div>

              {/* Security & Compliance Rings Matrix */}
              <div className="pr-inspector__section">
                <div className="neo-hud">Security & Regulatory Attestations</div>
                <div className="pr-ring-grid">
                  {selectedVendor.compliance.map((badge) => (
                    <div key={badge.framework} className="pr-ring-card">
                      <Ring
                        value={badge.score / 100}
                        size={50}
                        stroke={5}
                        color="#10b981"
                        label={`${badge.framework} ${badge.score}%`}
                      >
                        {badge.score}%
                      </Ring>
                      <div>
                        <div className="pr-ring-card__title">{badge.framework}</div>
                        <div className="pr-ring-card__sub">Valid thru {badge.validUntil}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Residency & Renewal Info */}
              <div className="pr-inspector__section">
                <div className="neo-hud">Sovereign Residency & Commercials</div>
                <div className="pr-kv-list">
                  <div className="pr-kv-row">
                    <span>
                      <Globe /> Data Residency
                    </span>
                    <strong>{selectedVendor.regionResidency}</strong>
                  </div>
                  <div className="pr-kv-row">
                    <span>
                      <Calendar /> Next Renewal Date
                    </span>
                    <strong>
                      {selectedVendor.renewalDate} ({selectedVendor.daysToRenewal}d ·{' '}
                      {selectedVendor.noticeWindowDays}d notice)
                    </strong>
                  </div>
                  <div className="pr-kv-row">
                    <span>
                      <Sparkles /> Contracted Unit Rate
                    </span>
                    <strong>{formatUsd(selectedVendor.unitCostPerSeatUsd)} / seat / yr</strong>
                  </div>
                  <div className="pr-kv-row">
                    <span>
                      <UserCheck /> Account Partner
                    </span>
                    <strong>
                      {selectedVendor.primaryContact.name} ({selectedVendor.primaryContact.role})
                    </strong>
                  </div>
                  <div className="pr-kv-row">
                    <span>
                      <Mail /> Escalation Desk
                    </span>
                    <strong>{selectedVendor.primaryContact.email}</strong>
                  </div>
                </div>
              </div>

              {/* Active Contracts & Requisitions for Selected Vendor */}
              <div className="pr-inspector__section">
                <div className="neo-hud">Linked Contracts & Active Requisitions</div>
                <div className="pr-linked-list">
                  {contracts
                    .filter((c) => c.vendorId === selectedVendor.id)
                    .map((c) => (
                      <div key={c.id} className="pr-linked-item">
                        <div className="pr-linked-item__top">
                          <span className="pr-mono-id">{c.id}</span>
                          <Chip
                            tone={c.counterOfferApplied ? 'emerald' : 'amber'}
                            size="sm"
                          >
                            {c.counterOfferApplied ? 'Counter Locked' : `${c.daysUntilCliff}d to Cliff`}
                          </Chip>
                        </div>
                        <div className="pr-linked-item__title">{c.title}</div>
                        <div className="pr-linked-item__meta">
                          Annual Value: <b>{formatUsd(c.annualValueUsd)}</b> · Uplift Cap:{' '}
                          <b>{c.upliftCapPct}%</b>
                        </div>
                      </div>
                    ))}
                  {requests
                    .filter((r) => r.vendorId === selectedVendor.id)
                    .map((r) => (
                      <div key={r.id} className="pr-linked-item">
                        <div className="pr-linked-item__top">
                          <span className="pr-mono-id">{r.id}</span>
                          <Chip tone="cyan" size="sm">
                            {r.status.replace('_', ' ')}
                          </Chip>
                        </div>
                        <div className="pr-linked-item__title">{r.title}</div>
                        <div className="pr-linked-item__meta">
                          Negotiated: <b>{formatUsd(r.negotiatedAnnualUsd)}</b> ({r.quantity}{' '}
                          {r.unitLabel})
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Action Button inside Inspector */}
              {calculateVendorIdleSeats(selectedVendor).idleSeats > 0 && (
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma pr-full-btn"
                  onClick={() => reclaimVendorSeats(selectedVendor.id)}
                >
                  <BadgeCheck />
                  <span>
                    Reclaim {calculateVendorIdleSeats(selectedVendor).idleSeats} Unused Licenses (+
                    {formatUsd(calculateVendorIdleSeats(selectedVendor).annualIdleSavingsUsd)}/yr)
                  </span>
                </button>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
