/**
 * Permission-aware selectors for Helix Drive: sidebar drives, folder listings
 * with effective roles, breadcrumbs, search, recents/starred/shared/trash
 * views, storage usage, pending access requests and the governance report.
 */
import { useMemo } from 'react';
import { useHub } from '@/store/hub';
import { useProjects } from '@/projects/store';
import * as access from './access';
import { SENSITIVITY_META } from './constants';
import { useDrive } from './store';
import type { DriveItem, DriveRole, SharedDrive } from './types';

export interface ItemWithRole {
  item: DriveItem;
  role: DriveRole;
  canEdit: boolean;
  canShare: boolean;
  canDownload: boolean;
  canTrash: boolean;
  /** Share count visible on the row (explicit shares on the item). */
  shareCount: number;
}

export function useDriveViewer(): access.DriveViewer | null {
  const sessionUserId = useHub((s) => s.sessionUserId);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => access.buildDriveViewer(users.find((u) => u.id === sessionUserId), roles), [sessionUserId, users, roles]);
}

export function useDriveContext() {
  const items = useDrive((s) => s.items);
  const drives = useDrive((s) => s.drives);
  return useMemo(() => access.buildDriveContext(items, drives), [items, drives]);
}

export function useDriveCaps() {
  const v = useDriveViewer();
  return useMemo(
    () => ({
      viewer: v,
      canUse: access.canUseDrive(v),
      canGovern: access.canGovernDrive(v),
      canCreateSharedDrive: access.canCreateSharedDrive(v),
      isContractor: v ? access.isContractor(v) : true,
    }),
    [v],
  );
}

const withRole = (v: access.DriveViewer, item: DriveItem, ctx: access.DriveContext): ItemWithRole | null => {
  const role = access.effectiveRole(v, item, ctx);
  if (!role) return null;
  return { item, role, canEdit: access.canEdit(role, item), canShare: access.canShare(role, item), canDownload: access.canDownload(role, item), canTrash: access.canTrash(role, item), shareCount: item.shares.filter(access.isShareActive).length };
};

export function computeVisibleItems(v: access.DriveViewer | null, items: DriveItem[], ctx: access.DriveContext): ItemWithRole[] {
  if (!v) return [];
  return items.map((i) => withRole(v, i, ctx)).filter((x): x is ItemWithRole => Boolean(x));
}

/** Drives for the sidebar: personal first, then company, then team drives the viewer belongs to. */
export function useVisibleDrives(): { drive: SharedDrive; canManage: boolean; usedBytes: number; itemCount: number }[] {
  const v = useDriveViewer();
  const drives = useDrive((s) => s.drives);
  const items = useDrive((s) => s.items);
  return useMemo(() => {
    if (!v) return [];
    const order = { personal: 0, company: 1, team: 2 } as const;
    return drives
      .filter((d) => access.canSeeDrive(v, d))
      .map((drive) => {
        const live = items.filter((i) => i.driveId === drive.id && !i.trashed);
        return { drive, canManage: access.canManageDrive(v, drive), usedBytes: live.reduce((n, i) => n + i.sizeBytes, 0), itemCount: live.length };
      })
      .sort((a, b) => order[a.drive.kind] - order[b.drive.kind] || a.drive.name.localeCompare(b.drive.name));
  }, [v, drives, items]);
}

export function useDriveRootRole(driveId: string | undefined): DriveRole | null {
  const v = useDriveViewer();
  const drive = useDrive((s) => s.drives.find((d) => d.id === driveId));
  return useMemo(() => {
    if (!v || !drive || !access.canSeeDrive(v, drive)) return null;
    if (access.canManageDrive(v, drive)) return 'manager';
    return access.shareRole(v, drive.access);
  }, [v, drive]);
}

export function useFolder(driveId: string | undefined, folderId: string | null | undefined) {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  const drive = useDrive((s) => s.drives.find((d) => d.id === driveId));
  const rootRole = useDriveRootRole(driveId);
  return useMemo(() => {
    const folder = folderId ? ctx.items.get(folderId) : undefined;
    const folderRole = folder ? access.effectiveRole(v, folder, ctx) : rootRole;
    const visible = driveId && (folderRole || (!folderId && rootRole))
      ? computeVisibleItems(v, items.filter((i) => i.driveId === driveId && i.parentId === (folderId ?? null) && !i.trashed), ctx)
      : [];
    const sorted = visible.sort((a, b) => Number(b.item.kind === 'folder') - Number(a.item.kind === 'folder') || a.item.name.localeCompare(b.item.name));
    const crumbs: DriveItem[] = folder ? [...access.ancestorsOf(folder, ctx).reverse(), folder] : [];
    return { drive, folder, folderRole, canCreateHere: access.canEdit(folderRole, folder), entries: sorted, crumbs };
  }, [v, ctx, items, drive, driveId, folderId, rootRole]);
}

