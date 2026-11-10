/**
 * Public App Bridge for Helix Drive (see src/lib/appBridge.ts).
 * Powers the global ⌘K palette, Settings → Reset demo and cross-app file lookups.
 * Every call re-checks access with the Drive permission engine (API boundary).
 */
import { Clock3, FilePlus2, FolderOpen, HardDrive, KeyRound, ShieldCheck, Star, Upload, Users } from 'lucide-react';
import type { BridgeFile, BridgeViewer, DriveBridge, PaletteEntry } from '@/lib/appBridge';
import { hasPermission } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import type { Item } from './types';
import { buildCtx, directShareFor, driveAccess, effectiveAccess, isTrashed, locationOf, viewerOf, type EngineCtx, type Viewer } from './access';
import { KIND_COLOR, KIND_SHORT, LABEL_NAME, RANK } from './meta';
import { matchItem, parseQuery } from './query';
import { itemRoute, useDrive } from './store';

function scope(viewer: BridgeViewer): { ctx: EngineCtx; v: Viewer } | null {
  if (!hasPermission(viewer.perms, 'app:drive')) return null;
  const st = useDrive.getState();
  const hub = useHub.getState();
  return { ctx: buildCtx(st, hub.users, viewer.roles), v: viewerOf(viewer.user, viewer.roles, viewer.perms) };
}

/** Files the viewer can find (not link-only, not trashed). */
function openable(ctx: EngineCtx, v: Viewer): Item[] {
  return ctx.items.filter((i) => i.kind !== 'folder' && !isTrashed(ctx, i) && effectiveAccess(ctx, v, i).discoverable);
}

const toBridge = (i: Item): BridgeFile => ({ id: i.id, name: i.name, kind: i.kind, to: itemRoute(i), ownerId: i.ownerId, updatedAt: i.updatedAt, sensitivity: i.label, size: i.kind === 'folder' ? undefined : i.size });

function recentFor(v: Viewer, items: Item[]): Item[] {
  const recents = useDrive.getState().recents[v.id] ?? [];
  const order = new Map(recents.map((r, idx) => [r.id, idx]));
  return [...items].sort((a, b) => {
    const ra = order.get(a.id);
    const rb = order.get(b.id);
    if (ra !== undefined || rb !== undefined) return (ra ?? 1e9) - (rb ?? 1e9);
    return b.updatedAt - a.updatedAt;
  });
}

