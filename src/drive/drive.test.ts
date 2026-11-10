/**
 * Helix Drive — engine, parser, sheet, risk, store and bridge tests.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_USERS } from '@/data/users';
import { SEED_ROLES } from '@/data/roles';
import type { User } from '@/types';
import { createDriveSeed } from './seed';
import {
  audience,
  buildCtx,
  capsOf,
  checkGrant,
  checkLabelChange,
  checkLink,
  effectiveAccess,
  explainDenied,
  reasonText,
  roleViewer,
  viewerOf,
  xray,
  type EngineCtx,
} from './access';
import { DAY } from './meta';
import { matchItem, parseQuery, removeChip } from './query';
import { evaluateSheet, parseRef, toNumber } from './sheet';
import { findRisks } from './risk';
import { classify, explainAccess, summarize } from './nova';
import { diffStats, parseBlocks } from './content';

// In-memory localStorage so the persist middleware works under Node.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

const NOW = Date.now();
const user = (id: string) => SEED_USERS.find((u) => u.id === id) as User;
const V = (id: string) => viewerOf(user(id), SEED_ROLES);
let ctx: EngineCtx;
const acc = (uid: string, itemId: string, c: EngineCtx = ctx) => effectiveAccess(c, V(uid), c.item.get(itemId) as NonNullable<ReturnType<typeof c.item.get>>);

beforeEach(() => {
  ctx = buildCtx(createDriveSeed(NOW), SEED_USERS, SEED_ROLES, NOW);
});

/* ================================================================== */
describe('permission engine', () => {
  it('gives u-alex time-boxed editor access to the shared Prism folder', () => {
    const a = acc('u-alex', 'fo-prism-fe');
    expect(a.level).toBe('editor');
    expect(reasonText(a.primary!)).toBe('Editor — shared with you on this folder');
    expect(a.primary!.expiresAt).toBeGreaterThan(NOW + 44 * DAY);
    expect(a.primary!.expiresAt).toBeLessThan(NOW + 46 * DAY);
  });

  it('cascades folder shares to descendants with a folder reason', () => {
    const a = acc('u-alex', 'df-prism-button');
    expect(a.level).toBe('editor');
    expect(a.primary!.source).toBe('folder');
    expect(reasonText(a.primary!)).toBe('Editor — shared with you on folder Prism frontend kit');
    expect(acc('u-alex', 'df-prism-iconset').level).toBe('editor');
  });

  it('keeps contractors out of everything else (and explains DLP blocks)', () => {
    expect(acc('u-alex', 'df-prism-spec').level).toBe('none');
    expect(acc('u-alex', 'df-rfc-ratelimit').level).toBe('none');
    const sec = acc('u-alex', 'df-prism-secreview');
    expect(sec.level).toBe('none');
    expect(sec.inactive[0].status).toBe('blocked');
    expect(explainDenied(sec)).toMatch(/^Blocked by DLP — Confidential items are off-limits to contractors/);
  });

  it('explains role and department access on shared drives', () => {
    const omar = acc('u-omar', 'df-rfc-ratelimit');
    expect(omar.level).toBe('manager');
    expect(omar.reasons.map(reasonText)).toContain('Editor — via Engineering role on shared drive Engineering');
    const aisha = acc('u-aisha', 'df-prism-spec');
    expect(aisha.level).toBe('commenter');
    expect(reasonText(aisha.primary!)).toBe('Commenter — via Product department on shared drive Design');
    expect(acc('u-mei', 'df-prism-spec').level).toBe('owner');
    expect(acc('u-hana', 'df-prism-spec').level).toBe('editor');
  });

  it('enforces Restricted: named people only, no download, watermark', () => {
    const oct = acc('u-daniel', 'df-payroll-oct');
    expect(oct.level).toBe('viewer');
    const caps = capsOf(ctx, oct);
    expect(caps.download).toBe(false);
    expect(caps.watermark).toBe(true);
    const sep = acc('u-daniel', 'df-payroll-sep');
    expect(sep.level).toBe('none');
    expect(sep.inactive.some((r) => r.status === 'blocked' && /named people/.test(r.note ?? ''))).toBe(true);
    // Daniel can still browse the Confidential payroll folder through his department
    expect(acc('u-daniel', 'fo-payroll').level).toBe('editor');
  });

  it('gives governance admins manager on shared drives but not personal drives', () => {
    const a = acc('u-layla', 'df-payroll-sep');
    expect(a.level).toBe('manager');
    expect(a.primary!.source).toBe('admin');
    expect(acc('u-layla', 'df-mei-notes').level).toBe('none');
    expect(acc('u-omar', 'df-mei-notes').level).toBe('commenter');
  });

  it('restricting inherited access cuts drive & folder grants except drive managers', () => {
    const data = createDriveSeed(NOW);
    data.items = data.items.map((i) => (i.id === 'fo-platform' ? { ...i, inherit: false } : i));
    const c2 = buildCtx(data, SEED_USERS, SEED_ROLES, NOW);
    const lucas = acc('u-lucas', 'df-rfc-ratelimit', c2);
    expect(lucas.level).toBe('none');
    expect(lucas.inactive.some((r) => r.status === 'cut')).toBe(true);
    const priya = acc('u-priya', 'df-rfc-ratelimit', c2);
    expect(priya.level).toBe('owner');
    const omar = acc('u-omar', 'df-capacity-q4', c2);
    expect(omar.level).toBe('manager');
    expect(omar.primary!.keep).toBe(true);
  });

  it('expired grants stop working and show as expired', () => {
    const a = acc('u-lucas', 'df-pentest-q3');
    expect(a.level).toBe('none');
    expect(a.inactive.some((r) => r.status === 'expired')).toBe(true);
    expect(acc('u-omar', 'df-pentest-q3').level).toBe('viewer');
  });

  it('link access works but is not discoverable', () => {
    const pitch = acc('u-alex', 'df-pitch-2025');
    expect(pitch.level).toBe('viewer');
    expect(pitch.discoverable).toBe(false);
    expect(reasonText(pitch.primary!)).toBe('Viewer — via link (anyone with the link)');
    const pol = acc('u-alex', 'df-sec-policy');
    expect(pol.level).toBe('viewer');
    expect(pol.primary!.scope).toBe('org');
  });

  it('DLP checks explain why a share or link is blocked and how to fix it', () => {
    const pricing = ctx.item.get('df-pricing')!;
    const link = checkLink(ctx, pricing, 'anyone');
    expect(link.ok).toBe(false);
    if (!link.ok) expect(link.reason).toMatch(/can’t have public links/);
    expect(checkLink(ctx, pricing, 'org').ok).toBe(true);
    const payroll = ctx.item.get('df-payroll-oct')!;
    const role = checkGrant(ctx, payroll, { type: 'role', id: 'finance' }, NOW + 5 * DAY);
    expect(role.ok).toBe(false);
    if (!role.ok) expect(role.reason).toMatch(/named people/);
    const forever = checkGrant(ctx, payroll, { type: 'user', id: 'u-priya' }, null);
    expect(forever.ok).toBe(false);
    if (!forever.ok) expect(forever.clampDays).toBe(30);
    expect(checkGrant(ctx, payroll, { type: 'user', id: 'u-priya' }, NOW + 20 * DAY).ok).toBe(true);
    const contractor = checkGrant(ctx, ctx.item.get('df-budget-2027')!, { type: 'user', id: 'u-alex' }, null);
    expect(contractor.ok).toBe(false);
    if (!contractor.ok) expect(contractor.reason).toMatch(/contractor/);
  });

  it('label downgrades need a justification', () => {
    expect(checkLabelChange('confidential', 'internal').ok).toBe(false);
    expect(checkLabelChange('confidential', 'internal', 'Numbers are now public in the annual report').ok).toBe(true);
    expect(checkLabelChange('internal', 'restricted').ok).toBe(true);
  });

  it('builds an Access X-Ray with rings, groups and statuses', () => {
    const nodes = xray(ctx, ctx.item.get('df-prism-spec')!);
    expect(nodes.find((n) => n.ring === 'owner')?.name).toBe('Mei Tanaka');
    const design = nodes.find((n) => n.name === 'Design department');
    expect(design?.ring).toBe('inherited');
    expect(design?.members).toBeGreaterThanOrEqual(2);
    expect(nodes.find((n) => n.name === 'Product department')?.level).toBe('commenter');
    const pentest = xray(ctx, ctx.item.get('df-pentest-q3')!);
    expect(pentest.find((n) => n.name === 'Lucas Meyer')?.status).toBe('expired');
    expect(pentest.find((n) => n.name === 'Engineering role')?.status).toBe('blocked');
  });

  it('computes audiences and previews role viewers', () => {
    const a = audience(ctx, ctx.item.get('df-pricing')!);
    expect(a.people.length).toBeGreaterThan(10);
    expect(a.blocked).toBeGreaterThanOrEqual(1); // contractors blocked on a Confidential item
    const contractor = roleViewer('contractor', SEED_ROLES);
    expect(effectiveAccess(ctx, contractor, ctx.item.get('df-handbook-2026')!).level).toBe('viewer');
    expect(effectiveAccess(ctx, contractor, ctx.item.get('df-pricing')!).level).toBe('none');
  });
});

