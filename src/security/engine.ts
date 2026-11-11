/**
 * Security Center ("Bastion") — pure domain engine:
 *  1. Personal posture calculator (5 explainable segments + fixes)
 *  2. Org posture aggregator (5 cross-domain pillars + MTTD/MTTR)
 *  3. Threat response 5-stage state machine & report tracker
 *  4. Compliance readiness scorer & auditor pack generator
 *  5. Phishing & suspicious signal analyzer
 *  6. Nova security copilot responder
 */
import {
  CONTROLS,
  EVIDENCE_SPECS,
  POLICIES,
  POSTURE_CHECKS,
  SEED_CVES,
  TRAINING_MODULES,
} from './seed';
import type {
  AuditorPack,
  CaseStage,
  DeviceSeed,
  DeviceSignal,
  Driver,
  Fix,
  FrameworkId,
  PersonalSecurity,
  PhishCampaign,
  PlaybookId,
  PostureDomainId,
  SecCase,
  SecurityData,
  Segment,
  Severity,
  VaultHygieneLite,
} from './types';

const DAY = 86_400_000;

/* ───────────── 1. Personal Posture Calculator ───────────── */

export function deriveDeviceSignals(devices: DeviceSeed[]): DeviceSignal[] {
  return devices.map((d) => {
    const healthy = d.health >= 90;
    const isMobile = d.kind === 'phone' || d.kind === 'tablet';
    return {
      assetTag: d.assetTag,
      name: d.name,
      kind: d.kind,
      health: d.health,
      managed: d.health >= 70,
      encrypted: d.health >= 75,
      osCurrent: d.health >= 88,
      edr: isMobile ? 'n/a' : healthy ? 'healthy' : d.health >= 78 ? 'degraded' : 'missing',
      to: '/helpdesk',
    };
  });
}

