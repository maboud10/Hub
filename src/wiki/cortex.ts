/**
 * Nova Docs ("Ask the Cortex") — permission-first search & grounded Q&A engine.
 *
 * IMPORTANT: Callers pass ONLY `visibleArticles` already filtered through
 * `canReadArticle(viewer, article, spaces)`. Restricted spaces never enter
 * ranking or synthesis for unauthorized viewers (e.g. contractors).
 */
import { computeFreshness } from './constants';
import type { WikiArticle, WikiSpace } from './types';

export interface CortexCitation {
  index: number;
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  sectionId: string;
  sectionHeading: string;
  spaceName: string;
  spaceHue: number;
  excerpt: string;
  freshnessLabel: string;
  isStale: boolean;
}

export interface CortexAnswer {
  query: string;
  headline: string;
  paragraphs: string[];
  bullets: string[];
  citations: CortexCitation[];
  relatedCourseIds: string[];
  relatedRoute?: { label: string; to: string };
  restrictedHint?: boolean;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'how', 'what', 'when',
  'where', 'who', 'why', 'can', 'i', 'we', 'my', 'our', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'with', 'about', 'at', 'helix', 'nexus', 'should', 'get', 'use', 'set', 'up',
]);

const SYNONYMS: Record<string, string[]> = {
  wfa: ['anywhere', 'remote', 'leave', 'time', 'off'],
  pto: ['leave', 'annual', 'vacation', 'holiday', 'time'],
  vacation: ['leave', 'annual', 'holiday', 'time'],
  mfa: ['passkey', 'passkeys', 'security', 'sso', 'zero', 'trust', 'auth'],
  '2fa': ['passkey', 'passkeys', 'security', 'sso'],
  login: ['passkey', 'sso', 'account', 'nexus'],
  sev1: ['incident', 'outage', 'canary', 'rollback', 'oncall', 'runbook'],
  outage: ['incident', 'rollback', 'canary', 'runbook'],
  llm: ['ai', 'gemini', 'prompt', 'privacy', 'rag'],
  chatgpt: ['ai', 'gemini', 'privacy', 'prompt'],
  hire: ['interview', 'scorecard', 'offer', 'talent', 'debrief'],
  interview: ['scorecard', 'structured', 'hiring', 'rubric', 'debrief'],
  newbie: ['onboarding', 'first', 'week', 'buddy', 'day'],
  joiner: ['onboarding', 'first', 'week', 'buddy', 'day'],
};

export function tokenizeQuery(raw: string): string[] {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const expanded = new Set<string>(base);
  for (const token of base) {
    for (const syn of SYNONYMS[token] ?? []) expanded.add(syn);
  }
  return [...expanded];
}

export interface SearchHit {
  article: WikiArticle;
  score: number;
  matchedSectionId?: string;
  matchedHeading?: string;
  snippet: string;
}

export function searchArticles(query: string, visibleArticles: WikiArticle[]): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = tokenizeQuery(q);
  const hits: SearchHit[] = [];

  for (const a of visibleArticles) {
    let score = 0;
    const titleLc = a.title.toLowerCase();
    const subLc = `${a.subtitle} ${a.tldr}`.toLowerCase();
    const tagsLc = a.tags.join(' ').toLowerCase();

    if (titleLc.includes(q)) score += 40;
    if (subLc.includes(q)) score += 22;

    for (const t of tokens) {
      if (titleLc.includes(t)) score += 16;
      if (tagsLc.includes(t)) score += 14;
      if (subLc.includes(t)) score += 9;
    }

    let bestSec = a.sections[0];
    let bestSecScore = -1;
    for (const sec of a.sections) {
      const secText = `${sec.heading} ${sec.body} ${sec.callout?.title ?? ''} ${sec.callout?.text ?? ''} ${(sec.checklist ?? []).map((c) => c.label).join(' ')}`.toLowerCase();
      let secScore = 0;
      if (secText.includes(q)) secScore += 18;
      for (const t of tokens) {
        if (sec.heading.toLowerCase().includes(t)) secScore += 12;
        if (secText.includes(t)) secScore += 6;
      }
      if (secScore > bestSecScore) {
        bestSecScore = secScore;
        bestSec = sec;
      }
      score += Math.min(24, secScore);
    }

    if (score > 0) {
      const rawSnippet = bestSec ? bestSec.body : a.tldr;
      hits.push({
        article: a,
        score: score + (a.pinned ? 3 : 0),
        matchedSectionId: bestSec?.id,
        matchedHeading: bestSec?.heading,
        snippet: rawSnippet.length > 180 ? `${rawSnippet.slice(0, 177)}…` : rawSnippet,
      });
    }
  }

  return hits.sort((x, y) => y.score - x.score);
}

