/**
 * Deterministic ids, @handles and small helpers shared by the store, seed, bridge and UI.
 */
import type { BotId } from './types';

/**
 * Conversation id for a DM / group DM / bot conversation:
 * `dm-` + unique member ids sorted alphabetically, joined with `--`.
 *   dmId(['u-omar', 'u-mei'])            → 'dm-u-mei--u-omar'
 *   dmId(['bot-helpdesk', 'u-mei'])      → 'dm-bot-helpdesk--u-mei'
 */
export function dmId(memberIds: string[]): string {
  return `dm-${[...new Set(memberIds)].sort().join('--')}`;
}

export const isDmId = (id: string) => id.startsWith('dm-');

/** Member ids encoded in a DM id (inverse of `dmId`). */
export function dmMembers(id: string): string[] {
  if (!isDmId(id)) return [];
  return id
    .slice(3)
    .split('--')
    .filter(Boolean);
}

export const BOT_IDS: BotId[] = ['bot-projects', 'bot-drive', 'bot-helpdesk', 'bot-nova'];
export const isBotId = (id: string): id is BotId => (BOT_IDS as string[]).includes(id);

/** Channel slug rules: lowercase letters, digits and dashes, 2–40 chars. */
export function slugifyChannel(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export interface HandleMaps {
  /** handle (lowercase, no @) → user id */
  byHandle: Map<string, string>;
  /** user id → handle */
  byUser: Map<string, string>;
}

const handleCache = new WeakMap<readonly { id: string; name: string }[], HandleMaps>();

/**
 * `@handles` are first names in lowercase (`@omar`, `@mei`). Collisions are resolved
 * deterministically (by user id order): the first user keeps the first name, later ones get
 * `first.last` (then a numeric suffix).
 */
export function buildHandles(users: readonly { id: string; name: string }[]): HandleMaps {
  const cached = handleCache.get(users);
  if (cached) return cached;
  const byHandle = new Map<string, string>();
  const byUser = new Map<string, string>();
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.]/g, '');
  const sorted = [...users].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const u of sorted) {
    const parts = u.name.trim().split(/\s+/);
    const first = norm(parts[0] ?? u.id) || norm(u.id);
    const last = norm(parts[parts.length - 1] ?? '');
    let h = first;
    if (byHandle.has(h)) h = last && parts.length > 1 ? `${first}.${last}` : `${first}2`;
    let n = 2;
    while (byHandle.has(h)) h = `${first}${n++}`;
    byHandle.set(h, u.id);
    byUser.set(u.id, h);
  }
  const maps = { byHandle, byUser };
  handleCache.set(users, maps);
  return maps;
}

/** Tiny deterministic string hash (FNV-1a) → unsigned 32-bit int. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic waveform peaks for voice notes. */
export function wavePeaks(seed: string, n = 40): number[] {
  const r = rng(hash(seed));
  const out: number[] = [];
  let v = 0.4;
  for (let i = 0; i < n; i++) {
    v = Math.max(0.12, Math.min(1, v + (r() - 0.5) * 0.55));
    const env = Math.sin((Math.PI * (i + 1)) / (n + 1)) * 0.45 + 0.55;
    out.push(Math.round(v * env * 100) / 100);
  }
  return out;
}

export function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
