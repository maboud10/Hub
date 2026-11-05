/**
 * Talent Hub tests: AI engine (JD decoding, matching, outreach), LinkedIn
 * builders, stage gates, permission scoping and end-to-end store flows
 * (four-eyes offer approval → acceptance → HR Portal hand-off → account).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

type Hub = typeof import('@/store/hub').useHub;
type Talent = typeof import('./store').useTalent;
let useHub: Hub;
let useTalent: Talent;
let mod: {
  jd: typeof import('./ai/jd');
  match: typeof import('./ai/match');
  outreach: typeof import('./ai/outreach');
  search: typeof import('./linkedin/search');
  importProfile: typeof import('./linkedin/importProfile');
  gates: typeof import('./gates');
  selectors: typeof import('./selectors');
  seed: typeof import('./seed');
  docs: typeof import('./ai/docs');
  rbac: typeof import('@/lib/rbac');
};

beforeAll(async () => {
  ({ useHub } = await import('@/store/hub'));
  ({ useTalent } = await import('./store'));
  mod = {
    jd: await import('./ai/jd'),
    match: await import('./ai/match'),
    outreach: await import('./ai/outreach'),
    search: await import('./linkedin/search'),
    importProfile: await import('./linkedin/importProfile'),
    gates: await import('./gates'),
    selectors: await import('./selectors'),
    seed: await import('./seed'),
    docs: await import('./ai/docs'),
    rbac: await import('@/lib/rbac'),
  };
});

beforeEach(() => {
  useHub.getState().resetDemo();
  useTalent.getState().resetTalentDemo();
  useHub.getState().logout();
});

const hub = () => useHub.getState();
const t = () => useTalent.getState();
const as = (id: string) => expect(hub().login(id).ok).toBe(true);
const sample = (id: string) => mod.seed.SAMPLE_JDS.find((j) => j.id === id)!.text;
const viewer = (id: string) => {
  const u = hub().users.find((x) => x.id === id)!;
  return { userId: id, perms: mod.rbac.effectivePermissions(u, hub().roles) };
};

describe('JD decoder', () => {
  it('extracts the essentials from a real-world JD', () => {
    const p = mod.jd.analyzeJobDescription(sample('jd-frontend'));
    expect(p.title).toBe('Senior Frontend Engineer');
    expect(p.seniority).toBe('senior');
    expect(p.yearsMin).toBe(5);
    expect(p.location).toBe('Dubai');
    expect(p.workModel).toBe('hybrid');
    expect(p.department).toBe('Engineering');
    expect(p.salary).toMatchObject({ min: 32_000, max: 42_000, currency: 'AED', period: 'month' });
    const must = p.skills.filter((s) => s.must).map((s) => s.skill);
    const nice = p.skills.filter((s) => !s.must).map((s) => s.skill);
    expect(must).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Design Systems', 'Accessibility', 'Web Performance']));
    expect(nice).toEqual(expect.arrayContaining(['GraphQL', 'Next.js', 'Arabic']));
    expect(p.responsibilities.length).toBeGreaterThanOrEqual(4);
    expect(p.titleAliases.length).toBeGreaterThan(1);
  });

  it('flags non-inclusive language and lowers the JD health score', () => {
    const bad = mod.jd.analyzeJobDescription(sample('jd-sales'));
    const good = mod.jd.analyzeJobDescription(sample('jd-frontend'));
    const terms = bad.quality.flags.filter((f) => f.kind === 'inclusive').map((f) => f.term?.toLowerCase());
    expect(terms).toEqual(expect.arrayContaining(['rockstar', 'young', 'aggressive', 'native arabic speaker']));
    expect(bad.quality.score).toBeLessThan(good.quality.score);
  });

  it('highlights detected entities for the X-ray view', () => {
    const text = sample('jd-frontend');
    const p = mod.jd.analyzeJobDescription(text);
    const segs = mod.jd.highlightJD(text, p);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.some((s) => s.kind === 'must' && /react/i.test(s.text))).toBe(true);
    expect(segs.some((s) => s.kind === 'years')).toBe(true);
  });
});

describe('matching & outreach', () => {
  it('ranks strong candidates above weak ones with explanations', () => {
    const p = mod.jd.analyzeJobDescription(sample('jd-frontend'));
    const data = mod.seed.createTalentSeed();
    const rania = data.candidates.find((c) => c.id === 'c-01')!;
    const diego = data.candidates.find((c) => c.id === 'c-13')!;
    const strong = mod.match.scoreMatch(p, rania, { location: 'Dubai', workModel: 'hybrid' });
    const weak = mod.match.scoreMatch(p, diego, { location: 'Dubai', workModel: 'hybrid' });
    expect(strong.score).toBeGreaterThanOrEqual(80);
    expect(weak.score).toBeLessThan(50);
    expect(strong.reasons[0]).toMatch(/must-have/);
    expect(weak.missing).toContain('React');
  });

  it('drafts personalised messages within LinkedIn limits', () => {
    const data = mod.seed.createTalentSeed();
    const req = data.requisitions.find((r) => r.id === 'req-fe')!;
    const person = data.candidates.find((c) => c.id === 'c-10')!;
    const base = { role: mod.outreach.roleFromProfile(req.jd.profile, req), person, sender: { name: 'Fatima Zahra', title: 'Talent Partner' }, step: 1 as const };
    for (const tone of ['warm', 'concise', 'visionary', 'technical'] as const) {
      const note = mod.outreach.draftOutreach({ ...base, channel: 'linkedin-connect', tone });
      expect(note.body.length).toBeLessThanOrEqual(300);
      expect(note.body).toContain('Abena');
    }
    const inmail = mod.outreach.draftOutreach({ ...base, channel: 'linkedin-inmail', tone: 'warm' });
    expect(inmail.subject).toBeTruthy();
    expect(inmail.body.length).toBeLessThanOrEqual(1900);
    expect(inmail.hooks.some((h) => h.startsWith('Shared skills'))).toBe(true);
  });

  it('builds LinkedIn Boolean, people-search and X-ray queries', () => {
    const p = mod.jd.analyzeJobDescription(sample('jd-frontend'));
    const pack = mod.search.buildLinkedInSearch(p);
    expect(pack.boolean).toMatch(/\("Senior Frontend Engineer" OR /);
    expect(pack.boolean).toMatch(/NOT \(/);
    expect(pack.peopleSearchUrl.startsWith('https://www.linkedin.com/search/results/people/?keywords=')).toBe(true);
    expect(pack.xrayQuery.startsWith('site:linkedin.com/in')).toBe(true);
  });

  it('parses LinkedIn profile URLs and DOCX bodies', () => {
    const r = mod.importProfile.parseLinkedInUrl('https://ae.linkedin.com/in/rania-haddad-8a1b2c3d/');
    expect(r.ok && r.nameGuess).toBe('Rania Haddad');
    expect(mod.importProfile.parseLinkedInUrl('https://example.com/x').ok).toBe(false);
    const xml = '<w:p><w:r><w:t>Requirements</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>5+ years React &amp; TS</w:t></w:r></w:p>';
    expect(mod.docs.docxXmlToText(xml.replace('<w:numPr/>', '<w:numPr></w:numPr>'))).toBe('Requirements\n- 5+ years React & TS');
  });

  it('writes a prose summary without the JD header', () => {
    const p = mod.jd.analyzeJobDescription(sample('jd-frontend'));
    expect(p.summary.startsWith('NEXUS is the employee platform')).toBe(true);
    expect(p.summary).not.toMatch(/Location:|Platform Experience/);
  });

  it('parses a LinkedIn PDF without treating the name block as skills', () => {
    const d = mod.importProfile.parseProfileText(
      [
        'Contact',
        'www.linkedin.com/in/hassan-ali (LinkedIn)',
        'Top Skills',
        'Front-End Development',
        'React.js',
        'Hassan Ali',
        'Senior Frontend Engineer at Careem | React',
        'Dubai, United Arab Emirates',
        'Experience',
        'Careem',
        'Senior Frontend Engineer',
        'January 2021 - Present (3 years 10 months)',
      ].join('\n'),
    );
    expect(d.name).toBe('Hassan Ali');
    expect(d.currentCompany).toBe('Careem');
    expect(d.location).toBe('Dubai, United Arab Emirates');
    expect(d.skills).toEqual(expect.arrayContaining(['React']));
    expect(d.skills).not.toEqual(expect.arrayContaining(['Hassan Ali', 'Dubai, United Arab Emirates']));
  });

  it('turns recent activity into a natural hook', () => {
    const data = mod.seed.createTalentSeed();
    const req = data.requisitions.find((r) => r.id === 'req-fe')!;
    const person = { ...data.candidates.find((c) => c.id === 'c-10')!, recentActivity: 'Shared a talk on web accessibility audits · 5d ago' };
    const note = mod.outreach.draftOutreach({ role: mod.outreach.roleFromProfile(req.jd.profile, req), person, sender: { name: 'Fatima Zahra', title: 'Talent Partner' }, step: 1, channel: 'linkedin-connect', tone: 'warm' });
    expect(note.body).toContain('your recent talk on web accessibility audits caught my eye');
  });
});

describe('stage gates', () => {
  it('requires each stage’s exit criteria and explains what is missing', () => {
    const data = mod.seed.createTalentSeed();
    const ctxFor = (id: string) => mod.selectors.buildGateContext(data.applications.find((a) => a.id === id)!, data)!;
    const ready = data.applications.find((a) => a.id === 'a-06')!;
    expect(mod.gates.gateFor(ready, 'interview', ctxFor('a-06')).ok).toBe(true);
    const applied = data.applications.find((a) => a.id === 'a-07')!;
    const g = mod.gates.gateFor(applied, 'screen', ctxFor('a-07'));
    expect(g.ok).toBe(false);
    expect(g.checks.find((c) => !c.done)?.id).toBe('screen-scheduled');
    expect(mod.gates.nextAction(applied, ctxFor('a-07')).kind).toBe('schedule-screen');
    expect(mod.gates.nextAction(data.applications.find((a) => a.id === 'a-02')!, ctxFor('a-02')).kind).toBe('decision');
  });
});

describe('permissions & scoping', () => {
  it('scopes hiring managers to their own requisitions', () => {
    const data = mod.seed.createTalentSeed();
    const omar = mod.selectors.scopeTalent(viewer('u-omar'), data);
    expect([...omar.reqIds].sort()).toEqual(['req-data', 'req-de', 'req-fe', 'req-pm']);
    const sara = mod.selectors.scopeTalent(viewer('u-sara'), data);
    expect(sara.requisitions.length).toBe(data.requisitions.length);
  });

  it('denies employees without Talent Hub access and audits the attempt', () => {
    as('u-mei');
    const res = t().moveStage('a-06', 'interview');
    expect(res.ok).toBe(false);
    expect(hub().audit[0]).toMatchObject({ outcome: 'denied', actorId: 'u-mei', action: 'pipeline.moved' });
  });

  it('enforces gates; only recruiters may override, with an audited reason', () => {
    as('u-omar');
    expect(t().moveStage('a-07', 'screen').ok).toBe(false); // not on his scope rules (applied stage) or gate
    as('u-sara');
    const blocked = t().moveStage('a-07', 'screen');
    expect(blocked.ok).toBe(false);
    expect(t().moveStage('a-07', 'screen', { override: true, reason: 'short' }).ok).toBe(false);
    const forced = t().moveStage('a-07', 'screen', { override: true, reason: 'Screened live at the careers fair today' });
    expect(forced.ok).toBe(true);
    expect(hub().audit.find((a) => a.action === 'pipeline.gate.override')).toBeTruthy();
  });

  it('builds a personal task list per persona', () => {
    const data = mod.seed.createTalentSeed();
    const users = hub().users;
    const omarTasks = mod.selectors.computeTalentTasks(viewer('u-omar'), data, users);
    expect(omarTasks.some((x) => x.kind === 'decision' && x.applicationId === 'a-02')).toBe(true);
    expect(omarTasks.some((x) => x.kind === 'scorecard' && x.interviewId === 'iv-15')).toBe(true);
    const saraTasks = mod.selectors.computeTalentTasks(viewer('u-sara'), data, users);
    expect(saraTasks.some((x) => x.kind === 'offer-approval' && x.offerId === 'of-1')).toBe(true);
    const meiTasks = mod.selectors.computeTalentTasks(viewer('u-mei'), data, users);
    expect(meiTasks.some((x) => x.kind === 'onboarding' && x.journeyId === 'j-1')).toBe(true);
  });
});

describe('offer → hire → onboarding flow', () => {
  it('applies four-eyes approval and separation of duties', () => {
    as('u-omar');
    expect(t().decideOffer('of-1', 'people-ops', 'approved').ok).toBe(false); // lacks Approve offers
    as('u-sara');
    const res = t().decideOffer('of-1', 'people-ops', 'approved', 'Within band');
    expect(res.ok).toBe(true);
    expect(t().offers.find((o) => o.id === 'of-1')!.status).toBe('approved');
    expect(t().sendOffer('of-1').ok).toBe(true);
  });

  it('blocks drafters from approving their own offer', () => {
    as('u-omar');
    expect(t().recordDecision('a-02', 'hire', 'Strong loop, raises the bar').ok).toBe(true);
    expect(t().applications.find((a) => a.id === 'a-02')!.stage).toBe('offer'); // auto-advanced by the gate
    as('u-sara');
    const start = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const drafted = t().draftOffer({ applicationId: 'a-02', baseSalary: 480_000, currency: 'AED', bonusPct: 10, equity: '1,000 RSUs', signOnBonus: 0, startDate: start, expiresInDays: 7 });
    expect(drafted.ok).toBe(true);
    const id = drafted.id!;
    expect(t().decideOffer(id, 'people-ops', 'approved').ok).toBe(false); // separation of duties
    as('u-omar');
    expect(t().decideOffer(id, 'hiring-manager', 'approved').ok).toBe(true);
    as('u-layla');
    expect(t().decideOffer(id, 'people-ops', 'approved').ok).toBe(true);
    expect(t().offers.find((o) => o.id === id)!.status).toBe('approved');
  });

  it('accepting an offer hires, fills the seat and hands off to HR Portal', () => {
    as('u-sara');
    const res = t().recordOfferResponse('of-2', 'accepted');
    expect(res.ok).toBe(true);
    const app = t().applications.find((a) => a.id === 'a-20')!;
    expect(app.status).toBe('hired');
    expect(t().requisitions.find((r) => r.id === 'req-design')!.status).toBe('filled');
    const journey = t().onboarding.find((j) => j.applicationId === 'a-20')!;
    expect(journey).toBeTruthy();
    expect(journey.tasks.length).toBeGreaterThan(20);
    expect(hub().notifications.some((n) => n.kind === 'talent' && n.userId === 'u-aisha' && n.title.includes('Amelia'))).toBe(true);
  });

  it('provisions a NEXUS account once, within clearance', () => {
    as('u-sara');
    const res = t().provisionHubAccount('j-1');
    expect(res.ok).toBe(true);
    const j = t().onboarding.find((x) => x.id === 'j-1')!;
    expect(j.workEmail).toBe('salma.darwish@helix.co');
    expect(hub().users.find((u) => u.id === j.hubUserId)?.roleIds).toEqual(['engineering', 'employee']);
    expect(t().provisionHubAccount('j-1').ok).toBe(false);
    as('u-mei');
    expect(t().toggleOnboardingTask('j-1', j.tasks.find((x) => x.owner === 'buddy')!.id).ok).toBe(true);
    expect(t().toggleOnboardingTask('j-1', j.tasks.find((x) => x.owner === 'manager' && !x.done)!.id).ok).toBe(false);
  });
});

describe('hub migration', () => {
  it('upgrades a v1 workspace without wiping it', async () => {
    const { migrateV1toV2 } = await import('@/store/hub');
    const { createSeed } = await import('@/data/seed');
    const v1 = createSeed();
    const legacy = {
      ...v1,
      version: 1,
      apps: v1.apps.map((a) => ({ ...a, route: undefined })),
      roles: v1.roles.map((r) => ({ ...r, permissions: r.permissions.filter((p) => !p.startsWith('talent.') && !p.startsWith('hr.')) })),
      notifications: v1.notifications.filter((n) => n.kind !== 'talent'),
    };
    const out = migrateV1toV2(legacy);
    expect(out.version).toBe(2);
    expect(out.apps.find((a) => a.id === 'recruit')?.route).toBe('/talent');
    expect(out.roles.find((r) => r.id === 'people-ops')?.permissions).toContain('talent.offers.approve');
    expect(out.notifications.some((n) => n.id === 'n-t1')).toBe(true);
  });
});
