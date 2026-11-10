/**
 * Fleet command — inventory model & UI: facet filters (status, kind, office,
 * health band, compliance & warranty, tags, search), saved views, multi-select
 * bulk actions and the device table / grid. Composed by `FleetView`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  Boxes,
  ChevronDown,
  ChevronRight,
  Download,
  HeartPulse,
  MapPin,
  ShieldCheck,
  Tags as TagsIcon,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react';
import { MenuList, NeoMenu, NeoPopover, NeoSearch, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { downloadCsv } from '@/lib/csv';
import { formatDate, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device, DeviceTag, FleetFilter } from '@/helpdesk/types';
import {
  complianceIssues,
  compliancePills,
  deviceHealth,
  filterCount,
  healthBand,
  HEALTH_BAND_COLOR,
  HEALTH_BAND_LABEL,
  isCompliant,
  matchesFleetFilter,
  warrantyInfo,
  type FleetCtx,
  type HealthBand,
} from '@/helpdesk/fleet';
import { DAY, DEVICE_KINDS, DEVICE_STATUSES, DEVICE_STATUS_COLOR, DEVICE_STATUS_LABEL, isManagedKind, KIND_LABEL, OFFICES } from '@/helpdesk/meta';
import { DeviceGlyph } from './glyphs';
import { holoColor } from './DeviceParts';
import { HealthRing, KIND_ICON, Person, plural, TagChip, type HdViewer } from './ui';

/* ================================================================ model */

/** Fleet filter + health band (the band is applied on top of `matchesFleetFilter`). */
export type FleetViewFilter = FleetFilter & { health?: HealthBand[] };

export interface FleetViewDef {
  id: string;
  name: string;
  filter: FleetViewFilter;
  builtin?: boolean;
}

export const HEALTH_BANDS: HealthBand[] = ['healthy', 'fair', 'at_risk', 'critical'];

/** Ready-made views every IT agent gets; personal views are saved per person. */
export const BUILTIN_VIEWS: FleetViewDef[] = [
  { id: 'all', name: 'All devices', filter: {}, builtin: true },
  { id: 'risk', name: 'At risk', filter: { health: ['at_risk', 'critical'] }, builtin: true },
  { id: 'noncompliant', name: 'Non-compliant', filter: { compliance: 'noncompliant' }, builtin: true },
  { id: 'loaners', name: 'Loaners', filter: { status: ['loaner'] }, builtin: true },
  { id: 'repair', name: 'In repair', filter: { status: ['in_repair'] }, builtin: true },
  { id: 'warranty', name: 'Warranty ≤ 90 days', filter: { warranty: 'expiring' }, builtin: true },
  { id: 'stock', name: 'In stock', filter: { status: ['in_stock'] }, builtin: true },
];

/** Does a device pass the view filter? Retired devices only show when asked for. */
export function matchesView(d: Device, f: FleetViewFilter, ctx: FleetCtx, health: number): boolean {
  if (d.status === 'retired' && !f.status?.includes('retired')) return false;
  if (!matchesFleetFilter(d, f, ctx)) return false;
  return !f.health?.length || f.health.includes(healthBand(health));
}

export const facetTotal = (f: FleetViewFilter) => filterCount(f) + (f.health?.length ?? 0);
export const isFiltered = (f: FleetViewFilter) => facetTotal(f) > 0 || !!f.q?.trim();

/** Drops empty facets (what gets saved / compared). */
export function cleanFilter(f: FleetViewFilter): FleetViewFilter {
  const out: FleetViewFilter = {};
  if (f.status?.length) out.status = [...f.status];
  if (f.kind?.length) out.kind = [...f.kind];
  if (f.office?.length) out.office = [...f.office];
  if (f.tag?.length) out.tag = [...f.tag];
  if (f.health?.length) out.health = [...f.health];
  if (f.compliance) out.compliance = f.compliance;
  if (f.warranty) out.warranty = f.warranty;
  const q = f.q?.trim();
  if (q) out.q = q;
  return out;
}

/** Order-insensitive identity of a filter (to highlight the matching view). */
export function filterKey(f: FleetViewFilter): string {
  const c = cleanFilter(f);
  c.status?.sort();
  c.kind?.sort();
  c.office?.sort();
  c.tag?.sort();
  c.health?.sort();
  if (c.q) c.q = c.q.toLowerCase();
  return JSON.stringify(c, Object.keys(c).sort());
}

