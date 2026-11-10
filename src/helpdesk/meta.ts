/**
 * Labels, ordering and small lookups shared by the domain and the UI.
 * (Icons live in the UI layer — this module stays React-free.)
 */
import type {
  ApprovalRole,
  CatalogKind,
  DeviceKind,
  DeviceStatus,
  Impact,
  IncidentSeverity,
  IncidentStatus,
  MdmAction,
  Office,
  Priority,
  ResolutionCode,
  ServiceHealth,
  TicketCategory,
  TicketStatus,
  Urgency,
} from './types';

export const CATEGORIES: { id: TicketCategory; label: string; hint: string; tone: string }[] = [
  { id: 'hardware', label: 'Hardware', hint: 'Laptop, monitor, dock, phone, printer', tone: 'blue' },
  { id: 'software', label: 'Software', hint: 'Installs, licences, app errors', tone: 'violet' },
  { id: 'access', label: 'Access & accounts', hint: 'Sign-in, passkeys, permissions', tone: 'amber' },
  { id: 'network', label: 'Network & VPN', hint: 'VPN, Wi-Fi, internal sites', tone: 'cyan' },
  { id: 'email', label: 'Email & calendar', hint: 'Mail sync, invites, shared inboxes', tone: 'teal' },
  { id: 'security', label: 'Security incident', hint: 'Phishing, lost device, suspicious sign-in', tone: 'rose' },
  { id: 'other', label: 'Something else', hint: 'Anything that does not fit above', tone: 'slate' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<TicketCategory, string>;
export const CATEGORY_TONE = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.tone])) as Record<TicketCategory, string>;

export const STATUS_ORDER: TicketStatus[] = ['new', 'triaged', 'in_progress', 'waiting', 'resolved'];
export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  in_progress: 'In progress',
  waiting: 'Waiting on you',
  resolved: 'Resolved',
};
/** Agent-facing wording (the requester sees "Waiting on you"). */
export const STATUS_LABEL_AGENT: Record<TicketStatus, string> = { ...STATUS_LABEL, waiting: 'Waiting on user' };
export const STATUS_TONE: Record<TicketStatus, string> = {
  new: 'cyan',
  triaged: 'indigo',
  in_progress: 'blue',
  waiting: 'amber',
  resolved: 'emerald',
};

export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const PRIORITY_LABEL: Record<Priority, string> = { P1: 'Critical', P2: 'High', P3: 'Normal', P4: 'Low' };
export const PRIORITY_TONE: Record<Priority, string> = { P1: 'rose', P2: 'orange', P3: 'blue', P4: 'slate' };
export const PRIORITY_COLOR: Record<Priority, string> = { P1: '#fb7185', P2: '#fb923c', P3: '#60a5fa', P4: '#94a3b8' };

export const IMPACTS: { id: Impact; label: string; hint: string }[] = [
  { id: 'me', label: 'Just me', hint: 'Only my work is affected' },
  { id: 'team', label: 'My team', hint: 'Several colleagues are affected' },
  { id: 'company', label: 'Company', hint: 'An office or everyone is affected' },
];
export const URGENCIES: { id: Urgency; label: string; hint: string }[] = [
  { id: 'low', label: 'Can work around it', hint: 'Annoying, not blocking' },
  { id: 'normal', label: 'Slowing me down', hint: 'Work is harder than it should be' },
  { id: 'high', label: "Can't work", hint: 'I am blocked right now' },
];

export const RESOLUTION_LABEL: Record<ResolutionCode, string> = {
  fixed: 'Fixed',
  self_service: 'Self-service (Nova)',
  replaced: 'Hardware replaced',
  workaround: 'Workaround provided',
  duplicate: 'Duplicate',
  no_fault: 'No fault found',
  escalated: 'Escalated & closed',
};

export const KIND_LABEL: Record<DeviceKind, string> = {
  laptop: 'Laptop',
  desktop: 'Desktop',
  monitor: 'Monitor',
  phone: 'Phone',
  tablet: 'Tablet',
  'security-key': 'Security key',
  headset: 'Headset',
  dock: 'Dock',
  keyboard: 'Keyboard',
};
export const DEVICE_KINDS = Object.keys(KIND_LABEL) as DeviceKind[];
/** Kinds enrolled in MDM (compliance, telemetry, health checks). */
export const MANAGED_KINDS: DeviceKind[] = ['laptop', 'desktop', 'phone', 'tablet'];
export const isManagedKind = (k: DeviceKind) => MANAGED_KINDS.includes(k);

export const DEVICE_STATUSES: DeviceStatus[] = ['in_use', 'loaner', 'in_stock', 'in_repair', 'lost', 'retired'];
export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  in_use: 'In use',
  in_stock: 'In stock',
  loaner: 'Loaner',
  in_repair: 'In repair',
  retired: 'Retired',
  lost: 'Lost',
};
export const DEVICE_STATUS_TONE: Record<DeviceStatus, string> = {
  in_use: 'emerald',
  in_stock: 'cyan',
  loaner: 'amber',
  in_repair: 'violet',
  retired: 'slate',
  lost: 'rose',
};
export const DEVICE_STATUS_COLOR: Record<DeviceStatus, string> = {
  in_use: '#34d399',
  in_stock: '#22d3ee',
  loaner: '#fbbf24',
  in_repair: '#a78bfa',
  retired: '#94a3b8',
  lost: '#fb7185',
};

export const OFFICES: Office[] = ['Dubai', 'London', 'Singapore', 'Berlin', 'New York', 'Toronto', 'Remote'];

/** Hub user location → helpdesk office (satellite cities are "Remote"). */
export function officeOf(location: string | undefined): Office {
  const l = (location ?? '').toLowerCase();
  for (const o of OFFICES) if (o !== 'Remote' && l.includes(o.toLowerCase())) return o;
  return 'Remote';
}

export const MDM_LABEL: Record<MdmAction, string> = {
  sync: 'Sync',
  lock: 'Lock',
  unlock: 'Unlock',
  wipe: 'Wipe',
  rotate_key: 'Rotate recovery key',
  push_update: 'Push OS update',
};

export const CATALOG_KIND_LABEL: Record<CatalogKind, string> = { hardware: 'Hardware', software: 'Software', access: 'Access' };

export const APPROVAL_ROLE_LABEL: Record<ApprovalRole, string> = { manager: 'Manager', it: 'IT', security: 'Security' };

export const SERVICE_HEALTH_LABEL: Record<ServiceHealth, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial: 'Partial outage',
  outage: 'Major outage',
  maintenance: 'Maintenance',
};
export const SERVICE_HEALTH_TONE: Record<ServiceHealth, string> = {
  operational: 'emerald',
  degraded: 'amber',
  partial: 'orange',
  outage: 'rose',
  maintenance: 'blue',
};

export const INCIDENT_STATUSES: IncidentStatus[] = ['investigating', 'identified', 'monitoring', 'resolved'];
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};
export const SEVERITY_LABEL: Record<IncidentSeverity, string> = { minor: 'Minor', major: 'Major', critical: 'Critical' };
export const SEVERITY_TONE: Record<IncidentSeverity, string> = { minor: 'amber', major: 'orange', critical: 'rose' };

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const formatMoney = (n: number) => (n === 0 ? 'Free' : `$${n.toLocaleString('en-US')}`);
