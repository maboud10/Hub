/**
 * Helix Projects store — behaves like an API: every action validates input,
 * re-checks permissions for the acting user, writes audit entries for
 * security-relevant changes, notifies affected people (Hub bell + in-app
 * Inbox) with deep links, and fires project automations.
 *
 * Actions accept an optional `as` actor (bridge calls pass the viewer);
 * otherwise the signed-in Hub user acts.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { uid } from '@/lib/id';
import { toast } from '@/store/toast';
import {
  type Actor,
  actorFrom,
  canAdminProject,
  canCommentTask,
  canCompleteTask,
  canCreateProject,
  canDecideApproval,
  canDeleteTask,
  canEditProject,
  canEditTask,
  canSeeTask,
  canViewProject,
  isProjectsAdmin,
  memberRole,
} from './access';
import { type AutoEvent, ruleMatches } from './automation';
import { addDays, formatDue, isIsoDate, todayIso } from './dates';
import { wouldCreateCycle } from './graph';
import { taskKey } from './metrics';
import { PRIORITY_NAME, resolveUser } from './nlp';
import { PROJECTS_DATA_VERSION, createProjectsSeed } from './seed';
import { TEMPLATES, type TemplateId } from './templates';
import type {
  ApprovalState,
  Attachment,
  InboxItem,
  InboxKind,
  PlanSlot,
  Portfolio,
  Priority,
  Privacy,
  Project,
  ProjectRole,
  ProjectStatus,
  ProjectsData,
  Result,
  Rule,
  Section,
  SectionStage,
  StatusUpdate,
  Task,
  TaskKind,
  TaskSource,
  UserState,
  ViewId,
} from './types';

/* ───────────────────────── inputs ───────────────────────── */

export interface NewTaskInput {
  title: string;
  projectId?: string | null;
  sectionId?: string | null;
  assigneeId?: string | null;
  dueDate?: string;
  dueTime?: string;
  startDate?: string;
  priority?: Priority;
  tags?: string[];
  estimate?: number;
  description?: string;
  kind?: TaskKind;
  approverId?: string;
  blockedBy?: string[];
  source?: TaskSource;
  /** Insert position inside the section (default: end). */
  index?: number;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'assigneeId' | 'startDate' | 'dueDate' | 'dueTime' | 'priority' | 'estimate' | 'tags' | 'kind'>>;

export interface NewProjectInput {
  name: string;
  key?: string;
  icon: string;
  color: string;
  department: Project['department'];
  privacy: Privacy;
  template: TemplateId;
  members: { userId: string; role: ProjectRole }[];
  startDate?: string;
  dueDate?: string;
  brief?: string;
}

export interface DeletedTasks {
  tasks: Task[];
  /** taskId → ids of tasks that were blocked by it */
  refs: Record<string, string[]>;
}

export interface DeletedProject {
  project: Project;
  tasks: Task[];
  rules: Rule[];
  updates: StatusUpdate[];
  portfolios: { id: string; index: number }[];
}

type Ok<T extends object = object> = Result<T>;
const ok = <T extends object>(v: T = {} as T): Ok<T> => ({ ok: true, ...v });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ───────────────────────── helpers ───────────────────────── */

const DEFAULT_USER_STATE: UserState = { starred: [], lastView: {}, sideCollapsed: false, browseMode: 'gallery' };
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];
const STATUSES: ProjectStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'complete'];
const ROLES: ProjectRole[] = ['owner', 'editor', 'commenter', 'viewer'];
const isBrowser = typeof window !== 'undefined';

function hubUsers(): User[] {
  return useHub.getState().users;
}
function userName(id: string | null | undefined): string {
  if (!id) return 'Unassigned';
  if (id === 'automation') return 'Automation';
  return hubUsers().find((u) => u.id === id)?.name ?? 'Someone';
}
const firstOf = (id: string | null | undefined) => userName(id).split(' ')[0];

export function sessionActor(): Actor | null {
  const v = currentViewer();
  return v ? actorFrom(v.user, v.perms) : null;
}

/** Actor for any directory user (used to check what a recipient may see). */
function actorForUser(userId: string): Actor | null {
  const s = useHub.getState();
  const u = s.users.find((x) => x.id === userId);
  if (!u || !u.active) return null;
  return actorFrom(u, effectivePermissions(u, s.roles));
}

export function taskLink(t: Pick<Task, 'id' | 'projectId'>): string {
  return t.projectId ? `/projects/p/${t.projectId}?task=${t.id}` : `/projects?task=${t.id}`;
}

