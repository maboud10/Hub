/**
 * The item browser used by folders and collections: grid (thumbnail cards) and list (table),
 * desktop-grade selection (click, ⌘/Ctrl, Shift ranges, select-all), keyboard (arrows, Enter,
 * Space = Quick Look, F2, Delete), drag & drop, right-click menus, floating selection bar,
 * "View as" locked items and the details inspector.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArchiveRestore, ArrowDown, ArrowUp, Check, Download, FolderInput, Lock, MoreHorizontal, PanelRightClose, Share2, Star, Tag, Trash2, X } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { NeoMenu, NeoTabs, useContextMenu } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import type { Item, SortKey } from '@/drive/types';
import { itemRoute } from '@/drive/store';
import { DAY, KIND_SHORT, formatBytes } from '@/drive/meta';
import { childrenOf, explainDenied, folderSize, locationOf, type Viewer } from '@/drive/access';
import { overlayOpen, useDriveUI } from './ctx';
import { AccessStack, KindTile, LabelChip, Thumb } from './bits';
import { useDropTarget, useItemDrag } from './dnd';
import { useItemActions } from './menu';
import { AccessPanel, ActivityPanel, DetailsPanel } from './Inspector';

export interface BrowserProps {
  items: Item[];
  view: 'grid' | 'list';
  mode?: 'folder' | 'collection' | 'trash';
  showLocation?: boolean;
  groups?: { label: string; ids: string[] }[];
  viewAs?: Viewer | null;
  sort?: SortKey;
  dir?: 'asc' | 'desc';
  onSort?: (k: SortKey) => void;
  empty: ReactNode;
  inspector: boolean;
  onInspector: (open: boolean) => void;
  fallback?: Item | null;
  /** Shown above the items (e.g. View-as banner). */
  top?: ReactNode;
}

type Bind = {
  selected: boolean;
  focused: boolean;
  locked: string | null;
  onClick: (e: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
  toggle: () => void;
};

/* ---------------- tiles ---------------- */

function FolderTile({ item, b, canDrag, canDropHere, count }: { item: Item; b: Bind; canDrag: boolean; canDropHere: boolean; count: number }) {
  const ui = useDriveUI();
  const drag = useItemDrag(item, canDrag);
  const drop = useDropTarget(`tile:${item.id}`, canDropHere ? { driveId: item.driveId, parentId: item.id } : null);
  const ref = (el: HTMLDivElement | null) => {
    drag.ref(el);
    drop.ref(el);
  };
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={b.selected}
      tabIndex={b.focused ? 0 : -1}
      data-dv-item={item.id}
      className={cx('dv-folder neo-spot', b.selected && 'is-selected', b.locked && 'is-locked', drag.isDragging && 'is-dragging', drop.cls)}
      style={{ '--k': item.color ?? ui.engine.ctx.drive.get(item.driveId)?.color ?? '#fbbf24' } as CSSProperties}
      onClick={b.onClick}
      onDoubleClick={b.onDoubleClick}
      onContextMenu={b.onContextMenu}
      onPointerDown={b.onPointerDown}
      {...(drag.listeners ?? {})}
      data-tip={b.locked ?? undefined}
    >
      <span className="dv-folder__glyph">
        <svg viewBox="0 0 40 32" aria-hidden="true">
          <path d="M2 6a4 4 0 0 1 4-4h9l4 4h15a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" />
        </svg>
        {b.locked && <Lock className="dv-folder__lock" />}
      </span>
      <span className="dv-folder__text">
        <span className="dv-folder__name truncate">{item.name}</span>
        <span className="dv-folder__meta">
          {count} item{count === 1 ? '' : 's'}
          {item.shares.length > 0 && ' · shared'}
          {item.hold && ' · on hold'}
        </span>
      </span>
      <LabelChip label={item.label} quiet />
      <button type="button" className={cx('dv-check', b.selected && 'is-on')} onClick={(e) => (e.stopPropagation(), b.toggle())} aria-label={b.selected ? 'Deselect' : 'Select'} tabIndex={-1}>
        <Check />
      </button>
    </div>
  );
}

