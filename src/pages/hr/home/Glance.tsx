/**
 * HR Home · at-a-glance widgets: time-off snapshot (annual + work-from-anywhere
 * rings, your next break and a compact tracker for the request you're waiting
 * on), next payday + latest net pay (masked until you choose to show it),
 * benefits status (tracked while People Ops confirms it), upcoming public
 * holidays with a long-break idea, and who's away on your team this week.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, CalendarDays, Eye, EyeOff, HeartPulse, Lightbulb, Plane, ShieldCheck, TreePalm, Users, Wallet } from 'lucide-react';
import type { LeaveRequest } from '@/hr/types';
import { ELECTION_STATUS_META, HEALTH_PLAN_BY_ID, type PublicHoliday } from '@/hr/constants';
import { COMPANY_PREMIUM, nextPayDate } from '@/hr/engine';
import { addDaysISO, daysBetween, eachDay, formatDay, holidaySet, isWeekend, parseISODate, startOfWeek, todayISO } from '@/hr/calendar';
import { useHr } from '@/hr/store';
import { useAbsences, useAllowanceUsage, useBalances, useHolidays, usePayslips, type Absence } from '@/hr/selectors';
import { electionTrack, leaveTrack } from '@/hr/trackers';
import { useSessionUser, useUserById } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { formatMoney } from '@/pages/talent/components/format';
import { AllLink, BalanceRing, HrPanel, LeaveTypeBadge, ToneBadge } from '../components/shared';
import { HrTracker, useTrackContext } from '../components/trackers';
import { fmtRange } from './format';

const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

/** Month + day calendar tile. */
export function CalTile({ iso }: { iso: string }) {
  const d = new Date(parseISODate(iso));
  return (
    <span className="hr-home-cal" aria-hidden="true">
      <span>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      <b>{d.getDate()}</b>
    </span>
  );
}

function MoreLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="hr-home-w__link">
      {children} <ArrowRight aria-hidden="true" />
    </Link>
  );
}

// ───────────────────────── time off ─────────────────────────
export function TimeOffWidget() {
  const navigate = useNavigate();
  const me = useSessionUser();
  const balances = useBalances();
  const leave = useHr((s) => s.leave);
  const now = useNow(60_000);
  const trackCtx = useTrackContext();
  const today = todayISO(now);
  const annual = balances.find((b) => b.type === 'annual');
  const wfa = balances.find((b) => b.type === 'wfa');
  const { next, pending, waiting } = useMemo(() => {
    const mine = me ? leave.filter((r) => r.userId === me.id && r.end >= today) : [];
    const approved: LeaveRequest[] = mine.filter((r) => r.status === 'approved').sort((a, b) => a.start.localeCompare(b.start));
    const open = mine.filter((r) => r.status === 'pending').sort((a, b) => a.start.localeCompare(b.start));
    return { next: approved[0], pending: open.length, waiting: open[0] };
  }, [leave, me, today]);
  const prorated = !!annual && annual.allowance !== null && annual.allowance < 25;

  return (
    <HrPanel className="hr-home-w hr-home-w--timeoff" hud="Your balances" title="Time off" icon={<TreePalm aria-hidden="true" />} actions={<AllLink to="/hr/time-off" />}>
      <div className="hr-home-to">
        <div className="hr-home-to__rings">
          {annual && (
            <figure className="hr-home-to__ring">
              <BalanceRing balance={annual} size={86} />
              <figcaption>Annual leave</figcaption>
            </figure>
          )}
          {wfa && (
            <figure className="hr-home-to__ring">
              <BalanceRing balance={wfa} size={86} />
              <figcaption>Work from anywhere</figcaption>
            </figure>
          )}
        </div>
        <div className="hr-home-to__side">
          <div className={cx('hr-home-to__next', !next && 'is-empty')}>
            <span className="stat-label">Next break</span>
            {next ? (
              <>
                <strong>{fmtRange(next.start, next.end, next.halfDay)}</strong>
                <span className="hr-home-to__when">
                  <LeaveTypeBadge type={next.type} />
                  <span>{next.start <= today ? 'Happening now 🌴' : inDays(daysBetween(today, next.start))}</span>
                </span>
              </>
            ) : (
              <>
                <strong>Nothing booked yet</strong>
                <span className="text-xs faint">Rest is part of the job. When’s your next one?</span>
              </>
            )}
          </div>
          {pending > 0 && (
            <div className="hr-trk-slot is-compact hr-home-to__track">
              {waiting && <HrTracker track={leaveTrack(waiting, trackCtx)} variant="compact" />}
              <span className="hr-home-to__pending">
                {pending} request{pending === 1 ? '' : 's'} awaiting approval
              </span>
            </div>
          )}
          <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/hr/time-off?new=1')}>
            <Plane /> Request time off
          </button>
        </div>
      </div>
      {prorated && <p className="hr-home-w__note">Your annual leave is pro-rated for your first year: {annual?.allowance} of 25 days.</p>}
    </HrPanel>
  );
}

