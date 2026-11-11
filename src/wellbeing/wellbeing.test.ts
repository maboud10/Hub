/**
 * Helix Wellbeing tests: Recharge scoring, the check-in → Launchpad pulse vote,
 * Nova prescription rules, the calendar free-gap finder, the energy forecast,
 * breathing phase timing, streaks, Hub Cup logging, bridge days, the burnout
 * radar + pace index, k-anonymous manager aggregates, quiet hours persistence
 * through the bridge, the claim tracker, Care privacy and palette gating.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CalEventLite } from './types';

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
type Wb = typeof import('./store').useWellbeing;
let useHub: Hub;
let useWellbeing: Wb;
let engine: typeof import('./engine');
let seed: typeof import('./seed');
let bridge: typeof import('./public');
let rbac: typeof import('@/lib/rbac');

beforeAll(async () => {
  ({ useHub } = await import('@/store/hub'));
  ({ useWellbeing } = await import('./store'));
  engine = await import('./engine');
  seed = await import('./seed');
  bridge = await import('./public');
  rbac = await import('@/lib/rbac');
});

beforeEach(() => {
  useHub.getState().resetDemo();
  useWellbeing.getState().resetDemo();
  useHub.getState().logout();
});

const hub = () => useHub.getState();
const wb = () => useWellbeing.getState();
const viewerOf = (id: string) => {
  const user = hub().users.find((u) => u.id === id)!;
  return { user, roles: hub().roles, perms: rbac.effectivePermissions(user, hub().roles) };
};
const today = () => seed.isoDay(Date.now());

const ev = (id: string, startHour: number, durationMins: number, category = 'meet', attendeeIds = ['u-layla'], title = id): CalEventLite => ({
  id,
  title,
  category,
  dayOffset: 0,
  startHour,
  durationMins,
  organizerId: attendeeIds[0],
  attendeeIds,
});

/** Layla's seeded Calendar day: stand-up, NEOM call, deep work, design crit, 1:1. */
const LAYLA_DAY: CalEventLite[] = [
  ev('standup', 9.5, 30),
  ev('neom', 11, 60, 'customer'),
  ev('deep', 13, 90, 'focus'),
  ev('crit', 15, 45),
  ev('1on1', 16.5, 30, '1on1', ['u-layla', 'u-omar']),
  ev('omar-only', 14.5, 30, 'meet', ['u-omar']),
];

const heavyCtx = () => ({
  checkin: { mood: 3 as const, energy: 2 as const, stress: 4 as const, sleepHours: 5.5 },
  meeting: engine.meetingStats(LAYLA_DAY, 'u-layla'),
  gap: { dayOffset: 0, startHour: 14.5 },
  oneOnOne: null,
  focusRunning: false,
  freeNowMins: 0,
  daysSinceLeave: 122,
  daysUntilLeave: null,
  bridgeDay: { date: '2026-11-30', daysOff: 6, holiday: true },
  stepsToday: 6500,
  stepGoal: 8000,
  hourNow: 10,
  quietStart: 19,
});

describe('aura scoring', () => {
  it('scores dimensions and blends them into the Recharge score', () => {
    expect(engine.sleepScore(7.5)).toBe(100);
    expect(engine.sleepScore(5.5)).toBe(56);
    expect(engine.sleepScore(0)).toBe(0);
    const all = (v: number) => ({ sleep: v, movement: v, focus: v, connection: v, calm: v });
    expect(engine.rechargeScore(all(100))).toBe(100);
    expect(engine.rechargeScore(all(0))).toBe(0);
    // 0.26·56 + 0.18·49 + 0.20·88 + 0.14·60 + 0.22·59 = 62.36
    expect(engine.rechargeScore({ sleep: 56, movement: 49, focus: 88, connection: 60, calm: 59 })).toBe(62);
    expect(seed.DIMENSIONS.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 5);
  });

  it('marks dimensions as estimated until today’s check-in and explains the drivers', () => {
    const base = {
      stepsToday: 1800,
      stepGoal: 8000,
      weekActiveMins: 90,
      meeting: engine.meetingStats(LAYLA_DAY, 'u-layla'),
      oneOnOnesWeek: 1,
      circles: 1,
      kudos30d: 2,
      calmMinsWeek: 18,
      afterHours: 0,
    };
    const prev = { mood: 3 as const, energy: 3 as const, stress: 4 as const, sleepHours: 5.5 };
    const estimated = engine.readDimensions({ ...base, checkin: null, previous: prev });
    expect(estimated.find((r) => r.id === 'sleep')?.estimated).toBe(true);
    expect(estimated.find((r) => r.id === 'sleep')?.drivers.map((d) => d.label)).toContain('Sleep debt');
    const live = engine.readDimensions({ ...base, checkin: { ...prev, sleepHours: 8 }, previous: null });
    expect(live.find((r) => r.id === 'sleep')).toMatchObject({ score: 100, estimated: false });
    expect(live.find((r) => r.id === 'focus')?.drivers[0]).toMatchObject({ label: 'Meetings today', value: '4 · 2.8h' });
  });
});