export function toggleIn<T extends string>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

/** Health score per asset tag (computed once per tick). */
export function useHealthMap(devices: Device[], now: number): Map<string, number> {
  return useMemo(() => new Map(devices.map((d) => [d.assetTag, deviceHealth(d, now)] as const)), [devices, now]);
}

/** useState persisted to local/session storage (filters survive opening a device). */
export function useSticky<T>(key: string, initial: T, area: 'local' | 'session' = 'local') {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = (area === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      (area === 'local' ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode) */
    }
  }, [key, area, value]);
  return [value, setValue] as const;
}

export interface FacetCounts {
  status: Record<string, number>;
  kind: Record<string, number>;
  office: Record<string, number>;
  tag: Record<string, number>;
  health: Record<string, number>;
  compliant: number;
  noncompliant: number;
  expiring: number;
  expired: number;
}

/** Device counts behind every facet option (retired only counts towards status). */
export function countFacets(devices: Device[], health: Map<string, number>, now: number): FacetCounts {
  const c: FacetCounts = { status: {}, kind: {}, office: {}, tag: {}, health: {}, compliant: 0, noncompliant: 0, expiring: 0, expired: 0 };
  const inc = (r: Record<string, number>, k: string) => {
    r[k] = (r[k] ?? 0) + 1;
  };
  for (const d of devices) {
    inc(c.status, d.status);
    if (d.status === 'retired') continue;
    inc(c.kind, d.kind);
    inc(c.office, d.office);
    inc(c.health, healthBand(health.get(d.assetTag) ?? 100));
    for (const t of d.tags) inc(c.tag, t);
    if (isManagedKind(d.kind)) {
      if (isCompliant(d, now)) c.compliant++;
      else c.noncompliant++;
    }
    const w = warrantyInfo(d, now).state;
    if (w === 'expiring') c.expiring++;
    if (w === 'expired') c.expired++;
  }
  return c;
}

export type SortKey = 'device' | 'owner' | 'status' | 'office' | 'health' | 'warranty';
export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}
export const SORT_KEYS: SortKey[] = ['device', 'owner', 'status', 'office', 'health', 'warranty'];

export function sortDevices(list: Device[], sort: SortState, health: Map<string, number>, users: User[]): Device[] {
  const names = new Map(users.map((u) => [u.id, u.name] as const));
  const val = (d: Device): number | string => {
    switch (sort.key) {
      case 'device':
        return d.assetTag;
      case 'owner':
        return d.assigneeId ? (names.get(d.assigneeId) ?? '~') : '~~';
      case 'status':
        return DEVICE_STATUSES.indexOf(d.status);
      case 'office':
        return OFFICES.indexOf(d.office);
      case 'health':
        return health.get(d.assetTag) ?? 100;
      case 'warranty':
        return d.warrantyEnd;
    }
  };
  return [...list].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return c * sort.dir || a.assetTag.localeCompare(b.assetTag);
  });
}

/** CSV of the given devices (current view or selection). */
export function exportFleetCsv(list: Device[], users: User[], tags: DeviceTag[], now: number, scope = 'fleet') {
  if (!list.length) {
    toast.info('Nothing to export', 'No devices match the current view.');
    return;
  }
  const people = new Map(users.map((u) => [u.id, u] as const));
  const tagName = new Map(tags.map((t) => [t.id, t.name] as const));
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const file = `${scope}-${day(now)}.csv`;
  downloadCsv(
    file,
    list.map((d) => {
      const h = deviceHealth(d, now);
      const u = d.assigneeId ? people.get(d.assigneeId) : undefined;
      const issues = complianceIssues(d, now);
      const tracked = isManagedKind(d.kind) && d.status !== 'retired' && d.status !== 'in_stock';
      return {
        'Asset tag': d.assetTag,
        Kind: KIND_LABEL[d.kind],
        Manufacturer: d.manufacturer,
        Model: d.model,
        Serial: d.serial,
        Status: DEVICE_STATUS_LABEL[d.status],
        Owner: u?.name ?? '',
        Department: u?.department ?? '',
        Office: d.office,
        Health: h,
        'Health band': HEALTH_BAND_LABEL[healthBand(h)],
        Compliance: tracked ? (issues.length ? 'Non-compliant' : 'Compliant') : 'Not tracked',
        Issues: issues.join('; '),
        OS: d.os ?? '',
        'Warranty ends': day(d.warrantyEnd),
        Warranty: warrantyInfo(d, now).state,
        Purchased: day(d.purchasedAt),
        'Cost (USD)': d.cost,
        Tags: d.tags.map((t) => `#${tagName.get(t) ?? t}`).join(' '),
        'Last check-in': d.lastCheckIn ? new Date(d.lastCheckIn).toISOString() : '',
      };
    }),
  );
  toast.success(`Exported ${plural(list.length, 'device')}`, file);
}

