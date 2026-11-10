/**
 * Nova intent resolver for the Launchpad prompt.
 *
 * Maps free text ("I need my payslip", "book travel to Riyadh", "reset my
 * passkey", "Mei Tanaka") onto something the person can do right now — a
 * curated hub action, an app quick action, an app, a colleague or a hub page.
 * Everything is permission-aware: actions that live in an app the person can't
 * open come back `locked` (running them opens the request-access sheet).
 *
 * Scoring is deliberately simple and deterministic: stop-word stripped tokens,
 * light stemming, prefix + one-typo matching, phrase bonuses for aliases.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { AppWithAccess, HubApp, User } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useAppAccess, usePermissions, useSessionUser } from '@/store/selectors';
import { hasAny, hasPermission } from '@/lib/rbac';
import { NAV_ITEMS } from '@/components/shell/nav';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { startFocusSession } from '@/components/FocusEngine';

export type IntentKind = 'action' | 'app' | 'person' | 'page';

/** What to render as the intent's leading visual. */
/** `icon` is a lucide icon name (see `glyphIcon` in HeroGreeting.tsx). */
export type IntentGlyph = { kind: 'icon'; icon: string; gradient?: [string, string] } | { kind: 'app'; app: HubApp; locked: boolean } | { kind: 'user'; user: User };

export interface NovaIntent {
  id: string;
  kind: IntentKind;
  title: string;
  /** Where it happens — "in People Hub", "Locked · request access", "Engineering · Dubai". */
  detail: string;
  glyph: IntentGlyph;
  locked?: boolean;
  run: () => void;
}

export interface ScoredIntent extends NovaIntent {
  score: number;
  coverage: number;
  exact: boolean;
}

export interface NovaResolution {
  query: string;
  matches: ScoredIntent[];
  /** Safe to run without asking (exact phrase / clear winner). */
  confident: boolean;
}

/* ------------------------------------------------------------------ text */

const STOP = new Set(
  "a an the to for of on in at by with and or my me i im i'm we our us you your please pls plz can could would should like want wanna need needs show open go goto find get give make do does did how what where when who is are am be it its this that some new start help hey hi nova let lets let's quick quickly now today".split(
    ' ',
  ),
);

