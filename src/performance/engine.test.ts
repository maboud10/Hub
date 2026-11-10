import { describe, expect, it } from 'vitest';
import { SEED_USERS } from '@/data/users';
import { SEED_ROLES } from '@/data/roles';
import { effectivePermissions } from '@/lib/rbac';
import {
  calibrationScope,
  canAddEvidence,
  canCreateObjective,
  canEditObjective,
  canViewFeedback,
  canViewObjective,
  managerChain,
  orgIds,
  peerAuthorVisible,
  reviewAccess,
  upwardAccess,
  type PerfViewer,
} from './access';
import { analyzeTone, applySuggestion, checkReview, sbiCompleteness, sentimentOf } from './bias';
import { buildPeriods, currentPhaseKey, cycleCompletion, makePhases, managerUnlocked, pct, timelineSegments, validatePhases } from './cycle';
import { branchIds, layoutGalaxy } from './galaxy';
import { gapsTo, LADDER, promotionReadiness } from './ladders';
import { distributionNote, performanceDistribution, placementFor } from './ninebox';
import { checkKrQuality, composeFeedback, draftObjective, draftSelfAnswer, explainObjective, parseNumbers, peerThemes, polishTitle, suggestGrowthGoal, suggestTopics } from './nova';
import { buildEvidence } from './evidence';
import { createPerfSeed } from './seed';

const DAY = 86_400_000;
const NOW = new Date('2026-11-06T03:40:00+04:00').getTime();
const seed = createPerfSeed(NOW);
const users = SEED_USERS;
const viewer = (id: string): PerfViewer => ({ id, perms: effectivePermissions(users.find((u) => u.id === id)!, SEED_ROLES) });
const obj = (id: string) => seed.objectives.find((o) => o.id === id)!;
const rev = (id: string) => seed.reviews.find((r) => r.id === id)!;

describe('periods & cycle phases', () => {
  it('builds Q4 / Q3 / Q2 relative to now', () => {
    const p = buildPeriods(NOW);
    expect(p.map((x) => x.label)).toEqual(['Q4 2026', 'Q3 2026', 'Q2 2026']);
    expect(p[0].id).toBe('q4-2026');
    expect(NOW).toBeGreaterThan(p[0].start);
    expect(NOW).toBeLessThan(p[0].end);
    expect(p[1].end).toBe(p[0].start - 1);
  });

  it('puts the Q4 cycle in self-reflection with monotonic segments', () => {
    const c = seed.cycles.find((x) => x.id === 'cyc-2026-q4')!;
    expect(currentPhaseKey(c, NOW)).toBe('self');
    const segs = timelineSegments(c);
    expect(segs.map((s) => s.key)).toEqual(['self', 'peer', 'manager', 'calibration', 'release']);
    for (let i = 1; i < segs.length; i += 1) expect(segs[i].from).toBe(segs[i - 1].to);
    expect(currentPhaseKey(seed.cycles.find((x) => x.id === 'cyc-2026-q3')!, NOW)).toBeNull();
  });

  it('validates phases', () => {
    const ok = makePhases(NOW);
    expect(validatePhases(ok)).toBeNull();
    expect(validatePhases(ok.slice(0, 3))).toMatch(/Every phase/);
    const bad = ok.map((p) => (p.key === 'manager' ? { ...p, end: p.start - 1 } : p));
    expect(validatePhases(bad)).toMatch(/end after/);
  });

  it('unlocks manager reviews after the self-reflection is submitted', () => {
    const c = seed.cycles.find((x) => x.id === 'cyc-2026-q4')!;
    expect(managerUnlocked(c, rev('rv-q4-priya'), NOW)).toBe(true);
    expect(managerUnlocked(c, rev('rv-q4-mei'), NOW)).toBe(false);
    expect(managerUnlocked(c, rev('rv-q4-mei'), NOW + 20 * DAY)).toBe(true);
  });

  it('reports ~68% completion org-wide', () => {
    const done = cycleCompletion('cyc-2026-q4', seed.reviews, seed.cycleFeedback);
    expect(done.self).toEqual({ done: 12, total: 17 });
    expect(Math.round(pct(done.overall) * 100)).toBe(68);
  });
});

