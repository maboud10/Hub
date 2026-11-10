/**
 * IT queue Kanban: New → Triaged → In progress → Waiting on user → Resolved.
 * dnd-kit drag-and-drop (pointer + keyboard), live SLA chips, priority edge
 * glow and a drag overlay. Dropping into Resolved asks for a resolution.
 *
 * Keyboard: focus a card, Space picks it up, ←/→ jump between lanes, Space
 * drops, Esc cancels. Enter selects a card (a second Enter opens it).
 */
import { forwardRef, useState, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { CheckCircle2, Laptop } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import type { Ticket, TicketStatus } from '@/helpdesk/types';
import { STATUS_LABEL_AGENT, STATUS_ORDER, STATUS_TONE } from '@/helpdesk/meta';
import { isBreaching } from '@/helpdesk/sla';
import { firstNameOf } from '@/helpdesk/util';
import { CategoryGlyph, PriorityPill, SlaChip } from './ui';

export const RESOLVED_LIMIT = 8;

/** Cards per lane, in display order (Resolved: most recent first, capped). */
export function boardLanes(tickets: Ticket[]): Record<TicketStatus, { all: Ticket[]; shown: Ticket[] }> {
  const out = {} as Record<TicketStatus, { all: Ticket[]; shown: Ticket[] }>;
  for (const s of STATUS_ORDER) {
    const all = tickets.filter((t) => t.status === s);
    const shown = s === 'resolved' ? [...all].sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)).slice(0, RESOLVED_LIMIT) : all;
    out[s] = { all, shown };
  }
  return out;
}

/** ←/→ jump the dragged card to the neighbouring lane (instead of nudging 25px). */
const laneKeys: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers } }) => {
  if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return undefined;
  event.preventDefault();
  if (!collisionRect) return undefined;
  const lanes = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.left - b.left);
  const mid = collisionRect.left + collisionRect.width / 2;
  const target = event.code === 'ArrowRight' ? lanes.find((r) => r.left > mid) : [...lanes].reverse().find((r) => r.left + r.width < mid);
  if (!target) return undefined;
  return { x: target.left + Math.max(0, (target.width - collisionRect.width) / 2), y: target.top + 56 };
};

/** Pointer position decides the lane; keyboard drags fall back to rectangle overlap. */
const laneCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

const laneLabel = (id: unknown) => STATUS_LABEL_AGENT[id as TicketStatus] ?? String(id);

export function QueueBoard({
  tickets,
  selected,
  onSelect,
  onMove,
  onOpen,
  onContextMenu,
  unread,
  compactResolved,
  onShowResolved,
}: {
  tickets: Ticket[];
  selected?: string;
  onSelect: (id: string) => void;
  onMove: (t: Ticket, to: TicketStatus) => void;
  /** Open the full ticket (double-click, or Enter on the selected card). */
  onOpen?: (id: string) => void;
  onContextMenu?: (e: ReactMouseEvent, t: Ticket) => void;
  /** Ticket ids with activity the agent hasn't seen yet. */
  unread?: ReadonlySet<string>;
  /** Collapse the Resolved lane into a slim drop zone (e.g. while the inspector is open). */
  compactResolved?: boolean;
  /** Shown under the Resolved lane when older tickets are hidden. */
  onShowResolved?: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] }, coordinateGetter: laneKeys }),
  );
  const [active, setActive] = useState<string | null>(null);
  const now = useNow(30_000);
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const lanes = boardLanes(tickets);
  const max = Math.max(1, ...STATUS_ORDER.filter((s) => s !== 'resolved').map((s) => lanes[s].all.length));
  const end = (e: DragEndEvent) => {
    setActive(null);
    const t = byId.get(String(e.active.id));
    const to = e.over?.id as TicketStatus | undefined;
    if (t && to && t.status !== to) onMove(t, to);
  };
  const dragging = active ? byId.get(active) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={laneCollision}
      onDragStart={(e) => setActive(String(e.active.id))}
      onDragEnd={end}
      onDragCancel={() => setActive(null)}
      accessibility={{
        screenReaderInstructions: { draggable: 'To move a ticket, press Space. Use the left and right arrow keys to choose a lane, Space to drop it there, or Escape to cancel.' },
        announcements: {
          onDragStart: ({ active: a }) => `Picked up ${a.id}.`,
          onDragOver: ({ active: a, over }) => (over ? `${a.id} is over ${laneLabel(over.id)}.` : `${a.id} is not over a lane.`),
          onDragEnd: ({ active: a, over }) => (over ? `${a.id} dropped in ${laneLabel(over.id)}.` : `${a.id} dropped.`),
          onDragCancel: ({ active: a }) => `Moving ${a.id} was cancelled.`,
        },
      }}
    >
      <div className={cx('hd-queue-board', compactResolved && 'is-compact')} role="region" aria-label="Queue board" data-dragging={dragging ? 'true' : undefined}>
        {STATUS_ORDER.map((s) => {
          const { all, shown } = lanes[s];
          const breaching = s === 'resolved' ? 0 : all.filter((t) => isBreaching(t, now)).length;
          const slim = s === 'resolved' && compactResolved;
          return (
            <Column key={s} status={s} count={all.length} load={s === 'resolved' ? 0 : all.length / max} breaching={breaching} dragging={!!dragging && dragging.status !== s} slim={slim}>
              {!slim &&
                shown.map((t) => (
                  <DraggableCard
                    key={t.id}
                    t={t}
                    selected={t.id === selected}
                    unread={!!unread?.has(t.id)}
                    onSelect={() => onSelect(t.id)}
                    onOpen={onOpen ? () => onOpen(t.id) : undefined}
                    onContextMenu={onContextMenu ? (e) => onContextMenu(e, t) : undefined}
                  />
                ))}
              {!slim && s === 'resolved' && all.length > RESOLVED_LIMIT && (
                <button type="button" className="hd-queue-col__more" onClick={onShowResolved} disabled={!onShowResolved}>
                  +{all.length - RESOLVED_LIMIT} older · list view
                </button>
              )}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>{dragging ? <QueueCard t={dragging} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, count, load, breaching, dragging, slim, children }: { status: TicketStatus; count: number; load: number; breaching: number; dragging: boolean; slim?: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cx('hd-queue-col', slim && 'hd-queue-col--slim')}
      data-status={status}
      data-tone={STATUS_TONE[status]}
      data-over={isOver || undefined}
      data-target={dragging || undefined}
      aria-label={`${STATUS_LABEL_AGENT[status]} · ${count}`}
    >
      <header className="hd-queue-col__head">
        <span className="hd-queue-col__dot" aria-hidden="true" />
        <span className="hd-queue-col__name">{STATUS_LABEL_AGENT[status]}</span>
        <span className="hd-queue-col__count neo-num">{count}</span>
        {breaching > 0 && !slim && (
          <span className="hd-queue-col__breach" title={`${breaching} breaching SLA`}>
            {breaching}
            <span className="hd-queue-col__breachlbl">late</span>
          </span>
        )}
      </header>
      {!slim && (
        <span className="hd-queue-col__load" aria-hidden="true">
          <i style={{ width: `${Math.round(load * 100)}%` }} />
        </span>
      )}
      <div className="hd-queue-col__body">
        {slim ? (
          <div className="hd-queue-col__slimdrop">
            <CheckCircle2 />
            <span>{dragging ? 'Drop to resolve' : 'Resolved'}</span>
          </div>
        ) : (
          <>
            {children}
            {count === 0 && <div className="hd-queue-col__empty">{dragging ? 'Drop here' : status === 'resolved' ? 'Nothing resolved yet' : 'Clear'}</div>}
          </>
        )}
      </div>
    </section>
  );
}

function DraggableCard({
  t,
  selected,
  unread,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  t: Ticket;
  selected: boolean;
  unread: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id });
  return (
    <QueueCard
      ref={setNodeRef}
      t={t}
      selected={selected}
      unread={unread}
      ghost={isDragging}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selected && onOpen) onOpen();
          else onSelect();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      data-qa={`qcard-${t.id}`}
    />
  );
}

