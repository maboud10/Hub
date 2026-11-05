/**
 * Knowledge Base constants, freshness computation, and starter templates.
 */
import type { ArticleSection, WikiArticle } from './types';

export const WIKI_DATA_VERSION = 1;
const DAY = 86_400_000;

export type FreshnessState = 'verified' | 'due-soon' | 'stale';

export interface FreshnessInfo {
  state: FreshnessState;
  label: string;
  daysSinceVerified: number;
  daysRemaining: number;
  flagged: boolean;
}

export function computeFreshness(article: Pick<WikiArticle, 'lastVerifiedAt' | 'reviewCadenceDays' | 'flaggedStale'>, now = Date.now()): FreshnessInfo {
  const daysSinceVerified = Math.max(0, Math.floor((now - article.lastVerifiedAt) / DAY));
  const daysRemaining = article.reviewCadenceDays - daysSinceVerified;
  if (article.flaggedStale) {
    return {
      state: 'stale',
      label: 'Flagged for update',
      daysSinceVerified,
      daysRemaining,
      flagged: true,
    };
  }
  if (daysRemaining < 0) {
    return {
      state: 'stale',
      label: `Stale · ${Math.abs(daysRemaining)}d overdue`,
      daysSinceVerified,
      daysRemaining,
      flagged: false,
    };
  }
  if (daysRemaining <= 14) {
    return {
      state: 'due-soon',
      label: `Review due in ${daysRemaining}d`,
      daysSinceVerified,
      daysRemaining,
      flagged: false,
    };
  }
  return {
    state: 'verified',
    label: daysSinceVerified === 0 ? 'Verified today' : `Verified ${daysSinceVerified}d ago`,
    daysSinceVerified,
    daysRemaining,
    flagged: false,
  };
}

export interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
  tldr: string;
  tags: string[];
  sections: ArticleSection[];
}

export const ARTICLE_TEMPLATES: ArticleTemplate[] = [
  {
    id: 'tpl-howto',
    name: 'How-To Playbook',
    description: 'Step-by-step operational guide with a verification checklist.',
    tldr: 'When to use this workflow, prerequisites you need in NEXUS, and the exact step-by-step sequence.',
    tags: ['how-to', 'playbook'],
    sections: [
      {
        id: 's-when',
        heading: 'When to Use This Guide',
        body: 'State the trigger, audience, and expected outcome in two crisp sentences so readers immediately know they are in the right place.',
      },
      {
        id: 's-steps',
        heading: 'Step-by-Step Execution',
        body: 'Walk through the exact actions in order. Tick off each step below as you run it:',
        checklist: [
          { id: 'chk-1', label: 'Confirm prerequisites and required NEXUS access grant' },
          { id: 'chk-2', label: 'Execute primary change and capture verification output' },
          { id: 'chk-3', label: 'Post completion summary in the team channel' },
        ],
      },
    ],
  },
  {
    id: 'tpl-rfc',
    name: 'Architecture RFC',
    description: '1-page technical decision record for async cross-timezone review.',
    tldr: 'Context, proposed architecture, rejected alternatives, rollout plan, and SLO/security impact.',
    tags: ['rfc', 'architecture', 'decision'],
    sections: [
      {
        id: 's-ctx',
        heading: 'Problem & Constraints',
        body: 'Describe the user or system bottleneck, current scale metrics, and non-goals.',
      },
      {
        id: 's-prop',
        heading: 'Proposed Design & Trade-Offs',
        body: 'Outline the recommended design, data model changes, and why alternatives were set aside.',
        callout: {
          tone: 'info',
          title: 'Security & RBAC Check',
          text: 'Document how permissions, tenant boundaries, and failure fallbacks behave.',
        },
      },
      {
        id: 's-rollout',
        heading: 'Progressive Rollout & Kill-Switch',
        body: 'Define feature flag name, canary stages (1% → 10% → 100%), and rollback trigger.',
      },
    ],
  },
  {
    id: 'tpl-runbook',
    name: 'Incident Runbook',
    description: 'High-clarity triage, mitigation commands, and escalation steps for on-call.',
    tldr: 'First-5-minute triage, immediate mitigation levers, diagnostic commands, and stakeholder comms.',
    tags: ['runbook', 'incident', 'on-call'],
    sections: [
      {
        id: 's-mitigate',
        heading: 'Immediate Mitigation (First 5 Minutes)',
        body: 'Mitigate customer impact first before deep-diving root causes.',
        callout: {
          tone: 'warning',
          title: 'Golden Rule',
          text: 'If a recent canary or feature flag correlates with the alert, roll back immediately.',
        },
        checklist: [
          { id: 'rb-1', label: 'Acknowledge page and open Incident Command bridge' },
          { id: 'rb-2', label: 'Check recent deploys & feature-flag flips in last 30m' },
          { id: 'rb-3', label: 'Flip kill-switch or roll back canary and confirm golden signals recover' },
        ],
      },
    ],
  },
];

export const SUGGESTED_CORTEX_PROMPTS: string[] = [
  'How do I set up passkeys and zero-trust access on Day 1?',
  'What is our Work From Anywhere (WFA) and annual leave policy?',
  'How do we run a Sev-1 incident and canary rollback?',
  'What should a new hire and buddy focus on in Week 1?',
  'What are the rules for using Gemini & AI safely with internal data?',
  'How do structured interviews and four-eyes offer approvals work?',
];
