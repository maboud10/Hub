/**
 * Folder view (drive roots + folders, breadcrumbs as drop targets, View as…) and the
 * Shared / Recent / Starred / Trash collections.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import {
  ArrowUpDown,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  FilePlus2,
  Filter,
  FolderOpen,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  Presentation,
  Share2,
  ShieldAlert,
  Sheet,
  Star,
  Trash2,
  Upload,
  Users,
  ArchiveRestore,
} from 'lucide-react';
import { NeoEmpty, NeoHead, NeoMenu, NeoPopover, NeoSearch, NeoStage, NeoTabs, type MenuEntry } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { pluralize } from '@/lib/format';
import { toast } from '@/store/toast';
import type { Drive, Item, ItemKind, SortKey } from '@/drive/types';
import { useDrive } from '@/drive/store';
import { DAY, RANK, atLeast, formatBytes } from '@/drive/meta';
import {
  ancestors,
  childrenOf,
  directShareFor,
  driveAccess,
  driveLabel,
  folderSize,
  isTrashed,
  principalMembers,
  roleViewer,
  trashedRoot,
  viewerOf,
  type EngineCtx,
  type Viewer,
} from '@/drive/access';
import { overlayOpen, useDriveUI, type DriveUI } from './ctx';
import { DriveGlyph, LabelChip } from './bits';
import { Browser } from './Browser';
import { useDropTarget } from './dnd';
import { RequestScreen } from './FileView';
import { useItemActions } from './menu';

/* ---------------- helpers ---------------- */

const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = { name: 'asc', updated: 'desc', size: 'desc', owner: 'asc' };

export function sortItems(items: Item[], sort: SortKey, dir: 'asc' | 'desc', ctx: EngineCtx, foldersFirst = true): Item[] {
  const mul = dir === 'asc' ? 1 : -1;
  const size = (i: Item) => (i.kind === 'folder' ? folderSize(ctx, i) : i.size);
  const owner = (i: Item) => ctx.user.get(i.ownerId)?.name ?? '';
  return [...items].sort((a, b) => {
    if (foldersFirst && (a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * mul;
      case 'updated':
        return (a.updatedAt - b.updatedAt) * mul;
      case 'size':
        return (size(a) - size(b)) * mul;
      default:
        return owner(a).localeCompare(owner(b)) * mul || a.name.localeCompare(b.name);
    }
  });
}

const KIND_FILTERS: { value: 'all' | 'folder' | 'docs' | 'sheets' | 'slides' | 'pdf' | 'media' | 'code' | 'archive'; label: string; kinds: ItemKind[] | null }[] = [
  { value: 'all', label: 'All types', kinds: null },
  { value: 'folder', label: 'Folders', kinds: ['folder'] },
  { value: 'docs', label: 'Documents', kinds: ['doc', 'text'] },
  { value: 'sheets', label: 'Spreadsheets', kinds: ['sheet'] },
  { value: 'slides', label: 'Presentations', kinds: ['slides'] },
  { value: 'pdf', label: 'PDFs', kinds: ['pdf'] },
  { value: 'media', label: 'Images & media', kinds: ['image', 'video', 'audio'] },
  { value: 'code', label: 'Code', kinds: ['code'] },
  { value: 'archive', label: 'Archives & other', kinds: ['archive', 'other'] },
];
type KindFilter = (typeof KIND_FILTERS)[number]['value'];

function useLocalFilter(items: Item[], ui: DriveUI) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    const kinds = KIND_FILTERS.find((k) => k.value === kind)?.kinds;
    return items.filter((i) => (!kinds || kinds.includes(i.kind)) && (!t || i.name.toLowerCase().includes(t) || i.tags.some((g) => g.includes(t)) || (ui.engine.ctx.user.get(i.ownerId)?.name.toLowerCase().includes(t) ?? false)));
  }, [items, text, kind, ui.engine.ctx]);
  return { text, setText, kind, setKind, filtered };
}

