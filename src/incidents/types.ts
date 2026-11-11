/**
 * Incident Command — "Sentinel" domain types.
 *
 * Incidents with a six-stage lifecycle (Triggered → Acknowledged → Mitigating
 * → Monitoring → Resolved → Postmortem), an auto-captured war-room timeline,
 * deduplicated alert groups, follow-the-sun on-call rotations with swap
 * requests and a pager log (fatigue), Nova-drafted blameless postmortems and
 * a status page whose hub-app components drive the Launchpad health tiles.
 */
import type { BridgeSource, IncidentSeverity } from '@/lib/appBridge';
import type { AppStatus } from '@/types';

export type Severity = IncidentSeverity;
export type IncidentStatus = 'triggered' | 'acknowledged' | 'mitigating' | 'monitoring' | 'resolved';
export type RoleKey = 'commander' | 'comms' | 'ops' | 'scribe';
export type Region = 'me-central-1' | 'eu-west-2' | 'ap-southeast-1' | 'us-east-1';

/* ───────────────────────── incidents ───────────────────────── */

export type TimelineKind = 'alert' | 'deploy' | 'health' | 'status' | 'update' | 'page' | 'action' | 'nova' | 'comms' | 'freeze' | 'role';
/** Where an auto-captured entry came from. */
export type TimelineSource = 'sentinel' | 'devhub' | 'cloud' | 'alerts' | 'human' | 'nova' | 'chat' | 'mail' | 'meet' | 'status';

export interface TimelineEntry {
  id: string;
  at: number;
  kind: TimelineKind;
  source: TimelineSource;
  /** Free text (seeded log lines stay English, like commit messages). */
  text: string;
  /** Hub user id, or undefined for systems. */
  authorId?: string;
  status?: IncidentStatus;
  /** Stable key for auto-captured signals so re-captures never duplicate. */
  key?: string;
  meta?: Record<string, string>;
}

export interface RunbookItem {
  id: string;
  text: string;
  done: boolean;
  doneBy?: string;
  doneAt?: number;
}

export interface PageTarget {
  userId: string;
  rotationId: string;
}

export interface PagingState {
  targets: PageTarget[];
  pagedAt: number;
  /** When the simulated page gets acknowledged (push → ack) if nobody acts sooner. */
  ackDueAt: number;
  ackBy?: string;
  ackAt?: number;
  escalations: number;
}

export interface FreezeLink {
  active: boolean;
  reason: string;
  at: number;
  /** DevHub confirmed the freeze through its bridge. */
  synced: boolean;
  liftedAt?: number;
}

export interface Incident {
  id: string;
  /** `INC-2047` */
  code: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  summary: string;
  services: string[];
  regions: Region[];
  /** Hub app ids degraded on the Launchpad while the incident is open. */
  impactedApps: string[];
  roles: Partial<Record<RoleKey, string>>;
  startedAt: number;
  ackAt?: number;
  mitigatingAt?: number;
  monitoringAt?: number;
  resolvedAt?: number;
  declaredBy: string;
  source?: BridgeSource;
  /** 0..100 customer-impact meter. */
  impact: number;
  impactNote?: string;
  timeline: TimelineEntry[];
  runbook: RunbookItem[];
  paging: PagingState;
  freeze?: FreezeLink;
  bridge?: { meetRoomId: string; startedAt: number };
  chatPosts: number;
  mails: number;
  statusPosts: number;
  lastCommsAt?: number;
  postmortemId?: string;
  /** Short root-cause category for history analytics. */
  cause?: 'deploy' | 'config' | 'capacity' | 'dependency' | 'network' | 'data' | 'certificate';
  resolution?: string;
}

/* ───────────────────────── signals (DevHub / Cloud snapshots) ───────────────────────── */

export interface DeploySignal {
  id: string;
  service: string;
  version: string;
  env: 'production' | 'staging' | 'preview';
  status: 'success' | 'failed' | 'in_progress' | 'rolled_back';
  authorId: string;
  at: number;
  region?: Region;
  to: string;
  /** Came from the live DevHub bridge (vs. Sentinel's own snapshot). */
  live?: boolean;
}

export interface HealthSignal {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  region: string;
  latencyMs: number;
  errorRate: number;
  to: string;
  live?: boolean;
}

/* ───────────────────────── alerts ───────────────────────── */

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';
export type AlertSource = 'cloud' | 'synthetics' | 'apm' | 'devhub' | 'carrier' | 'security';
export type AlertState = 'firing' | 'acknowledged' | 'snoozed' | 'resolved';

export interface AlertEvent {
  id: string;
  at: number;
  service: string;
  region: string;
  source: AlertSource;
  title: string;
  severity: AlertSeverity;
  incidentId?: string;
}

export interface AlertGroupState {
  state: AlertState;
  snoozedUntil?: number;
  ackBy?: string;
  ackAt?: number;
  incidentId?: string;
  escalated?: boolean;
  resolvedAt?: number;
}

export interface AlertGroup {
  fingerprint: string;
  title: string;
  service: string;
  region: string;
  source: AlertSource;
  severity: AlertSeverity;
  count: number;
  count7d: number;
  firstAt: number;
  lastAt: number;
  state: AlertState;
  snoozedUntil?: number;
  ackBy?: string;
  incidentId?: string;
  escalated?: boolean;
  /** Fired often, never led to an incident or an ack. */
  noisy: boolean;
  /** Flaps between firing and recovering. */
  flapping: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  match: { service?: string; severity?: AlertSeverity[]; source?: AlertSource; fingerprint?: string };
  action: 'page' | 'notify' | 'suppress' | 'ticket';
  /** Rotation id for `page`, channel label for `notify`. */
  target?: string;
  enabled: boolean;
  hits7d: number;
  createdBy: string;
  /** Created from a Nova suggestion. */
  nova?: boolean;
}

