/**
 * Stratos · Cloud Console — Overview (Home) view.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Globe2,
  Leaf,
  Plus,
  RotateCcw,
  Server,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoBanner,
  NeoBanners,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  NeoTracker,
  Spark,
} from '@/components/neo';
import { useCloudCapabilities } from '@/cloud/access';
import {
  NOVA_SUGGESTIONS,
  PROVISION_STEPS,
  allServicesTelemetry,
  askCloudNova,
  computeCarbonSummary,
  computeFinOpsSummary,
  computeLiveAlerts,
  effectiveResources,
  isStoryDegraded,
  provisionJourneyStage,
  regionSummary,
  type NovaAnswer,
} from '@/cloud/engine';
import { useCloud } from '@/cloud/store';
import type { RegionId } from '@/cloud/types';
import { CrossAppLinksBar, StatusChip, StratosWorldMap } from './parts';

export function OverviewView() {
  const navigate = useNavigate();
  const caps = useCloudCapabilities();
  const data = useCloud();
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('eu-west-2');
  const [novaAnswer, setNovaAnswer] = useState<NovaAnswer>(() =>
    askCloudNova(NOVA_SUGGESTIONS[0], data, data.story),
  );

  const degraded = isStoryDegraded(data.story);
  const servicesTel = allServicesTelemetry(data.story);
  const healthyCount = servicesTel.filter((t) => t.status === 'healthy').length;
  const totalRps = servicesTel.reduce((a, t) => a + t.rps, 0);
  const finops = computeFinOpsSummary(data, data.story);
  const carbon = computeCarbonSummary(data);
  const alerts = computeLiveAlerts(data, data.story);
  const resources = effectiveResources(data);
  const regDetail = regionSummary(selectedRegion, resources, data.story);

  const latestReq = data.requests[0];
  const reqStage = latestReq ? provisionJourneyStage(latestReq) : null;

  return (
    <div className="cloud-overview">
      <NeoBanners>
        {degraded ? (
          <NeoBanner
            tone="warning"
            icon={<TriangleAlert />}
            title="SEV2 INC-2047 · Elevated payment latency in eu-west-2 (London)"
            meta="payments-svc v2.41.0 · p95 820ms · 23.0× SLO burn"
            to="/cloud/observability"
            action={
              caps.canManageInfra ? (
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--plasma"
                  onClick={() => data.recoverStory()}
                >
                  <RotateCcw />
                  <span>Roll back v2.41.0</span>
                </button>
              ) : undefined
            }
          >
            <span>Correlated with DevHub deploy 40m ago and missing Postgres index on ledger_entries.</span>
          </NeoBanner>
        ) : (
          <NeoBanner
            tone="emerald"
            icon={<CheckCircle2 />}
            title="All 8 production services are meeting SLO objectives across 4 regions"
            meta="payments-svc rolled back to v2.40.9 · p95 240ms"
            action={
              caps.canManageInfra ? (
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--soft"
                  onClick={() => data.retriggerStory()}
                >
                  <Zap />
                  <span>Simulate regression</span>
                </button>
              ) : undefined
            }
          />
        )}

        {caps.isFinOpsOnly && (
          <NeoBanner
            tone="cyan"
            icon={<Wallet />}
            title="FinOps & Sustainability Lens"
            meta="Read-only infrastructure · Full FinOps controls enabled"
            to="/cloud/finops"
          >
            <span>You have full access to cloud budgets, anomaly remediation, commitment planning and GreenOps.</span>
          </NeoBanner>
        )}
      </NeoBanners>

      <NeoKpis label="Cloud fleet metrics">
        <NeoKpi
          label="Fleet health & SLOs"
          value={
            <span className="neo-mono" data-no-translate="true">
              {healthyCount} / {servicesTel.length}
            </span>
          }
          sub={degraded ? '1 service fast-burning error budget' : 'All services within error budget'}
          icon={<Server />}
          tone={degraded ? 'amber' : 'emerald'}
          spark={<Spark data={servicesTel.map((s) => s.p95)} width={104} height={32} />}
          to="/cloud/services"
        />
        <NeoKpi
          label="Global traffic & latency"
          value={
            <span className="neo-mono" data-no-translate="true">
              {totalRps.toLocaleString()} rps
            </span>
          }
          sub={degraded ? 'eu-west-2 p95 820ms · me-central-1 180ms' : 'Global weighted p95 168ms'}
          icon={<Activity />}
          tone="cyan"
          spark={<Spark data={servicesTel[0].series.rps} width={104} height={32} />}
          to="/cloud/observability"
        />
        <NeoKpi
          label="FinOps forecast vs budget"
          value={
            <span className="neo-mono" data-no-translate="true">
              ${Math.round(finops.forecastUsd / 1000)}k / ${Math.round(finops.budgetUsd / 1000)}k
            </span>
          }
          sub={`${finops.openAnomaliesCount} anomalies · $${finops.potentialSavingsUsd.toLocaleString()}/mo savings`}
          icon={<Wallet />}
          tone={finops.forecastUsd > finops.budgetUsd ? 'amber' : 'emerald'}
          spark={<Spark data={finops.dailyTrend.slice(0, 14).map((d) => d.forecast)} width={104} height={32} />}
          to="/cloud/finops"
        />
        <NeoKpi
          label="GreenOps carbon intensity"
          value={
            <span className="neo-mono" data-no-translate="true">
              {(carbon.totalMonthlyKg / 1000).toFixed(1)} tCO₂e
            </span>
          }
          sub={`${carbon.potentialSavingsKg} kg CO₂e/mo batch savings ready`}
          icon={<Leaf />}
          tone="emerald"
          to="/cloud/finops#carbon"
        />
      </NeoKpis>

      <NeoHome
        main={
          <>
            <NeoPanel
              hud="Multi-region topology · Live telemetry"
              title="Global Infrastructure Map"
              icon={<Globe2 />}
              actions={
                <div className="cloud-panel-actions">
                  <Link to={`/cloud/clusters?region=${selectedRegion}`} className="neo-btn neo-btn--sm neo-btn--soft">
                    <Cpu />
                    <span>Inspect region</span>
                  </Link>
                  {caps.canProvision && (
                    <Link to={`/cloud/provisioning?region=${selectedRegion}`} className="neo-btn neo-btn--sm neo-btn--plasma">
                      <Plus />
                      <span>Provision here</span>
                    </Link>
                  )}
                </div>
              }
            >
              <StratosWorldMap selectedRegion={selectedRegion} onSelectRegion={setSelectedRegion} />

              <div className="cloud-region-focus">
                <div className="cloud-region-focus__head">
                  <div>
                    <div className="neo-hud">{regDetail.region.id}</div>
                    <h3 className="cloud-region-focus__title">
                      <span>{regDetail.region.name}</span>
                      <span> · </span>
                      <span>{regDetail.region.city}</span>
                    </h3>
                  </div>
                  <StatusChip status={regDetail.status} />
                </div>

                <div className="cloud-region-focus__grid">
                  <div className="cloud-stat-box">
                    <span className="neo-hud">Regional p95</span>
                    <strong className="neo-mono" data-no-translate="true">
                      {regDetail.p95}ms
                    </strong>
                    <span className="cloud-stat-box__sub">
                      <span>Error rate</span>{' '}
                      <span className="neo-mono" data-no-translate="true">
                        {(regDetail.errorRate * 100).toFixed(2)}%
                      </span>
                    </span>
                  </div>
                  <div className="cloud-stat-box">
                    <span className="neo-hud">Active resources</span>
                    <strong className="neo-mono" data-no-translate="true">
                      {regDetail.resourceCount}
                    </strong>
                    <span className="cloud-stat-box__sub">
                      <span className="neo-mono" data-no-translate="true">
                        ${regDetail.monthlyUsd.toLocaleString()}
                      </span>{' '}
                      <span>/ month</span>
                    </span>
                  </div>
                  <div className="cloud-stat-box">
                    <span className="neo-hud">Grid carbon & CFE</span>
                    <strong className="neo-mono" data-no-translate="true">
                      {regDetail.region.gridIntensity} gCO₂e/kWh
                    </strong>
                    <span className="cloud-stat-box__sub">
                      <span className="neo-mono" data-no-translate="true">
                        {Math.round(regDetail.region.cfe * 100)}%
                      </span>{' '}
                      <span>carbon-free energy</span>
                    </span>
                  </div>
                  <div className="cloud-stat-box">
                    <span className="neo-hud">Data residency</span>
                    <strong>{regDetail.region.residency ?? 'Global / unrestricted'}</strong>
                    <span className="cloud-stat-box__sub">
                      <span>PUE</span>{' '}
                      <span className="neo-mono" data-no-translate="true">
                        {regDetail.region.pue}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </NeoPanel>

            <NeoTracker
              hud="Self-service IaC · Policy & FinOps guardrails"
              title={
                latestReq
                  ? `Provisioning ${latestReq.spec.name} (${latestReq.spec.region})`
                  : 'Zero-touch infrastructure provisioning pipeline'
              }
              steps={PROVISION_STEPS.map((s) => ({ label: s.label, sub: s.sub }))}
              current={reqStage ? reqStage.current : 2}
              state={reqStage ? reqStage.state : 'active'}
              progress={reqStage ? reqStage.progress : 0.65}
              eta={latestReq ? `$${latestReq.monthlyUsd}/mo` : 'OPA + FinOps gated'}
              message={
                reqStage
                  ? reqStage.message
                  : 'Every database, cache, namespace and bucket passes 5 automated policy, residency and budget checks before Terraform apply.'
              }
              actions={
                caps.canProvision ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--xs neo-btn--plasma"
                    onClick={() => navigate('/cloud/provisioning')}
                  >
                    <Plus />
                    <span>Open Provisioning</span>
                  </button>
                ) : undefined
              }
            />

            <NeoNovaPrompt
              hud="Nova · Explainable Cloud & FinOps Copilot"
              title="Correlate deploys, traces, SLO burn and cloud spend"
              badge="Live telemetry"
              placeholder="Ask Nova why latency is elevated, which resources to rightsize, or how to cut egress spend…"
              suggestions={NOVA_SUGGESTIONS}
              onSubmit={(q) => setNovaAnswer(askCloudNova(q, data, data.story))}
              submitLabel="Ask Nova"
            >
              <div className="cloud-nova-inline" aria-live="polite">
                <div className="cloud-nova-inline__title">
                  <ShieldCheck />
                  <strong>{novaAnswer.headline}</strong>
                </div>
                <p className="cloud-nova-inline__text">{novaAnswer.summary}</p>
                <div className="cloud-nova-inline__links">
                  {novaAnswer.links.map((lk) => (
                    <Link key={lk.to} to={lk.to} className="neo-btn neo-btn--xs neo-btn--soft">
                      <span>{lk.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </NeoNovaPrompt>
          </>
        }
        side={
          <>
            <NeoPanel
              hud="Observability · Live pager"
              title="Firing Alerts"
              icon={<Siren />}
              actions={
                <Link to="/cloud/observability" className="neo-btn neo-btn--xs neo-btn--ghost">
                  <span>All alerts</span>
                </Link>
              }
            >
              <div className="cloud-side-list">
                {alerts.map((al) => {
                  const acked = data.alerts[al.id]?.status === 'acknowledged';
                  return (
                    <div key={al.id} className="cloud-alert-card">
                      <div className="cloud-alert-card__top">
                        <Chip tone={al.rule.severity === 'critical' ? 'rose' : 'amber'} size="sm">
                          {al.rule.severity === 'critical' ? 'Critical' : 'Warning'}
                        </Chip>
                        <span className="neo-mono cloud-alert-card__val" data-no-translate="true">
                          {al.value}
                        </span>
                      </div>
                      <div className="cloud-alert-card__name">{al.rule.name}</div>
                      <div className="cloud-alert-card__meta">
                        <span className="neo-mono" data-no-translate="true">
                          {al.region ?? 'global'}
                        </span>
                        <span>·</span>
                        <span className="neo-mono" data-no-translate="true">
                          {al.rule.channel}
                        </span>
                      </div>
                      {caps.canManageAlerts && (
                        <div className="cloud-alert-card__actions">
                          {!acked ? (
                            <button
                              type="button"
                              className="neo-btn neo-btn--xs neo-btn--soft"
                              onClick={() => data.acknowledgeAlert(al.id)}
                            >
                              <span>Acknowledge</span>
                            </button>
                          ) : (
                            <Chip tone="emerald" size="sm">
                              Acknowledged
                            </Chip>
                          )}
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--ghost"
                            onClick={() =>
                              data.escalateToIncident({
                                title: al.rule.name,
                                severity: al.rule.severity === 'critical' ? 'SEV2' : 'SEV3',
                                services: al.rule.service ? [al.rule.service] : ['hub-web'],
                                alertId: al.id,
                              })
                            }
                          >
                            <Siren />
                            <span>Escalate</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            <NeoPanel
              hud="FinOps · Cost guardrails"
              title="Spend & Anomalies"
              icon={<Wallet />}
              actions={
                <Link to="/cloud/finops" className="neo-btn neo-btn--xs neo-btn--ghost">
                  <span>FinOps deck</span>
                </Link>
              }
            >
              <div className="cloud-side-list">
                <div className="cloud-budget-mini">
                  <div className="cloud-budget-mini__row">
                    <span>30-day forecast</span>
                    <strong className="neo-mono" data-no-translate="true">
                      ${finops.forecastUsd.toLocaleString()}
                    </strong>
                  </div>
                  <Bar
                    value={Math.min(1, finops.forecastUsd / finops.budgetUsd)}
                    fill={finops.forecastUsd > finops.budgetUsd ? 'var(--warning)' : 'var(--success)'}
                    label="Monthly budget utilization"
                  />
                  <div className="cloud-budget-mini__foot">
                    <span>Monthly budget</span>
                    <span className="neo-mono" data-no-translate="true">
                      ${finops.budgetUsd.toLocaleString()}
                    </span>
                  </div>
                </div>

                {finops.anomalies.map((an) => {
                  const resolved = data.anomalies[an.id]?.status === 'resolved';
                  return (
                    <div key={an.id} className="cloud-anomaly-mini">
                      <div className="cloud-anomaly-mini__top">
                        <strong>{an.title}</strong>
                        <Chip tone={resolved ? 'emerald' : 'amber'} size="sm">
                          {resolved ? (
                            'Resolved'
                          ) : (
                            <span className="neo-mono" data-no-translate="true">
                              -${an.savingsUsd.toLocaleString()}/mo
                            </span>
                          )}
                        </Chip>
                      </div>
                      <p className="cloud-anomaly-mini__sub">{an.fix}</p>
                      {!resolved && caps.canManageFinOps && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--soft"
                          onClick={() => data.resolveAnomaly(an.id)}
                        >
                          <CheckCircle2 />
                          <span>Remediate anomaly</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            <NeoPanel hud="Ecosystem integrations" title="Connected Apps" icon={<Globe2 />}>
              <CrossAppLinksBar />
            </NeoPanel>
          </>
        }
      />
    </div>
  );
}
