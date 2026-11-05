/**
 * Academy metadata, track colours, skill domains and credential helpers.
 */
import type { AcademyTrack, CourseFormat, CourseLevel } from './types';

export const ACADEMY_DATA_VERSION = 1;

export const TRACK_META: Record<AcademyTrack, { label: string; short: string; hue: number; description: string }> = {
  onboarding: {
    label: 'Onboarding & Culture',
    short: 'Onboarding',
    hue: 292,
    description: 'Day-1 to Day-90 essentials for thriving at Helix.',
  },
  security: {
    label: 'Security & Trust',
    short: 'Security',
    hue: 346,
    description: 'Zero-trust identity, passkeys, incident readiness & data protection.',
  },
  ai: {
    label: 'AI & Data Craft',
    short: 'AI & Data',
    hue: 192,
    description: 'Safe, high-leverage workflows with Gemini, agents & governed data.',
  },
  engineering: {
    label: 'Engineering Excellence',
    short: 'Engineering',
    hue: 148,
    description: 'Production readiness, architecture, observability & resilient systems.',
  },
  product: {
    label: 'Product & Design',
    short: 'Product',
    hue: 36,
    description: 'Accessible interfaces, customer discovery & rapid experimentation.',
  },
  leadership: {
    label: 'Leadership & Hiring',
    short: 'Leadership',
    hue: 252,
    description: 'High-trust management, structured interviewing & coaching.',
  },
};

export const TRACK_ORDER: AcademyTrack[] = ['onboarding', 'security', 'ai', 'engineering', 'product', 'leadership'];

export const LEVEL_META: Record<CourseLevel, { label: string; badgeTone: 'info' | 'warning' | 'success' }> = {
  foundations: { label: 'Foundations', badgeTone: 'info' },
  practitioner: { label: 'Practitioner', badgeTone: 'success' },
  advanced: { label: 'Advanced', badgeTone: 'warning' },
};

export const FORMAT_LABEL: Record<CourseFormat, string> = {
  interactive: 'Interactive Studio',
  scenario: 'Scenario Lab',
  certification: 'Certification',
  workshop: 'Applied Workshop',
};

/** Skill radar axes shown on the learner profile. */
export const SKILL_RADAR_DOMAINS: { id: AcademyTrack; label: string; hue: number }[] = [
  { id: 'ai', label: 'AI & Data', hue: 192 },
  { id: 'security', label: 'Security & Trust', hue: 346 },
  { id: 'engineering', label: 'Engineering', hue: 148 },
  { id: 'product', label: 'Product Craft', hue: 36 },
  { id: 'leadership', label: 'Leadership', hue: 252 },
  { id: 'onboarding', label: 'Helix Culture', hue: 292 },
];

/** Mastery level derived from total XP earned. */
export function learnerRank(xp: number): { level: number; title: string; nextXp: number; progressPct: number } {
  const tiers = [
    { min: 0, title: 'Explorer' },
    { min: 250, title: 'Practitioner' },
    { min: 600, title: 'Specialist' },
    { min: 1050, title: 'Vanguard' },
    { min: 1600, title: 'Fellow' },
  ];
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) if (xp >= tiers[i].min) idx = i;
  const current = tiers[idx];
  const next = tiers[idx + 1];
  if (!next) return { level: idx + 1, title: current.title, nextXp: current.min, progressPct: 100 };
  const span = next.min - current.min;
  return {
    level: idx + 1,
    title: current.title,
    nextXp: next.min,
    progressPct: Math.min(100, Math.round(((xp - current.min) / span) * 100)),
  };
}

/** Deterministic credential code + verification hash for digital certificates. */
export function buildCredentialCode(userId: string, courseId: string, issuedAt: number): { code: string; hash: string } {
  const raw = `${userId}:${courseId}:${issuedAt}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unsigned = h >>> 0;
  const year = new Date(issuedAt).getFullYear();
  const block = unsigned.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  const check = ((unsigned * 31) >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
  return {
    code: `HX-CERT-${year}-${block}`,
    hash: `${check.slice(0, 4)}-${check.slice(4, 8)}`,
  };
}
