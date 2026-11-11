/**
 * Candidate sheet · Pipeline tab: one panel per application in scope with the
 * live journey tracker (plus the onboarding tracker once hired), what-happens-
 * next actions, the gate checklist for the next stage, decision / close-out
 * notes, the interview loop and the explainable match (reasons, breakdown,
 * must-have coverage).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowUpRight, Ban, Clock, Gavel, PartyPopper, RotateCcw, SquareKanban, UserPlus, UserX } from 'lucide-react';
import type { Application, Candidate, MatchResult } from '@/talent/types';
import { APPLICATION_STATUS_LABEL, INTERVIEW_KIND_META, RECOMMENDATION_META, REJECTION_LABEL, STAGE_BY_ID, WORK_MODEL_LABEL } from '@/talent/constants';
import { gateFor } from '@/talent/gates';
import { matchTier } from '@/talent/ai/engine';
import { useGateContext, useTalentCaps, useTalentLookups, useTalentViewer } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { useTalentUI } from '@/talent/ui';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { EngineBadge, MatchRing, NextActionButton, PeopleStack, PersonChip, ReqStatusBadge, SkillChips, StageBadge } from '../components/shared';
import { daysInStage, fmtDay, fmtRelativeDay, slaState } from '../components/format';
import { GateChecklist } from './GateChecklist';
import { MoveMenu } from './MoveMenu';
import { CandidateJourneyTracker, OnboardingTracker } from '../trackers';
import { actionVerdict, isClosedApp, nextStageOf, stageVars } from './pipelineUtils';

const BREAKDOWN: { key: keyof MatchResult['breakdown']; label: string }[] = [
  { key: 'skills', label: 'Skills' },
  { key: 'experience', label: 'Experience' },
  { key: 'title', label: 'Title' },
  { key: 'location', label: 'Location' },
  { key: 'signals', label: 'Signals' },
];

/** Explainable match: score, per-factor bars, reasons and must-have coverage. */
export function MatchExplainer({ match, reasons = 4 }: { match: MatchResult; reasons?: number }) {
  const tier = matchTier(match.score);
  return (
    <div className="tl-sheet-match">
      <div className="tl-sheet-match__top">
        <MatchRing score={match.score} size={58} stroke={5} />
        <div className="tl-sheet-match__body">
          <div className="tl-sheet-match__tier">
            <span>{tier.label}</span>
            <EngineBadge engine={match.engine} />
          </div>
          <div className="tl-sheet-match__bars">
            {BREAKDOWN.map((b) => (
              <div key={b.key} className="tl-sheet-bar" title={`${b.label}: ${match.breakdown[b.key]} / 100`}>
                <span className="tl-sheet-bar__label">{b.label}</span>
                <span className="tl-sheet-bar__track" aria-hidden="true">
                  <span style={{ width: `${Math.max(3, match.breakdown[b.key])}%` }} />
                </span>
                <span className="tl-sheet-bar__val">{match.breakdown[b.key]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ul className="tl-sheet-match__reasons">
        {match.reasons.slice(0, reasons).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {(match.matched.length > 0 || match.missing.length > 0) && (
        <div className="tl-sheet-match__skills">
          <span className="tl-sheet-label">Must-have skills</span>
          <SkillChips skills={[...match.matched, ...match.missing]} matched={match.matched} missing={match.missing} max={14} />
        </div>
      )}
    </div>
  );
}

function ApplicationPanel({ app, candName }: { app: Application; candName: string }) {
  const { reqById } = useTalentLookups();
  const req = reqById.get(app.requisitionId);
  const ctx = useGateContext(app.id);
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const interviews = useTalent((s) => s.interviews);
  const scorecards = useTalent((s) => s.scorecards);
  const reopen = useTalent((s) => s.reopenApplication);
  const journey = useTalent((s) => (app.status === 'hired' ? s.onboarding.find((j) => j.applicationId === app.id) : undefined));
  const loop = useMemo(() => interviews.filter((i) => i.applicationId === app.id).sort((a, b) => a.scheduledAt - b.scheduledAt), [interviews, app.id]);
  const cards = useMemo(() => scorecards.filter((s) => s.applicationId === app.id), [scorecards, app.id]);
  const next = nextStageOf(app.stage);
  const gate = useMemo(() => (ctx && next && app.status === 'active' ? gateFor(app, next, ctx) : null), [ctx, next, app]);
  const closed = isClosedApp(app);
  const hired = app.status === 'hired';
  const canClose = app.status === 'active' && actionVerdict('reject', viewer, app, req).ok;
  const sla = slaState(app, now);
  const days = daysInStage(app, now);
  const shownStage = hired ? 'hired' : app.stage;

  const openReq = () => {
    useTalentUI.getState().closeCandidate();
    navigate(`/talent/requisitions/${app.requisitionId}`);
  };

  return (
    <article className={cx('tl-sheet-app', closed && 'is-closed', hired && 'is-hired')} style={stageVars(shownStage)} aria-label={`${req?.title ?? 'Application'}: ${STAGE_BY_ID[shownStage].label}`}>
      <header className="tl-sheet-app__head">
        <div className="tl-sheet-app__title">
          <button type="button" className="tl-sheet-app__req" onClick={openReq} title="Open requisition">
            <span className="truncate">{req?.title ?? 'Requisition'}</span>
            <ArrowUpRight aria-hidden="true" />
          </button>
          <div className="tl-sheet-app__sub">
            {req && (
              <>
                <span>
                  {req.department} · {req.location} · {WORK_MODEL_LABEL[req.workModel]}
                </span>
                <ReqStatusBadge status={req.status} />
              </>
            )}
          </div>
        </div>
        <StageBadge stage={shownStage} size="md" />
      </header>

      <CandidateJourneyTracker app={app} now={now} bare hud={false} title={false} className="tl-sheet-app__track" />
      {journey && <OnboardingTracker journey={journey} now={now} bare className="tl-sheet-app__track tl-sheet-app__onb" />}

      <div className="tl-sheet-app__meta">
        {app.status === 'active' && (
          <span className={cx('tl-pipe-sla', `is-${sla}`)} title={STAGE_BY_ID[app.stage].slaDays ? `Target under ${STAGE_BY_ID[app.stage].slaDays} days` : undefined}>
            <Clock aria-hidden="true" />
            {days}d in {STAGE_BY_ID[app.stage].label}
          </span>
        )}
        {closed && (
          <span className="badge badge--muted">
            <Ban aria-hidden="true" />
            {APPLICATION_STATUS_LABEL[app.status]}
          </span>
        )}
        {hired && (
          <span className="badge badge--success">
            <PartyPopper aria-hidden="true" />
            Hired {fmtDay(app.stageEnteredAt)}
          </span>
        )}
        <span className="tl-sheet-app__owner">
          Owner <PersonChip userId={app.ownerId} />
        </span>
        <span className="faint text-xs">Added {fmtDay(app.createdAt)}</span>
      </div>

      {(app.status === 'active' || hired) && (
        <div className="tl-sheet-app__actions">
          <span className="tl-sheet-label">Next step</span>
          <div className="tl-sheet-app__btns">
            <NextActionButton applicationId={app.id} size="md" />
            {app.status === 'active' && <MoveMenu app={app} req={req} name={candName} variant="button" />}
            {canClose && (
              <button type="button" className="btn btn--sm btn--ghost tl-sheet-app__closeout" onClick={() => useTalentUI.getState().openModal({ kind: 'reject', applicationId: app.id })}>
                <UserX aria-hidden="true" /> Close out
              </button>
            )}
          </div>
        </div>
      )}

      {gate && next && gate.checks.length > 0 && <GateChecklist app={app} req={req} checks={gate.checks} title={`To reach ${STAGE_BY_ID[next].label}`} compact />}

      {app.decision && (
        <div className={cx('tl-sheet-note', app.decision.verdict === 'hire' ? 'is-success' : 'is-danger')}>
          <Gavel aria-hidden="true" />
          <div className="grow">
            <div className="tl-sheet-note__title">
              {app.decision.verdict === 'hire' ? 'Hiring decision: hire' : 'Hiring decision: no hire'}
              <span className="tl-sheet-note__by">
                <PersonChip userId={app.decision.by} /> · {fmtDay(app.decision.at)}
              </span>
            </div>
            {app.decision.note && <p>“{app.decision.note}”</p>}
          </div>
        </div>
      )}

      {app.rejection && (
        <div className="tl-sheet-note is-muted">
          <Ban aria-hidden="true" />
          <div className="grow">
            <div className="tl-sheet-note__title">
              {app.status === 'withdrawn' ? 'Withdrew' : 'Closed out'}: {REJECTION_LABEL[app.rejection.reason]}
              <span className="tl-sheet-note__by">
                <PersonChip userId={app.rejection.by} /> · {fmtDay(app.rejection.at)}
              </span>
            </div>
            {app.rejection.note && <p>“{app.rejection.note}”</p>}
          </div>
          {caps.manage && (
            <button type="button" className="btn btn--sm" onClick={() => toast.result(reopen(app.id))}>
              <RotateCcw aria-hidden="true" /> Reopen
            </button>
          )}
        </div>
      )}

      {loop.length > 0 && (
        <div className="tl-sheet-loop">
          <span className="tl-sheet-label">Interview loop</span>
          <ul>
            {loop.map((iv) => {
              const KindIcon = INTERVIEW_KIND_META[iv.kind].icon;
              const ivCards = cards.filter((c) => c.interviewId === iv.id);
              const upcoming = iv.status !== 'cancelled' && iv.scheduledAt > now;
              return (
                <li key={iv.id} className={cx('tl-sheet-loop__item', iv.status === 'cancelled' && 'is-cancelled')}>
                  <span className="tl-sheet-loop__icon" aria-hidden="true">
                    <KindIcon />
                  </span>
                  <span className="tl-sheet-loop__text">
                    <span className="tl-sheet-loop__title">{iv.title}</span>
                    <span className="tl-sheet-loop__when">{iv.status === 'cancelled' ? 'Cancelled' : fmtRelativeDay(iv.scheduledAt, now)}</span>
                  </span>
                  <PeopleStack userIds={iv.interviewerIds} size={22} max={3} />
                  <span className="tl-sheet-loop__recs">
                    {ivCards.length
                      ? ivCards.map((c) => (
                          <span key={c.id} className={cx('badge', `badge--${RECOMMENDATION_META[c.recommendation].tone}`)} title={RECOMMENDATION_META[c.recommendation].label}>
                            {RECOMMENDATION_META[c.recommendation].short}
                          </span>
                        ))
                      : iv.status === 'cancelled'
                        ? null
                        : upcoming
                          ? <span className="badge badge--info">Upcoming</span>
                          : <span className="badge badge--warning">Feedback due</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {app.match ? (
        <MatchExplainer match={app.match} />
      ) : (
        <p className="tl-sheet-hint">No match score: this requisition has no decoded job description.</p>
      )}
    </article>
  );
}

export function SheetPipeline({ cand, apps }: { cand: Candidate; apps: Application[] }) {
  const caps = useTalentCaps();
  if (!apps.length)
    return (
      <EmptyState
        icon={<SquareKanban />}
        title="Not in a pipeline you can see"
        action={
          (caps.manage || caps.source) && cand.status !== 'do-not-contact' ? (
            <button type="button" className="btn btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'add-to-pipeline', candidateId: cand.id })}>
              <UserPlus aria-hidden="true" /> Add to a pipeline
            </button>
          ) : undefined
        }
      >
        {caps.manage || caps.source
          ? `Add ${cand.name.split(' ')[0]} to an open requisition to start the step-by-step process.`
          : 'Applications on requisitions outside your hiring teams are hidden.'}
      </EmptyState>
    );
  return (
    <div className="tl-sheet-stack">
      {apps.map((a) => (
        <ApplicationPanel key={a.id} app={a} candName={cand.name} />
      ))}
    </div>
  );
}
