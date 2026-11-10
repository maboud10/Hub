/**
 * Bias & quality checker for review narratives, plus the tone meter used by the
 * feedback SBI coach. Deterministic, local, explainable — every flag says *why*
 * and offers a concrete rewrite.
 *
 * Flags: vague praise · personality-not-behaviour words · gender/age-coded terms ·
 * absolutes · hedging · missing specifics · too short · recency bias (share of cited
 * evidence from the last two weeks) · rating ↔ narrative mismatch.
 */
import type { OverallRating } from './types';

const DAY = 86_400_000;

export type BiasKind = 'vague' | 'personality' | 'coded' | 'absolute' | 'hedging' | 'specifics' | 'length' | 'recency' | 'mismatch';

export interface BiasFlag {
  id: string;
  kind: BiasKind;
  severity: 'warn' | 'info';
  title: string;
  message: string;
  /** Answer the flag came from (narrative flags only). */
  questionId?: string;
  /** Matched phrase as written. */
  match?: string;
  /** Replacement for `match` (Apply rewrite). */
  suggestion?: string;
}

export interface BiasEvidence {
  id: string;
  title: string;
  at: number;
}

export interface BiasInput {
  answers: { id: string; text: string }[];
  rating?: OverallRating;
  evidence: BiasEvidence[];
  cited: string[];
  now: number;
}

export interface BiasReport {
  flags: BiasFlag[];
  /** 0..100 — higher is better. */
  score: number;
  /** -1..1 from a small lexicon. */
  sentiment: number;
  /** Share of cited evidence from the last 14 days (null when < 2 citations). */
  recencyShare: number | null;
  words: number;
}