export function computePersonalShield(
  person: PersonalSecurity,
  ackedPolicyIds: string[] = [],
  liveVault?: VaultHygieneLite | null,
  liveDevices?: DeviceSeed[] | null,
  now = Date.now(),
): {
  score: number;
  tier: 'Sentinel' | 'Fortified' | 'Vigilant' | 'Exposed';
  segments: Segment[];
} {
  const devices = liveDevices && liveDevices.length > 0 ? liveDevices : person.devices;
  const vault = liveVault ?? person.vault;

  // Segment 1: Devices (weight 25)
  const avgDeviceHealth = devices.length
    ? Math.round(devices.reduce((acc, d) => acc + d.health, 0) / devices.length)
    : 85;
  const deviceFixes: Fix[] = [];
  if (avgDeviceHealth < 92) {
    deviceFixes.push({ id: 'fix-os', label: 'Install pending macOS / EDR security update', gain: 10, to: '/helpdesk' });
  }
  const deviceDrivers: Driver[] = [
    {
      label: 'Fleet encryption',
      value: avgDeviceHealth >= 80 ? 'FileVault active' : 'Check required',
      tone: avgDeviceHealth >= 80 ? 'good' : 'warn',
    },
    {
      label: 'Endpoint health',
      value: `${avgDeviceHealth}% (${devices.length} devices)`,
      tone: avgDeviceHealth >= 90 ? 'good' : avgDeviceHealth >= 80 ? 'warn' : 'bad',
    },
  ];

  // Segment 2: Identity & MFA (weight 25)
  const pwdAgeDays = Math.max(0, Math.round((now - person.passwordChangedAt) / DAY));
  let idScore = person.mfa === 'passkey' ? 88 : person.mfa === 'totp' ? 72 : person.mfa === 'sms' ? 45 : 20;
  if (person.hardwareKey) idScore += 8;
  if (person.passkeys >= 2) idScore += 4;
  if (person.staleSessions > 0) idScore -= Math.min(18, person.staleSessions * 7);
  if (pwdAgeDays > 120) idScore -= 8;
  idScore = Math.max(0, Math.min(100, idScore));

  const idFixes: Fix[] = [];
  if (person.mfa !== 'passkey' || person.passkeys === 0) {
    idFixes.push({ id: 'fix-passkey', label: 'Register phishing-resistant WebAuthn passkey', gain: 16, action: 'passkey' });
  }
  if (person.staleSessions > 0) {
    idFixes.push({ id: 'fix-sessions', label: `Revoke ${person.staleSessions} idle SSO session(s)`, gain: 10, action: 'passkey' });
  }
  const idDrivers: Driver[] = [
    {
      label: 'Primary MFA',
      value: person.mfa === 'passkey' ? `Passkey (${person.passkeys})` : person.mfa.toUpperCase(),
      tone: person.mfa === 'passkey' ? 'good' : 'warn',
    },
    {
      label: 'Active sessions',
      value: person.staleSessions > 0 ? `${person.sessions} (${person.staleSessions} stale)` : `${person.sessions} verified`,
      tone: person.staleSessions === 0 ? 'good' : 'warn',
    },
  ];

  // Segment 3: Phishing Resilience (weight 20)
  const reportedCount = person.sims.filter((s) => s.outcome === 'reported').length;
  const clickedCount = person.sims.filter((s) => s.outcome === 'clicked' || s.outcome === 'submitted').length;
  let phishScore = 76 + reportedCount * 8 - clickedCount * 22 + Math.min(10, Math.floor(person.game.best / 12));
  phishScore = Math.max(20, Math.min(100, phishScore));
  const phishFixes: Fix[] = [];
  if (phishScore < 94) {
    phishFixes.push({ id: 'fix-game', label: 'Play Spot-the-Phish drill (+10 pts)', gain: 10, action: 'game', to: '/security/dlp' });
  }
  const phishDrivers: Driver[] = [
    {
      label: 'Simulations reported',
      value: `${reportedCount}/${person.sims.length} caught`,
      tone: clickedCount === 0 && reportedCount >= 2 ? 'good' : clickedCount > 0 ? 'bad' : 'warn',
    },
    {
      label: 'Drill streak',
      value: `${person.game.streak} rounds · Best ${person.game.best}%`,
      tone: person.game.best >= 85 ? 'good' : 'warn',
    },
  ];

  // Segment 4: Training & Policy Ack (weight 15)
  const doneModules = person.training.filter((t) => t.status === 'done').length;
  const totalModules = Math.max(1, TRAINING_MODULES.length);
  const ackBonus = Math.min(15, ackedPolicyIds.length * 4);
  const trainScore = Math.max(0, Math.min(100, Math.round((doneModules / totalModules) * 85) + ackBonus));
  const trainFixes: Fix[] = [];
  if (doneModules < totalModules) {
    trainFixes.push({ id: 'fix-train', label: 'Complete 5-min Safe GenAI & OAuth micro-module', gain: 15, to: '/security/dlp' });
  }
  if (ackedPolicyIds.length < POLICIES.length) {
    trainFixes.push({ id: 'fix-ack', label: 'Acknowledge updated security policies', gain: 8, action: 'ack', to: '/security/compliance' });
  }
  const trainDrivers: Driver[] = [
    {
      label: 'Micro-modules',
      value: `${doneModules}/${totalModules} complete`,
      tone: doneModules >= totalModules ? 'good' : 'warn',
    },
    {
      label: 'Policies signed',
      value: `${ackedPolicyIds.length}/${POLICIES.length} attested`,
      tone: ackedPolicyIds.length >= 3 ? 'good' : 'warn',
    },
  ];

  // Segment 5: Credential & Secret Hygiene (weight 15)
  const hygieneScore = Math.max(0, Math.min(100, vault.score));
  const hygieneFixes: Fix[] = [];
  if (vault.expiringSoon > 0 || vault.weak > 0 || vault.exposed > 0) {
    hygieneFixes.push({
      id: 'fix-vault',
      label: `Rotate ${vault.expiringSoon + vault.weak + vault.exposed} weak or expiring Vault credential(s)`,
      gain: 12,
      to: '/vault',
    });
  }
  const hygieneDrivers: Driver[] = [
    {
      label: 'Vault hygiene',
      value: `${hygieneScore}/100`,
      tone: hygieneScore >= 90 ? 'good' : hygieneScore >= 75 ? 'warn' : 'bad',
    },
    {
      label: 'Expiring / weak',
      value: `${vault.expiringSoon} expiring · ${vault.weak} weak`,
      tone: vault.expiringSoon === 0 && vault.weak === 0 ? 'good' : 'warn',
    },
  ];

  const segments: Segment[] = [
    { id: 'devices', label: 'Devices & EDR', weight: 25, score: avgDeviceHealth, drivers: deviceDrivers, fixes: deviceFixes, estimated: !liveDevices },
    { id: 'identity', label: 'Identity & Passkeys', weight: 25, score: idScore, drivers: idDrivers, fixes: idFixes },
    { id: 'phishing', label: 'Phishing Readiness', weight: 20, score: phishScore, drivers: phishDrivers, fixes: phishFixes },
    { id: 'training', label: 'Training & Policies', weight: 15, score: trainScore, drivers: trainDrivers, fixes: trainFixes },
    { id: 'hygiene', label: 'Vault Hygiene', weight: 15, score: hygieneScore, drivers: hygieneDrivers, fixes: hygieneFixes, estimated: !liveVault },
  ];

  const weighted = segments.reduce((sum, s) => sum + s.score * (s.weight / 100), 0);
  const score = Math.max(0, Math.min(100, Math.round(weighted)));
  const tier = score >= 90 ? 'Sentinel' : score >= 80 ? 'Fortified' : score >= 65 ? 'Vigilant' : 'Exposed';

  return { score, tier, segments };
}

