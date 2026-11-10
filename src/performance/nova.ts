/**
 * Nova — the deterministic, local "AI" for Performance & OKRs. Every function works
 * on real data passed in (OKRs, check-ins, evidence, feedback, peer answers, 1:1
 * signals) and returns specific, editable text. No canned lorem ipsum.
 */
import type { Department } from '@/types';
import { COMPETENCY, COMPETENCY_IDS } from './constants';
import type { EvidenceItem } from './evidence';
import { gapsTo } from './ladders';
import {
  DAY,
  elapsed,
  forecastKr,
  formatPace,
  formatValue,
  isStalled,
  krProgress,
  krStatus,
  lastCheckinAt,
  WEEK,
} from './okr';
import type {
  ActionItem,
  CompetencyId,
  CycleFeedback,
  KeyResult,
  KrStatus,
  LadderLevel,
  MetricType,
  Objective,
  OverallRating,
  Period,
  Potential,
  Score5,
} from './types';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const pctS = (v: number) => `${Math.round(v * 100)}%`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const trimQuote = (s: string, n = 110) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t;
};

/* ══════════════════════════ 1 · Draft OKRs from a goal ══════════════════════════ */

export interface DraftKr {
  title: string;
  metric: MetricType;
  start: number;
  target: number;
  unit?: string;
  ceiling?: boolean;
  decimals?: number;
  milestones?: string[];
}

export interface DraftObjective {
  title: string;
  description: string;
  keyResults: DraftKr[];
  parentId?: string;
  parentTitle?: string;
  themes: string[];
  rationale: string;
}

interface Theme {
  id: string;
  label: string;
  match: RegExp;
  parent: RegExp;
  krs: DraftKr[];
}

const THEMES: Theme[] = [
  {
    id: 'onboarding',
    label: 'onboarding',
    match: /onboard|new hire|ramp|productive|first (30|60|90) days|get up to speed|settle in/i,
    parent: /grow|people|onboard|best place/i,
    krs: [
      { title: 'Cut time to first production change from 14 to 5 days', metric: 'number', start: 14, target: 5, unit: 'days' },
      { title: 'Complete the 30-60-90 plan milestones', metric: 'milestone', start: 0, target: 4, milestones: ['Day-30 goals agreed', 'First project shipped', 'Day-60 review', 'Owns an on-call rotation'] },
      { title: 'Raise onboarding satisfaction from 3.8 to 4.6', metric: 'number', start: 3.8, target: 4.6, unit: '/ 5', decimals: 1 },
    ],
  },
  {
    id: 'data',
    label: 'data platform',
    match: /data|pipeline|dbt|warehouse|bigquery|analytics|dashboard|freshness|etl/i,
    parent: /reliab|platform|rock-solid/i,
    krs: [
      { title: 'Raise data freshness SLA attainment from 85% to 99%', metric: 'percent', start: 85, target: 99 },
      { title: 'Cut broken dashboards from 14 to 2', metric: 'number', start: 14, target: 2, unit: 'dashboards' },
      { title: 'Ship 5 tested dbt models to production', metric: 'number', start: 0, target: 5, unit: 'models' },
    ],
  },
  {
    id: 'reliability',
    label: 'reliability',
    match: /reliab|uptime|incident|outage|latency|on-?call|slo|resilien|stable|boring/i,
    parent: /reliab|platform|rock-solid/i,
    krs: [
      { title: 'Raise uptime from 99.90% to 99.95%', metric: 'percent', start: 99.9, target: 99.95, decimals: 2 },
      { title: 'Cut p95 latency from 800 ms to 400 ms', metric: 'number', start: 800, target: 400, unit: 'ms' },
      { title: 'Keep P1 incidents at or below 1 this quarter', metric: 'number', start: 0, target: 1, unit: 'P1s', ceiling: true },
    ],
  },
  {
    id: 'security',
    label: 'security',
    match: /secur|passkey|mfa|password|phish|vulnerab|zero trust|identity/i,
    parent: /passwordless|secur|passkey/i,
    krs: [
      { title: 'Increase passkey enrolment from 60% to 95%', metric: 'percent', start: 60, target: 95 },
      { title: 'Cut phishing simulation click rate from 9% to 3%', metric: 'percent', start: 9, target: 3 },
      { title: 'Fix 100% of critical vulnerabilities within 7 days', metric: 'percent', start: 70, target: 100 },
    ],
  },
  {
    id: 'design',
    label: 'design quality',
    match: /design|prism|ux|usab|accessib|a11y|delight|component|token/i,
    parent: /design|delight|prism/i,
    krs: [
      { title: 'Raise the accessibility score from 78 to 95', metric: 'number', start: 78, target: 95, unit: 'pts' },
      { title: 'Raise task success in usability tests from 70% to 90%', metric: 'percent', start: 70, target: 90 },
      { title: 'Migrate 30 components to Prism tokens', metric: 'number', start: 0, target: 30, unit: 'components' },
    ],
  },
  {
    id: 'revenue',
    label: 'revenue',
    match: /revenue|arr|sales|deal|pipeline|logo|market|enterprise|quota|bookings|gcc/i,
    parent: /market|gcc|enterprise|win|revenue/i,
    krs: [
      { title: 'Grow new ARR from $0 to $1.5M', metric: 'currency', start: 0, target: 1_500_000, unit: 'USD' },
      { title: 'Sign 4 new enterprise logos', metric: 'number', start: 0, target: 4, unit: 'logos' },
      { title: 'Build $5M of qualified pipeline', metric: 'currency', start: 0, target: 5_000_000, unit: 'USD' },
    ],
  },
  {
    id: 'customer',
    label: 'customer experience',
    match: /customer|nps|csat|support|churn|retention|satisf|renewal/i,
    parent: /market|customer|grow|delight/i,
    krs: [
      { title: 'Raise NPS from 31 to 45', metric: 'number', start: 31, target: 45, unit: 'NPS' },
      { title: 'Cut monthly churn from 3% to 1.5%', metric: 'percent', start: 3, target: 1.5, decimals: 1 },
      { title: 'Answer 95% of tickets within 4 hours (from 72%)', metric: 'percent', start: 72, target: 95 },
    ],
  },
  {
    id: 'quality',
    label: 'quality',
    match: /quality|bug|defect|test|regression|coverage/i,
    parent: /reliab|platform|delight/i,
    krs: [
      { title: 'Cut escaped defects from 12 to 4 per month', metric: 'number', start: 12, target: 4, unit: 'bugs/mo' },
      { title: 'Raise automated test coverage from 55% to 80%', metric: 'percent', start: 55, target: 80 },
      { title: 'Resolve 90% of P2 bugs within 5 days (from 60%)', metric: 'percent', start: 60, target: 90 },
    ],
  },
  {
    id: 'hiring',
    label: 'hiring',
    match: /hir|recruit|talent|headcount|team that|offer/i,
    parent: /grow|people|best place/i,
    krs: [
      { title: 'Hire 3 senior engineers', metric: 'number', start: 0, target: 3, unit: 'hires' },
      { title: 'Cut time to offer from 40 to 25 days', metric: 'number', start: 40, target: 25, unit: 'days' },
      { title: 'Reach 85% offer acceptance (from 65%)', metric: 'percent', start: 65, target: 85 },
    ],
  },
  {
    id: 'growth',
    label: 'growth',
    match: /learn|skill|mentor|career|grow|certif|coach|feedback/i,
    parent: /grow|people|best place/i,
    krs: [
      { title: 'Complete 2 certifications in Academy', metric: 'number', start: 0, target: 2, unit: 'certs' },
      { title: 'Run 6 mentoring sessions', metric: 'number', start: 0, target: 6, unit: 'sessions' },
      { title: 'Raise feedback given per month from 1 to 4', metric: 'number', start: 1, target: 4, unit: '/mo' },
    ],
  },
  {
    id: 'efficiency',
    label: 'efficiency',
    match: /cost|spend|budget|efficien|automat|close the books|reconcil|faster/i,
    parent: /reliab|platform|grow/i,
    krs: [
      { title: 'Automate 60% of reconciliations (from 20%)', metric: 'percent', start: 20, target: 60 },
      { title: 'Close the books in 3 days (from 8)', metric: 'number', start: 8, target: 3, unit: 'days' },
      { title: 'Cut cloud spend per customer from $4.20 to $3.20', metric: 'currency', start: 4.2, target: 3.2, unit: 'USD' },
    ],
  },
];