export interface NoiseSuggestion {
  id: string;
  kind: 'suppress' | 'threshold' | 'group' | 'route';
  fingerprint: string;
  service: string;
  title: string;
  /** Pages per week Nova expects to save. */
  savings: number;
  confidence: number;
  evidence: { label: string; value: string }[];
}

/* ───────────────────────── on-call ───────────────────────── */

export type HubLabel = 'Singapore' | 'Dubai' | 'Berlin–London' | 'Toronto–New York';

export interface Shift {
  id: string;
  hub: HubLabel;
  userId: string;
  /** UTC hour the shift starts (0..23). */
  startUtc: number;
  /** UTC hour the shift ends (1..24). */
  endUtc: number;
  tz: string;
}

export interface Rotation {
  id: string;
  name: string;
  kind: 'follow-the-sun' | 'weekly';
  services: string[];
  shifts?: Shift[];
  members?: string[];
  /** Epoch ms of the week the first member started (weekly). */
  anchor?: number;
  escalationIds: string[];
  color: string;
}

export type SwapState = 'requested' | 'accepted' | 'applied' | 'declined';

export interface Override {
  id: string;
  rotationId: string;
  fromUserId: string;
  toUserId: string;
  start: number;
  end: number;
  reason: string;
  state: SwapState;
  requestedBy: string;
  requestedAt: number;
  acceptedAt?: number;
  appliedAt?: number;
  declinedAt?: number;
  calendarAdded?: boolean;
}

export interface PageRecord {
  id: string;
  userId: string;
  at: number;
  service: string;
  rotationId: string;
  incidentId?: string;
  fingerprint?: string;
  /** Minutes until the page was acknowledged. */
  ackMins: number;
}

export interface OnCallSlot {
  rotationId: string;
  userId: string;
  baseUserId: string;
  from: number;
  until: number;
  shift?: Shift;
  overrideId?: string;
}

export interface Fatigue {
  userId: string;
  pagesThisWeek: number;
  nightPages: number;
  lastNightAt?: number;
  /** 0..100 */
  score: number;
  level: 'ok' | 'elevated' | 'high';
}

/* ───────────────────────── postmortems ───────────────────────── */

export type PostmortemStatus = 'draft' | 'review' | 'published' | 'actions-complete';

export interface ActionItem {
  id: string;
  title: string;
  ownerId: string;
  /** yyyy-mm-dd */
  due: string;
  priority: 'P1' | 'P2' | 'P3';
  done: boolean;
  taskId?: string;
  taskTo?: string;
}

export interface PostmortemSections {
  summary: string;
  impact: string;
  rootCause: string;
  contributing: string[];
  wentWell: string[];
  lessons: string[];
  whys: string[];
}

export interface Postmortem {
  id: string;
  incidentId: string;
  title: string;
  status: PostmortemStatus;
  authorId: string;
  createdAt: number;
  updatedAt: number;
  sections: PostmortemSections;
  actions: ActionItem[];
  reviewerIds: string[];
  novaDrafted: boolean;
  reviewAt?: number;
  reviewEventId?: string;
  publishedAt?: number;
  wikiTo?: string;
}

/* ───────────────────────── status page ───────────────────────── */

export type ComponentStatus = 'operational' | 'degraded' | 'partial' | 'outage' | 'maintenance';
export type StatusPhase = 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'maintenance';

export interface StatusUpdate {
  id: string;
  at: number;
  incidentId?: string;
  phase: StatusPhase;
  title: string;
  body: string;
  componentIds: string[];
  authorId: string;
}

export interface Maintenance {
  id: string;
  title: string;
  componentIds: string[];
  start: number;
  end: number;
  createdBy: string;
  notify: boolean;
  cancelled?: boolean;
}

export interface SubscriberChannel {
  id: 'email' | 'chat' | 'sms' | 'webhook';
  count: number;
}

export interface DayBar {
  dayStart: number;
  status: ComponentStatus;
  /** Weighted minutes of downtime that day. */
  downMins: number;
}

/* ───────────────────────── store data ───────────────────────── */

export interface IncidentsData {
  version: number;
  incidents: Incident[];
  alertEvents: AlertEvent[];
  alertStates: Record<string, AlertGroupState>;
  rules: RoutingRule[];
  dismissedSuggestions: string[];
  rotations: Rotation[];
  overrides: Override[];
  pages: PageRecord[];
  postmortems: Postmortem[];
  updates: StatusUpdate[];
  maintenance: Maintenance[];
  subscribers: SubscriberChannel[];
  /** Manual core-service status (hub apps live in the hub store). */
  serviceStatus: Record<string, Exclude<AppStatus, 'operational'> | undefined>;
  deploys: DeploySignal[];
  health: HealthSignal[];
  /** Hub apps this app put into a non-operational state (restored on resolve / reset). */
  managedApps: string[];
}

export interface NewIncidentInput {
  title: string;
  severity: Severity;
  services?: string[];
  regions?: Region[];
  impactedApps?: string[];
  summary?: string;
  commanderId?: string;
  source?: BridgeSource;
  fromFingerprint?: string;
}