interface Rule {
  kind: BiasKind;
  pattern: string;
  replace: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Vague, generic praise → make it specific. `{ev}` is filled with real evidence. */
const VAGUE: Rule[] = [
  { kind: 'vague', pattern: 'great job|good job|nice job|great work|good work|nice work|well done', replace: 'clear, specific impact (for example: {ev})' },
  { kind: 'vague', pattern: 'rock ?star|superstar|ninja|guru|unicorn', replace: 'consistently high-impact contributor' },
  { kind: 'vague', pattern: 'team player', replace: 'someone who proactively unblocks teammates' },
  { kind: 'vague', pattern: 'hard[- ]working|hard worker', replace: 'someone who reliably delivers on commitments' },
  { kind: 'vague', pattern: 'awesome|amazing|fantastic|incredible', replace: 'measurably effective' },
  { kind: 'vague', pattern: 'crushed it|killed it|killing it|crushing it', replace: 'exceeded the goal' },
  { kind: 'vague', pattern: 'keep it up|keep up the good work', replace: 'keep building on this' },
];

/** Gender-, age- or culture-coded terms (also personality labels). */
const CODED: Rule[] = [
  { kind: 'coded', pattern: 'abrasive|aggressive|pushy|intimidating', replace: 'pushes hard for a position in ways that can shut down discussion' },
  { kind: 'coded', pattern: 'bossy', replace: 'directs work assertively' },
  { kind: 'coded', pattern: 'shrill|hysterical|feisty', replace: 'raises concerns forcefully' },
  { kind: 'coded', pattern: 'nurturing|motherly|maternal|fatherly', replace: 'a supportive coach' },
  { kind: 'coded', pattern: 'young|youthful|energetic|digital native', replace: 'quick to adopt new tools' },
  { kind: 'coded', pattern: 'seasoned|overqualified', replace: 'experienced' },
  { kind: 'coded', pattern: 'culture fit', replace: 'values alignment' },
  { kind: 'coded', pattern: 'articulate', replace: 'a clear communicator' },
  { kind: 'coded', pattern: 'manpower', replace: 'people' },
  { kind: 'coded', pattern: 'guys', replace: 'everyone' },
];

/** Personality labels → describe observable behaviour instead. */
const PERSONALITY: Rule[] = [
  { kind: 'personality', pattern: 'emotional|moody|dramatic', replace: 'reacts strongly under pressure' },
  { kind: 'personality', pattern: 'difficult|stubborn|defensive', replace: 'is slow to change course when given new information' },
  { kind: 'personality', pattern: 'lazy', replace: 'missed agreed deadlines' },
  { kind: 'personality', pattern: 'quiet|shy|introverted|passive', replace: 'contributes less often in group settings' },
  { kind: 'personality', pattern: 'too nice|so nice|sweet|humble', replace: 'supportive of teammates' },
  { kind: 'personality', pattern: 'brilliant|genius|naturally gifted|a natural', replace: 'consistently produces high-quality work' },
  { kind: 'personality', pattern: 'bad attitude|negative attitude|attitude problem', replace: 'pushed back on decisions without offering alternatives' },
  { kind: 'personality', pattern: 'arrogant', replace: 'dismissed input from others' },
];

const ABSOLUTES = /\b(always|never|every single time|constantly)\b/gi;
const HEDGES = /\b(i think maybe|kind of|sort of|a bit|somewhat|i feel like|seems to)\b/gi;

const POS = [
  'led', 'delivered', 'shipped', 'improved', 'cut', 'reduced', 'increased', 'grew', 'excellent', 'strong', 'clear', 'impact', 'unblocked',
  'mentored', 'helped', 'thank', 'thoughtful', 'proactive', 'reliable', 'ahead', 'exceeded', 'praised', 'impressive', 'creative',
  'initiative', 'owned', 'great', 'outstanding', 'trusted', 'raised the bar', 'champion', 'win', 'wins', 'launched',
];
const NEG = [
  'missed', 'late', 'slipped', 'struggled', 'blocked', 'concern', 'concerns', 'issue', 'issues', 'problem', 'lack', 'lacks', 'failed',
  'behind', 'confusing', 'inconsistent', 'poor', 'weak', 'needs to', "didn't", 'did not', 'could not', 'unclear', 'delay', 'delayed',
  'rework', 'escalation', 'stalled', 'surprise', 'frustrat',
];

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function countTerms(text: string, terms: string[]): number {
  const t = ` ${text.toLowerCase()} `;
  let n = 0;
  for (const term of terms) {
    const re = new RegExp(`\\b${esc(term)}`, 'g');
    n += (t.match(re) ?? []).length;
  }
  return n;
}

/** -1 (critical) … 1 (glowing). */
export function sentimentOf(text: string): number {
  const p = countTerms(text, POS);
  const n = countTerms(text, NEG);
  if (p + n === 0) return 0;
  return (p - n) / (p + n);
}

/** Evidence referenced in text by ≥ 2 significant title words (or cited explicitly). */
export function matchEvidence(text: string, evidence: BiasEvidence[]): string[] {
  const t = text.toLowerCase();
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'your', 'our', 'v4', 'new']);
  return evidence
    .filter((e) => {
      const words = e.title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !stop.has(w));
      const hits = words.filter((w) => t.includes(w)).length;
      return words.length > 0 && hits >= Math.min(2, words.length);
    })
    .map((e) => e.id);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Keep the capitalisation of the replaced phrase. */
function fitCase(original: string, replacement: string) {
  return /^[A-Z]/.test(original) ? cap(replacement) : replacement;
}

/**
 * Run every check over a manager (or self) narrative.
 */
