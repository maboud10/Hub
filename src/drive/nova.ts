/**
 * Nova (deterministic, local AI) for Drive: summaries, label suggestions (DLP classifier),
 * share suggestions, plain-language access explanations and share-message drafts.
 * Everything is computed from the real item data — no canned text.
 */
import type { Item, Level, Sensitivity } from './types';
import { DAY, KIND_NAME, LABEL_NAME, LABEL_RANK, formatBytes, hashStr } from './meta';
import { audience, childrenOf, effectiveAccess, xray, type EngineCtx } from './access';
import { contentOf, contentText, parseBlocks } from './content';
import { evaluateSheet } from './sheet';

export interface Summary {
  headline: string;
  bullets: string[];
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function summarize(item: Item): Summary {
  const c = contentOf(item);
  if (!c) return { headline: `${KIND_NAME[item.kind]} · ${formatBytes(item.size)}. No preview content to summarise.`, bullets: [] };
  switch (c.type) {
    case 'doc': {
      const blocks = parseBlocks(c.text);
      const heads = blocks.filter((b): b is { t: 'h2'; text: string } => b.t === 'h2').map((b) => b.text);
      const lists = blocks.filter((b): b is { t: 'ul' | 'ol'; items: { text: string; checked?: boolean }[] } => b.t === 'ul' || b.t === 'ol');
      const checks = lists.flatMap((l) => l.items).filter((i) => i.checked !== undefined);
      const done = checks.filter((i) => i.checked).length;
      const para = blocks.find((b): b is { t: 'p'; text: string } => b.t === 'p' && !/^(owner|author|severity|classification|candidate|applies)/i.test(b.text));
      const words = c.text.split(/\s+/).filter(Boolean).length;
      const bullets: string[] = [];
      if (heads.length) bullets.push(`Covers ${heads.slice(0, 5).join(', ')}${heads.length > 5 ? ` and ${heads.length - 5} more` : ''}.`);
      if (checks.length) bullets.push(`${done} of ${checks.length} checklist items done${checks.length - done ? ` — open: ${checks.filter((i) => !i.checked).slice(0, 2).map((i) => i.text.replace(/\*\*/g, '')).join('; ')}` : ''}.`);
      const firstList = lists.find((l) => l.items.length && l.items[0].checked === undefined);
      if (firstList) bullets.push(`Key points: ${firstList.items.slice(0, 3).map((i) => i.text.replace(/\*\*|`/g, '')).join(' · ')}.`);
      const lead = para ? para.text.replace(/\*\*|`/g, '').split(/(?<=\.)\s/)[0] : `${plural(heads.length, 'section')}, ${words} words.`;
      return { headline: `${lead} (${words} words, ~${Math.max(1, Math.round(words / 220))} min read)`, bullets };
    }
    case 'sheet': {
      const vals = evaluateSheet(c.rows);
      const header = c.rows[0] ?? [];
      const body = vals.slice(1);
      const totalRow = body.find((r) => /total/i.test(r[0]?.value ?? '') || /total/i.test(r[1]?.value ?? ''));
      const numericCols = header.map((_, ci) => ci).filter((ci) => body.filter((r) => r[ci]?.num !== null && r[ci]?.num !== undefined).length >= Math.max(1, Math.floor(body.length / 2)));
      const lastNum = numericCols[numericCols.length - 1];
      const bullets: string[] = [];
      if (totalRow && lastNum !== undefined) bullets.push(`${header[lastNum] || 'Total'}: ${totalRow[lastNum]?.value} in the totals row.`);
      if (lastNum !== undefined) {
        const rows = body.filter((r) => r !== totalRow && r[lastNum]?.num !== null && r[lastNum]?.num !== undefined);
        const top = [...rows].sort((a, b) => (b[lastNum].num as number) - (a[lastNum].num as number))[0];
        if (top) bullets.push(`Highest ${header[lastNum] || 'value'}: ${top[0]?.value || top[1]?.value} (${top[lastNum].value}).`);
      }
      const formulas = vals.flat().filter((v) => v.formula).length;
      const errors = vals.flat().filter((v) => v.error).length;
      if (formulas) bullets.push(`${plural(formulas, 'formula')} computed${errors ? `, ${errors} with errors` : ', all clean'}.`);
      return { headline: `${plural(body.length, 'row')} × ${plural(header.length, 'column')}: ${header.slice(0, 4).join(', ')}${header.length > 4 ? '…' : ''}.`, bullets };
    }
    case 'slides': {
      const stats = c.slides.filter((s) => s.stat);
      return {
        headline: `${plural(c.slides.length, 'slide')} — “${c.slides[0]?.title ?? item.name}”.`,
        bullets: [
          `Flow: ${c.slides.map((s) => s.title.replace(/[“”]/g, '')).slice(0, 5).join(' → ')}.`,
          ...stats.slice(0, 2).map((s) => `Headline number: ${s.stat} — ${s.title}${s.body?.[0] ? ` (${s.body[0]})` : ''}.`),
        ],
      };
    }
    case 'code': {
      const lines = c.text.split('\n');
      const exports = [...c.text.matchAll(/export\s+(?:const|function|interface|type|class|default function)\s+(\w+)/g)].map((m) => m[1]);
      const fns = [...c.text.matchAll(/function\s+(\w+)|(\w+)\s*=\s*\(/g)].map((m) => m[1] ?? m[2]).filter(Boolean);
      const todo = lines.filter((l) => /TODO|FIXME/.test(l)).length;
      return {
        headline: `${c.lang === 'text' ? 'Text' : c.lang} · ${plural(lines.length, 'line')}.`,
        bullets: [exports.length ? `Exports ${exports.slice(0, 5).join(', ')}.` : fns.length ? `Defines ${[...new Set(fns)].slice(0, 5).join(', ')}.` : `First line: ${lines[0]?.slice(0, 80)}`, todo ? `${plural(todo, 'TODO')} left in the file.` : 'No TODOs left.'],
      };
    }
    case 'pdf':
      return { headline: `${plural(c.pages.length, 'page')}: ${c.pages.map((p) => p.heading).join(' · ')}.`, bullets: c.pages.slice(0, 3).map((p) => `${p.heading}: ${p.body[0] ?? ''}`) };
    case 'image':
      return { headline: `Image${c.w ? ` · ${c.w}×${c.h}` : ''} · ${formatBytes(item.size)}.`, bullets: [c.src ? 'Uploaded original is stored for preview.' : 'Preview generated from the file metadata.'] };
    case 'media':
      return { headline: `${item.kind === 'audio' ? 'Audio' : 'Video'} · ${mmss(c.duration)} · ${formatBytes(item.size)}.`, bullets: c.chapters?.length ? [`Chapters: ${c.chapters.join(' → ')}.`] : [] };
    case 'archive':
      return { headline: `${plural(c.entries.length, 'file')} in the archive (${formatBytes(c.entries.reduce((s, e) => s + e.size, 0))} uncompressed).`, bullets: c.entries.slice(0, 3).map((e) => e.path) };
  }
}

