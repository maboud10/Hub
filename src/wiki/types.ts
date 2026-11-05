/**
 * Helix Knowledge Base ("Cortex") domain model:
 * permission-scoped spaces, rich multi-section playbooks & interactive runbooks,
 * freshness verification, version history, change proposals, and reading packs.
 */

export type SpaceId = 'handbook' | 'onboarding' | 'engineering' | 'product' | 'people' | 'security';

export interface WikiSpace {
  id: SpaceId;
  name: string;
  tagline: string;
  description: string;
  hue: number;
  icon: string;
  /** Empty = readable by everyone with `app:wiki` (including contractors). */
  audienceRoleIds: string[];
  stewardId: string;
}

export interface ArticleSection {
  id: string;
  heading: string;
  body: string;
  callout?: {
    tone: 'tip' | 'warning' | 'policy' | 'info';
    title: string;
    text: string;
  };
  code?: {
    label: string;
    snippet: string;
  };
  /** Interactive runbook checklist items learners/operators can tick locally. */
  checklist?: { id: string; label: string }[];
}

export interface ArticleVersion {
  version: number;
  at: number;
  authorId: string;
  summary: string;
  title: string;
  tldr: string;
  sections: ArticleSection[];
}

export interface WikiArticle {
  id: string;
  slug: string;
  spaceId: SpaceId;
  title: string;
  subtitle: string;
  tldr: string;
  tags: string[];
  ownerId: string;
  /** Locked canonical docs require `wiki.manage` (or ownership) for direct edits; others submit a Change Proposal. */
  locked: boolean;
  pinned?: boolean;
  readMins: number;
  /** Days before freshness status warns "Due for review". */
  reviewCadenceDays: number;
  lastVerifiedAt: number;
  lastVerifiedBy: string;
  flaggedStale?: { by: string; at: number; reason: string };
  /** Linked Academy course IDs for hands-on practice. */
  relatedCourseIds: string[];
  /** Optional deep link into HR Portal or Talent Hub. */
  relatedRoute?: { label: string; to: string };
  sections: ArticleSection[];
  versions: ArticleVersion[];
  views: number;
  helpfulUserIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WikiCollection {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  hue: number;
  audienceLabel: string;
  articleSlugs: string[];
  onboardingPack?: boolean;
}

export type ProposalStatus = 'pending' | 'approved' | 'declined';

export interface ChangeProposal {
  id: string;
  articleId: string;
  authorId: string;
  createdAt: number;
  summary: string;
  proposedTitle: string;
  proposedTldr: string;
  proposedSections: ArticleSection[];
  status: ProposalStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNote?: string;
}

export interface WikiComment {
  id: string;
  articleId: string;
  authorId: string;
  at: number;
  text: string;
  kind: 'question' | 'note';
  resolved?: boolean;
}

export interface UserWikiState {
  bookmarks: string[];
  readSlugs: string[];
  recentSlugs: string[];
  /** articleId -> checked checklist item ids */
  runbookChecks: Record<string, string[]>;
}

export interface WikiData {
  version: number;
  spaces: WikiSpace[];
  collections: WikiCollection[];
  articles: WikiArticle[];
  proposals: ChangeProposal[];
  comments: WikiComment[];
  userState: Record<string, UserWikiState>;
}
