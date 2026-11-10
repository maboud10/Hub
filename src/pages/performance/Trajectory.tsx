/**
 * Trajectory chart (signature) — a key result's actual check-ins against the ideal
 * line from start → target, with a forecast cone (least-squares trend, widened by
 * residual error and low confidence) predicting the end-of-quarter value.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { STATUS_META } from '@/performance/constants';
import { forecastKr, formatValue, idealValue, krStatus, milestoneTotal, trendPoints } from '@/performance/okr';
import type { KeyResult, Period } from '@/performance/types';

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function Trajectory({ kr, period, now, height = 220, compact = false, className }: { kr: KeyResult; period: Period; now: number; height?: number; compact?: boolean; className?: string }) {
  const [ref, width] = useWidth(compact ? 160 : 560);
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const status = krStatus(kr, period, now);
  const meta = STATUS_META[status];
  const f = useMemo(() => forecastKr(kr, period, now), [kr, period, now]);
  const cks = useMemo(() => kr.checkins.filter((c) => c.at <= now).sort((a, b) => a.at - b.at), [kr.checkins, now]);
  const pts = useMemo(() => trendPoints(kr, period, now), [kr, period, now]);
  useEffect(() => setHover(null), [kr.id]);

  const padL = compact ? 3 : 46;
  const padR = compact ? 3 : 74;
  const padT = compact ? 5 : 22;
  const padB = compact ? 5 : 26;
  const W = width;
  const H = height;
  const ended = now >= period.end;
  const showCone = !ended && kr.metric !== 'boolean' && f.method === 'trend';

  const values = [kr.start, kr.target, ...pts.map((p) => p.v), ...(showCone ? [f.low, f.high, f.value] : [])];
  if (kr.metric === 'milestone') values.push(0, milestoneTotal(kr));
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (kr.metric === 'percent') {
    lo = Math.max(0, lo);
    hi = Math.min(100, hi);
  }
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
  const y0 = kr.metric === 'percent' ? Math.max(0, lo - pad) : lo - pad;
  const y1 = kr.metric === 'percent' ? Math.min(100, hi + pad) : hi + pad;
  const x = (t: number) => padL + ((t - period.start) / (period.end - period.start)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - y0) / (y1 - y0 || 1)) * (H - padT - padB);

  const stepped = kr.metric === 'milestone' || kr.metric === 'boolean' || !!kr.ceiling;
  const actualPath = pts
    .map((p, i) => {
      if (i === 0) return `M${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      return stepped ? `H${x(p.t).toFixed(1)}V${y(p.v).toFixed(1)}` : `L${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
    })
    .join(' ');
  const lastPt = pts[pts.length - 1];
  const areaPath = `${actualPath} V${(H - padB).toFixed(1)} H${x(pts[0].t).toFixed(1)} Z`;
  const idealStart = kr.ceiling ? kr.target : kr.metric === 'milestone' ? 0 : kr.start;
  const idealEnd = kr.metric === 'milestone' ? milestoneTotal(kr) : kr.target;
  const todayX = x(Math.min(now, period.end));
  const fx = x(period.end);
  const cone = showCone ? `M${x(f.from.t).toFixed(1)},${y(f.from.v).toFixed(1)} L${fx.toFixed(1)},${y(f.high).toFixed(1)} L${fx.toFixed(1)},${y(f.low).toFixed(1)} Z` : '';

  const yTicks = compact ? [] : niceTicks(y0, y1, 4).filter((v) => v >= y0 && v <= y1);
  const months: number[] = [];
  if (!compact) {
    const d = new Date(period.start);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= period.end) {
      if (d.getTime() >= period.start) months.push(d.getTime());
      d.setMonth(d.getMonth() + 1);
    }
  }
  const idealNow = idealValue(kr, period, Math.min(now, period.end));
  const summary = `${kr.title}: now ${formatValue(kr, kr.current)}; plan ${formatValue(kr, idealNow)} today; ${showCone ? `forecast ${formatValue(kr, f.value)} by end of quarter` : ''}; target ${formatValue(kr, kr.target)}. ${meta.label}.`;
  const hovered = hover !== null ? cks[hover] : null;

  return (
    <div ref={ref} className={cx('pf-traj', compact && 'pf-traj--compact', className)} data-status={status} style={{ height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <defs>
          <linearGradient id={`ln${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--app-c1)" />
            <stop offset="100%" stopColor="var(--app-c2)" />
          </linearGradient>
          <linearGradient id={`ar${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--app-c2)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`cn${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={meta.color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={meta.color} stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {!compact && (
          <g className="pf-traj__grid">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} />
                <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end">
                  {formatValue(kr, v, { unit: false })}
                </text>
              </g>
            ))}
            {months.map((t) => (
              <text key={t} className="pf-traj__month" x={x(t)} y={H - 8} textAnchor="start">
                {new Date(t).toLocaleDateString(undefined, { month: 'short' })}
              </text>
            ))}
          </g>
        )}

        {/* target */}
        <line className="pf-traj__target" x1={padL} x2={W - padR} y1={y(kr.target)} y2={y(kr.target)} />
        {!compact && (
          <text className="pf-traj__tlabel" x={W - padR + 8} y={y(kr.target)} dy="0.32em">
            {kr.ceiling ? 'Limit' : 'Target'} {formatValue(kr, kr.target, { unit: false })}
          </text>
        )}
        {/* ideal line */}
        {!kr.ceiling && <line className="pf-traj__ideal" x1={x(period.start)} y1={y(idealStart)} x2={x(period.end)} y2={y(idealEnd)} />}

        {/* today */}
        {!ended && (
          <g className="pf-traj__today">
            <line x1={todayX} x2={todayX} y1={padT - (compact ? 0 : 8)} y2={H - padB} />
            {!compact && (
              <text x={todayX} y={padT - 11} textAnchor="middle">
                Today
              </text>
            )}
          </g>
        )}

        {/* forecast cone */}
        {showCone && (
          <g className="pf-traj__cone">
            <path d={cone} fill={`url(#cn${gid})`} />
            <line x1={x(f.from.t)} y1={y(f.from.v)} x2={fx} y2={y(f.value)} stroke={meta.color} />
            <circle cx={fx} cy={y(f.value)} r={compact ? 2.5 : 4} fill={meta.color} />
            {!compact && (
              <text className="pf-traj__flabel" x={fx + 8} y={y(f.value)} dy={Math.abs(y(f.value) - y(kr.target)) < 14 ? (y(f.value) > y(kr.target) ? '1.25em' : '-0.6em') : '0.32em'} fill={meta.color}>
                Forecast {formatValue(kr, f.value, { unit: false })}
              </text>
            )}
          </g>
        )}

        {/* actual */}
        <path className="pf-traj__area" d={areaPath} fill={`url(#ar${gid})`} />
        <path className="pf-traj__line" d={actualPath} stroke={`url(#ln${gid})`} />
        {!compact &&
          cks.map((c, i) => (
            <circle
              key={c.id}
              className={cx('pf-traj__pt', hover === i && 'is-hover')}
              cx={x(c.at)}
              cy={y(c.value)}
              r={hover === i ? 6 : 4.2}
              tabIndex={0}
              role="img"
              aria-label={`${new Date(c.at).toLocaleDateString()}: ${formatValue(kr, c.value)}, confidence ${c.confidence}/10${c.note ? ` — ${c.note}` : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        {compact && lastPt && <circle cx={x(lastPt.t)} cy={y(lastPt.v)} r={2.6} fill="var(--app-c1)" />}
      </svg>
      {hovered && (
        <div className="pf-traj__tip neo-portal" style={{ left: Math.min(W - 230, Math.max(0, x(hovered.at) - 110)), top: Math.max(0, y(hovered.value) - 96) }} role="status">
          <div className="pf-row">
            <b className="neo-num">{formatValue(kr, hovered.value)}</b>
            <span className="pf-faint text-xs">{new Date(hovered.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            <span className="pf-spacer" />
            <span className="text-xs pf-muted">conf {hovered.confidence}/10</span>
          </div>
          {hovered.note && <div className="pf-traj__note">“{hovered.note}”</div>}
        </div>
      )}
    </div>
  );
}