describe('access & privacy', () => {
  it('walks the org chart', () => {
    expect(managerChain(users, 'u-mei')).toEqual(['u-omar', 'u-layla']);
    expect(orgIds(users, 'u-omar')).toEqual(expect.arrayContaining(['u-mei', 'u-priya', 'u-lucas', 'u-hana', 'u-kwame']));
  });

  it('keeps private objectives private', () => {
    const o = obj('obj-mei-research');
    expect(canViewObjective(viewer('u-mei'), users, o)).toBe(true);
    expect(canViewObjective(viewer('u-omar'), users, o)).toBe(true);
    expect(canViewObjective(viewer('u-layla'), users, o)).toBe(true);
    expect(canViewObjective(viewer('u-sara'), users, o)).toBe(true); // performance.manage
    expect(canViewObjective(viewer('u-priya'), users, o)).toBe(false);
    expect(canViewObjective(viewer('u-priya'), users, obj('obj-co-passwordless'))).toBe(true);
  });

  it('gates objective creation by level', () => {
    expect(canCreateObjective(viewer('u-kwame'), users, 'individual', 'u-kwame').ok).toBe(true);
    expect(canCreateObjective(viewer('u-kwame'), users, 'team', 'u-kwame').ok).toBe(false);
    expect(canCreateObjective(viewer('u-omar'), users, 'team', 'u-omar').ok).toBe(true);
    expect(canCreateObjective(viewer('u-omar'), users, 'individual', 'u-kwame').ok).toBe(true);
    expect(canCreateObjective(viewer('u-omar'), users, 'company', 'u-omar').ok).toBe(false);
    expect(canCreateObjective(viewer('u-sara'), users, 'company', 'u-sara').ok).toBe(true);
    expect(canCreateObjective(viewer('u-mei'), users, 'individual', 'u-priya').ok).toBe(false);
  });

  it('lets owners and managers (not peers) edit', () => {
    expect(canEditObjective(viewer('u-omar'), users, obj('obj-mei-docs'))).toBe(true);
    expect(canEditObjective(viewer('u-priya'), users, obj('obj-mei-docs'))).toBe(false);
    expect(canEditObjective(viewer('u-omar'), users, obj('obj-co-design-system'))).toBe(true); // co-owner
  });

  it('applies review roles', () => {
    const mei = rev('rv-q4-mei');
    const omarOnMei = reviewAccess(viewer('u-omar'), users, mei);
    expect(omarOnMei.role).toBe('manager');
    expect(omarOnMei.seeSelf).toBe(false); // draft is private
    const meiOwn = reviewAccess(viewer('u-mei'), users, mei);
    expect(meiOwn.seeManager).toBe(false);
    expect(reviewAccess(viewer('u-sara'), users, mei).audited).toBe(true);
    expect(reviewAccess(viewer('u-layla'), users, mei).role).toBe('skip');
    expect(reviewAccess(viewer('u-priya'), users, mei).canView).toBe(false);
    const q3 = reviewAccess(viewer('u-mei'), users, rev('rv-q3-mei'));
    expect(q3.seeManager).toBe(true);
    expect(q3.acknowledge).toBe(true);
    expect(reviewAccess(viewer('u-omar'), users, rev('rv-q4-priya')).seePrivateNote).toBe(true);
    expect(reviewAccess(viewer('u-layla'), users, rev('rv-q4-priya')).seePrivateNote).toBe(false);
  });

  it('respects peer anonymity and the upward threshold', () => {
    const anon = { anonymous: true, authorId: 'u-hana' };
    const named = { anonymous: false, authorId: 'u-priya' };
    const emp = reviewAccess(viewer('u-mei'), users, rev('rv-q3-mei'));
    expect(peerAuthorVisible(emp, anon, 'u-mei')).toBe(false);
    expect(peerAuthorVisible(emp, named, 'u-mei')).toBe(true);
    expect(peerAuthorVisible(reviewAccess(viewer('u-omar'), users, rev('rv-q3-mei')), anon, 'u-omar')).toBe(true);
    const omarUp = seed.cycleFeedback.filter((f) => f.kind === 'upward' && f.subjectId === 'u-omar' && f.cycleId === 'cyc-2026-q4');
    expect(upwardAccess(viewer('u-omar'), users, 'u-omar', omarUp, 3)).toMatchObject({ visible: true, count: 3 });
    const saraUp = seed.cycleFeedback.filter((f) => f.kind === 'upward' && f.subjectId === 'u-sara' && f.cycleId === 'cyc-2026-q4');
    expect(upwardAccess(viewer('u-sara'), users, 'u-sara', saraUp, 3).visible).toBe(false);
    expect(upwardAccess(viewer('u-mei'), users, 'u-omar', omarUp, 3).allowed).toBe(false);
  });

  it('enforces feedback visibility', () => {
    const f = { fromId: 'u-omar', toId: 'u-mei', visibility: 'manager' as const };
    expect(canViewFeedback(viewer('u-mei'), users, f)).toBe(true);
    expect(canViewFeedback(viewer('u-priya'), users, f)).toBe(false);
    expect(canViewFeedback(viewer('u-priya'), users, { fromId: 'u-hana', toId: 'u-mei', visibility: 'manager' })).toBe(false);
    expect(canViewFeedback(viewer('u-omar'), users, { fromId: 'u-hana', toId: 'u-mei', visibility: 'manager' })).toBe(true);
    expect(canViewFeedback(viewer('u-omar'), users, { fromId: 'u-hana', toId: 'u-mei', visibility: 'private' })).toBe(false);
  });

  it('scopes calibration and evidence', () => {
    const scope = calibrationScope(viewer('u-omar'), users, seed.cycles[0].participantIds);
    expect(scope.sort()).toEqual(['u-hana', 'u-kwame', 'u-lucas', 'u-mei', 'u-priya']);
    expect(calibrationScope(viewer('u-sara'), users, seed.cycles[0].participantIds)).toHaveLength(16);
    expect(canAddEvidence(viewer('u-omar'), users, 'u-mei').ok).toBe(true);
    expect(canAddEvidence(viewer('u-priya'), users, 'u-mei').ok).toBe(false);
  });
});

