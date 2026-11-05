import { beforeEach, describe, expect, it } from 'vitest';
import { migrateV5toV6, useHub } from '@/store/hub';
import { createSeed } from '@/data/seed';
import { addDaysISO, todayISO } from '@/hr/calendar';
import * as access from './access';
import { computeProgress, draftStatusUpdate, suggestFocus, wouldCreateCycle } from './engine';
import { computeMyTasks } from './selectors';
import { useProjects } from './store';

const as = (userId: string) => useHub.setState({ sessionUserId: userId });
const viewerOf = (userId: string) => {
  const h = useHub.getState();
  return access.buildProjectsViewer(h.users.find((u) => u.id === userId), h.roles);
};
const store = () => useProjects.getState();

describe('Projects — visibility, privacy & contractor scoping', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    store().resetProjectsDemo();
  });

  it('resolves project roles from privacy, department and membership', () => {
    const prism = store().projects.find((p) => p.id === 'prj-prism')!; // public · Design
    const close = store().projects.find((p) => p.id === 'prj-close')!; // private · Finance
    const mfa = store().projects.find((p) => p.id === 'prj-mfa')!; // team · IT & Security
    expect(access.projectRoleFor(viewerOf('u-mei'), prism)).toBe('owner');
    expect(access.projectRoleFor(viewerOf('u-hana'), prism)).toBe('editor'); // Design colleague
    expect(access.projectRoleFor(viewerOf('u-daniel'), prism)).toBe('commenter'); // public → other employees comment
    expect(access.projectRoleFor(viewerOf('u-alex'), prism)).toBe('editor'); // contractor, but explicit member
    expect(access.projectRoleFor(viewerOf('u-alex'), mfa)).toBeNull(); // contractor without membership
    expect(access.projectRoleFor(viewerOf('u-mei'), close)).toBeNull(); // private
    expect(access.projectRoleFor(viewerOf('u-daniel'), close)).toBe('editor');
    expect(access.projectRoleFor(viewerOf('u-sara'), close)).toBe('viewer'); // projects.manage → governance read
    expect(access.projectRoleFor(viewerOf('u-ethan'), mfa)).toBe('editor'); // team privacy → department
    expect(access.projectRoleFor(viewerOf('u-noah'), mfa)).toBeNull(); // other department
  });

  it('contractors cannot create projects and non-members cannot edit tasks', () => {
    as('u-alex');
    expect(store().createProject({ name: 'Shadow project', privacy: 'private' }).ok).toBe(false);
    as('u-daniel');
    expect(store().createTask({ projectId: 'prj-prism', title: 'Sneaky edit' }).ok).toBe(false); // commenter
    expect(store().addComment('t-p1', 'Looks great!').ok).toBe(true); // but can comment
  });
});

