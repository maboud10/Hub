import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

const isTyping = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
};

/**
 * Global keyboard shortcuts.
 * Keys: "mod+k" (⌘/Ctrl), "shift+?", single keys ("t", "/"), and
 * two-key sequences like "g h" (press g, then h within 900ms).
 * Shortcuts are ignored while typing, except those containing "mod+" or "escape".
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let pendingTimer: number | undefined;

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const typing = isTyping(e.target);
      const mod = e.metaKey || e.ctrlKey;
      const combo = `${mod ? 'mod+' : ''}${e.shiftKey && key.length > 1 ? 'shift+' : ''}${key}`;
      const handlers = mapRef.current;

      if (handlers[combo] && (!typing || combo.startsWith('mod+') || key === 'escape')) {
        handlers[combo](e);
        return;
      }
      if (typing || mod || e.altKey) return;

      if (pending) {
        const seq = `${pending} ${key}`;
        pending = null;
        window.clearTimeout(pendingTimer);
        if (handlers[seq]) {
          e.preventDefault();
          handlers[seq](e);
          return;
        }
      }
      if (Object.keys(handlers).some((k) => k.startsWith(`${key} `))) {
        pending = key;
        pendingTimer = window.setTimeout(() => (pending = null), 900);
        return;
      }
      if (handlers[key]) handlers[key](e);
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(pendingTimer);
    };
  }, [enabled]);
}
