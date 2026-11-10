/**
 * Demo data for Performance & OKRs — generated relative to `now` so the story always
 * works: Q4 is ~39% elapsed, the Q4 check-in cycle opened 3 days ago (self-reflections
 * due in 12 days), Layla's "Make Helix passwordless" is at risk, Mei's contrast KR has
 * stalled, Daniel's reconciliation automation is off track, Kwame (new hire) has no
 * OKRs yet, Mei has a draft self-reflection and an unacknowledged Q3 review, Omar has
 * five reports with reviews unlocking, and Sara can see ~68% of check-ins submitted.
 *
 * IDs referenced by other apps and Hub notifications are stable (see brief).
 */
import { DEFAULT_QUESTIONS, defaultTemplate, PERF_DATA_VERSION } from './constants';
import { buildPeriods } from './cycle';
import type {
  ActionItem,
  AgendaItem,
  CompetencyId,
  Cycle,
  CycleFeedback,
  Evidence,
  Feedback,
  FeedbackRequest,
  GrowthGoal,
  KeyResult,
  Meeting,
  Objective,
  OkrComment,
  OkrLevel,
  OneOnOneSeries,
  OverallRating,
  PerfData,
  Potential,
  PrivateNote,
  Review,
  Score5,
  UpwardDimension,
  UserLevel,
} from './types';
import type { Department, KudosValue } from '@/types';
import type { BridgeSource } from '@/lib/appBridge';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** People who take part in performance cycles (everyone with Performance access). */
export const PERF_PARTICIPANTS = [
  'u-layla', 'u-sara', 'u-omar', 'u-daniel', 'u-mei', 'u-priya', 'u-lucas', 'u-aisha', 'u-noah',
  'u-fatima', 'u-ethan', 'u-sofia', 'u-yusuf', 'u-hana', 'u-mateo', 'u-grace', 'u-kwame',
];

/** Seed copy of the org chart (the live store reads `managerId` from the hub). */
const MANAGER: Record<string, string | undefined> = {
  'u-layla': undefined, 'u-sara': 'u-layla', 'u-omar': 'u-layla', 'u-daniel': 'u-layla', 'u-mei': 'u-omar', 'u-priya': 'u-omar',
  'u-lucas': 'u-omar', 'u-aisha': 'u-layla', 'u-noah': 'u-aisha', 'u-fatima': 'u-sara', 'u-ethan': 'u-layla', 'u-sofia': 'u-aisha',
  'u-yusuf': 'u-aisha', 'u-hana': 'u-omar', 'u-mateo': 'u-layla', 'u-grace': 'u-layla', 'u-kwame': 'u-omar',
};

const short = (id: string) => id.replace(/^u-/, '');

