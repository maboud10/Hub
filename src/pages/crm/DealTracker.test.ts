import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_USERS } from '@/data/users';
import { SEED_DEALS } from '@/crm/seed';
import { resetCrm, useCrm } from '@/crm/store';
import type { User } from '@/types';
import { DealTracker, DealTrackerCompact, deriveDealJourney } from './DealTracker';

const users = new Map<string, User>(SEED_USERS.map((u) => [u.id, u]));
const seed = (id: string) => structuredClone(SEED_DEALS.find((d) => d.id === id)!);
const live = (id: string) => useCrm.getState().deals.find((d) => d.id === id)!;
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

describe('Helix CRM — deal tracker journey', () => {
  beforeEach(() => {
    resetCrm();
  });

  it('derives stage, state and the open exit criterion from the deal record', () => {
    const nordic = deriveDealJourney(seed('deal-nordic-vault'));
    expect(nordic.current).toBe(2);
    expect(nordic.state).toBe('blocked');
    expect(nordic.reason).toMatch(/stalled/);
    expect(nordic.gap).toBe('economicBuyer');

    const neom = deriveDealJourney(seed('deal-neom-q4'));
    expect(neom.current).toBe(3);
    expect(neom.state).toBe('paused');
    expect(neom.reason).toMatch(/awaiting/);
    expect(neom.gap).toBe('paperProcess');

    expect(deriveDealJourney(seed('deal-meridian-ai'))).toMatchObject({ state: 'active', gap: 'champion' });
    expect(deriveDealJourney(seed('deal-klara-mena'))).toMatchObject({ state: 'active', gap: 'decisionCriteria' });
    expect(deriveDealJourney(seed('deal-alfuttaim-gcc'))).toMatchObject({ state: 'active', gap: null });

    const won = deriveDealJourney(seed('deal-sovereign-noc'));
    expect(won.current).toBe(5);
    expect(won.state).toBe('done');
  });

  it('moves the courier as exit criteria are verified and clears the stall when Nova acts', () => {
    const before = deriveDealJourney(live('deal-nordic-vault'));
    useCrm.getState().toggleMeddpicc('deal-nordic-vault', 'paperProcess');
    const afterPillar = deriveDealJourney(live('deal-nordic-vault'));
    expect(afterPillar.progress).toBeGreaterThan(before.progress);

    // Next-best-action drops the first risk flag (the stall) and locks the Economic Buyer.
    useCrm.getState().triggerDealNextBestAction('deal-nordic-vault');
    const afterNba = deriveDealJourney(live('deal-nordic-vault'));
    expect(afterNba.state).toBe('active');
    expect(afterNba.gap).toBeNull();

    useCrm.getState().moveDealStage('deal-nordic-vault', 'won');
    expect(deriveDealJourney(live('deal-nordic-vault')).current).toBe(5);
  });

  it('names the deal owner and the real blocker in the live status line', () => {
    const blocked = text(renderToStaticMarkup(createElement(DealTracker, { deal: seed('deal-nordic-vault'), users })));
    expect(blocked).toContain('Aisha is working to unblock it — Security review stalled 9 days');
    expect(blocked).toContain('Layla · Exec sponsor');
    expect(blocked).toContain('Henrik Lindqvist · Economic Buyer');
    expect(blocked).toContain('Closes');

    const active = text(renderToStaticMarkup(createElement(DealTracker, { deal: seed('deal-meridian-ai'), users })));
    expect(active).toContain('Noah is lining up the security review — still hunting for a champion');

    const ready = text(renderToStaticMarkup(createElement(DealTracker, { deal: seed('deal-alfuttaim-gcc'), users })));
    expect(ready).toContain('Aisha is running the pilot — ready for Security Review');

    const compact = renderToStaticMarkup(createElement(DealTrackerCompact, { deal: seed('deal-neom-q4') }));
    expect(compact).toContain('data-state="paused"');
    expect(compact).toContain('Stage 4 of 5');
  });
});
