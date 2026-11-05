/**
 * Log a reply to outreach. Shows the latest sent message for this candidate
 * (and requisition) with the sequence history, then records the outcome:
 * Interested · Replied · Not interested · No response. "Interested" moves the
 * candidate forward automatically; when consent is still missing the dialog
 * suggests recording it next. Without any outreach it offers the composer.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { HandHeart, Linkedin, Mail, MessageSquareReply, Send, ShieldCheck, ThumbsDown, Timer, UserX } from 'lucide-react';
import type { OutreachStatus } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { useTalentUI } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentViewer } from '@/talent/selectors';
import { CHANNEL_META, STAGE_BY_ID } from '@/talent/constants';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toast';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { OutreachStatusBadge, StageBadge } from '../components/shared';
import { fmtDay, fmtWhen } from '../components/format';
import { Callout } from '../pipeline/Callout';
import { ChoiceCards, type ChoiceOption } from '../pipeline/ChoiceCards';
import { CandidateLine, MissingRecord, ModalIcon, StepHead } from '../pipeline/ModalBits';
import { actionVerdict, firstName } from '../pipeline/pipelineUtils';

type Outcome = Extract<OutreachStatus, 'interested' | 'replied' | 'not-interested' | 'no-response'>;

const OUTCOMES: ChoiceOption<Outcome>[] = [
  { value: 'interested', label: 'Interested', hint: 'Wants to talk. Moves them forward.', icon: HandHeart, tone: 'success' },
  { value: 'replied', label: 'Replied', hint: 'Responded, not decided yet', icon: MessageSquareReply, tone: 'info' },
  { value: 'not-interested', label: 'Not interested', hint: 'Declined for now', icon: ThumbsDown, tone: 'danger' },
  { value: 'no-response', label: 'No response', hint: 'Sequence finished without a reply', icon: Timer, tone: 'warning' },
];
const OUTCOME_SET = new Set<OutreachStatus>(OUTCOMES.map((o) => o.value));

export function LogReplyModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'log-reply' }>; open: boolean; onClose: () => void }) {
  const cand = useTalent((s) => s.candidates.find((c) => c.id === modal.candidateId));
  const outreach = useTalent((s) => s.outreach);
  const applications = useTalent((s) => s.applications);
  const requisitions = useTalent((s) => s.requisitions);
  const updateOutreachStatus = useTalent((s) => s.updateOutreachStatus);
  const addNote = useTalent((s) => s.addNote);
  const viewer = useTalentViewer();
  const caps = useTalentCaps();

  const history = useMemo(
    () =>
      outreach
        .filter((o) => o.candidateId === modal.candidateId && (!modal.requisitionId || o.requisitionId === modal.requisitionId || o.requisitionId === null))
        .sort((a, b) => (b.sentAt ?? b.createdAt) - (a.sentAt ?? a.createdAt)),
    [outreach, modal.candidateId, modal.requisitionId],
  );
  const latest = history.find((o) => o.status !== 'draft');
  const [outcome, setOutcome] = useState<Outcome | null>(latest && OUTCOME_SET.has(latest.status) ? (latest.status as Outcome) : null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<Outcome | null>(null);

  const reqId = modal.requisitionId ?? latest?.requisitionId ?? null;
  const req = reqId ? requisitions.find((r) => r.id === reqId) : undefined;
  const app = cand ? applications.find((a) => a.candidateId === cand.id && a.requisitionId === reqId && a.status === 'active') : undefined;

  if (!cand) {
    return (
      <Modal open={open} onClose={onClose} title="Log reply" icon={<ModalIcon icon={MessageSquareReply} />}>
        <MissingRecord what="candidate" />
      </Modal>
    );
  }

  const first = firstName(cand.name);
  const canLog = caps.manage || caps.source;
  const canSubmit = canLog && !!latest && !!outcome && !done;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || !latest || !outcome) return;
    if (!toast.result(updateOutreachStatus(latest.id, outcome))) return;
    if (note.trim().length >= 3) {
      const res = addNote(cand.id, `Reply (${OUTCOMES.find((o) => o.value === outcome)?.label}): ${note.trim()}`, app?.id);
      if (!res.ok) toast.result(res);
    }
    if (outcome === 'interested' || outcome === 'not-interested') setDone(outcome);
    else onClose();
  };

  const ChannelIcon = latest?.channel === 'email' ? Mail : Linkedin;
  const afterApp = app ? applications.find((a) => a.id === app.id) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      className="tl-mm"
      icon={<ModalIcon icon={MessageSquareReply} hue={STAGE_BY_ID.contacted.hue} />}
      title={`Log ${first}’s reply`}
      subtitle={req ? `${req.title} · assisted outreach, logged by you` : 'Assisted outreach, logged by you'}
      footer={
        done ? (
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            {latest && canLog && (
              <button type="submit" form="tl-mm-reply-form" className="btn btn--primary" disabled={!canSubmit}>
                <MessageSquareReply aria-hidden="true" /> Log reply
              </button>
            )}
          </>
        )
      }
    >
      {done ? (
        <div className="tl-mm-done" role="status">
          <span className={cx('tl-mm-done__icon', done === 'interested' ? 'is-success' : 'is-muted')} aria-hidden="true">
            {done === 'interested' ? <HandHeart /> : <ThumbsDown />}
          </span>
          <h3 className="tl-mm-done__title">{done === 'interested' ? `${first} is interested` : 'Reply logged'}</h3>
          <p className="tl-mm-done__text">
            {done === 'interested'
              ? cand.consent.given
                ? `${afterApp ? `Now in ${STAGE_BY_ID[afterApp.stage].label}. ` : ''}Next: book a 30-minute recruiter screen.`
                : `${afterApp ? `Now in ${STAGE_BY_ID[afterApp.stage].label}. ` : ''}Before assessing ${first}, record data-processing consent. It unlocks the screen.`
              : `Close out ${first} politely and keep them warm. Timing changes.`}
          </p>
          <div className="tl-mm-done__actions">
            {done === 'interested' && !cand.consent.given && (
              <button type="button" className="btn btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'consent', candidateId: cand.id })}>
                <ShieldCheck aria-hidden="true" /> Record consent next
              </button>
            )}
            {done === 'interested' && cand.consent.given && afterApp && actionVerdict('schedule-screen', viewer, afterApp, req).ok && (
              <button type="button" className="btn btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'schedule', applicationId: afterApp.id, interviewKind: 'screen' })}>
                Schedule screen
              </button>
            )}
            {done === 'not-interested' && afterApp && actionVerdict('reject', viewer, afterApp, req).ok && (
              <button type="button" className="btn btn--danger" onClick={() => useTalentUI.getState().openModal({ kind: 'reject', applicationId: afterApp.id })}>
                <UserX aria-hidden="true" /> Close out kindly
              </button>
            )}
          </div>
        </div>
      ) : (
        <form id="tl-mm-reply-form" className="tl-mm-body" onSubmit={submit}>
          <CandidateLine cand={cand} sub={`${cand.currentTitle} · ${cand.currentCompany}`} aside={app ? <StageBadge stage={app.stage} /> : undefined} />

          {!latest ? (
            <Callout
              tone="info"
              icon={Send}
              title="No outreach logged yet"
              action={
                canLog ? (
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'outreach', candidateId: cand.id, requisitionId: reqId })}>
                    <Send aria-hidden="true" /> Draft outreach
                  </button>
                ) : undefined
              }
            >
              There’s nothing to log a reply against{req ? ` for ${req.title}` : ''}. Draft a personalised message with AI, send it yourself, then log it as sent.
            </Callout>
          ) : (
            <>
              <section className="tl-mm-msg" aria-label="Latest message">
                <div className="tl-mm-msg__head">
                  <span className="tl-mm-msg__channel">
                    <ChannelIcon aria-hidden="true" />
                    {CHANNEL_META[latest.channel].label}
                    {latest.step > 1 ? ` · follow-up #${latest.step - 1}` : ''}
                  </span>
                  <OutreachStatusBadge status={latest.status} />
                  <span className="spacer" />
                  <span className="tl-mm-msg__when" title={latest.sentAt ? fmtWhen(latest.sentAt) : undefined}>
                    Sent {latest.sentAt ? relativeTime(latest.sentAt) : '—'}
                  </span>
                </div>
                {latest.subject && <div className="tl-mm-msg__subject">{latest.subject}</div>}
                <p className="tl-mm-msg__body">{latest.body}</p>
                {latest.followUpAt && latest.status === 'sent' && (
                  <div className="tl-mm-msg__foot">
                    <Timer aria-hidden="true" /> Follow-up {latest.followUpAt < Date.now() ? 'was due' : 'planned'} {fmtDay(latest.followUpAt)}
                  </div>
                )}
              </section>

              {history.length > 1 && (
                <details className="tl-mm-history">
                  <summary>Sequence history · {history.length} messages</summary>
                  <ul>
                    {history.map((o) => (
                      <li key={o.id}>
                        <span className="tl-mm-history__what">
                          {CHANNEL_META[o.channel].short}
                          {o.step > 1 ? ` · follow-up #${o.step - 1}` : ''}
                        </span>
                        <OutreachStatusBadge status={o.status} />
                        <span className="faint">{fmtDay(o.sentAt ?? o.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {canLog ? (
                <>
                  <section className="tl-mm-sec">
                    <StepHead n={1}>What happened?</StepHead>
                    <ChoiceCards options={OUTCOMES} value={outcome} onChange={setOutcome} label="Reply outcome" columns={2} size="sm" />
                  </section>
                  <section className="tl-mm-sec">
                    <StepHead n={2} hint="Saved as a note on the profile">
                      What did they say? <span className="faint">(optional)</span>
                    </StepHead>
                    <textarea
                      className="textarea"
                      rows={2}
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Open to a call next week; notice period is 2 months"
                      aria-label="Reply summary"
                    />
                  </section>
                  {outcome === 'interested' && !cand.consent.given && (
                    <Callout tone="accent" icon={ShieldCheck}>
                      After logging, record {first}’s data-processing consent to unlock the screen.
                    </Callout>
                  )}
                </>
              ) : (
                <Callout tone="muted">Only recruiters log outreach replies.</Callout>
              )}
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
