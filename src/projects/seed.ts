/**
 * Demo data for Helix Projects, generated relative to "now" so the story always
 * works: Mei's Prism v4 sprint with a blocked migration and an overdue audit,
 * Layla's at-risk passkeys rollout with a milestone in 9 days, Grace's private
 * month-end close with a pending approval for Daniel's checklist, Kwame's
 * onboarding project mirroring his HR journey, Aisha's GCC expansion, and
 * Mateo's all-hands intake form.
 */
import type { Department } from '@/types';
import { addDaysISO, toISODate } from '@/hr/calendar';
import { PROJECTS_DATA_VERSION } from './constants';
import type {
  AutomationRule,
  Goal,
  IntakeForm,
  Portfolio,
  Project,
  ProjectMember,
  ProjectRole,
  ProjectsData,
  Sprint,
  StatusUpdate,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
} from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface TaskSeed {
  id: string;
  title: string;
  section: string;
  assignee?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  due?: number;
  start?: number;
  est?: number;
  logged?: number;
  points?: number;
  tags?: string[];
  description?: string;
  subtasks?: [string, boolean][];
  dependsOn?: string[];
  collaborators?: string[];
  sprint?: string;
  custom?: Record<string, string | number>;
  approver?: string;
  creator?: string;
  approvalDecision?: 'pending' | 'approved' | 'changes_requested';
  completedDaysAgo?: number;
  attach?: { driveFileId?: string; wikiSlug?: string; title: string }[];
  comments?: { by: string; body: string; hoursAgo: number; mentions?: string[]; reactions?: Record<string, string[]> }[];
  likes?: string[];
  recurring?: Task['recurring'];
  createdDaysAgo?: number;
}

