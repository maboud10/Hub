/**
 * Display metadata, project templates and automation presets for Helix Projects.
 */
import type {
  ProjectHealth,
  ProjectRole,
  ProjectTemplate,
  ProjectView,
  RuleAction,
  RuleTrigger,
  TaskPriority,
  TaskStatus,
  TaskType,
} from './types';

export const PROJECTS_DATA_VERSION = 1;

export const STATUS_META: Record<TaskStatus, { label: string; color: string; order: number }> = {
  todo: { label: 'To do', color: '#94a3b8', order: 0 },
  in_progress: { label: 'In progress', color: '#38bdf8', order: 1 },
  in_review: { label: 'In review', color: '#a78bfa', order: 2 },
  done: { label: 'Done', color: '#34d399', order: 3 },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; rank: number }> = {
  urgent: { label: 'Urgent', color: '#f87171', rank: 0 },
  high: { label: 'High', color: '#fb923c', rank: 1 },
  medium: { label: 'Medium', color: '#fbbf24', rank: 2 },
  low: { label: 'Low', color: '#60a5fa', rank: 3 },
  none: { label: 'No priority', color: '#94a3b8', rank: 4 },
};

export const HEALTH_META: Record<ProjectHealth, { label: string; color: string; emoji: string }> = {
  on_track: { label: 'On track', color: '#34d399', emoji: '🟢' },
  at_risk: { label: 'At risk', color: '#fbbf24', emoji: '🟡' },
  off_track: { label: 'Off track', color: '#f87171', emoji: '🔴' },
  on_hold: { label: 'On hold', color: '#94a3b8', emoji: '⏸️' },
  complete: { label: 'Complete', color: '#a78bfa', emoji: '🏁' },
};

export const TASK_TYPE_META: Record<TaskType, { label: string; color: string }> = {
  task: { label: 'Task', color: '#94a3b8' },
  milestone: { label: 'Milestone', color: '#f59e0b' },
  approval: { label: 'Approval', color: '#a78bfa' },
  bug: { label: 'Bug', color: '#f87171' },
};

export const ROLE_META: Record<ProjectRole, { label: string; description: string; rank: number }> = {
  owner: { label: 'Project admin', description: 'Edit settings, members, rules and forms.', rank: 3 },
  editor: { label: 'Editor', description: 'Create and change tasks, post status updates.', rank: 2 },
  commenter: { label: 'Commenter', description: 'Comment, like and follow tasks.', rank: 1 },
  viewer: { label: 'Viewer', description: 'Read-only.', rank: 0 },
};

export const VIEW_META: Record<ProjectView, { label: string; hint: string }> = {
  overview: { label: 'Overview', hint: 'Health, status updates, goals & key metrics' },
  list: { label: 'List', hint: 'Sections with sortable, filterable rows' },
  board: { label: 'Board', hint: 'Kanban columns with WIP limits' },
  timeline: { label: 'Timeline', hint: 'Gantt bars, milestones & dependencies' },
  calendar: { label: 'Calendar', hint: 'Due dates by month' },
  workload: { label: 'Workload', hint: 'Capacity per teammate' },
  sprints: { label: 'Sprints', hint: 'Cycles, burndown & velocity' },
};

export const RULE_TRIGGER_META: Record<RuleTrigger, string> = {
  task_completed: 'Task is completed',
  task_moved_to_section: 'Task is moved to a section',
  due_date_passed: 'Due date has passed',
  task_assigned: 'Task is assigned',
  priority_set_urgent: 'Priority is set to Urgent',
  task_created: 'Task is created',
};

export const RULE_ACTION_META: Record<RuleAction, string> = {
  move_to_section: 'Move to section',
  set_status: 'Set status',
  add_tag: 'Add tag',
  assign_to: 'Assign to',
  notify_owner: 'Notify project owner',
  set_priority: 'Set priority',
  add_collaborator: 'Add collaborator',
};

export const QUICK_TAGS = ['design', 'frontend', 'backend', 'security', 'customer', 'docs', 'research', 'blocked-external', 'quick-win', 'overdue'];

export const PROJECT_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#fbbf24', '#f87171', '#2dd4bf', '#818cf8', '#c084fc'];
export const PROJECT_ICONS = ['🚀', '🎯', '🧭', '🛡️', '🎨', '📦', '💸', '🧪', '📣', '🌱', '🏗️', '🤝'];