function FileCard({ item, b, canDrag, showLocation }: { item: Item; b: Bind; canDrag: boolean; showLocation?: boolean }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const drag = useItemDrag(item, canDrag);
  const owner = ctx.user.get(item.ownerId);
  const starred = item.starredBy.includes(me.id);
  return (
    <div
      ref={drag.ref}
      role="option"
      aria-selected={b.selected}
      tabIndex={b.focused ? 0 : -1}
      data-dv-item={item.id}
      className={cx('dv-card neo-spot', b.selected && 'is-selected', b.locked && 'is-locked', drag.isDragging && 'is-dragging')}
      onClick={b.onClick}
      onDoubleClick={b.onDoubleClick}
      onContextMenu={b.onContextMenu}
      onPointerDown={b.onPointerDown}
      {...(drag.listeners ?? {})}
    >
      <div className="dv-card__media">
        <Thumb item={item} />
        {b.locked && (
          <div className="dv-card__lock" data-tip={b.locked}>
            <Lock />
            <span>{b.locked}</span>
          </div>
        )}
        {starred && <Star className="dv-card__star" />}
      </div>
      <div className="dv-card__body">
        <div className="dv-card__name">
          <KindTile item={item} size={20} />
          <span className="truncate">{item.name}</span>
        </div>
        <div className="dv-card__meta">
          {owner && <Avatar user={owner} size={18} />}
          <span className="truncate">{showLocation ? locationOf(ctx, item, me.id) : `${relativeTime(item.updatedAt)}`}</span>
          <LabelChip label={item.label} quiet />
        </div>
      </div>
      <button type="button" className={cx('dv-check', b.selected && 'is-on')} onClick={(e) => (e.stopPropagation(), b.toggle())} aria-label={b.selected ? 'Deselect' : 'Select'} tabIndex={-1}>
        <Check />
      </button>
    </div>
  );
}

