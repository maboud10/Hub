/**
 * Aegis Vault — Pure Crypto, Hygiene, Rotation, JIT Lease & Hash-Chain Engine
 */
import type { BridgeVaultHygiene } from '@/lib/appBridge';
import {
  randInt,
  randomToken,
  secureRandom,
  sha1Hex,
  sha256Hex,
  TOTP_STEP,
  totpFor,
  totpRemaining,
} from './hash';
import type {
  JitAccessRequest,
  NovaVaultAnswer,
  OneTimeShareLink,
  PasswordGenOptions,
  SecretStatus,
  ServiceSecret,
  TlsCertificate,
  VaultAuditEntry,
  VaultItem,
  WatchtowerFinding,
  WatchtowerRisk,
} from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const JIT_STAGE_STEPS = [
  'Requested',
  'Peer/Owner Approved',
  'Dynamic Lease Issued',
  'Active Session',
  'Auto-Revoked & Audited',
] as const;

export const ROTATION_STAGE_STEPS = [
  'Generate Secret',
  'KMS Envelope Seal',
  'Canary Distribute',
  'Health Verify',
  'Revoke Old Lease',
] as const;

export const CERT_STAGE_STEPS = [
  'CSR Generated',
  'DNS-01 Validated',
  'CA Signed & Issued',
  'Edge mTLS Deployed',
] as const;

export const JOIN_STAGE_STEPS = [
  'Requested',
  'Manager Review',
  'Owner Approved',
  'Key Escrow',
  'Access Granted',
] as const;

/* ───────────────────── Password & Passphrase Generator ───────────────────── */

const WORDLIST = [
  'aegis', 'amber', 'anchor', 'apollo', 'argon', 'atlas', 'aurora', 'bastion',
  'beacon', 'bismuth', 'blazar', 'boson', 'caliber', 'canopy', 'carbon', 'cascade',
  'celeste', 'cipher', 'cobalt', 'comet', 'corona', 'cosmos', 'crystal', 'cygnus',
  'delta', 'dynamo', 'eclipse', 'ember', 'enigma', 'epoch', 'equinox', 'falcon',
  'fathom', 'fjord', 'flux', 'forge', 'fractal', 'fusion', 'galaxy', 'garnet',
  'glacier', 'granite', 'halcyon', 'harbor', 'helium', 'helix', 'horizon', 'hyperion',
  'ignite', 'indigo', 'ion', 'iridium', 'ivory', 'jasper', 'juniper', 'krypton',
  'lumen', 'lyra', 'magnet', 'mantle', 'matrix', 'meridian', 'meteor', 'mirage',
  'monolith', 'nebula', 'neon', 'nexus', 'nimbus', 'nova', 'obsidian', 'omega',
  'onyx', 'orbit', 'orion', 'osmium', 'paladin', 'paradox', 'photon', 'pinnacle',
  'plasma', 'prism', 'pulsar', 'pyrite', 'quantum', 'quasar', 'quartz', 'radon',
  'raptor', 'reflex', 'relic', 'ripple', 'rubicon', 'sapphire', 'scepter', 'sentinel',
  'seraph', 'solstice', 'sonar', 'spectra', 'sphinx', 'stellar', 'stratos', 'summit',
  'synapse', 'tangent', 'tempest', 'tensor', 'titanium', 'topaz', 'trident', 'tundra',
  'umbra', 'valkyrie', 'vanguard', 'vector', 'velvet', 'vertex', 'vortex', 'vulcan',
  'warden', 'xenon', 'zenith', 'zephyr', 'zircon',
];

/** Known weak/exposed SHA-1 digests for k-anonymity Watchtower demonstration. */
const KNOWN_BREACHED_SHA1 = new Set([
  sha1Hex('Summer2024!'),
  sha1Hex('Password123!'),
  sha1Hex('HelixAdmin2024'),
  sha1Hex('welcome123'),
  sha1Hex('qwerty2025'),
]);

