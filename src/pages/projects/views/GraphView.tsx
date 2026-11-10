/**
 * Graph — dependency constellation. Tasks are glowing nodes laid out left →
 * right by dependency depth; edges are "blocked by" links; the critical path
 * (most remaining work) glows with plasma.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Route, Scan, Sparkles, Waypoints } from 'lucide-react';
import { NeoEmpty } from '@/components/neo';
import { cx } from '@/lib/cx';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { addDays, formatDue, isWeekend, todayIso, diffDays } from '@/projects/dates';
import { layoutGraph, openBlockers } from '@/projects/graph';
import { taskKey } from '@/projects/metrics';
import type { Project, Task } from '@/projects/types';
import { useProjectsUI, useUsersMap } from '../ctx';
import { applyFilters, type Filters } from './shared';
import { useActor } from '../ctx';

const R = 13;

function finishDate(hours: number): string {
  let days = Math.ceil(hours / 6);
  let d = todayIso();
  while (days > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) days -= 1;
  }
  return d;
}

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function GraphView({ project, tasks, filters }: { project: Project; tasks: Task[]; filters: Filters }) {
  const ui = useProjectsUI();
  const actor = useActor()!;
  const users = useUsersMap();
  const mobile = useIsMobile();
  const [critOnly, setCritOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(900);

  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const match = useMemo(() => new Set(applyFilters(tasks, filters, actor.id, project).map((t) => t.id)), [tasks, filters, actor.id, project]);
  const layout = useMemo(
    () =>
      layoutGraph(
        tasks.map((t) => ({ id: t.id, blockedBy: t.blockedBy.filter((b) => byId.has(b)), done: !!t.completedAt, estimate: t.estimate, milestone: t.kind === 'milestone' })),
        { connectedOnly: !showAll, colW: mobile ? 190 : 236, rowH: 76, padX: 34, padY: 40 },
      ),
    [tasks, byId, showAll, mobile],
  );
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const crit = useMemo(() => new Set(layout.critical), [layout]);
  const labelW = mobile ? 150 : 178;
  const W = layout.width + labelW;
  const H = Math.max(layout.height, 220);
  const fit = Math.max(0.55, Math.min(1, (cw - 8) / W));
  const scale = zoom ?? fit;

  // lineage of the hovered node (all upstream + downstream)
  const lineage = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    const up = [hover];
    while (up.length) {
      const id = up.pop()!;
      for (const e of layout.edges) if (e.to === id && !set.has(e.from)) set.add(e.from), up.push(e.from);
    }
    const down = [hover];
    const seenDown = new Set<string>([hover]);
    while (down.length) {
      const id = down.pop()!;
      for (const e of layout.edges) if (e.from === id && !seenDown.has(e.to)) seenDown.add(e.to), set.add(e.to), down.push(e.to);
    }
    return set;
  }, [hover, layout.edges]);

  const stars = useMemo(() => {
    const rnd = seeded(project.id);
    return Array.from({ length: Math.round((W * H) / 9000) }, () => ({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.1 + 0.25, o: rnd() * 0.5 + 0.15 }));
  }, [project.id, W, H]);

  if (!layout.nodes.length)
    return (
      <div className="neo-pad">
        <NeoEmpty
          icon={<Waypoints />}
          title="No dependencies yet"
          action={
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => setShowAll(true)}>
              Show all tasks
            </button>
          }
        >
          Mark tasks as “blocked by” each other in the task panel and the constellation — with its critical path — appears here.
        </NeoEmpty>
      </div>
    );

  const critTasks = layout.critical.map((id) => byId.get(id)!).filter(Boolean);
  const finish = layout.criticalHours > 0 ? finishDate(layout.criticalHours) : null;
  const slack = finish ? diffDays(finish, project.dueDate) : null;
  const ms = critTasks.find((t) => t.kind === 'milestone');
  const hovered = hover ? byId.get(hover) : undefined;
  const hp = hover ? pos.get(hover) : undefined;

  const stateOf = (t: Task) => (t.completedAt ? 'done' : t.kind === 'milestone' ? 'ms' : openBlockers(t, byId).length ? 'blocked' : project.sections.find((s) => s.id === t.sectionId)?.stage === 'doing' ? 'doing' : 'todo');

  return (
    <div className="pj-graph">
      <div className="pj-graph__hud">
        <div className="pj-graph__cp">
          <span className="pj-graph__cpicon">
            <Route />
          </span>
          <div>
            <div className="neo-hud neo-hud--tint">Critical path</div>
            <div className="pj-graph__cptext">
              {critTasks.length ? (
                <>
                  <strong>{critTasks.length} tasks</strong> · <strong>{layout.criticalHours}h</strong> of work left
                  {ms ? <> · unlocks {ms.title}</> : null}
                  {finish && (
                    <>
                      {' '}
                      · est. finish <strong>{formatDue(finish)}</strong>{' '}
                      <span className={cx('pj-slack', slack !== null && slack < 0 && 'is-late')}>{slack !== null && slack < 0 ? `${-slack}d after due date` : `${slack}d of slack`}</span>
                    </>
                  )}
                </>
              ) : (
                'All remaining work is done — nothing on the critical path.'
              )}
            </div>
          </div>
        </div>
        <div className="pj-graph__tools">
          <button type="button" className={cx('pj-fchip', critOnly && 'is-on')} aria-pressed={critOnly} onClick={() => setCritOnly((v) => !v)} data-qa="crit-only">
            <Sparkles /> Critical path only
          </button>
          <button type="button" className={cx('pj-fchip', showAll && 'is-on')} aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
            Show unlinked tasks
          </button>
          <span className="pj-graph__zoom">
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.4, +(scale - 0.15).toFixed(2)))}>
              <Minus />
            </button>
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Fit to width" data-tip="Fit" onClick={() => setZoom(null)}>
              <Scan />
            </button>
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Zoom in" onClick={() => setZoom(Math.min(1.6, +(scale + 0.15).toFixed(2)))}>
              <Plus />
            </button>
          </span>
        </div>
      </div>

      <div className="pj-graph__canvas" ref={canvas}>
        <div className="pj-graph__stage" style={{ width: W * scale, height: H * scale }}>
          <svg className="pj-graph__svg" width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Dependency graph for ${project.name}`}>
            <defs>
              <linearGradient id="pj-crit" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--app-c1)" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
              <filter id="pj-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker id="pj-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 1 L9 5 L0 9 z" className="pj-arrow" />
              </marker>
              <marker id="pj-arrow-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                <path d="M0 1 L9 5 L0 9 z" fill="#f472b6" />
              </marker>
            </defs>
            <g className="pj-stars" aria-hidden="true">
              {stars.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
              ))}
            </g>
            {layout.layers.map((_, li) => (
              <text key={li} x={34 + li * (mobile ? 190 : 236)} y={18} className="pj-graph__layer">
                {li === 0 ? 'START' : `STAGE ${li}`}
              </text>
            ))}
            <g className="pj-edges">
              {layout.edges.map((e) => {
                const a = pos.get(e.from)!;
                const b = pos.get(e.to)!;
                const x1 = a.x + R + 2;
                const x2 = b.x - R - 4;
                const dx = Math.max(30, (x2 - x1) / 2);
                const d = `M${x1},${a.y} C${x1 + dx},${a.y} ${x2 - dx},${b.y} ${x2},${b.y}`;
                const dim = (lineage && !(lineage.has(e.from) && lineage.has(e.to))) || (critOnly && !e.critical);
                return (
                  <g key={`${e.from}-${e.to}`} className={cx('pj-edge', e.critical && 'is-crit', dim && 'is-dim', critOnly && !e.critical && 'is-hidden')}>
                    <path d={d} markerEnd={`url(#${e.critical ? 'pj-arrow-crit' : 'pj-arrow'})`} />
                    {e.critical && <path d={d} className="pj-edge__flow" />}
                  </g>
                );
              })}
            </g>
            <g className="pj-nodes">
              {layout.nodes.map((n) => {
                const t = byId.get(n.id);
                if (!t) return null;
                const st = stateOf(t);
                const isCrit = crit.has(n.id);
                const dim = (lineage && !lineage.has(n.id)) || !match.has(n.id);
                const hidden = critOnly && !isCrit;
                const title = t.title.length > 26 ? `${t.title.slice(0, 25)}…` : t.title;
                return (
                  <g
                    key={n.id}
                    className={cx('pj-node', `is-${st}`, isCrit && 'is-crit', dim && 'is-dim', hidden && 'is-hidden', hover === n.id && 'is-hover')}
                    transform={`translate(${n.x},${n.y})`}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover((h) => (h === n.id ? null : h))}
                    onClick={() => ui.openTask(n.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ui.openTask(n.id)}
                    tabIndex={hidden ? -1 : 0}
                    role="button"
                    aria-label={`${taskKey(project, t)} ${t.title}${isCrit ? ', on the critical path' : ''}`}
                    data-qa="graph-node"
                  >
                    {isCrit && <circle r={R + 9} className="pj-node__halo" filter="url(#pj-glow)" />}
                    {st === 'ms' ? <path d={`M0,${-R - 3} L${R + 3},0 L0,${R + 3} L${-R - 3},0 Z`} className="pj-node__core" /> : <circle r={R} className="pj-node__core" />}
                    {st === 'done' && <path d="M-5,0.5 L-1.5,4 L5,-3.5" className="pj-node__tick" />}
                    {st === 'blocked' && <rect x={-3} y={-4} width={6} height={8} rx={1.5} className="pj-node__lock" />}
                    <text x={R + 10} y={-3} className="pj-node__key">
                      {taskKey(project, t)}
                      {t.estimate && !t.completedAt ? ` · ${t.estimate}h` : ''}
                    </text>
                    <text x={R + 10} y={13} className="pj-node__title">
                      {title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {hovered && hp && (
            <div className="pj-graph__tip" style={{ left: Math.min((hp.x + R + 14) * scale, W * scale - 250), top: (hp.y + 26) * scale }}>
              <div className="pj-graph__tiptitle">{hovered.title}</div>
              <div className="pj-graph__tipmeta">
                <span className="neo-mono">{taskKey(project, hovered)}</span> · {hovered.assigneeId ? users.get(hovered.assigneeId)?.name : 'Unassigned'}
                {hovered.dueDate ? ` · due ${formatDue(hovered.dueDate)}` : ''}
                {hovered.estimate ? ` · ${hovered.estimate}h` : ''}
              </div>
              {openBlockers(hovered, byId).length > 0 && <div className="pj-graph__tipblock">Waiting on {openBlockers(hovered, byId).map((b) => taskKey(project, b)).join(', ')}</div>}
              {crit.has(hovered.id) && <div className="pj-graph__tipcrit">On the critical path — a slip here delays the project.</div>}
            </div>
          )}
        </div>
      </div>

      <div className="pj-graph__legend" aria-label="Legend">
        <span>
          <i className="is-todo" /> To do
        </span>
        <span>
          <i className="is-doing" /> In progress
        </span>
        <span>
          <i className="is-blocked" /> Blocked
        </span>
        <span>
          <i className="is-done" /> Done
        </span>
        <span>
          <i className="is-ms" /> Milestone
        </span>
        <span>
          <i className="is-crit" /> Critical path
        </span>
      </div>
    </div>
  );
}
