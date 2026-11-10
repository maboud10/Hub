/**
 * HR Home · new-hire spotlight: "Day N of your first 90" with the journey arc
 * (Pre-boarding → Day one → First week → 30 → 60 → 90 days, driven by the
 * Talent Hub hand-off journey), your manager and buddy, your next onboarding
 * tasks (tick them off right here) and the pulse check-in card.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, Flag, HeartHandshake, ListChecks, Quote, Rocket, Sunrise } from 'lucide-react';
import type { OnboardingJourney, OnboardingPhase, OnboardingTask } from '@/talent/types';
import { PHASE_META, PHASE_ORDER } from '@/talent/constants';
import { useTalent } from '@/talent/store';
import { calendarPhase, daysUntilStart, journeyProgress, taskDueDate } from '@/talent/onboarding';
import { useTeam } from '@/hr/selectors';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { UserLine } from '../components/shared';
import { PulseCard } from './Pulse';

const DAY = 86_400_000;

// ───────────────────────── arc geometry ─────────────────────────
/** Days since day one (0 = day one) at which each node sits: offer → D1 → end of W1 → day 30 → 60 → 90. */
const ANCHORS = [-14, 0, 6, 29, 59, 89];
const SAMPLES = 60;
/** Rising S-curve (fraction of the arc height, 0 = top). */
const yAt = (t: number) => 0.86 - (0.7 * (1 - Math.cos(Math.PI * t))) / 2;
const curve = (to: number) => {
  const n = Math.max(1, Math.round(SAMPLES * to));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * to;
    return `${i ? 'L' : 'M'}${(t * 1000).toFixed(1)} ${(yAt(t) * 100).toFixed(1)}`;
  }).join(' ');
};
const FULL_PATH = curve(1);

/** Marker position (0–1) along the arc for a day offset. */
function markerAt(s: number) {
  if (s <= ANCHORS[0]) return 0;
  for (let i = 1; i < ANCHORS.length; i += 1) {
    if (s <= ANCHORS[i]) return (i - 1 + (s - ANCHORS[i - 1]) / (ANCHORS[i] - ANCHORS[i - 1])) / (ANCHORS.length - 1);
  }
  return 1;
}

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

