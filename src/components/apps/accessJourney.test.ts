import { describe, expect, it } from 'vitest';
import type { AccessRequest, HubApp, Role, User } from '@/types';
import {
  ACCESS_STAGE_COUNT,
  REVIEW_SLA_MS,
  REVIEW_STAGE,
  approversFor,
  buildAccessJourney,
  latestTrackedRequest,
  reviewerTurnaround,
  shortSpan,
} from './accessJourney';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

const roles: Role[] = [
  { id: 'admin', name: 'System Admin', description: '', clearance: 5, color: '#f00', permissions: ['*'], locked: true },
  { id: 'manager', name: 'Manager', description: '', clearance: 3, color: '#0ff', permissions: ['hub.requests.review', 'app:crm'] },
  { id: 'employee', name: 'Employee', description: '', clearance: 2, color: '#00f', permissions: ['app:mail'] },
];

const user = (id: string, over: Partial<User> = {}): User => ({
  id,
  name: `${id[0].toUpperCase()}${id.slice(1)} Tester`,
  email: `${id}@x.co`,
  title: 'Tester',
  department: 'Engineering',
  location: 'Dubai',
  timezone: 'Asia/Dubai',
  roleIds: ['employee'],
  grants: [],
  active: true,
  presence: 'online',
  avatarHue: 200,
  skills: [],
  phone: '',
  employeeId: '',
  startDate: '2020-01-01',
  ...over,
});

const app = (id: string, over: Partial<HubApp> = {}): HubApp => ({
  id,
  name: id.toUpperCase(),
  tagline: '',
  description: '',
  category: 'Growth',
  icon: 'Boxes',
  gradient: ['#000', '#fff'],
  url: 'https://x',
  keywords: [],
  status: 'operational',
  enabled: true,
  discoverable: true,
  owner: 'IT',
  addedAt: 0,
  ...over,
});

const req = (over: Partial<AccessRequest> = {}): AccessRequest => ({
  id: 'r1',
  userId: 'mei',
  appId: 'crm',
  reason: 'Research synthesis for onboarding',
  duration: '30d',
  status: 'pending',
  createdAt: NOW - 3 * HOUR,
  ...over,
});

const layla = user('layla', { roleIds: ['admin'], department: 'IT & Security' });
const omar = user('omar', { roleIds: ['manager', 'employee'] });
const aisha = user('aisha', { roleIds: ['manager', 'employee'], department: 'Product' });
const mei = user('mei', { managerId: 'omar', department: 'Design' });
const users = [layla, omar, aisha, mei];
const apps = [app('crm'), app('vault', { category: 'Security' })];

const inputs = (over: Partial<Parameters<typeof buildAccessJourney>[1]> = {}) => ({ users, roles, apps, requests: [], now: NOW, ...over });

describe('approversFor', () => {
  it('routes to active reviewers who hold the app, never the requester', () => {
    const { approvers, routedToAdmins } = approversFor(req(), users, roles, NOW);
    expect(approvers.map((u) => u.id)).toEqual(['layla', 'omar', 'aisha']);
    expect(routedToAdmins).toBe(false);
  });

  it('falls back to System Admins when nobody else holds the app', () => {
    const noAdminHolders = [omar, aisha, mei, { ...layla, roleIds: ['admin'] }];
    const r = approversFor(req({ appId: 'vault' }), noAdminHolders, roles.filter((x) => x.id !== 'admin').concat({ ...roles[0], permissions: ['hub.users.manage'] }), NOW);
    expect(r.routedToAdmins).toBe(true);
    expect(r.approvers.map((u) => u.id)).toEqual(['layla']);
  });

  it('skips deactivated reviewers', () => {
    const { approvers } = approversFor(req(), [layla, { ...omar, active: false }, mei], roles, NOW);
    expect(approvers.map((u) => u.id)).toEqual(['layla']);
  });
});

