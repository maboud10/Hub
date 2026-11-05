import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Check, Layers, Plus, Settings2, Trash2 } from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { HEALTH_META, PROJECT_COLORS } from '@/projects/constants';
import { usePortfolios, useProjectsCaps, useVisibleProjects, type PortfolioView } from '@/projects/selectors';
import type { Portfolio, ProjectHealth } from '@/projects/types';
import { api, Bar, ConfirmModal, fmtDay, HealthPill, ProgressRing, ProjectIcon, report, UserAvatar } from './shared';

const HEALTH_ORDER: ProjectHealth[] = ['on_track', 'at_risk', 'off_track', 'on_hold', 'complete'];

export function PortfoliosView() {
  const me = useSessionUser();
  const caps = useProjectsCaps();
  const portfolios = usePortfolios();
  const [newOpen, setNewOpen] = useState(false);
  const [managing, setManaging] = useState<Portfolio | null>(null);
  const [deleting, setDeleting] = useState<Portfolio | null>(null);

  return (
    <div className="pj-view pj-portfolios">
      <div className="pj-view__head">
        <div>
          <h2 className="pj-view__title">Portfolios</h2>
          <p className="pj-view__sub">Executive rollups across multiple projects — health distribution, average progress and target dates in one view.</p>
        </div>
        {caps.canCreate && (
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={() => setNewOpen(true)}>
            <Plus /> New Portfolio
          </button>
        )}
      </div>

      {portfolios.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No portfolios yet"
          action={
            caps.canCreate ? (
              <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setNewOpen(true)}>
                <Plus /> Create a portfolio
              </button>
            ) : undefined
          }
        >
          Group related projects into a portfolio to track executive health and progress in one place.
        </EmptyState>
      ) : (
        <div className="pj-pf-list">
          {portfolios.map((pf) => {
            const canEdit = Boolean(me && (pf.portfolio.ownerId === me.id || caps.canManage));
            return (
              <PortfolioSection
                key={pf.portfolio.id}
                view={pf}
                canEdit={canEdit}
                onManage={() => setManaging(pf.portfolio)}
                onDelete={() => setDeleting(pf.portfolio)}
              />
            );
          })}
        </div>
      )}

      {newOpen && <NewPortfolioModal onClose={() => setNewOpen(false)} />}
      {managing && <ManagePortfolioModal portfolio={managing} onClose={() => setManaging(null)} />}
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete portfolio “${deleting?.name}”?`}
        confirmLabel="Delete portfolio"
        danger
        onConfirm={() => deleting && report(api().deletePortfolio(deleting.id))}
      >
        Deleting a portfolio only removes the rollup view — none of its projects or tasks are affected.
      </ConfirmModal>
    </div>
  );
}

function PortfolioSection({ view, canEdit, onManage, onDelete }: { view: PortfolioView; canEdit: boolean; onManage: () => void; onDelete: () => void }) {
  const { portfolio, cards, health, progressPct } = view;
  const total = Math.max(1, cards.length);

  return (
    <section className="pj-panelcard pj-pf-card" style={{ '--c': portfolio.color } as CSSProperties}>
      <header className="pj-pf-card__head">
        <span className="pj-pf-card__swatch" style={{ background: portfolio.color }} aria-hidden="true" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row row--wrap" style={{ gap: 10 }}>
            <h3 className="pj-pf-card__title truncate">{portfolio.name}</h3>
            <span className="badge badge--muted">{cards.length} project{cards.length === 1 ? '' : 's'}</span>
          </div>
          <p className="pj-pf-card__desc muted">{portfolio.description || 'No description.'}</p>
          <div className="pj-pf-card__meta">
            <span>Owner:</span>
            <UserAvatar userId={portfolio.ownerId} size={18} name />
          </div>
        </div>

        <div className="pj-pf-card__rollup">
          <ProgressRing pct={progressPct} size={64} stroke={6} color={portfolio.color}>
            <b>{progressPct}%</b>
          </ProgressRing>
          <div className="pj-pf-card__breakdown">
            <div className="pj-pf-hbar" title="Health breakdown">
              {cards.length === 0 ? (
                <i style={{ width: '100%', background: 'var(--border)' }} />
              ) : (
                HEALTH_ORDER.map((h) =>
                  health[h] > 0 ? (
                    <i key={h} style={{ width: `${(health[h] / total) * 100}%`, background: HEALTH_META[h].color }} title={`${HEALTH_META[h].label}: ${health[h]}`} />
                  ) : null,
                )
              )}
            </div>
            <div className="pj-pf-legend">
              <span>
                <i style={{ background: HEALTH_META.on_track.color }} /> {health.on_track} on track
              </span>
              <span>
                <i style={{ background: HEALTH_META.at_risk.color }} /> {health.at_risk} at risk
              </span>
              <span>
                <i style={{ background: HEALTH_META.off_track.color }} /> {health.off_track} off track
              </span>
              {health.complete > 0 && (
                <span>
                  <i style={{ background: HEALTH_META.complete.color }} /> {health.complete} done
                </span>
              )}
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn--sm" onClick={onManage}>
              <Settings2 /> Manage projects
            </button>
            <button type="button" className="icon-btn icon-btn--sm" onClick={onDelete} aria-label={`Delete ${portfolio.name}`} title="Delete portfolio">
              <Trash2 />
            </button>
          </div>
        )}
      </header>

      {cards.length === 0 ? (
        <p className="pj-empty-row">No visible projects in this portfolio yet.</p>
      ) : (
        <div className="pj-pf-table-wrap">
          <table className="pj-pf-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Health</th>
                <th>Progress</th>
                <th>Open / Overdue</th>
                <th>Target date</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(({ project, progress, openTasks }) => (
                <tr key={project.id}>
                  <td>
                    <Link to={`/projects/p/${project.id}`} className="pj-pf-projlink">
                      <ProjectIcon project={project} size={28} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="pj-pf-projname truncate">{project.name}</div>
                        <small className="muted mono">
                          {project.key} · {project.department}
                        </small>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <HealthPill health={project.health} />
                  </td>
                  <td>
                    <div className="pj-pf-prog">
                      <Bar pct={progress.pct} color={project.color} />
                      <span className="mono text-xs">{progress.pct}%</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-xs">
                      <b>{openTasks}</b> open
                      {progress.overdue > 0 && <span className="pj-danger-text"> · {progress.overdue} overdue</span>}
                    </span>
                  </td>
                  <td className="mono text-xs">{fmtDay(project.dueDate)}</td>
                  <td>
                    <UserAvatar userId={project.ownerId} size={22} name />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NewPortfolioModal({ onClose }: { onClose: () => void }) {
  const cards = useVisibleProjects(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  const toggle = (id: string) => setProjectIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const create = () => {
    const res = api().createPortfolio({ name, description, color, projectIds });
    if (report(res)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New Portfolio"
      subtitle="Roll up health, milestones and progress across related projects."
      icon={<Layers className="pj-modal-icon" />}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" disabled={name.trim().length < 3} onClick={create}>
            <Check /> Create portfolio
          </button>
        </>
      }
    >
      <div className="pj-form">
        <label className="field">
          <span className="field-label">Portfolio name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY27 Strategic Bets" autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who reviews this portfolio and what is its focus?" />
        </label>
        <div className="field">
          <span className="field-label">Accent color</span>
          <div className="pj-swatches">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" className={cx('pj-swatch', color === c && 'is-active')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Projects ({projectIds.length} selected)</span>
          <ul className="pj-people">
            {cards.map(({ project }) => {
              const on = projectIds.includes(project.id);
              return (
                <li key={project.id}>
                  <button type="button" className={cx('pj-people__item', on && 'is-active')} onClick={() => toggle(project.id)} aria-pressed={on}>
                    <ProjectIcon project={project} size={28} />
                    <span className="grow truncate">
                      <span className="pj-people__name">{project.name}</span>
                      <small>
                        {project.key} · {project.department}
                      </small>
                    </span>
                    <HealthPill health={project.health} compact />
                    <span className={cx('pj-people__check', on && 'is-on')}>
                      <Check />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function ManagePortfolioModal({ portfolio, onClose }: { portfolio: Portfolio; onClose: () => void }) {
  const cards = useVisibleProjects(true);
  const [selected, setSelected] = useState<string[]>(portfolio.projectIds);

  const toggle = (id: string) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = () => {
    if (report(api().setPortfolioProjects(portfolio.id, selected))) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage projects in ${portfolio.name}`}
      subtitle="Select which projects roll up into this portfolio."
      icon={<Layers className="pj-modal-icon" />}
      width={540}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={save}>
            <Check /> Save changes
          </button>
        </>
      }
    >
      <ul className="pj-people">
        {cards.map(({ project }) => {
          const on = selected.includes(project.id);
          return (
            <li key={project.id}>
              <button type="button" className={cx('pj-people__item', on && 'is-active')} onClick={() => toggle(project.id)} aria-pressed={on}>
                <ProjectIcon project={project} size={28} />
                <span className="grow truncate">
                  <span className="pj-people__name">{project.name}</span>
                  <small>
                    {project.key} · {project.department}
                  </small>
                </span>
                <HealthPill health={project.health} compact />
                <span className={cx('pj-people__check', on && 'is-on')}>
                  <Check />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
