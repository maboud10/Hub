import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Archive, LayoutGrid, List, Lock, Plus, Search, Star, X } from 'lucide-react';
import type { Department } from '@/types';
import { useSessionUser } from '@/store/selectors';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { HEALTH_META } from '@/projects/constants';
import { useProjectsCaps, useVisibleProjects, type ProjectCard } from '@/projects/selectors';
import type { ProjectHealth } from '@/projects/types';
import { NewProjectWizard } from './NewProjectWizard';
import { api, AvatarStack, Bar, HealthPill, PrivacyBadge, ProjectIcon, report, RoleBadge, UserAvatar } from './shared';

type Scope = 'all' | 'starred' | 'mine';

export function BrowseView() {
  const me = useSessionUser();
  const caps = useProjectsCaps();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [health, setHealth] = useState<ProjectHealth | ''>('');
  const [showArchived, setShowArchived] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const cards = useVisibleProjects(showArchived);

  const wizardOpen = sp.get('new') === '1';
  const templateId = sp.get('template') ?? undefined;
  const closeWizard = () => {
    const next = new URLSearchParams(sp);
    next.delete('new');
    next.delete('template');
    setSp(next, { replace: true });
  };

  const departments = useMemo(() => [...new Set(cards.map((c) => c.project.department))].sort(), [cards]);

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        if (scope === 'starred' && !c.starred) return false;
        if (scope === 'mine' && !(c.project.ownerId === me?.id || c.project.members.some((m) => m.userId === me?.id))) return false;
        if (department && c.project.department !== department) return false;
        if (health && c.project.health !== health) return false;
        const q = search.trim().toLowerCase();
        if (q && !(c.project.name.toLowerCase().includes(q) || c.project.key.toLowerCase().includes(q) || c.project.description.toLowerCase().includes(q))) return false;
        return true;
      }),
    [cards, scope, department, health, search, me?.id],
  );

  return (
    <div className="pj-view pj-browse">
      <div className="pj-view__head">
        <div>
          <h2 className="pj-view__title">Projects</h2>
          <p className="pj-view__sub">
            {caps.isContractor ? 'Projects you’ve been invited to.' : 'Public and team projects you can see, plus private ones you’re a member of.'}
          </p>
        </div>
        {caps.canCreate && (
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={() => navigate('/projects/browse?new=1')}>
            <Plus /> New project
          </button>
        )}
      </div>

      <div className="pj-filters">
        <div className="chips pj-filters__chips">
          {(['all', 'starred', 'mine'] as Scope[]).map((s) => (
            <button key={s} type="button" className={cx('chip', scope === s && 'is-active')} onClick={() => setScope(s)}>
              {s === 'starred' && <Star />}
              {s === 'all' ? 'All' : s === 'starred' ? 'Starred' : 'Mine'}
              <span className="count">{s === 'all' ? cards.length : s === 'starred' ? cards.filter((c) => c.starred).length : cards.filter((c) => c.project.ownerId === me?.id || c.project.members.some((m) => m.userId === me?.id)).length}</span>
            </button>
          ))}
        </div>
        <div className="pj-filters__right">
          <div className="pj-toolbar__search">
            <Search />
            <input className="pj-toolbar__input" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search projects" />
            {search && (
              <button type="button" className="pj-search__clear" onClick={() => setSearch('')} aria-label="Clear">
                <X />
              </button>
            )}
          </div>
          <select className="select pj-select-sm" value={department} onChange={(e) => setDepartment(e.target.value as Department | '')} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className="select pj-select-sm" value={health} onChange={(e) => setHealth(e.target.value as ProjectHealth | '')} aria-label="Health">
            <option value="">Any health</option>
            {(Object.keys(HEALTH_META) as ProjectHealth[]).map((h) => (
              <option key={h} value={h}>
                {HEALTH_META[h].emoji} {HEALTH_META[h].label}
              </option>
            ))}
          </select>
          <label className="pj-switch-label">
            <Switch checked={showArchived} onChange={setShowArchived} label="Show archived" />
            <span>Archived</span>
          </label>
          <Segmented
            label="Layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
              { value: 'list', label: 'List', icon: <List /> },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={scope === 'starred' ? <Star /> : <LayoutGrid />}
          title={scope === 'starred' ? 'No starred projects yet' : 'No projects match these filters'}
          action={
            caps.canCreate && scope === 'all' && !department && !health && !search ? (
              <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => navigate('/projects/browse?new=1')}>
                <Plus /> Create the first one
              </button>
            ) : undefined
          }
        >
          {scope === 'starred' ? 'Hit the star on any project to keep it one click away in the sidebar.' : caps.isContractor ? 'Ask a project admin to add you to their project.' : 'Try a different scope, department or health.'}
        </EmptyState>
      ) : (
        <div className={cx('pj-cards stagger', layout === 'list' && 'pj-cards--list')}>
          {filtered.map((c, i) => (
            <ProjectTile key={c.project.id} card={c} index={i} />
          ))}
        </div>
      )}

      <NewProjectWizard open={wizardOpen} onClose={closeWizard} initialTemplateId={templateId} />
    </div>
  );
}

