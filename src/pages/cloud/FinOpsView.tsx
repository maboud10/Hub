/**
 * Stratos · Cloud Console — FinOps & Carbon (GreenOps) view.
 */
import { Link } from 'react-router';
import {
  CheckCircle2,
  Clock,
  Flame,
  FolderKanban,
  Leaf,
  Mail,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  Spark,
} from '@/components/neo';
import { useCloudCapabilities } from '@/cloud/access';
import {
  computeCarbonSummary,
  computeFinOpsSummary,
} from '@/cloud/engine';
import { COMMITMENTS, CONTRACTS_SEED, HEADCOUNT, TEAM_BY_ID } from '@/cloud/seed';
import { useCloud } from '@/cloud/store';
import { RegionBadge } from './parts';

export function FinOpsView() {
  const caps = useCloudCapabilities();
  const data = useCloud();
  const finops = computeFinOpsSummary(data, data.story);
  const carbon = computeCarbonSummary(data);

  return (
    <div className="cloud-finops">
      <NeoKpis label="FinOps and sustainability summary">
        <NeoKpi
          label="Month-to-date spend"
          value={
            <span className="neo-mono" data-no-translate="true">
              ${finops.mtdUsd.toLocaleString()}
            </span>
          }
          sub={`$${finops.unitCostPerEmployee}/employee across ${HEADCOUNT.toLocaleString()} staff`}
          icon={<Wallet />}
          tone="cyan"
          spark={<Spark data={finops.dailyTrend.slice(0, 11).map((d) => d.actual ?? d.forecast)} width={104} height={32} />}
        />
        <NeoKpi
          label="30-day forecast vs budget"
          value={
            <span className="neo-mono" data-no-translate="true">
              ${finops.forecastUsd.toLocaleString()}
            </span>
          }
          sub={`Budget $${finops.budgetUsd.toLocaleString()} · ${finops.openAnomaliesCount} open anomalies`}
          icon={<Flame />}
          tone={finops.forecastUsd > finops.budgetUsd ? 'amber' : 'emerald'}
          spark={<Spark data={finops.dailyTrend.map((d) => d.forecast)} width={104} height={32} />}
        />
        <NeoKpi
          label="Actionable monthly savings"
          value={
            <span className="neo-mono" data-no-translate="true">
              ${finops.potentialSavingsUsd.toLocaleString()}/mo
            </span>
          }
          sub={`$${finops.realisedSavingsUsd.toLocaleString()}/mo already realised`}
          icon={<TrendingDown />}
          tone="emerald"
        />
        <NeoKpi
          label="GreenOps carbon footprint"
          value={
            <span className="neo-mono" data-no-translate="true">
              {(carbon.totalMonthlyKg / 1000).toFixed(1)} tCO₂e/mo
            </span>
          }
          sub={`${carbon.potentialSavingsKg} kg CO₂e/mo batch window savings`}
          icon={<Leaf />}
          tone="emerald"
        />
      </NeoKpis>

      {/* Active Cost Anomalies */}
      <NeoPanel
        hud="Nova Cost Guard · Automated root-cause attribution"
        title="Cost Anomalies & Egress Spikes"
        icon={<Flame />}
        actions={
          <button
            type="button"
            className="neo-btn neo-btn--xs neo-btn--soft"
            onClick={() =>
              data.notifyFinance(
                `Forecast $${finops.forecastUsd.toLocaleString()} vs $${finops.budgetUsd.toLocaleString()} budget (${finops.openAnomaliesCount} open anomalies).`,
              )
            }
            data-qa="notify-finance-btn"
          >
            <Mail />
            <span>Notify Finance</span>
          </button>
        }
      >
        <div className="cloud-anomaly-grid">
          {finops.anomalies.map((an) => {
            const st = data.anomalies[an.id]?.status;
            const resolved = st === 'resolved';
            return (
              <div key={an.id} className="cloud-anomaly-card" data-qa={`anomaly-${an.id}`}>
                <div className="cloud-anomaly-card__top">
                  <div>
                    <div className="cloud-anomaly-card__badges">
                      <Chip tone={resolved ? 'emerald' : 'amber'} size="sm">
                        {resolved ? 'Remediated' : `${an.factor}× daily spike`}
                      </Chip>
                      <RegionBadge regionId={an.region} />
                      <span className="neo-mono cloud-anomaly-card__svc" data-no-translate="true">
                        {an.service}
                      </span>
                    </div>
                    <h3 className="cloud-anomaly-card__title">{an.title}</h3>
                  </div>
                  <div className="cloud-anomaly-card__save neo-mono" data-no-translate="true">
                    -${an.savingsUsd.toLocaleString()}/mo
                  </div>
                </div>

                <p className="cloud-anomaly-card__exp">{an.explanation}</p>

                <ul className="cloud-anomaly-card__drivers">
                  {an.drivers.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>

                <div className="cloud-anomaly-card__fix">
                  <strong>Recommended fix:</strong> <span>{an.fix}</span>
                </div>

                {caps.canManageFinOps && (
                  <div className="cloud-anomaly-card__actions">
                    {!resolved ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--plasma"
                        onClick={() => data.resolveAnomaly(an.id)}
                        data-qa={`resolve-anomaly-${an.id}`}
                      >
                        <CheckCircle2 />
                        <span>Remediate anomaly</span>
                      </button>
                    ) : (
                      <Chip tone="emerald" size="sm" icon={<CheckCircle2 />}>
                        Savings locked in
                      </Chip>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--xs neo-btn--soft"
                      onClick={() =>
                        data.createFollowUpTask({
                          title: `FinOps: ${an.title} (${an.service})`,
                          notes: an.fix,
                          anomalyId: an.id,
                        })
                      }
                    >
                      <FolderKanban />
                      <span>Create Projects task</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Team Showback Budgets & Cost Categories */}
      <div className="cloud-finops-split">
        <NeoPanel
          hud="Chargeback & showback · Cost centers"
          title="Team Monthly Budgets"
          icon={<Wallet />}
        >
          <div className="cloud-team-budgets">
            {finops.byTeam.map((row) => {
              const over = row.forecastUsd > row.budgetUsd;
              return (
                <div key={row.team.id} className="cloud-team-row">
                  <div className="cloud-team-row__top">
                    <div>
                      <strong>{row.team.name}</strong>
                      <span className="neo-mono cloud-team-row__cc" data-no-translate="true">
                        {row.team.costCenter}
                      </span>
                    </div>
                    <div className="neo-mono" data-no-translate="true">
                      <strong>${row.forecastUsd.toLocaleString()}</strong>
                      <span> / ${row.budgetUsd.toLocaleString()}</span>
                    </div>
                  </div>
                  <Bar
                    value={Math.min(1, row.utilization)}
                    fill={over ? 'var(--warning)' : row.team.color}
                    height={7}
                    label={`${row.team.name} budget utilization`}
                  />
                </div>
              );
            })}
          </div>
        </NeoPanel>

        <NeoPanel
          hud="Savings Plans · Reserved capacity · EDP"
          title="Commitments & Procurement Contracts"
          icon={<ShoppingBag />}
          actions={
            <Link to="/procurement" className="neo-btn neo-btn--xs neo-btn--soft">
              <ShoppingBag />
              <span>Open Procurement</span>
            </Link>
          }
        >
          <div className="cloud-commit-list">
            {COMMITMENTS.map((cm) => (
              <div key={cm.id} className="cloud-commit-row">
                <div className="cloud-commit-row__top">
                  <div>
                    <Chip tone="cyan" size="sm">
                      {cm.provider}
                    </Chip>
                    <strong>{cm.label}</strong>
                  </div>
                  <span className="neo-mono" data-no-translate="true">
                    {Math.round(cm.coverage * 100)}% cov · target {Math.round(cm.target * 100)}%
                  </span>
                </div>
                <Bar value={cm.coverage} height={6} label={cm.label} />
                <div className="cloud-commit-row__sub">
                  <span>Utilisation {Math.round(cm.utilisation * 100)}%</span>
                  <span className="neo-mono" data-no-translate="true">
                    +${cm.suggestHourlyUsd}/h saves ${cm.suggestSavingsUsd.toLocaleString()}/mo
                  </span>
                </div>
              </div>
            ))}

            {CONTRACTS_SEED.map((ct) => {
              const pct = Math.min(1, ct.consumedUsd / ct.commitUsd);
              return (
                <div key={ct.id} className="cloud-commit-row">
                  <div className="cloud-commit-row__top">
                    <strong>{ct.provider}</strong>
                    <span className="neo-mono" data-no-translate="true">
                      ${(ct.consumedUsd / 1_000_000).toFixed(2)}M / ${(ct.commitUsd / 1_000_000).toFixed(2)}M
                    </span>
                  </div>
                  <Bar value={pct} fill="var(--success)" height={6} label={ct.provider} />
                </div>
              );
            })}
          </div>
        </NeoPanel>
      </div>

      {/* Rightsizing & Optimisation Recommendations */}
      <NeoPanel
        hud="Automated rightsizing · Zero SLO impact"
        title="FinOps Optimisation Queue"
        icon={<Sparkles />}
      >
        <div className="cloud-rec-grid">
          {finops.recommendations.map((rec) => {
            const applied = data.recs[rec.id]?.status === 'applied';
            return (
              <div key={rec.id} className="cloud-rec-card" data-qa={`rec-${rec.id}`}>
                <div className="cloud-rec-card__top">
                  <Chip tone="slate" size="sm">
                    {TEAM_BY_ID[rec.team].name}
                  </Chip>
                  <div className="cloud-rec-card__savings neo-mono" data-no-translate="true">
                    <span>-${rec.savingsUsd.toLocaleString()}/mo</span>
                    {rec.carbonKg > 0 && <span> · -{rec.carbonKg} kg CO₂e</span>}
                  </div>
                </div>
                <strong className="cloud-rec-card__title">{rec.title}</strong>
                <p className="cloud-rec-card__detail">{rec.detail}</p>
                {caps.canManageFinOps && (
                  <div className="cloud-rec-card__actions">
                    {!applied ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--plasma"
                        onClick={() => data.applyRecommendation(rec.id)}
                        data-qa={`apply-rec-${rec.id}`}
                      >
                        <CheckCircle2 />
                        <span>Apply optimisation</span>
                      </button>
                    ) : (
                      <Chip tone="emerald" size="sm" icon={<CheckCircle2 />}>
                        Applied
                      </Chip>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--xs neo-btn--ghost"
                      onClick={() =>
                        data.createFollowUpTask({
                          title: rec.title,
                          notes: rec.detail,
                          recId: rec.id,
                        })
                      }
                    >
                      <FolderKanban />
                      <span>Send to Projects</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* GreenOps & Carbon Intensity */}
      <NeoPanel
        id="carbon"
        hud="GreenOps · Grid carbon intensity & CFE"
        title="Regional Carbon Footprint & Batch Scheduler"
        icon={<Leaf />}
      >
        <div className="cloud-carbon-regions">
          {carbon.byRegion.map((r) => (
            <div key={r.region.id} className="cloud-carbon-reg-card">
              <div className="cloud-carbon-reg-card__top">
                <strong>{r.region.name}</strong>
                <RegionBadge regionId={r.region.id} />
              </div>
              <div className="cloud-carbon-reg-card__nums neo-mono" data-no-translate="true">
                <span>{r.gridIntensity} gCO₂e/kWh</span>
                <span>·</span>
                <span>{Math.round(r.cfe * 100)}% CFE</span>
              </div>
              <Bar
                value={r.cfe}
                fill="var(--success)"
                height={6}
                label={`${r.region.name} carbon-free energy share`}
              />
              <div className="cloud-carbon-reg-card__foot neo-mono" data-no-translate="true">
                {r.monthlyKg.toLocaleString()} kg CO₂e / month
              </div>
            </div>
          ))}
        </div>

        <div className="cloud-subhead">
          <Clock />
          <span>Carbon-aware batch workload scheduler</span>
        </div>

        <div className="cloud-batch-list">
          {carbon.batchJobs.map((b) => (
            <div key={b.job.id} className="cloud-batch-row" data-qa={`batch-${b.job.id}`}>
              <div className="cloud-batch-row__info">
                <strong className="neo-mono" data-no-translate="true">
                  {b.job.name}
                </strong>
                <RegionBadge regionId={b.job.region} />
                <span className="neo-mono" data-no-translate="true">
                  {String(b.currentHourUtc).padStart(2, '0')}:00 UTC ({b.job.durationH}h)
                </span>
              </div>

              <div className="cloud-batch-row__metrics neo-mono" data-no-translate="true">
                <span>{b.monthlyKg} kg CO₂e/mo</span>
                {b.savingsKg > 0 && (
                  <Chip tone="emerald" size="sm">
                    -{b.savingsKg} kg CO₂e at {String(b.recommendedHourUtc).padStart(2, '0')}:00 UTC
                  </Chip>
                )}
              </div>

              <div className="cloud-batch-row__act">
                {!b.shifted ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--xs neo-btn--soft"
                    onClick={() => data.shiftBatchJob(b.job.id, b.recommendedHourUtc)}
                    data-qa={`shift-batch-${b.job.id}`}
                  >
                    <Leaf />
                    <span>Shift to solar/wind window</span>
                  </button>
                ) : (
                  <Chip tone="emerald" size="sm" icon={<CheckCircle2 />}>
                    Low-carbon schedule active
                  </Chip>
                )}
              </div>
            </div>
          ))}
        </div>
      </NeoPanel>
    </div>
  );
}
