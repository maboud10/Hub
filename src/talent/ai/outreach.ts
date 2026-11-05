/**
 * Offline outreach writer: personalised LinkedIn connection notes, InMails and
 * emails (plus follow-ups) in four tones. Respects LinkedIn character limits
 * and reports which personalisation hooks it used so recruiters can verify them.
 */
import { BRAND } from '@/config/brand';
import type { JobProfile, MatchResult, OutreachChannel, OutreachTone, Requisition, WorkModel } from '../types';
import { CHANNEL_META, WORK_MODEL_LABEL } from '../constants';

export interface OutreachPerson {
  name: string;
  currentTitle: string;
  currentCompany: string;
  location: string;
  skills: string[];
  recentActivity?: string;
  yearsExperience?: number;
}

export interface OutreachRole {
  title: string;
  location: string;
  workModel: WorkModel | null;
  department?: string | null;
  highlights: string[];
  skills: string[];
  keywords?: string[];
}

export interface OutreachInput {
  role: OutreachRole;
  person: OutreachPerson;
  match?: MatchResult | null;
  channel: OutreachChannel;
  tone: OutreachTone;
  step: 1 | 2 | 3;
  sender: { name: string; title: string };
  company?: string;
  /** Previous subject line (follow-ups reply in-thread). */
  previousSubject?: string;
}

export interface OutreachDraft {
  subject?: string;
  body: string;
  /** Personalisation hooks woven into the message. */
  hooks: string[];
  limit: number;
  engine: 'gemini' | 'offline';
}

const PITCH: Record<string, string> = {
  Engineering: 'we’re re-platforming the systems 3,000+ colleagues rely on every day',
  Design: 'we’re redesigning how 3,000+ people experience work, end to end',
  Product: 'we’re scaling a product thousands of people open every morning',
  Sales: 'we’re expanding across the GCC with a product customers keep renewing',
  'IT & Security': 'security is a board-level priority here, and this role owns it at scale',
  'People Ops': 'we’re building a people function our employees genuinely rave about',
  Marketing: 'we’re telling a story the region hasn’t heard yet',
  Finance: 'we’re scaling finance for a fast-growing, multi-country business',
  'Customer Success': 'our customers’ success is literally how we grow',
  Operations: 'we’re scaling operations across four countries',
};

const TECH_LINE: Record<string, string> = {
  Engineering: 'modern stack, real scale and a strong review culture',
  'IT & Security': 'cloud-native estate, zero-trust roadmap and real ownership',
  Design: 'a mature design system and a team that ships',
  Product: 'clear strategy, rich data and fast iteration loops',
};

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** Lower-case the first letter, leaving acronyms ("UI Engineer", "AWS") untouched. */
const lcFirst = (s: string) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function roleFromProfile(profile: JobProfile | null, req?: Pick<Requisition, 'title' | 'location' | 'workModel' | 'department'> | null): OutreachRole {
  return {
    title: req?.title ?? profile?.title ?? 'open role',
    location: req?.location ?? profile?.location ?? 'Dubai',
    workModel: req?.workModel ?? profile?.workModel ?? null,
    department: req?.department ?? profile?.department ?? null,
    highlights: profile?.responsibilities ?? [],
    skills: (profile?.skills ?? []).filter((s) => s.must).map((s) => s.skill),
    keywords: profile?.keywords ?? [],
  };
}

function where(role: OutreachRole) {
  return `${role.location}${role.workModel && role.workModel !== 'remote' ? ` · ${WORK_MODEL_LABEL[role.workModel]}` : role.workModel === 'remote' ? ' · Remote' : ''}`;
}

function sharedSkills(input: OutreachInput): string[] {
  const fromMatch = input.match?.matched ?? [];
  if (fromMatch.length) return fromMatch.slice(0, 3);
  const mine = new Set(input.person.skills.map((s) => s.toLowerCase()));
  return input.role.skills.filter((s) => mine.has(s.toLowerCase())).slice(0, 3);
}

/**
 * Turn a LinkedIn activity line into a noun phrase that reads naturally in
 * "… caught my eye" / "I came across …" / "After seeing …":
 *  - "Posted about X · 3d ago"            → "your recent post on X"
 *  - "Spoke about X at a Dubai meetup"     → "your recent talk on X at a Dubai meetup"
 *  - "Shared a talk on X" / "Posted an incident template" → "your recent talk on X" / "your recent incident template"
 *  - "Shared lessons from a migration"     → "your lessons from a migration"
 */
