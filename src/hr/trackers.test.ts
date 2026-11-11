/**
 * HR journey tracker derivations (`trackers.ts`): stages, live stage, mood,
 * who is named in the status line, ETA and courier position for time off,
 * allowance claims, letters and benefits enrolment — for the requester and
 * for whoever decides in the approvals inbox.
 */
import { describe, expect, it } from 'vitest';
import type { User } from '@/types';
import { addDaysISO, todayISO } from './calendar';
import { awayUntil, claimTrack, courier, durationLabel, electionTrack, leaveTrack, letterTrack, peopleOpsDesk, trackText, type TrackContext } from './trackers';
import type { BenefitClaim, BenefitElection, LeaveRequest, LetterRequest } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const TODAY = todayISO(NOW);

const person = (id: string, name: string, department: User['department'], extra: Partial<User> = {}): User =>
  ({
    id,
    name,
    email: `${id}@helix.test`,
    title: 'Team member',
    department,
    location: 'Dubai',
    timezone: 'Asia/Dubai',
    roleIds: [],
    grants: [],
    active: true,
    presence: 'online',
    avatarHue: 200,
    skills: [],
    phone: '',
    employeeId: id,
    startDate: '2021-01-10',
    ...extra,
  }) as User;

const layla = person('u-layla', 'Layla Haddad', 'IT & Security');
const sara = person('u-sara', 'Sara Al Mansoori', 'People Ops', { managerId: 'u-layla' });
const fatima = person('u-fatima', 'Fatima Zahra', 'People Ops', { managerId: 'u-sara' });
const omar = person('u-omar', 'Omar Khalid', 'Engineering', { managerId: 'u-layla' });
const mei = person('u-mei', 'Mei Tanaka', 'Design', { managerId: 'u-omar' });
const users = [layla, sara, fatima, omar, mei];
/** Holders of `hr.people.manage`: the admin (via `*`) and the People Ops team. */
const peopleOps = [layla, sara, fatima];

const ctx = (extra: Partial<TrackContext> = {}): TrackContext => ({ now: NOW, users, peopleOps, leave: [], ...extra });

const leave = (extra: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'lv-x',
  userId: 'u-mei',
  type: 'annual',
  start: addDaysISO(TODAY, 21),
  end: addDaysISO(TODAY, 25),
  days: 5,
  status: 'pending',
  approverId: 'u-omar',
  createdAt: NOW - 12 * HOUR,
  ...extra,
});

const claim = (extra: Partial<BenefitClaim> = {}): BenefitClaim => ({
  id: 'cl-x',
  userId: 'u-mei',
  allowance: 'learning',
  amount: 1450,
  currency: 'AED',
  merchant: 'Figma',
  description: 'Config conference ticket',
  receiptName: 'ticket.pdf',
  date: addDaysISO(TODAY, -2),
  status: 'submitted',
  createdAt: NOW - DAY,
  ...extra,
});

const letter = (extra: Partial<LetterRequest> = {}): LetterRequest => ({
  id: 'ltr-x',
  userId: 'u-mei',
  kind: 'embassy',
  addressedTo: 'Embassy of Japan',
  purpose: 'Tourist visa',
  includeSalary: false,
  status: 'pending',
  reference: 'HX-LTR-2026-0044',
  verifyCode: 'AB12-CD34',
  createdAt: NOW - 2 * HOUR,
  ...extra,
});

const election = (extra: Partial<BenefitElection> = {}): BenefitElection => ({
  id: 'u-mei-2026',
  userId: 'u-mei',
  year: 2026,
  health: 'plus',
  dental: false,
  vision: true,
  lifeMultiple: 2,
  dependents: [],
  status: 'submitted',
  submittedAt: NOW - 2 * HOUR,
  ...extra,
});

