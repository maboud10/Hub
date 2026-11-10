import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FlaskConical,
  Radar,
  Rocket,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTabs,
  Orb,
  type NeoTabItem,
} from '@/components/neo';
import { ProjectSigil } from '@/projects/sigils';
import { filterAnomalies } from '@/insights/engine';
import { useInsights } from '@/insights/store';
import type { AnomalyCategory, AnomalySignal, AnomalyStatus } from '@/insights/types';
import { OwnerPill } from './shared';

type CatFilter = 'all' | AnomalyCategory;
type StatusFilter = 'all' | AnomalyStatus;

const CAT_TABS: NeoTabItem<CatFilter>[] = [
  { value: 'all', label: 'All Signals (|Z| > 2.5σ)', icon: <Radar /> },
  { value: 'breakout', label: 'Growth Breakouts', icon: <Rocket /> },
  { value: 'friction', label: 'Friction & Regressions', icon: <AlertTriangle /> },
];

const STATUS_TABS: NeoTabItem<StatusFilter>[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
];

export function AnomaliesView() {
  const anomalies = useInsights((s) => s.anomalies);
  const acknowledgeAnomaly = useInsights((s) => s.acknowledgeAnomaly);
  const convertAnomalyToGrowthPlay = useInsights((s) => s.convertAnomalyToGrowthPlay);

  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(
    () => filterAnomalies(anomalies, { category: catFilter, status: statusFilter, minAbsZ: 2.5 }),
    [anomalies, catFilter, statusFilter],
  );

  const breakoutCount = anomalies.filter((a) => a.category === 'breakout').length;
  const frictionCount = anomalies.filter((a) => a.category === 'friction').length;
  const activeCount = anomalies.filter((a) => a.status === 'active').length;
  const maxAbsZ = Math.max(...anomalies.map((a) => Math.abs(a.zScore)), 0);

  return (
    <div className="ins-stack">
      <NeoKpis label="Neural Anomaly Radar KPIs">
        <NeoKpi
          label="Active Signals (|Z| > 2.5σ)"
          value={activeCount}
          sub={`${anomalies.length} total tracked signals`}
          icon={<Radar />}
          tone={activeCount > 0 ? 'amber' : 'emerald'}
        />
        <NeoKpi
          label="Growth Breakouts"
          value={breakoutCount}
          sub="Positive Z-score surges"
          icon={<Rocket />}
          tone="emerald"
        />
        <NeoKpi
          label="Friction & Regressions"
          value={frictionCount}
          sub="Latency & drop-off alerts"
          icon={<ShieldAlert />}
          tone="rose"
        />
        <NeoKpi
          label="Peak Statistical Deviation"
          value={`+${maxAbsZ.toFixed(1)}σ`}
          sub="MENA NDR breakout (p < 0.0001)"
          icon={<Sparkles />}
          tone="cyan"
        />
      </NeoKpis>

      <div className="ins-segbar">
        <div className="ins-segbar__left">
          <NeoTabs
            value={catFilter}
            onChange={setCatFilter}
            items={CAT_TABS}
            label="Filter anomalies by signal category"
          />
        </div>
        <div className="ins-segbar__right">
          <NeoTabs
            value={statusFilter}
            onChange={setStatusFilter}
            items={STATUS_TABS}
            label="Filter anomalies by status"
          />
        </div>
      </div>

      <NeoPanel
        hud="Automated Z-Score Telemetry Scanner · Root-Cause Attribution"
        title={`Neural Anomaly & Signal Radar (${filtered.length})`}
        icon={<Radar />}
      >
        {filtered.length === 0 ? (
          <NeoEmpty
            icon={<CheckCircle2 />}
            title="No anomaly signals match this filter"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--soft"
                onClick={() => {
                  setCatFilter('all');
                  setStatusFilter('all');
                }}
              >
                Reset Filters
              </button>
            }
          >
            All monitored telemetry streams are within the ±2.5σ confidence corridor.
          </NeoEmpty>
        ) : (
          <div className="ins-anom-grid">
            {filtered.map((anom) => {
              const isBreakout = anom.category === 'breakout';
              const zFormatted = `${anom.zScore > 0 ? '+' : ''}${anom.zScore.toFixed(1)}σ`;

              return (
                <article
                  key={anom.id}
                  className={`ins-anom-card neo-spot is-${anom.category} is-status-${anom.status}`}
                  data-qa={`ins-anom-${anom.id}`}
                >
                  <div className="ins-anom-card__head">
                    <ProjectSigil icon={anom.sigil} color={anom.color} size={36} />
                    <div className="ins-anom-card__titles">
                      <div className="ins-anom-card__meta">
                        <span className="neo-hud">{anom.code}</span>
                        <Chip tone={isBreakout ? 'emerald' : 'rose'} size="sm">
                          Z = {zFormatted}
                        </Chip>
                        <Chip
                          tone={
                            anom.status === 'active'
                              ? 'amber'
                              : anom.status === 'investigating'
                                ? 'cyan'
                                : 'emerald'
                          }
                          size="sm"
                        >
                          <Orb
                            tone={
                              anom.status === 'active'
                                ? 'amber'
                                : anom.status === 'investigating'
                                  ? 'cyan'
                                  : 'emerald'
                            }
                            pulse={anom.status === 'active'}
                            size={6}
                          />
                          {anom.status.toUpperCase()}
                        </Chip>
                        <span className="neo-hud">{anom.detectedAt}</span>
                      </div>
                      <h3 className="ins-anom-card__title">{anom.title}</h3>
                    </div>
                    <div className="ins-anom-card__delta">
                      <span className="neo-hud">{anom.metricName}</span>
                      <b className={isBreakout ? 'ins-pos' : 'ins-neg'}>{anom.deltaLabel}</b>
                    </div>
                  </div>

                  {/* Miniature SVG Baseline Confidence Band vs Actual Spike Chart */}
                  <AnomalyMiniBandChart signal={anom} />

                  <div className="ins-anom-card__attrib">
                    <div className="ins-anom-card__seg">{anom.segmentLabel}</div>
                    <p className="ins-anom-card__driver">{anom.driverAttribution}</p>
                  </div>

                  <div className="ins-anom-card__foot">
                    <OwnerPill userId={anom.ownerId} prefix="Responder:" />
                    <div className="ins-anom-card__btns">
                      {anom.status !== 'resolved' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--sm"
                          onClick={() =>
                            acknowledgeAnomaly(
                              anom.id,
                              anom.status === 'active' ? 'investigating' : 'resolved',
                            )
                          }
                          data-qa={`ins-ack-${anom.id}`}
                        >
                          {anom.status === 'active' ? <Eye /> : <CheckCircle2 />}
                          <span>{anom.status === 'active' ? 'Acknowledge' : 'Mark Resolved'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={
                          anom.growthPlayCreated
                            ? 'neo-btn neo-btn--soft neo-btn--sm'
                            : 'neo-btn neo-btn--plasma neo-btn--sm'
                        }
                        onClick={() => convertAnomalyToGrowthPlay(anom.id)}
                        data-qa={`ins-play-${anom.id}`}
                      >
                        <FlaskConical />
                        <span>
                          {anom.growthPlayCreated ? 'Growth Play Active' : 'Convert to Growth Play'}
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </NeoPanel>
    </div>
  );
}

function AnomalyMiniBandChart({ signal }: { signal: AnomalySignal }) {
  const w = 420;
  const h = 84;
  const padX = 12;
  const padY = 12;
  const plotW = w - padX * 2;
  const plotH = h - padY * 2;

  const allVals = [
    ...signal.baselineSeries,
    ...signal.actualSeries,
    signal.upperBand,
    signal.lowerBand,
  ];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const span = maxV - minV || 1;

  const xFor = (i: number, len: number) => padX + (i / Math.max(1, len - 1)) * plotW;
  const yFor = (v: number) => padY + plotH - ((v - minV) / span) * plotH;

  const yUpper = yFor(signal.upperBand);
  const yLower = yFor(signal.lowerBand);
  const bandH = Math.max(4, yLower - yUpper);

  const basePts = signal.baselineSeries
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i, signal.baselineSeries.length).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(' ');

  const actualPts = signal.actualSeries
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i, signal.actualSeries.length).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(' ');

  const lastIdx = signal.actualSeries.length - 1;
  const lastX = xFor(lastIdx, signal.actualSeries.length);
  const lastY = yFor(signal.actualSeries[lastIdx]);
  const strokeColor = signal.category === 'breakout' ? '#34d399' : '#fb7185';

  return (
    <div className="ins-mini-chart">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-label={`${signal.title} baseline vs actual chart`}>
        {/* ±2.5σ Baseline Confidence Band */}
        <rect
          x={padX}
          y={yUpper}
          width={plotW}
          height={bandH}
          rx={4}
          fill="rgb(148 163 184 / 0.14)"
          stroke="rgb(148 163 184 / 0.25)"
          strokeDasharray="3 3"
        />
        {/* Expected Baseline Line */}
        <path d={basePts} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="4 4" />
        {/* Actual Telemetry Trajectory */}
        <path d={actualPts} fill="none" stroke={strokeColor} strokeWidth={2.6} strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={4.5} fill={strokeColor} />
      </svg>
      <div className="ins-mini-chart__legend">
        <span>Shaded: ±2.5σ Expected Corridor ({signal.lowerBand}–{signal.upperBand})</span>
        <span style={{ color: strokeColor }}>Solid: Observed Telemetry</span>
      </div>
    </div>
  );
}