function dueLabel(due: number, now: number): { text: string; tone: 'late' | 'soon' | 'later' } {
  const diff = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (diff < 0) return { text: `${-diff} day${diff === -1 ? '' : 's'} overdue`, tone: 'late' };
  if (diff === 0) return { text: 'Due today', tone: 'soon' };
  if (diff === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (diff < 7) return { text: `Due in ${diff} days`, tone: 'soon' };
  return { text: `Due ${new Date(due).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, tone: 'later' };
}

function milestoneLine(s: number, idx: number): string {
  if (s > ANCHORS[5]) return 'You’ve completed your first 90 days. What a journey! 🎉';
  if (idx === 0) return `Day one is in ${-s} day${s === -1 ? '' : 's'}. We can’t wait to meet you.`;
  if (idx === 1) return 'It’s day one! Welcome aboard 🎉';
  const left = ANCHORS[idx] - s;
  const label = ['', '', 'first-week', '30-day', '60-day', '90-day'][idx];
  if (left <= 0) return `Today is your ${label} milestone 🎉`;
  return `${left} day${left === 1 ? '' : 's'} to your ${label} milestone.`;
}

// ───────────────────────── spotlight ─────────────────────────
export function NewHireSpotlight({ onPulse }: { onPulse: () => void }) {
  const me = useSessionUser();
  const { manager } = useTeam();
  const now = useNow(60_000);
  const journey = useTalent((s) => (me ? s.onboarding.find((j) => j.hubUserId === me.id) : undefined));
  if (!me) return null;

  const startDate = journey?.startDate ?? me.startDate;
  const s = -daysUntilStart({ startDate }, now);
  const current = calendarPhase({ startDate }, now);
  const currentIdx = PHASE_ORDER.indexOf(current);
  const prog = journey ? journeyProgress(journey, now) : null;
  const phase = PHASE_META[current];
  const managerId = journey?.managerId ?? manager?.id;
  const first = me.name.split(/\s+/)[0];

  return (
    <section className="neo-panel hr-home-spot" aria-labelledby="hr-home-spot-title">
      <div className="hr-home-spot__glow" aria-hidden="true" />
      <header className="hr-home-spot__head">
        <div className="grow">
          <div className="neo-hud neo-hud--tint">Your first 90 days</div>
          <h2 id="hr-home-spot-title" className="hr-home-spot__title">
            {s >= 0 ? (
              <>
                Day <span className="hr-home-spot__day">{s + 1}</span> <small>of your first 90</small>
              </>
            ) : (
              <>
                Starting in <span className="hr-home-spot__day">{-s}</span> <small>day{s === -1 ? '' : 's'}</small>
              </>
            )}
          </h2>
          <p className="hr-home-spot__sub">
            <span className="hr-home-spot__phase" style={{ '--ph-h': phase.hue } as CSSProperties}>
              {phase.label} · {phase.window}
            </span>
            <span>{milestoneLine(s, currentIdx)}</span>
          </p>
        </div>
        {journey && prog && (
          <div className="hr-home-spot__cta">
            <div className="hr-home-spot__pct" aria-label={`${prog.percent}% of your onboarding plan done`}>
              <b>{prog.percent}%</b>
              <span>of the plan done</span>
            </div>
            <Link to={`/hr/onboarding/${journey.id}`} className="btn btn--sm">
              <Rocket /> Open my journey
            </Link>
          </div>
        )}
      </header>

      <JourneyArc s={s} currentIdx={currentIdx} phases={prog?.phases ?? null} />

      <div className="hr-home-spot__grid">
        <div className="hr-home-spot__people">
          <h3 className="hr-home-spot__h">
            <HeartHandshake aria-hidden="true" /> Your people
          </h3>
          <div className="hr-home-spot__person">
            <span className="hr-home-spot__role">Manager</span>
            <UserLine userId={managerId} size={36} />
          </div>
          <div className="hr-home-spot__person">
            <span className="hr-home-spot__role">Buddy</span>
            {journey?.buddyId ? <UserLine userId={journey.buddyId} size={36} /> : <span className="text-sm faint">Being matched with you. You’ll get a hello soon.</span>}
          </div>
          {journey?.welcomeNote && (
            <blockquote className="hr-home-spot__quote">
              <Quote aria-hidden="true" />
              {journey.welcomeNote}
            </blockquote>
          )}
        </div>
        <div className="hr-home-spot__tasks">
          <h3 className="hr-home-spot__h">
            <ListChecks aria-hidden="true" /> Your next onboarding steps
          </h3>
          {journey ? <MyOnboardingTasks journey={journey} now={now} first={first} /> : <p className="text-sm muted">Your onboarding plan appears here once People Ops hands it over.</p>}
        </div>
      </div>

      <PulseCard onOpen={onPulse} />
    </section>
  );
}

// ───────────────────────── arc ─────────────────────────
function JourneyArc({ s, currentIdx, phases }: { s: number; currentIdx: number; phases: { phase: OnboardingPhase; done: number; total: number; overdue: number }[] | null }) {
  const tm = markerAt(s);
  const last = PHASE_ORDER.length - 1;
  return (
    <div className="hr-home-arc" role="img" aria-label={`Journey: ${PHASE_META[PHASE_ORDER[currentIdx]].label} phase, day ${Math.max(0, s + 1)} of 90`}>
      <div className="hr-home-arc__track">
        <svg className="hr-home-arc__svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="hr-home-arc-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: 'var(--hr-1)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--hr-2)' }} />
            </linearGradient>
          </defs>
          <path className="hr-home-arc__rail" d={FULL_PATH} vectorEffect="non-scaling-stroke" />
          {tm > 0 && <path className="hr-home-arc__done" d={curve(tm)} vectorEffect="non-scaling-stroke" stroke="url(#hr-home-arc-grad)" />}
        </svg>
        {PHASE_ORDER.map((p, i) => {
          const t = i / last;
          const ph = phases?.[i];
          const state = i < currentIdx ? 'past' : i === currentIdx ? 'current' : 'future';
          const complete = !!ph && ph.total > 0 && ph.done === ph.total;
          return (
            <span
              key={p}
              className={cx('hr-home-arc__node', `is-${state}`, complete && 'is-complete', !!ph?.overdue && 'is-late')}
              style={{ '--t': t, '--y': yAt(t), '--ph-h': PHASE_META[p].hue } as CSSProperties}
              title={`${PHASE_META[p].label}${ph ? ` · ${ph.done}/${ph.total} tasks` : ''}`}
            >
              {complete || (state === 'past' && !ph) ? <Check aria-hidden="true" /> : state === 'current' ? <Sunrise aria-hidden="true" /> : i === last ? <Flag aria-hidden="true" /> : <span>{PHASE_META[p].short}</span>}
            </span>
          );
        })}
        <span className={cx('hr-home-arc__here', tm < 0.25 && 'is-flip')} style={{ '--t': tm, '--y': yAt(tm) } as CSSProperties}>
          <span className="hr-home-arc__bubble">{s < 0 ? 'Soon' : s > ANCHORS[last] ? 'Day 90+' : `You · day ${s + 1}`}</span>
          <i aria-hidden="true" />
        </span>
      </div>
      <ol className="hr-home-arc__labels">
        {PHASE_ORDER.map((p, i) => {
          const ph = phases?.[i];
          return (
            <li key={p} className={cx(i === 0 && 'is-first', i === last && 'is-last', i === currentIdx && 'is-current')} style={{ '--t': i / last } as CSSProperties}>
              <span className="hr-home-arc__name">
                <span className="hr-home-arc__full">{PHASE_META[p].label}</span>
                <span className="hr-home-arc__short">{PHASE_META[p].short}</span>
              </span>
              {ph && ph.total > 0 && (
                <span className={cx('hr-home-arc__count', ph.overdue > 0 && 'is-late')}>
                  {ph.done}/{ph.total}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────── tasks ─────────────────────────
function MyOnboardingTasks({ journey: j, now, first }: { journey: OnboardingJourney; now: number; first: string }) {
  const toggle = useTalent((s) => s.toggleOnboardingTask);
  const mine = j.tasks.filter((t) => t.owner === 'new-hire');
  const open = mine.filter((t) => !t.done).sort((a, b) => a.dueOffsetDays - b.dueOffsetDays);
  const doneCount = mine.length - open.length;
  if (!open.length)
    return (
      <p className="hr-home-spot__alldone">
        <Check aria-hidden="true" /> All {mine.length} of your tasks are done. Brilliant work, {first}!
      </p>
    );
  return (
    <>
      <ul className="hr-home-otasks">
        {open.slice(0, 3).map((t: OnboardingTask) => {
          const due = dueLabel(taskDueDate(j, t), now);
          return (
            <li key={t.id} className={cx('hr-home-otask', `is-${due.tone}`)}>
              <button type="button" role="checkbox" aria-checked={false} className="hr-home-otask__check" aria-label={`Mark “${t.title}” as done`} onClick={() => toast.result(toggle(j.id, t.id))}>
                <Check aria-hidden="true" />
              </button>
              <span className="hr-home-otask__title">{t.title}</span>
              <span className="hr-home-otask__due">{due.text}</span>
            </li>
          );
        })}
      </ul>
      <Link to={`/hr/onboarding/${j.id}`} className="hr-home-spot__more">
        {doneCount}/{mine.length} done · see the whole plan <ArrowRight aria-hidden="true" />
      </Link>
    </>
  );
}
