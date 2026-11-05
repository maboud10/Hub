import { useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, Lock, MessageSquare, Paperclip, Plus, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { isBlocked } from '@/projects/engine';
import type { SectionGroup } from '@/projects/selectors';
import type { Task } from '@/projects/types';
import type { ViewProps } from '../ProjectView';
import { api, DuePill, PriorityFlag, report, TypeGlyph, UserAvatar } from '../shared';

interface DropHint {
  sectionId: string;
  index: number | undefined;
  beforeTaskId?: string;
}

export function BoardView(props: ViewProps) {
  const { project, sections, allSections, canEdit, filtersActive, tasks, byId, today, openTask } = props;
  const [dragging, setDragging] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const dragCounter = useRef(0);

  if (filtersActive && tasks.length === 0) {
    return (
      <EmptyState icon={<Search />} title="No tasks match your filters">
        Try clearing a filter or searching for a different term.
      </EmptyState>
    );
  }

  const fullOrder = (sectionId: string) => allSections.find((g) => g.section.id === sectionId)?.tasks ?? [];

  /** Index among the section's other tasks (store semantics) for a drop before `beforeTaskId`. */
  const indexFor = (sectionId: string, beforeTaskId: string | undefined, draggedId: string): number | undefined => {
    if (!beforeTaskId) return undefined;
    const others = fullOrder(sectionId).filter((t) => t.id !== draggedId);
    const i = others.findIndex((t) => t.id === beforeTaskId);
    return i < 0 ? undefined : i;
  };

  const onDragStart = (e: DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(taskId);
  };
  const onDragEnd = () => {
    setDragging(null);
    setHint(null);
    dragCounter.current = 0;
  };
  const onCardDragOver = (e: DragEvent, sectionId: string, task: Task) => {
    if (!dragging || dragging === task.id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const visible = sections.find((g) => g.section.id === sectionId)?.tasks ?? [];
    const pos = visible.findIndex((t) => t.id === task.id);
    const beforeTaskId = before ? task.id : visible[pos + 1]?.id;
    setHint({ sectionId, beforeTaskId, index: indexFor(sectionId, beforeTaskId, dragging) });
  };
  const onColumnDragOver = (e: DragEvent, sectionId: string) => {
    if (!dragging) return;
    e.preventDefault();
    if (hint?.sectionId !== sectionId || hint.beforeTaskId) setHint({ sectionId, beforeTaskId: undefined, index: undefined });
  };
  const onDrop = (e: DragEvent, sectionId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || dragging;
    const target = hint?.sectionId === sectionId ? hint : { sectionId, index: undefined, beforeTaskId: undefined };
    onDragEnd();
    if (!taskId) return;
    report(api().moveTask(taskId, sectionId, target.index));
  };

  const addSection = () => {
    const name = sectionName.trim();
    if (!name) return setAddingSection(false);
    if (report(api().addSection(project.id, name))) {
      setSectionName('');
      setAddingSection(false);
    }
  };

  return (
    <div className="pj-board" role="list" aria-label="Kanban board">
      {sections.map((g) => (
        <Column
          key={g.section.id}
          group={g}
          canEdit={canEdit}
          dragging={dragging}
          hint={hint?.sectionId === g.section.id ? hint : null}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onCardDragOver={onCardDragOver}
          onColumnDragOver={onColumnDragOver}
          onDrop={onDrop}
          blocked={(t) => isBlocked(t, byId)}
          today={today}
          projectKey={project.key}
          projectId={project.id}
          openTask={openTask}
        />
      ))}
      {canEdit && (
        <div className="pj-col pj-col--ghost">
          {addingSection ? (
            <div className="pj-col__newform">
              <input
                className="input"
                placeholder="Section name"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSection();
                  if (e.key === 'Escape') setAddingSection(false);
                }}
                autoFocus
              />
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={addSection}>
                  Add
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAddingSection(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="pj-col__newbtn" onClick={() => setAddingSection(true)}>
              <Plus /> Add section
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Column({
  group,
  canEdit,
  dragging,
  hint,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onColumnDragOver,
  onDrop,
  blocked,
  today,
  projectKey,
  projectId,
  openTask,
}: {
  group: SectionGroup;
  canEdit: boolean;
  dragging: string | null;
  hint: DropHint | null;
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
  onCardDragOver: (e: DragEvent, sectionId: string, task: Task) => void;
  onColumnDragOver: (e: DragEvent, sectionId: string) => void;
  onDrop: (e: DragEvent, sectionId: string) => void;
  blocked: (t: Task) => boolean;
  today: string;
  projectKey: string;
  projectId: string;
  openTask: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const submit = () => {
    const title = draft.trim();
    if (!title) return setAdding(false);
    if (report(api().createTask({ projectId, sectionId: group.section.id, title }))) setDraft('');
  };
  const { section } = group;
  return (
    <section
      className={cx('pj-col', hint && 'is-target', group.overWip && 'is-over')}
      role="listitem"
      aria-label={section.name}
      onDragOver={(e) => onColumnDragOver(e, section.id)}
      onDrop={(e) => onDrop(e, section.id)}
    >
      <header className="pj-col__head">
        <span className="pj-col__name truncate">{section.name}</span>
        <span className={cx('pj-wip', group.overWip && 'is-over')} title={section.wipLimit ? `Work-in-progress limit ${section.wipLimit}` : 'Open tasks'}>
          {group.openCount}
          {section.wipLimit ? `/${section.wipLimit}` : ''}
        </span>
        {canEdit && (
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => setAdding(true)} aria-label={`Add task to ${section.name}`}>
            <Plus />
          </button>
        )}
      </header>
      <div className="pj-col__body">
        {group.tasks.map((t) => (
          <div key={t.id} className={cx('pj-card-slot', hint?.beforeTaskId === t.id && 'is-before')}>
            <Card task={t} projectKey={projectKey} blocked={blocked(t)} today={today} canDrag={canEdit} dragging={dragging === t.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={(e) => onCardDragOver(e, section.id, t)} onOpen={() => openTask(t.id)} />
          </div>
        ))}
        {hint && !hint.beforeTaskId && dragging && <div className="pj-drop-end" aria-hidden="true" />}
        {group.tasks.length === 0 && !adding && <p className="pj-col__empty">{canEdit ? 'Drop a card here or add one.' : 'Nothing here yet.'}</p>}
        {adding && (
          <div className="pj-card pj-card--new">
            <textarea
              className="pj-card__input"
              placeholder="Card title…"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === 'Escape') {
                  setDraft('');
                  setAdding(false);
                }
              }}
              autoFocus
            />
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn--sm btn--primary pj-btn-violet" onClick={submit} disabled={draft.trim().length < 2}>
                Add card
              </button>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => setAdding(false)} aria-label="Cancel">
                <X />
              </button>
            </div>
          </div>
        )}
      </div>
      {canEdit && !adding && (
        <button type="button" className="pj-col__add" onClick={() => setAdding(true)}>
          <Plus /> Add card
        </button>
      )}
    </section>
  );
}

function Card({
  task,
  projectKey,
  blocked,
  today,
  canDrag,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onOpen,
}: {
  task: Task;
  projectKey: string;
  blocked: boolean;
  today: string;
  canDrag: boolean;
  dragging: boolean;
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onOpen: () => void;
}) {
  const done = task.status === 'done';
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <article
      className={cx('pj-card pj-kcard', done && 'is-done', blocked && 'is-blocked', dragging && 'is-dragging', `pj-kcard--${task.type}`)}
      draggable={canDrag}
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      aria-label={`${projectKey}-${task.number} ${task.title}`}
    >
      <div className="pj-kcard__top">
        <span className="pj-kcard__ref mono">
          {projectKey}-{task.number}
        </span>
        <TypeGlyph type={task.type} />
        {blocked && (
          <span className="pj-kcard__blocked" title="Blocked by an open dependency">
            <Lock /> Blocked
          </span>
        )}
        <span className="spacer" />
        <PriorityFlag priority={task.priority} />
      </div>
      <div className="pj-kcard__title">{task.title}</div>
      {task.tags.length > 0 && (
        <div className="pj-kcard__tags">
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} className="pj-tag">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="pj-kcard__foot">
        <UserAvatar userId={task.assigneeId} size={22} />
        <DuePill dueDate={task.dueDate} status={task.status} today={today} />
        <span className="spacer" />
        {task.subtasks.length > 0 && (
          <span className={cx('pj-kcard__meta', subDone === task.subtasks.length && 'is-complete')} title="Subtasks">
            <CheckCircle2 /> {subDone}/{task.subtasks.length}
          </span>
        )}
        {task.comments.length > 0 && (
          <span className="pj-kcard__meta" title="Comments">
            <MessageSquare /> {task.comments.length}
          </span>
        )}
        {task.attachments.length > 0 && (
          <span className="pj-kcard__meta" title="Attachments">
            <Paperclip /> {task.attachments.length}
          </span>
        )}
      </div>
    </article>
  );
}
