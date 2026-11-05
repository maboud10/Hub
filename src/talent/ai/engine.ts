/**
 * Talent intelligence facade — the only module UI code should import for AI.
 * Picks Gemini (Firebase AI Logic) when configured, otherwise the offline
 * engine, and always falls back to offline on any error.
 */
import type { AiEngine, JobProfile, SkillRequirement } from '../types';
import { analyzeJobDescription } from './jd';
import { draftOutreach, type OutreachDraft, type OutreachInput } from './outreach';
import { GEMINI_MODEL, geminiAnalyzeJD, geminiDraftOutreach, isGeminiEnabled } from './gemini';
import { canonicalSkill } from './taxonomy';

export { scoreMatch, rankByMatch, matchTier } from './match';
export { highlightJD } from './jd';
export { draftOutreach, roleFromProfile } from './outreach';
export type { OutreachDraft, OutreachInput, OutreachPerson, OutreachRole } from './outreach';
export { extractDocumentText, ACCEPTED_DOC_TYPES } from './docs';

export interface AiStatus {
  engine: AiEngine;
  label: string;
  model?: string;
  detail: string;
}

export function aiStatus(): AiStatus {
  if (isGeminiEnabled())
    return {
      engine: 'gemini',
      label: 'Gemini',
      model: GEMINI_MODEL,
      detail: `${GEMINI_MODEL} via Firebase AI Logic, with an automatic offline fallback.`,
    };
  return {
    engine: 'offline',
    label: 'NEXUS offline engine',
    detail: 'Built-in skills taxonomy, JD decoder and matcher. Runs entirely in your browser, no data leaves the device.',
  };
}

export interface AnalyzeResult {
  profile: JobProfile;
  /** Set when Gemini was attempted but failed. */
  fallbackReason?: string;
}

const clampWeight = (n: unknown): 1 | 2 | 3 => (n === 3 || n === 2 || n === 1 ? n : Number(n) >= 3 ? 3 : Number(n) <= 1 ? 1 : 2);

/** Decode a job description (Gemini when available, offline otherwise). */
export async function analyzeJD(text: string, opts: { fileName?: string } = {}): Promise<AnalyzeResult> {
  const baseline = analyzeJobDescription(text, opts);
  if (!isGeminiEnabled()) return { profile: baseline };
  try {
    const g = await geminiAnalyzeJD(text);
    const skills: SkillRequirement[] = [];
    const seen = new Set<string>();
    for (const s of g.skills ?? []) {
      const label = canonicalSkill(s.skill) ?? s.skill?.trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      skills.push({ skill: label, weight: clampWeight(s.weight), must: s.must !== false });
    }
    const profile: JobProfile = {
      ...baseline,
      title: g.title?.trim() || baseline.title,
      seniority: g.seniority ?? baseline.seniority,
      yearsMin: typeof g.yearsMin === 'number' ? g.yearsMin : baseline.yearsMin,
      department: g.department ?? baseline.department,
      location: g.location?.trim() || baseline.location,
      workModel: g.workModel ?? baseline.workModel,
      employmentType: g.employmentType ?? baseline.employmentType,
      summary: g.summary?.trim() || baseline.summary,
      skills: skills.length ? skills : baseline.skills,
      responsibilities: g.responsibilities?.length ? g.responsibilities.slice(0, 8) : baseline.responsibilities,
      titleAliases: [...new Set([g.title?.trim() || baseline.title, ...(g.titleAliases ?? []), ...baseline.titleAliases])].filter(Boolean).slice(0, 6),
      keywords: [...new Set([...(g.keywords ?? []), ...baseline.keywords])].slice(0, 8),
      engine: 'gemini',
    };
    return { profile };
  } catch (e) {
    return { profile: baseline, fallbackReason: e instanceof Error ? e.message : 'Gemini unavailable' };
  }
}

export interface DraftResult {
  draft: OutreachDraft;
  fallbackReason?: string;
}

/** Draft outreach (Gemini when available, offline otherwise). */
export async function writeOutreach(input: OutreachInput): Promise<DraftResult> {
  if (!isGeminiEnabled()) return { draft: draftOutreach(input) };
  try {
    return { draft: await geminiDraftOutreach(input) };
  } catch (e) {
    return { draft: draftOutreach(input), fallbackReason: e instanceof Error ? e.message : 'Gemini unavailable' };
  }
}
