import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { useToasts } from '@/store/toast';

const ICON = { success: CircleCheck, error: CircleX, info: Info, warning: TriangleAlert };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toaster" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast__icon">
              <Icon />
            </span>
            <div className="grow">
              <div className="toast__title">{t.title}</div>
              {t.description && <div className="toast__desc">{t.description}</div>}
            </div>
            <button className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}
