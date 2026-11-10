import type { AccessRequest, Announcement, AuditEntry, HubNotification, Kudos } from '@/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'a-mfa',
    title: 'Action required: enrol in passkeys/MFA by 15 November',
    body: 'We are moving every account to phishing-resistant sign-in. Enrol a passkey or authenticator in under two minutes from the IT Helpdesk. Accounts without MFA will be paused on 16 November.',
    authorId: 'u-layla',
    createdAt: now - 3 * HOUR,
    priority: 'critical',
    category: 'IT',
    audienceRoleIds: [],
    pinned: true,
    reactions: { '👍': ['u-omar', 'u-sara', 'u-priya'], '🔐': ['u-ethan'] },
  },
  {
    id: 'a-allhands',
    title: 'Q4 All-Hands — Thursday 4:00 PM GST',
    body: 'Join us in the Atrium or on Meet. We will share the 2027 strategy, celebrate this year’s wins and open the floor for an AMA with the leadership team. Submit questions anonymously in Pulse Chat #ask-leadership.',
    authorId: 'u-sara',
    createdAt: now - 9 * HOUR,
    priority: 'important',
    category: 'Events',
    audienceRoleIds: [],
    pinned: false,
    reactions: { '🎉': ['u-mei', 'u-noah', 'u-sofia', 'u-yusuf'], '🚀': ['u-omar'] },
  },
  {
    id: 'a-freeze',
    title: 'Platform freeze: 20–27 November',
    body: 'To protect the year-end release, production deploys are frozen from 20–27 Nov. Hotfixes need an Incident Commander sign-off. Plan your merges accordingly.',
    authorId: 'u-omar',
    createdAt: now - 1 * DAY,
    priority: 'important',
    category: 'Product',
    audienceRoleIds: ['engineering', 'manager'],
    pinned: false,
    reactions: { '👀': ['u-lucas', 'u-priya', 'u-kwame'] },
  },
  {
    id: 'a-academy',
    title: 'Academy 2.0 is live — 400+ new courses',
    body: 'New learning paths in AI Fundamentals, Leadership and Data Literacy. Complete any path before year-end to earn a certification badge on your profile.',
    authorId: 'u-fatima',
    createdAt: now - 2 * DAY,
    priority: 'normal',
    category: 'People',
    audienceRoleIds: [],
    pinned: false,
    reactions: { '❤️': ['u-hana', 'u-mei'], '🚀': ['u-kwame'] },
  },
  {
    id: 'a-benefits',
    title: '2027 benefits open enrolment closes 30 November',
    body: 'Review your medical, dental and wellbeing allowances in the HR Portal. New this year: family-planning support and a higher learning stipend.',
    authorId: 'u-sara',
    createdAt: now - 3 * DAY,
    priority: 'normal',
    category: 'People',
    audienceRoleIds: ['employee'],
    pinned: false,
    reactions: { '👍': ['u-daniel', 'u-grace'] },
  },
  {
    id: 'a-expense',
    title: 'Updated per-diem rates for Q1 travel',
    body: 'Per-diem rates for Dubai, London and Singapore have been updated. Expenses will apply the new rates automatically from 1 January.',
    authorId: 'u-grace',
    createdAt: now - 5 * DAY,
    priority: 'normal',
    category: 'Company',
    audienceRoleIds: ['employee', 'finance'],
    pinned: false,
    reactions: {},
  },
];

