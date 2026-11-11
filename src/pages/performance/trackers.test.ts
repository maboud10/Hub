import { Fragment, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makePhases } from '@/performance/cycle';
import type { Cycle, CycleFeedback, Review, ReviewStatus, ReviewTemplate } from '@/performance/types';
import { cycleJourney, isComplete, peerJourney, reviewJourney, type ReviewJourneyInput } from './trackers';

const DAY = 86_400_000;
const LAUNCH = new Date(2026, 10, 2, 9).getTime();
const at = (days: number) => LAUNCH + days * DAY;

const NAMES: Record<string, string> = { 'u-mei': 'Mei', 'u-omar': 'Omar', 'u-sara': 'Sara', 'u-hana': 'Hana', 'u-lucas': 'Lucas', 'u-layla': 'Layla' };
const first = (id: string | undefined) => NAMES[id ?? ''] ?? 'Unknown';
const text = (n: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, n)).replace(/<[^>]+>/g, '');

const part = (status: ReviewStatus = 'not-started') => ({ status, answers: {}, ratings: {}, cited: [] });
const tpl: ReviewTemplate = { id: 'tpl', name: 'Quarterly', questions: [], competencies: false, updatedAt: 0, updatedBy: 'u-sara' };

function cycle(over: Partial<Cycle> = {}): Cycle {
  return {
    id: 'cyc',
    name: 'Q4 2026 Check-in',
    periodId: 'q4-2026',
    status: 'active',
    phases: makePhases(LAUNCH), // self d14 · peer d18 · manager d26 · calibration d26–30 · release d30–37
    departments: null,
    participantIds: ['u-mei'],
    templateId: 'tpl',
    peerAnonymous: true,
    upwardMin: 3,
    createdAt: LAUNCH - DAY,
    createdBy: 'u-sara',
    launchedAt: LAUNCH,
    ...over,
  };
}

function review(over: Partial<Review> = {}): Review {
  return { id: 'rv', cycleId: 'cyc', employeeId: 'u-mei', managerId: 'u-omar', self: part(), manager: { ...part(), authorId: 'u-omar' }, ...over };
}

const peer = (authorId: string, status: CycleFeedback['status']): CycleFeedback => ({ id: `pf-${authorId}`, cycleId: 'cyc', kind: 'peer', subjectId: 'u-mei', authorId, status, requestedAt: LAUNCH, dueAt: at(18), submittedAt: status === 'submitted' ? at(3) : undefined });

const asEmployee = (o: Partial<ReviewJourneyInput>): ReviewJourneyInput => ({ review: review(), cycle: cycle(), role: 'employee', viewerId: 'u-mei', first, peers: [], tpl, now: at(3), ...o });
const asManager = (o: Partial<ReviewJourneyInput>): ReviewJourneyInput => ({ ...asEmployee(o), role: 'manager', viewerId: 'u-omar', ...o });

