import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FolderOpen,
  Heart,
  Link2,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Stamp,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from '@/types';
import { useSessionUser } from '@/store/selectors';
import { useDrive } from '@/drive/store';
import { useWiki } from '@/wiki/store';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/primitives';
import { todayISO } from '@/hr/calendar';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PRIORITY_META, QUICK_TAGS, STATUS_META, TASK_TYPE_META } from '@/projects/constants';
import { isDone, wouldCreateCycle } from '@/projects/engine';
import { useTask } from '@/projects/selectors';
import { useProjects } from '@/projects/store';
import type { Recurrence, TaskAttachment, TaskPriority, TaskStatus, TaskType } from '@/projects/types';
import {
  api,
  ApprovalActions,
  ConfirmModal,
  DuePill,
  Menu,
  PriorityFlag,
  ProjectChip,
  report,
  StatusPill,
  TagChip,
  TypeGlyph,
  useActiveUsers,
  UserAvatar,
  UserPicker,
  useTaskParam,
  useUserMap,
} from './shared';

const EMOJIS = ['👍', '🎉', '❤️', '🚀'];

export function TaskPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const detail = useTask(taskId);
  const me = useSessionUser();
  const users = useUserMap();
  const allUsers = useActiveUsers();
  const allTasks = useProjects((s) => s.tasks);
  const sprints = useProjects((s) => s.sprints);
  const driveItems = useDrive((s) => s.items);
  const wikiArticles = useWiki((s) => s.articles);
  const { open: openOtherTask } = useTaskParam();
  const today = todayISO();

  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [depPickerId, setDepPickerId] = useState('');
  const [attachMode, setAttachMode] = useState<null | 'drive' | 'wiki' | 'link'>(null);
  const [attachTarget, setAttachTarget] = useState('');
  const [attachTitle, setAttachTitle] = useState('');
  const [hoursInput, setHoursInput] = useState('1');
  const [commentBody, setCommentBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (detail) {
      setTitleDraft(detail.task.title);
      setDescDraft(detail.task.description);
      setEditingTitle(false);
      setEditingDesc(false);
    }
  }, [detail?.task.id, detail?.task.title, detail?.task.description]);

  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);

  if (!detail) {
    return (
      <Sheet open onClose={onClose} title="Task unavailable" width={620}>
        <div className="pj-empty-row">This task was deleted or belongs to a project you don’t have access to.</div>
      </Sheet>
    );
  }

  const { task, project, blocked, blockers, dependents, canEdit, canDelete, canComment, approvalGate } = detail;
  const done = isDone(task);
  const pendingApproval = task.type === 'approval' && task.approval?.decision === 'pending';
  const memberUsers = project.members.map((m) => users.get(m.userId)).filter((u): u is User => Boolean(u));
  const projectSprints = sprints.filter((s) => s.projectId === project.id);
  const liked = me ? task.likes.includes(me.id) : false;
  const following = me ? task.collaboratorIds.includes(me.id) : false;

  // Cycle-safe candidate blockers in the same project
  const depCandidates = allTasks.filter(
    (t) => t.projectId === project.id && t.id !== task.id && !task.dependsOn.includes(t.id) && !wouldCreateCycle(task.id, t.id, byId),
  );

  const saveTitle = () => {
    setEditingTitle(false);
    const clean = titleDraft.trim();
    if (clean.length >= 2 && clean !== task.title) {
      report(api().updateTask(task.id, { title: clean }));
    } else {
      setTitleDraft(task.title);
    }
  };

  const saveDesc = () => {
    setEditingDesc(false);
    if (descDraft !== task.description) {
      report(api().updateTask(task.id, { description: descDraft }));
    }
  };

  const submitSubtask = () => {
    const clean = subtaskTitle.trim();
    if (!clean) return;
    if (report(api().addSubtask(task.id, clean))) setSubtaskTitle('');
  };

  const submitAttachment = () => {
    if (!attachMode) return;
    if (attachMode === 'drive') {
      const f = driveItems.find((x) => x.id === attachTarget);
      if (!f) return;
      if (report(api().addAttachment(task.id, { kind: 'drive', driveFileId: f.id, title: f.name }))) {
        setAttachMode(null);
        setAttachTarget('');
      }
    } else if (attachMode === 'wiki') {
      const a = wikiArticles.find((x) => x.slug === attachTarget);
      if (!a) return;
      if (report(api().addAttachment(task.id, { kind: 'wiki', wikiSlug: a.slug, title: a.title }))) {
        setAttachMode(null);
        setAttachTarget('');
      }
    } else {
      if (!attachTitle.trim() || !attachTarget.trim()) return;
      if (report(api().addAttachment(task.id, { kind: 'link', url: attachTarget.trim(), title: attachTitle.trim() }))) {
        setAttachMode(null);
        setAttachTarget('');
        setAttachTitle('');
      }
    }
  };

  const submitComment = () => {
    const clean = commentBody.trim();
    if (!clean) return;
    // Parse @Name mentions
    const mentions = allUsers.filter((u) => clean.toLowerCase().includes(`@${u.name.split(' ')[0].toLowerCase()}`)).map((u) => u.id);
    if (report(api().addComment(task.id, clean, mentions))) setCommentBody('');
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        width={680}
        label={`${project.key}-${task.number} ${task.title}`}
        header={
          <div className="pj-drawer__head">
            <button
              type="button"
              className={cx('btn btn--sm', done ? 'btn--success' : 'btn--ghost')}
              disabled={!canEdit || pendingApproval}
              title={pendingApproval ? 'Approvals complete when the approver decides' : undefined}
              onClick={() => report(api().completeTask(task.id, !done))}
            >
              <CheckCircle2 /> {done ? 'Completed' : 'Mark complete'}
            </button>
            <span className="pj-drawer__ref mono">
              {project.key}-{task.number}
            </span>
            <ProjectChip project={project} />
            <span className="spacer" />
            {canComment && (
              <>
                <button
                  type="button"
                  className={cx('icon-btn icon-btn--sm', liked && 'is-active')}
                  onClick={() => report(api().toggleLike(task.id))}
                  title={liked ? 'Unlike task' : 'Like task'}
                  aria-label="Like task"
                >
                  <Heart />
                  {task.likes.length > 0 && <small className="mono">{task.likes.length}</small>}
                </button>
                <button
                  type="button"
                  className={cx('icon-btn icon-btn--sm', following && 'is-active')}
                  onClick={() => report(api().toggleFollow(task.id))}
                  title={following ? 'Following notifications' : 'Follow task'}
                  aria-label="Follow task"
                >
                  <Bell />
                </button>
              </>
            )}
            {canDelete && (
              <button type="button" className="icon-btn icon-btn--sm pj-danger-text" onClick={() => setConfirmDelete(true)} title="Delete task" aria-label="Delete task">
                <Trash2 />
              </button>
            )}
            <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close panel">
              <X />
            </button>
          </div>
        }
      >
        <div className="pj-drawer__body">
          {/* Approval Banner */}
          {task.type === 'approval' && task.approval && (
            <div className={cx('pj-banner', `pj-banner--${task.approval.decision}`)}>
              <div className="pj-banner__top">
                <Stamp />
                <div className="grow">
                  <b>
                    {task.approval.decision === 'pending'
                      ? 'Approval requested'
                      : task.approval.decision === 'approved'
                        ? 'Approved ✓'
                        : task.approval.decision === 'changes_requested'
                          ? 'Changes requested'
                          : 'Rejected'}
                  </b>
                  <div className="text-xs muted">
                    Approver: <UserAvatar userId={task.approval.approverId} size={16} name />
                    {task.approval.note && ` · “${task.approval.note}”`}
                  </div>
                </div>
              </div>
              {task.approval.decision === 'pending' && (
                <div style={{ marginTop: 8 }}>
                  {approvalGate.ok ? (
                    <ApprovalActions taskId={task.id} />
                  ) : (
                    <span className="text-xs muted">{approvalGate.reason}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Blocked Warning Banner */}
          {blocked && (
            <div className="pj-banner pj-banner--blocked">
              <div className="pj-banner__top">
                <Lock />
                <div className="grow">
                  <b>Blocked by {blockers.filter((b) => !isDone(b)).length} open dependency{blockers.filter((b) => !isDone(b)).length === 1 ? '' : 'ies'}</b>
                  <div className="row row--wrap" style={{ gap: 6, marginTop: 4 }}>
                    {blockers
                      .filter((b) => !isDone(b))
                      .map((b) => (
                        <button key={b.id} type="button" className="pj-dep-chip is-open" onClick={() => openOtherTask(b.id)}>
                          <Lock /> {project.key}-{b.number} {b.title}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Title & Type */}
          <div className="pj-drawer__title-row">
            {canEdit ? (
              <Menu
                width={170}
                header="Task type"
                trigger={(_, toggle) => (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={toggle} title="Change task type">
                    <TypeGlyph type={task.type} label /> <ChevronDown />
                  </button>
                )}
                items={(Object.keys(TASK_TYPE_META) as TaskType[]).map((t) => ({
                  key: t,
                  label: TASK_TYPE_META[t].label,
                  active: task.type === t,
                  onSelect: () => report(api().updateTask(task.id, { type: t })),
                }))}
              />
            ) : (
              <TypeGlyph type={task.type} label />
            )}

            {editingTitle && canEdit ? (
              <input
                className="pj-drawer__title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') {
                    setTitleDraft(task.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
              />
            ) : (
              <h2
                className={cx('pj-drawer__title', done && 'is-done', canEdit && 'is-editable')}
                onClick={() => canEdit && setEditingTitle(true)}
                title={canEdit ? 'Click to edit title' : undefined}
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="pj-meta-grid">
            <div className="pj-meta-row">
              <span className="pj-meta-label">Status</span>
              {canEdit ? (
                <Menu
                  width={180}
                  trigger={(_, toggle) => (
                    <button type="button" className="pj-meta-btn" onClick={toggle}>
                      <StatusPill status={task.status} /> <ChevronDown />
                    </button>
                  )}
                  items={(Object.keys(STATUS_META) as TaskStatus[]).map((s) => ({
                    key: s,
                    label: STATUS_META[s].label,
                    active: task.status === s,
                    onSelect: () => report(api().updateTask(task.id, { status: s })),
                  }))}
                />
              ) : (
                <StatusPill status={task.status} />
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Priority</span>
              {canEdit ? (
                <Menu
                  width={180}
                  trigger={(_, toggle) => (
                    <button type="button" className="pj-meta-btn" onClick={toggle}>
                      <PriorityFlag priority={task.priority} label /> <ChevronDown />
                    </button>
                  )}
                  items={(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => ({
                    key: p,
                    label: PRIORITY_META[p].label,
                    active: task.priority === p,
                    onSelect: () => report(api().updateTask(task.id, { priority: p })),
                  }))}
                />
              ) : (
                <PriorityFlag priority={task.priority} label />
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Assignee</span>
              {canEdit ? (
                <UserPicker
                  value={task.assigneeId}
                  onChange={(assigneeId) => report(api().updateTask(task.id, { assigneeId }))}
                  candidates={memberUsers}
                  others={allUsers}
                  trigger={(_, toggle) => (
                    <button type="button" className="pj-meta-btn" onClick={toggle}>
                      <UserAvatar userId={task.assigneeId} size={22} name /> <ChevronDown />
                    </button>
                  )}
                />
              ) : (
                <UserAvatar userId={task.assigneeId} size={22} name />
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Section</span>
              {canEdit ? (
                <select
                  className="select pj-select-sm"
                  value={task.sectionId}
                  onChange={(e) => report(api().moveTask(task.id, e.target.value))}
                  aria-label="Section"
                >
                  {project.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{project.sections.find((s) => s.id === task.sectionId)?.name}</span>
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Start date</span>
              {canEdit ? (
                <input
                  type="date"
                  className="input pj-select-sm"
                  value={task.startDate ?? ''}
                  onChange={(e) => report(api().updateTask(task.id, { startDate: e.target.value || undefined }))}
                />
              ) : (
                <span className="mono text-xs">{task.startDate ?? '—'}</span>
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Due date</span>
              <div className="row" style={{ gap: 6 }}>
                {canEdit ? (
                  <input
                    type="date"
                    className="input pj-select-sm"
                    value={task.dueDate ?? ''}
                    onChange={(e) => report(api().updateTask(task.id, { dueDate: e.target.value || undefined }))}
                  />
                ) : null}
                <DuePill dueDate={task.dueDate} status={task.status} today={today} showEmpty={!canEdit} />
              </div>
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Story points</span>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input pj-select-sm"
                  style={{ width: 84 }}
                  value={task.storyPoints ?? ''}
                  placeholder="—"
                  onChange={(e) => report(api().updateTask(task.id, { storyPoints: e.target.value ? Number(e.target.value) : undefined }))}
                />
              ) : (
                <span className="mono text-xs">{task.storyPoints ?? '—'}</span>
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Sprint</span>
              {canEdit ? (
                <select
                  className="select pj-select-sm"
                  value={task.sprintId ?? ''}
                  onChange={(e) => report(api().updateTask(task.id, { sprintId: e.target.value || undefined }))}
                >
                  <option value="">Backlog (no sprint)</option>
                  {projectSprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.state})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs">{projectSprints.find((s) => s.id === task.sprintId)?.name ?? 'Backlog'}</span>
              )}
            </div>

            <div className="pj-meta-row">
              <span className="pj-meta-label">Recurring</span>
              {canEdit ? (
                <select
                  className="select pj-select-sm"
                  value={task.recurring ?? ''}
                  onChange={(e) => report(api().updateTask(task.id, { recurring: (e.target.value || undefined) as Recurrence | undefined }))}
                >
                  <option value="">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              ) : (
                <span className="text-xs">{task.recurring ?? 'None'}</span>
              )}
            </div>

            {/* Custom Fields */}
            {project.customFields.map((cf) => {
              const val = task.customFieldValues[cf.id];
              return (
                <div key={cf.id} className="pj-meta-row">
                  <span className="pj-meta-label">{cf.name}</span>
                  {canEdit ? (
                    cf.type === 'select' ? (
                      <select
                        className="select pj-select-sm"
                        value={val ?? ''}
                        onChange={(e) =>
                          report(
                            api().updateTask(task.id, {
                              customFieldValues: { ...task.customFieldValues, [cf.id]: e.target.value },
                            }),
                          )
                        }
                      >
                        <option value="">—</option>
                        {cf.options?.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={cf.type === 'number' ? 'number' : 'text'}
                        className="input pj-select-sm"
                        style={{ width: 110 }}
                        value={val ?? ''}
                        onChange={(e) =>
                          report(
                            api().updateTask(task.id, {
                              customFieldValues: {
                                ...task.customFieldValues,
                                [cf.id]: cf.type === 'number' ? Number(e.target.value) : e.target.value,
                              },
                            }),
                          )
                        }
                      />
                    )
                  ) : (
                    <span className="text-xs">{val ?? '—'}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tags */}
          <div className="pj-drawer__sec">
            <div className="row row--wrap" style={{ gap: 6 }}>
              {task.tags.map((t) => (
                <TagChip
                  key={t}
                  tag={t}
                  onRemove={canEdit ? () => report(api().updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })) : undefined}
                />
              ))}
              {canEdit && (
                <Menu
                  width={180}
                  header="Add tag"
                  trigger={(_, toggle) => (
                    <button type="button" className="btn btn--sm btn--ghost" onClick={toggle}>
                      <Plus /> Tag
                    </button>
                  )}
                  items={QUICK_TAGS.filter((t) => !task.tags.includes(t)).map((t) => ({
                    key: t,
                    label: `#${t}`,
                    onSelect: () => report(api().updateTask(task.id, { tags: [...task.tags, t] })),
                  }))}
                />
              )}
            </div>
          </div>

          {/* Description */}
          <div className="pj-drawer__sec">
            <div className="pj-sec-title">
              <h3>Description</h3>
              {canEdit && !editingDesc && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditingDesc(true)}>
                  Edit
                </button>
              )}
            </div>
            {editingDesc && canEdit ? (
              <div className="stack stack--sm">
                <textarea
                  className="textarea"
                  rows={4}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Add acceptance criteria, context or notes…"
                  autoFocus
                />
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={saveDesc}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => {
                      setDescDraft(task.description);
                      setEditingDesc(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                className={cx('pj-drawer__desc', !task.description && 'muted')}
                onClick={() => canEdit && setEditingDesc(true)}
              >
                {task.description || (canEdit ? 'Click to add a description…' : 'No description.')}
              </p>
            )}
          </div>

          {/* Subtasks Checklist */}
          <div className="pj-drawer__sec">
            <div className="pj-sec-title">
              <h3>
                Subtasks{' '}
                <span className="pj-sec-title__count">
                  {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                </span>
              </h3>
            </div>
            {task.subtasks.length > 0 && (
              <ul className="pj-subtasks">
                {task.subtasks.map((st) => (
                  <li key={st.id} className={cx('pj-subtask', st.done && 'is-done')}>
                    <button
                      type="button"
                      className={cx('pj-check', st.done && 'is-done')}
                      disabled={!canEdit}
                      onClick={() => report(api().toggleSubtask(task.id, st.id))}
                      aria-label={st.done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
                    >
                      <CheckCircle2 />
                    </button>
                    <span className="grow truncate">{st.title}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        onClick={() => report(api().removeSubtask(task.id, st.id))}
                        aria-label={`Delete subtask ${st.title}`}
                      >
                        <X />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form
                className="row"
                style={{ gap: 6, marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSubtask();
                }}
              >
                <input
                  className="input pj-select-sm grow"
                  placeholder="Add a subtask…"
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                />
                <button type="submit" className="btn btn--sm" disabled={!subtaskTitle.trim()}>
                  <Plus /> Add
                </button>
              </form>
            )}
          </div>

          {/* Dependencies (Blocked By / Blocking) */}
          <div className="pj-drawer__sec">
            <div className="pj-sec-title">
              <h3>Dependencies</h3>
            </div>
            <div className="stack stack--sm">
              <div>
                <small className="muted">Blocked by ({blockers.length})</small>
                <div className="row row--wrap" style={{ gap: 6, marginTop: 4 }}>
                  {blockers.length === 0 && <span className="text-xs faint">None</span>}
                  {blockers.map((b) => (
                    <span key={b.id} className={cx('pj-dep-chip', !isDone(b) && 'is-open')}>
                      <button type="button" className="pj-dep-chip__link" onClick={() => openOtherTask(b.id)}>
                        {!isDone(b) ? <Lock /> : <CheckCircle2 />} {project.key}-{b.number} {b.title}
                      </button>
                      {canEdit && (
                        <button type="button" onClick={() => report(api().setDependency(task.id, b.id, false))} aria-label="Remove blocker">
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <small className="muted">Blocking ({dependents.length})</small>
                <div className="row row--wrap" style={{ gap: 6, marginTop: 4 }}>
                  {dependents.length === 0 && <span className="text-xs faint">None</span>}
                  {dependents.map((d) => (
                    <button key={d.id} type="button" className="pj-dep-chip" onClick={() => openOtherTask(d.id)}>
                      {project.key}-{d.number} {d.title}
                    </button>
                  ))}
                </div>
              </div>

              {canEdit && depCandidates.length > 0 && (
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <select className="select pj-select-sm grow" value={depPickerId} onChange={(e) => setDepPickerId(e.target.value)} aria-label="Add blocker">
                    <option value="">+ Add blocker dependency (cycle-safe)…</option>
                    {depCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {project.key}-{c.number} · {c.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!depPickerId}
                    onClick={() => {
                      if (depPickerId && report(api().setDependency(task.id, depPickerId, true))) {
                        setDepPickerId('');
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Attachments (Drive / Wiki / Link) */}
          <div className="pj-drawer__sec">
            <div className="pj-sec-title">
              <h3>
                <Paperclip /> Attachments <span className="pj-sec-title__count">{task.attachments.length}</span>
              </h3>
              {canEdit && (
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAttachMode('drive')}>
                    + Drive
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAttachMode('wiki')}>
                    + Wiki
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAttachMode('link')}>
                    + Link
                  </button>
                </div>
              )}
            </div>

            {task.attachments.length > 0 && (
              <ul className="pj-attach-list">
                {task.attachments.map((att) => (
                  <AttachmentRow
                    key={att.id}
                    att={att}
                    canEdit={canEdit}
                    onRemove={() => report(api().removeAttachment(task.id, att.id))}
                  />
                ))}
              </ul>
            )}

            {attachMode && (
              <div className="pj-panelcard" style={{ padding: 10, marginTop: 8 }}>
                {attachMode === 'drive' && (
                  <div className="row" style={{ gap: 6 }}>
                    <select className="select pj-select-sm grow" value={attachTarget} onChange={(e) => setAttachTarget(e.target.value)}>
                      <option value="">Choose a Helix Drive file…</option>
                      {driveItems
                        .filter((i) => i.kind !== 'folder' && !i.trashedAt)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                    </select>
                    <button type="button" className="btn btn--sm btn--primary pj-btn-violet" disabled={!attachTarget} onClick={submitAttachment}>
                      Attach
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAttachMode(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {attachMode === 'wiki' && (
                  <div className="row" style={{ gap: 6 }}>
                    <select className="select pj-select-sm grow" value={attachTarget} onChange={(e) => setAttachTarget(e.target.value)}>
                      <option value="">Choose a Knowledge Base article…</option>
                      {wikiArticles.map((a) => (
                        <option key={a.slug} value={a.slug}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn--sm btn--primary pj-btn-violet" disabled={!attachTarget} onClick={submitAttachment}>
                      Attach
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAttachMode(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {attachMode === 'link' && (
                  <div className="stack stack--sm">
                    <input className="input pj-select-sm" placeholder="Link title…" value={attachTitle} onChange={(e) => setAttachTitle(e.target.value)} />
                    <div className="row" style={{ gap: 6 }}>
                      <input className="input pj-select-sm grow" placeholder="https://…" value={attachTarget} onChange={(e) => setAttachTarget(e.target.value)} />
                      <button type="button" className="btn btn--sm btn--primary pj-btn-violet" disabled={!attachTitle.trim() || !attachTarget.trim()} onClick={submitAttachment}>
                        Attach
                      </button>
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAttachMode(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Time Tracking */}
          <div className="pj-drawer__sec">
            <div className="pj-sec-title">
              <h3>
                <Clock /> Time Log
              </h3>
              <span className="mono text-xs muted">
                <b>{task.loggedHours}h</b> logged {task.estimateHours ? `of ${task.estimateHours}h est.` : ''}
              </span>
            </div>
            {canEdit && (
              <div className="row" style={{ gap: 8 }}>
                <input
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  className="input pj-select-sm"
                  style={{ width: 90 }}
                  value={hoursInput}
                  onChange={(e) => setHoursInput(e.target.value)}
                  aria-label="Hours to log"
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => report(api().logTime(task.id, Number(hoursInput)))}
                >
                  <Check /> Log hours
                </button>
                {task.estimateHours && (
                  <span className="text-xs muted">
                    {Math.max(0, task.estimateHours - task.loggedHours)}h remaining
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Comments & Activity */}
          <div className="pj-drawer__sec">
            <div className="pj-sec-title">
              <h3>
                <MessageSquare /> Discussion & Activity <span className="pj-sec-title__count">{task.comments.length}</span>
              </h3>
            </div>

            {task.comments.length > 0 && (
              <ul className="pj-comments">
                {task.comments.map((c) => {
                  const author = users.get(c.authorId);
                  return (
                    <li key={c.id} className="pj-comment">
                      {author && <Avatar user={author} size={28} />}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <b className="text-xs">{author?.name ?? 'Teammate'}</b>
                          <time className="text-xs faint">{relativeTime(c.at)}</time>
                        </div>
                        <p className="pj-comment__body">{c.body}</p>
                        <div className="row row--wrap" style={{ gap: 4, marginTop: 4 }}>
                          {EMOJIS.map((em) => {
                            const who = c.reactions[em] ?? [];
                            const active = me ? who.includes(me.id) : false;
                            return (
                              <button
                                key={em}
                                type="button"
                                className={cx('pj-react-btn', active && 'is-active')}
                                onClick={() => report(api().toggleReaction(task.id, c.id, em))}
                              >
                                {em} {who.length > 0 && <span>{who.length}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {canComment && (
              <form
                className="pj-comment-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitComment();
                }}
              >
                <textarea
                  className="textarea"
                  rows={2}
                  placeholder="Ask a question, share an update or @mention a teammate…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                />
                <div className="row row--between" style={{ marginTop: 6 }}>
                  <span className="text-xs faint">Tip: mention teammates by @FirstName</span>
                  <button type="submit" className="btn btn--sm btn--primary pj-btn-violet" disabled={!commentBody.trim()}>
                    <Send /> Comment
                  </button>
                </div>
              </form>
            )}

            <details className="pj-activity-details">
              <summary className="text-xs muted">Activity log ({task.activity.length} events)</summary>
              <ul className="pj-activity-list">
                {task.activity
                  .slice()
                  .reverse()
                  .map((a) => (
                    <li key={a.id} className="text-xs muted">
                      <b>{a.actorId === 'system' ? 'Automation' : (users.get(a.actorId)?.name ?? 'Someone')}</b> {a.action.replace(/_/g, ' ')}
                      {a.detail ? ` (${a.detail})` : ''} · <span className="faint">{relativeTime(a.at)}</span>
                    </li>
                  ))}
              </ul>
            </details>
          </div>
        </div>
      </Sheet>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${project.key}-${task.number}?`}
        confirmLabel="Delete task"
        danger
        onConfirm={() => {
          if (report(api().deleteTask(task.id))) onClose();
        }}
      >
        Deleting “{task.title}” permanently removes its subtasks and comments.
      </ConfirmModal>
    </>
  );
}

function AttachmentRow({ att, canEdit, onRemove }: { att: TaskAttachment; canEdit: boolean; onRemove: () => void }) {
  const targetId = att.driveFileId ?? att.wikiSlug ?? '';
  const href =
    att.kind === 'drive'
      ? `/drive?item=${targetId}`
      : att.kind === 'wiki'
        ? `/wiki/doc/${targetId}`
        : (att.url ?? '#');

  return (
    <li className="pj-attach-item">
      {att.kind === 'drive' ? <FolderOpen /> : att.kind === 'wiki' ? <BookOpen /> : <Link2 />}
      {att.kind === 'link' ? (
        <a href={href} target="_blank" rel="noreferrer" className="grow truncate pj-attach-link">
          {att.title} <ExternalLink style={{ width: 12, height: 12 }} />
        </a>
      ) : (
        <Link to={href} className="grow truncate pj-attach-link" data-target-path={att.kind === 'drive' ? `/drive/file/${targetId}` : `/wiki/article/${targetId}`}>
          {att.title}
          <small className="muted"> · {att.kind === 'drive' ? 'Helix Drive' : 'Knowledge Base'}</small>
        </Link>
      )}
      {canEdit && (
        <button type="button" className="icon-btn icon-btn--sm" onClick={onRemove} aria-label={`Remove ${att.title}`}>
          <X />
        </button>
      )}
    </li>
  );
}