describe('buildAccessJourney', () => {
  it('pending: review stage is live and led by the requester’s manager', () => {
    const j = buildAccessJourney(req(), inputs());
    expect(j.current).toBe(REVIEW_STAGE);
    expect(j.state).toBe('active');
    expect(j.lead?.id).toBe('omar');
    expect(j.leadKind).toBe('manager');
    expect(j.approvers).toHaveLength(3);
    expect(j.dueAt).toBe(NOW - 3 * HOUR + REVIEW_SLA_MS);
    expect(j.elapsed).toBeCloseTo(3 / 24, 5);
  });

  it('pending: without an eligible manager the lead is an app holder (admins are labelled as such)', () => {
    const noah = user('noah', { managerId: 'mei', department: 'Product' });
    const j = buildAccessJourney(req({ userId: 'noah' }), inputs({ users: [...users, noah] }));
    expect(j.lead?.id).toBe('aisha'); // same department beats directory order
    expect(j.leadKind).toBe('holder');
    const v = buildAccessJourney(req({ userId: 'noah', appId: 'vault' }), inputs({ users: [...users, noah] }));
    expect(v.lead?.id).toBe('layla');
    expect(v.leadKind).toBe('admin');
  });

  it('pending: a deactivated requester blocks the review (store refuses it)', () => {
    const j = buildAccessJourney(req(), inputs({ users: [layla, omar, { ...mei, active: false }] }));
    expect(j.state).toBe('blocked');
    expect(j.stall).toBe('requester-inactive');
  });

  it('pending: no approver at all parks the journey', () => {
    const j = buildAccessJourney(req(), inputs({ users: [mei] }));
    expect(j.state).toBe('paused');
    expect(j.stall).toBe('no-approver');
    expect(j.lead).toBeUndefined();
  });

  it('approved: complete, with the grant expiry from the requester’s grant', () => {
    const reviewedAt = NOW - 2 * DAY;
    const withGrant = { ...mei, grants: [{ permission: 'app:crm', grantedBy: 'omar', grantedAt: reviewedAt, expiresAt: reviewedAt + 7 * DAY }] };
    const j = buildAccessJourney(
      req({ status: 'approved', reviewedBy: 'omar', reviewedAt, grantedDuration: '7d' }),
      inputs({ users: [layla, omar, aisha, withGrant] }),
    );
    expect(j.current).toBe(ACCESS_STAGE_COUNT);
    expect(j.state).toBe('done');
    expect(j.lead?.id).toBe('omar');
    expect(j.expiresAt).toBe(reviewedAt + 7 * DAY);
  });

  it('approved: permanent windows never expire', () => {
    const j = buildAccessJourney(req({ status: 'approved', reviewedBy: 'layla', reviewedAt: NOW - HOUR, grantedDuration: 'permanent' }), inputs());
    expect(j.expiresAt).toBeNull();
    expect(j.leadKind).toBe('admin');
  });

  it('denied blocks at the review stage; cancelled pauses there', () => {
    const d = buildAccessJourney(req({ status: 'denied', reviewedBy: 'aisha', reviewedAt: NOW - DAY }), inputs());
    expect([d.current, d.state, d.lead?.id]).toEqual([REVIEW_STAGE, 'blocked', 'aisha']);
    const c = buildAccessJourney(req({ status: 'cancelled' }), inputs());
    expect([c.current, c.state]).toEqual([REVIEW_STAGE, 'paused']);
  });
});

describe('helpers', () => {
  it('reviewerTurnaround is the median of past decisions, floored at 5 minutes', () => {
    const history = [
      req({ id: 'a', status: 'approved', reviewedBy: 'omar', createdAt: NOW - 10 * HOUR, reviewedAt: NOW - 8 * HOUR }),
      req({ id: 'b', status: 'denied', reviewedBy: 'omar', createdAt: NOW - 10 * HOUR, reviewedAt: NOW - 6 * HOUR }),
      req({ id: 'c', status: 'approved', reviewedBy: 'omar', createdAt: NOW - 10 * HOUR, reviewedAt: NOW - 4 * HOUR }),
      req({ id: 'd', status: 'cancelled', reviewedBy: 'omar', createdAt: NOW - 10 * HOUR, reviewedAt: NOW }),
    ];
    expect(reviewerTurnaround(history, 'omar')).toBe(4 * HOUR);
    expect(reviewerTurnaround(history, 'aisha')).toBeNull();
    expect(reviewerTurnaround([req({ status: 'approved', reviewedBy: 'omar', createdAt: NOW - 1000, reviewedAt: NOW })], 'omar')).toBe(5 * 60_000);
  });

  it('latestTrackedRequest keeps pending and recent decisions, skips cancelled and stale ones', () => {
    const list = [
      req({ id: 'old', status: 'denied', createdAt: NOW - 20 * DAY, reviewedAt: NOW - 19 * DAY }),
      req({ id: 'gone', status: 'cancelled', createdAt: NOW - HOUR }),
    ];
    expect(latestTrackedRequest(list, 'mei', 'crm', NOW)).toBeUndefined();
    const recent = req({ id: 'new', status: 'approved', createdAt: NOW - 2 * DAY, reviewedAt: NOW - DAY });
    expect(latestTrackedRequest([...list, recent], 'mei', 'crm', NOW)?.id).toBe('new');
    expect(latestTrackedRequest([...list, req({ id: 'p' })], 'mei', 'crm', NOW)?.id).toBe('p');
  });

  it('shortSpan', () => {
    expect(shortSpan(20 * 60_000)).toBe('20m');
    expect(shortSpan(95 * 60_000)).toBe('2h');
    expect(shortSpan(3 * DAY)).toBe('3d');
  });
});
