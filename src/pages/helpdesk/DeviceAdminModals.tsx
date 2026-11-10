/**
 * IT-only device admin forms: lifecycle dialogs (loan, repair, retire, lost),
 * the typed-confirmation wipe and the edit-details form.
 */
import { useState } from 'react';
import { Eraser, PencilLine } from 'lucide-react';
import { PeoplePicker } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device, Office } from '@/helpdesk/types';
import { DAY, OFFICES } from '@/helpdesk/meta';
import { Person } from './ui';

export type LifecycleMode = 'loan' | 'repair' | 'retire' | 'lost';

const isoDay = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const dayToTs = (s: string) => new Date(`${s}T17:00:00`).getTime();

const VENDORS = ['Apple Authorised Service', 'Dell ProSupport', 'Helix IT bench', 'Logitech RMA', 'Yubico RMA'];
const RETIRE_REASONS = ['End of life — 36-month refresh', 'Damaged beyond economic repair', 'Lost — written off', 'Sold to employee', 'Recycled (certified e-waste)'];

const TITLES: Record<LifecycleMode, string> = { loan: 'Check out as loaner', repair: 'Send to repair', retire: 'Retire device', lost: 'Mark as lost' };

export function LifecycleModal({ d, mode, onClose }: { d: Device; mode: LifecycleMode | null; onClose: () => void }) {
  const users = useHub((s) => s.users);
  const [person, setPerson] = useState<string[]>([]);
  const [due, setDue] = useState(() => isoDay(Date.now() + 7 * DAY));
  const [vendor, setVendor] = useState(VENDORS[0]);
  const [eta, setEta] = useState(() => isoDay(Date.now() + 5 * DAY));
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(RETIRE_REASONS[0]);
  const [error, setError] = useState('');
  if (!mode) return null;
  const s = useHelpdesk.getState();

  const submit = () => {
    let r: { ok: boolean; error?: string };
    if (mode === 'loan') {
      if (!person[0]) return setError('Pick who is borrowing it.');
      r = s.checkoutLoaner(d.assetTag, person[0], dayToTs(due));
    } else if (mode === 'repair') r = s.sendToRepair(d.assetTag, { vendor, eta: dayToTs(eta), note });
    else if (mode === 'retire') r = s.retireDevice(d.assetTag, reason);
    else r = s.markLost(d.assetTag);
    if (!r.ok) return setError(r.error ?? 'Something went wrong.');
    onClose();
    if (mode === 'loan') toast.success(`${d.assetTag} loaned`, `${users.find((u) => u.id === person[0])?.name} · due ${new Date(dayToTs(due)).toDateString()}`);
    else if (mode === 'repair') toast.success(`${d.assetTag} sent to ${vendor}`, d.assigneeId ? 'The owner has been notified.' : undefined);
    else if (mode === 'retire') toast.info(`${d.assetTag} retired`, reason);
    else toast.warning(`${d.assetTag} marked lost`, 'Remote lock sent · audit logged.');
  };

  const danger = mode === 'retire' || mode === 'lost';
  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      className="neo-portal"
      title={TITLES[mode]}
      subtitle={`${d.model} · ${d.assetTag}`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={danger ? 'neo-btn neo-btn--danger' : 'neo-btn neo-btn--plasma'} onClick={submit} data-qa="lifecycle-submit">
            {TITLES[mode]}
          </button>
        </>
      }
    >
      <div className="hd-form">
        {mode === 'loan' && (
          <>
            <div className="neo-field">
              <span className="neo-label">Borrower</span>
              <PeoplePicker
                value={person}
                onChange={setPerson}
                label="Choose borrower"
                trigger={(p) => (
                  <button {...p} type="button" className="hd-pickbtn">
                    {person[0] ? <Person userId={person[0]} size={26} /> : <span className="neo-faint">Choose a person…</span>}
                  </button>
                )}
              />
            </div>
            <label className="neo-field">
              <span className="neo-label">Due back</span>
              <input type="date" className="neo-input" value={due} min={isoDay(Date.now() + DAY)} onChange={(e) => setDue(e.target.value)} />
            </label>
          </>
        )}
        {mode === 'repair' && (
          <>
            <label className="neo-field">
              <span className="neo-label">Repair partner</span>
              <select className="neo-select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
                {VENDORS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="neo-field">
              <span className="neo-label">Expected back</span>
              <input type="date" className="neo-input" value={eta} onChange={(e) => setEta(e.target.value)} />
            </label>
            <label className="neo-field">
              <span className="neo-label">Fault (optional)</span>
              <input className="neo-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Battery swelling, keyboard unresponsive" />
            </label>
            {d.assigneeId && <p className="neo-hint">Tip: check out a loaner to {users.find((u) => u.id === d.assigneeId)?.name.split(' ')[0]} so they are not blocked.</p>}
          </>
        )}
        {mode === 'retire' && (
          <label className="neo-field">
            <span className="neo-label">Reason</span>
            <select className="neo-select" value={reason} onChange={(e) => setReason(e.target.value)}>
              {RETIRE_REASONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <span className="neo-hint">Retiring unassigns the device and removes it from MDM compliance reporting.</span>
          </label>
        )}
        {mode === 'lost' && <p className="hd-warnnote">This marks {d.assetTag} as lost, sends a remote lock (if enrolled) and writes a critical audit event. You can mark it found later.</p>}
        {error && (
          <p className="hd-formerr" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function WipeModal({ d, open, onClose }: { d: Device; open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const match = typed.trim().toUpperCase() === d.assetTag;
  const submit = () => {
    const r = useHelpdesk.getState().mdmAction(d.assetTag, 'wipe', { confirmTag: typed });
    if (!r.ok) return setError(r.error);
    setTyped('');
    onClose();
    toast.warning(`Wipe sent to ${d.assetTag}`, 'Watch the live log — this cannot be undone.');
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      className="neo-portal"
      icon={
        <span className="hd-fixmodal__icon" data-tone="danger">
          <Eraser />
        </span>
      }
      title="Remote wipe"
      subtitle={`${d.model} · ${d.assetTag}`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--danger" onClick={submit} disabled={!match} data-qa="wipe-submit">
            <Eraser /> Erase device
          </button>
        </>
      }
    >
      <div className="hd-form">
        <p className="hd-warnnote">Erases all content and settings. Activation Lock stays on, so a stolen device remains useless. This is irreversible and audited as critical.</p>
        <label className="neo-field">
          <span className="neo-label">
            Type <code className="neo-mono">{d.assetTag}</code> to confirm
          </span>
          <input className="neo-input neo-mono" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={d.assetTag} autoComplete="off" spellCheck={false} data-qa="wipe-confirm" />
        </label>
        {error && (
          <p className="hd-formerr" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function EditDeviceModal({ d, open, onClose }: { d: Device; open: boolean; onClose: () => void }) {
  const [model, setModel] = useState(d.model);
  const [serial, setSerial] = useState(d.serial);
  const [office, setOffice] = useState<Office>(d.office);
  const [os, setOs] = useState(d.os ?? '');
  const [specs, setSpecs] = useState(d.specs ?? '');
  const [cost, setCost] = useState(String(d.cost));
  const [warranty, setWarranty] = useState(isoDay(d.warrantyEnd));
  const [notes, setNotes] = useState(d.notes ?? '');
  const [error, setError] = useState('');
  const save = () => {
    const patch: Parameters<ReturnType<typeof useHelpdesk.getState>['updateDevice']>[1] = {};
    if (model !== d.model) patch.model = model;
    if (serial !== d.serial) patch.serial = serial;
    if (office !== d.office) patch.office = office;
    if (os !== (d.os ?? '')) patch.os = os || undefined;
    if (specs !== (d.specs ?? '')) patch.specs = specs || undefined;
    if (Number(cost) !== d.cost) patch.cost = Number(cost);
    if (isoDay(d.warrantyEnd) !== warranty) patch.warrantyEnd = dayToTs(warranty);
    if (notes !== (d.notes ?? '')) patch.notes = notes || undefined;
    if (!Object.keys(patch).length) return onClose();
    const r = useHelpdesk.getState().updateDevice(d.assetTag, patch);
    if (!r.ok) return setError(r.error);
    onClose();
    toast.success('Device updated', d.assetTag);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      className="neo-portal"
      icon={
        <span className="hd-fixmodal__icon">
          <PencilLine />
        </span>
      }
      title="Edit device"
      subtitle={d.assetTag}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save} data-qa="edit-save">
            Save changes
          </button>
        </>
      }
    >
      <div className="hd-form hd-form--grid">
        <label className="neo-field">
          <span className="neo-label">Model</span>
          <input className="neo-input" value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="neo-field">
          <span className="neo-label">Serial</span>
          <input className="neo-input neo-mono" value={serial} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <label className="neo-field">
          <span className="neo-label">Office</span>
          <select className="neo-select" value={office} onChange={(e) => setOffice(e.target.value as Office)}>
            {OFFICES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="neo-field">
          <span className="neo-label">Operating system</span>
          <input className="neo-input" value={os} onChange={(e) => setOs(e.target.value)} placeholder="—" />
        </label>
        <label className="neo-field hd-form__wide">
          <span className="neo-label">Specs</span>
          <input className="neo-input" value={specs} onChange={(e) => setSpecs(e.target.value)} placeholder="e.g. M4 Max · 64 GB · 2 TB" />
        </label>
        <label className="neo-field">
          <span className="neo-label">Cost (USD)</span>
          <input className="neo-input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="neo-field">
          <span className="neo-label">Warranty ends</span>
          <input type="date" className="neo-input" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
        </label>
        <label className="neo-field hd-form__wide">
          <span className="neo-label">Notes</span>
          <textarea className="neo-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && (
          <p className="hd-formerr hd-form__wide" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
