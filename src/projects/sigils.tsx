/**
 * Helix Projects — sigils.
 *
 * A project's identity mark: a hand-drawn line icon on a 24×24 grid (1.6 stroke,
 * round caps/joins, geometric / orbital / circuit motifs, one accent stroke or
 * node per icon) rendered inside a holographic badge tinted by the project
 * colour. Used by Projects and by every app that shows a project (palette,
 * Pulse, Drive, Performance), so the badge styles ship with this module.
 *
 * `Project.icon` used to hold an emoji; persisted data may still do so.
 * `sigilIdFor()` maps legacy emoji, keywords and unknown strings to a sigil id
 * (deterministic hash fallback), so any stored value renders.
 */
import type { CSSProperties, ReactNode } from 'react';
import '@/styles/sigils.css';

/* ───────────────────────── ids & labels ───────────────────────── */

/** Picker order: build · create · grow · run. */
export const SIGIL_IDS = [
  'rocket',
  'satellite',
  'chip',
  'cube',
  'layers',
  'cell',
  'bolt',
  'atom',
  'prism',
  'spark',
  'bulb',
  'wave',
  'mic',
  'megaphone',
  'flask',
  'brain',
  'sprout',
  'heart',
  'handshake',
  'globe',
  'compass',
  'telescope',
  'target',
  'flag',
  'chart',
  'card',
  'columns',
  'folders',
  'book',
  'lock',
  'shield-key',
  'orbit',
] as const;

export type SigilId = (typeof SIGIL_IDS)[number];

export const SIGIL_LABEL: Record<SigilId, string> = {
  rocket: 'Rocket',
  satellite: 'Satellite',
  chip: 'Chip',
  cube: 'Cube',
  layers: 'Layers',
  cell: 'Cell cluster',
  bolt: 'Bolt',
  atom: 'Atom',
  prism: 'Prism',
  spark: 'Spark',
  bulb: 'Idea',
  wave: 'Signal wave',
  mic: 'Mic',
  megaphone: 'Megaphone',
  flask: 'Flask',
  brain: 'Neural',
  sprout: 'Sprout',
  heart: 'Pulse',
  handshake: 'Handshake',
  globe: 'Globe',
  compass: 'Compass',
  telescope: 'Telescope',
  target: 'Target',
  flag: 'Flag',
  chart: 'Growth chart',
  card: 'Card',
  columns: 'Board',
  folders: 'Folders',
  book: 'Book',
  lock: 'Lock',
  'shield-key': 'Shield & key',
  orbit: 'Orbit',
};

const SIGIL_SET: ReadonlySet<string> = new Set(SIGIL_IDS);

export function isSigilId(v: unknown): v is SigilId {
  return typeof v === 'string' && SIGIL_SET.has(v);
}

/* ───────────────────────── legacy mapping ───────────────────────── */

/** Strip variation selectors / ZWJ so `🛡️` and `🛡` match. */
const norm = (s: string) => s.trim().replace(/[\uFE0E\uFE0F\u200D]/g, '');

