/**
 * Portfolios — group projects into programmes. The detail page shows the
 * signature Health Quadrant: every project plotted by % of time elapsed (x)
 * against % complete (y); the diagonal is "on plan" and anything below it is
 * behind. Plus a sortable project table and portfolio-level telemetry.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowUpDown, Check, ChartScatter, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Avatars, CountUp, NeoEmpty, NeoHead, NeoMenu, NeoSearch, type MenuEntry } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { isProjectsAdmin } from '@/projects/access';
import { formatDue, shortDate, todayIso } from '@/projects/dates';
import { projectMetrics, STATUS_LABEL, type ProjectMetrics } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import { useProjects } from '@/projects/store';
import type { Portfolio, Project, ProjectStatus } from '@/projects/types';
import { pushUndo, useActor, useProjectsUI, useUsersMap, useVisibleProjects } from './ctx';
import { IconPortfolios as Layers } from './icons';
import { COLORS } from './ProjectModals';
import { ConfirmModal, PriorityGlyph, ProjectGlyph, StatusPill } from './ui';

const STATUS_ORDER: ProjectStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'complete'];

/** Visible projects + metrics for a portfolio. */
function usePortfolioProjects(pf: Portfolio | undefined, now: number) {
  const visible = useVisibleProjects(true);
  const tasks = useProjects((s) => s.tasks);
  return useMemo(() => {
    if (!pf) return [] as { p: Project; m: ProjectMetrics }[];
    const ids = new Set(pf.projectIds);
    return visible
      .filter((p) => ids.has(p.id))
      .map((p) => ({ p, m: projectMetrics(p, tasks.filter((t) => t.projectId === p.id), now) }));
  }, [pf, visible, tasks, now]);
}

/* ───────────────────────── list ───────────────────────── */

