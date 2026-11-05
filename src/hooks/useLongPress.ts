import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * Long-press (touch) + right-click (desktop) to open a context action.
 * Returns props to spread on the target and a flag reader to suppress the
 * click that follows a long-press.
 */
export function useLongPress(onLongPress: () => void, ms = 480) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    wasLongPress: () => {
      const v = fired.current;
      fired.current = false;
      return v;
    },
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(12);
          onLongPress();
        }, ms);
      },
      onPointerMove: (e: PointerEvent) => {
        if (!start.current || !timer.current) return;
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        if (!fired.current) onLongPress();
      },
    },
  };
}
