/**
 * Gemini via Firebase AI Logic (lazy-loaded). Used for JD decoding and
 * outreach drafting when Firebase is configured; the offline engine is the
 * automatic fallback. Matching/scoring stays deterministic and offline so
 * rankings are explainable and auditable.
 */
import type { Department } from '@/types';
import type { JobProfile } from '../types';
import { CHANNEL_META, TONE_META } from '../constants';
import { getFirebaseApp, isFirebaseConfigured } from '../backend/firebase';
import type { OutreachDraft, OutreachInput } from './outreach';

const env = import.meta.env as Record<string, string | undefined>;

export const GEMINI_MODEL = env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
export const isGeminiEnabled = () => env.VITE_TALENT_AI !== 'offline' && isFirebaseConfigured();

const DEPARTMENTS: Department[] = [
  'Engineering',
  'Design',
  'Product',
  'People Ops',
  'Finance',
  'Sales',
  'Marketing',
  'IT & Security',
  'Operations',
  'Customer Success',
];

const TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS))]);
}

async function loadAI() {
  const [mod, app] = await Promise.all([import('firebase/ai'), getFirebaseApp()]);
  const ai = mod.getAI(app, { backend: new mod.GoogleAIBackend() });
  return { mod, ai };
}

export type GeminiJD = Partial<Omit<JobProfile, 'quality' | 'engine' | 'analyzedAt'>>;

export async function geminiAnalyzeJD(text: string): Promise<GeminiJD> {
  const { mod, ai } = await loadAI();
  const { Schema } = mod;
  const schema = Schema.object({
    properties: {
      title: Schema.string({ description: 'Clean job title without location or company' }),
      seniority: Schema.enumString({ enum: ['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead', 'manager', 'director', 'executive'] }),
      yearsMin: Schema.integer({ description: 'Minimum years of experience required' }),
      department: Schema.enumString({ enum: DEPARTMENTS }),
      location: Schema.string({ description: 'City, or "Remote"' }),
      workModel: Schema.enumString({ enum: ['onsite', 'hybrid', 'remote'] }),
      employmentType: Schema.enumString({ enum: ['full-time', 'contract', 'part-time', 'internship'] }),
      summary: Schema.string({ description: 'Two-sentence summary of the role for candidates' }),
      skills: Schema.array({
        items: Schema.object({
          properties: {
            skill: Schema.string({ description: 'Short canonical skill name, e.g. "React", "Kubernetes", "Stakeholder Management"' }),
            weight: Schema.integer({ description: '3 = core, 2 = important, 1 = supporting' }),
            must: Schema.boolean({ description: 'true if required, false if nice-to-have' }),
          },
        }),
      }),
      responsibilities: Schema.array({ items: Schema.string() }),
      titleAliases: Schema.array({ items: Schema.string(), description: 'Up to 5 alternative titles recruiters search for' }),
      keywords: Schema.array({ items: Schema.string(), description: 'Domain / industry keywords' }),
    },
    optionalProperties: ['yearsMin', 'department', 'location', 'workModel'],
  });
  const model = mod.getGenerativeModel(ai, {
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
  });
  const prompt = [
    'You are a senior technical recruiter. Decode this job description into structured data.',
    'Rules: only use facts present in the text; mark a skill must=false when it is described as preferred, a plus, bonus or nice-to-have;',
    'keep skill names short and canonical; at most 16 skills; responsibilities are concise bullet phrases (max 8).',
    '',
    'JOB DESCRIPTION:',
    text.slice(0, 24_000),
  ].join('\n');
  const res = await withTimeout(model.generateContent(prompt), 'Gemini JD analysis');
  return JSON.parse(res.response.text()) as GeminiJD;
}

export async function geminiDraftOutreach(input: OutreachInput): Promise<OutreachDraft> {
  const { mod, ai } = await loadAI();
  const { Schema } = mod;
  const meta = CHANNEL_META[input.channel];
  const schema = Schema.object({
    properties: {
      subject: Schema.string(),
      body: Schema.string(),
      hooks: Schema.array({ items: Schema.string(), description: 'Which facts about the person you used to personalise' }),
    },
    optionalProperties: ['subject'],
  });
  const model = mod.getGenerativeModel(ai, {
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.7 },
  });
  const { role, person, match, sender } = input;
  const prompt = [
    `Write a ${meta.label} from a recruiter to a potential candidate.`,
    `Tone: ${input.tone}: ${TONE_META[input.tone].description}`,
    input.step > 1 ? `This is follow-up #${input.step - 1} after no reply${input.previousSubject ? ` (thread: "${input.previousSubject}")` : ''}. Keep it short and gracious.` : '',
    `Hard limit: body ≤ ${meta.limit} characters${meta.subjectLimit ? `, subject ≤ ${meta.subjectLimit} characters` : ' (no subject)'}.`,
    'Personalise with 1–2 specific facts from the candidate data. Never invent facts, numbers, mutual connections or compensation.',
    'No emojis, no hashtags, plain text with short paragraphs. End with a low-friction call to action and the sender name.',
    '',
    `COMPANY: ${input.company ?? 'Helix'}`,
    `ROLE: ${role.title} · ${role.location}${role.workModel ? ` · ${role.workModel}` : ''} · ${role.department ?? ''}`,
    `ROLE HIGHLIGHTS: ${role.highlights.slice(0, 4).join(' | ') || 'n/a'}`,
    `MUST-HAVE SKILLS: ${role.skills.slice(0, 8).join(', ') || 'n/a'}`,
    `CANDIDATE: ${person.name}, ${person.currentTitle}${person.currentCompany ? ` at ${person.currentCompany}` : ''}, ${person.location}`,
    `CANDIDATE SKILLS: ${person.skills.slice(0, 12).join(', ')}`,
    person.recentActivity ? `RECENT ACTIVITY: ${person.recentActivity}` : '',
    match ? `MATCH: ${match.score}% · ${match.reasons.slice(0, 3).join(' · ')}` : '',
    `SENDER: ${sender.name}, ${sender.title}`,
  ]
    .filter(Boolean)
    .join('\n');
  const res = await withTimeout(model.generateContent(prompt), 'Gemini outreach');
  const out = JSON.parse(res.response.text()) as { subject?: string; body: string; hooks?: string[] };
  return {
    subject: meta.subjectLimit ? out.subject?.slice(0, meta.subjectLimit) : undefined,
    body: out.body.slice(0, meta.limit),
    hooks: out.hooks ?? [],
    limit: meta.limit,
    engine: 'gemini',
  };
}