/* ================================================================== */
describe('spotlight query parser', () => {
  const qctx = {
    users: SEED_USERS.map((u) => ({ id: u.id, name: u.name })),
    drives: [
      { id: 'drv-design', name: 'Design' },
      { id: 'drv-eng', name: 'Engineering' },
      { id: 'drv-company', name: 'Helix Library' },
    ],
    me: 'u-mei',
    now: NOW,
  };

  it('parses “pdfs from daniel last month”', () => {
    const q = parseQuery('pdfs from daniel last month', qctx);
    expect(q.kinds).toEqual(['pdf']);
    expect(q.owners).toEqual(['u-daniel']);
    expect(q.modified?.label).toBe('Last month');
    expect(q.terms).toEqual([]);
    expect(q.modified!.to).toBeLessThanOrEqual(NOW);
  });

  it('parses labels, kinds, flags, locations and sizes', () => {
    const a = parseQuery('confidential sheets', qctx);
    expect(a.labels).toEqual(['confidential']);
    expect(a.kinds).toEqual(['sheet']);
    const b = parseQuery('shared with me this week', qctx);
    expect(b.sharedWithMe).toBe(true);
    expect(b.modified?.label).toBe('This week');
    const c = parseQuery('images in design', qctx);
    expect(c.kinds).toEqual(['image']);
    expect(c.driveIds).toEqual(['drv-design']);
    const d = parseQuery('videos over 100mb', qctx);
    expect(d.minSize).toBe(100 * 1024 * 1024);
    expect(parseQuery('my docs', qctx).owners).toEqual(['u-mei']);
    expect(parseQuery('in helix library', qctx).driveIds).toEqual(['drv-company']);
  });

  it('supports key:value syntax and free text', () => {
    const q = parseQuery('type:pdf label:restricted is:starred budget', qctx);
    expect(q.kinds).toEqual(['pdf']);
    expect(q.labels).toEqual(['restricted']);
    expect(q.starred).toBe(true);
    expect(q.terms).toEqual(['budget']);
  });

  it('removes a recognised chip from the text', () => {
    const q = parseQuery('pdfs from daniel last month', qctx);
    const owner = q.chips.find((c) => c.kind === 'owner')!;
    expect(removeChip(q, owner)).toBe('pdfs last month');
  });

  it('matches items with highlights', () => {
    const base = { kind: 'sheet' as const, ownerId: 'u-daniel', label: 'confidential' as const, updatedAt: NOW - DAY, driveId: 'drv-fin', size: 1000, extra: ['budget'], sharedWithMe: false, starred: false };
    const m = matchItem({ ...base, name: 'FY2027 budget — master' }, parseQuery('budget', qctx));
    expect(m).not.toBeNull();
    expect(m!.hits.length).toBe(6);
    expect(matchItem({ ...base, name: 'FY2027 budget — master' }, parseQuery('roadmap', qctx))).toBeNull();
    expect(matchItem({ ...base, name: 'FY2027 budget — master' }, parseQuery('confidential sheets', qctx))).not.toBeNull();
    expect(matchItem({ ...base, name: 'FY2027 budget — master' }, parseQuery('pdfs', qctx))).toBeNull();
  });
});

