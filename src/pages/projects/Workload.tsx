/**
 * Workload — people × the next 6 weeks. Each cell is estimated hours against
 * a 32h capacity (heat = load level). Click a cell to see the work behind it,
 * drag a task onto another person to rebalance (or use Reassign), and let
 * Nova suggest a rebalance that keeps everyone at or under capacity.
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { ArrowRight, Check, ChevronDown, GripVertical, Info, Plus, Sparkles, UserRoundCog, X } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoMenu, NeoSearch, NovaChip, PeoplePicker, Typing, useTypewriter } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import { actorFrom, canEditTask, canViewProject, memberRole } from '@/projects/access';
import { formatDue, shortDate, todayIso } from '@/projects/dates';
import { taskKey } from '@/projects/metrics';
import { useProjects } from '@/projects/store';
import type { Project, Task } from '@/projects/types';
import { CAPACITY, WEEKS, distribute, loadLevel, suggestRebalance, weekStarts, workloadMatrix, type LoadTask, type Suggestion } from '@/projects/workload';
import { pushUndo, useActor, useProjectMap, useProjectsUI, useUsersMap, useVisibleProjects } from './ctx';
import { IconWorkload as Gauge } from './icons';
import { PriorityGlyph, ProjectGlyph, UserAvatar } from './ui';

type Scope = 'everyone' | 'reports' | 'department';
const LEVEL_LABEL = { idle: 'Free', light: 'Light', balanced: 'Balanced', full: 'Full', over: 'Over capacity' } as const;

export function WorkloadScreen() {
  const actor = useActor();
  const ui = useProjectsUI();
  const now = useNow(60_000);
  const users = useUsersMap();
  const roles = useHub((s) => s.roles);
  const projects = useVisibleProjects();
  const projectMap = useProjectMap();
  const allTasks = useProjects((s) => s.tasks);
  const updateTask = useProjects((s) => s.updateTask);
  const [scope, setScope] = useState<Scope>('everyone');
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [cell, setCell] = useState<{ userId: string; week: number } | null>(null);
  const [dragTask, setDragTask] = useState<string | null>(null);
  const [dropUser, setDropUser] = useState<string | null>(null);
  const [nova, setNova] = useState<'idle' | 'thinking' | 'ready'>('idle');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const today = todayIso(now);
  const weeks = useMemo(() => weekStarts(today, WEEKS), [today]);

  const scopedProjects = useMemo(() => projects.filter((p) => !projectFilter.length || projectFilter.includes(p.id)), [projects, projectFilter]);
  const tasks = useMemo(() => {
    const ids = new Set(scopedProjects.map((p) => p.id));
    return allTasks.filter((t) => t.projectId && ids.has(t.projectId) && !t.completedAt);
  }, [allTasks, scopedProjects]);

  const people = useMemo(() => {
    const ids = new Set<string>();
    for (const p of scopedProjects) for (const m of p.members) ids.add(m.userId);
    for (const t of tasks) if (t.assigneeId) ids.add(t.assigneeId);
    let list = [...ids].map((id) => users.get(id)).filter((u): u is User => !!u && u.active);
    if (scope === 'reports') list = list.filter((u) => u.managerId === actor?.id);
    if (scope === 'department') list = list.filter((u) => u.department === actor?.department);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((u) => `${u.name} ${u.title} ${u.department}`.toLowerCase().includes(s));
    return list;
  }, [scopedProjects, tasks, users, scope, actor, q]);

  const loadTasks: LoadTask[] = useMemo(
    () => tasks.map((t) => ({ id: t.id, title: t.title, assigneeId: t.assigneeId, estimate: t.estimate, startDate: t.startDate, dueDate: t.dueDate, done: !!t.completedAt, priority: t.priority })),
    [tasks],
  );
  const matrix = useMemo(() => workloadMatrix(loadTasks, people.map((u) => u.id), weeks, today), [loadTasks, people, weeks, today]);
  const rows = useMemo(
    () =>
      [...people].sort((a, b) => {
        const pa = Math.max(...(matrix.get(a.id)?.hours ?? [0]));
        const pb = Math.max(...(matrix.get(b.id)?.hours ?? [0]));
        return pb - pa || a.name.localeCompare(b.name);
      }),
    [people, matrix],
  );
  const tasksById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const unestimated = tasks.filter((t) => t.assigneeId && (!t.estimate || !t.dueDate));
  const overCells = rows.reduce((n, u) => n + (matrix.get(u.id)?.hours.filter((h) => h > CAPACITY).length ?? 0), 0);
  const teamTotals = weeks.map((_, w) => rows.reduce((a, u) => a + (matrix.get(u.id)?.hours[w] ?? 0), 0));

  // who may receive a task: active people who can see its project
  const canSee = useMemo(() => {
    const cache = new Map<string, boolean>();
    return (userId: string, p: Project) => {
      const k = `${userId}:${p.id}`;
      if (!cache.has(k)) {
        const u = users.get(userId);
        cache.set(k, !!u && u.active && canViewProject(p, actorFrom(u, effectivePermissions(u, roles))));
      }
      return cache.get(k)!;
    };
  }, [users, roles]);

  // invalidate stale Nova suggestions when the data changes underneath
  useEffect(() => {
    setSuggestions((s) => s.filter((x) => tasksById.get(x.taskId)?.assigneeId === x.from));
  }, [tasksById]);

  if (!actor) return null;

  const reassign = (taskId: string, toUser: string, silent = false) => {
    const t = tasksById.get(taskId);
    if (!t || !t.projectId) return false;
    const p = projectMap.get(t.projectId);
    if (!p) return false;
    if (t.assigneeId === toUser) return false;
    if (!canSee(toUser, p)) {
      toast.error(`${users.get(toUser)?.name.split(' ')[0] ?? 'They'} can’t see ${p.key}`, 'Add them to the project first.');
      return false;
    }
    const from = t.assigneeId;
    const r = updateTask(taskId, { assigneeId: toUser });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    if (!silent) {
      toast.success(`${taskKey(p, t)} → ${users.get(toUser)?.name.split(' ')[0]}`, t.title);
      pushUndo(`Reassigned ${taskKey(p, t)}`, () => updateTask(taskId, { assigneeId: from }));
    }
    return true;
  };

  const runNova = () => {
    setNova('thinking');
    setCell(null);
    window.setTimeout(() => {
      const ids = new Set(rows.map((u) => u.id));
      const res = suggestRebalance(loadTasks, matrix, weeks, today, (lt) => {
        const t = tasksById.get(lt.id);
        const p = t?.projectId ? projectMap.get(t.projectId) : undefined;
        if (!t || !p || !canEditTask(t, p, actor)) return [];
        return p.members.map((m) => m.userId).filter((id) => ids.has(id) && memberRole(p, id) !== 'viewer' && canSee(id, p));
      });
      setSuggestions(res);
      setNova('ready');
    }, 900);
  };

  const applyAll = () => {
    const done: { taskId: string; from: string }[] = [];
    for (const s of suggestions) if (reassign(s.taskId, s.to, true)) done.push({ taskId: s.taskId, from: s.from });
    if (done.length) {
      toast.success(`Rebalanced ${done.length} ${done.length === 1 ? 'task' : 'tasks'}`, 'Assignees were notified.');
      pushUndo(`Rebalanced ${done.length} ${done.length === 1 ? 'task' : 'tasks'}`, () => done.forEach((d) => updateTask(d.taskId, { assigneeId: d.from })));
    }
    setSuggestions([]);
    setNova('idle');
  };

  const onDropUser = (e: DragEvent, userId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/x-task') || dragTask;
    setDropUser(null);
    setDragTask(null);
    if (id) reassign(id, userId);
  };

  const selTasks = cell ? (matrix.get(cell.userId)?.tasks[cell.week] ?? []).map((id) => tasksById.get(id)).filter((t): t is Task => !!t) : [];

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={<Gauge />}
        eyebrow={
          <>
            Workload · next {WEEKS} weeks · {CAPACITY}h capacity
          </>
        }
        title="Team workload"
        sub={overCells ? `${overCells} over-capacity ${overCells === 1 ? 'week' : 'weeks'} across ${rows.length} people` : `${rows.length} people, everyone within capacity`}
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--nova" onClick={runNova} disabled={nova === 'thinking' || !rows.length} data-qa="nova-rebalance">
              <Sparkles /> <span className="neo-btn__label">{nova === 'thinking' ? 'Balancing…' : 'Rebalance'}</span>
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => ui.quickAdd({})} data-tip="New task  C" data-tip-pos="bottom">
              <Plus /> <span className="neo-btn__label">Add task</span>
            </button>
          </>
        }
      />
      <div className="neo-toolbar pj-toolbar">
        <div className="pj-seg" role="radiogroup" aria-label="People">
          {(
            [
              ['everyone', 'Everyone'],
              ['reports', 'My reports'],
              ['department', 'My department'],
            ] as [Scope, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={scope === k} className={cx(scope === k && 'is-on')} onClick={() => setScope(k)}>
              {l}
            </button>
          ))}
        </div>
        <NeoSearch value={q} onChange={setQ} size="sm" placeholder="Find a person" className="pj-filters__search" label="Find a person" />
        <NeoMenu
          label="Projects"
          width={260}
          items={[
            { label: 'All projects', checked: projectFilter.length === 0, onSelect: () => setProjectFilter([]) },
            { kind: 'sep' },
            ...projects.map((p) => ({
              label: p.name,
              icon: <ProjectGlyph project={p} size={18} />,
              checked: projectFilter.includes(p.id),
              onSelect: () => setProjectFilter((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id])),
            })),
          ]}
          trigger={(p) => (
            <button {...p} type="button" className={cx('pj-fchip', projectFilter.length > 0 && 'is-on')}>
              Projects{projectFilter.length ? ` · ${projectFilter.length}` : ''} <ChevronDown />
            </button>
          )}
        />
        <span className="grow" />
        <span className="pj-wl__legend" aria-label="Legend">
          {(['light', 'balanced', 'full', 'over'] as const).map((l) => (
            <span key={l}>
              <i data-level={l} /> {LEVEL_LABEL[l]}
            </span>
          ))}
        </span>
      </div>

      <div className="neo-body neo-pad pj-wl">
        {rows.length === 0 ? (
          <NeoEmpty
            icon={<Gauge />}
            title="No one to show"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--soft"
                onClick={() => {
                  setScope('everyone');
                  setQ('');
                  setProjectFilter([]);
                }}
              >
                Show everyone
              </button>
            }
          >
            {scope === 'reports' ? 'You have no direct reports on visible projects.' : 'No people match these filters.'}
          </NeoEmpty>
        ) : (
          <div className="pj-wl__layout">
            <div className="pj-wl__main">
              <div className="pj-wl__scroll">
                <div className="pj-wl__grid" role="grid" aria-label="Hours per person per week" style={{ ['--weeks' as string]: WEEKS }}>
                  <div className="pj-wl__corner" role="columnheader">
                    Person
                  </div>
                  {weeks.map((w, i) => (
                    <div key={w} className={cx('pj-wl__wk', i === 0 && 'is-now')} role="columnheader">
                      <span>{i === 0 ? 'This week' : i === 1 ? 'Next week' : `Wk of`}</span>
                      <strong>{shortDate(w)}</strong>
                    </div>
                  ))}
                  <div className="pj-wl__wk pj-wl__wk--total" role="columnheader">
                    <span>{WEEKS} wks</span>
                    <strong>Total</strong>
                  </div>

                  {rows.map((u) => {
                    const row = matrix.get(u.id)!;
                    const peak = Math.max(...row.hours);
                    return (
                      <div
                        key={u.id}
                        className={cx('pj-wl__row', dropUser === u.id && 'is-drop', dragTask && tasksById.get(dragTask)?.assigneeId === u.id && 'is-source')}
                        role="row"
                        onDragOver={(e) => {
                          if (!dragTask) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropUser(u.id);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropUser((v) => (v === u.id ? null : v));
                        }}
                        onDrop={(e) => onDropUser(e, u.id)}
                      >
                        <div className="pj-wl__person" role="rowheader">
                          <UserAvatar id={u.id} size={30} presence />
                          <span className="pj-wl__pname">
                            <span className="truncate">{u.name}</span>
                            <span className="pj-wl__ptitle truncate">{u.title}</span>
                          </span>
                          {peak > CAPACITY && <span className="pj-wl__peak">{Math.round(peak)}h</span>}
                        </div>
                        {row.hours.map((h, w) => {
                          const level = loadLevel(h);
                          const sel = cell?.userId === u.id && cell.week === w;
                          return (
                            <button
                              key={w}
                              type="button"
                              role="gridcell"
                              className={cx('pj-wl__cell', sel && 'is-selected')}
                              data-level={level}
                              onClick={() => {
                                setNova('idle');
                                setCell(sel ? null : { userId: u.id, week: w });
                              }}
                              aria-label={`${u.name}, week of ${shortDate(weeks[w])}: ${Math.round(h)} of ${CAPACITY} hours, ${LEVEL_LABEL[level]}`}
                              aria-pressed={sel}
                            >
                              <span className="pj-wl__h neo-num">{h > 0 ? Math.round(h) : '–'}</span>
                              {h > 0 && <span className="pj-wl__hu">h</span>}
                              <span className="pj-wl__cap" aria-hidden="true">
                                <i style={{ width: `${Math.min(100, (h / CAPACITY) * 100)}%` }} />
                              </span>
                            </button>
                          );
                        })}
                        <div className="pj-wl__total neo-num" role="gridcell">
                          {Math.round(row.total)}h
                        </div>
                      </div>
                    );
                  })}

                  <div className="pj-wl__foot" role="rowheader">
                    Team load
                  </div>
                  {teamTotals.map((h, w) => {
                    const cap = rows.length * CAPACITY;
                    return (
                      <div key={w} className="pj-wl__footcell" role="gridcell" title={`${Math.round(h)}h of ${cap}h`}>
                        <span className="neo-num">{Math.round((h / Math.max(1, cap)) * 100)}%</span>
                      </div>
                    );
                  })}
                  <div className="pj-wl__footcell" role="gridcell" />
                </div>
              </div>
              <p className="pj-wl__note neo-faint text-xs">
                <Info /> Hours are spread across working days between a task’s start (or today) and its due date. Overdue work lands in this week.
                {unestimated.length > 0 && ` ${unestimated.length} open ${unestimated.length === 1 ? 'task has' : 'tasks have'} no estimate or due date and ${unestimated.length === 1 ? 'isn’t' : 'aren’t'} counted.`}
              </p>
            </div>

            <aside className="pj-wl__side" aria-label="Details">
              {nova !== 'idle' ? (
                <NovaPanel
                  state={nova}
                  suggestions={suggestions}
                  tasksById={tasksById}
                  projects={projectMap}
                  weeks={weeks}
                  onApply={(s) => {
                    if (reassign(s.taskId, s.to)) setSuggestions((xs) => xs.filter((x) => x !== s));
                  }}
                  onSkip={(s) => setSuggestions((xs) => xs.filter((x) => x !== s))}
                  onApplyAll={applyAll}
                  onClose={() => {
                    setNova('idle');
                    setSuggestions([]);
                  }}
                />
              ) : cell ? (
                <CellPanel
                  user={users.get(cell.userId)!}
                  week={cell.week}
                  weeks={weeks}
                  hours={matrix.get(cell.userId)?.hours[cell.week] ?? 0}
                  tasks={selTasks}
                  projects={projectMap}
                  people={rows}
                  today={today}
                  canSee={canSee}
                  onClose={() => setCell(null)}
                  onDragStart={(id) => setDragTask(id)}
                  onDragEnd={() => {
                    setDragTask(null);
                    setDropUser(null);
                  }}
                  onReassign={reassign}
                />
              ) : (
                <div className="neo-card pj-wl__help">
                  <h2 className="neo-title">Reading the radar</h2>
                  <ul>
                    <li>
                      <i data-level="balanced" /> Each cell is a person’s estimated hours that week against {CAPACITY}h.
                    </li>
                    <li>
                      <i data-level="over" /> Glowing cells are over capacity — click one to see the work behind it.
                    </li>
                    <li>
                      <GripVertical /> Drag a task from the detail panel onto someone else’s row to hand it over.
                    </li>
                    <li>
                      <Sparkles /> Or ask Nova to <strong>Rebalance</strong> — it only suggests moves that keep everyone within capacity and never moves urgent work due in the next two days.
                    </li>
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

/* ───────────────────────── cell detail ───────────────────────── */

