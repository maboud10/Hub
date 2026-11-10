/**
 * Insights — how the quarterly check-in, OKRs and feedback are going.
 *
 * People Ops (`performance.manage`) see the whole org and can switch to "My team"; managers see
 * their org (everyone below them). Every figure follows the privacy rules of the screen it
 * summarises: manager ratings only where `reviewAccess().seeManager`, the 9-box with
 * Calibration's masking, upward feedback aggregated and only with ≥ `upwardMin` responses,
 * continuous feedback as counts — never content.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarRange,
  ChartLine,
  CircleCheck,
  Download,
  Ellipsis,
  Grid3x3,
  History,
  Lock,
  MessageSquareHeart,
  MessagesSquare,
  Minus,
  PencilLine,
  RefreshCw,
  Scale,
  Target,
  UserCheck,
  Users,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoStage, type MenuEntry, type Tone } from '@/components/neo';
import { downloadCsv } from '@/lib/csv';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { calibrationScope, canViewObjective, hasReports, reviewAccess, upwardAccess } from '@/performance/access';
import { BOX_META, RATINGS, STATUS_META, UPWARD_DIMENSIONS } from '@/performance/constants';
import { boxKey, placementFor } from '@/performance/ninebox';
import { startOfWeek } from '@/performance/okr';
import { currentPeriod, previousCycle, primaryCycle, rollup } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { BoxAxis, Cycle, CycleFeedback, KrStatus, OverallRating, PerfData, Review, UpwardDimension } from '@/performance/types';
import { shortDate, useMinute, usePerfCtx, type PerfCtx } from './hooks';
import { NovaBox, NovaThinking, Section, Seg, Who, useNova } from './ui';
import { PeopleOpsTabs } from './CyclesView';
import './styles/insights.css';

/* ───────────────────────── Model ───────────────────────── */

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const WEEKS = 8;
/** Below this many visible ratings a cycle says little — fall back to the last closed one. */
const MIN_RATINGS = 4;
const HIGH_GUIDANCE = RATINGS.filter((r) => r.value >= 4).reduce((s, r) => s + r.guidance, 0);

