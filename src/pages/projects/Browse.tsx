/**
 * Browse — every project you can see, as a gallery of mission cards or a
 * dense table, with search, filters and sorting. `?new=1` opens the New
 * Project wizard (basics → template → team & timeline) with a live preview.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Globe2,
  Kanban,
  LayoutGrid,
  Link2,
  ListTodo,
  Lock,
  Plus,
  Rocket,
  Star,
  StarOff,
  Table2,
  UserPlus,
  X,
} from 'lucide-react';
import { Avatars, NeoEmpty, NeoHead, NeoMenu, NeoSearch, PeoplePicker, Ring, useContextMenu, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { useNow } from '@/hooks/useNow';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import type { Department } from '@/types';
import { canAdminProject, canCreateProject, createProjectReason, PRIVACY_LABEL, ROLE_LABEL } from '@/projects/access';
import { addDays, diffDays, formatDue, shortDate, todayIso } from '@/projects/dates';
import { projectMetrics, STATUS_LABEL, type ProjectMetrics } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import { ProjectSigil, SIGIL_IDS, SIGIL_LABEL, SigilGlyph, sigilIdFor } from '@/projects/sigils';
import { suggestKey, useProjects } from '@/projects/store';
import { TEMPLATES, type TemplateId } from '@/projects/templates';
import type { Privacy, Project, ProjectRole, ProjectStatus } from '@/projects/types';
import { useActor, useMyState, useProjectsUI, useUsersMap, useVisibleProjects } from './ctx';
import { IconProjectsGrid } from './icons';
import { COLORS, DEPARTMENTS } from './ProjectModals';
import { DatePicker, PriorityGlyph, ProjectGlyph, StatusPill, STATUSES, STATUS_TONE } from './ui';

type SortKey = 'updated' | 'due' | 'name' | 'progress' | 'health';
type Scope = 'all' | 'mine' | 'starred';
const SORT_LABEL: Record<SortKey, string> = { updated: 'Recently updated', due: 'Due date', name: 'Name', progress: 'Progress', health: 'Needs attention' };
const HEALTH_RANK: Record<ProjectStatus, number> = { 'off-track': 0, 'at-risk': 1, 'on-hold': 2, 'on-track': 3, complete: 4 };
const PRIVACY_ICON: Record<Privacy, React.ReactNode> = { public: <Globe2 />, team: <Building2 />, private: <Lock /> };

function excerpt(brief: string): string {
  const line = brief
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^\*\*[^*]+\*\*$/.test(l));
  return (line ?? '').replace(/\*\*|`/g, '').replace(/^[-*]\s+/, '');
}

export function BrowseScreen() {
  const actor = useActor();
  const ui = useProjectsUI();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const users = useUsersMap();
  const [params, setParams] = useSearchParams();
  const me = useMyState();
  const setMode = useProjects((s) => s.setBrowseMode);
  const allTasks = useProjects((s) => s.tasks);
  const [showArchived, setShowArchived] = useState(false);
  const projects = useVisibleProjects(showArchived);
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<SortKey>('health');
  const searchRef = useRef<HTMLInputElement>(null);
  const mode = me.browseMode;
  const wizard = params.get('new') === '1';
  const canCreate = actor ? canCreateProject(actor) : false;

  useEffect(() => {
    ui.registerSearch(searchRef.current);
    return () => ui.registerSearch(null);
  }, [ui]);

  // contractors can't open the wizard via URL
  useEffect(() => {
    if (wizard && actor && !canCreate) {
      toast.error(createProjectReason(actor) ?? 'You can’t create projects.');
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('new');
          return n;
        },
        { replace: true },
      );
    }
  }, [wizard, actor, canCreate, setParams]);

  const metrics = useMemo(() => {
    const byProject = new Map<string, typeof allTasks>();
    for (const t of allTasks) if (t.projectId) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);
    return new Map(projects.map((p) => [p.id, projectMetrics(p, byProject.get(p.id) ?? [], now)]));
  }, [projects, allTasks, now]);

  const deptOptions = useMemo(() => [...new Set(projects.map((p) => p.department))].sort(), [projects]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = projects.filter((p) => {
      if (scope === 'mine' && !p.members.some((m) => m.userId === actor?.id)) return false;
      if (scope === 'starred' && !me.starred.includes(p.id)) return false;
      if (statuses.length && !statuses.includes(p.status)) return false;
      if (depts.length && !depts.includes(p.department)) return false;
      if (s && !`${p.name} ${p.key} ${p.department} ${users.get(p.ownerId)?.name ?? ''} ${p.brief}`.toLowerCase().includes(s)) return false;
      return true;
    });
    const m = (p: Project) => metrics.get(p.id);
    return out.sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      switch (sort) {
        case 'due':
          return a.dueDate.localeCompare(b.dueDate);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'progress':
          return (m(b)?.progress ?? 0) - (m(a)?.progress ?? 0);
        case 'health':
          return HEALTH_RANK[a.status] - HEALTH_RANK[b.status] || (m(b)?.overdue ?? 0) - (m(a)?.overdue ?? 0) || a.dueDate.localeCompare(b.dueDate);
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
  }, [projects, q, scope, statuses, depts, sort, metrics, me.starred, actor, users]);

  if (!actor) return null;

  const filtersOn = !!q || statuses.length > 0 || depts.length > 0 || scope !== 'all';
  const clear = () => {
    setQ('');
    setStatuses([]);
    setDepts([]);
    setScope('all');
  };
  const active = projects.filter((p) => !p.archived);
  const atRisk = active.filter((p) => p.status === 'at-risk' || p.status === 'off-track').length;
  const openWizard = () => setParams((p) => new URLSearchParams({ ...Object.fromEntries(p), new: '1' }));
  const closeWizard = () =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('new');
      return n;
    });

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={<IconProjectsGrid />}
        eyebrow={
          <>
            Projects · {active.length} active{atRisk ? ` · ${atRisk} need attention` : ''}
          </>
        }
        title="All projects"
        sub="Every project you can see across Helix — health, progress and who’s on it."
        actions={
          <button
            type="button"
            className="neo-btn neo-btn--plasma"
            disabled={!canCreate}
            onClick={openWizard}
            data-tip={canCreate ? 'Create a project' : (createProjectReason(actor) ?? undefined)}
            data-tip-pos="bottom"
            data-qa="new-project"
          >
            <Plus /> <span className="neo-btn__label">New project</span>
          </button>
        }
      />
      <div className="neo-toolbar pj-toolbar pj-browse__toolbar">
        <div className="pj-seg" role="radiogroup" aria-label="Show">
          {(['all', 'mine', 'starred'] as Scope[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} className={cx(scope === s && 'is-on')} onClick={() => setScope(s)}>
              {s === 'all' ? 'All' : s === 'mine' ? 'Mine' : 'Starred'}
            </button>
          ))}
        </div>
        <NeoSearch value={q} onChange={setQ} size="sm" placeholder="Search projects" kbd="s" inputRef={searchRef} className="pj-filters__search pj-browse__search" label="Search projects" />
        <NeoMenu
          label="Status"
          width={220}
          items={STATUSES.map((s) => ({
            label: STATUS_LABEL[s],
            icon: <i className="pj-status__orb" data-tone={STATUS_TONE[s]} style={{ background: 'rgb(var(--tone))' }} />,
            checked: statuses.includes(s),
            onSelect: () => setStatuses((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s])),
          }))}
          trigger={(p) => (
            <button {...p} type="button" className={cx('pj-fchip', statuses.length > 0 && 'is-on')}>
              Status{statuses.length ? ` · ${statuses.length}` : ''} <ChevronDown />
            </button>
          )}
        />
        <NeoMenu
          label="Department"
          width={230}
          items={deptOptions.map((d) => ({ label: d, checked: depts.includes(d), onSelect: () => setDepts((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d])) }))}
          trigger={(p) => (
            <button {...p} type="button" className={cx('pj-fchip', depts.length > 0 && 'is-on')}>
              Department{depts.length ? ` · ${depts.length}` : ''} <ChevronDown />
            </button>
          )}
        />
        <button type="button" className={cx('pj-fchip', showArchived && 'is-on')} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
          <Archive /> Archived
        </button>
        {filtersOn && (
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Clear filters" data-tip="Clear filters" onClick={clear}>
            <X />
          </button>
        )}
        <span className="grow" />
        <NeoMenu
          label="Sort"
          width={220}
          items={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ label: SORT_LABEL[k], checked: sort === k, onSelect: () => setSort(k) }))}
          trigger={(p) => (
            <button {...p} type="button" className="pj-fchip" aria-label={`Sort: ${SORT_LABEL[sort]}`}>
              <ArrowUpDown /> <span className="pj-browse__sortlabel">{SORT_LABEL[sort]}</span>
            </button>
          )}
        />
        <div className="pj-seg pj-seg--icons" role="radiogroup" aria-label="Layout">
          <button type="button" role="radio" aria-checked={mode === 'gallery'} className={cx(mode === 'gallery' && 'is-on')} onClick={() => setMode('gallery')} aria-label="Gallery" data-tip="Gallery">
            <LayoutGrid />
          </button>
          <button type="button" role="radio" aria-checked={mode === 'table'} className={cx(mode === 'table' && 'is-on')} onClick={() => setMode('table')} aria-label="Table" data-tip="Table">
            <Table2 />
          </button>
        </div>
      </div>

      <div className="neo-body neo-pad pj-browse">
        {list.length === 0 ? (
          filtersOn ? (
            <NeoEmpty
              icon={<IconProjectsGrid />}
              title="No projects match"
              action={
                <button type="button" className="neo-btn neo-btn--soft" onClick={clear}>
                  Clear filters
                </button>
              }
            >
              Try a different search or loosen the filters.
            </NeoEmpty>
          ) : (
            <NeoEmpty
              icon={<Rocket />}
              title="No projects yet"
              action={
                canCreate ? (
                  <button type="button" className="neo-btn neo-btn--plasma" onClick={openWizard}>
                    <Plus /> Start a project
                  </button>
                ) : undefined
              }
            >
              {canCreate ? 'Spin up your first project from a template — it takes a few seconds.' : 'Projects you’re added to will show up here.'}
            </NeoEmpty>
          )
        ) : mode === 'gallery' ? (
          <ul className="pj-pgrid neo-stagger">
            {canCreate && !filtersOn && (
              <li style={{ ['--i' as string]: 0 }}>
                <button type="button" className="pj-pcard pj-pcard--new" onClick={openWizard}>
                  <span className="pj-pcard__newico">
                    <Plus />
                  </span>
                  <span className="pj-pcard__name">New project</span>
                  <span className="neo-faint text-sm">Start from Kanban, Sprint, Launch, Onboarding, Event or blank.</span>
                </button>
              </li>
            )}
            {list.map((p, i) => (
              <li key={p.id} style={{ ['--i' as string]: i + 1 }}>
                <ProjectCard project={p} m={metrics.get(p.id)!} starred={me.starred.includes(p.id)} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <ProjectTable list={list} metrics={metrics} starred={me.starred} />
        )}
      </div>

      {wizard && canCreate && <NewProjectWizard onClose={closeWizard} onCreated={(id, view) => navigate(`/projects/p/${id}/${view}`)} />}
    </>
  );
}

/* ───────────────────────── card ───────────────────────── */

