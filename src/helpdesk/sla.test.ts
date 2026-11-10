import { describe, expect, it } from 'vitest';
import { formatDuration, headlineSla, isBreaching, maxPriority, priorityFor, resolveSla, responseSla, SLA_TARGETS, slaLabel, slaPreview } from './sla';
import { HOUR, MIN } from './meta';
import type { Ticket } from './types';

const base = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'HX-1',
  subject: 's',
  description: 'd',
  category: 'hardware',
  priority: 'P2',
  impact: 'me',
  urgency: 'normal',
  status: 'new',
  requesterId: 'u-omar',
  createdAt: 0,
  updatedAt: 0,
  pausedMs: 0,
  events: [],
  ...over,
});

describe('priority matrix', () => {
  it('maps impact × urgency to P1..P4', () => {
    expect(priorityFor('me', 'low')).toBe('P4');
    expect(priorityFor('me', 'normal')).toBe('P3');
    expect(priorityFor('me', 'high')).toBe('P2');
    expect(priorityFor('team', 'normal')).toBe('P2');
    expect(priorityFor('team', 'high')).toBe('P1');
    expect(priorityFor('company', 'low')).toBe('P2');
    expect(priorityFor('company', 'normal')).toBe('P1');
  });

  it('never lets a security incident drop below P2', () => {
    expect(priorityFor('me', 'low', 'security')).toBe('P2');
    expect(priorityFor('team', 'high', 'security')).toBe('P1');
  });

  it('maxPriority keeps the more urgent one', () => {
    expect(maxPriority('P3', 'P2')).toBe('P2');
    expect(maxPriority('P1', 'P4')).toBe('P1');
  });

  it('previews targets in plain language', () => {
    expect(slaPreview('P2')).toBe('First response within 1h · resolution within 8h');
    expect(slaPreview('P1')).toBe('First response within 15m · resolution within 4h');
  });
});

describe('SLA clocks', () => {
  it('counts down the first-response clock and flags risk then breach', () => {
    const t = base({ priority: 'P2' });
    expect(responseSla(t, 10 * MIN).state).toBe('ok');
    expect(responseSla(t, 50 * MIN).state).toBe('risk');
    const breached = responseSla(t, 2 * HOUR);
    expect(breached.state).toBe('breached');
    expect(breached.remaining).toBe(-HOUR);
    expect(isBreaching(t, 2 * HOUR)).toBe(true);
  });

  it('stops the response clock at the first response (met / missed)', () => {
    expect(responseSla(base({ firstResponseAt: 20 * MIN }), 5 * HOUR).state).toBe('met');
    expect(responseSla(base({ firstResponseAt: 90 * MIN }), 5 * HOUR).state).toBe('missed');
  });

  it('pauses the resolution clock while waiting on the requester', () => {
    const waiting = base({ status: 'waiting', firstResponseAt: MIN, pausedAt: 2 * HOUR, pausedMs: 0 });
    const r = resolveSla(waiting, 12 * HOUR);
    expect(r.state).toBe('paused');
    // 10h paused so far → due moves out by 10h
    expect(r.due).toBe(SLA_TARGETS.P2.resolve + 10 * HOUR);
    expect(isBreaching(waiting, 12 * HOUR)).toBe(false);
  });

  it('includes accumulated pauses after the ticket resumes', () => {
    const t = base({ status: 'in_progress', firstResponseAt: MIN, pausedMs: 3 * HOUR });
    expect(resolveSla(t, 6 * HOUR).state).toBe('ok');
    expect(resolveSla(t, 10 * HOUR).state).toBe('risk');
    expect(resolveSla(t, 12 * HOUR).state).toBe('breached');
  });

  it('marks resolved tickets met or missed', () => {
    expect(resolveSla(base({ status: 'resolved', resolvedAt: 7 * HOUR, firstResponseAt: MIN }), 99 * HOUR).state).toBe('met');
    expect(resolveSla(base({ status: 'resolved', resolvedAt: 9 * HOUR, firstResponseAt: MIN }), 99 * HOUR).state).toBe('missed');
  });

  it('headline picks the clock that matters', () => {
    const t = base({ priority: 'P3' });
    expect(headlineSla(t, MIN).kind).toBe('response');
    expect(headlineSla({ ...t, firstResponseAt: MIN }, 2 * MIN).kind).toBe('resolve');
  });
});

describe('formatting', () => {
  it('formats durations compactly', () => {
    expect(formatDuration(90 * MIN)).toBe('1h 30m');
    expect(formatDuration(26 * HOUR)).toBe('1d 2h');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(-2 * HOUR)).toBe('-2h');
    expect(formatDuration(3 * HOUR + 5 * MIN, { compact: true })).toBe('3h');
  });

  it('labels clock states', () => {
    expect(slaLabel(responseSla(base(), 30 * MIN))).toBe('30m left');
    expect(slaLabel(responseSla(base(), 3 * HOUR))).toBe('Overdue 2h');
    expect(slaLabel(responseSla(base({ firstResponseAt: MIN }), 3 * HOUR))).toBe('Met');
  });
});
