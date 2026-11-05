/**
 * People Ops console · "Out today" (with cover and return date) and the
 * onboarding overview: Talent Hub hand-off journeys with pre-boarding /
 * active counts, who starts soon, plan progress, pulse scores per new hire
 * per milestone, the weakest question, and low-score alerts (≤ 2.5).
 */
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Hourglass, Lock, Rocket, TreePalm, TriangleAlert, UserPlus, Users } from 'lucide-react';
import type { OnboardingJourney } from '@/talent/types';
import { useTalent } from '@/talent/store';
import { daysUntilStart, deriveJourneyStatus, journeyProgress } from '@/talent/onboarding';
import { LEAVE_TYPE_BY_ID, PULSE_QUESTIONS } from '@/hr/constants';
import { pulseSchedule, pulseScore, type PulseSlot } from '@/hr/engine';
import { addDaysISO, formatDay, holidaySet, nextWorkingDay, todayISO } from '@/hr/calendar';
import { useHr } from '@/hr/store';
import type { HrStats } from '@/hr/selectors';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { PersonChip } from '@/pages/talent/components/shared';
import { HrPanel, LeaveTypeBadge, UserLine } from '../components/shared';
import { QUESTION_SHORT, scoreEmoji } from '../home/Pulse';
import { MILESTONE_NOUN } from '../home/format';

