/**
 * Board — columns are sections. Drag cards (dnd-kit) between columns; landing
 * in a Done column completes the task. WIP limits glow amber/rose.
 */
import { useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, CircleCheckBig, Gauge, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { NeoMenu, NeoPopover, type MenuEntry } from '@/components/neo';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { canCompleteTask, canEditProject } from '@/projects/access';
import { openBlockers } from '@/projects/graph';
import { taskKey } from '@/projects/metrics';
import { parseQuickAdd } from '@/projects/nlp';
import { useProjects } from '@/projects/store';
import type { Project, Section, SectionStage, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectsUI } from '../ctx';
import { BlockedBadge, ConfirmModal, DueChip, KindGlyph, PriorityGlyph, TaskCheck, UserAvatar } from '../ui';
import { useTaskActions } from '../MyWork';
import { applyFilters, useMultiContainer, type Containers, type Filters } from './shared';

export function BoardView({ project, tasks, filters }: { project: Project; tasks: Task[]; filters: Filters }) {
  const actor = useActor()!;
  const store = useProjects.getState;
  const allTasks = useProjects((s) => s.tasks);
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const canEdit = canEditProject(project, actor);
  const filtered = useMemo(() => applyFilters(tasks, filters, actor.id, project), [tasks, filters, actor.id, project]);
  const source: Containers = useMemo(
    () =>
      Object.fromEntries(
        project.sections.map((s) => [
          s.id,
          filtered
            .filter((t) => t.sectionId === s.id)
            .sort((a, b) => a.order - b.order)
            .map((t) => t.id),
        ]),
      ),
    [project.sections, filtered],
  );

  const commit = (id: string, container: string, index: number, list: string[]) => {
    const t = byId.get(id);
    if (!t) return;
    const full = tasks
      .filter((x) => x.sectionId === container && x.id !== id)
      .sort((a, b) => a.order - b.order)
      .map((x) => x.id);
    const after = list[index + 1];
    const before = list[index - 1];
    const fullIndex = after ? full.indexOf(after) : before ? full.indexOf(before) + 1 : full.length;
    const fromSection = t.sectionId;
    const fromIndex = tasks
      .filter((x) => x.sectionId === fromSection)
      .sort((a, b) => a.order - b.order)
      .findIndex((x) => x.id === id);
    const r = store().moveTask(id, { sectionId: container, index: Math.max(0, fullIndex) });
    if (!r.ok) return toast.error(r.error);
    if (fromSection !== container) {
      const sec = project.sections.find((s) => s.id === container);
      pushUndo(`${taskKey(project, t)} → ${sec?.name}`, () => fromSection && store().moveTask(id, { sectionId: fromSection, index: fromIndex }));
    }
  };
  const { items, activeId, sensors, collision, handlers } = useMultiContainer(source, commit);
  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} {...handlers}>
      <div className="pj-board" role="list" aria-label="Board columns">
        {project.sections.map((sec, i) => (
          <Column key={sec.id} project={project} section={sec} index={i} ids={items[sec.id] ?? []} byId={byId} canEdit={canEdit} dragging={!!activeId} />
        ))}
        {canEdit && <AddColumn project={project} />}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>{active ? <Card task={active} project={project} byId={byId} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

/* ───────────────────────── column ───────────────────────── */

function Column({ project, section, index, ids, byId, canEdit, dragging }: { project: Project; section: Section; index: number; ids: string[]; byId: Map<string, Task>; canEdit: boolean; dragging: boolean }) {
  const store = useProjects.getState;
  const { setNodeRef, isOver } = useDroppable({ id: section.id, disabled: !canEdit });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const [wipOpen, setWipOpen] = useState(false);
  const [wip, setWip] = useState(String(section.wip ?? ''));
  const [confirm, setConfirm] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const open = ids.filter((id) => !byId.get(id)?.completedAt).length;
  const wipState = section.wip ? (open > section.wip ? 'over' : open === section.wip ? 'at' : undefined) : undefined;
  const total = project.sections.length;

  const setStage = (stage: SectionStage) => toast.result(store().updateSection(project.id, section.id, { stage }), `${section.name} is now a${stage === 'doing' ? 'n in-progress' : stage === 'done' ? ' done' : ' to-do'} column`);
  const menu: MenuEntry[] = [
    { label: 'Rename', icon: <Pencil />, onSelect: () => setRenaming(true) },
    { label: 'Set WIP limit', icon: <Gauge />, onSelect: () => setWipOpen(true) },
    { kind: 'label', label: 'Column type' },
    { label: 'To do', checked: (section.stage ?? 'todo') === 'todo', onSelect: () => setStage('todo') },
    { label: 'In progress', checked: section.stage === 'doing', onSelect: () => setStage('doing') },
    { label: 'Done — completes tasks', checked: section.stage === 'done', onSelect: () => setStage('done') },
    { kind: 'sep' },
    { label: 'Move left', icon: <ArrowLeft />, disabled: index === 0, onSelect: () => store().moveSection(project.id, section.id, index - 1) },
    { label: 'Move right', icon: <ArrowRight />, disabled: index === total - 1, onSelect: () => store().moveSection(project.id, section.id, index + 1) },
    { kind: 'sep' },
    { label: 'Delete column', icon: <Trash2 />, danger: true, disabled: total <= 1, onSelect: () => setConfirm(true) },
  ];

  const commitName = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== section.name) toast.result(store().updateSection(project.id, section.id, { name }), 'Column renamed');
    else setName(section.name);
  };

  return (
    <section className={cx('pj-col', isOver && 'is-over', dragging && 'is-dragging')} data-stage={section.stage ?? 'todo'} data-wip={wipState} role="listitem" aria-label={section.name}>
      <header className="pj-col__head">
        <span className="pj-col__dot" />
        {renaming ? (
          <input
            className="neo-input neo-input--sm pj-col__rename"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setName(section.name);
                setRenaming(false);
              }
            }}
            aria-label="Column name"
          />
        ) : (
          <h3 className="pj-col__name" onDoubleClick={() => canEdit && setRenaming(true)} title={canEdit ? 'Double-click to rename' : undefined}>
            {section.name}
          </h3>
        )}
        <span className="pj-col__count" title={section.wip ? `WIP limit ${section.wip}` : undefined}>
          {open}
          {section.wip ? <span className="pj-col__wip">/{section.wip}</span> : null}
        </span>
        <span className="grow" />
        {canEdit && (
          <NeoMenu
            items={menu}
            width={230}
            trigger={(p) => (
              <button
                {...p}
                ref={(el) => {
                  menuBtn.current = el;
                  if (typeof p.ref === 'function') p.ref(el);
                  else if (p.ref) (p.ref as { current: HTMLButtonElement | null }).current = el;
                }}
                type="button"
                className="neo-iconbtn neo-iconbtn--sm"
                aria-label={`${section.name} column actions`}
              >
                <MoreHorizontal />
              </button>
            )}
          />
        )}
      </header>
      {wipState === 'over' && <div className="pj-col__warn">Over the WIP limit — finish something before starting more.</div>}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="pj-col__body" ref={setNodeRef}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableCard key={id} task={t} project={project} byId={byId} disabled={!canEdit} /> : null;
          })}
          {ids.length === 0 && <div className="pj-col__empty">{canEdit ? 'Drop tasks here' : 'No tasks'}</div>}
        </div>
      </SortableContext>
      {canEdit && section.stage !== 'done' && <QuickAdd project={project} section={section} />}

      <NeoPopover open={wipOpen} anchor={menuBtn.current} onClose={() => setWipOpen(false)} placement="bottom-end" width={240} label="WIP limit">
        <form
          className="pj-wipform"
          onSubmit={(e) => {
            e.preventDefault();
            const n = wip ? Number(wip) : 0;
            if (toast.result(store().updateSection(project.id, section.id, { wip: n }), n ? `WIP limit ${n}` : 'WIP limit removed')) setWipOpen(false);
          }}
        >
          <label className="neo-field">
            <span className="neo-label">WIP limit for {section.name}</span>
            <input className="neo-input neo-input--sm" inputMode="numeric" value={wip} onChange={(e) => setWip(e.target.value.replace(/\D/g, ''))} placeholder="No limit" autoFocus />
          </label>
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm neo-btn--block">
            Save
          </button>
        </form>
      </NeoPopover>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete “${section.name}”?`}
        confirmLabel="Delete column"
        danger
        onConfirm={() => toast.result(store().deleteSection(project.id, section.id), 'Column deleted')}
      >
        {ids.length ? `Its ${ids.length} tasks move to the first column. Automations that watch this column are paused.` : 'The column is empty.'}
      </ConfirmModal>
    </section>
  );
}

/* ───────────────────────── cards ───────────────────────── */

function SortableCard({ task, project, byId, disabled }: { task: Task; project: Project; byId: Map<string, Task>; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('pj-cardwrap', isDragging && 'is-ghost')} {...attributes} {...listeners}>
      <Card task={task} project={project} byId={byId} />
    </div>
  );
}

function Card({ task, project, byId, overlay }: { task: Task; project: Project; byId: Map<string, Task>; overlay?: boolean }) {
  const ui = useProjectsUI();
  const actor = useActor()!;
  const actions = useTaskActions();
  const blockers = openBlockers(task, byId);
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const canDone = canCompleteTask(task, project, actor);
  return (
    <article
      className={cx('pj-card neo-spot', overlay && 'is-overlay', task.completedAt && 'is-done', task.kind === 'milestone' && 'is-ms', ui.taskId === task.id && 'is-open')}
      data-p={task.priority}
      onClick={() => ui.openTask(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && ui.openTask(task.id)}
      tabIndex={overlay ? -1 : 0}
      aria-label={task.title}
      data-task={task.id}
    >
      <div className="pj-card__top">
        <PriorityGlyph priority={task.priority} />
        <span className="neo-mono pj-card__key">{taskKey(project, task)}</span>
        <KindGlyph kind={task.kind} />
        <BlockedBadge count={blockers.length} />
        <span className="grow" />
        <span className="pj-card__check" onPointerDown={(e) => e.stopPropagation()}>
          <TaskCheck done={!!task.completedAt} size={18} kind={task.kind} disabled={!canDone || (task.kind === 'approval' && task.approval?.state === 'pending' && task.approval.approverId !== actor.id)} onToggle={(e) => actions.toggle(task, e)} />
        </span>
      </div>
      <div className="pj-card__title">{task.title}</div>
      {task.kind === 'approval' && task.approval && (
        <span className="pj-card__approval" data-state={task.approval.state}>
          <ShieldCheck /> {task.approval.state === 'pending' ? 'Awaiting approval' : task.approval.state === 'approved' ? 'Approved' : task.approval.state === 'changes' ? 'Changes requested' : 'Rejected'}
        </span>
      )}
      {task.tags.length > 0 && (
        <div className="pj-card__tags">
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} className="pj-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      {task.subtasks.length > 0 && (
        <div className="pj-card__progress" title={`${doneSubs}/${task.subtasks.length} subtasks`}>
          <span style={{ width: `${(doneSubs / task.subtasks.length) * 100}%` }} />
        </div>
      )}
      <div className="pj-card__foot">
        <DueChip due={task.dueDate} time={task.dueTime} done={!!task.completedAt} />
        {task.subtasks.length > 0 && (
          <span className="pj-card__meta">
            <CircleCheckBig /> {doneSubs}/{task.subtasks.length}
          </span>
        )}
        {task.comments.length > 0 && (
          <span className="pj-card__meta">
            <MessageSquare /> {task.comments.length}
          </span>
        )}
        {task.attachments.length > 0 && (
          <span className="pj-card__meta">
            <Paperclip /> {task.attachments.length}
          </span>
        )}
        <span className="grow" />
        <UserAvatar id={task.assigneeId} size={24} />
      </div>
    </article>
  );
}

/* ───────────────────────── quick add ───────────────────────── */

function QuickAdd({ project, section }: { project: Project; section: Section }) {
  const actor = useActor()!;
  const users = useHub((s) => s.users);
  const create = useProjects((s) => s.createTask);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const submit = () => {
    const parsed = parseQuickAdd(v, { now: Date.now(), users: users.filter((u) => u.active), projects: [], meId: actor.id });
    if (!parsed.title) return;
    const r = create({ title: parsed.title, projectId: project.id, sectionId: section.id, assigneeId: parsed.assigneeId ?? null, dueDate: parsed.dueDate, dueTime: parsed.dueTime, priority: parsed.priority, tags: parsed.tags });
    if (!r.ok) return toast.error(r.error);
    setV('');
  };
  if (!open)
    return (
      <button type="button" className="pj-col__add" onClick={() => setOpen(true)} data-qa={`add-${section.id}`}>
        <Plus /> Add task
      </button>
    );
  return (
    <div className="pj-col__addbox">
      <textarea
        className="neo-textarea pj-col__addinput"
        autoFocus
        rows={2}
        value={v}
        placeholder="Task name — try “tomorrow @priya !high”"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
            setV('');
          }
        }}
        onBlur={() => !v.trim() && setOpen(false)}
        aria-label={`New task in ${section.name}`}
      />
      <div className="pj-col__addacts">
        <span className="neo-faint text-xs">↵ add · Esc close</span>
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!v.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function AddColumn({ project }: { project: Project }) {
  const add = useProjects((s) => s.addSection);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const submit = () => {
    if (!v.trim()) return setOpen(false);
    if (toast.result(add(project.id, v), 'Column added')) {
      setV('');
      setOpen(false);
    }
  };
  return (
    <div className="pj-col pj-col--add">
      {open ? (
        <input
          className="neo-input neo-input--sm"
          autoFocus
          value={v}
          placeholder="Column name"
          onChange={(e) => setV(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-label="New column name"
        />
      ) : (
        <button type="button" className="pj-col__addcol" onClick={() => setOpen(true)}>
          <Plus /> Add column
        </button>
      )}
    </div>
  );
}
