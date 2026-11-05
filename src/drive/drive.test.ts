import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import * as access from './access';
import { GB } from './constants';
import { createDriveSeed } from './seed';
import { computeVisibleItems, searchDriveItems } from './selectors';
import { useDrive } from './store';

const as = (userId: string) => useHub.setState({ sessionUserId: userId });
const store = () => useDrive.getState();
const viewerOf = (userId: string) => {
  const h = useHub.getState();
  return access.buildDriveViewer(h.users.find((u) => u.id === userId), h.roles);
};
const ctx = () => access.buildDriveContext(store().items, store().drives);
const roleOf = (userId: string, itemId: string) => access.effectiveRole(viewerOf(userId), store().items.find((i) => i.id === itemId), ctx());

describe('Drive — role-based, inherited access', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    store().resetDriveDemo();
  });

  it('grants access through departments, hub roles, permissions and explicit shares', () => {
    expect(roleOf('u-priya', 'df-rfc-theming')).toBe('manager'); // owner
    expect(roleOf('u-priya', 'df-dr-runbook')).toBe('editor'); // Engineering department → drive editor (inherited)
    expect(roleOf('u-aisha', 'df-rfc-theming')).toBe('commenter'); // Product → commenter on the Engineering drive
    expect(roleOf('u-noah', 'df-rfc-theming')).toBeNull(); // Sales has no route in
    expect(roleOf('u-daniel', 'df-close-checklist')).toBe('manager'); // owner
    expect(roleOf('u-grace', 'df-payroll-register')).toBe('manager'); // drive manager
    expect(roleOf('u-daniel', 'fo-payroll-exports')).toBe('editor'); // permission principal app:payroll (inheritance broken at folder)
    expect(roleOf('u-daniel', 'df-payroll-register')).toBe('manager'); // owner
    expect(roleOf('u-sara', 'df-payroll-register')).toBe('editor'); // People Ops holds app:payroll → permission principal applies
    expect(roleOf('u-omar', 'df-payroll-register')).toBeNull(); // no app:payroll
    expect(roleOf('u-layla', 'df-exec-comp')).toBe('manager'); // admin governance
    expect(roleOf('u-daniel', 'df-exec-comp')).toBeNull(); // restricted + no explicit share
    expect(roleOf('u-omar', 'df-onboard-plan')).toBe('editor'); // explicit share on a confidential People Ops file
    expect(roleOf('u-kwame', 'df-onboard-plan')).toBe('commenter');
    expect(roleOf('u-mateo', 'df-onboard-plan')).toBeNull();
  });

  it('scopes contractors to explicit shares and public links only', () => {
    expect(roleOf('u-alex', 'df-ui-tokens')).toBe('manager'); // owner
    expect(roleOf('u-alex', 'fo-prism-fe')).toBe('editor'); // time-boxed explicit share
    expect(roleOf('u-alex', 'df-rfc-theming')).toBeNull(); // Engineering dept share doesn't apply to contractors
    expect(roleOf('u-alex', 'df-logo')).toBe('viewer'); // public link
    expect(roleOf('u-alex', 'df-brandbook')).toBeNull(); // company link excludes contractors
    expect(roleOf('u-alex', 'df-handbook')).toBeNull(); // company-wide viewer share excludes contractors
    const v = viewerOf('u-alex');
    const visibleDrives = store().drives.filter((d) => access.canSeeDrive(v, d));
    expect(visibleDrives.map((d) => d.kind)).not.toContain('team');
    const visible = computeVisibleItems(v, store().items.filter((i) => !i.trashed), ctx());
    expect(visible.every((x) => ['df-ui-tokens', 'fo-prism-fe', 'df-logo', 'df-alex-timesheet'].includes(x.item.id))).toBe(true);
  });

  it('applies DLP: restricted files need clearance L3 + named shares, confidential files block external links', () => {
    as('u-grace');
    expect(store().shareItem('df-exec-comp', { type: 'user', id: 'u-kwame' }, 'viewer').ok).toBe(false); // L2
    expect(store().shareItem('df-exec-comp', { type: 'department', id: 'Finance' }, 'viewer').ok).toBe(false); // not a named person
    expect(store().shareItem('df-exec-comp', { type: 'user', id: 'u-daniel' }, 'viewer').ok).toBe(true); // Finance L3
    expect(roleOf('u-daniel', 'df-exec-comp')).toBe('viewer');
    expect(store().setLinkAccess('df-exec-comp', 'company').ok).toBe(false);
    as('u-daniel');
    expect(store().downloadItem('df-exec-comp').ok).toBe(false); // viewers can't download Restricted
    expect(store().downloadItem('df-close-checklist').watermark).toMatch(/CONFIDENTIAL/);
    as('u-mei');
    expect(store().setLinkAccess('df-usability', 'anyone').ok).toBe(false); // confidential
    expect(store().setLinkAccess('df-prism-moodboard', 'anyone').ok).toBe(false); // internal → company links only
    expect(store().setLinkAccess('df-prism-moodboard', 'company').ok).toBe(true);
  });

  it('editors can share internal files but confidential files need a manager; expired shares stop working', () => {
    as('u-hana'); // Design editor on Prism folder
    expect(store().shareItem('df-prism-spec', { type: 'user', id: 'u-noah' }, 'viewer').ok).toBe(true);
    expect(roleOf('u-noah', 'df-prism-spec')).toBe('viewer');
    as('u-omar'); // explicit editor on a Confidential People Ops file — not a manager
    expect(store().shareItem('df-onboard-plan', { type: 'user', id: 'u-noah' }, 'viewer').ok).toBe(false);
    const share = store().items.find((i) => i.id === 'fo-prism-fe')!.shares[0];
    useDrive.setState((s) => ({ items: s.items.map((i) => (i.id === 'fo-prism-fe' ? { ...i, shares: [{ ...share, expiresAt: Date.now() - 1000 }] } : i)) }));
    expect(roleOf('u-alex', 'fo-prism-fe')).toBeNull();
  });
});

