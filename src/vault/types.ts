/**
 * Aegis Vault — Domain Types
 * Zero-knowledge personal & team vaults, dynamic service secrets, TLS certificates,
 * Just-in-Time (JIT) access leases, one-time share links, and SHA-256 hash-chained audit logs.
 */
import type { BridgeSource } from '@/lib/appBridge';

export const VAULT_DATA_VERSION = 2;

export type VaultItemCategory =
  | 'login'
  | 'passkey'
  | 'api_key'
  | 'card'
  | 'note'
  | 'ssh_key'
  | 'wifi'
  | 'identity';

export type WatchtowerRisk =
  | 'reused'
  | 'weak'
  | 'exposed'
  | 'expiring'
  | 'no_2fa'
  | 'stale';

export interface VaultCustomField {
  id: string;
  label: string;
  value: string;
  masked?: boolean;
}

export interface VaultRotationRecord {
  at: number;
  by: string;
  method: 'manual' | 'auto' | 'nova';
}

export interface VaultItem {
  id: string;
  /** 'personal' or a TeamVault id (e.g. 'tv-eng-prod'). */
  vaultId: string;
  ownerId: string;
  category: VaultItemCategory;
  title: string;
  subtitle: string;
  url?: string;
  username?: string;
  /** Masked/simulated secret value (never a real credential). */
  secretValue: string;
  /** RFC 4648 base32 secret for live 6-digit TOTP generation. */
  totpSecret?: string;
  fields: VaultCustomField[];
  tags: string[];
  favorite: boolean;
  /** Safe to keep visible when Travel Mode is enabled at border crossings. */
  travelSafe: boolean;
  compromised?: boolean;
  twoFactorSupported?: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  passwordUpdatedAt: number;
  expiresAt?: number;
  rotationHistory: VaultRotationRecord[];
}

export type VaultMemberRole = 'owner' | 'editor' | 'viewer';

export interface TeamVaultMember {
  userId: string;
  role: VaultMemberRole;
  addedAt: number;
}

export interface TeamVaultJoinRequest {
  id: string;
  vaultId: string;
  userId: string;
  role: VaultMemberRole;
  reason: string;
  /** 0..4 for NeoTracker stages */
  stageIndex: number;
  state: 'active' | 'done' | 'blocked';
  requestedAt: number;
  approvedBy?: string;
}

export interface TeamVault {
  id: string;
  name: string;
  department: 'Engineering' | 'Finance' | 'Growth' | 'People Ops' | 'IT & Security';
  description: string;
  icon: string;
  classification: 'internal' | 'confidential' | 'restricted';
  travelHidden: boolean;
  members: TeamVaultMember[];
  createdAt: number;
}

export interface OneTimeShareLink {
  id: string;
  token: string;
  itemId: string;
  itemTitle: string;
  createdBy: string;
  recipientUserId?: string;
  recipientEmail?: string;
  channel: 'link' | 'chat' | 'mail';
  createdAt: number;
  expiresAt: number;
  maxViews: number;
  views: number;
  status: 'active' | 'viewed' | 'expired' | 'revoked';
  lastAccessedAt?: number;
}

export type ServiceEnvironment = 'production' | 'staging' | 'development';

export type SecretStatus = 'healthy' | 'expiring_soon' | 'overdue' | 'rotating' | 'exposed';

export interface DynamicDbConfig {
  engine: 'postgres' | 'redis' | 'mysql' | 'mongodb' | 'clickhouse';
  leaseTtlMins: number;
  activeLeases: number;
  lastLeaseUser: string;
  leaseExpiresAt: number;
}

export interface SecretExposureHit {
  repo: string;
  commit: string;
  detectedAt: number;
  reportedCaseId?: string;
}

export interface ServiceSecret {
  id: string;
  service:
    | 'payments-svc'
    | 'mail-api'
    | 'hub-web'
    | 'chat-realtime'
    | 'identity-svc'
    | 'search-svc'
    | 'notifications-svc'
    | 'data-pipeline';
  env: ServiceEnvironment;
  keyName: string;
  /** e.g. vault://prod/payments-svc/stripe_live_secret */
  path: string;
  maskedPreview: string;
  version: number;
  rotationDays: number;
  lastRotatedAt: number;
  nextRotationAt: number;
  status: SecretStatus;
  /**
   * 5-stage rotation tracker index (0..5):
   * 0: Generate Secret
   * 1: KMS Envelope Seal
   * 2: Canary Distribute
   * 3: Health Verify
   * 4: Revoke Old Lease
   * 5: Complete
   */
  rotationStage: number;
  usedBy: string[];
  dynamicDb?: DynamicDbConfig;
  exposedInRepo?: SecretExposureHit;
}