/** Synthesize a grounded, cited answer strictly from `visibleArticles`. */
export function askCortex(
  query: string,
  visibleArticles: WikiArticle[],
  spaces: WikiSpace[],
  totalCatalogCount: number,
  now = Date.now(),
): CortexAnswer {
  const spaceMap = new Map(spaces.map((s) => [s.id, s]));
  const hits = searchArticles(query, visibleArticles).slice(0, 3);

  if (hits.length === 0) {
    return {
      query,
      headline: 'No matching authorised playbooks found',
      paragraphs: [
        totalCatalogCount > visibleArticles.length
          ? 'Nova Docs searched every Knowledge Base space in your clearance and found no grounded match. Restricted spaces outside your current role are excluded automatically.'
          : 'Nova Docs only answers from verified Helix Knowledge Base pages so it never invents policy details.',
      ],
      bullets: [
        'Try broader terms like “passkeys”, “first week”, “time off”, “incident”, or “AI safety”.',
        'Need an official answer from HR? Open HR Portal → Ask People Ops.',
      ],
      citations: [],
      relatedCourseIds: [],
      restrictedHint: totalCatalogCount > visibleArticles.length,
    };
  }

  const citations: CortexCitation[] = hits.map((h, i) => {
    const sp = spaceMap.get(h.article.spaceId);
    const fresh = computeFreshness(h.article, now);
    const sec = h.article.sections.find((s) => s.id === h.matchedSectionId) ?? h.article.sections[0];
    return {
      index: i + 1,
      articleId: h.article.id,
      articleSlug: h.article.slug,
      articleTitle: h.article.title,
      sectionId: sec?.id ?? '',
      sectionHeading: sec?.heading ?? 'Overview',
      spaceName: sp?.name ?? h.article.spaceId,
      spaceHue: sp?.hue ?? 174,
      excerpt: h.snippet,
      freshnessLabel: fresh.label,
      isStale: fresh.state === 'stale',
    };
  });

  const primary = hits[0].article;
  const primarySec = primary.sections.find((s) => s.id === hits[0].matchedSectionId) ?? primary.sections[0];

  const paragraphs: string[] = [`${primary.tldr} [1]`];
  if (primarySec) {
    paragraphs.push(`${primarySec.body}${hits[1] ? ' — see also related guidance in [2].' : ' [1]'}`);
  }

  const bullets: string[] = [];
  if (primarySec?.checklist?.length) {
    for (const item of primarySec.checklist.slice(0, 4)) bullets.push(`${item.label} [1]`);
  } else if (primarySec?.callout) {
    bullets.push(`${primarySec.callout.title}: ${primarySec.callout.text} [1]`);
  }
  if (hits[1]) {
    bullets.push(`Related in ${hits[1].article.title}: ${hits[1].article.tldr} [2]`);
  }
  if (hits[2]) {
    bullets.push(`See also ${hits[2].article.title} (${hits[2].matchedHeading ?? 'Reference'}) [3]`);
  }

  const relatedCourseIds = [...new Set(hits.flatMap((h) => h.article.relatedCourseIds))].slice(0, 2);

  return {
    query,
    headline: `${primary.title} · ${primarySec?.heading ?? 'Summary'}`,
    paragraphs,
    bullets,
    citations,
    relatedCourseIds,
    relatedRoute: primary.relatedRoute,
  };
}
