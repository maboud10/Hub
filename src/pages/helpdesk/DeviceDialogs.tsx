/**
 * Owner-side device dialogs: report lost/stolen (P1 + remote lock), schedule a
 * return, and the 30-second recovery key reveal (audited).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Copy, Eye, EyeOff, KeyRound, Lock, ShieldAlert, Truck } from 'lucide-react';
import { Ring } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device } from '@/helpdesk/types';
import { DAY } from '@/helpdesk/meta';
import { encryptionName } from '@/helpdesk/fleet';

const WHEN = ['Within the last hour', 'Earlier today', 'Yesterday', 'More than a day ago'];

export function ReportLostModal({ d, open, onClose }: { d: Device; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [stolen, setStolen] = useState(false);
  const [where, setWhere] = useState('');
  const [when, setWhen] = useState(WHEN[1]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const r = useHelpdesk.getState().reportLost(d.assetTag, { where, when, details, stolen });
    if (!r.ok) return setError(r.error);
    onClose();
    toast.warning(`${d.assetTag} locked · Security alerted`, `${r.ticketId} opened as P1 — keep your phone close.`);
    navigate(`/helpdesk/tickets/${r.ticketId}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      className="neo-portal hd-lostmodal"
      icon={
        <span className="hd-fixmodal__icon" data-tone="danger">
          <ShieldAlert />
        </span>
      }
      title="Report lost or stolen"
      subtitle={`${d.model} · ${d.assetTag}`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--danger" onClick={submit} data-qa="lost-submit">
            <Lock /> Lock device &amp; report
          </button>
        </>
      }
    >
      <div className="hd-form">
        <div className="hd-choices" role="radiogroup" aria-label="What happened">
          {[
            { v: false, l: 'Lost', s: 'Misplaced or left behind' },
            { v: true, l: 'Stolen', s: 'Taken by someone' },
          ].map((o) => (
            <button key={o.l} type="button" role="radio" aria-checked={stolen === o.v} className={cx('hd-choices__opt', stolen === o.v && 'is-on')} onClick={() => setStolen(o.v)}>
              <b>{o.l}</b>
              <span>{o.s}</span>
            </button>
          ))}
        </div>
        <label className="neo-field">
          <span className="neo-label">Where did you last have it?</span>
          <input className="neo-input" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Taxi from DXB Terminal 3, London office 4F" autoFocus data-qa="lost-where" />
        </label>
        <label className="neo-field">
          <span className="neo-label">When?</span>
          <select className="neo-select" value={when} onChange={(e) => setWhen(e.target.value)}>
            {WHEN.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label className="neo-field">
          <span className="neo-label">Anything else? (optional)</span>
          <textarea className="neo-textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={stolen ? 'Police report number, what else was taken…' : 'Places you have already checked…'} />
        </label>
        <ol className="hd-next">
          <li>
            <b>Remote lock</b> is sent the moment you submit — the device shows a “Return to Helix IT” screen.
          </li>
          <li>
            <b>Security is paged</b> with a P1 ticket and will contact you within the hour.
          </li>
          <li>
            Your data stays safe: {d.compliance?.encrypted ? `${encryptionName(d)} is on and the key is escrowed.` : 'we will wipe it remotely if it is not recovered.'}
          </li>
        </ol>
        {error && (
          <p className="hd-formerr" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

const isoDay = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function ScheduleReturnModal({ d, open, onClose }: { d: Device; open: boolean; onClose: () => void }) {
  const [day, setDay] = useState(() => isoDay(Date.now() + 2 * DAY));
  const [error, setError] = useState('');
  const remote = d.office === 'Remote';
  const submit = () => {
    const at = new Date(`${day}T10:00:00`).getTime();
    const r = useHelpdesk.getState().scheduleReturn(d.assetTag, at);
    if (!r.ok) return setError(r.error);
    onClose();
    toast.success('Return booked', remote ? 'A prepaid courier label is on its way to your inbox.' : `Drop it at the ${d.office} IT bar on ${new Date(at).toDateString()}.`);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      className="neo-portal"
      icon={
        <span className="hd-fixmodal__icon">
          <Truck />
        </span>
      }
      title="Schedule a return"
      subtitle={`${d.model} · ${d.assetTag}`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={submit} data-qa="return-submit">
            Book return
          </button>
        </>
      }
    >
      <div className="hd-form">
        <label className="neo-field">
          <span className="neo-label">{remote ? 'Courier pickup day' : `Drop-off day at the ${d.office} IT bar`}</span>
          <input type="date" className="neo-input" value={day} min={isoDay(Date.now())} onChange={(e) => setDay(e.target.value)} />
        </label>
        <ul className="hd-next hd-next--plain">
          <li>Sign out of iCloud / personal accounts and back up anything personal.</li>
          <li>Bring the charger and any accessories in the box.</li>
          <li>IT will wipe and re-image it, then confirm the hand-back in your custody log.</li>
        </ul>
        {error && (
          <p className="hd-formerr" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

const REVEAL_MS = 30_000;

/** Recovery key: confirm → shown for 30 s with a countdown ring → auto-hide. */
export function RecoveryKeyCard({ d }: { d: Device }) {
  const [stage, setStage] = useState<'hidden' | 'confirm' | 'shown'>('hidden');
  const [key, setKey] = useState('');
  const [until, setUntil] = useState(0);
  const [left, setLeft] = useState(REVEAL_MS);

  useEffect(() => {
    if (stage !== 'shown') return;
    const id = window.setInterval(() => {
      const ms = until - Date.now();
      if (ms <= 0) {
        setStage('hidden');
        setKey('');
      } else setLeft(ms);
    }, 200);
    return () => window.clearInterval(id);
  }, [stage, until]);

  useEffect(() => {
    setStage('hidden');
    setKey('');
  }, [d.assetTag]);

  const reveal = () => {
    const r = useHelpdesk.getState().revealRecoveryKey(d.assetTag);
    if (!r.ok) {
      setStage('hidden');
      return toast.error(r.error);
    }
    setKey(r.key);
    setUntil(Date.now() + REVEAL_MS);
    setLeft(REVEAL_MS);
    setStage('shown');
  };

  return (
    <div className="hd-rkey" data-stage={stage}>
      <div className="hd-rkey__head">
        <span className="hd-rkey__icon">
          <KeyRound />
        </span>
        <div className="grow">
          <b>{encryptionName(d)} recovery key</b>
          <span>{d.recoveryKey ? 'Escrowed with Helix IT · every reveal is audited' : 'No key escrowed yet — turn on encryption first'}</span>
        </div>
        {stage === 'hidden' && d.recoveryKey && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setStage('confirm')} data-qa="rkey-reveal">
            <Eye /> Reveal
          </button>
        )}
      </div>
      {stage === 'confirm' && (
        <div className="hd-rkey__confirm">
          <p>Only reveal the key if your device asks for it at start-up or IT asked you to. The reveal is logged and the key hides itself after 30 seconds.</p>
          <div className="row">
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setStage('hidden')}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={reveal} data-qa="rkey-confirm">
              Show key for 30 s
            </button>
          </div>
        </div>
      )}
      {stage === 'shown' && (
        <div className="hd-rkey__shown">
          <code className="hd-rkey__key" aria-label="Recovery key">
            {key.split('-').map((g, i) => (
              <span key={i}>{g}</span>
            ))}
          </code>
          <div className="hd-rkey__tools">
            <Ring value={left / REVEAL_MS} size={34} stroke={3} label={`Hides in ${Math.ceil(left / 1000)} seconds`}>
              {Math.ceil(left / 1000)}
            </Ring>
            <button
              type="button"
              className="neo-iconbtn neo-iconbtn--sm"
              aria-label="Copy key"
              data-tip="Copy"
              onClick={() => {
                void navigator.clipboard?.writeText(key).catch(() => undefined);
                toast.success('Key copied', 'Clipboard clears when you copy something else.');
              }}
            >
              <Copy />
            </button>
            <button
              type="button"
              className="neo-iconbtn neo-iconbtn--sm"
              aria-label="Hide key"
              data-tip="Hide"
              onClick={() => {
                setStage('hidden');
                setKey('');
              }}
            >
              <EyeOff />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