export function isBreachedCredential(secretValue: string): boolean {
  if (!secretValue) return false;
  return KNOWN_BREACHED_SHA1.has(sha1Hex(secretValue));
}

export interface EntropyReport {
  bits: number;
  score: number;
  label: 'Weak' | 'Fair' | 'Strong' | 'Quantum-Grade';
  crackTime: string;
}

export function estimatePasswordEntropy(value: string): EntropyReport {
  if (!value) {
    return { bits: 0, score: 0, label: 'Weak', crackTime: 'Instant' };
  }
  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/[0-9]/.test(value)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(value)) pool += 32;
  if (pool === 0) pool = 26;

  // Penalize repeated characters or common dictionary patterns
  const uniqueRatio = new Set(value.split('')).size / value.length;
  const rawBits = value.length * Math.log2(pool) * (0.65 + 0.35 * uniqueRatio);
  const bits = Math.round(rawBits);

  let score = Math.min(100, Math.round((bits / 110) * 100));
  if (value.length < 10) score = Math.min(score, 38);
  if (isBreachedCredential(value)) score = Math.min(score, 18);

  const label: EntropyReport['label'] =
    score >= 85 ? 'Quantum-Grade' : score >= 65 ? 'Strong' : score >= 42 ? 'Fair' : 'Weak';

  const crackTime =
    bits >= 100
      ? '> 10,000 centuries'
      : bits >= 75
        ? '420 centuries'
        : bits >= 58
          ? '6 years'
          : bits >= 44
            ? '14 hours'
            : 'Seconds';

  return { bits, score, label, crackTime };
}

export function generateCredential(
  opts: PasswordGenOptions,
  rng: () => number = secureRandom(),
): { value: string; entropy: EntropyReport } {
  if (opts.mode === 'passphrase') {
    const count = Math.max(3, Math.min(10, opts.wordCount || 5));
    const sep = opts.separator || '-';
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      let w = WORDLIST[randInt(WORDLIST.length, rng)];
      if (opts.uppercase && i === 0) {
        w = w.charAt(0).toUpperCase() + w.slice(1);
      }
      words.push(w);
    }
    if (opts.digits) {
      words[words.length - 1] = `${words[words.length - 1]}${randInt(90, rng) + 10}`;
    }
    const value = words.join(sep);
    return { value, entropy: estimatePasswordEntropy(value) };
  }

  const len = Math.max(8, Math.min(64, opts.length || 20));
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_+=:?';

  const pools: string[] = [];
  if (opts.lowercase) pools.push(lower);
  if (opts.uppercase) pools.push(upper);
  if (opts.digits) pools.push(digits);
  if (opts.symbols) pools.push(symbols);
  if (pools.length === 0) pools.push(lower, digits);

  const combined = pools.join('');
  const chars: string[] = [];
  // Guarantee at least one char from each selected character class
  for (const p of pools) {
    chars.push(p[randInt(p.length, rng)]);
  }
  while (chars.length < len) {
    chars.push(combined[randInt(combined.length, rng)]);
  }
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  const value = chars.join('');
  return { value, entropy: estimatePasswordEntropy(value) };
}

/* ───────────────────────────── TOTP Generator ───────────────────────────── */

export function computeTotp(secretB32: string, now: number): {
  code: string;
  formatted: string;
  remainingSec: number;
  progress: number;
} {
  const code = totpFor(secretB32, now);
  const remainingSec = totpRemaining(now, TOTP_STEP);
  const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    code,
    formatted,
    remainingSec,
    progress: remainingSec / TOTP_STEP,
  };
}

/* ───────────────────── Watchtower & Hygiene Calculator ───────────────────── */