export function NewMenu({ disabled, compact }: { disabled?: boolean; compact?: boolean }) {
  const ui = useDriveUI();
  const items: MenuEntry[] = [
    { label: 'New folder', icon: <FolderPlus />, hint: 'C', onSelect: () => ui.create('folder') },
    { label: 'Upload files', icon: <Upload />, hint: 'U', onSelect: () => ui.pickFiles() },
    { kind: 'sep' },
    { label: 'Document', icon: <FilePlus2 />, onSelect: () => ui.create('doc') },
    { label: 'Spreadsheet', icon: <Sheet />, onSelect: () => ui.create('sheet') },
    { label: 'Presentation', icon: <Presentation />, onSelect: () => ui.create('slides') },
  ];
  return (
    <NeoMenu
      label="Create"
      items={items}
      width={230}
      trigger={(p) => (
        <button {...p} type="button" className="neo-btn neo-btn--plasma" data-qa="new" disabled={disabled} data-tip={disabled ? 'You can’t add things here — new items go to My Drive' : undefined}>
          <FilePlus2 />
          {!compact && <span className="neo-btn__label">New</span>}
        </button>
      )}
    />
  );
}

function BrowseToolbar({ filter, setFilter, kind, setKind, left, inputRef, count }: { filter: string; setFilter: (v: string) => void; kind: KindFilter; setKind: (k: KindFilter) => void; left?: ReactNode; inputRef: React.RefObject<HTMLInputElement | null>; count: number }) {
  const ui = useDriveUI();
  const { prefs, setPrefs } = ui;
  const sortItemsMenu: MenuEntry[] = (['name', 'updated', 'size', 'owner'] as SortKey[]).map((k) => ({
    label: { name: 'Name', updated: 'Last modified', size: 'Size', owner: 'Owner' }[k],
    checked: prefs.sort === k,
    onSelect: () => setPrefs({ sort: k, dir: prefs.sort === k ? (prefs.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[k] }),
  }));
  sortItemsMenu.push({ kind: 'sep' }, { label: prefs.dir === 'asc' ? 'Ascending' : 'Descending', icon: <ArrowUpDown />, onSelect: () => setPrefs({ dir: prefs.dir === 'asc' ? 'desc' : 'asc' }) });
  const kindLabel = KIND_FILTERS.find((k) => k.value === kind)?.label ?? 'All types';
  return (
    <div className="neo-toolbar dv-toolbar">
      {left}
      <NeoSearch value={filter} onChange={setFilter} placeholder={`Filter ${count} items…`} kbd="S" size="sm" inputRef={inputRef} className="dv-filter" label="Filter items" />
      <NeoMenu
        label="Type"
        width={210}
        items={KIND_FILTERS.map((k) => ({ label: k.label, checked: kind === k.value, onSelect: () => setKind(k.value) }))}
        trigger={(p) => (
          <button {...p} type="button" className={cx('neo-btn neo-btn--sm', kind !== 'all' ? 'neo-btn--soft' : 'neo-btn--ghost')}>
            <Filter /> <span className="dv-hide-sm">{kindLabel}</span>
          </button>
        )}
      />
      <span className="grow" />
      <NeoMenu
        label="Sort"
        width={200}
        items={sortItemsMenu}
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm" aria-label="Sort">
            <ArrowUpDown /> <span className="dv-hide-sm">{{ name: 'Name', updated: 'Modified', size: 'Size', owner: 'Owner' }[prefs.sort]}</span>
          </button>
        )}
      />
      <NeoTabs
        label="View"
        value={prefs.view}
        onChange={(v) => setPrefs({ view: v })}
        items={[
          { value: 'grid', label: <span className="neo-sr">Grid</span>, icon: <LayoutGrid />, title: 'Grid view' },
          { value: 'list', label: <span className="neo-sr">List</span>, icon: <List />, title: 'List view' },
        ]}
        className="dv-viewtabs"
      />
      <button type="button" className={cx('neo-iconbtn', prefs.details && 'is-on')} onClick={() => setPrefs({ details: !prefs.details })} aria-label="Details panel" aria-pressed={prefs.details} data-tip="Details · I" data-tip-pos="left">
        <Info />
      </button>
    </div>
  );
}

/* ---------------- breadcrumbs ---------------- */

