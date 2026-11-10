/**
 * Competency radar — the Growth signature visual.
 *
 * Five axes (one per competency) with pentagon rings for scores 1–5, filled
 * polygons for assessments (self, manager) and dashed outlines for level
 * expectations. Where the assessment sits below the target level a glowing
 * "growth vector" marks the step to grow. Hover or tap an axis (or use the
 * competency chips) to read the behavioural anchors behind every score.
 *
 * Accessible: role="img" with a summary, a visually-hidden data table, keyboard
 * operable chips and legend. Reduced-motion friendly (no draw-in, no sweep).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowUp, Check, Star } from 'lucide-react';
import { cx } from '@/lib/cx';
import { COMPETENCIES, COMPETENCY, SCORE_LABEL } from '@/performance/constants';
import type { CompetencyId } from '@/performance/types';
import './styles/growth.css';

export type RadarTone = 'self' | 'manager' | 'next' | 'level';

export interface RadarSeries {
  id: string;
  label: string;
  /** Small caption under the legend label (e.g. "Q3 2026"). */
  sub?: string;
  tone: RadarTone;
  values: Partial<Record<CompetencyId, number>>;
  /** Draw as a dashed outline (expectations) instead of a filled shape. */
  outline?: boolean;
  /** Start hidden (can be toggled on from the legend). */
  hidden?: boolean;
}

const C = 180;
const R = 118;
const N = COMPETENCIES.length;
const TONE_ORDER: Record<RadarTone, number> = { level: 0, next: 1, manager: 2, self: 3 };

const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
const polar = (i: number, radius: number, offset = 0): [number, number] => [C + radius * Math.cos(angle(i) + offset), C + radius * Math.sin(angle(i) + offset)];
const point = (i: number, v: number): [number, number] => polar(i, (Math.max(0, Math.min(5, v)) / 5) * R);
const fmt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const shape = (values: Partial<Record<CompetencyId, number>>) => COMPETENCIES.map((c, i) => fmt(point(i, values[c.id] ?? 0))).join(' ');
const ring = (lv: number) => COMPETENCIES.map((_c, i) => fmt(point(i, lv))).join(' ');

