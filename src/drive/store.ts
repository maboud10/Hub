/**
 * Helix Drive store — behaves like an API: validates input, re-checks permissions with the
 * pure engine, applies DLP, writes audit entries and notifies affected people.
 * Persisted under `nexus-drive-v2` (reseeds on version mismatch).
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useHub } from '@/store/hub';
import type { Department, User } from '@/types';
import { uid } from '@/lib/id';
import type { AccessRequest, Activity, Content, Drive, DriveData, DrivePrefs, Item, LabelRule, Level, LinkLevel, LinkScope, Place, Principal, Sensitivity, Share, Verb } from './types';
import {
  buildCtx,
  capsOf,
  checkGrant,
  checkLabelChange,
  checkLink,
  childrenOf,
  defaultLabelFor,
  descendants,
  driveAccess,
  effectiveAccess,
  holdOf,
  isTrashed,
  isWithin,
  placeAccess,
  principalMembers,
  principalName,
  samePrincipal,
  trashedRoot,
  uniqueName,
  viewerOf,
  type Caps,
  type EngineCtx,
  type Viewer,
  type Access,
} from './access';
import { DAY, LABEL_NAME, LABEL_RANK, LEVEL_LABEL, RANK, atLeast, clamp, formatBytes, hashStr, isTextLike, kindFromFile, langFromName, extOf } from './meta';
import { DRIVE_DATA_VERSION, createDriveSeed, personalDriveId } from './seed';
import { contentBytes } from './content';
import type { FixAction } from './risk';

export type Result<T extends object = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

export interface UploadInput {
  name: string;
  size: number;
  mime: string;
  /** Images ≤ 2 MB. */
  dataUrl?: string;
  /** Text / code / markdown / CSV ≤ 200 KB. */
  text?: string;
}

export interface ShareInput {
  principal: Principal;
  level: Level;
  expiresAt: number | null;
}

export interface NewDriveInput {
  name: string;
  description?: string;
  icon: string;
  color: string;
  department?: Department;
  defaultLabel: Sensitivity;
  members: ShareInput[];
}

export const DEFAULT_PREFS: DrivePrefs = { view: 'grid', sort: 'name', dir: 'asc', details: false };

export const itemRoute = (item: Pick<Item, 'id' | 'kind' | 'driveId'>) => (item.kind === 'folder' ? `/drive/d/${item.driveId}/${item.id}` : `/drive/file/${item.id}`);

interface DriveActions {
  resetDemo(): void;
  ensurePersonalDrive(userId: string): void;
  sweepTrash(): number;
  setPrefs(patch: Partial<DrivePrefs>): void;
  recordOpen(id: string): void;
  createFolder(place: Place, name?: string): Result<{ id: string }>;
  createFile(place: Place, kind: 'doc' | 'sheet' | 'slides', name?: string): Result<{ id: string }>;
  upload(place: Place, files: UploadInput[]): Result<{ ids: string[] }>;
  rename(id: string, name: string): Result;
  move(ids: string[], dest: Place): Result<{ moved: string[]; revert: () => void }>;
  copy(id: string): Result<{ id: string }>;
  trash(ids: string[]): Result<{ trashed: string[]; revert: () => void }>;
  restore(ids: string[]): Result<{ restored: string[] }>;
  purge(ids: string[]): Result<{ purged: number }>;
  emptyTrash(): Result<{ purged: number; kept: number }>;
  setStar(ids: string[], on: boolean): Result;
  setLabel(ids: string[], label: Sensitivity, justification?: string): Result<{ changed: number }>;
  updateDetails(id: string, patch: { description?: string; tags?: string[]; color?: string }): Result;
  share(id: string, entries: ShareInput[], opts?: { notify?: boolean; message?: string }): Result<{ added: number; updated: number }>;
  updateShare(hostId: string, shareId: string, patch: { level?: Level; expiresAt?: number | null }): Result;
  removeShare(hostId: string, shareId: string): Result;
  setLink(id: string, link: { scope: LinkScope; level: LinkLevel }): Result;
  setInherit(id: string, inherit: boolean): Result;
  saveContent(id: string, content: Content, summary?: string): Result<{ version: number }>;
  restoreVersion(id: string, versionId: string): Result<{ version: number }>;
  addThread(id: string, text: string, quote?: string): Result<{ threadId: string; mentioned: string[]; noAccess: string[] }>;
  reply(id: string, threadId: string, text: string): Result<{ mentioned: string[]; noAccess: string[] }>;
  resolveThread(id: string, threadId: string, resolved: boolean): Result;
  requestAccess(id: string, level: Level, reason: string): Result<{ requestId: string }>;
  cancelRequest(requestId: string): Result;
  decideRequest(requestId: string, decision: 'approve' | 'deny', opts?: { level?: Level; expiresAt?: number | null; note?: string }): Result;
  download(ids: string[]): Result<{ count: number; bytes: number }>;
  setRule(label: Sensitivity, patch: Partial<LabelRule>): Result;
  setRetention(days: number): Result;
  setHold(target: { driveId?: string; itemId?: string }, on: boolean, reason?: string): Result;
  createDrive(input: NewDriveInput): Result<{ id: string }>;
  updateDrive(id: string, patch: Partial<Pick<Drive, 'name' | 'description' | 'icon' | 'color' | 'defaultLabel' | 'department'>>): Result;
  setDriveMember(driveId: string, principal: Principal, level: Level | null, expiresAt?: number | null): Result;
  fixFinding(fix: FixAction): Result;
}

export type DriveStore = DriveData & DriveActions;

const ok = <T extends object>(extra: T, message?: string) => ({ ok: true as const, message, ...extra });
const fail = (error: string) => ({ ok: false as const, error });

/* ---------------- persistence ---------------- */

/** localStorage with a quota fallback: drops uploaded image previews from the persisted copy. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      try {
        const parsed = JSON.parse(v) as { state?: DriveData };
        for (const it of parsed.state?.items ?? []) {
          if (it.content?.type === 'image' && it.content.src?.startsWith('data:')) delete it.content.src;
          it.versions = it.versions.map((ver, i, arr) => (i < arr.length - 3 ? { ...ver, content: undefined } : ver));
        }
        localStorage.setItem(k, JSON.stringify(parsed));
      } catch {
        /* storage full — keep the in-memory state for this session */
      }
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

try {
  localStorage.removeItem('nexus-drive');
} catch {
  /* not in a browser */
}

/* ---------------- helpers ---------------- */

const MAX_ACTIVITY = 60;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim())).slice(0, 400);
}

/** `@Full Name` / `@First` mentions → user ids. */
export function parseMentions(text: string, users: User[]): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/@([A-Z][\p{L}'-]+)(?:\s([A-Z][\p{L}'-]+))?/gu)) {
    const full = m[2] ? `${m[1]} ${m[2]}` : '';
    const u = (full && users.find((x) => x.name === full)) || users.find((x) => x.name.split(' ')[0] === m[1]);
    if (u) ids.add(u.id);
  }
  return [...ids];
}

const TEMPLATES: Record<'doc' | 'sheet' | 'slides', (name: string) => Content> = {
  doc: (name) => ({ type: 'doc', text: `# ${name}\n\nStart writing here. Use **Edit** to change this document — every save becomes a version in Time Machine.` }),
  sheet: () => ({
    type: 'sheet',
    rows: [
      ['Item', 'Owner', 'Status', 'Amount'],
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
      ['Total', '', '', '=SUM(D2:D4)'],
    ],
  }),
  slides: (name) => ({ type: 'slides', slides: [{ kind: 'title', title: name, body: ['Add your story here'] }] }),
};

const DEFAULT_NAME = { doc: 'Untitled document', sheet: 'Untitled spreadsheet', slides: 'Untitled presentation' } as const;

