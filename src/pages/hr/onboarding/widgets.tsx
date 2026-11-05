/**
 * Drop-in onboarding widgets for HR Portal pages (e.g. the HR Home):
 *   <MyOnboardingCard />       the signed-in new hire's own journey (progress, phase, next steps, people)
 *   <HelpingOnboardCard />     journeys where the viewer is the manager or buddy
 *   <OnboardingOverviewCard /> People Ops pulse (active, starting soon, overdue, awaiting accounts)
 * Each reads its own data and renders nothing when it doesn't apply.
 * Styles: `.hr-onb-*` in hr.css.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, ChevronRight, HeartHandshake, Hourglass, Quote, Rocket, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import type { OnboardingJourney } from '@/talent/types';
import { PHASE_META } from '@/talent/constants';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentViewer, useVisibleJourneys } from '@/talent/selectors';
import { daysUntilStart, deriveJourneyStatus, journeyProgress } from '@/talent/onboarding';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { PersonChip } from '@/pages/talent/components/shared';
import { Countdown, dueState, isMyTask, journeyRoles, JourneyAvatar, PhaseTrack, Pill, ProgressRing, roleLabel } from './ui';

/** The signed-in new hire's journey, front and centre (null if they don't have one). */
export function MyOnboardingCard() {
  const viewer = useTalentViewer();
  const journeys = useVisibleJourneys();
  const toggle = useTalent((s) => s.toggleOnboardingTask);
  const now = useNow(60_000);
  const j = viewer ? journeys.find((x) => x.hubUserId === viewer.userId) : undefined;
  if (!j) return null;
  const prog = journeyProgress(j, now);
  const roles = journeyRoles(viewer, j);
  const mine = j.tasks
    .filter((t) => !t.done && isMyTask(roles, t))
    .map((t) => ({ t, due: dueState(j, t, now) }))
    .sort((a, b) => a.due.at - b.due.at)
    .slice(0, 4);
  const phase = PHASE_META[prog.current];
  const first = j.name.split(/\s+/)[0];
  return (
    <section className="hr-onb-mine" aria-labelledby="hr-onb-mine-title">
      <div className="hr-onb-mine__glow" aria-hidden="true" />
      <div className="hr-onb-mine__head">
        <ProgressRing percent={prog.percent} size={104} stroke={9} sub="complete" />
        <div className="grow">
          <div className="eyebrow">Your onboarding</div>
          <h2 id="hr-onb-mine-title" className="hr-onb-mine__title">
            Welcome to {j.department}, {first}!
          </h2>
          <div className="hr-onb-mine__meta">
            <Countdown journey={j} now={now} size="lg" />
            <span className="hr-onb-mine__phase" style={{ '--ph-h': phase.hue } as CSSProperties}>
              {phase.label} · {phase.window}
            </span>
            {prog.overdue > 0 && (
              <Pill tone="danger">
                <TriangleAlert aria-hidden="true" /> {prog.overdue} overdue
              </Pill>
            )}
          </div>
        </div>
        <Link to={`/hr/onboarding/${j.id}`} className="btn btn--primary hr-onb-mine__cta">
          <Rocket /> Open my journey
        </Link>
      </div>
      <PhaseTrack journey={j} now={now} />
      <div className="hr-onb-mine__grid">
        <div>
          <h3 className="hr-onb-mine__h">Your next steps</h3>
          {mine.length ? (
            <ul className="hr-onb-mine__list">
              {mine.map(({ t, due }) => (
                <li key={t.id} className={cx('hr-onb-mine__task', `is-${due.state}`)}>
                  <button type="button" className="hr-onb-check" role="checkbox" aria-checked={false} aria-label={`Mark “${t.title}” as done`} onClick={() => toast.result(toggle(j.id, t.id))}>
                    <Check aria-hidden="true" />
                  </button>
                  <span className="grow">{t.title}</span>
                  <span className={cx('hr-onb-due', `hr-onb-due--${due.state}`)}>{due.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">
              <Check aria-hidden="true" className="inline-icon" /> You’re all caught up. Nice work!
            </p>
          )}
        </div>
        <div>
          <h3 className="hr-onb-mine__h">Your people</h3>
          <div className="hr-onb-mine__person">
            <span className="hr-onb-mine__role">Manager</span>
            <PersonChip userId={j.managerId} />
          </div>
          <div className="hr-onb-mine__person">
            <span className="hr-onb-mine__role">Buddy</span>
            {j.buddyId ? <PersonChip userId={j.buddyId} /> : <span className="faint text-sm">Being assigned</span>}
          </div>
          {j.welcomeNote && (
            <blockquote className="hr-onb-quote">
              <Quote aria-hidden="true" />
              {j.welcomeNote}
            </blockquote>
          )}
        </div>
      </div>
    </section>
  );
}

/** Journeys the viewer is helping with as manager or buddy (null if none). */
export function HelpingOnboardCard() {
  const viewer = useTalentViewer();
  const journeys = useVisibleJourneys();
  const now = useNow(60_000);
  const me = viewer?.userId;
  const list = me ? journeys.filter((j) => j.hubUserId !== me && (j.managerId === me || j.buddyId === me) && deriveJourneyStatus(j, now) !== 'completed') : [];
  if (!list.length) return null;
  return (
    <section className="hr-onb-panel" aria-labelledby="hr-onb-helping">
      <header className="hr-onb-panel__head">
        <h2 id="hr-onb-helping" className="hr-onb-panel__title">
          <HeartHandshake aria-hidden="true" /> People you’re helping onboard
        </h2>
        <Link to="/hr/onboarding" className="btn btn--sm btn--ghost">
          All journeys <ArrowRight />
        </Link>
      </header>
      <div className="hr-onb-helping">
        {list.map((j) => (
          <HelpingRow key={j.id} journey={j} now={now} />
        ))}
      </div>
    </section>
  );
}

function HelpingRow({ journey: j, now }: { journey: OnboardingJourney; now: number }) {
  const viewer = useTalentViewer();
  const prog = journeyProgress(j, now);
  const roles = journeyRoles(viewer, j);
  const mine = j.tasks.filter((t) => !t.done && isMyTask(roles, t));
  const overdue = mine.filter((t) => dueState(j, t, now).state === 'overdue').length;
  const soon = mine.filter((t) => ['today', 'soon', 'overdue'].includes(dueState(j, t, now).state)).length;
  return (
    <Link to={`/hr/onboarding/${j.id}`} className="hr-onb-help">
      <JourneyAvatar journey={j} size={46} />
      <div className="hr-onb-help__body">
        <div className="hr-onb-help__name">
          <span className="truncate">{j.name}</span>
          <span className="hr-onb-help__role">{roleLabel(roles)}</span>
        </div>
        <div className="hr-onb-help__meta">
          <span className="truncate">{j.title}</span>
          <Countdown journey={j} now={now} />
        </div>
        <div className="hr-onb-help__bar">
          <div className="progress">
            <span style={{ width: `${prog.percent}%` }} />
          </div>
          <span>{prog.percent}%</span>
        </div>
      </div>
      <div className={cx('hr-onb-help__tasks', overdue > 0 && 'is-overdue')}>
        <strong>{mine.length}</strong>
        <span>{overdue ? `${overdue} overdue` : soon ? `${soon} due soon` : mine.length === 1 ? 'task for you' : 'tasks for you'}</span>
      </div>
      <ChevronRight className="hr-onb-help__chev" aria-hidden="true" />
    </Link>
  );
}

/** People Ops onboarding pulse (null without `hr.onboarding.manage`). */
export function OnboardingOverviewCard() {
  const caps = useTalentCaps();
  const journeys = useVisibleJourneys();
  const now = useNow(60_000);
  if (!caps.onboarding) return null;
  const open = journeys.filter((j) => deriveJourneyStatus(j, now) !== 'completed');
  const starting = open.filter((j) => {
    const d = daysUntilStart(j, now);
    return d >= 0 && d <= 14;
  });
  const overdue = open.reduce((n, j) => n + journeyProgress(j, now).overdue, 0);
  const noAccount = open.filter((j) => !j.hubUserId).length;
  const next = [...open].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
  return (
    <section className="hr-onb-panel hr-onb-overview" aria-labelledby="hr-onb-overview">
      <header className="hr-onb-panel__head">
        <h2 id="hr-onb-overview" className="hr-onb-panel__title">
          <Rocket aria-hidden="true" /> Onboarding overview
        </h2>
        <Link to="/hr/onboarding" className="btn btn--sm">
          Open the board <ArrowRight />
        </Link>
      </header>
      <div className="hr-onb-overview__stats">
        <div className="hr-onb-ostat">
          <Users aria-hidden="true" />
          <strong>{open.length}</strong>
          <span>active journeys</span>
        </div>
        <div className="hr-onb-ostat">
          <Hourglass aria-hidden="true" />
          <strong>{starting.length}</strong>
          <span>starting in 14 days</span>
        </div>
        <div className={cx('hr-onb-ostat', overdue > 0 && 'is-danger')}>
          <TriangleAlert aria-hidden="true" />
          <strong>{overdue}</strong>
          <span>overdue tasks</span>
        </div>
        <div className={cx('hr-onb-ostat', noAccount > 0 && 'is-warning')}>
          <ShieldCheck aria-hidden="true" />
          <strong>{noAccount}</strong>
          <span>awaiting accounts</span>
        </div>
      </div>
      {next.length > 0 && (
        <ul className="hr-onb-overview__list">
          {next.map((j) => (
            <li key={j.id}>
              <Link to={`/hr/onboarding/${j.id}`} className="hr-onb-overview__row">
                <JourneyAvatar journey={j} size={30} />
                <span className="grow truncate">
                  <strong>{j.name}</strong> <span className="faint">· {j.title}</span>
                </span>
                <Countdown journey={j} now={now} />
                <span className="hr-onb-overview__pct">{journeyProgress(j, now).percent}%</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
