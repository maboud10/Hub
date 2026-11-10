import { describe, expect, it } from 'vitest';
import { buildDag, countCrossings, criticalPath, layerOf, layoutGraph, orderLayers, topoOrder, wouldCreateCycle, type GraphInput } from './graph';
import { freeGaps, moveSlot, planDay, scoreTask, slotMinutes, type PlanTask } from './planner';
import { CAPACITY, distribute, loadLevel, suggestRebalance, weekStarts, workloadMatrix, type LoadTask } from './workload';
import { burnup, dailyDone, draftStatusUpdate, elapsedRatio, projectMetrics, suggestStatus, velocity } from './metrics';
import { conditionHolds, describeTrigger, ruleMatches, RULE_PRESETS } from './automation';
import { createProjectsSeed } from './seed';
import type { Rule, Task } from './types';

const n = (id: string, blockedBy: string[] = [], extra: Partial<GraphInput> = {}): GraphInput => ({ id, blockedBy, done: false, ...extra });

describe('graph — DAG building', () => {
  it('drops unknown and self references', () => {
    const dag = buildDag([n('a', ['zzz', 'a']), n('b', ['a'])]);
    expect(dag.preds.get('a')).toEqual([]);
    expect(dag.preds.get('b')).toEqual(['a']);
    expect(dag.dropped).toHaveLength(2);
  });

  it('breaks cycles so every node still gets a topological position', () => {
    const dag = buildDag([n('a', ['c']), n('b', ['a']), n('c', ['b'])]);
    expect(dag.dropped).toHaveLength(1);
    expect(topoOrder(dag)).toHaveLength(3);
  });

  it('layers by longest path', () => {
    const dag = buildDag([n('a'), n('b', ['a']), n('c', ['a']), n('d', ['b', 'c']), n('e', ['d', 'a'])]);
    const l = layerOf(dag);
    expect([l.get('a'), l.get('b'), l.get('c'), l.get('d'), l.get('e')]).toEqual([0, 1, 1, 2, 3]);
  });

  it('reduces edge crossings with barycenter sweeps', () => {
    const dag = buildDag([n('a'), n('b'), n('x', ['a']), n('y', ['b'])]);
    const layers = [
      ['a', 'b'],
      ['y', 'x'],
    ];
    expect(countCrossings(layers, dag)).toBe(1);
    expect(countCrossings(orderLayers(layers, dag), dag)).toBe(0);
  });
});

describe('graph — critical path', () => {
  it('follows the chain with the most remaining work', () => {
    const nodes = [n('a', [], { estimate: 6 }), n('b', ['a'], { estimate: 10 }), n('c', ['b'], { estimate: 8 }), n('x', [], { estimate: 5 }), n('y', ['x'], { estimate: 4 })];
    expect(criticalPath(nodes)).toEqual({ path: ['a', 'b', 'c'], hours: 24 });
  });

  it('ignores finished work and appends the milestone the chain unlocks', () => {
    const nodes = [n('done', [], { done: true, estimate: 50 }), n('a', ['done'], { estimate: 3 }), n('b', ['a'], { estimate: 3 }), n('ms', ['b'], { milestone: true })];
    expect(criticalPath(nodes)).toEqual({ path: ['a', 'b', 'ms'], hours: 6 });
  });

  it('is empty when nothing is left', () => {
    expect(criticalPath([n('a', [], { done: true })]).path).toEqual([]);
  });

  it('runs on the seeded Prism project', () => {
    const seed = createProjectsSeed(new Date(2026, 10, 5, 10).getTime());
    const nodes = seed.tasks
      .filter((t) => t.projectId === 'prj-prism')
      .map((t) => ({ id: t.id, blockedBy: t.blockedBy, done: !!t.completedAt, estimate: t.estimate, milestone: t.kind === 'milestone' }));
    const cp = criticalPath(nodes);
    expect(cp.path).toEqual(['t-p1', 't-p2', 't-p6', 't-p7']);
    expect(cp.hours).toBe(24);
  });
});

