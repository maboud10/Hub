/**
 * App Bridge — the ONLY coupling surface between NEXUS core and the workspace
 * apps (Projects, Drive, Pulse Chat, IT Helpdesk, Performance & OKRs), and
 * between those apps.
 *
 * Each app ships `src/<app>/public.tsx` exporting `export const api: <App>Bridge`.
 * Callers ALWAYS go through `loadBridge('<app>')` (a dynamic import) so that:
 *  - app stores stay out of the main bundle,
 *  - a broken app module can never take down the shell or another app,
 *  - apps never import each other's internals.
 *
 * Every mutating bridge call must re-check the viewer's permissions exactly like
 * the app's own UI would (the bridge is an API boundary, not a back door).
 */
import type { ReactNode } from 'react';
import type { Role, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions } from '@/lib/rbac';

export type WorkspaceAppId =
  | 'projects'
  | 'drive'
  | 'chat'
  | 'helpdesk'
  | 'performance'
  | 'procurement'
  | 'crm'
  | 'insights'
  | 'meet'
  | 'calendar'
  | 'mail'
  | 'wellbeing'
  | 'devhub'
  | 'cloud'
  | 'incidents'
  | 'vault'
  | 'security'
  | 'spaces';

/** The signed-in person on whose behalf a bridge call runs. */
export interface BridgeViewer {
  user: User;
  roles: Role[];
  perms: ReadonlySet<string>;
}

export type BridgeResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Command palette entry contributed by an app. */
export interface PaletteEntry {
  /** Globally unique; prefix with the app id, e.g. `projects:task:t-p1`. */
  id: string;
  /** `Actions` = verbs ("Raise a ticket"); `Work` = searchable objects (tasks, files, channels…). */
  group: 'Actions' | 'Work';
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Optional background tint for the glyph square (e.g. a project colour). */
  glyphColor?: string;
  keywords?: string[];
  /** Right-aligned verb, e.g. "Open". */
  hint?: string;
  /** In-app route to navigate to. */
  to: string;
}

export interface AppPublicApi {
  appId: WorkspaceAppId;
  /** Actions + objects the viewer is allowed to see. Must be cheap (read store state synchronously). */
  paletteEntries(viewer: BridgeViewer): PaletteEntry[];
  /** Settings → Demo data → Reset: restore the app's seed data. */
  resetDemo(): void;
}

/** A link back to where something came from ("from Pulse Chat · #design-crit"). */
export interface BridgeSource {
  app: WorkspaceAppId | 'hub';
  label: string;
  to: string;
}

/* ---------- Projects ---------- */
export interface BridgeProject {
  id: string;
  name: string;
  /** Emoji or short glyph. */
  icon: string;
  color: string;
  to: string;
  /** Share of tasks completed, 0..1. */
  progress: number;
  /** on-track | at-risk | off-track | on-hold | complete */
  status: string;
  ownerId: string;
  /** Performance & OKRs key results this project contributes to (ids from the Performance app). */
  keyResultIds: string[];
  /** Whether the viewer may add tasks. */
  canEdit: boolean;
}
/** A unit of finished work, used as review evidence by Performance & OKRs. */
export interface BridgeWorkItem {
  id: string;
  title: string;
  projectName?: string;
  completedAt: number;
  to: string;
}
export interface NewTaskFromApp {
  title: string;
  notes?: string;
  /** Omit to create a personal task (My Tasks, no project). */
  projectId?: string;
  /** Defaults to the viewer. */
  assigneeId?: string;
  /** ISO date `yyyy-mm-dd`. */
  dueDate?: string;
  source?: BridgeSource;
}
export interface ProjectsBridge extends AppPublicApi {
  appId: 'projects';
  /** Projects the viewer can see (`writableOnly`: only those they can add tasks to). */
  listProjects(viewer: BridgeViewer, opts?: { writableOnly?: boolean }): BridgeProject[];
  createTask(viewer: BridgeViewer, input: NewTaskFromApp): BridgeResult<{ taskId: string; to: string }>;
  /** Tasks assigned to `userId` and completed since `sinceTs`, limited to what the viewer can see. */
  completedWork(viewer: BridgeViewer, userId: string, sinceTs: number): BridgeWorkItem[];
}

/* ---------- Drive ---------- */
export interface BridgeFile {
  id: string;
  name: string;
  /** doc | sheet | slides | pdf | image | video | code | archive | folder | other … */
  kind: string;
  to: string;
  ownerId: string;
  updatedAt: number;
  /** public | internal | confidential | restricted */
  sensitivity: string;
  size?: number;
}
export interface DriveBridge extends AppPublicApi {
  appId: 'drive';
  /** Files (not folders) the viewer can open, best matches first. Empty query = recent. */
  searchFiles(viewer: BridgeViewer, query: string, limit?: number): BridgeFile[];
  getFile(viewer: BridgeViewer, id: string): BridgeFile | null;
}

