/**
 * Approver & IT cards for catalog requests: approve / decline (with a note)
 * and fulfilment (assign a matching stock device or confirm access).
 */
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Check, PackageCheck, X } from 'lucide-react';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { burstConfetti } from '@/lib/confetti';
import { useHelpdesk } from '@/helpdesk/store';
import type { CatalogItem, CatalogRequest } from '@/helpdesk/types';
import { currentStep } from '@/helpdesk/eligibility';
import { officeOf } from '@/helpdesk/meta';
import { useHub } from '@/store/hub';
import { etaLabel, ItemVisual, priceLabel } from './catalogParts';
import { RequestTracker } from './trackers';
import { Person } from './ui';

const ROLE_AS = { manager: 'As their manager', it: 'As IT', security: 'As Security' } as const;

export function OptionChips({ r }: { r: CatalogRequest }) {
  const vals = Object.values(r.options);
  if (!vals.length) return null;
  return (
    <span className="hd-optchips">
      {vals.map((v) => (
        <span key={v}>{v}</span>
      ))}
    </span>
  );
}

export function ApprovalCard({ r, item }: { r: CatalogRequest; item: CatalogItem }) {
  const users = useHub((s) => s.users);
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const step = currentStep(r);
  const requester = users.find((u) => u.id === r.requesterId);

  const decide = (approve: boolean, e?: ReactMouseEvent) => {
    const res = useHelpdesk.getState().decideRequest(r.id, approve, note);
    if (!res.ok) return toast.error(res.error);
    if (approve) {
      if (e) burstConfetti({ x: e.clientX, y: e.clientY });
      toast.success(`Approved ${r.id}`, `${requester?.name.split(' ')[0] ?? 'They'} will be notified${step?.role === 'manager' ? ' · next: IT' : ''}.`);
    } else toast.info(`Declined ${r.id}`, 'Your note was sent to the requester.');
  };

  return (
    <article className="hd-req hd-req--approve" id={`req-${r.id}`} style={{ ['--accent' as string]: item.accent }} data-qa={`approve-${r.id}`}>
      <header className="hd-req__head">
        <Person userId={r.requesterId} size={34} sub={`${requester?.title ?? ''} · ${relativeTime(r.createdAt)}`} />
        {step && <span className="hd-req__as">{ROLE_AS[step.role]}</span>}
      </header>
      <div className="hd-req__ask">
        <ItemVisual item={item} size={item.kind === 'hardware' ? 40 : 38} />
        <div className="hd-req__asktext">
          <b>{item.name}</b>
          <span>
            <span className="neo-mono">{r.id}</span> · {priceLabel(item)} · {etaLabel(item)}
          </span>
          <OptionChips r={r} />
        </div>
      </div>
      {r.justification && <blockquote className="hd-req__why">“{r.justification}”</blockquote>}
      <RequestTracker r={r} item={item} requester={false} compact />
      {denying ? (
        <div className="hd-req__deny">
          <textarea className="neo-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Let them know why (they’ll see this)…" autoFocus />
          <div className="row">
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setDenying(false)}>
              Back
            </button>
            <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" onClick={() => decide(false)} disabled={!note.trim()} data-qa={`deny-confirm-${r.id}`}>
              Decline request
            </button>
          </div>
        </div>
      ) : (
        <div className="hd-req__decide">
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setDenying(true)} data-qa={`deny-${r.id}`}>
            <X /> Decline
          </button>
          <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={(e) => decide(true, e)} data-qa={`approve-btn-${r.id}`}>
            <Check /> Approve
          </button>
        </div>
      )}
    </article>
  );
}

export function FulfilCard({ r, item }: { r: CatalogRequest; item: CatalogItem }) {
  const users = useHub((s) => s.users);
  const devices = useHelpdesk((s) => s.devices);
  const requester = users.find((u) => u.id === r.requesterId);
  const office = officeOf(requester?.location);
  const stock = useMemo(
    () =>
      devices
        .filter((d) => d.status === 'in_stock' && d.kind === item.deviceKind && (!item.stockModel || d.model.startsWith(item.stockModel)))
        .sort((a, b) => Number(b.office === office) - Number(a.office === office) || b.purchasedAt - a.purchasedAt),
    [devices, item, office],
  );
  const [tag, setTag] = useState(stock[0]?.assetTag ?? '');
  const [note, setNote] = useState('');
  const hw = item.kind === 'hardware';

  const fulfil = () => {
    const res = useHelpdesk.getState().fulfilRequest(r.id, { deviceTag: hw ? tag : undefined, note });
    if (!res.ok) return toast.error(res.error);
    toast.success(`${r.id} fulfilled`, hw ? `${tag} assigned to ${requester?.name} · custody logged` : `${requester?.name} has been notified`);
  };

  return (
    <article className="hd-req" id={`req-${r.id}`} style={{ ['--accent' as string]: item.accent }} data-qa={`fulfil-${r.id}`}>
      <header className="hd-req__head">
        <Person userId={r.requesterId} size={34} sub={`${office} · approved ${relativeTime(r.updatedAt)}`} />
        <span className="hd-reqstatus" data-s="approved">
          Ready
        </span>
      </header>
      <div className="hd-req__ask">
        <ItemVisual item={item} size={hw ? 40 : 38} />
        <div className="hd-req__asktext">
          <b>{item.name}</b>
          <span>
            <span className="neo-mono">{r.id}</span> · {priceLabel(item)}
          </span>
          <OptionChips r={r} />
        </div>
      </div>
      <div className="hd-req__fulfil">
        {hw && (
          <label className="neo-field">
            <span className="neo-label">Hand over from stock</span>
            {stock.length ? (
              <select className="neo-select neo-select--sm" value={tag} onChange={(e) => setTag(e.target.value)} data-qa={`fulfil-device-${r.id}`}>
                {stock.map((d) => (
                  <option key={d.assetTag} value={d.assetTag}>
                    {d.assetTag} · {d.model} · {d.office}
                  </option>
                ))}
              </select>
            ) : (
              <span className="hd-muted-note">No matching device in stock — register one in Fleet first.</span>
            )}
          </label>
        )}
        <label className="neo-field">
          <span className="neo-label">Note to {requester?.name.split(' ')[0] ?? 'requester'}</span>
          <input className="neo-input neo-input--sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={hw ? 'e.g. Ready at the IT bar from 10:00' : 'e.g. Seat assigned — sign out and back in'} />
        </label>
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={fulfil} disabled={hw && !tag} data-qa={`fulfil-btn-${r.id}`}>
          <PackageCheck /> Fulfil &amp; notify
        </button>
      </div>
    </article>
  );
}
