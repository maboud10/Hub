/**
 * Security Center ("Bastion") — unit tests for engine, store, access, and SecurityBridge.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { BridgeViewer } from '@/lib/appBridge';
import { SEED_ROLES } from '@/data/roles';
import { SEED_USERS } from '@/data/users';
import { effectivePermissions } from '@/lib/rbac';
import { viewerCapabilities } from './access';
import {
  analyzeSuspiciousSignal,
  askBastionNova,
  buildAuditorPack,
  caseTrackerStep,
  computeDomainScores,
  computeOrgPosture,
  computePersonalShield,
  deriveDeviceSignals,
  scoreCampaignMetrics,
  scoreFrameworkReadiness,
  transitionCaseStage,
} from './engine';
import { api } from './public';
import { POLICIES, seedPersonalSecurity } from './seed';
import { useSecurity } from './store';

function makeViewer(userId: string): BridgeViewer {
  const user = SEED_USERS.find((u) => u.id === userId)!;
  return {
    user,
    roles: SEED_ROLES,
    perms: effectivePermissions(user, SEED_ROLES),
  };
}

describe('Security Center ("Bastion") domain & bridge', () => {
  beforeEach(() => {
    useSecurity.getState().resetDemo();
  });

  it('1. computes personal security shield score (0..100) and 5 explainable segments', () => {
    const layla = seedPersonalSecurity('u-layla');
    const daniel = seedPersonalSecurity('u-daniel');
    const laylaShield = computePersonalShield(layla, POLICIES.map((p) => p.id));
    const danielShield = computePersonalShield(daniel, []);

    expect(laylaShield.segments).toHaveLength(5);
    expect(laylaShield.score).toBeGreaterThanOrEqual(90);
    expect(laylaShield.tier).toBe('Sentinel');
    expect(danielShield.score).toBeLessThan(laylaShield.score);
    expect(danielShield.segments.find((s) => s.id === 'identity')?.fixes.length).toBeGreaterThan(0);
  });

  it('2. derives device signals accurately from device health', () => {
    const signals = deriveDeviceSignals([
      { assetTag: 'HX-1', name: 'MacBook Pro', kind: 'laptop', health: 96 },
      { assetTag: 'HX-2', name: 'Legacy Laptop', kind: 'laptop', health: 74 },
      { assetTag: 'HX-3', name: 'iPhone', kind: 'phone', health: 92 },
    ]);
    expect(signals[0].edr).toBe('healthy');
    expect(signals[0].encrypted).toBe(true);
    expect(signals[1].edr).toBe('missing');
    expect(signals[1].encrypted).toBe(false);
    expect(signals[2].edr).toBe('n/a');
  });

  it('3. aggregates cross-domain posture scores across Endpoints, Cloud, Code, Secrets, and Identity', () => {
    const base = computeDomainScores([], []);
    expect(Object.keys(base)).toEqual(['endpoints', 'cloud', 'code', 'secrets', 'identity']);
    expect(base.cloud.openIssues).toBeGreaterThan(0);

    const improved = computeDomainScores(['CHK-CLD-01', 'CHK-COD-02'], ['CVE-2026-24811', 'CVE-2026-21904']);
    expect(improved.cloud.score).toBeGreaterThan(base.cloud.score);
    expect(improved.code.score).toBeGreaterThan(base.code.score);
  });

  it('4. calculates org posture score, MTTD, and open critical count', () => {
    const state = useSecurity.getState();
    const org = computeOrgPosture(state);
    expect(org.score).toBeGreaterThanOrEqual(70);
    expect(org.score).toBeLessThanOrEqual(100);
    expect(org.mttdMins).toBeGreaterThan(0);
    expect(org.openCritical).toBeGreaterThanOrEqual(1);
  });

  it('5. maps Threat Response 5-stage tracker steps and advances case stages cleanly', () => {
    const c = useSecurity.getState().cases.find((x) => x.id === 'SEC-1047')!;
    expect(c.stage).toBe('triaged');
    expect(caseTrackerStep(c)).toBe(1);

    const contained = transitionCaseStage(c, 'contained', 'u-layla', 'Revoked session token');
    expect(contained.stage).toBe('contained');
    expect(caseTrackerStep(contained)).toBe(2);

    const closed = transitionCaseStage(contained, 'recovered', 'u-layla', 'Verified clean');
    expect(closed.closed).toBe(true);
    expect(caseTrackerStep(closed)).toBe(5);
  });

  it('6. analyzes suspicious signals for phishing, secret exposure, and data leaks with MITRE mapping', () => {
    const phish = analyzeSuspiciousSignal({
      title: 'Urgent DocuSign OAuth consent required',
      detail: 'Click https://evil-docusign-login.org to verify password within 1 hour',
      kind: 'phishing',
    });
    expect(phish.verdict).toBe('malicious');
    expect(phish.mitre).toContain('T1566.001');
    expect(phish.iocs).toContain('evil-docusign-login.org');
    expect(phish.recommendedPlaybook).toBe('block');

    const secret = analyzeSuspiciousSignal({
      title: 'Leaked AKIA AWS key in repo',
      detail: 'Found sk_live_ token in commit history',
      kind: 'secret_exposure',
    });
    expect(secret.mitre).toContain('T1552.001');
    expect(secret.recommendedPlaybook).toBe('rotate');
  });

  it('7. scores compliance readiness across ISO 27001, SOC 2 Type II, UAE IA / NESA, and GDPR', () => {
    const state = useSecurity.getState();
    const isoBefore = scoreFrameworkReadiness('iso27001', state.evidenceAt, state.patchedCves, state.acks);
    const soc2Before = scoreFrameworkReadiness('soc2', state.evidenceAt, state.patchedCves, state.acks);
    const nesaBefore = scoreFrameworkReadiness('nesa', state.evidenceAt, state.patchedCves, state.acks);
    const gdprBefore = scoreFrameworkReadiness('gdpr', state.evidenceAt, state.patchedCves, state.acks);

    expect(isoBefore.totalControls).toBeGreaterThan(0);
    expect(soc2Before.totalControls).toBeGreaterThan(0);
    expect(nesaBefore.totalControls).toBeGreaterThan(0);
    expect(gdprBefore.totalControls).toBeGreaterThan(0);

    // Patching critical CVEs & refreshing evidence increases readiness score
    state.patchAllCriticalCves();
    state.refreshEvidence();
    const afterState = useSecurity.getState();
    const isoAfter = scoreFrameworkReadiness('iso27001', afterState.evidenceAt, afterState.patchedCves, afterState.acks);
    expect(isoAfter.score).toBeGreaterThanOrEqual(isoBefore.score);
    expect(isoAfter.failingControls).toBe(0);
  });

  it('8. builds a deterministic signed Auditor Pack with SHA-256 digest', () => {
    const state = useSecurity.getState();
    const pack = buildAuditorPack('soc2', 'u-layla', state, 1762890000000);
    expect(pack.frameworkId).toBe('soc2');
    expect(pack.sha256.length).toBeGreaterThanOrEqual(32);
    expect(pack.controlsTotal).toBeGreaterThan(0);
  });

  it('9. computes phishing campaign resilience metrics', () => {
    const campaign = useSecurity.getState().campaigns[0];
    const metrics = scoreCampaignMetrics(campaign);
    expect(metrics.totalSent).toBeGreaterThan(100);
    expect(metrics.reportRate).toBeGreaterThan(80);
    expect(metrics.resilienceScore).toBeGreaterThan(60);
  });

  it('10. enrolls passkey and boosts personal security score in store', () => {
    const before = computePersonalShield(useSecurity.getState().people['u-daniel']).score;
    useSecurity.getState().enrollPasskey('u-daniel');
    const after = computePersonalShield(useSecurity.getState().people['u-daniel']).score;
    expect(after).toBeGreaterThan(before);
    expect(useSecurity.getState().people['u-daniel'].mfa).toBe('passkey');
    expect(useSecurity.getState().people['u-daniel'].staleSessions).toBe(0);
  });

  it('11. submits a suspicious report, creates an enriched SOC case, and awards XP', () => {
    const beforeCount = useSecurity.getState().cases.length;
    const beforeXp = useSecurity.getState().people['u-mei'].xp;
    const res = useSecurity.getState().submitReport({
      reporterId: 'u-mei',
      kind: 'phishing',
      title: 'Suspicious OAuth invoice from docusign-login-alert.net',
      detail: 'Asked for password and MFA token urgently',
      channel: 'Nova Inbox',
    });

    const afterState = useSecurity.getState();
    expect(afterState.cases.length).toBe(beforeCount + 1);
    expect(afterState.cases[0].id).toBe(res.caseId);
    expect(afterState.cases[0].mitre).toContain('T1566.001');
    expect(afterState.people['u-mei'].xp).toBe(beforeXp + 25);
  });

  it('12. executes SOC containment playbooks and auto-transitions Triaged cases to Contained', () => {
    useSecurity.getState().runPlaybook('SEC-1047', 'reset', 'u-layla', {
      label: 'Session Revoked',
      to: '/security',
    });
    const updated = useSecurity.getState().cases.find((c) => c.id === 'SEC-1047')!;
    expect(updated.stage).toBe('contained');
    expect(updated.actions.some((a) => a.id === 'reset')).toBe(true);
  });

  it('13. enforces RBAC capabilities on SecurityBridge.postureScore (SOC gets org score, employee gets personal score, contractor gets 0)', () => {
    const laylaViewer = makeViewer('u-layla'); // SOC / Admin
    const danielViewer = makeViewer('u-daniel'); // Finance employee
    const alexViewer = makeViewer('u-alex'); // Contractor (no app:security)

    expect(viewerCapabilities(laylaViewer).isSoc).toBe(true);
    expect(viewerCapabilities(danielViewer).canAccess).toBe(true);
    expect(viewerCapabilities(danielViewer).isSoc).toBe(false);
    expect(viewerCapabilities(alexViewer).canAccess).toBe(false);

    const orgScore = api.postureScore(laylaViewer);
    const danielScore = api.postureScore(danielViewer);
    const alexScore = api.postureScore(alexViewer);

    expect(orgScore).toBe(computeOrgPosture(useSecurity.getState()).score);
    expect(danielScore).toBe(computePersonalShield(useSecurity.getState().people['u-daniel']).score);
    expect(alexScore).toBe(0);
  });

  it('14. gates SecurityBridge.reportSignal and paletteEntries by viewer permissions', () => {
    const meiViewer = makeViewer('u-mei');
    const alexViewer = makeViewer('u-alex');

    const denied = api.reportSignal(alexViewer, {
      kind: 'phishing',
      title: 'Contractor phish test',
    });
    expect(denied.ok).toBe(false);
    expect(api.paletteEntries(alexViewer)).toHaveLength(0);

    const allowed = api.reportSignal(meiViewer, {
      kind: 'secret_exposure',
      title: 'Found staging token in shared doc',
      severity: 'high',
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.caseId).toMatch(/^SEC-/);
      expect(allowed.to).toContain(allowed.caseId);
    }
    expect(api.paletteEntries(meiViewer).length).toBeGreaterThan(0);
  });

  it('15. responds contextually via askBastionNova for CVE, compliance, phishing, and personal shield prompts', () => {
    const state = useSecurity.getState();
    const cveAns = askBastionNova('Which critical CVE should we patch first?', state, 'u-layla');
    expect(cveAns.headline).toContain('Vulnerability');
    expect(cveAns.actions.length).toBeGreaterThan(0);

    const compAns = askBastionNova('What is our ISO 27001 and SOC 2 compliance status?', state, 'u-layla');
    expect(compAns.headline).toContain('Compliance');

    const shieldAns = askBastionNova('How can I improve my personal shield score and passkey?', state, 'u-daniel');
    expect(shieldAns.headline).toContain('Personal Shield');
  });

  it('16. resets demo state cleanly via api.resetDemo()', () => {
    useSecurity.getState().patchCve('CVE-2026-24811');
    expect(useSecurity.getState().patchedCves).toContain('CVE-2026-24811');
    api.resetDemo();
    expect(useSecurity.getState().patchedCves).toHaveLength(0);
  });
});