export function PortfoliosScreen() {
  const actor = useActor();
  const ui = useProjectsUI();
  const now = useNow(60_000);
  const portfolios = useProjects((s) => s.portfolios);
  const visible = useVisibleProjects(true);
  const tasks = useProjects((s) => s.tasks);
  const users = useUsersMap();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const cards = useMemo(() => {
    const vis = new Map(visible.map((p) => [p.id, p]));
    return portfolios
      .map((pf) => {
        const projects = pf.projectIds.map((id) => vis.get(id)).filter((p): p is Project => !!p);
        const ms = projects.map((p) => ({ p, m: projectMetrics(p, tasks.filter((t) => t.projectId === p.id), now) }));
        return { pf, items: ms };
      })
      .filter(({ pf, items }) => items.length > 0 || pf.ownerId === actor?.id)
      .filter(({ pf }) => !q.trim() || `${pf.name} ${pf.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  }, [portfolios, visible, tasks, now, actor, q]);

  if (!actor) return null;
  const canCreate = !actor.contractor;

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={<Layers />}
        eyebrow={<>Portfolios · {cards.length}</>}
        title="Portfolios"
        sub="Group projects into programmes and see health, progress and risk at a glance."
        actions={
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!canCreate} onClick={() => setCreating(true)} data-tip={canCreate ? 'Create a portfolio' : 'Contractors can’t create portfolios'} data-tip-pos="bottom" data-qa="new-portfolio">
            <Plus /> <span className="neo-btn__label">New portfolio</span>
          </button>
        }
      />
      <div className="neo-toolbar pj-toolbar">
        <NeoSearch value={q} onChange={setQ} size="sm" placeholder="Search portfolios" className="pj-filters__search" label="Search portfolios" />
      </div>
      <div className="neo-body neo-pad pj-pfs">
        {cards.length === 0 ? (
          <NeoEmpty
            icon={<Layers />}
            title={q ? 'No portfolios match' : 'No portfolios yet'}
            action={
              q ? (
                <button type="button" className="neo-btn neo-btn--soft" onClick={() => setQ('')}>
                  Clear search
                </button>
              ) : canCreate ? (
                <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setCreating(true)}>
                  <Plus /> Create a portfolio
                </button>
              ) : undefined
            }
          >
            {q ? 'Try a different search.' : 'A portfolio rolls up several projects so leaders can see which are on plan and which are slipping.'}
          </NeoEmpty>
        ) : (
          <ul className="pj-pfgrid neo-stagger">
            {cards.map(({ pf, items }, i) => {
              const avg = items.length ? items.reduce((a, x) => a + x.m.progress, 0) / items.length : 0;
              const behind = items.filter(({ m, p }) => p.status !== 'complete' && m.elapsed - m.progress > 0.12).length;
              const owner = users.get(pf.ownerId);
              return (
                <li key={pf.id} style={{ ['--i' as string]: i }}>
                  <button type="button" className="pj-pfcard neo-spot" style={{ '--pfc': pf.color } as CSSProperties} onClick={() => navigate(`/projects/portfolios/${pf.id}`)}>
                    <span className="pj-pfcard__head">
                      <span className="pj-pfcard__ico">
                        <Layers />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="pj-pfcard__name truncate">{pf.name}</span>
                        <span className="pj-pfcard__owner truncate">Owned by {owner?.name ?? 'someone'}</span>
                      </span>
                      <MiniQuadrant items={items} />
                    </span>
                    <span className="pj-pfcard__desc">{pf.description || 'No description.'}</span>
                    <span className="pj-pfcard__dist" role="img" aria-label={STATUS_ORDER.map((s) => `${items.filter((x) => x.p.status === s).length} ${STATUS_LABEL[s]}`).join(', ')}>
                      {STATUS_ORDER.map((s) => {
                        const n = items.filter((x) => x.p.status === s).length;
                        return n ? <i key={s} data-status={s} style={{ flex: n }} /> : null;
                      })}
                    </span>
                    <span className="pj-pfcard__nums">
                      <span>
                        <strong className="neo-num">{items.length}</strong> projects
                      </span>
                      <span>
                        <strong className="neo-num">{Math.round(avg * 100)}%</strong> avg done
                      </span>
                      <span className={cx(behind > 0 && 'is-warn')}>
                        <strong className="neo-num">{behind}</strong> behind plan
                      </span>
                    </span>
                    <span className="pj-pfcard__glyphs">
                      {items.slice(0, 6).map(({ p }) => (
                        <ProjectGlyph key={p.id} project={p} size={24} />
                      ))}
                      {items.length > 6 && <span className="neo-faint text-xs">+{items.length - 6}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <PortfolioModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/projects/portfolios/${id}`)} />
    </>
  );
}

function MiniQuadrant({ items }: { items: { p: Project; m: ProjectMetrics }[] }) {
  return (
    <svg viewBox="0 0 48 48" className="pj-miniquad" aria-hidden="true">
      <path d="M4 44 L44 44 L44 4 Z" className="pj-miniquad__behind" />
      <line x1="4" y1="44" x2="44" y2="4" className="pj-miniquad__diag" />
      {items.map(({ p, m }) => (
        <circle key={p.id} cx={4 + m.elapsed * 40} cy={44 - m.progress * 40} r={2.6} style={{ fill: p.color }} />
      ))}
    </svg>
  );
}

/* ───────────────────────── detail ───────────────────────── */

type SortKey = 'gap' | 'name' | 'progress' | 'due' | 'status';

