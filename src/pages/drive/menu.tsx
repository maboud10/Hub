/**
 * Item actions shared by the browser, file view, Quick Look and Spotlight:
 * open, share, copy link, move, rename, star, label, copy, download (real for stored content),
 * trash with Undo, restore, delete forever, create task (Projects) and send to channel (Pulse).
 */
import { useNavigate } from 'react-router';
import {
  ArchiveRestore,
  Copy,
  Download,
  Eye,
  FolderInput,
  History,
  Info,
  Link2,
  ListTodo,
  MessagesSquare,
  Pencil,
  Share2,
  Star,
  StarOff,
  Tag,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type { MenuEntry } from '@/components/neo';
import { toast } from '@/store/toast';
import type { Item } from '@/drive/types';
import { itemRoute, useDrive } from '@/drive/store';
import { formatBytes } from '@/drive/meta';
import { evaluateSheet } from '@/drive/sheet';
import { useDriveUI, useUndo } from './ctx';

function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Real download for files with stored content; false when only metadata exists. */
function realDownload(item: Item): boolean {
  const c = item.content;
  if (!c) return false;
  if (c.type === 'image' && c.src) {
    const a = document.createElement('a');
    a.href = c.src;
    a.download = item.name;
    a.click();
    return true;
  }
  if (c.type === 'doc' || c.type === 'code') {
    const name = /\.[a-z0-9]+$/i.test(item.name) ? item.name : `${item.name}.md`;
    saveBlob(name, new Blob([c.text], { type: 'text/plain;charset=utf-8' }));
    return true;
  }
  if (c.type === 'sheet') {
    const vals = evaluateSheet(c.rows);
    const csv = vals.map((r) => r.map((v) => (/[",\n]/.test(v.value) ? `"${v.value.replace(/"/g, '""')}"` : v.value)).join(',')).join('\n');
    saveBlob(/\.csv$/i.test(item.name) ? item.name : `${item.name}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    return true;
  }
  return false;
}

export function useItemActions() {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const pushUndo = useUndo((s) => s.push);
  const { engine } = ui;

  const open = (item: Item) => navigate(itemRoute(item));
  const copyLink = async (item: Item) => {
    const url = `${window.location.origin}${itemRoute(item)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', item.link.scope === 'restricted' ? 'Only people with access can open it.' : item.link.scope === 'org' ? 'Anyone at Helix with the link can open it.' : 'Anyone with the link can open it.');
    } catch {
      toast.info('Copy this link', url);
    }
  };
  const trash = (ids: string[]) => {
    const r = useDrive.getState().trash(ids);
    if (r.ok) pushUndo(r.message ?? 'Moved to trash', r.revert);
    else toast.error('Couldn’t move to trash', r.error);
    return r.ok;
  };
  const star = (ids: string[], on: boolean) => {
    const r = useDrive.getState().setStar(ids, on);
    if (!r.ok) toast.error(r.error);
  };
  const download = (ids: string[]) => {
    const r = useDrive.getState().download(ids);
    if (!r.ok) return toast.error('Download blocked', r.error);
    const items = ids.map((id) => engine.ctx.item.get(id)).filter((i): i is Item => !!i);
    if (items.length === 1 && items[0].kind !== 'folder' && realDownload(items[0])) return toast.success(`Downloading “${items[0].name}”`);
    toast.success(r.count === 1 ? `Downloading “${items[0]?.name}”` : `Downloading ${r.count} files`, `${formatBytes(r.bytes)} · simulated for files without stored content`);
  };
  const restore = (ids: string[]) => toast.result(useDrive.getState().restore(ids));
  const makeCopy = (item: Item) => {
    const r = useDrive.getState().copy(item.id);
    if (r.ok) toast.success(r.message ?? 'Copied');
    else toast.error('Can’t copy', r.error);
  };

  /** Context-menu / overflow entries for one or more items. */
  const menuFor = (items: Item[], opts: { trash?: boolean; onDetails?: () => void; onQuickLook?: () => void; onRename?: () => void; hideOpen?: boolean } = {}): MenuEntry[] => {
    if (!items.length) return [];
    const single = items.length === 1 ? items[0] : null;
    const caps = items.map((i) => engine.caps(i));
    const all = (k: keyof (typeof caps)[number]) => caps.every((c) => c[k]);
    if (opts.trash)
      return [
        { label: items.length > 1 ? `Restore ${items.length} items` : 'Restore', icon: <ArchiveRestore />, disabled: !all('edit'), onSelect: () => restore(items.map((i) => i.id)) },
        { label: 'Delete forever', icon: <Trash2 />, danger: true, disabled: !all('purge'), hint: !all('purge') ? (caps.some((c) => c.held) ? 'On hold' : 'Manager') : undefined, onSelect: () => ui.open({ type: 'purge', ids: items.map((i) => i.id) }) },
      ];
    const out: MenuEntry[] = [];
    if (single && !opts.hideOpen) {
      out.push({ label: 'Open', icon: <ExternalLink />, hint: '↵', onSelect: () => open(single) });
      if (single.kind !== 'folder' && opts.onQuickLook) out.push({ label: 'Quick Look', icon: <Eye />, hint: 'Space', onSelect: opts.onQuickLook });
      out.push({ kind: 'sep' });
    }
    if (single) {
      out.push({ label: caps[0].share ? 'Share' : 'Who has access', icon: <Share2 />, onSelect: () => ui.open({ type: 'share', itemId: single.id, tab: caps[0].share ? 'share' : 'xray' }) });
      out.push({ label: 'Copy link', icon: <Link2 />, onSelect: () => void copyLink(single) });
    }
    out.push({ label: 'Move to…', icon: <FolderInput />, disabled: !all('edit'), onSelect: () => ui.open({ type: 'move', ids: items.map((i) => i.id) }) });
    if (single) out.push({ label: 'Rename', icon: <Pencil />, hint: 'F2', disabled: !caps[0].edit, onSelect: () => (opts.onRename ? opts.onRename() : ui.open({ type: 'rename', id: single.id })) });
    const starred = items.every((i) => i.starredBy.includes(engine.me.id));
    out.push({ label: starred ? 'Remove star' : 'Star', icon: starred ? <StarOff /> : <Star />, onSelect: () => star(items.map((i) => i.id), !starred) });
    out.push({ label: 'Label…', icon: <Tag />, disabled: !all('label'), onSelect: () => ui.open({ type: 'label', ids: items.map((i) => i.id) }) });
    if (single && opts.onDetails) out.push({ label: 'Details', icon: <Info />, hint: 'I', onSelect: opts.onDetails });
    if (single && single.kind !== 'folder') {
      out.push({ label: 'Version history', icon: <History />, onSelect: () => navigate(`/drive/file/${single.id}?tab=versions`) });
      out.push({ label: 'Make a copy', icon: <Copy />, disabled: !caps[0].download, hint: !caps[0].download ? 'Blocked' : undefined, onSelect: () => makeCopy(single) });
    }
    out.push({ label: 'Download', icon: <Download />, disabled: !all('download'), hint: !all('download') ? 'Blocked' : undefined, onSelect: () => download(items.map((i) => i.id)) });
    if (single && single.kind !== 'folder') {
      out.push({ kind: 'sep' });
      out.push({ label: 'Create task in Projects', icon: <ListTodo />, onSelect: () => ui.open({ type: 'task', itemId: single.id }) });
      out.push({ label: 'Send to a Pulse channel', icon: <MessagesSquare />, onSelect: () => ui.open({ type: 'channel', itemId: single.id }) });
    }
    out.push({ kind: 'sep' });
    out.push({ label: 'Move to trash', icon: <Trash2 />, danger: true, hint: '⌫', disabled: !all('trash'), onSelect: () => trash(items.map((i) => i.id)) });
    return out;
  };

  return { open, copyLink, trash, star, download, restore, makeCopy, menuFor };
}
