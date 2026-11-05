/**
 * Display metadata, DLP policy and helpers for Helix Drive.
 */
import type { DriveRole, ItemKind, LinkAccess, RetentionPolicy, Sensitivity } from './types';

export const DRIVE_DATA_VERSION = 1;
export const GB = 1024 ** 3;
export const MB = 1024 ** 2;
export const TRASH_RETENTION_DAYS = 30;

export const ROLE_RANK: Record<DriveRole, number> = { viewer: 0, commenter: 1, editor: 2, manager: 3 };

export const ROLE_META: Record<DriveRole, { label: string; description: string }> = {
  manager: { label: 'Manager', description: 'Full control: share, move, delete, change labels.' },
  editor: { label: 'Editor', description: 'Edit, upload versions and organise. Can share non-confidential files.' },
  commenter: { label: 'Commenter', description: 'View and comment.' },
  viewer: { label: 'Viewer', description: 'View (and download unless restricted).' },
};

export const SENSITIVITY_META: Record<Sensitivity, { label: string; color: string; rank: number; description: string }> = {
  public: { label: 'Public', color: '#34d399', rank: 0, description: 'Safe to share outside the company.' },
  internal: { label: 'Internal', color: '#38bdf8', rank: 1, description: 'Anyone at Helix. No external links.' },
  confidential: { label: 'Confidential', color: '#fbbf24', rank: 2, description: 'Named people and teams only. Contractors excluded. Downloads watermarked.' },
  restricted: { label: 'Restricted', color: '#f87171', rank: 3, description: 'Explicit shares only, clearance L3+. No links, viewers can’t download.' },
};

export const LINK_ACCESS_META: Record<LinkAccess, { label: string; description: string }> = {
  restricted: { label: 'Restricted', description: 'Only people with access can open the link.' },
  company: { label: 'Anyone at Helix', description: 'Employees with the link can open it (contractors excluded).' },
  anyone: { label: 'Anyone with the link', description: 'Including contractors and external partners.' },
};

export const RETENTION_META: Record<RetentionPolicy, { label: string; description: string }> = {
  none: { label: 'Standard', description: 'Trash empties after 30 days.' },
  '1y': { label: 'Keep 1 year', description: 'Cannot be permanently deleted for 12 months.' },
  '7y': { label: 'Keep 7 years', description: 'Finance & statutory records.' },
  legal_hold: { label: 'Legal hold', description: 'Frozen — no deletion, no moves.' },
};

export const KIND_META: Record<ItemKind, { label: string; color: string; ext: string }> = {
  folder: { label: 'Folder', color: '#fbbf24', ext: '' },
  doc: { label: 'Document', color: '#60a5fa', ext: '.doc' },
  sheet: { label: 'Spreadsheet', color: '#34d399', ext: '.sheet' },
  slides: { label: 'Presentation', color: '#fb923c', ext: '.slides' },
  pdf: { label: 'PDF', color: '#f87171', ext: '.pdf' },
  image: { label: 'Image', color: '#f472b6', ext: '.png' },
  video: { label: 'Video', color: '#a78bfa', ext: '.mp4' },
  archive: { label: 'Archive', color: '#94a3b8', ext: '.zip' },
  code: { label: 'Code', color: '#2dd4bf', ext: '.ts' },
  markdown: { label: 'Markdown', color: '#818cf8', ext: '.md' },
  other: { label: 'File', color: '#94a3b8', ext: '' },
};

const EXT_TO_KIND: Record<string, ItemKind> = {
  doc: 'doc',
  docx: 'doc',
  txt: 'doc',
  rtf: 'doc',
  pages: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  numbers: 'sheet',
  sheet: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  key: 'slides',
  slides: 'slides',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  heic: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  '7z': 'archive',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  py: 'code',
  go: 'code',
  rs: 'code',
  json: 'code',
  sql: 'code',
  yaml: 'code',
  yml: 'code',
  md: 'markdown',
  markdown: 'markdown',
};

export function kindFromFileName(name: string): ItemKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_KIND[ext] ?? 'other';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

/** Starter content for files created inside Drive. */
export const NEW_FILE_TEMPLATES: { id: string; kind: Exclude<ItemKind, 'folder'>; name: string; description: string; preview: { type: 'markdown' | 'table' | 'slides'; content?: string; rows?: string[][]; slides?: string[] } }[] = [
  {
    id: 'nt-blank-doc',
    kind: 'doc',
    name: 'Untitled document',
    description: 'A blank page.',
    preview: { type: 'markdown', content: '# Untitled\n\nStart writing…' },
  },
  {
    id: 'nt-prd',
    kind: 'doc',
    name: 'Product brief',
    description: 'Problem, goals, scope, success metrics.',
    preview: { type: 'markdown', content: '# Product brief\n\n## Problem\n\n## Goals & non-goals\n\n## Proposed solution\n\n## Success metrics\n\n## Open questions' },
  },
  {
    id: 'nt-meeting',
    kind: 'doc',
    name: 'Meeting notes',
    description: 'Agenda, decisions, action items.',
    preview: { type: 'markdown', content: '# Meeting notes\n\n**Attendees:**\n\n## Agenda\n1. \n\n## Decisions\n- \n\n## Action items\n- [ ] ' },
  },
  {
    id: 'nt-sheet',
    kind: 'sheet',
    name: 'Untitled spreadsheet',
    description: 'A blank grid.',
    preview: { type: 'table', rows: [['A', 'B', 'C'], ['', '', ''], ['', '', '']] },
  },
  {
    id: 'nt-tracker',
    kind: 'sheet',
    name: 'Budget tracker',
    description: 'Line items, owners, planned vs actual.',
    preview: { type: 'table', rows: [['Item', 'Owner', 'Planned (AED)', 'Actual (AED)', 'Status'], ['Venue', '', '', '', 'Planned']] },
  },
  {
    id: 'nt-deck',
    kind: 'slides',
    name: 'Untitled presentation',
    description: 'Title slide + agenda.',
    preview: { type: 'slides', slides: ['Title', 'Agenda', 'Context', 'Proposal', 'Next steps'] },
  },
];

export const DEPARTMENT_DRIVE_COLORS: Record<string, string> = {
  Engineering: '#a78bfa',
  Product: '#38bdf8',
  Design: '#f472b6',
  'People Ops': '#c084fc',
  Finance: '#4ade80',
  Sales: '#fb923c',
  Marketing: '#f43f5e',
  'IT & Security': '#2dd4bf',
  Operations: '#fbbf24',
  'Customer Success': '#60a5fa',
};