/* ---------- Pulse Chat ---------- */
export interface BridgeChannel {
  id: string;
  name: string;
  kind: 'channel' | 'dm' | 'group';
  to: string;
}
/** Rich app card rendered inside a chat message. */
export interface BridgeCard {
  app: WorkspaceAppId;
  title: string;
  subtitle?: string;
  to: string;
  /** Short status label, e.g. "Done", "Resolved", "Shared". */
  status?: string;
}
export interface ChatBridge extends AppPublicApi {
  appId: 'chat';
  /** Channels/DMs the viewer is a member of (or can read). */
  listChannels(viewer: BridgeViewer): BridgeChannel[];
  /** Post into a channel the viewer can write to. `asBot` posts as the app's integration bot. */
  postToChannel(viewer: BridgeViewer, input: { channelId: string; text: string; card?: BridgeCard; asBot?: boolean }): BridgeResult<{ messageId: string; to: string }>;
  /** Direct message a user (creates the DM if needed). */
  sendDirect(viewer: BridgeViewer, input: { toUserId: string; text: string; card?: BridgeCard; asBot?: boolean }): BridgeResult<{ messageId: string; to: string }>;
  /** Route to the 1:1 DM between the viewer and `userId` (created lazily on open). */
  dmRoute(viewer: BridgeViewer, userId: string): string;
}

/* ---------- IT Helpdesk ---------- */
export interface BridgeDevice {
  assetTag: string;
  name: string;
  /** laptop | desktop | monitor | phone | tablet | security-key | peripheral … */
  kind: string;
  /** 0..100 health score */
  health: number;
  to: string;
}
export interface NewTicketFromApp {
  subject: string;
  description?: string;
  /** Free-form; the helpdesk maps it to its own categories. */
  category?: string;
  priority?: 'P1' | 'P2' | 'P3' | 'P4';
  source?: BridgeSource;
}
export interface HelpdeskBridge extends AppPublicApi {
  appId: 'helpdesk';
  /** Devices assigned to `userId` (viewer must be that user or an IT admin). */
  listDevicesFor(viewer: BridgeViewer, userId: string): BridgeDevice[];
  createTicket(viewer: BridgeViewer, input: NewTicketFromApp): BridgeResult<{ ticketId: string; to: string }>;
}

/* ---------- Performance & OKRs ---------- */
export interface BridgeKeyResult {
  id: string;
  title: string;
  objectiveId: string;
  objectiveTitle: string;
  ownerId: string;
  /** 0..1 */
  progress: number;
  /** on-track | at-risk | off-track | done */
  status: string;
  /** e.g. "Q4 2026" */
  period: string;
  to: string;
}
export interface PerformanceBridge extends AppPublicApi {
  appId: 'performance';
  /** Key results the viewer can see — used to link projects/work to OKRs. */
  listKeyResults(viewer: BridgeViewer, opts?: { ownerId?: string; query?: string }): BridgeKeyResult[];
  /** Pin a piece of evidence (shipped work, resolved incident, praise…) to someone's performance timeline. */
  addEvidence(viewer: BridgeViewer, input: { userId: string; title: string; detail?: string; source: BridgeSource; keyResultId?: string }): BridgeResult<{ id: string }>;
}

/* ---------- Mail ---------- */
export interface MailRhythm {
  /** Emails the viewer sent outside their working/quiet hours in the last 7 days. */
  afterHoursSentThisWeek: number;
  /** Unread threads in the viewer's Priority + Approvals streams. */
  unread: number;
  /** Median minutes the viewer takes to reply this week. */
  avgReplyMins: number;
}
export interface NewMailFromApp {
  /** Hub user ids or raw email addresses. */
  to: string[];
  subject: string;
  body?: string;
  source?: BridgeSource;
}
export interface MailBridge extends AppPublicApi {
  appId: 'mail';
  /** Inbox load + after-hours sending signals (consumed by Wellbeing · Rhythm). */
  rhythm(viewer: BridgeViewer): MailRhythm;
  /** Send an email as the viewer (lands in Sent; hub recipients get it in their Nova Inbox). */
  sendMail(viewer: BridgeViewer, input: NewMailFromApp): BridgeResult<{ threadId: string; to: string }>;
}