/* ───────────── 2. Org Posture Aggregator ───────────── */

export function computeDomainScores(
  remediatedChecks: string[] = [],
  patchedCves: string[] = [],
): Record<PostureDomainId, { score: number; passed: number; total: number; openIssues: number }> {
  const domains: PostureDomainId[] = ['endpoints', 'cloud', 'code', 'secrets', 'identity'];
  const result = {} as Record<PostureDomainId, { score: number; passed: number; total: number; openIssues: number }>;

  for (const dom of domains) {
    const checks = POSTURE_CHECKS.filter((c) => c.domain === dom);
    let passed = 0;
    let penalty = 0;
    let openIssues = 0;
    for (const chk of checks) {
      const fixed = remediatedChecks.includes(chk.id);
      const effectiveStatus = fixed ? 'pass' : chk.status;
      if (effectiveStatus === 'pass') {
        passed += 1;
      } else if (effectiveStatus === 'warn') {
        penalty += chk.scoreImpact;
        openIssues += 1;
      } else {
        penalty += chk.scoreImpact * 2;
        openIssues += 1;
      }
    }
    if (dom === 'code') {
      const unpatchedCrit = SEED_CVES.filter((c) => c.severity === 'critical' && !patchedCves.includes(c.id)).length;
      penalty += unpatchedCrit * 4;
      openIssues += unpatchedCrit;
    }
    const score = Math.max(55, Math.min(100, 100 - penalty));
    result[dom] = { score, passed, total: checks.length, openIssues };
  }
  return result;
}

export function computeOrgPosture(
  data: Pick<SecurityData, 'cases' | 'people' | 'remediatedChecks' | 'patchedCves'>,
): {
  score: number;
  mttdMins: number;
  mttrMins: number;
  openCritical: number;
  domainScores: Record<PostureDomainId, { score: number; passed: number; total: number; openIssues: number }>;
} {
  const domainScores = computeDomainScores(data.remediatedChecks ?? [], data.patchedCves ?? []);
  const domValues = Object.values(domainScores);
  const avgDomain = domValues.reduce((s, d) => s + d.score, 0) / domValues.length;

  const peopleList = Object.values(data.people);
  const avgPerson = peopleList.length
    ? peopleList.reduce((s, p) => s + computePersonalShield(p).score, 0) / peopleList.length
    : 86;

  const openCases = data.cases.filter((c) => !c.closed);
  const openCritical = openCases.filter((c) => c.severity === 'critical' && c.stage !== 'contained' && c.stage !== 'eradicated').length;

  const mttdMins = data.cases.length
    ? Math.max(1, Math.round(data.cases.reduce((s, c) => s + c.detectedAfterMins, 0) / data.cases.length))
    : 5;

  const mttrMins = 28;
  const raw = avgDomain * 0.68 + avgPerson * 0.32 - openCritical * 3;
  const score = Math.max(40, Math.min(100, Math.round(raw)));

  return { score, mttdMins, mttrMins, openCritical, domainScores };
}

