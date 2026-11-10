/**
 * IT Helpdesk domain model — "Support Deck & Fleet Command".
 *
 * Tickets, devices, catalog requests, service status, guides and the
 * self-service (Nova) playbook runs all live in one persisted store
 * (`src/helpdesk/store.ts`). Pure logic lives in sibling modules:
 * `sla.ts`, `triage.ts`, `playbooks.ts`, `eligibility.ts`, `fleet.ts`, `qr.ts`.
 */
import type { BridgeSource } from '@/lib/appBridge';
import type { Department } from '@/types';

/* ---------------------------------------------------------------- Tickets */

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Impact = 'me' | 'team' | 'company';
export type Urgency = 'low' | 'normal' | 'high';
export type TicketCategory = 'hardware' | 'software' | 'access' | 'network' | 'email' | 'security' | 'other';
/** Kanban lanes: New → Triaged → In progress → Waiting on user → Resolved. */
export type TicketStatus = 'new' | 'triaged' | 'in_progress' | 'waiting' | 'resolved';
export type ResolutionCode = 'fixed' | 'self_service' | 'replaced' | 'workaround' | 'duplicate' | 'no_fault' | 'escalated';

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Small data-URL preview for images (downscaled before storing). */
  preview?: string;
}

export type TicketEventKind =
  | 'created'
  | 'reply'
  | 'note'
  | 'status'
  | 'assign'
  | 'priority'
  | 'category'
  | 'device'
  | 'automation'
  | 'csat'
  | 'escalation';

export interface TicketEvent {
  id: string;
  at: number;
  kind: TicketEventKind;
  /** Hub user id; undefined for automation (Nova / MDM / system). */
  actorId?: string;
  body?: string;
  from?: string;
  to?: string;
  attachments?: Attachment[];
  macroId?: string;
}

export interface Csat {
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  at: number;
}

export interface Ticket {
  /** Human key, also the route id, e.g. `HX-1042`. */
  id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  impact: Impact;
  urgency: Urgency;
  status: TicketStatus;
  requesterId: string;
  assigneeId?: string;
  deviceTag?: string;
  createdAt: number;
  updatedAt: number;
  firstResponseAt?: number;
  resolvedAt?: number;
  /** Set while the ticket waits on the requester (resolution SLA clock paused). */
  pausedAt?: number;
  /** Accumulated paused time (ms). */
  pausedMs: number;
  resolution?: { code: ResolutionCode; note?: string };
  csat?: Csat;
  events: TicketEvent[];
  source?: BridgeSource;
  escalated?: boolean;
  selfService?: { playbookId: PlaybookId; outcome: FixOutcome };
  requestId?: string;
  incidentId?: string;
  /** A simulated service-desk agent will pick this up shortly. */
  sim?: 'pickup';
}

export interface Macro {
  id: string;
  name: string;
  /** Supports `{{first}}` (requester first name) and `{{agent}}`. */
  body: string;
  status?: TicketStatus;
}

/* ---------------------------------------------------------------- Devices */

export type DeviceKind = 'laptop' | 'desktop' | 'monitor' | 'phone' | 'tablet' | 'security-key' | 'headset' | 'dock' | 'keyboard';
export type DeviceStatus = 'in_use' | 'in_stock' | 'loaner' | 'in_repair' | 'retired' | 'lost';
export type Office = 'Dubai' | 'London' | 'Singapore' | 'Berlin' | 'New York' | 'Toronto' | 'Remote';

export interface Compliance {
  encrypted: boolean;
  firewall: boolean;
  osCurrent: boolean;
}

export interface Posture {
  vpnClient: 'current' | 'outdated';
  /** Device-trust / SSO certificate expiry. */
  ssoExpiresAt: number;
  /** 802.1X Wi-Fi certificate expiry. */
  wifiCertExpiresAt: number;
}

export interface Telemetry {
  /** Battery health % — weekly samples, oldest first. */
  battery: number[];
  /** Storage used % — weekly samples, oldest first. */
  storage: number[];
  /** CPU temperature °C — hourly samples (last 24h), oldest first. */
  cpuTemp: number[];
  batteryCycles?: number;
  storageGb: number;
}