export function useItem(itemId: string | undefined) {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const item = useDrive((s) => s.items.find((i) => i.id === itemId));
  const drive = useDrive((s) => s.drives.find((d) => d.id === item?.driveId));
  const tasks = useProjects((s) => s.tasks);
  const projects = useProjects((s) => s.projects);
  return useMemo(() => {
    if (!item || !v) return null;
    const role = access.effectiveRole(v, item, ctx);
    const linkedTasks = tasks.filter((t) => t.attachments.some((a) => a.driveFileId === item.id)).map((task) => ({ task, project: projects.find((p) => p.id === task.projectId) }));
    const inheritedFrom = access.ancestorsOf(item, ctx);
    return {
      item,
      drive,
      role,
      exists: true,
      canView: access.canView(role),
      canEdit: access.canEdit(role, item),
      canComment: access.canComment(role),
      canShare: access.canShare(role, item),
      canManage: access.canManage(role),
      canDownload: access.canDownload(role, item),
      canTrash: access.canTrash(role, item),
      allowedLinks: access.allowedLinkAccess(item.sensitivity),
      crumbs: inheritedFrom.reverse(),
      linkedTasks,
    };
  }, [item, v, ctx, drive, tasks, projects]);
}

export function useRecentItems(limit = 12): ItemWithRole[] {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const recents = useDrive((s) => s.recents);
  return useMemo(() => {
    if (!v) return [];
    const mine = recents[v.userId] ?? [];
    return mine
      .map((r) => ctx.items.get(r.itemId))
      .filter((i): i is DriveItem => Boolean(i) && !i!.trashed)
      .map((i) => withRole(v, i, ctx))
      .filter((x): x is ItemWithRole => Boolean(x))
      .slice(0, limit);
  }, [v, ctx, recents, limit]);
}