describe('bias & quality checker', () => {
  const draft = rev('rv-q4-priya').manager;
  const evidence = [
    { id: 'e1', title: 'Query planner v2 rolled out to 50% of traffic', at: NOW - 20 * DAY },
    { id: 'e2', title: 'Zero-downtime EU-Cell cutover', at: NOW - 30 * DAY },
    { id: 'e3', title: 'Theming API RFC approved', at: NOW - 5 * DAY },
    { id: 'e4', title: 'Planner metrics dashboard', at: NOW - 3 * DAY },
  ];
  const report = checkReview({ answers: Object.entries(draft.answers).map(([id, text]) => ({ id, text })), rating: draft.overall, evidence, cited: [], now: NOW });

  it('flags vague praise, personality words and absolutes in Omar’s draft', () => {
    const kinds = report.flags.map((f) => f.kind);
    expect(kinds).toContain('vague');
    expect(kinds).toContain('personality');
    expect(kinds).toContain('absolute');
    expect(report.flags.find((f) => f.match?.toLowerCase() === 'rockstar')).toBeTruthy();
    expect(report.score).toBeLessThan(70);
  });

  it('applies rewrites in place', () => {
    const flag = report.flags.find((f) => f.match?.toLowerCase() === 'great job')!;
    const out = applySuggestion('Great job on the planner.', flag);
    expect(out).not.toMatch(/great job/i);
    expect(out.startsWith('Clear, specific impact')).toBe(true);
  });

  it('detects recency bias and rating mismatch', () => {
    const r = checkReview({ answers: [{ id: 'q', text: 'Shipped the theming API RFC and the planner metrics dashboard. Both were strong and clear.' }], evidence, cited: ['e3', 'e4'], now: NOW });
    expect(r.recencyShare).toBe(1);
    expect(r.flags.some((f) => f.kind === 'recency')).toBe(true);
    const m = checkReview({
      answers: [{ id: 'q', text: 'The rollout slipped twice and dependencies were missed. Communication was unclear and the team was blocked on reviews for days, which delayed the release.' }],
      rating: 'exceeds',
      evidence,
      cited: [],
      now: NOW,
    });
    expect(m.flags.some((f) => f.kind === 'mismatch')).toBe(true);
    expect(sentimentOf('Delivered and shipped great work')).toBeGreaterThan(0);
  });

  it('scores tone and SBI completeness', () => {
    expect(analyzeTone('Thank you, I really appreciated how you helped the team.').tone).toBe('warm');
    expect(analyzeTone('You always ship sloppy, careless work.').tone).toBe('harsh');
    expect(sbiCompleteness({ situation: 'In Monday’s crit', behaviour: 'you opened with three clips', impact: '' }).missing).toEqual(['impact']);
  });
});

