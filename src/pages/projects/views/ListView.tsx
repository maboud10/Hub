/**
 * List — sections with sortable rows, inline edits, multi-select + bulk bar,
 * sort & group, keyboard (j/k, x select, Enter open, e edit, Delete).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, CircleCheckBig, FolderInput, GripVertical, Layers, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2, UserRound, X, CalendarDays, Flag } from 'lucide-react';
import { NeoMenu, PeoplePicker, type MenuEntry } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { canCompleteTask, canEditProject } from '@/projects/access';
import { addDays, startOfWeek, todayIso } from '@/projects/dates';
import { openBlockers } from '@/projects/graph';
import { taskKey } from '@/projects/metrics';
import { PRIORITY_NAME, parseQuickAdd } from '@/projects/nlp';
import { useProjects } from '@/projects/store';
import type { Priority, Project, Section, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectsUI, useUsersMap } from '../ctx';
import { BlockedBadge, ConfirmModal, DatePicker, DueChip, KindGlyph, PriorityGlyph, PriorityMenu, PRIORITIES, TaskCheck, UserAvatar } from '../ui';
import { useTaskActions } from '../MyWork';
import { applyFilters, useMultiContainer, type Containers, type Filters } from './shared';

type SortKey = 'manual' | 'due' | 'priority' | 'title' | 'updated';
type GroupKey = 'section' | 'assignee' | 'priority' | 'due';
const PRANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

interface Group {
  id: string;
  label: ReactNode;
  section?: Section;
  ids: string[];
}

export function ListView({ project, tasks, filters }: { project: Project; tasks: Task[]; filters: Filters }) {
  const actor = useActor()!;
  const ui = useProjectsUI();
  const users = useUsersMap();
  const store = useProjects.getState;
  const allTasks = useProjects((s) => s.tasks);
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const canEdit = canEditProject(project, actor);
  const [sort, setSort] = useState<SortKey>('manual');
  const [group, setGroup] = useState<GroupKey>('section');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const filtered = useMemo(() => applyFilters(tasks, filters, actor.id, project), [tasks, filters, actor.id, project]);
  const dnd = canEdit && sort === 'manual' && group === 'section';

  const sorter = useMemo(() => {
    const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
      manual: (a, b) => a.order - b.order,
      due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
      priority: (a, b) => PRANK[a.priority] - PRANK[b.priority],
      title: (a, b) => a.title.localeCompare(b.title),
      updated: (a, b) => b.updatedAt - a.updatedAt,
    };
    return cmp[sort];
  }, [sort]);

  const groups: Group[] = useMemo(() => {
    const ids = (list: Task[]) => [...list].sort(sorter).map((t) => t.id);
    if (group === 'section') return project.sections.map((s) => ({ id: s.id, label: s.name, section: s, ids: ids(filtered.filter((t) => t.sectionId === s.id)) }));
    if (group === 'assignee') {
      const keys = [...new Set(filtered.map((t) => t.assigneeId ?? 'none'))].sort((a, b) => (a === 'none' ? 1 : b === 'none' ? -1 : (users.get(a)?.name ?? '').localeCompare(users.get(b)?.name ?? '')));
      return keys.map((k) => ({
        id: `a-${k}`,
        label: (
          <span className="pj-glabel">
            <UserAvatar id={k === 'none' ? null : k} size={18} /> {k === 'none' ? 'Unassigned' : users.get(k)?.name}
          </span>
        ),
        ids: ids(filtered.filter((t) => (t.assigneeId ?? 'none') === k)),
      }));
    }
    if (group === 'priority')
      return PRIORITIES.map((p) => ({
        id: `p-${p}`,
        label: (
          <span className="pj-glabel">
            <PriorityGlyph priority={p} /> {PRIORITY_NAME[p]}
          </span>
        ),
        ids: ids(filtered.filter((t) => t.priority === p)),
      })).filter((g) => g.ids.length);
    const today = todayIso();
    const weekEnd = addDays(startOfWeek(today), 6);
    const bucket = (t: Task) => (!t.dueDate ? 'none' : t.completedAt ? 'done' : t.dueDate < today ? 'overdue' : t.dueDate === today ? 'today' : t.dueDate <= weekEnd ? 'week' : 'later');
    const labels: Record<string, string> = { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later', none: 'No date', done: 'Completed' };
    return ['overdue', 'today', 'week', 'later', 'none', 'done']
      .map((k) => ({ id: `d-${k}`, label: labels[k], ids: ids(filtered.filter((t) => bucket(t) === k)) }))
      .filter((g) => g.ids.length);
  }, [group, project.sections, filtered, sorter, users]);

  const source: Containers = useMemo(() => Object.fromEntries(groups.filter((g) => g.section).map((g) => [g.id, g.ids])), [groups]);
  const commit = (id: string, container: string, index: number, list: string[]) => {
    const full = tasks
      .filter((x) => x.sectionId === container && x.id !== id)
      .sort((a, b) => a.order - b.order)
      .map((x) => x.id);
    const after = list[index + 1];
    const before = list[index - 1];
    const fullIndex = after ? full.indexOf(after) : before ? full.indexOf(before) + 1 : full.length;
    const r = store().moveTask(id, { sectionId: container, index: Math.max(0, fullIndex) });
    if (!r.ok) toast.error(r.error);
  };
  const { items, activeId, sensors, collision, handlers } = useMultiContainer(source, commit);
  const shownIds = (g: Group) => (dnd ? (items[g.id] ?? g.ids) : g.ids);
  const flat = groups.flatMap((g) => (collapsed[g.id] ? [] : shownIds(g)));

  // drop selection of tasks that disappeared
  useEffect(() => {
    setSelected((s) => {
      const n = new Set([...s].filter((id) => byId.has(id)));
      return n.size === s.size ? s : n;
    });
  }, [byId]);

  const toggleSel = (id: string, range = false) => {
    setSelected((s) => {
      const n = new Set(s);
      if (range && focus && flat.includes(focus)) {
        const [a, b] = [flat.indexOf(focus), flat.indexOf(id)].sort((x, y) => x - y);
        flat.slice(a, b + 1).forEach((x) => n.add(x));
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setFocus(id);
  };

  const removeSelected = (ids: string[]) => {
    const r = store().deleteTasks(ids);
    if (!r.ok) return toast.error(r.error);
    setSelected(new Set());
    const snap = r.snapshot;
    pushUndo(`Deleted ${snap.tasks.length} ${snap.tasks.length === 1 ? 'task' : 'tasks'}${r.skipped ? ` (${r.skipped} skipped)` : ''}`, () => store().restoreTasks(snap));
  };

  useHotkeys({
    j: () => setFocus((f) => flat[Math.min(flat.length - 1, f ? flat.indexOf(f) + 1 : 0)] ?? null),
    k: () => setFocus((f) => flat[Math.max(0, f ? flat.indexOf(f) - 1 : 0)] ?? null),
    x: () => focus && toggleSel(focus),
    enter: () => {
      if (focus && !document.activeElement?.closest('button, input, textarea, a')) ui.openTask(focus);
    },
    e: (ev) => {
      if (focus && canEdit) {
        ev.preventDefault();
        setEditing(focus);
      }
    },
    delete: () => canEdit && (selected.size ? removeSelected([...selected]) : focus && removeSelected([focus])),
    backspace: () => canEdit && (selected.size ? removeSelected([...selected]) : focus && removeSelected([focus])),
  });
  useEffect(() => {
    if (focus) document.querySelector(`[data-lrow="${focus}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focus]);

  const active = activeId ? byId.get(activeId) : undefined;
  const sortLabel: Record<SortKey, string> = { manual: 'Manual', due: 'Due date', priority: 'Priority', title: 'Title', updated: 'Recently updated' };
  const groupLabel: Record<GroupKey, string> = { section: 'Section', assignee: 'Assignee', priority: 'Priority', due: 'Due date' };

  const body = (
    <div className="pj-list" role="grid" aria-label="Tasks" aria-multiselectable>
      <div className="pj-list__head" role="row">
        <span />
        <span className="pj-list__h pj-list__h--title">Task</span>
        <span className="pj-list__h pj-col-assignee">Assignee</span>
        <span className="pj-list__h pj-col-due">Due</span>
        <span className="pj-list__h pj-col-prio">Priority</span>
        <span className="pj-list__h pj-col-tags">Tags</span>
      </div>
      {groups.map((g) => (
        <ListGroup
          key={g.id}
          project={project}
          group={g}
          ids={shownIds(g)}
          byId={byId}
          canEdit={canEdit}
          dnd={dnd}
          collapsed={!!collapsed[g.id]}
          onCollapse={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
          selected={selected}
          focus={focus}
          editing={editing}
          setEditing={setEditing}
          onSelect={toggleSel}
          onFocus={setFocus}
        />
      ))}
      {groups.length === 0 && <div className="pj-list__empty">No tasks match these filters.</div>}
      {canEdit && group === 'section' && <AddSection project={project} />}
    </div>
  );

  return (
    <div className="pj-listwrap neo-pad">
      <div className="pj-subbar">
        <NeoMenu
          label="Sort"
          width={220}
          items={(Object.keys(sortLabel) as SortKey[]).map((k) => ({ label: sortLabel[k], checked: sort === k, onSelect: () => setSort(k) }))}
          trigger={(p) => (
            <button {...p} type="button" className="pj-fchip">
              <ArrowUpDown /> Sort: {sortLabel[sort]}
            </button>
          )}
        />
        <NeoMenu
          label="Group"
          width={220}
          items={(Object.keys(groupLabel) as GroupKey[]).map((k) => ({ label: groupLabel[k], checked: group === k, onSelect: () => setGroup(k) }))}
          trigger={(p) => (
            <button {...p} type="button" className="pj-fchip">
              <Layers /> Group: {groupLabel[group]}
            </button>
          )}
        />
        {!dnd && canEdit && <span className="neo-faint text-xs">Drag to reorder works with manual sort, grouped by section.</span>}
        <span className="grow" />
        <span className="neo-faint text-xs pj-keys">
          <kbd className="kbd">x</kbd> select <kbd className="kbd">e</kbd> rename <kbd className="kbd">⌫</kbd> delete
        </span>
      </div>
      {dnd ? (
        <DndContext sensors={sensors} collisionDetection={collision} {...handlers}>
          {body}
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>{active ? <div className="pj-lrow pj-lrow--overlay"><span /><span className="pj-lrow__title">{active.title}</span></div> : null}</DragOverlay>
        </DndContext>
      ) : (
        body
      )}
      {selected.size > 0 && <BulkBar project={project} ids={[...selected]} onClear={() => setSelected(new Set())} onDelete={() => removeSelected([...selected])} />}
    </div>
  );
}

/* ───────────────────────── group ───────────────────────── */

