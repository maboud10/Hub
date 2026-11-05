/**
 * HR Portal tests: calendar math, balances and pro-rating, the leave approval
 * flow (separation of duties, auto-approved sick days, balance/overlap rules),
 * claims, letters, e-signatures, policy acknowledgements, new-hire pulse,
 * privacy (peers see "Away"), payslips, the Talent Hub → HR hand-off and the
 * v2 → v3 hub migration.
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
type Talent = typeof import('@/talent/store').useTalent;
type Hr = typeof import('./store').useHr;
let useHub: Hub;
let useTalent: Talent;
let useHr: Hr;
let mod: {
  calendar: typeof import('./calendar');
  constants: typeof import('./constants');
  engine: typeof import('./engine');
  selectors: typeof import('./selectors');
  rbac: typeof import('@/lib/rbac');
  hub: typeof import('@/store/hub');
  seed: typeof import('@/data/seed');
};

beforeAll(async () => {
  ({ useHub } = await import('@/store/hub'));
  ({ useTalent } = await import('@/talent/store'));
  ({ useHr } = await import('./store'));
  mod = {
    calendar: await import('./calendar'),
    constants: await import('./constants'),
    engine: await import('./engine'),
    selectors: await import('./selectors'),
    rbac: await import('@/lib/rbac'),
    hub: await import('@/store/hub'),
    seed: await import('@/data/seed'),
  };
});

beforeEach(() => {
  useHub.getState().resetDemo();
  useTalent.getState().resetTalentDemo();
  useHr.getState().resetHrDemo();
  useHub.getState().logout();
});

const hub = () => useHub.getState();
const hr = () => useHr.getState();
const as = (id: string) => expect(hub().login(id).ok).toBe(true);
const userOf = (id: string) => hub().users.find((u) => u.id === id)!;
const viewer = (id: string) => ({ userId: id, perms: mod.rbac.effectivePermissions(userOf(id), hub().roles) });
/** Monday of the week `weeks` from now, plus `plus` days. */
const mon = (weeks: number, plus = 0) => mod.calendar.addDaysISO(mod.calendar.startOfWeek(mod.calendar.todayISO()), weeks * 7 + plus);

describe('calendar', () => {
  it('counts working days without weekends or UAE public holidays', () => {
    const { workingDays, holidaySet } = mod.calendar;
    // Mon 30 Nov – Fri 4 Dec 2026: Commemoration + National Day (1–3 Dec) in the UAE.
    expect(workingDays('2026-11-30', '2026-12-04', holidaySet('Dubai'))).toBe(2);
    expect(workingDays('2026-11-30', '2026-12-04', holidaySet('Berlin'))).toBe(5);
    expect(workingDays('2026-11-30', '2026-11-30', holidaySet('Dubai'), 'am')).toBe(0.5);
    expect(workingDays('2026-11-28', '2026-11-29', holidaySet('Dubai'))).toBe(0);
  });

  it('pro-rates annual leave in the joining year', () => {
    const { allowanceFor } = mod.engine;
    const annual = mod.constants.LEAVE_TYPE_BY_ID.annual;
    expect(allowanceFor(annual, '2026-10-09', 2026)).toBe(6.5);
    expect(allowanceFor(annual, '2020-06-01', 2026)).toBe(25);
    expect(allowanceFor(annual, '2027-02-01', 2026)).toBe(0);
    expect(allowanceFor(mod.constants.LEAVE_TYPE_BY_ID.unpaid, '2020-06-01', 2026)).toBeNull();
  });

  it('balances add carry-over and subtract taken, booked and pending days', () => {
    const omar = userOf('u-omar');
    const today = mod.calendar.todayISO();
    const year = Number(today.slice(0, 4));
    const b = mod.engine.computeBalances(omar, hr().leave, hr().adjustments, year, today).find((x) => x.type === 'annual')!;
    const pending = hr()
      .leave.filter((r) => r.userId === 'u-omar' && r.type === 'annual' && r.status === 'pending' && r.start.startsWith(String(year)))
      .reduce((n, r) => n + r.days, 0);
    expect(b.entitled).toBe(30); // 25 + 5 carried over
    expect(b.pending).toBe(pending);
    expect(b.available).toBe(Math.round((30 - b.taken - b.booked - b.pending) * 10) / 10);
  });
});

