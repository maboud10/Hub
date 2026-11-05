/**
 * Helix Drive — a Google-Drive-class file manager whose headline is
 * role-based, inherited permissions with sensitivity labels & DLP.
 *
 * Layout: amber top bar (brand · search · + New) over a sidebar (primary nav,
 * shared drives with storage bars, storage meter) and the routed main area.
 */
import '@/styles/drive.css';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { Clock, FileSpreadsheet, FileText, FolderPlus, HardDrive, Home, Inbox, KeyRound, Plus, Presentation, Search, ShieldAlert, Star, Trash2, Upload, Users, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { NEW_FILE_TEMPLATES, formatBytes } from '@/drive/constants';
import { personalDriveId } from '@/drive/seed';
import { folderLink, initDrive, itemLink, useDrive } from '@/drive/store';
import { useAccessRequests, useDriveCaps, useFolder, useStorage, useVisibleDrives, type DriveSearchFilters } from '@/drive/selectors';
import { useNavigate } from 'react-router';
import { AccessRequestsView } from './AccessRequestsView';
import { DriveSettingsDrawer, NewFolderModal, NewSharedDriveModal, TemplateChooser, UploadDialog, type CreateTarget, type TemplateKind } from './DriveDialogs';
import { FileView } from './FileView';
import { FolderView } from './FolderView';
import { GovernanceView } from './GovernanceView';
import { HomeView } from './HomeView';
import { RecentView, SearchResultsView, SharedWithMeView, StarredView, TrashView, hasActiveFilters } from './ListViews';
import { ContextMenu, KindIcon, StorageBar, anchorBelow, type MenuAnchor, type MenuEntry } from './shared';

/** Where "+ New" should create things, derived from the current URL. */
function parseLocation(pathname: string): { driveId?: string; folderId?: string; fileId?: string } {
  const d = /^\/drive\/d\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  if (d) return { driveId: d[1], folderId: d[2] };
  const f = /^\/drive\/file\/([^/]+)/.exec(pathname);
  if (f) return { fileId: f[1] };
  return {};
}

function MyDriveRedirect({ userId }: { userId: string | null }) {
  return <Navigate to={userId ? folderLink(personalDriveId(userId)) : '/drive'} replace />;
}

export function DrivePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const caps = useDriveCaps();
  const meId = useHub((s) => s.sessionUserId);
  const ready = useDrive((s) => Boolean(meId && s.drives.some((d) => d.id === personalDriveId(meId))));

  useEffect(() => {
    initDrive();
  }, [meId]);

  const drives = useVisibleDrives();
  const personal = drives.find((d) => d.drive.kind === 'personal');
  const sharedDrives = drives.filter((d) => d.drive.kind !== 'personal');
  const { toDecide } = useAccessRequests();

  // Current location → creation target (falls back to My Drive when you can't edit here).
  const loc = useMemo(() => parseLocation(location.pathname), [location.pathname]);
  const fileItem = useDrive((s) => (loc.fileId ? s.items.find((i) => i.id === loc.fileId) : undefined));
  const ctxDriveId = loc.driveId ?? fileItem?.driveId ?? personal?.drive.id;
  const ctxFolderId = loc.driveId ? (loc.folderId ?? null) : (fileItem?.parentId ?? null);
  const here = useFolder(ctxDriveId, ctxFolderId);
  const target: CreateTarget | null = here.drive && here.canCreateHere ? { driveId: here.drive.id, folderId: here.folder?.id ?? null, label: here.folder?.name ?? here.drive.name } : personal ? { driveId: personal.drive.id, folderId: null, label: 'My Drive' } : null;
  const storage = useStorage(ctxDriveId);
  const storageDrive = drives.find((d) => d.drive.id === ctxDriveId)?.drive;

  // Search
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<DriveSearchFilters>({});
  const searching = query.trim().length > 0 || hasActiveFilters(filters);
  useEffect(() => {
    setQuery('');
  }, [location.pathname]);

  // Dialogs
  const [newMenu, setNewMenu] = useState<MenuAnchor | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [templateKind, setTemplateKind] = useState<TemplateKind | 'all' | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newDriveOpen, setNewDriveOpen] = useState(false);
  const [settingsDrive, setSettingsDrive] = useState<string | null>(null);
  const createFile = useDrive((s) => s.createFile);

  // Deep links from the launchpad: ?upload=1 · ?new=doc|sheet|slides
  useEffect(() => {
    const up = params.get('upload');
    const nw = params.get('new');
    if (!up && !nw) return;
    if (up) setUploadOpen(true);
    if (nw) setTemplateKind(nw === 'doc' || nw === 'sheet' || nw === 'slides' ? nw : 'all');
    const next = new URLSearchParams(params);
    next.delete('upload');
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const quickCreate = (templateId: string) => {
    if (!target) return;
    const res = createFile(target.driveId, target.folderId, templateId);
    if (toast.result(res, 'Created') && res.itemId) navigate(itemLink(res.itemId));
  };

  const newEntries: MenuEntry[] = useMemo(() => {
    const group = (kind: TemplateKind, label: string) => [
      { id: `lbl-${kind}`, kind: 'label' as const, label },
      ...NEW_FILE_TEMPLATES.filter((t) => t.kind === kind).map((t) => ({ id: t.id, label: t.name, icon: <KindIcon kind={t.kind} size={16} />, hint: t.description, onSelect: () => quickCreate(t.id) })),
    ];
    return [
      { id: 'folder', label: 'New folder', icon: <FolderPlus />, onSelect: () => setNewFolderOpen(true) },
      { id: 'upload', label: 'Upload files', icon: <Upload />, onSelect: () => setUploadOpen(true) },
      { id: 'sep0', kind: 'sep' },
      ...group('doc', 'Documents'),
      ...group('sheet', 'Spreadsheets'),
      ...group('slides', 'Presentations'),
      { id: 'sep1', kind: 'sep' },
      { id: 'tpl', label: 'Browse all templates…', icon: <FileText />, onSelect: () => setTemplateKind('all') },
    ];
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!caps.canUse) {
    return (
      <div className="page dr-page">
        <EmptyState icon={<HardDrive />} title="Drive isn’t enabled for your account">
          Ask IT for the <code>app:drive</code> permission.
        </EmptyState>
      </div>
    );
  }

  const nav = [
    { to: '/drive', label: 'Home', icon: Home, end: true },
    { to: personal ? folderLink(personal.drive.id) : '/drive/my', label: 'My Drive', icon: HardDrive },
    { to: '/drive/shared', label: 'Shared with me', icon: Users },
    { to: '/drive/recent', label: 'Recent', icon: Clock },
    { to: '/drive/starred', label: 'Starred', icon: Star },
    { to: '/drive/trash', label: 'Trash', icon: Trash2 },
    { to: '/drive/requests', label: 'Access requests', icon: Inbox, count: toDecide.length },
    ...(caps.canGovern ? [{ to: '/drive/governance', label: 'Governance', icon: ShieldAlert }] : []),
  ];

  return (
    <div className="page dr-page">
      <header className="dr-top">
        <Link to="/drive" className="dr-top__brand" aria-label="Helix Drive home">
          <span className="dr-top__mark" aria-hidden="true">
            <HardDrive />
          </span>
          <span className="dr-top__text">
            <span className="dr-top__eyebrow">Helix Drive</span>
            <span className="dr-top__title">Files · roles · labels</span>
          </span>
        </Link>
        <div className={cx('dr-search', searching && 'is-active')} role="search">
          <Search aria-hidden="true" />
          <input
            className="dr-search__input"
            value={query}
            placeholder="Search files, folders, tags and contents"
            aria-label="Search Drive"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                setFilters({});
              }
            }}
          />
          {(query || hasActiveFilters(filters)) && (
            <button type="button" className="dr-search__clear" aria-label="Clear search" onClick={() => {
              setQuery('');
              setFilters({});
            }}>
              <X />
            </button>
          )}
          {!searching && (
            <button type="button" className="dr-search__filters" onClick={() => setFilters({ modifiedWithinDays: 30 })} title="Open filters">
              Filters
            </button>
          )}
        </div>
        <button type="button" className="btn dr-btn-amber dr-top__new" aria-haspopup="menu" aria-expanded={Boolean(newMenu)} onClick={(e) => setNewMenu(anchorBelow(e.currentTarget))} disabled={!target} title={target ? `Create in ${target.label}` : 'No writable location'}>
          <Plus /> <span>New</span>
        </button>
      </header>

      <div className="dr-body">
        <aside className="dr-side" aria-label="Drive navigation">
          <nav className="dr-side__nav">
            {nav.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('dr-nav-item', isActive && 'is-active')}>
                  <Icon aria-hidden="true" />
                  <span className="dr-nav-item__label">{n.label}</span>
                  {!!n.count && <span className="dr-nav-item__count">{n.count}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className="dr-side__section">
            <div className="dr-side__label">
              <span>Shared drives</span>
              {caps.canCreateSharedDrive && (
                <button type="button" className="dr-side__add" onClick={() => setNewDriveOpen(true)} title="New shared drive">
                  <Plus /> New
                </button>
              )}
            </div>
            <div className="dr-side__drives">
              {sharedDrives.length === 0 && <div className="text-xs muted" style={{ padding: '4px 10px' }}>{caps.isContractor ? 'Contractors see only files shared with them directly.' : 'No shared drives match your roles yet.'}</div>}
              {sharedDrives.map(({ drive, usedBytes }) => (
                <NavLink key={drive.id} to={folderLink(drive.id)} className={({ isActive }) => cx('dr-drive-link', isActive && 'is-active')} style={{ '--c': drive.color } as CSSProperties} title={`${drive.name} · ${formatBytes(usedBytes)} of ${formatBytes(drive.quotaBytes)}`}>
                  <span className="dr-drive-emoji">{drive.icon}</span>
                  <span className="dr-drive-link__text">
                    <span className="dr-drive-link__name truncate">{drive.name}</span>
                    <StorageBar used={usedBytes} quota={drive.quotaBytes} color={drive.color} compact className="dr-drive-link__bar" />
                  </span>
                  {drive.kind === 'company' && <span className="tag dr-drive-link__tag">all</span>}
                </NavLink>
              ))}
            </div>
          </div>

          {storage && storageDrive && (
            <button type="button" className="dr-side__storage" onClick={() => setSettingsDrive(storageDrive.id)} title="Storage details">
              <div className="row row--between" style={{ gap: 8 }}>
                <span className="dr-side__storage-name truncate">
                  <HardDrive /> {storageDrive.name}
                </span>
                <span className="mono text-xs">{storage.pct}%</span>
              </div>
              <StorageBar used={storage.used} quota={storage.quota} color={storageDrive.color} compact />
              <span className="text-xs muted">
                {formatBytes(storage.used)} of {formatBytes(storage.quota)} used
              </span>
            </button>
          )}
        </aside>

        <main className="dr-main" aria-live="polite">
          {!ready ? (
            <div className="dr-loading">
              <div className="skeleton" style={{ height: 120 }} />
              <div className="skeleton" style={{ height: 220 }} />
            </div>
          ) : searching ? (
            <SearchResultsView query={query} filters={filters} onFilters={setFilters} onClear={() => {
              setQuery('');
              setFilters({});
            }} />
          ) : (
            <Routes>
              <Route index element={<HomeView />} />
              <Route path="my" element={<MyDriveRedirect userId={meId} />} />
              <Route path="d/:driveId" element={<FolderView />} />
              <Route path="d/:driveId/:folderId" element={<FolderView />} />
              <Route path="file/:itemId" element={<FileView />} />
              <Route path="shared" element={<SharedWithMeView />} />
              <Route path="recent" element={<RecentView />} />
              <Route path="starred" element={<StarredView />} />
              <Route path="trash" element={<TrashView />} />
              <Route path="requests" element={<AccessRequestsView />} />
              <Route path="governance" element={<GovernanceView />} />
              <Route path="*" element={<Navigate to="/drive" replace />} />
            </Routes>
          )}
        </main>
      </div>

      <ContextMenu anchor={newMenu} items={newEntries} onClose={() => setNewMenu(null)} width={260} />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} target={target} />
      <TemplateChooser open={templateKind !== null} onClose={() => setTemplateKind(null)} target={target} kind={templateKind ?? 'all'} />
      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} target={target} />
      <NewSharedDriveModal open={newDriveOpen} onClose={() => setNewDriveOpen(false)} />
      <DriveSettingsDrawer driveId={settingsDrive ?? undefined} open={Boolean(settingsDrive)} onClose={() => setSettingsDrive(null)} />
      {/* Icons referenced by the New menu groups keep tree-shaking honest. */}
      <span hidden aria-hidden="true">
        <FileSpreadsheet />
        <Presentation />
        <KeyRound />
      </span>
    </div>
  );
}
