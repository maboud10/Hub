/**
 * Folder browser: breadcrumbs that accept drops, a plain-language role
 * banner, grid/list toggle, sorting, multi-select with a bulk bar, drag-and-
 * drop moves, OS file drops, inline new-folder and the full context menu.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronRight, FolderPlus, Info, LayoutGrid, List, Lock, Settings, Shield, Star, Trash2, Upload, X, FolderInput, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { formatBytes } from '@/drive/constants';
import { folderLink, itemLink, useDrive } from '@/drive/store';
import { useFolder, useVisibleDrives, type ItemWithRole } from '@/drive/selectors';
import type { DriveItem } from '@/drive/types';
import { useItemActions } from './actions';
import { DriveSettingsDrawer, UploadDialog } from './DriveDialogs';
import { ItemList, SORT_LABEL, SensitivityPill, RolePill, describeRole, hasDragFiles, hasDragItems, shortVia, sortRows, useRoleExplanation, useViewMode, type SortKey, type SortState } from './shared';

export function FolderView() {
  const { driveId, folderId } = useParams<{ driveId: string; folderId?: string }>();
  const navigate = useNavigate();
  const { drive, folder, folderRole, canCreateHere, entries, crumbs } = useFolder(driveId, folderId ?? null);
  const visible = useVisibleDrives();
  const canManageDrive = visible.find((d) => d.drive.id === driveId)?.canManage ?? false;
  const chain = useMemo(() => [...crumbs].reverse(), [crumbs]);
  const explanation = useRoleExplanation(drive, chain);
  const createFolder = useDrive((s) => s.createFolder);
  const uploadFiles = useDrive((s) => s.uploadFiles);
  const existsAnywhere = useDrive((s) => Boolean(folderId && s.items.some((i) => i.id === folderId)));

  const [mode, setMode] = useViewMode();
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastIndex = useRef<number | null>(null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileDrag, setFileDrag] = useState(false);
  const [crumbDrop, setCrumbDrop] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const clearSelection = () => {
    setSelected(new Set());
    lastIndex.current = null;
  };
  const actions = useItemActions({ onMoved: clearSelection });
  const rows = useMemo(() => sortRows(entries, sort), [entries, sort]);

  useEffect(() => {
    clearSelection();
    setNewFolderName(null);
  }, [driveId, folderId]);

  // Keyboard: Esc clears selection / cancels new folder.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!drive) {
    return (
      <EmptyState icon={<Lock />} title="This drive isn’t available to you">
        It may not exist, or your roles and department don’t match its membership rules. Ask a drive manager to add you.
      </EmptyState>
    );
  }
  if (folderId && !folder) {
    return (
      <EmptyState icon={<Lock />} title={existsAnywhere ? 'Folder not found here' : 'Folder not found'} action={<Link className="btn" to={folderLink(drive.id)}>Back to {drive.name}</Link>}>
        {existsAnywhere ? 'This folder lives in a different drive or was moved.' : 'It may have been deleted or the link is wrong.'}
      </EmptyState>
    );
  }
  if (!folderRole) {
    return (
      <EmptyState
        icon={<Lock />}
        title={folder ? `You don’t have access to “${folder.name}”` : `You don’t have access to ${drive.name}`}
        action={folder ? <Link className="btn dr-btn-amber" to={itemLink(folder.id)}>Request access</Link> : undefined}
      >
        {folder ? 'This folder stopped inheriting permissions or carries a stricter sensitivity label. You can ask its owner for access.' : 'Ask a drive manager to add you through a membership rule.'}
      </EmptyState>
    );
  }

  const location = { driveId: drive.id, folderId: folder?.id ?? null, label: folder?.name ?? drive.name };

  const onSelect = (row: ItemWithRole, index: number, mods: { shift: boolean; meta: boolean }) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (mods.shift && lastIndex.current !== null) {
        const [a, b] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)];
        for (let i = a; i <= b; i += 1) next.add(rows[i].item.id);
      } else if (next.has(row.item.id)) next.delete(row.item.id);
      else next.add(row.item.id);
      return next;
    });
    lastIndex.current = index;
  };

  const selectedRows = rows.filter((r) => selected.has(r.item.id));
  const onMoveToFolder = (ids: string[], target: DriveItem) => actions.moveMany(ids, target.driveId, target.id, target.name);

  const dropOnCrumb = (e: DragEvent, targetFolderId: string | null, label: string) => {
    if (!hasDragItems(e)) return;
    e.preventDefault();
    setCrumbDrop(null);
    try {
      const ids = (JSON.parse(e.dataTransfer.getData('application/x-helix-drive-items')) as string[]).filter((id) => id !== targetFolderId);
      if (ids.length) actions.moveMany(ids, drive.id, targetFolderId, label);
    } catch {
      /* ignore */
    }
  };

  const onFileDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setFileDrag(false);
    if (!canCreateHere) {
      toast.error('You need editor access here to upload.');
      return;
    }
    const files = Array.from(e.dataTransfer.files).map((f) => ({ name: f.name, sizeBytes: f.size }));
    if (files.length) toast.result(uploadFiles(drive.id, folder?.id ?? null, files));
  };

  const submitNewFolder = () => {
    if (newFolderName === null) return;
    if (!newFolderName.trim()) {
      setNewFolderName(null);
      return;
    }
    if (toast.result(createFolder(drive.id, folder?.id ?? null, newFolderName))) setNewFolderName(null);
  };

  return (
    <div
      className={cx('dr-folder', fileDrag && 'is-filedrag')}
      onDragEnter={(e) => {
        if (!hasDragFiles(e)) return;
        dragDepth.current += 1;
        setFileDrag(true);
      }}
      onDragOver={(e) => {
        if (hasDragFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasDragFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setFileDrag(false);
      }}
      onDrop={onFileDrop}
    >
      <header className="dr-folder__head">
        <nav className="dr-crumbs" aria-label="Breadcrumb">
          <Link
            to={folderLink(drive.id)}
            className={cx('dr-crumb dr-crumb--root', crumbDrop === 'root' && 'is-drop', !folder && 'is-current')}
            aria-current={!folder ? 'page' : undefined}
            onDragOver={(e) => {
              if (hasDragItems(e) && folder) {
                e.preventDefault();
                setCrumbDrop('root');
              }
            }}
            onDragLeave={() => setCrumbDrop(null)}
            onDrop={(e) => dropOnCrumb(e, null, drive.name)}
          >
            <span className="dr-drive-emoji" style={{ '--c': drive.color } as CSSProperties}>
              {drive.icon}
            </span>
            {drive.name}
          </Link>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.id} className="dr-crumbs__seg">
                <ChevronRight aria-hidden="true" />
                {last ? (
                  <span className="dr-crumb is-current" aria-current="page">
                    {c.name}
                  </span>
                ) : (
                  <Link
                    to={folderLink(drive.id, c.id)}
                    className={cx('dr-crumb', crumbDrop === c.id && 'is-drop')}
                    onDragOver={(e) => {
                      if (hasDragItems(e)) {
                        e.preventDefault();
                        setCrumbDrop(c.id);
                      }
                    }}
                    onDragLeave={() => setCrumbDrop(null)}
                    onDrop={(e) => dropOnCrumb(e, c.id, c.name)}
                  >
                    {c.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
        <div className="dr-folder__tools">
          {canCreateHere && (
            <>
              <button type="button" className="btn btn--sm" onClick={() => setNewFolderName('')}>
                <FolderPlus /> New folder
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setUploadOpen(true)}>
                <Upload /> Upload
              </button>
            </>
          )}
          <label className="dr-sortsel">
            <span className="sr-only">Sort by</span>
            <select className="select select--sm" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
              setSort({ key, dir });
            }}>
              {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                <option key={`${k}:asc`} value={`${k}:asc`}>
                  {SORT_LABEL[k]} ↑
                </option>,
                <option key={`${k}:desc`} value={`${k}:desc`}>
                  {SORT_LABEL[k]} ↓
                </option>,
              ])}
            </select>
          </label>
          <div className="dr-seg dr-seg--mini" role="group" aria-label="View">
            <button type="button" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} title="Grid">
              <LayoutGrid />
            </button>
            <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')} title="List">
              <List />
            </button>
          </div>
          {canManageDrive && drive.kind !== 'personal' && (
            <button type="button" className="icon-btn icon-btn--sm" title="Drive settings" aria-label="Drive settings" onClick={() => setSettingsOpen(true)}>
              <Settings />
            </button>
          )}
          {folder && (
            <Link to={`${itemLink(folder.id)}?tab=access`} className="icon-btn icon-btn--sm" title="Folder details & access" aria-label="Folder details & access">
              <Info />
            </Link>
          )}
        </div>
      </header>

      <div className={cx('dr-banner', `dr-banner--${folderRole}`)}>
        <Shield aria-hidden="true" />
        <span className="grow">{describeRole(explanation, folder ? 'in this folder' : 'in this drive')}</span>
        <RolePill role={folderRole} via={shortVia(explanation)} />
        {folder && <SensitivityPill sensitivity={folder.sensitivity} compact />}
        {folder && !folder.inheritPermissions && (
          <span className="badge badge--warning" title="This folder has its own permissions — it doesn’t inherit from the drive.">
            <Lock /> Inheritance off
          </span>
        )}
        {!folder && drive.description && <span className="text-xs muted dr-hide-sm truncate">{drive.description}</span>}
      </div>

      {selected.size > 0 && (
        <div className="dr-bulk" role="toolbar" aria-label="Bulk actions">
          <span className="dr-bulk__count">
            <Check /> {selected.size} selected
          </span>
          <button type="button" className="btn btn--sm" onClick={() => actions.move([...selected])}>
            <FolderInput /> Move
          </button>
          <button type="button" className="btn btn--sm" onClick={() => actions.starMany(selectedRows)}>
            <Star /> Star
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={() => {
            actions.trashMany(selectedRows);
            clearSelection();
          }}>
            <Trash2 /> Trash
          </button>
          <span className="text-xs muted dr-hide-sm">Shift-click for ranges · drag onto a folder or breadcrumb to move</span>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Clear selection" onClick={clearSelection}>
            <X />
          </button>
        </div>
      )}

      {newFolderName !== null && (
        <div className="dr-newfolder">
          <FolderPlus />
          <input
            className="input"
            autoFocus
            value={newFolderName}
            placeholder="Folder name"
            aria-label="New folder name"
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewFolder();
              if (e.key === 'Escape') setNewFolderName(null);
            }}
          />
          <button type="button" className="btn btn--sm dr-btn-amber" onClick={submitNewFolder} disabled={!newFolderName.trim()}>
            Create
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setNewFolderName(null)}>
            Cancel
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className={cx('dr-empty-drop', canCreateHere && 'is-droppable')}>
          <EmptyState
            icon={<Upload />}
            title={folder ? `${folder.name} is empty` : `${drive.name} is empty`}
            action={
              canCreateHere ? (
                <div className="row row--wrap" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn dr-btn-amber" onClick={() => setUploadOpen(true)}>
                    <Upload /> Upload files
                  </button>
                  <button type="button" className="btn" onClick={() => setNewFolderName('')}>
                    <FolderPlus /> New folder
                  </button>
                </div>
              ) : undefined
            }
          >
            {canCreateHere ? 'Drop files from your computer anywhere on this page, or use + New.' : 'Nothing has been shared here yet.'}
          </EmptyState>
        </div>
      ) : (
        <ItemList
          rows={rows}
          mode={mode}
          onOpen={(row) => navigate(row.item.kind === 'folder' ? folderLink(row.item.driveId, row.item.id) : itemLink(row.item.id))}
          onMenu={actions.openMenu}
          onStar={actions.star}
          selected={selected}
          onSelect={onSelect}
          sort={sort}
          onSort={setSort}
          renamingId={actions.renamingId}
          onRename={actions.commitRename}
          onCancelRename={() => actions.setRenamingId(null)}
          dnd={{ onMove: onMoveToFolder }}
        />
      )}

      <footer className="dr-folder__foot text-xs muted">
        {entries.length} item{entries.length === 1 ? '' : 's'} · {formatBytes(entries.reduce((n, e) => n + e.item.sizeBytes, 0))}
        {canCreateHere ? ' · drop files anywhere to upload' : ''}
      </footer>

      {fileDrag && (
        <div className="dr-dropveil" aria-hidden="true">
          <Upload />
          <b>{canCreateHere ? `Drop to upload into ${location.label}` : 'You can’t upload here'}</b>
          <span>{canCreateHere ? 'Files inherit this folder’s sensitivity label' : 'Editor access required'}</span>
        </div>
      )}

      {actions.overlays}
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} target={canCreateHere ? location : null} />
      <DriveSettingsDrawer driveId={drive.id} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
