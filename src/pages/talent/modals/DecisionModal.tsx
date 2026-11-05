/**
 * Debrief & hire decision. Brings every scorecard for the application into
 * one view — recommendation tally, a consensus meter, per-competency
 * averages and each panelist's notes — then the hiring manager records Hire
 * or No hire (a rationale is required for no-hire). A hire auto-advances the
 * candidate to Offer; the dialog then points at the next step.
 */
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { ClipboardCheck, Gavel, Hourglass, Lock, PartyPopper, Signature, ThumbsDown, ThumbsUp, UserX } from 'lucide-react';
import type { Rating, Recommendation } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { useTalentUI } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { canRecordDecision } from '@/talent/access';
import { useTalentCaps, useTalentLookups, useTalentViewer } from '@/talent/selectors';
import { INTERVIEW_KIND_META, RATING_LABEL, RECOMMENDATION_META, STAGE_BY_ID, stageIndex } from '@/talent/constants';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { PersonChip, StageBadge, ToneBadge } from '../components/shared';
import { fmtDay } from '../components/format';
import { Callout } from '../pipeline/Callout';
import { ChoiceCards } from '../pipeline/ChoiceCards';
import { CandidateLine, MissingRecord, ModalIcon, StepHead } from '../pipeline/ModalBits';
import { actionVerdict, firstName } from '../pipeline/pipelineUtils';

const RECS: Recommendation[] = ['strong-yes', 'yes', 'no', 'strong-no'];

function consensusOf(n: number, positive: number) {
  if (!n) return { label: 'No feedback yet', tone: 'muted' as const };
  const share = positive / n;
  if (share === 1) return { label: 'Unanimous hire', tone: 'success' as const };
  if (share === 0) return { label: 'Unanimous no-hire', tone: 'danger' as const };
  if (share >= 0.75) return { label: 'Leaning hire', tone: 'success' as const };
  if (share <= 0.25) return { label: 'Leaning no-hire', tone: 'danger' as const };
  return { label: 'Split panel', tone: 'warning' as const };
}

function RatingDots({ value }: { value: Rating }) {
  return (
    <span className="tl-mm-dots" aria-label={`${value} of 4 · ${RATING_LABEL[value]}`} title={RATING_LABEL[value]}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= value ? `is-on is-r${value}` : ''} />
      ))}
    </span>
  );
}