const EMOJI_RAW: Record<string, SigilId> = {
  // the old picker (ProjectModals EMOJIS) and seed data
  '🚀': 'rocket',
  '🎨': 'prism',
  '🛡️': 'shield-key',
  '🛰️': 'satellite',
  '🤝': 'handshake',
  '🌱': 'sprout',
  '📣': 'megaphone',
  '✨': 'spark',
  '🧭': 'compass',
  '🏗️': 'cell',
  '📊': 'chart',
  '💳': 'card',
  '🧪': 'flask',
  '🎯': 'target',
  '🗂️': 'folders',
  '⚡': 'bolt',
  '🔐': 'lock',
  '📦': 'cube',
  '🧠': 'brain',
  '🎤': 'mic',
  '🏁': 'flag',
  '💡': 'bulb',
  '🌍': 'globe',
  '🔭': 'telescope',
  // the old templates
  '◻️': 'orbit',
  '⬜': 'orbit',
  '🏃': 'bolt',
  // common synonyms people typed into older builds
  '🔒': 'lock',
  '🔓': 'lock',
  '🔏': 'lock',
  '🔑': 'shield-key',
  '🗝️': 'shield-key',
  '🧱': 'cell',
  '🏢': 'cell',
  '🏭': 'cell',
  '🛠️': 'chip',
  '🔧': 'chip',
  '⚙️': 'chip',
  '💻': 'chip',
  '🖥️': 'chip',
  '📱': 'chip',
  '🤖': 'brain',
  '🧬': 'atom',
  '⚛️': 'atom',
  '🔬': 'flask',
  '⚗️': 'flask',
  '📈': 'chart',
  '📉': 'chart',
  '💹': 'chart',
  '💰': 'card',
  '💵': 'card',
  '🏦': 'card',
  '🧾': 'card',
  '📁': 'folders',
  '📂': 'folders',
  '🗄️': 'folders',
  '🗃️': 'folders',
  '📋': 'columns',
  '🗓️': 'columns',
  '📅': 'columns',
  '📌': 'flag',
  '🚩': 'flag',
  '🏆': 'target',
  '🥇': 'target',
  '⭐': 'spark',
  '🌟': 'spark',
  '💫': 'spark',
  '🎉': 'spark',
  '🎊': 'spark',
  '🔥': 'bolt',
  '⏱️': 'bolt',
  '🌐': 'globe',
  '🌎': 'globe',
  '🌏': 'globe',
  '✈️': 'globe',
  '🗺️': 'compass',
  '🪐': 'orbit',
  '🌙': 'orbit',
  '☄️': 'orbit',
  '🛸': 'satellite',
  '📡': 'satellite',
  '☁️': 'layers',
  '🌊': 'wave',
  '🎵': 'wave',
  '🎶': 'wave',
  '🎧': 'wave',
  '📢': 'megaphone',
  '💬': 'megaphone',
  '📰': 'megaphone',
  '🎙️': 'mic',
  '📚': 'book',
  '📖': 'book',
  '📘': 'book',
  '🎓': 'book',
  '❤️': 'heart',
  '💜': 'heart',
  '💙': 'heart',
  '💚': 'heart',
  '🫶': 'heart',
  '🌿': 'sprout',
  '🌳': 'sprout',
  '🍀': 'sprout',
  '🪴': 'sprout',
  '👥': 'handshake',
  '🤗': 'handshake',
  '🎭': 'prism',
  '🖌️': 'prism',
  '✏️': 'prism',
  '🔮': 'prism',
  '🧩': 'cube',
  '🧰': 'cube',
  '👁️': 'telescope',
  '🔍': 'telescope',
  '🔎': 'telescope',
};
const EMOJI = new Map<string, SigilId>(Object.entries(EMOJI_RAW).map(([k, v]) => [norm(k), v]));

