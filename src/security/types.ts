/**
 * Security Center — "Bastion" domain model.
 *
 * Cases flow through a NIST-style response tracker
 * (Detected → Triaged → Contained → Eradicated → Recovered → Lessons learned);
 * every employee owns a personal shield (5 explainable segments) and their
 * own reports; the SOC sees org posture, compliance evidence and data risk.
 */
import type { SecuritySignalKind } from '@/lib/appBridge';
import type { Department } from '@/types';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CaseKind = SecuritySignalKind | 'lost_device' | 'insider';
export type CaseStage = 'detected' | 'triaged' | 'contained' | 'eradicated' | 'recovered' | 'lessons';
export type Hub = 'Dubai' | 'London' | 'Singapore' | 'New York';

/** One-click response actions a SOC analyst can run from a case. */
export type PlaybookId = 'isolate' | 'reset' | 'block' | 'declare' | 'rotate' | 'notify' | 'warroom' | 'task' | 'wipe' | 'revoke';

export interface CaseSource {
  /** App id (`mail`, `devhub`, `drive`, `helpdesk`, `cloud`, `hub`…) or a sensor (`edr`, `identity`, `gateway`). */
  app: string;
  label: string;
  to?: string;
}

export interface CaseEvent {
  id: string;
  at: number;
  kind: 'detect' | 'report' | 'stage' | 'assign' | 'action' | 'note' | 'evidence' | 'severity';
  actorId?: string;
  /** Free text (seeded / analyst-written; may stay English). */
  text: string;
  link?: { label: string; to: string };
}

export interface PlaybookRun {
  id: PlaybookId;
  at: number;
  actorId: string;
  ok: boolean;
  ref?: { label: string; to: string };
}

export interface SecCase {
  /** `SEC-1048`. */
  id: string;
  title: string;
  kind: CaseKind;
  severity: Severity;
  stage: CaseStage;
  /** Lessons learned captured — the journey is complete. */
  closed: boolean;
  createdAt: number;
  updatedAt: number;
  stageAt: Partial<Record<CaseStage, number>>;
  closedAt?: number;
  detail: string;
  source: CaseSource;
  reporterId?: string;
  /** Everyone who reported the same signal (clustered). */
  reporters: string[];
  assigneeId?: string;
  affectedUserIds: string[];
  assets: string[];
  hub?: Hub;
  /** MITRE ATT&CK technique ids. */
  mitre: string[];
  /** Indicators of compromise (domains, IPs, hashes, key ids). */
  iocs: string[];
  /** Nova detection confidence 0..1. */
  confidence: number;
  /** Minutes between first malicious activity and detection (MTTD input). */
  detectedAfterMins: number;
  timeline: CaseEvent[];
  actions: PlaybookRun[];
}

/** What an employee can report from the Report dialog. */
export type ReportKind = 'phishing' | 'suspicious_login' | 'lost_device' | 'data_leak' | 'other';

export interface MyReport {
  id: string;
  reporterId: string;
  caseId: string;
  kind: ReportKind;
  title: string;
  detail: string;
  channel?: string;
  createdAt: number;
}

/* ───────────── personal posture ───────────── */

export type MfaMethod = 'passkey' | 'totp' | 'sms' | 'none';
export type SimOutcome = 'reported' | 'ignored' | 'clicked' | 'submitted';
export type SegmentId = 'devices' | 'identity' | 'phishing' | 'training' | 'hygiene';

export interface SimResult {
  campaignId: string;
  outcome: SimOutcome;
  at: number;
}

export interface TrainingState {
  moduleId: string;
  status: 'done' | 'in_progress' | 'todo';
  dueAt: number;
  completedAt?: number;
}

export interface GameState {
  best: number;
  last: number;
  plays: number;
  streak: number;
  /** `yyyy-mm-dd` of the last play (streaks). */
  lastDay: string | null;
  badges: string[];
}

export interface VaultHygieneLite {
  score: number;
  expiringSoon: number;
  stale: number;
  exposed: number;
  weak: number;
}

