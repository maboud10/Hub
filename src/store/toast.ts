import { create } from 'zustand';
import type { ActionResult } from '@/types';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>, ttl?: number): string;
  dismiss(id: string): void;
}

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push(t, ttl = 3800) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    window.setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

const push = (kind: ToastKind) => (title: string, description?: string) => useToasts.getState().push({ kind, title, description });

export const toast = {
  success: push('success'),
  error: push('error'),
  info: push('info'),
  warning: push('warning'),
  /** Show the outcome of a store action. Returns `result.ok` for chaining. */
  result(result: ActionResult, fallbackSuccess = 'Done') {
    if (result.ok) useToasts.getState().push({ kind: 'success', title: result.message ?? fallbackSuccess });
    else useToasts.getState().push({ kind: 'error', title: result.error }, 5000);
    return result.ok;
  },
};
