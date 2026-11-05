export interface FuzzyResult {
  score: number;
  /** Indices of matched characters in the target (for highlighting). */
  indices: number[];
}

/**
 * Lightweight fuzzy matcher: subsequence match with bonuses for word starts,
 * consecutive runs and prefix matches. Returns null when there is no match.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.toLowerCase().trim();
  if (!q) return { score: 0, indices: [] };
  const t = target.toLowerCase();

  const direct = t.indexOf(q);
  if (direct !== -1) {
    const atWordStart = direct === 0 || /[\s\-_/·:]/.test(t[direct - 1]);
    return {
      score: 100 + (direct === 0 ? 40 : 0) + (atWordStart ? 20 : 0) - direct * 0.5 - (t.length - q.length) * 0.1,
      indices: Array.from({ length: q.length }, (_, i) => direct + i),
    };
  }

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    indices.push(found);
    const wordStart = found === 0 || /[\s\-_/·:]/.test(t[found - 1]);
    score += 1 + (wordStart ? 6 : 0) + (found === prev + 1 ? 4 : 0);
    prev = found;
    ti = found + 1;
  }
  const spread = indices[indices.length - 1] - indices[0];
  return { score: score - spread * 0.2, indices };
}

/** Score a record by its best-matching field (title gets a boost). */
export function fuzzyScore(query: string, title: string, extra: string[] = []): FuzzyResult | null {
  const main = fuzzyMatch(query, title);
  let best: FuzzyResult | null = main ? { score: main.score + 10, indices: main.indices } : null;
  for (const field of extra) {
    const r = fuzzyMatch(query, field);
    if (r && (!best || r.score * 0.8 > best.score)) best = { score: r.score * 0.8, indices: main?.indices ?? [] };
  }
  return best;
}