export type CustodyKind =
  | 'purchased'
  | 'registered'
  | 'assigned'
  | 'unassigned'
  | 'loaned'
  | 'returned'
  | 'repair'
  | 'repaired'
  | 'retired'
  | 'lost'
  | 'found'
  | 'return_scheduled'
  | 'fulfilled';

export interface CustodyEvent {
  id: string;
  at: number;
  kind: CustodyKind;
  userId?: string;
  actorId?: string;
  note?: string;
}

export type MdmAction = 'sync' | 'lock' | 'unlock' | 'wipe' | 'rotate_key' | 'push_update';
export type MdmState = 'queued' | 'sent' | 'acknowledged' | 'completed' | 'failed';

export interface MdmCommand {
  id: string;
  action: MdmAction;
  state: MdmState;
  actorId: string;
  createdAt: number;
  updatedAt: number;
  log: { at: number; line: string }[];
}

export interface Device {
  /** Primary key, e.g. `HX-MBP-0142`. */
  assetTag: string;
  kind: DeviceKind;
  manufacturer: string;
  model: string;
  serial: string;
  status: DeviceStatus;
  assigneeId?: string;
  office: Office;
  /** Tag ids (see `DeviceTag`). */
  tags: string[];
  purchasedAt: number;
  warrantyEnd: number;
  cost: number;
  os?: string;
  osTarget?: string;
  specs?: string;
  /** Managed (MDM-enrolled) devices only. */
  compliance?: Compliance;
  posture?: Posture;
  telemetry?: Telemetry;
  /** Peripherals: firmware up to date. */
  firmwareCurrent?: boolean;
  lastCheckIn?: number;
  loan?: { dueAt: number; since: number; note?: string };
  repair?: { vendor: string; since: number; eta?: number; note?: string };
  returnAt?: number;
  recoveryKey?: string;
  locked?: boolean;
  mdm: MdmCommand[];
  custody: CustodyEvent[];
  notes?: string;
}

export interface DeviceTag {
  id: string;
  /** Without the leading `#`, e.g. `eng-heavy`. */
  name: string;
  color: string;
  description: string;
  createdAt: number;
}

export interface FleetFilter {
  q?: string;
  status?: DeviceStatus[];
  kind?: DeviceKind[];
  office?: Office[];
  tag?: string[];
  compliance?: 'compliant' | 'noncompliant';
  warranty?: 'expiring' | 'expired';
}

export interface SavedView {
  id: string;
  name: string;
  filter: FleetFilter;
  builtin?: boolean;
}

/* ---------------------------------------------------------------- Catalog */

export type CatalogKind = 'hardware' | 'software' | 'access';

export interface CatalogOption {
  id: string;
  label: string;
  choices: string[];
}

export interface CatalogItem {
  id: string;
  kind: CatalogKind;
  name: string;
  vendor: string;
  blurb: string;
  description: string;
  /** Hardware: silhouette to render. */
  deviceKind?: DeviceKind;
  /** Software / access: icon key (see UI icon map). */
  icon?: string;
  accent: string;
  cost: number;
  billing: 'one-time' | 'yearly' | 'free';
  etaDays: number;
  options?: CatalogOption[];
  /** Sensitive access: adds a Security approval step. */
  sensitive?: boolean;
  /** Departments that can request it directly (undefined = everyone). Others need a justification. */
  departments?: Department[];
  /** Strict department list — others are not eligible at all. */
  strictDepartments?: boolean;
  /** Contractors may request it. */
  contractors?: boolean;
  /** Hardware: stock devices whose model starts with this are valid for fulfilment. */
  stockModel?: string;
  popular?: boolean;
}

export type ApprovalRole = 'manager' | 'it' | 'security';
export type StepState = 'waiting' | 'pending' | 'approved' | 'denied' | 'skipped';

