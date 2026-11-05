/**
 * Explainable candidate ↔ role matching (offline engine).
 *
 * Score = 50% skills (weighted must-haves + nice-to-haves) + 18% experience
 *       + 14% title similarity + 12% location / work model + 6% signals.
 * Every score ships with human-readable reasons so recruiters can trust it,
 * and so hiring decisions stay auditable (no black-box ranking).
 */
import type { JobProfile, Matchable, MatchResult } from '../types';
import { SENIORITY_YEARS } from '../constants';
import { detectRoleFamily, findSkills, normalizeSkills } from './taxonomy';

const REGIONS: Record<string, string[]> = {
  UAE: ['dubai', 'abu dhabi', 'sharjah', 'ajman', 'al ain', 'uae', 'united arab emirates'],
  GCC: ['riyadh', 'jeddah', 'dammam', 'doha', 'manama', 'muscat', 'kuwait', 'saudi', 'ksa', 'qatar', 'bahrain', 'oman'],
  MENA: ['cairo', 'amman', 'beirut', 'istanbul', 'casablanca', 'tunis', 'egypt', 'jordan', 'lebanon', 'turkey'],
  Europe: [
    'london', 'manchester', 'dublin', 'berlin', 'munich', 'amsterdam', 'paris', 'lisbon', 'madrid', 'barcelona', 'milan', 'stockholm',
    'warsaw', 'sofia', 'zurich', 'vienna', 'copenhagen', 'uk', 'germany', 'portugal', 'spain', 'italy', 'france', 'netherlands', 'emea',
  ],
  'South Asia': ['bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'delhi', 'chennai', 'karachi', 'lahore', 'colombo', 'india', 'pakistan'],
  APAC: ['singapore', 'hong kong', 'tokyo', 'sydney', 'melbourne', 'kuala lumpur', 'jakarta', 'manila', 'seoul', 'apac'],
  'North America': ['new york', 'san francisco', 'seattle', 'austin', 'toronto', 'vancouver', 'boston', 'chicago', 'usa', 'canada'],
};

const regionOf = (loc: string): string | null => {
  const l = loc.toLowerCase();
  for (const [region, places] of Object.entries(REGIONS)) if (places.some((p) => l.includes(p))) return region;
  return null;
};

const cityOf = (loc: string) =>
  loc
    .toLowerCase()
    .replace(/remote\s*[·,-]?\s*/g, '')
    .split(/[,·(]/)[0]
    .trim();

const STOP = new Set(['senior', 'sr', 'staff', 'lead', 'principal', 'junior', 'jr', 'the', 'of', 'and', 'i', 'ii', 'iii', 'iv', 'at', 'a', '&', '-', '—']);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9+#/ ]+/g, ' ')
      .split(/[\s/]+/)
      .filter((t) => t && !STOP.has(t)),
  );

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export interface MatchContext {
  /** Profile location override (requisition location beats JD text). */
  location?: string | null;
  workModel?: JobProfile['workModel'];
}

function locationScore(profile: JobProfile, person: Matchable, ctx: MatchContext): { score: number; reason: string } {
  const roleLoc = ctx.location ?? profile.location ?? '';
  const model = ctx.workModel ?? profile.workModel;
  const personLoc = person.location || '';
  if (model === 'remote') {
    const rr = regionOf(roleLoc);
    const pr = regionOf(personLoc);
    if (rr && pr && rr !== pr && !(rr === 'Europe' && (pr === 'MENA' || pr === 'UAE' || pr === 'GCC')))
      return { score: 70, reason: `Remote role · ${personLoc} is outside the ${rr} hiring zone` };
    return { score: 100, reason: 'Remote-friendly role, so location is not a constraint' };
  }
  if (!personLoc || !roleLoc) return { score: 55, reason: 'Location unknown. Confirm during screening' };
  if (cityOf(personLoc) && roleLoc.toLowerCase().includes(cityOf(personLoc)))
    return { score: person.workModelPreference === 'remote' && model === 'onsite' ? 70 : 100, reason: `Based in ${roleLoc}, a local match` };
  const rr = regionOf(roleLoc);
  const pr = regionOf(personLoc);
  if (rr && pr && rr === pr) return { score: 85, reason: `${personLoc} is within commuting / easy-move range of ${roleLoc}` };
  if ((rr === 'UAE' && pr === 'GCC') || (rr === 'GCC' && pr === 'UAE')) return { score: 68, reason: `GCC-based (${personLoc}), so a regional move` };
  if (person.workModelPreference === 'remote' && model === 'onsite') return { score: 20, reason: `Prefers remote; role is on-site in ${roleLoc}` };
  return { score: 35, reason: `Would relocate from ${personLoc}` };
}

/** Score how well a person fits a decoded job profile. */
export function scoreMatch(profile: JobProfile, person: Matchable, ctx: MatchContext = {}): MatchResult {
  // ── skills
  const personSkills = new Set(
    normalizeSkills([...person.skills, ...findSkills(`${person.currentTitle} ${person.headline ?? ''}`).keys()]).map((s) => s.toLowerCase()),
  );
  const must = profile.skills.filter((s) => s.must);
  const nice = profile.skills.filter((s) => !s.must);
  const has = (skill: string) => personSkills.has(skill.toLowerCase());
  const matched = must.filter((s) => has(s.skill));
  const missing = must.filter((s) => !has(s.skill));
  const bonus = nice.filter((s) => has(s.skill));
  const w = (list: typeof must) => list.reduce((n, s) => n + s.weight, 0);
  const mustCov = must.length ? w(matched) / w(must) : nice.length ? w(bonus) / w(nice) : 0.6;
  const niceCov = nice.length ? w(bonus) / w(nice) : 0.5;
  const skills = Math.round(100 * (0.82 * mustCov + 0.18 * niceCov));

  // ── experience
  const need = profile.yearsMin ?? SENIORITY_YEARS[profile.seniority];
  const diff = person.yearsExperience - need;
  const experience = Math.round(diff >= 0 ? Math.max(60, 100 - Math.max(0, diff - 7) * 5) : Math.max(0, 100 + diff * 18));

  // ── title similarity
  const personTitle = tokens(`${person.currentTitle} ${person.headline ?? ''}`);
  let title = Math.round(100 * Math.max(0, ...[profile.title, ...profile.titleAliases].map((t) => jaccard(tokens(t), personTitle))));
  const roleFamily = detectRoleFamily(profile.title);
  const personFamily = detectRoleFamily(person.currentTitle) ?? detectRoleFamily(person.headline ?? '');
  if (roleFamily && personFamily && roleFamily.id === personFamily.id) title = Math.max(title, 82);
  title = Math.min(100, Math.round(title * 1.25));

  // ── location
  const loc = locationScore(profile, person, ctx);

  // ── signals
  let signals = 40;
  const signalReasons: string[] = [];
  if (person.openToWork) {
    signals += 25;
    signalReasons.push('Open to work');
  }
  if (person.source === 'referral') {
    signals += 20;
    signalReasons.push('Employee referral (historically the strongest hire source)');
  } else if (person.source === 'silver-medalist') {
    signals += 15;
    signalReasons.push('Silver medalist: reached late stages in a past process');
  } else if (person.source === 'internal') {
    signals += 15;
    signalReasons.push('Internal mobility candidate');
  }
  signals = Math.min(100, signals);

  const score = Math.round(0.5 * skills + 0.18 * experience + 0.14 * title + 0.12 * loc.score + 0.06 * signals);

  const reasons: string[] = [];
  if (must.length) {
    const top = matched.slice(0, 4).map((s) => s.skill);
    reasons.push(`Covers ${matched.length}/${must.length} must-have skills${top.length ? ` (${top.join(', ')})` : ''}`);
  }
  if (missing.length) reasons.push(`Gap: ${missing.slice(0, 3).map((s) => s.skill).join(', ')}${missing.length > 3 ? ` +${missing.length - 3}` : ''}`);
  reasons.push(
    diff >= 8
      ? `${person.yearsExperience} yrs experience. Well above the ${need}+ asked (check level fit)`
      : diff >= 0
        ? `${person.yearsExperience} yrs experience vs ${need}+ required`
        : `${person.yearsExperience} yrs experience, ${Math.abs(diff)} short of ${need}+`,
  );
  reasons.push(loc.reason);
  reasons.push(...signalReasons);
  if (bonus.length) reasons.push(`Bonus: ${bonus.slice(0, 3).map((s) => s.skill).join(', ')}`);

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { skills, experience, location: loc.score, title, signals },
    matched: matched.map((s) => s.skill),
    missing: missing.map((s) => s.skill),
    bonus: bonus.map((s) => s.skill),
    reasons,
    engine: 'offline',
  };
}

export type MatchTier = 'exceptional' | 'strong' | 'good' | 'partial' | 'low';

export function matchTier(score: number): { tier: MatchTier; label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'muted' } {
  if (score >= 85) return { tier: 'exceptional', label: 'Exceptional fit', tone: 'success' };
  if (score >= 72) return { tier: 'strong', label: 'Strong fit', tone: 'success' };
  if (score >= 58) return { tier: 'good', label: 'Good fit', tone: 'info' };
  if (score >= 45) return { tier: 'partial', label: 'Partial fit', tone: 'warning' };
  return { tier: 'low', label: 'Low fit', tone: 'muted' };
}

/** Rank any list of people against a profile (best first). */
export function rankByMatch<T extends Matchable>(profile: JobProfile, people: T[], ctx: MatchContext = {}): { item: T; match: MatchResult }[] {
  return people.map((item) => ({ item, match: scoreMatch(profile, item, ctx) })).sort((a, b) => b.match.score - a.match.score);
}
