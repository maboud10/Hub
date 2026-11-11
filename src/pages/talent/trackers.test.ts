import { Fragment, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GateContext } from '@/talent/gates';
import { buildJourneyTasks, toISODate } from '@/talent/onboarding';
import type { Application, Candidate, Offer, OnboardingJourney, Requisition } from '@/talent/types';
import { useTalent } from '@/talent/store';
import {
  CandidateJourneyTracker,
  OfferTracker,
  OnboardingTracker,
  ReqTracker,
  buildJourneyTrack,
  buildOfferTrack,
  buildOnboardingTrack,
  buildReqTrack,
  offerStageIndex,
  type TalentPeople,
} from './trackers';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 10, 12).getTime();

const NAMES: Record<string, string> = { 'u-sara': 'Sara Haddad', 'u-omar': 'Omar Khalid', 'u-lina': 'Lina Park', 'u-dan': 'Daniel Ross' };
const people = (me?: string): TalentPeople => ({
  me,
  first: (id) => (id && NAMES[id] ? NAMES[id].split(' ')[0] : undefined),
  offerPool: (exclude) => ['u-lina', 'u-dan'].filter((id) => !exclude.includes(id)),
  headcountPool: (hm) => ['u-sara', 'u-dan', 'u-omar'].filter((id) => id !== hm),
});
const text = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node)).replace(/<[^>]+>/g, '');

const req = (patch: Partial<Requisition> = {}): Requisition => ({
  id: 'r-1',
  title: 'Senior React Engineer',
  department: 'Engineering',
  location: 'Dubai',
  workModel: 'hybrid',
  employmentType: 'full-time',
  seniority: 'senior',
  band: 'E5',
  salary: { min: 300_000, max: 400_000, currency: 'AED' },
  headcount: 1,
  hires: 0,
  status: 'open',
  priority: 'high',
  hiringManagerId: 'u-omar',
  recruiterId: 'u-sara',
  interviewPlan: [],
  jd: { text: 'We are hiring.', profile: null },
  createdBy: 'u-omar',
  createdAt: NOW - 20 * DAY,
  openedAt: NOW - 18 * DAY,
  approvedBy: 'u-dan',
  targetStartDate: '2027-01-10',
  ...patch,
});

const offer = (patch: Partial<Offer> = {}): Offer => ({
  id: 'of-1',
  applicationId: 'a-1',
  candidateId: 'c-1',
  requisitionId: 'r-1',
  title: 'Senior React Engineer',
  band: 'E5',
  baseSalary: 350_000,
  currency: 'AED',
  bonusPct: 10,
  equity: '—',
  signOnBonus: 0,
  startDate: '2027-01-10',
  expiresAt: NOW + 5 * DAY,
  status: 'pending-approval',
  approvals: [
    { step: 'hiring-manager', decision: 'pending' },
    { step: 'people-ops', decision: 'pending' },
  ],
  createdBy: 'u-sara',
  createdAt: NOW - 2 * DAY,
  ...patch,
});

const candidate: Candidate = {
  id: 'c-1',
  name: 'Priya Raman',
  headline: 'Frontend lead',
  currentTitle: 'Frontend Lead',
  currentCompany: 'Acme',
  location: 'Dubai',
  avatarHue: 200,
  yearsExperience: 8,
  skills: ['React'],
  experience: [],
  education: [],
  source: 'linkedin',
  tags: [],
  consent: { given: true },
  status: 'active',
  createdAt: NOW - 30 * DAY,
  createdBy: 'u-sara',
  updatedAt: NOW - DAY,
};

const app = (patch: Partial<Application> = {}): Application => ({
  id: 'a-1',
  candidateId: 'c-1',
  requisitionId: 'r-1',
  stage: 'interview',
  stageEnteredAt: NOW - 3 * DAY,
  status: 'active',
  history: [
    { stage: 'sourced', at: NOW - 15 * DAY, by: 'u-sara' },
    { stage: 'contacted', at: NOW - 12 * DAY, by: 'u-sara' },
    { stage: 'applied', at: NOW - 10 * DAY, by: 'u-sara' },
    { stage: 'screen', at: NOW - 7 * DAY, by: 'u-sara' },
    { stage: 'interview', at: NOW - 3 * DAY, by: 'u-sara' },
  ],
  match: null,
  ownerId: 'u-sara',
  createdAt: NOW - 15 * DAY,
  updatedAt: NOW - 3 * DAY,
  ...patch,
});

