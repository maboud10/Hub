/**
 * Offer modal — `{ kind: 'offer', applicationId, offerId? }`.
 * No live offer (none, or the latest was declined / rescinded) → the draft
 * builder: package fields, salary-band guardrail, live first-year total.
 * A live offer → summary, status track, approval chain and every status
 * action (submit, approve / return with a note, send, record the answer,
 * rescind). An acceptance hands straight over to the hired celebration.
 * Money is only shown with `talent.comp.view`.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  FilePen,
  Gavel,
  Lock,
  PartyPopper,
  Pencil,
  Save,
  Send,
  Signature,
  Sparkles,
  Target,
  TriangleAlert,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { Application, ApprovalStep, Candidate, Offer, Requisition } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { APPROVAL_STEP_LABEL, BANDS, CURRENCIES, OFFER_STATUS_META, STAGE_BY_ID } from '@/talent/constants';
import { canApproveOfferStep } from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentLookups, useTalentScope, useTalentViewer } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { addDaysISO, toISODate } from '@/talent/onboarding';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { Modal } from '@/components/ui/Modal';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { CandidateAvatar, Comp, OfferStatusBadge, SampleTag } from '../components/shared';
import { fmtDay, formatMoney } from '../components/format';
import { BandGuardrail, ExpiryPill, FirstYearBreakdown, OfferApprovalChain, OfferFigures, recordOfferResponse } from '../reqs/offer';
import { defaultBonus, isActiveOffer, offersFor, roundTo } from '../reqs/helpers';

type Mode = 'auto' | 'new' | 'edit';

export function OfferModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'offer' }>; open: boolean; onClose: () => void }) {
  const app = useTalent((s) => s.applications.find((a) => a.id === modal.applicationId));
  const offersAll = useTalent((s) => s.offers);
  const scope = useTalentScope();
  const { candById, reqById } = useTalentLookups();
  const cand = app ? candById.get(app.candidateId) : undefined;
  const req = app ? reqById.get(app.requisitionId) : undefined;
  const offers = useMemo(() => offersFor(offersAll, modal.applicationId), [offersAll, modal.applicationId]);
  const [focusId, setFocusId] = useState<string | undefined>(modal.offerId);
  const [mode, setMode] = useState<Mode>('auto');

  const focused = focusId ? offers.find((o) => o.id === focusId) : undefined;
  const current = focused ?? offers[0];
  const live = !!current && current.status !== 'declined' && current.status !== 'rescinded';
  const view: 'view' | 'new' | 'edit' = mode === 'auto' ? (current && (live || focused) ? 'view' : 'new') : mode;

  const icon = (
    <span className="tl-req-note__icon">
      <Signature />
    </span>
  );

  if (!app || !cand || !req || !scope.reqIds.has(app.requisitionId))
    return (
      <Modal open={open} onClose={onClose} title="Offer" icon={icon} width={520}>
        <EmptyState icon={<Lock />} title="Offer not available">
          This application doesn’t exist or isn’t visible to you.
        </EmptyState>
      </Modal>
    );

  const first = cand.name.split(' ')[0];
  const title = view === 'new' ? `Draft offer · ${first}` : view === 'edit' ? `Edit draft offer · ${first}` : `Offer · ${cand.name}`;
  const subtitle =
    view === 'view' && current ? (
      <>
        {current.title} · <span className="mono">{current.band}</span> · {OFFER_STATUS_META[current.status].label}
      </>
    ) : (
      <>
        {req.title} · band <span className="mono">{req.band}</span>
      </>
    );

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} icon={icon} width={840} className="tl-offer-modal">
      {view === 'view' && current ? (
        <OfferView
          key={current.id}
          offer={current}
          offers={offers}
          app={app}
          cand={cand}
          req={req}
          onClose={onClose}
          onNew={() => {
            setFocusId(undefined);
            setMode('new');
          }}
          onEdit={() => setMode('edit')}
        />
      ) : (
        <OfferBuilder
          key={view === 'edit' && current ? `edit-${current.id}` : 'new'}
          app={app}
          cand={cand}
          req={req}
          base={view === 'edit' ? current : undefined}
          blockingOffer={view === 'new' ? offers.find(isActiveOffer) : undefined}
          onCancel={() => (view === 'edit' || offers.length ? setMode('auto') : onClose())}
          onDone={(id) => {
            setFocusId(id);
            setMode('auto');
          }}
        />
      )}
    </Modal>
  );
}

// ───────────────────────── builder ─────────────────────────
function annualExpectation(c: Candidate) {
  const e = c.salaryExpectation;
  return e ? { amount: e.amount * (e.period === 'month' ? 12 : 1), currency: e.currency } : null;
}

function OfferBuilder({
  app,
  cand,
  req,
  base,
  blockingOffer,
  onCancel,
  onDone,
}: {
  app: Application;
  cand: Candidate;
  req: Requisition;
  base?: Offer;
  blockingOffer?: Offer;
  onCancel: () => void;
  onDone: (offerId: string) => void;
}) {
  const caps = useTalentCaps();
  const recruiter = useUserById(req.recruiterId);
  const hm = useUserById(req.hiringManagerId);
  const decider = useUserById(app.decision?.by);
  const today = toISODate(Date.now());
  const expectation = annualExpectation(cand);
  const band = req.salary;
  const midpoint = band ? roundTo((band.min + band.max) / 2) : null;

  const [title, setTitle] = useState(base?.title ?? req.title);
  const [offerBand, setOfferBand] = useState(base?.band ?? req.band);
  const [currency, setCurrency] = useState(base?.currency ?? band?.currency ?? expectation?.currency ?? 'AED');
  const [salary, setSalary] = useState(String(base?.baseSalary ?? midpoint ?? (expectation ? roundTo(expectation.amount) : '')));
  const [bonus, setBonus] = useState(String(base?.bonusPct ?? defaultBonus(req.band)));
  const [equity, setEquity] = useState(base?.equity && base.equity !== '—' ? base.equity : '');
  const [signOn, setSignOn] = useState(String(base?.signOnBonus ?? 0));
  const [startDate, setStartDate] = useState(base?.startDate ?? addDaysISO(today, Math.max(30, cand.noticePeriodDays ?? 0)));
  const [expires, setExpires] = useState('7');
  const [note, setNote] = useState(base?.note ?? '');
  const [showErrors, setShowErrors] = useState(false);

  const baseNum = Math.max(0, Number(salary) || 0);
  const bonusNum = Math.max(0, Math.min(100, Number(bonus) || 0));
  const signOnNum = Math.max(0, Number(signOn) || 0);
  const comparable = !!band && band.currency === currency;
  const outOfBand = comparable && baseNum > 0 && (baseNum < band!.min || baseNum > band!.max);

  // ── gates
  const eligible = app.status === 'active' && (app.stage === 'offer' || (app.stage === 'final' && app.decision?.verdict === 'hire'));
  if (!caps.manage || !caps.comp)
    return (
      <div className="tl-offer-blocked">
        <span className="tl-offer-blocked__icon" aria-hidden="true">
          <Lock />
        </span>
        <div>
          <b>Only recruiters draft offers</b>
          <p className="muted text-sm">
            Offer packages need “Run recruiting” and “View compensation”. {recruiter ? `${recruiter.name.split(' ')[0]} (the recruiter on this role) prepares it` : 'The recruiter prepares it'}; you’ll be asked to sign off if you’re the hiring manager.
          </p>
        </div>
      </div>
    );
  if (!base && blockingOffer)
    return (
      <div className="tl-offer-blocked">
        <span className="tl-offer-blocked__icon" aria-hidden="true">
          <Signature />
        </span>
        <div>
          <b>There’s already an active offer</b>
          <p className="muted text-sm">Rescind the {OFFER_STATUS_META[blockingOffer.status].label.toLowerCase()} offer before drafting a new one.</p>
        </div>
      </div>
    );
  if (!base && !eligible)
    return (
      <div className="tl-offer-blocked">
        <span className="tl-offer-blocked__icon" aria-hidden="true">
          <Gavel />
        </span>
        <div>
          <b>Offers follow a recorded hire decision</b>
          <p className="muted text-sm">
            {cand.name} is {app.status === 'active' ? `in ${STAGE_BY_ID[app.stage].label}` : 'no longer active'}. The hiring manager records the decision at the Debrief stage first.
          </p>
        </div>
      </div>
    );

  const errors: string[] = [];
  if (!title.trim()) errors.push('Add the job title for the offer letter.');
  if (!(baseNum > 0)) errors.push('Enter the base salary.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push('Pick a start date.');
  else if (startDate < today) errors.push('The start date is in the past.');
  if (outOfBand && note.trim().length < 10) errors.push('Out-of-band offers need a justification note (10+ characters).');

  const save = (submit: boolean) => {
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    const store = useTalent.getState();
    const fields = { baseSalary: Math.round(baseNum), currency, bonusPct: bonusNum, signOnBonus: Math.round(signOnNum), startDate, band: offerBand, title: title.trim(), note: note.trim() || undefined };
    if (base) {
      const res = store.updateOffer(base.id, { ...fields, equity: equity.trim() || '—' });
      if (!res.ok) return void toast.result(res);
      if (submit) {
        if (toast.result(store.submitOffer(base.id))) onDone(base.id);
      } else {
        toast.success('Draft updated');
        onDone(base.id);
      }
      return;
    }
    const res = store.draftOffer({ applicationId: app.id, ...fields, equity: equity.trim(), expiresInDays: Math.max(1, Math.round(Number(expires) || 7)), submit });
    toast.result(res);
    if (res.id) onDone(res.id);
  };

  return (
    <div className="tl-offer-builder">
      <div className="tl-offer-ctx">
        <CandidateAvatar person={cand} size={36} />
        <div className="grow">
          <div className="tl-offer-ctx__name">
            {cand.name} {cand.sample && <SampleTag />}
          </div>
          <div className="tl-offer-ctx__facts">
            <span>
              <Clock aria-hidden="true" /> Notice {cand.noticePeriodDays ?? 30}d
            </span>
            {expectation && (
              <span>
                <Wallet aria-hidden="true" /> Expects <Comp amount={expectation.amount} currency={expectation.currency} compact />
              </span>
            )}
            {app.match && (
              <span>
                <Target aria-hidden="true" /> {app.match.score}% match
              </span>
            )}
          </div>
        </div>
        {app.decision?.verdict === 'hire' && (
          <span className="tl-offer-ctx__decision" title={app.decision.note}>
            <Gavel aria-hidden="true" /> Hire decision{decider ? ` · ${decider.name.split(' ')[0]}` : ''}
          </span>
        )}
      </div>

      {showErrors && errors.length > 0 && (
        <ul className="tl-wiz__errors" role="alert">
          {errors.map((e) => (
            <li key={e}>
              <TriangleAlert aria-hidden="true" /> {e}
            </li>
          ))}
        </ul>
      )}

      <div className="tl-offer-builder__grid">
        <div className="tl-req-form tl-offer-form">
          <label className="field tl-req-form__wide">
            <span className="field-label">Job title on the letter</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={90} />
          </label>
          <div className="field tl-req-form__wide">
            <span className="field-label">Base salary (annual)</span>
            <div className="tl-offer-money">
              <input
                className="input"
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                aria-label="Base salary"
                aria-invalid={showErrors && !(baseNum > 0) ? true : undefined}
              />
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="tl-offer-quick">
              {midpoint !== null && band && (
                <button type="button" className="chip" onClick={() => (setSalary(String(midpoint)), setCurrency(band.currency))}>
                  Band midpoint · {formatMoney(midpoint, band.currency, { compact: true })}
                </button>
              )}
              {expectation && (
                <button type="button" className="chip" onClick={() => (setSalary(String(roundTo(expectation.amount))), setCurrency(expectation.currency))}>
                  Match expectation · {formatMoney(expectation.amount, expectation.currency, { compact: true })}
                </button>
              )}
              {band && (
                <button type="button" className="chip" onClick={() => (setSalary(String(band.max)), setCurrency(band.currency))}>
                  Band max · {formatMoney(band.max, band.currency, { compact: true })}
                </button>
              )}
            </div>
          </div>
          <label className="field">
            <span className="field-label">Band</span>
            <select className="select" value={offerBand} onChange={(e) => setOfferBand(e.target.value)}>
              {[...new Set([...BANDS, offerBand])].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Annual bonus (%)</span>
            <input className="input" type="number" min={0} max={100} step={1} inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Sign-on bonus</span>
            <input className="input" type="number" min={0} step={1000} inputMode="numeric" value={signOn} onChange={(e) => setSignOn(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Equity</span>
            <input className="input" value={equity} onChange={(e) => setEquity(e.target.value)} placeholder="e.g. 1,000 RSUs over 4 years" maxLength={80} />
          </label>
          <label className="field">
            <span className="field-label">Start date</span>
            <input className="input" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="field-hint">Today + {Math.max(30, cand.noticePeriodDays ?? 0)} days (notice period) by default.</span>
          </label>
          {!base && (
            <label className="field">
              <span className="field-label">Offer valid for (days)</span>
              <input className="input" type="number" min={1} max={30} value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
          )}
          <label className={cx('field tl-req-form__wide', outOfBand && 'tl-offer-form__must')}>
            <span className="field-label">
              {outOfBand ? 'Justification (required: the base is outside the band)' : 'Note for approvers'} <span className="faint">{outOfBand ? '' : '(optional)'}</span>
            </span>
            <textarea
              className="textarea"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={outOfBand ? 'Why is this offer outside the band? e.g. competing offer, unique expertise…' : 'Context for the hiring manager and People Ops.'}
              aria-invalid={showErrors && outOfBand && note.trim().length < 10 ? true : undefined}
            />
          </label>
        </div>

        <div className="tl-offer-builder__side">
          <FirstYearBreakdown base={baseNum} bonusPct={bonusNum} signOn={signOnNum} currency={currency} />
          <BandGuardrail band={band} expectation={expectation} amount={baseNum} currency={currency} />
          <div className="tl-offer-route">
            <span className="stat-label">Routes to</span>
            <ol className="tl-offer-route__list">
              <li>
                {hm ? <Avatar user={hm} size={24} /> : null}
                <span>
                  <b>{hm?.name.split(' ')[0] ?? 'Hiring manager'}</b>
                  <small>Hiring manager sign-off</small>
                </span>
              </li>
              <li>
                <span className="tl-offer-route__pool" aria-hidden="true">
                  <Sparkles />
                </span>
                <span>
                  <b>People Ops</b>
                  <small>Any approver except you (four-eyes)</small>
                </span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <div className="tl-offer-bar">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => save(false)}>
          <Save /> {base ? 'Save changes' : 'Save draft'}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => save(true)}>
          <Send /> Submit for approval
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── live offer ─────────────────────────
type Pending = { kind: 'approve' | 'reject'; step: ApprovalStep } | { kind: 'rescind' } | { kind: 'decline' } | { kind: 'accept' };

const TRACK: { id: Offer['status']; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'pending-approval', label: 'Approval' },
  { id: 'approved', label: 'Ready' },
  { id: 'sent', label: 'Sent' },
  { id: 'accepted', label: 'Signed' },
];

function trackIndex(o: Offer) {
  switch (o.status) {
    case 'draft':
      return 0;
    case 'pending-approval':
      return 1;
    case 'approved':
      return 2;
    case 'sent':
      return 3;
    case 'accepted':
      return 4;
    case 'declined':
      return 4;
    case 'rescinded':
      return o.sentAt ? 3 : o.approvals.every((a) => a.decision === 'approved') ? 2 : o.approvals.some((a) => a.decision !== 'pending') ? 1 : 0;
  }
}

function OfferView({
  offer,
  offers,
  app,
  cand,
  req,
  onClose,
  onNew,
  onEdit,
}: {
  offer: Offer;
  offers: Offer[];
  app: Application;
  cand: Candidate;
  req: Requisition;
  onClose: () => void;
  onNew: () => void;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const now = useNow(30_000);
  const journey = useTalent((s) => s.onboarding.find((j) => j.applicationId === app.id));
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const store = useTalent.getState;

  const expectation = annualExpectation(cand);
  const terminal = offer.status === 'declined' || offer.status === 'rescinded';
  const idx = trackIndex(offer);
  const activeExists = offers.some(isActiveOffer);
  const canRedraft = terminal && caps.manage && caps.comp && app.status === 'active' && !activeExists && (app.stage === 'offer' || (app.stage === 'final' && app.decision?.verdict === 'hire'));
  const returned = offer.status === 'draft' ? offer.approvals.find((a) => a.decision === 'rejected') : undefined;

  const steps = offer.approvals.filter((a) => a.decision === 'pending').map((a) => ({ step: a.step, verdict: viewer ? canApproveOfferStep(viewer, offer, req, a.step) : { ok: false, reason: 'Sign in first.' } }));

  const start = (p: Pending) => {
    setText('');
    setPending(p);
  };

  const composer = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'approve':
        return { label: 'Approval note', min: 0, confirm: `Approve as ${APPROVAL_STEP_LABEL[pending.step]}`, tone: 'success' as const, placeholder: 'e.g. Within band and consistent with the team.' };
      case 'reject':
        return { label: 'What needs to change?', min: 5, confirm: 'Return to recruiter', tone: 'danger' as const, placeholder: 'e.g. Base is above band: justify or bring it to the midpoint.' };
      case 'rescind':
        return { label: 'Reason for rescinding', min: 5, confirm: 'Rescind offer', tone: 'danger' as const, placeholder: 'e.g. Role re-scoped after the re-org.' };
      case 'decline':
        return { label: 'Why did they decline?', min: 0, confirm: 'Record decline', tone: 'danger' as const, placeholder: 'e.g. Accepted a counter-offer.' };
      case 'accept':
        return { label: 'Note', min: 0, confirm: 'Record acceptance 🎉', tone: 'success' as const, placeholder: 'e.g. Signed via DocuSign this morning.' };
    }
  })();

  const confirm = () => {
    if (!pending || !composer || text.trim().length < composer.min) return;
    const note = text.trim() || undefined;
    let ok = false;
    switch (pending.kind) {
      case 'approve':
        ok = toast.result(store().decideOffer(offer.id, pending.step, 'approved', note));
        break;
      case 'reject':
        ok = toast.result(store().decideOffer(offer.id, pending.step, 'rejected', note));
        break;
      case 'rescind':
        ok = toast.result(store().rescindOffer(offer.id, note));
        break;
      case 'decline':
        ok = recordOfferResponse(offer, 'declined', note);
        break;
      case 'accept':
        // Opens the hired modal (replacing this one) on success.
        recordOfferResponse(offer, 'accepted', note);
        return;
    }
    if (ok) setPending(null);
  };

  const actions: ReactNode[] = [];
  if (offer.status === 'draft' && caps.manage) {
    actions.push(
      <button key="edit" type="button" className="btn" onClick={onEdit}>
        <Pencil /> Edit draft
      </button>,
      <button key="submit" type="button" className="btn btn--primary" onClick={() => toast.result(store().submitOffer(offer.id))}>
        <Send /> Submit for approval
      </button>,
    );
  }
  if (offer.status === 'approved' && caps.manage)
    actions.push(
      <button key="send" type="button" className="btn btn--primary" onClick={() => toast.result(store().sendOffer(offer.id))}>
        <Send /> Send to {cand.name.split(' ')[0]}
      </button>,
    );
  if (offer.status === 'sent' && caps.manage)
    actions.push(
      <button key="dec" type="button" className="btn" onClick={() => start({ kind: 'decline' })}>
        <CircleX /> Declined
      </button>,
      <button key="acc" type="button" className="btn btn--success" onClick={() => start({ kind: 'accept' })}>
        <CircleCheck /> Candidate accepted
      </button>,
    );
  if (canRedraft)
    actions.push(
      <button key="new" type="button" className="btn btn--primary" onClick={onNew}>
        <FilePen /> Draft a new offer
      </button>,
    );

  return (
    <div className="tl-offer-view">
      <div className="tl-offer-view__head">
        <CandidateAvatar person={cand} size={44} />
        <div className="grow">
          <div className="tl-offer-view__name">
            {cand.name} {cand.sample && <SampleTag />}
          </div>
          <div className="tl-offer-view__role">
            <Link to={`/talent/requisitions/${req.id}`} onClick={onClose}>
              {req.title}
            </Link>{' '}
            · {req.department}
          </div>
        </div>
        <div className="tl-offer-view__status">
          <OfferStatusBadge status={offer.status} />
          <ExpiryPill offer={offer} now={now} />
        </div>
      </div>

      <ol className={cx('tl-offer-track', terminal && `is-${offer.status}`)} aria-label="Offer progress">
        {TRACK.map((t, i) => {
          const state = terminal && i === idx ? offer.status : i < idx || offer.status === 'accepted' ? 'done' : i === idx ? 'active' : 'idle';
          return (
            <li key={t.id} className={cx('tl-offer-track__step', `is-${state}`)} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="tl-offer-track__dot" aria-hidden="true">
                {state === 'done' ? <CircleCheck /> : state === 'declined' ? <CircleX /> : state === 'rescinded' ? <Ban /> : i + 1}
              </span>
              <span className="tl-offer-track__label">{terminal && i === idx ? OFFER_STATUS_META[offer.status].label : t.label}</span>
            </li>
          );
        })}
      </ol>

      {offer.status === 'accepted' && (
        <div className="tl-offer-banner is-success">
          <PartyPopper aria-hidden="true" />
          <div className="grow">
            <b>{cand.name.split(' ')[0]} signed! Hired on {fmtDay(offer.respondedAt ?? offer.createdAt)}.</b>
            <span className="muted text-sm">{journey ? `Onboarding is live in HR Portal · day one ${fmtDay(journey.startDate)}.` : 'Hand off to the HR Portal to start onboarding.'}</span>
          </div>
          <button type="button" className="btn btn--sm" onClick={() => useTalentUI.getState().openModal({ kind: 'hired', applicationId: app.id, journeyId: journey?.id })}>
            <PartyPopper /> Celebrate
          </button>
          {journey && (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => {
                onClose();
                navigate(`/hr/onboarding/${journey.id}`);
              }}
            >
              Open onboarding
            </button>
          )}
        </div>
      )}
      {terminal && (
        <div className="tl-offer-banner is-muted">
          {offer.status === 'declined' ? <CircleX aria-hidden="true" /> : <Ban aria-hidden="true" />}
          <div className="grow">
            <b>{offer.status === 'declined' ? `${cand.name.split(' ')[0]} declined this offer` : 'This offer was rescinded'}</b>
            <span className="muted text-sm">{offer.note ? `“${offer.note}”` : 'No reason recorded.'}</span>
          </div>
        </div>
      )}
      {returned?.note && (
        <div className="tl-offer-banner is-warning">
          <Undo2 aria-hidden="true" />
          <div className="grow">
            <b>Returned by {APPROVAL_STEP_LABEL[returned.step]}</b>
            <span className="muted text-sm">“{returned.note}” Adjust the draft and resubmit.</span>
          </div>
        </div>
      )}

      <div className="tl-offer-view__grid">
        <section className="tl-offer-view__pkg" aria-label="Offer package">
          <OfferFigures offer={offer} />
          {offer.note && !terminal && (
            <p className="tl-offer-card__note">
              <span className="stat-label">Note</span> “{offer.note}”
            </p>
          )}
        </section>
        <section className="tl-offer-view__side" aria-label="Compensation checks">
          <FirstYearBreakdown base={offer.baseSalary} bonusPct={offer.bonusPct} signOn={offer.signOnBonus} currency={offer.currency} />
          <BandGuardrail band={req.salary} expectation={expectation} amount={offer.baseSalary} currency={offer.currency} />
        </section>
      </div>

      <section className="tl-offer-view__chain" aria-label="Approvals">
        <div className="tl-offer-view__chainhead">
          <span className="stat-label">Approval chain</span>
          {offer.status === 'pending-approval' &&
            steps.map(({ step, verdict }) =>
              verdict.ok ? (
                <span key={step} className="tl-offer-view__stepacts">
                  <span className="faint text-xs">{APPROVAL_STEP_LABEL[step]}:</span>
                  <button type="button" className="btn btn--sm btn--success" onClick={() => start({ kind: 'approve', step })}>
                    <CircleCheck /> Approve
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost tl-req-danger" onClick={() => start({ kind: 'reject', step })}>
                    <Undo2 /> Return
                  </button>
                </span>
              ) : null,
            )}
        </div>
        <OfferApprovalChain offer={offer} req={req} now={now} />
        {offer.status === 'pending-approval' && steps.length > 0 && steps.every((s) => !s.verdict.ok) && (
          <p className="tl-offer-card__why">
            <Lock aria-hidden="true" /> {steps[0].verdict.reason}
          </p>
        )}
      </section>

      <div className={cx('tl-offer-bar', composer && `is-composing is-${composer.tone}`)}>
        {composer ? (
          <div className="tl-offer-composer">
            <label className="field">
              <span className="field-label">
                {composer.label} <span className="faint">{composer.min ? '(required)' : '(optional)'}</span>
              </span>
              <textarea
                className="textarea"
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={composer.placeholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    confirm();
                  }
                }}
              />
            </label>
            <div className="tl-offer-composer__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button type="button" className={cx('btn', composer.tone === 'danger' ? 'btn--danger' : 'btn--success')} onClick={confirm} disabled={text.trim().length < composer.min}>
                {composer.confirm}
              </button>
            </div>
          </div>
        ) : (
          <>
            {caps.manage && !terminal && offer.status !== 'accepted' && (
              <button type="button" className="btn btn--ghost tl-req-danger" onClick={() => start({ kind: 'rescind' })}>
                <Ban /> Rescind
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
            {actions}
          </>
        )}
      </div>
    </div>
  );
}