describe('Projects — templates, automations, dependencies & approvals', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    store().resetProjectsDemo();
  });

  it('creates a project from a template with dated tasks and default rules', () => {
    as('u-omar');
    const today = todayISO();
    const res = store().createProject({ name: 'Nova Docs launch', privacy: 'team', templateId: 'tpl-launch', startDate: today });
    expect(res.ok).toBe(true);
    const p = store().projects.find((x) => x.id === res.projectId)!;
    expect(p.key).toBe('NDL');
    expect(p.sections.map((s) => s.name)).toEqual(['Planning', 'Build', 'Launch readiness', 'Launch week', 'Done']);
    const tasks = store().tasks.filter((t) => t.projectId === p.id);
    expect(tasks.length).toBe(8);
    expect(tasks.find((t) => t.type === 'milestone')?.dueDate).toBe(addDaysISO(today, 21));
    expect(tasks.find((t) => t.title.startsWith('Enable sales'))?.subtasks.length).toBe(3);
    const rules = store().rules.filter((r) => r.projectId === p.id);
    expect(rules.map((r) => r.trigger)).toEqual(['task_moved_to_section', 'due_date_passed']);
  });

  it('moving a task to Done completes it via the rule, and completing a recurring task spawns the next one', () => {
    as('u-mei');
    const prism = store().projects.find((p) => p.id === 'prj-prism')!;
    const done = prism.sections.find((s) => s.name === 'Done')!;
    expect(store().moveTask('t-p4', done.id).ok).toBe(true);
    const moved = store().tasks.find((t) => t.id === 't-p4')!;
    expect(moved.status).toBe('done');
    expect(moved.completedAt).toBeDefined();
    expect(store().rules.find((r) => r.id === 'r-1')!.runs).toBe(12);

    const before = store().tasks.filter((t) => t.title === 'Weekly design crit').length;
    expect(store().completeTask('t-p12', true).ok).toBe(true);
    const after = store().tasks.filter((t) => t.title === 'Weekly design crit');
    expect(after.length).toBe(before + 1);
    expect(after.some((t) => t.status === 'todo' && t.dueDate === addDaysISO(store().tasks.find((t) => t.id === 't-p12')!.dueDate!, 7))).toBe(true);
  });

  it('blocks completion of dependent tasks and rejects circular dependencies', () => {
    as('u-alex');
    const blocked = store().completeTask('t-p2', true); // depends on t-p1 (in review)
    expect(blocked.ok).toBe(false);
    as('u-mei');
    expect(store().setDependency('t-p1', 't-p2', true).ok).toBe(false); // would create a cycle
    const byId = new Map(store().tasks.map((t) => [t.id, t]));
    expect(wouldCreateCycle('t-p1', 't-p2', byId)).toBe(true);
    expect(store().completeTask('t-p1', true).ok).toBe(true);
    as('u-alex');
    expect(store().completeTask('t-p2', true).ok).toBe(true);
  });

  it('WIP limits stop overloading a board column', () => {
    as('u-mei');
    const prism = store().projects.find((p) => p.id === 'prj-prism')!;
    const review = prism.sections.find((s) => s.name === 'In review')!; // wip 3, has 1
    expect(store().moveTask('t-p5', review.id).ok).toBe(true);
    expect(store().moveTask('t-p6', review.id).ok).toBe(true);
    expect(store().moveTask('t-p2', review.id).ok).toBe(false);
  });

  it('approvals enforce separation of duties and complete on approval', () => {
    as('u-daniel'); // raised CLOSE-2 → cannot approve it
    expect(store().decideApproval('t-c2', 'approved').ok).toBe(false);
    as('u-kwame'); // not the approver
    expect(store().decideApproval('t-c2', 'approved').ok).toBe(false);
    as('u-grace');
    expect(store().decideApproval('t-c2', 'changes_requested').ok).toBe(false); // needs a note
    expect(store().decideApproval('t-c2', 'approved', 'Ship it').ok).toBe(true);
    const t = store().tasks.find((x) => x.id === 't-c2')!;
    expect(t.status).toBe('done');
    expect(t.approval?.decision).toBe('approved');
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-daniel' && n.kind === 'work' && n.title.includes('Approval approved'))).toBe(true);
  });

  it('intake forms create triaged tasks for anyone with Projects access', () => {
    as('u-yusuf'); // Customer Success, not an all-hands member
    const res = store().submitForm('frm-aho', { 'f-title': 'Renewals playbook demo', 'f-pitch': 'How CS runs 90-day renewal plays.', 'f-format': 'Demo (10m)' });
    expect(res.ok).toBe(true);
    const task = store().tasks.find((t) => t.id === res.taskId)!;
    expect(task.assigneeId).toBe('u-mateo');
    expect(task.tags).toContain('demo-10m');
    expect(task.collaboratorIds).toContain('u-yusuf');
    expect(store().forms.find((f) => f.id === 'frm-aho')!.submissions).toBe(3);
  });

  it('sprint completion rolls unfinished work into the next sprint and records velocity', () => {
    as('u-mei');
    expect(store().startSprint('spr-15').ok).toBe(false); // one active at a time
    const res = store().completeSprint('spr-14', 'spr-15');
    expect(res.ok).toBe(true);
    const s14 = store().sprints.find((s) => s.id === 'spr-14')!;
    expect(s14.state).toBe('completed');
    expect(s14.completedPoints).toBeGreaterThan(0);
    expect(store().tasks.find((t) => t.id === 't-p2')!.sprintId).toBe('spr-15');
    expect(store().startSprint('spr-15').ok).toBe(true);
  });
});