export function checkReview(input: BiasInput): BiasReport {
  const flags: BiasFlag[] = [];
  const text = input.answers.map((a) => a.text).join('\n');
  const words = wordCount(text);
  const recentEv = [...input.evidence].sort((a, b) => b.at - a.at);
  const olderEv = recentEv.filter((e) => input.now - e.at > 14 * DAY);
  const topEv = (input.cited.length ? input.evidence.find((e) => input.cited.includes(e.id)) : undefined) ?? olderEv[0] ?? recentEv[0];
  const evText = topEv ? topEv.title.charAt(0).toLowerCase() + topEv.title.slice(1) : 'a concrete result and its effect';
  const seen = new Set<string>();

  for (const a of input.answers) {
    if (!a.text.trim()) continue;
    for (const rule of [...CODED, ...PERSONALITY, ...VAGUE]) {
      const re = new RegExp(`\\b(${rule.pattern})\\b`, 'gi');
      for (const m of a.text.matchAll(re)) {
        const key = `${rule.kind}:${m[0].toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const repl = rule.replace.replace('{ev}', evText);
        flags.push({
          id: `${key}:${a.id}`,
          kind: rule.kind,
          severity: rule.kind === 'vague' ? 'warn' : 'warn',
          title: rule.kind === 'vague' ? 'Vague praise' : rule.kind === 'coded' ? 'Coded language' : 'Personality, not behaviour',
          message:
            rule.kind === 'vague'
              ? `“${m[0]}” doesn’t say what they did or why it mattered. Name the behaviour and its impact.`
              : rule.kind === 'coded'
                ? `“${m[0]}” is often applied unevenly by gender, age or background. Describe the observable behaviour instead.`
                : `“${m[0]}” labels who they are rather than what they did. Describe the behaviour and its effect.`,
          questionId: a.id,
          match: m[0],
          suggestion: fitCase(m[0], repl),
        });
      }
    }
    for (const m of a.text.matchAll(ABSOLUTES)) {
      const key = `absolute:${m[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({
        id: `${key}:${a.id}`,
        kind: 'absolute',
        severity: 'info',
        title: 'Absolute language',
        message: `“${m[0]}” is rarely accurate and can feel unfair. Point to specific instances instead.`,
        questionId: a.id,
        match: m[0],
        suggestion: fitCase(m[0], m[0].toLowerCase() === 'never' ? 'rarely' : 'often'),
      });
    }
    let hedges = 0;
    for (const m of a.text.matchAll(HEDGES)) {
      if (hedges >= 2) break;
      const key = `hedging:${m[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hedges += 1;
      flags.push({
        id: `${key}:${a.id}`,
        kind: 'hedging',
        severity: 'info',
        title: 'Hedging',
        message: `“${m[0]}” softens the message. Be kind and direct.`,
        questionId: a.id,
        match: m[0],
        suggestion: '',
      });
    }
    const w = wordCount(a.text);
    const hasNumber = /\d/.test(a.text);
    const refs = matchEvidence(a.text, input.evidence);
    if (w >= 25 && !hasNumber && refs.length === 0) {
      flags.push({
        id: `specifics:${a.id}`,
        kind: 'specifics',
        severity: 'info',
        title: 'Add a specific example',
        message: topEv ? `No concrete example or number here. Consider citing “${topEv.title}”.` : 'No concrete example or number here. Add one.',
        questionId: a.id,
      });
    }
  }

  if (words > 0 && words < 40) {
    flags.push({ id: 'length', kind: 'length', severity: 'warn', title: 'Too short to be useful', message: `Only ${words} words. Aim for 3–5 specific sentences per answer that matters.` });
  }

  // Recency bias: share of cited evidence from the last 14 days.
  const cited = new Set([...input.cited, ...matchEvidence(text, input.evidence)]);
  const citedEv = input.evidence.filter((e) => cited.has(e.id));
  let recencyShare: number | null = null;
  if (citedEv.length >= 2) {
    const recent = citedEv.filter((e) => input.now - e.at <= 14 * DAY).length;
    recencyShare = recent / citedEv.length;
    if (recencyShare >= 0.6) {
      const older = olderEv.find((e) => !cited.has(e.id));
      flags.push({
        id: 'recency',
        kind: 'recency',
        severity: 'warn',
        title: 'Recency bias',
        message: `${recent} of ${citedEv.length} examples are from the last two weeks.${older ? ` Balance with earlier work, e.g. “${older.title}”.` : ' Look back across the whole quarter.'}`,
      });
    }
  }

  // Rating ↔ narrative mismatch.
  const sentiment = sentimentOf(text);
  if (input.rating && words >= 20) {
    const high = input.rating === 'exceeds' || input.rating === 'exceptional';
    const low = input.rating === 'developing' || input.rating === 'below';
    if (high && sentiment < 0) {
      flags.push({ id: 'mismatch', kind: 'mismatch', severity: 'warn', title: 'Rating ↔ narrative mismatch', message: 'The rating says they exceeded expectations, but the narrative is mostly critical. Make sure the story supports the rating.' });
    } else if (low && sentiment > 0.5) {
      flags.push({ id: 'mismatch', kind: 'mismatch', severity: 'warn', title: 'Rating ↔ narrative mismatch', message: 'The rating is below “Meets”, but the narrative is almost entirely positive. Explain the gap so the rating isn’t a surprise.' });
    } else if (input.rating === 'meets' && sentiment >= 0.85 && words >= 60) {
      flags.push({ id: 'mismatch', kind: 'mismatch', severity: 'info', title: 'Narrative reads above the rating', message: 'This reads like “Exceeds”. Double-check the rating or add growth areas.' });
    }
  }

  const score = Math.max(0, Math.min(100, 100 - flags.reduce((s, f) => s + (f.severity === 'warn' ? 12 : 5), 0) - (words === 0 ? 100 : 0)));
  return { flags, score, sentiment, recencyShare, words };
}

/** Apply a flag's rewrite to the first occurrence of its match (case-insensitive). */
export function applySuggestion(text: string, flag: Pick<BiasFlag, 'match' | 'suggestion'>): string {
  if (!flag.match || flag.suggestion === undefined) return text;
  const re = new RegExp(`\\b${esc(flag.match)}\\b`, 'i');
  const out = text.replace(re, (m) => fitCase(m, flag.suggestion ?? ''));
  return out.replace(/ {2,}/g, ' ').replace(/ ([,.;:])/g, '$1');
}

/* ───────── Tone meter (SBI coach) ───────── */

export interface ToneReport {
  tone: 'warm' | 'neutral' | 'harsh';
  /** -1 harsh … 1 warm */
  score: number;
  tips: string[];
}

const WARM = ['thank', 'appreciate', 'appreciated', 'helped', 'grateful', 'noticed', 'loved', 'great', 'impressed', 'clear', 'thoughtful', 'kind', 'generous', 'unblocked'];
const HARSH = ['terrible', 'awful', 'useless', 'lazy', 'careless', 'stupid', 'ridiculous', 'unacceptable', 'incompetent', 'sloppy', 'you should have', 'you never', 'you always', 'disappointing', 'annoying'];

export function analyzeTone(text: string): ToneReport {
  const tips: string[] = [];
  if (!text.trim()) return { tone: 'neutral', score: 0, tips };
  const w = countTerms(text, WARM);
  const h = countTerms(text, HARSH);
  const abs = (text.match(ABSOLUTES) ?? []).length;
  const youStatements = (text.match(/\byou (are|were|seem)\b/gi) ?? []).length;
  const score = Math.max(-1, Math.min(1, (w - h * 2 - abs * 0.5 - youStatements * 0.5) / Math.max(2, w + h + abs + youStatements)));
  if (abs) tips.push('Avoid absolutes like “always” or “never” — describe the specific moment.');
  if (h) tips.push('Some words may land as an attack. Describe the behaviour, not the person.');
  if (youStatements) tips.push('“You are…” labels the person. Try “When you…, it…”.');
  const tone = score >= 0.25 ? 'warm' : score <= -0.25 ? 'harsh' : 'neutral';
  return { tone, score, tips };
}

/** How complete an SBI note is (0..1) and which part needs work. */
export function sbiCompleteness(parts: { situation?: string; behaviour?: string; impact?: string }): { score: number; missing: ('situation' | 'behaviour' | 'impact')[] } {
  const missing: ('situation' | 'behaviour' | 'impact')[] = [];
  if (wordCount(parts.situation ?? '') < 3) missing.push('situation');
  if (wordCount(parts.behaviour ?? '') < 4) missing.push('behaviour');
  if (wordCount(parts.impact ?? '') < 4) missing.push('impact');
  return { score: (3 - missing.length) / 3, missing };
}
