/**
 * Shared building blocks for the Helix Drive UI: kind icons, sensitivity &
 * role pills, principal labels, storage bars, the context menu, the move
 * picker, role explanations ("Editor · via Engineering department · inherited
 * from Engineering drive") and the reusable grid/list item renderer.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import {
  ArrowUpDown,
  BookText,
  Building2,
  Check,
  ChevronRight,
  Clock,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderInput,
  Globe,
  KeyRound,
  Lock,
  MoreHorizontal,
  Presentation,
  RotateCcw,
  Shield,
  Star,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Department, PermissionDef, Role, User } from '@/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { formatDateTime, relativeTime } from '@/lib/format';
import { buildPermissionCatalog } from '@/lib/rbac';
import * as access from '@/drive/access';
import { DEPARTMENT_DRIVE_COLORS, KIND_META, LINK_ACCESS_META, ROLE_META, ROLE_RANK, SENSITIVITY_META, TRASH_RETENTION_DAYS, formatBytes } from '@/drive/constants';
import { folderLink, itemLink, useDrive, type Result } from '@/drive/store';
import { useDriveCaps, useDriveContext, useDriveViewer, useVisibleDrives, type ItemWithRole } from '@/drive/selectors';
import type { DriveItem, DriveRole, DriveShare, ItemKind, Principal, Sensitivity, SharedDrive } from '@/drive/types';

export const DAY = 86_400_000;
export const DND_TYPE = 'application/x-helix-drive-items';
export const DEPARTMENTS = Object.keys(DEPARTMENT_DRIVE_COLORS) as Department[];

// ───────────────────────── links & downloads ─────────────────────────

export const itemHref = (item: Pick<DriveItem, 'id' | 'kind' | 'driveId'>) => (item.kind === 'folder' ? folderLink(item.driveId, item.id) : itemLink(item.id));

export function copyItemLink(item: Pick<DriveItem, 'id' | 'linkAccess' | 'kind'>) {
  const url = `${window.location.origin}${itemHref(item as DriveItem)}`;
  const done = () => toast.success('Link copied', LINK_ACCESS_META[item.linkAccess].description);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => toast.error('Couldn’t copy the link.'));
  else {
    window.prompt('Copy this link', url);
    done();
  }
}

/** Turn a store download result into a real browser download (Blob + anchor). */
export function downloadResult(res: Result<{ fileName: string; content: string; watermark?: string }>) {
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  const blob = new Blob([res.content ?? ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.fileName ?? 'download.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast.success(res.message ?? 'Downloading…', res.watermark ? `Watermarked · ${res.watermark}` : undefined);
  return true;
}

// ───────────────────────── kind / label / role pills ─────────────────────────

const KIND_ICON: Record<ItemKind, LucideIcon> = {
  folder: Folder,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  pdf: BookText,
  image: FileImage,
  video: FileVideo,
  archive: FileArchive,
  code: FileCode2,
  markdown: FileType,
  other: File,
};

export function KindIcon({ kind, size = 18, className, style }: { kind: ItemKind; size?: number; className?: string; style?: CSSProperties }) {
  const Icon = KIND_ICON[kind];
  return <Icon className={cx('dr-kind-icon', className)} style={{ width: size, height: size, color: KIND_META[kind].color, ...style }} aria-hidden="true" strokeWidth={kind === 'folder' ? 2 : 1.75} />;
}

/** Tinted square tile around the kind icon (cards, file header). */
export function KindTile({ kind, size = 40, className }: { kind: ItemKind; size?: number; className?: string }) {
  return (
    <span className={cx('dr-kind-tile', className)} style={{ '--kind': KIND_META[kind].color, '--size': `${size}px` } as CSSProperties} aria-hidden="true">
      <KindIcon kind={kind} size={Math.round(size * 0.52)} />
    </span>
  );
}

export function SensitivityPill({ sensitivity, compact, className }: { sensitivity: Sensitivity; compact?: boolean; className?: string }) {
  const m = SENSITIVITY_META[sensitivity];
  return (
    <span className={cx('dr-sens', compact && 'dr-sens--compact', className)} style={{ '--sens': m.color } as CSSProperties} title={m.description}>
      <i aria-hidden="true" />
      {m.label}
    </span>
  );
}

export function RolePill({ role, via, from, className }: { role: DriveRole | null; via?: string; from?: string; className?: string }) {
  if (!role) return <span className={cx('dr-role dr-role--none', className)}>No access</span>;
  return (
    <span className={cx('dr-role', `dr-role--${role}`, className)} title={ROLE_META[role].description}>
      <Shield aria-hidden="true" />
      {ROLE_META[role].label}
      {via && <span className="dr-role__via"> · via {via}</span>}
      {from && <span className="dr-role__via"> · inherited from {from}</span>}
    </span>
  );
}

export const SensitivityBadge = SensitivityPill;
export const RoleBadge = RolePill;


// ───────────────────────── people & principals ─────────────────────────

export function useUsersById() {
  const users = useHub((s) => s.users);
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}

export function UserChip({ userId, size = 22, showName = true, className, suffix }: { userId: string | undefined; size?: number; showName?: boolean; className?: string; suffix?: ReactNode }) {
  const users = useUsersById();
  const u = userId ? users.get(userId) : undefined;
  if (!u) return <span className={cx('dr-user muted', className)}>Someone</span>;
  return (
    <span className={cx('dr-user', className)} title={u.name}>
      <Avatar user={u} size={size} />
      {showName && <span className="truncate">{u.name}</span>}
      {suffix}
    </span>
  );
}

export function principalLabel(p: Principal, users: User[], roles: Role[], perms: PermissionDef[]): string {
  switch (p.type) {
    case 'user':
      return users.find((u) => u.id === p.id)?.name ?? 'Former member';
    case 'role':
      return `${roles.find((r) => r.id === p.id)?.name ?? p.id} role`;
    case 'department':
      return `${p.id} department`;
    case 'permission':
      return `Anyone with ${perms.find((x) => x.id === p.id)?.label ?? p.id}`;
    case 'company':
      return 'Everyone at Helix';
  }
}

export function usePermissionCatalog() {
  const apps = useHub((s) => s.apps);
  return useMemo(() => buildPermissionCatalog(apps), [apps]);
}

export function usePrincipalLabel() {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const perms = usePermissionCatalog();
  return useCallback((p: Principal) => principalLabel(p, users, roles, perms), [users, roles, perms]);
}

export const PRINCIPAL_ICON: Record<Principal['type'], LucideIcon> = { user: UserRound, role: KeyRound, department: Building2, permission: Shield, company: Globe };
export const PRINCIPAL_TYPE_LABEL: Record<Principal['type'], string> = { user: 'Person', role: 'Hub role', department: 'Department', permission: 'Permission', company: 'Everyone at Helix' };

export function PrincipalAvatar({ principal, size = 28 }: { principal: Principal; size?: number }) {
  const users = useUsersById();
  if (principal.type === 'user') {
    const u = users.get(principal.id);
    if (u) return <Avatar user={u} size={size} />;
  }
  const Icon = PRINCIPAL_ICON[principal.type];
  return (
    <span className={cx('dr-principal-icon', `dr-principal-icon--${principal.type}`)} style={{ '--size': `${size}px` } as CSSProperties} aria-hidden="true">
      <Icon />
    </span>
  );
}

// ───────────────────────── storage & expiry ─────────────────────────

export function StorageBar({ used, quota, color, compact, className }: { used: number; quota: number; color?: string; compact?: boolean; className?: string }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return (
    <div className={cx('dr-storage', compact && 'dr-storage--compact', pct >= 90 ? 'is-critical' : pct >= 75 && 'is-warn', className)} title={`${formatBytes(used)} of ${formatBytes(quota)} used (${pct}%)`}>
      <div className="dr-storage__bar">
        <i style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%`, background: color }} />
      </div>
      {!compact && (
        <div className="dr-storage__meta">
          <span>
            {formatBytes(used)} <span className="faint">of {formatBytes(quota)}</span>
          </span>
          <span className="mono">{pct}%</span>
        </div>
      )}
    </div>
  );
}

export function daysUntil(ts: number, now = Date.now()) {
  return Math.ceil((ts - now) / DAY);
}

export function ExpiryBadge({ expiresAt, className }: { expiresAt?: number; className?: string }) {
  if (!expiresAt) return <span className={cx('dr-expiry dr-expiry--none', className)}>No expiry</span>;
  const days = daysUntil(expiresAt);
  if (days <= 0) return <span className={cx('dr-expiry dr-expiry--expired', className)}>Expired</span>;
  return (
    <span className={cx('dr-expiry', days <= 7 && 'dr-expiry--soon', className)} title={new Date(expiresAt).toLocaleString()}>
      <Clock aria-hidden="true" />
      {days === 1 ? 'Expires tomorrow' : `Expires in ${days}d`}
    </span>
  );
}

export function trashDaysLeft(item: DriveItem, now = Date.now()) {
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor((now - (item.trashedAt ?? now)) / DAY));
}

// ───────────────────────── view mode (persisted) ─────────────────────────

const VIEW_KEY = 'helix-drive-view';
export type ViewMode = 'grid' | 'list';
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const set = useCallback((m: ViewMode) => {
    setMode(m);
    try {
      localStorage.setItem(VIEW_KEY, m);
    } catch {
      /* private mode */
    }
  }, []);
  return [mode, set];
}

// ───────────────────────── role explanation ─────────────────────────

export interface RoleExplanation {
  role: DriveRole | null;
  /** Plain-language source: "owner", "drive manager", "Engineering department", "a direct share", "link (anyone at Helix)"… */
  via: string;
  /** Name of the folder/drive the matching share lives on (when inherited). */
  from?: string;
  fromHref?: string;
}

/**
 * Mirrors `effectiveRole` but remembers *which* share produced the role, so the
 * UI can explain permissions in plain language. `chain` = item first, then its
 * ancestors (empty for a drive root).
 */
export function explainRole(v: access.DriveViewer | null, canGovern: boolean, drive: SharedDrive | undefined, chain: DriveItem[], label: (p: Principal) => string): RoleExplanation {
  if (!v) return { role: null, via: 'not signed in' };
  if (canGovern || v.perms.has('*')) return { role: 'manager', via: 'Drive governance' };
  const item = chain[0];
  if (item && item.ownerId === v.userId) return { role: 'manager', via: 'owner' };
  if (drive?.kind === 'personal' && drive.ownerId === v.userId) return { role: 'manager', via: 'your drive' };
  if (drive?.managerIds.includes(v.userId)) return { role: 'manager', via: 'drive manager' };
  if (drive?.minClearance && v.clearance < drive.minClearance) return { role: null, via: `clearance L${drive.minClearance}+ required` };
  const contractor = access.isContractor(v);
  const restricted = item?.sensitivity === 'restricted';
  const confidential = item?.sensitivity === 'confidential';
  const explicitOnly = restricted || (confidential && contractor);
  if (restricted && v.clearance < 3) return { role: null, via: 'Restricted files need clearance L3+' };

  let best: RoleExplanation = { role: null, via: 'no matching share' };
  const consider = (role: DriveRole, via: string, from?: string, fromHref?: string) => {
    if (!best.role || ROLE_RANK[role] > ROLE_RANK[best.role]) best = { role, via, from, fromHref };
  };
  let inherit = true;
  for (const node of chain) {
    if (!inherit && node !== item) break;
    const from = node === item ? undefined : node.name;
    const href = node === item ? undefined : folderLink(node.driveId, node.id);
    for (const s of node.shares) {
      if (!access.isShareActive(s)) continue;
      if (explicitOnly && s.principal.type !== 'user') continue;
      if (access.principalMatches(v, s.principal)) consider(s.role, s.principal.type === 'user' ? 'a direct share' : label(s.principal), from, href);
    }
    if (!explicitOnly && (node.linkAccess === 'anyone' || (node.linkAccess === 'company' && !contractor))) {
      consider(node.linkRole, node.linkAccess === 'anyone' ? 'link (anyone with the link)' : 'link (anyone at Helix)', from, href);
    }
    if (!node.inheritPermissions) inherit = false;
  }
  if (inherit && drive && !(explicitOnly && contractor)) {
    for (const s of drive.access) {
      if (!access.isShareActive(s)) continue;
      if (explicitOnly && s.principal.type !== 'user') continue;
      if (access.principalMatches(v, s.principal)) consider(s.role, s.principal.type === 'user' ? 'a direct share' : label(s.principal), drive.kind === 'personal' ? drive.name : `${drive.name} drive`, folderLink(drive.id));
    }
  }
  return best;
}

export function useRoleExplanation(drive: SharedDrive | undefined, chain: DriveItem[]): RoleExplanation {
  const v = useDriveViewer();
  const caps = useDriveCaps();
  const label = usePrincipalLabel();
  return useMemo(() => explainRole(v, caps.canGovern, drive, chain, label), [v, caps.canGovern, drive, chain, label]);
}

const ROLE_VERB: Record<DriveRole, string> = { manager: 'manage everything', editor: 'edit', commenter: 'view and comment', viewer: 'view' };

/** "You can edit here as Engineering department · inherited from Engineering drive". */
export function describeRole(exp: RoleExplanation, where = 'here'): string {
  if (!exp.role) return `You don’t have access ${where}.`;
  const via =
    exp.via === 'owner' ? 'as the owner' : exp.via === 'your drive' ? 'in your own drive' : exp.via === 'drive manager' ? 'as a drive manager' : exp.via === 'Drive governance' ? 'through Drive governance' : exp.via === 'a direct share' ? 'through a direct share' : exp.via.startsWith('link') ? `through a ${exp.via}` : `as ${exp.via}`;
  return `You can ${ROLE_VERB[exp.role]} ${where} ${via}${exp.from ? ` · inherited from ${exp.from}` : ''}.`;
}

/** Short "via" text for pills: "Engineering department", "owner", "link"… */
export function shortVia(exp: RoleExplanation) {
  return exp.via.startsWith('link') ? 'link' : exp.via;
}

// ───────────────────────── effective shares (explicit + inherited) ─────────────────────────

export interface EffectiveShare {
  share: DriveShare;
  inherited: boolean;
  from?: string;
  fromHref?: string;
}

export function collectEffectiveShares(item: DriveItem, ctx: access.DriveContext): EffectiveShare[] {
  const out: EffectiveShare[] = item.shares.filter((s) => access.isShareActive(s)).map((share) => ({ share, inherited: false }));
  let inherit = item.inheritPermissions;
  for (const node of access.ancestorsOf(item, ctx)) {
    if (!inherit) break;
    node.shares.filter((s) => access.isShareActive(s)).forEach((share) => out.push({ share, inherited: true, from: node.name, fromHref: folderLink(node.driveId, node.id) }));
    inherit = node.inheritPermissions;
  }
  const drive = ctx.drives.get(item.driveId);
  if (inherit && drive) drive.access.filter((s) => access.isShareActive(s)).forEach((share) => out.push({ share, inherited: true, from: drive.kind === 'personal' ? drive.name : `${drive.name} drive`, fromHref: folderLink(drive.id) }));
  return out;
}

/** Where inherited permissions stop (the nearest node with inheritance off), if any. */
export function inheritanceBoundary(item: DriveItem, ctx: access.DriveContext): DriveItem | null {
  if (!item.inheritPermissions) return item;
  for (const node of access.ancestorsOf(item, ctx)) if (!node.inheritPermissions) return node;
  return null;
}

// ───────────────────────── location helpers ─────────────────────────

export function useLocationOf() {
  const drives = useDrive((s) => s.drives);
  const items = useDrive((s) => s.items);
  return useCallback(
    (item: DriveItem): { label: string; href: string; driveName: string; parentName?: string } => {
      const drive = drives.find((d) => d.id === item.driveId);
      const parent = item.parentId ? items.find((i) => i.id === item.parentId) : undefined;
      const driveName = drive?.name ?? 'Drive';
      return { driveName, parentName: parent?.name, label: parent ? `${driveName} › ${parent.name}` : driveName, href: folderLink(item.driveId, parent?.id) };
    },
    [drives, items],
  );
}

// ───────────────────────── context menu ─────────────────────────

export interface MenuAnchor {
  x: number;
  y: number;
}
export interface MenuEntry {
  id: string;
  label?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  kind?: 'item' | 'sep' | 'label';
}

export const anchorFromEvent = (e: ReactMouseEvent): MenuAnchor => {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4 };
};
export const anchorBelow = (el: HTMLElement): MenuAnchor => {
  const r = el.getBoundingClientRect();
  return { x: r.right - 220, y: r.bottom + 6 };
};

export function ContextMenu({ anchor, items, onClose, width = 236 }: { anchor: MenuAnchor | null; items: MenuEntry[]; onClose: () => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuAnchor | null>(anchor);

  useLayoutEffect(() => {
    if (!anchor) {
      setPos(null);
      return;
    }
    const r = ref.current?.getBoundingClientRect();
    const w = r?.width ?? width;
    const h = r?.height ?? 320;
    setPos({ x: Math.max(8, Math.min(anchor.x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(anchor.y, window.innerHeight - h - 8)) });
  }, [anchor, width, items.length]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div ref={ref} role="menu" className="dr-menu" style={{ left: pos?.x ?? anchor.x, top: pos?.y ?? anchor.y, width, visibility: pos ? 'visible' : 'hidden' }}>
      {items.map((it) => {
        if (it.kind === 'sep') return <div key={it.id} className="dr-menu__sep" role="separator" />;
        if (it.kind === 'label') return (
          <div key={it.id} className="dr-menu__label">
            {it.label}
          </div>
        );
        return (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className={cx('dr-menu__item', it.danger && 'is-danger')}
            disabled={it.disabled}
            title={it.disabled ? it.hint : undefined}
            onClick={() => {
              if (it.disabled) return;
              onClose();
              it.onSelect?.();
            }}
          >
            {it.icon && <span className="dr-menu__icon">{it.icon}</span>}
            <span className="grow truncate">{it.label}</span>
            {it.hint && <span className="dr-menu__hint truncate">{it.hint}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

// ───────────────────────── inline rename ─────────────────────────

export function RenameInline({ initial, onCommit, onCancel, className }: { initial: string; onCommit: (name: string) => void; onCancel: () => void; className?: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && value.trim() && value.trim() !== initial) onCommit(value.trim());
    else onCancel();
  };
  return (
    <input
      ref={ref}
      className={cx('input dr-rename', className)}
      value={value}
      aria-label="New name"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}

// ───────────────────────── sorting ─────────────────────────

export type SortKey = 'name' | 'modified' | 'size';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}
export const SORT_LABEL: Record<SortKey, string> = { name: 'Name', modified: 'Last modified', size: 'Size' };

export function sortRows(rows: ItemWithRole[], sort: SortState): ItemWithRole[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const folderFirst = Number(b.item.kind === 'folder') - Number(a.item.kind === 'folder');
    if (folderFirst) return folderFirst;
    if (sort.key === 'name') return a.item.name.localeCompare(b.item.name) * dir;
    if (sort.key === 'modified') return (a.item.modifiedAt - b.item.modifiedAt) * dir;
    return (a.item.sizeBytes - b.item.sizeBytes) * dir;
  });
}

// ───────────────────────── item grid / list ─────────────────────────

export interface ItemListProps {
  rows: ItemWithRole[];
  mode: ViewMode;
  onOpen: (row: ItemWithRole) => void;
  onMenu: (row: ItemWithRole, anchor: MenuAnchor) => void;
  onStar?: (row: ItemWithRole) => void;
  selected?: Set<string>;
  onSelect?: (row: ItemWithRole, index: number, mods: { shift: boolean; meta: boolean }) => void;
  sort?: SortState;
  onSort?: (s: SortState) => void;
  showLocation?: boolean;
  renamingId?: string | null;
  onRename?: (id: string, name: string) => void;
  onCancelRename?: () => void;
  /** Enable dragging rows and dropping onto folders. */
  dnd?: { onMove: (ids: string[], target: DriveItem) => void };
  /** Trash mode: shows trashed date, days left and restore / delete actions. */
  trash?: { onRestore: (row: ItemWithRole) => void; onDelete: (row: ItemWithRole) => void };
}

function readDragIds(e: DragEvent): string[] {
  try {
    const raw = e.dataTransfer.getData(DND_TYPE);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export const hasDragItems = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(DND_TYPE);
export const hasDragFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

export function ItemList(props: ItemListProps) {
  const { rows, mode, onOpen, onMenu, onStar, selected, onSelect, sort, onSort, showLocation, renamingId, onRename, onCancelRename, dnd, trash } = props;
  const me = useHub((s) => s.sessionUserId);
  const locationOf = useLocationOf();
  const [dropId, setDropId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  const dragHandlers = (row: ItemWithRole) => {
    if (!dnd) return {};
    const id = row.item.id;
    const isFolder = row.item.kind === 'folder';
    return {
      draggable: row.canEdit && row.item.retention !== 'legal_hold',
      onDragStart: (e: DragEvent) => {
        const ids = selected?.has(id) ? [...selected] : [id];
        e.dataTransfer.setData(DND_TYPE, JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
        setDraggingIds(ids);
      },
      onDragEnd: () => {
        setDraggingIds([]);
        setDropId(null);
      },
      onDragOver: (e: DragEvent) => {
        if (!isFolder || !hasDragItems(e) || draggingIds.includes(id)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropId !== id) setDropId(id);
      },
      onDragLeave: (e: DragEvent) => {
        if (dropId === id && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropId(null);
      },
      onDrop: (e: DragEvent) => {
        if (!isFolder || !hasDragItems(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropId(null);
        const ids = readDragIds(e).filter((x) => x !== id);
        if (ids.length) dnd.onMove(ids, row.item);
      },
    };
  };

  const rowClick = (row: ItemWithRole, index: number, e: ReactMouseEvent) => {
    if (renamingId === row.item.id) return;
    if (onSelect && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSelect(row, index, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
      return;
    }
    onOpen(row);
  };

  const nameCell = (row: ItemWithRole) =>
    renamingId === row.item.id && onRename ? <RenameInline initial={row.item.name} onCommit={(n) => onRename(row.item.id, n)} onCancel={() => onCancelRename?.()} /> : <span className="dr-item-name truncate">{row.item.name}</span>;

  const starred = (row: ItemWithRole) => Boolean(me && row.item.starredBy.includes(me));

  if (mode === 'grid') {
    const folders = rows.filter((r) => r.item.kind === 'folder');
    const files = rows.filter((r) => r.item.kind !== 'folder');
    const renderTile = (row: ItemWithRole, index: number) => {
      const it = row.item;
      const isFolder = it.kind === 'folder';
      const isSel = selected?.has(it.id) ?? false;
      return (
        <article
          key={it.id}
          className={cx('dr-tile', isFolder && 'dr-tile--folder', isSel && 'is-selected', dropId === it.id && 'is-drop', draggingIds.includes(it.id) && 'is-dragging')}
          tabIndex={0}
          role="button"
          aria-label={it.name}
          onClick={(e) => rowClick(row, index, e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen(row);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onMenu(row, { x: e.clientX, y: e.clientY });
          }}
          {...dragHandlers(row)}
        >
          <div className="dr-tile__head">
            {onSelect && (
              <label className="dr-check" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={isSel} aria-label={`Select ${it.name}`} onChange={() => onSelect(row, index, { shift: false, meta: true })} />
                <Check />
              </label>
            )}
            <KindIcon kind={it.kind} size={isFolder ? 22 : 20} />
            {nameCell(row)}
            <button
              type="button"
              className="icon-btn icon-btn--sm dr-tile__more"
              aria-label={`More actions for ${it.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onMenu(row, anchorBelow(e.currentTarget));
              }}
            >
              <MoreHorizontal />
            </button>
          </div>
          {!isFolder && (
            <div className="dr-tile__body" aria-hidden="true">
              <TilePreview item={it} />
            </div>
          )}
          <div className="dr-tile__foot">
            <UserChip userId={it.ownerId} size={20} showName={false} />
            <span className="dr-tile__meta truncate" title={formatDateTime(it.modifiedAt)}>
              {relativeTime(it.modifiedAt)}
              {!isFolder && ` · ${formatBytes(it.sizeBytes)}`}
            </span>
            <SensitivityPill sensitivity={it.sensitivity} compact />
            {it.locked && <Lock className="dr-ico-lock" aria-label="Locked" />}
            {row.shareCount > 0 && (
              <span className="dr-sharecount" title={`${row.shareCount} explicit share${row.shareCount === 1 ? '' : 's'}`}>
                <Users />
                {row.shareCount}
              </span>
            )}
            {onStar && (
              <button
                type="button"
                className={cx('dr-star', starred(row) && 'is-on')}
                aria-label={starred(row) ? 'Remove from starred' : 'Add to starred'}
                aria-pressed={starred(row)}
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(row);
                }}
              >
                <Star />
              </button>
            )}
          </div>
        </article>
      );
    };
    return (
      <div className="dr-gridwrap">
        {folders.length > 0 && (
          <>
            <div className="dr-grid__label">Folders</div>
            <div className="dr-grid dr-grid--folders">{folders.map((r) => renderTile(r, rows.indexOf(r)))}</div>
          </>
        )}
        {files.length > 0 && (
          <>
            {folders.length > 0 && <div className="dr-grid__label">Files</div>}
            <div className="dr-grid">{files.map((r) => renderTile(r, rows.indexOf(r)))}</div>
          </>
        )}
      </div>
    );
  }

  const th = (key: SortKey, label: string, className?: string) => {
    const active = sort?.key === key;
    return (
      <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        {onSort ? (
          <button type="button" className={cx('dr-th', active && 'is-active')} onClick={() => onSort({ key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}>
            {label}
            <ArrowUpDown />
          </button>
        ) : (
          label
        )}
      </th>
    );
  };

  return (
    <div className="dr-listwrap">
      <table className="dr-list">
        <thead>
          <tr>
            {onSelect && <th className="dr-col-check" />}
            {th('name', 'Name')}
            {showLocation && <th className="dr-hide-sm">Location</th>}
            {trash ? (
              <>
                <th className="dr-hide-sm">Trashed</th>
                <th>Auto-purge</th>
              </>
            ) : (
              <>
                <th className="dr-hide-sm">Owner</th>
                {th('modified', 'Modified', 'dr-hide-xs')}
                {th('size', 'Size', 'dr-hide-sm')}
                <th>Label</th>
              </>
            )}
            <th className="dr-col-actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const it = row.item;
            const isFolder = it.kind === 'folder';
            const isSel = selected?.has(it.id) ?? false;
            const loc = showLocation ? locationOf(it) : null;
            return (
              <tr
                key={it.id}
                className={cx('dr-row', isSel && 'is-selected', dropId === it.id && 'is-drop', draggingIds.includes(it.id) && 'is-dragging')}
                onClick={(e) => rowClick(row, index, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMenu(row, { x: e.clientX, y: e.clientY });
                }}
                {...dragHandlers(row)}
              >
                {onSelect && (
                  <td className="dr-col-check" onClick={(e) => e.stopPropagation()}>
                    <label className="dr-check">
                      <input type="checkbox" checked={isSel} aria-label={`Select ${it.name}`} onChange={(e) => onSelect(row, index, { shift: (e.nativeEvent as MouseEvent).shiftKey, meta: true })} />
                      <Check />
                    </label>
                  </td>
                )}
                <td className="dr-col-name">
                  <div className="dr-namecell">
                    <KindIcon kind={it.kind} size={20} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6, minWidth: 0 }}>
                        {nameCell(row)}
                        {it.locked && <Lock className="dr-ico-lock" aria-label="Locked" />}
                        {row.shareCount > 0 && (
                          <span className="dr-sharecount" title={`${row.shareCount} explicit share${row.shareCount === 1 ? '' : 's'}`}>
                            <Users />
                            {row.shareCount}
                          </span>
                        )}
                      </div>
                      <div className="dr-namecell__sub dr-show-sm">
                        <UserChip userId={it.ownerId} size={14} /> · {relativeTime(it.modifiedAt)}
                        {!isFolder && ` · ${formatBytes(it.sizeBytes)}`}
                      </div>
                    </div>
                  </div>
                </td>
                {showLocation && loc && (
                  <td className="dr-hide-sm">
                    <Link to={loc.href} className="dr-loc truncate" onClick={(e) => e.stopPropagation()} title={loc.label}>
                      <Folder /> {loc.label}
                    </Link>
                  </td>
                )}
                {trash ? (
                  <>
                    <td className="dr-hide-sm muted text-sm" title={it.trashedAt ? new Date(it.trashedAt).toLocaleString() : undefined}>
                      {it.trashedAt ? relativeTime(it.trashedAt) : '—'}
                      {it.trashedBy && (
                        <>
                          {' '}
                          by <UserChip userId={it.trashedBy} size={14} />
                        </>
                      )}
                    </td>
                    <td>
                      {it.retention !== 'none' ? (
                        <span className="badge badge--info" title="Retention policy prevents automatic purge">
                          Kept · retention
                        </span>
                      ) : (
                        <span className={cx('badge', trashDaysLeft(it) <= 5 ? 'badge--danger' : 'badge--muted')}>{trashDaysLeft(it)}d left</span>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="dr-hide-sm">
                      <UserChip userId={it.ownerId} size={20} />
                    </td>
                    <td className="dr-hide-xs muted text-sm" title={formatDateTime(it.modifiedAt)}>
                      {relativeTime(it.modifiedAt)}
                    </td>
                    <td className="dr-hide-sm muted text-sm mono">{isFolder ? '—' : formatBytes(it.sizeBytes)}</td>
                    <td>
                      <SensitivityPill sensitivity={it.sensitivity} compact />
                    </td>
                  </>
                )}
                <td className="dr-col-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="dr-rowactions">
                    {trash ? (
                      <>
                        <button type="button" className="btn btn--sm" onClick={() => trash.onRestore(row)}>
                          <RotateCcw /> Restore
                        </button>
                        <span data-tip={it.retention !== 'none' ? `Retention “${it.retention}” prevents deletion` : undefined}>
                          <button type="button" className="btn btn--sm btn--danger" disabled={it.retention !== 'none'} onClick={() => trash.onDelete(row)}>
                            <Trash2 /> Delete forever
                          </button>
                        </span>
                      </>
                    ) : (
                      onStar && (
                        <button type="button" className={cx('dr-star', starred(row) && 'is-on')} aria-label={starred(row) ? 'Remove from starred' : 'Add to starred'} aria-pressed={starred(row)} onClick={() => onStar(row)}>
                          <Star />
                        </button>
                      )
                    )}
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={`More actions for ${it.name}`} onClick={(e) => onMenu(row, anchorBelow(e.currentTarget))}>
                      <MoreHorizontal />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Tiny visual for grid tiles: a hint of the file's content. */
function TilePreview({ item }: { item: DriveItem }) {
  const p = item.preview;
  if (p.type === 'image' && p.gradient) return <div className="dr-tilepv dr-tilepv--image" style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }} />;
  if (p.type === 'table' && p.rows) {
    return (
      <div className="dr-tilepv dr-tilepv--table">
        {p.rows.slice(0, 4).map((r, i) => (
          <div key={i} className="dr-tilepv__row">
            {r.slice(0, 4).map((c, j) => (
              <span key={j} className={cx(i === 0 && 'is-head')}>
                {c || ' '}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (p.type === 'slides' && p.slides) {
    return (
      <div className="dr-tilepv dr-tilepv--slides" style={{ '--kind': KIND_META.slides.color } as CSSProperties}>
        <div className="dr-tilepv__slide">
          <b>{p.slides[0]}</b>
          <span>{p.slides.length} slides</span>
        </div>
      </div>
    );
  }
  const text = (p.content ?? '').split('\n').filter(Boolean).slice(0, 7);
  return (
    <div className={cx('dr-tilepv dr-tilepv--text', p.type === 'code' && 'mono')}>
      {text.length ? text.map((l, i) => <div key={i} className={cx('dr-tilepv__line', l.startsWith('#') && 'is-head')}>{l.replace(/^#+\s*/, '').replace(/[*_`]/g, '')}</div>) : <div className="dr-tilepv__empty">{KIND_META[item.kind].label}</div>}
    </div>
  );
}

// ───────────────────────── move picker ─────────────────────────

export function MovePickerModal({ itemIds, open, onClose, onMoved }: { itemIds: string[]; open: boolean; onClose: () => void; onMoved?: () => void }) {
  const drives = useVisibleDrives();
  const v = useDriveViewer();
  const ctx = useDriveContext();
  const items = useDrive((s) => s.items);
  const moveItem = useDrive((s) => s.moveItem);
  const moving = useMemo(() => items.filter((i) => itemIds.includes(i.id)), [items, itemIds]);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = moving[0];
    setDriveId(first?.driveId ?? drives[0]?.drive.id ?? null);
    setFolderId(first?.parentId ?? null);
  }, [open, moving, drives]);

  const movingSet = useMemo(() => {
    const set = new Set(itemIds);
    const stack = [...itemIds];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const child of items) if (child.parentId === cur && !set.has(child.id)) {
        set.add(child.id);
        stack.push(child.id);
      }
    }
    return set;
  }, [itemIds, items]);

  const drive = drives.find((d) => d.drive.id === driveId);
  const folder = folderId ? ctx.items.get(folderId) : undefined;
  const roleHere = useMemo(() => {
    if (!v || !drive) return null;
    if (folder) return access.effectiveRole(v, folder, ctx);
    if (access.canManageDrive(v, drive.drive)) return 'manager';
    return access.shareRole(v, drive.drive.access);
  }, [v, drive, folder, ctx]);
  const children = useMemo(
    () =>
      items
        .filter((i) => i.driveId === driveId && i.parentId === folderId && i.kind === 'folder' && !i.trashed && !movingSet.has(i.id))
        .map((i) => ({ item: i, role: access.effectiveRole(v, i, ctx) }))
        .filter((x) => x.role)
        .sort((a, b) => a.item.name.localeCompare(b.item.name)),
    [items, driveId, folderId, movingSet, v, ctx],
  );
  const crumbs = folder ? [...access.ancestorsOf(folder, ctx).reverse(), folder] : [];
  const sameLocation = moving.length > 0 && moving.every((m) => m.driveId === driveId && m.parentId === folderId);
  const canDrop = access.canEdit(roleHere) && !sameLocation && !(folderId && movingSet.has(folderId));
  const crossDrive = moving.some((m) => m.driveId !== driveId);

  const doMove = () => {
    if (!driveId) return;
    let ok = 0;
    let firstError: string | null = null;
    for (const id of itemIds) {
      const r = moveItem(id, driveId, folderId);
      if (r.ok) ok += 1;
      else firstError ??= r.error;
    }
    const dest = folder?.name ?? drive?.drive.name ?? 'destination';
    if (ok) toast.success(ok === 1 && moving[0] ? `Moved ${moving[0].name} to ${dest}.` : `Moved ${ok} items to ${dest}.`);
    if (firstError) toast.error(firstError);
    if (ok) {
      onMoved?.();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={moving.length === 1 ? `Move “${moving[0].name}”` : `Move ${moving.length} items`}
      subtitle="Pick a destination you can edit. Moving between drives needs manager access on the item."
      icon={
        <span className="dr-modal-icon">
          <FolderInput />
        </span>
      }
      width={620}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <span data-tip={!canDrop ? (sameLocation ? 'Already here' : !roleHere ? 'No access here' : 'You need editor access in the destination') : undefined}>
            <button type="button" className="btn dr-btn-amber" disabled={!canDrop} onClick={doMove}>
              <FolderInput /> Move here{crossDrive && canDrop ? ' (across drives)' : ''}
            </button>
          </span>
        </>
      }
    >
      <div className="dr-mover">
        <div className="dr-mover__drives">
          {drives.map((d) => (
            <button
              key={d.drive.id}
              type="button"
              className={cx('dr-mover__drive', d.drive.id === driveId && 'is-active')}
              onClick={() => {
                setDriveId(d.drive.id);
                setFolderId(null);
              }}
            >
              <span className="dr-drive-emoji" style={{ '--c': d.drive.color } as CSSProperties}>
                {d.drive.icon}
              </span>
              <span className="truncate">{d.drive.name}</span>
            </button>
          ))}
        </div>
        <div className="dr-mover__tree">
          <div className="dr-crumbs dr-crumbs--small">
            <button type="button" className="dr-crumb" onClick={() => setFolderId(null)} disabled={!folderId}>
              {drive?.drive.icon} {drive?.drive.name ?? 'Choose a drive'}
            </button>
            {crumbs.map((c) => (
              <span key={c.id} className="dr-crumbs__seg">
                <ChevronRight />
                <button type="button" className="dr-crumb" onClick={() => setFolderId(c.id)} disabled={c.id === folderId}>
                  {c.name}
                </button>
              </span>
            ))}
          </div>
          <div className="dr-mover__here">
            <RolePill role={roleHere} />
            <span className="text-sm muted">{roleHere ? (access.canEdit(roleHere) ? 'You can move items here.' : 'View-only here — pick another folder.') : 'No access to this location.'}</span>
          </div>
          <div className="dr-mover__list">
            {children.length === 0 && <div className="text-sm muted" style={{ padding: '10px 12px' }}>No sub-folders here.</div>}
            {children.map(({ item: f, role }) => (
              <button key={f.id} type="button" className="dr-mover__folder" onClick={() => setFolderId(f.id)}>
                <Folder style={{ color: KIND_META.folder.color }} />
                <span className="truncate grow">{f.name}</span>
                <RolePill role={role} />
                <ChevronRight className="faint" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
