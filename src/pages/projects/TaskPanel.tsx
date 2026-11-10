/**
 * Task panel — floating inspector (desktop) / bottom sheet (phones).
 * Opened by `?task=<id>` on any Projects route.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowRight,
  Award,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  CopyPlus,
  Diamond,
  ExternalLink,
  FileText,
  Flag,
  GripVertical,
  Hourglass,
  Link2,
  ListChecks,
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { Avatars, NeoEmpty, NeoMenu, NeoPopover, NeoSearch, NovaChip, PeoplePicker, Typing, useTypewriter, type MenuEntry } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { currentViewer, loadBridge, type BridgeFile } from '@/lib/appBridge';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { formatDateTime, relativeTime } from '@/lib/format';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import {
  actorFrom,
  canCommentTask,
  canCompleteTask,
  canDecideApproval,
  canDeleteTask,
  canEditTask,
  canSeeTask,
  canViewProject,
  readOnlyReason,
} from '@/projects/access';
import { formatClock, formatDue } from '@/projects/dates';
import { openBlockers, wouldCreateCycle } from '@/projects/graph';
import { taskKey } from '@/projects/metrics';
import { PRIORITY_NAME, activeTrigger, applyTrigger } from '@/projects/nlp';
import { taskLink, useProjects } from '@/projects/store';
import type { Attachment, Project, Task } from '@/projects/types';
import { pushUndo, useActor, useProjectMap, useProjectsUI, useUsersMap } from './ctx';
import { DatePicker, DueChip, MarkdownLite, PriorityGlyph, PriorityMenu, ProjectGlyph, TaskCheck, UserAvatar } from './ui';

const REACTIONS = ['👍', '🎉', '❤️', '👀', '🚀', '✅'];
const TIMES = ['09:00', '10:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export function TaskPanelHost() {
  const ui = useProjectsUI();
  const mobile = useIsMobile();
  const actor = useActor();
  const task = useProjects((s) => (ui.taskId ? s.tasks.find((t) => t.id === ui.taskId) : undefined));
  const project = useProjects((s) => (task?.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined));
  if (!ui.taskId || !actor) return null;
  const visible = task && canSeeTask(task, project, actor);
  const content = visible ? (
    <TaskPanel key={task.id} task={task} project={project} onClose={ui.closeTask} />
  ) : (
    <div className="pj-panel__missing">
      <NeoEmpty
        icon={<Lock />}
        title="Task unavailable"
        action={
          <button type="button" className="neo-btn neo-btn--soft" onClick={ui.closeTask}>
            Close
          </button>
        }
      >
        It may have been deleted, or it lives in a project you can’t access.
      </NeoEmpty>
    </div>
  );
  if (mobile)
    return (
      <Sheet open onClose={ui.closeTask} className="neo-portal pj-sheet" label="Task details" header={<span className="pj-sheet__spacer" />}>
        {content}
      </Sheet>
    );
  return (
    <aside className="neo-plane pj-panel" aria-label="Task details" data-qa="task-panel">
      {content}
    </aside>
  );
}

/* ───────────────────────── panel ───────────────────────── */