const ctx = (patch: Partial<GateContext> = {}): GateContext => ({
  candidate,
  outreach: [],
  interviews: [],
  scorecards: [],
  offers: [],
  requisition: req(),
  handedOff: false,
  now: NOW,
  ...patch,
});

const journey = (patch: Partial<OnboardingJourney> = {}): OnboardingJourney => ({
  id: 'j-1',
  candidateId: 'c-1',
  applicationId: 'a-1',
  requisitionId: 'r-1',
  offerId: 'of-1',
  name: 'Priya Raman',
  email: 'priya@example.com',
  title: 'Senior React Engineer',
  department: 'Engineering',
  location: 'Dubai',
  managerId: 'u-omar',
  startDate: toISODate(NOW + 10 * DAY),
  status: 'pre-boarding',
  tasks: buildJourneyTasks('j-1'),
  avatarHue: 200,
  handedOffBy: 'u-sara',
  handedOffAt: NOW - 2 * DAY,
  ...patch,
});

describe('offer tracker', () => {
  it('maps every status onto the five stages', () => {
    expect(offerStageIndex(offer({ status: 'draft' }))).toBe(0);
    expect(offerStageIndex(offer({ status: 'pending-approval' }))).toBe(1);
    expect(offerStageIndex(offer({ status: 'approved' }))).toBe(2);
    expect(offerStageIndex(offer({ status: 'sent', sentAt: NOW - DAY }))).toBe(3);
    expect(offerStageIndex(offer({ status: 'declined' }))).toBe(4);
    expect(offerStageIndex(offer({ status: 'accepted' }))).toBe(5);
    expect(offerStageIndex(offer({ status: 'rescinded', sentAt: NOW - DAY }))).toBe(3);
  });

  it('names who is holding the approvals and moves the courier per sign-off', () => {
    const o = offer({
      approvals: [
        { step: 'hiring-manager', decision: 'approved', approverId: 'u-omar', at: NOW - DAY },
        { step: 'people-ops', decision: 'pending' },
      ],
    });
    const m = buildOfferTrack({ offer: o, req: req(), candName: 'Priya Raman', now: NOW, people: people() });
    expect(m.current).toBe(1);
    expect(m.state).toBe('active');
    expect(m.progress).toBe(0.5);
    expect(m.steps[1].at).toBe('1/2');
    expect(text(m.message)).toContain('Omar signed off — now with People Ops: Lina or Daniel');
    expect(m.eta).toBe('Expires in 5 days');

    const compact = buildOfferTrack({ offer: o, req: req(), candName: 'Priya Raman', now: NOW, people: people(), compact: true });
    expect(compact.steps[1].label).toBe('Approvals · People Ops');
  });

  it('says "you" when the viewer is the approver being waited on', () => {
    const m = buildOfferTrack({ offer: offer(), req: req(), candName: 'Priya Raman', now: NOW, people: people('u-omar') });
    expect(text(m.message)).toBe('Waiting on you and People Ops to sign off');
  });

  it('blocks returned, lapsed, declined and rescinded offers', () => {
    const returned = buildOfferTrack({
      offer: offer({ status: 'draft', approvals: [{ step: 'hiring-manager', decision: 'rejected', approverId: 'u-omar', note: 'Above band' }, { step: 'people-ops', decision: 'pending' }] }),
      req: req(),
      candName: 'Priya Raman',
      now: NOW,
      people: people(),
    });
    expect(returned).toMatchObject({ current: 1, state: 'blocked' });
    expect(returned.steps[1].label).toBe('Returned');
    expect(text(returned.message)).toContain('Omar sent it back');

    const lapsed = buildOfferTrack({ offer: offer({ status: 'sent', sentAt: NOW - 8 * DAY, expiresAt: NOW - DAY }), req: req(), candName: 'Priya Raman', now: NOW, people: people() });
    expect(lapsed).toMatchObject({ current: 3, state: 'blocked' });

    const declined = buildOfferTrack({ offer: offer({ status: 'declined', sentAt: NOW - 3 * DAY, respondedAt: NOW - DAY }), req: req(), candName: 'Priya Raman', now: NOW, people: people() });
    expect(declined).toMatchObject({ current: 4, state: 'blocked' });
    expect(declined.steps[4].label).toBe('Declined');
    expect(text(declined.message)).toBe('Priya declined the offer');

    const rescinded = buildOfferTrack({ offer: offer({ status: 'rescinded', note: 'Role re-scoped' }), req: req(), now: NOW, people: people() });
    expect(rescinded.state).toBe('blocked');
    expect(rescinded.steps[rescinded.current].label).toBe('Rescinded');
  });

  it('completes on signature and tracks the signing window while out', () => {
    const sent = buildOfferTrack({ offer: offer({ status: 'sent', sentAt: NOW - 2 * DAY, expiresAt: NOW + 2 * DAY }), req: req(), candName: 'Priya Raman', now: NOW, people: people() });
    expect(sent.current).toBe(3);
    expect(sent.progress).toBeCloseTo(0.5, 5);
    expect(text(sent.message)).toContain('The offer is with Priya — Sara sent it 2d ago');

    const signed = buildOfferTrack({ offer: offer({ status: 'accepted', respondedAt: NOW - DAY }), req: req(), candName: 'Priya Raman', now: NOW, people: people() });
    expect(signed).toMatchObject({ current: 5, state: 'done' });
  });
});