describe('Nova', () => {
  it('drafts an objective with measurable KRs and alignment', () => {
    const parents = seed.objectives.filter((o) => o.periodId === 'q4-2026' && o.level !== 'individual');
    const d = draftObjective('Get productive on the data platform and make our pipelines trustworthy', { department: 'Engineering', parents });
    expect(d.keyResults).toHaveLength(3);
    expect(d.keyResults.every((k) => k.title.length > 8)).toBe(true);
    expect(d.parentId).toBeTruthy();
    expect(polishTitle('We want to make onboarding delightful by 30%.')).toBe('Make onboarding delightful');
    expect(parseNumbers('Raise adoption to 95% and win $2.4M')).toMatchObject({ toPct: 95, money: 2_400_000 });
  });

  it('checks KR quality and suggests rewrites', () => {
    const bad = checkKrQuality({ title: 'Launch the onboarding guide', metric: 'boolean', start: 0, target: 1 }, 'Q4 2026');
    expect(bad.checks.find((c) => c.id === 'outcome')!.pass).toBe(false);
    expect(bad.rewrite).toBeTruthy();
    const good = checkKrQuality({ title: 'Cut time to first PR from 14 to 5 days', metric: 'number', start: 14, target: 5, unit: 'days' }, 'Q4 2026');
    expect(good.score).toBe(100);
  });

  it('explains why passwordless is at risk', () => {
    const krs = seed.keyResults.filter((k) => k.objectiveId === 'obj-co-passwordless');
    const e = explainObjective(obj('obj-co-passwordless'), krs, seed.periods[0], NOW);
    expect(e.status).toBe('at-risk');
    expect(e.headline).toMatch(/at risk/);
    expect(e.bullets[0].text).toMatch(/forecast/);
    expect(e.suggestions.length).toBeGreaterThan(0);
  });

  it('drafts self-reflection answers from real evidence', () => {
    const ev = buildEvidence({
      userId: 'u-mei',
      since: seed.periods[0].start,
      kudos: [],
      feedback: seed.feedback.filter((f) => f.toId === 'u-mei'),
      keyResults: seed.keyResults,
      objectives: seed.objectives,
      pinned: seed.evidence,
      work: [],
      nameOf: (id) => users.find((u) => u.id === id)?.name ?? id,
    });
    expect(ev.some((e) => e.kind === 'okr')).toBe(true);
    const wins = draftSelfAnswer('q-wins', { firstName: 'Mei', evidence: ev, krs: [{ title: 'Prism v4 adoption', objectiveTitle: 'x', progress: 0.51, status: 'on-track', from: '35%', now: '58%', target: '80%' }], goals: [], gaps: ['ownership'], strengths: ['customer'] });
    expect(wins).toMatch(/Prism v4/);
    expect(wins).toMatch(/I moved/);
  });

  it('summarises peer themes', () => {
    const items = seed.cycleFeedback.filter((f) => f.subjectId === 'u-priya' && f.kind === 'peer' && f.cycleId === 'cyc-2026-q4');
    const t = peerThemes(items);
    expect(t.responses).toBe(3);
    expect(t.growth[0].theme).toBe('Delegation');
    expect(t.summary).toMatch(/3 peers/);
  });

  it('suggests 1:1 topics from signals', () => {
    const topics = suggestTopics({
      memberFirstName: 'Lucas',
      leadFirstName: 'Omar',
      viewerIsLead: true,
      atRiskKrs: [{ title: 'Alerts with a linked runbook', status: 'at-risk', forecast: '84%', target: '100%' }],
      selfDueInDays: 12,
      selfSubmitted: false,
      newFeedback: [{ fromFirst: 'Omar', kind: 'constructive' }],
      overdueActions: [{ text: 'Write runbooks for the 5 noisiest alerts', dueAt: NOW - 3 * DAY }],
      daysSinceLast: 6,
      growthGoalsDue: [],
      lastMood: 2,
      agendaTexts: [],
      now: NOW,
    });
    expect(topics.map((t) => t.id)).toEqual(expect.arrayContaining(['self-due', 'mood']));
    expect(topics[0].text).toMatch(/runbook/);
  });

  it('suggests growth goals for the biggest gap and composes SBI feedback', () => {
    const g = suggestGrowthGoal([{ competency: 'ownership', gap: 1 }, { competency: 'craft', gap: 0 }], []);
    expect(g?.competency).toBe('ownership');
    const text = composeFeedback({ situation: 'In Monday’s crit', behaviour: 'you opened with customer clips', impact: 'the decision took ten minutes' }, 'praise', 'Hana');
    expect(text).toBe('Hana, in Monday’s crit, you opened with customer clips. The decision took ten minutes. Thank you!');
  });
});