function useProjectMenu(p: Project): MenuEntry[] {
  const navigate = useNavigate();
  const actor = useActor();
  const me = useMyState();
  const toggleStar = useProjects((s) => s.toggleStar);
  const archive = useProjects((s) => s.archiveProject);
  const starred = me.starred.includes(p.id);
  const canAdmin = actor ? canAdminProject(p, actor) : false;
  return [
    { label: 'Open board', icon: <Kanban />, onSelect: () => navigate(`/projects/p/${p.id}/board`) },
    { label: 'Open list', icon: <ListTodo />, onSelect: () => navigate(`/projects/p/${p.id}/list`) },
    { label: starred ? 'Unstar' : 'Star', icon: starred ? <StarOff /> : <Star />, onSelect: () => toggleStar(p.id) },
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
      label: p.archived ? 'Restore project' : 'Archive project',
      icon: p.archived ? <ArchiveRestore /> : <Archive />,
      disabled: !canAdmin,
      onSelect: () => {
        toast.result(archive(p.id, !p.archived), p.archived ? `${p.name} restored` : `${p.name} archived`);
      },
    },
  ];
}

function ProjectCard({ project: p, m, starred, now }: { project: Project; m: ProjectMetrics; starred: boolean; now: number }) {
  const users = useUsersMap();
  const toggleStar = useProjects((s) => s.toggleStar);
  const ctx = useContextMenu();
  const menu = useProjectMenu(p);
  const members = p.members.map((x) => users.get(x.userId)).filter((u): u is NonNullable<typeof u> => !!u);
  const owner = users.get(p.ownerId);
  const today = todayIso(now);
  const daysLeft = diffDays(today, p.dueDate);
  const behind = m.elapsed - m.progress;
  return (
    <article className={cx('pj-pcard neo-spot', p.archived && 'is-archived')} style={{ '--pc': p.color } as CSSProperties} onContextMenu={(e) => ctx.open(e, menu)} data-status={p.status}>
      <Link to={`/projects/p/${p.id}`} className="pj-pcard__hit" aria-label={`Open ${p.name}`} />
      <div className="pj-pcard__top">
        <ProjectGlyph project={p} size={42} />
        <div className="pj-pcard__id">
          <span className="pj-pcard__key">
            <span className="neo-mono">{p.key}</span> · {p.department}
          </span>
          <h3 className="pj-pcard__name">{p.name}</h3>
        </div>
        <Ring value={m.progress} size={46} stroke={4} label={`${Math.round(m.progress * 100)}% complete`}>
          <span style={{ fontSize: 11.5 }}>{Math.round(m.progress * 100)}</span>
        </Ring>
      </div>
      <p className="pj-pcard__brief">{excerpt(p.brief) || 'No brief yet.'}</p>
      <div className="pj-pcard__chips">
        <StatusPill status={p.status} />
        <span className="pj-pcard__priv" title={PRIVACY_LABEL[p.privacy]}>
          {PRIVACY_ICON[p.privacy]} {PRIVACY_LABEL[p.privacy]}
        </span>
        {p.archived && <span className="neo-chip neo-chip--sm">Archived</span>}
      </div>
      <div className="pj-pcard__track" role="img" aria-label={`${Math.round(m.progress * 100)}% done, ${Math.round(m.elapsed * 100)}% of time elapsed`}>
        <i className="pj-pcard__time" style={{ width: `${m.elapsed * 100}%` }} />
        <i className="pj-pcard__done" style={{ width: `${m.progress * 100}%` }} />
      </div>
      <div className="pj-pcard__nums">
        <span>
          <strong className="neo-num">{m.open}</strong> open
        </span>
        {m.overdue > 0 && (
          <span className="is-bad">
            <strong className="neo-num">{m.overdue}</strong> overdue
          </span>
        )}
        <span className={cx(behind > 0.12 && p.status !== 'complete' && 'is-warn')}>{p.status === 'complete' ? 'Shipped' : behind > 0.02 ? `${Math.round(behind * 100)} pts behind` : 'On plan'}</span>
      </div>
      <div className="pj-pcard__foot">
        <Avatars users={members} max={4} size={24} />
        <span className="pj-pcard__owner truncate">{owner?.name.split(' ')[0] ?? ''}</span>
        <span className="grow" />
        <span className={cx('pj-pcard__due', daysLeft < 0 && p.status !== 'complete' && 'is-late')}>
          <CalendarDays /> {p.status === 'complete' ? shortDate(p.dueDate) : daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d over`}
        </span>
        <button
          type="button"
          className={cx('neo-iconbtn neo-iconbtn--sm pj-pcard__star', starred && 'is-on')}
          aria-pressed={starred}
          aria-label={starred ? `Unstar ${p.name}` : `Star ${p.name}`}
          data-tip={starred ? 'Unstar' : 'Star'}
          onClick={() => toggleStar(p.id)}
        >
          <Star />
        </button>
      </div>
      {ctx.element}
    </article>
  );
}

/* ───────────────────────── table ───────────────────────── */

function ProjectTable({ list, metrics, starred }: { list: Project[]; metrics: Map<string, ProjectMetrics>; starred: string[] }) {
  const navigate = useNavigate();
  const users = useUsersMap();
  const toggleStar = useProjects((s) => s.toggleStar);
  return (
    <div className="neo-table-wrap pj-ptable">
      <table className="neo-table">
        <thead>
          <tr>
            <th aria-label="Star" />
            <th>Project</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Priority</th>
            <th>Members</th>
            <th>Open</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const m = metrics.get(p.id)!;
            const owner = users.get(p.ownerId);
            const on = starred.includes(p.id);
            return (
              <tr key={p.id} className={cx(p.archived && 'is-archived')} onClick={() => navigate(`/projects/p/${p.id}`)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={cx('neo-iconbtn neo-iconbtn--sm pj-pcard__star', on && 'is-on')} aria-pressed={on} aria-label={on ? `Unstar ${p.name}` : `Star ${p.name}`} onClick={() => toggleStar(p.id)}>
                    <Star />
                  </button>
                </td>
                <td>
                  <Link to={`/projects/p/${p.id}`} className="pj-ptable__name" onClick={(e) => e.stopPropagation()}>
                    <ProjectGlyph project={p} size={26} />
                    <span className="truncate">{p.name}</span>
                    <span className="neo-mono neo-faint">{p.key}</span>
                  </Link>
                </td>
                <td>
                  <StatusPill status={p.status} />
                </td>
                <td>
                  <span className="pj-ptable__prog">
                    <span className="pj-pcard__track pj-pcard__track--sm">
                      <i className="pj-pcard__time" style={{ width: `${m.elapsed * 100}%` }} />
                      <i className="pj-pcard__done" style={{ width: `${m.progress * 100}%`, ['--pc' as string]: p.color }} />
                    </span>
                    <span className="neo-num">{Math.round(m.progress * 100)}%</span>
                  </span>
                </td>
                <td>
                  <span className="pj-ptable__who">
                    {owner && <Avatars users={[owner]} size={22} />}
                    <span className="truncate">{owner?.name ?? '—'}</span>
                  </span>
                </td>
                <td className={cx(p.dueDate < todayIso() && p.status !== 'complete' && 'is-late')}>{formatDue(p.dueDate)}</td>
                <td>
                  <span className="pj-ptable__who">
                    <PriorityGlyph priority={p.priority} /> {PRIORITY_NAME[p.priority]}
                  </span>
                </td>
                <td>
                  <Avatars users={p.members.map((x) => users.get(x.userId)).filter((u): u is NonNullable<typeof u> => !!u)} max={3} size={22} />
                </td>
                <td className="neo-num">
                  {m.open}
                  {m.overdue ? <span className="pj-ptable__late"> · {m.overdue} late</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── New Project wizard ───────────────────────── */

const STEPS = ['Basics', 'Template', 'Team & timeline'] as const;

function NewProjectWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (projectId: string, view: string) => void }) {
  const actor = useActor()!;
  const users = useUsersMap();
  const projects = useProjects((s) => s.projects);
  const createProject = useProjects((s) => s.createProject);
  const taken = useMemo(() => new Set(projects.map((p) => p.key)), [projects]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [icon, setIcon] = useState('rocket');
  const [color, setColor] = useState(COLORS[0]);
  const [department, setDepartment] = useState<Department>(DEPARTMENTS.includes(actor.department as Department) ? (actor.department as Department) : 'Product');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [template, setTemplate] = useState<TemplateId>('kanban');
  const [start, setStart] = useState(todayIso());
  const [due, setDue] = useState(addDays(todayIso(), 42));
  const [members, setMembers] = useState<{ userId: string; role: ProjectRole }[]>([]);
  const [brief, setBrief] = useState('');

  const autoKey = useMemo(() => (name.trim().length >= 2 ? suggestKey(name, taken) : ''), [name, taken]);
  const finalKey = (keyTouched ? key : autoKey).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const tpl = TEMPLATES.find((t) => t.id === template)!;
  const keyError = keyTouched && finalKey.length < 2 ? 'Use 2–6 letters or digits.' : finalKey && taken.has(finalKey) ? `${finalKey} is already used.` : null;
  const nameError = name.trim().length > 0 && name.trim().length < 3 ? 'At least 3 characters.' : null;
  const canNext = step === 0 ? name.trim().length >= 3 && !keyError : step === 1 ? true : due >= start;

  const create = () => {
    const r = createProject({ name, key: finalKey || undefined, icon, color, department, privacy, template, members, startDate: start, dueDate: due, brief: brief.trim() || undefined });
    if (!r.ok) return toast.error(r.error);
    burstConfetti();
    toast.success('Project created', `${name.trim()} is ready — ${tpl.tasks.length ? `${tpl.tasks.length} starter tasks added` : 'add your first task'}.`);
    onCreated(r.projectId, template === 'blank' ? 'list' : 'board');
  };
  const next = () => {
    if (!canNext) return;
    if (step < 2) setStep(step + 1);
    else create();
  };

  const memberUsers = members.map((m) => users.get(m.userId)).filter((u): u is NonNullable<typeof u> => !!u);
  const me = users.get(actor.id);

  return (
    <Modal
      open
      onClose={onClose}
      title="New project"
      subtitle={`Step ${step + 1} of 3 · ${STEPS[step]}`}
      width={880}
      className="neo-portal pj-modal pj-wiz"
      footer={
        <>
          <div className="pj-wiz__dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <i key={s} className={cx(i === step && 'is-on', i < step && 'is-done')} />
            ))}
          </div>
          <span className="grow" />
          {step > 0 ? (
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </button>
          ) : (
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="button" className="neo-btn neo-btn--plasma" onClick={next} disabled={!canNext} data-qa={step < 2 ? 'wiz-next' : 'wiz-create'}>
            {step < 2 ? (
              <>
                Next <ArrowRight />
              </>
            ) : (
              <>
                <Rocket /> Create project
              </>
            )}
          </button>
        </>
      }
    >
      <div className="pj-wiz__steps" role="tablist" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" role="tab" aria-selected={i === step} className={cx('pj-wiz__step', i === step && 'is-on', i < step && 'is-done')} onClick={() => i < step && setStep(i)} disabled={i > step}>
            <span className="pj-wiz__num">{i < step ? <Check /> : i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className="pj-wiz__body">
        <div
          className="pj-wiz__form"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
              e.preventDefault();
              next();
            }
          }}
        >
          {step === 0 && (
            <div className="pj-form">
              <div className="pj-form__row pj-wiz__namerow">
                <label className="neo-field">
                  <span className="neo-label">Project name</span>
                  <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer Portal Relaunch" maxLength={80} data-autofocus autoFocus />
                  {nameError && <span className="pj-wiz__err">{nameError}</span>}
                </label>
                <label className="neo-field pj-wiz__key">
                  <span className="neo-label">Key</span>
                  <input
                    className="neo-input neo-mono"
                    value={keyTouched ? key : autoKey}
                    onChange={(e) => {
                      setKeyTouched(true);
                      setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                    }}
                    placeholder="KEY"
                    aria-describedby="pj-wiz-keyhelp"
                  />
                  <span id="pj-wiz-keyhelp" className={cx('pj-wiz__hint', keyError && 'pj-wiz__err')}>
                    {keyError ?? `Tasks will be ${finalKey || 'KEY'}-1, ${finalKey || 'KEY'}-2…`}
                  </span>
                </label>
              </div>
              <div className="neo-field">
                <span className="neo-label">Sigil</span>
                <div className="pj-emojigrid pj-sigilgrid" role="radiogroup" aria-label="Project sigil">
                  {SIGIL_IDS.map((id) => {
                    const on = sigilIdFor(icon) === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={cx(on && 'is-on')}
                        onClick={() => setIcon(id)}
                        aria-label={`Use ${SIGIL_LABEL[id]} sigil`}
                        title={SIGIL_LABEL[id]}
                      >
                        <ProjectSigil icon={id} color={color} size={32} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="neo-field">
                <span className="neo-label">Colour</span>
                <div className="pj-swatches">
                  {COLORS.map((c) => (
                    <button key={c} type="button" className={cx('pj-swatch', color === c && 'is-on')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}>
                      {color === c && <Check />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pj-form__row">
                <label className="neo-field">
                  <span className="neo-label">Department</span>
                  <select className="neo-select" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="neo-field">
                <span className="neo-label">Who can see it</span>
                <div className="pj-wiz__priv" role="radiogroup" aria-label="Privacy">
                  {(['public', 'team', 'private'] as Privacy[]).map((pv) => (
                    <button key={pv} type="button" role="radio" aria-checked={privacy === pv} className={cx('pj-privopt', privacy === pv && 'is-on')} onClick={() => setPrivacy(pv)}>
                      {PRIVACY_ICON[pv]}
                      <span className="pj-privopt__t">{PRIVACY_LABEL[pv]}</span>
                      <span className="pj-privopt__d">{pv === 'public' ? 'Everyone at Helix' : pv === 'team' ? `${department} + admins` : 'Members only'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="pj-tpls" role="radiogroup" aria-label="Template">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={template === t.id} className={cx('pj-tpl neo-spot', template === t.id && 'is-on')} onClick={() => setTemplate(t.id)}>
                  <span className="pj-tpl__ico">
                    <SigilGlyph id={t.icon} size={20} />
                  </span>
                  <span className="pj-tpl__name">{t.name}</span>
                  <span className="pj-tpl__blurb">{t.blurb}</span>
                  <span className="pj-tpl__secs">
                    {t.sections.map((s) => (
                      <i key={s.name} data-stage={s.stage ?? 'todo'}>
                        {s.name}
                      </i>
                    ))}
                  </span>
                  <span className="pj-tpl__count">{t.tasks.length ? `${t.tasks.length} starter tasks` : 'No starter tasks'}</span>
                  {template === t.id && (
                    <span className="pj-tpl__check" aria-hidden="true">
                      <Check />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="pj-form">
              <div className="pj-form__row">
                <div className="neo-field">
                  <span className="neo-label">Start</span>
                  <DatePicker value={start} onChange={(v) => v && setStart(v)} allowClear={false} trigger={(p) => <button {...p} type="button" className="neo-input pj-dateinput">{formatDue(start)}</button>} />
                </div>
                <div className="neo-field">
                  <span className="neo-label">Due</span>
                  <DatePicker value={due} onChange={(v) => v && setDue(v)} allowClear={false} trigger={(p) => <button {...p} type="button" className="neo-input pj-dateinput">{formatDue(due)}</button>} />
                  {due < start && <span className="pj-wiz__err">Due date must be after the start.</span>}
                </div>
              </div>
              <div className="neo-field">
                <span className="neo-label pj-labelrow">
                  Team
                  <span className="neo-faint text-xs">You’ll be the owner</span>
                </span>
                <ul className="pj-wiz__team">
                  {me && (
                    <li className="pj-member">
                      <Avatars users={[me]} size={28} />
                      <span className="grow">
                        <span className="pj-member__name">{me.name}</span>
                        <span className="pj-member__sub">{me.title}</span>
                      </span>
                      <span className="pj-role">{ROLE_LABEL.owner}</span>
                    </li>
                  )}
                  {memberUsers.map((u) => {
                    const m = members.find((x) => x.userId === u.id)!;
                    return (
                      <li key={u.id} className="pj-member">
                        <Avatars users={[u]} size={28} />
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="pj-member__name truncate">{u.name}</span>
                          <span className="pj-member__sub truncate">{u.title}</span>
                        </span>
                        <select className="neo-select neo-select--sm" value={m.role} onChange={(e) => setMembers((xs) => xs.map((x) => (x.userId === u.id ? { ...x, role: e.target.value as ProjectRole } : x)))} aria-label={`Role for ${u.name}`}>
                          {(['editor', 'commenter', 'viewer'] as ProjectRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${u.name}`} onClick={() => setMembers((xs) => xs.filter((x) => x.userId !== u.id))}>
                          <X />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <PeoplePicker
                  multiple
                  value={members.map((m) => m.userId)}
                  onChange={(ids) => setMembers((xs) => ids.filter((id) => id !== actor.id).map((id) => xs.find((x) => x.userId === id) ?? { userId: id, role: 'editor' }))}
                  label="Add people"
                  trigger={(p) => (
                    <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm pj-wiz__add">
                      <UserPlus /> Add people
                    </button>
                  )}
                />
              </div>
              <label className="neo-field">
                <span className="neo-label">Brief</span>
                <textarea className="neo-textarea pj-wiz__brief" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={tpl.brief} />
              </label>
            </div>
          )}
        </div>

        <aside className="pj-wiz__preview" aria-label="Preview">
          <span className="neo-hud">Preview</span>
          <div className="pj-pcard pj-pcard--preview" style={{ '--pc': color } as CSSProperties}>
            <div className="pj-pcard__top">
              <ProjectGlyph project={{ icon, color, name }} size={42} />
              <div className="pj-pcard__id">
                <span className="pj-pcard__key">
                  <span className="neo-mono">{finalKey || 'KEY'}</span> · {department}
                </span>
                <h3 className="pj-pcard__name">{name.trim() || 'Untitled project'}</h3>
              </div>
            </div>
            <p className="pj-pcard__brief">{excerpt(brief || tpl.brief)}</p>
            <div className="pj-pcard__chips">
              <StatusPill status="on-track" />
              <span className="pj-pcard__priv">
                {PRIVACY_ICON[privacy]} {PRIVACY_LABEL[privacy]}
              </span>
            </div>
            <div className="pj-wiz__board" aria-hidden="true">
              {tpl.sections.slice(0, 5).map((s, i) => (
                <div key={s.name} className="pj-wiz__col" data-stage={s.stage ?? 'todo'}>
                  <span className="pj-wiz__colname">{s.name}</span>
                  {Array.from({ length: Math.max(0, Math.min(3, tpl.tasks.filter((t) => t.section === i).length || (i === 0 ? 1 : 0))) }, (_, k) => (
                    <i key={k} />
                  ))}
                </div>
              ))}
            </div>
            <div className="pj-pcard__foot">
              <Avatars users={[...(me ? [me] : []), ...memberUsers]} max={5} size={22} />
              <span className="grow" />
              <span className="pj-pcard__due">
                <CalendarDays /> {shortDate(start)} → {shortDate(due)}
              </span>
            </div>
          </div>
          <p className="neo-faint text-xs pj-wiz__note">
            {tpl.name} template · {tpl.sections.length} sections{tpl.tasks.length ? ` · ${tpl.tasks.length} starter tasks` : ''}. You can rename sections, change privacy and invite people any time.
          </p>
        </aside>
      </div>
    </Modal>
  );
}
