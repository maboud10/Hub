/**
 * Guides — shared pieces for the self-service library and the step reader:
 * a forgiving fuzzy search (typos, synonyms, hyphens, plurals), match
 * highlighting, live helpful scores (seed baseline + per-person votes),
 * related guides and the services a guide depends on — so known incidents
 * surface right where people are troubleshooting.
 */
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router';
import { Clock3, ListChecks, Siren, ThumbsUp, Wand2 } from 'lucide-react';
import type { Guide, Incident, Office, PlaybookId, Service, TicketCategory } from '@/helpdesk/types';
import { CATEGORY_LABEL, CATEGORY_TONE } from '@/helpdesk/meta';
import { PLAYBOOKS } from '@/helpdesk/playbooks';
import { activeIncidents } from '@/helpdesk/queries';
import { CategoryGlyph } from './ui';

/* ---------------------------------------------------------------- labels */

/** Short category names for the library (tickets keep the longer ones). */
export const GUIDE_CATEGORY_LABEL: Record<TicketCategory, string> = {
  hardware: 'Hardware',
  software: 'Software',
  access: 'Access & sign-in',
  network: 'Network & VPN',
  email: 'Email & calendar',
  security: 'Security',
  other: 'Other',
};

/* ---------------------------------------------------------------- helpful score */

export interface GuideScore {
  up: number;
  down: number;
  total: number;
  /** Share of helpful votes, 0..100. */
  pct: number;
  /** The viewer's own vote, if any. */
  mine?: 1 | -1;
}

/** Seed baseline + live per-person votes. */
export function guideScore(g: Guide, votes: Record<string, 1 | -1> | undefined, me?: string): GuideScore {
  let up = g.helpful;
  let down = g.notHelpful;
  for (const v of Object.values(votes ?? {})) {
    if (v === 1) up += 1;
    else down += 1;
  }
  const total = up + down;
  return { up, down, total, pct: total ? Math.round((up / total) * 100) : 0, mine: me ? votes?.[me] : undefined };
}

/* ---------------------------------------------------------------- fuzzy search */

const STOP = new Set([
  'a', 'an', 'the', 'my', 'i', 'im', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'how', 'do', 'does', 'it', 'its', 'me',
  'with', 'can', 'cant', 'cannot', 'not', 'what', 'when', 'why', 'get', 'keeps', 'keep', 'help', 'please', 'from', 'at', 'be', 'was',
  'this', 'that', 'there', 'wont', 'doesnt', 'dont', 'isnt',
]);

/** Everyday words → the words guides actually use (weaker than a direct hit). */
const SYNONYMS: Record<string, string[]> = {
  wifi: ['wireless', '802.1x', 'helixcorp'],
  wireless: ['wifi'],
  internet: ['wifi', 'vpn', 'network'],
  network: ['wifi', 'vpn'],
  vpn: ['tunnel', 'helix connect'],
  remote: ['vpn'],
  email: ['mail', 'outlook', 'inbox'],
  mail: ['email', 'outlook'],
  inbox: ['outlook', 'email'],
  outlook: ['mail', 'calendar'],
  calendar: ['invite', 'outlook'],
  login: ['sign in', 'signin', 'sso', 'passkey'],
  logon: ['sign in', 'signin', 'sso'],
  signin: ['sign in', 'sso'],
  password: ['passkey', 'sign in', 'signin'],
  '2fa': ['mfa', 'authenticator'],
  mfa: ['2fa', 'authenticator'],
  otp: ['mfa', 'authenticator'],
  laptop: ['macbook', 'computer'],
  computer: ['laptop'],
  mac: ['macos', 'laptop'],
  slow: ['performance', 'freezing', 'hot'],
  lag: ['slow', 'performance'],
  hot: ['overheating', 'fans'],
  monitor: ['display', 'screen'],
  screen: ['display', 'monitor'],
  storage: ['disk', 'space'],
  full: ['disk', 'storage', 'space'],
  print: ['printer'],
  printing: ['printer'],
  scam: ['phishing', 'suspicious'],
  spam: ['phishing'],
  hacked: ['phishing', 'suspicious', 'clicked'],
  stolen: ['lost', 'theft'],
  missing: ['lost'],
  mic: ['microphone', 'audio'],
  sound: ['audio', 'headset'],
  headphones: ['headset', 'audio'],
  webcam: ['camera'],
  video: ['camera', 'meet', 'zoom'],
  app: ['software', 'install'],
  apps: ['software', 'install'],
  licence: ['license', 'software'],
  license: ['licence', 'software'],
  permission: ['access'],
  trip: ['travel'],
  abroad: ['travel'],
};

/** Lowercase, strip accents/apostrophes and glue hyphenated words (“Wi-Fi” → “wifi”). */
export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1');

const tokenize = (s: string) =>
  normText(s)
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);

