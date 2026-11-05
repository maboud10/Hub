/**
 * Memoised, permission-aware selectors for Helix Projects.
 * Pure `compute*` helpers are exported for tests; hooks wrap them with useMemo.
 */
import { useMemo } from 'react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { todayISO } from '@/hr/calendar';
import * as access from './access';
import {
  bucketFor,
  computeProgress,
  computeWorkload,
  goalProgress,
  isBlocked,
  isDone,
  isOverdue,
  sprintBurndown,
  sprintStats,
  suggestFocus,
  suggestHealth,
  velocity,
  type FocusSuggestion,
  type Progress,
  type WorkloadRow,
} from './engine';
import { useProjects } from './store';
import type { Goal, MyTasksBucket, Portfolio, Project, ProjectRole, ProjectsUserState, Sprint, Task } from './types';

const EMPTY_STATE: ProjectsUserState = { starredProjectIds: [], recentProjectIds: [], buckets: {}, inboxReadAt: 0 };

export function useProjectsViewer(): access.ProjectsViewer | null {
  const sessionUserId = useHub((s) => s.sessionUserId);
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => access.buildProjectsViewer(users.find((u) => u.id === sessionUserId), roles), [sessionUserId, users, roles]);
}

export function useProjectsCaps() {
  const v = useProjectsViewer();
  return useMemo(
    () => ({
      viewer: v,
      canUse: access.canUseProjects(v),
      canCreate: access.canCreateProject(v),
      canManage: access.canManageProjects(v),
      isContractor: v ? access.isContractor(v) : true,
    }),
    [v],
  );
}

export function useMyProjectsState(): ProjectsUserState {
  const v = useProjectsViewer();
  const state = useProjects((s) => s.userState);
  return (v && state[v.userId]) || EMPTY_STATE;
}

export interface ProjectCard {
  project: Project;
  role: ProjectRole;
  progress: Progress;
  suggestedHealth: Project['health'];
  openTasks: number;
  myOpenTasks: number;
  starred: boolean;
  lastUpdateAt?: number;
}

export function computeVisibleProjects(v: access.ProjectsViewer | null, projects: Project[], tasks: Task[], state: ProjectsUserState, today: string, updates: { projectId: string; at: number }[] = []): ProjectCard[] {
  if (!v) return [];
  return projects
    .map((project) => {
      const role = access.projectRoleFor(v, project);
      if (!role) return null;
      const scoped = tasks.filter((t) => t.projectId === project.id);
      const progress = computeProgress(scoped, today);
      return {
        project,
        role,
        progress,
        suggestedHealth: suggestHealth(progress, project, today),
        openTasks: scoped.filter((t) => !isDone(t)).length,
        myOpenTasks: scoped.filter((t) => !isDone(t) && t.assigneeId === v.userId).length,
        starred: state.starredProjectIds.includes(project.id),
        lastUpdateAt: updates.filter((u) => u.projectId === project.id).sort((a, b) => b.at - a.at)[0]?.at,
      } as ProjectCard;
    })
    .filter((x): x is ProjectCard => Boolean(x))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || b.project.updatedAt - a.project.updatedAt);
}

export function useVisibleProjects(includeArchived = false): ProjectCard[] {
  const v = useProjectsViewer();
  const projects = useProjects((s) => s.projects);
  const tasks = useProjects((s) => s.tasks);
  const updates = useProjects((s) => s.statusUpdates);
  const state = useMyProjectsState();
  return useMemo(() => computeVisibleProjects(v, projects.filter((p) => includeArchived || !p.archived), tasks, state, todayISO(), updates), [v, projects, tasks, state, updates, includeArchived]);
}

export function useProject(projectId: string | undefined) {
  const v = useProjectsViewer();
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  return useMemo(() => {
    const role = access.projectRoleFor(v, project);
    return {
      project: role ? project : undefined,
      role,
      canEdit: access.canEditProject(v, project),
      canComment: access.canCommentProject(v, project),
      canAdmin: access.canAdminProject(v, project),
    };
  }, [v, project]);
}

export interface SectionGroup {
  section: Project['sections'][number];
  tasks: Task[];
  openCount: number;
  overWip: boolean;
}