function activityHook(activity?: string): string | null {
  if (!activity) return null;
  const a = activity
    .replace(/\s*·?\s*\d+\s*(d|w|h|mo|days?|weeks?|hours?|months?) ago$/i, '')
    .trim()
    .replace(/[.!]+$/, '');
  if (!a) return null;
  let m = a.match(/^(posted|wrote|published|blogged|commented|spoke|talked|presented) (?:about|on) (.+)$/i);
  if (m) {
    const verb = m[1].toLowerCase();
    const noun = /^(spoke|talked|presented)$/.test(verb) ? 'talk' : /^(wrote|published)$/.test(verb) ? 'article' : verb === 'commented' ? 'comments' : 'post';
    return `your recent ${noun} on ${m[2]}`;
  }
  m = a.match(/^(?:shared|posted|wrote|published|gave|presented|hosted|ran|launched|released|built|open-sourced|recorded) (?:a|an|the|this|some) (.+)$/i);
  if (m) return `your recent ${m[1]}`;
  m = a.match(/^(?:shared|posted|wrote|published) (.+)$/i);
  if (m) return `your ${m[1]}`;
  // "Started a new role at X" → "the news that you started a new role at X"
  const [verb, ...rest] = a.split(' ');
  if (/^[a-z]+ed$/i.test(verb) || /^(was|won|began|became|got|took|made|led|hit|gave|ran)$/i.test(verb)) {
    return `the news that you ${verb.toLowerCase() === 'was' ? 'were' : verb.toLowerCase()} ${rest.join(' ')}`.trim();
  }
  return /^(your|my|the|a|an|this|that)\b/i.test(a) ? lcFirst(a) : `your ${lcFirst(a)}`;
}

