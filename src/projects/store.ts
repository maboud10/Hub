/**
 * Helix Projects store — every mutation re-checks the viewer's project role,
 * writes task activity, fans out hub notifications (kind `work`) and runs the
 * project's no-code automation rules, exactly like an API would.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, HubNotification, User } from '@/types';
import { uid } from '@/lib/id';
import { useHub } from '@/store/hub';
import { addDaysISO, todayISO } from '@/hr/calendar';
import * as access from './access';
import { PROJECTS_DATA_VERSION, TEMPLATE_BY_ID } from './constants';
import { instantiateTemplate, isDone, nextRecurrence, slugKey, sprintStats, wouldCreateCycle } from './engine';
import { createProjectsSeed } from './seed';
import type {
  AutomationRule,
  Goal,
  IntakeForm,
  MyTasksBucket,
  Portfolio,
  Project,
  ProjectHealth,
  ProjectRole,
  ProjectsData,
  ProjectsUserState,
  RuleTrigger,
  Sprint,
  StatusUpdate,
  Task,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  TaskType,
} from './types';

export interface NewProjectInput {
  name: string;
  description?: string;
  department?: Project['department'];
  privacy: Project['privacy'];
  color?: string;
  icon?: string;
  startDate?: string;
  dueDate?: string;
  templateId?: string;
  memberIds?: string[];
  key?: string;
  defaultView?: Project['defaultView'];
}

export interface NewTaskInput {
  projectId: string;
  sectionId?: string;
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  startDate?: string;
  estimateHours?: number;
  storyPoints?: number;
  tags?: string[];
  sprintId?: string;
  approverId?: string;
  collaboratorIds?: string[];
  customFieldValues?: Record<string, string | number>;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'type' | 'status' | 'priority' | 'assigneeId' | 'dueDate' | 'startDate' | 'estimateHours' | 'storyPoints' | 'tags' | 'customFieldValues' | 'sectionId' | 'sprintId' | 'recurring' | 'collaboratorIds'>
>;

export type Result<T extends object = Record<never, never>> = ActionResult & Partial<T>;

export interface ProjectsActions {
  // projects
  createProject(input: NewProjectInput): Result<{ projectId: string }>;
  updateProject(projectId: string, patch: Partial<Pick<Project, 'name' | 'description' | 'color' | 'icon' | 'privacy' | 'startDate' | 'dueDate' | 'defaultView' | 'health' | 'customFields' | 'links'>>): ActionResult;
  archiveProject(projectId: string, archived: boolean): ActionResult;
  addMember(projectId: string, userId: string, role: ProjectRole): ActionResult;
  updateMemberRole(projectId: string, userId: string, role: ProjectRole): ActionResult;
  removeMember(projectId: string, userId: string): ActionResult;
  addSection(projectId: string, name: string, wipLimit?: number): Result<{ sectionId: string }>;
  updateSection(projectId: string, sectionId: string, patch: { name?: string; wipLimit?: number | null }): ActionResult;
  deleteSection(projectId: string, sectionId: string): ActionResult;
  reorderSections(projectId: string, sectionIds: string[]): ActionResult;
  toggleStarProject(projectId: string): ActionResult;
  recordProjectVisit(projectId: string): void;
  // tasks
  createTask(input: NewTaskInput): Result<{ taskId: string }>;
  updateTask(taskId: string, patch: TaskPatch): ActionResult;
  moveTask(taskId: string, sectionId: string, index?: number): ActionResult;
  completeTask(taskId: string, done: boolean): ActionResult;
  deleteTask(taskId: string): ActionResult;
  addSubtask(taskId: string, title: string, assigneeId?: string, dueDate?: string): ActionResult;
  toggleSubtask(taskId: string, subtaskId: string): ActionResult;
  removeSubtask(taskId: string, subtaskId: string): ActionResult;
  addComment(taskId: string, body: string, mentions?: string[]): ActionResult;
  toggleReaction(taskId: string, commentId: string, emoji: string): ActionResult;
  toggleLike(taskId: string): ActionResult;
  toggleFollow(taskId: string): ActionResult;
  addAttachment(taskId: string, att: Pick<TaskAttachment, 'kind' | 'driveFileId' | 'wikiSlug' | 'url' | 'title'>): ActionResult;
  removeAttachment(taskId: string, attachmentId: string): ActionResult;
  setDependency(taskId: string, dependsOnId: string, add: boolean): ActionResult;
  decideApproval(taskId: string, decision: 'approved' | 'changes_requested' | 'rejected', note?: string): ActionResult;
  logTime(taskId: string, hours: number): ActionResult;
  setMyTaskBucket(taskId: string, bucket: MyTasksBucket | null): void;
  // status, portfolios, goals
  postStatusUpdate(projectId: string, draft: Omit<StatusUpdate, 'id' | 'projectId' | 'authorId' | 'at'>): ActionResult;
  createPortfolio(input: Pick<Portfolio, 'name' | 'description' | 'color'> & { projectIds?: string[] }): Result<{ portfolioId: string }>;
  setPortfolioProjects(portfolioId: string, projectIds: string[]): ActionResult;
  deletePortfolio(portfolioId: string): ActionResult;
  createGoal(input: Pick<Goal, 'title' | 'description' | 'level' | 'department' | 'parentId' | 'projectIds' | 'metric' | 'targetDate'>): Result<{ goalId: string }>;
  updateGoal(goalId: string, patch: Partial<Pick<Goal, 'title' | 'description' | 'projectIds' | 'metric' | 'manualProgress' | 'status' | 'targetDate' | 'parentId'>>): ActionResult;
  // sprints
  createSprint(projectId: string, input: Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>): Result<{ sprintId: string }>;
  startSprint(sprintId: string): ActionResult;
  completeSprint(sprintId: string, rolloverSprintId?: string | null): ActionResult;
  // automations & forms
  upsertRule(projectId: string, rule: Omit<AutomationRule, 'id' | 'projectId' | 'runs' | 'createdBy' | 'lastRunAt'> & { id?: string }): Result<{ ruleId: string }>;
  toggleRule(ruleId: string, enabled: boolean): ActionResult;
  deleteRule(ruleId: string): ActionResult;
  upsertForm(projectId: string, form: Omit<IntakeForm, 'id' | 'projectId' | 'submissions' | 'createdBy'> & { id?: string }): Result<{ formId: string }>;
  submitForm(formId: string, values: Record<string, string>): Result<{ taskId: string }>;
  /** Apply time-based automations (overdue tags) — run on app load. */
  runScheduledRules(): number;
  markInboxRead(): void;
  resetProjectsDemo(): void;
}

export type ProjectsStore = ProjectsData & ProjectsActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });
const emptyUserState = (): ProjectsUserState => ({ starredProjectIds: [], recentProjectIds: [], buckets: {}, inboxReadAt: 0 });
const DONE_SECTION = /^(done|complete|completed|shipped|closed won)$/i;