/* ================================================================== */
describe('sheet engine', () => {
  it('evaluates refs, ranges and functions', () => {
    const v = evaluateSheet([
      ['A', 'B', 'C'],
      ['1', '2', '=A2+B2*2'],
      ['3', '4', '=SUM(A2:B3)'],
      ['', '', '=ROUND(AVERAGE(A2:A3)/3,2)'],
      ['', '', '=MAX(C2:C3)-MIN(A2:B3)'],
    ]);
    expect(v[1][2].value).toBe('5');
    expect(v[2][2].value).toBe('10');
    expect(v[3][2].value).toBe('0.67');
    expect(v[4][2].num).toBe(9);
  });
  it('reports errors and cycles', () => {
    const v = evaluateSheet([['=A1+1', '=1/0', '=NOPE(1)', '=B4']]);
    expect(v[0][0].value).toBe('#CYCLE!');
    expect(v[0][1].value).toBe('#DIV/0!');
    expect(v[0][2].value).toBe('#NAME?');
    expect(v[0][3].value).toBe('0');
  });
  it('parses numbers and refs', () => {
    expect(toNumber('$12,400')).toBe(12400);
    expect(toNumber('12%')).toBe(0.12);
    expect(toNumber('(1,200)')).toBe(-1200);
    expect(parseRef('AB12')).toEqual({ r: 11, c: 27 });
  });
  it('computes the seeded budget totals', () => {
    const rows = createDriveSeed(NOW).items.find((i) => i.id === 'df-budget-2027')!.content as { type: 'sheet'; rows: string[][] };
    const v = evaluateSheet(rows.rows);
    expect(v[9][5].num).toBe(v.slice(1, 9).reduce((s, r) => s + (r[5].num ?? 0), 0));
  });
});

