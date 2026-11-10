/**
 * React glue for Performance & OKRs: viewer context, time, URL flags, undo bar.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { create } from 'zustand';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import { useNow } from '@/hooks/useNow';
import { APP_PERM, canCalibrate, canSeeInsights, canSeeTeam, directReportIds, isAdmin, orgIds, type PerfViewer } from '@/performance/access';
import type { PerfResult } from '@/performance/types';
import { toast } from '@/store/toast';

export interface PerfCtx {
  me: User;
  v: PerfViewer;
  users: User[];
  byId: Map<string, User>;
  /** Active users with Performance access. */
  people: User[];
  peopleIds: Set<string>;
  isAdmin: boolean;
  reportIds: string[];
  orgIds: string[];
  canTeam: boolean;
  canCalibrate: boolean;
  canInsights: boolean;
  user: (id: string | undefined) => User | undefined;
  name: (id: string | undefined) => string;
  first: (id: string | undefined) => string;
}

export function usePerfCtx(): PerfCtx | null {
  const me = useSessionUser();
  const perms = usePermissions();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => {
    if (!me) return null;
    const v: PerfViewer = { id: me.id, perms };
    const byId = new Map(users.map((u) => [u.id, u]));
    const people = users.filter((u) => u.active && hasPermission(effectivePermissions(u, roles), APP_PERM));
    const user = (id: string | undefined) => (id ? byId.get(id) : undefined);
    const name = (id: string | undefined) => user(id)?.name ?? 'Unknown';
    return {
      me,
      v,
      users,
      byId,
      people,
      peopleIds: new Set(people.map((u) => u.id)),
      isAdmin: isAdmin(v),
      reportIds: directReportIds(users, me.id).filter((id) => people.some((p) => p.id === id)),
      orgIds: orgIds(users, me.id).filter((id) => people.some((p) => p.id === id)),
      canTeam: canSeeTeam(v, users),
      canCalibrate: canCalibrate(v, users),
      canInsights: canSeeInsights(v, users),
      user,
      name,
      first: (id) => name(id).split(' ')[0],
    };
  }, [me, perms, users, roles]);
}

/** `Date.now()` refreshed every minute (enough for due dates and forecasts). */
export const useMinute = () => useNow(60_000);

/** Read/clear a boolean-ish search param (e.g. `?new=1`). */
export function useSearchFlag(key: string): [string | null, () => void, (value?: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const clear = useCallback(() => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [key, setParams]);
  const setValue = useCallback(
    (v = '1') => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set(key, v);
          return next;
        },
        { replace: false },
      );
    },
    [key, setParams],
  );
  return [value, clear, setValue];
}

/* ───────── Undo bar ───────── */

interface UndoEntry {
  id: number;
  message: string;
  undo: () => PerfResult;
}

interface UndoState {
  entry: UndoEntry | null;
  show(message: string, undo: () => PerfResult): void;
  dismiss(): void;
}

let undoTimer: number | undefined;
let undoSeq = 0;

export const useUndo = create<UndoState>()((set) => ({
  entry: null,
  show(message, undo) {
    window.clearTimeout(undoTimer);
    const id = ++undoSeq;
    set({ entry: { id, message, undo } });
    undoTimer = window.setTimeout(() => set((s) => (s.entry?.id === id ? { entry: null } : s)), 6500);
  },
  dismiss() {
    window.clearTimeout(undoTimer);
    set({ entry: null });
  },
}));

/** Run a destructive store action and offer Undo. */
export function withUndo(res: PerfResult<{ undo: () => PerfResult }>, message?: string) {
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  useUndo.getState().show(message ?? res.message ?? 'Done', res.undo);
  return true;
}

/** Show the outcome of a store action as a toast. Returns `ok`. */
export function report(res: PerfResult, success?: string): boolean {
  if (res.ok) {
    if (success !== '' && (success ?? res.message)) toast.success(success ?? res.message ?? 'Done');
    return true;
  }
  toast.error(res.error);
  return false;
}

/* ───────── Dates ───────── */

const DAY = 86_400_000;

export function dueLabel(at: number, now: number): { text: string; tone: 'slate' | 'warning' | 'danger' | 'app' } {
  const days = Math.round((at - now) / DAY);
  if (at < now) {
    const late = Math.max(1, Math.round((now - at) / DAY));
    return { text: late <= 1 ? 'Overdue' : `${late}d overdue`, tone: 'danger' };
  }
  if (at - now < DAY) return { text: new Date(at).getDate() === new Date(now).getDate() ? 'Due today' : 'Due tomorrow', tone: 'warning' };
  if (days <= 3) return { text: `Due in ${days}d`, tone: 'warning' };
  return { text: `Due in ${days}d`, tone: 'slate' };
}

export function dayLabel(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  const tomorrow = new Date(now + DAY).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (tomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

export const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
