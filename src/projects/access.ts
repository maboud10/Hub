/**
 * Helix Projects permission engine — pure functions, no React, no store.
 *
 * Privacy:  public  → everyone in the org (contractors excluded)
 *           team    → the project's department (+ `projects.manage`)
 *           private → members only (nobody else, not even admins)
 * Roles:    owner > editor > commenter > viewer
 * Admins:   `projects.manage` administers every non-private project.
 * Contractors only ever see projects they are members of and cannot create projects.
 */
import type { Department, User } from '@/types';
import { hasPermission } from '@/lib/rbac';
import type { Privacy, Project, ProjectRole, Task } from './types';

export interface Actor {
  id: string;
  name: string;
  department: Department;
  perms: ReadonlySet<string>;
  contractor: boolean;
}

export type Access = ProjectRole | 'admin';

export function actorFrom(user: User, perms: ReadonlySet<string>): Actor {
  return {
    id: user.id,
    name: user.name,
    department: user.department,
    perms,
    contractor: user.roleIds.includes('contractor') && !user.roleIds.includes('employee'),
  };
}

export const isProjectsAdmin = (a: Actor) => !a.contractor && hasPermission(a.perms, 'projects.manage');

export function memberRole(p: Pick<Project, 'members'>, userId: string): ProjectRole | null {
  return p.members.find((m) => m.userId === userId)?.role ?? null;
}

export function canViewProject(p: Project, a: Actor): boolean {
  if (memberRole(p, a.id)) return true;
  if (a.contractor || p.privacy === 'private') return false;
  if (p.privacy === 'public') return true;
  return p.department === a.department || isProjectsAdmin(a);
}

/** Effective access level, or null when the project is invisible. */
export function projectAccess(p: Project, a: Actor): Access | null {
  const role = memberRole(p, a.id);
  if (role === 'owner') return 'owner';
  if (p.privacy !== 'private' && isProjectsAdmin(a)) return 'admin';
  if (role) return role;
  return canViewProject(p, a) ? 'viewer' : null;
}

const RANK: Record<Access, number> = { viewer: 0, commenter: 1, editor: 2, admin: 3, owner: 4 };
const atLeast = (acc: Access | null, min: Access) => acc !== null && RANK[acc] >= RANK[min];

/** Members & roles, privacy, archive, delete. */
export const canAdminProject = (p: Project, a: Actor) => atLeast(projectAccess(p, a), 'admin');
/** Tasks, sections, brief, status updates, automations, files, linked OKRs. */
export const canEditProject = (p: Project, a: Actor) => !p.archived && atLeast(projectAccess(p, a), 'editor');
export const canCommentProject = (p: Project, a: Actor) => atLeast(projectAccess(p, a), 'commenter');
export const canCreateProject = (a: Actor) => !a.contractor;

export function visibleProjects(projects: Project[], a: Actor): Project[] {
  return projects.filter((p) => canViewProject(p, a));
}

/* ---------- Tasks ---------- */
type ProjectLookup = (id: string) => Project | undefined;

export function canSeeTask(t: Task, project: Project | undefined, a: Actor): boolean {
  if (!t.projectId) return t.creatorId === a.id || t.assigneeId === a.id;
  return !!project && canViewProject(project, a);
}

export function canEditTask(t: Task, project: Project | undefined, a: Actor): boolean {
  if (!t.projectId) return t.creatorId === a.id || t.assigneeId === a.id;
  return !!project && canEditProject(project, a);
}

/** Assignees may always tick off their own work, even with comment-only access. */
export function canCompleteTask(t: Task, project: Project | undefined, a: Actor): boolean {
  if (canEditTask(t, project, a)) return true;
  return t.assigneeId === a.id && canSeeTask(t, project, a) && !project?.archived;
}

export function canCommentTask(t: Task, project: Project | undefined, a: Actor): boolean {
  if (!t.projectId) return canSeeTask(t, project, a);
  if (!project) return false;
  return canCommentProject(project, a) || t.assigneeId === a.id;
}

export function canDecideApproval(t: Task, project: Project | undefined, a: Actor): boolean {
  return t.kind === 'approval' && t.approval?.approverId === a.id && canSeeTask(t, project, a);
}

export function canDeleteTask(t: Task, project: Project | undefined, a: Actor): boolean {
  if (!t.projectId) return t.creatorId === a.id;
  return !!project && canEditProject(project, a);
}

export function visibleTasks(tasks: Task[], lookup: ProjectLookup, a: Actor): Task[] {
  return tasks.filter((t) => canSeeTask(t, t.projectId ? lookup(t.projectId) : undefined, a));
}

/* ---------- Copy for disabled states ---------- */
export const ROLE_LABEL: Record<Access, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

export const PRIVACY_LABEL: Record<Privacy, string> = {
  public: 'Everyone at Helix',
  team: 'Department only',
  private: 'Members only',
};

export function readOnlyReason(p: Project, a: Actor, ownerName?: string): string | null {
  if (p.archived) return 'This project is archived.';
  const acc = projectAccess(p, a);
  if (atLeast(acc, 'editor')) return null;
  const who = ownerName ? `Ask ${ownerName.split(' ')[0]}` : 'Ask the owner';
  if (acc === 'commenter') return `You can comment. ${who} for edit access.`;
  return `View only. ${who} for edit access.`;
}

export function createProjectReason(a: Actor): string | null {
  return a.contractor ? 'Contractors can’t create projects — ask your Helix sponsor.' : null;
}