/** Meaningful words of a query (stop words dropped unless that leaves nothing). */
export function queryTerms(q: string): string[] {
  const all = tokenize(q);
  const kept = all.filter((t) => !STOP.has(t));
  return [...new Set(kept.length ? kept : all)];
}

/** Query words plus their synonyms — what we light up in results. */
export function highlightTerms(q: string): string[] {
  return [...new Set(queryTerms(q).flatMap((t) => [t, ...(SYNONYMS[t] ?? []).map(normText)]))].filter((t) => t.length >= 2);
}

interface Field {
  w: number;
  tokens: string[];
  phrase: string;
  step?: number;
}
export interface IndexedGuide {
  guide: Guide;
  fields: Field[];
}

export function indexGuides(guides: Guide[]): IndexedGuide[] {
  return guides.map((g) => {
    const f = (w: number, text: string, step?: number): Field => ({ w, tokens: tokenize(text), phrase: normText(text), step });
    const book = g.playbookId ? PLAYBOOKS[g.playbookId] : undefined;
    return {
      guide: g,
      fields: [
        f(10, g.title),
        f(8, g.keywords.join(' · ')),
        f(5, g.summary),
        f(3, `${CATEGORY_LABEL[g.category]} ${GUIDE_CATEGORY_LABEL[g.category]}`),
        ...(book ? [f(3, `${book.title} ${book.blurb}`)] : []),
        ...g.steps.flatMap((s, i) => [f(3, s.title, i), f(1.5, `${s.body} ${s.code ?? ''}`, i)]),
      ],
    };
  });
}

/** Bounded Levenshtein: is `a` within `max` edits of `b`? */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** 1 exact · .85 prefix · .55 inside a word · .5 typo-tolerant. */
function quality(term: string, tokens: string[]): number {
  let q = 0;
  for (const t of tokens) {
    if (t === term) return 1;
    if (t.startsWith(term)) q = Math.max(q, term.length >= 3 ? 0.85 : 0.7);
    else if (term.length >= 3 && t.includes(term)) q = Math.max(q, 0.55);
    else if (q < 0.5 && term.length >= 4 && t.length >= 3 && within(term, t, term.length >= 7 ? 2 : 1)) q = 0.5;
  }
  return q;
}

function scoreTerm(term: string, ix: IndexedGuide): { s: number; field?: Field } {
  const variants: [string, number][] = [[term, 1], ...(SYNONYMS[term] ?? []).map((v): [string, number] => [normText(v), 0.6])];
  let best = 0;
  let field: Field | undefined;
  for (const [v, k] of variants) {
    const phrase = v.includes(' ');
    for (const f of ix.fields) {
      const s = (phrase ? (f.phrase.includes(v) ? 0.9 : 0) : quality(v, f.tokens)) * f.w * k;
      if (s > best) {
        best = s;
        field = f;
      }
    }
  }
  return { s: best, field };
}

export interface GuideHit {
  guide: Guide;
  score: number;
  /** The step that explains the match when the title/summary don't. */
  step?: { n: number; title: string; text: string };
}

/** Ranked, typo-tolerant search over title, tags, summary, category and every step. */
export function searchGuides(index: IndexedGuide[], q: string): GuideHit[] {
  const terms = queryTerms(q);
  if (!terms.length) return index.map((ix) => ({ guide: ix.guide, score: 0 }));
  const whole = normText(q.trim());
  const hits: GuideHit[] = [];
  for (const ix of index) {
    let total = 0;
    let matched = 0;
    let inHead = 0;
    let stepField: { f: Field; s: number } | undefined;
    for (const t of terms) {
      const { s, field } = scoreTerm(t, ix);
      if (s <= 0 || !field) continue;
      matched += 1;
      total += s;
      if (field.step === undefined) inHead += 1;
      else if (!stepField || s > stepField.s) stepField = { f: field, s };
    }
    if (!matched) continue;
    let score = total * (matched / terms.length) ** 2;
    if (whole.length > 3 && normText(ix.guide.title).includes(whole)) score += 12;
    if (score < 0.7) continue;
    const st = stepField && inHead < terms.length ? ix.guide.steps[stepField.f.step!] : undefined;
    hits.push({ guide: ix.guide, score, step: st ? { n: stepField!.f.step! + 1, title: st.title, text: st.body } : undefined });
  }
  return hits.sort((a, b) => b.score - a.score || b.guide.helpful - a.guide.helpful);
}

/* ---------------------------------------------------------------- highlight */

