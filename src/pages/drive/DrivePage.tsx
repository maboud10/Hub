/**
 * Helix Drive — "Holo Vault". App shell: rail, Spaces side panel (drive/folder tree with drop
 * targets + storage meter), nested routes, drag & drop (items → folders, OS files → upload),
 * upload tray, Undo dock, global shortcuts and the dialog host.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Check, ChevronRight, Clock3, FolderOpen, HardDrive, House, KeyRound, Plus, ShieldCheck, Star, Trash2, Upload, Users, X } from 'lucide-react';
import '@/styles/neo.css';
import '@/styles/drive.css';
import { Bar, NeoRail, NeoSide, NeoSideGroup, NeoWorkspace } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import type { Item, Place } from '@/drive/types';
import { useDrive, type UploadInput } from '@/drive/store';
import { personalDriveId } from '@/drive/seed';
import { formatBytes, isTextLike } from '@/drive/meta';
import { childrenOf, directShareFor, driveAccess, driveLabel, driveUsage, isTrashed, type Viewer } from '@/drive/access';
import { DriveUIContext, overlayOpen, useEngineValue, usePrefsFor, useUndo, type DialogState, type DriveUI, type Engine } from './ctx';
import { DriveGlyph, KindTile, UndoDock } from './bits';
import { canDropAt, useDropTarget } from './dnd';
import { HomeView } from './HomeView';
import { CollectionView, FolderView, MissingView } from './Views';
import { FileView } from './FileView';
import { ShareDialog } from './ShareDialog';
import { ChannelDialog, LabelDialog, MembersSheet, MoveDialog, NewDriveDialog, PurgeDialog, QuickLook, RenameDialog, TaskDialog, UploadDialog } from './Dialogs';
import { RequestsView } from './RequestsView';
import { GovernanceView } from './GovernanceView';

const TINT = { c1: '#fbbf24', c2: '#f97316', on: '#1a1205' };
const MB = 1024 * 1024;

interface Job {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'reading' | 'uploading' | 'done' | 'error';
  start: number;
  duration: number;
  input?: UploadInput;
  itemId?: string;
  error?: string;
  place: Place;
}

function readFile(f: File): Promise<UploadInput> {
  const input: UploadInput = { name: f.name, size: f.size, mime: f.type };
  const read = (kind: 'dataURL' | 'text') =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => reject(r.error);
      if (kind === 'dataURL') r.readAsDataURL(f);
      else r.readAsText(f);
    });
  if (f.type.startsWith('image/') && f.size <= 2 * MB) return read('dataURL').then((d) => ({ ...input, dataUrl: d })).catch(() => input);
  if (isTextLike(f.name, f.type) && f.size <= 200 * 1024) return read('text').then((t) => ({ ...input, text: t })).catch(() => input);
  return Promise.resolve(input);
}

/* ---------------- Spaces tree ---------------- */

function TreeNode({ ui, item, depth, activeFolder, expanded, toggle }: { ui: DriveUI; item: Item; depth: number; activeFolder: string | null; expanded: Set<string>; toggle: (id: string) => void }) {
  const navigate = useNavigate();
  const { ctx } = ui.engine;
  const kids = childrenOf(ctx, item.driveId, item.id).filter((c) => c.kind === 'folder' && ui.engine.access(c).discoverable);
  const open = expanded.has(item.id);
  const drop = useDropTarget(`tree:${item.id}`, { driveId: item.driveId, parentId: item.id });
  return (
    <>
      <div ref={drop.ref} className={cx('dv-tree__row', activeFolder === item.id && 'is-active', drop.cls)} style={{ '--depth': depth } as CSSProperties}>
        <button type="button" className={cx('dv-tree__chev', open && 'is-open', !kids.length && 'is-empty')} onClick={() => toggle(item.id)} aria-label={open ? `Collapse ${item.name}` : `Expand ${item.name}`} tabIndex={kids.length ? 0 : -1}>
          <ChevronRight />
        </button>
        <button type="button" className="dv-tree__label" onClick={() => navigate(`/drive/d/${item.driveId}/${item.id}`)} aria-current={activeFolder === item.id ? 'page' : undefined}>
          <span className="dv-tree__dot" style={{ background: item.color ?? ctx.drive.get(item.driveId)?.color }} />
          <span className="truncate">{item.name}</span>
        </button>
      </div>
      {open && kids.map((k) => <TreeNode key={k.id} ui={ui} item={k} depth={depth + 1} activeFolder={activeFolder} expanded={expanded} toggle={toggle} />)}
    </>
  );
}

