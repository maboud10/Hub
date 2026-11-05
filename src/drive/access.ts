/**
 * Role-based access resolution for Helix Drive.
 *
 * Effective role = max of (owner / drive manager / governance) ∪ shares on the
 * item and — while inheritance is on — its ancestors and the drive itself,
 * where a share can target a user, a hub role, a department, a permission
 * string or the whole company. Link sharing adds a floor role. Sensitivity
 * labels then apply DLP: Confidential excludes contractors & external links,
 * Restricted requires an explicit personal share and clearance L3+.
 */
import type { Department, Role, User } from '@/types';
import { clearanceOf, effectivePermissions, hasPermission } from '@/lib/rbac';
import { ROLE_RANK, SENSITIVITY_META } from './constants';
import type { DriveItem, DriveRole, DriveShare, LinkAccess, Principal, Sensitivity, SharedDrive } from './types';

export interface DriveViewer {
  userId: string;
  perms: ReadonlySet<string>;
  department: Department;
  roleIds: string[];
  clearance: number;
}

export interface DriveContext {
  items: Map<string, DriveItem>;
  drives: Map<string, SharedDrive>;
}

export const buildDriveContext = (items: DriveItem[], drives: SharedDrive[]): DriveContext => ({
  items: new Map(items.map((i) => [i.id, i])),
  drives: new Map(drives.map((d) => [d.id, d])),
});

export function buildDriveViewer(user: User | null | undefined, roles: Role[]): DriveViewer | null {
  if (!user || !user.active) return null;
  return { userId: user.id, perms: effectivePermissions(user, roles), department: user.department, roleIds: user.roleIds, clearance: clearanceOf(user, roles) };
}

export const isContractor = (v: DriveViewer) => v.roleIds.includes('contractor') || v.clearance <= 1;
export const canUseDrive = (v: DriveViewer | null): boolean => Boolean(v && hasPermission(v.perms, 'app:drive'));
/** Drive governance: see every drive, override permissions, retention, restore anything. */
export const canGovernDrive = (v: DriveViewer | null): boolean => Boolean(v && hasPermission(v.perms, 'drive.manage'));
export const canCreateSharedDrive = (v: DriveViewer | null): boolean => Boolean(v && canUseDrive(v) && (canGovernDrive(v) || v.roleIds.includes('manager') || v.roleIds.includes('people-ops')));

export function principalMatches(v: DriveViewer, p: Principal): boolean {
  switch (p.type) {
    case 'user':
      return p.id === v.userId;
    case 'role':
      return v.roleIds.includes(p.id);
    case 'department':
      // Contractors sit inside a department organisationally but never inherit its drive access.
      return !isContractor(v) && v.department === p.id;
    case 'permission':
      return !isContractor(v) && hasPermission(v.perms, p.id);
    case 'company':
      return !isContractor(v);
  }
}

export const isShareActive = (s: DriveShare, now = Date.now()) => !s.expiresAt || s.expiresAt > now;

const maxRole = (a: DriveRole | null, b: DriveRole | null): DriveRole | null => {
  if (!a) return b;
  if (!b) return a;
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
};

export function shareRole(v: DriveViewer, shares: DriveShare[], now = Date.now(), onlyExplicit = false): DriveRole | null {
  let role: DriveRole | null = null;
  for (const s of shares) {
    if (!isShareActive(s, now)) continue;
    if (onlyExplicit && s.principal.type !== 'user') continue;
    if (principalMatches(v, s.principal)) role = maxRole(role, s.role);
  }
  return role;
}

/** Ancestor chain from the item up to the drive root (item first). */
export function ancestorsOf(item: DriveItem, ctx: DriveContext): DriveItem[] {
  const out: DriveItem[] = [];
  let cur: DriveItem | undefined = item.parentId ? ctx.items.get(item.parentId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? ctx.items.get(cur.parentId) : undefined;
  }
  return out;
}

export function canSeeDrive(v: DriveViewer | null, drive: SharedDrive | undefined): boolean {
  if (!v || !drive || !canUseDrive(v)) return false;
  if (canGovernDrive(v) || v.perms.has('*')) return true;
  if (drive.kind === 'personal') return drive.ownerId === v.userId;
  if (drive.minClearance && v.clearance < drive.minClearance) return false;
  return drive.managerIds.includes(v.userId) || shareRole(v, drive.access) !== null;
}

export const canManageDrive = (v: DriveViewer | null, drive: SharedDrive | undefined): boolean =>
  Boolean(v && drive && (canGovernDrive(v) || v.perms.has('*') || drive.managerIds.includes(v.userId) || (drive.kind === 'personal' && drive.ownerId === v.userId)));