const stem = (w: string) => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/** One substitution / insertion / deletion apart (typo tolerance for longer words). */
function nearlyEqual(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatch(q: string, c: string) {
  if (q === c) return 1;
  if (q.length >= 3 && c.startsWith(q)) return 0.75;
  if (c.length >= 4 && q.startsWith(c)) return 0.7;
  if (nearlyEqual(q, c)) return 0.65;
  return 0;
}

/* ------------------------------------------------------------ candidates */

interface Candidate extends NovaIntent {
  /** Title + aliases + owning app name. */
  primary: string[];
  /** Keywords, taglines, departments… */
  secondary: string[];
  /** Normalised phrases that count as an exact ask ("time off", "payslip"). */
  phrases: string[];
  bias: number;
}

interface Verb {
  id: string;
  title: string;
  icon: string;
  aliases: string[];
  /** Owning app(s): granted if any is granted, else locked if any is requestable, else hidden. */
  apps?: string[];
  perm?: string;
  to?: string;
  run?: 'kudos' | 'focus';
}

/** Curated hub verbs — the things people most often come to the Launchpad for. */
const VERBS: Verb[] = [
  { id: 'timeoff', title: 'Request time off', icon: 'Plane', apps: ['hr'], to: '/hr/time-off?new=1', aliases: ['time off', 'leave', 'vacation', 'holiday', 'pto', 'annual leave', 'sick leave', 'sick day', 'day off', 'days off', 'off work', 'wfa', 'work from anywhere', 'اجازة', 'إجازة', 'طلب اجازة', 'طلب إجازة'] },
  { id: 'travel', title: 'Book business travel', icon: 'Plane', apps: ['travel', 'expenses'], to: '/expenses/travel?new=1', aliases: ['book travel', 'travel', 'trip', 'business trip', 'flight', 'flights', 'hotel', 'per diem', 'travel approval', 'سفر', 'حجز سفر', 'رحلة عمل', 'طيران'] },
  { id: 'payslip', title: 'Open my payslips', icon: 'Receipt', apps: ['hr'], to: '/hr/documents?tab=payslips', aliases: ['payslip', 'my payslip', 'pay slip', 'salary slip', 'pay stub', 'my pay', 'salary', 'راتب', 'قسيمة الراتب', 'رواتب'] },
  { id: 'letter', title: 'Get a salary certificate or letter', icon: 'FileText', apps: ['hr'], to: '/hr/documents?tab=letters', aliases: ['letter', 'salary certificate', 'employment letter', 'bank letter', 'embassy letter', 'noc', 'شهادة راتب', 'خطاب تعريف'] },
  { id: 'passkey', title: 'Reset my passkey', icon: 'KeyRound', apps: ['helpdesk'], to: '/helpdesk/guides/passkey-setup', aliases: ['reset my passkey', 'passkey', 'reset passkey', 'password', 'reset password', 'mfa', '2fa', 'locked out', 'cant sign in', 'security key', 'مفتاح المرور', 'كلمة المرور'] },
  { id: 'ticket', title: 'Raise an IT ticket', icon: 'Ticket', apps: ['helpdesk'], to: '/helpdesk/tickets?new=1', aliases: ['ticket', 'it ticket', 'it support', 'helpdesk', 'broken', 'laptop', 'vpn', 'wifi', 'printer', 'monitor', 'تذكرة', 'تذكرة دعم', 'دعم تقني'] },
  { id: 'diag', title: 'Run a device health check', icon: 'Activity', apps: ['helpdesk'], to: '/helpdesk?diag=1', aliases: ['health check', 'diagnostics', 'slow laptop', 'device check', 'فحص الجهاز'] },
  { id: 'expense', title: 'Submit an expense', icon: 'Receipt', apps: ['expenses'], to: '/expenses/reports', aliases: ['expense', 'expenses', 'receipt', 'reimburse', 'reimbursement', 'claim', 'expense report', 'مصروفات', 'ايصال', 'إيصال', 'تعويض'] },
  { id: 'benefits', title: 'Benefits & allowances', icon: 'HeartPulse', apps: ['hr'], to: '/hr/benefits', aliases: ['benefits', 'insurance', 'medical', 'allowance', 'dependents', 'wellness budget', 'مزايا', 'تأمين طبي', 'بدلات'] },
  { id: 'askhr', title: 'Ask People Ops', icon: 'Users', apps: ['hr'], to: '/hr?ask=1', aliases: ['ask hr', 'hr question', 'people ops', 'human resources', 'موارد بشرية', 'عمليات الأفراد'] },
  { id: 'docs', title: 'Ask Nova Docs', icon: 'Sparkles', apps: ['wiki'], to: '/wiki?ask=1', aliases: ['policy', 'handbook', 'docs', 'wiki', 'runbook', 'knowledge base', 'how do i', 'قاعدة المعرفة', 'سياسات'] },
  { id: 'okrs', title: 'Check in on my OKRs', icon: 'Target', apps: ['performance'], to: '/performance/okrs?checkin=1', aliases: ['okr', 'okrs', 'goals', 'objectives', 'key results', 'اهداف', 'أهداف', 'تقييم'] },
  { id: 'feedback', title: 'Give feedback', icon: 'Send', apps: ['performance'], to: '/performance/feedback?give=1', aliases: ['feedback', 'give feedback', 'peer review', 'تغذية راجعة', 'ملاحظات'] },
  { id: 'learn', title: 'Continue learning', icon: 'GraduationCap', apps: ['learning'], to: '/academy', aliases: ['course', 'courses', 'learning', 'training', 'academy', 'compliance training', 'تعلم', 'دورات', 'تدريب', 'أكاديمية'] },
  { id: 'upload', title: 'Upload files to Drive', icon: 'Upload', apps: ['drive'], to: '/drive?upload=1', aliases: ['upload', 'upload file', 'share a file', 'files', 'ملفات', 'رفع ملف'] },
  { id: 'huddle', title: 'Start a huddle', icon: 'Headphones', apps: ['chat'], to: '/chat?huddle=1', aliases: ['huddle', 'call', 'quick call', 'voice', 'محادثة', 'اتصال'] },
  { id: 'kudos', title: 'Give kudos', icon: 'PartyPopper', perm: 'hub.kudos.give', run: 'kudos', aliases: ['kudos', 'thank', 'thanks', 'thank you', 'shoutout', 'recognise', 'recognize', 'appreciate', 'تقدير', 'شكر'] },
  { id: 'focus', title: 'Start a 25-minute focus session', icon: 'Timer', run: 'focus', aliases: ['focus', 'focus mode', 'pomodoro', 'deep work', 'do not disturb', 'dnd', 'تركيز', 'جلسة تركيز'] },
  { id: 'review', title: 'Review access requests', icon: 'ClipboardList', perm: 'hub.requests.review', to: '/admin/requests', aliases: ['access requests', 'approve access', 'review requests', 'approvals', 'طلبات الصلاحيات'] },
  { id: 'people', title: 'Find a colleague', icon: 'Users', perm: 'hub.people.view', to: '/people', aliases: ['directory', 'colleague', 'people', 'org chart', 'who is', 'دليل الموظفين', 'زميل'] },
];

const KIND_BIAS: Record<IntentKind, number> = { action: 0.18, app: 0.12, person: 0.05, page: -0.1 };

/* ----------------------------------------------------------------- hook */

/** Returns a `resolve(text)` function bound to the current person's apps + permissions. */
export function useNovaIntents() {
  const apps = useAppAccess();
  const perms = usePermissions();
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const launch = useLaunchApp();
  const navigate = useNavigate();
  const openAppSheet = useUI((s) => s.openAppSheet);
  const openKudos = useUI((s) => s.openKudos);

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    const byId = new Map<string, AppWithAccess>(apps.map((a) => [a.app.id, a]));
    const can = (p: string) => hasPermission(perms, p);

    // 1. Curated verbs
    for (const v of VERBS) {
      if (v.perm && !can(v.perm)) continue;
      let locked = false;
      let owner: AppWithAccess | undefined;
      if (v.apps?.length) {
        const owned = v.apps.map((id) => byId.get(id)).filter((a): a is AppWithAccess => !!a && a.access !== 'disabled');
        owner = owned.find((a) => a.access === 'granted');
        if (!owner) {
          owner = owned.find((a) => a.access === 'locked' || a.access === 'pending');
          if (!owner) continue;
          locked = true;
        }
      }
      const run = () => {
        if (locked && owner) return openAppSheet(owner.app.id);
        if (v.run === 'kudos') return openKudos();
        if (v.run === 'focus') return startFocusSession(25);
        if (v.to) navigate(v.to);
      };
      out.push({
        id: `verb-${v.id}`,
        kind: 'action',
        title: v.title,
        detail: owner ? (locked ? `${owner.app.name} · ${owner.access === 'pending' ? 'request pending' : 'request access'}` : `in ${owner.app.name}`) : 'Hub action',
        glyph: { kind: 'icon', icon: v.icon, gradient: owner?.app.gradient },
        locked,
        run,
        primary: [...tokens(v.title), ...v.aliases.flatMap(tokens)],
        secondary: owner ? tokens(owner.app.name) : [],
        phrases: [normalize(v.title), ...v.aliases.map(normalize)],
        bias: KIND_BIAS.action + 0.05,
      });
    }

    // 2. Apps + their quick actions
    for (const item of apps) {
      const { app, access } = item;
      if (access === 'disabled') continue;
      const granted = access === 'granted';
      out.push({
        id: `app-${app.id}`,
        kind: 'app',
        title: app.name,
        detail: granted ? app.tagline : access === 'pending' ? 'Access request pending' : `Locked · request access`,
        glyph: { kind: 'app', app, locked: !granted },
        locked: !granted,
        run: () => launch(app.id),
        primary: tokens(app.name),
        secondary: [...tokens(app.category), ...app.keywords.flatMap(tokens), ...tokens(app.tagline)],
        phrases: [normalize(app.name)],
        bias: KIND_BIAS.app,
      });
      if (!granted) continue;
      for (const qa of app.quickActions ?? []) {
        out.push({
          id: `qa-${app.id}-${qa.label}`,
          kind: 'action',
          title: qa.label,
          detail: `in ${app.name}`,
          glyph: { kind: 'icon', icon: qa.icon, gradient: app.gradient },
          run: () => launch(app.id, qa.label),
          primary: [...tokens(qa.label), ...tokens(app.name)],
          secondary: app.keywords.flatMap(tokens),
          phrases: [normalize(qa.label)],
          bias: KIND_BIAS.action,
        });
      }
    }

    // 3. People
    if (can('hub.people.view'))
      for (const u of users) {
        if (!u.active || u.id === me?.id) continue;
        out.push({
          id: `person-${u.id}`,
          kind: 'person',
          title: u.name,
          detail: `${u.title} · ${u.department}`,
          glyph: { kind: 'user', user: u },
          run: () => navigate(`/people?u=${u.id}`),
          primary: tokens(u.name),
          secondary: [...tokens(u.title), ...tokens(u.department), ...tokens(u.location ?? ''), ...(u.skills ?? []).flatMap(tokens)],
          phrases: [normalize(u.name), normalize(u.name.split(' ')[0] ?? '')],
          bias: KIND_BIAS.person,
        });
      }

    // 4. Hub pages
    for (const n of NAV_ITEMS) {
      if (n.to === '/') continue;
      if (n.perm && !(typeof n.perm === 'string' ? hasPermission(perms, n.perm) : hasAny(perms, n.perm))) continue;
      out.push({
        id: `page-${n.to}`,
        kind: 'page',
        title: n.label,
        detail: 'Go to page',
        glyph: { kind: 'icon', icon: n.to === '/apps' ? 'LayoutGrid' : n.to === '/people' ? 'Users' : n.to === '/news' ? 'Newspaper' : n.to === '/settings' ? 'Settings' : 'ShieldCheck' },
        run: () => navigate(n.to),
        primary: tokens(n.label),
        secondary: [],
        phrases: [normalize(n.label)],
        bias: KIND_BIAS.page,
      });
    }
    return out;
  }, [apps, perms, users, me?.id, launch, navigate, openAppSheet, openKudos]);

  return useCallback(
    (text: string): NovaResolution => {
      const query = text.trim();
      const q = tokens(query);
      const nq = normalize(query);
      if (!q.length || !nq) return { query, matches: [], confident: false };

      const scored: ScoredIntent[] = [];
      for (const c of candidates) {
        let raw = 0;
        let hit = 0;
        for (const t of q) {
          let best = 0;
          for (const p of c.primary) best = Math.max(best, tokenMatch(t, p));
          if (best < 1) for (const s of c.secondary) best = Math.max(best, tokenMatch(t, s) * 0.6);
          raw += best;
          if (best >= 0.6) hit++;
        }
        if (!hit) continue;
        const exact = c.phrases.some((p) => p && p === nq);
        const phrase = !exact && c.phrases.some((p) => p.length > 2 && (` ${nq} `.includes(` ${p} `) || (p.includes(' ') && nq.includes(p))));
        const coverage = hit / q.length;
        const score = raw / q.length + (exact ? 2 : 0) + (phrase ? 0.8 : 0) + c.bias;
        if (score < 0.45) continue;
        const { primary: _p, secondary: _s, phrases: _ph, bias: _b, ...intent } = c;
        void _p;
        void _s;
        void _ph;
        void _b;
        scored.push({ ...intent, score, coverage, exact });
      }
      scored.sort((a, b) => b.score - a.score);

      // De-duplicate identical titles (e.g. a curated verb and the same quick action).
      const seen = new Set<string>();
      const matches = scored.filter((s) => {
        const k = normalize(s.title);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const [first, second] = matches;
      const confident = !!first && !first.locked && (first.exact || (first.coverage >= 0.99 && first.score >= 1.3 && (!second || first.score - second.score >= 0.6)));
      return { query, matches: matches.slice(0, 5), confident };
    },
    [candidates],
  );
}