function DriveNode({ ui, driveId, activeDrive, activeFolder, expanded, toggle, label }: { ui: DriveUI; driveId: string; activeDrive: string | null; activeFolder: string | null; expanded: Set<string>; toggle: (id: string) => void; label?: string }) {
  const navigate = useNavigate();
  const { ctx, me } = ui.engine;
  const drive = ctx.drive.get(driveId);
  const drop = useDropTarget(`tree:root:${driveId}`, drive ? { driveId, parentId: null } : null);
  if (!drive) return null;
  const kids = childrenOf(ctx, driveId, null).filter((c) => c.kind === 'folder' && ui.engine.access(c).discoverable);
  const open = expanded.has(driveId);
  const active = activeDrive === driveId && !activeFolder;
  return (
    <>
      <div ref={drop.ref} className={cx('dv-tree__row is-drive', active && 'is-active', drop.cls)} style={{ '--depth': 0 } as CSSProperties}>
        <button type="button" className={cx('dv-tree__chev', open && 'is-open', !kids.length && 'is-empty')} onClick={() => toggle(driveId)} aria-label={open ? 'Collapse' : 'Expand'} tabIndex={kids.length ? 0 : -1}>
          <ChevronRight />
        </button>
        <button type="button" className="dv-tree__label" onClick={() => navigate(`/drive/d/${driveId}`)} aria-current={active ? 'page' : undefined}>
          <DriveGlyph drive={drive} size={22} />
          <span className="truncate">{label ?? driveLabel(ctx, drive, me.id)}</span>
          {drive.hold && <span className="dv-tree__hold" data-tip="Legal hold" />}
        </button>
      </div>
      {open && kids.map((k) => <TreeNode key={k.id} ui={ui} item={k} depth={1} activeFolder={activeFolder} expanded={expanded} toggle={toggle} />)}
    </>
  );
}

function SpacesPanel({ ui }: { ui: DriveUI }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { ctx, me } = ui.engine;
  const m = /^\/drive\/d\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  const activeDrive = m?.[1] ?? null;
  const activeFolder = m?.[2] ?? null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([personalDriveId(me.id)]));
  useEffect(() => {
    if (!activeDrive) return;
    setExpanded((s) => {
      const next = new Set(s);
      next.add(activeDrive);
      let f = activeFolder ? ctx.item.get(activeFolder) : undefined;
      while (f?.parentId) {
        next.add(f.parentId);
        f = ctx.item.get(f.parentId);
      }
      return next;
    });
  }, [activeDrive, activeFolder, ctx]);
  const toggle = useCallback((id: string) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);
  const shared = ctx.drives.filter((d) => d.kind === 'shared' && driveAccess(ctx, me, d) !== 'none');
  const sharedFolders = ctx.items.filter((i) => i.kind === 'folder' && !isTrashed(ctx, i) && directShareFor(ctx, me, ui.engine.access(i)));
  const mine = ctx.drive.get(personalDriveId(me.id));
  const used = mine ? driveUsage(ctx, mine.id) : 0;
  return (
    <NeoSide
      title="Spaces"
      label="Spaces"
      className="dv-side"
      actions={
        ui.engine.isAdmin ? (
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="New shared drive" data-tip="New shared drive" data-tip-pos="left" onClick={() => ui.open({ type: 'newDrive' })}>
            <Plus />
          </button>
        ) : undefined
      }
    >
      <div className="dv-tree" role="tree" aria-label="Drives and folders">
        <NeoSideGroup label="Personal">
          <DriveNode ui={ui} driveId={personalDriveId(me.id)} activeDrive={activeDrive} activeFolder={activeFolder} expanded={expanded} toggle={toggle} label="My Drive" />
        </NeoSideGroup>
        <NeoSideGroup label={`Shared drives · ${shared.length}`}>
          {shared.map((d) => (
            <DriveNode key={d.id} ui={ui} driveId={d.id} activeDrive={activeDrive} activeFolder={activeFolder} expanded={expanded} toggle={toggle} />
          ))}
          {!shared.length && <p className="neo-faint text-xs" style={{ padding: '4px 10px' }}>You’re not a member of any shared drive yet.</p>}
        </NeoSideGroup>
        {sharedFolders.length > 0 && (
          <NeoSideGroup label="Shared with me">
            {sharedFolders.map((f) => (
              <div key={f.id} className={cx('dv-tree__row', activeFolder === f.id && 'is-active')} style={{ '--depth': 0 } as CSSProperties}>
                <span className="dv-tree__chev is-empty" />
                <button type="button" className="dv-tree__label" onClick={() => navigate(`/drive/d/${f.driveId}/${f.id}`)}>
                  <KindTile item={f} size={22} />
                  <span className="truncate">{f.name}</span>
                </button>
              </div>
            ))}
          </NeoSideGroup>
        )}
      </div>
      {mine && (
        <div className="dv-meter">
          <div className="row" style={{ gap: 8 }}>
            <HardDrive />
            <span className="grow text-xs">My Drive</span>
            <span className="neo-mono text-xs neo-faint">
              {formatBytes(used)} / {formatBytes(mine.quota)}
            </span>
          </div>
          <Bar value={used / mine.quota} label="Personal storage" />
        </div>
      )}
    </NeoSide>
  );
}

