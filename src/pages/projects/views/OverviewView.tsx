import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { BookOpen, CalendarDays, Diamond, FileText, GraduationCap, Layers, Lock, Megaphone, Send, Sparkles, Target } from 'lucide-react';
import { useHub } from '@/store/hub';
import { useTalent } from '@/talent/store';
import { useWiki } from '@/wiki/store';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { daysBetween, todayISO } from '@/hr/calendar';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { HEALTH_META } from '@/projects/constants';
import { computeProgress, draftStatusUpdate, goalProgress, suggestHealth } from '@/projects/engine';
import { useProjects } from '@/projects/store';
import type { IntakeForm, ProjectHealth, StatusUpdate } from '@/projects/types';
import type { ViewProps } from '../ProjectView';
import { api, Bar, DuePill, fmtDay, HealthPill, Pill, ProgressRing, report, SectionTitle, TypeGlyph, UserAvatar } from '../shared';

export function OverviewView({ project, allTasks, canEdit, today, openTask }: ViewProps) {
  const updates = useProjects((s) => s.statusUpdates);
  const goals = useProjects((s) => s.goals);
  const portfolios = useProjects((s) => s.portfolios);
  const forms = useProjects((s) => s.forms);
  const projects = useProjects((s) => s.projects);
  const allStoreTasks = useProjects((s) => s.tasks);
  const onboarding = useTalent((s) => s.onboarding);
  const articles = useWiki((s) => s.articles);
  const [composerOpen, setComposerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState<IntakeForm | null>(null);

  const progress = useMemo(() => computeProgress(allTasks, today), [allTasks, today]);
  const suggested = suggestHealth(progress, project, today);
  const feed = useMemo(() => updates.filter((u) => u.projectId === project.id).sort((a, b) => b.at - a.at), [updates, project.id]);
  const linkedGoals = useMemo(() => goals.filter((g) => g.projectIds.includes(project.id)), [goals, project.id]);
  const linkedPortfolios = useMemo(() => portfolios.filter((p) => p.projectIds.includes(project.id)), [portfolios, project.id]);
  const projectForms = useMemo(() => forms.filter((f) => f.projectId === project.id), [forms, project.id]);
  const milestones = useMemo(() => allTasks.filter((t) => t.type === 'milestone').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [allTasks]);
  const upcoming = useMemo(
    () =>
      allTasks
        .filter((t) => t.status !== 'done' && t.dueDate)
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
        .slice(0, 6),
    [allTasks],
  );
  const journey = project.links?.onboardingJourneyId ? onboarding.find((j) => j.id === project.links?.onboardingJourneyId) : undefined;
  const playbook = project.links?.wikiSlug ? articles.find((a) => a.slug === project.links?.wikiSlug) : undefined;
  const daysLeft = daysBetween(today, project.dueDate);

  return (
    <div className="pj-overview">
      <div className="pj-overview__main">
        <section className="pj-panelcard">
          <SectionTitle>About</SectionTitle>
          <p className="pj-overview__desc">{project.description || 'No description yet — project admins can add one in settings.'}</p>
          <div className="pj-overview__facts">
            <span>
              <small>Owner</small>
              <UserAvatar userId={project.ownerId} size={20} name />
            </span>
            <span>
              <small>Timeline</small>
              {fmtDay(project.startDate)} → {fmtDay(project.dueDate)}
            </span>
            <span>
              <small>{daysLeft >= 0 ? 'Days left' : 'Overrun'}</small>
              <b className={cx(daysLeft < 0 && 'pj-danger-text')}>{Math.abs(daysLeft)}</b>
            </span>
            <span>
              <small>Default view</small>
              {project.defaultView}
            </span>
          </div>
        </section>

        <section className="pj-panelcard">
          <SectionTitle right={suggested !== project.health ? <Pill color={HEALTH_META[suggested].color} dot title="Suggested from live task data">Nova suggests {HEALTH_META[suggested].label}</Pill> : undefined}>Progress</SectionTitle>
          <div className="pj-progress">
            <ProgressRing pct={progress.pct} size={96} stroke={9} color={project.color}>
              <b>{progress.pct}%</b>
              <small>
                {progress.done}/{progress.total}
              </small>
            </ProgressRing>
            <div className="pj-progress__stats">
              <Stat label="In progress" value={progress.inProgress} />
              <Stat label="Due in 7 days" value={progress.dueSoon} />
              <Stat label="Overdue" value={progress.overdue} tone={progress.overdue ? 'danger' : undefined} />
              <Stat label="Blocked" value={progress.blocked} tone={progress.blocked ? 'warning' : undefined} />
              <Stat label="Milestones" value={`${progress.milestonesDone}/${progress.milestonesTotal}`} />
            </div>
          </div>
        </section>

        <section className="pj-panelcard">
          <SectionTitle
            count={feed.length}
            right={
              canEdit ? (
                <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={() => setComposerOpen(true)}>
                  <Sparkles /> Post update
                </button>
              ) : undefined
            }
          >
            Status updates
          </SectionTitle>
          {feed.length === 0 ? (
            <EmptyState icon={<Megaphone />} title="No status updates yet">
              {canEdit ? 'Post the first one — Nova pre-fills it from live task data.' : 'Editors post weekly updates here.'}
            </EmptyState>
          ) : (
            <ol className="pj-feed">
              {feed.map((u) => (
                <StatusCard key={u.id} update={u} />
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="pj-overview__side">
        {(journey || playbook || project.links?.requisitionId) && (
          <section className="pj-panelcard">
            <SectionTitle>Linked across Helix</SectionTitle>
            <ul className="pj-links">
              {journey && (
                <li>
                  <Link to={`/hr/onboarding/${journey.id}`} className="pj-link">
                    <GraduationCap />
                    <span className="grow truncate">
                      HR onboarding journey
                      <small>
                        {journey.name} · starts {fmtDay(journey.startDate)} · {journey.status}
                      </small>
                    </span>
                  </Link>
                </li>
              )}
              {playbook && (
                <li>
                  <Link to={`/wiki/doc/${playbook.slug}`} className="pj-link">
                    <BookOpen />
                    <span className="grow truncate">
                      Knowledge Base playbook
                      <small>{playbook.title}</small>
                    </span>
                  </Link>
                </li>
              )}
              {project.links?.requisitionId && (
                <li>
                  <Link to={`/talent/reqs/${project.links.requisitionId}`} className="pj-link">
                    <FileText />
                    <span className="grow truncate">
                      Talent requisition
                      <small>{project.links.requisitionId}</small>
                    </span>
                  </Link>
                </li>
              )}
            </ul>
          </section>
        )}

        <section className="pj-panelcard">
          <SectionTitle count={milestones.length}>Milestones</SectionTitle>
          {milestones.length === 0 ? (
            <p className="pj-empty-row">Add a milestone task to mark key dates.</p>
          ) : (
            <ol className="pj-milestones">
              {milestones.map((m) => (
                <li key={m.id}>
                  <button type="button" className={cx('pj-milestone', m.status === 'done' && 'is-done')} onClick={() => openTask(m.id)}>
                    <Diamond />
                    <span className="grow truncate">{m.title}</span>
                    <DuePill dueDate={m.dueDate} status={m.status} today={today} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="pj-panelcard">
          <SectionTitle>
            <CalendarDays /> Upcoming deadlines
          </SectionTitle>
          {upcoming.length === 0 ? (
            <p className="pj-empty-row">Nothing scheduled.</p>
          ) : (
            <ul className="pj-deadlines">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <button type="button" className="pj-deadline" onClick={() => openTask(t.id)}>
                    <TypeGlyph type={t.type} />
                    <span className="grow truncate">{t.title}</span>
                    <UserAvatar userId={t.assigneeId} size={18} />
                    <DuePill dueDate={t.dueDate} status={t.status} today={today} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pj-panelcard">
          <SectionTitle count={linkedGoals.length}>
            <Target /> Goals
          </SectionTitle>
          {linkedGoals.length === 0 ? (
            <p className="pj-empty-row">
              Not linked to a goal yet. <Link to="/projects/goals">Browse goals</Link>
            </p>
          ) : (
            <ul className="pj-mini-goals">
              {linkedGoals.map((g) => {
                const pct = goalProgress(g, projects, allStoreTasks, today);
                return (
                  <li key={g.id}>
                    <Link to="/projects/goals" className="pj-mini-goal">
                      <span className="row row--between" style={{ gap: 8 }}>
                        <span className="truncate">{g.title}</span>
                        <HealthPill health={g.status} compact />
                      </span>
                      <Bar pct={pct} color={HEALTH_META[g.status].color} />
                      <small>
                        {pct}% · {g.level === 'company' ? 'Company goal' : `${g.department} goal`} · due {fmtDay(g.targetDate)}
                      </small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="pj-panelcard">
          <SectionTitle count={linkedPortfolios.length}>
            <Layers /> Portfolios
          </SectionTitle>
          {linkedPortfolios.length === 0 ? (
            <p className="pj-empty-row">Not part of a portfolio.</p>
          ) : (
            <ul className="pj-links">
              {linkedPortfolios.map((p) => (
                <li key={p.id}>
                  <Link to="/projects/portfolios" className="pj-link">
                    <i className="pj-chip__dot" style={{ background: p.color }} />
                    <span className="grow truncate">
                      {p.name}
                      <small>
                        {p.projectIds.length} projects · <UserAvatar userId={p.ownerId} size={14} name />
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pj-panelcard">
          <SectionTitle count={projectForms.length}>
            <FileText /> Intake forms
          </SectionTitle>
          {projectForms.length === 0 ? (
            <p className="pj-empty-row">Project admins can publish a request form in settings.</p>
          ) : (
            <ul className="pj-forms">
              {projectForms.map((f) => (
                <li key={f.id} className="pj-formcard">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="pj-formcard__title">
                      {f.title}
                      {!f.enabled && (
                        <span className="badge badge--muted">
                          <Lock /> Closed
                        </span>
                      )}
                    </div>
                    <small className="muted">
                      {f.submissions} submission{f.submissions === 1 ? '' : 's'} · {f.fields.length} fields
                    </small>
                  </div>
                  <button type="button" className="btn btn--sm" disabled={!f.enabled} onClick={() => setFormOpen(f)}>
                    <Send /> Submit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {composerOpen && <StatusComposer projectId={project.id} onClose={() => setComposerOpen(false)} />}
      {formOpen && <FormSubmitModal form={formOpen} onClose={() => setFormOpen(null)} onSubmitted={(id) => openTask(id)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'danger' | 'warning' }) {
  return (
    <span className={cx('pj-stat', tone && `pj-stat--${tone}`)}>
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}

function StatusCard({ update }: { update: StatusUpdate }) {
  return (
    <li className="pj-status" style={{ '--pill': HEALTH_META[update.health].color } as CSSProperties}>
      <div className="pj-status__rail" aria-hidden="true">
        <i />
      </div>
      <div className="pj-status__body">
        <div className="pj-status__head">
          <HealthPill health={update.health} />
          <span className="pj-status__title">{update.title}</span>
          <span className="spacer" />
          <span className="pj-status__by">
            <UserAvatar userId={update.authorId} size={18} name /> · {relativeTime(update.at)} · {update.progressPct}%
          </span>
        </div>
        <p className="pj-status__summary">{update.summary}</p>
        <div className="pj-status__cols">
          {update.highlights.length > 0 && (
            <div>
              <small>Highlights</small>
              <ul>
                {update.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {update.blockers.length > 0 && (
            <div className="pj-status__blockers">
              <small>Blockers</small>
              <ul>
                {update.blockers.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {update.nextSteps.length > 0 && (
            <div>
              <small>Next steps</small>
              <ul>
                {update.nextSteps.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusComposer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const users = useHub((s) => s.users);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId))!;
  const tasks = useProjects((s) => s.tasks);
  const draft = useMemo(() => draftStatusUpdate(project, tasks.filter((t) => t.projectId === projectId), users, todayISO()), [project, tasks, users, projectId]);
  const [health, setHealth] = useState<ProjectHealth>(draft.health);
  const [title, setTitle] = useState(draft.title);
  const [summary, setSummary] = useState(draft.summary);
  const [highlights, setHighlights] = useState(draft.highlights.join('\n'));
  const [blockers, setBlockers] = useState(draft.blockers.join('\n'));
  const [nextSteps, setNextSteps] = useState(draft.nextSteps.join('\n'));
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  const post = () => {
    const res = api().postStatusUpdate(projectId, { health, title, summary, highlights: lines(highlights), blockers: lines(blockers), nextSteps: lines(nextSteps), progressPct: draft.progressPct });
    if (report(res)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Post a status update"
      subtitle="Drafted by Nova from live task data — edit freely."
      icon={<Sparkles className="pj-modal-icon" />}
      width={640}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={post} disabled={title.trim().length < 4}>
            <Send /> Post update
          </button>
        </>
      }
    >
      <div className="pj-form">
        <div className="pj-health-picker" role="radiogroup" aria-label="Health">
          {(Object.keys(HEALTH_META) as ProjectHealth[]).map((h) => (
            <button key={h} type="button" role="radio" aria-checked={health === h} className={cx('pj-health-opt', health === h && 'is-active')} style={{ '--pill': HEALTH_META[h].color } as CSSProperties} onClick={() => setHealth(h)}>
              <i /> {HEALTH_META[h].label}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">Headline</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Summary</span>
          <textarea className="textarea" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <div className="pj-form__grid pj-form__grid--3">
          <label className="field">
            <span className="field-label">Highlights</span>
            <textarea className="textarea" rows={4} value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="One per line" />
          </label>
          <label className="field">
            <span className="field-label">Blockers</span>
            <textarea className="textarea" rows={4} value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="One per line" />
          </label>
          <label className="field">
            <span className="field-label">Next steps</span>
            <textarea className="textarea" rows={4} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} placeholder="One per line" />
          </label>
        </div>
        <p className="field-hint">
          Snapshot: {draft.progressPct}% complete · posting sets the project health to <b>{HEALTH_META[health].label}</b> and notifies all members.
        </p>
      </div>
    </Modal>
  );
}

export function FormSubmitModal({ form, onClose, onSubmitted }: { form: IntakeForm; onClose: () => void; onSubmitted?: (taskId: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const set = (id: string, v: string) => setValues((x) => ({ ...x, [id]: v }));
  const submit = () => {
    const res = api().submitForm(form.id, values);
    if (report(res)) {
      onClose();
      if (res.taskId) onSubmitted?.(res.taskId);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={form.title}
      subtitle={form.description}
      icon={<FileText className="pj-modal-icon" />}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={submit}>
            <Send /> Submit request
          </button>
        </>
      }
    >
      <div className="pj-form">
        {form.fields.map((f) => (
          <label key={f.id} className="field">
            <span className="field-label">
              {f.label}
              {f.required && <span className="pj-danger-text"> *</span>}
            </span>
            {f.type === 'textarea' ? (
              <textarea className="textarea" rows={3} value={values[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} />
            ) : f.type === 'select' ? (
              <select className="select" value={values[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">Choose…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input type={f.type === 'date' ? 'date' : 'text'} className="input" value={values[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} />
            )}
          </label>
        ))}
        <p className="field-hint">Your request becomes a task in the project; you’ll be added as a collaborator and notified of progress.</p>
      </div>
    </Modal>
  );
}