/* ---------- Wellbeing ---------- */
export interface QuietHours {
  enabled: boolean;
  /** Local 24h clock hour quiet time starts (e.g. 19 → 19:00). */
  startHour: number;
  /** Local 24h clock hour quiet time ends (e.g. 8 → 08:00). */
  endHour: number;
}
export interface WellbeingBridge extends AppPublicApi {
  appId: 'wellbeing';
  /** The viewer's right-to-disconnect window (Mail schedule-send, notifications respect it). */
  quietHours(viewer: BridgeViewer): QuietHours;
  /** The viewer's private Recharge score 0..100 (null when they haven't checked in). Only ever for the viewer themself. */
  rechargeScore(viewer: BridgeViewer): number | null;
}

/* ---------- DevHub ---------- */
export interface BridgeDeploy {
  id: string;
  /** Service / app deployed, e.g. `mail-api`, `hub-web`, `payments-svc`. */
  service: string;
  /** Release tag or short sha, e.g. `v2.41.0` / `9f3c2ab`. */
  version: string;
  env: 'production' | 'staging' | 'preview';
  status: 'success' | 'failed' | 'in_progress' | 'rolled_back';
  authorId: string;
  /** Epoch ms. */
  at: number;
  to: string;
}
export interface BridgeReview {
  id: string;
  title: string;
  repo: string;
  authorId: string;
  to: string;
}
export interface DevHubBridge extends AppPublicApi {
  appId: 'devhub';
  /** Most recent deploys (optionally for one service), newest first. */
  recentDeploys(viewer: BridgeViewer, opts?: { service?: string; limit?: number }): BridgeDeploy[];
  /** Freeze / unfreeze production deploys (Incident Command does this during SEV1/SEV2). */
  setDeployFreeze(viewer: BridgeViewer, input: { frozen: boolean; reason: string; source?: BridgeSource }): BridgeResult<{ frozen: boolean }>;
  /** Pull requests waiting on the viewer's review. */
  reviewQueue(viewer: BridgeViewer): BridgeReview[];
}

/* ---------- Cloud Console ---------- */
export interface BridgeServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  region: string;
  /** p95 latency in ms. */
  latencyMs: number;
  /** 0..1 */
  errorRate: number;
  to: string;
}
export interface BridgeCloudSpend {
  mtdUsd: number;
  forecastUsd: number;
  budgetUsd: number;
  /** Open cost anomalies. */
  anomalies: number;
}
export interface CloudBridge extends AppPublicApi {
  appId: 'cloud';
  serviceHealth(viewer: BridgeViewer): BridgeServiceHealth[];
  spend(viewer: BridgeViewer): BridgeCloudSpend;
}

/* ---------- Incident Command ---------- */
export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
export interface BridgeIncident {
  id: string;
  /** e.g. `INC-2041`. */
  code: string;
  title: string;
  severity: IncidentSeverity;
  status: 'triggered' | 'acknowledged' | 'mitigating' | 'monitoring' | 'resolved';
  services: string[];
  commanderId?: string;
  startedAt: number;
  to: string;
}
export interface IncidentsBridge extends AppPublicApi {
  appId: 'incidents';
  /** Open incidents, most severe first. */
  listActive(viewer: BridgeViewer): BridgeIncident[];
  /** Declare an incident (pages the on-call rotation for the services). */
  declare(viewer: BridgeViewer, input: { title: string; severity: IncidentSeverity; services?: string[]; summary?: string; source?: BridgeSource }): BridgeResult<{ incidentId: string; to: string }>;
  /** Who is on call right now, per rotation. */
  onCallNow(viewer: BridgeViewer): { rotation: string; userId: string; until: number }[];
  /** Pager load for a person over the last 7 days (Wellbeing uses it for on-call fatigue). */
  pageLoad(viewer: BridgeViewer, userId: string): { pagesThisWeek: number; nightPages: number };
}

/* ---------- Vault ---------- */
export interface BridgeVaultHygiene {
  /** 0..100 */
  score: number;
  expiringSoon: number;
  stale: number;
  exposed: number;
  weak: number;
}
export interface VaultBridge extends AppPublicApi {
  appId: 'vault';
  /** Credential hygiene for the viewer (org-wide for security admins). */
  hygiene(viewer: BridgeViewer): BridgeVaultHygiene;
  /** Request just-in-time, time-boxed access to a secret or vault (approval flow + lease). */
  requestAccess(viewer: BridgeViewer, input: { resource: string; reason: string; durationMins: number; source?: BridgeSource }): BridgeResult<{ requestId: string; to: string }>;
}