export function analyzeItemRisks(item: VaultItem, allItems: VaultItem[], now: number): WatchtowerRisk[] {
  const risks: WatchtowerRisk[] = [];
  const checkableSecret = item.category === 'login' || item.category === 'api_key' || item.category === 'ssh_key' || item.category === 'wifi';

  if (item.compromised || isBreachedCredential(item.secretValue)) {
    risks.push('exposed');
  }

  if (checkableSecret && item.secretValue) {
    const duplicates = allItems.filter(
      (other) => other.id !== item.id && other.secretValue && other.secretValue === item.secretValue,
    );
    if (duplicates.length > 0) {
      risks.push('reused');
    }

    const ent = estimatePasswordEntropy(item.secretValue);
    if (ent.score < 50) {
      risks.push('weak');
    }
  }

  if (item.expiresAt && item.expiresAt - now <= 14 * DAY) {
    risks.push('expiring');
  }

  if (item.category === 'login' && item.twoFactorSupported && !item.totpSecret) {
    risks.push('no_2fa');
  }

  if (checkableSecret && now - item.passwordUpdatedAt > 180 * DAY) {
    risks.push('stale');
  }

  return risks;
}

export interface FullVaultHygiene extends BridgeVaultHygiene {
  reused: number;
  no2fa: number;
  overdueSecrets: number;
  expiringCerts: number;
  findings: WatchtowerFinding[];
}

export function computeVaultHygiene(
  items: VaultItem[],
  secrets: ServiceSecret[],
  certs: TlsCertificate[],
  now: number,
  includeOrg = false,
): FullVaultHygiene {
  let exposed = 0;
  let weak = 0;
  let reused = 0;
  let expiringSoon = 0;
  let stale = 0;
  let no2fa = 0;
  const findings: WatchtowerFinding[] = [];

  for (const item of items) {
    const risks = analyzeItemRisks(item, items, now);
    if (risks.includes('exposed')) {
      exposed++;
      findings.push({
        id: `wf-exp-${item.id}`,
        itemId: item.id,
        title: item.title,
        subtitle: item.subtitle,
        risk: 'exposed',
        severity: 'critical',
        remediation: 'Credential hash matched a known breach corpus (k-anonymity SHA-1). Rotate immediately.',
      });
    }
    if (risks.includes('reused')) {
      reused++;
      findings.push({
        id: `wf-reuse-${item.id}`,
        itemId: item.id,
        title: item.title,
        subtitle: item.subtitle,
        risk: 'reused',
        severity: 'high',
        remediation: 'Shared secret value across multiple vault entries. Generate a unique credential.',
      });
    }
    if (risks.includes('weak')) {
      weak++;
      findings.push({
        id: `wf-weak-${item.id}`,
        itemId: item.id,
        title: item.title,
        subtitle: item.subtitle,
        risk: 'weak',
        severity: 'high',
        remediation: 'Low entropy (< 50 score). Upgrade to a 20+ character plasma credential or passkey.',
      });
    }
    if (risks.includes('expiring')) {
      expiringSoon++;
      findings.push({
        id: `wf-expiring-${item.id}`,
        itemId: item.id,
        title: item.title,
        subtitle: item.subtitle,
        risk: 'expiring',
        severity: 'medium',
        remediation: 'Token or key expires within 14 days. Schedule rotation before service disruption.',
      });
    }
    if (risks.includes('stale')) {
      stale++;
    }
    if (risks.includes('no_2fa')) {
      no2fa++;
      findings.push({
        id: `wf-2fa-${item.id}`,
        itemId: item.id,
        title: item.title,
        subtitle: item.subtitle,
        risk: 'no_2fa',
        severity: 'medium',
        remediation: 'Service supports TOTP / Passkey 2FA but no second factor is enrolled.',
      });
    }
  }

  let overdueSecrets = 0;
  let expiringCerts = 0;

  if (includeOrg) {
    for (const sec of secrets) {
      const st = evaluateSecretStatus(sec, now);
      if (st === 'exposed') {
        exposed++;
        findings.push({
          id: `wf-sec-exp-${sec.id}`,
          secretId: sec.id,
          title: `${sec.service} · ${sec.keyName}`,
          subtitle: sec.path,
          risk: 'exposed',
          severity: 'critical',
          remediation: `Detected in ${sec.exposedInRepo?.repo ?? 'repository'}. Rotate lease & notify SOC.`,
        });
      } else if (st === 'overdue' || st === 'expiring_soon') {
        overdueSecrets++;
        expiringSoon++;
        findings.push({
          id: `wf-sec-rot-${sec.id}`,
          secretId: sec.id,
          title: `${sec.service} · ${sec.keyName}`,
          subtitle: sec.path,
          risk: 'expiring',
          severity: st === 'overdue' ? 'high' : 'medium',
          remediation: 'Service secret rotation window overdue. Trigger 5-stage zero-downtime rotation.',
        });
      }
    }
    for (const cert of certs) {
      if (cert.expiresAt - now <= 21 * DAY && cert.status !== 'valid') {
        expiringCerts++;
        expiringSoon++;
      }
    }
  }

  const penalty =
    exposed * 16 +
    reused * 7 +
    weak * 8 +
    expiringSoon * 3 +
    stale * 2 +
    no2fa * 3 +
    overdueSecrets * 4;

  const score = Math.max(18, Math.min(100, 100 - penalty));

  return {
    score,
    expiringSoon,
    stale,
    exposed,
    weak,
    reused,
    no2fa,
    overdueSecrets,
    expiringCerts,
    findings,
  };
}

