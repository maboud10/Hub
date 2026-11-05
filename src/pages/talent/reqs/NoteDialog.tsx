/**
 * Confirm-with-a-note dialog for approvals, returns, holds and rescinds.
 * `useNoteDialog()` gives pages an imperative `ask({...})` plus the element to
 * render, keeping the last request mounted for the exit animation.
 */
import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';

export interface NoteRequest {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'success';
  /** Context shown above the note field. */
  body?: ReactNode;
  label?: string;
  placeholder?: string;
  /** Minimum note length (0 = optional). */
  minLength?: number;
  /** Return true to close the dialog (e.g. the store action succeeded). */
  onConfirm: (note: string) => boolean;
}

function NoteDialog({ open, request, onClose }: { open: boolean; request: NoteRequest; onClose: () => void }) {
  const [note, setNote] = useState('');
  const min = request.minLength ?? 0;
  const missing = Math.max(0, min - note.trim().length);
  const submit = () => {
    if (missing) return;
    if (request.onConfirm(note.trim())) onClose();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={request.title}
      subtitle={request.subtitle}
      icon={request.icon ? <span className={cx('tl-req-note__icon', request.tone && `tl-req-note__icon--${request.tone}`)}>{request.icon}</span> : undefined}
      width={480}
      className="tl-req-note"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cx('btn', request.tone === 'danger' ? 'btn--danger' : request.tone === 'success' ? 'btn--success' : 'btn--primary')}
            disabled={missing > 0}
            onClick={submit}
          >
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        {request.body}
        <label className="field">
          <span className="field-label">
            {request.label ?? 'Note'} <span className="faint">{min ? '(required)' : '(optional)'}</span>
          </span>
          <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onKey} placeholder={request.placeholder} autoFocus />
          <span className="field-hint">{missing ? `${missing} more character${missing === 1 ? '' : 's'} needed.` : 'Written to the audit trail. ⌘/Ctrl + Enter to confirm.'}</span>
        </label>
      </div>
    </Modal>
  );
}

export function useNoteDialog() {
  const [state, setState] = useState<{ request: NoteRequest; open: boolean; key: number } | null>(null);
  const ask = useCallback((request: NoteRequest) => setState((s) => ({ request, open: true, key: (s?.key ?? 0) + 1 })), []);
  const close = useCallback(() => setState((s) => (s ? { ...s, open: false } : s)), []);
  const dialog = state ? <NoteDialog key={state.key} open={state.open} request={state.request} onClose={close} /> : null;
  return { ask, dialog };
}