/* ---------- Security Center ---------- */
export type SecuritySignalKind = 'phishing' | 'secret_exposure' | 'suspicious_login' | 'malware' | 'data_leak' | 'misconfiguration' | 'vulnerability' | 'other';
export interface SecurityBridge extends AppPublicApi {
  appId: 'security';
  /** Org posture 0..100 for SOC viewers; the viewer's personal security score otherwise. */
  postureScore(viewer: BridgeViewer): number;
  /** Raise a security signal into the SOC queue (phish report, leaked secret, misconfiguration…). */
  reportSignal(
    viewer: BridgeViewer,
    input: { kind: SecuritySignalKind; title: string; detail?: string; severity?: 'low' | 'medium' | 'high' | 'critical'; source?: BridgeSource },
  ): BridgeResult<{ caseId: string; to: string }>;
}

/* ---------- Spaces ---------- */
export interface BridgePresence {
  userId: string;
  /** Office / hub, e.g. `Dubai`, `London`, `Singapore`, `New York`. */
  site: string;
  zone?: string;
  desk?: string;
}
export interface SpacesBridge extends AppPublicApi {
  appId: 'spaces';
  /** Who's in which office today (only people sharing presence). */
  presenceToday(viewer: BridgeViewer): BridgePresence[];
  /** Book a desk for the viewer (`dayOffset` from today; optionally near a colleague). */
  bookDesk(viewer: BridgeViewer, input: { dayOffset: number; site?: string; nearUserId?: string; source?: BridgeSource }): BridgeResult<{ bookingId: string; desk: string; to: string }>;
  /** Register a visitor hosted by the viewer (badge, Wi-Fi pass, host notifications). */
  registerVisitor(
    viewer: BridgeViewer,
    input: { name: string; company?: string; email?: string; dayOffset: number; hour: number; site?: string; purpose?: string; source?: BridgeSource },
  ): BridgeResult<{ visitorId: string; to: string }>;
}

export interface BridgeMap {
  projects: ProjectsBridge;
  drive: DriveBridge;
  chat: ChatBridge;
  helpdesk: HelpdeskBridge;
  performance: PerformanceBridge;
  procurement: AppPublicApi;
  crm: AppPublicApi;
  insights: AppPublicApi;
  meet: AppPublicApi;
  calendar: AppPublicApi;
  mail: MailBridge;
  wellbeing: WellbeingBridge;
  devhub: DevHubBridge;
  cloud: CloudBridge;
  incidents: IncidentsBridge;
  vault: VaultBridge;
  security: SecurityBridge;
  spaces: SpacesBridge;
}

const loaders: { [K in WorkspaceAppId]: () => Promise<BridgeMap[K]> } = {
  projects: () => import('@/projects/public').then((m) => m.api),
  drive: () => import('@/drive/public').then((m) => m.api),
  chat: () => import('@/chat/public').then((m) => m.api),
  helpdesk: () => import('@/helpdesk/public').then((m) => m.api),
  performance: () => import('@/performance/public').then((m) => m.api),
  procurement: () => import('@/procurement/public').then((m) => m.api),
  crm: () => import('@/crm/public').then((m) => m.api),
  insights: () => import('@/insights/public').then((m) => m.api),
  meet: () => import('@/meet/public').then((m) => m.api),
  calendar: () => import('@/calendar/public').then((m) => m.api),
  mail: () => import('@/mail/public').then((m) => m.api),
  wellbeing: () => import('@/wellbeing/public').then((m) => m.api),
  devhub: () => import('@/devhub/public').then((m) => m.api),
  cloud: () => import('@/cloud/public').then((m) => m.api),
  incidents: () => import('@/incidents/public').then((m) => m.api),
  vault: () => import('@/vault/public').then((m) => m.api),
  security: () => import('@/security/public').then((m) => m.api),
  spaces: () => import('@/spaces/public').then((m) => m.api),
};

/** Lazily load a workspace app's public API. */
export function loadBridge<K extends WorkspaceAppId>(app: K): Promise<BridgeMap[K]> {
  return loaders[app]();
}

/** Load every app API that is currently healthy (failures are skipped, never thrown). */
export async function loadAllBridges(): Promise<AppPublicApi[]> {
  const ids = Object.keys(loaders) as WorkspaceAppId[];
  const settled = await Promise.allSettled(ids.map((k) => loaders[k]()));
  return settled.flatMap((s) => (s.status === 'fulfilled' && s.value ? [s.value as AppPublicApi] : []));
}

/** Snapshot of the signed-in viewer (outside React). Returns null when signed out. */
export function currentViewer(): BridgeViewer | null {
  const s = useHub.getState();
  const user = s.users.find((u) => u.id === s.sessionUserId);
  if (!user) return null;
  return { user, roles: s.roles, perms: effectivePermissions(user, s.roles) };
}
