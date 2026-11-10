/**
 * Helix Projects demo data — generated relative to `now` so "due today",
 * "overdue" and "2h ago" always read true.
 *
 * IDs referenced elsewhere (Hub notifications, Performance, Pulse, Drive):
 *   prj-prism (PRISM-1 = t-p1, PRISM-3 = t-p3)   prj-mfa (MFA-2 = t-m2, MFA-6 = t-m6)
 *   prj-gcc (GCC-5 = t-g5)   prj-onb-kwame (ONB-6 = t-o6)   prj-platform   prj-brand
 *   prj-q4-allhands   prj-exec-offsite (private)   prj-eucell (complete)
 */
import type { Department } from '@/types';
import { DAY, HOUR, addDays, iso } from './dates';
import type {
  ApprovalState,
  Attachment,
  InboxItem,
  Member,
  Portfolio,
  Priority,
  Privacy,
  Project,
  ProjectRole,
  ProjectStatus,
  ProjectsData,
  Rule,
  Section,
  SectionStage,
  StatusUpdate,
  Task,
  TaskKind,
  UserState,
} from './types';

export const PROJECTS_DATA_VERSION = 3;

interface FileSpec {
  drive?: string;
  url?: string;
  name: string;
  kind: string;
}
interface CommentSpec {
  by: string;
  body: string;
  /** hours ago */
  h: number;
  mentions?: string[];
  react?: Record<string, string[]>;
}
interface TaskSpec {
  id: string;
  title: string;
  section: string;
  assignee?: string;
  priority?: Priority;
  kind?: TaskKind;
  due?: number;
  dueTime?: string;
  start?: number;
  est?: number;
  tags?: string[];
  desc?: string;
  subtasks?: [string, boolean][];
  blockedBy?: string[];
  creator?: string;
  approver?: string;
  approval?: ApprovalState;
  /** completed N days ago */
  doneAgo?: number;
  /** created N days ago (fractions allowed) */
  createdAgo?: number;
  comments?: CommentSpec[];
  files?: FileSpec[];
  followers?: string[];
  activity?: { by: string; text: string; h: number }[];
}

interface ProjectSpec {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  department: Department;
  ownerId: string;
  privacy: Privacy;
  status: ProjectStatus;
  priority: Priority;
  members: [string, ProjectRole][];
  sections: [string, SectionStage?, number?][];
  brief: string;
  start: number;
  due: number;
  channelId?: string;
  keyResultIds: string[];
  createdAgo: number;
  files?: FileSpec[];
}

