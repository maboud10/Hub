import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Flame,
  Radar,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  NovaChip,
  Ring,
  Spark,
} from '@/components/neo';
import { ProjectSigil } from '@/projects/sigils';
import {
  computeCrmCommandKpis,
  computeDealWinProbability,
  computeTriBandTrajectory,
  formatCompactUsd,
} from '@/crm/engine';
import { NOVA_CRM_SUGGESTIONS } from '@/crm/seed';
import { useCrm } from '@/crm/store';
import type { QuarterForecastPoint } from '@/crm/types';
import { MeddpiccBar, StageBadge } from './shared';

export function CommandView() {
  const navigate = useNavigate();
  const accounts = useCrm((s) => s.accounts);
  const deals = useCrm((s) => s.deals);
  const growthPlays = useCrm((s) => s.growthPlays);
  const signals = useCrm((s) => s.signals);
  const novaResponse = useCrm((s) => s.novaResponse);
  const askNovaCrm = useCrm((s) => s.askNovaCrm);
  const executeGrowthPlay = useCrm((s) => s.executeGrowthPlay);
  const launchAccountExpansion = useCrm((s) => s.launchAccountExpansion);
  const setSelectedDealId = useCrm((s) => s.setSelectedDealId);

  const [activeQuarterIdx, setActiveQuarterIdx] = useState<number>(3);

  const kpis = useMemo(() => computeCrmCommandKpis(accounts, deals), [accounts, deals]);
  const trajectory = useMemo(() => computeTriBandTrajectory(accounts, deals), [accounts, deals]);

  const commitDeals = useMemo(
    () => deals.filter((d) => d.stage === 'commit' || d.stage === 'security').slice(0, 5),
    [deals],
  );

  const handleNovaAction = () => {
    const rec = novaResponse?.recommendedAction;
    if (!rec) return;
    if (rec.kind === 'execute_play' && rec.playId) {
      executeGrowthPlay(rec.playId);
      if (rec.dealId) setSelectedDealId(rec.dealId);
    } else if (rec.kind === 'launch_expansion' && rec.accountId) {
      const created = launchAccountExpansion(rec.accountId);
      if (created) setSelectedDealId(created.id);
    } else if (rec.dealId) {
      setSelectedDealId(rec.dealId);
    }
  };

  return (
    <>
      <NeoBanners>
        <NeoBanner
          tone="orange"
          icon={<Flame />}
          title="Expansion Signal · NEOM Cognitive Mobility hit 98% seat utilization (4,410/4,500) + Arabic RTL telemetry spike"
          meta="$3.40M Q4 Commit"
          onClick={() => setSelectedDealId('deal-neom-q4')}
          action={
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                executeGrowthPlay('play-neom-close');
                setSelectedDealId('deal-neom-q4');
              }}
            >
              <Zap />
              <span>Execute Closing Play</span>
            </button>
          }
        >
          18 Tabuk autonomous transit pods activated Arabic RTL HUD in 72h. Clear Annex-B BYOK to close.
        </NeoBanner>

        {kpis.atRiskDealsCount > 0 && (
          <NeoBanner
            tone="warning"
            icon={<ShieldAlert />}
            title={`Executive Sponsor Intervention · ${kpis.atRiskDealsCount} Enterprise Deals have Champion or Security Review bottlenecks`}
            meta="$5.03M at-risk ACV"
            onClick={() => setSelectedDealId('deal-nordic-vault')}
            action={
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  askNovaCrm('Which Q4 enterprise deals have champion or security risk?');
                }}
              >
                <Sparkles />
                <span>Audit with Nova</span>
              </button>
            }
          >
            Nordic Bank AB ($2.18M) &amp; Meridian Health ($2.85M) need CISO Evidence Room + CFO multi-threading.
          </NeoBanner>
        )}
      </NeoBanners>

      <NeoKpis label="Helix Revenue Orbit KPIs">
        <NeoKpi
          label="Live ARR"
          value={formatCompactUsd(kpis.liveArr)}
          sub="+38% YoY · Sovereign & Enterprise"
          tone="emerald"
          spark={<Spark data={[31.4, 33.8, 36.2, 38.5, 40.1, 41.6, kpis.liveArr / 1_000_000]} width={96} height={30} color="#34d399" />}
          onClick={() => navigate('/crm/accounts')}
        />
        <NeoKpi
          label="Weighted Pipeline"
          value={formatCompactUsd(kpis.weightedPipeline)}
          sub={`${kpis.pipelineCoverageRatio}x coverage · ${formatCompactUsd(kpis.totalOpenPipeline)} open`}
          tone="orange"
          spark={<Spark data={[14.2, 15.6, 16.8, 17.5, 18.4, 19.1, kpis.weightedPipeline / 1_000_000]} width={96} height={30} color="#fb923c" />}
          onClick={() => navigate('/crm/pipeline')}
        />
        <NeoKpi
          label="Net Dollar Retention"
          value={`${kpis.netDollarRetention}%`}
          sub="Top-decile enterprise NRR"
          tone="cyan"
          spark={<Spark data={[124, 126, 128, 130, 132, 133, kpis.netDollarRetention]} width={96} height={30} color="#22d3ee" />}
          onClick={() => navigate('/crm/accounts')}
        />
        <NeoKpi
          label="Neural Win Rate"
          value={`${kpis.neuralWinRate}%`}
          sub="+9.4 pts with MEDDPICC AI"
          tone="violet"
          spark={<Spark data={[32.4, 34.1, 36.0, 37.8, 39.2, 40.6, kpis.neuralWinRate]} width={96} height={30} color="#a78bfa" />}
          onClick={() => navigate('/crm/pipeline')}
        />
        <NeoKpi
          label="Q4 Expansion Velocity"
          value={`+${formatCompactUsd(kpis.q4ExpansionVelocity)}`}
          sub="Autonomous white-space attach"
          tone="pink"
          spark={<Spark data={[3.8, 4.3, 4.9, 5.2, 5.7, 6.1, kpis.q4ExpansionVelocity / 1_000_000]} width={96} height={30} color="#ec4899" />}
          onClick={() => navigate('/crm/playbooks')}
        />
      </NeoKpis>

      <NeoNovaPrompt
        hud="Nova Revenue & Deal Intelligence Copilot"
        title="Synthesize MEDDPICC gaps, dark-funnel telemetry & Q4 closing velocity"
        badge="Autonomous Revenue Orbit"
        placeholder="Ask Nova about Q4 commit risks, NEOM closing plan, AI Copilot white-space, or revenue projections…"
        suggestions={NOVA_CRM_SUGGESTIONS}
        onSubmit={(q) => askNovaCrm(q)}
        submitLabel="Synthesize"
      >
        {novaResponse && (
          <div className="crm-nova-card">
            <div className="crm-nova-card__head">
              <div>
                <div className="crm-nova-card__eyebrow">
                  <NovaChip>Nova Synthesis</NovaChip>
                  <span className="crm-nova-card__query">“{novaResponse.query}”</span>
                </div>
                <h3 className="crm-nova-card__title">{novaResponse.headline}</h3>
              </div>
              <Ring value={novaResponse.confidence / 100} size={48} stroke={5} color="#fb923c">
                {novaResponse.confidence}%
              </Ring>
            </div>

            <p className="crm-nova-card__summary">{novaResponse.summary}</p>

            <div className="crm-nova-metrics">
              {novaResponse.metrics.map((m, i) => (
                <div key={i} className="crm-nova-metric" data-tone={m.tone}>
                  <span className="neo-hud">{m.label}</span>
                  <strong>{m.value}</strong>
                  {m.sub && <span>{m.sub}</span>}
                </div>
              ))}
            </div>

            <ul className="crm-nova-bullets">
              {novaResponse.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>

            {novaResponse.recommendedAction && (
              <div className="crm-nova-card__foot">
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={handleNovaAction}
                >
                  <Zap />
                  <span>{novaResponse.recommendedAction.label}</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/crm/pipeline')}
                >
                  <span>Open MEDDPICC Matrix</span>
                  <ArrowRight />
                </button>
              </div>
            )}
          </div>
        )}
      </NeoNovaPrompt>

      <NeoHome
        main={
          <>
            {/* Interactive SVG Tri-Band Revenue Trajectory Curve */}
            <NeoPanel
              hud="Autonomous Forecast Telemetry · Q1–Q4"
              title="Tri-Band Revenue Trajectory Curve"
              icon={<TrendingUp />}
              actions={
                <div className="crm-legend">
                  <span className="crm-legend__item">
                    <i style={{ background: '#38bdf8' }} /> Committed ARR
                  </span>
                  <span className="crm-legend__item">
                    <i style={{ background: '#fb923c' }} /> Nova Neural Forecast
                  </span>
                  <span className="crm-legend__item">
                    <i style={{ background: '#ec4899' }} /> Best Case Orbit
                  </span>
                </div>
              }
            >
              <TriBandRevenueChart
                points={trajectory}
                activeIndex={activeQuarterIdx}
                onSelectIndex={setActiveQuarterIdx}
              />
            </NeoPanel>

            {/* Nova Autonomous Growth Plays */}
            <NeoPanel
              hud="1-Click Autonomous Execution"
              title="Nova Autonomous Growth Plays"
              icon={<Zap />}
              actions={
                <Chip tone="orange" size="sm">
                  {growthPlays.filter((p) => !p.executed).length} Ready to Execute
                </Chip>
              }
            >
              <div className="crm-plays-grid">
                {growthPlays.map((play) => (
                  <article
                    key={play.id}
                    className={play.executed ? 'crm-play-card is-executed neo-spot' : 'crm-play-card neo-spot'}
                  >
                    <div className="crm-play-card__top">
                      <ProjectSigil icon={play.sigil} color={play.color} size={36} />
                      <div className="grow">
                        <div className="crm-play-card__account">{play.accountName}</div>
                        <h3 className="crm-play-card__title">{play.title}</h3>
                      </div>
                      <Ring value={play.confidence / 100} size={44} stroke={4.5} color={play.color}>
                        {play.confidence}%
                      </Ring>
                    </div>

                    <p className="crm-play-card__sub">{play.subtitle}</p>

                    <div className="crm-play-card__tags">
                      <Chip tone="emerald" size="sm">
                        +{formatCompactUsd(play.impactArr)} ACV Impact
                      </Chip>
                      {play.tags.map((t) => (
                        <Chip key={t} tone="slate" size="sm">
                          {t}
                        </Chip>
                      ))}
                    </div>

                    <div className="crm-play-card__foot">
                      <button
                        type="button"
                        className={play.executed ? 'neo-btn neo-btn--soft neo-btn--sm' : 'neo-btn neo-btn--plasma neo-btn--sm'}
                        onClick={() => executeGrowthPlay(play.id)}
                      >
                        {play.executed ? <CheckCircle2 /> : <Zap />}
                        <span>{play.executed ? 'Executed · Pipeline Updated' : play.ctaLabel}</span>
                      </button>
                      {play.dealId && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--sm"
                          onClick={() => setSelectedDealId(play.dealId!)}
                        >
                          <span>Inspect Deal 360</span>
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </NeoPanel>
          </>
        }
        side={
          <>
            {/* Q4 Commit & Security Watchlist */}
            <NeoPanel
              hud="High-Velocity Deals"
              title="Q4 Commit & Security Radar"
              icon={<Radar />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/crm/pipeline')}
                >
                  All Deals
                </button>
              }
            >
              <div className="crm-side-deals">
                {commitDeals.map((d) => {
                  const winProb = computeDealWinProbability(d);
                  return (
                    <div
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      className="crm-side-deal"
                      onClick={() => setSelectedDealId(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDealId(d.id);
                        }
                      }}
                    >
                      <div className="crm-side-deal__top">
                        <ProjectSigil icon={d.sigil} color={d.color} size={28} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="crm-side-deal__name truncate">{d.accountName}</div>
                          <div className="crm-side-deal__meta">
                            <span>{formatCompactUsd(d.acv)}</span>
                            <span>·</span>
                            <StageBadge stage={d.stage} />
                          </div>
                        </div>
                        <Ring
                          value={winProb / 100}
                          size={38}
                          stroke={4}
                          color={winProb >= 75 ? '#34d399' : '#fb923c'}
                        >
                          {winProb}%
                        </Ring>
                      </div>
                      <MeddpiccBar meddpicc={d.meddpicc} compact />
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            {/* Dark-Funnel Buying Signals */}
            <NeoPanel
              hud="Dark-Funnel Telemetry"
              title="Live Buying Intent Stream"
              icon={<Activity />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => navigate('/crm/playbooks')}
                >
                  Playbooks
                </button>
              }
            >
              <div className="crm-side-signals">
                {signals.slice(0, 4).map((sig) => (
                  <div
                    key={sig.id}
                    className="crm-side-signal"
                    onClick={() => navigate('/crm/playbooks')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate('/crm/playbooks');
                    }}
                  >
                    <ProjectSigil icon={sig.sigil} color={sig.color} size={26} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="crm-side-signal__acc">{sig.accountName}</div>
                      <div className="crm-side-signal__title">{sig.title}</div>
                    </div>
                    <Chip tone="emerald" size="sm">
                      {sig.intentScore}%
                    </Chip>
                  </div>
                ))}
              </div>
            </NeoPanel>
          </>
        }
      />
    </>
  );
}

function TriBandRevenueChart({
  points,
  activeIndex,
  onSelectIndex,
}: {
  points: QuarterForecastPoint[];
  activeIndex: number;
  onSelectIndex: (idx: number) => void;
}) {
  const width = 680;
  const height = 230;
  const padX = 54;
  const padY = 26;

  const minVal = 28_000_000;
  const maxVal = 51_000_000;
  const span = maxVal - minVal;

  const toCoords = (val: number, idx: number) => {
    const x = padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((val - minVal) / span) * (height - padY * 2);
    return [x, y] as const;
  };

  const commitPts = points.map((p, i) => toCoords(p.committedArr, i));
  const neuralPts = points.map((p, i) => toCoords(p.neuralForecastArr, i));
  const bestPts = points.map((p, i) => toCoords(p.bestCaseArr, i));

  const pathFrom = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const commitPath = pathFrom(commitPts);
  const neuralPath = pathFrom(neuralPts);
  const bestPath = pathFrom(bestPts);

  const bandArea = `${bestPath} ${[...commitPts]
    .reverse()
    .map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')} Z`;

  const selected = points[activeIndex] ?? points[points.length - 1];

  return (
    <div className="crm-triband">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="crm-triband__svg"
        role="img"
        aria-label="Tri-Band Revenue Trajectory Curve across Q1 to Q4"
      >
        <defs>
          <linearGradient id="crmBandGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#fb923c" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[30_000_000, 36_000_000, 42_000_000, 48_000_000].map((v) => {
          const [, y] = toCoords(v, 0);
          return (
            <g key={v}>
              <line
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.09"
                strokeDasharray="4 4"
              />
              <text
                x={padX - 10}
                y={y + 4}
                textAnchor="end"
                fill="currentColor"
                opacity="0.48"
                fontSize="10.5"
              >
                ${v / 1_000_000}M
              </text>
            </g>
          );
        })}

        {/* Shaded confidence band between Best Case and Committed */}
        <path d={bandArea} fill="url(#crmBandGrad)" />

        {/* Three trajectory curves */}
        <path d={bestPath} fill="none" stroke="#ec4899" strokeWidth="2.2" strokeDasharray="5 4" />
        <path d={commitPath} fill="none" stroke="#38bdf8" strokeWidth="2.4" />
        <path d={neuralPath} fill="none" stroke="#fb923c" strokeWidth="3.2" />

        {/* Quarter nodes */}
        {points.map((pt, i) => {
          const [x, yCommit] = commitPts[i];
          const [, yNeural] = neuralPts[i];
          const [, yBest] = bestPts[i];
          const isSelected = i === activeIndex;
          return (
            <g
              key={pt.quarter}
              className="crm-triband__node"
              onClick={() => onSelectIndex(i)}
              style={{ cursor: 'pointer' }}
            >
              {isSelected && (
                <line
                  x1={x}
                  y1={padY - 6}
                  x2={x}
                  y2={height - padY + 4}
                  stroke="#fb923c"
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                />
              )}
              <circle cx={x} cy={yBest} r={isSelected ? 5.5 : 4} fill="#ec4899" />
              <circle cx={x} cy={yCommit} r={isSelected ? 5.5 : 4} fill="#38bdf8" />
              <circle
                cx={x}
                cy={yNeural}
                r={isSelected ? 7 : 5}
                fill="#fb923c"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={height - 6}
                textAnchor="middle"
                fill="currentColor"
                fontWeight={isSelected ? '700' : '500'}
                opacity={isSelected ? '1' : '0.68'}
                fontSize="11.5"
              >
                FY26 {pt.quarter}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="crm-triband__cards">
        {points.map((pt, idx) => {
          const active = idx === activeIndex;
          const aiUpside = pt.neuralForecastArr - pt.committedArr;
          return (
            <button
              key={pt.quarter}
              type="button"
              className={active ? 'crm-qtr-card is-active' : 'crm-qtr-card'}
              onClick={() => onSelectIndex(idx)}
            >
              <div className="crm-qtr-card__head">
                <span className="neo-hud">FY26 {pt.quarter}</span>
                <Chip tone={idx === 3 ? 'orange' : 'slate'} size="sm">
                  +{formatCompactUsd(aiUpside)} AI lift
                </Chip>
              </div>
              <div className="crm-qtr-card__row">
                <span>Nova Neural:</span>
                <strong style={{ color: '#fb923c' }}>{formatCompactUsd(pt.neuralForecastArr)}</strong>
              </div>
              <div className="crm-qtr-card__row">
                <span>Committed:</span>
                <span>{formatCompactUsd(pt.committedArr)}</span>
              </div>
              <div className="crm-qtr-card__row">
                <span>Best Case:</span>
                <span>{formatCompactUsd(pt.bestCaseArr)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="crm-triband__footer">
        <span>
          Selected <b>FY26 {selected.quarter}</b>: Neural AI projects{' '}
          <b>{formatCompactUsd(selected.neuralForecastArr)}</b> (
          +{formatCompactUsd(selected.neuralForecastArr - selected.committedArr)} above Committed floor)
        </span>
      </div>
    </div>
  );
}
