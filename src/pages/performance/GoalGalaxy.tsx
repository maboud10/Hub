/**
 * Goal Galaxy (signature) — the company's alignment as a living star map.
 * Company objectives are stars on the inner orbit, team objectives orbit them,
 * individual objectives sit on the outer orbit. Size = number of key results,
 * colour/glow = status, ring = progress. Hover for a card, click to zoom into a
 * branch, Escape to zoom out. Pure SVG, keyboard accessible, reduced-motion aware.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Minimize2 } from 'lucide-react';
import { cx } from '@/lib/cx';
import { initials } from '@/lib/format';
import { STATUS_META } from '@/performance/constants';
import { branchIds, layoutGalaxy, type GalaxyNode } from '@/performance/galaxy';
import type { ObjectiveRollup } from '@/performance/selectors';
import type { KrStatus } from '@/performance/types';
import type { PerfCtx } from './hooks';
import { LevelChip, StatusChip } from './ui';

const SIZE = 640;
type VB = [number, number, number, number];
const FULL: VB = [0, 0, SIZE, SIZE];

const reduced = () => typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const rnd = mulberry32(42);
  return Array.from({ length: 110 }, (_, i) => ({ id: i, x: rnd() * SIZE, y: rnd() * SIZE, r: rnd() * 1.1 + 0.25, o: rnd() * 0.5 + 0.15, d: rnd() * 6 }));
})();

function useTweenVB(target: VB): VB {
  const [vb, setVb] = useState<VB>(target);
  const cur = useRef<VB>(target);
  useEffect(() => {
    const from = cur.current;
    if (from.every((v, i) => Math.abs(v - target[i]) < 0.5)) return;
    if (reduced()) {
      cur.current = target;
      setVb(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 650;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const next = from.map((v, i) => v + (target[i] - v) * e) as VB;
      cur.current = next;
      setVb(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target[0], target[1], target[2], target[3]]);
  return vb;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ w: el.clientWidth, h: el.clientHeight });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function GoalGalaxy({
  ctx,
  rows,
  matches,
  selected,
  onSelect,
  onOpen,
  centerLabel,
}: {
  ctx: PerfCtx;
  rows: ObjectiveRollup[];
  /** Ids matching the current filters (others dim). null = no filter. */
  matches: Set<string> | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  centerLabel: string;
}) {
  const [wrapRef, box] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const byId = useMemo(() => new Map(rows.map((r) => [r.o.id, r])), [rows]);
  const layout = useMemo(() => layoutGalaxy(rows.map((r) => ({ id: r.o.id, level: r.o.level, parentId: r.o.parentId, krs: r.krs.length })), SIZE), [rows]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const branch = useMemo(() => (selected && nodeById.has(selected) ? branchIds(layout, selected) : null), [layout, selected, nodeById]);

  const target = useMemo<VB>(() => {
    if (!branch) return FULL;
    const ns = layout.nodes.filter((n) => branch.has(n.id));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of ns) {
      x0 = Math.min(x0, n.x - n.r - 30);
      y0 = Math.min(y0, n.y - n.r - 30);
      x1 = Math.max(x1, n.x + n.r + 30);
      y1 = Math.max(y1, n.y + n.r + 44);
    }
    let w = Math.max(240, x1 - x0, y1 - y0);
    w = Math.min(SIZE, w * 1.08);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return [Math.max(-40, Math.min(SIZE - w + 40, cx - w / 2)), Math.max(-40, Math.min(SIZE - w + 40, cy - w / 2)), w, w];
  }, [branch, layout]);
  const vb = useTweenVB(target);
  const zoom = SIZE / vb[2];

  // map SVG coords → container pixels (preserveAspectRatio: xMidYMid meet)
  const scale = Math.min(box.w / vb[2], box.h / vb[3]) || 1;
  const offX = (box.w - vb[2] * scale) / 2;
  const offY = (box.h - vb[3] * scale) / 2;
  const toPx = (x: number, y: number) => ({ left: offX + (x - vb[0]) * scale, top: offY + (y - vb[1]) * scale });

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && selected) onSelect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect]);

  const dimmed = (id: string) => (branch ? !branch.has(id) : false) || (matches ? !matches.has(id) : false);
  const statusOf = (id: string): KrStatus => byId.get(id)?.status ?? 'on-track';
  const linkPath = (n: GalaxyNode, p: GalaxyNode) => {
    const c = layout.center;
    const rMid = (Math.hypot(n.x - c, n.y - c) + Math.hypot(p.x - c, p.y - c)) / 2;
    const qx = c + Math.cos(n.angle) * rMid;
    const qy = c + Math.sin(n.angle) * rMid;
    return `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${n.x.toFixed(1)},${n.y.toFixed(1)}`;
  };

  const onNodeKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selected === id) onOpen(id);
      else onSelect(id);
    }
  };

  const hovered = hover ? byId.get(hover) : null;
  const hn = hover ? nodeById.get(hover) : null;
  const showLabel = (n: GalaxyNode) => n.level === 'company' || (n.level === 'team' && zoom > 1.05) || (n.level === 'individual' && zoom > 1.9) || n.id === selected;
  const showTeamShort = (n: GalaxyNode) => n.level === 'team' && zoom <= 1.05;

  return (
    <div className="pf-gx" ref={wrapRef} data-zoomed={branch ? 'true' : undefined}>
      <svg className="pf-gx__svg" viewBox={vb.map((v) => v.toFixed(2)).join(' ')} preserveAspectRatio="xMidYMid meet" role="group" aria-label={`Goal Galaxy: ${rows.length} objectives`} onClick={() => selected && onSelect(null)}>
        <defs>
          <radialGradient id="gx-core" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="var(--app-c1)" />
            <stop offset="100%" stopColor="var(--app-c2)" />
          </radialGradient>
          <radialGradient id="gx-nebula" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.22" />
            <stop offset="55%" stopColor="var(--app-c2)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--app-c2)" stopOpacity="0" />
          </radialGradient>
          {(['on-track', 'at-risk', 'off-track', 'done'] as KrStatus[]).map((s) => (
            <radialGradient key={s} id={`gx-${s}`} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="45%" stopColor={STATUS_META[s].color} />
              <stop offset="100%" stopColor={STATUS_META[s].color} stopOpacity="0.55" />
            </radialGradient>
          ))}
          {(['on-track', 'at-risk', 'off-track', 'done'] as KrStatus[]).map((s) => (
            <radialGradient key={`h${s}`} id={`gxh-${s}`} cx="50%" cy="50%" r="50%">
              <stop offset="40%" stopColor={STATUS_META[s].color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={STATUS_META[s].color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {/* space */}
        <circle cx={layout.center} cy={layout.center} r={SIZE * 0.5} fill="url(#gx-nebula)" />
        <g className="pf-gx__stars" aria-hidden="true">
          {STARS.map((s) => (
            <circle key={s.id} cx={s.x} cy={s.y} r={s.r} opacity={s.o} style={{ animationDelay: `${s.d}s` }} />
          ))}
        </g>
        <g className="pf-gx__orbits" aria-hidden="true">
          {layout.rings.map((r, i) => (
            <g key={r}>
              <circle cx={layout.center} cy={layout.center} r={r} className={`pf-gx__orbit pf-gx__orbit--${i}`} />
              <text x={layout.center} y={layout.center - r - 5} textAnchor="middle" className="pf-gx__orbitlabel">
                {['Company', 'Teams', 'People'][i]}
              </text>
            </g>
          ))}
        </g>

        {/* links */}
        <g className="pf-gx__links" aria-hidden="true">
          {layout.nodes.map((n) => {
            const p = n.parentId ? nodeById.get(n.parentId) : null;
            if (!p) return null;
            const lit = branch?.has(n.id) && branch.has(p.id);
            return <path key={`l${n.id}`} d={linkPath(n, p)} className={cx('pf-gx__link', lit && 'is-lit', dimmed(n.id) && 'is-dim')} stroke={STATUS_META[statusOf(n.id)].color} />;
          })}
        </g>

        {/* core */}
        <g className="pf-gx__core" aria-hidden="true">
          <circle cx={layout.center} cy={layout.center} r={30} className="pf-gx__corering" />
          <circle cx={layout.center} cy={layout.center} r={22} fill="url(#gx-core)" />
          <text x={layout.center} y={layout.center - 1} textAnchor="middle" className="pf-gx__corelabel">
            {centerLabel.split(' ')[0]}
          </text>
          <text x={layout.center} y={layout.center + 10} textAnchor="middle" className="pf-gx__coresub">
            {centerLabel.split(' ')[1] ?? ''}
          </text>
        </g>

        {/* nodes */}
        <g className="pf-gx__nodes">
          {layout.nodes.map((n) => {
            const r = byId.get(n.id)!;
            const s = statusOf(n.id);
            const owner = ctx.user(r.o.ownerId);
            const circ = 2 * Math.PI * (n.r + 3.5);
            const label = `${r.o.title} — ${r.o.level} objective owned by ${owner?.name ?? 'someone'}, ${Math.round(r.progress * 100)}% complete, ${STATUS_META[s].label}`;
            const isSel = n.id === selected;
            return (
              <g
                key={n.id}
                className={cx('pf-gx__node', `pf-gx__node--${n.level}`, isSel && 'is-selected', dimmed(n.id) && 'is-dim', n.unaligned && 'is-unaligned')}
                transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={isSel}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover((h) => (h === n.id ? null : h))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSel) onOpen(n.id);
                  else onSelect(n.id);
                }}
                onKeyDown={(e) => onNodeKey(e, n.id)}
              >
                {n.level !== 'individual' && <circle r={n.r * (n.level === 'company' ? 2.1 : 1.8)} fill={`url(#gxh-${s})`} className="pf-gx__halo" />}
                <circle r={n.r + 3.5} className="pf-gx__track" />
                <circle
                  r={n.r + 3.5}
                  className="pf-gx__prog"
                  stroke={STATUS_META[s].color}
                  strokeDasharray={`${(circ * Math.max(0.02, r.progress)).toFixed(1)} ${circ.toFixed(1)}`}
                  transform="rotate(-90)"
                />
                {n.level === 'individual' && owner ? (
                  <>
                    <circle r={n.r} fill={`hsl(${owner.avatarHue} 70% 55%)`} className="pf-gx__body" />
                    {n.r >= 8 && (
                      <text className="pf-gx__initials" textAnchor="middle" dy="0.35em" fontSize={Math.max(5.5, n.r * 0.72)}>
                        {initials(owner.name)}
                      </text>
                    )}
                  </>
                ) : (
                  <circle r={n.r} fill={`url(#gx-${s})`} className="pf-gx__body" />
                )}
                {n.level === 'company' && (
                  <path className="pf-gx__sparkle" d={`M0,${-n.r - 12} L1.6,${-n.r - 7} L0,${-n.r - 2} L-1.6,${-n.r - 7} Z M${n.r + 12},0 L${n.r + 7},1.6 L${n.r + 2},0 L${n.r + 7},-1.6 Z`} aria-hidden="true" />
                )}
                {showLabel(n) && (
                  <text className={cx('pf-gx__label', `pf-gx__label--${n.level}`)} textAnchor="middle" y={n.r + (n.level === 'company' ? 18 : 14)}>
                    {trunc(r.o.title, n.level === 'company' ? 24 : 20)}
                  </text>
                )}
                {showTeamShort(n) && (
                  <text className="pf-gx__pct" textAnchor="middle" dy="0.35em">
                    {Math.round(r.progress * 100)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && hn && (
        <div className="pf-gx__card neo-portal" style={{ ...toPx(hn.x, hn.y), translate: hn.y - vb[1] < vb[3] * 0.45 ? '-50% 18px' : '-50% calc(-100% - 18px)' }} role="status">
          <div className="pf-row">
            <LevelChip level={hovered.o.level} />
            <StatusChip status={hovered.status} />
          </div>
          <div className="pf-gx__cardtitle">{hovered.o.title}</div>
          <div className="pf-row pf-faint text-xs">
            <span>{ctx.name(hovered.o.ownerId)}</span>
            <span className="pf-spacer" />
            <span className="neo-mono">{Math.round(hovered.progress * 100)}%</span>
            <span>·</span>
            <span>
              {hovered.krs.length} KR{hovered.krs.length === 1 ? '' : 's'}
            </span>
          </div>
          {nodeById.get(hovered.o.id)?.unaligned && <div className="pf-gx__hint">Not aligned to a company objective yet</div>}
          <div className="pf-gx__hint">{selected === hovered.o.id ? 'Click again to open' : 'Click to focus this branch'}</div>
        </div>
      )}

      {branch && (
        <div className="pf-gx__crumbs">
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => onSelect(null)} data-qa="galaxy-reset">
            <Minimize2 /> Whole galaxy
          </button>
          {selected && (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => onOpen(selected)}>
              Open objective <ArrowRight />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function GalaxyLegend() {
  return (
    <div className="pf-gx__legend" aria-label="Legend">
      {(['on-track', 'at-risk', 'off-track', 'done'] as KrStatus[]).map((s) => (
        <span key={s} className="pf-gx__legenditem" data-status={s}>
          <span className="pf-dot" aria-hidden="true" />
          {STATUS_META[s].label}
        </span>
      ))}
      <span className="pf-gx__legendsep" aria-hidden="true" />
      <span className="pf-faint">Size = key results · ring = progress</span>
    </div>
  );
}
