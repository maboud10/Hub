/**
 * "Who's away": a team timeline (4 weeks from this Monday by default, or one
 * week) with a row per colleague and bars for time off — pending requests are
 * hatched, private types show a neutral "Away" — plus weekend and public
 * holiday columns and a today line. People Ops can widen it to the whole
 * company (everyone else to their department). Phones get a compact agenda
 * grouped by day. All data comes from `useAbsences`, which applies privacy.
 */
import { useEffect, useMemo, useState, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Flag, UserRound } from 'lucide-react';
import type { User } from '@/types';
import { LEAVE_TYPE_BY_ID, holidaysFor } from '@/hr/constants';
import { addDaysISO, daysBetween, eachDay, formatDay, formatDays, isWeekend, startOfWeek, todayISO } from '@/hr/calendar';
import { useAbsences, useHrCaps, type Absence, type AbsenceScope } from '@/hr/selectors';
import { isEmployee } from '@/hr/seed';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Avatar, Segmented, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { HrPanel, LeaveTypeBadge } from '../components/shared';
import { PeopleStack } from '@/pages/talent/components/shared';
import { fmtRange as formatRange } from './utils';

const first = (name?: string) => (name ?? '').split(/\s+/)[0];

interface Tip {
  a: Absence;
  x: number;
  y: number;
}

