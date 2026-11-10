/**
 * IT Helpdesk — Fleet Command (`FleetView`).
 *
 * Composes `fleet-inventory.tsx` (facets, saved views, bulk actions, table &
 * hologram grid) with:
 *  - HUD KPI ribbon (`NeoKpis`: total fleet, healthy %, non-compliant, loaners due, in repair / lost)
 *  - Signature interactive SVG **Fleet Radar** (`radarLayout` / `radarDistance`),
 *    plotting every active device as a glowing blip by risk & health band with
 *    live hover/click inspection and sector grouping (Office / Kind / Status)
 *  - **Register device** modal (`?register=1`, `C` hotkey) with live asset-tag
 *    generation (`nextAssetTag`, `kindCode`, `ASSET_TAG_RE`) and hardware presets.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Check,
  Compass,
  Download,
  HeartPulse,
  Laptop,
  LayoutGrid,
  MapPin,
  PackagePlus,
  Plus,
  QrCode,
  Radar,
  RefreshCw,
  Rows3,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import {
  CountUp,
  NeoEmpty,
  NeoHead,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoStage,
  NeoTabs,
  Orb,
  PeoplePicker,
} from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device, DeviceKind, DeviceStatus, DeviceTag, Office } from '@/helpdesk/types';
import {
  ASSET_TAG_RE,
  complianceIssues,
  healthBand,
  HEALTH_BAND_COLOR,
  HEALTH_BAND_LABEL,
  isCompliant,
  kindCode,
  nextAssetTag,
  radarDistance,
  radarLayout,
  warrantyInfo,
  type FleetCtx,
  type HealthBand,
  type RadarBlip,
} from '@/helpdesk/fleet';
import {
  DAY,
  DEVICE_KINDS,
  DEVICE_STATUSES,
  DEVICE_STATUS_LABEL,
  formatMoney,
  isManagedKind,
  KIND_LABEL,
  OFFICES,
  officeOf,
} from '@/helpdesk/meta';
import {
  BUILTIN_VIEWS,
  cleanFilter,
  countFacets,
  exportFleetCsv,
  filterKey,
  FleetBulkBar,
  FleetFacets,
  FleetGrid,
  FleetTable,
  FleetViewChips,
  isFiltered,
  matchesView,
  MiniCompliance,
  SaveViewButton,
  sortDevices,
  toggleIn,
  useHealthMap,
  useSticky,
  type FleetViewDef,
  type FleetViewFilter,
  type SortKey,
  type SortState,
} from './fleet-inventory';
import { DeviceGlyph } from './glyphs';
import { holoColor } from './DeviceParts';
import { HealthRing, KIND_ICON, Kbd, Person, plural, TagChip, useSetParam, useViewer, type HdViewer } from './ui';
import '@/styles/helpdesk/fleet.css';

export type FleetLayout = 'table' | 'grid' | 'radar';
type RadarGrouping = 'office' | 'kind' | 'status';

const RADAR_RINGS: { label: string; band: HealthBand; r: number }[] = [
  { label: 'Healthy ≥85', band: 'healthy', r: radarDistance(15) },
  { label: 'Fair ≥70', band: 'fair', r: radarDistance(30) },
  { label: 'At risk ≥50', band: 'at_risk', r: radarDistance(50) },
  { label: 'Critical <50', band: 'critical', r: 0.96 },
];

const overlayOpen = () => !!document.querySelector('.modal, .sheet, .neo-pop');

export function FleetView(_props: { admin?: boolean; onClose?: () => void }) {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const tags = useHelpdesk((s) => s.tags);
  const savedViewsMap = useHelpdesk((s) => s.fleetViews);
  const users = useHub((s) => s.users);
  const now = useNow(30_000);
  const [sp, setSp] = useSearchParams();
  const setParam = useSetParam();
  const searchRef = useRef<HTMLInputElement>(null);

  const [stickyLayout, setStickyLayout] = useSticky<FleetLayout>('nexus.hd.fleet.layout', 'table', 'session');
  const urlView = sp.get('view');
  const layout: FleetLayout = urlView === 'grid' || urlView === 'radar' || urlView === 'table' ? urlView : stickyLayout;

  const setLayout = useCallback(
    (next: FleetLayout) => {
      setStickyLayout(next);
      setSp(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'table') p.delete('view');
          else p.set('view', next);
          return p;
        },
        { replace: true },
      );
    },
    [setStickyLayout, setSp],
  );

  const [filter, setFilter] = useSticky<FleetViewFilter>('nexus.hd.fleet.filter', {}, 'session');
  const [sort, setSort] = useSticky<SortState>('nexus.hd.fleet.sort', { key: 'health', dir: 1 }, 'session');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [radarCollapsed, setRadarCollapsed] = useState(false);

  // Sync deep-link query params (?tag=..., ?status=..., ?office=..., ?compliance=...) if provided
  const tagParam = sp.get('tag');
  useEffect(() => {
    if (!tagParam) return;
    setFilter((f) => ({ ...f, tag: [tagParam] }));
  }, [tagParam, setFilter]);

  const me = viewer?.user.id ?? '';
  const myViews = useMemo<FleetViewDef[]>(
    () => (savedViewsMap[me] ?? []).map((v) => ({ id: v.id, name: v.name, filter: v.filter, builtin: false })),
    [savedViewsMap, me],
  );
  const allViews = useMemo(() => [...BUILTIN_VIEWS, ...myViews], [myViews]);

  const health = useHealthMap(devices, now);
  const ctx = useMemo<FleetCtx>(() => ({ users, now }), [users, now]);
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t] as const)), [tags]);

  const facetCounts = useMemo(() => countFacets(devices, health, now), [devices, health, now]);

  const viewCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of allViews) {
      out[v.id] = devices.filter((d) => matchesView(d, v.filter, ctx, health.get(d.assetTag) ?? 100)).length;
    }
    return out;
  }, [allViews, devices, ctx, health]);

  const matched = useMemo(
    () => devices.filter((d) => matchesView(d, filter, ctx, health.get(d.assetTag) ?? 100)),
    [devices, filter, ctx, health],
  );

  const sorted = useMemo(() => sortDevices(matched, sort, health, users), [matched, sort, health, users]);

  // Keep selection pruned to existing devices
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const valid = new Set(devices.map((d) => d.assetTag));
      const next = new Set([...prev].filter((t) => valid.has(t)));
      return next.size === prev.size ? prev : next;
    });
  }, [devices]);

  /* ---------- Fleet-wide KPI metrics ---------- */
  const kpis = useMemo(() => {
    const active = devices.filter((d) => d.status !== 'retired');
    const retired = devices.length - active.length;
    const inStock = active.filter((d) => d.status === 'in_stock').length;
    const inUse = active.filter((d) => d.status === 'in_use').length;
    const scores = active.map((d) => health.get(d.assetTag) ?? 100);
    const healthyCount = scores.filter((s) => healthBand(s) === 'healthy').length;
    const atRiskCount = scores.filter((s) => s < 70).length;
    const healthyPct = active.length ? Math.round((healthyCount / active.length) * 100) : 100;
    const avgHealth = active.length ? Math.round(scores.reduce((a, b) => a + b, 0) / active.length) : 100;

    const managed = active.filter((d) => isManagedKind(d.kind) && d.status !== 'in_stock');
    const nonCompliant = managed.filter((d) => !isCompliant(d, now)).length;
    const expiringWarranty = active.filter((d) => warrantyInfo(d, now).state !== 'ok').length;

    const loaners = active.filter((d) => d.status === 'loaner');
    const overdueLoaners = loaners.filter((d) => d.loan && d.loan.dueAt < now).length;
    const dueSoonLoaners = loaners.filter((d) => d.loan && d.loan.dueAt >= now && d.loan.dueAt - now <= 3 * DAY).length;

    const inRepair = active.filter((d) => d.status === 'in_repair').length;
    const lost = active.filter((d) => d.status === 'lost').length;
    const totalValue = active.reduce((s, d) => s + (d.cost || 0), 0);

    return {
      total: active.length,
      retired,
      inStock,
      inUse,
      healthyPct,
      avgHealth,
      atRiskCount,
      managed: managed.length,
      nonCompliant,
      expiringWarranty,
      loaners: loaners.length,
      overdueLoaners,
      dueSoonLoaners,
      inRepair,
      lost,
      totalValue,
    };
  }, [devices, health, now]);

  const currentKey = useMemo(() => filterKey(filter), [filter]);
  const filtered = isFiltered(filter);
  const matchesExistingView = useMemo(() => allViews.some((v) => filterKey(v.filter) === currentKey), [allViews, currentKey]);

  const clearFilters = useCallback(() => setFilter({}), [setFilter]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      setSort((prev) => (prev.key === key ? { key, dir: (prev.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: key === 'health' ? 1 : 1 }));
    },
    [setSort],
  );

  const toggleOne = useCallback((tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (on: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const d of sorted) {
          if (on) next.add(d.assetTag);
          else next.delete(d.assetTag);
        }
        return next;
      });
    },
    [sorted],
  );

  const handleSaveView = (name: string): string | null => {
    const r = useHelpdesk.getState().saveFleetView(name, cleanFilter(filter), viewer);
    if (!r.ok) return r.error;
    toast.success(`Saved view “${r.view.name}”`, `${sorted.length} matching devices`);
    return null;
  };

  const handleDeleteView = (v: FleetViewDef) => {
    const r = useHelpdesk.getState().deleteFleetView(v.id, viewer);
    if (!r.ok) return void toast.error(r.error);
    toast.info(`Removed view “${v.name}”`);
  };

  useHotkeys({
    s: (e) => {
      if (overlayOpen()) return;
      e.preventDefault();
      searchRef.current?.focus();
    },
    v: () => {
      if (overlayOpen()) return;
      const order: FleetLayout[] = ['table', 'grid', 'radar'];
      setLayout(order[(order.indexOf(layout) + 1) % order.length]);
    },
    escape: () => {
      if (overlayOpen()) return;
      if (selected.size > 0) setSelected(new Set());
    },
  });

  const registerOpen = sp.get('register') === '1';
  const closeRegister = useCallback(() => setParam('register', null, { replace: true }), [setParam]);

  return (
    <NeoStage label="Fleet command" className="hd-fleet-stage">
      <NeoHead
        icon={<Radar />}
        eyebrow="IT console · Fleet"
        title="Fleet command"
        sub={`${plural(kpis.total, 'active device')} · ${kpis.healthyPct}% healthy · ${kpis.nonCompliant ? `${kpis.nonCompliant} non-compliant` : 'all MDM compliant'} · ${formatMoney(kpis.totalValue)} fleet value`}
        center={
          <NeoTabs<FleetLayout>
            label="Fleet view mode"
            value={layout}
            onChange={setLayout}
            items={[
              { value: 'table', label: 'Table', icon: <Rows3 />, title: 'Inventory table (V)' },
              { value: 'grid', label: 'Grid', icon: <LayoutGrid />, title: 'Hologram grid (V)' },
              { value: 'radar', label: 'Radar', icon: <Radar />, title: 'Fleet telemetry radar (V)' },
            ]}
          />
        }
        actions={
          <>
            <button
              type="button"
              className="neo-btn neo-btn--soft"
              onClick={() => setParam('scan', '1')}
              data-tip="Open QR & asset-tag scanner"
              data-qa="fleet-scan"
            >
              <QrCode /> <span className="neo-btn__label">Scan sticker</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--soft"
              onClick={() => exportFleetCsv(sorted, users, tags, now)}
              data-tip={`Export ${plural(sorted.length, 'device')} as CSV`}
              data-qa="fleet-export"
            >
              <Download /> <span className="neo-btn__label">Export CSV</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              onClick={() => setParam('register', '1')}
              data-tip="Register device (C)"
              data-qa="fleet-register"
            >
              <Plus /> <span className="neo-btn__label">Register device</span>
            </button>
          </>
        }
      />

      <div className="neo-toolbar hd-fleet-toolbar">
        <div className="hd-fleet-toolbar__top">
          <FleetViewChips
            views={allViews}
            current={currentKey}
            counts={viewCounts}
            onApply={(v) => setFilter(v.filter)}
            onDelete={handleDeleteView}
            trailing={
              <>
                <SaveViewButton disabled={!filtered || matchesExistingView} onSave={handleSaveView} />
                {filtered && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={clearFilters}
                    data-qa="fleet-clear"
                  >
                    <X /> Reset filters
                  </button>
                )}
              </>
            }
          />
          <span className="hd-fleet-live" title="Live MDM & posture telemetry">
            <Orb tone={kpis.lost > 0 ? 'danger' : kpis.nonCompliant > 0 ? 'warning' : 'success'} pulse size={7} />
            <span>
              <b className="neo-num">{sorted.length}</b> of {kpis.total} shown
            </span>
          </span>
        </div>
        <FleetFacets filter={filter} onChange={setFilter} counts={facetCounts} tags={tags} searchRef={searchRef} />
      </div>

      <div className="neo-body neo-pad hd-fleet-body">
        <NeoKpis label="Fleet posture" className="hd-fleet-kpis">
          <NeoKpi
            label="Total fleet"
            icon={<Laptop />}
            value={<CountUp value={kpis.total} />}
            sub={`${kpis.inUse} assigned · ${kpis.inStock} in stock · ${kpis.retired} retired`}
            onClick={() => setFilter({})}
            title="Show all active devices"
          />
          <NeoKpi
            label="Healthy"
            icon={<HeartPulse />}
            tone={kpis.healthyPct >= 85 ? 'success' : kpis.healthyPct >= 70 ? 'amber' : 'danger'}
            value={
              <>
                <CountUp value={kpis.healthyPct} />
                <small>%</small>
              </>
            }
            sub={`avg score ${kpis.avgHealth} · ${kpis.atRiskCount} at risk`}
            onClick={() => setFilter({ health: ['at_risk', 'critical'] })}
            title="Filter to at-risk & critical devices"
          />
          <NeoKpi
            label="Non-compliant"
            icon={<ShieldCheck />}
            tone={kpis.nonCompliant > 0 ? 'danger' : 'success'}
            value={<CountUp value={kpis.nonCompliant} />}
            sub={`${kpis.managed} MDM-enrolled · ${kpis.expiringWarranty} warranty ≤90d`}
            onClick={() => setFilter({ compliance: 'noncompliant' })}
            title="Filter to non-compliant devices"
          />
          <NeoKpi
            label="Loaners due"
            icon={<Truck />}
            tone={kpis.overdueLoaners > 0 ? 'danger' : kpis.loaners > 0 ? 'amber' : undefined}
            value={<CountUp value={kpis.loaners} />}
            sub={
              kpis.overdueLoaners > 0
                ? `${kpis.overdueLoaners} overdue · ${kpis.dueSoonLoaners} due soon`
                : kpis.loaners > 0
                  ? `${kpis.loaners} checked out · on schedule`
                  : 'All loaners in stock'
            }
            onClick={() => setFilter({ status: ['loaner'] })}
            title="Filter to active loaners"
          />
          <NeoKpi
            label="In repair / lost"
            icon={<Wrench />}
            tone={kpis.lost > 0 ? 'danger' : kpis.inRepair > 0 ? 'violet' : undefined}
            value={<CountUp value={kpis.inRepair + kpis.lost} />}
            sub={`${kpis.inRepair} on repair bench · ${kpis.lost} lost`}
            onClick={() => setFilter({ status: ['in_repair', 'lost'] })}
            title="Filter to devices in repair or reported lost"
          />
        </NeoKpis>

        {selected.size > 0 && (
          <FleetBulkBar
            selected={[...selected]}
            devices={devices}
            tags={tags}
            viewer={viewer}
            onClear={() => setSelected(new Set())}
            onExport={() =>
              exportFleetCsv(
                devices.filter((d) => selected.has(d.assetTag)),
                users,
                tags,
                now,
                'fleet-selected',
              )
            }
          />
        )}

        {(layout === 'radar' || !radarCollapsed) && (
          <FleetRadarDeck
            devices={sorted.length > 0 ? sorted : devices.filter((d) => d.status !== 'retired')}
            now={now}
            full={layout === 'radar'}
            filter={filter}
            onFilter={setFilter}
            onCollapse={layout === 'radar' ? undefined : () => setRadarCollapsed(true)}
            onExpand={layout === 'radar' ? () => setLayout('table') : () => setLayout('radar')}
          />
        )}

        {layout !== 'radar' && radarCollapsed && (
          <div className="hd-radar-collapsed">
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setRadarCollapsed(false)}>
              <Radar /> Show Fleet Radar ({sorted.length} blips)
            </button>
          </div>
        )}

        {layout !== 'radar' && (
          <>
            {sorted.length === 0 ? (
              <NeoEmpty
                icon={<SearchX />}
                title="No devices match these filters"
                action={
                  <button type="button" className="neo-btn neo-btn--soft" onClick={clearFilters}>
                    Reset filters
                  </button>
                }
              >
                Try clearing a facet or searching by asset tag (e.g. <code className="neo-mono">HX-MBP-0142</code>), person or <code className="neo-mono">#tag</code>.
              </NeoEmpty>
            ) : layout === 'table' ? (
              <FleetTable
                devices={sorted}
                health={health}
                now={now}
                selected={selected}
                onToggle={toggleOne}
                onToggleAll={toggleAll}
                tagsById={tagsById}
                sort={sort}
                onSort={toggleSort}
              />
            ) : (
              <FleetGrid
                devices={sorted}
                health={health}
                now={now}
                selected={selected}
                onToggle={toggleOne}
                tagsById={tagsById}
                users={users}
              />
            )}
          </>
        )}

        <div className="hd-fleet-foot" aria-hidden="true">
          <Kbd>S</Kbd> search fleet · <Kbd>V</Kbd> switch table / grid / radar · <Kbd>C</Kbd> register device · click any blip or row to inspect
        </div>
      </div>

      <RegisterDeviceModal
        open={registerOpen}
        onClose={closeRegister}
        devices={devices}
        tags={tags}
        viewer={viewer}
      />
    </NeoStage>
  );
}