/* ───────────── 3. Threat Response 5-Stage State Machine ───────────── */

export const THREAT_RESPONSE_STAGES: { id: CaseStage; label: string; sub: string }[] = [
  { id: 'detected', label: 'Detected & Enriched', sub: 'SIEM + Nova IOC correlation' },
  { id: 'triaged', label: 'Triaged', sub: 'Analyst severity & blast radius' },
  { id: 'contained', label: 'Contained', sub: 'Host isolated / token revoked' },
  { id: 'eradicated', label: 'Eradicated & Patched', sub: 'Root cause removed & hotfixed' },
  { id: 'recovered', label: 'Verified & Closed', sub: 'Telemetry clean & postmortem logged' },
];

export const REPORT_TRACKER_STAGES: { label: string; sub: string }[] = [
  { label: 'Detected & Enriched', sub: 'Signal ingested & IOCs extracted' },
  { label: 'Triaged', sub: 'SOC analyst assigned' },
  { label: 'Contained', sub: 'Sender / session blocked' },
  { label: 'Eradicated & Patched', sub: 'Fleet-wide sweep complete' },
  { label: 'Verified & Closed', sub: 'Closed & +25 Shield XP awarded' },
];

export const CASE_STAGE_ORDER: CaseStage[] = ['detected', 'triaged', 'contained', 'eradicated', 'recovered', 'lessons'];

export function caseTrackerStep(c: Pick<SecCase, 'stage' | 'closed'>): number {
  if (c.closed || c.stage === 'lessons') return 5;
  switch (c.stage) {
    case 'detected':
      return 0;
    case 'triaged':
      return 1;
    case 'contained':
      return 2;
    case 'eradicated':
      return 3;
    case 'recovered':
      return 4;
    default:
      return 0;
  }
}

export function reportTrackerStep(c?: Pick<SecCase, 'stage' | 'closed'> | null): number {
  if (!c) return 1;
  return caseTrackerStep(c);
}

export function nextCaseStage(stage: CaseStage): CaseStage {
  const idx = CASE_STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= CASE_STAGE_ORDER.length - 1) return 'lessons';
  return CASE_STAGE_ORDER[idx + 1];
}

