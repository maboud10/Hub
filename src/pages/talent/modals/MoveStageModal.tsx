/**
 * Move dialog — the only way a candidate changes stage. Shows the from → to
 * flight path, the gate checklist (each unmet check has a "Do it" shortcut
 * that opens the relevant dialog), an optional timeline note and, for
 * recruiters, an audited gate override (reason ≥ 10 characters). Moving to
 * Hired is explained (it happens when the offer is accepted) with a shortcut
 * to the offer.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRightLeft, CircleCheckBig, Lock, PartyPopper, RotateCcw, ShieldAlert, Signature, TriangleAlert, Undo2 } from 'lucide-react';
import type { TalentModal } from '@/talent/ui';
import { useTalentUI } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { gateFor } from '@/talent/gates';
import { canMoveApplication } from '@/talent/access';
import { useGateContext, useTalentCaps, useTalentViewer } from '@/talent/selectors';
import { APPLICATION_STATUS_LABEL, STAGE_BY_ID, stageIndex } from '@/talent/constants';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { OfferStatusBadge, StageBadge } from '../components/shared';
import { Callout } from '../pipeline/Callout';
import { GateChecklist } from '../pipeline/GateChecklist';
import { CandidateLine, MissingRecord, ModalIcon } from '../pipeline/ModalBits';
import { StageRoute } from '../pipeline/StageTracker';
import { firstName } from '../pipeline/pipelineUtils';

export function MoveStageModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'move' }>; open: boolean; onClose: () => void }) {
  const app = useTalent((s) => s.applications.find((a) => a.id === modal.applicationId));
  const cand = useTalent((s) => (app ? s.candidates.find((c) => c.id === app.candidateId) : undefined));
  const req = useTalent((s) => (app ? s.requisitions.find((r) => r.id === app.requisitionId) : undefined));
  const offers = useTalent((s) => s.offers);
  const moveStage = useTalent((s) => s.moveStage);
  const reopen = useTalent((s) => s.reopenApplication);
  const ctx = useGateContext(app?.id);
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const to = modal.to;
  const toMeta = STAGE_BY_ID[to];
  const gate = useMemo(() => (app && ctx ? gateFor(app, to, ctx) : null), [app, ctx, to]);
  const offer = useMemo(
    () => (app ? offers.filter((o) => o.applicationId === app.id && o.status !== 'rescinded').sort((a, b) => b.createdAt - a.createdAt)[0] : undefined),
    [offers, app],
  );

  if (!app || !cand) {
    return (
      <Modal open={open} onClose={onClose} title="Move candidate" icon={<ModalIcon icon={ArrowRightLeft} />}>
        <MissingRecord />
      </Modal>
    );
  }

  const first = firstName(cand.name);
  const verdict = viewer && req ? canMoveApplication(viewer, app, req, to) : { ok: false, reason: 'This requisition is not available to you.' };
  const closed = app.status !== 'active';
  const same = app.stage === to;
  const isHire = to === 'hired';
  const back = stageIndex(to) < stageIndex(app.stage);
  const gateOk = !!gate?.ok;
  const pending = gate?.checks.filter((c) => !c.done).length ?? 0;
  const blocked = closed || same || !verdict.ok || isHire;
  const needsOverride = !blocked && !back && !gateOk;
  const reasonLen = reason.trim().length;
  const canConfirm = !blocked && (!needsOverride || (override && caps.manage && reasonLen >= 10));
  const overriding = needsOverride && override;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canConfirm) return;
    const res = moveStage(app.id, to, { note: note.trim() || undefined, override: overriding || undefined, reason: overriding ? reason.trim() : undefined });
    if (toast.result(res)) onClose();
  };

  const title = isHire ? `Hiring ${first}` : back ? `Move ${first} back to ${toMeta.label}` : `Move ${first} to ${toMeta.label}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      className="tl-mm"
      icon={<ModalIcon icon={isHire ? PartyPopper : back ? Undo2 : ArrowRightLeft} hue={toMeta.hue} />}
      title={title}
      subtitle={req ? `${req.title} · ${toMeta.description}` : toMeta.description}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {blocked ? 'Close' : 'Cancel'}
          </button>
          {!blocked && (
            <button
              type="submit"
              form="tl-mm-move-form"
              className={cx('btn', overriding ? 'btn--danger' : 'btn--primary')}
              disabled={!canConfirm}
              title={needsOverride && !overriding ? 'Complete the checklist first' : undefined}
            >
              {overriding ? <ShieldAlert aria-hidden="true" /> : back ? <Undo2 aria-hidden="true" /> : <ArrowRightLeft aria-hidden="true" />}
              {overriding ? 'Override & move' : back ? `Move back to ${toMeta.label}` : `Move to ${toMeta.label}`}
            </button>
          )}
        </>
      }
    >
      <form id="tl-mm-move-form" className="tl-mm-body" onSubmit={submit}>
        <CandidateLine cand={cand} sub={`${cand.currentTitle} · ${cand.currentCompany}`} aside={<StageBadge stage={app.stage} />} />
        <StageRoute from={app.stage} to={to} />

        {closed && (
          <Callout
            tone="warning"
            icon={Lock}
            title={`This application is ${app.status === 'hired' ? 'already hired' : 'closed'}`}
            action={
              caps.manage && app.status !== 'hired' ? (
                <button type="button" className="btn btn--sm" onClick={() => toast.result(reopen(app.id))}>
                  <RotateCcw aria-hidden="true" /> Reopen
                </button>
              ) : undefined
            }
          >
            {app.status === 'hired' ? 'Onboarding continues in the HR Portal.' : `Status: ${APPLICATION_STATUS_LABEL[app.status]}. Reopen it to move ${first} again.`}
          </Callout>
        )}

        {same && !closed && <Callout tone="info">{first} is already in {toMeta.label}.</Callout>}

        {!verdict.ok && !closed && !same && (
          <Callout tone="danger" icon={Lock} title="You can’t make this move">
            {verdict.reason}
          </Callout>
        )}

        {isHire && !closed && verdict.ok && (
          <div className="tl-mm-hire">
            <span className="tl-mm-hire__icon" aria-hidden="true">
              <PartyPopper />
            </span>
            <div className="tl-mm-hire__text">
              <div className="tl-mm-hire__title">Hiring happens when the offer is accepted</div>
              <p>
                Nobody moves to Hired by hand. Send the approved offer and record {first}’s signature: NEXUS then marks the hire, updates the requisition and opens the HR
                Portal hand-off.
              </p>
              <div className="tl-mm-hire__status">
                {offer ? (
                  <>
                    Latest offer <OfferStatusBadge status={offer.status} />
                  </>
                ) : (
                  <span className="faint">No offer drafted yet</span>
                )}
              </div>
            </div>
            {(caps.manage || caps.approveOffers || caps.hire) && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => useTalentUI.getState().openModal({ kind: 'offer', applicationId: app.id, offerId: offer?.id })}
              >
                <Signature aria-hidden="true" /> {offer ? 'Open the offer' : 'Draft the offer'}
              </button>
            )}
          </div>
        )}

        {!blocked && back && (
          <Callout tone="info" icon={Undo2} title="Moving back is always allowed">
            Add a short note so the hiring team knows why {first} is going back to {toMeta.label}.
          </Callout>
        )}

        {!blocked && !back && gate && gate.checks.length > 0 && (
          <>
            {gateOk && (
              <Callout tone="success" icon={CircleCheckBig} title="All exit criteria met">
                {first} is ready for {toMeta.label}.
              </Callout>
            )}
            <GateChecklist app={app} req={req} checks={gate.checks} title={`Exit criteria · ${gate.checks.length} check${gate.checks.length === 1 ? '' : 's'}`} />
          </>
        )}

        {!blocked && (
          <div className="field">
            <label className="field-label" htmlFor="tl-mm-move-note">
              {back ? `Why is ${first} moving back?` : 'Note for the timeline'} <span className="faint">(optional)</span>
            </label>
            <textarea
              id="tl-mm-move-note"
              className="textarea"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={back ? 'e.g. The panel asked for a second technical round' : `Context for the hiring team about moving ${first}`}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
              }}
            />
          </div>
        )}

        {needsOverride &&
          (caps.manage ? (
            <div className={cx('tl-mm-override', override && 'is-on')}>
              <label className="tl-mm-override__head">
                <Switch checked={override} onChange={setOverride} label="Override the stage gate" />
                <span className="tl-mm-override__text">
                  <b>Override the gate</b>
                  <span>
                    Skip {pending} unmet check{pending === 1 ? '' : 's'}. Use sparingly, for example when evidence lives outside NEXUS.
                  </span>
                </span>
                <ShieldAlert aria-hidden="true" className="tl-mm-override__glyph" />
              </label>
              {override && (
                <div className="tl-mm-override__body">
                  <div className="field">
                    <label className="field-label" htmlFor="tl-mm-override-reason">
                      Reason for the override
                    </label>
                    <textarea
                      id="tl-mm-override-reason"
                      className="textarea"
                      rows={2}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Candidate confirmed interest and consent on a call; signed form attached to the req"
                      aria-describedby="tl-mm-override-hint"
                      autoFocus
                    />
                    <span id="tl-mm-override-hint" className={cx('field-hint', reasonLen >= 10 ? 'tl-mm-ok' : '')}>
                      {reasonLen >= 10 ? 'Reason recorded with the move' : `${Math.max(0, 10 - reasonLen)} more character${10 - reasonLen === 1 ? '' : 's'} needed`}
                    </span>
                  </div>
                  <div className="tl-mm-audit" role="note">
                    <TriangleAlert aria-hidden="true" />
                    <span>Overrides are written to the NEXUS audit trail with your name, the skipped checks and your reason.</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Callout tone="muted" icon={Lock}>
              Complete the checklist to continue. Only recruiters can override stage gates.
            </Callout>
          ))}
      </form>
    </Modal>
  );
}
