/**
 * Approve / decline controls for the approvals inbox. Declining always asks
 * for a short note (at least 5 characters) with one-tap suggestions, so people
 * learn why and what would work instead; approving can carry an optional note.
 */
import { useId, useState, type ReactNode } from 'react';
import { Check, MessageSquarePlus, X } from 'lucide-react';
import { cx } from '@/lib/cx';

const MIN = 5;

export function DecisionBar({
  approveLabel = 'Approve',
  approveIcon,
  declineLabel = 'Decline',
  quickApproves = [],
  quickDeclines = [],
  onApprove,
  onDecline,
  disabledReason,
}: {
  approveLabel?: string;
  approveIcon?: ReactNode;
  declineLabel?: string;
  quickApproves?: string[];
  quickDeclines?: string[];
  /** Return true when the action succeeded (resets the bar). */
  onApprove: (note: string) => boolean;
  /** Omit when the request can't be declined (e.g. benefits confirmation). */
  onDecline?: (note: string) => boolean;
  disabledReason?: string;
}) {
  const [mode, setMode] = useState<'idle' | 'note' | 'decline'>('idle');
  const [note, setNote] = useState('');
  const id = useId();
  const reset = () => {
    setMode('idle');
    setNote('');
  };
  const approve = () => onApprove(note.trim()) && reset();
  const decline = () => note.trim().length >= MIN && onDecline?.(note.trim()) && reset();

  if (disabledReason)
    return (
      <div className="hr-ap-decide hr-ap-decide--blocked" role="note">
        {disabledReason}
      </div>
    );

  if (mode === 'idle')
    return (
      <div className="hr-ap-decide">
        <div className="hr-ap-decide__row">
          <button type="button" className="btn btn--success" onClick={approve}>
            {approveIcon ?? <Check />} {approveLabel}
          </button>
          {onDecline && (
            <button type="button" className="btn btn--danger" onClick={() => setMode('decline')}>
              <X /> {declineLabel}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm hr-ap-decide__note" onClick={() => setMode('note')}>
            <MessageSquarePlus /> Add a note
          </button>
        </div>
      </div>
    );

  const declining = mode === 'decline';
  const chips = declining ? quickDeclines : quickApproves;
  const short = note.trim().length < MIN;
  return (
    <div className={cx('hr-ap-decide', declining && 'is-declining')}>
      <label className="field-label" htmlFor={id}>
        {declining ? 'Why, and what would work instead? (required)' : 'Note (optional)'}
      </label>
      {chips.length > 0 && (
        <div className="hr-ap-decide__chips" role="group" aria-label="Suggested notes">
          {chips.map((c) => (
            <button key={c} type="button" className={cx('chip', note === c && 'is-active')} onClick={() => setNote(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        className="textarea"
        rows={2}
        maxLength={300}
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={declining ? 'e.g. That week is our release, could you move it one week later?' : 'e.g. Enjoy, and thanks for planning ahead!'}
      />
      {declining && short && <span className="field-hint">A short note helps them understand. At least {MIN} characters.</span>}
      <div className="hr-ap-decide__row">
        {declining ? (
          <button type="button" className="btn btn--danger" disabled={short} onClick={decline}>
            <X /> {declineLabel} with note
          </button>
        ) : (
          <button type="button" className="btn btn--success" onClick={approve}>
            {approveIcon ?? <Check />} {approveLabel}
            {note.trim() ? ' with note' : ''}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={reset}>
          Cancel
        </button>
      </div>
    </div>
  );
}