describe('candidate journey tracker', () => {
  it('groups stages by phase and names the owner of the next step', () => {
    const m = buildJourneyTrack({ app: app(), ctx: ctx(), now: NOW, people: people() });
    expect(m.steps.map((s) => s.label)).toEqual(['Acquire', 'Assess', 'Decide', 'Hired']);
    expect(m.current).toBe(1);
    expect(m.state).toBe('active');
    expect(m.progress).toBeGreaterThan(0.5);
    expect(m.progress).toBeLessThan(1);
    expect(text(m.message)).toBe('Sara is booking the interview loop');
    expect(m.title).toBe('Senior React Engineer');

    const compact = buildJourneyTrack({ app: app(), ctx: ctx(), now: NOW, people: people(), compact: true });
    expect(compact.steps[1].label).toBe('Assess · Interviews');
    expect(compact.message).toBeUndefined();
  });

  it('pauses while waiting on the candidate or an on-hold role', () => {
    const waiting = buildJourneyTrack({
      app: app({ stage: 'contacted', stageEnteredAt: NOW - DAY }),
      ctx: ctx({
        outreach: [{ id: 'o-1', candidateId: 'c-1', requisitionId: 'r-1', channel: 'email', tone: 'warm', body: 'Hi', step: 1, status: 'sent', engine: 'offline', createdBy: 'u-sara', createdAt: NOW - DAY, sentAt: NOW - DAY }],
      }),
      now: NOW,
      people: people(),
    });
    expect(waiting.state).toBe('paused');
    expect(text(waiting.message)).toBe('Waiting on Priya to reply to Sara');

    const onHold = buildJourneyTrack({ app: app(), ctx: ctx({ requisition: req({ status: 'on-hold' }) }), now: NOW, people: people() });
    expect(onHold.state).toBe('paused');
  });

  it('blocks closed applications where they stopped and completes on hire', () => {
    const closed = buildJourneyTrack({
      app: app({ stage: 'screen', status: 'rejected', rejection: { reason: 'skills', by: 'u-sara', at: NOW - DAY } }),
      ctx: ctx(),
      now: NOW,
      people: people(),
    });
    expect(closed).toMatchObject({ current: 1, state: 'blocked' });
    expect(closed.steps[1].label).toBe('Not progressing');
    expect(text(closed.message)).toBe('Closed out at Screen: Skills gap');

    const hired = buildJourneyTrack({ app: app({ stage: 'hired', status: 'hired' }), ctx: ctx({ handedOff: true }), now: NOW, people: people() });
    expect(hired).toMatchObject({ current: 4, state: 'done' });
    expect(text(hired.message)).toBe('Priya is hired — onboarding is live in HR Portal');
  });
});

