import { useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  Columns3,
  FileText,
  Flame,
  GanttChart,
  Gauge,
  List,
  Lock,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Settings2,
  Share2,
  Sparkles,
  Star,
  Timer,
  Trash2,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { User } from '@/types';
import { useSessionUser } from '@/store/selectors';
import { Avatar, EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { addDaysISO, todayISO } from '@/hr/calendar';
import { cx } from '@/lib/cx';
import {
  HEALTH_META,
  PRIORITY_META,
  PROJECT_COLORS,
  PROJECT_ICONS,
  QUICK_TAGS,
  ROLE_META,
  RULE_ACTION_META,
  RULE_TRIGGER_META,
  STATUS_META,
  TASK_TYPE_META,
  VIEW_META,
} from '@/projects/constants';
import { isBlocked, isDone } from '@/projects/engine';
import {
  useMyProjectsState,
  useProject,
  useProjectSprints,
  useProjectTasks,
  useWorkload,
  type SectionGroup,
} from '@/projects/selectors';
import { useProjects } from '@/projects/store';
import type {
  IntakeForm,
  Project,
  ProjectHealth,
  ProjectPrivacy,
  ProjectRole,
  ProjectView as ViewId,
  RuleAction,
  RuleTrigger,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@/projects/types';
import { OverviewView, FormSubmitModal } from './views/OverviewView';
import { ListView } from './views/ListView';
import { BoardView } from './views/BoardView';
import { TimelineView } from './views/TimelineView';
import { CalendarView } from './views/CalendarView';
import { MembersModal } from './MembersModal';
import {
  api,
  AvatarStack,
  Bar,
  Collapsible,
  DuePill,
  fmtDay,
  HealthPill,
  Menu,
  PriorityFlag,
  PrivacyBadge,
  PRIVACY_HELP,
  ProjectIcon,
  report,
  RoleBadge,
  SectionTitle,
  StatusPill,
  TypeGlyph,
  useActiveUsers,
  useQuickAddShortcut,
  UserAvatar,
  UserPicker,
  useTaskParam,
  useUserMap,
} from './shared';
import { ArrowUpDown, ChevronDown, EyeOff, Filter } from 'lucide-react';

export interface ViewProps {
  project: Project;
  /** Filtered + sorted tasks. */
  tasks: Task[];
  /** Every task in the project (manual order). */
  allTasks: Task[];
  sections: SectionGroup[];
  allSections: SectionGroup[];
  byId: Map<string, Task>;
  role: ProjectRole;
  canEdit: boolean;
  canAdmin: boolean;
  today: string;
  openTask: (id: string) => void;
  filtersActive: boolean;
  onAddTask: (sectionId?: string) => void;
}

type SortKey = 'manual' | 'due' | 'priority' | 'status' | 'title' | 'newest';
const SORT_LABEL: Record<SortKey, string> = { manual: 'Manual order', due: 'Due date', priority: 'Priority', status: 'Status', title: 'Title', newest: 'Newest first' };
const VIEW_ICONS: Record<ViewId, typeof List> = { overview: Gauge, list: List, board: Columns3, timeline: GanttChart, calendar: CalendarDays, workload: UserRound, sprints: Timer };
const VIEW_ORDER: ViewId[] = ['overview', 'list', 'board', 'timeline', 'calendar', 'workload', 'sprints'];

export function ProjectView() {
  const { projectId } = useParams();
  const me = useSessionUser();
  const [sp, setSp] = useSearchParams();
  const { project, role, canEdit, canAdmin } = useProject(projectId);
  const { tasks: allTasks, sections: allSections, byId } = useProjectTasks(projectId);
  const rules = useProjects((s) => s.rules);
  const forms = useProjects((s) => s.forms);
  const { open: openTask } = useTaskParam();
  const users = useUserMap();
  const today = todayISO();

  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState<string | 'unassigned' | ''>('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [tag, setTag] = useState('');
  const [mine, setMine] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<SortKey>('manual');
  const [addOpen, setAddOpen] = useState<{ sectionId?: string } | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (project) api().recordProjectVisit(project.id);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useQuickAddShortcut(() => {
    if (canEdit) setAddOpen({});
  });

  const view = (sp.get('view') as ViewId | null) ?? project?.defaultView ?? 'board';
  const setView = (v: ViewId) => {
    const next = new URLSearchParams(sp);
    next.set('view', v);
    setSp(next, { replace: true });
  };

  const myState = useMyProjectsState();
  const starred = project ? myState.starredProjectIds.includes(project.id) : false;

  const tags = useMemo(() => [...new Set(allTasks.flatMap((t) => t.tags))].sort(), [allTasks]);

  const filtersActive = Boolean(q.trim() || assignee || status || priority || tag || mine || hideDone);

  const predicate = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (t: Task) => {
      if (query && !(t.title.toLowerCase().includes(query) || `${project?.key}-${t.number}`.toLowerCase() === query || t.tags.some((x) => x.includes(query)))) return false;
      if (assignee === 'unassigned' ? Boolean(t.assigneeId) : assignee && t.assigneeId !== assignee) return false;
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      if (tag && !t.tags.includes(tag)) return false;
      if (mine && t.assigneeId !== me?.id && !t.collaboratorIds.includes(me?.id ?? '')) return false;
      if (hideDone && t.status === 'done') return false;
      return true;
    };
  }, [q, assignee, status, priority, tag, mine, hideDone, me?.id, project?.key]);

  const sorter = useMemo(() => {
    switch (sort) {
      case 'due':
        return (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
      case 'priority':
        return (a: Task, b: Task) => PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
      case 'status':
        return (a: Task, b: Task) => STATUS_META[a.status].order - STATUS_META[b.status].order;
      case 'title':
        return (a: Task, b: Task) => a.title.localeCompare(b.title);
      case 'newest':
        return (a: Task, b: Task) => b.createdAt - a.createdAt;
      default:
        return (a: Task, b: Task) => a.order - b.order || a.number - b.number;
    }
  }, [sort]);

  const tasks = useMemo(() => allTasks.filter(predicate).sort(sorter), [allTasks, predicate, sorter]);
  const sections = useMemo(() => allSections.map((g) => ({ ...g, tasks: g.tasks.filter(predicate).sort(sorter) })), [allSections, predicate, sorter]);

  if (!projectId || !project || !role) {
    return (
      <div className="pj-view">
        <EmptyState icon={<Lock />} title="This project isn’t visible to you">
          It may be private, archived, or belong to another team. Ask the project admin to add you as a member.
          <br />
          <Link to="/projects/browse" className="btn btn--sm" style={{ marginTop: 12 }}>
            Back to projects
          </Link>
        </EmptyState>
      </div>
    );
  }

  const projectRules = rules.filter((r) => r.projectId === project.id);
  const projectForms = forms.filter((f) => f.projectId === project.id);
  const memberIds = project.members.map((m) => m.userId);
  const memberUsers = memberIds.map((id) => users.get(id)).filter((u): u is User => Boolean(u));

  const commitRename = () => {
    setRenaming(false);
    const name = nameDraft.trim();
    if (name && name !== project.name) report(api().updateProject(project.id, { name }));
  };
  const clearFilters = () => {
    setQ('');
    setAssignee('');
    setStatus('');
    setPriority('');
    setTag('');
    setMine(false);
    setHideDone(false);
  };

  const viewProps: ViewProps = {
    project,
    tasks,
    allTasks,
    sections,
    allSections,
    byId,
    role,
    canEdit,
    canAdmin,
    today,
    openTask,
    filtersActive,
    onAddTask: (sectionId) => setAddOpen({ sectionId }),
  };

  const showToolbar = view !== 'overview' && view !== 'workload' && view !== 'sprints';

  return (
    <div className="pj-view pj-project" style={{ '--c': project.color } as CSSProperties}>
      <header className="pj-proj">
        <div className="pj-proj__row">
          <ProjectIcon project={project} size={44} />
          <div className="pj-proj__titlewrap">
            {renaming ? (
              <input
                ref={nameRef}
                className="pj-proj__rename"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                autoFocus
                aria-label="Project name"
              />
            ) : (
              <h2
                className={cx('pj-proj__name', canAdmin && 'is-editable')}
                title={canAdmin ? 'Click to rename' : undefined}
                onClick={() => {
                  if (!canAdmin) return;
                  setNameDraft(project.name);
                  setRenaming(true);
                }}
              >
                {project.name}
              </h2>
            )}
            <div className="pj-proj__meta">
              <span className="mono">{project.key}</span>
              <span>·</span>
              <span>{project.department}</span>
              <span>·</span>
              <PrivacyBadge privacy={project.privacy} />
              {canAdmin ? (
                <Menu
                  width={200}
                  header="Set health"
                  trigger={(open, toggle) => (
                    <button type="button" className={cx('pj-proj__health', open && 'is-open')} onClick={toggle} aria-label="Change project health">
                      <HealthPill health={project.health} />
                      <ChevronDown />
                    </button>
                  )}
                  items={(Object.keys(HEALTH_META) as ProjectHealth[]).map((h) => ({
                    key: h,
                    label: `${HEALTH_META[h].emoji} ${HEALTH_META[h].label}`,
                    active: project.health === h,
                    onSelect: () => report(api().updateProject(project.id, { health: h })),
                  }))}
                />
              ) : (
                <HealthPill health={project.health} />
              )}
              {project.archived && <span className="badge badge--muted">Archived</span>}
            </div>
          </div>
          <div className="pj-proj__actions">
            <button type="button" className={cx('pj-star pj-star--lg', starred && 'is-on')} aria-pressed={starred} aria-label={starred ? 'Unstar project' : 'Star project'} onClick={() => report(api().toggleStarProject(project.id))}>
              <Star />
            </button>
            <RoleBadge role={role} />
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setRulesOpen(true)} title="Automation rules">
              <Zap /> Rules {projectRules.length > 0 && <span className="pj-mini-count">{projectRules.filter((r) => r.enabled).length}</span>}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setFormsOpen(true)} title="Intake forms">
              <FileText /> Forms {projectForms.length > 0 && <span className="pj-mini-count">{projectForms.length}</span>}
            </button>
            <button type="button" className="pj-proj__members" onClick={() => setMembersOpen(true)} title="Members & sharing">
              <AvatarStack userIds={memberIds} max={4} size={26} />
              <span className="pj-proj__share">
                <Share2 /> Share
              </span>
            </button>
            {canAdmin && (
              <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Project settings" title="Project settings">
                <Settings />
              </button>
            )}
          </div>
        </div>

        <nav className="pj-views" aria-label="Project views">
          {VIEW_ORDER.map((v) => {
            const Icon = VIEW_ICONS[v];
            return (
              <button key={v} type="button" className={cx('pj-views__tab', view === v && 'is-active')} onClick={() => setView(v)} title={VIEW_META[v].hint} aria-current={view === v ? 'page' : undefined}>
                <Icon />
                {VIEW_META[v].label}
              </button>
            );
          })}
        </nav>
      </header>

      {showToolbar && (
        <div className="pj-toolbar">
          <div className="pj-toolbar__search">
            <Search />
            <input className="pj-toolbar__input" placeholder={`Search ${project.key} tasks…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks in project" />
            {q && (
              <button type="button" className="pj-search__clear" onClick={() => setQ('')} aria-label="Clear">
                <X />
              </button>
            )}
          </div>
          <div className="chips pj-toolbar__chips">
            <UserPicker
              value={assignee === 'unassigned' ? undefined : assignee || undefined}
              onChange={(id) => setAssignee(id ?? '')}
              candidates={memberUsers}
              allowNone={false}
              title="Filter by assignee"
              trigger={(open, toggle) => (
                <button type="button" className={cx('chip', (assignee || open) && 'is-active')} onClick={toggle}>
                  <UserRound /> {assignee === 'unassigned' ? 'Unassigned' : assignee ? users.get(assignee)?.name.split(' ')[0] : 'Assignee'}
                </button>
              )}
            />
            {assignee !== 'unassigned' && (
              <button type="button" className="chip" onClick={() => setAssignee('unassigned')} title="Show only unassigned tasks">
                Unassigned
              </button>
            )}
            <Menu
              width={190}
              trigger={(open, toggle) => (
                <button type="button" className={cx('chip', (status || open) && 'is-active')} onClick={toggle}>
                  {status ? STATUS_META[status].label : 'Status'} <ChevronDown />
                </button>
              )}
              items={[
                { key: '', label: 'Any status', active: !status, onSelect: () => setStatus('') },
                ...(Object.keys(STATUS_META) as TaskStatus[]).map((s) => ({ key: s, label: STATUS_META[s].label, active: status === s, onSelect: () => setStatus(s) })),
              ]}
            />
            <Menu
              width={190}
              trigger={(open, toggle) => (
                <button type="button" className={cx('chip', (priority || open) && 'is-active')} onClick={toggle}>
                  {priority ? PRIORITY_META[priority].label : 'Priority'} <ChevronDown />
                </button>
              )}
              items={[
                { key: '', label: 'Any priority', active: !priority, onSelect: () => setPriority('') },
                ...(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => ({ key: p, label: PRIORITY_META[p].label, active: priority === p, onSelect: () => setPriority(p) })),
              ]}
            />
            {tags.length > 0 && (
              <Menu
                width={200}
                trigger={(open, toggle) => (
                  <button type="button" className={cx('chip', (tag || open) && 'is-active')} onClick={toggle}>
                    {tag ? `#${tag}` : 'Tag'} <ChevronDown />
                  </button>
                )}
                items={[{ key: '', label: 'Any tag', active: !tag, onSelect: () => setTag('') }, ...tags.map((t) => ({ key: t, label: `#${t}`, active: tag === t, onSelect: () => setTag(t) }))]}
              />
            )}
            <button type="button" className={cx('chip', mine && 'is-active')} onClick={() => setMine(!mine)} aria-pressed={mine}>
              <Filter /> Only my tasks
            </button>
            <button type="button" className={cx('chip', hideDone && 'is-active')} onClick={() => setHideDone(!hideDone)} aria-pressed={hideDone}>
              <EyeOff /> Hide done
            </button>
            {filtersActive && (
              <button type="button" className="chip pj-chip--clear" onClick={clearFilters}>
                <X /> Clear
              </button>
            )}
          </div>
          <div className="pj-toolbar__right">
            <Menu
              align="right"
              width={200}
              trigger={(open, toggle) => (
                <button type="button" className={cx('btn btn--sm btn--ghost', open && 'is-open')} onClick={toggle}>
                  <ArrowUpDown /> {SORT_LABEL[sort]}
                </button>
              )}
              items={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ key: k, label: SORT_LABEL[k], active: sort === k, onSelect: () => setSort(k) }))}
            />
            {canEdit && (
              <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setAddOpen({})}>
                <Plus /> Add task
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'overview' && (
        <>
          <OverviewView {...viewProps} />
          <section className="pj-panelcard" style={{ marginTop: 18 }}>
            <SectionTitle count={project.members.length} right={<button type="button" className="btn btn--sm" onClick={() => setMembersOpen(true)}>Manage members</button>}>
              Project Team & Roles
            </SectionTitle>
            <div className="pj-member-roles-grid">
              {project.members.map((m) => {
                const u = users.get(m.userId);
                if (!u) return null;
                return (
                  <div key={m.userId} className="pj-member-role-card">
                    <Avatar user={u} size={32} />
                    <div className="grow truncate">
                      <div className="pj-people__name truncate">{u.name}</div>
                      <small className="muted truncate">{u.title}</small>
                    </div>
                    <span className={cx('badge', m.role === 'owner' ? 'badge--info' : 'badge--muted')}>{ROLE_META[m.role].label}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
      {view === 'list' && (
        <>
          <ListView {...viewProps} />
          {canEdit && <AddSectionInline projectId={project.id} />}
        </>
      )}
      {view === 'board' && <BoardViewWithGroup {...viewProps} />}
      {view === 'timeline' && <TimelineView {...viewProps} />}
      {view === 'calendar' && <CalendarView {...viewProps} />}
      {view === 'workload' && <WorkloadView {...viewProps} />}
      {view === 'sprints' && <SprintsView {...viewProps} />}

      {addOpen && <AddTaskModal project={project} sectionId={addOpen.sectionId} members={memberUsers} onClose={() => setAddOpen(null)} onCreated={(id) => openTask(id)} />}
      <MembersModal open={membersOpen} onClose={() => setMembersOpen(false)} project={project} canAdmin={canAdmin} />
      {rulesOpen && <AutomationRulesModal project={project} canAdmin={canAdmin} onClose={() => setRulesOpen(false)} />}
      {formsOpen && <IntakeFormsModal project={project} canAdmin={canAdmin} onClose={() => setFormsOpen(false)} onTaskCreated={(id) => openTask(id)} />}
      {canAdmin && settingsOpen && <ProjectSettingsModal project={project} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ───────────────────────── Inline "+ Add section" for List View ─────────────────────────
function AddSectionInline({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const submit = () => {
    const clean = name.trim();
    if (!clean) return setAdding(false);
    if (report(api().addSection(projectId, clean))) {
      setName('');
      setAdding(false);
    }
  };
  return (
    <div style={{ marginTop: 12 }}>
      {adding ? (
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input pj-select-sm"
            style={{ maxWidth: 260 }}
            placeholder="New section name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setAdding(false);
            }}
            autoFocus
          />
          <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={submit}>
            Add section
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAdding(true)}>
          <Plus /> Add section
        </button>
      )}
    </div>
  );
}

// ───────────────────────── Board View wrapper supporting Section OR Status grouping ─────────────────────────
function BoardViewWithGroup(props: ViewProps) {
  const [groupBy, setGroupBy] = useState<'section' | 'status'>('section');
  const { project, tasks, byId, today, canEdit, openTask } = props;

  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 12 }}>
        <Segmented
          label="Group board by"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: 'section', label: 'By Section' },
            { value: 'status', label: 'By Status' },
          ]}
        />
        <span className="text-xs muted">Drag cards between columns or click a card to open details.</span>
      </div>
      {groupBy === 'section' ? (
        <BoardView {...props} />
      ) : (
        <div className="pj-board" role="list" aria-label="Status Kanban board">
          {(['todo', 'in_progress', 'in_review', 'done'] as TaskStatus[]).map((st) => {
            const colTasks = tasks.filter((t) => t.status === st);
            return (
              <section key={st} className="pj-col" role="listitem" aria-label={STATUS_META[st].label}>
                <header className="pj-col__head">
                  <i className="pj-chip__dot" style={{ background: STATUS_META[st].color }} />
                  <span className="pj-col__name truncate">{STATUS_META[st].label}</span>
                  <span className="pj-wip">{colTasks.length}</span>
                </header>
                <div className="pj-col__body">
                  {colTasks.map((t) => {
                    const blocked = isBlocked(t, byId);
                    const subDone = t.subtasks.filter((s) => s.done).length;
                    return (
                      <article key={t.id} className={cx('pj-card pj-kcard', t.status === 'done' && 'is-done', blocked && 'is-blocked')} onClick={() => openTask(t.id)} role="button" tabIndex={0}>
                        <div className="pj-kcard__top">
                          <span className="pj-kcard__ref mono">
                            {project.key}-{t.number}
                          </span>
                          <TypeGlyph type={t.type} />
                          {t.storyPoints !== undefined && <span className="badge badge--muted mono">{t.storyPoints} pts</span>}
                          <span className="spacer" />
                          <PriorityFlag priority={t.priority} />
                        </div>
                        <div className="pj-kcard__title">{t.title}</div>
                        <div className="pj-kcard__foot">
                          <UserAvatar userId={t.assigneeId} size={22} />
                          <DuePill dueDate={t.dueDate} status={t.status} today={today} />
                          <span className="spacer" />
                          {t.subtasks.length > 0 && (
                            <span className="pj-kcard__meta">
                              <CheckCircle2 /> {subDone}/{t.subtasks.length}
                            </span>
                          )}
                          {t.attachments.length > 0 && (
                            <span className="pj-kcard__meta">
                              <Paperclip /> {t.attachments.length}
                            </span>
                          )}
                          {canEdit && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Menu
                                align="right"
                                width={160}
                                header="Move status"
                                trigger={(open, toggle) => (
                                  <button type="button" className={cx('icon-btn icon-btn--sm', open && 'is-open')} onClick={toggle} aria-label="Move status">
                                    <MoreHorizontal />
                                  </button>
                                )}
                                items={(['todo', 'in_progress', 'in_review', 'done'] as TaskStatus[]).map((nextSt) => ({
                                  key: nextSt,
                                  label: STATUS_META[nextSt].label,
                                  active: t.status === nextSt,
                                  onSelect: () => report(api().updateTask(t.id, { status: nextSt })),
                                }))}
                              />
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {colTasks.length === 0 && <p className="pj-col__empty">No tasks in {STATUS_META[st].label.toLowerCase()}.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Workload View ─────────────────────────
export function WorkloadView({ project, allTasks, today, openTask }: ViewProps) {
  const { rows } = useWorkload(project.id);
  const users = useUserMap();
  const overloaded = rows.filter((r) => r.state === 'over');

  return (
    <div className="pj-workload">
      {overloaded.length > 0 && (
        <div className="pj-alert pj-alert--warn">
          <AlertTriangle />
          <div>
            <b>{overloaded.length} teammate{overloaded.length === 1 ? ' is' : 's are'} over weekly capacity</b> — consider rebalancing tasks due in the next 7 days.
          </div>
        </div>
      )}

      <section className="pj-panelcard">
        <SectionTitle right={<span className="text-xs muted">Weekly focus capacity: 32h / week</span>}>Team Capacity & Workload (Next 7 days)</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState icon={<UserRound />} title="No assigned work yet">
            Assign tasks with hour estimates to see per-member capacity.
          </EmptyState>
        ) : (
          <div className="pj-wl-rows">
            {rows.map((row) => {
              const u = users.get(row.userId);
              if (!u) return null;
              const memberTasks = allTasks.filter((t) => t.assigneeId === u.id && !isDone(t));
              const toneColor = row.state === 'over' ? '#f87171' : row.state === 'under' ? '#60a5fa' : '#34d399';
              return (
                <div key={row.userId} className={cx('pj-wl-row', `pj-wl-row--${row.state}`)}>
                  <div className="pj-wl-row__head">
                    <Avatar user={u} size={34} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="pj-people__name truncate">{u.name}</span>
                        <span className="text-xs muted truncate">{u.title}</span>
                        {row.state === 'over' && (
                          <span className="badge badge--danger">
                            <Flame /> Overloaded ({row.loadPct}%)
                          </span>
                        )}
                      </div>
                      <div className="text-xs muted">
                        <b>{row.openTasks}</b> open tasks · <b>{row.hours}h</b> remaining vs {row.capacity}h weekly capacity
                        {row.overdue > 0 && <span className="pj-danger-text"> · {row.overdue} overdue</span>}
                      </div>
                    </div>
                    <span className="mono text-sm" style={{ color: toneColor }}>
                      <b>{row.loadPct}%</b>
                    </span>
                  </div>
                  <Bar pct={Math.min(100, row.loadPct)} color={toneColor} height={10} />
                  {memberTasks.length > 0 && (
                    <div className="pj-wl-tasks">
                      {memberTasks.map((t) => (
                        <button key={t.id} type="button" className="pj-wl-chip" onClick={() => openTask(t.id)}>
                          <TypeGlyph type={t.type} />
                          <span className="truncate">{t.title}</span>
                          <span className="mono text-xs muted">{t.storyPoints ? `${t.storyPoints}pt` : `${t.estimateHours ?? 4}h`}</span>
                          <DuePill dueDate={t.dueDate} status={t.status} today={today} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ───────────────────────── Sprints View ─────────────────────────
export function SprintsView({ project, allTasks, canEdit, today, openTask }: ViewProps) {
  const { sprints, active, burndown, velocity, backlog } = useProjectSprints(project.id);
  const [newSprintOpen, setNewSprintOpen] = useState(false);

  const completedSprints = sprints.filter((s) => s.sprint.state === 'completed');

  return (
    <div className="pj-sprints">
      <div className="pj-view__head" style={{ marginBottom: 14 }}>
        <div>
          <h3 className="pj-sec-title" style={{ margin: 0 }}>
            Sprints & Velocity · <span className="mono">{velocity} pts</span> avg velocity
          </h3>
          <p className="text-xs muted">Plan two-week iterations, track ideal vs remaining burndown, and roll unfinished work forward.</p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setNewSprintOpen(true)}>
            <Plus /> New sprint
          </button>
        )}
      </div>

      <div className="pj-sprints__charts">
        <section className="pj-panelcard">
          <SectionTitle right={active ? <span className="badge badge--info">{active.name}</span> : undefined}>Sprint Burndown</SectionTitle>
          {!active || burndown.length === 0 ? (
            <p className="pj-empty-row">Start a sprint to see its live daily burndown chart.</p>
          ) : (
            <BurndownSvg points={burndown} />
          )}
        </section>

        <section className="pj-panelcard">
          <SectionTitle right={<span className="mono text-xs muted">Avg {velocity} pts / sprint</span>}>
            <TrendingUp /> Velocity History
          </SectionTitle>
          {sprints.length === 0 ? (
            <p className="pj-empty-row">No sprints recorded yet.</p>
          ) : (
            <div className="pj-vel-bars">
              {sprints.map(({ sprint, stats }) => {
                const committed = sprint.committedPoints ?? stats.committed;
                const done = sprint.completedPoints ?? stats.done;
                const max = Math.max(25, committed, done);
                return (
                  <div key={sprint.id} className="pj-vel-col">
                    <div className="pj-vel-pair">
                      <span className="pj-vel-bar pj-vel-bar--committed" style={{ height: `${Math.round((committed / max) * 100)}%` }} title={`Committed: ${committed} pts`} />
                      <span className="pj-vel-bar pj-vel-bar--done" style={{ height: `${Math.round((done / max) * 100)}%` }} title={`Completed: ${done} pts`} />
                    </div>
                    <span className="pj-vel-label truncate">{sprint.name.split('·')[0]}</span>
                    <small className="mono muted">
                      {done}/{committed} pt
                    </small>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {sprints.map(({ sprint, stats }) => {
        const sprintTasks = allTasks.filter((t) => t.sprintId === sprint.id);
        const pct = stats.committed ? Math.round((stats.done / stats.committed) * 100) : 0;
        const plannedNext = sprints.find((s) => s.sprint.state === 'planned' && s.sprint.id !== sprint.id)?.sprint;
        return (
          <Collapsible
            key={sprint.id}
            title={
              <span className="row" style={{ gap: 8 }}>
                <span>{sprint.name}</span>
                <span className={cx('badge', sprint.state === 'active' ? 'badge--info' : sprint.state === 'completed' ? 'badge--success' : 'badge--muted')}>{sprint.state}</span>
                <span className="text-xs muted">
                  {fmtDay(sprint.startDate)} – {fmtDay(sprint.endDate)}
                </span>
              </span>
            }
            count={sprintTasks.length}
            defaultOpen={sprint.state !== 'completed'}
            right={
              <div className="row" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()}>
                <span className="mono text-xs">
                  <b>{stats.done}</b>/{stats.committed} pts ({pct}%)
                </span>
                {canEdit && sprint.state === 'planned' && !active && (
                  <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => report(api().startSprint(sprint.id))}>
                    <Play /> Start sprint
                  </button>
                )}
                {canEdit && sprint.state === 'active' && (
                  <button type="button" className="btn btn--sm btn--success" onClick={() => report(api().completeSprint(sprint.id, plannedNext?.id))}>
                    <CheckCircle2 /> Complete sprint
                  </button>
                )}
              </div>
            }
          >
            {sprint.goal && <p className="text-xs muted" style={{ margin: '0 0 10px' }}>Goal: {sprint.goal}</p>}
            {sprintTasks.length === 0 ? (
              <p className="pj-empty-row">No tasks assigned to this sprint yet.</p>
            ) : (
              <div className="pj-rows">
                {sprintTasks.map((t) => (
                  <div key={t.id} className={cx('pj-row', t.status === 'done' && 'pj-row--done')} onClick={() => openTask(t.id)} role="button" tabIndex={0}>
                    <span className="mono text-xs muted">
                      {project.key}-{t.number}
                    </span>
                    <span className="pj-row__title truncate">{t.title}</span>
                    {t.storyPoints !== undefined && <span className="badge badge--muted mono">{t.storyPoints} pts</span>}
                    <StatusPill status={t.status} />
                    <PriorityFlag priority={t.priority} />
                    <UserAvatar userId={t.assigneeId} size={22} />
                    <DuePill dueDate={t.dueDate} status={t.status} today={today} />
                  </div>
                ))}
              </div>
            )}
          </Collapsible>
        );
      })}

      <Collapsible title="Backlog (unassigned to a sprint)" count={backlog.length} defaultOpen={sprints.length === 0}>
        {backlog.length === 0 ? (
          <p className="pj-empty-row">All open tasks are scheduled into sprints.</p>
        ) : (
          <div className="pj-rows">
            {backlog.map((t) => (
              <div key={t.id} className="pj-row" onClick={() => openTask(t.id)} role="button" tabIndex={0}>
                <span className="mono text-xs muted">
                  {project.key}-{t.number}
                </span>
                <span className="pj-row__title truncate">{t.title}</span>
                <PriorityFlag priority={t.priority} />
                <UserAvatar userId={t.assigneeId} size={22} />
                {canEdit && active && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      report(api().updateTask(t.id, { sprintId: active.id }), `Added to ${active.name}`);
                    }}
                  >
                    + {active.name.split('·')[0]}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {completedSprints.length > 0 && <p className="field-hint">{completedSprints.length} completed sprint{completedSprints.length === 1 ? '' : 's'} contributing to team velocity.</p>}

      {newSprintOpen && <NewSprintModal project={project} onClose={() => setNewSprintOpen(false)} />}
    </div>
  );
}

function BurndownSvg({ points }: { points: { date: string; remaining: number; ideal: number }[] }) {
  const w = 480;
  const h = 170;
  const pad = 26;
  const maxVal = Math.max(10, ...points.map((p) => Math.max(p.ideal, Number.isFinite(p.remaining) ? p.remaining : 0)));
  const xFor = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const yFor = (v: number) => h - pad - (v / maxVal) * (h - pad * 2);

  const idealPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.ideal).toFixed(1)}`).join(' ');
  const actualPts = points.map((p, i) => ({ ...p, i })).filter((p) => Number.isFinite(p.remaining));
  const actualPath = actualPts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(p.i).toFixed(1)},${yFor(p.remaining).toFixed(1)}`).join(' ');

  return (
    <div className="pj-burndown">
      <svg viewBox={`0 0 ${w} ${h}`} className="pj-burndown__svg" aria-label="Sprint burndown chart">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border-2)" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="var(--border-2)" />
        <path d={idealPath} fill="none" stroke="var(--text-3)" strokeDasharray="4 4" strokeWidth="1.75" />
        {actualPath && <path d={actualPath} fill="none" stroke="#a78bfa" strokeWidth="2.5" />}
        {actualPts.map((p) => (
          <circle key={p.date} cx={xFor(p.i)} cy={yFor(p.remaining)} r="3.5" fill="#a78bfa">
            <title>{`${p.date}: ${p.remaining} pts remaining`}</title>
          </circle>
        ))}
      </svg>
      <div className="row row--between text-xs muted">
        <span>{points[0]?.date}</span>
        <span>Dashed: ideal · Violet: remaining points</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function NewSprintModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const today = todayISO();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysISO(today, 14));

  const create = () => {
    const res = api().createSprint(project.id, { name: name.trim() || 'New Sprint', goal, startDate, endDate });
    if (report(res)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`New sprint in ${project.name}`}
      icon={<Timer className="pj-modal-icon" />}
      width={480}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" disabled={endDate <= startDate} onClick={create}>
            <Check /> Create sprint
          </button>
        </>
      }
    >
      <div className="pj-form">
        <label className="field">
          <span className="field-label">Sprint name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sprint 16 · Polish & GA" autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Sprint goal</span>
          <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What is the primary outcome of this cycle?" />
        </label>
        <div className="pj-form__grid">
          <label className="field">
            <span className="field-label">Start date</span>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">End date</span>
            <input type="date" className="input" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Automation Rules Modal ─────────────────────────
function AutomationRulesModal({ project, canAdmin, onClose }: { project: Project; canAdmin: boolean; onClose: () => void }) {
  const rules = useProjects((s) => s.rules.filter((r) => r.projectId === project.id));
  const users = useActiveUsers();
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<RuleTrigger>('task_moved_to_section');
  const [triggerSectionId, setTriggerSectionId] = useState(project.sections[project.sections.length - 1]?.id ?? '');
  const [action, setAction] = useState<RuleAction>('set_status');
  const [actionValue, setActionValue] = useState('done');

  const addRule = () => {
    const res = api().upsertRule(project.id, {
      name: name.trim() || `${RULE_TRIGGER_META[trigger]} → ${RULE_ACTION_META[action]}`,
      trigger,
      triggerSectionId: trigger === 'task_moved_to_section' ? triggerSectionId : undefined,
      action,
      actionValue: action === 'notify_owner' ? undefined : actionValue,
      enabled: true,
    });
    if (report(res)) setName('');
  };

  return (
    <Modal open onClose={onClose} title="Automation Rules" subtitle={`No-code triggers & actions running on ${project.name}`} icon={<Zap className="pj-modal-icon" />} width={620}>
      <div className="pj-form">
        {rules.length === 0 ? (
          <p className="pj-empty-row">No automation rules configured yet.</p>
        ) : (
          <ul className="pj-rules-list">
            {rules.map((r) => (
              <li key={r.id} className="pj-rule-row">
                <Switch checked={r.enabled} onChange={(v) => report(api().toggleRule(r.id, v))} label={`Toggle ${r.name}`} disabled={!canAdmin} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="pj-people__name">{r.name}</div>
                  <small className="muted">
                    When <b>{RULE_TRIGGER_META[r.trigger].toLowerCase()}</b> → <b>{RULE_ACTION_META[r.action].toLowerCase()}</b>
                    {r.actionValue ? ` (${r.actionValue})` : ''} · {r.runs} run{r.runs === 1 ? '' : 's'}
                  </small>
                </div>
                {canAdmin && (
                  <button type="button" className="icon-btn icon-btn--sm" onClick={() => report(api().deleteRule(r.id))} aria-label={`Delete rule ${r.name}`}>
                    <Trash2 />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdmin && (
          <div className="pj-panelcard" style={{ padding: 14, marginTop: 10 }}>
            <div className="field-label" style={{ marginBottom: 10 }}>
              + Add Automation Rule
            </div>
            <div className="pj-form__grid">
              <label className="field pj-form__span2">
                <span className="field-label">Rule name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auto-complete tasks moved to Done" />
              </label>
              <label className="field">
                <span className="field-label">When trigger…</span>
                <select className="select" value={trigger} onChange={(e) => setTrigger(e.target.value as RuleTrigger)}>
                  {(Object.keys(RULE_TRIGGER_META) as RuleTrigger[]).map((t) => (
                    <option key={t} value={t}>
                      {RULE_TRIGGER_META[t]}
                    </option>
                  ))}
                </select>
              </label>
              {trigger === 'task_moved_to_section' && (
                <label className="field">
                  <span className="field-label">Target section</span>
                  <select className="select" value={triggerSectionId} onChange={(e) => setTriggerSectionId(e.target.value)}>
                    {project.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span className="field-label">Then action…</span>
                <select
                  className="select"
                  value={action}
                  onChange={(e) => {
                    const next = e.target.value as RuleAction;
                    setAction(next);
                    if (next === 'set_status') setActionValue('done');
                    else if (next === 'set_priority') setActionValue('urgent');
                    else if (next === 'move_to_section') setActionValue(project.sections[0]?.id ?? '');
                    else if (next === 'assign_to' || next === 'add_collaborator') setActionValue(project.ownerId);
                    else if (next === 'add_tag') setActionValue(QUICK_TAGS[0]);
                  }}
                >
                  {(Object.keys(RULE_ACTION_META) as RuleAction[]).map((a) => (
                    <option key={a} value={a}>
                      {RULE_ACTION_META[a]}
                    </option>
                  ))}
                </select>
              </label>
              {action === 'set_status' && (
                <label className="field">
                  <span className="field-label">Status value</span>
                  <select className="select" value={actionValue} onChange={(e) => setActionValue(e.target.value)}>
                    {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {action === 'set_priority' && (
                <label className="field">
                  <span className="field-label">Priority value</span>
                  <select className="select" value={actionValue} onChange={(e) => setActionValue(e.target.value)}>
                    {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {action === 'move_to_section' && (
                <label className="field">
                  <span className="field-label">Section</span>
                  <select className="select" value={actionValue} onChange={(e) => setActionValue(e.target.value)}>
                    {project.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(action === 'assign_to' || action === 'add_collaborator') && (
                <label className="field">
                  <span className="field-label">Person</span>
                  <select className="select" value={actionValue} onChange={(e) => setActionValue(e.target.value)}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {action === 'add_tag' && (
                <label className="field">
                  <span className="field-label">Tag</span>
                  <input className="input" value={actionValue} onChange={(e) => setActionValue(e.target.value)} placeholder="e.g. overdue" />
                </label>
              )}
            </div>
            <button type="button" className="btn btn--sm btn--primary pj-btn-violet" style={{ marginTop: 10 }} onClick={addRule}>
              <Plus /> Add rule
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ───────────────────────── Intake Forms Modal ─────────────────────────
function IntakeFormsModal({ project, canAdmin, onClose, onTaskCreated }: { project: Project; canAdmin: boolean; onClose: () => void; onTaskCreated: (taskId: string) => void }) {
  const forms = useProjects((s) => s.forms.filter((f) => f.projectId === project.id));
  const [submitting, setSubmitting] = useState<IntakeForm | null>(forms[0] ?? null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [targetSectionId, setTargetSectionId] = useState(project.sections[0]?.id ?? '');

  if (submitting) {
    return (
      <FormSubmitModal
        form={submitting}
        onClose={() => {
          setSubmitting(null);
          onClose();
        }}
        onSubmitted={(id) => {
          setSubmitting(null);
          onClose();
          onTaskCreated(id);
        }}
      />
    );
  }

  const createDefaultForm = () => {
    const res = api().upsertForm(project.id, {
      title: title.trim() || `${project.name} Request`,
      description: desc.trim() || 'Submit a work request directly into this project.',
      targetSectionId,
      defaultAssigneeId: project.ownerId,
      defaultPriority: 'medium',
      enabled: true,
      fields: [
        { id: 'f-title', label: 'Request summary', type: 'text', required: true, mapsTo: 'title' },
        { id: 'f-details', label: 'Details & context', type: 'textarea', required: true, mapsTo: 'description' },
        { id: 'f-due', label: 'Target date', type: 'date', required: false, mapsTo: 'dueDate' },
      ],
    });
    if (report(res)) {
      setCreating(false);
      setTitle('');
      setDesc('');
    }
  };

  return (
    <Modal open onClose={onClose} title="Intake Forms" subtitle="Standardized request forms that turn submissions into triaged tasks." icon={<FileText className="pj-modal-icon" />} width={560}>
      <div className="pj-form">
        {forms.length === 0 ? (
          <p className="pj-empty-row">No intake forms configured for this project yet.</p>
        ) : (
          <ul className="pj-forms">
            {forms.map((f) => (
              <li key={f.id} className="pj-formcard">
                <div className="grow">
                  <div className="pj-formcard__title">{f.title}</div>
                  <small className="muted">
                    {f.description} · {f.submissions} submission{f.submissions === 1 ? '' : 's'}
                  </small>
                </div>
                <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setSubmitting(f)}>
                  <Send /> Preview & Submit
                </button>
              </li>
            ))}
          </ul>
        )}

        {canAdmin && !creating && (
          <button type="button" className="btn btn--sm" onClick={() => setCreating(true)}>
            <Plus /> Create intake form
          </button>
        )}

        {canAdmin && creating && (
          <div className="pj-panelcard" style={{ padding: 14 }}>
            <div className="pj-form__grid">
              <label className="field pj-form__span2">
                <span className="field-label">Form title</span>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bug report / Feature request" autoFocus />
              </label>
              <label className="field pj-form__span2">
                <span className="field-label">Description</span>
                <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Instructions shown at the top of the form" />
              </label>
              <label className="field pj-form__span2">
                <span className="field-label">Route submissions into section</span>
                <select className="select" value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}>
                  {project.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={createDefaultForm}>
                Save form
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ───────────────────────── Project Settings Modal ─────────────────────────
function ProjectSettingsModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [icon, setIcon] = useState(project.icon);
  const [color, setColor] = useState(project.color);
  const [privacy, setPrivacy] = useState<ProjectPrivacy>(project.privacy);
  const [defaultView, setDefaultView] = useState<ViewId>(project.defaultView);
  const [startDate, setStartDate] = useState(project.startDate);
  const [dueDate, setDueDate] = useState(project.dueDate);

  const save = () => {
    const res = api().updateProject(project.id, { name, description, icon, color, privacy, defaultView, startDate, dueDate });
    if (report(res)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Project Settings"
      subtitle={`${project.key} · ${project.department}`}
      icon={<Settings2 className="pj-modal-icon" />}
      width={580}
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost pj-danger-text"
            onClick={() => {
              if (report(api().archiveProject(project.id, !project.archived))) onClose();
            }}
          >
            <Archive /> {project.archived ? 'Restore project' : 'Archive project'}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={save}>
            <Check /> Save settings
          </button>
        </>
      }
    >
      <div className="pj-form">
        <div className="pj-form__grid">
          <label className="field pj-form__span2">
            <span className="field-label">Project name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field pj-form__span2">
            <span className="field-label">Description</span>
            <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="field">
            <span className="field-label">Icon</span>
            <div className="pj-swatches">
              {PROJECT_ICONS.map((ic) => (
                <button key={ic} type="button" className={cx('pj-swatch pj-swatch--icon', icon === ic && 'is-active')} onClick={() => setIcon(ic)}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Color</span>
            <div className="pj-swatches">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" className={cx('pj-swatch', color === c && 'is-active')} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">Start date</span>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Target date</span>
            <input type="date" className="input" min={startDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Privacy</span>
            <select className="select" value={privacy} onChange={(e) => setPrivacy(e.target.value as ProjectPrivacy)}>
              <option value="public">Public</option>
              <option value="team">Team</option>
              <option value="private">Private</option>
            </select>
            <span className="field-hint">{PRIVACY_HELP[privacy]}</span>
          </label>
          <label className="field">
            <span className="field-label">Default view</span>
            <select className="select" value={defaultView} onChange={(e) => setDefaultView(e.target.value as ViewId)}>
              {VIEW_ORDER.map((v) => (
                <option key={v} value={v}>
                  {VIEW_META[v].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Add task modal ─────────────────────────
function AddTaskModal({ project, sectionId, members, onClose, onCreated }: { project: Project; sectionId?: string; members: User[]; onClose: () => void; onCreated: (taskId: string) => void }) {
  const me = useSessionUser();
  const all = useActiveUsers();
  const users = useUserMap();
  const [title, setTitle] = useState('');
  const [section, setSection] = useState(sectionId ?? project.sections[0]?.id ?? '');
  const [type, setType] = useState<TaskType>('task');
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
  const [approverId, setApproverId] = useState<string | undefined>(undefined);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimate, setEstimate] = useState('');
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState('');
  const [another, setAnother] = useState(false);

  const submit = (keepOpen: boolean) => {
    const res = api().createTask({
      projectId: project.id,
      sectionId: section,
      title,
      type,
      assigneeId,
      approverId: type === 'approval' ? approverId : undefined,
      dueDate: dueDate || undefined,
      priority,
      estimateHours: estimate ? Number(estimate) : undefined,
      storyPoints: points ? Number(points) : undefined,
      description,
    });
    if (!report(res)) return;
    if (keepOpen) {
      setTitle('');
      setDescription('');
      setAnother(true);
      return;
    }
    onClose();
    if (res.taskId) onCreated(res.taskId);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`New task in ${project.name}`}
      subtitle={another ? 'Added — keep going or close when you’re done.' : 'Title is all you need; everything else can wait.'}
      icon={<Sparkles className="pj-modal-icon" />}
      width={620}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={title.trim().length < 2} onClick={() => submit(true)}>
            Add another
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" disabled={title.trim().length < 2 || (type === 'approval' && !approverId)} onClick={() => submit(false)}>
            <Check /> Create task
          </button>
        </>
      }
    >
      <div className="pj-form">
        <input
          className="pj-bigtitle"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim().length >= 2 && !(type === 'approval' && !approverId)) submit(false);
          }}
          data-autofocus
          autoFocus
          aria-label="Task title"
        />
        <div className="pj-form__grid">
          <label className="field">
            <span className="field-label">Section</span>
            <select className="select" value={section} onChange={(e) => setSection(e.target.value)}>
              {project.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Type</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {(Object.keys(TASK_TYPE_META) as TaskType[]).map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field-label">Assignee</span>
            <UserPicker
              value={assigneeId}
              onChange={setAssigneeId}
              candidates={members}
              others={all}
              trigger={(open, toggle) => (
                <button type="button" className={cx('pj-pickbtn', open && 'is-open')} onClick={toggle}>
                  <UserAvatar userId={assigneeId} size={22} name />
                  <ChevronDown />
                </button>
              )}
            />
          </div>
          {type === 'approval' && (
            <div className="field">
              <span className="field-label">Approver</span>
              <UserPicker
                value={approverId}
                onChange={setApproverId}
                candidates={members.filter((u) => u.id !== me?.id)}
                others={all.filter((u) => u.id !== me?.id)}
                allowNone={false}
                title="Who decides?"
                trigger={(open, toggle) => (
                  <button type="button" className={cx('pj-pickbtn', open && 'is-open')} onClick={toggle}>
                    <UserAvatar userId={approverId} size={22} name title={approverId ? users.get(approverId)?.name : 'Choose approver'} />
                    <ChevronDown />
                  </button>
                )}
              />
              <span className="field-hint">Separation of duties: you can’t approve your own request.</span>
            </div>
          )}
          <label className="field">
            <span className="field-label">Due date</span>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Priority</span>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Estimate (hours)</span>
            <input type="number" min={0} step={0.5} className="input" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 4" />
          </label>
          <label className="field">
            <span className="field-label">Story points</span>
            <input type="number" min={0} step={1} className="input" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="e.g. 3" />
          </label>
          <label className="field pj-form__span2">
            <span className="field-label">Description</span>
            <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context, acceptance criteria, links…" />
          </label>
        </div>
      </div>
    </Modal>
  );
}