/* ---------------- label suggestions (DLP classifier) ---------------- */

const RESTRICTED_RX = /\b(salary|salaries|payroll|iban|bank account|passport|emirates id|national id|ssn|medical|offer of employment|net pay|base \(aed\)|compensation bands?|er-\d{4}-\d+|wps)\b/gi;
const CONFIDENTIAL_RX = /\b(confidential|revenue|forecast|pricing|discount|budget|board|incident|postmortem|vulnerabilit(?:y|ies)|pen-?test|xss|contracts?|runway|burn|margin|arr|renewals?|calibration|headcount|participant|unsanitised)\b/gi;
const PUBLIC_RX = /\b(press kit|press|case study|brand guidelines|boilerplate|fact sheet|public)\b/gi;

export interface LabelSuggestion {
  label: Sensitivity;
  confidence: number;
  signals: string[];
  reason: string;
}

export function classify(item: Item): LabelSuggestion {
  const text = `${item.name}\n${item.description ?? ''}\n${item.tags.join(' ')}\n${contentText(contentOf(item))}`;
  const count = (rx: RegExp) => {
    const m = text.match(rx) ?? [];
    const by = new Map<string, number>();
    for (const x of m) by.set(x.toLowerCase(), (by.get(x.toLowerCase()) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  };
  const r = count(RESTRICTED_RX);
  const c = count(CONFIDENTIAL_RX);
  const p = count(PUBLIC_RX);
  const sig = (arr: [string, number][]) => arr.slice(0, 4).map(([w, n]) => (n > 1 ? `“${w}” ×${n}` : `“${w}”`));
  const hits = (arr: [string, number][]) => arr.reduce((s, [, n]) => s + n, 0);
  if (hits(r) >= 2 || (hits(r) >= 1 && /payroll|offer|salary|compensation/i.test(item.name)))
    return { label: 'restricted', confidence: Math.min(0.97, 0.7 + hits(r) * 0.04), signals: sig(r), reason: `Personal or pay data detected (${sig(r).join(', ')}).` };
  if (hits(c) >= 2) return { label: 'confidential', confidence: Math.min(0.94, 0.62 + hits(c) * 0.04), signals: sig(c), reason: `Business-sensitive terms (${sig(c).join(', ')}).` };
  if (hits(p) >= 1 && hits(c) === 0) return { label: 'public', confidence: 0.7, signals: sig(p), reason: `Looks like public-facing material (${sig(p).join(', ')}).` };
  return { label: 'internal', confidence: 0.66, signals: [], reason: 'No sensitive patterns found — standard internal content.' };
}

/** Only worth surfacing when Nova would make it stricter (or clearly safer for public material). */
export function shouldSuggest(item: Item, s: LabelSuggestion) {
  return s.label !== item.label && (LABEL_RANK[s.label] > LABEL_RANK[item.label] || (s.label === 'public' && item.label === 'internal'));
}

/* ---------------- share suggestions ---------------- */

export function suggestPeople(ctx: EngineCtx, item: Item, viewerId: string, limit = 3): { userId: string; reason: string }[] {
  const aud = new Set(audience(ctx, item).people.map((p) => p.id));
  const scores = new Map<string, { score: number; reason: string }>();
  const bump = (id: string, score: number, reason: string) => {
    if (id === viewerId || aud.has(id)) return;
    const u = ctx.user.get(id);
    if (!u || !u.active) return;
    const cur = scores.get(id);
    if (!cur || score > cur.score) scores.set(id, { score: (cur?.score ?? 0) + score, reason });
    else cur.score += score * 0.3;
  };
  const siblings = item.parentId ? childrenOf(ctx, item.driveId, item.parentId) : ctx.items.filter((i) => i.driveId === item.driveId && !i.trashed);
  const counts = new Map<string, number>();
  for (const s of siblings) for (const a of s.activity) if (a.at > ctx.now - 30 * DAY && (a.verb === 'version' || a.verb === 'created' || a.verb === 'uploaded')) counts.set(a.by, (counts.get(a.by) ?? 0) + 1);
  const where = item.parentId ? (ctx.item.get(item.parentId)?.name ?? 'this folder') : (ctx.drive.get(item.driveId)?.name ?? 'this drive');
  for (const [id, n] of counts) bump(id, 10 + n * 6, `Edited ${plural(n, 'file')} in ${where} this month`);
  for (const t of item.threads) {
    bump(t.by, 30, 'Commented on this file');
    for (const m of t.text.matchAll(/@([A-Z][\p{L}'-]+)(?:\s([A-Z][\p{L}'-]+))?/gu)) {
      const u = ctx.users.find((x) => x.name === `${m[1]}${m[2] ? ` ${m[2]}` : ''}` || x.name.split(' ')[0] === m[1]);
      if (u) bump(u.id, 34, 'Mentioned in the comments');
    }
  }
  const owner = ctx.user.get(item.ownerId);
  if (owner) for (const u of ctx.users) if (u.department === owner.department && u.id !== owner.id) bump(u.id, 6, `In ${owner.department} with ${owner.name.split(' ')[0]}`);
  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([userId, v]) => ({ userId, reason: v.reason }));
}

