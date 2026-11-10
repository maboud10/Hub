/**
 * People Ops — check-in cycles admin (performance.manage; the shell gates the route).
 *
 * Tabs (underline): Cycles · Templates · Insights (→ /performance/insights).
 *  - Cycles: the live cycle hero (phase timeline, completion per phase), a department ×
 *    phase heatmap with nudges, laggards, bulk release, close; drafts; past cycles; and
 *    the multi-step New cycle wizard (hotkey C, or `?new=1`).
 *  - Templates: edit the questions (add / remove / drag to reorder), toggle competency
 *    ratings, with the competency anchors and the rating scale as reference.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  CalendarRange,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Ellipsis,
  Eye,
  EyeOff,
  Gauge,
  Grid3x3,
  GripVertical,
  History,
  LayoutTemplate,
  Lock,
  Minus,
  Plus,
  Rocket,
  RotateCcw,
  Save,
  Scale,
  Send,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { Department, User } from '@/types';
import { Avatars, Chip, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoStage, NeoTabs, Orb, Ring, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { uid } from '@/lib/id';
import { toast } from '@/store/toast';
import { reviewAccess } from '@/performance/access';
import { COMPETENCIES, PHASE, RATINGS, SCORE_LABEL } from '@/performance/constants';
import { DEFAULT_PHASE_OFFSETS, cycleCompletion, currentPhaseKey, getPhase, makePhases, nextDeadline, timelineProgress, timelineSegments, validatePhases, type CycleCompletion, type Tally } from '@/performance/cycle';
import { primaryCycle } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { Cycle, CycleFeedback, CyclePhase, PhaseKey, Review, TemplateQuestion } from '@/performance/types';
import { dueLabel, report, shortDate, useMinute, usePerfCtx, type PerfCtx } from './hooks';
import { PfModal, Seg } from './ui';
import './styles/cycles.css';

const DAY = 86_400_000;
const pctS = (v: number) => `${Math.round(v * 100)}%`;
const ratio = (t: Tally) => (t.total ? t.done / t.total : 0);
const plural = (n: number, w: string, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;

/* ───────────────────────── People Ops tab strip (shared with Insights) ───────────────────────── */

export type PeopleOpsTab = 'cycles' | 'templates' | 'insights';

export function PeopleOpsTabs({ active }: { active: PeopleOpsTab }) {
  const navigate = useNavigate();
  return (
    <NeoTabs<PeopleOpsTab>
      variant="underline"
      label="People Ops"
      className="pf-cy-tabs"
      value={active}
      onChange={(v) => navigate(v === 'insights' ? '/performance/insights' : v === 'templates' ? '/performance/cycles?tab=templates' : '/performance/cycles')}
      items={[
        { value: 'cycles', label: 'Cycles', icon: <CalendarRange /> },
        { value: 'templates', label: 'Templates', icon: <LayoutTemplate /> },
        { value: 'insights', label: 'Insights', icon: <ChartLine /> },
      ]}
    />
  );
}

/* ───────────────────────── Phase timeline (local, compact) ───────────────────────── */

type TimelineCycle = Pick<Cycle, 'phases' | 'launchedAt' | 'createdAt' | 'status'>;

