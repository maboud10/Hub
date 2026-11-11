import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeViewer } from '@/lib/appBridge';
import { getCapabilitiesForViewer } from './access';
import {
  advanceJitLifecycle,
  advanceSecretRotation,
  analyzeItemRisks,
  appendAuditEntry,
  computeJitRemaining,
  computeTotp,
  computeVaultHygiene,
  consumeShareLink,
  DAY,
  estimatePasswordEntropy,
  evaluateSecretStatus,
  evaluateShareLink,
  generateCredential,
  MINUTE,
  validateJitRequest,
  verifyAuditChain,
} from './engine';
import { base32Decode, base32Encode, seededRng, sha1Hex, sha256Hex } from './hash';
import { api as vaultBridge } from './public';
import { buildVaultSeed } from './seed';
import { useVault } from './store';

function makeViewer(
  overrides: Partial<BridgeViewer['user']>,
  permsList: string[],
): BridgeViewer {
  return {
    user: {
      id: overrides.id ?? 'u-test',
      name: overrides.name ?? 'Test User',
      email: overrides.email ?? 'test@helix.co',
      title: overrides.title ?? 'Engineer',
      department: overrides.department ?? 'Engineering',
      location: 'Dubai',
      timezone: 'Asia/Dubai',
      avatarHue: 200,
      roleIds: overrides.roleIds ?? ['role-employee'],
      grants: [],
      active: true,
      presence: 'online',
      skills: [],
      phone: '+971500000000',
      employeeId: 'EMP-01',
      startDate: '2024-01-01',
    },
    roles: [],
    perms: new Set(permsList),
  };
}