/* ───────────────────── Service Secret Rotation Engine ───────────────────── */

export function evaluateSecretStatus(secret: ServiceSecret, now: number): SecretStatus {
  if (secret.exposedInRepo && !secret.exposedInRepo.reportedCaseId && secret.rotationStage >= 5) {
    return 'exposed';
  }
  if (secret.status === 'rotating' || (secret.rotationStage > 0 && secret.rotationStage < 5)) {
    return 'rotating';
  }
  if (secret.nextRotationAt <= now) {
    return 'overdue';
  }
  if (secret.nextRotationAt - now <= 7 * DAY) {
    return 'expiring_soon';
  }
  return 'healthy';
}

export function advanceSecretRotation(secret: ServiceSecret, now: number): ServiceSecret {
  const nextStage = secret.rotationStage >= 5 ? 1 : secret.rotationStage + 1;
  if (nextStage >= 5) {
    const suffix = randomToken(4);
    return {
      ...secret,
      version: secret.version + 1,
      maskedPreview: `aegis_v${secret.version + 1}_••••_${suffix}`,
      lastRotatedAt: now,
      nextRotationAt: now + secret.rotationDays * DAY,
      rotationStage: 5,
      status: 'healthy',
      exposedInRepo: undefined,
    };
  }
  return {
    ...secret,
    rotationStage: nextStage,
    status: 'rotating',
  };
}

/* ───────────────────────── JIT Access State Machine ───────────────────────── */

export function validateJitRequest(input: {
  resource: string;
  reason: string;
  durationMins: number;
  isBreakGlass?: boolean;
}): { valid: boolean; error?: string } {
  const res = input.resource.trim();
  const reason = input.reason.trim();
  if (!res) {
    return { valid: false, error: 'Resource path is required.' };
  }
  const minReasonLen = input.isBreakGlass ? 15 : 6;
  if (reason.length < minReasonLen) {
    return {
      valid: false,
      error: input.isBreakGlass
        ? 'Break-glass emergency access requires a detailed justification (at least 15 characters).'
        : 'Please provide a justification for audit compliance.',
    };
  }
  if (!Number.isFinite(input.durationMins) || input.durationMins < 15 || input.durationMins > 480) {
    return { valid: false, error: 'Lease duration must be between 15 minutes and 8 hours (480 mins).' };
  }
  return { valid: true };
}