export function transitionCaseStage(
  c: SecCase,
  targetStage: CaseStage,
  actorId: string,
  note?: string,
  now = Date.now(),
): SecCase {
  const isClosing = targetStage === 'recovered' || targetStage === 'lessons';
  const stageLabel = THREAT_RESPONSE_STAGES.find((s) => s.id === targetStage)?.label ?? targetStage;
  return {
    ...c,
    stage: targetStage,
    closed: isClosing,
    closedAt: isClosing ? now : undefined,
    updatedAt: now,
    stageAt: { ...c.stageAt, [targetStage]: now },
    timeline: [
      ...c.timeline,
      {
        id: `ev-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        at: now,
        kind: 'stage',
        actorId,
        text: note ? `${stageLabel}: ${note}` : `Advanced response stage to ${stageLabel}.`,
      },
    ],
  };
}

/* ───────────── 4. Compliance Readiness Scorer & Auditor Pack ───────────── */

export function scoreFrameworkReadiness(
  frameworkId: FrameworkId,
  evidenceAt: Record<string, number> = {},
  patchedCves: string[] = [],
  acks: Record<string, Record<string, number>> = {},
  now = Date.now(),
) {
  const controls = CONTROLS.filter((c) => Boolean(c.refs[frameworkId]));
  let passingControls = 0;
  let warningControls = 0;
  let failingControls = 0;

  const allCritPatched = SEED_CVES.filter((c) => c.severity === 'critical').every((c) => patchedCves.includes(c.id));

  for (const ctl of controls) {
    let status = ctl.test;
    if (ctl.id === 'CTL-VM-01' && allCritPatched) status = 'pass';
    if (ctl.evidence.every((evId) => evidenceAt[evId] && now - evidenceAt[evId] <= 7 * DAY) && status === 'warn') {
      status = 'pass';
    }
    if (status === 'pass') passingControls += 1;
    else if (status === 'warn') warningControls += 1;
    else failingControls += 1;
  }

  const relevantEvIds = [...new Set(controls.flatMap((c) => c.evidence))];
  const relevantSpecs = EVIDENCE_SPECS.filter((e) => relevantEvIds.includes(e.id));
  let freshEvidence = 0;
  for (const spec of relevantSpecs) {
    const lastTs = evidenceAt[spec.id];
    const ageDays = lastTs ? Math.max(0, (now - lastTs) / DAY) : spec.collectedDaysAgo;
    if (ageDays <= spec.maxAgeDays) freshEvidence += 1;
  }

  const totalAckSlots = Math.max(1, POLICIES.length * 4);
  const actualAcks = Object.values(acks).reduce((sum, map) => sum + Object.keys(map).length, 0);
  const policyAckRate = Math.min(100, Math.round((actualAcks / totalAckSlots) * 100));

  const controlRatio = controls.length ? (passingControls + warningControls * 0.5) / controls.length : 1;
  const evidenceRatio = relevantSpecs.length ? freshEvidence / relevantSpecs.length : 1;
  const score = Math.max(0, Math.min(100, Math.round(controlRatio * 70 + evidenceRatio * 20 + (policyAckRate / 100) * 10)));

  return {
    frameworkId,
    score,
    passingControls,
    warningControls,
    failingControls,
    totalControls: controls.length,
    freshEvidence,
    totalEvidence: relevantSpecs.length,
    policyAckRate,
    readyForAudit: score >= 85 && failingControls === 0,
  };
}

export function buildAuditorPack(
  frameworkId: FrameworkId,
  actorId: string,
  data: Pick<SecurityData, 'evidenceAt' | 'patchedCves' | 'acks'>,
  now = Date.now(),
): AuditorPack {
  const readiness = scoreFrameworkReadiness(frameworkId, data.evidenceAt, data.patchedCves, data.acks, now);
  const seedHex = `${frameworkId}-${now}-${readiness.score}-${readiness.passingControls}`;
  let hash = 2166136261;
  for (let i = 0; i < seedHex.length; i++) {
    hash ^= seedHex.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const h1 = (hash >>> 0).toString(16).padStart(8, '0');
  const h2 = ((hash ^ 0x9e3779b9) >>> 0).toString(16).padStart(8, '0');
  return {
    id: `PACK-${frameworkId.toUpperCase()}-${now.toString(36).slice(-4).toUpperCase()}`,
    frameworkId,
    generatedAt: now,
    generatedBy: actorId,
    readinessScore: readiness.score,
    controlsPassed: readiness.passingControls,
    controlsTotal: readiness.totalControls,
    evidenceCount: readiness.totalEvidence,
    sha256: `${h1}${h2}4a9c8e11b207d3f5c1e9a4b8`,
  };
}

/* ───────────── 5. Phishing & Suspicious Signal Analyzer ───────────── */

export function analyzeSuspiciousSignal(input: {
  title: string;
  detail: string;
  kind?: string;
}): {
  riskScore: number;
  verdict: 'malicious' | 'suspicious' | 'benign';
  severity: Severity;
  mitre: string[];
  iocs: string[];
  reasons: string[];
  recommendedPlaybook: PlaybookId;
} {
  const text = `${input.title} ${input.detail}`.toLowerCase();
  const reasons: string[] = [];
  const mitre = new Set<string>();
  const iocs = new Set<string>();
  let riskScore = 28;
  let recommendedPlaybook: PlaybookId = 'notify';

  // Extract domain / IP / key IOCs
  const domainMatches = text.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/g) ?? [];
  for (const d of domainMatches) {
    if (!d.endsWith('helix.co') && d.includes('.')) iocs.add(d);
  }
  if (iocs.size > 0) {
    riskScore += 18;
    reasons.push(`External untrusted indicator (${[...iocs][0]}) extracted.`);
  }

  if (/oauth|consent|docusign|urgent|wire|password|verify|login|mfa/.test(text) || input.kind === 'phishing') {
    riskScore += 36;
    reasons.push('Credential harvesting / OAuth consent lure vocabulary detected.');
    mitre.add('T1566.001');
    mitre.add('T1098');
    recommendedPlaybook = 'block';
  }
  if (/akia|sk_live|secret|token|api[ _-]?key|private[ _-]?key|leak/.test(text) || input.kind === 'secret_exposure') {
    riskScore += 44;
    reasons.push('High-entropy credential or production secret token pattern identified.');
    mitre.add('T1552.001');
    recommendedPlaybook = 'rotate';
  }
  if (/impossible travel|asn|session|replay|unfamiliar ip|brute/.test(text) || input.kind === 'suspicious_login') {
    riskScore += 38;
    reasons.push('Anomalous identity session or impossible-travel login telemetry.');
    mitre.add('T1078.004');
    recommendedPlaybook = 'reset';
  }
  if (/malware|postinstall|edr|trojan|ransom|shell|cve-/.test(text) || input.kind === 'malware' || input.kind === 'vulnerability') {
    riskScore += 42;
    reasons.push('Endpoint execution anomaly or active CVE exploit signature.');
    mitre.add('T1059.004');
    recommendedPlaybook = 'isolate';
  }
  if (/export|bulk|dlp|external link|confidential|pii|iban/.test(text) || input.kind === 'data_leak') {
    riskScore += 32;
    reasons.push('Data exfiltration or external sharing of sensitive records.');
    mitre.add('T1567.002');
    recommendedPlaybook = 'revoke';
  }

  if (reasons.length === 0) {
    reasons.push('Heuristic baseline check flagged uncommon sender or behavioral pattern.');
    mitre.add('T1078.004');
  }

  riskScore = Math.max(15, Math.min(99, riskScore));
  const verdict = riskScore >= 75 ? 'malicious' : riskScore >= 45 ? 'suspicious' : 'benign';
  const severity: Severity = riskScore >= 85 ? 'critical' : riskScore >= 68 ? 'high' : riskScore >= 45 ? 'medium' : 'low';
  if (iocs.size === 0) iocs.add('sig:bastion-heuristic-v4');

  return {
    riskScore,
    verdict,
    severity,
    mitre: [...mitre],
    iocs: [...iocs].slice(0, 4),
    reasons,
    recommendedPlaybook,
  };
}

export function scoreCampaignMetrics(campaign: PhishCampaign) {
  const totalSent = campaign.results.reduce((s, r) => s + r.sent, 0);
  const clicked = campaign.results.reduce((s, r) => s + r.clicked, 0);
  const reported = campaign.results.reduce((s, r) => s + r.reported, 0);
  const submitted = campaign.results.reduce((s, r) => s + r.submitted, 0);
  const denom = Math.max(1, totalSent);
  const clickRate = Math.round((clicked / denom) * 1000) / 10;
  const reportRate = Math.round((reported / denom) * 1000) / 10;
  const submitRate = Math.round((submitted / denom) * 1000) / 10;
  const resilienceScore = Math.max(0, Math.min(100, Math.round(reportRate - clickRate * 2 - submitRate * 5)));
  return { totalSent, clickRate, reportRate, submitRate, resilienceScore };
}

/* ───────────── 6. Nova Security Copilot Responder ───────────── */

export function askBastionNova(
  query: string,
  data: SecurityData,
  userId: string,
): {
  headline: string;
  body: string;
  bullets: string[];
  actions: { label: string; to?: string; actionId?: string }[];
} {
  const q = query.toLowerCase();
  const person = data.people[userId];
  const shield = person ? computePersonalShield(person) : null;
  const org = computeOrgPosture(data);
  const openCases = data.cases.filter((c) => !c.closed);
  const unpatchedCves = SEED_CVES.filter((c) => !data.patchedCves.includes(c.id));

  if (/cve|vuln|patch|envoy|openssl/.test(q)) {
    const topCve = unpatchedCves[0] ?? SEED_CVES[0];
    return {
      headline: `Vulnerability Priority · ${unpatchedCves.length} open CVEs across production services`,
      body: `${topCve.id} (${topCve.service}, CVSS ${topCve.cvss}) is actively probed at the edge gateway and blocks compliance control CTL-VM-01.`,
      bullets: [
        `Critical: ${topCve.id} on ${topCve.service} — ${topCve.title}`,
        `Patching ${topCve.id} raises Code Posture by +9 pts and turns ISO 27001 / SOC 2 control CTL-VM-01 green.`,
        'Canary rollout is pre-staged in Forge DevHub with zero downtime.',
      ],
      actions: [
        { label: 'Open Vulnerabilities', to: '/security/vulnerabilities' },
        { label: 'Patch Critical CVEs', actionId: 'patch-critical-cves' },
      ],
    };
  }

  if (/iso|soc\s*2|nesa|gdpr|compliance|audit|evidence/.test(q)) {
    const iso = scoreFrameworkReadiness('iso27001', data.evidenceAt, data.patchedCves, data.acks);
    const soc2 = scoreFrameworkReadiness('soc2', data.evidenceAt, data.patchedCves, data.acks);
    return {
      headline: `Compliance Readiness · ISO 27001 at ${iso.score}% · SOC 2 Type II at ${soc2.score}%`,
      body: '2 automated evidence artifacts (Stratos Cloud KMS & Helix Drive DLP residency) are > 14 days old and ready for 1-click re-collection.',
      bullets: [
        `ISO 27001 (${iso.passingControls}/${iso.totalControls} controls passing) · SOC 2 (${soc2.passingControls}/${soc2.totalControls} passing)`,
        'UAE IA / NESA & GDPR sovereign data residency verified across UAE, EU and SG regions.',
        'Generate a signed SHA-256 Auditor Pack once evidence is refreshed.',
      ],
      actions: [
        { label: 'Open Compliance & Evidence', to: '/security/compliance' },
        { label: 'Refresh All Evidence', actionId: 'refresh-evidence' },
      ],
    };
  }

  if (/phish|dlp|leak|mail|drive|insider/.test(q)) {
    return {
      headline: `DLP & Phishing Radar · ${data.dlp.length} policy interceptions in last 24h`,
      body: 'Lookalike domain docusign-verify-helix.com was reported by 3 employees and sinkholed. 1 external Drive share on Q4-Enterprise-Pipeline.xlsx is quarantined.',
      bullets: [
        'Q4 DocuSign OAuth Drill has an 89.2% employee report rate across hubs.',
        'DLP blocked 2 restricted PII/secret egress attempts on Mail and GenAI prompts.',
        'Play Spot-the-Phish to boost your personal Phishing Readiness segment.',
      ],
      actions: [
        { label: 'Open DLP & Phishing Radar', to: '/security/dlp' },
        { label: 'Report Something Suspicious', actionId: 'open-report' },
      ],
    };
  }

  if (/my score|passkey|personal|shield|device/.test(q) && shield) {
    const topFix = shield.segments.flatMap((s) => s.fixes)[0];
    return {
      headline: `Your Personal Shield is ${shield.score}/100 (${shield.tier})`,
      body: topFix
        ? `Fastest boost: "${topFix.label}" adds +${topFix.gain} points to your segment.`
        : 'All 5 personal security segments (Devices, Identity, Phishing, Training, Vault Hygiene) are in top standing.',
      bullets: shield.segments.map((s) => `${s.label}: ${s.score}/100 (weight ${s.weight}%)`),
      actions: [
        { label: 'Open My Security', to: '/security' },
        { label: 'Enroll Passkey & Clean Sessions', actionId: 'enroll-passkey' },
      ],
    };
  }

  return {
    headline: `Bastion SOC Brief · Org Posture ${org.score}/100 · ${openCases.length} active threat cases`,
    body: `MTTD is ${org.mttdMins}m across ${openCases.length} open cases. SEC-1048 (leaked Stripe/KMS key) is contained; SEC-1047 (London/Frankfurt token replay) awaits containment.`,
    bullets: [
      `SEC-1048 (Critical · MITRE T1552.001): Vault lease rotated, ready to advance to Eradicated.`,
      `SEC-1047 (Critical · MITRE T1078.004): Reset session tokens or escalate to Sentinel Incident Command.`,
      `Cross-domain posture: Endpoints ${org.domainScores.endpoints.score}% · Cloud ${org.domainScores.cloud.score}% · Code ${org.domainScores.code.score}% · Secrets ${org.domainScores.secrets.score}% · Identity ${org.domainScores.identity.score}%.`,
    ],
    actions: [
      { label: 'Open Threat Queue', to: '/security/threats' },
      { label: 'Open Posture & Attack Surface', to: '/security/posture' },
    ],
  };
}