describe('graph — cycle prevention & layout', () => {
  const tasks = [
    { id: 'a', blockedBy: ['b'] },
    { id: 'b', blockedBy: ['c'] },
    { id: 'c', blockedBy: [] },
    { id: 'd', blockedBy: [] },
  ];
  it('detects direct, transitive and self loops', () => {
    expect(wouldCreateCycle(tasks, 'b', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(tasks, 'a', 'd')).toBe(false);
    expect(wouldCreateCycle(tasks, 'd', 'a')).toBe(false);
  });

  it('lays out left to right, filters isolated nodes and flags critical edges', () => {
    const layout = layoutGraph([n('a', [], { estimate: 2 }), n('b', ['a'], { estimate: 2 }), n('lonely')], { connectedOnly: true });
    expect(layout.nodes.map((x) => x.id).sort()).toEqual(['a', 'b']);
    const a = layout.nodes.find((x) => x.id === 'a')!;
    const b = layout.nodes.find((x) => x.id === 'b')!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(layout.edges).toEqual([{ from: 'a', to: 'b', critical: true }]);
    expect(layout.width).toBeGreaterThan(0);
  });
});

/* ───────────────────────── planner ───────────────────────── */
const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m).getTime();
const pt = (id: string, extra: Partial<PlanTask> = {}): PlanTask => ({ id, title: id, priority: 'medium', blocked: false, ...extra });

describe('planner', () => {
  it('finds gaps around meetings with a buffer', () => {
    const gaps = freeGaps([{ start: at(11), end: at(12) }], at(10), at(14), 5);
    expect(gaps).toEqual([
      { start: at(10), end: at(10, 55) },
      { start: at(12, 5), end: at(14) },
    ]);
  });

  it('drops gaps shorter than 20 minutes', () => {
    expect(freeGaps([{ start: at(10, 15), end: at(12) }], at(10), at(12, 10), 0)).toEqual([]);
  });

  it('scores overdue urgent work highest and never schedules blocked work', () => {
    const now = at(10);
    const overdue = scoreTask(pt('a', { priority: 'urgent', dueDate: '2026-11-03' }), now);
    const today = scoreTask(pt('b', { priority: 'high', dueDate: '2026-11-05' }), now);
    const later = scoreTask(pt('c', { priority: 'high', dueDate: '2026-11-20' }), now);
    expect(overdue).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(later);
    expect(scoreTask(pt('d', { blocked: true }), now)).toBe(-Infinity);
    expect(scoreTask(pt('e', { done: true }), now)).toBe(-Infinity);
  });

  it('sizes slots from estimates (30–120 min)', () => {
    expect(slotMinutes(pt('a'))).toBe(60);
    expect(slotMinutes(pt('a', { estimate: 0.25 }))).toBe(30);
    expect(slotMinutes(pt('a', { estimate: 6 }))).toBe(120);
  });

  it('plans the top tasks into free time after now', () => {
    const slots = planDay({
      now: at(10, 7),
      dayStart: at(8),
      dayEnd: at(20),
      busy: [
        { start: at(11), end: at(12) },
        { start: at(14), end: at(15, 30) },
      ],
      tasks: [
        pt('urgent', { priority: 'urgent', dueDate: '2026-11-03', estimate: 2 }),
        pt('today', { priority: 'high', dueDate: '2026-11-05', estimate: 0.5 }),
        pt('blocked', { priority: 'urgent', blocked: true }),
        pt('later', { priority: 'low', dueDate: '2026-12-20' }),
      ],
      maxSlots: 3,
    });
    expect(slots.map((s) => s.taskId)).not.toContain('blocked');
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect(s.start).toBeGreaterThanOrEqual(at(10, 15));
      expect(s.end <= at(10, 55) || s.start >= at(12, 5)).toBe(true);
      expect(s.end <= at(13, 55) || s.start >= at(15, 35)).toBe(true);
    }
    // the quick win fills the short morning gap; the urgent 2h block takes the earlier 110-min gap (snapped to 105)
    expect(slots[0].taskId).toBe('today');
    const urgent = slots.find((s) => s.taskId === 'urgent')!;
    expect(urgent.start).toBe(at(12, 5));
    expect(urgent.end - urgent.start).toBe(105 * 60_000);
  });

  it('returns nothing once the day is over', () => {
    expect(planDay({ now: at(21), dayStart: at(8), dayEnd: at(20), busy: [], tasks: [pt('a')] })).toEqual([]);
  });

  it('snaps moved slots to 15 minutes inside the window', () => {
    const s = moveSlot({ taskId: 'a', start: at(9), end: at(10) }, at(19, 40), { start: at(8), end: at(20) });
    expect(s).toEqual({ taskId: 'a', start: at(19), end: at(20) });
  });
});

/* ───────────────────────── workload ───────────────────────── */
const lt = (id: string, extra: Partial<LoadTask> = {}): LoadTask => ({ id, title: id, assigneeId: 'u-a', done: false, ...extra });