export function PortfolioDetail() {
  const { portfolioId = '' } = useParams();
  const actor = useActor();
  const ui = useProjectsUI();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const users = useUsersMap();
  const pf = useProjects((s) => s.portfolios.find((x) => x.id === portfolioId));
  const update = useProjects((s) => s.updatePortfolio);
  const remove = useProjects((s) => s.deletePortfolio);
  const items = usePortfolioProjects(pf, now);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sort, setSort] = useState<SortKey>('gap');

  const sorted = useMemo(() => {
    const out = [...items];
    out.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.p.name.localeCompare(b.p.name);
        case 'progress':
          return b.m.progress - a.m.progress;
        case 'due':
          return a.p.dueDate.localeCompare(b.p.dueDate);
        case 'status':
          return STATUS_ORDER.indexOf(b.p.status) - STATUS_ORDER.indexOf(a.p.status);
        default:
          return b.m.elapsed - b.m.progress - (a.m.elapsed - a.m.progress);
      }
    });
    return out;
  }, [items, sort]);

  if (!actor) return null;
  if (!pf)
    return (
      <div className="neo-body neo-pad">
        <NeoEmpty
          icon={<Layers />}
          title="Portfolio not found"
          action={
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/projects/portfolios')}>
              All portfolios
            </button>
          }
        >
          It may have been deleted.
        </NeoEmpty>
      </div>
    );

  const canEdit = pf.ownerId === actor.id || isProjectsAdmin(actor);
  const canDelete = pf.ownerId === actor.id;
  const owner = users.get(pf.ownerId);
  const avg = items.length ? items.reduce((a, x) => a + x.m.progress, 0) / items.length : 0;
  const overdue = items.reduce((a, x) => a + x.m.overdue, 0);
  const behind = items.filter(({ m, p }) => p.status !== 'complete' && m.elapsed - m.progress > 0.12);
  const counts = (s: ProjectStatus) => items.filter((x) => x.p.status === s).length;

  const removeProject = (p: Project) => {
    const before = items.map((x) => x.p.id);
    const r = update(pf.id, { projectIds: before.filter((id) => id !== p.id) });
    if (!r.ok) return toast.error(r.error);
    pushUndo(`Removed ${p.key} from ${pf.name}`, () => update(pf.id, { projectIds: before }));
  };

  const menu: MenuEntry[] = [
    { label: 'Edit details', icon: <Pencil />, disabled: !canEdit, onSelect: () => setEditing(true) },
    { kind: 'sep' },
    { label: 'Delete portfolio', icon: <Trash2 />, danger: true, disabled: !canDelete, onSelect: () => setConfirm(true) },
  ];

  return (
    <>
      <NeoHead
        onToggleSide={ui.toggleSide}
        icon={
          <span className="pj-headglyph pj-pfglyph" style={{ ['--pc' as string]: pf.color }}>
            <Layers />
          </span>
        }
        eyebrow={
          <>
            <Link to="/projects/portfolios" className="pj-crumb">
              Portfolios
            </Link>{' '}
            · Owned by {owner?.name ?? 'someone'}
          </>
        }
        title={pf.name}
        sub={pf.description || `${items.length} projects`}
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--plasma" disabled={!canEdit} onClick={() => setAdding(true)} data-tip={canEdit ? undefined : 'Only the owner can change this portfolio'} data-tip-pos="bottom" data-qa="pf-add">
              <Plus /> <span className="neo-btn__label">Add projects</span>
            </button>
            <NeoMenu
              items={menu}
              width={220}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="Portfolio actions">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-body neo-pad pj-pf">
        {items.length === 0 ? (
          <NeoEmpty
            icon={<ChartScatter />}
            title="No projects in this portfolio"
            action={
              canEdit ? (
                <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setAdding(true)}>
                  <Plus /> Add projects
                </button>
              ) : undefined
            }
          >
            Add projects to plot them on the Health Quadrant and roll up their progress.
          </NeoEmpty>
        ) : (
          <>
            <div className="pj-kpis neo-stagger" role="list" aria-label="Portfolio numbers">
              <div className="pj-kpi" role="listitem" style={{ ['--i' as string]: 0 }}>
                <span className="neo-hud">Projects</span>
                <span className="pj-kpi__v neo-num">
                  <CountUp value={items.length} />
                </span>
                <span className="pj-kpi__cap">{counts('complete')} complete</span>
              </div>
              <div className="pj-kpi" role="listitem" style={{ ['--i' as string]: 1 }}>
                <span className="neo-hud">Average done</span>
                <span className="pj-kpi__v neo-num">
                  <CountUp value={avg * 100} />
                  <small>%</small>
                </span>
                <span className="pj-kpi__cap">across all projects</span>
              </div>
              <div className="pj-kpi" role="listitem" data-tone={behind.length ? 'warning' : undefined} style={{ ['--i' as string]: 2 }}>
                <span className="neo-hud">Behind plan</span>
                <span className="pj-kpi__v neo-num">
                  <CountUp value={behind.length} />
                </span>
                <span className="pj-kpi__cap">{behind.length ? behind.map((x) => x.p.key).join(', ') : 'everyone on plan'}</span>
              </div>
              <div className="pj-kpi" role="listitem" data-tone={overdue ? 'danger' : undefined} style={{ ['--i' as string]: 3 }}>
                <span className="neo-hud">Overdue tasks</span>
                <span className="pj-kpi__v neo-num">
                  <CountUp value={overdue} />
                </span>
                <span className="pj-kpi__cap">
                  {counts('at-risk')} at risk · {counts('off-track')} off track
                </span>
              </div>
            </div>

            <section className="neo-card pj-quad" aria-label="Health Quadrant">
              <div className="neo-section-head">
                <ChartScatter className="pj-ico" />
                <h2 className="neo-title">Health Quadrant</h2>
                <span className="neo-faint text-xs">time elapsed vs work complete — below the line is behind</span>
              </div>
              <HealthQuadrant items={items} />
            </section>

            <section className="neo-card neo-card--flush pj-pf__table" aria-label="Projects">
              <div className="neo-section-head pj-pf__tablehead">
                <h2 className="neo-title">Projects</h2>
                <span className="neo-count">{items.length}</span>
                <NeoMenu
                  label="Sort"
                  width={210}
                  items={(
                    [
                      ['gap', 'Most behind first'],
                      ['progress', 'Progress'],
                      ['due', 'Due date'],
                      ['status', 'Status'],
                      ['name', 'Name'],
                    ] as [SortKey, string][]
                  ).map(([k, l]) => ({ label: l, checked: sort === k, onSelect: () => setSort(k) }))}
                  trigger={(p) => (
                    <button {...p} type="button" className="pj-fchip pj-fchip--sm">
                      <ArrowUpDown /> Sort
                    </button>
                  )}
                />
              </div>
              <div className="neo-table-wrap pj-ptable">
                <table className="neo-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Plan</th>
                      <th>Owner</th>
                      <th>Due</th>
                      <th>Priority</th>
                      <th>Open</th>
                      {canEdit && <th aria-label="Remove" />}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(({ p, m }) => {
                      const gap = m.progress - m.elapsed;
                      const o = users.get(p.ownerId);
                      return (
                        <tr key={p.id} onClick={() => navigate(`/projects/p/${p.id}`)}>
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
                              <span className="pj-pcard__track pj-pcard__track--sm" style={{ ['--pc' as string]: p.color }}>
                                <i className="pj-pcard__time" style={{ width: `${m.elapsed * 100}%` }} />
                                <i className="pj-pcard__done" style={{ width: `${m.progress * 100}%` }} />
                              </span>
                              <span className="neo-num">{Math.round(m.progress * 100)}%</span>
                            </span>
                          </td>
                          <td>
                            <span className={cx('pj-gap', p.status === 'complete' ? 'is-ok' : gap >= -0.02 ? 'is-ok' : gap > -0.12 ? 'is-warn' : 'is-bad')}>
                              {p.status === 'complete' ? 'Shipped' : gap >= 0.02 ? `+${Math.round(gap * 100)} pts` : gap > -0.02 ? 'On plan' : `${Math.round(gap * 100)} pts`}
                            </span>
                          </td>
                          <td>
                            <span className="pj-ptable__who">
                              {o && <Avatars users={[o]} size={22} />}
                              <span className="truncate">{o?.name ?? '—'}</span>
                            </span>
                          </td>
                          <td className={cx(p.dueDate < todayIso(now) && p.status !== 'complete' && 'is-late')}>{formatDue(p.dueDate)}</td>
                          <td>
                            <span className="pj-ptable__who">
                              <PriorityGlyph priority={p.priority} /> {PRIORITY_NAME[p.priority]}
                            </span>
                          </td>
                          <td className="neo-num">
                            {m.open}
                            {m.overdue ? <span className="pj-ptable__late"> · {m.overdue} late</span> : null}
                          </td>
                          {canEdit && (
                            <td onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${p.name} from portfolio`} data-tip="Remove from portfolio" onClick={() => removeProject(p)}>
                                <X />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
      <PortfolioModal open={editing} onClose={() => setEditing(false)} portfolio={pf} />
      <AddProjectsModal open={adding} onClose={() => setAdding(false)} portfolio={pf} />
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${pf.name}?`}
        confirmLabel="Delete portfolio"
        danger
        onConfirm={() => {
          const snapshot = pf;
          const r = remove(pf.id);
          if (!r.ok) return toast.error(r.error);
          navigate('/projects/portfolios');
          pushUndo(`Deleted ${snapshot.name}`, () => {
            const c = useProjects.getState().createPortfolio({ name: snapshot.name, description: snapshot.description, color: snapshot.color, projectIds: snapshot.projectIds });
            if (c.ok) navigate(`/projects/portfolios/${c.portfolioId}`);
          });
        }}
      >
        The projects themselves are not affected — only this grouping is removed.
      </ConfirmModal>
    </>
  );
}

/* ───────────────────────── Health Quadrant ───────────────────────── */

const QW = 720;
const QH = 420;
const QP = { l: 52, r: 24, t: 20, b: 44 };
const QIW = QW - QP.l - QP.r;
const QIH = QH - QP.t - QP.b;
const qx = (v: number) => QP.l + v * QIW;
const qy = (v: number) => QP.t + (1 - v) * QIH;

function HealthQuadrant({ items }: { items: { p: Project; m: ProjectMetrics }[] }) {
  const navigate = useNavigate();
  const users = useUsersMap();
  const [hover, setHover] = useState<string | null>(null);
  const x = qx;
  const y = qy;
  const iw = QIW;
  const ih = QIH;
  // nudge overlapping points apart deterministically; bubble size = open work
  const pts = useMemo(() => {
    const maxOpen = Math.max(1, ...items.map((i) => i.m.open));
    const placed: { px: number; py: number }[] = [];
    return items.map(({ p, m }) => {
      let px = qx(m.elapsed);
      let py = qy(m.progress);
      for (let k = 0; k < 6 && placed.some((q) => Math.hypot(q.px - px, q.py - py) < 18); k++) {
        px += 9 * Math.cos(k * 2.1);
        py += 9 * Math.sin(k * 2.1);
      }
      placed.push({ px, py });
      return { p, m, px, py, r: 7 + (m.open / maxOpen) * 9 };
    });
  }, [items]);
  const h = pts.find((q) => q.p.id === hover);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="pj-quad__wrap">
      <div className="pj-quad__plot">
        <svg viewBox={`0 0 ${QW} ${QH}`} className="pj-quad__svg" role="group" aria-label="Health Quadrant: projects by time elapsed and work complete">
          <defs>
            <radialGradient id="pjQuadGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d={`M${x(0)} ${y(0)} L${x(1)} ${y(0)} L${x(1)} ${y(1)} Z`} className="pj-quad__behind" />
          <path d={`M${x(0)} ${y(0)} L${x(0)} ${y(1)} L${x(1)} ${y(1)} Z`} className="pj-quad__ahead" />
          {ticks.map((t) => (
            <g key={t}>
              <line className="pj-quad__grid" x1={x(t)} x2={x(t)} y1={y(0)} y2={y(1)} />
              <line className="pj-quad__grid" x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} />
              <text className="pj-quad__tick" x={x(t)} y={y(0) + 18} textAnchor="middle">
                {Math.round(t * 100)}%
              </text>
              <text className="pj-quad__tick" x={x(0) - 10} y={y(t) + 4} textAnchor="end">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          <line className="pj-quad__diag" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
          <text className="pj-quad__diaglabel" x={x(0.62)} y={y(0.62) - 8} transform={`rotate(${(-Math.atan2(ih, iw) * 180) / Math.PI} ${x(0.62)} ${y(0.62) - 8})`} textAnchor="middle">
            on plan
          </text>
          <text className="pj-quad__zone" x={x(0.03)} y={y(0.95)}>
            Ahead of plan
          </text>
          <text className="pj-quad__zone is-behind" x={x(0.97)} y={y(0.04)} textAnchor="end">
            Behind plan
          </text>
          <text className="pj-quad__axis" x={x(0.5)} y={QH - 6} textAnchor="middle">
            Time elapsed →
          </text>
          <text className="pj-quad__axis" x={14} y={y(0.5)} textAnchor="middle" transform={`rotate(-90 14 ${y(0.5)})`}>
            Work complete →
          </text>
          {pts.map(({ p, m, px, py, r }) => {
            const behind = p.status !== 'complete' && m.elapsed - m.progress > 0.02;
            return (
              <g
                key={p.id}
                className={cx('pj-quad__pt', behind && 'is-behind', hover === p.id && 'is-hover')}
                style={{ ['--pc' as string]: p.color } as CSSProperties}
                transform={`translate(${px} ${py})`}
                tabIndex={0}
                role="link"
                aria-label={`${p.name}: ${Math.round(m.progress * 100)}% complete, ${Math.round(m.elapsed * 100)}% of time elapsed, ${STATUS_LABEL[p.status]}`}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover((v) => (v === p.id ? null : v))}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover((v) => (v === p.id ? null : v))}
                onClick={() => navigate(`/projects/p/${p.id}/dashboard`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/projects/p/${p.id}/dashboard`);
                  }
                }}
              >
                <circle r={r + 9} className="pj-quad__halo" />
                <circle r={r} className="pj-quad__core" data-status={p.status} />
                <text className="pj-quad__key" y={-r - 7} textAnchor="middle">
                  {p.key}
                </text>
              </g>
            );
          })}
        </svg>
        {h && (
          <div className="pj-quad__tip" style={{ left: `${(h.px / QW) * 100}%`, top: `${(h.py / QH) * 100}%` }} role="status">
            <span className="pj-quad__tiptitle">
              <ProjectGlyph project={h.p} size={18} /> {h.p.name}
            </span>
            <StatusPill status={h.p.status} />
            <span className="pj-quad__tipmeta">
              {Math.round(h.m.progress * 100)}% done · {Math.round(h.m.elapsed * 100)}% of time used
            </span>
            <span className="pj-quad__tipmeta">
              {h.m.open} open{h.m.overdue ? ` · ${h.m.overdue} overdue` : ''} · due {shortDate(h.p.dueDate)} · {users.get(h.p.ownerId)?.name.split(' ')[0] ?? ''}
            </span>
          </div>
        )}
      </div>
      <ol className="pj-quad__legend" aria-label="Projects by distance from plan">
        {[...items]
          .sort((a, b) => b.m.elapsed - b.m.progress - (a.m.elapsed - a.m.progress))
          .map(({ p, m }) => {
            const gap = Math.round((m.progress - m.elapsed) * 100);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={cx('pj-quad__li', hover === p.id && 'is-hover')}
                  onPointerEnter={() => setHover(p.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(p.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => navigate(`/projects/p/${p.id}/dashboard`)}
                >
                  <i style={{ background: p.color }} />
                  <span className="grow truncate">{p.name}</span>
                  <span className={cx('pj-gap', p.status === 'complete' || gap >= -2 ? 'is-ok' : gap > -12 ? 'is-warn' : 'is-bad')}>{p.status === 'complete' ? 'done' : gap > 0 ? `+${gap}` : gap}</span>
                </button>
              </li>
            );
          })}
      </ol>
    </div>
  );
}

/* ───────────────────────── modals ───────────────────────── */

function PortfolioModal({ open, onClose, portfolio, onSaved }: { open: boolean; onClose: () => void; portfolio?: Portfolio; onSaved?: (id: string) => void }) {
  const create = useProjects((s) => s.createPortfolio);
  const update = useProjects((s) => s.updatePortfolio);
  const visible = useVisibleProjects();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(COLORS[1]);
  const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(portfolio?.name ?? '');
      setDesc(portfolio?.description ?? '');
      setColor(portfolio?.color ?? COLORS[1]);
      setIds(portfolio?.projectIds ?? []);
      setQ('');
    }
  }
  const list = visible.filter((p) => !q.trim() || `${p.name} ${p.key} ${p.department}`.toLowerCase().includes(q.trim().toLowerCase()));
  const save = () => {
    if (portfolio) {
      if (toast.result(update(portfolio.id, { name, description: desc, color }), 'Portfolio updated')) onClose();
      return;
    }
    const r = create({ name, description: desc, color, projectIds: ids });
    if (!r.ok) return toast.error(r.error);
    toast.success('Portfolio created', name.trim());
    onClose();
    onSaved?.(r.portfolioId);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={portfolio ? 'Edit portfolio' : 'New portfolio'}
      subtitle={portfolio ? portfolio.name : 'Group projects to track a programme together.'}
      width={600}
      className="neo-portal pj-modal"
      footer={
        <>
          {!portfolio && <span className="neo-faint text-sm grow">{ids.length} projects selected</span>}
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save} disabled={name.trim().length < 3} data-qa="save-portfolio">
            {portfolio ? 'Save' : 'Create portfolio'}
          </button>
        </>
      }
    >
      <div className="pj-form">
        <label className="neo-field">
          <span className="neo-label">Name</span>
          <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY27 Strategic Bets" maxLength={60} data-autofocus />
        </label>
        <label className="neo-field">
          <span className="neo-label">Description</span>
          <textarea className="neo-textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What ties these projects together?" rows={2} />
        </label>
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
        {!portfolio && (
          <div className="neo-field">
            <span className="neo-label">Projects</span>
            <NeoSearch value={q} onChange={setQ} size="sm" placeholder="Find projects" />
            <ProjectChecklist list={list} ids={ids} onChange={setIds} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddProjectsModal({ open, onClose, portfolio }: { open: boolean; onClose: () => void; portfolio: Portfolio }) {
  const update = useProjects((s) => s.updatePortfolio);
  const visible = useVisibleProjects();
  const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [lastOpen, setLastOpen] = useState(false);
  const visibleIds = new Set(visible.map((p) => p.id));
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setIds(portfolio.projectIds.filter((id) => visibleIds.has(id)));
      setQ('');
    }
  }
  const list = visible.filter((p) => !q.trim() || `${p.name} ${p.key} ${p.department}`.toLowerCase().includes(q.trim().toLowerCase()));
  const save = () => {
    if (toast.result(update(portfolio.id, { projectIds: ids }), 'Portfolio updated')) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Projects in this portfolio"
      subtitle={portfolio.name}
      width={560}
      className="neo-portal pj-modal"
      footer={
        <>
          <span className="neo-faint text-sm grow">{ids.length} selected</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save} data-qa="save-pf-projects">
            Save
          </button>
        </>
      }
    >
      <NeoSearch value={q} onChange={setQ} placeholder="Find projects" autoFocus />
      <ProjectChecklist list={list} ids={ids} onChange={setIds} />
    </Modal>
  );
}

function ProjectChecklist({ list, ids, onChange }: { list: Project[]; ids: string[]; onChange: (ids: string[]) => void }) {
  if (!list.length) return <p className="neo-faint text-sm">No projects match.</p>;
  return (
    <ul className="pj-checklist" role="listbox" aria-multiselectable="true" aria-label="Projects">
      {list.map((p) => {
        const on = ids.includes(p.id);
        return (
          <li key={p.id}>
            <button type="button" role="option" aria-selected={on} className={cx('pj-checklist__item', on && 'is-on')} onClick={() => onChange(on ? ids.filter((x) => x !== p.id) : [...ids, p.id])}>
              <span className="pj-checklist__box" aria-hidden="true">
                {on && <Check />}
              </span>
              <ProjectGlyph project={p} size={24} />
              <span className="grow truncate">{p.name}</span>
              <StatusPill status={p.status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
