/**
 * New allowance claim (`?claim=1`, optional `&allowance=<id>`): pick the
 * allowance (with what's left), amount in AED, merchant, purchase date (within
 * 60 days), description and a receipt (only the file name is stored).
 */
import { useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';
import { Paperclip, Receipt, Send, Upload, X } from 'lucide-react';
import type { AllowanceId } from '@/hr/types';
import { ALLOWANCES } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { useAllowanceUsage } from '@/hr/selectors';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { aed } from './model';

interface ReceiptFile {
  name: string;
  sizeKb: number;
}

const FORM_ID = 'hr-bn-claim-form';

/** Remounts on every open so each claim starts from a clean form. */
export function ClaimModal({ open, onClose, initialAllowance }: { open: boolean; onClose: () => void; initialAllowance: AllowanceId | null }) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return <ClaimDialog key={session} open={open} onClose={onClose} initialAllowance={initialAllowance} />;
}

function ClaimDialog({ open, onClose, initialAllowance }: { open: boolean; onClose: () => void; initialAllowance: AllowanceId | null }) {
  const usage = useAllowanceUsage();
  const submitClaim = useHr((s) => s.submitClaim);
  const today = todayISO();
  const minDate = addDaysISO(today, -60);
  const [allowance, setAllowance] = useState<AllowanceId>(() => initialAllowance ?? usage.find((u) => u.remaining > 0)?.id ?? 'learning');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState<ReceiptFile | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const u = usage.find((x) => x.id === allowance);
  const n = Number(amount);
  const issues: Record<'amount' | 'merchant' | 'date' | 'description' | 'receipt', string | null> = {
    amount: !(n > 0) ? 'Enter the amount you spent' : u && n > u.remaining ? `Only ${aed(u.remaining)} left in this allowance` : null,
    merchant: merchant.trim().length < 2 ? 'Where did you buy it?' : null,
    date: !date ? 'Pick the purchase date' : date > today ? 'The date can’t be in the future' : date < minDate ? 'Claims must be made within 60 days of the purchase' : null,
    description: description.trim().length < 3 ? 'Describe what you bought' : null,
    receipt: receipt ? null : 'Attach the receipt',
  };
  const valid = Object.values(issues).every((x) => !x);
  const show = (k: keyof typeof issues) => (tried ? issues[k] : null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setReceipt({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) });
    setError(null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!valid || !receipt) return;
    const res = submitClaim({ allowance, amount: n, merchant, description, date, receiptName: receipt.name });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.result(res);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      className="hr-bn-claim-modal"
      title="New claim"
      subtitle="Approved claims are paid with the next payroll (cut-off on the 20th)."
      icon={
        <span className="hr-bn-modal-icon" aria-hidden="true">
          <Receipt />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={tried && !valid}>
            <Send aria-hidden="true" /> Submit claim
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="hr-bn-claim-form" onSubmit={submit} noValidate>
        <fieldset className="hr-bn-fieldset">
          <legend className="field-label">Which allowance?</legend>
          <div className="hr-bn-pick" role="group" aria-label="Allowance">
            {ALLOWANCES.map((a) => {
              const left = usage.find((x) => x.id === a.id)?.remaining ?? a.annual;
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={cx('hr-bn-pick__opt', allowance === a.id && 'is-selected')}
                  style={{ '--al-h': a.hue } as CSSProperties}
                  aria-pressed={allowance === a.id}
                  disabled={left <= 0}
                  onClick={() => setAllowance(a.id)}
                >
                  <Icon aria-hidden="true" />
                  <span className="hr-bn-pick__label">{a.label}</span>
                  <small>{left > 0 ? `${aed(left)} left` : 'Used up'}</small>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="hr-bn-form-grid">
          <label className="field">
            <span className="field-label">Amount (AED)</span>
            <span className="hr-bn-amount">
              <span aria-hidden="true">AED</span>
              <input
                className={cx('input', show('amount') && 'is-invalid')}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={amount}
                aria-invalid={!!show('amount')}
                onChange={(e) => setAmount(e.target.value)}
              />
            </span>
            {show('amount') ? <span className="hr-bn-err">{show('amount')}</span> : <span className="field-hint">{u ? `${aed(u.remaining)} left this year` : ''}</span>}
          </label>
          <label className="field">
            <span className="field-label">Purchase date</span>
            <input className={cx('input', show('date') && 'is-invalid')} type="date" value={date} min={minDate} max={today} aria-invalid={!!show('date')} onChange={(e) => setDate(e.target.value)} />
            {show('date') ? <span className="hr-bn-err">{show('date')}</span> : <span className="field-hint">Within the last 60 days</span>}
          </label>
          <label className="field">
            <span className="field-label">Merchant</span>
            <input className={cx('input', show('merchant') && 'is-invalid')} value={merchant} placeholder="e.g. Coursera, IKEA" aria-invalid={!!show('merchant')} onChange={(e) => setMerchant(e.target.value)} />
            {show('merchant') && <span className="hr-bn-err">{show('merchant')}</span>}
          </label>
          <label className="field">
            <span className="field-label">What did you buy?</span>
            <input className={cx('input', show('description') && 'is-invalid')} value={description} placeholder="e.g. Ergonomic chair" aria-invalid={!!show('description')} onChange={(e) => setDescription(e.target.value)} />
            {show('description') && <span className="hr-bn-err">{show('description')}</span>}
          </label>
        </div>
        <div className="field">
          <span className="field-label">Receipt</span>
          <div
            className={cx('hr-bn-drop', receipt && 'has-file', over && 'is-over', show('receipt') && 'is-invalid')}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {receipt ? (
              <div className="hr-bn-drop__file">
                <Paperclip aria-hidden="true" />
                <span className="truncate">{receipt.name}</span>
                <small>{receipt.sizeKb >= 1024 ? `${(receipt.sizeKb / 1024).toFixed(1)} MB` : `${receipt.sizeKb} KB`}</small>
                <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove receipt" onClick={() => setReceipt(null)}>
                  <X />
                </button>
              </div>
            ) : (
              <button type="button" className="hr-bn-drop__pick" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" />
                <span>
                  <b>Attach your receipt</b>
                  <small>PDF or photo · drag and drop works too</small>
                </span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {show('receipt') ? <span className="hr-bn-err">{show('receipt')}</span> : <span className="field-hint">We keep the file name with your claim for People Ops.</span>}
        </div>
        {error && (
          <p className="hr-bn-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
