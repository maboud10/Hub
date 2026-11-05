/**
 * HR Portal demo data, generated relative to "now" so the story always works:
 * Mei's pending trip (Omar approves), Fatima's exam leave (Sara approves),
 * Mateo out this week, Kwame (day ~26) with an unsigned IP agreement, benefits
 * enrolment due within days and his 30-day pulse open, a confidential
 * parental-leave case, and People Ops queues for claims, letters and benefits.
 */
import type { User } from '@/types';
import { SEED_USERS } from '@/data/users';
import { HR_DATA_VERSION, POLICIES } from './constants';
import { addDaysISO, holidaySet, isWeekend, parseISODate, startOfWeek, toISODate, workingDays } from './calendar';
import { letterReference, verificationCode } from './engine';
import type {
  BenefitClaim,
  BenefitElection,
  CompRecord,
  Dependent,
  EmployeeDocument,
  HealthTier,
  HrCase,
  HrData,
  LeaveAdjustment,
  LeaveRequest,
  LeaveStatus,
  LeaveTypeId,
  LetterRequest,
  PolicyAck,
  PulseResponse,
} from './types';

const DAY = 86_400_000;

/** Monthly pay (sensitive). Kwame's comes from his accepted Talent Hub offer (of-4, AED 336k / year). */
const COMP: Omit<CompRecord, 'payDay'>[] = [
  { userId: 'u-layla', currency: 'AED', baseMonthly: 52_000, housingMonthly: 14_000, transportMonthly: 3_000, pensionRate: 0, bank: { name: 'Emirates NBD', ibanLast4: '4821' } },
  { userId: 'u-sara', currency: 'AED', baseMonthly: 38_000, housingMonthly: 10_000, transportMonthly: 2_500, pensionRate: 0, bank: { name: 'Mashreq', ibanLast4: '1173' } },
  { userId: 'u-omar', currency: 'AED', baseMonthly: 42_000, housingMonthly: 12_000, transportMonthly: 2_500, pensionRate: 0, bank: { name: 'ADCB', ibanLast4: '9034' } },
  { userId: 'u-fatima', currency: 'AED', baseMonthly: 24_000, housingMonthly: 7_000, transportMonthly: 2_000, pensionRate: 0, bank: { name: 'Emirates NBD', ibanLast4: '6650' } },
  { userId: 'u-mateo', currency: 'AED', baseMonthly: 21_000, housingMonthly: 6_000, transportMonthly: 1_500, pensionRate: 0, bank: { name: 'FAB', ibanLast4: '3307' } },
  { userId: 'u-kwame', currency: 'AED', baseMonthly: 28_000, housingMonthly: 0, transportMonthly: 0, pensionRate: 0, bank: { name: 'Standard Chartered', ibanLast4: '5512' } },
  { userId: 'u-daniel', currency: 'GBP', baseMonthly: 6_200, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.05, bank: { name: 'Barclays', ibanLast4: '2210' } },
  { userId: 'u-aisha', currency: 'GBP', baseMonthly: 7_900, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.05, bank: { name: 'Monzo', ibanLast4: '7781' } },
  { userId: 'u-mei', currency: 'SGD', baseMonthly: 11_500, housingMonthly: 0, transportMonthly: 0, pensionRate: 0, bank: { name: 'DBS', ibanLast4: '0042' } },
  { userId: 'u-hana', currency: 'SGD', baseMonthly: 8_800, housingMonthly: 0, transportMonthly: 0, pensionRate: 0, bank: { name: 'OCBC', ibanLast4: '1290' } },
  { userId: 'u-grace', currency: 'SGD', baseMonthly: 14_200, housingMonthly: 0, transportMonthly: 0, pensionRate: 0, bank: { name: 'UOB', ibanLast4: '5528' } },
  { userId: 'u-priya', currency: 'INR', baseMonthly: 520_000, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.12, bank: { name: 'HDFC Bank', ibanLast4: '8814' } },
  { userId: 'u-lucas', currency: 'EUR', baseMonthly: 7_400, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.093, bank: { name: 'N26', ibanLast4: '3141' } },
  { userId: 'u-sofia', currency: 'EUR', baseMonthly: 5_600, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.0919, bank: { name: 'Intesa Sanpaolo', ibanLast4: '6602' } },
  { userId: 'u-noah', currency: 'USD', baseMonthly: 9_800, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.06, bank: { name: 'Chase', ibanLast4: '4410' } },
  { userId: 'u-ethan', currency: 'CAD', baseMonthly: 10_400, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.0595, bank: { name: 'RBC', ibanLast4: '9925' } },
  { userId: 'u-yusuf', currency: 'TRY', baseMonthly: 165_000, housingMonthly: 0, transportMonthly: 0, pensionRate: 0.14, bank: { name: 'Garanti BBVA', ibanLast4: '2735' } },
];

