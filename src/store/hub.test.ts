/**
 * Store-level tests: verify that mutations are enforced "server-side"
 * regardless of what the UI shows.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// In-memory localStorage so the persist middleware works under Node.
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

type Store = typeof import('./hub').useHub;
let useHub: Store;

beforeAll(async () => {
  ({ useHub } = await import('./hub'));
});

beforeEach(() => {
  useHub.getState().resetDemo();
  useHub.getState().logout();
});

const s = () => useHub.getState();
const as = (id: string) => expect(s().login(id).ok).toBe(true);

describe('permission enforcement', () => {
  it('denies role edits for users without hub.roles.manage and audits the attempt', () => {
    as('u-alex');
    const res = s().setRolePermission('employee', 'app:crm', true);
    expect(res.ok).toBe(false);
    expect(s().audit[0]).toMatchObject({ outcome: 'denied', actorId: 'u-alex' });
    expect(s().roles.find((r) => r.id === 'employee')!.permissions).not.toContain('app:crm');
  });

  it('blocks privilege escalation above the actor’s clearance', () => {
    as('u-sara'); // People Ops, L4, has hub.users.manage
    const res = s().setUserRoles('u-fatima', ['people-ops', 'employee', 'admin']);
    expect(res.ok).toBe(false);
    expect(s().audit[0]).toMatchObject({ action: 'user.roles.blocked', severity: 'critical' });
    expect(s().users.find((u) => u.id === 'u-fatima')!.roleIds).not.toContain('admin');
  });

  it('prevents removing your own System Admin role (lockout protection)', () => {
    as('u-layla');
    expect(s().setUserRoles('u-layla', ['employee']).ok).toBe(false);
  });

  it('runs the full request → approve → grant → expiry-aware access flow', () => {
    as('u-alex');
    expect(s().requestAccess('crm', 'short', '7d').ok).toBe(false); // justification too short
    expect(s().requestAccess('crm', 'Need CRM to review onboarding feedback', '7d').ok).toBe(true);
    const req = s().requests.find((r) => r.userId === 'u-alex' && r.appId === 'crm' && r.status === 'pending')!;

    as('u-omar'); // manager who holds CRM
    expect(s().reviewRequest(req.id, 'approved', { duration: '30d' }).ok).toBe(true);
    const grant = s().users.find((u) => u.id === 'u-alex')!.grants.find((g) => g.permission === 'app:crm')!;
    expect(grant.grantedBy).toBe('u-omar');
    expect(grant.expiresAt! - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(s().notifications.some((n) => n.userId === 'u-alex' && n.title.includes('Access granted'))).toBe(true);
  });

  it('enforces delegated approval — reviewers must hold the access themselves', () => {
    as('u-sara'); // can review, but does not hold Cloud Console
    const res = s().reviewRequest('r-1', 'approved');
    expect(res.ok).toBe(false);
    expect(s().requests.find((r) => r.id === 'r-1')!.status).toBe('pending');
  });

  it('blocks self-approval (separation of duties)', () => {
    as('u-omar');
    expect(s().requestAccess('payroll', 'Reviewing team compensation bands', '7d').ok).toBe(true);
    const req = s().requests.find((r) => r.userId === 'u-omar' && r.appId === 'payroll')!;
    // Even an admin path can't be used by the requester themself:
    expect(s().reviewRequest(req.id, 'approved').ok).toBe(false);
  });

  it('refuses sign-in for deactivated accounts', () => {
    expect(s().login('u-elena').ok).toBe(false);
  });

  it('only lets publishers post announcements and targets the audience', () => {
    as('u-mei');
    expect(s().publishAnnouncement({ title: 'Hello', body: 'Hello world!!', category: 'Company', priority: 'normal', audienceRoleIds: [], pinned: false }).ok).toBe(false);
    as('u-sara');
    const before = s().notifications.length;
    expect(
      s().publishAnnouncement({ title: 'Eng only', body: 'Platform news for engineers', category: 'Product', priority: 'normal', audienceRoleIds: ['engineering'], pinned: false }).ok,
    ).toBe(true);
    const fresh = s().notifications.slice(0, s().notifications.length - before);
    const recipients = new Set(fresh.map((n) => n.userId));
    expect(recipients.has('u-priya')).toBe(true); // engineering
    expect(recipients.has('u-mei')).toBe(false); // not engineering
  });
});