export function useProjectTasks(projectId: string | undefined) {
  const { project } = useProject(projectId);
  const tasks = useProjects((s) => s.tasks);
  return useMemo(() => {
    if (!project) return { tasks: [] as Task[], sections: [] as SectionGroup[], progress: computeProgress([], todayISO()), byId: new Map<string, Task>() };
    const scoped = tasks.filter((t) => t.projectId === project.id).sort((a, b) => a.order - b.order || a.number - b.number);
    const byId = new Map(scoped.map((t) => [t.id, t]));
    const sections = project.sections.map((section) => {
      const inSection = scoped.filter((t) => t.sectionId === section.id);
      const openCount = inSection.filter((t) => !isDone(t)).length;
      return { section, tasks: inSection, openCount, overWip: Boolean(section.wipLimit && openCount > section.wipLimit) };
    });
    return { tasks: scoped, sections, progress: computeProgress(scoped, todayISO()), byId };
  }, [project, tasks]);
}

export function useTask(taskId: string | undefined) {
  const v = useProjectsViewer();
  const task = useProjects((s) => s.tasks.find((t) => t.id === taskId));
  const project = useProjects((s) => s.projects.find((p) => p.id === task?.projectId));
  const all = useProjects((s) => s.tasks);
  return useMemo(() => {
    if (!task || !project || !access.canViewProject(v, project)) return null;
    const byId = new Map(all.map((t) => [t.id, t]));
    return {
      task,
      project,
      blocked: isBlocked(task, byId),
      blockers: task.dependsOn.map((id) => byId.get(id)).filter((x): x is Task => Boolean(x)),
      dependents: all.filter((t) => t.dependsOn.includes(task.id)),
      canEdit: access.canEditTask(v, project, task),
      canDelete: access.canDeleteTask(v, project, task),
      canComment: access.canCommentProject(v, project),
      approvalGate: access.canDecideApproval(v, task),
    };
  }, [v, task, project, all]);
}

// ───────────────────────── My Tasks & inbox ─────────────────────────
export interface MyTasksView {
  today: Task[];
  upcoming: Task[];
  later: Task[];
  overdue: Task[];
  recentlyCompleted: Task[];
  approvalsWaiting: Task[];
  focus: FocusSuggestion[];
  byProject: Map<string, Project>;
  counts: { open: number; dueToday: number; overdue: number; blocked: number };
}

export function computeMyTasks(userId: string, projects: Project[], tasks: Task[], state: ProjectsUserState, today: string): MyTasksView {
  const visible = new Set(projects.map((p) => p.id));
  const mine = tasks.filter((t) => visible.has(t.projectId) && (t.assigneeId === userId || t.subtasks.some((s) => s.assigneeId === userId && !s.done)));
  const open = mine.filter((t) => !isDone(t));
  const byBucket = (b: MyTasksBucket) =>
    open
      .filter((t) => bucketFor(t, today, state.buckets[t.id]) === b)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.priority.localeCompare(b.priority));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const weekAgo = Date.now() - 7 * 86_400_000;
  return {
    today: byBucket('today'),
    upcoming: byBucket('upcoming'),
    later: byBucket('later'),
    overdue: open.filter((t) => isOverdue(t, today)),
    recentlyCompleted: mine.filter((t) => isDone(t) && (t.completedAt ?? 0) > weekAgo).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    approvalsWaiting: tasks.filter((t) => visible.has(t.projectId) && t.type === 'approval' && t.approval?.decision === 'pending' && t.approval.approverId === userId && t.creatorId !== userId),
    focus: suggestFocus(open, tasks, today),
    byProject: new Map(projects.map((p) => [p.id, p])),
    counts: { open: open.length, dueToday: open.filter((t) => t.dueDate === today).length, overdue: open.filter((t) => isOverdue(t, today)).length, blocked: open.filter((t) => isBlocked(t, byId)).length },
  };
}

export function useMyTasks(): MyTasksView | null {
  const v = useProjectsViewer();
  const cards = useVisibleProjects(true);
  const tasks = useProjects((s) => s.tasks);
  const state = useMyProjectsState();
  return useMemo(() => (v ? computeMyTasks(v.userId, cards.map((c) => c.project), tasks, state, todayISO()) : null), [v, cards, tasks, state]);
}

/** Work notifications addressed to the viewer (the Projects inbox), newest first. */
export function useWorkInbox() {
  const v = useProjectsViewer();
  const notifications = useHub((s) => s.notifications);
  const state = useMyProjectsState();
  return useMemo(() => {
    const mine = notifications.filter((n) => n.userId === v?.userId && n.kind === 'work').sort((a, b) => b.at - a.at);
    return { items: mine, unread: mine.filter((n) => n.at > state.inboxReadAt).length };
  }, [notifications, v, state.inboxReadAt]);
}

