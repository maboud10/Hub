/**
 * Nova Triage — the signature Support Home console.
 * Describe → thinking (real signals being checked) → diagnosis with
 * confidence, evidence and a one-click Fix-it playbook, related guides and a
 * fully prefilled ticket.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertOctagon, AlertTriangle, ArrowRight, BookOpen, Check, CircleDot, Info, Loader2, RotateCcw, ShieldAlert, Sparkles, TicketPlus, Wand2 } from 'lucide-react';
import { NovaChip, Ring, useTypewriter } from '@/components/neo';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import { triage, TRIAGE_SUGGESTIONS, type IntentId, type TriageResult } from '@/helpdesk/triage';
import { PLAYBOOKS, type PlaybookPlan } from '@/helpdesk/playbooks';
import { primaryDevice } from '@/helpdesk/fleet';
import { activeIncidents } from '@/helpdesk/queries';
import { CATEGORY_LABEL, officeOf } from '@/helpdesk/meta';
import { CategoryGlyph, PriorityPill, useOpenTicket, useViewer } from './ui';
import { PlaybookTerminal, usePlanFor } from './playbook';

const reduced = () => document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SIGNAL_ICON = { bad: AlertOctagon, warn: AlertTriangle, info: Info, good: Check } as const;

export function NovaTriage({ autoFocus }: { autoFocus?: boolean }) {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const incidents = useHelpdesk((s) => s.incidents);
  const guides = useHelpdesk((s) => s.guides);
  const planFor = usePlanFor();
  const openTicket = useOpenTicket();
  const navigate = useNavigate();
  const input = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);

  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'result'>('idle');
  const [think, setThink] = useState(0);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [fix, setFix] = useState<{ plan: PlaybookPlan; deviceTag?: string } | null>(null);
  const [fixed, setFixed] = useState<{ plan: PlaybookPlan; ticketId?: string } | null>(null);
  const [cause, causeDone] = useTypewriter(phase === 'result' && result ? result.cause : '', 120);

  const me = viewer?.user.id ?? '';
  const office = officeOf(viewer?.user.location);
  const mine = useMemo(() => devices.filter((d) => d.assigneeId === me), [devices, me]);
  const primary = useMemo(() => primaryDevice(devices, me), [devices, me]);
  const live = useMemo(() => activeIncidents(incidents), [incidents]);

  const steps = useMemo(
    () => [
      'Reading your description',
      primary ? `Checking ${primary.model} · ${primary.assetTag}` : 'Checking your devices',
      `Checking live service status${office !== 'Remote' ? ` in ${office}` : ''}`,
      'Matching 11 fix-it playbooks and 15 guides',
    ],
    [primary, office],
  );

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const run = (q: string, intent?: IntentId) => {
    const t = q.trim();
    if (t.length < 3) {
      input.current?.focus();
      return;
    }
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = [];
    setText(t);
    setFix(null);
    setFixed(null);
    setThink(0);
    setPhase('thinking');
    const r = triage(t, { now: Date.now(), office, devices: mine, incidents: live }, { intent });
    const beat = reduced() ? 60 : 380;
    steps.forEach((_, i) => timers.current.push(window.setTimeout(() => setThink(i + 1), beat * (i + 1))));
    timers.current.push(
      window.setTimeout(() => {
        setResult(r);
        setPhase('result');
      }, beat * (steps.length + 1)),
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(text);
  };

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setFix(null);
    setFixed(null);
    setText('');
    requestAnimationFrame(() => input.current?.focus());
  };

  const startFix = () => {
    if (!result?.playbookId) return;
    setFix(planFor(result.playbookId, text));
  };

  const onFixDone = (plan: PlaybookPlan) => {
    const r = useHelpdesk.getState().recordFix({ plan, deviceTag: fix?.deviceTag });
    setFixed({ plan, ticketId: r.ok ? r.ticketId : undefined });
    if (r.ok && r.ticketId) toast.success(plan.outcome === 'success' ? 'Fixed by Nova' : 'Partly fixed', `Saved to your history as ${r.ticketId}`);
  };

  const ticketFromTriage = () => {
    if (!result) return;
    const extra = fixed ? `\n\nNova already tried “${PLAYBOOKS[fixed.plan.playbookId].title}”: ${fixed.plan.summary}` : '';
    openTicket({
      category: result.ticket.category,
      device: result.ticket.deviceTag,
      subject: result.ticket.subject,
      description: result.ticket.description + extra,
      impact: result.ticket.impact,
      urgency: result.ticket.urgency,
    });
  };

  const relatedGuides = result ? result.guides.map((slug) => guides.find((g) => g.slug === slug)).filter((g): g is NonNullable<typeof g> => !!g) : [];

  return (
    <section className="hd-nova neo-nova" aria-label="Nova triage" data-phase={phase}>
      <div className="neo-nova__glow" />
      <div className="hd-nova__grid" aria-hidden="true" />
      <header className="hd-nova__head">
        <span className="hd-orb" aria-hidden="true">
          <i />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="neo-hud">Nova triage</div>
          <h2 className="hd-nova__title">{phase === 'idle' ? 'Describe what’s going on' : phase === 'thinking' ? 'Diagnosing…' : 'Here’s what I found'}</h2>
        </div>
        <NovaChip>Fixes most issues in under a minute</NovaChip>
      </header>

      <form className="hd-nova__prompt" onSubmit={onSubmit}>
        <textarea
          ref={input}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run(text);
            }
          }}
          placeholder="e.g. My VPN drops every few minutes when I’m on calls"
          aria-label="Describe your issue"
          data-qa="nova-input"
        />
        <button type="submit" className="neo-btn neo-btn--plasma" disabled={phase === 'thinking'} data-qa="nova-go">
          {phase === 'thinking' ? <Loader2 className="hd-spin" /> : <Sparkles />}
          <span>Diagnose</span>
        </button>
      </form>

      {phase === 'idle' && (
        <div className="hd-nova__chips" role="list" aria-label="Try one of these">
          {TRIAGE_SUGGESTIONS.map((s) => (
            <button key={s} type="button" role="listitem" className="hd-suggest" onClick={() => run(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {phase === 'thinking' && (
        <ol className="hd-think" aria-live="polite">
          {steps.map((s, i) => (
            <li key={s} data-state={i < think ? 'done' : i === think ? 'run' : 'wait'}>
              <span className="hd-think__icon">{i < think ? <Check /> : i === think ? <Loader2 className="hd-spin" /> : <CircleDot />}</span>
              {s}
            </li>
          ))}
        </ol>
      )}

      {phase === 'result' && result && (
        <div className="hd-dx neo-rise" data-qa="nova-result">
          <div className="hd-dx__top">
            <div className="hd-dx__conf">
              <Ring value={result.confidence} size={78} stroke={6} color={result.confidence >= 0.7 ? undefined : 'var(--hd-warn)'} label={`Confidence ${Math.round(result.confidence * 100)}%`}>
                <span className="hd-dx__pct">
                  {Math.round(result.confidence * 100)}
                  <small>%</small>
                </span>
              </Ring>
              <span className="neo-hud">Confidence</span>
            </div>
            <div className="hd-dx__text">
              <div className="hd-dx__eyebrow">
                <CategoryGlyph category={result.ticket.category} size={22} />
                <span className="neo-hud neo-hud--tint">{result.intent ? `Likely cause · ${CATEGORY_LABEL[result.ticket.category]}` : 'No confident match'}</span>
                <PriorityPill priority={result.ticket.priority} />
              </div>
              <h3 className="hd-dx__title">{result.title}</h3>
              <p className="hd-dx__cause">
                {cause}
                {!causeDone && <span className="hd-caret" aria-hidden="true" />}
              </p>
            </div>
            <button type="button" className="neo-iconbtn" onClick={reset} aria-label="Start over" data-tip="Start over">
              <RotateCcw />
            </button>
          </div>

          {result.signals.length > 0 && (
            <ul className="hd-dx__signals" aria-label="Evidence">
              {result.signals.map((s) => {
                const Icon = SIGNAL_ICON[s.tone];
                return (
                  <li key={s.text} data-tone={s.tone}>
                    <Icon />
                    <span>{s.text}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {!fix && (
            <div className="hd-dx__actions">
              {result.intent === 'lost' ? (
                <button type="button" className="neo-btn neo-btn--danger" onClick={() => navigate(result.ticket.deviceTag ? `/helpdesk/devices/${result.ticket.deviceTag}?lost=1` : '/helpdesk/devices?lost=1')} data-qa="nova-lost">
                  <ShieldAlert /> Report lost device &amp; lock it
                </button>
              ) : (
                result.playbookId && (
                  <button type="button" className="neo-btn neo-btn--plasma neo-btn--lg" onClick={startFix} data-qa="nova-fix">
                    <Wand2 /> Fix it · {PLAYBOOKS[result.playbookId].verb}
                  </button>
                )
              )}
              <button type="button" className={result.playbookId || result.intent === 'lost' ? 'neo-btn neo-btn--soft' : 'neo-btn neo-btn--plasma neo-btn--lg'} onClick={ticketFromTriage} data-qa="nova-ticket">
                <TicketPlus /> {result.playbookId ? 'Still stuck? Create a ticket' : 'Create a ticket'}
              </button>
              {result.intent === 'access' && (
                <Link to="/helpdesk/catalog?tab=access" className="neo-btn neo-btn--ghost">
                  Browse access catalog <ArrowRight />
                </Link>
              )}
            </div>
          )}

          {fix && <PlaybookTerminal plan={fix.plan} onDone={onFixDone} />}

          {fixed && (
            <div className="hd-dx__after neo-rise">
              {fixed.ticketId && (
                <span className="neo-muted text-sm">
                  Logged as{' '}
                  <Link className="neo-tint" to={`/helpdesk/tickets/${fixed.ticketId}`}>
                    {fixed.ticketId}
                  </Link>{' '}
                  · resolved by Nova
                </span>
              )}
              <span className="grow" />
              {fixed.plan.outcome !== 'success' ? (
                <button type="button" className="neo-btn neo-btn--plasma" onClick={ticketFromTriage}>
                  <TicketPlus /> Still stuck? Create a ticket
                </button>
              ) : (
                <>
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={ticketFromTriage}>
                    Still not right?
                  </button>
                  <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={reset}>
                    <Check /> All good
                  </button>
                </>
              )}
            </div>
          )}

          {(relatedGuides.length > 0 || result.alternatives.length > 0) && (
            <div className="hd-dx__foot">
              {relatedGuides.length > 0 && (
                <div className="hd-dx__guides">
                  <span className="neo-hud">Related guides</span>
                  {relatedGuides.map((g) => (
                    <Link key={g.slug} to={`/helpdesk/guides/${g.slug}`} className="hd-guidechip">
                      <BookOpen /> {g.title}
                      <span>{g.minutes} min</span>
                    </Link>
                  ))}
                </div>
              )}
              {result.alternatives.length > 0 && !fix && (
                <div className="hd-dx__alts">
                  <span className="neo-hud">Not quite?</span>
                  {result.alternatives.map((a) => (
                    <button key={a.intent} type="button" className="hd-suggest hd-suggest--sm" onClick={() => run(text, a.intent)}>
                      {a.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
