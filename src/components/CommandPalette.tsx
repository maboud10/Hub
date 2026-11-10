import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  CornerDownLeft,
  FileText,
  GraduationCap,
  HeartPulse,
  History,
  Keyboard,
  LockKeyhole,
  LogOut,
  Megaphone,
  MessageCircleQuestion,
  Moon,
  PartyPopper,
  PenLine,
  Plane,
  Plus,
  Receipt,
  Rocket,
  ScrollText,
  Search,
  ShieldHalf,
  Signature,
  Sparkles,
  Timer,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { Presence } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { useFocus } from '@/store/focus';
import { useAppAccess, usePermissions, usePrefs, useSessionUser } from '@/store/selectors';
import { useWiki } from '@/wiki/store';
import { readableSpaceIds } from '@/wiki/access';
import { useAcademy } from '@/academy/store';
import { loadAllBridges, type AppPublicApi, type PaletteEntry } from '@/lib/appBridge';
import { hasAny, hasPermission } from '@/lib/rbac';
import { fuzzyMatch, fuzzyScore } from '@/lib/fuzzy';
import { useFocusTrap, usePresence } from '@/hooks/useOverlay';
import { useResolvedTheme } from '@/hooks/useApplyTheme';
import { AppIcon, Avatar, PRESENCE_LABEL } from '@/components/ui/primitives';
import { useLaunchApp } from '@/components/apps/useLaunchApp';
import { NAV_ITEMS } from '@/components/shell/nav';
import { NovaOrb } from '@/components/shell/Brand';
import { startFocusSession, stopFocusSession } from '@/components/FocusEngine';
import { getIcon } from '@/icons';
import { ArabicSigil, useI18n } from '@/lib/i18n';
import { BRAND } from '@/config/brand';
import { cx } from '@/lib/cx';

type Group = 'Recent' | 'Suggested' | 'Apps' | 'Actions' | 'Docs & Courses' | 'Work' | 'People' | 'Pages';
const GROUP_ORDER: Group[] = ['Recent', 'Suggested', 'Apps', 'Actions', 'Docs & Courses', 'Work', 'People', 'Pages'];
const GROUP_LIMIT: Record<Group, number> = {
  Recent: 4,
  Suggested: 5,
  Apps: 6,
  Actions: 6,
  'Docs & Courses': 6,
  Work: 6,
  People: 5,
  Pages: 5,
};