// ───────────────────────── out today ─────────────────────────
export function OutToday({ stats }: { stats: HrStats }) {
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const today = todayISO(now);
  return (
    <HrPanel className="hr-ops-out" title="Out today" icon={<TreePalm aria-hidden="true" />} sub={formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}>
      {stats.outToday.length ? (
        <ul className="hr-ops-out__list">
          {stats.outToday.map((a) => {
            const u = users.find((x) => x.id === a.userId);
            const back = nextWorkingDay(addDaysISO(a.end, 1), holidaySet(u?.location ?? ''));
            const priv = !!a.type && LEAVE_TYPE_BY_ID[a.type].private;
            return (
              <li key={a.id} className="hr-ops-out__row">
                <UserLine userId={a.userId} size={34} sub={`Back ${formatDay(back)}${a.halfDay ? ` · ${a.halfDay === 'am' ? 'morning' : 'afternoon'} off` : ''}`} />
                <span className="hr-ops-out__meta">
                  <LeaveTypeBadge type={a.type} />
                  {priv && (
                    <span className="hr-ops-out__priv" data-tip="Private: colleagues only see “Away”">
                      <Lock aria-label="Private leave type" />
                    </span>
                  )}
                </span>
                {a.coverId && (
                  <span className="hr-ops-out__cover">
                    <span>Cover</span> <PersonChip userId={a.coverId} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hr-ops-empty">
          <span aria-hidden="true">🙌</span> Everyone’s in today.
        </p>
      )}
    </HrPanel>
  );
}

// ───────────────────────── onboarding overview ─────────────────────────
interface JourneyRow {
  j: OnboardingJourney;
  status: OnboardingJourney['status'];
  percent: number;
  overdue: number;
  d: number;
  slots: PulseSlot[];
}

const SLOT_SHORT: Record<PulseSlot['milestone'], string> = { 'week-1': 'W1', 'day-30': '30', 'day-60': '60', 'day-90': '90' };

function weakest(slots: PulseSlot[]) {
  const last = [...slots].reverse().find((s) => s.response);
  if (!last?.response) return null;
  const q = [...PULSE_QUESTIONS].sort((a, b) => last.response!.scores[a.id] - last.response!.scores[b.id])[0];
  const v = last.response.scores[q.id];
  return v <= 2 ? { label: QUESTION_SHORT[q.id], v } : null;
}

export function OnboardingOverview() {
  const journeys = useTalent((s) => s.onboarding);
  const pulses = useHr((s) => s.pulses);
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const rows = useMemo<JourneyRow[]>(
    () =>
      journeys
        .map((j) => {
          const hire = j.hubUserId ? users.find((u) => u.id === j.hubUserId) : undefined;
          const responses = pulses.filter((p) => (!!j.hubUserId && p.userId === j.hubUserId) || p.journeyId === j.id);
          const prog = journeyProgress(j, now);
          return { j, status: deriveJourneyStatus(j, now), percent: prog.percent, overdue: prog.overdue, d: daysUntilStart(j, now), slots: pulseSchedule(hire?.startDate ?? j.startDate, responses, now) };
        })
        .filter((r) => r.status !== 'completed')
        .sort((a, b) => a.j.startDate.localeCompare(b.j.startDate)),
    [journeys, pulses, users, now],
  );
  const pre = rows.filter((r) => r.status === 'pre-boarding').length;
  const active = rows.filter((r) => r.status === 'active').length;
  const soon = rows.filter((r) => r.d >= 0 && r.d <= 14).length;
  const alerts = rows.flatMap((r) => r.slots.filter((s) => s.response && pulseScore(s.response) <= 2.5).map((s) => ({ r, s, score: pulseScore(s.response!) })));

  return (
    <HrPanel
      className="hr-ops-onb"
      title="Onboarding & new-hire pulse"
      icon={<Rocket aria-hidden="true" />}
      sub="Every hire handed over from Talent Hub, from pre-boarding to day 90."
      actions={
        <Link to="/hr/onboarding" className="btn btn--sm">
          Open the board <ArrowRight />
        </Link>
      }
    >
      <div className="hr-ops-onb__stats">
        <span className="hr-ops-onb__stat">
          <Hourglass aria-hidden="true" />
          <b>{pre}</b> pre-boarding
        </span>
        <span className="hr-ops-onb__stat">
          <Users aria-hidden="true" />
          <b>{active}</b> active
        </span>
        <span className="hr-ops-onb__stat">
          <UserPlus aria-hidden="true" />
          <b>{soon}</b> starting in 14 days
        </span>
        <span className={cx('hr-ops-onb__stat', alerts.length > 0 && 'is-bad')}>
          <TriangleAlert aria-hidden="true" />
          <b>{alerts.length}</b> low-score alert{alerts.length === 1 ? '' : 's'}
        </span>
      </div>

      {alerts.map(({ r, s, score }) => (
        <Link key={`${r.j.id}-${s.milestone}`} to={`/hr/onboarding/${r.j.id}`} className="hr-ops-onb__alert" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span className="grow">
            <b>Check in with {r.j.name.split(' ')[0]}.</b> Their {MILESTONE_NOUN[s.milestone]} pulse averaged {score}/5. A friendly conversation could help.
          </span>
          <ArrowRight aria-hidden="true" />
        </Link>
      ))}

      {rows.length ? (
        <ul className="hr-ops-onb__list">
          {rows.map((r) => {
            const weak = weakest(r.slots);
            return (
              <li key={r.j.id}>
                <Link to={`/hr/onboarding/${r.j.id}`} className="hr-ops-onb__row">
                  <span className="hr-ops-onb__who">
                    <Avatar user={{ name: r.j.name, avatarHue: r.j.avatarHue }} size={36} />
                    <span className="grow">
                      <span className="hr-ops-onb__name truncate">{r.j.name}</span>
                      <span className="text-xs faint truncate">
                        {r.j.title} · {r.j.location}
                      </span>
                    </span>
                  </span>
                  <span className={cx('hr-ops-onb__when', r.d > 0 ? 'is-pre' : 'is-active')}>{r.d > 1 ? `Starts in ${r.d} days` : r.d === 1 ? 'Starts tomorrow' : r.d === 0 ? 'Day one today' : `Day ${-r.d + 1} of 90`}</span>
                  <span className="hr-ops-onb__prog">
                    <span className="progress" aria-hidden="true">
                      <span style={{ width: `${r.percent}%` }} />
                    </span>
                    <span className="hr-ops-onb__pct">
                      {r.percent}%{r.overdue > 0 && <em> · {r.overdue} overdue</em>}
                    </span>
                  </span>
                  <span className="hr-ops-onb__pulse" aria-label="Pulse check-ins">
                    {r.slots.map((s) => {
                      const score = s.response ? pulseScore(s.response) : null;
                      return (
                        <span
                          key={s.milestone}
                          className={cx('hr-ops-pchip', `is-${s.state}`, score !== null && score <= 2.5 && 'is-low')}
                          style={{ '--s': score ?? 0 } as CSSProperties}
                          title={`${s.label}: ${score !== null ? `${score}/5` : s.state}`}
                        >
                          <b>{SLOT_SHORT[s.milestone]}</b>
                          {score !== null ? (
                            <>
                              <span aria-hidden="true">{scoreEmoji(score)}</span>
                              {score}
                            </>
                          ) : s.state === 'open' ? (
                            'open'
                          ) : s.state === 'missed' ? (
                            'missed'
                          ) : (
                            '·'
                          )}
                        </span>
                      );
                    })}
                    {weak && (
                      <span className="hr-ops-onb__weak" title="Lowest-rated question in the latest check-in">
                        {weak.label} {weak.v}/5
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hr-ops-empty">No one is onboarding right now. New hires appear here the moment Talent Hub hands them over.</p>
      )}
    </HrPanel>
  );
}
