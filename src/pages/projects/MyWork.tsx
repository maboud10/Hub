/**
 * My Work — what to do now, what is at risk, what is blocked.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheckBig,
  Copy,
  ExternalLink,
  Hourglass,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { CountUp, NeoEmpty, NeoHead, NeoMenu, Ring, Spark, useContextMenu, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { canCompleteTask, canDecideApproval, canDeleteTask, canEditTask } from '@/projects/access';
import { DAY, addDays, diffDays, formatDue, parseIso, startOfWeek, todayIso, WEEKDAYS, MONTHS } from '@/projects/dates';
import { openBlockers } from '@/projects/graph';
import { dailyDone, projectMetrics, taskKey } from '@/projects/metrics';
import { useProjects } from '@/projects/store';
import type { Project, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectMap, useProjectsUI, useUsersMap, useVisibleProjects, useVisibleTasks } from './ctx';
import { IconMyWork } from './icons';
import { BlockedBadge, DatePicker, DueChip, KindGlyph, PriorityGlyph, ProjectGlyph, StatusPill, TaskCheck, UserAvatar, priorityEntries } from './ui';
import { QuickCapture } from './QuickCapture';
import { FocusRunway } from './FocusRunway';

type GroupId = 'overdue' | 'today' | 'week' | 'later' | 'none';
const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'none', label: 'No date' },
];

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ───────────── shared task actions ───────────── */

export function useTaskActions() {
  const complete = useProjects((s) => s.completeTask);
  const update = useProjects((s) => s.updateTask);
  const del = useProjects((s) => s.deleteTasks);
  const restore = useProjects((s) => s.restoreTasks);
  const projects = useProjectMap();
  return useMemo(
    () => ({
      toggle(t: Task, e?: ReactMouseEvent | { clientX: number; clientY: number }) {
        const wasDone = !!t.completedAt;
        const r = complete(t.id, !wasDone);
        if (!r.ok) return toast.error(r.error);
        const key = taskKey(t.projectId ? projects.get(t.projectId) : undefined, t);
        if (!wasDone) {
          if (r.milestone && e) burstConfetti({ x: e.clientX, y: e.clientY });
          pushUndo(`Completed ${key}`, () => complete(t.id, false));
        }
      },
      snooze(t: Task, due: string | undefined) {
        const r = update(t.id, { dueDate: due });
        if (!r.ok) return toast.error(r.error);
        const prev = t.dueDate;
        pushUndo(due ? `Snoozed to ${formatDue(due)}` : 'Due date cleared', () => update(t.id, { dueDate: prev }));
      },
      remove(t: Task) {
        const r = del([t.id]);
        if (!r.ok) return toast.error(r.error);
        const snap = r.snapshot;
        pushUndo(`Deleted “${t.title.slice(0, 40)}”`, () => restore(snap));
      },
      priority(t: Task, p: Task['priority']) {
        const r = update(t.id, { priority: p });
        if (!r.ok) toast.error(r.error);
      },
    }),
    [complete, update, del, restore, projects],
  );
}

export function snoozeEntries(t: Task, snooze: (t: Task, due: string | undefined) => void, pick: () => void): MenuEntry[] {
  const today = todayIso();
  const tomorrow = addDays(today, 1);
  const nextMon = addDays(startOfWeek(today), 7);
  return [
    { kind: 'label', label: 'Snooze until' },
    { label: 'Tomorrow', icon: <AlarmClock />, hint: WEEKDAYS[parseIso(tomorrow).getDay()], onSelect: () => snooze(t, tomorrow) },
    { label: 'Next week', icon: <CalendarClock />, hint: `Mon ${parseIso(nextMon).getDate()} ${MONTHS[parseIso(nextMon).getMonth()]}`, onSelect: () => snooze(t, nextMon) },
    { label: 'Pick a date…', icon: <CalendarClock />, onSelect: pick },
  ];
}

/* ───────────── task row ───────────── */

