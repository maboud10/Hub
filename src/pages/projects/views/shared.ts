/**
 * Shared bits for project views: filters and multi-container drag & drop.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { addDays, startOfWeek, todayIso } from '@/projects/dates';
import type { Priority, Project, Task } from '@/projects/types';

export interface Filters {
  q: string;
  mine: boolean;
  hideDone: boolean;
  assignees: string[];
  priorities: Priority[];
  tags: string[];
  due: 'any' | 'overdue' | 'week' | 'none';
}

export const EMPTY_FILTERS: Filters = { q: '', mine: false, hideDone: false, assignees: [], priorities: [], tags: [], due: 'any' };

export function activeFilterCount(f: Filters): number {
  return (f.mine ? 1 : 0) + (f.hideDone ? 1 : 0) + f.assignees.length + f.priorities.length + f.tags.length + (f.due !== 'any' ? 1 : 0);
}

export function applyFilters(tasks: Task[], f: Filters, meId: string | undefined, project?: Project): Task[] {
  const today = todayIso();
  const weekEnd = addDays(startOfWeek(today), 6);
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.hideDone && t.completedAt) return false;
    if (f.mine && t.assigneeId !== meId) return false;
    if (f.assignees.length && !f.assignees.includes(t.assigneeId ?? 'none')) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.tags.length && !f.tags.some((x) => t.tags.includes(x))) return false;
    if (f.due === 'overdue' && !(t.dueDate && t.dueDate < today && !t.completedAt)) return false;
    if (f.due === 'week' && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
    if (f.due === 'none' && t.dueDate) return false;
    if (q) {
      const hay = `${project?.key ?? ''}-${t.number} ${t.title} ${t.tags.join(' ')} ${t.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ───────────────────────── multi-container sortable ───────────────────────── */

export type Containers = Record<string, string[]>;

/**
 * Standard dnd-kit multi-container pattern: items move between containers
 * live while dragging (smooth), and `onMove(id, containerId, index)` commits
 * the final position on drop.
 */
export function useMultiContainer(source: Containers, onMove: (id: string, container: string, index: number, list: string[]) => void) {
  const [items, setItems] = useState<Containers>(source);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const sourceKey = useMemo(() => JSON.stringify(source), [source]);

  useEffect(() => {
    if (!activeId) setItems(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = useCallback(
    (id: string, state: Containers = items) => {
      if (id in state) return id;
      return Object.keys(state).find((k) => state[k].includes(id)) ?? null;
    },
    [items],
  );

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    setOrigin(findContainer(id));
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    setItems((prev) => {
      const from = findContainer(id, prev);
      const to = findContainer(overId, prev);
      if (!from || !to || from === to) return prev;
      const fromItems = prev[from].filter((x) => x !== id);
      const toItems = [...prev[to]];
      const overIndex = toItems.indexOf(overId);
      const below = over.rect && active.rect.current.translated ? active.rect.current.translated.top > over.rect.top + over.rect.height / 2 : false;
      const index = overId in prev ? toItems.length : overIndex + (below ? 1 : 0);
      toItems.splice(Math.max(0, Math.min(index, toItems.length)), 0, id);
      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const id = String(active.id);
    let next = items;
    if (over) {
      const overId = String(over.id);
      const c = findContainer(id);
      const oc = findContainer(overId);
      if (c && oc && c === oc && overId !== id && !(overId in items)) {
        const oldI = items[c].indexOf(id);
        const newI = items[c].indexOf(overId);
        next = { ...items, [c]: arrayMove(items[c], oldI, newI) };
        setItems(next);
      }
    }
    const container = findContainer(id, next);
    setActiveId(null);
    if (container && (container !== origin || source[container]?.indexOf(id) !== next[container].indexOf(id))) onMove(id, container, next[container].indexOf(id), next[container]);
    setOrigin(null);
  };

  const onDragCancel = () => {
    setActiveId(null);
    setOrigin(null);
    setItems(source);
  };

  const collision: CollisionDetection = closestCorners;
  return { items, activeId, sensors, collision, handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel } };
}