describe('check-in', () => {
  it('replaces today’s entry and casts the anonymous Launchpad pulse vote', () => {
    expect(hub().login('u-mei').ok).toBe(true);
    wb().checkIn('u-mei', { mood: 4, energy: 4, stress: 2, sleepHours: 7.5 });
    expect(hub().pulse['u-mei']).toEqual({ date: today(), mood: 4 });
    wb().checkIn('u-mei', { mood: 2, energy: 2, stress: 4, sleepHours: 5, note: '  rough night  ' });
    const mine = wb().users['u-mei'].checkins.filter((c) => c.date === today());
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ mood: 2, note: 'rough night' });
    expect(hub().pulse['u-mei'].mood).toBe(2);
    // Another person's record is untouched.
    expect(wb().users['u-omar'].checkins.some((c) => c.date === today())).toBe(false);
  });

  it('prefills the mood from today’s Launchpad vote only', () => {
    const t = today();
    expect(engine.prefillMood({ 'u-omar': { date: t, mood: 5 } }, 'u-omar', t)).toBe(5);
    expect(engine.prefillMood({ 'u-omar': { date: engine.addDays(t, -1), mood: 5 } }, 'u-omar', t)).toBeNull();
    expect(engine.prefillMood({}, 'u-omar', t)).toBeNull();
  });

  it('counts streaks ending today or yesterday', () => {
    const t = '2026-11-11';
    const days = (...n: number[]) => n.map((d) => ({ date: engine.addDays(t, -d) }));
    expect(engine.checkinStreak(days(1, 2, 3), t)).toBe(3);
    expect(engine.checkinStreak(days(0, 1, 2, 3), t)).toBe(4);
    expect(engine.checkinStreak(days(0, 2, 3), t)).toBe(1);
    expect(engine.checkinStreak(days(2, 3), t)).toBe(0);
    // Seeded personas start with their streak intact (yesterday included).
    expect(engine.checkinStreak(wb().users['u-layla'].checkins, today())).toBe(6);
  });
});

describe('calendar gaps & forecast', () => {
  it('finds the free gap closest to 14:30 in a real calendar day', () => {
    const gap = engine.findFreeGap(LAYLA_DAY, { userId: 'u-layla', nowHour: 9.87, durationMins: 25 });
    expect(gap).toEqual({ dayOffset: 0, startHour: 14.5, endHour: 14.5 + 25 / 60 });
    const gaps = engine.freeGaps(LAYLA_DAY, { userId: 'u-layla', nowHour: 9.87 }).map((g) => [g.start, g.end]);
    expect(gaps).toEqual([
      [10, 11],
      [12, 13],
      [14.5, 15],
      [15.75, 16.5],
      [17, 18],
    ]);
  });

  it('never offers a slot in the past and returns null on a full day', () => {
    // 15:54 → the 35 minutes before the 16:30 1:1 still fit a reset (15:55).
    expect(engine.findFreeGap(LAYLA_DAY, { userId: 'u-layla', nowHour: 15.9, durationMins: 25 })?.startHour).toBeCloseTo(15 + 55 / 60, 5);
    // During the 1:1 → after it.
    expect(engine.findFreeGap(LAYLA_DAY, { userId: 'u-layla', nowHour: 16.6, durationMins: 25 })?.startHour).toBe(17);
    const full = [ev('all-day', 8, 600)];
    expect(engine.findFreeGap(full, { userId: 'u-layla', nowHour: 8, durationMins: 25 })).toBeNull();
    expect(engine.freeNowMinutes(LAYLA_DAY, 'u-layla', 10.25)).toBe(45);
    expect(engine.freeNowMinutes(LAYLA_DAY, 'u-layla', 11.5)).toBe(0);
  });

  it('forecasts the post-lunch dip and drains energy with meetings', () => {
    const mine = engine.userDayEvents(LAYLA_DAY, 'u-layla');
    const f = engine.energyForecast({ events: mine, checkin: { energy: 2, stress: 4, sleepHours: 5.5 } });
    expect(f.points[0].hour).toBe(7);
    expect(f.points[f.points.length - 1].hour).toBe(21);
    expect(f.dips.some((d) => d.hour >= 13 && d.hour <= 16 && d.reason === 'circadian')).toBe(true);
    expect(f.peak.start).toBeGreaterThanOrEqual(8);
    const busy = [ev('a', 9, 60), ev('b', 10, 60), ev('c', 11, 60)];
    expect(engine.energyAt(12, { events: busy, checkin: null })).toBeLessThan(engine.energyAt(12, { events: [], checkin: null }));
  });
});

