/**
 * Helix Drive permission engine — pure functions, no React, no store.
 *
 *   effectiveAccess(ctx, viewer, item) → level + every path that grants (or would grant) access,
 *   each with a human reason: "Editor — via Engineering role on shared drive Engineering".
 *
 * Paths: owner · personal-drive owner · governance admin · item shares · folder shares (cascade)
 *        · drive membership · link settings.
 * A path is inactive when it is `cut` (inheritance restricted below it), `expired`, or `blocked`
 * by the item's sensitivity label (DLP rules).
 */
import type { Department, Role, User } from '@/types';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import type { AccessLevel, Drive, Hold, Item, LabelRule, Level, LinkScope, Policy, Principal, Sensitivity, Share } from './types';
import { DAY, HOUR, LABEL_NAME, LABEL_RANK, LEVEL_LABEL, RANK, atLeast } from './meta';

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface Viewer {
  id: string;
  name: string;
  roleIds: string[];
  department?: Department;
  /** Holds `drive.manage`. */
  admin: boolean;
  contractor: boolean;
  active: boolean;
  /** A role preview ("View as: Contractor"), not a real person. */
  synthetic?: boolean;
}

export interface EngineCtx {
  drives: Drive[];
  items: Item[];
  item: Map<string, Item>;
  drive: Map<string, Drive>;
  children: Map<string, Item[]>;
  users: User[];
  user: Map<string, User>;
  viewers: Viewer[];
  roles: Role[];
  policy: Policy;
  now: number;
}

export const childKey = (driveId: string, parentId: string | null) => parentId ?? `root:${driveId}`;

export function viewerOf(user: User, roles: Role[], perms?: ReadonlySet<string>): Viewer {
  const p = perms ?? effectivePermissions(user, roles);
  return {
    id: user.id,
    name: user.name,
    roleIds: user.roleIds,
    department: user.department,
    admin: hasPermission(p, 'drive.manage'),
    contractor: user.roleIds.includes('contractor'),
    active: user.active,
  };
}

/** A synthetic viewer holding just one hub role (for "View as… a role"). */
export function roleViewer(roleId: string, roles: Role[]): Viewer {
  const role = roles.find((r) => r.id === roleId);
  return {
    id: `role:${roleId}`,
    name: role ? `Any ${role.name}` : roleId,
    roleIds: [roleId],
    admin: role ? hasPermission(new Set(role.permissions), 'drive.manage') : false,
    contractor: roleId === 'contractor',
    active: true,
    synthetic: true,
  };
}

export function buildCtx(data: { drives: Drive[]; items: Item[]; policy: Policy }, users: User[], roles: Role[], now = Date.now()): EngineCtx {
  const item = new Map(data.items.map((i) => [i.id, i]));
  const drive = new Map(data.drives.map((d) => [d.id, d]));
  const children = new Map<string, Item[]>();
  for (const i of data.items) {
    const k = childKey(i.driveId, i.parentId);
    const arr = children.get(k);
    if (arr) arr.push(i);
    else children.set(k, [i]);
  }
  return {
    drives: data.drives,
    items: data.items,
    item,
    drive,
    children,
    users,
    user: new Map(users.map((u) => [u.id, u])),
    viewers: users.filter((u) => u.active).map((u) => viewerOf(u, roles)),
    roles,
    policy: data.policy,
    now,
  };
}

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

/** Parent first, up to the top-level folder. */
export function ancestors(ctx: EngineCtx, item: Item): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>([item.id]);
  let p = item.parentId ? ctx.item.get(item.parentId) : undefined;
  while (p && !seen.has(p.id)) {
    out.push(p);
    seen.add(p.id);
    p = p.parentId ? ctx.item.get(p.parentId) : undefined;
  }
  return out;
}

export const chainOf = (ctx: EngineCtx, item: Item) => [item, ...ancestors(ctx, item)];