export function computeJitRemaining(req: JitAccessRequest, now: number): {
  remainingMs: number;
  remainingLabel: string;
  expired: boolean;
  progress: number;
} {
  if (req.status === 'revoked' || req.status === 'expired' || req.status === 'rejected') {
    return { remainingMs: 0, remainingLabel: '0m', expired: true, progress: 1 };
  }
  if (!req.expiresAt || !req.approvedAt) {
    return {
      remainingMs: req.durationMins * MINUTE,
      remainingLabel: `${req.durationMins}m`,
      expired: false,
      progress: 0.25,
    };
  }
  const total = Math.max(MINUTE, req.expiresAt - req.approvedAt);
  const rem = Math.max(0, req.expiresAt - now);
  if (rem === 0) {
    return { remainingMs: 0, remainingLabel: 'Expired', expired: true, progress: 1 };
  }
  const mins = Math.ceil(rem / MINUTE);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const remainingLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const progress = Math.max(0.05, Math.min(0.98, 1 - rem / total));
  return { remainingMs: rem, remainingLabel, expired: false, progress };
}

export function advanceJitLifecycle(
  req: JitAccessRequest,
  actorId: string,
  now: number,
): JitAccessRequest {
  if (req.status === 'pending' || req.stageIndex === 0) {
    const tokenSuffix = randomToken(6);
    const expiresAt = now + req.durationMins * MINUTE;
    return {
      ...req,
      status: 'active',
      stageIndex: 3, // Active Session (stages 1 & 2 completed automatically on approval)
      approverId: actorId,
      approvedAt: now,
      expiresAt,
      leaseCredentials: {
        username: `jit_${actorId.replace('u-', '')}_${ tokenSuffix.slice(0, 4) }`,
        maskedToken: `aegis_lease_••••_${tokenSuffix}`,
        connectionUri: `${req.resource}?lease=jit_${tokenSuffix}&ttl=${req.durationMins}m`,
      },
    };
  }
  if (req.stageIndex < 5) {
    return {
      ...req,
      status: 'expired',
      stageIndex: 5,
      revokedAt: now,
    };
  }
  return req;
}

/* ───────────────────────── One-Time Share Links ───────────────────────── */

export function evaluateShareLink(
  link: OneTimeShareLink,
  now: number,
): OneTimeShareLink['status'] {
  if (link.status === 'revoked') return 'revoked';
  if (link.views >= link.maxViews || link.status === 'viewed') return 'viewed';
  if (now >= link.expiresAt) return 'expired';
  return 'active';
}

export function consumeShareLink(
  link: OneTimeShareLink,
  now: number,
): { ok: boolean; link: OneTimeShareLink; error?: string } {
  const status = evaluateShareLink(link, now);
  if (status !== 'active') {
    return {
      ok: false,
      link: { ...link, status },
      error: `Share link is ${status} and can no longer be decrypted.`,
    };
  }
  const views = link.views + 1;
  const nextStatus = views >= link.maxViews ? 'viewed' : 'active';
  return {
    ok: true,
    link: {
      ...link,
      views,
      lastAccessedAt: now,
      status: nextStatus,
    },
  };
}

/* ─────────────────── Tamper-Evident SHA-256 Hash Chain ─────────────────── */

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function computeAuditEntryHash(entry: Omit<VaultAuditEntry, 'hash'>): string {
  const payload = [
    entry.seq,
    entry.at,
    entry.actorId,
    entry.action,
    entry.target,
    entry.detail,
    entry.ip,
    entry.location,
    entry.severity,
    entry.prevHash,
  ].join('|');
  return sha256Hex(payload);
}