describe('workload', () => {
  const today = '2026-11-05'; // Thursday
  const weeks = weekStarts(today, 3); // Mon 2, 9, 16 Nov

  it('starts weeks on Monday', () => {
    expect(weeks).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });

  it('spreads estimates over working days only', () => {
    // Thu 5 → Tue 10: Thu, Fri, Mon, Tue = 4 working days
    expect(distribute(lt('a', { estimate: 8, dueDate: '2026-11-10' }), weeks, today)).toEqual([4, 4, 0]);
  });

  it('puts overdue work in the current week and skips undated or done work', () => {
    expect(distribute(lt('a', { estimate: 5, dueDate: '2026-10-30' }), weeks, today)).toEqual([5, 0, 0]);
    expect(distribute(lt('a', { estimate: 5 }), weeks, today)).toEqual([0, 0, 0]);
    expect(distribute(lt('a', { estimate: 5, dueDate: '2026-11-06', done: true }), weeks, today)).toEqual([0, 0, 0]);
  });

  it('respects a future start date', () => {
    expect(distribute(lt('a', { estimate: 10, startDate: '2026-11-16', dueDate: '2026-11-20' }), weeks, today)).toEqual([0, 0, 10]);
  });

  it('aggregates a matrix per person', () => {
    const m = workloadMatrix([lt('a', { estimate: 8, dueDate: '2026-11-06' }), lt('b', { estimate: 4, dueDate: '2026-11-06', assigneeId: 'u-b' })], ['u-a', 'u-b'], weeks, today);
    expect(m.get('u-a')!.hours[0]).toBe(8);
    expect(m.get('u-a')!.tasks[0]).toEqual(['a']);
    expect(m.get('u-b')!.total).toBe(4);
  });

  it('classifies load levels', () => {
    expect(loadLevel(0)).toBe('idle');
    expect(loadLevel(10)).toBe('light');
    expect(loadLevel(24)).toBe('balanced');
    expect(loadLevel(32)).toBe('full');
    expect(loadLevel(40)).toBe('over');
  });

  it('suggests moves that fix overload without overloading anyone else', () => {
    const tasks = [
      lt('big', { estimate: 20, dueDate: '2026-11-06' }),
      lt('mid', { estimate: 18, dueDate: '2026-11-06' }),
      lt('urgent', { estimate: 6, dueDate: '2026-11-06', priority: 'urgent' }),
      lt('b1', { estimate: 6, dueDate: '2026-11-06', assigneeId: 'u-b' }),
    ];
    const m = workloadMatrix(tasks, ['u-a', 'u-b'], weeks, today);
    expect(m.get('u-a')!.hours[0]).toBeGreaterThan(CAPACITY);
    const s = suggestRebalance(tasks, m, weeks, today, () => ['u-a', 'u-b']);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ taskId: 'big', from: 'u-a', to: 'u-b', week: 0 });
    expect(s[0].toAfter).toBeLessThanOrEqual(CAPACITY);
    expect(s.map((x) => x.taskId)).not.toContain('urgent');
  });
});

/* ───────────────────────── metrics ───────────────────────── */
describe('metrics', () => {
  const now = new Date(2026, 10, 5, 10).getTime();
  const seed = createProjectsSeed(now);
  const prism = seed.projects.find((p) => p.id === 'prj-prism')!;
  const prismTasks = seed.tasks.filter((t) => t.projectId === 'prj-prism');

  it('computes progress, overdue and elapsed time', () => {
    const m = projectMetrics(prism, prismTasks, now);
    expect(m.total).toBe(16);
    expect(m.done).toBe(3);
    expect(m.overdue).toBe(1); // t-p3
    expect(m.elapsed).toBeGreaterThan(0.5);
    expect(m.elapsed).toBeLessThan(0.7);
  });

  it('clamps elapsed ratio', () => {
    expect(elapsedRatio('2026-11-10', '2026-11-20', now)).toBe(0);
    expect(elapsedRatio('2026-10-01', '2026-10-20', now)).toBe(1);
  });

  it('buckets velocity by calendar week and completions by day', () => {
    const DAY = 86_400_000;
    const tasks = [{ completedAt: now - DAY }, { completedAt: now - 8 * DAY }, { completedAt: undefined }] as Pick<Task, 'completedAt'>[];
    expect(velocity(tasks, now, 3)).toEqual([0, 1, 1]);
    expect(dailyDone(tasks, now, 3)).toEqual([0, 1, 0]);
  });

  it('builds a monotonic burn-up ending today', () => {
    const b = burnup(prism, prismTasks, now);
    expect(b[b.length - 1]).toMatchObject({ day: '2026-11-05', scope: 16, done: 3 });
    for (let i = 1; i < b.length; i++) expect(b[i].done).toBeGreaterThanOrEqual(b[i - 1].done);
  });

  it('suggests status from schedule gap and overdue work', () => {
    const m = projectMetrics(prism, prismTasks, now);
    expect(suggestStatus(prism, { ...m, progress: 0.9, elapsed: 0.5, overdue: 0 })).toBe('on-track');
    expect(suggestStatus(prism, { ...m, progress: 0.2, elapsed: 0.6 })).toBe('off-track');
    expect(suggestStatus({ ...prism, status: 'on-hold' }, m)).toBe('on-hold');
  });

  it('drafts a status update from real data', () => {
    const draft = draftStatusUpdate(prism, prismTasks, now, (id) => ({ 'u-mei': 'Mei Tanaka', 'u-hana': 'Hana Park', 'u-priya': 'Priya Raman' })[id ?? ''] ?? 'Someone');
    expect(draft.body).toContain('PRISM-3 Token contrast audit (Mei, 2d late)');
    expect(draft.body).toContain('Prism v4 GA across all product surfaces');
    expect(draft.body).toContain('Icon set audit & consolidation (Hana)');
    expect(draft.body).toMatch(/waits on PRISM-1/);
    expect(draft.title.length).toBeGreaterThan(5);
  });
});

