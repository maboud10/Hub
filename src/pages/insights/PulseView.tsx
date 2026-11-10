import { useState } from 'react';
import {
  Activity,
  BarChart3,
  BookmarkCheck,
  CheckCircle2,
  Code2,
  Compass,
  Database,
  Globe,
  Pin,
  Radar,
  Rocket,
  Sparkles,
  TrendingUp,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoBanner,
  NeoBanners,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  NeoTabs,
  Ring,
  Spark,
  type NeoTabItem,
} from '@/components/neo';
import { ProjectSigil } from '@/projects/sigils';
import {
  NORTH_STAR_SERIES,
  NOVA_SUGGESTIONS,
  REGIONAL_ARR_MIX,
  RULE_OF_40_PEERS,
  SEGMENT_META,
  WATERFALL_STEPS,
} from '@/insights/seed';
import { useInsights } from '@/insights/store';
import type { InsightsSegment, TelemetryCanvasMode } from '@/insights/types';
import { OwnerPill, SegmentFilterBar } from './shared';

const CANVAS_TABS: NeoTabItem<TelemetryCanvasMode>[] = [
  { value: 'waterfall', label: 'ARR Growth Waterfall', icon: <BarChart3 /> },
  { value: 'north_star', label: 'North Star & Nova AI Queries', icon: <Sparkles /> },
  { value: 'regional_mix', label: 'Regional ARR Mix', icon: <Globe /> },
  { value: 'rule_of_40', label: 'Rule of 40 Frontier', icon: <Compass /> },
];