/** Default weekly focus capacity used by the Workload view (hours). */
export const WEEKLY_CAPACITY_HOURS = 32;

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl-launch',
    name: 'Product launch',
    description: 'Cross-functional launch plan from positioning to post-launch review.',
    icon: '🚀',
    color: '#38bdf8',
    category: 'Go-to-market',
    sections: ['Planning', 'Build', 'Launch readiness', 'Launch week', 'Done'],
    recommendedView: 'timeline',
    tasks: [
      { title: 'Write launch brief & success metrics', section: 'Planning', offsetDays: 2, priority: 'high', estimateHours: 6 },
      { title: 'Positioning & messaging workshop', section: 'Planning', offsetDays: 5, priority: 'medium', estimateHours: 4 },
      { title: 'Design launch assets', section: 'Build', offsetDays: 12, priority: 'medium', estimateHours: 16, tags: ['design'] },
      { title: 'Enable sales & success teams', section: 'Launch readiness', offsetDays: 18, priority: 'high', estimateHours: 6, subtasks: ['Record demo', 'Update battlecards', 'FAQ doc'] },
      { title: 'Legal & security review', section: 'Launch readiness', offsetDays: 19, priority: 'high', type: 'approval', estimateHours: 3 },
      { title: 'Go / no-go', section: 'Launch week', offsetDays: 21, type: 'milestone' },
      { title: 'Publish announcement & release notes', section: 'Launch week', offsetDays: 22, priority: 'urgent', estimateHours: 4 },
      { title: 'Post-launch retrospective', section: 'Done', offsetDays: 30, priority: 'low', estimateHours: 2 },
    ],
    defaultRules: [
      { name: 'Complete when moved to Done', trigger: 'task_moved_to_section', action: 'set_status', actionValue: 'done' },
      { name: 'Flag overdue work', trigger: 'due_date_passed', action: 'add_tag', actionValue: 'overdue' },
    ],
  },
  {
    id: 'tpl-sprint',
    name: 'Engineering sprint board',
    description: 'Two-week cycles with WIP limits, bug triage and release checklist.',
    icon: '🧪',
    color: '#a78bfa',
    category: 'Engineering',
    sections: ['Backlog', 'This sprint', 'In progress', 'In review', 'Done'],
    recommendedView: 'board',
    tasks: [
      { title: 'Sprint planning & capacity check', section: 'This sprint', offsetDays: 0, priority: 'high', estimateHours: 2 },
      { title: 'Groom top 10 backlog items', section: 'Backlog', offsetDays: 1, priority: 'medium', estimateHours: 3 },
      { title: 'Set up CI quality gates', section: 'This sprint', offsetDays: 4, priority: 'high', estimateHours: 8, tags: ['backend'] },
      { title: 'Bug bash', section: 'This sprint', offsetDays: 9, priority: 'medium', type: 'bug', estimateHours: 4 },
      { title: 'Release candidate sign-off', section: 'In review', offsetDays: 12, type: 'approval', priority: 'high' },
      { title: 'Sprint review & retro', section: 'Done', offsetDays: 13, priority: 'low', estimateHours: 2 },
    ],
    defaultRules: [
      { name: 'Complete when moved to Done', trigger: 'task_moved_to_section', action: 'set_status', actionValue: 'done' },
      { name: 'Urgent bugs ping the owner', trigger: 'priority_set_urgent', action: 'notify_owner' },
    ],
  },
  {
    id: 'tpl-onboarding',
    name: 'New-hire onboarding (30/60/90)',
    description: 'Mirror the HR Portal journey with manager, buddy and new-hire tasks.',
    icon: '🌱',
    color: '#34d399',
    category: 'People',
    sections: ['Before day 1', 'Week 1', 'Day 30', 'Day 60', 'Day 90', 'Done'],
    recommendedView: 'list',
    tasks: [
      { title: 'Prepare laptop, accounts & access', section: 'Before day 1', offsetDays: -3, priority: 'high', estimateHours: 2 },
      { title: 'Welcome note & first-week agenda', section: 'Before day 1', offsetDays: -1, priority: 'medium', estimateHours: 1 },
      { title: 'Meet the team & buddy intro', section: 'Week 1', offsetDays: 1, priority: 'medium', estimateHours: 1 },
      { title: 'Ship a starter task', section: 'Week 1', offsetDays: 5, priority: 'medium', estimateHours: 6 },
      { title: 'Complete required Academy trainings', section: 'Day 30', offsetDays: 25, priority: 'high', estimateHours: 4, tags: ['docs'] },
      { title: '30-day check-in', section: 'Day 30', offsetDays: 30, type: 'milestone' },
      { title: 'Own a small project end-to-end', section: 'Day 60', offsetDays: 55, priority: 'medium', estimateHours: 20 },
      { title: '90-day review & growth plan', section: 'Day 90', offsetDays: 90, type: 'approval', priority: 'high' },
    ],
    defaultRules: [{ name: 'Complete when moved to Done', trigger: 'task_moved_to_section', action: 'set_status', actionValue: 'done' }],
  },
  {
    id: 'tpl-event',
    name: 'Company event',
    description: 'Venue, agenda, speakers, logistics and comms for offsites or all-hands.',
    icon: '📣',
    color: '#fb923c',
    category: 'Operations',
    sections: ['Proposals', 'Logistics', 'Programme', 'Comms', 'Done'],
    recommendedView: 'calendar',
    tasks: [
      { title: 'Confirm date, venue & budget', section: 'Logistics', offsetDays: 3, priority: 'high', estimateHours: 4 },
      { title: 'Call for session proposals', section: 'Proposals', offsetDays: 5, priority: 'medium', estimateHours: 2 },
      { title: 'Draft agenda & speaker line-up', section: 'Programme', offsetDays: 12, priority: 'high', estimateHours: 6 },
      { title: 'Catering, AV & accessibility checks', section: 'Logistics', offsetDays: 15, priority: 'medium', estimateHours: 5 },
      { title: 'Send invites & travel guidance', section: 'Comms', offsetDays: 16, priority: 'high', estimateHours: 2 },
      { title: 'Event day', section: 'Programme', offsetDays: 24, type: 'milestone' },
      { title: 'Collect feedback & share recap', section: 'Done', offsetDays: 27, priority: 'low', estimateHours: 3 },
    ],
    defaultRules: [{ name: 'Complete when moved to Done', trigger: 'task_moved_to_section', action: 'set_status', actionValue: 'done' }],
  },
  {
    id: 'tpl-close',
    name: 'Month-end close',
    description: 'Finance close checklist with approvals, reconciliations and reporting.',
    icon: '💸',
    color: '#4ade80',
    category: 'Finance',
    sections: ['Pre-close', 'Reconciliations', 'Review', 'Reporting', 'Done'],
    recommendedView: 'list',
    tasks: [
      { title: 'Freeze AP/AR & cut-off checks', section: 'Pre-close', offsetDays: 0, priority: 'high', estimateHours: 3 },
      { title: 'Bank & card reconciliations', section: 'Reconciliations', offsetDays: 1, priority: 'high', estimateHours: 6 },
      { title: 'Payroll & accruals journal', section: 'Reconciliations', offsetDays: 2, priority: 'high', estimateHours: 4 },
      { title: 'Controller review of close pack', section: 'Review', offsetDays: 3, type: 'approval', priority: 'urgent' },
      { title: 'Management P&L & variance commentary', section: 'Reporting', offsetDays: 4, priority: 'medium', estimateHours: 5 },
      { title: 'Books closed', section: 'Done', offsetDays: 5, type: 'milestone' },
    ],
    defaultRules: [
      { name: 'Complete when moved to Done', trigger: 'task_moved_to_section', action: 'set_status', actionValue: 'done' },
      { name: 'Flag overdue work', trigger: 'due_date_passed', action: 'add_tag', actionValue: 'overdue' },
    ],
  },
  {
    id: 'tpl-research',
    name: 'Design & research sprint',
    description: 'Discovery, prototyping, usability testing and synthesis.',
    icon: '🎨',
    color: '#f472b6',
    category: 'Product',
    sections: ['Discover', 'Define', 'Prototype', 'Test', 'Done'],
    recommendedView: 'board',
    tasks: [
      { title: 'Recruit 6 participants', section: 'Discover', offsetDays: 2, priority: 'high', estimateHours: 3, tags: ['research'] },
      { title: 'Stakeholder interviews', section: 'Discover', offsetDays: 4, priority: 'medium', estimateHours: 6 },
      { title: 'Problem statement & HMWs', section: 'Define', offsetDays: 6, priority: 'medium', estimateHours: 3 },
      { title: 'Clickable prototype v1', section: 'Prototype', offsetDays: 9, priority: 'high', estimateHours: 12, tags: ['design'] },
      { title: 'Usability sessions', section: 'Test', offsetDays: 12, priority: 'high', estimateHours: 8 },
      { title: 'Synthesis & recommendation readout', section: 'Done', offsetDays: 14, type: 'milestone' },
    ],
    defaultRules: [{ name: 'Complete when moved to Done', trigger: 'task_moved_to_section', action: 'set_status', actionValue: 'done' }],
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(PROJECT_TEMPLATES.map((t) => [t.id, t])) as Record<string, ProjectTemplate>;
