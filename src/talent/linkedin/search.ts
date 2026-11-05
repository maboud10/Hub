/**
 * LinkedIn search builders (assisted mode).
 *
 * LinkedIn's people-search and messaging APIs are partner-only, so NEXUS
 * generates ready-to-run searches instead: a Boolean string for LinkedIn
 * Recruiter / Sales Navigator, a one-click LinkedIn people search, and a
 * Google X-ray query, all derived from the decoded JD.
 */
import type { JobProfile } from '../types';
import { skillDef } from '../ai/taxonomy';

export interface LinkedInSearchPack {
  /** Full Boolean for LinkedIn Recruiter / Sales Navigator / basic search. */
  boolean: string;
  /** Short keyword query for the basic people search URL. */
  keywords: string;
  peopleSearchUrl: string;
  xrayQuery: string;
  xrayUrl: string;
  /** "Post a job" entry point for the same role. */
  postJobUrl: string;
  titles: string[];
  skills: string[];
  location: string | null;
}

const quote = (s: string) => (/[\s&/.+#-]/.test(s) ? `"${s.replace(/"/g, '')}"` : s);
const SENIORITY_WORDS = /\b(senior|sr\.?|staff|principal|lead|junior|jr\.?|mid[- ]level)\s+/gi;
const baseTitle = (t: string) => t.replace(SENIORITY_WORDS, '').replace(/\s+/g, ' ').trim();

/** "React" → (React OR "React.js"); keeps queries readable (max one alias). */
function skillTerm(label: string): string {
  const alias = skillDef(label)?.aliases.find((a) => a.length > 2 && a.toLowerCase() !== label.toLowerCase() && /[a-z]/i.test(a));
  return alias ? `(${quote(label)} OR ${quote(alias.replace(/\b\w/g, (c) => c.toUpperCase()))})` : quote(label);
}

export function buildLinkedInSearch(
  profile: Pick<JobProfile, 'title' | 'titleAliases' | 'skills' | 'location' | 'workModel'>,
  opts: { location?: string | null; maxSkills?: number; excludeTerms?: string[] } = {},
): LinkedInSearchPack {
  const titles = [...new Set([profile.title, ...profile.titleAliases].map((t) => t.trim()).filter(Boolean))].slice(0, 5);
  const must = profile.skills
    .filter((s) => s.must)
    .sort((a, b) => b.weight - a.weight)
    .map((s) => s.skill);
  const core = must.slice(0, opts.maxSkills ?? 3);
  const nice = [...must.slice(opts.maxSkills ?? 3, (opts.maxSkills ?? 3) + 2), ...profile.skills.filter((s) => !s.must).map((s) => s.skill)].slice(0, 3);
  const location = opts.location !== undefined ? opts.location : profile.workModel === 'remote' ? null : profile.location;
  const exclude = opts.excludeTerms ?? ['recruiter', 'intern', 'student', '"talent acquisition"'];

  const titleGroup = titles.length ? `(${titles.map(quote).join(' OR ')})` : '';
  const parts = [titleGroup, ...core.map(skillTerm)];
  if (nice.length) parts.push(`(${nice.map(quote).join(' OR ')})`);
  const boolean = `${parts.filter(Boolean).join(' AND ')} NOT (${exclude.join(' OR ')})`;

  const keywords = [quote(baseTitle(profile.title)), ...core.slice(0, 2).map(quote)].join(' ');
  const peopleQuery = location ? `${keywords} ${quote(location.replace(/\s*\(.*\)$/, ''))}` : keywords;
  const peopleSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(peopleQuery)}&origin=GLOBAL_SEARCH_HEADER`;

  const xrayTitles = titles.slice(0, 3).map((t) => `"${baseTitle(t)}"`);
  const xrayQuery = [
    'site:linkedin.com/in',
    xrayTitles.length ? `(${[...new Set(xrayTitles)].join(' OR ')})` : '',
    ...core.map((s) => `"${s}"`),
    location ? `"${location.replace(/\s*\(.*\)$/, '')}"` : '',
    '-intitle:jobs -recruiter',
  ]
    .filter(Boolean)
    .join(' ');
  const xrayUrl = `https://www.google.com/search?q=${encodeURIComponent(xrayQuery)}`;

  return {
    boolean,
    keywords: peopleQuery,
    peopleSearchUrl,
    xrayQuery,
    xrayUrl,
    postJobUrl: 'https://www.linkedin.com/talent/post-a-job',
    titles,
    skills: core,
    location,
  };
}
