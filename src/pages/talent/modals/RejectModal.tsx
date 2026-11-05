/**
 * Close-out dialog: pick the reason (selectable cards), add an internal note,
 * and get a respectful close-out message drafted locally from the reason,
 * the candidate's first name and the role — copy it into email or LinkedIn
 * (nothing is sent automatically). "Keep warm" tags the candidate as a
 * silver medalist so they resurface for future roles.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  CalendarX2,
  CircleCheckBig,
  Coins,
  Copy,
  DoorOpen,
  Ellipsis,
  HeartHandshake,
  Layers,
  MailQuestionMark,
  MapPin,
  Puzzle,
  RotateCcw,
  Sparkles,
  UserX,
  WandSparkles,
} from 'lucide-react';
import type { RejectionReason } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentViewer } from '@/talent/selectors';
import { REJECTION_REASONS, stageIndex } from '@/talent/constants';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { OfferStatusBadge, StageBadge } from '../components/shared';
import { copyText } from '../components/format';
import { Callout } from '../pipeline/Callout';
import { ChoiceCards, type ChoiceOption } from '../pipeline/ChoiceCards';
import { CandidateLine, MissingRecord, ModalIcon, StepHead } from '../pipeline/ModalBits';
import { actionVerdict, closeoutMessage, firstName } from '../pipeline/pipelineUtils';

const REASON_META: Record<RejectionReason, { icon: typeof Puzzle; hint: string }> = {
  skills: { icon: Puzzle, hint: 'Missing must-have skills' },
  experience: { icon: Layers, hint: 'Level or scope mismatch' },
  compensation: { icon: Coins, hint: 'Expectations outside the band' },
  location: { icon: MapPin, hint: 'Location or work model' },
  culture: { icon: HeartHandshake, hint: 'Values & ways of working' },
  'position-filled': { icon: CircleCheckBig, hint: 'Filled by another candidate' },
  'candidate-withdrew': { icon: DoorOpen, hint: 'They stepped back' },
  'no-response': { icon: MailQuestionMark, hint: 'Went quiet after follow-ups' },
  other: { icon: Ellipsis, hint: 'Something else' },
};

const SILVER = 'silver-medalist';

export function RejectModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'reject' }>; open: boolean; onClose: () => void }) {
  const app = useTalent((s) => s.applications.find((a) => a.id === modal.applicationId));
  const cand = useTalent((s) => (app ? s.candidates.find((c) => c.id === app.candidateId) : undefined));
  const req = useTalent((s) => (app ? s.requisitions.find((r) => r.id === app.requisitionId) : undefined));
  const offers = useTalent((s) => s.offers);
  const interviews = useTalent((s) => s.interviews);
  const rejectApplication = useTalent((s) => s.rejectApplication);
  const updateCandidate = useTalent((s) => s.updateCandidate);
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const me = useSessionUser();

  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState('');
  const [keepWarm, setKeepWarm] = useState(() => !!app && (stageIndex(app.stage) >= stageIndex('interview') || !!cand?.tags.includes(SILVER)));
  const [variant, setVariant] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);

  const first = firstName(cand?.name);
  const generated = useMemo(
    () => (reason ? closeoutMessage({ reason, first, role: req?.title ?? 'open', sender: me?.name ?? 'The hiring team', keepWarm, variant }) : ''),
    [reason, first, req?.title, me?.name, keepWarm, variant],
  );
  const message = draft ?? generated;

  const activeOffer = useMemo(
    () => (app ? offers.find((o) => o.applicationId === app.id && ['draft', 'pending-approval', 'approved', 'sent'].includes(o.status)) : undefined),
    [offers, app],
  );
  const upcoming = useMemo(() => (app ? interviews.filter((i) => i.applicationId === app.id && i.status === 'scheduled' && i.scheduledAt > Date.now()).length : 0), [interviews, app]);

  if (!app || !cand) {
    return (
      <Modal open={open} onClose={onClose} title="Close out" icon={<ModalIcon icon={UserX} tone="danger" />}>
        <MissingRecord />
      </Modal>
    );
  }

  const verdict = actionVerdict('reject', viewer, app, req);
  const closed = app.status !== 'active';
  const canTag = caps.manage || caps.source;
  const alreadySilver = cand.tags.includes(SILVER);
  const withdrew = reason === 'candidate-withdrew';
  const canSubmit = verdict.ok && !closed && !!reason;

  const options: ChoiceOption<RejectionReason>[] = REJECTION_REASONS.map((r) => ({ value: r.id, label: r.label, hint: REASON_META[r.id].hint, icon: REASON_META[r.id].icon, tone: r.id === 'candidate-withdrew' ? 'info' : 'danger' }));

  const copy = async () => {
    if (!message) return;
    if (await copyText(message)) toast.success('Close-out message copied', 'Paste it into email or LinkedIn. Nothing is sent automatically.');
    else toast.error('Couldn’t copy the message');
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || !reason) return;
    if (!toast.result(rejectApplication(app.id, reason, note.trim() || undefined))) return;
    if (keepWarm && canTag && !alreadySilver) {
      const tagged = updateCandidate(cand.id, { tags: [...cand.tags, SILVER] });
      if (!tagged.ok) toast.result(tagged);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
      className="tl-mm"
      icon={<ModalIcon icon={UserX} tone="danger" />}
      title={withdrew ? `Mark ${first} as withdrawn` : `Close out ${first}`}
      subtitle={req ? `${req.title} · kind, fast close-outs protect your brand` : undefined}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {verdict.ok && !closed && (
            <button type="submit" form="tl-mm-reject-form" className="btn btn--danger" disabled={!canSubmit} title={!reason ? 'Pick a reason first' : undefined}>
              <UserX aria-hidden="true" /> {withdrew ? 'Mark as withdrawn' : 'Close out'}
            </button>
          )}
        </>
      }
    >
      <form id="tl-mm-reject-form" className="tl-mm-body" onSubmit={submit}>
        <CandidateLine cand={cand} sub={`${cand.currentTitle} · ${cand.currentCompany}`} aside={<StageBadge stage={app.stage} />} />

        {closed && <Callout tone="warning">This application is already closed.</Callout>}
        {!verdict.ok && !closed && (
          <Callout tone="danger" title="You can’t close out this candidate">
            {verdict.reason}
          </Callout>
        )}

        <section className="tl-mm-sec">
          <StepHead n={1}>Why are we closing?</StepHead>
          <ChoiceCards options={options} value={reason} onChange={(v) => (setReason(v), setDraft(null))} label="Close-out reason" columns={3} size="sm" />
        </section>

        <section className="tl-mm-sec">
          <StepHead n={2} hint="Visible to the hiring team only">
            Internal note
          </StepHead>
          <textarea
            className="textarea"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Strong craft, but the role needs deeper system design experience today"
            aria-label="Internal note"
          />
        </section>

        <section className="tl-mm-sec">
          <StepHead n={3} hint="Drafted locally · copy & send yourself">
            Close-out message
          </StepHead>
          {reason ? (
            <div className="tl-mm-letter">
              <div className="tl-mm-letter__bar">
                <span className="tl-mm-letter__tag">
                  <Sparkles aria-hidden="true" /> To {first}
                </span>
                <span className="spacer" />
                {draft !== null && (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft(null)}>
                    <RotateCcw aria-hidden="true" /> Reset
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    setVariant((v) => v + 1);
                    setDraft(null);
                  }}
                >
                  <WandSparkles aria-hidden="true" /> Rephrase
                </button>
                <button type="button" className="btn btn--sm" onClick={copy}>
                  <Copy aria-hidden="true" /> Copy
                </button>
              </div>
              <textarea className="tl-mm-letter__text" value={message} onChange={(e) => setDraft(e.target.value)} rows={11} aria-label={`Close-out message to ${first}`} spellCheck />
            </div>
          ) : (
            <div className="tl-mm-letter tl-mm-letter--empty">
              <WandSparkles aria-hidden="true" /> Pick a reason and we’ll draft a kind, specific note for {first}.
            </div>
          )}
        </section>

        {canTag && (
          <label className={cx('tl-mm-check', keepWarm && 'is-on')}>
            <input type="checkbox" checked={keepWarm || alreadySilver} disabled={alreadySilver} onChange={(e) => setKeepWarm(e.target.checked)} />
            <span className="tl-mm-check__text">
              <b>Keep warm</b>
              <span>{alreadySilver ? `${first} is already tagged as a silver medalist.` : `Tag ${first} as a silver medalist so they resurface for future roles.`}</span>
            </span>
          </label>
        )}

        {(activeOffer || upcoming > 0) && (
          <Callout tone="warning" icon={CalendarX2} title="This also tidies up">
            {activeOffer && (
              <>
                Rescinds the active offer <OfferStatusBadge status={activeOffer.status} />
                {upcoming ? ' and ' : '.'}
              </>
            )}
            {upcoming > 0 && `${activeOffer ? 'cancels' : 'Cancels'} ${upcoming} upcoming interview${upcoming === 1 ? '' : 's'}.`}
          </Callout>
        )}
      </form>
    </Modal>
  );
}
