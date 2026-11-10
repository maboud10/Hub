/**
 * Helix Drive demo seed — generated relative to `now` so "2h ago", "expires in 45d" and
 * "older than 90 days" stay meaningful. IDs referenced by other code (keep exactly):
 *   drives  drv-company drv-eng drv-design drv-people drv-fin drv-sec drv-sales · my-<userId>
 *   items   df-prism-spec (u-mei, Design, Internal; u-alex has a pending editor request)
 *           fo-prism-fe   (drv-eng; shared by u-omar with u-alex as editor for 45 days)
 */
import type { Department } from '@/types';
import { SEED_USERS } from '@/data/users';
import type { AccessRequest, Activity, Content, Drive, DriveData, Hold, Item, ItemKind, Level, LinkSetting, Principal, Sensitivity, Share, Slide, Thread, Version } from './types';
import { DAY, HOUR, defaultPolicy, hashStr } from './meta';

export const DRIVE_DATA_VERSION = 3;
export const personalDriveId = (userId: string) => `my-${userId}`;

const MB = 1024 * 1024;
const KB = 1024;

/* ------------------------------------------------------------------ */
/* Long-form content                                                   */
/* ------------------------------------------------------------------ */

const PRISM_SECTIONS = [
  `# Prism v4 Component Spec

Owner: **Mei Tanaka** · Status: In review · Reviewers: Hana Park, Omar Khalid, Aisha Bello

> Prism v4 is the single source of truth for how Helix products look and behave — web, iOS and Android.

## Goals
- One token source for web, iOS and Android
- AA contrast in both themes, AAA for body text
- Ship 14 core components by end of quarter
- Zero hard-coded colours in product code`,
  `## Tokens
Prism v4 moves from 212 hard-coded colours to **48 semantic tokens**. Components read tokens only — never raw hex.

| Token | Dark | Light | Usage |
| surface/1 | #0B1020 | #FFFFFF | App background |
| surface/2 | #121833 | #F6F7FB | Cards, sheets |
| ink/1 | #E9ECF8 | #0B1020 | Primary text |
| plasma/1 | #FBBF24 | #B45309 | Focus, selection, primary CTA |
| danger/1 | #FB7185 | #BE123C | Destructive actions |`,
  `## Components
1. Button — primary, soft, ghost, danger; 3 sizes; loading state
2. Input — text, search, number; inline validation
3. Select & Combobox — async options, multi-select chips
4. Date picker — range + presets
5. Tabs — sliding ink indicator
6. Toast — success, error, undo action

### Button
- Height 38 (md), 32 (sm), 46 (lg); radius 12
- Primary uses the plasma gradient with a 700ms sheen on hover
- Loading replaces the label with a 3-dot indicator; width never changes`,
  `## Accessibility
- [x] Contrast pairs verified for all 48 tokens
- [x] Focus ring: 3px plasma with 1px inner offset (updated after review)
- [ ] Screen-reader sweep on Select and Date picker
- [ ] Reduced-motion variants for every transition`,
  `## Motion
Durations: **120ms** (fast), **200ms** (base), **320ms** (slow). Easing: \`cubic-bezier(.2,.8,.2,1)\`.
Nothing animates longer than 480ms. Respect *prefers-reduced-motion* everywhere.`,
  `## Decisions
- Tokens are generated from \`tokens.json\` — designers never hand-edit platform files
- Dark theme is the default; light theme ships at parity, not later
- Icons: Lucide, 1.75px stroke, 16/20/24 sizes only`,
  `## Appendix — token migration
Engineering notes for migrating the frontend kit live here. Pending: mapping table from v3 colours to v4 tokens (Alex Rivera).`,
];

const RFC_TEXT = `# RFC-0042: Global rate limiting

Author: **Priya Raman** · Reviewers: Lucas Meyer, Omar Khalid · Status: Approved

## Summary
Introduce a tenant-aware, globally consistent rate limiter in front of the public API, replacing three per-service limiters.

## Motivation
- Sep 17 latency spike: one tenant's batch job consumed 41% of API capacity
- Three limiters disagree; customers see inconsistent 429s
- No per-tenant visibility for Customer Success

## Design
1. Token bucket per tenant × endpoint class (read, write, bulk)
2. Buckets are CRDT counters replicated across regions
3. Limits live in config; hot-reloaded within 10s
4. Every 429 carries \`Retry-After\` and a docs link

## Failure modes
- Regional failover: worst case 2× burst for ~30s while counters converge
- Config store down: last known limits stay in effect

## Rollout
- [x] Shadow mode in staging
- [x] Shadow mode in production (2 weeks)
- [ ] Enforce for bulk endpoints
- [ ] Enforce for all endpoints`;

const MIGRATION_TEXT = `# Token migration plan

Owner: **Omar Khalid** · Contributors: Alex Rivera, Priya Raman

## Scope
Migrate the Prism frontend kit from v3 colours to v4 semantic tokens without visual regressions.

## Plan
1. Generate \`tokens.json\` from the Design source of truth
2. Codemod hard-coded hex values to tokens (212 → 48)
3. Visual regression run on 340 Storybook stories
4. Ship behind \`prism-v4\` flag, then remove v3

## Risks
- Third-party widgets with inline styles
- Charts use their own palette — needs a mapping

## Status
- [x] Token generator
- [x] Codemod dry run — 1,846 replacements
- [ ] Accessibility audit sign-off
- [ ] Remove v3 palette`;

const HANDBOOK_TEXT = `# Helix Employee Handbook 2026

Welcome to Helix. This handbook explains how we work, what you can expect from us, and what we expect from each other.

## How we work
- Default to open: share early, write things down, decide in the open
- Async first: meetings need an agenda and an owner
- Customers feel every decision — design for them

## Time off
- 25 days annual leave plus public holidays in your location
- **16 weeks** fully paid parental leave from January 2026
- Wellness days: 4 per year, no questions asked

## Working hours & locations
Core collaboration hours are 10:00–15:00 in your local time zone. Hubs: Dubai, London, Singapore, Bengaluru, Berlin.

## Security basics
- MFA on every account — no exceptions
- Label documents before sharing; Confidential stays need-to-know
- Report anything suspicious in IT Helpdesk within an hour`;

const PM_SSO_TEXT = `# Postmortem — SSO outage (Nov 2)

Severity: **SEV-1** · Duration: 47 minutes · Incident lead: Ethan Brooks

## Impact
Employees could not sign in to NEXUS, Pulse Chat and Drive between 09:12 and 09:59 GST. Existing sessions were unaffected.

## Timeline
- 09:12 IdP certificate rotation completes; SAML assertions start failing
- 09:18 Alert fires: sign-in error rate 92%
- 09:31 Root cause identified: SCIM retry storm saturating the IdP
- 09:59 Old certificate re-pinned; sign-ins recover

## Root cause
Certificate rotation triggered a full SCIM resync. Retries had no jitter and overwhelmed the identity provider.

## Action items
1. Add jitter + backoff to SCIM retries — Ethan Brooks — Nov 20
2. Stage certificate rotations with a 24h overlap — Layla Haddad — Nov 15
3. Synthetic sign-in probe every minute from 3 regions — Lucas Meyer — Nov 12`;

const ONBOARDING_ENG_TEXT = `# Engineering onboarding — first 30 days

## Week 1
- Laptop, MFA and access requests (Helpdesk handles most of it)
- Read the Platform architecture overview and RFC-0042
- Pair with your onboarding buddy on one small change

## Week 2–3
- Own a starter ticket end-to-end, including the deploy
- Shadow one on-call shift

## Week 4
- Present what you learned in the Friday demo
- Write down one thing we should improve in this guide`;

const SEC_REVIEW_TEXT = `# Prism security review

Classification: **Confidential** · Reviewer: Ethan Brooks

## Findings
1. Rich text component allowed \`javascript:\` URLs in links — fixed in 4.0.2
2. Tooltip rendered unsanitised HTML from props — **open**
3. File picker exposes full local paths in error messages — open

## Next steps
Fix #2 before the v4 GA. Do not share outside the Prism core team until resolved.`;

const OFFER_TEXT = `# Offer of employment — Data Engineer

Candidate: **Kwame Mensah** · Location: Accra (remote) · Start date: see HR Portal

## Compensation
- Base salary: USD 96,000 per year
- Sign-on bonus: USD 8,000
- Equity: 2,400 RSUs vesting over 4 years

## Benefits
Private health cover, 25 days annual leave, learning budget USD 2,000.

> This offer is confidential and intended only for the named candidate.`;

const AUP_TEXT = `# Acceptable Use Policy

Applies to every Helix employee, contractor and partner using company systems.

## You must
- Use MFA on every Helix account
- Store company data only in approved tools (Drive, Pulse Chat, Projects)
- Label files with the right sensitivity before sharing

## You must not
- Share Confidential or Restricted files with personal accounts
- Install unapproved browser extensions on company devices
- Disable endpoint protection

## Reporting
Report lost devices or suspected phishing in IT Helpdesk immediately.`;

const MEI_NOTES = `# 1:1 notes — Omar

## This week
- Prism v4 review went well; Aisha worried about the 14-component scope
- Want to pair Alex with Priya on the token migration

## Career
- Interested in leading the design system guild next half
- Ask about the Copenhagen design conference budget`;

const ALEX_NOTES = `# Prism migration notes

- Codemod handles 1,846 replacements; 23 need manual review
- Charts palette mapping drafted in the a11y sheet
- Need edit access to the Prism spec to add the appendix`;