/* ───────────────────────── automations ───────────────────────── */
describe('automations', () => {
  const now = new Date(2026, 10, 5, 10).getTime();
  const seed = createProjectsSeed(now);
  const t = (id: string) => seed.tasks.find((x) => x.id === id)!;
  const rule = (r: Partial<Rule>): Rule => ({ id: 'r', projectId: 'prj-prism', name: 'r', enabled: true, trigger: { kind: 'created' }, conditions: [], actions: [{ kind: 'tag', value: 'x' }], runs: 0, createdBy: 'u-mei', createdAt: now, fired: [], ...r });

  it('matches triggers, sections and conditions', () => {
    expect(ruleMatches(rule({ trigger: { kind: 'moved', sectionId: 'prj-prism-s4' } }), { kind: 'moved', sectionId: 'prj-prism-s4' }, t('t-p2'), now)).toBe(true);
    expect(ruleMatches(rule({ trigger: { kind: 'moved', sectionId: 'prj-prism-s4' } }), { kind: 'moved', sectionId: 'prj-prism-s5' }, t('t-p2'), now)).toBe(false);
    expect(ruleMatches(rule({ conditions: [{ field: 'priority', value: 'urgent' }] }), { kind: 'created' }, t('t-p3'), now)).toBe(true);
    expect(ruleMatches(rule({ conditions: [{ field: 'priority', value: 'urgent' }] }), { kind: 'created' }, t('t-p2'), now)).toBe(false);
    expect(ruleMatches(rule({ enabled: false }), { kind: 'created' }, t('t-p2'), now)).toBe(false);
    expect(ruleMatches(rule({ projectId: 'prj-mfa' }), { kind: 'created' }, t('t-p2'), now)).toBe(false);
  });

  it('fires due-soon once per task inside the window', () => {
    const r = rule({ trigger: { kind: 'due-soon', days: 2 } });
    expect(ruleMatches(r, { kind: 'due-soon' }, t('t-p1'), now)).toBe(true); // due tomorrow
    expect(ruleMatches(r, { kind: 'due-soon' }, t('t-p6'), now)).toBe(false); // due in 14d
    expect(ruleMatches(r, { kind: 'due-soon' }, t('t-p3'), now)).toBe(false); // overdue
    expect(ruleMatches({ ...r, fired: ['t-p1'] }, { kind: 'due-soon' }, t('t-p1'), now)).toBe(false);
  });

  it('evaluates conditions and describes triggers', () => {
    expect(conditionHolds({ field: 'assignee', value: 'none' }, { priority: 'low', assigneeId: null, tags: [] })).toBe(true);
    expect(conditionHolds({ field: 'tag', value: 'A11y' }, { priority: 'low', assigneeId: null, tags: ['a11y'] })).toBe(true);
    const prism = seed.projects.find((p) => p.id === 'prj-prism')!;
    expect(describeTrigger({ kind: 'moved', sectionId: 'prj-prism-s4' }, prism)).toBe('Task moves to In review');
    expect(describeTrigger({ kind: 'due-soon', days: 1 })).toBe('Due within 1 day');
  });

  it('builds presets for a project', () => {
    const prism = seed.projects.find((p) => p.id === 'prj-prism')!;
    const built = RULE_PRESETS.map((x) => x.build(prism)).filter(Boolean);
    expect(built.length).toBe(RULE_PRESETS.length);
    expect(RULE_PRESETS.find((x) => x.id === 'celebrate')!.build({ ...prism, channelId: undefined })).toBeNull();
  });
});