function TaskPanel({ task, project, onClose }: { task: Task; project: Project | undefined; onClose: () => void }) {
  const actor = useActor()!;
  const users = useUsersMap();
  const navigate = useNavigate();
  const ui = useProjectsUI();
  const store = useProjects();
  const allTasks = store.tasks;
  const projects = useProjectMap();
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const key = taskKey(project, task);
  const canEdit = canEditTask(task, project, actor);
  const canDone = canCompleteTask(task, project, actor);
  const canComment = canCommentTask(task, project, actor);
  const canDecide = canDecideApproval(task, project, actor);
  const owner = project ? users.get(project.ownerId) : undefined;
  const ro = project && !canEdit ? readOnlyReason(project, actor, owner?.name) : null;
  const blockers = openBlockers(task, byId);
  const blocking = allTasks.filter((t) => t.blockedBy.includes(task.id));
  const section = project?.sections.find((s) => s.id === task.sectionId);
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const [posted, setPosted] = useState<{ label: string; to: string } | null>(null);
  const [rejecting, setRejecting] = useState<'changes' | 'rejected' | null>(null);
  const [note, setNote] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const res = (r: { ok: boolean; error?: string } | { ok: false; error: string } | { ok: true }) => {
    if (!r.ok && 'error' in r && r.error) toast.error(r.error);
    return r.ok;
  };

  const toggleDone = (e: { clientX: number; clientY: number }) => {
    const was = !!task.completedAt;
    const r = store.completeTask(task.id, !was);
    if (!r.ok) return toast.error(r.error);
    if (!was) {
      if (r.milestone) burstConfetti({ x: e.clientX, y: e.clientY });
      pushUndo(`Completed ${key}`, () => store.completeTask(task.id, false));
    }
  };

  const discuss = async () => {
    const viewer = currentViewer();
    if (!viewer) return;
    const card = { app: 'projects' as const, title: `${key} · ${task.title}`, subtitle: project?.name ?? 'My tasks', to: taskLink(task), status: task.completedAt ? 'Done' : task.dueDate ? `Due ${formatDue(task.dueDate)}` : 'Open' };
    try {
      const chat = await loadBridge('chat');
      if (project?.channelId) {
        const r = chat.postToChannel(viewer, { channelId: project.channelId, text: `Let’s discuss ${key}: ${task.title}`, card });
        if (!r.ok) return toast.error('Pulse Chat couldn’t post', r.error);
        setPosted({ label: `Posted to #${project.channelId.replace(/^ch-/, '')}`, to: r.to });
      } else if (task.assigneeId && task.assigneeId !== viewer.user.id) {
        const r = chat.sendDirect(viewer, { toUserId: task.assigneeId, text: `Can we talk about ${key}?`, card });
        if (!r.ok) return toast.error('Pulse Chat couldn’t send', r.error);
        setPosted({ label: `Sent to ${users.get(task.assigneeId)?.name.split(' ')[0]}`, to: r.to });
      } else {
        toast.info('Nobody to discuss with yet', 'Link a Pulse channel to the project or assign the task first.');
        return;
      }
      window.setTimeout(() => setPosted(null), 8000);
    } catch {
      toast.error('Pulse Chat is unavailable', 'It may be updating — try again in a moment.');
    }
  };

  const highlight = async () => {
    const viewer = currentViewer();
    if (!viewer) return;
    try {
      const perf = await loadBridge('performance');
      const r = perf.addEvidence(viewer, {
        userId: viewer.user.id,
        title: task.title,
        detail: `${key} · ${project?.name ?? 'Personal task'}${task.completedAt ? ` · completed ${formatDateTime(task.completedAt)}` : ''}`,
        source: { app: 'projects', label: `Projects · ${key}`, to: taskLink(task) },
        keyResultId: project?.keyResultIds[0],
      });
      if (r.ok) toast.success('Added to your highlights', 'It’s on your Performance timeline.');
      else toast.error('Couldn’t add highlight', r.error);
    } catch {
      toast.error('Performance & OKRs is unavailable', 'Try again in a moment.');
    }
  };

  const copyLink = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}${taskLink(task)}`);
    toast.success('Link copied', key);
  };

  const remove = () => {
    const r = store.deleteTasks([task.id]);
    if (!r.ok) return toast.error(r.error);
    onClose();
    const snap = r.snapshot;
    pushUndo(`Deleted ${key}`, () => store.restoreTasks(snap));
  };

  const more: MenuEntry[] = [
    { label: 'Copy link', icon: <Link2 />, onSelect: copyLink },
    { label: 'Discuss in Pulse', icon: <MessagesSquare />, onSelect: () => void discuss() },
    { label: 'Add to my highlights', icon: <Award />, onSelect: () => void highlight() },
    { kind: 'sep' },
    {
      label: 'Duplicate',
      icon: <CopyPlus />,
      disabled: !canEdit,
      onSelect: () => {
        const r = store.duplicateTask(task.id);
        if (r.ok) {
          toast.success('Task duplicated');
          ui.openTask(r.taskId);
        } else toast.error(r.error);
      },
    },
    {
      label: task.kind === 'milestone' ? 'Convert to task' : 'Convert to milestone',
      icon: <Diamond />,
      disabled: !canEdit || task.kind === 'approval',
      onSelect: () => res(store.convertKind(task.id, task.kind === 'milestone' ? 'task' : 'milestone')),
    },
    ...(task.kind !== 'approval' ? [{ label: 'Convert to approval', icon: <ShieldCheck />, disabled: !canEdit, onSelect: () => res(store.convertKind(task.id, 'approval')) }] : []),
    { kind: 'sep' },
    { label: 'Delete task', icon: <Trash2 />, danger: true, disabled: !canDeleteTask(task, project, actor), onSelect: remove },
  ];

  const following = task.followers.includes(actor.id);
  const approval = task.approval;

  return (
    <div className="pj-tp">
      <header className="pj-tp__bar">
        <button type="button" className="pj-tp__crumb" onClick={() => project && navigate(`/projects/p/${project.id}`)} disabled={!project}>
          <ProjectGlyph project={project} size={20} />
          <span className="neo-mono">{key}</span>
          {project && <span className="neo-faint truncate">{project.name}</span>}
        </button>
        <span className="grow" />
        <button type="button" className="neo-iconbtn" aria-label="Copy link" data-tip="Copy link" data-tip-pos="bottom" onClick={copyLink}>
          <Copy />
        </button>
        <button type="button" className="neo-iconbtn" aria-label="Discuss in Pulse" data-tip="Discuss in Pulse" data-tip-pos="bottom" onClick={() => void discuss()} data-qa="discuss">
          <MessagesSquare />
        </button>
        <NeoMenu
          items={more}
          width={240}
          trigger={(p) => (
            <button {...p} type="button" className="neo-iconbtn" aria-label="More task actions">
              <MoreHorizontal />
            </button>
          )}
        />
        <button type="button" className="neo-iconbtn" aria-label="Close task" data-tip="Close  Esc" data-tip-pos="bottom" onClick={onClose} data-qa="close-task">
          <X />
        </button>
      </header>

      <div className="pj-tp__body" ref={bodyRef}>
        {posted && (
          <div className="pj-tp__posted" role="status">
            <Check /> {posted.label}
            <button type="button" className="pj-linkish" onClick={() => navigate(posted.to)}>
              Open <ArrowRight />
            </button>
          </div>
        )}
        {ro && (
          <div className="pj-tp__ro">
            <Lock /> {ro}
          </div>
        )}

        <div className="pj-tp__top">
          {task.kind === 'approval' && approval ? (
            <ApprovalBar task={task} canDecide={canDecide} onDecide={(d) => (d === 'approved' ? res(store.decideApproval(task.id, 'approved')) && burstConfetti() : (setNote(''), setRejecting(d)))} />
          ) : (
            <button
              type="button"
              className={cx('pj-tp__done', task.completedAt && 'is-done')}
              disabled={!canDone}
              onClick={(e) => toggleDone(e)}
              data-qa="toggle-complete"
              title={canDone ? undefined : 'You can’t complete this task'}
            >
              <TaskCheck done={!!task.completedAt} onToggle={toggleDone} disabled={!canDone} size={18} kind={task.kind} />
              {task.completedAt ? (task.kind === 'milestone' ? 'Milestone reached' : 'Completed') : task.kind === 'milestone' ? 'Mark milestone reached' : 'Mark complete'}
            </button>
          )}
          {task.completedAt && <span className="neo-faint text-xs">{relativeTime(task.completedAt)} by {users.get(task.completedBy ?? '')?.name.split(' ')[0] ?? 'someone'}</span>}
        </div>

        <TitleEditor task={task} disabled={!canEdit} />

        {blockers.length > 0 && (
          <div className="pj-tp__blocked">
            <Lock />
            <span>
              Waiting on{' '}
              {blockers.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ', '}
                  <button type="button" className="pj-linkish" onClick={() => ui.openTask(b.id)}>
                    <span className="neo-mono">{taskKey(b.projectId ? projects.get(b.projectId) : undefined, b)}</span> {b.title}
                  </button>
                </span>
              ))}
            </span>
          </div>
        )}

        <dl className="pj-props">
          <dt>
            <UserRound /> Assignee
          </dt>
          <dd>
            <PeoplePicker
              value={task.assigneeId ? [task.assigneeId] : []}
              onChange={(ids) => res(store.updateTask(task.id, { assigneeId: ids[0] ?? null }))}
              allowNone
              label="Assignee"
              trigger={(p) => (
                <button {...p} type="button" className="pj-prop" disabled={!canEdit || !project}>
                  <UserAvatar id={task.assigneeId} size={22} />
                  <span className="truncate">{task.assigneeId ? (users.get(task.assigneeId)?.name ?? 'Someone') : 'Unassigned'}</span>
                </button>
              )}
            />
          </dd>
          <dt>
            <CalendarDays /> Due
          </dt>
          <dd className="pj-props__row">
            <DatePicker
              value={task.dueDate}
              onChange={(v) => res(store.updateTask(task.id, { dueDate: v }))}
              trigger={(p) => (
                <button {...p} type="button" className="pj-prop" disabled={!canEdit}>
                  {task.dueDate ? <DueChip due={task.dueDate} done={!!task.completedAt} /> : <span className="neo-faint">No due date</span>}
                </button>
              )}
            />
            {task.dueDate && (
              <NeoMenu
                label="Due time"
                width={180}
                items={[
                  { label: 'No time', checked: !task.dueTime, onSelect: () => res(store.updateTask(task.id, { dueTime: undefined })) },
                  ...TIMES.map((tm) => ({ label: formatClock(tm), checked: task.dueTime === tm, onSelect: () => res(store.updateTask(task.id, { dueTime: tm })) })),
                ]}
                trigger={(p) => (
                  <button {...p} type="button" className="pj-prop pj-prop--sm" disabled={!canEdit}>
                    <Clock3 /> {task.dueTime ? formatClock(task.dueTime) : 'Time'}
                  </button>
                )}
              />
            )}
          </dd>
          <dt>
            <Hourglass /> Start
          </dt>
          <dd>
            <DatePicker
              value={task.startDate}
              onChange={(v) => res(store.updateTask(task.id, { startDate: v }))}
              trigger={(p) => (
                <button {...p} type="button" className="pj-prop" disabled={!canEdit}>
                  {task.startDate ? formatDue(task.startDate) : <span className="neo-faint">No start date</span>}
                </button>
              )}
            />
          </dd>
          <dt>
            <Flag /> Priority
          </dt>
          <dd>
            <PriorityMenu
              value={task.priority}
              onChange={(pr) => res(store.updateTask(task.id, { priority: pr }))}
              disabled={!canEdit}
              trigger={(p) => (
                <button {...p} type="button" className="pj-prop" disabled={!canEdit}>
                  <PriorityGlyph priority={task.priority} /> {PRIORITY_NAME[task.priority]}
                </button>
              )}
            />
          </dd>
          {project && (
            <>
              <dt>
                <ListChecks /> Section
              </dt>
              <dd>
                <NeoMenu
                  label="Move to section"
                  width={220}
                  items={project.sections.map((s) => ({ label: s.name, checked: s.id === task.sectionId, onSelect: () => res(store.moveTask(task.id, { sectionId: s.id })) }))}
                  trigger={(p) => (
                    <button {...p} type="button" className="pj-prop" disabled={!canEdit}>
                      {section?.name ?? '—'} <ChevronDown className="pj-prop__chev" />
                    </button>
                  )}
                />
              </dd>
            </>
          )}
          <dt>
            <Clock3 /> Estimate
          </dt>
          <dd>
            <EstimateInput task={task} disabled={!canEdit} />
          </dd>
          <dt>
            <Tag /> Tags
          </dt>
          <dd>
            <TagEditor task={task} disabled={!canEdit} />
          </dd>
        </dl>

        <DescriptionEditor task={task} project={project} disabled={!canEdit} />
        <Subtasks task={task} canEdit={canEdit} canTick={canDone} project={project} />
        <Dependencies task={task} project={project} blocking={blocking} canEdit={canEdit} />
        <Attachments task={task} canAdd={canComment} canEdit={canEdit} />

        <section className="pj-tp__sec" aria-label="Discussion">
          <div className="pj-tp__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'comments'} className={cx('pj-tp__tab', tab === 'comments' && 'is-on')} onClick={() => setTab('comments')}>
              Comments <span className="neo-count">{task.comments.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'activity'} className={cx('pj-tp__tab', tab === 'activity' && 'is-on')} onClick={() => setTab('activity')}>
              Activity
            </button>
            <span className="grow" />
            <Avatars users={task.followers.map((id) => users.get(id)).filter((u): u is NonNullable<typeof u> => !!u)} max={4} size={22} />
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() => {
                const r = store.toggleFollow(task.id);
                if (r.ok) toast.info(r.following ? 'Following' : 'Unfollowed', r.following ? 'You’ll get updates in your Inbox.' : undefined);
              }}
            >
              {following ? <BellOff /> : <Bell />} {following ? 'Unfollow' : 'Follow'}
            </button>
          </div>
          {tab === 'comments' ? <Comments task={task} project={project} canComment={canComment} /> : <ActivityLog task={task} />}
        </section>
      </div>
      {canComment && tab === 'comments' && <Composer task={task} project={project} />}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={rejecting === 'rejected' ? 'Reject approval' : 'Request changes'}
        subtitle={task.title}
        width={460}
        className="neo-portal pj-modal"
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={cx('neo-btn', rejecting === 'rejected' ? 'neo-btn--danger' : 'neo-btn--plasma')}
              disabled={!note.trim()}
              onClick={() => {
                if (!rejecting) return;
                if (res(store.decideApproval(task.id, rejecting, note))) {
                  toast.success(rejecting === 'rejected' ? 'Approval rejected' : 'Change request sent');
                  setRejecting(null);
                }
              }}
            >
              {rejecting === 'rejected' ? 'Reject' : 'Send request'}
            </button>
          </>
        }
      >
        <label className="neo-field">
          <span className="neo-label">{rejecting === 'rejected' ? 'Why are you rejecting this?' : 'What needs to change?'}</span>
          <textarea className="neo-textarea" value={note} onChange={(e) => setNote(e.target.value)} data-autofocus />
        </label>
      </Modal>
    </div>
  );
}

/* ───────────────────────── approval ───────────────────────── */

function ApprovalBar({ task, canDecide, onDecide }: { task: Task; canDecide: boolean; onDecide: (d: 'approved' | 'changes' | 'rejected') => void }) {
  const users = useUsersMap();
  const a = task.approval!;
  const approver = users.get(a.approverId);
  if (a.state !== 'pending')
    return (
      <div className="pj-approvalbar" data-state={a.state}>
        {a.state === 'approved' ? <ShieldCheck /> : a.state === 'changes' ? <Undo2 /> : <XCircle />}
        <span>
          <strong>{a.state === 'approved' ? 'Approved' : a.state === 'changes' ? 'Changes requested' : 'Rejected'}</strong> by {approver?.name.split(' ')[0] ?? 'approver'}
          {a.decidedAt ? ` · ${relativeTime(a.decidedAt)}` : ''}
          {a.note && <em className="pj-approvalbar__note">“{a.note}”</em>}
        </span>
      </div>
    );
  if (!canDecide)
    return (
      <div className="pj-approvalbar" data-state="pending">
        <ShieldCheck />
        <span>
          Waiting on <strong>{approver?.name ?? 'the approver'}</strong>
        </span>
      </div>
    );
  return (
    <div className="pj-approvalbar pj-approvalbar--act" data-state="pending">
      <span className="neo-hud neo-hud--tint">Your approval</span>
      <div className="pj-approvalbar__btns">
        <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => onDecide('approved')} data-qa="approve-task">
          <Check /> Approve
        </button>
        <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => onDecide('changes')}>
          <Undo2 /> Request changes
        </button>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => onDecide('rejected')}>
          <XCircle /> Reject
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── title / estimate / tags ───────────────────────── */

function TitleEditor({ task, disabled }: { task: Task; disabled: boolean }) {
  const update = useProjects((s) => s.updateTask);
  const [v, setV] = useState(task.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(task.title), [task.title]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  const commit = () => {
    const t = v.trim();
    if (!t) return setV(task.title);
    if (t !== task.title) {
      const r = update(task.id, { title: t });
      if (!r.ok) {
        toast.error(r.error);
        setV(task.title);
      }
    }
  };
  return (
    <textarea
      ref={ref}
      className={cx('pj-tp__title', task.completedAt && 'is-done')}
      value={v}
      rows={1}
      readOnly={disabled}
      aria-label="Task title"
      onChange={(e) => setV(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape') setV(task.title);
      }}
    />
  );
}

function EstimateInput({ task, disabled }: { task: Task; disabled: boolean }) {
  const update = useProjects((s) => s.updateTask);
  const [v, setV] = useState(task.estimate ? String(task.estimate) : '');
  useEffect(() => setV(task.estimate ? String(task.estimate) : ''), [task.estimate]);
  return (
    <label className="pj-est">
      <input
        className="neo-input neo-input--sm"
        inputMode="decimal"
        value={v}
        placeholder="—"
        disabled={disabled}
        aria-label="Estimate in hours"
        onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={() => {
          const n = v ? Number(v) : undefined;
          if (n === task.estimate) return;
          const r = update(task.id, { estimate: n });
          if (!r.ok) toast.error(r.error);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="neo-faint">hours</span>
    </label>
  );
}

function TagEditor({ task, disabled }: { task: Task; disabled: boolean }) {
  const update = useProjects((s) => s.updateTask);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim();
    setV('');
    setAdding(false);
    if (t) update(task.id, { tags: [...task.tags, t] });
  };
  return (
    <div className="pj-tags">
      {task.tags.map((t) => (
        <span key={t} className="pj-tag pj-tag--lg">
          {t}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => update(task.id, { tags: task.tags.filter((x) => x !== t) })}>
              <X />
            </button>
          )}
        </span>
      ))}
      {!disabled &&
        (adding ? (
          <input
            className="neo-input neo-input--sm pj-tags__input"
            autoFocus
            value={v}
            placeholder="tag"
            aria-label="New tag"
            onChange={(e) => setV(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') {
                setV('');
                setAdding(false);
              }
            }}
          />
        ) : (
          <button type="button" className="pj-tag pj-tag--add" onClick={() => setAdding(true)}>
            <Plus /> Add
          </button>
        ))}
      {disabled && task.tags.length === 0 && <span className="neo-faint">—</span>}
    </div>
  );
}

/* ───────────────────────── description + Nova breakdown ───────────────────────── */

const BREAKDOWNS: [RegExp, string[]][] = [
  [/\b(review|approve|sign[- ]?off)\b/i, ['Read through and leave comments', 'Check against the acceptance criteria', 'Decide: approve or request changes']],
  [/\b(migrat|swap|replace|port)\w*/i, ['Inventory current usages', 'Swap to the new implementation', 'Visual regression pass', 'Remove the legacy path']],
  [/\b(audit|assess|inventory)\w*/i, ['Define the checklist', 'Run the audit', 'Log findings with owners', 'Share a one-page summary']],
  [/\b(upgrade|update|patch)\w*/i, ['Read the release notes', 'Upgrade staging and run smoke tests', 'Schedule the production window', 'Upgrade production and monitor for 24h']],
  [/\b(launch|ship|release|rollout|roll out|wave)\w*/i, ['Go / no-go checklist', 'Announce internally', 'Ship it', 'Watch metrics for 24 hours']],
  [/\b(plan|draft|write|spec|brief|guide|policy|rfc)\w*/i, ['Outline the key points', 'Write the first draft', 'Collect feedback', 'Finalize and share']],
  [/\b(hire|interview|onboard)\w*/i, ['Prepare the scorecard', 'Schedule the loop', 'Debrief and decide']],
];

function novaSteps(task: Task, ownerFirst: string): string[] {
  const hit = BREAKDOWNS.find(([re]) => re.test(task.title));
  const base = hit ? hit[1] : ['Clarify the outcome and done criteria', 'Do the core work', `Review with ${ownerFirst}`, 'Close the loop with stakeholders'];
  const existing = new Set(task.subtasks.map((s) => s.title.toLowerCase()));
  return base.filter((s) => !existing.has(s.toLowerCase()));
}

function DescriptionEditor({ task, project, disabled }: { task: Task; project: Project | undefined; disabled: boolean }) {
  const update = useProjects((s) => s.updateTask);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(task.description);
  useEffect(() => setV(task.description), [task.description]);
  void project;
  return (
    <section className="pj-tp__sec" aria-label="Description">
      <div className="pj-tp__sechead">
        <FileText /> <span>Description</span>
        <span className="grow" />
        {!disabled && !editing && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            className="neo-textarea pj-tp__desc-input"
            value={v}
            autoFocus
            onChange={(e) => setV(e.target.value)}
            placeholder="Context, links, acceptance criteria… **bold**, `code`, - bullets"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                update(task.id, { description: v });
                setEditing(false);
              }
            }}
          />
          <div className="pj-tp__edit-acts">
            <span className="neo-faint text-xs">Markdown-lite · ⌘↵ to save</span>
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() => {
                setV(task.description);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--xs"
              onClick={() => {
                const r = update(task.id, { description: v });
                if (!r.ok) toast.error(r.error);
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </>
      ) : task.description ? (
        <MarkdownLite text={task.description} />
      ) : (
        <button type="button" className="pj-tp__placeholder" onClick={() => !disabled && setEditing(true)} disabled={disabled}>
          {disabled ? 'No description.' : 'Add context, links or acceptance criteria…'}
        </button>
      )}
    </section>
  );
}

/* ───────────────────────── subtasks ───────────────────────── */

function SortableSubtask({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('pj-sub', isDragging && 'is-dragging')}>
      {children(
        <span className="pj-sub__grip" {...attributes} {...listeners} aria-label="Drag to reorder">
          <GripVertical />
        </span>,
      )}
    </li>
  );
}

function Subtasks({ task, canEdit, canTick, project }: { task: Task; canEdit: boolean; canTick: boolean; project: Project | undefined }) {
  const store = useProjects();
  const users = useUsersMap();
  const [v, setV] = useState('');
  const [nova, setNova] = useState<{ thinking: boolean; steps: string[] } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = task.subtasks.filter((s) => s.done).length;
  const ownerFirst = users.get(project?.ownerId ?? task.creatorId)?.name.split(' ')[0] ?? 'the owner';
  const text = nova && !nova.thinking ? (nova.steps.length ? `I’d break this into ${nova.steps.length} steps:` : 'This already looks well broken down.') : '';
  const [typed] = useTypewriter(text, 120);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const to = task.subtasks.findIndex((s) => s.id === e.over!.id);
    store.moveSubtask(task.id, String(e.active.id), to);
  };
  const add = () => {
    if (!v.trim()) return;
    const r = store.addSubtask(task.id, v);
    if (r.ok) setV('');
    else toast.error(r.error);
  };
  const breakDown = () => {
    setNova({ thinking: true, steps: [] });
    window.setTimeout(() => setNova({ thinking: false, steps: novaSteps(task, ownerFirst) }), 700);
  };

  return (
    <section className="pj-tp__sec" aria-label="Subtasks">
      <div className="pj-tp__sechead">
        <ListChecks /> <span>Subtasks</span>
        {task.subtasks.length > 0 && (
          <span className="neo-faint text-xs">
            {done}/{task.subtasks.length}
          </span>
        )}
        <span className="grow" />
        {canEdit && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs pj-nova-btn" onClick={breakDown} data-qa="nova-breakdown">
            <Sparkles /> Break down
          </button>
        )}
      </div>
      {task.subtasks.length > 0 && <div className="pj-sub__bar" style={{ ['--p' as string]: `${(done / task.subtasks.length) * 100}%` }} />}
      {nova && (
        <div className="pj-tp__nova neo-nova">
          <span className="neo-nova__glow" />
          <NovaChip />
          {nova.thinking ? (
            <span className="text-sm">
              Thinking <Typing />
            </span>
          ) : (
            <div className="grow">
              <p className="text-sm">{typed}</p>
              {nova.steps.length > 0 && (
                <ol className="pj-tp__nova-steps">
                  {nova.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              <div className="pj-tp__edit-acts">
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setNova(null)}>
                  Dismiss
                </button>
                {nova.steps.length > 0 && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => {
                      nova.steps.forEach((s) => store.addSubtask(task.id, s));
                      toast.success(`Added ${nova.steps.length} subtasks`);
                      setNova(null);
                    }}
                  >
                    <Plus /> Add all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={task.subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="pj-subs">
            {task.subtasks.map((s) => (
              <SortableSubtask key={s.id} id={s.id}>
                {(handle) => (
                  <>
                    {canEdit && handle}
                    <TaskCheck done={s.done} size={16} disabled={!canTick} onToggle={() => store.updateSubtask(task.id, s.id, { done: !s.done })} label={`${s.done ? 'Reopen' : 'Complete'} ${s.title}`} />
                    <input
                      className={cx('pj-sub__title', s.done && 'is-done')}
                      defaultValue={s.title}
                      readOnly={!canEdit}
                      aria-label="Subtask title"
                      onBlur={(e) => e.target.value !== s.title && store.updateSubtask(task.id, s.id, { title: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    {canEdit && (
                      <button type="button" className="neo-iconbtn neo-iconbtn--sm pj-sub__del" aria-label={`Delete ${s.title}`} onClick={() => store.removeSubtask(task.id, s.id)}>
                        <X />
                      </button>
                    )}
                  </>
                )}
              </SortableSubtask>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {canEdit && (
        <div className="pj-sub__add">
          <Plus />
          <input className="pj-sub__addinput" value={v} placeholder="Add a subtask" aria-label="Add a subtask" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── dependencies ───────────────────────── */

function Dependencies({ task, project, blocking, canEdit }: { task: Task; project: Project | undefined; blocking: Task[]; canEdit: boolean }) {
  const store = useProjects();
  const ui = useProjectsUI();
  const projects = useProjectMap();
  const [picker, setPicker] = useState<'blockedBy' | 'blocking' | null>(null);
  const [q, setQ] = useState('');
  const anchor = useRef<HTMLButtonElement>(null);
  const anchor2 = useRef<HTMLButtonElement>(null);
  const blockedBy = task.blockedBy.map((id) => store.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
  if (!project && !blockedBy.length && !blocking.length) return null;

  const candidates = store.tasks
    .filter((t) => t.projectId === task.projectId && t.id !== task.id && t.projectId)
    .filter((t) => (picker === 'blockedBy' ? !task.blockedBy.includes(t.id) : !t.blockedBy.includes(task.id)))
    .filter((t) => !q || `${taskKey(project, t)} ${t.title}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 30);

  const pick = (t: Task) => {
    const r = picker === 'blockedBy' ? store.addDependency(task.id, t.id) : store.addDependency(t.id, task.id);
    if (!r.ok) toast.error('Can’t add dependency', r.error);
    else setPicker(null);
  };

  const chip = (t: Task, onRemove?: () => void) => {
    const p = t.projectId ? projects.get(t.projectId) : undefined;
    return (
      <li key={t.id} className={cx('pj-dep', t.completedAt && 'is-done')}>
        <button type="button" className="pj-dep__main" onClick={() => ui.openTask(t.id)}>
          <span className={cx('pj-dep__dot', t.completedAt ? 'is-done' : 'is-open')} />
          <span className="neo-mono neo-faint">{taskKey(p, t)}</span>
          <span className="truncate">{t.title}</span>
        </button>
        <DueChip due={t.dueDate} done={!!t.completedAt} />
        {onRemove && canEdit && (
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove dependency ${t.title}`} onClick={onRemove}>
            <X />
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="pj-tp__sec" aria-label="Dependencies">
      <div className="pj-tp__sechead">
        <Lock /> <span>Dependencies</span>
      </div>
      <div className="pj-deps">
        <div className="pj-deps__col">
          <div className="pj-deps__label">
            <span className="neo-hud">Blocked by</span>
            {canEdit && (
              <button
                ref={anchor}
                type="button"
                className="neo-iconbtn neo-iconbtn--sm"
                aria-label="Add blocker"
                onClick={() => {
                  setQ('');
                  setPicker('blockedBy');
                }}
              >
                <Plus />
              </button>
            )}
          </div>
          <ul>{blockedBy.length ? blockedBy.map((t) => chip(t, () => store.removeDependency(task.id, t.id))) : <li className="neo-faint text-xs">Nothing</li>}</ul>
        </div>
        <div className="pj-deps__col">
          <div className="pj-deps__label">
            <span className="neo-hud">Blocking</span>
            {canEdit && (
              <button
                ref={anchor2}
                type="button"
                className="neo-iconbtn neo-iconbtn--sm"
                aria-label="Add a task this blocks"
                onClick={() => {
                  setQ('');
                  setPicker('blocking');
                }}
              >
                <Plus />
              </button>
            )}
          </div>
          <ul>{blocking.length ? blocking.map((t) => chip(t, () => store.removeDependency(t.id, task.id))) : <li className="neo-faint text-xs">Nothing</li>}</ul>
        </div>
      </div>
      <NeoPopover open={!!picker} anchor={picker === 'blocking' ? anchor2.current : anchor.current} onClose={() => setPicker(null)} placement="bottom-end" width={320} label="Pick a task">
        <div className="neo-pop__search">
          <NeoSearch value={q} onChange={setQ} size="sm" placeholder="Search tasks…" autoFocus />
        </div>
        <div role="listbox" aria-label="Tasks">
          {candidates.map((t) => {
            const loop = picker === 'blockedBy' ? wouldCreateCycle(store.tasks, task.id, t.id) : wouldCreateCycle(store.tasks, t.id, task.id);
            return (
              <button key={t.id} type="button" role="option" aria-selected={false} className="neo-menu__item" disabled={loop} title={loop ? 'Would create a loop' : undefined} onClick={() => pick(t)}>
                <span className="neo-mono neo-faint">{taskKey(project, t)}</span>
                <span className="grow truncate">{t.title}</span>
                {loop && <span className="neo-faint text-xs">loop</span>}
              </button>
            );
          })}
          {candidates.length === 0 && <div className="neo-menu__label">No matching tasks</div>}
        </div>
      </NeoPopover>
    </section>
  );
}

/* ───────────────────────── attachments ───────────────────────── */

const FILE_TONE: Record<string, string> = { doc: '#60a5fa', sheet: '#34d399', slides: '#fbbf24', pdf: '#fb7185', image: '#f472b6', video: '#a78bfa', code: '#22d3ee', link: '#94a3b8' };

export function AttachmentRow({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const navigate = useNavigate();
  const users = useUsersMap();
  const open = () => {
    if (a.kind === 'drive' && a.fileId) navigate(`/drive/file/${a.fileId}`);
    else if (a.url) window.open(a.url, '_blank', 'noopener');
  };
  return (
    <li className="pj-att">
      <button type="button" className="pj-att__main" onClick={open}>
        <span className="pj-att__icon" style={{ ['--fc' as string]: FILE_TONE[a.fileKind] ?? '#94a3b8' }}>
          {a.kind === 'drive' ? <FileText /> : <Link2 />}
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="pj-att__name truncate">{a.name}</span>
          <span className="pj-att__sub">
            {a.kind === 'drive' ? 'Helix Drive' : (a.url ?? '').replace(/^https?:\/\//, '').split('/')[0]} · {users.get(a.addedBy)?.name.split(' ')[0] ?? 'someone'} · {relativeTime(a.at)}
          </span>
        </span>
        <ExternalLink className="pj-att__go" />
      </button>
      {onRemove && (
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${a.name}`} onClick={onRemove}>
          <X />
        </button>
      )}
    </li>
  );
}