/* ================================================================ facets */

const keepOpen = () => undefined;

const dotLabel = (color: string | undefined, text: ReactNode) => (
  <span className="hd-fleet-opt">
    {color && <i style={{ background: color }} />}
    {text}
  </span>
);

function summary<T extends string>(list: T[] | undefined, label: (v: T) => string): ReactNode {
  if (!list?.length) return undefined;
  return list.length === 1 ? label(list[0]) : `${list.length} selected`;
}

function Facet({ label, icon, value, on, width = 252, children }: { label: string; icon: ReactNode; value?: ReactNode; on: boolean; width?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx('hd-fleet-facet', on && 'is-on')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-qa={`fleet-facet-${label.toLowerCase()}`}
      >
        {icon}
        <span>{label}</span>
        {value !== undefined && <b className="hd-fleet-facet__v">{value}</b>}
        <ChevronDown className="hd-fleet-facet__chev" />
      </button>
      <NeoPopover open={open} anchor={btn.current} onClose={close} width={width} label={`Filter by ${label.toLowerCase()}`}>
        {children(close)}
      </NeoPopover>
    </>
  );
}

export function FleetFacets({
  filter,
  onChange,
  counts,
  tags,
  searchRef,
}: {
  filter: FleetViewFilter;
  onChange: (f: FleetViewFilter) => void;
  counts: FacetCounts;
  tags: DeviceTag[];
  searchRef?: Ref<HTMLInputElement>;
}) {
  const set = (patch: Partial<FleetViewFilter>) => onChange({ ...filter, ...patch });
  const clearItem = (on: boolean, clear: () => void): MenuEntry[] => (on ? [{ kind: 'sep' }, { label: 'Clear', icon: <X />, onSelect: clear }] : []);
  const tagName = (id: string) => `#${tags.find((t) => t.id === id)?.name ?? id}`;
  const compliance = [
    filter.compliance && (filter.compliance === 'noncompliant' ? 'Failing' : 'Passing'),
    filter.warranty && (filter.warranty === 'expiring' ? 'Warranty ≤ 90d' : 'Out of warranty'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="hd-fleet-facets" role="group" aria-label="Filters">
      <NeoSearch
        value={filter.q ?? ''}
        onChange={(q) => set({ q: q || undefined })}
        placeholder="Search tag, model, serial, person, #tag"
        kbd="S"
        inputRef={searchRef}
        size="sm"
        className="hd-fleet-search"
        label="Search the fleet"
      />
      <Facet label="Status" icon={<Activity />} on={!!filter.status?.length} value={summary(filter.status, (s) => DEVICE_STATUS_LABEL[s])}>
        {() => (
          <MenuList
            onDone={keepOpen}
            items={[
              ...DEVICE_STATUSES.map<MenuEntry>((s) => ({
                label: dotLabel(DEVICE_STATUS_COLOR[s], DEVICE_STATUS_LABEL[s]),
                hint: counts.status[s] ?? 0,
                checked: !!filter.status?.includes(s),
                onSelect: () => set({ status: toggleIn(filter.status, s) }),
              })),
              ...clearItem(!!filter.status?.length, () => set({ status: undefined })),
            ]}
          />
        )}
      </Facet>
      <Facet label="Kind" icon={<Boxes />} on={!!filter.kind?.length} value={summary(filter.kind, (k) => KIND_LABEL[k])}>
        {() => (
          <MenuList
            onDone={keepOpen}
            items={[
              ...DEVICE_KINDS.map<MenuEntry>((k) => {
                const Icon = KIND_ICON[k];
                return { label: KIND_LABEL[k], icon: <Icon />, hint: counts.kind[k] ?? 0, checked: !!filter.kind?.includes(k), onSelect: () => set({ kind: toggleIn(filter.kind, k) }) };
              }),
              ...clearItem(!!filter.kind?.length, () => set({ kind: undefined })),
            ]}
          />
        )}
      </Facet>
      <Facet label="Office" icon={<MapPin />} on={!!filter.office?.length} value={summary(filter.office, (o) => o)}>
        {() => (
          <MenuList
            onDone={keepOpen}
            items={[
              ...OFFICES.map<MenuEntry>((o) => ({ label: o, hint: counts.office[o] ?? 0, checked: !!filter.office?.includes(o), onSelect: () => set({ office: toggleIn(filter.office, o) }) })),
              ...clearItem(!!filter.office?.length, () => set({ office: undefined })),
            ]}
          />
        )}
      </Facet>
      <Facet label="Health" icon={<HeartPulse />} on={!!filter.health?.length} value={summary(filter.health, (b) => HEALTH_BAND_LABEL[b])}>
        {() => (
          <MenuList
            onDone={keepOpen}
            items={[
              { kind: 'label', label: 'Health score band' },
              ...HEALTH_BANDS.map<MenuEntry>((b) => ({
                label: dotLabel(HEALTH_BAND_COLOR[b], HEALTH_BAND_LABEL[b]),
                hint: counts.health[b] ?? 0,
                checked: !!filter.health?.includes(b),
                onSelect: () => set({ health: toggleIn(filter.health, b) }),
              })),
              ...clearItem(!!filter.health?.length, () => set({ health: undefined })),
            ]}
          />
        )}
      </Facet>
      <Facet label="Compliance" icon={<ShieldCheck />} on={!!filter.compliance || !!filter.warranty} value={compliance || undefined} width={268}>
        {(close) => (
          <MenuList
            onDone={close}
            items={[
              { kind: 'label', label: 'MDM compliance' },
              {
                label: dotLabel('var(--hd-bad)', 'Non-compliant'),
                hint: counts.noncompliant,
                checked: filter.compliance === 'noncompliant',
                onSelect: () => set({ compliance: filter.compliance === 'noncompliant' ? undefined : 'noncompliant' }),
              },
              {
                label: dotLabel('var(--hd-ok)', 'Compliant'),
                hint: counts.compliant,
                checked: filter.compliance === 'compliant',
                onSelect: () => set({ compliance: filter.compliance === 'compliant' ? undefined : 'compliant' }),
              },
              { kind: 'sep' },
              { kind: 'label', label: 'Warranty' },
              {
                label: dotLabel('var(--hd-warn)', 'Ends within 90 days'),
                hint: counts.expiring,
                checked: filter.warranty === 'expiring',
                onSelect: () => set({ warranty: filter.warranty === 'expiring' ? undefined : 'expiring' }),
              },
              {
                label: dotLabel('var(--text-3)', 'Out of warranty'),
                hint: counts.expired,
                checked: filter.warranty === 'expired',
                onSelect: () => set({ warranty: filter.warranty === 'expired' ? undefined : 'expired' }),
              },
            ]}
          />
        )}
      </Facet>
      <Facet label="Tags" icon={<TagsIcon />} on={!!filter.tag?.length} value={summary(filter.tag, tagName)}>
        {() => (
          <MenuList
            onDone={keepOpen}
            items={[
              ...(tags.length ? [] : [{ kind: 'label', label: 'No tags yet' } as MenuEntry]),
              ...tags.map<MenuEntry>((t) => ({
                label: dotLabel(t.color, `#${t.name}`),
                hint: counts.tag[t.id] ?? 0,
                checked: !!filter.tag?.includes(t.id),
                onSelect: () => set({ tag: toggleIn(filter.tag, t.id) }),
              })),
              ...clearItem(!!filter.tag?.length, () => set({ tag: undefined })),
            ]}
          />
        )}
      </Facet>
    </div>
  );
}

/* ================================================================ saved views */

export function FleetViewChips({
  views,
  current,
  counts,
  onApply,
  onDelete,
  trailing,
}: {
  views: FleetViewDef[];
  current: string;
  counts: Record<string, number>;
  onApply: (v: FleetViewDef) => void;
  onDelete: (v: FleetViewDef) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="hd-fleet-views" role="toolbar" aria-label="Views">
      {views.map((v) => {
        const on = filterKey(v.filter) === current;
        return (
          <span key={v.id} className={cx('hd-fleet-view', on && 'is-on', !v.builtin && 'is-mine')}>
            <button type="button" onClick={() => onApply(v)} aria-pressed={on} data-qa={`fleet-view-${v.id}`}>
              {!v.builtin && <Bookmark />}
              <span className="hd-fleet-view__name">{v.name}</span>
              <b>{counts[v.id] ?? 0}</b>
            </button>
            {!v.builtin && (
              <button type="button" className="hd-fleet-view__x" onClick={() => onDelete(v)} aria-label={`Delete view ${v.name}`} data-tip="Delete view">
                <X />
              </button>
            )}
          </span>
        );
      })}
      {trailing}
    </div>
  );
}

/** "Save view" with an inline naming popover. `onSave` returns an error message or null. */
export function SaveViewButton({ disabled, onSave }: { disabled: boolean; onSave: (name: string) => string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setError('');
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = onSave(name);
    if (err) return setError(err);
    setName('');
    close();
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="neo-btn neo-btn--ghost neo-btn--xs hd-fleet-saveview"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-tip={disabled ? 'Filter the fleet first, then save it as a view' : undefined}
        data-qa="fleet-saveview"
      >
        <BookmarkPlus /> Save view
      </button>
      <NeoPopover open={open} anchor={btn.current} onClose={close} width={292} placement="bottom-end" label="Save view">
        <form className="hd-fleet-savepop" onSubmit={submit}>
          <div className="neo-hud">Save current filters</div>
          <input className="neo-input neo-input--sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai laptops at risk" maxLength={40} aria-label="View name" />
          {error && (
            <p className="hd-formerr" role="alert">
              {error}
            </p>
          )}
          <div className="hd-fleet-savepop__foot">
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="neo-btn neo-btn--plasma neo-btn--xs">
              Save view
            </button>
          </div>
        </form>
      </NeoPopover>
    </>
  );
}

/* ================================================================ bulk actions */

type BulkStatus = 'in_stock' | 'in_repair' | 'retired';

export function FleetBulkBar({
  selected,
  devices,
  tags,
  viewer,
  onClear,
  onExport,
}: {
  selected: string[];
  devices: Device[];
  tags: DeviceTag[];
  viewer: HdViewer | null;
  onClear: () => void;
  onExport: () => void;
}) {
  const [confirm, setConfirm] = useState<{ open: boolean; status: Exclude<BulkStatus, 'in_repair'> }>({ open: false, status: 'in_stock' });
  const picked = useMemo(() => devices.filter((d) => selected.includes(d.assetTag)), [devices, selected]);
  const n = picked.length;
  const assigned = picked.filter((d) => d.assigneeId).length;
  const lost = picked.filter((d) => d.status === 'lost').length;

  const runStatus = (status: BulkStatus) => {
    const r = useHelpdesk.getState().bulkDeviceStatus(selected, status, viewer);
    if (!r.ok) return toast.error(r.error);
    const skipped = n - r.count;
    const title = status === 'in_repair' ? `Sent ${plural(r.count, 'device')} to the IT bench` : status === 'retired' ? `Retired ${plural(r.count, 'device')}` : `Moved ${plural(r.count, 'device')} to stock`;
    toast.success(title, skipped ? `${skipped} skipped — lost, retired or already there` : status === 'in_repair' ? 'Owners notified · custody logged' : 'Custody logged · audit written');
  };

  const tagItems: MenuEntry[] = tags.length
    ? tags.map((t) => {
        const have = picked.filter((d) => d.tags.includes(t.id)).length;
        const all = n > 0 && have === n;
        return {
          label: (
            <span className="hd-menutag">
              <i style={{ background: t.color }} />#{t.name}
            </span>
          ),
          checked: all,
          hint: have && !all ? `${have}/${n}` : undefined,
          onSelect: () => {
            const r = useHelpdesk.getState().bulkTag(selected, t.id, !all, viewer);
            if (!r.ok) return void toast.error(r.error);
            toast.success(all ? `Removed #${t.name}` : `Tagged #${t.name}`, `${plural(r.count, 'device')} updated`);
          },
        };
      })
    : [{ kind: 'label', label: 'No tags yet' }];

  return (
    <div className="hd-fleet-bulk" role="toolbar" aria-label="Bulk actions" data-qa="fleet-bulk">
      <span className="hd-fleet-bulk__count">
        <b className="neo-num">{n}</b> selected
      </span>
      <span className="hd-fleet-bulk__sep" aria-hidden="true" />
      <NeoMenu
        label="Tag selected devices"
        width={250}
        placement="bottom-start"
        items={tagItems}
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--xs" data-qa="bulk-tag">
            <TagsIcon /> Tag <ChevronDown />
          </button>
        )}
      />
      <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => runStatus('in_repair')} data-qa="bulk-repair">
        <Wrench /> Send to repair
      </button>
      <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setConfirm({ open: true, status: 'in_stock' })} data-qa="bulk-stock">
        <Warehouse /> Move to stock
      </button>
      <button type="button" className="neo-btn neo-btn--danger neo-btn--xs" onClick={() => setConfirm({ open: true, status: 'retired' })} data-qa="bulk-retire">
        <Archive /> Retire
      </button>
      <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onExport} data-qa="bulk-export">
        <Download /> Export
      </button>
      <button type="button" className="neo-iconbtn neo-iconbtn--sm hd-fleet-bulk__clear" onClick={onClear} aria-label="Clear selection" data-tip="Clear selection">
        <X />
      </button>
      <Modal
        open={confirm.open}
        onClose={() => setConfirm((c) => ({ ...c, open: false }))}
        width={480}
        className="neo-portal"
        icon={<span className="hd-fixmodal__icon" data-tone={confirm.status === 'retired' ? 'danger' : undefined}>{confirm.status === 'retired' ? <Archive /> : <Warehouse />}</span>}
        title={confirm.status === 'retired' ? `Retire ${plural(n, 'device')}?` : `Move ${plural(n, 'device')} to stock?`}
        subtitle={confirm.status === 'retired' ? 'They leave the active fleet and compliance reporting.' : 'They return to the IT bench, ready to re-issue.'}
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setConfirm((c) => ({ ...c, open: false }))}>
              Cancel
            </button>
            <button
              type="button"
              className={confirm.status === 'retired' ? 'neo-btn neo-btn--danger' : 'neo-btn neo-btn--plasma'}
              onClick={() => {
                runStatus(confirm.status);
                setConfirm((c) => ({ ...c, open: false }));
              }}
              data-qa="bulk-confirm"
            >
              {confirm.status === 'retired' ? <Archive /> : <Warehouse />} {confirm.status === 'retired' ? 'Retire devices' : 'Move to stock'}
            </button>
          </>
        }
      >
        <div className="hd-form">
          <p className="hd-warnnote">
            {assigned > 0 ? `${plural(assigned, 'device is', 'devices are')} assigned to people — they’ll be unassigned and the custody log updated. ` : 'Custody is logged for every device. '}
            {lost > 0 ? `${plural(lost, 'lost device')} will be skipped.` : 'Every change is audited.'}
          </p>
          <ul className="hd-fleet-confirm">
            {picked.slice(0, 6).map((d) => (
              <li key={d.assetTag}>
                <span className="neo-mono">{d.assetTag}</span>
                <span className="truncate">{d.model}</span>
                <span className="hd-devstate" data-status={d.status}>
                  {DEVICE_STATUS_LABEL[d.status]}
                </span>
              </li>
            ))}
            {n > 6 && <li className="neo-faint">+{n - 6} more</li>}
          </ul>
        </div>
      </Modal>
    </div>
  );
}

