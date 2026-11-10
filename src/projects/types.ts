/**
 * Helix Projects — domain model.
 *
 * Dates are local calendar days (`yyyy-mm-dd`), timestamps are epoch ms.
 * Everything per-person (stars, last view, day plan…) lives in `users[userId]`
 * so personas can switch in the same browser.
 */
import type { Department } from '@/types';

export type ProjectStatus = 'on-track' | 'at-risk' | 'off-track' | 'on-hold' | 'complete';
export type Privacy = 'public' | 'team' | 'private';
export type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type TaskKind = 'task' | 'milestone' | 'approval';
export type ApprovalState = 'pending' | 'approved' | 'changes' | 'rejected';
export type SectionStage = 'todo' | 'doing' | 'done';
export type ViewId = 'overview' | 'list' | 'board' | 'timeline' | 'calendar' | 'graph' | 'dashboard' | 'files' | 'automations';

export const VIEW_IDS: ViewId[] = ['overview', 'list', 'board', 'timeline', 'calendar', 'graph', 'dashboard', 'files', 'automations'];

export interface Member {
  userId: string;
  role: ProjectRole;
  addedAt: number;
  addedBy: string;
}

export interface Section {
  id: string;
  name: string;
  /** Work-in-progress limit for the board column. */
  wip?: number;
  /** `done` columns complete the task when it lands there. */
  stage?: SectionStage;
}

export interface Attachment {
  id: string;
  kind: 'drive' | 'link';
  /** Helix Drive file id (kind = drive). */
  fileId?: string;
  url?: string;
  name: string;
  /** doc | sheet | slides | pdf | image | video | code | archive | link … */
  fileKind: string;
  addedBy: string;
  at: number;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  at: number;
  mentions: string[];
  /** emoji → user ids */
  reactions: Record<string, string[]>;
}

export interface Activity {
  id: string;
  at: number;
  actorId: string;
  /** Short verb phrase, e.g. "moved this to In review". */
  text: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Approval {
  approverId: string;
  state: ApprovalState;
  decidedAt?: number;
  note?: string;
}

export interface TaskSource {
  app: string;
  label: string;
  to: string;
}

export interface Task {
  id: string;
  /** `null` = personal task (My Work only). */
  projectId: string | null;
  sectionId: string | null;
  number: number;
  title: string;
  description: string;
  kind: TaskKind;
  priority: Priority;
  assigneeId: string | null;
  creatorId: string;
  followers: string[];
  startDate?: string;
  dueDate?: string;
  /** `HH:mm` (24h) */
  dueTime?: string;
  /** Hours */
  estimate?: number;
  tags: string[];
  subtasks: Subtask[];
  /** Ids of tasks that must finish first. */
  blockedBy: string[];
  attachments: Attachment[];
  comments: Comment[];
  activity: Activity[];
  approval?: Approval;
  completedAt?: number;
  completedBy?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  source?: TaskSource;
}

export interface StatusUpdate {
  id: string;
  projectId: string;
  authorId: string;
  status: ProjectStatus;
  title: string;
  body: string;
  at: number;
  byNova?: boolean;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  /** Emoji glyph */
  icon: string;
  color: string;
  department: Department;
  ownerId: string;
  privacy: Privacy;
  status: ProjectStatus;
  priority: Priority;
  members: Member[];
  sections: Section[];
  /** Markdown-lite brief */
  brief: string;
  startDate: string;
  dueDate: string;
  /** Linked Pulse channel */
  channelId?: string;
  /** Performance & OKRs key results this project contributes to. */
  keyResultIds: string[];
  attachments: Attachment[];
  activity: Activity[];
  archived: boolean;
  nextNumber: number;
  createdAt: number;
  updatedAt: number;
}

/* ---------- Automations ---------- */
export type TriggerKind = 'moved' | 'completed' | 'assigned' | 'due-soon' | 'created';
export type ConditionField = 'priority' | 'assignee' | 'tag';
export type ActionKind = 'move' | 'assign' | 'priority' | 'tag' | 'notify' | 'post';

export interface RuleTrigger {
  kind: TriggerKind;
  /** `moved`: target section */
  sectionId?: string;
  /** `due-soon`: within N days */
  days?: number;
}
export interface RuleCondition {
  field: ConditionField;
  value: string;
}
export interface RuleAction {
  kind: ActionKind;
  /** section id | user id | priority | tag | channel id | message */
  value?: string;
}
export interface Rule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  runs: number;
  lastRunAt?: number;
  createdBy: string;
  createdAt: number;
  /** Task ids a `due-soon` rule already handled (fires once per task). */
  fired: string[];
}

/* ---------- Inbox ---------- */
export type InboxKind = 'assigned' | 'mention' | 'comment' | 'status' | 'approval' | 'decision' | 'completed' | 'automation' | 'due' | 'access';
export interface InboxItem {
  id: string;
  userId: string;
  kind: InboxKind;
  actorId: string;
  taskId?: string;
  projectId?: string;
  title: string;
  body?: string;
  at: number;
  read: boolean;
  archived: boolean;
}

/* ---------- Portfolios ---------- */
export interface Portfolio {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  color: string;
  projectIds: string[];
  createdAt: number;
}

/* ---------- Per-person state ---------- */
export interface PlanSlot {
  taskId: string;
  start: number;
  end: number;
}
export interface UserState {
  starred: string[];
  lastView: Record<string, ViewId>;
  sideCollapsed: boolean;
  browseMode: 'gallery' | 'table';
  plan?: { date: string; slots: PlanSlot[]; accepted: boolean };
}

export interface ProjectsData {
  version: number;
  seededAt: number;
  projects: Project[];
  tasks: Task[];
  updates: StatusUpdate[];
  rules: Rule[];
  inbox: InboxItem[];
  portfolios: Portfolio[];
  users: Record<string, UserState>;
  personalSeq: number;
}

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