export function createPerfSeed(now = Date.now()): PerfData {
  const periods = buildPeriods(now);
  const [Q4, Q3, Q2] = periods;
  const ago = (days: number, hours = 0) => now - days * DAY - hours * HOUR;
  const ahead = (days: number, hours = 0) => now + days * DAY + hours * HOUR;
  const endOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(18, 0, 0, 0);
    return d.getTime();
  };
  const at = (start: number, day: number, h = 10) => Math.min(start + day * DAY + h * HOUR, now - 2 * HOUR);

  /* ───────────────────────── OKRs ───────────────────────── */

  const objectives: Objective[] = [];
  const keyResults: KeyResult[] = [];

  const O = (
    id: string,
    title: string,
    level: OkrLevel,
    ownerId: string,
    o: { parent?: string; dept?: Department; co?: string[]; tags?: string[]; desc?: string; private?: boolean; period?: string; closed?: { reflection: string; daysAfterEnd?: number } } = {},
  ) => {
    const period = o.period ?? Q4.id;
    const p = periods.find((x) => x.id === period) ?? Q4;
    objectives.push({
      id,
      title,
      description: o.desc,
      level,
      department: o.dept,
      ownerId,
      coOwnerIds: o.co ?? [],
      periodId: period,
      parentId: o.parent,
      visibility: o.private ? 'private' : 'public',
      tags: o.tags ?? [],
      state: o.closed ? 'closed' : 'active',
      reflection: o.closed?.reflection,
      closedAt: o.closed ? p.end + (o.closed.daysAfterEnd ?? 3) * DAY : undefined,
      closedBy: o.closed ? ownerId : undefined,
      createdAt: p.start - 4 * DAY,
      createdBy: ownerId,
      updatedAt: o.closed ? p.end + 3 * DAY : ago(1),
    });
  };

  type Pt = [day: number, value: number, conf: number, note?: string];
  let order = 0;
  const K = (
    id: string,
    objectiveId: string,
    title: string,
    metric: KeyResult['metric'],
    start: number,
    target: number,
    ownerId: string,
    pts: Pt[],
    x: Partial<Pick<KeyResult, 'unit' | 'decimals' | 'ceiling' | 'score' | 'autoProjectId'>> & { milestones?: [string, number | null][]; periodStart?: number; by?: string } = {},
  ) => {
    const pStart = x.periodStart ?? Q4.start;
    const checkins = pts.map(([d, v, c, note], i) => ({ id: `${id}-c${i + 1}`, at: at(pStart, d, 9 + (i % 4)), value: v, confidence: c, note, byId: x.by ?? ownerId }));
    const last = checkins[checkins.length - 1];
    const milestones = x.milestones?.map(([t, d], i) => ({ id: `${id}-m${i + 1}`, title: t, done: d !== null, doneAt: d !== null ? at(pStart, d) : undefined }));
    keyResults.push({
      id,
      objectiveId,
      title,
      metric,
      start,
      target: metric === 'milestone' ? (milestones?.length ?? target) : target,
      current: metric === 'milestone' ? (milestones?.filter((m) => m.done).length ?? 0) : last ? last.value : start,
      unit: x.unit,
      decimals: x.decimals,
      ceiling: x.ceiling,
      ownerId,
      confidence: last?.confidence ?? 6,
      checkins,
      milestones,
      autoProjectId: x.autoProjectId,
      score: x.score,
      order: order++,
      createdAt: pStart - 3 * DAY,
    });
  };

  // ── Company (Q4) ──
  O('obj-co-passwordless', 'Make Helix passwordless', 'company', 'u-layla', {
    dept: 'IT & Security',
    tags: ['security', 'identity'],
    desc: 'Phishing-resistant sign-in for every employee and every app. Passkeys become mandatory on 15 November.',
  });
  K('kr-passkeys-adoption', 'obj-co-passwordless', 'Passkey enrolment across all employees', 'percent', 62, 95, 'u-ethan', [
    [0, 62, 7],
    [7, 66, 7, 'Pilot wave done — IT & Security and Engineering leads at 100%.'],
    [14, 69, 6],
    [21, 71, 6, 'Enrolment slowing in Sales & Ops; email reminders aren’t landing.'],
    [28, 72.5, 5],
    [34, 73.5, 5, '11 engineers and ~40% of Sales still on passwords. Need manager nudges before enforcement on 15 Nov.'],
  ]);
  K('kr-password-resets', 'obj-co-passwordless', 'Password-reset tickets per month', 'number', 140, 20, 'u-layla', [
    [0, 140, 6],
    [9, 124, 7],
    [17, 103, 7, 'Self-service passkey recovery shipped in IT Helpdesk.'],
    [26, 82, 8],
    [33, 68, 8],
  ], { unit: 'tickets/mo' });

  O('obj-co-design-system', 'Ship one delightful design language', 'company', 'u-mei', {
    co: ['u-omar'],
    dept: 'Design',
    tags: ['prism', 'design-system', 'a11y'],
    desc: 'Prism v4 everywhere: one set of tokens, accessible components and themes across every Helix surface.',
  });
  K('kr-prism-adoption', 'obj-co-design-system', 'Prism v4 adoption across product surfaces', 'percent', 35, 80, 'u-mei', [
    [2, 35, 7],
    [9, 41, 7],
    [16, 46, 8],
    [23, 51, 8, 'HR Portal and Talent Hub fully migrated.'],
    [30, 55, 8],
    [35, 58, 8, 'Cortex next; Spend scheduled after the freeze.'],
  ], { autoProjectId: 'prj-prism' });
  K('kr-a11y-score', 'obj-co-design-system', 'Accessibility score (axe + manual audit)', 'number', 78, 95, 'u-hana', [
    [3, 78, 6],
    [10, 80, 6],
    [18, 82, 7],
    [26, 83, 7],
    [34, 85, 7, 'Focus-order fixes landed in forms; contrast tokens still pending.'],
  ], { unit: 'pts' });

  O('obj-co-gcc-growth', 'Win the GCC enterprise market', 'company', 'u-aisha', {
    dept: 'Sales',
    tags: ['gcc', 'growth'],
    desc: 'Become the default employee platform for enterprises across the Gulf.',
  });
  K('kr-gcc-arr', 'obj-co-gcc-growth', 'New ARR from GCC enterprise', 'currency', 0, 2_400_000, 'u-aisha', [
    [6, 0, 6],
    [13, 180_000, 6],
    [20, 420_000, 7, 'First GCC logo signed — Emirates Logistics.'],
    [27, 690_000, 7],
    [34, 1_020_000, 7, 'Two more contracts in legal review.'],
  ], { unit: 'USD' });
  K('kr-gcc-logos', 'obj-co-gcc-growth', 'New GCC enterprise logos signed', 'number', 0, 6, 'u-noah', [
    [10, 0, 6],
    [20, 1, 7, 'Emirates Logistics signed!'],
    [27, 2, 7],
    [34, 2, 7],
  ], { unit: 'logos' });

  O('obj-co-reliability', 'Rock-solid platform', 'company', 'u-omar', {
    dept: 'Engineering',
    tags: ['reliability', 'platform'],
    desc: 'Customers should never have to think about Helix being up.',
  });
  K('kr-uptime', 'obj-co-reliability', 'Platform uptime (rolling 30 days)', 'percent', 99.9, 99.95, 'u-lucas', [
    [5, 99.9, 7],
    [12, 99.91, 7],
    [19, 99.92, 8],
    [26, 99.92, 7, 'The Oct 14 P1 cost us 18 minutes of downtime.'],
    [33, 99.93, 8],
  ], { decimals: 2 });
  K('kr-p1-incidents', 'obj-co-reliability', 'P1 incidents this quarter', 'number', 0, 2, 'u-omar', [
    [7, 0, 8],
    [14, 1, 6, 'Oct 14: cache stampede took search down for 18 minutes.'],
    [21, 1, 6],
    [28, 1, 7],
    [35, 1, 7],
  ], { unit: 'P1s', ceiling: true });

  O('obj-co-people', 'The best place to grow', 'company', 'u-sara', {
    dept: 'People Ops',
    tags: ['people', 'growth'],
    desc: 'Fast, humane onboarding and a real feedback culture — every quarter, for everyone.',
  });
  K('kr-onboarding-time', 'obj-co-people', 'Days to productivity for new hires', 'number', 45, 30, 'u-sara', [
    [4, 45, 7],
    [14, 43, 7],
    [24, 40, 8, '30-60-90 plans now auto-created from HR Portal journeys.'],
    [33, 38, 8],
  ], { unit: 'days' });
  K('kr-checkin-completion', 'obj-co-people', 'Quarterly check-in completion', 'percent', 0, 100, 'u-sara', [
    [5, 0, 7],
    [33, 41, 8, 'Q4 cycle launched; 41% submitted in the first day.'],
    [35, 68, 8, '68% submitted org-wide — nudging the rest.'],
  ]);

  // ── Team (Q4) ──
  O('obj-eng-passkeys', 'Roll passkeys out across Engineering', 'team', 'u-omar', { parent: 'obj-co-passwordless', dept: 'Engineering', tags: ['security'] });
  K('kr-eng-passkeys', 'obj-eng-passkeys', 'Engineers enrolled in passkeys', 'percent', 70, 100, 'u-omar', [
    [3, 70, 8],
    [10, 76, 8],
    [17, 81, 8],
    [24, 84, 7],
    [31, 86, 7, '11 engineers left — mostly on-call folks waiting on hardware keys.'],
  ]);
  K('kr-eng-legacy-auth', 'obj-eng-passkeys', 'Legacy password-only services retired', 'milestone', 0, 4, 'u-priya', [
    [6, 1, 7],
    [19, 2, 7],
    [33, 2, 6, 'Internal tools blocked on vendor SSO support.'],
  ], { milestones: [['Inventory services', 6], ['Migrate CI/CD', 19], ['Migrate internal tools', null], ['Retire LDAP fallback', null]] });

  O('obj-eng-reliability', 'Make the platform boringly reliable', 'team', 'u-omar', { parent: 'obj-co-reliability', dept: 'Engineering', tags: ['sre'] });
  K('kr-eng-mttr', 'obj-eng-reliability', 'Mean time to recover (P1/P2)', 'number', 95, 30, 'u-lucas', [
    [4, 95, 6],
    [13, 81, 6],
    [22, 68, 7],
    [31, 57, 7, 'New paging runbooks cut triage time.'],
  ], { unit: 'min' });
  K('kr-eng-slo', 'obj-eng-reliability', 'Services with SLOs and alerts', 'percent', 40, 90, 'u-lucas', [
    [6, 40, 6],
    [16, 46, 6],
    [26, 52, 6],
    [34, 57, 6],
  ]);

  O('obj-dsn-prism', 'Make Prism v4 the default for every surface', 'team', 'u-mei', { parent: 'obj-co-design-system', dept: 'Design', tags: ['prism'] });
  K('kr-dsn-components', 'obj-dsn-prism', 'Core components migrated to Prism tokens', 'number', 12, 40, 'u-mei', [
    [3, 12, 7],
    [10, 16, 7],
    [17, 21, 8],
    [24, 25, 8],
    [31, 28, 8],
    [35, 29, 8],
  ], { unit: 'components' });
  K('kr-dsn-contrast', 'obj-dsn-prism', 'Token pairs passing WCAG 2.2 AA contrast', 'percent', 71, 100, 'u-mei', [
    [5, 71, 7],
    [14, 74, 6],
    [21, 74, 5, 'Blocked: brand palette sign-off from Marketing.'],
    [28, 74, 4],
    [35, 74, 4, 'Still waiting on brand sign-off — the contrast audit is overdue.'],
  ]);

  O('obj-gtm-pipeline', 'Build a GCC pipeline we can bank on', 'team', 'u-aisha', { parent: 'obj-co-gcc-growth', dept: 'Sales', tags: ['gcc', 'pipeline'] });
  K('kr-gtm-pipeline', 'obj-gtm-pipeline', 'Qualified GCC pipeline', 'currency', 0, 6_000_000, 'u-noah', [
    [5, 600_000, 7],
    [12, 1_400_000, 7],
    [19, 2_100_000, 8],
    [26, 2_700_000, 8],
    [33, 3_100_000, 8],
  ], { unit: 'USD' });
  K('kr-gtm-references', 'obj-gtm-pipeline', 'Referenceable GCC customers', 'number', 0, 4, 'u-yusuf', [
    [8, 0, 6],
    [22, 1, 5],
    [33, 1, 5, 'Pilots love it, but legal approval for case studies is slow.'],
  ], { unit: 'customers' });

  O('obj-mkt-brand', 'Make Helix the name GCC CIOs know', 'team', 'u-sofia', { parent: 'obj-co-gcc-growth', dept: 'Marketing', tags: ['brand'] });
  K('kr-mkt-sov', 'obj-mkt-brand', 'Share of voice in GCC enterprise media', 'percent', 4, 15, 'u-sofia', [
    [6, 4, 6],
    [16, 5.5, 6],
    [26, 7, 7],
    [34, 8.5, 7, 'Gulf Business feature published.'],
  ], { decimals: 1 });
  K('kr-mkt-roundtable', 'obj-mkt-brand', 'GCC CIO roundtable', 'milestone', 0, 4, 'u-sofia', [
    [9, 1, 7],
    [25, 2, 7],
  ], { milestones: [['Venue & date', 9], ['Speakers confirmed', 25], ['40 CIOs registered', null], ['Roundtable delivered', null]] });

  O('obj-ppl-onboarding', 'Onboarding that makes people productive fast', 'team', 'u-sara', { parent: 'obj-co-people', dept: 'People Ops', tags: ['onboarding'] });
  K('kr-ppl-plans', 'obj-ppl-onboarding', 'New hires with a 30-60-90 plan by day 3', 'percent', 50, 100, 'u-fatima', [
    [4, 50, 7],
    [15, 65, 8],
    [25, 78, 8],
    [34, 85, 8],
  ]);
  K('kr-ppl-enps', 'obj-ppl-onboarding', 'New-hire eNPS', 'number', 31, 50, 'u-sara', [
    [10, 31, 6],
    [34, 36, 6, 'Response rate is low — only 9 new hires this quarter.'],
  ], { unit: 'eNPS' });

  O('obj-ppl-feedback', 'Make feedback a weekly habit', 'team', 'u-sara', { parent: 'obj-co-people', dept: 'People Ops', tags: ['feedback'] });
  K('kr-ppl-weekly', 'obj-ppl-feedback', 'Employees giving feedback every week', 'percent', 22, 60, 'u-sara', [
    [3, 22, 6],
    [13, 28, 7],
    [23, 33, 7],
    [33, 39, 7],
  ]);

  O('obj-fin-close', 'Close the books in 3 days', 'team', 'u-grace', { dept: 'Finance', tags: ['close', 'automation'] });
  K('kr-fin-close', 'obj-fin-close', 'Month-end close duration', 'number', 8, 3, 'u-grace', [
    [2, 8, 7],
    [31, 5, 7, 'October close done in 5 days.'],
  ], { unit: 'days' });
  K('kr-fin-recon', 'obj-fin-close', 'Reconciliations automated', 'percent', 20, 75, 'u-daniel', [
    [6, 20, 6],
    [20, 24, 5],
    [34, 29, 4, 'Bank feed API access is still pending (Cloud Console request).'],
  ]);

  O('obj-sec-passkeys', 'Passkeys for every account, zero lockouts', 'team', 'u-layla', { parent: 'obj-co-passwordless', dept: 'IT & Security', tags: ['security'] });
  K('kr-sec-recovery', 'obj-sec-passkeys', 'Passkey recovery tickets resolved within 4h', 'percent', 60, 95, 'u-ethan', [
    [4, 60, 7],
    [14, 72, 8],
    [24, 81, 8],
    [33, 86, 8],
  ]);
  K('kr-sec-phish', 'obj-sec-passkeys', 'Phishing simulation click rate', 'percent', 9, 3, 'u-ethan', [
    [12, 9, 6],
    [33, 6.5, 7, 'October simulation: 6.5% clicked, down from 9%.'],
  ], { decimals: 1 });

  // ── Individual (Q4) ──
  O('obj-mei-docs', 'Make Prism easy to adopt', 'individual', 'u-mei', { parent: 'obj-dsn-prism', dept: 'Design', tags: ['docs'] });
  K('kr-mei-docs', 'obj-mei-docs', 'Prism docs pages with live examples', 'number', 10, 45, 'u-mei', [
    [4, 10, 7],
    [11, 15, 8],
    [18, 21, 8],
    [25, 26, 8],
    [32, 30, 8],
    [35, 31, 8],
  ], { unit: 'pages' });
  K('kr-mei-office-hours', 'obj-mei-docs', 'Teams onboarded through Prism office hours', 'number', 0, 8, 'u-mei', [
    [7, 1, 7],
    [21, 2, 6],
    [35, 3, 6],
  ], { unit: 'teams' });

  O('obj-mei-research', 'Grow as a research-led designer', 'individual', 'u-mei', { dept: 'Design', private: true, tags: ['growth'] });
  K('kr-mei-studies', 'obj-mei-research', 'Usability studies run with customers', 'number', 0, 6, 'u-mei', [
    [12, 1, 7],
    [26, 2, 7],
  ], { unit: 'studies' });

  O('obj-priya-query', 'Make analytics queries feel instant', 'individual', 'u-priya', { parent: 'obj-eng-reliability', dept: 'Engineering', tags: ['performance'] });
  K('kr-priya-p99', 'obj-priya-query', 'p99 analytics query latency', 'number', 1800, 600, 'u-priya', [
    [2, 1800, 7],
    [9, 1620, 7],
    [16, 1310, 8, 'Query planner v2 at 50% of traffic.'],
    [23, 1090, 8],
    [30, 1010, 8],
    [34, 980, 9, 'Planner rewrite cut p99 by 40%; three BI teams unblocked.'],
  ], { unit: 'ms' });
  K('kr-priya-planner', 'obj-priya-query', 'Query planner v2 rollout', 'milestone', 0, 4, 'u-priya', [
    [3, 1, 8],
    [12, 2, 8],
    [16, 3, 8],
  ], { milestones: [['Design RFC', 3], ['Shadow traffic', 12], ['50% rollout', 16], ['100% rollout', null]] });

  O('obj-lucas-oncall', 'A calmer on-call', 'individual', 'u-lucas', { parent: 'obj-eng-reliability', dept: 'Engineering', tags: ['sre'] });
  K('kr-lucas-pages', 'obj-lucas-oncall', 'Pages per on-call week', 'number', 14, 5, 'u-lucas', [
    [5, 14, 6],
    [12, 12, 6],
    [19, 11, 6],
    [26, 9, 7],
    [33, 8, 7],
  ], { unit: 'pages' });
  K('kr-lucas-runbooks', 'obj-lucas-oncall', 'Alerts with a linked runbook', 'percent', 45, 100, 'u-lucas', [
    [6, 45, 6],
    [13, 49, 6],
    [20, 52, 5],
    [27, 55, 5],
    [34, 58, 5, 'Writing runbooks keeps losing to incident follow-ups.'],
  ]);

  O('obj-hana-research', 'Put customers in every Prism decision', 'individual', 'u-hana', { parent: 'obj-dsn-prism', dept: 'Design', tags: ['research'] });
  K('kr-hana-interviews', 'obj-hana-research', 'Customer interviews synthesized', 'number', 0, 24, 'u-hana', [
    [6, 2, 7],
    [13, 5, 7],
    [20, 8, 8],
    [27, 10, 8],
    [34, 12, 8],
  ], { unit: 'interviews' });
  K('kr-hana-insights', 'obj-hana-research', 'Research insights adopted into the Prism backlog', 'number', 0, 10, 'u-hana', [
    [10, 1, 6],
    [24, 3, 7],
    [34, 4, 7],
  ], { unit: 'insights' });

  O('obj-omar-team', 'Grow a team that ships with joy', 'individual', 'u-omar', { parent: 'obj-co-people', dept: 'Engineering', tags: ['hiring', 'engagement'] });
  K('kr-omar-hires', 'obj-omar-team', 'Senior engineers hired', 'number', 0, 2, 'u-omar', [
    [14, 0, 6],
    [30, 1, 7, 'Arjun Iyer accepted!'],
  ], { unit: 'hires' });
  K('kr-omar-pulse', 'obj-omar-team', 'Team engagement pulse', 'number', 3.8, 4.3, 'u-omar', [
    [7, 3.8, 6],
    [21, 3.9, 6],
    [35, 4.0, 6],
  ], { unit: '/ 5', decimals: 1 });

  O('obj-noah-logos', 'Close the first GCC logos', 'individual', 'u-noah', { parent: 'obj-gtm-pipeline', dept: 'Sales' });
  K('kr-noah-logos', 'obj-noah-logos', 'Enterprise logos closed', 'number', 0, 3, 'u-noah', [
    [20, 1, 7],
    [27, 2, 8],
  ], { unit: 'logos' });
  K('kr-noah-calls', 'obj-noah-logos', 'Discovery calls with GCC CIOs', 'number', 0, 30, 'u-noah', [
    [7, 5, 7],
    [14, 9, 7],
    [21, 13, 8],
    [28, 16, 8],
    [35, 18, 8],
  ], { unit: 'calls' });

  O('obj-yusuf-references', 'Turn GCC pilots into references', 'individual', 'u-yusuf', { parent: 'obj-gtm-pipeline', dept: 'Customer Success' });
  K('kr-yusuf-qbr', 'obj-yusuf-references', 'Pilot QBRs with an exec sponsor', 'number', 0, 5, 'u-yusuf', [
    [12, 1, 6],
    [26, 2, 6],
  ], { unit: 'QBRs' });
  K('kr-yusuf-csat', 'obj-yusuf-references', 'Pilot CSAT', 'number', 4.1, 4.6, 'u-yusuf', [
    [8, 4.1, 7],
    [22, 4.3, 7],
    [33, 4.4, 8],
  ], { unit: '/ 5', decimals: 1 });

  O('obj-fatima-hiring', 'Hire the GCC go-to-market team', 'individual', 'u-fatima', { parent: 'obj-co-gcc-growth', dept: 'People Ops', tags: ['hiring'] });
  K('kr-fatima-hires', 'obj-fatima-hiring', 'GCC go-to-market hires accepted', 'number', 0, 5, 'u-fatima', [
    [10, 1, 7],
    [24, 2, 7],
    [33, 2, 6],
  ], { unit: 'hires' });
  K('kr-fatima-tto', 'obj-fatima-hiring', 'Time to offer', 'number', 38, 25, 'u-fatima', [
    [5, 38, 6],
    [19, 34, 7],
    [33, 31, 7],
  ], { unit: 'days' });

  O('obj-daniel-recon', 'Automate bank reconciliations', 'individual', 'u-daniel', { parent: 'obj-fin-close', dept: 'Finance' });
  K('kr-daniel-feeds', 'obj-daniel-recon', 'Bank feeds connected', 'milestone', 0, 3, 'u-daniel', [
    [15, 1, 6],
    [34, 1, 4, 'Blocked on Cloud Console access for the bank API.'],
  ], { milestones: [['Emirates NBD', 15], ['HSBC UK', null], ['DBS Singapore', null]] });

  O('obj-ethan-phish', 'Make phishing boring', 'individual', 'u-ethan', { parent: 'obj-sec-passkeys', dept: 'IT & Security' });
  K('kr-ethan-sims', 'obj-ethan-phish', 'Phishing simulations run', 'number', 0, 3, 'u-ethan', [
    [12, 1, 8],
    [33, 2, 8],
  ], { unit: 'simulations' });

  O('obj-mateo-allhands', 'Run a memorable Q4 All-Hands', 'individual', 'u-mateo', { parent: 'obj-co-people', dept: 'Operations', tags: ['events'] });
  K('kr-mateo-allhands', 'obj-mateo-allhands', 'All-Hands delivery milestones', 'milestone', 0, 4, 'u-mateo', [
    [28, 1, 8],
    [33, 2, 8],
  ], { milestones: [['Venue & budget', 28], ['Agenda & speakers', 33], ['AV rehearsal', null], ['All-Hands delivered', null]] });

  // ── Q3 history (closed & graded) ──
  const q3 = { period: Q3.id };
  const K3 = (id: string, obj: string, title: string, metric: KeyResult['metric'], start: number, target: number, owner: string, pts: Pt[], score: number, x: Parameters<typeof K>[8] = {}) =>
    K(id, obj, title, metric, start, target, owner, pts, { ...x, score, periodStart: Q3.start });
  O('obj-q3-sso', 'Single sign-on for every internal app', 'company', 'u-layla', { ...q3, dept: 'IT & Security', closed: { reflection: 'SSO landed for 92% of apps. The long tail of legacy tools moves into Q4’s passwordless objective.' } });
  K3('kr-q3-sso-apps', 'obj-q3-sso', 'Internal apps behind SSO', 'percent', 40, 100, 'u-ethan', [[5, 40, 7], [30, 61, 7], [60, 80, 8], [88, 92, 8]], 0.9);
  K3('kr-q3-sso-tickets', 'obj-q3-sso', 'Login tickets per month', 'number', 210, 140, 'u-layla', [[5, 210, 6], [45, 178, 7], [88, 150, 7]], 0.8, { unit: 'tickets/mo' });
  O('obj-q3-prism-beta', 'Ship the Prism v4 beta', 'team', 'u-mei', { ...q3, dept: 'Design', closed: { reflection: 'Beta shipped to three pilot teams; adoption tooling slipped into Q4.' } });
  K3('kr-q3-prism-beta', 'obj-q3-prism-beta', 'Beta components shipped', 'number', 0, 30, 'u-mei', [[10, 4, 7], [40, 13, 7], [70, 20, 7], [88, 24, 7]], 0.8, { unit: 'components' });
  K3('kr-q3-prism-teams', 'obj-q3-prism-beta', 'Teams piloting Prism', 'number', 0, 4, 'u-mei', [[30, 1, 6], [60, 2, 6], [88, 3, 7]], 0.7, { unit: 'teams' });
  O('obj-q3-eu-cell', 'EU-Cell failover & disaster recovery', 'team', 'u-omar', { ...q3, dept: 'Engineering', closed: { reflection: 'Zero-downtime cutover and two clean chaos drills. Best infra quarter yet.' } });
  K3('kr-q3-eu-rto', 'obj-q3-eu-cell', 'Region failover recovery time', 'number', 60, 15, 'u-lucas', [[5, 60, 6], [40, 35, 7], [80, 12, 9]], 1, { unit: 'min' });
  K3('kr-q3-eu-drill', 'obj-q3-eu-cell', 'Chaos drills completed', 'number', 0, 2, 'u-lucas', [[50, 1, 8], [75, 2, 9]], 1, { unit: 'drills' });
  O('obj-q3-gcc', 'Launch GCC go-to-market', 'company', 'u-aisha', { ...q3, dept: 'Sales', closed: { reflection: 'Pilots started faster than expected; pipeline quality lagged volume.' } });
  K3('kr-q3-gcc-pipeline', 'obj-q3-gcc', 'Qualified GCC pipeline', 'currency', 0, 3_000_000, 'u-noah', [[20, 300_000, 6], [55, 1_100_000, 6], [88, 1_800_000, 6]], 0.6, { unit: 'USD' });
  K3('kr-q3-gcc-pilots', 'obj-q3-gcc', 'Enterprise pilots started', 'number', 0, 5, 'u-yusuf', [[30, 1, 7], [60, 3, 7], [85, 4, 8]], 0.8, { unit: 'pilots' });
  O('obj-q3-checkins', 'Launch quarterly check-ins', 'company', 'u-sara', { ...q3, dept: 'People Ops', closed: { reflection: '97% completion in the first cycle — managers asked for better evidence, which shaped Q4.' } });
  K3('kr-q3-checkins-done', 'obj-q3-checkins', 'Q3 check-in completion', 'percent', 0, 100, 'u-sara', [[75, 40, 7], [85, 81, 8], [90, 97, 9]], 1);
  O('obj-q3-mei', 'Ship the onboarding redesign', 'individual', 'u-mei', { ...q3, parent: 'obj-q3-prism-beta', dept: 'Design', closed: { reflection: 'Activation up 12 points; customers noticed.' } });
  K3('kr-q3-mei-activation', 'obj-q3-mei', 'New-user activation', 'percent', 41, 55, 'u-mei', [[10, 41, 7], [45, 46, 7], [80, 51, 8], [89, 53, 8]], 0.9);
  O('obj-q3-priya', 'Cross-region replication', 'individual', 'u-priya', { ...q3, parent: 'obj-q3-eu-cell', dept: 'Engineering', closed: { reflection: 'Replication lag p99 at 420 ms, beating the target.' } });
  K3('kr-q3-priya-lag', 'obj-q3-priya', 'Replication lag p99', 'number', 4000, 500, 'u-priya', [[10, 4000, 6], [40, 1900, 7], [70, 800, 8], [85, 420, 9]], 1, { unit: 'ms' });

  /* ───────────────────────── OKR comments ───────────────────────── */

  let cn = 0;
  const C = (objectiveId: string, authorId: string, t: number, body: string, kind: OkrComment['kind'] = 'comment'): OkrComment => ({ id: `cm-${++cn}`, objectiveId, authorId, at: t, body, kind });
  const comments: OkrComment[] = [
    C('obj-co-passwordless', 'u-layla', ago(0, 5), 'Enforcement goes live on 15 Nov. Engineering is at 86% — Omar, can your managers nudge the last 11 this week?', 'update'),
    C('obj-co-passwordless', 'u-omar', ago(0, 4), 'On it — adding it to every 1:1 agenda this week and pairing on-call folks with spare hardware keys.'),
    C('obj-co-passwordless', 'u-ethan', ago(1, 3), 'Recovery flow is holding up: 86% of passkey tickets resolved in under 4 hours.'),
    C('obj-dsn-prism', 'u-mei', ago(2), 'Contrast audit is blocked on the brand palette sign-off. Escalating to Sofia today.', 'update'),
    C('obj-dsn-prism', 'u-sofia', ago(1, 6), 'Brand review is on Thursday — we’ll sign off the palette then.'),
    C('obj-co-gcc-growth', 'u-aisha', ago(4), 'First logo signed (Emirates Logistics). Two more contracts in legal review.', 'update'),
    C('obj-co-reliability', 'u-omar', ago(9), 'Oct 14 P1 postmortem published. Cache-stampede protection is rolled out everywhere.', 'update'),
    C('obj-fin-close', 'u-grace', ago(5), 'October close in 5 days. Reconciliation automation is now the bottleneck.', 'update'),
    C('obj-priya-query', 'u-omar', ago(0, 3), 'The planner rewrite unblocked three teams. Incredible work, Priya.'),
  ];

  /* ───────────────────────── Cycles ───────────────────────── */

  const q4Launch = ago(3, 2);
  const cycles: Cycle[] = [
    {
      id: 'cyc-2026-q4',
      name: `${Q4.label} Check-in`,
      periodId: Q4.id,
      status: 'active',
      phases: [
        { key: 'self', start: q4Launch, end: endOfDay(ahead(12)) },
        { key: 'peer', start: q4Launch, end: endOfDay(ahead(16)) },
        { key: 'manager', start: q4Launch, end: endOfDay(ahead(24)) },
        { key: 'calibration', start: endOfDay(ahead(24)), end: endOfDay(ahead(28)) },
        { key: 'release', start: endOfDay(ahead(28)), end: endOfDay(ahead(35)) },
      ],
      departments: null,
      participantIds: [...PERF_PARTICIPANTS],
      templateId: 'tpl-quarterly',
      peerAnonymous: true,
      upwardMin: 3,
      createdAt: ago(10),
      createdBy: 'u-sara',
      launchedAt: q4Launch,
    },
  ];
  const pastCycle = (id: string, label: string, periodId: string, end: number, participants: string[]): Cycle => ({
    id,
    name: `${label} Check-in`,
    periodId,
    status: 'closed',
    phases: [
      { key: 'self', start: end - 16 * DAY, end: end - 4 * DAY },
      { key: 'peer', start: end - 16 * DAY, end },
      { key: 'manager', start: end - 16 * DAY, end: end + 8 * DAY },
      { key: 'calibration', start: end + 8 * DAY, end: end + 12 * DAY },
      { key: 'release', start: end + 12 * DAY, end: end + 19 * DAY },
    ],
    departments: null,
    participantIds: participants,
    templateId: 'tpl-quarterly',
    peerAnonymous: true,
    upwardMin: 3,
    createdAt: end - 25 * DAY,
    createdBy: 'u-sara',
    launchedAt: end - 16 * DAY,
    calibrationLockedAt: end + 12 * DAY,
    calibrationLockedBy: 'u-sara',
  });
  const past = PERF_PARTICIPANTS.filter((u) => u !== 'u-kwame');
  cycles.push(pastCycle('cyc-2026-q3', Q3.label, Q3.id, Q3.end, past), pastCycle('cyc-2026-q2', Q2.label, Q2.id, Q2.end, past));

  /* ───────────────────────── Reviews ───────────────────────── */

  type R5 = [Score5, Score5, Score5, Score5, Score5];
  const ratingsOf = (r: R5): Partial<Record<CompetencyId, Score5>> => ({ craft: r[0], collaboration: r[1], ownership: r[2], impact: r[3], customer: r[4] });
  const ans = (a: [string, string, string, string]) => Object.fromEntries(DEFAULT_QUESTIONS.map((q, i) => [q.id, a[i]]));

  interface Profile {
    q3: { overall: OverallRating; potential: Potential; mgr: R5; self: R5; summary: [string, string, string, string]; selfA: [string, string, string, string]; cal?: [1 | 2 | 3, 1 | 2 | 3, string] };
    q2: { overall: OverallRating; potential: Potential; mgr: R5 };
    q4self?: { status: 'draft' | 'submitted'; a: [string, string, string, string]; r?: R5; daysAgo: number };
  }

  const PROFILES: Record<string, Profile> = {
    'u-mei': {
      q3: {
        overall: 'exceeds',
        potential: 'high',
        mgr: [5, 4, 3, 4, 5],
        self: [4, 4, 3, 4, 5],
        summary: [
          'Mei, the onboarding redesign was the standout launch of the quarter: activation rose from 41% to 53% and customers wrote in to thank us.',
          'You grew as a facilitator — design crits are sharper and more inclusive. Next, grow your ownership of cross-team risks: the Prism beta adoption tooling slipped and I heard about it late.',
          'Dependencies on Marketing for brand tokens slowed you down. I’ll broker earlier alignment with Sofia’s team.',
          'Lead Prism v4 to GA, and raise risks within a day of spotting them.',
        ],
        selfA: [
          'Shipped the onboarding redesign (activation 41% → 53%) and the Prism v4 beta with 24 components.',
          'Facilitating design crits and partnering with research. I learned to bring data to design debates.',
          'Brand token decisions took weeks. I should have escalated sooner.',
          'Prism v4 GA and better adoption tooling.',
        ],
      },
      q2: { overall: 'meets', potential: 'high', mgr: [4, 4, 3, 3, 4] },
      q4self: {
        status: 'draft',
        daysAgo: 1,
        a: [
          'Shipped Prism v4 tokens to the HR Portal and Talent Hub, taking adoption from 35% to 58% of product surfaces.',
          '',
          '',
          '',
        ],
        r: [5, 4, 4, 4, 5],
      },
    },
    'u-priya': {
      q3: {
        overall: 'exceptional',
        potential: 'high',
        mgr: [5, 4, 5, 5, 3],
        self: [5, 4, 4, 5, 3],
        summary: [
          'Priya, cross-region replication landed with p99 lag at 420 ms against a 500 ms target, and the zero-downtime EU-Cell cutover was flawless.',
          'You stepped up as a technical leader across teams. Next: let others own more of the hard problems so you are not the bottleneck.',
          'Too many decisions route through you. I’ll create space by moving two reviews to Lucas.',
          'Query planner v2 and growing two engineers into owners of the data path.',
        ],
        selfA: [
          'Cross-region replication (p99 lag 420 ms) and the EU-Cell cutover with zero downtime.',
          'Writing RFCs that other teams adopted.',
          'Review load. I am a bottleneck on database changes.',
          'Query planner v2; mentoring.',
        ],
      },
      q2: { overall: 'exceeds', potential: 'high', mgr: [5, 4, 4, 4, 3] },
      q4self: {
        status: 'submitted',
        daysAgo: 1,
        a: [
          'My biggest win was the query planner v2 rewrite: p99 analytics latency dropped from 1,800 ms to 980 ms (40%), which unblocked three BI teams that had parked dashboards. I also wrote the Theming API RFC for Prism and led the zero-downtime EU-Cell cutover early in the quarter.',
          'I grew in delegation: Lucas now owns the replication runbooks and Kwame shipped the planner metrics dashboard with my coaching. Omar pushed me to stop being the reviewer of last resort, and I moved two review areas to others.',
          'The last 50% of the planner rollout is waiting on the year-end freeze. Internal tools migration for passkeys is blocked on vendor SSO support.',
          'Finish the planner rollout after the freeze, retire the LDAP fallback, and help Kwame own the freshness SLA end to end.',
        ],
        r: [5, 4, 5, 5, 3],
      },
    },
    'u-lucas': {
      q3: {
        overall: 'meets',
        potential: 'medium',
        mgr: [4, 4, 3, 3, 3],
        self: [4, 4, 4, 4, 3],
        summary: [
          'Lucas, two clean chaos drills and the region failover RTO at 12 minutes made the EU-Cell project a success.',
          'Your incident leadership grew a lot. Next, invest in the boring work — runbooks and alert hygiene — so on-call is sustainable.',
          'Incident follow-ups crowded out planned work. We’ll protect one runbook day per sprint.',
          'Runbook coverage and SLOs for every tier-1 service.',
        ],
        selfA: ['Chaos drills and failover RTO.', 'Incident command.', 'Too many follow-ups.', 'Runbooks and SLOs.'],
        cal: [2, 2, 'Calibrated from Exceeds to Meets: strong drills, but runbook and SLO commitments slipped.'],
      },
      q2: { overall: 'meets', potential: 'medium', mgr: [4, 3, 3, 3, 3] },
    },
    'u-hana': {
      q3: {
        overall: 'meets',
        potential: 'high',
        mgr: [3, 4, 3, 3, 5],
        self: [3, 4, 3, 3, 5],
        summary: [
          'Hana, your onboarding research shaped the redesign that lifted activation by 12 points.',
          'You built strong partnerships with design and product. Next, share synthesis earlier so decisions don’t wait for the final readout.',
          'Recruiting participants took too long; we’ll set up a research panel.',
          'Research ops for Prism and a customer panel.',
        ],
        selfA: ['Onboarding research.', 'Synthesis.', 'Recruiting participants.', 'Research ops.'],
      },
      q2: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 4] },
      q4self: {
        status: 'submitted',
        daysAgo: 2,
        a: [
          'I synthesized 12 customer interviews into the Prism decision log and four insights are already in the backlog. I also ran the icon set audit, consolidating 312 icons into 118.',
          'I now share weekly synthesis snapshots instead of waiting for a final readout — Omar’s feedback from Q3 landed.',
          'Recruiting GCC participants is slow without a panel.',
          'Stand up a research panel and reach 24 interviews.',
        ],
        r: [3, 4, 4, 3, 5],
      },
    },
    'u-kwame': {
      q3: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 3], self: [3, 3, 3, 3, 3], summary: ['', '', '', ''], selfA: ['', '', '', ''] },
      q2: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 3] },
      q4self: {
        status: 'submitted',
        daysAgo: 0,
        a: [
          'In my first month I shipped my starter task (a dbt freshness test) which caught a stale revenue table on day 6, and I built the planner metrics dashboard with Priya.',
          'I learned our data platform and on-call basics. Priya’s pairing sessions were the fastest way to ramp.',
          'Access requests took a few days at the start.',
          'Set my first OKRs with Omar and own the data freshness SLA.',
        ],
        r: [3, 3, 3, 2, 3],
      },
    },
    'u-omar': {
      q3: {
        overall: 'exceeds',
        potential: 'high',
        mgr: [4, 5, 4, 5, 3],
        self: [4, 4, 4, 4, 3],
        summary: [
          'Omar, the EU-Cell programme and the year-end release plan were delivered calmly and on time, and your team’s engagement rose.',
          'You are a trusted partner to other leaders. Next: delegate platform decisions to Priya and Lucas so you can focus on the org.',
          'Hiring took longer than planned. Talent is prioritising your senior requisitions.',
          'Hire two senior engineers and grow Priya’s technical leadership.',
        ],
        selfA: ['EU-Cell, release plan.', 'Coaching.', 'Hiring.', 'Delegation.'],
      },
      q2: { overall: 'exceeds', potential: 'high', mgr: [4, 4, 4, 4, 3] },
      q4self: { status: 'draft', daysAgo: 2, a: ['The year-end release plan, the passkey rollout across Engineering (70% → 86%) and hiring Arjun Iyer.', '', '', ''] },
    },
    'u-sara': {
      q3: {
        overall: 'exceeds',
        potential: 'high',
        mgr: [4, 5, 4, 4, 4],
        self: [4, 4, 4, 4, 4],
        summary: ['Sara, you launched quarterly check-ins with 97% completion.', 'You brought managers along. Next: data-driven calibration.', 'Tooling gaps — now addressed by Performance & OKRs.', 'Feedback culture and onboarding speed.'],
        selfA: ['Launched check-ins.', 'Change management.', 'Tooling.', 'Calibration.'],
      },
      q2: { overall: 'exceeds', potential: 'high', mgr: [4, 4, 4, 4, 4] },
      q4self: {
        status: 'submitted',
        daysAgo: 1,
        a: [
          'Launched the Q4 cycle to 17 people with evidence-based reviews, and cut days-to-productivity from 45 to 38 with auto-created 30-60-90 plans.',
          'I grew in using data for people decisions.',
          'New-hire survey response rates are low.',
          'Calibration pre-reads and a weekly feedback habit.',
        ],
        r: [4, 5, 4, 4, 4],
      },
    },
    'u-layla': {
      q3: { overall: 'exceeds', potential: 'high', mgr: [5, 4, 5, 5, 4], self: [4, 4, 5, 5, 4], summary: ['', '', '', ''], selfA: ['SSO for 92% of apps.', 'Leading through change.', 'Legacy tools.', 'Passwordless.'] },
      q2: { overall: 'exceeds', potential: 'high', mgr: [5, 4, 5, 5, 4] },
    },
    'u-daniel': {
      q3: { overall: 'meets', potential: 'medium', mgr: [4, 3, 3, 3, 2], self: [4, 3, 3, 3, 2], summary: ['Daniel, the FinOps cost model is now the source of truth for cloud spend.', 'Grow your influence beyond Finance.', 'Data access delays.', 'Reconciliation automation.'], selfA: ['FinOps model.', 'SQL.', 'Access.', 'Automation.'] },
      q2: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 2] },
      q4self: { status: 'submitted', daysAgo: 2, a: ['Mapped the close checklist to Payroll Console exports and connected the first bank feed.', 'Automation tooling.', 'Cloud Console access for the bank API is still pending.', 'Connect HSBC and DBS feeds.'], r: [4, 3, 3, 3, 2] },
    },
    'u-aisha': {
      q3: { overall: 'exceeds', potential: 'high', mgr: [3, 4, 4, 4, 4], self: [3, 4, 4, 4, 4], summary: ['Aisha, four GCC pilots started in one quarter.', 'Grow pipeline discipline across the team.', 'Pipeline quality lagged volume.', 'First logos.'], selfA: ['Pilots.', 'Team building.', 'Pipeline quality.', 'Logos.'] },
      q2: { overall: 'meets', potential: 'high', mgr: [3, 4, 3, 4, 4] },
      q4self: { status: 'draft', daysAgo: 3, a: ['First GCC logo signed and $1.02M new ARR so far.', '', '', ''] },
    },
    'u-noah': {
      q3: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 4], self: [3, 3, 3, 3, 4], summary: ['Noah, account plans for the first cohort were excellent.', 'Tighten CRM hygiene.', 'Long legal cycles.', 'Close first logos.'], selfA: ['Account plans.', 'Discovery.', 'Legal.', 'Logos.'] },
      q2: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 3] },
      q4self: { status: 'submitted', daysAgo: 2, a: ['Signed Emirates Logistics, our first GCC logo, and a second one two weeks later. Built $3.1M of qualified pipeline.', 'Discovery calls with CIOs.', 'CRM hygiene is still a weak spot.', 'Close a third logo.'], r: [3, 3, 3, 4, 4] },
    },
    'u-fatima': {
      q3: { overall: 'meets', potential: 'high', mgr: [3, 4, 3, 3, 4], self: [3, 4, 3, 3, 4], summary: ['Fatima, time-to-offer improved and hiring managers love working with you.', 'Own a full programme end to end.', 'Requisition approvals.', 'GCC hiring.'], selfA: ['Hiring.', 'Employer brand.', 'Approvals.', 'GCC.'] },
      q2: { overall: 'meets', potential: 'medium', mgr: [3, 3, 3, 3, 4] },
      q4self: { status: 'submitted', daysAgo: 1, a: ['Two GCC go-to-market hires accepted and time-to-offer down from 38 to 31 days. 85% of new hires now get a 30-60-90 plan by day 3.', 'Owning the onboarding plan programme.', 'Interview scheduling across time zones.', 'Three more GCC hires.'], r: [3, 4, 4, 3, 4] },
    },
    'u-ethan': {
      q3: { overall: 'exceeds', potential: 'medium', mgr: [4, 3, 4, 4, 3], self: [4, 3, 4, 4, 3], summary: ['Ethan, SSO for 92% of apps was your engineering.', 'Bring others along on security work.', 'Legacy vendors.', 'Passkeys.'], selfA: ['SSO.', 'Threat modeling.', 'Vendors.', 'Passkeys.'] },
      q2: { overall: 'meets', potential: 'medium', mgr: [4, 3, 3, 3, 3] },
      q4self: { status: 'submitted', daysAgo: 2, a: ['Passkey recovery runbook with zero lockouts during the pilot, and the phishing click rate down from 9% to 6.5%.', 'Teaching passkeys to non-technical teams.', 'Enrolment is slow outside Engineering.', 'Enforcement on 15 Nov.'], r: [4, 3, 4, 4, 3] },
    },
    'u-sofia': {
      q3: { overall: 'meets', potential: 'medium', mgr: [4, 3, 3, 3, 4], self: [4, 3, 3, 3, 4], summary: ['Sofia, the brand refresh landed well.', 'Tie content to pipeline.', 'Approvals.', 'GCC brand.'], selfA: ['Brand refresh.', 'Video.', 'Approvals.', 'GCC.'] },
      q2: { overall: 'meets', potential: 'medium', mgr: [4, 3, 3, 3, 3] },
      q4self: { status: 'submitted', daysAgo: 2, a: ['Share of voice in GCC media doubled from 4% to 8.5%, including the Gulf Business feature.', 'Measuring content impact on pipeline.', 'Slow legal reviews.', 'Deliver the CIO roundtable.'], r: [4, 3, 3, 3, 4] },
    },
    'u-yusuf': {
      q3: { overall: 'exceeds', potential: 'medium', mgr: [3, 4, 4, 3, 5], self: [3, 4, 4, 3, 5], summary: ['Yusuf, pilot customers trust you completely.', 'Turn pilots into references.', 'Legal approvals.', 'References.'], selfA: ['Pilots.', 'Advocacy.', 'Legal.', 'References.'] },
      q2: { overall: 'meets', potential: 'medium', mgr: [3, 4, 3, 3, 4] },
      q4self: { status: 'submitted', daysAgo: 1, a: ['Pilot CSAT rose from 4.1 to 4.4 and I ran two exec-sponsor QBRs. Emirates Logistics agreed to be our first reference.', 'Exec communication.', 'Case study approvals are slow.', 'Three more references.'], r: [3, 4, 4, 3, 5] },
    },
    'u-mateo': {
      q3: { overall: 'meets', potential: 'low', mgr: [3, 3, 4, 3, 3], self: [3, 3, 4, 3, 3], summary: ['Mateo, the office move was seamless.', 'Plan events earlier.', 'Vendor delays.', 'All-Hands.'], selfA: ['Office move.', 'Vendors.', 'Delays.', 'All-Hands.'] },
      q2: { overall: 'meets', potential: 'low', mgr: [3, 3, 4, 3, 3] },
      q4self: { status: 'submitted', daysAgo: 1, a: ['Turned the Atrium into an All-Hands venue in 48 hours and locked the agenda with leadership.', 'Event production.', 'AV vendor lead times.', 'Deliver the All-Hands.'], r: [3, 3, 4, 3, 3] },
    },
    'u-grace': {
      q3: { overall: 'exceeds', potential: 'medium', mgr: [4, 4, 5, 4, 3], self: [4, 4, 5, 4, 3], summary: ['Grace, the audit closed with zero findings.', 'Delegate more of the close.', 'Manual reconciliations.', '3-day close.'], selfA: ['Audit.', 'Controls.', 'Manual work.', 'Close.'] },
      q2: { overall: 'exceeds', potential: 'medium', mgr: [4, 4, 5, 4, 3] },
      q4self: { status: 'submitted', daysAgo: 2, a: ['October close finished in 5 days, down from 8.', 'Delegating close tasks to Daniel.', 'Reconciliation automation is behind.', '3-day close by December.'], r: [4, 4, 5, 4, 3] },
    },
  };

  const emptyPart = () => ({ status: 'not-started' as const, answers: {}, ratings: {}, cited: [] });
  const reviews: Review[] = [];

  // Q4 (current)
  for (const uid of PERF_PARTICIPANTS) {
    const p = PROFILES[uid];
    const mgr = MANAGER[uid] ?? '';
    const r: Review = {
      id: `rv-q4-${short(uid)}`,
      cycleId: 'cyc-2026-q4',
      employeeId: uid,
      managerId: mgr,
      self: p?.q4self
        ? { status: p.q4self.status, answers: ans(p.q4self.a), ratings: p.q4self.r ? ratingsOf(p.q4self.r) : {}, cited: [], updatedAt: ago(p.q4self.daysAgo, 3), submittedAt: p.q4self.status === 'submitted' ? ago(p.q4self.daysAgo, 2) : undefined }
        : emptyPart(),
      manager: { ...emptyPart(), authorId: mgr },
    };
    reviews.push(r);
  }
  const q4 = (u: string) => reviews.find((r) => r.id === `rv-q4-${short(u)}`)!;
  // Omar's draft for Priya — deliberately includes phrases the bias checker flags.
  q4('u-priya').manager = {
    status: 'draft',
    authorId: 'u-omar',
    answers: ans([
      'Priya is a rockstar. Great job on the query planner this quarter — it was amazing and the BI teams are happy.',
      'She is brilliant technically. She should delegate more because she always ends up reviewing everything.',
      '',
      '',
    ]),
    ratings: ratingsOf([5, 4, 5, 5, 3]),
    overall: 'exceeds',
    potential: 'high',
    privateNote: 'Ready for Principal scope in 2027 if delegation sticks. Discuss retention risk with Layla.',
    cited: [],
    updatedAt: ago(0, 6),
  };
  q4('u-noah').manager = {
    status: 'submitted',
    authorId: 'u-aisha',
    answers: ans([
      'Noah, you signed Emirates Logistics — our first GCC logo — and a second logo two weeks later, and built $3.1M of qualified pipeline (52% of the team target with 39% of the quarter gone).',
      'Your discovery calls with CIOs are the best on the team; Yusuf and Sofia both called out how well you set up their follow-ups. Next, CRM hygiene: three opportunities were missing next steps at forecast review.',
      'Long legal cycles slowed two deals. I’ll bring Legal into the deal desk earlier.',
      'Close a third logo and keep every opportunity’s next step current.',
    ]),
    ratings: ratingsOf([3, 4, 3, 4, 4]),
    overall: 'meets',
    potential: 'medium',
    cited: [],
    updatedAt: ago(1),
    submittedAt: ago(1),
  };
  q4('u-fatima').manager = {
    status: 'submitted',
    authorId: 'u-sara',
    answers: ans([
      'Fatima, two GCC hires accepted, time-to-offer down from 38 to 31 days, and 85% of new hires with a 30-60-90 plan by day 3 (from 50%).',
      'You now own the onboarding plan programme end to end — exactly the growth we discussed in Q3.',
      'Scheduling across time zones remains painful; I’ll fund a scheduling tool.',
      'Three more GCC hires and the onboarding eNPS survey redesign.',
    ]),
    ratings: ratingsOf([3, 4, 4, 4, 4]),
    overall: 'exceeds',
    potential: 'high',
    cited: [],
    updatedAt: ago(0, 20),
    submittedAt: ago(0, 20),
  };
  q4('u-ethan').manager = {
    status: 'draft',
    authorId: 'u-layla',
    answers: ans(['Ethan, the passkey recovery runbook meant zero lockouts during the pilot.', '', '', '']),
    ratings: ratingsOf([4, 3, 4, 4, 3]),
    overall: 'meets',
    potential: 'high',
    cited: [],
    updatedAt: ago(1, 4),
  };

  // Q3 + Q2 (released)
  const pastReview = (cycleId: string, prefix: string, uid: string, cEnd: number, which: 'q3' | 'q2'): Review | null => {
    const p = PROFILES[uid];
    if (!p || uid === 'u-kwame') return null;
    const mgr = MANAGER[uid] ?? '';
    const data = which === 'q3' ? p.q3 : null;
    const overall = which === 'q3' ? p.q3.overall : p.q2.overall;
    const potential = which === 'q3' ? p.q3.potential : p.q2.potential;
    const mgrR = which === 'q3' ? p.q3.mgr : p.q2.mgr;
    const isMei = uid === 'u-mei' && which === 'q3';
    const releasedAt = isMei ? ago(6, 3) : cEnd + 13 * DAY;
    const summary =
      data?.summary.some(Boolean) ? data.summary : ([`${overall === 'exceeds' || overall === 'exceptional' ? 'A strong' : 'A solid'} quarter.`, 'Keep growing your scope.', 'No major blockers.', 'Focus on next quarter’s OKRs.'] as [string, string, string, string]);
    const cal = data?.cal;
    return {
      id: `${prefix}-${short(uid)}`,
      cycleId,
      employeeId: uid,
      managerId: mgr,
      self: {
        status: 'submitted',
        answers: ans(data?.selfA.some(Boolean) ? data.selfA : ['Delivered my OKRs.', 'Grew in my craft.', 'Some dependencies.', 'Next quarter’s OKRs.']),
        ratings: ratingsOf(data?.self ?? mgrR),
        cited: [],
        submittedAt: cEnd - 6 * DAY,
        updatedAt: cEnd - 6 * DAY,
      },
      manager: mgr
        ? { status: 'submitted', authorId: mgr, answers: ans(summary), ratings: ratingsOf(mgrR), overall, potential, cited: [], submittedAt: cEnd + 6 * DAY, updatedAt: cEnd + 6 * DAY }
        : { ...emptyPart(), authorId: '' },
      calibration: mgr
        ? {
            performance: cal ? cal[0] : overall === 'exceptional' || overall === 'exceeds' ? 3 : overall === 'meets' ? 2 : 1,
            potential: cal ? cal[1] : potential === 'high' ? 3 : potential === 'medium' ? 2 : 1,
            note: cal?.[2],
            byId: 'u-sara',
            at: cEnd + 11 * DAY,
          }
        : undefined,
      release: mgr
        ? {
            releasedAt,
            releasedBy: mgr,
            acknowledgedAt: isMei ? undefined : releasedAt + 2 * DAY,
            employeeComment: uid === 'u-priya' && which === 'q3' ? 'Thank you — agreed on delegation. I’ll hand the replication runbooks to Lucas.' : undefined,
            conversationAt: isMei ? undefined : releasedAt + 3 * DAY,
          }
        : undefined,
    };
  };
  for (const uid of past) {
    const a = pastReview('cyc-2026-q3', 'rv-q3', uid, Q3.end, 'q3');
    if (a) reviews.push(a);
    const b = pastReview('cyc-2026-q2', 'rv-q2', uid, Q2.end, 'q2');
    if (b) reviews.push(b);
  }

  /* ───────────────────────── Peer & upward feedback ───────────────────────── */

  const cycleFeedback: CycleFeedback[] = [];
  let pfn = 0;
  const peerDue = endOfDay(ahead(16));
  const PF = (subjectId: string, authorId: string, status: CycleFeedback['status'], body?: { start: string; stop: string; continue: string; highlight: CompetencyId; anonymous?: boolean; daysAgo?: number }, cycleId = 'cyc-2026-q4') => {
    cycleFeedback.push({
      id: `pf-${++pfn}`,
      cycleId,
      kind: 'peer',
      subjectId,
      authorId,
      status,
      nominatedBy: subjectId,
      requestedAt: cycleId === 'cyc-2026-q4' ? q4Launch + HOUR : Q3.end - 15 * DAY,
      dueAt: cycleId === 'cyc-2026-q4' ? peerDue : Q3.end,
      submittedAt: status === 'submitted' ? (cycleId === 'cyc-2026-q4' ? ago(body?.daysAgo ?? 1, 4) : Q3.end - 3 * DAY) : undefined,
      ...(body ? { start: body.start, stop: body.stop, continue: body.continue, highlight: body.highlight, anonymous: body.anonymous ?? true } : {}),
    });
  };

  PF('u-priya', 'u-lucas', 'submitted', {
    start: 'Delegating more of the planner rollout reviews so you are not the single point of approval.',
    stop: 'Taking on every database review yourself late at night.',
    continue: 'Explaining the query planner internals so clearly — your RFC is the best doc we have. Mentoring Kwame has been great to watch.',
    highlight: 'craft',
    anonymous: false,
    daysAgo: 2,
  });
  PF('u-priya', 'u-mei', 'submitted', {
    start: 'Sharing work-in-progress designs of the theming API earlier with design.',
    stop: 'Being the bottleneck on approvals — let others own more.',
    continue: 'Your technical depth and patience when pairing. The planner rewrite unblocked my dashboards.',
    highlight: 'impact',
    daysAgo: 1,
  });
  PF('u-priya', 'u-kwame', 'submitted', {
    start: 'Writing down the on-call tribal knowledge.',
    stop: 'Nothing — maybe fewer late-night reviews.',
    continue: 'Mentoring and pairing. You explain complex systems clearly and patiently.',
    highlight: 'collaboration',
    daysAgo: 0,
  });
  PF('u-priya', 'u-hana', 'requested');
  PF('u-hana', 'u-mei', 'submitted', {
    start: 'Bringing raw clips from interviews into crits.',
    stop: 'Waiting for the final readout before sharing insights.',
    continue: 'The customer empathy you bring to every Prism decision. Your synthesis is clear and actionable.',
    highlight: 'customer',
    daysAgo: 1,
  });
  PF('u-hana', 'u-lucas', 'requested');
  PF('u-kwame', 'u-priya', 'submitted', {
    start: 'Asking for help sooner when blocked — we are happy to pair.',
    stop: 'Apologising for questions!',
    continue: 'Shipping fast and testing carefully. The freshness test caught a real issue in week one.',
    highlight: 'craft',
    anonymous: false,
    daysAgo: 0,
  });
  PF('u-kwame', 'u-lucas', 'requested');
  for (const a of ['u-hana', 'u-priya', 'u-yusuf']) PF('u-mei', a, 'proposed');
  PF('u-lucas', 'u-priya', 'requested');
  PF('u-lucas', 'u-ethan', 'requested');
  PF('u-omar', 'u-aisha', 'submitted', {
    start: 'Sharing the platform roadmap with product earlier.',
    stop: 'Saying yes to every cross-team ask in the same week.',
    continue: 'Calm, clear communication during incidents. Partnering with you is easy.',
    highlight: 'collaboration',
    daysAgo: 2,
  });
  PF('u-omar', 'u-grace', 'requested');
  PF('u-yusuf', 'u-noah', 'submitted', {
    start: 'Looping sales in on renewal risks earlier.',
    stop: 'Taking on onboarding tasks that CS ops should own.',
    continue: 'Customers trust you. Your QBRs turn pilots into champions.',
    highlight: 'customer',
    daysAgo: 1,
  });
  PF('u-yusuf', 'u-mei', 'requested');
  PF('u-noah', 'u-yusuf', 'submitted', { start: 'Updating CRM next steps after every call.', stop: 'Promising custom features in discovery.', continue: 'Great discovery calls and follow-up notes.', highlight: 'customer', daysAgo: 2 });
  PF('u-noah', 'u-sofia', 'submitted', { start: 'Sharing customer quotes for campaigns.', stop: 'Last-minute deck requests.', continue: 'Clear storytelling in pitches.', highlight: 'impact', daysAgo: 1 });
  PF('u-sara', 'u-mateo', 'submitted', { start: 'Delegating event approvals.', stop: 'Joining every planning call.', continue: 'Clear priorities and fast decisions.', highlight: 'ownership', daysAgo: 2 });
  PF('u-sara', 'u-grace', 'submitted', { start: 'Sharing calibration data earlier.', stop: 'Nothing major.', continue: 'Thoughtful change management.', highlight: 'collaboration', daysAgo: 1 });
  PF('u-fatima', 'u-mateo', 'submitted', { start: 'Documenting the onboarding plan process.', stop: 'Manual scheduling.', continue: 'Candidates love working with you.', highlight: 'customer', daysAgo: 1 });
  PF('u-daniel', 'u-grace', 'submitted', { start: 'Presenting the FinOps model to engineering leads.', stop: 'Waiting for perfect data.', continue: 'Accurate, careful analysis.', highlight: 'craft', daysAgo: 2 });
  PF('u-grace', 'u-daniel', 'submitted', { start: 'Delegating more of the close.', stop: 'Reviewing every journal entry.', continue: 'Rigorous controls.', highlight: 'ownership', daysAgo: 1 });
  PF('u-ethan', 'u-lucas', 'submitted', { start: 'Writing threat models with SRE earlier.', stop: 'Solo-fixing incidents.', continue: 'Deep security expertise and calm incident comms.', highlight: 'craft', daysAgo: 1 });
  PF('u-sofia', 'u-noah', 'requested');
  PF('u-sofia', 'u-yusuf', 'requested');
  PF('u-aisha', 'u-sara', 'requested');
  PF('u-aisha', 'u-grace', 'submitted', { start: 'Sharing pipeline forecasts with Finance weekly.', stop: 'Changing discount rules mid-quarter.', continue: 'Inspiring vision for GCC.', highlight: 'impact', daysAgo: 2 });
  PF('u-mateo', 'u-sara', 'submitted', { start: 'Planning events a month earlier.', stop: 'Booking vendors without backups.', continue: 'Calm under pressure.', highlight: 'ownership', daysAgo: 1 });
  // Q3 peers on Mei's released packet
  PF('u-mei', 'u-hana', 'submitted', { start: 'Inviting research into kickoff, not just crits.', stop: 'Absorbing schedule risk silently.', continue: 'Running inclusive crits — everyone gets heard.', highlight: 'collaboration' }, 'cyc-2026-q3');
  PF('u-mei', 'u-priya', 'submitted', { start: 'Flagging token decisions that affect engineering earlier.', stop: 'Nothing.', continue: 'Pixel-perfect craft and accessible defaults.', highlight: 'craft', anonymous: false }, 'cyc-2026-q3');
  PF('u-mei', 'u-yusuf', 'submitted', { start: 'Joining more customer calls.', stop: 'Nothing.', continue: 'Listening to customers — the onboarding redesign shows it.', highlight: 'customer' }, 'cyc-2026-q3');

  let ufn = 0;
  const UP = (managerId: string, authorId: string, status: CycleFeedback['status'], s?: [Score5, Score5, Score5, Score5, Score5], keep?: string, change?: string, cycleId = 'cyc-2026-q4') => {
    const dims: UpwardDimension[] = ['clarity', 'feedback', 'growth', 'safety', 'unblock'];
    cycleFeedback.push({
      id: `uf-${++ufn}`,
      cycleId,
      kind: 'upward',
      subjectId: managerId,
      authorId,
      status,
      requestedAt: cycleId === 'cyc-2026-q4' ? q4Launch : Q3.end - 15 * DAY,
      dueAt: cycleId === 'cyc-2026-q4' ? peerDue : Q3.end,
      submittedAt: status === 'submitted' ? (cycleId === 'cyc-2026-q4' ? ago(1 + (ufn % 2), 3) : Q3.end - 2 * DAY) : undefined,
      scores: s ? (Object.fromEntries(dims.map((d, i) => [d, s[i]])) as Partial<Record<UpwardDimension, Score5>>) : undefined,
      keep,
      change,
      anonymous: true,
    });
  };
  UP('u-omar', 'u-mei', 'requested');
  UP('u-omar', 'u-priya', 'submitted', [5, 4, 5, 5, 4], 'Protecting focus time and backing us in priority debates.', 'Share the platform roadmap earlier so we can plan.');
  UP('u-omar', 'u-lucas', 'requested');
  UP('u-omar', 'u-hana', 'submitted', [4, 4, 5, 5, 4], 'Genuine interest in research and my growth.', 'More specific feedback on my readouts.');
  UP('u-omar', 'u-kwame', 'submitted', [5, 5, 5, 5, 5], 'Making onboarding feel welcoming and structured.', 'Nothing yet — maybe more context on team history.');
  UP('u-layla', 'u-sara', 'submitted', [4, 4, 4, 5, 4], 'Clear direction and trust.', 'More time in 1:1s for career topics.');
  UP('u-layla', 'u-omar', 'requested');
  UP('u-layla', 'u-daniel', 'submitted', [4, 3, 3, 4, 3], 'Quick decisions.', 'More regular feedback.');
  UP('u-layla', 'u-aisha', 'requested');
  UP('u-layla', 'u-ethan', 'submitted', [5, 4, 4, 5, 5], 'Unblocking vendors fast.', 'Delegate more security decisions.');
  UP('u-layla', 'u-mateo', 'submitted', [4, 3, 3, 4, 4], 'Supportive during the All-Hands crunch.', 'Earlier heads-up on priorities.');
  UP('u-layla', 'u-grace', 'submitted', [4, 4, 4, 4, 4], 'Respect for Finance controls.', 'More visibility into IT budget changes.');
  UP('u-aisha', 'u-noah', 'submitted', [4, 4, 3, 4, 4], 'Great deal coaching.', 'Clearer territory priorities.');
  UP('u-aisha', 'u-sofia', 'submitted', [3, 3, 3, 4, 3], 'Big-picture vision.', 'More timely feedback on campaigns.');
  UP('u-aisha', 'u-yusuf', 'submitted', [4, 4, 4, 5, 4], 'Trusting me with key accounts.', 'Faster legal escalations.');
  UP('u-sara', 'u-fatima', 'submitted', [5, 5, 5, 5, 4], 'Coaching and trust.', 'More cross-team exposure.');
  // Q3 upward (for trends)
  for (const [m, authors] of [
    ['u-omar', [['u-mei', [4, 4, 4, 5, 4]], ['u-priya', [4, 4, 5, 5, 4]], ['u-lucas', [4, 3, 4, 4, 3]], ['u-hana', [4, 4, 4, 5, 4]]]],
    ['u-layla', [['u-sara', [4, 4, 4, 4, 4]], ['u-omar', [4, 3, 4, 4, 4]], ['u-daniel', [3, 3, 3, 4, 3]], ['u-ethan', [5, 4, 4, 5, 4]]]],
    ['u-aisha', [['u-noah', [4, 3, 3, 4, 4]], ['u-sofia', [3, 3, 3, 3, 3]], ['u-yusuf', [4, 4, 4, 4, 4]]]],
  ] as [string, [string, R5][]][])
    for (const [a, s] of authors) UP(m, a, 'submitted', s, 'Supportive.', 'More context on priorities.', 'cyc-2026-q3');

  /* ───────────────────────── Continuous feedback ───────────────────────── */

  let fbn = 0;
  const F = (
    fromId: string,
    toId: string,
    kind: Feedback['kind'],
    visibility: Feedback['visibility'],
    t: number,
    sbi: [string, string, string],
    o: { competency?: CompetencyId; body?: string; objectiveId?: string; requestId?: string; kudos?: KudosValue; thanked?: boolean; id?: string } = {},
  ): Feedback => {
    const [s, b, i] = sbi;
    const capI = /^[a-z]/.test(i) && !/^p\d/.test(i) ? i.charAt(0).toUpperCase() + i.slice(1) : i;
    const body = o.body ?? `${s ? `${s}, ` : ''}${b}${b.endsWith('.') ? '' : '.'} ${capI}${/[.!?]$/.test(capI) ? '' : '.'}`.trim();
    return {
      id: o.id ?? `fb-${++fbn}`,
      fromId,
      toId,
      at: t,
      kind,
      visibility,
      situation: s || undefined,
      behaviour: b,
      impact: i || undefined,
      body,
      competency: o.competency,
      objectiveId: o.objectiveId,
      requestId: o.requestId,
      kudosValue: o.kudos,
      thankedAt: o.thanked ? t + 3 * HOUR : undefined,
    };
  };

  const feedback: Feedback[] = [
    F('u-omar', 'u-priya', 'praise', 'manager', ago(0, 3), ['During the Q4 analytics push', 'you rewrote the query planner and paired with the BI team on the rollout', 'p99 dropped 40% and three teams shipped dashboards they had parked.'], {
      body: 'The query planner rewrite unblocked three teams — thank you.',
      competency: 'impact',
      objectiveId: 'obj-priya-query',
      id: 'fb-omar-priya-planner',
    }),
    F('u-yusuf', 'u-mei', 'praise', 'public', ago(1), ['On the Emirates Logistics QBR', 'customers kept praising the new onboarding', 'It made renewal conversations easy.'], { body: 'Customers keep praising the new onboarding — thank you for listening to them!', competency: 'customer', kudos: 'customer', thanked: true }),
    F('u-hana', 'u-mei', 'praise', 'private', ago(5), ['At Prism office hours last Tuesday', 'you walked the Cortex team through token theming live, answering every edge case', 'they left as champions and migrated two screens that week.'], { competency: 'collaboration', requestId: 'fr-mei-crit', id: 'fb-hana-mei-hours' }),
    F('u-omar', 'u-mei', 'constructive', 'manager', ago(9), ['When the token contrast audit slipped', 'I heard about it in stand-up rather than from you', 'we lost a week we could have used to unblock the brand sign-off.'], {
      body: 'When the token contrast audit slipped, I heard about it in stand-up rather than from you, and we lost a week we could have used to unblock the brand sign-off. Next time, flag the risk the day you see it — even without a solution. I’d rather know early.',
      competency: 'ownership',
      objectiveId: 'obj-dsn-prism',
    }),
    F('u-priya', 'u-mei', 'praise', 'private', ago(14), ['In the Theming API RFC review', 'you annotated every engineering trade-off with the design intent', 'we closed the RFC in one round instead of three.'], { competency: 'craft' }),
    F('u-mei', 'u-hana', 'praise', 'manager', ago(4), ['In Monday’s Prism crit', 'you opened with three customer clips before we debated the nav', 'the decision took ten minutes and nobody argued from opinion.'], { competency: 'customer' }),
    F('u-mei', 'u-omar', 'constructive', 'private', ago(16), ['In sprint planning', 'Prism priorities changed twice without context', 'the team spent two days on work we then parked.'], { competency: 'collaboration' }),
    F('u-lucas', 'u-priya', 'praise', 'public', ago(29), ['During the EU-Cell cutover', 'you ran the replication switch with a calm, written runbook', 'we had zero downtime and the on-call team slept.'], { competency: 'craft', kudos: 'craft' }),
    F('u-priya', 'u-kwame', 'praise', 'manager', ago(12), ['In your first week', 'your dbt freshness test caught a stale revenue table', 'Finance didn’t ship a wrong number in the board pack.'], { competency: 'craft', requestId: 'fr-kwame-first', id: 'fb-priya-kwame-first' }),
    F('u-omar', 'u-kwame', 'praise', 'manager', ago(8), ['Across your first month', 'you asked sharp questions in design reviews and shipped your starter task early', 'you ramped faster than anyone we’ve onboarded this year.'], { competency: 'ownership' }),
    F('u-omar', 'u-lucas', 'constructive', 'manager', ago(6), ['After the Oct 14 incident', 'the runbook updates were still pending two weeks later', 'the next on-call hit the same alert without guidance.'], {
      competency: 'ownership',
      objectiveId: 'obj-lucas-oncall',
      body: 'After the Oct 14 incident, the runbook updates were still pending two weeks later, so the next on-call hit the same alert without guidance. Let’s block one runbook day per sprint — I’ll protect it.',
    }),
    F('u-layla', 'u-omar', 'praise', 'public', ago(3), ['This month', 'Engineering nudged passkey enrolment from 70% to 86%', 'we’re on track to enforce on 15 November.'], { competency: 'ownership', objectiveId: 'obj-eng-passkeys', kudos: 'ownership' }),
    F('u-layla', 'u-ethan', 'praise', 'public', ago(2), ['On passkeys day one', 'your rollout plan and recovery runbook', 'meant zero tickets on day one. World-class.'], { competency: 'impact', kudos: 'innovation', thanked: true }),
    F('u-ethan', 'u-layla', 'praise', 'private', ago(11), ['In the vendor escalation', 'you got the SSO vendor’s CTO on a call within a day', 'we unblocked three apps in a week.'], { competency: 'collaboration' }),
    F('u-sara', 'u-fatima', 'praise', 'manager', ago(7), ['For the Q4 onboarding cohort', 'you built 30-60-90 plans before day one for every hire', 'managers told me it was the smoothest start they’ve seen.'], { competency: 'ownership' }),
    F('u-fatima', 'u-sara', 'constructive', 'private', ago(19), ['In the calibration prep', 'the data pack arrived the night before', 'managers didn’t have time to read it.'], { competency: 'collaboration' }),
    F('u-aisha', 'u-noah', 'praise', 'public', ago(10), ['On the Emirates Logistics deal', 'you ran a flawless discovery-to-close in five weeks, and your demo flow mapped every step to their onboarding pain', 'we have our first GCC logo.'], { competency: 'impact', kudos: 'customer', requestId: 'fr-noah-demo', id: 'fb-aisha-noah-deal' }),
    F('u-aisha', 'u-noah', 'constructive', 'manager', ago(10), ['At forecast review', 'three opportunities were missing next steps in the CRM', 'I couldn’t commit the forecast with confidence.'], { competency: 'ownership' }),
    F('u-noah', 'u-yusuf', 'praise', 'public', ago(13), ['At the pilot QBR', 'you turned an escalation into a roadmap conversation', 'the customer agreed to be a reference.'], { competency: 'customer', kudos: 'customer' }),
    F('u-sofia', 'u-aisha', 'constructive', 'private', ago(18), ['In the campaign review', 'the brief changed after creative was done', 'we redid two weeks of work.'], { competency: 'collaboration' }),
    F('u-yusuf', 'u-sofia', 'praise', 'public', ago(9), ['For the Gulf Business feature', 'you pitched our customer story perfectly', 'two CIOs reached out the same week.'], { competency: 'impact', kudos: 'innovation' }),
    F('u-grace', 'u-daniel', 'praise', 'private', ago(4), ['During October close', 'you mapped the checklist to Payroll Console exports', 'we closed in five days instead of eight.'], { competency: 'craft' }),
    F('u-daniel', 'u-grace', 'praise', 'private', ago(22), ['During the audit', 'you documented every control decision', 'we had zero findings.'], { competency: 'ownership' }),
    F('u-mateo', 'u-sara', 'praise', 'private', ago(6), ['While planning the All-Hands', 'you made fast calls on the agenda', 'we locked speakers in a day.'], { competency: 'ownership' }),
    F('u-sara', 'u-mateo', 'praise', 'public', ago(0, 7), ['For the Q4 All-Hands', 'you turned the Atrium into a venue in 48 hours', 'Legend.'], { competency: 'ownership', kudos: 'ownership' }),
    F('u-kwame', 'u-priya', 'praise', 'private', ago(15), ['In our pairing sessions', 'you explained the planner internals with diagrams', 'I shipped the metrics dashboard on my own a week later.'], { competency: 'collaboration' }),
    F('u-hana', 'u-lucas', 'praise', 'private', ago(20), ['During the research panel outage', 'you jumped in to restore the recording service', 'we didn’t lose a single interview.'], { competency: 'collaboration' }),
    F('u-lucas', 'u-hana', 'praise', 'private', ago(17), ['In the incident review', 'you brought customer impact quotes', 'the team prioritised the fix immediately.'], { competency: 'customer' }),
    F('u-priya', 'u-omar', 'praise', 'private', ago(10), ['When the freeze dates moved', 'you negotiated a planner rollout exception with clear guardrails', 'we kept momentum without risking the release.'], { competency: 'collaboration' }),
    F('u-omar', 'u-hana', 'praise', 'manager', ago(8), ['In the Prism synthesis readout', 'you tied every insight to a backlog item', 'four insights shipped within the sprint.'], { competency: 'impact' }),
    F('u-omar', 'u-hana', 'constructive', 'manager', ago(25), ['On the onboarding study', 'synthesis was shared only at the final readout', 'design had already committed to a direction.'], { competency: 'collaboration' }),
    F('u-aisha', 'u-mei', 'praise', 'public', ago(21), ['For the GCC design partner demo', 'you tailored the onboarding flow to Arabic RTL in two days', 'the customer signed the pilot on the spot.'], { competency: 'customer', kudos: 'customer' }),
    F('u-mei', 'u-yusuf', 'praise', 'private', ago(12), ['On the customer calls', 'you invited design to listen in', 'we fixed two onboarding papercuts the next day.'], { competency: 'collaboration' }),
    F('u-layla', 'u-sara', 'praise', 'manager', ago(3), ['For the Q4 cycle launch', 'you made evidence-based reviews the default', 'managers say reviews take half the time.'], { competency: 'impact', requestId: 'fr-sara-launch', id: 'fb-layla-sara-launch' }),
    F('u-sara', 'u-omar', 'constructive', 'private', ago(30), ['In last quarter’s calibration', 'your notes were rating-only without examples', 'it was hard to defend the ratings across teams.'], { competency: 'craft' }),
    F('u-ethan', 'u-lucas', 'praise', 'private', ago(22), ['During the Oct 14 P1', 'your status updates every 15 minutes were crisp', 'execs stopped pinging the incident channel.'], { competency: 'collaboration', requestId: 'fr-lucas-incident', id: 'fb-ethan-lucas-incident' }),
    F('u-noah', 'u-sofia', 'constructive', 'private', ago(26), ['For the CIO pitch deck', 'the deck arrived the morning of the meeting', 'I couldn’t tailor it to the customer.'], { competency: 'collaboration' }),
    F('u-grace', 'u-layla', 'praise', 'private', ago(27), ['On the IT budget review', 'you shared vendor renewals a month early', 'Finance planned cash flow with no surprises.'], { competency: 'collaboration' }),
    F('u-daniel', 'u-aisha', 'praise', 'private', ago(9), ['On the GCC discount guardrails', 'you brought Finance in before pricing went out', 'deals didn’t need re-approval.'], { competency: 'collaboration' }),
    F('u-omar', 'u-priya', 'constructive', 'manager', ago(33), ['On the planner rollout plan', 'you were the only approver for every change', 'reviews queued for days when you were out.'], { competency: 'collaboration' }),
    F('u-mei', 'u-priya', 'praise', 'public', ago(2), ['For the Prism theming work', 'you made the theming API feel designed, not just engineered', 'designers can now ship themes without engineering help.'], { competency: 'craft', kudos: 'craft' }),
    F('u-kwame', 'u-omar', 'praise', 'private', ago(1), ['In my first weeks', 'you set up a clear 30-60-90 plan and daily check-ins', 'I always knew what good looked like.'], { competency: 'collaboration' }),
    F('u-noah', 'u-aisha', 'praise', 'public', ago(5), ['For the Emirates Logistics close', 'you joined the exec call at midnight your time', 'it sealed the deal.'], { competency: 'customer', kudos: 'teamwork' }),
  ];

  /* ───────────────────────── Feedback requests ───────────────────────── */

  const nextFriday = (() => {
    const d = new Date(now);
    const add = ((5 - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + add);
    d.setHours(17, 0, 0, 0);
    return d.getTime();
  })();
  const requests: FeedbackRequest[] = [
    { id: 'fr-mei-prism', requesterId: 'u-mei', respondentIds: ['u-omar'], topic: 'Prism v4 rollout', note: 'How did the rollout land with Engineering? What should I change for the next wave (Cortex & Spend)?', createdAt: ago(0, 4), dueAt: nextFriday, responses: {} },
    { id: 'fr-mei-crit', requesterId: 'u-mei', respondentIds: ['u-hana', 'u-priya'], topic: 'Facilitating Prism office hours', note: 'Are the sessions useful? What would make them better?', createdAt: ago(7), dueAt: endOfDay(ahead(6)), responses: { 'u-hana': { feedbackId: 'fb-hana-mei-hours', at: ago(5) } } },
    { id: 'fr-kwame-first', requesterId: 'u-kwame', respondentIds: ['u-priya', 'u-omar'], topic: 'My first month', note: 'What should I keep doing, and what should I change?', createdAt: ago(14), dueAt: endOfDay(ahead(3)), responses: { 'u-priya': { feedbackId: 'fb-priya-kwame-first', at: ago(12) } } },
    { id: 'fr-lucas-incident', requesterId: 'u-lucas', respondentIds: ['u-ethan', 'u-hana'], topic: 'Oct 14 P1 incident comms', createdAt: ago(23), dueAt: ago(16), responses: { 'u-ethan': { feedbackId: 'fb-ethan-lucas-incident', at: ago(22) } } },
    { id: 'fr-omar-rituals', requesterId: 'u-omar', respondentIds: ['u-mei', 'u-priya', 'u-lucas'], topic: 'How I run our team rituals', note: 'Stand-ups, planning, retros — what works and what wastes your time?', createdAt: ago(2), dueAt: endOfDay(ahead(5)), responses: {} },
    { id: 'fr-noah-demo', requesterId: 'u-noah', respondentIds: ['u-aisha', 'u-yusuf'], topic: 'Discovery call demo flow', createdAt: ago(11), dueAt: ago(4), responses: { 'u-aisha': { feedbackId: 'fb-aisha-noah-deal', at: ago(10) } } },
    { id: 'fr-sara-launch', requesterId: 'u-sara', respondentIds: ['u-layla', 'u-omar', 'u-aisha'], topic: 'Q4 check-in launch comms', note: 'Was the launch clear for your teams?', createdAt: ago(3), dueAt: endOfDay(ahead(2)), responses: { 'u-layla': { feedbackId: 'fb-layla-sara-launch', at: ago(3) } } },
  ];

  /* ───────────────────────── Private notes ───────────────────────── */

  const notes: PrivateNote[] = [
    { id: 'pn-1', authorId: 'u-omar', subjectId: 'u-mei', body: 'Ready for Staff-level scope on Prism. Watch: absorbs risk silently — coach on escalating early.', at: ago(12) },
    { id: 'pn-2', authorId: 'u-omar', subjectId: 'u-mei', body: 'Contrast audit slip: talked it through in our 1:1. She took it well and now posts a weekly risk log.', at: ago(5) },
    { id: 'pn-3', authorId: 'u-omar', subjectId: 'u-lucas', body: 'Stretched by incident follow-ups. Protect runbook time; consider rotating incident commander duty.', at: ago(6) },
    { id: 'pn-4', authorId: 'u-omar', subjectId: 'u-kwame', body: 'Strong start. Pair with Priya on planner metrics next; first OKRs due before day 30.', at: ago(4) },
    { id: 'pn-5', authorId: 'u-layla', subjectId: 'u-omar', body: 'Team delivery is great; push him to delegate platform decisions to Priya.', at: ago(9) },
    { id: 'pn-6', authorId: 'u-aisha', subjectId: 'u-noah', body: 'Discovery calls are excellent; CRM hygiene still slipping.', at: ago(5) },
  ];

  /* ───────────────────────── 1:1s ───────────────────────── */

  let an = 0;
  const A = (text: string, byId: string, daysAgo: number, o: Partial<AgendaItem> = {}): AgendaItem => ({ id: `ag-${++an}`, text, byId, createdAt: ago(daysAgo), done: false, ...o });
  let acn = 0;
  const ACT = (text: string, ownerId: string, dueInDays: number | null, done = false, createdDaysAgo = 7): ActionItem => ({
    id: `ac-${++acn}`,
    text,
    ownerId,
    dueAt: dueInDays === null ? undefined : endOfDay(now + dueInDays * DAY),
    done,
    doneAt: done ? ago(Math.max(0, createdDaysAgo - 2)) : undefined,
    createdAt: ago(createdDaysAgo),
  });
  let mn = 0;
  const M = (daysAgo: number, notesText: string, agenda: [string, string, boolean][], moods: Record<string, number>): Meeting => ({
    id: `mt-${++mn}`,
    at: ago(daysAgo, 0),
    agenda: agenda.map(([text, byId, done]) => ({ text, byId, done })),
    notes: notesText,
    moods,
  });
  const nextAt = (days: number, hour: number) => {
    const d = new Date(now + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.getTime() < now ? d.getTime() + DAY : d.getTime();
  };
  const S = (id: string, leadId: string, memberId: string, cadence: OneOnOneSeries['cadence'], next: number, o: Partial<OneOnOneSeries>): OneOnOneSeries => ({
    id,
    leadId,
    memberId,
    kind: 'manager',
    cadence,
    durationMin: 30,
    nextAt: next,
    agenda: [],
    sharedNotes: '',
    privateNotes: {},
    actionItems: [],
    meetings: [],
    moods: {},
    createdAt: ago(200),
    ...o,
  });

  const series: OneOnOneSeries[] = [
    S('oo-omar-mei', 'u-omar', 'u-mei', 'weekly', nextAt(2, 10), {
      agenda: [
        A('Prism contrast audit — brand sign-off is still blocking', 'u-mei', 2),
        A('What to highlight in my Q4 self-reflection', 'u-mei', 1),
        A('Staff Designer expectations — where am I today?', 'u-omar', 6, { carried: 1 }),
      ],
      sharedNotes: '',
      privateNotes: { 'u-omar': 'Bring up D5 case: Prism adoption narrative + ownership growth since Q3.', 'u-mei': 'Ask about conference budget for Config.' },
      actionItems: [
        ACT('Share the Prism rollout plan for Cortex & Spend', 'u-mei', -2, false, 9),
        ACT('Intro Mei to Sofia about the brand palette', 'u-omar', -5, true, 9),
        ACT('Outline the Staff Designer promotion case', 'u-omar', 10, false, 5),
      ],
      meetings: [
        M(5, 'Talked through the contrast audit slip. Agreed: Mei posts a weekly risk & decision log in #prism. Omar intros Sofia for the palette.', [['Contrast audit slip', 'u-omar', true], ['Prism office hours feedback', 'u-mei', true], ['Staff Designer expectations', 'u-omar', false]], { 'u-mei': 3, 'u-omar': 4 }),
        M(12, 'HR Portal migration done. Discussed Cortex sequencing and the freeze.', [['HR Portal migration retro', 'u-mei', true], ['Cortex sequencing', 'u-omar', true]], { 'u-mei': 4, 'u-omar': 4 }),
        M(19, 'Talent Hub migration review. Mei to run office hours for two more teams.', [['Talent Hub migration', 'u-mei', true], ['Office hours plan', 'u-mei', true]], { 'u-mei': 5, 'u-omar': 4 }),
        M(26, 'Q4 OKRs agreed. Mei owns the Prism team objective.', [['Q4 OKRs', 'u-omar', true], ['Q3 review follow-ups', 'u-mei', true]], { 'u-mei': 4 }),
      ],
    }),
    S('oo-omar-priya', 'u-omar', 'u-priya', 'biweekly', nextAt(4, 15), {
      agenda: [A('Planner 100% rollout after the freeze', 'u-priya', 3), A('Principal Engineer path — what does 2027 look like?', 'u-omar', 2)],
      actionItems: [ACT('Move database review rota to Lucas & Kwame', 'u-priya', 3, false, 10), ACT('Draft the freeze exception for planner v2', 'u-omar', -8, true, 12)],
      meetings: [
        M(10, 'Freeze exception agreed with guardrails. Priya to hand two review areas to others.', [['Freeze exception', 'u-priya', true], ['Delegation plan', 'u-omar', true]], { 'u-priya': 4, 'u-omar': 5 }),
        M(24, 'Planner at 50%. Discussed mentoring Kwame.', [['Planner rollout', 'u-priya', true], ['Mentoring Kwame', 'u-omar', true]], { 'u-priya': 4 }),
      ],
    }),
    S('oo-omar-lucas', 'u-omar', 'u-lucas', 'weekly', nextAt(1, 11), {
      agenda: [A('Runbook day — is it actually protected?', 'u-lucas', 4, { carried: 1 })],
      privateNotes: { 'u-omar': 'Lucas seemed drained last week. Ask about on-call load and time off.' },
      actionItems: [ACT('Write runbooks for the 5 noisiest alerts', 'u-lucas', -3, false, 10), ACT('Rotate incident commander duty', 'u-omar', 4, false, 6)],
      meetings: [
        M(6, 'Incident follow-ups are crowding out runbooks. Agreed to block one runbook day per sprint.', [['On-call load', 'u-lucas', true], ['Runbook day', 'u-omar', false]], { 'u-lucas': 2, 'u-omar': 3 }),
        M(13, 'Oct 14 postmortem actions reviewed.', [['Postmortem actions', 'u-omar', true]], { 'u-lucas': 3 }),
        M(20, 'SLO rollout plan.', [['SLO plan', 'u-lucas', true]], { 'u-lucas': 3 }),
      ],
    }),
    S('oo-omar-hana', 'u-omar', 'u-hana', 'biweekly', nextAt(6, 14), {
      agenda: [A('Research panel budget', 'u-hana', 3)],
      actionItems: [ACT('Get quotes for a research panel vendor', 'u-hana', 6, false, 8)],
      meetings: [M(8, 'Weekly synthesis snapshots are landing well. Discussed panel budget.', [['Synthesis cadence', 'u-omar', true], ['Panel budget', 'u-hana', false]], { 'u-hana': 4, 'u-omar': 4 })],
    }),
    S('oo-omar-kwame', 'u-omar', 'u-kwame', 'weekly', nextAt(0, 16), {
      agenda: [A('Set my first OKRs', 'u-kwame', 1), A('30-day check-in prep', 'u-omar', 2)],
      actionItems: [ACT('Draft 2–3 onboarding objectives', 'u-kwame', 2, false, 6), ACT('Finish Secure Engineering training', 'u-kwame', 4, false, 6), ACT('Get Kwame access to the prod data warehouse', 'u-omar', -6, true, 12)],
      meetings: [
        M(7, 'Starter task shipped. Next: planner metrics dashboard with Priya; first OKRs before day 30.', [['Starter task retro', 'u-kwame', true], ['First OKRs', 'u-omar', false]], { 'u-kwame': 5, 'u-omar': 5 }),
        M(14, 'Access sorted; pairing schedule with Priya.', [['Access', 'u-kwame', true], ['Pairing schedule', 'u-omar', true]], { 'u-kwame': 4 }),
        M(21, 'Week-one check-in. Laptop and accounts done.', [['Week one', 'u-omar', true]], { 'u-kwame': 4 }),
      ],
    }),
    S('oo-layla-omar', 'u-layla', 'u-omar', 'biweekly', nextAt(3, 9), {
      agenda: [A('Passkey enforcement — last 11 engineers', 'u-layla', 1), A('Delegating platform decisions to Priya', 'u-layla', 9, { carried: 1 })],
      actionItems: [ACT('Share the 2027 platform headcount plan', 'u-omar', 7, false, 11)],
      meetings: [M(11, 'Year-end release plan approved. Discussed Priya’s path to Principal.', [['Release plan', 'u-omar', true], ['Delegation', 'u-layla', false]], { 'u-omar': 4, 'u-layla': 4 })],
    }),
    S('oo-layla-sara', 'u-layla', 'u-sara', 'biweekly', nextAt(5, 13), {
      agenda: [A('Q4 cycle completion and calibration plan', 'u-sara', 2)],
      actionItems: [ACT('Prepare calibration pre-reads', 'u-sara', 20, false, 3)],
      meetings: [M(9, 'Cycle launch plan approved.', [['Cycle launch', 'u-sara', true]], { 'u-sara': 4, 'u-layla': 5 })],
    }),
    S('oo-aisha-noah', 'u-aisha', 'u-noah', 'weekly', nextAt(1, 17), {
      agenda: [A('Third logo — legal blockers', 'u-noah', 2), A('CRM next steps hygiene', 'u-aisha', 6, { carried: 1 })],
      actionItems: [ACT('Update next steps on all open opportunities', 'u-noah', -1, false, 8)],
      meetings: [M(6, 'Two logos in. Legal is the bottleneck. CRM hygiene still slipping.', [['Pipeline review', 'u-aisha', true], ['CRM hygiene', 'u-aisha', false]], { 'u-noah': 4, 'u-aisha': 4 })],
    }),
    S('oo-sara-fatima', 'u-sara', 'u-fatima', 'weekly', nextAt(2, 12), {
      agenda: [A('Scheduling tool budget', 'u-fatima', 1)],
      actionItems: [ACT('Shortlist scheduling tools', 'u-fatima', 5, false, 4)],
      meetings: [M(5, 'Onboarding plans at 85%. Discussed scheduling pain.', [['Onboarding plans', 'u-fatima', true], ['Scheduling', 'u-fatima', false]], { 'u-fatima': 4, 'u-sara': 5 })],
    }),
    S('oo-priya-kwame', 'u-priya', 'u-kwame', 'biweekly', nextAt(6, 11), {
      kind: 'mentor',
      agenda: [A('Planner metrics dashboard review', 'u-kwame', 2)],
      actionItems: [ACT('Read the planner v2 RFC', 'u-kwame', -4, true, 9)],
      meetings: [M(8, 'Walked through planner internals with diagrams.', [['Planner internals', 'u-priya', true]], { 'u-kwame': 5, 'u-priya': 5 })],
    }),
  ];

  /* ───────────────────────── Levels & growth ───────────────────────── */

  const L = (ladderId: UserLevel['ladderId'], levelId: string, monthsAgo: number): UserLevel => ({ ladderId, levelId, since: now - monthsAgo * 30 * DAY });
  const levels: Record<string, UserLevel> = {
    'u-layla': L('mgmt', 'M5', 30),
    'u-sara': L('people', 'H4', 20),
    'u-omar': L('mgmt', 'M2', 26),
    'u-daniel': L('finance', 'F3', 18),
    'u-mei': L('design', 'D4', 14),
    'u-priya': L('eng', 'E5', 22),
    'u-lucas': L('eng', 'E3', 28),
    'u-aisha': L('product', 'P3', 24),
    'u-noah': L('gtm', 'S2', 19),
    'u-fatima': L('people', 'H2', 26),
    'u-ethan': L('eng', 'E3', 16),
    'u-sofia': L('gtm', 'S4', 20),
    'u-yusuf': L('gtm', 'S3', 15),
    'u-hana': L('design', 'D2', 21),
    'u-mateo': L('people', 'H3', 34),
    'u-grace': L('finance', 'F4', 40),
    'u-kwame': L('eng', 'E2', 1),
  };

  let gn = 0;
  const G = (userId: string, title: string, competency: CompetencyId, status: GrowthGoal['status'], dueIn: number, actions: [string, boolean][], learning: { title: string; to: string }[], why?: string, by?: string): GrowthGoal => ({
    id: `gg-${++gn}`,
    userId,
    title,
    competency,
    why,
    status,
    dueAt: endOfDay(now + dueIn * DAY),
    actions: actions.map(([text, done], i) => ({ id: `gg-${gn}-a${i + 1}`, text, done })),
    learning,
    createdAt: ago(30),
    createdBy: by ?? userId,
    updatedAt: ago(3),
  });
  const goals: GrowthGoal[] = [
    G('u-mei', 'Own risks early and visibly', 'ownership', 'in-progress', 40, [['Post a weekly Prism risk & decision log', true], ['Flag any slip within 24h, with options', false], ['Lead the Prism v4 GA retro', false]], [{ title: 'Academy · Leading without authority', to: '/academy' }], 'Ownership is one step below the Staff Designer bar — raise risks before they surprise anyone.', 'u-omar'),
    G('u-mei', 'Build the case for Staff Designer', 'impact', 'in-progress', 80, [['Define the Prism adoption narrative with Omar', true], ['Present Prism strategy at the design all-hands', false], ['Mentor Hana on research ops', false]], [{ title: 'Academy · Design leadership path', to: '/academy' }], 'Show company-level impact beyond Prism delivery.'),
    G('u-omar', 'Delegate platform decisions', 'ownership', 'in-progress', 50, [['Priya leads planner rollout reviews', true], ['Hand on-call rotation design to Lucas', false], ['Monthly skip-level 1:1s', false]], [{ title: 'Academy · Leading leaders', to: '/academy' }], undefined, 'u-layla'),
    G('u-sara', 'Data-driven people decisions', 'impact', 'in-progress', 30, [['Ship check-in insights to all managers', true], ['Calibration pre-reads for every manager', false]], [{ title: 'Academy · People analytics', to: '/academy' }]),
    G('u-layla', 'Coach managers through the passkey rollout', 'collaboration', 'in-progress', 20, [['Share a manager nudge kit', true], ['Weekly enrolment leaderboard', false]], []),
    G('u-kwame', 'Ramp up on the data platform', 'craft', 'in-progress', 25, [['Ship a starter task (dbt freshness test)', true], ['Shadow an on-call week', false], ['Own the data freshness SLA dashboard', false]], [{ title: 'Academy · Secure Engineering & Production Readiness', to: '/academy/course/c-eng-sec' }], 'Your 30-60-90 plan: be productive on the platform by day 60.', 'u-omar'),
    G('u-priya', 'Shape platform architecture beyond the team', 'impact', 'not-started', 90, [['Write the 2027 data platform vision', false], ['Chair the architecture review', false]], [{ title: 'Academy · Staff+ engineering', to: '/academy' }]),
    G('u-lucas', 'Make on-call humane', 'ownership', 'in-progress', 45, [['Runbooks for the 5 noisiest alerts', false], ['Alert noise review every sprint', true]], [{ title: 'Academy · SRE fundamentals', to: '/academy' }]),
    G('u-hana', 'Build research ops for Prism', 'customer', 'in-progress', 60, [['Set up a research panel', false], ['Weekly synthesis snapshots', true]], [{ title: 'Academy · Customer discovery', to: '/academy' }]),
  ];

  /* ───────────────────────── Evidence (pinned from other apps) ───────────────────────── */

  let en = 0;
  const src = (app: BridgeSource['app'], label: string, to: string): BridgeSource => ({ app, label, to });
  const E = (userId: string, title: string, source: BridgeSource, daysAgo: number, o: { detail?: string; kr?: string; by?: string } = {}): Evidence => ({
    id: `ev-${++en}`,
    userId,
    title,
    detail: o.detail,
    source,
    keyResultId: o.kr,
    at: ago(daysAgo, 2),
    addedBy: o.by ?? userId,
  });
  const evidence: Evidence[] = [
    E('u-mei', 'Shipped Prism v4 tokens to the HR Portal and Talent Hub', src('projects', 'Helix Projects · Prism v4', '/projects/p/prj-prism'), 13, { kr: 'kr-prism-adoption', detail: 'Two flagship surfaces fully migrated.' }),
    E('u-mei', 'Typography scale & fluid type', src('projects', 'Helix Projects · Prism v4', '/projects/p/prj-prism?task=t-p9'), 4),
    E('u-mei', 'Facilitated the onboarding v2 design crit', src('chat', 'Pulse Chat · #design-crit', '/chat'), 23),
    E('u-mei', 'Prism office hours: onboarded the Cortex team', src('chat', 'Pulse Chat · #prism', '/chat'), 11),
    E('u-mei', 'RTL onboarding flow for the GCC design partner demo', src('drive', 'Helix Drive · GCC demo', '/drive'), 21),
    E('u-priya', 'Query planner v2 rolled out to 50% of traffic', src('projects', 'Helix Projects · Platform Reliability', '/projects/p/prj-platform'), 20, { kr: 'kr-priya-planner' }),
    E('u-priya', 'Zero-downtime EU-Cell cutover', src('projects', 'Helix Projects · Platform Reliability', '/projects/p/prj-platform'), 30),
    E('u-priya', 'Theming API RFC approved', src('projects', 'Helix Projects · Prism v4', '/projects/p/prj-prism'), 14),
    E('u-lucas', 'Incident commander: Oct 14 search outage (P1)', src('helpdesk', 'IT Helpdesk · INC-2041', '/helpdesk'), 23),
    E('u-lucas', 'Chaos drill: region evacuation', src('projects', 'Helix Projects · Platform Reliability', '/projects/p/prj-platform'), 33),
    E('u-lucas', 'Paging runbooks for search & ingest', src('drive', 'Helix Drive · SRE runbooks', '/drive'), 9),
    E('u-hana', 'Icon set audit: 312 icons consolidated to 118', src('projects', 'Helix Projects · Prism v4', '/projects/p/prj-prism'), 24),
    E('u-hana', 'Synthesized 12 customer interviews for Prism', src('drive', 'Helix Drive · Research synthesis', '/drive'), 9),
    E('u-kwame', 'Shipped starter task: dbt freshness test', src('projects', 'Helix Projects · Kwame 30-60-90', '/projects/p/prj-onb-kwame'), 19),
    E('u-kwame', 'Caught a stale revenue table before the board pack', src('chat', 'Pulse Chat · #data-eng', '/chat'), 20),
    E('u-kwame', 'Planner metrics dashboard', src('projects', 'Helix Projects · Platform Reliability', '/projects/p/prj-platform'), 6),
    E('u-omar', 'Year-end release plan published', src('drive', 'Helix Drive · Engineering', '/drive'), 14),
    E('u-omar', 'Hired Arjun Iyer (Senior Engineer)', src('hub', 'Talent Hub', '/talent/pipeline'), 6),
    E('u-sara', 'Launched the Q4 check-in cycle', src('hub', 'Performance & OKRs', '/performance/cycles'), 3),
    E('u-noah', 'Signed Emirates Logistics — first GCC logo', src('projects', 'Helix Projects · GCC Expansion', '/projects/p/prj-gcc'), 16, { kr: 'kr-gcc-logos' }),
    E('u-daniel', 'Mapped the close checklist to Payroll Console exports', src('projects', 'Helix Projects · Month-end close', '/projects'), 4),
    E('u-ethan', 'Passkey recovery runbook — zero lockouts in the pilot', src('helpdesk', 'IT Helpdesk · Knowledge', '/helpdesk'), 25),
    E('u-yusuf', 'Exec-sponsor QBR with Emirates Logistics', src('chat', 'Pulse Chat · #gcc', '/chat'), 10),
    E('u-layla', 'Passkey enforcement policy approved', src('projects', 'Helix Projects · Passkeys & MFA', '/projects/p/prj-mfa'), 8),
    E('u-mateo', 'Atrium converted into the All-Hands venue', src('chat', 'Pulse Chat · #events', '/chat'), 2),
    E('u-grace', 'October close in 5 days', src('projects', 'Helix Projects · Month-end close', '/projects'), 5),
    E('u-fatima', 'Two GCC go-to-market offers accepted', src('hub', 'Talent Hub', '/talent/offers'), 7),
    E('u-sofia', 'Gulf Business feature published', src('drive', 'Helix Drive · Press', '/drive'), 3),
    E('u-aisha', 'Emirates Logistics exec call', src('chat', 'Pulse Chat · #gcc', '/chat'), 5),
  ];

  return {
    version: PERF_DATA_VERSION,
    seededAt: now,
    periods,
    objectives,
    keyResults,
    comments,
    cycles,
    templates: [defaultTemplate(now - 40 * DAY)],
    reviews,
    cycleFeedback,
    feedback,
    requests,
    notes,
    series,
    levels,
    goals,
    evidence,
  };
}
