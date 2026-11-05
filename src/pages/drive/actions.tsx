/**
 * One hook that gives any item list the full Drive context menu (Open,
 * Preview, Share, Get link, Rename, Move to…, Star, Details, Download, Trash)
 * plus the dialogs those actions open. Views render `overlays` once.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Download, ExternalLink, Eye, FolderInput, FolderOpen, Info, Link2, Pencil, Star, Trash2, UserPlus } from 'lucide-react';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useDrive, itemLink } from '@/drive/store';
import type { ItemWithRole } from '@/drive/selectors';
import { QuickPreviewModal } from './Preview';
import { ShareDialog } from './ShareDialog';
import { ContextMenu, MovePickerModal, copyItemLink, downloadResult, itemHref, type MenuAnchor, type MenuEntry } from './shared';

export interface ItemActions {
  openMenu: (row: ItemWithRole, anchor: MenuAnchor) => void;
  overlays: ReactNode;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  commitRename: (id: string, name: string) => void;
  share: (id: string) => void;
  move: (ids: string[]) => void;
  preview: (id: string) => void;
  open: (row: ItemWithRole) => void;
  star: (row: ItemWithRole) => void;
  trash: (row: ItemWithRole) => void;
  download: (row: ItemWithRole) => void;
  /** Move many items with one aggregated toast (bulk bar, drag-and-drop). */
  moveMany: (ids: string[], targetDriveId: string, targetParentId: string | null, destLabel: string) => void;
  trashMany: (rows: ItemWithRole[]) => void;
  starMany: (rows: ItemWithRole[]) => void;
}

