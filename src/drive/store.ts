/**
 * Helix Drive store — a file system with role-based, inherited permissions.
 * Every mutation resolves the viewer's effective role first, applies DLP for
 * sensitivity labels, writes item activity, audits sensitive operations into
 * the hub trail and notifies people (kind `work`).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, Department, HubNotification, User } from '@/types';
import { uid } from '@/lib/id';
import { clearanceOf } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import * as access from './access';
import { DRIVE_DATA_VERSION, KIND_META, NEW_FILE_TEMPLATES, ROLE_RANK, SENSITIVITY_META, TRASH_RETENTION_DAYS, kindFromFileName } from './constants';
import { createDriveSeed, personalDriveId } from './seed';
import type { DriveData, DriveItem, DriveRole, DriveShare, FilePreview, LinkAccess, Principal, RetentionPolicy, Sensitivity, SharedDrive } from './types';

export type Result<T extends object = Record<never, never>> = ActionResult & Partial<T>;

export interface UploadInput {
  name: string;
  sizeBytes: number;
}

export interface DriveActions {
  createFolder(driveId: string, parentId: string | null, name: string): Result<{ itemId: string }>;
  createFile(driveId: string, parentId: string | null, templateId: string, name?: string): Result<{ itemId: string }>;
  uploadFiles(driveId: string, parentId: string | null, files: UploadInput[]): Result<{ itemIds: string[] }>;
  renameItem(itemId: string, name: string): ActionResult;
  updateItemMeta(itemId: string, patch: { description?: string; tags?: string[] }): ActionResult;
  updateContent(itemId: string, preview: FilePreview, note?: string): ActionResult;
  uploadNewVersion(itemId: string, sizeBytes: number, note?: string): ActionResult;
  moveItem(itemId: string, targetDriveId: string, targetParentId: string | null): ActionResult;
  toggleStar(itemId: string): ActionResult;
  trashItem(itemId: string): ActionResult;
  restoreItem(itemId: string): ActionResult;
  deleteForever(itemId: string): ActionResult;
  emptyTrash(): ActionResult;
  shareItem(itemId: string, principal: Principal, role: DriveRole, opts?: { expiresInDays?: number; note?: string }): ActionResult;
  removeShare(itemId: string, shareId: string): ActionResult;
  setLinkAccess(itemId: string, linkAccess: LinkAccess, linkRole?: DriveItem['linkRole']): ActionResult;
  setSensitivity(itemId: string, sensitivity: Sensitivity): ActionResult;
  setInheritance(itemId: string, inherit: boolean): ActionResult;
  setRetention(itemId: string, policy: RetentionPolicy): ActionResult;
  setLocked(itemId: string, locked: boolean): ActionResult;
  requestAccess(itemId: string, role: Exclude<DriveRole, 'manager'>, message: string): ActionResult;
  decideAccessRequest(requestId: string, approve: boolean, opts?: { role?: DriveRole; expiresInDays?: number; note?: string }): ActionResult;
  addComment(itemId: string, body: string): ActionResult;
  resolveComment(itemId: string, commentId: string): ActionResult;
  recordOpen(itemId: string): void;
  /** Returns downloadable text for the demo file (DLP-checked and audited). */
  downloadItem(itemId: string): Result<{ fileName: string; content: string; watermark?: string }>;
  createSharedDrive(input: { name: string; description?: string; department?: Department; icon?: string; color?: string; managerIds?: string[]; access?: { principal: Principal; role: DriveRole }[]; defaultSensitivity?: Sensitivity }): Result<{ driveId: string }>;
  updateSharedDrive(driveId: string, patch: Partial<Pick<SharedDrive, 'name' | 'description' | 'icon' | 'color' | 'defaultSensitivity' | 'managerIds' | 'minClearance'>>): ActionResult;
  setDriveAccess(driveId: string, shares: { principal: Principal; role: DriveRole }[]): ActionResult;
  /** Make sure the signed-in user has a personal drive and expired trash is purged. */
  ensureReady(): void;
  resetDriveDemo(): void;
}

export type DriveStore = DriveData & DriveActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const DAY = 86_400_000;

export const itemLink = (itemId: string) => `/drive/file/${itemId}`;
export const folderLink = (driveId: string, folderId?: string | null) => (folderId ? `/drive/d/${driveId}/${folderId}` : `/drive/d/${driveId}`);

