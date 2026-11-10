/**
 * Constants & tiny pure helpers shared by the engine, store and UI.
 */
import type { AccessLevel, FileKind, ItemKind, Level, LinkScope, Policy, Sensitivity } from './types';

export const DAY = 86_400_000;
export const HOUR = 3_600_000;

export const LEVELS: Level[] = ['viewer', 'commenter', 'editor', 'manager'];
export const RANK: Record<AccessLevel, number> = { none: 0, viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 };
export const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: 'No access',
  viewer: 'Viewer',
  commenter: 'Commenter',
  editor: 'Editor',
  manager: 'Manager',
  owner: 'Owner',
};
export const LEVEL_HINT: Record<Level, string> = {
  viewer: 'Can open and download (if the label allows)',
  commenter: 'Can view and comment',
  editor: 'Can edit, upload versions, move and organize',
  manager: 'Can edit, share and manage access',
};

export const atLeast = (have: AccessLevel, need: AccessLevel) => RANK[have] >= RANK[need];
export const maxLevel = (a: AccessLevel, b: AccessLevel): AccessLevel => (RANK[a] >= RANK[b] ? a : b);

export const LABELS: Sensitivity[] = ['public', 'internal', 'confidential', 'restricted'];
export const LABEL_RANK: Record<Sensitivity, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
export const LABEL_NAME: Record<Sensitivity, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};
export const LABEL_HINT: Record<Sensitivity, string> = {
  public: 'Safe to share outside Helix',
  internal: 'For people at Helix',
  confidential: 'Need-to-know; no public links or contractors',
  restricted: 'Named people only, no download, watermarked',
};
export const LABEL_TONE: Record<Sensitivity, 'emerald' | 'blue' | 'violet' | 'rose'> = {
  public: 'emerald',
  internal: 'blue',
  confidential: 'violet',
  restricted: 'rose',
};

export const LINK_NAME: Record<LinkScope, string> = {
  restricted: 'Restricted',
  org: 'Anyone at Helix',
  anyone: 'Anyone with the link',
};

export const KIND_NAME: Record<ItemKind, string> = {
  folder: 'Folder',
  doc: 'Document',
  sheet: 'Spreadsheet',
  slides: 'Presentation',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  code: 'Code',
  text: 'Text',
  archive: 'Archive',
  other: 'File',
};
export const KIND_SHORT: Record<ItemKind, string> = {
  folder: 'Folder',
  doc: 'Doc',
  sheet: 'Sheet',
  slides: 'Slides',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  code: 'Code',
  text: 'Text',
  archive: 'Archive',
  other: 'File',
};
export const KIND_COLOR: Record<ItemKind, string> = {
  folder: '#fbbf24',
  doc: '#60a5fa',
  sheet: '#34d399',
  slides: '#fb923c',
  pdf: '#fb7185',
  image: '#f472b6',
  video: '#a78bfa',
  audio: '#2dd4bf',
  code: '#22d3ee',
  text: '#94a3b8',
  archive: '#cbd5e1',
  other: '#94a3b8',
};
export const FILE_KINDS: FileKind[] = ['doc', 'sheet', 'slides', 'pdf', 'image', 'video', 'audio', 'code', 'text', 'archive', 'other'];

/** Kinds whose content can be edited in place (save = new version). */
export const EDITABLE_KINDS: ItemKind[] = ['doc', 'code', 'text'];

export function defaultPolicy(): Policy {
  return {
    trashDays: 30,
    staleLinkDays: 90,
    rules: {
      public: { anyoneLink: true, orgLink: true, orgWide: true, contractors: true, namedOnly: false, download: true, maxShareDays: null, watermark: false },
      internal: { anyoneLink: true, orgLink: true, orgWide: true, contractors: true, namedOnly: false, download: true, maxShareDays: null, watermark: false },
      confidential: { anyoneLink: false, orgLink: true, orgWide: true, contractors: false, namedOnly: false, download: true, maxShareDays: null, watermark: false },
      restricted: { anyoneLink: false, orgLink: false, orgWide: false, contractors: false, namedOnly: true, download: false, maxShareDays: 30, watermark: true },
    },
  };
}

/** 1536 → "1.5 KB" */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
}

const EXT_KIND: Record<string, FileKind> = {
  doc: 'doc',
  docx: 'doc',
  gdoc: 'doc',
  rtf: 'doc',
  odt: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  numbers: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  key: 'slides',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  heic: 'image',
  avif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  rar: 'archive',
  '7z': 'archive',
  md: 'text',
  markdown: 'text',
  txt: 'text',
  log: 'text',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  json: 'code',
  css: 'code',
  scss: 'code',
  html: 'code',
  py: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  kt: 'code',
  swift: 'code',
  rb: 'code',
  sh: 'code',
  yml: 'code',
  yaml: 'code',
  toml: 'code',
  sql: 'code',
  sif: 'code',
  xml: 'code',
};

export const extOf = (name: string) => {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
};

/** Best-effort kind from a file name / MIME type. */
export function kindFromFile(name: string, mime = ''): FileKind {
  const byExt = EXT_KIND[extOf(name)];
  if (byExt) return byExt;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  if (/zip|compressed|tar/.test(mime)) return 'archive';
  return 'other';
}

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'css',
  html: 'html',
  xml: 'html',
  py: 'python',
  go: 'go',
  rs: 'rust',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  sif: 'text',
};
export const langFromName = (name: string) => LANG_BY_EXT[extOf(name)] ?? 'text';

/** Text-like files whose content we keep on upload (≤ 200 KB). */
export const isTextLike = (name: string, mime = '') => {
  const k = kindFromFile(name, mime);
  return k === 'code' || k === 'text' || extOf(name) === 'csv' || mime.startsWith('text/') || mime === 'application/json';
};

/** Deterministic small hash (stable art / colours from ids). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** "in 12 days", "3 days ago" style expiry label. */
export function expiryLabel(expiresAt: number | null, now = Date.now()): string {
  if (expiresAt === null) return 'No expiry';
  const d = Math.round((expiresAt - now) / DAY);
  if (expiresAt <= now) return d === 0 ? 'Expired today' : `Expired ${Math.abs(d)}d ago`;
  if (d <= 0) return 'Expires today';
  return `Expires in ${d}d`;
}