describe('time off', () => {
  it('routes a request to the line manager, who decides (never the requester)', () => {
    as('u-mei');
    const res = hr().requestLeave({ type: 'annual', start: mon(9), end: mon(9, 1), reason: 'Long weekend' });
    expect(res.ok).toBe(true);
    const req = hr().leave.find((r) => r.id === res.id)!;
    expect(req.status).toBe('pending');
    expect(req.approverId).toBe('u-omar');
    expect(hr().decideLeave(req.id, 'approved').ok).toBe(false);

    as('u-omar');
    expect(hr().decideLeave(req.id, 'rejected').ok).toBe(false); // a decline needs a note
    expect(hr().decideLeave(req.id, 'approved').ok).toBe(true);
    expect(hr().leave.find((r) => r.id === req.id)!.decidedBy).toBe('u-omar');
    expect(hub().notifications.some((n) => n.userId === 'u-mei' && n.kind === 'hr' && /approved/i.test(n.title))).toBe(true);
    expect(hub().audit.some((a) => a.action === 'hr.leave.approve' && a.outcome === 'success')).toBe(true);
  });

  it('approves short sick leave instantly and enforces balances and overlaps', () => {
    as('u-kwame');
    const day = mod.calendar.nextWorkingDay(mod.calendar.todayISO(), mod.calendar.holidaySet(userOf('u-kwame').location));
    const sick = hr().requestLeave({ type: 'sick', start: day, end: day });
    expect(sick.ok).toBe(true);
    const req = hr().leave.find((r) => r.id === sick.id)!;
    expect(req.status).toBe('approved');
    expect(req.decidedBy).toBe('system');

    const tooLong = hr().requestLeave({ type: 'annual', start: mon(4), end: mon(5, 4) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/left/);

    as('u-mei');
    const clash = hr().requestLeave({ type: 'annual', start: mon(3), end: mon(3, 4) });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error).toMatch(/already/);
  });

  it('lets People Ops decide any request, but not colleagues without the right', () => {
    as('u-mei');
    expect(hr().decideLeave('lv-03', 'approved').ok).toBe(false);
    as('u-sara');
    expect(hr().decideLeave('lv-02', 'approved').ok).toBe(true); // Lucas reports to Omar; Sara runs HR ops
    expect(hub().audit.some((a) => a.action === 'hr.leave.approve' && a.target.includes('Lucas'))).toBe(true);
  });

  it('shows peers "Away" but managers the leave type (privacy)', () => {
    const today = mod.calendar.todayISO();
    const from = mod.calendar.addDaysISO(today, -7);
    const data = hr();
    const users = hub().users;
    const forMei = mod.selectors.computeAbsences(viewer('u-mei'), userOf('u-mei'), data, users, 'team', from, today).find((a) => a.id === 'lv-07')!;
    const forOmar = mod.selectors.computeAbsences(viewer('u-omar'), userOf('u-omar'), data, users, 'team', from, today).find((a) => a.id === 'lv-07')!;
    expect(forMei.type).toBeUndefined();
    expect(forOmar.type).toBe('sick');
  });
});