/* ================================================================== */
describe('risk radar & Nova', () => {
  it('finds every seeded oversharing pattern with a fix', () => {
    const f = findRisks(ctx);
    expect(f.find((x) => x.kind === 'org-wide-confidential' && x.itemId === 'df-pricing')?.fix).toMatchObject({ type: 'remove-share', hostId: 'df-pricing' });
    expect(f.find((x) => x.kind === 'restricted-stale' && x.itemId === 'df-pentest-q3')).toBeTruthy();
    expect(f.find((x) => x.kind === 'restricted-long' && x.itemId === 'df-pentest-q3')?.fix).toMatchObject({ type: 'clamp-expiry', days: 30 });
    expect(f.find((x) => x.kind === 'stale-public-link' && x.itemId === 'df-pitch-2025')).toBeTruthy();
    const c = f.find((x) => x.kind === 'contractor-confidential' && x.itemId === 'df-prism-secreview');
    expect(c?.state).toBe('dormant');
    expect(c?.fix).toEqual({ type: 'move-out', itemId: 'df-prism-secreview', toParentId: null });
  });

  it('classifies, summarises and explains from real content', () => {
    expect(classify(ctx.item.get('df-payroll-oct')!).label).toBe('restricted');
    expect(classify(ctx.item.get('df-pm-1102')!).label).toBe('confidential');
    const s = summarize(ctx.item.get('df-prism-spec')!);
    expect(s.bullets.join(' ')).toMatch(/Tokens/);
    const sheet = summarize(ctx.item.get('df-budget-2027')!);
    expect(sheet.headline).toMatch(/9 rows/);
    expect(explainAccess(ctx, ctx.item.get('df-prism-spec')!)).toMatch(/can find and open/);
  });

  it('parses docs and diffs versions', () => {
    const b = parseBlocks('# T\n\n- [x] a\n- [ ] b\n\n| x | y |\n| --- | --- |\n| 1 | 2 |');
    expect(b.map((x) => x.t)).toEqual(['h1', 'ul', 'table']);
    expect(diffStats('a\nb\nc', 'a\nc\nd\ne')).toEqual({ added: 2, removed: 1 });
  });
});

