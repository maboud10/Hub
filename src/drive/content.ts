/**
 * Content helpers: deterministic fallback previews for files without stored content,
 * a markdown-lite block parser for docs, flattening for search/Nova, and line diffs.
 */
import type { ArtMotif, Content, Item, Slide } from './types';
import { hashStr } from './meta';

const MOTIFS: ArtMotif[] = ['mesh', 'orbit', 'wave', 'grid', 'bloom'];

const pick = <T,>(arr: T[], seed: number) => arr[seed % arr.length];
const num = (seed: number, lo: number, hi: number) => lo + (seed % (hi - lo + 1));

function base(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

function fallbackDoc(item: Item): string {
  const title = base(item.name);
  const n = item.name.toLowerCase();
  const intro = item.description ?? `Working notes for “${title}”.`;
  if (/postmortem/.test(n))
    return `# ${title}\n\n## Impact\nCustomer-facing latency above SLO for 23 minutes.\n\n## Timeline\n- Alert fired on p99 latency\n- Mitigation: traffic shifted to the secondary region\n- Recovery confirmed by synthetic probes\n\n## Action items\n1. Add per-tenant limits (RFC-0042)\n2. Dashboard for queue depth\n3. Game day in December`;
  if (/runbook|upgrade/.test(n))
    return `# ${title}\n\n${intro}\n\n## Before you start\n- [x] Announce the window in #platform\n- [ ] Snapshot etcd and verify the backup\n\n## Steps\n1. Drain one node pool at a time\n2. Upgrade control plane, then workers\n3. Run the smoke suite\n\n## Rollback\nRestore the snapshot and re-pin the previous version.`;
  if (/offer/.test(n))
    return `# ${title}\n\n## Role\nSenior Backend Engineer · Platform · Dubai\n\n## Compensation\n- Base salary: to be confirmed after calibration\n- Equity: standard L5 grant\n\n> Draft — do not send until approved by People Ops.`;
  if (/case/.test(n))
    return `# ${title}\n\n## Challenge\nOnboarding 1,200 drivers across 4 countries with paper forms.\n\n## Solution\nHelix NEXUS with HR Portal journeys and Drive for document collection.\n\n## Results\n- Time to first shift: 9 days → 3 days\n- 94% of documents collected digitally`;
  if (/calibration|notes/.test(n))
    return `# ${title}\n\n${intro}\n\n## Highlights\n- Strong delivery on the rate limiter\n- Needs more visible design reviews\n\n## Follow-ups\n- [ ] Share calibration summary with HR\n- [ ] Book growth conversations`;
  if (/mfa|rollout|plan/.test(n))
    return `# ${title}\n\n${intro}\n\n## Phases\n1. Admins and finance — done\n2. Engineering — in progress\n3. Everyone else by December 15\n\n## Risks\n- Legacy VPN clients without push support`;
  if (/case er|timeline/.test(n)) return `# ${title}\n\nConfidential case notes. Access is limited to named People Ops partners.`;
  return `# ${title}\n\n${intro}\n\n## Summary\nThis document captures the current thinking, open questions and next steps.\n\n## Next steps\n- [ ] Review with stakeholders\n- [ ] Finalise and share`;
}

function fallbackSheet(item: Item): string[][] {
  const n = item.name.toLowerCase();
  const h = hashStr(item.id);
  if (/budget|opex|variance|forecast|cost|vendor/.test(n)) {
    const rows = [['Line', 'Jul', 'Aug', 'Sep', 'Q3 total', 'Plan', 'Variance']];
    ['Salaries', 'Contractors', 'Cloud', 'Software', 'Travel', 'Facilities'].forEach((l, i) => {
      const a = num(h + i * 7, 40, 420) * 1000;
      rows.push([l, String(a), String(Math.round(a * 1.03)), String(Math.round(a * 0.98)), `=SUM(B${i + 2}:D${i + 2})`, String(Math.round(a * 3.05)), `=E${i + 2}-F${i + 2}`]);
    });
    rows.push(['Total', '=SUM(B2:B7)', '=SUM(C2:C7)', '=SUM(D2:D7)', '=SUM(E2:E7)', '=SUM(F2:F7)', '=SUM(G2:G7)']);
    return rows;
  }
  if (/survey|results|responses|phishing/.test(n)) {
    const rows = [['Question', 'Responses', 'Favourable', 'Score']];
    ['I know what is expected of me', 'I have the tools I need', 'I would recommend Helix', 'My manager supports my growth', 'Onboarding set me up to succeed'].forEach((q, i) => {
      const r = num(h + i, 60, 140);
      const f = num(h + i * 3, 55, 92);
      rows.push([q, String(r), `${f}%`, `=ROUND(C${i + 2}*5,1)`]);
    });
    return rows;
  }
  if (/hiring|headcount/.test(n)) {
    return [
      ['Role', 'Team', 'Quarter', 'Status', 'Hiring manager'],
      ['Senior Backend Engineer', 'Platform', 'Q1', 'Interviewing', 'Omar Khalid'],
      ['SRE', 'Platform', 'Q1', 'Approved', 'Omar Khalid'],
      ['Product Designer', 'Design', 'Q2', 'Planned', 'Mei Tanaka'],
      ['Account Executive', 'Sales', 'Q1', 'Offer out', 'Aisha Bello'],
      ['Data Engineer', 'Data', 'Q2', 'Planned', 'Omar Khalid'],
    ];
  }
  if (/access review/.test(n)) {
    return [
      ['System', 'Owner', 'Users', 'Reviewed', 'Revoked'],
      ['Production AWS', 'Lucas Meyer', '14', 'Yes', '2'],
      ['Payroll Console', 'Grace Liu', '6', 'Yes', '0'],
      ['Drive — Finance', 'Grace Liu', '9', 'Yes', '1'],
      ['GitHub org', 'Omar Khalid', '41', 'In progress', '—'],
    ];
  }
  if (/comp|band/.test(n)) {
    return [
      ['Level', 'Min (AED)', 'Mid (AED)', 'Max (AED)', 'Spread'],
      ['L3', '18000', '22000', '26000', '=ROUND((D2-B2)/B2*100,0)'],
      ['L4', '24000', '29000', '34000', '=ROUND((D3-B3)/B3*100,0)'],
      ['L5', '31000', '37500', '44000', '=ROUND((D4-B4)/B4*100,0)'],
      ['L6', '40000', '48000', '56000', '=ROUND((D5-B5)/B5*100,0)'],
    ];
  }
  if (/bench/.test(n)) {
    return [
      ['Scenario', 'p50 (ms)', 'p99 (ms)', 'Throughput (rps)'],
      ['Single region', '0.4', '1.9', '182000'],
      ['Cross region', '0.7', '4.8', '121000'],
      ['Failover', '0.9', '7.2', '96000'],
    ];
  }
  const rows = [['Item', 'Owner', 'Status', 'Due']];
  ['Kick-off', 'Draft', 'Review', 'Sign-off'].forEach((t, i) => rows.push([t, pick(['Mei Tanaka', 'Omar Khalid', 'Priya Raman', 'Sara Al Mansoori'], h + i), pick(['Done', 'In progress', 'Not started'], h + i * 5), `Nov ${10 + i * 4}`]));
  return rows;
}

function fallbackSlides(item: Item): Slide[] {
  const title = base(item.name);
  const h = hashStr(item.id);
  return [
    { kind: 'title', title, body: [item.description ?? 'Helix'] },
    { kind: 'bullets', title: 'Context', body: ['Where we are today', 'What changed this quarter', 'What we need from you'] },
    { kind: 'stat', title: 'Headline', stat: `${num(h, 12, 94)}%`, body: ['improvement since last review'] },
    { kind: 'bullets', title: 'Next steps', body: ['Agree owners', 'Share notes in Pulse Chat', 'Check in next week'] },
  ];
}

export function fallbackContent(item: Item): Content | null {
  const h = hashStr(item.id);
  switch (item.kind) {
    case 'doc':
    case 'text':
      return { type: 'doc', text: fallbackDoc(item) };
    case 'sheet':
      return { type: 'sheet', rows: fallbackSheet(item) };
    case 'slides':
      return { type: 'slides', slides: fallbackSlides(item) };
    case 'pdf':
      return {
        type: 'pdf',
        pages: [
          { heading: base(item.name), body: [item.description ?? 'Prepared for internal use at Helix.', 'This document summarises scope, findings and recommendations.'] },
          { heading: 'Details', body: ['Section 1 describes the current state and the evidence we collected.', 'Section 2 lists recommendations in priority order.'] },
          { heading: 'Appendix', body: ['Glossary, contacts and change history.'] },
        ],
      };
    case 'image':
      return { type: 'image', hue: h % 360, motif: pick(MOTIFS, h >> 3), w: 1600, h: 1000 };
    case 'video':
    case 'audio':
      return { type: 'media', duration: 60 + (h % 2400), hue: h % 360 };
    case 'code':
      return { type: 'code', lang: 'text', text: `// ${item.name}\n// No preview stored for this file.` };
    case 'archive':
      return {
        type: 'archive',
        entries: [
          { path: 'README.txt', size: 2048 },
          { path: `${base(item.name)}/part-1.pdf`, size: 1_200_000 + (h % 900_000) },
          { path: `${base(item.name)}/part-2.pdf`, size: 900_000 + (h % 700_000) },
        ],
      };
    default:
      return null;
  }
}

export const contentOf = (item: Item): Content | null => item.content ?? fallbackContent(item);

/* ------------------------------------------------------------------ */
/* Markdown-lite                                                       */
/* ------------------------------------------------------------------ */

export type Block =
  | { t: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { t: 'hr' }
  | { t: 'ul' | 'ol'; items: { text: string; checked?: boolean }[] }
  | { t: 'table'; rows: string[][] }
  | { t: 'code'; text: string };

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push({ t: 'code', text: buf.join('\n') });
      continue;
    }
    if (/^---+$/.test(t)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (h) {
      out.push({ t: (['h1', 'h2', 'h3'] as const)[h[1].length - 1], text: h[2] });
      i++;
      continue;
    }
    if (t.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push({ t: 'table', rows });
      continue;
    }
    if (/^[-*]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
      const ordered = /^\d+[.)]\s+/.test(t);
      const items: { text: string; checked?: boolean }[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(l) : /^[-*]\s+(.*)$/.exec(l);
        if (!m) break;
        const cb = /^\[( |x|X)\]\s+(.*)$/.exec(m[1]);
        items.push(cb ? { text: cb[2], checked: cb[1].toLowerCase() === 'x' } : { text: m[1] });
        i++;
      }
      out.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const buf: string[] = [t];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\||[-*]\s|\d+[.)]\s|```|---)/.test(lines[i].trim())) buf.push(lines[i++].trim());
    out.push({ t: 'p', text: buf.join(' ') });
  }
  return out;
}

export type Inline = { t: 'text' | 'b' | 'i' | 'code' | 'mention'; v: string };

/** **bold**, *italic*, `code`, @Full Name mentions. */
export function parseInline(text: string, names: string[] = []): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|@[A-Z][\p{L}'-]+(?:\s[A-Z][\p{L}'-]+)?)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ t: 'text', v: text.slice(last, idx) });
    const s = m[0];
    if (s.startsWith('**')) out.push({ t: 'b', v: s.slice(2, -2) });
    else if (s.startsWith('`')) out.push({ t: 'code', v: s.slice(1, -1) });
    else if (s.startsWith('@')) {
      const name = s.slice(1);
      const full = names.find((n) => n === name) ?? names.find((n) => n.startsWith(name.split(' ')[0]) && name.includes(' ') === n.includes(' '));
      out.push(full || !names.length ? { t: 'mention', v: name } : { t: 'text', v: s });
    } else out.push({ t: 'i', v: s.slice(1, -1) });
    last = idx + s.length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/** Flatten content to plain text (search, Nova, classification). */
export function contentText(c: Content | null | undefined): string {
  if (!c) return '';
  switch (c.type) {
    case 'doc':
    case 'code':
      return c.text;
    case 'sheet':
      return c.rows.map((r) => r.join(' ')).join('\n');
    case 'slides':
      return c.slides.map((s) => [s.title, s.stat ?? '', ...(s.body ?? [])].join(' ')).join('\n');
    case 'pdf':
      return c.pages.map((p) => [p.heading, ...p.body].join(' ')).join('\n');
    case 'archive':
      return c.entries.map((e) => e.path).join('\n');
    default:
      return '';
  }
}

/** Line-level diff stats between two texts (LCS on lines, capped for speed). */
export function diffStats(a: string, b: string): { added: number; removed: number } {
  const x = a.split('\n').slice(0, 600);
  const y = b.split('\n').slice(0, 600);
  const m = x.length;
  const n = y.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const common = dp[0][0];
  return { added: n - common, removed: m - common };
}

/** Line diff for previewing a version against the current text. */
export function diffLines(a: string, b: string): { t: 'same' | 'add' | 'del'; text: string }[] {
  const x = a.split('\n').slice(0, 600);
  const y = b.split('\n').slice(0, 600);
  const m = x.length;
  const n = y.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: 'same' | 'add' | 'del'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) {
      out.push({ t: 'same', text: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', text: x[i++] });
    else out.push({ t: 'add', text: y[j++] });
  }
  while (i < m) out.push({ t: 'del', text: x[i++] });
  while (j < n) out.push({ t: 'add', text: y[j++] });
  return out;
}

/** Approximate size in bytes of content (for versions created in-app). */
export function contentBytes(c: Content | null | undefined): number {
  const t = contentText(c);
  return Math.max(512, new Blob([t]).size);
}
