/**
 * "Ask about access" — the Control deck's Nova engine (UI: ./AccessNova).
 *
 * A deterministic, local Q&A engine: it answers questions about people, apps,
 * roles, requests, grants and the audit trail straight from the hub store — no
 * network, no model. Intent comes from keywords, entities from names (people,
 * apps, roles), and every answer respects the asker's Control Center scope
 * (e.g. audit questions need `hub.audit.view`).
 */
import type { AccessRequest, AuditEntry, Grant, HubApp, RequestStatus, Role, User } from '@/types';
import { appPermissionId } from '@/data/permissions';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import {
  canReviewRequest,
  clearanceOf,
  DURATION_LABEL,
  effectivePermissions,
  explainAccess,
  hasPermission,
  isGrantActive,
  primaryRole,
  type PermissionSet,
} from '@/lib/rbac';
import { firstName, pluralize, relativeTime } from '@/lib/format';
import { adminHref } from './adminTabs';
import { DAY, permLabel, startOfDay, type ChipTone } from './shared';

const MAX_ROWS = 6;

export interface NovaScope {
  users: boolean;
  review: boolean;
  audit: boolean;
  apps: boolean;
  roles: boolean;
}

export interface NovaContext {
  users: User[];
  roles: Role[];
  apps: HubApp[];
  requests: AccessRequest[];
  audit: AuditEntry[];
  now: number;
  meId?: string;
  /** The asker's effective permissions (delegated review checks). */
  myPerms: PermissionSet;
  can: NovaScope;
}

export type NovaIntent =
  | 'check'
  | 'app-access'
  | 'person-requests'
  | 'person-activity'
  | 'person'
  | 'denied'
  | 'denied-requests'
  | 'expiring'
  | 'pending'
  | 'admins'
  | 'permanent'
  | 'inactive'
  | 'role'
  | 'locked'
  | 'help';

export interface NovaRow {
  key: string;
  /** Avatar. */
  user?: User;
  /** App icon (when there's no person). */
  app?: HubApp;
  /** Fallback glyph. */
  glyph?: 'event' | 'denied' | 'role';
  title: string;
  meta: string;
  chip?: { label: string; tone: ChipTone };
}

export interface NovaAnswer {
  intent: NovaIntent;
  tone: 'app' | 'success' | 'warning' | 'danger';
  title: string;
  /** One or two sentences, streamed in by the UI. */
  summary: string;
  rows: NovaRow[];
  /** Matches beyond the rows shown. */
  more: number;
  facts: Array<{ label: string; value: string | number }>;
  links: Array<{ label: string; to: string }>;
  followUps: string[];
}

// ─────────────────────────── suggestions ───────────────────────────

/** Prompt chips for the console, filtered by what the asker may see. */
export function novaSuggestions(can: NovaScope): string[] {
  const out = ['Who can open Payroll?'];
  if (can.review || can.users) out.push('What did Alex request?');
  out.push(can.audit ? 'Show denied attempts today' : 'Show pending requests');
  out.push('Which grants expire this week?', 'Who has full access?');
  return out;
}

// ─────────────────────────── text helpers ───────────────────────────

/** Lower-case, accent-free, punctuation-free, padded with spaces for whole-word tests. */
export function normalize(s: string): string {
  const flat = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[^a-z0-9*]+/g, ' ')
    .trim();
  return ` ${flat} `;
}

const hasWord = (q: string, ...words: string[]) => words.some((w) => q.includes(` ${w} `));
const test = (q: string, re: RegExp) => re.test(q);

