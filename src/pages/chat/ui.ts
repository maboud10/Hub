/**
 * Ephemeral (non-persisted) Pulse Chat UI state: typing indicators, live presence overlay,
 * the huddle runtime, played send-effects and the message being edited.
 */
import { create } from 'zustand';
import type { Presence } from '@/types';
import type { ScriptLine } from '@/chat/nova';

export type HuddleMode = 'pill' | 'panel' | 'stage';

export interface HuddleRuntime {
  convId: string;
  joinedAt: number;
  mode: HuddleMode;
  muted: boolean;
  camera: boolean;
  screen: boolean;
  hand: boolean;
  notes: boolean;
  script: ScriptLine[];
  /** Index of the line currently being spoken. */
  cursor: number;
  heard: ScriptLine[];
  bursts: { id: number; emoji: string; x: number }[];
}

interface ChatUIState {
  activeConvId: string | null;
  typing: Record<string, { userId: string; until: number }[]>;
  presence: Record<string, Presence>;
  huddle: HuddleRuntime | null;
  played: Record<string, true>;
  lastSim: Record<string, number>;
  editingId: string | null;
  /** Focus requests for the main composer (incrementing tick). */
  focusTick: number;
  setActive(convId: string | null): void;
  setTyping(convId: string, userId: string, ms: number): void;
  clearTyping(convId: string, userId: string): void;
  setPresence(userId: string, p: Presence): void;
  setHuddle(next: HuddleRuntime | null | ((h: HuddleRuntime) => HuddleRuntime)): void;
  markPlayed(id: string): void;
  setLastSim(convId: string, at: number): void;
  setEditing(id: string | null): void;
  focusComposer(): void;
}

export const useChatUI = create<ChatUIState>()((set, get) => ({
  activeConvId: null,
  typing: {},
  presence: {},
  huddle: null,
  played: {},
  lastSim: {},
  editingId: null,
  focusTick: 0,
  setActive: (convId) => {
    if (get().activeConvId !== convId) set({ activeConvId: convId });
  },
  setTyping: (convId, userId, ms) =>
    set((s) => ({ typing: { ...s.typing, [convId]: [...(s.typing[convId] ?? []).filter((t) => t.userId !== userId), { userId, until: Date.now() + ms }] } })),
  clearTyping: (convId, userId) => set((s) => ({ typing: { ...s.typing, [convId]: (s.typing[convId] ?? []).filter((t) => t.userId !== userId) } })),
  setPresence: (userId, p) => set((s) => ({ presence: { ...s.presence, [userId]: p } })),
  setHuddle: (next) => set((s) => ({ huddle: typeof next === 'function' ? (s.huddle ? next(s.huddle) : null) : next })),
  markPlayed: (id) => set((s) => ({ played: { ...s.played, [id]: true } })),
  setLastSim: (convId, at) => set((s) => ({ lastSim: { ...s.lastSim, [convId]: at } })),
  setEditing: (id) => set({ editingId: id }),
  focusComposer: () => set((s) => ({ focusTick: s.focusTick + 1 })),
}));
