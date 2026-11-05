/**
 * Demo data for Helix Drive: a company library, six team drives with
 * role/department/permission-based membership, personal drives, nested
 * folders with inherited or broken permissions, sensitivity labels with DLP,
 * time-boxed shares, link sharing, versions, comments and pending access
 * requests — relative to "now".
 */
import type { Department } from '@/types';
import { DRIVE_DATA_VERSION, GB, MB } from './constants';
import type { DriveData, DriveItem, DriveRole, DriveShare, FilePreview, ItemKind, LinkAccess, Principal, RetentionPolicy, Sensitivity, SharedDrive } from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface FileSeed {
  id: string;
  driveId: string;
  parentId: string | null;
  kind: ItemKind;
  name: string;
  owner: string;
  size?: number;
  sensitivity?: Sensitivity;
  inherit?: boolean;
  shares?: [Principal, DriveRole, { by?: string; expiresInDays?: number; note?: string }?][];
  link?: LinkAccess;
  linkRole?: DriveItem['linkRole'];
  starredBy?: string[];
  tags?: string[];
  description?: string;
  preview?: FilePreview;
  versions?: [string, number, string?][];
  comments?: [string, string, number, boolean?][];
  modifiedDaysAgo?: number;
  modifiedBy?: string;
  createdDaysAgo?: number;
  locked?: boolean;
  retention?: RetentionPolicy;
  views?: number;
  openedBy?: Record<string, number>;
  trashedDaysAgo?: number;
  trashedBy?: string;
}

export const personalDriveId = (userId: string) => `drv-me-${userId}`;

