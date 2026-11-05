/**
 * Access rules for Helix Projects. Project visibility combines the hub's RBAC
 * (`app:projects`, `projects.manage`, `*`) with project privacy and membership:
 *
 *  - private: members only (admins see it read-only for governance)
 *  - team:    members, plus everyone in the project's department (editors)
 *  - public:  members, department colleagues (editors), other employees (commenters)
 *  - contractors (clearance L1) only ever see projects they were explicitly added to.
 */
import type { Department, Role, User } from '@/types';
import { clearanceOf, effectivePermissions, hasPermission } from '@/lib/rbac';
import { ROLE_META } from './constants';
import type { Project, ProjectRole, Task } from './types';

export interface ProjectsViewer {
  userId: string;
  perms: ReadonlySet<string>;
  department: Department;
  roleIds: string[];
  clearance: number;
}

export function buildProjectsViewer(user: User | null | undefined, roles: Role[]): ProjectsViewer | null {
  if (!user || !user.active) return null;
  return {
    userId: user.id,
    perms: effectivePermissions(user, roles),
    department: user.department,
    roleIds: user.roleIds,
    clearance: clearanceOf(user, roles),
  };
}

export const isSuper = (v: ProjectsViewer) => v.perms.has('*');
export const isContractor = (v: ProjectsViewer) => v.roleIds.includes('contractor') || v.clearance <= 1;
export const canUseProjects = (v: ProjectsViewer | null): boolean => Boolean(v && hasPermission(v.perms, 'app:projects'));
/** Create projects for any team, manage portfolios, goals and templates. */
export const canManageProjects = (v: ProjectsViewer | null): boolean => Boolean(v && hasPermission(v.perms, 'projects.manage'));
/** Every employee can start a project; contractors work inside projects they are invited to. */
export const canCreateProject = (v: ProjectsViewer | null): boolean => Boolean(v && canUseProjects(v) && !isContractor(v));

const maxRole = (a: ProjectRole | null, b: ProjectRole | null): ProjectRole | null => {
  if (!a) return b;
  if (!b) return a;
  return ROLE_META[a].rank >= ROLE_META[b].rank ? a : b;
};

/** Effective role of the viewer on a project, or null when the project is invisible. */
export function projectRoleFor(v: ProjectsViewer | null, project: Project | undefined): ProjectRole | null {
  if (!v || !project || !canUseProjects(v)) return null;
  if (isSuper(v)) return 'owner';
  if (project.ownerId === v.userId) return 'owner';
  const member = project.members.find((m) => m.userId === v.userId);
  let role: ProjectRole | null = member ? member.role : null;
  if (isContractor(v)) return role;
  if (project.privacy === 'private') {
    return role ?? (canManageProjects(v) ? 'viewer' : null);
  }
  if (project.department === v.department) role = maxRole(role, 'editor');
  if (project.privacy === 'public') role = maxRole(role, 'commenter');
  if (canManageProjects(v)) role = maxRole(role, 'viewer');
  return role;
}

const rank = (r: ProjectRole | null) => (r ? ROLE_META[r].rank : -1);

export const canViewProject = (v: ProjectsViewer | null, p: Project | undefined) => projectRoleFor(v, p) !== null;
export const canCommentProject = (v: ProjectsViewer | null, p: Project | undefined) => rank(projectRoleFor(v, p)) >= ROLE_META.commenter.rank;
export const canEditProject = (v: ProjectsViewer | null, p: Project | undefined) => rank(projectRoleFor(v, p)) >= ROLE_META.editor.rank;
/** Settings, members, sections, rules, forms, archive. */
export const canAdminProject = (v: ProjectsViewer | null, p: Project | undefined): boolean => {
  if (!v || !p) return false;
  if (projectRoleFor(v, p) === 'owner') return true;
  return canManageProjects(v) && p.privacy !== 'private';
};

export type GateResult = { ok: true } | { ok: false; reason: string };

/** Approval tasks are decided by the named approver — never by whoever raised the request. */
export function canDecideApproval(v: ProjectsViewer | null, task: Task | undefined): GateResult {
  if (!v || !task || task.type !== 'approval' || !task.approval) return { ok: false, reason: 'Not an approval task.' };
  if (task.approval.decision !== 'pending') return { ok: false, reason: 'This approval has already been decided.' };
  if (isSuper(v)) return { ok: true };
  if (task.approval.approverId !== v.userId) return { ok: false, reason: 'Only the assigned approver can decide this request.' };
  if (task.creatorId === v.userId) return { ok: false, reason: 'Separation of duties: you cannot approve a request you raised yourself.' };
  return { ok: true };
}

/** Project owners/admins can manage anyone; editors may edit tasks; assignees can always update their own tasks. */
export function canEditTask(v: ProjectsViewer | null, project: Project | undefined, task: Task | undefined): boolean {
  if (!v || !project || !task) return false;
  if (canEditProject(v, project)) return true;
  return task.assigneeId === v.userId && canCommentProject(v, project);
}

export function canDeleteTask(v: ProjectsViewer | null, project: Project | undefined, task: Task | undefined): boolean {
  if (!v || !project || !task) return false;
  if (canAdminProject(v, project)) return true;
  return task.creatorId === v.userId && canEditProject(v, project);
}