const clip = (s: string, n = 72) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function listNames(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (!shown.length) return '';
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

function windowOf(q: string, now: number, fallbackDays: number): { since: number; label: string } {
  if (hasWord(q, 'today')) return { since: startOfDay(now), label: 'today' };
  if (hasWord(q, 'yesterday')) return { since: startOfDay(now) - DAY, label: 'since yesterday' };
  if (test(q, / (24h|24 hours?|last day|past day) /)) return { since: now - DAY, label: 'in the last 24 hours' };
  if (test(q, / (week|7 days|7d|seven days) /)) return { since: now - 7 * DAY, label: 'in the last 7 days' };
  if (test(q, / (month|30 days|30d) /)) return { since: now - 30 * DAY, label: 'in the last 30 days' };
  return { since: now - fallbackDays * DAY, label: `in the last ${fallbackDays} days` };
}

// ─────────────────────────── entities ───────────────────────────

const GENERIC_APP_WORDS = new Set(['console', 'portal', 'center', 'centre', 'command', 'base', 'hub', 'app', 'the', 'and']);

export function findApp(q: string, apps: HubApp[]): HubApp | undefined {
  let best: { app: HubApp; score: number } | undefined;
  for (const app of apps) {
    const name = normalize(app.name).trim();
    const cands: Array<[string, number]> = [
      [name, 100 + name.length],
      [app.id.toLowerCase(), 60],
    ];
    for (const tok of name.split(' ')) if (tok.length >= 4 && !GENERIC_APP_WORDS.has(tok)) cands.push([tok, 40 + tok.length]);
    for (const [c, score] of cands) if (c && q.includes(` ${c} `) && (!best || score > best.score)) best = { app, score };
  }
  return best?.app;
}

export function findUser(q: string, users: User[], meId?: string): User | undefined {
  let best: { u: User; score: number } | undefined;
  for (const u of users) {
    const parts = normalize(u.name).trim().split(' ');
    const cands: Array<[string, number]> = [[parts.join(' '), 100]];
    if (parts[0] && parts[0].length >= 3) cands.push([parts[0], 50]);
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    if (last.length >= 3) cands.push([last, 40]);
    for (const [c, score] of cands) if (q.includes(` ${c} `) && (!best || score > best.score)) best = { u, score };
  }
  if (best) return best.u;
  if (meId && hasWord(q, 'i', 'me', 'my', 'mine', 'myself')) return users.find((u) => u.id === meId);
  return undefined;
}

export function findRole(q: string, roles: Role[]): Role | undefined {
  let best: { r: Role; score: number } | undefined;
  for (const r of roles) {
    const n = normalize(r.name).trim();
    if (!n) continue;
    if ((q.includes(` ${n} `) || q.includes(` ${n}s `)) && (!best || n.length > best.score)) best = { r, score: n.length };
  }
  return best?.r;
}

// ─────────────────────────── engine ───────────────────────────

const STATUS_CHIP: Record<RequestStatus, { label: string; tone: ChipTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  denied: { label: 'Denied', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

const RE_DENIED = / (denied|deny|denies|denial|denials|blocked|block|blocks|rejected|reject|failed|fail|violations?|boundary) /;
const RE_REQUEST = / (request|requests|requested|asked|ask for|apply|applied|wants?) /;
const RE_ACTIVITY = / (did|done|do|change|changed|changes|activity|actions?|audit|log|events?|history) /;
const RE_EXPIRING = / (expire|expires|expiring|expiry|expiration|lapse|lapsing|renew|renewal|ending) /;
const RE_PENDING = / (pending|waiting|queue|queued|awaiting|backlog|open requests?|to review) /;
const RE_ADMINS = / (super ?admins?|system admins?|admins?|administrators?|full access|wildcard|god mode|\*) /;
const RE_PERMANENT = / (permanent|standing|never expire|forever) /;
const RE_INACTIVE = / (deactivated|inactive|disabled accounts?|dormant|offboarded|offboarding|suspended) /;

/** Answer a free-text access question from local hub data. */
export function answerAccessQuestion(question: string, ctx: NovaContext): NovaAnswer {
  const q = normalize(question);
  const userMap = new Map(ctx.users.map((u) => [u.id, u]));
  const appMap = new Map(ctx.apps.map((a) => [a.id, a]));
  const H: Helpers = { ctx, userMap, appMap };

  const person = findUser(q, ctx.users, ctx.meId);
  const app = findApp(q, ctx.apps);
  const role = findRole(q, ctx.roles);

  if (test(q, RE_DENIED) && !test(q, RE_REQUEST)) return deniedAttempts(H, q);
  if (test(q, RE_DENIED) && test(q, RE_REQUEST) && !hasWord(q, 'attempt', 'attempts')) return deniedRequests(H, q);
  if (person && test(q, RE_REQUEST)) return personRequests(H, person);
  if (person && app) return accessCheck(H, person, app);
  if (person && test(q, RE_ACTIVITY)) return personActivity(H, person);
  if (test(q, RE_EXPIRING)) return expiringGrants(H, q);
  if (test(q, RE_PENDING) || (test(q, RE_REQUEST) && !app)) return pendingRequests(H);
  if (app) return appAccess(H, app);
  if (test(q, RE_PERMANENT)) return permanentGrants(H);
  if (test(q, RE_INACTIVE)) return inactiveAccounts(H);
  if (role) return roleMembers(H, role);
  if (test(q, RE_ADMINS)) return fullAccess(H);
  if (person) return personSummary(H, person);
  return help(ctx.can);
}

interface Helpers {
  ctx: NovaContext;
  userMap: Map<string, User>;
  appMap: Map<string, HubApp>;
}

function base(intent: NovaIntent, tone: NovaAnswer['tone'], title: string, summary: string): NovaAnswer {
  return { intent, tone, title, summary, rows: [], more: 0, facts: [], links: [], followUps: [] };
}

function rowsOf<T>(items: T[], map: (t: T) => NovaRow): { rows: NovaRow[]; more: number } {
  return { rows: items.slice(0, MAX_ROWS).map(map), more: Math.max(0, items.length - MAX_ROWS) };
}

function locked(what: string, perm: string): NovaAnswer {
  return {
    ...base('locked', 'warning', 'That’s outside your Control Center scope', `${what} need the ${perm} permission. Ask a System Admin if your work requires it.`),
    followUps: ['Who can open Payroll?', 'Which grants expire this week?'],
  };
}

function nameOf(H: Helpers, id: string | undefined): string {
  return (id && H.userMap.get(id)?.name) || 'System';
}

function eventRow(H: Helpers, e: AuditEntry): NovaRow {
  const actor = H.userMap.get(e.actorId);
  return {
    key: e.id,
    user: actor,
    glyph: e.outcome === 'denied' ? 'denied' : 'event',
    title: `${actor?.name ?? 'System'} · ${e.action}`,
    meta: `${e.target}${e.detail ? ` — ${e.detail}` : ''} · ${relativeTime(e.at, H.ctx.now)}`,
    chip:
      e.outcome === 'denied'
        ? { label: 'Denied', tone: 'danger' }
        : e.severity === 'critical'
          ? { label: 'Critical', tone: 'danger' }
          : e.severity === 'warning'
            ? { label: 'Warning', tone: 'warning' }
            : undefined,
  };
}

function requestRow(H: Helpers, r: AccessRequest, mode: 'person' | 'app'): NovaRow {
  const u = H.userMap.get(r.userId);
  const a = H.appMap.get(r.appId);
  const appName = a?.name ?? r.appId;
  return {
    key: r.id,
    user: mode === 'app' ? u : undefined,
    app: mode === 'person' ? a : undefined,
    title: mode === 'app' ? `${u?.name ?? 'Unknown user'} → ${appName}` : `${appName} · ${DURATION_LABEL[r.duration]}`,
    meta: `${relativeTime(r.createdAt, H.ctx.now)} · “${clip(r.reason, 64)}”${r.reviewNote ? ` · note: ${clip(r.reviewNote, 48)}` : ''}`,
    chip: STATUS_CHIP[r.status],
  };
}

function grantRow(H: Helpers, u: User, g: Grant): NovaRow {
  const now = H.ctx.now;
  const days = g.expiresAt === null ? null : Math.max(0, Math.ceil((g.expiresAt - now) / DAY));
  return {
    key: `${u.id}:${g.permission}`,
    user: u,
    title: `${u.name} · ${permLabel(g.permission, H.appMap)}`,
    meta: `${g.expiresAt === null ? 'never expires' : `expires ${relativeTime(g.expiresAt, now)}`} · granted by ${nameOf(H, g.grantedBy)}`,
    chip: days === null ? { label: 'Permanent', tone: 'warning' } : { label: `${days}d left`, tone: days <= 2 ? 'danger' : 'warning' },
  };
}

function auditLink(H: Helpers, label: string, q: Record<string, string>) {
  return H.ctx.can.audit ? [{ label, to: adminHref('audit', q) }] : [];
}
function usersLink(H: Helpers, label: string, q: Record<string, string>) {
  return H.ctx.can.users ? [{ label, to: adminHref('users', q) }] : [];
}
function reviewLink(H: Helpers) {
  return H.ctx.can.review ? [{ label: 'Open review queue', to: adminHref('requests') }] : [];
}
function scoped(can: NovaScope, list: string[]): string[] {
  return list.filter((s) => (s.startsWith('Show denied') ? can.audit : s.startsWith('What did') || s.startsWith('Show pending') ? can.review || can.users : true));
}

// ── audit ──

function deniedAttempts(H: Helpers, q: string): NovaAnswer {
  const { ctx } = H;
  if (!ctx.can.audit) return locked('Denied attempts live in the audit log and', 'Audit log (hub.audit.view)');
  const w = windowOf(q, ctx.now, 7);
  const all = ctx.audit.filter((e) => e.outcome === 'denied').sort((a, b) => b.at - a.at);
  const hits = all.filter((e) => e.at >= w.since);
  const followUps = scoped(ctx.can, ['Show denied attempts this week', 'Who has full access?', 'Show pending requests']);
  if (!hits.length) {
    const last = all[0];
    return {
      ...base(
        'denied',
        'success',
        `No denied attempts ${w.label}`,
        last
          ? `Nobody hit an access boundary ${w.label}. The most recent denial was ${relativeTime(last.at, ctx.now)}: ${nameOf(H, last.actorId)} — ${last.detail ?? last.target}.`
          : 'Nobody has hit an access boundary yet — the policy engine has nothing to report.',
      ),
      rows: last ? [eventRow(H, last)] : [],
      links: auditLink(H, 'All denied events', { outcome: 'denied' }),
      followUps,
    };
  }
  const critical = hits.filter((e) => e.severity === 'critical').length;
  const people = new Set(hits.map((e) => e.actorId)).size;
  const latest = hits[0];
  return {
    ...base(
      'denied',
      critical ? 'danger' : 'warning',
      `${pluralize(hits.length, 'denied attempt')} ${w.label}`,
      `${critical ? `${critical} critical. ` : ''}Blocked by the policy engine across ${pluralize(people, 'person', 'people')}. Latest: ${nameOf(H, latest.actorId)} — ${latest.detail ?? latest.target}.`,
    ),
    ...rowsOf(hits, (e) => eventRow(H, e)),
    facts: [
      { label: 'Critical', value: critical },
      { label: 'People', value: people },
    ],
    links: auditLink(H, 'Open in Audit log', { outcome: 'denied' }),
    followUps,
  };
}

function personActivity(H: Helpers, u: User): NovaAnswer {
  const { ctx } = H;
  if (!ctx.can.audit) return locked('Activity trails come from the audit log and', 'Audit log (hub.audit.view)');
  const events = ctx.audit.filter((e) => e.actorId === u.id).sort((a, b) => b.at - a.at);
  const first = firstName(u.name);
  if (!events.length)
    return {
      ...base('person-activity', 'app', `No audited actions by ${first}`, `${u.name} hasn’t performed any permission-checked action that’s on record.`),
      followUps: scoped(ctx.can, [`What did ${first} request?`, 'Show denied attempts this week']),
    };
  const denied = events.filter((e) => e.outcome === 'denied').length;
  return {
    ...base(
      'person-activity',
      denied ? 'warning' : 'app',
      `${pluralize(events.length, 'audited action')} by ${first}`,
      `Latest ${relativeTime(events[0].at, ctx.now)}: ${events[0].action} on ${events[0].target}.${denied ? ` ${pluralize(denied, 'attempt')} were denied.` : ''}`,
    ),
    ...rowsOf(events, (e) => eventRow(H, e)),
    facts: [
      { label: 'Denied', value: denied },
      { label: 'Last 7 days', value: events.filter((e) => e.at >= ctx.now - 7 * DAY).length },
    ],
    links: auditLink(H, `${first}’s trail in Audit`, { actor: u.id }),
    followUps: scoped(ctx.can, [`What did ${first} request?`, `What can ${first} access?`]),
  };
}

// ── requests ──

function pendingRequests(H: Helpers): NovaAnswer {
  const { ctx } = H;
  if (!ctx.can.review && !ctx.can.users) return locked('Access requests', 'Review access requests (hub.requests.review)');
  const pending = ctx.requests.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  if (!pending.length)
    return {
      ...base('pending', 'success', 'No pending requests', 'The queue is empty — every access request has been decided.'),
      followUps: ['Which grants expire this week?', 'Who has full access?'],
    };
  const mine = pending.filter((r) => r.userId !== ctx.meId && canReviewRequest(ctx.myPerms, r.appId).ok);
  const stale = pending.filter((r) => ctx.now - r.createdAt > DAY).length;
  const oldest = pending[0];
  return {
    ...base(
      'pending',
      stale ? 'warning' : 'app',
      `${pluralize(pending.length, 'request')} pending`,
      `${mine.length ? `${mine.length} waiting on you` : 'None waiting on you'}${pending.length - mine.length ? `, ${pending.length - mine.length} with other reviewers` : ''}. Oldest: ${nameOf(H, oldest.userId)} → ${H.appMap.get(oldest.appId)?.name ?? oldest.appId} (${relativeTime(oldest.createdAt, ctx.now)}).`,
    ),
    ...rowsOf(pending, (r) => {
      const row = requestRow(H, r, 'app');
      const yours = mine.includes(r);
      return { ...row, chip: yours ? { label: 'Yours', tone: 'app' } : { label: 'Other reviewer', tone: 'slate' } };
    }),
    facts: [
      { label: 'Yours', value: mine.length },
      { label: 'Over 24h', value: stale },
    ],
    links: reviewLink(H),
    followUps: scoped(ctx.can, [`What did ${firstName(nameOf(H, oldest.userId))} request?`, 'Which grants expire this week?']),
  };
}

function deniedRequests(H: Helpers, q: string): NovaAnswer {
  const { ctx } = H;
  if (!ctx.can.review && !ctx.can.users) return locked('Access requests', 'Review access requests (hub.requests.review)');
  const w = windowOf(q, ctx.now, 30);
  const list = ctx.requests.filter((r) => r.status === 'denied' && (r.reviewedAt ?? r.createdAt) >= w.since).sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));
  return {
    ...base(
      'denied-requests',
      list.length ? 'warning' : 'success',
      list.length ? `${pluralize(list.length, 'request')} denied ${w.label}` : `No requests denied ${w.label}`,
      list.length
        ? `Most recent: ${nameOf(H, list[0].userId)} → ${H.appMap.get(list[0].appId)?.name ?? list[0].appId}${list[0].reviewNote ? ` — “${clip(list[0].reviewNote, 80)}”` : ''}.`
        : 'Reviewers approved or are still deciding everything that came in.',
    ),
    ...rowsOf(list, (r) => requestRow(H, r, 'app')),
    links: reviewLink(H),
    followUps: scoped(ctx.can, ['Show pending requests', 'Show denied attempts this week']),
  };
}

function personRequests(H: Helpers, u: User): NovaAnswer {
  const { ctx } = H;
  if (!ctx.can.review && !ctx.can.users) return locked('Access requests', 'Review access requests (hub.requests.review)');
  const first = firstName(u.name);
  const list = ctx.requests.filter((r) => r.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length)
    return {
      ...base('person-requests', 'app', `${first} hasn’t requested any access`, `${u.name} only uses what their roles and existing grants provide.`),
      links: usersLink(H, `Open ${first} in People`, { q: u.name }),
      followUps: scoped(ctx.can, [`What can ${first} access?`, 'Show pending requests']),
    };
  const pending = list.filter((r) => r.status === 'pending');
  const latest = list[0];
  const latestApp = H.appMap.get(latest.appId)?.name ?? latest.appId;
  return {
    ...base(
      'person-requests',
      pending.length ? 'warning' : 'app',
      `${first} made ${pluralize(list.length, 'access request')}`,
      pending.length
        ? `${pending.length} still pending — latest: ${latestApp} for ${DURATION_LABEL[latest.duration].toLowerCase()}, “${clip(latest.reason, 90)}”`
        : `Latest: ${latestApp} (${STATUS_CHIP[latest.status].label.toLowerCase()}) ${relativeTime(latest.createdAt, ctx.now)}.`,
    ),
    ...rowsOf(list, (r) => requestRow(H, r, 'person')),
    facts: [
      { label: 'Pending', value: pending.length },
      { label: 'Approved', value: list.filter((r) => r.status === 'approved').length },
      { label: 'Denied', value: list.filter((r) => r.status === 'denied').length },
    ],
    links: [...(pending.length ? reviewLink(H) : []), ...usersLink(H, `Open ${first} in People`, { q: u.name })],
    followUps: scoped(ctx.can, [`What can ${first} access?`, `Who can open ${latestApp}?`]),
  };
}

// ── grants ──

function expiringGrants(H: Helpers, q: string): NovaAnswer {
  const { ctx } = H;
  const days = test(q, / (month|30 days|30d) /) ? 30 : 7;
  const list = ctx.users
    .filter((u) => u.active)
    .flatMap((u) => u.grants.filter((g) => isGrantActive(g, ctx.now) && g.expiresAt !== null && g.expiresAt - ctx.now <= days * DAY).map((g) => ({ u, g })))
    .sort((a, b) => (a.g.expiresAt ?? 0) - (b.g.expiresAt ?? 0));
  if (!list.length)
    return {
      ...base('expiring', 'success', `Nothing expires in the next ${days} days`, 'Time-boxed access is on track — no renewals to plan.'),
      followUps: scoped(ctx.can, ['Who has a permanent grant?', 'Show pending requests']),
    };
  return {
    ...base(
      'expiring',
      'warning',
      `${pluralize(list.length, 'grant')} expire within ${days} days`,
      `${listNames([...new Set(list.map((x) => firstName(x.u.name)))])} — renew from their access panel or let them lapse; expired grants stop working automatically.`,
    ),
    ...rowsOf(list, ({ u, g }) => grantRow(H, u, g)),
    links: usersLink(H, 'Review in People', { grants: 'expiring' }),
    followUps: scoped(ctx.can, ['Who has a permanent grant?', 'Show pending requests']),
  };
}

function permanentGrants(H: Helpers): NovaAnswer {
  const { ctx } = H;
  const list = ctx.users.filter((u) => u.active).flatMap((u) => u.grants.filter((g) => g.expiresAt === null).map((g) => ({ u, g })));
  if (!list.length)
    return {
      ...base('permanent', 'success', 'No permanent direct grants', 'All direct access is time-boxed and expires on its own.'),
      followUps: ['Which grants expire this week?', 'Who has full access?'],
    };
  return {
    ...base(
      'permanent',
      'warning',
      `${pluralize(list.length, 'permanent direct grant')}`,
      `Standing access bypasses time-boxing. Prefer a role or a 90-day grant for ${listNames([...new Set(list.map((x) => firstName(x.u.name)))])}.`,
    ),
    ...rowsOf(list, ({ u, g }) => grantRow(H, u, g)),
    links: usersLink(H, 'Review in People', { grants: 'permanent' }),
    followUps: ['Which grants expire this week?', 'Who has full access?'],
  };
}

// ── people & roles ──

function inactiveAccounts(H: Helpers): NovaAnswer {
  const { ctx } = H;
  const list = ctx.users.filter((u) => !u.active);
  if (!list.length)
    return { ...base('inactive', 'success', 'No deactivated accounts', 'Every identity in NEXUS is active.'), followUps: ['Who has full access?'] };
  const dormant = list.filter((u) => u.grants.some((g) => isGrantActive(g, ctx.now)));
  return {
    ...base(
      'inactive',
      dormant.length ? 'danger' : 'app',
      `${pluralize(list.length, 'deactivated account')}`,
      dormant.length
        ? `${listNames(dormant.map((u) => u.name))} still ${dormant.length === 1 ? 'holds' : 'hold'} direct grants that would revive on reactivation — revoke what’s no longer needed.`
        : 'None of them hold dormant grants — offboarding hygiene looks good.',
    ),
    ...rowsOf(list, (u) => {
      const live = u.grants.filter((g) => isGrantActive(g, ctx.now)).length;
      return {
        key: u.id,
        user: u,
        title: u.name,
        meta: `${u.title} · ${u.lastActiveAt ? `last active ${relativeTime(u.lastActiveAt, ctx.now)}` : 'never active'}`,
        chip: live ? { label: `${pluralize(live, 'dormant grant')}`, tone: 'danger' } : { label: 'Clean', tone: 'success' },
      };
    }),
    links: usersLink(H, 'Open deactivated in People', { status: 'inactive' }),
    followUps: ['Who has a permanent grant?', 'Who has full access?'],
  };
}

function fullAccess(H: Helpers): NovaAnswer {
  const { ctx } = H;
  const admins = ctx.users.filter((u) => u.active && effectivePermissions(u, ctx.roles, ctx.now).has('*'));
  const n = admins.length;
  return {
    ...base(
      'admins',
      n <= 1 || n > 3 ? 'warning' : 'success',
      `${pluralize(n, 'person', 'people')} ${n === 1 ? 'holds' : 'hold'} full access (∗)`,
      n === 0
        ? 'Nobody holds the wildcard — make sure a break-glass admin exists.'
        : n === 1
          ? `${admins[0].name} is a single point of failure — add a second, break-glass admin.`
          : n > 3
            ? 'That’s a large super-admin footprint — review who truly needs everything.'
            : 'A healthy super-admin footprint.',
    ),
    ...rowsOf(admins, (u) => {
      const via = u.roleIds.map((id) => ctx.roles.find((r) => r.id === id)).filter((r): r is Role => !!r && r.permissions.includes('*'));
      return {
        key: u.id,
        user: u,
        title: u.name,
        meta: `${u.title} · ${via.length ? `via ${via.map((r) => r.name).join(', ')}` : 'via a direct wildcard grant'}`,
        chip: { label: `L${clearanceOf(u, ctx.roles)}`, tone: 'violet' },
      };
    }),
    links: usersLink(H, 'Open in People', { role: SUPER_ADMIN_ROLE_ID }),
    followUps: scoped(ctx.can, ['Show denied attempts this week', 'Who has a permanent grant?']),
  };
}

function roleMembers(H: Helpers, role: Role): NovaAnswer {
  const { ctx } = H;
  const members = ctx.users.filter((u) => u.roleIds.includes(role.id)).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const inactive = members.filter((u) => !u.active).length;
  const full = role.locked || role.permissions.includes('*');
  const appCount = role.permissions.filter((p) => p.startsWith('app:')).length;
  return {
    ...base(
      'role',
      'app',
      `${pluralize(members.length, 'person', 'people')} ${members.length === 1 ? 'holds' : 'hold'} ${role.name}`,
      `L${role.clearance} · ${full ? 'full access (∗)' : `${pluralize(role.permissions.length, 'permission')} across ${pluralize(appCount, 'app')}`}.${inactive ? ` ${inactive} of them ${inactive === 1 ? 'is' : 'are'} deactivated.` : ''} ${role.description}`,
    ),
    ...rowsOf(members, (u) => ({
      key: u.id,
      user: u,
      title: u.name,
      meta: `${u.title} · ${u.department}`,
      chip: u.active ? undefined : { label: 'Deactivated', tone: 'slate' },
    })),
    links: [
      ...usersLink(H, `Filter People by ${role.name}`, { role: role.id }),
      ...(ctx.can.roles ? [{ label: 'Open role catalog', to: adminHref('roles') }] : []),
    ],
    followUps: ['Who has full access?', 'Which grants expire this week?'],
  };
}

function personSummary(H: Helpers, u: User): NovaAnswer {
  const { ctx } = H;
  const first = firstName(u.name);
  const perms = effectivePermissions(u, ctx.roles, ctx.now);
  const enabled = ctx.apps.filter((a) => a.enabled);
  const canOpen = enabled.filter((a) => hasPermission(perms, appPermissionId(a.id)));
  const grants = u.grants.filter((g) => isGrantActive(g, ctx.now));
  const pending = ctx.requests.filter((r) => r.userId === u.id && r.status === 'pending');
  const head = primaryRole(u, ctx.roles);
  const roleRows: NovaRow[] = u.roleIds
    .map((id) => ctx.roles.find((r) => r.id === id))
    .filter((r): r is Role => !!r)
    .map((r): NovaRow => ({ key: `role:${r.id}`, glyph: 'role', title: r.name, meta: `Role · L${r.clearance} · ${r.permissions.includes('*') ? 'full access' : pluralize(r.permissions.length, 'permission')}` }));
  const rows: NovaRow[] = [
    ...roleRows,
    ...grants.map((g) => grantRow(H, u, g)),
    ...(ctx.can.review || ctx.can.users ? pending.map((r) => requestRow(H, r, 'person')) : []),
  ];
  return {
    ...base(
      'person',
      u.active ? 'app' : 'danger',
      `${u.name} · ${head?.name ?? 'No role'} · L${clearanceOf(u, ctx.roles)}`,
      `${u.title}, ${u.department}. Can open ${canOpen.length} of ${enabled.length} apps${grants.length ? `, with ${pluralize(grants.length, 'direct grant')}` : ''}${pending.length ? ` and ${pluralize(pending.length, 'pending request')}` : ''}.${u.active ? '' : ' The account is deactivated — all access is suspended.'}`,
    ),
    rows: rows.slice(0, MAX_ROWS),
    more: Math.max(0, rows.length - MAX_ROWS),
    facts: [
      { label: 'Apps', value: canOpen.length },
      { label: 'Roles', value: u.roleIds.length },
      { label: 'Grants', value: grants.length },
    ],
    links: usersLink(H, `Manage ${first} in People`, { q: u.name }),
    followUps: scoped(ctx.can, [`What did ${first} request?`, `What did ${first} change?`]).filter((s) => !s.includes('change') || ctx.can.audit),
  };
}

// ── apps ──

function appAccess(H: Helpers, app: HubApp): NovaAnswer {
  const { ctx } = H;
  const perm = appPermissionId(app.id);
  const active = ctx.users.filter((u) => u.active);
  const holders = active
    .filter((u) => hasPermission(effectivePermissions(u, ctx.roles, ctx.now), perm))
    .map((u) => ({ u, why: explainAccess(u, ctx.roles, perm, ctx.now) }))
    .sort((a, b) => Number(!!b.why.grant && !b.why.roles.length) - Number(!!a.why.grant && !a.why.roles.length) || a.u.name.localeCompare(b.u.name));
  const direct = holders.filter((h) => h.why.grant).length;
  const roleNames = [...new Set(holders.flatMap((h) => h.why.roles.map((r) => r.name)))];
  const pending = ctx.requests.filter((r) => r.appId === app.id && r.status === 'pending');
  const pct = active.length ? Math.round((holders.length / active.length) * 100) : 0;
  const where = roleNames.length ? `via ${listNames(roleNames, 4)}` : 'only through direct grants';
  return {
    ...base(
      'app-access',
      !app.enabled ? 'warning' : 'app',
      `${pluralize(holders.length, 'person', 'people')} can open ${app.name}`,
      `${pct}% of active people, ${where}${direct ? ` plus ${pluralize(direct, 'direct grant')}` : ''}.${pending.length ? ` ${pluralize(pending.length, 'request')} pending.` : ''}${app.enabled ? '' : ' Heads-up: the app is disabled in the catalog, so nobody can launch it right now.'}`,
    ),
    ...rowsOf(holders, ({ u, why }) => ({
      key: u.id,
      user: u,
      title: u.name,
      meta: why.roles.length
        ? `${u.title} · via ${why.roles.map((r) => r.name).join(', ')}`
        : why.grant
          ? `${u.title} · direct grant${why.grant.expiresAt ? `, expires ${relativeTime(why.grant.expiresAt, ctx.now)}` : ', never expires'}`
          : `${u.title} · via a wildcard`,
      chip: why.grant ? (why.grant.expiresAt === null ? { label: 'Permanent', tone: 'warning' } : { label: 'Direct', tone: 'violet' }) : undefined,
    })),
    facts: [
      { label: 'Coverage', value: `${pct}%` },
      { label: 'Roles', value: roleNames.length },
      { label: 'Direct', value: direct },
      { label: 'Pending', value: pending.length },
    ],
    links: [
      ...(ctx.can.apps ? [{ label: `Manage ${app.name}`, to: adminHref('apps', { q: app.name }) }] : []),
      ...(ctx.can.roles ? [{ label: 'Permission matrix', to: adminHref('roles', { view: 'matrix' }) }] : []),
    ],
    followUps: scoped(ctx.can, ['Who has full access?', 'Show pending requests', 'Which grants expire this week?']),
  };
}

function accessCheck(H: Helpers, u: User, app: HubApp): NovaAnswer {
  const { ctx } = H;
  const perm = appPermissionId(app.id);
  const first = firstName(u.name);
  const ok = u.active && app.enabled && hasPermission(effectivePermissions(u, ctx.roles, ctx.now), perm);
  const why = explainAccess(u, ctx.roles, perm, ctx.now);
  const pending = ctx.requests.find((r) => r.userId === u.id && r.appId === app.id && r.status === 'pending');
  const reason = !u.active
    ? `${u.name}’s account is deactivated, so every permission is suspended.`
    : !app.enabled
      ? `${app.name} is disabled in the catalog, so nobody can launch it.`
      : ok
        ? why.roles.length
          ? `Access comes from ${listNames(why.roles.map((r) => r.name))}${why.grant ? ' and a direct grant' : ''}.`
          : why.grant
            ? `Through a direct grant${why.grant.expiresAt ? ` that expires ${relativeTime(why.grant.expiresAt, ctx.now)}` : ' that never expires'}.`
            : 'Through a wildcard permission.'
        : pending
          ? `A request is pending — ${DURATION_LABEL[pending.duration].toLowerCase()}, asked ${relativeTime(pending.createdAt, ctx.now)}.`
          : `None of ${first}’s roles include it and there’s no direct grant. ${first} can request it from the app’s details.`;
  return {
    ...base('check', ok ? 'success' : 'warning', ok ? `Yes — ${first} can open ${app.name}` : `No — ${first} can’t open ${app.name}`, reason),
    rows: [
      ...(why.grant ? [grantRow(H, u, why.grant)] : []),
      ...(pending && (ctx.can.review || ctx.can.users) ? [requestRow(H, pending, 'person')] : []),
    ],
    facts: [{ label: 'Clearance', value: `L${clearanceOf(u, ctx.roles)}` }],
    links: [...(pending ? reviewLink(H) : []), ...usersLink(H, `Manage ${first} in People`, { q: u.name })],
    followUps: scoped(ctx.can, [`Who can open ${app.name}?`, `What did ${first} request?`]),
  };
}

// ── help ──

function help(can: NovaScope): NovaAnswer {
  return {
    ...base(
      'help',
      'app',
      'I couldn’t match that to a person, app or role',
      'Ask about an app (“Who can open Payroll?”), a person (“What can Mei access?”), a role (“Who holds People Ops?”), requests, expiring grants or the audit trail.',
    ),
    followUps: novaSuggestions(can),
  };
}
