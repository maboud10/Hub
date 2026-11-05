/**
 * Week view for the Interviews tab: seven day columns with interviews as
 * positioned time blocks (overlaps share lanes), a live "now" line and
 * colour per interview format. The grid scrolls inside its own container
 * (sticky day header) and opens on the week's first interview.
 * Desktop / tablet only (phones use the agenda).
 */
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { Candidate, Interview } from '@/talent/types';
import { INTERVIEW_KIND_META } from '@/talent/constants';
import { cx } from '@/lib/cx';
import { addDays, DAY, fmtTime, ivEnd, isLive, isWeekend, KIND_HUE, layoutLanes, MIN, startOfDay } from './utils';

const HOUR_PX = 54;

export function WeekView({
  interviews,
  weekStart,
  now,
  me,
  selectedId,
  onSelect,
  candById,
}: {
  interviews: Interview[];
  weekStart: number;
  now: number;
  me: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  candById: Map<string, Candidate>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 7);
  const inWeek = useMemo(() => interviews.filter((iv) => iv.scheduledAt >= weekStart && iv.scheduledAt < weekEnd), [interviews, weekStart, weekEnd]);

  const [from, to] = useMemo(() => {
    let lo = 7;
    let hi = 20;
    for (const iv of inWeek) {
      const s = new Date(iv.scheduledAt);
      const startH = s.getHours() + s.getMinutes() / 60;
      lo = Math.min(lo, Math.floor(startH));
      hi = Math.max(hi, Math.ceil(startH + iv.durationMins / 60));
    }
    return [Math.max(0, lo), Math.min(24, hi)];
  }, [inWeek]);

  // Open the week on its first interview (or 08:00).
  const firstHour = useMemo(() => {
    const hours = inWeek.filter((iv) => iv.status !== 'cancelled').map((iv) => new Date(iv.scheduledAt).getHours() + new Date(iv.scheduledAt).getMinutes() / 60);
    return hours.length ? Math.min(8, ...hours) : 8;
  }, [inWeek]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, (firstHour - from) * HOUR_PX - 12);
  }, [weekStart, firstHour, from]);

  const byDay = useMemo(() => {
    const m = new Map<number, Interview[]>();
    for (const iv of inWeek) {
      const k = startOfDay(iv.scheduledAt);
      m.set(k, [...(m.get(k) ?? []), iv]);
    }
    return m;
  }, [inWeek]);

  const today = startOfDay(now);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const pxPerMin = HOUR_PX / 60;
  const nowTop = ((now - today) / MIN - from * 60) * pxPerMin;

  return (
    <div className="tl-iv-week" style={{ '--hour-px': `${HOUR_PX}px`, '--work-from': 9 - from, '--work-to': 17 - from } as CSSProperties}>
      <div className="tl-iv-week__scroll" ref={scrollRef}>
        <div className="tl-iv-week__head">
          <span className="tl-iv-week__corner" aria-hidden="true" />
          {days.map((d) => {
            const count = (byDay.get(d) ?? []).filter((iv) => iv.status !== 'cancelled').length;
            return (
              <div key={d} className={cx('tl-iv-week__day', d === today && 'is-today', isWeekend(d) && 'is-weekend', d < today && 'is-past')}>
                <span className="tl-iv-week__dow">{new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="tl-iv-week__date">{new Date(d).getDate()}</span>
                {count > 0 && (
                  <span className="tl-iv-week__count" aria-label={`${count} interviews`}>
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="tl-iv-week__body" style={{ height: (to - from) * HOUR_PX }}>
          <div className="tl-iv-week__axis" aria-hidden="true">
            {hours.map((h) => (
              <span key={h} style={{ top: (h - from) * HOUR_PX }}>
                {new Date(2020, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const laned = layoutLanes(list, (iv) => [iv.scheduledAt, ivEnd(iv)]);
            return (
              <div key={d} className={cx('tl-iv-week__col', d === today && 'is-today', isWeekend(d) && 'is-weekend', d < today && 'is-past')}>
                {laned.map(({ item: iv, lane, lanes }) => {
                  const cand = candById.get(iv.candidateId);
                  const top = ((iv.scheduledAt - d) / MIN - from * 60) * pxPerMin;
                  const height = Math.max(24, iv.durationMins * pxPerMin - 3);
                  const parts = cand?.name.split(/\s+/) ?? ['Candidate'];
                  const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
                  const mine = iv.interviewerIds.includes(me);
                  const past = ivEnd(iv) <= now;
                  return (
                    <button
                      key={iv.id}
                      type="button"
                      className={cx(
                        'tl-iv-block',
                        height < 40 && 'is-short',
                        mine && 'is-mine',
                        iv.status === 'cancelled' && 'is-cancelled',
                        iv.status === 'no-show' && 'is-noshow',
                        past && 'is-past',
                        isLive(iv, now) && 'is-live',
                        selectedId === iv.id && 'is-selected',
                      )}
                      style={
                        {
                          top,
                          height,
                          left: `calc(${lane} * (100% - 6px) / ${lanes} + 3px)`,
                          width: `calc((100% - 6px) / ${lanes} - 3px)`,
                          '--kind-h': KIND_HUE[iv.kind],
                        } as CSSProperties
                      }
                      onClick={() => onSelect(iv.id)}
                      aria-pressed={selectedId === iv.id}
                      aria-label={`${new Date(iv.scheduledAt).toLocaleDateString(undefined, { weekday: 'long' })} ${fmtTime(iv.scheduledAt)}: ${iv.title} with ${cand?.name ?? 'candidate'}${iv.status === 'cancelled' ? ' (cancelled)' : ''}`}
                    >
                      <span className="tl-iv-block__time">{fmtTime(iv.scheduledAt)}</span>
                      <span className="tl-iv-block__name">{short}</span>
                      {height > 46 && <span className="tl-iv-block__kind">{INTERVIEW_KIND_META[iv.kind].label}</span>}
                    </button>
                  );
                })}
                {d === today && nowTop >= 0 && nowTop <= (to - from) * HOUR_PX && (
                  <span className="tl-iv-week__now" style={{ top: nowTop }} aria-hidden="true">
                    <i />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {inWeek.length === 0 && <div className="tl-iv-week__empty">No interviews this week{weekStart > now + DAY ? ' yet' : ''}.</div>}
    </div>
  );
}
