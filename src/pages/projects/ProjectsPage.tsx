/**
 * Helix Projects — "Mission Orbit".
 * Shell: rail + project navigator + stage (nested routes) + floating task panel.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router';
import { Archive, Copy, Link2, PanelLeftClose, Plus, Star, StarOff } from 'lucide-react';
import '@/styles/neo.css';
import '@/styles/projects.css';
import './screens.css';
import { NeoEmpty, NeoRail, NeoSearch, NeoSide, NeoSideGroup, NeoSideItem, NeoStage, NeoWorkspace, useContextMenu, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { toast } from '@/store/toast';
import { canCreateProject, createProjectReason, isProjectsAdmin } from '@/projects/access';
import { useProjects } from '@/projects/store';
import type { Project } from '@/projects/types';
import { ProjectsUIContext, useActor, useMyState, useVisibleProjects, type ProjectsUI, type QuickAddDefaults } from './ctx';
import { BrandMissionOrbit, IconInbox, IconMyWork, IconPortfolios, IconProjectsGrid, IconWorkload } from './icons';
import { ProjectGlyph, UndoBar } from './ui';
import { QuickCapture } from './QuickCapture';
import { TaskPanelHost } from './TaskPanel';
import { MyWork } from './MyWork';

const Inboxes = lazy(() => import('./Inbox').then((m) => ({ default: m.InboxScreen })));
const Browse = lazy(() => import('./Browse').then((m) => ({ default: m.BrowseScreen })));
const ProjectView = lazy(() => import('./ProjectView').then((m) => ({ default: m.ProjectView })));
const Portfolios = lazy(() => import('./Portfolios').then((m) => ({ default: m.PortfoliosScreen })));
const PortfolioDetail = lazy(() => import('./Portfolios').then((m) => ({ default: m.PortfolioDetail })));
const Workload = lazy(() => import('./Workload').then((m) => ({ default: m.WorkloadScreen })));

const TINT = { c1: '#a78bfa', c2: '#6d28d9' };

export function ProjectsPage() {
  const actor = useActor();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const narrow = useMediaQuery('(max-width: 1100px)');
  const me = useMyState();
  const setSideCollapsed = useProjects((s) => s.setSideCollapsed);
  const [peek, setPeek] = useState(false);
  const [quick, setQuick] = useState<QuickAddDefaults | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sideSearchRef = useRef<HTMLInputElement | null>(null);
  const projectMatch = useMatch('/projects/p/:projectId/*');
  const currentProjectId = projectMatch?.params.projectId ?? null;

  const taskId = params.get('task');
  const collapsed = me.sideCollapsed && !narrow;

  // close the floating side panel on navigation (narrow screens)
  useEffect(() => setPeek(false), [location.pathname]);

  // due-soon automations sweep once per session
  useEffect(() => {
    const n = useProjects.getState().runDueSoonSweep();
    if (n) toast.info('Automations ran', `${n} due-date ${n === 1 ? 'rule' : 'rules'} fired`);
  }, []);

  const openTask = useCallback(
    (id: string) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set('task', id);
          return n;
        },
        { replace: false },
      ),
    [setParams],
  );
  const closeTask = useCallback(
    () =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('task');
        return n;
      }),
    [setParams],
  );
  const toggleSide = useCallback(() => {
    if (narrow) setPeek((v) => !v);
    else setSideCollapsed(!me.sideCollapsed);
  }, [narrow, me.sideCollapsed, setSideCollapsed]);

  const ui: ProjectsUI = useMemo(
    () => ({
      taskId,
      openTask,
      closeTask,
      quickAdd: (d) => setQuick(d ?? {}),
      toggleSide,
      registerSearch: (el) => {
        searchRef.current = el;
      },
    }),
    [taskId, openTask, closeTask, toggleSide],
  );

  useHotkeys({
    c: (e) => {
      if (document.querySelector('.modal')) return;
      e.preventDefault();
      const capture = document.querySelector<HTMLInputElement>('[data-capture="main"]');
      if (capture && location.pathname === '/projects') {
        capture.focus();
        return;
      }
      setQuick({ projectId: currentProjectId });
    },
    s: (e) => {
      if (document.querySelector('.modal')) return;
      e.preventDefault();
      const target = searchRef.current && document.body.contains(searchRef.current) ? searchRef.current : sideSearchRef.current;
      if (target === sideSearchRef.current && (collapsed || narrow)) {
        if (narrow) setPeek(true);
        else setSideCollapsed(false);
        requestAnimationFrame(() => sideSearchRef.current?.focus());
        return;
      }
      target?.focus();
    },
    '[': () => toggleSide(),
    ']': () => taskId && closeTask(),
    escape: () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        el.blur();
        return;
      }
      if (document.querySelector('.modal')) return;
      if (taskId) closeTask();
      else if (peek) setPeek(false);
    },
  });

  if (!actor) return null;
  const unread = 0;

  return (
    <ProjectsUIContext.Provider value={ui}>
      <NeoWorkspace app="projects" tint={TINT} side={!collapsed} sidePeek={peek} onSidePeekChange={setPeek} className={collapsed ? 'pj-side-off' : undefined}>
        <ProjectsRail canWorkload={isProjectsAdmin(actor)} unreadFallback={unread} />
        {!collapsed && <ProjectNavigator currentId={currentProjectId} searchRef={sideSearchRef} onCollapse={toggleSide} narrow={narrow} />}
        <NeoStage label="Helix Projects">
          <Suspense fallback={<StageLoading />}>
            <Routes>
              <Route index element={<MyWork />} />
              <Route path="inbox" element={<Inboxes />} />
              <Route path="browse" element={<Browse />} />
              <Route path="p/:projectId" element={<ProjectRoute />} />
              <Route path="p/:projectId/:view" element={<ProjectRoute />} />
              <Route path="portfolios" element={<Portfolios />} />
              <Route path="portfolios/:portfolioId" element={<PortfolioDetail />} />
              <Route path="workload" element={isProjectsAdmin(actor) ? <Workload /> : <Denied title="Workload is for managers" body="Team capacity is visible to people leaders and Projects admins." />} />
              <Route path="*" element={<Denied title="Nothing here" body="That page doesn’t exist in Projects." />} />
            </Routes>
          </Suspense>
        </NeoStage>
        <TaskPanelHost />
        <UndoBar />
      </NeoWorkspace>
      <Modal
        open={!!quick}
        onClose={() => setQuick(null)}
        title="New task"
        subtitle="Type naturally — dates, @people, #projects, !priority and +tags are understood."
        width={620}
        className="neo-portal pj-modal pj-quickmodal"
      >
        {quick && (
          <QuickCapture
            variant="modal"
            defaults={quick}
            autoFocus
            onCreated={(id, t) => {
              setQuick(null);
              const p = t.projectId;
              if (p && !location.pathname.startsWith(`/projects/p/${p}`)) navigate(`/projects/p/${p}?task=${id}`);
              else openTask(id);
            }}
          />
        )}
      </Modal>
    </ProjectsUIContext.Provider>
  );
}

function ProjectRoute() {
  const { projectId = '', view } = useParams();
  return <ProjectView key={projectId} projectId={projectId} view={view} />;
}

function StageLoading() {
  return (
    <div className="pj-loading" aria-busy="true">
      <span className="pj-loading__orbit" />
    </div>
  );
}

function Denied({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate();
  return (
    <div className="neo-body neo-pad">
      <NeoEmpty
        icon={<BrandMissionOrbit />}
        title={title}
        action={
          <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/projects')}>
            Back to My Work
          </button>
        }
      >
        {body}
      </NeoEmpty>
    </div>
  );
}

/* ───────────────────────── rail ───────────────────────── */