const BUTTON_TSX = `import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../utils/cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/** Prism v4 button — reads semantic tokens only. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx('prism-btn', \`prism-btn--\${variant}\`, \`prism-btn--\${size}\`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size} /> : children}
    </button>
  );
});`;

const TOKENS_JSON = `{
  "$schema": "https://prism.helix.co/tokens.schema.json",
  "version": "4.0.0",
  "color": {
    "surface": { "1": { "dark": "#0B1020", "light": "#FFFFFF" }, "2": { "dark": "#121833", "light": "#F6F7FB" } },
    "ink": { "1": { "dark": "#E9ECF8", "light": "#0B1020" }, "2": { "dark": "#AEB6D6", "light": "#3B4566" } },
    "plasma": { "1": { "dark": "#FBBF24", "light": "#B45309" }, "2": { "dark": "#F97316", "light": "#C2410C" } },
    "danger": { "1": { "dark": "#FB7185", "light": "#BE123C" } }
  },
  "radius": { "sm": 8, "md": 12, "lg": 18 },
  "motion": { "fast": 120, "base": 200, "slow": 320 }
}`;

const README_MD = `# Prism frontend kit

React components for Prism v4. Every component reads semantic tokens from \`tokens.json\`.

## Getting started
\`\`\`
pnpm install
pnpm storybook
\`\`\`

## Contributing
- One component per folder, with stories and tests
- Run \`pnpm test:a11y\` before opening a PR
- Never hard-code colours — add a token instead`;

const DEPLOY_SH = `#!/usr/bin/env bash
# Platform deploy — canary first, then progressive rollout.
set -euo pipefail

SERVICE="\${1:?usage: deploy.sh <service> <version>}"
VERSION="\${2:?usage: deploy.sh <service> <version>}"

echo "Deploying \${SERVICE}@\${VERSION} to canary"
kubectl -n platform set image deploy/"\${SERVICE}" app="registry.helix.co/\${SERVICE}:\${VERSION}"
kubectl -n platform rollout status deploy/"\${SERVICE}" --timeout=300s

for pct in 10 25 50 100; do
  echo "Shifting \${pct}% of traffic"
  ./scripts/shift-traffic.sh "\${SERVICE}" "\${pct}"
  sleep 120
done
echo "Done"`;

/* ------------------------------------------------------------------ */
/* Sheets & decks                                                      */
/* ------------------------------------------------------------------ */

const BUDGET_ROWS: string[][] = [
  ['Cost center', 'Q1', 'Q2', 'Q3', 'Q4', 'FY2027', 'FY2026', 'Δ %'],
  ['Engineering', '1240000', '1265000', '1410000', '1330000', '=SUM(B2:E2)', '4720000', '=ROUND((F2-G2)/G2*100,1)'],
  ['Design', '310000', '315000', '322000', '330000', '=SUM(B3:E3)', '1180000', '=ROUND((F3-G3)/G3*100,1)'],
  ['Product', '280000', '284000', '290000', '296000', '=SUM(B4:E4)', '1090000', '=ROUND((F4-G4)/G4*100,1)'],
  ['Sales', '520000', '560000', '590000', '640000', '=SUM(B5:E5)', '2050000', '=ROUND((F5-G5)/G5*100,1)'],
  ['Customer Success', '210000', '214000', '220000', '226000', '=SUM(B6:E6)', '820000', '=ROUND((F6-G6)/G6*100,1)'],
  ['People Ops', '180000', '182000', '185000', '190000', '=SUM(B7:E7)', '700000', '=ROUND((F7-G7)/G7*100,1)'],
  ['IT & Security', '260000', '262000', '268000', '275000', '=SUM(B8:E8)', '990000', '=ROUND((F8-G8)/G8*100,1)'],
  ['Operations', '150000', '152000', '155000', '158000', '=SUM(B9:E9)', '600000', '=ROUND((F9-G9)/G9*100,1)'],
  ['Total', '=SUM(B2:B9)', '=SUM(C2:C9)', '=SUM(D2:D9)', '=SUM(E2:E9)', '=SUM(F2:F9)', '=SUM(G2:G9)', '=ROUND((F10-G10)/G10*100,1)'],
];

function payrollRows(month: number): string[][] {
  const rows: string[][] = [['Employee ID', 'Name', 'Department', 'Base (AED)', 'Allowances', 'Deductions', 'Net pay', 'Bank']];
  SEED_USERS.filter((u) => u.active && !u.roleIds.includes('contractor')).forEach((u, i) => {
    const h = hashStr(u.id);
    const base = 18000 + (h % 40) * 1000;
    const allow = 2500 + (h % 9) * 250 + month * 10;
    const ded = 600 + (h % 5) * 120;
    rows.push([u.employeeId, u.name, u.department, String(base), String(allow), String(ded), `=D${i + 2}+E${i + 2}-F${i + 2}`, `AE•• •••• ${String(1000 + (h % 9000))}`]);
  });
  const n = rows.length;
  rows.push(['', 'Total', '', `=SUM(D2:D${n})`, `=SUM(E2:E${n})`, `=SUM(F2:F${n})`, `=SUM(G2:G${n})`, '']);
  return rows;
}

const CAPACITY_ROWS: string[][] = [
  ['Service', 'Current RPS', 'Peak RPS', 'Headroom %', 'Nodes', 'Target nodes'],
  ['api-gateway', '18400', '31000', '=ROUND((C2-B2)/C2*100,0)', '24', '=ROUND(C2/1100,0)'],
  ['auth', '6200', '9800', '=ROUND((C3-B3)/C3*100,0)', '8', '=ROUND(C3/1100,0)'],
  ['drive-sync', '9100', '14500', '=ROUND((C4-B4)/C4*100,0)', '12', '=ROUND(C4/1100,0)'],
  ['chat-realtime', '22800', '30500', '=ROUND((C5-B5)/C5*100,0)', '26', '=ROUND(C5/1100,0)'],
  ['search', '4100', '7600', '=ROUND((C6-B6)/C6*100,0)', '6', '=ROUND(C6/1100,0)'],
  ['Total', '=SUM(B2:B6)', '=SUM(C2:C6)', '=ROUND((C7-B7)/C7*100,0)', '=SUM(E2:E6)', '=SUM(F2:F6)'],
];

const A11Y_ROWS: string[][] = [
  ['Component', 'Contrast', 'Keyboard', 'Screen reader', 'Focus visible', 'Status'],
  ['Button', 'Pass', 'Pass', 'Pass', 'Pass', 'Done'],
  ['Input', 'Pass', 'Pass', 'Pass', 'Pass', 'Done'],
  ['Select', 'Pass', 'Pass', 'Fail — no live region', 'Pass', 'Blocked'],
  ['Date picker', 'Pass', 'Partial', 'Not tested', 'Pass', 'In progress'],
  ['Tabs', 'Pass', 'Pass', 'Pass', 'Pass', 'Done'],
  ['Toast', 'Pass', 'n/a', 'Pass', 'n/a', 'Done'],
  ['Charts', 'Fail — 2.9:1', 'n/a', 'Partial', 'n/a', 'Mapping needed'],
];

const PRICING_ROWS: string[][] = [
  ['Tier', 'List price (USD/seat)', 'Max discount', 'Floor price', 'Approver'],
  ['Starter', '12', '10%', '=B2*(1-C2)', 'AE'],
  ['Growth', '24', '15%', '=B3*(1-C3)', 'Sales manager'],
  ['Business', '39', '20%', '=B4*(1-C4)', 'Head of Sales'],
  ['Enterprise', '62', '35%', '=B5*(1-C5)', 'CFO'],
];

const RENEWAL_ROWS: string[][] = [
  ['Account', 'ARR (USD)', 'Renewal', 'Health', 'Owner', 'Risk'],
  ['Nimbus Logistics', '184000', 'Dec 14', 'Green', 'Yusuf Demir', 'Low'],
  ['Aster Health', '96000', 'Dec 2', 'Amber', 'Yusuf Demir', 'Medium'],
  ['Orbital Foods', '240000', 'Jan 9', 'Green', 'Noah Kim', 'Low'],
  ['Kite Mobility', '58000', 'Nov 28', 'Red', 'Noah Kim', 'High'],
  ['Total', '=SUM(B2:B5)', '', '', '', ''],
];

const CLOUD_ROWS: string[][] = [
  ['Team', 'Compute', 'Storage', 'Network', 'Total'],
  ['Platform', '42000', '9800', '6100', '=SUM(B2:D2)'],
  ['Data', '31000', '22400', '2900', '=SUM(B3:D3)'],
  ['Product apps', '18500', '4100', '3300', '=SUM(B4:D4)'],
  ['Security', '6200', '1800', '700', '=SUM(B5:D5)'],
  ['Total', '=SUM(B2:B5)', '=SUM(C2:C5)', '=SUM(D2:D5)', '=SUM(E2:E5)'],
];

const ONCALL_ROWS: string[][] = [
  ['Week', 'Primary', 'Secondary', 'Escalation'],
  ['Nov 3', 'Lucas Meyer', 'Priya Raman', 'Omar Khalid'],
  ['Nov 10', 'Kwame Mensah', 'Lucas Meyer', 'Omar Khalid'],
  ['Nov 17', 'Priya Raman', 'Ethan Brooks', 'Omar Khalid'],
  ['Nov 24', 'Lucas Meyer', 'Kwame Mensah', 'Layla Haddad'],
];