/* ================================================================ cells */

const CP_ABBR: Record<string, string> = { enc: 'ENC', fw: 'FW', os: 'OS', mdm: 'MDM' };

export function MiniCompliance({ d, now }: { d: Device; now: number }) {
  if (d.status === 'retired') return <span className="hd-fleet-none">Retired</span>;
  const pills = compliancePills(d, now);
  if (!pills.length) return <span className={cx('hd-fleet-none', d.firmwareCurrent === false && 'is-warn')}>{d.firmwareCurrent === false ? 'Firmware due' : 'Peripheral'}</span>;
  return (
    <span className="hd-fleet-cps" role="img" aria-label={pills.map((p) => `${p.label} ${p.ok ? 'passing' : 'failing'}`).join(', ')}>
      {pills.map((p) => (
        <span key={p.id} className="hd-fleet-cp" data-ok={p.ok || undefined} title={`${p.label}: ${p.ok ? 'passing' : 'needs attention'}`}>
          {CP_ABBR[p.id] ?? p.label}
        </span>
      ))}
    </span>
  );
}

export function MiniWarranty({ d, now }: { d: Device; now: number }) {
  const w = warrantyInfo(d, now);
  const label = w.state === 'expired' ? 'Expired' : w.daysLeft > 60 ? `${Math.round(w.daysLeft / 30.4)} mo` : `${w.daysLeft} d`;
  return (
    <span className="hd-fleet-war" data-state={w.state} title={`Warranty ${w.state === 'expired' ? 'ended' : 'ends'} ${formatDate(d.warrantyEnd)}`}>
      <span className="hd-fleet-war__track">
        <i style={{ width: `${Math.max(3, w.pct * 100)}%` }} />
      </span>
      <span className="hd-fleet-war__v">{label}</span>
    </span>
  );
}