export function appendAuditEntry(
  chain: VaultAuditEntry[],
  input: Omit<VaultAuditEntry, 'id' | 'seq' | 'prevHash' | 'hash'>,
): VaultAuditEntry[] {
  const prev = chain[0]; // chain is stored newest-first or oldest-first? Let's keep chain sorted by seq ascending or handle both!
  const ordered = [...chain].sort((a, b) => a.seq - b.seq);
  const tail = ordered[ordered.length - 1];
  const seq = tail ? tail.seq + 1 : 1;
  const prevHash = tail ? tail.hash : GENESIS_HASH;
  const draft: Omit<VaultAuditEntry, 'hash'> = {
    ...input,
    id: `aud-${seq}-${randomToken(4)}`,
    seq,
    prevHash,
  };
  const hash = computeAuditEntryHash(draft);
  const full: VaultAuditEntry = { ...draft, hash };
  void prev;
  return [...ordered, full];
}

export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  brokenAtSeq: number | null;
  headHash: string;
  expectedHash?: string;
  actualHash?: string;
}

export function verifyAuditChain(chain: VaultAuditEntry[]): ChainVerificationResult {
  if (chain.length === 0) {
    return {
      valid: true,
      checkedCount: 0,
      brokenAtSeq: null,
      headHash: GENESIS_HASH,
    };
  }
  const ordered = [...chain].sort((a, b) => a.seq - b.seq);
  let expectedPrev = GENESIS_HASH;

  for (const entry of ordered) {
    if (entry.prevHash !== expectedPrev) {
      return {
        valid: false,
        checkedCount: ordered.length,
        brokenAtSeq: entry.seq,
        headHash: ordered[ordered.length - 1].hash,
        expectedHash: expectedPrev,
        actualHash: entry.prevHash,
      };
    }
    const recomputed = computeAuditEntryHash(entry);
    if (recomputed !== entry.hash) {
      return {
        valid: false,
        checkedCount: ordered.length,
        brokenAtSeq: entry.seq,
        headHash: ordered[ordered.length - 1].hash,
        expectedHash: recomputed,
        actualHash: entry.hash,
      };
    }
    expectedPrev = entry.hash;
  }

  return {
    valid: true,
    checkedCount: ordered.length,
    brokenAtSeq: null,
    headHash: ordered[ordered.length - 1].hash,
  };
}

/* ─────────────────────────── Nova AI Responder ─────────────────────────── */

