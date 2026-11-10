import { describe, expect, it } from 'vitest';
import { approvalChain, canDecide, checkEligibility, currentStep, decide } from './eligibility';
import { createSeed, SEED_CATALOG } from './seed';
import type { CatalogRequest } from './types';

const NOW = Date.UTC(2026, 10, 6, 8, 0, 0);
const seed = createSeed(NOW);
const item = (id: string) => SEED_CATALOG.find((c) => c.id === id)!;
const omar = { id: 'u-omar', roleIds: ['manager', 'engineering', 'employee'], department: 'Engineering' as const, managerId: 'u-layla' };
const mei = { id: 'u-mei', roleIds: ['employee'], department: 'Design' as const, managerId: 'u-omar' };
const alex = { id: 'u-alex', roleIds: ['contractor'], department: 'Engineering' as const, managerId: 'u-omar' };
const daniel = { id: 'u-daniel', roleIds: ['finance', 'employee'], department: 'Finance' as const, managerId: 'u-layla' };
const layla = { id: 'u-layla', roleIds: ['admin'], department: 'IT & Security' as const };
const ctx = (user: typeof omar | typeof mei | typeof alex | typeof daniel) => ({ user, devices: seed.devices, requests: seed.requests, now: NOW });

describe('eligibility', () => {
  it('blocks contractors from items not open to them, with a reason', () => {
    const e = checkEligibility(item('cat-mbp14'), ctx(alex));
    expect(e.status).toBe('ineligible');
    expect(e.reasons[0]).toMatch(/contractors/i);
    expect(checkEligibility(item('cat-yubikey'), ctx(alex)).status).toBe('eligible');
  });

  it('asks for a reason outside the standard departments', () => {
    const e = checkEligibility(item('cat-adobe'), ctx(omar));
    expect(e.status).toBe('conditional');
    expect(e.needsJustification).toBe(true);
    expect(checkEligibility(item('cat-adobe'), ctx(mei)).status).toBe('eligible');
  });

  it('hard-limits strict department items', () => {
    const e = checkEligibility(item('cat-aws'), ctx(daniel));
    expect(e.status).toBe('ineligible');
    expect(e.reasons[0]).toMatch(/Limited to Engineering and IT & Security/);
  });

  it('respects the 36-month laptop refresh cycle', () => {
    const e = checkEligibility(item('cat-mbp14'), ctx(omar));
    expect(e.status).toBe('conditional');
    expect(e.reasons.join(' ')).toMatch(/months old/);
  });

  it('prevents duplicate in-flight requests', () => {
    const hana = { id: 'u-hana', roleIds: ['employee'], department: 'Design' as const };
    const e = checkEligibility(item('cat-adobe'), { user: hana, devices: seed.devices, requests: seed.requests, now: NOW });
    expect(e.status).toBe('ineligible');
    expect(e.reasons[0]).toMatch(/REQ-2041/);
  });

  it('flags sensitive access', () => {
    const e = checkEligibility(item('cat-proddb'), ctx(omar));
    expect(e.status).toBe('eligible');
    expect(e.needsJustification).toBe(true);
    expect(e.reasons.join(' ')).toMatch(/Security approval/);
  });
});

describe('approval chains', () => {
  it('builds Manager → IT → Security for sensitive access', () => {
    const steps = approvalChain(item('cat-proddb'), omar);
    expect(steps.map((s) => s.role)).toEqual(['manager', 'it', 'security']);
    expect(steps[0]).toMatchObject({ approverId: 'u-layla', state: 'pending' });
    expect(steps[1].state).toBe('waiting');
  });

  it('skips the manager step when nobody is on file', () => {
    const steps = approvalChain(item('cat-dock'), layla);
    expect(steps[0]).toMatchObject({ role: 'manager', state: 'skipped' });
    expect(steps[1]).toMatchObject({ role: 'it', state: 'pending' });
  });

  it('free items without sensitivity go straight to IT', () => {
    const steps = approvalChain({ ...item('cat-yubikey'), cost: 0 }, mei);
    expect(steps.map((s) => s.role)).toEqual(['it']);
  });

  const request = (): CatalogRequest => ({
    id: 'REQ-1',
    itemId: 'cat-proddb',
    requesterId: 'u-mei',
    options: {},
    justification: 'Debugging a production issue',
    status: 'pending',
    steps: approvalChain(item('cat-proddb'), mei),
    createdAt: NOW,
    updatedAt: NOW,
  });

  it('walks the chain: manager, then IT, then Security', () => {
    let r = request();
    const omarA = { id: 'u-omar', isIT: false, isSecurity: false };
    const sara = { id: 'u-sara', isIT: true, isSecurity: false };
    const ethan = { id: 'u-ethan', isIT: false, isSecurity: true };
    expect(canDecide(r, sara).ok).toBe(false);
    r = decide(r, omarA, true, undefined, NOW + 1);
    expect(currentStep(r)?.role).toBe('it');
    expect(canDecide(r, omarA).ok).toBe(false);
    r = decide(r, sara, true, 'ok', NOW + 2);
    expect(currentStep(r)?.role).toBe('security');
    expect(canDecide(r, sara).ok).toBe(false);
    r = decide(r, ethan, true, undefined, NOW + 3);
    expect(r.status).toBe('approved');
    expect(r.steps.every((s) => s.state === 'approved')).toBe(true);
  });

  it('never lets requesters approve their own request', () => {
    const r = { ...request(), requesterId: 'u-omar', steps: approvalChain(item('cat-dock'), { id: 'u-omar', managerId: 'u-omar' }) };
    expect(canDecide(r, { id: 'u-omar', isIT: true, isSecurity: true }).ok).toBe(false);
  });

  it('a denial ends the request', () => {
    const r = decide(request(), { id: 'u-omar', isIT: false, isSecurity: false }, false, 'Not needed', NOW + 1);
    expect(r.status).toBe('denied');
    expect(currentStep(r)).toBeUndefined();
  });
});