const WORD_RAW: Record<SigilId, string[]> = {
  rocket: ['launch', 'ship', 'liftoff'],
  satellite: ['platform', 'infra', 'reliability', 'sre', 'uptime'],
  chip: ['hardware', 'cpu', 'silicon', 'engineering', 'device'],
  cube: ['box', 'package', 'product', 'module'],
  layers: ['stack', 'tiers', 'cloud'],
  cell: ['cluster', 'hex', 'honeycomb', 'infrastructure', 'region', 'dr'],
  bolt: ['energy', 'fast', 'speed', 'sprint', 'lightning', 'zap', 'power'],
  atom: ['science', 'physics', 'research', 'r&d'],
  prism: ['design', 'palette', 'ui', 'ux', 'art'],
  spark: ['brand', 'sparkle', 'magic', 'star', 'creative'],
  bulb: ['idea', 'innovation', 'lightbulb', 'hackathon'],
  wave: ['signal', 'audio', 'sound', 'flow', 'stream'],
  mic: ['event', 'podcast', 'talk', 'microphone', 'stage'],
  megaphone: ['comms', 'announcement', 'marketing', 'campaign', 'pr'],
  flask: ['experiment', 'lab', 'test', 'pilot'],
  brain: ['ai', 'ml', 'neural', 'mind', 'model'],
  sprout: ['growth', 'onboarding', 'seed', 'plant', 'grow'],
  heart: ['wellbeing', 'culture', 'care', 'health', 'love', 'people'],
  handshake: ['partner', 'partnership', 'deal', 'sales', 'client', 'customer'],
  globe: ['world', 'global', 'international', 'expansion', 'earth'],
  compass: ['strategy', 'direction', 'north', 'navigation', 'offsite'],
  telescope: ['vision', 'discovery', 'explore', 'insight'],
  target: ['goal', 'okr', 'objective', 'aim'],
  flag: ['milestone', 'finish', 'release'],
  chart: ['analytics', 'data', 'metrics', 'graph', 'kpi', 'growth-chart'],
  card: ['payment', 'payments', 'finance', 'billing', 'credit', 'payroll'],
  columns: ['kanban', 'board', 'columns'],
  folders: ['folder', 'files', 'archive', 'documents'],
  book: ['docs', 'knowledge', 'learning', 'wiki', 'handbook', 'training'],
  lock: ['privacy', 'secure', 'locked', 'padlock', 'compliance'],
  'shield-key': ['security', 'shield', 'key', 'mfa', 'passkey', 'auth'],
  orbit: ['planet', 'space', 'blank', 'default', 'mission'],
};
const WORDS = new Map<string, SigilId>();
for (const id of SIGIL_IDS) for (const w of WORD_RAW[id]) WORDS.set(w, id);

/** FNV-1a — stable across sessions and machines. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Resolve any stored `Project.icon` (sigil id, legacy emoji, keyword or junk)
 * to a sigil id. Unknown values hash deterministically onto the set.
 */
export function sigilIdFor(icon: string | null | undefined): SigilId {
  const raw = (icon ?? '').trim();
  if (!raw) return 'orbit';
  if (SIGIL_SET.has(raw)) return raw as SigilId;
  const lower = raw.toLowerCase();
  if (SIGIL_SET.has(lower)) return lower as SigilId;
  const n = norm(raw);
  const byEmoji = EMOJI.get(n);
  if (byEmoji) return byEmoji;
  const byWord = WORDS.get(lower);
  if (byWord) return byWord;
  // first grapheme of an emoji sequence (skin tones, flags, keycaps…)
  const first = norm([...raw][0] ?? '');
  const byFirst = first && EMOJI.get(first);
  if (byFirst) return byFirst;
  return SIGIL_IDS[hash(n || raw) % SIGIL_IDS.length];
}

/* ───────────────────────── artwork ─────────────────────────
 * Classes (painted by the host — badge or bare glyph):
 *   sg-a  accent stroke      sg-n  accent node (fill)
 *   sg-d  ink dot (fill)     sg-f  faint ink stroke
 *   sg-x  fine detail, dropped at the tiniest badge size
 */

