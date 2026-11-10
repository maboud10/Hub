/**
 * Control Center chrome slots.
 *
 * The NEO frame (header + toolbar row) is rendered once by `AdminPage`, but
 * each tab owns the state behind its section actions (export the filtered
 * audit trail, open "New role"…) and its toolbar (NeoTabs, search, filters).
 * Tabs publish those nodes with `useAdminChrome`; the frame renders them in
 * the NeoHead actions / `.neo-toolbar` row — the Support Deck anatomy.
 *
 * No render loop: the frame keeps the slot state and receives the routes as a
 * stable `children` element, so publishing re-renders the frame only.
 */
import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';

export interface AdminChrome {
  /** Section-specific header actions (`neo-btn--soft` + `neo-btn--plasma`). */
  actions?: ReactNode;
  /** Toolbar row under the header (view NeoTabs, search, filters). */
  toolbar?: ReactNode;
}

type Publish = (chrome: AdminChrome) => void;

const ChromeContext = createContext<Publish | null>(null);

export const AdminChromeProvider = ChromeContext.Provider;

/**
 * Publish this tab's header actions and toolbar into the Control Center frame.
 * Re-published after every render of the tab so handlers never go stale;
 * cleared when the tab unmounts (route change, permission loss).
 */
export function useAdminChrome(chrome: AdminChrome) {
  const publish = useContext(ChromeContext);
  useLayoutEffect(() => {
    publish?.(chrome);
  });
  useLayoutEffect(() => () => publish?.({}), [publish]);
}
