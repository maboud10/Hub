/**
 * Calendar — month grid by due date. Drag a task to another day; click a day to add.
 */
import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Diamond, Plus } from 'lucide-react';
import { NeoPopover } from '@/components/neo';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { canEditProject } from '@/projects/access';
import { MONTHS, WEEKDAYS, addDays, formatDue, iso, parseIso, startOfWeek, todayIso } from '@/projects/dates';
import { taskKey } from '@/projects/metrics';
import { useProjects } from '@/projects/store';
import type { Project, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectsUI } from '../ctx';
import { UserAvatar } from '../ui';
import { applyFilters, type Filters } from './shared';

export function CalendarView({ project, tasks, filters }: { project: Project; tasks: Task[]; filters: Filters }) {
  const actor = useActor()!;
  const ui = useProjectsUI();
  const mobile = useIsMobile();
  const update = useProjects((s) => s.updateTask);
  const create = useProjects((s) => s.createTask);
  const canEdit = canEditProject(project, actor);
  const [cursor, setCursor] = useState(() => todayIso().slice(0, 7) + '-01');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ day: string; el: HTMLElement } | null>(null);
  const [more, setMore] = useState<{ day: string; el: HTMLElement } | null>(null);
  const [title, setTitle] = useState('');
  const today = todayIso();
  const filtered = useMemo(() => applyFilters(tasks, filters, actor.id, project), [tasks, filters, actor.id, project]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of filtered) if (t.dueDate) m.set(t.dueDate, [...(m.get(t.dueDate) ?? []), t]);
    for (const list of m.values()) list.sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'));
    return m;
  }, [filtered]);
  const month = parseIso(cursor);
  const days = useMemo(() => {
    const first = startOfWeek(cursor);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [cursor]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }), useSensor(KeyboardSensor));
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const t = byId.get(String(e.active.id));
    const day = String(e.over.id).replace('day-', '');
    if (!t || t.dueDate === day) return;
    const prev = t.dueDate;
    const r = update(t.id, { dueDate: day });
    if (!r.ok) return toast.error(r.error);
    pushUndo(`${taskKey(project, t)} moved to ${formatDue(day)}`, () => update(t.id, { dueDate: prev }));
  };

  const addTask = () => {
    if (!adding || !title.trim()) return;
    const r = create({ title, projectId: project.id, dueDate: adding.day, assigneeId: actor.id });
    if (!r.ok) return toast.error(r.error);
    toast.success('Task added', formatDue(adding.day));
    setTitle('');
    setAdding(null);
  };

  const shift = (n: number) => setCursor(iso(new Date(month.getFullYear(), month.getMonth() + n, 1)));
  const active = activeId ? byId.get(activeId) : undefined;
  const noDate = filtered.filter((t) => !t.dueDate && !t.completedAt).length;

  const header = (
    <div className="pj-cal__bar">
      <h2 className="neo-title pj-cal__month">
        {MONTHS[month.getMonth()]} <span className="neo-faint">{month.getFullYear()}</span>
      </h2>
      <div className="pj-cal__nav">
        <button type="button" className="neo-iconbtn" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft />
        </button>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setCursor(todayIso().slice(0, 7) + '-01')}>
          Today
        </button>
        <button type="button" className="neo-iconbtn" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight />
        </button>
      </div>
      <span className="grow" />
      {noDate > 0 && <span className="neo-faint text-xs">{noDate} open tasks without a due date</span>}
    </div>
  );

  if (mobile) {
    const monthDays = days.filter((d) => d.slice(0, 7) === cursor.slice(0, 7) && byDay.get(d)?.length);
    return (
      <div className="pj-cal neo-pad">
        {header}
        <ol className="pj-agenda">
          {monthDays.length === 0 && <li className="neo-faint text-sm">Nothing due this month.</li>}
          {monthDays.map((d) => (
            <li key={d} className={cx('pj-agenda__day', d === today && 'is-today')}>
              <div className="pj-agenda__date">
                <span className="neo-hud">{WEEKDAYS[parseIso(d).getDay()]}</span>
                <span className="pj-agenda__num">{parseIso(d).getDate()}</span>
              </div>
              <div className="pj-agenda__items">
                {byDay.get(d)!.map((t) => (
                  <button key={t.id} type="button" className={cx('pj-pill', t.completedAt && 'is-done', !t.completedAt && d < today && 'is-overdue', t.kind === 'milestone' && 'is-ms')} onClick={() => ui.openTask(t.id)}>
                    {t.kind === 'milestone' && <Diamond />}
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="pj-cal neo-pad">
      {header}
      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="pj-cal__grid" role="grid" aria-label={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="pj-cal__dow" role="columnheader">
              {d}
            </div>
          ))}
          {days.map((d) => (
            <DayCell
              key={d}
              day={d}
              inMonth={d.slice(0, 7) === cursor.slice(0, 7)}
              today={today}
              tasks={byDay.get(d) ?? []}
              project={project}
              canEdit={canEdit}
              onAdd={(el) => {
                setTitle('');
                setAdding({ day: d, el });
              }}
              onMore={(el) => setMore({ day: d, el })}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {active ? (
            <div className="pj-pill is-overlay">
              <span className="truncate">{active.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <NeoPopover open={!!adding} anchor={adding?.el ?? null} onClose={() => setAdding(null)} placement="bottom-start" width={300} label="Add a task">
        <form
          className="pj-wipform"
          onSubmit={(e) => {
            e.preventDefault();
            addTask();
          }}
        >
          <label className="neo-field">
            <span className="neo-label">New task · due {adding ? formatDue(adding.day) : ''}</span>
            <input className="neo-input neo-input--sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus />
          </label>
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm neo-btn--block" disabled={!title.trim()}>
            Add task
          </button>
        </form>
      </NeoPopover>
      <NeoPopover open={!!more} anchor={more?.el ?? null} onClose={() => setMore(null)} placement="bottom-start" width={280} label="Tasks this day">
        <div className="neo-menu__label">{more ? formatDue(more.day) : ''}</div>
        {(more ? (byDay.get(more.day) ?? []) : []).map((t) => (
          <button
            key={t.id}
            type="button"
            className="neo-menu__item"
            onClick={() => {
              setMore(null);
              ui.openTask(t.id);
            }}
          >
            <span className="neo-mono neo-faint">{taskKey(project, t)}</span>
            <span className={cx('grow truncate', t.completedAt && 'pj-strike')}>{t.title}</span>
          </button>
        ))}
      </NeoPopover>
    </div>
  );
}

function DayCell({ day, inMonth, today, tasks, project, canEdit, onAdd, onMore }: { day: string; inMonth: boolean; today: string; tasks: Task[]; project: Project; canEdit: boolean; onAdd: (el: HTMLElement) => void; onMore: (el: HTMLElement) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}`, disabled: !canEdit });
  const shown = tasks.slice(0, 3);
  const isDue = day === project.dueDate;
  return (
    <div
      ref={setNodeRef}
      className={cx('pj-cal__cell', !inMonth && 'is-out', day === today && 'is-today', isOver && 'is-over', day < today && 'is-past')}
      role="gridcell"
      aria-label={formatDue(day)}
      onClick={(e) => {
        if (canEdit && (e.target as HTMLElement).classList.contains('pj-cal__cell')) onAdd(e.currentTarget);
      }}
    >
      <div className="pj-cal__date">
        <span className="pj-cal__num">{parseIso(day).getDate()}</span>
        {isDue && <span className="pj-cal__due">Project due</span>}
        {canEdit && (
          <button type="button" className="pj-cal__add" aria-label={`Add task on ${formatDue(day)}`} onClick={(e) => onAdd(e.currentTarget)}>
            <Plus />
          </button>
        )}
      </div>
      {shown.map((t) => (
        <CalPill key={t.id} task={t} day={day} today={today} disabled={!canEdit} />
      ))}
      {tasks.length > 3 && (
        <button type="button" className="pj-cal__more" onClick={(e) => onMore(e.currentTarget)}>
          +{tasks.length - 3} more
        </button>
      )}
    </div>
  );
}

function CalPill({ task, day, today, disabled }: { task: Task; day: string; today: string; disabled: boolean }) {
  const ui = useProjectsUI();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cx('pj-pill', task.completedAt && 'is-done', !task.completedAt && day < today && 'is-overdue', task.kind === 'milestone' && 'is-ms', isDragging && 'is-ghost', ui.taskId === task.id && 'is-open')}
      onClick={(e) => {
        e.stopPropagation();
        ui.openTask(task.id);
      }}
      {...attributes}
      {...listeners}
      title={task.title}
    >
      {task.kind === 'milestone' && <Diamond />}
      <span className="truncate">{task.title}</span>
      <UserAvatar id={task.assigneeId} size={16} />
    </button>
  );
}