const ART: Record<SigilId, ReactNode> = {
  rocket: (
    <>
      <path d="M12 3.2c2.9 2.1 4.4 5.2 4.4 9v3.8H7.6v-3.8c0-3.8 1.5-6.9 4.4-9Z" />
      <circle cx="12" cy="9.9" r="1.7" />
      <path d="M7.6 12.8 5.2 15.2v2.9l2.4-1.2M16.4 12.8l2.4 2.4v2.9l-2.4-1.2" />
      <path className="sg-a" d="M12 18.5v2.9" />
      <path className="sg-a sg-x" d="M9.7 18.6v1.5M14.3 18.6v1.5" />
    </>
  ),
  satellite: (
    <g transform="rotate(45 12 12)">
      <rect x="9.8" y="9.8" width="4.4" height="4.4" rx="1" />
      <rect x="2.5" y="9.7" width="5.6" height="4.6" rx=".9" />
      <rect x="15.9" y="9.7" width="5.6" height="4.6" rx=".9" />
      <path d="M8.1 12h1.7M14.2 12h1.7M12 9.8V8.2" />
      <path className="sg-f sg-x" d="M5.3 9.7v4.6M18.7 9.7v4.6" />
      <path className="sg-a" d="M10 5.9a2.8 2.8 0 0 1 4 0M8.3 4a5.2 5.2 0 0 1 7.4 0" />
    </g>
  ),
  chip: (
    <>
      <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.3" />
      <rect className="sg-a" x="9.7" y="9.7" width="4.6" height="4.6" rx="1" />
      <path d="M9.6 3.4v3M14.4 3.4v3M9.6 17.6v3M14.4 17.6v3M3.4 9.6h3M3.4 14.4h3M17.6 9.6h3M17.6 14.4h3" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.2 19.6 7.5v9L12 20.8l-7.6-4.3v-9Z" />
      <path d="M4.4 7.5 12 11.8l7.6-4.3M12 11.8v9" />
      <path className="sg-a sg-x" d="m8.2 5.4 7.6 4.3" />
      <circle className="sg-n" cx="12" cy="11.8" r="1.45" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.6 20.2 8 12 12.4 3.8 8Z" />
      <path d="m3.8 12 8.2 4.4 8.2-4.4" />
      <path className="sg-a" d="m3.8 16 8.2 4.4 8.2-4.4" />
      <circle className="sg-n sg-x" cx="12" cy="8" r="1.25" />
    </>
  ),
  cell: (
    <>
      <path d="M8.2 4.3 12 6.5v4.4l-3.8 2.2-3.8-2.2V6.5Z" />
      <path d="m15.8 4.3 3.8 2.2v4.4l-3.8 2.2-3.8-2.2V6.5Z" />
      <path className="sg-a" d="M15.8 13.1v4.4L12 19.7l-3.8-2.2v-4.4" />
      <circle className="sg-n" cx="12" cy="15.3" r="1.25" />
    </>
  ),
  bolt: (
    <>
      <path d="M13.4 3 6.2 13.1h5.3l-1 7.9 7.3-10.1h-5.3Z" />
      <path className="sg-a" d="M4 8.6a8.9 8.9 0 0 1 4.3-4.5M20 15.4a8.9 8.9 0 0 1-4.3 4.5" />
    </>
  ),
  atom: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" />
      <ellipse className="sg-a" cx="12" cy="12" rx="9" ry="3.5" />
      <circle className="sg-n" cx="12" cy="12" r="1.6" />
    </>
  ),
  prism: (
    <>
      <path d="M11.4 4.6 18.2 17.2H4.6Z" />
      <path d="m2.6 13 5.1-1.5" />
      <path className="sg-f sg-x" d="M7.7 11.5h7.4" />
      <path className="sg-a" d="m15.1 11.5 6.1-2M15.1 11.5l6.3 1M15.1 11.5l5.3 3.5" />
    </>
  ),
  spark: (
    <>
      <path d="M11 3.4c.6 4.3 2.5 6.3 6.9 6.9-4.4.6-6.3 2.6-6.9 6.9-.6-4.3-2.5-6.3-6.9-6.9 4.4-.6 6.3-2.6 6.9-6.9Z" />
      <path className="sg-a" d="M18.2 14.6c.25 1.6.95 2.3 2.6 2.6-1.65.3-2.35 1-2.6 2.6-.25-1.6-.95-2.3-2.6-2.6 1.65-.3 2.35-1 2.6-2.6Z" />
      <circle className="sg-n sg-x" cx="5" cy="18.8" r="1.1" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.3 17v-1.2c0-1.1-.5-2-1.3-2.8a5.6 5.6 0 1 1 8 0c-.8.8-1.3 1.7-1.3 2.8V17Z" />
      <path d="M9.9 20.3h4.2" />
      <path className="sg-a" d="m10.1 12.5 1.9-2.1 1.9 2.1" />
    </>
  ),
  wave: (
    <>
      <path d="M2.8 12q2.3-8.2 4.6 0t4.6 0 4.6 0 4.6 0" />
      <path className="sg-a" d="M2.8 12q2.3 4.4 4.6 0t4.6 0 4.6 0 4.6 0" />
      <circle className="sg-n sg-x" cx="5.1" cy="7.9" r="1.15" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.2" width="6" height="10.6" rx="3" />
      <path d="M5.9 10.9a6.1 6.1 0 0 0 12.2 0M12 17v3.7M9.3 20.7h5.4" />
      <circle className="sg-n" cx="19.2" cy="4.4" r="1.4" />
      <path className="sg-a sg-x" d="M9 8.5h1.9M13.1 8.5H15" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3.6 10.3v3.4c0 .6.4 1 1 1h2.6l6.8 4V5.3l-6.8 4H4.6c-.6 0-1 .4-1 1Z" />
      <path className="sg-x" d="m7.2 14.7 1.3 4.3h2.1l-1-3.6" />
      <path className="sg-a" d="M17.1 9.4a3.6 3.6 0 0 1 0 5.2M19.5 7.1a6.8 6.8 0 0 1 0 9.8" />
    </>
  ),
  flask: (
    <>
      <path d="M9.6 3.4h4.8" />
      <path d="M10.6 3.4v5.4l-5.3 8.9a1.8 1.8 0 0 0 1.5 2.8h10.4a1.8 1.8 0 0 0 1.5-2.8l-5.3-8.9V3.4" />
      <path className="sg-a" d="M7.8 14.6h8.4" />
      <circle className="sg-n sg-x" cx="11" cy="17.4" r="1" />
      <circle className="sg-n sg-x" cx="13.9" cy="16.6" r=".75" />
    </>
  ),
  brain: (
    <>
      <path d="M12 18.6V5.4a2.8 2.8 0 0 0-5.3-1A3.2 3.2 0 0 0 4.4 9a3.3 3.3 0 0 0 .3 5.6A3.4 3.4 0 0 0 9 18.9a3 3 0 0 0 3-.3" />
      <path d="M12 5.4a2.8 2.8 0 0 1 5.3-1A3.2 3.2 0 0 1 19.6 9a3.3 3.3 0 0 1-.3 5.6 3.4 3.4 0 0 1-4.3 4.3 3 3 0 0 1-3-.3" />
      <path className="sg-a" d="M12 9.6H9.6L8.4 8.4M12 13.6h2.4l1.2 1.2" />
      <circle className="sg-n sg-x" cx="7.9" cy="7.9" r="1" />
      <circle className="sg-n sg-x" cx="16.1" cy="15.3" r="1" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20.2v-8.6" />
      <path d="M12 14.2c-3.7 0-6.1-2.3-6.3-6.2 3.7 0 6.1 2.3 6.3 6.2Z" />
      <path d="M12 11.6c.2-3.9 2.6-6.2 6.4-6.2-.1 3.9-2.6 6.2-6.4 6.2Z" />
      <path className="sg-a" d="M6.2 20.2c3.8-1.3 7.8-1.3 11.6 0" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20.2s-7.8-4.5-7.8-10.3a4.4 4.4 0 0 1 7.8-2.8 4.4 4.4 0 0 1 7.8 2.8c0 5.8-7.8 10.3-7.8 10.3Z" />
      <path className="sg-a" d="M6.4 12.6h2.5l1.3-2.4 2.1 4.6 1.5-2.7h3.8" />
    </>
  ),
  handshake: (
    <>
      <path d="m2.8 13.6 4.9-4.9a2.4 2.4 0 0 1 3.4 0l3.4 3.4" />
      <path d="m21.2 10.4-4.9 4.9a2.4 2.4 0 0 1-3.4 0l-3.4-3.4" />
      <path className="sg-a" d="M8.6 4.9a5.4 5.4 0 0 1 6.8 0" />
      <circle className="sg-n sg-x" cx="12" cy="12" r="1.1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8c-2.3 2.3-3.5 5-3.5 8.2s1.2 5.9 3.5 8.2c2.3-2.3 3.5-5 3.5-8.2S14.3 6.1 12 3.8Z" />
      <path className="sg-x" d="M3.8 12h16.4" />
      <path className="sg-a" d="M2.3 15.8c2.4 3 13.8.2 19.4-7.4" />
      <circle className="sg-n" cx="20.7" cy="9.6" r="1.2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M15.4 8.6 13.3 13.3 8.6 15.4l2.1-4.7Z" />
      <path className="sg-n" d="M15.4 8.6 13.3 13.3l-2.6-2.6Z" />
      <path className="sg-f sg-x" d="M12 4.9v1.3M12 17.8v1.3M4.9 12h1.3M17.8 12h1.3" />
    </>
  ),
  telescope: (
    <>
      <path d="m4.6 14.2 10-5.8 1.6 2.8-10 5.8Z" />
      <path d="m14.2 7.4 3.4-2 2.2 3.8-3.4 2Z" />
      <path d="m11.2 14.1-3 6.9M11.2 14.1l3.2 6.9" />
      <circle className="sg-n" cx="19.4" cy="15.4" r="1.15" />
      <path className="sg-a sg-x" d="M17.4 18.4v1.8M16.5 19.3h1.8" />
    </>
  ),
  target: (
    <>
      <circle cx="11" cy="13" r="7.6" />
      <circle cx="11" cy="13" r="3.8" />
      <circle className="sg-n" cx="11" cy="13" r="1.25" />
      <path className="sg-a" d="m12.7 11.3 6.6-6.6M19.3 4.7V2.6M19.3 4.7h2.1" />
    </>
  ),
  flag: (
    <>
      <path d="M5.6 21V4.4" />
      <path d="M5.6 4.8h11.6l-2.6 3.9 2.6 3.9H5.6" />
      <circle className="sg-n" cx="5.6" cy="3.3" r="1.3" />
      <path className="sg-a sg-x" d="M3 21h5.2" />
    </>
  ),
  chart: (
    <>
      <path d="M6 19.6v-4.8M10.5 19.6v-7.6M15 19.6v-5.6M19.5 19.6v-8.6" />
      <path className="sg-a" d="m4.4 10.8 4.6-3.6 4.1 2.6 5.2-4.5" />
      <circle className="sg-n" cx="19.4" cy="4.6" r="1.4" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.8" width="18" height="12.4" rx="2.6" />
      <path d="M3 9.8h18" />
      <rect className="sg-a" x="5.8" y="12.6" width="3.8" height="2.9" rx=".8" />
      <path className="sg-x" d="M13.2 15h4.6" />
    </>
  ),
  columns: (
    <>
      <rect x="3.6" y="4" width="16.8" height="16" rx="2.8" />
      <path d="M8.2 8v8M15.8 8v6" />
      <path className="sg-a" d="M12 8v3.6" />
      <circle className="sg-n sg-x" cx="12" cy="15.2" r="1.15" />
    </>
  ),
  folders: (
    <>
      <path d="M3.2 9.4c0-.9.7-1.6 1.6-1.6h3.8l1.8 2h8.8c.9 0 1.6.7 1.6 1.6v6.8c0 .9-.7 1.6-1.6 1.6H4.8c-.9 0-1.6-.7-1.6-1.6Z" />
      <path className="sg-a" d="M6 5.6V5c0-.6.4-1 1-1h3.3l1.7 1.8h7c.9 0 1.6.7 1.6 1.6v.5" />
      <path className="sg-f sg-x" d="M7 14.8h5" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.6c-1.8-1.5-4.4-2.2-7.6-2.2v13.4c3.2 0 5.8.7 7.6 2.2 1.8-1.5 4.4-2.2 7.6-2.2V4.4c-3.2 0-5.8.7-7.6 2.2Z" />
      <path d="M12 6.6V20" />
      <path className="sg-a sg-x" d="M14.6 9.4h2.6M14.6 12.4h2.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.4" width="14" height="10.2" rx="2.6" />
      <path d="M8 10.4V7.9a4 4 0 0 1 8 0v2.5" />
      <circle className="sg-n" cx="12" cy="14.6" r="1.4" />
      <path className="sg-a" d="M12 15.8v1.9" />
    </>
  ),
  'shield-key': (
    <>
      <path d="M12 3.2 19 6v5.4c0 4.4-2.9 7.6-7 9.4-4.1-1.8-7-5-7-9.4V6Z" />
      <circle cx="12" cy="10.3" r="1.9" />
      <path d="M12 12.2v3.9M12 14.4h1.7" />
      <path className="sg-a sg-x" d="M8.4 7.5 12 6.1l3.6 1.4" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="4.3" />
      <ellipse className="sg-a" cx="12" cy="12" rx="9.6" ry="3.6" transform="rotate(-24 12 12)" />
      <circle className="sg-n" cx="18.9" cy="7" r="1.35" />
    </>
  ),
};