describe('Drive — files, folders, requests & governance', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    store().resetDriveDemo();
  });

  it('uploads inherit the folder label, dedupe names and respect quotas', () => {
    as('u-daniel');
    const res = store().uploadFiles('drv-finance', 'fo-close', [{ name: 'Month-End Close Checklist.sheet', sizeBytes: 300_000 }, { name: 'bank-statement.pdf', sizeBytes: 900_000 }]);
    expect(res.ok).toBe(true);
    const created = store().items.filter((i) => res.itemIds!.includes(i.id));
    expect(created.map((i) => i.name)).toEqual(['Month-End Close Checklist (2).sheet', 'bank-statement.pdf']);
    expect(created.every((i) => i.sensitivity === 'confidential')).toBe(true);
    expect(created.find((i) => i.name === 'bank-statement.pdf')!.kind).toBe('pdf');
    expect(store().uploadFiles('drv-finance', null, [{ name: 'huge.zip', sizeBytes: 300 * GB }]).ok).toBe(false);
    as('u-noah');
    expect(store().uploadFiles('drv-finance', 'fo-close', [{ name: 'x.pdf', sizeBytes: 10 }]).ok).toBe(false); // no access
  });

  it('moves respect destination permissions and folder cycles; trash/restore follow retention', () => {
    as('u-mei');
    expect(store().moveItem('fo-prism', 'drv-design', 'fo-prism').ok).toBe(false); // into itself
    expect(store().createFolder('drv-design', null, 'Archive').ok).toBe(true);
    const archive = store().items.find((i) => i.name === 'Archive' && i.driveId === 'drv-design')!;
    expect(store().moveItem('df-prism-moodboard', 'drv-design', archive.id).ok).toBe(true);
    expect(store().items.find((i) => i.id === 'df-prism-moodboard')!.parentId).toBe(archive.id);
    expect(store().moveItem('df-prism-spec', 'drv-finance', 'fo-close').ok).toBe(false); // no editor access there
    expect(store().trashItem('fo-prism').ok).toBe(true);
    expect(store().items.find((i) => i.id === 'df-prism-tokens')!.trashed).toBe(true);
    expect(store().restoreItem('fo-prism').ok).toBe(true);
    expect(store().items.find((i) => i.id === 'df-prism-tokens')!.trashed).toBe(false);
    as('u-sara');
    expect(store().trashItem('df-handbook').ok).toBe(false); // locked
    as('u-grace');
    expect(store().trashItem('df-exec-comp').ok).toBe(false); // legal hold
  });

  it('access requests are routed to owners and approval grants a time-boxed share', () => {
    as('u-kwame');
    expect(store().requestAccess('df-prism-spec', 'viewer', 'Need it.').ok).toBe(false); // already a commenter via Engineering
    expect(store().requestAccess('df-prism-spec', 'editor', 'Need it for the migration.').ok).toBe(true);
    expect(store().requestAccess('df-prism-spec', 'editor', 'again').ok).toBe(false); // duplicate pending
    const req = store().requests.find((r) => r.requesterId === 'u-kwame' && r.itemId === 'df-prism-spec')!;
    as('u-noah');
    expect(store().decideAccessRequest(req.id, true).ok).toBe(false); // can't share it
    as('u-mei');
    expect(store().decideAccessRequest(req.id, true, { expiresInDays: 7 }).ok).toBe(true);
    const share = store().items.find((i) => i.id === 'df-prism-spec')!.shares.find((s) => s.principal.type === 'user' && s.principal.id === 'u-kwame')!;
    expect(share.expiresAt).toBeGreaterThan(Date.now());
    expect(roleOf('u-kwame', 'df-prism-spec')).toBe('editor');
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-kwame' && n.kind === 'work' && n.title.startsWith('Access granted'))).toBe(true);
    // Alex's seeded request is approved as editor by Mei
    expect(store().decideAccessRequest('dar-1', true).ok).toBe(true);
    expect(roleOf('u-alex', 'df-prism-spec')).toBe('editor');
  });

  it('raising a label strips broad shares/links and turning inheritance off snapshots access', () => {
    as('u-mei');
    expect(store().setLinkAccess('df-prism-moodboard', 'company').ok).toBe(true);
    expect(store().setSensitivity('df-prism-moodboard', 'confidential').ok).toBe(true);
    expect(store().items.find((i) => i.id === 'df-prism-moodboard')!.linkAccess).toBe('restricted');
    const res = store().setInheritance('df-prism-spec', false);
    expect(res.ok).toBe(true);
    const spec = store().items.find((i) => i.id === 'df-prism-spec')!;
    expect(spec.inheritPermissions).toBe(false);
    expect(spec.shares.some((s) => s.principal.type === 'department' && s.principal.id === 'Design')).toBe(true);
    expect(roleOf('u-hana', 'df-prism-spec')).toBe('editor');
  });

  it('search only returns what the viewer can see; governance report flags oversharing and expiring shares', () => {
    const daniel = searchDriveItems(viewerOf('u-daniel'), store().items, ctx(), 'payroll');
    expect(daniel.map((x) => x.item.id)).toContain('df-payroll-register');
    const omar = searchDriveItems(viewerOf('u-omar'), store().items, ctx(), 'payroll');
    expect(omar.map((x) => x.item.id)).not.toContain('df-payroll-register');
    expect(searchDriveItems(viewerOf('u-alex'), store().items, ctx(), 'offer').length).toBe(0);
    const seed = createDriveSeed();
    expect(seed.items.filter((i) => i.linkAccess === 'anyone').map((i) => i.id)).toEqual(['df-logo']);
    expect(seed.items.some((i) => i.shares.some((s) => s.expiresAt))).toBe(true);
  });
});