describe('requisition tracker', () => {
  const base = { apps: [] as Application[], offers: [] as Offer[], candName: () => 'Priya Raman', now: NOW, typicalApprovalMs: 2 * DAY };

  it('follows the status from draft to filled', () => {
    expect(buildReqTrack({ ...base, req: req({ status: 'draft', openedAt: undefined }), people: people() }).current).toBe(0);
    expect(buildReqTrack({ ...base, req: req({ status: 'pending-approval', openedAt: undefined }), people: people() }).current).toBe(1);
    expect(buildReqTrack({ ...base, req: req(), people: people() }).current).toBe(2);
    expect(buildReqTrack({ ...base, req: req(), offers: [offer()], people: people() }).current).toBe(3);
    expect(buildReqTrack({ ...base, req: req({ status: 'filled', hires: 1, closedAt: NOW - DAY }), people: people() })).toMatchObject({ current: 5, state: 'done' });
  });

  it('names the eligible approvers (never the hiring manager) and the viewer as "you"', () => {
    const pending = req({ status: 'pending-approval', openedAt: undefined, createdAt: NOW - DAY });
    const m = buildReqTrack({ ...base, req: pending, people: people() });
    expect(text(m.message)).toBe('Waiting on Sara or Daniel to approve the headcount');
    expect(m.progress).toBeCloseTo(0.5, 5);
    expect(text(buildReqTrack({ ...base, req: pending, people: people('u-dan') }).message)).toBe('Waiting on Sara or you to approve the headcount');
  });

  it('pauses on hold and blocks a closed role', () => {
    const held = buildReqTrack({ ...base, req: req({ status: 'on-hold' }), people: people(), compact: true });
    expect(held.state).toBe('paused');
    expect(held.steps[held.current].label).toBe('On hold');
    const closed = buildReqTrack({ ...base, req: req({ status: 'closed', closedAt: NOW - DAY }), people: people() });
    expect(closed.state).toBe('blocked');
    expect(closed.steps[closed.current].label).toBe('Closed');
  });
});

describe('onboarding tracker', () => {
  it('starts in pre-boarding with the next task owner and a day-one ETA', () => {
    const m = buildOnboardingTrack({ journey: journey(), now: NOW, people: people() });
    expect(m.current).toBe(0);
    expect(m.state).toBe('active');
    expect(String(m.eta)).toMatch(/^Starts /);
    expect(text(m.message)).toContain('People Ops is on');
    expect(m.steps[0].at).toBe('0/9');
  });

  it('moves the courier with tasks done and completes when every task is done', () => {
    const j = journey();
    const half = { ...j, tasks: j.tasks.map((t, i) => (t.phase === 'pre-boarding' && i < 3 ? { ...t, done: true } : t)) };
    expect(buildOnboardingTrack({ journey: half, now: NOW, people: people() }).progress).toBeCloseTo(3 / 9, 5);
    const done = { ...j, status: 'completed' as const, tasks: j.tasks.map((t) => ({ ...t, done: true })) };
    expect(buildOnboardingTrack({ journey: done, now: NOW, people: people() })).toMatchObject({ current: 6, state: 'done' });
  });
});

describe('tracker components', () => {
  it('render against every seeded offer, application, requisition and journey', () => {
    const s = useTalent.getState();
    const html: string[] = [];
    for (const o of s.offers) {
      const props = { offer: o, req: s.requisitions.find((r) => r.id === o.requisitionId), candName: s.candidates.find((c) => c.id === o.candidateId)?.name, now: NOW };
      html.push(renderToStaticMarkup(createElement(OfferTracker, props)), renderToStaticMarkup(createElement(OfferTracker, { ...props, compact: true })));
    }
    for (const a of s.applications) html.push(renderToStaticMarkup(createElement(CandidateJourneyTracker, { app: a, now: NOW })));
    for (const r of s.requisitions) {
      const apps = s.applications.filter((a) => a.requisitionId === r.id);
      html.push(renderToStaticMarkup(createElement(ReqTracker, { req: r, apps, now: NOW })), renderToStaticMarkup(createElement(ReqTracker, { req: r, apps, now: NOW, compact: true })));
    }
    for (const j of s.onboarding) html.push(renderToStaticMarkup(createElement(OnboardingTracker, { journey: j, now: NOW })));
    expect(html.length).toBeGreaterThan(0);
    expect(html.every((h) => h.includes('neo-tracker') && h.includes('role="progressbar"'))).toBe(true);
  });
});
