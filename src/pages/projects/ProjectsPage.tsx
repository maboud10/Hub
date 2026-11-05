import '@/styles/projects.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Inbox,
  Keyboard,
  LayoutGrid,
  LayoutTemplate,
  Layers,
  Lock,
  Plus,
  Search,
  Sparkles,
  Star,
  Target,
  X,
} from 'lucide-react';
import { initProjects, taskLink, useProjects } from '@/projects/store';
import { searchWork, useMyProjectsState, useMyTasks, useProjectsCaps, useVisibleProjects, useWorkInbox } from '@/projects/selectors';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { firstName, greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { MyTasksView } from './MyTasksView';
import { InboxView } from './InboxView';
import { BrowseView } from './BrowseView';
import { PortfoliosView } from './PortfoliosView';
import { GoalsView } from './GoalsView';
import { TemplatesView } from './TemplatesView';
import { ProjectView } from './ProjectView';
import { TaskPanel } from './TaskPanel';
import { emitQuickAdd, ProjectIcon, useTaskParam } from './shared';

const isTyping = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
};

export function ProjectsPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const location = useLocation();
  const caps = useProjectsCaps();
  const cards = useVisibleProjects();
  const allTasks = useProjects((s) => s.tasks);
  const my = useMyTasks();
  const inbox = useWorkInbox();
  const state = useMyProjectsState();
  const { taskId, close: closeTask } = useTaskParam();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initProjects();
  }, []);

  const onProjectRoute = location.pathname.startsWith('/projects/p/');
  const supportsQuickAdd = onProjectRoute || location.pathname === '/projects';

  // Document-level shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'c' && supportsQuickAdd) {
        e.preventDefault();
        emitQuickAdd();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [supportsQuickAdd]);

  // Close the search dropdown on outside click.
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchOpen]);

  const hits = useMemo(() => searchWork(query, cards, allTasks, 6), [query, cards, allTasks]);
  const showHits = searchOpen && query.trim().length > 0;

  const cardById = useMemo(() => new Map(cards.map((c) => [c.project.id, c])), [cards]);
  const starred = state.starredProjectIds.map((id) => cardById.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const recent = state.recentProjectIds
    .filter((id) => !state.starredProjectIds.includes(id))
    .map((id) => cardById.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 6);

  const goToHit = (to: string) => {
    setSearchOpen(false);
    setQuery('');
    navigate(to);
  };

  if (!caps.canUse) {
    return (
      <div className="page pj-page">
        <EmptyState icon={<Lock />} title="Projects isn’t enabled for your role">
          Ask your workspace admin for access to Helix Projects.
        </EmptyState>
      </div>
    );
  }

  const counts = my?.counts ?? { open: 0, dueToday: 0, overdue: 0, blocked: 0 };

  const navItems = [
    { to: '/projects', label: 'My Tasks', icon: CheckCircle2, end: true, count: counts.open || undefined },
    { to: '/projects/inbox', label: 'Inbox', icon: Inbox, count: inbox.unread || undefined, alert: inbox.unread > 0 },
    { to: '/projects/browse', label: 'Browse projects', icon: LayoutGrid, count: cards.length || undefined },
    { to: '/projects/portfolios', label: 'Portfolios', icon: Layers },
    { to: '/projects/goals', label: 'Goals', icon: Target },
    { to: '/projects/templates', label: 'Templates', icon: LayoutTemplate },
  ];

  return (
    <div className="page pj-page">
      <header className={cx('pj-hero hud', onProjectRoute && 'pj-hero--slim')}>
        <div className="pj-hero__glow" aria-hidden="true" />
        <div className="pj-hero__main">
          <div className="eyebrow pj-hero__eyebrow">Helix Projects · Mission Control</div>
          <h1 className="pj-hero__title">
            {greeting()}
            {me ? `, ${firstName(me.name)}` : ''}.{' '}
            <span className="pj-hero__accent">{onProjectRoute ? 'Ship it together' : 'Here’s your work at a glance'}</span>
          </h1>
          {!onProjectRoute && (
            <p className="pj-hero__sub">Plan in lists, boards and timelines; triage My Tasks; keep leadership in the loop with Nova-drafted status updates.</p>
          )}
          <div className="pj-hero__pills">
            <Link to="/projects" className="pj-stat-chip">
              <CheckCircle2 /> <b>{counts.open}</b> open
            </Link>
            <Link to="/projects" className={cx('pj-stat-chip', counts.dueToday > 0 && 'pj-stat-chip--warn')}>
              <CalendarCheck /> <b>{counts.dueToday}</b> due today
            </Link>
            <Link to="/projects" className={cx('pj-stat-chip', counts.overdue > 0 && 'pj-stat-chip--danger')}>
              <AlertTriangle /> <b>{counts.overdue}</b> overdue
            </Link>
            {counts.blocked > 0 && (
              <Link to="/projects" className="pj-stat-chip">
                <Lock /> <b>{counts.blocked}</b> blocked
              </Link>
            )}
            {inbox.unread > 0 && (
              <Link to="/projects/inbox" className="pj-stat-chip pj-stat-chip--accent">
                <Inbox /> <b>{inbox.unread}</b> new in inbox
              </Link>
            )}
          </div>
        </div>
        <div className="pj-hero__cta">
          {caps.canCreate && (
            <button type="button" className="btn btn--primary pj-btn-violet" onClick={() => navigate('/projects/browse?new=1')}>
              <Plus /> New project
            </button>
          )}
          {supportsQuickAdd && (
            <button type="button" className="btn" onClick={() => emitQuickAdd()} title="Press c anywhere">
              <Plus /> Add task <span className="kbd pj-kbd">c</span>
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard />
          </button>
        </div>
      </header>

      <div className="pj-shell">
        <aside className="pj-side" aria-label="Projects workspace">
          <div ref={searchWrapRef} className="pj-search">
            <div className="pj-search__box">
              <Search aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                className="pj-search__input"
                placeholder="Search projects & tasks…"
                aria-label="Search projects and tasks"
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                    searchRef.current?.blur();
                  }
                  if (e.key === 'Enter') {
                    const first = hits.projects[0] ? `/projects/p/${hits.projects[0].id}` : hits.tasks[0] ? taskLink(hits.tasks[0].project.id, hits.tasks[0].task.id) : null;
                    if (first) goToHit(first);
                  }
                }}
              />
              {query ? (
                <button type="button" className="pj-search__clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X />
                </button>
              ) : (
                <span className="kbd pj-kbd pj-search__kbd">/</span>
              )}
            </div>
            {showHits && (
              <div className="pj-search__pop">
                {hits.projects.length === 0 && hits.tasks.length === 0 ? (
                  <div className="pj-search__empty">Nothing matches “{query}”.</div>
                ) : (
                  <>
                    {hits.projects.length > 0 && <div className="pj-search__group">Projects</div>}
                    {hits.projects.map((p) => (
                      <button key={p.id} type="button" className="pj-search__item" onClick={() => goToHit(`/projects/p/${p.id}`)}>
                        <ProjectIcon project={p} size={26} />
                        <span className="grow truncate">
                          {p.name}
                          <small>
                            {p.key} · {p.department}
                          </small>
                        </span>
                      </button>
                    ))}
                    {hits.tasks.length > 0 && <div className="pj-search__group">Tasks</div>}
                    {hits.tasks.map(({ task, project }) => (
                      <button key={task.id} type="button" className="pj-search__item" onClick={() => goToHit(taskLink(project.id, task.id))}>
                        <span className="pj-search__ref mono">
                          {project.key}-{task.number}
                        </span>
                        <span className="grow truncate">
                          {task.title}
                          <small>{project.name}</small>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <nav className="pj-side__nav">
            {navItems.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('pj-side__item', isActive && 'is-active')}>
                  <Icon aria-hidden="true" />
                  <span className="grow truncate">{n.label}</span>
                  {!!n.count && <span className={cx('pj-side__count', n.alert && 'is-alert')}>{n.count}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className="pj-side__group">
            <div className="pj-side__label">
              <Star /> Starred
            </div>
            {starred.length === 0 ? (
              <p className="pj-side__hint">Star a project to pin it here.</p>
            ) : (
              <ul className="pj-side__projects">
                {starred.map((c) => (
                  <li key={c.project.id}>
                    <NavLink to={`/projects/p/${c.project.id}`} className={({ isActive }) => cx('pj-side__proj', isActive && 'is-active')}>
                      <i className="pj-side__dot" style={{ background: c.project.color }} />
                      <span className="pj-side__emoji">{c.project.icon}</span>
                      <span className="grow truncate">{c.project.name}</span>
                      {c.myOpenTasks > 0 && <span className="pj-side__mini">{c.myOpenTasks}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {recent.length > 0 && (
            <div className="pj-side__group">
              <div className="pj-side__label">
                <Clock /> Recent
              </div>
              <ul className="pj-side__projects">
                {recent.map((c) => (
                  <li key={c.project.id}>
                    <NavLink to={`/projects/p/${c.project.id}`} className={({ isActive }) => cx('pj-side__proj', isActive && 'is-active')}>
                      <i className="pj-side__dot" style={{ background: c.project.color }} />
                      <span className="pj-side__emoji">{c.project.icon}</span>
                      <span className="grow truncate">{c.project.name}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {caps.canCreate ? (
            <button type="button" className="btn btn--block pj-side__new" onClick={() => navigate('/projects/browse?new=1')}>
              <Plus /> New project
            </button>
          ) : (
            <p className="pj-side__hint pj-side__contractor">
              <Lock /> As a contractor you work inside projects you’re invited to.
            </p>
          )}
        </aside>

        <main className="pj-main">
          <Routes>
            <Route index element={<MyTasksView />} />
            <Route path="inbox" element={<InboxView />} />
            <Route path="browse" element={<BrowseView />} />
            <Route path="portfolios" element={<PortfoliosView />} />
            <Route path="goals" element={<GoalsView />} />
            <Route path="templates" element={<TemplatesView />} />
            <Route path="p/:projectId" element={<ProjectView />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </main>
      </div>

      {taskId && <TaskPanel taskId={taskId} onClose={closeTask} />}

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" icon={<Sparkles className="pj-modal-icon" />} width={420}>
        <ul className="pj-shortcuts">
          <li>
            <span className="kbd">c</span> Quick-add a task (My Tasks or the open project)
          </li>
          <li>
            <span className="kbd">/</span> Focus search
          </li>
          <li>
            <span className="kbd">Esc</span> Close the task panel or any menu
          </li>
          <li>
            <span className="kbd">?</span> Show this help
          </li>
        </ul>
      </Modal>
    </div>
  );
}
