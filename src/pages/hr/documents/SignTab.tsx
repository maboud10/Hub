/**
 * E-signatures: documents waiting for my signature, a "Review & sign" flow
 * (document preview, typed full name rendered in a handwriting font, consent,
 * the store's exact-name rule surfaced inline) and the signed history.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { CircleCheckBig, Eye, PenLine, Signature, TriangleAlert } from 'lucide-react';
import { DOC_KIND_META } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { formatDate, formatDateTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { HrPanel } from '../components/shared';
import { celebrate } from '../benefits/model';
import { DocSheet } from './sheets';
import { normName, useMyDocuments } from './model';

export function SignTab({ onSign, onOpen }: { onSign: (id: string) => void; onOpen: (id: string) => void }) {
  const mine = useMyDocuments();
  const pending = useMemo(() => mine.filter((d) => d.signature?.required && !d.signature.signedAt), [mine]);
  const signed = useMemo(() => mine.filter((d) => d.signature?.signedAt).sort((a, b) => (b.signature?.signedAt ?? 0) - (a.signature?.signedAt ?? 0)), [mine]);
  return (
    <div className="hr-doc-sign">
      <HrPanel
        hud="Electronic signature"
        title="Waiting for your signature"
        icon={<PenLine aria-hidden="true" />}
        sub={pending.length ? 'Read it, type your name, done. It takes under a minute.' : 'You’re all caught up.'}
        className={cx(pending.length > 0 && 'hr-doc-sign__todo')}
      >
        {pending.length === 0 ? (
          <EmptyState
            icon={<CircleCheckBig />}
            title="Nothing to sign"
            action={
              signed[0] ? (
                <button type="button" className="btn btn--sm" onClick={() => onOpen(signed[0].id)}>
                  <Eye aria-hidden="true" /> View your latest signed document
                </button>
              ) : undefined
            }
          >
            New agreements from People Ops land here, and we’ll let you know when one arrives.
          </EmptyState>
        ) : (
          <ul className="hr-doc-sign__list">
            {pending.map((d) => {
              const meta = DOC_KIND_META[d.kind];
              const Icon = meta.icon;
              return (
                <li key={d.id} className="hr-doc-sign__item" style={{ '--doc-h': meta.hue } as CSSProperties}>
                  <span className="hr-doc-kind" aria-hidden="true">
                    <Icon />
                  </span>
                  <div className="grow">
                    <b>{d.title}</b>
                    {d.description && <p className="text-sm muted">{d.description}</p>}
                    <span className="text-xs faint">Sent {formatDate(d.createdAt)} by People Ops</span>
                  </div>
                  <div className="hr-doc-sign__actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOpen(d.id)}>
                      <Eye aria-hidden="true" /> Read
                    </button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => onSign(d.id)}>
                      <Signature aria-hidden="true" /> Review &amp; sign
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </HrPanel>
      {signed.length > 0 && (
        <HrPanel hud="Archive" title="Signed" icon={<CircleCheckBig aria-hidden="true" />} sub="Copies stay in your vault, with the time you signed.">
          <ul className="hr-doc-signed-list">
            {signed.map((d) => (
              <li key={d.id}>
                <div className="grow">
                  <b>{d.title}</b>
                  <span className="text-xs faint">{d.signature?.signedAt ? `Signed electronically · ${formatDateTime(d.signature.signedAt)}` : ''}</span>
                </div>
                <span className="hr-doc-script hr-doc-signed-list__sig">{d.signature?.signedName}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOpen(d.id)}>
                  <Eye aria-hidden="true" /> View
                </button>
              </li>
            ))}
          </ul>
        </HrPanel>
      )}
    </div>
  );
}

/** Remounts per open so the typed name and consent start empty. */
export function SignModal({ docId, open, onClose }: { docId: string | null; open: boolean; onClose: () => void }) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return <SignDialog key={session} docId={docId} open={open} onClose={onClose} />;
}

function SignDialog({ docId, open, onClose }: { docId: string | null; open: boolean; onClose: () => void }) {
  const me = useSessionUser();
  const doc = useHr((s) => (docId ? s.documents.find((d) => d.id === docId) : undefined));
  const signDocument = useHr((s) => s.signDocument);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [signedHere, setSignedHere] = useState(false);

  if (!doc || !me || doc.userId !== me.id) return null;
  const alreadySigned = !!doc.signature?.signedAt && !signedHere;
  const typed = name.trim();
  const matches = !!typed && normName(typed) === normName(me.name);

  const submit = () => {
    const res = signDocument(doc.id, name);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSignedHere(true);
    toast.result(res);
    celebrate();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={880}
      className="hr-doc-signmodal"
      title={alreadySigned ? 'Already signed' : 'Review & sign'}
      subtitle={alreadySigned ? `${doc.title} · signed electronically ${formatDateTime(doc.signature!.signedAt!)}` : `${doc.title} · read it, then type your full name to sign.`}
      icon={
        <span className="hr-doc-kind" aria-hidden="true">
          <Signature />
        </span>
      }
      footer={
        alreadySigned ? (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Not now
            </button>
            <button type="button" className="btn btn--primary" disabled={!typed || !consent} onClick={submit}>
              <Signature aria-hidden="true" /> Sign document
            </button>
          </>
        )
      }
    >
      <div className="hr-doc-signflow">
        <div className="hr-doc-stage hr-doc-stage--compact" tabIndex={0} aria-label="Document preview">
          <DocSheet doc={doc} />
        </div>
        {!alreadySigned && (
          <section className="hr-doc-esign" aria-label="Electronic signature">
            <label className="field">
              <span className="field-label">Type your full name</span>
              <input
                className={cx('input hr-doc-esign__input', error && 'is-invalid')}
                value={name}
                autoComplete="name"
                spellCheck={false}
                placeholder={me.name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typed && consent) submit();
                }}
              />
            </label>
            <div className={cx('hr-doc-esign__pad', typed && 'has-name', matches && 'is-match')}>
              <span className="hr-doc-esign__x" aria-hidden="true">
                ✕
              </span>
              <span className="hr-doc-script hr-doc-esign__sig">{typed || 'Your signature'}</span>
              <span className="hr-doc-esign__meta">
                {me.name} · {formatDateTime(now)}
              </span>
            </div>
            <p className={cx('hr-doc-esign__hint', matches && 'is-match')} role="status">
              {matches ? (
                <>
                  <CircleCheckBig aria-hidden="true" /> Matches the name on your HR record
                </>
              ) : (
                <>Type it exactly as on your HR record: {me.name}</>
              )}
            </p>
            <label className="hr-doc-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I’ve read this document and agree that typing my name is my legal electronic signature.</span>
            </label>
            {error && (
              <p className="hr-doc-error" role="alert">
                <TriangleAlert aria-hidden="true" /> {error}
              </p>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
