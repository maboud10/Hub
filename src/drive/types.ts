/**
 * Helix Drive domain model — shared drives (team/company/personal), a folder
 * tree with inherited role-based permissions, sensitivity labels with DLP
 * rules, link sharing, access requests, versions, comments, retention and an
 * activity trail.
 */
import type { Department } from '@/types';

export type DriveKind = 'personal' | 'team' | 'company';
export type ItemKind = 'folder' | 'doc' | 'sheet' | 'slides' | 'pdf' | 'image' | 'video' | 'archive' | 'code' | 'markdown' | 'other';
/** Google-Drive-style roles. `manager` = full control incl. sharing & deletion. */
export type DriveRole = 'manager' | 'editor' | 'commenter' | 'viewer';
export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type LinkAccess = 'restricted' | 'company' | 'anyone';
export type RetentionPolicy = 'none' | '1y' | '7y' | 'legal_hold';

/** Who a share applies to. Roles/departments/permissions make access truly role-based. */
export type Principal =
  | { type: 'user'; id: string }
  | { type: 'role'; id: string }
  | { type: 'department'; id: Department }
  | { type: 'permission'; id: string }
  | { type: 'company' };

export interface DriveShare {
  id: string;
  principal: Principal;
  role: DriveRole;
  grantedBy: string;
  at: number;
  /** Time-boxed shares expire automatically. */
  expiresAt?: number;
  note?: string;
}

export interface SharedDrive {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  kind: DriveKind;
  /** Personal drives belong to one person. */
  ownerId?: string;
  department?: Department;
  /** Drive managers can change membership and settings. */
  managerIds: string[];
  /** Drive-level membership — inherited by every item unless inheritance is turned off. */
  access: DriveShare[];
  quotaBytes: number;
  defaultSensitivity: Sensitivity;
  /** Minimum clearance to even see the drive in the sidebar. */
  minClearance?: number;
  createdAt: number;
}

export interface FileVersion {
  id: string;
  version: number;
  at: number;
  by: string;
  sizeBytes: number;
  note?: string;
}

export interface FileComment {
  id: string;
  authorId: string;
  body: string;
  at: number;
  resolved: boolean;
}

export interface ItemActivity {
  id: string;
  at: number;
  actorId: string;
  action: string;
  detail?: string;
}

export interface FilePreview {
  type: 'markdown' | 'table' | 'slides' | 'image' | 'code' | 'none';
  /** Markdown / code body. */
  content?: string;
  /** Sheet rows (first row = header). */
  rows?: string[][];
  /** Slide titles. */
  slides?: string[];
  /** Image gradient stops (demo images are generated). */
  gradient?: [string, string];
  language?: string;
}

export interface DriveItem {
  id: string;
  driveId: string;
  parentId: string | null;
  kind: ItemKind;
  name: string;
  sizeBytes: number;
  ownerId: string;
  createdAt: number;
  modifiedAt: number;
  modifiedBy: string;
  sensitivity: Sensitivity;
  /** When false, the item stops inheriting shares from its parent/drive. */
  inheritPermissions: boolean;
  shares: DriveShare[];
  linkAccess: LinkAccess;
  linkRole: Exclude<DriveRole, 'manager'>;
  starredBy: string[];
  trashed: boolean;
  trashedAt?: number;
  trashedBy?: string;
  tags: string[];
  description?: string;
  preview: FilePreview;
  versions: FileVersion[];
  comments: FileComment[];
  activity: ItemActivity[];
  locked?: boolean;
  retention: RetentionPolicy;
  views: number;
  /** Opened-by counters power "suggested for you". */
  openedBy: Record<string, number>;
}

export interface DriveAccessRequest {
  id: string;
  itemId: string;
  requesterId: string;
  role: Exclude<DriveRole, 'manager'>;
  message: string;
  status: 'pending' | 'approved' | 'denied';
  decidedBy?: string;
  decidedAt?: number;
  createdAt: number;
}

export interface DriveData {
  version: number;
  drives: SharedDrive[];
  items: DriveItem[];
  requests: DriveAccessRequest[];
  /** userId -> recent opens */
  recents: Record<string, { itemId: string; at: number }[]>;
}