export function StatusCell({ d, now }: { d: Device; now: number }) {
  let sub: { text: string; bad?: boolean } | null = null;
  if (d.status === 'loaner' && d.loan) sub = d.loan.dueAt < now ? { text: `overdue · ${relativeTime(d.loan.dueAt, now)}`, bad: true } : { text: `due ${relativeTime(d.loan.dueAt, now)}`, bad: d.loan.dueAt - now < 2 * DAY };
  else if (d.status === 'in_repair' && d.repair) sub = { text: d.repair.eta ? `back ${relativeTime(d.repair.eta, now)}` : d.repair.vendor };
  else if (d.status === 'lost') sub = { text: d.locked ? 'locked · MDM' : 'lock pending', bad: true };
  else if (d.status === 'in_use' && isManagedKind(d.kind) && d.lastCheckIn) sub = { text: `seen ${relativeTime(d.lastCheckIn, now)}`, bad: now - d.lastCheckIn > 7 * DAY };
  return (
    <span className="hd-fleet-status">
      <span className="hd-devstate" data-status={d.status}>
        {DEVICE_STATUS_LABEL[d.status]}
      </span>
      {sub && <span className={cx('hd-fleet-status__sub', sub.bad && 'is-bad')}>{sub.text}</span>}
    </span>
  );
}