export const SEED_REQUESTS: AccessRequest[] = [
  {
    id: 'r-1',
    userId: 'u-daniel',
    appId: 'cloud',
    reason: 'Need read access to billing exports to finish the FinOps cost report for Q4.',
    duration: '7d',
    status: 'pending',
    createdAt: now - 20 * MIN,
  },
  {
    id: 'r-2',
    userId: 'u-mei',
    appId: 'crm',
    reason: 'Reviewing customer feedback tagged “onboarding” for the research synthesis.',
    duration: '30d',
    status: 'pending',
    createdAt: now - 3 * HOUR,
  },
  {
    id: 'r-3',
    userId: 'u-alex',
    appId: 'devhub',
    reason: 'Need repo access to ship the onboarding flow components (ticket FE-482).',
    duration: '90d',
    status: 'pending',
    createdAt: now - 26 * HOUR,
  },
  {
    id: 'r-4',
    userId: 'u-noah',
    appId: 'analytics',
    reason: 'Pipeline dashboards for the enterprise QBR.',
    duration: '30d',
    status: 'denied',
    createdAt: now - 4 * DAY,
    reviewedBy: 'u-aisha',
    reviewedAt: now - 3 * DAY,
    reviewNote: 'Use the shared QBR deck — dashboard access is being consolidated.',
  },
  {
    id: 'r-5',
    userId: 'u-mei',
    appId: 'analytics',
    reason: 'Usability metrics for the onboarding redesign.',
    duration: '7d',
    status: 'approved',
    createdAt: now - 2 * DAY - 2 * HOUR,
    reviewedBy: 'u-omar',
    reviewedAt: now - 2 * DAY,
    grantedDuration: '7d',
  },
];

export const SEED_AUDIT: AuditEntry[] = [
  {
    id: 'au-1',
    at: now - 2 * DAY,
    actorId: 'u-omar',
    action: 'access.request.approved',
    target: 'Mei Tanaka → Insights',
    detail: 'Time-boxed for 7 days',
    outcome: 'success',
    severity: 'info',
  },
  {
    id: 'au-2',
    at: now - 3 * DAY,
    actorId: 'u-aisha',
    action: 'access.request.denied',
    target: 'Noah Kim → Insights',
    detail: 'Use the shared QBR deck',
    outcome: 'success',
    severity: 'info',
  },
  {
    id: 'au-3',
    at: now - 3 * DAY - 4 * HOUR,
    actorId: 'u-layla',
    action: 'role.permission.granted',
    target: 'Manager · Procurement',
    outcome: 'success',
    severity: 'warning',
  },
  {
    id: 'au-4',
    at: now - 4 * DAY,
    actorId: 'u-sara',
    action: 'user.roles.updated',
    target: 'Fatima Zahra',
    detail: 'Added People Ops',
    outcome: 'success',
    severity: 'warning',
  },
  {
    id: 'au-5',
    at: now - 5 * DAY,
    actorId: 'u-sara',
    action: 'user.roles.blocked',
    target: 'Fatima Zahra',
    detail: 'Attempted to assign System Admin (L5) above own clearance (L4)',
    outcome: 'denied',
    severity: 'critical',
  },
  {
    id: 'au-6',
    at: now - 6 * DAY,
    actorId: 'u-layla',
    action: 'user.deactivated',
    target: 'Elena Petrova',
    detail: 'Contract paused',
    outcome: 'success',
    severity: 'warning',
  },
  {
    id: 'au-7',
    at: now - 7 * DAY,
    actorId: 'u-layla',
    action: 'app.updated',
    target: 'Travel',
    detail: 'Status → maintenance',
    outcome: 'success',
    severity: 'info',
  },
];

export const SEED_KUDOS: Kudos[] = [
  {
    id: 'k-1',
    fromId: 'u-omar',
    toId: 'u-priya',
    value: 'craft',
    message: 'The query planner rewrite cut p99 latency by 40%. Absolute wizardry.',
    at: now - 2 * HOUR,
  },
  {
    id: 'k-2',
    fromId: 'u-sara',
    toId: 'u-mateo',
    value: 'ownership',
    message: 'Turned the Atrium into an All-Hands venue in 48 hours. Legend.',
    at: now - 7 * HOUR,
  },
  {
    id: 'k-3',
    fromId: 'u-yusuf',
    toId: 'u-mei',
    value: 'customer',
    message: 'Customers keep praising the new onboarding — thank you for listening to them!',
    at: now - 1 * DAY,
  },
  {
    id: 'k-4',
    fromId: 'u-layla',
    toId: 'u-ethan',
    value: 'innovation',
    message: 'Passkeys rollout plan is world-class. Zero tickets on day one.',
    at: now - 2 * DAY,
  },
];

