import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, ArrowUpRight, Info, Pin, PinOff, Plus } from 'lucide-react';
import type { AppWithAccess } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { useAppAccessMap, usePrefs } from '@/store/selectors';
import { AppIcon } from '@/components/ui/primitives';
import { useContextMenu, type MenuEntry } from '@/components/neo';
import { getIcon } from '@/icons';
import { useLaunchApp } from './useLaunchApp';
import { cx } from '@/lib/cx';

function DockItem({
  item,
  index,
  onLaunch,
  onMove,
  onMenu,
}: {
  item: AppWithAccess;
  index: number;
  onLaunch: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onMenu: (e: MouseEvent<HTMLElement>, item: AppWithAccess) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.app.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--c1': item.app.gradient[0],
    '--c2': item.app.gradient[1],
  } as CSSProperties;
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowLeft') (e.preventDefault(), onMove(item.app.id, -1));
    if (e.key === 'ArrowRight') (e.preventDefault(), onMove(item.app.id, 1));
  };
  // Keep the button's native semantics; only borrow dnd-kit's pointer listeners.
  const { role: _role, tabIndex: _tab, ...a11y } = attributes;
  void _role;
  void _tab;
  return (
    <div ref={setNodeRef} style={style} className={cx('dock__item', isDragging && 'is-dragging')}>
      {index < 9 && (
        <span className="dock__key" aria-hidden="true">
          {index + 1}
        </span>
      )}
      <button
        ref={setActivatorNodeRef}
        className="dock__btn"
        data-dock-btn
        onClick={() => onLaunch(item.app.id)}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => onMenu(e, item)}
        aria-label={`Open ${item.app.name}${index < 9 ? ` (shortcut ${index + 1})` : ''}. Alt + arrow keys to reorder.`}
        {...a11y}
        {...listeners}
      >
        <AppIcon app={item.app} size={54} />
        {!!item.app.notifications && <span className="counter">{item.app.notifications}</span>}
      </button>
      <span className="dock__label">{item.app.name}</span>
    </div>
  );
}

/** Pinned-apps dock: macOS-style magnification, drag to reorder, 1–9 hotkeys. */
export function PinnedDock() {
  const prefs = usePrefs();
  const accessMap = useAppAccessMap();
  const reorderPins = useHub((s) => s.reorderPins);
  const togglePin = useHub((s) => s.togglePin);
  const openAppSheet = useUI((s) => s.openAppSheet);
  const launch = useLaunchApp();
  const navigate = useNavigate();
  const ctx = useContextMenu();
  const dockRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const items = useMemo(
    () => prefs.pinned.map((id) => accessMap.get(id)).filter((a): a is AppWithAccess => a?.access === 'granted'),
    [prefs.pinned, accessMap],
  );
  const ids = items.map((i) => i.app.id);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );

  const commit = (visibleOrder: string[]) => {
    const hidden = prefs.pinned.filter((id) => !visibleOrder.includes(id));
    reorderPins([...visibleOrder, ...hidden]);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    if (!over || active.id === over.id) return;
    commit(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const move = (id: string, dir: -1 | 1) => {
    const from = ids.indexOf(id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    commit(arrayMove(ids, from, to));
  };

  const magnify = (clientX: number) => {
    if (dragging || document.documentElement.dataset.motion === 'reduced') return;
    dockRef.current?.querySelectorAll<HTMLElement>('[data-dock-btn]').forEach((btn) => {
      const r = btn.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      btn.style.setProperty('--s', (1 + Math.max(0, 1 - d / 150) * 0.3).toFixed(3));
    });
  };
  const reset = useCallback(() => dockRef.current?.querySelectorAll<HTMLElement>('[data-dock-btn]').forEach((b) => b.style.setProperty('--s', '1')), []);

  /** Right-click menu for a docked app (desktop). Touch long-press is reserved for drag-to-reorder. */
  const openMenu = (e: MouseEvent<HTMLElement>, item: AppWithAccess) => {
    e.preventDefault();
    reset();
    const { app } = item;
    const i = ids.indexOf(app.id);
    const entries: MenuEntry[] = [
      { label: `Open ${app.name}`, icon: <ArrowUpRight />, hint: i < 9 ? String(i + 1) : undefined, onSelect: () => launch(app.id) },
      ...(app.quickActions ?? []).slice(0, 2).map((qa): MenuEntry => {
        const Icon = getIcon(qa.icon);
        return { label: qa.label, icon: <Icon />, onSelect: () => launch(app.id, qa.label) };
      }),
      { kind: 'sep' },
      { label: 'Move left', icon: <ArrowLeft />, hint: '⌥←', disabled: i <= 0, onSelect: () => move(app.id, -1) },
      { label: 'Move right', icon: <ArrowRight />, hint: '⌥→', disabled: i >= ids.length - 1, onSelect: () => move(app.id, 1) },
      { label: 'Unpin from dock', icon: <PinOff />, onSelect: () => toast.result(togglePin(app.id)) },
      { label: 'Details', icon: <Info />, onSelect: () => openAppSheet(app.id) },
    ];
    const r = e.currentTarget.getBoundingClientRect();
    if (!e.clientX && !e.clientY) ctx.open({ clientX: r.left + r.width / 2, clientY: r.bottom }, entries);
    else ctx.open(e, entries);
  };

  if (!items.length) {
    return (
      <div className="dock dock--empty">
        <div className="dock__empty">
          <span className="dock__empty-icon" aria-hidden="true">
            <Pin />
          </span>
          <span className="dock__empty-text">
            <b>Nothing pinned yet</b>
            <span>Pin your most-used apps — use the pin on any tile below.</span>
          </span>
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => navigate('/apps')}>
            <Plus /> Browse apps
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (setDragging(true), reset())} onDragEnd={onDragEnd} onDragCancel={() => setDragging(false)}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div
          ref={dockRef}
          className={cx('dock', dragging && 'is-dragging')}
          role="toolbar"
          aria-label="Pinned apps"
          onMouseMove={(e) => magnify(e.clientX)}
          onMouseLeave={reset}
        >
          {items.map((item, i) => (
            <DockItem key={item.app.id} item={item} index={i} onLaunch={launch} onMove={move} onMenu={openMenu} />
          ))}
          <span className="dock__sep" aria-hidden="true" />
          <div className="dock__item">
            <button className="dock__add" onClick={() => navigate('/apps')} aria-label="Pin more apps" data-tip="Pin more apps">
              <Plus />
            </button>
            <span className="dock__label">Add</span>
          </div>
        </div>
      </SortableContext>
      {ctx.element}
    </DndContext>
  );
}