/* ---------------- upload tray & drop overlay ---------------- */

function UploadTray({ jobs, onClose, ui }: { jobs: Job[]; onClose: () => void; ui: DriveUI }) {
  const navigate = useNavigate();
  if (!jobs.length) return null;
  const done = jobs.filter((j) => j.status === 'done').length;
  const busy = jobs.some((j) => j.status === 'reading' || j.status === 'uploading');
  const dest = jobs[jobs.length - 1].place;
  const folder = dest.parentId ? ui.engine.ctx.item.get(dest.parentId) : null;
  const drive = ui.engine.ctx.drive.get(dest.driveId);
  return (
    <div className="dv-tray neo-portal" role="status" aria-live="polite">
      <div className="dv-tray__head">
        <span className="dv-tray__orb">{busy ? <Upload /> : <Check />}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="text-sm">
            <strong>{busy ? `Uploading ${done + 1} of ${jobs.length}` : `${done} upload${done === 1 ? '' : 's'} complete`}</strong>
          </div>
          <div className="neo-faint text-xs truncate">to {folder?.name ?? driveLabel(ui.engine.ctx, drive, ui.engine.me.id)}</div>
        </div>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onClose} aria-label="Close uploads">
          <X />
        </button>
      </div>
      <ul className="dv-tray__list">
        {jobs.slice(-6).map((j) => (
          <li key={j.id}>
            <button type="button" className="dv-tray__row" disabled={!j.itemId} onClick={() => j.itemId && navigate(`/drive/file/${j.itemId}`)}>
              <span className="grow truncate text-sm">{j.name}</span>
              <span className="neo-mono neo-faint text-xs">{j.status === 'error' ? 'Failed' : j.status === 'done' ? formatBytes(j.size) : `${Math.round(j.progress * 100)}%`}</span>
            </button>
            <span className={cx('dv-tray__bar', `is-${j.status}`)}>
              <i style={{ width: `${Math.round(j.progress * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- app ---------------- */

export function DrivePage() {
  const engine = useEngineValue();
  if (!engine) return null;
  return <DriveApp engine={engine} />;
}

function DriveApp({ engine }: { engine: Engine }) {
  const { pathname } = useLocation();
  const [sp, setSp] = useSearchParams();
  const { me } = engine;
  const [peek, setPeek] = useState(false);
  const [sideHidden, setSideHidden] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [place, setPlaceState] = useState<Place | null>(null);
  const [viewAs, setViewAs] = useState<Viewer | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const selectionRef = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<Place | null>(null);
  const prefs = usePrefsFor(me.id);
  const setPrefsStore = useDrive((s) => s.setPrefs);
  const requests = useDrive((s) => s.requests);
  const myPlace = useMemo<Place>(() => ({ driveId: personalDriveId(me.id), parentId: null }), [me.id]);
  const current = place ?? myPlace;

  useEffect(() => {
    useDrive.getState().ensurePersonalDrive(me.id);
    useDrive.getState().sweepTrash();
  }, [me.id]);
  useEffect(() => setPeek(false), [pathname]);

  const open = useCallback((d: DialogState) => setDialog(d), []);
  const close = useCallback(() => setDialog(null), []);

  /* uploads */
  const upload = useCallback(
    (files: File[], target?: Place) => {
      const dest = target ?? current;
      if (!files.length) return;
      const now = performance.now();
      const fresh: Job[] = files.slice(0, 30).map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        progress: 0,
        status: 'reading',
        start: now + i * 160,
        duration: Math.min(1800, 500 + f.size / 60_000),
        place: dest,
      }));
      setJobs((js) => [...js.filter((j) => j.status !== 'done' || performance.now() - j.start < 4000), ...fresh]);
      files.slice(0, 30).forEach((f, i) => {
        readFile(f).then((input) => setJobs((js) => js.map((j) => (j.id === fresh[i].id ? { ...j, input, status: 'uploading' } : j))));
      });
    },
    [current],
  );
  // progress animation + commit
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'uploading' || j.status === 'reading')) return;
    const id = window.setInterval(() => {
      const t = performance.now();
      setJobs((js) =>
        js.map((j) => {
          if (j.status !== 'uploading' && j.status !== 'reading') return j;
          const p = Math.max(0, Math.min(1, (t - j.start) / j.duration));
          if (p < 1 || j.status === 'reading' || !j.input) return { ...j, progress: Math.min(p, 0.96) };
          const r = useDrive.getState().upload(j.place, [j.input]);
          if (!r.ok) {
            toast.error(`Couldn’t upload “${j.name}”`, r.error);
            return { ...j, status: 'error', progress: 1, error: r.error };
          }
          return { ...j, status: 'done', progress: 1, itemId: r.ids[0] };
        }),
      );
    }, 90);
    return () => window.clearInterval(id);
  }, [jobs]);
  useEffect(() => {
    if (!jobs.length || jobs.some((j) => j.status === 'reading' || j.status === 'uploading')) return;
    const done = jobs.filter((j) => j.status === 'done').length;
    if (done) toast.success(done === 1 ? `Uploaded “${jobs.find((j) => j.status === 'done')?.name}”` : `Uploaded ${done} files`);
    const t = window.setTimeout(() => setJobs([]), 5000);
    return () => window.clearTimeout(t);
  }, [jobs.map((j) => j.status).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFiles = useCallback(
    (target?: Place) => {
      pickTarget.current = target ?? current;
      fileInput.current?.click();
    },
    [current],
  );

  const create = useCallback(
    (kind: 'folder' | 'doc' | 'sheet' | 'slides', target?: Place) => {
      const dest = target ?? current;
      const s = useDrive.getState();
      const r = kind === 'folder' ? s.createFolder(dest) : s.createFile(dest, kind);
      if (!r.ok) return void toast.error('Couldn’t create', r.error);
      const inView = pathname === `/drive/d/${dest.driveId}${dest.parentId ? `/${dest.parentId}` : ''}`;
      setDialog({ type: 'rename', id: r.id, then: kind === 'folder' ? (inView ? undefined : `/drive/d/${dest.driveId}/${r.id}`) : `/drive/file/${r.id}` });
    },
    [current, pathname],
  );

  /* query params: ?upload=1 · ?new=doc|sheet|slides|folder */
  useEffect(() => {
    const up = sp.get('upload');
    const nw = sp.get('new');
    if (!up && !nw) return;
    const next = new URLSearchParams(sp);
    next.delete('upload');
    next.delete('new');
    setSp(next, { replace: true });
    if (up) setDialog({ type: 'upload', place: current });
    else if (nw === 'doc' || nw === 'sheet' || nw === 'slides' || nw === 'folder') create(nw, myPlace);
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  /* OS file drop anywhere on the page */
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth++;
      setDropActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropActive(false);
      if (document.querySelector('.dv-uploadzone')) return; // handled by the upload dialog
      upload([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [upload]);

  const toggleSide = useCallback(() => {
    if (window.matchMedia('(max-width: 1100px)').matches) setPeek((p) => !p);
    else setSideHidden((h) => !h);
  }, []);

  /* shortcuts */
  useHotkeys({
    u: (e) => {
      if (overlayOpen()) return;
      e.preventDefault();
      pickFiles();
    },
    c: (e) => {
      if (overlayOpen() || pathname.startsWith('/drive/file/') || pathname.startsWith('/drive/governance')) return;
      e.preventDefault();
      create('folder');
    },
    '[': () => !overlayOpen() && toggleSide(),
    'mod+z': (e) => {
      const t = e.target as HTMLElement | null;
      if (overlayOpen() || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
      if (!useUndo.getState().entry) return;
      e.preventDefault();
      useUndo.getState().run();
    },
    escape: () => {
      if (!overlayOpen() && viewAs) setViewAs(null);
    },
  });

  /* drag & drop */
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }));
  const ui: DriveUI = useMemo(
    () => ({
      engine,
      open,
      close,
      place: current,
      setPlace: setPlaceState,
      upload,
      pickFiles,
      create,
      viewAs,
      setViewAs,
      dragIds,
      selectionRef,
      prefs,
      setPrefs: setPrefsStore,
      toggleSide,
    }),
    [engine, open, close, current, upload, pickFiles, create, viewAs, dragIds, prefs, setPrefsStore, toggleSide],
  );
  const onDragStart = (e: DragStartEvent) => {
    const id = e.active.data.current?.itemId as string | undefined;
    if (!id) return;
    setDragIds(selectionRef.current.includes(id) ? [...selectionRef.current] : [id]);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const ids = dragIds;
    setDragIds(null);
    const target = e.over?.data.current?.place as Place | undefined;
    if (!ids?.length || !target) return;
    if (!canDropAt({ ...ui, dragIds: ids }, target)) {
      const folder = target.parentId ? engine.ctx.item.get(target.parentId) : null;
      if (ids.includes(target.parentId ?? '')) return;
      const noop = ids.every((id) => engine.ctx.item.get(id)?.parentId === target.parentId && engine.ctx.item.get(id)?.driveId === target.driveId);
      if (!noop) toast.error('Can’t move there', `You need edit access to “${folder?.name ?? driveLabel(engine.ctx, engine.ctx.drive.get(target.driveId), me.id)}”.`);
      return;
    }
    const r = useDrive.getState().move(ids, target);
    if (!r.ok) return void toast.error('Can’t move', r.error);
    useUndo.getState().push(r.message ?? 'Moved', r.revert);
  };
  const dragged = dragIds?.length ? engine.ctx.item.get(dragIds[0]) : null;

  const pending = useMemo(
    () =>
      requests.filter((r) => {
        if (r.status !== 'pending' || r.requesterId === me.id) return false;
        const it = engine.ctx.item.get(r.itemId);
        return !!it && ['manager', 'owner'].includes(engine.access(it).level);
      }).length,
    [requests, engine, me.id],
  );

  const hasSide = !/^\/drive\/(file|governance)(\/|$)/.test(pathname) && !sideHidden;
  const dropDest = place ? (place.parentId ? engine.ctx.item.get(place.parentId)?.name : driveLabel(engine.ctx, engine.ctx.drive.get(place.driveId), me.id)) : 'My Drive';

  return (
    <DriveUIContext.Provider value={ui}>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragIds(null)}>
        <NeoWorkspace app="drive" tint={TINT} side={hasSide} sidePeek={peek} onSidePeekChange={setPeek} className={cx(dragIds && 'is-dragging')}>
          <NeoRail
            brand={{ icon: <FolderOpen />, label: 'Helix Drive', to: '/drive' }}
            items={[
              { to: '/drive', label: 'Home', icon: <House />, end: true },
              { to: '/drive/my', label: 'My Drive', icon: <HardDrive />, match: (p) => p === '/drive/my' || p.startsWith(`/drive/d/${personalDriveId(me.id)}`) },
              { to: '/drive/shared', label: 'Shared', icon: <Users /> },
              { to: '/drive/recent', label: 'Recent', icon: <Clock3 /> },
              { to: '/drive/starred', label: 'Starred', icon: <Star /> },
              { to: '/drive/requests', label: 'Requests', icon: <KeyRound />, badge: pending || null },
              { to: '/drive/trash', label: 'Trash', icon: <Trash2 /> },
            ]}
            footer={engine.isAdmin ? [{ to: '/drive/governance', label: 'Govern', title: 'Governance', icon: <ShieldCheck /> }] : undefined}
          />
          {hasSide && <SpacesPanel ui={ui} />}
          <Routes>
            <Route index element={<HomeView />} />
            <Route path="my" element={<Navigate to={`/drive/d/${personalDriveId(me.id)}`} replace />} />
            <Route path="d/:driveId" element={<FolderView />} />
            <Route path="d/:driveId/:folderId" element={<FolderView />} />
            <Route path="shared" element={<CollectionView mode="shared" />} />
            <Route path="recent" element={<CollectionView mode="recent" />} />
            <Route path="starred" element={<CollectionView mode="starred" />} />
            <Route path="trash" element={<CollectionView mode="trash" />} />
            <Route path="file/:fileId" element={<FileView />} />
            <Route path="requests" element={<RequestsView />} />
            <Route path="governance" element={<GovernanceView />} />
            <Route path="*" element={<MissingView title="That page doesn’t exist" />} />
          </Routes>
        </NeoWorkspace>
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="dv-dragghost neo-portal">
              <KindTile item={dragged} size={26} />
              <span className="truncate">{dragged.name}</span>
              {dragIds && dragIds.length > 1 && <span className="dv-dragghost__count">+{dragIds.length - 1}</span>}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          upload([...(e.target.files ?? [])], pickTarget.current ?? undefined);
          e.target.value = '';
        }}
      />
      {dropActive && (
        <div className="dv-dropoverlay neo-portal" aria-hidden="true">
          <div className="dv-dropoverlay__core">
            <span className="dv-dropoverlay__ring" />
            <span className="dv-dropoverlay__ring is-2" />
            <Upload />
            <div className="neo-title neo-title--lg">Drop to upload</div>
            <div className="neo-muted">
              to <strong>{dropDest}</strong>
            </div>
          </div>
        </div>
      )}
      <UploadTray jobs={jobs} onClose={() => setJobs([])} ui={ui} />
      <UndoDock />

      {dialog?.type === 'share' && <ShareDialog itemId={dialog.itemId} tab={dialog.tab} onClose={close} />}
      {dialog?.type === 'move' && <MoveDialog ids={dialog.ids} onClose={close} />}
      {dialog?.type === 'rename' && <RenameDialog id={dialog.id} then={dialog.then} onClose={close} />}
      {dialog?.type === 'label' && <LabelDialog ids={dialog.ids} onClose={close} />}
      {dialog?.type === 'upload' && <UploadDialog place={dialog.place} onClose={close} />}
      {dialog?.type === 'quicklook' && <QuickLook ids={dialog.ids} index={dialog.index} onClose={close} />}
      {dialog?.type === 'purge' && <PurgeDialog ids={dialog.ids} onClose={close} />}
      {dialog?.type === 'newDrive' && <NewDriveDialog onClose={close} />}
      {dialog?.type === 'members' && <MembersSheet driveId={dialog.driveId} onClose={close} />}
      {dialog?.type === 'task' && <TaskDialog itemId={dialog.itemId} onClose={close} />}
      {dialog?.type === 'channel' && <ChannelDialog itemId={dialog.itemId} onClose={close} />}
    </DriveUIContext.Provider>
  );
}