function n(
  id: string,
  userId: string,
  minutesAgo: number,
  kind: HubNotification['kind'],
  title: string,
  body?: string,
  link?: string,
  read = false,
): HubNotification {
  return { id, userId, at: now - minutesAgo * MIN, kind, title, body, link, read };
}

export const SEED_NOTIFICATIONS: HubNotification[] = [
  // Layla (admin)
  n('n-1', 'u-layla', 20, 'request', 'New access request', 'Daniel Okafor requested Cloud Console for 7 days.', '/admin/requests'),
  n('n-2', 'u-layla', 180, 'request', 'New access request', 'Mei Tanaka requested CRM for 30 days.', '/admin/requests'),
  n('n-3', 'u-layla', 600, 'system', 'Incident Command is degraded', 'Paging latency elevated — vendor investigating.', '/apps'),
  // Sara
  n('n-4', 'u-sara', 45, 'announcement', 'Your post is trending', '“Q4 All-Hands” has 5 reactions.', '/news'),
  n('n-5', 'u-sara', 300, 'kudos', 'Kudos sent to Mateo', 'Your recognition is live on the kudos wall.', '/', true),
  // Omar
  n('n-6', 'u-omar', 26 * 60, 'request', 'New access request', 'Alex Rivera requested DevHub for 90 days.', '/admin/requests'),
  n('n-7', 'u-omar', 120, 'kudos', 'Priya received your kudos', '“The query planner rewrite…”', '/'),
  n('n-8', 'u-omar', 200, 'announcement', 'Critical: enrol in MFA', 'Deadline 15 November.', '/news'),
  // Daniel
  n('n-9', 'u-daniel', 20, 'access', 'Request submitted', 'Cloud Console · awaiting review.', '/settings'),
  n('n-10', 'u-daniel', 200, 'announcement', 'Critical: enrol in MFA', 'Deadline 15 November.', '/news'),
  // Mei
  n('n-11', 'u-mei', 2 * 24 * 60, 'access', 'Access granted: Insights', 'Approved by Omar Khalid · expires in 7 days.', '/apps', true),
  n('n-12', 'u-mei', 24 * 60, 'kudos', 'You received kudos 🎉', 'Yusuf: “Customers keep praising the new onboarding…”', '/'),
  n('n-13', 'u-mei', 180, 'access', 'Request submitted', 'CRM · awaiting review.', '/settings'),
  // Alex
  n('n-14', 'u-alex', 26 * 60, 'access', 'Request submitted', 'DevHub · awaiting review.', '/settings'),
  n('n-15', 'u-alex', 60, 'system', 'Welcome to NEXUS', 'You have contractor access. Request more from any locked tile.', '/apps'),
  ...talentNotifications(),
  ...hrNotifications(),
  ...learningNotifications(),
  ...spendPayrollNotifications(),
  ...workNotifications(),
  ...performanceNotifications(),
];

/** Projects & Drive starter notifications (merged by the v6 migration). */
export function workNotifications(): HubNotification[] {
  return [
    n('n-w1', 'u-mei', 40, 'work', 'Alex requested access to Prism v4 Component Spec', 'Editor access · “Need to add engineering notes for the token migration.”', '/drive/file/df-prism-spec'),
    n('n-w2', 'u-mei', 3 * 60, 'work', 'Omar mentioned you · PRISM-1', '“@Omar can you confirm the engineering alias naming before I lock this?”', '/projects/p/prj-prism?task=t-p1'),
    n('n-w3', 'u-omar', 26 * 60, 'work', 'Token contrast audit is overdue · PRISM-3', 'Mei Tanaka · due 2 days ago · urgent', '/projects/p/prj-prism?task=t-p3'),
    n('n-w4', 'u-omar', 6 * 60, 'work', 'Layla mentioned you · MFA-2', '“@Omar can Engineering nudge the remaining 11 in your org this week?”', '/projects/p/prj-mfa?task=t-m2'),
    n('n-w5', 'u-layla', 50, 'work', 'Approval waiting · MFA-6', 'Ethan raised “Approve enforcement exception policy” · due in 5 days', '/projects/p/prj-mfa?task=t-m6'),
    n('n-w6', 'u-daniel', 9 * 60, 'work', 'Approval waiting · GCC-5', 'Aisha needs Finance review of multi-year discount guardrails', '/projects/p/prj-gcc?task=t-g5'),
    n('n-w7', 'u-kwame', 2 * 60, 'work', 'Due today · ONB-6', 'Sign IP agreement in HR Portal · urgent', '/projects/p/prj-onb-kwame?task=t-o6'),
    n('n-w8', 'u-alex', 2 * 24 * 60, 'work', 'Omar shared “Prism frontend kit” with you', 'Editor access for 45 days · Engineering drive', '/drive/d/drv-eng/fo-prism-fe', true),
  ];
}

