/**
 * Static vocabularies for Performance & OKRs: competencies (with behavioural
 * anchors), rating scales, statuses, cycle phases, upward-feedback dimensions,
 * 9-box labels and the default quarterly template.
 */
import type {
  BoxAxis,
  CompetencyId,
  KrStatus,
  OverallRating,
  PhaseKey,
  Potential,
  ReviewTemplate,
  TemplateQuestion,
  UpwardDimension,
} from './types';

export const PERF_DATA_VERSION = 3;
export const PERF_STORE_KEY = 'nexus-performance-v2';
export const PERF_TINT = { c1: '#f472b6', c2: '#a855f7' } as const;

/* ───────── Competencies ───────── */

export interface CompetencyDef {
  id: CompetencyId;
  label: string;
  short: string;
  blurb: string;
  /** Behavioural anchors for scores 1..5. */
  anchors: [string, string, string, string, string];
}

export const COMPETENCIES: CompetencyDef[] = [
  {
    id: 'craft',
    label: 'Craft',
    short: 'Craft',
    blurb: 'Quality, depth and judgement in your discipline.',
    anchors: [
      'Learning the fundamentals; work needs close review.',
      'Solid fundamentals; delivers well-scoped work with light guidance.',
      'Consistently high-quality work; owns a component end to end.',
      'Raises the quality bar for the team through reviews, patterns and mentoring.',
      'Sets the standard across the org; their work is the reference others copy.',
    ],
  },
  {
    id: 'collaboration',
    label: 'Collaboration',
    short: 'Collab',
    blurb: 'Working across people and teams to get to better outcomes.',
    anchors: [
      'Works mostly alone; collaboration happens when prompted.',
      'Reliable teammate; shares context when asked.',
      'Proactively shares context and makes others more effective.',
      'Builds bridges between teams and resolves disagreement constructively.',
      'Shapes how the whole org collaborates; others seek them out to unblock.',
    ],
  },
  {
    id: 'ownership',
    label: 'Ownership',
    short: 'Owner',
    blurb: 'Seeing things through, raising risks early, owning outcomes.',
    anchors: [
      'Needs follow-up to close loops.',
      'Delivers what was agreed; flags risks when asked.',
      'Owns outcomes, not tasks; raises risks early with options.',
      'Takes ownership of ambiguous, cross-team problems without being asked.',
      'Owns the hardest problems in the org and leaves systems better than found.',
    ],
  },
  {
    id: 'impact',
    label: 'Impact',
    short: 'Impact',
    blurb: 'Moving the metrics and goals that matter.',
    anchors: [
      'Impact limited to own tasks.',
      'Contributes reliably to team goals.',
      'Measurably moves team goals; picks the highest-leverage work.',
      'Moves company-level goals; multiplies the impact of others.',
      'Changes the trajectory of the business.',
    ],
  },
  {
    id: 'customer',
    label: 'Customer focus',
    short: 'Customer',
    blurb: 'Grounding decisions in what customers and colleagues need.',
    anchors: [
      'Rarely considers the customer perspective.',
      'Understands customer needs when they are explained.',
      'Seeks out customer insight and uses it in decisions.',
      'Brings the customer voice into team strategy.',
      'Champions customers across the company; insight drives roadmaps.',
    ],
  },
];

export const COMPETENCY: Record<CompetencyId, CompetencyDef> = Object.fromEntries(COMPETENCIES.map((c) => [c.id, c])) as Record<CompetencyId, CompetencyDef>;
export const COMPETENCY_IDS = COMPETENCIES.map((c) => c.id);

export const SCORE_LABEL: Record<number, string> = {
  1: 'Developing',
  2: 'Growing',
  3: 'Strong',
  4: 'Excellent',
  5: 'Role model',
};

/* ───────── Overall rating & potential ───────── */

export const RATINGS: { id: OverallRating; label: string; value: number; tone: string; blurb: string; guidance: number }[] = [
  { id: 'exceptional', label: 'Exceptional', value: 5, tone: 'violet', blurb: 'Rare, transformational impact well beyond the role.', guidance: 0.1 },
  { id: 'exceeds', label: 'Exceeds', value: 4, tone: 'pink', blurb: 'Consistently delivered beyond expectations.', guidance: 0.25 },
  { id: 'meets', label: 'Meets', value: 3, tone: 'blue', blurb: 'Fully delivered the expectations of the role.', guidance: 0.5 },
  { id: 'developing', label: 'Developing', value: 2, tone: 'amber', blurb: 'Delivered some expectations; growing into the role.', guidance: 0.1 },
  { id: 'below', label: 'Below', value: 1, tone: 'slate', blurb: 'Did not meet expectations; needs a support plan.', guidance: 0.05 },
];
export const RATING: Record<OverallRating, (typeof RATINGS)[number]> = Object.fromEntries(RATINGS.map((r) => [r.id, r])) as Record<OverallRating, (typeof RATINGS)[number]>;

export const POTENTIALS: { id: Potential; label: string; blurb: string }[] = [
  { id: 'high', label: 'High', blurb: 'Ready for significantly bigger scope within a year.' },
  { id: 'medium', label: 'Medium', blurb: 'Growing steadily; ready for more scope over time.' },
  { id: 'low', label: 'Low', blurb: 'Thriving at the current scope.' },
];

export const ratingToAxis = (r: OverallRating): BoxAxis => (r === 'exceptional' || r === 'exceeds' ? 3 : r === 'meets' ? 2 : 1);
export const potentialToAxis = (p: Potential): BoxAxis => (p === 'high' ? 3 : p === 'medium' ? 2 : 1);