function audit(action: string, target: string, detail: string, outcome: 'success' | 'denied', severity: 'info' | 'warning' | 'critical', actorId?: string) {
  useHub.getState().logAudit({ action, target, detail, outcome, severity, actorId });
}

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/^[#+]/, '').replace(/\s+/g, '-')).filter(Boolean))].slice(0, 12);

function parseMentions(body: string): string[] {
  const users = hubUsers().filter((u) => u.active);
  const ids = new Set<string>();
  const re = /(?<=^|[\s(])@([\p{L}][\p{L}.'-]*)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const u = resolveUser(m[1], users);
    if (u) ids.add(u.id);
  }
  return [...ids];
}

function suggestKey(name: string, taken: Set<string>): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let base = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 5) : (words[0] ?? 'PRJ').slice(0, 5);
  if (base.length < 2) base = (words.join('') + 'PRJ').slice(0, 4);
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}${i}`;
  return key;
}
export { suggestKey };

/* ───────────────────────── state ───────────────────────── */

export interface ProjectsActions {
  // projects
  createProject(input: NewProjectInput, as?: Actor): Ok<{ projectId: string }>;
  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'icon' | 'color' | 'brief' | 'startDate' | 'dueDate' | 'priority' | 'channelId' | 'department'>>, as?: Actor): Ok;
  setProjectStatus(id: string, status: ProjectStatus, as?: Actor): Ok;
  setPrivacy(id: string, privacy: Privacy, as?: Actor): Ok;
  setMemberRole(id: string, userId: string, role: ProjectRole | null, as?: Actor): Ok;
  addMembers(id: string, userIds: string[], role: ProjectRole, as?: Actor): Ok<{ added: number }>;
  archiveProject(id: string, archived: boolean, as?: Actor): Ok;
  deleteProject(id: string, as?: Actor): Ok<{ snapshot: DeletedProject }>;
  restoreProject(snapshot: DeletedProject): void;
  duplicateProject(id: string, as?: Actor): Ok<{ projectId: string }>;
  addSection(projectId: string, name: string, as?: Actor): Ok<{ sectionId: string }>;
  updateSection(projectId: string, sectionId: string, patch: Partial<Pick<Section, 'name' | 'wip' | 'stage'>>, as?: Actor): Ok;
  moveSection(projectId: string, sectionId: string, toIndex: number, as?: Actor): Ok;
  deleteSection(projectId: string, sectionId: string, as?: Actor): Ok;
  postStatusUpdate(projectId: string, input: { status: ProjectStatus; title: string; body: string; byNova?: boolean }, as?: Actor): Ok<{ updateId: string }>;
  linkKeyResults(projectId: string, keyResultIds: string[], as?: Actor): Ok;
  addProjectAttachment(projectId: string, att: Omit<Attachment, 'id' | 'addedBy' | 'at'>, as?: Actor): Ok;
  removeProjectAttachment(projectId: string, attId: string, as?: Actor): Ok;
  // per-user
  toggleStar(projectId: string): void;
  setLastView(projectId: string, view: ViewId): void;
  setSideCollapsed(v: boolean): void;
  setBrowseMode(m: UserState['browseMode']): void;
  savePlan(slots: PlanSlot[], accepted: boolean): void;
  clearPlan(): void;
  // tasks
  createTask(input: NewTaskInput, as?: Actor): Ok<{ taskId: string }>;
  updateTask(id: string, patch: TaskPatch, as?: Actor): Ok;
  completeTask(id: string, done: boolean, as?: Actor): Ok<{ milestone: boolean }>;
  moveTask(id: string, to: { sectionId: string; index?: number }, as?: Actor): Ok;
  deleteTasks(ids: string[], as?: Actor): Ok<{ snapshot: DeletedTasks; skipped: number }>;
  restoreTasks(snapshot: DeletedTasks): void;
  duplicateTask(id: string, as?: Actor): Ok<{ taskId: string }>;
  convertKind(id: string, kind: TaskKind, as?: Actor): Ok;
  addSubtask(id: string, title: string, as?: Actor): Ok;
  updateSubtask(id: string, subId: string, patch: { title?: string; done?: boolean }, as?: Actor): Ok;
  removeSubtask(id: string, subId: string, as?: Actor): Ok;
  moveSubtask(id: string, subId: string, toIndex: number, as?: Actor): Ok;
  addDependency(id: string, blockerId: string, as?: Actor): Ok;
  removeDependency(id: string, blockerId: string, as?: Actor): Ok;
  addAttachment(id: string, att: Omit<Attachment, 'id' | 'addedBy' | 'at'>, as?: Actor): Ok;
  removeAttachment(id: string, attId: string, as?: Actor): Ok;
  addComment(id: string, body: string, as?: Actor): Ok<{ commentId: string; mentioned: string[] }>;
  deleteComment(id: string, commentId: string, as?: Actor): Ok;
  toggleReaction(id: string, commentId: string, emoji: string, as?: Actor): Ok;
  toggleFollow(id: string, as?: Actor): Ok<{ following: boolean }>;
  decideApproval(id: string, decision: Exclude<ApprovalState, 'pending'>, note?: string, as?: Actor): Ok;
  bulkUpdate(ids: string[], patch: TaskPatch, as?: Actor): Ok<{ changed: number; skipped: number }>;
  bulkComplete(ids: string[], done: boolean, as?: Actor): Ok<{ changed: number; skipped: number }>;
  bulkMove(ids: string[], sectionId: string, as?: Actor): Ok<{ changed: number; skipped: number }>;
  // automations
  createRule(projectId: string, rule: Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions'>, as?: Actor): Ok<{ ruleId: string }>;
  updateRule(ruleId: string, patch: Partial<Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions' | 'enabled'>>, as?: Actor): Ok;
  deleteRule(ruleId: string, as?: Actor): Ok;
  runDueSoonSweep(): number;
  // inbox
  markInboxRead(id: string, read?: boolean): void;
  markAllInboxRead(ids?: string[]): void;
  archiveInbox(id: string, archived?: boolean): void;
  // portfolios
  createPortfolio(input: { name: string; description?: string; color: string; projectIds: string[] }, as?: Actor): Ok<{ portfolioId: string }>;
  updatePortfolio(id: string, patch: Partial<Pick<Portfolio, 'name' | 'description' | 'color' | 'projectIds'>>, as?: Actor): Ok;
  deletePortfolio(id: string, as?: Actor): Ok;
  // demo
  resetDemo(): void;
}

export type ProjectsStore = ProjectsData & ProjectsActions;

try {
  if (isBrowser) window.localStorage.removeItem('nexus-projects');
} catch {
  /* storage unavailable */
}

export const useProjects = create<ProjectsStore>()(
  persist(
    (set, get) => {
      /* ---------- internal helpers (closures over set/get) ---------- */
      const actorOr = (as?: Actor) => as ?? sessionActor();
      const project = (id: string | null | undefined) => (id ? get().projects.find((p) => p.id === id) : undefined);
      const task = (id: string) => get().tasks.find((t) => t.id === id);
      const patchProject = (id: string, fn: (p: Project) => Project) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)) }));
      const patchTask = (id: string, fn: (t: Task) => Task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)) }));
      const act = (actorId: string, text: string) => ({ id: uid('a'), at: Date.now(), actorId, text });
      const pAct = (projectId: string, actorId: string, text: string) => patchProject(projectId, (p) => ({ ...p, activity: [...p.activity, act(actorId, text)].slice(-80) }));
      const userState = (userId: string): UserState => ({ ...DEFAULT_USER_STATE, ...(get().users[userId] ?? {}) });
      const patchUser = (fn: (u: UserState) => UserState) => {
        const me = sessionActor();
        if (!me) return;
        set((s) => ({ users: { ...s.users, [me.id]: fn({ ...DEFAULT_USER_STATE, ...(s.users[me.id] ?? {}) }) } }));
      };

      /** Inbox items (+ optional Hub bell) for recipients who can see the target. */
      const deliver = (
        recipients: string[],
        actorId: string,
        kind: InboxKind,
        ref: { taskId?: string; projectId?: string },
        title: string,
        body: string | undefined,
        bell?: { title: string; body?: string },
      ) => {
        const t = ref.taskId ? task(ref.taskId) : undefined;
        const p = project(ref.projectId ?? t?.projectId ?? undefined);
        const ids = [...new Set(recipients)].filter((id) => id && id !== actorId && id !== 'automation');
        const allowed = ids.filter((id) => {
          const a = actorForUser(id);
          if (!a) return false;
          if (t) return canSeeTask(t, p, a);
          return p ? canViewProject(p, a) : false;
        });
        if (!allowed.length) return;
        const now = Date.now();
        const items: InboxItem[] = allowed.map((userId) => ({
          id: uid('ib'),
          userId,
          kind,
          actorId,
          taskId: t?.id,
          projectId: p?.id,
          title,
          body,
          at: now,
          read: false,
          archived: false,
        }));
        set((s) => ({ inbox: [...items, ...s.inbox].slice(0, 600) }));
        if (bell) {
          const link = t ? taskLink(t) : p ? `/projects/p/${p.id}/overview` : '/projects/inbox';
          useHub.getState().pushNotifications(allowed, { kind: 'work', title: bell.title, body: bell.body, link });
        }
      };

      const sectionTasks = (projectId: string, sectionId: string) =>
        get()
          .tasks.filter((t) => t.projectId === projectId && t.sectionId === sectionId)
          .sort((a, b) => a.order - b.order);

      /** Place `taskId` into `sectionId` at `index` and renumber the section. */
      const placeInSection = (taskId: string, projectId: string, sectionId: string, index?: number) => {
        const list = sectionTasks(projectId, sectionId).filter((t) => t.id !== taskId);
        const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
        const ids = [...list.slice(0, at).map((t) => t.id), taskId, ...list.slice(at).map((t) => t.id)];
        const order = new Map(ids.map((id, i) => [id, i]));
        set((s) => ({
          tasks: s.tasks.map((t) => (order.has(t.id) ? { ...t, sectionId: t.id === taskId ? sectionId : t.sectionId, order: order.get(t.id)! } : t)),
        }));
      };

      /** Fire project automations for an event. Actions taken by rules never re-trigger rules. */
      const runAutomations = (taskId: string, event: AutoEvent, actor: Actor, depth = 0) => {
        if (depth > 0) return;
        const t0 = task(taskId);
        if (!t0?.projectId) return;
        const now = Date.now();
        const rules = get().rules.filter((r) => r.projectId === t0.projectId);
        for (const rule of rules) {
          const t = task(taskId);
          if (!t || !ruleMatches(rule, event, t, now)) continue;
          const p = project(t.projectId)!;
          const done: string[] = [];
          for (const a of rule.actions) {
            const cur = task(taskId)!;
            switch (a.kind) {
              case 'move': {
                const sec = p.sections.find((s) => s.id === a.value);
                if (!sec || cur.sectionId === sec.id) break;
                placeInSection(cur.id, p.id, sec.id);
                if (sec.stage === 'done' && !cur.completedAt) patchTask(cur.id, (x) => ({ ...x, completedAt: now, completedBy: actor.id }));
                patchTask(cur.id, (x) => ({ ...x, activity: [...x.activity, act('automation', `moved this to ${sec.name} · ${rule.name}`)] }));
                done.push(`moved to ${sec.name}`);
                break;
              }
              case 'assign': {
                const u = hubUsers().find((x) => x.id === a.value && x.active);
                if (!u || cur.assigneeId === u.id) break;
                patchTask(cur.id, (x) => ({
                  ...x,
                  assigneeId: u.id,
                  followers: [...new Set([...x.followers, u.id])],
                  activity: [...x.activity, act('automation', `assigned this to ${u.name} · ${rule.name}`)],
                }));
                deliver([u.id], actor.id, 'assigned', { taskId: cur.id }, `${firstOf(actor.id)} assigned you a task`, cur.title, {
                  title: `New task · ${taskKey(p, cur)}`,
                  body: `${cur.title} (via automation “${rule.name}”)`,
                });
                done.push(`assigned ${u.name.split(' ')[0]}`);
                break;
              }
              case 'priority': {
                const pr = a.value as Priority;
                if (!PRIORITIES.includes(pr) || cur.priority === pr) break;
                patchTask(cur.id, (x) => ({ ...x, priority: pr, activity: [...x.activity, act('automation', `set priority to ${PRIORITY_NAME[pr]} · ${rule.name}`)] }));
                done.push(`priority → ${PRIORITY_NAME[pr]}`);
                break;
              }
              case 'tag': {
                const tag = cleanTags([a.value ?? ''])[0];
                if (!tag || cur.tags.includes(tag)) break;
                patchTask(cur.id, (x) => ({ ...x, tags: [...x.tags, tag] }));
                done.push(`tagged ${tag}`);
                break;
              }
              case 'notify': {
                const to = a.value || cur.assigneeId;
                if (!to) break;
                const recipients = to === actor.id ? [] : [to];
                if (recipients.length) {
                  const items: InboxItem[] = recipients.map((userId) => ({
                    id: uid('ib'),
                    userId,
                    kind: 'automation' as const,
                    actorId: 'automation',
                    taskId: cur.id,
                    projectId: p.id,
                    title: rule.name,
                    body: cur.title,
                    at: now,
                    read: false,
                    archived: false,
                  }));
                  set((s) => ({ inbox: [...items, ...s.inbox].slice(0, 600) }));
                  useHub.getState().pushNotifications(recipients, { kind: 'work', title: `${rule.name} · ${taskKey(p, cur)}`, body: cur.title, link: taskLink(cur) });
                }
                done.push(`notified ${firstOf(to)}`);
                break;
              }
              case 'post': {
                const channelId = a.value || p.channelId;
                if (!channelId || !isBrowser) break;
                const viewer = currentViewer();
                if (!viewer) break;
                const verb = event.kind === 'completed' ? 'completed' : event.kind === 'moved' ? `moved to ${p.sections.find((s) => s.id === cur.sectionId)?.name ?? 'a new stage'}` : event.kind;
                void loadBridge('chat')
                  .then((api) =>
                    api.postToChannel(viewer, {
                      channelId,
                      text: `${taskKey(p, cur)} ${verb} by ${userName(actor.id)}`,
                      card: { app: 'projects', title: `${taskKey(p, cur)} · ${cur.title}`, subtitle: p.name, to: taskLink(cur), status: cur.completedAt ? 'Done' : 'Updated' },
                      asBot: true,
                    }),
                  )
                  .catch(() => undefined);
                done.push(`posted to #${channelId.replace(/^ch-/, '')}`);
                break;
              }
            }
          }
          set((s) => ({
            rules: s.rules.map((r) =>
              r.id === rule.id ? { ...r, runs: r.runs + 1, lastRunAt: now, fired: event.kind === 'due-soon' ? [...new Set([...r.fired, taskId])] : r.fired } : r,
            ),
          }));
          if (isBrowser && done.length) toast.info(`Automation · ${rule.name}`, `${taskKey(p, t)} ${done.join(', ')}`);
        }
      };

      const notifyAssignee = (t: Task, assigneeId: string, actor: Actor) => {
        const p = project(t.projectId);
        deliver([assigneeId], actor.id, 'assigned', { taskId: t.id }, `${firstOf(actor.id)} assigned you a task`, t.title, {
          title: `${firstOf(actor.id)} assigned you ${taskKey(p, t)}`,
          body: t.dueDate ? `${t.title} · due ${formatDue(t.dueDate)}` : t.title,
        });
      };

      const setCompletion = (t: Task, done: boolean, actor: Actor) => {
        const now = Date.now();
        patchTask(t.id, (x) => ({
          ...x,
          completedAt: done ? now : undefined,
          completedBy: done ? actor.id : undefined,
          activity: [...x.activity, act(actor.id, done ? 'completed this task' : 'reopened this task')],
        }));
        const p = project(t.projectId);
        if (p && !done) {
          // reopening a task that sits in a Done column moves it back into flight
          const sec = p.sections.find((s) => s.id === t.sectionId);
          if (sec?.stage === 'done') {
            const back = [...p.sections].reverse().find((s) => s.stage === 'doing') ?? p.sections.find((s) => s.stage !== 'done');
            if (back) placeInSection(t.id, p.id, back.id, 0);
          }
        }
        if (done && t.creatorId !== actor.id && t.creatorId !== t.assigneeId)
          deliver([t.creatorId], actor.id, 'completed', { taskId: t.id }, `${firstOf(actor.id)} completed a task you created`, t.title);
        if (done) runAutomations(t.id, { kind: 'completed' }, actor);
      };

      const guardTask = (id: string, as: Actor | undefined, check: (t: Task, p: Project | undefined, a: Actor) => boolean, msg: string) => {
        const a = actorOr(as);
        if (!a) return fail('You are not signed in.');
        const t = task(id);
        if (!t) return fail('That task no longer exists.');
        const p = project(t.projectId);
        if (!canSeeTask(t, p, a)) return fail('That task no longer exists.');
        if (!check(t, p, a)) return fail(msg);
        return { ok: true as const, a, t, p };
      };

      const guardProject = (id: string, as: Actor | undefined, check: (p: Project, a: Actor) => boolean, msg: string, auditAction?: string) => {
        const a = actorOr(as);
        if (!a) return fail('You are not signed in.');
        const p = project(id);
        if (!p || !canViewProject(p, a)) return fail('Project not found.');
        if (!check(p, a)) {
          if (auditAction) audit(auditAction, p.name, 'Insufficient project role', 'denied', 'warning', a.id);
          return fail(msg);
        }
        return { ok: true as const, a, p };
      };

      const READ_ONLY = 'You have view-only access to this project.';

      return {
        ...createProjectsSeed(),

        /* ═════════════════════ projects ═════════════════════ */
        createProject(input, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          if (!canCreateProject(a)) {
            audit('projects.project.create', input.name || 'New project', 'Contractors cannot create projects', 'denied', 'warning', a.id);
            return fail('Contractors can’t create projects.');
          }
          const name = input.name.trim();
          if (name.length < 3) return fail('Give the project a name (3+ characters).');
          if (name.length > 80) return fail('Keep the name under 80 characters.');
          const taken = new Set(get().projects.map((p) => p.key));
          let key = (input.key ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
          if (key && taken.has(key)) return fail(`The key ${key} is already used.`);
          if (!key) key = suggestKey(name, taken);
          if (key.length < 2) return fail('Keys need at least 2 letters.');
          const startDate = input.startDate && isIsoDate(input.startDate) ? input.startDate : todayIso();
          const dueDate = input.dueDate && isIsoDate(input.dueDate) && input.dueDate >= startDate ? input.dueDate : addDays(startDate, 42);
          const tpl = TEMPLATES.find((t) => t.id === input.template) ?? TEMPLATES[0];
          const id = `prj-${key.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
          const now = Date.now();
          const users = hubUsers();
          const members = [
            { userId: a.id, role: 'owner' as ProjectRole, addedAt: now, addedBy: a.id },
            ...input.members
              .filter((m) => m.userId !== a.id && users.some((u) => u.id === m.userId && u.active) && ROLES.includes(m.role) && m.role !== 'owner')
              .map((m) => ({ userId: m.userId, role: m.role, addedAt: now, addedBy: a.id })),
          ];
          const sections: Section[] = tpl.sections.map((s, i) => ({ id: `${id}-s${i + 1}`, name: s.name, stage: s.stage, wip: s.wip }));
          const p: Project = {
            id,
            key,
            name,
            icon: input.icon || '🚀',
            color: input.color || '#a78bfa',
            department: input.department,
            ownerId: a.id,
            privacy: input.privacy,
            status: 'on-track',
            priority: 'medium',
            members,
            sections,
            brief: input.brief?.trim() || tpl.brief,
            startDate,
            dueDate,
            keyResultIds: [],
            attachments: [],
            activity: [act(a.id, `created this project from the ${tpl.name} template`)],
            archived: false,
            nextNumber: 1,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ projects: [...s.projects, p] }));
          // template starter tasks
          tpl.tasks.forEach((tt, i) => {
            const sec = sections[Math.min(tt.section, sections.length - 1)];
            const pr = get().projects.find((x) => x.id === id)!;
            const number = pr.nextNumber;
            patchProject(id, (x) => ({ ...x, nextNumber: x.nextNumber + 1 }));
            const t: Task = {
              id: uid('t'),
              projectId: id,
              sectionId: sec.id,
              number,
              title: tt.title,
              description: tt.description ?? '',
              kind: tt.kind ?? 'task',
              priority: tt.priority ?? 'medium',
              assigneeId: null,
              creatorId: a.id,
              followers: [a.id],
              dueDate: tt.dueOffset !== undefined ? addDays(startDate, tt.dueOffset) : undefined,
              estimate: tt.estimate,
              tags: [],
              subtasks: [],
              blockedBy: [],
              attachments: [],
              comments: [],
              activity: [act(a.id, 'created this task')],
              order: i,
              createdAt: now,
              updatedAt: now,
            };
            set((s) => ({ tasks: [...s.tasks, t] }));
          });
          set((s) => ({ users: { ...s.users, [a.id]: { ...userState(a.id), starred: [...new Set([...userState(a.id).starred, id])] } } }));
          audit('projects.project.create', name, `${key} · ${input.privacy} · ${members.length} members`, 'success', 'info', a.id);
          const invited = members.filter((m) => m.userId !== a.id).map((m) => m.userId);
          deliver(invited, a.id, 'access', { projectId: id }, `${firstOf(a.id)} added you to ${name}`, `You're a ${'member'}`, { title: `${firstOf(a.id)} added you to ${name}` });
          return ok({ projectId: id });
        },

        updateProject(id, patch, as) {
          const g = guardProject(id, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          const next: Partial<Project> = {};
          if (patch.name !== undefined) {
            const n = patch.name.trim();
            if (n.length < 3) return fail('Project names need 3+ characters.');
            next.name = n.slice(0, 80);
          }
          if (patch.icon !== undefined) next.icon = patch.icon || g.p.icon;
          if (patch.color !== undefined) next.color = patch.color;
          if (patch.brief !== undefined) next.brief = patch.brief.slice(0, 6000);
          if (patch.priority !== undefined && PRIORITIES.includes(patch.priority)) next.priority = patch.priority;
          if (patch.channelId !== undefined) next.channelId = patch.channelId || undefined;
          if (patch.department !== undefined) next.department = patch.department;
          const start = patch.startDate ?? g.p.startDate;
          const due = patch.dueDate ?? g.p.dueDate;
          if (patch.startDate !== undefined || patch.dueDate !== undefined) {
            if (!isIsoDate(start) || !isIsoDate(due)) return fail('Invalid date.');
            if (due < start) return fail('The due date must be after the start date.');
            next.startDate = start;
            next.dueDate = due;
          }
          patchProject(id, (p) => ({ ...p, ...next }));
          return ok();
        },

        setProjectStatus(id, status, as) {
          const g = guardProject(id, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          if (!STATUSES.includes(status)) return fail('Unknown status.');
          patchProject(id, (p) => ({ ...p, status }));
          pAct(id, g.a.id, `set the status to ${status.replace('-', ' ')}`);
          return ok();
        },

        setPrivacy(id, privacy, as) {
          const g = guardProject(id, as, canAdminProject, 'Only owners and Projects admins can change privacy.', 'projects.project.privacy');
          if (!g.ok) return g;
          if (g.p.privacy === privacy) return ok();
          const before = g.p.privacy;
          patchProject(id, (p) => ({ ...p, privacy }));
          pAct(id, g.a.id, `changed privacy from ${before} to ${privacy}`);
          audit('projects.project.privacy', g.p.name, `${before} → ${privacy}`, 'success', 'warning', g.a.id);
          return ok();
        },

        setMemberRole(id, userId, role, as) {
          const g = guardProject(id, as, canAdminProject, 'Only owners and Projects admins can manage members.', 'projects.member.role');
          if (!g.ok) return g;
          const p = g.p;
          const current = memberRole(p, userId);
          const who = userName(userId);
          if (role === null) {
            if (!current) return ok();
            if (userId === p.ownerId) return fail('Transfer ownership before removing the owner.');
            patchProject(id, (x) => ({ ...x, members: x.members.filter((m) => m.userId !== userId) }));
            pAct(id, g.a.id, `removed ${who}`);
            audit('projects.member.remove', p.name, who, 'success', 'warning', g.a.id);
            return ok();
          }
          if (!ROLES.includes(role)) return fail('Unknown role.');
          const u = hubUsers().find((x) => x.id === userId && x.active);
          if (!u) return fail('That person is not an active Helix member.');
          if (role === 'owner') {
            if (userId === p.ownerId) return ok();
            patchProject(id, (x) => ({
              ...x,
              ownerId: userId,
              members: [
                ...x.members.map((m) => (m.userId === x.ownerId ? { ...m, role: 'editor' as ProjectRole } : m.userId === userId ? { ...m, role: 'owner' as ProjectRole } : m)),
                ...(current ? [] : [{ userId, role: 'owner' as ProjectRole, addedAt: Date.now(), addedBy: g.a.id }]),
              ],
            }));
            pAct(id, g.a.id, `transferred ownership to ${who}`);
            audit('projects.member.role', p.name, `${who} → owner (ownership transfer)`, 'success', 'warning', g.a.id);
            deliver([userId], g.a.id, 'access', { projectId: id }, `${firstOf(g.a.id)} made you the owner`, p.name, { title: `You now own ${p.name}` });
            return ok();
          }
          if (userId === p.ownerId) return fail('Transfer ownership before changing the owner’s role.');
          if (current === role) return ok();
          patchProject(id, (x) => ({
            ...x,
            members: current ? x.members.map((m) => (m.userId === userId ? { ...m, role } : m)) : [...x.members, { userId, role, addedAt: Date.now(), addedBy: g.a.id }],
          }));
          const label = (r: ProjectRole) => r[0].toUpperCase() + r.slice(1);
          pAct(id, g.a.id, current ? `changed ${who} from ${label(current)} to ${label(role)}` : `added ${who} as ${label(role)}`);
          audit('projects.member.role', p.name, `${who}: ${current ?? 'none'} → ${role}`, 'success', 'warning', g.a.id);
          deliver([userId], g.a.id, 'access', { projectId: id }, current ? `${firstOf(g.a.id)} made you ${role === 'editor' ? 'an' : 'a'} ${role}` : `${firstOf(g.a.id)} added you to ${p.name}`, p.name, {
            title: current ? `You're now ${role === 'editor' ? 'an' : 'a'} ${role} on ${p.name}` : `${firstOf(g.a.id)} added you to ${p.name}`,
          });
          return ok();
        },

        addMembers(id, userIds, role, as) {
          const g = guardProject(id, as, canAdminProject, 'Only owners and Projects admins can add members.', 'projects.member.add');
          if (!g.ok) return g;
          if (role === 'owner') return fail('Add people first, then transfer ownership.');
          let added = 0;
          for (const uidv of [...new Set(userIds)]) {
            if (memberRole(get().projects.find((p) => p.id === id)!, uidv)) continue;
            const r = get().setMemberRole(id, uidv, role, g.a);
            if (r.ok) added += 1;
          }
          return ok({ added });
        },

        archiveProject(id, archived, as) {
          const g = guardProject(id, as, canAdminProject, 'Only owners and Projects admins can archive projects.', 'projects.project.archive');
          if (!g.ok) return g;
          patchProject(id, (p) => ({ ...p, archived }));
          pAct(id, g.a.id, archived ? 'archived this project' : 'restored this project');
          audit('projects.project.archive', g.p.name, archived ? 'Archived' : 'Restored', 'success', 'info', g.a.id);
          return ok();
        },

        deleteProject(id, as) {
          const g = guardProject(id, as, canAdminProject, 'Only owners and Projects admins can delete projects.', 'projects.project.delete');
          if (!g.ok) return g;
          const s = get();
          const snapshot: DeletedProject = {
            project: g.p,
            tasks: s.tasks.filter((t) => t.projectId === id),
            rules: s.rules.filter((r) => r.projectId === id),
            updates: s.updates.filter((u) => u.projectId === id),
            portfolios: s.portfolios.filter((pf) => pf.projectIds.includes(id)).map((pf) => ({ id: pf.id, index: pf.projectIds.indexOf(id) })),
          };
          const taskIds = new Set(snapshot.tasks.map((t) => t.id));
          set((st) => ({
            projects: st.projects.filter((p) => p.id !== id),
            tasks: st.tasks.filter((t) => t.projectId !== id).map((t) => (t.blockedBy.some((b) => taskIds.has(b)) ? { ...t, blockedBy: t.blockedBy.filter((b) => !taskIds.has(b)) } : t)),
            rules: st.rules.filter((r) => r.projectId !== id),
            updates: st.updates.filter((u) => u.projectId !== id),
            portfolios: st.portfolios.map((pf) => ({ ...pf, projectIds: pf.projectIds.filter((x) => x !== id) })),
          }));
          audit('projects.project.delete', g.p.name, `${g.p.key} · ${snapshot.tasks.length} tasks`, 'success', 'critical', g.a.id);
          return ok({ snapshot });
        },

        restoreProject(snap) {
          if (get().projects.some((p) => p.id === snap.project.id)) return;
          set((s) => ({
            projects: [...s.projects, snap.project],
            tasks: [...s.tasks, ...snap.tasks],
            rules: [...s.rules, ...snap.rules],
            updates: [...s.updates, ...snap.updates],
            portfolios: s.portfolios.map((pf) => {
              const ref = snap.portfolios.find((x) => x.id === pf.id);
              if (!ref || pf.projectIds.includes(snap.project.id)) return pf;
              const ids = [...pf.projectIds];
              ids.splice(ref.index, 0, snap.project.id);
              return { ...pf, projectIds: ids };
            }),
          }));
          audit('projects.project.restore', snap.project.name, 'Undo delete', 'success', 'warning');
        },

        duplicateProject(id, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          const src = project(id);
          if (!src || !canViewProject(src, a)) return fail('Project not found.');
          if (!canCreateProject(a)) return fail('Contractors can’t create projects.');
          const taken = new Set(get().projects.map((p) => p.key));
          const key = suggestKey(`${src.key}T`, taken);
          const nid = `prj-${key.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
          const now = Date.now();
          const secMap = new Map(src.sections.map((s, i) => [s.id, `${nid}-s${i + 1}`]));
          const srcTasks = get()
            .tasks.filter((t) => t.projectId === id)
            .sort((x, y) => x.number - y.number);
          const idMap = new Map(srcTasks.map((t) => [t.id, uid('t')]));
          const p: Project = {
            ...src,
            id: nid,
            key,
            name: `${src.name} (template)`,
            ownerId: a.id,
            status: 'on-track',
            members: [{ userId: a.id, role: 'owner', addedAt: now, addedBy: a.id }],
            sections: src.sections.map((s) => ({ ...s, id: secMap.get(s.id)! })),
            keyResultIds: [],
            attachments: [],
            activity: [act(a.id, `duplicated ${src.name}`)],
            archived: false,
            nextNumber: srcTasks.length + 1,
            createdAt: now,
            updatedAt: now,
          };
          const copies: Task[] = srcTasks.map((t, i) => ({
            ...t,
            id: idMap.get(t.id)!,
            projectId: nid,
            sectionId: t.sectionId ? (secMap.get(t.sectionId) ?? null) : null,
            number: i + 1,
            assigneeId: null,
            creatorId: a.id,
            followers: [a.id],
            completedAt: undefined,
            completedBy: undefined,
            comments: [],
            attachments: [],
            approval: t.approval ? { approverId: a.id, state: 'pending' } : undefined,
            subtasks: t.subtasks.map((st) => ({ ...st, id: uid('st'), done: false })),
            blockedBy: t.blockedBy.map((b) => idMap.get(b)).filter((x): x is string => !!x),
            activity: [act(a.id, 'created this task')],
            createdAt: now,
            updatedAt: now,
          }));
          // land copies in the first non-done section if their source was done
          const firstOpen = p.sections.find((s) => s.stage !== 'done') ?? p.sections[0];
          for (const c of copies) if (p.sections.find((s) => s.id === c.sectionId)?.stage === 'done') c.sectionId = firstOpen.id;
          set((s) => ({ projects: [...s.projects, p], tasks: [...s.tasks, ...copies] }));
          audit('projects.project.create', p.name, `Duplicated from ${src.key}`, 'success', 'info', a.id);
          return ok({ projectId: nid });
        },

        addSection(projectId, name, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          const n = name.trim();
          if (!n) return fail('Name the section.');
          const id = uid(`${projectId}-s`);
          const doneIdx = g.p.sections.findIndex((s) => s.stage === 'done');
          patchProject(projectId, (p) => {
            const secs = [...p.sections];
            const sec: Section = { id, name: n.slice(0, 40), stage: 'todo' };
            if (doneIdx >= 0) secs.splice(doneIdx, 0, sec);
            else secs.push(sec);
            return { ...p, sections: secs };
          });
          return ok({ sectionId: id });
        },

        updateSection(projectId, sectionId, patch, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          if (!g.p.sections.some((s) => s.id === sectionId)) return fail('Section not found.');
          if (patch.name !== undefined && !patch.name.trim()) return fail('Sections need a name.');
          if (patch.wip !== undefined && patch.wip !== 0 && (!Number.isInteger(patch.wip) || patch.wip < 1 || patch.wip > 99)) return fail('WIP limits are 1–99.');
          patchProject(projectId, (p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === sectionId
                ? {
                    ...s,
                    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 40) } : {}),
                    ...(patch.wip !== undefined ? { wip: patch.wip || undefined } : {}),
                    ...(patch.stage !== undefined ? { stage: patch.stage as SectionStage } : {}),
                  }
                : s,
            ),
          }));
          return ok();
        },

        moveSection(projectId, sectionId, toIndex, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          patchProject(projectId, (p) => {
            const secs = [...p.sections];
            const from = secs.findIndex((s) => s.id === sectionId);
            if (from < 0) return p;
            const [sec] = secs.splice(from, 1);
            secs.splice(Math.max(0, Math.min(toIndex, secs.length)), 0, sec);
            return { ...p, sections: secs };
          });
          return ok();
        },

        deleteSection(projectId, sectionId, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          if (g.p.sections.length <= 1) return fail('A project needs at least one section.');
          const target = g.p.sections.find((s) => s.id !== sectionId && s.stage !== 'done') ?? g.p.sections.find((s) => s.id !== sectionId)!;
          const moving = sectionTasks(projectId, sectionId);
          const base = sectionTasks(projectId, target.id).length;
          set((s) => ({
            tasks: s.tasks.map((t) => (t.projectId === projectId && t.sectionId === sectionId ? { ...t, sectionId: target.id, order: base + moving.findIndex((m) => m.id === t.id) } : t)),
            rules: s.rules.map((r) => (r.projectId === projectId && r.trigger.sectionId === sectionId ? { ...r, enabled: false } : r)),
          }));
          patchProject(projectId, (p) => ({ ...p, sections: p.sections.filter((s) => s.id !== sectionId) }));
          return ok();
        },

        postStatusUpdate(projectId, input, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          if (!STATUSES.includes(input.status)) return fail('Pick a status.');
          const title = input.title.trim();
          const body = input.body.trim();
          if (!title && !body) return fail('Write a short update first.');
          const u: StatusUpdate = {
            id: uid('su'),
            projectId,
            authorId: g.a.id,
            status: input.status,
            title: title || body.split('\n')[0].replace(/\*\*/g, '').slice(0, 90),
            body,
            at: Date.now(),
            byNova: input.byNova,
          };
          set((s) => ({ updates: [u, ...s.updates] }));
          patchProject(projectId, (p) => ({ ...p, status: input.status }));
          pAct(projectId, g.a.id, `posted a status update (${input.status.replace('-', ' ')})`);
          const members = g.p.members.map((m) => m.userId);
          const label = { 'on-track': 'is on track', 'at-risk': 'is at risk', 'off-track': 'is off track', 'on-hold': 'is on hold', complete: 'is complete' }[input.status];
          deliver(members, g.a.id, 'status', { projectId }, `${g.p.name} ${label}`, u.title, input.status === 'at-risk' || input.status === 'off-track' ? { title: `${g.p.name} ${label}`, body: u.title } : undefined);
          return ok({ updateId: u.id });
        },

        linkKeyResults(projectId, keyResultIds, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          const ids = [...new Set(keyResultIds.filter((x) => typeof x === 'string' && x))].slice(0, 12);
          patchProject(projectId, (p) => ({ ...p, keyResultIds: ids }));
          pAct(projectId, g.a.id, ids.length ? `linked ${ids.length} key ${ids.length === 1 ? 'result' : 'results'}` : 'unlinked all key results');
          return ok();
        },

        addProjectAttachment(projectId, att, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          if (!att.name.trim()) return fail('Attachments need a name.');
          if (att.kind === 'link' && !/^https?:\/\//i.test(att.url ?? '')) return fail('Links must start with http:// or https://');
          if (g.p.attachments.some((x) => (att.fileId && x.fileId === att.fileId) || (att.url && x.url === att.url))) return fail('Already attached.');
          patchProject(projectId, (p) => ({ ...p, attachments: [...p.attachments, { ...att, name: att.name.trim(), id: uid('att'), addedBy: g.a.id, at: Date.now() }] }));
          return ok();
        },

        removeProjectAttachment(projectId, attId, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          patchProject(projectId, (p) => ({ ...p, attachments: p.attachments.filter((x) => x.id !== attId) }));
          return ok();
        },

        /* ═════════════════════ per-user ═════════════════════ */
        toggleStar(projectId) {
          patchUser((u) => ({ ...u, starred: u.starred.includes(projectId) ? u.starred.filter((x) => x !== projectId) : [...u.starred, projectId] }));
        },
        setLastView(projectId, view) {
          patchUser((u) => (u.lastView[projectId] === view ? u : { ...u, lastView: { ...u.lastView, [projectId]: view } }));
        },
        setSideCollapsed(v) {
          patchUser((u) => ({ ...u, sideCollapsed: v }));
        },
        setBrowseMode(m) {
          patchUser((u) => ({ ...u, browseMode: m }));
        },
        savePlan(slots, accepted) {
          patchUser((u) => ({ ...u, plan: { date: todayIso(), slots, accepted } }));
        },
        clearPlan() {
          patchUser((u) => ({ ...u, plan: undefined }));
        },

        /* ═════════════════════ tasks ═════════════════════ */
        createTask(input, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          const title = input.title.replace(/\s+/g, ' ').trim();
          if (!title) return fail('Give the task a title.');
          if (title.length > 200) return fail('Keep titles under 200 characters.');
          const p = input.projectId ? project(input.projectId) : undefined;
          if (input.projectId) {
            if (!p || !canViewProject(p, a)) return fail('Project not found.');
            if (!canEditProject(p, a)) return fail(p.archived ? 'This project is archived.' : 'You can’t add tasks to this project.');
          }
          const users = hubUsers();
          const assigneeId = input.assigneeId === undefined ? (p ? null : a.id) : input.assigneeId;
          if (assigneeId && !users.some((u) => u.id === assigneeId && u.active)) return fail('Pick an active teammate to assign.');
          if (!p && assigneeId && assigneeId !== a.id) return fail('Personal tasks can only be assigned to yourself — pick a project to assign others.');
          if (input.dueDate && !isIsoDate(input.dueDate)) return fail('Invalid due date.');
          if (input.startDate && !isIsoDate(input.startDate)) return fail('Invalid start date.');
          if (input.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) return fail('Invalid time.');
          const kind = input.kind ?? 'task';
          let sectionId: string | null = null;
          if (p) {
            sectionId = input.sectionId && p.sections.some((s) => s.id === input.sectionId) ? input.sectionId : (p.sections.find((s) => s.stage !== 'done') ?? p.sections[0]).id;
          }
          const approverId = kind === 'approval' ? (input.approverId ?? assigneeId ?? undefined) : undefined;
          if (kind === 'approval' && !approverId) return fail('Approvals need an approver.');
          const now = Date.now();
          const number = p ? p.nextNumber : get().personalSeq + 1;
          const id = uid('t');
          const startDate = input.startDate && input.dueDate && input.startDate > input.dueDate ? input.dueDate : input.startDate;
          const t: Task = {
            id,
            projectId: p?.id ?? null,
            sectionId,
            number,
            title,
            description: (input.description ?? '').slice(0, 8000),
            kind,
            priority: input.priority && PRIORITIES.includes(input.priority) ? input.priority : 'none',
            assigneeId: assigneeId ?? null,
            creatorId: a.id,
            followers: [...new Set([a.id, ...(assigneeId ? [assigneeId] : []), ...(approverId ? [approverId] : [])])],
            startDate,
            dueDate: input.dueDate,
            dueTime: input.dueDate ? input.dueTime : undefined,
            estimate: input.estimate && input.estimate > 0 ? Math.min(400, input.estimate) : undefined,
            tags: cleanTags(input.tags ?? []),
            subtasks: [],
            blockedBy: (input.blockedBy ?? []).filter((b) => get().tasks.some((x) => x.id === b)),
            attachments: [],
            comments: [],
            activity: [act(a.id, input.source ? `created this task from ${input.source.label}` : 'created this task')],
            approval: approverId ? { approverId, state: 'pending' } : undefined,
            order: 0,
            createdAt: now,
            updatedAt: now,
            source: input.source,
          };
          set((s) => ({ tasks: [...s.tasks, t], personalSeq: p ? s.personalSeq : s.personalSeq + 1 }));
          if (p) {
            patchProject(p.id, (x) => ({ ...x, nextNumber: x.nextNumber + 1 }));
            placeInSection(id, p.id, sectionId!, input.index);
          }
          if (approverId && approverId !== a.id)
            deliver([approverId], a.id, 'approval', { taskId: id }, `${firstOf(a.id)} requested your approval`, title, { title: `Approval requested · ${taskKey(p, t)}`, body: title });
          else if (assigneeId && assigneeId !== a.id) notifyAssignee(task(id)!, assigneeId, a);
          runAutomations(id, { kind: 'created' }, a);
          if (assigneeId) runAutomations(id, { kind: 'assigned', assigneeId }, a);
          return ok({ taskId: id });
        },

        updateTask(id, patch, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          const { a, t } = g;
          const next: Partial<Task> = {};
          const log: string[] = [];
          if (patch.title !== undefined) {
            const v = patch.title.replace(/\s+/g, ' ').trim();
            if (!v) return fail('Titles can’t be empty.');
            if (v !== t.title) {
              next.title = v.slice(0, 200);
              log.push('renamed this task');
            }
          }
          if (patch.description !== undefined && patch.description !== t.description) {
            next.description = patch.description.slice(0, 8000);
            log.push('updated the description');
          }
          if (patch.priority !== undefined && patch.priority !== t.priority) {
            if (!PRIORITIES.includes(patch.priority)) return fail('Unknown priority.');
            next.priority = patch.priority;
            log.push(`set priority to ${PRIORITY_NAME[patch.priority]}`);
          }
          if (patch.estimate !== undefined && patch.estimate !== t.estimate) {
            if (patch.estimate !== undefined && (Number.isNaN(patch.estimate) || patch.estimate < 0)) return fail('Estimates are hours (0 or more).');
            next.estimate = patch.estimate ? Math.min(400, Math.round(patch.estimate * 4) / 4) : undefined;
            log.push(next.estimate ? `estimated ${next.estimate}h` : 'cleared the estimate');
          }
          if (patch.tags !== undefined) next.tags = cleanTags(patch.tags);
          if ('dueDate' in patch || 'startDate' in patch || 'dueTime' in patch) {
            const due = 'dueDate' in patch ? patch.dueDate : t.dueDate;
            let start = 'startDate' in patch ? patch.startDate : t.startDate;
            if (due && !isIsoDate(due)) return fail('Invalid due date.');
            if (start && !isIsoDate(start)) return fail('Invalid start date.');
            if (start && due && start > due) start = 'startDate' in patch && !('dueDate' in patch) ? due : start > due ? due : start;
            const time = 'dueTime' in patch ? patch.dueTime : t.dueTime;
            if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail('Invalid time.');
            next.dueDate = due;
            next.startDate = start;
            next.dueTime = due ? time : undefined;
            if (due !== t.dueDate) log.push(due ? `changed the due date to ${formatDue(due)}` : 'removed the due date');
            else if (start !== t.startDate) log.push(start ? `set the start date to ${formatDue(start)}` : 'removed the start date');
          }
          let newAssignee: string | null | undefined;
          if (patch.assigneeId !== undefined && patch.assigneeId !== t.assigneeId) {
            if (patch.assigneeId && !hubUsers().some((u) => u.id === patch.assigneeId && u.active)) return fail('Pick an active teammate.');
            if (!t.projectId && patch.assigneeId && patch.assigneeId !== a.id) return fail('Personal tasks stay with you — move it to a project to assign others.');
            next.assigneeId = patch.assigneeId;
            newAssignee = patch.assigneeId;
            log.push(patch.assigneeId ? `assigned this to ${userName(patch.assigneeId)}` : 'unassigned this task');
          }
          if (patch.kind !== undefined && patch.kind !== t.kind) {
            next.kind = patch.kind;
            if (patch.kind === 'approval') next.approval = { approverId: t.assigneeId ?? a.id, state: 'pending' };
            if (patch.kind !== 'approval') next.approval = undefined;
            log.push(patch.kind === 'milestone' ? 'converted this to a milestone' : patch.kind === 'approval' ? 'converted this to an approval' : 'converted this to a task');
          }
          if (!Object.keys(next).length) return ok();
          patchTask(id, (x) => ({
            ...x,
            ...next,
            followers: newAssignee ? [...new Set([...x.followers, newAssignee])] : x.followers,
            activity: [...x.activity, ...log.map((l) => act(a.id, l))].slice(-120),
          }));
          if (newAssignee) {
            notifyAssignee(task(id)!, newAssignee, a);
            runAutomations(id, { kind: 'assigned', assigneeId: newAssignee }, a);
          }
          return ok();
        },

        completeTask(id, done, as) {
          const g = guardTask(id, as, canCompleteTask, 'You can’t complete this task.');
          if (!g.ok) return g;
          const { a, t } = g;
          if (t.kind === 'approval' && t.approval?.state === 'pending') {
            if (!canDecideApproval(t, g.p, a)) return fail(`Only ${userName(t.approval.approverId)} can approve this.`);
            return done ? get().decideApproval(id, 'approved', undefined, a).ok ? ok({ milestone: false }) : fail('Could not approve.') : ok({ milestone: false });
          }
          if (!!t.completedAt === done) return ok({ milestone: t.kind === 'milestone' });
          setCompletion(t, done, a);
          return ok({ milestone: t.kind === 'milestone' && done });
        },

        moveTask(id, to, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t move this task.');
          if (!g.ok) return g;
          const { a, t, p } = g;
          if (!p) return fail('Personal tasks don’t have sections.');
          const sec = p.sections.find((s) => s.id === to.sectionId);
          if (!sec) return fail('Section not found.');
          const fromSection = t.sectionId;
          placeInSection(id, p.id, sec.id, to.index);
          if (fromSection !== sec.id) {
            patchTask(id, (x) => ({ ...x, activity: [...x.activity, act(a.id, `moved this to ${sec.name}`)] }));
            const cur = task(id)!;
            if (sec.stage === 'done' && !cur.completedAt) setCompletion(cur, true, a);
            else if (sec.stage !== 'done' && cur.completedAt && p.sections.find((s) => s.id === fromSection)?.stage === 'done') {
              patchTask(id, (x) => ({ ...x, completedAt: undefined, completedBy: undefined, activity: [...x.activity, act(a.id, 'reopened this task')] }));
            }
            runAutomations(id, { kind: 'moved', sectionId: sec.id }, a);
          }
          return ok();
        },

        deleteTasks(ids, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          const removed: Task[] = [];
          let skipped = 0;
          for (const id of ids) {
            const t = task(id);
            if (!t) continue;
            const p = project(t.projectId);
            if (!canSeeTask(t, p, a) || !canDeleteTask(t, p, a)) {
              skipped += 1;
              continue;
            }
            removed.push(t);
          }
          if (!removed.length) return skipped ? fail('You can’t delete these tasks.') : fail('Nothing to delete.');
          const gone = new Set(removed.map((t) => t.id));
          const refs: Record<string, string[]> = {};
          for (const t of get().tasks)
            for (const b of t.blockedBy)
              if (gone.has(b)) {
                refs[b] = [...(refs[b] ?? []), t.id];
              }
          set((s) => ({
            tasks: s.tasks.filter((t) => !gone.has(t.id)).map((t) => (t.blockedBy.some((b) => gone.has(b)) ? { ...t, blockedBy: t.blockedBy.filter((b) => !gone.has(b)) } : t)),
          }));
          return ok({ snapshot: { tasks: removed, refs }, skipped });
        },

        restoreTasks(snap) {
          const existing = new Set(get().tasks.map((t) => t.id));
          const back = snap.tasks.filter((t) => !existing.has(t.id) && (!t.projectId || get().projects.some((p) => p.id === t.projectId)));
          set((s) => ({
            tasks: [
              ...s.tasks.map((t) => {
                const add = Object.entries(snap.refs)
                  .filter(([, dependents]) => dependents.includes(t.id))
                  .map(([blocker]) => blocker);
                return add.length ? { ...t, blockedBy: [...new Set([...t.blockedBy, ...add])] } : t;
              }),
              ...back,
            ],
          }));
        },

        duplicateTask(id, as) {
          const g = guardTask(id, as, (t, p, a) => (t.projectId ? !!p && canEditProject(p, a) : t.creatorId === a.id), 'You can’t duplicate this task.');
          if (!g.ok) return g;
          const { t } = g;
          const r = get().createTask(
            {
              title: `${t.title} (copy)`,
              projectId: t.projectId,
              sectionId: t.sectionId,
              assigneeId: t.assigneeId,
              dueDate: t.dueDate,
              dueTime: t.dueTime,
              startDate: t.startDate,
              priority: t.priority,
              tags: t.tags,
              estimate: t.estimate,
              description: t.description,
              kind: t.kind,
              approverId: t.approval?.approverId,
            },
            g.a,
          );
          if (!r.ok) return r;
          patchTask(r.taskId, (x) => ({ ...x, subtasks: t.subtasks.map((s) => ({ ...s, id: uid('st'), done: false })) }));
          const list = t.projectId && t.sectionId ? sectionTasks(t.projectId, t.sectionId) : [];
          const idx = list.findIndex((x) => x.id === t.id);
          if (t.projectId && t.sectionId && idx >= 0) placeInSection(r.taskId, t.projectId, t.sectionId, idx + 1);
          return ok({ taskId: r.taskId });
        },

        convertKind(id, kind, as) {
          return get().updateTask(id, { kind }, as);
        },

        addSubtask(id, title, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          const v = title.trim();
          if (!v) return fail('Subtasks need a title.');
          if (g.t.subtasks.length >= 50) return fail('That’s a lot of subtasks — split the task instead.');
          patchTask(id, (x) => ({ ...x, subtasks: [...x.subtasks, { id: uid('st'), title: v.slice(0, 160), done: false }] }));
          return ok();
        },

        updateSubtask(id, subId, patch, as) {
          const g = guardTask(id, as, patch.title !== undefined ? canEditTask : canCompleteTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          if (patch.title !== undefined && !patch.title.trim()) return get().removeSubtask(id, subId, as);
          patchTask(id, (x) => ({
            ...x,
            subtasks: x.subtasks.map((s) => (s.id === subId ? { ...s, ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 160) } : {}), ...(patch.done !== undefined ? { done: patch.done } : {}) } : s)),
          }));
          return ok();
        },

        removeSubtask(id, subId, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          patchTask(id, (x) => ({ ...x, subtasks: x.subtasks.filter((s) => s.id !== subId) }));
          return ok();
        },

        moveSubtask(id, subId, toIndex, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          patchTask(id, (x) => {
            const list = [...x.subtasks];
            const from = list.findIndex((s) => s.id === subId);
            if (from < 0) return x;
            const [it] = list.splice(from, 1);
            list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, it);
            return { ...x, subtasks: list };
          });
          return ok();
        },

        addDependency(id, blockerId, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          const b = task(blockerId);
          if (!b || !canSeeTask(b, project(b.projectId), g.a)) return fail('That task doesn’t exist.');
          if (g.t.blockedBy.includes(blockerId)) return ok();
          if (wouldCreateCycle(get().tasks, id, blockerId)) return fail(`That would create a loop — ${taskKey(project(b.projectId), b)} already waits on this task.`);
          patchTask(id, (x) => ({ ...x, blockedBy: [...x.blockedBy, blockerId], activity: [...x.activity, act(g.a.id, `marked this blocked by ${taskKey(project(b.projectId), b)}`)] }));
          return ok();
        },

        removeDependency(id, blockerId, as) {
          const g = guardTask(id, as, canEditTask, 'You can’t edit this task.');
          if (!g.ok) return g;
          patchTask(id, (x) => ({ ...x, blockedBy: x.blockedBy.filter((b) => b !== blockerId) }));
          return ok();
        },

        addAttachment(id, att, as) {
          const g = guardTask(id, as, canCommentTask, 'You can’t add files to this task.');
          if (!g.ok) return g;
          if (!att.name.trim()) return fail('Attachments need a name.');
          if (att.kind === 'link' && !/^https?:\/\//i.test(att.url ?? '')) return fail('Links must start with http:// or https://');
          if (g.t.attachments.some((x) => (att.fileId && x.fileId === att.fileId) || (att.url && x.url === att.url))) return fail('Already attached.');
          patchTask(id, (x) => ({
            ...x,
            attachments: [...x.attachments, { ...att, name: att.name.trim(), id: uid('att'), addedBy: g.a.id, at: Date.now() }],
            activity: [...x.activity, act(g.a.id, `attached ${att.name.trim()}`)],
          }));
          return ok();
        },

        removeAttachment(id, attId, as) {
          const g = guardTask(id, as, (t, p, a) => canEditTask(t, p, a) || t.attachments.some((x) => x.id === attId && x.addedBy === a.id), 'You can’t remove this file.');
          if (!g.ok) return g;
          patchTask(id, (x) => ({ ...x, attachments: x.attachments.filter((f) => f.id !== attId) }));
          return ok();
        },

        addComment(id, body, as) {
          const g = guardTask(id, as, canCommentTask, 'You have view-only access — ask the owner for comment access.');
          if (!g.ok) return g;
          const { a, t, p } = g;
          const text = body.trim();
          if (!text) return fail('Write something first.');
          if (text.length > 4000) return fail('Keep comments under 4,000 characters.');
          const mentioned = parseMentions(text).filter((m) => m !== a.id);
          const c = { id: uid('c'), authorId: a.id, body: text, at: Date.now(), mentions: mentioned, reactions: {} };
          patchTask(id, (x) => ({ ...x, comments: [...x.comments, c], followers: [...new Set([...x.followers, a.id, ...mentioned])] }));
          const key = taskKey(p, t);
          const quote = text.length > 120 ? `${text.slice(0, 117)}…` : text;
          deliver(mentioned, a.id, 'mention', { taskId: id }, `${firstOf(a.id)} mentioned you`, quote, { title: `${firstOf(a.id)} mentioned you · ${key}`, body: `“${quote}”` });
          const others = t.followers.filter((f) => !mentioned.includes(f));
          deliver(others, a.id, 'comment', { taskId: id }, `${firstOf(a.id)} commented`, quote);
          return ok({ commentId: c.id, mentioned });
        },

        deleteComment(id, commentId, as) {
          const g = guardTask(id, as, (t, p, a) => t.comments.some((c) => c.id === commentId && c.authorId === a.id) || (!!p && canAdminProject(p, a)), 'You can only delete your own comments.');
          if (!g.ok) return g;
          patchTask(id, (x) => ({ ...x, comments: x.comments.filter((c) => c.id !== commentId) }));
          return ok();
        },

        toggleReaction(id, commentId, emoji, as) {
          const g = guardTask(id, as, canSeeTask, 'Not allowed.');
          if (!g.ok) return g;
          if (!emoji || emoji.length > 8) return fail('Pick an emoji.');
          const me = g.a.id;
          patchTask(id, (x) => ({
            ...x,
            comments: x.comments.map((c) => {
              if (c.id !== commentId) return c;
              const cur = c.reactions[emoji] ?? [];
              const next = cur.includes(me) ? cur.filter((u) => u !== me) : [...cur, me];
              const reactions = { ...c.reactions, [emoji]: next };
              if (!next.length) delete reactions[emoji];
              return { ...c, reactions };
            }),
          }));
          return ok();
        },

        toggleFollow(id, as) {
          const g = guardTask(id, as, canSeeTask, 'Not allowed.');
          if (!g.ok) return g;
          const following = !g.t.followers.includes(g.a.id);
          patchTask(id, (x) => ({ ...x, followers: following ? [...x.followers, g.a.id] : x.followers.filter((f) => f !== g.a.id) }));
          return ok({ following });
        },

        decideApproval(id, decision, note, as) {
          const g = guardTask(id, as, canDecideApproval, 'Only the approver can decide on this.');
          if (!g.ok) return g;
          const { a, t, p } = g;
          const now = Date.now();
          const verb = decision === 'approved' ? 'approved' : decision === 'changes' ? 'requested changes' : 'rejected';
          patchTask(id, (x) => ({
            ...x,
            approval: { ...(x.approval ?? { approverId: a.id }), state: decision, decidedAt: now, note: note?.trim() || undefined },
            completedAt: decision === 'changes' ? undefined : now,
            completedBy: decision === 'changes' ? undefined : a.id,
            activity: [...x.activity, act(a.id, note?.trim() ? `${verb}: “${note.trim().slice(0, 120)}”` : verb)],
          }));
          const key = taskKey(p, t);
          deliver([t.creatorId, ...(t.assigneeId ? [t.assigneeId] : [])], a.id, 'decision', { taskId: id }, `${firstOf(a.id)} ${verb}`, t.title, { title: `${firstOf(a.id)} ${verb} ${key}`, body: note?.trim() || t.title });
          audit('projects.approval.decide', `${key} ${t.title}`, verb, 'success', 'info', a.id);
          if (decision !== 'changes') runAutomations(id, { kind: 'completed' }, a);
          return ok();
        },

        bulkUpdate(ids, patch, as) {
          let changed = 0;
          let skipped = 0;
          for (const id of ids) {
            const r = get().updateTask(id, patch, as);
            if (r.ok) changed += 1;
            else skipped += 1;
          }
          return changed || !skipped ? ok({ changed, skipped }) : fail('You can’t edit these tasks.');
        },

        bulkComplete(ids, done, as) {
          let changed = 0;
          let skipped = 0;
          for (const id of ids) {
            const r = get().completeTask(id, done, as);
            if (r.ok) changed += 1;
            else skipped += 1;
          }
          return changed || !skipped ? ok({ changed, skipped }) : fail('You can’t complete these tasks.');
        },

        bulkMove(ids, sectionId, as) {
          let changed = 0;
          let skipped = 0;
          for (const id of ids) {
            const r = get().moveTask(id, { sectionId }, as);
            if (r.ok) changed += 1;
            else skipped += 1;
          }
          return changed || !skipped ? ok({ changed, skipped }) : fail('You can’t move these tasks.');
        },

        /* ═════════════════════ automations ═════════════════════ */
        createRule(projectId, rule, as) {
          const g = guardProject(projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          const name = rule.name.trim() || 'Untitled rule';
          if (!rule.actions.length) return fail('Add at least one action.');
          if (rule.trigger.kind === 'moved' && rule.trigger.sectionId && !g.p.sections.some((s) => s.id === rule.trigger.sectionId)) return fail('Pick a section for the trigger.');
          const r: Rule = { id: uid('r'), projectId, name: name.slice(0, 60), enabled: true, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions, runs: 0, createdBy: g.a.id, createdAt: Date.now(), fired: [] };
          set((s) => ({ rules: [...s.rules, r] }));
          pAct(projectId, g.a.id, `added the automation “${r.name}”`);
          return ok({ ruleId: r.id });
        },

        updateRule(ruleId, patch, as) {
          const r = get().rules.find((x) => x.id === ruleId);
          if (!r) return fail('Rule not found.');
          const g = guardProject(r.projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          if (patch.actions && !patch.actions.length) return fail('Add at least one action.');
          set((s) => ({ rules: s.rules.map((x) => (x.id === ruleId ? { ...x, ...patch, name: (patch.name ?? x.name).trim().slice(0, 60) || x.name } : x)) }));
          return ok();
        },

        deleteRule(ruleId, as) {
          const r = get().rules.find((x) => x.id === ruleId);
          if (!r) return fail('Rule not found.');
          const g = guardProject(r.projectId, as, canEditProject, READ_ONLY);
          if (!g.ok) return g;
          set((s) => ({ rules: s.rules.filter((x) => x.id !== ruleId) }));
          pAct(r.projectId, g.a.id, `removed the automation “${r.name}”`);
          return ok();
        },

        runDueSoonSweep() {
          const a = sessionActor();
          if (!a) return 0;
          const now = Date.now();
          let fired = 0;
          const rules = get().rules.filter((r) => r.enabled && r.trigger.kind === 'due-soon');
          for (const r of rules) {
            const p = project(r.projectId);
            if (!p || !canEditProject(p, a)) continue;
            for (const t of get().tasks.filter((x) => x.projectId === p.id)) {
              if (ruleMatches(get().rules.find((x) => x.id === r.id)!, { kind: 'due-soon' }, t, now)) {
                runAutomations(t.id, { kind: 'due-soon' }, a);
                fired += 1;
              }
            }
          }
          return fired;
        },

        /* ═════════════════════ inbox ═════════════════════ */
        markInboxRead(id, read = true) {
          const me = sessionActor()?.id;
          set((s) => ({ inbox: s.inbox.map((i) => (i.id === id && i.userId === me ? { ...i, read } : i)) }));
        },
        markAllInboxRead(ids) {
          const me = sessionActor()?.id;
          const only = ids ? new Set(ids) : null;
          set((s) => ({ inbox: s.inbox.map((i) => (i.userId === me && (!only || only.has(i.id)) ? { ...i, read: true } : i)) }));
        },
        archiveInbox(id, archived = true) {
          const me = sessionActor()?.id;
          set((s) => ({ inbox: s.inbox.map((i) => (i.id === id && i.userId === me ? { ...i, archived, read: true } : i)) }));
        },

        /* ═════════════════════ portfolios ═════════════════════ */
        createPortfolio(input, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          if (a.contractor) return fail('Contractors can’t create portfolios.');
          const name = input.name.trim();
          if (name.length < 3) return fail('Name the portfolio (3+ characters).');
          const visible = new Set(get().projects.filter((p) => canViewProject(p, a)).map((p) => p.id));
          const pf: Portfolio = { id: uid('pf'), name: name.slice(0, 60), description: (input.description ?? '').trim(), ownerId: a.id, color: input.color, projectIds: input.projectIds.filter((x) => visible.has(x)), createdAt: Date.now() };
          set((s) => ({ portfolios: [...s.portfolios, pf] }));
          return ok({ portfolioId: pf.id });
        },

        updatePortfolio(id, patch, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          const pf = get().portfolios.find((x) => x.id === id);
          if (!pf) return fail('Portfolio not found.');
          if (pf.ownerId !== a.id && !isProjectsAdmin(a)) return fail('Only the portfolio owner can edit it.');
          const visible = new Set(get().projects.filter((p) => canViewProject(p, a)).map((p) => p.id));
          set((s) => ({
            portfolios: s.portfolios.map((x) =>
              x.id === id
                ? {
                    ...x,
                    ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim().slice(0, 60) } : {}),
                    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
                    ...(patch.color !== undefined ? { color: patch.color } : {}),
                    // keep projects the editor can't see; only change visible ones
                    ...(patch.projectIds !== undefined ? { projectIds: [...x.projectIds.filter((p) => !visible.has(p)), ...patch.projectIds.filter((p) => visible.has(p))] } : {}),
                  }
                : x,
            ),
          }));
          return ok();
        },

        deletePortfolio(id, as) {
          const a = actorOr(as);
          if (!a) return fail('You are not signed in.');
          const pf = get().portfolios.find((x) => x.id === id);
          if (!pf) return fail('Portfolio not found.');
          if (pf.ownerId !== a.id) return fail('Only the portfolio owner can delete it.');
          set((s) => ({ portfolios: s.portfolios.filter((x) => x.id !== id) }));
          return ok();
        },

        resetDemo() {
          set({ ...createProjectsSeed() });
        },
      };
    },
    {
      name: 'nexus-projects-v2',
      version: PROJECTS_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ProjectsData => ({
        version: s.version,
        seededAt: s.seededAt,
        projects: s.projects,
        tasks: s.tasks,
        updates: s.updates,
        rules: s.rules,
        inbox: s.inbox,
        portfolios: s.portfolios,
        users: s.users,
        personalSeq: s.personalSeq,
      }),
      migrate: (persisted, version) => (version === PROJECTS_DATA_VERSION ? (persisted as ProjectsData) : createProjectsSeed()),
    },
  ),
);

/** Snapshot accessor for non-React callers (bridge). */
export const projectsState = () => useProjects.getState();