/* ---------------- explanations & drafts ---------------- */

export function explainAccess(ctx: EngineCtx, item: Item): string {
  const aud = audience(ctx, item);
  const nodes = xray(ctx, item);
  const active = nodes.filter((n) => n.status === 'active' && n.ring !== 'owner' && n.key !== 'admin');
  const named = active.filter((n) => n.principal?.type === 'user').length;
  const groups = active.filter((n) => n.principal && n.principal.type !== 'user');
  const biggest = [...groups].sort((a, b) => b.members - a.members)[0];
  const blocked = nodes.filter((n) => n.status === 'blocked');
  const expired = nodes.filter((n) => n.status === 'expired');
  const cut = nodes.filter((n) => n.status === 'cut');
  const parts: string[] = [];
  parts.push(`${plural(aud.people.length, 'person')} can find and open this ${item.kind === 'folder' ? 'folder' : 'file'}${aud.editors ? `, ${aud.editors} of them can edit` : ''}.`);
  if (biggest) parts.push(`Most access comes from the ${biggest.name} (${plural(biggest.members, 'person')}) via ${biggest.host}.`);
  if (named) parts.push(`${plural(named, 'named share')} on top of that.`);
  if (aud.link !== 'restricted') parts.push(aud.link === 'anyone' ? 'Anyone with the link can open it — including people outside Helix.' : 'Anyone at Helix with the link can open it.');
  if (blocked.length) parts.push(`${LABEL_NAME[item.label]} label is blocking ${plural(blocked.length, 'path')}: ${blocked.slice(0, 2).map((b) => `${b.name} (${b.note})`).join('; ')}.`);
  const excluded = active.reduce((s, n) => s + n.excluded, 0);
  if (excluded) parts.push(`${plural(excluded, 'contractor')} in those groups ${excluded === 1 ? 'is' : 'are'} excluded by DLP.`);
  if (expired.length) parts.push(`${plural(expired.length, 'grant')} expired and no longer work${expired.length === 1 ? 's' : ''}.`);
  if (cut.length) parts.push(`Inherited access is restricted, so ${plural(cut.length, 'parent grant')} ${cut.length === 1 ? 'doesn’t' : 'don’t'} apply.`);
  return parts.join(' ');
}