describe('Projects — My Tasks, Nova focus, status drafts & migration', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    store().resetProjectsDemo();
  });

  it('buckets Mei’s tasks and ranks the overdue urgent audit first', () => {
    const today = todayISO();
    const v = viewerOf('u-mei')!;
    const visible = store().projects.filter((p) => access.projectRoleFor(v, p));
    const view = computeMyTasks('u-mei', visible, store().tasks, { starredProjectIds: [], recentProjectIds: [], buckets: {}, inboxReadAt: 0 }, today);
    expect(view.overdue.map((t) => t.id)).toContain('t-p3');
    expect(view.today.map((t) => t.id)).toContain('t-p3');
    expect(view.focus[0].task.id).toBe('t-p3');
    expect(view.focus[0].reason).toMatch(/overdue/);
    expect(view.counts.open).toBeGreaterThanOrEqual(3);
    const focus = suggestFocus(store().tasks.filter((t) => t.assigneeId === 'u-omar'), store().tasks, today);
    expect(focus[0].task.id).toBe('t-m4');
  });

  it('drafts a status update from live data and suggests health', () => {
    const today = todayISO();
    const mfa = store().projects.find((p) => p.id === 'prj-mfa')!;
    const tasks = store().tasks.filter((t) => t.projectId === mfa.id);
    const draft = draftStatusUpdate(mfa, tasks, useHub.getState().users, today);
    expect(['at_risk', 'off_track']).toContain(draft.health);
    expect(draft.blockers.some((b) => b.includes('Legacy VPN'))).toBe(true);
    expect(draft.nextSteps[0]).toMatch(/Milestone/);
    expect(computeProgress(tasks, today).overdue).toBe(1);
    as('u-layla');
    expect(store().postStatusUpdate('prj-mfa', draft).ok).toBe(true);
    expect(store().projects.find((p) => p.id === 'prj-mfa')!.health).toBe(draft.health);
  });

  it('v5 → v6 migration wires Projects & Drive routes, permissions and the work notification preference', () => {
    const seed = createSeed();
    const v5 = {
      ...seed,
      version: 5,
      apps: seed.apps.map((a) => (a.id === 'projects' || a.id === 'drive' ? { ...a, route: undefined } : a)),
      roles: seed.roles.map((r) => ({ ...r, permissions: r.permissions.filter((p) => !p.startsWith('projects.')) })),
      notifications: seed.notifications.filter((n) => n.kind !== 'work'),
      prefs: Object.fromEntries(Object.entries(seed.prefs).map(([id, p]) => [id, { ...p, notifyKinds: { ...p.notifyKinds, work: undefined as unknown as boolean } }])),
    };
    const v6 = migrateV5toV6(v5);
    expect(v6.version).toBe(6);
    expect(v6.apps.find((a) => a.id === 'projects')?.route).toBe('/projects');
    expect(v6.apps.find((a) => a.id === 'drive')?.route).toBe('/drive');
    expect(v6.roles.find((r) => r.id === 'manager')?.permissions).toContain('projects.manage');
    expect(v6.roles.find((r) => r.id === 'employee')?.permissions).not.toContain('projects.manage');
    expect(v6.notifications.some((n) => n.id === 'n-w1')).toBe(true);
    expect(Object.values(v6.prefs).every((p) => p.notifyKinds.work === true)).toBe(true);
  });
});