/* ───────────────────────── colour ───────────────────────── */

type Rgb = [number, number, number];
interface Palette {
  hi: string;
  mid: string;
  deep: string;
  deepLight: string;
  glow: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function parseHex(c: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function toRgb(h: number, s: number, l: number): Rgb {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [ch(hh + 1 / 3) * 255, ch(hh) * 255, ch(hh - 1 / 3) * 255];
}

const hex = (c: Rgb) => `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const PALETTES = new Map<string, Palette>();

/**
 * Derive the badge gradient from a project colour: a bright, slightly
 * hue-shifted highlight, a mid tone dark enough for light ink, and a deep
 * counter-shifted shadow (the "holographic" drift). Warm light hues drift
 * towards orange / green as they darken so they never turn muddy.
 */
function palette(color: string): Palette {
  const cached = PALETTES.get(color);
  if (cached) return cached;
  const rgb = parseHex(color);
  let out: Palette;
  if (!rgb) {
    out = {
      hi: `color-mix(in oklab, ${color} 78%, white)`,
      mid: color,
      deep: `color-mix(in oklab, ${color} 42%, #0b0820)`,
      deepLight: `color-mix(in oklab, ${color} 70%, #1e1b4b)`,
      glow: color,
    };
  } else {
    const [h, s0, l0] = toHsl(rgb);
    const grey = s0 < 0.22;
    const s = grey ? s0 : clamp(s0, 0.5, 0.96);
    const drift = h >= 35 && h < 72 ? -9 : h >= 72 && h < 115 ? 11 : 0;
    let lo = 0.12;
    let hi = l0;
    // binary-search the lightness where white ink keeps ≥ ~3:1 contrast
    if (luminance(toRgb(h + drift, s, l0)) > 0.3) {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (luminance(toRgb(h + drift, s, mid)) > 0.3) hi = mid;
        else lo = mid;
      }
    }
    const lm = luminance(toRgb(h + drift, s, l0)) > 0.3 ? lo : l0;
    out = {
      hi: hex(toRgb(h + 10, Math.min(1, s + 0.04), clamp(Math.max(l0, lm + 0.14), 0, 0.84))),
      mid: hex(toRgb(h + drift, s, lm)),
      deep: hex(toRgb(h + drift - 16, s * 0.88, lm * 0.42)),
      deepLight: hex(toRgb(h + drift - 14, s * 0.92, lm * 0.74)),
      glow: hex(rgb),
    };
  }
  PALETTES.set(color, out);
  return out;
}

