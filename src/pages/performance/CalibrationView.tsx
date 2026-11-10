/**
 * Calibration — the 9-box talent grid (signature).
 *
 * Performance (x: low → high) × potential (y: low → high, high on top). Everyone in the
 * viewer's calibration scope sits where `placementFor` puts them (calibrated › manager
 * rating › last cycle). Drag a chip to another box (dnd-kit: pointer + keyboard), add an
 * optional note and the move is recorded with `calibrate` — audited by the store, and the
 * person's manager is notified. Accessible alternatives: right-click menu, the panel's box
 * picker and arrow keys on the selected person.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  CircleDashed,
  Download,
  Ellipsis,
  Eraser,
  FileText,
  Gauge,
  Grid3x3,
  History,
  Inbox,
  Keyboard,
  Lock,
  LockOpen,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Target,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type { User } from '@/types';
import { Chip, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoStage, Ring, useContextMenu, type MenuEntry, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { burstConfetti } from '@/lib/confetti';
import { downloadCsv } from '@/lib/csv';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { calibrationScope, canViewObjective, isAbove, reviewAccess, type ReviewAccess } from '@/performance/access';
import { BOX_META, COMPETENCIES, POTENTIALS, RATING, SCORE_LABEL, potentialToAxis, ratingToAxis } from '@/performance/constants';
import { boxKey, distributionNote, performanceDistribution, placementFor, type Placement } from '@/performance/ninebox';
import { peerThemes, type PeerThemes } from '@/performance/nova';
import { rollupStatus } from '@/performance/okr';
import { objectivesOwnedBy, previousCycle, primaryCycle, rollup, type ObjectiveRollup } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { BoxAxis, CompetencyId, Cycle, KrStatus, PerfData, Review, Score5 } from '@/performance/types';
import { report, shortDate, useMinute, usePerfCtx, useUndo, type PerfCtx } from './hooks';
import { Kbd, NovaBox, NovaThinking, OkrRing, PfModal, Seg, StatusChip, useNova } from './ui';
import './styles/calibration.css';

/* ───────────────────────── Board model ───────────────────────── */

const PERF_LABEL: Record<BoxAxis, string> = { 1: 'Low', 2: 'Moderate', 3: 'High' };
const POT_LABEL: Record<BoxAxis, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };
const AXIS_TONE: Record<BoxAxis, string> = { 3: 'violet', 2: 'blue', 1: 'amber' };

interface BoxDef {
  key: string;
  perf: BoxAxis;
  pot: BoxAxis;
  label: string;
  blurb: string;
  tone: Tone;
}

/** Row-major from the top-left: potential high → low, performance low → high. */
const BOXES: BoxDef[] = ([3, 2, 1] as BoxAxis[]).flatMap((pot) =>
  ([1, 2, 3] as BoxAxis[]).map((perf) => {
    const key = boxKey(perf, pot);
    const m = BOX_META[key];
    return { key, perf, pot, label: m.label, blurb: m.blurb, tone: m.tone as Tone };
  }),
);
const BOX: Record<string, BoxDef> = Object.fromEntries(BOXES.map((b) => [b.key, b]));

type ShownPlacement = Placement & { pending?: boolean };

interface Person {
  u: User;
  review?: Review;
  prev?: Review;
  access: ReviewAccess | null;
  placement: Placement | null;
}

interface Move {
  userId: string;
  reviewId: string;
  from: Placement | null;
  perf: BoxAxis;
  pot: BoxAxis;
  mode: 'move' | 'confirm' | 'note';
}

type Slices = Pick<PerfData, 'objectives' | 'keyResults' | 'periods' | 'cycleFeedback' | 'reviews' | 'cycles'>;

/** Hide the manager's rating from viewers who may not see the manager part yet. */
function visibleReview(ctx: PerfCtx, r: Review | undefined): Review | undefined {
  if (!r) return r;
  if (reviewAccess(ctx.v, ctx.users, r).seeManager) return r;
  return { ...r, manager: { ...r.manager, overall: undefined, potential: undefined } };
}

const firstOf = (u: User) => u.name.split(' ')[0];

/* ───────────────────────── Signals (packet summary) ───────────────────────── */

interface Signals {
  okrs: ObjectiveRollup[];
  okrAvg: number | null;
  okrStatus: KrStatus | null;
  themes: PeerThemes | null;
  peerTotal: number;
  peerOpen: number;
}

function signalsFor(p: Person, ctx: PerfCtx, cycle: Cycle, d: Slices, now: number): Signals {
  const owned = objectivesOwnedBy(d, p.u.id, cycle.periodId).filter((o) => canViewObjective(ctx.v, ctx.users, o));
  const okrs = owned.map((o) => rollup(d, o, now)).sort((a, b) => b.progress - a.progress);
  const okrAvg = okrs.length ? okrs.reduce((s, r) => s + r.progress, 0) / okrs.length : null;
  const okrStatus = okrs.length ? rollupStatus(okrs.map((r) => r.status)) : null;
  const peers = d.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.subjectId === p.u.id && f.status !== 'proposed' && f.status !== 'declined');
  const named = p.access?.seePeers === 'named';
  return {
    okrs,
    okrAvg,
    okrStatus,
    themes: named ? peerThemes(peers) : null,
    peerTotal: peers.length,
    peerOpen: peers.filter((f) => f.status === 'requested').length,
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const STATUS_WORD: Record<KrStatus, string> = { 'on-track': 'on track', 'at-risk': 'at risk', 'off-track': 'off track', done: 'done' };

/** Nova: a short, evidence-based calibration note for a move. */
function draftNoteFor(p: Person, s: Signals, move: Move): string {
  const to = BOX[boxKey(move.perf, move.pot)];
  const from = move.from ? BOX[boxKey(move.from.performance, move.from.potential)] : null;
  const bits: string[] = [];
  const o = p.access?.seeManager ? p.review?.manager.overall : undefined;
  const pot = p.access?.seeManager ? p.review?.manager.potential : undefined;
  if (o) bits.push(`manager rated ${RATING[o].label}${pot ? ` / ${pot} potential` : ''}`);
  if (s.okrAvg !== null && s.okrStatus) bits.push(`OKRs at ${pct(s.okrAvg)} (${STATUS_WORD[s.okrStatus]})`);
  const strength = s.themes?.strengths[0];
  if (strength && s.themes) bits.push(`peers highlight ${strength.theme.toLowerCase()} (${strength.count} of ${s.themes.responses})`);
  const growth = s.themes?.growth[0];
  if (growth) bits.push(`growth edge: ${growth.theme.toLowerCase()}`);
  const head = move.mode === 'move' && from ? `${from.label} → ${to.label}` : move.mode === 'move' ? `Placed as ${to.label}` : `Confirmed as ${to.label}`;
  return bits.length ? `${head}: ${bits.join('; ')}.` : `${head}. ${to.blurb}`;
}

/* ───────────────────────── Keyboard dragging: jump box to box ───────────────────────── */

const DIRS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const boxCoordinates: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers } }) => {
  const dir = DIRS[event.code];
  if (!dir || !collisionRect) return undefined;
  event.preventDefault();
  const cx0 = collisionRect.left + collisionRect.width / 2;
  const cy0 = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number; d: number } | null = null;
  for (const c of droppableContainers.getEnabled()) {
    const r = droppableRects.get(c.id);
    if (!r) continue;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const along = (x - cx0) * dir[0] + (y - cy0) * dir[1];
    if (along < 12) continue;
    const across = Math.abs(dir[0] ? y - cy0 : x - cx0);
    const d = along + across * 2.5;
    if (!best || d < best.d) best = { x, y, d };
  }
  if (!best) return undefined;
  return { x: best.x - collisionRect.width / 2, y: best.y - collisionRect.height / 2 };
};

const collide: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args));

