/**
 * Import candidates from LinkedIn without scraping:
 *  - a pasted profile URL (vanity → name guess), or
 *  - the profile's own "Save to PDF" export / pasted profile text.
 * The UI always shows a review step before anything is saved.
 */
import type { Education, Experience } from '../types';
import { findSkills, normalizeSkills } from '../ai/taxonomy';

export type ParsedUrl = { ok: true; url: string; vanity: string; nameGuess: string } | { ok: false; error: string };

export function parseLinkedInUrl(input: string): ParsedUrl {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Paste a LinkedIn profile URL.' };
  const m = raw.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return { ok: false, error: 'That doesn’t look like a LinkedIn profile URL (linkedin.com/in/…).' };
  const vanity = decodeURIComponent(m[1]).replace(/\/$/, '');
  const words = vanity
    .split(/[-_]+/)
    .filter((w) => w && !/\d/.test(w) && !/^[a-f0-9]{6,}$/i.test(w))
    .slice(0, 4);
  const nameGuess = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { ok: true, url: `https://www.linkedin.com/in/${vanity}`, vanity, nameGuess };
}

export interface ProfileDraft {
  name?: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  email?: string;
  linkedinUrl?: string;
  skills: string[];
  yearsExperience?: number;
  experience: Experience[];
  education: Education[];
  summary?: string;
}

const SECTION = /^(contact|top skills|skills|languages|certifications|honors-awards|honors & awards|summary|about|experience|education|publications|patents|projects|volunteer experience|recommendations)$/i;
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const DATE_RANGE = new RegExp(
  `((?:${MONTHS})[a-z]*\\.?\\s+\\d{4}|\\d{4})\\s*[-–]\\s*(present|current|(?:${MONTHS})[a-z]*\\.?\\s+\\d{4}|\\d{4})`,
  'i',
);
const NAME_LIKE = /^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3}$/u;
const LOCATION_LIKE = /\b(area|united arab emirates|uae|emirate|saudi arabia|egypt|jordan|india|united kingdom|germany|portugal|singapore|remote|dubai|abu dhabi|riyadh|cairo|london)\b/i;

const monthIndex = (s: string) => {
  const i = MONTHS.split('|').indexOf(s.slice(0, 3).toLowerCase());
  return i < 0 ? 0 : i;
};