function Crumb({ to, label, place, icon, current }: { to: string; label: string; place: { driveId: string; parentId: string | null } | null; icon?: ReactNode; current?: boolean }) {
  const drop = useDropTarget(`crumb:${place?.driveId}:${place?.parentId ?? 'root'}`, current ? null : place);
  if (current)
    return (
      <span className="dv-crumb is-current" aria-current="page">
        {icon}
        <span className="truncate">{label}</span>
      </span>
    );
  return (
    <Link ref={drop.ref} to={to} className={cx('dv-crumb', drop.cls)}>
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Breadcrumbs({ drive, folder, ui }: { drive: Drive; folder: Item | null; ui: DriveUI }) {
  const { ctx, me } = ui.engine;
  const chain = folder ? [...ancestors(ctx, folder)].reverse() : [];
  const visible = chain.filter((a) => ui.engine.access(a).level !== 'none');
  const hidden = chain.length - visible.length;
  const segs = visible.slice(-2);
  const collapsed = visible.length - segs.length + hidden;
  return (
    <nav className="dv-crumbs" aria-label="Breadcrumb">
      <Crumb to={`/drive/d/${drive.id}`} label={driveLabel(ctx, drive, me.id)} place={{ driveId: drive.id, parentId: null }} current={!folder} />
      {collapsed > 0 && (
        <>
          <ChevronRight className="dv-crumbs__sep" />
          <span className="dv-crumb is-gap" title={chain.slice(0, chain.length - segs.length).map((c) => c.name).join(' / ')}>
            …
          </span>
        </>
      )}
      {segs.map((a) => (
        <span key={a.id} className="dv-crumbs__seg">
          <ChevronRight className="dv-crumbs__sep" />
          <Crumb to={`/drive/d/${drive.id}/${a.id}`} label={a.name} place={{ driveId: drive.id, parentId: a.id }} />
        </span>
      ))}
      {folder && (
        <span className="dv-crumbs__seg">
          <ChevronRight className="dv-crumbs__sep" />
          <Crumb to="#" label={folder.name} place={null} current />
        </span>
      )}
    </nav>
  );
}

/* ---------------- View as… ---------------- */

function ViewAsButton({ ui }: { ui: DriveUI }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'people' | 'roles'>('people');
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const { ctx } = ui.engine;
  const people = ctx.users.filter((u) => u.active && u.id !== ui.engine.me.id && `${u.name} ${u.title} ${u.department}`.toLowerCase().includes(q.toLowerCase()));
  const roles = ctx.roles.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const pick = (v: Viewer) => {
    ui.setViewAs(v);
    setOpen(false);
    setQ('');
  };
  if (ui.viewAs)
    return (
      <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => ui.setViewAs(null)} data-qa="exit-viewas">
        <EyeOff /> <span className="neo-btn__label">Exit view as</span>
      </button>
    );
  return (
    <>
      <button ref={btn} type="button" className="neo-iconbtn" aria-label="View as…" data-tip="View as… — preview what someone else sees" data-tip-pos="bottom" onClick={() => setOpen((o) => !o)} data-qa="viewas" aria-expanded={open}>
        <Eye />
      </button>
      <NeoPopover open={open} anchor={btn.current} onClose={() => setOpen(false)} placement="bottom-end" width={320} label="View as">
        <div className="neo-pop__search dv-viewas__head">
          <div className="neo-hud neo-hud--tint" style={{ marginBottom: 8 }}>
            View this folder as…
          </div>
          <NeoTabs
            label="Viewer type"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'people', label: 'People' },
              { value: 'roles', label: 'Roles' },
            ]}
          />
          <div style={{ marginTop: 8 }}>
            <NeoSearch value={q} onChange={setQ} placeholder={tab === 'people' ? 'Search people…' : 'Search roles…'} size="sm" autoFocus />
          </div>
        </div>
        <div role="listbox" aria-label={tab === 'people' ? 'People' : 'Roles'}>
          {tab === 'people'
            ? people.slice(0, 40).map((u) => (
                <button key={u.id} type="button" role="option" aria-selected={false} className="neo-menu__item" onClick={() => pick(viewerOf(u, ctx.roles))}>
                  <Avatar user={u} size={26} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>
                      {u.name}
                    </span>
                    <span className="truncate" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>
                      {u.title}
                    </span>
                  </span>
                  {u.roleIds.includes('contractor') && <span className="dv-mini-tag">Contractor</span>}
                </button>
              ))
            : roles.map((r) => (
                <button key={r.id} type="button" role="option" aria-selected={false} className="neo-menu__item" onClick={() => pick(roleViewer(r.id, ctx.roles))}>
                  <span className="dv-pglyph" style={{ ['--p' as string]: r.color, width: 26, height: 26 }}>
                    <ShieldAlert />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>
                      {r.name}
                    </span>
                    <span className="truncate" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>
                      {principalMembers(ctx, { type: 'role', id: r.id }).length} people · {r.description}
                    </span>
                  </span>
                </button>
              ))}
        </div>
      </NeoPopover>
    </>
  );
}

