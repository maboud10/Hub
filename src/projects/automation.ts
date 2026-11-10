/**
 * Automation rules — WHEN (trigger) → IF (conditions) → THEN (actions).
 * Matching is pure; the store applies actions and records runs.
 */
import { diffDays, iso } from './dates';
import { PRIORITY_NAME } from './nlp';
import type { Priority, Project, Rule, RuleAction, RuleCondition, RuleTrigger, Task, TriggerKind } from './types';

export type AutoEvent =
  | { kind: 'created' }
  | { kind: 'completed' }
  | { kind: 'moved'; sectionId: string }
  | { kind: 'assigned'; assigneeId: string | null }
  | { kind: 'due-soon' };

export function conditionHolds(c: RuleCondition, task: Pick<Task, 'priority' | 'assigneeId' | 'tags'>): boolean {
  switch (c.field) {
    case 'priority':
      return task.priority === c.value;
    case 'assignee':
      return c.value === 'none' ? !task.assigneeId : task.assigneeId === c.value;
    case 'tag':
      return task.tags.includes(c.value.toLowerCase());
  }
}

export function ruleMatches(rule: Rule, event: AutoEvent, task: Task, now: number): boolean {
  if (!rule.enabled || rule.trigger.kind !== event.kind) return false;
  if (task.projectId !== rule.projectId) return false;
  if (event.kind === 'moved' && rule.trigger.sectionId && rule.trigger.sectionId !== event.sectionId) return false;
  if (event.kind === 'assigned' && !event.assigneeId) return false;
  if (event.kind === 'due-soon') {
    if (!task.dueDate || task.completedAt || rule.fired.includes(task.id)) return false;
    const d = diffDays(iso(now), task.dueDate);
    if (d < 0 || d > (rule.trigger.days ?? 2)) return false;
  }
  if (event.kind !== 'completed' && event.kind !== 'moved' && task.completedAt) return false;
  return rule.conditions.every((c) => conditionHolds(c, task));
}

/* ---------- copy ---------- */

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  created: 'Task is created',
  completed: 'Task is completed',
  moved: 'Task moves to a section',
  assigned: 'Task is assigned',
  'due-soon': 'Due date is approaching',
};

export function describeTrigger(t: RuleTrigger, project?: Project): string {
  switch (t.kind) {
    case 'moved': {
      const s = project?.sections.find((x) => x.id === t.sectionId);
      return s ? `Task moves to ${s.name}` : 'Task moves to any section';
    }
    case 'due-soon':
      return `Due within ${t.days ?? 2} ${(t.days ?? 2) === 1 ? 'day' : 'days'}`;
    default:
      return TRIGGER_LABEL[t.kind];
  }
}

export function describeCondition(c: RuleCondition, nameOf: (id: string) => string): string {
  switch (c.field) {
    case 'priority':
      return `Priority is ${PRIORITY_NAME[c.value as Priority] ?? c.value}`;
    case 'assignee':
      return c.value === 'none' ? 'Nobody is assigned' : `Assignee is ${nameOf(c.value)}`;
    case 'tag':
      return `Tagged ${c.value}`;
  }
}

export function describeAction(a: RuleAction, project: Project | undefined, nameOf: (id: string) => string, channelName?: (id: string) => string): string {
  switch (a.kind) {
    case 'move':
      return `Move to ${project?.sections.find((s) => s.id === a.value)?.name ?? 'section'}`;
    case 'assign':
      return `Assign to ${a.value ? nameOf(a.value) : 'someone'}`;
    case 'priority':
      return `Set priority to ${PRIORITY_NAME[(a.value as Priority) ?? 'medium']}`;
    case 'tag':
      return `Add tag ${a.value ?? ''}`.trim();
    case 'notify':
      return a.value ? `Notify ${nameOf(a.value)}` : 'Notify the assignee';
    case 'post':
      return `Post to ${a.value ? (channelName?.(a.value) ?? `#${a.value.replace(/^ch-/, '')}`) : 'Pulse'}`;
  }
}

/* ---------- presets ---------- */

export interface RulePreset {
  id: string;
  name: string;
  blurb: string;
  build: (p: Project) => Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions'> | null;
}

const doneSection = (p: Project) => p.sections.find((s) => s.stage === 'done') ?? p.sections[p.sections.length - 1];
const reviewSection = (p: Project) => p.sections.find((s) => /review|verify|qa/i.test(s.name)) ?? p.sections.find((s) => s.stage === 'doing');

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'celebrate',
    name: 'Share wins in Pulse',
    blurb: 'Post a card to the project channel whenever work is completed.',
    build: (p) =>
      p.channelId ? { name: 'Share wins in Pulse', trigger: { kind: 'completed' }, conditions: [], actions: [{ kind: 'post', value: p.channelId }] } : null,
  },
  {
    id: 'urgent-ping',
    name: 'Urgent work pings the owner',
    blurb: 'When an urgent task is created, notify the project owner.',
    build: (p) => ({ name: 'Urgent work pings the owner', trigger: { kind: 'created' }, conditions: [{ field: 'priority', value: 'urgent' }], actions: [{ kind: 'notify', value: p.ownerId }] }),
  },
  {
    id: 'review-loop',
    name: 'Review loop',
    blurb: 'When a task moves to review, notify the assignee and tag it.',
    build: (p) => {
      const s = reviewSection(p);
      return s ? { name: 'Review loop', trigger: { kind: 'moved', sectionId: s.id }, conditions: [], actions: [{ kind: 'tag', value: 'in-review' }, { kind: 'notify' }] } : null;
    },
  },
  {
    id: 'due-soon',
    name: 'Heads-up before deadlines',
    blurb: 'Two days before a due date, tag the task and nudge the assignee.',
    build: () => ({ name: 'Heads-up before deadlines', trigger: { kind: 'due-soon', days: 2 }, conditions: [], actions: [{ kind: 'tag', value: 'due-soon' }, { kind: 'notify' }] }),
  },
  {
    id: 'triage',
    name: 'Auto-triage new work',
    blurb: 'Unassigned new tasks go to the project owner.',
    build: (p) => ({ name: 'Auto-triage new work', trigger: { kind: 'created' }, conditions: [{ field: 'assignee', value: 'none' }], actions: [{ kind: 'assign', value: p.ownerId }] }),
  },
  {
    id: 'done-moves',
    name: 'Completed work moves to Done',
    blurb: 'Ticking a task off moves it into the Done column.',
    build: (p) => {
      const s = doneSection(p);
      return s ? { name: 'Completed work moves to Done', trigger: { kind: 'completed' }, conditions: [], actions: [{ kind: 'move', value: s.id }] } : null;
    },
  },
];