export function TaskRow({
  task,
  project,
  selected,
  onSelect,
  showProject = true,
  muted,
}: {
  task: Task;
  project: Project | undefined;
  selected?: boolean;
  onSelect?: () => void;
  showProject?: boolean;
  muted?: boolean;
}) {
  const ui = useProjectsUI();
  const actor = useActor();
  const actions = useTaskActions();
  const navigate = useNavigate();
  const allTasks = useProjects((s) => s.tasks);
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const ctx = useContextMenu();
  const [leaving, setLeaving] = useState(false);
  const pickRef = useRef<HTMLButtonElement>(null);
  const blockers = openBlockers(task, byId);
  const canDone = actor ? canCompleteTask(task, project, actor) : false;
  const canEdit = actor ? canEditTask(task, project, actor) : false;
  const key = taskKey(project, task);
  const doneSubs = task.subtasks.filter((s) => s.done).length;

  const toggle = (e: ReactMouseEvent) => {
    if (!task.completedAt) {
      setLeaving(true);
      const pos = { clientX: e.clientX, clientY: e.clientY };
      window.setTimeout(() => {
        actions.toggle(task, pos);
        setLeaving(false);
      }, 420);
    } else actions.toggle(task, e);
  };

  const menu: MenuEntry[] = [
    { label: 'Open', icon: <ExternalLink />, hint: '↵', onSelect: () => ui.openTask(task.id) },
    { label: task.completedAt ? 'Mark incomplete' : 'Complete', icon: <Check />, hint: 'x', disabled: !canDone, onSelect: () => actions.toggle(task) },
    ...(canEdit ? snoozeEntries(task, actions.snooze, () => pickRef.current?.click()) : []),
    ...(canEdit ? [{ kind: 'label' as const, label: 'Priority' }, ...priorityEntries(task.priority, (p) => actions.priority(task, p))] : []),
    { kind: 'sep' },
    ...(project ? [{ label: `Open ${project.key}`, icon: <ArrowRight />, onSelect: () => navigate(`/projects/p/${project.id}`) }] : []),
    {
      label: 'Copy link',
      icon: <Copy />,
      onSelect: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}${task.projectId ? `/projects/p/${task.projectId}?task=${task.id}` : `/projects?task=${task.id}`}`);
        toast.success('Link copied');
      },
    },
    ...(actor && canDeleteTask(task, project, actor) ? [{ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => actions.remove(task) }] : []),
  ];

  return (
    <div
      className={cx('pj-row', selected && 'is-selected', task.completedAt && 'is-done', leaving && 'is-leaving', muted && 'is-muted', ui.taskId === task.id && 'is-open')}
      onClick={() => {
        onSelect?.();
        ui.openTask(task.id);
      }}
      onContextMenu={(e) => ctx.open(e, menu)}
      role="row"
      aria-selected={selected}
      data-task={task.id}
    >
      <TaskCheck done={!!task.completedAt || leaving} onToggle={toggle} disabled={!canDone} kind={task.kind} reason="You can’t complete this task" label={`${task.completedAt ? 'Reopen' : 'Complete'} ${task.title}`} />
      <div className="pj-row__main">
        <div className="pj-row__title">
          <KindGlyph kind={task.kind} />
          <span className="truncate">{task.title}</span>
        </div>
        <div className="pj-row__meta">
          {showProject && (
            <span className="pj-row__proj">
              <ProjectGlyph project={project} size={14} />
              <span className="neo-mono">{key}</span>
            </span>
          )}
          <BlockedBadge count={blockers.length} />
          {task.subtasks.length > 0 && (
            <span className="pj-row__sub" title="Subtasks">
              <CircleCheckBig /> {doneSubs}/{task.subtasks.length}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="pj-row__sub" title="Comments">
              <MessageSquare /> {task.comments.length}
            </span>
          )}
          {task.tags.slice(0, 2).map((t) => (
            <span key={t} className="pj-tag">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="pj-row__end">
        <PriorityGlyph priority={task.priority} />
        <DueChip due={task.dueDate} time={task.dueTime} done={!!task.completedAt} />
        {canEdit && !task.completedAt && (
          <span className="pj-row__hover" onClick={(e) => e.stopPropagation()}>
            <NeoMenu
              label="Snooze"
              items={snoozeEntries(task, actions.snooze, () => pickRef.current?.click()).slice(1)}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Snooze" data-tip="Snooze">
                  <AlarmClock />
                </button>
              )}
            />
            <DatePicker
              value={task.dueDate}
              onChange={(v) => actions.snooze(task, v)}
              placement="bottom-end"
              trigger={(p) => <button {...p} ref={(el) => { (p.ref as React.MutableRefObject<HTMLButtonElement | null>).current = el; pickRef.current = el; }} type="button" className="pj-hidden-trigger" tabIndex={-1} aria-hidden="true" />}
            />
            <NeoMenu
              items={menu}
              width={240}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="More actions">
                  <MoreHorizontal />
                </button>
              )}
            />
          </span>
        )}
      </div>
      {ctx.element}
    </div>
  );
}

/* ───────────── screen ───────────── */

export function MyWork() {
  const actor = useActor();
  const ui = useProjectsUI();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const now = useNow(60_000);
  const users = useUsersMap();
  const projectsList = useVisibleProjects();
  const projects = useProjectMap();
  const tasks = useVisibleTasks();
  const allTasks = useProjects((s) => s.tasks);
  const decide = useProjects((s) => s.decideApproval);
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true });
  const [sel, setSel] = useState(0);
  const [changes, setChanges] = useState<Task | null>(null);
  const [note, setNote] = useState('');
  const captureRef = useRef<HTMLDivElement>(null);
  const autoPlan = params.get('plan') === '1';
  const today = todayIso(now);
  const weekEnd = addDays(startOfWeek(today), 6);
  const me = actor ? users.get(actor.id) : undefined;

  // ?new=task focuses the capture box
  useEffect(() => {
    if (params.get('new') === 'task') {
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-capture="main"]')?.focus());
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('new');
          return n;
        },
        { replace: true },
      );
    }
  }, [params, setParams]);

  const mine = useMemo(
    () =>
      tasks.filter(
        (t) => t.assigneeId === actor?.id && !(t.kind === 'approval' && t.approval?.state === 'pending' && t.approval.approverId === actor?.id),
      ),
    [tasks, actor],
  );
  const open = mine.filter((t) => !t.completedAt);
  const doneToday = mine.filter((t) => t.completedAt && todayIso(t.completedAt) === today).sort((a, b) => b.completedAt! - a.completedAt!);

  const grouped = useMemo(() => {
    const g: Record<GroupId, Task[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    for (const t of open) {
      if (!t.dueDate) g.none.push(t);
      else if (t.dueDate < today) g.overdue.push(t);
      else if (t.dueDate === today) g.today.push(t);
      else if (t.dueDate <= weekEnd) g.week.push(t);
      else g.later.push(t);
    }
    const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    for (const k of Object.keys(g) as GroupId[])
      g[k].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || rank[a.priority] - rank[b.priority] || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'));
    return g;
  }, [open, today, weekEnd]);

  const flat = useMemo(() => GROUPS.flatMap((g) => (collapsed[g.id] ? [] : grouped[g.id])), [grouped, collapsed]);
  useEffect(() => setSel((i) => Math.min(i, Math.max(0, flat.length - 1))), [flat.length]);

  const approvals = useMemo(
    () =>
      tasks
        .filter((t) => t.kind === 'approval' && t.approval?.state === 'pending' && t.approval.approverId === actor?.id && !t.completedAt)
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [tasks, actor],
  );
  const blocked = open.filter((t) => openBlockers(t, byId).length > 0);
  const waiting = useMemo(
    () =>
      tasks
        .filter((t) => !t.completedAt && t.creatorId === actor?.id && t.assigneeId && t.assigneeId !== actor?.id && t.kind !== 'approval')
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        .slice(0, 4),
    [tasks, actor],
  );
  const myApprovalsWaiting = useMemo(
    () => tasks.filter((t) => t.kind === 'approval' && t.approval?.state === 'pending' && t.creatorId === actor?.id && t.approval.approverId !== actor?.id),
    [tasks, actor],
  );

  const doneSpark = useMemo(() => dailyDone(mine, now, 8), [mine, now]);
  const doneThisWeek = mine.filter((t) => t.completedAt && t.completedAt >= parseIso(startOfWeek(today)).getTime()).length;
  const dueThisWeek = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length;

  const leading = useMemo(() => {
    const owned = projectsList.filter((p) => p.ownerId === actor?.id);
    const list = owned.length ? owned : projectsList.filter((p) => p.members.some((m) => m.userId === actor?.id));
    return { owned: owned.length > 0, list: list.slice(0, 5) };
  }, [projectsList, actor]);

  const activity = useMemo(() => {
    const items: { id: string; at: number; actorId: string; text: string; task: Task }[] = [];
    for (const t of tasks) {
      if (!t.projectId) continue;
      for (const a of t.activity.slice(-3)) items.push({ id: `${t.id}-${a.id}`, at: a.at, actorId: a.actorId, text: a.text, task: t });
      for (const c of t.comments.slice(-2)) items.push({ id: `${t.id}-${c.id}`, at: c.at, actorId: c.authorId, text: 'commented', task: t });
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 7);
  }, [tasks]);

  const actions = useTaskActions();
  useHotkeys({
    j: () => setSel((i) => Math.min(flat.length - 1, i + 1)),
    k: () => setSel((i) => Math.max(0, i - 1)),
    arrowdown: (e) => {
      if (!flat.length || document.activeElement?.closest('.pj-panel, .neo-pop')) return;
      e.preventDefault();
      setSel((i) => Math.min(flat.length - 1, i + 1));
    },
    arrowup: (e) => {
      if (!flat.length || document.activeElement?.closest('.pj-panel, .neo-pop')) return;
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    },
    x: () => {
      const t = flat[sel];
      if (!t) return;
      const el = document.querySelector(`[data-task="${t.id}"] .pj-check`);
      const r = el?.getBoundingClientRect();
      actions.toggle(t, r ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } : undefined);
    },
    enter: () => {
      const t = flat[sel];
      if (t && !document.activeElement?.closest('button, a, input, textarea')) ui.openTask(t.id);
    },
    p: () => document.querySelector<HTMLButtonElement>('[data-qa="plan-day"]')?.click(),
  });

  // keep the selected row in view
  useEffect(() => {
    const t = flat[sel];
    if (t) document.querySelector(`[data-task="${t.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel, flat]);

  const subParts = [
    grouped.overdue.length ? `${grouped.overdue.length} overdue` : null,
    `${grouped.today.length} due today`,
    approvals.length ? `${approvals.length} ${approvals.length === 1 ? 'approval' : 'approvals'} waiting` : null,
  ].filter(Boolean);
  const d = new Date(now);

  const scrollTo = (id: GroupId) => {
    setCollapsed((c) => ({ ...c, [id]: false }));
    requestAnimationFrame(() => document.getElementById(`pj-g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const approve = (t: Task) => {
    const r = decide(t.id, 'approved');
    if (toast.result(r, `Approved ${taskKey(t.projectId ? projects.get(t.projectId) : undefined, t)}`)) burstConfetti();
  };

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={<IconMyWork />}
        eyebrow={
          <>
            My work · {WEEKDAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
          </>
        }
        title={`${greeting(d)}, ${me?.name.split(' ')[0] ?? 'there'}`}
        sub={subParts.join(' · ')}
        actions={
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => ui.quickAdd({})} data-qa="new-task" data-tip="New task  C" data-tip-pos="bottom">
            <Plus /> <span className="neo-btn__label">Add task</span>
          </button>
        }
      />
      <div className="neo-body neo-pad pj-home-body">
        <div className="pj-home">
          <div className="pj-home__main">
            <div className="pj-stats neo-stagger" role="list" aria-label="Your numbers">
              <button type="button" className="pj-stat" style={{ ['--i' as string]: 0 }} onClick={() => scrollTo('today')} role="listitem">
                <span className="neo-hud">Due today</span>
                <span className="pj-stat__v neo-num">
                  <CountUp value={grouped.today.length} />
                </span>
                <span className="pj-stat__cap">{grouped.today.filter((t) => t.priority === 'urgent' || t.priority === 'high').length} high priority</span>
              </button>
              <button type="button" className="pj-stat" data-tone={grouped.overdue.length ? 'danger' : undefined} style={{ ['--i' as string]: 1 }} onClick={() => scrollTo('overdue')} role="listitem">
                <span className="neo-hud">Overdue</span>
                <span className="pj-stat__v neo-num">
                  <CountUp value={grouped.overdue.length} />
                </span>
                <span className="pj-stat__cap">{grouped.overdue.length ? `oldest ${-diffDays(today, grouped.overdue[0].dueDate!)}d late` : 'all clear'}</span>
              </button>
              <button type="button" className="pj-stat" style={{ ['--i' as string]: 2 }} onClick={() => scrollTo('week')} role="listitem">
                <span className="neo-hud">This week</span>
                <span className="pj-stat__v neo-num">
                  <CountUp value={dueThisWeek} />
                </span>
                <span className="pj-stat__cap">due by Sunday</span>
              </button>
              <div className="pj-stat pj-stat--spark" style={{ ['--i' as string]: 3 }} role="listitem">
                <span className="neo-hud">Done this week</span>
                <span className="pj-stat__v neo-num">
                  <CountUp value={doneThisWeek} />
                </span>
                <Spark data={doneSpark} width={96} height={26} className="pj-stat__spark" />
              </div>
            </div>

            <div ref={captureRef}>
              <QuickCapture variant="hero" />
            </div>

            <FocusRunway
              tasks={open}
              projects={projects}
              autoPlan={autoPlan}
              onAutoPlanned={() =>
                setParams(
                  (p) => {
                    const n = new URLSearchParams(p);
                    n.delete('plan');
                    return n;
                  },
                  { replace: true },
                )
              }
            />

            <section className="pj-section" aria-label="My tasks">
              <div className="neo-section-head">
                <h2 className="neo-title">My tasks</h2>
                <span className="neo-count">{open.length}</span>
                <span className="pj-keys neo-faint">
                  <kbd className="kbd">j</kbd>
                  <kbd className="kbd">k</kbd> move <kbd className="kbd">x</kbd> complete <kbd className="kbd">↵</kbd> open
                </span>
              </div>
              {open.length === 0 && doneToday.length === 0 && (
                <NeoEmpty icon={<CircleCheckBig />} title="Nothing on your plate" compact action={<button type="button" className="neo-btn neo-btn--soft" onClick={() => document.querySelector<HTMLInputElement>('[data-capture="main"]')?.focus()}><Plus /> Capture a task</button>}>
                  Tasks assigned to you show up here, grouped by when they’re due.
                </NeoEmpty>
              )}
              <div className="pj-groups" role="grid" aria-label="Tasks by due date">
                {GROUPS.map((g) => {
                  const list = grouped[g.id];
                  if (!list.length) return null;
                  const isCollapsed = !!collapsed[g.id];
                  return (
                    <div key={g.id} className="pj-group" data-group={g.id} id={`pj-g-${g.id}`}>
                      <button type="button" className="pj-group__head" onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))} aria-expanded={!isCollapsed}>
                        <ChevronDown className={cx('pj-chev', isCollapsed && 'is-closed')} />
                        <span className="pj-group__name">{g.label}</span>
                        <span className="neo-count" data-tone={g.id}>
                          {list.length}
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="pj-group__rows">
                          {list.map((t) => (
                            <TaskRow key={t.id} task={t} project={t.projectId ? projects.get(t.projectId) : undefined} selected={flat[sel]?.id === t.id} onSelect={() => setSel(flat.findIndex((x) => x.id === t.id))} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {doneToday.length > 0 && (
                  <div className="pj-group pj-group--done">
                    <button type="button" className="pj-group__head" onClick={() => setCollapsed((c) => ({ ...c, done: !c.done }))} aria-expanded={!collapsed.done}>
                      <ChevronDown className={cx('pj-chev', collapsed.done && 'is-closed')} />
                      <span className="pj-group__name">Completed today</span>
                      <span className="neo-count">{doneToday.length}</span>
                    </button>
                    {!collapsed.done && (
                      <div className="pj-group__rows">
                        {doneToday.map((t) => (
                          <TaskRow key={t.id} task={t} project={t.projectId ? projects.get(t.projectId) : undefined} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <div className="pj-duo">
              <section className="neo-card pj-mini" aria-label="Blocked and waiting">
                <div className="neo-section-head">
                  <Hourglass className="pj-ico" />
                  <h2 className="neo-title">Blocked &amp; waiting</h2>
                  <span className="neo-count">{blocked.length + waiting.length + myApprovalsWaiting.length}</span>
                </div>
                {blocked.length + waiting.length + myApprovalsWaiting.length === 0 && <p className="neo-faint text-sm">Nothing is holding you up. Nice.</p>}
                <ul className="pj-mini__list">
                  {blocked.map((t) => {
                    const bl = openBlockers(t, byId);
                    const b = bl[0];
                    const bp = b.projectId ? projects.get(b.projectId) : undefined;
                    return (
                      <li key={t.id}>
                        <button type="button" className="pj-mini__item" onClick={() => ui.openTask(t.id)}>
                          <Lock className="pj-mini__ico is-danger" />
                          <span className="grow truncate">
                            <span className="pj-mini__title">{t.title}</span>
                            <span className="pj-mini__sub">
                              Waiting on <span className="neo-mono">{taskKey(bp, b)}</span> · {users.get(b.assigneeId ?? '')?.name.split(' ')[0] ?? 'unassigned'}
                              {bl.length > 1 ? ` +${bl.length - 1}` : ''}
                            </span>
                          </span>
                          <UserAvatar id={b.assigneeId} size={22} />
                        </button>
                      </li>
                    );
                  })}
                  {myApprovalsWaiting.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="pj-mini__item" onClick={() => ui.openTask(t.id)}>
                        <ShieldCheck className="pj-mini__ico" />
                        <span className="grow truncate">
                          <span className="pj-mini__title">{t.title}</span>
                          <span className="pj-mini__sub">Awaiting {users.get(t.approval!.approverId)?.name.split(' ')[0]}’s approval</span>
                        </span>
                        <UserAvatar id={t.approval!.approverId} size={22} />
                      </button>
                    </li>
                  ))}
                  {waiting.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="pj-mini__item" onClick={() => ui.openTask(t.id)}>
                        <Hourglass className="pj-mini__ico" />
                        <span className="grow truncate">
                          <span className="pj-mini__title">{t.title}</span>
                          <span className="pj-mini__sub">
                            With {users.get(t.assigneeId ?? '')?.name.split(' ')[0]}
                            {t.dueDate ? ` · due ${formatDue(t.dueDate)}` : ''}
                          </span>
                        </span>
                        <UserAvatar id={t.assigneeId} size={22} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="neo-card pj-mini" aria-label="Approvals for you">
                <div className="neo-section-head">
                  <ShieldCheck className="pj-ico" />
                  <h2 className="neo-title">Approvals for you</h2>
                  <span className={cx('neo-count', approvals.length > 0 && 'neo-count--app')}>{approvals.length}</span>
                </div>
                {approvals.length === 0 && <p className="neo-faint text-sm">No approvals waiting on you.</p>}
                <ul className="pj-approvals">
                  {approvals.map((t) => {
                    const p = t.projectId ? projects.get(t.projectId) : undefined;
                    const can = actor ? canDecideApproval(t, p, actor) : false;
                    const bl = openBlockers(t, byId);
                    return (
                      <li key={t.id} className="pj-approval">
                        <button type="button" className="pj-approval__main" onClick={() => ui.openTask(t.id)}>
                          <UserAvatar id={t.creatorId} size={30} />
                          <span className="grow" style={{ minWidth: 0 }}>
                            <span className="pj-mini__title truncate" style={{ display: 'block' }}>
                              {t.title}
                            </span>
                            <span className="pj-mini__sub">
                              {users.get(t.creatorId)?.name.split(' ')[0]} · <span className="neo-mono">{taskKey(p, t)}</span>
                              {t.dueDate ? ` · ${formatDue(t.dueDate)}` : ''}
                              {bl.length ? ' · blocked' : ''}
                            </span>
                          </span>
                        </button>
                        <div className="pj-approval__acts">
                          <button type="button" className="neo-btn neo-btn--success neo-btn--xs" disabled={!can} onClick={() => approve(t)} data-qa="approve">
                            <Check /> Approve
                          </button>
                          <button
                            type="button"
                            className="neo-btn neo-btn--ghost neo-btn--xs"
                            disabled={!can}
                            onClick={() => {
                              setNote('');
                              setChanges(t);
                            }}
                          >
                            <Undo2 /> Changes
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>

          <aside className="pj-home__side" aria-label="Projects and activity">
            <section className="neo-card pj-lead">
              <div className="neo-section-head">
                <h2 className="neo-title">{leading.owned ? 'Projects you lead' : 'Your projects'}</h2>
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate('/projects/browse')}>
                  All <ArrowRight />
                </button>
              </div>
              {leading.list.length === 0 && <p className="neo-faint text-sm">You’re not on any projects yet.</p>}
              <ul className="pj-lead__list">
                {leading.list.map((p) => {
                  const pt = allTasks.filter((t) => t.projectId === p.id);
                  const m = projectMetrics(p, pt, now);
                  const nextMs = pt.filter((t) => t.kind === 'milestone' && !t.completedAt && t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
                  return (
                    <li key={p.id}>
                      <button type="button" className="pj-lead__item neo-spot" onClick={() => navigate(`/projects/p/${p.id}`)}>
                        <Ring value={m.progress} size={44} stroke={4}>
                          <span style={{ fontSize: 11 }}>{Math.round(m.progress * 100)}</span>
                        </Ring>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="pj-lead__name truncate">
                            <ProjectGlyph project={p} size={16} /> {p.name}
                          </span>
                          <span className="pj-lead__meta">
                            <StatusPill status={p.status} />
                            {nextMs && <span className="neo-faint text-xs truncate">◆ {formatDue(nextMs.dueDate!)}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="neo-card pj-activity">
              <div className="neo-section-head">
                <h2 className="neo-title">Recent activity</h2>
              </div>
              <ol className="pj-feed">
                {activity.map((a) => {
                  const p = a.task.projectId ? projects.get(a.task.projectId) : undefined;
                  return (
                    <li key={a.id}>
                      <button type="button" className="pj-feed__item" onClick={() => ui.openTask(a.task.id)}>
                        <UserAvatar id={a.actorId} size={24} />
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="pj-feed__text">
                            <strong>{a.actorId === 'automation' ? 'Automation' : (users.get(a.actorId)?.name.split(' ')[0] ?? 'Someone')}</strong> {a.text}
                          </span>
                          <span className="pj-feed__sub truncate">
                            <span className="neo-mono">{taskKey(p, a.task)}</span> {a.task.title}
                          </span>
                        </span>
                        <span className="pj-feed__time">{relativeTime(a.at)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          </aside>
        </div>
      </div>

      <Modal
        open={!!changes}
        onClose={() => setChanges(null)}
        title="Request changes"
        subtitle={changes?.title}
        width={460}
        className="neo-portal pj-modal"
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setChanges(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              disabled={!note.trim()}
              onClick={() => {
                if (!changes) return;
                if (toast.result(decide(changes.id, 'changes', note), 'Change request sent')) setChanges(null);
              }}
            >
              Send
            </button>
          </>
        }
      >
        <label className="neo-field">
          <span className="neo-label">What needs to change?</span>
          <textarea className="neo-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Be specific so they can turn it around quickly." data-autofocus />
        </label>
      </Modal>
    </>
  );
}

export const _unused = { X, DAY };