export function askVaultNova(
  prompt: string,
  ctx: {
    hygiene: FullVaultHygiene;
    secrets: ServiceSecret[];
    certs: TlsCertificate[];
    jitRequests: JitAccessRequest[];
    chainStatus: ChainVerificationResult;
    now: number;
  },
): NovaVaultAnswer {
  const q = prompt.toLowerCase();
  const { hygiene, secrets, certs, jitRequests, chainStatus, now } = ctx;

  if (q.includes('reuse') || q.includes('weak') || q.includes('hygiene') || q.includes('watchtower') || q.includes('password')) {
    return {
      id: `nova-${now}`,
      prompt,
      summary: `Aegis Watchtower scored your credential hygiene at ${hygiene.score}/100. I detected ${hygiene.exposed} exposed, ${hygiene.reused} reused, and ${hygiene.weak} low-entropy credentials.`,
      bullets: [
        hygiene.exposed > 0
          ? `${hygiene.exposed} credential(s) match k-anonymity breach hashes and must be rotated first.`
          : 'Zero credentials match known breach corpuses.',
        hygiene.reused > 0
          ? `${hygiene.reused} login(s) share identical secrets — one-tap rotation will replace them with 128-bit plasma keys.`
          : 'All personal logins use unique secrets.',
        hygiene.no2fa > 0
          ? `${hygiene.no2fa} account(s) support TOTP or Passkeys without 2FA enrolled.`
          : 'All eligible logins have TOTP or FIDO2 Passkeys active.',
      ],
      recommendedAction:
        hygiene.reused > 0 || hygiene.weak > 0 || hygiene.exposed > 0
          ? { label: 'Auto-rotate vulnerable credentials', kind: 'rotate_reused' }
          : undefined,
      at: now,
    };
  }

  if (q.includes('secret') || q.includes('rotat') || q.includes('payment') || q.includes('service') || q.includes('lease')) {
    const overdue = secrets.filter((s) => evaluateSecretStatus(s, now) === 'overdue' || evaluateSecretStatus(s, now) === 'exposed');
    return {
      id: `nova-${now}`,
      prompt,
      summary: `Across ${secrets.length} dynamic service secrets, ${overdue.length} require immediate rotation (including any repo-exposed tokens).`,
      bullets: [
        overdue.length > 0
          ? `Priority targets: ${overdue.map((s) => `${s.service}/${s.keyName}`).join(', ')}.`
          : 'All production and staging secrets are within their rotation SLA.',
        'Zero-downtime 5-stage rotation seals new keys in KMS, updates canary pods, verifies health, and revokes old leases.',
      ],
      recommendedAction: overdue.length > 0 ? { label: 'Rotate overdue service secrets', kind: 'rotate_overdue_secrets' } : undefined,
      at: now,
    };
  }

  if (q.includes('cert') || q.includes('tls') || q.includes('mtls') || q.includes('ssl')) {
    const exp = certs.filter((c) => c.status !== 'valid');
    return {
      id: `nova-${now}`,
      prompt,
      summary: `Inspected ${certs.length} TLS/mTLS certificates across edge and mesh domains; ${exp.length} are expiring soon or mid-renewal.`,
      bullets: [
        exp.length > 0
          ? `Attention needed on: ${exp.map((c) => c.domain).join(', ')}.`
          : 'All edge and internal mTLS certificates are valid with ACME auto-renew armed.',
        'ACME DNS-01 validation + Envoy SDS hot-reload deploys renewed certificates without dropping connections.',
      ],
      recommendedAction: exp.length > 0 ? { label: 'Renew expiring certificates', kind: 'renew_certs' } : undefined,
      at: now,
    };
  }

  if (q.includes('audit') || q.includes('chain') || q.includes('hash') || q.includes('tamper') || q.includes('soc')) {
    return {
      id: `nova-${now}`,
      prompt,
      summary: chainStatus.valid
        ? `SHA-256 audit ledger is intact across all ${chainStatus.checkedCount} blocks (head ${chainStatus.headHash.slice(0, 12)}…).`
        : `ALERT: Cryptographic tamper detected at block #${chainStatus.brokenAtSeq}! Hash mismatch against genesis chain.`,
      bullets: [
        `Every reveal, copy, share link, secret rotation, and JIT lease is chained via FIPS 180-4 SHA-256.`,
        `Mapped to SOC2-CC6.1, SOC2-CC6.2, ISO-A.9.4, UAE-IA-T4, and GDPR-Art32 evidence controls.`,
      ],
      recommendedAction: { label: 'Verify SHA-256 hash chain', kind: 'verify_chain' },
      at: now,
    };
  }

  const activeJit = jitRequests.filter((r) => r.status === 'active' || r.status === 'pending');
  return {
    id: `nova-${now}`,
    prompt,
    summary: `Aegis Vault posture is ${hygiene.score}/100 with ${activeJit.length} active/pending JIT access leases and ${chainStatus.checkedCount} verified SHA-256 audit blocks.`,
    bullets: [
      `${hygiene.exposed + hygiene.reused + hygiene.weak} Watchtower credential findings ready for one-tap remediation.`,
      `${secrets.filter((s) => evaluateSecretStatus(s, now) !== 'healthy').length} service secret(s) queued for zero-downtime rotation.`,
      `Audit ledger integrity: ${chainStatus.valid ? 'Verified (100% intact)' : `Tampered at #${chainStatus.brokenAtSeq}`}.`,
    ],
    recommendedAction: { label: 'Auto-rotate vulnerable credentials', kind: 'rotate_reused' },
    at: now,
  };
}