export function createProjectsSeed(now = Date.now()): ProjectsData {
  const today = toISODate(now);
  const d = (n: number) => addDaysISO(today, n);
  const ago = (days: number) => now - days * DAY;

  const member = (userId: string, role: ProjectRole, addedBy: string): ProjectMember => ({ userId, role, addedAt: ago(40), addedBy });

  const P = (
    id: string,
    key: string,
    name: string,
    o: {
      description: string;
      icon: string;
      color: string;
      department: Department;
      ownerId: string;
      members: [string, ProjectRole][];
      privacy: Project['privacy'];
      health: Project['health'];
      start: number;
      due: number;
      sections: (string | { name: string; wip?: number })[];
      customFields?: Project['customFields'];
      defaultView?: Project['defaultView'];
      templateId?: string;
      links?: Project['links'];
      createdDaysAgo?: number;
    },
  ): Project => ({
    id,
    key,
    name,
    description: o.description,
    icon: o.icon,
    color: o.color,
    department: o.department,
    ownerId: o.ownerId,
    members: [member(o.ownerId, 'owner', o.ownerId), ...o.members.map(([u, r]) => member(u, r, o.ownerId))],
    privacy: o.privacy,
    health: o.health,
    startDate: d(o.start),
    dueDate: d(o.due),
    sections: o.sections.map((s, i) => (typeof s === 'string' ? { id: `${id}-s${i + 1}`, name: s } : { id: `${id}-s${i + 1}`, name: s.name, wipLimit: s.wip })),
    customFields: o.customFields ?? [],
    defaultView: o.defaultView ?? 'board',
    templateId: o.templateId,
    archived: false,
    links: o.links,
    nextTaskNumber: 1,
    createdAt: ago(o.createdDaysAgo ?? 60),
    updatedAt: ago(1),
  });

  const projects: Project[] = [
    P('prj-prism', 'PRISM', 'Prism v4 Design System', {
      description: 'Unified tokens, accessible components and theming across Talent Hub, HR Portal, Cortex and Spend. Sprint-based delivery with a GA milestone.',
      icon: '🎨',
      color: '#f472b6',
      department: 'Design',
      ownerId: 'u-mei',
      members: [
        ['u-hana', 'editor'],
        ['u-omar', 'editor'],
        ['u-priya', 'editor'],
        ['u-alex', 'editor'],
        ['u-aisha', 'commenter'],
      ],
      privacy: 'public',
      health: 'on_track',
      start: -45,
      due: 28,
      sections: ['Backlog', 'This sprint', { name: 'In progress', wip: 4 }, { name: 'In review', wip: 3 }, 'Done'],
      customFields: [
        {
          id: 'cf-area',
          name: 'Component area',
          type: 'select',
          options: [
            { id: 'tokens', label: 'Tokens', color: '#f472b6' },
            { id: 'forms', label: 'Forms', color: '#38bdf8' },
            { id: 'nav', label: 'Navigation', color: '#a78bfa' },
            { id: 'dataviz', label: 'Data viz', color: '#34d399' },
          ],
        },
        { id: 'cf-effort', name: 'Effort', type: 'number', unit: 'pts' },
      ],
      defaultView: 'board',
      templateId: 'tpl-sprint',
      links: { wikiSlug: 'prism-design-system' },
      createdDaysAgo: 48,
    }),
    P('prj-mfa', 'MFA', 'Passkeys & MFA Rollout', {
      description: 'Company-wide passkeys with phishing-resistant MFA, device trust and a hard enforcement date on 15 November.',
      icon: '🛡️',
      color: '#38bdf8',
      department: 'IT & Security',
      ownerId: 'u-layla',
      members: [
        ['u-ethan', 'editor'],
        ['u-omar', 'editor'],
        ['u-lucas', 'editor'],
        ['u-sara', 'commenter'],
      ],
      privacy: 'team',
      health: 'at_risk',
      start: -30,
      due: 12,
      sections: ['Requests', 'Pilot', 'Rollout waves', 'Enforcement', 'Done'],
      defaultView: 'timeline',
      links: { wikiSlug: 'security-zero-trust' },
      createdDaysAgo: 35,
    }),
    P('prj-close', 'CLOSE', 'FY26 Month-End Close Automation', {
      description: 'Cut the close from 5 days to 3 with automated reconciliations, Payroll Console exports and a four-eyes review pack.',
      icon: '💸',
      color: '#4ade80',
      department: 'Finance',
      ownerId: 'u-grace',
      members: [
        ['u-daniel', 'editor'],
        ['u-priya', 'editor'],
        ['u-kwame', 'editor'],
      ],
      privacy: 'private',
      health: 'on_track',
      start: -20,
      due: 25,
      sections: ['Pre-close', 'Reconciliations', 'Review', 'Reporting', 'Done'],
      defaultView: 'list',
      templateId: 'tpl-close',
      createdDaysAgo: 22,
    }),
    P('prj-onb-kwame', 'ONB', 'Onboarding · Kwame Mensah', {
      description: 'Kwame’s first 90 days as Data Engineer — synced with his HR Portal journey, Academy trainings and buddy check-ins.',
      icon: '🌱',
      color: '#34d399',
      department: 'Engineering',
      ownerId: 'u-omar',
      members: [
        ['u-kwame', 'editor'],
        ['u-priya', 'editor'],
        ['u-sara', 'commenter'],
      ],
      privacy: 'private',
      health: 'on_track',
      start: -26,
      due: 64,
      sections: ['Before day 1', 'Week 1', 'Day 30', 'Day 60', 'Day 90', 'Done'],
      defaultView: 'list',
      templateId: 'tpl-onboarding',
      links: { onboardingJourneyId: 'j-2', wikiSlug: 'day-one-setup' },
      createdDaysAgo: 30,
    }),
    P('prj-gcc', 'GCC', 'GCC Enterprise Expansion', {
      description: 'Land and expand six flagship enterprise accounts across KSA and Qatar with a localized offer and partner channel.',
      icon: '🤝',
      color: '#fb923c',
      department: 'Sales',
      ownerId: 'u-aisha',
      members: [
        ['u-noah', 'editor'],
        ['u-yusuf', 'editor'],
        ['u-sofia', 'editor'],
        ['u-daniel', 'commenter'],
      ],
      privacy: 'public',
      health: 'at_risk',
      start: -40,
      due: 50,
      sections: ['Pipeline', 'Proposals', 'Negotiation', 'Closed won', 'Done'],
      defaultView: 'list',
      createdDaysAgo: 42,
    }),
    P('prj-allhands', 'AHO', 'Q4 All-Hands & Offsite', {
      description: 'Two-day hybrid all-hands in Dubai with team offsites, a community track and the FY27 kickoff.',
      icon: '📣',
      color: '#fbbf24',
      department: 'Operations',
      ownerId: 'u-mateo',
      members: [
        ['u-sara', 'editor'],
        ['u-sofia', 'editor'],
        ['u-fatima', 'editor'],
      ],
      privacy: 'public',
      health: 'on_track',
      start: -14,
      due: 33,
      sections: ['Proposals', 'Logistics', 'Programme', 'Comms', 'Done'],
      defaultView: 'calendar',
      templateId: 'tpl-event',
      createdDaysAgo: 16,
    }),
    P('prj-eucell', 'EUC', 'EU-Cell Failover & DR', {
      description: 'Active-active EU cell with cross-region PostgreSQL failover, chaos drills and 99.99% availability SLO.',
      icon: '🏗️',
      color: '#a78bfa',
      department: 'Engineering',
      ownerId: 'u-omar',
      members: [
        ['u-priya', 'editor'],
        ['u-lucas', 'editor'],
        ['u-kwame', 'editor'],
        ['u-ethan', 'editor'],
      ],
      privacy: 'team',
      health: 'complete',
      start: -120,
      due: -8,
      sections: ['Design', 'Build', 'Drills', 'Done'],
      defaultView: 'overview',
      createdDaysAgo: 125,
    }),
  ];

  const sectionId = (projectId: string, name: string) => {
    const p = projects.find((x) => x.id === projectId)!;
    return p.sections.find((s) => s.name === name)!.id;
  };

  const tasks: Task[] = [];
  const counters = new Map<string, number>();
  const T = (projectId: string, s: TaskSeed) => {
    const n = (counters.get(projectId) ?? 0) + 1;
    counters.set(projectId, n);
    const project = projects.find((p) => p.id === projectId)!;
    const status: TaskStatus = s.status ?? (s.section === 'Done' ? 'done' : 'todo');
    const createdAt = ago(s.createdDaysAgo ?? 20);
    const completedAt = status === 'done' ? ago(s.completedDaysAgo ?? 3) : undefined;
    const task: Task = {
      id: s.id,
      projectId,
      sectionId: sectionId(projectId, s.section),
      number: n,
      title: s.title,
      description: s.description ?? '',
      type: s.type ?? 'task',
      status,
      priority: s.priority ?? 'medium',
      assigneeId: s.assignee,
      collaboratorIds: s.collaborators ?? [],
      creatorId: s.creator ?? project.ownerId,
      startDate: s.start !== undefined ? d(s.start) : undefined,
      dueDate: s.due !== undefined ? d(s.due) : undefined,
      completedAt,
      estimateHours: s.est,
      loggedHours: s.logged ?? 0,
      storyPoints: s.points,
      tags: s.tags ?? [],
      customFieldValues: s.custom ?? {},
      subtasks: (s.subtasks ?? []).map(([title, done], i) => ({ id: `${s.id}-st${i + 1}`, title, done })),
      dependsOn: s.dependsOn ?? [],
      attachments: (s.attach ?? []).map((a, i) => ({
        id: `${s.id}-att${i + 1}`,
        kind: a.driveFileId ? ('drive' as const) : ('wiki' as const),
        driveFileId: a.driveFileId,
        wikiSlug: a.wikiSlug,
        title: a.title,
        addedBy: s.assignee ?? project.ownerId,
        at: createdAt + HOUR,
      })),
      comments: (s.comments ?? []).map((c, i) => ({
        id: `${s.id}-c${i + 1}`,
        authorId: c.by,
        body: c.body,
        at: now - c.hoursAgo * HOUR,
        mentions: c.mentions ?? [],
        reactions: c.reactions ?? {},
      })),
      likes: s.likes ?? [],
      approval: s.approver ? { approverId: s.approver, decision: s.approvalDecision ?? 'pending' } : undefined,
      sprintId: s.sprint,
      recurring: s.recurring,
      order: n,
      activity: [
        { id: `${s.id}-a1`, at: createdAt, actorId: project.ownerId, action: 'created' },
        ...(completedAt ? [{ id: `${s.id}-a2`, at: completedAt, actorId: s.assignee ?? project.ownerId, action: 'completed' }] : []),
      ],
      createdAt,
      updatedAt: completedAt ?? createdAt + 2 * HOUR,
    };
    tasks.push(task);
    project.nextTaskNumber = n + 1;
  };

  // ───────────── Prism v4 (sprint 14 active) ─────────────
  T('prj-prism', { id: 't-p1', title: 'Finalize color token scale (light + dark)', section: 'In review', assignee: 'u-mei', status: 'in_review', priority: 'high', due: 1, est: 10, logged: 8, points: 5, tags: ['design'], custom: { 'cf-area': 'tokens', 'cf-effort': 5 }, sprint: 'spr-14', attach: [{ driveFileId: 'df-prism-tokens', title: 'Prism v4 — Token Sheet' }], subtasks: [['Contrast matrix AA/AAA', true], ['Semantic aliases', true], ['Dark theme review with Hana', false]], comments: [{ by: 'u-hana', body: 'Dark surfaces look great — only the warning hue needs +4% luminance.', hoursAgo: 5, reactions: { '👍': ['u-mei', 'u-omar'] } }, { by: 'u-mei', body: '@Omar can you confirm the engineering alias naming before I lock this?', hoursAgo: 3, mentions: ['u-omar'] }], likes: ['u-omar', 'u-alex'] });
  T('prj-prism', { id: 't-p2', title: 'Migrate Button & Input to v4 tokens', section: 'This sprint', assignee: 'u-alex', priority: 'high', due: 4, est: 12, points: 5, tags: ['frontend'], custom: { 'cf-area': 'forms', 'cf-effort': 5 }, sprint: 'spr-14', dependsOn: ['t-p1'], description: 'Replace legacy CSS vars with v4 semantic tokens in the shared UI kit. Blocked until the token scale is final.' });
  T('prj-prism', { id: 't-p3', title: 'Token contrast audit on HR Portal screens', section: 'In progress', assignee: 'u-mei', status: 'in_progress', priority: 'urgent', due: -2, est: 6, logged: 3, points: 3, tags: ['design', 'overdue'], custom: { 'cf-area': 'tokens', 'cf-effort': 3 }, sprint: 'spr-14', comments: [{ by: 'u-omar', body: 'Needed for the passkeys launch banner — can we land this by Thursday?', hoursAgo: 26 }] });
  T('prj-prism', { id: 't-p4', title: 'Navigation rail: responsive breakpoints spec', section: 'In progress', assignee: 'u-hana', status: 'in_progress', priority: 'medium', due: 3, est: 8, logged: 2, points: 3, tags: ['design'], custom: { 'cf-area': 'nav', 'cf-effort': 3 }, sprint: 'spr-14', attach: [{ driveFileId: 'df-prism-spec', title: 'Prism v4 Component Spec' }] });
  T('prj-prism', { id: 't-p5', title: 'Data-viz palette for Payroll & Insights', section: 'This sprint', assignee: 'u-priya', priority: 'medium', due: 6, est: 6, points: 3, tags: ['design', 'dataviz'], custom: { 'cf-area': 'dataviz', 'cf-effort': 3 }, sprint: 'spr-14' });
  T('prj-prism', { id: 't-p6', title: 'Storybook docs for v4 primitives', section: 'Backlog', assignee: 'u-alex', priority: 'low', due: 14, est: 8, points: 3, tags: ['docs'], custom: { 'cf-area': 'forms', 'cf-effort': 3 } });
  T('prj-prism', { id: 't-p7', title: 'Prism v4 GA across all product surfaces', section: 'Backlog', assignee: 'u-mei', type: 'milestone', priority: 'high', due: 28, custom: { 'cf-area': 'tokens' } });
  T('prj-prism', { id: 't-p8', title: 'Accessibility sign-off (WCAG 2.2 AA)', section: 'Backlog', assignee: 'u-aisha', type: 'approval', approver: 'u-aisha', priority: 'high', due: 24, dependsOn: ['t-p2'], custom: { 'cf-area': 'forms' } });
  T('prj-prism', { id: 't-p9', title: 'Typography scale & fluid type', section: 'Done', assignee: 'u-mei', priority: 'medium', due: -6, est: 6, logged: 6, points: 3, tags: ['design'], custom: { 'cf-area': 'tokens', 'cf-effort': 3 }, sprint: 'spr-14', completedDaysAgo: 4, likes: ['u-hana', 'u-priya', 'u-omar'] });
  T('prj-prism', { id: 't-p10', title: 'Theming API RFC', section: 'Done', assignee: 'u-priya', priority: 'high', due: -9, est: 8, logged: 9, points: 5, tags: ['frontend'], custom: { 'cf-area': 'tokens', 'cf-effort': 5 }, sprint: 'spr-13', completedDaysAgo: 10, attach: [{ wikiSlug: 'prism-design-system', title: 'Prism design system playbook' }] });
  T('prj-prism', { id: 't-p11', title: 'Icon set audit & consolidation', section: 'Done', assignee: 'u-hana', priority: 'low', due: -12, est: 4, logged: 4, points: 2, custom: { 'cf-area': 'nav', 'cf-effort': 2 }, sprint: 'spr-13', completedDaysAgo: 12 });
  T('prj-prism', { id: 't-p12', title: 'Weekly design crit', section: 'This sprint', assignee: 'u-mei', priority: 'low', due: 2, est: 1, recurring: 'weekly', custom: { 'cf-area': 'tokens' } });

  // ───────────── Passkeys & MFA ─────────────
  T('prj-mfa', { id: 't-m1', title: 'Pilot: IT & Security + Engineering leads', section: 'Pilot', assignee: 'u-ethan', status: 'done', priority: 'high', due: -16, est: 12, logged: 14, completedDaysAgo: 15, attach: [{ driveFileId: 'df-mfa-plan', title: 'Passkeys & MFA Rollout Plan' }] });
  T('prj-mfa', { id: 't-m2', title: 'Wave 1: Dubai office (240 people)', section: 'Rollout waves', assignee: 'u-ethan', status: 'in_progress', priority: 'high', start: -7, due: 2, est: 16, logged: 10, subtasks: [['Helpdesk runbook published', true], ['Lunch & learn sessions', true], ['Enrolment reminders', false]], comments: [{ by: 'u-ethan', body: '68% enrolled. Stragglers are mostly contractors without managed devices.', hoursAgo: 8 }, { by: 'u-layla', body: '@Omar can Engineering nudge the remaining 11 in your org this week?', hoursAgo: 6, mentions: ['u-omar'] }] });
  T('prj-mfa', { id: 't-m3', title: 'Wave 2: London, Berlin & remote', section: 'Rollout waves', assignee: 'u-lucas', priority: 'high', start: 3, due: 7, est: 12, dependsOn: ['t-m2'] });
  T('prj-mfa', { id: 't-m4', title: 'Legacy VPN exception review', section: 'Rollout waves', assignee: 'u-omar', status: 'in_progress', priority: 'urgent', due: -1, est: 4, logged: 1, tags: ['security', 'overdue'], description: '14 service accounts still use password+TOTP. Decide: migrate, exempt with expiry, or retire.' });
  T('prj-mfa', { id: 't-m5', title: 'Enforcement: block password-only sign-in', section: 'Enforcement', assignee: 'u-layla', type: 'milestone', priority: 'urgent', due: 9, dependsOn: ['t-m3', 't-m4'] });
  T('prj-mfa', { id: 't-m6', title: 'Approve enforcement exception policy', section: 'Enforcement', assignee: 'u-layla', type: 'approval', approver: 'u-layla', creator: 'u-ethan', priority: 'high', due: 5, description: 'Raised by Ethan: 30-day exceptions for field devices without platform authenticators.' });
  T('prj-mfa', { id: 't-m7', title: 'Update Information Security policy v3 + Academy module', section: 'Enforcement', assignee: 'u-sara', priority: 'medium', due: 6, est: 3, collaborators: ['u-ethan'], attach: [{ wikiSlug: 'security-zero-trust', title: 'Zero-trust & passkeys playbook' }] });
  T('prj-mfa', { id: 't-m8', title: 'Request: YubiKeys for Finance signers', section: 'Requests', assignee: 'u-ethan', priority: 'medium', due: 4, est: 2, tags: ['security'], description: 'Submitted via the IT & Security intake form by Grace Liu.' });
  T('prj-mfa', { id: 't-m9', title: 'Post-rollout phishing simulation', section: 'Enforcement', assignee: 'u-ethan', priority: 'low', due: 20, est: 6, dependsOn: ['t-m5'] });

  // ───────────── Month-end close (private) ─────────────
  T('prj-close', { id: 't-c1', title: 'Map close checklist to Payroll Console exports', section: 'Pre-close', assignee: 'u-daniel', status: 'done', priority: 'high', due: -5, est: 6, logged: 6, completedDaysAgo: 4, attach: [{ driveFileId: 'df-close-checklist', title: 'Month-End Close Checklist' }] });
  T('prj-close', { id: 't-c2', title: 'Approve revised close checklist', section: 'Review', assignee: 'u-grace', type: 'approval', approver: 'u-grace', creator: 'u-daniel', priority: 'urgent', due: 1, description: 'Daniel’s revised 3-day checklist with automated bank reconciliation steps.', comments: [{ by: 'u-daniel', body: 'Ready for your review — the WPS export now reconciles automatically against the bank file.', hoursAgo: 20 }] });
  T('prj-close', { id: 't-c3', title: 'dbt model: multi-currency payroll accruals', section: 'Reconciliations', assignee: 'u-kwame', status: 'in_progress', priority: 'high', due: 3, est: 14, logged: 6, tags: ['backend'], subtasks: [['Source payroll runs', true], ['FX normalization', true], ['Accrual journal output', false], ['Tests & docs', false]] });
  T('prj-close', { id: 't-c4', title: 'Automate card & T&E reconciliation', section: 'Reconciliations', assignee: 'u-priya', priority: 'medium', due: 8, est: 10, dependsOn: ['t-c3'] });
  T('prj-close', { id: 't-c5', title: 'Variance commentary template', section: 'Reporting', assignee: 'u-daniel', priority: 'medium', due: 12, est: 4 });
  T('prj-close', { id: 't-c6', title: 'First 3-day close (dry run)', section: 'Reporting', assignee: 'u-grace', type: 'milestone', priority: 'high', due: 25, dependsOn: ['t-c4'] });

  // ───────────── Onboarding · Kwame ─────────────
  T('prj-onb-kwame', { id: 't-o1', title: 'Laptop, accounts & access provisioned', section: 'Done', assignee: 'u-omar', priority: 'high', due: -27, completedDaysAgo: 27 });
  T('prj-onb-kwame', { id: 't-o2', title: 'Meet the team & buddy intro with Priya', section: 'Done', assignee: 'u-kwame', priority: 'medium', due: -25, completedDaysAgo: 25, likes: ['u-priya', 'u-omar'] });
  T('prj-onb-kwame', { id: 't-o3', title: 'Ship a starter task (dbt freshness test)', section: 'Done', assignee: 'u-kwame', priority: 'medium', due: -20, est: 6, logged: 7, completedDaysAgo: 19 });
  T('prj-onb-kwame', { id: 't-o4', title: 'Complete required Academy trainings', section: 'Day 30', assignee: 'u-kwame', status: 'in_progress', priority: 'high', due: 4, est: 4, logged: 2, tags: ['docs'], attach: [{ wikiSlug: 'day-one-setup', title: 'Day-one setup guide' }], description: 'Secure Engineering & Production Readiness + AI Fundamentals — tracked in Helix Academy.' });
  T('prj-onb-kwame', { id: 't-o5', title: '30-day check-in with Omar', section: 'Day 30', assignee: 'u-omar', type: 'milestone', priority: 'medium', due: 4 });
  T('prj-onb-kwame', { id: 't-o6', title: 'Sign IP agreement in HR Portal', section: 'Day 30', assignee: 'u-kwame', priority: 'urgent', due: 0, est: 1, collaborators: ['u-sara'] });
  T('prj-onb-kwame', { id: 't-o7', title: 'Own payroll accrual model end-to-end', section: 'Day 60', assignee: 'u-kwame', priority: 'medium', due: 34, est: 24 });
  T('prj-onb-kwame', { id: 't-o8', title: '90-day review & growth plan', section: 'Day 90', assignee: 'u-omar', type: 'approval', approver: 'u-omar', creator: 'u-sara', priority: 'high', due: 64, attach: [{ driveFileId: 'df-onboard-plan', title: 'Kwame · 30-60-90 Plan' }] });

  // ───────────── GCC expansion ─────────────
  T('prj-gcc', { id: 't-g1', title: 'Localized pricing & data-residency offer', section: 'Proposals', assignee: 'u-aisha', status: 'in_review', priority: 'high', due: 2, est: 10, logged: 9, attach: [{ driveFileId: 'df-gcc-deck', title: 'GCC Enterprise Expansion Deck' }] });
  T('prj-gcc', { id: 't-g2', title: 'Riyadh advisory board follow-ups (6 accounts)', section: 'Negotiation', assignee: 'u-noah', status: 'in_progress', priority: 'urgent', due: -3, est: 8, logged: 5, tags: ['customer', 'overdue'], subtasks: [['Al Rajhi', true], ['stc', true], ['NEOM', false], ['Qatar Airways', false], ['ADNOC', false], ['Aramco Digital', false]] });
  T('prj-gcc', { id: 't-g3', title: 'Partner channel agreement (KSA SI)', section: 'Negotiation', assignee: 'u-yusuf', priority: 'high', due: 9, est: 6, collaborators: ['u-daniel'] });
  T('prj-gcc', { id: 't-g4', title: 'Arabic marketing site & case studies', section: 'Proposals', assignee: 'u-sofia', status: 'in_progress', priority: 'medium', due: 11, est: 16, logged: 4, tags: ['design'] });
  T('prj-gcc', { id: 't-g5', title: 'Finance review of multi-year discount guardrails', section: 'Proposals', assignee: 'u-daniel', type: 'approval', approver: 'u-daniel', creator: 'u-aisha', priority: 'high', due: 5 });
  T('prj-gcc', { id: 't-g6', title: 'First GCC enterprise logo signed', section: 'Closed won', assignee: 'u-noah', type: 'milestone', priority: 'high', due: 30, dependsOn: ['t-g1', 't-g3'] });
  T('prj-gcc', { id: 't-g7', title: 'Account plans for cohort 1', section: 'Done', assignee: 'u-noah', priority: 'medium', due: -15, est: 8, logged: 8, completedDaysAgo: 14 });

  // ───────────── All-hands ─────────────
  T('prj-allhands', { id: 't-a1', title: 'Confirm venue, dates & budget', section: 'Done', assignee: 'u-mateo', priority: 'high', due: -9, est: 4, logged: 4, completedDaysAgo: 8, attach: [{ driveFileId: 'df-allhands-agenda', title: 'Q4 All-Hands Agenda' }] });
  T('prj-allhands', { id: 't-a2', title: 'Session proposal: “Nova Docs in your workflow”', section: 'Proposals', assignee: 'u-mateo', priority: 'medium', due: 10, est: 1, description: 'Submitted via intake form by Priya Raman.', tags: ['quick-win'] });
  T('prj-allhands', { id: 't-a3', title: 'Session proposal: “Four-eyes payroll, zero drama”', section: 'Proposals', assignee: 'u-mateo', priority: 'medium', due: 10, est: 1, description: 'Submitted via intake form by Daniel Okafor.' });
  T('prj-allhands', { id: 't-a4', title: 'Draft agenda & speaker line-up', section: 'Programme', assignee: 'u-sara', status: 'in_progress', priority: 'high', due: 5, est: 6, logged: 2 });
  T('prj-allhands', { id: 't-a5', title: 'Catering, AV & accessibility checks', section: 'Logistics', assignee: 'u-mateo', priority: 'medium', due: 12, est: 5, subtasks: [['Dietary survey', false], ['Live captions vendor', false], ['Step-free access confirmed', true]] });
  T('prj-allhands', { id: 't-a6', title: 'Invites, travel guidance & visa letters', section: 'Comms', assignee: 'u-fatima', priority: 'high', due: 7, est: 3, description: 'Coordinate NOC/visa letters through HR Portal documents and trips through Travel Desk.' });
  T('prj-allhands', { id: 't-a7', title: 'Brand kit, stage visuals & recap video', section: 'Comms', assignee: 'u-sofia', priority: 'medium', due: 20, est: 12, tags: ['design'] });
  T('prj-allhands', { id: 't-a8', title: 'All-hands day 1', section: 'Programme', assignee: 'u-mateo', type: 'milestone', priority: 'high', due: 30 });

  // ───────────── EU-Cell (complete) ─────────────
  T('prj-eucell', { id: 't-e1', title: 'Cross-region PostgreSQL logical replication', section: 'Done', assignee: 'u-priya', priority: 'high', due: -40, est: 40, logged: 44, points: 13, completedDaysAgo: 38 });
  T('prj-eucell', { id: 't-e2', title: 'Chaos drill: region evacuation', section: 'Done', assignee: 'u-lucas', priority: 'high', due: -18, est: 16, logged: 15, points: 8, completedDaysAgo: 17 });
  T('prj-eucell', { id: 't-e3', title: 'Zero-downtime cutover', section: 'Done', assignee: 'u-priya', type: 'milestone', priority: 'urgent', due: -10, completedDaysAgo: 10, likes: ['u-omar', 'u-layla', 'u-lucas', 'u-kwame'] });
  T('prj-eucell', { id: 't-e4', title: 'Runbook & on-call handover', section: 'Done', assignee: 'u-lucas', priority: 'medium', due: -8, est: 6, logged: 6, points: 3, completedDaysAgo: 8, attach: [{ wikiSlug: 'incident-response', title: 'Incident response runbook' }] });

  const statusUpdates: StatusUpdate[] = [
    { id: 'su-1', projectId: 'prj-prism', authorId: 'u-mei', health: 'on_track', title: 'Sprint 14 underway — tokens locking this week', summary: 'Typography shipped, color scale in review. Button/Input migration starts once tokens lock. GA still targeted in 4 weeks.', highlights: ['Fluid type scale shipped to all surfaces', 'Theming API RFC accepted'], blockers: ['Contrast audit on HR Portal slipped 2 days'], nextSteps: ['Lock color tokens', 'Kick off Button & Input migration with Alex'], progressPct: 25, at: ago(2) },
    { id: 'su-2', projectId: 'prj-mfa', authorId: 'u-layla', health: 'at_risk', title: 'Wave 1 at 68% — enforcement date under pressure', summary: 'Pilot went smoothly, Wave 1 is behind on contractor devices and 14 legacy VPN service accounts need a decision before enforcement on the 15th.', highlights: ['Pilot: zero lockouts, 100% enrolled'], blockers: ['Legacy VPN exceptions undecided', 'Contractors without managed devices'], nextSteps: ['Exception policy approval', 'Wave 2 starts Monday'], progressPct: 11, at: ago(1) },
    { id: 'su-3', projectId: 'prj-gcc', authorId: 'u-aisha', health: 'at_risk', title: 'Advisory board momentum, follow-ups slipping', summary: 'Six accounts engaged in Riyadh; two verbal commitments. Follow-ups are late and the partner agreement is pending Finance guardrails.', highlights: ['2 verbal commitments ($1.1M ARR)'], blockers: ['Follow-ups 3 days late', 'Discount guardrails awaiting Finance approval'], nextSteps: ['Finance approval by Friday', 'Partner agreement draft'], progressPct: 14, at: ago(3) },
    { id: 'su-4', projectId: 'prj-eucell', authorId: 'u-omar', health: 'complete', title: 'EU-Cell live — 99.995% over 30 days', summary: 'Cutover completed with zero customer impact. Runbooks handed to on-call. Closing the project.', highlights: ['Zero-downtime cutover', 'Chaos drill passed'], blockers: [], nextSteps: ['Quarterly DR drill (new project)'], progressPct: 100, at: ago(8) },
  ];

  const portfolios: Portfolio[] = [
    { id: 'pf-exec', name: 'Company bets FY26', description: 'The handful of projects leadership reviews every Monday.', ownerId: 'u-layla', color: '#38bdf8', projectIds: ['prj-mfa', 'prj-gcc', 'prj-close', 'prj-prism'], createdAt: ago(50) },
    { id: 'pf-eng', name: 'Platform & reliability', description: 'Engineering-owned programs across security, design systems and DR.', ownerId: 'u-omar', color: '#a78bfa', projectIds: ['prj-eucell', 'prj-prism', 'prj-mfa'], createdAt: ago(45) },
    { id: 'pf-people', name: 'People & culture', description: 'Onboarding, events and employee experience.', ownerId: 'u-sara', color: '#34d399', projectIds: ['prj-onb-kwame', 'prj-allhands'], createdAt: ago(20) },
  ];

  const goals: Goal[] = [
    { id: 'g-1', title: 'Zero-trust everywhere by year-end', description: 'Passkeys for 100% of staff, device trust on every session.', ownerId: 'u-layla', level: 'company', projectIds: ['prj-mfa'], metric: { label: 'Staff on passkeys', current: 68, target: 100, unit: '%' }, status: 'at_risk', targetDate: d(55), createdAt: ago(90), updatedAt: ago(1) },
    { id: 'g-2', title: 'Grow GCC enterprise ARR to $4M', description: 'Six flagship logos across KSA and Qatar.', ownerId: 'u-aisha', level: 'company', projectIds: ['prj-gcc'], metric: { label: 'GCC ARR', current: 2.6, target: 4, unit: '$M' }, status: 'at_risk', targetDate: d(85), createdAt: ago(90), updatedAt: ago(3) },
    { id: 'g-3', title: 'Ship Prism v4 to every product surface', description: 'One token system, WCAG 2.2 AA everywhere.', ownerId: 'u-mei', level: 'team', department: 'Design', parentId: 'g-1', projectIds: ['prj-prism'], metric: { label: 'Surfaces migrated', current: 62, target: 100, unit: '%' }, status: 'on_track', targetDate: d(28), createdAt: ago(60), updatedAt: ago(2) },
    { id: 'g-4', title: 'Close the books in 3 days', description: 'From 5 working days to 3 with automation and four-eyes review.', ownerId: 'u-grace', level: 'team', department: 'Finance', projectIds: ['prj-close'], metric: { label: 'Days to close', current: 4, target: 3, unit: 'days' }, manualProgress: 50, status: 'on_track', targetDate: d(25), createdAt: ago(40), updatedAt: ago(4) },
    { id: 'g-5', title: '99.99% availability for EU customers', description: 'Active-active cells with tested failover.', ownerId: 'u-omar', level: 'team', department: 'Engineering', projectIds: ['prj-eucell'], metric: { label: 'Availability (30d)', current: 99.995, target: 99.99, unit: '%' }, status: 'complete', targetDate: d(-8), createdAt: ago(120), updatedAt: ago(8) },
    { id: 'g-6', title: 'Every new hire productive by day 30', description: 'Starter task shipped, trainings done, 30-day pulse ≥ 4.2.', ownerId: 'u-sara', level: 'team', department: 'People Ops', projectIds: ['prj-onb-kwame'], status: 'on_track', targetDate: d(60), createdAt: ago(30), updatedAt: ago(2) },
  ];

  const sprints: Sprint[] = [
    { id: 'spr-13', projectId: 'prj-prism', name: 'Sprint 13 · Foundations', goal: 'Theming RFC + icon consolidation', startDate: d(-24), endDate: d(-11), state: 'completed', committedPoints: 12, completedPoints: 10 },
    { id: 'spr-14', projectId: 'prj-prism', name: 'Sprint 14 · Tokens lock', goal: 'Lock color + type tokens, start component migration', startDate: d(-10), endDate: d(4), state: 'active', committedPoints: 22 },
    { id: 'spr-15', projectId: 'prj-prism', name: 'Sprint 15 · Components', goal: 'Forms & navigation on v4', startDate: d(5), endDate: d(18), state: 'planned' },
  ];

  const rules: AutomationRule[] = [
    { id: 'r-1', projectId: 'prj-prism', name: 'Complete when moved to Done', trigger: 'task_moved_to_section', triggerSectionId: sectionId('prj-prism', 'Done'), action: 'set_status', actionValue: 'done', enabled: true, runs: 11, lastRunAt: ago(4), createdBy: 'u-mei' },
    { id: 'r-2', projectId: 'prj-prism', name: 'Flag overdue work', trigger: 'due_date_passed', action: 'add_tag', actionValue: 'overdue', enabled: true, runs: 3, lastRunAt: ago(1), createdBy: 'u-mei' },
    { id: 'r-3', projectId: 'prj-prism', name: 'Urgent → ping Mei', trigger: 'priority_set_urgent', action: 'notify_owner', enabled: true, runs: 1, lastRunAt: ago(2), createdBy: 'u-mei' },
    { id: 'r-4', projectId: 'prj-mfa', name: 'Completed work notifies Layla', trigger: 'task_completed', action: 'notify_owner', enabled: true, runs: 1, lastRunAt: ago(15), createdBy: 'u-layla' },
    { id: 'r-5', projectId: 'prj-mfa', name: 'New requests go to Ethan', trigger: 'task_created', action: 'assign_to', actionValue: 'u-ethan', enabled: true, runs: 2, lastRunAt: ago(2), createdBy: 'u-layla' },
    { id: 'r-6', projectId: 'prj-close', name: 'Complete when moved to Done', trigger: 'task_moved_to_section', triggerSectionId: sectionId('prj-close', 'Done'), action: 'set_status', actionValue: 'done', enabled: true, runs: 0, createdBy: 'u-grace' },
    { id: 'r-7', projectId: 'prj-allhands', name: 'Proposals auto-assign to Mateo', trigger: 'task_created', action: 'assign_to', actionValue: 'u-mateo', enabled: true, runs: 2, lastRunAt: ago(3), createdBy: 'u-mateo' },
    { id: 'r-8', projectId: 'prj-gcc', name: 'Flag overdue follow-ups', trigger: 'due_date_passed', action: 'add_tag', actionValue: 'overdue', enabled: true, runs: 1, lastRunAt: ago(1), createdBy: 'u-aisha' },
  ];

  const forms: IntakeForm[] = [
    {
      id: 'frm-aho',
      projectId: 'prj-allhands',
      title: 'Propose an all-hands session',
      description: 'Pitch a talk, demo or workshop for the Q4 all-hands. The programme team reviews every Friday.',
      fields: [
        { id: 'f-title', label: 'Session title', type: 'text', required: true, mapsTo: 'title' },
        { id: 'f-pitch', label: 'What will people learn?', type: 'textarea', required: true, mapsTo: 'description' },
        { id: 'f-format', label: 'Format', type: 'select', options: ['Talk (15m)', 'Demo (10m)', 'Workshop (45m)', 'Lightning (5m)'], required: true, mapsTo: 'tag' },
      ],
      targetSectionId: sectionId('prj-allhands', 'Proposals'),
      defaultAssigneeId: 'u-mateo',
      defaultPriority: 'medium',
      enabled: true,
      submissions: 2,
      createdBy: 'u-mateo',
    },
    {
      id: 'frm-it',
      projectId: 'prj-mfa',
      title: 'IT & Security request',
      description: 'Hardware keys, access exceptions or security reviews. Triage within one business day.',
      fields: [
        { id: 'f-what', label: 'What do you need?', type: 'text', required: true, mapsTo: 'title' },
        { id: 'f-why', label: 'Context & justification', type: 'textarea', required: true, mapsTo: 'description' },
        { id: 'f-by', label: 'Needed by', type: 'date', required: false, mapsTo: 'dueDate' },
        { id: 'f-kind', label: 'Type', type: 'select', options: ['Hardware key', 'Access exception', 'Security review', 'Other'], required: true, mapsTo: 'tag' },
      ],
      targetSectionId: sectionId('prj-mfa', 'Requests'),
      defaultAssigneeId: 'u-ethan',
      defaultPriority: 'medium',
      enabled: true,
      submissions: 1,
      createdBy: 'u-layla',
    },
  ];

  const userState: ProjectsData['userState'] = {
    'u-mei': { starredProjectIds: ['prj-prism'], recentProjectIds: ['prj-prism', 'prj-allhands'], buckets: { 't-p12': 'later' }, inboxReadAt: ago(1) },
    'u-omar': { starredProjectIds: ['prj-prism', 'prj-mfa', 'prj-onb-kwame'], recentProjectIds: ['prj-mfa', 'prj-onb-kwame', 'prj-prism'], buckets: {}, inboxReadAt: ago(1) },
    'u-layla': { starredProjectIds: ['prj-mfa'], recentProjectIds: ['prj-mfa', 'prj-gcc'], buckets: {}, inboxReadAt: ago(2) },
    'u-daniel': { starredProjectIds: ['prj-close'], recentProjectIds: ['prj-close', 'prj-gcc'], buckets: {}, inboxReadAt: ago(1) },
    'u-kwame': { starredProjectIds: ['prj-onb-kwame'], recentProjectIds: ['prj-onb-kwame', 'prj-close'], buckets: {}, inboxReadAt: ago(1) },
    'u-alex': { starredProjectIds: ['prj-prism'], recentProjectIds: ['prj-prism'], buckets: {}, inboxReadAt: ago(1) },
  };

  return { version: PROJECTS_DATA_VERSION, projects, tasks, statusUpdates, portfolios, goals, sprints, rules, forms, userState };
}
