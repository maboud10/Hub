/**
 * Structured interview scorecard: per-competency 4-point ratings, an overall
 * recommendation, evidence-first notes and an independence guard (other
 * panelists' feedback stays hidden until you submit). Once submitted it shows
 * your scorecard read-only, reveals the panel's feedback and explains what
 * happens next in the loop.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, CircleCheckBig, ClipboardCheck, ClipboardPen, Clock, EyeOff, Gavel, Lightbulb, Lock, Pencil, ShieldAlert, Sparkles } from 'lucide-react';
import type { Rating, Recommendation, Scorecard } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { INTERVIEW_KIND_META, RATING_LABEL, RECOMMENDATION_META } from '@/talent/constants';
import * as access from '@/talent/access';
import { gateFor } from '@/talent/gates';
import { useTalent } from '@/talent/store';
import { useGateContext, useTalentViewer } from '@/talent/selectors';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { CandidateAvatar, PersonChip, SampleTag } from '../components/shared';
import { KindTile, RecBadge, REC_ICON } from '../interviews/bits';
import { competenciesFor, fmtDate, fmtTime, ivEnd, KIND_HUE, REC_ORDER } from '../interviews/utils';

const RATINGS: Rating[] = [1, 2, 3, 4];
const RATING_HINT: Record<Rating, string> = {
  1: 'Clear gaps against the bar',
  2: 'Some signal, notable gaps',
  3: 'Solid evidence, at the bar',
  4: 'Raises the bar for the team',
};
const REC_HINT: Record<Recommendation, string> = {
  'strong-no': 'Serious concerns',
  no: 'Not for this role',
  yes: 'Would hire',
  'strong-yes': 'Champion this hire',
};
const MIN_NOTES = 20;

interface Notes {
  evidence: string;
  strengths: string;
  concerns: string;
}

const composeNotes = (n: Notes) =>
  [n.evidence.trim() && `Evidence: ${n.evidence.trim()}`, n.strengths.trim() && `Strengths: ${n.strengths.trim()}`, n.concerns.trim() && `Concerns: ${n.concerns.trim()}`]
    .filter(Boolean)
    .join('\n\n');

/** Split structured notes back into sections (plain notes become evidence). */
function parseNotes(text: string): Notes {
  const out: Notes = { evidence: '', strengths: '', concerns: '' };
  if (!/^(Evidence|Strengths|Concerns):/m.test(text)) return { ...out, evidence: text };
  for (const block of text.split(/\n{2,}/)) {
    const m = block.match(/^(Evidence|Strengths|Concerns):\s*([\s\S]*)$/);
    if (m) out[m[1].toLowerCase() as keyof Notes] = m[2].trim();
    else out.evidence = [out.evidence, block.trim()].filter(Boolean).join('\n');
  }
  return out;
}

