import { useMemo, useState, type CSSProperties } from 'react';
import { Building2, Check, ChevronDown, Plus, Target, TrendingUp, Users } from 'lucide-react';
import type { Department } from '@/types';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import { HEALTH_META } from '@/projects/constants';
import { useGoals, useProjectsCaps, useVisibleProjects, type GoalView } from '@/projects/selectors';
import { useProjects } from '@/projects/store';
import type { Goal, ProjectHealth } from '@/projects/types';
import { api, Bar, DEPARTMENTS, fmtDay, HealthPill, Menu, ProjectChip, ProjectIcon, report, UserAvatar } from './shared';

type LevelFilter = 'all' | 'company' | 'team';

export function GoalsView() {
  const me = useSessionUser();
  const caps = useProjectsCaps();
  const tree = useGoals();
  const allGoals = useProjects((s) => s.goals);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [deptFilter, setDeptFilter] = useState<Department | ''>('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'q4' | 'fy26'>('all');
  const [newOpen, setNewOpen] = useState(false);

  const flatGoals = useMemo(() => {
    const out: { node: GoalView; depth: number }[] = [];
    const walk = (nodes: GoalView[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.children.length) walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree]);

  const filtered = useMemo(() => {
    return flatGoals.filter(({ node }) => {
      const g = node.goal;
      if (levelFilter !== 'all' && g.level !== levelFilter) return false;
      if (deptFilter && g.department !== deptFilter) return false;
      if (periodFilter === 'q4' && g.targetDate > '2026-12-31') return false;
      return true;
    });
  }, [flatGoals, levelFilter, deptFilter, periodFilter]);

  const departments = useMemo(() => [...new Set(allGoals.map((g) => g.department).filter((d): d is Department => Boolean(d)))].sort(), [allGoals]);

  return (
    <div className="pj-view pj-goals">
      <div className="pj-view__head">
        <div>
          <h2 className="pj-view__title">Goals & OKRs</h2>
          <p className="pj-view__sub">Company and department objectives connected directly to the projects and key results that deliver them.</p>
        </div>
        {caps.canCreate && (
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={() => setNewOpen(true)}>
            <Plus /> New Goal
          </button>
        )}
      </div>

      <div className="pj-filters">
        <Segmented
          label="Goal level"
          value={levelFilter}
          onChange={setLevelFilter}
          options={[
            { value: 'all', label: 'All OKRs' },
            { value: 'company', label: 'Company', icon: <Building2 /> },
            { value: 'team', label: 'Department', icon: <Users /> },
          ]}
        />
        <div className="pj-filters__right">
          <select className="select pj-select-sm" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as 'all' | 'q4' | 'fy26')} aria-label="Period">
            <option value="all">All periods (FY26)</option>
            <option value="q4">This quarter (Q4)</option>
            <option value="fy26">Annual FY26</option>
          </select>
          <select className="select pj-select-sm" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value as Department | '')} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No goals match these filters"
          action={
            caps.canCreate ? (
              <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setNewOpen(true)}>
                <Plus /> Create goal
              </button>
            ) : undefined
          }
        >
          Link objectives to projects or key result metrics so progress updates automatically as work ships.
        </EmptyState>
      ) : (
        <div className="pj-goal-list">
          {filtered.map(({ node, depth }) => {
            const canEdit = Boolean(me && (node.goal.ownerId === me.id || caps.canManage));
            return <GoalCard key={node.goal.id} view={node} depth={depth} canEdit={canEdit} />;
          })}
        </div>
      )}

      {newOpen && <NewGoalModal onClose={() => setNewOpen(false)} companyGoals={allGoals.filter((g) => g.level === 'company')} />}
    </div>
  );
}

