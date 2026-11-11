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

export type WorkspaceAppId = 'projects' | 'drive' | 'chat' | 'helpdesk' | 'performance' | 'procurement' | 'crm' | 'insights' | 'meet' | 'calendar';

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