const HOLIDAY_ROWS: string[][] = [
  ['Date', 'Holiday', 'UAE', 'UK', 'Singapore'],
  ['Dec 2', 'National Day', 'Yes', '—', '—'],
  ['Dec 25', 'Christmas Day', '—', 'Yes', 'Yes'],
  ['Dec 26', 'Boxing Day', '—', 'Yes', '—'],
  ['Jan 1', 'New Year’s Day', 'Yes', 'Yes', 'Yes'],
  ['Jan 29', 'Lunar New Year', '—', '—', 'Yes'],
  ['Mar 20', 'Eid al-Fitr (est.)', 'Yes', '—', 'Yes'],
];

const ALLHANDS_SLIDES: Slide[] = [
  { kind: 'title', title: 'Q4 kickoff', body: ['All-hands · Helix'] },
  { kind: 'stat', title: 'Revenue run-rate', stat: '$48.2M', body: ['+31% year over year'] },
  { kind: 'bullets', title: 'Q4 priorities', body: ['Ship Prism v4 across all apps', 'Global rate limiting in production', 'MFA everywhere by December 15'] },
  { kind: 'quote', title: '“The best onboarding I’ve had in 10 years.”', body: ['— New hire survey, October'] },
  { kind: 'bullets', title: 'Thank you', body: ['Questions in #all-hands', 'Recording in the Helix Library'] },
];
const ROADMAP_SLIDES: Slide[] = [
  { kind: 'title', title: 'Engineering roadmap 2027', body: ['Platform · Product · Data'] },
  { kind: 'bullets', title: 'H1 — Foundations', body: ['Global rate limiting (RFC-0042)', 'Kubernetes 1.31 upgrade', 'Prism v4 in every app'] },
  { kind: 'bullets', title: 'H2 — Scale', body: ['Multi-region active-active for Drive', 'Search re-architecture', 'Self-serve data platform'] },
  { kind: 'stat', title: 'Reliability target', stat: '99.95%', body: ['Up from 99.9% in 2026'] },
];
const BRAND_SLIDES: Slide[] = [
  { kind: 'title', title: 'Brand Guidelines v3', body: ['Plasma, glass and clarity'] },
  { kind: 'bullets', title: 'Voice', body: ['Clear before clever', 'Warm, never cute', 'Short sentences'] },
  { kind: 'bullets', title: 'Colour', body: ['Plasma amber for focus and action', 'Deep navy surfaces', 'Never more than two accents per screen'] },
  { kind: 'quote', title: '“Everything you need. Nothing you don’t.”', body: ['— Helix brand promise'] },
];
const PITCH_SLIDES: Slide[] = [
  { kind: 'title', title: 'Helix', body: ['The employee hub teams actually use'] },
  { kind: 'stat', title: 'Daily active usage', stat: '87%', body: ['of employees open NEXUS every workday'] },
  { kind: 'bullets', title: 'Why Helix', body: ['One hub for apps, people and work', 'Governance that explains itself', 'Live in 30 days'] },
];
const BOARD_SLIDES: Slide[] = [
  { kind: 'title', title: 'Board update — Q3 2026', body: ['Confidential · Finance'] },
  { kind: 'stat', title: 'Gross margin', stat: '78.4%', body: ['+2.1 pts quarter over quarter'] },
  { kind: 'bullets', title: 'Cash & runway', body: ['Cash: $61.3M', 'Burn: $1.9M / month', 'Runway: 32 months'] },
  { kind: 'bullets', title: 'Asks', body: ['Approve FY2027 budget envelope', 'Approve GPU reservation (3-year)'] },
];
const STUDY_SLIDES: Slide[] = [
  { kind: 'title', title: 'Onboarding usability study', body: ['Readout · 8 participants'] },
  { kind: 'stat', title: 'Task success', stat: '62% → 91%', body: ['After the redesigned first-day checklist'] },
  { kind: 'bullets', title: 'Top findings', body: ['People miss the access request step', 'Checklist progress motivates', 'Jargon in IT steps confuses new hires'] },
  { kind: 'quote', title: '“I finally knew what to do on day one.”', body: ['— Participant 6'] },
];
const CRIT_SLIDES: Slide[] = [
  { kind: 'title', title: 'Design crit — week 45', body: ['Onboarding v5 · Prism v4 tables'] },
  { kind: 'bullets', title: 'For feedback', body: ['Empty states for new hires', 'Table density toggle', 'Mobile access request flow'] },
];

/* ------------------------------------------------------------------ */
/* Seed builder                                                        */
/* ------------------------------------------------------------------ */

interface VSpec {
  d: number;
  by: string;
  summary: string;
  content?: Content;
  size?: number;
}

interface Spec {
  id: string;
  drive: string;
  parent?: string | null;
  kind: ItemKind;
  name: string;
  owner: string;
  /** days ago */
  created: number;
  /** days ago (defaults to the last version / created) */
  updated?: number;
  updatedBy?: string;
  size?: number;
  mime?: string;
  label?: Sensitivity;
  desc?: string;
  tags?: string[];
  shares?: Share[];
  link?: LinkSetting;
  inherit?: boolean;
  starred?: string[];
  trashed?: { d: number; by: string };
  hold?: Hold;
  color?: string;
  content?: Content;
  versions?: VSpec[];
  threads?: Thread[];
  activity?: Omit<Activity, 'id'>[];
}

const DEFAULT_SIZE: Record<ItemKind, [number, number]> = {
  folder: [0, 0],
  doc: [38 * KB, 260 * KB],
  sheet: [60 * KB, 1.8 * MB],
  slides: [3 * MB, 28 * MB],
  pdf: [240 * KB, 6 * MB],
  image: [420 * KB, 5.5 * MB],
  video: [120 * MB, 900 * MB],
  audio: [8 * MB, 60 * MB],
  code: [2 * KB, 18 * KB],
  text: [1 * KB, 12 * KB],
  archive: [12 * MB, 320 * MB],
  other: [5 * MB, 90 * MB],
};

