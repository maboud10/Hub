import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pin, Plus } from 'lucide-react';
import type { AppWithAccess } from '@/types';
import { useHub } from '@/store/hub';
import { useAppAccessMap, usePrefs } from '@/store/selectors';
import { AppIcon } from '@/components/ui/primitives';
import { useLaunchApp } from './useLaunchApp';
import { cx } from '@/lib/cx';

function DockItem({
  item,
  index,
  onLaunch,
  onMove,
}: {
  item: AppWithAccess;
  index: number;
  onLaunch: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.app.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
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
      {index < 9 && <span className="dock__key">{index + 1}</span>}
      <button
        ref={setActivatorNodeRef}
        className="dock__btn"
        data-dock-btn
        onClick={() => onLaunch(item.app.id)}
        onKeyDown={onKeyDown}
        aria-label={`Open ${item.app.name}${index < 9 ? ` (shortcut ${index + 1})` : ''}. Alt + arrow keys to reorder.`}
        {...a11y}
        {...listeners}
      >
        <AppIcon app={item.app} size={56} />
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
  const launch = useLaunchApp();
  const navigate = useNavigate();
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
  const reset = () => dockRef.current?.querySelectorAll<HTMLElement>('[data-dock-btn]').forEach((b) => b.style.setProperty('--s', '1'));

  if (!items.length) {
    return (
      <div className="dock">
        <div className="dock__empty">
          <Pin size={18} /> Pin your most-used apps here — use the pin on any tile.
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (setDragging(true), reset())} onDragEnd={onDragEnd} onDragCancel={() => setDragging(false)}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div
          ref={dockRef}
          className="dock"
          role="toolbar"
          aria-label="Pinned apps"
          onMouseMove={(e) => magnify(e.clientX)}
          onMouseLeave={reset}
        >
          {items.map((item, i) => (
            <DockItem key={item.app.id} item={item} index={i} onLaunch={launch} onMove={move} />
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
    </DndContext>
  );
}
