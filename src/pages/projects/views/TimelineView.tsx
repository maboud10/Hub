/**
 * Timeline — Gantt bars grouped by section. Drag a bar to move it, drag its
 * ends to change start/due. Dependency connectors and a today line.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CalendarPlus, Diamond } from 'lucide-react';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { canEditProject } from '@/projects/access';
import { MONTHS, WEEKDAYS, addDays, diffDays, formatDue, isWeekend, parseIso, todayIso } from '@/projects/dates';
import { criticalPath } from '@/projects/graph';
import { taskKey } from '@/projects/metrics';
import { useProjects } from '@/projects/store';
import type { Project, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectsUI } from '../ctx';
import { UserAvatar } from '../ui';
import { applyFilters, type Filters } from './shared';

type Zoom = 'week' | 'month';
const ROW = 40;
const SEC = 32;

interface Span {
  start: string;
  due: string;
}

function spanOf(t: Task): Span | null {
  if (!t.dueDate) return null;
  if (t.kind === 'milestone') return { start: t.dueDate, due: t.dueDate };
  const len = Math.max(1, Math.ceil((t.estimate ?? 8) / 6));
  const start = t.startDate && t.startDate <= t.dueDate ? t.startDate : addDays(t.dueDate, -(len - 1));
  return { start, due: t.dueDate };
}

export function TimelineView({ project, tasks, filters }: { project: Project; tasks: Task[]; filters: Filters }) {
  const ui = useProjectsUI();
  const actor = useActor()!;
  const mobile = useIsMobile();
  const update = useProjects((s) => s.updateTask);
  const canEdit = canEditProject(project, actor);
  const [zoom, setZoom] = useState<Zoom>('week');
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'start' | 'end'; x0: number; orig: Span; delta: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dayW = zoom === 'week' ? (mobile ? 30 : 40) : mobile ? 10 : 14;
  const labelW = mobile ? 150 : 260;
  const today = todayIso();

  const filtered = useMemo(() => applyFilters(tasks, filters, actor.id, project), [tasks, filters, actor.id, project]);
  const crit = useMemo(
    () => new Set(criticalPath(tasks.map((t) => ({ id: t.id, blockedBy: t.blockedBy, done: !!t.completedAt, estimate: t.estimate, milestone: t.kind === 'milestone' }))).path),
    [tasks],
  );

  const range = useMemo(() => {
    const dates = [project.startDate, project.dueDate, today];
    for (const t of tasks) {
      const s = spanOf(t);
      if (s) dates.push(s.start, s.due);
    }
    dates.sort();
    const start = addDays(dates[0], -4);
    const end = addDays(dates[dates.length - 1], 10);
    const days: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return { start, days };
  }, [tasks, project.startDate, project.dueDate, today]);

  const x = (d: string) => diffDays(range.start, d) * dayW;
  const gridW = range.days.length * dayW;

  // rows: sections + tasks
  const rows = useMemo(() => {
    const out: ({ kind: 'sec'; id: string; name: string } | { kind: 'task'; task: Task })[] = [];
    for (const s of project.sections) {
      const list = filtered.filter((t) => t.sectionId === s.id).sort((a, b) => (spanOf(a)?.start ?? '9999').localeCompare(spanOf(b)?.start ?? '9999') || a.order - b.order);
      if (!list.length) continue;
      out.push({ kind: 'sec', id: s.id, name: s.name });
      for (const t of list) out.push({ kind: 'task', task: t });
    }
    return out;
  }, [project.sections, filtered]);

  const rowTop = useMemo(() => {
    const m = new Map<string, number>();
    let y = 0;
    for (const r of rows) {
      if (r.kind === 'task') m.set(r.task.id, y);
      y += r.kind === 'sec' ? SEC : ROW;
    }
    return { m, total: y };
  }, [rows]);

  // centre today on first render / zoom change
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(today) - (el.clientWidth - labelW) / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, range.start]);

  const live = (t: Task): Span | null => {
    const s = spanOf(t);
    if (!s || !drag || drag.id !== t.id) return s;
    const d = drag.delta;
    if (drag.mode === 'move') return { start: addDays(drag.orig.start, d), due: addDays(drag.orig.due, d) };
    if (drag.mode === 'start') {
      const ns = addDays(drag.orig.start, d);
      return { start: ns > drag.orig.due ? drag.orig.due : ns, due: drag.orig.due };
    }
    const nd = addDays(drag.orig.due, d);
    return { start: drag.orig.start, due: nd < drag.orig.start ? drag.orig.start : nd };
  };

  const onDown = (e: ReactPointerEvent, t: Task, mode: 'move' | 'start' | 'end') => {
    if (!canEdit) return;
    const s = spanOf(t);
    if (!s) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: t.id, mode: t.kind === 'milestone' ? 'move' : mode, x0: e.clientX, orig: s, delta: 0 });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x0) / dayW);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const onUp = (t: Task) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.delta === 0) {
      if (d.mode === 'move') ui.openTask(t.id);
      return;
    }
    const next = live({ ...t })!;
    const s = d.mode === 'move' ? { start: addDays(d.orig.start, d.delta), due: addDays(d.orig.due, d.delta) } : next;
    const prev = { startDate: t.startDate, dueDate: t.dueDate };
    const r = update(t.id, t.kind === 'milestone' ? { dueDate: s.due } : { startDate: s.start, dueDate: s.due });
    if (!r.ok) return toast.error(r.error);
    pushUndo(`${taskKey(project, t)} → ${formatDue(s.start)}${s.start !== s.due ? `–${formatDue(s.due)}` : ''}`, () => update(t.id, prev));
  };

  const schedule = (t: Task) => {
    const r = update(t.id, { startDate: today, dueDate: addDays(today, Math.max(1, Math.ceil((t.estimate ?? 8) / 6)) - 1) });
    if (!r.ok) toast.error(r.error);
  };

  // month header segments
  const months = useMemo(() => {
    const segs: { label: string; left: number; width: number }[] = [];
    let cur = '';
    for (const d of range.days) {
      const key = d.slice(0, 7);
      if (key !== cur) {
        cur = key;
        const dt = parseIso(d);
        segs.push({ label: `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`, left: x(d), width: 0 });
      }
      segs[segs.length - 1].width += dayW;
    }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, dayW]);

  const connectors = useMemo(() => {
    const out: { d: string; conflict: boolean; crit: boolean; key: string }[] = [];
    for (const r of rows) {
      if (r.kind !== 'task') continue;
      const t = r.task;
      const st = live(t);
      if (!st) continue;
      for (const bId of t.blockedBy) {
        const b = filtered.find((x2) => x2.id === bId);
        if (!b) continue;
        const sb = live(b);
        if (!sb) continue;
        const y1 = (rowTop.m.get(b.id) ?? 0) + ROW / 2;
        const y2 = (rowTop.m.get(t.id) ?? 0) + ROW / 2;
        const x1 = x(sb.due) + dayW;
        const x2 = x(st.start);
        const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 14));
        const d = x2 >= x1 + 16 ? `M${x1},${y1} H${mid} V${y2} H${x2 - 2}` : `M${x1},${y1} h10 V${(y1 + y2) / 2} H${x2 - 12} V${y2} H${x2 - 2}`;
        out.push({ d, conflict: x2 < x1, crit: crit.has(t.id) && crit.has(b.id), key: `${b.id}-${t.id}` });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filtered, rowTop, drag, dayW, range.start, crit]);

  const undated = filtered.filter((t) => !t.dueDate && !t.completedAt);

  return (
    <div className="pj-tl" ref={scroller} style={{ ['--day' as string]: `${dayW}px`, ['--lw' as string]: `${labelW}px`, ['--pc' as string]: project.color }}>
      <div className="pj-tl__inner" style={{ width: labelW + gridW }}>
        <div className="pj-tl__header">
          <div className="pj-tl__corner">
            <div className="pj-seg" role="radiogroup" aria-label="Zoom">
              {(['week', 'month'] as Zoom[]).map((z) => (
                <button key={z} type="button" role="radio" aria-checked={zoom === z} className={cx(zoom === z && 'is-on')} onClick={() => setZoom(z)}>
                  {z === 'week' ? 'Weeks' : 'Months'}
                </button>
              ))}
            </div>
          </div>
          <div className="pj-tl__scale" style={{ width: gridW }}>
            <div className="pj-tl__months">
              {months.map((m) => (
                <span key={m.label} style={{ left: m.left, width: m.width }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="pj-tl__days">
              {range.days.map((d) => {
                const dt = parseIso(d);
                const show = zoom === 'week' || dt.getDay() === 1;
                return (
                  <span key={d} className={cx(isWeekend(d) && 'is-wknd', d === today && 'is-today')} style={{ left: x(d), width: zoom === 'week' ? dayW : dayW * 7 }}>
                    {show && (zoom === 'week' ? `${WEEKDAYS[dt.getDay()][0]} ${dt.getDate()}` : `${dt.getDate()} ${MONTHS[dt.getMonth()]}`)}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pj-tl__body" style={{ height: rowTop.total + (undated.length ? 12 : 0) }}>
          <div className="pj-tl__bg" style={{ left: labelW, width: gridW }} aria-hidden="true">
            {zoom === 'week' && range.days.map((d) => (isWeekend(d) ? <span key={d} className="pj-tl__wknd" style={{ left: x(d), width: dayW }} /> : null))}
            <span className="pj-tl__todayline" style={{ left: x(today) + dayW / 2 }} />
            <span className="pj-tl__duezone" style={{ left: x(project.dueDate) + dayW }} title={`Project due ${formatDue(project.dueDate)}`} />
          </div>
          <svg className="pj-tl__links" style={{ left: labelW }} width={gridW} height={rowTop.total} aria-hidden="true">
            <defs>
              <marker id="pj-tl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" className="pj-tl__arrow" />
              </marker>
            </defs>
            {connectors.map((c) => (
              <path key={c.key} d={c.d} className={cx('pj-tl__link', c.conflict && 'is-conflict', c.crit && 'is-crit')} markerEnd="url(#pj-tl-arrow)" />
            ))}
          </svg>
          {rows.map((r) => {
            if (r.kind === 'sec')
              return (
                <div key={r.id} className="pj-tl__sec" style={{ height: SEC }}>
                  <span className="pj-tl__seclabel">{r.name}</span>
                </div>
              );
            const t = r.task;
            const s = live(t);
            const overdue = !t.completedAt && t.dueDate && t.dueDate < today;
            return (
              <div key={t.id} className={cx('pj-tl__row', ui.taskId === t.id && 'is-open')} style={{ height: ROW }}>
                <button type="button" className="pj-tl__label" onClick={() => ui.openTask(t.id)}>
                  <span className="neo-mono pj-tl__key">{taskKey(project, t)}</span>
                  <span className={cx('truncate', t.completedAt && 'is-done')}>{t.title}</span>
                  <UserAvatar id={t.assigneeId} size={20} />
                </button>
                <div className="pj-tl__lane" style={{ width: gridW }}>
                  {s ? (
                    t.kind === 'milestone' ? (
                      <div
                        className={cx('pj-tl__ms', t.completedAt && 'is-done', crit.has(t.id) && 'is-crit')}
                        style={{ left: x(s.due) + dayW / 2 }}
                        onPointerDown={(e) => onDown(e, t, 'move')}
                        onPointerMove={onMove}
                        onPointerUp={() => onUp(t)}
                        onClick={canEdit ? undefined : () => ui.openTask(t.id)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Milestone ${t.title}, ${formatDue(s.due)}`}
                        onKeyDown={(e) => e.key === 'Enter' && ui.openTask(t.id)}
                      >
                        <Diamond />
                        <span className="pj-tl__mslabel">{t.title}</span>
                      </div>
                    ) : (
                      <div
                        className={cx('pj-tl__bar', t.completedAt && 'is-done', overdue && 'is-overdue', crit.has(t.id) && !t.completedAt && 'is-crit', drag?.id === t.id && 'is-drag', !canEdit && 'is-ro')}
                        style={{ left: x(s.start), width: (diffDays(s.start, s.due) + 1) * dayW }}
                        onPointerDown={(e) => onDown(e, t, 'move')}
                        onPointerMove={onMove}
                        onPointerUp={() => onUp(t)}
                        onClick={canEdit ? undefined : () => ui.openTask(t.id)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.title}, ${formatDue(s.start)} to ${formatDue(s.due)}`}
                        onKeyDown={(e) => e.key === 'Enter' && ui.openTask(t.id)}
                        data-qa="tl-bar"
                      >
                        {canEdit && <span className="pj-tl__handle pj-tl__handle--l" onPointerDown={(e) => onDown(e, t, 'start')} />}
                        <span className="pj-tl__bartext truncate">{t.title}</span>
                        {canEdit && <span className="pj-tl__handle pj-tl__handle--r" onPointerDown={(e) => onDown(e, t, 'end')} />}
                        {drag?.id === t.id && (
                          <span className="pj-tl__dragtip">
                            {formatDue(s.start)}
                            {s.start !== s.due ? ` → ${formatDue(s.due)}` : ''}
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    canEdit &&
                    !t.completedAt && (
                      <button type="button" className="pj-tl__schedule" style={{ left: Math.max(0, x(today) - 40) }} onClick={() => schedule(t)}>
                        <CalendarPlus /> Schedule
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="pj-tl__empty">No tasks match these filters.</div>}
        </div>
      </div>
    </div>
  );
}