describe('Aegis Vault — Crypto, Engine, Store & Bridge', () => {
  beforeEach(() => {
    useVault.getState().resetDemo();
  });

  it('1. computes FIPS 180-4 SHA-1 and SHA-256 digests and round-trips Base32', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const sample = new Uint8Array([72, 101, 108, 105, 120]);
    const b32 = base32Encode(sample);
    expect(Array.from(base32Decode(b32))).toEqual(Array.from(sample));
  });

  it('2. generates deterministic 6-digit RFC 6238 TOTP codes with 30s window countdown', () => {
    const t0 = 1_700_000_015_000; // 1_700_000_015 % 30 === 5 -> 25s remaining
    const res = computeTotp('JBSWY3DPEHPK3PXP', t0);
    expect(res.code).toMatch(/^\d{6}$/);
    expect(res.formatted).toMatch(/^\d{3} \d{3}$/);
    expect(res.remainingSec).toBe(25);
    expect(res.progress).toBeCloseTo(25 / 30, 4);
  });

  it('3. estimates password entropy and flags k-anonymity breached credentials', () => {
    const breached = estimatePasswordEntropy('Summer2024!');
    expect(breached.label).toBe('Weak');
    expect(breached.score).toBeLessThanOrEqual(20);

    const strong = estimatePasswordEntropy('Qr9!vL2#mK8$pZ4@xN7&wT5^jB1');
    expect(strong.bits).toBeGreaterThan(100);
    expect(strong.label).toBe('Quantum-Grade');
    expect(strong.score).toBeGreaterThanOrEqual(85);
  });

  it('4. generates high-entropy passwords and diceware passphrases', () => {
    const rng = seededRng(42);
    const pwd = generateCredential(
      {
        mode: 'password',
        length: 24,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
        wordCount: 5,
        separator: '-',
      },
      rng,
    );
    expect(pwd.value).toHaveLength(24);
    expect(/[A-Z]/.test(pwd.value)).toBe(true);
    expect(/[a-z]/.test(pwd.value)).toBe(true);
    expect(/[0-9]/.test(pwd.value)).toBe(true);
    expect(pwd.entropy.score).toBeGreaterThanOrEqual(80);

    const phrase = generateCredential(
      {
        mode: 'passphrase',
        length: 20,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: false,
        wordCount: 5,
        separator: '-',
      },
      rng,
    );
    expect(phrase.value.split('-')).toHaveLength(5);
    expect(phrase.entropy.bits).toBeGreaterThan(60);
  });

  it('5. detects Watchtower risks (exposed, reused, weak, expiring, no_2fa, stale)', () => {
    const now = Date.now();
    const seed = buildVaultSeed(now);
    const breachedItem = seed.items.find((i) => i.id === 'vi-breached-sandbox')!;
    const reusedItem = seed.items.find((i) => i.id === 'vi-reused-staging')!;
    const expiringItem = seed.items.find((i) => i.id === 'vi-github-pat')!;

    expect(analyzeItemRisks(breachedItem, seed.items, now)).toContain('exposed');
    const reusedRisks = analyzeItemRisks(reusedItem, seed.items, now);
    expect(reusedRisks).toContain('reused');
    expect(reusedRisks).toContain('no_2fa');
    expect(analyzeItemRisks(expiringItem, seed.items, now)).toContain('expiring');
  });

  it('6. computes personal and org-wide hygiene scores accurately', () => {
    const now = Date.now();
    const seed = buildVaultSeed(now);
    const personal = computeVaultHygiene(seed.items, seed.secrets, seed.certificates, now, false);
    const org = computeVaultHygiene(seed.items, seed.secrets, seed.certificates, now, true);

    expect(personal.score).toBeGreaterThanOrEqual(18);
    expect(personal.score).toBeLessThan(100);
    expect(personal.exposed).toBeGreaterThanOrEqual(1);
    expect(personal.reused).toBeGreaterThanOrEqual(2);
    expect(org.overdueSecrets).toBeGreaterThanOrEqual(1);
  });

  it('7. steps through the 5-stage service secret rotation state machine', () => {
    const now = Date.now();
    const seed = buildVaultSeed(now);
    const overdue = seed.secrets.find((s) => s.id === 'sec-chat-turn')!;
    expect(evaluateSecretStatus(overdue, now)).toBe('overdue');

    const s1 = advanceSecretRotation(overdue, now);
    expect(s1.rotationStage).toBe(1);
    expect(s1.status).toBe('rotating');

    const s2 = advanceSecretRotation(s1, now);
    const s3 = advanceSecretRotation(s2, now);
    const s4 = advanceSecretRotation(s3, now);
    const s5 = advanceSecretRotation(s4, now);
    expect(s5.rotationStage).toBe(5);
    expect(s5.status).toBe('healthy');
    expect(s5.version).toBe(overdue.version + 1);
    expect(s5.nextRotationAt).toBe(now + overdue.rotationDays * DAY);
  });

  it('8. validates JIT access & break-glass requirements and computes lease countdowns', () => {
    expect(
      validateJitRequest({ resource: '', reason: 'Valid reason here', durationMins: 60 }).valid,
    ).toBe(false);
    expect(
      validateJitRequest({
        resource: 'vault://prod/db',
        reason: 'Too short',
        durationMins: 60,
        isBreakGlass: true,
      }).valid,
    ).toBe(false);
    expect(
      validateJitRequest({
        resource: 'vault://prod/db',
        reason: 'SEV1 production outage investigation INC-2041',
        durationMins: 60,
        isBreakGlass: true,
      }).valid,
    ).toBe(true);

    const now = Date.now();
    const seed = buildVaultSeed(now);
    const pending = seed.jitRequests.find((r) => r.status === 'pending')!;
    const approved = advanceJitLifecycle(pending, 'u-layla', now);
    expect(approved.status).toBe('active');
    expect(approved.stageIndex).toBe(3);
    expect(approved.leaseCredentials?.username).toContain('jit_layla_');

    const rem = computeJitRemaining(approved, now + 30 * MINUTE);
    expect(rem.expired).toBe(false);
    expect(rem.remainingMs).toBeGreaterThan(0);
  });

  it('9. enforces one-time share link single-view consumption and expiry', () => {
    const now = Date.now();
    const seed = buildVaultSeed(now);
    const activeLink = seed.shareLinks.find((l) => l.status === 'active')!;
    expect(evaluateShareLink(activeLink, now)).toBe('active');

    const firstView = consumeShareLink(activeLink, now);
    expect(firstView.ok).toBe(true);
    expect(firstView.link.status).toBe('viewed');

    const secondView = consumeShareLink(firstView.link, now + 1000);
    expect(secondView.ok).toBe(false);
  });

  it('10. verifies SHA-256 audit hash chain and catches 1-byte tampering', () => {
    const s = useVault.getState();
    const initialVerify = verifyAuditChain(s.auditLog);
    expect(initialVerify.valid).toBe(true);
    expect(initialVerify.checkedCount).toBeGreaterThanOrEqual(6);

    s.simulateAuditTamper();
    const tamperedVerify = verifyAuditChain(useVault.getState().auditLog);
    expect(tamperedVerify.valid).toBe(false);
    expect(tamperedVerify.brokenAtSeq).not.toBeNull();

    useVault.getState().repairAuditChain();
    const repairedVerify = verifyAuditChain(useVault.getState().auditLog);
    expect(repairedVerify.valid).toBe(true);
  });

  it('11. appends new audit entries maintaining valid cryptographic links', () => {
    const now = Date.now();
    const chain1 = appendAuditEntry([], {
      at: now,
      actorId: 'u-layla',
      action: 'vault.unlock',
      target: 'Enclave',
      detail: 'Genesis unlock',
      ip: '10.0.0.1',
      location: 'Dubai',
      severity: 'info',
      controls: ['SOC2-CC6.1'],
    });
    const chain2 = appendAuditEntry(chain1, {
      at: now + 1000,
      actorId: 'u-priya',
      action: 'secret.rotate',
      target: 'vault://prod/payments-svc/key',
      detail: 'Rotated v2',
      ip: '10.0.0.2',
      location: 'Bengaluru',
      severity: 'info',
      controls: ['SOC2-CC6.2'],
    });
    expect(chain2[1].prevHash).toBe(chain2[0].hash);
    expect(verifyAuditChain(chain2).valid).toBe(true);
  });

  it('12. gates capabilities accurately across Employee, Engineer, Security Admin, and Contractor', () => {
    const mei = makeViewer({ id: 'u-mei', department: 'Design' }, ['app:vault']);
    const priya = makeViewer({ id: 'u-priya', department: 'Engineering' }, ['app:vault', 'app:devhub']);
    const ethan = makeViewer({ id: 'u-ethan', department: 'IT & Security' }, ['app:vault', 'app:devhub']);
    const layla = makeViewer({ id: 'u-layla', department: 'IT & Security' }, ['*']);
    const alexContractor = makeViewer({ id: 'u-alex', department: 'Engineering' }, ['app:projects']);

    expect(getCapabilitiesForViewer(mei)).toEqual({
      canUseVault: true,
      isEngineer: false,
      isSecurityAdmin: false,
      canApproveJit: false,
      canViewAudit: false,
    });
    expect(getCapabilitiesForViewer(priya).isEngineer).toBe(true);
    expect(getCapabilitiesForViewer(priya).isSecurityAdmin).toBe(false);
    expect(getCapabilitiesForViewer(ethan).isSecurityAdmin).toBe(true);
    expect(getCapabilitiesForViewer(layla).isSecurityAdmin).toBe(true);
    expect(getCapabilitiesForViewer(alexContractor).canUseVault).toBe(false);
  });

  it('13. store batch-remediates Watchtower vulnerabilities and raises hygiene score', () => {
    const before = computeVaultHygiene(
      useVault.getState().items,
      useVault.getState().secrets,
      useVault.getState().certificates,
      Date.now(),
      false,
    );
    const rotated = useVault.getState().rotateAllVulnerableItems('u-layla');
    expect(rotated).toBeGreaterThanOrEqual(3);

    const after = computeVaultHygiene(
      useVault.getState().items,
      useVault.getState().secrets,
      useVault.getState().certificates,
      Date.now(),
      false,
    );
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.exposed).toBe(0);
    expect(after.reused).toBe(0);
  });

  it('14. bridge paletteEntries never leaks secret values and respects role permissions', () => {
    const priya = makeViewer({ id: 'u-priya', department: 'Engineering' }, ['app:vault', 'app:devhub']);
    const contractor = makeViewer({ id: 'u-alex', department: 'Engineering' }, ['app:projects']);

    expect(vaultBridge.paletteEntries(contractor)).toEqual([]);

    const entries = vaultBridge.paletteEntries(priya);
    expect(entries.length).toBeGreaterThan(4);
    const serialized = JSON.stringify(entries);
    for (const item of useVault.getState().items) {
      expect(serialized).not.toContain(item.secretValue);
      if (item.totpSecret) {
        expect(serialized).not.toContain(item.totpSecret);
      }
    }
  });

  it('15. bridge requestAccess creates a tracked JIT request and blocks unauthorized viewers', () => {
    const contractor = makeViewer({ id: 'u-alex', department: 'Engineering' }, ['app:projects']);
    expect(
      vaultBridge.requestAccess(contractor, {
        resource: 'vault://prod/payments-svc/db',
        reason: 'Testing',
        durationMins: 30,
      }).ok,
    ).toBe(false);

    const priya = makeViewer({ id: 'u-priya', department: 'Engineering' }, ['app:vault', 'app:devhub']);
    const res = vaultBridge.requestAccess(priya, {
      resource: 'vault://prod/payments-svc/redis-cache',
      reason: 'Debugging checkout session TTL',
      durationMins: 45,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.to).toContain('/vault/access?req=');
      const found = useVault.getState().jitRequests.find((r) => r.id === res.requestId);
      expect(found?.resource).toBe('vault://prod/payments-svc/redis-cache');
    }
  });
});
