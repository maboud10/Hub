/**
 * Record data-processing consent (GDPR / UAE PDPL). Explains what is stored,
 * why, for how long and the candidate's rights; captures how consent was
 * given (email, LinkedIn, application form or verbal) with an explicit
 * confirmation. Consent unlocks assessment — and, when interest is already
 * confirmed, moves the candidate to Interested automatically.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, ClipboardCheck, Database, Linkedin, Mail, PhoneCall, Scale, ShieldCheck, Target } from 'lucide-react';
import type { Consent } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { useTalentCaps } from '@/talent/selectors';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { fmtDay } from '../components/format';
import { Callout } from '../pipeline/Callout';
import { ChoiceCards, type ChoiceOption } from '../pipeline/ChoiceCards';
import { ConsentBadge } from '../pipeline/ConsentBadge';
import { CandidateLine, MissingRecord, ModalIcon, StepHead } from '../pipeline/ModalBits';
import { firstName } from '../pipeline/pipelineUtils';

type Method = NonNullable<Consent['method']>;
const RETENTION_DAYS = 540;
const DAY = 86_400_000;

const METHODS: ChoiceOption<Method>[] = [
  { value: 'email', label: 'Email reply', hint: 'Confirmed in writing by email', icon: Mail },
  { value: 'linkedin', label: 'LinkedIn message', hint: 'Confirmed in a LinkedIn conversation', icon: Linkedin },
  { value: 'application', label: 'Application form', hint: 'Ticked the consent box when applying', icon: ClipboardCheck },
  { value: 'verbal', label: 'Verbal', hint: 'Said yes on a call. Add who and when in a note.', icon: PhoneCall },
];
const METHOD_TEXT: Record<Method, string> = { email: 'an email reply', linkedin: 'a LinkedIn message', application: 'the application form', verbal: 'a verbal confirmation' };

export function ConsentModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'consent' }>; open: boolean; onClose: () => void }) {
  const cand = useTalent((s) => s.candidates.find((c) => c.id === modal.candidateId));
  const outreach = useTalent((s) => s.outreach);
  const recordConsent = useTalent((s) => s.recordConsent);
  const caps = useTalentCaps();

  const suggested = useMemo<Method>(() => {
    if (!cand) return 'email';
    if (cand.source === 'inbound') return 'application';
    const last = outreach
      .filter((o) => o.candidateId === cand.id && o.status !== 'draft')
      .sort((a, b) => (b.respondedAt ?? b.sentAt ?? b.createdAt) - (a.respondedAt ?? a.sentAt ?? a.createdAt))[0];
    if (last?.channel.startsWith('linkedin')) return 'linkedin';
    return 'email';
  }, [cand, outreach]);
  const [method, setMethod] = useState<Method>(suggested);
  const [confirmed, setConfirmed] = useState(false);
  const retainUntil = Date.now() + RETENTION_DAYS * DAY;

  if (!cand) {
    return (
      <Modal open={open} onClose={onClose} title="Record consent" icon={<ModalIcon icon={ShieldCheck} />}>
        <MissingRecord what="candidate" />
      </Modal>
    );
  }

  const first = firstName(cand.name);
  const canRecord = caps.manage || caps.source;
  const renewing = cand.consent.given;
  const canSubmit = canRecord && confirmed;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    if (toast.result(recordConsent(cand.id, method))) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      className="tl-mm"
      icon={<ModalIcon icon={ShieldCheck} tone="success" />}
      title={renewing ? `Renew consent for ${first}` : `Record consent for ${first}`}
      subtitle="GDPR · UAE PDPL — lawful, transparent processing of candidate data"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {canRecord && (
            <button type="submit" form="tl-mm-consent-form" className="btn btn--primary" disabled={!canSubmit} title={!confirmed ? 'Confirm the candidate agreed first' : undefined}>
              <ShieldCheck aria-hidden="true" /> {renewing ? 'Renew consent' : 'Record consent'}
            </button>
          )}
        </>
      }
    >
      <form id="tl-mm-consent-form" className="tl-mm-body" onSubmit={submit}>
        <CandidateLine cand={cand} sub={`${cand.currentTitle} · ${cand.currentCompany}`} aside={<ConsentBadge consent={cand.consent} compact />} />

        {!canRecord && <Callout tone="muted">Only recruiters record consent. Ask the recruiter on this requisition.</Callout>}

        {renewing && (
          <Callout tone="success" title="Consent already on file">
            Recorded {cand.consent.at ? `on ${fmtDay(cand.consent.at)}` : ''} via {cand.consent.method ?? 'an unspecified method'}, retained until{' '}
            {cand.consent.retentionUntil ? fmtDay(cand.consent.retentionUntil) : '—'}. Recording again restarts the 18-month window.
          </Callout>
        )}

        <section className="tl-mm-why" aria-label="What the candidate agrees to">
          <ul>
            <li>
              <Database aria-hidden="true" />
              <span>
                <b>What we store</b> Profile and experience, contact details, notes, interview feedback and offer details.
              </span>
            </li>
            <li>
              <Target aria-hidden="true" />
              <span>
                <b>Why</b> To consider {first} for this role and similar roles in future, and to stay in touch about them.
              </span>
            </li>
            <li>
              <CalendarClock aria-hidden="true" />
              <span>
                <b>How long</b> 18 months, until <span className="tl-mm-strong">{fmtDay(retainUntil)}</span>, then deleted or anonymised unless renewed.
              </span>
            </li>
            <li>
              <Scale aria-hidden="true" />
              <span>
                <b>Their rights</b> Access, correction, erasure and withdrawal of consent at any time, without affecting earlier processing.
              </span>
            </li>
          </ul>
          <div className="tl-mm-law">
            <span>GDPR Art. 6(1)(a) · Art. 7</span>
            <span>UAE PDPL · Federal Decree-Law No. 45 of 2021</span>
          </div>
        </section>

        <section className="tl-mm-sec">
          <StepHead n={1}>How did {first} give consent?</StepHead>
          <ChoiceCards options={METHODS} value={method} onChange={setMethod} label="Consent method" columns={2} size="sm" />
        </section>

        <section className="tl-mm-sec">
          <StepHead n={2}>Confirm</StepHead>
          <label className={cx('tl-mm-check', confirmed && 'is-on')}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!canRecord} />
            <span className="tl-mm-check__text">
              <b>{first} explicitly agreed</b>
              <span>
                to NEXUS storing and processing their data for recruiting, as described above, via {METHOD_TEXT[method]}.
              </span>
            </span>
          </label>
        </section>

        <p className="tl-mm-foot-note">If {first} has already confirmed interest, they move to Interested automatically once consent is recorded.</p>
      </form>
    </Modal>
  );
}