// ───────────────────────── pay ─────────────────────────
const periodLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export function PayWidget() {
  const me = useSessionUser();
  const comp = useHr((s) => (me ? s.comp.find((c) => c.userId === me.id) : undefined));
  const slips = usePayslips(undefined, 1);
  const now = useNow(60_000);
  const [show, setShow] = useState(false);
  const latest = slips[0];
  const next = comp ? nextPayDate(comp, now) : null;
  const left = next ? daysBetween(todayISO(now), next) : 0;

  return (
    <HrPanel
      className="hr-home-w hr-home-w--pay"
      hud="Compensation"
      title="Pay"
      icon={<Wallet aria-hidden="true" />}
      actions={
        <>
          {latest && (
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-pressed={show} aria-label={show ? 'Hide amounts' : 'Show amounts'} data-tip={show ? 'Hide amounts' : 'Show amounts'} onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff /> : <Eye />}
            </button>
          )}
          <AllLink to="/hr/documents?tab=payslips">Payslips</AllLink>
        </>
      }
    >
      {comp && next ? (
        <>
          <div className="hr-home-pay__next">
            <CalTile iso={next} />
            <div className="grow">
              <span className="stat-label">Next payday</span>
              <strong>{formatDay(next, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
              <span className="text-xs faint">{left === 0 ? 'Today! 🎉' : inDays(left)}</span>
            </div>
          </div>
          {latest ? (
            <div className="hr-home-pay__latest">
              <span className="stat-label">Latest payslip · {periodLabel(latest.period)}</span>
              <span className="hr-home-pay__net">
                {show ? (
                  formatMoney(latest.net, latest.currency)
                ) : (
                  <>
                    <span aria-hidden="true">{latest.currency} ••••••</span>
                    <span className="sr-only">Amount hidden</span>
                  </>
                )}
                <small>net</small>
              </span>
              {latest.partial && <span className="hr-home-pay__first">🎉 Your first payslip, pro-rated from your start date</span>}
            </div>
          ) : (
            <p className="text-sm muted">Your first payslip arrives on payday. It’ll be waiting in Documents.</p>
          )}
          <MoreLink to="/hr/documents?tab=payslips">All payslips</MoreLink>
        </>
      ) : (
        <div className="hr-home-w__empty">
          <p className="text-sm muted">Your pay details are being set up. People Ops adds them before your first payday.</p>
          <MoreLink to="/hr?ask=1">Ask People Ops</MoreLink>
        </div>
      )}
    </HrPanel>
  );
}

// ───────────────────────── benefits ─────────────────────────
export function BenefitsWidget() {
  const navigate = useNavigate();
  const me = useSessionUser();
  const now = useNow(60_000);
  const trackCtx = useTrackContext();
  const year = new Date(now).getFullYear();
  const election = useHr((s) => (me ? s.elections.find((e) => e.userId === me.id && e.year === year) : undefined));
  const usage = useAllowanceUsage();
  const allowanceLeft = usage.reduce((n, u) => n + u.remaining, 0);
  const today = todayISO(now);
  const status = election?.status ?? 'not-started';
  const meta = ELECTION_STATUS_META[status];
  const plan = election ? HEALTH_PLAN_BY_ID[election.health] : null;
  const daysLeft = election?.deadline ? daysBetween(today, election.deadline) : null;
  const premium = Object.values(COMPANY_PREMIUM);

  return (
    <HrPanel className="hr-home-w hr-home-w--ben" hud="Cover & allowances" title="Benefits" icon={<HeartPulse aria-hidden="true" />} actions={<AllLink to="/hr/benefits" />}>
      {status === 'not-started' ? (
        <div className="hr-home-ben is-todo">
          <ToneBadge tone={daysLeft !== null && daysLeft <= 7 ? 'danger' : 'warning'}>{meta.label}</ToneBadge>
          <strong>Choose your health, dental and life cover</strong>
          <span className="text-sm muted">
            {daysLeft === null ? 'Takes about five minutes.' : daysLeft >= 0 ? `Enrol by ${formatDay(election!.deadline!, { day: 'numeric', month: 'short' })} · ${daysLeft === 0 ? 'last day today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}` : 'The enrolment window has passed. People Ops can still help.'}
          </span>
          <span className="text-xs faint">
            Helix pays {formatMoney(Math.min(...premium), 'AED')}–{Math.max(...premium).toLocaleString()} a month toward your cover.
          </span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/hr/benefits?enrol=1')}>
            <HeartPulse /> Enrol now
          </button>
        </div>
      ) : (
        <div className={cx('hr-home-ben', status === 'confirmed' ? 'is-active' : 'is-pending')}>
          {plan && (
            <div className="hr-home-ben__card" style={{ '--plan-h': plan.hue } as CSSProperties}>
              <span className="hr-home-ben__insurer">{plan.insurer}</span>
              <strong>{plan.label} plan</strong>
              <span className="hr-home-ben__member mono">{status === 'confirmed' && election?.memberNumber ? election.memberNumber : 'Member no. pending'}</span>
              <span className="hr-home-ben__extras">
                {election!.dependents.length ? `${election!.dependents.length} dependent${election!.dependents.length === 1 ? '' : 's'}` : 'Just you'}
                {election!.dental ? ' · dental' : ''}
                {election!.vision ? ' · vision' : ''} · life {election!.lifeMultiple}×
              </span>
            </div>
          )}
          <span className="hr-home-ben__status">
            <ToneBadge tone={meta.tone} icon={status === 'confirmed' ? ShieldCheck : undefined}>
              {meta.label}
            </ToneBadge>
            {status === 'submitted' && <span className="text-xs faint">Usually confirmed within a day.</span>}
          </span>
          {status === 'submitted' && election && (
            <div className="hr-trk-slot is-compact">
              <HrTracker track={electionTrack(election, trackCtx)} variant="compact" />
            </div>
          )}
        </div>
      )}
      <Link to="/hr/benefits?claim=1" className="hr-home-ben__allow">
        <span>
          <b>{formatMoney(allowanceLeft, 'AED')}</b> left in your allowances this year
        </span>
        <span className="hr-home-w__link">
          Claim <ArrowRight aria-hidden="true" />
        </span>
      </Link>
    </HrPanel>
  );
}

// ───────────────────────── holidays ─────────────────────────
interface HolidayGroup {
  name: string;
  start: string;
  end: string;
  days: number;
  expected: boolean;
}

function groupHolidays(list: PublicHoliday[]): HolidayGroup[] {
  const out: HolidayGroup[] = [];
  for (const h of list) {
    const last = out[out.length - 1];
    if (last && last.name === h.name && addDaysISO(last.end, 1) === h.date) {
      last.end = h.date;
      last.days += 1;
      last.expected = last.expected || !!h.expected;
    } else out.push({ name: h.name, start: h.date, end: h.date, days: 1, expected: !!h.expected });
  }
  return out;
}

interface BridgeIdea {
  days: string[];
  from: string;
  to: string;
  total: number;
}

/** Best way to turn a holiday block into a long break with at most two days of leave. */
function bridgeIdea(start: string, end: string, hol: ReadonlySet<string>): BridgeIdea | null {
  const off = (d: string) => isWeekend(d) || hol.has(d);
  const extend = (d: string, dir: 1 | -1) => {
    let x = d;
    while (off(addDaysISO(x, dir))) x = addDaysISO(x, dir);
    return x;
  };
  const a = extend(start, -1);
  const b = extend(end, 1);
  const walk = (from: string, dir: 1 | -1) => {
    const days: string[] = [];
    let x = addDaysISO(from, dir);
    while (!off(x) && days.length < 3) {
      days.push(x);
      x = addDaysISO(x, dir);
    }
    return days.length && days.length <= 2 ? { days, edge: extend(x, dir) } : null;
  };
  const span = (f: string, t: string) => daysBetween(f, t) + 1;
  const L = walk(a, -1);
  const R = walk(b, 1);
  const options: BridgeIdea[] = [];
  if (L) options.push({ days: [...L.days].reverse(), from: L.edge, to: b, total: span(L.edge, b) });
  if (R) options.push({ days: R.days, from: a, to: R.edge, total: span(a, R.edge) });
  if (L && R && L.days.length + R.days.length <= 2) options.push({ days: [...[...L.days].reverse(), ...R.days], from: L.edge, to: R.edge, total: span(L.edge, R.edge) });
  const best = options.sort((x, y) => y.total - x.total || x.days.length - y.days.length)[0];
  return best && best.total >= 4 ? best : null;
}

export function HolidaysWidget() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const { upcoming, applies } = useHolidays();
  const balances = useBalances();
  const now = useNow(60_000);
  const today = todayISO(now);
  const loc = me?.location ?? '';
  const groups = useMemo(() => groupHolidays(upcoming), [upcoming]);
  const idea = useMemo(() => {
    if (!groups.length) return null;
    let end = groups[0].end;
    for (const g of groups.slice(1)) if (g.start === addDaysISO(end, 1)) end = g.end;
    return bridgeIdea(groups[0].start, end, holidaySet(loc));
  }, [groups, loc]);
  const annual = balances.find((b) => b.type === 'annual')?.available ?? null;
  const fmtDay = (d: string) => formatDay(d, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <HrPanel className="hr-home-w hr-home-w--hol" hud="Calendar" title="Public holidays" icon={<CalendarDays aria-hidden="true" />} sub={applies ? `${loc} · days off for everyone` : undefined} actions={<AllLink to="/hr/time-off" />}>
      {!applies ? (
        <div className="hr-home-w__empty">
          <p className="text-sm muted">Your public holidays follow the local calendar in {loc || 'your location'}. People Ops can share this year’s list.</p>
          <MoreLink to="/hr?ask=1">Ask People Ops</MoreLink>
        </div>
      ) : groups.length ? (
        <>
          <ul className="hr-home-hol">
            {groups.slice(0, 4).map((g, i) => (
              <li key={g.start} className={cx('hr-home-hol__item', i === 0 && 'is-next')}>
                <CalTile iso={g.start} />
                <span className="grow">
                  <strong className="truncate">{g.name}</strong>
                  <span className="text-xs faint">
                    {fmtRange(g.start, g.end)} · {inDays(daysBetween(today, g.start))}
                    {g.expected ? ' · date confirmed nearer the time' : ''}
                  </span>
                </span>
                {g.days > 1 && <span className="tag">{g.days} days</span>}
              </li>
            ))}
          </ul>
          {idea && (
            <div className="hr-home-hol__idea">
              <Lightbulb aria-hidden="true" />
              <p className="grow">
                <b>Make it a long break:</b> take {idea.days.map(fmtDay).join(' and ')} off and enjoy <b>{idea.total} days</b> of rest for {idea.days.length} day{idea.days.length === 1 ? '' : 's'} of leave
                {annual !== null ? ` (you have ${annual} left)` : ''}.
              </p>
              <button type="button" className="btn btn--sm" onClick={() => navigate('/hr/time-off?new=1')}>
                Plan it
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm muted">No public holidays in the next 12 months.</p>
      )}
    </HrPanel>
  );
}

// ───────────────────────── who's away ─────────────────────────
export function TeamAwayWidget() {
  const me = useSessionUser();
  const now = useNow(60_000);
  const today = todayISO(now);
  const monday = startOfWeek(today);
  const friday = addDaysISO(monday, 4);
  const away = useAbsences('team', monday, friday);
  const days = useMemo(() => eachDay(monday, friday), [monday, friday]);

  return (
    <HrPanel className="hr-home-w hr-home-w--away" hud="Your team" title="Who’s away this week" icon={<Users aria-hidden="true" />} sub={`Your team · ${fmtRange(monday, friday)}`} actions={<AllLink to="/hr/time-off" />}>
      {away.length ? (
        <div className="hr-home-away">
          <div className="hr-home-away__head" aria-hidden="true">
            <span />
            {days.map((d) => (
              <span key={d} className={cx('hr-home-away__day', d === today && 'is-today')}>
                {formatDay(d, { weekday: 'narrow' })}
              </span>
            ))}
          </div>
          <ul className="hr-home-away__list">
            {away.map((a) => (
              <AwayRow key={a.id} absence={a} days={days} meId={me?.id} today={today} />
            ))}
          </ul>
          <p className="hr-home-away__privacy">Colleagues see “Away”; only you, your manager and People Ops see the reason.</p>
        </div>
      ) : (
        <p className="hr-home-away__none">
          <span aria-hidden="true">🙌</span> Everyone’s around this week.
        </p>
      )}
    </HrPanel>
  );
}

function AwayRow({ absence: a, days, meId, today }: { absence: Absence; days: string[]; meId?: string; today: string }) {
  const u = useUserById(a.userId);
  if (!u) return null;
  const name = a.userId === meId ? 'You' : u.name.split(' ')[0];
  return (
    <li className="hr-home-away__row">
      <span className="hr-home-away__who">
        <Avatar user={u} size={26} />
        <span className="hr-home-away__name">
          <span className="truncate">{name}</span>
          <span className="hr-home-away__meta">
            <LeaveTypeBadge type={a.type} hidden={!a.type} />
            {a.status === 'pending' && <span className="tag">Pending</span>}
          </span>
        </span>
        <span className="sr-only">
          {name}: {a.status === 'pending' ? 'requested' : 'away'} {fmtRange(a.start, a.end, a.halfDay)}
        </span>
      </span>
      {days.map((d) => {
        const on = d >= a.start && d <= a.end && !isWeekend(d);
        return <span key={d} aria-hidden="true" className={cx('hr-home-away__cell', on && 'is-on', on && !!a.halfDay && 'is-half', on && a.status === 'pending' && 'is-pending', d === today && 'is-today')} />;
      })}
    </li>
  );
}