/** Top-most trashed node in the chain (the item itself or an ancestor). */
export function trashedRoot(ctx: EngineCtx, item: Item): Item | null {
  let found: Item | null = null;
  for (const n of chainOf(ctx, item)) if (n.trashed) found = n;
  return found;
}
export const isTrashed = (ctx: EngineCtx, item: Item) => trashedRoot(ctx, item) !== null;

export function childrenOf(ctx: EngineCtx, driveId: string, parentId: string | null, includeTrashed = false): Item[] {
  const list = ctx.children.get(childKey(driveId, parentId)) ?? [];
  return includeTrashed ? list : list.filter((i) => !i.trashed);
}

export function descendants(ctx: EngineCtx, item: Item): Item[] {
  const out: Item[] = [];
  const stack = [...(ctx.children.get(item.id) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop() as Item;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    stack.push(...(ctx.children.get(n.id) ?? []));
  }
  return out;
}

/** Is `maybeAncestor` the item itself or one of its ancestors? */
export const isWithin = (ctx: EngineCtx, item: Item, maybeAncestorId: string) => chainOf(ctx, item).some((n) => n.id === maybeAncestorId);

export function folderSize(ctx: EngineCtx, item: Item): number {
  if (item.kind !== 'folder') return item.size;
  return descendants(ctx, item).reduce((s, d) => s + (d.kind === 'folder' || d.trashed ? 0 : d.size), 0);
}

export function driveUsage(ctx: EngineCtx, driveId: string): number {
  return ctx.items.reduce((s, i) => s + (i.driveId === driveId && i.kind !== 'folder' ? i.size : 0), 0);
}

/** "My Drive" for the owner, "Mei's drive" for everyone else. */
export function driveLabel(ctx: EngineCtx, drive: Drive | undefined, viewerId?: string): string {
  if (!drive) return 'Unknown drive';
  if (drive.kind === 'shared') return drive.name;
  if (drive.ownerId === viewerId) return 'My Drive';
  const owner = drive.ownerId ? ctx.user.get(drive.ownerId) : undefined;
  return owner ? `${owner.name.split(' ')[0]}’s drive` : 'Personal drive';
}

/** "Engineering / Prism frontend kit" */
export function locationOf(ctx: EngineCtx, item: Item, viewerId?: string): string {
  const parts = [driveLabel(ctx, ctx.drive.get(item.driveId), viewerId), ...ancestors(ctx, item).reverse().map((a) => a.name)];
  return parts.join(' / ');
}

/** Legal hold on the item, an ancestor folder, or its drive. */
export function holdOf(ctx: EngineCtx, item: Item): { hold: Hold; where: string } | null {
  for (const n of chainOf(ctx, item)) if (n.hold) return { hold: n.hold, where: n.id === item.id ? `this ${item.kind === 'folder' ? 'folder' : 'file'}` : `folder ${n.name}` };
  const d = ctx.drive.get(item.driveId);
  if (d?.hold) return { hold: d.hold, where: `shared drive ${d.name}` };
  return null;
}

export function uniqueName(ctx: EngineCtx, driveId: string, parentId: string | null, name: string, exceptId?: string): string {
  const taken = new Set(childrenOf(ctx, driveId, parentId).filter((i) => i.id !== exceptId).map((i) => i.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(name);
  const base = m?.[1] ?? name;
  const ext = m?.[2] ?? '';
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

/* ------------------------------------------------------------------ */
/* Principals                                                          */
/* ------------------------------------------------------------------ */

export function principalMatches(p: Principal, v: Viewer): boolean {
  switch (p.type) {
    case 'user':
      return p.id === v.id;
    case 'role':
      return v.roleIds.includes(p.id);
    case 'dept':
      return !!v.department && v.department === p.id;
    case 'org':
      return true;
  }
}

export const principalKey = (p: Principal) => (p.type === 'org' ? 'org' : `${p.type}:${p.id}`);
export const samePrincipal = (a: Principal, b: Principal) => principalKey(a) === principalKey(b);

export function principalName(ctx: EngineCtx, p: Principal): string {
  switch (p.type) {
    case 'user':
      return ctx.user.get(p.id)?.name ?? 'Unknown person';
    case 'role':
      return `${ctx.roles.find((r) => r.id === p.id)?.name ?? p.id} role`;
    case 'dept':
      return `${p.id} department`;
    case 'org':
      return 'Everyone at Helix';
  }
}

/** Active people covered by a principal. */
export function principalMembers(ctx: EngineCtx, p: Principal): Viewer[] {
  return ctx.viewers.filter((v) => principalMatches(p, v));
}

/* ------------------------------------------------------------------ */
/* DLP                                                                 */
/* ------------------------------------------------------------------ */

/** Why the label blocks this path for this viewer (null = allowed). */
export function dlpBlock(rule: LabelRule, label: Sensitivity, target: { principal?: Principal; scope?: LinkScope }, v: Viewer | null): string | null {
  const L = LABEL_NAME[label];
  if (target.scope && target.scope !== 'restricted') {
    if (target.scope === 'anyone' && !rule.anyoneLink) return `${L} items can’t have public links`;
    if (target.scope === 'org' && !rule.orgLink) return `${L} items can’t be shared by link`;
    if (rule.namedOnly) return `${L} items only allow named people`;
  }
  if (target.principal) {
    if (rule.namedOnly && target.principal.type !== 'user') return `${L} items only allow named people`;
    if (target.principal.type === 'org' && !rule.orgWide) return `${L} items can’t be shared org-wide`;
  }
  if (v?.contractor && !rule.contractors) return `${L} items are off-limits to contractors`;
  return null;
}

export type Check = { ok: true } | { ok: false; reason: string; fix: string; clampDays?: number };

/** Can `principal` be granted access to `item` (with this expiry) under the DLP rules? */
export function checkGrant(ctx: EngineCtx, item: Item, principal: Principal, expiresAt: number | null, now = ctx.now): Check {
  const rule = ctx.policy.rules[item.label];
  const L = LABEL_NAME[item.label];
  if (rule.namedOnly && principal.type !== 'user') {
    const what = principal.type === 'org' ? 'everyone at Helix' : principal.type === 'role' ? 'a whole role' : 'a whole department';
    return { ok: false, reason: `${L} items can only be shared with named people.`, fix: `Pick specific people instead of ${what}.` };
  }
  if (principal.type === 'org' && !rule.orgWide)
    return { ok: false, reason: `${L} items can’t be shared with everyone at Helix.`, fix: 'Share with the people or teams who need it.' };
  if (!rule.contractors) {
    if (principal.type === 'role' && principal.id === 'contractor')
      return { ok: false, reason: `${L} items can’t be shared with contractors.`, fix: 'Share a redacted copy, or lower the label if the content allows it.' };
    if (principal.type === 'user' && ctx.user.get(principal.id)?.roleIds.includes('contractor')) {
      const name = ctx.user.get(principal.id)?.name.split(' ')[0] ?? 'This person';
      return { ok: false, reason: `${name} is a contractor — ${L} items are off-limits to contractors.`, fix: 'Share a redacted copy, or lower the label (needs a justification).' };
    }
  }
  if (rule.maxShareDays !== null) {
    const max = now + rule.maxShareDays * DAY;
    if (expiresAt === null || expiresAt > max + HOUR)
      return { ok: false, reason: `${L} shares must expire within ${rule.maxShareDays} days.`, fix: `Set an expiry of ${rule.maxShareDays} days or less.`, clampDays: rule.maxShareDays };
  }
  return { ok: true };
}

export function checkLink(ctx: EngineCtx, item: Item, scope: LinkScope): Check {
  if (scope === 'restricted') return { ok: true };
  const rule = ctx.policy.rules[item.label];
  const L = LABEL_NAME[item.label];
  if (scope === 'anyone' && !rule.anyoneLink)
    return {
      ok: false,
      reason: `${L} items can’t have public links.`,
      fix: rule.orgLink && !rule.namedOnly ? 'Use “Anyone at Helix” instead, or share with named people.' : 'Share with named people instead.',
    };
  if (rule.namedOnly || (scope === 'org' && !rule.orgLink)) return { ok: false, reason: `${L} items can’t be shared by link.`, fix: 'Share with named people instead.' };
  return { ok: true };
}

export function checkLabelChange(from: Sensitivity, to: Sensitivity, justification = ''): Check {
  if (LABEL_RANK[to] < LABEL_RANK[from] && justification.trim().length < 10)
    return { ok: false, reason: `Lowering a label from ${LABEL_NAME[from]} to ${LABEL_NAME[to]} needs a justification.`, fix: 'Explain why the content is less sensitive (10+ characters).' };
  return { ok: true };
}

export const isDowngrade = (from: Sensitivity, to: Sensitivity) => LABEL_RANK[to] < LABEL_RANK[from];

/* ------------------------------------------------------------------ */
/* Effective access                                                    */
/* ------------------------------------------------------------------ */

export type ReasonSource = 'owner' | 'personal' | 'admin' | 'item' | 'folder' | 'drive' | 'link';
export type PathStatus = 'active' | 'expired' | 'blocked' | 'cut';

export interface Reason {
  key: string;
  level: AccessLevel;
  source: ReasonSource;
  principal?: Principal;
  scope?: LinkScope;
  /** "you", "Engineering role", "Anyone at Helix with the link"… */
  via: string;
  /** "this file", "folder Prism frontend kit", drive name… */
  where: string;
  hostId: string;
  shareId?: string;
  expiresAt?: number | null;
  status: PathStatus;
  /** Block / cut explanation. */
  note?: string;
  /** Drive manager kept despite restricted inheritance. */
  keep?: boolean;
}

export interface Access {
  item: Item;
  level: AccessLevel;
  /** Active paths, strongest first. */
  reasons: Reason[];
  /** Paths that would apply but are expired / blocked / cut. */
  inactive: Reason[];
  primary: Reason | null;
  /** Has access through something other than a link (so it shows up in browse & search). */
  discoverable: boolean;
}

const SOURCE_ORDER: Record<ReasonSource, number> = { owner: 0, personal: 1, admin: 2, item: 3, folder: 4, drive: 5, link: 6 };
const byStrength = (a: Reason, b: Reason) => RANK[b.level] - RANK[a.level] || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];

const NONE = (item: Item): Access => ({ item, level: 'none', reasons: [], inactive: [], primary: null, discoverable: false });

export function effectiveAccess(ctx: EngineCtx, v: Viewer, item: Item): Access {
  if (!v.active) return NONE(item);
  const drive = ctx.drive.get(item.driveId);
  const rule = ctx.policy.rules[item.label];
  const noun = item.kind === 'folder' ? 'folder' : 'file';
  const active: Reason[] = [];
  const inactive: Reason[] = [];
  const add = (r: Reason) => (r.status === 'active' ? active : inactive).push(r);

  if (item.ownerId === v.id) add({ key: 'owner', level: 'owner', source: 'owner', via: 'you', where: `this ${noun}`, hostId: item.id, status: 'active' });
  if (drive?.kind === 'personal' && drive.ownerId === v.id && item.ownerId !== v.id)
    add({ key: 'personal', level: 'manager', source: 'personal', via: 'your personal drive', where: 'My Drive', hostId: drive.id, status: 'active' });
  if (v.admin && drive?.kind === 'shared') add({ key: 'admin', level: 'manager', source: 'admin', via: 'Drive governance', where: drive.name, hostId: drive.id, status: 'active' });

  let cutBy: Item | null = null;
  const chain = chainOf(ctx, item);
  chain.forEach((node, i) => {
    const source: ReasonSource = i === 0 ? 'item' : 'folder';
    const where = i === 0 ? `this ${noun}` : `folder ${node.name}`;
    for (const s of node.shares) {
      if (!principalMatches(s.principal, v)) continue;
      const block = dlpBlock(rule, item.label, { principal: s.principal }, v);
      const expired = s.expiresAt !== null && s.expiresAt <= ctx.now;
      add({
        key: `${node.id}:${s.id}`,
        level: s.level,
        source,
        principal: s.principal,
        via: s.principal.type === 'user' ? 'you' : principalName(ctx, s.principal),
        where,
        hostId: node.id,
        shareId: s.id,
        expiresAt: s.expiresAt,
        status: cutBy ? 'cut' : expired ? 'expired' : block ? 'blocked' : 'active',
        note: cutBy ? `Inherited access is restricted on ${cutBy.id === item.id ? `this ${noun}` : `folder ${cutBy.name}`}` : (block ?? undefined),
      });
    }
    if (node.link.scope !== 'restricted') {
      const block = dlpBlock(rule, item.label, { scope: node.link.scope }, v);
      add({
        key: `${node.id}:link`,
        level: node.link.level,
        source: 'link',
        scope: node.link.scope,
        via: node.link.scope === 'org' ? 'Anyone at Helix with the link' : 'Anyone with the link',
        where,
        hostId: node.id,
        status: cutBy ? 'cut' : block ? 'blocked' : 'active',
        note: cutBy ? `Inherited access is restricted on folder ${cutBy.name}` : (block ?? undefined),
      });
    }
    if (!node.inherit && !cutBy) cutBy = node;
  });

  if (drive) {
    for (const m of drive.members) {
      if (!principalMatches(m.principal, v)) continue;
      const cut = cutBy as Item | null;
      const keep = !!cut && m.level === 'manager';
      const block = dlpBlock(rule, item.label, { principal: m.principal }, v);
      const expired = m.expiresAt !== null && m.expiresAt <= ctx.now;
      add({
        key: `${drive.id}:${m.id}`,
        level: m.level,
        source: 'drive',
        principal: m.principal,
        via: m.principal.type === 'user' ? 'you' : principalName(ctx, m.principal),
        where: drive.name,
        hostId: drive.id,
        shareId: m.id,
        expiresAt: m.expiresAt,
        keep,
        status: cut && !keep ? 'cut' : expired ? 'expired' : block ? 'blocked' : 'active',
        note: cut && !keep ? `Inherited access is restricted on ${cut.id === item.id ? `this ${noun}` : `folder ${cut.name}`}` : (block ?? undefined),
      });
    }
  }

  active.sort(byStrength);
  inactive.sort(byStrength);
  const level = active[0]?.level ?? 'none';
  return { item, level, reasons: active, inactive, primary: active[0] ?? null, discoverable: active.some((r) => r.source !== 'link') };
}

/** "Editor — via Engineering role on shared drive Engineering" */
export function reasonText(r: Reason): string {
  const lvl = LEVEL_LABEL[r.level];
  switch (r.source) {
    case 'owner':
      return `${lvl} — ${r.via === 'you' ? 'you own' : `${r.via} owns`} ${r.where}`;
    case 'personal':
      return `${lvl} — it’s in your personal drive`;
    case 'admin':
      return `${lvl} — via Drive governance on shared drive ${r.where}`;
    case 'link':
      return `${lvl} — via link (${r.via.toLowerCase()})${r.where.startsWith('folder') ? ` on ${r.where}` : ''}`;
    default: {
      const where = r.source === 'drive' ? `shared drive ${r.where}` : r.where;
      if (r.via === 'you') return `${lvl} — shared with you on ${where}`;
      return `${lvl} — via ${r.via} on ${where}${r.keep ? ' (drive managers keep access)' : ''}`;
    }
  }
}

export function inactiveText(r: Reason, now = Date.now()): string {
  if (r.status === 'expired' && r.expiresAt) return `${reasonText(r)} — expired ${Math.max(0, Math.round((now - r.expiresAt) / DAY))}d ago`;
  if (r.status === 'blocked') return `${reasonText(r)} — blocked: ${r.note}`;
  if (r.status === 'cut') return `${reasonText(r)} — cut: ${r.note}`;
  return reasonText(r);
}

/** Why someone can't open an item (empty when they can). */
export function explainDenied(a: Access, now = Date.now()): string {
  if (a.level !== 'none') return '';
  const r = a.inactive[0];
  if (!r) return 'Not shared with them';
  if (r.status === 'blocked') return `Blocked by DLP — ${r.note}`;
  if (r.status === 'expired') return `Their ${LEVEL_LABEL[r.level].toLowerCase()} access expired ${r.expiresAt ? `${Math.max(0, Math.round((now - r.expiresAt) / DAY))}d ago` : ''}`.trim();
  return r.note ?? 'Inherited access is restricted';
}

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

export interface Caps {
  view: boolean;
  comment: boolean;
  edit: boolean;
  share: boolean;
  download: boolean;
  watermark: boolean;
  trash: boolean;
  purge: boolean;
  label: boolean;
  held: boolean;
}

export function capsOf(ctx: EngineCtx, a: Access): Caps {
  const { level, item } = a;
  const rule = ctx.policy.rules[item.label];
  const owner = level === 'owner';
  const view = atLeast(level, 'viewer');
  const held = holdOf(ctx, item) !== null;
  return {
    view,
    comment: atLeast(level, 'commenter'),
    edit: atLeast(level, 'editor'),
    share: atLeast(level, 'manager'),
    download: view && (rule.download || owner),
    watermark: view && rule.watermark && !owner,
    trash: atLeast(level, 'editor') && !held,
    purge: atLeast(level, 'manager') && !held,
    label: atLeast(level, 'manager'),
    held,
  };
}

/** Access to a drive root (for creating items at the root and showing the drive in Spaces). */
export function driveAccess(ctx: EngineCtx, v: Viewer, drive: Drive): AccessLevel {
  if (!v.active) return 'none';
  if (drive.kind === 'personal') return drive.ownerId === v.id ? 'owner' : 'none';
  let best: AccessLevel = v.admin ? 'manager' : 'none';
  for (const m of drive.members) {
    if (!principalMatches(m.principal, v)) continue;
    if (m.expiresAt !== null && m.expiresAt <= ctx.now) continue;
    if (RANK[m.level] > RANK[best]) best = m.level;
  }
  return best;
}

/** Level the viewer has where new things would be created. */
export function placeAccess(ctx: EngineCtx, v: Viewer, driveId: string, parentId: string | null): AccessLevel {
  if (parentId) {
    const p = ctx.item.get(parentId);
    return p ? effectiveAccess(ctx, v, p).level : 'none';
  }
  const d = ctx.drive.get(driveId);
  return d ? driveAccess(ctx, v, d) : 'none';
}

/** Label a new item gets: the stricter of the drive default and the parent folder's label. */
export function defaultLabelFor(ctx: EngineCtx, driveId: string, parentId: string | null): Sensitivity {
  const d = ctx.drive.get(driveId);
  const base: Sensitivity = d?.defaultLabel ?? 'internal';
  const parent = parentId ? ctx.item.get(parentId) : undefined;
  if (parent && LABEL_RANK[parent.label] > LABEL_RANK[base]) return parent.label;
  return base;
}

/** Items explicitly shared with the viewer (or a group they're in) — the "Shared with me" view. */
export function directShareFor(ctx: EngineCtx, v: Viewer, a: Access): Share | null {
  if (a.item.ownerId === v.id) return null;
  const d = ctx.drive.get(a.item.driveId);
  if (d?.kind === 'personal' && d.ownerId === v.id) return null;
  const r = a.reasons.find((x) => x.source === 'item' && x.principal && x.principal.type !== 'org');
  if (!r) return null;
  return a.item.shares.find((s) => s.id === r.shareId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Access X-Ray                                                        */
/* ------------------------------------------------------------------ */

export type Ring = 'owner' | 'direct' | 'inherited' | 'link';

export interface XNode {
  key: string;
  ring: Ring;
  principal?: Principal;
  scope?: LinkScope;
  name: string;
  level: AccessLevel;
  host: string;
  hostId: string;
  hostKind: 'item' | 'drive';
  shareId?: string;
  status: PathStatus;
  note?: string;
  expiresAt?: number | null;
  /** People covered by this node. */
  members: number;
  /** Members excluded by DLP (e.g. contractors in a department). */
  excluded: number;
  text: string;
}

export function xray(ctx: EngineCtx, item: Item): XNode[] {
  const drive = ctx.drive.get(item.driveId);
  const rule = ctx.policy.rules[item.label];
  const noun = item.kind === 'folder' ? 'folder' : 'file';
  const out: XNode[] = [];
  const owner = ctx.user.get(item.ownerId);
  out.push({
    key: 'owner',
    ring: 'owner',
    principal: { type: 'user', id: item.ownerId },
    name: owner?.name ?? 'Unknown owner',
    level: 'owner',
    host: `this ${noun}`,
    hostId: item.id,
    hostKind: 'item',
    status: 'active',
    members: 1,
    excluded: 0,
    text: `${owner?.name ?? 'Owner'} owns this ${noun}`,
  });

  const nodeFor = (s: Share, ring: Ring, host: string, hostId: string, hostKind: 'item' | 'drive', cutNote: string | null, keep = false): XNode => {
    const members = principalMembers(ctx, s.principal);
    const groupBlock = dlpBlock(rule, item.label, { principal: s.principal }, null);
    let userBlock: string | null = null;
    let excluded = 0;
    if (s.principal.type === 'user') {
      const v = ctx.viewers.find((x) => x.id === (s.principal as { id: string }).id) ?? null;
      userBlock = dlpBlock(rule, item.label, { principal: s.principal }, v);
    } else if (!rule.contractors) excluded = members.filter((m) => m.contractor).length;
    const expired = s.expiresAt !== null && s.expiresAt <= ctx.now;
    const block = groupBlock ?? userBlock;
    const status: PathStatus = cutNote && !keep ? 'cut' : expired ? 'expired' : block ? 'blocked' : 'active';
    const name = principalName(ctx, s.principal);
    const base = `${name} — ${LEVEL_LABEL[s.level]} via ${host}`;
    const text =
      status === 'cut'
        ? `${base} · cut: ${cutNote}`
        : status === 'expired'
          ? `${base} · expired`
          : status === 'blocked'
            ? `${base} · blocked: ${block}`
            : `${base}${excluded ? ` · ${excluded} contractor${excluded > 1 ? 's' : ''} excluded by DLP` : ''}${keep ? ' · drive managers keep access' : ''}`;
    return {
      key: `${hostId}:${s.id}`,
      ring,
      principal: s.principal,
      name,
      level: s.level,
      host,
      hostId,
      hostKind,
      shareId: s.id,
      status,
      note: status === 'cut' ? (cutNote ?? undefined) : status === 'blocked' ? (block ?? undefined) : undefined,
      expiresAt: s.expiresAt,
      members: s.principal.type === 'user' ? 1 : members.length,
      excluded,
      text,
    };
  };

  let cutNote: string | null = null;
  chainOf(ctx, item).forEach((node, i) => {
    const host = i === 0 ? `this ${noun}` : `folder ${node.name}`;
    for (const s of node.shares) out.push(nodeFor(s, i === 0 ? 'direct' : 'inherited', host, node.id, 'item', cutNote));
    if (node.link.scope !== 'restricted') {
      const block = dlpBlock(rule, item.label, { scope: node.link.scope }, null);
      const status: PathStatus = cutNote ? 'cut' : block ? 'blocked' : 'active';
      const name = node.link.scope === 'org' ? 'Anyone at Helix with the link' : 'Anyone with the link';
      out.push({
        key: `${node.id}:link`,
        ring: 'link',
        scope: node.link.scope,
        name,
        level: node.link.level,
        host,
        hostId: node.id,
        hostKind: 'item',
        status,
        note: status === 'cut' ? cutNote ?? undefined : block ?? undefined,
        members: node.link.scope === 'org' ? ctx.viewers.length : ctx.viewers.length,
        excluded: 0,
        text: `${name} — ${LEVEL_LABEL[node.link.level]} via ${host}${status === 'blocked' ? ` · blocked: ${block}` : status === 'cut' ? ` · cut: ${cutNote}` : ''}`,
      });
    }
    if (!node.inherit && !cutNote) cutNote = node.id === item.id ? `inheritance restricted on this ${noun}` : `inheritance restricted on folder ${node.name}`;
  });
  if (drive) {
    for (const m of drive.members) out.push(nodeFor(m, 'inherited', `shared drive ${drive.name}`, drive.id, 'drive', cutNote, m.level === 'manager'));
    if (drive.kind === 'shared') {
      const admins = ctx.viewers.filter((v) => v.admin).length;
      if (admins)
        out.push({
          key: 'admin',
          ring: 'inherited',
          name: 'Drive governance',
          level: 'manager',
          host: `shared drive ${drive.name}`,
          hostId: drive.id,
          hostKind: 'drive',
          status: 'active',
          members: admins,
          excluded: 0,
          text: `Governance admins (${admins}) can manage everything in shared drives — every access is audited`,
        });
    }
    if (drive.kind === 'personal' && drive.ownerId && drive.ownerId !== item.ownerId) {
      const o = ctx.user.get(drive.ownerId);
      out.push({
        key: 'personal',
        ring: 'inherited',
        principal: { type: 'user', id: drive.ownerId },
        name: o?.name ?? 'Drive owner',
        level: 'manager',
        host: 'their personal drive',
        hostId: drive.id,
        hostKind: 'drive',
        status: 'active',
        members: 1,
        excluded: 0,
        text: `${o?.name ?? 'The drive owner'} manages everything in their personal drive`,
      });
    }
  }
  return out;
}

export interface Audience {
  /** People who can find & open it (non-link paths), strongest first. */
  people: { id: string; level: AccessLevel }[];
  editors: number;
  /** Most open active link on the chain. */
  link: LinkScope;
  /** People whose only paths are blocked by DLP. */
  blocked: number;
}

export function audience(ctx: EngineCtx, item: Item): Audience {
  const people: { id: string; level: AccessLevel }[] = [];
  let blocked = 0;
  let link: LinkScope = 'restricted';
  for (const v of ctx.viewers) {
    const a = effectiveAccess(ctx, v, item);
    const real = a.reasons.filter((r) => r.source !== 'link');
    if (real.length) people.push({ id: v.id, level: real[0].level });
    else if (a.inactive.some((r) => r.status === 'blocked')) blocked += 1;
    for (const r of a.reasons) if (r.source === 'link' && r.scope && (link === 'restricted' || r.scope === 'anyone')) link = r.scope;
  }
  people.sort((x, y) => RANK[y.level] - RANK[x.level]);
  return { people, editors: people.filter((p) => RANK[p.level] >= RANK.editor).length, link, blocked };
}

/** Paths that would become blocked if the label changed to `to`. */
export function labelImpact(ctx: EngineCtx, item: Item, to: Sensitivity): { name: string; reason: string }[] {
  const rule = ctx.policy.rules[to];
  const fake: Item = { ...item, label: to };
  const out: { name: string; reason: string }[] = [];
  const before = new Set(xray(ctx, item).filter((n) => n.status === 'blocked').map((n) => n.key));
  const tmp: EngineCtx = { ...ctx, item: new Map(ctx.item).set(item.id, fake) };
  for (const n of xray(tmp, fake)) {
    if (n.status === 'blocked' && !before.has(n.key)) out.push({ name: n.name, reason: n.note ?? '' });
    else if (n.status === 'active' && n.excluded && !rule.contractors) out.push({ name: n.name, reason: `${n.excluded} contractor${n.excluded > 1 ? 's' : ''} lose access` });
  }
  return out;
}

export const levelOptionsFor = (max: AccessLevel): Level[] => (['viewer', 'commenter', 'editor', 'manager'] as Level[]).filter((l) => RANK[l] <= RANK[max]);
