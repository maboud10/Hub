import { useMemo } from 'react';
import {
  Globe,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  Ring,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import {
  computeSimulatorProjection,
  formatCompactUsd,
} from '@/crm/engine';
import { useCrm } from '@/crm/store';
import type { SimulatorPresetId } from '@/crm/types';
import { useCrmUsersMap } from './shared';

const PRESET_OPTIONS: { id: SimulatorPresetId; label: string; badge: string }[] = [
  { id: 'conservative', label: 'Conservative', badge: '124% NDR' },
  { id: 'base', label: 'Base Plan', badge: '134% NDR' },
  { id: 'hypergrowth', label: 'Hypergrowth Orbit', badge: '152% NDR' },
];

export function SimulatorView() {
  const accounts = useCrm((s) => s.accounts);
  const deals = useCrm((s) => s.deals);
  const simulator = useCrm((s) => s.simulator);
  const updateSimulator = useCrm((s) => s.updateSimulator);
  const applySimulatorPreset = useCrm((s) => s.applySimulatorPreset);
  const usersMap = useCrmUsersMap();

  const projection = useMemo(
    () => computeSimulatorProjection(simulator, accounts, deals),
    [simulator, accounts, deals],
  );

  const totalGrowthAdded = projection.newLogoArr + projection.expansionArr;
  const expansionSharePct =
    totalGrowthAdded > 0
      ? Math.round((projection.expansionArr / totalGrowthAdded) * 100)
      : 60;
  const newLogoSharePct = 100 - expansionSharePct;

  return (
    <div className="crm-simulator">
      <NeoKpis label="Revenue & Quota Simulator Outputs">
        <NeoKpi
          label="Projected FY27 ARR"
          value={formatCompactUsd(projection.fy27ProjectedArr)}
          sub={`${projection.arrDeltaVsBase >= 0 ? '+' : ''}${formatCompactUsd(projection.arrDeltaVsBase)} vs Base Plan`}
          tone="orange"
        />
        <NeoKpi
          label="Net Expansion ARR Added"
          value={`+${formatCompactUsd(projection.expansionArr)}`}
          sub={`Includes ${formatCompactUsd(projection.aiCopilotArr)} Nova AI attach`}
          tone="emerald"
        />
        <NeoKpi
          label="New Logo Enterprise ARR"
          value={`+${formatCompactUsd(projection.newLogoArr)}`}
          sub={`Effective Win Rate: ${projection.effectiveWinRate}%`}
          tone="cyan"
        />
        <NeoKpi
          label="Simulated Enterprise Cycle"
          value={`${projection.avgCycleDays} days`}
          sub={`-${simulator.cycleCompression}% cycle compression`}
          tone="violet"
        />
      </NeoKpis>

      <NeoHome
        main={
          <>
            {/* InteractiveLevers & Scenario Presets */}
            <NeoPanel
              hud="Monte Carlo & Neural Levers"
              title="Revenue & Quota Trajectory Simulator"
              icon={<Sliders />}
              actions={
                <div className="crm-preset-btns" role="group" aria-label="Simulator presets">
                  {PRESET_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={
                        simulator.preset === p.id
                          ? 'neo-btn neo-btn--plasma neo-btn--sm'
                          : 'neo-btn neo-btn--soft neo-btn--sm'
                      }
                      onClick={() => applySimulatorPreset(p.id)}
                    >
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="crm-sliders-grid">
                {/* Slider 1: Win Rate Uplift */}
                <div className="crm-slider-card">
                  <div className="crm-slider-card__top">
                    <span className="neo-hud">Win Rate Uplift (MEDDPICC AI)</span>
                    <strong className="crm-slider-card__val">+{simulator.winRateUplift}%</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={1}
                    value={simulator.winRateUplift}
                    aria-label="Win Rate Uplift"
                    className="crm-range"
                    onChange={(e) =>
                      updateSimulator({ winRateUplift: Number(e.target.value) })
                    }
                  />
                  <div className="crm-slider-card__ticks">
                    <span>+0% (Baseline)</span>
                    <span>Effective: {projection.effectiveWinRate}%</span>
                    <span>+15% (Max)</span>
                  </div>
                </div>

                {/* Slider 2: Sales Cycle Compression */}
                <div className="crm-slider-card">
                  <div className="crm-slider-card__top">
                    <span className="neo-hud">Sales Cycle Compression</span>
                    <strong className="crm-slider-card__val">{simulator.cycleCompression}%</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    step={1}
                    value={simulator.cycleCompression}
                    aria-label="Sales Cycle Compression"
                    className="crm-range"
                    onChange={(e) =>
                      updateSimulator({ cycleCompression: Number(e.target.value) })
                    }
                  />
                  <div className="crm-slider-card__ticks">
                    <span>0% (74d avg)</span>
                    <span>Cycle: {projection.avgCycleDays} days</span>
                    <span>35% (48d fast-track)</span>
                  </div>
                </div>

                {/* Slider 3: Net Dollar Retention */}
                <div className="crm-slider-card">
                  <div className="crm-slider-card__top">
                    <span className="neo-hud">Net Dollar Retention (NDR)</span>
                    <strong className="crm-slider-card__val">{simulator.netDollarRetention}%</strong>
                  </div>
                  <input
                    type="range"
                    min={110}
                    max={160}
                    step={2}
                    value={simulator.netDollarRetention}
                    aria-label="Net Dollar Retention"
                    className="crm-range"
                    onChange={(e) =>
                      updateSimulator({ netDollarRetention: Number(e.target.value) })
                    }
                  />
                  <div className="crm-slider-card__ticks">
                    <span>110%</span>
                    <span>Base: 134%</span>
                    <span>160% (Sovereign Surge)</span>
                  </div>
                </div>

                {/* Slider 4: AI Copilot Attach Rate */}
                <div className="crm-slider-card">
                  <div className="crm-slider-card__top">
                    <span className="neo-hud">AI Copilot Attach Rate</span>
                    <strong className="crm-slider-card__val">{simulator.copilotAttachRate}%</strong>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={90}
                    step={5}
                    value={simulator.copilotAttachRate}
                    aria-label="AI Copilot Attach Rate"
                    className="crm-range"
                    onChange={(e) =>
                      updateSimulator({ copilotAttachRate: Number(e.target.value) })
                    }
                  />
                  <div className="crm-slider-card__ticks">
                    <span>20%</span>
                    <span>+{formatCompactUsd(projection.aiCopilotArr)} AI ARR</span>
                    <span>90%</span>
                  </div>
                </div>
              </div>
            </NeoPanel>

            {/* FY27 ARR Trajectory Curve + New vs Expansion Mix */}
            <NeoPanel
              hud="Simulated FY27 Trajectory & Mix"
              title="FY27 ARR Trajectory & Expansion Composition"
              icon={<TrendingUp />}
              actions={
                <Chip
                  tone={projection.arrDeltaVsBase >= 0 ? 'emerald' : 'amber'}
                  size="sm"
                >
                  {projection.arrDeltaVsBase >= 0 ? '+' : ''}
                  {formatCompactUsd(projection.arrDeltaVsBase)} vs Base Plan
                </Chip>
              }
            >
              <div className="crm-sim-bars">
                {projection.quarterlyCurve.map((q) => {
                  const maxScale = 95_000_000;
                  const basePct = Math.min(100, Math.round((q.baselineArr / maxScale) * 100));
                  const simPct = Math.min(100, Math.round((q.simulatedArr / maxScale) * 100));
                  return (
                    <div key={q.quarter} className="crm-sim-qtr">
                      <div className="crm-sim-qtr__head">
                        <span className="neo-hud">{q.quarter}</span>
                        <div>
                          <span className="crm-sim-qtr__base">
                            Base: {formatCompactUsd(q.baselineArr)}
                          </span>
                          <strong className="crm-sim-qtr__sim">
                            Simulated: {formatCompactUsd(q.simulatedArr)}
                          </strong>
                        </div>
                      </div>
                      <div className="crm-sim-dualbar">
                        <div
                          className="crm-sim-dualbar__base"
                          style={{ width: `${basePct}%` }}
                          title={`Base Plan: ${formatCompactUsd(q.baselineArr)}`}
                        />
                        <div
                          className="crm-sim-dualbar__sim"
                          style={{ width: `${simPct}%` }}
                          title={`Simulated: ${formatCompactUsd(q.simulatedArr)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* New vs Expansion ARR Mix Bar */}
              <div className="crm-mix-box">
                <div className="crm-mix-box__head">
                  <span className="neo-hud">Net-New ARR Mix (New Logo vs Customer Expansion)</span>
                  <span>
                    <b>{newLogoSharePct}% New Logo</b> ({formatCompactUsd(projection.newLogoArr)}) ·{' '}
                    <b>{expansionSharePct}% Expansion &amp; AI Attach</b> (
                    {formatCompactUsd(projection.expansionArr)})
                  </span>
                </div>
                <div className="crm-mix-bar">
                  <div
                    className="crm-mix-bar__new"
                    style={{ width: `${newLogoSharePct}%` }}
                  />
                  <div
                    className="crm-mix-bar__exp"
                    style={{ width: `${expansionSharePct}%` }}
                  />
                </div>
              </div>
            </NeoPanel>
          </>
        }
        side={
          <NeoPanel
            hud="Global Revenue Pods"
            title="Regional Pod Quota Attainment"
            icon={<Globe />}
          >
            <div className="crm-pod-list">
              {projection.regionalPods.map((pod) => {
                const lead = usersMap.get(pod.leadId) ?? SEED_USERS[0];
                const overQuota = pod.attainmentPct >= 100;
                return (
                  <div key={pod.region} className="crm-pod-card">
                    <div className="crm-pod-card__top">
                      <div>
                        <div className="crm-pod-card__region">{pod.region}</div>
                        <div className="crm-pod-card__lead">
                          <Avatar user={lead} size={22} />
                          <span>Lead: {lead.name}</span>
                          <span>·</span>
                          <span>{pod.dealCount} deals</span>
                        </div>
                      </div>
                      <Ring
                        value={Math.min(1, pod.attainmentPct / 125)}
                        size={48}
                        stroke={5}
                        color={overQuota ? '#34d399' : '#fb923c'}
                      >
                        {pod.attainmentPct}%
                      </Ring>
                    </div>

                    <div className="crm-pod-card__nums">
                      <span>Quota: {formatCompactUsd(pod.quotaArr)}</span>
                      <strong style={{ color: pod.color }}>
                        Projected: {formatCompactUsd(pod.projectedArr)}
                      </strong>
                    </div>

                    <Bar
                      value={Math.min(1, pod.attainmentPct / 120)}
                      fill={`linear-gradient(90deg, ${pod.color}, #ec4899)`}
                      label={`${pod.region} quota attainment`}
                    />
                  </div>
                );
              })}
            </div>
          </NeoPanel>
        }
      />
    </div>
  );
}
