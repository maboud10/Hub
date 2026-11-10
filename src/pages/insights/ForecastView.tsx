import { useMemo } from 'react';
import {
  BookmarkPlus,
  Compass,
  Flame,
  Gauge,
  Layers,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
} from '@/components/neo';
import { runMonteCarloProjection } from '@/insights/engine';
import { SCENARIO_PRESETS } from '@/insights/seed';
import { useInsights } from '@/insights/store';
import type { ForecastProjection, ScenarioPresetId } from '@/insights/types';
import { OwnerPill } from './shared';

const PRESET_ORDER: ScenarioPresetId[] = ['baseline', 'gcc_sovereign', 'ai_supercycle', 'macro_stress'];

export function ForecastView() {
  const activePreset = useInsights((s) => s.activePreset);
  const forecastLevers = useInsights((s) => s.forecastLevers);
  const snapshots = useInsights((s) => s.snapshots);
  const updateForecastLevers = useInsights((s) => s.updateForecastLevers);
  const applyScenarioPreset = useInsights((s) => s.applyScenarioPreset);
  const saveScenarioSnapshot = useInsights((s) => s.saveScenarioSnapshot);
  const deleteScenarioSnapshot = useInsights((s) => s.deleteScenarioSnapshot);

  const projection = useMemo(
    () => runMonteCarloProjection(forecastLevers),
    [forecastLevers],
  );

  return (
    <div className="ins-stack">
      {/* Top Scenario Preset Bar */}
      <div className="ins-preset-bar">
        <div className="ins-preset-cards">
          {PRESET_ORDER.map((pid) => {
            const p = SCENARIO_PRESETS[pid];
            const isActive = activePreset === pid;
            return (
              <button
                key={pid}
                type="button"
                className={`ins-preset-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => applyScenarioPreset(pid)}
                data-qa={`ins-preset-${pid}`}
              >
                <div className="ins-preset-btn__top">
                  <span className="ins-preset-btn__label">{p.label}</span>
                  <Chip tone={isActive ? 'cyan' : 'slate'} size="sm">
                    {p.badge}
                  </Chip>
                </div>
                <span className="ins-preset-btn__desc">{p.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Monte-Carlo Headline KPIs */}
      <NeoKpis label="Monte-Carlo $100M ARR Modeler KPIs">
        <NeoKpi
          label="Quarters to $100M ARR"
          value={
            projection.quartersTo100M !== null
              ? `${projection.quartersTo100M} Quarters`
              : 'Beyond Q8'
          }
          sub={`Target Milestone: ${projection.target100MQuarterLabel}`}
          icon={<Target />}
          tone="emerald"
        />
        <NeoKpi
          label="Q8 P50 Base Case ARR"
          value={`$${projection.endingP50ArrM.toFixed(1)}M`}
          sub={`P10 $${projection.endingP10ArrM.toFixed(0)}M · P90 $${projection.endingP90ArrM.toFixed(0)}M`}
          icon={<TrendingUp />}
          tone="cyan"
        />
        <NeoKpi
          label="Projected Rule of 40"
          value={`${projection.ruleOf40Score.toFixed(1)}%`}
          sub={`${projection.yoyGrowthPct}% Growth + ${projection.fcfMarginPct}% FCF`}
          icon={<Compass />}
          tone="indigo"
        />
        <NeoKpi
          label="Burn Multiple"
          value={`${projection.burnMultiple.toFixed(2)}x`}
          sub={projection.burnMultiple <= 1.0 ? 'Top-decile capital efficiency' : 'Moderate capital burn'}
          icon={<Flame />}
          tone={projection.burnMultiple <= 1.0 ? 'emerald' : 'amber'}
        />
        <NeoKpi
          label="GTM Magic Number"
          value={`${projection.magicNumber.toFixed(2)}x`}
          sub="Net New ARR / S&M Spend"
          icon={<Sparkles />}
          tone="violet"
        />
      </NeoKpis>

      {/* Main Split: Interactive Sliders + 8-Quarter Fan Chart */}
      <div className="ins-forecast-split">
        {/* Left: 5 Interactive Growth Levers */}
        <NeoPanel
          hud="Interactive Sensitivity Levers"
          title="Growth & Retention Drivers"
          icon={<Gauge />}
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => applyScenarioPreset('baseline')}
              title="Reset sliders to Baseline Operating Plan"
            >
              <RotateCcw />
              <span>Reset</span>
            </button>
          }
        >
          <div className="ins-sliders">
            <div className="ins-slider-group">
              <div className="ins-slider-head">
                <label htmlFor="sl-tof">Top-of-Funnel Growth Rate</label>
                <b className="ins-slider-val">{forecastLevers.topOfFunnelGrowthPct}% YoY</b>
              </div>
              <input
                id="sl-tof"
                type="range"
                min={10}
                max={80}
                step={1}
                value={forecastLevers.topOfFunnelGrowthPct}
                onChange={(e) =>
                  updateForecastLevers({ topOfFunnelGrowthPct: Number(e.target.value) })
                }
                className="ins-range"
              />
              <div className="ins-slider-sub">
                <span>10% Conservative</span>
                <span>Baseline: 38%</span>
                <span>80% Hypergrowth</span>
              </div>
            </div>

            <div className="ins-slider-group">
              <div className="ins-slider-head">
                <label htmlFor="sl-act">Day-7 Activation Conversion</label>
                <b className="ins-slider-val">{forecastLevers.activationConversionPct}%</b>
              </div>
              <input
                id="sl-act"
                type="range"
                min={35}
                max={90}
                step={1}
                value={forecastLevers.activationConversionPct}
                onChange={(e) =>
                  updateForecastLevers({ activationConversionPct: Number(e.target.value) })
                }
                className="ins-range"
              />
              <div className="ins-slider-sub">
                <span>35% Low</span>
                <span>Baseline: 64%</span>
                <span>90% Best-in-Class</span>
              </div>
            </div>

            <div className="ins-slider-group">
              <div className="ins-slider-head">
                <label htmlFor="sl-churn">Annual Gross Logo Churn</label>
                <b className="ins-slider-val">{forecastLevers.annualGrossChurnPct.toFixed(1)}%</b>
              </div>
              <input
                id="sl-churn"
                type="range"
                min={2}
                max={18}
                step={0.2}
                value={forecastLevers.annualGrossChurnPct}
                onChange={(e) =>
                  updateForecastLevers({ annualGrossChurnPct: Number(e.target.value) })
                }
                className="ins-range"
              />
              <div className="ins-slider-sub">
                <span>2.0% Elite</span>
                <span>Baseline: 6.2%</span>
                <span>18.0% High Churn</span>
              </div>
            </div>

            <div className="ins-slider-group">
              <div className="ins-slider-head">
                <label htmlFor="sl-ndr">Net Dollar Expansion Rate (NDR)</label>
                <b className="ins-slider-val ins-pos">{forecastLevers.netExpansionRatePct}%</b>
              </div>
              <input
                id="sl-ndr"
                type="range"
                min={100}
                max={165}
                step={1}
                value={forecastLevers.netExpansionRatePct}
                onChange={(e) =>
                  updateForecastLevers({ netExpansionRatePct: Number(e.target.value) })
                }
                className="ins-range"
              />
              <div className="ins-slider-sub">
                <span>100% Flat</span>
                <span>Baseline: 134%</span>
                <span>165% Hyper-Expand</span>
              </div>
            </div>

            <div className="ins-slider-group">
              <div className="ins-slider-head">
                <label htmlFor="sl-ai">Nova AI Copilot Attach Rate</label>
                <b className="ins-slider-val">{forecastLevers.novaAiAttachRatePct}%</b>
              </div>
              <input
                id="sl-ai"
                type="range"
                min={20}
                max={98}
                step={1}
                value={forecastLevers.novaAiAttachRatePct}
                onChange={(e) =>
                  updateForecastLevers({ novaAiAttachRatePct: Number(e.target.value) })
                }
                className="ins-range"
              />
              <div className="ins-slider-sub">
                <span>20% Early</span>
                <span>Baseline: 72%</span>
                <span>98% Ubiquitous</span>
              </div>
            </div>

            <button
              type="button"
              className="neo-btn neo-btn--plasma ins-save-snap-btn"
              onClick={() => saveScenarioSnapshot()}
              data-qa="ins-save-snapshot"
            >
              <BookmarkPlus />
              <span>Save Scenario Snapshot</span>
            </button>
          </div>
        </NeoPanel>

        {/* Right: 8-Quarter SVG Monte-Carlo Confidence Fan Chart */}
        <NeoPanel
          hud="10,000-Run Stochastic ARR Trajectory (P10 / P50 / P90)"
          title="8-Quarter Monte-Carlo Confidence Fan & $100M ARR Horizon"
          icon={<TrendingUp />}
          actions={
            <Chip tone="emerald">
              Starting Q4 26 ARR: ${projection.currentArrM.toFixed(1)}M
            </Chip>
          }
        >
          <MonteCarloFanSvg projection={projection} />

          {/* Quarterly Breakdown Table */}
          <div className="ins-heatmap-wrap" style={{ marginTop: 14 }}>
            <table className="ins-heatmap" aria-label="8-Quarter Projected ARR Breakdown">
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>New ARR</th>
                  <th>Expansion ARR</th>
                  <th>Churned ARR</th>
                  <th>P10 Downside</th>
                  <th>P50 Base Case</th>
                  <th>P90 Upside</th>
                </tr>
              </thead>
              <tbody>
                {projection.points.map((pt) => {
                  const crossed100 = pt.p50ArrM >= 100;
                  return (
                    <tr key={pt.quarter}>
                      <td>
                        <b>{pt.quarter}</b>
                      </td>
                      <td className="ins-pos">+${pt.newArrM.toFixed(2)}M</td>
                      <td className="ins-pos">+${pt.expansionArrM.toFixed(2)}M</td>
                      <td className="ins-neg">-${pt.churnedArrM.toFixed(2)}M</td>
                      <td>${pt.p10ArrM.toFixed(1)}M</td>
                      <td>
                        <b className={crossed100 ? 'ins-pos' : ''}>
                          ${pt.p50ArrM.toFixed(1)}M {crossed100 ? '★' : ''}
                        </b>
                      </td>
                      <td className="ins-pos">${pt.p90ArrM.toFixed(1)}M</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </NeoPanel>
      </div>

      {/* Saved Scenario Snapshots */}
      <NeoPanel
        hud="Board & FP&A Modeling Vault"
        title={`Saved Scenario Snapshots (${snapshots.length})`}
        icon={<Layers />}
      >
        <div className="ins-snap-grid">
          {snapshots.map((snap) => (
            <article key={snap.id} className="ins-snap-card neo-spot">
              <div className="ins-snap-card__top">
                <div>
                  <span className="neo-hud">
                    {snap.presetId === 'custom'
                      ? 'Custom Levers'
                      : SCENARIO_PRESETS[snap.presetId]?.badge ?? 'Preset'}
                  </span>
                  <h3 className="ins-snap-card__name">{snap.name}</h3>
                </div>
                <button
                  type="button"
                  className="neo-iconbtn neo-iconbtn--sm"
                  title="Delete snapshot"
                  onClick={() => deleteScenarioSnapshot(snap.id)}
                >
                  <Trash2 />
                </button>
              </div>

              <div className="ins-snap-card__kpis">
                <div>
                  <span className="neo-hud">Q8 P50 ARR</span>
                  <b className="ins-pos">${snap.endingP50ArrM.toFixed(1)}M</b>
                </div>
                <div>
                  <span className="neo-hud">Rule of 40</span>
                  <b>{snap.ruleOf40Score.toFixed(1)}%</b>
                </div>
                <div>
                  <span className="neo-hud">To $100M ARR</span>
                  <b>{snap.quartersTo100M ? `${snap.quartersTo100M} Qtrs` : '8+ Qtrs'}</b>
                </div>
              </div>

              <div className="ins-snap-card__levers">
                <span>ToF: {snap.levers.topOfFunnelGrowthPct}%</span>
                <span>Act: {snap.levers.activationConversionPct}%</span>
                <span>Churn: {snap.levers.annualGrossChurnPct}%</span>
                <span>NDR: {snap.levers.netExpansionRatePct}%</span>
                <span>AI: {snap.levers.novaAiAttachRatePct}%</span>
              </div>

              <div className="ins-snap-card__foot">
                <OwnerPill userId={snap.authorId} />
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => updateForecastLevers(snap.levers)}
                >
                  Load Levers
                </button>
              </div>
            </article>
          ))}
        </div>
      </NeoPanel>
    </div>
  );
}

function MonteCarloFanSvg({ projection }: { projection: ForecastProjection }) {
  const svgW = 680;
  const svgH = 265;
  const padL = 54;
  const padR = 26;
  const padT = 24;
  const padB = 38;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const allNodes = [
    {
      quarter: 'Now',
      p10ArrM: projection.currentArrM,
      p50ArrM: projection.currentArrM,
      p90ArrM: projection.currentArrM,
    },
    ...projection.points,
  ];

  const maxArr = Math.max(125, ...allNodes.map((n) => n.p90ArrM)) * 1.06;
  const minArr = 35;
  const span = maxArr - minArr;

  const xFor = (i: number) => padL + (i / (allNodes.length - 1)) * plotW;
  const yFor = (val: number) => padT + plotH - ((val - minArr) / span) * plotH;

  const p90Coords = allNodes.map((n, i) => [xFor(i), yFor(n.p90ArrM)] as const);
  const p50Coords = allNodes.map((n, i) => [xFor(i), yFor(n.p50ArrM)] as const);
  const p10Coords = allNodes.map((n, i) => [xFor(i), yFor(n.p10ArrM)] as const);

  const fanPolygon = [
    ...p90Coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`),
    ...[...p10Coords].reverse().map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`),
    'Z',
  ].join(' ');

  const p90Line = p90Coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const p50Line = p50Coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const p10Line = p10Coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const y100M = yFor(100);

  return (
    <div className="ins-canvas-wrap">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="ins-svg-canvas" role="img" aria-label="Monte-Carlo 8-Quarter ARR Confidence Fan Chart">
        <defs>
          <linearGradient id="mcFanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.14" />
          </linearGradient>
        </defs>

        {/* $100M ARR Milestone Threshold Line */}
        {y100M >= padT && y100M <= padT + plotH && (
          <g>
            <line
              x1={padL}
              y1={y100M}
              x2={svgW - padR}
              y2={y100M}
              stroke="#fbbf24"
              strokeWidth={1.8}
              strokeDasharray="6 4"
            />
            <text x={padL + 8} y={y100M - 6} className="ins-svg-sub" fill="#fbbf24">
              $100M ARR Centaur Milestone
            </text>
          </g>
        )}

        {/* Confidence Fan Polygon (P10 to P90) */}
        <path d={fanPolygon} fill="url(#mcFanGrad)" />

        {/* P90 Upside & P10 Downside Boundary Lines */}
        <path d={p90Line} fill="none" stroke="#34d399" strokeWidth={1.6} strokeDasharray="4 3" />
        <path d={p10Line} fill="none" stroke="#818cf8" strokeWidth={1.6} strokeDasharray="4 3" />

        {/* P50 Base Case Primary Trajectory */}
        <path d={p50Line} fill="none" stroke="#38bdf8" strokeWidth={3} strokeLinecap="round" />

        {allNodes.map((n, i) => {
          const [x, y] = p50Coords[i];
          return (
            <g key={n.quarter}>
              <circle
                cx={x}
                cy={y}
                r={n.p50ArrM >= 100 ? 5.5 : 4}
                fill={n.p50ArrM >= 100 ? '#34d399' : '#38bdf8'}
                stroke="#0b1020"
                strokeWidth={2}
              />
              <text x={x} y={y - 10} textAnchor="middle" className="ins-svg-val">
                ${n.p50ArrM.toFixed(0)}M
              </text>
              <text x={x} y={svgH - 12} textAnchor="middle" className="ins-svg-label">
                {n.quarter}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="ins-canvas-legend">
        <span>
          <i style={{ background: '#34d399' }} /> P90 Upside (${projection.endingP90ArrM.toFixed(1)}M)
        </span>
        <span>
          <i style={{ background: '#38bdf8' }} /> P50 Base Case (${projection.endingP50ArrM.toFixed(1)}M)
        </span>
        <span>
          <i style={{ background: '#818cf8' }} /> P10 Downside (${projection.endingP10ArrM.toFixed(1)}M)
        </span>
        <span>
          <i style={{ background: '#fbbf24' }} /> $100M ARR Milestone ({projection.target100MQuarterLabel})
        </span>
      </div>
    </div>
  );
}