function Row({ item, b, canDrag, canDropHere, showLocation, trash }: { item: Item; b: Bind; canDrag: boolean; canDropHere: boolean; showLocation?: boolean; trash?: boolean }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const actions = useItemActions();
  const drag = useItemDrag(item, canDrag);
  const drop = useDropTarget(`row:${item.id}`, canDropHere && item.kind === 'folder' ? { driveId: item.driveId, parentId: item.id } : null);
  const ref = (el: HTMLTableRowElement | null) => {
    drag.ref(el);
    drop.ref(el);
  };
  const owner = ctx.user.get(item.ownerId);
  const starred = item.starredBy.includes(me.id);
  const size = item.kind === 'folder' ? folderSize(ctx, item) : item.size;
  const daysLeft = item.trashed ? Math.max(0, ctx.policy.trashDays - Math.floor((ctx.now - item.trashed.at) / DAY)) : 0;
  const trashedBy = item.trashed ? ctx.user.get(item.trashed.by) : undefined;
  return (
    <tr
      ref={ref}
      role="option"
      aria-selected={b.selected}
      tabIndex={b.focused ? 0 : -1}
      data-dv-item={item.id}
      className={cx('dv-row', b.selected && 'is-selected', b.locked && 'is-locked', drag.isDragging && 'is-dragging', drop.cls)}
      onClick={b.onClick}
      onDoubleClick={b.onDoubleClick}
      onContextMenu={b.onContextMenu}
      onPointerDown={b.onPointerDown}
      {...(drag.listeners ?? {})}
    >
      <td className="dv-row__name">
        <span className="row" style={{ gap: 10, minWidth: 0 }}>
          <button type="button" className={cx('dv-check dv-check--inline', b.selected && 'is-on')} onClick={(e) => (e.stopPropagation(), b.toggle())} aria-label={b.selected ? 'Deselect' : 'Select'} tabIndex={-1}>
            <Check />
          </button>
          <KindTile item={item} />
          <span className="truncate dv-row__title">{item.name}</span>
          {b.locked && (
            <span className="dv-row__lock" data-tip={b.locked}>
              <Lock /> <span className="truncate">{b.locked}</span>
            </span>
          )}
        </span>
      </td>
      {trash ? (
        <>
          <td className="dv-col-owner">
            <span className="row" style={{ gap: 6 }}>
              {trashedBy && <Avatar user={trashedBy} size={20} />}
              <span className="truncate">{trashedBy?.id === me.id ? 'You' : trashedBy?.name}</span>
            </span>
          </td>
          <td className="dv-col-date">{item.trashed ? relativeTime(item.trashed.at) : ''}</td>
          <td className={cx('dv-col-size', daysLeft <= 5 && 'dv-danger')}>{item.hold ? 'On hold' : `${daysLeft} days`}</td>
          <td className="dv-col-loc truncate">{locationOf(ctx, item, me.id)}</td>
          <td className="dv-col-act">
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" data-tip="Restore" aria-label="Restore" onClick={(e) => (e.stopPropagation(), actions.restore([item.id]))}>
              <ArchiveRestore />
            </button>
          </td>
        </>
      ) : (
        <>
          <td className="dv-col-owner">
            <span className="row" style={{ gap: 6 }}>
              {owner && <Avatar user={owner} size={20} />}
              <span className="truncate">{owner?.id === me.id ? 'You' : owner?.name}</span>
            </span>
          </td>
          <td className="dv-col-date">{relativeTime(item.updatedAt)}</td>
          <td className="dv-col-size">{item.kind === 'folder' ? `${childrenOf(ctx, item.driveId, item.id).length} items` : formatBytes(size)}</td>
          <td className="dv-col-access">{showLocation ? <span className="truncate dv-loc">{locationOf(ctx, item, me.id)}</span> : <AccessStack item={item} users={ctx.user} size={20} />}</td>
          <td className="dv-col-label">
            <LabelChip label={item.label} />
          </td>
          <td className="dv-col-act">
            <button
              type="button"
              className={cx('neo-iconbtn neo-iconbtn--sm dv-star', starred && 'is-on')}
              aria-label={starred ? 'Remove star' : 'Star'}
              aria-pressed={starred}
              onClick={(e) => (e.stopPropagation(), actions.star([item.id], !starred))}
            >
              <Star />
            </button>
          </td>
        </>
      )}
    </tr>
  );
}

/* ---------------- inspector ---------------- */

export function InspectorPane({ item, selectedCount, onClose }: { item: Item | null; selectedCount: number; onClose: () => void }) {
  const [tab, setTab] = useState<'details' | 'activity' | 'access'>('details');
  return (
    <aside className="neo-inspector dv-inspector" aria-label="Details">
      <div className="dv-inspector__head">
        {item ? <KindTile item={item} size={30} /> : null}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="neo-hud">{selectedCount > 1 ? 'Selection' : item?.kind === 'folder' ? 'Folder' : 'Details'}</div>
          <div className="dv-inspector__title truncate">{selectedCount > 1 ? `${selectedCount} items selected` : (item?.name ?? 'Nothing selected')}</div>
        </div>
        <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close details" data-tip="Close · I" data-tip-pos="left">
          <PanelRightClose />
        </button>
      </div>
      {item && selectedCount <= 1 ? (
        <>
          <div className="dv-inspector__tabs">
            <NeoTabs
              variant="underline"
              label="Inspector"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'details', label: 'Details' },
                { value: 'activity', label: 'Activity' },
                { value: 'access', label: 'Access' },
              ]}
            />
          </div>
          <div className="dv-inspector__body">
            {tab === 'details' && <DetailsPanel item={item} />}
            {tab === 'activity' && <ActivityPanel activity={item.activity} />}
            {tab === 'access' && <AccessPanel item={item} />}
          </div>
        </>
      ) : (
        <div className="dv-inspector__body">
          <p className="neo-faint text-sm" style={{ padding: '6px 4px' }}>
            {selectedCount > 1 ? 'Use the selection bar to share, move, label or trash them together.' : 'Select a file or folder to see its details, activity and who can open it.'}
          </p>
        </div>
      )}
    </aside>
  );
}