describe('benefits, letters and documents', () => {
  it('limits claims to the remaining allowance and keeps decisions with People Ops', () => {
    as('u-mei');
    const today = mod.calendar.todayISO();
    expect(hr().submitClaim({ allowance: 'learning', amount: 99_999, merchant: 'Udemy', description: 'Courses', date: today, receiptName: 'r.pdf' }).ok).toBe(false);
    const res = hr().submitClaim({ allowance: 'learning', amount: 300, merchant: 'Udemy', description: 'TypeScript course', date: today, receiptName: 'r.pdf' });
    expect(res.ok).toBe(true);
    expect(hr().decideClaim(res.id!, 'approved').ok).toBe(false);
    as('u-sara');
    expect(hr().decideClaim(res.id!, 'approved').ok).toBe(true);
    const claim = hr().claims.find((c) => c.id === res.id)!;
    expect(claim.status).toBe('approved');
    expect(claim.payrollMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('issues instant letters immediately and routes the rest to People Ops', () => {
    as('u-mei');
    const cert = hr().requestLetter({ kind: 'salary-certificate', addressedTo: 'DBS Bank', purpose: 'Apartment rental', includeSalary: false });
    expect(cert.ok && cert.issued).toBe(true);
    const letter = hr().letters.find((l) => l.id === cert.id)!;
    expect(letter.includeSalary).toBe(true); // salary certificates always include pay
    expect(letter.verifyCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hr().documents.some((d) => d.letterId === cert.id)).toBe(true);

    expect(hr().requestLetter({ kind: 'embassy', addressedTo: 'Embassy of Japan', purpose: 'Visa', includeSalary: false }).ok).toBe(false);
    const visa = hr().requestLetter({ kind: 'embassy', addressedTo: 'Embassy of Japan', purpose: 'Visa', includeSalary: false, country: 'Japan', travelFrom: mon(12), travelTo: mon(12, 4) });
    expect(visa.ok && !visa.issued).toBe(true);
    as('u-sara');
    expect(hr().decideLetter(visa.id!, 'issued').ok).toBe(true);
    expect(hr().documents.some((d) => d.letterId === visa.id)).toBe(true);
  });

  it('requires your exact full name to e-sign, and only your own documents', () => {
    as('u-mei');
    expect(hr().signDocument('doc-u-kwame-nda', 'Mei Tanaka').ok).toBe(false);
    as('u-kwame');
    expect(hr().signDocument('doc-u-kwame-nda', 'K Mensah').ok).toBe(false);
    expect(hr().signDocument('doc-u-kwame-nda', 'kwame mensah').ok).toBe(true);
    expect(hr().documents.find((d) => d.id === 'doc-u-kwame-nda')!.signature?.signedAt).toBeTruthy();
  });

  it('tracks policy versions: an updated mandatory policy needs re-acknowledging', () => {
    const tasks = (id: string) => mod.selectors.computeHrTasks(viewer(id), userOf(id), hr(), useTalent.getState().onboarding, hub().users);
    expect(tasks('u-mei').some((t) => t.id === 'policy-infosec')).toBe(true);
    as('u-mei');
    expect(hr().acknowledgePolicy('infosec').ok).toBe(true);
    expect(tasks('u-mei').some((t) => t.id === 'policy-infosec')).toBe(false);
  });
});

describe('new hires (offer → day 90)', () => {
  it('gives Kwame a guided to-do list: sign, enrol, policies and the open pulse', () => {
    const tasks = mod.selectors.computeHrTasks(viewer('u-kwame'), userOf('u-kwame'), hr(), useTalent.getState().onboarding, hub().users);
    const kinds = new Set(tasks.map((t) => t.kind));
    for (const k of ['sign', 'enrol', 'policy', 'pulse'] as const) expect(kinds.has(k)).toBe(true);
    expect(tasks.find((t) => t.kind === 'enrol')!.urgent).toBe(true);
  });

  it('accepts one pulse per milestone, only inside its window, only for new hires', () => {
    as('u-kwame');
    const scores = { welcome: 4, clarity: 4, tools: 3, belonging: 5 } as const;
    expect(hr().submitPulse({ milestone: 'day-30', scores, shareWithManager: false }).ok).toBe(true);
    expect(hr().submitPulse({ milestone: 'day-30', scores, shareWithManager: false }).ok).toBe(false);
    expect(hr().submitPulse({ milestone: 'day-60', scores, shareWithManager: false }).ok).toBe(false);
    as('u-mei');
    expect(hr().submitPulse({ milestone: 'day-30', scores, shareWithManager: false }).ok).toBe(false);
  });

  it('builds payslips from the accepted offer, pro-rating the first month', () => {
    const kwame = userOf('u-kwame');
    const comp = hr().comp.find((c) => c.userId === 'u-kwame')!;
    expect(comp.baseMonthly).toBe(28_000); // AED 336,000 offer ÷ 12
    const slips = mod.engine.payslipsFor(kwame, comp, { claims: hr().claims });
    expect(slips.length).toBeGreaterThan(0);
    const first = slips[slips.length - 1];
    expect(first.partial).toBe(true);
    expect(first.currency).toBe('AED');
    expect(first.earnings[0].amount).toBeLessThan(28_000);
  });

  it('creates HR records for a new hire provisioned from Talent Hub', () => {
    as('u-sara');
    expect(useTalent.getState().provisionHubAccount('j-1').ok).toBe(true);
    const salma = useTalent.getState().onboarding.find((j) => j.id === 'j-1')!.hubUserId!;
    hr().syncEmployees();
    const year = new Date().getFullYear();
    expect(hr().elections.find((e) => e.userId === salma && e.year === year)?.status).toBe('not-started');
    const contract = hr().documents.find((d) => d.userId === salma && d.kind === 'contract')!;
    expect(contract.signature?.required && !contract.signature.signedAt).toBe(true); // pre-boarding: sign before day one
    expect(hr().documents.some((d) => d.userId === salma && d.kind === 'offer' && d.offerId === 'of-3')).toBe(true);
    expect(hr().comp.some((c) => c.userId === salma)).toBe(true);
  });
});

describe('approvals & cases', () => {
  it('shows confidential cases to People Ops only, without details', () => {
    const items = (id: string) => mod.selectors.computeApprovals(viewer(id), hr(), hub().users);
    const sara = items('u-sara').find((i) => i.kind === 'case' && i.refId === 'case-3')!;
    expect(sara.title.startsWith('Confidential')).toBe(true);
    expect(sara.detail).not.toMatch(/partner|expecting/i);
    expect(items('u-omar').some((i) => i.kind === 'case')).toBe(false);
    expect(items('u-omar').some((i) => i.kind === 'leave' && i.refId === 'lv-01')).toBe(true);
    as('u-mei');
    expect(hr().replyCase('case-3', 'Hello').ok).toBe(false);
  });
});

describe('hub migration', () => {
  it('v2 → v3 adds HR operations to People Ops and the HR notification kind', () => {
    const s = mod.seed.createSeed();
    const v2 = {
      ...s,
      version: 2,
      roles: s.roles.map((r) => (r.id === 'people-ops' ? { ...r, permissions: r.permissions.filter((p) => p !== 'hr.people.manage') } : r)),
      notifications: s.notifications.filter((n) => n.kind !== 'hr'),
      prefs: Object.fromEntries(Object.entries(s.prefs).map(([id, p]) => [id, { ...p, notifyKinds: { ...p.notifyKinds, hr: undefined as unknown as boolean } }])),
    };
    const v3 = mod.hub.migrateV2toV3(v2);
    expect(v3.version).toBe(mod.seed.DATA_VERSION);
    expect(v3.roles.find((r) => r.id === 'people-ops')!.permissions).toContain('hr.people.manage');
    expect(Object.values(v3.prefs).every((p) => p.notifyKinds.hr === true)).toBe(true);
    expect(v3.notifications.some((n) => n.id === 'n-h1')).toBe(true);
  });
});
