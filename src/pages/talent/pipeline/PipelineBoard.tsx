/**
 * Pipeline Kanban board: 8 stage columns grouped under the 4 phases, with a
 * stage rail (phase legend + quick jump + drop targets). Dropping a card
 * never moves it directly — it opens the gate-checklist move dialog. While
 * dragging, every column shows whether the move is ready, gated, backwards or
 * not allowed for you. Phones show one column at a time.
 */
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { Check, ChevronLeft, ChevronRight, Lock, PartyPopper, TriangleAlert, Undo2, Inbox } from 'lucide-react';
import type { StageId } from '@/talent/types';
import { STAGE_BY_ID, STAGE_ORDER, stageIndex } from '@/talent/constants';
import { gateFor } from '@/talent/gates';
import { buildGateContext, useTalentData, useTalentViewer } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { useIsMobile, useMediaQuery } from '@/hooks/useMediaQuery';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { PipelineCard, PipelineCardView, type PipeRow } from './PipelineCard';
import { PHASE_GROUPS, firstName, hueVars, isClosedApp, moveTargets, stageVars } from './pipelineUtils';

/** Pointer sensor for mouse & pen only — touch goes through the long-press TouchSensor so lists still scroll. */
class MousePenSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: e }: ReactPointerEvent) => e.isPrimary && e.button === 0 && e.pointerType !== 'touch',
    },
  ];
}

/** Arrow keys jump a keyboard-dragged card column by column. */
const columnCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft') return undefined;
  const { droppableRects, collisionRect, over } = context;
  if (!collisionRect) return undefined;
  event.preventDefault();
  const cols = [...droppableRects.entries()].filter(([id]) => String(id).startsWith('col:')).sort((a, b) => a[1].left - b[1].left);
  const centre = collisionRect.left + collisionRect.width / 2;
  let idx = over ? cols.findIndex(([id]) => id === over.id) : -1;
  if (idx < 0) idx = cols.findIndex(([, r]) => centre >= r.left && centre <= r.left + r.width);
  const next = cols[idx + (event.code === 'ArrowRight' ? 1 : -1)];
  if (!next) return undefined;
  const r = next[1];
  return { x: r.left + r.width / 2 - collisionRect.width / 2, y: currentCoordinates.y };
};

/** Pointer: whatever is under the finger/cursor. Keyboard: the column under the card's centre. */
const collision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const hits = pointerWithin(args);
    return hits.length ? hits : rectIntersection(args);
  }
  const centre = args.collisionRect.left + args.collisionRect.width / 2;
  const hit = args.droppableContainers.find((c) => {
    const r = args.droppableRects.get(c.id);
    return String(c.id).startsWith('col:') && !!r && centre >= r.left && centre <= r.right;
  });
  return hit ? [{ id: hit.id, data: { droppableContainer: hit, value: 0 } }] : closestCenter(args);
};

type DropState = 'source' | 'ok' | 'gate' | 'back' | 'hire' | 'blocked';
interface DropInfo {
  state: DropState;
  pending?: number;
  reason?: string;
}

const DROP_LABEL: Record<DropState, string> = {
  source: 'Current stage',
  ok: 'Ready',
  gate: 'Checks left',
  back: 'Move back',
  hire: 'Via accepted offer',
  blocked: 'Not allowed',
};

function DropBadge({ info }: { info: DropInfo }) {
  const Icon = info.state === 'ok' ? Check : info.state === 'gate' ? TriangleAlert : info.state === 'back' ? Undo2 : info.state === 'hire' ? PartyPopper : info.state === 'blocked' ? Lock : null;
  return (
    <div className={cx('tl-pipe-drop', `is-${info.state}`)} title={info.reason}>
      {Icon && <Icon aria-hidden="true" />}
      <span>{info.state === 'gate' ? `${info.pending} check${info.pending === 1 ? '' : 's'} left` : DROP_LABEL[info.state]}</span>
    </div>
  );
}

const stageOfRow = (r: PipeRow): StageId => (r.app.status === 'hired' ? 'hired' : r.app.stage);