export type CertStatus = 'valid' | 'expiring_soon' | 'renewing' | 'expired';

export interface TlsCertificate {
  id: string;
  domain: string;
  sanDomains: string[];
  issuer: string;
  algorithm: 'ECDSA P-384' | 'RSA-4096' | 'Ed25519';
  serialHex: string;
  fingerprintSha256: string;
  issuedAt: number;
  expiresAt: number;
  autoRenew: boolean;
  status: CertStatus;
  /**
   * 4-stage ACME / PKI tracker (0..4):
   * 0: CSR Generated
   * 1: DNS-01 Validated
   * 2: CA Signed & Issued
   * 3: Edge mTLS Deployed
   * 4: Complete
   */
  stageIndex: number;
  services: string[];
  mtlsEnabled: boolean;
}

export type JitResourceKind = 'secret' | 'team_vault' | 'db_lease' | 'cloud_role' | 'break_glass';

export type JitStatus = 'pending' | 'approved' | 'active' | 'expired' | 'revoked' | 'rejected';

export interface JitLeaseCredentials {
  username: string;
  maskedToken: string;
  connectionUri: string;
}

export interface JitAccessRequest {
  id: string;
  requesterId: string;
  resource: string;
  resourceKind: JitResourceKind;
  env: ServiceEnvironment;
  reason: string;
  durationMins: number;
  requestedAt: number;
  approvedAt?: number;
  approverId?: string;
  expiresAt?: number;
  revokedAt?: number;
  /**
   * 5-stage JIT lease tracker (0..5):
   * 0: Requested
   * 1: Peer/Owner Approved
   * 2: Dynamic Lease Issued
   * 3: Active Session
   * 4: Auto-Revoked & Audited
   * 5: Complete
   */
  stageIndex: number;
  status: JitStatus;
  isBreakGlass?: boolean;
  incidentCode?: string;
  leaseCredentials?: JitLeaseCredentials;
  source?: BridgeSource;
}

export type AuditAction =
  | 'item.reveal'
  | 'item.copy'
  | 'item.create'
  | 'item.rotate'
  | 'share.create'
  | 'share.consume'
  | 'share.revoke'
  | 'secret.rotate'
  | 'secret.expose_report'
  | 'cert.renew'
  | 'jit.request'
  | 'jit.approve'
  | 'jit.revoke'
  | 'jit.break_glass'
  | 'vault.unlock'
  | 'vault.lock'
  | 'vault.travel_mode';

export type ComplianceControlId =
  | 'SOC2-CC6.1'
  | 'SOC2-CC6.2'
  | 'ISO-A.9.4'
  | 'UAE-IA-T4'
  | 'GDPR-Art32';

export type AuditAnomalyKind = 'impossible_travel' | 'off_hours' | 'mass_export' | 'break_glass';

export interface VaultAuditEntry {
  id: string;
  seq: number;
  at: number;
  actorId: string;
  action: AuditAction;
  target: string;
  detail: string;
  ip: string;
  location: string;
  severity: 'info' | 'warning' | 'critical';
  controls: ComplianceControlId[];
  anomaly?: AuditAnomalyKind;
  prevHash: string;
  hash: string;
}

export interface PasswordGenOptions {
  mode: 'password' | 'passphrase';
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  wordCount: number;
  separator: '-' | '.' | '_';
}

export interface WatchtowerFinding {
  id: string;
  itemId?: string;
  secretId?: string;
  certId?: string;
  title: string;
  subtitle: string;
  risk: WatchtowerRisk;
  severity: 'critical' | 'high' | 'medium';
  remediation: string;
}

export interface NovaVaultAnswer {
  id: string;
  prompt: string;
  summary: string;
  bullets: string[];
  recommendedAction?: {
    label: string;
    kind: 'rotate_reused' | 'rotate_overdue_secrets' | 'renew_certs' | 'verify_chain' | 'open_jit';
  };
  at: number;
}