function GoalCard({ view, depth, canEdit }: { view: GoalView; depth: number; canEdit: boolean }) {
  const { goal, progress, projects } = view;
  const [editingKr, setEditingKr] = useState(false);
  const [krCurrent, setKrCurrent] = useState(goal.metric ? String(goal.metric.current) : '');
  const [manualDraft, setManualDraft] = useState(goal.manualProgress !== undefined ? String(goal.manualProgress) : String(progress));

  const isManual = typeof goal.manualProgress === 'number';
  const color = HEALTH_META[goal.status].color;

  const saveKeyResult = () => {
    setEditingKr(false);
    if (goal.metric) {
      const nextVal = Number(krCurrent);
      if (Number.isFinite(nextVal) && nextVal !== goal.metric.current) {
        report(api().updateGoal(goal.id, { metric: { ...goal.metric, current: nextVal }, manualProgress: undefined }));
      }
    } else {
      const pct = Math.max(0, Math.min(100, Math.round(Number(manualDraft) || 0)));
      report(api().updateGoal(goal.id, { manualProgress: pct }));
    }
  };

  return (
    <article className={cx('pj-panelcard pj-goal-card', depth > 0 && 'pj-goal-card--child')} style={{ '--pill': color, marginLeft: depth * 24 } as CSSProperties}>
      <div className="pj-goal-card__top">
        <span className={cx('pj-goal-badge', goal.level === 'company' ? 'pj-goal-badge--company' : 'pj-goal-badge--team')}>
          {goal.level === 'company' ? <Building2 /> : <Users />}
          {goal.level === 'company' ? 'Company Objective' : `${goal.department ?? 'Team'} OKR`}
        </span>
        {canEdit ? (
          <Menu
            width={190}
            header="Goal status"
            trigger={(open, toggle) => (
              <button type="button" className={cx('pj-proj__health', open && 'is-open')} onClick={toggle}>
                <HealthPill health={goal.status} />
                <ChevronDown />
              </button>
            )}
            items={(Object.keys(HEALTH_META) as ProjectHealth[]).map((h) => ({
              key: h,
              label: `${HEALTH_META[h].emoji} ${HEALTH_META[h].label}`,
              active: goal.status === h,
              onSelect: () => report(api().updateGoal(goal.id, { status: h })),
            }))}
          />
        ) : (
          <HealthPill health={goal.status} />
        )}
        <span className="spacer" />
        <span className="text-xs muted mono">Due {fmtDay(goal.targetDate)}</span>
        <UserAvatar userId={goal.ownerId} size={22} name />
      </div>

      <h3 className="pj-goal-card__title">{goal.title}</h3>
      {goal.description && <p className="pj-goal-card__desc muted">{goal.description}</p>}

      <div className="pj-goal-card__prog">
        <div className="row row--between">
          <span className="text-xs muted">
            {isManual ? 'Manual override progress' : goal.metric ? `Key Result: ${goal.metric.label}` : 'Auto-rollup from linked projects'}
          </span>
          <span className="mono text-sm">
            <b>{progress}%</b>
          </span>
        </div>
        <Bar pct={progress} color={color} height={8} />
      </div>

      <div className="pj-goal-card__kr">
        <div className="pj-goal-kr-box">
          <TrendingUp className="pj-goal-kr-icon" />
          {goal.metric ? (
            <div className="grow">
              <div className="text-xs muted">{goal.metric.label}</div>
              <div className="pj-goal-kr-val mono">
                <b>{goal.metric.current}</b> / {goal.metric.target} {goal.metric.unit}
              </div>
            </div>
          ) : (
            <div className="grow">
              <div className="text-xs muted">Progress source</div>
              <div className="text-xs">{isManual ? `Manual (${goal.manualProgress}%)` : `Auto-rollup (${projects.length} project${projects.length === 1 ? '' : 's'})`}</div>
            </div>
          )}

          {canEdit && (
            <div className="row" style={{ gap: 8 }}>
              {editingKr ? (
                <>
                  {goal.metric ? (
                    <input
                      type="number"
                      step="any"
                      className="input pj-select-sm"
                      style={{ width: 92 }}
                      value={krCurrent}
                      onChange={(e) => setKrCurrent(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveKeyResult()}
                      autoFocus
                      aria-label="Key result current value"
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="input pj-select-sm"
                      style={{ width: 84 }}
                      value={manualDraft}
                      onChange={(e) => setManualDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveKeyResult()}
                      autoFocus
                      aria-label="Manual progress percent"
                    />
                  )}
                  <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={saveKeyResult}>
                    Save
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditingKr(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setKrCurrent(goal.metric ? String(goal.metric.current) : '');
                      setManualDraft(String(progress));
                      setEditingKr(true);
                    }}
                  >
                    {goal.metric ? 'Update key result' : 'Override %'}
                  </button>
                  {isManual && (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => report(api().updateGoal(goal.id, { manualProgress: undefined }))}>
                      Use auto-rollup
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pj-goal-card__projects">
        <span className="text-xs muted">Contributing projects:</span>
        {projects.length === 0 ? (
          <span className="text-xs faint">None linked</span>
        ) : (
          <div className="row row--wrap" style={{ gap: 6 }}>
            {projects.map((p) => (
              <ProjectChip key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function NewGoalModal({ onClose, companyGoals }: { onClose: () => void; companyGoals: Goal[] }) {
  const me = useSessionUser();
  const caps = useProjectsCaps();
  const cards = useVisibleProjects(true);
  const today = todayISO();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<'company' | 'team'>(caps.canManage ? 'company' : 'team');
  const [department, setDepartment] = useState<Department>(me?.department ?? 'Engineering');
  const [parentId, setParentId] = useState<string>('');
  const [targetDate, setTargetDate] = useState(addDaysISO(today, 60));
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [useMetric, setUseMetric] = useState(true);
  const [metricLabel, setMetricLabel] = useState('');
  const [metricCurrent, setMetricCurrent] = useState('0');
  const [metricTarget, setMetricTarget] = useState('100');
  const [metricUnit, setMetricUnit] = useState('%');

  const toggleProject = (id: string) => setProjectIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = () => {
    const res = api().createGoal({
      title,
      description,
      level,
      department: level === 'team' ? department : undefined,
      parentId: parentId || undefined,
      projectIds,
      targetDate,
      metric:
        useMetric && metricLabel.trim()
          ? {
              label: metricLabel.trim(),
              current: Number(metricCurrent) || 0,
              target: Number(metricTarget) || 100,
              unit: metricUnit.trim() || '%',
            }
          : undefined,
    });
    if (report(res)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New Goal (OKR)"
      subtitle="Define an objective, optional key result metric and linked projects."
      icon={<Target className="pj-modal-icon" />}
      width={600}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" disabled={title.trim().length < 4} onClick={submit}>
            <Check /> Create goal
          </button>
        </>
      }
    >
      <div className="pj-form">
        <div className="pj-form__grid">
          <label className="field pj-form__span2">
            <span className="field-label">Objective title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Achieve 99.99% reliability across all cells" autoFocus />
          </label>
          <label className="field pj-form__span2">
            <span className="field-label">Description</span>
            <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this matters and how we measure success" />
          </label>
          <label className="field">
            <span className="field-label">Level</span>
            <select className="select" value={level} onChange={(e) => setLevel(e.target.value as 'company' | 'team')}>
              {caps.canManage && <option value="company">Company objective</option>}
              <option value="team">Department / Team OKR</option>
            </select>
          </label>
          {level === 'team' ? (
            <label className="field">
              <span className="field-label">Department</span>
              <select className="select" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span className="field-label">Target date</span>
              <input type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </label>
          )}
          {level === 'team' && (
            <>
              <label className="field">
                <span className="field-label">Parent company goal (optional)</span>
                <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">None (top-level)</option>
                  {companyGoals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Target date</span>
                <input type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </label>
            </>
          )}
        </div>

        <div className="pj-panelcard" style={{ padding: 14 }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: useMetric ? 12 : 0 }}>
            <input type="checkbox" checked={useMetric} onChange={(e) => setUseMetric(e.target.checked)} />
            <span className="field-label" style={{ margin: 0 }}>Track a numeric Key Result metric (otherwise rolls up from linked projects)</span>
          </label>
          {useMetric && (
            <div className="pj-form__grid">
              <label className="field pj-form__span2">
                <span className="field-label">Key result label</span>
                <input className="input" value={metricLabel} onChange={(e) => setMetricLabel(e.target.value)} placeholder="e.g. Enterprise logos signed" />
              </label>
              <label className="field">
                <span className="field-label">Current value</span>
                <input type="number" step="any" className="input" value={metricCurrent} onChange={(e) => setMetricCurrent(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Target value & unit</span>
                <div className="row" style={{ gap: 6 }}>
                  <input type="number" step="any" className="input" value={metricTarget} onChange={(e) => setMetricTarget(e.target.value)} />
                  <input className="input" style={{ width: 72 }} value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} placeholder="%" />
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label">Linked projects ({projectIds.length})</span>
          <ul className="pj-people pj-people--compact">
            {cards.map(({ project }) => {
              const on = projectIds.includes(project.id);
              return (
                <li key={project.id}>
                  <button type="button" className={cx('pj-people__item', on && 'is-active')} onClick={() => toggleProject(project.id)} aria-pressed={on}>
                    <ProjectIcon project={project} size={24} />
                    <span className="grow truncate">{project.name}</span>
                    <span className={cx('pj-people__check', on && 'is-on')}>
                      <Check />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
