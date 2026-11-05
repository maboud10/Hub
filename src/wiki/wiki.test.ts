import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';
import { ONBOARDING_TEMPLATE } from '@/talent/constants';
import { SEED_COURSES } from '@/academy/seed';
import * as access from './access';
import { computeFreshness } from './constants';
import { askCortex } from './cortex';
import { buildWikiSeed } from './seed';
import { useWiki } from './store';

const as = (userId: string) => useHub.setState({ sessionUserId: userId });

const viewerOf = (userId: string): access.WikiViewer => {
  const h = useHub.getState();
  const u = h.users.find((x) => x.id === userId)!;
  return { userId, roleIds: u.roleIds, perms: effectivePermissions(u, h.roles) };
};

describe('Helix Knowledge Base ("Cortex") RBAC, Q&A & Governance', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    useWiki.getState().resetWikiDemo();
  });

  it('resolves every cross-app companionSlug in Academy and articleSlug in Onboarding to a real Knowledge Base article', () => {
    const seed = buildWikiSeed();
    const slugs = new Set(seed.articles.map((a) => a.slug));

    for (const c of SEED_COURSES) {
      for (const s of c.companionSlugs) {
        expect(slugs.has(s), `Missing companionSlug "${s}" for course ${c.id}`).toBe(true);
      }
    }
    for (const t of ONBOARDING_TEMPLATE) {
      if (t.articleSlug) {
        expect(slugs.has(t.articleSlug), `Missing onboarding articleSlug "${t.articleSlug}"`).toBe(true);
      }
    }
    expect(seed.collections.some((c) => c.slug === 'col-new-hire')).toBe(true);
  });

  it('enforces permission-first retrieval in Cortex Q&A so contractors never see restricted Engineering or People docs', () => {
    const state = useWiki.getState();
    const alexViewer = viewerOf('u-alex');
    const alexAllowed = access.readableSpaceIds(alexViewer, state.spaces);
    expect([...alexAllowed].sort()).toEqual(['handbook', 'onboarding', 'security']);
    expect(access.canWriteWiki(alexViewer)).toBe(false);

    const alexVisible = state.articles.filter((a) => alexAllowed.has(a.spaceId));
    const contractorAns = askCortex(
      'How do we run a Sev-1 canary rollback with hx rollout undo?',
      alexVisible,
      state.spaces,
      state.articles.length,
    );
    // Must NEVER cite restricted engineering runbook `production-deploy-and-incident-runbook`
    expect(contractorAns.citations.some((c) => c.articleSlug === 'production-deploy-and-incident-runbook')).toBe(false);

    // Engineer Priya asks the exact same question and gets the cited Engineering runbook
    const priyaViewer = viewerOf('u-priya');
    const priyaAllowed = access.readableSpaceIds(priyaViewer, state.spaces);
    const priyaVisible = state.articles.filter((a) => priyaAllowed.has(a.spaceId));
    const engAns = askCortex(
      'How do we run a Sev-1 canary rollback with hx rollout undo?',
      priyaVisible,
      state.spaces,
      state.articles.length,
    );
    expect(engAns.citations[0]?.articleSlug).toBe('production-deploy-and-incident-runbook');
  });

  it('protects locked canonical playbooks with Change Proposals and four-eyes review', () => {
    // Priya (contributor, not curator or owner) cannot directly overwrite locked security policy
    as('u-priya');
    const target = useWiki.getState().articles.find((a) => a.slug === 'passkeys-and-zero-trust')!;
    const deniedEdit = useWiki.getState().updateArticle('passkeys-and-zero-trust', {
      title: target.title,
      subtitle: target.subtitle,
      tldr: 'Direct edit attempt',
      tags: target.tags,
      sections: target.sections,
      summary: 'Attempt direct edit',
    });
    expect(deniedEdit.ok).toBe(false);

    // Sara (People Ops, wiki.manage) submits a proposal and tries to self-approve -> blocked by separation of duties!
    as('u-sara');
    const prop = useWiki.getState().proposeEdit('passkeys-and-zero-trust', {
      summary: 'Add Linux FIDO2 setup note for platform engineers',
      proposedTitle: target.title,
      proposedTldr: 'Updated zero-trust passkey summary with Linux FIDO2 support.',
      proposedSections: target.sections,
    });
    expect(prop.ok).toBe(true);
    const selfApprove = useWiki.getState().decideProposal(prop.proposalId!, 'approved');
    expect(selfApprove.ok).toBe(false);

    // Omar (Manager, also holds wiki.manage) reviews & approves Sara's proposal -> publishes v3!
    as('u-omar');
    const approved = useWiki.getState().decideProposal(prop.proposalId!, 'approved', 'Verified against Kolide posture check');
    expect(approved.ok).toBe(true);
    const updated = useWiki.getState().articles.find((a) => a.slug === 'passkeys-and-zero-trust')!;
    expect(updated.tldr).toContain('Linux FIDO2');
    expect(updated.versions.length).toBe(3);
  });

  it('tracks freshness states, stale flags, and owner/curator verification', () => {
    const runbookBefore = useWiki.getState().articles.find((a) => a.slug === 'production-deploy-and-incident-runbook')!;
    expect(computeFreshness(runbookBefore).state).toBe('stale');

    // Lucas (owner) verifies freshness -> clears flag and resets timer
    as('u-lucas');
    const verified = useWiki.getState().verifyFreshness('production-deploy-and-incident-runbook');
    expect(verified.ok).toBe(true);

    const runbookAfter = useWiki.getState().articles.find((a) => a.slug === 'production-deploy-and-incident-runbook')!;
    expect(computeFreshness(runbookAfter).state).toBe('verified');
  });
});
