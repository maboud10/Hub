/**
 * Policies: progress on required acknowledgements, every policy with its
 * version, mandatory badge and status ("Updated" when you acknowledged an
 * older version, with what changed), and a reader with the key points and an
 * "I have read and understood" acknowledgement.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { BookOpen, CircleCheckBig, Clock, ScrollText, Sparkles } from 'lucide-react';
import { POLICIES, POLICY_BY_ID, type PolicyMeta } from '@/hr/constants';
import { useHr } from '@/hr/store';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { formatDate } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { celebrate } from '../benefits/model';
import { policyState, type PolicyState } from './model';

const RANK: Record<PolicyState['state'], number> = { updated: 0, todo: 1, done: 2 };

export function PoliciesTab() {
  const me = useSessionUser();
  const acks = useHr((s) => s.acks);
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () =>
      POLICIES.map((p) => ({ p, st: policyState(p, acks, me?.id) })).sort(
        (a, b) => Number(b.p.mandatory && b.st.state !== 'done') - Number(a.p.mandatory && a.st.state !== 'done') || RANK[a.st.state] - RANK[b.st.state],
      ),
    [acks, me],
  );
  const required = rows.filter((r) => r.p.mandatory);
  const done = required.filter((r) => r.st.state === 'done').length;
  const pct = required.length ? Math.round((done / required.length) * 100) : 100;
  const openPolicy = (id: string) => {
    setOpenId(id);
    setOpen(true);
  };

  return (
    <div className="hr-doc-policies">
      <section className={cx('neo-panel card hr-doc-polhead', done === required.length && 'is-complete')} aria-label="Policy progress">
        <div className="hr-doc-polhead__ring" role="img" aria-label={`${done} of ${required.length} required policies acknowledged`} style={{ '--p': pct } as CSSProperties}>
          <b>
            {done}/{required.length}
          </b>
        </div>
        <div className="grow">
          <div className="neo-hud">Handbook &amp; governance</div>
          <h2 className="section-title">{done === required.length ? 'You’re fully up to date' : 'A few minutes of reading'}</h2>
          <p className="text-sm muted">
            {done === required.length
              ? 'Every required policy is acknowledged. We’ll let you know when one changes.'
              : `${required.length - done} required polic${required.length - done === 1 ? 'y needs' : 'ies need'} your acknowledgement. Updated ones show exactly what changed.`}
          </p>
          <div className="progress hr-doc-polhead__bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>
      <div className="hr-doc-pols">
        {rows.map(({ p, st }) => (
          <PolicyCard key={p.id} policy={p} state={st} onOpen={() => openPolicy(p.id)} />
        ))}
      </div>
      <PolicyReader policyId={openId} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function PolicyCard({ policy: p, state: st, onOpen }: { policy: PolicyMeta; state: PolicyState; onOpen: () => void }) {
  const Icon = p.icon;
  return (
    <article className={cx('hr-doc-pol', `is-${st.state}`, p.mandatory && 'is-mandatory')}>
      <header className="hr-doc-pol__head">
        <span className="hr-doc-pol__icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="grow">
          <h3 className="hr-doc-pol__title">{p.title}</h3>
          <div className="hr-doc-pol__tags">
            <span className="tag">v{p.version}</span>
            {p.mandatory ? <span className="badge badge--info">Required</span> : <span className="badge badge--muted">Optional</span>}
            {st.state === 'updated' && <span className="badge badge--warning">Updated</span>}
            <span className="hr-doc-pol__mins">
              <Clock aria-hidden="true" /> {p.readMins} min
            </span>
          </div>
        </div>
      </header>
      <p className="hr-doc-pol__summary">{p.summary}</p>
      {st.state === 'updated' && p.changes && (
        <p className="hr-doc-pol__changes">
          <Sparkles aria-hidden="true" />
          <span>
            <b>What changed:</b> {p.changes.replace(/^v\d+:\s*/, '')} <span className="faint">You acknowledged v{st.older?.version}.</span>
          </span>
        </p>
      )}
      <footer className="hr-doc-pol__foot">
        <span className={cx('hr-doc-pol__status', `is-${st.state}`)}>
          {st.state === 'done' ? (
            <>
              <CircleCheckBig aria-hidden="true" /> Acknowledged {st.current ? formatDate(st.current.at) : ''}
            </>
          ) : st.state === 'updated' ? (
            'Please re-acknowledge the new version'
          ) : p.mandatory ? (
            'Please read and acknowledge'
          ) : (
            'Worth a read when you have a moment'
          )}
        </span>
        <button type="button" className={cx('btn btn--sm', st.state !== 'done' && p.mandatory && 'btn--primary')} onClick={onOpen}>
          <BookOpen aria-hidden="true" /> {st.state === 'done' ? 'Re-read' : st.state === 'updated' ? 'Read update' : 'Read'}
        </button>
      </footer>
    </article>
  );
}