interface Item {
  id: string;
  group: Group;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  keywords?: string[];
  hint?: string;
  locked?: boolean;
  run: () => void;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const m = query ? fuzzyMatch(query, text) : null;
  if (!m || !m.indices.length) return <>{text}</>;
  const set = new Set(m.indices);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="palette__mark">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

const PRESENCES: Presence[] = ['online', 'focus', 'meeting', 'away'];

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  const ui = useUI();
  const { mounted, closing } = usePresence(open, 160);
  const navigate = useNavigate();
  const launch = useLaunchApp();
  const user = useSessionUser();
  const perms = usePermissions();
  const prefs = usePrefs();
  const apps = useAppAccess();
  const users = useHub((s) => s.users);
  const wikiSpaces = useWiki((s) => s.spaces);
  const wikiArticles = useWiki((s) => s.articles);
  const academyCourses = useAcademy((s) => s.courses);
  const roles = useHub((s) => s.roles);
  const { updatePrefs, setPresence, logout } = useHub.getState();
  const focusMode = useFocus((s) => s.mode);
  const theme = useResolvedTheme();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, inputRef);

  // Workspace apps (Projects, Drive, Pulse Chat, IT Helpdesk) contribute actions + objects
  // through their App Bridge. Loaded lazily on open so app stores stay out of the main
  // bundle; a fresh array on every open re-snapshots their data.
  const [bridgeApis, setBridgeApis] = useState<AppPublicApi[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadAllBridges().then((apis) => {
      if (alive) setBridgeApis(apis);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      // A Nova prompt (e.g. on the Launchpad) may hand over a query to start from.
      const pending = useUI.getState().paletteQuery;
      setQuery(pending);
      setActive(0);
      if (pending) useUI.setState({ paletteQuery: '' });
    }
  }, [open]);

  const close = () => setOpen(false);
  const go = (to: string) => () => {
    close();
    navigate(to);
  };

  const allItems = useMemo<Item[]>(() => {
    if (!user) return [];
    const items: Item[] = [];
    const can = (p: string) => hasPermission(perms, p);

    // Apps + their quick actions
    for (const { app, access } of apps) {
      if (access === 'disabled') continue;
      items.push({
        id: `app-${app.id}`,
        group: 'Apps',
        title: app.name,
        subtitle: access === 'granted' ? app.tagline : access === 'pending' ? 'Request pending' : `Locked · ${app.category}`,
        icon: <AppIcon app={app} size={32} locked={access !== 'granted'} />,
        keywords: [app.category, ...app.keywords, app.description],
        hint: access === 'granted' ? 'Launch' : access === 'pending' ? 'View request' : 'Request access',
        locked: access !== 'granted',
        run: () => (access === 'granted' ? launch(app.id) : ui.openAppSheet(app.id)),
      });
      if (access === 'granted')
        for (const qa of app.quickActions ?? []) {
          const Icon = getIcon(qa.icon);
          items.push({
            id: `qa-${app.id}-${qa.label}`,
            group: 'Actions',
            title: qa.label,
            subtitle: `in ${app.name}`,
            icon: (
              <span className="palette__glyph" style={{ background: `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`, color: '#fff' }}>
                <Icon />
              </span>
            ),
            keywords: [app.name, ...app.keywords],
            hint: 'Run',
            run: () => launch(app.id, qa.label),
          });
        }
    }

    // Hub actions (permission-aware)
    const action = (id: string, title: string, icon: ReactNode, run: () => void, keywords: string[] = [], subtitle?: string) =>
      items.push({ id, group: 'Actions', title, icon: <span className="palette__glyph">{icon}</span>, run, keywords, subtitle, hint: 'Run' });

    action('theme', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`, <Moon />, () => updatePrefs({ theme: theme === 'dark' ? 'light' : 'dark' }), ['theme', 'appearance', 'dark', 'light']);
    action(
      'locale',
      useI18n.getState().locale === 'ar' ? 'Switch language to English (LTR)' : 'Switch language to Arabic · التبديل إلى العربية (RTL)',
      <ArabicSigil size={16} />,
      () => useI18n.getState().toggleLocale(),
      ['language', 'arabic', 'english', 'rtl', 'ltr', 'عربي', 'العربية', 'لغة'],
      'Shortcut: L',
    );
    for (const p of PRESENCES)
      if (p !== user.presence)
        action(`presence-${p}`, `Set status: ${PRESENCE_LABEL[p]}`, <span className={`dot dot--${p}`} />, () => setPresence(p), ['status', 'presence', 'available', 'busy', 'dnd']);
    if (focusMode === 'idle') action('focus', 'Start a 25-minute focus session', <Timer />, () => startFocusSession(25), ['pomodoro', 'focus', 'timer', 'deep work', 'dnd']);
    else action('focus-stop', 'End focus session', <Timer />, () => stopFocusSession(), ['pomodoro', 'focus', 'timer']);
    if (can('hub.kudos.give')) action('kudos', 'Give kudos', <PartyPopper />, () => ui.openKudos(), ['thanks', 'recognition', 'appreciate', 'shoutout']);
    if (can('hub.news.publish')) action('publish', 'Publish an announcement', <Megaphone />, go('/news?compose=1'), ['news', 'post', 'broadcast']);
    if (can('hub.requests.review')) action('review', 'Review access requests', <ClipboardList />, go('/admin/requests'), ['approve', 'deny', 'access']);
    if (can('hub.users.manage')) action('users', 'Manage users & roles', <UserCog />, go('/admin/users'), ['admin', 'assign', 'deactivate']);
    if (can('hub.roles.manage')) action('roles', 'Edit permission matrix', <ShieldHalf />, go('/admin/roles'), ['rbac', 'permissions', 'roles']);
    if (can('hub.apps.manage')) action('register', 'Register a new app', <Plus />, go('/admin/apps'), ['add app', 'catalog', 'tile']);
    if (can('hub.audit.view')) action('audit', 'Open audit log', <ScrollText />, go('/admin/audit'), ['security', 'logs', 'history']);
    if (can('app:recruit')) {
      action('talent-pipeline', 'Open the hiring pipeline', <UserPlus />, go('/talent/pipeline'), ['ats', 'candidates', 'kanban', 'recruiting', 'talent']);
      if (can('talent.source'))
        action('talent-source', 'Source candidates from a job description', <Sparkles />, go('/talent/sourcing'), ['linkedin', 'jd', 'job description', 'ai', 'outreach', 'headhunt', 'search']);
      if (can('talent.manage') || can('talent.hire'))
        action('talent-req', 'Raise a new requisition', <Briefcase />, go('/talent/requisitions/new'), ['headcount', 'job', 'role', 'hiring', 'vacancy']);
      action('talent-interviews', 'My interviews & scorecards', <CalendarClock />, go('/talent/interviews'), ['feedback', 'scorecard', 'interview', 'panel']);
      if (can('talent.manage') || can('talent.offers.approve') || can('talent.hire'))
        action('talent-offers', 'Offers & approvals', <Signature />, go('/talent/offers'), ['offer', 'approve', 'compensation', 'contract']);
    }
    if (can('app:hr')) {
      action('hr-timeoff', 'Request time off', <Plane />, go('/hr/time-off?new=1'), ['leave', 'vacation', 'holiday', 'pto', 'sick', 'annual', 'wfa', 'remote']);
      action('hr-letter', 'Get a salary certificate or letter', <FileText />, go('/hr/documents?tab=letters'), ['letter', 'salary certificate', 'noc', 'embassy', 'bank letter', 'employment']);
      action('hr-payslips', 'My payslips', <Receipt />, go('/hr/documents?tab=payslips'), ['salary', 'pay', 'payslip', 'payroll']);
      action('hr-benefits', 'Benefits & allowances', <HeartPulse />, go('/hr/benefits'), ['insurance', 'medical', 'claim', 'learning budget', 'wellness', 'dependents']);
      action('hr-approvals', 'HR approvals', <ClipboardCheck />, go('/hr/approvals'), ['approve leave', 'time off requests', 'claims', 'team']);
      action('hr-ask', 'Ask People Ops', <MessageCircleQuestion />, go('/hr?ask=1'), ['help', 'hr question', 'support', 'confidential']);
      action('hr-onboarding', 'Onboarding journeys', <Rocket />, go('/hr/onboarding'), ['new hire', 'buddy', 'onboarding', '30 60 90', 'pre-boarding']);
    }
    if (can('app:wiki')) {
      action('wiki-ask', 'Ask Nova Docs (Knowledge Base Q&A)', <Sparkles />, go('/wiki?ask=1'), ['cortex', 'ai', 'docs', 'policy', 'wiki', 'runbook', 'how to']);
      if (can('wiki.write'))
        action('wiki-new', 'Write a Knowledge Base playbook', <PenLine />, go('/wiki/new'), ['create doc', 'rfc', 'runbook', 'wiki', 'guide']);
      if (can('wiki.manage'))
        action('wiki-gov', 'Knowledge Base governance & freshness', <ShieldHalf />, go('/wiki/governance'), ['proposals', 'stale', 'curate', 'wiki']);
    }
    if (can('app:learning')) {
      action('academy-home', 'Open Helix Academy', <GraduationCap />, go('/academy'), ['learning', 'courses', 'training', 'compliance', 'lms']);
      action('academy-certs', 'View my Academy certificates', <Award />, go('/academy/certificates'), ['credential', 'badge', 'certificate', 'skills']);
    }
    if (can('app:expenses') || can('app:travel')) {
      action('exp-travel-new', 'Request business travel pre-approval', <Plane />, go('/expenses/travel?new=1'), ['trip', 'flight', 'hotel', 'per diem', 'virtual card', 'travel']);
      action('exp-receipt', 'Upload smart receipt (OCR vault)', <Receipt />, go('/expenses/receipts'), ['receipt', 'scan', 'invoice', 'vat', 'expense']);
      action('exp-track', 'Track my expense reimbursements', <History />, go('/expenses/reimbursements'), ['reimbursement', 'status', 'payout', 'claim', 'paid']);
      if (can('expenses.approve') || can('expenses.audit'))
        action('exp-approvals', 'Review travel & expense approvals', <ClipboardCheck />, go('/expenses/approvals'), ['approve expense', 'audit', 'finance queue', 'manager']);
    }
    // Workspace apps: actions + objects the viewer may see, straight from each app's bridge.
    const viewer = { user, roles, perms };
    for (const api of bridgeApis) {
      if (!can(`app:${api.appId}`)) continue;
      let entries: PaletteEntry[] = [];
      try {
        entries = api.paletteEntries(viewer);
      } catch {
        entries = [];
      }
      for (const e of entries)
        items.push({
          id: e.id,
          group: e.group,
          title: e.title,
          subtitle: e.subtitle,
          icon: (
            <span className="palette__glyph" style={e.glyphColor ? { background: e.glyphColor, color: '#0b1220' } : undefined}>
              {e.icon ?? <Sparkles />}
            </span>
          ),
          keywords: e.keywords,
          hint: e.hint ?? (e.group === 'Actions' ? 'Run' : 'Open'),
          run: go(e.to),
        });
    }
    if (can('app:payroll')) {
      action('pay-run', 'Open Payroll Console & active pay run', <Wallet />, go('/payroll'), ['payroll', 'payday', 'wps', 'sif', 'disburse', 'salaries']);
      action('pay-bonuses', 'Bonuses, spot awards & variable pay', <Award />, go('/payroll/bonuses'), ['bonus', 'spot award', 'signing', 'performance', 'nominate']);
      action('pay-comp', 'Compensation reports, bands & EOSB liability', <TrendingUp />, go('/payroll/compensation'), ['salary bands', 'compa ratio', 'equity', 'gratuity', 'eosb', 'total rewards']);
    }
    action('notifications', 'Open notifications', <Bell />, () => (close(), ui.setNotificationsOpen(true)), ['alerts', 'inbox']);
    action('persona', 'Switch persona (demo)', <UserCog />, () => ui.setPersonaSwitcherOpen(true), ['login', 'role', 'user', 'impersonate']);
    action('shortcuts', 'Keyboard shortcuts', <Keyboard />, () => (close(), ui.setShortcutsOpen(true)), ['help', 'keys', 'hotkeys']);
    action('logout', 'Sign out', <LogOut />, () => (close(), logout(), navigate('/login')), ['logout', 'exit']);

    // Permission-scoped Knowledge Base articles + Academy courses
    if (can('app:wiki')) {
      const allowedSpaces = readableSpaceIds({ userId: user.id, roleIds: user.roleIds, perms }, wikiSpaces);
      const spaceNameById = new Map(wikiSpaces.map((s) => [s.id, s.name]));
      for (const a of wikiArticles) {
        if (!allowedSpaces.has(a.spaceId)) continue;
        items.push({
          id: `doc-${a.slug}`,
          group: 'Docs & Courses',
          title: a.title,
          subtitle: `Playbook · ${spaceNameById.get(a.spaceId) ?? a.spaceId} · ${a.readMins}m read`,
          icon: (
            <span className="palette__glyph">
              <BookOpen />
            </span>
          ),
          keywords: [...a.tags, a.tldr, a.subtitle],
          hint: 'Read',
          run: go(`/wiki/doc/${a.slug}`),
        });
      }
    }
    if (can('app:learning')) {
      for (const c of academyCourses) {
        items.push({
          id: `course-${c.id}`,
          group: 'Docs & Courses',
          title: c.title,
          subtitle: `Academy · ${c.durationMins}m · ${c.xp} XP`,
          icon: (
            <span className="palette__glyph">
              <GraduationCap />
            </span>
          ),
          keywords: [...c.skills, c.track, c.tagline],
          hint: 'Start',
          run: go(`/academy/course/${c.id}`),
        });
      }
    }

    // People
    if (can('hub.people.view'))
      for (const u of users)
        if (u.active && u.id !== user.id)
          items.push({
            id: `person-${u.id}`,
            group: 'People',
            title: u.name,
            subtitle: `${u.title} · ${u.department}`,
            icon: <Avatar user={u} size={32} presence />,
            keywords: [u.department, u.title, u.location, ...u.skills],
            hint: 'Profile',
            run: go(`/people?u=${u.id}`),
          });

    // Pages
    for (const n of NAV_ITEMS) {
      if (n.perm && !(typeof n.perm === 'string' ? hasPermission(perms, n.perm) : hasAny(perms, n.perm))) continue;
      const Icon = n.icon;
      items.push({ id: `page-${n.to}`, group: 'Pages', title: n.label, subtitle: 'Go to page', icon: <span className="palette__glyph"><Icon /></span>, hint: 'Go', run: go(n.to) });
    }
    return items;
  }, [user, perms, apps, users, wikiSpaces, wikiArticles, academyCourses, roles, bridgeApis, theme, focusMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const q = query.trim();
    let list: Item[];
    if (!q) {
      const recent = prefs.recents
        .map((r) => allItems.find((i) => i.id === `app-${r.appId}` && !i.locked))
        .filter((i): i is Item => !!i)
        .map((i) => ({ ...i, group: 'Recent' as Group }));
      const suggested = allItems
        .filter((i) => i.id.startsWith('qa-') || ['focus', 'kudos', 'review', 'publish'].includes(i.id))
        .slice(0, 5)
        .map((i) => ({ ...i, group: 'Suggested' as Group }));
      list = [...recent, ...suggested, ...allItems.filter((i) => i.group === 'Pages')];
    } else {
      list = allItems
        .map((i) => ({ i, s: fuzzyScore(q, i.title, [i.subtitle ?? '', ...(i.keywords ?? [])]) }))
        .filter((x) => x.s !== null)
        .sort((a, b) => b.s!.score - a.s!.score)
        .map((x) => x.i);
    }
    const grouped = GROUP_ORDER.map((g) => ({ group: g, items: list.filter((i) => i.group === g).slice(0, GROUP_LIMIT[g]) })).filter((g) => g.items.length);
    return { grouped, flat: grouped.flatMap((g) => g.items) };
  }, [query, allItems, prefs.recents]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!mounted) return null;

  const runItem = (item: Item | undefined) => {
    if (!item) return;
    const keepsOpen = item.id === 'persona';
    if (!keepsOpen) close();
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(results.flat[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  let index = -1;
  return createPortal(
    <>
      <div className={cx('scrim palette-scrim', closing && 'is-closing')} onClick={close} />
      <div ref={panelRef} className={cx('palette', closing && 'is-closing')} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette__input-row">
          <NovaOrb size={30} />
          <input
            ref={inputRef}
            className="palette__input"
            placeholder={`Ask ${BRAND.assistant} — apps, people, actions…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results.flat[active] ? `pal-${results.flat[active].id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="kbd palette__esc" onClick={close} aria-label="Close">
            esc
          </button>
        </div>

        <div className="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {results.flat.length === 0 && (
            <div className="palette__empty">
              <Search size={22} />
              <div>
                No matches for “<strong>{query}</strong>”.
              </div>
              <div className="text-sm faint">Try an app, a colleague, or a task like “book a room”.</div>
            </div>
          )}
          {results.grouped.map(({ group, items }) => (
            <div key={group} role="group" aria-label={group}>
              <div className="palette__group">
                {group === 'Recent' && <History size={12} />}
                {group === 'People' && <Users size={12} />}
                {group}
              </div>
              {items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={item.id + group}
                    id={`pal-${item.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    className={cx('palette__item', i === active && 'is-active', item.locked && 'is-locked')}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => runItem(item)}
                  >
                    <span className="palette__icon">{item.icon}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="palette__title truncate">
                        <Highlight text={item.title} query={query} />
                      </span>
                      {item.subtitle && <span className="palette__sub truncate">{item.subtitle}</span>}
                    </span>
                    {item.locked && <LockKeyhole size={14} className="faint" />}
                    <span className="palette__hint">
                      {item.hint}
                      {i === active ? <CornerDownLeft size={13} /> : <ArrowRight size={13} />}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette__foot">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> select
          </span>
          <span className="spacer" />
          <span className="palette__brand">
            {BRAND.assistant} · permission-aware search
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}