export const api: DriveBridge = {
  appId: 'drive',

  paletteEntries(viewer) {
    const s = scope(viewer);
    if (!s) return [];
    const { ctx, v } = s;
    const pendingForMe = useDrive
      .getState()
      .requests.filter((r) => {
        if (r.status !== 'pending') return false;
        const it = ctx.item.get(r.itemId);
        return !!it && RANK[effectiveAccess(ctx, v, it).level] >= RANK.manager;
      }).length;
    const actions: PaletteEntry[] = [
      { id: 'drive:upload', group: 'Actions', title: 'Upload files', subtitle: 'Helix Drive', icon: <Upload />, keywords: ['upload', 'add file', 'import', 'drive'], hint: 'Upload', to: '/drive?upload=1' },
      { id: 'drive:new-doc', group: 'Actions', title: 'New document', subtitle: 'Helix Drive', icon: <FilePlus2 />, keywords: ['create', 'doc', 'write', 'drive'], hint: 'Create', to: '/drive?new=doc' },
      { id: 'drive:new-sheet', group: 'Actions', title: 'New spreadsheet', subtitle: 'Helix Drive', icon: <FilePlus2 />, keywords: ['create', 'sheet', 'excel', 'table'], hint: 'Create', to: '/drive?new=sheet' },
      { id: 'drive:new-folder', group: 'Actions', title: 'New folder', subtitle: 'Helix Drive', icon: <FolderOpen />, keywords: ['create', 'folder', 'directory'], hint: 'Create', to: '/drive?new=folder' },
      { id: 'drive:shared', group: 'Actions', title: 'Files shared with me', subtitle: 'Helix Drive', icon: <Users />, keywords: ['shared', 'drive', 'files'], hint: 'Open', to: '/drive/shared' },
      { id: 'drive:starred', group: 'Actions', title: 'Starred files', subtitle: 'Helix Drive', icon: <Star />, keywords: ['starred', 'favorites', 'drive'], hint: 'Open', to: '/drive/starred' },
      { id: 'drive:recent', group: 'Actions', title: 'Recent files', subtitle: 'Helix Drive', icon: <Clock3 />, keywords: ['recent', 'history', 'drive'], hint: 'Open', to: '/drive/recent' },
      {
        id: 'drive:requests',
        group: 'Actions',
        title: 'File access requests',
        subtitle: pendingForMe ? `${pendingForMe} waiting for your decision` : 'Helix Drive',
        icon: <KeyRound />,
        keywords: ['access', 'request', 'approve', 'permission', 'drive'],
        hint: 'Review',
        to: '/drive/requests',
      },
    ];
    if (v.admin)
      actions.push({ id: 'drive:governance', group: 'Actions', title: 'Drive governance', subtitle: 'Risk radar, DLP rules, legal holds', icon: <ShieldCheck />, keywords: ['governance', 'dlp', 'risk', 'legal hold', 'audit', 'drive'], hint: 'Open', to: '/drive/governance' });

    const files = recentFor(v, openable(ctx, v)).slice(0, 80);
    const work: PaletteEntry[] = files.map((i) => {
      const owner = ctx.user.get(i.ownerId);
      return {
        id: `drive:file:${i.id}`,
        group: 'Work',
        title: i.name,
        subtitle: `${KIND_SHORT[i.kind]} · ${locationOf(ctx, i, v.id)} · ${LABEL_NAME[i.label]}`,
        icon: <HardDrive />,
        glyphColor: KIND_COLOR[i.kind],
        keywords: [owner?.name ?? '', ...i.tags, LABEL_NAME[i.label], KIND_SHORT[i.kind], ctx.drive.get(i.driveId)?.name ?? '', 'drive', 'file'].filter(Boolean),
        hint: 'Open',
        to: itemRoute(i),
      };
    });
    for (const d of ctx.drives) {
      if (d.kind !== 'shared' || driveAccess(ctx, v, d) === 'none') continue;
      work.push({ id: `drive:drive:${d.id}`, group: 'Work', title: d.name, subtitle: 'Shared drive · Helix Drive', icon: <FolderOpen />, glyphColor: d.color, keywords: ['shared drive', 'drive', d.department ?? '', d.description], hint: 'Open', to: `/drive/d/${d.id}` });
    }
    const shared = files.filter((i) => directShareFor(ctx, v, effectiveAccess(ctx, v, i)));
    for (const i of shared.slice(0, 10)) {
      const e = work.find((w) => w.id === `drive:file:${i.id}`);
      if (e) e.keywords = [...(e.keywords ?? []), 'shared with me'];
    }
    return [...actions, ...work];
  },

  resetDemo() {
    useDrive.getState().resetDemo();
  },

  searchFiles(viewer, query, limit = 8) {
    const s = scope(viewer);
    if (!s) return [];
    const { ctx, v } = s;
    const files = openable(ctx, v);
    const q = query.trim();
    if (!q) return recentFor(v, files).slice(0, limit).map(toBridge);
    const parsed = parseQuery(q, {
      users: ctx.users.map((u) => ({ id: u.id, name: u.name })),
      drives: ctx.drives.filter((d) => d.kind === 'shared').map((d) => ({ id: d.id, name: d.name })),
      me: v.id,
      now: ctx.now,
    });
    const scored: { item: Item; score: number }[] = [];
    for (const i of files) {
      const a = effectiveAccess(ctx, v, i);
      const m = matchItem(
        {
          name: i.name,
          kind: i.kind,
          ownerId: i.ownerId,
          label: i.label,
          updatedAt: i.updatedAt,
          driveId: i.driveId,
          size: i.size,
          extra: [...i.tags, i.description ?? '', ctx.user.get(i.ownerId)?.name ?? '', locationOf(ctx, i, v.id)],
          sharedWithMe: !!directShareFor(ctx, v, a),
          starred: i.starredBy.includes(v.id),
        },
        parsed,
      );
      if (m) scored.push({ item: i, score: m.score });
    }
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => toBridge(x.item));
  },

  getFile(viewer, id) {
    const s = scope(viewer);
    if (!s) return null;
    const item = s.ctx.item.get(id);
    if (!item || isTrashed(s.ctx, item)) return null;
    if (effectiveAccess(s.ctx, s.v, item).level === 'none') return null;
    return toBridge(item);
  },
};
