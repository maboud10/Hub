/**
 * Career ladders (per job family) with competency expectations per level, plus
 * pure helpers for gaps and promotion readiness.
 */
import type { Department } from '@/types';
import { COMPETENCY_IDS } from './constants';
import type { CompetencyId, Ladder, LadderId, LadderLevel, OverallRating, Score5, UserLevel } from './types';

type Exp = [number, number, number, number, number]; // craft, collaboration, ownership, impact, customer
const lvl = (id: string, title: string, summary: string, e: Exp): LadderLevel => ({
  id,
  title,
  summary,
  expect: { craft: e[0], collaboration: e[1], ownership: e[2], impact: e[3], customer: e[4] },
});

export const LADDERS: Ladder[] = [
  {
    id: 'eng',
    name: 'Engineering',
    track: 'Individual contributor',
    levels: [
      lvl('E1', 'Associate Engineer', 'Learns the codebase and ships well-scoped tasks with support.', [2, 2, 1, 1, 1]),
      lvl('E2', 'Engineer', 'Ships features independently and grows ownership of a component.', [2, 2, 2, 2, 2]),
      lvl('E3', 'Senior Engineer', 'Owns significant systems end to end and lifts the team’s quality bar.', [3, 3, 3, 3, 2]),
      lvl('E4', 'Lead Engineer', 'Leads multi-person projects and sets technical direction for a team.', [4, 3, 4, 3, 3]),
      lvl('E5', 'Staff Engineer', 'Solves cross-team problems and multiplies the impact of several teams.', [4, 4, 4, 4, 3]),
      lvl('E6', 'Principal Engineer', 'Shapes company-wide architecture and engineering culture.', [5, 4, 5, 5, 4]),
    ],
  },
  {
    id: 'design',
    name: 'Design',
    track: 'Design & research',
    levels: [
      lvl('D1', 'Associate Designer', 'Executes well-defined design and research tasks with guidance.', [2, 2, 1, 1, 2]),
      lvl('D2', 'Designer', 'Owns features end to end, grounded in customer insight.', [2, 2, 2, 2, 3]),
      lvl('D3', 'Designer II', 'Leads product areas and partners deeply with engineering and product.', [3, 3, 3, 3, 3]),
      lvl('D4', 'Senior Designer', 'Sets direction for a product area and raises design quality across teams.', [4, 4, 3, 4, 4]),
      lvl('D5', 'Staff Designer', 'Defines the design language and strategy across the company.', [5, 4, 4, 5, 4]),
    ],
  },
  {
    id: 'product',
    name: 'Product',
    track: 'Product management',
    levels: [
      lvl('P1', 'Associate PM', 'Ships well-scoped features with close support.', [2, 2, 2, 1, 2]),
      lvl('P2', 'Product Manager', 'Owns a product area from discovery to delivery.', [2, 3, 3, 2, 3]),
      lvl('P3', 'Senior PM', 'Drives strategy and measurable outcomes for a product line.', [3, 4, 3, 3, 4]),
      lvl('P4', 'Group PM', 'Leads several product areas and grows PMs.', [4, 4, 4, 4, 4]),
      lvl('P5', 'Director of Product', 'Sets product strategy across the company.', [4, 5, 5, 5, 4]),
    ],
  },
  {
    id: 'people',
    name: 'People & Workplace',
    track: 'People operations',
    levels: [
      lvl('H1', 'People Coordinator', 'Runs people processes reliably.', [2, 2, 2, 1, 2]),
      lvl('H2', 'People Partner', 'Owns a people programme and partners with managers.', [2, 3, 2, 2, 3]),
      lvl('H3', 'Senior People Partner', 'Designs programmes that measurably improve employee experience.', [3, 3, 3, 3, 3]),
      lvl('H4', 'People Ops Lead', 'Leads people strategy for the company and builds the team.', [4, 4, 4, 4, 4]),
      lvl('H5', 'Head of People', 'Shapes culture, org design and talent strategy.', [4, 5, 5, 5, 4]),
    ],
  },
  {
    id: 'gtm',
    name: 'Go-to-market',
    track: 'Sales, marketing & success',
    levels: [
      lvl('S1', 'Associate', 'Learns the motion and hits activity goals.', [2, 2, 2, 1, 3]),
      lvl('S2', 'Specialist', 'Owns a book of business or programme and hits targets.', [2, 3, 3, 2, 3]),
      lvl('S3', 'Senior Specialist', 'Wins complex deals or programmes and coaches others.', [3, 3, 3, 3, 4]),
      lvl('S4', 'Lead', 'Leads a segment or function and shapes the playbook.', [4, 4, 4, 4, 4]),
      lvl('S5', 'Director', 'Owns go-to-market strategy for a region or function.', [4, 5, 5, 5, 5]),
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    track: 'Finance & accounting',
    levels: [
      lvl('F1', 'Analyst', 'Delivers accurate analyses and reconciliations.', [2, 2, 2, 1, 1]),
      lvl('F2', 'Finance Analyst II', 'Owns a reporting area and improves its process.', [3, 2, 3, 2, 2]),
      lvl('F3', 'Senior Analyst', 'Leads planning cycles and automates the close.', [3, 3, 3, 3, 2]),
      lvl('F4', 'Controller', 'Owns controls, close and audit for the company.', [4, 4, 4, 4, 3]),
      lvl('F5', 'Head of Finance', 'Sets financial strategy and builds the finance team.', [5, 4, 5, 5, 3]),
    ],
  },
  {
    id: 'mgmt',
    name: 'People leadership',
    track: 'Management',
    levels: [
      lvl('M1', 'Team Lead', 'Leads a small team while staying hands-on.', [3, 3, 3, 3, 3]),
      lvl('M2', 'Manager', 'Builds and grows a team that reliably delivers outcomes.', [3, 4, 4, 4, 3]),
      lvl('M3', 'Senior Manager', 'Leads managers or several teams across a domain.', [4, 4, 4, 4, 4]),
      lvl('M4', 'Director', 'Owns a function’s strategy, org design and talent.', [4, 5, 5, 5, 4]),
      lvl('M5', 'Head of Function', 'Sets direction for a whole function across the company.', [5, 5, 5, 5, 5]),
    ],
  },
];

export const LADDER: Record<LadderId, Ladder> = Object.fromEntries(LADDERS.map((l) => [l.id, l])) as Record<LadderId, Ladder>;

/** Sensible default ladder for a department (new hires before a level is set). */
export function defaultLadderFor(dept: Department | undefined): LadderId {
  switch (dept) {
    case 'Engineering':
    case 'IT & Security':
      return 'eng';
    case 'Design':
      return 'design';
    case 'Product':
      return 'product';
    case 'People Ops':
    case 'Operations':
      return 'people';
    case 'Sales':
    case 'Marketing':
    case 'Customer Success':
      return 'gtm';
    case 'Finance':
      return 'finance';
    default:
      return 'eng';
  }
}

export function levelOf(ul: UserLevel | undefined): { ladder: Ladder; level: LadderLevel; index: number; next: LadderLevel | null } | null {
  if (!ul) return null;
  const ladder = LADDER[ul.ladderId];
  if (!ladder) return null;
  const index = Math.max(0, ladder.levels.findIndex((l) => l.id === ul.levelId));
  return { ladder, level: ladder.levels[index], index, next: ladder.levels[index + 1] ?? null };
}

export interface Gap {
  competency: CompetencyId;
  current: number;
  expected: number;
  gap: number;
}

/** Gaps between assessed scores and a level's expectations (positive gap = below expectation). */
export function gapsTo(level: LadderLevel, scores: Partial<Record<CompetencyId, number>>): Gap[] {
  return COMPETENCY_IDS.map((c) => {
    const current = scores[c] ?? 0;
    return { competency: c, current, expected: level.expect[c], gap: level.expect[c] - current };
  });
}

/**
 * Promotion readiness 0..100: competencies meeting the next level (60%), recent
 * ratings (30%: two strong quarters), time in level (10%: 12 months = full).
 */
export function promotionReadiness(input: {
  next: LadderLevel | null;
  scores: Partial<Record<CompetencyId, Score5>>;
  ratings: OverallRating[];
  monthsInLevel: number;
}): { score: number; meets: number; total: number; reasons: string[] } {
  if (!input.next) return { score: 0, meets: 0, total: 0, reasons: ['Already at the top of this ladder.'] };
  const gaps = gapsTo(input.next, input.scores);
  const meets = gaps.filter((g) => g.gap <= 0).length;
  const total = gaps.length;
  const strong = input.ratings.slice(0, 2).filter((r) => r === 'exceeds' || r === 'exceptional').length;
  const ratingPart = strong / 2;
  const timePart = Math.min(1, input.monthsInLevel / 12);
  const score = Math.round((meets / total) * 60 + ratingPart * 30 + timePart * 10);
  const reasons: string[] = [];
  reasons.push(`${meets} of ${total} competencies already at ${input.next.id} level`);
  if (strong) reasons.push(`${strong} of the last 2 quarters rated Exceeds or above`);
  else reasons.push('No recent quarter rated above Meets yet');
  reasons.push(`${Math.round(input.monthsInLevel)} months in level`);
  return { score, meets, total, reasons };
}