function CellPanel({
  user,
  week,
  weeks,
  hours,
  tasks,
  projects,
  people,
  today,
  canSee,
  onClose,
  onDragStart,
  onDragEnd,
  onReassign,
}: {
  user: User;
  week: number;
  weeks: string[];
  hours: number;
  tasks: Task[];
  projects: Map<string, Project>;
  people: User[];
  today: string;
  canSee: (userId: string, p: Project) => boolean;
  onClose: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onReassign: (taskId: string, userId: string) => boolean;
}) {
  const ui = useProjectsUI();
  const actor = useActor();
  const level = loadLevel(hours);
  const rows = tasks
    .map((t) => ({ t, h: distribute({ id: t.id, title: t.title, assigneeId: t.assigneeId, estimate: t.estimate, startDate: t.startDate, dueDate: t.dueDate, done: !!t.completedAt }, weeks, today)[week] }))
    .sort((a, b) => b.h - a.h);
  return (
    <div className="neo-card pj-wl__panel">
      <div className="pj-wl__panelhead">
        <UserAvatar id={user.id} size={36} presence />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="pj-wl__pname">
            <span className="truncate">{user.name}</span>
            <span className="pj-wl__ptitle">Week of {shortDate(weeks[week])}</span>
          </span>
        </span>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="pj-wl__meter" data-level={level}>
        <span className="neo-num">
          {Math.round(hours)}h <small>/ {CAPACITY}h</small>
        </span>
        <span className="pj-wl__meterlabel">{LEVEL_LABEL[level]}</span>
        <span className="pj-wl__meterbar">
          <i style={{ width: `${Math.min(100, (hours / CAPACITY) * 100)}%` }} />
          {hours > CAPACITY && <b style={{ width: `${Math.min(100, ((hours - CAPACITY) / CAPACITY) * 100)}%` }} />}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="neo-faint text-sm">No estimated work lands in this week.</p>
      ) : (
        <ul className="pj-wl__tasks">
          {rows.map(({ t, h }) => {
            const p = t.projectId ? projects.get(t.projectId) : undefined;
            const editable = !!p && !!actor && canEditTask(t, p, actor);
            const candidates = p ? people.filter((u) => u.id !== t.assigneeId && canSee(u.id, p)) : [];
            return (
              <li
                key={t.id}
                className={cx('pj-wl__task', editable && 'is-draggable')}
                draggable={editable}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/x-task', t.id);
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart(t.id);
                }}
                onDragEnd={onDragEnd}
              >
                {editable && <GripVertical className="pj-wl__grip" aria-hidden="true" />}
                <button type="button" className="pj-wl__taskmain" onClick={() => ui.openTask(t.id)}>
                  <span className="pj-wl__tasktitle">
                    <PriorityGlyph priority={t.priority} />
                    <span className="truncate">{t.title}</span>
                  </span>
                  <span className="pj-wl__taskmeta">
                    <ProjectGlyph project={p} size={14} />
                    <span className="neo-mono">{taskKey(p, t)}</span>
                    {t.dueDate && <span>due {formatDue(t.dueDate)}</span>}
                    <span>{t.estimate}h total</span>
                  </span>
                </button>
                <span className="pj-wl__taskh neo-num">{h.toFixed(h < 10 ? 1 : 0)}h</span>
                {editable && (
                  <PeoplePicker
                    value={t.assigneeId ? [t.assigneeId] : []}
                    users={candidates}
                    onChange={(ids) => ids[0] && onReassign(t.id, ids[0])}
                    label="Reassign to"
                    placement="bottom-end"
                    trigger={(pp) => (
                      <button {...pp} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Reassign ${t.title}`} data-tip="Reassign">
                        <UserRoundCog />
                      </button>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.some((r) => projects.get(r.t.projectId ?? '') && actor && canEditTask(r.t, projects.get(r.t.projectId!)!, actor)) && (
        <p className="pj-wl__hint neo-faint text-xs">
          <GripVertical /> Drag a task onto another person’s row to hand it over.
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── Nova ───────────────────────── */

function NovaPanel({
  state,
  suggestions,
  tasksById,
  projects,
  weeks,
  onApply,
  onSkip,
  onApplyAll,
  onClose,
}: {
  state: 'thinking' | 'ready' | 'idle';
  suggestions: Suggestion[];
  tasksById: Map<string, Task>;
  projects: Map<string, Project>;
  weeks: string[];
  onApply: (s: Suggestion) => void;
  onSkip: (s: Suggestion) => void;
  onApplyAll: () => void;
  onClose: () => void;
}) {
  const users = useUsersMap();
  const first = (id: string) => users.get(id)?.name.split(' ')[0] ?? 'someone';
  const [hadAny, setHadAny] = useState(false);
  useEffect(() => {
    if (suggestions.length) setHadAny(true);
  }, [suggestions.length]);
  const summary =
    state !== 'ready'
      ? ''
      : suggestions.length === 0
        ? 'Everyone is within capacity for the next six weeks — or the only overloaded work is urgent and due soon, so I left it where it is.'
        : `I found ${suggestions.length} ${suggestions.length === 1 ? 'move' : 'moves'} that bring overloaded weeks back under ${CAPACITY}h without pushing anyone else over. Teammates must already be on the project.`;
  const [typed, done] = useTypewriter(summary, 160);
  return (
    <div className="pj-wl__nova neo-nova">
      <span className="neo-nova__glow" />
      <div className="pj-wl__panelhead">
        <NovaChip>Nova · Rebalance</NovaChip>
        <span className="grow" />
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Close Nova" onClick={onClose}>
          <X />
        </button>
      </div>
      {state === 'thinking' ? (
        <div className="pj-wl__thinking">
          <Typing label="Nova is balancing the team" /> Reading every estimate and due date…
        </div>
      ) : (
        <>
          <p className="pj-wl__summary">{typed}</p>
          {done && suggestions.length > 0 && (
            <ul className="pj-wl__moves">
              {suggestions.map((s) => {
                const t = tasksById.get(s.taskId);
                const p = t?.projectId ? projects.get(t.projectId) : undefined;
                if (!t) return null;
                return (
                  <li key={s.taskId} className="pj-wl__move">
                    <span className="pj-wl__movetitle">
                      <ProjectGlyph project={p} size={16} />
                      <span className="neo-mono">{taskKey(p, t)}</span>
                      <span className="truncate">{t.title}</span>
                    </span>
                    <span className="pj-wl__moveflow">
                      <UserAvatar id={s.from} size={22} />
                      <span>
                        {first(s.from)} <small>{Math.round(s.fromBefore)}→{Math.round(s.fromAfter)}h</small>
                      </span>
                      <ArrowRight className="pj-wl__arrow" />
                      <UserAvatar id={s.to} size={22} />
                      <span>
                        {first(s.to)} <small>{Math.round(s.toBefore)}→{Math.round(s.toAfter)}h</small>
                      </span>
                    </span>
                    <span className="pj-wl__movemeta">
                      {s.hours}h in the week of {shortDate(weeks[s.week])}
                    </span>
                    <span className="pj-wl__moveacts">
                      <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onSkip(s)}>
                        Skip
                      </button>
                      <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => onApply(s)} data-qa="nova-apply">
                        <Check /> Apply
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {done && suggestions.length > 1 && (
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--block" onClick={onApplyAll} data-qa="nova-apply-all">
              <Sparkles /> Apply all {suggestions.length}
            </button>
          )}
          {done && hadAny && suggestions.length === 0 && <p className="neo-faint text-sm">All suggestions handled. Run Rebalance again any time.</p>}
        </>
      )}
    </div>
  );
}
