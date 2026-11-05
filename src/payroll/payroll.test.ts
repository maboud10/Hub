import { beforeEach, describe, expect, it } from 'vitest';
import { migrateV4toV5, useHub } from '@/store/hub';
import { createSeed } from '@/data/seed';
import { useHr } from '@/hr/store';
import { useExpenses } from '@/expenses/store';
import { usePayroll } from './store';
import {
  computeCompAnalytics,
  computeEosbLiability,
  generatePayrollCsv,
  generateWpsSif,
  periodFromTimestamp,
} from './engine';

const as = (userId: string) => useHub.setState({ sessionUserId: userId });

describe('Helix Payroll Console — bonuses, comp bands, EOSB liability & WPS export', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    useHr.getState().resetHrDemo();
    useExpenses.getState().resetExpensesDemo();
    usePayroll.getState().resetPayrollDemo();
  });

  it('enforces four-eyes separation of duties on bonus nominations and syncs approved awards into active payroll', () => {
    const currentPeriod = periodFromTimestamp(Date.now(), 0);

    // Omar (Manager) nominates Hana for a Spot Award
    as('u-omar');
    const nom = usePayroll.getState().nominateBonus({
      userId: 'u-hana',
      kind: 'spot',
      title: 'Mobile Expense Vault Interaction Polish',
      reason: 'Crafted sub-second receipt scan feedback and dark-mode contrast refinements.',
      amountAed: 4_000,
      payrollPeriod: currentPeriod,
    });
    expect(nom.ok).toBe(true);

    // Even if someone holds payroll.approve, they cannot approve a bonus they nominated themselves:
    as('u-sara');
    const saraNom = usePayroll.getState().nominateBonus({
      userId: 'u-fatima',
      kind: 'performance',
      title: 'Onboarding NPS 96 Milestone',
      reason: 'Redesigned pre-boarding document pack & Day-30 pulse follow-through.',
      amountAed: 5_000,
      payrollPeriod: currentPeriod,
    });
    expect(saraNom.ok).toBe(true);
    // Sara tries to approve her own nomination -> blocked by four-eyes rule!
    expect(usePayroll.getState().decideBonus(saraNom.bonusId!, 'approved_queued', currentPeriod).ok).toBe(false);

    // Daniel (Finance) counter-approves Sara's nomination, and Sara approves Omar's nomination
    expect(usePayroll.getState().decideBonus(nom.bonusId!, 'approved_queued', currentPeriod).ok).toBe(true);
    as('u-daniel');
    expect(usePayroll.getState().decideBonus(saraNom.bonusId!, 'approved_queued', currentPeriod).ok).toBe(true);

    const activeRun = usePayroll.getState().runs.find((r) => r.period === currentPeriod)!;
    expect(activeRun.lines.find((l) => l.userId === 'u-hana')?.bonusesAed).toBe(4_000);
    expect(activeRun.lines.find((l) => l.userId === 'u-fatima')?.bonusesAed).toBe(5_000);
  });

  it('computes salary-band compa-ratios, total rewards, and UAE statutory EOSB gratuity accurately', () => {
    const users = useHub.getState().users;
    const hr = useHr.getState();
    const report = computeCompAnalytics(
      users,
      hr.comp,
      hr.elections,
      usePayroll.getState().bonuses,
      usePayroll.getState().bands,
    );

    expect(report.headcount).toBeGreaterThanOrEqual(15);
    expect(report.monthlyPayrollRunRateAed).toBeGreaterThan(400_000);
    expect(report.byDepartment.length).toBeGreaterThanOrEqual(5);

    // Kwame (< 1 year tenure) has 0 vested statutory EOSB
    const kwame = users.find((u) => u.id === 'u-kwame')!;
    const kwameEosb = computeEosbLiability(kwame, hr.comp.find((c) => c.userId === 'u-kwame'));
    expect(kwameEosb.eligible).toBe(false);
    expect(kwameEosb.accruedAed).toBe(0);

    // Layla (> 1 year tenure) accrues positive UAE statutory gratuity
    const layla = users.find((u) => u.id === 'u-layla')!;
    const laylaEosb = computeEosbLiability(layla, hr.comp.find((c) => c.userId === 'u-layla'));
    expect(laylaEosb.eligible).toBe(true);
    expect(laylaEosb.accruedAed).toBeGreaterThan(25_000);
  });

  it('generates valid UAE Central Bank WPS .SIF (EDR + SCR) and CSV payroll files', () => {
    const run = usePayroll.getState().runs[0];
    const users = useHub.getState().users;

    const sif = generateWpsSif(run, users);
    const lines = sif.split('\n');
    expect(lines.length).toBe(run.lines.length + 1);
    expect(lines[0].startsWith('EDR,')).toBe(true);
    expect(lines[lines.length - 1].startsWith('SCR,')).toBe(true);
    expect(lines[lines.length - 1]).toContain(run.totalNetAed.toFixed(2));

    const csv = generatePayrollCsv(run, users);
    expect(csv.split('\n').length).toBe(run.lines.length + 1);
    expect(csv).toContain('T&E Reimbursements (AED)');
  });

  it('v4 → v5 migration wires Expenses, Travel & Payroll routes without granting app:payroll to managers', () => {
    const seed = createSeed();
    const v4 = {
      ...seed,
      version: 4,
      apps: seed.apps.map((a) =>
        a.id === 'expenses' || a.id === 'travel' || a.id === 'payroll'
          ? { ...a, route: undefined }
          : a,
      ),
    };
    const v5 = migrateV4toV5(v4);
    expect(v5.version).toBe(5);
    expect(v5.apps.find((a) => a.id === 'expenses')?.route).toBe('/expenses');
    expect(v5.apps.find((a) => a.id === 'travel')?.route).toBe('/travel');
    expect(v5.apps.find((a) => a.id === 'payroll')?.route).toBe('/payroll');
    expect(v5.roles.find((r) => r.id === 'manager')?.permissions).not.toContain('app:payroll');
    expect(v5.roles.find((r) => r.id === 'finance')?.permissions).toContain('payroll.run');
  });
});
