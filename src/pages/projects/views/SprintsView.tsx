import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Flag, Play, Plus, Timer, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { addDaysISO, daysBetween } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import type { BurndownPoint } from '@/projects/engine';
import { useProjectSprints } from '@/projects/selectors';
import type { Sprint, Task } from '@/projects/types';
import type { ViewProps } from '../ProjectView';
import { api, Bar, DuePill, fmtDay, Menu, PriorityFlag, report, SectionTitle, StatusPill, TypeGlyph, UserAvatar } from '../shared';

export function SprintsView({ project, canEdit, today, openTask, allTasks }: ViewProps) {
  const { sprints, active, burndown, velocity, backlog } = useProjectSprints(project.id);
  const [newOpen, setNewOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const planned = sprints.filter((s) => s.sprint.state === 'planned');
  const completed = sprints.filter((s) => s.sprint.state === 'completed').reverse();
  const activeStats = active ? sprints.find((s) => s.sprint.id === active.id)?.stats : undefined;
  const activeTasks = useMemo(() => (active ? allTasks.filter((t) => t.sprintId === active.id) : []), [allTasks, active]);
  const daysLeft = active ? daysBetween(today, active.endDate) : 0;

  const addToSprint = (task: Task, sprintId: string | undefined) => report(api().updateTask(task.id, { sprintId }), sprintId ? 'Added to sprint' : 'Moved to backlog');

  return (
    <div className="pj-sprints">
      <div className="pj-sprints__top">
        <div className="pj-count">
          <TrendingUp /> Velocity <b>{velocity || '—'}</b> pts/sprint
        </div>
        <div className="pj-count">
          <b>{backlog.length}</b> in backlog
        </div>
        <span className="spacer" />
        {canEdit && (
          <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setNewOpen(true)}>
            <Plus /> New sprint
          </button>
        )}
      </div>

      <div className="pj-sprints__grid">
        <div className="pj-sprints__main">
          {active && activeStats ? (
            <section className="pj-panelcard pj-sprint-active">
              <div className="pj-sprint-active__head">
                <span className="pj-sprint-active__badge">
                  <Play /> Active
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3 className="pj-sprint-active__name">{active.name}</h3>
                  <p className="muted text-sm">
                    <Flag className="pj-inline-icon" /> {active.goal || 'No sprint goal'}
                  </p>
                </div>
                {canEdit && (
                  <button type="button" className="btn btn--sm" onClick={() => setCompleteOpen(true)}>
                    <CheckCircle2 /> Complete sprint
                  </button>
                )}
              </div>
              <div className="pj-sprint-active__stats">
                <span>
                  <b>{activeStats.done}</b>/<b>{activeStats.committed}</b> pts done
                </span>
                <span>
                  <b>{activeStats.doneTasks}</b>/<b>{activeStats.tasks}</b> tasks
                </span>
                <span>
                  {fmtDay(active.startDate)} → {fmtDay(active.endDate)}
                </span>
                <span className={cx(daysLeft < 0 && 'pj-danger-text')}>{daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days over`}</span>
              </div>
              <Bar pct={activeStats.committed ? (activeStats.done / activeStats.committed) * 100 : 0} color={project.color} height={8} />
              <Burndown points={burndown} today={today} color={project.color} />
              <div className="pj-sprint-tasks">
                {activeTasks.length === 0 && <p className="pj-empty-row">No tasks in this sprint yet — add some from the backlog.</p>}
                {activeTasks.map((t) => (
                  <SprintTaskRow key={t.id} task={t} today={today} onOpen={() => openTask(t.id)} right={canEdit && t.status !== 'done' ? <button type="button" className="btn btn--sm btn--ghost" onClick={(e) => { e.stopPropagation(); addToSprint(t, undefined); }}>Remove</button> : undefined} />
                ))}
              </div>
            </section>
          ) : (
            <section className="pj-panelcard">
              <EmptyState icon={<Timer />} title="No active sprint">
                {planned.length ? 'Start a planned sprint to see the burndown here.' : canEdit ? 'Plan a sprint, pull in backlog tasks, then start it.' : 'Editors can plan and start sprints.'}
              </EmptyState>
            </section>
          )}

          <section className="pj-panelcard">
            <SectionTitle count={backlog.length}>Backlog</SectionTitle>
            {backlog.length === 0 ? (
              <p className="pj-empty-row">Every open task is in a sprint.</p>
            ) : (
              <div className="pj-sprint-tasks">
                {backlog.map((t) => (
                  <SprintTaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    onOpen={() => openTask(t.id)}
                    right={
                      canEdit && (active || planned.length) ? (
                        <Menu
                          align="right"
                          width={220}
                          header="Add to sprint"
                          trigger={(open, toggle) => (
                            <button type="button" className={cx('btn btn--sm btn--ghost', open && 'is-open')} onClick={(e) => { e.stopPropagation(); toggle(); }}>
                              <Plus /> Sprint
                            </button>
                          )}
                          items={[...(active ? [active] : []), ...planned.map((p) => p.sprint)].map((s) => ({ key: s.id, label: s.name, hint: s.state === 'active' ? 'active' : fmtDay(s.startDate), onSelect: () => addToSprint(t, s.id) }))}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="pj-sprints__side">
          <section className="pj-panelcard">
            <SectionTitle count={planned.length}>Planned</SectionTitle>
            {planned.length === 0 ? (
              <p className="pj-empty-row">Nothing planned yet.</p>
            ) : (
              <ul className="pj-sprint-list">
                {planned.map(({ sprint, stats }) => (
                  <li key={sprint.id} className="pj-sprint-item">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="pj-sprint-item__name">{sprint.name}</div>
                      <small className="muted">
                        {fmtDay(sprint.startDate)} → {fmtDay(sprint.endDate)} · {stats.tasks} tasks · {stats.committed} pts
                      </small>
                      {sprint.goal && <small className="pj-sprint-item__goal">{sprint.goal}</small>}
                    </div>
                    {canEdit && (
                      <button type="button" className="btn btn--sm" disabled={Boolean(active)} title={active ? 'Complete the active sprint first' : 'Start sprint'} onClick={() => report(api().startSprint(sprint.id))}>
                        <Play /> Start
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="pj-panelcard">
            <SectionTitle count={completed.length}>History</SectionTitle>
            {completed.length === 0 ? (
              <p className="pj-empty-row">Completed sprints build your velocity.</p>
            ) : (
              <ul className="pj-sprint-list">
                {completed.map(({ sprint }) => {
                  const pct = sprint.committedPoints ? Math.round(((sprint.completedPoints ?? 0) / sprint.committedPoints) * 100) : 0;
                  return (
                    <li key={sprint.id} className="pj-sprint-item pj-sprint-item--done">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="pj-sprint-item__name">{sprint.name}</div>
                        <small className="muted">
                          {fmtDay(sprint.startDate)} → {fmtDay(sprint.endDate)} · {sprint.completedPoints ?? 0}/{sprint.committedPoints ?? 0} pts ({pct}%)
                        </small>
                        <Bar pct={pct} color={pct >= 80 ? '#34d399' : '#fbbf24'} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {newOpen && <NewSprintModal projectId={project.id} today={today} nextNumber={sprints.length + 1} onClose={() => setNewOpen(false)} />}
      {completeOpen && active && activeStats && <CompleteSprintModal sprint={active} remaining={activeStats.tasks - activeStats.doneTasks} planned={planned.map((p) => p.sprint)} onClose={() => setCompleteOpen(false)} />}
    </div>
  );
}

function SprintTaskRow({ task, today, onOpen, right }: { task: Task; today: string; onOpen: () => void; right?: ReactNode }) {
  return (
    <div className={cx('pj-row pj-row--compact', task.status === 'done' && 'pj-row--done')} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className="pj-row__main">
        <TypeGlyph type={task.type} />
        <span className="pj-row__title truncate">{task.title}</span>
        <span className="pj-points mono" title="Story points">
          {task.storyPoints ?? Math.max(1, Math.round((task.estimateHours ?? 4) / 4))} pt
        </span>
      </span>
      <StatusPill status={task.status} />
      <DuePill dueDate={task.dueDate} status={task.status} today={today} />
      <PriorityFlag priority={task.priority} />
      <UserAvatar userId={task.assigneeId} size={22} />
      {right && <span onClick={(e) => e.stopPropagation()}>{right}</span>}
    </div>
  );
}

function Burndown({ points, today, color }: { points: BurndownPoint[]; today: string; color: string }) {
  if (points.length < 2) return null;
  const W = 560;
  const H = 180;
  const padL = 34;
  const padB = 24;
  const padT = 12;
  const max = Math.max(1, ...points.map((p) => Math.max(p.ideal, Number.isNaN(p.remaining) ? 0 : p.remaining)));
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - 8);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const ideal = points.map((p, i) => `${x(i)},${y(p.ideal)}`).join(' ');
  const actualPts = points.filter((p) => !Number.isNaN(p.remaining));
  const actual = actualPts.map((p) => `${x(points.indexOf(p))},${y(p.remaining)}`).join(' ');
  const todayIdx = points.findIndex((p) => p.date === today);
  const last = actualPts[actualPts.length - 1];
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div className="pj-burndown">
      <div className="row row--between text-xs muted">
        <span>Burndown · story points remaining</span>
        <span>
          <i className="pj-legend pj-legend--ideal" /> ideal · <i className="pj-legend pj-legend--actual" style={{ background: color }} /> actual
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pj-burndown__svg" role="img" aria-label="Sprint burndown chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className="pj-burndown__grid" />
            <text x={padL - 6} y={y(t) + 4} className="pj-burndown__tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {todayIdx >= 0 && <line x1={x(todayIdx)} x2={x(todayIdx)} y1={padT} y2={H - padB} className="pj-burndown__today" />}
        <polyline points={ideal} className="pj-burndown__ideal" />
        {actual && <polyline points={actual} className="pj-burndown__actual" style={{ stroke: color }} />}
        {last && <circle cx={x(points.indexOf(last))} cy={y(last.remaining)} r={4} style={{ fill: color }} />}
        <text x={padL} y={H - 6} className="pj-burndown__tick">
          {fmtDay(points[0].date)}
        </text>
        <text x={W - 8} y={H - 6} className="pj-burndown__tick" textAnchor="end">
          {fmtDay(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}

function NewSprintModal({ projectId, today, nextNumber, onClose }: { projectId: string; today: string; nextNumber: number; onClose: () => void }) {
  const [name, setName] = useState(`Sprint ${nextNumber}`);
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysISO(today, 14));
  const save = () => {
    if (report(api().createSprint(projectId, { name, goal, startDate, endDate }))) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Plan a sprint"
      icon={<Timer className="pj-modal-icon" />}
      width={480}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={save} disabled={!name.trim() || endDate <= startDate}>
            Plan sprint
          </button>
        </>
      }
    >
      <div className="pj-form">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Sprint goal</span>
          <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What will be true when this sprint ends?" />
        </label>
        <div className="pj-form__grid">
          <label className="field">
            <span className="field-label">Start</span>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">End</span>
            <input type="date" className="input" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function CompleteSprintModal({ sprint, remaining, planned, onClose }: { sprint: Sprint; remaining: number; planned: Sprint[]; onClose: () => void }) {
  const [target, setTarget] = useState<string>(planned[0]?.id ?? '');
  const finish = () => {
    if (report(api().completeSprint(sprint.id, target || null))) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Complete ${sprint.name}?`}
      subtitle={remaining ? `${remaining} open task${remaining === 1 ? '' : 's'} will roll over.` : 'Everything is done — nice work.'}
      icon={<CheckCircle2 className="pj-modal-icon" />}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={finish}>
            Complete sprint
          </button>
        </>
      }
    >
      {remaining > 0 && (
        <label className="field">
          <span className="field-label">Move unfinished work to</span>
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Backlog</option>
            {planned.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({fmtDay(p.startDate)})
              </option>
            ))}
          </select>
          <span className="field-hint">Completed points are recorded for velocity.</span>
        </label>
      )}
    </Modal>
  );
}