/** Performance & OKRs starter notifications (merged by the v7 migration). */
export function performanceNotifications(): HubNotification[] {
  return [
    n('n-pf1', 'u-mei', 90, 'hr', 'Your Q4 check-in is open', 'Self-reflection due in 12 days · Nova can draft it from your quarter’s highlights.', '/performance/checkins'),
    n('n-pf2', 'u-omar', 75, 'hr', '5 quarterly check-ins to review', 'Self-reflections from Mei, Priya, Lucas, Hana and Kwame unlock your manager reviews.', '/performance/team'),
    n('n-pf3', 'u-omar', 4 * 60, 'hr', 'Mei asked for your feedback', 'On “Prism v4 rollout” · due Friday', '/performance/feedback?tab=requests'),
    n('n-pf4', 'u-priya', 3 * 60, 'hr', 'Omar shared feedback with you', '“The query planner rewrite unblocked three teams — thank you.”', '/performance/feedback'),
    n('n-pf5', 'u-sara', 2 * 60, 'hr', 'Q4 2026 check-ins: 68% submitted', 'Calibration opens in 9 days — nudge the remaining participants.', '/performance/cycles'),
    n('n-pf6', 'u-layla', 5 * 60, 'hr', 'Company OKR at risk', '“Make Helix passwordless” is trending behind plan.', '/performance/okrs/obj-co-passwordless'),
    n('n-pf7', 'u-kwame', 30, 'hr', 'Set your first OKRs', 'Draft 2–3 onboarding objectives with Omar before your 30-day check-in.', '/performance/okrs?new=1'),
  ];
}

/** Talent Hub / HR Portal to-dos (also merged into existing workspaces by the v2 migration). */
export function talentNotifications(): HubNotification[] {
  return [
    n('n-t1', 'u-sara', 24 * 60, 'talent', 'Offer awaiting your approval', 'Rania Haddad · Senior Frontend Engineer, hiring manager already approved.', '/talent/offers'),
    n('n-t2', 'u-sara', 6 * 60, 'talent', 'Requisition needs a second approver', 'People Partner: you raised it, so Fatima or Layla must approve.', '/talent/requisitions'),
    n('n-t3', 'u-sara', 2 * 24 * 60, 'talent', 'Offer sent to Amelia Clarke', 'Product Designer, Growth · expires in 5 days.', '/talent/offers', true),
    n('n-t4', 'u-omar', 20 * 60, 'talent', 'Scorecard due: Karim Nasser', 'Frontend architecture interview · yesterday.', '/talent/interviews'),
    n('n-t5', 'u-omar', 3 * 24 * 60, 'talent', 'Decision needed: Arjun Iyer', 'All 5 interview scorecards are in. Record your hire decision.', '/talent/pipeline'),
    n('n-t6', 'u-omar', 6 * 24 * 60, 'talent', 'Salma Darwish accepted 🎉', 'Onboarding handed off to HR Portal · starts in 9 days.', '/hr/onboarding/j-1', true),
    n('n-t7', 'u-mei', 5 * 24 * 60, 'talent', 'You’re an onboarding buddy', 'Omar paired you with Salma Darwish, who starts in 9 days.', '/hr/onboarding/j-1'),
    n('n-t8', 'u-layla', 2 * 24 * 60, 'talent', 'Interview tomorrow: Reem Hamdan', 'Cloud Security Engineer · system design with Lucas.', '/talent/interviews', true),
  ];
}

