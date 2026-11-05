/**
 * AI Sourcing studio (/talent/sourcing) — a guided, five-step flow from a job
 * description to personalised first messages:
 *   1 Job description — upload / paste / sample, or an open requisition (`?req=<id>` preloads it)
 *   2 Decode          — editable Search DNA, skills, JD health and X-ray
 *   3 Talent pool     — rediscover people you already know, ranked and explained
 *   4 LinkedIn        — Boolean / Recruiter / X-ray searches + prospect feed (assisted mode)
 *   5 Outreach        — bulk personalised drafts → copy, send, log as sent
 * Progress lives in a module-level store (./sourcing/store) so leaving the tab
 * and coming back resumes exactly where the recruiter left off.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, BrainCircuit, FileText, Linkedin, LoaderCircle, Radar, Recycle, RotateCcw, Send, Target } from 'lucide-react';
import type { JobProfile, Requisition } from '@/talent/types';
import { aiStatus, rankByMatch } from '@/talent/ai/engine';
import { useTalentScope } from '@/talent/selectors';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { EngineBadge, ReqStatusBadge, Stepper, type StepDef } from './components/shared';
import { STEP, studio, useStudio, useStudioJD, type StudioStep } from './sourcing/store';
import { StepDecode, StepJD } from './sourcing/StepBrief';
import { StepPool, type RankedCandidate } from './sourcing/StepPool';
import { StepLinkedIn } from './sourcing/StepLinkedIn';
import { StepOutreach } from './sourcing/StepOutreach';

const STEPS: StepDef[] = [
  { id: 'jd', label: 'Job description', icon: FileText, hint: 'Upload, paste or pick a requisition' },
  { id: 'decode', label: 'Decode', icon: BrainCircuit, hint: 'Search DNA, skills and JD health' },
  { id: 'pool', label: 'Talent pool', icon: Recycle, hint: 'Rediscover people you already know' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, hint: 'Boolean, X-ray and prospect feed' },
  { id: 'outreach', label: 'Outreach', icon: Send, hint: 'Personalised drafts, logged as sent' },
];

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SourcingStudio() {
  const jd = useStudioJD();
  const step = useStudio((s) => s.step);
  const maxReached = useStudio((s) => s.maxReached);
  const targetReqId = useStudio((s) => s.targetReqId);
  const sourceReqId = useStudio((s) => s.sourceReqId);
  const picks = useStudio((s) => s.picks);
  const drafts = useStudio((s) => s.drafts);
  const hits = useStudio((s) => s.hits);
  const hitsStatus = useStudio((s) => s.hitsStatus);
  const finished = useStudio((s) => s.finished);
  const { requisitions, candidates } = useTalentScope();
  const profile = jd.profile;
  const targetReq = useMemo(() => requisitions.find((r) => r.id === targetReqId) ?? null, [requisitions, targetReqId]);

  // ── `?req=<id>`: preload that requisition's JD once, then drop the param.
  const [params, setParams] = useSearchParams();
  const reqParam = params.get('req');
  useEffect(() => {
    if (!reqParam || !requisitions.length) return;
    const req = requisitions.find((r) => r.id === reqParam);
    if (!req) toast.error('That requisition isn’t available to you.');
    else if (useStudio.getState().sourceReqId !== req.id) studio.loadRequisition(req);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('req');
        return next;
      },
      { replace: true },
    );
  }, [reqParam, requisitions, setParams]);

  // ── Rank the talent pool once (header telemetry + step 3).
  const location = targetReq?.location ?? profile?.location ?? null;
  const workModel = targetReq?.workModel ?? profile?.workModel ?? null;
  const pool = useMemo(() => candidates.filter((c) => c.status !== 'do-not-contact'), [candidates]);
  const ranked = useMemo<RankedCandidate[]>(() => (profile ? rankByMatch(profile, pool, { location, workModel }) : []), [profile, pool, location, workModel]);

  const busy = jd.status === 'reading' || jd.status === 'analyzing';
  const current: StudioStep = profile ? step : STEP.jd;
  const loggedCount = picks.filter((p) => drafts[p.key]?.logged).length;
  const strongCount = ranked.filter((r) => r.match.score >= 72).length;

  // ── Bring the stepper back into view when the step changes (not on first paint).
  const rootRef = useRef<HTMLDivElement>(null);
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 84;
    if (window.scrollY > top) window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [current, finished]);

  let body: ReactNode;
  if (!profile || current === STEP.jd) body = <StepJD jd={jd} activeReqId={sourceReqId} />;
  else if (current === STEP.decode) body = <StepDecode jd={jd} profile={profile} targetReq={targetReq} />;
  else if (current === STEP.pool) body = <StepPool ranked={ranked} targetReq={targetReq} requisitions={requisitions} />;
  else if (current === STEP.linkedin) body = <StepLinkedIn profile={profile} targetReq={targetReq} requisitions={requisitions} />;
  else body = <StepOutreach profile={profile} targetReq={targetReq} />;

  return (
    <div ref={rootRef} className="tl-src">
      <StudioHeader
        profile={profile}
        busy={busy || hitsStatus === 'loading'}
        targetReq={targetReq}
        requisitions={requisitions}
        telemetry={[
          { label: 'Job description', value: busy ? 'Decoding…' : profile ? `${profile.skills.filter((s) => s.must).length} must-haves` : 'Waiting', on: !!profile },
          { label: 'Pool fits', value: profile ? `${strongCount} strong / ${ranked.length}` : '—', on: strongCount > 0 },
          { label: 'LinkedIn', value: hitsStatus === 'loading' ? 'Scanning…' : hits.length ? `${hits.length} prospects` : '—', on: hits.length > 0 },
          { label: 'Selected', value: String(picks.length), on: picks.length > 0 },
          { label: 'Logged', value: picks.length ? `${loggedCount} / ${picks.length}` : '0', on: loggedCount > 0 },
        ]}
        dirty={!!jd.text || !!profile}
      />
      <Stepper steps={STEPS} current={current} maxReached={profile ? maxReached : STEP.jd} onStep={(i) => studio.goTo(i as StudioStep)} />
      <div key={current} className="tl-src-stage">
        {body}
      </div>
      <StudioFooter
        step={current}
        profile={profile}
        jd={{ busy, ready: jd.status === 'ready', textOk: jd.text.trim().length >= 40 }}
        picks={picks.length}
        logged={loggedCount}
        strong={strongCount}
        prospects={hitsStatus === 'loading' ? null : hits.length}
        finished={finished}
      />
    </div>
  );
}

// ───────────────────────── header ─────────────────────────
function StudioHeader({
  profile,
  busy,
  targetReq,
  requisitions,
  telemetry,
  dirty,
}: {
  profile: JobProfile | null;
  busy: boolean;
  targetReq: Requisition | null;
  requisitions: Requisition[];
  telemetry: { label: string; value: string; on: boolean }[];
  dirty: boolean;
}) {
  const ai = aiStatus();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirm]);
  const options = useMemo(() => requisitions.filter((r) => r.status === 'open' || r.status === 'pending-approval' || r.id === targetReq?.id), [requisitions, targetReq]);

  return (
    <section className="tl-src-head">
      <div className="tl-src-head__id">
        <span className={cx('tl-src-head__radar', busy && 'is-busy')} aria-hidden="true">
          <Radar />
          <i />
        </span>
        <div className="grow">
          <div className="tl-src-head__kicker">
            <span>AI Sourcing studio</span>
            <EngineBadge engine={profile?.engine ?? ai.engine} />
          </div>
          <h2 className="tl-src-head__title">
            {profile ? (
              <>
                Sourcing for <span className="tl-src-grad">{targetReq?.title ?? profile.title}</span>
              </>
            ) : (
              'From job description to first message'
            )}
          </h2>
          <p className="tl-src-head__sub">
            {profile
              ? 'Decoded JD → rediscover your pool → search LinkedIn → personalised outreach you send yourself.'
              : 'Drop in a JD. We rank the people you already know, build LinkedIn searches and draft a personal note for each person.'}
          </p>
        </div>
      </div>

      <div className="tl-src-head__side">
        <label className="tl-src-target">
          <span className="tl-src-target__label">
            <Target aria-hidden="true" /> Target requisition
            {targetReq && targetReq.status !== 'open' && <ReqStatusBadge status={targetReq.status} />}
          </span>
          <select className="select" value={targetReq?.id ?? ''} onChange={(e) => studio.setTarget(e.target.value || null)}>
            <option value="">None · talent pool only</option>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.status === 'pending-approval' ? ' · awaiting approval' : r.status !== 'open' ? ` · ${r.status}` : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={cx('btn btn--sm tl-src-head__reset', confirm ? 'btn--danger is-confirm' : 'btn--ghost')}
          disabled={!dirty}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            setConfirm(false);
            studio.startOver();
          }}
          title="Clears the studio (anything you logged stays in Talent Hub)"
          aria-label={confirm ? 'Tap again to reset the studio' : 'Start over'}
        >
          <RotateCcw aria-hidden="true" /> <span>{confirm ? 'Tap again to reset' : 'Start over'}</span>
        </button>
      </div>

      <dl className="tl-src-telemetry">
        {telemetry.map((t) => (
          <div key={t.label} className={cx('tl-src-telemetry__item', t.on && 'is-on')}>
            <dt>{t.label}</dt>
            <dd>{t.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ───────────────────────── sticky footer ─────────────────────────
function StudioFooter({
  step,
  profile,
  jd,
  picks,
  logged,
  strong,
  prospects,
  finished,
}: {
  step: StudioStep;
  profile: JobProfile | null;
  jd: { busy: boolean; ready: boolean; textOk: boolean };
  picks: number;
  logged: number;
  strong: number;
  prospects: number | null;
  finished: boolean;
}) {
  const s = (n: number) => (n === 1 ? '' : 's');
  let status: string;
  let next: { label: string; onClick?: () => void; disabled?: boolean; busy?: boolean } | null;

  switch (step) {
    case STEP.jd:
      status = jd.busy ? 'Decoding the job description…' : profile ? `Decoded · ${profile.title}` : 'Upload, paste or pick a requisition';
      next = jd.busy
        ? { label: 'Decoding', disabled: true, busy: true }
        : profile && jd.ready
          ? { label: 'Review Search DNA', onClick: () => studio.goTo(STEP.decode) }
          : jd.textOk
            ? { label: 'Decode JD', onClick: () => void studio.analyze() }
            : { label: 'Add a JD to start', disabled: true };
      break;
    case STEP.decode: {
      const must = profile?.skills.filter((x) => x.must).length ?? 0;
      status = `${must} must-have${s(must)} · ${(profile?.skills.length ?? 0) - must} nice-to-have · JD health ${profile?.quality.score ?? '—'}`;
      next = { label: 'Find talent', onClick: () => studio.goTo(STEP.pool) };
      break;
    }
    case STEP.pool:
      status = `${strong} strong fit${s(strong)} in your pool · ${picks} selected`;
      next = { label: 'Search LinkedIn', onClick: () => studio.goTo(STEP.linkedin) };
      break;
    case STEP.linkedin:
      status = prospects === null ? 'Scanning the prospect feed…' : `${prospects} prospect${s(prospects)} · ${picks} selected`;
      next = { label: picks ? `Write ${picks} message${s(picks)}` : 'Go to outreach', onClick: () => studio.goTo(STEP.outreach) };
      break;
    default:
      status = finished ? 'Outreach wrapped up' : picks ? `${logged} of ${picks} logged` : 'Select people to message';
      next = finished || !picks ? null : { label: 'Wrap up', onClick: () => studio.setOutreach({ finished: true }) };
  }

  const back = finished && step === STEP.outreach ? () => studio.setOutreach({ finished: false }) : step > 0 ? () => studio.goTo((step - 1) as StudioStep) : undefined;

  return (
    <nav className="tl-src-foot" aria-label="Studio steps">
      <button type="button" className="btn btn--ghost tl-src-foot__back" onClick={back} disabled={!back} aria-label={finished && step === STEP.outreach ? 'Back to messages' : 'Previous step'}>
        <ArrowLeft aria-hidden="true" /> <span>{finished && step === STEP.outreach ? 'Messages' : 'Back'}</span>
      </button>
      <div className="tl-src-foot__status" role="status" aria-live="polite">
        <span className="tl-src-foot__step">
          Step {step + 1}/{STEPS.length}
          <span className="tl-src-foot__label"> · {STEPS[step].label}</span>
        </span>
        <span className="tl-src-foot__bar" aria-hidden="true">
          {STEPS.map((x, i) => (
            <i key={x.id} className={cx(i < step && 'is-done', i === step && 'is-on')} />
          ))}
        </span>
        <span className="tl-src-foot__text">{status}</span>
      </div>
      {next && (
        <button type="button" className="btn btn--primary tl-src-foot__next" onClick={next.onClick} disabled={next.disabled}>
          {next.busy && <LoaderCircle className="spin" aria-hidden="true" />}
          <span>{next.label}</span>
          {!next.busy && <ArrowRight aria-hidden="true" />}
        </button>
      )}
    </nav>
  );
}