export interface DeviceSeed {
  assetTag: string;
  name: string;
  kind: string;
  health: number;
}

export interface PersonalSecurity {
  userId: string;
  mfa: MfaMethod;
  passkeys: number;
  hardwareKey: boolean;
  passwordChangedAt: number;
  sessions: number;
  staleSessions: number;
  sims: SimResult[];
  training: TrainingState[];
  game: GameState;
  xp: number;
  /** Fallback credential hygiene while Vault has no data for this person. */
  vault: VaultHygieneLite;
  /** Fallback device snapshot when the IT Helpdesk can't be read for this person. */
  devices: DeviceSeed[];
}

/** Device posture derived from an IT Helpdesk device (health checks). */
export interface DeviceSignal {
  assetTag: string;
  name: string;
  kind: string;
  health: number;
  managed: boolean;
  encrypted: boolean;
  osCurrent: boolean;
  edr: 'healthy' | 'degraded' | 'missing' | 'n/a';
  to?: string;
}

export interface Driver {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad';
}

export interface Fix {
  id: string;
  label: string;
  /** Points the segment would gain. */
  gain: number;
  to?: string;
  action?: 'passkey' | 'game' | 'ack';
}

export interface Segment {
  id: SegmentId;
  label: string;
  weight: number;
  score: number;
  drivers: Driver[];
  fixes: Fix[];
  /** Built from a seeded estimate rather than a live app signal. */
  estimated?: boolean;
}

/* ───────────── awareness ───────────── */

export interface CampaignDeptResult {
  department: Department;
  sent: number;
  clicked: number;
  reported: number;
  submitted: number;
}

export interface PhishCampaign {
  id: string;
  name: string;
  lure: string;
  launchedAt: number;
  status: 'completed' | 'running';
  difficulty: 1 | 2 | 3;
  results: CampaignDeptResult[];
}

export interface TrainingModule {
  id: string;
  title: string;
  minutes: number;
  to: string;
  required: boolean;
  audience: 'all' | 'engineering';
}

/** Clickable parts of a Spot-the-phish email. */
export type GameZone = 'sender' | 'subject' | 'greeting' | 'urge' | 'link' | 'attachment' | 'signature';

export interface GameEmail {
  id: string;
  fromName: string;
  fromAddr: string;
  subject: string;
  /** `{first}` is replaced with the player's first name. */
  greeting: string;
  body: string;
  urge?: string;
  link?: { text: string; href: string };
  attachment?: string;
  signature: string;
  phish: boolean;
  /** Zones that are red flags → why (static, translated). */
  flags: Partial<Record<GameZone, string>>;
  lesson: string;
}

/* ───────────── compliance ───────────── */

export type FrameworkId = 'iso27001' | 'soc2' | 'nesa' | 'gdpr' | 'pdpl';

export interface Framework {
  id: FrameworkId;
  name: string;
  short: string;
  region: string;
  auditor: string;
}

export interface EvidenceSpec {
  id: string;
  label: string;
  app: string;
  appLabel: string;
  to: string;
  maxAgeDays: number;
  /** Seeded collection offset (days ago). */
  collectedDaysAgo: number;
  auto: boolean;
}

export interface Control {
  id: string;
  title: string;
  family: string;
  refs: Partial<Record<FrameworkId, string>>;
  evidence: string[];
  test: 'pass' | 'warn' | 'fail';
  ownerId: string;
}

export interface Policy {
  id: string;
  title: string;
  version: string;
  publishedDaysAgo: number;
}

/* ───────────── data protection ───────────── */

export type DlpChannel = 'mail' | 'drive' | 'endpoint' | 'genai' | 'chat';
export type DlpAction = 'blocked' | 'warned' | 'quarantined' | 'allowed' | 'revoked';
export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export interface DlpEvent {
  id: string;
  at: number;
  channel: DlpChannel;
  userId: string;
  object: string;
  label: Sensitivity;
  destination: string;
  action: DlpAction;
  policy: string;
  to?: string;
  caseId?: string;
  coached?: boolean;
}

