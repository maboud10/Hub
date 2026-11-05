/**
 * HR Portal · Onboarding board — every journey handed off from Talent Hub,
 * grouped Pre-boarding → Active → Completed. Stats header, All / Mine /
 * Overdue filters (+ search) and journey cards with countdown, progress ring,
 * the six-phase track, overdue badge, manager + buddy and NEXUS account state.
 * Styles: `.hr-onb-*` in hr.css.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { CircleCheckBig, Gauge, HeartHandshake, Hourglass, Inbox, MapPin, Rocket, Search, Sunrise, TriangleAlert, UserRound, X } from 'lucide-react';
import type { OnboardingJourney, OnboardingStatus } from '@/talent/types';
import { PHASE_META } from '@/talent/constants';
import { useTalentCaps, useTalentViewer, useVisibleJourneys } from '@/talent/selectors';
import { daysUntilStart, deriveJourneyStatus, journeyProgress } from '@/talent/onboarding';
import { useNow } from '@/hooks/useNow';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { PersonChip } from '@/pages/talent/components/shared';
import { AccountState, Countdown, journeyRoles, JourneyAvatar, PhaseTrack, Pill, ProgressRing, roleLabel, STATUS_META } from './onboarding/ui';

type Filter = 'all' | 'mine' | 'overdue';
const GROUPS: OnboardingStatus[] = ['pre-boarding', 'active', 'completed'];
const GROUP_ICON = { 'pre-boarding': Hourglass, active: Sunrise, completed: CircleCheckBig } as const;

export function OnboardingBoard() {
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const journeys = useVisibleJourneys();
  const now = useNow(60_000);
  const me = viewer?.userId ?? '';
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(
    () =>
      journeys.map((j) => ({
        j,
        prog: journeyProgress(j, now),
        status: deriveJourneyStatus(j, now),
        days: daysUntilStart(j, now),
        mine: j.managerId === me || j.buddyId === me || j.hubUserId === me,
      })),
    [journeys, now, me],
  );

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status !== 'completed');
    const today = new Date(now);
    return {
      active: rows.filter((r) => r.status === 'active').length,
      pre: rows.filter((r) => r.status === 'pre-boarding').length,
      thisMonth: rows.filter((r) => {
        const [y, m] = r.j.startDate.split('-').map(Number);
        return y === today.getFullYear() && m === today.getMonth() + 1;
      }).length,
      overdue: open.reduce((n, r) => n + r.prog.overdue, 0),
      avg: open.length ? Math.round(open.reduce((n, r) => n + r.prog.percent, 0) / open.length) : rows.length ? 100 : 0,
    };
  }, [rows, now]);

  const counts = { all: rows.length, mine: rows.filter((r) => r.mine).length, overdue: rows.filter((r) => r.prog.overdue > 0).length };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'all' || (filter === 'mine' ? r.mine : r.prog.overdue > 0)) && (!needle || `${r.j.name} ${r.j.title} ${r.j.department} ${r.j.location}`.toLowerCase().includes(needle)));

  if (!journeys.length)
    return (
      <div className="card card--flat">
        <EmptyState icon={<Rocket />} title="No onboarding journeys yet">
          Journeys appear here the moment Talent Hub hands off a hire: pre-boarding checklist, day one and the first 90 days, step by step.
        </EmptyState>
      </div>
    );

  return (
    <div className="hr-onb-board">
      <section className="hr-onb-board__stats" aria-label="Onboarding at a glance">
        <BoardStat icon={Sunrise} label="Active" value={stats.active} hint="in their first 90 days" />
        <BoardStat icon={Hourglass} label="Pre-boarding" value={stats.pre} hint="day one ahead" />
        <BoardStat icon={Rocket} label="Starting this month" value={stats.thisMonth} hint={new Date(now).toLocaleDateString(undefined, { month: 'long' })} />
        <BoardStat icon={TriangleAlert} label="Overdue tasks" value={stats.overdue} hint={stats.overdue ? 'need attention' : 'all on track'} tone={stats.overdue ? 'danger' : 'success'} />
        <div className="hr-onb-stat hr-onb-stat--ring">
          <ProgressRing percent={stats.avg} size={64} stroke={6} />
          <div className="hr-onb-stat__text">
            <span className="stat-label">Avg completion</span>
            <span className="hr-onb-stat__hint">across open journeys</span>
          </div>
        </div>
      </section>

      <div className="hr-onb-board__toolbar">
        <div className="hr-onb-board__filters" role="group" aria-label="Filter journeys">
          {(
            [
              ['all', 'All', Gauge],
              ['mine', caps.onboarding ? 'Mine' : 'I’m helping', HeartHandshake],
              ['overdue', 'Overdue', TriangleAlert],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} type="button" className={cx('chip', filter === id && 'is-active', id === 'overdue' && counts.overdue > 0 && 'hr-onb-chip--danger')} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              <Icon aria-hidden="true" /> {label} <span className="count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="input-wrap hr-onb-board__search">
          <Search aria-hidden="true" />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search new hires" aria-label="Search new hires" />
          {q && (
            <button type="button" className="icon-btn icon-btn--sm input-trail" onClick={() => setQ('')} aria-label="Clear search">
              <X />
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card card--flat">
          <EmptyState
            icon={<Inbox />}
            title="Nothing matches"
            action={
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  setFilter('all');
                  setQ('');
                }}
              >
                <X /> Clear filters
              </button>
            }
          >
            {filter === 'overdue' ? 'No overdue tasks. Every journey is on track.' : 'Try another filter or search.'}
          </EmptyState>
        </div>
      ) : (
        <div className="hr-onb-board__cols">
          {GROUPS.map((g) => {
            const list = shown.filter((r) => r.status === g).sort((a, b) => (g === 'completed' ? b.j.startDate.localeCompare(a.j.startDate) : a.j.startDate.localeCompare(b.j.startDate)));
            const Icon = GROUP_ICON[g];
            const meta = STATUS_META[g];
            return (
              <section key={g} className={cx('hr-onb-col', `hr-onb-col--${g}`)} aria-labelledby={`hr-onb-col-${g}`}>
                <header className="hr-onb-col__head">
                  <span className="hr-onb-col__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <h2 id={`hr-onb-col-${g}`} className="hr-onb-col__title">
                    {meta.label}
                  </h2>
                  <span className="hr-onb-col__count">{list.length}</span>
                  <span className="hr-onb-col__hint">{meta.hint}</span>
                </header>
                {list.length ? (
                  <div className="hr-onb-col__list">
                    {list.map((r, i) => (
                      <JourneyCard key={r.j.id} journey={r.j} now={now} index={i} />
                    ))}
                  </div>
                ) : (
                  <div className="hr-onb-col__empty">{g === 'completed' ? 'Journeys land here once every step is done.' : g === 'pre-boarding' ? 'No one waiting for day one.' : 'No one in their first 90 days.'}</div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BoardStat({ icon: Icon, label, value, hint, tone }: { icon: typeof Rocket; label: string; value: number; hint: string; tone?: 'danger' | 'success' }) {
  return (
    <div className={cx('hr-onb-stat', tone && `hr-onb-stat--${tone}`)}>
      <span className="hr-onb-stat__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="stat-label">{label}</span>
      <span className="hr-onb-stat__value">{value}</span>
      <span className="hr-onb-stat__hint">{hint}</span>
    </div>
  );
}

function JourneyCard({ journey: j, now, index }: { journey: OnboardingJourney; now: number; index: number }) {
  const viewer = useTalentViewer();
  const prog = journeyProgress(j, now);
  const roles = journeyRoles(viewer, j);
  const phase = PHASE_META[prog.current];
  const role = roles.manager || roles.buddy || roles.newHire ? roleLabel(roles) : null;
  return (
    <article className={cx('hr-onb-card', prog.overdue > 0 && 'has-overdue')} style={{ '--i': index, '--ph-h': phase.hue } as CSSProperties}>
      <Link to={`/hr/onboarding/${j.id}`} className="hr-onb-card__link" aria-label={`Open ${j.name}’s onboarding journey`} />
      <div className="hr-onb-card__top">
        <JourneyAvatar journey={j} size={46} />
        <div className="hr-onb-card__who">
          <h3 className="hr-onb-card__name">{j.name}</h3>
          <div className="hr-onb-card__title truncate">{j.title}</div>
          <div className="hr-onb-card__dept truncate">
            {j.department} · <MapPin aria-hidden="true" className="inline-icon" /> {j.location}
          </div>
        </div>
        <ProgressRing percent={prog.percent} size={54} stroke={5} />
      </div>
      <div className="hr-onb-card__row">
        <Countdown journey={j} now={now} />
        {prog.overdue > 0 && (
          <Pill tone="danger">
            <TriangleAlert aria-hidden="true" /> {prog.overdue} overdue
          </Pill>
        )}
        {role && <Pill tone="accent">{role}</Pill>}
      </div>
      <PhaseTrack journey={j} now={now} />
      <div className="hr-onb-card__foot">
        <span className="hr-onb-card__people">
          <span className="hr-onb-card__plabel">
            <UserRound aria-hidden="true" /> Mgr
          </span>
          <PersonChip userId={j.managerId} />
          <span className="hr-onb-card__plabel">
            <HeartHandshake aria-hidden="true" /> Buddy
          </span>
          {j.buddyId ? <PersonChip userId={j.buddyId} /> : <Pill tone="warning">Unassigned</Pill>}
        </span>
        <AccountState journey={j} compact />
      </div>
    </article>
  );
}