describe('ladders, 9-box & galaxy', () => {
  it('computes gaps and promotion readiness', () => {
    const d5 = LADDER.design.levels.find((l) => l.id === 'D5')!;
    const gaps = gapsTo(d5, { craft: 5, collaboration: 4, ownership: 3, impact: 4, customer: 5 });
    expect(gaps.filter((g) => g.gap > 0).map((g) => g.competency)).toEqual(['ownership', 'impact']);
    const r = promotionReadiness({ next: d5, scores: { craft: 5, collaboration: 4, ownership: 3, impact: 4, customer: 5 }, ratings: ['exceeds', 'meets'], monthsInLevel: 14 });
    expect(r.meets).toBe(3);
    expect(r.score).toBe(36 + 15 + 10);
  });

  it('places people on the 9-box (calibrated > manager > previous)', () => {
    expect(placementFor('u-priya', rev('rv-q4-priya'), rev('rv-q3-priya'))).toMatchObject({ performance: 3, potential: 3, source: 'manager' });
    expect(placementFor('u-lucas', rev('rv-q4-lucas'), rev('rv-q3-lucas'))).toMatchObject({ performance: 2, potential: 2, source: 'previous' });
    expect(placementFor('u-kwame', rev('rv-q4-kwame'), undefined)).toBeNull();
    const placements = seed.reviews.filter((r) => r.cycleId === 'cyc-2026-q3').map((r) => placementFor(r.employeeId, r, undefined)).filter((p) => !!p);
    expect(performanceDistribution(placements).reduce((s, d) => s + d.count, 0)).toBe(placements.length);
    expect(distributionNote(placements)).toMatch(/High performance/);
  });

  it('lays out the galaxy as a radial tree', () => {
    const q4 = seed.objectives.filter((o) => o.periodId === 'q4-2026');
    const layout = layoutGalaxy(q4.map((o) => ({ id: o.id, level: o.level, parentId: o.parentId, krs: seed.keyResults.filter((k) => k.objectiveId === o.id).length })), 640);
    expect(layout.nodes).toHaveLength(q4.length);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      if (n.parentId) {
        const p = layout.nodes.find((x) => x.id === n.parentId)!;
        expect(n.angle).toBeGreaterThanOrEqual(p.a0 - 1e-9);
        expect(n.angle).toBeLessThanOrEqual(p.a1 + 1e-9);
      }
    }
    expect(layout.nodes.find((n) => n.id === 'obj-fin-close')!.unaligned).toBe(true);
    const branch = branchIds(layout, 'obj-dsn-prism');
    expect([...branch]).toEqual(expect.arrayContaining(['obj-co-design-system', 'obj-mei-docs', 'obj-hana-research']));
  });
});
