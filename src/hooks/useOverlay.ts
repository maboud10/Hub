import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Keeps an element mounted briefly after `open` turns false so exit animations can play. */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, closing };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ───────── body scroll lock (ref-counted, so stacked overlays can close in any order) ─────────
let scrollLocks = 0;
let savedOverflow = '';
function lockBodyScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
  };
}

/** Traps Tab focus within `ref` while active, restores focus on close, locks body scroll. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, initialFocus?: RefObject<HTMLElement | null>) {
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const unlock = lockBodyScroll();

    const focusFirst = () => {
      if (initialFocus?.current) return initialFocus.current.focus();
      const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node)?.focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      unlock();
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ───────── overlay stack: only the top-most open overlay reacts to Escape ─────────
const overlayStack: number[] = [];
let overlaySeq = 0;

/** Registers an open overlay; the returned `isTop()` says whether it is the top-most one. */
export function useOverlayLayer(open: boolean) {
  const idRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    const id = ++overlaySeq;
    idRef.current = id;
    overlayStack.push(id);
    return () => {
      const i = overlayStack.lastIndexOf(id);
      if (i >= 0) overlayStack.splice(i, 1);
    };
  }, [open]);
  return useCallback(() => overlayStack.length > 0 && overlayStack[overlayStack.length - 1] === idRef.current, []);
}

/** Escape closes only the top-most open overlay (a modal over a sheet closes first). */
export function useEscapeToClose(open: boolean, onClose: () => void) {
  const isTop = useOverlayLayer(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTop()) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, isTop]);
}