/* ================================================================ Fleet Radar */

function FleetRadarDeck({
  devices,
  now,
  full,
  filter,
  onFilter,
  onCollapse,
  onExpand,
}: {
  devices: Device[];
  now: number;
  full: boolean;
  filter: FleetViewFilter;
  onFilter: (f: FleetViewFilter) => void;
  onCollapse?: () => void;
  onExpand: () => void;
}) {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const [grouping, setGrouping] = useState<RadarGrouping>('office');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const byTag = useMemo(() => new Map(devices.map((d) => [d.assetTag, d] as const)), [devices]);

  const { sectors, blips } = useMemo(() => {
    if (grouping === 'kind') {
      return radarLayout(devices, {
        groupOf: (d) => d.kind,
        sectors: DEVICE_KINDS,
        now,
      });
    }
    if (grouping === 'status') {
      return radarLayout(devices, {
        groupOf: (d) => d.status,
        sectors: DEVICE_STATUSES,
        now,
      });
    }
    return radarLayout(devices, {
      groupOf: (d) => d.office,
      sectors: OFFICES,
      now,
    });
  }, [devices, grouping, now]);

  // Default inspected blip: highest-risk / pulsing device so the inspector is always rich
  const defaultBlip = useMemo<RadarBlip | undefined>(() => {
    if (!blips.length) return undefined;
    return [...blips].sort((a, b) => Number(b.pulse) - Number(a.pulse) || b.risk - a.risk || a.tag.localeCompare(b.tag))[0];
  }, [blips]);

  const activeBlip = useMemo(
    () => (activeTag ? blips.find((b) => b.tag === activeTag) : undefined) ?? defaultBlip,
    [blips, activeTag, defaultBlip],
  );
  const activeDevice = activeBlip ? byTag.get(activeBlip.tag) : undefined;
  const owner = useMemo(
    () => (activeDevice?.assigneeId ? users.find((u) => u.id === activeDevice.assigneeId) : undefined),
    [users, activeDevice],
  );

  const sectorLabel = (key: string) => {
    if (grouping === 'kind') return KIND_LABEL[key as DeviceKind] ?? key;
    if (grouping === 'status') return DEVICE_STATUS_LABEL[key as DeviceStatus] ?? key;
    return key;
  };

  const handleSectorClick = (key: string) => {
    if (grouping === 'office') onFilter({ ...filter, office: toggleIn(filter.office, key as Office) });
    else if (grouping === 'kind') onFilter({ ...filter, kind: toggleIn(filter.kind, key as DeviceKind) });
    else onFilter({ ...filter, status: toggleIn(filter.status, key as DeviceStatus) });
  };

  const pulsingCount = useMemo(() => blips.filter((b) => b.pulse).length, [blips]);

  const syncDevice = (tag: string) => {
    const r = useHelpdesk.getState().mdmAction(tag, 'sync');
    if (r.ok) toast.info('MDM sync dispatched', tag);
    else toast.error(r.error);
  };

  const R = 175; // SVG coordinate radius inside 440×440 viewBox (-220..220)

  return (
    <NeoPanel
      className={cx('hd-radar-panel', full && 'hd-radar-panel--full')}
      hud={
        <span className="hd-radar-hud">
          <Orb tone={pulsingCount > 0 ? 'warning' : 'success'} pulse size={7} />
          <span>TELEMETRY RADAR · {blips.length} LOCKED TARGETS · {pulsingCount} ALERTS</span>
        </span>
      }
      title="Fleet posture & risk radar"
      icon={<Compass />}
      actions={
        <div className="hd-radar-actions">
          <div className="hd-radar-group" role="group" aria-label="Sector grouping">
            {(
              [
                { id: 'office', label: 'By office', icon: <MapPin /> },
                { id: 'kind', label: 'By kind', icon: <Boxes /> },
                { id: 'status', label: 'By status', icon: <Activity /> },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                className={cx('hd-radar-group__btn', grouping === g.id && 'is-on')}
                onClick={() => setGrouping(g.id)}
                aria-pressed={grouping === g.id}
              >
                {g.icon}
                <span>{g.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onExpand}>
            {full ? 'Back to table' : 'Full radar'}
          </button>
          {onCollapse && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onCollapse} title="Hide radar">
              Hide
            </button>
          )}
        </div>
      }
    >
      <div className="hd-radar">
        <div className="hd-radar__stage">
          <svg
            className="hd-radar__svg"
            viewBox="-230 -230 460 460"
            role="img"
            aria-label={`Fleet radar plotting ${blips.length} devices by risk distance and ${grouping} sectors`}
            data-qa="fleet-radar-svg"
          >
            <defs>
              <radialGradient id="hd-radar-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.20" />
                <stop offset="55%" stopColor="var(--app-c2)" stopOpacity="0.07" />
                <stop offset="100%" stopColor="var(--app-c1)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="hd-radar-sweep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.34" />
                <stop offset="100%" stopColor="var(--app-c1)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Ambient plasma field */}
            <circle cx={0} cy={0} r={R} fill="url(#hd-radar-glow)" />

            {/* Risk band rings (centre = healthy, outer = critical) */}
            {RADAR_RINGS.map((ring) => (
              <g key={ring.band}>
                <circle
                  cx={0}
                  cy={0}
                  r={ring.r * R}
                  className="hd-radar__ring"
                  data-band={ring.band}
                />
                <text x={4} y={-ring.r * R + 11} className="hd-radar__ring-lbl">
                  {ring.label}
                </text>
              </g>
            ))}

            {/* Crosshairs */}
            <line x1={-R} y1={0} x2={R} y2={0} className="hd-radar__axis" />
            <line x1={0} y1={-R} x2={0} y2={R} className="hd-radar__axis" />

            {/* Sector dividers and perimeter labels */}
            {sectors.map((s) => {
              const aStart = s.start - Math.PI / 2;
              const aMid = (s.start + s.end) / 2 - Math.PI / 2;
              const x1 = Math.cos(aStart) * (R * 0.12);
              const y1 = Math.sin(aStart) * (R * 0.12);
              const x2 = Math.cos(aStart) * R;
              const y2 = Math.sin(aStart) * R;
              const lx = Math.cos(aMid) * (R + 26);
              const ly = Math.sin(aMid) * (R + 22);
              return (
                <g key={s.key}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="hd-radar__sector-line" />
                  <g
                    className="hd-radar__sector-tag"
                    transform={`translate(${lx.toFixed(1)}, ${ly.toFixed(1)})`}
                    onClick={() => handleSectorClick(s.key)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Filter by ${sectorLabel(s.key)} (${s.count} devices)`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSectorClick(s.key);
                      }
                    }}
                  >
                    <text textAnchor="middle" dominantBaseline="central" className="hd-radar__sector-lbl">
                      {sectorLabel(s.key)} · {s.count}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Rotating radar sweep wedge */}
            <g className="hd-radar__sweep" aria-hidden="true">
              <path
                d={`M 0 0 L 0 ${-R} A ${R} ${R} 0 0 1 ${(R * Math.sin(Math.PI / 5)).toFixed(1)} ${(-R * Math.cos(Math.PI / 5)).toFixed(1)} Z`}
                fill="url(#hd-radar-sweep-grad)"
              />
              <line x1={0} y1={0} x2={0} y2={-R} className="hd-radar__sweep-line" />
            </g>

            {/* Core beacon */}
            <circle cx={0} cy={0} r={5} className="hd-radar__core" />

            {/* Device blips */}
            {blips.map((b) => {
              const bx = b.x * R;
              const by = b.y * R;
              const band = healthBand(b.health);
              const color = HEALTH_BAND_COLOR[band];
              const isSelected = activeBlip?.tag === b.tag;
              const d = byTag.get(b.tag);
              return (
                <g
                  key={b.tag}
                  transform={`translate(${bx.toFixed(1)}, ${by.toFixed(1)})`}
                  className={cx('hd-radar__blip', isSelected && 'is-active', b.pulse && 'is-pulse')}
                  style={{ ['--blip' as string]: color }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${b.tag} ${d?.model ?? ''}, health ${b.health}, ${HEALTH_BAND_LABEL[band]}`}
                  data-qa={`radar-blip-${b.tag}`}
                  onMouseEnter={() => setActiveTag(b.tag)}
                  onFocus={() => setActiveTag(b.tag)}
                  onClick={() => navigate(`/helpdesk/fleet/${b.tag}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/helpdesk/fleet/${b.tag}`);
                    }
                  }}
                >
                  {b.pulse && <circle r={11} className="hd-radar__halo" />}
                  {isSelected && <circle r={13} className="hd-radar__reticle" />}
                  <circle r={isSelected ? 5.8 : b.pulse ? 4.8 : 4} className="hd-radar__dot" />
                </g>
              );
            })}
          </svg>

          <div className="hd-radar__legend" aria-label="Radar legend">
            {(['healthy', 'fair', 'at_risk', 'critical'] as const).map((b) => (
              <button
                key={b}
                type="button"
                className={cx('hd-radar__legend-item', filter.health?.includes(b) && 'is-on')}
                onClick={() => onFilter({ ...filter, health: toggleIn(filter.health, b) })}
              >
                <i style={{ background: HEALTH_BAND_COLOR[b] }} />
                <span>{HEALTH_BAND_LABEL[b]}</span>
              </button>
            ))}
            <span className="hd-radar__legend-hint">Centre = low risk · Edge = critical risk</span>
          </div>
        </div>

        {/* Right column: Active blip inspector + sector breakdown */}
        <div className="hd-radar__side">
          {activeDevice && activeBlip ? (
            <div className="hd-radar__inspect" data-band={healthBand(activeBlip.health)} data-qa="radar-inspector">
              <div className="hd-radar__inspect-top">
                <span className="neo-hud">
                  TARGET LOCK · <span className="neo-mono">{activeDevice.assetTag}</span>
                </span>
                <span className="hd-devstate" data-status={activeDevice.status}>
                  {DEVICE_STATUS_LABEL[activeDevice.status]}
                </span>
              </div>

              <div className="hd-radar__inspect-hero">
                <div className="hd-radar__inspect-glyph" style={{ ['--holo' as string]: holoColor(activeDevice) ?? 'var(--app-c1)' }}>
                  <DeviceGlyph kind={activeDevice.kind} size={78} color={holoColor(activeDevice)} />
                </div>
                <div className="hd-radar__inspect-titles">
                  <Link to={`/helpdesk/fleet/${activeDevice.assetTag}`} className="hd-radar__inspect-model">
                    {activeDevice.model}
                  </Link>
                  <div className="hd-radar__inspect-sub">
                    {KIND_LABEL[activeDevice.kind]} · {activeDevice.os ?? activeDevice.manufacturer} · {activeDevice.office}
                  </div>
                  <div className="hd-radar__inspect-owner">
                    {owner ? (
                      <Person userId={owner.id} size={22} sub={owner.department} />
                    ) : (
                      <span className="neo-faint">{activeDevice.status === 'in_stock' ? 'In stock at IT bar' : 'Unassigned'}</span>
                    )}
                  </div>
                </div>
                <HealthRing score={activeBlip.health} size={50} />
              </div>

              <div className="hd-radar__inspect-posture">
                <MiniCompliance d={activeDevice} now={now} />
                <span className="hd-radar__inspect-seen">
                  {activeDevice.lastCheckIn ? `Seen ${relativeTime(activeDevice.lastCheckIn, now)}` : 'No MDM check-in'}
                </span>
              </div>

              {complianceIssues(activeDevice, now).length > 0 && (
                <div className="hd-radar__inspect-issues">
                  <ShieldAlert />
                  <span>{complianceIssues(activeDevice, now).join(' · ')}</span>
                </div>
              )}

              <div className="hd-radar__inspect-actions">
                <Link
                  to={`/helpdesk/fleet/${activeDevice.assetTag}`}
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  data-qa="radar-open-device"
                >
                  Inspect device <ArrowUpRight />
                </Link>
                {isManagedKind(activeDevice.kind) && activeDevice.status !== 'retired' && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => syncDevice(activeDevice.assetTag)}
                  >
                    <RefreshCw /> Sync MDM
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="hd-radar__inspect">
              <div className="neo-hud">No active target</div>
              <p className="neo-faint">Hover or select any blip on the radar to inspect its telemetry.</p>
            </div>
          )}

          {/* Sector quick-list / risk queue */}
          <div className="hd-radar__watchlist">
            <div className="hd-radar__watchlist-head">
              <span className="neo-hud">Priority targets ({pulsingCount} alerts)</span>
              <span className="neo-faint">Click to lock</span>
            </div>
            <div className="hd-radar__watchlist-rows">
              {[...blips]
                .sort((a, b) => Number(b.pulse) - Number(a.pulse) || b.risk - a.risk)
                .slice(0, full ? 8 : 4)
                .map((b) => {
                  const d = byTag.get(b.tag);
                  if (!d) return null;
                  const band = healthBand(b.health);
                  const on = activeBlip?.tag === b.tag;
                  return (
                    <button
                      key={b.tag}
                      type="button"
                      className={cx('hd-radar__target', on && 'is-on')}
                      onMouseEnter={() => setActiveTag(b.tag)}
                      onClick={() => navigate(`/helpdesk/fleet/${b.tag}`)}
                    >
                      <i style={{ background: HEALTH_BAND_COLOR[band] }} />
                      <span className="neo-mono hd-radar__target-tag">{b.tag}</span>
                      <span className="truncate hd-radar__target-model">{d.model}</span>
                      <span className="hd-radar__target-office">{d.office}</span>
                      <b className="neo-num" style={{ color: HEALTH_BAND_COLOR[band] }}>
                        {b.health}
                      </b>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </NeoPanel>
  );
}

/* ================================================================ Register Device Modal */

interface HardwarePreset {
  label: string;
  kind: DeviceKind;
  manufacturer: string;
  model: string;
  os?: string;
  cost: number;
  warrantyMonths: number;
}

const HARDWARE_PRESETS: HardwarePreset[] = [
  { label: 'MacBook Pro 14″ M4', kind: 'laptop', manufacturer: 'Apple', model: 'MacBook Pro 14" M4 Max', os: 'macOS 15.3', cost: 3199, warrantyMonths: 36 },
  { label: 'MacBook Air 13″ M3', kind: 'laptop', manufacturer: 'Apple', model: 'MacBook Air 13" M3', os: 'macOS 15.3', cost: 1699, warrantyMonths: 36 },
  { label: 'Dell XPS 14', kind: 'laptop', manufacturer: 'Dell', model: 'Dell XPS 14 9440', os: 'Ubuntu 24.04 LTS', cost: 2399, warrantyMonths: 36 },
  { label: 'Studio Display 27″', kind: 'monitor', manufacturer: 'Apple', model: 'Apple Studio Display 27"', cost: 1599, warrantyMonths: 24 },
  { label: 'iPhone 16 Pro', kind: 'phone', manufacturer: 'Apple', model: 'iPhone 16 Pro', os: 'iOS 18.3', cost: 1099, warrantyMonths: 24 },
  { label: 'YubiKey 5C NFC', kind: 'security-key', manufacturer: 'Yubico', model: 'YubiKey 5C NFC', cost: 55, warrantyMonths: 24 },
];

function makeSerial(kind: DeviceKind, count: number): string {
  const prefix = kindCode(kind).slice(0, 2);
  const stamp = (Date.now() % 100_000).toString(36).toUpperCase().padStart(4, '0');
  return `SN-${prefix}${String(count + 101).padStart(3, '0')}-${stamp}`;
}

function RegisterDeviceModal({
  open,
  onClose,
  devices,
  tags,
  viewer,
}: {
  open: boolean;
  onClose: () => void;
  devices: Device[];
  tags: DeviceTag[];
  viewer: HdViewer | null;
}) {
  const navigate = useNavigate();
  const defaultOffice = useMemo<Office>(() => officeOf(viewer?.user.location), [viewer?.user.location]);

  const [kind, setKind] = useState<DeviceKind>('laptop');
  const [manufacturer, setManufacturer] = useState('Apple');
  const [model, setModel] = useState('MacBook Pro 14" M4 Pro');
  const [serial, setSerial] = useState(() => makeSerial('laptop', devices.length));
  const [office, setOffice] = useState<Office>(defaultOffice);
  const [os, setOs] = useState('macOS 15.3');
  const [cost, setCost] = useState('2499');
  const [warrantyMonths, setWarrantyMonths] = useState('36');
  const [assignee, setAssignee] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Reset form cleanly when opened
  useEffect(() => {
    if (!open) return;
    setSerial(makeSerial('laptop', devices.length));
    setError('');
  }, [open, devices.length]);

  const previewTag = useMemo(() => nextAssetTag(kind, model, devices), [kind, model, devices]);
  const tagValid = ASSET_TAG_RE.test(previewTag);
  const managed = isManagedKind(kind);

  const applyPreset = (p: HardwarePreset) => {
    setKind(p.kind);
    setManufacturer(p.manufacturer);
    setModel(p.model);
    setOs(p.os ?? '');
    setCost(String(p.cost));
    setWarrantyMonths(String(p.warrantyMonths));
    setSerial(makeSerial(p.kind, devices.length));
    setError('');
  };

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!tagValid) {
      setError('Generated asset tag is invalid.');
      return;
    }
    const r = useHelpdesk.getState().registerDevice(
      {
        kind,
        manufacturer,
        model,
        serial,
        office,
        cost: Number(cost) || 0,
        warrantyMonths: Number(warrantyMonths) || (managed ? 36 : 24),
        os: managed && os.trim() ? os.trim() : undefined,
        assigneeId: assignee[0] || undefined,
        tags: selectedTags,
      },
      viewer,
    );
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onClose();
    toast.success(`Registered ${r.assetTag}`, `${model.trim()} · ${assignee[0] ? 'Assigned & MDM enrolled' : `In stock (${office})`}`);
    navigate(`/helpdesk/fleet/${r.assetTag}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      className="neo-portal hd-regmodal"
      icon={
        <span className="hd-fixmodal__icon">
          <PackagePlus />
        </span>
      }
      title="Register device in Fleet"
      subtitle="Assigns the next HX asset tag, enrolls managed hardware in MDM & escrows a recovery key"
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => submit()} data-qa="register-submit">
            <Plus /> Register {previewTag}
          </button>
        </>
      }
    >
      <form className="hd-form" onSubmit={submit}>
        {/* Live Hologram + Asset Tag Preview */}
        <div className="hd-regpreview" data-qa="register-preview">
          <div className="hd-regpreview__glyph">
            <DeviceGlyph kind={kind} size={74} />
          </div>
          <div className="hd-regpreview__body">
            <div className="neo-hud">Next fleet tag · prefix {kindCode(kind, model)}</div>
            <div className="hd-regpreview__tag neo-mono">{previewTag}</div>
            <div className="hd-regpreview__meta">
              {model.trim() || KIND_LABEL[kind]} · {office} · {assignee[0] ? 'Starts In use' : 'Starts In stock'}
              {managed ? ' · MDM + FileVault escrow' : ' · Peripheral warranty tracked'}
            </div>
          </div>
          <span className="hd-devstate" data-status={assignee[0] ? 'in_use' : 'in_stock'}>
            {assignee[0] ? 'In use' : 'In stock'}
          </span>
        </div>

        {/* One-click hardware presets */}
        <div className="neo-field">
          <span className="neo-label">
            <Sparkles size={12} /> Quick hardware templates
          </span>
          <div className="hd-regpresets" role="group" aria-label="Hardware templates">
            {HARDWARE_PRESETS.map((p) => {
              const Icon = KIND_ICON[p.kind];
              const active = kind === p.kind && model === p.model;
              return (
                <button
                  key={p.label}
                  type="button"
                  className={cx('hd-regpreset', active && 'is-on')}
                  onClick={() => applyPreset(p)}
                >
                  <Icon />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hd-form hd-form--grid">
          <label className="neo-field">
            <span className="neo-label">Device kind</span>
            <select
              className="neo-select"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as DeviceKind;
                setKind(k);
                setSerial(makeSerial(k, devices.length));
              }}
              data-qa="register-kind"
            >
              {DEVICE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]} ({kindCode(k)})
                </option>
              ))}
            </select>
          </label>

          <label className="neo-field">
            <span className="neo-label">Manufacturer</span>
            <input
              className="neo-input"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. Apple, Dell, Lenovo, Yubico"
              data-qa="register-manufacturer"
            />
          </label>

          <label className="neo-field hd-form__wide">
            <span className="neo-label">Model</span>
            <input
              className="neo-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder='e.g. MacBook Pro 14" M4 Max'
              required
              data-qa="register-model"
            />
          </label>

          <label className="neo-field">
            <span className="neo-label">Serial number</span>
            <div className="hd-regserial">
              <input
                className="neo-input neo-mono"
                value={serial}
                onChange={(e) => setSerial(e.target.value.toUpperCase())}
                placeholder="SN-..."
                required
                data-qa="register-serial"
              />
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--xs"
                onClick={() => setSerial(makeSerial(kind, devices.length + Math.floor(Math.random() * 90)))}
                title="Generate new serial"
              >
                Gen
              </button>
            </div>
          </label>

          <label className="neo-field">
            <span className="neo-label">Office / IT bar</span>
            <select
              className="neo-select"
              value={office}
              onChange={(e) => setOffice(e.target.value as Office)}
              data-qa="register-office"
            >
              {OFFICES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          {managed && (
            <label className="neo-field">
              <span className="neo-label">Operating system</span>
              <input
                className="neo-input"
                value={os}
                onChange={(e) => setOs(e.target.value)}
                placeholder="e.g. macOS 15.3 · Windows 11 24H2"
                data-qa="register-os"
              />
            </label>
          )}

          <label className="neo-field">
            <span className="neo-label">Cost (USD)</span>
            <input
              className="neo-input"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              data-qa="register-cost"
            />
          </label>

          <label className="neo-field">
            <span className="neo-label">Warranty cover</span>
            <select
              className="neo-select"
              value={warrantyMonths}
              onChange={(e) => setWarrantyMonths(e.target.value)}
            >
              <option value="12">12 months (1 yr)</option>
              <option value="24">24 months (2 yrs)</option>
              <option value="36">36 months (3 yrs · AppleCare+ / ProSupport)</option>
              <option value="48">48 months (4 yrs)</option>
            </select>
          </label>

          <div className="neo-field">
            <span className="neo-label">Assign to person (optional)</span>
            <PeoplePicker
              value={assignee}
              onChange={setAssignee}
              allowNone
              label="Assign device"
              trigger={(p) => (
                <button {...p} type="button" className="hd-pickbtn" data-qa="register-assignee">
                  {assignee[0] ? <Person userId={assignee[0]} size={24} /> : <span className="neo-faint">Leave in stock ({office})…</span>}
                </button>
              )}
            />
          </div>

          {tags.length > 0 && (
            <div className="neo-field hd-form__wide">
              <span className="neo-label">Tags</span>
              <div className="hd-regtags">
                {tags.map((t) => {
                  const on = selectedTags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cx('hd-regtag', on && 'is-on')}
                      onClick={() => toggleTag(t.id)}
                      aria-pressed={on}
                    >
                      {on && <Check size={12} />}
                      <TagChip tag={t} size="sm" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="hd-formerr" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