export function createProjectsSeed(now = Date.now()): ProjectsData {
  const today = iso(now);
  const d = (n: number) => addDays(today, n);
  const ago = (days: number) => now - days * DAY;
  const hAgo = (h: number) => now - h * HOUR;
  let seq = 0;
  const nid = (p: string) => `${p}-${(++seq).toString(36)}`;

  const file = (f: FileSpec, by: string, at: number): Attachment => ({
    id: nid('att'),
    kind: f.drive ? 'drive' : 'link',
    fileId: f.drive,
    url: f.url,
    name: f.name,
    fileKind: f.kind,
    addedBy: by,
    at,
  });

  /* ───────────────────────── projects ───────────────────────── */
  const P = (s: ProjectSpec): Project => {
    const createdAt = ago(s.createdAgo);
    const members: Member[] = [
      { userId: s.ownerId, role: 'owner', addedAt: createdAt, addedBy: s.ownerId },
      ...s.members.map(([userId, role]) => ({ userId, role, addedAt: createdAt + HOUR, addedBy: s.ownerId })),
    ];
    const sections: Section[] = s.sections.map(([name, stage, wip], i) => ({ id: `${s.id}-s${i + 1}`, name, stage: stage ?? 'todo', wip }));
    return {
      id: s.id,
      key: s.key,
      name: s.name,
      icon: s.icon,
      color: s.color,
      department: s.department,
      ownerId: s.ownerId,
      privacy: s.privacy,
      status: s.status,
      priority: s.priority,
      members,
      sections,
      brief: s.brief,
      startDate: d(s.start),
      dueDate: d(s.due),
      channelId: s.channelId,
      keyResultIds: s.keyResultIds,
      attachments: (s.files ?? []).map((f) => file(f, s.ownerId, createdAt + DAY)),
      activity: [{ id: nid('pa'), at: createdAt, actorId: s.ownerId, text: 'created this project' }],
      archived: false,
      nextNumber: 1,
      createdAt,
      updatedAt: hAgo(2),
    };
  };

  const projects: Project[] = [
    P({
      id: 'prj-prism',
      key: 'PRISM',
      name: 'Prism v4 Design System',
      icon: 'prism',
      color: '#f472b6',
      department: 'Design',
      ownerId: 'u-mei',
      privacy: 'public',
      status: 'on-track',
      priority: 'high',
      members: [
        ['u-hana', 'editor'],
        ['u-omar', 'editor'],
        ['u-priya', 'editor'],
        ['u-alex', 'editor'],
      ],
      sections: [['Backlog'], ['This sprint'], ['In progress', 'doing', 4], ['In review', 'doing', 2], ['Done', 'done']],
      brief:
        'One token system and an accessible component library for every Helix surface — Talent Hub, HR Portal, Spend and Insights.\n\n**Goals**\n- Lock semantic tokens and engineering aliases\n- Migrate the shared UI kit to v4 tokens\n- WCAG 2.2 AA across all components\n\n**Out of scope**\n- Marketing site (see Brand refresh)',
      start: -45,
      due: 28,
      channelId: 'ch-proj-prism',
      keyResultIds: ['kr-prism-adoption', 'kr-a11y-score'],
      createdAgo: 46,
      files: [{ drive: 'df-prism-spec', name: 'Prism v4 Component Spec', kind: 'doc' }],
    }),
    P({
      id: 'prj-mfa',
      key: 'MFA',
      name: 'Passkeys & MFA Rollout',
      icon: 'shield-key',
      color: '#38bdf8',
      department: 'IT & Security',
      ownerId: 'u-layla',
      privacy: 'team',
      status: 'at-risk',
      priority: 'urgent',
      members: [
        ['u-ethan', 'editor'],
        ['u-omar', 'editor'],
        ['u-lucas', 'editor'],
        ['u-sara', 'commenter'],
      ],
      sections: [['Requests'], ['Pilot', 'doing'], ['Rollout waves', 'doing', 3], ['Enforcement'], ['Done', 'done']],
      brief:
        'Phishing-resistant sign-in for every Helix account: passkeys first, hardware keys for privileged roles, and a hard enforcement date.\n\n**Success**\n- 95% of staff enrolled on passkeys\n- Password-reset tickets under 20 a month\n- Zero password-only sign-ins after enforcement',
      start: -30,
      due: 12,
      channelId: 'ch-proj-mfa',
      keyResultIds: ['kr-passkeys-adoption', 'kr-password-resets'],
      createdAgo: 32,
      files: [{ drive: 'df-mfa-plan', name: 'Passkeys & MFA Rollout Plan', kind: 'doc' }],
    }),
    P({
      id: 'prj-gcc',
      key: 'GCC',
      name: 'GCC Enterprise Expansion',
      icon: 'handshake',
      color: '#fb923c',
      department: 'Sales',
      ownerId: 'u-aisha',
      privacy: 'public',
      status: 'at-risk',
      priority: 'high',
      members: [
        ['u-noah', 'editor'],
        ['u-yusuf', 'editor'],
        ['u-sofia', 'editor'],
        ['u-daniel', 'commenter'],
      ],
      sections: [['Pipeline'], ['Proposals', 'doing'], ['Negotiation', 'doing', 3], ['Closed', 'done']],
      brief:
        'Land six flagship enterprise accounts across KSA and Qatar with a localized offer, in-region data residency and a partner channel.\n\n**This quarter**\n- Two signed logos\n- KSA systems-integrator partnership\n- Arabic site and case studies live',
      start: -40,
      due: 50,
      keyResultIds: ['kr-gcc-arr', 'kr-gcc-logos'],
      createdAgo: 42,
      files: [{ drive: 'df-gcc-deck', name: 'GCC Enterprise Expansion Deck', kind: 'slides' }],
    }),
    P({
      id: 'prj-onb-kwame',
      key: 'ONB',
      name: 'Kwame · 30-60-90 Onboarding',
      icon: 'sprout',
      color: '#34d399',
      department: 'People Ops',
      ownerId: 'u-omar',
      privacy: 'team',
      status: 'on-track',
      priority: 'medium',
      members: [
        ['u-kwame', 'editor'],
        ['u-priya', 'editor'],
        ['u-sara', 'commenter'],
      ],
      sections: [['Before day 1'], ['Week 1'], ['Day 30', 'doing'], ['Day 60'], ['Day 90'], ['Done', 'done']],
      brief:
        'Kwame’s first 90 days as Data Engineer — synced with his HR Portal journey, Academy trainings and buddy check-ins with Priya.\n\n**By day 90**\n- Owns the payroll accrual model end-to-end\n- Shadowed a full on-call week\n- Growth plan agreed with Omar',
      start: -26,
      due: 64,
      keyResultIds: ['kr-onboarding-time'],
      createdAgo: 30,
    }),
    P({
      id: 'prj-platform',
      key: 'PLAT',
      name: 'Platform Reliability 2026',
      icon: 'satellite',
      color: '#a78bfa',
      department: 'Engineering',
      ownerId: 'u-omar',
      privacy: 'team',
      status: 'on-track',
      priority: 'high',
      members: [
        ['u-priya', 'editor'],
        ['u-lucas', 'editor'],
        ['u-kwame', 'editor'],
        ['u-ethan', 'editor'],
      ],
      sections: [['Backlog'], ['Next up'], ['In progress', 'doing', 4], ['Verify', 'doing', 2], ['Done', 'done']],
      brief:
        'Make the platform boringly reliable: 99.95% uptime, no more than two P1 incidents a quarter, and calm on-call.\n\n**Workstreams**\n- Postgres 16 + Kubernetes 1.31 upgrades\n- Paging noise and runbooks\n- Multi-region failover game days',
      start: -60,
      due: 55,
      channelId: 'ch-eng-platform',
      keyResultIds: ['kr-uptime', 'kr-p1-incidents'],
      createdAgo: 62,
    }),
    P({
      id: 'prj-brand',
      key: 'BRAND',
      name: 'Brand refresh',
      icon: 'spark',
      color: '#fbbf24',
      department: 'Marketing',
      ownerId: 'u-sofia',
      privacy: 'public',
      status: 'off-track',
      priority: 'medium',
      members: [
        ['u-mei', 'editor'],
        ['u-aisha', 'editor'],
        ['u-hana', 'commenter'],
      ],
      sections: [['Discover'], ['Design', 'doing', 3], ['Review', 'doing'], ['Launched', 'done']],
      brief: 'A sharper Helix identity — logo lockups, voice, motion and photography — launched on stage at the Q4 All-Hands.',
      start: -35,
      due: 20,
      keyResultIds: [],
      createdAgo: 36,
    }),
    P({
      id: 'prj-q4-allhands',
      key: 'AHD',
      name: 'Q4 All-Hands & Demo Day',
      icon: 'megaphone',
      color: '#22d3ee',
      department: 'People Ops',
      ownerId: 'u-sara',
      privacy: 'public',
      status: 'on-track',
      priority: 'medium',
      members: [
        ['u-mateo', 'editor'],
        ['u-fatima', 'editor'],
        ['u-sofia', 'editor'],
        ['u-omar', 'commenter'],
        ['u-mei', 'commenter'],
      ],
      sections: [['Ideas'], ['Planning', 'doing'], ['Confirmed', 'doing'], ['Done', 'done']],
      brief: 'A hybrid All-Hands in Dubai with eight team demos, the FY27 kickoff and the brand launch.',
      start: -14,
      due: 33,
      keyResultIds: [],
      createdAgo: 15,
      files: [{ drive: 'df-allhands-agenda', name: 'Q4 All-Hands Agenda', kind: 'doc' }],
    }),
    P({
      id: 'prj-exec-offsite',
      key: 'EXEC',
      name: 'Exec Offsite · FY27 Strategy',
      icon: 'compass',
      color: '#818cf8',
      department: 'Operations',
      ownerId: 'u-layla',
      privacy: 'private',
      status: 'on-track',
      priority: 'high',
      members: [
        ['u-sara', 'editor'],
        ['u-aisha', 'editor'],
      ],
      sections: [['Prep'], ['Agenda', 'doing'], ['Logistics', 'doing'], ['Done', 'done']],
      brief: 'Two days off-site to set FY27 strategy and org design. Members only — contains compensation and org planning.',
      start: -10,
      due: 24,
      keyResultIds: [],
      createdAgo: 11,
    }),
    P({
      id: 'prj-eucell',
      key: 'EUC',
      name: 'EU-Cell Failover & DR',
      icon: 'cell',
      color: '#2dd4bf',
      department: 'Engineering',
      ownerId: 'u-omar',
      privacy: 'team',
      status: 'complete',
      priority: 'high',
      members: [
        ['u-priya', 'editor'],
        ['u-lucas', 'editor'],
      ],
      sections: [['Design'], ['Build', 'doing'], ['Drills', 'doing'], ['Done', 'done']],
      brief: 'Active-active EU cell with cross-region Postgres failover and a 99.99% availability SLO. Shipped with zero customer impact.',
      start: -120,
      due: -8,
      keyResultIds: ['kr-uptime'],
      createdAgo: 125,
    }),
  ];
  const byId = new Map(projects.map((p) => [p.id, p]));

  /* ───────────────────────── tasks ───────────────────────── */
  const tasks: Task[] = [];
  const T = (projectId: string, s: TaskSpec) => {
    const project = byId.get(projectId)!;
    const section = project.sections.find((x) => x.name === s.section) ?? project.sections[0];
    const number = project.nextNumber++;
    const createdAt = s.createdAgo !== undefined ? ago(s.createdAgo) : ago(20);
    const done = s.doneAgo !== undefined || section.stage === 'done';
    const completedAt = done ? ago(s.doneAgo ?? 3) : undefined;
    const creator = s.creator ?? project.ownerId;
    const assignee = s.assignee ?? null;
    const comments = (s.comments ?? []).map((c) => ({
      id: nid('c'),
      authorId: c.by,
      body: c.body,
      at: hAgo(c.h),
      mentions: c.mentions ?? [],
      reactions: c.react ?? {},
    }));
    const followers = [
      ...new Set([creator, ...(assignee ? [assignee] : []), ...comments.map((c) => c.authorId), ...comments.flatMap((c) => c.mentions), ...(s.followers ?? [])]),
    ];
    const activity = [
      { id: nid('a'), at: createdAt, actorId: creator, text: s.kind === 'approval' ? 'requested approval' : 'created this task' },
      ...(s.activity ?? []).map((a) => ({ id: nid('a'), at: hAgo(a.h), actorId: a.by, text: a.text })),
      ...(completedAt ? [{ id: nid('a'), at: completedAt, actorId: assignee ?? creator, text: 'completed this task' }] : []),
    ].sort((a, b) => a.at - b.at);
    tasks.push({
      id: s.id,
      projectId,
      sectionId: section.id,
      number,
      title: s.title,
      description: s.desc ?? '',
      kind: s.kind ?? 'task',
      priority: s.priority ?? 'medium',
      assigneeId: assignee,
      creatorId: creator,
      followers,
      startDate: s.start !== undefined ? d(s.start) : undefined,
      dueDate: s.due !== undefined ? d(s.due) : undefined,
      dueTime: s.dueTime,
      estimate: s.est,
      tags: s.tags ?? [],
      subtasks: (s.subtasks ?? []).map(([title, isDone]) => ({ id: nid('st'), title, done: isDone })),
      blockedBy: s.blockedBy ?? [],
      attachments: (s.files ?? []).map((f) => file(f, assignee ?? creator, createdAt + HOUR)),
      comments,
      activity,
      approval: s.kind === 'approval' ? { approverId: s.approver ?? assignee ?? project.ownerId, state: s.approval ?? 'pending' } : undefined,
      completedAt,
      completedBy: completedAt ? (assignee ?? creator) : undefined,
      order: number,
      createdAt,
      updatedAt: Math.max(createdAt, completedAt ?? 0, ...comments.map((c) => c.at)),
    });
  };

  // ── Prism v4 ─────────────────────────────────────────────
  T('prj-prism', {
    id: 't-p1',
    title: 'Lock engineering token alias naming',
    section: 'In review',
    assignee: 'u-mei',
    priority: 'high',
    due: 1,
    est: 6,
    tags: ['tokens'],
    desc: 'Agree the engineering-facing alias for every semantic token (e.g. `color.surface.raised` → `--surface-2`) so the UI kit migration can start.\n\nLocking freezes names until v4 GA.',
    subtasks: [
      ['Map semantic tokens to engineering aliases', true],
      ['Review naming with Priya', true],
      ['Engineering sign-off from Omar', false],
    ],
    blockedBy: ['t-p9'],
    createdAgo: 12,
    files: [{ drive: 'df-prism-spec', name: 'Prism v4 Component Spec', kind: 'doc' }],
    comments: [
      { by: 'u-hana', body: 'Dark surfaces look great — only the warning hue needs +4% luminance before we lock.', h: 5, react: { '👍': ['u-mei', 'u-omar'] } },
      { by: 'u-mei', body: '@Omar can you confirm the engineering alias naming before I lock this?', h: 3, mentions: ['u-omar'] },
    ],
    followers: ['u-priya'],
    activity: [{ by: 'u-mei', text: 'moved this to In review', h: 26 }],
  });
  T('prj-prism', {
    id: 't-p2',
    title: 'Migrate Button & Input to v4 tokens',
    section: 'This sprint',
    assignee: 'u-alex',
    priority: 'high',
    start: 1,
    due: 4,
    est: 10,
    tags: ['frontend'],
    desc: 'Replace legacy CSS variables with v4 semantic tokens in the shared UI kit. Starts as soon as alias naming is locked.',
    subtasks: [
      ['Inventory legacy variables', true],
      ['Swap Button tokens', false],
      ['Swap Input & Select tokens', false],
      ['Visual regression pass', false],
    ],
    blockedBy: ['t-p1', 't-p10'],
    createdAgo: 10,
    files: [{ url: 'https://github.com/helix/ui-kit/pull/482', name: 'ui-kit #482 · token map', kind: 'code' }],
    comments: [{ by: 'u-alex', body: 'Inventory done — 212 legacy variables, 38 unused. Ready to swap as soon as names lock.', h: 20 }],
  });
  T('prj-prism', {
    id: 't-p3',
    title: 'Token contrast audit',
    section: 'In progress',
    assignee: 'u-mei',
    priority: 'urgent',
    due: -2,
    est: 6,
    tags: ['a11y'],
    desc: 'Audit every text/surface pair in HR Portal, Talent Hub and Spend against WCAG 2.2 AA and flag failures with suggested token swaps.',
    subtasks: [
      ['HR Portal screens', true],
      ['Talent Hub screens', false],
      ['Spend screens', false],
    ],
    createdAgo: 9,
    files: [{ drive: 'df-prism-tokens', name: 'Prism v4 — Token Sheet', kind: 'sheet' }],
    comments: [
      { by: 'u-omar', body: 'Needed for the passkeys launch banner — can we land this by Thursday?', h: 26 },
      { by: 'u-mei', body: 'Yes — HR Portal is done, Talent Hub tomorrow.', h: 24 },
    ],
    followers: ['u-hana'],
  });
  T('prj-prism', { id: 't-p4', title: 'Navigation rail: responsive breakpoints spec', section: 'In progress', assignee: 'u-hana', priority: 'medium', start: -2, due: 3, est: 8, tags: ['spec'], createdAgo: 8, files: [{ url: 'https://figma.com/file/helix-prism-v4-nav', name: 'Nav rail breakpoints · Figma', kind: 'image' }] });
  T('prj-prism', { id: 't-p5', title: 'Data-viz palette for Payroll & Insights', section: 'This sprint', assignee: 'u-priya', priority: 'medium', due: 6, est: 6, tags: ['dataviz'], blockedBy: ['t-p3'], createdAgo: 7 });
  T('prj-prism', { id: 't-p6', title: 'Storybook docs for v4 primitives', section: 'Backlog', assignee: 'u-alex', priority: 'low', due: 14, est: 8, tags: ['docs'], blockedBy: ['t-p2'], createdAgo: 6 });
  T('prj-prism', { id: 't-p7', title: 'Prism v4 GA across all product surfaces', section: 'Backlog', assignee: 'u-mei', kind: 'milestone', priority: 'high', due: 28, blockedBy: ['t-p6', 't-p8', 't-p12'], createdAgo: 40 });
  T('prj-prism', {
    id: 't-p8',
    title: 'Accessibility sign-off (WCAG 2.2 AA)',
    section: 'Backlog',
    assignee: 'u-omar',
    approver: 'u-omar',
    creator: 'u-mei',
    kind: 'approval',
    priority: 'high',
    due: 21,
    est: 2,
    blockedBy: ['t-p11'],
    desc: 'Sign off that every v4 component meets WCAG 2.2 AA: contrast, focus order, reduced motion and screen-reader labels.',
    createdAgo: 3,
  });
  T('prj-prism', { id: 't-p9', title: 'Typography scale & fluid type', section: 'Done', assignee: 'u-mei', priority: 'medium', est: 6, tags: ['tokens'], doneAgo: 4, createdAgo: 30 });
  T('prj-prism', { id: 't-p10', title: 'Theming API RFC', section: 'Done', assignee: 'u-priya', priority: 'high', est: 8, doneAgo: 10, createdAgo: 34, files: [{ drive: 'df-rfc-theming', name: 'RFC-014 Theming API', kind: 'doc' }] });
  T('prj-prism', { id: 't-p11', title: 'Dark theme parity pass', section: 'This sprint', assignee: 'u-hana', priority: 'medium', due: 10, est: 8, tags: ['tokens'], blockedBy: ['t-p5'], createdAgo: 5 });
  T('prj-prism', { id: 't-p12', title: 'Navigation rail implementation', section: 'Backlog', assignee: 'u-alex', priority: 'medium', due: 18, est: 12, tags: ['frontend'], blockedBy: ['t-p4'], createdAgo: 4 });
  T('prj-prism', { id: 't-p13', title: 'Weekly design crit', section: 'This sprint', assignee: 'u-mei', priority: 'low', due: 1, dueTime: '14:00', est: 1, tags: ['ritual'], createdAgo: 3 });
  T('prj-prism', { id: 't-p14', title: 'Icon set audit & consolidation', section: 'Done', assignee: 'u-hana', priority: 'low', est: 4, doneAgo: 2, createdAgo: 20 });
  T('prj-prism', { id: 't-p15', title: 'Publish Figma library v4.0-beta', section: 'In review', assignee: 'u-hana', priority: 'medium', due: 2, est: 3, blockedBy: ['t-p1'], createdAgo: 6 });
  T('prj-prism', { id: 't-p16', title: 'Motion tokens: easing & duration scale', section: 'In progress', assignee: 'u-priya', priority: 'low', due: 5, est: 4, tags: ['tokens'], createdAgo: 5 });

  // ── Passkeys & MFA ───────────────────────────────────────
  T('prj-mfa', { id: 't-m1', title: 'Pilot: IT & Security + Engineering leads', section: 'Done', assignee: 'u-ethan', priority: 'high', est: 12, doneAgo: 15, createdAgo: 29 });
  T('prj-mfa', {
    id: 't-m2',
    title: 'Wave 1: Dubai office (240 people)',
    section: 'Rollout waves',
    assignee: 'u-ethan',
    priority: 'high',
    start: -7,
    due: 2,
    est: 16,
    blockedBy: ['t-m1'],
    subtasks: [
      ['Helpdesk runbook published', true],
      ['Lunch & learn sessions', true],
      ['Enrolment reminders', false],
    ],
    createdAgo: 20,
    comments: [
      { by: 'u-ethan', body: '68% enrolled. Stragglers are mostly contractors without managed devices.', h: 8 },
      { by: 'u-layla', body: '@Omar can Engineering nudge the remaining 11 in your org this week?', h: 6, mentions: ['u-omar'] },
    ],
  });
  T('prj-mfa', { id: 't-m3', title: 'Wave 2: London, Berlin & remote', section: 'Rollout waves', assignee: 'u-lucas', priority: 'high', start: 3, due: 7, est: 12, blockedBy: ['t-m2'], createdAgo: 18 });
  T('prj-mfa', {
    id: 't-m4',
    title: 'Legacy VPN exception review',
    section: 'Rollout waves',
    assignee: 'u-omar',
    priority: 'urgent',
    due: -1,
    est: 4,
    tags: ['security'],
    desc: '14 service accounts still use password + TOTP. Decide per account: migrate, exempt with an expiry, or retire.',
    subtasks: [
      ['Export service account list', true],
      ['Owner interviews', false],
      ['Decision log', false],
    ],
    creator: 'u-layla',
    createdAgo: 6,
    activity: [{ by: 'u-layla', text: 'assigned this to Omar Khalid', h: 48 }],
  });
  T('prj-mfa', { id: 't-m5', title: 'Enforcement: block password-only sign-in', section: 'Enforcement', assignee: 'u-layla', kind: 'milestone', priority: 'urgent', due: 9, blockedBy: ['t-m3', 't-m4', 't-m6'], createdAgo: 28 });
  T('prj-mfa', {
    id: 't-m6',
    title: 'Approve enforcement exception policy',
    section: 'Enforcement',
    assignee: 'u-layla',
    approver: 'u-layla',
    creator: 'u-ethan',
    kind: 'approval',
    priority: 'high',
    due: 5,
    est: 1,
    desc: '30-day exceptions for field devices without platform authenticators. Exceptions auto-expire and are reviewed weekly.',
    createdAgo: 50 / 60 / 24,
    comments: [{ by: 'u-ethan', body: 'Draft is in the description — 9 field devices in Ops would qualify.', h: 0.8 }],
  });
  T('prj-mfa', { id: 't-m7', title: 'Update Information Security policy v3', section: 'Enforcement', assignee: 'u-sara', priority: 'medium', due: 6, est: 3, creator: 'u-layla', followers: ['u-ethan'], createdAgo: 3 });
  T('prj-mfa', { id: 't-m8', title: 'Request: YubiKeys for Finance signers', section: 'Requests', assignee: 'u-ethan', priority: 'medium', due: 4, est: 2, tags: ['hardware'], desc: 'Submitted by Grace Liu via the IT & Security intake form.', createdAgo: 2 });
  T('prj-mfa', { id: 't-m9', title: 'Post-rollout phishing simulation', section: 'Enforcement', assignee: 'u-ethan', priority: 'low', due: 20, est: 6, blockedBy: ['t-m5'], createdAgo: 12 });
  T('prj-mfa', { id: 't-m10', title: 'Passkey recovery runbook for Helpdesk', section: 'Done', assignee: 'u-ethan', priority: 'medium', est: 5, doneAgo: 6, createdAgo: 16 });
  T('prj-mfa', { id: 't-m11', title: 'Device trust policy for contractors', section: 'Requests', assignee: 'u-layla', priority: 'high', due: 3, est: 5, tags: ['policy'], createdAgo: 4 });

  // ── GCC expansion ────────────────────────────────────────
  T('prj-gcc', { id: 't-g1', title: 'Localized pricing & data-residency offer', section: 'Proposals', assignee: 'u-aisha', priority: 'high', due: 2, est: 10, createdAgo: 25, files: [{ drive: 'df-pricing', name: 'Pricing playbook', kind: 'doc' }] });
  T('prj-gcc', {
    id: 't-g2',
    title: 'Riyadh advisory board follow-ups (6 accounts)',
    section: 'Negotiation',
    assignee: 'u-noah',
    priority: 'urgent',
    due: -3,
    est: 8,
    tags: ['customer'],
    subtasks: [
      ['Al Rajhi', true],
      ['stc', true],
      ['NEOM', false],
      ['Qatar Airways', false],
      ['ADNOC', false],
      ['Aramco Digital', false],
    ],
    createdAgo: 14,
  });
  T('prj-gcc', { id: 't-g3', title: 'Partner channel agreement (KSA SI)', section: 'Negotiation', assignee: 'u-yusuf', priority: 'high', due: 9, est: 6, blockedBy: ['t-g5'], followers: ['u-daniel'], createdAgo: 12 });
  T('prj-gcc', { id: 't-g4', title: 'Arabic marketing site & case studies', section: 'Proposals', assignee: 'u-sofia', priority: 'medium', due: 11, est: 16, tags: ['marketing'], createdAgo: 10 });
  T('prj-gcc', {
    id: 't-g5',
    title: 'Finance review of multi-year discount guardrails',
    section: 'Proposals',
    assignee: 'u-daniel',
    approver: 'u-daniel',
    creator: 'u-aisha',
    kind: 'approval',
    priority: 'high',
    due: 5,
    est: 2,
    desc: 'Guardrails for three-year deals: maximum 18% discount, annual uplift of at least 5%, prepay incentives capped at 6%.',
    createdAgo: 0.4,
    comments: [{ by: 'u-aisha', body: 'Daniel — need your review before the KSA partner call on Monday.', h: 9 }],
  });
  T('prj-gcc', { id: 't-g6', title: 'First GCC enterprise logo signed', section: 'Negotiation', assignee: 'u-noah', kind: 'milestone', priority: 'high', due: 30, blockedBy: ['t-g1', 't-g3'], createdAgo: 38 });
  T('prj-gcc', { id: 't-g7', title: 'Account plans for cohort 1', section: 'Closed', assignee: 'u-noah', priority: 'medium', est: 8, doneAgo: 14, createdAgo: 30 });
  T('prj-gcc', { id: 't-g8', title: 'Qatar partner shortlist', section: 'Pipeline', assignee: 'u-yusuf', priority: 'medium', due: 16, est: 4, createdAgo: 8 });
  T('prj-gcc', { id: 't-g9', title: 'Data-residency FAQ for procurement', section: 'Pipeline', assignee: 'u-aisha', priority: 'low', due: 20, est: 3, blockedBy: ['t-g1'], createdAgo: 6 });
  T('prj-gcc', { id: 't-g10', title: 'Discovery calls: 4 Qatar accounts', section: 'Closed', assignee: 'u-yusuf', priority: 'medium', est: 6, doneAgo: 5, createdAgo: 18 });

  // ── Kwame onboarding ─────────────────────────────────────
  T('prj-onb-kwame', { id: 't-o1', title: 'Laptop, accounts & access provisioned', section: 'Done', assignee: 'u-omar', priority: 'high', doneAgo: 27, createdAgo: 30 });
  T('prj-onb-kwame', { id: 't-o2', title: 'Meet the team & buddy intro with Priya', section: 'Done', assignee: 'u-kwame', priority: 'medium', doneAgo: 25, createdAgo: 30 });
  T('prj-onb-kwame', { id: 't-o3', title: 'Ship a starter task (dbt freshness test)', section: 'Done', assignee: 'u-kwame', priority: 'medium', est: 6, doneAgo: 19, createdAgo: 28 });
  T('prj-onb-kwame', {
    id: 't-o4',
    title: 'Complete required Academy trainings',
    section: 'Day 30',
    assignee: 'u-kwame',
    priority: 'high',
    due: 4,
    est: 4,
    tags: ['learning'],
    desc: 'Secure Engineering, Production Readiness and AI Fundamentals — tracked in Helix Academy.',
    subtasks: [
      ['Secure Engineering', true],
      ['Production Readiness', false],
      ['AI Fundamentals', false],
    ],
    createdAgo: 26,
  });
  T('prj-onb-kwame', { id: 't-o5', title: '30-day check-in with Omar', section: 'Day 30', assignee: 'u-omar', kind: 'milestone', priority: 'medium', due: 4, blockedBy: ['t-o4', 't-o6'], createdAgo: 26 });
  T('prj-onb-kwame', {
    id: 't-o6',
    title: 'Sign IP agreement in HR Portal',
    section: 'Day 30',
    assignee: 'u-kwame',
    priority: 'urgent',
    due: 0,
    est: 1,
    desc: 'Required by day 30. HR Portal → Documents → IP & Confidentiality Agreement.',
    createdAgo: 26,
    followers: ['u-sara'],
    comments: [{ by: 'u-sara', body: 'Reminder: this one is due today 🙏', h: 2 }],
  });
  T('prj-onb-kwame', { id: 't-o7', title: 'Own payroll accrual model end-to-end', section: 'Day 60', assignee: 'u-kwame', priority: 'medium', due: 34, est: 24, blockedBy: ['t-o5'], createdAgo: 26 });
  T('prj-onb-kwame', { id: 't-o8', title: '90-day review & growth plan', section: 'Day 90', assignee: 'u-omar', approver: 'u-omar', creator: 'u-sara', kind: 'approval', priority: 'high', due: 64, blockedBy: ['t-o7'], createdAgo: 26, files: [{ drive: 'df-onboard-plan', name: 'Kwame · 30-60-90 Plan', kind: 'doc' }] });
  T('prj-onb-kwame', { id: 't-o9', title: 'Shadow on-call week with Lucas', section: 'Day 60', assignee: 'u-kwame', priority: 'medium', due: 21, est: 10, blockedBy: ['t-o5'], createdAgo: 20 });

  // ── Platform reliability ─────────────────────────────────
  T('prj-platform', { id: 't-pl1', title: 'SLO dashboards for core APIs', section: 'Done', assignee: 'u-lucas', priority: 'high', est: 10, doneAgo: 20, createdAgo: 58 });
  T('prj-platform', { id: 't-pl2', title: 'Error budget policy v2', section: 'Done', assignee: 'u-omar', priority: 'medium', est: 4, doneAgo: 2, createdAgo: 40 });
  T('prj-platform', { id: 't-pl3', title: 'Postgres 16 upgrade — staging', section: 'Verify', assignee: 'u-priya', priority: 'high', start: -6, due: 1, est: 12, blockedBy: ['t-pl1'], createdAgo: 30 });
  T('prj-platform', { id: 't-pl4', title: 'Postgres 16 upgrade — production', section: 'Next up', assignee: 'u-priya', priority: 'urgent', start: 3, due: 8, est: 16, blockedBy: ['t-pl3', 't-pl6'], createdAgo: 30 });
  T('prj-platform', { id: 't-pl5', title: 'Multi-region failover game day', section: 'Backlog', assignee: 'u-lucas', priority: 'high', start: 12, due: 20, est: 12, blockedBy: ['t-pl4'], createdAgo: 24 });
  T('prj-platform', {
    id: 't-pl6',
    title: 'Approve on-call rotation change',
    section: 'Next up',
    assignee: 'u-omar',
    approver: 'u-omar',
    creator: 'u-lucas',
    kind: 'approval',
    priority: 'high',
    due: 2,
    est: 1,
    desc: 'Move to follow-the-sun: Berlin, Dubai and Toronto on 8-hour shifts — no more overnight pages.',
    createdAgo: 0.25,
    comments: [{ by: 'u-lucas', body: 'Coverage sheet is ready — I’d like to switch from the 15th.', h: 5 }],
  });
  T('prj-platform', {
    id: 't-pl7',
    title: 'Paging noise: cut non-actionable alerts by 40%',
    section: 'In progress',
    assignee: 'u-lucas',
    priority: 'medium',
    start: -5,
    due: 4,
    est: 10,
    subtasks: [
      ['Alert inventory', true],
      ['Delete stale alerts', true],
      ['Route warnings to chat only', false],
    ],
    createdAgo: 14,
  });
  T('prj-platform', { id: 't-pl8', title: 'Kubernetes 1.31 upgrade', section: 'In progress', assignee: 'u-kwame', priority: 'medium', start: -3, due: 6, est: 8, blockedBy: ['t-pl1'], createdAgo: 12 });
  T('prj-platform', { id: 't-pl9', title: 'Incident review automation (Pulse bot)', section: 'Backlog', assignee: 'u-ethan', priority: 'low', due: 25, est: 8, createdAgo: 9 });
  T('prj-platform', { id: 't-pl10', title: 'Capacity plan Q1', section: 'Next up', assignee: 'u-omar', priority: 'medium', due: 7, est: 6, blockedBy: ['t-pl7'], createdAgo: 9 });
  T('prj-platform', { id: 't-pl11', title: 'Runbook audit: top 20 alerts', section: 'In progress', assignee: 'u-priya', priority: 'medium', start: -2, due: 3, est: 6, createdAgo: 8 });
  T('prj-platform', { id: 't-pl12', title: 'P1 retro: checkout latency spike', section: 'Done', assignee: 'u-lucas', priority: 'high', est: 3, doneAgo: 1, createdAgo: 4 });
  T('prj-platform', { id: 't-pl13', title: 'Weekly chaos tests in staging', section: 'Backlog', assignee: 'u-lucas', priority: 'low', due: 30, est: 4, blockedBy: ['t-pl5'], createdAgo: 6 });
  T('prj-platform', { id: 't-pl14', title: '99.95% uptime for the quarter', section: 'Backlog', assignee: 'u-omar', kind: 'milestone', priority: 'high', due: 55, blockedBy: ['t-pl5', 't-pl13', 't-pl10'], createdAgo: 60 });

  // ── Brand refresh ────────────────────────────────────────
  T('prj-brand', { id: 't-b1', title: 'Brand audit & competitor teardown', section: 'Launched', assignee: 'u-sofia', priority: 'medium', est: 8, doneAgo: 21, createdAgo: 34 });
  T('prj-brand', { id: 't-b2', title: 'New logo lockups & clear-space rules', section: 'Design', assignee: 'u-mei', priority: 'high', due: -4, est: 10, tags: ['identity'], creator: 'u-sofia', createdAgo: 18 });
  T('prj-brand', { id: 't-b3', title: 'Agency moodboards, round 2', section: 'Review', assignee: 'u-sofia', priority: 'medium', due: -6, est: 4, createdAgo: 20, comments: [{ by: 'u-sofia', body: 'Agency slipped again — round 2 now lands next week.', h: 48 }] });
  T('prj-brand', { id: 't-b4', title: 'Brand voice & messaging guide', section: 'Design', assignee: 'u-aisha', priority: 'medium', due: 6, est: 8, createdAgo: 15 });
  T('prj-brand', { id: 't-b5', title: 'Website hero & motion concepts', section: 'Discover', assignee: 'u-mei', priority: 'medium', due: 12, est: 12, blockedBy: ['t-b2'], creator: 'u-sofia', createdAgo: 12 });
  T('prj-brand', { id: 't-b6', title: 'Brand launch at the All-Hands', section: 'Discover', assignee: 'u-sofia', kind: 'milestone', priority: 'high', due: 20, blockedBy: ['t-b4', 't-b5'], createdAgo: 30 });
  T('prj-brand', { id: 't-b7', title: 'Photography style guide', section: 'Discover', assignee: 'u-sofia', priority: 'low', due: 15, est: 6, createdAgo: 10 });
  T('prj-brand', { id: 't-b8', title: 'Stakeholder survey synthesis', section: 'Launched', assignee: 'u-sofia', priority: 'medium', est: 5, doneAgo: 12, createdAgo: 28 });

  // ── Q4 All-Hands & Demo Day ──────────────────────────────
  T('prj-q4-allhands', { id: 't-a1', title: 'Confirm venue, dates & budget', section: 'Done', assignee: 'u-mateo', priority: 'high', est: 4, doneAgo: 8, createdAgo: 14 });
  T('prj-q4-allhands', { id: 't-a2', title: 'Demo Day call for demos', section: 'Done', assignee: 'u-sara', priority: 'medium', est: 2, doneAgo: 3, createdAgo: 12 });
  T('prj-q4-allhands', { id: 't-a3', title: 'Shortlist eight demos', section: 'Planning', assignee: 'u-sara', priority: 'high', due: 5, est: 4, blockedBy: ['t-a2'], createdAgo: 10 });
  T('prj-q4-allhands', { id: 't-a4', title: 'Speaker line-up & run of show', section: 'Planning', assignee: 'u-sara', priority: 'high', due: 9, est: 6, blockedBy: ['t-a3'], createdAgo: 10 });
  T('prj-q4-allhands', {
    id: 't-a5',
    title: 'Catering, AV & accessibility checks',
    section: 'Planning',
    assignee: 'u-mateo',
    priority: 'medium',
    due: 12,
    est: 5,
    subtasks: [
      ['Dietary survey', false],
      ['Live captions vendor', false],
      ['Step-free access confirmed', true],
    ],
    createdAgo: 9,
  });
  T('prj-q4-allhands', { id: 't-a6', title: 'Invites, travel guidance & visa letters', section: 'Confirmed', assignee: 'u-fatima', priority: 'high', due: 7, est: 3, createdAgo: 9 });
  T('prj-q4-allhands', { id: 't-a7', title: 'Stage visuals & recap video', section: 'Ideas', assignee: 'u-sofia', priority: 'medium', due: 25, est: 12, blockedBy: ['t-a4'], createdAgo: 7 });
  T('prj-q4-allhands', { id: 't-a8', title: 'Demo Day rehearsal', section: 'Ideas', assignee: 'u-sara', priority: 'medium', due: 31, est: 3, blockedBy: ['t-a4', 't-a5'], createdAgo: 6 });
  T('prj-q4-allhands', { id: 't-a9', title: 'All-Hands & Demo Day', section: 'Ideas', assignee: 'u-sara', kind: 'milestone', priority: 'high', due: 33, blockedBy: ['t-a8', 't-a7'], createdAgo: 14 });
  T('prj-q4-allhands', { id: 't-a10', title: 'Engineering demo: platform reliability wins', section: 'Ideas', assignee: 'u-omar', priority: 'medium', due: 28, est: 4, creator: 'u-sara', createdAgo: 2 });

  // ── Exec offsite (private) ───────────────────────────────
  T('prj-exec-offsite', { id: 't-x1', title: 'FY27 strategy pre-read', section: 'Prep', assignee: 'u-aisha', priority: 'high', due: 10, est: 8, createdAgo: 9 });
  T('prj-exec-offsite', { id: 't-x2', title: 'Board feedback synthesis', section: 'Done', assignee: 'u-layla', priority: 'high', est: 4, doneAgo: 4, createdAgo: 9 });
  T('prj-exec-offsite', { id: 't-x3', title: 'Venue shortlist (Hatta / Ras Al Khaimah)', section: 'Done', assignee: 'u-sara', priority: 'medium', est: 2, doneAgo: 2, createdAgo: 8 });
  T('prj-exec-offsite', { id: 't-x4', title: 'Agenda: day 1 strategy, day 2 org design', section: 'Agenda', assignee: 'u-layla', priority: 'high', due: 8, est: 4, blockedBy: ['t-x2'], createdAgo: 7 });
  T('prj-exec-offsite', { id: 't-x5', title: 'Compensation philosophy draft', section: 'Agenda', assignee: 'u-sara', priority: 'medium', due: 14, est: 6, createdAgo: 7 });
  T('prj-exec-offsite', { id: 't-x6', title: 'Offsite travel & rooms', section: 'Logistics', assignee: 'u-sara', priority: 'medium', due: 12, est: 3, blockedBy: ['t-x3'], createdAgo: 6 });
  T('prj-exec-offsite', { id: 't-x7', title: 'Exec offsite', section: 'Agenda', assignee: 'u-layla', kind: 'milestone', priority: 'high', due: 24, blockedBy: ['t-x1', 't-x4', 't-x5', 't-x6'], createdAgo: 10 });

  // ── EU-Cell (complete) ───────────────────────────────────
  T('prj-eucell', { id: 't-e1', title: 'Cross-region Postgres logical replication', section: 'Done', assignee: 'u-priya', priority: 'high', est: 40, doneAgo: 38, createdAgo: 118 });
  T('prj-eucell', { id: 't-e2', title: 'Chaos drill: region evacuation', section: 'Done', assignee: 'u-lucas', priority: 'high', est: 16, doneAgo: 17, blockedBy: ['t-e1'], createdAgo: 90 });
  T('prj-eucell', { id: 't-e3', title: 'Zero-downtime cutover', section: 'Done', assignee: 'u-priya', kind: 'milestone', priority: 'urgent', doneAgo: 10, blockedBy: ['t-e2'], createdAgo: 110 });
  T('prj-eucell', { id: 't-e4', title: 'Runbook & on-call handover', section: 'Done', assignee: 'u-lucas', priority: 'medium', est: 6, doneAgo: 8, blockedBy: ['t-e3'], createdAgo: 60, files: [{ drive: 'df-dr-runbook', name: 'EU-Cell DR runbook', kind: 'doc' }] });

  // ── Personal tasks (My Work only) ────────────────────────
  let personalSeq = 0;
  const M = (s: { id: string; owner: string; title: string; due?: number; dueTime?: string; est?: number; priority?: Priority; doneAgo?: number; createdAgo?: number }) => {
    personalSeq += 1;
    const createdAt = ago(s.createdAgo ?? 2);
    const completedAt = s.doneAgo !== undefined ? ago(s.doneAgo) : undefined;
    tasks.push({
      id: s.id,
      projectId: null,
      sectionId: null,
      number: personalSeq,
      title: s.title,
      description: '',
      kind: 'task',
      priority: s.priority ?? 'medium',
      assigneeId: s.owner,
      creatorId: s.owner,
      followers: [s.owner],
      dueDate: s.due !== undefined ? d(s.due) : undefined,
      dueTime: s.dueTime,
      estimate: s.est,
      tags: [],
      subtasks: [],
      blockedBy: [],
      attachments: [],
      comments: [],
      activity: [
        { id: nid('a'), at: createdAt, actorId: s.owner, text: 'created this task' },
        ...(completedAt ? [{ id: nid('a'), at: completedAt, actorId: s.owner, text: 'completed this task' }] : []),
      ],
      completedAt,
      completedBy: completedAt ? s.owner : undefined,
      order: personalSeq,
      createdAt,
      updatedAt: completedAt ?? createdAt,
    });
  };
  M({ id: 't-me-1', owner: 'u-omar', title: 'Prep 1:1 notes for Priya', due: 0, dueTime: '16:30', est: 0.5, priority: 'medium' });
  M({ id: 't-me-2', owner: 'u-omar', title: 'Review Q4 headcount plan', due: 1, est: 1.5, priority: 'high' });
  M({ id: 't-me-3', owner: 'u-omar', title: 'Read the Postgres 16 release notes', priority: 'low', est: 1 });
  M({ id: 't-me-4', owner: 'u-omar', title: 'Expense report — Dubai DevCon', doneAgo: 1, est: 0.5, priority: 'low', createdAgo: 4 });
  M({ id: 't-me-5', owner: 'u-mei', title: 'Book flights for the Singapore design summit', due: 3, priority: 'low', est: 0.5 });
  M({ id: 't-me-6', owner: 'u-alex', title: 'Submit October timesheet', due: 1, priority: 'medium', est: 0.5 });
  M({ id: 't-me-7', owner: 'u-layla', title: 'Security insurance questionnaire', due: 2, priority: 'high', est: 2 });
  M({ id: 't-me-8', owner: 'u-kwame', title: 'Set up local dbt profile', doneAgo: 2, priority: 'medium', est: 1, createdAgo: 5 });

  /* ───────────────────────── project activity ───────────────────────── */
  const pAct = (pid: string, by: string, text: string, at: number) => byId.get(pid)!.activity.push({ id: nid('pa'), at, actorId: by, text });
  pAct('prj-prism', 'u-mei', 'linked 2 key results', ago(40));
  pAct('prj-prism', 'u-mei', 'changed Alex Rivera from Viewer to Editor', ago(5));
  pAct('prj-mfa', 'u-layla', 'changed privacy to Department only', ago(30));
  pAct('prj-eucell', 'u-omar', 'marked this project complete', ago(8));
  for (const p of projects) p.activity.sort((a, b) => a.at - b.at);

  /* ───────────────────────── status updates ───────────────────────── */
  const U = (id: string, projectId: string, authorId: string, status: ProjectStatus, title: string, body: string, at: number): StatusUpdate => ({ id, projectId, authorId, status, title, body, at });
  const updates: StatusUpdate[] = [
    U('su-prism-2', 'prj-prism', 'u-mei', 'on-track', 'Sprint 14 underway — tokens lock this week', '**Shipped** — fluid type scale and the icon audit.\n**Next** — lock engineering aliases, then Alex starts the Button & Input migration.\n**Watch** — the contrast audit slipped two days; Talent Hub screens land tomorrow.', ago(2)),
    U('su-prism-1', 'prj-prism', 'u-mei', 'on-track', 'Theming RFC accepted', 'Theming API RFC approved by Engineering. Typography scale in final review. GA still targeted in four weeks.', ago(9)),
    U('su-mfa-2', 'prj-mfa', 'u-layla', 'at-risk', 'Wave 1 at 68% — enforcement date under pressure', '**Good** — pilot finished with zero lockouts.\n**Risk** — contractors without managed devices and 14 legacy VPN service accounts.\n**Ask** — exception policy approval this week; Engineering to nudge 11 people.', ago(1)),
    U('su-mfa-1', 'prj-mfa', 'u-layla', 'on-track', 'Pilot complete: zero lockouts', 'IT & Security and Engineering leads are fully enrolled. Wave 1 (Dubai) starts Monday.', ago(8)),
    U('su-gcc-1', 'prj-gcc', 'u-aisha', 'at-risk', 'Advisory board momentum, follow-ups slipping', 'Two verbal commitments (~$1.1M ARR). Follow-ups are three days late and the partner agreement waits on Finance guardrails.', ago(3)),
    U('su-plat-1', 'prj-platform', 'u-omar', 'on-track', 'Postgres 16 in staging, paging noise down 28%', 'Staging upgrade is in verification. Alert inventory cut 28% of noisy pages so far. Production upgrade window booked for next week.', ago(4)),
    U('su-brand-1', 'prj-brand', 'u-sofia', 'off-track', 'Agency slipped twice — launch date at risk', 'Moodboards round 2 is six days late and logo lockups are blocked on it. Proposing to bring lockups in-house with Mei.', ago(2)),
    U('su-ah-1', 'prj-q4-allhands', 'u-sara', 'on-track', '23 demo submissions — shortlist on Friday', 'Venue and budget confirmed. Call for demos closed with 23 entries; shortlisting eight this week.', ago(1)),
    U('su-onb-1', 'prj-onb-kwame', 'u-omar', 'on-track', 'Starter task shipped in week 3', 'Kwame shipped the dbt freshness test and is halfway through Academy trainings. IP agreement due today.', ago(5)),
    U('su-exec-1', 'prj-exec-offsite', 'u-layla', 'on-track', 'Venue locked, pre-read in progress', 'Hatta shortlisted, board feedback synthesized. Pre-read due in ten days.', ago(3)),
    U('su-eu-1', 'prj-eucell', 'u-omar', 'complete', 'EU-Cell live — 99.995% over 30 days', 'Cutover completed with zero customer impact. Runbooks handed to on-call. Closing the project.', ago(8)),
  ];

  /* ───────────────────────── automations ───────────────────────── */
  const R = (r: Omit<Rule, 'fired'> & { fired?: string[] }): Rule => ({ fired: [], ...r });
  const rules: Rule[] = [
    R({ id: 'r-prism-1', projectId: 'prj-prism', name: 'Share wins in Pulse', enabled: true, trigger: { kind: 'completed' }, conditions: [], actions: [{ kind: 'post', value: 'ch-proj-prism' }], runs: 6, lastRunAt: ago(2), createdBy: 'u-mei', createdAt: ago(40) }),
    R({ id: 'r-prism-2', projectId: 'prj-prism', name: 'Review loop', enabled: true, trigger: { kind: 'moved', sectionId: 'prj-prism-s4' }, conditions: [], actions: [{ kind: 'tag', value: 'in-review' }, { kind: 'notify', value: 'u-mei' }], runs: 9, lastRunAt: hAgo(26), createdBy: 'u-mei', createdAt: ago(38) }),
    R({ id: 'r-mfa-1', projectId: 'prj-mfa', name: 'Urgent work pings Layla', enabled: true, trigger: { kind: 'created' }, conditions: [{ field: 'priority', value: 'urgent' }], actions: [{ kind: 'notify', value: 'u-layla' }], runs: 2, lastRunAt: ago(6), createdBy: 'u-layla', createdAt: ago(28) }),
    R({ id: 'r-mfa-2', projectId: 'prj-mfa', name: 'Heads-up before deadlines', enabled: true, trigger: { kind: 'due-soon', days: 2 }, conditions: [], actions: [{ kind: 'tag', value: 'due-soon' }, { kind: 'notify' }], runs: 4, lastRunAt: ago(1), createdBy: 'u-layla', createdAt: ago(25), fired: ['t-m2'] }),
    R({ id: 'r-plat-1', projectId: 'prj-platform', name: 'Auto-triage new work', enabled: false, trigger: { kind: 'created' }, conditions: [{ field: 'assignee', value: 'none' }], actions: [{ kind: 'assign', value: 'u-lucas' }], runs: 3, lastRunAt: ago(12), createdBy: 'u-omar', createdAt: ago(50) }),
  ];

  /* ───────────────────────── portfolios ───────────────────────── */
  const portfolios: Portfolio[] = [
    { id: 'pf-bets', name: 'Company bets FY26', description: 'The handful of programs leadership reviews every Monday.', ownerId: 'u-layla', color: '#a78bfa', projectIds: ['prj-mfa', 'prj-gcc', 'prj-prism', 'prj-platform', 'prj-brand'], createdAt: ago(50) },
    { id: 'pf-eng', name: 'Platform & reliability', description: 'Engineering-owned programs across security, design systems and DR.', ownerId: 'u-omar', color: '#38bdf8', projectIds: ['prj-platform', 'prj-eucell', 'prj-prism', 'prj-mfa'], createdAt: ago(45) },
    { id: 'pf-people', name: 'People & culture', description: 'Onboarding, events and leadership rituals.', ownerId: 'u-sara', color: '#34d399', projectIds: ['prj-onb-kwame', 'prj-q4-allhands', 'prj-exec-offsite'], createdAt: ago(20) },
  ];

  /* ───────────────────────── inbox ───────────────────────── */
  const I = (id: string, userId: string, kind: InboxItem['kind'], actorId: string, ref: { taskId?: string; projectId?: string }, title: string, body: string | undefined, at: number, read = false): InboxItem => {
    const projectId = ref.projectId ?? tasks.find((t) => t.id === ref.taskId)?.projectId ?? undefined;
    return { id, userId, kind, actorId, taskId: ref.taskId, projectId: projectId ?? undefined, title, body, at, read, archived: false };
  };
  const inbox: InboxItem[] = [
    I('ib-o1', 'u-omar', 'mention', 'u-mei', { taskId: 't-p1' }, 'Mei mentioned you', '@Omar can you confirm the engineering alias naming before I lock this?', hAgo(3)),
    I('ib-o2', 'u-omar', 'approval', 'u-lucas', { taskId: 't-pl6' }, 'Lucas requested your approval', 'Approve on-call rotation change', hAgo(5)),
    I('ib-o3', 'u-omar', 'mention', 'u-layla', { taskId: 't-m2' }, 'Layla mentioned you', '@Omar can Engineering nudge the remaining 11 in your org this week?', hAgo(6)),
    I('ib-o4', 'u-omar', 'comment', 'u-mei', { taskId: 't-p3' }, 'Mei replied', 'Yes — HR Portal is done, Talent Hub tomorrow.', hAgo(24), true),
    I('ib-o5', 'u-omar', 'status', 'u-layla', { projectId: 'prj-mfa' }, 'Passkeys & MFA Rollout is at risk', 'Wave 1 at 68% — enforcement date under pressure', ago(1), true),
    I('ib-o6', 'u-omar', 'assigned', 'u-layla', { taskId: 't-m4' }, 'Layla assigned you a task', 'Legacy VPN exception review', ago(2), true),
    I('ib-o7', 'u-omar', 'approval', 'u-mei', { taskId: 't-p8' }, 'Mei requested your approval', 'Accessibility sign-off (WCAG 2.2 AA)', ago(3), true),
    I('ib-m1', 'u-mei', 'comment', 'u-hana', { taskId: 't-p1' }, 'Hana commented', 'Dark surfaces look great — only the warning hue needs +4% luminance before we lock.', hAgo(5)),
    I('ib-m2', 'u-mei', 'comment', 'u-alex', { taskId: 't-p2' }, 'Alex commented', 'Inventory done — 212 legacy variables, 38 unused.', hAgo(20)),
    I('ib-m3', 'u-mei', 'comment', 'u-omar', { taskId: 't-p3' }, 'Omar commented', 'Needed for the passkeys launch banner — can we land this by Thursday?', hAgo(26), true),
    I('ib-m4', 'u-mei', 'status', 'u-sofia', { projectId: 'prj-brand' }, 'Brand refresh is off track', 'Agency slipped twice — launch date at risk', ago(2), true),
    I('ib-m5', 'u-mei', 'assigned', 'u-sofia', { taskId: 't-b2' }, 'Sofia assigned you a task', 'New logo lockups & clear-space rules', ago(6), true),
    I('ib-l1', 'u-layla', 'approval', 'u-ethan', { taskId: 't-m6' }, 'Ethan requested your approval', 'Approve enforcement exception policy', hAgo(0.8)),
    I('ib-l2', 'u-layla', 'comment', 'u-ethan', { taskId: 't-m2' }, 'Ethan commented', '68% enrolled. Stragglers are mostly contractors without managed devices.', hAgo(8)),
    I('ib-l3', 'u-layla', 'status', 'u-aisha', { projectId: 'prj-gcc' }, 'GCC Enterprise Expansion is at risk', 'Advisory board momentum, follow-ups slipping', ago(3), true),
    I('ib-d1', 'u-daniel', 'approval', 'u-aisha', { taskId: 't-g5' }, 'Aisha requested your approval', 'Finance review of multi-year discount guardrails', hAgo(9)),
    I('ib-k1', 'u-kwame', 'due', 'u-omar', { taskId: 't-o6' }, 'Due today', 'Sign IP agreement in HR Portal', hAgo(2)),
    I('ib-k2', 'u-kwame', 'comment', 'u-sara', { taskId: 't-o6' }, 'Sara commented', 'Reminder: this one is due today 🙏', hAgo(2)),
    I('ib-a1', 'u-alex', 'assigned', 'u-mei', { taskId: 't-p2' }, 'Mei assigned you a task', 'Migrate Button & Input to v4 tokens', ago(4)),
    I('ib-a2', 'u-alex', 'access', 'u-mei', { projectId: 'prj-prism' }, 'Mei made you an editor', 'Prism v4 Design System — you can now edit tasks', ago(5), true),
    I('ib-s1', 'u-sara', 'assigned', 'u-layla', { taskId: 't-m7' }, 'Layla assigned you a task', 'Update Information Security policy v3', ago(3)),
  ];

  /* ───────────────────────── per-person state ───────────────────────── */
  const us = (starred: string[], lastView: UserState['lastView'] = {}): UserState => ({ starred, lastView, sideCollapsed: false, browseMode: 'gallery' });
  const users: Record<string, UserState> = {
    'u-omar': us(['prj-platform', 'prj-mfa', 'prj-prism'], { 'prj-mfa': 'timeline', 'prj-platform': 'board' }),
    'u-mei': us(['prj-prism', 'prj-brand'], { 'prj-prism': 'board' }),
    'u-layla': us(['prj-mfa', 'prj-exec-offsite'], { 'prj-mfa': 'timeline' }),
    'u-alex': us(['prj-prism']),
    'u-kwame': us(['prj-onb-kwame']),
    'u-aisha': us(['prj-gcc']),
    'u-sara': us(['prj-q4-allhands', 'prj-onb-kwame']),
  };

  return { version: PROJECTS_DATA_VERSION, seededAt: now, projects, tasks, updates, rules, inbox, portfolios, users, personalSeq };
}
