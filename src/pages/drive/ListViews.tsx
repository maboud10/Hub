/**
 * Flat list views sharing one ItemList: Shared with me, Recent, Starred,
 * Trash (restore / delete forever / empty) and search results with filters.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Clock, Filter, LayoutGrid, List, Search, Star, Trash2, Users, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { KIND_META, SENSITIVITY_META, TRASH_RETENTION_DAYS, formatBytes } from '@/drive/constants';
import { useDrive } from '@/drive/store';
import { useDriveSearch, useRecentItems, useSharedWithMe, useStarredItems, useTrash, type DriveSearchFilters, type ItemWithRole } from '@/drive/selectors';
import type { ItemKind, Sensitivity } from '@/drive/types';
import { useItemActions } from './actions';
import { ItemList, sortRows, useViewMode, type SortState } from './shared';

function ListShell({ title, icon, description, rows, emptyTitle, emptyBody, showLocation = true, allowGrid = true }: { title: string; icon: ReactNode; description: string; rows: ItemWithRole[]; emptyTitle: string; emptyBody: string; showLocation?: boolean; allowGrid?: boolean }) {
  const actions = useItemActions();
  const [mode, setMode] = useViewMode();
  const [sort, setSort] = useState<SortState>({ key: 'modified', dir: 'desc' });
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const bytes = rows.reduce((n, r) => n + r.item.sizeBytes, 0);
  return (
    <div className="dr-view">
      <header className="dr-view__head">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="dr-view__title">
            {icon} {title} <span className="count">{rows.length}</span>
          </h1>
          <p className="text-sm muted">{description}</p>
        </div>
        <span className="text-xs muted dr-hide-sm">{formatBytes(bytes)}</span>
        {allowGrid && (
          <div className="dr-seg dr-seg--mini" role="group" aria-label="View">
            <button type="button" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} title="Grid">
              <LayoutGrid />
            </button>
            <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')} title="List">
              <List />
            </button>
          </div>
        )}
      </header>
      {rows.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle}>
          {emptyBody}
        </EmptyState>
      ) : (
        <ItemList rows={sorted} mode={allowGrid ? mode : 'list'} onOpen={actions.open} onMenu={actions.openMenu} onStar={actions.star} sort={sort} onSort={setSort} showLocation={showLocation} renamingId={actions.renamingId} onRename={actions.commitRename} onCancelRename={() => actions.setRenamingId(null)} />
      )}
      {actions.overlays}
    </div>
  );
}

export function SharedWithMeView() {
  const rows = useSharedWithMe();
  return <ListShell title="Shared with me" icon={<Users />} description="Files shared with you by name or through a link, outside your own drive. Team-drive files you inherit live under Shared drives." rows={rows} emptyTitle="Nothing shared with you yet" emptyBody="When someone shares a file with you directly, it appears here." />;
}

export function RecentView() {
  const rows = useRecentItems(20);
  return <ListShell title="Recent" icon={<Clock />} description="The last files you opened, newest first." rows={rows} emptyTitle="No recent files" emptyBody="Open a file and it will show up here." />;
}

export function StarredView() {
  const rows = useStarredItems();
  return <ListShell title="Starred" icon={<Star />} description="Your pinned files and folders across every drive." rows={rows} emptyTitle="No starred items" emptyBody="Star files from the ⋯ menu or the star icon to keep them one click away." />;
}

export function TrashView() {
  const rows = useTrash();
  const restoreItem = useDrive((s) => s.restoreItem);
  const deleteForever = useDrive((s) => s.deleteForever);
  const emptyTrash = useDrive((s) => s.emptyTrash);
  const actions = useItemActions();
  const [sort, setSort] = useState<SortState>({ key: 'modified', dir: 'desc' });
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.item.trashedAt ?? 0) - (a.item.trashedAt ?? 0)), [rows]);
  const purgeable = rows.filter((r) => r.item.retention === 'none').length;
  const bytes = rows.reduce((n, r) => n + r.item.sizeBytes, 0);
  return (
    <div className="dr-view">
      <header className="dr-view__head">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="dr-view__title">
            <Trash2 /> Trash <span className="count">{rows.length}</span>
          </h1>
          <p className="text-sm muted">Items you manage that were moved to trash. They’re purged automatically after {TRASH_RETENTION_DAYS} days unless a retention policy protects them.</p>
        </div>
        <span className="text-xs muted dr-hide-sm">{formatBytes(bytes)}</span>
        <button type="button" className="btn btn--sm btn--danger" disabled={purgeable === 0} onClick={() => toast.result(emptyTrash())} title={purgeable === 0 ? 'Nothing can be purged — retained items stay' : undefined}>
          <Trash2 /> Empty trash{purgeable ? ` (${purgeable})` : ''}
        </button>
      </header>
      {rows.length === 0 ? (
        <EmptyState icon={<Trash2 />} title="Trash is empty">
          Trashed files you manage appear here for {TRASH_RETENTION_DAYS} days before they’re gone for good.
        </EmptyState>
      ) : (
        <ItemList
          rows={sorted}
          mode="list"
          onOpen={actions.open}
          onMenu={(row, anchor) => actions.openMenu(row, anchor)}
          sort={sort}
          onSort={setSort}
          showLocation
          trash={{
            onRestore: (row) => toast.result(restoreItem(row.item.id)),
            onDelete: (row) => {
              if (window.confirm(`Permanently delete “${row.item.name}”? This can’t be undone.`)) toast.result(deleteForever(row.item.id));
            },
          }}
        />
      )}
      {actions.overlays}
    </div>
  );
}

// ───────────────────────── search ─────────────────────────

const KINDS = Object.keys(KIND_META) as ItemKind[];
const SENS = Object.keys(SENSITIVITY_META) as Sensitivity[];

export function hasActiveFilters(f: DriveSearchFilters) {
  return Boolean((f.kind && f.kind !== 'any') || (f.sensitivity && f.sensitivity !== 'any') || f.ownerId || f.modifiedWithinDays || f.driveId);
}

export function SearchResultsView({ query, filters, onFilters, onClear }: { query: string; filters: DriveSearchFilters; onFilters: (f: DriveSearchFilters) => void; onClear: () => void }) {
  const results = useDriveSearch(query, filters);
  const users = useHub((s) => s.users);
  const drives = useDrive((s) => s.drives);
  const actions = useItemActions();
  const [mode, setMode] = useViewMode();
  const owners = useMemo(() => users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const set = (patch: Partial<DriveSearchFilters>) => onFilters({ ...filters, ...patch });
  const active = hasActiveFilters(filters);

  return (
    <div className="dr-view">
      <header className="dr-view__head">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="dr-view__title">
            <Search /> {query.trim() ? <>Results for “{query.trim()}”</> : 'Filtered files'} <span className="count">{results.length}</span>
          </h1>
          <p className="text-sm muted">Searches names, descriptions, tags and file contents — only across files you can open.</p>
        </div>
        <div className="dr-seg dr-seg--mini" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} title="Grid">
            <LayoutGrid />
          </button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')} title="List">
            <List />
          </button>
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClear}>
          <X /> Clear
        </button>
      </header>
      <div className="dr-filters" role="group" aria-label="Filters">
        <span className="dr-filters__label">
          <Filter /> Filters
        </span>
        <label className={cx('dr-filter', filters.kind && filters.kind !== 'any' && 'is-active')}>
          <span>Type</span>
          <select value={filters.kind ?? 'any'} onChange={(e) => set({ kind: e.target.value as ItemKind | 'any' })}>
            <option value="any">Any</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className={cx('dr-filter', filters.sensitivity && filters.sensitivity !== 'any' && 'is-active')}>
          <span>Label</span>
          <select value={filters.sensitivity ?? 'any'} onChange={(e) => set({ sensitivity: e.target.value as Sensitivity | 'any' })}>
            <option value="any">Any</option>
            {SENS.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className={cx('dr-filter', filters.ownerId && 'is-active')}>
          <span>Owner</span>
          <select value={filters.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || undefined })}>
            <option value="">Anyone</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className={cx('dr-filter', filters.modifiedWithinDays && 'is-active')}>
          <span>Modified</span>
          <select value={filters.modifiedWithinDays ?? 0} onChange={(e) => set({ modifiedWithinDays: Number(e.target.value) || undefined })}>
            <option value={0}>Any time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <label className={cx('dr-filter', filters.driveId && 'is-active')}>
          <span>Drive</span>
          <select value={filters.driveId ?? ''} onChange={(e) => set({ driveId: e.target.value || undefined })}>
            <option value="">All drives</option>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>
                {d.icon} {d.name}
              </option>
            ))}
          </select>
        </label>
        {active && (
          <button type="button" className="chip" onClick={() => onFilters({})}>
            <X /> Reset filters
          </button>
        )}
      </div>
      {results.length === 0 ? (
        <EmptyState icon={<Search />} title="No matches">
          Try fewer filters or a different word. Files you can’t open never appear in search.
        </EmptyState>
      ) : (
        <ItemList rows={results} mode={mode} onOpen={actions.open} onMenu={actions.openMenu} onStar={actions.star} showLocation renamingId={actions.renamingId} onRename={actions.commitRename} onCancelRename={() => actions.setRenamingId(null)} />
      )}
      {actions.overlays}
    </div>
  );
}