// ───────────────────────── Workload, sprints, goals, portfolios ─────────────────────────
export function useWorkload(projectId?: string): { rows: WorkloadRow[]; users: User[] } {
  const cards = useVisibleProjects();
  const tasks = useProjects((s) => s.tasks);
  const users = useHub((s) => s.users);
  return useMemo(() => {
    const projects = projectId ? cards.filter((c) => c.project.id === projectId) : cards;
    const ids = new Set(projects.map((c) => c.project.id));
    const scoped = tasks.filter((t) => ids.has(t.projectId));
    const people = users.filter((u) => u.active && (projectId ? projects[0]?.project.members.some((m) => m.userId === u.id) || scoped.some((t) => t.assigneeId === u.id) : scoped.some((t) => t.assigneeId === u.id)));
    return { rows: computeWorkload(scoped, people, todayISO()), users: people };
  }, [cards, tasks, users, projectId]);
}

export function useProjectSprints(projectId: string | undefined) {
  const sprints = useProjects((s) => s.sprints);
  const tasks = useProjects((s) => s.tasks);
  return useMemo(() => {
    const scoped = sprints.filter((s) => s.projectId === projectId).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const today = todayISO();
    const active = scoped.find((s) => s.state === 'active');
    return {
      sprints: scoped.map((sprint) => ({ sprint, stats: sprintStats(sprint, tasks) })),
      active,
      burndown: active ? sprintBurndown(active, tasks, today) : [],
      velocity: velocity(scoped),
      backlog: tasks.filter((t) => t.projectId === projectId && !t.sprintId && !isDone(t)),
    };
  }, [sprints, tasks, projectId]);
}

export interface GoalView {
  goal: Goal;
  progress: number;
  children: GoalView[];
  projects: Project[];
}

export function computeGoalTree(goals: Goal[], visibleProjects: Project[], tasks: Task[], today: string): GoalView[] {
  const build = (g: Goal): GoalView => ({
    goal: g,
    progress: goalProgress(g, visibleProjects, tasks, today),
    children: goals.filter((c) => c.parentId === g.id).map(build),
    projects: visibleProjects.filter((p) => g.projectIds.includes(p.id)),
  });
  return goals.filter((g) => !g.parentId).map(build);
}

export function useGoals() {
  const cards = useVisibleProjects(true);
  const goals = useProjects((s) => s.goals);
  const tasks = useProjects((s) => s.tasks);
  return useMemo(() => computeGoalTree(goals, cards.map((c) => c.project), tasks, todayISO()), [goals, cards, tasks]);
}

export interface PortfolioView {
  portfolio: Portfolio;
  cards: ProjectCard[];
  health: Record<Project['health'], number>;
  progressPct: number;
}

export function usePortfolios(): PortfolioView[] {
  const portfolios = useProjects((s) => s.portfolios);
  const cards = useVisibleProjects(true);
  return useMemo(
    () =>
      portfolios.map((portfolio) => {
        const scoped = cards.filter((c) => portfolio.projectIds.includes(c.project.id));
        const health = { on_track: 0, at_risk: 0, off_track: 0, on_hold: 0, complete: 0 } as Record<Project['health'], number>;
        scoped.forEach((c) => (health[c.project.health] += 1));
        const progressPct = scoped.length ? Math.round(scoped.reduce((s, c) => s + c.progress.pct, 0) / scoped.length) : 0;
        return { portfolio, cards: scoped, health, progressPct };
      }),
    [portfolios, cards],
  );
}

export function useProjectCalendar(projectId: string | undefined, year: number, month0: number) {
  const { tasks } = useProjectTasks(projectId);
  return useMemo(() => {
    const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}`;
    const byDate = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate || !t.dueDate.startsWith(prefix)) continue;
      byDate.set(t.dueDate, [...(byDate.get(t.dueDate) ?? []), t]);
    }
    return byDate;
  }, [tasks, year, month0]);
}

/** Lightweight search across visible projects and tasks (used by the palette and the Projects search bar). */
export function searchWork(query: string, cards: ProjectCard[], tasks: Task[], limit = 8): { projects: Project[]; tasks: { task: Task; project: Project }[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { projects: [], tasks: [] };
  const projects = cards.map((c) => c.project).filter((p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase() === q.toUpperCase().toLowerCase() || p.description.toLowerCase().includes(q));
  const byId = new Map(cards.map((c) => [c.project.id, c.project]));
  const hits = tasks
    .filter((t) => byId.has(t.projectId))
    .filter((t) => `${byId.get(t.projectId)!.key}-${t.number}`.toLowerCase() === q || t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q)))
    .slice(0, limit)
    .map((task) => ({ task, project: byId.get(task.projectId)! }));
  return { projects: projects.slice(0, limit), tasks: hits };
}

export type { Sprint };
