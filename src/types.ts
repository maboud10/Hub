/**
 * Core domain model for the NEXUS employee hub.
 *
 * Access control model (RBAC + time-boxed grants):
 *  - Every capability is a permission string, e.g. `hub.users.manage` or `app:payroll`.
 *  - Roles bundle permissions. Wildcards are supported: `*` (everything) and `app:*` (all apps).
 *  - Users hold one or more roles plus optional direct grants (usually from approved
 *    access requests). Grants can expire, giving least-privilege, time-boxed access.
 *  - Effective permissions = union(role permissions) ∪ non-expired grants (inactive users get none).
 */

import type { IconName } from './icons';

export type PermissionId = string;

export type PermissionCategory = 'Workspace' | 'People' | 'Talent' | 'Content' | 'Governance' | 'Apps';

export interface PermissionDef {
  id: PermissionId;
  label: string;
  description: string;
  category: PermissionCategory;
  /** Risky permissions are highlighted and require confirmation when granted to a role. */
  sensitive?: boolean;
}

export type Clearance = 1 | 2 | 3 | 4 | 5;

export interface Role {
  id: string;
  name: string;
  description: string;
  clearance: Clearance;
  color: string;
  permissions: PermissionId[];
  /** Built-in roles cannot be deleted. */
  system?: boolean;
  /** Locked roles cannot have their permissions edited (e.g. System Admin = `*`). */
  locked?: boolean;
}

export type Presence = 'online' | 'focus' | 'meeting' | 'away' | 'offline';

export type GrantDuration = '7d' | '30d' | '90d' | 'permanent';

export interface Grant {
  permission: PermissionId;
  grantedBy: string;
  grantedAt: number;
  expiresAt: number | null;
  reason?: string;
}

export type Department =
  | 'Engineering'
  | 'Design'
  | 'Product'
  | 'People Ops'
  | 'Finance'
  | 'Sales'
  | 'Marketing'
  | 'IT & Security'
  | 'Operations'
  | 'Customer Success';

export interface User {
  id: string;
  name: string;
  email: string;
  title: string;
  department: Department;
  location: string;
  timezone: string;
  roleIds: string[];
  grants: Grant[];
  active: boolean;
  presence: Presence;
  statusMessage?: string;
  /** Hue (0-360) used to generate the gradient avatar. */
  avatarHue: number;
  pronouns?: string;
  skills: string[];
  managerId?: string;
  // ---- Sensitive fields (require `hub.people.sensitive`) ----
  phone: string;
  employeeId: string;
  startDate: string; // ISO date
  birthday?: string; // MM-DD
  // ---- Meta ----
  lastActiveAt?: number;
  /** Demo personas are offered on the sign-in screen. */
  persona?: boolean;
  personaBlurb?: string;
}

export type AppCategory =
  | 'Communication'
  | 'Productivity'
  | 'People'
  | 'Finance'
  | 'Growth'
  | 'Engineering'
  | 'Operations'
  | 'Security';

export type AppStatus = 'operational' | 'degraded' | 'maintenance';

export interface QuickAction {
  label: string;
  icon: IconName;
  /** In-app deep link (for apps that run inside NEXUS). */
  route?: string;
}

export interface HubApp {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  icon: IconName;
  gradient: [string, string];
  url: string;
  keywords: string[];
  status: AppStatus;
  badge?: 'new' | 'beta' | null;
  /** Demo unread counter shown on the tile. */
  notifications?: number;
  quickActions?: QuickAction[];
  /** Globally disabled apps are hidden from everyone except app managers. */
  enabled: boolean;
  /** Discoverable apps appear (locked) to users without access so they can request it. */
  discoverable: boolean;
  owner: string;
  addedAt: number;
  custom?: boolean;
  /** Set for modules that run inside NEXUS (e.g. `/talent`); launching navigates in-app. */
  route?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface AccessRequest {
  id: string;
  userId: string;
  appId: string;
  reason: string;
  duration: GrantDuration;
  status: RequestStatus;
  createdAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNote?: string;
  grantedDuration?: GrantDuration;
}

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  id: string;
  at: number;
  actorId: string;
  action: string;
  target: string;
  detail?: string;
  outcome: 'success' | 'denied';
  severity: AuditSeverity;
}

export type AnnouncementPriority = 'normal' | 'important' | 'critical';
export type AnnouncementCategory = 'Company' | 'Product' | 'People' | 'IT' | 'Events';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  authorId: string;
  createdAt: number;
  priority: AnnouncementPriority;
  category: AnnouncementCategory;
  /** Empty array = visible to everyone. Otherwise only to holders of one of these roles. */
  audienceRoleIds: string[];
  pinned: boolean;
  /** emoji -> list of user ids */
  reactions: Record<string, string[]>;
}

export type NotificationKind = 'access' | 'request' | 'announcement' | 'kudos' | 'talent' | 'hr' | 'system';

export interface HubNotification {
  id: string;
  userId: string;
  at: number;
  kind: NotificationKind;
  title: string;
  body?: string;
  read: boolean;
  /** In-app route to open when clicked. */
  link?: string;
}

export type KudosValue = 'teamwork' | 'innovation' | 'customer' | 'ownership' | 'craft';

export interface Kudos {
  id: string;
  fromId: string;
  toId: string;
  value: KudosValue;
  message: string;
  at: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentId = 'cyan' | 'violet' | 'magenta' | 'lime' | 'amber';
export type WidgetId = 'agenda' | 'focus' | 'news' | 'pulse' | 'kudos' | 'status' | 'celebrations';

export interface UserPrefs {
  pinned: string[];
  recents: { appId: string; at: number }[];
  launchCounts: Record<string, number>;
  theme: ThemeMode;
  accent: AccentId;
  density: 'comfortable' | 'compact';
  reducedMotion: boolean;
  ambient: boolean;
  tileView: 'grid' | 'list';
  sidebarCollapsed: boolean;
  widgets: Record<WidgetId, boolean>;
  notifyKinds: Record<NotificationKind, boolean>;
}

export interface PulseVote {
  date: string; // YYYY-MM-DD
  mood: 1 | 2 | 3 | 4 | 5;
}

export interface HubData {
  version: number;
  sessionUserId: string | null;
  users: User[];
  roles: Role[];
  apps: HubApp[];
  requests: AccessRequest[];
  audit: AuditEntry[];
  announcements: Announcement[];
  notifications: HubNotification[];
  kudos: Kudos[];
  prefs: Record<string, UserPrefs>;
  pulse: Record<string, PulseVote>;
}

/** Result type returned by every store action (mimics an API response). */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type AppAccessState = 'granted' | 'locked' | 'pending' | 'disabled';

export interface AppWithAccess {
  app: HubApp;
  access: AppAccessState;
  /** Set when access comes from a time-boxed grant. */
  expiresAt?: number | null;
  pendingRequestId?: string;
}
