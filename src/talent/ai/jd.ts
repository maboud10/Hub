/**
 * Offline job-description decoder.
 *
 * Turns a raw JD (pasted text, PDF or DOCX extract) into a structured
 * `JobProfile`: title, seniority, years, location, work model, must-have vs
 * nice-to-have skills, responsibilities, salary, and a "JD health" report with
 * inclusive-language suggestions. Deterministic and instant — Gemini (when
 * configured) refines the same shape, and this engine is the fallback.
 */
import type { Department } from '@/types';
import type { EmploymentType, JDFlag, JobProfile, SalaryRange, Seniority, SkillRequirement, WorkModel } from '../types';
import { SENIORITY_LABEL } from '../constants';
import { CATEGORY_DEPARTMENT, detectRoleFamily, findSkills, skillCategory, skillRanges } from './taxonomy';

type Section = 'intro' | 'about' | 'responsibilities' | 'requirements' | 'nice' | 'benefits' | 'company' | 'other';

const HEADINGS: [RegExp, Section][] = [
  [/^(about (the )?(role|job|position|opportunity)|the role|role overview|overview|job summary|summary|the opportunity|your mission|the mission)\b/i, 'about'],
  [/^(about (us|the company|the team|helix)|who we are|our story|our team|the team|company overview)\b/i, 'company'],
  [/^(responsibilities|key responsibilities|what you('|’)?ll do|what you will do|your impact|in this role|day[- ]to[- ]day|the work|duties|your responsibilities|what you('|’)?ll own)\b/i, 'responsibilities'],
  [/^(nice[- ]to[- ]haves?|bonus( points)?|preferred( qualifications| skills| experience)?|pluses|it('|’)?s a plus|good to have|desirable|extra credit|ideally)\b/i, 'nice'],
  [/^(requirements|qualifications|minimum qualifications|basic qualifications|what you('|’)?ll (need|bring)|what we('|’)?re looking for|must[- ]haves?|skills( & | and )experience|who you are|about you|you have|you are|what you bring|experience|required skills)\b/i, 'requirements'],
  [/^(benefits|perks|what we offer|why join( us)?|compensation|salary|what('|’)?s in it for you|our offer|rewards)\b/i, 'benefits'],
];

const BULLET = /^\s*(?:[-*•●▪◦–—]|\d{1,2}[.)])\s+/;
const NICE_CUE = /\b(nice to have|bonus|a plus|is a plus|are a plus|preferred|ideally|familiarity with|exposure to|is an advantage|desirable|good to have)\b/i;
const STRONG_CUE = /\b(expert|expertise|deep|strong|advanced|extensive|proven|hands-on|proficien\w*|mastery|excellent|production experience)\b/i;
const ROLE_NOUN =
  /\b(engineer|developer|designer|manager|lead|analyst|scientist|specialist|partner|executive|director|head|architect|researcher|consultant|coordinator|officer|administrator|recruiter|associate|intern|strategist|writer|marketer|accountant|controller|sre|owner|representative)\b/i;
const TITLE_LABEL = /^(?:job title|title|role|position)\s*[:\-–]\s*(.+)$/i;

const CITIES: [RegExp, string][] = [
  [/\bdubai\b/i, 'Dubai'],
  [/\babu dhabi\b/i, 'Abu Dhabi'],
  [/\bsharjah\b/i, 'Sharjah'],
  [/\briyadh\b/i, 'Riyadh'],
  [/\bjeddah\b/i, 'Jeddah'],
  [/\bdoha\b/i, 'Doha'],
  [/\bmanama\b/i, 'Manama'],
  [/\bmuscat\b/i, 'Muscat'],
  [/\bcairo\b/i, 'Cairo'],
  [/\bamman\b/i, 'Amman'],
  [/\bistanbul\b/i, 'Istanbul'],
  [/\blondon\b/i, 'London'],
  [/\bdublin\b/i, 'Dublin'],
  [/\bberlin\b/i, 'Berlin'],
  [/\bamsterdam\b/i, 'Amsterdam'],
  [/\bparis\b/i, 'Paris'],
  [/\blisbon\b/i, 'Lisbon'],
  [/\bmadrid\b/i, 'Madrid'],
  [/\bbarcelona\b/i, 'Barcelona'],
  [/\bmilan\b/i, 'Milan'],
  [/\bbengaluru|bangalore\b/i, 'Bengaluru'],
  [/\bmumbai\b/i, 'Mumbai'],
  [/\bhyderabad\b/i, 'Hyderabad'],
  [/\bpune\b/i, 'Pune'],
  [/\bsingapore\b/i, 'Singapore'],
  [/\bhong kong\b/i, 'Hong Kong'],
  [/\btokyo\b/i, 'Tokyo'],
  [/\bsydney\b/i, 'Sydney'],
  [/\bnew york\b/i, 'New York'],
  [/\bsan francisco\b/i, 'San Francisco'],
  [/\btoronto\b/i, 'Toronto'],
];

const DOMAINS: [RegExp, string][] = [
  [/\b(payments?|fintech|card issuing|acquiring|wallets?|open banking)\b/i, 'payments'],
  [/\b(e-?commerce|marketplace|retail)\b/i, 'e-commerce'],
  [/\b(b2b saas|saas|enterprise software)\b/i, 'b2b saas'],
  [/\b(health ?tech|healthcare|clinical)\b/i, 'healthtech'],
  [/\b(logistics|supply chain|mobility|delivery)\b/i, 'logistics'],
  [/\b(gaming|games)\b/i, 'gaming'],
  [/\b(ed ?tech|education|learning platform)\b/i, 'edtech'],
  [/\b(gov ?tech|public sector|government)\b/i, 'govtech'],
  [/\b(cyber ?security|security operations)\b/i, 'cybersecurity'],
  [/\b(generative ai|llms?|machine learning)\b/i, 'ai'],
  [/\b(employee experience|hr tech|people platform|workplace)\b/i, 'employee experience'],
];

interface InclusiveRule {
  re: RegExp;
  suggestion: string;
  message: string;
}

const INCLUSIVE: InclusiveRule[] = [
  {
    re: /\b(rock ?stars?|ninjas?|gurus?|wizards?|superheroes?|unicorns?|jedi)\b/i,
    suggestion: 'expert, specialist',
    message: 'Jargon like this skews applicant pools. Describe the actual skills instead.',
  },
  {
    re: /\b(young|youthful|digital natives?|energetic young)\b/i,
    suggestion: 'remove age-coded wording',
    message: 'Age-coded language discourages experienced candidates and creates legal risk.',
  },
  {
    re: /\b(aggressive|dominant|dominate|fearless|ruthless)\b/i,
    suggestion: 'ambitious, driven, confident',
    message: 'Masculine-coded words measurably reduce applications from women.',
  },
  {
    re: /\b(manpower|chairman|salesman|salesmen|workmanlike)\b/i,
    suggestion: 'workforce, chair, salesperson',
    message: 'Gendered term. Use a neutral alternative.',
  },
  {
    re: /\b(he|his|him)\b(?= (will|should|must|is|has|can))/i,
    suggestion: 'you, they',
    message: 'Gendered pronoun for the candidate. Address the reader as “you”.',
  },
  {
    re: /\bnative (english|arabic|french) speakers?\b/i,
    suggestion: 'fluent in …',
    message: '“Native speaker” can be discriminatory. Ask for fluency instead.',
  },
  {
    re: /\bculture fit\b/i,
    suggestion: 'values alignment, culture add',
    message: '“Culture fit” invites affinity bias. Focus on values and contribution.',
  },
  {
    re: /\b(work hard,? play hard|thick[- ]skinned|crazy hours|hustle)\b/i,
    suggestion: 'describe the real working rhythm',
    message: 'Signals poor work-life balance to many strong candidates.',
  },
];

const YEARS_RE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?(?:\+\s*)?(?:years?|yrs?)\b/gi;
const CUR = '(AED|USD|EUR|GBP|SAR|QAR|SGD|INR|\\$|€|£)';
const SALARY_RE = new RegExp(
  `${CUR}\\s?([\\d.,]+)\\s?([kK])?\\s?(?:-|–|to)\\s?(?:${CUR}\\s?)?([\\d.,]+)\\s?([kK])?(?:\\s*(?:per|\\/|a)\\s*(year|annum|yr|month|mo))?`,
);
const SYMBOL_CURRENCY: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };

interface Line {
  text: string;
  section: Section;
  bullet: boolean;
  heading: boolean;
}

const stripMarkdown = (s: string) =>
  s
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*|__/g, '')
    .replace(/[:：]\s*$/, '')
    .trim();

function classifyHeading(raw: string): Section | null {
  const t = stripMarkdown(raw);
  if (!t || t.length > 64 || BULLET.test(raw)) return null;
  for (const [re, section] of HEADINGS) if (re.test(t)) return section;
  // Unknown short line ending with ":" is still a heading.
  if (/[:：]\s*$/.test(raw.trim()) && t.split(/\s+/).length <= 6) return 'other';
  return null;
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let section: Section = 'intro';
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const raw = rawLine.replace(/\t/g, ' ').trimEnd();
    if (!raw.trim()) continue;
    const heading = classifyHeading(raw);
    if (heading) {
      section = heading;
      out.push({ text: stripMarkdown(raw), section, bullet: false, heading: true });
      continue;
    }
    const bullet = BULLET.test(raw);
    out.push({ text: raw.replace(BULLET, '').trim(), section, bullet, heading: false });
  }
  return out;
}

function cleanTitle(raw: string): string {
  let t = stripMarkdown(raw)
    .replace(/^(we('|’)re hiring|now hiring|job description|jd|job posting|open role)\s*[:\-–—]?\s*/i, '')
    .replace(/\s*\((?:m\/f\/d|f\/m\/d|all genders)\)\s*/i, ' ')
    .trim();
  // Drop trailing location / company qualifiers: "Senior X — Dubai (Hybrid)" → "Senior X"
  const parts = t.split(/\s+[|—–]\s+|\s+-\s+|\s*\(/);
  if (parts.length > 1 && ROLE_NOUN.test(parts[0])) t = parts[0];
  return t.replace(/[)\s]+$/, '').trim();
}

function detectTitle(lines: Line[], fileName?: string): string {
  for (const l of lines.slice(0, 15)) {
    const m = l.text.match(TITLE_LABEL);
    if (m && ROLE_NOUN.test(m[1])) return cleanTitle(m[1]);
  }
  const first = lines.find((l) => !l.bullet);
  if (first && first.text.length <= 90 && ROLE_NOUN.test(first.text) && !/[.!?]$/.test(first.text)) return cleanTitle(first.text);
  for (const l of lines.slice(0, 8)) if (l.text.length <= 80 && ROLE_NOUN.test(l.text) && !l.bullet && !/[.!?]$/.test(l.text)) return cleanTitle(l.text);
  if (fileName) {
    const base = fileName
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b(jd|job description|final|v\d+)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (ROLE_NOUN.test(base)) return cleanTitle(base.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return '';
}

const SENIORITY_PATTERNS: [RegExp, Seniority][] = [
  [/\bintern(ship)?\b/i, 'intern'],
  [/\b(principal|distinguished)\b/i, 'principal'],
  [/\bstaff\b/i, 'staff'],
  [/\b(vp|vice president|chief|c-level)\b/i, 'executive'],
  [/\b(director|head of)\b/i, 'director'],
  [/\b(senior|sr\.?)\b/i, 'senior'],
  [/\b(junior|jr\.?|graduate|entry[- ]level)\b/i, 'junior'],
  [/\b(lead|tech lead)\b/i, 'lead'],
  [/\b(engineering|people|team|design|data|security) manager\b/i, 'manager'],
  [/\b(mid[- ]level|intermediate)\b/i, 'mid'],
];

function seniorityFromYears(years: number | null): Seniority {
  if (years === null) return 'mid';
  if (years <= 2) return 'junior';
  if (years <= 4) return 'mid';
  if (years <= 7) return 'senior';
  if (years <= 9) return 'staff';
  return 'principal';
}

function detectYears(lines: Line[]): number | null {
  const found: { n: number; section: Section }[] = [];
  for (const l of lines) {
    for (const m of l.text.matchAll(YEARS_RE)) {
      const n = Number(m[1]);
      if (n > 0 && n <= 30) found.push({ n, section: l.section });
    }
  }
  if (!found.length) return null;
  const req = found.filter((f) => f.section === 'requirements' || f.section === 'about' || f.section === 'intro');
  return (req[0] ?? found[0]).n;
}

function detectLocation(text: string, lines: Line[]): string | null {
  const locLine = lines.find((l) => /\blocation\b/i.test(l.text));
  const scan = (s: string) => CITIES.find(([re]) => re.test(s))?.[1] ?? null;
  return (locLine && scan(locLine.text)) || scan(text) || (/\bremote\b/i.test(text) ? 'Remote' : null);
}

function detectWorkModel(text: string): WorkModel | null {
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\b(fully[- ])?remote\b/i.test(text) && !/\b(not|no) remote\b/i.test(text)) return 'remote';
  if (/\b(on[- ]?site|in[- ]office|office[- ]based|from (our|the) office)\b/i.test(text)) return 'onsite';
  return null;
}

function detectEmployment(title: string, text: string): EmploymentType {
  if (/\bintern(ship)?\b/i.test(title) || /\binternship\b/i.test(text)) return 'internship';
  if (/\b(contract|contractor|freelance|fixed[- ]term|temporary)\b/i.test(`${title} ${text.slice(0, 600)}`)) return 'contract';
  if (/\bpart[- ]time\b/i.test(text)) return 'part-time';
  return 'full-time';
}

function parseAmount(raw: string, k?: string) {
  const n = Number(raw.replace(/,/g, ''));
  return k ? n * 1000 : n;
}

function detectSalary(text: string): SalaryRange | null {
  const m = text.match(SALARY_RE);
  if (!m) return null;
  const currency = SYMBOL_CURRENCY[m[1]] ?? m[1].toUpperCase();
  const min = parseAmount(m[2], m[3]);
  const max = parseAmount(m[5], m[6]);
  if (!min || !max || max < min) return null;
  let period: 'year' | 'month' = /mo|month/i.test(m[7] ?? '') ? 'month' : 'year';
  if (!m[7] && ['AED', 'SAR', 'QAR'].includes(currency) && max < 90_000) period = 'month';
  return { min, max, currency, period };
}

function detectDomains(text: string): string[] {
  return DOMAINS.filter(([re]) => re.test(text)).map(([, k]) => k);
}

interface SkillAcc {
  must: number;
  nice: number;
  count: number;
  strong: boolean;
  inTitle: boolean;
}

function extractSkills(title: string, lines: Line[]): SkillRequirement[] {
  const acc = new Map<string, SkillAcc>();
  const get = (label: string) => {
    let a = acc.get(label);
    if (!a) acc.set(label, (a = { must: 0, nice: 0, count: 0, strong: false, inTitle: false }));
    return a;
  };
  for (const [label] of findSkills(title)) get(label).inTitle = true;
  for (const l of lines) {
    if (l.heading || l.section === 'benefits' || l.section === 'company') continue;
    const found = findSkills(l.text);
    if (!found.size) continue;
    const nice = l.section === 'nice' || NICE_CUE.test(l.text);
    const strong = STRONG_CUE.test(l.text);
    for (const [label, n] of found) {
      const a = get(label);
      a.count += n;
      if (nice) a.nice += n;
      else a.must += n;
      if (strong && !nice) a.strong = true;
    }
  }
  const list: SkillRequirement[] = [];
  for (const [skill, a] of acc) {
    const must = a.inTitle || a.must > 0;
    const weight: 1 | 2 | 3 = !must ? 1 : a.inTitle || a.strong || a.count >= 3 ? 3 : 2;
    list.push({ skill, weight, must });
  }
  const count = (s: string) => acc.get(s)?.count ?? 0;
  return list.sort((a, b) => Number(b.must) - Number(a.must) || b.weight - a.weight || count(b.skill) - count(a.skill));
}

function extractResponsibilities(lines: Line[]): string[] {
  const pick = (section: Section) => lines.filter((l) => l.section === section && l.bullet).map((l) => l.text);
  let list = pick('responsibilities');
  if (!list.length) list = pick('about');
  if (!list.length)
    list = lines
      .filter((l) => !l.heading && /^(build|design|lead|own|drive|partner|develop|ship|scale|mentor|deliver|create|manage|run|define|shape|champion)\b/i.test(l.text))
      .map((l) => l.text);
  return list
    .map((s) => s.replace(/\s+/g, ' ').replace(/[;.]$/, ''))
    .filter((s) => s.length > 8)
    .slice(0, 8);
}

/** Header metadata rather than prose: "Location: Dubai", "Reports to: Head of X", "Job ID 1234". */
const META_LABEL =
  /^(?:location|based in|office|department|team|function|division|reports? to|reporting to|employment(?: type)?|job type|contract(?: type)?|type|salary|compensation|pay|work(?:place)? (?:model|type)|workplace|schedule|hours|start date|closing date|deadline|posted|level|grade|seniority|company|travel|visa|languages?)\s*[:：]/i;
const META_ID = /^(?:job|req(?:uisition)?|reference|ref)\s*(?:id|no\.?|number|#)/i;
const ENDS_SENTENCE = /[.!?]["”’)]?$/;

function extractSummary(lines: Line[], title: string): string {
  const titleKey = title.toLowerCase();
  const isMeta = (t: string) =>
    META_LABEL.test(t) ||
    META_ID.test(t) ||
    TITLE_LABEL.test(t) ||
    // Generic "Label: value" line that isn't a sentence.
    (/^[\p{L}][\p{L} /&()-]{1,28}[:：]\s+\S/u.test(t) && !ENDS_SENTENCE.test(t)) ||
    // Header strips such as "Remote (EMEA) · Full-time · AED 30k".
    (/[·|•]/.test(t) && !/[.!?]/.test(t));
  const isTitleLine = (t: string) => t.toLowerCase() === titleKey || cleanTitle(t).toLowerCase() === titleKey;
  const isProse = (t: string) => t.length > 40 && !isMeta(t) && !isTitleLine(t) && (ENDS_SENTENCE.test(t) || t.split(/\s+/).length >= 8);

  const collect = (allowed: Section[]) => {
    const out: string[] = [];
    let open = false; // the previous kept line stopped mid-sentence (wrapped PDF text)
    for (const l of lines) {
      if (l.heading || l.bullet || !allowed.includes(l.section)) {
        open = false;
        continue;
      }
      const t = l.text.replace(/\s+/g, ' ').trim();
      if (!(open ? !isMeta(t) && !isTitleLine(t) : isProse(t))) {
        open = false;
        continue;
      }
      out.push(t);
      open = !ENDS_SENTENCE.test(t);
    }
    return out;
  };

  // Prefer the "About the role" section; fall back to prose before the first heading.
  const about = collect(['about']);
  const joined = (about.length ? about : collect(['intro'])).join(' ');
  if (!joined) return '';
  const sentences = joined.match(/[^.!?]+[.!?]+/g) ?? [joined];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 300) break;
    out += s;
  }
  return (out || sentences[0].slice(0, 300)).trim();
}

function inferDepartment(title: string, skills: SkillRequirement[]): Department | null {
  const family = detectRoleFamily(title);
  if (family) return family.department;
  const votes = new Map<Department, number>();
  for (const s of skills) {
    const cat = skillCategory(s.skill);
    const dept = cat ? CATEGORY_DEPARTMENT[cat] : null;
    if (dept) votes.set(dept, (votes.get(dept) ?? 0) + s.weight);
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function titleAliases(title: string, seniority: Seniority): string[] {
  const family = detectRoleFamily(title);
  const prefix = ['senior', 'staff', 'principal', 'lead'].includes(seniority) ? `${SENIORITY_LABEL[seniority]} ` : '';
  const out = [title];
  for (const a of family?.aliases ?? []) {
    out.push(prefix && !a.toLowerCase().startsWith(prefix.trim().toLowerCase()) ? `${prefix}${a}` : a);
    if (prefix) out.push(a);
  }
  return [...new Set(out.filter(Boolean))].slice(0, 6);
}

function qualityReport(input: {
  text: string;
  words: number;
  skills: SkillRequirement[];
  responsibilities: string[];
  yearsMin: number | null;
  salary: SalaryRange | null;
  hasBenefits: boolean;
  location: string | null;
  workModel: WorkModel | null;
}): { score: number; flags: JDFlag[] } {
  const flags: JDFlag[] = [];
  for (const rule of INCLUSIVE) {
    const m = input.text.match(rule.re);
    if (m) flags.push({ kind: 'inclusive', severity: 'warning', term: m[0], suggestion: rule.suggestion, message: rule.message });
  }
  if (input.words < 120)
    flags.push({ kind: 'length', severity: 'warning', message: `Very short (${input.words} words). Candidates need context on the team, impact and growth.` });
  else if (input.words > 900) flags.push({ kind: 'length', severity: 'info', message: `Long (${input.words} words). Aim for 300–700 words to lift completion rates.` });
  if (!input.responsibilities.length) flags.push({ kind: 'clarity', severity: 'warning', message: 'No clear responsibilities. Say what this person will own in their first year.' });
  const must = input.skills.filter((s) => s.must).length;
  if (must > 10)
    flags.push({
      kind: 'requirements',
      severity: 'warning',
      message: `${must} must-have skills. Long lists deter qualified people (especially women); move some to nice-to-have.`,
    });
  else if (must < 2) flags.push({ kind: 'requirements', severity: 'info', message: 'Few concrete skills detected. Add the key tools and competencies.' });
  if (input.yearsMin !== null && input.yearsMin >= 10)
    flags.push({ kind: 'requirements', severity: 'warning', message: `${input.yearsMin}+ years is a high bar that may exclude strong candidates. Consider describing outcomes instead.` });
  if (!input.salary) flags.push({ kind: 'salary', severity: 'info', message: 'No salary range. Pay transparency increases qualified applications.' });
  if (!input.hasBenefits) flags.push({ kind: 'benefits', severity: 'info', message: 'Add benefits & perks (visa, health cover, relocation, learning budget).' });
  if (!input.location || !input.workModel) flags.push({ kind: 'clarity', severity: 'info', message: 'State the location and work model (on-site, hybrid or remote).' });
  const penalty = flags.reduce((n, f) => n + (f.kind === 'inclusive' ? 10 : f.severity === 'warning' ? 12 : 5), 0);
  return { score: Math.max(30, Math.min(100, 100 - penalty)), flags };
}

/** Decode a job description into a structured profile (offline engine). */
export function analyzeJobDescription(text: string, opts: { fileName?: string; now?: number } = {}): JobProfile {
  const clean = (text ?? '').replace(/\u00a0/g, ' ').trim();
  const lines = splitLines(clean);
  const title = detectTitle(lines, opts.fileName) || 'Open role';
  const yearsMin = detectYears(lines);
  const titleSeniority = SENIORITY_PATTERNS.find(([re]) => re.test(title))?.[1];
  const seniority = titleSeniority ?? (detectRoleFamily(title)?.id === 'eng-manager' ? 'manager' : seniorityFromYears(yearsMin));
  const skills = extractSkills(title, lines);
  const responsibilities = extractResponsibilities(lines);
  const location = detectLocation(clean, lines);
  const workModel = detectWorkModel(clean);
  const salary = detectSalary(clean);
  const words = clean.split(/\s+/).filter(Boolean).length;
  const family = detectRoleFamily(title);
  const summary =
    extractSummary(lines, title) ||
    `${SENIORITY_LABEL[seniority]} ${title.replace(new RegExp(`^${SENIORITY_LABEL[seniority]}\\s+`, 'i'), '')}${location ? ` based in ${location}` : ''}.`;

  return {
    title,
    seniority,
    yearsMin,
    department: inferDepartment(title, skills),
    location,
    workModel,
    employmentType: detectEmployment(title, clean),
    summary,
    skills,
    responsibilities,
    titleAliases: titleAliases(title, seniority),
    keywords: [...new Set([...(family?.keywords ?? []), ...detectDomains(clean)])].slice(0, 6),
    salary,
    quality: qualityReport({
      text: clean,
      words,
      skills,
      responsibilities,
      yearsMin,
      salary,
      hasBenefits: lines.some((l) => l.section === 'benefits'),
      location,
      workModel,
    }),
    engine: 'offline',
    analyzedAt: opts.now ?? Date.now(),
  };
}

// ───────────────────────── X-ray highlighting ─────────────────────────
export type HighlightKind = 'must' | 'nice' | 'years' | 'location' | 'work' | 'salary' | 'flag';

export interface HighlightSegment {
  text: string;
  kind?: HighlightKind;
  /** Canonical skill label or flag suggestion for tooltips. */
  label?: string;
}

/** Split a JD into segments so the UI can render an annotated "X-ray" of what was detected. */
export function highlightJD(text: string, profile: Pick<JobProfile, 'skills' | 'quality'>): HighlightSegment[] {
  if (!text) return [];
  const must = new Set(profile.skills.filter((s) => s.must).map((s) => s.skill));
  const all = new Set(profile.skills.map((s) => s.skill));
  const ranges: { start: number; end: number; kind: HighlightKind; label?: string }[] = [];
  for (const r of skillRanges(text, all)) ranges.push({ ...r, kind: must.has(r.label) ? 'must' : 'nice' });
  for (const m of text.matchAll(YEARS_RE)) ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: 'years' });
  for (const [re, label] of CITIES) {
    const g = new RegExp(re.source, 'gi');
    for (const m of text.matchAll(g)) ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: 'location', label });
  }
  for (const m of text.matchAll(/\b(hybrid|fully remote|remote|on[- ]?site|in[- ]office)\b/gi))
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: 'work' });
  const sal = text.match(SALARY_RE);
  if (sal && sal.index !== undefined) ranges.push({ start: sal.index, end: sal.index + sal[0].length, kind: 'salary' });
  for (const f of profile.quality.flags) {
    if (f.kind !== 'inclusive' || !f.term) continue;
    const re = new RegExp(`\\b${f.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const m of text.matchAll(re)) ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: 'flag', label: f.suggestion });
  }
  // Earliest first; on overlap keep the longer range.
  ranges.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start) });
    segments.push({ text: text.slice(r.start, r.end), kind: r.kind, label: r.label });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