function PhaseTimeline({ cycle, now, tallies, compact }: { cycle: TimelineCycle; now: number; tallies?: Partial<Record<PhaseKey, Tally>>; compact?: boolean }) {
  const segs = timelineSegments(cycle);
  if (!segs.length) return null;
  const start = segs[0].from;
  const total = Math.max(1, segs[segs.length - 1].to - start);
  const cur = cycle.status === 'active' ? currentPhaseKey(cycle, now) : null;
  const prog = timelineProgress(cycle, now);
  const showNow = cycle.status === 'active' && prog > 0 && prog < 1;
  const curIdx = segs.findIndex((s) => s.key === cur);
  const within = curIdx >= 0 ? Math.max(0, Math.min(1, (now - segs[curIdx].from) / Math.max(1, segs[curIdx].to - segs[curIdx].from))) : prog >= 1 ? 1 : 0;
  const eq = curIdx >= 0 ? (curIdx + within) / segs.length : prog >= 1 ? 1 : 0;
  const stateOf = (s: (typeof segs)[number]) => (cycle.status === 'draft' ? 'upcoming' : now > s.to ? 'done' : s.key === cur ? 'open' : 'upcoming');
  return (
    <div className={cx('pf-cy-tl', compact && 'pf-cy-tl--compact')} style={{ '--now': `${eq * 100}%` } as CSSProperties}>
      <div className="pf-cy-tl__track" aria-hidden="true">
        {segs.map((s) => {
          const state = stateOf(s);
          const fill = state === 'done' ? 1 : state === 'open' ? Math.max(0, Math.min(1, (now - s.from) / Math.max(1, s.to - s.from))) : 0;
          return (
            <div key={s.key} className="pf-cy-tl__seg" data-state={state} style={{ '--grow': ((s.to - s.from) / total).toFixed(4) } as CSSProperties}>
              <i style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
        {showNow && (
          <span className="pf-cy-tl__now">
            <b>Today</b>
          </span>
        )}
      </div>
      <ol className="pf-cy-tl__labels" aria-label="Cycle phases">
        {segs.map((s) => {
          const state = stateOf(s);
          const t = tallies?.[s.key];
          return (
            <li key={s.key} className="pf-cy-tl__label" data-state={state} style={{ '--grow': ((s.to - s.from) / total).toFixed(4) } as CSSProperties} aria-current={state === 'open' ? 'step' : undefined}>
              <span className="pf-cy-tl__name">
                {state === 'done' && <Check aria-label="Done" />}
                <span className="pf-cy-tl__full">{PHASE[s.key].label}</span>
                <span className="pf-cy-tl__short">{PHASE[s.key].short}</span>
              </span>
              <span className="pf-cy-tl__date">
                {state === 'open' ? 'Due ' : ''}
                {shortDate(s.to)}
              </span>
              {t && t.total > 0 && (
                <span className="pf-cy-tl__tally">
                  {t.done}/{t.total}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ───────────────────────── Completion model ───────────────────────── */

type HeatPhase = 'self' | 'peer' | 'manager';
const HEAT: { key: HeatPhase; label: string; short: string }[] = [
  { key: 'self', label: 'Self-reflection', short: 'Self' },
  { key: 'peer', label: 'Peer & upward', short: 'Peers' },
  { key: 'manager', label: 'Manager review', short: 'Manager' },
];

interface Cell {
  done: number;
  total: number;
  pending: string[];
}
interface DeptRow {
  dept: string;
  people: User[];
  cells: Record<HeatPhase, Cell>;
}

const emptyCell = (): Cell => ({ done: 0, total: 0, pending: [] });

function heatRows(cycle: Cycle, ctx: PerfCtx, reviews: Review[], fb: CycleFeedback[]): DeptRow[] {
  const rows = new Map<string, DeptRow>();
  const rs = reviews.filter((r) => r.cycleId === cycle.id);
  const authored = fb.filter((f) => f.cycleId === cycle.id && (f.status === 'requested' || f.status === 'submitted'));
  for (const id of cycle.participantIds) {
    const u = ctx.user(id);
    if (!u || !u.active) continue;
    const row = rows.get(u.department) ?? { dept: u.department, people: [], cells: { self: emptyCell(), peer: emptyCell(), manager: emptyCell() } };
    row.people.push(u);
    const r = rs.find((x) => x.employeeId === u.id);
    if (r) {
      row.cells.self.total += 1;
      if (r.self.status === 'submitted') row.cells.self.done += 1;
      else row.cells.self.pending.push(u.id);
      row.cells.manager.total += 1;
      if (r.manager.status === 'submitted') row.cells.manager.done += 1;
      else if (r.managerId) row.cells.manager.pending.push(r.managerId);
    }
    const mine = authored.filter((f) => f.authorId === u.id);
    row.cells.peer.total += mine.length;
    row.cells.peer.done += mine.filter((f) => f.status === 'submitted').length;
    if (mine.some((f) => f.status === 'requested')) row.cells.peer.pending.push(u.id);
    rows.set(u.department, row);
  }
  for (const row of rows.values()) for (const k of ['self', 'peer', 'manager'] as HeatPhase[]) row.cells[k].pending = [...new Set(row.cells[k].pending)];
  return [...rows.values()].sort((a, b) => a.dept.localeCompare(b.dept));
}

interface Laggard {
  u: User;
  detail: string;
  tone: Tone;
  weight: number;
}

function laggardsFor(phase: HeatPhase, cycle: Cycle, ctx: PerfCtx, reviews: Review[], fb: CycleFeedback[], now: number): Laggard[] {
  const rs = reviews.filter((r) => r.cycleId === cycle.id);
  const out: Laggard[] = [];
  if (phase === 'self') {
    for (const r of rs) {
      const u = ctx.user(r.employeeId);
      if (!u || r.self.status === 'submitted') continue;
      out.push(r.self.status === 'draft' ? { u, detail: `Draft · edited ${relativeTime(r.self.updatedAt ?? now, now)}`, tone: 'warning', weight: 1 } : { u, detail: 'Not started', tone: 'danger', weight: 2 });
    }
  } else if (phase === 'peer') {
    const open = fb.filter((f) => f.cycleId === cycle.id && f.status === 'requested');
    for (const id of [...new Set(open.map((f) => f.authorId))]) {
      const u = ctx.user(id);
      if (!u) continue;
      const mine = open.filter((f) => f.authorId === id);
      const peer = mine.filter((f) => f.kind === 'peer').length;
      const up = mine.length - peer;
      out.push({ u, detail: [peer ? `${peer} peer` : '', up ? `${up} upward` : ''].filter(Boolean).join(' · ') + ' open', tone: mine.length > 1 ? 'danger' : 'warning', weight: mine.length });
    }
  } else {
    const byMgr = new Map<string, Review[]>();
    for (const r of rs) if (r.managerId && r.manager.status !== 'submitted') byMgr.set(r.managerId, [...(byMgr.get(r.managerId) ?? []), r]);
    for (const [id, list] of byMgr) {
      const u = ctx.user(id);
      if (!u) continue;
      const drafts = list.filter((r) => r.manager.status === 'draft').length;
      out.push({ u, detail: `${plural(list.length, 'review')} to write${drafts ? ` · ${drafts} in draft` : ''}`, tone: list.length > 2 ? 'danger' : 'warning', weight: list.length });
    }
  }
  return out.sort((a, b) => b.weight - a.weight || a.u.name.localeCompare(b.u.name));
}

function heatTone(v: number, total: number): Tone {
  if (!total) return 'slate';
  if (v >= 0.999) return 'success';
  if (v >= 0.6) return 'teal';
  if (v >= 0.3) return 'amber';
  return 'rose';
}

/* ───────────────────────── View ───────────────────────── */

export function CyclesView() {
  const ctx = usePerfCtx();
  if (!ctx) return null;
  return <CyclesAdmin ctx={ctx} />;
}

function CyclesAdmin({ ctx }: { ctx: PerfCtx }) {
  const now = useMinute();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: PeopleOpsTab = params.get('tab') === 'templates' ? 'templates' : 'cycles';
  const [wizard, setWizard] = useState(false);
  const cycles = usePerf((s) => s.cycles);
  const periods = usePerf((s) => s.periods);
  const reviews = usePerf((s) => s.reviews);
  const cycleFeedback = usePerf((s) => s.cycleFeedback);
  const live = useMemo(() => primaryCycle({ cycles, periods }, now), [cycles, periods, now]);
  const liveComp = useMemo(() => (live ? cycleCompletion(live.id, reviews, cycleFeedback) : null), [live, reviews, cycleFeedback]);

  // Deep link: /performance/cycles?new=1 opens the wizard.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setWizard(true);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('new');
        return n;
      },
      { replace: true },
    );
  }, [params, setParams]);

  useHotkeys({
    c: (e) => {
      if (wizard) return;
      e.preventDefault();
      setWizard(true);
    },
  });

  const next = live ? nextDeadline(live, now) : null;
  const sub =
    tab === 'templates'
      ? 'The questions everyone answers each quarter — edits apply to cycles using the template'
      : live && liveComp
        ? `${live.name} is live · ${pctS(ratio(liveComp.self))} of self-reflections in${next ? ` · ${PHASE[next.key].label} ${dueLabel(next.end, now).text.toLowerCase()}` : ''}`
        : 'No cycle is running — launch the next quarterly check-in';

  return (
    <NeoStage className="pf-cy">
      <NeoHead
        icon={<Gauge />}
        eyebrow="People Ops"
        title={tab === 'templates' ? 'Review templates' : 'Check-in cycles'}
        sub={sub}
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setWizard(true)} data-qa="cy-new" title="New cycle (C)">
              <Plus /> <span className="neo-btn__label">New cycle</span>
              <kbd className="kbd pf-cy-kbd">C</kbd>
            </button>
            <NeoMenu
              label="More People Ops actions"
              items={[
                { label: 'Calibration', icon: <Grid3x3 />, onSelect: () => navigate('/performance/calibration') },
                { label: 'Insights', icon: <ChartLine />, onSelect: () => navigate('/performance/insights') },
                { label: tab === 'templates' ? 'Cycles' : 'Templates', icon: tab === 'templates' ? <CalendarRange /> : <LayoutTemplate />, onSelect: () => navigate(tab === 'templates' ? '/performance/cycles' : '/performance/cycles?tab=templates') },
              ]}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-toolbar pf-cy-toolbar">
        <PeopleOpsTabs active={tab} />
      </div>
      <div className="neo-body neo-pad pf-cy-body">{tab === 'templates' ? <TemplatesTab ctx={ctx} /> : <CyclesTab ctx={ctx} now={now} onNew={() => setWizard(true)} />}</div>
      <NewCycleWizard open={wizard} onClose={() => setWizard(false)} ctx={ctx} now={now} />
    </NeoStage>
  );
}

/* ───────────────────────── Cycles tab ───────────────────────── */

type Confirm = { kind: 'release' | 'close' | 'launch'; cycle: Cycle } | null;

function CyclesTab({ ctx, now, onNew }: { ctx: PerfCtx; now: number; onNew: () => void }) {
  const cycles = usePerf((s) => s.cycles);
  const periods = usePerf((s) => s.periods);
  const reviews = usePerf((s) => s.reviews);
  const cycleFeedback = usePerf((s) => s.cycleFeedback);
  const templates = usePerf((s) => s.templates);
  const primary = useMemo(() => primaryCycle({ cycles, periods }, now), [cycles, periods, now]);
  const actives = useMemo(() => cycles.filter((c) => c.status === 'active').sort((a, b) => (a.launchedAt ?? 0) - (b.launchedAt ?? 0)), [cycles]);
  const [heroId, setHeroId] = useState<string | null>(null);
  const hero = actives.find((c) => c.id === heroId) ?? primary ?? actives[0] ?? null;
  const drafts = cycles.filter((c) => c.status === 'draft');
  const order = periods.map((p) => p.id);
  const past = cycles.filter((c) => c.status === 'closed').sort((a, b) => order.indexOf(a.periodId) - order.indexOf(b.periodId) || b.createdAt - a.createdAt);
  const periodLabel = (c: Cycle) => periods.find((p) => p.id === c.periodId)?.label ?? '';
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [nudged, setNudged] = useState<Set<string>>(() => new Set());
  const [lagPhase, setLagPhase] = useState<HeatPhase>('self');
  const [lagQ, setLagQ] = useState('');

  const comp = useMemo(() => (hero ? cycleCompletion(hero.id, reviews, cycleFeedback) : null), [hero, reviews, cycleFeedback]);
  const rows = useMemo(() => (hero ? heatRows(hero, ctx, reviews, cycleFeedback) : []), [hero, ctx, reviews, cycleFeedback]);
  const lags = useMemo(() => (hero ? laggardsFor(lagPhase, hero, ctx, reviews, cycleFeedback, now) : []), [hero, lagPhase, ctx, reviews, cycleFeedback, now]);
  const lagShown = lags.filter((l) => !lagQ.trim() || `${l.u.name} ${l.u.department} ${l.u.title}`.toLowerCase().includes(lagQ.trim().toLowerCase()));
  const curPhase = hero ? currentPhaseKey(hero, now) : null;
  const nudgePhase: HeatPhase = curPhase === 'self' || curPhase === 'peer' || curPhase === 'manager' ? curPhase : 'manager';

  useEffect(() => {
    if (curPhase === 'peer' || curPhase === 'manager') setLagPhase(curPhase);
  }, [curPhase]);

  const ready = hero ? reviews.filter((r) => r.cycleId === hero.id && r.manager.status === 'submitted' && !r.release).length : 0;
  const calibrated = hero ? reviews.filter((r) => r.cycleId === hero.id && r.calibration).length : 0;

  const sendNudge = (key: string, ids: string[], phase: PhaseKey) => {
    if (!hero) return;
    const list = [...new Set(ids)].filter((id) => id && id !== ctx.me.id);
    if (!list.length) {
      toast.info('Nothing to nudge', 'Everyone here is done with this phase.');
      return;
    }
    if (report(usePerf.getState().nudge(hero.id, list, phase))) setNudged((s) => new Set(s).add(key));
  };

  const runConfirm = () => {
    if (!confirm) return;
    const { kind, cycle } = confirm;
    if (kind === 'release') {
      const res = usePerf.getState().releaseAll(cycle.id);
      if (report(res)) burstConfetti();
    } else if (kind === 'close') {
      report(usePerf.getState().setCycleStatus(cycle.id, 'closed'));
    } else {
      const res = usePerf.getState().setCycleStatus(cycle.id, 'active');
      if (report(res, `${cycle.name} launched to ${plural(cycle.participantIds.length, 'person', 'people')}`)) burstConfetti();
    }
    setConfirm(null);
  };

  const tallies: Partial<Record<PhaseKey, Tally>> | undefined = comp
    ? { self: comp.self, peer: { done: comp.peer.done + comp.upward.done, total: comp.peer.total + comp.upward.total }, manager: comp.manager, calibration: { done: calibrated, total: comp.self.total }, release: comp.released }
    : undefined;

  return (
    <div className="pf-cy-stack">
      {actives.length > 1 && hero && (
        <div className="pf-cy-switch">
          <span className="neo-hud">Running now</span>
          <Seg size="sm" label="Live cycles" value={hero.id} onChange={(id) => setHeroId(id)} options={actives.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      )}

      {hero && comp ? (
        <section className="neo-card pf-cy-hero" aria-label={`${hero.name} overview`} data-qa="cy-hero">
          <span className="pf-cy-hero__glow" aria-hidden="true" />
          <div className="pf-cy-hero__top">
            <div className="pf-cy-hero__id">
              <div className="neo-hud neo-hud--tint">Live cycle · {periodLabel(hero)}</div>
              <h2 className="pf-cy-hero__title">{hero.name}</h2>
              <div className="pf-cy-hero__meta">
                <Chip tone="success" size="sm" icon={<Orb tone="success" pulse size={6} />}>
                  Live
                </Chip>
                <span>
                  <Users /> {plural(hero.participantIds.length, 'participant')}
                </span>
                <span>{hero.departments ? hero.departments.join(', ') : 'Everyone'}</span>
                <span>
                  <LayoutTemplate /> {templates.find((t) => t.id === hero.templateId)?.name ?? 'Template'}
                </span>
                <span>
                  {hero.peerAnonymous ? <EyeOff /> : <Eye />} {hero.peerAnonymous ? 'Anonymous peers' : 'Named peers'}
                </span>
                <span>Upward shown at {hero.upwardMin}+</span>
              </div>
            </div>
            <NextUp cycle={hero} now={now} comp={comp} />
          </div>
          <PhaseTimeline cycle={hero} now={now} tallies={tallies} />
          <div className="pf-cy-rings">
            <PhaseRing label="Self-reflections" t={comp.self} />
            <PhaseRing label="Peer feedback" t={comp.peer} />
            <PhaseRing label="Upward" t={comp.upward} />
            <PhaseRing label="Manager reviews" t={comp.manager} />
            <PhaseRing label="Released" t={comp.released} />
            <PhaseRing label="Acknowledged" t={comp.acknowledged} empty="None released yet" />
          </div>
          <div className="pf-cy-hero__actions">
            <button type="button" className="neo-btn neo-btn--soft" disabled={!ready} onClick={() => setConfirm({ kind: 'release', cycle: hero })} data-qa="cy-release" title={ready ? `Share ${plural(ready, 'submitted review')}` : 'No submitted reviews waiting'}>
              <Send /> Release {ready || ''} {ready === 1 ? 'review' : 'reviews'}
            </button>
            <Link className="neo-btn neo-btn--ghost" to="/performance/calibration">
              <Grid3x3 /> Calibration
              {hero.calibrationLockedAt ? (
                <Chip tone="violet" size="sm" icon={<Lock />}>
                  Locked
                </Chip>
              ) : null}
            </Link>
            <span className="pf-cy-grow" />
            <button type="button" className="neo-btn neo-btn--ghost pf-cy-danger" onClick={() => setConfirm({ kind: 'close', cycle: hero })} data-qa="cy-close">
              <Lock /> Close cycle
            </button>
          </div>
        </section>
      ) : (
        <section className="neo-card">
          <NeoEmpty
            icon={<CalendarRange />}
            title="No cycle is running"
            action={
              <button type="button" className="neo-btn neo-btn--plasma" onClick={onNew}>
                <Plus /> New cycle
              </button>
            }
          >
            Launch the next quarterly check-in — the wizard sets phases, participants and the template in under a minute.
          </NeoEmpty>
        </section>
      )}

      {hero && comp && (
        <div className="pf-cy-grid">
          <section className="neo-card pf-cy-card" aria-label="Completion by department">
            <header className="pf-cy-card__head">
              <span className="pf-cy-card__icon">
                <Gauge />
              </span>
              <div className="grow">
                <div className="neo-hud">Department × phase</div>
                <h2 className="pf-cy-h2">Where check-ins stand</h2>
              </div>
              <span className="pf-cy-legend" aria-hidden="true">
                <i data-tone="rose" /> 0–29% <i data-tone="amber" /> 30–59% <i data-tone="teal" /> 60–99% <i data-tone="success" /> Done
              </span>
            </header>
            <div className="pf-cy-heat" role="table" aria-label="Completion heatmap by department and phase">
              <div className="pf-cy-heat__row pf-cy-heat__row--head" role="row">
                <span role="columnheader">Department</span>
                {HEAT.map((h) => (
                  <span key={h.key} role="columnheader" data-current={h.key === curPhase || undefined}>
                    <span className="pf-cy-full">{h.label}</span>
                    <span className="pf-cy-short">{h.short}</span>
                  </span>
                ))}
                <span role="columnheader" className="pf-cy-heat__act">
                  <span className="neo-sr">Nudge department</span>
                </span>
              </div>
              {rows.map((row) => {
                const deptKey = `${row.dept}:dept:${nudgePhase}`;
                const deptPending = row.cells[nudgePhase].pending;
                return (
                  <div key={row.dept} className="pf-cy-heat__row" role="row">
                    <span className="pf-cy-heat__dept" role="rowheader">
                      <b>{row.dept}</b>
                      <Avatars users={row.people} max={3} size={20} />
                    </span>
                    {HEAT.map((h) => {
                      const c = row.cells[h.key];
                      const v = c.total ? c.done / c.total : 0;
                      const key = `${row.dept}:${h.key}`;
                      const due = getPhase(hero, h.key)?.end ?? 0;
                      const late = !!c.total && v < 1 && due < now;
                      return (
                        <span key={h.key} role="cell" className="pf-cy-cell" data-tone={heatTone(v, c.total)} style={{ '--v': v.toFixed(2) } as CSSProperties} aria-label={`${row.dept} ${h.label}: ${c.total ? `${c.done} of ${c.total} done` : 'nothing requested'}`}>
                          <span className="pf-cy-cell__val">
                            {c.total ? pctS(v) : '—'}
                            {v >= 0.999 && c.total > 0 && <CircleCheck aria-label="Complete" />}
                            {late && <TriangleAlert aria-label="Past due" />}
                          </span>
                          <span className="pf-cy-cell__sub">{c.total ? `${c.done}/${c.total}` : 'n/a'}</span>
                          {c.pending.length > 0 && (
                            <button
                              type="button"
                              className="pf-cy-cell__nudge"
                              disabled={nudged.has(key)}
                              onClick={() => sendNudge(key, c.pending, h.key)}
                              title={`Nudge ${plural(c.pending.length, 'person', 'people')}: ${c.pending.map((id) => ctx.first(id)).join(', ')}`}
                              data-qa={`nudge-${row.dept}-${h.key}`}
                            >
                              {nudged.has(key) ? <Check /> : <BellRing />}
                              <span>{nudged.has(key) ? 'Sent' : c.pending.length}</span>
                            </button>
                          )}
                        </span>
                      );
                    })}
                    <span className="pf-cy-heat__act" role="cell">
                      <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" disabled={!deptPending.length || nudged.has(deptKey)} onClick={() => sendNudge(deptKey, deptPending, nudgePhase)} title={deptPending.length ? `Nudge ${row.dept} about ${PHASE[nudgePhase].label.toLowerCase()} (${deptPending.length})` : `${row.dept} is done with ${PHASE[nudgePhase].label.toLowerCase()}`}>
                        {nudged.has(deptKey) ? <Check /> : <BellRing />}
                        <span className="pf-cy-full">{nudged.has(deptKey) ? 'Nudged' : 'Nudge'}</span>
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="neo-hint">Nudges send a friendly Hub notification only to people who aren’t done — managers for manager reviews. Each nudge is audited.</p>
          </section>

          <section className="neo-card pf-cy-card" aria-label="People who need a nudge">
            <header className="pf-cy-card__head">
              <span className="pf-cy-card__icon">
                <Clock />
              </span>
              <div className="grow">
                <div className="neo-hud">Laggards</div>
                <h2 className="pf-cy-h2">Needs a nudge</h2>
              </div>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" disabled={!lagShown.length || nudged.has(`lag:${lagPhase}`)} onClick={() => sendNudge(`lag:${lagPhase}`, lagShown.map((l) => l.u.id), lagPhase)} data-qa="cy-nudge-all">
                {nudged.has(`lag:${lagPhase}`) ? <Check /> : <BellRing />} {nudged.has(`lag:${lagPhase}`) ? 'Nudged' : `Nudge all${lagShown.length ? ` (${lagShown.length})` : ''}`}
              </button>
            </header>
            <Seg size="sm" label="Phase" value={lagPhase} onChange={setLagPhase} options={HEAT.map((h) => ({ value: h.key, label: h.short }))} />
            <NeoSearch value={lagQ} onChange={setLagQ} placeholder="Filter people…" size="sm" label="Filter laggards" />
            {lagShown.length ? (
              <ul className="pf-cy-lags">
                {lagShown.map((l) => {
                  const key = `p:${l.u.id}:${lagPhase}`;
                  const due = getPhase(hero, lagPhase)?.end;
                  return (
                    <li key={l.u.id} className="pf-cy-lag">
                      <Avatar user={l.u} size={30} />
                      <div className="grow pf-cy-lag__text">
                        <span className="pf-cy-lag__name">{l.u.name}</span>
                        <span className="pf-cy-lag__sub">
                          <Chip tone={l.tone} size="sm">
                            {l.detail}
                          </Chip>
                          <span className="pf-faint">{l.u.department}</span>
                        </span>
                      </div>
                      {due && <span className="pf-cy-lag__due">{dueLabel(due, now).text}</span>}
                      <button type="button" className="neo-iconbtn" disabled={nudged.has(key) || l.u.id === ctx.me.id} onClick={() => sendNudge(key, [l.u.id], lagPhase)} aria-label={`Nudge ${l.u.name}`} data-tip={nudged.has(key) ? 'Nudged' : `Nudge ${l.u.name.split(' ')[0]}`} data-tip-pos="left">
                        {nudged.has(key) ? <Check /> : <BellRing />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <NeoEmpty compact icon={<CircleCheck />} title={lagQ ? `No one matches “${lagQ}”` : 'Everyone is on track'}>
                {lagQ ? 'Try another name or department.' : `No one is behind on ${PHASE[lagPhase].label.toLowerCase()} right now.`}
              </NeoEmpty>
            )}
          </section>
        </div>
      )}

      {drafts.length > 0 && (
        <section className="neo-card pf-cy-card" aria-label="Draft cycles">
          <header className="pf-cy-card__head">
            <span className="pf-cy-card__icon">
              <Save />
            </span>
            <div className="grow">
              <div className="neo-hud">Drafts</div>
              <h2 className="pf-cy-h2">Ready when you are</h2>
            </div>
          </header>
          <div className="pf-cy-drafts">
            {drafts.map((d) => (
              <article key={d.id} className="pf-cy-draft">
                <div className="pf-cy-draft__top">
                  <div className="grow">
                    <b>{d.name}</b>
                    <span className="pf-faint">
                      {periodLabel(d)} · {plural(d.participantIds.length, 'participant')} · saved {relativeTime(d.createdAt, now)} by {ctx.first(d.createdBy)}
                    </span>
                  </div>
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setConfirm({ kind: 'launch', cycle: d })}>
                    <Rocket /> Launch
                  </button>
                </div>
                <PhaseTimeline cycle={d} now={now} compact />
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="pf-cy-past" aria-label="Past cycles">
        <div className="pf-cy-section-head">
          <History />
          <h2 className="pf-cy-h2">Past cycles</h2>
          <span className="neo-count">{past.length}</span>
        </div>
        {past.length ? (
          <div className="pf-cy-past__grid">
            {past.map((c) => (
              <PastCycleCard key={c.id} c={c} ctx={ctx} label={periodLabel(c)} reviews={reviews} fb={cycleFeedback} />
            ))}
          </div>
        ) : (
          <NeoEmpty compact icon={<History />} title="No closed cycles yet">
            Closed cycles keep their released packets and final 9-box for reference.
          </NeoEmpty>
        )}
      </section>

      <PfModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        width={480}
        icon={confirm?.kind === 'release' ? <Send /> : confirm?.kind === 'close' ? <Lock /> : <Rocket />}
        title={confirm?.kind === 'release' ? `Release ${plural(ready, 'review')}?` : confirm?.kind === 'close' ? `Close ${confirm.cycle.name}?` : `Launch ${confirm?.cycle.name ?? ''}?`}
        subtitle={confirm?.cycle.name}
        footer={
          <>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button type="button" className={cx('neo-btn', confirm?.kind === 'close' ? 'neo-btn--danger' : 'neo-btn--plasma')} onClick={runConfirm} data-qa="cy-confirm">
              {confirm?.kind === 'release' ? `Release ${ready}` : confirm?.kind === 'close' ? 'Close cycle' : 'Launch now'}
            </button>
          </>
        }
      >
        {confirm && <ConfirmBody c={confirm} ready={ready} now={now} reviews={reviews} />}
      </PfModal>
    </div>
  );
}

function ConfirmBody({ c, ready, now, reviews }: { c: NonNullable<Confirm>; ready: number; now: number; reviews: Review[] }) {
  const releasePhase = getPhase(c.cycle, 'release');
  if (c.kind === 'release')
    return (
      <div className="pf-cy-confirm">
        <p>
          Employees get a Hub notification, can read their packet, acknowledge it and reply. {plural(ready, 'submitted manager review')} {ready === 1 ? 'is' : 'are'} waiting.
        </p>
        {releasePhase && now < releasePhase.start && (
          <p className="pf-cy-warn">
            <TriangleAlert /> The release phase opens {shortDate(releasePhase.start)} — releasing now shares packets before calibration finishes.
          </p>
        )}
      </div>
    );
  if (c.kind === 'close') {
    const unreleased = reviews.filter((r) => r.cycleId === c.cycle.id && !r.release).length;
    return (
      <div className="pf-cy-confirm">
        <p>Self-reflections, peer feedback and manager reviews lock, and the 9-box becomes read-only history. This is audited.</p>
        {unreleased > 0 && (
          <p className="pf-cy-warn">
            <TriangleAlert /> {plural(unreleased, 'packet')} {unreleased === 1 ? 'hasn’t' : 'haven’t'} been released yet.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="pf-cy-confirm">
      <p>
        {plural(c.cycle.participantIds.length, 'person', 'people')} will be notified that {c.cycle.name} is open, with their self-reflection deadline.
      </p>
    </div>
  );
}

function NextUp({ cycle, now, comp }: { cycle: Cycle; now: number; comp: CycleCompletion }) {
  const next = nextDeadline(cycle, now);
  if (!next) return null;
  const d = dueLabel(next.end, now);
  const t = next.key === 'self' ? comp.self : next.key === 'peer' ? { done: comp.peer.done + comp.upward.done, total: comp.peer.total + comp.upward.total } : next.key === 'manager' ? comp.manager : next.key === 'release' ? comp.released : null;
  return (
    <div className="pf-cy-next" data-tone={d.tone}>
      <span className="neo-hud">Next deadline</span>
      <b>{PHASE[next.key].label}</b>
      <span className="pf-cy-next__due">
        <Clock /> {d.text} · {shortDate(next.end)}
      </span>
      {t && t.total > 0 && (
        <span className="pf-faint">
          {t.done} of {t.total} done · {t.total - t.done} to go
        </span>
      )}
    </div>
  );
}

function PhaseRing({ label, t, empty }: { label: string; t: Tally; empty?: string }) {
  const v = ratio(t);
  return (
    <div className="pf-cy-ring">
      <Ring value={v} size={58} stroke={6} label={`${label}: ${t.done} of ${t.total}`}>
        <span className="pf-cy-ring__pct">{t.total ? Math.round(v * 100) : '–'}</span>
      </Ring>
      <div className="pf-cy-ring__text">
        <b>{label}</b>
        <span>{t.total ? `${t.done} of ${t.total}` : (empty ?? 'None requested')}</span>
      </div>
    </div>
  );
}

function PastCycleCard({ c, ctx, label, reviews, fb }: { c: Cycle; ctx: PerfCtx; label: string; reviews: Review[]; fb: CycleFeedback[] }) {
  const comp = cycleCompletion(c.id, reviews, fb);
  const rated = reviews.filter((r) => r.cycleId === c.id && r.manager.overall && reviewAccess(ctx.v, ctx.users, r).seeManager);
  const mix = RATINGS.map((x) => ({ ...x, count: rated.filter((r) => r.manager.overall === x.id).length }));
  return (
    <article className="neo-card pf-cy-pastcard">
      <div className="pf-cy-pastcard__top">
        <div className="grow">
          <div className="neo-hud">{label} · closed</div>
          <h3 className="pf-cy-pastcard__title">{c.name}</h3>
        </div>
        <Chip tone="slate" size="sm" icon={<Lock />}>
          Final
        </Chip>
      </div>
      <dl className="pf-cy-pastcard__stats">
        <div>
          <dt>Participants</dt>
          <dd>{c.participantIds.length}</dd>
        </div>
        <div>
          <dt>Self</dt>
          <dd>{pctS(ratio(comp.self))}</dd>
        </div>
        <div>
          <dt>Released</dt>
          <dd>
            {comp.released.done}/{comp.released.total}
          </dd>
        </div>
        <div>
          <dt>Acknowledged</dt>
          <dd>{pctS(ratio(comp.acknowledged))}</dd>
        </div>
      </dl>
      {rated.length > 0 && (
        <div className="pf-cy-mix" aria-label="Rating mix">
          <div className="pf-cy-mix__bar" role="img" aria-label={mix.map((m) => `${m.label} ${m.count}`).join(', ')}>
            {mix
              .filter((m) => m.count)
              .map((m) => (
                <i key={m.id} data-tone={m.tone} style={{ flexGrow: m.count }} title={`${m.label}: ${m.count}`} />
              ))}
          </div>
          <div className="pf-cy-mix__legend">
            {mix
              .filter((m) => m.count)
              .map((m) => (
                <span key={m.id} data-tone={m.tone}>
                  <i /> {m.label} {m.count}
                </span>
              ))}
          </div>
        </div>
      )}
      <div className="pf-cy-pastcard__foot">
        <span className="pf-faint">{c.calibrationLockedAt ? `Calibration locked ${shortDate(c.calibrationLockedAt)}` : 'Not calibrated'}</span>
        <Link className="neo-btn neo-btn--ghost neo-btn--xs" to={`/performance/calibration?cycle=${c.id}`}>
          <Grid3x3 /> View 9-box
        </Link>
      </div>
    </article>
  );
}

/* ───────────────────────── New cycle wizard ───────────────────────── */

const STEPS = ['Basics', 'Phases & dates', 'Participants', 'Template & settings', 'Review & launch'] as const;
const PHASE_ORDER: PhaseKey[] = ['self', 'peer', 'manager', 'calibration', 'release'];

const toISO = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const atTime = (iso: string, h: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, h, 0, 0, 0).getTime();
};
const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function defaultEnds(launchISO: string): Record<PhaseKey, string> {
  const ps = makePhases(atTime(launchISO, 9), DEFAULT_PHASE_OFFSETS);
  return Object.fromEntries(ps.map((p) => [p.key, toISO(p.end)])) as Record<PhaseKey, string>;
}

function NewCycleWizard({ open, onClose, ctx, now }: { open: boolean; onClose: () => void; ctx: PerfCtx; now: number }) {
  const periods = usePerf((s) => s.periods);
  const templates = usePerf((s) => s.templates);
  const cycles = usePerf((s) => s.cycles);
  const today = toISO(now);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '');
  const [launchDay, setLaunchDay] = useState(today);
  const [ends, setEnds] = useState<Record<PhaseKey, string>>(() => defaultEnds(today));
  const [scope, setScope] = useState<'all' | 'departments'>('all');
  const [depts, setDepts] = useState<Department[]>([]);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [peerAnonymous, setPeerAnonymous] = useState(true);
  const [upwardMin, setUpwardMin] = useState(3);
  const [busy, setBusy] = useState(false);

  const suggestName = (pid: string) => {
    const label = periods.find((p) => p.id === pid)?.label ?? 'Quarterly';
    const taken = new Set(cycles.map((c) => c.name.toLowerCase()));
    for (const n of [`${label} Check-in`, `${label} Mid-quarter pulse`, `${label} Check-in (2)`]) if (!taken.has(n.toLowerCase())) return n;
    return `${label} Check-in (${cycles.length + 1})`;
  };

  // Fresh wizard every time it opens.
  useEffect(() => {
    if (!open) return;
    const t = toISO(Date.now());
    setStep(0);
    setReached(0);
    setTouched(false);
    const pid = periods[0]?.id ?? '';
    setPeriodId(pid);
    setName(suggestName(pid));
    setLaunchDay(t);
    setEnds(defaultEnds(t));
    setScope('all');
    setDepts([]);
    setTemplateId(templates[0]?.id ?? '');
    setPeerAnonymous(true);
    setUpwardMin(3);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const launchAt = launchDay === today ? now : atTime(launchDay, 9);
  const phases: CyclePhase[] = useMemo(() => {
    const end = (k: PhaseKey) => atTime(ends[k], 18);
    return [
      { key: 'self', start: launchAt, end: end('self') },
      { key: 'peer', start: launchAt, end: end('peer') },
      { key: 'manager', start: launchAt, end: end('manager') },
      { key: 'calibration', start: end('manager'), end: end('calibration') },
      { key: 'release', start: end('calibration'), end: end('release') },
    ];
  }, [ends, launchAt]);
  const phaseError = launchDay < today ? 'The cycle can’t open in the past.' : validatePhases(phases);
  const allDepts = useMemo(() => {
    const m = new Map<Department, number>();
    for (const u of ctx.people) m.set(u.department, (m.get(u.department) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ctx.people]);
  const participants = useMemo(() => ctx.people.filter((u) => scope === 'all' || depts.includes(u.department)), [ctx.people, scope, depts]);
  const tpl = templates.find((t) => t.id === templateId);
  const period = periods.find((p) => p.id === periodId);
  const futureLaunch = launchDay > today;

  const stepError = [
    name.trim().length < 3 ? 'Name the cycle (3+ characters).' : !period ? 'Pick a period.' : null,
    phaseError,
    participants.length ? null : scope === 'departments' ? 'Pick at least one department.' : 'No one has Performance access yet.',
    tpl ? null : 'Pick a template.',
    null,
  ][step];

  const go = (n: number) => {
    setStep(n);
    setReached((r) => Math.max(r, n));
  };
  const nextStep = () => {
    if (stepError) {
      toast.error(stepError);
      return;
    }
    go(Math.min(STEPS.length - 1, step + 1));
  };

  const shiftLaunch = (iso: string) => {
    if (!iso) return;
    const delta = Math.round((atTime(iso, 12) - atTime(launchDay, 12)) / DAY);
    setLaunchDay(iso);
    setEnds((e) => Object.fromEntries(PHASE_ORDER.map((k) => [k, toISO(atTime(e[k], 12) + delta * DAY)])) as Record<PhaseKey, string>);
  };

  const submit = (launch: boolean) => {
    if (busy) return;
    setBusy(true);
    const res = usePerf.getState().createCycle({ name, periodId, phases, departments: scope === 'all' ? null : depts, templateId, peerAnonymous, upwardMin, launch });
    setBusy(false);
    if (report(res)) {
      if (launch) burstConfetti();
      onClose();
    }
  };

  const draftCycle: TimelineCycle = { phases, launchedAt: launchAt, createdAt: now, status: 'draft' };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={680}
      icon={<CalendarRange />}
      title="New check-in cycle"
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      className="pf-cy-wizard"
      footer={
        <>
          {step > 0 && (
            <button type="button" className="neo-btn neo-btn--ghost" onClick={() => go(step - 1)}>
              <ChevronLeft /> Back
            </button>
          )}
          <span className="pf-cy-grow" />
          {step < STEPS.length - 1 ? (
            <button type="button" className="neo-btn neo-btn--plasma" onClick={nextStep} data-qa="wiz-next">
              Next <ChevronRight />
            </button>
          ) : (
            <>
              <button type="button" className="neo-btn neo-btn--soft" onClick={() => submit(false)} disabled={busy} data-qa="wiz-draft">
                <Save /> Save as draft
              </button>
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => submit(true)} disabled={busy || futureLaunch} data-qa="wiz-launch" title={futureLaunch ? `Opens ${longDate(atTime(launchDay, 9))} — save as a draft and launch that day` : undefined}>
                <Rocket /> Launch to {participants.length}
              </button>
            </>
          )}
        </>
      }
    >
      <ol className="pf-cy-steps" aria-label="Wizard progress">
        {STEPS.map((s, i) => (
          <li key={s} data-state={i === step ? 'current' : i < step || i <= reached ? 'done' : 'todo'}>
            <button type="button" onClick={() => i <= reached && go(i)} disabled={i > reached} aria-current={i === step ? 'step' : undefined}>
              <span className="pf-cy-steps__dot">{i < step ? <Check /> : i + 1}</span>
              <span className="pf-cy-steps__label">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="pf-cy-wiz-body" key={step}>
        {step === 0 && (
          <div className="pf-form">
            <label className="neo-field">
              <span className="neo-label">Cycle name</span>
              <input
                className="neo-input"
                value={name}
                autoFocus
                maxLength={80}
                onChange={(e) => {
                  setName(e.target.value);
                  setTouched(true);
                }}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
                placeholder="e.g. Q1 2027 Check-in"
                data-qa="wiz-name"
              />
              {cycles.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()) && <span className="neo-hint pf-cy-hint-warn">A cycle with this name already exists — pick something distinct.</span>}
            </label>
            <div className="neo-field">
              <span className="neo-label">Period</span>
              <div className="pf-cy-choices">
                {periods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pf-cy-choice"
                    aria-pressed={p.id === periodId}
                    onClick={() => {
                      setPeriodId(p.id);
                      if (!touched) setName(suggestName(p.id));
                    }}
                  >
                    <b>{p.label}</b>
                    <span>
                      {shortDate(p.start)} – {shortDate(p.end)}
                    </span>
                    {p.start <= now && now <= p.end && <em>Current</em>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="pf-form">
            <div className="pf-cy-row">
              <label className="neo-field pf-cy-launch">
                <span className="neo-label">Opens on</span>
                <input className="neo-input" type="date" value={launchDay} min={today} onChange={(e) => shiftLaunch(e.target.value)} />
              </label>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setEnds(defaultEnds(launchDay))}>
                <RotateCcw /> Default rhythm
              </button>
            </div>
            <ul className="pf-cy-phases">
              {PHASE_ORDER.map((k, i) => {
                const p = phases[i];
                const prevEnd = i === 0 ? launchAt : phases[i - 1].end;
                const days = Math.round((p.end - (k === 'self' || k === 'peer' || k === 'manager' ? launchAt : p.start)) / DAY);
                const bad = p.end <= p.start || p.end < prevEnd;
                return (
                  <li key={k} className={cx('pf-cy-phase', bad && 'is-bad')}>
                    <span className="pf-cy-phase__n">{i + 1}</span>
                    <div className="grow pf-cy-phase__text">
                      <b>{PHASE[k].label}</b>
                      <span>{PHASE[k].blurb}</span>
                    </div>
                    <label className="pf-cy-phase__date">
                      <span className="neo-sr">{PHASE[k].label} deadline</span>
                      <input className="neo-input neo-input--sm" type="date" value={ends[k]} min={launchDay} onChange={(e) => e.target.value && setEnds((x) => ({ ...x, [k]: e.target.value }))} />
                      <span className="pf-cy-phase__days">{days > 0 ? `${days} days` : '—'}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {phaseError ? (
              <p className="pf-cy-warn" role="alert">
                <TriangleAlert /> {phaseError}
              </p>
            ) : (
              <div className="pf-cy-preview">
                <span className="neo-hud">Preview</span>
                <PhaseTimeline cycle={draftCycle} now={now} />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="pf-form">
            <div className="pf-cy-choices pf-cy-choices--2">
              <button type="button" className="pf-cy-choice" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                <b>Everyone</b>
                <span>All {ctx.people.length} people with Performance access</span>
              </button>
              <button type="button" className="pf-cy-choice" aria-pressed={scope === 'departments'} onClick={() => setScope('departments')}>
                <b>Selected departments</b>
                <span>Pilot with a few teams first</span>
              </button>
            </div>
            {scope === 'departments' && (
              <div className="pf-cy-depts" role="group" aria-label="Departments">
                {allDepts.map(([d, n]) => (
                  <Chip key={d} tone="app" size="lg" pressed={depts.includes(d)} onClick={() => setDepts((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>
                    {depts.includes(d) && <Check />}
                    {d} <span className="pf-faint">{n}</span>
                  </Chip>
                ))}
              </div>
            )}
            <div className="pf-cy-count" aria-live="polite">
              <span className="pf-cy-count__num">{participants.length}</span>
              <div className="grow">
                <b>{participants.length === 1 ? 'participant' : 'participants'}</b>
                <span className="pf-faint">Each gets a review packet; reports are asked for upward feedback on their manager.</span>
              </div>
              <Avatars users={participants} max={6} size={28} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="pf-form">
            <div className="neo-field">
              <span className="neo-label">Template</span>
              <div className="pf-cy-choices pf-cy-choices--2">
                {templates.map((t) => (
                  <button key={t.id} type="button" className="pf-cy-choice" aria-pressed={t.id === templateId} onClick={() => setTemplateId(t.id)}>
                    <b>{t.name}</b>
                    <span>
                      {plural(t.questions.length, 'question')} · {t.competencies ? 'competency ratings' : 'no competency ratings'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="neo-field">
              <span className="neo-label">Overall rating scale · read-only</span>
              <ol className="pf-cy-scale">
                {RATINGS.map((r) => (
                  <li key={r.id} data-tone={r.tone}>
                    <i />
                    <b>{r.label}</b>
                    <span className="grow">{r.blurb}</span>
                    <em>{pctS(r.guidance)} guide</em>
                  </li>
                ))}
              </ol>
            </div>
            <div className="pf-cy-settings">
              <button type="button" role="switch" aria-checked={peerAnonymous} className="pf-cy-switchrow" onClick={() => setPeerAnonymous((v) => !v)}>
                <span className="pf-cy-toggle" data-on={peerAnonymous || undefined}>
                  <i />
                </span>
                <span className="grow">
                  <b>Anonymous peer feedback</b>
                  <span>Peers stay anonymous to the employee; managers still see authors.</span>
                </span>
                {peerAnonymous ? <EyeOff /> : <Eye />}
              </button>
              <div className="pf-cy-switchrow pf-cy-stepper">
                <span className="grow">
                  <b>Upward feedback threshold</b>
                  <span>Shown to a manager only in aggregate, once at least {upwardMin} reports answer.</span>
                </span>
                <span className="pf-cy-stepper__ctl" role="group" aria-label="Minimum upward responses">
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setUpwardMin((v) => Math.max(2, v - 1))} disabled={upwardMin <= 2} aria-label="Fewer">
                    <Minus />
                  </button>
                  <b aria-live="polite">{upwardMin}</b>
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setUpwardMin((v) => Math.min(10, v + 1))} disabled={upwardMin >= 10} aria-label="More">
                    <Plus />
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="pf-form">
            <dl className="pf-cy-summary">
              <div>
                <dt>Name</dt>
                <dd>{name.trim()}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{period?.label}</dd>
              </div>
              <div>
                <dt>Opens</dt>
                <dd>{launchDay === today ? 'Today, on launch' : longDate(atTime(launchDay, 9))}</dd>
              </div>
              <div>
                <dt>Participants</dt>
                <dd>
                  {participants.length} · {scope === 'all' ? 'everyone' : depts.join(', ')}
                </dd>
              </div>
              <div>
                <dt>Template</dt>
                <dd>{tpl?.name}</dd>
              </div>
              <div>
                <dt>Privacy</dt>
                <dd>
                  {peerAnonymous ? 'Anonymous peers' : 'Named peers'} · upward at {upwardMin}+
                </dd>
              </div>
            </dl>
            <div className="pf-cy-preview">
              <span className="neo-hud">Timeline</span>
              <PhaseTimeline cycle={draftCycle} now={now} />
            </div>
            {futureLaunch ? (
              <p className="pf-cy-note">
                <Clock /> This cycle opens {longDate(atTime(launchDay, 9))}. Save it as a draft now and launch it from Cycles that day.
              </p>
            ) : (
              <p className="pf-cy-note">
                <BellRing /> Launching notifies {plural(participants.length, 'person', 'people')} and opens self-reflections, due {longDate(phases[0].end)}.
              </p>
            )}
          </div>
        )}
      </div>
    </PfModal>
  );
}

/* ───────────────────────── Templates tab ───────────────────────── */

const normQs = (qs: TemplateQuestion[]) => qs.map((q) => [q.id, q.prompt.trim(), q.managerPrompt.trim(), (q.help ?? '').trim()].join('\u0001')).join('\u0002');

function TemplatesTab({ ctx }: { ctx: PerfCtx }) {
  const templates = usePerf((s) => s.templates);
  const cycles = usePerf((s) => s.cycles);
  const [tplId, setTplId] = useState(templates[0]?.id ?? '');
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0];
  const [draft, setDraft] = useState<TemplateQuestion[]>(() => tpl?.questions.map((q) => ({ ...q })) ?? []);
  const [competencies, setCompetencies] = useState(tpl?.competencies ?? true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!tpl) return;
    setDraft(tpl.questions.map((q) => ({ ...q })));
    setCompetencies(tpl.competencies);
    // reset only when the stored template changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl?.id, tpl?.updatedAt]);

  if (!tpl) {
    return (
      <NeoEmpty icon={<LayoutTemplate />} title="No templates yet">
        Templates come with the demo data — reset the demo from Settings to restore the quarterly template.
      </NeoEmpty>
    );
  }

  const dirty = normQs(draft) !== normQs(tpl.questions) || competencies !== tpl.competencies;
  const usedBy = cycles.filter((c) => c.templateId === tpl.id && c.status !== 'closed');
  const invalid = draft.filter((q) => q.prompt.trim().length < 8).length;

  const patch = (id: string, p: Partial<TemplateQuestion>) => setDraft((d) => d.map((q) => (q.id === id ? { ...q, ...p } : q)));
  const moveBy = (id: string, delta: number) =>
    setDraft((d) => {
      const i = d.findIndex((q) => q.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.length) return d;
      return arrayMove(d, i, j);
    });
  const remove = (id: string) => setDraft((d) => d.filter((q) => q.id !== id));
  const add = () => {
    const id = uid('q');
    setDraft((d) => [...d, { id, prompt: '', managerPrompt: '', help: '' }]);
    window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-q="${id}"]`)?.focus(), 30);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.findIndex((q) => q.id === active.id);
      const to = d.findIndex((q) => q.id === over.id);
      return from < 0 || to < 0 ? d : arrayMove(d, from, to);
    });
  };
  const save = () => {
    if (invalid) {
      toast.error('Each question needs a prompt (8+ characters).');
      return;
    }
    report(usePerf.getState().updateTemplate(tpl.id, draft, competencies));
  };
  const discard = () => {
    setDraft(tpl.questions.map((q) => ({ ...q })));
    setCompetencies(tpl.competencies);
  };

  return (
    <div className="pf-cy-tpl">
      <section className="neo-card pf-cy-card pf-cy-editor" aria-label="Template questions">
        <header className="pf-cy-card__head">
          <span className="pf-cy-card__icon">
            <LayoutTemplate />
          </span>
          <div className="grow">
            <div className="neo-hud">
              Edited {relativeTime(tpl.updatedAt)} by {ctx.first(tpl.updatedBy)}
            </div>
            <h2 className="pf-cy-h2">{tpl.name}</h2>
          </div>
          {templates.length > 1 && (
            <select className="neo-select neo-select--sm pf-cy-tplselect" value={tpl.id} onChange={(e) => setTplId(e.target.value)} aria-label="Template">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </header>

        {usedBy.length > 0 && (
          <p className="pf-cy-note">
            <TriangleAlert /> Used by {usedBy.map((c) => c.name).join(', ')}. Edits apply right away; removing a question hides its answers in packets already started.
          </p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={draft.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ol className="pf-cy-qs">
              {draft.map((q, i) => (
                <QuestionCard key={q.id} q={q} index={i} count={draft.length} onPatch={patch} onMove={moveBy} onRemove={remove} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {!draft.length && (
          <NeoEmpty compact icon={<LayoutTemplate />} title="No questions" action={<button type="button" className="neo-btn neo-btn--soft" onClick={add}><Plus /> Add a question</button>}>
            A template needs at least one question.
          </NeoEmpty>
        )}

        <div className="pf-cy-editor__row">
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={add} disabled={draft.length >= 8} data-qa="tpl-add">
            <Plus /> Add question
          </button>
          <span className="pf-faint pf-cy-small">{draft.length}/8 questions</span>
          <span className="pf-cy-grow" />
          <button type="button" role="switch" aria-checked={competencies} className="pf-cy-inline-switch" onClick={() => setCompetencies((v) => !v)} data-qa="tpl-comp">
            <span className="pf-cy-toggle" data-on={competencies || undefined}>
              <i />
            </span>
            Competency ratings
          </button>
        </div>

        <div className={cx('pf-cy-savebar', dirty && 'is-dirty')} aria-live="polite">
          {dirty ? (
            <>
              <span className="pf-cy-savebar__dot" />
              <span className="grow">
                Unsaved changes{invalid ? ` · ${plural(invalid, 'question')} need a prompt` : ''}
              </span>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={discard}>
                Discard
              </button>
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={save} data-qa="tpl-save">
                <Save /> Save template
              </button>
            </>
          ) : (
            <span className="grow pf-faint">
              <CircleCheck /> All changes saved
            </span>
          )}
        </div>
      </section>

      <aside className="pf-cy-ref" aria-label="Reference">
        <section className="neo-card pf-cy-card">
          <header className="pf-cy-card__head">
            <span className="pf-cy-card__icon">
              <Scale />
            </span>
            <div className="grow">
              <div className="neo-hud">Read-only reference</div>
              <h2 className="pf-cy-h2">Competencies &amp; anchors</h2>
            </div>
            {!competencies && (
              <Chip tone="slate" size="sm">
                Off in this template
              </Chip>
            )}
          </header>
          <div className="pf-cy-comps">
            {COMPETENCIES.map((c, i) => (
              <details key={c.id} className="pf-cy-comp" open={i === 0}>
                <summary>
                  <b>{c.label}</b>
                  <span className="pf-faint">{c.blurb}</span>
                </summary>
                <ol>
                  {c.anchors.map((a, n) => (
                    <li key={n}>
                      <span className="pf-cy-comp__n">{n + 1}</span>
                      <span className="grow">
                        <b>{SCORE_LABEL[n + 1]}</b> {a}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </section>
        <section className="neo-card pf-cy-card">
          <header className="pf-cy-card__head">
            <span className="pf-cy-card__icon">
              <ChartLine />
            </span>
            <div className="grow">
              <div className="neo-hud">Manager-only</div>
              <h2 className="pf-cy-h2">Overall rating scale</h2>
            </div>
          </header>
          <ol className="pf-cy-scale">
            {RATINGS.map((r) => (
              <li key={r.id} data-tone={r.tone}>
                <i />
                <b>{r.label}</b>
                <span className="grow">{r.blurb}</span>
                <em>{pctS(r.guidance)}</em>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function QuestionCard({ q, index, count, onPatch, onMove, onRemove }: { q: TemplateQuestion; index: number; count: number; onPatch: (id: string, p: Partial<TemplateQuestion>) => void; onMove: (id: string, d: number) => void; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const short = q.prompt.trim().length < 8;
  return (
    <li ref={setNodeRef} style={style} className={cx('pf-cy-q', isDragging && 'is-dragging')}>
      <div className="pf-cy-q__rail">
        <button type="button" ref={setActivatorNodeRef} className="pf-cy-q__handle" {...attributes} {...listeners} aria-label={`Reorder question ${index + 1}. Press Space to pick up, arrows to move.`}>
          <GripVertical />
        </button>
        <span className="pf-cy-q__n">{index + 1}</span>
      </div>
      <div className="pf-cy-q__fields">
        <label className="neo-field">
          <span className="neo-label">Employee prompt</span>
          <input className={cx('neo-input', short && q.prompt && 'is-invalid')} value={q.prompt} data-q={q.id} maxLength={200} placeholder="What were your most important wins this quarter?" onChange={(e) => onPatch(q.id, { prompt: e.target.value })} />
        </label>
        <label className="neo-field">
          <span className="neo-label">Manager prompt</span>
          <input className="neo-input neo-input--sm" value={q.managerPrompt} maxLength={200} placeholder="Asked to the manager about the employee (defaults to the employee prompt)" onChange={(e) => onPatch(q.id, { managerPrompt: e.target.value })} />
        </label>
        <label className="neo-field">
          <span className="neo-label">Help text</span>
          <input className="neo-input neo-input--sm" value={q.help ?? ''} maxLength={200} placeholder="A nudge toward specific, evidence-based answers" onChange={(e) => onPatch(q.id, { help: e.target.value })} />
        </label>
        {short && <span className="neo-hint pf-cy-hint-warn">Prompts need 8+ characters.</span>}
      </div>
      <div className="pf-cy-q__acts">
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => onMove(q.id, -1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`}>
          <ArrowUp />
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => onMove(q.id, 1)} disabled={index === count - 1} aria-label={`Move question ${index + 1} down`}>
          <ArrowDown />
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm pf-cy-q__del" onClick={() => onRemove(q.id)} disabled={count <= 1} aria-label={`Remove question ${index + 1}`}>
          <Trash2 />
        </button>
      </div>
    </li>
  );
}

