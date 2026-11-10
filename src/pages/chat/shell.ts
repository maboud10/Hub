import { createContext, useContext } from 'react';

/** Shell callbacks shared by every chat view (side panel peek on narrow screens, jump search focus). */
export interface ChatShell {
  toggleSide: () => void;
  closeSide: () => void;
  focusSearch: () => void;
}

export const ChatShellContext = createContext<ChatShell>({ toggleSide: () => undefined, closeSide: () => undefined, focusSearch: () => undefined });
export const useChatShell = () => useContext(ChatShellContext);