/** Remounts per open so the acknowledgement box starts unticked. */
function PolicyReader({ policyId, open, onClose }: { policyId: string | null; open: boolean; onClose: () => void }) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return <ReaderDialog key={session} policyId={policyId} open={open} onClose={onClose} />;
}

function ReaderDialog({ policyId, open, onClose }: { policyId: string | null; open: boolean; onClose: () => void }) {
  const me = useSessionUser();
  const acks = useHr((s) => s.acks);
  const acknowledgePolicy = useHr((s) => s.acknowledgePolicy);
  const [agree, setAgree] = useState(false);
  const [ackedHere, setAckedHere] = useState(false);
  const p = policyId ? POLICY_BY_ID[policyId] : undefined;
  if (!p) return null;
  const st = policyState(p, acks, me?.id);
  const done = st.state === 'done' && !ackedHere;
  const Icon = p.icon;

  const acknowledge = () => {
    const res = acknowledgePolicy(p.id);
    if (!toast.result(res)) return;
    setAckedHere(true);
    const outstanding = POLICIES.filter((x) => x.mandatory && x.id !== p.id && policyState(x, acks, me?.id).state !== 'done').length;
    if (p.mandatory && outstanding === 0) {
      celebrate();
      toast.success('All required policies done 🎉', 'Thanks for keeping Helix safe and kind.');
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={660}
      className="hr-doc-reader"
      title={p.title}
      subtitle={`Version ${p.version} · ${p.readMins}-minute read · published ${formatDate(p.publishedAt)}${p.mandatory ? ' · required' : ''}`}
      icon={
        <span className="hr-doc-kind" aria-hidden="true">
          <Icon />
        </span>
      }
      footer={
        done ? (
          <>
            <span className="hr-doc-reader__done">
              <CircleCheckBig aria-hidden="true" /> Acknowledged {st.current ? formatDate(st.current.at) : ''}
            </span>
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Later
            </button>
            <button type="button" className="btn btn--primary" disabled={!agree} onClick={acknowledge}>
              <CircleCheckBig aria-hidden="true" /> Acknowledge v{p.version}
            </button>
          </>
        )
      }
    >
      <div className="hr-doc-reader__body">
        {st.state === 'updated' && p.changes && (
          <div className="hr-doc-reader__changes">
            <Sparkles aria-hidden="true" />
            <span>
              <b>What’s new in v{p.version}</b>
              {p.changes.replace(/^v\d+:\s*/, '').replace(/^\w/, (c) => c.toUpperCase())}
              {st.older && <small>You acknowledged v{st.older.version} on {formatDate(st.older.at)}.</small>}
            </span>
          </div>
        )}
        <p className="hr-doc-reader__summary">{p.summary}</p>
        <h3 className="hr-doc-reader__h">
          <ScrollText aria-hidden="true" /> Key points
        </h3>
        <ol className="hr-doc-points">
          {p.points.map((pt, i) => (
            <li key={pt}>
              <span aria-hidden="true">{i + 1}</span>
              <p>{pt}</p>
            </li>
          ))}
        </ol>
        {!done && (
          <label className="hr-doc-consent">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I have read and understood the {p.title} policy (version {p.version}).
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
