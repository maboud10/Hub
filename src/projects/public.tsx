/**
 * Public App Bridge for Helix Projects (see src/lib/appBridge.ts).
 * Every call re-checks the viewer's permissions — this is an API boundary.
 */
import { CheckCircle2, FolderKanban, Gauge, Inbox, Layers, Orbit, Plus, Sparkles } from 'lucide-react';
import type { BridgeProject, BridgeViewer, BridgeWorkItem, NewTaskFromApp, PaletteEntry, ProjectsBridge } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { actorFrom, canCreateProject, canEditProject, canSeeTask, canViewProject, isProjectsAdmin } from './access';
import { formatDue, isIsoDate } from './dates';
import { STATUS_LABEL, taskKey } from './metrics';
import { ProjectSigil, sigilIdFor } from './sigils';
import { taskLink, useProjects } from './store';

const actorOf = (v: BridgeViewer) => actorFrom(v.user, v.perms);

function paletteEntries(viewer: BridgeViewer): PaletteEntry[] {
  const a = actorOf(viewer);
  const s = useProjects.getState();
  const users = useHub.getState().users;
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? '') : '');
  const unread = s.inbox.filter((i) => i.userId === a.id && !i.read && !i.archived).length;
  const out: PaletteEntry[] = [
    { id: 'projects:my-work', group: 'Actions', title: 'My work', subtitle: 'Projects · today, overdue and approvals', icon: <Orbit />, to: '/projects', keywords: ['my tasks', 'today', 'todo', 'overdue', 'projects home', 'focus'] },
    { id: 'projects:quick-add', group: 'Actions', title: 'Quick add task', subtitle: 'Natural language: “Review PR tomorrow 3pm @priya #prism”', icon: <Plus />, to: '/projects?new=task', keywords: ['new task', 'create task', 'add task', 'capture', 'todo', 'reminder'] },
    { id: 'projects:plan-day', group: 'Actions', title: 'Plan my day with Nova', subtitle: 'Slot your top tasks around today’s meetings', icon: <Sparkles />, to: '/projects?plan=1', keywords: ['focus runway', 'schedule', 'time block', 'ai', 'nova', 'planner'] },
    { id: 'projects:inbox', group: 'Actions', title: 'Projects inbox', subtitle: unread ? `${unread} unread` : 'Mentions, assignments and approvals', icon: <Inbox />, to: '/projects/inbox', keywords: ['mentions', 'notifications', 'assigned to me', 'approvals'] },
    { id: 'projects:browse', group: 'Actions', title: 'Browse projects', subtitle: 'Gallery and table of every project you can see', icon: <FolderKanban />, to: '/projects/browse', keywords: ['all projects', 'project list', 'directory'] },
    { id: 'projects:portfolios', group: 'Actions', title: 'Portfolios', subtitle: 'Health quadrant across programs', icon: <Layers />, to: '/projects/portfolios', keywords: ['portfolio', 'programs', 'health', 'status report'] },
  ];
  if (canCreateProject(a)) out.push({ id: 'projects:new-project', group: 'Actions', title: 'New project', subtitle: 'Start from a template', icon: <Plus />, to: '/projects/browse?new=1', keywords: ['create project', 'kanban', 'sprint', 'launch', 'template'] });
  if (isProjectsAdmin(a)) out.push({ id: 'projects:workload', group: 'Actions', title: 'Team workload', subtitle: 'Capacity heatmap for the next 6 weeks', icon: <Gauge />, to: '/projects/workload', keywords: ['capacity', 'utilization', 'rebalance', 'resourcing', 'overloaded'] });

  const visible = s.projects.filter((p) => !p.archived && canViewProject(p, a));
  const byId = new Map(visible.map((p) => [p.id, p]));
  for (const p of visible) {
    out.push({
      id: `projects:project:${p.id}`,
      group: 'Work',
      title: p.name,
      subtitle: `${p.key} · ${STATUS_LABEL[p.status]} · ${p.department}`,
      icon: <ProjectSigil icon={p.icon} color={p.color} size={22} />,
      glyphColor: p.color,
      keywords: [p.key, p.department, nameOf(p.ownerId), 'project', p.privacy],
      hint: 'Open',
      to: `/projects/p/${p.id}`,
    });
  }
  const open = s.tasks
    .filter((t) => !t.completedAt && canSeeTask(t, t.projectId ? byId.get(t.projectId) : undefined, a) && (!t.projectId || byId.has(t.projectId)))
    .sort((x, y) => Number(y.assigneeId === a.id) - Number(x.assigneeId === a.id) || (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'))
    .slice(0, 220);
  for (const t of open) {
    const p = t.projectId ? byId.get(t.projectId) : undefined;
    out.push({
      id: `projects:task:${t.id}`,
      group: 'Work',
      title: t.title,
      subtitle: [taskKey(p, t), p?.name ?? 'My tasks', t.dueDate ? `due ${formatDue(t.dueDate)}` : null].filter(Boolean).join(' · '),
      icon: <CheckCircle2 />,
      glyphColor: p?.color,
      keywords: [taskKey(p, t), nameOf(t.assigneeId), ...t.tags, t.kind, 'task'],
      hint: 'Open',
      to: taskLink(t),
    });
  }
  return out;
}

function listProjects(viewer: BridgeViewer, opts?: { writableOnly?: boolean }): BridgeProject[] {
  const a = actorOf(viewer);
  const s = useProjects.getState();
  return s.projects
    .filter((p) => !p.archived && canViewProject(p, a))
    .map((p) => {
      const tasks = s.tasks.filter((t) => t.projectId === p.id);
      const done = tasks.filter((t) => t.completedAt).length;
      return {
        id: p.id,
        name: p.name,
        icon: sigilIdFor(p.icon),
        color: p.color,
        to: `/projects/p/${p.id}`,
        progress: tasks.length ? done / tasks.length : 0,
        status: p.status,
        ownerId: p.ownerId,
        keyResultIds: [...p.keyResultIds],
        canEdit: canEditProject(p, a),
      };
    })
    .filter((p) => !opts?.writableOnly || p.canEdit);
}

function createTask(viewer: BridgeViewer, input: NewTaskFromApp) {
  const a = actorOf(viewer);
  const title = (input.title ?? '').trim();
  if (!title) return { ok: false as const, error: 'Give the task a title.' };
  if (input.dueDate && !isIsoDate(input.dueDate)) return { ok: false as const, error: 'Due dates use the yyyy-mm-dd format.' };
  const notes = [input.notes?.trim(), input.source ? `From ${input.source.label}` : ''].filter(Boolean).join('\n\n');
  const r = useProjects.getState().createTask(
    {
      title,
      description: notes,
      projectId: input.projectId ?? null,
      assigneeId: input.assigneeId ?? viewer.user.id,
      dueDate: input.dueDate,
      source: input.source,
    },
    a,
  );
  if (!r.ok) return r;
  const t = useProjects.getState().tasks.find((x) => x.id === r.taskId)!;
  return { ok: true as const, taskId: t.id, to: taskLink(t) };
}

function completedWork(viewer: BridgeViewer, userId: string, sinceTs: number): BridgeWorkItem[] {
  const a = actorOf(viewer);
  const s = useProjects.getState();
  const byId = new Map(s.projects.map((p) => [p.id, p]));
  return s.tasks
    .filter((t) => t.assigneeId === userId && t.completedAt && t.completedAt >= sinceTs)
    .filter((t) => canSeeTask(t, t.projectId ? byId.get(t.projectId) : undefined, a))
    .filter((t) => !(t.kind === 'approval' && t.approval?.state === 'rejected'))
    .sort((x, y) => (y.completedAt ?? 0) - (x.completedAt ?? 0))
    .map((t) => {
      const p = t.projectId ? byId.get(t.projectId) : undefined;
      return { id: t.id, title: t.title, projectName: p?.name, completedAt: t.completedAt!, to: taskLink(t) };
    });
}

export const api: ProjectsBridge = {
  appId: 'projects',
  paletteEntries,
  resetDemo: () => useProjects.getState().resetDemo(),
  listProjects,
  createTask,
  completedWork,
};