type CardProps = { t: Ticket; selected?: boolean; ghost?: boolean; overlay?: boolean; unread?: boolean } & HTMLAttributes<HTMLDivElement> & { 'data-qa'?: string };

export const QueueCard = forwardRef<HTMLDivElement, CardProps>(function QueueCard({ t, selected, ghost, overlay, unread, className, ...rest }, ref) {
  const users = useHub((s) => s.users);
  const now = useNow(30_000);
  const requester = users.find((u) => u.id === t.requesterId);
  const assignee = users.find((u) => u.id === t.assigneeId);
  const late = isBreaching(t, now);
  const when = t.status === 'resolved' ? (t.resolvedAt ?? t.updatedAt) : t.updatedAt;
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={cx('hd-queue-card', selected && 'is-selected', ghost && 'is-ghost', overlay && 'is-overlay', late && 'is-late', className)}
      data-p={t.priority}
      aria-label={`${t.id} ${t.priority} ${t.subject}`}
      aria-pressed={selected}
      {...rest}
    >
      <div className="hd-queue-card__in">
        <div className="hd-queue-card__top">
          <PriorityPill priority={t.priority} />
          <span className="neo-mono hd-queue-card__id">{t.id}</span>
          {t.escalated && <span className="hd-esc hd-queue-card__esc">Sec</span>}
          {unread && <span className="hd-unread" title="New activity" aria-label="New activity" />}
          <time className="hd-queue-card__when" dateTime={new Date(when).toISOString()} title={`${t.status === 'resolved' ? 'Resolved' : 'Updated'} ${relativeTime(when, now)}`}>
            {relativeTime(when, now).replace(/ ago$/, '')}
          </time>
        </div>
        <div className="hd-queue-card__subj">{t.subject}</div>
        <div className="hd-queue-card__meta">
          <CategoryGlyph category={t.category} size={20} />
          <span className="truncate">{requester?.name ?? 'Unknown'}</span>
          {t.deviceTag && (
            <span className="hd-queue-card__dev">
              <Laptop /> {t.deviceTag.slice(3)}
            </span>
          )}
        </div>
        <div className="hd-queue-card__foot">
          {assignee ? (
            <span className="hd-queue-card__who" title={`Assigned to ${assignee.name}`}>
              <Avatar user={assignee} size={20} /> <span className="hd-queue-card__name">{firstNameOf(assignee.name)}</span>
            </span>
          ) : (
            <span className="hd-queue-card__who hd-queue-card__who--none" title={t.sim ? 'Matching an agent' : 'Unassigned'}>
              <i aria-hidden="true" />
              <span className="hd-queue-card__name">{t.sim ? 'Matching…' : 'Unassigned'}</span>
            </span>
          )}
          <SlaChip ticket={t} compact />
        </div>
      </div>
    </div>
  );
});