// ───────────────────────── column ─────────────────────────
function BoardColumn({
  stage,
  rows,
  showReq,
  drop,
  collapsed,
  canDrag,
  mobile,
  onStep,
}: {
  stage: StageId;
  rows: PipeRow[];
  showReq: boolean;
  drop: DropInfo | null;
  collapsed: boolean;
  canDrag: (r: PipeRow) => boolean;
  mobile?: boolean;
  onStep?: (dir: -1 | 1) => void;
}) {
  const m = STAGE_BY_ID[stage];
  const Icon = m.icon;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}`, data: { stage } });
  const live = rows.filter((r) => !isClosedApp(r.app));
  const scored = live.map((r) => r.app.match?.score).filter((s): s is number => typeof s === 'number');
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const stale = live.filter((r) => r.sla === 'stale' && r.app.status === 'active').length;
  const closedCount = rows.length - live.length;
  const idx = stageIndex(stage);

  return (
    <section
      ref={setNodeRef}
      className={cx('tl-pipe-col', collapsed && 'is-collapsed', isOver && 'is-over', drop && `is-drop-${drop.state}`, mobile && 'is-mobile')}
      style={stageVars(stage)}
      data-stage={stage}
      aria-label={`${m.label}: ${live.length} candidate${live.length === 1 ? '' : 's'}`}
      title={collapsed ? `${m.label} · ${m.description}${m.slaDays ? ` · SLA ${m.slaDays}d` : ''}` : undefined}
    >
      <header className="tl-pipe-col__head">
        {mobile && (
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => onStep?.(-1)} disabled={idx === 0} aria-label="Previous stage">
            <ChevronLeft />
          </button>
        )}
        <span className="tl-pipe-col__icon" aria-hidden="true">
          <Icon />
        </span>
        <span className="tl-pipe-col__title">{m.label}</span>
        <span className="tl-pipe-col__count" aria-hidden="true">
          {live.length}
        </span>
        {mobile && (
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => onStep?.(1)} disabled={idx === STAGE_ORDER.length - 1} aria-label="Next stage">
            <ChevronRight />
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="tl-pipe-col__sub">
          {drop ? (
            <DropBadge info={drop} />
          ) : (
            <div className="tl-pipe-col__stats">
              {m.slaDays > 0 ? (
                <span title={`Target: under ${m.slaDays} days in ${m.label}`}>
                  SLA <b>{m.slaDays}d</b>
                </span>
              ) : (
                <span>Hand-off</span>
              )}
              <span title="Average match score in this stage">
                Match <b>{avg ?? '—'}</b>
              </span>
              {stale > 0 && (
                <span className="is-stale" title="Over the stage SLA">
                  {stale} over SLA
                </span>
              )}
              {closedCount > 0 && <span title="Closed applications shown">{closedCount} closed</span>}
            </div>
          )}
        </div>
      )}
      {collapsed && drop && <DropBadge info={drop} />}
      <div className="tl-pipe-col__body">
        {rows.map((r) => (
          <PipelineCard key={r.app.id} row={r} showReq={showReq} canDrag={canDrag(r)} />
        ))}
        {!rows.length && !collapsed && (
          <div className="tl-pipe-col__empty">
            <Inbox aria-hidden="true" />
            <span>No one in {m.label}</span>
            <span className="faint">{m.description}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────────────────── stage rail ─────────────────────────
function RailChip({ stage, count, active, drop, onPick }: { stage: StageId; count: number; active: boolean; drop: DropInfo | null; onPick: (s: StageId) => void }) {
  const m = STAGE_BY_ID[stage];
  const Icon = m.icon;
  const { setNodeRef, isOver } = useDroppable({ id: `rail:${stage}`, data: { stage } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cx('tl-pipe-rail__chip', active && 'is-active', isOver && 'is-over', drop && `is-drop-${drop.state}`, count === 0 && 'is-empty')}
      style={stageVars(stage)}
      onClick={() => onPick(stage)}
      aria-pressed={active}
      title={`${m.label}: ${count} · ${m.description}`}
    >
      <Icon aria-hidden="true" />
      <span className="tl-pipe-rail__label">{m.label}</span>
      <span className="tl-pipe-rail__count">{count}</span>
    </button>
  );
}

function StageRail({
  counts,
  activeStage,
  dropMap,
  onPick,
}: {
  counts: Map<StageId, number>;
  activeStage: StageId | null;
  dropMap: Map<StageId, DropInfo> | null;
  onPick: (s: StageId) => void;
}) {
  return (
    <nav className="tl-pipe-rail" aria-label="Pipeline stages">
      {PHASE_GROUPS.map((g) => (
        <div key={g.phase} className="tl-pipe-rail__phase" style={hueVars(g.hue)} role="group" aria-label={`${g.phase}: ${g.blurb}`}>
          <span className="tl-pipe-rail__phase-name" title={g.blurb}>
            {g.phase}
          </span>
          {g.stages.map((s) => (
            <RailChip key={s.id} stage={s.id} count={counts.get(s.id) ?? 0} active={activeStage === s.id} drop={dropMap?.get(s.id) ?? null} onPick={onPick} />
          ))}
        </div>
      ))}
    </nav>
  );
}

// ───────────────────────── board ─────────────────────────
export function PipelineBoard({ rows, showReq }: { rows: PipeRow[]; showReq: boolean }) {
  const viewer = useTalentViewer();
  const data = useTalentData();
  const isMobile = useIsMobile();
  const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reduced = prefersReduced || (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced');
  const boardRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<StageId | null>(null);

  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  const rowById = useMemo(() => new Map(rows.map((r) => [r.app.id, r])), [rows]);
  const byStage = useMemo(() => {
    const m = new Map<StageId, PipeRow[]>(STAGE_ORDER.map((s) => [s, []]));
    for (const r of rows) m.get(stageOfRow(r))?.push(r);
    return m;
  }, [rows]);
  const counts = useMemo(() => new Map(STAGE_ORDER.map((s) => [s, (byStage.get(s) ?? []).filter((r) => !isClosedApp(r.app)).length])), [byStage]);

  const activeRow = activeId ? rowById.get(activeId) ?? null : null;
  const canDrag = (r: PipeRow) => r.app.status === 'active' && !!viewer && moveTargets(viewer, r.app, r.req).some((t) => t.ok);

  const dropMap = useMemo(() => {
    if (!activeRow) return null;
    const ctx = buildGateContext(activeRow.app, data);
    const m = new Map<StageId, DropInfo>();
    for (const t of moveTargets(viewer, activeRow.app, activeRow.req)) {
      if (t.current) m.set(t.stage, { state: 'source' });
      else if (!t.ok) m.set(t.stage, { state: 'blocked', reason: t.reason });
      else if (t.stage === 'hired') m.set(t.stage, { state: 'hire', reason: 'Candidates are hired when the offer is accepted.' });
      else if (t.backwards) m.set(t.stage, { state: 'back' });
      else {
        const pending = ctx ? gateFor(activeRow.app, t.stage, ctx).checks.filter((c) => !c.done).length : 0;
        m.set(t.stage, pending ? { state: 'gate', pending } : { state: 'ok' });
      }
    }
    return m;
  }, [activeRow, data, viewer]);

  const labelOf = (id: string | number | undefined) => {
    const stage = typeof id === 'string' ? (id.split(':')[1] as StageId | undefined) : undefined;
    return stage && STAGE_BY_ID[stage] ? STAGE_BY_ID[stage].label : 'a stage';
  };
  const nameOf = (id: string | number) => rowById.get(String(id))?.cand?.name ?? 'Candidate';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)} from ${STAGE_BY_ID[rowById.get(String(active.id))?.app.stage ?? 'sourced'].label}. Use the arrow keys to choose a stage.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `${nameOf(active.id)} is not over a stage.`;
      const stage = String(over.id).split(':')[1] as StageId;
      const info = dropMap?.get(stage);
      return `${nameOf(active.id)} is over ${labelOf(over.id)}${info ? `: ${info.state === 'gate' ? `${info.pending} checks left` : DROP_LABEL[info.state]}` : ''}.`;
    },
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped on ${labelOf(over.id)}. Review the checklist to confirm the move.` : `${nameOf(active.id)} was not moved.`),
    onDragCancel: ({ active }) => `Move cancelled. ${nameOf(active.id)} stays where they were.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const row = rowById.get(String(active.id));
    const stage = over?.data.current?.stage as StageId | undefined;
    if (!row || !stage || stage === row.app.stage) return;
    const target = moveTargets(viewer, row.app, row.req).find((t) => t.stage === stage);
    if (!target?.ok) {
      toast.warning(`Can’t move ${firstName(row.cand?.name)} to ${STAGE_BY_ID[stage].label}`, target?.reason);
      return;
    }
    useTalentUI.getState().openModal({ kind: 'move', applicationId: row.app.id, to: stage });
  };

  const firstFilled = STAGE_ORDER.find((s) => (counts.get(s) ?? 0) > 0) ?? 'sourced';
  const currentMobile = mobileStage ?? firstFilled;

  const pick = (s: StageId) => {
    if (isMobile) {
      setMobileStage(s);
      return;
    }
    const col = boardRef.current?.querySelector<HTMLElement>(`[data-stage="${s}"]`);
    if (col && boardRef.current) {
      const box = boardRef.current.getBoundingClientRect();
      const r = col.getBoundingClientRect();
      boardRef.current.scrollTo({ left: boardRef.current.scrollLeft + r.left - box.left - 8, behavior: reduced ? 'auto' : 'smooth' });
      col.classList.remove('is-flash');
      void col.offsetWidth;
      col.classList.add('is-flash');
    }
  };

  const overlay = (
    <DragOverlay zIndex={95} dropAnimation={reduced ? null : { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
      {activeRow ? (
        <div className="tl-pipe-overlay" style={{ '--tilt': reduced ? '0deg' : '-2deg' } as CSSProperties}>
          <PipelineCardView row={activeRow} showReq={showReq} overlay />
        </div>
      ) : null}
    </DragOverlay>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move a candidate, press space or enter on the grip to pick them up. Use the left and right arrow keys to choose a stage, then press space or enter to review the move, or escape to cancel. You can also use the Move to menu.',
        },
      }}
    >
      <div className={cx('tl-pipe-boardwrap', activeRow && 'is-dragging')}>
        <StageRail counts={counts} activeStage={isMobile ? currentMobile : null} dropMap={dropMap} onPick={pick} />
        {isMobile ? (
          <div className="tl-pipe-mobile">
            <BoardColumn
              key={currentMobile}
              stage={currentMobile}
              rows={byStage.get(currentMobile) ?? []}
              showReq={showReq}
              drop={dropMap?.get(currentMobile) ?? null}
              collapsed={false}
              canDrag={canDrag}
              mobile
              onStep={(dir) => setMobileStage(STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, Math.max(0, stageIndex(currentMobile) + dir))])}
            />
            {activeRow && <p className="tl-pipe-mobile__hint">Drop on a stage chip above to move {firstName(activeRow.cand?.name)}.</p>}
          </div>
        ) : (
          <div className="tl-pipe-board" ref={boardRef}>
            {PHASE_GROUPS.map((g) => {
              const phaseRows = g.stages.flatMap((s) => byStage.get(s.id) ?? []);
              const live = phaseRows.filter((r) => !isClosedApp(r.app));
              const stale = live.filter((r) => r.sla === 'stale' && r.app.status === 'active').length;
              const narrow = g.stages.every((s) => !(byStage.get(s.id) ?? []).length);
              return (
                <div key={g.phase} className={cx('tl-pipe-phase', narrow && 'is-narrow')} style={hueVars(g.hue)}>
                  <div className="tl-pipe-phase__head" title={g.blurb}>
                    <span className="tl-pipe-phase__name">{g.phase}</span>
                    <span className="tl-pipe-phase__count">{live.length}</span>
                    {!narrow && <span className="tl-pipe-phase__blurb">{g.blurb}</span>}
                    {stale > 0 && !narrow && <span className="tl-pipe-phase__stale">{stale} over SLA</span>}
                  </div>
                  <div className="tl-pipe-phase__cols">
                    {g.stages.map((s) => {
                      const list = byStage.get(s.id) ?? [];
                      return (
                        <BoardColumn
                          key={s.id}
                          stage={s.id}
                          rows={list}
                          showReq={showReq}
                          drop={dropMap?.get(s.id) ?? null}
                          collapsed={list.length === 0}
                          canDrag={canDrag}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay}
    </DndContext>
  );
}