/** HR Portal to-dos (also merged into existing workspaces by the v3 migration). */
export function hrNotifications(): HubNotification[] {
  return [
    n('n-h1', 'u-omar', 24 * 60, 'hr', 'Mei Tanaka requested time off', 'Annual leave · 5 days · Hana covering', '/hr/approvals'),
    n('n-h2', 'u-omar', 2 * 60, 'hr', 'Lucas Meyer requested time off', 'Work from anywhere · 5 days', '/hr/approvals'),
    n('n-h3', 'u-sara', 24 * 60, 'hr', 'Fatima Zahra requested time off', 'Study & exam leave · 2 days', '/hr/approvals'),
    n('n-h4', 'u-sara', 5 * 60, 'hr', 'Allowance claim to review', 'Mei Tanaka · AED 1,450 · Config conference ticket', '/hr/approvals'),
    n('n-h5', 'u-sara', 9, 'hr', 'New confidential case', 'Open the HR Portal to view it. Details are hidden from notifications.', '/hr/approvals'),
    n('n-h6', 'u-layla', 12 * 60, 'hr', 'Omar Khalid requested time off', 'Annual leave · 4 days · Priya covering', '/hr/approvals'),
    n('n-h7', 'u-mei', 3 * 60, 'hr', 'Updated policy to acknowledge', 'Information Security v3: passkeys become mandatory on 15 November.', '/hr/documents'),
  ];
}

/** Academy & Knowledge Base starter notifications (merged by the v4 migration). */
export function learningNotifications(): HubNotification[] {
  return [
    n('n-l1', 'u-kwame', 90, 'learning', 'Onboarding training due in 4 days', 'Secure Engineering & Production Readiness · completes your 30-day milestone.', '/academy/course/c-eng-sec'),
    n('n-l2', 'u-mei', 4 * 60, 'learning', 'Annual security recertification open', 'Security & Zero-Trust Essentials · 20 mins · includes passkeys scenario.', '/academy/course/c-sec-101'),
    n('n-l3', 'u-sara', 3 * 60, 'learning', 'Change proposal awaiting review', 'Priya Nair proposed an update to the Incident Response & Phishing Runbook.', '/wiki/governance'),
    n('n-l4', 'u-omar', 8 * 60, 'learning', 'Team training reminder', 'Kwame Mensah has 2 Day-30 onboarding courses in progress.', '/academy/manage'),
  ];
}

/** Travel, Expenses & Payroll Console starter notifications (merged by the v5 migration). */
export function spendPayrollNotifications(): HubNotification[] {
  return [
    n('n-sp1', 'u-omar', 55, 'request', 'Travel pre-approval: Mei Tanaka', 'Tokyo · APAC Design Research Sprint · AED 10,890 est.', '/expenses/approvals'),
    n('n-sp2', 'u-omar', 110, 'request', 'Expense report submitted: Kwame Mensah', 'HX-EXP-2026-0103 · Berlin SRE Shadowing · AED 6,379 reimbursable.', '/expenses/approvals'),
    n('n-sp3', 'u-daniel', 35, 'request', 'Finance audit ready: Aisha Rahman', 'HX-EXP-2026-0105 · Riyadh GCC Summit · AED 6,247 ready to queue for payroll.', '/expenses/approvals'),
    n('n-sp4', 'u-sara', 75, 'hr', '2 bonus nominations awaiting sign-off', 'Mei Tanaka (Spot · AED 3,500) & Aisha Rahman (Performance · AED 9,000).', '/payroll/bonuses'),
    n('n-sp5', 'u-priya', 180, 'request', 'Expense report queued for payday 💸', 'HX-EXP-2026-0098 (AED 4,890) verified by Finance and added to this month’s payroll run.', '/expenses/reimbursements'),
  ];
}
