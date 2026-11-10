/**
 * Spotlight query parser — turns natural queries into structured filters.
 *
 *   "pdfs from daniel last month"   → kind:pdf · owner:u-daniel · modified: last month
 *   "confidential sheets"           → label:confidential · kind:sheet
 *   "shared with me this week"      → shared-with-me · modified: this week
 *   "videos over 100mb in design"   → kind:video · size > 100 MB · drive: Design
 *   "type:pdf label:restricted is:starred budget"
 *
 * The query text is the single source of truth: filter chips in the UI simply
 * append/remove tokens, and every recognised filter records the tokens it consumed.
 */
import type { ItemKind, Sensitivity } from './types';
import { DAY } from './meta';
import { fuzzyMatch } from '@/lib/fuzzy';

export interface QueryCtx {
  users: { id: string; name: string }[];
  drives: { id: string; name: string }[];
  me: string;
  now: number;
}

export type ChipKind = 'type' | 'owner' | 'modified' | 'label' | 'location' | 'flag' | 'size';
export interface QueryChip {
  kind: ChipKind;
  label: string;
  /** Indices (into `tokens`) consumed by this filter. */
  tokens: number[];
}

export interface ParsedQuery {
  raw: string;
  tokens: string[];
  terms: string[];
  kinds: ItemKind[];
  owners: string[];
  labels: Sensitivity[];
  modified: { from: number; to: number; label: string } | null;
  driveIds: string[];
  sharedWithMe: boolean;
  starred: boolean;
  minSize: number | null;
  chips: QueryChip[];
}

const KIND_WORDS: Record<string, ItemKind> = {
  doc: 'doc',
  docs: 'doc',
  document: 'doc',
  documents: 'doc',
  word: 'doc',
  sheet: 'sheet',
  sheets: 'sheet',
  spreadsheet: 'sheet',
  spreadsheets: 'sheet',
  excel: 'sheet',
  csv: 'sheet',
  xlsx: 'sheet',
  slide: 'slides',
  slides: 'slides',
  deck: 'slides',
  decks: 'slides',
  presentation: 'slides',
  presentations: 'slides',
  ppt: 'slides',
  pptx: 'slides',
  keynote: 'slides',
  pdf: 'pdf',
  pdfs: 'pdf',
  image: 'image',
  images: 'image',
  photo: 'image',
  photos: 'image',
  picture: 'image',
  pictures: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  screenshot: 'image',
  screenshots: 'image',
  video: 'video',
  videos: 'video',
  recording: 'video',
  recordings: 'video',
  movie: 'video',
  movies: 'video',
  mp4: 'video',
  audio: 'audio',
  podcast: 'audio',
  podcasts: 'audio',
  code: 'code',
  script: 'code',
  scripts: 'code',
  source: 'code',
  archive: 'archive',
  archives: 'archive',
  zip: 'archive',
  zips: 'archive',
  folder: 'folder',
  folders: 'folder',
  text: 'text',
  markdown: 'text',
};

export const KIND_QUERY: Record<ItemKind, string> = {
  folder: 'folder',
  doc: 'doc',
  sheet: 'sheet',
  slides: 'slides',
  pdf: 'pdf',
  image: 'image',
  video: 'video',
  audio: 'audio',
  code: 'code',
  text: 'text',
  archive: 'archive',
  other: 'other',
};

const LABEL_WORDS: Record<string, Sensitivity> = { public: 'public', internal: 'internal', confidential: 'confidential', restricted: 'restricted' };

