/**
 * Overview — the project's mission brief: trajectory (plan vs actual),
 * brief, status updates, milestones, linked OKRs (Performance & OKRs bridge),
 * people, details and recent activity.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowUpRight, Diamond, Hash, Megaphone, Pencil, Sparkles, Target, UserCog } from 'lucide-react';
import { Bar, NeoEmpty, NeoSearch, NovaChip, Ring } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { useNow } from '@/hooks/useNow';
import { currentViewer, loadBridge, type BridgeKeyResult } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { canEditProject, PRIVACY_LABEL, ROLE_LABEL } from '@/projects/access';
import { DAY, diffDays, formatDue, parseIso, shortDate, todayIso } from '@/projects/dates';
import { forecastFinish, projectMetrics, STATUS_LABEL, suggestStatus } from '@/projects/metrics';
import { PRIORITY_NAME } from '@/projects/nlp';
import { useProjects } from '@/projects/store';
import type { Project, ProjectRole, StatusUpdate, Task } from '@/projects/types';
import { useActor, useProjectsUI, useUsersMap } from '../ctx';
import { DueChip, MarkdownLite, PriorityGlyph, StatusPill, UserAvatar } from '../ui';

const KR_TONE: Record<string, string> = { 'on-track': 'emerald', 'at-risk': 'amber', 'off-track': 'rose', done: 'violet' };
const KR_LABEL: Record<string, string> = { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track', done: 'Done' };
const ROLE_RANK: Record<ProjectRole, number> = { owner: 0, editor: 1, commenter: 2, viewer: 3 };

/** Key results the viewer can see, loaded through the Performance bridge. */
function useKeyResults(enabled = true, query = '') {
  const [krs, setKrs] = useState<BridgeKeyResult[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const viewer = currentViewer();
    if (!viewer) return;
    let alive = true;
    loadBridge('performance')
      .then((api) => {
        if (!alive) return;
        setKrs(api.listKeyResults(viewer, query ? { query } : undefined));
        setFailed(false);
      })
      .catch(() => {
        if (!alive) return;
        setKrs([]);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [enabled, query]);
  return { krs, failed };
}

export function OverviewView({ project, tasks, onPostUpdate, onShare }: { project: Project; tasks: Task[]; onPostUpdate: () => void; onShare: () => void }) {
  const actor = useActor();
  const now = useNow(60_000);
  const allUpdates = useProjects((s) => s.updates);
  const updates = useMemo(() => allUpdates.filter((u) => u.projectId === project.id).sort((a, b) => b.at - a.at), [allUpdates, project.id]);
  const canEdit = actor ? canEditProject(project, actor) : false;

  return (
    <div className="neo-pad pj-ov">
      <Trajectory project={project} tasks={tasks} now={now} canEdit={canEdit} onPostUpdate={onPostUpdate} />
      <div className="pj-ov__grid">
        <div className="pj-ov__main">
          <Brief project={project} canEdit={canEdit} />
          <Updates updates={updates} canEdit={canEdit} onPostUpdate={onPostUpdate} />
        </div>
        <aside className="pj-ov__side" aria-label="Project facts">
          <Milestones project={project} tasks={tasks} now={now} />
          <LinkedOkrs project={project} canEdit={canEdit} />
          <People project={project} onShare={onShare} />
          <Details project={project} />
          <Activity project={project} />
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────── trajectory ───────────────────────── */

function Trajectory({ project, tasks, now, canEdit, onPostUpdate }: { project: Project; tasks: Task[]; now: number; canEdit: boolean; onPostUpdate: () => void }) {
  const ui = useProjectsUI();
  const m = useMemo(() => projectMetrics(project, tasks, now), [project, tasks, now]);
  const forecast = useMemo(() => forecastFinish(tasks, now), [tasks, now]);
  const nova = suggestStatus(project, m);
  const start = parseIso(project.startDate).getTime();
  const end = parseIso(project.dueDate).getTime() + DAY;
  const span = Math.max(DAY, end - start);
  const at = (ts: number) => Math.max(0, Math.min(1, (ts - start) / span));
  const milestones = tasks.filter((t) => t.kind === 'milestone' && t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const today = todayIso(now);
  const daysLeft = diffDays(today, project.dueDate);
  const slip = forecast ? diffDays(project.dueDate, forecast) : null;
  const gap = m.progress - m.elapsed;
  const pace = gap >= 0.02 ? `${Math.round(gap * 100)} pts ahead of plan` : gap > -0.02 ? 'Right on plan' : `${Math.round(-gap * 100)} pts behind plan`;
  const showNova = project.status !== 'complete' && nova !== project.status;

  return (
    <section className="neo-card pj-traj neo-rise" aria-label="Trajectory">
      <div className="pj-traj__ring">
        <Ring value={m.progress} size={104} stroke={8} label={`${Math.round(m.progress * 100)}% complete`}>
          <span className="pj-traj__pct">
            {Math.round(m.progress * 100)}
            <small>%</small>
          </span>
        </Ring>
        <span className="neo-hud">
          {m.done}/{m.total} done
        </span>
      </div>
      <div className="pj-traj__main">
        <div className="pj-traj__top">
          <span className="neo-hud">Mission trajectory</span>
          <span className="pj-traj__pace" data-pace={gap >= -0.02 ? 'ok' : gap > -0.12 ? 'warn' : 'bad'}>
            {pace}
          </span>
        </div>
        <div className="pj-traj__track" role="img" aria-label={`${Math.round(m.progress * 100)}% complete with ${Math.round(m.elapsed * 100)}% of the timeline elapsed`}>
          <i className="pj-traj__time" style={{ width: `${m.elapsed * 100}%` }} />
          <i className="pj-traj__done" style={{ width: `${m.progress * 100}%` }} />
          {now >= start && now <= end && (
            <i className="pj-traj__now" style={{ left: `${at(now) * 100}%` }}>
              <span>Today</span>
            </i>
          )}
          {milestones.map((ms) => (
            <button
              key={ms.id}
              type="button"
              className={cx('pj-traj__ms', ms.completedAt && 'is-done', !ms.completedAt && ms.dueDate! < today && 'is-late')}
              style={{ left: `${at(parseIso(ms.dueDate!).getTime() + DAY / 2) * 100}%` }}
              onClick={() => ui.openTask(ms.id)}
              data-tip={`${ms.title} · ${shortDate(ms.dueDate!)}`}
              aria-label={`Milestone: ${ms.title}, ${formatDue(ms.dueDate!)}${ms.completedAt ? ', done' : ''}`}
            >
              <Diamond />
            </button>
          ))}
        </div>
        <div className="pj-traj__ends">
          <span>Start · {shortDate(project.startDate)}</span>
          <span>Due · {shortDate(project.dueDate)}</span>
        </div>
        <dl className="pj-traj__facts">
          <div>
            <dt>Forecast</dt>
            <dd data-tone={slip === null ? undefined : slip > 0 ? 'warn' : 'ok'}>
              {forecast ? shortDate(forecast) : 'No signal'}
              <small>{slip === null ? 'needs recent completions' : slip > 0 ? `${slip}d after due` : slip === 0 ? 'on the due date' : `${-slip}d early`}</small>
            </dd>
          </div>
          <div>
            <dt>Time left</dt>
            <dd data-tone={daysLeft < 0 && project.status !== 'complete' ? 'bad' : undefined}>
              {daysLeft >= 0 ? `${daysLeft}d` : `${-daysLeft}d over`}
              <small>{Math.round(m.elapsed * 100)}% elapsed</small>
            </dd>
          </div>
          <div>
            <dt>Overdue</dt>
            <dd data-tone={m.overdue ? 'bad' : 'ok'}>
              {m.overdue}
              <small>{m.dueThisWeek} due this week</small>
            </dd>
          </div>
          <div>
            <dt>Blocked</dt>
            <dd data-tone={m.blocked ? 'warn' : 'ok'}>
              {m.blocked}
              <small>{m.open} open</small>
            </dd>
          </div>
        </dl>
      </div>
      {showNova && (
        <div className="pj-traj__nova neo-nova">
          <span className="neo-nova__glow" />
          <Sparkles className="pj-traj__nova-ico" />
          <span className="pj-traj__nova-text">
            Nova reads this project as <StatusPill status={nova} /> — it’s marked {STATUS_LABEL[project.status].toLowerCase()}.
          </span>
          {canEdit && (
            <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={onPostUpdate} data-qa="nova-nudge">
              <Megaphone /> Post an update
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── brief ───────────────────────── */

function Brief({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const update = useProjects((s) => s.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.brief);
  useEffect(() => {
    if (!editing) setDraft(project.brief);
  }, [project.brief, editing]);
  const save = () => {
    const r = update(project.id, { brief: draft.trim() });
    if (toast.result(r, 'Brief saved')) setEditing(false);
  };
  return (
    <section className="neo-card pj-ov__card" aria-label="Brief">
      <div className="neo-section-head">
        <h2 className="neo-title">Brief</h2>
        {canEdit && !editing && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setEditing(true)} data-qa="edit-brief">
            <Pencil /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="pj-ov__briefedit">
          <textarea
            className="neo-textarea pj-ov__briefinput"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            aria-label="Project brief"
            placeholder="What are we doing, why does it matter, and how will we know we’re done? **Bold** and - bullets work."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <div className="pj-tp__edit-acts">
            <span className="neo-faint text-xs grow">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">↵</kbd> save · <kbd className="kbd">Esc</kbd> cancel
            </span>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={save}>
              Save brief
            </button>
          </div>
        </div>
      ) : project.brief.trim() ? (
        <MarkdownLite text={project.brief} className="pj-ov__brief" />
      ) : (
        <NeoEmpty
          compact
          icon={<Pencil />}
          title="No brief yet"
          action={
            canEdit ? (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setEditing(true)}>
                Write the brief
              </button>
            ) : undefined
          }
        >
          A short brief keeps everyone aligned on the why, the scope and what done looks like.
        </NeoEmpty>
      )}
    </section>
  );
}

/* ───────────────────────── status updates ───────────────────────── */

function Updates({ updates, canEdit, onPostUpdate }: { updates: StatusUpdate[]; canEdit: boolean; onPostUpdate: () => void }) {
  const users = useUsersMap();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <section className="neo-card pj-ov__card" aria-label="Status updates">
      <div className="neo-section-head">
        <h2 className="neo-title">Status updates</h2>
        <span className="neo-count">{updates.length}</span>
        {canEdit && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={onPostUpdate} data-qa="post-status">
            <Megaphone /> Post update
          </button>
        )}
      </div>
      {updates.length === 0 ? (
        <NeoEmpty
          compact
          icon={<Megaphone />}
          title="No updates yet"
          action={
            canEdit ? (
              <button type="button" className="neo-btn neo-btn--nova neo-btn--sm" onClick={onPostUpdate}>
                <Sparkles /> Draft one with Nova
              </button>
            ) : undefined
          }
        >
          Weekly updates tell stakeholders what shipped, what’s at risk and what’s next. Nova can draft one from the project’s real data.
        </NeoEmpty>
      ) : (
        <ol className="pj-upd">
          {updates.map((u, i) => {
            const expanded = i === 0 || open[u.id];
            const author = users.get(u.authorId);
            return (
              <li key={u.id} className={cx('pj-upd__item', i === 0 && 'is-latest')} data-status={u.status}>
                <span className="pj-upd__orb" aria-hidden="true" />
                <div className="pj-upd__card">
                  <div className="pj-upd__head">
                    <StatusPill status={u.status} />
                    {u.byNova && <NovaChip>Drafted by Nova</NovaChip>}
                    <span className="grow" />
                    <span className="pj-upd__time" title={new Date(u.at).toLocaleString()}>
                      {relativeTime(u.at)}
                    </span>
                  </div>
                  <h3 className="pj-upd__title">{u.title}</h3>
                  {u.body && (
                    <div className={cx('pj-upd__body', !expanded && 'is-clamped')}>
                      <MarkdownLite text={u.body} />
                    </div>
                  )}
                  <div className="pj-upd__foot">
                    <UserAvatar id={u.authorId} size={20} />
                    <span>{author?.name ?? 'Someone'}</span>
                    {i > 0 && u.body && (
                      <button type="button" className="pj-linkish" onClick={() => setOpen((o) => ({ ...o, [u.id]: !o[u.id] }))} aria-expanded={!!expanded}>
                        {expanded ? 'Show less' : 'Read update'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ───────────────────────── milestones ───────────────────────── */

function Milestones({ project, tasks, now }: { project: Project; tasks: Task[]; now: number }) {
  const ui = useProjectsUI();
  const today = todayIso(now);
  const list = tasks
    .filter((t) => t.kind === 'milestone')
    .sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return (
    <section className="neo-card pj-ov__card" aria-label="Key milestones">
      <div className="neo-section-head">
        <h2 className="neo-title">Key milestones</h2>
        <span className="neo-count">
          {list.filter((t) => t.completedAt).length}/{list.length}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="neo-faint text-sm">
          No milestones yet. Turn a task into a milestone from its <span className="neo-mono">…</span> menu, or add one with{' '}
          <button type="button" className="pj-linkish" onClick={() => ui.quickAdd({ projectId: project.id })}>
            Add task
          </button>
          .
        </p>
      ) : (
        <ul className="pj-msl">
          {list.map((t) => {
            const late = !t.completedAt && t.dueDate && t.dueDate < today;
            return (
              <li key={t.id}>
                <button type="button" className={cx('pj-msl__item', t.completedAt && 'is-done', late && 'is-late')} onClick={() => ui.openTask(t.id)}>
                  <Diamond className="pj-msl__ico" />
                  <span className="pj-msl__title truncate">{t.title}</span>
                  {t.dueDate && <DueChip due={t.dueDate} done={!!t.completedAt} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ───────────────────────── linked OKRs ───────────────────────── */

function LinkedOkrs({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const { krs, failed } = useKeyResults(true);
  const byId = useMemo(() => new Map((krs ?? []).map((k) => [k.id, k])), [krs]);
  const ids = project.keyResultIds;

  return (
    <section className="neo-card pj-ov__card" aria-label="Linked OKRs">
      <div className="neo-section-head">
        <Target className="pj-ico" />
        <h2 className="neo-title">Linked OKRs</h2>
        {canEdit && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setPicking(true)} data-qa="link-okrs">
            {ids.length ? 'Edit' : 'Link'}
          </button>
        )}
      </div>
      {failed && <p className="neo-faint text-sm">Performance &amp; OKRs is unavailable right now — linked key results will show here once it’s back.</p>}
      {!failed && ids.length === 0 && (
        <div className="pj-okr__empty">
          <p className="neo-faint text-sm">Connect this project to the key results it moves, so progress rolls up into Performance &amp; OKRs.</p>
          {canEdit && (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setPicking(true)}>
              <Target /> Link key results
            </button>
          )}
        </div>
      )}
      {!failed && ids.length > 0 && (
        <ul className="pj-okr">
          {ids.map((id) => {
            const kr = byId.get(id);
            if (!krs)
              return (
                <li key={id} className="pj-okr__item is-loading">
                  <span className="pj-skel" style={{ width: '70%' }} />
                  <span className="pj-skel" style={{ width: '40%' }} />
                </li>
              );
            if (!kr)
              return (
                <li key={id} className="pj-okr__item is-hidden">
                  <span className="pj-okr__title neo-mono">{id}</span>
                  <span className="pj-okr__obj">Not visible to you</span>
                </li>
              );
            return (
              <li key={id}>
                <button type="button" className="pj-okr__item neo-spot" onClick={() => navigate(`/performance/okrs/${kr.objectiveId}`)} title="Open in Performance & OKRs">
                  <span className="pj-okr__row">
                    <span className="pj-okr__title">{kr.title}</span>
                    <ArrowUpRight className="pj-okr__go" />
                  </span>
                  <span className="pj-okr__obj truncate">{kr.objectiveTitle}</span>
                  <span className="pj-okr__row">
                    <Bar value={kr.progress} className="pj-okr__bar" label={`${Math.round(kr.progress * 100)}%`} />
                    <span className="pj-okr__pct neo-num">{Math.round(kr.progress * 100)}%</span>
                    <span className="neo-chip neo-chip--sm" data-tone={KR_TONE[kr.status] ?? 'slate'}>
                      {KR_LABEL[kr.status] ?? kr.status}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <KeyResultPicker open={picking} onClose={() => setPicking(false)} project={project} />
    </section>
  );
}

function KeyResultPicker({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const link = useProjects((s) => s.linkKeyResults);
  const users = useUsersMap();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(project.keyResultIds);
  const { krs, failed } = useKeyResults(open);
  useEffect(() => {
    if (open) {
      setSel(project.keyResultIds);
      setQ('');
    }
  }, [open, project.keyResultIds]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (krs ?? []).filter((k) => !s || `${k.title} ${k.objectiveTitle} ${users.get(k.ownerId)?.name ?? ''}`.toLowerCase().includes(s));
    const m = new Map<string, { title: string; items: BridgeKeyResult[] }>();
    for (const k of list) {
      const g = m.get(k.objectiveId) ?? { title: k.objectiveTitle, items: [] };
      g.items.push(k);
      m.set(k.objectiveId, g);
    }
    return [...m.entries()];
  }, [krs, q, users]);

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = () => {
    if (toast.result(link(project.id, sel), sel.length ? `Linked ${sel.length} key ${sel.length === 1 ? 'result' : 'results'}` : 'Key results unlinked')) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link key results"
      subtitle={`Which OKRs does ${project.name} move?`}
      width={600}
      className="neo-portal pj-modal"
      footer={
        <>
          <span className="neo-faint text-sm grow">{sel.length} selected</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={save} disabled={failed} data-qa="save-okrs">
            Save links
          </button>
        </>
      }
    >
      <NeoSearch value={q} onChange={setQ} placeholder="Search key results, objectives or owners…" autoFocus />
      <div className="pj-krpick" role="listbox" aria-multiselectable="true" aria-label="Key results">
        {failed && <p className="neo-faint text-sm">Performance &amp; OKRs is unavailable right now. Try again in a moment.</p>}
        {!failed && krs === null && <p className="neo-faint text-sm">Loading key results…</p>}
        {!failed && krs !== null && groups.length === 0 && <p className="neo-faint text-sm">{q ? `No key results match “${q}”.` : 'No key results are visible to you yet.'}</p>}
        {groups.map(([oid, g]) => (
          <div key={oid} className="pj-krpick__group">
            <div className="neo-menu__label">{g.title}</div>
            {g.items.map((k) => {
              const on = sel.includes(k.id);
              return (
                <button key={k.id} type="button" role="option" aria-selected={on} className={cx('pj-krpick__item', on && 'is-on')} onClick={() => toggle(k.id)}>
                  <span className="pj-krpick__box" aria-hidden="true">
                    {on && <Target />}
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="pj-krpick__title">{k.title}</span>
                    <span className="pj-krpick__meta">
                      {users.get(k.ownerId)?.name ?? 'Owner'} · {k.period}
                    </span>
                  </span>
                  <span className="pj-krpick__prog">
                    <Bar value={k.progress} />
                    <span className="neo-faint text-xs neo-num">{Math.round(k.progress * 100)}%</span>
                  </span>
                  <span className="neo-chip neo-chip--sm" data-tone={KR_TONE[k.status] ?? 'slate'}>
                    {KR_LABEL[k.status] ?? k.status}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ───────────────────────── people / details / activity ───────────────────────── */

function People({ project, onShare }: { project: Project; onShare: () => void }) {
  const users = useUsersMap();
  const members = [...project.members].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || (users.get(a.userId)?.name ?? '').localeCompare(users.get(b.userId)?.name ?? ''));
  const shown = members.slice(0, 7);
  return (
    <section className="neo-card pj-ov__card" aria-label="Members and roles">
      <div className="neo-section-head">
        <h2 className="neo-title">Members &amp; roles</h2>
        <span className="neo-count">{members.length}</span>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onShare} data-qa="manage-members">
          <UserCog /> Manage
        </button>
      </div>
      <ul className="pj-ppl">
        {shown.map((m) => {
          const u = users.get(m.userId);
          return (
            <li key={m.userId} className="pj-ppl__item">
              <UserAvatar id={m.userId} size={30} presence />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="pj-ppl__name truncate">{u?.name ?? 'Former member'}</span>
                <span className="pj-ppl__sub truncate">{u?.title ?? ''}</span>
              </span>
              <span className="pj-ppl__role" data-role={m.role}>
                {ROLE_LABEL[m.role]}
              </span>
            </li>
          );
        })}
      </ul>
      {members.length > shown.length && (
        <button type="button" className="pj-linkish text-sm" onClick={onShare}>
          and {members.length - shown.length} more
        </button>
      )}
    </section>
  );
}

function Details({ project }: { project: Project }) {
  const navigate = useNavigate();
  const users = useUsersMap();
  return (
    <section className="neo-card pj-ov__card" aria-label="Details">
      <div className="neo-section-head">
        <h2 className="neo-title">Details</h2>
      </div>
      <dl className="neo-kv pj-ov__kv">
        <dt>Owner</dt>
        <dd className="pj-ov__who">
          <UserAvatar id={project.ownerId} size={20} /> {users.get(project.ownerId)?.name ?? 'Unknown'}
        </dd>
        <dt>Department</dt>
        <dd>{project.department}</dd>
        <dt>Visibility</dt>
        <dd>{PRIVACY_LABEL[project.privacy]}</dd>
        <dt>Priority</dt>
        <dd className="pj-ov__who">
          <PriorityGlyph priority={project.priority} /> {PRIORITY_NAME[project.priority]}
        </dd>
        <dt>Timeline</dt>
        <dd>
          {shortDate(project.startDate)} → {shortDate(project.dueDate)}
        </dd>
        <dt>Pulse</dt>
        <dd>
          {project.channelId ? (
            <button type="button" className="pj-linkish pj-ov__who" onClick={() => navigate(`/chat/c/${project.channelId}`)}>
              <Hash /> {project.channelId.replace(/^ch-/, '')}
            </button>
          ) : (
            <span className="neo-faint">No channel linked</span>
          )}
        </dd>
        <dt>Key</dt>
        <dd className="neo-mono">{project.key}</dd>
      </dl>
    </section>
  );
}

function Activity({ project }: { project: Project }) {
  const users = useUsersMap();
  const items = [...project.activity].sort((a, b) => b.at - a.at).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="neo-card pj-ov__card" aria-label="Project activity">
      <div className="neo-section-head">
        <h2 className="neo-title">Activity</h2>
      </div>
      <ol className="pj-feed">
        {items.map((a) => (
          <li key={a.id}>
            <div className="pj-feed__item">
              <UserAvatar id={a.actorId} size={22} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="pj-feed__text">
                  <strong>{a.actorId === 'automation' ? 'Automation' : (users.get(a.actorId)?.name.split(' ')[0] ?? 'Someone')}</strong> {a.text}
                </span>
              </span>
              <span className="pj-feed__time">{relativeTime(a.at)}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