export function TagList({ ids, tagsById, max = 2 }: { ids: string[]; tagsById: Map<string, DeviceTag>; max?: number }) {
  const list = ids.map((id) => tagsById.get(id)).filter((t): t is DeviceTag => !!t);
  if (!list.length) return <span className="hd-fleet-none">—</span>;
  return (
    <span className="hd-fleet-tags">
      {list.slice(0, max).map((t) => (
        <TagChip key={t.id} tag={t} size="sm" />
      ))}
      {list.length > max && (
        <span className="hd-fleet-more" title={list.slice(max).map((t) => `#${t.name}`).join(' ')}>
          +{list.length - max}
        </span>
      )}
    </span>
  );
}

/* ================================================================ table */

const deviceRoute = (tag: string) => `/helpdesk/fleet/${tag}`;

interface ListProps {
  devices: Device[];
  health: Map<string, number>;
  now: number;
  selected: Set<string>;
  onToggle: (tag: string) => void;
  tagsById: Map<string, DeviceTag>;
}

export function FleetTable({ devices, health, now, selected, onToggle, onToggleAll, tagsById, sort, onSort }: ListProps & { onToggleAll: (on: boolean) => void; sort: SortState; onSort: (key: SortKey) => void }) {
  const navigate = useNavigate();
  const allOn = devices.length > 0 && devices.every((d) => selected.has(d.assetTag));
  const someOn = !allOn && devices.some((d) => selected.has(d.assetTag));
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someOn;
  }, [someOn]);

  const th = (key: SortKey, label: string, cls?: string) => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={cx('hd-fleet-th', sort.key === key && 'is-on')} onClick={() => onSort(key)}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp /> : <ArrowDown />)}
      </button>
    </th>
  );

  return (
    <div className="neo-table-wrap hd-fleet-tablewrap">
      <table className="neo-table hd-fleet-table">
        <thead>
          <tr>
            <th className="hd-fleet-col-check">
              <input ref={allRef} type="checkbox" className="neo-check" checked={allOn} onChange={() => onToggleAll(!allOn)} aria-label="Select all devices in this view" />
            </th>
            {th('device', 'Device')}
            {th('owner', 'Owner', 'hd-fleet-col-owner')}
            {th('status', 'Status')}
            {th('office', 'Office', 'hd-fleet-col-office')}
            {th('health', 'Health')}
            <th className="hd-fleet-col-comp">Compliance</th>
            {th('warranty', 'Warranty', 'hd-fleet-col-warranty')}
            <th className="hd-fleet-col-tags">Tags</th>
            <th className="hd-fleet-col-go" aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const h = health.get(d.assetTag) ?? 100;
            const band = healthBand(h);
            const on = selected.has(d.assetTag);
            return (
              <tr
                key={d.assetTag}
                className={cx('hd-fleet-row', on && 'is-selected')}
                data-status={d.status}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, button, input, label')) return;
                  navigate(deviceRoute(d.assetTag));
                }}
                data-qa={`fleet-row-${d.assetTag}`}
              >
                <td className="hd-fleet-col-check">
                  <input type="checkbox" className="neo-check" checked={on} onChange={() => onToggle(d.assetTag)} aria-label={`Select ${d.assetTag}`} />
                </td>
                <td>
                  <Link to={deviceRoute(d.assetTag)} className="hd-fleet-dev">
                    <span className="hd-fleet-dev__glyph" style={{ ['--holo' as string]: holoColor(d) ?? 'var(--app-c1)' }}>
                      <DeviceGlyph kind={d.kind} size={42} color={holoColor(d)} />
                    </span>
                    <span className="hd-fleet-dev__text">
                      <span className="hd-fleet-dev__model">{d.model}</span>
                      <span className="hd-fleet-dev__meta">
                        <span className="neo-mono">{d.assetTag}</span> · {KIND_LABEL[d.kind]}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="hd-fleet-col-owner">{d.assigneeId ? <Person userId={d.assigneeId} size={26} /> : <span className="hd-fleet-none">{d.status === 'in_stock' ? 'In stock' : 'Unassigned'}</span>}</td>
                <td>
                  <StatusCell d={d} now={now} />
                </td>
                <td className="hd-fleet-col-office">{d.office}</td>
                <td>
                  <span className="hd-fleet-health" data-band={band}>
                    <HealthRing score={h} size={34} stroke={3.5} />
                    <span>{HEALTH_BAND_LABEL[band]}</span>
                  </span>
                </td>
                <td className="hd-fleet-col-comp">
                  <MiniCompliance d={d} now={now} />
                </td>
                <td className="hd-fleet-col-warranty">
                  <MiniWarranty d={d} now={now} />
                </td>
                <td className="hd-fleet-col-tags">
                  <TagList ids={d.tags} tagsById={tagsById} />
                </td>
                <td className="hd-fleet-col-go">
                  <ChevronRight />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================ grid */

