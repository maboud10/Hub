import { describe, expect, it } from 'vitest';
import { approvedAt, DEFAULT_DECISION_MS, requestTrack, TICKET_STAGES, ticketTrack, typicalDecisionMs } from './journey';
import { DAY, HOUR, MIN } from './meta';
import { SLA_TARGETS } from './sla';
import type { CatalogItem, CatalogRequest, Ticket } from './types';

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'HX-1',
  subject: 's',
  description: 'd',
  category: 'hardware',
  priority: 'P2',
  impact: 'me',
  urgency: 'normal',
  status: 'new',
  requesterId: 'u-hana',
  createdAt: 0,
  updatedAt: 0,
  pausedMs: 0,
  events: [],
  ...over,
});

const request = (over: Partial<CatalogRequest> = {}): CatalogRequest => ({
  id: 'REQ-1',
  itemId: 'cat-dock',
  requesterId: 'u-hana',
  options: {},
  justification: '',
  status: 'pending',
  steps: [
    { role: 'manager', approverId: 'u-omar', state: 'pending' },
    { role: 'it', state: 'waiting' },
  ],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const item = { etaDays: 3 } as CatalogItem;

describe('fix tracker (tickets)', () => {
  it('maps statuses to stages and moods', () => {
    expect(ticketTrack(ticket(), MIN)).toMatchObject({ current: 0, mood: 'active' });
    expect(ticketTrack(ticket({ status: 'triaged', assigneeId: 'u-layla' }), MIN)).toMatchObject({ current: 1, mood: 'active' });
    expect(ticketTrack(ticket({ status: 'in_progress', firstResponseAt: MIN }), 2 * MIN)).toMatchObject({ current: 2, mood: 'active' });
    expect(ticketTrack(ticket({ status: 'resolved', resolvedAt: HOUR, firstResponseAt: MIN }), 2 * HOUR)).toMatchObject({ current: TICKET_STAGES.length, mood: 'done', progress: 1 });
  });

  it('pauses “In progress” while waiting on the requester instead of moving on', () => {
    const t = ticketTrack(ticket({ status: 'waiting', firstResponseAt: MIN, pausedAt: HOUR }), 3 * HOUR);
    expect(t.current).toBe(2);
    expect(t.mood).toBe('paused');
    expect(t.fix.state).toBe('paused');
  });

  it('stamps stages from the event history', () => {
    const t = ticketTrack(
      ticket({
        status: 'resolved',
        firstResponseAt: 12 * MIN,
        resolvedAt: 5 * HOUR,
        events: [
          { id: 'a', at: 0, kind: 'created', actorId: 'u-hana' },
          { id: 'b', at: 10 * MIN, kind: 'assign', actorId: 'u-layla', to: 'u-layla' },
          { id: 'c', at: 12 * MIN, kind: 'status', from: 'new', to: 'in_progress' },
          { id: 'd', at: 2 * HOUR, kind: 'status', from: 'in_progress', to: 'waiting' },
          { id: 'e', at: 3 * HOUR, kind: 'status', from: 'waiting', to: 'in_progress' },
          { id: 'f', at: 5 * HOUR, kind: 'status', from: 'in_progress', to: 'resolved' },
        ],
      }),
      6 * HOUR,
    );
    expect(t.at).toEqual({ received: 0, triaged: 10 * MIN, in_progress: 12 * MIN, resolved: 5 * HOUR });
  });

  it('leaves skipped stages unstamped (Nova self-service fixes)', () => {
    const t = ticketTrack(ticket({ status: 'resolved', resolvedAt: 2, firstResponseAt: 1, events: [{ id: 's', at: 2, kind: 'status', from: 'new', to: 'resolved' }] }), HOUR);
    expect(t.at).toEqual({ received: 0, resolved: 2 });
  });

  it('paces the courier with the first-response clock, then the resolution clock', () => {
    const fresh = ticketTrack(ticket({ priority: 'P2' }), 30 * MIN);
    expect(fresh.clock.kind).toBe('response');
    expect(fresh.progress).toBeCloseTo(0.5);
    const working = ticketTrack(ticket({ priority: 'P2', status: 'in_progress', firstResponseAt: MIN }), 2 * HOUR);
    expect(working.clock.kind).toBe('resolve');
    expect(working.progress).toBeCloseTo((2 * HOUR) / SLA_TARGETS.P2.resolve);
    expect(ticketTrack(ticket({ priority: 'P1' }), DAY).progress).toBe(1);
  });
});

describe('request tracker (catalog)', () => {
  const history = [
    request({ steps: [{ role: 'manager', approverId: 'u-omar', state: 'approved', decidedAt: 2 * HOUR }, { role: 'it', state: 'approved', decidedAt: 12 * HOUR }], status: 'approved' }),
    request({ createdAt: DAY, steps: [{ role: 'manager', approverId: 'u-omar', state: 'approved', decidedAt: DAY + 4 * HOUR }, { role: 'it', state: 'approved', decidedAt: DAY + 10 * HOUR }], status: 'approved' }),
    request({ steps: [{ role: 'manager', state: 'skipped' }, { role: 'it', state: 'denied', decidedAt: 6 * HOUR }], status: 'denied' }),
  ];

  it('learns typical decision times per role from history', () => {
    expect(typicalDecisionMs(history, 'manager')).toBe(3 * HOUR);
    expect(typicalDecisionMs(history, 'it')).toBe(6 * HOUR);
    expect(typicalDecisionMs(history, 'security')).toBeUndefined();
  });

  it('puts a pending request on its pending approval, paced by the typical turnaround', () => {
    const t = requestTrack(request(), { now: 90 * MIN, item, history });
    expect(t.stages.map((s) => s.kind)).toEqual(['requested', 'manager', 'it', 'fulfilment', 'delivered']);
    expect(t).toMatchObject({ current: 1, mood: 'active', since: 0, expected: 3 * HOUR });
    expect(t.progress).toBeCloseTo(0.5);
    // remaining manager time + typical IT time + catalog lead time
    expect(t.eta).toBe(90 * MIN + 90 * MIN + 6 * HOUR + 3 * DAY);
  });

  it('starts the live approval when the previous one was decided and falls back without history', () => {
    const r = request({ steps: [{ role: 'manager', approverId: 'u-omar', state: 'approved', decidedAt: 5 * HOUR }, { role: 'it', state: 'pending' }] });
    const t = requestTrack(r, { now: 6 * HOUR, item });
    expect(t).toMatchObject({ current: 2, since: 5 * HOUR, expected: DEFAULT_DECISION_MS.it });
    expect(t.stages[1].doneAt).toBe(5 * HOUR);
  });

  it('blocks on a declined step and parks cancelled requests', () => {
    const denied = request({ status: 'denied', steps: [{ role: 'manager', approverId: 'u-omar', state: 'denied', decidedAt: HOUR, note: 'No budget' }, { role: 'it', state: 'waiting' }] });
    expect(requestTrack(denied, { now: 2 * HOUR })).toMatchObject({ current: 1, mood: 'blocked', since: HOUR });
    const cancelled = request({ status: 'cancelled', updatedAt: 3 * HOUR, steps: [{ role: 'manager', state: 'skipped' }, { role: 'it', state: 'pending' }] });
    expect(requestTrack(cancelled, { now: 4 * HOUR })).toMatchObject({ current: 2, mood: 'paused', since: 3 * HOUR });
  });

  it('moves approved requests to fulfilment with a catalog-based ETA, and completes on hand-over', () => {
    const approved = request({ status: 'approved', steps: [{ role: 'manager', approverId: 'u-omar', state: 'approved', decidedAt: HOUR }, { role: 'it', state: 'approved', decidedAt: 2 * HOUR }] });
    expect(approvedAt(approved)).toBe(2 * HOUR);
    const t = requestTrack(approved, { now: 3 * HOUR, item });
    expect(t).toMatchObject({ current: 3, mood: 'active', since: 2 * HOUR, eta: 2 * HOUR + 3 * DAY });
    const done = requestTrack({ ...approved, status: 'fulfilled', fulfilment: { at: DAY, by: 'u-mateo' } }, { now: 2 * DAY, item });
    expect(done).toMatchObject({ current: 5, mood: 'done' });
    expect(done.stages[4].doneAt).toBe(DAY);
    expect(done.eta).toBeUndefined();
  });
});
