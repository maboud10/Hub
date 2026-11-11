/**
 * Incident Command — static catalog: severities, lifecycle, roles, services,
 * regions and the hub apps each core service powers. Labels are English and
 * translated by the shell's DOM translator (AR_EXACT).
 */
import type { AlertSeverity, ComponentStatus, IncidentStatus, Region, RoleKey, Severity, StatusPhase } from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

export const SEVERITIES: Severity[] = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];

export const SEV_META: Record<Severity, { label: string; tone: 'danger' | 'orange' | 'warning' | 'blue'; color: string; guide: string; response: string }> = {
  SEV1: {
    label: 'Critical',
    tone: 'danger',
    color: '#ef4444',
    guide: 'Full outage or data at risk. Customer-facing systems are down.',
    response: 'All hands · exec update within 15 min · deploys frozen',
  },
  SEV2: {
    label: 'Major',
    tone: 'orange',
    color: '#f97316',
    guide: 'Significant degradation for many users or a whole region.',
    response: 'Page on-call + commander · deploys frozen',
  },
  SEV3: {
    label: 'Minor',
    tone: 'warning',
    color: '#f59e0b',
    guide: 'Partial or internal impact with a workaround.',
    response: 'Page on-call · business-hours follow-up',
  },
  SEV4: {
    label: 'Low',
    tone: 'blue',
    color: '#38bdf8',
    guide: 'Cosmetic or single-team issue.',
    response: 'Track it · no page',
  },
};

export const STATUS_META: Record<IncidentStatus, { label: string; tone: 'danger' | 'orange' | 'warning' | 'blue' | 'success' }> = {
  triggered: { label: 'Triggered', tone: 'danger' },
  acknowledged: { label: 'Acknowledged', tone: 'orange' },
  mitigating: { label: 'Mitigating', tone: 'warning' },
  monitoring: { label: 'Monitoring', tone: 'blue' },
  resolved: { label: 'Resolved', tone: 'success' },
};

export const LIFECYCLE_LABELS = ['Triggered', 'Acknowledged', 'Mitigating', 'Monitoring', 'Resolved', 'Postmortem'] as const;

export const ROLE_META: Record<RoleKey, { label: string; hint: string }> = {
  commander: { label: 'Incident commander', hint: 'Owns decisions and the clock' },
  comms: { label: 'Comms lead', hint: 'Status page, Chat and stakeholder updates' },
  ops: { label: 'Ops lead', hint: 'Hands on keyboard: mitigation and rollback' },
  scribe: { label: 'Scribe', hint: 'Keeps the timeline honest' },
};
export const ROLE_KEYS: RoleKey[] = ['commander', 'comms', 'ops', 'scribe'];

export interface ServiceMeta {
  id: string;
  label: string;
  tier: 'edge' | 'core' | 'data' | 'ops';
  /** Hub apps that degrade when this service does. */
  apps: string[];
  rotations: string[];
}

export const SERVICES: ServiceMeta[] = [
  { id: 'hub-web', label: 'hub-web', tier: 'edge', apps: [], rotations: ['rot-platform'] },
  { id: 'mail-api', label: 'mail-api', tier: 'core', apps: ['mail'], rotations: ['rot-platform'] },
  { id: 'chat-realtime', label: 'chat-realtime', tier: 'core', apps: ['chat', 'meet'], rotations: ['rot-platform'] },
  { id: 'payments-svc', label: 'payments-svc', tier: 'core', apps: ['expenses', 'procurement'], rotations: ['rot-payments', 'rot-platform'] },
  { id: 'identity-svc', label: 'identity-svc', tier: 'core', apps: [], rotations: ['rot-security', 'rot-platform'] },
  { id: 'search-svc', label: 'search-svc', tier: 'core', apps: ['wiki', 'drive'], rotations: ['rot-platform'] },
  { id: 'notifications-svc', label: 'notifications-svc', tier: 'core', apps: ['calendar'], rotations: ['rot-platform'] },
  { id: 'data-pipeline', label: 'data-pipeline', tier: 'data', apps: ['analytics'], rotations: ['rot-data'] },
  { id: 'incident-paging', label: 'incident-paging', tier: 'ops', apps: ['incidents'], rotations: ['rot-platform'] },
];
export const SERVICE_IDS = SERVICES.map((s) => s.id);
export const serviceMeta = (id: string) => SERVICES.find((s) => s.id === id);

export const REGIONS: { id: Region; city: string; angle: number }[] = [
  { id: 'eu-west-2', city: 'London', angle: 315 },
  { id: 'me-central-1', city: 'UAE', angle: 45 },
  { id: 'ap-southeast-1', city: 'Singapore', angle: 135 },
  { id: 'us-east-1', city: 'Virginia', angle: 225 },
];

export const ALERT_SEV_META: Record<AlertSeverity, { label: string; tone: 'danger' | 'orange' | 'warning' | 'blue'; rank: number }> = {
  critical: { label: 'Critical', tone: 'danger', rank: 0 },
  high: { label: 'High', tone: 'orange', rank: 1 },
  warning: { label: 'Warning', tone: 'warning', rank: 2 },
  info: { label: 'Info', tone: 'blue', rank: 3 },
};

export const COMPONENT_META: Record<ComponentStatus, { label: string; tone: 'success' | 'warning' | 'orange' | 'danger' | 'blue'; rank: number }> = {
  operational: { label: 'Operational', tone: 'success', rank: 0 },
  maintenance: { label: 'Maintenance', tone: 'blue', rank: 1 },
  degraded: { label: 'Degraded', tone: 'warning', rank: 2 },
  partial: { label: 'Partial outage', tone: 'orange', rank: 3 },
  outage: { label: 'Major outage', tone: 'danger', rank: 4 },
};

export const PHASE_META: Record<StatusPhase, { label: string; tone: 'danger' | 'orange' | 'blue' | 'success' | 'violet' }> = {
  investigating: { label: 'Investigating', tone: 'danger' },
  identified: { label: 'Identified', tone: 'orange' },
  monitoring: { label: 'Monitoring', tone: 'blue' },
  resolved: { label: 'Resolved', tone: 'success' },
  maintenance: { label: 'Maintenance', tone: 'violet' },
};

/** Default stakeholders emailed for a service (beyond the incident roles). */
export const STAKEHOLDERS: Record<string, string[]> = {
  'payments-svc': ['u-omar', 'u-aisha', 'u-grace', 'u-yusuf'],
  'incident-paging': ['u-omar', 'u-layla'],
  'identity-svc': ['u-layla', 'u-ethan', 'u-omar'],
  'data-pipeline': ['u-omar', 'u-kwame', 'u-aisha'],
};
export const DEFAULT_STAKEHOLDERS = ['u-omar', 'u-layla'];

/** Runbook templates per service (first match wins, then the generic one). */
export const RUNBOOKS: Record<string, string[]> = {
  'payments-svc': [
    'Check PSP and card-scheme status pages',
    'Compare p95 latency by region and card network',
    'Shift EU card traffic to me-central-1',
    'Roll back the suspect deploy in DevHub',
    'Verify the synthetic checkout recovers',
    'Post a customer update every 30 minutes',
  ],
  'incident-paging': [
    'Confirm carrier delivery receipts are delayed',
    'Fail over SMS to the secondary carrier',
    'Enable push + voice fallback for all rotations',
    'Send a test page to every rotation',
    'Watch delivery latency for 30 minutes',
  ],
  generic: [
    'Confirm customer impact and scope',
    'Check recent deploys and config changes',
    'Mitigate first: roll back, fail over or scale',
    'Post a status page update',
    'Verify recovery with synthetic checks',
  ],
};
