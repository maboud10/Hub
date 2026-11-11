/**
 * Security Center ("Bastion") — deterministic relative-time seed data.
 */
import type {
  Control,
  Cve,
  Dataset,
  DlpEvent,
  EvidenceSpec,
  Framework,
  GameEmail,
  InsiderSignal,
  Misconfig,
  MitreTactic,
  MyReport,
  PersonalSecurity,
  PhishCampaign,
  Policy,
  PostureCheck,
  RadarAttempt,
  RadarOrigin,
  RetentionPolicy,
  SecCase,
  SecurityData,
  SurfaceAsset,
  TrainingModule,
} from './types';

export const SECURITY_DATA_VERSION = 1;

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function isoDay(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ───────────── MITRE ATT&CK Matrix Catalog ───────────── */

export const MITRE_TACTICS: MitreTactic[] = [
  {
    id: 'TA0001',
    name: 'Initial Access',
    short: 'Initial Access',
    techniques: [
      { id: 'T1566.001', name: 'Spearphishing Attachment' },
      { id: 'T1190', name: 'Exploit Public-Facing App' },
      { id: 'T1078.004', name: 'Cloud Accounts' },
    ],
  },
  {
    id: 'TA0002',
    name: 'Execution',
    short: 'Execution',
    techniques: [
      { id: 'T1059.004', name: 'Unix Shell / Postinstall' },
      { id: 'T1204.002', name: 'Malicious File Execution' },
    ],
  },
  {
    id: 'TA0003',
    name: 'Persistence',
    short: 'Persistence',
    techniques: [
      { id: 'T1098', name: 'Account Manipulation & OAuth' },
      { id: 'T1136.003', name: 'Cloud Account Creation' },
    ],
  },
  {
    id: 'TA0006',
    name: 'Credential Access',
    short: 'Credentials',
    techniques: [
      { id: 'T1552.001', name: 'Credentials In Files / Git' },
      { id: 'T1110.003', name: 'Password Spraying / Replay' },
    ],
  },
  {
    id: 'TA0007',
    name: 'Discovery & Lateral',
    short: 'Discovery',
    techniques: [
      { id: 'T1526', name: 'Cloud Service Discovery' },
      { id: 'T1071.001', name: 'Web Protocols C2' },
    ],
  },
  {
    id: 'TA0009',
    name: 'Collection',
    short: 'Collection',
    techniques: [
      { id: 'T1530', name: 'Data from Cloud Storage' },
      { id: 'T1213', name: 'Data from Info Repositories' },
    ],
  },
  {
    id: 'TA0010',
    name: 'Exfiltration',
    short: 'Exfiltration',
    techniques: [
      { id: 'T1567.002', name: 'Exfiltration to Cloud Storage' },
      { id: 'T1048', name: 'Exfiltration Over Alt Protocol' },
    ],
  },
];

/* ───────────── Cross-Domain Posture Checks ───────────── */

export const POSTURE_CHECKS: PostureCheck[] = [
  {
    id: 'CHK-END-01',
    domain: 'endpoints',
    title: 'FileVault / BitLocker full-disk encryption enforced on all fleet laptops',
    service: 'Fleet MDM',
    severity: 'high',
    status: 'pass',
    scoreImpact: 6,
    remediation: 'Verified via Jamf & Intune telemetry across 98.4% of active devices.',
    sourceApp: 'helpdesk',
    sourceTo: '/helpdesk',
  },
  {
    id: 'CHK-END-02',
    domain: 'endpoints',
    title: 'CrowdStrike Falcon EDR sensor active & kernel telemetry healthy',
    service: 'Endpoint Sensor',
    severity: 'high',
    status: 'warn',
    scoreImpact: 5,
    remediation: 'Restart EDR daemon on 2 contractor laptops with degraded heartbeat.',
    sourceApp: 'helpdesk',
    sourceTo: '/helpdesk',
  },
  {
    id: 'CHK-CLD-01',
    domain: 'cloud',
    title: 'S3 & GCS analytics buckets block public ACLs and cross-account listing',
    service: 's3://helix-bi-staging-eu',
    severity: 'critical',
    status: 'fail',
    scoreImpact: 8,
    remediation: 'Apply aws_s3_bucket_public_access_block and restrict Principal ARN in Terraform.',
    sourceApp: 'cloud',
    sourceTo: '/cloud/services',
  },
  {
    id: 'CHK-CLD-02',
    domain: 'cloud',
    title: 'Production Kubernetes ingress enforces TLS 1.3 & mTLS service mesh',
    service: 'eks-dubai-prod',
    severity: 'medium',
    status: 'pass',
    scoreImpact: 5,
    remediation: 'Istio strict mTLS verified across all 14 microservices.',
    sourceApp: 'cloud',
    sourceTo: '/cloud/observability',
  },
  {
    id: 'CHK-COD-01',
    domain: 'code',
    title: 'Branch protection & signed commits required on default branches',
    service: 'payments-svc · hub-web',
    severity: 'high',
    status: 'pass',
    scoreImpact: 6,
    remediation: '2-reviewer approval and GPG/SSH commit signing enforced in Forge.',
    sourceApp: 'devhub',
    sourceTo: '/devhub/reviews',
  },
  {
    id: 'CHK-COD-02',
    domain: 'code',
    title: 'Zero critical dependency CVEs in production container images',
    service: 'edge-gw · payments-svc',
    severity: 'critical',
    status: 'fail',
    scoreImpact: 9,
    remediation: 'Bump envoy-proxy to 1.31.2 and libcrypto3 in base Alpine image.',
    sourceApp: 'devhub',
    sourceTo: '/devhub/pipelines',
  },
  {
    id: 'CHK-SEC-01',
    domain: 'secrets',
    title: 'Production API keys rotated within 90-day policy window',
    service: 'Aegis Vault',
    severity: 'high',
    status: 'warn',
    scoreImpact: 6,
    remediation: 'Rotate 2 expiring Stripe & SendGrid secrets in Aegis Vault.',
    sourceApp: 'vault',
    sourceTo: '/vault/secrets',
  },
  {
    id: 'CHK-SEC-02',
    domain: 'secrets',
    title: 'Pre-receive secret scanning push protection active across all repos',
    service: 'Forge Secret Guard',
    severity: 'high',
    status: 'pass',
    scoreImpact: 5,
    remediation: 'High-entropy token & provider pattern blocking enabled globally.',
    sourceApp: 'vault',
    sourceTo: '/vault',
  },
  {
    id: 'CHK-IDN-01',
    domain: 'identity',
    title: 'Phishing-resistant WebAuthn passkeys enrolled for privileged admins',
    service: 'Okta FastPass',
    severity: 'critical',
    status: 'pass',
    scoreImpact: 7,
    remediation: '100% of admin & engineering prod roles use FIDO2 hardware keys or passkeys.',
    sourceApp: 'hub',
    sourceTo: '/security',
  },
  {
    id: 'CHK-IDN-02',
    domain: 'identity',
    title: 'Stale SSO sessions (> 14 days idle) automatically revoked',
    service: 'Identity Guard',
    severity: 'medium',
    status: 'warn',
    scoreImpact: 4,
    remediation: 'Revoke 5 idle mobile & browser tokens across Sales and Design.',
    sourceApp: 'hub',
    sourceTo: '/security',
  },
];

/* ───────────── Vulnerabilities & CVEs ───────────── */

export const SEED_CVES: Cve[] = [
  {
    id: 'CVE-2026-24811',
    service: 'edge-gw',
    title: 'Envoy HTTP/2 continuation frame heap overflow allowing remote code execution',
    severity: 'critical',
    cvss: 9.8,
    foundDaysAgo: 2,
    fixAvailable: true,
    exploited: true,
  },
  {
    id: 'CVE-2026-21904',
    service: 'payments-svc',
    title: 'OpenSSL 3.3 X.509 policy chain verification bypass in mTLS handshake',
    severity: 'critical',
    cvss: 9.1,
    foundDaysAgo: 4,
    fixAvailable: true,
    exploited: false,
  },
  {
    id: 'CVE-2026-19442',
    service: 'auth-sso',
    title: 'OAuth PKCE state parameter timing side-channel in token exchange endpoint',
    severity: 'high',
    cvss: 8.2,
    foundDaysAgo: 7,
    fixAvailable: true,
    exploited: false,
  },
  {
    id: 'CVE-2026-18309',
    service: 'mail-api',
    title: 'HTML sanitizer DOM clobbering vector in inbound MIME calendar invites',
    severity: 'high',
    cvss: 7.8,
    foundDaysAgo: 9,
    fixAvailable: true,
    exploited: true,
  },
  {
    id: 'CVE-2026-16012',
    service: 'analytics-worker',
    title: 'PyArrow parquet deserialization out-of-bounds read on malformed metadata',
    severity: 'medium',
    cvss: 6.5,
    foundDaysAgo: 14,
    fixAvailable: true,
    exploited: false,
  },
  {
    id: 'CVE-2026-15288',
    service: 'hub-web',
    title: 'Vite SSR preview path traversal in dev-only asset middleware',
    severity: 'medium',
    cvss: 5.4,
    foundDaysAgo: 18,
    fixAvailable: true,
    exploited: false,
  },
  {
    id: 'CVE-2026-11903',
    service: 'search-indexer',
    title: 'Regex catastrophic backtracking (ReDoS) in query tokenizer',
    severity: 'low',
    cvss: 4.3,
    foundDaysAgo: 25,
    fixAvailable: false,
    exploited: false,
  },
];

export const MISCONFIGS: Misconfig[] = [
  {
    id: 'MSC-01',
    resource: 's3://helix-bi-staging-eu',
    service: 'analytics-lake',
    title: 'Cross-account s3:ListBucket permitted to legacy partner AWS account',
    severity: 'high',
    region: 'eu-west-2 (London)',
    rule: 'CSPM-S3-004',
  },
  {
    id: 'MSC-02',
    resource: 'sg-094a21c8 (eks-worker-sg)',
    service: 'edge-gw',
    title: 'NodePort 30443 ingress open to 0.0.0.0/0 instead of Cloudflare CIDR list',
    severity: 'high',
    region: 'ap-southeast-1 (Singapore)',
    rule: 'CSPM-NET-012',
  },
  {
    id: 'MSC-03',
    resource: 'iam://ci-artifact-publisher',
    service: 'devhub-runner',
    title: 'IAM role policy includes wildcard kms:Decrypt across non-prod keys',
    severity: 'medium',
    region: 'me-central-1 (UAE)',
    rule: 'CSPM-IAM-019',
  },
  {
    id: 'MSC-04',
    resource: 'rds://ledger-replica-lon',
    service: 'finance-ledger',
    title: 'Minor engine version upgrade pending (PostgreSQL 16.4 → 16.6)',
    severity: 'low',
    region: 'eu-west-2 (London)',
    rule: 'CSPM-RDS-007',
  },
];

export const SURFACE_ASSETS: SurfaceAsset[] = [
  { host: 'app.helix.co', kind: 'web', ports: [443], tls: 'A+', certDays: 68 },
  { host: 'api.helix.co', kind: 'api', ports: [443, 8443], tls: 'A+', certDays: 54 },
  { host: 'sso.helix.co', kind: 'web', ports: [443], tls: 'A+', certDays: 81 },
  { host: 'vpn-dubai.helix.co', kind: 'vpn', ports: [443, 1194], tls: 'A', certDays: 19, exposed: 'Cert renew < 21d' },
  { host: 'mx1.helix.co', kind: 'mail', ports: [25, 465, 587], tls: 'A', certDays: 42 },
  { host: 'staging-gw.helix.co', kind: 'legacy', ports: [443, 30443], tls: 'B', certDays: 11, exposed: 'Port 30443 exposed' },
];

/* ───────────── Compliance Frameworks, Controls & Evidence ───────────── */

export const FRAMEWORKS: Framework[] = [
  { id: 'iso27001', name: 'ISO 27001', short: 'ISO 27001', region: 'Global · ISMS', auditor: 'BSI Assurance' },
  { id: 'soc2', name: 'SOC 2 Type II', short: 'SOC 2 Type II', region: 'Global · AICPA Trust', auditor: 'Deloitte Cyber' },
  { id: 'nesa', name: 'UAE IA / NESA', short: 'UAE IA / NESA', region: 'UAE · Critical InfoSec', auditor: 'UAE Cyber Council' },
  { id: 'gdpr', name: 'GDPR', short: 'GDPR', region: 'EU / UK · Data Privacy', auditor: 'EU DPO Office' },
  { id: 'pdpl', name: 'UAE PDPL', short: 'UAE PDPL', region: 'UAE · Federal Law 45', auditor: 'UAE Data Office' },
];

export const EVIDENCE_SPECS: EvidenceSpec[] = [
  { id: 'EV-01', label: 'MFA & Passkey Enrollment Roster', app: 'hub', appLabel: 'NEXUS IAM', to: '/security', maxAgeDays: 7, collectedDaysAgo: 1, auto: true },
  { id: 'EV-02', label: 'Fleet Disk Encryption & EDR Attestation', app: 'helpdesk', appLabel: 'IT Helpdesk', to: '/helpdesk', maxAgeDays: 7, collectedDaysAgo: 2, auto: true },
  { id: 'EV-03', label: 'Production Secret Rotation & Lease Log', app: 'vault', appLabel: 'Aegis Vault', to: '/vault/secrets', maxAgeDays: 14, collectedDaysAgo: 3, auto: true },
  { id: 'EV-04', label: 'Signed Commit & Branch Protection Audit', app: 'devhub', appLabel: 'Forge DevHub', to: '/devhub/reviews', maxAgeDays: 14, collectedDaysAgo: 4, auto: true },
  { id: 'EV-05', label: 'Multi-Region Cloud Encryption & KMS Keys', app: 'cloud', appLabel: 'Stratos Cloud', to: '/cloud/services', maxAgeDays: 14, collectedDaysAgo: 19, auto: true },
  { id: 'EV-06', label: 'Incident Response & Blameless Postmortems', app: 'incidents', appLabel: 'Sentinel Incidents', to: '/incidents/postmortems', maxAgeDays: 30, collectedDaysAgo: 6, auto: true },
  { id: 'EV-07', label: 'DLP Policy Enforcement & Residency Report', app: 'drive', appLabel: 'Helix Drive', to: '/security/dlp', maxAgeDays: 14, collectedDaysAgo: 18, auto: false },
];

export const CONTROLS: Control[] = [
  {
    id: 'CTL-AC-01',
    title: 'Phishing-resistant MFA & FIDO2 passkeys enforced for all workforce identities',
    family: 'Access Control',
    refs: { iso27001: 'A.8.5', soc2: 'CC6.1', nesa: 'IAM-2.1', gdpr: 'Art. 32(1)(b)', pdpl: 'Art. 20' },
    evidence: ['EV-01'],
    test: 'pass',
    ownerId: 'u-layla',
  },
  {
    id: 'CTL-AC-02',
    title: 'Just-in-time (JIT) time-boxed privileged access with dual approval',
    family: 'Access Control',
    refs: { iso27001: 'A.8.2', soc2: 'CC6.2', nesa: 'IAM-3.4', gdpr: 'Art. 25', pdpl: 'Art. 21' },
    evidence: ['EV-01', 'EV-03'],
    test: 'pass',
    ownerId: 'u-ethan',
  },
  {
    id: 'CTL-EP-01',
    title: 'Full-disk encryption and real-time EDR behavioral sensor on all managed endpoints',
    family: 'Endpoint Security',
    refs: { iso27001: 'A.8.1', soc2: 'CC6.8', nesa: 'END-1.2', gdpr: 'Art. 32(1)(a)' },
    evidence: ['EV-02'],
    test: 'pass',
    ownerId: 'u-layla',
  },
  {
    id: 'CTL-CR-01',
    title: 'Automated 90-day rotation of production API keys, TLS certificates and KMS envelopes',
    family: 'Cryptography',
    refs: { iso27001: 'A.8.24', soc2: 'CC6.7', nesa: 'CRY-1.1', gdpr: 'Art. 32(1)(a)', pdpl: 'Art. 20' },
    evidence: ['EV-03', 'EV-05'],
    test: 'warn',
    ownerId: 'u-ethan',
  },
  {
    id: 'CTL-SD-01',
    title: 'Mandatory peer code review, signed commits and SAST/SCA gate prior to production deploy',
    family: 'Secure SDLC',
    refs: { iso27001: 'A.8.28', soc2: 'CC8.1', nesa: 'DEV-2.3' },
    evidence: ['EV-04'],
    test: 'pass',
    ownerId: 'u-omar',
  },
  {
    id: 'CTL-VM-01',
    title: 'Critical CVEs (CVSS >= 9.0) patched or mitigated within 72-hour SLA window',
    family: 'Vulnerability Mgmt',
    refs: { iso27001: 'A.8.8', soc2: 'CC7.1', nesa: 'VUL-1.4', gdpr: 'Art. 32(1)(d)' },
    evidence: ['EV-04', 'EV-05'],
    test: 'fail',
    ownerId: 'u-lucas',
  },
  {
    id: 'CTL-IR-01',
    title: '24/7 incident response playbooks, war-room telemetry and blameless postmortems',
    family: 'Incident Response',
    refs: { iso27001: 'A.5.26', soc2: 'CC7.4', nesa: 'INC-1.1', gdpr: 'Art. 33', pdpl: 'Art. 9' },
    evidence: ['EV-06'],
    test: 'pass',
    ownerId: 'u-layla',
  },
  {
    id: 'CTL-DP-01',
    title: 'Data loss prevention (DLP), sovereign regional residency and automated retention purges',
    family: 'Data Privacy',
    refs: { iso27001: 'A.8.12', soc2: 'C1.2', nesa: 'DAT-2.2', gdpr: 'Art. 44', pdpl: 'Art. 22' },
    evidence: ['EV-05', 'EV-07'],
    test: 'warn',
    ownerId: 'u-grace',
  },
];

export const POLICIES: Policy[] = [
  { id: 'POL-01', title: 'Acceptable Use & Zero-Trust Device Policy', version: 'v4.2', publishedDaysAgo: 18 },
  { id: 'POL-02', title: 'Data Classification, DLP & Sovereign Residency Policy', version: 'v3.1', publishedDaysAgo: 32 },
  { id: 'POL-03', title: 'Generative AI & External LLM Safe Prompting Charter', version: 'v2.0', publishedDaysAgo: 9 },
  { id: 'POL-04', title: 'Incident Escalation & Clean-Desk Security Standard', version: 'v3.4', publishedDaysAgo: 45 },
];

/* ───────────── Awareness, Spot-the-Phish & Data Governance ───────────── */

export const TRAINING_MODULES: TrainingModule[] = [
  { id: 'TR-01', title: 'Spotting Lookalike OAuth & MFA Fatigue Attacks', minutes: 6, to: '/security/dlp', required: true, audience: 'all' },
  { id: 'TR-02', title: 'Safe Generative AI Prompting & PII Redaction', minutes: 5, to: '/security/dlp', required: true, audience: 'all' },
  { id: 'TR-03', title: 'Preventing Secret Sprawl & Supply-Chain Typosquatting', minutes: 8, to: '/security/vulnerabilities', required: true, audience: 'engineering' },
];

export const GAME_EMAILS: GameEmail[] = [
  {
    id: 'GM-01',
    fromName: 'DocuSign eSignature Desk',
    fromAddr: 'no-reply@docusign-verify-helix.com',
    subject: 'URGENT: Counter-sign Q4 Executive Equity Amendment within 2 hours',
    greeting: 'Dear {first},',
    body: 'People Ops has uploaded your revised Q4 equity schedule. Failure to authorise OAuth read-write access before 17:00 GST will forfeit vesting for this cycle.',
    urge: 'Action required in 2 hours — vesting hold imminent',
    link: { text: 'Review & Authorise Document →', href: 'https://docusign-verify-helix.com/oauth/consent?scope=mail.readwrite' },
    attachment: 'Q4_Equity_Schedule_Preview.html',
    signature: 'DocuSign Global Trust Services · Dublin',
    phish: true,
    flags: {
      sender: 'Lookalike external domain (docusign-verify-helix.com) is not an official DocuSign or helix.co domain.',
      urge: 'Manufactured 2-hour deadline designed to bypass careful verification.',
      link: 'Link requests OAuth mail.readwrite consent on an untrusted domain.',
      attachment: '.html attachment runs script in your browser to harvest session cookies.',
    },
    lesson: 'Equity and HR documents always live inside NEXUS HR Portal — never grant OAuth consent from an email link.',
  },
  {
    id: 'GM-02',
    fromName: 'NEXUS IT Support Deck',
    fromAddr: 'helpdesk@helix.co',
    subject: 'Scheduled macOS Sequoia 15.3 security update window this Thursday',
    greeting: 'Hi {first},',
    body: 'Your managed MacBook will install the signed macOS 15.3 security patch via System Settings → General → Software Update. No password entry in a browser is required.',
    link: { text: 'Open IT Helpdesk Release Notes', href: 'https://hub.helix.co/helpdesk' },
    signature: 'Layla Haddad · Head of IT & Security',
    phish: false,
    flags: {},
    lesson: 'Legitimate IT notices direct you to native OS settings or internal hub routes and never ask for credentials.',
  },
];

export const DATASETS: Dataset[] = [
  { id: 'DS-01', name: 'MENA Employee & Payroll PII Vault', region: 'UAE', required: 'UAE', records: 14_200, regime: 'UAE IA / PDPL', replicas: ['UAE'] },
  { id: 'DS-02', name: 'EU Customer Telemetry & Billing Ledger', region: 'EU', required: 'EU', records: 128_400, regime: 'EU GDPR Art. 44', replicas: ['EU'] },
  { id: 'DS-03', name: 'APAC Workspace Collaboration Metadata', region: 'SG', required: 'SG', records: 64_900, regime: 'SG PDPA', replicas: ['SG'] },
];

export const RETENTION_POLICIES: RetentionPolicy[] = [
  { id: 'RET-01', scope: 'Security Audit & SIEM Telemetry', duration: '7 years', basis: 'ISO 27001 / UAE IA', legalHolds: 2, nextPurgeDays: 14 },
  { id: 'RET-02', scope: 'Candidate Resumes & Interview Notes', duration: '12 months', basis: 'GDPR Art. 5(1)(e)', legalHolds: 0, nextPurgeDays: 4 },
  { id: 'RET-03', scope: 'Decommissioned Ephemeral CI Logs', duration: '90 days', basis: 'Data Minimisation', legalHolds: 1, nextPurgeDays: 2 },
];

export const RADAR_ORIGINS: RadarOrigin[] = [
  { id: 'or-ffm', city: 'Frankfurt ASN-49981', lon: 8.68, lat: 50.11 },
  { id: 'or-ams', city: 'Amsterdam Bulletproof', lon: 4.9, lat: 52.37 },
  { id: 'or-spb', city: 'St. Petersburg Botnet', lon: 30.33, lat: 59.93 },
  { id: 'or-hkg', city: 'Hong Kong Transit', lon: 114.17, lat: 22.32 },
  { id: 'or-sao', city: 'São Paulo Proxy Pool', lon: -46.63, lat: -23.55 },
];

export const SEED_RADAR_ATTEMPTS: RadarAttempt[] = [
  { id: 'ra-1', originId: 'or-ffm', hub: 'London', vector: 'credential-stuffing', blocked: true, at: Date.now() - 3 * MIN },
  { id: 'ra-2', originId: 'or-ams', hub: 'Dubai', vector: 'phishing', blocked: true, at: Date.now() - 8 * MIN },
  { id: 'ra-3', originId: 'or-hkg', hub: 'Singapore', vector: 'exploit', blocked: true, at: Date.now() - 12 * MIN },
  { id: 'ra-4', originId: 'or-spb', hub: 'Dubai', vector: 'brute-force', blocked: true, at: Date.now() - 19 * MIN },
  { id: 'ra-5', originId: 'or-sao', hub: 'New York', vector: 'port-scan', blocked: true, at: Date.now() - 25 * MIN },
];

/* ───────────── Per-User Personal Security Seed ───────────── */

const USER_PRESETS: Record<
  string,
  {
    mfa: PersonalSecurity['mfa'];
    passkeys: number;
    hardwareKey: boolean;
    pwdDays: number;
    sessions: number;
    stale: number;
    simOutcomes: PersonalSecurity['sims'][number]['outcome'][];
    trainingDone: number;
    vault: PersonalSecurity['vault'];
    deviceHealth: number;
    xp: number;
  }
> = {
  'u-layla': { mfa: 'passkey', passkeys: 3, hardwareKey: true, pwdDays: 14, sessions: 3, stale: 0, simOutcomes: ['reported', 'reported', 'reported'], trainingDone: 3, vault: { score: 98, expiringSoon: 0, stale: 0, exposed: 0, weak: 0 }, deviceHealth: 99, xp: 840 },
  'u-ethan': { mfa: 'passkey', passkeys: 3, hardwareKey: true, pwdDays: 19, sessions: 3, stale: 0, simOutcomes: ['reported', 'reported', 'reported'], trainingDone: 3, vault: { score: 96, expiringSoon: 0, stale: 0, exposed: 0, weak: 0 }, deviceHealth: 98, xp: 790 },
  'u-omar': { mfa: 'passkey', passkeys: 2, hardwareKey: true, pwdDays: 38, sessions: 4, stale: 0, simOutcomes: ['reported', 'reported', 'ignored'], trainingDone: 2, vault: { score: 88, expiringSoon: 1, stale: 0, exposed: 0, weak: 0 }, deviceHealth: 94, xp: 520 },
  'u-sara': { mfa: 'passkey', passkeys: 2, hardwareKey: false, pwdDays: 44, sessions: 3, stale: 0, simOutcomes: ['reported', 'reported', 'reported'], trainingDone: 3, vault: { score: 92, expiringSoon: 0, stale: 1, exposed: 0, weak: 0 }, deviceHealth: 95, xp: 610 },
  'u-daniel': { mfa: 'totp', passkeys: 0, hardwareKey: false, pwdDays: 112, sessions: 5, stale: 2, simOutcomes: ['reported', 'ignored', 'clicked'], trainingDone: 2, vault: { score: 74, expiringSoon: 2, stale: 2, exposed: 0, weak: 1 }, deviceHealth: 86, xp: 310 },
  'u-mei': { mfa: 'passkey', passkeys: 1, hardwareKey: false, pwdDays: 62, sessions: 4, stale: 1, simOutcomes: ['reported', 'ignored', 'reported'], trainingDone: 2, vault: { score: 86, expiringSoon: 1, stale: 1, exposed: 0, weak: 0 }, deviceHealth: 92, xp: 450 },
  'u-priya': { mfa: 'passkey', passkeys: 2, hardwareKey: true, pwdDays: 29, sessions: 3, stale: 0, simOutcomes: ['reported', 'reported', 'reported'], trainingDone: 3, vault: { score: 93, expiringSoon: 1, stale: 0, exposed: 0, weak: 0 }, deviceHealth: 96, xp: 640 },
  'u-lucas': { mfa: 'passkey', passkeys: 2, hardwareKey: true, pwdDays: 21, sessions: 3, stale: 0, simOutcomes: ['reported', 'reported', 'ignored'], trainingDone: 3, vault: { score: 91, expiringSoon: 0, stale: 1, exposed: 0, weak: 0 }, deviceHealth: 95, xp: 590 },
  'u-noah': { mfa: 'totp', passkeys: 0, hardwareKey: false, pwdDays: 140, sessions: 6, stale: 2, simOutcomes: ['ignored', 'clicked', 'reported'], trainingDone: 1, vault: { score: 68, expiringSoon: 2, stale: 3, exposed: 1, weak: 1 }, deviceHealth: 82, xp: 220 },
  'u-alex': { mfa: 'totp', passkeys: 0, hardwareKey: false, pwdDays: 85, sessions: 4, stale: 1, simOutcomes: ['ignored', 'reported', 'ignored'], trainingDone: 1, vault: { score: 76, expiringSoon: 1, stale: 1, exposed: 0, weak: 1 }, deviceHealth: 84, xp: 260 },
};

export function seedPersonalSecurity(userId: string, now = Date.now()): PersonalSecurity {
  const p = USER_PRESETS[userId] ?? {
    mfa: 'passkey' as const,
    passkeys: 1,
    hardwareKey: false,
    pwdDays: 52,
    sessions: 3,
    stale: 0,
    simOutcomes: ['reported', 'ignored', 'reported'] as const,
    trainingDone: 2,
    vault: { score: 88, expiringSoon: 1, stale: 0, exposed: 0, weak: 0 },
    deviceHealth: 93,
    xp: 480,
  };
  const tagNum = userId.replace(/\D/g, '') || String(100 + (userId.charCodeAt(2) || 7));
  return {
    userId,
    mfa: p.mfa,
    passkeys: p.passkeys,
    hardwareKey: p.hardwareKey,
    passwordChangedAt: now - p.pwdDays * DAY,
    sessions: p.sessions,
    staleSessions: p.stale,
    sims: [
      { campaignId: 'CMP-03', outcome: p.simOutcomes[0], at: now - 4 * DAY },
      { campaignId: 'CMP-02', outcome: p.simOutcomes[1], at: now - 19 * DAY },
      { campaignId: 'CMP-01', outcome: p.simOutcomes[2], at: now - 42 * DAY },
    ],
    training: TRAINING_MODULES.map((m, idx) => ({
      moduleId: m.id,
      status: idx < p.trainingDone ? 'done' : idx === p.trainingDone ? 'in_progress' : 'todo',
      dueAt: now + (10 - idx * 3) * DAY,
      completedAt: idx < p.trainingDone ? now - (12 - idx * 3) * DAY : undefined,
    })),
    game: {
      best: p.xp > 600 ? 100 : 80,
      last: p.xp > 600 ? 100 : 80,
      plays: 3,
      streak: p.xp > 500 ? 4 : 2,
      lastDay: isoDay(now - DAY),
      badges: p.hardwareKey ? ['Phish Hunter', 'Zero-Trust Keyholder'] : ['Phish Spotter'],
    },
    xp: p.xp,
    vault: p.vault,
    devices: [
      { assetTag: `HX-MBP-${tagNum}`, name: 'MacBook Pro 16″ M4 Max', kind: 'laptop', health: p.deviceHealth },
      { assetTag: `HX-IPH-${tagNum}`, name: 'iPhone 16 Pro · Managed', kind: 'phone', health: Math.min(100, p.deviceHealth + 3) },
    ],
  };
}

/* ───────────── Full Security Store Seed Builder ───────────── */

export function buildSecuritySeed(now = Date.now()): SecurityData {
  const cases: SecCase[] = [
    {
      id: 'SEC-1048',
      title: 'Production Stripe & AWS KMS key leaked in public fork of payments-svc',
      kind: 'secret_exposure',
      severity: 'critical',
      stage: 'contained',
      closed: false,
      createdAt: now - 38 * MIN,
      updatedAt: now - 9 * MIN,
      stageAt: { detected: now - 38 * MIN, triaged: now - 29 * MIN, contained: now - 9 * MIN },
      detail: 'Forge Secret Guard intercepted a high-entropy AWS KMS key and Stripe live token pushed to an external fork; Vault lease was auto-revoked within 90 seconds.',
      source: { app: 'devhub', label: 'Forge · payments-svc #418', to: '/devhub/reviews' },
      reporterId: 'u-priya',
      reporters: ['u-priya'],
      assigneeId: 'u-ethan',
      affectedUserIds: ['u-omar', 'u-priya'],
      assets: ['payments-svc', 'vault://prod/stripe-live', 'iam:ci-deployer'],
      hub: 'Dubai',
      mitre: ['T1552.001', 'T1078.004'],
      iocs: ['AKIAIOSFODNN7EXAMPLE', '185.220.101.44', 'github.com/anon-fork/payments-svc'],
      confidence: 0.98,
      detectedAfterMins: 3,
      timeline: [
        { id: 'ev-1', at: now - 38 * MIN, kind: 'detect', text: 'Forge push-protection webhook flagged live AWS & Stripe secret pattern.' },
        { id: 'ev-2', at: now - 29 * MIN, kind: 'stage', actorId: 'u-ethan', text: 'Ethan triaged case and correlated CloudTrail KMS Decrypt calls from 185.220.101.44.' },
        { id: 'ev-3', at: now - 9 * MIN, kind: 'action', actorId: 'u-ethan', text: 'Rotated Vault lease & blocked egress IP at edge firewall.', link: { label: 'Aegis Vault · Secrets', to: '/vault/secrets' } },
      ],
      actions: [{ id: 'rotate', at: now - 9 * MIN, actorId: 'u-ethan', ok: true, ref: { label: 'Vault Lease Rotated', to: '/vault/secrets' } }],
    },
    {
      id: 'SEC-1047',
      title: 'Impossible travel & session token replay on Finance Controller SSO session',
      kind: 'suspicious_login',
      severity: 'critical',
      stage: 'triaged',
      closed: false,
      createdAt: now - 82 * MIN,
      updatedAt: now - 24 * MIN,
      stageAt: { detected: now - 82 * MIN, triaged: now - 24 * MIN },
      detail: 'Session cookie issued in London was replayed 11 minutes later from Frankfurt ASN-49981 attempting to export Q4 wire batch approvals.',
      source: { app: 'identity', label: 'Okta FastPass · Identity Guard', to: '/security' },
      assigneeId: 'u-layla',
      reporters: [],
      affectedUserIds: ['u-daniel'],
      assets: ['HX-MBP-58', 'sso:finance-ledger'],
      hub: 'London',
      mitre: ['T1078.004', 'T1110.003'],
      iocs: ['91.214.124.88', 'session:tok_9f81c2', 'ua:python-requests/2.31'],
      confidence: 0.95,
      detectedAfterMins: 5,
      timeline: [
        { id: 'ev-4', at: now - 82 * MIN, kind: 'detect', text: 'Identity Guard detected simultaneous session tokens across London and Frankfurt ASN-49981.' },
        { id: 'ev-5', at: now - 24 * MIN, kind: 'stage', actorId: 'u-layla', text: 'Layla confirmed anomalous user-agent and step-up WebAuthn challenge initiated.' },
      ],
      actions: [],
    },
    {
      id: 'SEC-1046',
      title: 'Lookalike DocuSign OAuth consent phishing wave targeting People Ops & Finance',
      kind: 'phishing',
      severity: 'high',
      stage: 'contained',
      closed: false,
      createdAt: now - 3 * HOUR,
      updatedAt: now - 45 * MIN,
      stageAt: { detected: now - 3 * HOUR, triaged: now - 2 * HOUR, contained: now - 45 * MIN },
      detail: '3 employees reported a lookalike docusign-verify-helix.com email requesting OAuth mail.readwrite permissions. Domain sinkholed and 14 matching messages purged.',
      source: { app: 'mail', label: 'Nova Inbox · Phishing Radar', to: '/mail' },
      reporterId: 'u-sara',
      reporters: ['u-sara', 'u-fatima', 'u-grace'],
      assigneeId: 'u-ethan',
      affectedUserIds: ['u-sara', 'u-fatima'],
      assets: ['mail:gw-dubai-01', 'oauth:docusign-clone'],
      hub: 'Dubai',
      mitre: ['T1566.001', 'T1098'],
      iocs: ['docusign-verify-helix.com', '194.165.16.29', 'sha256:4a9c8e11b2'],
      confidence: 0.96,
      detectedAfterMins: 7,
      timeline: [
        { id: 'ev-6', at: now - 3 * HOUR, kind: 'report', actorId: 'u-sara', text: 'Sara Al Mansoori reported suspicious DocuSign OAuth email via 1-tap Bastion reporter.' },
        { id: 'ev-7', at: now - 45 * MIN, kind: 'action', actorId: 'u-ethan', text: 'Blocked sender domain across Mail gateway and revoked OAuth app client ID.' },
      ],
      actions: [{ id: 'block', at: now - 45 * MIN, actorId: 'u-ethan', ok: true, ref: { label: 'IOC Blocked', to: '/security/dlp' } }],
    },
    {
      id: 'SEC-1045',
      title: 'Active exploitation probe against CVE-2026-24811 on Singapore edge API gateway',
      kind: 'vulnerability',
      severity: 'high',
      stage: 'eradicated',
      closed: false,
      createdAt: now - 6 * HOUR,
      updatedAt: now - 70 * MIN,
      stageAt: { detected: now - 6 * HOUR, triaged: now - 5 * HOUR, contained: now - 3 * HOUR, eradicated: now - 70 * MIN },
      detail: 'WAF telemetry caught malformed HTTP/2 continuation frames targeting edge-gw-sg-01. Envoy hotfix deployed to canary and WAF virtual patch active.',
      source: { app: 'cloud', label: 'Stratos · Edge WAF', to: '/cloud/observability' },
      assigneeId: 'u-lucas',
      reporters: [],
      affectedUserIds: ['u-lucas', 'u-priya'],
      assets: ['edge-gw-sg-01', 'hub-web'],
      hub: 'Singapore',
      mitre: ['T1190', 'T1059.004'],
      iocs: ['45.155.205.109', 'CVE-2026-24811'],
      confidence: 0.92,
      detectedAfterMins: 4,
      timeline: [
        { id: 'ev-8', at: now - 6 * HOUR, kind: 'detect', text: 'Stratos WAF blocked 480 malformed HTTP/2 frames from 45.155.205.109.' },
        { id: 'ev-9', at: now - 70 * MIN, kind: 'stage', actorId: 'u-lucas', text: 'Patched Envoy sidecar rolled out across ap-southeast-1.' },
      ],
      actions: [],
    },
    {
      id: 'SEC-1044',
      title: 'Unusual bulk export of 420 enterprise CRM records to external link',
      kind: 'data_leak',
      severity: 'medium',
      stage: 'detected',
      closed: false,
      createdAt: now - 9 * HOUR,
      updatedAt: now - 9 * HOUR,
      stageAt: { detected: now - 9 * HOUR },
      detail: 'Helix Drive DLP flagged an external share link created on Q4-Enterprise-Pipeline.xlsx containing confidential customer contact pricing.',
      source: { app: 'drive', label: 'Helix Drive · DLP Engine', to: '/drive' },
      assigneeId: 'u-layla',
      reporters: [],
      affectedUserIds: ['u-noah'],
      assets: ['drive://Q4-Enterprise-Pipeline.xlsx'],
      hub: 'New York',
      mitre: ['T1567.002', 'T1530'],
      iocs: ['dlp:POLICY-CRM-CONFIDENTIAL'],
      confidence: 0.88,
      detectedAfterMins: 11,
      timeline: [{ id: 'ev-10', at: now - 9 * HOUR, kind: 'detect', text: 'DLP quarantined external public link on Q4-Enterprise-Pipeline.xlsx.' }],
      actions: [],
    },
    {
      id: 'SEC-1043',
      title: 'Trojanized npm postinstall script quarantined by EDR on contractor laptop',
      kind: 'malware',
      severity: 'high',
      stage: 'recovered',
      closed: true,
      createdAt: now - 26 * HOUR,
      updatedAt: now - 14 * HOUR,
      closedAt: now - 14 * HOUR,
      stageAt: {
        detected: now - 26 * HOUR,
        triaged: now - 25 * HOUR,
        contained: now - 24 * HOUR,
        eradicated: now - 18 * HOUR,
        recovered: now - 14 * HOUR,
        lessons: now - 14 * HOUR,
      },
      detail: 'Typosquatted npm package attempted outbound curl to c2.npm-telemetry-cdn.org; CrowdStrike Falcon killed the process tree and host was re-imaged.',
      source: { app: 'edr', label: 'CrowdStrike Falcon · EDR', to: '/helpdesk' },
      assigneeId: 'u-ethan',
      reporters: ['u-alex'],
      reporterId: 'u-alex',
      affectedUserIds: ['u-alex'],
      assets: ['HX-MBP-311'],
      hub: 'Singapore',
      mitre: ['T1059.004', 'T1071.001'],
      iocs: ['sha256:8f2e91d4a7c0', 'c2.npm-telemetry-cdn.org'],
      confidence: 0.99,
      detectedAfterMins: 2,
      timeline: [
        { id: 'ev-11', at: now - 26 * HOUR, kind: 'detect', text: 'EDR blocked child shell spawned by npm postinstall.' },
        { id: 'ev-12', at: now - 14 * HOUR, kind: 'stage', actorId: 'u-ethan', text: 'Workstation verified clean & internal registry allowlist enforced.' },
      ],
      actions: [{ id: 'isolate', at: now - 24 * HOUR, actorId: 'u-ethan', ok: true }],
    },
  ];

  const reports: MyReport[] = [
    {
      id: 'RPT-201',
      reporterId: 'u-sara',
      caseId: 'SEC-1046',
      kind: 'phishing',
      title: 'Lookalike DocuSign email asking for OAuth mailbox permissions',
      detail: 'Received urgent equity signing email from docusign-verify-helix.com with an HTML attachment.',
      channel: 'Nova Inbox',
      createdAt: now - 3 * HOUR,
    },
    {
      id: 'RPT-202',
      reporterId: 'u-layla',
      caseId: 'SEC-1047',
      kind: 'suspicious_login',
      title: 'Unfamiliar Frankfurt IP on Finance SSO audit feed',
      detail: 'Flagged anomalous session token replay on London Finance controller account.',
      channel: 'Identity Guard',
      createdAt: now - 80 * MIN,
    },
  ];

  const userIds = ['u-layla', 'u-sara', 'u-omar', 'u-daniel', 'u-mei', 'u-alex', 'u-priya', 'u-lucas', 'u-aisha', 'u-noah', 'u-fatima', 'u-ethan', 'u-sofia', 'u-yusuf', 'u-hana', 'u-mateo', 'u-grace', 'u-kwame'];
  const people: Record<string, PersonalSecurity> = {};
  for (const id of userIds) {
    people[id] = seedPersonalSecurity(id, now);
  }

  const campaigns: PhishCampaign[] = [
    {
      id: 'CMP-03',
      name: 'Q4 DocuSign OAuth Consent Drill',
      lure: 'Urgent Executive Equity Counter-Signature (OAuth Consent)',
      launchedAt: now - 5 * DAY,
      status: 'running',
      difficulty: 3,
      results: [
        { department: 'IT & Security', sent: 14, clicked: 0, reported: 14, submitted: 0 },
        { department: 'Engineering', sent: 48, clicked: 2, reported: 43, submitted: 0 },
        { department: 'People Ops', sent: 18, clicked: 1, reported: 16, submitted: 0 },
        { department: 'Finance', sent: 22, clicked: 2, reported: 18, submitted: 1 },
        { department: 'Sales', sent: 30, clicked: 4, reported: 21, submitted: 1 },
        { department: 'Design', sent: 16, clicked: 1, reported: 14, submitted: 0 },
      ],
    },
    {
      id: 'CMP-02',
      name: 'Fake DHL Customs Invoice QR Lure',
      lure: 'Scan QR to release held Dubai office hardware shipment',
      launchedAt: now - 21 * DAY,
      status: 'completed',
      difficulty: 2,
      results: [
        { department: 'IT & Security', sent: 14, clicked: 0, reported: 14, submitted: 0 },
        { department: 'Engineering', sent: 48, clicked: 1, reported: 45, submitted: 0 },
        { department: 'Finance', sent: 22, clicked: 1, reported: 20, submitted: 0 },
        { department: 'Sales', sent: 30, clicked: 3, reported: 24, submitted: 0 },
      ],
    },
  ];

  const dlp: DlpEvent[] = [
    {
      id: 'DLP-901',
      at: now - 42 * MIN,
      channel: 'drive',
      userId: 'u-noah',
      object: 'Q4-Enterprise-Pipeline.xlsx',
      label: 'confidential',
      destination: 'External public link (anyone with link)',
      action: 'quarantined',
      policy: 'DLP-DRIVE-CONFIDENTIAL-EXT',
      to: '/drive',
      caseId: 'SEC-1044',
    },
    {
      id: 'DLP-902',
      at: now - 2 * HOUR,
      channel: 'mail',
      userId: 'u-daniel',
      object: 'MENA_IBAN_Payout_Batch_Nov.csv',
      label: 'restricted',
      destination: 'external-auditor@gmail.com',
      action: 'blocked',
      policy: 'DLP-MAIL-IBAN-PII',
      to: '/mail',
    },
    {
      id: 'DLP-903',
      at: now - 4 * HOUR,
      channel: 'genai',
      userId: 'u-alex',
      object: 'Prompt containing staging DB connection string',
      label: 'restricted',
      destination: 'External Consumer LLM Web UI',
      action: 'blocked',
      policy: 'DLP-GENAI-SECRET-REDACT',
      to: '/devhub',
    },
    {
      id: 'DLP-904',
      at: now - 7 * HOUR,
      channel: 'mail',
      userId: 'u-sofia',
      object: 'Unannounced_Brand_Launch_Deck.pdf',
      label: 'confidential',
      destination: 'press-partner@agency.eu',
      action: 'warned',
      policy: 'DLP-MAIL-CONFIDENTIAL-WARN',
      to: '/mail',
    },
  ];

  const insider: InsiderSignal[] = [
    {
      id: 'INS-01',
      at: now - 5 * HOUR,
      userId: 'u-noah',
      kind: 'mass_download',
      detail: 'Downloaded 38 CRM account decks and exported pipeline sheet outside normal New York working hours.',
      volume: 420,
      risk: 78,
      revealedBy: ['u-layla'],
      caseId: 'SEC-1044',
    },
    {
      id: 'INS-02',
      at: now - 16 * HOUR,
      userId: 'u-alex',
      kind: 'unusual_repo',
      detail: 'Cloned 6 unrelated backend payment repositories from a new Lisbon residential IP.',
      volume: 6,
      risk: 64,
      revealedBy: [],
    },
  ];

  return {
    version: SECURITY_DATA_VERSION,
    seq: 1049,
    cases,
    reports,
    people,
    campaigns,
    frameworks: { iso27001: 4, soc2: 4, nesa: 3, gdpr: 4, pdpl: 3 },
    evidenceAt: {
      'EV-01': now - 1 * DAY,
      'EV-02': now - 2 * DAY,
      'EV-03': now - 3 * DAY,
      'EV-04': now - 4 * DAY,
      'EV-06': now - 6 * DAY,
    },
    acks: {
      'POL-01': { 'u-layla': now - 12 * DAY, 'u-ethan': now - 12 * DAY, 'u-omar': now - 10 * DAY, 'u-sara': now - 9 * DAY },
      'POL-02': { 'u-layla': now - 15 * DAY, 'u-ethan': now - 14 * DAY, 'u-omar': now - 11 * DAY },
      'POL-03': { 'u-layla': now - 5 * DAY, 'u-ethan': now - 5 * DAY },
      'POL-04': { 'u-layla': now - 20 * DAY, 'u-ethan': now - 19 * DAY, 'u-sara': now - 18 * DAY },
    },
    dlp,
    insider,
    blocklist: ['docusign-verify-helix.com', '185.220.101.44', '45.155.205.109', 'c2.npm-telemetry-cdn.org'],
    refs: {},
    scoreCache: {},
    orgScore: 86,
    patchedCves: [],
    remediatedChecks: [],
    auditorPacks: [
      {
        id: 'PACK-ISO-01',
        frameworkId: 'iso27001',
        generatedAt: now - 2 * DAY,
        generatedBy: 'u-layla',
        readinessScore: 91,
        controlsPassed: 6,
        controlsTotal: 8,
        evidenceCount: 7,
        sha256: '9f8e4a12c7b03d19e5f618a204b7c9d1e3f5a7b9',
      },
    ],
  };
}
