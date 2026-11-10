/**
 * Drive UI context: the memoised permission engine for the signed-in viewer, dialog host,
 * current place (where uploads / new items go), "View as", drag state, prefs and Undo.
 */
import { createContext, useContext, useMemo, type MutableRefObject } from 'react';
import { create } from 'zustand';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import type { User } from '@/types';
import { DEFAULT_PREFS, useDrive } from '@/drive/store';
import { buildCtx, capsOf, effectiveAccess, viewerOf, type Access, type Caps, type EngineCtx, type Viewer } from '@/drive/access';
import type { DrivePrefs, Item, Place } from '@/drive/types';

export interface Engine {
  ctx: EngineCtx;
  me: Viewer;
  user: User;
  isAdmin: boolean;
  access: (item: Item, as?: Viewer) => Access;
  caps: (item: Item, as?: Viewer) => Caps;
}

export function useEngineValue(): Engine | null {
  const user = useSessionUser();
  const perms = usePermissions();
  const roles = useHub((s) => s.roles);
  const users = useHub((s) => s.users);
  const drives = useDrive((s) => s.drives);
  const items = useDrive((s) => s.items);
  const policy = useDrive((s) => s.policy);
  const minute = useNow(60_000);
  return useMemo(() => {
    if (!user) return null;
    const ctx = buildCtx({ drives, items, policy }, users, roles);
    const me = viewerOf(user, roles, perms);
    const cache = new Map<string, Access>();
    const access = (item: Item, as: Viewer = me) => {
      const k = `${as.id}|${item.id}`;
      let a = cache.get(k);
      if (!a) {
        a = effectiveAccess(ctx, as, item);
        cache.set(k, a);
      }
      return a;
    };
    return { ctx, me, user, isAdmin: me.admin, access, caps: (item: Item, as?: Viewer) => capsOf(ctx, access(item, as)) };
  }, [user, perms, roles, users, drives, items, policy, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

export type DialogState =
  | { type: 'share'; itemId: string; tab?: 'share' | 'xray' }
  | { type: 'move'; ids: string[] }
  | { type: 'rename'; id: string; then?: string }
  | { type: 'label'; ids: string[] }
  | { type: 'upload'; place: Place }
  | { type: 'quicklook'; ids: string[]; index: number }
  | { type: 'newDrive' }
  | { type: 'task'; itemId: string }
  | { type: 'channel'; itemId: string }
  | { type: 'purge'; ids: string[] }
  | { type: 'members'; driveId: string };

export interface DriveUI {
  engine: Engine;
  open: (d: DialogState) => void;
  close: () => void;
  /** Where uploads and new items go right now. */
  place: Place;
  setPlace: (p: Place | null) => void;
  upload: (files: File[], place?: Place) => void;
  pickFiles: (place?: Place) => void;
  create: (kind: 'folder' | 'doc' | 'sheet' | 'slides', place?: Place) => void;
  viewAs: Viewer | null;
  setViewAs: (v: Viewer | null) => void;
  dragIds: string[] | null;
  selectionRef: MutableRefObject<string[]>;
  prefs: DrivePrefs;
  setPrefs: (p: Partial<DrivePrefs>) => void;
  toggleSide: () => void;
}

export const DriveUIContext = createContext<DriveUI | null>(null);

export function useDriveUI(): DriveUI {
  const v = useContext(DriveUIContext);
  if (!v) throw new Error('useDriveUI must be used inside <DrivePage>');
  return v;
}

export function usePrefsFor(userId: string | undefined): DrivePrefs {
  const p = useDrive((s) => (userId ? s.prefs[userId] : undefined));
  return useMemo(() => ({ ...DEFAULT_PREFS, ...p }), [p]);
}

/* ---------------- Undo dock ---------------- */

interface UndoEntry {
  id: number;
  title: string;
  revert: () => void;
}
interface UndoState {
  entry: UndoEntry | null;
  push: (title: string, revert: () => void) => void;
  run: () => void;
  clear: () => void;
}
let undoTimer = 0;
export const useUndo = create<UndoState>()((set, get) => ({
  entry: null,
  push(title, revert) {
    window.clearTimeout(undoTimer);
    const id = Date.now();
    set({ entry: { id, title, revert } });
    undoTimer = window.setTimeout(() => {
      if (get().entry?.id === id) set({ entry: null });
    }, 7000);
  },
  run() {
    const e = get().entry;
    if (!e) return;
    window.clearTimeout(undoTimer);
    set({ entry: null });
    e.revert();
  },
  clear() {
    window.clearTimeout(undoTimer);
    set({ entry: null });
  },
}));

/** True while a modal, sheet, popover or Quick Look is open (keyboard shortcuts stand down). */
export const overlayOpen = () => !!document.querySelector('.modal, .sheet, .neo-pop, .dv-ql');