describe('time-off tracker', () => {
  it('names the manager reviewing it, with an ETA and a courier from the elapsed time', () => {
    const t = leaveTrack(leave(), ctx())!;
    expect(t.stages.map((s) => s.label)).toEqual(['Submitted', 'Manager review', 'Approved & synced']);
    expect([t.current, t.state, t.inFlight]).toEqual([1, 'active', true]);
    expect(t.stages[0].at).toBe('12h ago');
    expect(t.stages[1].sub).toBe('Omar Khalid');
    expect(trackText(t)).toBe('Omar is reviewing your request — usually decides within 2 days');
    expect(t.message[0]).toEqual({ text: 'Omar', who: true });
    expect(t.eta).toBe('ETA · 2d');
    expect(t.progress).toBeCloseTo(0.25);
  });

  it('runs late after the 2-day promise and opens up to People Ops after 3 days', () => {
    const t = leaveTrack(leave({ createdAt: NOW - 4 * DAY }), ctx())!;
    expect(t.eta).toBe('Running late');
    expect(t.progress).toBe(0.9);
    expect(trackText(t)).toBe('Omar hasn’t decided yet — People Ops can now step in too');
  });

  it('pauses while the approver is away', () => {
    const away: LeaveRequest = leave({ id: 'lv-omar', userId: 'u-omar', approverId: 'u-layla', status: 'approved', start: addDaysISO(TODAY, -1), end: addDaysISO(TODAY, 2) });
    expect(awayUntil('u-omar', [away], TODAY)).toBe(addDaysISO(TODAY, 2));
    expect(awayUntil('u-omar', [{ ...away, halfDay: 'am', start: TODAY, end: TODAY }], TODAY)).toBeNull();
    const t = leaveTrack(leave(), ctx({ leave: [away] }))!;
    expect(t.state).toBe('paused');
    expect(t.eta).toBeUndefined();
    expect(trackText(t)).toMatch(/^Omar is away until .+ — People Ops can step in if it can’t wait$/);
  });

  it('routes requests without a manager to People Ops, never to the requester', () => {
    const t = leaveTrack(leave({ userId: 'u-omar', approverId: undefined }), ctx())!;
    expect(t.stages[1]).toMatchObject({ label: 'People Ops review', sub: 'People Ops' });
    expect(trackText(t)).toBe('Sara or Fatima in People Ops will review your request — usually within 2 days');
    const own = leaveTrack(leave({ userId: 'u-sara', approverId: undefined }), ctx())!;
    expect(trackText(own)).toBe('Fatima in People Ops will review your request — usually within 2 days');
    expect(peopleOpsDesk(peopleOps, 'u-sara').map((u) => u.id)).toEqual(['u-fatima']);
    expect(peopleOpsDesk([layla, { ...sara, active: false }], 'u-mei').map((u) => u.id)).toEqual(['u-layla']);
  });

  it('completes when approved, blocks when declined and has no tracker once cancelled', () => {
    const approved = leaveTrack(leave({ status: 'approved', decidedBy: 'u-omar', decidedAt: NOW - HOUR }), ctx())!;
    expect([approved.current, approved.state, approved.inFlight]).toEqual([3, 'done', false]);
    expect(approved.stages[1]).toMatchObject({ label: 'Manager review', sub: 'Omar Khalid', at: '1h ago' });
    expect(trackText(approved)).toBe('Approved by Omar — synced to the team calendar');

    const instant = leaveTrack(leave({ type: 'sick', status: 'approved', decidedBy: 'system', decidedAt: NOW }), ctx())!;
    expect(instant.stages[1]).toMatchObject({ label: 'Auto-approved', sub: 'Within policy' });
    expect(trackText(instant)).toBe('Approved instantly — synced to the team calendar');

    const onBehalf = leaveTrack(leave({ status: 'approved', decidedBy: 'u-sara', decidedAt: NOW }), ctx())!;
    expect(onBehalf.stages[1]).toMatchObject({ label: 'People Ops review', sub: 'Sara Al Mansoori' });

    const declined = leaveTrack(leave({ status: 'rejected', decidedBy: 'u-omar', decidedAt: NOW, decisionNote: 'Release week' }), ctx())!;
    expect([declined.current, declined.state, declined.inFlight]).toEqual([1, 'blocked', false]);
    expect(declined.stages[1].label).toBe('Declined');
    expect(trackText(declined)).toBe('Declined by Omar — pick new dates whenever you’re ready');

    expect(leaveTrack(leave({ status: 'cancelled' }), ctx())).toBeNull();
  });

  it('tells the approver it is waiting on them, and People Ops who it is waiting on', () => {
    const forOmar = leaveTrack(leave(), ctx({ viewerId: 'u-omar' }))!;
    expect(forOmar.stages[1].sub).toBe('You');
    expect(trackText(forOmar)).toBe('Mei is waiting on you');
    expect(forOmar.eta).toBeUndefined();
    const forSara = leaveTrack(leave(), ctx({ viewerId: 'u-sara' }))!;
    expect(forSara.stages[1].sub).toBe('Omar Khalid');
    expect(trackText(forSara)).toBe('Mei is waiting on Omar — you can step in as People Ops');
    expect(trackText(leaveTrack(leave({ createdAt: NOW - 3 * DAY }), ctx({ viewerId: 'u-omar' }))!)).toBe('Mei is waiting on you — it’s taking longer than usual');
  });
});