describe('Nova recharge prescriptions', () => {
  it('prescribes a reset, a breather and a recharge day for a heavy, short-sleep day', () => {
    const rx = engine.prescribe(heavyCtx());
    expect(rx.map((r) => r.id)).toEqual(['reset', 'breathe', 'recharge-day']);
    expect(rx[0]).toMatchObject({ chip: '14:30', cta: 'Block it', payload: { dayOffset: 0, startHour: 14.5 } });
    expect(rx[0].facts).toEqual([
      { label: 'Meetings today', value: '2.8h' },
      { label: 'Sleep', value: '5.5h' },
    ]);
    expect(rx[2].payload?.date).toBe('2026-11-30');
  });

  it('escalates to Care on a drained day and stays light on a great one', () => {
    expect(engine.prescribe({ ...heavyCtx(), checkin: { mood: 1, energy: 1, stress: 5, sleepHours: 4 } })[0].id).toBe('care');
    const great = engine.prescribe({
      ...heavyCtx(),
      checkin: { mood: 5, energy: 5, stress: 1, sleepHours: 8 },
      meeting: engine.EMPTY_MEETINGS,
      gap: null,
      daysSinceLeave: 20,
      stepsToday: 9000,
    });
    expect(great.map((r) => r.id)).toEqual(['win']);
  });

  it('suggests walking a 1:1 on a low-step day and holds the recharge day when leave is booked', () => {
    const rx = engine.prescribe(
      { ...heavyCtx(), stepsToday: 1200, daysUntilLeave: 20, checkin: { mood: 3, energy: 3, stress: 3, sleepHours: 7 }, gap: null, oneOnOne: { eventId: '1on1', startHour: 16.5, dayOffset: 0, withName: 'Omar' } },
      9,
    );
    const walk = rx.find((r) => r.id === 'walk1on1');
    expect(walk).toMatchObject({ chip: 'Omar', payload: { eventId: '1on1' } });
    expect(walk?.facts[0]).toEqual({ label: '1:1 at', value: '16:30' });
    expect(rx.some((r) => r.id === 'recharge-day')).toBe(false);
    expect(engine.prescribe(heavyCtx(), 2)).toHaveLength(2);
  });

  it('finds a bridge day next to UAE National Day and reads leave history', () => {
    const uae = new Set(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(engine.bestBridgeDay('2026-11-11', uae)).toEqual({ date: '2026-11-30', daysOff: 6, holiday: true });
    expect(engine.bestBridgeDay('2026-11-11', new Set())).toEqual({ date: '2026-11-27', daysOff: 3, holiday: false });
    const leave = [
      { userId: 'u-x', type: 'annual', start: '2026-07-06', end: '2026-07-10', status: 'approved' },
      { userId: 'u-x', type: 'wfa', start: '2026-10-05', end: '2026-10-09', status: 'approved' },
      { userId: 'u-x', type: 'sick', start: '2026-11-02', end: '2026-11-02', status: 'approved' },
      { userId: 'u-x', type: 'annual', start: '2026-12-21', end: '2026-12-24', status: 'pending' },
    ];
    expect(engine.daysSinceLastLeave(leave, 'u-x', '2026-11-11')).toBe(124);
    expect(engine.daysUntilNextLeave(leave, 'u-x', '2026-11-11')).toBe(40);
    expect(engine.daysSinceLastLeave(leave, 'u-nobody', '2026-11-11')).toBeNull();
  });
});

describe('breathe & move', () => {
  it('times breathing phases for every pattern', () => {
    const box = seed.BREATH_PATTERN_BY_ID.box;
    expect(engine.phaseAt(box, 0)).toMatchObject({ phase: 'inhale', secsLeft: 4, cycle: 0 });
    expect(engine.phaseAt(box, 4)).toMatchObject({ phase: 'hold', index: 1 });
    expect(engine.phaseAt(box, 9.5)).toMatchObject({ phase: 'exhale', secsLeft: 2.5 });
    expect(engine.phaseAt(box, 16)).toMatchObject({ phase: 'inhale', cycle: 1 });
    expect(engine.cycleSecs(seed.BREATH_PATTERN_BY_ID.relax)).toBe(19);
    expect(engine.phaseAt(seed.BREATH_PATTERN_BY_ID.relax, 12)).toMatchObject({ phase: 'exhale', secsLeft: 7 });
    expect(engine.phaseAt(seed.BREATH_PATTERN_BY_ID.coherent, 6)).toMatchObject({ phase: 'exhale', secsLeft: 5 });
    expect(engine.sessionSecs(box, 2)).toBe(128);
    expect(engine.sessionCycles(seed.BREATH_PATTERN_BY_ID.energise, 1)).toBe(9);
  });

  it('logs activities into personal steps and the Hub Cup', () => {
    const before = engine.teamStandings(wb().challenge, wb().users).find((t) => t.id === 'dubai')!.km;
    const log = wb().logActivity('u-omar', { kind: 'walk', minutes: 30 });
    expect(log).toMatchObject({ steps: 3300, km: 2.54, teamId: 'dubai' });
    const after = engine.teamStandings(wb().challenge, wb().users).find((t) => t.id === 'dubai')!.km;
    expect(after).toBeCloseTo(before + 2.54, 1);
    expect(engine.stepsOn(wb().users['u-omar'], today(), Date.now())).toBeGreaterThanOrEqual(3300);
    expect(wb().logActivity('u-omar', { kind: 'run', minutes: 0 })).toBeNull();
    expect(engine.milestonesReached(0.62)).toBe(2);
    expect(engine.teamOf('Remote · Lisbon')).toBe('remote');
  });
});

describe('rhythm', () => {
  it('scores the burnout radar with clear thresholds', () => {
    expect([39, 40, 69, 70].map(engine.signalLevel)).toEqual(['ok', 'watch', 'watch', 'high']);
    const hot = engine.radarSignals({ afterHoursEmails: 6, afterHoursEvents: 2, meetingHoursPerDay: 6, focusHoursWeek: 1, weekendSessions: 5, daysSinceLeave: 122, unread: 30, avgReplyMins: 12 });
    const byId = Object.fromEntries(hot.map((s) => [s.id, s]));
    expect(byId.meetings).toMatchObject({ risk: 100, level: 'high', value: '6h' });
    expect(byId.leave).toMatchObject({ risk: 100, level: 'high', value: '122d' });
    expect(byId.afterHours.risk).toBe(60);
    expect(byId.focus.level).toBe('high');
    const calm = engine.radarSignals({ afterHoursEmails: 0, afterHoursEvents: 0, meetingHoursPerDay: 1.5, focusHoursWeek: 12, weekendSessions: 0, daysSinceLeave: 10, unread: 0, avgReplyMins: 0 });
    expect(calm.every((s) => s.level === 'ok')).toBe(true);
    expect(engine.paceIndex(calm)).toBe(100);
    expect(engine.paceIndex(hot)).toBeLessThan(30);
    expect(engine.paceBand(engine.paceIndex(hot))).toBe('Running hot');
  });

  it('only shows anonymised team aggregates at k ≥ 5', () => {
    const value = (m: string, w: number, s: Parameters<typeof engine.syntheticRisk>[2]) => engine.syntheticRisk(m, w, s);
    expect(engine.teamHeatmap(['a', 'b', 'c', 'd'], 6, value)).toBeNull();
    const map = engine.teamHeatmap(['a', 'b', 'c', 'd', 'e'], 6, value)!;
    expect(map.n).toBe(5);
    expect(map.weeks).toHaveLength(6);
    expect(map.weeks[5].label).toBe('This week');
    expect(map.weeks.map((w) => w.ago)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(Object.values(map.weeks[0].cells).every((v) => v % 5 === 0)).toBe(true);

    const users = hub().users;
    const omar = engine.managerScope('u-omar', viewerOf('u-omar').perms, users);
    expect(omar.kind).toBe('team');
    expect(omar.memberIds.sort()).toEqual(['u-alex', 'u-hana', 'u-kwame', 'u-lucas', 'u-mei', 'u-priya']);
    const aisha = engine.managerScope('u-aisha', viewerOf('u-aisha').perms, users);
    expect(aisha.memberIds).toHaveLength(3);
    expect(engine.teamHeatmap(aisha.memberIds, 6, value)).toBeNull();
    expect(engine.canSeeTeamView('u-mei', viewerOf('u-mei').perms, users)).toBe(false);
    expect(engine.managerScope('u-layla', viewerOf('u-layla').perms, users).kind).toBe('team');
  });

  it('gives every person a stable anonymous circle alias, grammatical in Arabic', () => {
    const en = seed.circleAlias('u-daniel');
    expect(en).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(seed.circleAlias('u-daniel')).toBe(en);
    expect(en).not.toMatch(/daniel|okafor/i);
    const ar = seed.circleAlias('u-daniel', 'ar');
    expect(ar).toMatch(/^[\u0600-\u06FF]+ [\u0600-\u06FF\u0651]+$/);
    // Arabic puts the noun first and the adjective agrees with it: feminine nouns take ta marbuta.
    const FEMININE = new Set(['مها', 'بومة', 'سلحفاة']);
    const ids = ['u-layla', 'u-omar', 'u-mei', 'u-priya', 'u-hana', 'u-noah', 'u-sara', 'u-lucas', 'u-daniel', 'u-kwame'];
    for (const id of ids) {
      const [noun, adj] = seed.circleAlias(id, 'ar').split(' ');
      expect(adj.endsWith('ة')).toBe(FEMININE.has(noun));
    }
  });

  it('persists quiet hours per person and serves them through the bridge', () => {
    expect(bridge.api.quietHours(viewerOf('u-omar'))).toMatchObject({ enabled: true, startHour: 19, endHour: 8 });
    wb().setQuietHours('u-omar', { startHour: 20, endHour: 7, weekendsOff: false });
    expect(bridge.api.quietHours(viewerOf('u-omar'))).toMatchObject({ enabled: true, startHour: 20, endHour: 7, weekendsOff: false });
    expect(bridge.api.quietHours(viewerOf('u-mei'))).toMatchObject({ startHour: 19, endHour: 8 });
    expect(mem.get('nexus-wellbeing-v1')).toContain('"startHour":20');
    const q = wb().users['u-omar'].quiet;
    expect(engine.isQuietAt(q, new Date(2026, 10, 11, 21, 0))).toBe(true);
    expect(engine.isQuietAt(q, new Date(2026, 10, 11, 12, 0))).toBe(false);
    expect(engine.isQuietAt({ ...q, weekendsOff: true }, new Date(2026, 10, 14, 12, 0))).toBe(true);
    expect(engine.quietSpanHours(q)).toBe(11);
  });
});

describe('perks, care & bridge', () => {
  it('walks claims through the reimbursement tracker and the wallet', () => {
    expect(engine.claimTracker('submitted')).toEqual({ current: 1, state: 'active' });
    expect(engine.claimTracker('approved')).toEqual({ current: 3, state: 'active' });
    expect(engine.claimTracker('paid')).toEqual({ current: 4, state: 'done' });
    expect(engine.claimTracker('rejected')).toEqual({ current: 1, state: 'blocked' });
    expect(engine.nextClaimStatus('submitted', 'approve')).toBe('approved');
    expect(engine.nextClaimStatus('submitted', 'pay')).toBe('submitted');
    expect(engine.nextClaimStatus('approved', 'pay')).toBe('paid');
    expect(engine.nextClaimStatus('paid', 'reject')).toBe('paid');

    const before = engine.walletSummary(wb().users['u-layla'].claims);
    expect(before).toMatchObject({ allowance: 3000, spent: 450, pending: 320, remaining: 2230 });
    const c = wb().submitClaim('u-layla', { merchant: 'Oryx Strength Lab', category: 'fitness', amount: 560, date: today(), description: 'Membership', receiptName: 'oryx.pdf' })!;
    expect(c.status).toBe('submitted');
    expect(engine.walletSummary(wb().users['u-layla'].claims).remaining).toBe(1670);
    wb().syncClaim('u-layla', c.id, { status: 'approved', payrollMonth: '2026-11' });
    expect(wb().users['u-layla'].claims.find((x) => x.id === c.id)).toMatchObject({ status: 'approved', payrollMonth: '2026-11' });
    expect(wb().submitClaim('u-layla', { merchant: 'X', category: 'fitness', amount: 10, date: today(), description: '', receiptName: '' })).toBeNull();
  });

  it('keeps Care private: generic calendar holds and language-first matching', () => {
    const now = new Date(2026, 10, 11, 9, 0).getTime();
    const hold = engine.privateHold(new Date(2026, 10, 12, 18, 0).getTime(), 'u-layla', now);
    expect(hold).toMatchObject({ title: 'Personal appointment', dayOffset: 1, startHour: 18, attendeeIds: ['u-layla'] });
    expect('linkedContext' in hold).toBe(false);
    expect(JSON.stringify(hold)).not.toMatch(/care|counsel|wellbeing|stress/i);
    const ar = engine.rankCounsellors(seed.COUNSELLORS, { topic: 'finances', language: 'ar', format: 'phone' });
    expect(ar.every((m) => m.counsellor.languages.includes('ar'))).toBe(true);
    expect(ar[0].counsellor.id).toBe('cs-yara');
    expect(engine.careTracker(null)).toEqual({ current: 0, state: 'active' });

    const b = wb().requestCare('u-layla', { topic: 'stress', language: 'en', format: 'video' });
    expect(engine.careTracker(b).current).toBe(1);
    wb().bookCare('u-layla', b.id, 'cs-noor', now + 86_400_000, true);
    wb().completeCareSession('u-layla', b.id);
    expect(wb().users['u-layla'].care.find((x) => x.id === b.id)?.stage).toBe(3);
    wb().closeCare('u-layla', b.id);
    expect(engine.careTracker(wb().users['u-layla'].care.find((x) => x.id === b.id)!)).toEqual({ current: 4, state: 'done' });
  });

  it('gates palette entries on app:wellness and keeps Care entries discreet', () => {
    expect(bridge.api.paletteEntries(viewerOf('u-alex'))).toEqual([]);
    const mei = bridge.api.paletteEntries(viewerOf('u-mei'));
    expect(mei.find((e) => e.id === 'wellbeing:checkin')).toMatchObject({ group: 'Actions', to: '/wellbeing?checkin=1' });
    expect(mei.some((e) => e.id === 'wellbeing:challenge:singapore')).toBe(true);
    expect(bridge.api.paletteEntries(viewerOf('u-layla')).length).toBeGreaterThanOrEqual(6);
    const daniel = bridge.api.paletteEntries(viewerOf('u-daniel'));
    const session = daniel.find((e) => e.id.startsWith('wellbeing:care:'));
    expect(session?.title).toBe('Your confidential session');
    expect(`${session?.title} ${session?.subtitle}`).not.toMatch(/stress|james|whitfield/i);
    // Nobody else's care shows up in Mei's palette.
    expect(mei.some((e) => e.id.startsWith('wellbeing:care:'))).toBe(false);
  });

  it('returns the viewer’s Recharge score only after today’s check-in', () => {
    const mei = viewerOf('u-mei');
    expect(bridge.api.rechargeScore(mei)).toBeNull();
    wb().checkIn('u-mei', { mood: 4, energy: 4, stress: 2, sleepHours: 7.5 });
    const score = bridge.api.rechargeScore(mei);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0);
    expect(score!).toBeLessThanOrEqual(100);
    wb().recordScore('u-mei', 77);
    expect(bridge.api.rechargeScore(mei)).toBe(77);
    expect(bridge.api.rechargeScore(viewerOf('u-alex'))).toBeNull();
  });

  it('earns recharge credits from streaks, calm minutes and activities', () => {
    const layla = wb().users['u-layla'];
    const base = engine.creditsEarned(layla, today(), 2);
    expect(base.breakdown.find((b) => b.label === 'Team milestones')?.credits).toBe(100);
    expect(base.breakdown.find((b) => b.label === 'Check-in streak bonus')?.credits).toBe(60);
    wb().logBreath('u-layla', 'box', 5);
    expect(engine.creditsEarned(wb().users['u-layla'], today(), 2).total).toBe(base.total + 5);
  });
});