export function PulseView() {
  const activeSegment = useInsights((s) => s.activeSegment);
  const setActiveSegment = useInsights((s) => s.setActiveSegment);
  const canvasMode = useInsights((s) => s.canvasMode);
  const setCanvasMode = useInsights((s) => s.setCanvasMode);
  const metrics = useInsights((s) => s.metrics);
  const activeNovaAnswer = useInsights((s) => s.activeNovaAnswer);
  const pinnedCards = useInsights((s) => s.pinnedCards);
  const anomalies = useInsights((s) => s.anomalies);
  const askNovaInsights = useInsights((s) => s.askNovaInsights);
  const pinInsightCard = useInsights((s) => s.pinInsightCard);
  const unpinInsightCard = useInsights((s) => s.unpinInsightCard);

  const [showSql, setShowSql] = useState(false);

  const activeFriction = anomalies.find((a) => a.category === 'friction' && a.status === 'active');

  const kpiNorthStar = metrics.find((m) => m.id === 'mtr-north-star') ?? metrics[0];
  const kpiNdr = metrics.find((m) => m.id === 'mtr-ndr') ?? metrics[1];
  const kpiRule40 = metrics.find((m) => m.id === 'mtr-rule40') ?? metrics[2];
  const kpiCac = metrics.find((m) => m.id === 'mtr-cac') ?? metrics[3];
  const kpiMagic = metrics.find((m) => m.id === 'mtr-magic') ?? metrics[4];

  const segMeta = SEGMENT_META[activeSegment];

  return (
    <div className="ins-stack">
      {/* Statistical Breakout & Friction Banners */}
      <NeoBanners>
        <NeoBanner
          tone="emerald"
          icon={<Rocket />}
          title="Statistical Breakout · MENA & GCC Net Dollar Retention surged to 142% (+14 pts) following Arabic RTL launch"
          meta="Z = +4.2σ · 99.4% conf"
          to="/insights/cohorts"
        >
          48 Dubai & Riyadh enterprise workspaces expanded into multi-app bundles (Payroll + Spend + Insights).
        </NeoBanner>
        {activeFriction && (
          <NeoBanner
            tone="warning"
            icon={<Radar />}
            title={`Neural Friction Alert · ${activeFriction.title} (Z = ${activeFriction.zScore}σ)`}
            meta={activeFriction.deltaLabel}
            to="/insights/anomalies"
          >
            {activeFriction.segmentLabel}
          </NeoBanner>
        )}
      </NeoBanners>

      {/* Global Segment Filter Bar */}
      <SegmentFilterBar value={activeSegment} onChange={setActiveSegment} />

      {/* 5 Executive KPI Ribbon with Sparklines */}
      <NeoKpis label="Executive Growth Pulse KPIs">
        <NeoKpi
          label="North Star Active Teams"
          value={activeSegment === 'all' ? kpiNorthStar.value : `${segMeta.activeTeamsPct}%`}
          sub={kpiNorthStar.delta}
          icon={<Zap />}
          tone="cyan"
          spark={<Spark data={kpiNorthStar.spark} color="#38bdf8" />}
          to="/insights/funnel"
        />
        <NeoKpi
          label="Net Dollar Retention"
          value={activeSegment === 'all' ? kpiNdr.value : `${segMeta.ndrPct}%`}
          sub={kpiNdr.delta}
          icon={<TrendingUp />}
          tone="emerald"
          spark={<Spark data={kpiNdr.spark} color="#34d399" />}
          to="/insights/cohorts"
        />
        <NeoKpi
          label="Rule of 40 Score"
          value={kpiRule40.value}
          sub={kpiRule40.delta}
          icon={<Compass />}
          tone="indigo"
          spark={<Spark data={kpiRule40.spark} color="#818cf8" />}
          to="/insights/forecast"
        />
        <NeoKpi
          label="CAC Payback"
          value={activeSegment === 'all' ? kpiCac.value : `${segMeta.cacPaybackMos} mos`}
          sub={kpiCac.delta}
          icon={<Activity />}
          tone="cyan"
          spark={<Spark data={kpiCac.spark} color="#22d3ee" />}
        />
        <NeoKpi
          label="Magic Number"
          value={kpiMagic.value}
          sub={kpiMagic.delta}
          icon={<Sparkles />}
          tone="violet"
          spark={<Spark data={kpiMagic.spark} color="#a78bfa" />}
          to="/insights/forecast"
        />
      </NeoKpis>

      {/* Nova Natural-Language BI & Causal Copilot */}
      <NeoNovaPrompt
        hud="Nova Natural-Language BI & Causal Copilot"
        title="Ask any question across governed BigQuery & dbt telemetry marts"
        badge="Causal Inference v4.2"
        placeholder="e.g. Why did MENA Net Dollar Retention jump to 142%? Or compare Enterprise vs Mid-Market CAC payback…"
        suggestions={NOVA_SUGGESTIONS}
        onSubmit={(q) => askNovaInsights(q)}
        submitLabel="Synthesize"
      >
        <div className="ins-nova-card">
          <div className="ins-nova-card__head">
            <Ring value={activeNovaAnswer.confidence} size={50} stroke={5} color="#38bdf8">
              {Math.round(activeNovaAnswer.confidence * 100)}%
            </Ring>
            <div className="ins-nova-card__titles">
              <div className="ins-nova-card__eyebrow">
                <span className="neo-hud">Query: “{activeNovaAnswer.question}”</span>
                <div className="ins-lineage-pills">
                  {activeNovaAnswer.lineageModels.map((mdl) => (
                    <span key={mdl} className="ins-sql-tag">
                      <Database /> {mdl}
                    </span>
                  ))}
                </div>
              </div>
              <h3 className="ins-nova-card__headline">{activeNovaAnswer.headline}</h3>
              <p className="ins-nova-card__narrative">{activeNovaAnswer.narrative}</p>
            </div>
            <div className="ins-nova-card__actions">
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={() => setShowSql((v) => !v)}
              >
                <Code2 />
                <span>{showSql ? 'Hide SQL' : 'Governed SQL'}</span>
              </button>
              <button
                type="button"
                className={activeNovaAnswer.pinned ? 'neo-btn neo-btn--soft neo-btn--sm' : 'neo-btn neo-btn--plasma neo-btn--sm'}
                onClick={() => pinInsightCard(activeNovaAnswer.id)}
                data-qa="ins-pin-nova"
              >
                {activeNovaAnswer.pinned ? <BookmarkCheck /> : <Pin />}
                <span>{activeNovaAnswer.pinned ? 'Pinned to Board' : 'Pin to Executive Board'}</span>
              </button>
            </div>
          </div>

          {showSql && (
            <pre className="ins-sql-code">
              <code>{activeNovaAnswer.sqlSnippet}</code>
            </pre>
          )}

          <div className="ins-nova-drivers">
            {activeNovaAnswer.drivers.map((drv) => (
              <div key={drv.label} className="ins-nova-driver">
                <div className="ins-nova-driver__top">
                  <span className="ins-nova-driver__label">{drv.label}</span>
                  <Chip tone={drv.tone} size="sm">
                    {drv.impact}
                  </Chip>
                </div>
                <Bar
                  value={drv.weight}
                  fill={
                    drv.tone === 'emerald'
                      ? '#34d399'
                      : drv.tone === 'cyan'
                        ? '#38bdf8'
                        : drv.tone === 'indigo'
                          ? '#818cf8'
                          : drv.tone === 'rose'
                            ? '#fb7185'
                            : '#fbbf24'
                  }
                />
              </div>
            ))}
          </div>

          <div className="ins-nova-rec">
            <Sparkles className="ins-nova-rec__icon" />
            <span>
              <b>Recommended Executive Action:</b> {activeNovaAnswer.recommendedAction}
            </span>
          </div>
        </div>
      </NeoNovaPrompt>

      {/* Interactive Multi-Layer SVG Telemetry Canvas */}
      <NeoPanel
        hud={`Multi-Layer Telemetry Canvas · ${segMeta.label}`}
        title="Real-Time Revenue, Engagement & Efficiency Telemetry"
        icon={<BarChart3 />}
        actions={
          <NeoTabs
            value={canvasMode}
            onChange={setCanvasMode}
            items={CANVAS_TABS}
            label="Telemetry canvas mode"
          />
        }
      >
        {canvasMode === 'waterfall' && <ArrWaterfallCanvas segment={activeSegment} />}
        {canvasMode === 'north_star' && <NorthStarEngagementCanvas />}
        {canvasMode === 'regional_mix' && <RegionalArrCanvas />}
        {canvasMode === 'rule_of_40' && <RuleOf40FrontierCanvas />}
      </NeoPanel>

      {/* Pinned Executive Board Insights */}
      {pinnedCards.length > 0 && (
        <NeoPanel
          hud="Executive Board"
          title={`Pinned Causal Insights (${pinnedCards.length})`}
          icon={<BookmarkCheck />}
        >
          <div className="ins-pinned-grid">
            {pinnedCards.map((card) => (
              <article key={card.id} className="ins-pinned-card">
                <div className="ins-pinned-card__top">
                  <span className="neo-hud">{card.question}</span>
                  <button
                    type="button"
                    className="neo-iconbtn neo-iconbtn--sm"
                    title="Unpin from Executive Board"
                    onClick={() => unpinInsightCard(card.id)}
                  >
                    <Trash2 />
                  </button>
                </div>
                <h3 className="ins-pinned-card__title">{card.headline}</h3>
                <p className="ins-pinned-card__text">{card.narrative}</p>
                <div className="ins-pinned-card__foot">
                  <div className="ins-lineage-pills">
                    {card.lineageModels.map((m) => (
                      <span key={m} className="ins-sql-tag">
                        <Database /> {m}
                      </span>
                    ))}
                  </div>
                  <Chip tone="emerald" size="sm">
                    {Math.round(card.confidence * 100)}% conf
                  </Chip>
                </div>
              </article>
            ))}
          </div>
        </NeoPanel>
      )}

      {/* Governed Metric Catalog */}
      <NeoPanel
        hud="Semantic Layer · Certified dbt + BigQuery Lineage"
        title="Governed Executive Metric Catalog"
        icon={<Database />}
        actions={
          <Chip tone="emerald" icon={<CheckCircle2 />}>
            8 / 8 Metrics Certified · Zero Drift
          </Chip>
        }
      >
        <div className="ins-catalog-grid">
          {metrics.map((m) => (
            <article key={m.id} className="ins-metric-card neo-spot">
              <div className="ins-metric-card__head">
                <ProjectSigil icon={m.sigil} color={m.color} size={34} />
                <div className="ins-metric-card__titles">
                  <div className="ins-metric-card__code">
                    <span>{m.code}</span>
                    <Chip tone="emerald" size="sm">
                      SLA {m.freshnessMinutes}m ago
                    </Chip>
                  </div>
                  <h3 className="ins-metric-card__name">{m.name}</h3>
                </div>
              </div>

              <div className="ins-metric-card__valrow">
                <div>
                  <div className="ins-metric-card__val">{m.value}</div>
                  <div className="ins-metric-card__delta">{m.delta}</div>
                </div>
                <Spark data={m.spark} width={116} height={38} color={m.color} />
              </div>

              <div className="ins-metric-card__lineage">
                <span className="ins-sql-tag">
                  <Database /> {m.warehouseTable}
                </span>
                <code className="ins-metric-card__formula">{m.formula}</code>
              </div>

              <div className="ins-metric-card__foot">
                <OwnerPill userId={m.ownerId} prefix="Steward:" />
                <Chip tone="cyan" size="sm">
                  {m.category.toUpperCase()}
                </Chip>
              </div>
            </article>
          ))}
        </div>
      </NeoPanel>
    </div>
  );
}