function ProjectTile({ card, index }: { card: ProjectCard; index: number }) {
  const { project, progress, role, openTasks, myOpenTasks, starred, lastUpdateAt, suggestedHealth } = card;
  return (
    <Link to={`/projects/p/${project.id}`} className={cx('pj-card', project.archived && 'is-archived')} style={{ '--i': index, '--c': project.color } as CSSProperties}>
      <div className="pj-card__top">
        <ProjectIcon project={project} size={40} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="pj-card__name truncate">{project.name}</div>
          <div className="pj-card__meta">
            <span className="mono">{project.key}</span>
            <span>·</span>
            <span className="truncate">{project.department}</span>
            {project.privacy === 'private' && <Lock className="pj-card__lock" />}
          </div>
        </div>
        <button
          type="button"
          className={cx('pj-star', starred && 'is-on')}
          aria-label={starred ? 'Unstar project' : 'Star project'}
          aria-pressed={starred}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            report(api().toggleStarProject(project.id));
          }}
        >
          <Star />
        </button>
      </div>
      <p className="pj-card__desc clamp-2">{project.description || 'No description yet.'}</p>
      <div className="pj-card__row">
        <HealthPill health={project.archived ? 'complete' : project.health} />
        {!project.archived && suggestedHealth !== project.health && (
          <span className="pj-card__hint" title={`Nova suggests ${HEALTH_META[suggestedHealth].label} from live task data`}>
            Nova: {HEALTH_META[suggestedHealth].label.toLowerCase()}
          </span>
        )}
        <span className="spacer" />
        <PrivacyBadge privacy={project.privacy} />
      </div>
      <div className="pj-card__progress">
        <Bar pct={progress.pct} color={project.color} />
        <span className="pj-card__pct mono">{progress.pct}%</span>
      </div>
      <div className="pj-card__stats">
        <span>
          <b>{openTasks}</b> open
        </span>
        <span>
          <b>{myOpenTasks}</b> mine
        </span>
        {progress.overdue > 0 && (
          <span className="pj-card__stat--danger">
            <b>{progress.overdue}</b> overdue
          </span>
        )}
        {progress.milestonesTotal > 0 && (
          <span>
            <b>
              {progress.milestonesDone}/{progress.milestonesTotal}
            </b>{' '}
            milestones
          </span>
        )}
      </div>
      <div className="pj-card__foot">
        <UserAvatar userId={project.ownerId} size={22} />
        <AvatarStack userIds={project.members.filter((m) => m.userId !== project.ownerId).map((m) => m.userId)} max={3} size={22} />
        <span className="spacer" />
        <RoleBadge role={role} />
      </div>
      <div className="pj-card__update faint">{lastUpdateAt ? `Status update ${relativeTime(lastUpdateAt)}` : 'No status updates yet'}</div>
      {project.archived && (
        <span className="pj-card__archived">
          <Archive /> Archived
        </span>
      )}
    </Link>
  );
}
