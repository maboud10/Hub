import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Filter,
  LayoutGrid,
  List,
  Package,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Tag,
  UserCheck,
  UserMinus,
  X,
  Zap,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PRESET_DEVICE_TAGS, getTagMeta } from '@/helpdesk/seed';
import { useHelpdesk } from '@/helpdesk/store';
import type {
  CompliancePosture,
  DeviceCategory,
  DeviceLocation,
  DeviceStatus,
} from '@/helpdesk/types';
import {
  AssetTagBadge,
  COMPLIANCE_META,
  DEVICE_CATEGORY_META,
  DEVICE_LOCATIONS,
  DEVICE_STATUS_META,
  DeviceTagChip,
  formatUsd,
} from './shared';

export function InventoryView({
  onInspectDevice,
  onOpenRegisterModal,
}: {
  onInspectDevice: (deviceId: string) => void;
  onOpenRegisterModal: () => void;
}) {
  const users = useHub((s) => s.users);
  const devices = useHelpdesk((s) => s.devices);
  const assignDevice = useHelpdesk((s) => s.assignDevice);
  const unassignDevice = useHelpdesk((s) => s.unassignDevice);
  const addDeviceTag = useHelpdesk((s) => s.addDeviceTag);
  const removeDeviceTag = useHelpdesk((s) => s.removeDeviceTag);
  const runMdmCommand = useHelpdesk((s) => s.runMdmCommand);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTagParam = searchParams.get('tag') || 'all';

  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<DeviceCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'all'>('all');
  const [compFilter, setCompFilter] = useState<CompliancePosture | 'all'>('all');
  const [locFilter, setLocFilter] = useState<DeviceLocation | 'all'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Inline tag adder state per deviceId
  const [addingTagForId, setAddingTagForId] = useState<string | null>(null);
  const [inlineTagValue, setInlineTagValue] = useState('');

  // Inline quick-assign state per deviceId
  const [assigningForId, setAssigningForId] = useState<string | null>(null);
  const [inlineUserId, setInlineUserId] = useState<string>('u-mei');

  const setActiveTag = (tag: string) => {
    const next = new URLSearchParams(searchParams);
    if (tag === 'all' || tag === activeTagParam) {
      next.delete('tag');
    } else {
      next.set('tag', tag);
    }
    setSearchParams(next, { replace: true });
  };

  // Compute Fleet KPIs
  const stats = useMemo(() => {
    const totalValue = devices.reduce((sum, d) => sum + d.costUsd, 0);
    const assigned = devices.filter((d) => d.status === 'assigned').length;
    const inStock = devices.filter((d) => d.status === 'in_stock').length;
    const inRepair = devices.filter(
      (d) => d.status === 'in_repair' || d.status === 'pending_return',
    ).length;
    const compliant = devices.filter((d) => d.compliance === 'compliant').length;
    const compliancePct = devices.length
      ? Math.round((compliant / devices.length) * 100)
      : 100;
    const totalTagsApplied = devices.reduce((sum, d) => sum + d.tags.length, 0);
    const uniqueTags = new Set(devices.flatMap((d) => d.tags)).size;

    return {
      totalValue,
      assigned,
      inStock,
      inRepair,
      compliancePct,
      totalTagsApplied,
      uniqueTags,
    };
  }, [devices]);

  // Compute Tag Matrix (count + departments + sample users per tag)
  const tagMatrix = useMemo(() => {
    const allTagNames = Array.from(
      new Set([...PRESET_DEVICE_TAGS.map((p) => p.tag), ...devices.flatMap((d) => d.tags)]),
    );
    return allTagNames.map((tag) => {
      const meta = getTagMeta(tag);
      const matchingDevices = devices.filter((d) => d.tags.includes(tag));
      const uniqueHolderIds = Array.from(new Set(matchingDevices.map((d) => d.assignedToUserId).filter(Boolean)));
      const holders = uniqueHolderIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => Boolean(u));
      const depts = Array.from(new Set(holders.map((u) => u.department)));
      return {
        ...meta,
        count: matchingDevices.length,
        holders,
        depts,
      };
    });
  }, [devices, users]);

  // Filtered inventory list
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (activeTagParam !== 'all' && !d.tags.includes(activeTagParam)) return false;
      if (catFilter !== 'all' && d.category !== catFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (compFilter !== 'all' && d.compliance !== compFilter) return false;
      if (locFilter !== 'all' && d.location !== locFilter) return false;
      if (userFilter === 'unassigned' && d.assignedToUserId) return false;
      if (
        userFilter !== 'all' &&
        userFilter !== 'unassigned' &&
        d.assignedToUserId !== userFilter
      )
        return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const holder = users.find((u) => u.id === d.assignedToUserId);
        const match =
          d.assetTag.toLowerCase().includes(q) ||
          d.serialNumber.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.location.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          (holder &&
            (holder.name.toLowerCase().includes(q) ||
              holder.department.toLowerCase().includes(q) ||
              holder.employeeId.toLowerCase().includes(q)));
        if (!match) return false;
      }
      return true;
    });
  }, [
    devices,
    activeTagParam,
    catFilter,
    statusFilter,
    compFilter,
    locFilter,
    userFilter,
    query,
    users,
  ]);

  const clearAllFilters = () => {
    setQuery('');
    setCatFilter('all');
    setStatusFilter('all');
    setCompFilter('all');
    setLocFilter('all');
    setUserFilter('all');
    setActiveTag('all');
  };

  const hasActiveFilters =
    Boolean(query.trim()) ||
    catFilter !== 'all' ||
    statusFilter !== 'all' ||
    compFilter !== 'all' ||
    locFilter !== 'all' ||
    userFilter !== 'all' ||
    activeTagParam !== 'all';

  return (
    <div className="hd-inventory-view">
      {/* 1. Fleet Summary KPI Cards */}
      <div className="hd-kpi-grid">
        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">TOTAL HARDWARE FLEET</div>
          <div className="hd-kpi-card__value">{devices.length} Assets</div>
          <div className="hd-kpi-card__sub">
            Valuation <strong>{formatUsd(stats.totalValue)}</strong> across 6 hubs
          </div>
        </div>

        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">CUSTODY BREAKDOWN</div>
          <div className="hd-kpi-card__value">
            {stats.assigned} Assigned · {stats.inStock} Stock
          </div>
          <div className="hd-kpi-card__sub">
            {stats.inRepair} in repair / pending return
          </div>
        </div>

        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">ZERO-TRUST MDM POSTURE</div>
          <div className="hd-kpi-card__value text-success">{stats.compliancePct}% Compliant</div>
          <div className="hd-kpi-card__sub">
            FileVault escrowed & CrowdStrike sensor active
          </div>
        </div>

        <div className="hd-kpi-card">
          <div className="hd-kpi-card__eyebrow">ASSET TAG TAXONOMY</div>
          <div className="hd-kpi-card__value">{stats.uniqueTags} Active Tags</div>
          <div className="hd-kpi-card__sub">
            {stats.totalTagsApplied} tag bindings tracking fleet lifecycle
          </div>
        </div>
      </div>

      {/* 2. Interactive Asset Tag Cloud & Custody Matrix */}
      <section className="hd-panel hd-tag-explorer">
        <div className="hd-panel__head">
          <div>
            <div className="hd-panel__eyebrow">CLICK ANY TAG TO FILTER FLEET & INSPECT HOLDERS</div>
            <h3 className="hd-panel__title">
              <Tag size={17} /> Asset Tag Cloud & Department Custody Matrix
            </h3>
          </div>
          <div className="hd-panel__actions">
            {activeTagParam !== 'all' && (
              <button
                type="button"
                className="btn btn--xs btn--ghost"
                onClick={() => setActiveTag('all')}
              >
                <X size={12} /> Clear #{activeTagParam} filter
              </button>
            )}
            <button
              type="button"
              className="btn btn--xs btn--primary"
              onClick={onOpenRegisterModal}
            >
              <Plus size={13} /> Register New Device
            </button>
          </div>
        </div>

        <div className="hd-tag-matrix-grid">
          {tagMatrix.map((tm) => {
            const isSelected = activeTagParam === tm.tag;
            return (
              <button
                key={tm.tag}
                type="button"
                className={cx('hd-tag-matrix-card', isSelected && 'is-selected')}
                style={{ '--tag-color': tm.color } as React.CSSProperties}
                onClick={() => setActiveTag(tm.tag)}
              >
                <div className="hd-tag-matrix-card__top">
                  <span className="hd-tag-matrix-card__label">
                    <i className="hd-tag-chip__dot" />
                    {tm.label}
                  </span>
                  <span className="hd-tag-matrix-card__count">
                    {tm.count} {tm.count === 1 ? 'device' : 'devices'}
                  </span>
                </div>
                <p className="hd-tag-matrix-card__desc text-xs muted">{tm.description}</p>
                <div className="hd-tag-matrix-card__foot">
                  <div className="hd-avatar-stack">
                    {tm.holders.slice(0, 4).map((u) => (
                      <Avatar key={u.id} user={u} size={20} />
                    ))}
                  </div>
                  <span className="text-xs muted truncate">
                    {tm.depts.length > 0 ? tm.depts.join(', ') : 'In Stock Depot'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Rich Filter & Search Bar */}
      <section className="hd-panel">
        <div className="hd-inv-toolbar">
          <div className="hd-search-box grow">
            <Search size={14} />
            <input
              type="search"
              aria-label="Search fleet inventory"
              placeholder="Search Asset Tag (HX-MAC-0102), Serial Number, Model, Assigned User, or #tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select
            className="input input--sm"
            aria-label="Filter by Category"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as DeviceCategory | 'all')}
          >
            <option value="all">All Categories</option>
            {(Object.keys(DEVICE_CATEGORY_META) as DeviceCategory[]).map((c) => (
              <option key={c} value={c}>
                {DEVICE_CATEGORY_META[c].label}
              </option>
            ))}
          </select>

          <select
            className="input input--sm"
            aria-label="Filter by Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeviceStatus | 'all')}
          >
            <option value="all">All Statuses</option>
            {(Object.keys(DEVICE_STATUS_META) as DeviceStatus[]).map((s) => (
              <option key={s} value={s}>
                {DEVICE_STATUS_META[s].label}
              </option>
            ))}
          </select>

          <select
            className="input input--sm"
            aria-label="Filter by Compliance"
            value={compFilter}
            onChange={(e) => setCompFilter(e.target.value as CompliancePosture | 'all')}
          >
            <option value="all">All MDM Posture</option>
            <option value="compliant">MDM Compliant</option>
            <option value="patch_required">Patch Required</option>
            <option value="non_compliant">Non-Compliant</option>
          </select>

          <select
            className="input input--sm"
            aria-label="Filter by Location"
            value={locFilter}
            onChange={(e) => setLocFilter(e.target.value as DeviceLocation | 'all')}
          >
            <option value="all">All Hub Locations</option>
            {DEVICE_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>

          <select
            className="input input--sm"
            aria-label="Filter by Assigned User"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            <option value="all">All Users & Depot</option>
            <option value="unassigned">★ Unassigned / In Stock Depot</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.department})
              </option>
            ))}
          </select>

          <div className="hd-view-toggle" role="group" aria-label="Inventory layout">
            <button
              type="button"
              className={cx('icon-btn icon-btn--sm', viewMode === 'table' && 'is-active')}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              className={cx('icon-btn icon-btn--sm', viewMode === 'grid' && 'is-active')}
              onClick={() => setViewMode('grid')}
              title="Sticker Card Grid View"
            >
              <LayoutGrid size={15} />
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={clearAllFilters}
            >
              <Filter size={12} /> Reset ({filteredDevices.length}/{devices.length})
            </button>
          )}
        </div>

        {/* 4A. Table View */}
        {viewMode === 'table' ? (
          <div className="hd-table-wrap">
            <table className="hd-inv-table">
              <thead>
                <tr>
                  <th>Asset Tag & Hardware</th>
                  <th>Assigned User / Custody</th>
                  <th>Fleet Asset Tags</th>
                  <th>MDM & Security Posture</th>
                  <th>Hub & Warranty</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((dev) => {
                  const holder = users.find((u) => u.id === dev.assignedToUserId);
                  const statusMeta = DEVICE_STATUS_META[dev.status];
                  const compMeta = COMPLIANCE_META[dev.compliance];
                  const CompIcon = compMeta.icon;
                  const isAddingTag = addingTagForId === dev.id;
                  const isQuickAssigning = assigningForId === dev.id;

                  return (
                    <tr key={dev.id} className="hd-inv-row">
                      {/* Column 1: Asset Tag Badge + Model + Specs */}
                      <td>
                        <div className="hd-inv-asset-cell">
                          <div className="hd-inv-asset-cell__top">
                            <AssetTagBadge
                              assetTag={dev.assetTag}
                              category={dev.category}
                              onClick={() => onInspectDevice(dev.id)}
                            />
                            <span className={cx('hd-pill', `hd-pill--${statusMeta.tone}`)}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="hd-inv-asset-cell__name"
                            onClick={() => onInspectDevice(dev.id)}
                          >
                            {dev.name}
                          </button>
                          <div className="text-xs muted">
                            {dev.model}
                            {dev.specs.cpu ? ` · ${dev.specs.cpu}` : ''}
                            {dev.specs.ram ? ` · ${dev.specs.ram}` : ''} · S/N{' '}
                            <span className="mono">{dev.serialNumber}</span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Assigned User or In-Stock Quick Assign */}
                      <td>
                        {holder ? (
                          <div className="hd-inv-user-cell">
                            <Avatar user={holder} size={30} presence />
                            <div className="min-w-0">
                              <div className="hd-inv-user-cell__name">{holder.name}</div>
                              <div className="text-xs muted">
                                {holder.department} · {holder.employeeId}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="icon-btn icon-btn--xs ml-auto"
                              title="Unassign / Return to Stock Depot"
                              onClick={() => {
                                const res = unassignDevice(dev.id);
                                toast.result(res);
                              }}
                            >
                              <UserMinus size={13} />
                            </button>
                          </div>
                        ) : isQuickAssigning ? (
                          <div className="hd-inline-assign">
                            <select
                              className="input input--sm"
                              aria-label={`Select user for ${dev.assetTag}`}
                              value={inlineUserId}
                              onChange={(e) => setInlineUserId(e.target.value)}
                            >
                              {users
                                .filter((u) => u.active)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.department})
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn--xs btn--primary"
                              onClick={() => {
                                const res = assignDevice(dev.id, inlineUserId);
                                if (toast.result(res)) setAssigningForId(null);
                              }}
                            >
                              Assign
                            </button>
                            <button
                              type="button"
                              className="btn btn--xs btn--ghost"
                              onClick={() => setAssigningForId(null)}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="hd-inv-stock-cell">
                            <span className="text-xs muted block">
                              <Package size={12} /> In Stock · {dev.location}
                            </span>
                            <button
                              type="button"
                              className="btn btn--xs btn--ghost"
                              onClick={() => {
                                setAssigningForId(dev.id);
                                setInlineUserId('u-mei');
                              }}
                            >
                              <UserCheck size={12} /> Assign to User
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Column 3: Custom Asset Tags with Inline + Tag and × Remove */}
                      <td>
                        <div className="hd-tag-list">
                          {dev.tags.map((t) => (
                            <DeviceTagChip
                              key={t}
                              tag={t}
                              active={activeTagParam === t}
                              onClick={() => setActiveTag(t)}
                              onRemove={() => {
                                const res = removeDeviceTag(dev.id, t);
                                toast.result(res);
                              }}
                            />
                          ))}

                          {isAddingTag ? (
                            <form
                              className="hd-inline-tag-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!inlineTagValue.trim()) return;
                                const res = addDeviceTag(dev.id, inlineTagValue);
                                if (toast.result(res)) {
                                  setInlineTagValue('');
                                  setAddingTagForId(null);
                                }
                              }}
                            >
                              <input
                                type="text"
                                className="input input--xs"
                                placeholder="#tag-name"
                                value={inlineTagValue}
                                onChange={(e) => setInlineTagValue(e.target.value)}
                                autoFocus
                              />
                              <button type="submit" className="btn btn--xs btn--primary">
                                +
                              </button>
                              <button
                                type="button"
                                className="btn btn--xs btn--ghost"
                                onClick={() => setAddingTagForId(null)}
                              >
                                ×
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              className="hd-add-tag-btn"
                              onClick={() => {
                                setAddingTagForId(dev.id);
                                setInlineTagValue('');
                              }}
                              title="Add custom asset tag"
                            >
                              + Tag
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Column 4: MDM & Security Posture */}
                      <td>
                        <div className="hd-inv-mdm-cell">
                          <span className={cx('hd-pill', `hd-pill--${compMeta.tone}`)}>
                            <CompIcon size={12} /> {compMeta.label}
                          </span>
                          <div className="text-xs muted">
                            {dev.encrypted ? 'FV2/BitLocker' : 'Unencrypted'} ·{' '}
                            {dev.edrActive ? 'EDR Active' : 'EDR Off'} ·{' '}
                            {relativeTime(dev.lastCheckInAt)}
                          </div>
                        </div>
                      </td>

                      {/* Column 5: Location & Cost / Warranty */}
                      <td>
                        <div className="text-sm">{dev.location}</div>
                        <div className="text-xs muted">
                          {formatUsd(dev.costUsd)} · Warranty {dev.warrantyUntil.slice(0, 4)}
                        </div>
                      </td>

                      {/* Column 6: Actions */}
                      <td className="text-right">
                        <div className="hd-inv-row-actions">
                          {dev.compliance === 'patch_required' && (
                            <button
                              type="button"
                              className="btn btn--xs btn--primary"
                              onClick={() => {
                                const res = runMdmCommand(dev.id, 'push_os_patch');
                                toast.result(res);
                              }}
                              title="Push OS Security Patch via MDM"
                            >
                              <Zap size={12} /> Patch
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--xs btn--ghost"
                            onClick={() => onInspectDevice(dev.id)}
                          >
                            <QrCode size={13} /> Inspect & Tag
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* 4B. Grid View */
          <div className="hd-inv-cards-grid">
            {filteredDevices.map((dev) => {
              const holder = users.find((u) => u.id === dev.assignedToUserId);
              const statusMeta = DEVICE_STATUS_META[dev.status];
              const compMeta = COMPLIANCE_META[dev.compliance];
              const CompIcon = compMeta.icon;
              return (
                <article key={dev.id} className="hd-inv-grid-card">
                  <div className="hd-inv-grid-card__top">
                    <AssetTagBadge
                      assetTag={dev.assetTag}
                      category={dev.category}
                      onClick={() => onInspectDevice(dev.id)}
                    />
                    <span className={cx('hd-pill', `hd-pill--${statusMeta.tone}`)}>
                      {statusMeta.label}
                    </span>
                    <span className={cx('hd-pill', `hd-pill--${compMeta.tone}`, 'ml-auto')}>
                      <CompIcon size={12} /> {compMeta.label}
                    </span>
                  </div>

                  <h4 className="hd-inv-grid-card__name">{dev.name}</h4>
                  <div className="text-xs muted">
                    {dev.model} · S/N <span className="mono">{dev.serialNumber}</span>
                  </div>

                  <div className="hd-inv-grid-card__holder">
                    {holder ? (
                      <>
                        <Avatar user={holder} size={26} presence />
                        <div className="min-w-0">
                          <strong className="text-xs block truncate">{holder.name}</strong>
                          <span className="text-xs muted">{holder.department}</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs muted">
                        <Package size={13} /> In Stock · {dev.location}
                      </span>
                    )}
                    <span className="text-xs muted ml-auto">{formatUsd(dev.costUsd)}</span>
                  </div>

                  <div className="hd-tag-list">
                    {dev.tags.map((t) => (
                      <DeviceTagChip
                        key={t}
                        tag={t}
                        active={activeTagParam === t}
                        onClick={() => setActiveTag(t)}
                        onRemove={() => {
                          const res = removeDeviceTag(dev.id, t);
                          toast.result(res);
                        }}
                      />
                    ))}
                  </div>

                  <div className="hd-inv-grid-card__foot">
                    <button
                      type="button"
                      className="btn btn--xs btn--ghost"
                      onClick={() => {
                        const res = runMdmCommand(dev.id, 'sync_telemetry');
                        toast.result(res);
                      }}
                    >
                      <RefreshCw size={12} /> Sync MDM
                    </button>
                    <button
                      type="button"
                      className="btn btn--xs btn--primary ml-auto"
                      onClick={() => onInspectDevice(dev.id)}
                    >
                      <QrCode size={12} /> Sticker & Custody
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filteredDevices.length === 0 && (
          <EmptyState
            icon={<QrCode size={26} />}
            title="No hardware assets match these filters"
            action={
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={clearAllFilters}
              >
                Reset All Filters
              </button>
            }
          >
            Try clearing the active tag filter or searching by another HX asset tag or employee name.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