describe('claim tracker', () => {
  it('moves from receipt check to payroll to paid', () => {
    const submitted = claimTrack(claim(), ctx());
    expect(submitted.stages.map((s) => s.label)).toEqual(['Submitted', 'Receipt check', 'Payroll', 'Paid']);
    expect([submitted.current, submitted.state, submitted.inFlight]).toEqual([1, 'active', true]);
    expect(trackText(submitted)).toBe('Sara or Fatima in People Ops will check your receipt — usually within 3 days');
    expect(submitted.eta).toBe('ETA · 2d');
    expect(submitted.progress).toBeCloseTo(1 / 3);

    const late = claimTrack(claim({ createdAt: NOW - 5 * DAY }), ctx());
    expect(late.eta).toBe('Running late');
    expect(trackText(late)).toBe('Sara or Fatima in People Ops will check your receipt — it’s taking longer than usual');

    const approved = claimTrack(claim({ status: 'approved', reviewerId: 'u-sara', decidedAt: NOW - DAY, payrollMonth: '2026-11' }), ctx());
    expect([approved.current, approved.state, approved.inFlight]).toEqual([2, 'active', true]);
    expect(approved.stages[1]).toMatchObject({ label: 'Receipt check', sub: 'Sara Al Mansoori', at: '1d ago' });
    expect(approved.stages[3].at).toBeTruthy();
    expect(approved.eta).toMatch(/^ETA · /);
    expect(approved.progress).toBe(0.1);
    expect(trackText(approved)).toBe('Approved by Sara — it lands with your next salary 💸');

    const paid = claimTrack(claim({ status: 'paid', reviewerId: 'u-sara', decidedAt: NOW - 20 * DAY, payrollMonth: '2026-10' }), ctx());
    expect([paid.current, paid.state, paid.inFlight]).toEqual([4, 'done', false]);
  });

  it('blocks a declined claim at the receipt check', () => {
    const t = claimTrack(claim({ status: 'rejected', reviewerId: 'u-sara', decidedAt: NOW, note: 'Laptops are provided by IT.' }), ctx());
    expect([t.current, t.state, t.inFlight]).toEqual([1, 'blocked', false]);
    expect(t.stages[1].label).toBe('Declined');
    expect(trackText(t)).toBe('Declined by Sara — see the note for what would work');
  });
});

describe('letter tracker', () => {
  it('waits on People Ops for reviewed letters', () => {
    const t = letterTrack(letter(), ctx());
    expect(t.stages.map((s) => s.label)).toEqual(['Requested', 'People Ops review', 'Ready to download']);
    expect([t.current, t.state]).toEqual([1, 'active']);
    expect(t.eta).toBe('ETA · 22h');
    expect(trackText(t)).toBe('Sara or Fatima in People Ops will prepare and sign it — usually within 1 working day');
    expect(trackText(letterTrack(letter(), ctx({ viewerId: 'u-fatima' })))).toBe('Mei is waiting on you');
  });

  it('is complete once issued (instantly or signed) and blocked when declined', () => {
    const instant = letterTrack(letter({ kind: 'salary-certificate', status: 'issued', issuedBy: 'auto', issuedAt: NOW }), ctx());
    expect([instant.current, instant.state]).toEqual([3, 'done']);
    expect(instant.stages[1].label).toBe('Generated instantly');
    expect(trackText(instant)).toBe('Generated instantly — ready to download');

    const signed = letterTrack(letter({ status: 'issued', issuedBy: 'u-fatima', issuedAt: NOW - HOUR }), ctx());
    expect(signed.stages[2].sub).toBe('HX-LTR-2026-0044');
    expect(trackText(signed)).toBe('Signed by Fatima — ready to download');

    const declined = letterTrack(letter({ status: 'rejected', note: 'Please confirm your travel dates first' }), ctx());
    expect([declined.current, declined.state, declined.stages[1].label]).toEqual([1, 'blocked', 'Declined']);
  });
});

describe('benefits enrolment tracker', () => {
  it('waits on People Ops, completes when confirmed, and does not exist before you enrol', () => {
    const t = electionTrack(election(), ctx())!;
    expect(t.stages.map((s) => s.label)).toEqual(['Submitted', 'People Ops confirms', 'Card goes live']);
    expect(t.stages[1].sub).toBe('Usually within a day');
    expect(t.eta).toBe('ETA · 22h');
    expect(trackText(t)).toBe('Sara or Fatima in People Ops will confirm your choices with the insurer — usually within a day');
    expect(electionTrack(election({ submittedAt: NOW - 2 * DAY }), ctx())!.eta).toBe('Running late');

    const done = electionTrack(election({ status: 'confirmed', confirmedBy: 'u-fatima', confirmedAt: NOW, memberNumber: 'DM-1234' }), ctx())!;
    expect([done.current, done.state, done.stages[2].sub]).toEqual([3, 'done', 'DM-1234']);
    expect(trackText(done)).toBe('Confirmed by Fatima — your digital card is live 🎉');

    expect(electionTrack(election({ status: 'not-started', submittedAt: undefined }), ctx())).toBeNull();
  });
});

describe('tracker maths', () => {
  it('keeps durations short and the courier inside its segment', () => {
    expect(durationLabel(20 * 60_000)).toBe('20m');
    expect(durationLabel(5 * HOUR)).toBe('5h');
    expect(durationLabel(36 * HOUR)).toBe('2d');
    expect(courier(NOW, 48, NOW)).toBe(0.1);
    expect(courier(NOW - 24 * HOUR, 48, NOW)).toBeCloseTo(0.5);
    expect(courier(NOW - 30 * DAY, 48, NOW)).toBe(0.9);
  });
});