/** People who use the HR Portal (contractors are managed by their agency). */
export const isEmployee = (u: Pick<User, 'roleIds' | 'active'>) => u.active && !u.roleIds.includes('contractor');

export function createHrSeed(now = Date.now(), users: User[] = SEED_USERS): HrData {
  const today = toISODate(now);
  const year = new Date(now).getFullYear();
  const ago = (days: number) => now - days * DAY;
  const userOf = new Map(users.map((u) => [u.id, u]));
  const employees = users.filter(isEmployee);
  /** Monday of the week `weeks` from this week, plus `plus` days. */
  const mon = (weeks: number, plus = 0) => addDaysISO(startOfWeek(today), weeks * 7 + plus);
  let prev = addDaysISO(today, -1);
  while (isWeekend(prev)) prev = addDaysISO(prev, -1);
  const lastWorkingDay = prev;

  // ───────────── time off ─────────────
  const L = (
    id: string,
    userId: string,
    type: LeaveTypeId,
    start: string,
    end: string,
    status: LeaveStatus,
    o: Partial<Pick<LeaveRequest, 'reason' | 'coverId' | 'halfDay' | 'decisionNote' | 'attachmentName' | 'decidedBy'>> & { createdDaysAgo?: number; decidedDaysAgo?: number } = {},
  ): LeaveRequest => {
    const u = userOf.get(userId)!;
    const decided = status === 'approved' || status === 'rejected';
    return {
      id,
      userId,
      type,
      start,
      end,
      halfDay: o.halfDay,
      days: workingDays(start, end, holidaySet(u.location), o.halfDay),
      reason: o.reason,
      coverId: o.coverId,
      attachmentName: o.attachmentName,
      status,
      approverId: u.managerId,
      decidedBy: decided ? (o.decidedBy ?? u.managerId ?? 'u-sara') : undefined,
      decidedAt: decided ? ago(o.decidedDaysAgo ?? Math.max(1, (o.createdDaysAgo ?? 14) - 1)) : undefined,
      decisionNote: o.decisionNote,
      createdAt: ago(o.createdDaysAgo ?? 14),
    };
  };

  const leave: LeaveRequest[] = [
    // awaiting a decision (approvals demo)
    L('lv-01', 'u-mei', 'annual', mon(3), mon(3, 4), 'pending', { reason: 'Family trip to Kyoto 🍁', coverId: 'u-hana', createdDaysAgo: 1 }),
    L('lv-02', 'u-lucas', 'wfa', mon(4), mon(4, 4), 'pending', { reason: 'Working from Lisbon for a week', createdDaysAgo: 0.1 }),
    L('lv-03', 'u-noah', 'annual', mon(6), mon(7, 4), 'pending', { reason: 'Holidays in Seoul', coverId: 'u-yusuf', createdDaysAgo: 2 }),
    L('lv-04', 'u-fatima', 'study', mon(2), mon(2, 1), 'pending', { reason: 'CIPD Level 7 exams', createdDaysAgo: 1 }),
    L('lv-05', 'u-omar', 'annual', mon(5), mon(5, 3), 'pending', { reason: 'School holidays with the kids', coverId: 'u-priya', createdDaysAgo: 0.5 }),
    // approved, this week or coming up
    L('lv-06', 'u-mateo', 'annual', mon(0), mon(0, 4), 'approved', { reason: 'Moving house', createdDaysAgo: 22, decidedDaysAgo: 21 }),
    L('lv-07', 'u-hana', 'sick', lastWorkingDay, lastWorkingDay, 'approved', { decidedBy: 'system', createdDaysAgo: 1, decidedDaysAgo: 1 }),
    L('lv-08', 'u-priya', 'annual', mon(1), mon(1, 4), 'approved', { reason: 'Diwali with family 🪔', coverId: 'u-lucas', createdDaysAgo: 12, decidedDaysAgo: 10 }),
    L('lv-09', 'u-grace', 'wfa', mon(1, 2), mon(1, 3), 'approved', { reason: 'Visiting family in Penang', createdDaysAgo: 7, decidedDaysAgo: 6 }),
    L('lv-10', 'u-sofia', 'annual', mon(2, 3), mon(2, 4), 'approved', { reason: 'Long weekend in Rome', createdDaysAgo: 6, decidedDaysAgo: 5 }),
    L('lv-11', 'u-aisha', 'annual', mon(3, 3), mon(3, 4), 'approved', { reason: 'Friend’s wedding', createdDaysAgo: 9, decidedDaysAgo: 8 }),
    L('lv-12', 'u-sara', 'annual', mon(7), mon(8, 4), 'approved', { reason: 'Year-end break', coverId: 'u-fatima', decidedBy: 'u-layla', createdDaysAgo: 21, decidedDaysAgo: 20 }),
    // history this year (drives balances)
    L('lv-20', 'u-omar', 'annual', mon(-17), mon(-16, 4), 'approved', { reason: 'Summer holiday', createdDaysAgo: 150 }),
    L('lv-21', 'u-mei', 'annual', mon(-30), mon(-30, 4), 'approved', { reason: 'Chinese New Year', createdDaysAgo: 230 }),
    L('lv-22', 'u-mei', 'sick', mon(-12, 2), mon(-12, 2), 'approved', { decidedBy: 'system', createdDaysAgo: 82 }),
    L('lv-23', 'u-priya', 'annual', mon(-26), mon(-26, 4), 'approved', { reason: 'Family wedding', createdDaysAgo: 200 }),
    L('lv-24', 'u-priya', 'wfa', mon(-9), mon(-9, 4), 'cancelled', { reason: 'Work from Goa', createdDaysAgo: 70 }),
    L('lv-25', 'u-lucas', 'annual', mon(-20), mon(-19, 4), 'approved', { reason: 'Hiking the Dolomites', createdDaysAgo: 170 }),
    L('lv-26', 'u-lucas', 'wfa', mon(-10), mon(-10, 4), 'approved', { reason: 'Working from Porto', createdDaysAgo: 80 }),
    L('lv-27', 'u-aisha', 'annual', mon(-29), mon(-28, 4), 'approved', { reason: 'Easter in Lagos', createdDaysAgo: 220 }),
    L('lv-28', 'u-noah', 'annual', mon(-22), mon(-22, 4), 'approved', { reason: 'Road trip', createdDaysAgo: 180 }),
    L('lv-29', 'u-sara', 'annual', mon(-18), mon(-18, 4), 'approved', { reason: 'Eid with family', decidedBy: 'u-layla', createdDaysAgo: 150 }),
    L('lv-30', 'u-fatima', 'annual', mon(-24), mon(-24, 2), 'approved', { reason: 'Long weekend', createdDaysAgo: 190 }),
    L('lv-31', 'u-daniel', 'annual', mon(-6), mon(-6, 4), 'rejected', { reason: 'Lake District', decisionNote: 'That’s quarter-end close week. Could you move it one week later?', createdDaysAgo: 50, decidedDaysAgo: 49 }),
    L('lv-32', 'u-daniel', 'annual', mon(-5), mon(-5, 4), 'approved', { reason: 'Lake District (moved)', createdDaysAgo: 48, decidedDaysAgo: 47 }),
    L('lv-33', 'u-ethan', 'compassionate', mon(-14, 1), mon(-14, 3), 'approved', { createdDaysAgo: 100 }),
    L('lv-34', 'u-sofia', 'annual', mon(-16), mon(-15, 4), 'approved', { reason: 'Summer in Sardinia', createdDaysAgo: 140 }),
    L('lv-35', 'u-yusuf', 'annual', mon(-12), mon(-11, 2), 'approved', { reason: 'Family visit', createdDaysAgo: 100 }),
    L('lv-36', 'u-hana', 'annual', mon(-21), mon(-21, 4), 'approved', { reason: 'Seollal', createdDaysAgo: 170 }),
    L('lv-37', 'u-mateo', 'sick', mon(-9, 2), mon(-9, 2), 'approved', { halfDay: 'am', decidedBy: 'system', createdDaysAgo: 63 }),
    L('lv-38', 'u-grace', 'annual', mon(-27), mon(-26, 4), 'approved', { reason: 'Japan in spring', createdDaysAgo: 210 }),
    L('lv-39', 'u-layla', 'annual', mon(-19), mon(-18, 4), 'approved', { reason: 'Family holiday', decidedBy: 'u-sara', createdDaysAgo: 160 }),
  ].filter((r) => r.days > 0 || r.status !== 'approved');

  const carry: [string, number][] = [
    ['u-layla', 5],
    ['u-sara', 3],
    ['u-omar', 5],
    ['u-mei', 2],
    ['u-priya', 4],
    ['u-lucas', 5],
    ['u-aisha', 1],
    ['u-noah', 2],
    ['u-daniel', 3],
    ['u-ethan', 2.5],
    ['u-fatima', 1],
    ['u-sofia', 3],
    ['u-hana', 2],
    ['u-mateo', 4],
    ['u-grace', 5],
  ];
  const jan2 = new Date(year, 0, 2).getTime();
  const adjustments: LeaveAdjustment[] = [
    ...carry.map(([userId, days]) => ({ id: `adj-carry-${userId}`, userId, type: 'annual' as const, year, days, reason: `Carried over from ${year - 1}`, by: 'u-fatima', at: jan2 })),
    { id: 'adj-lucas-toil', userId: 'u-lucas', type: 'annual', year, days: 1, reason: 'Time in lieu: weekend incident response', by: 'u-sara', at: ago(60) },
  ];

  // ───────────── benefits ─────────────
  const dep = (id: string, name: string, relation: Dependent['relation'], birthDate?: string): Dependent => ({ id, name, relation, birthDate });
  const ELECT: Record<string, { health: HealthTier; dental?: boolean; vision?: boolean; life?: 2 | 3 | 4; deps?: Dependent[] }> = {
    'u-layla': { health: 'premier', dental: true, vision: true, life: 4, deps: [dep('d-l1', 'Karim Haddad', 'spouse')] },
    'u-sara': { health: 'premier', dental: true, vision: true, life: 3, deps: [dep('d-s1', 'Hamad Al Mansoori', 'spouse'), dep('d-s2', 'Noor Al Mansoori', 'child', '2018-04-12'), dep('d-s3', 'Zayed Al Mansoori', 'child', '2021-09-30')] },
    'u-omar': { health: 'plus', dental: true, life: 3, deps: [dep('d-o1', 'Rana Khalid', 'spouse'), dep('d-o2', 'Yousef Khalid', 'child', '2016-02-03')] },
    'u-daniel': { health: 'plus' },
    'u-mei': { health: 'plus', vision: true },
    'u-priya': { health: 'essential', dental: true, deps: [dep('d-p1', 'Arun Raman', 'parent')] },
    'u-lucas': { health: 'plus' },
    'u-aisha': { health: 'plus', vision: true, deps: [dep('d-a1', 'Tunde Bello', 'spouse')] },
    'u-noah': { health: 'premier' },
    'u-fatima': { health: 'plus', dental: true },
    'u-ethan': { health: 'essential' },
    'u-sofia': { health: 'plus' },
    'u-yusuf': { health: 'essential', deps: [dep('d-y1', 'Elif Demir', 'spouse')] },
    'u-mateo': { health: 'essential', dental: true },
    'u-grace': { health: 'premier', vision: true, life: 4 },
  };
  const elections: BenefitElection[] = [];
  for (const u of employees) {
    const e = ELECT[u.id];
    const joinedThisYear = u.startDate.startsWith(String(year));
    if (u.id === 'u-kwame' || (!e && joinedThisYear)) {
      elections.push({ id: `${u.id}-${year}`, userId: u.id, year, health: 'plus', dental: false, vision: false, lifeMultiple: 2, dependents: [], status: 'not-started', deadline: addDaysISO(u.startDate, 30) });
      continue;
    }
    const base = e ?? { health: 'essential' as HealthTier };
    elections.push({
      id: `${u.id}-${year}`,
      userId: u.id,
      year,
      health: base.health,
      dental: !!base.dental,
      vision: !!base.vision,
      lifeMultiple: base.life ?? 2,
      dependents: base.deps ?? [],
      status: 'confirmed',
      submittedAt: jan2 - 20 * DAY,
      confirmedAt: jan2 - 15 * DAY,
      confirmedBy: 'u-fatima',
      memberNumber: `${base.health === 'premier' ? 'BG' : 'DM'}-${verificationCode(u.id).replace('-', '')}`,
    });
  }
  // Hana had a baby: life-event change waiting for People Ops.
  const hana = elections.find((e) => e.userId === 'u-hana');
  if (hana) Object.assign(hana, { status: 'submitted', submittedAt: ago(2), dependents: [dep('d-h1', 'Min-jun Park', 'child', toISODate(ago(21)))] });

  const period = (monthsAgo: number) => {
    const d = new Date(now);
    const m = new Date(d.getFullYear(), d.getMonth() - monthsAgo, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  };
  const claims: BenefitClaim[] = [
    { id: 'cl-01', userId: 'u-mei', allowance: 'learning', amount: 1450, currency: 'AED', merchant: 'Figma', description: 'Config conference ticket', receiptName: 'config-ticket.pdf', date: toISODate(ago(6)), status: 'submitted', createdAt: ago(5) },
    { id: 'cl-02', userId: 'u-kwame', allowance: 'home-office', amount: 1180, currency: 'AED', merchant: 'IKEA', description: 'Ergonomic chair and monitor arm', receiptName: 'ikea-receipt.jpg', date: toISODate(ago(9)), status: 'submitted', createdAt: ago(8) },
    { id: 'cl-03', userId: 'u-priya', allowance: 'wellness', amount: 900, currency: 'AED', merchant: 'Cult.fit', description: 'Three-month gym membership', receiptName: 'cultfit-invoice.pdf', date: toISODate(ago(40)), status: 'paid', reviewerId: 'u-sara', decidedAt: ago(38), payrollMonth: period(1), createdAt: ago(39) },
    { id: 'cl-04', userId: 'u-omar', allowance: 'learning', amount: 2200, currency: 'AED', merchant: 'O’Reilly', description: 'Staff-plus engineering course and books', receiptName: 'oreilly.pdf', date: toISODate(ago(70)), status: 'paid', reviewerId: 'u-fatima', decidedAt: ago(66), payrollMonth: period(2), createdAt: ago(68) },
    { id: 'cl-05', userId: 'u-noah', allowance: 'flight', amount: 3100, currency: 'AED', merchant: 'Emirates', description: 'Return flight home (NYC ⇄ Seoul)', receiptName: 'eticket.pdf', date: toISODate(ago(12)), status: 'approved', reviewerId: 'u-sara', decidedAt: ago(10), payrollMonth: period(0), createdAt: ago(11) },
    { id: 'cl-06', userId: 'u-sara', allowance: 'wellness', amount: 600, currency: 'AED', merchant: 'Fitness First', description: 'Yoga class pack', receiptName: 'ff-receipt.pdf', date: toISODate(ago(55)), status: 'paid', reviewerId: 'u-fatima', decidedAt: ago(53), payrollMonth: period(1), createdAt: ago(54) },
    { id: 'cl-07', userId: 'u-fatima', allowance: 'learning', amount: 4800, currency: 'AED', merchant: 'CIPD', description: 'Level 7 course fees', receiptName: 'cipd-invoice.pdf', date: toISODate(ago(95)), status: 'paid', reviewerId: 'u-sara', decidedAt: ago(92), payrollMonth: period(3), createdAt: ago(94) },
    { id: 'cl-08', userId: 'u-daniel', allowance: 'home-office', amount: 5200, currency: 'AED', merchant: 'Apple', description: 'Personal laptop', receiptName: 'apple.pdf', date: toISODate(ago(30)), status: 'rejected', reviewerId: 'u-sara', decidedAt: ago(28), note: 'Laptops are provided by IT, so they’re not covered. Monitors, chairs and headsets are.', createdAt: ago(29) },
  ];

  // ───────────── letters & documents ─────────────
  const letter = (id: string, seq: number, userId: string, kind: LetterRequest['kind'], addressedTo: string, purpose: string, includeSalary: boolean, daysAgo: number, extra: Partial<LetterRequest> = {}): LetterRequest => ({
    id,
    userId,
    kind,
    addressedTo,
    purpose,
    includeSalary,
    status: 'issued',
    reference: letterReference(year, seq),
    verifyCode: verificationCode(id),
    createdAt: ago(daysAgo),
    issuedAt: ago(daysAgo),
    issuedBy: 'auto',
    ...extra,
  });
  const letters: LetterRequest[] = [
    letter('ltr-41', 41, 'u-omar', 'employment', 'To whom it may concern', 'School enrolment for my son', false, 60),
    letter('ltr-42', 42, 'u-daniel', 'salary-certificate', 'Barclays Bank UK', 'Mortgage application', true, 20),
    letter('ltr-43', 43, 'u-kwame', 'bank', 'Standard Chartered', 'Opening a salary account', true, 21),
    letter('ltr-44', 44, 'u-mei', 'embassy', 'Embassy of Japan, Singapore', 'Tourist visa for a family trip', false, 1, {
      status: 'pending',
      issuedAt: undefined,
      issuedBy: undefined,
      country: 'Japan',
      travelFrom: mon(3),
      travelTo: mon(3, 4),
    }),
  ];

  const startTs = (u: User) => parseISODate(u.startDate);
  const documents: EmployeeDocument[] = [];
  for (const u of employees) {
    const kwame = u.id === 'u-kwame';
    documents.push({
      id: `doc-${u.id}-contract`,
      userId: u.id,
      kind: 'contract',
      title: 'Employment contract',
      description: `${u.title} · permanent, full-time`,
      source: 'people-ops',
      createdAt: kwame ? ago(42) : startTs(u) - 14 * DAY,
      signature: { required: true, signedAt: kwame ? ago(40) : startTs(u) - 10 * DAY, signedName: u.name },
      confidential: true,
    });
    documents.push({
      id: `doc-${u.id}-nda`,
      userId: u.id,
      kind: 'nda',
      title: kwame ? 'Confidentiality & IP agreement (2026 edition)' : 'Confidentiality & IP agreement',
      description: kwame ? 'Updated after your contract: covers open-source contributions and AI tools.' : 'Signed with your contract.',
      source: 'people-ops',
      createdAt: kwame ? ago(3) : startTs(u) - 14 * DAY,
      signature: kwame ? { required: true } : { required: true, signedAt: startTs(u) - 10 * DAY, signedName: u.name },
    });
  }
  documents.push(
    { id: 'doc-u-kwame-offer', userId: 'u-kwame', kind: 'offer', title: 'Offer letter: Data Engineer, Platform', description: 'Accepted in Talent Hub · handed over to People Ops', source: 'talent-hub', offerId: 'of-4', createdAt: ago(45), confidential: true },
    { id: 'doc-u-kwame-passport', userId: 'u-kwame', kind: 'id', title: 'Passport copy', source: 'self', fileName: 'passport-kwame-mensah.pdf', sizeKb: 820, createdAt: ago(30), confidential: true },
    { id: 'doc-u-omar-award', userId: 'u-omar', kind: 'certificate', title: '5-year service award', description: 'Thank you for five brilliant years.', source: 'people-ops', createdAt: parseISODate('2025-06-01') },
    { id: 'doc-u-sara-promo', userId: 'u-sara', kind: 'letter', title: 'Promotion letter: People Ops Lead', source: 'people-ops', createdAt: ago(400), confidential: true },
    { id: 'doc-u-mei-reloc', userId: 'u-mei', kind: 'letter', title: 'Relocation letter: Singapore studio', source: 'people-ops', createdAt: ago(520) },
  );
  for (const l of letters.filter((x) => x.status === 'issued'))
    documents.push({ id: `doc-${l.id}`, userId: l.userId, kind: 'letter', title: `${l.kind === 'salary-certificate' ? 'Salary certificate' : l.kind === 'bank' ? 'Bank letter' : l.kind === 'employment' ? 'Employment letter' : 'Letter'} · ${l.addressedTo}`, source: 'system', letterId: l.id, createdAt: l.issuedAt ?? l.createdAt, confidential: l.includeSalary });

  // ───────────── policy acknowledgements ─────────────
  const acks: PolicyAck[] = [];
  const ack = (userId: string, policyId: string, version: number, at: number) => acks.push({ id: `ack-${userId}-${policyId}-${version}`, userId, policyId, version, at });
  for (const u of employees) {
    const joined = startTs(u);
    if (u.id === 'u-kwame') {
      ack(u.id, 'conduct', 2, ago(25));
      continue;
    }
    ack(u.id, 'conduct', 2, Math.max(joined + 3 * DAY, ago(210)));
    ack(u.id, 'respect', 1, Math.max(joined + 3 * DAY, ago(390)));
    ack(u.id, 'infosec', 2, Math.max(joined + 3 * DAY, ago(160)));
    if (['u-mei', 'u-lucas', 'u-priya', 'u-noah'].includes(u.id)) ack(u.id, 'flex', 2, ago(100));
  }
  ack('u-layla', 'infosec', 3, ago(5));
  ack('u-sara', 'infosec', 3, ago(4));
  ack('u-ethan', 'infosec', 3, ago(3));
  void POLICIES;

  // ───────────── pulse & cases ─────────────
  const pulses: PulseResponse[] = [
    {
      id: 'pulse-kwame-w1',
      userId: 'u-kwame',
      journeyId: 'j-2',
      milestone: 'week-1',
      scores: { welcome: 5, clarity: 3, tools: 2, belonging: 4 },
      comment: 'Everyone has been great and Priya is a fantastic buddy. My laptop took three days to arrive, so I lost most of week one.',
      shareWithManager: true,
      at: ago(20),
    },
  ];

  const cases: HrCase[] = [
    {
      id: 'case-1',
      userId: 'u-kwame',
      category: 'pay',
      subject: 'When is my first salary paid?',
      confidential: false,
      status: 'answered',
      assigneeId: 'u-fatima',
      messages: [
        { id: 'cm-1', by: 'u-kwame', at: ago(19), text: 'Hi! When will my first salary be paid, and is my first month pro-rated?' },
        {
          id: 'cm-2',
          by: 'u-fatima',
          at: ago(18.8),
          text: 'Welcome aboard, Kwame! Salaries land on the 25th of every month. Your first month is pro-rated from your start date, and every payslip is in Documents → Payslips.',
        },
      ],
      createdAt: ago(19),
      updatedAt: ago(18.8),
    },
    {
      id: 'case-2',
      userId: 'u-mei',
      category: 'visa',
      subject: 'Dependant’s Pass for my husband',
      confidential: false,
      status: 'open',
      messages: [{ id: 'cm-3', by: 'u-mei', at: ago(1), text: 'We got married last month 🎉 What do I need to sponsor my husband’s Dependant’s Pass, and can Helix support the application?' }],
      createdAt: ago(1),
      updatedAt: ago(1),
    },
    {
      id: 'case-3',
      userId: 'u-noah',
      category: 'leave',
      subject: 'Planning parental leave',
      confidential: true,
      status: 'open',
      messages: [{ id: 'cm-4', by: 'u-noah', at: ago(0.15), text: 'My partner is expecting in April. Could we talk through parental leave and a phased return? I haven’t told my manager yet.' }],
      createdAt: ago(0.15),
      updatedAt: ago(0.15),
    },
    {
      id: 'case-4',
      userId: 'u-daniel',
      category: 'pay',
      subject: 'Increase my pension contribution',
      confidential: false,
      status: 'closed',
      assigneeId: 'u-sara',
      messages: [
        { id: 'cm-5', by: 'u-daniel', at: ago(40), text: 'Can I increase my pension contribution from 5% to 8%?' },
        { id: 'cm-6', by: 'u-sara', at: ago(39), text: 'Done. 8% from next payroll. You can change it again any time.' },
      ],
      createdAt: ago(40),
      updatedAt: ago(39),
    },
  ];

  const comp: CompRecord[] = COMP.filter((c) => userOf.has(c.userId)).map((c) => ({ ...c, payDay: 25 }));

  return { version: HR_DATA_VERSION, leave, adjustments, elections, claims, documents, letters, acks, comp, pulses, cases };
}
