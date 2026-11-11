/**
 * Helix Wellbeing — Breathe: a guided breathwork studio (orb that expands and
 * contracts with each phase, live countdown, four patterns, 1/2/5-minute
 * sessions), a visual ambient soundscape, desk micro-resets with step timers,
 * and a one-tap Focus Engine break. Reduced motion → static guidance only.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Accessibility, ArrowRight, Check, Coffee, Droplets, Eye, Hand, Leaf, Pause, PersonStanding, Play, RotateCcw, SkipForward, Sparkles, Square, StretchHorizontal, Timer, Wind } from 'lucide-react';
import { Chip, NeoHome, NeoPanel, Ring } from '@/components/neo';
import { startBreak } from '@/components/FocusEngine';
import { mmss, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { calmMinutes, calmStreak, cycleSecs, phaseAt, sessionCycles, sessionSecs } from '@/wellbeing/engine';
import { BREATH_PATTERNS, BREATH_PATTERN_BY_ID, MICRO_RESETS, PHASE_LABEL, SOUNDSCAPES, isoDay, startOfDay, type MicroReset } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { BreathPattern, BreathPatternId, SoundscapeId } from '@/wellbeing/types';
import { RadioPills, U, useMe, useReducedMotion } from './parts';

const LO = 0.58;
const HI = 1;
const ease = (t: number) => 0.5 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))) / 2;
const isPattern = (v: string | null): v is BreathPatternId => !!v && v in BREATH_PATTERN_BY_ID;

/** Orb scale for an instant of the pattern (holds keep the size of the phase before them). */
function orbScale(p: BreathPattern, elapsed: number): number {
  const ph = phaseAt(p, elapsed);
  if (ph.phase === 'inhale') return LO + (HI - LO) * ease(ph.progress);
  if (ph.phase === 'exhale') return HI - (HI - LO) * ease(ph.progress);
  const before = p.phases[(ph.index - 1 + p.phases.length) % p.phases.length].phase;
  return before === 'inhale' ? HI : LO;
}

const RESET_ICON: Record<MicroReset['icon'], ReactNode> = {
  stretch: <StretchHorizontal />,
  eye: <Eye />,
  posture: <Accessibility />,
  water: <Droplets />,
  hands: <Hand />,
  stand: <PersonStanding />,
};

type Status = 'idle' | 'running' | 'paused' | 'done';