/** The heart of Drive security: the viewer's effective role on an item (null = invisible). */
export function effectiveRole(v: DriveViewer | null, item: DriveItem | undefined, ctx: DriveContext, now = Date.now()): DriveRole | null {
  if (!v || !item || !canUseDrive(v)) return null;
  if (canGovernDrive(v) || v.perms.has('*')) return 'manager';
  if (item.ownerId === v.userId) return 'manager';
  const drive = ctx.drives.get(item.driveId);
  if (drive?.managerIds.includes(v.userId)) return 'manager';
  if (drive?.minClearance && v.clearance < drive.minClearance) return null;

  const chain = [item, ...ancestorsOf(item, ctx)];
  const restricted = item.sensitivity === 'restricted';
  const confidential = item.sensitivity === 'confidential';
  const explicitOnly = restricted || (confidential && isContractor(v));
  if (restricted && v.clearance < 3) return null;

  let role: DriveRole | null = null;
  let inherit = true;
  for (const node of chain) {
    if (!inherit && node.id !== item.id) break;
    role = maxRole(role, shareRole(v, node.shares, now, explicitOnly));
    if (!explicitOnly) {
      if (node.linkAccess === 'anyone' || (node.linkAccess === 'company' && !isContractor(v))) role = maxRole(role, node.linkRole);
    }
    if (!node.inheritPermissions) inherit = false;
  }
  if (inherit && drive && !explicitOnly) role = maxRole(role, shareRole(v, drive.access, now));
  if (inherit && drive && explicitOnly && !isContractor(v)) role = maxRole(role, shareRole(v, drive.access, now, true));
  return role;
}

const rank = (r: DriveRole | null) => (r ? ROLE_RANK[r] : -1);

export const canView = (role: DriveRole | null) => role !== null;
export const canComment = (role: DriveRole | null) => rank(role) >= ROLE_RANK.commenter;
export const canEdit = (role: DriveRole | null, item?: Pick<DriveItem, 'locked'>) => rank(role) >= ROLE_RANK.editor && !(item?.locked && role !== 'manager');
export const canManage = (role: DriveRole | null) => role === 'manager';
/** Editors can re-share Internal/Public items; Confidential & Restricted need a manager. */
export const canShare = (role: DriveRole | null, item: Pick<DriveItem, 'sensitivity'>) =>
  role === 'manager' || (role === 'editor' && SENSITIVITY_META[item.sensitivity].rank <= SENSITIVITY_META.internal.rank);
/** DLP: viewers can’t download Restricted files; Confidential downloads are watermarked (UI). */
export const canDownload = (role: DriveRole | null, item: Pick<DriveItem, 'sensitivity' | 'kind'>) =>
  role !== null && item.kind !== 'folder' && !(item.sensitivity === 'restricted' && role === 'viewer');
export const canTrash = (role: DriveRole | null, item: Pick<DriveItem, 'retention' | 'locked'>) => role === 'manager' && item.retention !== 'legal_hold' && !item.locked;

export type Gate = { ok: true } | { ok: false; reason: string };

/** Which link settings a sensitivity label permits. */
export function allowedLinkAccess(sensitivity: Sensitivity): LinkAccess[] {
  switch (sensitivity) {
    case 'public':
      return ['restricted', 'company', 'anyone'];
    case 'internal':
      return ['restricted', 'company'];
    default:
      return ['restricted'];
  }
}

/** DLP check before adding a share. */
export function checkShareAllowed(item: Pick<DriveItem, 'sensitivity'>, principal: Principal, recipient?: Pick<User, 'roleIds'> | null, recipientClearance = 0): Gate {
  const s = item.sensitivity;
  if (s === 'restricted') {
    if (principal.type !== 'user') return { ok: false, reason: 'Restricted files can only be shared with named people.' };
    if (recipientClearance < 3) return { ok: false, reason: 'Restricted files require clearance L3 or above.' };
    if (recipient?.roleIds.includes('contractor')) return { ok: false, reason: 'Restricted files can’t be shared with contractors.' };
  }
  if (s === 'confidential') {
    if (principal.type === 'company') return { ok: false, reason: 'Confidential files can’t be shared with the whole company — share with a team or named people.' };
    if (principal.type === 'role' && principal.id === 'contractor') return { ok: false, reason: 'Confidential files can’t be shared with the Contractor role.' };
    if (recipient?.roleIds.includes('contractor')) return { ok: false, reason: 'Confidential files can’t be shared with contractors.' };
  }
  if (s === 'internal' && principal.type === 'role' && principal.id === 'contractor') {
    return { ok: false, reason: 'Internal files are for employees — share with specific contractors by name instead.' };
  }
  return { ok: true };
}