export const taskLink = (projectId: string, taskId: string) => `/projects/p/${projectId}?task=${taskId}`;

export const useProjects = create<ProjectsStore>()(
  persist(
    (set, get) => {
      const hub = () => useHub.getState();
      const viewer = (): { user: User; v: access.ProjectsViewer } | null => {
        const h = hub();
        const user = h.users.find((u) => u.id === h.sessionUserId) ?? null;
        const v = access.buildProjectsViewer(user, h.roles);
        return user && v ? { user, v } : null;
      };
      const userName = (id?: string) => hub().users.find((u) => u.id === id)?.name ?? 'Someone';
      const audit = (e: { action: string; target: string; detail?: string; outcome?: 'success' | 'denied'; severity?: 'info' | 'warning' | 'critical' }) =>
        hub().logAudit({ outcome: 'success', severity: 'info', ...e });
      const notify = (userIds: (string | undefined)[], n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read' | 'kind'>, exclude?: string) => {
        const ids = [...new Set(userIds.filter((x): x is string => Boolean(x) && x !== exclude))];
        if (ids.length) hub().pushNotifications(ids, { kind: 'work', ...n });
      };
      const project = (id: string) => get().projects.find((p) => p.id === id);
      const task = (id: string) => get().tasks.find((t) => t.id === id);
      const patchProject = (id: string, fn: (p: Project) => Project) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)) }));
      const patchTask = (id: string, fn: (t: Task) => Task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)) }));
      const act = (actorId: string, action: string, detail?: string) => ({ id: uid('ta'), at: Date.now(), actorId, action, detail });
      const patchUserState = (userId: string, fn: (u: ProjectsUserState) => ProjectsUserState) =>
        set((s) => ({ userState: { ...s.userState, [userId]: fn(s.userState[userId] ?? emptyUserState()) } }));

      /** Apply matching automation rules to a task once (no re-triggering). */
      const runRules = (trigger: RuleTrigger, t: Task, actorId: string, sectionId?: string): Task => {
        const p = project(t.projectId);
        if (!p) return t;
        const rules = get().rules.filter((r) => r.enabled && r.projectId === t.projectId && r.trigger === trigger && (trigger !== 'task_moved_to_section' || r.triggerSectionId === sectionId));
        if (!rules.length) return t;
        let next = { ...t };
        const fired: string[] = [];
        for (const r of rules) {
          switch (r.action) {
            case 'move_to_section':
              if (r.actionValue && p.sections.some((s) => s.id === r.actionValue)) next.sectionId = r.actionValue;
              break;
            case 'set_status':
              if (r.actionValue) {
                next.status = r.actionValue as TaskStatus;
                next.completedAt = r.actionValue === 'done' ? Date.now() : undefined;
              }
              break;
            case 'add_tag':
              if (r.actionValue && !next.tags.includes(r.actionValue)) next.tags = [...next.tags, r.actionValue];
              break;
            case 'assign_to':
              if (r.actionValue && !next.assigneeId) next.assigneeId = r.actionValue;
              break;
            case 'set_priority':
              if (r.actionValue) next.priority = r.actionValue as TaskPriority;
              break;
            case 'add_collaborator':
              if (r.actionValue && !next.collaboratorIds.includes(r.actionValue)) next.collaboratorIds = [...next.collaboratorIds, r.actionValue];
              break;
            case 'notify_owner':
              notify([p.ownerId], { title: `Rule “${r.name}” fired`, body: `${p.key}-${t.number} · ${t.title}`, link: taskLink(p.id, t.id) }, actorId);
              break;
          }
          fired.push(r.id);
        }
        if (fired.length) {
          next = { ...next, activity: [...next.activity, act('system', `rule:${trigger}`, rules.map((r) => r.name).join(', '))] };
          set((s) => ({ rules: s.rules.map((r) => (fired.includes(r.id) ? { ...r, runs: r.runs + 1, lastRunAt: Date.now() } : r)) }));
        }
        return next;
      };

      type Ctx = { user: User; v: access.ProjectsViewer };
      type ProjectGate = { error: ActionResult; ctx?: undefined; p?: undefined } | { error?: undefined; ctx: Ctx; p: Project };
      type TaskGate = { error: ActionResult; ctx?: undefined; t?: undefined; p?: undefined } | { error?: undefined; ctx: Ctx; t: Task; p: Project };
      const requireProjectEdit = (projectId: string): ProjectGate => {
        const ctx = viewer();
        const p = project(projectId);
        if (!ctx || !p) return { error: fail('Project not found.') };
        if (!access.canEditProject(ctx.v, p)) {
          audit({ action: 'projects.denied', target: p.name, detail: 'Editor role required', outcome: 'denied', severity: 'warning' });
          return { error: fail('You need editor access on this project.') };
        }
        return { ctx, p };
      };
      const requireProjectAdmin = (projectId: string): ProjectGate => {
        const ctx = viewer();
        const p = project(projectId);
        if (!ctx || !p) return { error: fail('Project not found.') };
        if (!access.canAdminProject(ctx.v, p)) {
          audit({ action: 'projects.denied', target: p.name, detail: 'Project admin required', outcome: 'denied', severity: 'warning' });
          return { error: fail('Only project admins can do that.') };
        }
        return { ctx, p };
      };
      const requireTaskEdit = (taskId: string): TaskGate => {
        const ctx = viewer();
        const t = task(taskId);
        const p = t ? project(t.projectId) : undefined;
        if (!ctx || !t || !p || !access.canViewProject(ctx.v, p)) return { error: fail('Task not found.') };
        if (!access.canEditTask(ctx.v, p, t)) return { error: fail('You can’t edit this task.') };
        return { ctx, t, p };
      };

      const insertTask = (p: Project, t: Omit<Task, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'activity' | 'order'>, actorId: string): Task => {
        const now = Date.now();
        const siblings = get().tasks.filter((x) => x.projectId === p.id && x.sectionId === t.sectionId);
        let created: Task = {
          ...t,
          id: uid('t'),
          number: p.nextTaskNumber,
          order: siblings.length ? Math.max(...siblings.map((x) => x.order)) + 1 : 0,
          activity: [act(actorId, 'created')],
          createdAt: now,
          updatedAt: now,
        };
        created = runRules('task_created', created, actorId);
        if (created.assigneeId) created = runRules('task_assigned', created, actorId);
        if (created.priority === 'urgent') created = runRules('priority_set_urgent', created, actorId);
        set((s) => ({ tasks: [...s.tasks, created], projects: s.projects.map((x) => (x.id === p.id ? { ...x, nextTaskNumber: x.nextTaskNumber + 1, updatedAt: now } : x)) }));
        return created;
      };

      const finishTask = (t: Task, actorId: string, p: Project): Task => {
        const doneSection = p.sections.find((s) => DONE_SECTION.test(s.name));
        let next: Task = { ...t, status: 'done', completedAt: Date.now(), activity: [...t.activity, act(actorId, 'completed')] };
        if (doneSection) next.sectionId = doneSection.id;
        next = runRules('task_completed', next, actorId);
        if (t.recurring && t.dueDate) {
          const clone = { ...t, status: 'todo' as TaskStatus, completedAt: undefined, dueDate: nextRecurrence(t.dueDate, t.recurring), loggedHours: 0, subtasks: t.subtasks.map((s) => ({ ...s, done: false })), comments: [], likes: [], attachments: t.attachments, dependsOn: [], sprintId: undefined, creatorId: actorId, collaboratorIds: t.collaboratorIds, customFieldValues: t.customFieldValues, tags: t.tags.filter((x) => x !== 'overdue'), description: t.description, title: t.title, type: t.type, priority: t.priority, assigneeId: t.assigneeId, estimateHours: t.estimateHours, storyPoints: t.storyPoints, startDate: undefined, recurring: t.recurring, sectionId: t.sectionId, projectId: t.projectId, approval: undefined };
          insertTask(p, clone, actorId);
        }
        const dependents = get().tasks.filter((x) => x.dependsOn.includes(t.id) && !isDone(x));
        notify(
          dependents.map((x) => x.assigneeId),
          { title: `Unblocked: ${dependents[0]?.title ?? ''}`, body: `${userName(actorId)} completed “${t.title}”.`, link: dependents[0] ? taskLink(p.id, dependents[0].id) : undefined },
          actorId,
        );
        notify([t.creatorId, ...t.collaboratorIds], { title: `Completed · ${p.key}-${t.number}`, body: `${userName(actorId)} completed “${t.title}”.`, link: taskLink(p.id, t.id) }, actorId);
        return next;
      };

      return {
        ...createProjectsSeed(),

        // ───────────────────────── projects ─────────────────────────
        createProject(input) {
          const ctx = viewer();
          if (!ctx || !access.canCreateProject(ctx.v)) return fail('Contractors can’t create projects — ask a project admin to add you.');
          const name = input.name.trim();
          if (name.length < 3) return fail('Give the project a name (3+ characters).');
          const department = input.department && access.canManageProjects(ctx.v) ? input.department : ctx.user.department;
          const today = todayISO();
          const startDate = input.startDate ?? today;
          const dueDate = input.dueDate ?? addDaysISO(startDate, 30);
          if (dueDate < startDate) return fail('The target date must be after the start date.');
          const tpl = input.templateId ? TEMPLATE_BY_ID[input.templateId] : undefined;
          let key = (input.key ?? slugKey(name)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PRJ';
          const taken = new Set(get().projects.map((p) => p.key));
          let i = 2;
          const base = key;
          while (taken.has(key)) key = `${base}${i++}`;
          const id = uid('prj');
          const now = Date.now();
          const sectionNames = tpl ? tpl.sections : ['To do', 'In progress', 'In review', 'Done'];
          const sectionIds = sectionNames.map(() => uid('sec'));
          const members = [...new Set(input.memberIds ?? [])].filter((u) => u !== ctx.user.id && hub().users.some((x) => x.id === u && x.active));
          const proj: Project = {
            id,
            key,
            name,
            description: input.description?.trim() ?? tpl?.description ?? '',
            icon: input.icon ?? tpl?.icon ?? '🚀',
            color: input.color ?? tpl?.color ?? '#38bdf8',
            department,
            ownerId: ctx.user.id,
            members: [{ userId: ctx.user.id, role: 'owner', addedAt: now, addedBy: ctx.user.id }, ...members.map((u) => ({ userId: u, role: 'editor' as ProjectRole, addedAt: now, addedBy: ctx.user.id }))],
            privacy: input.privacy,
            health: 'on_track',
            startDate,
            dueDate,
            sections: sectionNames.map((n, idx) => ({ id: sectionIds[idx], name: n })),
            customFields: [],
            defaultView: input.defaultView ?? tpl?.recommendedView ?? 'board',
            templateId: tpl?.id,
            archived: false,
            nextTaskNumber: 1,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ projects: [proj, ...s.projects] }));
          if (tpl) {
            const { tasks } = instantiateTemplate(tpl, startDate, sectionIds);
            for (const t of tasks) insertTask(get().projects.find((p) => p.id === id)!, { ...t, projectId: id, creatorId: ctx.user.id, assigneeId: undefined }, ctx.user.id);
            const rules: AutomationRule[] = tpl.defaultRules.map((r) => ({
              id: uid('rule'),
              projectId: id,
              name: r.name,
              trigger: r.trigger,
              triggerSectionId: r.trigger === 'task_moved_to_section' ? sectionIds[sectionNames.findIndex((n) => DONE_SECTION.test(n))] ?? sectionIds[sectionIds.length - 1] : undefined,
              action: r.action,
              actionValue: r.actionValue,
              enabled: true,
              runs: 0,
              createdBy: ctx.user.id,
            }));
            set((s) => ({ rules: [...s.rules, ...rules] }));
          }
          patchUserState(ctx.user.id, (u) => ({ ...u, starredProjectIds: [id, ...u.starredProjectIds], recentProjectIds: [id, ...u.recentProjectIds].slice(0, 8) }));
          notify(members, { title: `You were added to ${name}`, body: `${ctx.user.name} created a new ${input.privacy} project.`, link: `/projects/p/${id}` });
          audit({ action: 'projects.project.created', target: name, detail: `${key} · ${input.privacy}${tpl ? ` · template ${tpl.name}` : ''}` });
          return { ok: true, message: `Created ${name}${tpl ? ` from the ${tpl.name} template` : ''}.`, projectId: id };
        },

        updateProject(projectId, patch) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          patchProject(projectId, (p) => ({ ...p, ...patch }));
          audit({ action: 'projects.project.updated', target: r.p.name, detail: Object.keys(patch).join(', ') });
          return ok('Project updated.');
        },

        archiveProject(projectId, archived) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          patchProject(projectId, (p) => ({ ...p, archived, health: archived ? 'complete' : p.health }));
          audit({ action: archived ? 'projects.project.archived' : 'projects.project.restored', target: r.p.name });
          return ok(archived ? `Archived ${r.p.name}.` : `Restored ${r.p.name}.`);
        },

        addMember(projectId, userId, role) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          const u = hub().users.find((x) => x.id === userId && x.active);
          if (!u) return fail('Pick an active teammate.');
          if (r.p.members.some((m) => m.userId === userId)) return fail(`${u.name} is already a member.`);
          patchProject(projectId, (p) => ({ ...p, members: [...p.members, { userId, role, addedAt: Date.now(), addedBy: r.ctx.user.id }] }));
          notify([userId], { title: `Added to ${r.p.name}`, body: `${r.ctx.user.name} added you as ${role}.`, link: `/projects/p/${projectId}` });
          audit({ action: 'projects.member.added', target: `${r.p.name} · ${u.name}`, detail: role });
          return ok(`Added ${u.name} as ${role}.`);
        },

        updateMemberRole(projectId, userId, role) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          if (userId === r.p.ownerId && role !== 'owner') return fail('Transfer ownership before changing the owner’s role.');
          patchProject(projectId, (p) => ({ ...p, members: p.members.map((m) => (m.userId === userId ? { ...m, role } : m)) }));
          return ok('Role updated.');
        },

        removeMember(projectId, userId) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          if (userId === r.p.ownerId) return fail('The project owner can’t be removed.');
          patchProject(projectId, (p) => ({ ...p, members: p.members.filter((m) => m.userId !== userId) }));
          audit({ action: 'projects.member.removed', target: `${r.p.name} · ${userName(userId)}` });
          return ok('Member removed.');
        },

        addSection(projectId, name, wipLimit) {
          const r = requireProjectEdit(projectId);
          if (r.error) return r.error;
          const clean = name.trim();
          if (!clean) return fail('Name the section.');
          const sectionId = uid('sec');
          patchProject(projectId, (p) => ({ ...p, sections: [...p.sections, { id: sectionId, name: clean, wipLimit }] }));
          return { ok: true, message: `Added section ${clean}.`, sectionId };
        },

        updateSection(projectId, sectionId, patch) {
          const r = requireProjectEdit(projectId);
          if (r.error) return r.error;
          patchProject(projectId, (p) => ({
            ...p,
            sections: p.sections.map((s) => (s.id === sectionId ? { ...s, name: patch.name?.trim() || s.name, wipLimit: patch.wipLimit === null ? undefined : (patch.wipLimit ?? s.wipLimit) } : s)),
          }));
          return ok('Section updated.');
        },

        deleteSection(projectId, sectionId) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          if (r.p.sections.length <= 1) return fail('A project needs at least one section.');
          const fallback = r.p.sections.find((s) => s.id !== sectionId)!.id;
          set((s) => ({
            tasks: s.tasks.map((t) => (t.projectId === projectId && t.sectionId === sectionId ? { ...t, sectionId: fallback } : t)),
            projects: s.projects.map((p) => (p.id === projectId ? { ...p, sections: p.sections.filter((x) => x.id !== sectionId), updatedAt: Date.now() } : p)),
          }));
          return ok('Section deleted; its tasks were moved.');
        },

        reorderSections(projectId, sectionIds) {
          const r = requireProjectEdit(projectId);
          if (r.error) return r.error;
          patchProject(projectId, (p) => ({ ...p, sections: sectionIds.map((id) => p.sections.find((s) => s.id === id)!).filter(Boolean) }));
          return ok();
        },

        toggleStarProject(projectId) {
          const ctx = viewer();
          if (!ctx) return fail('Not signed in.');
          let starred = false;
          patchUserState(ctx.user.id, (u) => {
            starred = !u.starredProjectIds.includes(projectId);
            return { ...u, starredProjectIds: starred ? [projectId, ...u.starredProjectIds] : u.starredProjectIds.filter((id) => id !== projectId) };
          });
          return ok(starred ? 'Starred — it’s now in your sidebar.' : 'Removed from starred.');
        },

        recordProjectVisit(projectId) {
          const ctx = viewer();
          if (!ctx) return;
          patchUserState(ctx.user.id, (u) => (u.recentProjectIds[0] === projectId ? u : { ...u, recentProjectIds: [projectId, ...u.recentProjectIds.filter((id) => id !== projectId)].slice(0, 8) }));
        },

        // ───────────────────────── tasks ─────────────────────────
        createTask(input) {
          const r = requireProjectEdit(input.projectId);
          if (r.error) return r.error;
          const title = input.title.trim();
          if (title.length < 2) return fail('Give the task a title.');
          const sectionId = input.sectionId && r.p.sections.some((s) => s.id === input.sectionId) ? input.sectionId : r.p.sections[0].id;
          const type = input.type ?? 'task';
          if (type === 'approval' && !input.approverId) return fail('Approval tasks need an approver.');
          const created = insertTask(
            r.p,
            {
              projectId: r.p.id,
              sectionId,
              title,
              description: input.description?.trim() ?? '',
              type,
              status: 'todo',
              priority: input.priority ?? 'medium',
              assigneeId: input.assigneeId,
              collaboratorIds: input.collaboratorIds ?? [],
              creatorId: r.ctx.user.id,
              startDate: input.startDate,
              dueDate: input.dueDate,
              estimateHours: input.estimateHours,
              loggedHours: 0,
              storyPoints: input.storyPoints,
              tags: input.tags ?? [],
              customFieldValues: input.customFieldValues ?? {},
              subtasks: [],
              dependsOn: [],
              attachments: [],
              comments: [],
              likes: [],
              approval: type === 'approval' && input.approverId ? { approverId: input.approverId, decision: 'pending' } : undefined,
              sprintId: input.sprintId,
            },
            r.ctx.user.id,
          );
          if (created.assigneeId) notify([created.assigneeId], { title: `New task · ${r.p.key}-${created.number}`, body: `${r.ctx.user.name} assigned you “${title}”.`, link: taskLink(r.p.id, created.id) }, r.ctx.user.id);
          if (created.approval) notify([created.approval.approverId], { title: `Approval requested · ${r.p.key}-${created.number}`, body: `${r.ctx.user.name} needs your decision on “${title}”.`, link: taskLink(r.p.id, created.id) }, r.ctx.user.id);
          return { ok: true, message: `Created ${r.p.key}-${created.number}.`, taskId: created.id };
        },

        updateTask(taskId, patch) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          const { t, p, ctx } = r;
          if (patch.status === 'done' && t.status !== 'done') return get().completeTask(taskId, true);
          if (patch.status && patch.status !== 'done' && t.status === 'done') {
            get().completeTask(taskId, false);
            patch = { ...patch, status: patch.status };
          }
          if (patch.sectionId && patch.sectionId !== t.sectionId) {
            const res = get().moveTask(taskId, patch.sectionId);
            if (!res.ok) return res;
          }
          const { sectionId: _ignored, ...rest } = patch;
          void _ignored;
          if (rest.title !== undefined && rest.title.trim().length < 2) return fail('Title is too short.');
          let next: Task = { ...task(taskId)!, ...rest, title: rest.title?.trim() ?? t.title };
          const changes: string[] = [];
          (Object.keys(rest) as (keyof typeof rest)[]).forEach((k) => {
            if (JSON.stringify(t[k]) !== JSON.stringify(rest[k])) changes.push(k);
          });
          if (!changes.length) return ok();
          next.activity = [...next.activity, act(ctx.user.id, 'updated', changes.join(', '))];
          if (changes.includes('assigneeId') && next.assigneeId) {
            next = runRules('task_assigned', next, ctx.user.id);
            notify([next.assigneeId], { title: `Assigned to you · ${p.key}-${t.number}`, body: `${ctx.user.name} assigned “${next.title}” to you.`, link: taskLink(p.id, t.id) }, ctx.user.id);
          }
          if (changes.includes('priority') && next.priority === 'urgent') next = runRules('priority_set_urgent', next, ctx.user.id);
          if (changes.includes('dueDate') && next.assigneeId && next.assigneeId !== ctx.user.id) {
            notify([next.assigneeId], { title: `Due date changed · ${p.key}-${t.number}`, body: `${next.title} is now due ${next.dueDate ?? 'anytime'}.`, link: taskLink(p.id, t.id) }, ctx.user.id);
          }
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...next, updatedAt: Date.now() } : x)) }));
          return ok('Saved.');
        },

        moveTask(taskId, sectionId, index) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          const { t, p, ctx } = r;
          const section = p.sections.find((s) => s.id === sectionId);
          if (!section) return fail('Section not found.');
          const others = get()
            .tasks.filter((x) => x.projectId === p.id && x.sectionId === sectionId && x.id !== taskId)
            .sort((a, b) => a.order - b.order);
          if (section.wipLimit && others.filter((x) => !isDone(x)).length >= section.wipLimit && !isDone(t) && t.sectionId !== sectionId) {
            return fail(`“${section.name}” is at its WIP limit (${section.wipLimit}). Finish something first.`);
          }
          const at = index === undefined ? others.length : Math.max(0, Math.min(others.length, index));
          let moved: Task = { ...t, sectionId };
          const leavingDone = DONE_SECTION.test(p.sections.find((s) => s.id === t.sectionId)?.name ?? '') && !DONE_SECTION.test(section.name);
          if (t.sectionId !== sectionId) {
            moved.activity = [...moved.activity, act(ctx.user.id, 'moved', `→ ${section.name}`)];
            if (DONE_SECTION.test(section.name) && !isDone(moved)) moved = finishTask(moved, ctx.user.id, p);
            else if (leavingDone && isDone(moved)) moved = { ...moved, status: 'todo', completedAt: undefined };
            moved.sectionId = sectionId;
            moved = runRules('task_moved_to_section', moved, ctx.user.id, sectionId);
            moved.sectionId = sectionId;
          }
          const ordered = [...others.slice(0, at), moved, ...others.slice(at)].map((x, i) => ({ ...x, order: i }));
          const orderById = new Map(ordered.map((x) => [x.id, x]));
          set((s) => ({ tasks: s.tasks.map((x) => orderById.get(x.id) ?? x) }));
          return ok();
        },

        completeTask(taskId, done) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          const { t, p, ctx } = r;
          if (done === isDone(t)) return ok();
          if (done) {
            const byId = new Map(get().tasks.map((x) => [x.id, x]));
            const open = t.dependsOn.map((id) => byId.get(id)).filter((x): x is Task => Boolean(x) && !isDone(x!));
            if (open.length && t.type !== 'approval') return fail(`Blocked by ${open.map((x) => `“${x.title}”`).join(', ')} — complete those first.`);
            if (t.type === 'approval' && t.approval?.decision === 'pending') return fail('Approvals are completed by the approver’s decision.');
            const next = finishTask(t, ctx.user.id, p);
            set((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...next, updatedAt: Date.now() } : x)) }));
            audit({ action: 'projects.task.completed', target: `${p.key}-${t.number} ${t.title}` });
            return ok(`Completed ${p.key}-${t.number} 🎉`);
          }
          const inDone = DONE_SECTION.test(p.sections.find((s) => s.id === t.sectionId)?.name ?? '');
          patchTask(taskId, (x) => ({ ...x, status: 'todo', completedAt: undefined, sectionId: inDone ? p.sections[0].id : x.sectionId, activity: [...x.activity, act(ctx.user.id, 'reopened')] }));
          return ok('Reopened.');
        },

        deleteTask(taskId) {
          const ctx = viewer();
          const t = task(taskId);
          const p = t ? project(t.projectId) : undefined;
          if (!ctx || !t || !p || !access.canDeleteTask(ctx.v, p, t)) return fail('You can’t delete this task.');
          set((s) => ({ tasks: s.tasks.filter((x) => x.id !== taskId).map((x) => (x.dependsOn.includes(taskId) ? { ...x, dependsOn: x.dependsOn.filter((id) => id !== taskId) } : x)) }));
          audit({ action: 'projects.task.deleted', target: `${p.key}-${t.number} ${t.title}`, severity: 'warning' });
          return ok(`Deleted ${p.key}-${t.number}.`);
        },

        addSubtask(taskId, title, assigneeId, dueDate) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          if (!title.trim()) return fail('Name the subtask.');
          patchTask(taskId, (t) => ({ ...t, subtasks: [...t.subtasks, { id: uid('st'), title: title.trim(), done: false, assigneeId, dueDate }], activity: [...t.activity, act(r.ctx.user.id, 'subtask_added', title.trim())] }));
          return ok();
        },

        toggleSubtask(taskId, subtaskId) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)) }));
          return ok();
        },

        removeSubtask(taskId, subtaskId) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }));
          return ok();
        },

        addComment(taskId, body, mentions = []) {
          const ctx = viewer();
          const t = task(taskId);
          const p = t ? project(t.projectId) : undefined;
          if (!ctx || !t || !p || !access.canCommentProject(ctx.v, p)) return fail('You need commenter access on this project.');
          const clean = body.trim();
          if (!clean) return fail('Write something first.');
          const now = Date.now();
          patchTask(taskId, (x) => ({ ...x, comments: [...x.comments, { id: uid('c'), authorId: ctx.user.id, body: clean, at: now, mentions, reactions: {} }], activity: [...x.activity, act(ctx.user.id, 'commented')] }));
          notify([t.assigneeId, t.creatorId, ...t.collaboratorIds, ...mentions], { title: `${ctx.user.name} commented · ${p.key}-${t.number}`, body: clean.slice(0, 120), link: taskLink(p.id, t.id) }, ctx.user.id);
          return ok('Comment posted.');
        },

        toggleReaction(taskId, commentId, emoji) {
          const ctx = viewer();
          if (!ctx) return fail('Not signed in.');
          patchTask(taskId, (t) => ({
            ...t,
            comments: t.comments.map((c) => {
              if (c.id !== commentId) return c;
              const who = c.reactions[emoji] ?? [];
              const next = who.includes(ctx.user.id) ? who.filter((id) => id !== ctx.user.id) : [...who, ctx.user.id];
              const reactions = { ...c.reactions, [emoji]: next };
              if (!next.length) delete reactions[emoji];
              return { ...c, reactions };
            }),
          }));
          return ok();
        },

        toggleLike(taskId) {
          const ctx = viewer();
          const t = task(taskId);
          const p = t ? project(t.projectId) : undefined;
          if (!ctx || !t || !p || !access.canCommentProject(ctx.v, p)) return fail('You need commenter access on this project.');
          const liked = t.likes.includes(ctx.user.id);
          patchTask(taskId, (x) => ({ ...x, likes: liked ? x.likes.filter((id) => id !== ctx.user.id) : [...x.likes, ctx.user.id] }));
          if (!liked && t.assigneeId) notify([t.assigneeId], { title: `${ctx.user.name} liked your task`, body: t.title, link: taskLink(p.id, t.id) }, ctx.user.id);
          return ok();
        },

        toggleFollow(taskId) {
          const ctx = viewer();
          const t = task(taskId);
          const p = t ? project(t.projectId) : undefined;
          if (!ctx || !t || !p || !access.canCommentProject(ctx.v, p)) return fail('You need commenter access on this project.');
          const following = t.collaboratorIds.includes(ctx.user.id);
          patchTask(taskId, (x) => ({ ...x, collaboratorIds: following ? x.collaboratorIds.filter((id) => id !== ctx.user.id) : [...x.collaboratorIds, ctx.user.id] }));
          return ok(following ? 'Unfollowed.' : 'You’ll be notified about this task.');
        },

        addAttachment(taskId, att) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          if (!att.title.trim()) return fail('Attachment needs a title.');
          patchTask(taskId, (t) => ({ ...t, attachments: [...t.attachments, { ...att, id: uid('att'), addedBy: r.ctx.user.id, at: Date.now() }], activity: [...t.activity, act(r.ctx.user.id, 'attached', att.title)] }));
          return ok(`Attached ${att.title}.`);
        },

        removeAttachment(taskId, attachmentId) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          patchTask(taskId, (t) => ({ ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) }));
          return ok();
        },

        setDependency(taskId, dependsOnId, add) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          const dep = task(dependsOnId);
          if (!dep) return fail('Dependency not found.');
          if (add) {
            const byId = new Map(get().tasks.map((x) => [x.id, x]));
            if (wouldCreateCycle(taskId, dependsOnId, byId)) return fail('That would create a circular dependency.');
            if (r.t.dependsOn.includes(dependsOnId)) return ok();
            patchTask(taskId, (t) => ({ ...t, dependsOn: [...t.dependsOn, dependsOnId], activity: [...t.activity, act(r.ctx.user.id, 'blocked_by', dep.title)] }));
            return ok(`Now blocked by “${dep.title}”.`);
          }
          patchTask(taskId, (t) => ({ ...t, dependsOn: t.dependsOn.filter((id) => id !== dependsOnId) }));
          return ok('Dependency removed.');
        },

        decideApproval(taskId, decision, note) {
          const ctx = viewer();
          const t = task(taskId);
          const p = t ? project(t.projectId) : undefined;
          const gate = access.canDecideApproval(ctx?.v ?? null, t);
          if (!ctx || !t || !p || !gate.ok) {
            audit({ action: 'projects.approval.denied', target: t ? `${p?.key}-${t.number}` : taskId, detail: gate.ok ? 'Not found' : gate.reason, outcome: 'denied', severity: 'warning' });
            return fail(gate.ok ? 'Task not found.' : gate.reason);
          }
          if (decision !== 'approved' && !note?.trim()) return fail('Add a short note so the requester knows what to change.');
          const now = Date.now();
          let next: Task = { ...t, approval: { ...t.approval!, decision, decidedAt: now, note: note?.trim() || undefined }, activity: [...t.activity, act(ctx.user.id, `approval_${decision}`, note?.trim())] };
          if (decision === 'approved') next = finishTask(next, ctx.user.id, p);
          else if (decision === 'rejected') next = { ...next, status: 'done', completedAt: now, tags: next.tags.includes('rejected') ? next.tags : [...next.tags, 'rejected'] };
          else next = { ...next, status: 'in_progress' };
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...next, updatedAt: now } : x)) }));
          notify([t.creatorId, t.assigneeId], { title: `Approval ${decision.replace('_', ' ')} · ${p.key}-${t.number}`, body: `${ctx.user.name}: ${note?.trim() || t.title}`, link: taskLink(p.id, t.id) }, ctx.user.id);
          audit({ action: `projects.approval.${decision}`, target: `${p.key}-${t.number} ${t.title}`, detail: note?.trim() });
          return ok(decision === 'approved' ? 'Approved ✓' : decision === 'rejected' ? 'Rejected.' : 'Sent back with your notes.');
        },

        logTime(taskId, hours) {
          const r = requireTaskEdit(taskId);
          if (r.error) return r.error;
          if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return fail('Log between 0.25 and 24 hours.');
          patchTask(taskId, (t) => ({ ...t, loggedHours: Math.round((t.loggedHours + hours) * 4) / 4, activity: [...t.activity, act(r.ctx.user.id, 'time_logged', `${hours}h`)] }));
          return ok(`Logged ${hours}h.`);
        },

        setMyTaskBucket(taskId, bucket) {
          const ctx = viewer();
          if (!ctx) return;
          patchUserState(ctx.user.id, (u) => {
            const buckets = { ...u.buckets };
            if (bucket) buckets[taskId] = bucket;
            else delete buckets[taskId];
            return { ...u, buckets };
          });
        },

        // ───────────────────────── status, portfolios, goals ─────────────────────────
        postStatusUpdate(projectId, draft) {
          const r = requireProjectEdit(projectId);
          if (r.error) return r.error;
          if (draft.title.trim().length < 4) return fail('Give the update a headline.');
          const update: StatusUpdate = { ...draft, id: uid('su'), projectId, authorId: r.ctx.user.id, at: Date.now(), title: draft.title.trim(), summary: draft.summary.trim() };
          set((s) => ({ statusUpdates: [update, ...s.statusUpdates] }));
          patchProject(projectId, (p) => ({ ...p, health: draft.health as ProjectHealth }));
          notify(r.p.members.map((m) => m.userId), { title: `${r.p.name}: ${update.title}`, body: `${r.ctx.user.name} posted a status update (${draft.health.replace('_', ' ')}).`, link: `/projects/p/${projectId}?view=overview` }, r.ctx.user.id);
          audit({ action: 'projects.status.posted', target: r.p.name, detail: draft.health });
          return ok('Status update posted.');
        },

        createPortfolio(input) {
          const ctx = viewer();
          if (!ctx || !access.canCreateProject(ctx.v)) return fail('Contractors can’t create portfolios.');
          if (input.name.trim().length < 3) return fail('Name the portfolio.');
          const visible = (input.projectIds ?? []).filter((id) => access.canViewProject(ctx.v, project(id)));
          const portfolioId = uid('pf');
          set((s) => ({ portfolios: [...s.portfolios, { id: portfolioId, name: input.name.trim(), description: input.description.trim(), color: input.color, ownerId: ctx.user.id, projectIds: visible, createdAt: Date.now() }] }));
          return { ok: true, message: `Created portfolio ${input.name.trim()}.`, portfolioId };
        },

        setPortfolioProjects(portfolioId, projectIds) {
          const ctx = viewer();
          const pf = get().portfolios.find((x) => x.id === portfolioId);
          if (!ctx || !pf) return fail('Portfolio not found.');
          if (pf.ownerId !== ctx.user.id && !access.canManageProjects(ctx.v)) return fail('Only the portfolio owner can change it.');
          set((s) => ({ portfolios: s.portfolios.map((x) => (x.id === portfolioId ? { ...x, projectIds: projectIds.filter((id) => access.canViewProject(ctx.v, project(id))) } : x)) }));
          return ok('Portfolio updated.');
        },

        deletePortfolio(portfolioId) {
          const ctx = viewer();
          const pf = get().portfolios.find((x) => x.id === portfolioId);
          if (!ctx || !pf) return fail('Portfolio not found.');
          if (pf.ownerId !== ctx.user.id && !access.canManageProjects(ctx.v)) return fail('Only the portfolio owner can delete it.');
          set((s) => ({ portfolios: s.portfolios.filter((x) => x.id !== portfolioId) }));
          return ok('Portfolio deleted.');
        },

        createGoal(input) {
          const ctx = viewer();
          if (!ctx || !access.canCreateProject(ctx.v)) return fail('Contractors can’t create goals.');
          if (input.level === 'company' && !access.canManageProjects(ctx.v)) return fail('Company goals are created by leadership (`projects.manage`).');
          if (input.title.trim().length < 4) return fail('Give the goal a title.');
          const goalId = uid('g');
          const now = Date.now();
          set((s) => ({
            goals: [
              ...s.goals,
              { id: goalId, title: input.title.trim(), description: input.description.trim(), ownerId: ctx.user.id, level: input.level, department: input.level === 'team' ? (input.department ?? ctx.user.department) : undefined, parentId: input.parentId, projectIds: input.projectIds.filter((id) => access.canViewProject(ctx.v, project(id))), metric: input.metric, status: 'on_track', targetDate: input.targetDate, createdAt: now, updatedAt: now },
            ],
          }));
          audit({ action: 'projects.goal.created', target: input.title.trim(), detail: input.level });
          return { ok: true, message: 'Goal created.', goalId };
        },

        updateGoal(goalId, patch) {
          const ctx = viewer();
          const g = get().goals.find((x) => x.id === goalId);
          if (!ctx || !g) return fail('Goal not found.');
          if (g.ownerId !== ctx.user.id && !access.canManageProjects(ctx.v)) return fail('Only the goal owner can update it.');
          set((s) => ({ goals: s.goals.map((x) => (x.id === goalId ? { ...x, ...patch, updatedAt: Date.now() } : x)) }));
          return ok('Goal updated.');
        },

        // ───────────────────────── sprints ─────────────────────────
        createSprint(projectId, input) {
          const r = requireProjectEdit(projectId);
          if (r.error) return r.error;
          if (input.endDate <= input.startDate) return fail('Sprint end must be after its start.');
          const sprintId = uid('spr');
          set((s) => ({ sprints: [...s.sprints, { id: sprintId, projectId, name: input.name.trim() || 'Sprint', goal: input.goal.trim(), startDate: input.startDate, endDate: input.endDate, state: 'planned' }] }));
          return { ok: true, message: `Planned ${input.name}.`, sprintId };
        },

        startSprint(sprintId) {
          const sp = get().sprints.find((x) => x.id === sprintId);
          if (!sp) return fail('Sprint not found.');
          const r = requireProjectEdit(sp.projectId);
          if (r.error) return r.error;
          if (get().sprints.some((x) => x.projectId === sp.projectId && x.state === 'active')) return fail('Complete the active sprint first.');
          const committed = sprintStats(sp, get().tasks).committed;
          set((s) => ({ sprints: s.sprints.map((x) => (x.id === sprintId ? { ...x, state: 'active', committedPoints: committed } : x)) }));
          notify(r.p.members.map((m) => m.userId), { title: `${sp.name} started`, body: `${committed} points committed · ${sp.goal}`, link: `/projects/p/${sp.projectId}?view=sprints` }, r.ctx.user.id);
          return ok(`${sp.name} is live — ${committed} points committed.`);
        },

        completeSprint(sprintId, rolloverSprintId) {
          const sp = get().sprints.find((x) => x.id === sprintId);
          if (!sp) return fail('Sprint not found.');
          const r = requireProjectEdit(sp.projectId);
          if (r.error) return r.error;
          const stats = sprintStats(sp, get().tasks);
          const target = rolloverSprintId ? get().sprints.find((x) => x.id === rolloverSprintId && x.projectId === sp.projectId) : undefined;
          set((s) => ({
            sprints: s.sprints.map((x) => (x.id === sprintId ? { ...x, state: 'completed', completedPoints: stats.done, committedPoints: x.committedPoints ?? stats.committed } : x)),
            tasks: s.tasks.map((t) => (t.sprintId === sprintId && !isDone(t) ? { ...t, sprintId: target?.id, activity: [...t.activity, act(r.ctx.user.id, 'rolled_over', target?.name ?? 'backlog')] } : t)),
          }));
          audit({ action: 'projects.sprint.completed', target: `${r.p.name} · ${sp.name}`, detail: `${stats.done}/${stats.committed} pts` });
          return ok(`Closed ${sp.name}: ${stats.done} of ${stats.committed} points done${stats.remaining ? `, ${stats.tasks - stats.doneTasks} tasks rolled to ${target?.name ?? 'the backlog'}` : ''}.`);
        },

        // ───────────────────────── automations & forms ─────────────────────────
        upsertRule(projectId, rule) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          if (rule.name.trim().length < 3) return fail('Name the rule.');
          const ruleId = rule.id ?? uid('rule');
          set((s) => {
            const exists = s.rules.some((x) => x.id === ruleId);
            const next: AutomationRule = { ...(s.rules.find((x) => x.id === ruleId) ?? { runs: 0, createdBy: r.ctx.user.id }), ...rule, id: ruleId, projectId, name: rule.name.trim() } as AutomationRule;
            return { rules: exists ? s.rules.map((x) => (x.id === ruleId ? next : x)) : [...s.rules, next] };
          });
          audit({ action: 'projects.rule.saved', target: `${r.p.name} · ${rule.name.trim()}`, detail: `${rule.trigger} → ${rule.action}` });
          return { ok: true, message: `Rule “${rule.name.trim()}” saved.`, ruleId };
        },

        toggleRule(ruleId, enabled) {
          const rule = get().rules.find((x) => x.id === ruleId);
          if (!rule) return fail('Rule not found.');
          const r = requireProjectAdmin(rule.projectId);
          if (r.error) return r.error;
          set((s) => ({ rules: s.rules.map((x) => (x.id === ruleId ? { ...x, enabled } : x)) }));
          return ok(enabled ? 'Rule enabled.' : 'Rule paused.');
        },

        deleteRule(ruleId) {
          const rule = get().rules.find((x) => x.id === ruleId);
          if (!rule) return fail('Rule not found.');
          const r = requireProjectAdmin(rule.projectId);
          if (r.error) return r.error;
          set((s) => ({ rules: s.rules.filter((x) => x.id !== ruleId) }));
          return ok('Rule deleted.');
        },

        upsertForm(projectId, form) {
          const r = requireProjectAdmin(projectId);
          if (r.error) return r.error;
          if (form.title.trim().length < 3 || !form.fields.length) return fail('Forms need a title and at least one field.');
          const formId = form.id ?? uid('frm');
          set((s) => {
            const existing = s.forms.find((x) => x.id === formId);
            const next: IntakeForm = { submissions: 0, createdBy: r.ctx.user.id, ...existing, ...form, id: formId, projectId, title: form.title.trim() };
            return { forms: existing ? s.forms.map((x) => (x.id === formId ? next : x)) : [...s.forms, next] };
          });
          return { ok: true, message: 'Form saved.', formId };
        },

        submitForm(formId, values) {
          const ctx = viewer();
          const form = get().forms.find((f) => f.id === formId);
          const p = form ? project(form.projectId) : undefined;
          if (!ctx || !access.canUseProjects(ctx.v) || !form || !p) return fail('Form not found.');
          if (!form.enabled) return fail('This form is closed.');
          const missing = form.fields.filter((f) => f.required && !values[f.id]?.trim());
          if (missing.length) return fail(`Please fill in: ${missing.map((f) => f.label).join(', ')}.`);
          const field = (k: NonNullable<IntakeForm['fields'][number]['mapsTo']>) => form.fields.find((f) => f.mapsTo === k);
          const title = values[field('title')?.id ?? '']?.trim() || `${form.title} · ${ctx.user.name}`;
          const extra = form.fields.filter((f) => !f.mapsTo || f.mapsTo === 'tag').map((f) => `${f.label}: ${values[f.id] ?? '—'}`);
          const description = [values[field('description')?.id ?? '']?.trim(), ...extra, `Submitted via “${form.title}” by ${ctx.user.name}.`].filter(Boolean).join('\n');
          const tagValue = values[field('tag')?.id ?? '']?.trim();
          const dueDate = values[field('dueDate')?.id ?? '']?.trim() || undefined;
          const created = insertTask(
            p,
            {
              projectId: p.id,
              sectionId: p.sections.some((s) => s.id === form.targetSectionId) ? form.targetSectionId : p.sections[0].id,
              title,
              description,
              type: 'task',
              status: 'todo',
              priority: form.defaultPriority,
              assigneeId: form.defaultAssigneeId,
              collaboratorIds: [ctx.user.id],
              creatorId: ctx.user.id,
              dueDate,
              loggedHours: 0,
              tags: tagValue ? [tagValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')] : [],
              customFieldValues: {},
              subtasks: [],
              dependsOn: [],
              attachments: [],
              comments: [],
              likes: [],
            },
            ctx.user.id,
          );
          set((s) => ({ forms: s.forms.map((f) => (f.id === formId ? { ...f, submissions: f.submissions + 1 } : f)) }));
          notify([form.defaultAssigneeId, p.ownerId], { title: `New submission · ${form.title}`, body: `${ctx.user.name}: ${title}`, link: taskLink(p.id, created.id) }, ctx.user.id);
          audit({ action: 'projects.form.submitted', target: `${p.key}-${created.number} ${title}`, detail: form.title });
          return { ok: true, message: `Submitted — tracked as ${p.key}-${created.number}.`, taskId: created.id };
        },

        runScheduledRules() {
          const today = todayISO();
          const rules = get().rules.filter((r) => r.enabled && r.trigger === 'due_date_passed');
          if (!rules.length) return 0;
          let fired = 0;
          const ruleIds = new Set<string>();
          const tasks = get().tasks.map((t) => {
            if (isDone(t) || !t.dueDate || t.dueDate >= today) return t;
            if (t.activity.some((a) => a.action === 'rule:due_date_passed')) return t;
            const mine = rules.filter((r) => r.projectId === t.projectId);
            if (!mine.length) return t;
            let next = { ...t };
            for (const r of mine) {
              if (r.action === 'add_tag' && r.actionValue && !next.tags.includes(r.actionValue)) next.tags = [...next.tags, r.actionValue];
              if (r.action === 'set_priority' && r.actionValue) next.priority = r.actionValue as TaskPriority;
              if (r.action === 'notify_owner') {
                const p = project(t.projectId);
                if (p) notify([p.ownerId, t.assigneeId], { title: `Overdue · ${p.key}-${t.number}`, body: t.title, link: taskLink(p.id, t.id) });
              }
              ruleIds.add(r.id);
            }
            fired += 1;
            return { ...next, activity: [...next.activity, act('system', 'rule:due_date_passed', mine.map((r) => r.name).join(', '))] };
          });
          if (fired) set((s) => ({ tasks, rules: s.rules.map((r) => (ruleIds.has(r.id) ? { ...r, runs: r.runs + 1, lastRunAt: Date.now() } : r)) }));
          return fired;
        },

        markInboxRead() {
          const ctx = viewer();
          if (!ctx) return;
          patchUserState(ctx.user.id, (u) => ({ ...u, inboxReadAt: Date.now() }));
        },

        resetProjectsDemo() {
          set(createProjectsSeed());
        },
      };
    },
    {
      name: 'nexus-projects',
      version: PROJECTS_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ProjectsData => ({
        version: s.version,
        projects: s.projects,
        tasks: s.tasks,
        statusUpdates: s.statusUpdates,
        portfolios: s.portfolios,
        goals: s.goals,
        sprints: s.sprints,
        rules: s.rules,
        forms: s.forms,
        userState: s.userState,
      }),
      migrate: (persisted, version) => (version === PROJECTS_DATA_VERSION ? (persisted as ProjectsData) : createProjectsSeed()),
    },
  ),
);

let initialized = false;
/** Run time-based automations once per session (overdue tags), like a scheduler would. */
export function initProjects() {
  if (initialized) return;
  initialized = true;
  useProjects.getState().runScheduledRules();
}