export const useDrive = create<DriveStore>()(
  persist(
    (set, get) => {
      const hub = () => useHub.getState();
      const viewer = (): { user: User; v: access.DriveViewer } | null => {
        const h = hub();
        const user = h.users.find((u) => u.id === h.sessionUserId) ?? null;
        const v = access.buildDriveViewer(user, h.roles);
        return user && v ? { user, v } : null;
      };
      const ctx = () => access.buildDriveContext(get().items, get().drives);
      const userName = (id?: string) => hub().users.find((u) => u.id === id)?.name ?? 'Someone';
      const audit = (e: { action: string; target: string; detail?: string; outcome?: 'success' | 'denied'; severity?: 'info' | 'warning' | 'critical' }) =>
        hub().logAudit({ outcome: 'success', severity: 'info', ...e });
      const notify = (userIds: (string | undefined)[], n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read' | 'kind'>, exclude?: string) => {
        const ids = [...new Set(userIds.filter((x): x is string => Boolean(x) && x !== exclude))];
        if (ids.length) hub().pushNotifications(ids, { kind: 'work', ...n });
      };
      const item = (id: string) => get().items.find((i) => i.id === id);
      const drive = (id: string) => get().drives.find((d) => d.id === id);
      const act = (actorId: string, action: string, detail?: string) => ({ id: uid('da'), at: Date.now(), actorId, action, detail });
      const patchItem = (id: string, fn: (i: DriveItem) => DriveItem) => set((s) => ({ items: s.items.map((i) => (i.id === id ? fn(i) : i)) }));
      const touch = (i: DriveItem, actorId: string, action: string, detail?: string): DriveItem => ({ ...i, modifiedAt: Date.now(), modifiedBy: actorId, activity: [...i.activity, act(actorId, action, detail)].slice(-60) });

      const roleOn = (v: access.DriveViewer, it: DriveItem | undefined) => access.effectiveRole(v, it, ctx());
      /** Role at a location (folder, or the drive root when parentId is null). */
      const roleAt = (v: access.DriveViewer, driveId: string, parentId: string | null): DriveRole | null => {
        if (parentId) return roleOn(v, item(parentId));
        const d = drive(driveId);
        if (!d || !access.canSeeDrive(v, d)) return null;
        if (access.canManageDrive(v, d)) return 'manager';
        return access.shareRole(v, d.access);
      };
      const descendants = (id: string): DriveItem[] => {
        const out: DriveItem[] = [];
        const stack = [id];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const child of get().items.filter((i) => i.parentId === cur)) {
            out.push(child);
            stack.push(child.id);
          }
        }
        return out;
      };
      const usedBytes = (driveId: string) => get().items.filter((i) => i.driveId === driveId && !i.trashed).reduce((n, i) => n + i.sizeBytes, 0);
      const uniqueName = (driveId: string, parentId: string | null, name: string, excludeId?: string) => {
        const siblings = new Set(get().items.filter((i) => i.driveId === driveId && i.parentId === parentId && !i.trashed && i.id !== excludeId).map((i) => i.name.toLowerCase()));
        if (!siblings.has(name.toLowerCase())) return name;
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let n = 2;
        while (siblings.has(`${base} (${n})${ext}`.toLowerCase())) n += 1;
        return `${base} (${n})${ext}`;
      };
      const inheritedSensitivity = (driveId: string, parentId: string | null): Sensitivity => {
        const parent = parentId ? item(parentId) : undefined;
        return parent?.sensitivity ?? drive(driveId)?.defaultSensitivity ?? 'internal';
      };
      const ensurePersonalDrive = (userId: string) => {
        const id = personalDriveId(userId);
        if (drive(id)) return id;
        set((s) => ({
          drives: [...s.drives, { id, name: 'My Drive', description: 'Your private space. Share files when you’re ready.', icon: '🗂️', color: '#60a5fa', kind: 'personal', ownerId: userId, managerIds: [userId], access: [], quotaBytes: 50 * 1024 ** 3, defaultSensitivity: 'internal', createdAt: Date.now() }],
        }));
        return id;
      };
      const makeItem = (v: access.DriveViewer, driveId: string, parentId: string | null, kind: DriveItem['kind'], name: string, sizeBytes: number, preview: FilePreview): DriveItem => {
        const now = Date.now();
        return {
          id: uid('df'),
          driveId,
          parentId,
          kind,
          name,
          sizeBytes,
          ownerId: v.userId,
          createdAt: now,
          modifiedAt: now,
          modifiedBy: v.userId,
          sensitivity: inheritedSensitivity(driveId, parentId),
          inheritPermissions: true,
          shares: [],
          linkAccess: 'restricted',
          linkRole: 'viewer',
          starredBy: [],
          trashed: false,
          tags: [],
          preview,
          versions: kind === 'folder' ? [] : [{ id: uid('v'), version: 1, at: now, by: v.userId, sizeBytes, note: 'Created' }],
          comments: [],
          activity: [act(v.userId, 'created')],
          retention: 'none',
          views: 0,
          openedBy: {},
        };
      };
      type RoleGate = { error: ActionResult; c?: undefined; it?: undefined; role?: undefined } | { error?: undefined; c: { user: User; v: access.DriveViewer }; it: DriveItem; role: DriveRole };
      const requireRole = (itemId: string, check: (role: DriveRole | null, it: DriveItem) => boolean, denied: string): RoleGate => {
        const c = viewer();
        const it = item(itemId);
        if (!c || !it) return { error: fail('File not found.') };
        const role = roleOn(c.v, it);
        if (!role) return { error: fail('File not found.') };
        if (!check(role, it)) {
          audit({ action: 'drive.denied', target: it.name, detail: denied, outcome: 'denied', severity: 'warning' });
          return { error: fail(denied) };
        }
        return { c, it, role };
      };

      return {
        ...createDriveSeed(),

        createFolder(driveId, parentId, name) {
          const c = viewer();
          if (!c) return fail('Not signed in.');
          const clean = name.trim();
          if (!clean) return fail('Name the folder.');
          const role = roleAt(c.v, driveId, parentId);
          if (!access.canEdit(role)) return fail('You need editor access here to create folders.');
          const folder = makeItem(c.v, driveId, parentId, 'folder', uniqueName(driveId, parentId, clean), 0, { type: 'none' });
          set((s) => ({ items: [...s.items, folder] }));
          return { ok: true, message: `Created folder ${folder.name}.`, itemId: folder.id };
        },

        createFile(driveId, parentId, templateId, name) {
          const c = viewer();
          if (!c) return fail('Not signed in.');
          const tpl = NEW_FILE_TEMPLATES.find((t) => t.id === templateId);
          if (!tpl) return fail('Template not found.');
          const role = roleAt(c.v, driveId, parentId);
          if (!access.canEdit(role)) return fail('You need editor access here to create files.');
          const base = (name?.trim() || tpl.name) + (name?.includes('.') ? '' : KIND_META[tpl.kind].ext);
          const file = makeItem(c.v, driveId, parentId, tpl.kind, uniqueName(driveId, parentId, base), 48 * 1024, { ...tpl.preview, content: tpl.preview.content?.replace('Untitled', name?.trim() || 'Untitled') });
          set((s) => ({ items: [...s.items, file] }));
          return { ok: true, message: `Created ${file.name}.`, itemId: file.id };
        },

        uploadFiles(driveId, parentId, files) {
          const c = viewer();
          if (!c) return fail('Not signed in.');
          if (!files.length) return fail('Choose at least one file.');
          const role = roleAt(c.v, driveId, parentId);
          if (!access.canEdit(role)) return fail('You need editor access here to upload.');
          const d = drive(driveId);
          if (!d) return fail('Drive not found.');
          const incoming = files.reduce((n, f) => n + f.sizeBytes, 0);
          if (usedBytes(driveId) + incoming > d.quotaBytes) return fail(`Not enough space in ${d.name}. Free up storage or ask a drive manager to raise the quota.`);
          const created = files.map((f) => {
            const kind = kindFromFileName(f.name);
            const preview: FilePreview = kind === 'image' ? { type: 'image', gradient: ['#38bdf8', '#a78bfa'] } : kind === 'markdown' || kind === 'code' ? { type: 'code', content: `// ${f.name}\n// Uploaded ${new Date().toISOString().slice(0, 10)}`, language: f.name.split('.').pop() } : { type: 'markdown', content: `# ${f.name}\n\nUploaded by ${c.user.name}. Preview will appear once processing finishes.` };
            return makeItem(c.v, driveId, parentId, kind, uniqueName(driveId, parentId, f.name.trim() || 'Untitled'), Math.max(1024, Math.round(f.sizeBytes)), preview);
          });
          set((s) => ({ items: [...s.items, ...created] }));
          const label = created.length === 1 ? created[0].name : `${created.length} files`;
          if (created.some((i) => SENSITIVITY_META[i.sensitivity].rank >= 2)) audit({ action: 'drive.upload.sensitive', target: label, detail: `${d.name} · ${created[0].sensitivity}` });
          return { ok: true, message: `Uploaded ${label} to ${d.name}.`, itemIds: created.map((i) => i.id) };
        },

        renameItem(itemId, name) {
          const r = requireRole(itemId, (role, it) => access.canEdit(role, it), 'Editor access required to rename.');
          if (r.error) return r.error;
          const clean = name.trim();
          if (!clean) return fail('Name can’t be empty.');
          if (r.it.locked && r.role !== 'manager') return fail('This file is locked.');
          const next = uniqueName(r.it.driveId, r.it.parentId, clean, itemId);
          patchItem(itemId, (i) => touch({ ...i, name: next }, r.c.user.id, 'renamed', `${i.name} → ${next}`));
          return ok(`Renamed to ${next}.`);
        },

        updateItemMeta(itemId, patch) {
          const r = requireRole(itemId, (role, it) => access.canEdit(role, it), 'Editor access required.');
          if (r.error) return r.error;
          patchItem(itemId, (i) => touch({ ...i, description: patch.description ?? i.description, tags: patch.tags ?? i.tags }, r.c.user.id, 'updated details'));
          return ok('Details saved.');
        },

        updateContent(itemId, preview, note) {
          const r = requireRole(itemId, (role, it) => access.canEdit(role, it), 'Editor access required to edit.');
          if (r.error) return r.error;
          if (r.it.locked && r.role !== 'manager') return fail('This file is locked — ask a manager to unlock it.');
          const size = Math.max(r.it.sizeBytes, (preview.content?.length ?? 0) * 2 + (preview.rows?.flat().join('').length ?? 0) * 2 + 20 * 1024);
          patchItem(itemId, (i) => touch({ ...i, preview, sizeBytes: size, versions: [...i.versions, { id: uid('v'), version: i.versions.length + 1, at: Date.now(), by: r.c.user.id, sizeBytes: size, note: note?.trim() || 'Edited' }] }, r.c.user.id, 'edited'));
          return ok('Saved a new version.');
        },

        uploadNewVersion(itemId, sizeBytes, note) {
          const r = requireRole(itemId, (role, it) => access.canEdit(role, it) && it.kind !== 'folder', 'Editor access required.');
          if (r.error) return r.error;
          if (r.it.locked && r.role !== 'manager') return fail('This file is locked.');
          const size = Math.max(1024, Math.round(sizeBytes));
          patchItem(itemId, (i) => touch({ ...i, sizeBytes: size, versions: [...i.versions, { id: uid('v'), version: i.versions.length + 1, at: Date.now(), by: r.c.user.id, sizeBytes: size, note: note?.trim() || 'New version' }] }, r.c.user.id, 'uploaded version', `v${r.it.versions.length + 1}`));
          notify(r.it.comments.map((cm) => cm.authorId), { title: `New version of ${r.it.name}`, body: `${r.c.user.name} uploaded v${r.it.versions.length + 1}${note ? ` — ${note.trim()}` : ''}.`, link: itemLink(itemId) }, r.c.user.id);
          return ok(`Uploaded v${r.it.versions.length + 1}.`);
        },

        moveItem(itemId, targetDriveId, targetParentId) {
          const r = requireRole(itemId, (role, it) => access.canEdit(role, it), 'Editor access required to move.');
          if (r.error) return r.error;
          if (r.it.retention === 'legal_hold') return fail('Items under legal hold can’t be moved.');
          if (targetParentId === itemId || descendants(itemId).some((d) => d.id === targetParentId)) return fail('You can’t move a folder into itself.');
          if (targetDriveId !== r.it.driveId && r.role !== 'manager') return fail('Moving between drives needs manager access on the item.');
          const targetRole = roleAt(r.c.v, targetDriveId, targetParentId);
          if (!access.canEdit(targetRole)) return fail('You need editor access in the destination.');
          const name = uniqueName(targetDriveId, targetParentId, r.it.name, itemId);
          const moving = new Set([itemId, ...descendants(itemId).map((d) => d.id)]);
          const dest = targetParentId ? item(targetParentId)?.name : drive(targetDriveId)?.name;
          set((s) => ({
            items: s.items.map((i) => {
              if (!moving.has(i.id)) return i;
              if (i.id === itemId) return touch({ ...i, driveId: targetDriveId, parentId: targetParentId, name }, r.c.user.id, 'moved', `→ ${dest ?? 'root'}`);
              return { ...i, driveId: targetDriveId };
            }),
          }));
          audit({ action: 'drive.item.moved', target: r.it.name, detail: `→ ${dest ?? targetDriveId}` });
          return ok(`Moved to ${dest ?? 'root'}.`);
        },

        toggleStar(itemId) {
          const r = requireRole(itemId, (role) => access.canView(role), 'Not found.');
          if (r.error) return r.error;
          const starred = r.it.starredBy.includes(r.c.user.id);
          patchItem(itemId, (i) => ({ ...i, starredBy: starred ? i.starredBy.filter((id) => id !== r.c.user.id) : [...i.starredBy, r.c.user.id] }));
          return ok(starred ? 'Removed from starred.' : 'Starred.');
        },

        trashItem(itemId) {
          const r = requireRole(itemId, (role, it) => access.canTrash(role, it), 'Only managers can move this to trash (locked or retained items are protected).');
          if (r.error) return r.error;
          const ids = new Set([itemId, ...descendants(itemId).map((d) => d.id)]);
          const now = Date.now();
          set((s) => ({ items: s.items.map((i) => (ids.has(i.id) ? { ...touch(i, r.c.user.id, 'trashed'), trashed: true, trashedAt: now, trashedBy: r.c.user.id } : i)) }));
          audit({ action: 'drive.item.trashed', target: r.it.name, detail: ids.size > 1 ? `${ids.size - 1} nested items` : undefined, severity: 'warning' });
          return ok(`Moved ${r.it.name} to trash. You have ${TRASH_RETENTION_DAYS} days to restore it.`);
        },

        restoreItem(itemId) {
          const r = requireRole(itemId, (role, it) => access.canManage(role) && it.trashed, 'Only managers can restore.');
          if (r.error) return r.error;
          const ids = new Set([itemId, ...descendants(itemId).map((d) => d.id)]);
          set((s) => ({ items: s.items.map((i) => (ids.has(i.id) ? { ...touch(i, r.c.user.id, 'restored'), trashed: false, trashedAt: undefined, trashedBy: undefined } : i)) }));
          return ok(`Restored ${r.it.name}.`);
        },

        deleteForever(itemId) {
          const r = requireRole(itemId, (role, it) => access.canManage(role) && it.trashed, 'Only managers can permanently delete.');
          if (r.error) return r.error;
          if (r.it.retention !== 'none') return fail(`Retention policy “${r.it.retention}” prevents permanent deletion.`);
          const ids = new Set([itemId, ...descendants(itemId).map((d) => d.id)]);
          set((s) => ({ items: s.items.filter((i) => !ids.has(i.id)) }));
          audit({ action: 'drive.item.deleted', target: r.it.name, severity: 'critical' });
          return ok(`Permanently deleted ${r.it.name}.`);
        },

        emptyTrash() {
          const c = viewer();
          if (!c) return fail('Not signed in.');
          const mine = get().items.filter((i) => i.trashed && i.retention === 'none' && roleOn(c.v, i) === 'manager');
          if (!mine.length) return fail('Nothing to empty.');
          const ids = new Set(mine.map((i) => i.id));
          set((s) => ({ items: s.items.filter((i) => !ids.has(i.id)) }));
          audit({ action: 'drive.trash.emptied', target: `${ids.size} items`, severity: 'warning' });
          return ok(`Deleted ${ids.size} item${ids.size === 1 ? '' : 's'} forever.`);
        },

        shareItem(itemId, principal, role, opts = {}) {
          const r = requireRole(itemId, (rl, it) => access.canShare(rl, it), 'You can’t share this file. Confidential and Restricted files need a manager.');
          if (r.error) return r.error;
          if (role === 'manager' && r.role !== 'manager') return fail('Only managers can grant manager access.');
          const recipient = principal.type === 'user' ? hub().users.find((u) => u.id === principal.id) : undefined;
          if (principal.type === 'user' && !recipient?.active) return fail('Pick an active person.');
          const gate = access.checkShareAllowed(r.it, principal, recipient, recipient ? clearanceOf(recipient, hub().roles) : 0);
          if (!gate.ok) {
            audit({ action: 'drive.share.blocked', target: r.it.name, detail: gate.reason, outcome: 'denied', severity: 'warning' });
            return fail(gate.reason);
          }
          const share: DriveShare = { id: uid('sh'), principal, role, grantedBy: r.c.user.id, at: Date.now(), expiresAt: opts.expiresInDays ? Date.now() + opts.expiresInDays * DAY : undefined, note: opts.note?.trim() || undefined };
          const label = principal.type === 'user' ? (recipient?.name ?? principal.id) : principal.type === 'company' ? 'everyone at Helix' : `${principal.type} ${principal.id}`;
          patchItem(itemId, (i) => touch({ ...i, shares: [...i.shares.filter((s) => JSON.stringify(s.principal) !== JSON.stringify(principal)), share] }, r.c.user.id, 'shared', `${label} · ${role}`));
          if (recipient) notify([recipient.id], { title: `${r.c.user.name} shared “${r.it.name}”`, body: `You can now ${role === 'viewer' ? 'view' : role === 'commenter' ? 'comment on' : 'edit'} it${opts.expiresInDays ? ` for ${opts.expiresInDays} days` : ''}.`, link: itemLink(itemId) }, r.c.user.id);
          audit({ action: 'drive.item.shared', target: r.it.name, detail: `${label} as ${role}${opts.expiresInDays ? ` (${opts.expiresInDays}d)` : ''}`, severity: SENSITIVITY_META[r.it.sensitivity].rank >= 2 ? 'critical' : 'info' });
          return ok(`Shared with ${label} as ${role}.`);
        },

        removeShare(itemId, shareId) {
          const r = requireRole(itemId, (rl, it) => access.canShare(rl, it), 'You can’t change sharing on this file.');
          if (r.error) return r.error;
          patchItem(itemId, (i) => touch({ ...i, shares: i.shares.filter((s) => s.id !== shareId) }, r.c.user.id, 'unshared'));
          return ok('Access removed.');
        },

        setLinkAccess(itemId, linkAccess, linkRole) {
          const r = requireRole(itemId, (rl, it) => access.canShare(rl, it), 'You can’t change link settings on this file.');
          if (r.error) return r.error;
          if (!access.allowedLinkAccess(r.it.sensitivity).includes(linkAccess)) {
            audit({ action: 'drive.link.blocked', target: r.it.name, detail: `${r.it.sensitivity} → ${linkAccess}`, outcome: 'denied', severity: 'warning' });
            return fail(`${SENSITIVITY_META[r.it.sensitivity].label} files can’t use “${linkAccess === 'anyone' ? 'anyone with the link' : 'anyone at Helix'}” links.`);
          }
          patchItem(itemId, (i) => touch({ ...i, linkAccess, linkRole: linkRole ?? i.linkRole }, r.c.user.id, 'link settings', linkAccess));
          if (linkAccess === 'anyone') audit({ action: 'drive.link.public', target: r.it.name, severity: 'warning' });
          return ok(linkAccess === 'restricted' ? 'Link sharing turned off.' : `Anyone ${linkAccess === 'anyone' ? 'with the link' : 'at Helix'} can now ${linkRole ?? r.it.linkRole === 'viewer' ? 'view' : 'edit'}.`);
        },

        setSensitivity(itemId, sensitivity) {
          const r = requireRole(itemId, (rl) => access.canManage(rl), 'Only managers can change sensitivity labels.');
          if (r.error) return r.error;
          const raising = SENSITIVITY_META[sensitivity].rank > SENSITIVITY_META[r.it.sensitivity].rank;
          const ids = new Set([itemId, ...descendants(itemId).map((d) => d.id)]);
          set((s) => ({
            items: s.items.map((i) => {
              if (!ids.has(i.id)) return i;
              let shares = i.shares;
              let linkAccess = i.linkAccess;
              if (sensitivity === 'confidential' || sensitivity === 'restricted') {
                shares = shares.filter((sh) => !(sh.principal.type === 'company' || (sh.principal.type === 'role' && sh.principal.id === 'contractor')));
                if (sensitivity === 'restricted') shares = shares.filter((sh) => sh.principal.type === 'user');
              }
              if (!access.allowedLinkAccess(sensitivity).includes(linkAccess)) linkAccess = 'restricted';
              return touch({ ...i, sensitivity, shares, linkAccess }, r.c.user.id, 'label changed', sensitivity);
            }),
          }));
          audit({ action: 'drive.label.changed', target: r.it.name, detail: `${r.it.sensitivity} → ${sensitivity}${ids.size > 1 ? ` (${ids.size} items)` : ''}`, severity: raising ? 'info' : 'warning' });
          return ok(`Labelled ${SENSITIVITY_META[sensitivity].label}${raising ? ' — broader shares and links were removed.' : '.'}`);
        },

        setInheritance(itemId, inherit) {
          const r = requireRole(itemId, (rl) => access.canManage(rl), 'Only managers can change permission inheritance.');
          if (r.error) return r.error;
          if (!inherit) {
            // Snapshot the currently inherited shares so collaborators keep access until pruned.
            const chain = access.ancestorsOf(r.it, ctx());
            const d = drive(r.it.driveId);
            const inherited: DriveShare[] = [];
            let still = r.it.inheritPermissions;
            for (const node of chain) {
              if (!still) break;
              inherited.push(...node.shares.filter(access.isShareActive));
              still = node.inheritPermissions;
            }
            if (still && d) inherited.push(...d.access.filter(access.isShareActive));
            const seen = new Set(r.it.shares.map((s) => JSON.stringify(s.principal)));
            const copies = inherited.filter((s) => !seen.has(JSON.stringify(s.principal)) && seen.add(JSON.stringify(s.principal))).map((s) => ({ ...s, id: uid('sh'), grantedBy: r.c.user.id, at: Date.now(), note: 'Copied when inheritance was turned off' }));
            patchItem(itemId, (i) => touch({ ...i, inheritPermissions: false, shares: [...i.shares, ...copies] }, r.c.user.id, 'inheritance off'));
            return ok(`Inheritance turned off — ${copies.length} inherited share${copies.length === 1 ? '' : 's'} copied so nobody loses access unexpectedly.`);
          }
          patchItem(itemId, (i) => touch({ ...i, inheritPermissions: true }, r.c.user.id, 'inheritance on'));
          return ok('Now inheriting permissions from the parent.');
        },

        setRetention(itemId, policy) {
          const r = requireRole(itemId, (rl) => access.canManage(rl), 'Only managers can set retention.');
          if (r.error) return r.error;
          if ((policy === 'legal_hold' || r.it.retention === 'legal_hold') && !access.canGovernDrive(r.c.v)) return fail('Legal holds are managed by Drive governance.');
          patchItem(itemId, (i) => touch({ ...i, retention: policy }, r.c.user.id, 'retention', policy));
          audit({ action: 'drive.retention.changed', target: r.it.name, detail: policy, severity: policy === 'legal_hold' ? 'critical' : 'info' });
          return ok(`Retention set to ${policy}.`);
        },

        setLocked(itemId, locked) {
          const r = requireRole(itemId, (rl) => access.canManage(rl), 'Only managers can lock files.');
          if (r.error) return r.error;
          patchItem(itemId, (i) => touch({ ...i, locked }, r.c.user.id, locked ? 'locked' : 'unlocked'));
          return ok(locked ? 'Locked — only managers can edit now.' : 'Unlocked.');
        },

        requestAccess(itemId, role, message) {
          const c = viewer();
          const it = item(itemId);
          if (!c || !access.canUseDrive(c.v) || !it) return fail('File not found.');
          const current = roleOn(c.v, it);
          if (current && ROLE_RANK[current] >= ROLE_RANK[role]) return fail(`You already have ${current} access.`);
          if (get().requests.some((q) => q.itemId === itemId && q.requesterId === c.user.id && q.status === 'pending')) return fail('You already have a pending request for this file.');
          if (it.sensitivity === 'restricted' && c.v.clearance < 3) return fail('This file is Restricted (clearance L3+). Ask the owner through your manager.');
          const req = { id: uid('dar'), itemId, requesterId: c.user.id, role, message: message.trim(), status: 'pending' as const, createdAt: Date.now() };
          set((s) => ({ requests: [req, ...s.requests] }));
          const d = drive(it.driveId);
          notify([it.ownerId, ...(d?.managerIds ?? [])], { title: `Access request · ${it.name}`, body: `${c.user.name} asked for ${role} access${message.trim() ? `: “${message.trim().slice(0, 80)}”` : '.'}`, link: itemLink(itemId) }, c.user.id);
          audit({ action: 'drive.access.requested', target: it.name, detail: role });
          return ok('Request sent to the owner. You’ll be notified when it’s decided.');
        },

        decideAccessRequest(requestId, approve, opts = {}) {
          const c = viewer();
          const req = get().requests.find((q) => q.id === requestId);
          const it = req ? item(req.itemId) : undefined;
          if (!c || !req || !it) return fail('Request not found.');
          if (req.status !== 'pending') return fail('This request was already decided.');
          const role = roleOn(c.v, it);
          if (!access.canShare(role, it)) return fail('Only people who can share this file can decide requests.');
          const now = Date.now();
          if (approve) {
            const res = get().shareItem(it.id, { type: 'user', id: req.requesterId }, opts.role ?? req.role, { expiresInDays: opts.expiresInDays, note: opts.note ?? 'Approved access request' });
            if (!res.ok) return res;
          }
          set((s) => ({ requests: s.requests.map((q) => (q.id === requestId ? { ...q, status: approve ? 'approved' : 'denied', decidedBy: c.user.id, decidedAt: now } : q)) }));
          notify([req.requesterId], { title: approve ? `Access granted · ${it.name}` : `Access request declined · ${it.name}`, body: approve ? `${c.user.name} gave you ${opts.role ?? req.role} access${opts.expiresInDays ? ` for ${opts.expiresInDays} days` : ''}.` : opts.note?.trim() || `${c.user.name} declined your request.`, link: approve ? itemLink(it.id) : '/drive' }, c.user.id);
          audit({ action: approve ? 'drive.access.approved' : 'drive.access.denied', target: `${it.name} · ${userName(req.requesterId)}`, detail: opts.role ?? req.role });
          return ok(approve ? `Granted ${opts.role ?? req.role} access to ${userName(req.requesterId)}.` : 'Request declined.');
        },

        addComment(itemId, body) {
          const r = requireRole(itemId, (rl) => access.canComment(rl), 'Commenter access required.');
          if (r.error) return r.error;
          const clean = body.trim();
          if (!clean) return fail('Write something first.');
          patchItem(itemId, (i) => ({ ...i, comments: [...i.comments, { id: uid('fc'), authorId: r.c.user.id, body: clean, at: Date.now(), resolved: false }], activity: [...i.activity, act(r.c.user.id, 'commented')] }));
          notify([r.it.ownerId, ...r.it.comments.map((cm) => cm.authorId)], { title: `${r.c.user.name} commented on ${r.it.name}`, body: clean.slice(0, 120), link: itemLink(itemId) }, r.c.user.id);
          return ok('Comment added.');
        },

        resolveComment(itemId, commentId) {
          const r = requireRole(itemId, (rl) => access.canComment(rl), 'Commenter access required.');
          if (r.error) return r.error;
          patchItem(itemId, (i) => ({ ...i, comments: i.comments.map((cm) => (cm.id === commentId ? { ...cm, resolved: !cm.resolved } : cm)) }));
          return ok();
        },

        recordOpen(itemId) {
          const c = viewer();
          const it = item(itemId);
          if (!c || !it || !roleOn(c.v, it)) return;
          set((s) => ({
            items: s.items.map((i) => (i.id === itemId ? { ...i, views: i.views + 1, openedBy: { ...i.openedBy, [c.user.id]: (i.openedBy[c.user.id] ?? 0) + 1 } } : i)),
            recents: { ...s.recents, [c.user.id]: [{ itemId, at: Date.now() }, ...(s.recents[c.user.id] ?? []).filter((x) => x.itemId !== itemId)].slice(0, 20) },
          }));
        },

        downloadItem(itemId) {
          const c = viewer();
          const it = item(itemId);
          const role = c ? roleOn(c.v, it) : null;
          if (!c || !it || !role) return fail('File not found.');
          if (!access.canDownload(role, it)) {
            audit({ action: 'drive.download.blocked', target: it.name, detail: `${it.sensitivity} · ${role}`, outcome: 'denied', severity: 'warning' });
            return fail('Restricted files can’t be downloaded by viewers. Ask the owner for commenter access or view it here.');
          }
          const watermark = SENSITIVITY_META[it.sensitivity].rank >= 2 ? `${SENSITIVITY_META[it.sensitivity].label.toUpperCase()} · ${c.user.name} · ${new Date().toISOString().slice(0, 16)}` : undefined;
          const body = it.preview.type === 'table' ? (it.preview.rows ?? []).map((r) => r.join(',')).join('\n') : it.preview.type === 'slides' ? (it.preview.slides ?? []).map((s, i) => `Slide ${i + 1}: ${s}`).join('\n') : (it.preview.content ?? `${it.name}`);
          if (watermark) audit({ action: 'drive.download.sensitive', target: it.name, detail: watermark, severity: 'warning' });
          patchItem(itemId, (i) => ({ ...i, activity: [...i.activity, act(c.user.id, 'downloaded')].slice(-60) }));
          return { ok: true, message: `Downloading ${it.name}…`, fileName: it.name, content: watermark ? `[${watermark}]\n\n${body}` : body, watermark };
        },

        createSharedDrive(input) {
          const c = viewer();
          if (!c || !access.canCreateSharedDrive(c.v)) return fail('Managers, People Ops and Drive governance can create shared drives.');
          const name = input.name.trim();
          if (name.length < 3) return fail('Name the drive (3+ characters).');
          const department = access.canGovernDrive(c.v) ? input.department : (input.department ?? c.user.department);
          if (department && department !== c.user.department && !access.canGovernDrive(c.v)) return fail('You can only create drives for your own department.');
          const driveId = uid('drv');
          const now = Date.now();
          const d: SharedDrive = {
            id: driveId,
            name,
            description: input.description?.trim() ?? '',
            icon: input.icon ?? '📁',
            color: input.color ?? '#60a5fa',
            kind: 'team',
            department,
            managerIds: [...new Set([c.user.id, ...(input.managerIds ?? [])])],
            access: (input.access ?? (department ? [{ principal: { type: 'department', id: department } as Principal, role: 'editor' as DriveRole }] : [])).map((a) => ({ id: uid('sh'), principal: a.principal, role: a.role, grantedBy: c.user.id, at: now })),
            quotaBytes: 200 * 1024 ** 3,
            defaultSensitivity: input.defaultSensitivity ?? 'internal',
            createdAt: now,
          };
          set((s) => ({ drives: [...s.drives, d] }));
          audit({ action: 'drive.shared.created', target: name, detail: department });
          return { ok: true, message: `Created shared drive ${name}.`, driveId };
        },

        updateSharedDrive(driveId, patch) {
          const c = viewer();
          const d = drive(driveId);
          if (!c || !d || !access.canManageDrive(c.v, d)) return fail('Only drive managers can change settings.');
          if (patch.managerIds && !patch.managerIds.length) return fail('A drive needs at least one manager.');
          set((s) => ({ drives: s.drives.map((x) => (x.id === driveId ? { ...x, ...patch, name: patch.name?.trim() || x.name } : x)) }));
          audit({ action: 'drive.shared.updated', target: d.name, detail: Object.keys(patch).join(', ') });
          return ok('Drive settings saved.');
        },

        setDriveAccess(driveId, shares) {
          const c = viewer();
          const d = drive(driveId);
          if (!c || !d || !access.canManageDrive(c.v, d)) return fail('Only drive managers can change membership.');
          const now = Date.now();
          set((s) => ({ drives: s.drives.map((x) => (x.id === driveId ? { ...x, access: shares.map((a) => ({ id: uid('sh'), principal: a.principal, role: a.role, grantedBy: c.user.id, at: now })) } : x)) }));
          audit({ action: 'drive.shared.access', target: d.name, detail: `${shares.length} membership rules` });
          return ok('Membership updated.');
        },

        ensureReady() {
          const c = viewer();
          if (!c) return;
          ensurePersonalDrive(c.user.id);
          const cutoff = Date.now() - TRASH_RETENTION_DAYS * DAY;
          const expired = get().items.filter((i) => i.trashed && i.retention === 'none' && (i.trashedAt ?? 0) < cutoff);
          if (expired.length) {
            const ids = new Set(expired.map((i) => i.id));
            set((s) => ({ items: s.items.filter((i) => !ids.has(i.id)) }));
          }
        },

        resetDriveDemo() {
          set(createDriveSeed());
        },
      };
    },
    {
      name: 'nexus-drive',
      version: DRIVE_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): DriveData => ({ version: s.version, drives: s.drives, items: s.items, requests: s.requests, recents: s.recents }),
      migrate: (persisted, version) => (version === DRIVE_DATA_VERSION ? (persisted as DriveData) : createDriveSeed()),
    },
  ),
);

export function initDrive() {
  useDrive.getState().ensureReady();
}
