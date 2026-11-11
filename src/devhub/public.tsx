/**
 * Public App Bridge for DevHub — "Forge" (see src/lib/appBridge.ts).
 */
import { Activity, BarChart3, Boxes, GitBranch, GitPullRequest, PlusCircle, Rocket } from 'lucide-react';
import type { BridgeDeploy, BridgeReview, DevHubBridge, PaletteEntry } from '@/lib/appBridge';
import { capabilitiesFor, hasBridgeFreezeAccess, hasBridgeReadAccess } from './access';
import { reviewQueue as computeReviewQueue } from './engine';
import { useDevHub } from './store';

export const api: DevHubBridge = {
  appId: 'devhub',

  paletteEntries(viewer) {
    const caps = capabilitiesFor(viewer);
    if (!caps.canView) return [];
    const st = useDevHub.getState();
    const out: PaletteEntry[] = [];

    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle: string) =>
      out.push({
        id: `devhub:${id}`,
        group: 'Actions',
        title,
        subtitle,
        to,
        icon,
        glyphColor: '#a3e635',
        keywords: ['devhub', 'forge', 'engineering', ...keywords],
        hint: 'Open',
      });

    action('cockpit', 'Forge engineering cockpit', '/devhub', <GitBranch />, ['cockpit', 'home', 'stream'], 'Live delivery stream, review SLA queue & canary radar');
    action('reviews', 'Pull requests & code reviews', '/devhub/reviews', <GitPullRequest />, ['pr', 'pull request', 'review', 'diff', 'merge'], 'Explainable risk score, Nova inline suggestions & merge queue');
    action('pipelines', 'CI/CD pipeline runs', '/devhub/pipelines', <Activity />, ['ci', 'cd', 'pipeline', 'build', 'flaky', 'logs'], '5-stage pipeline tracker, live logs & flaky test quarantine');
    action('deploys', 'Deploys, canary & rollback', '/devhub/deploys', <Rocket />, ['deploy', 'canary', 'rollback', 'freeze', 'release', 'flags'], 'Canary health gates, 1-click rollback & feature flags');
    action('services', 'Service catalog & golden path', '/devhub/services', <Boxes />, ['service', 'catalog', 'scorecard', 'code search', 'scaffold'], 'Ownership scorecards, dependency blast radius & code search');
    action('insights', 'DORA metrics & review load', '/devhub/insights', <BarChart3 />, ['dora', 'metrics', 'lead time', 'cfr', 'mttr', 'devex'], 'Four keys, cycle time breakdown & review load equity');
    if (caps.canManageCatalog) {
      action('scaffold', 'Scaffold golden-path service', '/devhub/services?wizard=1', <PlusCircle />, ['new service', 'golden path', 'template', 'wizard'], 'Provision repo, CI, Cloud project & Vault secrets in 6 steps');
    }

    for (const pr of st.prs.slice(0, 10)) {
      out.push({
        id: `devhub:pr:${pr.id}`,
        group: 'Work',
        title: `#${pr.number} · ${pr.title}`,
        subtitle: `${pr.repo} · ${pr.state.replace('_', ' ')}`,
        icon: <GitPullRequest />,
        glyphColor: '#22c55e',
        keywords: ['pr', 'pull request', String(pr.number), pr.service, pr.branch, ...pr.labels],
        hint: 'Review PR',
        to: `/devhub/reviews?pr=${pr.id}`,
      });
    }

    for (const svc of st.services.slice(0, 8)) {
      out.push({
        id: `devhub:svc:${svc.id}`,
        group: 'Work',
        title: `${svc.id} (${svc.version})`,
        subtitle: `${svc.team} · Tier ${svc.tier} · ${svc.language}`,
        icon: <Boxes />,
        glyphColor: '#a3e635',
        keywords: ['service', svc.id, svc.repo, svc.team.toLowerCase(), svc.language.toLowerCase()],
        hint: 'Inspect service',
        to: `/devhub/services?service=${svc.id}`,
      });
    }

    return out;
  },

  resetDemo() {
    useDevHub.getState().resetDemo();
  },

  recentDeploys(viewer, opts) {
    if (!hasBridgeReadAccess(viewer)) return [];
    const st = useDevHub.getState();
    const limit = opts?.limit ?? 12;
    return st.deploys
      .filter((d) => (!opts?.service || d.service === opts.service))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(
        (d): BridgeDeploy => ({
          id: d.id,
          service: d.service,
          version: d.version,
          env: d.env,
          status: d.status,
          authorId: d.authorId,
          at: d.at,
          to: `/devhub/deploys?deploy=${d.id}`,
        }),
      );
  },

  setDeployFreeze(viewer, input) {
    if (!hasBridgeFreezeAccess(viewer)) {
      return { ok: false, error: 'You do not have permission to change the deploy freeze.' };
    }
    if (input.frozen && !input.reason?.trim()) {
      return { ok: false, error: 'A freeze reason is required.' };
    }
    useDevHub.getState().setDeployFreeze({
      frozen: input.frozen,
      reason: input.reason ?? '',
      source: input.source,
      actorId: viewer.user.id,
    });
    return { ok: true, frozen: input.frozen };
  },

  reviewQueue(viewer) {
    if (!capabilitiesFor(viewer).canView) return [];
    const prs = useDevHub.getState().prs;
    return computeReviewQueue(prs, viewer.user.id).map(
      (p): BridgeReview => ({
        id: p.id,
        title: `#${p.number} · ${p.title}`,
        repo: p.repo,
        authorId: p.authorId,
        to: `/devhub/reviews?pr=${p.id}`,
      }),
    );
  },
};