export function useItemActions(opts: { onMoved?: () => void } = {}): ItemActions {
  const navigate = useNavigate();
  const me = useHub((s) => s.sessionUserId);
  const toggleStar = useDrive((s) => s.toggleStar);
  const trashItem = useDrive((s) => s.trashItem);
  const downloadItem = useDrive((s) => s.downloadItem);
  const renameItem = useDrive((s) => s.renameItem);
  const moveItem = useDrive((s) => s.moveItem);

  const [menu, setMenu] = useState<{ row: ItemWithRole; anchor: MenuAnchor } | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);
  const open = useCallback((row: ItemWithRole) => navigate(itemHref(row.item)), [navigate]);
  const star = useCallback((row: ItemWithRole) => toast.result(toggleStar(row.item.id)), [toggleStar]);
  const trash = useCallback((row: ItemWithRole) => toast.result(trashItem(row.item.id)), [trashItem]);
  const download = useCallback((row: ItemWithRole) => downloadResult(downloadItem(row.item.id)), [downloadItem]);
  const commitRename = useCallback(
    (id: string, name: string) => {
      toast.result(renameItem(id, name));
      setRenamingId(null);
    },
    [renameItem],
  );

  const moveMany = useCallback(
    (ids: string[], targetDriveId: string, targetParentId: string | null, destLabel: string) => {
      let ok = 0;
      let firstError: string | null = null;
      for (const id of ids) {
        const r = moveItem(id, targetDriveId, targetParentId);
        if (r.ok) ok += 1;
        else firstError ??= r.error;
      }
      if (ok) toast.success(`Moved ${ok === 1 ? '1 item' : `${ok} items`} to ${destLabel}.`);
      if (firstError) toast.error(firstError, ok ? `${ids.length - ok} item${ids.length - ok === 1 ? '' : 's'} stayed put.` : undefined);
      if (ok) opts.onMoved?.();
    },
    [moveItem, opts],
  );

  const trashMany = useCallback(
    (rows: ItemWithRole[]) => {
      const allowed = rows.filter((r) => r.canTrash);
      let ok = 0;
      for (const r of allowed) if (trashItem(r.item.id).ok) ok += 1;
      const skipped = rows.length - allowed.length;
      if (ok) toast.success(`Moved ${ok} item${ok === 1 ? '' : 's'} to trash.`, skipped ? `${skipped} skipped — only managers can trash, and locked/retained items are protected.` : 'You have 30 days to restore.');
      else toast.error('Nothing was trashed.', 'Only managers can move items to trash; locked and retained items are protected.');
    },
    [trashItem],
  );

  const starMany = useCallback(
    (rows: ItemWithRole[]) => {
      const allStarred = rows.every((r) => me && r.item.starredBy.includes(me));
      let n = 0;
      for (const r of rows) {
        const starred = Boolean(me && r.item.starredBy.includes(me));
        if (starred === allStarred && toggleStar(r.item.id).ok) n += 1;
      }
      toast.success(allStarred ? `Removed ${n} from starred.` : `Starred ${n} item${n === 1 ? '' : 's'}.`);
    },
    [toggleStar, me],
  );

  const createFile = useDrive((s) => s.createFile);
  const updateContent = useDrive((s) => s.updateContent);
  const setSensitivity = useDrive((s) => s.setSensitivity);

  const duplicate = useCallback(
    (row: ItemWithRole) => {
      const it = row.item;
      if (it.kind === 'folder') return;
      const tplId = it.kind === 'sheet' ? 'nt-sheet' : it.kind === 'slides' ? 'nt-deck' : 'nt-blank-doc';
      const copyName = it.name.includes('.') ? it.name.replace(/(\.[^.]+)$/, ' (copy)$1') : `${it.name} (copy)`;
      const res = createFile(it.driveId, it.parentId, tplId, copyName);
      if (res.ok && res.itemId) {
        updateContent(res.itemId, structuredClone(it.preview), `Duplicated from ${it.name}`);
        setSensitivity(res.itemId, it.sensitivity);
        toast.success(`Duplicated as ${copyName}.`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
    },
    [createFile, updateContent, setSensitivity],
  );

  const entriesFor = useCallback(
    (row: ItemWithRole): MenuEntry[] => {
      const it = row.item;
      const isFolder = it.kind === 'folder';
      const starred = Boolean(me && it.starredBy.includes(me));
      const trashHint = !row.canTrash ? (row.role !== 'manager' ? 'Managers only' : it.retention === 'legal_hold' ? 'Under legal hold' : it.locked ? 'Locked' : undefined) : undefined;
      return [
        { id: 'open', label: isFolder ? 'Open folder' : 'Open', icon: isFolder ? <FolderOpen /> : <ExternalLink />, onSelect: () => open(row) },
        ...(!isFolder ? [{ id: 'preview', label: 'Preview', icon: <Eye />, onSelect: () => setPreviewId(it.id) }] : []),
        { id: 'sep1', kind: 'sep' },
        { id: 'share', label: 'Share', icon: <UserPlus />, disabled: !row.canShare, hint: !row.canShare ? (row.role === 'editor' ? 'Needs a manager' : 'Not allowed') : undefined, onSelect: () => setShareId(it.id) },
        { id: 'link', label: 'Get link', icon: <Link2 />, onSelect: () => copyItemLink(it) },
        { id: 'sep2', kind: 'sep' },
        { id: 'rename', label: 'Rename', icon: <Pencil />, disabled: !row.canEdit, hint: !row.canEdit ? (it.locked ? 'Locked' : 'Editors only') : undefined, onSelect: () => setRenamingId(it.id) },
        { id: 'move', label: 'Move to…', icon: <FolderInput />, disabled: !row.canEdit || it.retention === 'legal_hold', hint: it.retention === 'legal_hold' ? 'Legal hold' : !row.canEdit ? 'Editors only' : undefined, onSelect: () => setMoveIds([it.id]) },
        ...(!isFolder ? [{ id: 'duplicate', label: 'Make a copy', icon: <ExternalLink />, disabled: !row.canEdit, hint: !row.canEdit ? 'Editors only' : undefined, onSelect: () => duplicate(row) }] : []),
        { id: 'star', label: starred ? 'Remove from starred' : 'Add to starred', icon: <Star />, onSelect: () => star(row) },
        { id: 'details', label: 'Details', icon: <Info />, onSelect: () => navigate(`${itemLink(it.id)}?tab=details`) },
        ...(!isFolder ? [{ id: 'download', label: 'Download', icon: <Download />, disabled: !row.canDownload, hint: !row.canDownload ? 'Restricted · viewers can’t download' : it.sensitivity === 'confidential' || it.sensitivity === 'restricted' ? 'Watermarked' : undefined, onSelect: () => download(row) }] : []),
        { id: 'sep3', kind: 'sep' },
        { id: 'trash', label: 'Move to trash', icon: <Trash2 />, danger: true, disabled: !row.canTrash, hint: trashHint, onSelect: () => trash(row) },
      ];
    },
    [me, open, star, trash, download, duplicate, navigate],
  );

  const openMenu = useCallback((row: ItemWithRole, anchor: MenuAnchor) => setMenu({ row, anchor }), []);
  const menuItems = useMemo(() => (menu ? entriesFor(menu.row) : []), [menu, entriesFor]);

  const overlays = (
    <>
      <ContextMenu anchor={menu?.anchor ?? null} items={menuItems} onClose={closeMenu} />
      <ShareDialog itemId={shareId} open={Boolean(shareId)} onClose={() => setShareId(null)} />
      <MovePickerModal itemIds={moveIds ?? []} open={Boolean(moveIds)} onClose={() => setMoveIds(null)} onMoved={opts.onMoved} />
      <QuickPreviewModal itemId={previewId} open={Boolean(previewId)} onClose={() => setPreviewId(null)} />
    </>
  );

  return {
    openMenu,
    overlays,
    renamingId,
    setRenamingId,
    commitRename,
    share: setShareId,
    move: (ids) => setMoveIds(ids),
    preview: setPreviewId,
    open,
    star,
    trash,
    download,
    moveMany,
    trashMany,
    starMany,
  };
}
