import type { PermissionDef } from '@/types';

/**
 * Hub capability permissions. App access permissions (`app:<id>`) are generated
 * from the app catalog — see `appPermissionId` and `buildPermissionCatalog`.
 */
export const HUB_PERMISSIONS: PermissionDef[] = [
  {
    id: 'hub.people.view',
    label: 'View people directory',
    description: 'Browse colleagues, presence and work contact details.',
    category: 'People',
  },
  {
    id: 'hub.people.sensitive',
    label: 'View sensitive employee data',
    description: 'See phone numbers, employee IDs, start dates and birthdays.',
    category: 'People',
    sensitive: true,
  },
  {
    id: 'hub.kudos.give',
    label: 'Give kudos',
    description: 'Send public recognition to colleagues.',
    category: 'People',
  },
  {
    id: 'talent.hire',
    label: 'Hiring manager tools',
    description: 'Raise requisitions, review your candidates, submit scorecards and record hire decisions on your roles.',
    category: 'Talent',
  },
  {
    id: 'talent.manage',
    label: 'Run recruiting',
    description: 'Manage every requisition, move candidates through stages, schedule interviews and draft offers.',
    category: 'Talent',
  },
  {
    id: 'talent.source',
    label: 'AI sourcing & LinkedIn outreach',
    description: 'Decode job descriptions, match the talent pool, search LinkedIn and send AI-drafted outreach.',
    category: 'Talent',
  },
  {
    id: 'talent.comp.view',
    label: 'View compensation',
    description: 'See salary bands, candidate expectations and offer amounts.',
    category: 'Talent',
    sensitive: true,
  },
  {
    id: 'talent.offers.approve',
    label: 'Approve offers',
    description: 'Final People Ops approval on offers. Never on offers you drafted yourself.',
    category: 'Talent',
    sensitive: true,
  },
  {
    id: 'hr.people.manage',
    label: 'Run HR operations',
    description: 'Decide any time-off request, adjust leave balances, confirm benefits, approve claims, issue letters and answer People Ops cases (never your own).',
    category: 'People',
    sensitive: true,
  },
  {
    id: 'hr.onboarding.manage',
    label: 'Manage onboarding',
    description: 'Run HR Portal onboarding journeys and provision NEXUS accounts for new hires.',
    category: 'Talent',
  },
  {
    id: 'academy.manage',
    label: 'Manage Academy & compliance',
    description: 'Author courses, configure onboarding training rules, assign mandatory learning and view company compliance.',
    category: 'People',
  },
  {
    id: 'wiki.write',
    label: 'Author Knowledge Base pages',
    description: 'Create pages, propose edits on locked playbooks, verify freshness and comment in spaces you can read.',
    category: 'Content',
  },
  {
    id: 'wiki.manage',
    label: 'Curate Knowledge Base & governance',
    description: 'Approve proposed edits, lock canonical handbooks, pin guides and manage space governance.',
    category: 'Content',
  },
  {
    id: 'expenses.approve',
    label: 'Approve team travel & expenses',
    description: 'Pre-approve trip requests, issue virtual travel cards and manager-review expense reports (never your own).',
    category: 'Workspace',
  },
  {
    id: 'expenses.audit',
    label: 'Audit expenses & queue for payroll',
    description: 'Verify receipts, GL codes and VAT, queue reimbursements into Payroll Console or send express payouts.',
    category: 'Workspace',
    sensitive: true,
  },
  {
    id: 'payroll.run',
    label: 'Prepare & disburse payroll runs',
    description: 'Build monthly pay runs, reconcile variances, generate UAE WPS .SIF files and disburse payroll.',
    category: 'People',
    sensitive: true,
  },
  {
    id: 'payroll.approve',
    label: 'Counter-sign payroll & bonuses',
    description: 'Four-eyes sign-off on monthly pay runs, bonus awards and salary adjustments (never your own).',
    category: 'People',
    sensitive: true,
  },
  {
    id: 'hub.news.publish',
    label: 'Publish announcements',
    description: 'Post, pin, target and remove company announcements.',
    category: 'Content',
  },
  {
    id: 'hub.analytics.view',
    label: 'View hub analytics',
    description: 'See adoption, access coverage and engagement insights.',
    category: 'Workspace',
  },
  {
    id: 'hub.requests.review',
    label: 'Review access requests',
    description: 'Approve or deny requests — only for access you hold yourself.',
    category: 'Governance',
  },
  {
    id: 'hub.users.manage',
    label: 'Manage users',
    description: 'Assign roles (up to your own clearance), grant/revoke access, deactivate accounts.',
    category: 'Governance',
    sensitive: true,
  },
  {
    id: 'hub.roles.manage',
    label: 'Manage roles & permissions',
    description: 'Create roles and edit the permission matrix.',
    category: 'Governance',
    sensitive: true,
  },
  {
    id: 'hub.apps.manage',
    label: 'Manage app catalog',
    description: 'Register apps, change status, discoverability and URLs.',
    category: 'Governance',
  },
  {
    id: 'hub.audit.view',
    label: 'View audit log',
    description: 'Inspect and export the security audit trail.',
    category: 'Governance',
  },
];

/** Any of these unlocks the Admin "Control Center". */
export const ADMIN_PERMISSIONS = [
  'hub.analytics.view',
  'hub.requests.review',
  'hub.users.manage',
  'hub.roles.manage',
  'hub.apps.manage',
  'hub.audit.view',
] as const;

export const appPermissionId = (appId: string) => `app:${appId}`;