/* ───────────────────────── Sub-Canvases ───────────────────────── */

function ArrWaterfallCanvas({ segment }: { segment: InsightsSegment }) {
  const steps = WATERFALL_STEPS[segment];
  const maxVal = Math.max(...steps.map((s) => Math.abs(s.valueM)), 50) * 1.12;

  // Compute cumulative running start/end for each waterfall bar
  let running = 0;
  const bars = steps.map((step) => {
    if (step.kind === 'start' || step.kind === 'total') {
      running = step.valueM;
      return { ...step, bottomM: 0, topM: step.valueM };
    }
    const prev = running;
    const next = Math.round((running + step.valueM) * 100) / 100;
    running = next;
    return {
      ...step,
      bottomM: Math.min(prev, next),
      topM: Math.max(prev, next),
    };
  });

  const svgW = 860;
  const svgH = 260;
  const padL = 56;
  const padR = 28;
  const padT = 26;
  const padB = 46;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const yFor = (valM: number) => padT + plotH - (valM / maxVal) * plotH;
  const colW = plotW / bars.length;

  return (
    <div className="ins-canvas-wrap">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="ins-svg-canvas" role="img" aria-label="ARR Growth Waterfall Chart">
        <defs>
          <linearGradient id="wfStartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="wfPosGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="wfNegGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#e11d48" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="wfTotalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const val = Math.round(maxVal * t);
          const y = yFor(val);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--border-2)" strokeDasharray="4 4" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="ins-svg-axis">
                ${val}M
              </text>
            </g>
          );
        })}

        {/* Waterfall bars and connector lines */}
        {bars.map((b, i) => {
          const xCenter = padL + i * colW + colW / 2;
          const barW = Math.min(76, colW * 0.58);
          const x = xCenter - barW / 2;
          const yTop = yFor(b.topM);
          const yBot = yFor(b.bottomM);
          const h = Math.max(6, yBot - yTop);
          const fill =
            b.kind === 'start'
              ? 'url(#wfStartGrad)'
              : b.kind === 'positive'
                ? 'url(#wfPosGrad)'
                : b.kind === 'negative'
                  ? 'url(#wfNegGrad)'
                  : 'url(#wfTotalGrad)';

          const sign = b.kind === 'positive' ? '+' : '';
          return (
            <g key={b.id}>
              {i > 0 && (
                <line
                  x1={xCenter - colW + barW / 2}
                  y1={b.kind === 'total' ? yFor(b.topM) : yFor(b.kind === 'negative' ? b.topM : b.bottomM)}
                  x2={x}
                  y2={b.kind === 'total' ? yFor(b.topM) : yFor(b.kind === 'negative' ? b.topM : b.bottomM)}
                  stroke="var(--border-3)"
                  strokeDasharray="3 3"
                />
              )}
              <rect x={x} y={yTop} width={barW} height={h} rx={7} fill={fill} />
              <text x={xCenter} y={yTop - 8} textAnchor="middle" className="ins-svg-val">
                {sign}${b.valueM.toFixed(2)}M
              </text>
              <text x={xCenter} y={svgH - 22} textAnchor="middle" className="ins-svg-label">
                {b.label}
              </text>
              <text x={xCenter} y={svgH - 7} textAnchor="middle" className="ins-svg-sub">
                {b.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function NorthStarEngagementCanvas() {
  const svgW = 860;
  const svgH = 260;
  const padL = 52;
  const padR = 56;
  const padT = 24;
  const padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const pts = NORTH_STAR_SERIES.map((d, i) => {
    const x = padL + (i / (NORTH_STAR_SERIES.length - 1)) * plotW;
    const yPct = padT + plotH - ((d.activeTeamsPct - 80) / 20) * plotH;
    const barH = (d.novaQueriesK / 3800) * plotH;
    return { ...d, x, yPct, barH };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yPct.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${padT + plotH} L${pts[0].x.toFixed(1)},${padT + plotH} Z`;

  return (
    <div className="ins-canvas-wrap">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="ins-svg-canvas" role="img" aria-label="North Star Active Teams and Nova AI Queries">
        <defs>
          <linearGradient id="nsAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Nova Queries Bars */}
        {pts.map((p) => (
          <g key={p.month}>
            <rect
              x={p.x - 16}
              y={padT + plotH - p.barH}
              width={32}
              height={p.barH}
              rx={5}
              fill="rgb(99 102 241 / 0.32)"
              stroke="rgb(129 140 248 / 0.45)"
            />
            <text x={p.x} y={svgH - 14} textAnchor="middle" className="ins-svg-label">
              {p.month}
            </text>
          </g>
        ))}

        {/* North Star Line & Area */}
        <path d={areaPath} fill="url(#nsAreaGrad)" />
        <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth={3} strokeLinecap="round" />

        {pts.map((p) => (
          <g key={`pt-${p.month}`}>
            <circle cx={p.x} cy={p.yPct} r={4.5} fill="#38bdf8" stroke="#0b1020" strokeWidth={2} />
            <text x={p.x} y={p.yPct - 10} textAnchor="middle" className="ins-svg-val">
              {p.activeTeamsPct}%
            </text>
          </g>
        ))}
      </svg>
      <div className="ins-canvas-legend">
        <span>
          <i style={{ background: '#38bdf8' }} /> North Star Active Teams % (Left Axis: 86.4% → 94.2%)
        </span>
        <span>
          <i style={{ background: '#818cf8' }} /> Monthly Nova Copilot Queries (420K → 3.42M / mo)
        </span>
      </div>
    </div>
  );
}

function RegionalArrCanvas() {
  return (
    <div className="ins-regional-grid">
      {REGIONAL_ARR_MIX.map((reg) => (
        <div key={reg.id} className="ins-region-card">
          <div className="ins-region-card__head">
            <span className="ins-region-dot" style={{ background: reg.color }} />
            <div>
              <h4 className="ins-region-card__title">{reg.region}</h4>
              <span className="neo-hud">{reg.flagshipHub}</span>
            </div>
            <Chip tone="emerald" size="sm">
              {reg.ndrPct}% NDR
            </Chip>
          </div>
          <div className="ins-region-card__metrics">
            <div>
              <span className="neo-hud">Ending ARR</span>
              <b className="ins-region-card__arr">${reg.arrM.toFixed(1)}M</b>
            </div>
            <div>
              <span className="neo-hud">Global Share</span>
              <b>{reg.sharePct}%</b>
            </div>
            <div>
              <span className="neo-hud">YoY Growth</span>
              <b className="ins-pos">+{reg.yoyGrowthPct}%</b>
            </div>
          </div>
          <Bar value={reg.sharePct / 50} fill={reg.color} />
          <div className="ins-region-card__foot">
            <OwnerPill userId={reg.leadOwnerId} prefix="Regional Lead:" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleOf40FrontierCanvas() {
  const svgW = 860;
  const svgH = 250;
  const padL = 58;
  const padR = 36;
  const padT = 24;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const xForGrowth = (g: number) => padL + ((g - 15) / 45) * plotW;
  const yForFcf = (f: number) => padT + plotH - ((f - 0) / 32) * plotH;

  return (
    <div className="ins-canvas-wrap">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="ins-svg-canvas" role="img" aria-label="Rule of 40 Frontier Scatter Plot">
        {/* Rule of 40 diagonal frontier line: Growth + FCF = 40 -> (15, 25) to (40, 0) */}
        <line
          x1={xForGrowth(15)}
          y1={yForFcf(25)}
          x2={xForGrowth(40)}
          y2={yForFcf(0)}
          stroke="#fbbf24"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
        <text x={xForGrowth(26)} y={yForFcf(16)} className="ins-svg-sub" fill="#fbbf24">
          Rule of 40 Frontier (Growth % + FCF % = 40%)
        </text>

        {RULE_OF_40_PEERS.map((peer) => {
          const cx = xForGrowth(peer.growthPct);
          const cy = yForFcf(peer.fcfMarginPct);
          const r = peer.highlight ? 11 : 7;
          return (
            <g key={peer.id}>
              {peer.highlight && <circle cx={cx} cy={cy} r={r + 6} fill={peer.color} opacity={0.2} />}
              <circle cx={cx} cy={cy} r={r} fill={peer.color} stroke="#0b1020" strokeWidth={2} />
              <text x={cx} y={cy - r - 6} textAnchor="middle" className="ins-svg-val">
                {peer.name} ({peer.score}%)
              </text>
            </g>
          );
        })}

        <text x={padL + plotW / 2} y={svgH - 8} textAnchor="middle" className="ins-svg-label">
          YoY ARR Growth Rate (%) →
        </text>
      </svg>
    </div>
  );
}