/* ───────────────────────── components ───────────────────────── */

type Tier = 'xs' | 'sm' | 'md' | 'lg';
const tierFor = (size: number): Tier => (size <= 18 ? 'xs' : size <= 30 ? 'sm' : size <= 48 ? 'md' : 'lg');

/**
 * Optical sizing: tiny badges draw the glyph bigger and bolder, big badges
 * give it air. Returns the ink box (px, parity-matched to the badge so it sits
 * on whole pixels) and the stroke width in 24-grid units.
 */
function optics(size: number) {
  const ratio = clamp(0.56 + (40 - size) * 0.008, 0.56, 0.78);
  let ink = Math.round(size * ratio);
  if ((size - ink) % 2) ink += 1;
  const stroke = clamp(1.6 + (30 - size) * 0.035, 1.6, 2.25);
  return { ink, stroke: Math.round(stroke * 100) / 100 };
}

/** Where the orbit node sits (deterministic per sigil, so marks feel individual). */
const NODE_T = [-0.62, 0.38, 2.5, 3.6];

export interface ProjectSigilProps {
  /** `Project.icon` — sigil id, legacy emoji or anything (mapped by `sigilIdFor`). */
  icon: string;
  /** Project colour (hex preferred). */
  color: string;
  /** Badge size in px. Crisp from 14px (inline meta) to 72px (headers). */
  size?: number;
  shape?: 'squircle' | 'hex';
  className?: string;
  /** Accessible name. Omit when the project name is already next to it. */
  title?: string;
  style?: CSSProperties;
}