export const useDrive = create<DriveStore>()(
  persist(
    (set, get) => {
      /* ---------- session & guards ---------- */
      interface Session {
        user: User;
        viewer: Viewer;
        ctx: EngineCtx;
      }
      const session = (): Session | null => {
        const hub = useHub.getState();
        const user = hub.users.find((u) => u.id === hub.sessionUserId);
        if (!user) return null;
        return { user, viewer: viewerOf(user, hub.roles), ctx: buildCtx(get(), hub.users, hub.roles) };
      };
      const audit = (action: string, target: string, detail: string | undefined, severity: 'info' | 'warning' | 'critical' = 'info', outcome: 'success' | 'denied' = 'success') =>
        useHub.getState().logAudit({ action, target, detail, outcome, severity });
      const notify = (userIds: string[], n: { kind: 'access' | 'request' | 'work' | 'system'; title: string; body?: string; link?: string }, exceptId?: string) => {
        const ids = [...new Set(userIds)].filter((id) => id && id !== exceptId);
        if (ids.length) useHub.getState().pushNotifications(ids, n);
      };
      type Need = 'view' | 'comment' | 'edit' | 'share' | 'trash' | 'purge' | 'label';
      const NEED_LABEL: Record<Need, string> = {
        view: 'open',
        comment: 'comment on',
        edit: 'edit',
        share: 'manage sharing for',
        trash: 'move to trash',
        purge: 'delete',
        label: 'change the label of',
      };
      const guard = (s: Session, id: string, need: Need, action: string): { item: Item; access: Access; caps: Caps } | { error: string } => {
        const item = s.ctx.item.get(id);
        if (!item) return { error: 'That item no longer exists.' };
        const access = effectiveAccess(s.ctx, s.viewer, item);
        const caps = capsOf(s.ctx, access);
        const allowed = need === 'view' ? caps.view : need === 'comment' ? caps.comment : need === 'edit' ? caps.edit : need === 'share' ? caps.share : need === 'label' ? caps.label : need === 'trash' ? caps.trash : caps.purge;
        if (!allowed) {
          if ((need === 'trash' || need === 'purge') && caps.held) {
            const h = holdOf(s.ctx, item);
            audit(action, item.name, `Blocked by legal hold on ${h?.where ?? 'a parent'}`, 'warning', 'denied');
            return { error: `“${item.name}” is under legal hold (${h?.hold.reason ?? 'preservation'}). It can’t be deleted.` };
          }
          audit(action, item.name, `Needs ${need}; has ${access.level}`, 'warning', 'denied');
          const lvl = LEVEL_LABEL[access.level].toLowerCase();
          return { error: access.level === 'none' ? 'You don’t have access to that item.' : `You can’t ${NEED_LABEL[need]} “${item.name}” — you’re ${/^[aeiou]/.test(lvl) ? 'an' : 'a'} ${lvl}.` };
        }
        return { item, access, caps };
      };
      const isAdmin = (s: Session) => s.viewer.admin;

      /* ---------- mutation helpers ---------- */
      const activity = (by: string, verb: Verb, detail?: string): Activity => ({ id: uid('a'), at: Date.now(), by, verb, detail });
      const patchItems = (fn: (i: Item) => Item | null) =>
        set((st) => ({ items: st.items.map((i) => fn(i)).filter((i): i is Item => i !== null) }));
      const patchItem = (id: string, fn: (i: Item) => Item) => set((st) => ({ items: st.items.map((i) => (i.id === id ? fn(i) : i)) }));
      const withActivity = (i: Item, a: Activity): Item => ({ ...i, activity: [a, ...i.activity].slice(0, MAX_ACTIVITY) });
      const touch = (i: Item, by: string): Item => ({ ...i, updatedAt: Date.now(), updatedBy: by });

      const approversOf = (ctx: EngineCtx, item: Item): string[] =>
        ctx.viewers.filter((v) => effectiveAccess(ctx, v, item).reasons.some((r) => RANK[r.level] >= RANK.manager && r.source !== 'admin')).map((v) => v.id);

      const newItem = (s: Session, place: Place, base: Partial<Item> & Pick<Item, 'kind' | 'name'>): Item => {
        const now = Date.now();
        const label = defaultLabelFor(s.ctx, place.driveId, place.parentId);
        return {
          id: uid(base.kind === 'folder' ? 'fo' : 'df'),
          driveId: place.driveId,
          parentId: place.parentId,
          ownerId: s.user.id,
          createdAt: now,
          updatedAt: now,
          updatedBy: s.user.id,
          size: 0,
          label,
          tags: [],
          shares: [],
          link: { scope: 'restricted', level: 'viewer' },
          inherit: true,
          starredBy: [],
          trashed: null,
          hold: null,
          versions: [],
          threads: [],
          activity: [],
          ...base,
        };
      };

      const canCreate = (s: Session, place: Place): string | null => {
        const d = s.ctx.drive.get(place.driveId);
        if (!d) return 'That drive doesn’t exist.';
        if (place.parentId) {
          const p = s.ctx.item.get(place.parentId);
          if (!p || p.kind !== 'folder') return 'That folder doesn’t exist.';
          if (isTrashed(s.ctx, p)) return 'That folder is in the trash.';
        }
        if (!atLeast(placeAccess(s.ctx, s.viewer, place.driveId, place.parentId), 'editor')) return 'You need edit access to add things here.';
        return null;
      };

      const fixMove = (ctx: EngineCtx, itemId: string, toParentId: string | null): void => {
        const item = ctx.item.get(itemId);
        if (!item) return;
        const name = uniqueName(ctx, item.driveId, toParentId, item.name, item.id);
        patchItem(itemId, (i) => withActivity({ ...i, parentId: toParentId, name }, activity(useHub.getState().sessionUserId ?? 'system', 'moved', 'Moved by governance fix')));
      };

      return {
        ...createDriveSeed(),

        resetDemo() {
          const seed = createDriveSeed();
          set({ ...seed });
        },

        ensurePersonalDrive(userId) {
          const id = personalDriveId(userId);
          if (get().drives.some((d) => d.id === id)) return;
          set((st) => ({
            drives: [
              ...st.drives,
              {
                id,
                kind: 'personal',
                name: 'My Drive',
                description: 'Your private space. Share files when you’re ready.',
                icon: 'user',
                color: '#94a3b8',
                ownerId: userId,
                members: [],
                defaultLabel: 'internal',
                quota: 30 * 1024 ** 3,
                createdAt: Date.now(),
                createdBy: userId,
                hold: null,
              },
            ],
          }));
        },

        sweepTrash() {
          const st = get();
          const hub = useHub.getState();
          const ctx = buildCtx(st, hub.users, hub.roles);
          const cutoff = Date.now() - st.policy.trashDays * DAY;
          const doomed = st.items.filter((i) => i.trashed && i.trashed.at < cutoff && !holdOf(ctx, i));
          if (!doomed.length) return 0;
          const ids = new Set<string>();
          for (const d of doomed) {
            ids.add(d.id);
            descendants(ctx, d).forEach((x) => ids.add(x.id));
          }
          set((s2) => ({ items: s2.items.filter((i) => !ids.has(i.id)), requests: s2.requests.filter((r) => !ids.has(r.itemId)) }));
          hub.logAudit({ action: 'drive.retention.purge', target: `${doomed.length} items`, detail: `Trash retention (${st.policy.trashDays} days)`, outcome: 'success', severity: 'info', actorId: 'system' });
          return doomed.length;
        },

        setPrefs(patch) {
          const id = useHub.getState().sessionUserId;
          if (!id) return;
          set((st) => ({ prefs: { ...st.prefs, [id]: { ...DEFAULT_PREFS, ...st.prefs[id], ...patch } } }));
        },

        recordOpen(id) {
          const uidv = useHub.getState().sessionUserId;
          if (!uidv) return;
          set((st) => ({ recents: { ...st.recents, [uidv]: [{ id, at: Date.now() }, ...(st.recents[uidv] ?? []).filter((r) => r.id !== id)].slice(0, 40) } }));
        },

        createFolder(place, name = 'Untitled folder') {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const err = canCreate(s, place);
          if (err) return fail(err);
          const clean = name.trim().slice(0, 120) || 'Untitled folder';
          const item = newItem(s, place, { kind: 'folder', name: uniqueName(s.ctx, place.driveId, place.parentId, clean) });
          item.activity = [activity(s.user.id, 'created')];
          set((st) => ({ items: [...st.items, item] }));
          return ok({ id: item.id }, `Created “${item.name}”`);
        },

        createFile(place, kind, name) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const err = canCreate(s, place);
          if (err) return fail(err);
          const clean = (name ?? DEFAULT_NAME[kind]).trim().slice(0, 120) || DEFAULT_NAME[kind];
          const finalName = uniqueName(s.ctx, place.driveId, place.parentId, clean);
          const content = TEMPLATES[kind](finalName);
          const size = contentBytes(content);
          const item = newItem(s, place, { kind, name: finalName, content, size });
          item.versions = [{ id: uid('v'), n: 1, at: Date.now(), by: s.user.id, size, summary: 'Created', content }];
          item.activity = [activity(s.user.id, 'created')];
          set((st) => ({ items: [...st.items, item] }));
          return ok({ id: item.id }, `Created “${finalName}”`);
        },

        upload(place, files) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const err = canCreate(s, place);
          if (err) return fail(err);
          if (!files.length) return fail('Choose at least one file.');
          const created: Item[] = [];
          const ctx = s.ctx;
          for (const f of files.slice(0, 50)) {
            const raw = f.name.trim().replace(/[\\/]/g, '-').slice(0, 160) || 'Untitled';
            const name = uniqueName(ctx, place.driveId, place.parentId, raw);
            const kind = kindFromFile(raw, f.mime);
            const h = hashStr(name + f.size);
            let content: Content | undefined;
            if (kind === 'image') content = { type: 'image', src: f.dataUrl, hue: h % 360, motif: (['mesh', 'orbit', 'wave', 'grid', 'bloom'] as const)[h % 5], w: 0, h: 0 };
            else if (f.text !== undefined && isTextLike(raw, f.mime)) {
              const ext = extOf(raw);
              if (ext === 'csv' || ext === 'tsv') content = { type: 'sheet', rows: ext === 'tsv' ? f.text.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')) : parseCsv(f.text) };
              else if (kind === 'text') content = { type: 'doc', text: f.text };
              else content = { type: 'code', lang: langFromName(raw), text: f.text };
            } else if (kind === 'video' || kind === 'audio') content = { type: 'media', duration: Math.max(8, Math.round(f.size / (kind === 'video' ? 450_000 : 24_000))), hue: h % 360 };
            const item = newItem(s, place, { kind, name, size: Math.max(0, Math.round(f.size)), mime: f.mime || undefined, content });
            item.versions = [{ id: uid('v'), n: 1, at: Date.now(), by: s.user.id, size: item.size, summary: 'Uploaded', content: content && content.type !== 'image' ? content : undefined }];
            item.activity = [activity(s.user.id, 'uploaded', formatBytes(item.size))];
            created.push(item);
            // keep later names unique within the same batch
            ctx.children.set(place.parentId ?? `root:${place.driveId}`, [...childrenOf(ctx, place.driveId, place.parentId, true), item]);
          }
          set((st) => ({ items: [...st.items, ...created] }));
          return ok({ ids: created.map((c) => c.id) }, created.length === 1 ? `Uploaded “${created[0].name}”` : `Uploaded ${created.length} files`);
        },

        rename(id, name) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'edit', 'drive.item.rename');
          if ('error' in g) return fail(g.error);
          const clean = name.trim().replace(/[\\/]/g, '-').slice(0, 160);
          if (!clean) return fail('Names can’t be empty.');
          if (clean === g.item.name) return ok({});
          if (childrenOf(s.ctx, g.item.driveId, g.item.parentId).some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) return fail(`“${clean}” already exists here.`);
          patchItem(id, (i) => withActivity(touch({ ...i, name: clean }, s.user.id), activity(s.user.id, 'renamed', `${i.name} → ${clean}`)));
          return ok({}, `Renamed to “${clean}”`);
        },

        move(ids, dest) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const destDrive = s.ctx.drive.get(dest.driveId);
          if (!destDrive) return fail('That destination doesn’t exist.');
          const destFolder = dest.parentId ? s.ctx.item.get(dest.parentId) : null;
          if (dest.parentId && (!destFolder || destFolder.kind !== 'folder')) return fail('You can only move things into folders.');
          if (!atLeast(placeAccess(s.ctx, s.viewer, dest.driveId, dest.parentId), 'editor')) {
            audit('drive.item.move', destFolder?.name ?? destDrive.name, 'No edit access on destination', 'info', 'denied');
            return fail(`You need edit access to “${destFolder?.name ?? destDrive.name}” to move things there.`);
          }
          const moved: string[] = [];
          const snapshot = new Map<string, { driveId: string; parentId: string | null; name: string }>();
          const skipped: string[] = [];
          const work = new Map(s.ctx.item);
          for (const id of ids) {
            const g = guard(s, id, 'edit', 'drive.item.move');
            if ('error' in g) {
              skipped.push(g.error);
              continue;
            }
            const item = g.item;
            if (item.parentId === dest.parentId && item.driveId === dest.driveId) continue;
            if (dest.parentId && (item.id === dest.parentId || (destFolder && isWithin(s.ctx, destFolder, item.id)))) {
              skipped.push(`Can’t move “${item.name}” into itself.`);
              continue;
            }
            const crossDrive = item.driveId !== dest.driveId;
            if (crossDrive && !g.caps.share) {
              skipped.push(`Moving “${item.name}” to another drive needs manager access.`);
              continue;
            }
            const h = holdOf(s.ctx, item);
            if (h && !(dest.parentId && destFolder && holdOf(s.ctx, destFolder))) {
              skipped.push(`“${item.name}” is under legal hold and can’t leave ${h.where}.`);
              continue;
            }
            const name = uniqueName({ ...s.ctx, item: work }, dest.driveId, dest.parentId, item.name, item.id);
            snapshot.set(item.id, { driveId: item.driveId, parentId: item.parentId, name: item.name });
            if (crossDrive) for (const d of descendants(s.ctx, item)) snapshot.set(d.id, { driveId: d.driveId, parentId: d.parentId, name: d.name });
            moved.push(item.id);
            const from = item.parentId ? (s.ctx.item.get(item.parentId)?.name ?? 'a folder') : (s.ctx.drive.get(item.driveId)?.name ?? 'drive root');
            const to = destFolder?.name ?? (destDrive.kind === 'personal' ? 'My Drive' : destDrive.name);
            const subtree = new Set(crossDrive ? descendants(s.ctx, item).map((d) => d.id) : []);
            patchItems((i) => {
              if (i.id === item.id) return withActivity(touch({ ...i, parentId: dest.parentId, driveId: dest.driveId, name }, s.user.id), activity(s.user.id, 'moved', `${from} → ${to}`));
              if (subtree.has(i.id)) return { ...i, driveId: dest.driveId };
              return i;
            });
            if (crossDrive) audit('drive.item.move', item.name, `${from} → ${to} (cross-drive)`, LABEL_RANK[item.label] >= 2 ? 'warning' : 'info');
          }
          if (!moved.length) return fail(skipped[0] ?? 'Nothing to move.');
          const revert = () => {
            set((st) => ({ items: st.items.map((i) => (snapshot.has(i.id) ? { ...i, ...(snapshot.get(i.id) as { driveId: string; parentId: string | null; name: string }) } : i)) }));
          };
          const dn = destFolder?.name ?? (destDrive.kind === 'personal' ? 'My Drive' : destDrive.name);
          return ok({ moved, revert }, `${moved.length === 1 ? `Moved “${s.ctx.item.get(moved[0])?.name}”` : `Moved ${moved.length} items`} to ${dn}${skipped.length ? ` · ${skipped.length} skipped` : ''}`);
        },

        copy(id) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'view', 'drive.item.copy');
          if ('error' in g) return fail(g.error);
          if (g.item.kind === 'folder') return fail('Folders can’t be copied yet — copy the files inside.');
          if (!g.caps.download) {
            audit('drive.item.copy', g.item.name, `${LABEL_NAME[g.item.label]} label blocks copies`, 'warning', 'denied');
            return fail(`${LABEL_NAME[g.item.label]} files can’t be copied or downloaded.`);
          }
          const sameOk = atLeast(placeAccess(s.ctx, s.viewer, g.item.driveId, g.item.parentId), 'editor');
          const place: Place = sameOk ? { driveId: g.item.driveId, parentId: g.item.parentId } : { driveId: personalDriveId(s.user.id), parentId: null };
          if (!s.ctx.drive.get(place.driveId)) get().ensurePersonalDrive(s.user.id);
          const name = uniqueName(s.ctx, place.driveId, place.parentId, `Copy of ${g.item.name}`);
          const now = Date.now();
          const copyItem: Item = {
            ...g.item,
            id: uid('df'),
            ...place,
            name,
            ownerId: s.user.id,
            createdAt: now,
            updatedAt: now,
            updatedBy: s.user.id,
            shares: [],
            link: { scope: 'restricted', level: 'viewer' },
            inherit: true,
            starredBy: [],
            trashed: null,
            hold: null,
            threads: [],
            versions: [{ id: uid('v'), n: 1, at: now, by: s.user.id, size: g.item.size, summary: `Copied from “${g.item.name}”`, content: g.item.content && g.item.content.type !== 'image' ? g.item.content : undefined }],
            activity: [activity(s.user.id, 'copied', `From “${g.item.name}”`)],
          };
          set((st) => ({ items: [...st.items.map((i) => (i.id === id ? withActivity(i, activity(s.user.id, 'copied', `Copy “${name}” created`)) : i)), copyItem] }));
          return ok({ id: copyItem.id }, `Copied to ${sameOk ? 'this folder' : 'My Drive'}`);
        },

        trash(ids) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const done: string[] = [];
          let firstErr = '';
          for (const id of ids) {
            const g = guard(s, id, 'trash', 'drive.item.trash');
            if ('error' in g) {
              firstErr ||= g.error;
              continue;
            }
            if (g.item.trashed) continue;
            done.push(id);
          }
          if (!done.length) return fail(firstErr || 'Nothing to move to trash.');
          const now = Date.now();
          const set1 = new Set(done);
          patchItems((i) => (set1.has(i.id) ? withActivity({ ...i, trashed: { at: now, by: s.user.id } }, activity(s.user.id, 'trashed')) : i));
          const sensitive = done.map((id) => s.ctx.item.get(id)).filter((i): i is Item => !!i && LABEL_RANK[i.label] >= 2);
          if (sensitive.length) audit('drive.item.trash', sensitive.map((i) => i.name).join(', ').slice(0, 120), `${sensitive.length} sensitive item(s)`, 'info');
          const revert = () => patchItems((i) => (set1.has(i.id) && i.trashed?.at === now ? withActivity({ ...i, trashed: null }, activity(s.user.id, 'restored', 'Undo')) : i));
          return ok({ trashed: done, revert }, done.length === 1 ? `“${s.ctx.item.get(done[0])?.name}” moved to trash` : `${done.length} items moved to trash`);
        },

        restore(ids) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const restored: string[] = [];
          let firstErr = '';
          for (const id of ids) {
            const g = guard(s, id, 'edit', 'drive.item.restore');
            if ('error' in g) {
              firstErr ||= g.error;
              continue;
            }
            if (!g.item.trashed) continue;
            const parent = g.item.parentId ? s.ctx.item.get(g.item.parentId) : null;
            const orphan = g.item.parentId !== null && (!parent || isTrashed(s.ctx, parent));
            const name = orphan ? uniqueName(s.ctx, g.item.driveId, null, g.item.name, g.item.id) : g.item.name;
            patchItem(id, (i) => withActivity({ ...i, trashed: null, parentId: orphan ? null : i.parentId, name }, activity(s.user.id, 'restored', orphan ? 'Restored to drive root (original folder is gone)' : undefined)));
            restored.push(id);
          }
          if (!restored.length) return fail(firstErr || 'Nothing to restore.');
          return ok({ restored }, restored.length === 1 ? `Restored “${s.ctx.item.get(restored[0])?.name}”` : `Restored ${restored.length} items`);
        },

        purge(ids) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const doomed = new Set<string>();
          let firstErr = '';
          let n = 0;
          for (const id of ids) {
            const g = guard(s, id, 'purge', 'drive.item.purge');
            if ('error' in g) {
              firstErr ||= g.error;
              continue;
            }
            const held = descendants(s.ctx, g.item).find((d) => d.hold);
            if (held) {
              firstErr ||= `“${held.name}” inside is under legal hold.`;
              continue;
            }
            doomed.add(id);
            descendants(s.ctx, g.item).forEach((d) => doomed.add(d.id));
            n++;
            audit('drive.item.purge', g.item.name, `${LABEL_NAME[g.item.label]} · deleted forever`, LABEL_RANK[g.item.label] >= 2 ? 'warning' : 'info');
          }
          if (!n) return fail(firstErr || 'Nothing to delete.');
          set((st) => ({ items: st.items.filter((i) => !doomed.has(i.id)), requests: st.requests.filter((r) => !doomed.has(r.itemId)) }));
          return ok({ purged: n }, n === 1 ? 'Deleted forever' : `${n} items deleted forever`);
        },

        emptyTrash() {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const mine = s.ctx.items.filter((i) => i.trashed && trashedRoot(s.ctx, i)?.id === i.id);
          const purgeable: string[] = [];
          let kept = 0;
          for (const i of mine) {
            const a = effectiveAccess(s.ctx, s.viewer, i);
            if (!atLeast(a.level, 'editor')) continue;
            const c = capsOf(s.ctx, a);
            if (c.purge && !descendants(s.ctx, i).some((d) => d.hold)) purgeable.push(i.id);
            else kept++;
          }
          if (!purgeable.length) return kept ? fail(`Nothing you can delete — ${kept} item${kept > 1 ? 's need' : ' needs'} a manager or ${kept > 1 ? 'are' : 'is'} on hold.`) : fail('Trash is already empty.');
          const r = get().purge(purgeable);
          if (!r.ok) return r;
          return ok({ purged: r.purged, kept }, `Trash emptied · ${r.purged} deleted${kept ? ` · ${kept} kept (need a manager)` : ''}`);
        },

        setStar(ids, on) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const allowed = new Set(ids.filter((id) => {
            const it = s.ctx.item.get(id);
            return it ? effectiveAccess(s.ctx, s.viewer, it).level !== 'none' : false;
          }));
          if (!allowed.size) return fail('You don’t have access to that item.');
          patchItems((i) => (allowed.has(i.id) ? { ...i, starredBy: on ? [...new Set([...i.starredBy, s.user.id])] : i.starredBy.filter((x) => x !== s.user.id) } : i));
          return ok({}, on ? (allowed.size === 1 ? 'Starred' : `Starred ${allowed.size} items`) : 'Removed from Starred');
        },

        setLabel(ids, label, justification = '') {
          const s = session();
          if (!s) return fail('You are not signed in.');
          let changed = 0;
          for (const id of ids) {
            const g = guard(s, id, 'label', 'drive.label.change');
            if ('error' in g) return fail(g.error);
            if (g.item.label === label) continue;
            const chk = checkLabelChange(g.item.label, label, justification);
            if (!chk.ok) return fail(`${chk.reason} ${chk.fix}`);
            const down = LABEL_RANK[label] < LABEL_RANK[g.item.label];
            const from = g.item.label;
            patchItem(id, (i) => withActivity(touch({ ...i, label }, s.user.id), activity(s.user.id, 'labelled', `${LABEL_NAME[from]} → ${LABEL_NAME[label]}${down ? ` · “${justification.trim()}”` : ''}`)));
            audit(down ? 'drive.label.downgrade' : 'drive.label.change', g.item.name, `${LABEL_NAME[from]} → ${LABEL_NAME[label]}${down ? ` · Justification: ${justification.trim()}` : ''}`, down ? 'warning' : 'info');
            changed++;
          }
          return ok({ changed }, changed ? `Label set to ${LABEL_NAME[label]}${changed > 1 ? ` on ${changed} items` : ''}` : 'Label unchanged');
        },

        updateDetails(id, patch) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'edit', 'drive.item.details');
          if ('error' in g) return fail(g.error);
          const tags = patch.tags?.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean).slice(0, 12);
          patchItem(id, (i) => touch({ ...i, description: patch.description !== undefined ? patch.description.trim().slice(0, 600) : i.description, tags: tags ?? i.tags, color: patch.color ?? i.color }, s.user.id));
          return ok({}, 'Details saved');
        },

        share(id, entries, opts = {}) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'share', 'drive.share');
          if ('error' in g) return fail(g.error);
          if (!entries.length) return fail('Add at least one person or group.');
          for (const e of entries) {
            if (RANK[e.level] > RANK[g.access.level === 'owner' ? 'manager' : g.access.level]) return fail(`You can’t grant more than your own access (${LEVEL_LABEL[g.access.level]}).`);
            if (e.expiresAt !== null && e.expiresAt <= Date.now()) return fail('Expiry must be in the future.');
            if (e.principal.type === 'user') {
              const u = s.ctx.user.get(e.principal.id);
              if (!u || !u.active) return fail('That person isn’t active in the directory.');
              if (e.principal.id === g.item.ownerId) return fail(`${u.name} already owns this.`);
            }
            const chk = checkGrant(s.ctx, g.item, e.principal, e.expiresAt);
            if (!chk.ok) {
              audit('drive.share', g.item.name, `DLP blocked ${principalName(s.ctx, e.principal)}: ${chk.reason}`, 'warning', 'denied');
              return fail(`${chk.reason} ${chk.fix}`);
            }
          }
          let added = 0;
          let updated = 0;
          const now = Date.now();
          const nextShares = [...g.item.shares];
          for (const e of entries) {
            const idx = nextShares.findIndex((x) => samePrincipal(x.principal, e.principal));
            if (idx >= 0) {
              nextShares[idx] = { ...nextShares[idx], level: e.level, expiresAt: e.expiresAt, by: s.user.id, at: now };
              updated++;
            } else {
              nextShares.push({ id: uid('sh'), principal: e.principal, level: e.level, by: s.user.id, at: now, expiresAt: e.expiresAt });
              added++;
            }
          }
          const summary = entries.map((e) => `${principalName(s.ctx, e.principal)} (${e.level}${e.expiresAt ? `, until ${new Date(e.expiresAt).toLocaleDateString()}` : ''})`).join(', ');
          patchItem(id, (i) => withActivity(touch({ ...i, shares: nextShares }, s.user.id), activity(s.user.id, 'shared', summary)));
          const wide = entries.some((e) => e.principal.type === 'org' || e.principal.type === 'dept' || e.principal.type === 'role');
          audit('drive.share', g.item.name, summary, LABEL_RANK[g.item.label] >= 2 || wide ? 'warning' : 'info');
          if (opts.notify !== false) {
            const userIds = entries.filter((e) => e.principal.type === 'user').map((e) => (e.principal as { id: string }).id);
            const noun = g.item.kind === 'folder' ? 'folder' : LABEL_NAME[g.item.label].toLowerCase() + ' file';
            notify(userIds, { kind: 'access', title: `${s.user.name.split(' ')[0]} shared “${g.item.name}” with you`, body: opts.message?.trim() ? `“${opts.message.trim().slice(0, 140)}”` : `You can now open this ${noun}.`, link: itemRoute(g.item) }, s.user.id);
          }
          return ok({ added, updated }, added + updated === 1 ? `Shared with ${principalName(s.ctx, entries[0].principal)}` : `Shared with ${added + updated} people & groups`);
        },

        updateShare(hostId, shareId, patch) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const drive = s.ctx.drive.get(hostId);
          if (drive) {
            const sh = drive.members.find((m) => m.id === shareId);
            if (!sh) return fail('That member no longer exists.');
            return get().setDriveMember(hostId, sh.principal, patch.level ?? sh.level, patch.expiresAt !== undefined ? patch.expiresAt : sh.expiresAt);
          }
          const g = guard(s, hostId, 'share', 'drive.share.update');
          if ('error' in g) return fail(g.error);
          const sh = g.item.shares.find((x) => x.id === shareId);
          if (!sh) return fail('That share no longer exists.');
          const level = patch.level ?? sh.level;
          const expiresAt = patch.expiresAt !== undefined ? patch.expiresAt : sh.expiresAt;
          if (RANK[level] > RANK[g.access.level === 'owner' ? 'manager' : g.access.level]) return fail('You can’t grant more than your own access.');
          const chk = checkGrant(s.ctx, g.item, sh.principal, expiresAt);
          if (!chk.ok) return fail(`${chk.reason} ${chk.fix}`);
          patchItem(hostId, (i) => withActivity({ ...i, shares: i.shares.map((x) => (x.id === shareId ? { ...x, level, expiresAt } : x)) }, activity(s.user.id, 'shared', `${principalName(s.ctx, sh.principal)} → ${level}${expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : ''}`)));
          audit('drive.share.update', g.item.name, `${principalName(s.ctx, sh.principal)} → ${level}`, LABEL_RANK[g.item.label] >= 2 ? 'warning' : 'info');
          return ok({}, 'Access updated');
        },

        removeShare(hostId, shareId) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const drive = s.ctx.drive.get(hostId);
          if (drive) {
            const sh = drive.members.find((m) => m.id === shareId);
            if (!sh) return fail('That member no longer exists.');
            return get().setDriveMember(hostId, sh.principal, null);
          }
          const g = guard(s, hostId, 'share', 'drive.share.remove');
          if ('error' in g) return fail(g.error);
          const sh = g.item.shares.find((x) => x.id === shareId);
          if (!sh) return fail('That share no longer exists.');
          patchItem(hostId, (i) => withActivity(touch({ ...i, shares: i.shares.filter((x) => x.id !== shareId) }, s.user.id), activity(s.user.id, 'unshared', principalName(s.ctx, sh.principal))));
          audit('drive.share.remove', g.item.name, principalName(s.ctx, sh.principal), 'info');
          return ok({}, `Removed ${principalName(s.ctx, sh.principal)}`);
        },

        setLink(id, link) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'share', 'drive.link');
          if ('error' in g) return fail(g.error);
          const chk = checkLink(s.ctx, g.item, link.scope);
          if (!chk.ok) {
            audit('drive.link', g.item.name, `DLP blocked ${link.scope} link`, 'warning', 'denied');
            return fail(`${chk.reason} ${chk.fix}`);
          }
          const opened = link.scope !== 'restricted' && (g.item.link.scope !== link.scope || !g.item.link.at);
          patchItem(id, (i) =>
            withActivity(
              touch({ ...i, link: { scope: link.scope, level: link.level, by: s.user.id, at: opened ? Date.now() : i.link.at } }, s.user.id),
              activity(s.user.id, 'link', link.scope === 'restricted' ? 'Link restricted to people with access' : `${link.scope === 'anyone' ? 'Anyone with the link' : 'Anyone at Helix with the link'} can ${link.level === 'viewer' ? 'view' : link.level === 'commenter' ? 'comment' : 'edit'}`),
            ),
          );
          audit('drive.link', g.item.name, `${link.scope} · ${link.level}`, link.scope === 'anyone' ? 'warning' : 'info');
          return ok({}, link.scope === 'restricted' ? 'Link restricted' : 'Link settings updated');
        },

        setInherit(id, inherit) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'share', 'drive.inheritance');
          if ('error' in g) return fail(g.error);
          if (g.item.inherit === inherit) return ok({});
          if (!inherit) {
            const after = buildCtx({ ...get(), items: get().items.map((i) => (i.id === id ? { ...i, inherit } : i)) }, s.ctx.users, s.ctx.roles);
            const mine = effectiveAccess(after, s.viewer, after.item.get(id) as Item);
            if (!atLeast(mine.level, 'manager')) return fail('You’d lose access yourself. Add yourself as a manager on this item first, or ask a drive manager.');
          }
          patchItem(id, (i) => withActivity(touch({ ...i, inherit }, s.user.id), activity(s.user.id, 'inheritance', inherit ? 'Inherited access restored' : 'Inherited access restricted')));
          audit('drive.inheritance', g.item.name, inherit ? 'Inheritance restored' : 'Inheritance restricted', 'warning');
          return ok({}, inherit ? 'Inherited access restored' : 'Inherited access restricted — only direct shares and drive managers remain');
        },

        saveContent(id, content, summary) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'edit', 'drive.item.edit');
          if ('error' in g) return fail(g.error);
          const size = contentBytes(content);
          const n = (g.item.versions[g.item.versions.length - 1]?.n ?? 0) + 1;
          const note = summary?.trim().slice(0, 120) || 'Edited';
          patchItem(id, (i) =>
            withActivity(
              touch({ ...i, content, size, versions: [...i.versions, { id: uid('v'), n, at: Date.now(), by: s.user.id, size, summary: note, content }] }, s.user.id),
              activity(s.user.id, 'version', `v${n} · ${note}`),
            ),
          );
          if (g.item.ownerId !== s.user.id) notify([g.item.ownerId], { kind: 'work', title: `${s.user.name.split(' ')[0]} edited “${g.item.name}”`, body: `v${n} · ${note}`, link: itemRoute(g.item) });
          return ok({ version: n }, `Saved as version ${n}`);
        },

        restoreVersion(id, versionId) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'edit', 'drive.version.restore');
          if ('error' in g) return fail(g.error);
          const v = g.item.versions.find((x) => x.id === versionId);
          if (!v) return fail('That version no longer exists.');
          if (!v.content) return fail('This version has no stored snapshot to restore.');
          const n = (g.item.versions[g.item.versions.length - 1]?.n ?? 0) + 1;
          const content = v.content;
          patchItem(id, (i) =>
            withActivity(
              touch({ ...i, content, size: v.size, versions: [...i.versions, { id: uid('v'), n, at: Date.now(), by: s.user.id, size: v.size, summary: `Restored v${v.n}`, content }] }, s.user.id),
              activity(s.user.id, 'version', `v${n} · Restored v${v.n}`),
            ),
          );
          audit('drive.version.restore', g.item.name, `Restored v${v.n} as v${n}`, 'info');
          return ok({ version: n }, `Restored v${v.n} — saved as version ${n}`);
        },

        addThread(id, text, quote) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'comment', 'drive.comment');
          if ('error' in g) return fail(g.error);
          const clean = text.trim().slice(0, 2000);
          if (clean.length < 2) return fail('Write a little more.');
          const threadId = uid('t');
          const mentioned = parseMentions(clean, s.ctx.users).filter((x) => x !== s.user.id);
          const noAccess = mentioned.filter((m) => {
            const v = s.ctx.viewers.find((x) => x.id === m);
            return !v || effectiveAccess(s.ctx, v, g.item).level === 'none';
          });
          patchItem(id, (i) => withActivity({ ...i, threads: [...i.threads, { id: threadId, by: s.user.id, at: Date.now(), text: clean, quote: quote?.slice(0, 160), replies: [], resolved: null }] }, activity(s.user.id, 'commented', clean.slice(0, 80))));
          const link = `${itemRoute(g.item)}?comment=${threadId}`;
          notify(mentioned, { kind: 'work', title: `${s.user.name.split(' ')[0]} mentioned you in “${g.item.name}”`, body: clean.slice(0, 140), link }, s.user.id);
          if (!mentioned.includes(g.item.ownerId)) notify([g.item.ownerId], { kind: 'work', title: `New comment on “${g.item.name}”`, body: `${s.user.name}: ${clean.slice(0, 120)}`, link }, s.user.id);
          return ok({ threadId, mentioned, noAccess }, 'Comment added');
        },

        reply(id, threadId, text) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'comment', 'drive.comment');
          if ('error' in g) return fail(g.error);
          const t = g.item.threads.find((x) => x.id === threadId);
          if (!t) return fail('That thread no longer exists.');
          const clean = text.trim().slice(0, 2000);
          if (clean.length < 1) return fail('Write a reply first.');
          const mentioned = parseMentions(clean, s.ctx.users).filter((x) => x !== s.user.id);
          const noAccess = mentioned.filter((m) => {
            const v = s.ctx.viewers.find((x) => x.id === m);
            return !v || effectiveAccess(s.ctx, v, g.item).level === 'none';
          });
          patchItem(id, (i) => withActivity({ ...i, threads: i.threads.map((x) => (x.id === threadId ? { ...x, resolved: null, replies: [...x.replies, { id: uid('c'), by: s.user.id, at: Date.now(), text: clean }] } : x)) }, activity(s.user.id, 'commented', clean.slice(0, 80))));
          const link = `${itemRoute(g.item)}?comment=${threadId}`;
          const participants = [t.by, ...t.replies.map((r) => r.by)];
          notify(mentioned, { kind: 'work', title: `${s.user.name.split(' ')[0]} mentioned you in “${g.item.name}”`, body: clean.slice(0, 140), link }, s.user.id);
          notify(participants.filter((p) => !mentioned.includes(p)), { kind: 'work', title: `${s.user.name.split(' ')[0]} replied in “${g.item.name}”`, body: clean.slice(0, 140), link }, s.user.id);
          return ok({ mentioned, noAccess }, 'Reply posted');
        },

        resolveThread(id, threadId, resolved) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const g = guard(s, id, 'comment', 'drive.comment.resolve');
          if ('error' in g) return fail(g.error);
          patchItem(id, (i) => ({ ...i, threads: i.threads.map((x) => (x.id === threadId ? { ...x, resolved: resolved ? { by: s.user.id, at: Date.now() } : null } : x)) }));
          return ok({}, resolved ? 'Thread resolved' : 'Thread reopened');
        },

        requestAccess(id, level, reason) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const item = s.ctx.item.get(id);
          if (!item) return fail('That file doesn’t exist (or was deleted).');
          const a = effectiveAccess(s.ctx, s.viewer, item);
          if (RANK[a.level] >= RANK[level]) return fail(`You already have ${LEVEL_LABEL[a.level].toLowerCase()} access.`);
          const clean = reason.trim();
          if (clean.length < 5) return fail('Add a short reason so the owner knows why you need it.');
          const chk = checkGrant(s.ctx, item, { type: 'user', id: s.user.id }, s.ctx.policy.rules[item.label].maxShareDays ? Date.now() + DAY : null);
          if (!chk.ok) return fail(`${chk.reason} ${chk.fix}`);
          const existing = get().requests.find((r) => r.itemId === id && r.requesterId === s.user.id && r.status === 'pending');
          const req: AccessRequest = existing ? { ...existing, level, reason: clean, at: Date.now() } : { id: uid('dr'), itemId: id, requesterId: s.user.id, level, reason: clean, at: Date.now(), status: 'pending' };
          set((st) => ({ requests: existing ? st.requests.map((r) => (r.id === existing.id ? req : r)) : [req, ...st.requests] }));
          notify(approversOf(s.ctx, item), { kind: 'request', title: `${s.user.name} requests ${level} access`, body: `“${item.name}” — ${clean.slice(0, 120)}`, link: `/drive/file/${id}` }, s.user.id);
          audit('drive.access.request', item.name, `${level} · ${clean.slice(0, 80)}`, 'info');
          return ok({ requestId: req.id }, existing ? 'Request updated' : 'Request sent — we’ll notify you when it’s decided');
        },

        cancelRequest(requestId) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const r = get().requests.find((x) => x.id === requestId);
          if (!r) return fail('That request no longer exists.');
          if (r.requesterId !== s.user.id) return fail('Only the requester can cancel this.');
          if (r.status !== 'pending') return fail('This request was already decided.');
          set((st) => ({ requests: st.requests.map((x) => (x.id === requestId ? { ...x, status: 'cancelled', decidedAt: Date.now(), decidedBy: s.user.id } : x)) }));
          return ok({}, 'Request cancelled');
        },

        decideRequest(requestId, decision, opts = {}) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const r = get().requests.find((x) => x.id === requestId);
          if (!r) return fail('That request no longer exists.');
          if (r.status !== 'pending') return fail('This request was already decided.');
          const g = guard(s, r.itemId, 'share', 'drive.access.decide');
          if ('error' in g) return fail(g.error);
          const requester = s.ctx.user.get(r.requesterId);
          if (decision === 'deny') {
            set((st) => ({ requests: st.requests.map((x) => (x.id === requestId ? { ...x, status: 'denied', decidedBy: s.user.id, decidedAt: Date.now(), note: opts.note?.trim() || undefined } : x)) }));
            patchItem(g.item.id, (i) => withActivity(i, activity(s.user.id, 'denied', `${requester?.name ?? 'Someone'} · ${r.level}`)));
            notify([r.requesterId], { kind: 'access', title: `Access request declined: “${g.item.name}”`, body: opts.note?.trim() ? `${s.user.name.split(' ')[0]}: ${opts.note.trim().slice(0, 140)}` : `${s.user.name} declined your request.`, link: `/drive/file/${g.item.id}` });
            audit('drive.access.deny', g.item.name, `${requester?.name ?? r.requesterId} · ${r.level}`, 'info');
            return ok({}, 'Request declined');
          }
          const level = opts.level ?? r.level;
          const expiresAt = opts.expiresAt === undefined ? null : opts.expiresAt;
          const res = get().share(g.item.id, [{ principal: { type: 'user', id: r.requesterId }, level, expiresAt }], { notify: false });
          if (!res.ok) return res;
          set((st) => ({ requests: st.requests.map((x) => (x.id === requestId ? { ...x, status: 'approved', decidedBy: s.user.id, decidedAt: Date.now(), grantedLevel: level, expiresAt, note: opts.note?.trim() || undefined } : x)) }));
          patchItem(g.item.id, (i) => withActivity(i, activity(s.user.id, 'approved', `${requester?.name ?? 'Someone'} · ${level}${expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : ''}`)));
          notify([r.requesterId], { kind: 'access', title: `Access granted: “${g.item.name}”`, body: `${s.user.name.split(' ')[0]} gave you ${level} access${expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : ''}.`, link: itemRoute(g.item) });
          audit('drive.access.approve', g.item.name, `${requester?.name ?? r.requesterId} · ${level}${expiresAt ? ` · expires ${new Date(expiresAt).toISOString().slice(0, 10)}` : ''}`, LABEL_RANK[g.item.label] >= 2 ? 'warning' : 'info');
          return ok({}, `Approved — ${requester?.name.split(' ')[0] ?? 'they'} can ${level === 'viewer' ? 'view' : level === 'commenter' ? 'comment' : 'edit'} now`);
        },

        download(ids) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          let count = 0;
          let bytes = 0;
          for (const id of ids) {
            const g = guard(s, id, 'view', 'drive.download');
            if ('error' in g) return fail(g.error);
            const files = g.item.kind === 'folder' ? descendants(s.ctx, g.item).filter((d) => d.kind !== 'folder' && !d.trashed) : [g.item];
            for (const f of files) {
              const a = effectiveAccess(s.ctx, s.viewer, f);
              if (!capsOf(s.ctx, a).download) {
                audit('drive.download', f.name, `${LABEL_NAME[f.label]} label blocks download`, 'warning', 'denied');
                return fail(`“${f.name}” is ${LABEL_NAME[f.label]} — downloads are blocked by policy.`);
              }
              count++;
              bytes += f.size;
              if (LABEL_RANK[f.label] >= 2) audit('drive.download', f.name, LABEL_NAME[f.label], 'info');
            }
            patchItem(id, (i) => withActivity(i, activity(s.user.id, 'downloaded')));
          }
          return ok({ count, bytes }, count === 1 ? 'Download ready' : `Preparing ${count} files (${formatBytes(bytes)})`);
        },

        /* ---------- governance ---------- */
        setRule(label, patch) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          if (!isAdmin(s)) {
            audit('drive.policy', LABEL_NAME[label], 'Missing drive.manage', 'warning', 'denied');
            return fail('Only Drive governance admins can change DLP rules.');
          }
          const next = { ...s.ctx.policy.rules[label], ...patch };
          if (next.maxShareDays !== null) next.maxShareDays = clamp(Math.round(next.maxShareDays), 1, 365);
          set((st) => ({ policy: { ...st.policy, rules: { ...st.policy.rules, [label]: next } } }));
          audit('drive.policy', `${LABEL_NAME[label]} rules`, Object.entries(patch).map(([k, v]) => `${k}=${String(v)}`).join(', '), 'warning');
          return ok({}, `${LABEL_NAME[label]} rules updated`);
        },

        setRetention(days) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          if (!isAdmin(s)) return fail('Only Drive governance admins can change retention.');
          const d = clamp(Math.round(days), 7, 90);
          set((st) => ({ policy: { ...st.policy, trashDays: d } }));
          audit('drive.retention', 'Trash retention', `${d} days`, 'warning');
          return ok({}, `Trash retention set to ${d} days`);
        },

        setHold(target, on, reason = '') {
          const s = session();
          if (!s) return fail('You are not signed in.');
          if (!isAdmin(s)) {
            audit('drive.hold', target.itemId ?? target.driveId ?? '?', 'Missing drive.manage', 'warning', 'denied');
            return fail('Only Drive governance admins can set legal holds.');
          }
          if (on && reason.trim().length < 5) return fail('Add a reason (case number or matter) for the hold.');
          const hold = on ? { by: s.user.id, at: Date.now(), reason: reason.trim() } : null;
          if (target.driveId) {
            const d = s.ctx.drive.get(target.driveId);
            if (!d) return fail('That drive doesn’t exist.');
            set((st) => ({ drives: st.drives.map((x) => (x.id === d.id ? { ...x, hold } : x)) }));
            audit(on ? 'drive.hold.set' : 'drive.hold.release', d.name, on ? reason.trim() : undefined, 'critical');
            return ok({}, on ? `Legal hold placed on ${d.name}` : `Hold released on ${d.name}`);
          }
          const it = target.itemId ? s.ctx.item.get(target.itemId) : undefined;
          if (!it) return fail('That folder doesn’t exist.');
          patchItem(it.id, (i) => withActivity({ ...i, hold }, activity(s.user.id, 'labelled', on ? `Legal hold: ${reason.trim()}` : 'Legal hold released')));
          audit(on ? 'drive.hold.set' : 'drive.hold.release', it.name, on ? reason.trim() : undefined, 'critical');
          return ok({}, on ? `Legal hold placed on “${it.name}”` : `Hold released on “${it.name}”`);
        },

        createDrive(input) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          if (!isAdmin(s)) return fail('Only Drive governance admins can create shared drives.');
          const name = input.name.trim().slice(0, 60);
          if (name.length < 2) return fail('Give the drive a name.');
          if (get().drives.some((d) => d.kind === 'shared' && d.name.toLowerCase() === name.toLowerCase())) return fail(`A shared drive called “${name}” already exists.`);
          const now = Date.now();
          const members: Share[] = input.members.map((m) => ({ id: uid('sh'), principal: m.principal, level: m.level, by: s.user.id, at: now, expiresAt: m.expiresAt }));
          if (!members.some((m) => m.principal.type === 'user' && m.principal.id === s.user.id && m.level === 'manager')) members.push({ id: uid('sh'), principal: { type: 'user', id: s.user.id }, level: 'manager', by: s.user.id, at: now, expiresAt: null });
          const id = `drv-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 18)}-${Math.random().toString(36).slice(2, 5)}`;
          const drive: Drive = { id, kind: 'shared', name, description: input.description?.trim() ?? '', icon: input.icon, color: input.color, department: input.department, members, defaultLabel: input.defaultLabel, quota: 512 * 1024 ** 3, createdAt: now, createdBy: s.user.id, hold: null };
          set((st) => ({ drives: [...st.drives, drive] }));
          audit('drive.create', name, `${members.length} members · default ${LABEL_NAME[input.defaultLabel]}`, 'warning');
          const userIds = members.filter((m) => m.principal.type === 'user').map((m) => (m.principal as { id: string }).id);
          notify(userIds, { kind: 'access', title: `You were added to the shared drive “${name}”`, link: `/drive/d/${id}` }, s.user.id);
          return ok({ id }, `Shared drive “${name}” created`);
        },

        updateDrive(id, patch) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const d = s.ctx.drive.get(id);
          if (!d || d.kind !== 'shared') return fail('That shared drive doesn’t exist.');
          if (!atLeast(driveAccess(s.ctx, s.viewer, d), 'manager')) return fail('Only drive managers can edit this drive.');
          const name = patch.name?.trim();
          if (name !== undefined && name.length < 2) return fail('Give the drive a name.');
          set((st) => ({ drives: st.drives.map((x) => (x.id === id ? { ...x, ...patch, name: name ?? x.name } : x)) }));
          audit('drive.update', d.name, Object.keys(patch).join(', '), 'info');
          return ok({}, 'Drive updated');
        },

        setDriveMember(driveId, principal, level, expiresAt = null) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          const d = s.ctx.drive.get(driveId);
          if (!d || d.kind !== 'shared') return fail('That shared drive doesn’t exist.');
          if (!atLeast(driveAccess(s.ctx, s.viewer, d), 'manager')) {
            audit('drive.members', d.name, 'Not a drive manager', 'warning', 'denied');
            return fail('Only drive managers can change members.');
          }
          const existing = d.members.find((m) => samePrincipal(m.principal, principal));
          if (level === null) {
            if (!existing) return ok({});
            const managersLeft = d.members.filter((m) => m.level === 'manager' && m.id !== existing.id && m.principal.type === 'user');
            if (existing.level === 'manager' && !managersLeft.length) return fail('A shared drive needs at least one named manager.');
            set((st) => ({ drives: st.drives.map((x) => (x.id === driveId ? { ...x, members: x.members.filter((m) => m.id !== existing.id) } : x)) }));
            audit('drive.members', d.name, `Removed ${principalName(s.ctx, principal)}`, 'warning');
            return ok({}, `Removed ${principalName(s.ctx, principal)}`);
          }
          if (principal.type === 'user' && !s.ctx.user.get(principal.id)?.active) return fail('That person isn’t active in the directory.');
          const now = Date.now();
          const members = existing
            ? d.members.map((m) => (m.id === existing.id ? { ...m, level, expiresAt, by: s.user.id, at: now } : m))
            : [...d.members, { id: uid('sh'), principal, level, by: s.user.id, at: now, expiresAt }];
          set((st) => ({ drives: st.drives.map((x) => (x.id === driveId ? { ...x, members } : x)) }));
          audit('drive.members', d.name, `${principalName(s.ctx, principal)} → ${level}`, principal.type === 'org' ? 'warning' : 'info');
          if (!existing && principal.type === 'user') notify([principal.id], { kind: 'access', title: `You were added to “${d.name}”`, body: `${s.user.name} made you ${level === 'manager' ? 'a manager' : `an ${level}`}.`, link: `/drive/d/${driveId}` }, s.user.id);
          const covered = principalMembers(s.ctx, principal).length;
          return ok({}, existing ? 'Member updated' : `Added ${principalName(s.ctx, principal)}${principal.type !== 'user' ? ` (${covered} people)` : ''}`);
        },

        fixFinding(fix) {
          const s = session();
          if (!s) return fail('You are not signed in.');
          if (!isAdmin(s)) {
            audit('drive.governance.fix', fix.type, 'Missing drive.manage', 'warning', 'denied');
            return fail('Only Drive governance admins can apply fixes.');
          }
          const label = (id: string) => s.ctx.item.get(id)?.name ?? s.ctx.drive.get(id)?.name ?? id;
          switch (fix.type) {
            case 'remove-share':
              if (fix.hostKind === 'drive') set((st) => ({ drives: st.drives.map((d) => (d.id === fix.hostId ? { ...d, members: d.members.filter((m) => m.id !== fix.shareId) } : d)) }));
              else patchItem(fix.hostId, (i) => withActivity({ ...i, shares: i.shares.filter((x) => x.id !== fix.shareId) }, activity(s.user.id, 'unshared', 'Governance fix')));
              break;
            case 'disable-link':
              patchItem(fix.itemId, (i) => withActivity({ ...i, link: { scope: 'restricted', level: 'viewer', by: s.user.id, at: Date.now() } }, activity(s.user.id, 'link', 'Link restricted by governance')));
              break;
            case 'purge-expired':
              patchItem(fix.itemId, (i) => withActivity({ ...i, shares: i.shares.filter((x) => x.expiresAt === null || x.expiresAt > Date.now()) }, activity(s.user.id, 'unshared', 'Expired grants cleaned up')));
              break;
            case 'clamp-expiry': {
              const until = Date.now() + fix.days * DAY;
              const ids = new Set(fix.shareIds);
              patchItem(fix.itemId, (i) => withActivity({ ...i, shares: i.shares.map((x) => (ids.has(x.id) ? { ...x, expiresAt: x.expiresAt === null ? until : Math.min(x.expiresAt, until) } : x)) }, activity(s.user.id, 'shared', `Expiry capped at ${fix.days} days`)));
              break;
            }
            case 'move-out':
              fixMove(s.ctx, fix.itemId, fix.toParentId);
              break;
          }
          audit('drive.governance.fix', label('itemId' in fix ? fix.itemId : fix.hostId), fix.type, 'warning');
          return ok({}, 'Fixed');
        },
      };
    },
    {
      name: 'nexus-drive-v2',
      version: DRIVE_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): DriveData => ({ version: s.version, drives: s.drives, items: s.items, requests: s.requests, policy: s.policy, recents: s.recents, prefs: s.prefs }),
      migrate: () => createDriveSeed() as unknown as DriveStore,
    },
  ),
);
