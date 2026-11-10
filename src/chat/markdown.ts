/**
 * Markdown-lite for Pulse Chat (pure — no React).
 *
 * Blocks : paragraphs (single newlines become line breaks), ``` fenced code ```, `>` quotes,
 *          `-`/`*`/`•` bullet lists, `1.` ordered lists.
 * Inline : `code`, **bold**, _italic_ / *italic*, ~~strike~~ / ~strike~, [label](url), bare URLs,
 *          @handle mentions, @here / @channel / @everyone, #channel references, :shortcodes:.
 */
import { EMOJI_BY_CODE } from './emoji';

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b' | 'i' | 's'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'mention'; userId: string; handle: string }
  | { t: 'special'; v: 'here' | 'channel' }
  | { t: 'channel'; convId: string; name: string }
  | { t: 'emoji'; v: string; code: string };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][]; start: number }
  | { t: 'pre'; v: string; lang?: string };

export interface ParseContext {
  /** handle (lowercase, no @) → user id */
  resolveUser?: (handle: string) => string | undefined;
  /** channel name (no #) → conversation id */
  resolveChannel?: (name: string) => string | undefined;
}

const isAlnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i;

/* ---------------------------------------------------------------- inline */

export function parseInline(src: string, ctx: ParseContext = {}, allowLinks = true): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf });
      buf = '';
    }
  };
  const push = (n: Inline) => {
    flush();
    out.push(n);
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const prev = i > 0 ? src[i - 1] : undefined;

    // backslash escapes
    if (ch === '\\' && i + 1 < src.length && /[\\`*_~#@[\]:]/.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    // `code`
    if (ch === '`') {
      const j = src.indexOf('`', i + 1);
      if (j > i + 1) {
        push({ t: 'code', v: src.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }

    // [label](href)
    if (ch === '[' && allowLinks) {
      const close = src.indexOf('](', i + 1);
      const end = close === -1 ? -1 : src.indexOf(')', close + 2);
      if (close > i + 1 && end > close + 2) {
        const href = src.slice(close + 2, end).trim();
        if (SAFE_HREF.test(href) && !/\s/.test(href)) {
          push({ t: 'link', href, c: parseInline(src.slice(i + 1, close), ctx, false) });
          i = end + 1;
          continue;
        }
      }
    }

    // bare URLs
    if (allowLinks && (ch === 'h' || ch === 'H') && !isAlnum(prev) && /^https?:\/\//i.test(src.slice(i, i + 8))) {
      const m = /^https?:\/\/[^\s<>"]+/i.exec(src.slice(i));
      if (m) {
        let url = m[0];
        // trim trailing punctuation, keep balanced parentheses
        while (/[.,!?;:'"\]]$/.test(url) || (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0))) url = url.slice(0, -1);
        push({ t: 'link', href: url, c: [{ t: 'text', v: url.replace(/^https?:\/\//i, '') }] });
        i += url.length;
        continue;
      }
    }

    // emphasis: ** ~~ then * _ ~
    if (ch === '*' || ch === '_' || ch === '~') {
      const pairs: [string, 'b' | 'i' | 's'][] =
        ch === '*' ? [['**', 'b'], ['*', 'i']] : ch === '_' ? [['__', 'b'], ['_', 'i']] : [['~~', 's'], ['~', 's']];
      let matched = false;
      for (const [marker, type] of pairs) {
        if (!src.startsWith(marker, i) || isAlnum(prev)) continue;
        const start = i + marker.length;
        if (start >= src.length || /\s/.test(src[start]) || src.startsWith(marker[0], start)) continue;
        let j = src.indexOf(marker, start + 1);
        while (j !== -1) {
          const before = src[j - 1];
          const after = src[j + marker.length];
          const doubled = marker.length === 1 && (src[j + 1] === marker || before === marker);
          if (!/\s/.test(before) && !isAlnum(after) && !doubled) break;
          j = src.indexOf(marker, j + 1);
        }
        if (j !== -1) {
          push({ t: type, c: parseInline(src.slice(start, j), ctx, allowLinks) });
          i = j + marker.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // @mentions
    if (ch === '@' && !isAlnum(prev) && prev !== '.' && prev !== '_') {
      const m = /^@([a-z0-9][a-z0-9._-]*)/i.exec(src.slice(i));
      if (m) {
        let handle = m[1].toLowerCase();
        while (/[._-]$/.test(handle)) handle = handle.slice(0, -1);
        if (handle === 'here' || handle === 'channel' || handle === 'everyone') {
          push({ t: 'special', v: handle === 'here' ? 'here' : 'channel' });
          i += 1 + handle.length;
          continue;
        }
        const userId = ctx.resolveUser?.(handle);
        if (userId) {
          push({ t: 'mention', userId, handle });
          i += 1 + handle.length;
          continue;
        }
      }
    }

    // #channel
    if (ch === '#' && (i === 0 || /[\s(([{“"']/.test(prev ?? ''))) {
      const m = /^#([a-z0-9][a-z0-9_-]*)/i.exec(src.slice(i));
      if (m) {
        let name = m[1].toLowerCase();
        while (/[-_]$/.test(name)) name = name.slice(0, -1);
        const convId = ctx.resolveChannel?.(name);
        if (convId) {
          push({ t: 'channel', convId, name });
          i += 1 + name.length;
          continue;
        }
      }
    }

    // :shortcode:
    if (ch === ':') {
      const m = /^:([a-z0-9_+-]{1,40}):/i.exec(src.slice(i));
      if (m) {
        const e = EMOJI_BY_CODE.get(m[1].toLowerCase());
        if (e) {
          push({ t: 'emoji', v: e, code: m[1].toLowerCase() });
          i += m[0].length;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/* ---------------------------------------------------------------- blocks */

const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;

export function parseBlocks(text: string, ctx: ParseContext = {}): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const c: Inline[] = [];
    para.forEach((ln, idx) => {
      if (idx) c.push({ t: 'br' });
      c.push(...parseInline(ln, ctx));
    });
    blocks.push({ t: 'p', c });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // fenced code
    if (trimmed.startsWith('```')) {
      flushPara();
      // single-line ```code```
      if (trimmed.length > 6 && trimmed.endsWith('```') && trimmed.indexOf('```', 3) === trimmed.length - 3) {
        blocks.push({ t: 'pre', v: trimmed.slice(3, -3) });
        i += 1;
        continue;
      }
      const lang = trimmed.slice(3).trim() || undefined;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push({ t: 'pre', v: body.join('\n'), lang: lang && /^[\w+-]{1,20}$/.test(lang) ? lang : undefined });
      continue;
    }

    // quote
    if (/^\s{0,3}>/.test(line)) {
      flushPara();
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      blocks.push({ t: 'quote', c: parseBlocks(body.join('\n'), ctx) });
      continue;
    }

    // lists
    if (BULLET.test(line)) {
      flushPara();
      const items: Inline[][] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(parseInline(BULLET.exec(lines[i])![1], ctx));
        i += 1;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (ORDERED.test(line)) {
      flushPara();
      const items: Inline[][] = [];
      const start = Number(ORDERED.exec(line)![1]);
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(parseInline(ORDERED.exec(lines[i])![2], ctx));
        i += 1;
      }
      blocks.push({ t: 'ol', items, start });
      continue;
    }

    if (!trimmed) {
      flushPara();
      i += 1;
      continue;
    }
    para.push(line);
    i += 1;
  }
  flushPara();
  return blocks;
}

/* ---------------------------------------------------------------- cache */

const caches = new WeakMap<ParseContext, Map<string, Block[]>>();
const defaultCtx: ParseContext = {};

/** Memoised `parseBlocks` (per context object). */
export function parseCached(text: string, ctx: ParseContext = defaultCtx): Block[] {
  let cache = caches.get(ctx);
  if (!cache) {
    cache = new Map();
    caches.set(ctx, cache);
  }
  const hit = cache.get(text);
  if (hit) return hit;
  const blocks = parseBlocks(text, ctx);
  if (cache.size > 3000) cache.clear();
  cache.set(text, blocks);
  return blocks;
}

/* ---------------------------------------------------------------- plain text */

export interface PlainOptions {
  userName?: (userId: string) => string;
}

function inlineText(nodes: Inline[], o: PlainOptions): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
          return n.v;
        case 'br':
          return ' ';
        case 'code':
          return n.v;
        case 'b':
        case 'i':
        case 's':
        case 'link':
          return inlineText(n.c, o);
        case 'mention':
          return `@${o.userName?.(n.userId) ?? n.handle}`;
        case 'special':
          return `@${n.v}`;
        case 'channel':
          return `#${n.name}`;
        case 'emoji':
          return n.v;
      }
    })
    .join('');
}

function blocksText(blocks: Block[], o: PlainOptions): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'p':
          return inlineText(b.c, o);
        case 'quote':
          return blocksText(b.c, o);
        case 'ul':
        case 'ol':
          return b.items.map((it) => inlineText(it, o)).join(' · ');
        case 'pre':
          return b.v;
      }
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Flatten markdown-lite to a single line of plain text (previews, search, notifications). */
export function toPlainText(text: string, ctx: ParseContext = defaultCtx, o: PlainOptions = {}): string {
  return blocksText(parseCached(text, ctx), o);
}

/* ---------------------------------------------------------------- mentions */

/** Fast mention scan (ignores code). Returns lowercase handles plus `here` / `channel`. */
export function mentionHandles(text: string): string[] {
  const stripped = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const out = new Set<string>();
  const re = /(^|[^\p{L}\p{N}._])@([a-z0-9][a-z0-9._-]*)/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    let h = m[2].toLowerCase();
    while (/[._-]$/.test(h)) h = h.slice(0, -1);
    out.add(h === 'everyone' ? 'channel' : h);
  }
  return [...out];
}

/** Does `text` mention `handle` (directly, or via @here/@channel when `includeBroadcast`)? */
export function mentions(text: string, handle: string | undefined, includeBroadcast = true): boolean {
  if (!text.includes('@')) return false;
  const hs = mentionHandles(text);
  return (!!handle && hs.includes(handle)) || (includeBroadcast && (hs.includes('here') || hs.includes('channel')));
}

/* ---------------------------------------------------------------- emoji-only */

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** 1–3 emoji and nothing else → render jumbo. */
export function isEmojiOnly(text: string): boolean {
  const t = text.replace(/:([a-z0-9_+-]{1,40}):/gi, (m, code: string) => EMOJI_BY_CODE.get(code.toLowerCase()) ?? m).replace(/\s+/g, '');
  if (!t || t.length > 40) return false;
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|\u200d|\ufe0f|\u20e3)+$/u.test(t)) return false;
  if (/^[\d#*]+$/.test(t)) return false;
  const count = segmenter ? [...segmenter.segment(t)].length : (t.match(/\p{Extended_Pictographic}/gu)?.length ?? 0);
  return count >= 1 && count <= 3;
}

/** Replace `:shortcodes:` with emoji (used when sending). */
export function replaceShortcodes(text: string): string {
  return text.replace(/(^|[^`]):([a-z0-9_+-]{1,40}):/gi, (m, pre: string, code: string) => {
    const e = EMOJI_BY_CODE.get(code.toLowerCase());
    return e ? `${pre}${e}` : m;
  });
}