export interface InsiderSignal {
  id: string;
  at: number;
  userId: string;
  kind: 'mass_download' | 'off_hours' | 'personal_cloud' | 'unusual_repo';
  detail: string;
  volume: number;
  risk: number;
  revealedBy: string[];
  caseId?: string;
}

export type Region = 'UAE' | 'EU' | 'SG';

export interface Dataset {
  id: string;
  name: string;
  region: Region;
  required: Region | 'any';
  records: number;
  regime: string;
  replicas: Region[];
}

export interface RetentionPolicy {
  id: string;
  scope: string;
  duration: string;
  basis: string;
  legalHolds: number;
  nextPurgeDays: number;
}

/* ───────────── posture catalogs ───────────── */

export interface Cve {
  id: string;
  service: string;
  title: string;
  severity: Severity;
  cvss: number;
  foundDaysAgo: number;
  fixAvailable: boolean;
  exploited?: boolean;
}

export interface Misconfig {
  id: string;
  resource: string;
  service: string;
  title: string;
  severity: Severity;
  region: string;
  rule: string;
}

export interface SurfaceAsset {
  host: string;
  kind: 'web' | 'api' | 'vpn' | 'mail' | 'legacy';
  ports: number[];
  tls: 'A+' | 'A' | 'B' | 'C' | 'F' | '—';
  certDays: number;
  exposed?: string;
}

/* ───────────── radar ───────────── */

export interface RadarOrigin {
  id: string;
  city: string;
  lon: number;
  lat: number;
}

export type AttackVector = 'credential-stuffing' | 'phishing' | 'port-scan' | 'exploit' | 'brute-force' | 'malware';

export interface RadarAttempt {
  id: string;
  originId: string;
  hub: Hub;
  vector: AttackVector;
  blocked: boolean;
  at: number;
}

/* ───────────── cross-domain posture & MITRE ───────────── */

export type PostureDomainId = 'endpoints' | 'cloud' | 'code' | 'secrets' | 'identity';

export interface PostureCheck {
  id: string;
  domain: PostureDomainId;
  title: string;
  service: string;
  severity: Severity;
  status: 'pass' | 'warn' | 'fail';
  scoreImpact: number;
  remediation: string;
  sourceApp: 'helpdesk' | 'cloud' | 'devhub' | 'vault' | 'hub';
  sourceTo: string;
}

export interface MitreTactic {
  id: string;
  name: string;
  short: string;
  techniques: { id: string; name: string }[];
}

export interface AuditorPack {
  id: string;
  frameworkId: FrameworkId;
  generatedAt: number;
  generatedBy: string;
  readinessScore: number;
  controlsPassed: number;
  controlsTotal: number;
  evidenceCount: number;
  sha256: string;
}

/* ───────────── persisted store ───────────── */

export interface SecurityData {
  version: number;
  seq: number;
  cases: SecCase[];
  reports: MyReport[];
  people: Record<string, PersonalSecurity>;
  campaigns: PhishCampaign[];
  /** Audit-readiness stage per framework (0..5, 5 = report issued). */
  frameworks: Record<FrameworkId, number>;
  /** Evidence re-collected on demand (id → epoch ms). */
  evidenceAt: Record<string, number>;
  /** Policy acknowledgements: policy id → user id → epoch ms. */
  acks: Record<string, Record<string, number>>;
  dlp: DlpEvent[];
  insider: InsiderSignal[];
  blocklist: string[];
  /** Cross-app references created from posture/data rows (key → link). */
  refs: Record<string, { label: string; to: string }>;
  /** Last personal score each person saw (bridge parity). */
  scoreCache: Record<string, number>;
  orgScore: number | null;
  /** CVEs patched by the SOC / engineering team. */
  patchedCves: string[];
  /** Cross-domain posture checks remediated. */
  remediatedChecks: string[];
  /** Generated compliance auditor evidence packs. */
  auditorPacks: AuditorPack[];
}