describe('reviewJourney', () => {
  it('starts at the self-reflection, worded for the employee', () => {
    const j = reviewJourney(asEmployee({}))!;
    expect(j.steps.map((s) => s.label)).toEqual(['Self-reflection', 'Peer feedback', 'Manager review', 'Calibration', 'Release']);
    expect(j.current).toBe(0);
    expect(j.state).toBe('active');
    expect(text(j.message)).toBe('Your turn — tell the story of your quarter');
    expect(text(j.eta)).toMatch(/^Due /);
  });

  it('names the employee for their manager and counts down when the deadline is close', () => {
    expect(text(reviewJourney(asManager({ review: review({ self: part('draft') }) }))!.message)).toBe('Mei is writing the self-reflection · Your review unlocks once it’s in');
    expect(text(reviewJourney(asEmployee({ now: at(12) }))!.message)).toBe('Your self-reflection is due in 2d');
  });

  it('moves to peers once the self-reflection is in, with the courier at the share answered', () => {
    const peers = [peer('u-hana', 'submitted'), peer('u-lucas', 'requested')];
    const j = reviewJourney(asEmployee({ review: review({ self: { ...part('submitted'), submittedAt: at(2) } }), peers }))!;
    expect(j.current).toBe(1);
    expect(j.progress).toBe(0.5);
    expect(text(j.message)).toBe('1/2 peers have answered');
    // Managers also see who is still writing.
    expect(text(reviewJourney(asManager({ review: review({ self: part('submitted') }), peers }))!.message)).toBe('1/2 peers have answered · Lucas is still writing');
  });

  it('flags a 360 where every reviewer declined', () => {
    const j = reviewJourney(asEmployee({ review: review({ self: part('submitted') }), peers: [peer('u-hana', 'declined')] }))!;
    expect(j.current).toBe(1);
    expect(j.state).toBe('blocked');
  });

  it('keeps the manager draft private from the employee but not from the manager', () => {
    const r = review({ self: part('submitted'), manager: { ...part('submitted'), authorId: 'u-omar' } });
    const peers = [peer('u-hana', 'submitted')];
    // Manager: review is in, calibration hasn't opened yet → paused.
    const m = reviewJourney(asManager({ review: r, peers, now: at(20) }))!;
    expect(m.current).toBe(3);
    expect(m.state).toBe('paused');
    expect(text(m.message)).toMatch(/^Your review is in · Calibration opens /);
    // Employee: still "Omar is writing your manager review" until the window closes.
    const e = reviewJourney(asEmployee({ review: r, peers, now: at(20) }))!;
    expect(e.current).toBe(2);
    expect(text(e.message)).toBe('Omar is writing your manager review');
  });

  it('turns an overdue manager review amber for the manager', () => {
    const j = reviewJourney(asManager({ review: review({ self: part('submitted') }), peers: [peer('u-hana', 'submitted')], now: at(27) }))!;
    expect(j.current).toBe(2);
    expect(j.state).toBe('blocked');
  });

  it('is at release once shared and complete once acknowledged', () => {
    const shared = review({ self: part('submitted'), manager: { ...part('submitted'), authorId: 'u-omar' }, release: { releasedAt: at(31), releasedBy: 'u-omar' } });
    const j = reviewJourney(asEmployee({ review: shared, now: at(32) }))!;
    expect(j.current).toBe(4);
    expect(j.progress).toBe(0.5);
    expect(text(j.message)).toBe('Your review is here — read it, then acknowledge');
    const acked = { ...shared, release: { ...shared.release!, acknowledgedAt: at(33) } };
    const done = reviewJourney(asManager({ review: acked, now: at(34) }))!;
    expect(isComplete(done)).toBe(true);
    expect(text(done.message)).toBe('Mei acknowledged the review');
  });

  it('skips packets without a manager chain', () => {
    expect(reviewJourney(asEmployee({ review: review({ managerId: '' }) }))).toBeNull();
  });
});

describe('peerJourney', () => {
  const base = { review: review(), cycle: cycle(), first, now: at(3) };

  it('waits on the manager to approve nominations', () => {
    const j = peerJourney({ ...base, peers: [peer('u-hana', 'proposed'), peer('u-lucas', 'proposed')] });
    expect(j.current).toBe(1);
    expect(text(j.message)).toBe('Omar is approving your peer reviewers');
  });

  it('parks on the themes until the review is shared', () => {
    const j = peerJourney({ ...base, peers: [peer('u-hana', 'submitted'), peer('u-lucas', 'submitted')] });
    expect(j.current).toBe(3);
    expect(j.state).toBe('paused');
  });
});

describe('cycleJourney', () => {
  const reviews = [review(), review({ id: 'rv-2', employeeId: 'u-hana', self: part('submitted') })];

  it('follows the calendar with tallies for the viewer’s scope', () => {
    const j = cycleJourney({ cycle: cycle(), reviews, feedback: [], scope: null, first, now: at(3) });
    expect(j.current).toBe(0);
    expect(j.progress).toBe(0.5);
    expect(text(j.message)).toBe('1/2 self-reflections are in');
    const mine = cycleJourney({ cycle: cycle(), reviews, feedback: [], scope: ['u-hana'], first, now: at(3) });
    expect(text(mine.message)).toBe('1/1 self-reflections are in');
  });

  it('pauses before launch and completes once closed', () => {
    expect(cycleJourney({ cycle: cycle({ status: 'draft' }), reviews, feedback: [], scope: [], first, now: at(-2) }).state).toBe('paused');
    expect(isComplete(cycleJourney({ cycle: cycle({ status: 'closed' }), reviews, feedback: [], scope: [], first, now: at(40) }))).toBe(true);
  });
});