export function Radar({
  series,
  basisId,
  targetId,
  initialAxis,
  label = 'Competency radar',
  note,
}: {
  series: RadarSeries[];
  /** Series the growth vectors start from (usually the manager assessment). */
  basisId?: string;
  /** Series the growth vectors point to (usually the next-level expectation). */
  targetId?: string;
  initialAxis?: CompetencyId;
  label?: string;
  note?: ReactNode;
}) {
  const uid = useId().replace(/:/g, '');
  const [off, setOff] = useState<Record<string, boolean>>(() => Object.fromEntries(series.filter((s) => s.hidden).map((s) => [s.id, true])));
  const [active, setActive] = useState<CompetencyId>(initialAxis ?? COMPETENCIES[0].id);
  const [hover, setHover] = useState<CompetencyId | null>(null);
  const axis = hover ?? active;

  const shown = series.filter((s) => !off[s.id]).sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  const basisAll = series.find((s) => s.id === basisId);
  const targetAll = series.find((s) => s.id === targetId);
  const vectorsOn = !!basisAll && !!targetAll && !off[basisAll.id] && !off[targetAll.id];

  /** Positive = steps to grow from the basis to the target. */
  const gapOf = (c: CompetencyId): number | null => {
    const b = basisAll?.values[c];
    const t = targetAll?.values[c];
    return b === undefined || t === undefined ? null : Math.round((t - b) * 10) / 10;
  };

  const summary = useMemo(
    () => `${label}. ${COMPETENCIES.map((c) => `${c.label}: ${series.map((s) => `${s.label} ${s.values[c.id] ?? 'not rated'}`).join(', ')}`).join('. ')}.`,
    [label, series],
  );

  const def = COMPETENCY[axis];
  const rows = shown.filter((s) => s.values[axis] !== undefined).sort((a, b) => TONE_ORDER[b.tone] - TONE_ORDER[a.tone]);
  const axisGap = gapOf(axis);
  const targetName = targetAll ? targetAll.label.replace(/ expectation$/i, '') : '';

  return (
    <div className="pf-gr-radar" data-qa="gr-radar">
      <div className="pf-gr-radar__legend" role="group" aria-label="Radar layers">
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cx('pf-gr-radar__key', `is-${s.tone}`)}
            aria-pressed={!off[s.id]}
            onClick={() => setOff((o) => ({ ...o, [s.id]: !o[s.id] }))}
            title={off[s.id] ? `Show ${s.label}` : `Hide ${s.label}`}
            data-qa={`gr-legend-${s.id}`}
          >
            <span className="pf-gr-radar__sw" data-outline={s.outline ? 'true' : undefined} aria-hidden="true" />
            <span className="pf-gr-radar__keytext">
              <b>{s.label}</b>
              {s.sub && <small>{s.sub}</small>}
            </span>
          </button>
        ))}
      </div>

      <div className="pf-gr-radar__stage">
        <div className="pf-gr-radar__plot">
          <svg className="pf-gr-radar__svg" viewBox="-58 14 468 306" role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
            <title id={`${uid}-t`}>{label}</title>
            <desc id={`${uid}-d`}>{summary}</desc>
            <defs>
              <radialGradient id={`${uid}-bg`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.16" />
                <stop offset="70%" stopColor="var(--app-c2)" stopOpacity="0.05" />
                <stop offset="100%" stopColor="var(--app-c2)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={`${uid}-sweep`} gradientUnits="userSpaceOnUse" x1={C + R * Math.cos(-0.9)} y1={C + R * Math.sin(-0.9)} x2={C + R} y2={C}>
                <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0" />
                <stop offset="100%" stopColor="var(--app-c1)" stopOpacity="0.32" />
              </linearGradient>
            </defs>
            <circle cx={C} cy={C} r={R + 14} fill={`url(#${uid}-bg)`} />
            <g className="pf-gr-radar__sweep" aria-hidden="true">
              <path d={`M${C} ${C} L${(C + R * Math.cos(-0.9)).toFixed(1)} ${(C + R * Math.sin(-0.9)).toFixed(1)} A${R} ${R} 0 0 1 ${C + R} ${C} Z`} fill={`url(#${uid}-sweep)`} />
              <line x1={C} y1={C} x2={C + R} y2={C} />
            </g>
            {[1, 2, 3, 4, 5].map((lv) => (
              <polygon key={lv} className={cx('pf-gr-radar__ring', lv === 5 && 'is-outer')} points={ring(lv)} />
            ))}
            {COMPETENCIES.map((c, i) => {
              const [x, y] = point(i, 5);
              return <line key={c.id} className={cx('pf-gr-radar__axis', axis === c.id && 'is-active')} x1={C} y1={C} x2={x} y2={y} />;
            })}
            {[1, 2, 3, 4, 5].map((lv) => (
              <text key={lv} className="pf-gr-radar__lv" x={C + 5} y={C - (lv / 5) * R + 3.5}>
                {lv}
              </text>
            ))}
            {shown.map((s, i) => (
              <polygon
                key={s.id}
                className={cx('pf-gr-radar__poly', `is-${s.tone}`, s.outline && 'is-outline')}
                points={shape(s.values)}
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
            {vectorsOn &&
              COMPETENCIES.map((c, i) => {
                const g = gapOf(c.id);
                if (g === null || g <= 0) return null;
                const b = point(i, basisAll!.values[c.id] ?? 0);
                const t = point(i, targetAll!.values[c.id] ?? 0);
                const mid = polar(i, (((basisAll!.values[c.id] ?? 0) + (targetAll!.values[c.id] ?? 0)) / 10) * R);
                const perp = angle(i) + Math.PI / 2;
                const lx = mid[0] + 13 * Math.cos(perp);
                const ly = mid[1] + 13 * Math.sin(perp) + 4;
                return (
                  <g key={c.id} className={cx('pf-gr-radar__vec', axis === c.id && 'is-active')}>
                    <line className="pf-gr-radar__vec-glow" x1={b[0]} y1={b[1]} x2={t[0]} y2={t[1]} />
                    <line className="pf-gr-radar__vec-core" x1={b[0]} y1={b[1]} x2={t[0]} y2={t[1]} />
                    <text className="pf-gr-radar__vec-label" x={lx} y={ly} textAnchor="middle">
                      +{g}
                    </text>
                  </g>
                );
              })}
            {shown
              .filter((s) => !s.outline)
              .map((s) =>
                COMPETENCIES.map((c, i) => {
                  const v = s.values[c.id];
                  if (v === undefined) return null;
                  const [x, y] = point(i, v);
                  return <circle key={`${s.id}-${c.id}`} className={cx('pf-gr-radar__dot', `is-${s.tone}`)} cx={x} cy={y} r={axis === c.id ? 5.2 : 3.4} />;
                }),
              )}
            {COMPETENCIES.map((c, i) => {
              const [x, y] = polar(i, R + 20);
              const anchor = x > C + 6 ? 'start' : x < C - 6 ? 'end' : 'middle';
              const dy = y < C - R ? -4 : y > C + R * 0.5 ? 13 : 4;
              return (
                <text key={c.id} className={cx('pf-gr-radar__label', axis === c.id && 'is-active')} x={x + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0)} y={y + dy} textAnchor={anchor}>
                  {c.label}
                </text>
              );
            })}
            {COMPETENCIES.map((c, i) => {
              const step = Math.PI / N;
              const pts = [fmt([C, C]), fmt(polar(i, R + 52, -step)), fmt(polar(i, R + 58)), fmt(polar(i, R + 52, step))].join(' ');
              return (
                <polygon
                  key={c.id}
                  className="pf-gr-radar__hit"
                  points={pts}
                  onMouseEnter={() => setHover(c.id)}
                  onMouseLeave={() => setHover((h) => (h === c.id ? null : h))}
                  onClick={() => setActive(c.id)}
                  aria-hidden="true"
                />
              );
            })}
          </svg>
        </div>

        <div className="pf-gr-radar__detail" aria-live="polite">
          <div className="neo-hud">Behavioural anchors</div>
          <h3 className="pf-gr-radar__dtitle">{def.label}</h3>
          <p className="pf-gr-radar__dblurb">{def.blurb}</p>
          {rows.length ? (
            <ul className="pf-gr-radar__rows">
              {rows.map((s) => {
                const v = Math.max(1, Math.min(5, Math.round(s.values[axis] ?? 1)));
                return (
                  <li key={s.id} className={cx('pf-gr-radar__row', `is-${s.tone}`)}>
                    <span className="pf-gr-radar__sw" data-outline={s.outline ? 'true' : undefined} aria-hidden="true" />
                    <div className="pf-gr-radar__rowtext">
                      <div className="pf-gr-radar__rowhead">
                        <b>{s.label}</b>
                        <span className="pf-gr-radar__score">
                          {v} · {SCORE_LABEL[v]}
                        </span>
                      </div>
                      <p>{def.anchors[v - 1]}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pf-gr-radar__empty">Turn on a layer to compare scores for {def.label.toLowerCase()}.</p>
          )}
          {axisGap !== null && targetAll && (
            <div className={cx('pf-gr-radar__verdict', axisGap > 0 ? 'is-grow' : axisGap === 0 ? 'is-met' : 'is-above')}>
              {axisGap > 0 ? (
                <>
                  <ArrowUp aria-hidden="true" /> Grow {axisGap} step{axisGap === 1 ? '' : 's'} to meet the {targetName} bar
                </>
              ) : axisGap === 0 ? (
                <>
                  <Check aria-hidden="true" /> Right at the {targetName} bar
                </>
              ) : (
                <>
                  <Star aria-hidden="true" /> Above the {targetName} bar — a strength to lean on
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pf-gr-radar__chips" role="group" aria-label="Choose a competency">
        {COMPETENCIES.map((c) => {
          const g = gapOf(c.id);
          return (
            <button key={c.id} type="button" className="pf-gr-radar__chip" aria-pressed={axis === c.id} onClick={() => setActive(c.id)} onFocus={() => setActive(c.id)} data-qa={`gr-axis-${c.id}`}>
              <span>{c.label}</span>
              {g !== null && g > 0 && (
                <span className="pf-gr-radar__chipgap is-grow" aria-label={`${g} below the bar`}>
                  <ArrowUp aria-hidden="true" />
                  {g}
                </span>
              )}
              {g === 0 && (
                <span className="pf-gr-radar__chipgap is-met" aria-label="at the bar">
                  <Check aria-hidden="true" />
                </span>
              )}
              {g !== null && g < 0 && (
                <span className="pf-gr-radar__chipgap is-above" aria-label="above the bar">
                  <Star aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {note && <p className="pf-gr-radar__note">{note}</p>}

      <table className="neo-sr">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Competency</th>
            {series.map((s) => (
              <th scope="col" key={s.id}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPETENCIES.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              {series.map((s) => (
                <td key={s.id}>{s.values[c.id] ?? 'Not rated'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
