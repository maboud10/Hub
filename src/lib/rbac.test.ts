import { describe, expect, it } from 'vitest';
import type { AccessRequest, HubApp, Role, User } from '@/types';
import {
  canAssignRole,
  canReviewRequest,
  clearanceOf,
  computeAppAccess,
  effectivePermissions,
  explainAccess,
  hasPermission,
  matchesPermission,
  requestRisk,
} from './rbac';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const roles: Role[] = [
  { id: 'admin', name: 'Admin', description: '', clearance: 5, color: '#f00', permissions: ['*'], locked: true },
  { id: 'eng', name: 'Engineering', description: '', clearance: 2, color: '#0f0', permissions: ['app:devhub', 'app:cloud'] },
  { id: 'emp', name: 'Employee', description: '', clearance: 2, color: '#00f', permissions: ['app:mail', 'hub.people.view'] },
  { id: 'mgr', name: 'Manager', description: '', clearance: 3, color: '#0ff', permissions: ['hub.requests.review', 'app:crm'] },
  { id: 'apps-all', name: 'App Admin', description: '', clearance: 4, color: '#ff0', permissions: ['app:*'] },
];

const user = (over: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'Test User',
  email: 't@x.co',
  title: 'Tester',
  department: 'Engineering',
  location: 'Dubai',
  timezone: 'Asia/Dubai',
  roleIds: ['emp'],
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
  name: id,
  tagline: '',
  description: '',
  category: 'Productivity',
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

describe('matchesPermission', () => {
  it('matches exact, global and prefix wildcards', () => {
    expect(matchesPermission('app:mail', 'app:mail')).toBe(true);
    expect(matchesPermission('*', 'hub.users.manage')).toBe(true);
    expect(matchesPermission('app:*', 'app:payroll')).toBe(true);
    expect(matchesPermission('hub.users.*', 'hub.users.manage')).toBe(true);
  });
  it('does not over-match', () => {
    expect(matchesPermission('app:mail', 'app:mailbox')).toBe(false);
    expect(matchesPermission('app:*', 'hub.users.manage')).toBe(false);
  });
});

describe('effectivePermissions', () => {
  it('unions all role permissions', () => {
    const p = effectivePermissions(user({ roleIds: ['emp', 'eng'] }), roles, NOW);
    expect([...p].sort()).toEqual(['app:cloud', 'app:devhub', 'app:mail', 'hub.people.view']);
  });
  it('includes active grants and drops expired ones', () => {
    const u = user({
      grants: [
        { permission: 'app:crm', grantedBy: 'x', grantedAt: NOW - 2 * DAY, expiresAt: NOW + DAY },
        { permission: 'app:vault', grantedBy: 'x', grantedAt: NOW - 9 * DAY, expiresAt: NOW - DAY },
        { permission: 'app:finance', grantedBy: 'x', grantedAt: NOW, expiresAt: null },
      ],
    });
    const p = effectivePermissions(u, roles, NOW);
    expect(p.has('app:crm')).toBe(true);
    expect(p.has('app:finance')).toBe(true);
    expect(p.has('app:vault')).toBe(false);
  });
  it('gives deactivated users nothing', () => {
    expect(effectivePermissions(user({ active: false, roleIds: ['admin'] }), roles, NOW).size).toBe(0);
  });
  it('resolves wildcards through hasPermission', () => {
    expect(hasPermission(effectivePermissions(user({ roleIds: ['admin'] }), roles), 'hub.roles.manage')).toBe(true);
    const apps = effectivePermissions(user({ roleIds: ['apps-all'] }), roles);
    expect(hasPermission(apps, 'app:anything')).toBe(true);
    expect(hasPermission(apps, 'hub.roles.manage')).toBe(false);
  });
});

describe('clearance & escalation guards', () => {
  it('uses the highest role clearance', () => {
    expect(clearanceOf(user({ roleIds: ['emp', 'mgr'] }), roles)).toBe(3);
    expect(clearanceOf(null, roles)).toBe(0);
  });
  it('blocks assigning roles above your own clearance', () => {
    expect(canAssignRole(4, roles[0])).toBe(false);
    expect(canAssignRole(4, roles[3])).toBe(true);
  });
});

describe('canReviewRequest (delegated approval)', () => {
  it('requires the review permission AND holding the app', () => {
    const mgr = effectivePermissions(user({ roleIds: ['mgr'] }), roles);
    expect(canReviewRequest(mgr, 'crm').ok).toBe(true);
    expect(canReviewRequest(mgr, 'devhub').ok).toBe(false);
    const eng = effectivePermissions(user({ roleIds: ['eng'] }), roles);
    expect(canReviewRequest(eng, 'devhub').ok).toBe(false);
  });
});

describe('computeAppAccess', () => {
  const apps = [
    app('mail'),
    app('crm'),
    app('devhub'),
    app('vault', { discoverable: false }),
    app('old', { enabled: false }),
  ];
  const requests: AccessRequest[] = [
    { id: 'r1', userId: 'u1', appId: 'devhub', reason: 'x'.repeat(12), duration: '7d', status: 'pending', createdAt: NOW },
  ];

  it('classifies granted / pending / locked and hides non-discoverable + disabled apps', () => {
    const u = user({ grants: [{ permission: 'app:crm', grantedBy: 'm', grantedAt: NOW, expiresAt: NOW + 3 * DAY }] });
    const res = computeAppAccess(u, roles, apps, requests, NOW);
    const by = Object.fromEntries(res.map((r) => [r.app.id, r]));
    expect(by.mail.access).toBe('granted');
    expect(by.mail.expiresAt).toBeUndefined();
    expect(by.crm.access).toBe('granted');
    expect(by.crm.expiresAt).toBe(NOW + 3 * DAY);
    expect(by.devhub.access).toBe('pending');
    expect(by.vault).toBeUndefined();
    expect(by.old).toBeUndefined();
  });

  it('shows disabled and hidden apps to app managers', () => {
    const r2: Role = { id: 'appmgr', name: 'AppMgr', description: '', clearance: 3, color: '#000', permissions: ['hub.apps.manage'] };
    const res = computeAppAccess(user({ roleIds: ['appmgr'] }), [...roles, r2], apps, [], NOW);
    const by = Object.fromEntries(res.map((r) => [r.app.id, r]));
    expect(by.old.access).toBe('disabled');
    expect(by.vault.access).toBe('locked');
  });
});

describe('explainAccess & risk', () => {
  it('explains role-based and grant-based access', () => {
    const u = user({ roleIds: ['emp', 'eng'], grants: [{ permission: 'app:crm', grantedBy: 'm', grantedAt: NOW, expiresAt: null }] });
    expect(explainAccess(u, roles, 'app:devhub', NOW).roles.map((r) => r.id)).toEqual(['eng']);
    expect(explainAccess(u, roles, 'app:crm', NOW).grant?.grantedBy).toBe('m');
  });
  it('scores sensitive, permanent, low-clearance requests as high risk', () => {
    const contractor: Role = { id: 'c', name: 'C', description: '', clearance: 1, color: '#000', permissions: [] };
    const u = user({ roleIds: ['c'] });
    expect(requestRisk(app('vault', { category: 'Security' }), u, [contractor], 'permanent')).toBe('high');
    expect(requestRisk(app('wiki'), user(), roles, '7d')).toBe('low');
  });
});