export function createDriveSeed(now = Date.now()): DriveData {
  const ago = (days: number) => now - days * DAY;
  let shareSeq = 0;
  const share = (principal: Principal, role: DriveRole, by: string, extra: { expiresInDays?: number; note?: string } = {}): DriveShare => ({
    id: `sh-${++shareSeq}`,
    principal,
    role,
    grantedBy: by,
    at: ago(30),
    expiresAt: extra.expiresInDays !== undefined ? now + extra.expiresInDays * DAY : undefined,
    note: extra.note,
  });

  const team = (id: string, name: string, department: Department, o: { description: string; icon: string; color: string; managers: string[]; access: [Principal, DriveRole][]; quotaGb?: number; defaultSensitivity?: Sensitivity; minClearance?: number }): SharedDrive => ({
    id,
    name,
    description: o.description,
    icon: o.icon,
    color: o.color,
    kind: 'team',
    department,
    managerIds: o.managers,
    access: o.access.map(([p, r]) => share(p, r, o.managers[0])),
    quotaBytes: (o.quotaGb ?? 200) * GB,
    defaultSensitivity: o.defaultSensitivity ?? 'internal',
    minClearance: o.minClearance,
    createdAt: ago(400),
  });

  const personal = (userId: string): SharedDrive => ({
    id: personalDriveId(userId),
    name: 'My Drive',
    description: 'Your private space. Share files when you’re ready.',
    icon: '🗂️',
    color: '#60a5fa',
    kind: 'personal',
    ownerId: userId,
    managerIds: [userId],
    access: [],
    quotaBytes: 50 * GB,
    defaultSensitivity: 'internal',
    createdAt: ago(300),
  });

  const drives: SharedDrive[] = [
    {
      id: 'drv-company',
      name: 'Helix Library',
      description: 'Brand assets, templates, policies and all-hands material for everyone.',
      icon: '🏛️',
      color: '#38bdf8',
      kind: 'company',
      managerIds: ['u-layla', 'u-sara'],
      access: [share({ type: 'company' }, 'viewer', 'u-layla'), share({ type: 'role', id: 'people-ops' }, 'editor', 'u-layla'), share({ type: 'department', id: 'Marketing' }, 'editor', 'u-layla')],
      quotaBytes: 500 * GB,
      defaultSensitivity: 'internal',
      createdAt: ago(500),
    },
    team('drv-eng', 'Engineering', 'Engineering', {
      description: 'RFCs, runbooks, postmortems and the Prism frontend kit.',
      icon: '🏗️',
      color: '#a78bfa',
      managers: ['u-omar'],
      access: [
        [{ type: 'department', id: 'Engineering' }, 'editor'],
        [{ type: 'department', id: 'Product' }, 'commenter'],
        [{ type: 'permission', id: 'hub.audit.view' }, 'viewer'],
      ],
      quotaGb: 400,
    }),
    team('drv-design', 'Design', 'Design', {
      description: 'Prism design system, research and product design files.',
      icon: '🎨',
      color: '#f472b6',
      managers: ['u-mei'],
      access: [
        [{ type: 'department', id: 'Design' }, 'editor'],
        [{ type: 'department', id: 'Engineering' }, 'commenter'],
        [{ type: 'department', id: 'Product' }, 'commenter'],
      ],
    }),
    team('drv-people', 'People Ops', 'People Ops', {
      description: 'Contracts, policies, onboarding plans and compensation letters.',
      icon: '🤝',
      color: '#c084fc',
      managers: ['u-sara'],
      access: [[{ type: 'role', id: 'people-ops' }, 'manager']],
      defaultSensitivity: 'confidential',
      minClearance: 2,
    }),
    team('drv-finance', 'Finance', 'Finance', {
      description: 'Close packs, payroll exports, budgets and statutory records.',
      icon: '💸',
      color: '#4ade80',
      managers: ['u-grace'],
      access: [
        [{ type: 'role', id: 'finance' }, 'editor'],
        [{ type: 'permission', id: 'hub.audit.view' }, 'viewer'],
      ],
      defaultSensitivity: 'confidential',
    }),
    team('drv-sales', 'Sales & Success', 'Sales', {
      description: 'Decks, pricing, MSAs and customer success playbooks.',
      icon: '📈',
      color: '#fb923c',
      managers: ['u-aisha'],
      access: [
        [{ type: 'department', id: 'Sales' }, 'editor'],
        [{ type: 'department', id: 'Customer Success' }, 'editor'],
        [{ type: 'department', id: 'Marketing' }, 'commenter'],
        [{ type: 'department', id: 'Product' }, 'commenter'],
      ],
    }),
    team('drv-it', 'IT & Security', 'IT & Security', {
      description: 'Rollout plans, pen-test reports, device inventory and runbooks.',
      icon: '🛡️',
      color: '#2dd4bf',
      managers: ['u-layla'],
      access: [
        [{ type: 'department', id: 'IT & Security' }, 'editor'],
        [{ type: 'role', id: 'engineering' }, 'viewer'],
      ],
      defaultSensitivity: 'confidential',
    }),
    ...['u-layla', 'u-sara', 'u-omar', 'u-daniel', 'u-mei', 'u-alex', 'u-kwame', 'u-grace', 'u-priya', 'u-aisha'].map(personal),
  ];

  const md = (content: string): FilePreview => ({ type: 'markdown', content });
  const table = (rows: string[][]): FilePreview => ({ type: 'table', rows });
  const slides = (titles: string[]): FilePreview => ({ type: 'slides', slides: titles });
  const image = (a: string, b: string): FilePreview => ({ type: 'image', gradient: [a, b] });
  const code = (content: string, language = 'ts'): FilePreview => ({ type: 'code', content, language });

  const items: DriveItem[] = [];
  const F = (s: FileSeed) => {
    const modifiedAt = ago(s.modifiedDaysAgo ?? 7);
    const createdAt = ago(s.createdDaysAgo ?? (s.modifiedDaysAgo ?? 7) + 20);
    const versions = (s.versions ?? [[s.owner, s.size ?? 1 * MB, 'Initial upload']]).map(([by, size, note], i) => ({ id: `${s.id}-v${i + 1}`, version: i + 1, at: createdAt + i * 3 * DAY, by, sizeBytes: size, note }));
    items.push({
      id: s.id,
      driveId: s.driveId,
      parentId: s.parentId,
      kind: s.kind,
      name: s.name,
      sizeBytes: s.kind === 'folder' ? 0 : (s.size ?? 1 * MB),
      ownerId: s.owner,
      createdAt,
      modifiedAt,
      modifiedBy: s.modifiedBy ?? s.owner,
      sensitivity: s.sensitivity ?? 'internal',
      inheritPermissions: s.inherit ?? true,
      shares: (s.shares ?? []).map(([p, r, x]) => share(p, r, x?.by ?? s.owner, { expiresInDays: x?.expiresInDays, note: x?.note })),
      linkAccess: s.link ?? 'restricted',
      linkRole: s.linkRole ?? 'viewer',
      starredBy: s.starredBy ?? [],
      trashed: s.trashedDaysAgo !== undefined,
      trashedAt: s.trashedDaysAgo !== undefined ? ago(s.trashedDaysAgo) : undefined,
      trashedBy: s.trashedBy,
      tags: s.tags ?? [],
      description: s.description,
      preview: s.preview ?? (s.kind === 'folder' ? { type: 'none' } : md(`# ${s.name}\n\nPreview not available for this file type.`)),
      versions,
      comments: (s.comments ?? []).map(([by, body, hoursAgo, resolved], i) => ({ id: `${s.id}-c${i + 1}`, authorId: by, body, at: now - hoursAgo * HOUR, resolved: Boolean(resolved) })),
      activity: [
        { id: `${s.id}-a1`, at: createdAt, actorId: s.owner, action: 'created' },
        ...(s.modifiedBy && s.modifiedBy !== s.owner ? [{ id: `${s.id}-a2`, at: modifiedAt, actorId: s.modifiedBy, action: 'edited' }] : []),
      ],
      locked: s.locked,
      retention: s.retention ?? 'none',
      views: s.views ?? 12,
      openedBy: s.openedBy ?? {},
    });
  };

  // ───────────── Helix Library (company) ─────────────
  F({ id: 'fo-brand', driveId: 'drv-company', parentId: null, kind: 'folder', name: 'Brand & templates', owner: 'u-sofia', sensitivity: 'public', modifiedDaysAgo: 3 });
  F({ id: 'fo-policies', driveId: 'drv-company', parentId: null, kind: 'folder', name: 'Policies & handbook', owner: 'u-sara', modifiedDaysAgo: 9 });
  F({ id: 'fo-allhands', driveId: 'drv-company', parentId: null, kind: 'folder', name: 'All-hands & events', owner: 'u-mateo', modifiedDaysAgo: 2 });
  F({ id: 'df-logo', driveId: 'drv-company', parentId: 'fo-brand', kind: 'image', name: 'Helix logo — primary.png', owner: 'u-sofia', size: 2.4 * MB, sensitivity: 'public', link: 'anyone', preview: image('#38bdf8', '#a78bfa'), views: 412, starredBy: ['u-mei'], tags: ['brand'] });
  F({ id: 'df-brandbook', driveId: 'drv-company', parentId: 'fo-brand', kind: 'pdf', name: 'Helix Brand Book 2026.pdf', owner: 'u-sofia', size: 18.2 * MB, sensitivity: 'public', link: 'company', preview: md('# Helix Brand Book 2026\n\n**Voice:** clear, warm, precise.\n\n## Colour\nPrimary cyan `#38bdf8`, violet `#a78bfa`, ink `#0b1220`.\n\n## Typography\nSpace Grotesk for display, Inter for body, JetBrains Mono for code.\n\n## Logo clear space\nKeep 1× the orb radius around the mark.'), views: 230 });
  F({ id: 'df-deck-template', driveId: 'drv-company', parentId: 'fo-brand', kind: 'slides', name: 'Company deck template.slides', owner: 'u-sofia', size: 6.1 * MB, sensitivity: 'internal', preview: slides(['Title', 'Agenda', 'Section divider', 'Two-column', 'Metrics', 'Thank you']), views: 188 });
  F({ id: 'df-handbook', driveId: 'drv-company', parentId: 'fo-policies', kind: 'pdf', name: 'Employee Handbook v7.pdf', owner: 'u-sara', size: 4.8 * MB, sensitivity: 'internal', locked: true, retention: '7y', preview: md('# Employee Handbook v7\n\n1. Our values\n2. Ways of working\n3. Time off & benefits (see HR Portal)\n4. Information security (passkeys mandatory from 15 Nov)\n5. Expenses & travel (see Spend & Mobility)\n\n_Locked: canonical copy. Propose changes in the Knowledge Base._'), views: 640, versions: [['u-sara', 4.1 * MB, 'v6'], ['u-sara', 4.8 * MB, 'v7 — passkeys policy']] });
  F({ id: 'df-infosec', driveId: 'drv-company', parentId: 'fo-policies', kind: 'doc', name: 'Information Security Policy v3.doc', owner: 'u-layla', size: 0.6 * MB, sensitivity: 'internal', preview: md('# Information Security Policy v3\n\n- Passkeys replace passwords for all staff.\n- Managed devices only for Confidential data.\n- Report phishing within 1 hour via Incident Command.'), views: 301, modifiedDaysAgo: 4 });
  F({ id: 'df-allhands-agenda', driveId: 'drv-company', parentId: 'fo-allhands', kind: 'doc', name: 'Q4 All-Hands Agenda.doc', owner: 'u-mateo', size: 0.3 * MB, sensitivity: 'internal', modifiedBy: 'u-sara', modifiedDaysAgo: 1, preview: md('# Q4 All-Hands · Dubai\n\n**Day 1**\n- 09:00 Welcome & FY26 review (Layla)\n- 10:00 Product keynote: Prism v4 (Mei)\n- 11:30 Four-eyes payroll, zero drama (Daniel)\n- 14:00 Team offsites\n\n**Day 2**\n- 09:30 FY27 kickoff\n- 11:00 Nova Docs in your workflow (Priya)\n- 13:00 Community track & awards'), comments: [['u-sofia', 'Can we add a 10-min brand refresh slot after the keynote?', 20], ['u-mateo', 'Added to day 1 at 10:45 👍', 6, true]], views: 96, starredBy: ['u-mateo', 'u-sara'] });
  F({ id: 'df-offsite-photos', driveId: 'drv-company', parentId: 'fo-allhands', kind: 'image', name: 'Offsite 2025 — team photo.jpg', owner: 'u-mateo', size: 5.5 * MB, sensitivity: 'internal', preview: image('#fbbf24', '#f472b6'), views: 150 });

  // ───────────── Engineering ─────────────
  F({ id: 'fo-rfcs', driveId: 'drv-eng', parentId: null, kind: 'folder', name: 'Architecture & RFCs', owner: 'u-omar', modifiedDaysAgo: 5 });
  F({ id: 'fo-runbooks', driveId: 'drv-eng', parentId: null, kind: 'folder', name: 'Runbooks & postmortems', owner: 'u-lucas', modifiedDaysAgo: 8 });
  F({ id: 'fo-prism-fe', driveId: 'drv-eng', parentId: null, kind: 'folder', name: 'Prism frontend kit', owner: 'u-omar', description: 'Shared with Alex (contractor) for the token migration.', shares: [[{ type: 'user', id: 'u-alex' }, 'editor', { expiresInDays: 45, note: 'Contract ends mid-December' }]], modifiedDaysAgo: 2 });
  F({ id: 'df-rfc-theming', driveId: 'drv-eng', parentId: 'fo-rfcs', kind: 'markdown', name: 'RFC-014 Theming API.md', owner: 'u-priya', size: 0.2 * MB, preview: md('# RFC-014 · Theming API\n\n**Status:** Accepted\n\n## Summary\nExpose semantic tokens via CSS custom properties with `data-theme` and `data-accent` attributes.\n\n## Decision\n- Tokens are the only styling contract between Prism and apps.\n- Light/dark are generated from one source of truth.'), views: 77, modifiedDaysAgo: 10, starredBy: ['u-omar'] });
  F({ id: 'df-dr-runbook', driveId: 'drv-eng', parentId: 'fo-runbooks', kind: 'markdown', name: 'EU-Cell failover runbook.md', owner: 'u-lucas', size: 0.1 * MB, preview: md('# EU-Cell failover\n\n1. Confirm replica lag < 2s\n2. `helix-cli region evacuate eu-west-1 --dry-run`\n3. Promote replica, flip DNS weights 10→50→100\n4. Verify SLO dashboards, page on-call if error rate > 0.5%'), views: 64, modifiedDaysAgo: 8 });
  F({ id: 'df-postmortem', driveId: 'drv-eng', parentId: 'fo-runbooks', kind: 'doc', name: 'Postmortem — 2026-10-03 queue backlog.doc', owner: 'u-lucas', size: 0.4 * MB, preview: md('# Postmortem · Queue backlog\n\n**Impact:** 41 min delayed notifications.\n**Root cause:** consumer autoscaler capped at 4 pods.\n**Actions:** raise cap, add backlog alert (done).'), views: 52, comments: [['u-omar', 'Great write-up. Let’s link this from the incident runbook.', 70, true]] });
  F({ id: 'df-ui-tokens', driveId: 'drv-eng', parentId: 'fo-prism-fe', kind: 'code', name: 'ui-kit-tokens.ts', owner: 'u-alex', size: 0.05 * MB, modifiedDaysAgo: 1, preview: code("export const tokens = {\n  color: {\n    bg: 'var(--bg)',\n    surface: 'var(--surface)',\n    accent: 'var(--accent)',\n  },\n  radius: { sm: 6, md: 10, lg: 16 },\n} as const;"), versions: [['u-alex', 40_000, 'Scaffold'], ['u-alex', 52_000, 'Add radius scale']], views: 18 });

  // ───────────── Design ─────────────
  F({ id: 'fo-prism', driveId: 'drv-design', parentId: null, kind: 'folder', name: 'Prism v4', owner: 'u-mei', modifiedDaysAgo: 1, starredBy: ['u-mei', 'u-hana'] });
  F({ id: 'fo-research', driveId: 'drv-design', parentId: null, kind: 'folder', name: 'User research (recordings)', owner: 'u-hana', sensitivity: 'confidential', inherit: false, shares: [[{ type: 'department', id: 'Design' }, 'editor'], [{ type: 'user', id: 'u-aisha' }, 'viewer']], description: 'Participant recordings — consent limits access to Design + the PM sponsor.', modifiedDaysAgo: 6 });
  F({ id: 'df-prism-tokens', driveId: 'drv-design', parentId: 'fo-prism', kind: 'sheet', name: 'Prism v4 — Token Sheet.sheet', owner: 'u-mei', size: 0.9 * MB, modifiedDaysAgo: 0.2, modifiedBy: 'u-hana', preview: table([['Token', 'Light', 'Dark', 'Contrast'], ['--bg', '#f7f9fc', '#0b1220', '—'], ['--surface', '#ffffff', '#111a2b', '—'], ['--text', '#0b1220', '#e6edf7', '15.2:1'], ['--accent', '#0284c7', '#38bdf8', '4.9:1'], ['--warning', '#b45309', '#fbbf24', '4.6:1 ⚠']]), comments: [['u-hana', 'Warning hue needs +4% luminance in dark to clear AA on surface-2.', 5], ['u-alex', 'Can I get editor on this? I need to add the engineering alias column.', 3]], versions: [['u-mei', 0.6 * MB, 'Initial scale'], ['u-mei', 0.8 * MB, 'Semantic aliases'], ['u-hana', 0.9 * MB, 'Contrast column']], views: 143, starredBy: ['u-mei', 'u-omar'], openedBy: { 'u-mei': 22, 'u-hana': 9, 'u-omar': 4, 'u-priya': 3 } });
  F({ id: 'df-prism-spec', driveId: 'drv-design', parentId: 'fo-prism', kind: 'doc', name: 'Prism v4 Component Spec.doc', owner: 'u-mei', size: 2.2 * MB, modifiedDaysAgo: 2, preview: md('# Prism v4 · Component spec\n\n## Button\n- Sizes: sm / md / lg · min touch target 44px\n- States: default, hover, active, focus-visible, disabled, loading\n\n## Input\n- Label always visible; helper + error text slots\n\n## Navigation rail\n- Collapses to icon rail < 1100px, bottom bar < 640px'), views: 88, openedBy: { 'u-mei': 10, 'u-hana': 6 } });
  F({ id: 'df-prism-moodboard', driveId: 'drv-design', parentId: 'fo-prism', kind: 'image', name: 'Prism v4 moodboard.png', owner: 'u-mei', size: 9.3 * MB, link: 'company', preview: image('#f472b6', '#38bdf8'), views: 210 });
  F({ id: 'df-usability', driveId: 'drv-design', parentId: 'fo-research', kind: 'doc', name: 'Onboarding redesign — usability study.doc', owner: 'u-hana', size: 1.1 * MB, sensitivity: 'confidential', preview: md('# Usability study · Onboarding redesign\n\n6 participants · 45 min sessions\n\n**Top finding:** 5/6 missed the benefits deadline banner.\n**Recommendation:** move deadline into the hero next-steps card (shipped in HR Portal).'), views: 31 });
  F({ id: 'df-session-rec', driveId: 'drv-design', parentId: 'fo-research', kind: 'video', name: 'P3 session recording.mp4', owner: 'u-hana', size: 412 * MB, sensitivity: 'confidential', retention: '1y', views: 9 });

  // ───────────── People Ops ─────────────
  F({ id: 'fo-contracts', driveId: 'drv-people', parentId: null, kind: 'folder', name: 'Offer letters & contracts', owner: 'u-sara', sensitivity: 'restricted', inherit: false, shares: [[{ type: 'user', id: 'u-sara' }, 'manager'], [{ type: 'user', id: 'u-fatima' }, 'editor'], [{ type: 'user', id: 'u-layla' }, 'viewer']], retention: '7y', modifiedDaysAgo: 4 });
  F({ id: 'fo-onboarding', driveId: 'drv-people', parentId: null, kind: 'folder', name: 'Onboarding plans', owner: 'u-sara', sensitivity: 'confidential', modifiedDaysAgo: 2 });
  F({ id: 'fo-policy-drafts', driveId: 'drv-people', parentId: null, kind: 'folder', name: 'Policy drafts', owner: 'u-sara', sensitivity: 'confidential', modifiedDaysAgo: 12 });
  F({ id: 'df-offer-kwame', driveId: 'drv-people', parentId: 'fo-contracts', kind: 'pdf', name: 'Offer — Kwame Mensah (signed).pdf', owner: 'u-sara', size: 0.7 * MB, sensitivity: 'restricted', retention: '7y', preview: md('# Offer letter\n\n**Candidate:** Kwame Mensah\n**Role:** Data Engineer · Engineering\n**Base:** AED 336,000 / year\n**Start:** per HR Portal journey j-2\n\n_Signed electronically._'), views: 6, modifiedDaysAgo: 28 });
  F({ id: 'df-offer-salma', driveId: 'drv-people', parentId: 'fo-contracts', kind: 'pdf', name: 'Offer — Salma Darwish (accepted).pdf', owner: 'u-fatima', size: 0.7 * MB, sensitivity: 'restricted', retention: '7y', preview: md('# Offer letter\n\n**Candidate:** Salma Darwish\n**Role:** Senior Frontend Engineer\n\n_Accepted — onboarding journey j-1 created._'), views: 4, modifiedDaysAgo: 5 });
  F({ id: 'df-onboard-plan', driveId: 'drv-people', parentId: 'fo-onboarding', kind: 'doc', name: 'Kwame · 30-60-90 Plan.doc', owner: 'u-sara', size: 0.3 * MB, sensitivity: 'confidential', shares: [[{ type: 'user', id: 'u-omar' }, 'editor'], [{ type: 'user', id: 'u-kwame' }, 'commenter'], [{ type: 'user', id: 'u-priya' }, 'commenter', { note: 'Buddy' }]], modifiedBy: 'u-omar', modifiedDaysAgo: 2, preview: md('# Kwame Mensah · 30-60-90\n\n**Day 30:** required Academy trainings, starter dbt task shipped ✅, IP agreement signed.\n**Day 60:** own the payroll accrual model end-to-end.\n**Day 90:** growth plan & review with Omar.'), comments: [['u-kwame', 'Starter task shipped — freshness tests are green!', 40, true], ['u-omar', 'Adding the accrual model as the day-60 goal.', 30]], views: 27, openedBy: { 'u-kwame': 7, 'u-omar': 5, 'u-sara': 3 } });
  F({ id: 'df-policy-pto', driveId: 'drv-people', parentId: 'fo-policy-drafts', kind: 'doc', name: 'Draft — Work-from-anywhere policy v2.doc', owner: 'u-sara', size: 0.2 * MB, sensitivity: 'confidential', preview: md('# Work-from-anywhere v2 (draft)\n\n- Up to 30 days/year in approved countries\n- Manager approval in HR Portal\n- Security: managed device + passkeys'), views: 14 });

  // ───────────── Finance ─────────────
  F({ id: 'fo-close', driveId: 'drv-finance', parentId: null, kind: 'folder', name: 'Month-end close', owner: 'u-grace', sensitivity: 'confidential', modifiedDaysAgo: 3 });
  F({ id: 'fo-payroll-exports', driveId: 'drv-finance', parentId: null, kind: 'folder', name: 'Payroll exports', owner: 'u-grace', sensitivity: 'confidential', inherit: false, shares: [[{ type: 'permission', id: 'app:payroll' }, 'editor', { note: 'Anyone with Payroll Console access' }]], description: 'Only people with Payroll Console access can open this folder.', retention: '7y', modifiedDaysAgo: 1 });
  F({ id: 'fo-budgets', driveId: 'drv-finance', parentId: null, kind: 'folder', name: 'Budgets FY27', owner: 'u-daniel', sensitivity: 'confidential', modifiedDaysAgo: 6 });
  F({ id: 'df-close-checklist', driveId: 'drv-finance', parentId: 'fo-close', kind: 'sheet', name: 'Month-End Close Checklist.sheet', owner: 'u-daniel', size: 0.5 * MB, sensitivity: 'confidential', modifiedDaysAgo: 1, preview: table([['Step', 'Owner', 'Day', 'Automated', 'Status'], ['AP/AR cut-off', 'Daniel', 'D0', 'No', 'Done'], ['Bank reconciliation', 'Daniel', 'D1', 'Yes (WPS match)', 'Done'], ['Payroll accruals', 'Kwame', 'D1', 'dbt model', 'In progress'], ['Controller review', 'Grace', 'D2', 'Four-eyes', 'Pending'], ['Management P&L', 'Daniel', 'D3', 'Template', 'Planned']]), comments: [['u-grace', 'Reviewing today — the automated bank match is a big win.', 18]], views: 44, starredBy: ['u-daniel', 'u-grace'], openedBy: { 'u-daniel': 14, 'u-grace': 6, 'u-kwame': 2 } });
  F({ id: 'df-wps-sif', driveId: 'drv-finance', parentId: 'fo-payroll-exports', kind: 'other', name: 'WPS-HX-last-month.sif', owner: 'u-daniel', size: 0.02 * MB, sensitivity: 'confidential', retention: '7y', preview: code('EDR,00000000000034,302620121,AE470260001015884990034,...\nSCR,0000849201441,026,...', 'text'), views: 8, modifiedDaysAgo: 10 });
  F({ id: 'df-payroll-register', driveId: 'drv-finance', parentId: 'fo-payroll-exports', kind: 'sheet', name: 'Payroll register — last month.sheet', owner: 'u-daniel', size: 0.8 * MB, sensitivity: 'confidential', retention: '7y', preview: table([['Employee', 'Dept', 'Net (AED)', 'Bank'], ['Layla Haddad', 'IT & Security', '69,000', 'Emirates NBD'], ['Omar Khalid', 'Engineering', '56,500', 'ADCB'], ['…', '', '', '']]), views: 11, modifiedDaysAgo: 10 });
  F({ id: 'df-exec-comp', driveId: 'drv-finance', parentId: null, kind: 'sheet', name: 'Executive compensation bands.sheet', owner: 'u-grace', size: 0.3 * MB, sensitivity: 'restricted', inherit: false, shares: [[{ type: 'user', id: 'u-layla' }, 'viewer']], retention: 'legal_hold', preview: table([['Band', 'Min', 'Mid', 'Max'], ['M4', '45,000', '58,000', '72,000']]), views: 3, modifiedDaysAgo: 15 });
  F({ id: 'df-budget-fy27', driveId: 'drv-finance', parentId: 'fo-budgets', kind: 'sheet', name: 'FY27 budget model v3.sheet', owner: 'u-daniel', size: 3.1 * MB, sensitivity: 'confidential', preview: table([['Dept', 'FY26', 'FY27 ask', 'Δ'], ['Engineering', '12.4M', '14.1M', '+14%'], ['Sales', '6.2M', '8.0M', '+29%'], ['People Ops', '2.1M', '2.3M', '+10%']]), versions: [['u-daniel', 2.4 * MB, 'v1'], ['u-daniel', 2.9 * MB, 'v2 — GCC uplift'], ['u-grace', 3.1 * MB, 'v3 — controller review']], views: 29, modifiedBy: 'u-grace', modifiedDaysAgo: 6 });

  // ───────────── Sales & Success ─────────────
  F({ id: 'fo-decks', driveId: 'drv-sales', parentId: null, kind: 'folder', name: 'Decks & proposals', owner: 'u-aisha', modifiedDaysAgo: 2 });
  F({ id: 'fo-msas', driveId: 'drv-sales', parentId: null, kind: 'folder', name: 'Signed MSAs', owner: 'u-aisha', sensitivity: 'confidential', inherit: false, shares: [[{ type: 'user', id: 'u-aisha' }, 'manager'], [{ type: 'user', id: 'u-noah' }, 'editor'], [{ type: 'role', id: 'finance' }, 'viewer']], retention: '7y', modifiedDaysAgo: 14 });
  F({ id: 'df-gcc-deck', driveId: 'drv-sales', parentId: 'fo-decks', kind: 'slides', name: 'GCC Enterprise Expansion Deck.slides', owner: 'u-aisha', size: 14.6 * MB, modifiedDaysAgo: 2, modifiedBy: 'u-noah', preview: slides(['GCC enterprise expansion', 'Why now: data residency', 'Localized offer', 'Partner channel (KSA SI)', 'Advisory board outcomes', 'Pricing guardrails', 'Ask']), comments: [['u-daniel', 'Slide 6: multi-year discount needs the Finance guardrail language before external use.', 26], ['u-noah', 'Updated — awaiting your approval in Projects (GCC-5).', 9]], views: 58, starredBy: ['u-aisha', 'u-noah'], openedBy: { 'u-aisha': 11, 'u-noah': 9, 'u-daniel': 2 } });
  F({ id: 'df-pricing', driveId: 'drv-sales', parentId: 'fo-decks', kind: 'doc', name: 'Pricing playbook.doc', owner: 'u-aisha', size: 0.4 * MB, preview: md('# Pricing playbook\n\n- Enterprise: per-seat + platform fee\n- Multi-year: max 12% (Finance approval above)\n- Data residency add-on: +8%'), views: 73 });
  F({ id: 'df-msa-rajhi', driveId: 'drv-sales', parentId: 'fo-msas', kind: 'pdf', name: 'MSA — Al Rajhi (executed).pdf', owner: 'u-noah', size: 1.9 * MB, sensitivity: 'confidential', retention: '7y', views: 7, modifiedDaysAgo: 14 });

  // ───────────── IT & Security ─────────────
  F({ id: 'fo-rollouts', driveId: 'drv-it', parentId: null, kind: 'folder', name: 'Rollouts', owner: 'u-layla', modifiedDaysAgo: 1 });
  F({ id: 'fo-pentest', driveId: 'drv-it', parentId: null, kind: 'folder', name: 'Pen-test reports', owner: 'u-layla', sensitivity: 'restricted', inherit: false, shares: [[{ type: 'user', id: 'u-ethan' }, 'editor']], retention: '7y', modifiedDaysAgo: 20 });
  F({ id: 'df-mfa-plan', driveId: 'drv-it', parentId: 'fo-rollouts', kind: 'doc', name: 'Passkeys & MFA Rollout Plan.doc', owner: 'u-layla', size: 0.6 * MB, sensitivity: 'internal', shares: [[{ type: 'user', id: 'u-omar' }, 'editor'], [{ type: 'user', id: 'u-sara' }, 'commenter']], modifiedBy: 'u-ethan', modifiedDaysAgo: 1, preview: md('# Passkeys & MFA rollout\n\n**Enforcement:** 15 November\n\n| Wave | Scope | Status |\n|---|---|---|\n| Pilot | IT & Eng leads | ✅ 100% |\n| 1 | Dubai office | 68% |\n| 2 | London, Berlin, remote | Planned |\n\n**Exceptions:** 14 legacy VPN service accounts — decision needed (MFA-4).'), comments: [['u-omar', 'Engineering will nudge the remaining 11 this week.', 5]], views: 120, starredBy: ['u-layla', 'u-ethan'], openedBy: { 'u-layla': 16, 'u-ethan': 12, 'u-omar': 5 } });
  F({ id: 'df-device-inv', driveId: 'drv-it', parentId: 'fo-rollouts', kind: 'sheet', name: 'Managed device inventory.sheet', owner: 'u-ethan', size: 1.2 * MB, sensitivity: 'confidential', preview: table([['Owner', 'Device', 'OS', 'Passkey', 'Compliant'], ['Mei Tanaka', 'MacBook Pro 14', 'macOS 15', 'Yes', '✅'], ['Alex Rivera', 'Personal laptop', 'Windows 11', 'No', '⚠️']]), views: 34 });
  F({ id: 'df-pentest-q3', driveId: 'drv-it', parentId: 'fo-pentest', kind: 'pdf', name: 'External pen-test Q3 — findings.pdf', owner: 'u-layla', size: 3.4 * MB, sensitivity: 'restricted', retention: '7y', preview: md('# Pen-test Q3\n\n2 high (fixed), 5 medium (3 fixed), 9 low.'), views: 5, modifiedDaysAgo: 20 });

  // ───────────── Personal drives ─────────────
  F({ id: 'df-mei-sketches', driveId: personalDriveId('u-mei'), parentId: null, kind: 'image', name: 'Nav rail sketches.png', owner: 'u-mei', size: 3.2 * MB, preview: image('#f472b6', '#fbbf24'), views: 3, modifiedDaysAgo: 1 });
  F({ id: 'df-mei-notes', driveId: personalDriveId('u-mei'), parentId: null, kind: 'doc', name: '1:1 notes with Omar.doc', owner: 'u-mei', size: 0.1 * MB, sensitivity: 'confidential', shares: [[{ type: 'user', id: 'u-omar' }, 'commenter']], preview: md('# 1:1 notes\n\n- Prism GA risks: contrast audit, Alex capacity\n- Growth: lead design for Spend & Mobility v2'), views: 4, modifiedDaysAgo: 3 });
  F({ id: 'df-daniel-notes', driveId: personalDriveId('u-daniel'), parentId: null, kind: 'doc', name: 'Close automation notes.doc', owner: 'u-daniel', size: 0.1 * MB, shares: [[{ type: 'user', id: 'u-grace' }, 'editor']], preview: md('# Close automation\n\n- WPS ↔ bank statement match: 100% last run\n- Next: T&E card feed'), views: 6, modifiedDaysAgo: 2 });
  F({ id: 'df-alex-timesheet', driveId: personalDriveId('u-alex'), parentId: null, kind: 'sheet', name: 'Timesheet — November.sheet', owner: 'u-alex', size: 0.1 * MB, shares: [[{ type: 'user', id: 'u-omar' }, 'viewer']], preview: table([['Week', 'Hours', 'Project'], ['W45', '38', 'Prism v4'], ['W46', '—', '']]), views: 2, modifiedDaysAgo: 1 });
  F({ id: 'df-omar-roadmap', driveId: personalDriveId('u-omar'), parentId: null, kind: 'slides', name: 'Platform roadmap H1 (draft).slides', owner: 'u-omar', size: 4.4 * MB, sensitivity: 'confidential', preview: slides(['Platform H1', 'EU-Cell learnings', 'Prism v4 rollout', 'Data platform', 'Hiring']), views: 5, modifiedDaysAgo: 4 });
  F({ id: 'df-omar-old', driveId: personalDriveId('u-omar'), parentId: null, kind: 'doc', name: 'Old sprint notes (archive).doc', owner: 'u-omar', size: 0.2 * MB, preview: md('# Sprint notes (old)'), views: 1, modifiedDaysAgo: 60, trashedDaysAgo: 6, trashedBy: 'u-omar' });
  F({ id: 'df-kwame-learning', driveId: personalDriveId('u-kwame'), parentId: null, kind: 'markdown', name: 'Learning log.md', owner: 'u-kwame', size: 0.02 * MB, preview: md('# Learning log\n\n- Week 1: Helix data platform tour\n- Week 3: Secure Engineering course (Academy)\n- Week 4: dbt accrual model kickoff'), views: 4, modifiedDaysAgo: 1 });

  const requests: DriveData['requests'] = [
    { id: 'dar-1', itemId: 'df-prism-spec', requesterId: 'u-alex', role: 'editor', message: 'Need to add engineering notes to the Button & Input sections for the token migration.', status: 'pending', createdAt: now - 3 * HOUR },
    { id: 'dar-2', itemId: 'df-mfa-plan', requesterId: 'u-kwame', role: 'viewer', message: 'Preparing the data-platform wave — want to align dates.', status: 'pending', createdAt: now - 26 * HOUR },
    { id: 'dar-3', itemId: 'df-budget-fy27', requesterId: 'u-aisha', role: 'commenter', message: 'GCC uplift assumptions review.', status: 'approved', decidedBy: 'u-grace', decidedAt: ago(4), createdAt: ago(5) },
  ];

  const recents: DriveData['recents'] = {
    'u-mei': [{ itemId: 'df-prism-tokens', at: now - 2 * HOUR }, { itemId: 'df-prism-spec', at: ago(1) }, { itemId: 'df-mei-sketches', at: ago(1) }],
    'u-omar': [{ itemId: 'df-mfa-plan', at: now - 4 * HOUR }, { itemId: 'df-onboard-plan', at: ago(1) }, { itemId: 'df-rfc-theming', at: ago(2) }],
    'u-daniel': [{ itemId: 'df-close-checklist', at: now - 1 * HOUR }, { itemId: 'df-payroll-register', at: ago(1) }, { itemId: 'df-gcc-deck', at: ago(2) }],
    'u-layla': [{ itemId: 'df-mfa-plan', at: now - 1 * HOUR }, { itemId: 'df-device-inv', at: ago(1) }],
    'u-sara': [{ itemId: 'df-allhands-agenda', at: now - 3 * HOUR }, { itemId: 'df-onboard-plan', at: ago(1) }, { itemId: 'df-handbook', at: ago(3) }],
    'u-alex': [{ itemId: 'df-ui-tokens', at: now - 1 * HOUR }, { itemId: 'df-logo', at: ago(2) }],
    'u-kwame': [{ itemId: 'df-onboard-plan', at: ago(1) }, { itemId: 'df-kwame-learning', at: now - 5 * HOUR }],
  };

  return { version: DRIVE_DATA_VERSION, drives, items, requests, recents };
}