export function createDriveSeed(now = Date.now()): DriveData {
  let seq = 0;
  const sid = (p: string) => `${p}-${(++seq).toString(36)}`;
  const ago = (d: number) => now - d * DAY;
  const userName = (id: string) => SEED_USERS.find((u) => u.id === id)?.name ?? id;
  const U = (id: string): Principal => ({ type: 'user', id });
  const R = (id: string): Principal => ({ type: 'role', id });
  const D = (id: Department): Principal => ({ type: 'dept', id });
  const ORG: Principal = { type: 'org' };
  const share = (p: Principal, level: Level, by: string, atDaysAgo: number, expiresInDays: number | null = null): Share => ({
    id: sid('sh'),
    principal: p,
    level,
    by,
    at: ago(atDaysAgo),
    expiresAt: expiresInDays === null ? null : now + expiresInDays * DAY,
  });
  const RESTRICTED: LinkSetting = { scope: 'restricted', level: 'viewer' };
  const pName = (p: Principal) => (p.type === 'user' ? userName(p.id) : p.type === 'role' ? `${p.id} role` : p.type === 'dept' ? `${p.id} department` : 'everyone at Helix');

  /* ---------------- drives ---------------- */
  const sharedDrive = (d: Omit<Drive, 'kind' | 'hold' | 'createdAt' | 'createdBy' | 'quota'> & { quota?: number; createdDaysAgo: number }): Drive => ({
    kind: 'shared',
    hold: null,
    createdAt: ago(d.createdDaysAgo),
    createdBy: 'u-layla',
    quota: d.quota ?? 1024 ** 4,
    id: d.id,
    name: d.name,
    description: d.description,
    icon: d.icon,
    color: d.color,
    department: d.department,
    members: d.members,
    defaultLabel: d.defaultLabel,
  });

  const drives: Drive[] = [
    sharedDrive({
      id: 'drv-company',
      name: 'Helix Library',
      description: 'Handbooks, brand, all-hands and everything company-wide.',
      icon: 'library',
      color: '#fbbf24',
      members: [share(ORG, 'viewer', 'u-layla', 700), share(R('people-ops'), 'editor', 'u-layla', 700), share(U('u-sofia'), 'editor', 'u-sara', 400), share(U('u-sara'), 'manager', 'u-layla', 700)],
      defaultLabel: 'internal',
      createdDaysAgo: 720,
    }),
    sharedDrive({
      id: 'drv-eng',
      name: 'Engineering',
      description: 'RFCs, runbooks, roadmaps and the Prism frontend kit.',
      icon: 'code',
      color: '#22d3ee',
      department: 'Engineering',
      members: [share(R('engineering'), 'editor', 'u-omar', 650), share(U('u-omar'), 'manager', 'u-layla', 650), share(U('u-priya'), 'manager', 'u-omar', 500)],
      defaultLabel: 'internal',
      createdDaysAgo: 650,
    }),
    sharedDrive({
      id: 'drv-design',
      name: 'Design',
      description: 'Prism design system, research and crit decks.',
      icon: 'palette',
      color: '#f472b6',
      department: 'Design',
      members: [share(D('Design'), 'editor', 'u-mei', 600), share(D('Product'), 'commenter', 'u-mei', 420), share(U('u-mei'), 'manager', 'u-layla', 600)],
      defaultLabel: 'internal',
      createdDaysAgo: 600,
      quota: 512 * 1024 ** 3,
    }),
    sharedDrive({
      id: 'drv-people',
      name: 'People Ops',
      description: 'Offers, employee relations and survey results. Named people only.',
      icon: 'heart',
      color: '#a78bfa',
      department: 'People Ops',
      members: [share(U('u-sara'), 'manager', 'u-layla', 640), share(U('u-fatima'), 'editor', 'u-sara', 520)],
      defaultLabel: 'restricted',
      createdDaysAgo: 640,
      quota: 256 * 1024 ** 3,
    }),
    sharedDrive({
      id: 'drv-fin',
      name: 'Finance',
      description: 'Budgets, payroll exports, board materials. Confidential by default.',
      icon: 'landmark',
      color: '#34d399',
      department: 'Finance',
      members: [share(D('Finance'), 'editor', 'u-grace', 610), share(U('u-grace'), 'manager', 'u-layla', 610)],
      defaultLabel: 'confidential',
      createdDaysAgo: 610,
      quota: 256 * 1024 ** 3,
    }),
    sharedDrive({
      id: 'drv-sec',
      name: 'IT & Security',
      description: 'Postmortems, runbooks, security policies and audits.',
      icon: 'shield',
      color: '#fb7185',
      department: 'IT & Security',
      members: [share(D('IT & Security'), 'editor', 'u-layla', 630), share(R('engineering'), 'viewer', 'u-layla', 400), share(U('u-layla'), 'manager', 'u-layla', 630), share(U('u-ethan'), 'manager', 'u-layla', 380)],
      defaultLabel: 'internal',
      createdDaysAgo: 630,
      quota: 256 * 1024 ** 3,
    }),
    sharedDrive({
      id: 'drv-sales',
      name: 'Sales & Success',
      description: 'Pitch decks, pricing, renewals and case studies.',
      icon: 'trending',
      color: '#60a5fa',
      department: 'Sales',
      members: [share(D('Sales'), 'editor', 'u-aisha', 560), share(D('Customer Success'), 'editor', 'u-aisha', 560), share(R('manager'), 'viewer', 'u-aisha', 300), share(U('u-aisha'), 'manager', 'u-layla', 560), share(U('u-yusuf'), 'manager', 'u-aisha', 300)],
      defaultLabel: 'internal',
      createdDaysAgo: 560,
      quota: 512 * 1024 ** 3,
    }),
  ];
  for (const u of SEED_USERS)
    drives.push({
      id: personalDriveId(u.id),
      kind: 'personal',
      name: 'My Drive',
      description: 'Your private space. Share files when you’re ready.',
      icon: 'user',
      color: '#94a3b8',
      ownerId: u.id,
      members: [],
      defaultLabel: 'internal',
      quota: 30 * 1024 ** 3,
      createdAt: Math.min(ago(30), new Date(u.startDate).getTime() || ago(300)),
      createdBy: u.id,
      hold: null,
    });
  const driveDefault = new Map(drives.map((d) => [d.id, d.defaultLabel]));

  /* ---------------- items ---------------- */
  const items: Item[] = [];
  const contentSize = (c: Content | undefined, kind: ItemKind, id: string): number => {
    if (c?.type === 'doc' || c?.type === 'code') return Math.max(1200, Math.round(c.text.length * (kind === 'doc' ? 9.5 : 1.02)));
    const [lo, hi] = DEFAULT_SIZE[kind];
    return Math.round(lo + (hashStr(id) % 1000) / 1000 * (hi - lo));
  };

  const mk = (s: Spec): Item => {
    const size = s.size ?? contentSize(s.content, s.kind, s.id);
    const versions: Version[] = [];
    if (s.kind !== 'folder') {
      const vs: VSpec[] = s.versions ?? [{ d: s.created, by: s.owner, summary: s.kind === 'doc' || s.kind === 'sheet' || s.kind === 'slides' ? 'Created' : 'Uploaded' }];
      if (!s.versions && s.updated !== undefined && s.updated < s.created - 0.01) vs.push({ d: s.updated, by: s.updatedBy ?? s.owner, summary: 'Edited' });
      vs.forEach((v, i) => {
        const last = i === vs.length - 1;
        versions.push({
          id: sid('v'),
          n: i + 1,
          at: ago(v.d),
          by: v.by,
          size: v.size ?? Math.round(size * (last ? 1 : 0.55 + (0.4 * (i + 1)) / vs.length)),
          summary: v.summary,
          content: v.content ?? (last ? s.content : undefined),
        });
      });
    }
    const lastV = versions[versions.length - 1];
    const updatedAt = s.updated !== undefined ? ago(s.updated) : lastV ? lastV.at : ago(s.created);
    const activity: Activity[] = [];
    activity.push({ id: sid('a'), at: ago(s.created), by: s.owner, verb: s.kind === 'folder' || s.kind === 'doc' || s.kind === 'sheet' || s.kind === 'slides' ? 'created' : 'uploaded' });
    versions.slice(1).forEach((v) => activity.push({ id: sid('a'), at: v.at, by: v.by, verb: 'version', detail: `v${v.n} · ${v.summary}` }));
    (s.shares ?? []).forEach((sh) => activity.push({ id: sid('a'), at: sh.at, by: sh.by, verb: 'shared', detail: `${pName(sh.principal)} as ${sh.level}${sh.expiresAt ? ' (time-boxed)' : ''}` }));
    (s.threads ?? []).forEach((t) => activity.push({ id: sid('a'), at: t.at, by: t.by, verb: 'commented', detail: t.text.slice(0, 80) }));
    if (s.link && s.link.scope !== 'restricted') activity.push({ id: sid('a'), at: s.link.at ?? ago(s.created), by: s.link.by ?? s.owner, verb: 'link', detail: s.link.scope === 'anyone' ? 'Anyone with the link can view' : 'Anyone at Helix with the link can view' });
    (s.activity ?? []).forEach((a) => activity.push({ id: sid('a'), ...a }));
    if (s.trashed) activity.push({ id: sid('a'), at: ago(s.trashed.d), by: s.trashed.by, verb: 'trashed' });
    activity.sort((a, b) => b.at - a.at);
    const item: Item = {
      id: s.id,
      driveId: s.drive,
      parentId: s.parent ?? null,
      kind: s.kind,
      name: s.name,
      ownerId: s.owner,
      createdAt: ago(s.created),
      updatedAt,
      updatedBy: s.updatedBy ?? lastV?.by ?? s.owner,
      size: s.kind === 'folder' ? 0 : size,
      mime: s.mime,
      label: s.label ?? driveDefault.get(s.drive) ?? 'internal',
      description: s.desc,
      tags: s.tags ?? [],
      shares: s.shares ?? [],
      link: s.link ?? RESTRICTED,
      inherit: s.inherit ?? true,
      starredBy: s.starred ?? [],
      trashed: s.trashed ? { at: ago(s.trashed.d), by: s.trashed.by } : null,
      hold: s.hold ?? null,
      color: s.color,
      content: s.content,
      versions,
      threads: s.threads ?? [],
      activity,
    };
    items.push(item);
    return item;
  };
  const folder = (id: string, drive: string, parent: string | null, name: string, owner: string, created: number, extra: Partial<Spec> = {}) =>
    mk({ id, drive, parent, kind: 'folder', name, owner, created, ...extra });
  const doc = (text: string): Content => ({ type: 'doc', text });
  const sheet = (rows: string[][]): Content => ({ type: 'sheet', rows });
  const deck = (slides: Slide[]): Content => ({ type: 'slides', slides });
  const code = (lang: string, text: string): Content => ({ type: 'code', lang, text });
  const thread = (by: string, d: number, text: string, replies: [string, number, string][] = [], resolved?: [string, number], quote?: string): Thread => ({
    id: sid('t'),
    by,
    at: ago(d),
    text,
    quote,
    replies: replies.map(([rb, rd, rt]) => ({ id: sid('c'), by: rb, at: ago(rd), text: rt })),
    resolved: resolved ? { by: resolved[0], at: ago(resolved[1]) } : null,
  });

  /* ======== Helix Library ======== */
  folder('fo-handbook', 'drv-company', null, 'Employee Handbook', 'u-sara', 400);
  mk({
    id: 'df-handbook-2026',
    drive: 'drv-company',
    parent: 'fo-handbook',
    kind: 'doc',
    name: 'Helix Employee Handbook 2026',
    owner: 'u-sara',
    created: 60,
    desc: 'How we work, time off, locations and security basics.',
    tags: ['handbook', 'policy', 'onboarding'],
    content: doc(HANDBOOK_TEXT),
    versions: [
      { d: 60, by: 'u-sara', summary: 'Imported 2025 handbook', content: doc(HANDBOOK_TEXT.replace('**16 weeks**', '12 weeks')) },
      { d: 21, by: 'u-fatima', summary: 'Working hours & hubs section' },
      { d: 4, by: 'u-sara', summary: 'Parental leave 12 → 16 weeks', content: doc(HANDBOOK_TEXT) },
    ],
    threads: [thread('u-fatima', 6, 'Parental leave still says 12 weeks — the new policy is 16 weeks from January.', [['u-sara', 5, 'Updating now, thanks!']], ['u-sara', 4], '12 weeks')],
    starred: ['u-kwame'],
  });
  mk({ id: 'df-benefits-guide', drive: 'drv-company', parent: 'fo-handbook', kind: 'pdf', name: 'Benefits Guide — UAE & UK.pdf', owner: 'u-sara', created: 90, tags: ['benefits'], size: 3.4 * MB });
  mk({ id: 'df-holiday-cal', drive: 'drv-company', parent: 'fo-handbook', kind: 'sheet', name: 'Public holidays 2026–27', owner: 'u-fatima', created: 45, updated: 12, content: sheet(HOLIDAY_ROWS), tags: ['calendar'] });
  mk({ id: 'df-code-of-conduct', drive: 'drv-company', parent: 'fo-handbook', kind: 'pdf', name: 'Code of Conduct.pdf', owner: 'u-sara', created: 300, label: 'public', size: 1.1 * MB });
  folder('fo-brand', 'drv-company', null, 'Brand & Press', 'u-sofia', 380, { color: '#fb923c' });
  mk({
    id: 'df-press-kit',
    drive: 'drv-company',
    parent: 'fo-brand',
    kind: 'archive',
    name: 'Helix press kit.zip',
    owner: 'u-sofia',
    created: 210,
    label: 'public',
    size: 148 * MB,
    link: { scope: 'anyone', level: 'viewer', by: 'u-sofia', at: ago(200) },
    content: {
      type: 'archive',
      entries: [
        { path: 'logos/helix-plasma.svg', size: 18 * KB },
        { path: 'logos/helix-mono.svg', size: 12 * KB },
        { path: 'photos/dubai-office.jpg', size: 6.2 * MB },
        { path: 'photos/leadership-team.jpg', size: 8.4 * MB },
        { path: 'fact-sheet-2026.pdf', size: 920 * KB },
        { path: 'boilerplate.txt', size: 2 * KB },
      ],
    },
  });
  mk({ id: 'df-logo-pack', drive: 'drv-company', parent: 'fo-brand', kind: 'image', name: 'Helix logo — plasma.png', owner: 'u-sofia', created: 190, label: 'public', content: { type: 'image', hue: 38, motif: 'orbit', w: 1600, h: 1600 } });
  mk({ id: 'df-brand-guide', drive: 'drv-company', parent: 'fo-brand', kind: 'slides', name: 'Brand Guidelines v3', owner: 'u-sofia', created: 120, updated: 30, label: 'public', content: deck(BRAND_SLIDES), link: { scope: 'anyone', level: 'viewer', by: 'u-sofia', at: ago(30) }, tags: ['brand'] });
  mk({ id: 'df-office-hero', drive: 'drv-company', parent: 'fo-brand', kind: 'image', name: 'Dubai office — hero.jpg', owner: 'u-mateo', created: 75, label: 'public', content: { type: 'image', hue: 205, motif: 'wave', w: 2400, h: 1350 } });
  mk({ id: 'df-old-logo', drive: 'drv-company', parent: 'fo-brand', kind: 'image', name: 'Old logo — 2023.png', owner: 'u-sofia', created: 700, label: 'public', trashed: { d: 12, by: 'u-sofia' }, content: { type: 'image', hue: 260, motif: 'grid', w: 1200, h: 1200 } });
  folder('fo-allhands', 'drv-company', null, 'All-hands', 'u-layla', 340);
  mk({ id: 'df-allhands-oct', drive: 'drv-company', parent: 'fo-allhands', kind: 'video', name: 'All-hands — October.mp4', owner: 'u-layla', created: 9, size: 1.18 * 1024 * MB, content: { type: 'media', duration: 3540, hue: 32, chapters: ['Welcome', 'Q3 results', 'Prism v4 demo', 'People updates', 'Q&A'] } });
  mk({ id: 'df-allhands-deck', drive: 'drv-company', parent: 'fo-allhands', kind: 'slides', name: 'All-hands — Q4 kickoff', owner: 'u-layla', created: 10, updated: 9, content: deck(ALLHANDS_SLIDES), starred: ['u-omar'] });
  mk({ id: 'df-org-chart', drive: 'drv-company', parent: null, kind: 'pdf', name: 'Org chart — November.pdf', owner: 'u-sara', created: 5, size: 640 * KB });
  mk({ id: 'df-it-policy', drive: 'drv-company', parent: null, kind: 'doc', name: 'Acceptable Use Policy', owner: 'u-layla', created: 150, updated: 20, content: doc(AUP_TEXT), tags: ['policy', 'security'] });

  /* ======== Engineering ======== */
  folder('fo-prism-fe', 'drv-eng', null, 'Prism frontend kit', 'u-omar', 120, {
    color: '#fbbf24',
    desc: 'React components, tokens and migration work for Prism v4.',
    shares: [share(U('u-alex'), 'editor', 'u-omar', 3, 45)],
    starred: ['u-omar', 'u-alex'],
    tags: ['prism', 'frontend'],
  });
  mk({
    id: 'df-prism-button',
    drive: 'drv-eng',
    parent: 'fo-prism-fe',
    kind: 'code',
    name: 'Button.tsx',
    owner: 'u-priya',
    created: 40,
    content: code('tsx', BUTTON_TSX),
    versions: [
      { d: 40, by: 'u-priya', summary: 'Initial component' },
      { d: 12, by: 'u-priya', summary: 'Loading state keeps width' },
      { d: 1.2, by: 'u-alex', summary: 'Read tokens instead of hex', content: code('tsx', BUTTON_TSX) },
    ],
    tags: ['component'],
  });
  mk({ id: 'df-prism-tokens', drive: 'drv-eng', parent: 'fo-prism-fe', kind: 'code', name: 'tokens.json', owner: 'u-priya', created: 30, updated: 2, updatedBy: 'u-alex', content: code('json', TOKENS_JSON), tags: ['tokens'] });
  mk({ id: 'df-prism-readme', drive: 'drv-eng', parent: 'fo-prism-fe', kind: 'text', name: 'README.md', owner: 'u-omar', created: 118, updated: 3, content: doc(README_MD) });
  mk({
    id: 'df-prism-migration',
    drive: 'drv-eng',
    parent: 'fo-prism-fe',
    kind: 'doc',
    name: 'Token migration plan',
    owner: 'u-omar',
    created: 18,
    content: doc(MIGRATION_TEXT),
    versions: [
      { d: 18, by: 'u-omar', summary: 'Plan outline' },
      { d: 7, by: 'u-priya', summary: 'Codemod numbers' },
      { d: 0.9, by: 'u-alex', summary: 'Status checklist', content: doc(MIGRATION_TEXT) },
    ],
    threads: [thread('u-alex', 1, 'Draft mapping for the 48 tokens is in the a11y sheet — I need edit access to the spec to add the appendix.', [['u-omar', 0.8, 'Requesting it from Mei is the right move — she owns the spec.']])],
    tags: ['prism', 'migration'],
  });
  mk({ id: 'df-prism-a11y', drive: 'drv-eng', parent: 'fo-prism-fe', kind: 'sheet', name: 'Accessibility audit — Prism v4', owner: 'u-alex', created: 2.5, updated: 0.3, content: sheet(A11Y_ROWS), tags: ['a11y'] });
  mk({ id: 'df-prism-storybook', drive: 'drv-eng', parent: 'fo-prism-fe', kind: 'image', name: 'Storybook — button states.png', owner: 'u-alex', created: 1.5, content: { type: 'image', hue: 44, motif: 'grid', w: 1920, h: 1080 } });
  mk({
    id: 'df-prism-secreview',
    drive: 'drv-eng',
    parent: 'fo-prism-fe',
    kind: 'doc',
    name: 'Prism security review',
    owner: 'u-ethan',
    created: 6,
    label: 'confidential',
    content: doc(SEC_REVIEW_TEXT),
    tags: ['security', 'prism'],
  });
  folder('fo-prism-icons', 'drv-eng', 'fo-prism-fe', 'Icons', 'u-priya', 50);
  mk({
    id: 'df-prism-iconset',
    drive: 'drv-eng',
    parent: 'fo-prism-icons',
    kind: 'archive',
    name: 'prism-icons-v4.zip',
    owner: 'u-priya',
    created: 22,
    size: 18 * MB,
    content: { type: 'archive', entries: [{ path: 'svg/arrow-right.svg', size: 1 * KB }, { path: 'svg/check.svg', size: 1 * KB }, { path: 'svg/folder-open.svg', size: 2 * KB }, { path: 'react/index.ts', size: 14 * KB }, { path: 'LICENSE', size: 1 * KB }] },
  });
  folder('fo-platform', 'drv-eng', null, 'Platform', 'u-omar', 500);
  mk({
    id: 'df-rfc-ratelimit',
    drive: 'drv-eng',
    parent: 'fo-platform',
    kind: 'doc',
    name: 'RFC-0042: Global rate limiting',
    owner: 'u-priya',
    created: 34,
    content: doc(RFC_TEXT),
    versions: [
      { d: 34, by: 'u-priya', summary: 'Draft' },
      { d: 27, by: 'u-priya', summary: 'Design section' },
      { d: 19, by: 'u-lucas', summary: 'Failure modes' },
      { d: 11, by: 'u-priya', summary: 'Rollout plan' },
      { d: 2, by: 'u-omar', summary: 'Marked approved', content: doc(RFC_TEXT) },
    ],
    threads: [
      thread('u-lucas', 20, 'Token bucket per tenant looks right. What happens on regional failover — do buckets reset?', [['u-priya', 19, 'They’re CRDT counters replicated across regions; worst case 2× burst for ~30s. Added to Failure modes.']], ['u-lucas', 18]),
      thread('u-omar', 2, 'Approved from my side. @Priya Raman please book the design review with SRE.', [['u-priya', 1.5, 'Booked for Thursday.']]),
    ],
    starred: ['u-omar', 'u-lucas'],
    tags: ['rfc', 'api', 'reliability'],
  });
  mk({ id: 'df-k8s-runbook', drive: 'drv-eng', parent: 'fo-platform', kind: 'doc', name: 'Kubernetes 1.31 upgrade runbook', owner: 'u-lucas', created: 16, updated: 3, tags: ['runbook', 'kubernetes'] });
  mk({ id: 'df-capacity-q4', drive: 'drv-eng', parent: 'fo-platform', kind: 'sheet', name: 'Capacity plan — Q4', owner: 'u-lucas', created: 25, updated: 1.1, content: sheet(CAPACITY_ROWS), tags: ['capacity'] });
  mk({ id: 'df-deploy-sh', drive: 'drv-eng', parent: 'fo-platform', kind: 'code', name: 'deploy.sh', owner: 'u-lucas', created: 200, updated: 14, content: code('shell', DEPLOY_SH) });
  mk({ id: 'df-arch-diagram', drive: 'drv-eng', parent: 'fo-platform', kind: 'image', name: 'Platform architecture.png', owner: 'u-priya', created: 80, content: { type: 'image', hue: 190, motif: 'mesh', w: 2400, h: 1500 } });
  mk({ id: 'df-draft-rfc', drive: 'drv-eng', parent: 'fo-platform', kind: 'doc', name: 'RFC-0039 (superseded)', owner: 'u-priya', created: 70, trashed: { d: 5, by: 'u-priya' } });
  folder('fo-eng-onboarding', 'drv-eng', null, 'Onboarding', 'u-omar', 300);
  mk({ id: 'df-eng-onboarding', drive: 'drv-eng', parent: 'fo-eng-onboarding', kind: 'doc', name: 'Engineering onboarding — first 30 days', owner: 'u-omar', created: 90, updated: 26, content: doc(ONBOARDING_ENG_TEXT), starred: ['u-kwame'], tags: ['onboarding'] });
  mk({ id: 'df-dev-setup', drive: 'drv-eng', parent: 'fo-eng-onboarding', kind: 'video', name: 'Dev environment setup.mp4', owner: 'u-priya', created: 88, size: 412 * MB, content: { type: 'media', duration: 1260, hue: 188 } });
  mk({
    id: 'df-eng-roadmap',
    drive: 'drv-eng',
    parent: null,
    kind: 'slides',
    name: 'Engineering roadmap 2027',
    owner: 'u-omar',
    created: 14,
    updated: 0.2,
    content: deck(ROADMAP_SLIDES),
    shares: [share(U('u-hana'), 'viewer', 'u-omar', 6)],
    starred: ['u-omar'],
    tags: ['roadmap', 'planning'],
  });
  mk({ id: 'df-oncall', drive: 'drv-eng', parent: null, kind: 'sheet', name: 'On-call rotation — November', owner: 'u-lucas', created: 8, content: sheet(ONCALL_ROWS) });
  mk({ id: 'df-postgres-tuning', drive: 'drv-eng', parent: null, kind: 'pdf', name: 'Postgres tuning notes.pdf', owner: 'u-kwame', created: 4, size: 2.2 * MB, tags: ['database'] });

  /* ======== Design ======== */
  folder('fo-ds', 'drv-design', null, 'Design system', 'u-mei', 420, { color: '#fbbf24', tags: ['prism'] });
  const prismVersions: VSpec[] = [
    { d: 24, by: 'u-mei', summary: 'Outline & goals' },
    { d: 19, by: 'u-mei', summary: 'Token table (48 semantic tokens)' },
    { d: 14, by: 'u-hana', summary: 'Component list & Button spec' },
    { d: 9, by: 'u-mei', summary: 'Accessibility checklist' },
    { d: 5, by: 'u-mei', summary: 'Motion guidelines' },
    { d: 1.6, by: 'u-mei', summary: 'Focus ring 2px → 3px after review' },
    { d: 0.25, by: 'u-mei', summary: 'Decisions + migration appendix stub' },
  ].map((v, i) => ({ ...v, content: doc(PRISM_SECTIONS.slice(0, i + 1).join('\n\n').replace(i < 5 ? '3px plasma with 1px inner offset (updated after review)' : '\u0000', '2px plasma outline')) }));
  mk({
    id: 'df-prism-spec',
    drive: 'drv-design',
    parent: 'fo-ds',
    kind: 'doc',
    name: 'Prism v4 Component Spec',
    owner: 'u-mei',
    created: 24,
    label: 'internal',
    desc: 'Tokens, components, accessibility and motion for Prism v4.',
    tags: ['prism', 'design-system', 'spec'],
    content: doc(PRISM_SECTIONS.join('\n\n')),
    versions: prismVersions,
    starred: ['u-mei', 'u-hana'],
    threads: [
      thread('u-hana', 2.2, 'The focus ring says 2px — on dark surfaces that’s hard to see at 125% zoom. Can we go 3px with a 1px inner offset?', [['u-mei', 1.6, 'Good catch — updated in v6. Hana, can you re-check during the screen-reader sweep?']], ['u-mei', 1.5], 'Focus ring'),
      thread('u-aisha', 1.1, 'Is 14 realistic with the token migration in parallel? Growth needs Select + Date picker first.', [['u-mei', 0.9, '@Omar Khalid can Platform take the Date picker? Then 14 holds.']], undefined, 'Ship 14 core components by end of quarter'),
      thread('u-omar', 0.3, 'Engineering notes for the token migration should live in the appendix — Alex will add them once access is sorted.'),
    ],
  });
  mk({ id: 'df-ds-colors', drive: 'drv-design', parent: 'fo-ds', kind: 'image', name: 'Color tokens — dark.png', owner: 'u-mei', created: 18, content: { type: 'image', hue: 30, motif: 'grid', w: 1800, h: 1200 } });
  mk({ id: 'df-ds-type', drive: 'drv-design', parent: 'fo-ds', kind: 'pdf', name: 'Type scale.pdf', owner: 'u-hana', created: 33, size: 860 * KB });
  mk({ id: 'df-ds-figma', drive: 'drv-design', parent: 'fo-ds', kind: 'other', name: 'Prism v4.fig', owner: 'u-mei', created: 60, updated: 0.5, size: 84 * MB, tags: ['figma'] });
  folder('fo-research', 'drv-design', null, 'Research', 'u-hana', 260);
  mk({ id: 'df-onboarding-study', drive: 'drv-design', parent: 'fo-research', kind: 'slides', name: 'Onboarding usability study — readout', owner: 'u-hana', created: 11, updated: 3, content: deck(STUDY_SLIDES), shares: [share(U('u-sara'), 'viewer', 'u-hana', 3)], tags: ['research', 'onboarding'] });
  mk({ id: 'df-interview-notes', drive: 'drv-design', parent: 'fo-research', kind: 'doc', name: 'Interview notes — new hires', owner: 'u-hana', created: 15, label: 'confidential', desc: 'Contains participant names and quotes.', tags: ['research', 'pii'] });
  mk({ id: 'df-survey-results', drive: 'drv-design', parent: 'fo-research', kind: 'sheet', name: 'Onboarding survey responses', owner: 'u-hana', created: 13 });
  mk({ id: 'df-session-rec', drive: 'drv-design', parent: 'fo-research', kind: 'video', name: 'Session 04 — recording.mp4', owner: 'u-hana', created: 12, label: 'confidential', size: 688 * MB, content: { type: 'media', duration: 2710, hue: 300 } });
  mk({ id: 'df-onboarding-flow', drive: 'drv-design', parent: null, kind: 'image', name: 'Onboarding flow v5.png', owner: 'u-mei', created: 3, updated: 0.15, content: { type: 'image', hue: 18, motif: 'bloom', w: 2880, h: 1800 }, starred: ['u-mei'] });
  mk({ id: 'df-moodboard', drive: 'drv-design', parent: null, kind: 'image', name: 'Moodboard — plasma.jpg', owner: 'u-mei', created: 28, content: { type: 'image', hue: 22, motif: 'mesh', w: 2400, h: 1600 } });
  mk({ id: 'df-design-crit', drive: 'drv-design', parent: null, kind: 'slides', name: 'Design crit — week 45', owner: 'u-mei', created: 2, updated: 0.6, content: deck(CRIT_SLIDES) });

  /* ======== People Ops (Restricted) ======== */
  folder('fo-offers', 'drv-people', null, 'Offer letters', 'u-fatima', 300);
  mk({ id: 'df-offer-kwame', drive: 'drv-people', parent: 'fo-offers', kind: 'doc', name: 'Offer — Kwame Mensah (Data Engineer)', owner: 'u-fatima', created: 40, content: doc(OFFER_TEXT), tags: ['offer'] });
  mk({ id: 'df-offer-template', drive: 'drv-people', parent: 'fo-offers', kind: 'doc', name: 'Offer letter template — UAE', owner: 'u-sara', created: 220, updated: 50, label: 'confidential', tags: ['template'] });
  mk({ id: 'df-offer-backend', drive: 'drv-people', parent: 'fo-offers', kind: 'doc', name: 'Offer — Senior Backend Engineer (draft)', owner: 'u-fatima', created: 3, tags: ['offer', 'draft'] });
  folder('fo-er-cases', 'drv-people', null, 'Employee relations — 2026', 'u-sara', 95, {
    hold: { by: 'u-layla', at: ago(30), reason: 'Case ER-2026-14 — preserve until counsel release' },
    desc: 'Legal hold: nothing in this folder can be deleted.',
  });
  mk({ id: 'df-er-notes', drive: 'drv-people', parent: 'fo-er-cases', kind: 'doc', name: 'Case ER-2026-14 — notes', owner: 'u-sara', created: 60, updated: 31 });
  mk({ id: 'df-er-timeline', drive: 'drv-people', parent: 'fo-er-cases', kind: 'sheet', name: 'Case ER-2026-14 — timeline', owner: 'u-sara', created: 58, updated: 31 });
  mk({ id: 'df-engagement-q3', drive: 'drv-people', parent: null, kind: 'slides', name: 'Engagement survey — Q3 results', owner: 'u-sara', created: 20, label: 'confidential', shares: [share(R('manager'), 'viewer', 'u-sara', 18)] });
  mk({ id: 'df-comp-bands', drive: 'drv-people', parent: null, kind: 'sheet', name: 'Compensation bands 2026', owner: 'u-sara', created: 130, updated: 40, shares: [share(U('u-grace'), 'viewer', 'u-sara', 9, 21)], tags: ['compensation'] });
  mk({ id: 'df-headcount', drive: 'drv-people', parent: null, kind: 'sheet', name: 'Headcount plan 2027', owner: 'u-sara', created: 16, label: 'confidential', shares: [share(U('u-omar'), 'viewer', 'u-sara', 4, 10), share(U('u-aisha'), 'viewer', 'u-sara', 4, 10)] });

  /* ======== Finance (Confidential) ======== */
  folder('fo-payroll', 'drv-fin', null, 'Payroll', 'u-grace', 400, { desc: 'Monthly exports are Restricted — named people only.' });
  mk({ id: 'df-payroll-oct', drive: 'drv-fin', parent: 'fo-payroll', kind: 'sheet', name: 'Payroll export — October 2026', owner: 'u-grace', created: 6, label: 'restricted', content: sheet(payrollRows(10)), shares: [share(U('u-daniel'), 'viewer', 'u-grace', 5, 20)], tags: ['payroll', 'wps'] });
  mk({ id: 'df-payroll-sep', drive: 'drv-fin', parent: 'fo-payroll', kind: 'sheet', name: 'Payroll export — September 2026', owner: 'u-grace', created: 36, label: 'restricted', content: sheet(payrollRows(9)), tags: ['payroll'] });
  mk({ id: 'df-wps-sif', drive: 'drv-fin', parent: 'fo-payroll', kind: 'code', name: 'WPS_2026_10.sif', owner: 'u-grace', created: 5, label: 'restricted', content: code('text', 'SCR,HELIX0001,AE070331234567890123456,2026-10-28,0830,10,2026,16,512340.00,AED\nEDR,HX-0007,AE070331234567890123456,2026-10-01,2026-10-31,31,42500.00,0.00,0\nEDR,HX-0021,AE070331234567890123987,2026-10-01,2026-10-31,31,36250.00,0.00,0') });
  folder('fo-budgets', 'drv-fin', null, 'Budgets', 'u-daniel', 380);
  mk({
    id: 'df-budget-2027',
    drive: 'drv-fin',
    parent: 'fo-budgets',
    kind: 'sheet',
    name: 'FY2027 budget — master',
    owner: 'u-daniel',
    created: 26,
    content: sheet(BUDGET_ROWS),
    versions: [
      { d: 26, by: 'u-daniel', summary: 'Department envelopes' },
      { d: 15, by: 'u-grace', summary: 'Sales headcount ramp' },
      { d: 3, by: 'u-daniel', summary: 'GPU reservation in Engineering Q3' },
    ],
    threads: [thread('u-grace', 2.5, 'Engineering Q3 jump — is that the GPU reservation? Please add a note column.', [['u-daniel', 2, 'Yes — 3-year commit, saves 31%. Note added.']])],
    starred: ['u-daniel', 'u-grace'],
    tags: ['budget', 'fy2027'],
  });
  mk({ id: 'df-opex-q3', drive: 'drv-fin', parent: 'fo-budgets', kind: 'sheet', name: 'Opex variance — Q3', owner: 'u-daniel', created: 31, updated: 8, tags: ['variance'] });
  mk({ id: 'df-cloud-costs', drive: 'drv-fin', parent: 'fo-budgets', kind: 'sheet', name: 'Cloud cost allocation', owner: 'u-daniel', created: 20, updated: 1.4, content: sheet(CLOUD_ROWS), shares: [share(U('u-omar'), 'editor', 'u-daniel', 19)], tags: ['finops', 'cloud'] });
  mk({ id: 'df-board-deck', drive: 'drv-fin', parent: null, kind: 'slides', name: 'Board deck — Q3 2026', owner: 'u-grace', created: 33, updated: 29, content: deck(BOARD_SLIDES), tags: ['board'] });
  mk({ id: 'df-audit-letter', drive: 'drv-fin', parent: null, kind: 'pdf', name: 'External audit — management letter.pdf', owner: 'u-grace', created: 48, size: 1.9 * MB, tags: ['audit'] });
  mk({ id: 'df-vendor-contracts', drive: 'drv-fin', parent: null, kind: 'archive', name: 'Vendor contracts 2026.zip', owner: 'u-grace', created: 70, size: 96 * MB });

  /* ======== IT & Security ======== */
  folder('fo-incidents', 'drv-sec', null, 'Incident postmortems', 'u-ethan', 360, { label: 'confidential' });
  mk({ id: 'df-pm-0917', drive: 'drv-sec', parent: 'fo-incidents', kind: 'doc', name: 'Postmortem — API latency spike (Sep 17)', owner: 'u-lucas', created: 48, updated: 44, label: 'confidential', tags: ['postmortem', 'api'] });
  mk({
    id: 'df-pm-1102',
    drive: 'drv-sec',
    parent: 'fo-incidents',
    kind: 'doc',
    name: 'Postmortem — SSO outage (Nov 2)',
    owner: 'u-ethan',
    created: 3,
    updated: 0.4,
    label: 'confidential',
    content: doc(PM_SSO_TEXT),
    threads: [thread('u-layla', 1, 'Action item 1 needs a date before we close this.', [['u-ethan', 0.4, 'Added — SCIM retry hardening by Nov 20.']])],
    tags: ['postmortem', 'sso', 'sev-1'],
  });
  mk({ id: 'df-pm-template', drive: 'drv-sec', parent: 'fo-incidents', kind: 'doc', name: 'Postmortem template', owner: 'u-ethan', created: 340, label: 'internal' });
  folder('fo-runbooks', 'drv-sec', null, 'Runbooks', 'u-layla', 320);
  mk({ id: 'df-mfa-rollout', drive: 'drv-sec', parent: 'fo-runbooks', kind: 'doc', name: 'MFA rollout plan', owner: 'u-layla', created: 21, updated: 1, starred: ['u-layla'], tags: ['mfa', 'rollout'] });
  mk({ id: 'df-laptop-std', drive: 'drv-sec', parent: 'fo-runbooks', kind: 'pdf', name: 'Laptop security baseline.pdf', owner: 'u-ethan', created: 140, size: 780 * KB });
  mk({ id: 'df-phishing-sim', drive: 'drv-sec', parent: 'fo-runbooks', kind: 'sheet', name: 'Phishing simulation results — Q3', owner: 'u-ethan', created: 29, label: 'confidential' });
  mk({
    id: 'df-pentest-q3',
    drive: 'drv-sec',
    parent: null,
    kind: 'pdf',
    name: 'Pen-test report — Q3 2026.pdf',
    owner: 'u-ethan',
    created: 38,
    label: 'restricted',
    size: 4.6 * MB,
    shares: [share(U('u-lucas'), 'viewer', 'u-ethan', 42, -12), share(U('u-priya'), 'viewer', 'u-ethan', 37), share(U('u-omar'), 'viewer', 'u-ethan', 16, 14)],
    starred: ['u-layla'],
    tags: ['pentest', 'audit'],
    content: {
      type: 'pdf',
      pages: [
        { heading: 'Executive summary', body: ['External penetration test of NEXUS, Drive and Pulse Chat, 14–25 September 2026.', '2 high, 5 medium and 9 low findings. No critical issues. Both highs are fixed and verified.'] },
        { heading: 'High findings', body: ['H-1 Stored XSS in rich-text tooltips (fixed 4.0.2).', 'H-2 Missing rate limit on password reset (fixed via RFC-0042 shadow limits).'] },
        { heading: 'Remediation plan', body: ['Medium findings to close by December 1.', 'Retest scheduled for the first week of January.'] },
      ],
    },
  });
  mk({ id: 'df-sec-policy', drive: 'drv-sec', parent: null, kind: 'pdf', name: 'Information security policy.pdf', owner: 'u-layla', created: 260, link: { scope: 'org', level: 'viewer', by: 'u-layla', at: ago(250) }, size: 1.3 * MB });
  mk({ id: 'df-access-review', drive: 'drv-sec', parent: null, kind: 'sheet', name: 'Quarterly access review', owner: 'u-layla', created: 10, label: 'confidential', tags: ['iam', 'audit'] });

  /* ======== Sales & Success ======== */
  mk({ id: 'df-pitch-2025', drive: 'drv-sales', parent: null, kind: 'slides', name: 'Helix pitch deck 2025', owner: 'u-noah', created: 160, updated: 140, content: deck(PITCH_SLIDES), link: { scope: 'anyone', level: 'viewer', by: 'u-noah', at: ago(140) }, tags: ['pitch'] });
  mk({ id: 'df-pricing', drive: 'drv-sales', parent: null, kind: 'sheet', name: 'Pricing & discount matrix — Q4', owner: 'u-noah', created: 62, updated: 9, label: 'confidential', content: sheet(PRICING_ROWS), shares: [share(ORG, 'viewer', 'u-noah', 60)], tags: ['pricing'] });
  folder('fo-case-studies', 'drv-sales', null, 'Case studies', 'u-yusuf', 240);
  mk({ id: 'df-case-aster', drive: 'drv-sales', parent: 'fo-case-studies', kind: 'pdf', name: 'Case study — Aster Health.pdf', owner: 'u-yusuf', created: 55, label: 'public', size: 2.8 * MB });
  mk({ id: 'df-case-nimbus', drive: 'drv-sales', parent: 'fo-case-studies', kind: 'doc', name: 'Case study draft — Nimbus Logistics', owner: 'u-yusuf', created: 7, updated: 2 });
  folder('fo-renewals', 'drv-sales', null, 'Renewals', 'u-yusuf', 200);
  mk({ id: 'df-renewals-q4', drive: 'drv-sales', parent: 'fo-renewals', kind: 'sheet', name: 'Renewals pipeline — Q4', owner: 'u-yusuf', created: 30, updated: 0.7, label: 'confidential', content: sheet(RENEWAL_ROWS) });
  mk({ id: 'df-qbr-nimbus', drive: 'drv-sales', parent: 'fo-renewals', kind: 'slides', name: 'QBR — Nimbus Logistics', owner: 'u-yusuf', created: 9 });
  mk({ id: 'df-call-rec', drive: 'drv-sales', parent: 'fo-renewals', kind: 'audio', name: 'Discovery call — Aster Health.m4a', owner: 'u-noah', created: 4, label: 'confidential', size: 38 * MB, content: { type: 'media', duration: 2280, hue: 170 } });

  /* ======== Personal drives ======== */
  const my = personalDriveId;
  mk({ id: 'df-mei-portfolio', drive: my('u-mei'), kind: 'slides', name: 'Portfolio review 2026', owner: 'u-mei', created: 40, updated: 6 });
  mk({ id: 'df-mei-notes', drive: my('u-mei'), kind: 'doc', name: '1:1 notes — Omar', owner: 'u-mei', created: 50, updated: 1, content: doc(MEI_NOTES), shares: [share(U('u-omar'), 'commenter', 'u-mei', 45)] });
  mk({ id: 'df-mei-sketch', drive: my('u-mei'), kind: 'image', name: 'Nav sketches.png', owner: 'u-mei', created: 8, content: { type: 'image', hue: 12, motif: 'wave', w: 1600, h: 1200 } });
  mk({ id: 'df-mei-proto', drive: my('u-mei'), kind: 'video', name: 'Onboarding prototype.mov', owner: 'u-mei', created: 4, size: 214 * MB, content: { type: 'media', duration: 96, hue: 24 } });
  folder('fo-mei-inspo', my('u-mei'), null, 'Inspiration', 'u-mei', 120);
  mk({ id: 'df-mei-inspo1', drive: my('u-mei'), parent: 'fo-mei-inspo', kind: 'image', name: 'Glass UI study.png', owner: 'u-mei', created: 35, content: { type: 'image', hue: 210, motif: 'bloom', w: 1440, h: 900 } });
  mk({ id: 'df-mei-inspo2', drive: my('u-mei'), parent: 'fo-mei-inspo', kind: 'image', name: 'Aurora gradients.jpg', owner: 'u-mei', created: 33, content: { type: 'image', hue: 280, motif: 'mesh', w: 1920, h: 1280 } });
  mk({ id: 'df-mei-old', drive: my('u-mei'), kind: 'slides', name: 'Portfolio 2025 (old)', owner: 'u-mei', created: 330, trashed: { d: 26, by: 'u-mei' } });

  mk({ id: 'df-omar-perf', drive: my('u-omar'), kind: 'doc', name: 'Team calibration notes — H2', owner: 'u-omar', created: 12, updated: 2, label: 'confidential' });
  mk({ id: 'df-omar-hiring', drive: my('u-omar'), kind: 'sheet', name: 'Hiring plan — Platform', owner: 'u-omar', created: 22, updated: 5, shares: [share(U('u-aisha'), 'viewer', 'u-omar', 20)] });
  mk({ id: 'df-omar-offsite', drive: my('u-omar'), kind: 'slides', name: 'Platform offsite agenda', owner: 'u-omar', created: 6, shares: [share(R('engineering'), 'viewer', 'u-omar', 5)] });

  mk({ id: 'df-dan-forecast', drive: my('u-daniel'), kind: 'sheet', name: 'Forecast model v12', owner: 'u-daniel', created: 15, updated: 0.9, label: 'confidential', shares: [share(U('u-grace'), 'editor', 'u-daniel', 14)], tags: ['forecast'] });
  mk({ id: 'df-dan-receipts', drive: my('u-daniel'), kind: 'archive', name: 'Receipts — October.zip', owner: 'u-daniel', created: 3, size: 22 * MB });
  mk({ id: 'df-dan-old', drive: my('u-daniel'), kind: 'sheet', name: 'Forecast model v9', owner: 'u-daniel', created: 90, trashed: { d: 9, by: 'u-daniel' } });

  mk({ id: 'df-alex-invoice', drive: my('u-alex'), kind: 'pdf', name: 'Invoice — October 2026.pdf', owner: 'u-alex', created: 5, size: 180 * KB });
  mk({ id: 'df-alex-notes', drive: my('u-alex'), kind: 'doc', name: 'Prism migration notes', owner: 'u-alex', created: 3, updated: 0.4, content: doc(ALEX_NOTES), shares: [share(U('u-omar'), 'editor', 'u-alex', 2)] });

  mk({ id: 'df-layla-board', drive: my('u-layla'), kind: 'slides', name: 'Security board update — Q4', owner: 'u-layla', created: 9, updated: 1.3, label: 'confidential' });
  mk({ id: 'df-layla-vendors', drive: my('u-layla'), kind: 'sheet', name: 'Security vendor review', owner: 'u-layla', created: 24, label: 'confidential' });
  mk({ id: 'df-priya-bench', drive: my('u-priya'), kind: 'sheet', name: 'Rate limiter benchmarks', owner: 'u-priya', created: 21, updated: 4, shares: [share(R('engineering'), 'viewer', 'u-priya', 20)] });
  mk({ id: 'df-sara-comms', drive: my('u-sara'), kind: 'doc', name: 'Review cycle comms plan', owner: 'u-sara', created: 7, updated: 2 });

  /* ---------------- requests ---------------- */
  const requests: AccessRequest[] = [
    { id: 'dr-alex-prism', itemId: 'df-prism-spec', requesterId: 'u-alex', level: 'editor', reason: 'Need to add engineering notes for the token migration.', at: now - 5 * HOUR, status: 'pending' },
    { id: 'dr-mei-roadmap', itemId: 'df-eng-roadmap', requesterId: 'u-mei', level: 'viewer', reason: 'Aligning the design roadmap with platform milestones for 2027.', at: now - 26 * HOUR, status: 'pending' },
    { id: 'dr-kwame-cloud', itemId: 'df-cloud-costs', requesterId: 'u-kwame', level: 'viewer', reason: 'Building the cost dashboard in BigQuery — need the allocation keys.', at: now - 3 * HOUR, status: 'pending' },
    { id: 'dr-hana-roadmap', itemId: 'df-eng-roadmap', requesterId: 'u-hana', level: 'viewer', reason: 'Research planning for H1.', at: ago(7), status: 'approved', decidedBy: 'u-omar', decidedAt: ago(6), grantedLevel: 'viewer', expiresAt: null },
    { id: 'dr-noah-board', itemId: 'df-board-deck', requesterId: 'u-noah', level: 'viewer', reason: 'Prep for the enterprise renewal conversation.', at: ago(12), status: 'denied', decidedBy: 'u-grace', decidedAt: ago(11), note: 'Board materials are limited to finance leadership — I’ll send you the public highlights.' },
  ];

  /* ---------------- recents ---------------- */
  const r = (ids: [string, number][]) => ids.map(([id, h]) => ({ id, at: now - h * HOUR }));
  const recents: Record<string, { id: string; at: number }[]> = {
    'u-mei': r([['df-prism-spec', 0.3], ['df-onboarding-flow', 3], ['df-design-crit', 15], ['df-mei-notes', 26], ['df-onboarding-study', 52], ['df-moodboard', 80], ['df-mei-portfolio', 140]]),
    'u-omar': r([['df-eng-roadmap', 0.5], ['df-rfc-ratelimit', 2], ['df-prism-migration', 6], ['df-capacity-q4', 20], ['df-cloud-costs', 33], ['df-pm-1102', 40], ['df-alex-notes', 50]]),
    'u-alex': r([['df-prism-a11y', 0.4], ['df-prism-readme', 2.5], ['df-prism-button', 8], ['df-prism-migration', 22], ['df-prism-storybook', 36], ['df-alex-notes', 48]]),
    'u-daniel': r([['df-budget-2027', 1], ['df-payroll-oct', 5], ['df-dan-forecast', 21], ['df-cloud-costs', 34], ['df-opex-q3', 70]]),
    'u-layla': r([['df-pm-1102', 0.6], ['df-pentest-q3', 4], ['df-mfa-rollout', 23], ['df-layla-board', 30], ['df-access-review', 60]]),
  };

  return { version: DRIVE_DATA_VERSION, drives, items, requests, policy: defaultPolicy(), recents, prefs: {} };
}