const GENERIC: DraftKr[] = [
  { title: 'Reach 60% adoption of {topic} (from 10%)', metric: 'percent', start: 10, target: 60 },
  { title: 'Deliver the {topic} milestones', metric: 'milestone', start: 0, target: 3, milestones: ['Plan agreed', 'Pilot live', 'Rolled out'] },
  { title: 'Raise satisfaction with {topic} from 3.5 to 4.5', metric: 'number', start: 3.5, target: 4.5, unit: '/ 5', decimals: 1 },
];

export function polishTitle(goal: string): string {
  let t = goal.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  t = t
    .replace(/^(i|we)\s+(want|need|would like|plan|hope|aim)\s+to\s+/i, '')
    .replace(/^(our|my|the)\s+goal\s+is\s+to\s+/i, '')
    .replace(/^to\s+/i, '');
  t = t.replace(/\s+(by|to)\s+\$?\d[\d.,]*\s*(%|k|m|x|days?|ms|pts)?(\s.*)?$/i, '');
  if (t.length > 72) t = t.slice(0, 72).replace(/\s+\S*$/, '');
  return cap(t);
}

function topicOf(goal: string): string {
  const stop = /^(make|get|be|become|improve|increase|grow|build|ship|launch|create|deliver|reduce|cut|win|raise|drive|help|our|the|a|an|more|better|faster|my|we|i|to)$/i;
  const words = goal
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.test(w));
  return (words.slice(0, 2).join(' ') || 'the initiative').toLowerCase();
}

