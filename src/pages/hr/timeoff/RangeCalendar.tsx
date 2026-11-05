/**
 * Custom month range picker for time off: two months side by side on desktop
 * (one on phones), weekends and public holidays marked, your own leave and
 * teammates' absences as dots, a live hover preview while choosing the end
 * date, and full keyboard support (arrows, Page Up/Down, Home/End, Enter).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeaveStatus, LeaveTypeId } from '@/hr/types';
import { LEAVE_TYPE_BY_ID } from '@/hr/constants';
import { addDaysISO, formatDay, isWeekend, parseISODate } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { monthLabel, monthWeeks, shiftDateMonth, shiftMonth } from './utils';

export interface DayInfo {
  holiday?: string;
  /** Your own leave that day. */
  mine?: { type: LeaveTypeId; status: LeaveStatus };
  /** Teammates away that day (first names; never the leave type). */
  team?: string[];
}

interface RangeCalendarProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  months: 1 | 2;
  info: ReadonlyMap<string, DayInfo>;
  today: string;
  min?: string;
  max?: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dowMon = (iso: string) => (new Date(parseISODate(iso)).getDay() + 6) % 7;

export function RangeCalendar({ start, end, onChange, months, info, today, min, max }: RangeCalendarProps) {
  const [view, setView] = useState(() => (start || today).slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState(() => start || today);
  const gridRef = useRef<HTMLDivElement>(null);
  const viaKeyboard = useRef(false);

  const shown = useMemo(() => Array.from({ length: months }, (_, i) => shiftMonth(view, i)), [view, months]);
  const lo = anchor && hover && hover >= anchor ? anchor : start;
  const hi = anchor && hover && hover >= anchor ? hover : end || start;
  const ok = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const canPrev = !min || shiftMonth(view, -1) >= min.slice(0, 7);
  const canNext = !max || shiftMonth(view, months) <= max.slice(0, 7);

  const pick = (iso: string) => {
    if (!ok(iso)) return;
    if (anchor && iso >= anchor) {
      onChange(anchor, iso);
      setAnchor(null);
      setHover(null);
    } else {
      onChange(iso, iso);
      setAnchor(iso);
    }
    setFocus(iso);
  };

  const moveTo = (iso: string) => {
    const target = min && iso < min ? min : max && iso > max ? max : iso;
    viaKeyboard.current = true;
    setFocus(target);
    if (anchor) setHover(target);
    const ym = target.slice(0, 7);
    if (!shown.includes(ym)) setView(ym < view ? ym : shiftMonth(ym, -(months - 1)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    let next: string | null = null;
    if (k === 'ArrowRight') next = addDaysISO(focus, 1);
    else if (k === 'ArrowLeft') next = addDaysISO(focus, -1);
    else if (k === 'ArrowDown') next = addDaysISO(focus, 7);
    else if (k === 'ArrowUp') next = addDaysISO(focus, -7);
    else if (k === 'PageDown') next = shiftDateMonth(focus, 1);
    else if (k === 'PageUp') next = shiftDateMonth(focus, -1);
    else if (k === 'Home') next = addDaysISO(focus, -dowMon(focus));
    else if (k === 'End') next = addDaysISO(focus, 6 - dowMon(focus));
    else if (k === 'Enter' || k === ' ') {
      if ((e.target as HTMLElement).dataset.date) {
        e.preventDefault();
        pick(focus);
      }
      return;
    }
    if (next) {
      e.preventDefault();
      moveTo(next);
    }
  };

  useEffect(() => {
    if (!viaKeyboard.current) return;
    viaKeyboard.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, view]);

  // Keep the roving tab stop inside the visible months.
  const tabStop = shown.includes(focus.slice(0, 7)) ? focus : shown.includes(today.slice(0, 7)) ? today : `${view}-01`;

  return (
    <div className="hr-to-cal" style={{ '--months': months } as CSSProperties} ref={gridRef} onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
      <div className="hr-to-cal__nav">
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => setView(shiftMonth(view, -1))} disabled={!canPrev} aria-label="Previous month">
          <ChevronLeft />
        </button>
        <div className="hr-to-cal__titles" aria-live="polite">
          {shown.map((ym) => (
            <span key={ym}>{monthLabel(ym)}</span>
          ))}
        </div>
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => setView(shiftMonth(view, 1))} disabled={!canNext} aria-label="Next month">
          <ChevronRight />
        </button>
      </div>
      <div className="hr-to-cal__months">
        {shown.map((ym) => (
          <div key={ym} className="hr-to-cal__month" role="grid" aria-label={monthLabel(ym)}>
            <div className="hr-to-cal__week hr-to-cal__week--head" role="row">
              {WEEKDAYS.map((d, i) => (
                <span key={d} role="columnheader" className={cx('hr-to-cal__wd', i >= 5 && 'is-weekend')} aria-label={d}>
                  {d.slice(0, 2)}
                </span>
              ))}
            </div>
            {monthWeeks(ym).map((week, wi) => (
              <div key={wi} className="hr-to-cal__week" role="row">
                {week.map((iso, di) => {
                  if (!iso) return <span key={di} className="hr-to-cal__cell is-blank" role="gridcell" />;
                  const meta = info.get(iso);
                  const weekend = isWeekend(iso);
                  const inRange = !!lo && iso >= lo && iso <= hi;
                  const disabled = !ok(iso);
                  const team = meta?.team ?? [];
                  const label = [
                    formatDay(iso, { weekday: 'long', day: 'numeric', month: 'long' }),
                    iso === today ? 'today' : '',
                    weekend ? 'weekend' : '',
                    meta?.holiday ? `public holiday: ${meta.holiday}` : '',
                    meta?.mine ? `you're away (${meta.mine.status === 'pending' ? 'pending' : LEAVE_TYPE_BY_ID[meta.mine.type].short})` : '',
                    team.length ? `away: ${team.join(', ')}` : '',
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <span
                      key={iso}
                      role="gridcell"
                      aria-selected={inRange}
                      className={cx(
                        'hr-to-cal__cell',
                        inRange && 'in-range',
                        iso === lo && 'is-start',
                        iso === hi && 'is-end',
                        anchor && hover && inRange && 'is-preview',
                      )}
                    >
                      <button
                        type="button"
                        data-date={iso}
                        tabIndex={iso === tabStop ? 0 : -1}
                        aria-label={label}
                        aria-disabled={disabled || undefined}
                        title={meta?.holiday ?? (team.length ? `Away: ${team.join(', ')}` : undefined)}
                        className={cx(
                          'hr-to-cal__day',
                          weekend && 'is-weekend',
                          meta?.holiday && 'is-holiday',
                          iso === today && 'is-today',
                          disabled && 'is-disabled',
                          (iso === lo || iso === hi) && inRange && 'is-edge',
                        )}
                        onClick={() => pick(iso)}
                        onMouseEnter={() => anchor && setHover(iso)}
                        onFocus={() => setFocus(iso)}
                      >
                        <span className="hr-to-cal__num">{Number(iso.slice(8))}</span>
                        {meta?.holiday && <span className="hr-to-cal__flag" aria-hidden="true" />}
                        {(meta?.mine || team.length > 0) && (
                          <span className="hr-to-cal__dots" aria-hidden="true">
                            {meta?.mine && <i className={cx('is-mine', meta.mine.status === 'pending' && 'is-pending')} style={{ '--lt-h': LEAVE_TYPE_BY_ID[meta.mine.type].hue } as CSSProperties} />}
                            {team.slice(0, meta?.mine ? 2 : 3).map((n) => (
                              <i key={n} className="is-team" />
                            ))}
                          </span>
                        )}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sr-only" role="status">
        {anchor ? 'Now pick your last day (or the same day again for a single day).' : 'Tap your first day, then your last day.'}
      </div>
    </div>
  );
}