export function FleetGrid({ devices, health, now, selected, onToggle, tagsById, users }: ListProps & { users: User[] }) {
  const names = useMemo(() => new Map(users.map((u) => [u.id, u.name] as const)), [users]);
  return (
    <div className="hd-fleet-grid neo-stagger" data-selecting={selected.size > 0 || undefined}>
      {devices.map((d, i) => {
        const h = health.get(d.assetTag) ?? 100;
        const on = selected.has(d.assetTag);
        const color = holoColor(d);
        const owner = d.assigneeId ? names.get(d.assigneeId) : undefined;
        return (
          <div key={d.assetTag} className={cx('hd-fleet-card neo-spot', on && 'is-selected')} data-status={d.status} style={{ ['--i' as string]: Math.min(i, 14), ['--holo' as string]: color ?? 'var(--app-c1)' }}>
            <label className="hd-fleet-card__check">
              <input type="checkbox" className="neo-check" checked={on} onChange={() => onToggle(d.assetTag)} aria-label={`Select ${d.assetTag}`} />
            </label>
            <Link to={deviceRoute(d.assetTag)} className="hd-fleet-card__link" aria-label={`${d.model}, ${d.assetTag}, health ${h}`} data-qa={`fleet-card-${d.assetTag}`}>
              <span className="hd-fleet-card__top">
                <span className="neo-hud">{d.assetTag}</span>
                <span className="hd-devstate" data-status={d.status}>
                  {DEVICE_STATUS_LABEL[d.status]}
                </span>
              </span>
              <span className="hd-fleet-card__stage" aria-hidden="true">
                <DeviceGlyph kind={d.kind} size={104} color={color} />
              </span>
              <span className="hd-fleet-card__info">
                <span className="hd-fleet-card__titles">
                  <span className="hd-fleet-card__model">{d.model}</span>
                  <span className="hd-fleet-card__owner">{owner ? `${owner} · ${d.office}` : d.status === 'in_stock' ? `In stock · ${d.office}` : d.office}</span>
                </span>
                <span className="hd-fleet-health" data-band={healthBand(h)}>
                  <HealthRing score={h} size={38} stroke={3.5} />
                </span>
              </span>
              <span className="hd-fleet-card__foot">
                <MiniCompliance d={d} now={now} />
                <TagList ids={d.tags} tagsById={tagsById} max={1} />
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