export function WhosAway() {
  const caps = useHrCaps();
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const isMobile = useIsMobile();
  const today = todayISO(useNow(60_000));
  const [scope, setScope] = useState<AbsenceScope>('team');
  const [span, setSpan] = useState<'7' | '28'>('28');
  const [anchor, setAnchor] = useState(() => startOfWeek(todayISO()));
  const [awayOnly, setAwayOnly] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const hasTip = !!tip;
  useEffect(() => {
    if (!hasTip) return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, [hasTip]);
  const n = Number(span);
  const from = anchor;
  const to = addDaysISO(anchor, n - 1);
  const absences = useAbsences(scope, from, to);
  const todays = useAbsences(scope, today, today);
  const days = useMemo(() => eachDay(from, to), [from, to]);
  const location = me?.location ?? '';
  const holidays = useMemo(() => new Map(holidaysFor(location).map((h) => [h.date, h.name])), [location]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const people = useMemo(() => {
    if (!me) return [] as User[];
    const inScope = (u: User) => {
      if (u.id === me.id) return true;
      if (scope === 'company') return caps.manage || u.department === me.department;
      return u.managerId === me.id || u.id === me.managerId || (!!me.managerId && u.managerId === me.managerId);
    };
    const away = new Set(absences.map((a) => a.userId));
    const rank = (u: User) => (u.id === me.id ? 0 : u.id === me.managerId ? 1 : u.managerId === me.id ? 2 : 3);
    return users
      .filter((u) => isEmployee(u) && inScope(u) && (!awayOnly || u.id === me.id || away.has(u.id)))
      .sort((a, b) =>
        scope === 'company' ? rank(a) - rank(b) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name) : rank(a) - rank(b) || a.name.localeCompare(b.name),
      );
  }, [me, users, scope, caps.manage, absences, awayOnly]);

  const byUser = useMemo(() => {
    const m = new Map<string, Absence[]>();
    for (const a of absences) m.set(a.userId, [...(m.get(a.userId) ?? []), a]);
    return m;
  }, [absences]);

  const outToday = todays.filter((a) => a.status === 'approved' && a.userId !== me?.id);
  const relation = (u: User) => (u.id === me?.id ? 'You' : u.id === me?.managerId ? 'Your manager' : u.managerId === me?.id ? 'Reports to you' : scope === 'company' ? u.department : 'Teammate');

  const showTip = (a: Absence, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ a, x: Math.min(window.innerWidth - 150, Math.max(150, r.left + r.width / 2)), y: r.top });
  };

  const controls = (
    <div className="hr-to-tl__controls">
      <Segmented
        label="Whose time off"
        value={scope}
        onChange={(v) => {
          setScope(v);
          setTip(null);
        }}
        options={[
          { value: 'team', label: 'My team' },
          { value: 'company', label: caps.manage ? 'Company' : 'Department' },
        ]}
      />
      {!isMobile && (
        <Segmented
          label="Range"
          value={span}
          onChange={(v) => {
            setSpan(v);
            setTip(null);
          }}
          options={[
            { value: '7', label: 'Week' },
            { value: '28', label: '4 weeks' },
          ]}
        />
      )}
      <div className="hr-to-tl__nav">
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Previous ${n === 7 ? 'week' : '4 weeks'}`} onClick={() => setAnchor(addDaysISO(anchor, -n))}>
          <ChevronLeft />
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setAnchor(startOfWeek(today))} disabled={anchor === startOfWeek(today)}>
          This week
        </button>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Next ${n === 7 ? 'week' : '4 weeks'}`} onClick={() => setAnchor(addDaysISO(anchor, n))}>
          <ChevronRight />
        </button>
        <span className="hr-to-tl__range">{formatRange(from, to)}</span>
      </div>
      {!isMobile && (
        <label className="hr-to-tl__switch">
          <Switch checked={awayOnly} onChange={setAwayOnly} label="Only show people who are away" />
          <span>Away only</span>
        </label>
      )}
    </div>
  );

  return (
    <HrPanel
      className="hr-to-away"
      hud="Team radar"
      title="Who’s away"
      icon={<CalendarDays aria-hidden="true" />}
      sub={scope === 'company' ? (caps.manage ? 'Everyone at Helix, as People Ops' : `Your department: ${me?.department ?? ''}`) : 'Your manager, teammates and reports. Private leave shows as “Away”.'}
      actions={
        <div className="hr-to-out">
          {outToday.length ? (
            <>
              <PeopleStack userIds={outToday.map((a) => a.userId)} max={4} size={26} />
              <span>
                <b>{outToday.length}</b> out today
              </span>
            </>
          ) : (
            <span>Everyone’s in today 🙌</span>
          )}
        </div>
      }
    >
      {controls}
      {isMobile ? (
        <Agenda days={days} today={today} absences={absences} holidays={holidays} userById={userById} meId={me?.id} />
      ) : (
        <div className="hr-to-tl" style={{ '--days': n } as CSSProperties} onScroll={() => setTip(null)}>
          <div className={cx('hr-to-tl__grid', n === 7 && 'is-week')}>
            <div className="hr-to-tl__cols" aria-hidden="true">
              {days.map((d) => (
                <span key={d} className={cx(isWeekend(d) && 'is-weekend', holidays.has(d) && 'is-holiday', d === today && 'is-today')} />
              ))}
            </div>
            <div className="hr-to-tl__head" role="row">
              <div className="hr-to-tl__corner">
                {people.length} {people.length === 1 ? 'person' : 'people'}
              </div>
              {days.map((d, i) => (
                <div
                  key={d}
                  role="columnheader"
                  className={cx('hr-to-tl__day', isWeekend(d) && 'is-weekend', holidays.has(d) && 'is-holiday', d === today && 'is-today')}
                  title={holidays.get(d)}
                  aria-label={`${formatDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}${holidays.has(d) ? `, ${holidays.get(d)}` : ''}`}
                >
                  {(i === 0 || d.endsWith('-01')) && <span className="hr-to-tl__mon">{formatDay(d, { month: 'short' })}</span>}
                  <span className="hr-to-tl__wd">{formatDay(d, { weekday: n === 7 ? 'short' : 'narrow' })}</span>
                  <b>{Number(d.slice(8))}</b>
                  {holidays.has(d) && <Flag className="hr-to-tl__flag" aria-hidden="true" />}
                </div>
              ))}
            </div>
            {people.map((u) => (
              <div key={u.id} className={cx('hr-to-tl__row', u.id === me?.id && 'is-me')} role="row">
                <div className="hr-to-tl__who">
                  <Avatar user={u} size={26} />
                  <span className="hr-to-tl__name">
                    <span className="truncate">{u.id === me?.id ? `${first(u.name)} (you)` : u.name}</span>
                    <small className="truncate">{relation(u)}</small>
                  </span>
                </div>
                <div className="hr-to-tl__lane">
                  {(byUser.get(u.id) ?? []).map((a) => {
                    const s = Math.max(0, daysBetween(from, a.start));
                    const e = Math.min(n - 1, daysBetween(from, a.end));
                    let left = (s / n) * 100;
                    let width = ((e - s + 1) / n) * 100;
                    if (a.halfDay && a.start === a.end) {
                      width /= 2;
                      if (a.halfDay === 'pm') left += width;
                    }
                    const meta = a.type ? LEAVE_TYPE_BY_ID[a.type] : null;
                    const Icon = meta?.icon ?? UserRound;
                    const label = meta?.short ?? 'Away';
                    const wide = n === 7 || e - s >= 2;
                    const desc = `${u.name}: ${meta?.label ?? 'Away'}, ${formatRange(a.start, a.end, a.halfDay)}, ${formatDays(a.days)}${a.status === 'pending' ? ', awaiting approval' : ''}${a.coverId ? `, cover ${userById.get(a.coverId)?.name ?? ''}` : ''}`;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={cx('hr-to-tl__bar', a.status === 'pending' && 'is-pending', !meta && 'is-private', a.start < from && 'cut-start', a.end > to && 'cut-end')}
                        style={{ left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`, '--lt-h': meta?.hue ?? 220 } as CSSProperties}
                        aria-label={desc}
                        onPointerEnter={(ev: ReactPointerEvent<HTMLButtonElement>) => ev.pointerType === 'mouse' && showTip(a, ev.currentTarget)}
                        onPointerLeave={() => setTip(null)}
                        onFocus={(ev: FocusEvent<HTMLButtonElement>) => showTip(a, ev.currentTarget)}
                        onBlur={() => setTip(null)}
                        onClick={(ev) => (tip?.a.id === a.id ? setTip(null) : showTip(a, ev.currentTarget))}
                      >
                        <Icon aria-hidden="true" />
                        {wide && <span className="truncate">{label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="hr-to-tl__legend" aria-hidden="true">
        <span>
          <i className="is-approved" /> Approved
        </span>
        <span>
          <i className="is-pending" /> Awaiting approval
        </span>
        <span>
          <i className="is-private" /> Away (private)
        </span>
        {holidays.size > 0 && (
          <span>
            <i className="is-holiday" /> Public holiday
          </span>
        )}
        {!isMobile && (
          <span>
            <i className="is-today" /> Today
          </span>
        )}
      </div>
      {tip && createPortal(<AbsenceTip tip={tip} userById={userById} />, document.body)}
    </HrPanel>
  );
}

function AbsenceTip({ tip, userById }: { tip: Tip; userById: Map<string, User> }) {
  const { a } = tip;
  const u = userById.get(a.userId);
  const cover = a.coverId ? userById.get(a.coverId) : undefined;
  return (
    <div className="hr-to-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <div className="hr-to-tip__who">
        {u && <Avatar user={u} size={28} />}
        <div>
          <b>{u?.name ?? 'Colleague'}</b>
          <span>{formatRange(a.start, a.end, a.halfDay)} · {formatDays(a.days)}</span>
        </div>
      </div>
      <div className="hr-to-tip__row">
        <LeaveTypeBadge type={a.type} />
        <span className={cx('hr-to-tip__status', a.status === 'pending' && 'is-pending')}>{a.status === 'pending' ? 'Awaiting approval' : 'Approved'}</span>
      </div>
      {cover && (
        <div className="hr-to-tip__cover">
          <Avatar user={cover} size={20} /> Covered by <b>{cover.name}</b>
        </div>
      )}
    </div>
  );
}

function Agenda({ days, today, absences, holidays, userById, meId }: { days: string[]; today: string; absences: Absence[]; holidays: Map<string, string>; userById: Map<string, User>; meId?: string }) {
  const list = days
    .filter((d) => d >= today)
    .map((d) => ({ d, items: isWeekend(d) ? [] : absences.filter((a) => a.start <= d && a.end >= d), holiday: holidays.get(d) }))
    .filter((x) => x.items.length > 0 || x.holiday);
  if (!list.length)
    return (
      <div className="hr-to-agenda__empty">
        <span aria-hidden="true">🙌</span> Everyone’s in for this stretch.
      </div>
    );
  const label = (d: string) => (d === today ? 'Today' : d === addDaysISO(today, 1) ? 'Tomorrow' : formatDay(d, { weekday: 'long' }));
  return (
    <ol className="hr-to-agenda">
      {list.map(({ d, items, holiday }) => (
        <li key={d} className={cx('hr-to-agenda__day', d === today && 'is-today')}>
          <div className="hr-to-agenda__date">
            <b>{label(d)}</b>
            <span>{formatDay(d, { day: 'numeric', month: 'short' })}</span>
          </div>
          <div className="hr-to-agenda__items">
            {holiday && (
              <div className="hr-to-agenda__hol">
                <Flag aria-hidden="true" /> {holiday} · public holiday
              </div>
            )}
            {items.map((a) => {
              const u = userById.get(a.userId);
              const cover = a.coverId ? userById.get(a.coverId) : undefined;
              return (
                <div key={a.id} className={cx('hr-to-agenda__item', a.status === 'pending' && 'is-pending')}>
                  {u && <Avatar user={u} size={28} />}
                  <div className="hr-to-agenda__text">
                    <b className="truncate">{a.userId === meId ? 'You' : (u?.name ?? 'Colleague')}</b>
                    <span className="truncate">
                      {a.start === a.end ? (a.halfDay ? (a.halfDay === 'am' ? 'Morning' : 'Afternoon') : 'All day') : `Until ${formatDay(a.end, { weekday: 'short', day: 'numeric', month: 'short' })}`}
                      {cover ? ` · cover ${first(cover.name)}` : ''}
                    </span>
                  </div>
                  <LeaveTypeBadge type={a.type} />
                  {a.status === 'pending' && <span className="hr-to-pending-tag">pending</span>}
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}
