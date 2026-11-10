/**
 * Helix Drive — domain model.
 *
 * Access model ("Holo Vault"):
 *  - Every item lives in a drive (shared or personal) under an optional parent folder.
 *  - Access = owner ∪ drive membership ∪ folder shares (cascade) ∪ item shares ∪ link settings,
 *    minus anything cut by "restrict inherited access" on a folder/file, minus expired grants,
 *    minus whatever the item's sensitivity label (DLP rules) blocks.
 *  - Principals: a person, a hub role, a department, or everyone in the org.
 *  - Levels: viewer < commenter < editor < manager, plus owner.
 */
import type { Department } from '@/types';

export type ItemKind = 'folder' | 'doc' | 'sheet' | 'slides' | 'pdf' | 'image' | 'video' | 'audio' | 'code' | 'text' | 'archive' | 'other';
export type FileKind = Exclude<ItemKind, 'folder'>;

export type Level = 'viewer' | 'commenter' | 'editor' | 'manager';
export type AccessLevel = 'none' | Level | 'owner';
export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type LinkScope = 'restricted' | 'org' | 'anyone';
export type LinkLevel = 'viewer' | 'commenter' | 'editor';

export type Principal = { type: 'user'; id: string } | { type: 'role'; id: string } | { type: 'dept'; id: Department } | { type: 'org' };

export interface Share {
  id: string;
  principal: Principal;
  level: Level;
  by: string;
  at: number;
  /** null = never expires */
  expiresAt: number | null;
}

export interface LinkSetting {
  scope: LinkScope;
  level: LinkLevel;
  by?: string;
  /** When the link was (last) opened up — used by the stale-link risk rule. */
  at?: number;
}

export interface Hold {
  by: string;
  at: number;
  reason: string;
}

export interface Drive {
  id: string;
  kind: 'shared' | 'personal';
  name: string;
  description: string;
  /** Glyph key (see DRIVE_ICONS in the UI). */
  icon: string;
  color: string;
  department?: Department;
  /** Personal drives only. */
  ownerId?: string;
  members: Share[];
  defaultLabel: Sensitivity;
  quota: number;
  createdAt: number;
  createdBy: string;
  hold: Hold | null;
}

export type ArtMotif = 'mesh' | 'orbit' | 'wave' | 'grid' | 'bloom';

export interface Slide {
  title: string;
  body?: string[];
  kind?: 'title' | 'bullets' | 'stat' | 'quote';
  stat?: string;
}

export interface PdfPage {
  heading: string;
  body: string[];
}

export type Content =
  | { type: 'doc'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'sheet'; rows: string[][] }
  | { type: 'slides'; slides: Slide[] }
  | { type: 'pdf'; pages: PdfPage[] }
  | { type: 'image'; src?: string; hue: number; motif: ArtMotif; w: number; h: number }
  | { type: 'media'; duration: number; hue: number; chapters?: string[] }
  | { type: 'archive'; entries: { path: string; size: number }[] };

export interface Version {
  id: string;
  n: number;
  at: number;
  by: string;
  size: number;
  summary: string;
  /** Snapshot for previewable kinds (docs, code, sheets, slides). */
  content?: Content;
}

export interface Comment {
  id: string;
  by: string;
  at: number;
  text: string;
}

export interface Thread extends Comment {
  replies: Comment[];
  resolved: { by: string; at: number } | null;
  /** Optional quoted passage the thread is anchored to. */
  quote?: string;
}

export type Verb =
  | 'created'
  | 'uploaded'
  | 'edited'
  | 'renamed'
  | 'moved'
  | 'shared'
  | 'unshared'
  | 'commented'
  | 'labelled'
  | 'trashed'
  | 'restored'
  | 'version'
  | 'link'
  | 'inheritance'
  | 'approved'
  | 'denied'
  | 'downloaded'
  | 'copied'
  | 'viewed';

export interface Activity {
  id: string;
  at: number;
  by: string;
  verb: Verb;
  detail?: string;
}

export interface Item {
  id: string;
  driveId: string;
  /** null = drive root */
  parentId: string | null;
  kind: ItemKind;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  /** Bytes (folders: 0 — sizes are aggregated on read). */
  size: number;
  mime?: string;
  label: Sensitivity;
  description?: string;
  tags: string[];
  shares: Share[];
  link: LinkSetting;
  /** false = "restrict inherited access" (break inheritance at this node). */
  inherit: boolean;
  starredBy: string[];
  /** Only the top-most trashed node is marked; descendants are hidden with it. */
  trashed: { at: number; by: string } | null;
  hold: Hold | null;
  /** Folder accent colour. */
  color?: string;
  content?: Content;
  versions: Version[];
  threads: Thread[];
  activity: Activity[];
}

export type RequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface AccessRequest {
  id: string;
  itemId: string;
  requesterId: string;
  level: Level;
  reason: string;
  at: number;
  status: RequestStatus;
  decidedBy?: string;
  decidedAt?: number;
  note?: string;
  grantedLevel?: Level;
  expiresAt?: number | null;
}

/** DLP rule set for one sensitivity label. */
export interface LabelRule {
  /** "Anyone with the link" links allowed. */
  anyoneLink: boolean;
  /** "Anyone at Helix with the link" allowed. */
  orgLink: boolean;
  /** Shares to everyone in the org allowed. */
  orgWide: boolean;
  /** Contractors may access. */
  contractors: boolean;
  /** Only named people (no roles, departments, org or links). */
  namedOnly: boolean;
  /** Download / copy / print allowed for non-owners. */
  download: boolean;
  /** Maximum share duration in days (null = unlimited). */
  maxShareDays: number | null;
  /** Watermark previews with the viewer's name + time. */
  watermark: boolean;
}

export interface Policy {
  rules: Record<Sensitivity, LabelRule>;
  /** Days items stay in trash before they are purged. */
  trashDays: number;
  /** Public links older than this are flagged by the risk radar. */
  staleLinkDays: number;
}

export type SortKey = 'name' | 'updated' | 'size' | 'owner';

export interface DrivePrefs {
  view: 'grid' | 'list';
  sort: SortKey;
  dir: 'asc' | 'desc';
  details: boolean;
}

export interface RecentEntry {
  id: string;
  at: number;
}

export interface DriveData {
  version: number;
  drives: Drive[];
  items: Item[];
  requests: AccessRequest[];
  policy: Policy;
  /** Per-person "opened" history (most recent first). */
  recents: Record<string, RecentEntry[]>;
  /** Per-person view preferences. */
  prefs: Record<string, DrivePrefs>;
}

/** Where a new item goes. */
export interface Place {
  driveId: string;
  parentId: string | null;
}