export function draftShareMessage(item: Item, names: string[], level: Level, sender: string): string {
  const who = names.length === 0 ? 'there' : names.length === 1 ? names[0].split(' ')[0] : names.length === 2 ? `${names[0].split(' ')[0]} and ${names[1].split(' ')[0]}` : 'all';
  const ask =
    level === 'editor' || level === 'manager'
      ? pickBy(item.id, ['Feel free to edit directly — Time Machine keeps every version.', 'Could you add your part directly in the file?', 'Edit away; I’ll review the changes tomorrow.'])
      : level === 'commenter'
        ? pickBy(item.id, ['Comments welcome — @mention me if anything is unclear.', 'Could you leave your feedback as comments?'])
        : pickBy(item.id, ['Sharing for context — no action needed.', 'Have a look when you get a chance.']);
  const label = LABEL_RANK[item.label] >= 2 ? ` It’s ${LABEL_NAME[item.label]} — please keep it need-to-know.` : '';
  return `Hi ${who} — sharing “${item.name}” with you. ${ask}${label} Thanks, ${sender.split(' ')[0]}`;
}

function pickBy<T>(seed: string, arr: T[]): T {
  return arr[hashStr(seed) % arr.length];
}

/* ---------------- home insights ---------------- */

export interface Suggestion {
  item: Item;
  reason: string;
  by?: string;
  at: number;
}

export function suggestionsFor(ctx: EngineCtx, viewer: { id: string; name: string }, recentIds: Set<string>, limit = 6): Suggestion[] {
  const v = ctx.viewers.find((x) => x.id === viewer.id);
  if (!v) return [];
  const first = viewer.name.split(' ')[0];
  const out: (Suggestion & { score: number })[] = [];
  for (const item of ctx.items) {
    if (item.kind === 'folder' || item.trashed) continue;
    const a = effectiveAccess(ctx, v, item);
    if (!a.discoverable) continue;
    let best: (Suggestion & { score: number }) | null = null;
    const consider = (score: number, reason: string, at: number, by?: string) => {
      if (!best || score > best.score) best = { item, reason, at, by, score };
    };
    for (const t of item.threads) {
      const msgs = [t, ...t.replies];
      for (const m of msgs) if (m.by !== viewer.id && (m.text.includes(`@${viewer.name}`) || m.text.includes(`@${first} `)) && m.at > ctx.now - 14 * DAY) consider(90 - (ctx.now - m.at) / DAY, 'Mentioned you', m.at, m.by);
      if (item.ownerId === viewer.id && !t.resolved) {
        const last = msgs[msgs.length - 1];
        if (last.by !== viewer.id && last.at > ctx.now - 7 * DAY) consider(70 - (ctx.now - last.at) / DAY, 'New comment on your file', last.at, last.by);
      }
    }
    const direct = a.reasons.find((r) => r.source === 'item' && r.principal?.type === 'user');
    if (direct && item.ownerId !== viewer.id) {
      const sh = item.shares.find((s) => s.id === direct.shareId);
      if (sh && sh.at > ctx.now - 14 * DAY) consider(60 - (ctx.now - sh.at) / DAY, 'Shared with you', sh.at, sh.by);
    }
    const edit = item.activity.find((x) => (x.verb === 'version' || x.verb === 'uploaded' || x.verb === 'created') && x.by !== viewer.id);
    if (edit && edit.at > ctx.now - 4 * DAY) consider((recentIds.has(item.id) ? 46 : 26) - (ctx.now - edit.at) / DAY * 4, recentIds.has(item.id) ? 'Updated since you opened it' : 'Active in your spaces', edit.at, edit.by);
    if (best) out.push(best);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

export function storageByKind(ctx: EngineCtx, ownerId: string): { kind: Item['kind']; bytes: number }[] {
  const by = new Map<Item['kind'], number>();
  for (const i of ctx.items) if (i.ownerId === ownerId && i.kind !== 'folder') by.set(i.kind, (by.get(i.kind) ?? 0) + i.size);
  return [...by.entries()].map(([kind, bytes]) => ({ kind, bytes })).sort((a, b) => b.bytes - a.bytes);
}