const STOP = new Set([
  'show',
  'me',
  'find',
  'get',
  'all',
  'the',
  'a',
  'an',
  'any',
  'files',
  'file',
  'items',
  'item',
  'with',
  'and',
  'or',
  'of',
  'for',
  'that',
  'which',
  'are',
  'is',
  'were',
  'was',
  'to',
  'please',
  'called',
  'named',
  'about',
  'on',
  'at',
  'modified',
  'updated',
  'edited',
  'created',
  'changed',
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeek(ts: number) {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
function startOfMonth(ts: number, offset = 0) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
}
function startOfYear(ts: number, offset = 0) {
  return new Date(new Date(ts).getFullYear() + offset, 0, 1).getTime();
}

export function parseSize(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)$/i.exec(s.trim());
  if (!m) return null;
  const mult: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
  return Math.round(Number(m[1]) * mult[m[2].toLowerCase()]);
}

const SIZE_LABEL = (n: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Math.round(v * 10) / 10} ${units[i]}`;
};

export function emptyQuery(raw = ''): ParsedQuery {
  return { raw, tokens: [], terms: [], kinds: [], owners: [], labels: [], modified: null, driveIds: [], sharedWithMe: false, starred: false, minSize: null, chips: [] };
}

export function parseQuery(raw: string, ctx: QueryCtx): ParsedQuery {
  const q = emptyQuery(raw);
  const tokens = raw
    .replace(/[“”"]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  q.tokens = tokens;
  const low = tokens.map((t) => norm(t).replace(/[,;!?]+$/, ''));
  const used = new Set<number>();
  const chip = (kind: ChipKind, label: string, idx: number[]) => {
    idx.forEach((i) => used.add(i));
    q.chips.push({ kind, label, tokens: idx });
  };
  const range = (from: number, n: number) => Array.from({ length: n }, (_, k) => from + k);

  const users = ctx.users.map((u) => ({ id: u.id, full: norm(u.name), first: norm(u.name.split(' ')[0]), last: norm(u.name.split(' ').slice(-1)[0]) }));
  const userAt = (i: number): { id: string; n: number } | null => {
    const a = low[i];
    if (!a) return null;
    if (a === 'me' || a === 'myself') return { id: ctx.me, n: 1 };
    const b = low[i + 1];
    if (b) {
      const two = `${a} ${b}`;
      const full = users.find((u) => u.full === two);
      if (full) return { id: full.id, n: 2 };
    }
    const one = users.find((u) => u.first === a || u.last === a || u.full === a);
    return one ? { id: one.id, n: 1 } : null;
  };
  const drives = ctx.drives.map((d) => ({ id: d.id, words: norm(d.name).replace(/&/g, ' ').split(/\s+/).filter(Boolean) }));
  const driveAt = (i: number): { id: string; n: number } | null => {
    if (low[i] === 'my' && low[i + 1] === 'drive') return { id: `my-${ctx.me}`, n: 2 };
    let best: { id: string; n: number } | null = null;
    for (const d of drives) {
      // full name match (longest first) or first word match
      let n = 0;
      while (n < d.words.length && low[i + n] === d.words[n]) n++;
      if (n === d.words.length || (n >= 1 && n === 1)) {
        if (!best || n > best.n) best = { id: d.id, n };
      }
    }
    return best;
  };
  const setModified = (from: number, to: number, label: string, idx: number[]) => {
    q.modified = { from, to, label };
    chip('modified', label, idx);
  };
  const ownerName = (id: string) => (id === ctx.me ? 'Me' : (ctx.users.find((u) => u.id === id)?.name ?? id));
  const addOwner = (id: string, idx: number[]) => {
    if (!q.owners.includes(id)) q.owners.push(id);
    chip('owner', `Owner: ${ownerName(id)}`, idx);
  };
  const addKind = (k: ItemKind, idx: number[]) => {
    if (!q.kinds.includes(k)) q.kinds.push(k);
    chip('type', k === 'folder' ? 'Folders' : `Type: ${k === 'slides' ? 'Slides' : k.length <= 3 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)}`, idx);
  };
  const addLabel = (l: Sensitivity, idx: number[]) => {
    if (!q.labels.includes(l)) q.labels.push(l);
    chip('label', l[0].toUpperCase() + l.slice(1), idx);
  };
  const addDrive = (id: string, idx: number[]) => {
    if (!q.driveIds.includes(id)) q.driveIds.push(id);
    const name = id === `my-${ctx.me}` ? 'My Drive' : (ctx.drives.find((d) => d.id === id)?.name ?? id);
    chip('location', `In: ${name}`, idx);
  };

  for (let i = 0; i < low.length; i++) {
    if (used.has(i)) continue;
    const w = low[i];
    const n1 = low[i + 1];
    const n2 = low[i + 2];

    // key:value syntax
    const kv = /^([a-z]+):(.+)$/.exec(w);
    if (kv) {
      const [, key, val] = kv;
      if ((key === 'type' || key === 'kind') && (KIND_WORDS[val] || val === 'other')) {
        addKind(KIND_WORDS[val] ?? 'other', [i]);
        continue;
      }
      if ((key === 'owner' || key === 'from' || key === 'by') && val) {
        const u = val === 'me' ? { id: ctx.me } : users.find((x) => x.first === val || x.last === val || x.full.replace(/\s+/g, '') === val || x.id === val);
        if (u) {
          addOwner(u.id, [i]);
          continue;
        }
      }
      if (key === 'label' && LABEL_WORDS[val]) {
        addLabel(LABEL_WORDS[val], [i]);
        continue;
      }
      if (key === 'is' && (val === 'starred' || val === 'shared')) {
        if (val === 'starred') {
          q.starred = true;
          chip('flag', 'Starred', [i]);
        } else {
          q.sharedWithMe = true;
          chip('flag', 'Shared with me', [i]);
        }
        continue;
      }
      if (key === 'in' || key === 'drive' || key === 'location') {
        const d = val === 'my' || val === 'mydrive' ? { id: `my-${ctx.me}` } : drives.find((x) => x.id === val || x.words[0] === val || x.words.join('') === val);
        if (d) {
          addDrive(d.id, [i]);
          continue;
        }
      }
      if ((key === 'modified' || key === 'updated') && /^\d+[dwm]$/.test(val)) {
        const n = Number(val.slice(0, -1));
        const unit = val.slice(-1);
        const days = unit === 'd' ? n : unit === 'w' ? n * 7 : n * 30;
        setModified(ctx.now - days * DAY, ctx.now, `Last ${n}${unit}`, [i]);
        continue;
      }
      if (key === 'size') {
        const s = parseSize(val.replace(/^>/, ''));
        if (s) {
          q.minSize = s;
          chip('size', `> ${SIZE_LABEL(s)}`, [i]);
          continue;
        }
      }
    }

    // phrases
    if (w === 'shared' && n1 === 'with' && n2 === 'me') {
      q.sharedWithMe = true;
      chip('flag', 'Shared with me', range(i, 3));
      continue;
    }
    if (w === 'starred' || w === 'favorites' || w === 'favourites') {
      q.starred = true;
      chip('flag', 'Starred', [i]);
      continue;
    }
    if (w === 'today') {
      setModified(startOfDay(ctx.now), ctx.now, 'Today', [i]);
      continue;
    }
    if (w === 'yesterday') {
      setModified(startOfDay(ctx.now) - DAY, startOfDay(ctx.now), 'Yesterday', [i]);
      continue;
    }
    if (w === 'recent' || w === 'recently') {
      setModified(ctx.now - 14 * DAY, ctx.now, 'Last 14 days', [i]);
      continue;
    }
    if ((w === 'this' || w === 'last' || w === 'past') && (n1 === 'week' || n1 === 'month' || n1 === 'year')) {
      const label = `${w === 'this' ? 'This' : 'Last'} ${n1}`;
      if (n1 === 'week') {
        const sow = startOfWeek(ctx.now);
        if (w === 'this') setModified(sow, ctx.now, label, range(i, 2));
        else setModified(sow - 7 * DAY, sow, label, range(i, 2));
      } else if (n1 === 'month') {
        if (w === 'this') setModified(startOfMonth(ctx.now), ctx.now, label, range(i, 2));
        else setModified(startOfMonth(ctx.now, -1), startOfMonth(ctx.now), label, range(i, 2));
      } else if (w === 'this') setModified(startOfYear(ctx.now), ctx.now, label, range(i, 2));
      else setModified(startOfYear(ctx.now, -1), startOfYear(ctx.now), label, range(i, 2));
      continue;
    }
    if ((w === 'last' || w === 'past') && n1 && /^\d+$/.test(n1) && n2 && /^(days?|weeks?|months?)$/.test(n2)) {
      const n = Number(n1);
      const days = n2.startsWith('day') ? n : n2.startsWith('week') ? n * 7 : n * 30;
      setModified(ctx.now - days * DAY, ctx.now, `Last ${n} ${n2}`, range(i, 3));
      continue;
    }
    if ((w === 'from' || w === 'by' || w === 'owned') && n1) {
      const off = w === 'owned' && n1 === 'by' ? 2 : 1;
      const u = userAt(i + off);
      if (u) {
        addOwner(u.id, range(i, off + u.n));
        continue;
      }
    }
    if (w === 'my' || w === 'mine') {
      if (w === 'my' && n1 === 'drive') {
        addDrive(`my-${ctx.me}`, range(i, 2));
        continue;
      }
      addOwner(ctx.me, [i]);
      continue;
    }
    if (/^[a-z]+'s$/.test(w)) {
      const u = userAt(i) ?? (() => {
        const base = w.slice(0, -2);
        const x = users.find((y) => y.first === base || y.last === base);
        return x ? { id: x.id, n: 1 } : null;
      })();
      if (u) {
        addOwner(u.id, [i]);
        continue;
      }
    }
    if (w === 'in' && n1) {
      const d = driveAt(i + 1);
      if (d) {
        addDrive(d.id, range(i, 1 + d.n));
        continue;
      }
    }
    if ((w === 'over' || w === 'above' || w === '>') && n1) {
      const s = parseSize(n1) ?? (n2 ? parseSize(`${n1}${n2}`) : null);
      if (s) {
        q.minSize = s;
        chip('size', `> ${SIZE_LABEL(s)}`, range(i, parseSize(n1) ? 2 : 3));
        continue;
      }
    }
    if ((w === 'larger' || w === 'bigger') && n1 === 'than' && n2) {
      const s = parseSize(n2);
      if (s) {
        q.minSize = s;
        chip('size', `> ${SIZE_LABEL(s)}`, range(i, 3));
        continue;
      }
    }
    if (w === 'large' || w === 'big' || w === 'huge') {
      q.minSize = 25 * 1024 ** 2;
      chip('size', '> 25 MB', [i]);
      continue;
    }
    if (KIND_WORDS[w]) {
      addKind(KIND_WORDS[w], [i]);
      continue;
    }
    if (LABEL_WORDS[w]) {
      addLabel(LABEL_WORDS[w], [i]);
      continue;
    }
  }

  q.terms = low.filter((w, i) => !used.has(i) && !STOP.has(w) && w.length > 0 && !/^[a-z]+:$/.test(w));
  return q;
}

/** Remove a recognised filter from the query text. */
export function removeChip(q: ParsedQuery, chip: QueryChip): string {
  const drop = new Set(chip.tokens);
  return q.tokens.filter((_, i) => !drop.has(i)).join(' ');
}

/** Append a syntax token, replacing an existing one with the same key. */
export function withToken(raw: string, key: string, value: string | null): string {
  const parts = raw.split(/\s+/).filter(Boolean).filter((t) => !t.toLowerCase().startsWith(`${key}:`));
  if (value) parts.push(`${key}:${value}`);
  return parts.join(' ') + (parts.length ? ' ' : '');
}

export interface Matchable {
  name: string;
  kind: ItemKind;
  ownerId: string;
  label: Sensitivity;
  updatedAt: number;
  driveId: string;
  size: number;
  extra: string[];
  sharedWithMe: boolean;
  starred: boolean;
}

export interface Match {
  score: number;
  /** Matched character indices in `name` (for highlighting). */
  hits: number[];
}

export const hasFilters = (q: ParsedQuery) =>
  q.terms.length > 0 || q.kinds.length > 0 || q.owners.length > 0 || q.labels.length > 0 || !!q.modified || q.driveIds.length > 0 || q.sharedWithMe || q.starred || q.minSize !== null;

export function matchItem(m: Matchable, q: ParsedQuery): Match | null {
  if (q.kinds.length && !q.kinds.includes(m.kind)) return null;
  if (q.owners.length && !q.owners.includes(m.ownerId)) return null;
  if (q.labels.length && !q.labels.includes(m.label)) return null;
  if (q.driveIds.length && !q.driveIds.includes(m.driveId)) return null;
  if (q.modified && (m.updatedAt < q.modified.from || m.updatedAt > q.modified.to)) return null;
  if (q.sharedWithMe && !m.sharedWithMe) return null;
  if (q.starred && !m.starred) return null;
  if (q.minSize !== null && m.size < q.minSize) return null;
  let score = 0;
  const hits = new Set<number>();
  for (const t of q.terms) {
    const byName = fuzzyMatch(t, m.name);
    let best = byName ? byName.score + 12 : -Infinity;
    if (byName) byName.indices.forEach((i) => hits.add(i));
    for (const e of m.extra) {
      const r = fuzzyMatch(t, e);
      if (r && r.score * 0.75 > best) best = r.score * 0.75;
    }
    if (best === -Infinity || best < 4) return null;
    score += best;
  }
  // recency bonus (≤ 10 points over 60 days)
  const ageDays = Math.max(0, (Date.now() - m.updatedAt) / DAY);
  score += Math.max(0, 10 - ageDays / 6);
  return { score, hits: [...hits].sort((a, b) => a - b) };
}

/** Split text into highlighted / plain runs. */
export function highlight(text: string, hits: number[]): { text: string; hit: boolean }[] {
  if (!hits.length) return [{ text, hit: false }];
  const set = new Set(hits);
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({ text: text[i], hit });
  }
  return out;
}

export const EXAMPLE_QUERIES = ['pdfs from daniel last month', 'confidential sheets', 'shared with me this week', 'images in design', 'large videos'];
