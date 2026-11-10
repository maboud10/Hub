/**
 * Project workspace — header, view tabs, filters, and the active view.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Archive,
  ArchiveRestore,
  Copy,
  CopyPlus,
  Filter,
  Gauge,
  Link2,
  Lock,
  Megaphone,
  MoreHorizontal,
  Plus,
  Settings2,
  Share2,
  Star,
  StarOff,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { Avatars, NeoEmpty, NeoHead, NeoMenu, NeoPopover, NeoSearch, NeoTabs, type MenuEntry } from '@/components/neo';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { PRIVACY_LABEL, canAdminProject, canCreateProject, canEditProject, projectAccess, readOnlyReason, ROLE_LABEL } from '@/projects/access';
import { formatDue } from '@/projects/dates';
import { projectMetrics, STATUS_LABEL } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import { ProjectSigil } from '@/projects/sigils';
import { useProjects } from '@/projects/store';
import { VIEW_IDS, type Priority, type ProjectStatus, type ViewId } from '@/projects/types';
import { pushUndo, useActor, useMyState, useProjectsUI, useUsersMap } from './ctx';
import {
  IconViewAutomations,
  IconViewBoard,
  IconViewCalendar,
  IconViewDashboard,
  IconViewFiles,
  IconViewGraph,
  IconViewList,
  IconViewOverview,
  IconViewTimeline,
} from './icons';
import { ConfirmModal, PriorityGlyph, StatusPill, STATUSES, STATUS_TONE } from './ui';
import { EMPTY_FILTERS, activeFilterCount, type Filters } from './views/shared';
import { ProjectSettingsModal, ShareModal, StatusUpdateModal } from './ProjectModals';
import { ListView } from './views/ListView';
import { BoardView } from './views/BoardView';
import { TimelineView } from './views/TimelineView';
import { CalendarView } from './views/CalendarView';
import { GraphView } from './views/GraphView';
import { DashboardView } from './views/DashboardView';
import { OverviewView } from './views/OverviewView';
import { FilesView } from './views/FilesView';
import { AutomationsView } from './views/AutomationsView';

const VIEW_META: Record<ViewId, { label: string; icon: React.ReactNode }> = {
  overview: { label: 'Overview', icon: <IconViewOverview /> },
  list: { label: 'List', icon: <IconViewList /> },
  board: { label: 'Board', icon: <IconViewBoard /> },
  timeline: { label: 'Timeline', icon: <IconViewTimeline /> },
  calendar: { label: 'Calendar', icon: <IconViewCalendar /> },
  graph: { label: 'Graph', icon: <IconViewGraph /> },
  dashboard: { label: 'Dashboard', icon: <IconViewDashboard /> },
  files: { label: 'Files', icon: <IconViewFiles /> },
  automations: { label: 'Automations', icon: <IconViewAutomations /> },
};
const FILTERABLE: ViewId[] = ['list', 'board', 'timeline', 'calendar', 'graph'];

export function ProjectView({ projectId, view: viewParam }: { projectId: string; view?: string }) {
  const actor = useActor();
  const ui = useProjectsUI();
  const navigate = useNavigate();
  const users = useUsersMap();
  const me = useMyState();
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const allTasks = useProjects((s) => s.tasks);
  const store = useProjects.getState;
  const setLastView = useProjects((s) => s.setLastView);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [share, setShare] = useState(false);
  const [settings, setSettings] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtn = useRef<HTMLButtonElement>(null);

  const access = project && actor ? projectAccess(project, actor) : null;
  const view: ViewId = VIEW_IDS.includes(viewParam as ViewId) ? (viewParam as ViewId) : (me.lastView[projectId] ?? 'board');
  useEffect(() => {
    if (project && access) setLastView(projectId, view);
  }, [projectId, view, project, access, setLastView]);

  const tasks = useMemo(() => allTasks.filter((t) => t.projectId === projectId), [allTasks, projectId]);
  const metrics = useMemo(() => (project ? projectMetrics(project, tasks, Date.now()) : null), [project, tasks]);
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort(), [tasks]);

  if (!actor) return null;
  if (!project || !access)
    return (
      <div className="neo-body neo-pad">
        <NeoEmpty
          icon={<Lock />}
          title="Project not available"
          action={
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/projects/browse')}>
              Browse projects
            </button>
          }
        >
          It may be private, archived or deleted — or you don’t have access. Ask the owner to share it with you.
        </NeoEmpty>
      </div>
    );

  const canEdit = canEditProject(project, actor);
  const canAdmin = canAdminProject(project, actor);
  const owner = users.get(project.ownerId);
  const starred = me.starred.includes(project.id);
  const members = project.members.map((m) => users.get(m.userId)).filter((u): u is NonNullable<typeof u> => !!u);
  const ro = readOnlyReason(project, actor, owner?.name);

  const go = (v: ViewId) => navigate(`/projects/p/${project.id}/${v}`);

  const menu: MenuEntry[] = [
    { label: 'Post status update', icon: <Megaphone />, disabled: !canEdit, onSelect: () => setStatus(project.status) },
    { label: 'Project settings', icon: <Settings2 />, disabled: !canEdit, onSelect: () => setSettings(true) },
    { label: starred ? 'Unstar' : 'Star', icon: starred ? <StarOff /> : <Star />, onSelect: () => store().toggleStar(project.id) },
    {
      label: 'Copy link',
      icon: <Link2 />,
      onSelect: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}/projects/p/${project.id}/${view}`);
        toast.success('Link copied');
      },
    },
    {
      label: 'Duplicate as template',
      icon: <CopyPlus />,
      disabled: !canCreateProject(actor),
      onSelect: () => {
        const r = store().duplicateProject(project.id);
        if (!r.ok) return toast.error(r.error);
        toast.success('Template created', 'Tasks copied without assignees, dates or comments.');
        navigate(`/projects/p/${r.projectId}/list`);
      },
    },
    { kind: 'sep' },
    {
      label: project.archived ? 'Restore project' : 'Archive project',
      icon: project.archived ? <ArchiveRestore /> : <Archive />,
      disabled: !canAdmin,
      onSelect: () => {
        const r = store().archiveProject(project.id, !project.archived);
        if (toast.result(r, project.archived ? 'Project restored' : 'Project archived') && !project.archived) pushUndo(`Archived ${project.key}`, () => store().archiveProject(project.id, false));
      },
    },
    { label: 'Delete project', icon: <Trash2 />, danger: true, disabled: !canAdmin, onSelect: () => setConfirmDelete(true) },
  ];

  const nFilters = activeFilterCount(filters);
  const assigneeIds = [...new Set(tasks.map((t) => t.assigneeId ?? 'none'))];

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={<ProjectSigil icon={project.icon} color={project.color} size={40} />}
        eyebrow={
          <>
            {project.key} · {project.department} · {project.privacy === 'private' ? <Lock className="pj-eyebrow-ico" /> : null}
            {PRIVACY_LABEL[project.privacy]}
            {project.archived ? ' · Archived' : ''}
          </>
        }
        title={project.name}
        sub={
          <span className="pj-headsub">
            <NeoMenu
              label="Project status"
              width={220}
              items={STATUSES.map((s) => ({
                label: STATUS_LABEL[s],
                icon: <i className="pj-status__orb" data-tone={STATUS_TONE[s]} style={{ background: 'rgb(var(--tone))' }} />,
                checked: project.status === s,
                disabled: !canEdit,
                onSelect: () => setStatus(s),
              }))}
              trigger={(p) => (
                <button {...p} type="button" className="pj-statusbtn" disabled={!canEdit} aria-label={`Status: ${STATUS_LABEL[project.status]}`}>
                  <StatusPill status={project.status} />
                </button>
              )}
            />
            {metrics && (
              <span className="pj-headsub__meta">
                {Math.round(metrics.progress * 100)}% · {metrics.open} open{metrics.overdue ? ` · ${metrics.overdue} overdue` : ''} · due {formatDue(project.dueDate)}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--ghost pj-sharebtn" onClick={() => setShare(true)} data-qa="share" aria-label="Members and sharing">
              <Avatars users={members} max={4} size={24} />
              <Share2 className="pj-sharebtn__ico" />
              <span className="neo-btn__label">Share</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              disabled={!canEdit}
              title={ro ?? undefined}
              onClick={() => ui.quickAdd({ projectId: project.id })}
              data-qa="new-task"
              data-tip={canEdit ? 'Add task  C' : undefined}
              data-tip-pos="bottom"
            >
              <Plus /> <span className="neo-btn__label">Add task</span>
            </button>
            <NeoMenu
              items={menu}
              width={240}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="Project actions">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-toolbar pj-toolbar">
        <NeoTabs
          label="Project views"
          variant="underline"
          value={view}
          onChange={go}
          items={VIEW_IDS.map((v) => ({ value: v, label: VIEW_META[v].label, icon: VIEW_META[v].icon }))}
          className="pj-viewtabs"
        />
        {FILTERABLE.includes(view) && (
          <div className="pj-filters">
            <SearchBox value={filters.q} onChange={(q) => setFilters((f) => ({ ...f, q }))} />
            <button type="button" className={cx('pj-fchip', filters.mine && 'is-on')} aria-pressed={filters.mine} onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}>
              <UserRound /> Mine
            </button>
            <button ref={filterBtn} type="button" className={cx('pj-fchip', nFilters - (filters.mine ? 1 : 0) > 0 && 'is-on')} onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}>
              <Filter /> Filter{nFilters - (filters.mine ? 1 : 0) > 0 ? ` · ${nFilters - (filters.mine ? 1 : 0)}` : ''}
            </button>
            {nFilters > 0 && (
              <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Clear filters" data-tip="Clear filters" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
                <X />
              </button>
            )}
          </div>
        )}
      </div>
      {ro && view !== 'overview' && view !== 'dashboard' && (
        <div className="pj-robanner">
          <Lock /> {ro} <span className="neo-faint">· Your role: {ROLE_LABEL[access]}</span>
        </div>
      )}

      <div className={cx('neo-body', `pj-view pj-view--${view}`)}>
        {view === 'overview' && <OverviewView project={project} tasks={tasks} onPostUpdate={() => setStatus(project.status)} onShare={() => setShare(true)} />}
        {view === 'list' && <ListView project={project} tasks={tasks} filters={filters} />}
        {view === 'board' && <BoardView project={project} tasks={tasks} filters={filters} />}
        {view === 'timeline' && <TimelineView project={project} tasks={tasks} filters={filters} />}
        {view === 'calendar' && <CalendarView project={project} tasks={tasks} filters={filters} />}
        {view === 'graph' && <GraphView project={project} tasks={tasks} filters={filters} />}
        {view === 'dashboard' && <DashboardView project={project} tasks={tasks} />}
        {view === 'files' && <FilesView project={project} tasks={tasks} />}
        {view === 'automations' && <AutomationsView project={project} />}
      </div>

      <NeoPopover open={filterOpen} anchor={filterBtn.current} onClose={() => setFilterOpen(false)} placement="bottom-end" width={300} label="Filters">
        <div className="pj-filterpop">
          <div className="neo-menu__label">Show</div>
          <label className="pj-filterpop__row">
            <input type="checkbox" className="neo-check" checked={filters.hideDone} onChange={(e) => setFilters((f) => ({ ...f, hideDone: e.target.checked }))} /> Hide completed
          </label>
          <div className="neo-menu__label">Due</div>
          <div className="pj-filterpop__chips">
            {(['any', 'overdue', 'week', 'none'] as const).map((d) => (
              <button key={d} type="button" className={cx('pj-fchip pj-fchip--sm', filters.due === d && 'is-on')} onClick={() => setFilters((f) => ({ ...f, due: d }))}>
                {d === 'any' ? 'Any time' : d === 'overdue' ? 'Overdue' : d === 'week' ? 'This week' : 'No date'}
              </button>
            ))}
          </div>
          <div className="neo-menu__label">Priority</div>
          <div className="pj-filterpop__chips">
            {(['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                className={cx('pj-fchip pj-fchip--sm', filters.priorities.includes(p) && 'is-on')}
                onClick={() => setFilters((f) => ({ ...f, priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p] }))}
              >
                <PriorityGlyph priority={p} /> {PRIORITY_NAME[p]}
              </button>
            ))}
          </div>
          <div className="neo-menu__label">Assignee</div>
          <div className="pj-filterpop__chips">
            {assigneeIds.map((id) => (
              <button
                key={id}
                type="button"
                className={cx('pj-fchip pj-fchip--sm', filters.assignees.includes(id) && 'is-on')}
                onClick={() => setFilters((f) => ({ ...f, assignees: f.assignees.includes(id) ? f.assignees.filter((x) => x !== id) : [...f.assignees, id] }))}
              >
                {id === 'none' ? 'Unassigned' : (users.get(id)?.name.split(' ')[0] ?? id)}
              </button>
            ))}
          </div>
          {tags.length > 0 && (
            <>
              <div className="neo-menu__label">Tags</div>
              <div className="pj-filterpop__chips">
                {tags.map((t) => (
                  <button key={t} type="button" className={cx('pj-fchip pj-fchip--sm', filters.tags.includes(t) && 'is-on')} onClick={() => setFilters((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </NeoPopover>

      <ShareModal open={share} onClose={() => setShare(false)} project={project} />
      <ProjectSettingsModal open={settings} onClose={() => setSettings(false)} project={project} />
      <StatusUpdateModal open={status !== null} initialStatus={status ?? project.status} onClose={() => setStatus(null)} project={project} tasks={tasks} />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${project.name}?`}
        confirmLabel="Delete project"
        danger
        onConfirm={() => {
          const r = store().deleteProject(project.id);
          if (!r.ok) return toast.error(r.error);
          const snap = r.snapshot;
          navigate('/projects/browse');
          pushUndo(`Deleted ${project.key}`, () => {
            store().restoreProject(snap);
            navigate(`/projects/p/${snap.project.id}`);
          });
        }}
      >
        This removes the project, its {tasks.length} tasks, automations and status updates for everyone. You can undo for a few seconds; the deletion is recorded in the audit log.
      </ConfirmModal>
    </>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ui = useProjectsUI();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ui.registerSearch(ref.current);
    return () => ui.registerSearch(null);
  }, [ui]);
  return <NeoSearch value={value} onChange={onChange} size="sm" placeholder="Filter tasks" kbd="s" inputRef={ref} className="pj-filters__search" label="Filter tasks" />;
}

export const _icons = { Copy, Gauge };