function ProjectsRail({ canWorkload }: { canWorkload: boolean; unreadFallback: number }) {
  const actor = useActor();
  const inbox = useProjects((s) => s.inbox);
  const unread = useMemo(() => inbox.filter((i) => i.userId === actor?.id && !i.read && !i.archived).length, [inbox, actor]);
  return (
    <NeoRail
      label="Projects navigation"
      brand={{ icon: <BrandMissionOrbit />, label: 'Helix Projects', to: '/projects' }}
      items={[
        { to: '/projects', label: 'My Work', icon: <IconMyWork />, end: true },
        { to: '/projects/inbox', label: 'Inbox', icon: <IconInbox />, badge: unread || null },
        { to: '/projects/browse', label: 'Projects', icon: <IconProjectsGrid />, match: (p) => p.startsWith('/projects/browse') || p.startsWith('/projects/p/') },
        { to: '/projects/portfolios', label: 'Portfolios', icon: <IconPortfolios /> },
        ...(canWorkload ? [{ to: '/projects/workload', label: 'Workload', icon: <IconWorkload /> }] : []),
      ]}
    />
  );
}

/* ───────────────────────── project navigator ───────────────────────── */

function ProjectNavigator({
  currentId,
  searchRef,
  onCollapse,
  narrow,
}: {
  currentId: string | null;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onCollapse: () => void;
  narrow: boolean;
}) {
  const actor = useActor();
  const navigate = useNavigate();
  const projects = useVisibleProjects();
  const tasks = useProjects((s) => s.tasks);
  const me = useMyState();
  const toggleStar = useProjects((s) => s.toggleStar);
  const archive = useProjects((s) => s.archiveProject);
  const [q, setQ] = useState('');
  const ctx = useContextMenu();

  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) if (t.projectId && !t.completedAt) m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1);
    return m;
  }, [tasks]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? projects.filter((p) => `${p.name} ${p.key} ${p.department}`.toLowerCase().includes(s)) : projects;
  }, [projects, q]);
  const starred = filtered.filter((p) => me.starred.includes(p.id));
  const groups = useMemo(() => {
    const m = new Map<string, Project[]>();
    for (const p of filtered) m.set(p.department, [...(m.get(p.department) ?? []), p]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const canCreate = actor ? canCreateProject(actor) : false;
  const menuFor = (p: Project): MenuEntry[] => [
    { label: me.starred.includes(p.id) ? 'Unstar' : 'Star', icon: me.starred.includes(p.id) ? <StarOff /> : <Star />, onSelect: () => toggleStar(p.id) },
    { label: 'Open board', icon: <IconProjectsGrid />, onSelect: () => navigate(`/projects/p/${p.id}/board`) },
    {
      label: 'Copy link',
      icon: <Link2 />,
      onSelect: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}/projects/p/${p.id}`);
        toast.success('Link copied');
      },
    },
    { kind: 'sep' },
    {
      label: 'Archive',
      icon: <Archive />,
      onSelect: () => {
        const r = archive(p.id, true);
        if (toast.result(r, `${p.name} archived`)) return;
      },
    },
  ];

  const item = (p: Project) => (
    <NeoSideItem
      key={p.id}
      to={`/projects/p/${p.id}`}
      icon={<ProjectGlyph project={p} size={22} />}
      label={p.name}
      meta={<span className="pj-side-meta" data-status={p.status}>{openCount.get(p.id) ?? 0}</span>}
      active={p.id === currentId}
      title={`${p.key} · ${p.name}`}
      onContextMenu={(e) => ctx.open(e, menuFor(p))}
    />
  );

  return (
    <NeoSide
      title="Projects"
      label="Project navigator"
      actions={
        <>
          <button
            type="button"
            className="neo-iconbtn"
            aria-label="New project"
            data-tip={canCreate ? 'New project' : (createProjectReason(actor!) ?? '')}
            data-tip-pos="bottom"
            disabled={!canCreate}
            onClick={() => navigate('/projects/browse?new=1')}
            data-qa="side-new-project"
          >
            <Plus />
          </button>
          {!narrow && (
            <button type="button" className="neo-iconbtn" aria-label="Hide panel" data-tip="Hide panel  [" data-tip-pos="bottom" onClick={onCollapse}>
              <PanelLeftClose />
            </button>
          )}
        </>
      }
      top={<NeoSearch value={q} onChange={setQ} size="sm" placeholder="Find a project" kbd="s" inputRef={searchRef} label="Find a project" />}
    >
      {starred.length > 0 && <NeoSideGroup label="Starred">{starred.map(item)}</NeoSideGroup>}
      {groups.map(([dept, list]) => (
        <NeoSideGroup key={dept} label={dept}>
          {list.map(item)}
        </NeoSideGroup>
      ))}
      {filtered.length === 0 && (
        <div className="pj-side-empty">
          <span>No projects match “{q}”.</span>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setQ('')}>
            <Copy /> Clear search
          </button>
        </div>
      )}
      {ctx.element}
    </NeoSide>
  );
}

export function SideToggleSlot({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export { Navigate };
