/**
 * Add a candidate to a requisition's pipeline. Lists the open requisitions
 * you can see (excluding ones where they're already active), scored with the
 * explainable matcher when the JD is decoded and sorted best first; pick the
 * starting stage (warm sources may start at Interested) and the candidate
 * profile opens on success.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Ban, Briefcase, HandHeart, Radar, UserPlus } from 'lucide-react';
import type { StageId } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { useTalentUI } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentLookups, useTalentScope } from '@/talent/selectors';
import { STAGE_BY_ID, WORK_MODEL_LABEL } from '@/talent/constants';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { MatchRing, PriorityBadge, StageBadge } from '../components/shared';
import { Callout } from '../pipeline/Callout';
import { ChoiceCards, type ChoiceOption } from '../pipeline/ChoiceCards';
import { CandidateLine, MissingRecord, ModalIcon, StepHead } from '../pipeline/ModalBits';
import { firstName, isWarm, matchFor } from '../pipeline/pipelineUtils';

type StartStage = Extract<StageId, 'sourced' | 'applied'>;

export function AddToPipelineModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'add-to-pipeline' }>; open: boolean; onClose: () => void }) {
  const cand = useTalent((s) => s.candidates.find((c) => c.id === modal.candidateId));
  const addToPipeline = useTalent((s) => s.addToPipeline);
  const scope = useTalentScope();
  const { userById } = useTalentLookups();
  const caps = useTalentCaps();
  const navigate = useNavigate();

  const options = useMemo(() => {
    if (!cand) return [];
    return scope.requisitions
      .filter((r) => r.status === 'open')
      .map((r) => {
        const mine = scope.applications.filter((a) => a.candidateId === cand.id && a.requisitionId === r.id);
        return { req: r, active: mine.find((a) => a.status === 'active'), previous: mine.find((a) => a.status === 'rejected' || a.status === 'withdrawn'), match: matchFor(r, cand) };
      });
  }, [cand, scope.requisitions, scope.applications]);
  const available = useMemo(() => options.filter((o) => !o.active).sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1) || a.req.title.localeCompare(b.req.title)), [options]);
  const already = options.filter((o) => o.active);

  const [reqId, setReqId] = useState<string>(() => available[0]?.req.id ?? '');
  const [stage, setStage] = useState<StartStage>('sourced');

  if (!cand) {
    return (
      <Modal open={open} onClose={onClose} title="Add to pipeline" icon={<ModalIcon icon={UserPlus} />}>
        <MissingRecord what="candidate" />
      </Modal>
    );
  }

  const first = firstName(cand.name);
  const warm = isWarm(cand);
  const canAdd = caps.manage || caps.source;
  const dnc = cand.status === 'do-not-contact';
  const selected = available.find((o) => o.req.id === reqId);
  const canSubmit = canAdd && !dnc && !!selected;

  const reqOptions: ChoiceOption<string>[] = available.map(({ req: r, match, previous }) => ({
    value: r.id,
    label: (
      <span className="tl-mm-reqopt__title">
        {r.title}
        {r.priority === 'critical' || r.priority === 'high' ? <PriorityBadge priority={r.priority} /> : null}
        {previous && <span className="tag">Closed before</span>}
      </span>
    ),
    hint: (
      <span className="tl-mm-reqopt__hint">
        <span>
          {r.department} · {r.location} · {WORK_MODEL_LABEL[r.workModel]} · HM {userById.get(r.hiringManagerId)?.name.split(' ')[0] ?? '—'}
        </span>
        {match ? <span className="tl-mm-reqopt__reason">{match.reasons[0]}</span> : <span className="tl-mm-reqopt__reason">JD not decoded yet, so no match score</span>}
      </span>
    ),
    aside: match ? <MatchRing score={match.score} size={44} /> : <span className="tl-mm-reqopt__nomatch">—</span>,
  }));

  const stageOptions: ChoiceOption<StartStage>[] = [
    { value: 'sourced', label: STAGE_BY_ID.sourced.label, hint: 'Not contacted yet: outreach comes next', icon: Radar, hue: STAGE_BY_ID.sourced.hue },
    {
      value: 'applied',
      label: STAGE_BY_ID.applied.label,
      hint: warm ? 'Warm source: skip cold outreach' : 'Cold LinkedIn lead: needs outreach and a reply first',
      icon: HandHeart,
      hue: STAGE_BY_ID.applied.hue,
      disabled: !warm,
    },
  ];

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || !selected) return;
    const res = addToPipeline(cand.id, selected.req.id, { stage, match: selected.match });
    if (!toast.result(res)) return;
    onClose();
    useTalentUI.getState().openCandidate(cand.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      className="tl-mm"
      icon={<ModalIcon icon={UserPlus} hue={STAGE_BY_ID.sourced.hue} />}
      title={`Add ${first} to a pipeline`}
      subtitle="Best-matching open requisitions first · scores are explainable"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {canAdd && available.length > 0 && (
            <button type="submit" form="tl-mm-add-form" className="btn btn--primary" disabled={!canSubmit}>
              <UserPlus aria-hidden="true" /> Add to {selected ? selected.req.title : 'pipeline'}
            </button>
          )}
        </>
      }
    >
      <form id="tl-mm-add-form" className="tl-mm-body" onSubmit={submit}>
        <CandidateLine cand={cand} sub={`${cand.currentTitle} · ${cand.currentCompany} · ${cand.location}`} />

        {!canAdd && <Callout tone="muted">Only recruiters and sourcers add candidates to pipelines.</Callout>}
        {dnc && (
          <Callout tone="danger" icon={Ban} title={`${first} asked not to be contacted`}>
            Respect the request: they can’t be added to a pipeline.
          </Callout>
        )}

        {already.length > 0 && (
          <div className="tl-mm-already">
            <span className="tl-mm-eyebrow">Already in</span>
            {already.map(({ req: r, active }) => (
              <span key={r.id} className="tl-mm-already__item">
                <span className="truncate">{r.title}</span>
                {active && <StageBadge stage={active.stage} />}
              </span>
            ))}
          </div>
        )}

        {available.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title={already.length ? `${first} is in every open pipeline you can see` : 'No open requisitions'}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onClose();
                  useTalentUI.getState().closeCandidate();
                  navigate('/talent/requisitions');
                }}
              >
                <Briefcase aria-hidden="true" /> View requisitions
              </button>
            }
          >
            Open a requisition (or ask for headcount approval) to add more candidates.
          </EmptyState>
        ) : (
          <>
            <section className="tl-mm-sec">
              <StepHead n={1} hint={`${available.length} open`}>
                Choose the requisition
              </StepHead>
              <ChoiceCards options={reqOptions} value={reqId || null} onChange={setReqId} label="Requisition" columns={1} className="tl-mm-reqopts" />
            </section>
            <section className="tl-mm-sec">
              <StepHead n={2}>Starting stage</StepHead>
              <ChoiceCards options={stageOptions} value={stage} onChange={setStage} label="Starting stage" columns={2} size="sm" />
            </section>
          </>
        )}
      </form>
    </Modal>
  );
}