/* ───────────────────────── View ───────────────────────── */

export function CalibrationView() {
  const ctx = usePerfCtx();
  if (!ctx) return null;
  return <CalibrationBoard ctx={ctx} />;
}

function CalibrationBoard({ ctx }: { ctx: PerfCtx }) {
  const now = useMinute();
  const navigate = useNavigate();
  const cycles = usePerf((s) => s.cycles);
  const periods = usePerf((s) => s.periods);
  const reviews = usePerf((s) => s.reviews);
  const cycleFeedback = usePerf((s) => s.cycleFeedback);
  const objectives = usePerf((s) => s.objectives);
  const keyResults = usePerf((s) => s.keyResults);
  const slices: Slices = useMemo(() => ({ cycles, periods, reviews, cycleFeedback, objectives, keyResults }), [cycles, periods, reviews, cycleFeedback, objectives, keyResults]);
  const [params, setParams] = useSearchParams();
  const narrow = useMediaQuery('(max-width: 1100px)');

  const primary = useMemo(() => primaryCycle({ cycles, periods }, now), [cycles, periods, now]);
  const lastClosed = useMemo(() => previousCycle({ cycles, periods }, primary), [cycles, periods, primary]);
  const cycleParam = params.get('cycle');
  const cycle = useMemo(() => cycles.find((c) => c.id === cycleParam && c.status !== 'draft') ?? primary ?? lastClosed ?? null, [cycles, cycleParam, primary, lastClosed]);
  const prevCycle = useMemo(() => (cycle ? previousCycle({ cycles, periods }, cycle) : null), [cycles, periods, cycle]);
  const periodLabel = useCallback((c: Cycle | null) => (c ? (periods.find((p) => p.id === c.periodId)?.label ?? c.name) : ''), [periods]);

  const locked = !!cycle?.calibrationLockedAt;
  const closed = !!cycle && cycle.status !== 'active';
  const readOnly = !cycle || locked || closed;

  const [dept, setDept] = useState('all');
  const [mgr, setMgr] = useState('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [panelHidden, setPanelHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [move, setMove] = useState<Move | null>(null);
  const [note, setNote] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const menu = useContextMenu();

  /* ── People in scope ── */
  const people: Person[] = useMemo(() => {
    if (!cycle) return [];
    return calibrationScope(ctx.v, ctx.users, cycle.participantIds)
      .map((id) => ctx.user(id))
      .filter((u): u is User => !!u && u.active)
      .map((u) => {
        const review = reviews.find((r) => r.cycleId === cycle.id && r.employeeId === u.id);
        const prev = prevCycle ? reviews.find((r) => r.cycleId === prevCycle.id && r.employeeId === u.id) : undefined;
        return {
          u,
          review,
          prev,
          access: review ? reviewAccess(ctx.v, ctx.users, review) : null,
          placement: placementFor(u.id, visibleReview(ctx, review), visibleReview(ctx, prev)),
        };
      })
      .sort((a, b) => a.u.name.localeCompare(b.u.name));
  }, [ctx, cycle, prevCycle, reviews]);

  const departments = useMemo(() => [...new Set(people.map((p) => p.u.department))].sort(), [people]);
  const managers = useMemo(
    () =>
      [...new Set(people.map((p) => p.u.managerId).filter((id): id is string => !!id))]
        .map((id) => ctx.user(id))
        .filter((u): u is User => !!u)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people, ctx],
  );

  const shown = useMemo(() => people.filter((p) => (dept === 'all' || p.u.department === dept) && (mgr === 'all' || isAbove(ctx.users, mgr, p.u.id))), [people, dept, mgr, ctx.users]);
  const ql = q.trim().toLowerCase();
  const isMatch = useCallback((p: Person) => !ql || `${p.u.name} ${p.u.title} ${p.u.department}`.toLowerCase().includes(ql), [ql]);
  const matchCount = ql ? shown.filter(isMatch).length : shown.length;

  const placementOf = useCallback(
    (p: Person): ShownPlacement | null => (move && move.userId === p.u.id ? { userId: p.u.id, performance: move.perf, potential: move.pot, source: 'calibrated', pending: true } : p.placement),
    [move],
  );

  const board = useMemo(() => {
    const cells: Record<string, Person[]> = Object.fromEntries(BOXES.map((b) => [b.key, [] as Person[]]));
    const tray: Person[] = [];
    for (const p of shown) {
      const pl = placementOf(p);
      if (pl) cells[boxKey(pl.performance, pl.potential)].push(p);
      else tray.push(p);
    }
    return { cells, tray };
  }, [shown, placementOf]);

  const livePlaced = useMemo(() => shown.map(placementOf).filter((x): x is ShownPlacement => !!x), [shown, placementOf]);
  const committedPlaced = useMemo(() => shown.map((p) => p.placement).filter((x): x is Placement => !!x), [shown]);
  const maxCount = Math.max(1, ...BOXES.map((b) => board.cells[b.key].length));

  const selected = people.find((p) => p.u.id === selId) ?? null;
  const activePerson = activeId ? (people.find((p) => p.u.id === activeId) ?? null) : null;
  const movePerson = move ? (people.find((p) => p.u.id === move.userId) ?? null) : null;
  const moveSignals = useMemo(() => (movePerson && cycle ? signalsFor(movePerson, ctx, cycle, slices, now) : null), [movePerson, cycle, ctx, slices, now]);

  // Selection that falls out of scope (filters / cycle switch) is dropped.
  useEffect(() => {
    if (selId && !people.some((p) => p.u.id === selId)) setSelId(null);
  }, [people, selId]);

  // Keep keyboard focus on a chip after it moves boxes (it re-mounts in the new cell).
  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = document.querySelector<HTMLElement>(`[data-chip="${pendingFocus.current}"]`);
    pendingFocus.current = null;
    el?.focus({ preventScroll: true });
  });

  const flash = (id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1400);
  };

  const select = useCallback(
    (id: string, openSheet = true) => {
      setSelId(id);
      if (narrow && openSheet) setSheetOpen(true);
    },
    [narrow],
  );

  const togglePanel = () => (narrow ? setSheetOpen((o) => !o) : setPanelHidden((h) => !h));
  const showInsp = narrow ? sheetOpen : !panelHidden;

  const readOnlyReason = locked ? 'Calibration is locked — placements are final.' : closed ? 'This cycle is closed — the board is read-only.' : '';

  /* ── Moves ── */
  const startMove = (p: Person, perf: BoxAxis, pot: BoxAxis, mode?: Move['mode']) => {
    if (readOnly) {
      toast.info(readOnlyReason);
      return;
    }
    if (!p.review) {
      toast.error(`${firstOf(p.u)} has no review packet in this cycle.`);
      return;
    }
    const same = !!p.placement && p.placement.performance === perf && p.placement.potential === pot;
    const m: Move['mode'] = mode ?? (!same ? 'move' : p.placement?.source === 'calibrated' ? 'note' : 'confirm');
    if (same && m === 'note' && !mode) return; // dropped back where they already are
    setNote(m === 'move' ? '' : (p.review.calibration?.note ?? ''));
    setMove({ userId: p.u.id, reviewId: p.review.id, from: p.placement, perf, pot, mode: m });
    setSelId(p.u.id);
  };

  const cancelMove = () => {
    setMove(null);
    setNote('');
  };

  const confirmMove = () => {
    if (!move) return;
    const res = usePerf.getState().calibrate(move.reviewId, move.perf, move.pot, note);
    if (report(res, move.mode === 'note' ? 'Calibration note saved' : undefined)) {
      flash(move.userId);
      setAnnounce(`${movePerson?.u.name ?? 'Person'} placed in ${BOX[boxKey(move.perf, move.pot)].label}.`);
      setMove(null);
      setNote('');
    }
  };

  const clearCal = (p: Person) => {
    const cal = p.review?.calibration;
    if (!p.review || !cal) return;
    const reviewId = p.review.id;
    const res = usePerf.getState().clearCalibration(reviewId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    flash(p.u.id);
    useUndo.getState().show(`Calibration cleared for ${firstOf(p.u)}`, () => usePerf.getState().calibrate(reviewId, cal.performance, cal.potential, cal.note));
  };

  const arrowMove = (e: KeyboardEvent, dPerf: number, dPot: number) => {
    if (!selId || activeId || move || confirmLock || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[role="tablist"],[role="radiogroup"],[role="menu"],[role="listbox"],.neo-pop,.modal,select,.pf-cal-picker')) return;
    const p = people.find((x) => x.u.id === selId);
    if (!p || !p.review) return;
    e.preventDefault();
    if (readOnly) {
      toast.info(readOnlyReason);
      return;
    }
    if (!p.placement) {
      toast.info(`Pick a box for ${firstOf(p.u)} first`, 'Drag them onto the grid or use the box picker in the panel.');
      if (narrow) setSheetOpen(true);
      else setPanelHidden(false);
      return;
    }
    const perf = p.placement.performance + dPerf;
    const pot = p.placement.potential + dPot;
    if (perf < 1 || perf > 3 || pot < 1 || pot > 3) {
      setAnnounce(`${p.u.name} is already at the edge of the grid.`);
      return;
    }
    const hadFocus = (document.activeElement as HTMLElement | null)?.dataset?.chip === p.u.id;
    const res = usePerf.getState().calibrate(p.review.id, perf as BoxAxis, pot as BoxAxis, p.review.calibration?.note);
    if (report(res, '')) {
      flash(p.u.id);
      const label = BOX[boxKey(perf as BoxAxis, pot as BoxAxis)].label;
      setAnnounce(`${p.u.name} moved to ${label}.`);
      if (hadFocus) pendingFocus.current = p.u.id;
    }
  };

  useHotkeys({
    s: (e) => {
      e.preventDefault();
      searchRef.current?.focus();
    },
    '[': togglePanel,
    ']': togglePanel,
    arrowleft: (e) => arrowMove(e, -1, 0),
    arrowright: (e) => arrowMove(e, 1, 0),
    arrowup: (e) => arrowMove(e, 0, 1),
    arrowdown: (e) => arrowMove(e, 0, -1),
    escape: () => {
      if (move || activeId || confirmLock) return;
      if (narrow && sheetOpen) setSheetOpen(false);
      else setSelId(null);
    },
  });

  /* ── Drag & drop ── */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: boxCoordinates }));
  const nameOfDrag = (id: string | number) => people.find((p) => `chip:${p.u.id}` === String(id))?.u.name ?? 'Person';
  const boxOfDrop = (id: string | number) => BOX[String(id).replace(/^box:/, '')]?.label ?? 'a box';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOfDrag(active.id)}. Use the arrow keys to choose a box, then Space to drop.`,
    onDragOver: ({ active, over }) => (over ? `${nameOfDrag(active.id)} is over ${boxOfDrop(over.id)}.` : `${nameOfDrag(active.id)} is not over a box.`),
    onDragEnd: ({ active, over }) => (over ? `${nameOfDrag(active.id)} dropped on ${boxOfDrop(over.id)}. Add a note to confirm.` : `${nameOfDrag(active.id)} was dropped outside the grid.`),
    onDragCancel: ({ active }) => `Moving ${nameOfDrag(active.id)} was cancelled.`,
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id).replace(/^chip:/, '');
    setActiveId(id);
    setSelId(id);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id).replace(/^chip:/, '');
    setActiveId(null);
    const over = e.over ? String(e.over.id) : '';
    if (!over.startsWith('box:')) return;
    const b = BOX[over.slice(4)];
    const p = people.find((x) => x.u.id === id);
    if (b && p) startMove(p, b.perf, b.pot);
  };

  /* ── Context menu ── */
  const openMenu = (e: ReactMouseEvent<HTMLElement>, p: Person) => {
    e.preventDefault();
    select(p.u.id, false);
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientX === 0 && e.clientY === 0 ? { clientX: r.left + r.width / 2, clientY: r.bottom } : { clientX: e.clientX, clientY: e.clientY };
    const cur = placementOf(p);
    const items: MenuEntry[] = [
      { kind: 'label', label: readOnly ? 'Placement · read-only' : `Move ${firstOf(p.u)} to` },
      ...BOXES.map<MenuEntry>((b) => ({
        label: b.label,
        hint: `${PERF_LABEL[b.perf].slice(0, 3)} · ${POT_LABEL[b.pot].slice(0, 3)}`,
        checked: !!cur && cur.performance === b.perf && cur.potential === b.pot,
        disabled: readOnly || !p.review,
        onSelect: () => startMove(p, b.perf, b.pot),
      })),
      { kind: 'sep' },
    ];
    if (p.review) items.push({ label: 'Open review packet', icon: <FileText />, onSelect: () => navigate(`/performance/checkins/${p.review!.id}`) });
    items.push({ label: 'Clear calibration', icon: <Eraser />, danger: true, disabled: readOnly || !p.review?.calibration, onSelect: () => clearCal(p) });
    menu.open(at, items);
  };

  /* ── Lock / finalize ── */
  const doLock = () => {
    if (!cycle) return;
    const locking = !locked;
    if (report(usePerf.getState().setCalibrationLock(cycle.id, locking))) {
      setConfirmLock(false);
      if (locking) burstConfetti();
    }
  };

  /* ── Export ── */
  const exportCsv = () => {
    if (!cycle) return;
    const rows = shown.map((p) => {
      const pl = p.placement;
      const b = pl ? BOX[boxKey(pl.performance, pl.potential)] : null;
      const m = p.access?.seeManager ? p.review?.manager : undefined;
      return {
        Name: p.u.name,
        Department: p.u.department,
        Manager: ctx.name(p.u.managerId),
        Box: b?.label ?? 'Not placed',
        Performance: pl ? PERF_LABEL[pl.performance] : '',
        Potential: pl ? POT_LABEL[pl.potential] : '',
        Source: pl ? (pl.source === 'calibrated' ? 'Calibrated' : pl.source === 'manager' ? 'Manager rating' : `Last cycle (${periodLabel(prevCycle)})`) : '',
        'Overall rating': m?.overall ? RATING[m.overall].label : '',
        'Calibration note': p.review?.calibration?.note ?? '',
      };
    });
    if (!rows.length) {
      toast.info('Nothing to export', 'No one matches the current filters.');
      return;
    }
    downloadCsv(`calibration-${cycle.id}.csv`, rows);
    toast.success('Placements exported', `${rows.length} people · ${cycle.name}`);
  };

  const switchCycle = (id: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (primary && id === primary.id) next.delete('cycle');
        else next.set('cycle', id);
        return next;
      },
      { replace: true },
    );
    setSelId(null);
    setMove(null);
  };

  const clearFilters = () => {
    setDept('all');
    setMgr('all');
    setQ('');
  };

  /* ── Render ── */
  if (!cycle) {
    return (
      <NeoStage>
        <NeoHead icon={<Grid3x3 />} eyebrow="Performance & OKRs" title="Talent calibration" sub="No cycle to calibrate yet" />
        <div className="neo-body neo-pad">
          <NeoEmpty icon={<Grid3x3 />} title="No check-in cycle yet" action={ctx.isAdmin ? <Link className="neo-btn neo-btn--plasma" to="/performance/cycles">Open People Ops</Link> : undefined}>
            Calibration opens once a quarterly check-in cycle is running.
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  }

  const cycleOptions = [...new Map([primary, lastClosed, cycle].filter((c): c is Cycle => !!c).map((c) => [c.id, c])).values()];
  const calibratedCount = people.filter((p) => p.review?.calibration).length;
  const lockedBy = cycle.calibrationLockedBy ? ctx.first(cycle.calibrationLockedBy) : 'People Ops';
  const scopeWord = ctx.isAdmin ? 'Org-wide' : 'Your org';
  const filtersOn = dept !== 'all' || mgr !== 'all' || !!q;

  const chipProps = {
    selId,
    flashId,
    activeId,
    isMatch,
    filtering: !!ql,
    readOnly,
    prevLabel: periodLabel(prevCycle),
    nameOf: ctx.first,
    onSelect: select,
    onMenu: openMenu,
    placementOf,
  };

  const inspector = selected ? (
    <PersonPanel
      key={selected.u.id}
      p={selected}
      shownPlacement={placementOf(selected)}
      ctx={ctx}
      cycle={cycle}
      prevLabel={periodLabel(prevCycle)}
      slices={slices}
      now={now}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
      onMove={(perf, pot) => startMove(selected, perf, pot)}
      onEditNote={() => selected.placement && startMove(selected, selected.placement.performance, selected.placement.potential, 'note')}
      onClear={() => clearCal(selected)}
      onClose={() => (narrow ? setSheetOpen(false) : setSelId(null))}
      closeLabel={narrow ? 'Close panel' : 'Back to session overview'}
    />
  ) : (
    <OverviewPanel
      people={shown}
      placementOf={placementOf}
      calibrated={calibratedCount}
      cycle={cycle}
      readOnly={readOnly}
      readOnlyReason={readOnlyReason}
      prevLabel={periodLabel(prevCycle)}
      onClose={narrow ? () => setSheetOpen(false) : undefined}
    />
  );

  return (
    <NeoStage className="pf-cal">
      <NeoHead
        icon={<Grid3x3 />}
        eyebrow={`Calibration · ${cycle.name}`}
        title="Talent calibration"
        sub={
          locked
            ? `Locked by ${lockedBy} · ${shortDate(cycle.calibrationLockedAt!)} — placements are final`
            : closed
              ? `${cycle.name} is closed — read-only history`
              : `${scopeWord} · ${people.length} ${people.length === 1 ? 'person' : 'people'} · drag to calibrate, every move is audited`
        }
        actions={
          <>
            {ctx.isAdmin && cycle.status === 'active' &&
              (locked ? (
                <button type="button" className="neo-btn neo-btn--soft" onClick={() => setConfirmLock(true)} data-qa="cal-unlock">
                  <LockOpen /> <span className="neo-btn__label">Reopen</span>
                </button>
              ) : (
                <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setConfirmLock(true)} data-qa="cal-lock" title="Lock & finalize this calibration session">
                  <Lock /> <span className="neo-btn__label">Lock &amp; finalize</span>
                </button>
              ))}
            <button type="button" className={cx('neo-iconbtn', showInsp && 'is-on')} onClick={togglePanel} aria-label="Toggle details panel" aria-pressed={showInsp} data-tip="Details panel ( ] )" data-tip-pos="bottom">
              {showInsp ? <PanelRightClose /> : <PanelRightOpen />}
            </button>
            <NeoMenu
              label="More calibration actions"
              items={[
                { label: 'Export placements (CSV)', icon: <Download />, onSelect: exportCsv },
                { label: 'Clear filters', icon: <X />, disabled: !filtersOn, onSelect: clearFilters },
                { kind: 'sep' },
                ...(ctx.isAdmin ? [{ label: 'Cycles & templates', icon: <Gauge />, onSelect: () => navigate('/performance/cycles') } as MenuEntry] : []),
                { label: 'Team insights', icon: <Users />, onSelect: () => navigate('/performance/insights') },
              ]}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions" data-qa="cal-more">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />

      <div className="neo-toolbar pf-cal-toolbar">
        {cycleOptions.length > 1 && (
          <Seg
            size="sm"
            label="Cycle"
            value={cycle.id}
            onChange={switchCycle}
            options={cycleOptions.map((c) => ({
              value: c.id,
              label: (
                <span className="pf-cal-cyc">
                  {periodLabel(c)}
                  <em data-live={c.status === 'active' || undefined}>{c.status === 'active' ? 'Live' : 'Closed'}</em>
                </span>
              ),
            }))}
          />
        )}
        <NeoSearch
          value={q}
          onChange={setQ}
          placeholder="Find a person…"
          kbd="S"
          size="sm"
          inputRef={searchRef}
          className="pf-cal-search"
          label="Find a person on the board"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const hit = shown.find(isMatch);
              if (hit) select(hit.u.id);
            }
          }}
        />
        <select className="neo-select neo-select--sm pf-cal-filter" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {managers.length > 1 && (
          <select className="neo-select neo-select--sm pf-cal-filter" value={mgr} onChange={(e) => setMgr(e.target.value)} aria-label="Filter by manager">
            <option value="all">All managers</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}’s org
              </option>
            ))}
          </select>
        )}
        {filtersOn && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={clearFilters}>
            <X /> Clear
          </button>
        )}
        <div className="pf-cal-legend" aria-label="How a placement was set">
          <span data-source="calibrated">
            <i /> Calibrated
          </span>
          <span data-source="manager">
            <i /> Manager rating
          </span>
          <span data-source="previous">
            <i /> Last cycle
          </span>
        </div>
      </div>

      <div className={cx('neo-split pf-cal-split', !narrow && !showInsp && 'pf-cal-split--solo')}>
        <div className="neo-body neo-pad pf-cal-main" data-qa="cal-main">
          {(locked || closed) && (
            <div className="pf-cal-banner" data-kind={locked ? 'locked' : 'closed'} role="status">
              {locked ? <Lock /> : <History />}
              <span className="grow">
                {locked ? (
                  <>
                    <b>Calibration is locked.</b> {lockedBy} finalized it on {shortDate(cycle.calibrationLockedAt!)} — placements are final and the board is read-only.
                  </>
                ) : (
                  <>
                    <b>{cycle.name} is closed.</b> You’re looking at last quarter’s final placements (read-only).
                  </>
                )}
              </span>
              {locked && ctx.isAdmin && cycle.status === 'active' && (
                <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setConfirmLock(true)}>
                  <LockOpen /> Reopen
                </button>
              )}
              {closed && primary && primary.id !== cycle.id && (
                <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => switchCycle(primary.id)}>
                  Back to {periodLabel(primary)} <ArrowRight />
                </button>
              )}
            </div>
          )}

          {people.length === 0 ? (
            <NeoEmpty icon={<Users />} title="No one to calibrate here" action={<Link className="neo-btn neo-btn--soft" to="/performance/team">Open your team</Link>}>
              {ctx.isAdmin ? 'This cycle has no participants yet.' : 'People in your org who take part in this cycle will appear on the board.'}
            </NeoEmpty>
          ) : (
            <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: 'To move a person, press Space or Enter to pick them up, use the arrow keys to choose a box, then press Space or Enter to drop. Press Escape to cancel.' } }}>
              <section className="neo-card pf-cal-board-card" aria-label="9-box talent grid" data-qa="cal-board">
                <div className="pf-cal-board-head">
                  <div>
                    <div className="neo-hud neo-hud--tint">9-box · {periodLabel(cycle)}</div>
                    <h2 className="pf-cal-h2">Performance × potential</h2>
                  </div>
                  <div className="pf-cal-board-stats" aria-live="polite">
                    {ql ? (
                      <span>
                        <b>{matchCount}</b> match{matchCount === 1 ? '' : 'es'}
                      </span>
                    ) : null}
                    <span>
                      <b>{livePlaced.length}</b> placed
                    </span>
                    <span>
                      <b>{calibratedCount}</b> calibrated
                    </span>
                    {board.tray.length > 0 && (
                      <span data-warn>
                        <b>{board.tray.length}</b> not placed
                      </span>
                    )}
                  </div>
                </div>
                <div className={cx('pf-cal-grid', activeId && 'is-dragging', readOnly && 'is-readonly')}>
                  <span className="pf-cal-axis pf-cal-axis--y" aria-hidden="true">
                    Potential <ArrowUp />
                  </span>
                  {([3, 2, 1] as BoxAxis[]).map((pot) => (
                    <span key={pot} className="pf-cal-tick pf-cal-tick--y" style={{ gridRow: 4 - pot }} aria-hidden="true">
                      {POT_LABEL[pot]}
                    </span>
                  ))}
                  {BOXES.map((b) => (
                    <BoxCell key={b.key} b={b} people={board.cells[b.key]} maxCount={maxCount} disabled={readOnly} {...chipProps} />
                  ))}
                  {([1, 2, 3] as BoxAxis[]).map((perf) => (
                    <span key={perf} className="pf-cal-tick pf-cal-tick--x" style={{ gridColumn: 2 + perf }} aria-hidden="true">
                      {PERF_LABEL[perf]}
                    </span>
                  ))}
                  <span className="pf-cal-axis pf-cal-axis--x" aria-hidden="true">
                    Performance <ArrowRight />
                  </span>
                </div>
              </section>

              <div className="pf-cal-lower">
                <section className="neo-card pf-cal-tray" aria-label="Not yet placed" data-qa="cal-tray">
                  <header className="pf-cal-card-head">
                    <span className="pf-cal-card-icon">
                      <Inbox />
                    </span>
                    <div className="grow">
                      <div className="neo-hud">Waiting room</div>
                      <h2 className="pf-cal-h2">Not yet placed</h2>
                    </div>
                    <span className={cx('neo-count', board.tray.length > 0 && 'neo-count--app')}>{board.tray.length}</span>
                  </header>
                  {board.tray.length ? (
                    <>
                      <div className="pf-cal-tray__chips">
                        {board.tray.map((p) => (
                          <PersonChip key={p.u.id} p={p} disabled={readOnly || !p.review} {...chipProps} />
                        ))}
                      </div>
                      <p className="neo-hint">New hires and people without a rating start here. {readOnly ? '' : 'Drag them onto the grid, or select and pick a box in the panel.'}</p>
                    </>
                  ) : (
                    <p className="pf-cal-tray__empty">
                      <CircleCheck /> Everyone in view has a placement.
                    </p>
                  )}
                </section>
                <DistributionCard placed={livePlaced} committed={committedPlaced} total={shown.length} />
              </div>

              {createPortal(
                <DragOverlay dropAnimation={null} zIndex={140}>
                  {activePerson ? (
                    <div className="neo-portal pf-cal-overlay">
                      <ChipFace p={activePerson} source="pending" />
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
            </DndContext>
          )}
          <div className="neo-sr" aria-live="polite">
            {announce}
          </div>
        </div>

        {showInsp && !narrow && (
          <aside className="neo-inspector pf-cal-insp" aria-label={selected ? `${selected.u.name} — calibration details` : 'Calibration session overview'} data-qa="cal-insp">
            {inspector}
          </aside>
        )}
      </div>

      {showInsp &&
        narrow &&
        createPortal(
          <>
            <div className="pf-cal-scrim" onClick={() => setSheetOpen(false)} aria-hidden="true" />
            <aside className="neo-portal pf-cal-sheet" aria-label={selected ? `${selected.u.name} — calibration details` : 'Calibration session overview'} data-qa="cal-insp">
              {inspector}
            </aside>
          </>,
          document.body,
        )}

      {menu.element}

      <PfModal
        open={!!move}
        onClose={cancelMove}
        icon={move?.mode === 'note' ? <PencilLine /> : <Grid3x3 />}
        width={520}
        title={
          move && movePerson
            ? move.mode === 'note'
              ? `Calibration note for ${firstOf(movePerson.u)}`
              : move.mode === 'confirm'
                ? `Confirm ${firstOf(movePerson.u)} as ${BOX[boxKey(move.perf, move.pot)].label}`
                : `Move ${firstOf(movePerson.u)} to ${BOX[boxKey(move.perf, move.pot)].label}`
            : 'Calibrate'
        }
        subtitle={
          move && movePerson
            ? movePerson.u.managerId && movePerson.u.managerId !== ctx.me.id
              ? `${ctx.first(movePerson.u.managerId)} (their manager) will be notified · recorded in the audit log`
              : 'Recorded in the audit log'
            : undefined
        }
        footer={
          <>
            <span className="pf-cal-modal-hint">
              <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd> to save
            </span>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={cancelMove}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={confirmMove} data-qa="cal-move-confirm">
              {move?.mode === 'note' ? 'Save note' : move?.mode === 'confirm' ? 'Confirm placement' : 'Record move'}
            </button>
          </>
        }
      >
        {move && movePerson && (
          <div className="pf-cal-move">
            <div className="pf-cal-move__who">
              <Avatar user={movePerson.u} size={40} />
              <div className="grow">
                <div className="pf-cal-move__name">{movePerson.u.name}</div>
                <div className="pf-faint">
                  {movePerson.u.title} · {movePerson.u.department}
                </div>
              </div>
            </div>
            <div className="pf-cal-move__path" aria-label="Placement change">
              <BoxBadge b={move.from ? BOX[boxKey(move.from.performance, move.from.potential)] : null} sub={move.from ? (move.from.source === 'calibrated' ? 'Calibrated' : move.from.source === 'manager' ? 'Manager rating' : `Last cycle`) : 'Not placed'} />
              <ArrowRight className="pf-cal-move__arrow" aria-hidden="true" />
              <BoxBadge b={BOX[boxKey(move.perf, move.pot)]} sub={`${PERF_LABEL[move.perf]} performance · ${POT_LABEL[move.pot]} potential`} active />
            </div>
            <label className="neo-field">
              <span className="neo-label">
                Calibration note <span className="pf-faint">(optional)</span>
              </span>
              <textarea
                className="neo-textarea"
                rows={3}
                value={note}
                autoFocus
                maxLength={400}
                placeholder="What evidence supports this placement? e.g. “Led the planner rewrite; ready for broader scope.”"
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    confirmMove();
                  }
                }}
              />
            </label>
            {moveSignals && (
              <button type="button" className="neo-btn neo-btn--nova neo-btn--sm pf-cal-move__nova" onClick={() => setNote(draftNoteFor(movePerson, moveSignals, move))}>
                <WandSparkles /> Draft from evidence
              </button>
            )}
          </div>
        )}
      </PfModal>

      <PfModal
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        icon={locked ? <LockOpen /> : <Lock />}
        width={480}
        title={locked ? 'Reopen calibration?' : 'Lock & finalize calibration?'}
        subtitle={cycle.name}
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setConfirmLock(false)}>
              Cancel
            </button>
            <button type="button" className={cx('neo-btn', locked ? 'neo-btn--soft' : 'neo-btn--plasma')} onClick={doLock} data-qa="cal-lock-confirm">
              {locked ? <LockOpen /> : <Lock />} {locked ? 'Reopen calibration' : 'Lock & finalize'}
            </button>
          </>
        }
      >
        <div className="pf-cal-lockbody">
          {locked ? (
            <p>Managers and People Ops will be able to move people again. Reopening is recorded in the audit log.</p>
          ) : (
            <p>Placements become final and the 9-box turns read-only for everyone. You can reopen it later — both actions are audited.</p>
          )}
          <dl className="pf-cal-lockstats">
            <div>
              <dt>Placed</dt>
              <dd>
                {people.filter((p) => p.placement).length}/{people.length}
              </dd>
            </div>
            <div>
              <dt>Calibrated</dt>
              <dd>{calibratedCount}</dd>
            </div>
            <div>
              <dt>Not placed</dt>
              <dd>{people.filter((p) => !p.placement).length}</dd>
            </div>
          </dl>
          {!locked && people.some((p) => !p.placement) && (
            <p className="pf-cal-warn">
              <CircleDashed /> {people.filter((p) => !p.placement).length} {people.filter((p) => !p.placement).length === 1 ? 'person is' : 'people are'} still in the waiting room.
            </p>
          )}
        </div>
      </PfModal>
    </NeoStage>
  );
}

/* ───────────────────────── Board pieces ───────────────────────── */

interface ChipCommon {
  selId: string | null;
  flashId: string | null;
  activeId: string | null;
  isMatch: (p: Person) => boolean;
  filtering: boolean;
  readOnly: boolean;
  prevLabel: string;
  nameOf: (id: string | undefined) => string;
  onSelect: (id: string, openSheet?: boolean) => void;
  onMenu: (e: ReactMouseEvent<HTMLElement>, p: Person) => void;
  placementOf: (p: Person) => ShownPlacement | null;
}

function BoxCell({ b, people, maxCount, disabled, ...chip }: { b: BoxDef; people: Person[]; maxCount: number; disabled: boolean } & ChipCommon) {
  const { setNodeRef, isOver } = useDroppable({ id: `box:${b.key}`, disabled });
  const count = people.length;
  return (
    <div
      ref={setNodeRef}
      className={cx('pf-cal-box', isOver && 'is-over', count === 0 && 'is-empty')}
      data-tone={b.tone}
      data-qa={`box-${b.key}`}
      style={{ gridColumn: 2 + b.perf, gridRow: 4 - b.pot, '--glow': (count / maxCount).toFixed(2) } as CSSProperties}
      role="group"
      aria-label={`${b.label}: ${count} ${count === 1 ? 'person' : 'people'}. ${b.blurb}`}
    >
      <span className="pf-cal-box__glow" aria-hidden="true" />
      <div className="pf-cal-box__head">
        <span className="pf-cal-box__label">{b.label}</span>
        <span className="pf-cal-box__count">{count}</span>
      </div>
      <p className="pf-cal-box__blurb">{b.blurb}</p>
      <div className="pf-cal-box__chips">
        {people.map((p) => (
          <PersonChip key={p.u.id} p={p} disabled={disabled || !p.review} {...chip} />
        ))}
      </div>
      {isOver && <span className="pf-cal-box__drop">Drop in {b.label}</span>}
    </div>
  );
}

function sourceText(pl: ShownPlacement | null, prevLabel: string, by?: string): string {
  if (!pl) return 'Not placed yet';
  if (pl.pending) return 'Move pending — confirm in the dialog';
  if (pl.source === 'calibrated') return by ? `Calibrated by ${by}` : 'Calibrated';
  if (pl.source === 'manager') return 'From the manager’s rating';
  return `From last cycle${prevLabel ? ` (${prevLabel})` : ''} — not rated yet`;
}

function PersonChip({ p, disabled, selId, flashId, activeId, isMatch, filtering, prevLabel, nameOf, onSelect, onMenu, placementOf }: { p: Person; disabled: boolean } & ChipCommon) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${p.u.id}`, disabled });
  const pl = placementOf(p);
  const source = pl?.pending ? 'pending' : (pl?.source ?? 'none');
  const by = p.review?.calibration ? nameOf(p.review.calibration.byId) : undefined;
  const tip = `${p.u.name} · ${sourceText(pl, prevLabel, by)}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-disabled={undefined}
      aria-roledescription={disabled ? undefined : 'draggable person'}
      aria-pressed={selId === p.u.id}
      aria-label={`${p.u.name}, ${p.u.title}. ${sourceText(pl, prevLabel, by)}`}
      className={cx('pf-cal-chip', selId === p.u.id && 'is-selected', flashId === p.u.id && 'is-flash', (isDragging || activeId === p.u.id) && 'is-dragging', filtering && !isMatch(p) && 'is-dim', filtering && isMatch(p) && 'is-match', disabled && 'is-static')}
      data-source={source}
      data-chip={p.u.id}
      data-tip={tip}
      onClick={() => onSelect(p.u.id)}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) onSelect(p.u.id, false);
      }}
      onContextMenu={(e) => onMenu(e, p)}
    >
      <ChipFace p={p} source={source} />
    </button>
  );
}

function ChipFace({ p, source }: { p: Person; source: string }) {
  return (
    <>
      <span className="pf-cal-chip__ava" data-source={source}>
        <Avatar user={p.u} size={24} />
      </span>
      <span className="pf-cal-chip__name">{firstOf(p.u)}</span>
      {source === 'previous' && <CircleDashed className="pf-cal-chip__src" aria-hidden="true" />}
    </>
  );
}

function BoxBadge({ b, sub, active }: { b: BoxDef | null; sub: string; active?: boolean }) {
  return (
    <div className={cx('pf-cal-badge', active && 'is-active', !b && 'is-none')} data-tone={b?.tone}>
      <MiniGrid at={b ? b.key : null} />
      <div className="pf-cal-badge__text">
        <b>{b?.label ?? 'Waiting room'}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function MiniGrid({ at }: { at: string | null }) {
  return (
    <span className="pf-cal-mini" aria-hidden="true">
      {BOXES.map((b) => (
        <i key={b.key} className={b.key === at ? 'on' : undefined} data-tone={b.tone} />
      ))}
    </span>
  );
}

/* ───────────────────────── Distribution ───────────────────────── */

function DistributionCard({ placed, committed, total }: { placed: Placement[]; committed: Placement[]; total: number }) {
  const perf = performanceDistribution(placed);
  const potTotal = placed.length || 1;
  const pot = ([3, 2, 1] as BoxAxis[]).map((axis) => {
    const count = placed.filter((p) => p.potential === axis).length;
    return { axis, count, share: count / potTotal };
  });
  const noteText = distributionNote(committed);
  const nova = useNova(() => noteText, noteText, 450);
  const { run } = nova;
  useEffect(() => {
    run();
  }, [noteText, run]);
  return (
    <section className="neo-card pf-cal-dist" aria-label="Distribution versus guidance" data-qa="cal-dist">
      <header className="pf-cal-card-head">
        <span className="pf-cal-card-icon">
          <Target />
        </span>
        <div className="grow">
          <div className="neo-hud">Live · {placed.length} of {total} placed</div>
          <h2 className="pf-cal-h2">Distribution vs guidance</h2>
        </div>
      </header>
      <div className="pf-cal-dist__cols">
        <div className="pf-cal-dist__col">
          <div className="pf-cal-dist__title">
            Performance <span className="pf-faint">· bar = actual, tick = guidance</span>
          </div>
          {perf.map((d) => {
            const delta = Math.round(d.delta * 100);
            const off = Math.abs(d.delta) > 0.1;
            return (
              <div key={d.axis} className="pf-cal-dist__row" data-tone={AXIS_TONE[d.axis]}>
                <span className="pf-cal-dist__label">{PERF_LABEL[d.axis]}</span>
                <span className="pf-cal-dist__track" role="img" aria-label={`${PERF_LABEL[d.axis]} performance: ${pct(d.share)} actual versus ${pct(d.guidance)} guidance`}>
                  <i style={{ width: `${d.share * 100}%` }} />
                  <b style={{ left: `${d.guidance * 100}%` }} title={`Guidance ${pct(d.guidance)}`} />
                </span>
                <span className="pf-cal-dist__val">
                  {pct(d.share)}
                  <small> / {pct(d.guidance)}</small>
                </span>
                <span className={cx('pf-cal-delta', off && 'is-off')} title={`${delta >= 0 ? '+' : ''}${delta} points vs guidance`}>
                  {delta > 0 ? <ArrowUp /> : delta < 0 ? <ArrowDown /> : <Minus />}
                  {Math.abs(delta)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="pf-cal-dist__col">
          <div className="pf-cal-dist__title">
            Potential <span className="pf-faint">· no forced curve</span>
          </div>
          {pot.map((d) => (
            <div key={d.axis} className="pf-cal-dist__row" data-tone={AXIS_TONE[d.axis]}>
              <span className="pf-cal-dist__label">{POT_LABEL[d.axis]}</span>
              <span className="pf-cal-dist__track" role="img" aria-label={`${POT_LABEL[d.axis]} potential: ${pct(d.share)}`}>
                <i style={{ width: `${d.share * 100}%` }} />
              </span>
              <span className="pf-cal-dist__val">
                {d.count}
                <small> · {pct(d.share)}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
      <NovaBox title="Calibration coach" className="pf-cal-nova">
        {nova.thinking ? <NovaThinking label="Reading the board" /> : <p className={cx(!nova.done && 'pf-caret')}>{nova.shown || noteText}</p>}
      </NovaBox>
    </section>
  );
}

/* ───────────────────────── Inspector panels ───────────────────────── */

function OverviewPanel({
  people,
  placementOf,
  calibrated,
  cycle,
  readOnly,
  readOnlyReason,
  prevLabel,
  onClose,
}: {
  people: Person[];
  placementOf: (p: Person) => ShownPlacement | null;
  calibrated: number;
  cycle: Cycle;
  readOnly: boolean;
  readOnlyReason: string;
  prevLabel: string;
  onClose?: () => void;
}) {
  const placed = people.map(placementOf);
  const bySource = {
    calibrated: placed.filter((p) => p?.source === 'calibrated').length,
    manager: placed.filter((p) => p?.source === 'manager').length,
    previous: placed.filter((p) => p?.source === 'previous').length,
    none: placed.filter((p) => !p).length,
  };
  const ratio = people.length ? calibrated / people.length : 0;
  return (
    <>
      <div className="pf-cal-insp__head">
        <div className="grow">
          <div className="neo-hud neo-hud--tint">Session</div>
          <h2 className="pf-cal-insp__title">Calibration overview</h2>
        </div>
        {onClose && (
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close panel">
            <X />
          </button>
        )}
      </div>
      <div className="pf-cal-insp__body">
        <div className="pf-cal-ov">
          <Ring value={ratio} size={92} stroke={8} label={`${Math.round(ratio * 100)}% calibrated`}>
            <span className="pf-cal-ov__pct">
              {Math.round(ratio * 100)}
              <small>%</small>
            </span>
          </Ring>
          <div className="pf-cal-ov__text">
            <b>
              {calibrated} of {people.length}
            </b>{' '}
            calibrated in {cycle.name}.
            <span className="pf-faint">{readOnly ? readOnlyReason : 'Select someone to see their packet, or drag them to a new box.'}</span>
          </div>
        </div>
        <ul className="pf-cal-ov__src">
          <li data-source="calibrated">
            <i /> Calibrated <b>{bySource.calibrated}</b>
          </li>
          <li data-source="manager">
            <i /> Manager rating <b>{bySource.manager}</b>
          </li>
          <li data-source="previous">
            <i /> From last cycle{prevLabel ? ` (${prevLabel})` : ''} <b>{bySource.previous}</b>
          </li>
          <li data-source="none">
            <i /> Not placed <b>{bySource.none}</b>
          </li>
        </ul>
        <div className="pf-cal-help">
          <div className="pf-cal-help__title">
            <Keyboard /> Fast calibration
          </div>
          <ul>
            <li>
              <span>Drag a person to a box</span>
              <span className="pf-faint">or right-click</span>
            </li>
            <li>
              <span>Move the selected person</span>
              <span>
                <Kbd>←</Kbd>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <Kbd>→</Kbd>
              </span>
            </li>
            <li>
              <span>Pick up with the keyboard</span>
              <span>
                <Kbd>Space</Kbd>
              </span>
            </li>
            <li>
              <span>Find a person</span>
              <Kbd>S</Kbd>
            </li>
            <li>
              <span>Toggle this panel</span>
              <span>
                <Kbd>[</Kbd>
                <Kbd>]</Kbd>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

function PersonPanel({
  p,
  shownPlacement,
  ctx,
  cycle,
  prevLabel,
  slices,
  now,
  readOnly,
  readOnlyReason,
  onMove,
  onEditNote,
  onClear,
  onClose,
  closeLabel,
}: {
  p: Person;
  shownPlacement: ShownPlacement | null;
  ctx: PerfCtx;
  cycle: Cycle;
  prevLabel: string;
  slices: Slices;
  now: number;
  readOnly: boolean;
  readOnlyReason: string;
  onMove: (perf: BoxAxis, pot: BoxAxis) => void;
  onEditNote: () => void;
  onClear: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  const s = useMemo(() => signalsFor(p, ctx, cycle, slices, now), [p, ctx, cycle, slices, now]);
  const r = p.review;
  const acc = p.access;
  const pl = shownPlacement;
  const box = pl ? BOX[boxKey(pl.performance, pl.potential)] : null;
  const cal = r?.calibration;
  const canMove = !readOnly && !!r;

  const themeText = s.themes && s.themes.responses > 0 ? s.themes.summary : '';
  const nova = useNova(() => themeText, `${p.u.id}:${themeText}`, 500);
  const { run } = nova;
  useEffect(() => {
    if (themeText) run();
  }, [themeText, run]);

  // Rating + competencies (only what the viewer may see).
  const mgrVisible = !!acc?.seeManager;
  const overall = mgrVisible ? r?.manager.overall : undefined;
  const potential = mgrVisible ? r?.manager.potential : undefined;
  const mgrRatings = mgrVisible && r && Object.keys(r.manager.ratings).length ? r.manager.ratings : null;
  const selfRatings = acc?.seeSelf && r && Object.keys(r.self.ratings).length ? r.self.ratings : null;
  const ratings: Partial<Record<CompetencyId, Score5>> | null = mgrRatings ?? selfRatings;

  // History: older cycles' placements.
  const order = slices.periods.map((x) => x.id);
  const idx = order.indexOf(cycle.periodId);
  const history = slices.cycles
    .filter((c) => c.id !== cycle.id && c.status === 'closed' && order.indexOf(c.periodId) > idx)
    .sort((a, b) => order.indexOf(a.periodId) - order.indexOf(b.periodId))
    .map((c) => {
      const rv = slices.reviews.find((x) => x.cycleId === c.id && x.employeeId === p.u.id);
      if (!rv) return null;
      const a = reviewAccess(ctx.v, ctx.users, rv);
      const at = rv.calibration ? boxKey(rv.calibration.performance, rv.calibration.potential) : a.seeManager && rv.manager.overall && rv.manager.potential ? boxKey(ratingToAxis(rv.manager.overall), potentialToAxis(rv.manager.potential)) : null;
      return { c, at, overall: a.seeManager ? rv.manager.overall : undefined, note: rv.calibration?.note };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const periodOf = (c: Cycle) => slices.periods.find((x) => x.id === c.periodId)?.label ?? c.name;

  return (
    <>
      <div className="pf-cal-insp__head">
        <Avatar user={p.u} size={44} />
        <div className="grow pf-cal-insp__who">
          <h2 className="pf-cal-insp__title">{p.u.name}</h2>
          <div className="pf-faint pf-cal-insp__sub">
            {p.u.title} · {p.u.department}
          </div>
          {p.u.managerId && <div className="pf-faint pf-cal-insp__sub">Reports to {ctx.name(p.u.managerId)}</div>}
        </div>
        <button type="button" className="neo-iconbtn" onClick={onClose} aria-label={closeLabel} data-tip={closeLabel} data-tip-pos="left">
          <X />
        </button>
      </div>
      <div className="pf-cal-insp__body">
        {/* Placement */}
        <div className="pf-cal-place" data-tone={box?.tone}>
          <span className="pf-cal-place__glow" aria-hidden="true" />
          <MiniGrid at={box?.key ?? null} />
          <div className="grow">
            <div className="neo-hud">{pl?.pending ? 'Pending move' : 'Placement'}</div>
            <div className="pf-cal-place__label">{box?.label ?? 'Not placed yet'}</div>
            <div className="pf-cal-place__src" data-source={pl?.pending ? 'pending' : (pl?.source ?? 'none')}>
              <i /> {pl ? sourceText(pl, prevLabel, cal ? ctx.first(cal.byId) : undefined) : 'No rating or history yet — pick a box below'}
              {cal && !pl?.pending && <span className="pf-faint"> · {relativeTime(cal.at, now)}</span>}
            </div>
          </div>
        </div>
        {box && <p className="pf-cal-place__blurb">{box.blurb}</p>}

        {/* Box picker */}
        <div className="pf-cal-sec">
          <div className="pf-cal-sec__title">
            Move to a box
            {!canMove && <span className="pf-faint"> · {readOnly ? 'read-only' : 'no packet'}</span>}
          </div>
          <div className="pf-cal-picker" role="group" aria-label={`Move ${firstOf(p.u)} to a box`}>
            {BOXES.map((b) => {
              const here = !!pl && pl.performance === b.perf && pl.potential === b.pot;
              return (
                <button key={b.key} type="button" className="pf-cal-picker__cell" data-tone={b.tone} aria-pressed={here} disabled={!canMove} onClick={() => onMove(b.perf, b.pot)} title={`${b.label} — ${b.blurb}`} data-qa={`pick-${b.key}`}>
                  {b.label}
                </button>
              );
            })}
          </div>
          {readOnly && <p className="neo-hint">{readOnlyReason}</p>}
        </div>

        {/* Calibration note */}
        {cal && (
          <div className="pf-cal-sec">
            <div className="pf-cal-sec__title">Calibration note</div>
            {cal.note ? <blockquote className="pf-cal-quote">“{cal.note}”</blockquote> : <p className="pf-faint pf-cal-small">No note yet.</p>}
            <div className="pf-cal-small pf-faint">
              {ctx.name(cal.byId)} · {shortDate(cal.at)}
            </div>
          </div>
        )}

        {/* Manager rating */}
        <div className="pf-cal-sec">
          <div className="pf-cal-sec__title">Manager review</div>
          {!r ? (
            <p className="pf-faint pf-cal-small">No review packet in this cycle.</p>
          ) : !mgrVisible ? (
            <p className="pf-faint pf-cal-small">The manager’s draft stays private until it’s submitted.</p>
          ) : overall ? (
            <div className="pf-cal-rating">
              <Chip tone={RATING[overall].tone as Tone} size="lg" solid>
                {RATING[overall].label}
              </Chip>
              {potential && (
                <Chip tone="slate" size="lg">
                  {POTENTIALS.find((x) => x.id === potential)?.label} potential
                </Chip>
              )}
              <span className="pf-faint pf-cal-small">{r.manager.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
            </div>
          ) : (
            <p className="pf-faint pf-cal-small">{r.manager.status === 'not-started' ? (p.prev ? 'Not started yet — the board uses last cycle until then.' : 'Not started yet.') : 'In draft — no rating chosen yet.'}</p>
          )}
          {ratings && (
            <ul className="pf-cal-comp" aria-label={mgrRatings ? 'Manager competency ratings' : 'Self-assessment'}>
              <li className="pf-cal-comp__cap">{mgrRatings ? 'Manager assessment' : 'Self-assessment'}</li>
              {COMPETENCIES.map((c) => {
                const v = ratings[c.id];
                return (
                  <li key={c.id} title={v ? `${v} — ${c.anchors[v - 1]}` : 'Not rated'}>
                    <span className="pf-cal-comp__label">{c.label}</span>
                    <span className="pf-cal-comp__meter" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <i key={n} className={v && n <= v ? 'on' : undefined} />
                      ))}
                    </span>
                    <span className="pf-cal-comp__val">{v ? SCORE_LABEL[v] : '—'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* OKRs */}
        <div className="pf-cal-sec">
          <div className="pf-cal-sec__title">OKR attainment · {slices.periods.find((x) => x.id === cycle.periodId)?.label}</div>
          {s.okrs.length ? (
            <div className="pf-cal-okr">
              <OkrRing value={s.okrAvg ?? 0} status={s.okrStatus ?? undefined} size={54} />
              <ul className="pf-cal-okr__list">
                {s.okrs.slice(0, 3).map((o) => (
                  <li key={o.o.id}>
                    <Link to={`/performance/okrs/${o.o.id}`} className="pf-cal-okr__title" title={o.o.title}>
                      {o.o.title}
                    </Link>
                    <span className="pf-cal-okr__meta">
                      <span className="neo-mono">{pct(o.progress)}</span>
                      <StatusChip status={o.status} />
                    </span>
                  </li>
                ))}
                {s.okrs.length > 3 && <li className="pf-faint pf-cal-small">+{s.okrs.length - 3} more</li>}
              </ul>
            </div>
          ) : (
            <p className="pf-faint pf-cal-small">No objectives owned this period.</p>
          )}
        </div>

        {/* Peer themes */}
        {s.themes && (
          <div className="pf-cal-sec">
            <div className="pf-cal-sec__title">Peer feedback</div>
            {s.themes.responses ? (
              <NovaBox title="Peer themes" hud={`${s.themes.responses} of ${s.peerTotal}`} className="pf-cal-nova">
                {nova.thinking ? <NovaThinking label="Summarising peers" /> : <p className={cx(!nova.done && 'pf-caret')}>{nova.shown || themeText}</p>}
                {(s.themes.strengths.length > 0 || s.themes.growth.length > 0) && (
                  <div className="pf-cal-themes">
                    {s.themes.strengths.slice(0, 2).map((t) => (
                      <Chip key={`s${t.theme}`} tone="success" size="sm" icon={<ArrowUp />}>
                        {t.theme} ×{t.count}
                      </Chip>
                    ))}
                    {s.themes.growth.slice(0, 1).map((t) => (
                      <Chip key={`g${t.theme}`} tone="warning" size="sm" icon={<ArrowRight />}>
                        Grow: {t.theme}
                      </Chip>
                    ))}
                  </div>
                )}
              </NovaBox>
            ) : (
              <p className="pf-faint pf-cal-small">{s.peerTotal ? `${s.peerOpen} peer request${s.peerOpen === 1 ? '' : 's'} still open — themes appear as answers arrive.` : 'No peer reviewers in this cycle yet.'}</p>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="pf-cal-sec">
            <div className="pf-cal-sec__title">History</div>
            <ol className="pf-cal-hist">
              {history.map((h) => (
                <li key={h.c.id} data-tone={h.at ? BOX[h.at].tone : undefined}>
                  <MiniGrid at={h.at} />
                  <div className="grow">
                    <div className="pf-cal-hist__top">
                      <b>{periodOf(h.c)}</b>
                      <span>{h.at ? BOX[h.at].label : 'Not placed'}</span>
                      {h.overall && <span className="pf-faint">· {RATING[h.overall].label}</span>}
                    </div>
                    {h.note && <div className="pf-faint pf-cal-small pf-clamp-2">“{h.note}”</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="pf-cal-insp__foot">
        {r && (
          <Link className="neo-btn neo-btn--soft neo-btn--sm" to={`/performance/checkins/${r.id}`} data-qa="cal-open-packet">
            <FileText /> Open packet
          </Link>
        )}
        {cal && !readOnly && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onEditNote}>
            <PencilLine /> Note
          </button>
        )}
        {cal && !readOnly && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm pf-cal-danger" onClick={onClear} data-qa="cal-clear">
            <Eraser /> Clear
          </button>
        )}
      </div>
    </>
  );
}

