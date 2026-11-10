/**
 * Shared bits for the quarterly check-in screens (hub + review packet):
 * completeness maths that mirror the store's submit rules, status / rating chips,
 * competency icons and small date helpers.
 */
import type { ReactNode } from 'react';
import { CircleCheck, CircleDashed, Flag, Hammer, Handshake, HeartHandshake, PencilLine, Rocket } from 'lucide-react';
import { Chip, type Tone } from '@/components/neo';
import { COMPETENCY_IDS, RATING } from '@/performance/constants';
import type { CompetencyId, Cycle, ManagerPart, OverallRating, ReviewPart, ReviewStatus, ReviewTemplate } from '@/performance/types';

export const DAY = 86_400_000;

export const wordsIn = (s: string | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** "Q4 2026 Check-in" → "Q4 2026". */
export const cycleShort = (c: Pick<Cycle, 'name'> | undefined) => (c?.name ?? '').replace(/\s*check-?in$/i, '').trim() || 'Check-in';

export function templateFor(templates: ReviewTemplate[], cycle: Pick<Cycle, 'templateId'> | null | undefined): ReviewTemplate | undefined {
  return cycle ? (templates.find((t) => t.id === cycle.templateId) ?? templates[0]) : undefined;
}

export const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const COMP_ICON: Record<CompetencyId, ReactNode> = {
  craft: <Hammer />,
  collaboration: <Handshake />,
  ownership: <Flag />,
  impact: <Rocket />,
  customer: <HeartHandshake />,
};

/* ───────── Completeness (mirrors submitSelf / submitManager) ───────── */

export interface PartProgress {
  answered: number;
  questions: number;
  rated: number;
  ratingsNeeded: number;
  cited: number;
  /** 0..1 */
  value: number;
  ready: boolean;
  missing: string[];
}

/** Self-reflection: every answer 5+ words and all five competencies rated (when the template asks). */
export function selfProgress(part: Pick<ReviewPart, 'answers' | 'ratings' | 'cited'>, tpl: ReviewTemplate | undefined): PartProgress {
  const qs = tpl?.questions ?? [];
  const answered = qs.filter((q) => wordsIn(part.answers[q.id]) >= 5).length;
  const ratingsNeeded = tpl?.competencies === false ? 0 : COMPETENCY_IDS.length;
  const rated = ratingsNeeded ? COMPETENCY_IDS.filter((c) => !!part.ratings[c]).length : 0;
  const total = qs.length + ratingsNeeded;
  const missing: string[] = [];
  if (answered < qs.length) missing.push(`${plural(qs.length - answered, 'answer')} to go (5+ words each)`);
  if (rated < ratingsNeeded) missing.push(`${plural(ratingsNeeded - rated, 'competency', 'competencies')} to rate`);
  return { answered, questions: qs.length, rated, ratingsNeeded, cited: part.cited.length, value: total ? (answered + rated) / total : 0, ready: !missing.length, missing };
}

/** Manager review: 2+ answers of 10+ words, overall rating, potential and all five ratings. */
export function managerProgress(part: Pick<ManagerPart, 'answers' | 'ratings' | 'cited' | 'overall' | 'potential'>, tpl: ReviewTemplate | undefined) {
  const qs = tpl?.questions ?? [];
  const needAnswers = Math.min(2, qs.length || 2);
  const answered = qs.filter((q) => wordsIn(part.answers[q.id]) >= 10).length;
  const ratingsNeeded = tpl?.competencies === false ? 0 : COMPETENCY_IDS.length;
  const rated = ratingsNeeded ? COMPETENCY_IDS.filter((c) => !!part.ratings[c]).length : 0;
  const missing: string[] = [];
  if (answered < needAnswers) missing.push(`Write ${plural(needAnswers - answered, 'more answer')} (10+ words)`);
  if (!part.overall) missing.push('Choose an overall rating');
  if (!part.potential) missing.push('Choose a potential level');
  if (rated < ratingsNeeded) missing.push(`Rate ${plural(ratingsNeeded - rated, 'more competency', 'more competencies')}`);
  const steps = needAnswers + 2 + ratingsNeeded;
  const done = Math.min(answered, needAnswers) + (part.overall ? 1 : 0) + (part.potential ? 1 : 0) + rated;
  return { answered, questions: qs.length, needAnswers, rated, ratingsNeeded, cited: part.cited.length, value: steps ? done / steps : 0, ready: !missing.length, missing };
}

/* ───────── Chips ───────── */

const STATUS_CHIP: Record<ReviewStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  'not-started': { label: 'Not started', tone: 'slate', icon: <CircleDashed /> },
  draft: { label: 'Draft', tone: 'warning', icon: <PencilLine /> },
  submitted: { label: 'Submitted', tone: 'success', icon: <CircleCheck /> },
};

export function ReviewStatusChip({ status, label, size = 'sm' }: { status: ReviewStatus; label?: string; size?: 'sm' | 'md' }) {
  const m = STATUS_CHIP[status];
  return (
    <Chip tone={m.tone} size={size === 'sm' ? 'sm' : undefined} icon={m.icon} className="pf-ck-status">
      {label ?? m.label}
    </Chip>
  );
}

export function RatingChip({ rating, size = 'sm', prefix }: { rating: OverallRating; size?: 'sm' | 'md'; prefix?: string }) {
  const r = RATING[rating];
  return (
    <Chip tone={r.tone as Tone} size={size === 'sm' ? 'sm' : undefined} solid className="pf-ck-rating" title={r.blurb}>
      {prefix ? `${prefix} · ` : ''}
      {r.label}
    </Chip>
  );
}
