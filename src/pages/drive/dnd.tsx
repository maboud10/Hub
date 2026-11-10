/**
 * Drag & drop helpers (dnd-kit): draggable items and permission-aware drop targets
 * (folder tiles, side-tree nodes, breadcrumb segments).
 */
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cx } from '@/lib/cx';
import type { Item, Place } from '@/drive/types';
import { isWithin, placeAccess } from '@/drive/access';
import { atLeast } from '@/drive/meta';
import { useDriveUI, type DriveUI } from './ctx';

export function canDropAt(ui: DriveUI, place: Place): boolean {
  const ids = ui.dragIds;
  if (!ids?.length) return false;
  const { ctx, me } = ui.engine;
  if (place.parentId && ids.includes(place.parentId)) return false;
  const target = place.parentId ? ctx.item.get(place.parentId) : null;
  if (place.parentId && !target) return false;
  if (target && ids.some((id) => isWithin(ctx, target, id))) return false;
  const noop = ids.every((id) => {
    const it = ctx.item.get(id);
    return !!it && it.parentId === place.parentId && it.driveId === place.driveId;
  });
  if (noop) return false;
  return atLeast(placeAccess(ctx, me, place.driveId, place.parentId), 'editor');
}

export function useDropTarget(key: string, place: Place | null) {
  const ui = useDriveUI();
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${key}`, data: { place }, disabled: !place });
  const dragging = !!ui.dragIds?.length;
  const valid = dragging && place ? canDropAt(ui, place) : false;
  return { ref: setNodeRef, isOver, valid, dragging, cls: cx(dragging && isOver && (valid ? 'is-drop-ok' : 'is-drop-no'), dragging && valid && 'is-drop-cand') };
}

export function useItemDrag(item: Item, enabled: boolean) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `item:${item.id}`, data: { itemId: item.id }, disabled: !enabled });
  return { ref: setNodeRef, listeners: enabled ? listeners : undefined, isDragging };
}
