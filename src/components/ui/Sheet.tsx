import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscapeToClose, useFocusTrap, usePresence } from '@/hooks/useOverlay';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/cx';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Custom header (replaces the default title row). */
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  label?: string;
}

/**
 * Responsive sheet: slides in from the right on desktop, up from the bottom
 * on phones (with a grabber you can swipe down to dismiss).
 */
export function Sheet({ open, onClose, title, header, children, footer, width = 460, className, label }: SheetProps) {
  const isMobile = useIsMobile();
  const { mounted, closing } = usePresence(open, 200);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  useFocusTrap(ref, open);
  useEscapeToClose(open, onClose);

  if (!mounted) return null;

  const onGrabStart = (e: PointerEvent) => {
    drag.current = { startY: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGrabMove = (e: PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
    ref.current.style.transition = 'none';
  };
  const onGrabEnd = () => {
    if (!drag.current || !ref.current) return;
    const { dy } = drag.current;
    ref.current.style.transition = '';
    ref.current.style.transform = '';
    drag.current = null;
    if (dy > 110) onClose();
  };

  return createPortal(
    <>
      <div className={cx('scrim', closing && 'is-closing')} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        className={cx('sheet', isMobile ? 'sheet--bottom' : 'sheet--right', closing && 'is-closing', className)}
        style={{ '--sheet-w': `${width}px` } as CSSProperties}
      >
        {isMobile && (
          <div className="sheet__grabber" onPointerDown={onGrabStart} onPointerMove={onGrabMove} onPointerUp={onGrabEnd} onPointerCancel={onGrabEnd} />
        )}
        {header ?? (
          <div className="sheet__head">
            <h2 className="sheet__title grow">{title}</h2>
            <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