/** "Suggested for you": frequently opened + recently modified by others in your drives. */
export function useSuggestedItems(limit = 6): ItemWithRole[] {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  return useMemo(() => {
    if (!v) return [];
    const weekAgo = Date.now() - 7 * 86_400_000;
    return computeVisibleItems(v, items.filter((i) => !i.trashed && i.kind !== 'folder'), ctx)
      .map((x) => ({ x, score: (x.item.openedBy[v.userId] ?? 0) * 3 + (x.item.modifiedAt > weekAgo && x.item.modifiedBy !== v.userId ? 6 : 0) + (x.item.starredBy.includes(v.userId) ? 2 : 0) + Math.min(4, x.item.comments.filter((c) => !c.resolved).length) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.x.item.modifiedAt - a.x.item.modifiedAt)
      .slice(0, limit)
      .map((s) => s.x);
  }, [v, ctx, items, limit]);
}

export function useStarredItems(): ItemWithRole[] {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  return useMemo(() => (v ? computeVisibleItems(v, items.filter((i) => !i.trashed && i.starredBy.includes(v.userId)), ctx) : []), [v, ctx, items]);
}

/** Items explicitly shared with me (or via link) that live outside my personal drive. */
export function useSharedWithMe(): ItemWithRole[] {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  return useMemo(() => {
    if (!v) return [];
    return computeVisibleItems(
      v,
      items.filter((i) => !i.trashed && i.ownerId !== v.userId && (i.shares.some((s) => s.principal.type === 'user' && s.principal.id === v.userId && access.isShareActive(s)) || i.linkAccess !== 'restricted')),
      ctx,
    ).sort((a, b) => b.item.modifiedAt - a.item.modifiedAt);
  }, [v, ctx, items]);
}

export function useTrash(): ItemWithRole[] {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  return useMemo(() => (v ? computeVisibleItems(v, items.filter((i) => i.trashed && (!i.parentId || !ctx.items.get(i.parentId)?.trashed)), ctx).filter((x) => x.role === 'manager') : []), [v, ctx, items]);
}

export interface DriveSearchFilters {
  kind?: DriveItem['kind'] | 'any';
  sensitivity?: DriveItem['sensitivity'] | 'any';
  ownerId?: string;
  driveId?: string;
  modifiedWithinDays?: number;
}

export function searchDriveItems(v: access.DriveViewer | null, items: DriveItem[], ctx: access.DriveContext, query: string, filters: DriveSearchFilters = {}, limit = 40): ItemWithRole[] {
  if (!v) return [];
  const q = query.trim().toLowerCase();
  const cutoff = filters.modifiedWithinDays ? Date.now() - filters.modifiedWithinDays * 86_400_000 : 0;
  const pool = items.filter((i) => {
    if (i.trashed) return false;
    if (filters.kind && filters.kind !== 'any' && i.kind !== filters.kind) return false;
    if (filters.sensitivity && filters.sensitivity !== 'any' && i.sensitivity !== filters.sensitivity) return false;
    if (filters.ownerId && i.ownerId !== filters.ownerId) return false;
    if (filters.driveId && i.driveId !== filters.driveId) return false;
    if (cutoff && i.modifiedAt < cutoff) return false;
    if (!q) return true;
    const hay = `${i.name} ${i.description ?? ''} ${i.tags.join(' ')} ${i.preview.content ?? ''} ${(i.preview.rows ?? []).flat().join(' ')} ${(i.preview.slides ?? []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
  return computeVisibleItems(v, pool, ctx)
    .sort((a, b) => Number(b.item.name.toLowerCase().includes(q)) - Number(a.item.name.toLowerCase().includes(q)) || b.item.modifiedAt - a.item.modifiedAt)
    .slice(0, limit);
}

export function useDriveSearch(query: string, filters: DriveSearchFilters = {}) {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  const key = JSON.stringify(filters);
  return useMemo(() => searchDriveItems(v, items, ctx, query, JSON.parse(key) as DriveSearchFilters), [v, ctx, items, query, key]);
}

export function useStorage(driveId: string | undefined) {
  const drive = useDrive((s) => s.drives.find((d) => d.id === driveId));
  const items = useDrive((s) => s.items);
  return useMemo(() => {
    if (!drive) return null;
    const live = items.filter((i) => i.driveId === drive.id && !i.trashed);
    const used = live.reduce((n, i) => n + i.sizeBytes, 0);
    const byKind = new Map<DriveItem['kind'], number>();
    live.forEach((i) => byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + i.sizeBytes));
    return { used, quota: drive.quotaBytes, pct: Math.min(100, Math.round((used / drive.quotaBytes) * 100)), byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]), trashBytes: items.filter((i) => i.driveId === drive.id && i.trashed).reduce((n, i) => n + i.sizeBytes, 0) };
  }, [drive, items]);
}

/** Access requests the viewer can decide (owner / manager / sharer of the item), plus their own. */
export function useAccessRequests() {
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const requests = useDrive((s) => s.requests);
  return useMemo(() => {
    if (!v) return { toDecide: [], mine: [] };
    const enriched = requests.map((r) => ({ request: r, item: ctx.items.get(r.itemId) }));
    return {
      toDecide: enriched.filter((e) => e.request.status === 'pending' && e.item && access.canShare(access.effectiveRole(v, e.item, ctx), e.item) && e.request.requesterId !== v.userId),
      mine: enriched.filter((e) => e.request.requesterId === v.userId).sort((a, b) => b.request.createdAt - a.request.createdAt),
    };
  }, [v, ctx, requests]);
}

export interface GovernanceReport {
  totalItems: number;
  totalBytes: number;
  bySensitivity: { sensitivity: DriveItem['sensitivity']; count: number; bytes: number }[];
  publicLinks: DriveItem[];
  oversharedConfidential: DriveItem[];
  contractorShares: { item: DriveItem; userId: string; expiresAt?: number }[];
  expiringShares: { item: DriveItem; userId: string; expiresAt: number }[];
  stale: DriveItem[];
  legalHolds: DriveItem[];
  pendingRequests: number;
  drives: { drive: SharedDrive; used: number; pct: number; members: number }[];
}

export function useGovernanceReport(): GovernanceReport | null {
  const caps = useDriveCaps();
  const items = useDrive((s) => s.items);
  const drives = useDrive((s) => s.drives);
  const requests = useDrive((s) => s.requests);
  const users = useHub((s) => s.users);
  return useMemo(() => {
    if (!caps.canGovern) return null;
    const live = items.filter((i) => !i.trashed);
    const contractors = new Set(users.filter((u) => u.roleIds.includes('contractor')).map((u) => u.id));
    const in30d = Date.now() + 30 * 86_400_000;
    const staleCutoff = Date.now() - 180 * 86_400_000;
    const userShares = live.flatMap((item) => item.shares.filter((s) => s.principal.type === 'user' && access.isShareActive(s)).map((s) => ({ item, userId: (s.principal as { id: string }).id, expiresAt: s.expiresAt })));
    return {
      totalItems: live.length,
      totalBytes: live.reduce((n, i) => n + i.sizeBytes, 0),
      bySensitivity: (Object.keys(SENSITIVITY_META) as DriveItem['sensitivity'][]).map((sensitivity) => ({ sensitivity, count: live.filter((i) => i.sensitivity === sensitivity).length, bytes: live.filter((i) => i.sensitivity === sensitivity).reduce((n, i) => n + i.sizeBytes, 0) })),
      publicLinks: live.filter((i) => i.linkAccess === 'anyone'),
      oversharedConfidential: live.filter((i) => SENSITIVITY_META[i.sensitivity].rank >= 2 && (i.linkAccess !== 'restricted' || i.shares.some((s) => s.principal.type === 'company'))),
      contractorShares: userShares.filter((s) => contractors.has(s.userId)),
      expiringShares: userShares.filter((s): s is typeof s & { expiresAt: number } => Boolean(s.expiresAt && s.expiresAt < in30d)),
      stale: live.filter((i) => i.kind !== 'folder' && i.modifiedAt < staleCutoff),
      legalHolds: live.filter((i) => i.retention === 'legal_hold'),
      pendingRequests: requests.filter((r) => r.status === 'pending').length,
      drives: drives
        .filter((d) => d.kind !== 'personal')
        .map((drive) => {
          const used = live.filter((i) => i.driveId === drive.id).reduce((n, i) => n + i.sizeBytes, 0);
          return { drive, used, pct: Math.round((used / drive.quotaBytes) * 100), members: drive.access.length + drive.managerIds.length };
        }),
    };
  }, [caps.canGovern, items, drives, requests, users]);
}
