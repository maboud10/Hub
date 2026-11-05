import { useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscapeToClose, useFocusTrap, usePresence } from '@/hooks/useOverlay';
import { cx } from '@/lib/cx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}

/** Centered dialog on desktop, bottom sheet on phones. Esc / scrim click to close. */
export function Modal({ open, onClose, title, subtitle, icon, children, footer, width = 520, className }: ModalProps) {
  const { mounted, closing } = usePresence(open, 180);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useEscapeToClose(open, onClose);

  if (!mounted) return null;
  return createPortal(
    <>
      <div className={cx('scrim', closing && 'is-closing')} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cx('modal', closing && 'is-closing', className)}
        style={{ '--modal-w': `${width}px` } as CSSProperties}
      >
        <div className="modal__head">
          {icon}
          <div className="grow">
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__sub">{subtitle}</p>}
          </div>
          <button className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close dialog">
            <X />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