/* ---------------- browser ---------------- */

export function Browser({ items, view, mode = 'folder', showLocation, groups, viewAs, sort, dir, onSort, empty, inspector, onInspector, fallback, top }: BrowserProps) {
  const ui = useDriveUI();
  const navigate = useNavigate();
  const actions = useItemActions();
  const ctxMenu = useContextMenu();
  const { ctx } = ui.engine;
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const pointerType = useRef<string>('mouse');
  const root = useRef<HTMLDivElement>(null);
  const trash = mode === 'trash';

  const order = useMemo(() => (groups ? groups.flatMap((g) => g.ids) : items.map((i) => i.id)), [groups, items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lockedOf = (i: Item): string | null => {
    if (!viewAs) return null;
    const a = ui.engine.access(i, viewAs);
    return a.level === 'none' ? explainDenied(a) : null;
  };

  // keep selection valid when the list changes
  useEffect(() => {
    setSelected((s) => s.filter((id) => byId.has(id)));
  }, [byId]);
  useEffect(() => {
    ui.selectionRef.current = selected;
  }, [selected, ui.selectionRef]);

  const selItems = selected.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  const focusEl = (id: string) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-dv-item="${CSS.escape(id)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  };
  const openItem = (i: Item) => {
    if (lockedOf(i)) return;
    if (trash) return ui.open({ type: 'quicklook', ids: [i.id], index: 0 });
    navigate(itemRoute(i));
  };
  const quickLook = (start?: Item) => {
    const files = order.map((id) => byId.get(id)).filter((i): i is Item => !!i && i.kind !== 'folder' && !lockedOf(i));
    if (!files.length) return;
    const pool = selItems.filter((i) => i.kind !== 'folder').length > 1 ? selItems.filter((i) => i.kind !== 'folder') : files;
    const first = start ?? selItems.find((i) => i.kind !== 'folder') ?? (focus ? byId.get(focus) : undefined) ?? pool[0];
    const idx = Math.max(0, pool.findIndex((i) => i.id === first?.id));
    ui.open({ type: 'quicklook', ids: pool.map((i) => i.id), index: idx });
  };

  const bind = (i: Item): Bind => ({
    selected: selected.includes(i.id),
    focused: focus ? focus === i.id : order[0] === i.id,
    locked: lockedOf(i),
    onPointerDown: (e) => {
      pointerType.current = e.pointerType;
    },
    onClick: (e) => {
      e.stopPropagation();
      setFocus(i.id);
      if (e.shiftKey && anchor.current) {
        const a = order.indexOf(anchor.current);
        const z = order.indexOf(i.id);
        if (a >= 0 && z >= 0) setSelected(order.slice(Math.min(a, z), Math.max(a, z) + 1));
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        anchor.current = i.id;
        setSelected((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]));
        return;
      }
      if (pointerType.current === 'touch' && selected.length === 0) {
        openItem(i);
        return;
      }
      if (pointerType.current === 'touch' && selected.length > 0) {
        setSelected((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]));
        return;
      }
      anchor.current = i.id;
      setSelected([i.id]);
    },
    onDoubleClick: () => openItem(i),
    onContextMenu: (e) => {
      if (viewAs) return;
      e.preventDefault();
      e.stopPropagation();
      let pool = selItems;
      if (!selected.includes(i.id)) {
        setSelected([i.id]);
        anchor.current = i.id;
        pool = [i];
      }
      setFocus(i.id);
      ctxMenu.open(
        e,
        actions.menuFor(pool, {
          trash,
          onDetails: () => onInspector(true),
          onQuickLook: () => quickLook(i),
        }),
      );
    },
    toggle: () => {
      anchor.current = i.id;
      setFocus(i.id);
      setSelected((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]));
    },
  });

  /* keyboard */
  const move = (dirKey: 'up' | 'down' | 'left' | 'right', extend: boolean) => {
    if (!order.length) return;
    const cur = focus ?? selected[selected.length - 1] ?? null;
    let next: string | null = null;
    if (!cur) next = order[0];
    else {
      const idx = order.indexOf(cur);
      if (dirKey === 'left') next = order[Math.max(0, idx - 1)];
      else if (dirKey === 'right') next = order[Math.min(order.length - 1, idx + 1)];
      else {
        const els = [...(root.current?.querySelectorAll<HTMLElement>('[data-dv-item]') ?? [])];
        const curEl = els.find((el) => el.dataset.dvItem === cur);
        if (curEl) {
          const r = curEl.getBoundingClientRect();
          const cx0 = r.left + r.width / 2;
          const cands = els
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter((x) => (dirKey === 'down' ? x.r.top > r.top + 4 : x.r.top < r.top - 4));
          if (cands.length) {
            const rowTop = dirKey === 'down' ? Math.min(...cands.map((c) => c.r.top)) : Math.max(...cands.map((c) => c.r.top));
            const row = cands.filter((c) => Math.abs(c.r.top - rowTop) < 6);
            row.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - cx0) - Math.abs(b.r.left + b.r.width / 2 - cx0));
            next = row[0]?.el.dataset.dvItem ?? null;
          }
        }
      }
    }
    if (!next) return;
    setFocus(next);
    if (extend) {
      const a = anchor.current ?? cur ?? next;
      anchor.current = a;
      const ia = order.indexOf(a);
      const iz = order.indexOf(next);
      setSelected(order.slice(Math.min(ia, iz), Math.max(ia, iz) + 1));
    } else {
      anchor.current = next;
      setSelected([next]);
    }
    requestAnimationFrame(() => focusEl(next as string));
  };
  const guard = (fn: (e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
    if (overlayOpen()) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('button, a, [role="menu"], [role="tablist"]') && !t.closest('[data-dv-item]')) return;
    fn(e);
  };
  useHotkeys({
    arrowdown: guard((e) => (e.preventDefault(), move('down', false))),
    arrowup: guard((e) => (e.preventDefault(), move('up', false))),
    arrowleft: guard((e) => (e.preventDefault(), move('left', false))),
    arrowright: guard((e) => (e.preventDefault(), move('right', false))),
    'shift+arrowdown': guard((e) => (e.preventDefault(), move('down', true))),
    'shift+arrowup': guard((e) => (e.preventDefault(), move('up', true))),
    'shift+arrowleft': guard((e) => (e.preventDefault(), move('left', true))),
    'shift+arrowright': guard((e) => (e.preventDefault(), move('right', true))),
    enter: guard((e) => {
      const id = focus ?? selected[0];
      const it = id ? byId.get(id) : undefined;
      if (it) {
        e.preventDefault();
        openItem(it);
      }
    }),
    ' ': guard((e) => {
      e.preventDefault();
      quickLook();
    }),
    f2: guard((e) => {
      const it = selItems.length === 1 ? selItems[0] : focus ? byId.get(focus) : undefined;
      if (it && !trash && ui.engine.caps(it).edit) {
        e.preventDefault();
        ui.open({ type: 'rename', id: it.id });
      }
    }),
    delete: guard(() => {
      if (!selItems.length || viewAs) return;
      if (trash) ui.open({ type: 'purge', ids: selItems.map((i) => i.id) });
      else actions.trash(selItems.map((i) => i.id));
    }),
    backspace: guard(() => {
      if (!selItems.length || viewAs || trash) return;
      actions.trash(selItems.map((i) => i.id));
    }),
    'mod+a': (e) => {
      const t = e.target as HTMLElement | null;
      if (overlayOpen() || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      e.preventDefault();
      setSelected(order.filter((id) => !lockedOf(byId.get(id) as Item)));
    },
    escape: () => {
      if (overlayOpen()) return;
      if (selected.length) setSelected([]);
    },
    x: guard(() => {
      const id = focus ?? order[0];
      if (id) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    }),
    i: guard(() => onInspector(!inspector)),
  });

  const canDrag = (i: Item) => !viewAs && !trash && ui.engine.caps(i).edit;
  const canDropHere = !viewAs && !trash;
  const counts = (i: Item) => childrenOf(ctx, i.driveId, i.id).length;

  const folders = items.filter((i) => i.kind === 'folder');
  const files = items.filter((i) => i.kind !== 'folder');

  const sortHead = (k: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {onSort ? (
        <button type="button" className={cx('dv-sorth', sort === k && 'is-on')} onClick={() => onSort(k)}>
          {label}
          {sort === k && (dir === 'asc' ? <ArrowUp /> : <ArrowDown />)}
        </button>
      ) : (
        label
      )}
    </th>
  );

  const inspected = selItems.length === 1 ? selItems[0] : selItems.length > 1 ? null : (fallback ?? null);

  const list = (rows: Item[]) => (
    <div className="neo-table-wrap dv-tablewrap">
      <table className="neo-table dv-table">
        <thead>
          <tr>
            {sortHead('name', 'Name')}
            {trash ? (
              <>
                <th className="dv-col-owner">Deleted by</th>
                <th className="dv-col-date">Deleted</th>
                <th className="dv-col-size">Purges in</th>
                <th className="dv-col-loc">From</th>
                <th className="dv-col-act" aria-label="Actions" />
              </>
            ) : (
              <>
                {sortHead('owner', 'Owner', 'dv-col-owner')}
                {sortHead('updated', 'Modified', 'dv-col-date')}
                {sortHead('size', 'Size', 'dv-col-size')}
                <th className="dv-col-access">{showLocation ? 'Location' : 'Access'}</th>
                <th className="dv-col-label">Label</th>
                <th className="dv-col-act" aria-label="Star" />
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <Row key={i.id} item={i} b={bind(i)} canDrag={canDrag(i)} canDropHere={canDropHere} showLocation={showLocation} trash={trash} />
          ))}
        </tbody>
      </table>
    </div>
  );

  const grid = (rows: Item[]) => (
    <div className="dv-grid" role="presentation">
      {rows.map((i) =>
        i.kind === 'folder' ? (
          <FolderTile key={i.id} item={i} b={bind(i)} canDrag={canDrag(i)} canDropHere={canDropHere} count={counts(i)} />
        ) : (
          <FileCard key={i.id} item={i} b={bind(i)} canDrag={canDrag(i)} showLocation={showLocation} />
        ),
      )}
    </div>
  );

  let content: ReactNode;
  if (!items.length) content = empty;
  else if (groups)
    content = groups
      .filter((g) => g.ids.length)
      .map((g) => (
        <section key={g.label} className="dv-section">
          <div className="dv-section__head">
            <span className="neo-hud">{g.label}</span>
            <span className="neo-faint text-xs">{g.ids.length}</span>
          </div>
          {view === 'list' ? list(g.ids.map((id) => byId.get(id) as Item)) : grid(g.ids.map((id) => byId.get(id) as Item))}
        </section>
      ));
  else if (view === 'list' || trash) content = list(items);
  else
    content = (
      <>
        {folders.length > 0 && (
          <section className="dv-section">
            <div className="dv-section__head">
              <span className="neo-hud">Folders</span>
              <span className="neo-faint text-xs">{folders.length}</span>
            </div>
            <div className="dv-grid dv-grid--folders" role="presentation">
              {folders.map((i) => (
                <FolderTile key={i.id} item={i} b={bind(i)} canDrag={canDrag(i)} canDropHere={canDropHere} count={counts(i)} />
              ))}
            </div>
          </section>
        )}
        {files.length > 0 && (
          <section className="dv-section">
            <div className="dv-section__head">
              <span className="neo-hud">Files</span>
              <span className="neo-faint text-xs">{files.length}</span>
            </div>
            <div className="dv-grid dv-grid--files" role="presentation">
              {files.map((i) => (
                <FileCard key={i.id} item={i} b={bind(i)} canDrag={canDrag(i)} showLocation={showLocation} />
              ))}
            </div>
          </section>
        )}
      </>
    );

  const selCaps = selItems.map((i) => ui.engine.caps(i));
  const allCaps = (k: 'edit' | 'download' | 'trash' | 'label' | 'share' | 'purge') => selCaps.length > 0 && selCaps.every((c) => c[k]);
  const allStarred = selItems.length > 0 && selItems.every((i) => i.starredBy.includes(ui.engine.me.id));

  return (
    <div className={cx('neo-split dv-split', !inspector && 'is-solo')}>
      <div className="neo-body neo-pad dv-browser-wrap" onClick={() => setSelected([])}>
        {top}
        <div ref={root} className={cx('dv-browser', `is-${view}`)} role="listbox" aria-multiselectable="true" aria-label="Files and folders">
          {content}
        </div>
        {selItems.length > 0 && !viewAs && (
          <div className="dv-selbar neo-portal" role="toolbar" aria-label="Selection actions" onClick={(e) => e.stopPropagation()}>
            <span className="dv-selbar__count">
              <span className="neo-num">{selItems.length}</span> selected
            </span>
            {trash ? (
              <>
                <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" disabled={!allCaps('edit')} onClick={() => actions.restore(selItems.map((i) => i.id))}>
                  <ArchiveRestore /> <span className="dv-hide-sm">Restore</span>
                </button>
                <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" disabled={!allCaps('purge')} onClick={() => ui.open({ type: 'purge', ids: selItems.map((i) => i.id) })}>
                  <Trash2 /> <span className="dv-hide-sm">Delete forever</span>
                </button>
              </>
            ) : (
              <>
                {selItems.length === 1 && (
                  <button type="button" className="neo-iconbtn" data-tip="Share" aria-label="Share" onClick={() => ui.open({ type: 'share', itemId: selItems[0].id, tab: allCaps('share') ? 'share' : 'xray' })}>
                    <Share2 />
                  </button>
                )}
                <button type="button" className="neo-iconbtn" data-tip="Move" aria-label="Move" disabled={!allCaps('edit')} onClick={() => ui.open({ type: 'move', ids: selItems.map((i) => i.id) })}>
                  <FolderInput />
                </button>
                <button type="button" className={cx('neo-iconbtn', allStarred && 'is-on')} data-tip={allStarred ? 'Unstar' : 'Star'} aria-label="Star" onClick={() => actions.star(selItems.map((i) => i.id), !allStarred)}>
                  <Star />
                </button>
                <button type="button" className="neo-iconbtn" data-tip="Label" aria-label="Label" disabled={!allCaps('label')} onClick={() => ui.open({ type: 'label', ids: selItems.map((i) => i.id) })}>
                  <Tag />
                </button>
                <button type="button" className="neo-iconbtn" data-tip="Download" aria-label="Download" disabled={!allCaps('download')} onClick={() => actions.download(selItems.map((i) => i.id))}>
                  <Download />
                </button>
                <button type="button" className="neo-iconbtn dv-danger-btn" data-tip="Move to trash" aria-label="Move to trash" disabled={!allCaps('trash')} onClick={() => actions.trash(selItems.map((i) => i.id))}>
                  <Trash2 />
                </button>
                <NeoMenu
                  label="More actions"
                  placement="top-end"
                  items={actions.menuFor(selItems, { onDetails: () => onInspector(true), onQuickLook: () => quickLook() })}
                  trigger={(p) => (
                    <button {...p} type="button" className="neo-iconbtn" aria-label="More actions">
                      <MoreHorizontal />
                    </button>
                  )}
                />
              </>
            )}
            <span className="dv-selbar__sep" />
            <button type="button" className="neo-iconbtn" aria-label="Clear selection" data-tip="Clear · Esc" onClick={() => setSelected([])}>
              <X />
            </button>
          </div>
        )}
      </div>
      {inspector && <InspectorPane item={inspected} selectedCount={selItems.length} onClose={() => onInspector(false)} />}
      {ctxMenu.element}
    </div>
  );
}

export const kindLabel = (i: Item) => KIND_SHORT[i.kind];