export interface ApprovalStep {
  role: ApprovalRole;
  /** Manager step: the requester's manager. */
  approverId?: string;
  state: StepState;
  decidedBy?: string;
  decidedAt?: number;
  note?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'fulfilled' | 'denied' | 'cancelled';

export interface CatalogRequest {
  /** e.g. `REQ-2041` */
  id: string;
  itemId: string;
  requesterId: string;
  options: Record<string, string>;
  justification: string;
  status: RequestStatus;
  steps: ApprovalStep[];
  createdAt: number;
  updatedAt: number;
  fulfilment?: { at: number; by: string; deviceTag?: string; note?: string };
}

/* ---------------------------------------------------------------- Status */

export type ServiceHealth = 'operational' | 'degraded' | 'partial' | 'outage' | 'maintenance';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'minor' | 'major' | 'critical';

export interface Service {
  id: string;
  name: string;
  group: 'Identity' | 'Network' | 'Collaboration' | 'Engineering' | 'Workplace';
  description: string;
  /** Daily uptime % for the last 90 days, oldest first (today is last). */
  uptime: number[];
  office?: Office;
}

export interface IncidentUpdate {
  id: string;
  at: number;
  status: IncidentStatus;
  body: string;
  authorId: string;
}

export interface Incident {
  id: string;
  title: string;
  serviceIds: string[];
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: number;
  resolvedAt?: number;
  /** Offices affected (undefined = everyone). */
  offices?: Office[];
  updates: IncidentUpdate[];
}

export interface Maintenance {
  id: string;
  title: string;
  serviceIds: string[];
  startsAt: number;
  endsAt: number;
  body: string;
}

export interface ItAnnouncement {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'warning' | 'success';
  at: number;
  link?: string;
  linkLabel?: string;
}

/* ---------------------------------------------------------------- Guides */

export interface GuideStep {
  title: string;
  body: string;
  code?: string;
}

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  category: TicketCategory;
  minutes: number;
  playbookId?: PlaybookId;
  keywords: string[];
  steps: GuideStep[];
  updatedAt: number;
  /** Seed baseline votes (live votes are stored per user in `guideVotes`). */
  helpful: number;
  notHelpful: number;
}

/* ---------------------------------------------------------------- Self-service */

export type PlaybookId =
  | 'reset-passkey'
  | 'repair-vpn'
  | 'renew-wifi'
  | 'clear-disk'
  | 'fix-mail'
  | 'add-printer'
  | 'install-software'
  | 'report-phishing'
  | 'fix-display'
  | 'fix-audio'
  | 'speed-up';

export type FixOutcome = 'success' | 'partial' | 'failed';

export interface FixRun {
  id: string;
  playbookId: PlaybookId;
  userId: string;
  deviceTag?: string;
  at: number;
  outcome: FixOutcome;
  summary: string;
  ticketId?: string;
}

/* ---------------------------------------------------------------- Insights */

export interface WeekStat {
  weekStart: number;
  created: number;
  resolved: number;
  /** Share of tickets that met both SLAs, 0..1. */
  slaMet: number;
  /** Median first response in minutes. */
  frtMedianMin: number;
  csat: number;
}

/* ---------------------------------------------------------------- Store data */

export interface HelpdeskData {
  version: number;
  tickets: Ticket[];
  devices: Device[];
  tags: DeviceTag[];
  catalog: CatalogItem[];
  requests: CatalogRequest[];
  services: Service[];
  incidents: Incident[];
  maintenance: Maintenance[];
  announcements: ItAnnouncement[];
  guides: Guide[];
  macros: Macro[];
  history: WeekStat[];
  fixRuns: FixRun[];
  /** slug → userId → vote */
  guideVotes: Record<string, Record<string, 1 | -1>>;
  /** Users subscribed to status updates. */
  statusSubs: string[];
  /** userId → ticketId → last seen timestamp (for unread markers). */
  seen: Record<string, Record<string, number>>;
  /** userId → saved fleet views. */
  fleetViews: Record<string, SavedView[]>;
  /** deviceTag → last health check timestamp. */
  diagRuns: Record<string, number>;
  seq: { ticket: number; request: number; incident: number };
}