function ListGroup(props: {
  project: Project;
  group: Group;
  ids: string[];
  byId: Map<string, Task>;
  canEdit: boolean;
  dnd: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  selected: Set<string>;
  focus: string | null;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onSelect: (id: string, range?: boolean) => void;
  onFocus: (id: string) => void;
}) {
  const { project, group, ids, byId, canEdit, dnd, collapsed } = props;
  const store = useProjects.getState;
  const { setNodeRef, isOver } = useDroppable({ id: group.id, disabled: !dnd });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.section?.name ?? '');
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const sec = group.section;
  const idx = sec ? project.sections.findIndex((s) => s.id === sec.id) : -1;
  const done = ids.filter((id) => byId.get(id)?.completedAt).length;

  const menu: MenuEntry[] = sec
    ? [
        { label: 'Rename section', icon: <Pencil />, onSelect: () => setRenaming(true) },
        { label: 'Add task', icon: <Plus />, onSelect: () => setAdding(true) },
        { label: 'Move up', icon: <ArrowUp />, disabled: idx <= 0, onSelect: () => store().moveSection(project.id, sec.id, idx - 1) },
        { label: 'Move down', icon: <ArrowDown />, disabled: idx >= project.sections.length - 1, onSelect: () => store().moveSection(project.id, sec.id, idx + 1) },
        { kind: 'sep' },
        { label: 'Delete section', icon: <Trash2 />, danger: true, disabled: project.sections.length <= 1, onSelect: () => setConfirm(true) },
      ]
    : [];
  const commitName = () => {
    setRenaming(false);
    if (sec && name.trim() && name.trim() !== sec.name) toast.result(store().updateSection(project.id, sec.id, { name }), 'Section renamed');
  };

  return (
    <div className={cx('pj-lgroup', isOver && 'is-over')} data-stage={sec?.stage}>
      <div className="pj-lgroup__head">
        <button type="button" className="pj-lgroup__toggle" onClick={props.onCollapse} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand' : 'Collapse'}>
          <ChevronDown className={cx('pj-chev', collapsed && 'is-closed')} />
        </button>
        {renaming ? (
          <input className="neo-input neo-input--sm pj-lgroup__rename" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} aria-label="Section name" />
        ) : (
          <h3 className="pj-lgroup__name" onDoubleClick={() => sec && canEdit && setRenaming(true)}>
            {group.label}
          </h3>
        )}
        <span className="neo-count">{ids.length}</span>
        {done > 0 && <span className="neo-faint text-xs">{done} done</span>}
        <span className="grow" />
        {sec && canEdit && (
          <>
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Add task to ${sec.name}`} onClick={() => setAdding(true)}>
              <Plus />
            </button>
            <NeoMenu
              items={menu}
              width={210}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`${sec.name} actions`}>
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        )}
      </div>
      {!collapsed && (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="pj-lgroup__rows" ref={setNodeRef}>
            {ids.map((id) => {
              const t = byId.get(id);
              return t ? (
                <ListRow
                  key={id}
                  task={t}
                  project={project}
                  byId={byId}
                  dnd={dnd}
                  canEdit={canEdit}
                  selected={props.selected.has(id)}
                  focused={props.focus === id}
                  editing={props.editing === id}
                  setEditing={props.setEditing}
                  onSelect={props.onSelect}
                  onFocus={props.onFocus}
                />
              ) : null;
            })}
            {ids.length === 0 && dnd && <div className="pj-lgroup__drop">Drop tasks here</div>}
          </div>
        </SortableContext>
      )}
      {sec && canEdit && !collapsed && (adding ? <AddRow project={project} section={sec} onDone={() => setAdding(false)} /> : <button type="button" className="pj-addrow" onClick={() => setAdding(true)}><Plus /> Add task</button>)}
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title={`Delete “${sec?.name}”?`} confirmLabel="Delete section" danger onConfirm={() => sec && toast.result(store().deleteSection(project.id, sec.id), 'Section deleted')}>
        {ids.length ? `Its ${ids.length} tasks move to another section.` : 'The section is empty.'}
      </ConfirmModal>
    </div>
  );
}

/* ───────────────────────── row ───────────────────────── */

function ListRow({
  task,
  project,
  byId,
  dnd,
  canEdit,
  selected,
  focused,
  editing,
  setEditing,
  onSelect,
  onFocus,
}: {
  task: Task;
  project: Project;
  byId: Map<string, Task>;
  dnd: boolean;
  canEdit: boolean;
  selected: boolean;
  focused: boolean;
  editing: boolean;
  setEditing: (id: string | null) => void;
  onSelect: (id: string, range?: boolean) => void;
  onFocus: (id: string) => void;
}) {
  const ui = useProjectsUI();
  const actor = useActor()!;
  const users = useUsersMap();
  const actions = useTaskActions();
  const update = useProjects((s) => s.updateTask);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !dnd });
  const [title, setTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      setTitle(task.title);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, task.title]);
  const blockers = openBlockers(task, byId);
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const canDone = canCompleteTask(task, project, actor);
  const save = () => {
    setEditing(null);
    const v = title.trim();
    if (v && v !== task.title) {
      const r = update(task.id, { title: v });
      if (!r.ok) toast.error(r.error);
    }
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('pj-lrow', selected && 'is-selected', focused && 'is-focused', isDragging && 'is-ghost', task.completedAt && 'is-done', ui.taskId === task.id && 'is-open')}
      role="row"
      aria-selected={selected}
      data-lrow={task.id}
      onClick={(e) => {
        onFocus(task.id);
        if (e.shiftKey || e.metaKey || e.ctrlKey) onSelect(task.id, e.shiftKey);
        else if (!editing) ui.openTask(task.id);
      }}
    >
      <span className="pj-lrow__lead">
        {dnd && (
          <span className="pj-lrow__grip" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} aria-label="Drag to reorder">
            <GripVertical />
          </span>
        )}
        <input type="checkbox" className="neo-check pj-lrow__sel" checked={selected} aria-label={`Select ${task.title}`} onClick={(e) => e.stopPropagation()} onChange={() => onSelect(task.id)} />
        <TaskCheck done={!!task.completedAt} size={18} kind={task.kind} disabled={!canDone} onToggle={(e) => actions.toggle(task, e)} />
      </span>
      <span className="pj-lrow__title">
        <span className="neo-mono pj-lrow__key">{taskKey(project, task)}</span>
        <KindGlyph kind={task.kind} />
        {editing ? (
          <input
            ref={inputRef}
            className="pj-lrow__edit"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(null);
              }
            }}
            aria-label="Task title"
          />
        ) : (
          <span className="pj-lrow__text truncate" onDoubleClick={(e) => (canEdit ? (e.stopPropagation(), setEditing(task.id)) : undefined)}>
            {task.title}
          </span>
        )}
        <BlockedBadge count={blockers.length} />
        {task.subtasks.length > 0 && (
          <span className="pj-lrow__meta">
            <CircleCheckBig /> {doneSubs}/{task.subtasks.length}
          </span>
        )}
        {task.comments.length > 0 && (
          <span className="pj-lrow__meta">
            <MessageSquare /> {task.comments.length}
          </span>
        )}
      </span>
      <span className="pj-lrow__cell pj-col-assignee" onClick={(e) => e.stopPropagation()}>
        <PeoplePicker
          value={task.assigneeId ? [task.assigneeId] : []}
          onChange={(ids) => {
            const r = update(task.id, { assigneeId: ids[0] ?? null });
            if (!r.ok) toast.error(r.error);
          }}
          allowNone
          label="Assignee"
          trigger={(p) => (
            <button {...p} type="button" className="pj-cellbtn" disabled={!canEdit}>
              <UserAvatar id={task.assigneeId} size={22} />
              <span className="truncate">{task.assigneeId ? users.get(task.assigneeId)?.name.split(' ')[0] : <span className="neo-faint">—</span>}</span>
            </button>
          )}
        />
      </span>
      <span className="pj-lrow__cell pj-col-due" onClick={(e) => e.stopPropagation()}>
        <DatePicker
          value={task.dueDate}
          onChange={(v) => {
            const r = update(task.id, { dueDate: v });
            if (!r.ok) toast.error(r.error);
          }}
          trigger={(p) => (
            <button {...p} type="button" className="pj-cellbtn" disabled={!canEdit}>
              {task.dueDate ? <DueChip due={task.dueDate} time={task.dueTime} done={!!task.completedAt} /> : <span className="neo-faint">—</span>}
            </button>
          )}
        />
      </span>
      <span className="pj-lrow__cell pj-col-prio" onClick={(e) => e.stopPropagation()}>
        <PriorityMenu
          value={task.priority}
          disabled={!canEdit}
          onChange={(p) => actions.priority(task, p)}
          trigger={(p) => (
            <button {...p} type="button" className="pj-cellbtn" disabled={!canEdit}>
              <PriorityGlyph priority={task.priority} />
              <span className={cx(task.priority === 'none' && 'neo-faint')}>{task.priority === 'none' ? '—' : PRIORITY_NAME[task.priority]}</span>
            </button>
          )}
        />
      </span>
      <span className="pj-lrow__cell pj-col-tags">
        {task.tags.slice(0, 2).map((t) => (
          <span key={t} className="pj-tag">
            {t}
          </span>
        ))}
        {task.tags.length > 2 && <span className="neo-faint text-xs">+{task.tags.length - 2}</span>}
      </span>
    </div>
  );
}

/* ───────────────────────── add row / section ───────────────────────── */

function AddRow({ project, section, onDone }: { project: Project; section: Section; onDone: () => void }) {
  const actor = useActor()!;
  const users = useHub((s) => s.users);
  const create = useProjects((s) => s.createTask);
  const [v, setV] = useState('');
  const submit = () => {
    const parsed = parseQuickAdd(v, { now: Date.now(), users: users.filter((u) => u.active), projects: [], meId: actor.id });
    if (!parsed.title) return;
    const r = create({ title: parsed.title, projectId: project.id, sectionId: section.id, assigneeId: parsed.assigneeId ?? null, dueDate: parsed.dueDate, dueTime: parsed.dueTime, priority: parsed.priority, tags: parsed.tags });
    if (!r.ok) return toast.error(r.error);
    setV('');
  };
  return (
    <div className="pj-addrow pj-addrow--open">
      <Plus />
      <input
        className="pj-addrow__input"
        autoFocus
        value={v}
        placeholder="Task name — dates, @people, !priority and +tags work"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !v.trim() && onDone()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
        aria-label={`New task in ${section.name}`}
      />
    </div>
  );
}

function AddSection({ project }: { project: Project }) {
  const add = useProjects((s) => s.addSection);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const submit = () => {
    if (v.trim() && toast.result(add(project.id, v), 'Section added')) setV('');
    setOpen(false);
  };
  return open ? (
    <div className="pj-addsection">
      <input className="neo-input neo-input--sm" autoFocus value={v} placeholder="Section name" onChange={(e) => setV(e.target.value)} onBlur={submit} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="New section name" />
    </div>
  ) : (
    <button type="button" className="pj-addsection__btn" onClick={() => setOpen(true)}>
      <Plus /> Add section
    </button>
  );
}

/* ───────────────────────── bulk bar ───────────────────────── */

function BulkBar({ project, ids, onClear, onDelete }: { project: Project; ids: string[]; onClear: () => void; onDelete: () => void }) {
  const store = useProjects.getState;
  const n = ids.length;
  const done = (r: { ok: true; changed: number; skipped: number } | { ok: false; error: string }, label: string) => {
    if (!r.ok) return toast.error(r.error);
    toast.success(`${label} ${r.changed} ${r.changed === 1 ? 'task' : 'tasks'}`, r.skipped ? `${r.skipped} skipped — no permission` : undefined);
  };
  return (
    <div className="pj-bulk" role="toolbar" aria-label="Bulk actions">
      <span className="pj-bulk__n">
        <span className="neo-count neo-count--app">{n}</span> selected
      </span>
      <button
        type="button"
        className="neo-btn neo-btn--ghost neo-btn--sm"
        onClick={() => {
          const before = ids.filter((id) => !store().tasks.find((t) => t.id === id)?.completedAt);
          done(store().bulkComplete(ids, true), 'Completed');
          pushUndo(`Completed ${before.length} tasks`, () => store().bulkComplete(before, false));
        }}
      >
        <Check /> Complete
      </button>
      <PeoplePicker
        value={[]}
        onChange={(sel) => done(store().bulkUpdate(ids, { assigneeId: sel[0] ?? null }), 'Reassigned')}
        allowNone
        label="Assign selected"
        placement="top-start"
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
            <UserRound /> Assign
          </button>
        )}
      />
      <DatePicker
        onChange={(v) => done(store().bulkUpdate(ids, { dueDate: v }), 'Rescheduled')}
        placement="top-start"
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
            <CalendarDays /> Due
          </button>
        )}
      />
      <NeoMenu
        label="Move to section"
        placement="top-start"
        width={220}
        items={project.sections.map((s) => ({ label: s.name, onSelect: () => done(store().bulkMove(ids, s.id), 'Moved') }))}
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
            <FolderInput /> Move
          </button>
        )}
      />
      <PriorityMenu
        value="none"
        onChange={(pr) => done(store().bulkUpdate(ids, { priority: pr }), 'Updated')}
        trigger={(p) => (
          <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm">
            <Flag /> Priority
          </button>
        )}
      />
      <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" onClick={onDelete}>
        <Trash2 /> Delete
      </button>
      <button type="button" className="neo-iconbtn" aria-label="Clear selection" onClick={onClear}>
        <X />
      </button>
    </div>
  );
}
