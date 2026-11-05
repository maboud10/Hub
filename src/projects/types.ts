/**
 * Helix Projects ("Mission Control") domain model — inspired by Asana, Linear
 * and Monday: projects with sections & multiple views, numbered tasks with
 * subtasks, dependencies, approvals and milestones, My Tasks triage buckets,
 * sprints with burndown, portfolios, goals (OKRs), status updates, intake
 * forms and no-code automation rules.
 */
import type { Department } from '@/types';

export type ProjectView = 'overview' | 'list' | 'board' | 'timeline' | 'calendar' | 'workload' | 'sprints';
export type ProjectPrivacy = 'public' | 'team' | 'private';
export type ProjectHealth = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete';
/** Project-level role (members). Owners administer, editors change work, commenters discuss, viewers read. */
export type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type TaskType = 'task' | 'milestone' | 'approval' | 'bug';
export type ApprovalDecision = 'pending' | 'approved' | 'changes_requested' | 'rejected';
export type Recurrence = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type MyTasksBucket = 'today' | 'upcoming' | 'later';

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  addedAt: number;
  addedBy: string;
}

export interface ProjectSection {
  id: string;
  name: string;
  /** Kanban work-in-progress limit (board view warns when exceeded). */
  wipLimit?: number;
}

export interface CustomFieldOption {
  id: string;
  label: string;
  color: string;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: 'select' | 'number' | 'text';
  options?: CustomFieldOption[];
  /** Numeric fields can be summed in list/board footers. */
  unit?: string;
}

export interface Project {
  id: string;
  /** Short key used for task numbers, e.g. PRISM-42. */
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  department: Department;
  ownerId: string;
  members: ProjectMember[];
  privacy: ProjectPrivacy;
  health: ProjectHealth;
  startDate: string;
  dueDate: string;
  sections: ProjectSection[];
  customFields: CustomFieldDef[];
  defaultView: ProjectView;
  templateId?: string;
  archived: boolean;
  /** Cross-module links: HR onboarding journey, Talent requisition, Knowledge Base playbook. */
  links?: { onboardingJourneyId?: string; requisitionId?: string; wikiSlug?: string };
  nextTaskNumber: number;
  createdAt: number;
  updatedAt: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: string;
  dueDate?: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  at: number;
  mentions: string[];
  /** emoji -> user ids */
  reactions: Record<string, string[]>;
}

export interface TaskAttachment {
  id: string;
  kind: 'drive' | 'wiki' | 'link';
  /** Drive item id (kind = drive). */
  driveFileId?: string;
  /** Knowledge Base slug (kind = wiki). */
  wikiSlug?: string;
  url?: string;
  title: string;
  addedBy: string;
  at: number;
}

export interface TaskActivity {
  id: string;
  at: number;
  actorId: string;
  action: string;
  detail?: string;
}

export interface TaskApproval {
  approverId: string;
  decision: ApprovalDecision;
  decidedAt?: number;
  note?: string;
}

export interface Task {
  id: string;
  projectId: string;
  sectionId: string;
  number: number;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  collaboratorIds: string[];
  creatorId: string;
  startDate?: string;
  dueDate?: string;
  completedAt?: number;
  estimateHours?: number;
  loggedHours: number;
  storyPoints?: number;
  tags: string[];
  customFieldValues: Record<string, string | number>;
  subtasks: Subtask[];
  /** Task ids this task is blocked by. */
  dependsOn: string[];
  attachments: TaskAttachment[];
  comments: TaskComment[];
  likes: string[];
  approval?: TaskApproval;
  sprintId?: string;
  recurring?: Recurrence;
  /** Ordering inside its section (ascending). */
  order: number;
  activity: TaskActivity[];
  createdAt: number;
  updatedAt: number;
}

export interface StatusUpdate {
  id: string;
  projectId: string;
  authorId: string;
  health: ProjectHealth;
  title: string;
  summary: string;
  highlights: string[];
  blockers: string[];
  nextSteps: string[];
  /** Snapshot of progress % when posted. */
  progressPct: number;
  at: number;
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  color: string;
  projectIds: string[];
  createdAt: number;
}

export interface GoalMetric {
  label: string;
  current: number;
  target: number;
  unit: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  level: 'company' | 'team';
  department?: Department;
  parentId?: string;
  projectIds: string[];
  metric?: GoalMetric;
  /** Manual override (0–100). When absent, progress rolls up from metric or linked projects. */
  manualProgress?: number;
  status: ProjectHealth;
  targetDate: string;
  createdAt: number;
  updatedAt: number;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  state: 'planned' | 'active' | 'completed';
  /** Points completed when the sprint closed (velocity history). */
  completedPoints?: number;
  committedPoints?: number;
}

export type RuleTrigger = 'task_completed' | 'task_moved_to_section' | 'due_date_passed' | 'task_assigned' | 'priority_set_urgent' | 'task_created';
export type RuleAction = 'move_to_section' | 'set_status' | 'add_tag' | 'assign_to' | 'notify_owner' | 'set_priority' | 'add_collaborator';

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  trigger: RuleTrigger;
  /** For `task_moved_to_section`. */
  triggerSectionId?: string;
  action: RuleAction;
  /** Section id, status, tag, user id or priority depending on `action`. */
  actionValue?: string;
  enabled: boolean;
  runs: number;
  lastRunAt?: number;
  createdBy: string;
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date';
  options?: string[];
  required: boolean;
  /** Map this field to the created task (title/description/dueDate/tag). */
  mapsTo?: 'title' | 'description' | 'dueDate' | 'tag';
}

export interface IntakeForm {
  id: string;
  projectId: string;
  title: string;
  description: string;
  fields: FormField[];
  targetSectionId: string;
  defaultAssigneeId?: string;
  defaultPriority: TaskPriority;
  enabled: boolean;
  submissions: number;
  createdBy: string;
}

export interface TemplateTask {
  title: string;
  section: string;
  /** Days after the project start date. */
  offsetDays: number;
  priority?: TaskPriority;
  type?: TaskType;
  estimateHours?: number;
  tags?: string[];
  subtasks?: string[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: 'Product' | 'Engineering' | 'People' | 'Operations' | 'Go-to-market' | 'Finance';
  sections: string[];
  tasks: TemplateTask[];
  defaultRules: Pick<AutomationRule, 'name' | 'trigger' | 'action' | 'actionValue'>[];
  recommendedView: ProjectView;
}

export interface ProjectsUserState {
  starredProjectIds: string[];
  recentProjectIds: string[];
  /** Explicit My Tasks triage (tasks without an entry are bucketed by due date). */
  buckets: Record<string, MyTasksBucket>;
  inboxReadAt: number;
}

export interface ProjectsData {
  version: number;
  projects: Project[];
  tasks: Task[];
  statusUpdates: StatusUpdate[];
  portfolios: Portfolio[];
  goals: Goal[];
  sprints: Sprint[];
  rules: AutomationRule[];
  forms: IntakeForm[];
  userState: Record<string, ProjectsUserState>;
}