const pctS = (v: number) => `${Math.round(v * 100)}%`;
const plural = (n: number, w: string, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const signed = (x: number, digits = 1) => (Math.abs(x) < 0.5 * 10 ** -digits ? '±0' : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`);

type Scope = 'org' | 'team';
type Data = Pick<PerfData, 'cycles' | 'periods' | 'reviews' | 'cycleFeedback' | 'feedback' | 'objectives' | 'keyResults'>;

interface Tally {
  done: number;
  total: number;
}
const tally = (): Tally => ({ done: 0, total: 0 });
const ratio = (t: Tally) => (t.total ? t.done / t.total : 0);
const bump = (t: Tally, done: boolean) => {
  t.total += 1;
  if (done) t.done += 1;
};

function completionTone(t: Tally): Tone {
  if (!t.total) return 'slate';
  const v = ratio(t);
  if (v >= 0.999) return 'success';
  if (v >= 0.6) return 'teal';
  if (v >= 0.3) return 'amber';
  return 'rose';
}

/** Hide the manager's rating from viewers who may not see the manager part yet (as on Calibration). */
function visibleReview(ctx: PerfCtx, r: Review | undefined): Review | undefined {
  if (!r) return r;
  if (reviewAccess(ctx.v, ctx.users, r).seeManager) return r;
  return { ...r, manager: { ...r.manager, overall: undefined, potential: undefined } };
}

/** Most recently finished closed cycle (used when nothing is running). */
function lastClosed(cycles: Cycle[]): Cycle | null {
  const end = (c: Cycle) => c.phases[c.phases.length - 1]?.end ?? c.createdAt;
  return [...cycles].filter((c) => c.status === 'closed').sort((a, b) => end(b) - end(a))[0] ?? null;
}

/* Completion by department */

type CompKey = 'self' | 'peer' | 'upward' | 'manager';
const COMP_COLS: { key: CompKey; label: string; short: string }[] = [
  { key: 'self', label: 'Self-reflection', short: 'Self' },
  { key: 'peer', label: 'Peer feedback', short: 'Peer' },
  { key: 'upward', label: 'Upward feedback', short: 'Upward' },
  { key: 'manager', label: 'Manager review', short: 'Manager' },
];

interface DeptRow {
  dept: string;
  people: number;
  cells: Record<CompKey, Tally>;
  overall: Tally;
}
const emptyRow = (dept: string): DeptRow => ({ dept, people: 0, cells: { self: tally(), peer: tally(), upward: tally(), manager: tally() }, overall: tally() });

function completionRows(cycle: Cycle, ids: Set<string>, ctx: PerfCtx, d: Data): DeptRow[] {
  const rows = new Map<string, DeptRow>();
  const rs = d.reviews.filter((r) => r.cycleId === cycle.id);
  const fb = d.cycleFeedback.filter((f) => f.cycleId === cycle.id && (f.status === 'requested' || f.status === 'submitted'));
  for (const id of cycle.participantIds) {
    const u = ids.has(id) ? ctx.user(id) : undefined;
    if (!u || !u.active) continue;
    const row = rows.get(u.department) ?? emptyRow(u.department);
    row.people += 1;
    const r = rs.find((x) => x.employeeId === id);
    if (r) {
      bump(row.cells.self, r.self.status === 'submitted');
      bump(row.cells.manager, r.manager.status === 'submitted');
    }
    for (const f of fb) if (f.authorId === id) bump(row.cells[f.kind === 'peer' ? 'peer' : 'upward'], f.status === 'submitted');
    rows.set(u.department, row);
  }
  const out = [...rows.values()];
  for (const row of out)
    for (const c of COMP_COLS) {
      row.overall.done += row.cells[c.key].done;
      row.overall.total += row.cells[c.key].total;
    }
  // Lowest completion first: where a nudge helps most.
  return out.sort((a, b) => ratio(a.overall) - ratio(b.overall) || a.dept.localeCompare(b.dept));
}

function totalRow(rows: DeptRow[]): DeptRow {
  const t = emptyRow('All departments');
  for (const r of rows) {
    t.people += r.people;
    for (const c of COMP_COLS) {
      t.cells[c.key].done += r.cells[c.key].done;
      t.cells[c.key].total += r.cells[c.key].total;
    }
    t.overall.done += r.overall.done;
    t.overall.total += r.overall.total;
  }
  return t;
}

/* OKR attainment */

const STATUS_STACK: KrStatus[] = ['done', 'on-track', 'at-risk', 'off-track'];
const zeroStatus = (): Record<KrStatus, number> => ({ 'on-track': 0, 'at-risk': 0, 'off-track': 0, done: 0 });

function okrStats(ids: Set<string>, periodId: string, ctx: PerfCtx, d: Data, now: number) {
  const rolls = d.objectives
    .filter((o) => o.periodId === periodId && (ids.has(o.ownerId) || o.coOwnerIds.some((c) => ids.has(c))) && canViewObjective(ctx.v, ctx.users, o))
    .map((o) => rollup(d, o, now));
  const buckets = [0, 1, 2, 3, 4].map((i) => ({ label: `${i * 20}–${i * 20 + 20}%`, total: 0, counts: zeroStatus() }));
  const byStatus = zeroStatus();
  const progress: number[] = [];
  for (const r of rolls) {
    const p = Number.isFinite(r.progress) ? Math.max(0, Math.min(1, r.progress)) : 0;
    const b = buckets[Math.min(4, Math.floor(p * 5))];
    b.total += 1;
    b.counts[r.status] += 1;
    byStatus[r.status] += 1;
    progress.push(p);
  }
  return { count: rolls.length, avg: mean(progress), buckets, byStatus, max: Math.max(1, ...buckets.map((b) => b.total)) };
}
type OkrStats = ReturnType<typeof okrStats>;

/* Ratings vs guidance */

function ratingStats(cycle: Cycle, prev: Cycle | null, ids: Set<string>, ctx: PerfCtx, d: Data) {
  const visible = (c: Cycle) => {
    const out: OverallRating[] = [];
    for (const r of d.reviews) {
      const o = r.manager.overall;
      if (r.cycleId === c.id && o && ids.has(r.employeeId) && reviewAccess(ctx.v, ctx.users, r).seeManager) out.push(o);
    }
    return out;
  };
  const live = visible(cycle);
  let source = cycle;
  let list = live;
  if (live.length < MIN_RATINGS && prev) {
    const older = visible(prev);
    if (older.length > live.length) {
      source = prev;
      list = older;
    }
  }
  const total = list.length;
  const rows = RATINGS.map((r) => {
    const count = list.filter((x) => x === r.id).length;
    const share = total ? count / total : 0;
    return { id: r.id, label: r.label, tone: r.tone, value: r.value, guidance: r.guidance, count, share };
  });
  const high = rows.filter((r) => r.value >= 4).reduce((s, r) => s + r.share, 0);
  return { source, fallback: source !== cycle, liveCount: live.length, total, rows, high };
}
type RatingStats = ReturnType<typeof ratingStats>;

/* Feedback volume (counts only) */

interface WeekBin {
  from: number;
  praise: number;
  constructive: number;
}

function feedbackWeeks(ids: Set<string>, d: Data, now: number) {
  const first = startOfWeek(now) - (WEEKS - 1) * WEEK;
  const weeks: WeekBin[] = Array.from({ length: WEEKS }, (_, i) => ({ from: first + i * WEEK, praise: 0, constructive: 0 }));
  for (const f of d.feedback) {
    if (!ids.has(f.toId) || f.at < first || f.at > now) continue;
    weeks[Math.min(WEEKS - 1, Math.floor((f.at - first) / WEEK))][f.kind] += 1;
  }
  const sum = (ws: WeekBin[]) => ws.reduce((s, w) => s + w.praise + w.constructive, 0);
  const praise = weeks.reduce((s, w) => s + w.praise, 0);
  const total = sum(weeks);
  return { weeks, praise, constructive: total - praise, total, recent: sum(weeks.slice(-4)), earlier: sum(weeks.slice(0, 4)), max: Math.max(1, ...weeks.map((w) => w.praise + w.constructive)) };
}
type FeedbackStats = ReturnType<typeof feedbackWeeks>;

/* 9-box summary (Calibration's masking) */

function nineBox(cycle: Cycle, prev: Cycle | null, ids: Set<string>, ctx: PerfCtx, d: Data) {
  const scope = calibrationScope(ctx.v, ctx.users, cycle.participantIds).filter((id) => ids.has(id) && ctx.user(id)?.active);
  const counts: Record<string, number> = {};
  let placed = 0;
  let calibrated = 0;
  for (const id of scope) {
    const r = d.reviews.find((x) => x.cycleId === cycle.id && x.employeeId === id);
    const p = prev ? d.reviews.find((x) => x.cycleId === prev.id && x.employeeId === id) : undefined;
    const pl = placementFor(id, visibleReview(ctx, r), visibleReview(ctx, p));
    if (!pl) continue;
    placed += 1;
    if (pl.source === 'calibrated') calibrated += 1;
    const k = boxKey(pl.performance, pl.potential);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { scope: scope.length, placed, calibrated, unplaced: scope.length - placed, counts, max: Math.max(1, ...Object.values(counts)) };
}
type BoxStats = ReturnType<typeof nineBox>;

/* Manager effectiveness (upward feedback, aggregated) */

interface MgrRow {
  id: string;
  name: string;
  count: number;
  min: number;
  visible: boolean;
  overall: number | null;
  dims: Partial<Record<UpwardDimension, number>>;
  prev: number | null;
}

function upwardScores(items: CycleFeedback[]) {
  const sub = items.filter((i) => i.status === 'submitted');
  const dims: Partial<Record<UpwardDimension, number>> = {};
  for (const dm of UPWARD_DIMENSIONS) {
    const vals: number[] = [];
    for (const i of sub) {
      const s = i.scores?.[dm.id];
      if (s != null) vals.push(s);
    }
    const m = mean(vals);
    if (m != null) dims[dm.id] = m;
  }
  return { dims, overall: mean(Object.values(dims)) };
}

function managerRows(cycle: Cycle, prev: Cycle | null, ids: Set<string>, ctx: PerfCtx, d: Data): MgrRow[] {
  const mgrIds = new Set([...ids].filter((id) => hasReports(ctx.users, id)));
  if (hasReports(ctx.users, ctx.me.id)) mgrIds.add(ctx.me.id);
  const upward = (c: Cycle, id: string) => d.cycleFeedback.filter((f) => f.cycleId === c.id && f.kind === 'upward' && f.subjectId === id && f.status !== 'proposed' && f.status !== 'declined');
  const rows: MgrRow[] = [];
  for (const id of mgrIds) {
    const u = ctx.user(id);
    if (!u?.active) continue;
    const items = upward(cycle, id);
    const access = upwardAccess(ctx.v, ctx.users, id, items, cycle.upwardMin);
    if (!access.allowed) continue;
    const cur = access.visible ? upwardScores(items) : null;
    let before: number | null = null;
    if (prev && cur) {
      const old = upward(prev, id);
      if (upwardAccess(ctx.v, ctx.users, id, old, prev.upwardMin).visible) before = upwardScores(old).overall;
    }
    rows.push({ id, name: u.name, count: access.count, min: cycle.upwardMin, visible: access.visible, overall: cur?.overall ?? null, dims: cur?.dims ?? {}, prev: before });
  }
  return rows.sort((a, b) => Number(b.visible) - Number(a.visible) || (b.overall ?? 0) - (a.overall ?? 0) || b.count - a.count || a.name.localeCompare(b.name));
}

/* Nova — deterministic summary from the numbers above */

function summaryText(s: {
  cycle: Cycle;
  scopeFor: string;
  rows: DeptRow[];
  total: DeptRow;
  okr: OkrStats;
  ratings: RatingStats | null;
  fb: FeedbackStats;
  box: BoxStats | null;
  mgrs: MgrRow[];
  prevName?: string;
}): string {
  const out: string[] = [];
  const { total, rows } = s;
  if (total.overall.total) {
    const self = total.cells.self;
    let line = `${s.cycle.name} for ${s.scopeFor}: ${pctS(ratio(self))} of self-reflections are in (${self.done} of ${self.total}) and ${pctS(ratio(total.overall))} of all requested check-in work is done.`;
    const worst = rows[0];
    if (rows.length > 1 && worst && ratio(worst.overall) < ratio(total.overall) - 0.1) line += ` ${worst.dept} trails at ${pctS(ratio(worst.overall))} — a nudge there moves the needle most.`;
    else if (ratio(total.overall) >= 0.999) line += ' Every department is complete.';
    out.push(line);
  } else out.push(`Nothing has been requested yet in ${s.cycle.name} for ${s.scopeFor}.`);
  if (s.okr.count) {
    const risky = s.okr.byStatus['off-track'] + s.okr.byStatus['at-risk'];
    out.push(
      `${plural(s.okr.count, 'objective')} average ${pctS(s.okr.avg ?? 0)} progress${risky ? `; ${s.okr.byStatus['off-track']} off track and ${s.okr.byStatus['at-risk']} at risk` : ', with none at risk'}.`,
    );
  }
  if (s.ratings?.total) {
    const r = s.ratings;
    const gap = r.high - HIGH_GUIDANCE;
    const verdict = gap > 0.12 ? ' — worth pressure-testing in calibration' : gap < -0.15 ? ' — strong performers may be under-recognised' : ' — close to the curve';
    out.push(`${r.fallback ? `In ${r.source.name} (too few ratings visible yet this cycle), ` : 'Ratings: '}${pctS(r.high)} exceeds or above vs ${pctS(HIGH_GUIDANCE)} guidance${verdict}.`);
  }
  if (s.fb.total) {
    const share = s.fb.praise / s.fb.total;
    out.push(`${plural(s.fb.total, 'piece')} of feedback in ${WEEKS} weeks, ${pctS(share)} praise${share > 0.8 ? ' — constructive notes are scarce; model specific, kind suggestions' : ''}.`);
  } else out.push(`No feedback was shared in the last ${WEEKS} weeks — a good prompt for the next team meeting.`);
  if (s.box?.unplaced) out.push(`${plural(s.box.unplaced, 'person', 'people')} not yet on the 9-box.`);
  const shown = s.mgrs.filter((m) => m.visible && m.overall != null);
  const thin = s.mgrs.filter((m) => !m.visible);
  if (shown.length) {
    const top = shown[0];
    const delta = top.prev != null && top.overall != null ? top.overall - top.prev : null;
    out.push(
      `Upward feedback: ${top.name} ${shown.length > 1 ? 'leads' : 'scores'} ${(top.overall ?? 0).toFixed(1)}/5${delta != null && Math.abs(delta) >= 0.05 ? ` (${signed(delta)} vs ${s.prevName})` : ''}.`,
    );
  }
  if (thin.length) out.push(`${thin.length === 1 ? `${thin[0].name} needs` : `${thin.length} managers need`} more upward responses before results can be shown.`);
  return out.join(' ');
}

/* ───────────────────────── Small parts ───────────────────────── */

function Kpi({ icon, label, value, sub, v, tone }: { icon: ReactNode; label: string; value: string; sub: string; v?: number; tone: Tone }) {
  return (
    <div className="pf-in-kpi" data-tone={tone}>
      <span className="pf-in-kpi__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="pf-in-kpi__label">{label}</span>
      <b className="pf-in-kpi__value">{value}</b>
      <span className="pf-in-kpi__sub">{sub}</span>
      {v !== undefined && (
        <span className="pf-in-kpi__bar" aria-hidden="true">
          <i style={{ width: `${Math.round(v * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function Trend({ delta, children, flat = 0.05 }: { delta: number; children: ReactNode; flat?: number }) {
  const dir = Math.abs(delta) < flat ? 'flat' : delta > 0 ? 'up' : 'down';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span className="pf-in-trend" data-tone={dir === 'up' ? 'success' : dir === 'down' ? 'rose' : 'slate'}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}

function Meter({ t, label, short, strong }: { t: Tally; label: string; short: string; strong?: boolean }) {
  const v = ratio(t);
  return (
    <span
      role="cell"
      className={cx('pf-in-meter', strong && 'is-strong')}
      data-tone={completionTone(t)}
      data-label={short}
      aria-label={`${label}: ${t.total ? `${t.done} of ${t.total}, ${pctS(v)}` : 'nothing requested'}`}
    >
      <span className="pf-in-meter__val" aria-hidden="true">
        {t.total ? pctS(v) : '—'}
      </span>
      <small aria-hidden="true">{t.total ? `${t.done}/${t.total}` : 'none'}</small>
      <span className="pf-in-meter__bar" aria-hidden="true">
        <i style={{ width: `${v * 100}%` }} />
      </span>
    </span>
  );
}

function CompRow({ r, total }: { r: DeptRow; total?: boolean }) {
  return (
    <div className={cx('pf-in-table__row', total && 'pf-in-table__row--total')} role="row">
      <span className="pf-in-table__dept" role="rowheader">
        <b>{r.dept}</b>
        <small>{plural(r.people, 'person', 'people')}</small>
      </span>
      {COMP_COLS.map((c) => (
        <Meter key={c.key} t={r.cells[c.key]} label={`${r.dept}, ${c.label}`} short={c.short} />
      ))}
      <Meter t={r.overall} label={`${r.dept}, overall`} short="Overall" strong />
    </div>
  );
}

function MgrItem({ m, ctx, prevName }: { m: MgrRow; ctx: PerfCtx; prevName?: string }) {
  const me = m.id === ctx.me.id;
  return (
    <li className={cx('pf-in-mgr', !m.visible && 'is-thin')}>
      <span className="pf-in-mgr__who">
        <Who ctx={ctx} id={m.id} size={30} sub={`${me ? 'You · ' : ''}${plural(m.count, 'response')}`} />
      </span>
      {m.visible && m.overall != null ? (
        <>
          <span className="pf-in-mgr__score">
            <span className="pf-in-mgr__num" aria-label={`${m.overall.toFixed(1)} out of 5`}>
              <b aria-hidden="true">{m.overall.toFixed(1)}</b>
              <small aria-hidden="true">/ 5</small>
            </span>
            {m.prev != null ? (
              <Trend delta={m.overall - m.prev}>
                {signed(m.overall - m.prev)} vs {prevName}
              </Trend>
            ) : (
              <span className="pf-in-mgr__nodata">No {prevName ?? 'earlier'} result</span>
            )}
          </span>
          <div className="pf-in-mgr__dims">
            {UPWARD_DIMENSIONS.map((dm) => {
              const v = m.dims[dm.id];
              return (
                <span key={dm.id} className="pf-in-dim" title={dm.label}>
                  <small>{dm.short}</small>
                  <b>{v != null ? v.toFixed(1) : '—'}</b>
                  <span className="pf-in-dim__bar" aria-hidden="true">
                    <i style={{ width: `${((v ?? 0) / 5) * 100}%` }} />
                  </span>
                </span>
              );
            })}
          </div>
        </>
      ) : (
        <span className="pf-in-mgr__thin">
          <Lock aria-hidden="true" /> Not enough responses ({m.count}/{m.min})
        </span>
      )}
    </li>
  );
}

/* ───────────────────────── View ───────────────────────── */

export function InsightsView() {
  const ctx = usePerfCtx();
  if (!ctx) return null;
  if (!ctx.canInsights)
    return (
      <NeoStage className="pf-in">
        <div className="neo-body neo-pad">
          <NeoEmpty
            icon={<Lock />}
            title="Insights are for managers and People Ops"
            action={
              <Link className="neo-btn neo-btn--soft" to="/performance">
                Back to Performance home
              </Link>
            }
          >
            Check-in, OKR and feedback trends for your org appear here once people report to you.
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  return <Insights ctx={ctx} />;
}

function Insights({ ctx }: { ctx: PerfCtx }) {
  const now = useMinute();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope: Scope = ctx.isAdmin && params.get('scope') !== 'team' ? 'org' : 'team';
  const setScope = (s: Scope) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (s === 'team') n.set('scope', 'team');
        else n.delete('scope');
        return n;
      },
      { replace: true },
    );

  const cycles = usePerf((s) => s.cycles);
  const periods = usePerf((s) => s.periods);
  const reviews = usePerf((s) => s.reviews);
  const cycleFeedback = usePerf((s) => s.cycleFeedback);
  const feedback = usePerf((s) => s.feedback);
  const objectives = usePerf((s) => s.objectives);
  const keyResults = usePerf((s) => s.keyResults);
  const d = useMemo<Data>(() => ({ cycles, periods, reviews, cycleFeedback, feedback, objectives, keyResults }), [cycles, periods, reviews, cycleFeedback, feedback, objectives, keyResults]);

  const live = useMemo(() => primaryCycle(d, now), [d, now]);
  const cycle = useMemo(() => live ?? lastClosed(d.cycles), [live, d]);
  const prev = useMemo(() => previousCycle(d, cycle), [d, cycle]);
  const period = useMemo(() => currentPeriod(d, now), [d, now]);
  const ids = useMemo(() => new Set(scope === 'org' ? ctx.people.map((u) => u.id) : ctx.orgIds), [scope, ctx]);
  const scopeLabel = scope === 'org' ? 'Whole org' : ctx.isAdmin ? 'Your team' : 'Your org';
  const scopeFor = scope === 'org' ? 'the whole org' : ctx.isAdmin ? 'your team' : 'your org';

  const rows = useMemo(() => (cycle ? completionRows(cycle, ids, ctx, d) : []), [cycle, ids, ctx, d]);
  const total = useMemo(() => totalRow(rows), [rows]);
  const okr = useMemo(() => okrStats(ids, period?.id ?? '', ctx, d, now), [ids, period, ctx, d, now]);
  const ratings = useMemo(() => (cycle ? ratingStats(cycle, prev, ids, ctx, d) : null), [cycle, prev, ids, ctx, d]);
  const fb = useMemo(() => feedbackWeeks(ids, d, now), [ids, d, now]);
  const box = useMemo(() => (cycle ? nineBox(cycle, prev, ids, ctx, d) : null), [cycle, prev, ids, ctx, d]);
  const mgrs = useMemo(() => (cycle ? managerRows(cycle, prev, ids, ctx, d) : []), [cycle, prev, ids, ctx, d]);

  const [deptQ, setDeptQ] = useState('');
  const [mgrQ, setMgrQ] = useState('');
  const shownRows = useMemo(() => {
    const q = deptQ.trim().toLowerCase();
    return q ? rows.filter((r) => r.dept.toLowerCase().includes(q)) : rows;
  }, [rows, deptQ]);
  const shownMgrs = useMemo(() => {
    const q = mgrQ.trim().toLowerCase();
    return q ? mgrs.filter((m) => m.name.toLowerCase().includes(q)) : mgrs;
  }, [mgrs, mgrQ]);

  const novaKey = `${scope}|${cycle?.id ?? '-'}`;
  const nova = useNova(() => (cycle ? summaryText({ cycle, scopeFor, rows, total, okr, ratings, fb, box, mgrs, prevName: prev?.name }) : ''), novaKey, 700);
  const { run } = nova;
  useEffect(() => {
    run();
  }, [novaKey, run]);

  const exportCsv = () => {
    if (!cycle || !rows.length) {
      toast.error('Nothing to export yet');
      return;
    }
    const line = (r: DeptRow) => {
      const o: Record<string, string | number> = { Department: r.dept, People: r.people };
      for (const c of COMP_COLS) {
        const t = r.cells[c.key];
        o[`${c.label} done`] = t.done;
        o[`${c.label} requested`] = t.total;
        o[`${c.label} %`] = t.total ? Math.round(ratio(t) * 100) : '';
      }
      o['Overall %'] = r.overall.total ? Math.round(ratio(r.overall) * 100) : '';
      return o;
    };
    downloadCsv(`check-in-completion-${cycle.id}-${scope}.csv`, [...rows.map(line), line(total)]);
    toast.success(`Exported completion for ${plural(rows.length, 'department')}`);
  };

  const menu: MenuEntry[] = [
    ...(ctx.canCalibrate ? [{ label: 'Open calibration', icon: <Grid3x3 />, onSelect: () => navigate('/performance/calibration') }] : []),
    ...(ctx.isAdmin
      ? [{ label: 'Check-in cycles', icon: <CalendarRange />, onSelect: () => navigate('/performance/cycles') }]
      : ctx.canTeam
        ? [{ label: 'My team', icon: <Users />, onSelect: () => navigate('/performance/team') }]
        : []),
    { label: 'Refresh summary', icon: <RefreshCw />, onSelect: run },
  ];

  const people = plural(ids.size, 'person', 'people');
  const peerUp: Tally = { done: total.cells.peer.done + total.cells.upward.done, total: total.cells.peer.total + total.cells.upward.total };
  const seeOrg =
    ctx.isAdmin && scope === 'team' ? (
      <button type="button" className="neo-btn neo-btn--soft" onClick={() => setScope('org')}>
        <Building2 /> See the whole org
      </button>
    ) : undefined;

  return (
    <NeoStage className="pf-in">
      <NeoHead
        icon={<ChartLine />}
        eyebrow={ctx.isAdmin ? 'People Ops' : 'Insights'}
        title={ctx.isAdmin ? 'Insights' : 'Team insights'}
        sub={`${scopeLabel} · ${people}${cycle ? ` · ${cycle.name}${live ? '' : ' (closed)'}` : ''}`}
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={exportCsv} disabled={!rows.length} data-qa="in-export" title="Download the completion table as CSV">
              <Download /> <span className="neo-btn__label">Export CSV</span>
            </button>
            <NeoMenu
              label="More insight actions"
              items={menu}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions" data-qa="in-more">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-toolbar pf-in-toolbar">
        {ctx.isAdmin ? (
          <PeopleOpsTabs active="insights" />
        ) : (
          <span className="pf-in-scope">
            <Users aria-hidden="true" />
            <span>
              <b>Your org</b> · {people} below you
            </span>
          </span>
        )}
        <div className="pf-in-toolbar__end">
          {ctx.isAdmin && (
            <span data-qa="in-scope">
              <Seg<Scope>
                label="Insights scope"
                size="sm"
                value={scope}
                onChange={setScope}
                options={[
                  {
                    value: 'org',
                    label: (
                      <span className="pf-in-seg-label">
                        <Building2 aria-hidden="true" /> Org
                      </span>
                    ),
                    title: 'Everyone in the company',
                  },
                  {
                    value: 'team',
                    label: (
                      <span className="pf-in-seg-label">
                        <Users aria-hidden="true" /> My team
                      </span>
                    ),
                    title: 'People below you in the org chart',
                  },
                ]}
              />
            </span>
          )}
          {cycle && (
            <Chip tone={live ? 'success' : 'slate'} size="sm" icon={live ? undefined : <History />}>
              {cycle.name}
              {live ? ' · live' : ' · closed'}
            </Chip>
          )}
        </div>
      </div>

      <div className="neo-body neo-pad pf-in-body">
        {!cycle ? (
          <NeoEmpty
            icon={<ChartLine />}
            title="No check-in cycle yet"
            action={
              ctx.isAdmin ? (
                <Link className="neo-btn neo-btn--plasma" to="/performance/cycles?new=1">
                  Launch a cycle
                </Link>
              ) : (
                <Link className="neo-btn neo-btn--soft" to="/performance/okrs">
                  Open OKRs
                </Link>
              )
            }
          >
            Insights fill in once the first quarterly check-in launches.
          </NeoEmpty>
        ) : !ids.size ? (
          <NeoEmpty icon={<Users />} title="No one reports to you yet" action={seeOrg}>
            Team insights appear once people join your org.
          </NeoEmpty>
        ) : (
          <>
            {!live && (
              <div className="pf-in-banner">
                <History aria-hidden="true" />
                <span>No cycle is running — showing {cycle.name}.</span>
                {ctx.isAdmin && (
                  <Link className="pf-in-link" to="/performance/cycles?new=1">
                    Launch the next one <ArrowRight aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}

            <div className="pf-in-kpis">
              <Kpi icon={<PencilLine />} label="Self-reflections" value={total.cells.self.total ? pctS(ratio(total.cells.self)) : '—'} sub={`${total.cells.self.done} of ${total.cells.self.total} in`} v={ratio(total.cells.self)} tone={completionTone(total.cells.self)} />
              <Kpi icon={<MessagesSquare />} label="Peer & upward" value={peerUp.total ? pctS(ratio(peerUp)) : '—'} sub={`${peerUp.done} of ${peerUp.total} written`} v={ratio(peerUp)} tone={completionTone(peerUp)} />
              <Kpi icon={<Target />} label="OKR progress" value={okr.avg != null ? pctS(okr.avg) : '—'} sub={`${plural(okr.count, 'objective')} · ${period?.label ?? 'this quarter'}`} v={okr.avg ?? 0} tone="violet" />
              <Kpi icon={<MessageSquareHeart />} label={`Feedback · ${WEEKS} weeks`} value={String(fb.total)} sub={fb.total ? `${pctS(fb.praise / fb.total)} praise · ${fb.constructive} constructive` : 'None shared yet'} tone="pink" />
            </div>

            <NovaBox
              title="Insight summary"
              hud={`${scopeLabel} · ${cycle.name}`}
              className="pf-in-nova"
              actions={
                <button type="button" className="neo-iconbtn" onClick={run} disabled={nova.thinking} aria-label="Regenerate summary" title="Regenerate summary">
                  <RefreshCw />
                </button>
              }
            >
              <div data-qa="in-nova">{nova.thinking ? <NovaThinking label="Nova is reading the numbers" /> : <p className="pf-in-nova__text">{nova.shown}</p>}</div>
            </NovaBox>

            <div className="pf-in-grid">
              {/* Completion by department */}
              <Section className="pf-in-card pf-in-span-8" icon={<CircleCheck />} hud={`${cycle.name} · lowest first`} title="Check-in completion by department">
                <div className="pf-in-card__body">
                  {rows.length > 3 && (
                    <div className="pf-in-card__tools">
                      <NeoSearch value={deptQ} onChange={setDeptQ} placeholder="Filter departments…" size="sm" label="Filter departments" />
                    </div>
                  )}
                  {!rows.length ? (
                    <NeoEmpty
                      compact
                      icon={<Users />}
                      title={`No one in ${scopeFor} is part of ${cycle.name}`}
                      action={
                        seeOrg ??
                        (ctx.isAdmin ? (
                          <Link className="neo-btn neo-btn--soft" to="/performance/cycles">
                            Open cycles
                          </Link>
                        ) : (
                          <Link className="neo-btn neo-btn--soft" to="/performance/team">
                            Open my team
                          </Link>
                        ))
                      }
                    >
                      Completion appears once people in this scope join a cycle.
                    </NeoEmpty>
                  ) : !shownRows.length ? (
                    <NeoEmpty
                      compact
                      icon={<Users />}
                      title={`No department matches “${deptQ}”`}
                      action={
                        <button type="button" className="neo-btn neo-btn--soft" onClick={() => setDeptQ('')}>
                          Clear filter
                        </button>
                      }
                    />
                  ) : (
                    <div className="pf-in-table" role="table" aria-label={`Check-in completion by department, ${cycle.name}`} data-qa="in-table">
                      <div className="pf-in-table__row pf-in-table__row--head" role="row">
                        <span role="columnheader">Department</span>
                        {COMP_COLS.map((c) => (
                          <span key={c.key} role="columnheader" title={c.label}>
                            {c.short}
                          </span>
                        ))}
                        <span role="columnheader">Overall</span>
                      </div>
                      {shownRows.map((r) => (
                        <CompRow key={r.dept} r={r} />
                      ))}
                      {rows.length > 1 && <CompRow r={total} total />}
                    </div>
                  )}
                  <p className="pf-in-foot">Peer and upward count the feedback each department was asked to write; manager counts the reviews written for it.</p>
                </div>
              </Section>

              {/* 9-box */}
              <Section
                className="pf-in-card pf-in-span-4"
                icon={<Grid3x3 />}
                hud={`${cycle.name} · ${box?.placed ?? 0} placed`}
                title="9-box summary"
                actions={
                  ctx.canCalibrate ? (
                    <Link className="pf-in-link" to="/performance/calibration">
                      Calibrate <ArrowRight aria-hidden="true" />
                    </Link>
                  ) : undefined
                }
              >
                <div className="pf-in-card__body">
                  {!box?.scope ? (
                    <NeoEmpty compact icon={<Grid3x3 />} title="No one to place in this scope" action={seeOrg}>
                      People you can calibrate show up here with their 9-box placement.
                    </NeoEmpty>
                  ) : (
                    <>
                      <div className="pf-in-box-wrap" data-qa="in-box">
                        <span className="pf-in-box__y" aria-hidden="true">
                          Potential →
                        </span>
                        <div className="pf-in-box" role="table" aria-label="People per 9-box">
                          {([3, 2, 1] as BoxAxis[]).map((pot) => (
                            <div key={pot} className="pf-in-box__row" role="row">
                              {([1, 2, 3] as BoxAxis[]).map((perf) => {
                                const k = boxKey(perf, pot);
                                const m = BOX_META[k];
                                const n = box.counts[k] ?? 0;
                                return (
                                  <span key={k} role="cell" className={cx('pf-in-box__cell', !n && 'is-empty')} data-tone={m.tone} style={{ '--w': (n / box.max).toFixed(2) } as CSSProperties} aria-label={`${m.label}: ${plural(n, 'person', 'people')}`}>
                                    <b aria-hidden="true">{n}</b>
                                    <span aria-hidden="true">{m.label}</span>
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <span className="pf-in-box__x" aria-hidden="true">
                          <span>Low</span>
                          <span>Performance →</span>
                          <span>High</span>
                        </span>
                      </div>
                      <div className="pf-in-box__stats">
                        <span>
                          <b>{box.calibrated}</b> calibrated
                        </span>
                        <span>
                          <b>{box.placed - box.calibrated}</b> from ratings or last cycle
                        </span>
                        <span>
                          <b>{box.unplaced}</b> not placed
                        </span>
                      </div>
                      <p className="pf-in-foot">Same visibility as Calibration — ratings you can’t see yet are left out.</p>
                    </>
                  )}
                </div>
              </Section>

              {/* OKR attainment */}
              <Section className="pf-in-card pf-in-span-6" icon={<Target />} hud={`${period?.label ?? 'This quarter'} · ${plural(okr.count, 'objective')}`} title="OKR attainment">
                <div className="pf-in-card__body">
                  {!okr.count ? (
                    <NeoEmpty
                      compact
                      icon={<Target />}
                      title="No objectives this quarter"
                      action={
                        <Link className="neo-btn neo-btn--soft" to="/performance/okrs">
                          Open OKRs
                        </Link>
                      }
                    >
                      Objectives owned by people in this scope chart here.
                    </NeoEmpty>
                  ) : (
                    <>
                      <div className="pf-in-hist" role="img" aria-label={`Objectives by progress: ${okr.buckets.map((b) => `${b.label}: ${b.total}`).join(', ')}`} data-qa="in-hist">
                        {okr.buckets.map((b) => (
                          <div key={b.label} className="pf-in-hist__col">
                            <div className="pf-in-hist__plot">
                              <span className="pf-in-hist__n">{b.total || ''}</span>
                              <div className={cx('pf-in-hist__bar', !b.total && 'is-zero')} style={{ '--h': (b.total / okr.max).toFixed(3) } as CSSProperties}>
                                {STATUS_STACK.map((s) => (b.counts[s] ? <i key={s} style={{ flexGrow: b.counts[s], background: STATUS_META[s].color }} title={`${STATUS_META[s].label}: ${b.counts[s]}`} /> : null))}
                              </div>
                            </div>
                            <span className="pf-in-hist__label">{b.label}</span>
                          </div>
                        ))}
                      </div>
                      <ul className="pf-in-legend" aria-label="Objectives by status">
                        {STATUS_STACK.map((s) => (
                          <li key={s}>
                            <i style={{ background: STATUS_META[s].color }} aria-hidden="true" />
                            {STATUS_META[s].label} <b>{okr.byStatus[s]}</b>
                          </li>
                        ))}
                        <li className="pf-in-legend__end">
                          Average <b>{pctS(okr.avg ?? 0)}</b>
                        </li>
                      </ul>
                    </>
                  )}
                </div>
              </Section>

              {/* Ratings vs guidance */}
              <Section className="pf-in-card pf-in-span-6" icon={<Scale />} hud={ratings?.total ? `${ratings.source.name} · ${plural(ratings.total, 'rating')}` : cycle.name} title="Ratings vs guidance">
                <div className="pf-in-card__body">
                  {!ratings?.total ? (
                    <NeoEmpty
                      compact
                      icon={<Scale />}
                      title="No ratings you can see yet"
                      action={
                        ctx.canCalibrate ? (
                          <Link className="neo-btn neo-btn--soft" to="/performance/calibration">
                            Open calibration
                          </Link>
                        ) : undefined
                      }
                    >
                      Manager ratings appear once reviews are written and visible to you.
                    </NeoEmpty>
                  ) : (
                    <>
                      {ratings.fallback && (
                        <p className="pf-in-note">
                          <History aria-hidden="true" />
                          <span>
                            Showing {ratings.source.name} — only {plural(ratings.liveCount, 'rating')} visible to you in {cycle.name} so far.
                          </span>
                        </p>
                      )}
                      <div className="pf-in-dist" data-qa="in-dist">
                        {ratings.rows.map((r) => (
                          <div key={r.id} className="pf-in-dist__row" data-tone={r.tone} role="group" aria-label={`${r.label}: ${r.count} (${pctS(r.share)}), guidance ${pctS(r.guidance)}`}>
                            <span className="pf-in-dist__label" aria-hidden="true">
                              {r.label}
                            </span>
                            <span className="pf-in-dist__track" aria-hidden="true">
                              <i style={{ width: `${r.share * 100}%` }} />
                              <b style={{ left: `${r.guidance * 100}%` }} />
                            </span>
                            <span className="pf-in-dist__val" aria-hidden="true">
                              {pctS(r.share)}
                              <small>
                                {r.count} · guide {pctS(r.guidance)}
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="pf-in-foot">Ticks mark the guidance curve. Only ratings visible to you are counted.</p>
                    </>
                  )}
                </div>
              </Section>

              {/* Feedback volume */}
              <Section className="pf-in-card pf-in-span-6" icon={<MessageSquareHeart />} hud={`Last ${WEEKS} weeks · ${fb.total}`} title="Feedback volume">
                <div className="pf-in-card__body">
                  {!fb.total ? (
                    <NeoEmpty
                      compact
                      icon={<MessageSquareHeart />}
                      title={`No feedback in the last ${WEEKS} weeks`}
                      action={
                        <Link className="neo-btn neo-btn--soft" to="/performance/feedback">
                          Give feedback
                        </Link>
                      }
                    >
                      Praise and constructive notes to people in this scope chart here — counts only.
                    </NeoEmpty>
                  ) : (
                    <>
                      <div className="pf-in-fb" role="img" aria-label={`Feedback per week: ${fb.weeks.map((w) => `week of ${shortDate(w.from)}: ${w.praise} praise, ${w.constructive} constructive`).join('; ')}`} data-qa="in-fb">
                        {fb.weeks.map((w, i) => {
                          const n = w.praise + w.constructive;
                          const isNow = i === WEEKS - 1;
                          return (
                            <div key={w.from} className={cx('pf-in-fb__col', isNow && 'is-now')}>
                              <div className="pf-in-fb__plot">
                                <span className="pf-in-fb__n">{n || ''}</span>
                                <div className={cx('pf-in-fb__bar', !n && 'is-zero')} style={{ '--h': (n / fb.max).toFixed(3) } as CSSProperties}>
                                  {w.praise > 0 && <i className="pf-in-praise" style={{ flexGrow: w.praise }} />}
                                  {w.constructive > 0 && <i className="pf-in-constructive" style={{ flexGrow: w.constructive }} />}
                                </div>
                              </div>
                              <span className="pf-in-fb__label">{isNow ? 'This wk' : shortDate(w.from)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <ul className="pf-in-legend" aria-label="Feedback mix">
                        <li>
                          <i className="pf-in-praise" aria-hidden="true" />
                          Praise <b>{fb.praise}</b>
                        </li>
                        <li>
                          <i className="pf-in-constructive" aria-hidden="true" />
                          Constructive <b>{fb.constructive}</b>
                        </li>
                        <li className="pf-in-legend__end">
                          <Trend delta={(fb.recent - fb.earlier) / Math.max(1, fb.earlier)} flat={0.1}>
                            {fb.earlier ? `${signed(((fb.recent - fb.earlier) / fb.earlier) * 100, 0)}% vs the 4 weeks before` : 'New in the last 4 weeks'}
                          </Trend>
                        </li>
                      </ul>
                      <p className="pf-in-foot">Counts only — what people wrote stays with them.</p>
                    </>
                  )}
                </div>
              </Section>

              {/* Manager effectiveness */}
              <Section className="pf-in-card pf-in-span-6" icon={<UserCheck />} hud={`Upward feedback · ${cycle.name}`} title="Manager effectiveness">
                <div className="pf-in-card__body">
                  {mgrs.length > 4 && (
                    <div className="pf-in-card__tools">
                      <NeoSearch value={mgrQ} onChange={setMgrQ} placeholder="Filter managers…" size="sm" label="Filter managers" />
                    </div>
                  )}
                  {!mgrs.length ? (
                    <NeoEmpty compact icon={<UserCheck />} title="No managers in this scope" action={seeOrg}>
                      Upward feedback is summarised for people who lead a team.
                    </NeoEmpty>
                  ) : !shownMgrs.length ? (
                    <NeoEmpty
                      compact
                      icon={<UserCheck />}
                      title={`No manager matches “${mgrQ}”`}
                      action={
                        <button type="button" className="neo-btn neo-btn--soft" onClick={() => setMgrQ('')}>
                          Clear filter
                        </button>
                      }
                    />
                  ) : (
                    <ul className="pf-in-mgrs" data-qa="in-mgrs">
                      {shownMgrs.map((m) => (
                        <MgrItem key={m.id} m={m} ctx={ctx} prevName={prev?.name} />
                      ))}
                    </ul>
                  )}
                  <p className="pf-in-foot">Anonymous averages on a 1–5 scale, shown only with {cycle.upwardMin}+ responses. Individual answers never appear here.</p>
                </div>
              </Section>
            </div>
          </>
        )}
      </div>
    </NeoStage>
  );
}
