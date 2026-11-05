import { create } from 'zustand';

export type FocusMode = 'idle' | 'focus' | 'break';

interface FocusState {
  mode: FocusMode;
  /** Total length of the current session in ms. */
  duration: number;
  endsAt: number | null;
  pausedRemaining: number | null;
  start(mode: Exclude<FocusMode, 'idle'>, minutes: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

/** Focus (pomodoro) timer — lives outside components so it survives navigation. */
export const useFocus = create<FocusState>()((set, get) => ({
  mode: 'idle',
  duration: 25 * 60_000,
  endsAt: null,
  pausedRemaining: null,
  start(mode, minutes) {
    const duration = minutes * 60_000;
    set({ mode, duration, endsAt: Date.now() + duration, pausedRemaining: null });
  },
  pause() {
    const { endsAt } = get();
    if (!endsAt) return;
    set({ pausedRemaining: Math.max(0, endsAt - Date.now()), endsAt: null });
  },
  resume() {
    const { pausedRemaining } = get();
    if (pausedRemaining === null) return;
    set({ endsAt: Date.now() + pausedRemaining, pausedRemaining: null });
  },
  stop() {
    set({ mode: 'idle', endsAt: null, pausedRemaining: null });
  },
}));