export function ScorecardModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'scorecard' }>; open: boolean; onClose: () => void }) {
  const viewer = useTalentViewer();
  const me = viewer?.userId ?? '';
  const iv = useTalent((s) => s.interviews.find((i) => i.id === modal.interviewId));
  const req = useTalent((s) => (iv ? s.requisitions.find((r) => r.id === iv.requisitionId) : undefined));
  const cand = useTalent((s) => (iv ? s.candidates.find((c) => c.id === iv.candidateId) : undefined));
  const app = useTalent((s) => (iv ? s.applications.find((a) => a.id === iv.applicationId) : undefined));
  const allCards = useTalent((s) => s.scorecards);
  const submitScorecard = useTalent((s) => s.submitScorecard);
  const gateCtx = useGateContext(iv?.applicationId);
  const now = useNow(60_000);

  const cards = useMemo(() => allCards.filter((s) => s.interviewId === modal.interviewId), [allCards, modal.interviewId]);
  const mine = cards.find((s) => s.interviewerId === me);
  const competencies = useMemo(() => (iv ? competenciesFor(iv, req) : []), [iv, req]);

  const [editing, setEditing] = useState(!mine);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => (mine ? { ...mine.ratings } : {}));
  const [rec, setRec] = useState<Recommendation | null>(mine?.recommendation ?? null);
  const [notes, setNotes] = useState<Notes>(() => (mine ? parseNotes(mine.notes) : { evidence: '', strengths: '', concerns: '' }));

  const verdict: access.Verdict = !viewer ? { ok: false, reason: 'Sign in to submit feedback.' } : !iv ? { ok: false, reason: 'This interview no longer exists.' } : access.canSubmitScorecard(viewer, iv);
  const onHiringTeam = !!viewer && !!req && access.canSeeRequisition(viewer, req);
  const started = !!iv && iv.scheduledAt <= now;
  const rated = competencies.filter((c) => ratings[c]).length;
  const contentLen = notes.evidence.trim().length + notes.strengths.trim().length + notes.concerns.trim().length;
  const avg = rated ? competencies.reduce((n, c) => n + (ratings[c] ?? 0), 0) / rated : 0;
  const checks = [
    { id: 'ratings', label: `Rate ${competencies.length} competencies`, done: rated === competencies.length && competencies.length > 0, progress: `${rated}/${competencies.length}` },
    { id: 'rec', label: 'Overall recommendation', done: !!rec },
    { id: 'notes', label: `Evidence notes (${MIN_NOTES}+ chars)`, done: contentLen >= MIN_NOTES, progress: `${Math.min(contentLen, MIN_NOTES)}/${MIN_NOTES}` },
  ];
  const ready = checks.every((c) => c.done) && started;
  const mismatch = rec && rated === competencies.length && ((RECOMMENDATION_META[rec].value >= 3 && avg < 2.4) || (RECOMMENDATION_META[rec].value <= 2 && avg >= 3.2));

  const submit = () => {
    if (!iv || !rec || !ready) return;
    const res = submitScorecard({ interviewId: iv.id, ratings, recommendation: rec, notes: composeNotes(notes) });
    if (toast.result(res)) {
      setEditing(false);
      setJustSubmitted(true);
    }
  };

  const title = !iv ? 'Scorecard' : editing ? (mine ? 'Revise your scorecard' : 'Interview scorecard') : mine ? 'Your scorecard' : 'Panel feedback';
  const header = iv && cand && (
    <div className="tl-sc-head" style={{ '--kind-h': KIND_HUE[iv.kind] } as CSSProperties}>
      <CandidateAvatar person={cand} size={44} />
      <div className="grow">
        <div className="tl-sc-head__name">
          {cand.name} {cand.sample && <SampleTag />}
        </div>
        <div className="tl-sc-head__meta">
          {iv.title}
          {req ? ` · ${req.title}` : ''}
        </div>
        <div className="tl-sc-head__when">
          <Clock aria-hidden="true" /> {fmtDate(iv.scheduledAt)} · {fmtTime(iv.scheduledAt)}–{fmtTime(ivEnd(iv))}
        </div>
      </div>
      <KindTile kind={iv.kind} size="lg" />
    </div>
  );

  // ── not allowed: explain (and show the panel read-only to the hiring team)
  if (!verdict.ok || !iv) {
    return (
      <Modal open={open} onClose={onClose} width={680} title={title} icon={<span className="modal-icon">{onHiringTeam ? <ClipboardCheck /> : <ShieldAlert />}</span>} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
        <div className="stack">
          {header}
          <div className="tl-iv-blocked tl-iv-blocked--soft" role="note">
            <span className="tl-iv-blocked__icon" aria-hidden="true">
              <Lock />
            </span>
            <div className="stack stack--sm">
              <strong>{iv?.status === 'cancelled' ? 'This interview was cancelled' : 'Scorecards come from the panel'}</strong>
              <p className="muted text-sm">{verdict.reason}</p>
            </div>
          </div>
          {iv && onHiringTeam && <PanelFeedback cards={cards} panel={iv.interviewerIds} competencies={competencies} me={me} />}
        </div>
      </Modal>
    );
  }

  // ── read-only: my submitted scorecard + revealed panel + what's next
  if (!editing && mine) {
    const outstanding = iv.interviewerIds.filter((id) => !cards.some((s) => s.interviewerId === id));
    const target = app?.stage === 'screen' ? 'interview' : app?.stage === 'interview' ? 'final' : null;
    const gate = app && gateCtx && target ? gateFor(app, target, gateCtx) : null;
    return (
      <Modal
        open={open}
        onClose={onClose}
        width={720}
        title={title}
        subtitle={`Submitted ${relativeTime(mine.submittedAt, Math.max(now, mine.submittedAt))}`}
        icon={<span className="modal-icon">{justSubmitted ? <CircleCheckBig /> : <ClipboardCheck />}</span>}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
              <Pencil /> Revise
            </button>
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        <div className="stack">
          {justSubmitted && (
            <div className="tl-sc-thanks" role="status">
              <Sparkles aria-hidden="true" />
              <div>
                <strong>Thanks, feedback locked in.</strong> The panel’s scorecards are now visible to you.
              </div>
            </div>
          )}
          {header}
          <ScorecardReadout card={mine} competencies={competencies} />
          <PanelFeedback cards={cards.filter((s) => s.interviewerId !== me)} panel={iv.interviewerIds.filter((id) => id !== me)} competencies={competencies} me={me} title="Rest of the panel" />
          <div className="tl-sc-next">
            <div className="stat-label">What happens next</div>
            {outstanding.length ? (
              <p>
                <Clock aria-hidden="true" /> Waiting on {outstanding.length} more scorecard{outstanding.length === 1 ? '' : 's'}:{' '}
                <span className="row row--wrap tl-sc-next__people">
                  {outstanding.map((id) => (
                    <PersonChip key={id} userId={id} />
                  ))}
                </span>
              </p>
            ) : (
              <p>
                <CircleCheckBig aria-hidden="true" className="tl-sc-ok" /> Every panelist has submitted for this interview.
              </p>
            )}
            {gate && target && (
              <p>
                {gate.ok ? <Gavel aria-hidden="true" className="tl-sc-ok" /> : <ArrowRight aria-hidden="true" />}
                {gate.ok
                  ? target === 'final'
                    ? 'The interview loop is complete. The hiring manager can move the candidate to Debrief.'
                    : 'Screen passed. The recruiter can start the interview loop.'
                  : `Before ${target === 'final' ? 'Debrief' : 'interviews'}: ${gate.checks
                      .filter((c) => !c.done)
                      .map((c) => c.label)
                      .join(' · ')}`}
              </p>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // ── the form
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      className="tl-sc-modal"
      title={title}
      subtitle={`${INTERVIEW_KIND_META[iv.kind].label} · ${competencies.length} competencies`}
      icon={<span className="modal-icon">{<ClipboardPen />}</span>}
      footer={
        <>
          <ol className="tl-sc-checks" aria-label="Before you submit">
            {checks.map((c) => (
              <li key={c.id} className={cx('tl-sc-check', c.done && 'is-done')}>
                <span className="tl-sc-check__dot">{c.done ? <Check aria-hidden="true" /> : null}</span>
                <span className="tl-sc-check__label">{c.label}</span>
                {!c.done && c.progress && <span className="tl-sc-check__progress">{c.progress}</span>}
              </li>
            ))}
          </ol>
          {mine && (
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!ready} title={!started ? 'You can submit once the interview has started.' : undefined}>
            <ClipboardCheck /> {mine ? 'Update scorecard' : 'Submit scorecard'}
          </button>
        </>
      }
    >
      <div className="tl-sc">
        {header}
        <div className="tl-sc-guard" role="note">
          <EyeOff aria-hidden="true" />
          <span>
            <strong>Independent feedback.</strong> Other panelists’ scorecards stay hidden until you submit yours, so nobody anchors on anyone else.
          </span>
        </div>
        {!started && (
          <div className="tl-sc-guard tl-sc-guard--info" role="note">
            <Clock aria-hidden="true" />
            <span>This interview starts {relativeTime(iv.scheduledAt, now)}. Use the competencies below as your guide; submit once you’ve met the candidate.</span>
          </div>
        )}

        <section className="tl-sc-section" aria-labelledby="tl-sc-comp">
          <div className="tl-sc-section__head">
            <span className="tl-sc-step">1</span>
            <h3 id="tl-sc-comp">Rate each competency</h3>
            <span className="tl-sc-section__meta">
              {rated}/{competencies.length}
            </span>
          </div>
          <div className="tl-sc-comps">
            {competencies.map((c, i) => (
              <fieldset key={c} className={cx('tl-sc-comp', ratings[c] && 'is-rated')} style={{ '--i': i } as CSSProperties}>
                <legend className="tl-sc-comp__name">{c}</legend>
                <div className="tl-sc-scale">
                  {RATINGS.map((r) => (
                    <label key={r} className={cx('tl-sc-rate', `tl-sc-rate--${r}`, ratings[c] === r && 'is-on')} title={RATING_HINT[r]}>
                      <input type="radio" name={`rate-${c}`} value={r} checked={ratings[c] === r} onChange={() => setRatings((x) => ({ ...x, [c]: r }))} />
                      <span className="tl-sc-rate__n">{r}</span>
                      <span className="tl-sc-rate__label">{RATING_LABEL[r]}</span>
                      <span className="tl-sc-rate__hint">{RATING_HINT[r]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <section className="tl-sc-section" aria-labelledby="tl-sc-rec">
          <div className="tl-sc-section__head">
            <span className="tl-sc-step">2</span>
            <h3 id="tl-sc-rec">Overall recommendation</h3>
            {rated > 0 && <span className="tl-sc-section__meta">Your ratings average {avg.toFixed(1)}</span>}
          </div>
          <div className="tl-sc-recs" role="radiogroup" aria-label="Overall recommendation">
            {REC_ORDER.map((r) => {
              const Icon = REC_ICON[r];
              return (
                <label key={r} className={cx('tl-sc-recbtn', `tl-sc-recbtn--${r}`, rec === r && 'is-on')}>
                  <input type="radio" name="recommendation" value={r} checked={rec === r} onChange={() => setRec(r)} />
                  <span className="tl-sc-recbtn__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="tl-sc-recbtn__label">{RECOMMENDATION_META[r].label}</span>
                  <span className="tl-sc-recbtn__hint">{REC_HINT[r]}</span>
                </label>
              );
            })}
          </div>
          {mismatch && (
            <p className="tl-sc-nudge">
              <Lightbulb aria-hidden="true" /> Your recommendation and ratings point in different directions. Make sure the evidence explains why.
            </p>
          )}
        </section>

        <section className="tl-sc-section" aria-labelledby="tl-sc-notes">
          <div className="tl-sc-section__head">
            <span className="tl-sc-step">3</span>
            <h3 id="tl-sc-notes">Evidence</h3>
            <span className={cx('tl-sc-section__meta', contentLen >= MIN_NOTES && 'is-ok')}>
              {contentLen >= MIN_NOTES ? <Check aria-hidden="true" className="inline-icon" /> : null} {contentLen} chars
            </span>
          </div>
          <div className="tl-sc-notes">
            <label className="field tl-sc-note tl-sc-note--evidence">
              <span className="field-label">What did you observe?</span>
              <textarea className="textarea" rows={3} value={notes.evidence} onChange={(e) => setNotes((n) => ({ ...n, evidence: e.target.value }))} placeholder="Specific examples: what they said, built or decided, and how they reasoned." />
            </label>
            <div className="tl-sc-notes__pair">
              <label className="field tl-sc-note tl-sc-note--strengths">
                <span className="field-label">Strengths</span>
                <textarea className="textarea" rows={2} value={notes.strengths} onChange={(e) => setNotes((n) => ({ ...n, strengths: e.target.value }))} placeholder="Where they clearly met or raised the bar." />
              </label>
              <label className="field tl-sc-note tl-sc-note--concerns">
                <span className="field-label">Concerns</span>
                <textarea className="textarea" rows={2} value={notes.concerns} onChange={(e) => setNotes((n) => ({ ...n, concerns: e.target.value }))} placeholder="Gaps, risks or things to probe in the next round." />
              </label>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ───────────────────────── read-only pieces ─────────────────────────
function RatingMeter({ value }: { value: Rating | undefined }) {
  return (
    <span className={cx('tl-sc-meter', value && `tl-sc-meter--${value}`)} role="img" aria-label={value ? `${value} of 4 · ${RATING_LABEL[value]}` : 'Not rated'}>
      {RATINGS.map((r) => (
        <i key={r} className={value && r <= value ? 'on' : ''} />
      ))}
      <span className="tl-sc-meter__label">{value ? RATING_LABEL[value] : '—'}</span>
    </span>
  );
}

function ScorecardReadout({ card, competencies, compact = false }: { card: Scorecard; competencies: string[]; compact?: boolean }) {
  const sections = parseNotes(card.notes);
  const keys = [...new Set([...competencies, ...Object.keys(card.ratings)])];
  return (
    <div className={cx('tl-sc-readout', compact && 'tl-sc-readout--compact')}>
      <div className="tl-sc-readout__top">
        <RecBadge rec={card.recommendation} size="md" />
      </div>
      <ul className="tl-sc-readout__ratings">
        {keys.map((k) => (
          <li key={k}>
            <span className="tl-sc-readout__comp">{k}</span>
            <RatingMeter value={card.ratings[k]} />
          </li>
        ))}
      </ul>
      <div className="tl-sc-readout__notes">
        {(['evidence', 'strengths', 'concerns'] as const)
          .filter((k) => sections[k])
          .map((k) => (
            <div key={k} className={cx('tl-sc-readout__note', `is-${k}`)}>
              <span className="stat-label">{k}</span>
              <p>{sections[k]}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

function PanelFeedback({ cards, panel, competencies, me, title = 'Panel feedback' }: { cards: Scorecard[]; panel: string[]; competencies: string[]; me: string; title?: string }) {
  if (!panel.length) return null;
  return (
    <section className="tl-sc-panel" aria-label={title}>
      <div className="stat-label">{title}</div>
      {panel.map((id) => {
        const card = cards.find((s) => s.interviewerId === id);
        return <PanelistCard key={id} userId={id} card={card} competencies={competencies} isMe={id === me} />;
      })}
    </section>
  );
}

function PanelistCard({ userId, card, competencies, isMe }: { userId: string; card?: Scorecard; competencies: string[]; isMe: boolean }) {
  const u = useUserById(userId);
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('tl-sc-panelist', !card && 'is-pending')}>
      <button type="button" className="tl-sc-panelist__head" onClick={() => card && setOpen((o) => !o)} aria-expanded={card ? open : undefined} disabled={!card}>
        {u && <Avatar user={u} size={30} />}
        <span className="grow">
          <span className="tl-sc-panelist__name">
            {u?.name ?? 'Interviewer'}
            {isMe && <span className="faint"> (you)</span>}
          </span>
          <span className="tl-sc-panelist__meta">{card ? `Submitted ${relativeTime(card.submittedAt)}` : 'Scorecard pending'}</span>
        </span>
        {card ? <RecBadge rec={card.recommendation} short /> : <span className="tl-sc-rec tl-sc-rec--hidden">Pending</span>}
      </button>
      {card && open && <ScorecardReadout card={card} competencies={competencies} compact />}
    </div>
  );
}
