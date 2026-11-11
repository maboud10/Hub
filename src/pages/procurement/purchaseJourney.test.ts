import { describe, expect, it } from 'vitest';
import { createRequestFromInput } from '@/procurement/engine';
import { createProcurementSeed } from '@/procurement/seed';
import type { ApprovalStep, PurchaseRequest } from '@/procurement/types';
import { derivePoJourney, derivePurchaseJourney, formatHours } from './purchaseJourney';

const HOUR = 3_600_000;

function seededRequest(id: string): PurchaseRequest {
  const found = createProcurementSeed().requests.find((r) => r.id === id);
  if (!found) throw new Error(`Seed request ${id} is missing`);
  return found;
}

const stageOf = (req: PurchaseRequest, id: ApprovalStep['id']) => req.stages.find((s) => s.id === id)!;

describe('Procurement trackers — purchase journey', () => {
  it('follows a request to its live Legal gate, with the SLA clock starting at the last sign-off', () => {
    const req = seededRequest('REQ-2026-101');
    const securitySigned = stageOf(req, 'security_privacy').completedAt!;

    const onTime = derivePurchaseJourney(req, securitySigned + 2 * HOUR);
    expect(onTime.gates.map((g) => g.id)).toEqual([
      'requester',
      'budget_owner',
      'security_privacy',
      'legal_redline',
      'finance_controller',
    ]);
    expect(onTime.current).toBe(3);
    expect(onTime.totalSteps).toBe(6);
    expect(onTime.mood).toBe('active');
    expect(onTime.reason).toBe('review');
    expect(onTime.live?.id).toBe('legal_redline');
    expect(onTime.sla?.startedAt).toBe(securitySigned);
    expect(onTime.sla?.hoursLeft).toBeCloseTo(6);
    expect(onTime.sla?.overdue).toBe(false);
    expect(onTime.sla?.elapsed).toBeCloseTo(0.25);

    const late = derivePurchaseJourney(req, securitySigned + 14 * HOUR);
    expect(late.sla?.overdue).toBe(true);
    expect(late.sla?.hoursLeft).toBeCloseTo(-6);
    expect(late.sla?.elapsed).toBe(1);
  });

  it('lists parallel sign-offs in the order they happened, so a cleared gate never looks pending', () => {
    // REQ-2026-103: Security and Legal signed while the Budget owner is still reviewing.
    const req = seededRequest('REQ-2026-103');
    const journey = derivePurchaseJourney(req);
    expect(journey.gates.map((g) => g.id)).toEqual([
      'requester',
      'security_privacy',
      'legal_redline',
      'budget_owner',
      'finance_controller',
    ]);
    expect(journey.current).toBe(3);
    expect(journey.live?.id).toBe('budget_owner');
    // Nothing before Budget in the route has signed except intake, so its clock started there.
    expect(journey.sla?.startedAt).toBe(stageOf(req, 'requester').completedAt);
  });

  it('pauses while Nova negotiates, waits on the PO once every gate signed, and completes when the PO is out', () => {
    const negotiating = derivePurchaseJourney(seededRequest('REQ-2026-102'));
    expect(negotiating.mood).toBe('paused');
    expect(negotiating.reason).toBe('negotiating');
    expect(negotiating.live?.id).toBe('finance_controller');

    const ready = derivePurchaseJourney(seededRequest('REQ-2026-104'));
    expect(ready.reason).toBe('ready_for_po');
    expect(ready.mood).toBe('active');
    expect(ready.current).toBe(5); // live on the "PO issued" step
    expect(ready.live).toBeUndefined();
    expect(ready.lastCleared?.id).toBe('finance_controller');

    const issued = derivePurchaseJourney(seededRequest('REQ-2026-105'));
    expect(issued.reason).toBe('po_issued');
    expect(issued.mood).toBe('done');
    expect(issued.current).toBe(issued.totalSteps);
  });

  it('blocks on a flagged or declined request and pauses when it is back with the requester', () => {
    const base = seededRequest('REQ-2026-103');

    const flagged = derivePurchaseJourney({
      ...base,
      stages: base.stages.map<ApprovalStep>((s) =>
        s.id === 'finance_controller' ? { ...s, status: 'flagged', note: 'Budget line is over by AED 12K' } : s,
      ),
    });
    expect(flagged.mood).toBe('blocked');
    expect(flagged.reason).toBe('flagged');
    // The flagged gate is the blocker, so it goes live ahead of Budget (still reviewing in parallel).
    expect(flagged.live?.id).toBe('finance_controller');
    expect(flagged.gates.map((g) => g.id)).toEqual([
      'requester',
      'security_privacy',
      'legal_redline',
      'finance_controller',
      'budget_owner',
    ]);

    const rejected = derivePurchaseJourney({ ...base, status: 'rejected' });
    expect(rejected.mood).toBe('blocked');
    expect(rejected.reason).toBe('rejected');

    const returned = derivePurchaseJourney({
      ...base,
      stages: base.stages.map<ApprovalStep>((s) =>
        s.id === 'requester' ? { ...s, status: 'pending', completedAt: undefined } : s,
      ),
    });
    expect(returned.mood).toBe('paused');
    expect(returned.reason).toBe('with_requester');
    expect(returned.live?.id).toBe('requester');
  });

  it('starts a freshly created request at the Budget gate with its full SLA', () => {
    const seed = createProcurementSeed();
    const fresh = createRequestFromInput(
      {
        title: '10 Figma seats',
        vendorId: 'v-figma',
        category: 'product_design',
        department: 'Design',
        location: 'Dubai',
        quantity: 10,
        quotedAnnualUsd: 10_800,
        currency: 'USD',
        justification: '',
      },
      seed.vendors,
      seed.requests.length,
    );
    const intakeSigned = stageOf(fresh, 'requester').completedAt!;
    const journey = derivePurchaseJourney(fresh, intakeSigned);
    expect(journey.current).toBe(1);
    expect(journey.live?.id).toBe('budget_owner');
    expect(journey.sla?.hoursLeft).toBeCloseTo(4);
  });

  it('formats SLA durations compactly', () => {
    expect(formatHours(0.25)).toBe('15m');
    expect(formatHours(0.999)).toBe('1h');
    expect(formatHours(-6.4)).toBe('6h');
    expect(formatHours(30)).toBe('30h');
    expect(formatHours(60)).toBe('2.5d');
    expect(formatHours(300)).toBe('13d');
  });
});

describe('Procurement trackers — PO journey', () => {
  it('maps receipt, invoice, 3-way match and ledger from the purchase order', () => {
    const orders = createProcurementSeed().purchaseOrders;
    const po = (id: string) => orders.find((p) => p.id === id)!;

    expect(derivePoJourney(po('PO-2026-402'))).toMatchObject({ current: 3, mood: 'blocked', reason: 'variance' });
    expect(derivePoJourney(po('PO-2026-401'))).toMatchObject({ current: 4, mood: 'active', reason: 'ready_to_queue' });
    expect(derivePoJourney(po('PO-2026-403'))).toMatchObject({ current: 5, mood: 'done', reason: 'queued' });

    const partial = derivePoJourney({ ...po('PO-2026-401'), receiptConfirmedUnits: 130 });
    expect(partial).toMatchObject({ current: 1, mood: 'active', reason: 'awaiting_receipt' });
    expect(partial.progress).toBeCloseTo(0.25);
  });
});