/* ================================================================== */
describe('store & bridge (server-side enforcement)', () => {
  type Hub = typeof import('@/store/hub').useHub;
  type Drive = typeof import('./store').useDrive;
  let useHub: Hub;
  let useDrive: Drive;
  let bridge: typeof import('./public').api;
  let currentViewer: typeof import('@/lib/appBridge').currentViewer;
  const as = (id: string) => {
    const r = useHub.getState().login(id);
    expect(r.ok).toBe(true);
  };
  const item = (id: string) => useDrive.getState().items.find((i) => i.id === id)!;

  beforeAll(async () => {
    ({ useHub } = await import('@/store/hub'));
    ({ useDrive } = await import('./store'));
    ({ api: bridge } = await import('./public'));
    ({ currentViewer } = await import('@/lib/appBridge'));
  });
  beforeEach(() => {
    useHub.getState().resetDemo();
    useDrive.getState().resetDemo();
  });

  it('renames, moves (with revert) and blocks moving a folder into itself', () => {
    as('u-omar');
    const s = useDrive.getState();
    expect(s.rename('df-capacity-q4', 'Capacity plan — Q4 v2').ok).toBe(true);
    expect(item('df-capacity-q4').name).toBe('Capacity plan — Q4 v2');
    const m = s.move(['df-oncall'], { driveId: 'drv-eng', parentId: 'fo-platform' });
    expect(m.ok).toBe(true);
    expect(item('df-oncall').parentId).toBe('fo-platform');
    if (m.ok) m.revert();
    expect(item('df-oncall').parentId).toBeNull();
    const bad = useDrive.getState().move(['fo-prism-fe'], { driveId: 'drv-eng', parentId: 'fo-prism-icons' });
    expect(bad.ok).toBe(false);
  });

  it('denies edits without access and logs the attempt', () => {
    as('u-alex');
    const r = useDrive.getState().rename('df-rfc-ratelimit', 'hacked');
    expect(r.ok).toBe(false);
    expect(useHub.getState().audit[0]).toMatchObject({ action: 'drive.item.rename', outcome: 'denied' });
    expect(useDrive.getState().upload({ driveId: 'drv-eng', parentId: null }, [{ name: 'x.txt', size: 3, mime: 'text/plain', text: 'hey' }]).ok).toBe(false);
    const up = useDrive.getState().upload({ driveId: 'drv-eng', parentId: 'fo-prism-fe' }, [{ name: 'notes.md', size: 9, mime: 'text/markdown', text: '# Notes\n' }, { name: 'data.csv', size: 12, mime: 'text/csv', text: 'a,b\n1,2\n' }]);
    expect(up.ok).toBe(true);
    if (up.ok) {
      const csv = item(up.ids[1]);
      expect(csv.kind).toBe('sheet');
      expect(csv.content).toEqual({ type: 'sheet', rows: [['a', 'b'], ['1', '2']] });
    }
  });

  it('trash supports undo; legal hold blocks delete and purge', () => {
    as('u-omar');
    const t = useDrive.getState().trash(['df-oncall']);
    expect(t.ok).toBe(true);
    expect(item('df-oncall').trashed).not.toBeNull();
    if (t.ok) t.revert();
    expect(item('df-oncall').trashed).toBeNull();
    as('u-sara');
    const held = useDrive.getState().trash(['df-er-notes']);
    expect(held.ok).toBe(false);
    if (!held.ok) expect(held.error).toMatch(/legal hold/);
    expect(useDrive.getState().purge(['fo-er-cases']).ok).toBe(false);
  });

  it('applies DLP on share and notifies recipients', () => {
    as('u-omar');
    const blocked = useDrive.getState().share('df-prism-secreview', [{ principal: { type: 'user', id: 'u-alex' }, level: 'viewer', expiresAt: null }]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/contractor/);
    const okr = useDrive.getState().share('df-capacity-q4', [{ principal: { type: 'user', id: 'u-mei' }, level: 'viewer', expiresAt: null }], { message: 'For the roadmap sync' });
    expect(okr.ok).toBe(true);
    expect(useHub.getState().notifications.find((n) => n.userId === 'u-mei' && /shared “Capacity plan/.test(n.title))?.link).toBe('/drive/file/df-capacity-q4');
    expect(useDrive.getState().setLink('df-capacity-q4', { scope: 'anyone', level: 'viewer' }).ok).toBe(true);
  });

  it('runs the access request flow end to end', () => {
    as('u-alex');
    expect(useDrive.getState().requestAccess('df-prism-spec', 'editor', 'Adding the token migration appendix').ok).toBe(true);
    expect(useDrive.getState().requests.filter((r) => r.itemId === 'df-prism-spec' && r.status === 'pending').length).toBe(1);
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-mei' && n.kind === 'request')).toBe(true);
    as('u-omar');
    expect(useDrive.getState().decideRequest('dr-alex-prism', 'approve').ok).toBe(false); // not a manager of the Design file
    as('u-mei');
    const r = useDrive.getState().decideRequest('dr-alex-prism', 'approve', { level: 'editor', expiresAt: Date.now() + 30 * DAY });
    expect(r.ok).toBe(true);
    expect(useDrive.getState().requests.find((x) => x.id === 'dr-alex-prism')?.status).toBe('approved');
    as('u-alex');
    const v = currentViewer()!;
    expect(bridge.getFile(v, 'df-prism-spec')?.name).toBe('Prism v4 Component Spec');
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-alex' && /Access granted/.test(n.title))).toBe(true);
  });

  it('label downgrade requires justification and writes a warning audit entry', () => {
    as('u-daniel');
    expect(useDrive.getState().setLabel(['df-budget-2027'], 'internal').ok).toBe(false);
    const r = useDrive.getState().setLabel(['df-budget-2027'], 'internal', 'Envelope numbers were published at the all-hands');
    expect(r.ok).toBe(true);
    expect(useHub.getState().audit.find((a) => a.action === 'drive.label.downgrade')).toMatchObject({ severity: 'warning', target: 'FY2027 budget — master' });
  });

  it('saves versions, restores them and notifies mentions', () => {
    as('u-omar');
    const before = item('df-prism-migration').versions.length;
    const s1 = useDrive.getState().saveContent('df-prism-migration', { type: 'doc', text: '# Token migration plan\n\nRewritten.' }, 'Rewrite');
    expect(s1.ok).toBe(true);
    expect(item('df-prism-migration').versions.length).toBe(before + 1);
    const first = item('df-prism-migration').versions[0];
    expect(useDrive.getState().restoreVersion('df-prism-migration', first.id).ok).toBe(false); // seed v1 has no snapshot
    const v3 = item('df-prism-migration').versions[before - 1];
    expect(useDrive.getState().restoreVersion('df-prism-migration', v3.id).ok).toBe(true);
    expect(item('df-prism-migration').versions.at(-1)?.summary).toBe(`Restored v${v3.n}`);
    const c = useDrive.getState().addThread('df-prism-migration', '@Priya Raman can you double-check the codemod numbers?');
    expect(c.ok && c.mentioned).toEqual(['u-priya']);
    expect(useHub.getState().notifications.some((n) => n.userId === 'u-priya' && /mentioned you/.test(n.title))).toBe(true);
  });

  it('restricts governance to drive.manage and applies risk fixes', () => {
    as('u-omar');
    expect(useDrive.getState().setRule('confidential', { contractors: true }).ok).toBe(false);
    expect(useDrive.getState().fixFinding({ type: 'disable-link', itemId: 'df-pitch-2025' }).ok).toBe(false);
    as('u-layla');
    expect(useDrive.getState().fixFinding({ type: 'disable-link', itemId: 'df-pitch-2025' }).ok).toBe(true);
    expect(item('df-pitch-2025').link.scope).toBe('restricted');
    expect(useDrive.getState().setHold({ itemId: 'fo-budgets' }, true, 'Audit FY26').ok).toBe(true);
    as('u-daniel');
    expect(useDrive.getState().trash(['df-opex-q3']).ok).toBe(false);
  });

  it('bridge search and palette respect permissions', () => {
    as('u-alex');
    const alex = currentViewer()!;
    expect(bridge.searchFiles(alex, 'payroll').length).toBe(0);
    expect(bridge.getFile(alex, 'df-payroll-oct')).toBeNull();
    const entries = bridge.paletteEntries(alex);
    expect(entries.some((e) => e.id === 'drive:governance')).toBe(false);
    expect(entries.some((e) => e.id === 'drive:file:df-prism-button')).toBe(true);
    expect(entries.some((e) => e.id === 'drive:file:df-prism-spec')).toBe(false);
    expect(entries.some((e) => e.id === 'drive:file:df-pitch-2025')).toBe(false); // link-only isn't discoverable
    as('u-daniel');
    const dan = currentViewer()!;
    const hits = bridge.searchFiles(dan, 'payroll export', 10).map((f) => f.id);
    expect(hits).toContain('df-payroll-oct');
    expect(hits).not.toContain('df-payroll-sep');
    expect(bridge.searchFiles(dan, '', 5).length).toBe(5);
    as('u-layla');
    expect(bridge.paletteEntries(currentViewer()!).some((e) => e.id === 'drive:governance')).toBe(true);
  });
});