function toYm(token: string): string | null {
  if (/present|current/i.test(token)) return null;
  const y = token.match(/\d{4}/)?.[0];
  if (!y) return null;
  const m = /[a-z]/i.test(token) ? monthIndex(token) + 1 : 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Heuristic parser for LinkedIn "Save to PDF" exports or pasted profile text. */
export function parseProfileText(text: string): ProfileDraft {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // Pasted profile pages: "Dubai, UAE · Contact info", "Hassan Ali · 2nd".
    .map((l) => l.replace(/\s*·\s*(?:contact info|1st|2nd|3rd\+?)$/i, ''))
    .filter(Boolean)
    .filter((l) => !/^page \d+ of \d+$/i.test(l))
    .filter((l) => !/^(?:he|she|they)\s*\/\s*(?:him|her|them)(?:\s*\/\s*\w+)?$/i.test(l) && !/^[\d,.]+[kK+]*\s+(?:connections|followers)$/i.test(l));
  const draft: ProfileDraft = { skills: [], experience: [], education: [] };

  draft.email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const li = text.match(/(?:www\.)?linkedin\.com\/in\/[\w%-]+/i)?.[0];
  if (li) draft.linkedinUrl = `https://${li.replace(/^https?:\/\//, '').replace(/^(?!www\.)/, 'www.')}`;

  // Name: LinkedIn's PDF puts the sidebar (Contact, Top Skills, Languages…) first, then
  // name → headline → location. Score name-like lines so a sidebar item such as
  // "Product Management" or "AWS Certified Developer" doesn't win.
  const nameIdx = pickNameIndex(lines);

  // Sections. The name block closes whatever sidebar section came before it.
  const sections = new Map<string, string[]>();
  let current = 'header';
  lines.forEach((l, i) => {
    if (SECTION.test(l)) {
      current = l.toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      return;
    }
    if (i === nameIdx) current = 'profile';
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)!.push(l);
  });

  // Name / headline / location.
  const all = lines;
  if (nameIdx >= 0) {
    draft.name = all[nameIdx];
    const headline = all[nameIdx + 1];
    if (headline && headline.length >= 8 && headline.length <= 200 && !SECTION.test(headline)) {
      draft.headline = headline;
      const at = headline.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[|·•].*)?$/i);
      if (at) {
        draft.currentTitle = at[1].trim();
        draft.currentCompany = at[2].trim();
      } else draft.currentTitle = headline.split(/[|·•]/)[0].trim();
    }
    const loc = all.slice(nameIdx + 1, nameIdx + 4).find((l) => LOCATION_LIKE.test(l) && l.length < 80);
    if (loc) draft.location = loc;
  }

  // Summary
  const summary = sections.get('summary') ?? sections.get('about');
  if (summary?.length) draft.summary = summary.join(' ').slice(0, 600);

  // Experience: [company?] title, date-range line, [location], description…
  const exp = sections.get('experience') ?? [];
  for (let i = 0; i < exp.length; i += 1) {
    const m = exp[i].match(DATE_RANGE);
    if (!m) continue;
    const title = exp[i - 1] && !DATE_RANGE.test(exp[i - 1]) ? exp[i - 1] : '';
    const companyLine = exp[i - 2] && !DATE_RANGE.test(exp[i - 2]) ? exp[i - 2] : '';
    const company = companyLine && companyLine.length < 70 && !/^\d/.test(companyLine) ? companyLine.replace(/\s*\(.*\)$/, '') : draft.experience[draft.experience.length - 1]?.company ?? '';
    if (!title) continue;
    draft.experience.push({ title, company, start: toYm(m[1]) ?? `${new Date().getFullYear()}-01`, end: toYm(m[2]) });
  }
  if (draft.experience[0]) {
    draft.currentTitle ??= draft.experience[0].title;
    draft.currentCompany ??= draft.experience[0].company;
  }

  // Years of experience: from the earliest start date.
  const starts = draft.experience.map((e) => Number(e.start.slice(0, 4))).filter(Boolean);
  if (starts.length) draft.yearsExperience = Math.max(0, new Date().getFullYear() - Math.min(...starts));
  else {
    const y = text.match(/(\d{1,2})\+?\s*years? of experience/i);
    if (y) draft.yearsExperience = Number(y[1]);
  }

  // Education: school line followed by degree line.
  const edu = sections.get('education') ?? [];
  for (let i = 0; i < edu.length; i += 2) {
    const school = edu[i];
    const degreeLine = edu[i + 1] ?? '';
    if (!school || DATE_RANGE.test(school)) continue;
    const year = Number(degreeLine.match(/(\d{4})\s*\)?\s*$/)?.[1]) || undefined;
    draft.education.push({ school, degree: degreeLine.replace(/\s*·?\s*\(.*\)\s*$/, '').trim() || 'Degree', year });
    if (draft.education.length >= 3) break;
  }

  // Skills: "Top Skills" (PDF) / "Skills" (pasted page) + taxonomy scan of the whole profile.
  const own = new Set([draft.name, draft.headline, draft.location, draft.currentTitle, draft.currentCompany].filter(Boolean).map((s) => s!.toLowerCase()));
  const listed = [...(sections.get('top skills') ?? []), ...(sections.get('skills') ?? [])].filter((l) => looksLikeSkill(l) && !own.has(l.toLowerCase())).slice(0, 12);
  const scanned = [...findSkills(text).entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  draft.skills = normalizeSkills([...listed, ...scanned]).slice(0, 14);
  return draft;
}

const CONTACT_LIKE = /@|linkedin|www\.|https?:/i;
const SKILL_NOISE = /endorse|^show all|^see all|^\d+\s|connections?$|followers?$|\(linkedin\)|^passed linkedin/i;

/** A sidebar / skills-list line that plausibly names a skill. */
function looksLikeSkill(l: string): boolean {
  if (l.length > 40 || l.split(/\s+/).length > 4) return false;
  if (CONTACT_LIKE.test(l) || SKILL_NOISE.test(l) || /[,|·•]/.test(l) || DATE_RANGE.test(l)) return false;
  return !LOCATION_LIKE.test(l) || findSkills(l).size > 0;
}

/** Index of the profile owner's name, or -1. */
function pickNameIndex(lines: string[]): number {
  let best = -1;
  let bestScore = -Infinity;
  lines.forEach((l, i) => {
    if (!NAME_LIKE.test(l) || SECTION.test(l) || CONTACT_LIKE.test(l)) return;
    let score = 0;
    const next = lines[i + 1] ?? '';
    // Headline right after the name: "Senior Engineer at Careem | React", or a longer phrase.
    if (next && !SECTION.test(next) && (/\s(?:at|@)\s|[|·•]/.test(next) || next.split(/\s+/).length >= 3)) score += 2;
    if (lines.slice(i + 1, i + 4).some((n) => LOCATION_LIKE.test(n) && n.length < 80)) score += 3;
    if (lines.slice(i + 1, i + 6).some((n) => /^(summary|about|experience)$/i.test(n))) score += 1;
    if (findSkills(l).size > 0) score -= 3; // "Product Management", "AWS Certified Developer"
    if (LOCATION_LIKE.test(l)) score -= 3; // "Abu Dhabi", "United Kingdom"
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}