/** Holographic project badge: gradient plate, inner glow, orbit arc, glowing ink, hover sheen. */
export function ProjectSigil({ icon, color, size = 28, shape = 'squircle', className, title, style }: ProjectSigilProps) {
  const id = sigilIdFor(icon);
  const tier = tierFor(size);
  const pal = palette(color || '#a78bfa');
  const { ink, stroke } = optics(size);
  const seed = hash(id);
  const t = NODE_T[seed % NODE_T.length];
  // orbit: ellipse in a 100×100 box, tilted −28°
  const rx = 47;
  const ry = 16.5;
  const rot = (-28 * Math.PI) / 180;
  const ux = rx * Math.cos(t);
  const uy = ry * Math.sin(t);
  const nx = 50 + ux * Math.cos(rot) - uy * Math.sin(rot);
  const ny = 50 + ux * Math.sin(rot) + uy * Math.cos(rot);
  const nodeR = ((tier === 'lg' ? 2.1 : 1.55) * 100) / size;
  const vars = {
    '--sg-size': `${size}px`,
    '--sg-hi': pal.hi,
    '--sg-mid': pal.mid,
    '--sg-deep': pal.deep,
    '--sg-deep-l': pal.deepLight,
    '--sg-glow': pal.glow,
    ...style,
  } as CSSProperties;
  return (
    <span
      className={className ? `sigil ${className}` : 'sigil'}
      data-sigil={id}
      data-tier={tier}
      data-shape={shape}
      style={vars}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      <span className="sigil__plate">
        {tier !== 'xs' && (
          <svg className="sigil__orbit" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style={{ width: '100%', height: '100%' }}>
            {shape === 'hex' && <polygon className="sigil__rim" points="50,1.5 92,25.75 92,74.25 50,98.5 8,74.25 8,25.75" />}
            <g className="sigil__spin">
              <ellipse className="sigil__ring" cx="50" cy="50" rx={rx} ry={ry} transform="rotate(-28 50 50)" />
              {tier === 'lg' && <ellipse className="sigil__ring sigil__ring--far" cx="50" cy="50" rx={rx - 9} ry={ry + 22} transform="rotate(34 50 50)" />}
              <circle className="sigil__node" cx={nx.toFixed(2)} cy={ny.toFixed(2)} r={nodeR.toFixed(2)} />
            </g>
          </svg>
        )}
      </span>
      <svg className="sigil__ink" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: ink, height: ink }}>
        <g className="sg-art" style={{ strokeWidth: stroke }}>
          {ART[id]}
        </g>
      </svg>
    </span>
  );
}

export interface SigilGlyphProps {
  /** Sigil id (or any legacy value). */
  id: string;
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  title?: string;
}

/**
 * The bare line icon — `currentColor` ink, accent from `--ico-accent` — for
 * pickers, template cards, menus and empty states.
 */
export function SigilGlyph({ id, size = 24, strokeWidth = 1.6, className, title }: SigilGlyphProps) {
  const sid = sigilIdFor(id);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className ? `sg-glyph ${className}` : 'sg-glyph'}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-sigil={sid}
    >
      {ART[sid]}
    </svg>
  );
}