export function BreatheView() {
  const { uid, data } = useMe();
  const [params, setParams] = useSearchParams();
  const reduced = useReducedMotion();
  const logBreath = useWellbeing((s) => s.logBreath);

  const [patternId, setPatternId] = useState<BreathPatternId>(() => (isPattern(params.get('pattern')) ? (params.get('pattern') as BreathPatternId) : 'box'));
  const [mins, setMins] = useState<number>(() => ([1, 2, 5].includes(Number(params.get('mins'))) ? Number(params.get('mins')) : 2));
  const pattern = BREATH_PATTERN_BY_ID[patternId];
  const total = sessionSecs(pattern, mins);
  const cycles = sessionCycles(pattern, mins);

  const [status, setStatus] = useState<Status>('idle');
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const baseRef = useRef(0);
  const loggedRef = useRef(false);
  const orbRef = useRef<HTMLDivElement>(null);

  const start = () => {
    baseRef.current = 0;
    startRef.current = performance.now();
    loggedRef.current = false;
    setElapsed(0);
    setStatus('running');
  };
  const pause = () => {
    baseRef.current += (performance.now() - startRef.current) / 1000;
    setStatus('paused');
  };
  const resume = () => {
    startRef.current = performance.now();
    setStatus('running');
  };
  const reset = () => {
    baseRef.current = 0;
    setElapsed(0);
    setStatus('idle');
    orbRef.current?.style.setProperty('--b', String(LO));
  };

  // Deep link: /wellbeing/breathe?pattern=box&mins=2&autostart=1
  useEffect(() => {
    if (params.get('autostart') !== '1') return;
    start();
    const next = new URLSearchParams(params);
    next.delete('autostart');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One rAF loop drives the orb directly (no re-render per frame) and the HUD at ~4 Hz.
  useEffect(() => {
    if (status !== 'running') return;
    let raf = 0;
    let shown = -1;
    const tick = () => {
      const e = baseRef.current + (performance.now() - startRef.current) / 1000;
      if (e >= total) {
        setElapsed(total);
        setStatus('done');
        orbRef.current?.style.setProperty('--b', String(LO));
        if (!loggedRef.current && uid) {
          loggedRef.current = true;
          logBreath(uid, patternId, Math.round((total / 60) * 10) / 10);
        }
        return;
      }
      if (!reduced) orbRef.current?.style.setProperty('--b', orbScale(pattern, e).toFixed(4));
      const q = Math.floor(e * 4);
      if (q !== shown) {
        shown = q;
        setElapsed(e);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, pattern, patternId, total, reduced, uid, logBreath]);

  const ph = phaseAt(pattern, Math.min(elapsed, total - 0.001));
  const running = status === 'running' || status === 'paused';
  const left = Math.max(0, total - elapsed);
  const calmWeek = calmMinutes(data.breaths, startOfDay(Date.now()) - 6 * 86_400_000);
  const streak = calmStreak(data.breaths, isoDay(Date.now()));

  const choosePattern = (id: BreathPatternId) => {
    setPatternId(id);
    reset();
  };
  const chooseMins = (m: number) => {
    setMins(m);
    reset();
  };

  return (
    <div className="wb-view">
      <NeoHome
        main={
          <>
            <NeoPanel className="wb-studio" hud="Breathwork studio" title="Breathe with the orb" actions={<Chip tone="app" size="sm" icon={<Timer />}>{mmss(total * 1000)}</Chip>}>
              <div className="wb-studio__grid">
                <div className="wb-studio__stage">
                  <div className={cx('wb-breath', `is-${status}`, reduced && 'is-static')} data-phase={running ? ph.phase : 'idle'} style={{ '--progress': running || status === 'done' ? elapsed / total : 0 } as CSSProperties}>
                    <svg className="wb-breath__ring" viewBox="0 0 120 120" aria-hidden="true">
                      <circle className="wb-breath__track" cx="60" cy="60" r="56" />
                      <circle className="wb-breath__prog" cx="60" cy="60" r="56" pathLength={100} style={{ strokeDashoffset: 100 - (status === 'idle' ? 0 : (elapsed / total) * 100) }} />
                    </svg>
                    <div ref={orbRef} className="wb-breath__orb" style={{ '--b': LO } as CSSProperties} aria-hidden="true">
                      <i className="wb-breath__glow" />
                      <i className="wb-breath__body" />
                      <i className="wb-breath__shine" />
                    </div>
                    <div className="wb-breath__hud" aria-live="polite" aria-atomic="true">
                      {status === 'done' ? (
                        <>
                          <Check className="wb-breath__check" aria-hidden="true" />
                          <span className="wb-breath__phase">Session complete</span>
                        </>
                      ) : running ? (
                        <>
                          <span className="wb-breath__phase">{PHASE_LABEL[ph.phase]}</span>
                          <span className="wb-breath__count">{Math.max(1, Math.ceil(ph.secsLeft - 0.001))}</span>
                        </>
                      ) : (
                        <>
                          <Wind className="wb-breath__idle" aria-hidden="true" />
                          <span className="wb-breath__phase">Ready</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ol className="wb-phases" aria-label="Pattern phases">
                    {pattern.phases.map((p, i) => (
                      <li key={`${p.phase}-${i}`} className={cx(running && ph.index === i && 'is-on')}>
                        <span>{PHASE_LABEL[p.phase]}</span>
                        <b>
                          {p.secs}
                          <U u="s" />
                        </b>
                      </li>
                    ))}
                  </ol>

                  <div className="wb-studio__meta">
                    <span className="wb-stat">
                      <Timer aria-hidden="true" />
                      <span>Time left</span>
                      <b>{mmss(left * 1000)}</b>
                    </span>
                    <span className="wb-stat">
                      <RotateCcw aria-hidden="true" />
                      <span>Cycle</span>
                      <b>
                        {Math.min(cycles, ph.cycle + (status === 'idle' ? 0 : 1))}/{cycles}
                      </b>
                    </span>
                  </div>

                  <div className="wb-studio__controls">
                    {status === 'running' ? (
                      <button type="button" className="neo-btn neo-btn--soft" onClick={pause}>
                        <Pause />
                        <span>Pause</span>
                      </button>
                    ) : status === 'paused' ? (
                      <button type="button" className="neo-btn neo-btn--plasma" onClick={resume}>
                        <Play />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <button type="button" className="neo-btn neo-btn--plasma" onClick={start}>
                        <Play />
                        <span>{status === 'done' ? 'Go again' : 'Start'}</span>
                      </button>
                    )}
                    {status !== 'idle' && (
                      <button type="button" className="neo-btn neo-btn--ghost" onClick={reset}>
                        <Square />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>

                  {status === 'done' && (
                    <div className="wb-breath-done" role="status">
                      <span className="wb-breath-done__burst" aria-hidden="true" />
                      <Leaf aria-hidden="true" />
                      <span>Calm minutes logged</span>
                      <b>+{Math.round((total / 60) * 10) / 10}</b>
                      <Link to="/wellbeing" className="neo-btn neo-btn--ghost neo-btn--xs">
                        <span>Back to Aura</span>
                        <ArrowRight className="wb-flip" />
                      </Link>
                    </div>
                  )}
                  {reduced && <p className="wb-muted wb-studio__reduced">Reduced motion is on: follow the phase name and the countdown.</p>}
                </div>

                <div className="wb-studio__pick">
                  <div className="neo-hud">Pattern</div>
                  <RadioPills
                    label="Breathing pattern"
                    variant="tile"
                    className="wb-patterns"
                    value={patternId}
                    onChange={choosePattern}
                    options={BREATH_PATTERNS.map((p) => ({ value: p.id, label: p.label, icon: <span className="wb-pattern__short">{p.short}</span>, hint: p.description }))}
                  />
                  <div className="neo-hud">Session length</div>
                  <RadioPills
                    label="Session length"
                    value={mins}
                    onChange={chooseMins}
                    options={[1, 2, 5].map((m) => ({
                      value: m,
                      label: (
                        <>
                          <b>{m}</b> <span>min</span>
                        </>
                      ),
                    }))}
                  />
                  <p className="wb-studio__cycle">
                    <span>One cycle</span>{' '}
                    <b>
                      {cycleSecs(pattern)}
                      <U u="s" />
                    </b>{' '}
                    <span>·</span> <b>{cycles}</b> <span>cycles</span>
                  </p>
                </div>
              </div>
            </NeoPanel>

            <SoundscapePanel uid={uid} value={data.soundscape} playing={status === 'running'} reduced={reduced} />
            <MicroResetsPanel />
          </>
        }
        side={
          <>
            <NeoPanel hud="Calm minutes" title="Your calm this week">
              <div className="wb-calm">
                <Ring value={Math.min(1, calmWeek / 30)} size={104} stroke={8} label="Calm minutes this week">
                  <span className="wb-calm__num">{calmWeek}</span>
                </Ring>
                <div className="wb-calm__text">
                  <span className="wb-stat">
                    <Sparkles aria-hidden="true" />
                    <span>Weekly goal</span>
                    <b>
                      30
                      <U u="m" />
                    </b>
                  </span>
                  <span className="wb-stat">
                    <Leaf aria-hidden="true" />
                    <span>Calm streak</span>
                    <b>{streak}</b>
                  </span>
                </div>
              </div>
              <ul className="wb-sessions">
                {[...data.breaths]
                  .sort((a, b) => b.at - a.at)
                  .slice(0, 5)
                  .map((b) => (
                    <li key={b.id}>
                      <Wind aria-hidden="true" />
                      <span className="wb-sessions__name">{BREATH_PATTERN_BY_ID[b.patternId]?.label ?? b.patternId}</span>
                      <b>
                        {b.minutes}
                        <U u="m" />
                      </b>
                      <span className="wb-sessions__time">{relativeTime(b.at)}</span>
                    </li>
                  ))}
              </ul>
            </NeoPanel>
            <NeoPanel className="wb-breakcard" hud="Focus Engine" title="Take a real break">
              <p className="wb-muted">Five minutes away from the screen. Your status switches to “On a short break” so nobody expects a reply.</p>
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--block"
                onClick={() => {
                  startBreak(5);
                  toast.info('Break started', 'Five minutes. Your status shows you’re on a short break.');
                }}
              >
                <Coffee />
                <span>Take a break</span>
              </button>
            </NeoPanel>
          </>
        }
        sideLabel="Calm"
      />
    </div>
  );
}

/* ───────────────────────── soundscape ───────────────────────── */

function SoundscapePanel({ uid, value, playing, reduced }: { uid: string; value: SoundscapeId; playing: boolean; reduced: boolean }) {
  const setSoundscape = useWellbeing((s) => s.setSoundscape);
  const scape = SOUNDSCAPES.find((s) => s.id === value) ?? SOUNDSCAPES[0];
  return (
    <NeoPanel hud="Ambient soundscape" title="Set the mood" actions={<Chip tone="slate" size="sm">Visual only</Chip>}>
      <div className={cx('wb-wave', playing && 'is-playing', reduced && 'is-static')} data-scape={scape.id} style={{ '--w1': scape.c1, '--w2': scape.c2 } as CSSProperties} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg key={i} className="wb-wave__layer" data-i={i} viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0 60 C 150 20, 300 100, 450 60 S 750 20, 900 60 S 1050 100, 1200 60 L1200 120 L0 120 Z" />
          </svg>
        ))}
        <span className="wb-wave__label">
          <b>{scape.label}</b>
          <span>{scape.hint}</span>
        </span>
      </div>
      <RadioPills label="Soundscape" className="wb-scapes" value={value} onChange={(v) => setSoundscape(uid, v)} options={SOUNDSCAPES.map((s) => ({ value: s.id, label: s.label, icon: <i className="wb-scapedot" style={{ background: `linear-gradient(135deg, ${s.c1}, ${s.c2})` }} /> }))} />
    </NeoPanel>
  );
}

/* ───────────────────────── micro-resets ───────────────────────── */

function MicroResetsPanel() {
  const [active, setActive] = useState<{ id: string; step: number; startedAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reset = useMemo(() => MICRO_RESETS.find((r) => r.id === active?.id) ?? null, [active?.id]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active || !reset) return;
    const step = reset.steps[active.step];
    if (now - active.startedAt >= step.secs * 1000) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const begin = (id: string) => {
    setNow(Date.now());
    setActive({ id, step: 0, startedAt: Date.now() });
  };
  const advance = () => {
    if (!active || !reset) return;
    if (active.step + 1 >= reset.steps.length) {
      toast.success('Micro-reset done', reset.title);
      setActive(null);
      return;
    }
    setActive({ ...active, step: active.step + 1, startedAt: Date.now() });
  };

  return (
    <NeoPanel hud="Micro-resets" title="One-minute resets for your desk">
      <div className="wb-resets">
        {MICRO_RESETS.map((r) => {
          const on = active?.id === r.id;
          const step = on ? r.steps[active.step] : null;
          const into = on && step ? Math.min(1, (now - active.startedAt) / (step.secs * 1000)) : 0;
          return (
            <article key={r.id} className={cx('wb-reset', 'neo-spot', on && 'is-on')}>
              <header className="wb-reset__head">
                <span className="wb-reset__icon" aria-hidden="true">
                  {RESET_ICON[r.icon]}
                </span>
                <div className="wb-reset__titles">
                  <h3>{r.title}</h3>
                  <span className="wb-reset__meta">
                    <b>{r.minutes}</b> <span>min</span> <span>·</span> <b>{r.steps.length}</b> <span>steps</span>
                  </span>
                </div>
              </header>
              {on && step ? (
                <div className="wb-reset__run" aria-live="polite">
                  <Ring value={into} size={46} stroke={5} label="Step progress">
                    <span className="wb-reset__secs">{Math.max(0, Math.ceil(step.secs - (now - active.startedAt) / 1000))}</span>
                  </Ring>
                  <div className="wb-reset__step">
                    <span className="wb-reset__stepn">
                      <span>Step</span> <b>{active.step + 1}</b>/<b>{r.steps.length}</b>
                    </span>
                    <p>{step.label}</p>
                  </div>
                  <div className="wb-reset__btns">
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={advance} aria-label="Next step">
                      <SkipForward className="wb-flip" />
                    </button>
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setActive(null)} aria-label="Stop reset">
                      <Square />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="wb-reset__blurb">{r.blurb}</p>
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => begin(r.id)}>
                    <Play />
                    <span>Start</span>
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </NeoPanel>
  );
}