function ViewAsBanner({ ui, items }: { ui: DriveUI; items: Item[] }) {
  if (!ui.viewAs) return null;
  const visible = items.filter((i) => ui.engine.access(i, ui.viewAs as Viewer).level !== 'none').length;
  return (
    <div className="dv-viewas" role="status">
      <span className="dv-viewas__orb" />
      <Eye />
      <span className="grow">
        Viewing as <strong>{ui.viewAs.name}</strong>
        {ui.viewAs.contractor ? ' · contractor' : ''} — sees <strong>{visible}</strong> of {items.length} items here. Locked items explain why.
      </span>
      <button type="button" className="neo-btn neo-btn--xs" onClick={() => ui.setViewAs(null)}>
        Exit
      </button>
    </div>
  );
}

/* ---------------- folder view ---------------- */

export function FolderView() {
  const { driveId = '', folderId } = useParams();
  const ui = useDriveUI();
  const actions = useItemActions();
  const { ctx, me } = ui.engine;
  const drive = ctx.drive.get(driveId);
  const folder = (folderId ? ctx.item.get(folderId) : null) ?? null;
  const filterRef = useRef<HTMLInputElement>(null);
  const { prefs, setPrefs } = ui;

  const folderAccess = folder ? ui.engine.access(folder) : null;
  const rootLevel = drive ? driveAccess(ctx, me, drive) : 'none';
  const level = folder ? (folderAccess?.level ?? 'none') : rootLevel;
  const canEdit = atLeast(level, 'editor');
  const canManage = folder ? atLeast(level, 'manager') : atLeast(rootLevel, 'manager');

  useEffect(() => {
    if (!drive) return;
    ui.setPlace(canEdit ? { driveId: drive.id, parentId: folder?.id ?? null } : null);
    return () => ui.setPlace(null);
  }, [drive?.id, folder?.id, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => ui.setViewAs(null), [driveId, folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewAs = ui.viewAs;
  const children = useMemo(() => {
    if (!drive) return [];
    const all = childrenOf(ctx, drive.id, folder?.id ?? null);
    if (viewAs) return all;
    if (!folder && rootLevel === 'none') {
      // Not a member: show the top-most things shared with me inside this drive.
      return ctx.items.filter((i) => {
        if (i.driveId !== drive.id || isTrashed(ctx, i)) return false;
        const a = ui.engine.access(i);
        if (!a.discoverable) return false;
        const parent = i.parentId ? ctx.item.get(i.parentId) : null;
        return !parent || !ui.engine.access(parent).discoverable;
      });
    }
    return all.filter((i) => ui.engine.access(i).discoverable);
  }, [ctx, drive, folder, viewAs, rootLevel, ui.engine]);

  const f = useLocalFilter(children, ui);
  const sorted = useMemo(() => sortItems(f.filtered, prefs.sort, prefs.dir, ctx), [f.filtered, prefs.sort, prefs.dir, ctx]);

  useHotkeys({
    s: (e) => {
      if (overlayOpen()) return;
      e.preventDefault();
      filterRef.current?.focus();
    },
  });

  if (!drive) return <MissingView title="This drive doesn’t exist" />;
  if (folderId && !folder) return <MissingView title="This folder doesn’t exist" />;
  if (folder && folder.kind !== 'folder') return <Navigate to={`/drive/file/${folder.id}`} replace />;
  if (folder && folder.driveId !== drive.id) return <Navigate to={`/drive/d/${folder.driveId}/${folder.id}`} replace />;
  if (folder && folderAccess?.level === 'none') return <RequestScreen item={folder} />;
  if (!folder && drive.kind === 'personal' && drive.ownerId !== me.id) return <MissingView title="This personal drive is private" text="Personal drives are visible only to their owner. Ask them to share specific files with you." />;

  const trashedAt = folder ? trashedRoot(ctx, folder) : null;
  const members = drive.members.reduce((n, m) => n + (m.principal.type === 'user' ? 1 : principalMembers(ctx, m.principal).length), 0);
  const canViewAs = me.admin || canManage || (drive.kind === 'personal' && drive.ownerId === me.id);
  const total = folder ? folderSize(ctx, folder) : children.reduce((s, i) => s + (i.kind === 'folder' ? folderSize(ctx, i) : i.size), 0);
  const eyebrow = drive.kind === 'personal' ? 'Personal drive · only you' : `Shared drive · ${pluralize(members, 'person', 'people')}`;
  const notMember = !folder && rootLevel === 'none';

  const headerMenu: MenuEntry[] = folder
    ? actions.menuFor([folder], { hideOpen: true, onDetails: () => setPrefs({ details: true }) })
    : [
        { label: 'Drive members', icon: <Users />, disabled: !(canManage || me.admin) || drive.kind === 'personal', onSelect: () => ui.open({ type: 'members', driveId: drive.id }) },
        { label: 'Details', icon: <Info />, hint: 'I', onSelect: () => setPrefs({ details: true }) },
      ];

  const empty = (
    <div className="neo-drop dv-emptydrop">
      <NeoEmpty icon={<FolderOpen />} title={f.text || f.kind !== 'all' ? 'Nothing matches your filter' : canEdit ? 'Drop files here' : 'Nothing here yet'} action={
        f.text || f.kind !== 'all' ? (
          <button type="button" className="neo-btn neo-btn--sm" onClick={() => (f.setText(''), f.setKind('all'))}>
            Clear filter
          </button>
        ) : canEdit ? (
          <div className="row row--wrap" style={{ gap: 8, justifyContent: 'center' }}>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => ui.pickFiles()}>
              <Upload /> Upload files
            </button>
            <button type="button" className="neo-btn neo-btn--sm" onClick={() => ui.create('folder')}>
              <FolderPlus /> New folder
            </button>
            <button type="button" className="neo-btn neo-btn--sm" onClick={() => ui.create('doc')}>
              <FilePlus2 /> New document
            </button>
          </div>
        ) : undefined
      }>
        {f.text || f.kind !== 'all' ? 'Try another word or type.' : canEdit ? 'Drag files from your computer anywhere on this page, or create something new.' : 'You can view this folder but not add to it.'}
      </NeoEmpty>
    </div>
  );

  const top = (
    <>
      <ViewAsBanner ui={ui} items={children} />
      {notMember && (
        <div className="dv-banner">
          <Lock />
          <span>
            You’re not a member of <strong>{drive.name}</strong> — you only see what’s been shared with you here.
          </span>
        </div>
      )}
      {trashedAt && (
        <div className="dv-banner dv-banner--warn">
          <Trash2 />
          <span className="grow">This folder is in the trash.</span>
          <button type="button" className="neo-btn neo-btn--xs" onClick={() => toast.result(useDrive.getState().restore([trashedAt.id]))}>
            <ArchiveRestore /> Restore
          </button>
        </div>
      )}
      {(folder?.hold || (!folder && drive.hold)) && (
        <div className="dv-banner dv-banner--hold">
          <ShieldAlert />
          <span>
            Legal hold: <strong>{(folder?.hold ?? drive.hold)?.reason}</strong> — nothing here can be deleted.
          </span>
        </div>
      )}
    </>
  );

  return (
    <NeoStage label="Folder">
      <NeoHead
        icon={<DriveGlyph drive={drive} size={42} />}
        className="dv-head"
        eyebrow={eyebrow}
        title={<Breadcrumbs drive={drive} folder={folder} ui={ui} />}
        sub={
          <span className="row" style={{ gap: 8 }}>
            <span>
              {pluralize(children.length, 'item')} · {formatBytes(total)}
            </span>
            {folder && <LabelChip label={folder.label} quiet />}
            {folder && !folder.inherit && <span className="dv-mini-tag">Inheritance restricted</span>}
          </span>
        }
        onToggleSide={ui.toggleSide}
        actions={
          <>
            {canViewAs && <ViewAsButton ui={ui} />}
            {folder ? (
              <button type="button" className="neo-btn neo-btn--soft dv-hide-xs" onClick={() => ui.open({ type: 'share', itemId: folder.id, tab: canManage ? 'share' : 'xray' })} data-qa="share-folder">
                <Share2 /> <span className="neo-btn__label">{canManage ? 'Share' : 'Access'}</span>
              </button>
            ) : drive.kind === 'shared' ? (
              <button type="button" className="neo-btn neo-btn--soft dv-hide-xs" onClick={() => ui.open({ type: 'members', driveId: drive.id })} disabled={!(canManage || me.admin)} data-tip={!(canManage || me.admin) ? 'Only drive managers can change members' : undefined}>
                <Users /> <span className="neo-btn__label">Members</span>
              </button>
            ) : null}
            <NewMenu disabled={false} />
          </>
        }
      />
      <BrowseToolbar
        filter={f.text}
        setFilter={f.setText}
        kind={f.kind}
        setKind={f.setKind}
        inputRef={filterRef}
        count={children.length}
        left={
          <NeoMenu
            label="Folder actions"
            items={headerMenu}
            trigger={(p) => (
              <button {...p} type="button" className="neo-iconbtn" aria-label="Folder actions">
                <MoreHorizontal />
              </button>
            )}
          />
        }
      />
      <Browser
        key={`${driveId}/${folderId ?? ''}`}
        items={sorted}
        view={prefs.view}
        mode="folder"
        viewAs={viewAs}
        sort={prefs.sort}
        dir={prefs.dir}
        onSort={(k) => setPrefs({ sort: k, dir: prefs.sort === k ? (prefs.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[k] })}
        empty={empty}
        inspector={prefs.details}
        onInspector={(o) => setPrefs({ details: o })}
        fallback={folder ?? null}
        top={top}
      />
    </NeoStage>
  );
}

export function MissingView({ title, text }: { title: string; text?: string }) {
  return (
    <NeoStage>
      <NeoHead icon={<FolderOpen />} eyebrow="Helix Drive" title="Not found" />
      <div className="neo-body">
        <NeoEmpty icon={<FolderOpen />} title={title} action={<Link className="neo-btn neo-btn--sm" to="/drive">Back to Drive home</Link>}>
          {text ?? 'It may have been deleted or moved somewhere you can’t see.'}
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}

/* ---------------- collections ---------------- */

type CollectionMode = 'shared' | 'recent' | 'starred' | 'trash';

const COLLECTION: Record<CollectionMode, { title: string; icon: ReactNode; sub: string; emptyTitle: string; emptyText: string }> = {
  shared: { title: 'Shared with me', icon: <Users />, sub: 'Files and folders people shared with you directly.', emptyTitle: 'Nothing shared with you yet', emptyText: 'When someone shares a file or folder with you, it shows up here.' },
  recent: { title: 'Recent', icon: <Clock3 />, sub: 'What you opened and edited lately.', emptyTitle: 'No recent files', emptyText: 'Files you open or edit appear here.' },
  starred: { title: 'Starred', icon: <Star />, sub: 'Your shortcuts to what matters.', emptyTitle: 'No starred files', emptyText: 'Star files and folders to keep them one click away.' },
  trash: { title: 'Trash', icon: <Trash2 />, sub: '', emptyTitle: 'Trash is empty', emptyText: 'Deleted files stay here before they’re purged.' },
};

function dayGroup(ts: number, now: number): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  if (ts >= t0) return 'Today';
  if (ts >= t0 - DAY) return 'Yesterday';
  if (ts >= t0 - 6 * DAY) return 'Earlier this week';
  if (ts >= t0 - 30 * DAY) return 'Earlier this month';
  return 'Older';
}

export function CollectionView({ mode }: { mode: CollectionMode }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const recents = useDrive((s) => s.recents[me.id]);
  const filterRef = useRef<HTMLInputElement>(null);
  const { prefs, setPrefs } = ui;
  const meta = COLLECTION[mode];

  const { items, when } = useMemo(() => {
    const when = new Map<string, number>();
    let list: Item[] = [];
    if (mode === 'shared') {
      for (const i of ctx.items) {
        if (isTrashed(ctx, i)) continue;
        const a = ui.engine.access(i);
        const s = directShareFor(ctx, me, a);
        if (s) {
          list.push(i);
          when.set(i.id, s.at);
        }
      }
    } else if (mode === 'recent') {
      for (const r of recents ?? []) when.set(r.id, Math.max(when.get(r.id) ?? 0, r.at));
      for (const i of ctx.items) {
        if (i.kind === 'folder') continue;
        const mine = i.activity.find((a) => a.by === me.id && (a.verb === 'version' || a.verb === 'created' || a.verb === 'uploaded' || a.verb === 'commented'));
        if (mine) when.set(i.id, Math.max(when.get(i.id) ?? 0, mine.at));
      }
      list = [...when.keys()].map((id) => ctx.item.get(id)).filter((i): i is Item => !!i && i.kind !== 'folder' && !isTrashed(ctx, i) && ui.engine.access(i).level !== 'none');
    } else if (mode === 'starred') {
      list = ctx.items.filter((i) => i.starredBy.includes(me.id) && !isTrashed(ctx, i) && ui.engine.access(i).level !== 'none');
    } else {
      list = ctx.items.filter((i) => i.trashed && trashedRoot(ctx, i)?.id === i.id && RANK[ui.engine.access(i).level] >= RANK.editor);
      list.forEach((i) => when.set(i.id, i.trashed?.at ?? 0));
    }
    return { items: list, when };
  }, [mode, ctx, me, recents, ui.engine]);

  const f = useLocalFilter(items, ui);
  const sorted = useMemo(() => {
    if (mode === 'recent' || mode === 'trash' || (mode === 'shared' && prefs.sort === 'updated')) return [...f.filtered].sort((a, b) => (when.get(b.id) ?? b.updatedAt) - (when.get(a.id) ?? a.updatedAt));
    return sortItems(f.filtered, prefs.sort, prefs.dir, ctx, mode !== 'starred');
  }, [f.filtered, mode, prefs.sort, prefs.dir, ctx, when]);
  const groups = useMemo(() => {
    if (mode !== 'recent') return undefined;
    const order = ['Today', 'Yesterday', 'Earlier this week', 'Earlier this month', 'Older'];
    const map = new Map<string, string[]>(order.map((o) => [o, []]));
    for (const i of sorted) map.get(dayGroup(when.get(i.id) ?? i.updatedAt, ctx.now))?.push(i.id);
    return order.map((label) => ({ label, ids: map.get(label) ?? [] }));
  }, [mode, sorted, when, ctx.now]);

  useHotkeys({
    s: (e) => {
      if (overlayOpen()) return;
      e.preventDefault();
      filterRef.current?.focus();
    },
  });

  const purgeable = mode === 'trash' ? items.filter((i) => ui.engine.caps(i).purge) : [];
  const trashSub = `Items are deleted forever after ${ctx.policy.trashDays} days. Legal holds keep them safe.`;

  return (
    <NeoStage label={meta.title}>
      <NeoHead
        icon={meta.icon}
        eyebrow="Helix Drive"
        title={meta.title}
        sub={mode === 'trash' ? trashSub : `${pluralize(items.length, 'item')} · ${meta.sub}`}
        onToggleSide={ui.toggleSide}
        actions={
          mode === 'trash' ? (
            <button type="button" className="neo-btn neo-btn--danger" disabled={!purgeable.length} onClick={() => ui.open({ type: 'purge', ids: purgeable.map((i) => i.id) })} data-qa="empty-trash">
              <Trash2 /> <span className="neo-btn__label">Empty trash</span>
            </button>
          ) : (
            <NewMenu />
          )
        }
      />
      <BrowseToolbar filter={f.text} setFilter={f.setText} kind={f.kind} setKind={f.setKind} inputRef={filterRef} count={items.length} />
      <Browser
        key={mode}
        items={sorted}
        view={mode === 'trash' ? 'list' : prefs.view}
        mode={mode === 'trash' ? 'trash' : 'collection'}
        showLocation
        groups={groups}
        sort={prefs.sort}
        dir={prefs.dir}
        onSort={mode === 'recent' || mode === 'trash' ? undefined : (k) => setPrefs({ sort: k, dir: prefs.sort === k ? (prefs.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[k] })}
        empty={
          <NeoEmpty icon={meta.icon} title={f.text ? 'Nothing matches your filter' : meta.emptyTitle} action={mode === 'starred' || mode === 'recent' ? <Link to="/drive/my" className="neo-btn neo-btn--sm">Open My Drive</Link> : undefined}>
            {f.text ? 'Try another word.' : meta.emptyText}
          </NeoEmpty>
        }
        inspector={prefs.details}
        onInspector={(o) => setPrefs({ details: o })}
      />
    </NeoStage>
  );
}