export function DecisionModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'decision' }>; open: boolean; onClose: () => void }) {
  const app = useTalent((s) => s.applications.find((a) => a.id === modal.applicationId));
  const cand = useTalent((s) => (app ? s.candidates.find((c) => c.id === app.candidateId) : undefined));
  const req = useTalent((s) => (app ? s.requisitions.find((r) => r.id === app.requisitionId) : undefined));
  const allCards = useTalent((s) => s.scorecards);
  const allInterviews = useTalent((s) => s.interviews);
  const recordDecision = useTalent((s) => s.recordDecision);
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const { userById } = useTalentLookups();
  const [verdict, setVerdict] = useState<'hire' | 'no-hire' | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<'hire' | 'no-hire' | null>(null);
  const [allComps, setAllComps] = useState(false);

  const cards = useMemo(() => (app ? allCards.filter((c) => c.applicationId === app.id).sort((a, b) => a.submittedAt - b.submittedAt) : []), [allCards, app]);
  const ivs = useMemo(() => (app ? allInterviews.filter((i) => i.applicationId === app.id && i.status !== 'cancelled') : []), [allInterviews, app]);

  const stats = useMemo(() => {
    const tally = Object.fromEntries(RECS.map((r) => [r, 0])) as Record<Recommendation, number>;
    let sum = 0;
    const comp = new Map<string, { sum: number; n: number }>();
    for (const c of cards) {
      tally[c.recommendation] += 1;
      sum += RECOMMENDATION_META[c.recommendation].value;
      for (const [k, v] of Object.entries(c.ratings)) {
        const e = comp.get(k) ?? { sum: 0, n: 0 };
        e.sum += v;
        e.n += 1;
        comp.set(k, e);
      }
    }
    const n = cards.length;
    const positive = tally['strong-yes'] + tally.yes;
    return {
      n,
      tally,
      positive,
      avg: n ? sum / n : null,
      consensus: consensusOf(n, positive),
      competencies: [...comp.entries()].map(([name, e]) => ({ name, avg: e.sum / e.n, n: e.n })).sort((a, b) => b.avg - a.avg),
    };
  }, [cards]);

  const awaiting = useMemo(() => {
    const now = Date.now();
    return ivs.flatMap((iv) =>
      iv.interviewerIds
        .filter((id) => !cards.some((c) => c.interviewId === iv.id && c.interviewerId === id))
        .map((id) => ({ iv, id, upcoming: iv.scheduledAt > now })),
    );
  }, [ivs, cards]);

  if (!app || !cand || !req) {
    return (
      <Modal open={open} onClose={onClose} title="Debrief" icon={<ModalIcon icon={Gavel} />}>
        <MissingRecord />
      </Modal>
    );
  }

  const first = firstName(cand.name);
  const allowed = viewer ? canRecordDecision(viewer, req) : { ok: false, reason: 'Sign in first.' };
  const atDebrief = app.stage === 'final' && app.status === 'active';
  const noteLen = note.trim().length;
  const noteOk = verdict !== 'no-hire' || noteLen >= 10;
  const canSubmit = allowed.ok && atDebrief && !!verdict && noteOk && !done;
  const canClose = actionVerdict('reject', viewer, app, req).ok;
  const ivTitle = (id: string) => ivs.find((i) => i.id === id) ?? allInterviews.find((i) => i.id === id);
  const markerPct = stats.avg === null ? 50 : ((stats.avg - 1) / 3) * 100;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || !verdict) return;
    if (toast.result(recordDecision(app.id, verdict, note.trim() || undefined))) setDone(verdict);
  };

  const footer = done ? (
    <button type="button" className="btn" onClick={onClose}>
      Done
    </button>
  ) : (
    <>
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {allowed.ok && atDebrief ? 'Cancel' : 'Close'}
      </button>
      {allowed.ok && atDebrief && (
        <button
          type="submit"
          form="tl-mm-decision-form"
          className={cx('btn', verdict === 'no-hire' ? 'btn--danger' : 'btn--primary')}
          disabled={!canSubmit}
          title={!verdict ? 'Choose hire or no hire' : !noteOk ? 'Add a rationale (10+ characters)' : undefined}
        >
          <Gavel aria-hidden="true" /> {verdict === 'no-hire' ? 'Record no-hire' : verdict === 'hire' ? 'Record hire decision' : 'Record decision'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={860}
      className="tl-mm tl-mm--wide"
      icon={<ModalIcon icon={Gavel} hue={STAGE_BY_ID.final.hue} />}
      title={`Debrief: ${cand.name}`}
      subtitle={`${req.title} · ${stats.n} scorecard${stats.n === 1 ? '' : 's'} from the panel`}
      footer={footer}
    >
      {done ? (
        <div className="tl-mm-done" role="status">
          <span className={cx('tl-mm-done__icon', done === 'hire' ? 'is-success' : 'is-muted')} aria-hidden="true">
            {done === 'hire' ? <PartyPopper /> : <Gavel />}
          </span>
          <h3 className="tl-mm-done__title">{done === 'hire' ? 'Hire decision recorded' : 'No-hire recorded'}</h3>
          <p className="tl-mm-done__text">
            {done === 'hire'
              ? `${first} moved to Offer automatically and the recruiter has been notified. Next: draft the offer and route it for approval.`
              : `The recruiter has been notified. Next: close out ${first} kindly and keep them warm if they were close.`}
          </p>
          <div className="tl-mm-done__actions">
            {done === 'hire' && caps.manage && (
              <button type="button" className="btn btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'offer', applicationId: app.id })}>
                <Signature aria-hidden="true" /> Draft the offer
              </button>
            )}
            {done === 'no-hire' && canClose && (
              <button type="button" className="btn btn--danger" onClick={() => useTalentUI.getState().openModal({ kind: 'reject', applicationId: app.id })}>
                <UserX aria-hidden="true" /> Close out kindly
              </button>
            )}
          </div>
        </div>
      ) : (
        <form id="tl-mm-decision-form" className="tl-mm-body" onSubmit={submit}>
          <CandidateLine cand={cand} sub={`${cand.currentTitle} · ${cand.currentCompany}`} aside={<StageBadge stage={app.status === 'hired' ? 'hired' : app.stage} />} />

          <div className="tl-mm-debrief">
            <section className="tl-mm-panel" aria-label="Panel signal">
              <div className="tl-mm-panel__head">
                <span className="tl-mm-eyebrow">Panel signal</span>
                <ToneBadge tone={stats.consensus.tone}>{stats.consensus.label}</ToneBadge>
              </div>
              <div className="tl-mm-meter" style={{ '--marker': `${markerPct}%` } as CSSProperties} role="img" aria-label={stats.avg === null ? 'No scorecards yet' : `Average recommendation ${stats.avg.toFixed(1)} of 4`}>
                <div className="tl-mm-meter__track">{stats.avg !== null && <span className="tl-mm-meter__marker" />}</div>
                <div className="tl-mm-meter__labels">
                  <span>Strong no</span>
                  <span>{stats.n ? `${Math.round((stats.positive / stats.n) * 100)}% positive` : '—'}</span>
                  <span>Strong yes</span>
                </div>
              </div>
              <ul className="tl-mm-tally">
                {RECS.map((r) => {
                  const m = RECOMMENDATION_META[r];
                  const count = stats.tally[r];
                  return (
                    <li key={r} className={cx('tl-mm-tally__row', `is-${r}`)}>
                      <span className="tl-mm-tally__label">{m.short}</span>
                      <span className="tl-mm-tally__track" aria-hidden="true">
                        <span style={{ width: stats.n ? `${(count / stats.n) * 100}%` : 0 }} />
                      </span>
                      <span className="tl-mm-tally__n">{count}</span>
                    </li>
                  );
                })}
              </ul>
              {stats.competencies.length > 0 && (
                <div className="tl-mm-comp">
                  <span className="tl-mm-eyebrow">Average per competency</span>
                  <ul>
                    {(allComps || stats.competencies.length <= 7
                      ? stats.competencies
                      : [...stats.competencies.slice(0, 3), ...stats.competencies.slice(-3)]
                    ).map((c) => (
                      <li key={c.name} className="tl-mm-comp__row" title={`${c.n} rating${c.n === 1 ? '' : 's'}`}>
                        <span className="tl-mm-comp__name">{c.name}</span>
                        <span className="tl-mm-comp__track" aria-hidden="true">
                          <span style={{ width: `${(c.avg / 4) * 100}%` }} className={c.avg >= 3.5 ? 'is-top' : c.avg < 2.5 ? 'is-low' : ''} />
                        </span>
                        <span className="tl-mm-comp__val">{c.avg.toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                  {stats.competencies.length > 7 && (
                    <button type="button" className="tl-mm-more" onClick={() => setAllComps((v) => !v)} aria-expanded={allComps}>
                      {allComps ? 'Show strongest & weakest only' : `Show all ${stats.competencies.length} competencies`}
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="tl-mm-panel" aria-label="Scorecards">
              <div className="tl-mm-panel__head">
                <span className="tl-mm-eyebrow">Scorecards</span>
                <span className="tl-mm-count">{stats.n}</span>
              </div>
              {cards.length ? (
                <ul className="tl-mm-cards">
                  {cards.map((c) => {
                    const iv = ivTitle(c.interviewId);
                    const KindIcon = iv ? INTERVIEW_KIND_META[iv.kind].icon : ClipboardCheck;
                    const rec = RECOMMENDATION_META[c.recommendation];
                    return (
                      <li key={c.id} className={cx('tl-mm-card', `is-${rec.tone}`)}>
                        <div className="tl-mm-card__head">
                          <PersonChip userId={c.interviewerId} label={userById.get(c.interviewerId)?.name} />
                          <ToneBadge tone={rec.tone}>{rec.label}</ToneBadge>
                        </div>
                        <div className="tl-mm-card__iv">
                          <KindIcon aria-hidden="true" /> {iv?.title ?? 'Interview'} · {fmtDay(c.submittedAt)}
                        </div>
                        <ul className="tl-mm-card__ratings">
                          {Object.entries(c.ratings).map(([k, v]) => (
                            <li key={k}>
                              <span>{k}</span>
                              <RatingDots value={v} />
                            </li>
                          ))}
                        </ul>
                        {c.notes && <p className="tl-mm-card__notes">“{c.notes}”</p>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="faint text-sm">No scorecards yet.</p>
              )}
              {awaiting.length > 0 && (
                <div className="tl-mm-awaiting">
                  <Hourglass aria-hidden="true" />
                  <span>
                    {awaiting.some((a) => !a.upcoming) ? 'Awaiting feedback from ' : 'Still to interview: '}
                    {[...new Set(awaiting.map((a) => userById.get(a.id)?.name.split(' ')[0] ?? 'a panelist'))].join(', ')}
                  </span>
                </div>
              )}
            </section>
          </div>

          {app.decision && (
            <Callout tone={app.decision.verdict === 'hire' ? 'success' : 'danger'} icon={Gavel} title={`Current decision: ${app.decision.verdict === 'hire' ? 'hire' : 'no hire'}`}>
              Recorded by {userById.get(app.decision.by)?.name ?? 'the hiring manager'} on {fmtDay(app.decision.at)}
              {app.decision.note ? ` · “${app.decision.note}”` : ''}
            </Callout>
          )}

          {!atDebrief ? (
            <Callout
              tone="info"
              title={app.status !== 'active' ? 'This application is closed' : stageIndex(app.stage) > stageIndex('final') ? 'The decision is already made' : 'Decisions are recorded at the Debrief stage'}
              action={
                app.status === 'active' && stageIndex(app.stage) < stageIndex('final') && viewer && actionVerdict('advance', viewer, app, req).ok ? (
                  <button type="button" className="btn btn--sm" onClick={() => useTalentUI.getState().openModal({ kind: 'move', applicationId: app.id, to: 'final' })}>
                    Move to Debrief
                  </button>
                ) : undefined
              }
            >
              {app.status === 'active' && stageIndex(app.stage) < stageIndex('final')
                ? `${first} is in ${STAGE_BY_ID[app.stage].label}. Collect the interview scorecards, then move to Debrief.`
                : 'You can still review the panel feedback here.'}
            </Callout>
          ) : !allowed.ok ? (
            <Callout tone="muted" icon={Lock} title="Read-only debrief">
              {allowed.reason}
            </Callout>
          ) : (
            <section className="tl-mm-sec">
              <StepHead n={1} hint="Only the hiring manager (or a recruiter) records this">
                Your decision
              </StepHead>
              <ChoiceCards
                options={[
                  { value: 'hire', label: 'Hire', hint: `Moves ${first} to Offer automatically`, icon: ThumbsUp, tone: 'success' },
                  { value: 'no-hire', label: 'No hire', hint: 'Recruiter closes out kindly', icon: ThumbsDown, tone: 'danger' },
                ]}
                value={verdict}
                onChange={setVerdict}
                label="Hire decision"
                columns={2}
                size="lg"
              />
              <div className="field">
                <label className="field-label" htmlFor="tl-mm-decision-note">
                  Rationale {verdict === 'no-hire' ? <span className="tl-mm-req">required</span> : <span className="faint">(recommended)</span>}
                </label>
                <textarea
                  id="tl-mm-decision-note"
                  className="textarea"
                  rows={3}
                  maxLength={600}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={verdict === 'no-hire' ? 'What was missing against the bar? This helps the recruiter close out with care.' : 'What convinced the panel? Any risks to address in the offer?'}
                />
                {verdict === 'no-hire' && noteLen < 10 && <span className="field-hint">{10 - noteLen} more character{10 - noteLen === 1 ? '' : 's'} needed for a no-hire rationale</span>}
              </div>
            </section>
          )}
        </form>
      )}
    </Modal>
  );
}
