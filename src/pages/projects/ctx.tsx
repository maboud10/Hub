/**
 * Page-level context + hooks shared by every Helix Projects screen.
 */
import { createContext, useContext, useMemo } from 'react';
import { create } from 'zustand';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { type Actor, actorFrom, canViewProject } from '@/projects/access';
import { useProjects } from '@/projects/store';
import type { Project, Task, UserState } from '@/projects/types';

export interface QuickAddDefaults {
  projectId?: string | null;
  sectionId?: string | null;
  dueDate?: string;
  text?: string;
}

export interface ProjectsUI {
  taskId: string | null;
  openTask(id: string): void;
  closeTask(): void;
  quickAdd(defaults?: QuickAddDefaults): void;
  toggleSide(): void;
  /** Screens register their search box so `s` focuses it. */
  registerSearch(el: HTMLInputElement | null): void;
}

export const ProjectsUIContext = createContext<ProjectsUI | null>(null);

export function useProjectsUI(): ProjectsUI {
  const v = useContext(ProjectsUIContext);
  if (!v) throw new Error('useProjectsUI outside ProjectsPage');
  return v;
}

export function useActor(): Actor | null {
  const user = useSessionUser();
  const perms = usePermissions();
  return useMemo(() => (user ? actorFrom(user, perms) : null), [user, perms]);
}

export function useUsersMap(): Map<string, User> {
  const users = useHub((s) => s.users);
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}

export function useVisibleProjects(includeArchived = false): Project[] {
  const projects = useProjects((s) => s.projects);
  const actor = useActor();
  return useMemo(() => (actor ? projects.filter((p) => canViewProject(p, actor) && (includeArchived || !p.archived)) : []), [projects, actor, includeArchived]);
}

export function useProjectMap(): Map<string, Project> {
  const projects = useProjects((s) => s.projects);
  return useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
}

/** Tasks the viewer can see (visible projects + their personal tasks). */
export function useVisibleTasks(): Task[] {
  const tasks = useProjects((s) => s.tasks);
  const visible = useVisibleProjects(true);
  const actor = useActor();
  return useMemo(() => {
    if (!actor) return [];
    const ids = new Set(visible.map((p) => p.id));
    return tasks.filter((t) => (t.projectId ? ids.has(t.projectId) : t.creatorId === actor.id || t.assigneeId === actor.id));
  }, [tasks, visible, actor]);
}

const EMPTY_STATE: UserState = { starred: [], lastView: {}, sideCollapsed: false, browseMode: 'gallery' };
export function useMyState(): UserState {
  const id = useHub((s) => s.sessionUserId);
  const st = useProjects((s) => (id ? s.users[id] : undefined));
  return useMemo(() => ({ ...EMPTY_STATE, ...(st ?? {}) }), [st]);
}

/* ───────────────────────── Undo ───────────────────────── */

interface UndoItem {
  id: number;
  label: string;
  undo: () => void;
}
interface UndoState {
  item: UndoItem | null;
  push(label: string, undo: () => void): void;
  run(): void;
  dismiss(): void;
}
let undoSeq = 0;
let undoTimer: number | undefined;
export const useUndo = create<UndoState>()((set, get) => ({
  item: null,
  push(label, undo) {
    const id = ++undoSeq;
    set({ item: { id, label, undo } });
    window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => {
      if (get().item?.id === id) set({ item: null });
    }, 6500);
  },
  run() {
    const it = get().item;
    if (!it) return;
    set({ item: null });
    it.undo();
  },
  dismiss() {
    set({ item: null });
  },
}));
export const pushUndo = (label: string, undo: () => void) => useUndo.getState().push(label, undo);