function sameCity(role: OutreachRole, person: OutreachPerson) {
  const city = role.location.split(/[ (·,]/)[0].toLowerCase();
  return city && person.location.toLowerCase().includes(city) ? role.location.split(/[(·,]/)[0].trim() : null;
}

/** Draft a personalised message. Deterministic for the same input. */
export function draftOutreach(input: OutreachInput): OutreachDraft {
  const { role, person, channel, tone, step, sender } = input;
  const company = input.company ?? BRAND.company;
  const meta = CHANNEL_META[channel];
  const fn = first(person.name);
  const sn = first(sender.name);
  const skills = sharedSkills(input);
  const activity = activityHook(person.recentActivity);
  const city = sameCity(role, person);
  const pitch = PITCH[role.department ?? ''] ?? 'we’re growing a team that ships work people are proud of';
  const tech = TECH_LINE[role.department ?? ''] ?? 'meaningful problems and a team that ships';
  const hooks: string[] = [];
  if (skills.length) hooks.push(`Shared skills: ${skills.join(', ')}`);
  if (person.currentCompany) hooks.push(`Current role: ${person.currentTitle} at ${person.currentCompany}`);
  if (activity) hooks.push(`Recent activity: ${activity}`);
  if (city) hooks.push(`Same city: ${city}`);

  const skillPhrase = skills.length >= 2 ? `${skills[0]} and ${skills[1]}` : skills[0] ?? lcFirst(person.currentTitle);
  const atCompany = person.currentCompany ? ` at ${person.currentCompany}` : '';

  // ───────────── LinkedIn connection note (≤ 300 chars) ─────────────
  if (channel === 'linkedin-connect') {
    const candidates: string[] = [];
    if (step === 1) {
      const hook = activity ? `${activity} caught my eye` : `your ${skillPhrase} work${atCompany} caught my eye`;
      switch (tone) {
        case 'warm':
          candidates.push(`Hi ${fn}, ${hook}. I’m hiring a ${role.title} at ${company} (${where(role)}) and I think you’d love the team. Open to connecting? ${sn}`);
          break;
        case 'concise':
          candidates.push(`Hi ${fn}, ${role.title} at ${company} (${where(role)}). Your ${skillPhrase} background stands out. Open to a quick chat? ${sn}`);
          break;
        case 'visionary':
          candidates.push(`Hi ${fn}, at ${company} ${pitch}. Your ${skillPhrase} experience makes you a standout for our ${role.title} role. Open to connecting? ${sn}`);
          break;
        case 'technical':
          candidates.push(`Hi ${fn}, ${role.title} at ${company}: ${tech}. Your ${skillPhrase} work${atCompany} maps closely. Worth a chat? ${sn}`);
          break;
      }
      candidates.push(`Hi ${fn}, your ${skillPhrase} background stands out. I’m hiring a ${role.title} at ${company} (${where(role)}). Open to connecting? ${sn}`);
      candidates.push(`Hi ${fn}, hiring a ${role.title} at ${company} and your profile stood out. Open to connecting? ${sn}`);
    } else if (step === 2) {
      candidates.push(`Thanks for connecting, ${fn}! Quick one: would you be open to a 15-min chat about the ${role.title} role at ${company}? Happy to share the brief and range first. ${sn}`);
    } else {
      candidates.push(`Last nudge from me, ${fn}. If now isn’t the right time, no worries at all. I’d love to keep in touch for future ${company} roles. ${sn}`);
    }
    const body = candidates.find((c) => c.length <= meta.limit) ?? clip(candidates[candidates.length - 1], meta.limit);
    return { body, hooks, limit: meta.limit, engine: 'offline' };
  }

  // ───────────── InMail / email ─────────────
  const highlights = role.highlights.slice(0, 3).map((h) => clip(h.replace(/\.$/, ''), 110));
  const prevSubject = input.previousSubject;

  if (step > 1) {
    const subject = prevSubject ? (prevSubject.startsWith('Re:') ? prevSubject : `Re: ${prevSubject}`) : `Re: ${role.title} at ${company}`;
    const body =
      step === 2
        ? [
            `Hi ${fn},`,
            '',
            `Just bubbling this up in case it got buried. We’re still looking for a ${role.title} (${where(role)}), and your ${skillPhrase} experience is exactly what the team needs.`,
            '',
            `Happy to send the full brief and compensation range up front. Would a 15-minute call later this week work?`,
            '',
            `Best,`,
            sender.name,
          ].join('\n')
        : [
            `Hi ${fn},`,
            '',
            `Last note from me. I don’t want to crowd your inbox. If the timing isn’t right, no problem at all; I’d love to stay in touch for future roles at ${company}.`,
            '',
            `If you know someone who’d be great for the ${role.title} role, I’d be grateful for an intro.`,
            '',
            `All the best,`,
            sender.name,
          ].join('\n');
    return { subject: clip(subject, meta.subjectLimit ?? 200), body: clip(body, meta.limit), hooks, limit: meta.limit, engine: 'offline' };
  }

  const subjects: Record<OutreachTone, string> = {
    warm: `${fn}, a ${role.title} role I think you’d love`,
    concise: `${role.title} at ${company} · ${where(role)}`,
    visionary: `Help shape what ${company} builds next, ${fn}`,
    technical: `${skills[0] ?? role.title}${skills[1] ? ` + ${skills[1]}` : ''} at real scale: ${role.title}, ${company}`,
  };

  const openings: Record<OutreachTone, string> = {
    warm: `${activity ? `I came across ${activity} and it really stuck with me. ` : ''}Your work as ${person.currentTitle}${atCompany} is the kind of craft our team values${city ? `, and it’s great to find someone right here in ${city}` : ''}.`,
    concise: `I’m hiring a ${role.title} at ${company} (${where(role)}). Your ${skillPhrase} background${atCompany} stands out.`,
    visionary: `At ${company}, ${pitch}. ${activity ? `After seeing ${activity}, ` : ''}I think you could help shape what comes next.`,
    technical: `I’ll keep it specific: our ${role.title} role is about ${tech}. Your ${skillPhrase} experience${atCompany} maps closely to what we need.`,
  };

  const rolePara =
    tone === 'concise'
      ? highlights[0]
        ? `You’d ${lcFirst(highlights[0])}.`
        : ''
      : `As our ${role.title} (${where(role)}), you’d:\n${(highlights.length ? highlights : [`own meaningful ${role.department ?? 'product'} work end to end`]).map((h) => `• ${h.replace(/^./, (c) => c.toUpperCase())}`).join('\n')}`;

  const whyYou =
    tone === 'concise'
      ? ''
      : skills.length
        ? `What stood out: ${skills.join(', ')}${input.match ? ` (a ${input.match.score}% match with what the team asked for)` : ''}.`
        : `Your path from ${person.currentTitle}${atCompany} is a strong fit for the scope.`;

  const cta: Record<OutreachTone, string> = {
    warm: 'Would you be open to a relaxed 20-minute chat this week? No prep needed. I’d love to hear what you’re looking for next.',
    concise: 'Open to a 15-minute call this week?',
    visionary: 'If that sounds like your kind of challenge, could we grab 20 minutes this week?',
    technical: 'Happy to go deep on architecture and team set-up. Does a 30-minute call with the hiring manager work?',
  };

  const body = [`Hi ${fn},`, '', openings[tone], rolePara && '', rolePara, whyYou && '', whyYou, '', cta[tone], '', 'Best,', sender.name, `${sender.title}, ${company}`]
    .filter((l) => l !== undefined && l !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return {
    subject: clip(subjects[tone], meta.subjectLimit ?? 200),
    body: clip(body, meta.limit),
    hooks,
    limit: meta.limit,
    engine: 'offline',
  };
}
