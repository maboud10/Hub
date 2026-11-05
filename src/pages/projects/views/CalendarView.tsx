import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDay, isWeekend } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { PRIORITY_META } from '@/projects/constants';
import { monthGrid } from '@/projects/engine';
import { useProjectCalendar } from '@/projects/selectors';
import type { ViewProps } from '../ProjectView';
import { TypeGlyph, UserAvatar } from '../shared';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarView({ project, tasks, today, openTask, filtersActive }: ViewProps) {
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month0: Number(today.slice(5, 7)) - 1 }));
  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month0), [cursor]);
  const byDate = useProjectCalendar(project.id, cursor.year, cursor.month0);
  const visible = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const prefix = `${cursor.year}-${String(cursor.month0 + 1).padStart(2, '0')}`;
  const monthLabel = new Date(cursor.year, cursor.month0, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (n: number) => setCursor(({ year, month0 }) => {
    const d = new Date(year, month0 + n, 1);
    return { year: d.getFullYear(), month0: d.getMonth() };
  });
  const dueThisMonth = [...byDate.values()].flat().filter((t) => visible.has(t.id));

  return (
    <div className="pj-calendar">
      <div className="pj-timeline__bar">
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setCursor({ year: Number(today.slice(0, 4)), month0: Number(today.slice(5, 7)) - 1 })}>
            Today
          </button>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight />
          </button>
          <h3 className="pj-calendar__month">{monthLabel}</h3>
        </div>
        <span className="text-sm muted">
          {dueThisMonth.length} due{filtersActive ? ' (filtered)' : ''} · {dueThisMonth.filter((t) => t.status !== 'done' && t.dueDate! < today).length} overdue
        </span>
      </div>
      <div className="pj-cal">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pj-cal__dow">
            {d}
          </div>
        ))}
        {weeks.flat().map((iso) => {
          const inMonth = iso.startsWith(prefix);
          const items = (byDate.get(iso) ?? []).filter((t) => visible.has(t.id)).sort((a, b) => PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank);
          const shown = items.slice(0, 4);
          return (
            <div key={iso} className={cx('pj-cal__cell', !inMonth && 'is-outside', isWeekend(iso) && 'is-weekend', iso === today && 'is-today')}>
              <div className="pj-cal__date">
                <span>{iso.slice(8).replace(/^0/, '')}</span>
                {iso === today && <small>Today</small>}
              </div>
              <div className="pj-cal__items">
                {shown.map((t) => {
                  const overdue = t.status !== 'done' && iso < today;
                  return (
                    <button key={t.id} type="button" className={cx('pj-cal__chip', t.status === 'done' && 'is-done', overdue && 'is-overdue', `pj-cal__chip--${t.type}`)} onClick={() => openTask(t.id)} title={`${project.key}-${t.number} · ${t.title}${overdue ? ' · overdue' : ''}`}>
                      <TypeGlyph type={t.type} />
                      <span className="truncate">{t.title}</span>
                      <UserAvatar userId={t.assigneeId} size={14} />
                    </button>
                  );
                })}
                {items.length > shown.length && <span className="pj-cal__more">+{items.length - shown.length} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="field-hint">Chips sit on their due date — red means overdue. Click one to open it; weekends are shaded. {formatDay(today, { weekday: 'long' })} is highlighted.</p>
    </div>
  );
}