export function DrivePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: BridgeFile) => void }) {
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<BridgeFile[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const viewer = currentViewer();
    if (!viewer) return;
    loadBridge('drive')
      .then((api) => {
        if (alive) {
          setFiles(api.searchFiles(viewer, q, 20));
          setErr(false);
        }
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [open, q]);
  return (
    <Modal open={open} onClose={onClose} title="Attach from Drive" subtitle="Only files you can open are listed." width={520} className="neo-portal pj-modal">
      <NeoSearch value={q} onChange={setQ} placeholder="Search Helix Drive…" autoFocus />
      <ul className="pj-drivelist">
        {err && <li className="neo-faint text-sm">Helix Drive is unavailable right now — try again shortly, or add a link instead.</li>}
        {!err && files && files.length === 0 && <li className="neo-faint text-sm">{q ? `No files match “${q}”.` : 'No recent files yet.'}</li>}
        {(files ?? []).map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className="pj-drivelist__item"
              onClick={() => {
                onPick(f);
                onClose();
              }}
            >
              <span className="pj-att__icon" style={{ ['--fc' as string]: FILE_TONE[f.kind] ?? '#94a3b8' }}>
                <FileText />
              </span>
              <span className="grow truncate">{f.name}</span>
              <span className="neo-faint text-xs">{f.kind}</span>
              <span className="pj-sens" data-s={f.sensitivity}>
                {f.sensitivity}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function LinkForm({ onAdd, onCancel }: { onAdd: (name: string, url: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  return (
    <div className="pj-linkform">
      <input className="neo-input neo-input--sm" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link URL" autoFocus />
      <input className="neo-input neo-input--sm" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Link name" />
      <div className="pj-tp__edit-acts">
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" disabled={!url.trim()} onClick={() => onAdd(name.trim() || url.replace(/^https?:\/\//, '').slice(0, 60), url.trim())}>
          Add link
        </button>
      </div>
    </div>
  );
}

function Attachments({ task, canAdd, canEdit }: { task: Task; canAdd: boolean; canEdit: boolean }) {
  const store = useProjects();
  const actor = useActor();
  const [drive, setDrive] = useState(false);
  const [link, setLink] = useState(false);
  return (
    <section className="pj-tp__sec" aria-label="Attachments">
      <div className="pj-tp__sechead">
        <Paperclip /> <span>Attachments</span>
        {task.attachments.length > 0 && <span className="neo-faint text-xs">{task.attachments.length}</span>}
        <span className="grow" />
        {canAdd && (
          <>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setDrive(true)} data-qa="attach-drive">
              <FileText /> Drive
            </button>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setLink(true)}>
              <Link2 /> Link
            </button>
          </>
        )}
      </div>
      {link && (
        <LinkForm
          onCancel={() => setLink(false)}
          onAdd={(name, url) => {
            const r = store.addAttachment(task.id, { kind: 'link', url, name, fileKind: 'link' });
            if (r.ok) setLink(false);
            else toast.error(r.error);
          }}
        />
      )}
      {task.attachments.length === 0 && !link ? (
        <p className="neo-faint text-sm">No files yet.</p>
      ) : (
        <ul className="pj-atts">
          {task.attachments.map((a) => (
            <AttachmentRow key={a.id} a={a} onRemove={canEdit || a.addedBy === actor?.id ? () => store.removeAttachment(task.id, a.id) : undefined} />
          ))}
        </ul>
      )}
      <DrivePicker
        open={drive}
        onClose={() => setDrive(false)}
        onPick={(f) => {
          const r = store.addAttachment(task.id, { kind: 'drive', fileId: f.id, name: f.name, fileKind: f.kind });
          if (r.ok) toast.success('Attached', f.name);
          else toast.error(r.error);
        }}
      />
    </section>
  );
}

/* ───────────────────────── comments ───────────────────────── */

function Comments({ task, project, canComment }: { task: Task; project: Project | undefined; canComment: boolean }) {
  const store = useProjects();
  const actor = useActor()!;
  const users = useUsersMap();
  const [reactFor, setReactFor] = useState<{ id: string; el: HTMLElement } | null>(null);
  void project;
  if (!task.comments.length) return <p className="neo-faint text-sm pj-tp__empty">{canComment ? 'No comments yet — start the conversation below.' : 'No comments yet.'}</p>;
  return (
    <ol className="pj-comments">
      {task.comments.map((c) => (
        <li key={c.id} className="pj-comment">
          <UserAvatar id={c.authorId} size={28} />
          <div className="pj-comment__body">
            <div className="pj-comment__head">
              <strong>{users.get(c.authorId)?.name ?? 'Someone'}</strong>
              <span className="neo-faint text-xs" title={formatDateTime(c.at)}>
                {relativeTime(c.at)}
              </span>
              {c.authorId === actor.id && (
                <button type="button" className="pj-comment__del" aria-label="Delete comment" onClick={() => store.deleteComment(task.id, c.id)}>
                  <Trash2 />
                </button>
              )}
            </div>
            <MarkdownLite text={c.body} />
            <div className="pj-reacts">
              {Object.entries(c.reactions).map(([emoji, ids]) => (
                <button
                  key={emoji}
                  type="button"
                  className={cx('pj-react', ids.includes(actor.id) && 'is-mine')}
                  onClick={() => store.toggleReaction(task.id, c.id, emoji)}
                  title={ids.map((id) => users.get(id)?.name ?? id).join(', ')}
                >
                  {emoji} <span>{ids.length}</span>
                </button>
              ))}
              <button type="button" className="pj-react pj-react--add" aria-label="Add reaction" onClick={(e) => setReactFor({ id: c.id, el: e.currentTarget })}>
                <SmilePlus />
              </button>
            </div>
          </div>
        </li>
      ))}
      <NeoPopover open={!!reactFor} anchor={reactFor?.el ?? null} onClose={() => setReactFor(null)} placement="top-start" width={236} label="Reactions">
        <div className="pj-emoji">
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                if (reactFor) store.toggleReaction(task.id, reactFor.id, e);
                setReactFor(null);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </NeoPopover>
    </ol>
  );
}

function Composer({ task, project }: { task: Task; project: Project | undefined }) {
  const store = useProjects();
  const hub = useHub();
  const [v, setV] = useState('');
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const people = useMemo(() => {
    const active = hub.users.filter((u) => u.active);
    if (!project) return active.filter((u) => u.id === task.creatorId || u.id === task.assigneeId);
    return active.filter((u) => canViewProject(project, actorFrom(u, effectivePermissions(u, hub.roles))));
  }, [hub.users, hub.roles, project, task.creatorId, task.assigneeId]);
  const trig = activeTrigger(v, caret);
  const opts = trig && trig.sigil === '@' ? people.filter((u) => !trig.query || u.name.toLowerCase().split(' ').some((w) => w.startsWith(trig.query.toLowerCase()))).slice(0, 5) : [];
  useEffect(() => setSel(0), [trig?.query]);

  const send = () => {
    const body = v.trim();
    if (!body) return;
    const r = store.addComment(task.id, body);
    if (!r.ok) return toast.error(r.error);
    setV('');
    if (r.mentioned.length) toast.success(`Notified ${r.mentioned.length === 1 ? (hub.users.find((u) => u.id === r.mentioned[0])?.name.split(' ')[0] ?? '1 person') : `${r.mentioned.length} people`}`);
  };
  const apply = (name: string) => {
    if (!trig) return;
    const r = applyTrigger(v, trig, `@${name.split(' ')[0]}`);
    setV(r.text);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(r.caret, r.caret);
      setCaret(r.caret);
    });
  };
  return (
    <div className="pj-composer">
      {opts.length > 0 && (
        <div className="pj-composer__suggest" role="listbox" aria-label="Mention someone">
          {opts.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={cx('pj-cap__opt', i === sel && 'is-sel')}
              onMouseDown={(e) => {
                e.preventDefault();
                apply(u.name);
              }}
            >
              <Avatar user={u} size={20} />
              <span className="grow truncate">{u.name}</span>
              <span className="neo-faint text-xs truncate">{u.title}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="pj-composer__input"
        value={v}
        rows={1}
        placeholder="Comment… @ to mention"
        aria-label="Write a comment"
        onChange={(e) => {
          setV(e.target.value);
          setCaret(e.target.selectionStart ?? 0);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (opts.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((i) => (i + 1) % opts.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((i) => (i - 1 + opts.length) % opts.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              apply(opts[sel].name);
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        data-qa="comment-input"
      />
      <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm neo-btn--icon" aria-label="Send comment" disabled={!v.trim()} onClick={send}>
        <Send />
      </button>
    </div>
  );
}

function ActivityLog({ task }: { task: Task }) {
  const users = useUsersMap();
  return (
    <ol className="pj-log">
      {[...task.activity].reverse().map((a) => (
        <li key={a.id}>
          <UserAvatar id={a.actorId} size={20} />
          <span className="grow">
            <strong>{a.actorId === 'automation' ? 'Automation' : (users.get(a.actorId)?.name.split(' ')[0] ?? 'Someone')}</strong> {a.text}
          </span>
          <span className="neo-faint text-xs" title={formatDateTime(a.at)}>
            {relativeTime(a.at)}
          </span>
        </li>
      ))}
    </ol>
  );
}
