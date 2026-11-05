/**
 * HR Home · "Your team" for line managers: direct reports with their time off
 * this week and next, requests waiting on your decision, and anyone you're
 * onboarding (with progress, linking to their journey).
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CircleCheckBig, ClipboardCheck, Rocket, Users } from 'lucide-react';
import type { User } from '@/types';
import { useTalent } from '@/talent/store';
import { daysUntilStart, deriveJourneyStatus, journeyProgress } from '@/talent/onboarding';
import { addDaysISO, overlaps, startOfWeek, todayISO } from '@/hr/calendar';
import { useAbsences, useApprovals, useTeam, type Absence } from '@/hr/selectors';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { HrPanel, LeaveTypeBadge } from '../components/shared';
import { fmtRange } from './format';

export function TeamCard() {
  const me = useSessionUser();
  const { reports } = useTeam();
  const approvals = useApprovals();
  const journeys = useTalent((s) => s.onboarding);
  const now = useNow(60_000);
  const today = todayISO(now);
  const monday = startOfWeek(today);
  const nextMonday = addDaysISO(monday, 7);
  const absences = useAbsences('team', monday, addDaysISO(monday, 11));
  const onboarding = useMemo(
    () => (me ? journeys.filter((j) => j.managerId === me.id && deriveJourneyStatus(j, now) !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate)) : []),
    [journeys, me, now],
  );
  const outToday = absences.filter((a) => a.status === 'approved' && a.start <= today && a.end >= today && reports.some((r) => r.id === a.userId)).length;

  return (
    <HrPanel
      className="hr-home-team"
      title="Your team"
      icon={<Users aria-hidden="true" />}
      sub={`${reports.length} direct report${reports.length === 1 ? '' : 's'}${outToday ? ` · ${outToday} out today` : ' · everyone’s in today'}`}
    >
      <div className="hr-home-team__grid">
        <div className="hr-home-team__people">
          <div className="hr-home-team__cols" aria-hidden="true">
            <span />
            <span>This week</span>
            <span>Next week</span>
          </div>
          <ul className="hr-home-team__list">
            {reports.map((u) => (
              <ReportRow key={u.id} user={u} absences={absences} monday={monday} nextMonday={nextMonday} />
            ))}
          </ul>
        </div>
        <div className="hr-home-team__side">
          <Link to="/hr/approvals" className={cx('hr-home-team__appr', approvals.length > 0 && 'has-items')}>
            <span className="hr-home-team__appr-top">
              <ClipboardCheck aria-hidden="true" />
              <b>{approvals.length}</b>
              <span>{approvals.length ? `request${approvals.length === 1 ? '' : 's'} waiting on you` : 'Nothing waiting on you'}</span>
            </span>
            {approvals.slice(0, 2).map((a) => (
              <span key={a.id} className={cx('hr-home-team__appr-item', a.urgent && 'is-urgent')}>
                {a.title}
              </span>
            ))}
            <span className="hr-home-team__appr-cta">
              {approvals.length ? 'Review now' : 'Open approvals'} <ArrowRight aria-hidden="true" />
            </span>
          </Link>
          <div className="hr-home-team__onb">
            <span className="stat-label">
              <Rocket aria-hidden="true" className="inline-icon" /> Onboarding
            </span>
            {onboarding.length ? (
              onboarding.map((j) => {
                const p = journeyProgress(j, now);
                const d = daysUntilStart(j, now);
                return (
                  <Link key={j.id} to={`/hr/onboarding/${j.id}`} className="hr-home-team__journey">
                    <Avatar user={{ name: j.name, avatarHue: j.avatarHue }} size={34} />
                    <span className="grow">
                      <span className="hr-home-team__jname truncate">{j.name}</span>
                      <span className="text-xs faint truncate">
                        {d > 1 ? `Starts in ${d} days` : d === 1 ? 'Starts tomorrow' : d === 0 ? 'Day one today' : `Day ${-d + 1} of 90`} · {j.title}
                      </span>
                      <span className="progress" aria-hidden="true">
                        <span style={{ width: `${p.percent}%` }} />
                      </span>
                    </span>
                    <span className="hr-home-team__pct">{p.percent}%</span>
                  </Link>
                );
              })
            ) : (
              <p className="text-sm faint">No one is onboarding with you right now.</p>
            )}
          </div>
        </div>
      </div>
    </HrPanel>
  );
}

function WeekCell({ items, label }: { items: Absence[]; label: string }) {
  return (
    <span className="hr-home-team__week">
      <span className="hr-home-team__week-label">{label}</span>
      {items.length ? (
        items.map((a) => (
          <span key={a.id} className={cx('hr-home-team__leave', a.status === 'pending' && 'is-pending')}>
            <LeaveTypeBadge type={a.type} hidden={!a.type} />
            <span className="truncate">{fmtRange(a.start, a.end, a.halfDay)}</span>
            {a.status === 'pending' && <span className="tag">Pending</span>}
          </span>
        ))
      ) : (
        <span className="hr-home-team__in">
          <CircleCheckBig aria-hidden="true" /> Around
        </span>
      )}
    </span>
  );
}

function ReportRow({ user, absences, monday, nextMonday }: { user: User; absences: Absence[]; monday: string; nextMonday: string }) {
  const mine = absences.filter((a) => a.userId === user.id);
  const thisWeek = mine.filter((a) => overlaps(a.start, a.end, monday, addDaysISO(monday, 4)));
  const nextWeek = mine.filter((a) => overlaps(a.start, a.end, nextMonday, addDaysISO(nextMonday, 4)));
  return (
    <li className="hr-home-team__row">
      <span className="hr-home-team__who">
        <Avatar user={user} size={34} />
        <span className="grow">
          <span className="hr-home-team__name truncate">{user.name}</span>
          <span className="text-xs faint truncate">{user.title}</span>
        </span>
      </span>
      <WeekCell items={thisWeek} label="This week" />
      <WeekCell items={nextWeek} label="Next week" />
    </li>
  );
}
