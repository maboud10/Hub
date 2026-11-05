import { useState, type CSSProperties } from 'react';
import { CheckCircle2, Lock, MessageSquare, MoreHorizontal, Paperclip, Plus, Search, Settings2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { isBlocked } from '@/projects/engine';
import type { SectionGroup } from '@/projects/selectors';
import type { CustomFieldDef, Project, ProjectSection, Task } from '@/projects/types';
import type { ViewProps } from '../ProjectView';
import { api, Collapsible, ConfirmModal, DuePill, Menu, PriorityFlag, report, StatusPill, TagChip, TypeGlyph, UserAvatar } from '../shared';

export function ListView(props: ViewProps) {
  const { project, sections, filtersActive, tasks } = props;
  const [editSection, setEditSection] = useState<ProjectSection | null>(null);
  const [deleteSection, setDeleteSection] = useState<ProjectSection | null>(null);
  const cf = project.customFields;

  if (filtersActive && tasks.length === 0) {
    return (
      <EmptyState icon={<Search />} title="No tasks match your filters">
        Try clearing a filter or searching for a different term.
      </EmptyState>
    );
  }

  return (
    <div className="pj-list" style={{ '--cf': cf.length } as CSSProperties}>
      <div className="pj-list__scroll">
        <div className="pj-list__head pj-list__row" aria-hidden="true">
          <span />
          <span>Ref</span>
          <span>Task</span>
          <span>Who</span>
          <span>Due</span>
          <span>Pri</span>
          <span>Status</span>
          {cf.map((f) => (
            <span key={f.id} className="truncate" title={f.name}>
              {f.name}
            </span>
          ))}
          <span />
        </div>
        {sections.map((g) => (
          <SectionBlock key={g.section.id} {...props} group={g} cf={cf} onEditSection={() => setEditSection(g.section)} onDeleteSection={() => setDeleteSection(g.section)} />
        ))}
      </div>
      {editSection && <SectionEditModal project={project} section={editSection} onClose={() => setEditSection(null)} />}
      <ConfirmModal open={Boolean(deleteSection)} onClose={() => setDeleteSection(null)} title={`Delete “${deleteSection?.name}”?`} confirmLabel="Delete section" danger onConfirm={() => deleteSection && report(api().deleteSection(project.id, deleteSection.id))}>
        Tasks in this section are moved to the first remaining section. This can’t be undone.
      </ConfirmModal>
    </div>
  );
}

function SectionBlock({ group, cf, project, canEdit, canAdmin, onEditSection, onDeleteSection, byId, today, openTask, onAddTask }: { group: SectionGroup; cf: CustomFieldDef[]; project: Project; canEdit: boolean; canAdmin: boolean; onEditSection: () => void; onDeleteSection: () => void } & ViewProps) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const submit = () => {
    const title = draft.trim();
    if (!title) return setAdding(false);
    if (report(api().createTask({ projectId: project.id, sectionId: group.section.id, title }))) setDraft('');
  };
  return (
    <Collapsible
      className="pj-list__section"
      title={group.section.name}
      count={group.tasks.length}
      right={
        <>
          {group.section.wipLimit && (
            <span className={cx('pj-wip', group.overWip && 'is-over')} title="Work-in-progress limit">
              {group.openCount}/{group.section.wipLimit} WIP
            </span>
          )}
          {canEdit && (
            <Menu
              align="right"
              width={200}
              trigger={(open, toggle) => (
                <button type="button" className={cx('icon-btn icon-btn--sm', open && 'is-open')} onClick={toggle} aria-label={`Section menu for ${group.section.name}`}>
                  <MoreHorizontal />
                </button>
              )}
              items={[
                { key: 'add', label: 'Add task here', icon: <Plus />, onSelect: () => onAddTask(group.section.id) },
                { key: 'edit', label: 'Rename / WIP limit', icon: <Settings2 />, onSelect: onEditSection },
                ...(canAdmin ? [{ key: 'del', label: 'Delete section', danger: true, onSelect: onDeleteSection }] : []),
              ]}
            />
          )}
        </>
      }
    >
      {group.tasks.length === 0 && !canEdit && <p className="pj-empty-row">No tasks.</p>}
      {group.tasks.map((t) => (
        <TaskLine key={t.id} task={t} project={project} cf={cf} blocked={isBlocked(t, byId)} today={today} onOpen={() => openTask(t.id)} canEdit={canEdit} />
      ))}
      {canEdit && (
        <div className="pj-list__row pj-list__add">
          <span />
          <span />
          {adding ? (
            <input
              className="pj-inline-input"
              placeholder="Task title, then Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') {
                  setDraft('');
                  setAdding(false);
                }
              }}
              autoFocus
            />
          ) : (
            <button type="button" className="pj-list__addbtn" onClick={() => setAdding(true)}>
              <Plus /> Add task
            </button>
          )}
        </div>
      )}
    </Collapsible>
  );
}

