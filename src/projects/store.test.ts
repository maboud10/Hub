/**
 * Store-level tests: permissions are enforced "server-side" regardless of UI,
 * security-relevant actions are audited, and people get notified.
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
type Store = typeof import('./store').useProjects;
type Access = typeof import('./access');
type Bridge = typeof import('./public').api;
let useHub: Hub;
let useProjects: Store;
let access: Access;
let api: Bridge;
let currentViewer: typeof import('@/lib/appBridge').currentViewer;

beforeAll(async () => {
  ({ useHub } = await import('@/store/hub'));
  ({ useProjects } = await import('./store'));
  access = await import('./access');
  ({ api } = await import('./public'));
  ({ currentViewer } = await import('@/lib/appBridge'));
});

beforeEach(() => {
  useHub.getState().resetDemo();
  useProjects.getState().resetDemo();
});

const s = () => useProjects.getState();
const as = (id: string) => expect(useHub.getState().login(id).ok).toBe(true);
const actor = (id: string) => {
  as(id);
  const v = currentViewer()!;
  return access.actorFrom(v.user, v.perms);
};
const t = (id: string) => s().tasks.find((x) => x.id === id)!;
const p = (id: string) => s().projects.find((x) => x.id === id)!;

describe('privacy & roles', () => {
  it('scopes visibility by privacy, department, membership and contractor status', () => {
    const mei = actor('u-mei');
    const ids = (a: ReturnType<typeof actor>) => access.visibleProjects(s().projects, a).map((x) => x.id).sort();
    expect(ids(mei)).toEqual(['prj-brand', 'prj-gcc', 'prj-prism', 'prj-q4-allhands']);
    const alex = actor('u-alex');
    expect(ids(alex)).toEqual(['prj-prism']);
    const omar = actor('u-omar');
    expect(ids(omar)).not.toContain('prj-exec-offsite');
    expect(ids(omar)).toContain('prj-eucell');
    const layla = actor('u-layla');
    expect(ids(layla)).toContain('prj-exec-offsite');
  });

  it('gives projects.manage admin rights on non-private projects only', () => {
    const omar = actor('u-omar');
    expect(access.projectAccess(p('prj-gcc'), omar)).toBe('admin');
    expect(access.projectAccess(p('prj-exec-offsite'), omar)).toBeNull();
    const mei = actor('u-mei');
    expect(access.projectAccess(p('prj-gcc'), mei)).toBe('viewer');
    expect(access.canEditProject(p('prj-gcc'), mei)).toBe(false);
    expect(access.readOnlyReason(p('prj-gcc'), mei, 'Aisha Bello')).toBe('View only. Ask Aisha for edit access.');
  });

  it('lets assignees with comment access complete their own work', () => {
    as('u-sara');
    const r = s().createTask({ title: 'Design the demo badges', projectId: 'prj-q4-allhands', assigneeId: 'u-mei' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mei = actor('u-mei');
    expect(access.canEditTask(t(r.taskId), p('prj-q4-allhands'), mei)).toBe(false);
    expect(access.canCompleteTask(t(r.taskId), p('prj-q4-allhands'), mei)).toBe(true);
    expect(s().completeTask(r.taskId, true).ok).toBe(true);
    expect(s().updateTask(r.taskId, { title: 'Hijack' }).ok).toBe(false);
  });
});

describe('tasks', () => {
  it('creates tasks for editors and refuses invisible or read-only projects', () => {
    as('u-alex');
    const r = s().createTask({ title: 'Token codemod', projectId: 'prj-prism', assigneeId: 'u-alex', dueDate: '2030-01-10' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(t(r.taskId)).toMatchObject({ number: 17, projectId: 'prj-prism', creatorId: 'u-alex' });
    expect(s().createTask({ title: 'Sneak', projectId: 'prj-gcc' })).toEqual({ ok: false, error: 'Project not found.' });
    as('u-mei');
    expect(s().createTask({ title: 'Peek', projectId: 'prj-gcc' }).ok).toBe(false);
  });

  it('keeps personal tasks personal', () => {
    as('u-mei');
    const r = s().createTask({ title: 'Buy a plant' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(t(r.taskId)).toMatchObject({ projectId: null, assigneeId: 'u-mei' });
    expect(s().createTask({ title: 'Delegate', assigneeId: 'u-omar' }).ok).toBe(false);
  });

  it('notifies a new assignee in the Hub bell and the Inbox with a deep link', () => {
    as('u-mei');
    expect(s().updateTask('t-p13', { assigneeId: 'u-hana' }).ok).toBe(true);
    const bell = useHub.getState().notifications.find((n) => n.userId === 'u-hana');
    expect(bell).toMatchObject({ kind: 'work', link: '/projects/p/prj-prism?task=t-p13' });
    expect(s().inbox.find((i) => i.userId === 'u-hana' && i.kind === 'assigned')?.taskId).toBe('t-p13');
  });

  it('turns @mentions into notifications for people who can see the task', () => {
    as('u-mei');
    const r = s().addComment('t-p3', '@Omar @Layla audit is nearly done — @Alex please review');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mentioned.sort()).toEqual(['u-alex', 'u-layla', 'u-omar']);
    const bell = useHub.getState().notifications.filter((n) => n.title.includes('mentioned you') && n.link === '/projects/p/prj-prism?task=t-p3');
    expect(bell.map((n) => n.userId).sort()).toEqual(['u-alex', 'u-layla', 'u-omar']);
  });

  it('never notifies people about projects they cannot open', () => {
    as('u-layla');
    s().addComment('t-x1', 'Thoughts @Omar?');
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-omar' && n.link?.includes('t-x1'))).toBe(false);
    expect(s().inbox.some((i) => i.userId === 'u-omar' && i.taskId === 't-x1')).toBe(false);
  });

  it('completes tasks moved into a Done column and fires automations', () => {
    as('u-omar');
    const before = s().rules.find((r) => r.id === 'r-prism-2')!.runs;
    expect(s().moveTask('t-p2', { sectionId: 'prj-prism-s4' }).ok).toBe(true);
    expect(t('t-p2').tags).toContain('in-review');
    expect(s().rules.find((r) => r.id === 'r-prism-2')!.runs).toBe(before + 1);
    expect(s().inbox.some((i) => i.userId === 'u-mei' && i.kind === 'automation' && i.taskId === 't-p2')).toBe(true);
    expect(s().moveTask('t-p2', { sectionId: 'prj-prism-s5' }).ok).toBe(true);
    expect(t('t-p2').completedAt).toBeTruthy();
    expect(s().moveTask('t-p2', { sectionId: 'prj-prism-s3', index: 0 }).ok).toBe(true);
    expect(t('t-p2').completedAt).toBeUndefined();
  });

  it('reorders within a section', () => {
    as('u-mei');
    s().moveTask('t-p16', { sectionId: 'prj-prism-s3', index: 0 });
    const order = s()
      .tasks.filter((x) => x.sectionId === 'prj-prism-s3')
      .sort((a, b) => a.order - b.order)
      .map((x) => x.id);
    expect(order[0]).toBe('t-p16');
  });

  it('prevents dependency loops', () => {
    as('u-mei');
    const r = s().addDependency('t-p1', 't-p6');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/loop/);
    expect(s().addDependency('t-p13', 't-p4').ok).toBe(true);
  });

  it('deletes with undo, restoring dependency links', () => {
    as('u-mei');
    const r = s().deleteTasks(['t-p1']);
    expect(r.ok).toBe(true);
    expect(t('t-p2').blockedBy).not.toContain('t-p1');
    if (r.ok) s().restoreTasks(r.snapshot);
    expect(t('t-p1')).toBeTruthy();
    expect(t('t-p2').blockedBy).toContain('t-p1');
  });

  it('only lets the approver decide, then notifies the requester', () => {
    as('u-omar');
    expect(s().decideApproval('t-m6', 'approved').ok).toBe(false);
    expect(s().completeTask('t-m6', true).ok).toBe(false);
    as('u-layla');
    expect(s().decideApproval('t-m6', 'approved', 'Looks good').ok).toBe(true);
    expect(t('t-m6')).toMatchObject({ approval: { state: 'approved', note: 'Looks good' } });
    expect(t('t-m6').completedAt).toBeTruthy();
    expect(s().inbox.some((i) => i.userId === 'u-ethan' && i.kind === 'decision')).toBe(true);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.approval.decide', outcome: 'success' });
  });

  it('keeps change requests open', () => {
    as('u-daniel');
    expect(s().decideApproval('t-g5', 'changes', 'Cap prepay at 5%').ok).toBe(true);
    expect(t('t-g5').completedAt).toBeUndefined();
    expect(t('t-g5').approval?.state).toBe('changes');
  });
});

describe('projects', () => {
  it('blocks contractors from creating projects and audits the attempt', () => {
    as('u-alex');
    const r = s().createProject({ name: 'Side quest', icon: '🧪', color: '#fff', department: 'Engineering', privacy: 'public', template: 'kanban', members: [] });
    expect(r.ok).toBe(false);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.project.create', outcome: 'denied', actorId: 'u-alex' });
  });

  it('creates a project from a template with a unique key and starter tasks', () => {
    as('u-omar');
    const r = s().createProject({ name: 'Billing Revamp', icon: '💳', color: '#a78bfa', department: 'Engineering', privacy: 'team', template: 'sprint', members: [{ userId: 'u-priya', role: 'editor' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const proj = p(r.projectId);
    expect(proj.key).toBe('BR');
    expect(proj.members.map((m) => m.role)).toEqual(['owner', 'editor']);
    expect(s().tasks.filter((x) => x.projectId === r.projectId)).toHaveLength(4);
    expect(s().users['u-omar'].starred).toContain(r.projectId);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.project.create', outcome: 'success' });
  });

  it('restricts privacy and role changes to owners/admins and audits them', () => {
    as('u-hana');
    expect(s().setPrivacy('prj-prism', 'private').ok).toBe(false);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.project.privacy', outcome: 'denied' });
    as('u-mei');
    expect(s().setPrivacy('prj-prism', 'team').ok).toBe(true);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.project.privacy', outcome: 'success', severity: 'warning' });
    expect(s().setMemberRole('prj-prism', 'u-alex', 'viewer').ok).toBe(true);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.member.role', detail: 'Alex Rivera: editor → viewer' });
    as('u-alex');
    expect(s().createTask({ title: 'Nope', projectId: 'prj-prism' }).ok).toBe(false);
  });

  it('transfers ownership instead of leaving a project ownerless', () => {
    as('u-mei');
    expect(s().setMemberRole('prj-prism', 'u-mei', null).ok).toBe(false);
    expect(s().setMemberRole('prj-prism', 'u-hana', 'owner').ok).toBe(true);
    expect(p('prj-prism').ownerId).toBe('u-hana');
    expect(access.memberRole(p('prj-prism'), 'u-mei')).toBe('editor');
  });

  it('deletes projects (critical audit) and restores them on undo', () => {
    as('u-mei');
    const r = s().deleteProject('prj-prism');
    expect(r.ok).toBe(true);
    expect(s().projects.some((x) => x.id === 'prj-prism')).toBe(false);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'projects.project.delete', severity: 'critical' });
    if (r.ok) s().restoreProject(r.snapshot);
    expect(s().tasks.filter((x) => x.projectId === 'prj-prism')).toHaveLength(16);
    expect(s().portfolios.find((x) => x.id === 'pf-bets')!.projectIds).toContain('prj-prism');
  });

  it('posts status updates that update the project and notify members', () => {
    as('u-layla');
    expect(s().postStatusUpdate('prj-mfa', { status: 'off-track', title: 'Wave 2 slipping', body: 'Needs a call.' }).ok).toBe(true);
    expect(p('prj-mfa').status).toBe('off-track');
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-omar' && n.title.includes('off track'))).toBe(true);
  });
});

describe('bridge', () => {
  const viewer = () => currentViewer()!;

  it('lists only visible projects with edit flags', () => {
    as('u-alex');
    const list = api.listProjects(viewer());
    expect(list.map((x) => x.id)).toEqual(['prj-prism']);
    expect(list[0]).toMatchObject({ canEdit: true, keyResultIds: ['kr-prism-adoption', 'kr-a11y-score'], to: '/projects/p/prj-prism' });
    as('u-mei');
    expect(api.listProjects(viewer(), { writableOnly: true }).map((x) => x.id).sort()).toEqual(['prj-brand', 'prj-prism']);
  });

  it('creates personal or project tasks and re-checks permissions', () => {
    as('u-alex');
    const personal = api.createTask(viewer(), { title: 'Follow up from chat', source: { app: 'chat', label: 'Pulse Chat · #general', to: '/chat' } });
    expect(personal.ok).toBe(true);
    if (personal.ok) expect(personal.to).toMatch(/^\/projects\?task=/);
    const denied = api.createTask(viewer(), { title: 'x', projectId: 'prj-mfa' });
    expect(denied.ok).toBe(false);
    const project = api.createTask(viewer(), { title: 'From Drive', projectId: 'prj-prism', dueDate: '2030-02-01' });
    expect(project.ok).toBe(true);
    if (project.ok) expect(project.to).toMatch(/^\/projects\/p\/prj-prism\?task=/);
  });

  it('returns completed work the viewer can see', () => {
    as('u-omar');
    const since = Date.now() - 7 * 86_400_000;
    const work = api.completedWork(viewer(), 'u-omar', since);
    expect(work.map((w) => w.id)).toContain('t-pl2');
    as('u-alex');
    expect(api.completedWork(viewer(), 'u-omar', since).map((w) => w.id)).not.toContain('t-pl2');
  });

  it('offers palette entries scoped to the viewer', () => {
    as('u-alex');
    const entries = api.paletteEntries(viewer());
    expect(entries.some((e) => e.id === 'projects:new-project')).toBe(false);
    expect(entries.some((e) => e.id === 'projects:workload')).toBe(false);
    expect(entries.some((e) => e.id === 'projects:project:prj-gcc')).toBe(false);
    expect(entries.find((e) => e.id === 'projects:task:t-p2')?.to).toBe('/projects/p/prj-prism?task=t-p2');
    as('u-omar');
    const omar = api.paletteEntries(viewer());
    expect(omar.some((e) => e.id === 'projects:workload')).toBe(true);
    expect(omar.find((e) => e.id === 'projects:project:prj-mfa')?.subtitle).toBe('MFA · At risk · IT & Security');
  });

  it('resets demo data', () => {
    as('u-mei');
    s().deleteTasks(['t-p1']);
    api.resetDemo();
    expect(t('t-p1')).toBeTruthy();
  });
});