/* ───────── KR / objective status ───────── */

export const STATUS_META: Record<KrStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'violet'; color: string; rgb: string }> = {
  'on-track': { label: 'On track', tone: 'success', color: '#34d399', rgb: '52 211 153' },
  'at-risk': { label: 'At risk', tone: 'warning', color: '#fbbf24', rgb: '251 191 36' },
  'off-track': { label: 'Off track', tone: 'danger', color: '#fb7185', rgb: '251 113 133' },
  done: { label: 'Done', tone: 'violet', color: '#a78bfa', rgb: '167 139 250' },
};

/* ───────── Cycle phases ───────── */

export const PHASES: { key: PhaseKey; label: string; short: string; verb: string; blurb: string }[] = [
  { key: 'self', label: 'Self-reflection', short: 'Self', verb: 'Write your self-reflection', blurb: 'Everyone reflects on their quarter, with evidence.' },
  { key: 'peer', label: 'Peer & upward feedback', short: 'Peers', verb: 'Give peer feedback', blurb: 'Nominated peers and reports share Start / Stop / Continue.' },
  { key: 'manager', label: 'Manager review', short: 'Manager', verb: 'Write manager reviews', blurb: 'Managers write reviews from evidence, self-reflection and peers.' },
  { key: 'calibration', label: 'Calibration', short: 'Calibrate', verb: 'Calibrate ratings', blurb: 'Leaders calibrate ratings and potential on the 9-box.' },
  { key: 'release', label: 'Release & conversations', short: 'Release', verb: 'Share reviews', blurb: 'Reviews are shared, acknowledged and discussed 1:1.' },
];
export const PHASE: Record<PhaseKey, (typeof PHASES)[number]> = Object.fromEntries(PHASES.map((p) => [p.key, p])) as Record<PhaseKey, (typeof PHASES)[number]>;

/* ───────── Upward feedback ───────── */

export const UPWARD_DIMENSIONS: { id: UpwardDimension; label: string; short: string }[] = [
  { id: 'clarity', label: 'Sets clear priorities and expectations', short: 'Clarity' },
  { id: 'feedback', label: 'Gives me specific, timely feedback', short: 'Feedback' },
  { id: 'growth', label: 'Actively supports my growth', short: 'Growth' },
  { id: 'safety', label: 'I feel safe raising concerns and disagreeing', short: 'Safety' },
  { id: 'unblock', label: 'Removes blockers quickly', short: 'Unblocking' },
];

/* ───────── 9-box ───────── */

/** Key = `${performance}${potential}` (e.g. `33` = high performance, high potential). */
export const BOX_META: Record<string, { label: string; blurb: string; tone: string }> = {
  '33': { label: 'Star', blurb: 'Top performance and ready for more. Stretch them.', tone: 'violet' },
  '23': { label: 'Rising talent', blurb: 'High potential still converting into results.', tone: 'pink' },
  '13': { label: 'Rough diamond', blurb: 'Big potential, results not there yet. Coach closely.', tone: 'amber' },
  '32': { label: 'High performer', blurb: 'Delivers strongly; grow scope deliberately.', tone: 'blue' },
  '22': { label: 'Core player', blurb: 'Reliable contributor — the backbone of the team.', tone: 'teal' },
  '12': { label: 'Inconsistent', blurb: 'Mixed results; clarify expectations and support.', tone: 'orange' },
  '31': { label: 'Trusted pro', blurb: 'Excellent at their craft; deepen mastery.', tone: 'cyan' },
  '21': { label: 'Solid contributor', blurb: 'Meets the bar at current scope.', tone: 'slate' },
  '11': { label: 'Needs support', blurb: 'Agree a clear, kind support plan.', tone: 'rose' },
};

/* ───────── Default quarterly template ───────── */

export const DEFAULT_QUESTIONS: TemplateQuestion[] = [
  {
    id: 'q-wins',
    prompt: 'What were your most important wins this quarter?',
    managerPrompt: 'What impact did they have this quarter?',
    help: 'Be specific: what changed because of your work? Link evidence.',
  },
  {
    id: 'q-growth',
    prompt: 'Where did you grow, and what did you learn?',
    managerPrompt: 'Where did they grow, and where should they grow next?',
    help: 'Skills, behaviours, feedback you acted on.',
  },
  {
    id: 'q-obstacles',
    prompt: 'What got in your way, and what support would help?',
    managerPrompt: 'What got in their way, and how will you support them?',
    help: 'Blockers, at-risk goals, things to stop doing.',
  },
  {
    id: 'q-next',
    prompt: 'What will you focus on next quarter?',
    managerPrompt: 'What should they focus on next quarter?',
    help: '2–3 priorities, ideally tied to OKRs or your growth plan.',
  },
];

export function defaultTemplate(now: number, by = 'u-sara'): ReviewTemplate {
  return { id: 'tpl-quarterly', name: 'Quarterly check-in', questions: DEFAULT_QUESTIONS.map((q) => ({ ...q })), competencies: true, updatedAt: now, updatedBy: by };
}

export const CADENCE_DAYS = { weekly: 7, biweekly: 14, monthly: 28 } as const;
export const CADENCE_LABEL = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' } as const;

export const MOOD_LABEL: Record<number, string> = { 1: 'Rough', 2: 'Meh', 3: 'Okay', 4: 'Good', 5: 'Great' };
