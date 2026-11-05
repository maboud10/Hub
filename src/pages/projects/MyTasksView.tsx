import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CalendarCheck, CheckCircle2, Inbox, Lock, MoreHorizontal, Pin, Play, Plus, Search, Sparkles, Stamp, Timer, X } from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { EmptyState } from '@/components/ui/primitives';
import { startFocusSession } from '@/components/FocusEngine';
import { todayISO } from '@/hr/calendar';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PRIORITY_META, STATUS_META } from '@/projects/constants';
import { isBlocked } from '@/projects/engine';
import { useMyTasks, useVisibleProjects } from '@/projects/selectors';
import { useProjects } from '@/projects/store';
import type { MyTasksBucket, Project, Task, TaskPriority, TaskStatus } from '@/projects/types';
import {
  api,
  ApprovalActions,
  Collapsible,
  DuePill,
  isEditorRole,
  Menu,
  PriorityFlag,
  ProjectChip,
  report,
  TypeGlyph,
  UserAvatar,
  useQuickAddShortcut,
  useTaskParam,
} from './shared';

const BUCKET_LABEL: Record<MyTasksBucket, string> = { today: 'Today', upcoming: 'Upcoming', later: 'Later' };

export function MyTasksView() {
  const me = useSessionUser();
  const my = useMyTasks();
  const cards = useVisibleProjects();
  const allTasks = useProjects((s) => s.tasks);
  const { open: openTask } = useTaskParam();
  const today = todayISO();

  const editable = useMemo(() => cards.filter((c) => isEditorRole(c.role)), [cards]);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickProject, setQuickProject] = useState('');
  const [quickBucket, setQuickBucket] = useState<MyTasksBucket>('today');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');
  const [quickDue, setQuickDue] = useState(today);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [filterProject, setFilterProject] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);
  useQuickAddShortcut(() => quickRef.current?.focus());

  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);

  if (!my || !me) return null;

  const targetProject = quickProject || editable[0]?.project.id || '';

  const submitQuick = () => {
    const title = quickTitle.trim();
    if (!title || !targetProject) return;
    const res = api().createTask({
      projectId: targetProject,
      title,
      assigneeId: me.id,
      priority: quickPriority,
      dueDate: quickDue || undefined,
    });
    if (report(res)) {
      if (res.taskId) api().setMyTaskBucket(res.taskId, quickBucket);
      setQuickTitle('');
    }
  };

  const complete = (t: Task) => report(api().completeTask(t.id, t.status !== 'done'));

  const filterTask = (t: Task) => {
    const q = filterSearch.trim().toLowerCase();
    if (q && !t.title.toLowerCase().includes(q) && !t.tags.some((tag) => tag.toLowerCase().includes(q))) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterProject && t.projectId !== filterProject) return false;
    return true;
  };

  const filteredToday = my.today.filter(filterTask);
  const filteredUpcoming = my.upcoming.filter(filterTask);
  const filteredLater = my.later.filter(filterTask);

  const renderRows = (tasks: Task[], bucket: MyTasksBucket) =>
    tasks.length === 0 ? (
      <p className="pj-empty-row">{bucket === 'today' ? 'Nothing due today — enjoy the focus time.' : bucket === 'upcoming' ? 'No tasks due in the next week.' : 'No unscheduled tasks.'}</p>
    ) : (
      <div className="pj-rows">
        {tasks.map((t) => (
          <MyTaskRow key={t.id} task={t} project={my.byProject.get(t.projectId)} blocked={isBlocked(t, byId)} today={today} onOpen={() => openTask(t.id)} onComplete={() => complete(t)} />
        ))}
      </div>
    );

  return (
    <div className="pj-view pj-mytasks">
      <div className="pj-view__head">
        <div>
          <h2 className="pj-view__title">My Tasks</h2>
          <p className="pj-view__sub">Everything assigned to you across {cards.length} project{cards.length === 1 ? '' : 's'}, triaged into Today, Upcoming and Later.</p>
        </div>
        <div className="pj-counts">
          <span className="pj-count">
            <b>{my.counts.open}</b> open
          </span>
          <span className={cx('pj-count', my.counts.dueToday > 0 && 'pj-count--warn')}>
            <CalendarCheck /> <b>{my.counts.dueToday}</b> due today
          </span>
          <span className={cx('pj-count', my.counts.overdue > 0 && 'pj-count--danger')}>
            <AlertTriangle /> <b>{my.counts.overdue}</b> overdue
          </span>
          <span className={cx('pj-count', my.counts.blocked > 0 && 'pj-count--muted')}>
            <Lock /> <b>{my.counts.blocked}</b> blocked
          </span>
        </div>
      </div>

      {my.focus.length > 0 && (
        <section className="pj-nova">
          <div className="pj-nova__head">
            <span className="pj-nova__orb" aria-hidden="true">
              <Sparkles />
            </span>
            <div className="grow">
              <h3>Plan my day</h3>
              <p>Nova ranked your open work by urgency, blocking impact and priority.</p>
            </div>
            <button type="button" className="btn btn--sm pj-btn-violet" onClick={() => startFocusSession(25)}>
              <Timer /> Start 25m Focus Session
            </button>
          </div>
          <ol className="pj-nova__list">
            {my.focus.map(({ task, score, reason }, i) => {
              const project = my.byProject.get(task.projectId);
              return (
                <li key={task.id} className="pj-nova__item">
                  <span className="pj-nova__rank" title={`Priority score: ${score}`}>{i + 1}</span>
                  <button type="button" className="pj-nova__main" onClick={() => openTask(task.id)}>
                    <span className="pj-nova__title">
                      <TypeGlyph type={task.type} />
                      {task.title}
                    </span>
                    <span className="pj-nova__meta">
                      {project && <ProjectChip project={project} link={false} />}
                      <span className="pj-nova__reason">{reason} · score {score}</span>
                    </span>
                  </button>
                  <div className="pj-nova__actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      title="Pin to Today"
                      onClick={() => {
                        api().setMyTaskBucket(task.id, 'today');
                        report({ ok: true, message: 'Pinned to Today.' });
                      }}
                    >
                      <Pin /> Today
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      title="Start 25m focus session on this task"
                      onClick={() => {
                        if (task.status === 'todo') api().updateTask(task.id, { status: 'in_progress' });
                        startFocusSession(25);
                      }}
                    >
                      <Timer /> 25m
                    </button>
                    {task.status !== 'in_progress' && task.type !== 'approval' && (
                      <button type="button" className="btn btn--sm" onClick={() => report(api().updateTask(task.id, { status: 'in_progress' }), 'Started')}>
                        <Play /> Start
                      </button>
                    )}
                    {task.type === 'approval' ? (
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => openTask(task.id)}>
                        <Stamp /> Review
                      </button>
                    ) : (
                      <button type="button" className="btn btn--sm btn--success" onClick={() => complete(task)}>
                        <CheckCircle2 /> Done
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {my.approvalsWaiting.length > 0 && (
        <Collapsible title="Approvals waiting on you" count={my.approvalsWaiting.length} tone="warning">
          <div className="pj-rows">
            {my.approvalsWaiting.map((t) => {
              const project = my.byProject.get(t.projectId);
              return (
                <div key={t.id} className="pj-approval-row">
                  <button type="button" className="pj-approval-row__main" onClick={() => openTask(t.id)}>
                    <Stamp className="pj-approval-row__icon" />
                    <span className="grow">
                      <span className="pj-approval-row__title">{t.title}</span>
                      <span className="pj-approval-row__meta">
                        {project && <ProjectChip project={project} link={false} />}
                        <span>
                          Requested by <UserAvatar userId={t.creatorId} size={16} name />
                        </span>
                        <DuePill dueDate={t.dueDate} status={t.status} today={today} />
                      </span>
                    </span>
                  </button>
                  <ApprovalActions taskId={t.id} compact />
                </div>
              );
            })}
          </div>
        </Collapsible>
      )}

      {editable.length > 0 && (
        <form
          className="pj-quickadd"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuick();
          }}
        >
          <Plus aria-hidden="true" />
          <input ref={quickRef} className="pj-quickadd__input" placeholder="Add a task… (press c)" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} aria-label="Quick add task" />
          <select className="select pj-quickadd__select" value={targetProject} onChange={(e) => setQuickProject(e.target.value)} aria-label="Project for the new task">
            {editable.map((c) => (
              <option key={c.project.id} value={c.project.id}>
                {c.project.icon} {c.project.name}
              </option>
            ))}
          </select>
          <select className="select pj-select-sm" value={quickBucket} onChange={(e) => setQuickBucket(e.target.value as MyTasksBucket)} aria-label="Bucket">
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
            <option value="later">Later</option>
          </select>
          <select className="select pj-select-sm" value={quickPriority} onChange={(e) => setQuickPriority(e.target.value as TaskPriority)} aria-label="Priority">
            {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
          <input type="date" className="input pj-select-sm" value={quickDue} onChange={(e) => setQuickDue(e.target.value)} aria-label="Due date" />
          <button type="submit" className="btn btn--sm btn--primary pj-btn-violet" disabled={!quickTitle.trim()}>
            Add
          </button>
        </form>
      )}

      {my.counts.open > 0 && (
        <div className="pj-filters">
          <div className="pj-toolbar__search">
            <Search />
            <input className="pj-toolbar__input" placeholder="Filter my tasks…" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} aria-label="Filter my tasks" />
            {filterSearch && (
              <button type="button" className="pj-search__clear" onClick={() => setFilterSearch('')} aria-label="Clear filter">
                <X />
              </button>
            )}
          </div>
          <div className="pj-filters__right">
            <select className="select pj-select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TaskStatus | '')} aria-label="Filter by status">
              <option value="">All statuses</option>
              {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <select className="select pj-select-sm" value={filterProject} onChange={(e) => setFilterProject(e.target.value)} aria-label="Filter by project">
              <option value="">All projects</option>
              {cards.map((c) => (
                <option key={c.project.id} value={c.project.id}>
                  {c.project.icon} {c.project.name}
                </option>
              ))}
            </select>
            {(filterSearch || filterStatus || filterProject) && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  setFilterSearch('');
                  setFilterStatus('');
                  setFilterProject('');
                }}
              >
                <X /> Reset
              </button>
            )}
          </div>
        </div>
      )}

      {my.counts.open === 0 && my.approvalsWaiting.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="You’re all caught up">
          Nothing is assigned to you right now. Browse projects to pick something up or create a task above.
          <br />
          <Link to="/projects/browse" className="btn btn--sm" style={{ marginTop: 12 }}>
            Browse projects
          </Link>
        </EmptyState>
      ) : (
        <>
          <Collapsible title="Today" count={filteredToday.length} tone={my.overdue.length ? 'danger' : undefined} right={my.overdue.length ? <span className="pj-due pj-due--overdue">{my.overdue.length} overdue</span> : undefined}>
            {renderRows(filteredToday, 'today')}
          </Collapsible>
          <Collapsible title="Upcoming" count={filteredUpcoming.length}>
            {renderRows(filteredUpcoming, 'upcoming')}
          </Collapsible>
          <Collapsible title="Later" count={filteredLater.length} defaultOpen={filteredLater.length > 0 && filteredToday.length + filteredUpcoming.length === 0}>
            {renderRows(filteredLater, 'later')}
          </Collapsible>
        </>
      )}

      <Collapsible title="Recently completed" count={my.recentlyCompleted.length} defaultOpen={false}>
        {my.recentlyCompleted.length === 0 ? (
          <p className="pj-empty-row">Tasks you finish in the last 7 days show up here.</p>
        ) : (
          <div className="pj-rows">
            {my.recentlyCompleted.map((t) => (
              <div key={t.id} className="pj-row pj-row--done" onClick={() => openTask(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}>
                <button
                  type="button"
                  className="pj-check is-done"
                  aria-label="Reopen task"
                  onClick={(e) => {
                    e.stopPropagation();
                    complete(t);
                  }}
                >
                  <CheckCircle2 />
                </button>
                <span className="pj-row__title truncate">{t.title}</span>
                {my.byProject.get(t.projectId) && <ProjectChip project={my.byProject.get(t.projectId)!} />}
                <span className="pj-row__when faint">{t.completedAt ? relativeTime(t.completedAt) : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {my.counts.open > 0 && (
        <p className="pj-footnote">
          <Inbox /> Mentions, assignments and approvals land in your <Link to="/projects/inbox">Inbox</Link>.
        </p>
      )}
    </div>
  );
}

function MyTaskRow({ task, project, blocked, today, onOpen, onComplete }: { task: Task; project?: Project; blocked: boolean; today: string; onOpen: () => void; onComplete: () => void }) {
  const buckets = useProjects((s) => s.userState);
  const me = useSessionUser();
  const override = me ? buckets[me.id]?.buckets[task.id] : undefined;
  const isApproval = task.type === 'approval' && task.approval?.decision === 'pending';
  return (
    <div className={cx('pj-row', blocked && 'pj-row--blocked')} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <button
        type="button"
        className={cx('pj-check', task.status === 'done' && 'is-done')}
        aria-label={task.status === 'done' ? 'Reopen task' : 'Complete task'}
        title={isApproval ? 'Approvals complete when the approver decides' : blocked ? 'Blocked by another task' : 'Mark complete'}
        disabled={isApproval}
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
      >
        <CheckCircle2 />
      </button>
      <span className="pj-row__main">
        <TypeGlyph type={task.type} />
        <span className="pj-row__title truncate">{task.title}</span>
        {blocked && (
          <span className="pj-row__blocked" title="Blocked by an open dependency">
            <Lock />
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="pj-row__sub faint">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        )}
      </span>
      {project && <ProjectChip project={project} className="pj-row__project" />}
      <DuePill dueDate={task.dueDate} status={task.status} today={today} />
      <PriorityFlag priority={task.priority} />
      <UserAvatar userId={task.assigneeId} size={22} />
      <span onClick={(e) => e.stopPropagation()}>
        <Menu
          align="right"
          width={200}
          header="Move to"
          trigger={(open, toggle) => (
            <button type="button" className={cx('icon-btn icon-btn--sm pj-row__more', open && 'is-open')} onClick={toggle} aria-label="Change bucket">
              <MoreHorizontal />
            </button>
          )}
          items={[
            ...(['today', 'upcoming', 'later'] as MyTasksBucket[]).map((b) => ({ key: b, label: BUCKET_LABEL[b], active: override === b, onSelect: () => api().setMyTaskBucket(task.id, b) })),
            { key: 'auto', label: 'Auto (by due date)', active: !override, onSelect: () => api().setMyTaskBucket(task.id, null) },
          ]}
        />
      </span>
    </div>
  );
}