function termRegex(terms: string[]): RegExp | null {
  const list = [...new Set(terms.filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Tolerate hyphens/apostrophes between letters so “wifi” lights up “Wi-Fi”.
  return new RegExp(`(${list.map((t) => [...t].map(esc).join("[-’']?")).join('|')})`, 'gi');
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const re = useMemo(() => termRegex(terms), [terms]);
  if (!re) return <>{text}</>;
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="hd-guides-mark">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/* ---------------------------------------------------------------- context */

const hasAny = (hay: string, words: string[]) => words.some((w) => hay.includes(normText(w)));

/** Services a guide depends on (office Wi-Fi resolves to the viewer's office). */
export function guideServices(g: Guide, services: Service[], office: Office): string[] {
  const kw = normText(g.keywords.join(' '));
  const ids = new Set<string>();
  if (g.category === 'network' && hasAny(kw, ['vpn', 'tunnel', 'helix connect'])) ids.add('vpn');
  if (g.category === 'network' && hasAny(kw, ['wifi', 'wireless', '802.1x'])) for (const s of services) if (s.id.startsWith('wifi-') && s.office === office) ids.add(s.id);
  if (g.category === 'email') ids.add('mail');
  if (g.category === 'access' && hasAny(kw, ['sso', 'passkey', 'mfa', 'sign in', '2fa', 'authenticator'])) ids.add('sso');
  if (hasAny(kw, ['printer', 'printing'])) ids.add('print');
  if (hasAny(kw, ['github'])) ids.add('github');
  return [...ids].filter((id) => services.some((s) => s.id === id));
}

const SEV_RANK = { critical: 3, major: 2, minor: 1 } as const;

/** The worst live incident on a guide's services that reaches the viewer's office. */
export function liveIssueFor(g: Guide, services: Service[], incidents: Incident[], office: Office): Incident | undefined {
  const ids = guideServices(g, services, office);
  if (!ids.length) return undefined;
  return activeIncidents(incidents)
    .filter((i) => i.serviceIds.some((s) => ids.includes(s)) && (!i.offices || i.offices.includes(office)))
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])[0];
}

/** Same category, shared tags or the same quick fix — topped up with crowd favourites. */
export function relatedGuides(g: Guide, all: Guide[], n = 3): Guide[] {
  const kw = new Set(g.keywords.map(normText));
  const scored = all
    .filter((x) => x.slug !== g.slug)
    .map((x) => ({ x, s: (x.category === g.category ? 3 : 0) + x.keywords.filter((k) => kw.has(normText(k))).length * 2 + (x.playbookId && x.playbookId === g.playbookId ? 4 : 0) }))
    .sort((a, b) => b.s - a.s || b.x.helpful - a.x.helpful);
  return scored.slice(0, n).map((r) => r.x);
}

/* ---------------------------------------------------------------- card */

export function GuideCard({
  g,
  score,
  terms,
  hit,
  issue,
  onFix,
  i = 0,
}: {
  g: Guide;
  score: GuideScore;
  terms: string[];
  hit?: GuideHit['step'];
  issue?: Incident;
  onFix?: (id: PlaybookId) => void;
  i?: number;
}) {
  const book = g.playbookId ? PLAYBOOKS[g.playbookId] : undefined;
  return (
    <article className="hd-guides-card neo-spot" style={{ ['--i' as string]: i }} data-tone={CATEGORY_TONE[g.category]} data-qa={`guide-${g.slug}`}>
      <Link to={`/helpdesk/guides/${g.slug}`} className="hd-guides-card__link" aria-label={`${g.title} · ${g.minutes} minute read`} />
      <div className="hd-guides-card__top">
        <CategoryGlyph category={g.category} size={38} />
        <span className="neo-hud">{GUIDE_CATEGORY_LABEL[g.category]}</span>
        {issue && (
          <span className="hd-guides-card__issue" title={`Known issue: ${issue.title}`}>
            <Siren /> Known issue
          </span>
        )}
      </div>
      <h3 className="hd-guides-card__title">
        <Highlight text={g.title} terms={terms} />
      </h3>
      <p className="hd-guides-card__sum">
        <Highlight text={g.summary} terms={terms} />
      </p>
      {hit && (
        <p className="hd-guides-card__match">
          <b>Step {hit.n}</b> <Highlight text={`${hit.title} — ${hit.text}`} terms={terms} />
        </p>
      )}
      <div className="hd-guides-card__meta">
        <span>
          <Clock3 /> {g.minutes} min
        </span>
        <span>
          <ListChecks /> {g.steps.length} steps
        </span>
        <span className="hd-guides-card__score" data-high={score.pct >= 93 || undefined} title={`${score.up.toLocaleString()} of ${score.total.toLocaleString()} found this helpful`}>
          <ThumbsUp /> {score.pct}%
        </span>
        {book && onFix && (
          <button type="button" className="hd-guides-card__fix" onClick={() => onFix(book.id)} data-tip={book.blurb} data-qa={`guide-fix-${g.slug}`}>
            <Wand2 /> {book.verb}
          </button>
        )}
      </div>
    </article>
  );
}
