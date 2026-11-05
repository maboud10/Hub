/**
 * LinkedIn connector abstraction.
 *
 *  assisted (default) — ranks the labelled sample prospect feed with the
 *                       matcher and hands recruiters one-click LinkedIn / X-ray
 *                       searches + drafted messages to send themselves.
 *  rsc                — placeholder for LinkedIn Talent Solutions / Recruiter
 *                       System Connect (partner credentials + server proxy).
 */
import type { JobProfile, MatchResult, Prospect, WorkModel } from '../types';
import { rankByMatch } from '../ai/match';
import { SAMPLE_PROSPECTS } from './prospects';

export interface ProspectSearchOptions {
  limit?: number;
  location?: string | null;
  workModel?: WorkModel | null;
  openToWorkOnly?: boolean;
  minScore?: number;
  /** Names already in the talent pool (de-duplication). */
  excludeNames?: string[];
}

export interface ProspectHit {
  prospect: Prospect;
  match: MatchResult;
}

export interface LinkedInConnector {
  id: 'assisted' | 'rsc';
  label: string;
  description: string;
  /** Whether messages can be sent through the API (false = copy & send on LinkedIn). */
  canSendMessages: boolean;
  search(profile: JobProfile, opts?: ProspectSearchOptions): Promise<ProspectHit[]>;
}

const assisted: LinkedInConnector = {
  id: 'assisted',
  label: 'Assisted mode',
  description:
    'Sample prospect feed plus one-click LinkedIn, Recruiter and X-ray searches. Messages are drafted for you to send on LinkedIn, which keeps you within LinkedIn’s terms.',
  canSendMessages: false,
  async search(profile, opts = {}) {
    const exclude = new Set((opts.excludeNames ?? []).map((n) => n.toLowerCase()));
    const pool = SAMPLE_PROSPECTS.filter((p) => !exclude.has(p.name.toLowerCase()) && (!opts.openToWorkOnly || p.openToWork));
    const ranked = rankByMatch(profile, pool, { location: opts.location ?? undefined, workModel: opts.workModel ?? undefined });
    return ranked
      .filter((r) => r.match.score >= (opts.minScore ?? 35))
      .slice(0, opts.limit ?? 24)
      .map((r) => ({ prospect: r.item, match: r.match }));
  },
};

const rsc: LinkedInConnector = {
  id: 'rsc',
  label: 'Recruiter System Connect',
  description: 'Official LinkedIn Talent Solutions integration (requires partner approval and a server-side proxy).',
  canSendMessages: true,
  async search() {
    throw new Error('LinkedIn RSC needs partner credentials and a server-side proxy. See firestore/README.md → “LinkedIn”.');
  },
};

export function getLinkedInConnector(): LinkedInConnector {
  return (import.meta.env as Record<string, string | undefined>).VITE_LINKEDIN_MODE === 'rsc' ? rsc : assisted;
}