function TaskLine({ task, project, cf, blocked, today, onOpen, canEdit }: { task: Task; project: Project; cf: CustomFieldDef[]; blocked: boolean; today: string; onOpen: () => void; canEdit: boolean }) {
  const done = task.status === 'done';
  const pendingApproval = task.type === 'approval' && task.approval?.decision === 'pending';
  return (
    <div className={cx('pj-list__row pj-list__task', done && 'is-done', blocked && 'is-blocked')} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <button
        type="button"
        className={cx('pj-check', done && 'is-done')}
        aria-label={done ? 'Reopen task' : 'Complete task'}
        disabled={!canEdit || pendingApproval}
        title={pendingApproval ? 'Approvals complete when the approver decides' : undefined}
        onClick={(e) => {
          e.stopPropagation();
          report(api().completeTask(task.id, !done));
        }}
      >
        <CheckCircle2 />
      </button>
      <span className="pj-list__ref mono">
        {project.key}-{task.number}
      </span>
      <span className="pj-list__title">
        <TypeGlyph type={task.type} />
        <span className="pj-list__text truncate">{task.title}</span>
        {blocked && (
          <span className="pj-row__blocked" title="Blocked by an open dependency">
            <Lock />
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="pj-row__sub faint">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        )}
        {task.tags.slice(0, 3).map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        {task.attachments.length > 0 && (
          <span className="pj-row__sub faint" title={`${task.attachments.length} attachments`}>
            <Paperclip />
          </span>
        )}
      </span>
      <span>
        <UserAvatar userId={task.assigneeId} size={24} />
      </span>
      <span>
        <DuePill dueDate={task.dueDate} status={task.status} today={today} showEmpty />
      </span>
      <span>
        <PriorityFlag priority={task.priority} />
      </span>
      <span>
        <StatusPill status={task.status} />
      </span>
      {cf.map((f) => {
        const v = task.customFieldValues[f.id];
        const opt = f.type === 'select' ? f.options?.find((o) => o.id === v) : undefined;
        return (
          <span key={f.id} className="pj-list__cf truncate">
            {v === undefined || v === '' ? (
              <span className="faint">—</span>
            ) : opt ? (
              <span className="pj-pill" style={{ '--pill': opt.color } as CSSProperties}>
                {opt.label}
              </span>
            ) : (
              <>
                {v}
                {f.unit ? ` ${f.unit}` : ''}
              </>
            )}
          </span>
        );
      })}
      <span className="pj-list__comments faint">
        {task.comments.length > 0 && (
          <>
            <MessageSquare /> {task.comments.length}
          </>
        )}
      </span>
    </div>
  );
}

export function SectionEditModal({ project, section, onClose }: { project: Project; section: ProjectSection; onClose: () => void }) {
  const [name, setName] = useState(section.name);
  const [wip, setWip] = useState(section.wipLimit ? String(section.wipLimit) : '');
  const save = () => {
    const limit = wip.trim() === '' ? null : Math.max(1, Number(wip));
    if (report(api().updateSection(project.id, section.id, { name, wipLimit: limit }))) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit section"
      width={420}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary pj-btn-violet" onClick={save} disabled={!name.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="pj-form">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="field-label">WIP limit</span>
          <input type="number" min={1} className="input" value={wip} onChange={(e) => setWip(e.target.value)} placeholder="No limit" />
          <span className="field-hint">Board columns warn when more open tasks than this are in the section; moves beyond it are blocked.</span>
        </label>
      </div>
    </Modal>
  );
}