/** Pull "to 95%", "by 30%", "$2.4M" style numbers out of the goal. */
export function parseNumbers(goal: string): { toPct?: number; byPct?: number; money?: number } {
  const out: { toPct?: number; byPct?: number; money?: number } = {};
  const to = goal.match(/\bto\s+(\d+(?:\.\d+)?)\s*%/i);
  if (to) out.toPct = Number(to[1]);
  const by = goal.match(/\bby\s+(\d+(?:\.\d+)?)\s*%/i);
  if (by) out.byPct = Number(by[1]);
  const money = goal.match(/\$\s?(\d+(?:\.\d+)?)\s*(k|m|b)?/i);
  if (money) {
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[(money[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
    out.money = Number(money[1]) * mult;
  }
  return out;
}

function retarget(kr: DraftKr, nums: ReturnType<typeof parseNumbers>): DraftKr {
  if (kr.metric === 'percent' && nums.toPct !== undefined) return { ...kr, target: nums.toPct, title: kr.title.replace(/to \d+(\.\d+)?%/, `to ${nums.toPct}%`) };
  if (kr.metric === 'currency' && nums.money) {
    const label = nums.money >= 1e6 ? `$${+(nums.money / 1e6).toFixed(2)}M` : `$${Math.round(nums.money / 1e3)}K`;
    return { ...kr, target: nums.money, title: kr.title.replace(/\$[\d.]+[KM]?(?!.*\$)/, label) };
  }
  if (nums.byPct !== undefined && (kr.metric === 'number' || kr.metric === 'percent') && kr.start > 0) {
    const down = kr.target < kr.start;
    const target = +(kr.start * (down ? 1 - nums.byPct / 100 : 1 + nums.byPct / 100)).toFixed(kr.decimals ?? 0);
    return { ...kr, target };
  }
  return kr;
}

/**
 * Turn a sentence into an objective with three measurable key results, aligned to
 * the best-matching parent objective.
 */
export function draftObjective(goal: string, ctx: { department?: Department; parents: Pick<Objective, 'id' | 'title' | 'level' | 'department'>[] }): DraftObjective {
  const clean = goal.trim();
  const matched = THEMES.filter((t) => t.match.test(clean));
  const deptTheme: Record<string, string> = { Engineering: 'reliability', Design: 'design', Sales: 'revenue', Marketing: 'revenue', 'Customer Success': 'customer', 'People Ops': 'growth', Finance: 'efficiency', 'IT & Security': 'security' };
  if (!matched.length && ctx.department && deptTheme[ctx.department]) {
    const t = THEMES.find((x) => x.id === deptTheme[ctx.department!]);
    if (t) matched.push(t);
  }
  const nums = parseNumbers(clean);
  const topic = topicOf(clean);
  let krs: DraftKr[];
  if (!matched.length) krs = GENERIC.map((k) => ({ ...k, title: k.title.replace('{topic}', topic) }));
  else if (matched.length === 1) krs = matched[0].krs.map((k) => ({ ...k }));
  else krs = [matched[0].krs[0], matched[0].krs[1], matched[1].krs[0]].map((k) => ({ ...k }));
  krs = krs.map((k, i) => (i === 0 ? retarget(k, nums) : k));

  // Alignment: best parent by theme hint, preferring the owner's department.
  let parent: (typeof ctx.parents)[number] | undefined;
  let best = 0;
  for (const p of ctx.parents) {
    let s = 0;
    for (const t of matched) if (t.parent.test(p.title)) s += 3;
    const words = clean.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    s += words.filter((w) => p.title.toLowerCase().includes(w)).length * 2;
    if (ctx.department && p.department === ctx.department) s += 1;
    if (p.level === 'team') s += 0.5;
    if (s > best) {
      best = s;
      parent = p;
    }
  }
  if (best < 2) parent = undefined;
  const title = polishTitle(clean) || 'A new objective';
  const themes = matched.map((t) => t.label);
  return {
    title,
    description: `${title} this quarter${themes.length ? `, focused on ${listJoin(themes)}` : ''}. Progress is measured by the key results below.`,
    keyResults: krs,
    parentId: parent?.id,
    parentTitle: parent?.title,
    themes,
    rationale: `Each key result is an outcome with a baseline and a target${parent ? `, and the objective ladders up to “${parent.title}”` : ''}. Tweak the numbers to match your real baseline.`,
  };
}

/* ══════════════════════════ 2 · KR quality checker ══════════════════════════ */

export interface KrCheck {
  id: 'measurable' | 'baseline' | 'target' | 'deadline' | 'outcome' | 'specific';
  label: string;
  pass: boolean;
  tip: string;
}

export interface KrQuality {
  score: number;
  checks: KrCheck[];
  /** Suggested rewrite of the title (when it can be improved). */
  rewrite?: string;
}

const OUTPUT_VERBS = /^(launch|build|create|write|ship|implement|deliver|hold|run|host|publish|complete|develop|design|set up|setup|migrate|start|do|make|organi[sz]e|roll out)\b/i;
const VAGUE_VERBS = /\b(improve|better|more|enhance|optimi[sz]e|boost|work on|focus on|support)\b/i;

function metricNoun(title: string): string {
  return title
    .replace(OUTPUT_VERBS, '')
    .replace(/^(increase|reduce|cut|raise|grow|lower|decrease|improve|keep|reach|hit|get)\s+/i, '')
    .replace(/\bfrom\s+\$?[\d.,]+%?.*$/i, '')
    .replace(/\bto\s+\$?[\d.,]+%?.*$/i, '')
    .replace(/\b\d[\d.,]*\s*%?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function rewriteKrTitle(kr: { title: string; metric: MetricType; start: number; target: number; unit?: string; ceiling?: boolean }): string {
  const noun = lower(metricNoun(kr.title)) || 'the key metric';
  const unit = kr.metric === 'percent' ? '%' : kr.unit ? ` ${kr.unit}` : '';
  const money = (v: number) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${v}`);
  const fmt = (v: number) => (kr.metric === 'currency' ? money(v) : `${v}${unit}`);
  if (kr.metric === 'boolean') return `${cap(noun)} is live and used by the first customers`;
  if (kr.metric === 'milestone') return `Deliver ${noun} (${kr.target} milestones)`;
  if (kr.ceiling) return `Keep ${noun} at or below ${fmt(kr.target)}`;
  const verb = kr.target >= kr.start ? 'Increase' : 'Reduce';
  return `${verb} ${noun} from ${fmt(kr.start)} to ${fmt(kr.target)}`;
}

export function checkKrQuality(kr: { title: string; metric: MetricType; start: number; target: number; unit?: string; ceiling?: boolean }, periodLabel: string): KrQuality {
  const title = kr.title.trim();
  const hasNumber = /\d/.test(title);
  const measurable = kr.metric !== 'boolean' && (kr.metric === 'milestone' || kr.start !== kr.target || !!kr.ceiling);
  const baseline = kr.metric === 'milestone' || kr.metric === 'boolean' || !!kr.ceiling || kr.start !== 0 || /\bfrom\b|\b0\b/.test(title) || kr.metric === 'currency' || kr.metric === 'number';
  const target = kr.metric === 'boolean' || kr.target !== kr.start || !!kr.ceiling;
  const outputish = OUTPUT_VERBS.test(title) && (kr.metric === 'boolean' || kr.metric === 'milestone' || !hasNumber);
  const vague = VAGUE_VERBS.test(title) && !hasNumber;
  const checks: KrCheck[] = [
    { id: 'measurable', label: 'Measurable', pass: measurable, tip: measurable ? 'Has a number you can track weekly.' : 'Pick a number to track instead of yes/no.' },
    { id: 'baseline', label: 'Baseline', pass: baseline, tip: baseline ? 'Starts from a known value.' : 'Add the current value so progress means something.' },
    { id: 'target', label: 'Target', pass: target, tip: target ? 'Clear finish line.' : 'Set a target different from the start.' },
    { id: 'deadline', label: 'Deadline', pass: true, tip: `Due by the end of ${periodLabel}.` },
    { id: 'outcome', label: 'Outcome, not output', pass: !outputish, tip: outputish ? 'Measure the effect of the work, not the work itself.' : 'Describes a result, not an activity.' },
    { id: 'specific', label: 'Specific', pass: !vague && title.length >= 12 && title.length <= 90, tip: vague ? 'Words like “improve” or “better” need a number.' : title.length > 90 ? 'Shorten it — one line is easier to remember.' : title.length < 12 ? 'Say what will change.' : 'Clear and concrete.' },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const needsRewrite = checks.some((c) => !c.pass && (c.id === 'outcome' || c.id === 'specific' || c.id === 'measurable')) || (!hasNumber && kr.metric !== 'boolean' && kr.metric !== 'milestone');
  return { score, checks, rewrite: needsRewrite ? rewriteKrTitle(kr) : undefined };
}

/* ══════════════════════════ 3 · Explain status ══════════════════════════ */

export interface StatusExplanation {
  status: KrStatus;
  headline: string;
  bullets: { krId: string; status: KrStatus; text: string }[];
  suggestions: string[];
}

export function explainObjective(o: Pick<Objective, 'title'>, krs: KeyResult[], period: Period, now: number, nameOf: (id: string) => string = (id) => id): StatusExplanation {
  const statuses = krs.map((k) => krStatus(k, period, now));
  const order: KrStatus[] = ['off-track', 'at-risk', 'on-track', 'done'];
  const worst = statuses.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'on-track';
  const remainingWeeks = Math.max(0.5, (period.end - now) / WEEK);
  const endLabel = new Date(period.end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const bullets: StatusExplanation['bullets'] = [];
  const suggestions: string[] = [];

  krs.forEach((kr, i) => {
    const s = statuses[i];
    const f = forecastKr(kr, period, now);
    const name = `“${kr.title}”`;
    if (s === 'done') {
      bullets.push({ krId: kr.id, status: s, text: `${name} is done — ${formatValue(kr, kr.current)} against a target of ${formatValue(kr, kr.target)}.` });
      return;
    }
    if (kr.metric === 'boolean') {
      bullets.push({ krId: kr.id, status: s, text: `${name} isn’t done yet; ${nameOf(kr.ownerId).split(' ')[0]}’s confidence is ${kr.confidence}/10.` });
      return;
    }
    if (kr.ceiling) {
      const used = kr.current;
      bullets.push({
        krId: kr.id,
        status: s,
        text:
          s === 'on-track'
            ? `${name}: ${formatValue(kr, used)} so far, within the limit of ${formatValue(kr, kr.target)}.`
            : `${name}: ${formatValue(kr, used)} already, and the current rate projects ${formatValue(kr, Math.round(f.value * 10) / 10)} by ${endLabel} — over the ${formatValue(kr, kr.target)} limit.`,
      });
      if (s !== 'on-track') suggestions.push(`Run a pre-mortem on what could cause the next ${lower(kr.unit ?? 'incident')} and add guardrails before the year-end freeze.`);
      return;
    }
    const needed = (kr.target - kr.current) / remainingWeeks;
    const pace = f.perWeek;
    const gap = kr.target - f.value;
    const shortBy = Math.abs(gap);
    const ahead = kr.target >= kr.start ? f.value >= kr.target : f.value <= kr.target;
    let text = ahead
      ? `${name} is ahead of plan: ${formatValue(kr, kr.current)} now, forecast ${formatValue(kr, f.value)} by ${endLabel} (target ${formatValue(kr, kr.target)}).`
      : `${name} is forecast to reach ${formatValue(kr, f.value)} by ${endLabel} — ${formatValue(kr, shortBy, { unit: kr.metric !== 'percent' })}${kr.metric === 'percent' ? ' pts' : ''} short of ${formatValue(kr, kr.target)}. Pace is ${formatPace(kr, pace)}; it needs ${formatPace(kr, needed)}.`;
    if (isStalled(kr, period, now)) text += ' It has been flat for 2+ weeks.';
    const cks = kr.checkins.slice().sort((a, b) => a.at - b.at);
    if (cks.length >= 3) {
      const prev = cks[cks.length - 3].confidence;
      if (kr.confidence <= prev - 2) text += ` Confidence fell from ${prev} to ${kr.confidence}.`;
    }
    bullets.push({ krId: kr.id, status: s, text });
    if (!ahead) {
      const last = cks[cks.length - 1];
      if (last?.note) suggestions.push(`${cap(nameOf(kr.ownerId).split(' ')[0])} noted: “${trimQuote(last.note, 90)}” — agree an owner and date for that blocker.`);
      suggestions.push(`Close the gap on ${name}: lift the pace to ${formatPace(kr, needed)} or reset the target with the parent owner.`);
    }
    const lastAt = lastCheckinAt(kr);
    if (lastAt && now - lastAt > 8 * DAY) suggestions.push(`${name} hasn’t been checked in for ${Math.round((now - lastAt) / DAY)} days — a weekly check-in keeps the forecast honest.`);
  });

  const counts = { risk: statuses.filter((s) => s === 'at-risk').length, off: statuses.filter((s) => s === 'off-track').length };
  const headline =
    worst === 'done'
      ? `“${o.title}” is complete.`
      : worst === 'on-track'
        ? `“${o.title}” is on track — every key result is forecast to land.`
        : `“${o.title}” is ${worst === 'off-track' ? 'off track' : 'at risk'}: ${counts.off ? `${counts.off} key result${counts.off > 1 ? 's are' : ' is'} off track` : ''}${counts.off && counts.risk ? ' and ' : ''}${counts.risk ? `${counts.risk} ${counts.risk > 1 ? 'are' : 'is'} at risk` : ''} with ${Math.round(remainingWeeks)} weeks left.`;
  return { status: worst, headline, bullets, suggestions: [...new Set(suggestions)].slice(0, 4) };
}

/* ══════════════════════════ 4 · Review drafts from evidence ══════════════════════════ */

export interface DraftKrFact {
  title: string;
  objectiveTitle: string;
  progress: number;
  status: KrStatus;
  from: string;
  now: string;
  target: string;
  note?: string;
  stalled?: boolean;
}

export interface DraftContext {
  firstName: string;
  managerFirstName?: string;
  evidence: EvidenceItem[];
  krs: DraftKrFact[];
  goals: string[];
  /** Competencies where the person trails their next level. */
  gaps: CompetencyId[];
  /** Strengths (highest assessed / most praised). */
  strengths: CompetencyId[];
  peerThemes?: PeerThemes;
}

const workItems = (ctx: DraftContext) => ctx.evidence.filter((e) => e.kind === 'work' || e.kind === 'pinned');
const praise = (ctx: DraftContext) => ctx.evidence.filter((e) => (e.kind === 'kudos' || e.kind === 'feedback') && e.positive);
const constructive = (ctx: DraftContext) => ctx.evidence.filter((e) => e.kind === 'feedback' && !e.positive);
const fromName = (e: EvidenceItem) => e.sourceLabel.split(' · ')[1] ?? 'A colleague';

function krSentence(k: DraftKrFact, person: 'I' | 'you'): string {
  const verb = person === 'I' ? 'I moved' : 'you moved';
  return `${verb} “${k.title}” from ${k.from} to ${k.now} (${pctS(k.progress)} of the way to ${k.target})`;
}

/** First-person self-reflection draft for one question. */
export function draftSelfAnswer(questionId: string, ctx: DraftContext): string {
  const work = workItems(ctx);
  const kudos = praise(ctx);
  const crit = constructive(ctx);
  const goodKrs = ctx.krs.filter((k) => k.status === 'on-track' || k.status === 'done').sort((a, b) => b.progress - a.progress);
  const badKrs = ctx.krs.filter((k) => k.status === 'at-risk' || k.status === 'off-track');
  switch (questionId) {
    case 'q-wins': {
      const parts: string[] = [];
      if (work[0]) parts.push(`My biggest win this quarter was ${lower(work[0].title)}${work[0].detail ? ` (${work[0].detail})` : ''}.`);
      if (work[1]) parts.push(`I also delivered ${lower(work[1].title)}${work[2] ? ` and ${lower(work[2].title)}` : ''}.`);
      if (goodKrs[0]) parts.push(`On my OKRs, ${krSentence(goodKrs[0], 'I')}${goodKrs[1] ? `, and ${krSentence(goodKrs[1], 'I').replace(/^I moved/, 'moved')}` : ''}.`);
      if (kudos[0]) parts.push(`${fromName(kudos[0])} called out that “${trimQuote(kudos[0].title, 120)}”.`);
      return parts.join(' ') || 'This quarter I focused on… (add your top 2–3 outcomes and what changed because of them).';
    }
    case 'q-growth': {
      const parts: string[] = [];
      if (ctx.strengths[0]) parts.push(`I grew most in ${COMPETENCY[ctx.strengths[0]].label.toLowerCase()}${kudos[1] ? ` — ${fromName(kudos[1])} noticed: “${trimQuote(kudos[1].title, 100)}”` : ''}.`);
      if (crit[0]) parts.push(`${fromName(crit[0])} pushed me on something important: “${trimQuote(crit[0].detail ?? crit[0].title, 140)}” I’ve been acting on it since.`);
      if (ctx.gaps[0]) parts.push(`Next, I want to build my ${COMPETENCY[ctx.gaps[0]].label.toLowerCase()}${ctx.goals[0] ? ` through my growth goal “${ctx.goals[0]}”` : ''}.`);
      return parts.join(' ') || 'I learned… (skills, feedback you acted on, behaviours you changed).';
    }
    case 'q-obstacles': {
      const parts: string[] = [];
      for (const k of badKrs.slice(0, 2)) parts.push(`“${k.title}” is ${k.status === 'off-track' ? 'off track' : 'at risk'} at ${k.now} against ${k.target}${k.stalled ? ' and has been flat for weeks' : ''}${k.note ? ` — ${lower(trimQuote(k.note, 120))}` : ''}.`);
      if (badKrs.length) parts.push(`What would help: ${ctx.managerFirstName ? `${ctx.managerFirstName}, ` : ''}a decision on scope for the at-risk work and protected focus time to close the gap.`);
      return parts.join(' ') || 'Nothing major blocked me this quarter. One thing that would help is… (support you need).';
    }
    case 'q-next': {
      const items: string[] = [];
      if (badKrs[0]) items.push(`close the gap on “${badKrs[0].title}”`);
      if (ctx.goals[0]) items.push(`make real progress on “${ctx.goals[0]}”`);
      if (ctx.gaps[0]) items.push(`grow my ${COMPETENCY[ctx.gaps[0]].label.toLowerCase()} toward the next level`);
      if (!items.length && goodKrs[0]) items.push(`build on “${goodKrs[0].title}”`);
      return items.length ? `Next quarter I’ll focus on: ${items.map((x, i) => `${i + 1}) ${x}`).join('; ')}.` : 'Next quarter I will focus on… (2–3 priorities).';
    }
    default:
      return '';
  }
}

/** Manager review draft (second person — it is shared with the employee). */
export function draftManagerAnswer(questionId: string, ctx: DraftContext): string {
  const work = workItems(ctx);
  const kudos = praise(ctx);
  const crit = constructive(ctx);
  const goodKrs = ctx.krs.filter((k) => k.status === 'on-track' || k.status === 'done').sort((a, b) => b.progress - a.progress);
  const badKrs = ctx.krs.filter((k) => k.status === 'at-risk' || k.status === 'off-track');
  const t = ctx.peerThemes;
  switch (questionId) {
    case 'q-wins': {
      const parts: string[] = [];
      if (work[0]) parts.push(`${ctx.firstName}, your standout result this quarter was ${lower(work[0].title)}.`);
      if (work[1]) parts.push(`You also delivered ${lower(work[1].title)}.`);
      if (goodKrs[0]) parts.push(`On OKRs, ${krSentence(goodKrs[0], 'you')}.`);
      if (t?.strengths[0]) parts.push(`Peers highlighted your ${t.strengths[0].theme.toLowerCase()} (${t.strengths[0].count} of ${t.responses}): “${t.strengths[0].quote}”.`);
      else if (kudos[0]) parts.push(`${fromName(kudos[0])} said it well: “${trimQuote(kudos[0].title, 110)}”.`);
      return parts.join(' ') || `${ctx.firstName}, this quarter you… (name 2–3 outcomes and their impact).`;
    }
    case 'q-growth': {
      const parts: string[] = [];
      if (ctx.strengths[0]) parts.push(`You grew visibly in ${COMPETENCY[ctx.strengths[0]].label.toLowerCase()}.`);
      if (t?.growth[0]) parts.push(`Where I’d like to see you grow next: ${t.growth[0].theme.toLowerCase()} — peers said “${t.growth[0].quote}”.`);
      else if (crit[0]) parts.push(`Where I’d like to see you grow next is reflected in recent feedback: “${trimQuote(crit[0].detail ?? crit[0].title, 120)}”`);
      if (ctx.gaps[0]) parts.push(`For the next level, ${COMPETENCY[ctx.gaps[0]].label.toLowerCase()} is the biggest gap: ${lower(COMPETENCY[ctx.gaps[0]].anchors[3])}`);
      return parts.join(' ') || 'You grew in… Next, I’d like to see you…';
    }
    case 'q-obstacles': {
      const parts: string[] = [];
      for (const k of badKrs.slice(0, 2)) parts.push(`“${k.title}” is ${k.status === 'off-track' ? 'off track' : 'at risk'} (${k.now} vs ${k.target})${k.note ? ` — ${lower(trimQuote(k.note, 100))}` : ''}.`);
      parts.push(badKrs.length ? 'I’ll support you by helping re-scope the at-risk work, unblocking the cross-team dependencies and protecting focus time.' : 'No major blockers this quarter. I’ll keep protecting your focus time and clearing dependencies early.');
      return parts.join(' ');
    }
    case 'q-next': {
      const items: string[] = [];
      if (badKrs[0]) items.push(`land “${badKrs[0].title}”`);
      if (ctx.gaps[0]) items.push(`stretch your ${COMPETENCY[ctx.gaps[0]].label.toLowerCase()}`);
      if (ctx.goals[0]) items.push(`progress your growth goal “${ctx.goals[0]}”`);
      if (!items.length && goodKrs[0]) items.push(`take “${goodKrs[0].title}” to the next level`);
      return `Next quarter, focus on: ${items.map((x, i) => `${i + 1}) ${x}`).join('; ')}.`;
    }
    default:
      return '';
  }
}

/** Nova's suggested rating & potential, with reasons (the manager decides). */
export function suggestRating(input: { avgProgress: number; expected: number; praise: number; constructive: number; peerStrengths: number; scores: Partial<Record<CompetencyId, Score5>>; next: LadderLevel | null }): {
  overall: OverallRating;
  potential: Potential;
  reasons: string[];
} {
  const pace = input.expected > 0 ? input.avgProgress / input.expected : 1;
  const ratio = input.praise / Math.max(1, input.praise + input.constructive);
  const scoreVals = Object.values(input.scores).filter((v): v is Score5 => !!v);
  const avgScore = scoreVals.length ? scoreVals.reduce((s, v) => s + v, 0) / scoreVals.length : 3;
  let points = 0;
  points += pace >= 1.15 ? 2 : pace >= 0.9 ? 1 : pace >= 0.7 ? 0 : -1;
  points += ratio >= 0.8 ? 1 : ratio < 0.5 ? -1 : 0;
  points += avgScore >= 4 ? 1 : avgScore < 3 ? -1 : 0;
  points += input.peerStrengths >= 2 ? 1 : 0;
  const overall: OverallRating = points >= 4 ? 'exceptional' : points >= 2 ? 'exceeds' : points >= 0 ? 'meets' : points >= -1 ? 'developing' : 'below';
  const gaps = input.next ? gapsTo(input.next, input.scores).filter((g) => g.gap > 0).length : 5;
  const potential: Potential = gaps <= 1 && avgScore >= 3.8 ? 'high' : gaps <= 3 ? 'medium' : 'low';
  const reasons = [
    `OKR progress is ${pctS(input.avgProgress)} with ${pctS(input.expected)} of the quarter gone (${pace >= 1 ? 'ahead of' : 'behind'} plan).`,
    `${input.praise} pieces of praise vs ${input.constructive} constructive this quarter.`,
    `Average competency rating ${avgScore.toFixed(1)} / 5${input.next ? `; ${5 - gaps} of 5 at ${input.next.id} level` : ''}.`,
  ];
  if (input.peerStrengths) reasons.push(`${input.peerStrengths} strength theme${input.peerStrengths > 1 ? 's' : ''} repeated across peers.`);
  return { overall, potential, reasons };
}

/* ══════════════════════════ 5 · Peer theme summary ══════════════════════════ */

const THEME_WORDS: { theme: string; re: RegExp }[] = [
  { theme: 'Clear communication', re: /communicat|clear|explain|writ|document|update|context/i },
  { theme: 'Mentoring', re: /mentor|teach|pair|coach|onboard|patient|buddy/i },
  { theme: 'Technical depth', re: /architect|depth|deep|performance|query|planner|rfc|system|latency|database/i },
  { theme: 'Craft & quality', re: /quality|polish|detail|craft|test|accessib|pixel/i },
  { theme: 'Ownership', re: /\bown|drive|drove|follow[- ]?through|accountab|proactive/i },
  { theme: 'Collaboration', re: /collab|cross-team|partner|together|helped|support/i },
  { theme: 'Customer empathy', re: /customer|user|research|empath|interview/i },
  { theme: 'Delivery speed', re: /ship|fast|quick|deliver|speed|velocity/i },
  { theme: 'Planning & focus', re: /plan|prioriti|focus|scope|roadmap/i },
  { theme: 'Delegation', re: /delegat|bottleneck|let others|hand off|spread|single point/i },
  { theme: 'Raising risks early', re: /risk|flag|earlier|surface|escalat|heads[- ]up/i },
  { theme: 'Meeting load', re: /meeting|context.switch|calendar/i },
];

export interface ThemeHit {
  theme: string;
  count: number;
  quote: string;
}

export interface PeerThemes {
  responses: number;
  strengths: ThemeHit[];
  growth: ThemeHit[];
  highlights: Partial<Record<CompetencyId, number>>;
  summary: string;
}

function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function tally(texts: string[]): ThemeHit[] {
  const hits = new Map<string, ThemeHit>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const sentence of sentences(text)) {
      for (const { theme, re } of THEME_WORDS) {
        if (seen.has(theme) || !re.test(sentence)) continue;
        seen.add(theme);
        const h = hits.get(theme);
        const q = trimQuote(sentence, 120);
        if (h) {
          h.count += 1;
          if (q.length < h.quote.length) h.quote = q;
        } else hits.set(theme, { theme, count: 1, quote: q });
      }
    }
  }
  return [...hits.values()].sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

export function peerThemes(items: Pick<CycleFeedback, 'start' | 'stop' | 'continue' | 'highlight' | 'status'>[]): PeerThemes {
  const done = items.filter((i) => i.status === 'submitted');
  const strengths = tally(done.map((d) => d.continue ?? '')).slice(0, 3);
  const growth = tally(done.map((d) => `${d.start ?? ''} ${d.stop ?? ''}`)).slice(0, 3);
  const highlights: Partial<Record<CompetencyId, number>> = {};
  for (const d of done) if (d.highlight) highlights[d.highlight] = (highlights[d.highlight] ?? 0) + 1;
  const n = done.length;
  let summary: string;
  if (!n) summary = 'No peer feedback submitted yet.';
  else {
    const top = Object.entries(highlights).sort((a, b) => b[1] - a[1])[0];
    summary =
      `${n} peer${n > 1 ? 's' : ''} responded. ` +
      (strengths.length ? `Strengths mentioned most: ${listJoin(strengths.slice(0, 2).map((s) => `${s.theme.toLowerCase()} (${s.count} of ${n})`))}. ` : '') +
      (growth.length ? `Growth theme: ${growth[0].theme.toLowerCase()} — “${growth[0].quote}”` : 'No consistent growth theme.') +
      (top ? ` Most highlighted competency: ${COMPETENCY[top[0] as CompetencyId].label}.` : '');
  }
  return { responses: n, strengths, growth, highlights, summary };
}

/* ══════════════════════════ 6 · 1:1 suggested topics ══════════════════════════ */

export interface TopicSignal {
  memberFirstName: string;
  leadFirstName: string;
  viewerIsLead: boolean;
  atRiskKrs: { title: string; status: KrStatus; forecast: string; target: string }[];
  selfDueInDays?: number | null;
  selfSubmitted?: boolean;
  releasedUnacked?: boolean;
  releasedCycleName?: string;
  newFeedback: { fromFirst: string; kind: 'praise' | 'constructive' }[];
  overdueActions: Pick<ActionItem, 'text' | 'dueAt'>[];
  daysSinceLast: number | null;
  growthGoalsDue: string[];
  pendingNominations?: boolean;
  lastMood?: number | null;
  agendaTexts: string[];
  now: number;
}

export interface SuggestedTopic {
  id: string;
  text: string;
  reason: string;
  source: 'okr' | 'review' | 'feedback' | 'nova';
}

export function suggestTopics(s: TopicSignal): SuggestedTopic[] {
  const out: SuggestedTopic[] = [];
  const who = s.viewerIsLead ? s.memberFirstName : 'you';
  const whose = s.viewerIsLead ? `${s.memberFirstName}’s` : 'your';
  for (const k of s.atRiskKrs.slice(0, 2))
    out.push({ id: `kr:${k.title}`, text: `Unblock “${k.title}”`, reason: `${cap(whose)} key result is ${k.status === 'off-track' ? 'off track' : 'at risk'} — forecast ${k.forecast} vs ${k.target}.`, source: 'okr' });
  if (s.selfDueInDays !== undefined && s.selfDueInDays !== null && !s.selfSubmitted && s.selfDueInDays >= 0)
    out.push({ id: 'self-due', text: 'Talk through the quarterly self-reflection', reason: `Due in ${s.selfDueInDays} day${s.selfDueInDays === 1 ? '' : 's'} and not submitted yet.`, source: 'review' });
  if (s.releasedUnacked) out.push({ id: 'released', text: `Walk through the ${s.releasedCycleName ?? 'latest'} review`, reason: 'The review was shared but not acknowledged yet.', source: 'review' });
  if (s.pendingNominations && s.viewerIsLead) out.push({ id: 'noms', text: `Agree ${s.memberFirstName}’s peer reviewers`, reason: 'Peer nominations are waiting for your approval.', source: 'review' });
  if (s.newFeedback.length) {
    const praise = s.newFeedback.filter((f) => f.kind === 'praise').length;
    out.push({
      id: 'feedback',
      text: `Reflect on new feedback from ${listJoin([...new Set(s.newFeedback.map((f) => f.fromFirst))].slice(0, 3))}`,
      reason: `${s.newFeedback.length} new piece${s.newFeedback.length > 1 ? 's' : ''} since the last 1:1 (${praise} praise).`,
      source: 'feedback',
    });
  }
  for (const a of s.overdueActions.slice(0, 2)) {
    const days = a.dueAt ? Math.max(1, Math.round((s.now - a.dueAt) / DAY)) : 0;
    out.push({ id: `act:${a.text}`, text: `Close the loop on “${trimQuote(a.text, 60)}”`, reason: `Action item overdue${days ? ` by ${days} day${days > 1 ? 's' : ''}` : ''}.`, source: 'nova' });
  }
  if (s.daysSinceLast !== null && s.daysSinceLast > 21)
    out.push({ id: 'gap', text: 'Reset priorities for the rest of the quarter', reason: `It’s been ${s.daysSinceLast} days since the last 1:1.`, source: 'nova' });
  for (const g of s.growthGoalsDue.slice(0, 1)) out.push({ id: `goal:${g}`, text: `Check progress on “${g}”`, reason: `${cap(whose)} growth goal is due soon.`, source: 'nova' });
  if (s.lastMood !== null && s.lastMood !== undefined && s.lastMood <= 2)
    out.push({ id: 'mood', text: `Check in on how ${who === 'you' ? 'you are' : `${who} is`} doing`, reason: `Mood was ${s.lastMood}/5 last time.`, source: 'nova' });
  const have = s.agendaTexts.map((t) => t.toLowerCase());
  return out.filter((t) => !have.some((h) => h.includes(t.text.toLowerCase().slice(0, 24)))).slice(0, 6);
}

/* ══════════════════════════ 7 · Growth goal suggestions ══════════════════════════ */

const GOAL_LIBRARY: Record<CompetencyId, { title: string; actions: string[]; learning: { title: string; to: string } }> = {
  craft: {
    title: 'Raise the craft bar through reviews and patterns',
    actions: ['Author one reusable pattern or RFC', 'Give 10 in-depth reviews with teaching notes', 'Run a brown-bag on a hard problem you solved'],
    learning: { title: 'Academy · Advanced craft path', to: '/academy' },
  },
  collaboration: {
    title: 'Lead a cross-team initiative end to end',
    actions: ['Pick a cross-team problem with your manager', 'Run a kickoff with a written plan', 'Share a weekly update in Pulse'],
    learning: { title: 'Academy · Collaborating across teams', to: '/academy' },
  },
  ownership: {
    title: 'Own risks early and visibly',
    actions: ['Post a weekly risk & decision log', 'Flag any slip within 24h with options', 'Lead the retro for your next milestone'],
    learning: { title: 'Academy · Leading without authority', to: '/academy' },
  },
  impact: {
    title: 'Tie your work to a company-level outcome',
    actions: ['Link every project to a key result', 'Pick one high-leverage bet with your manager', 'Share the measured impact in your next 1:1'],
    learning: { title: 'Academy · Writing great OKRs', to: '/academy' },
  },
  customer: {
    title: 'Bring the customer voice into every decision',
    actions: ['Join 3 customer calls this quarter', 'Share one insight per week in Pulse', 'Add a customer quote to each design review'],
    learning: { title: 'Academy · Customer discovery', to: '/academy' },
  },
};

export function suggestGrowthGoal(gaps: { competency: CompetencyId; gap: number }[], existing: string[]): { title: string; competency: CompetencyId; why: string; actions: string[]; learning: { title: string; to: string }[] } | null {
  const sorted = gaps.filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap);
  const pick = sorted.find((g) => !existing.some((t) => t.toLowerCase() === GOAL_LIBRARY[g.competency].title.toLowerCase())) ?? sorted[0];
  const c = pick?.competency ?? COMPETENCY_IDS.find((id) => !existing.includes(GOAL_LIBRARY[id].title));
  if (!c) return null;
  const lib = GOAL_LIBRARY[c];
  return {
    title: lib.title,
    competency: c,
    why: pick ? `${COMPETENCY[c].label} is ${pick.gap} step${pick.gap > 1 ? 's' : ''} below the next level: “${COMPETENCY[c].anchors[Math.min(4, Math.max(0, Math.round(pick.gap) + 2))]}”` : `Keep growing your ${COMPETENCY[c].label.toLowerCase()}.`,
    actions: lib.actions,
    learning: [lib.learning],
  };
}

/* ══════════════════════════ 8 · Feedback composer ══════════════════════════ */

export function composeFeedback(p: { situation?: string; behaviour?: string; impact?: string; next?: string }, kind: 'praise' | 'constructive', firstNameTo: string): string {
  const s = (p.situation ?? '').trim().replace(/[.]+$/, '');
  const b = (p.behaviour ?? '').trim().replace(/[.]+$/, '');
  const i = (p.impact ?? '').trim().replace(/[.]+$/, '');
  const n = (p.next ?? '').trim().replace(/[.]+$/, '');
  const parts: string[] = [];
  if (kind === 'praise') {
    if (s && b) parts.push(`${firstNameTo}, ${/^(during|in|at|when|on|while|after|before|last|this|yesterday)\b/i.test(s) ? lower(s) : `in ${lower(s)}`}, you ${lower(b).replace(/^you\s+/i, '')}.`);
    else if (b) parts.push(`${firstNameTo}, you ${lower(b).replace(/^you\s+/i, '')}.`);
    if (i) parts.push(`${cap(i)}.`);
    parts.push('Thank you!');
  } else {
    if (s && b) parts.push(`${firstNameTo}, ${/^(during|in|at|when|on|while|after|before|last|this|yesterday)\b/i.test(s) ? lower(s) : `in ${lower(s)}`}, I noticed you ${lower(b).replace(/^you\s+/i, '')}.`);
    else if (b) parts.push(`${firstNameTo}, I noticed you ${lower(b).replace(/^you\s+/i, '')}.`);
    if (i) parts.push(`The impact was that ${lower(i)}.`);
    if (n) parts.push(`Next time, could you ${lower(n).replace(/^could you\s+/i, '')}?`);
    parts.push('Happy to talk it through.');
  }
  return parts.join(' ');
}

/** Expected progress helper re-exported for callers that only import Nova. */
export const expectedProgress = elapsed;
export const progressOfKr = krProgress;
