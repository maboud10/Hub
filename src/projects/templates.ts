/**
 * Project templates for the New Project wizard. Sections + a few starter
 * tasks (due offsets are days from the project start).
 */
import type { Priority, SectionStage, TaskKind } from './types';

export type TemplateId = 'blank' | 'kanban' | 'sprint' | 'launch' | 'onboarding' | 'event';

export interface TemplateTask {
  title: string;
  section: number;
  dueOffset?: number;
  kind?: TaskKind;
  priority?: Priority;
  estimate?: number;
  description?: string;
}

export interface ProjectTemplate {
  id: TemplateId;
  name: string;
  blurb: string;
  icon: string;
  sections: { name: string; stage?: SectionStage; wip?: number }[];
  tasks: TemplateTask[];
  brief: string;
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    blurb: 'Three columns, no starter tasks.',
    icon: 'cube',
    sections: [{ name: 'To do' }, { name: 'Doing', stage: 'doing' }, { name: 'Done', stage: 'done' }],
    tasks: [],
    brief: 'What are we doing, why does it matter, and how will we know we are done?',
  },
  {
    id: 'kanban',
    name: 'Kanban',
    blurb: 'Continuous flow with WIP limits.',
    icon: 'layers',
    sections: [{ name: 'Backlog' }, { name: 'Ready' }, { name: 'In progress', stage: 'doing', wip: 4 }, { name: 'Review', stage: 'doing', wip: 2 }, { name: 'Done', stage: 'done' }],
    tasks: [
      { title: 'Agree working agreements & WIP limits', section: 1, dueOffset: 2, priority: 'high', estimate: 1 },
      { title: 'Groom the backlog', section: 0, dueOffset: 5, estimate: 2 },
    ],
    brief: 'A continuous-flow board. Pull work from Ready, respect the WIP limits, and keep Review short.',
  },
  {
    id: 'sprint',
    name: 'Sprint',
    blurb: 'Two-week cadence with planning and review.',
    icon: 'bolt',
    sections: [{ name: 'Backlog' }, { name: 'This sprint' }, { name: 'In progress', stage: 'doing', wip: 5 }, { name: 'In review', stage: 'doing', wip: 3 }, { name: 'Done', stage: 'done' }],
    tasks: [
      { title: 'Sprint planning', section: 1, dueOffset: 0, priority: 'high', estimate: 2 },
      { title: 'Mid-sprint check-in', section: 1, dueOffset: 7, estimate: 0.5 },
      { title: 'Sprint review & demo', section: 1, dueOffset: 13, kind: 'milestone', priority: 'high' },
      { title: 'Retro', section: 1, dueOffset: 13, estimate: 1 },
    ],
    brief: 'Two-week sprints: plan on day one, demo on day ten, retro straight after.',
  },
  {
    id: 'launch',
    name: 'Product launch',
    blurb: 'From brief to GA with a go/no-go.',
    icon: 'rocket',
    sections: [{ name: 'Plan' }, { name: 'Build', stage: 'doing', wip: 5 }, { name: 'Launch readiness', stage: 'doing' }, { name: 'Done', stage: 'done' }],
    tasks: [
      { title: 'Write the launch brief', section: 0, dueOffset: 3, priority: 'high', estimate: 4 },
      { title: 'Pricing & packaging review', section: 0, dueOffset: 10, estimate: 3 },
      { title: 'Go / no-go approval', section: 2, dueOffset: 35, kind: 'approval', priority: 'urgent' },
      { title: 'General availability', section: 2, dueOffset: 42, kind: 'milestone', priority: 'high' },
    ],
    brief: '**Launch goal** — who is it for, what problem does it solve, and what does success look like 30 days after GA?',
  },
  {
    id: 'onboarding',
    name: '30-60-90 onboarding',
    blurb: 'A new hire’s first three months.',
    icon: 'sprout',
    sections: [{ name: 'Before day 1' }, { name: 'Week 1', stage: 'doing' }, { name: 'Day 30' }, { name: 'Day 60' }, { name: 'Day 90' }, { name: 'Done', stage: 'done' }],
    tasks: [
      { title: 'Laptop, accounts & access', section: 0, dueOffset: -2, priority: 'high', estimate: 1 },
      { title: 'Buddy intro & team lunch', section: 1, dueOffset: 2, estimate: 1 },
      { title: 'Ship a starter task', section: 1, dueOffset: 10, priority: 'high', estimate: 6 },
      { title: '30-day check-in', section: 2, dueOffset: 30, kind: 'milestone' },
      { title: '90-day review & growth plan', section: 4, dueOffset: 90, kind: 'approval', priority: 'high' },
    ],
    brief: 'Help a new teammate get productive fast: clear goals for day 30, 60 and 90, a buddy and early wins.',
  },
  {
    id: 'event',
    name: 'Event',
    blurb: 'Venue, programme, comms and the big day.',
    icon: 'megaphone',
    sections: [{ name: 'Ideas' }, { name: 'Planning', stage: 'doing' }, { name: 'Confirmed', stage: 'doing' }, { name: 'Done', stage: 'done' }],
    tasks: [
      { title: 'Confirm venue, date & budget', section: 1, dueOffset: 5, priority: 'high', estimate: 3 },
      { title: 'Programme & speakers', section: 1, dueOffset: 14, estimate: 6 },
      { title: 'Invites & travel guidance', section: 1, dueOffset: 18, estimate: 2 },
      { title: 'Event day', section: 2, dueOffset: 30, kind: 'milestone', priority: 'high' },
    ],
    brief: 'Who is it for, what should people leave with, and what is the budget?',
  },
];
