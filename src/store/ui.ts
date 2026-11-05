import { create } from 'zustand';

/** Ephemeral UI state (not persisted). */
interface UIState {
  paletteOpen: boolean;
  notificationsOpen: boolean;
  appSheetId: string | null;
  launch: { appId: string; action?: string } | null;
  kudos: { open: boolean; toId?: string };
  shortcutsOpen: boolean;
  personaSwitcherOpen: boolean;
  mobileMenuOpen: boolean;
  setPaletteOpen(v: boolean): void;
  setNotificationsOpen(v: boolean): void;
  openAppSheet(id: string): void;
  closeAppSheet(): void;
  startLaunch(appId: string, action?: string): void;
  endLaunch(): void;
  openKudos(toId?: string): void;
  closeKudos(): void;
  setShortcutsOpen(v: boolean): void;
  setPersonaSwitcherOpen(v: boolean): void;
  setMobileMenuOpen(v: boolean): void;
  closeAll(): void;
}

export const useUI = create<UIState>()((set) => ({
  paletteOpen: false,
  notificationsOpen: false,
  appSheetId: null,
  launch: null,
  kudos: { open: false },
  shortcutsOpen: false,
  personaSwitcherOpen: false,
  mobileMenuOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  openAppSheet: (appSheetId) => set({ appSheetId, paletteOpen: false }),
  closeAppSheet: () => set({ appSheetId: null }),
  startLaunch: (appId, action) => set({ launch: { appId, action }, appSheetId: null, paletteOpen: false }),
  endLaunch: () => set({ launch: null }),
  openKudos: (toId) => set({ kudos: { open: true, toId }, paletteOpen: false }),
  closeKudos: () => set({ kudos: { open: false } }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setPersonaSwitcherOpen: (personaSwitcherOpen) => set({ personaSwitcherOpen, paletteOpen: false, mobileMenuOpen: false }),
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  closeAll: () =>
    set({
      paletteOpen: false,
      notificationsOpen: false,
      appSheetId: null,
      launch: null,
      kudos: { open: false },
      shortcutsOpen: false,
      personaSwitcherOpen: false,
      mobileMenuOpen: false,
    }),
}));
