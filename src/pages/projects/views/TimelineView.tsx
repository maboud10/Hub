import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Diamond, GanttChart, Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { addDaysISO, daysBetween, formatDay, isWeekend, startOfWeek } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { STATUS_META } from '@/projects/constants';
import { isBlocked, timelineRows } from '@/projects/engine';
import type { ViewProps } from '../ProjectView';
import { UserAvatar } from '../shared';

const DAY_W = 34;
const ROW_H = 40;
const LEFT_W = 260;
const WINDOW_DAYS = 42;

export function TimelineView({ tasks, byId, today, openTask, project }: ViewProps) {
  const [offsetWeeks, setOffsetWeeks] = useState(-1);
  const windowStart = addDaysISO(startOfWeek(today), offsetWeeks * 7);
  const windowEnd = addDaysISO(windowStart, WINDOW_DAYS);
  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysISO(windowStart, i)), [windowStart]);

  const rows = useMemo(() => timelineRows(tasks, windowStart, windowEnd).filter((r) => r.end >= windowStart && r.start <= windowEnd), [tasks, windowStart, windowEnd]);
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.task.id, i])), [rows]);
  const gridW = WINDOW_DAYS * DAY_W;
  const todayX = daysBetween(windowStart, today) * DAY_W + DAY_W / 2;
  const unscheduled = tasks.filter((t) => !t.dueDate && !t.startDate).length;

  const months = useMemo(() => {
    const out: { label: string; span: number }[] = [];
    days.forEach((d) => {
      const label = formatDay(d, { month: 'short', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ label, span: 1 });
    });
    return out;
  }, [days]);

  // Dependency connectors: from the end of each blocker bar to the start of the dependent bar.
  const links = useMemo(() => {
    const out: { id: string; d: string; late: boolean }[] = [];
    rows.forEach((r, i) => {
      r.blockedBy.forEach((depId) => {
        const j = rowIndex.get(depId);
        if (j === undefined) return;
        const dep = rows[j];
        const x1 = (dep.left + dep.width) * gridW;
        const y1 = j * ROW_H + ROW_H / 2;
        const x2 = r.left * gridW;
        const y2 = i * ROW_H + ROW_H / 2;
        const mid = x1 + Math.max(10, (x2 - x1) / 2);
        const d = x2 >= x1 + 12 ? `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` : `M${x1},${y1} L${x1 + 10},${y1} L${x1 + 10},${y2 - ROW_H / 2} L${x2 - 10},${y2 - ROW_H / 2} L${x2 - 10},${y2} L${x2},${y2}`;
        out.push({ id: `${depId}-${r.task.id}`, d, late: dep.end > r.start });
      });
    });
    return out;
  }, [rows, rowIndex, gridW]);

  return (
    <div className="pj-timeline">
      <div className="pj-timeline__bar">
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => setOffsetWeeks((w) => w - 2)} aria-label="Earlier">
            <ChevronLeft />
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOffsetWeeks(-1)}>
            Today
          </button>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => setOffsetWeeks((w) => w + 2)} aria-label="Later">
            <ChevronRight />
          </button>
          <span className="text-sm muted">
            {formatDay(windowStart, { day: 'numeric', month: 'short' })} – {formatDay(addDaysISO(windowEnd, -1), { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="pj-timeline__legend text-xs muted">
          <span>
            <i className="pj-legend pj-legend--bar" /> Task
          </span>
          <span>
            <Diamond className="pj-legend-diamond" /> Milestone
          </span>
          <span>
            <i className="pj-legend pj-legend--link" /> Dependency
          </span>
          {unscheduled > 0 && <span>{unscheduled} unscheduled hidden</span>}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<GanttChart />} title="Nothing scheduled in this window">
          Tasks need a start or due date to appear on the timeline. Use the arrows to look at other weeks.
        </EmptyState>
      ) : (
        <div className="pj-gantt" style={{ '--left': `${LEFT_W}px`, '--day': `${DAY_W}px`, '--row': `${ROW_H}px` } as CSSProperties}>
          <div className="pj-gantt__inner" style={{ width: LEFT_W + gridW }}>
            <div className="pj-gantt__head">
              <div className="pj-gantt__corner">
                {rows.length} task{rows.length === 1 ? '' : 's'} · {project.key}
              </div>
              <div className="pj-gantt__months" style={{ width: gridW }}>
                {months.map((m) => (
                  <span key={m.label} style={{ width: m.span * DAY_W }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="pj-gantt__corner pj-gantt__corner--days" />
              <div className="pj-gantt__days" style={{ width: gridW }}>
                {days.map((d) => (
                  <span key={d} className={cx('pj-gantt__day', isWeekend(d) && 'is-weekend', d === today && 'is-today')}>
                    <small>{formatDay(d, { weekday: 'narrow' })}</small>
                    {d.slice(8)}
                  </span>
                ))}
              </div>
            </div>
            <div className="pj-gantt__body" style={{ height: rows.length * ROW_H }}>
              <div className="pj-gantt__labels">
                {rows.map((r) => {
                  const blocked = isBlocked(r.task, byId);
                  return (
                    <button key={r.task.id} type="button" className={cx('pj-gantt__label', r.task.status === 'done' && 'is-done')} onClick={() => openTask(r.task.id)} title={r.task.title}>
                      {r.task.type === 'milestone' ? <Diamond className="pj-gantt__ms-icon" /> : <i className="pj-gantt__status" style={{ background: STATUS_META[r.task.status].color }} />}
                      <span className="truncate">{r.task.title}</span>
                      {blocked && <Lock className="pj-gantt__lock" />}
                      <UserAvatar userId={r.task.assigneeId} size={18} />
                    </button>
                  );
                })}
              </div>
              <div className="pj-gantt__grid" style={{ width: gridW }}>
                {days.map((d, i) => (
                  <i key={d} className={cx('pj-gantt__col', isWeekend(d) && 'is-weekend')} style={{ left: i * DAY_W }} />
                ))}
                {todayX >= 0 && todayX <= gridW && (
                  <i className="pj-gantt__today" style={{ left: todayX }}>
                    <span>Today</span>
                  </i>
                )}
                <svg className="pj-gantt__links" width={gridW} height={rows.length * ROW_H} aria-hidden="true">
                  <defs>
                    <marker id="pj-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" />
                    </marker>
                  </defs>
                  {links.map((l) => (
                    <path key={l.id} d={l.d} className={cx('pj-gantt__link', l.late && 'is-late')} markerEnd="url(#pj-arrow)" />
                  ))}
                </svg>
                {rows.map((r, i) => {
                  const overdue = r.task.status !== 'done' && r.end < today;
                  const left = r.left * gridW;
                  const width = Math.max(r.task.type === 'milestone' ? 0 : 12, r.width * gridW);
                  return r.task.type === 'milestone' ? (
                    <button key={r.task.id} type="button" className={cx('pj-gantt__milestone', r.task.status === 'done' && 'is-done', overdue && 'is-overdue')} style={{ left: left + DAY_W / 2, top: i * ROW_H + ROW_H / 2 }} onClick={() => openTask(r.task.id)} title={`${r.task.title} · ${r.end}`}>
                      <Diamond />
                    </button>
                  ) : (
                    <button
                      key={r.task.id}
                      type="button"
                      className={cx('pj-gantt__bar', r.task.status === 'done' && 'is-done', overdue && 'is-overdue', r.task.status === 'in_progress' && 'is-active')}
                      style={{ left, width, top: i * ROW_H + 8, '--pill': STATUS_META[r.task.status].color } as CSSProperties}
                      onClick={() => openTask(r.task.id)}
                      title={`${r.task.title} · ${r.start} → ${r.end}`}
                    >
                      <span className="truncate">{r.task.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
