/**
 * DevHub ("Forge") — CockpitView (/devhub)
 * Personal engineering command deck: Delivery Stream hero, Nova AI prompt,
 * live 5-stage Canary NeoTracker, Review SLA queue, and Cross-App Radar.
 */
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Cloud,
  Flame,
  GitPullRequest,
  KeyRound,
  Play,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { startFocusSession } from '@/components/FocusEngine';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  NeoTracker,
  Orb,
  Spark,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { useDevHubAccess } from '@/devhub/access';
import {
  CANARY_STEPS,
  deploySeries,
  diffStats,
  doraMetrics,
  evaluateGates,
  gateVerdict,
  liveRun,
  myPrBuckets,
  pipelineKpis,
  reviewQueue,
  reviewSla,
  riskScore,
  streamLanes,
} from '@/devhub/engine';
import { useDevHub } from '@/devhub/store';
import {
  DeliveryStreamHero,
  RelTime,
  RiskBadge,
  UserPill,
  rotateSecretInVault,
  useDevHubLive,
} from './parts';

export function CockpitView({ onOpenNova }: { onOpenNova: (prompt?: string) => void }) {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const caps = useDevHubAccess();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const live = useDevHubLive();

  const services = useDevHub((s) => s.services);
  const prs = useDevHub((s) => s.prs);
  const runs = useDevHub((s) => s.runs);
  const deploys = useDevHub((s) => s.deploys);
  const health = useDevHub((s) => s.health);
  const merged = useDevHub((s) => s.merged);
  const activity = useDevHub((s) => s.activity);
  const submitReview = useDevHub((s) => s.submitReview);
  const rollback = useDevHub((s) => s.rollback);

  const liveRuns = runs.map((r) => liveRun(r, now));
  const queue = reviewQueue(prs, userId);
  const myBuckets = myPrBuckets(prs, userId);
  const pipeKpis = pipelineKpis(runs);
  const dora = doraMetrics({ deploys, merged, now, openIncidents: live.incidents });
  const depSpark = deploySeries(deploys, now, 14);

  const canaryVerdictFor = (d: (typeof deploys)[number]) => {
    const svc = services.find((s) => s.id === d.service);
    const h = health.find((x) => x.service === d.service && x.region === d.region);
    if (!svc || !h) return 'pass' as const;
    return gateVerdict(evaluateGates(h, svc));
  };

  const lanes = streamLanes({
    prs,
    runs: liveRuns,
    deploys,
    now,
    canaryVerdict: canaryVerdictFor,
    frozen: live.freezeState.frozen,
  });

  const activeCanary = deploys.find((d) => d.env === 'production' && d.status === 'in_progress');
  const blockingSecretPr = prs.find((p) => p.secret?.status === 'blocking');

  const canarySteps = CANARY_STEPS.map((pct, idx) => ({
    id: `step-${pct}`,
    label: idx === CANARY_STEPS.length - 1 ? '100% Production' : `${pct}% Canary`,
    sub: idx === 2 && activeCanary?.canary?.autoPaused ? 'Gate warning · 820ms p95' : `${pct}% traffic`,
  }));

  return (
    <div className="dh-stack">
      <NeoBanners>
        {(live.freezeState.frozen || live.freezeState.advisory) && (
          <NeoBanner
            tone={live.freezeState.blocking ? 'danger' : 'warning'}
            icon={<AlertTriangle />}
            title={live.freezeState.blocking ? 'Production Deploy Freeze Active' : 'Active Incident Advisory · INC-2047 (SEV2)'}
            meta={live.freezeState.incident?.code ?? 'eu-west-2'}
            to="/incidents"
            action={
              activeCanary && caps.canDeploy ? (
                <button
                  type="button"
                  className="neo-btn neo-btn--danger neo-btn--xs"
                  onClick={() => rollback(activeCanary.id, userId)}
                >
                  <RotateCcw />
                  <span>Rollback v2.41.0</span>
                </button>
              ) : undefined
            }
          >
            {live.freezeState.reason || 'payments-svc v2.41.0 canary in eu-west-2 is held at 25% due to elevated p95 latency (820ms).'}
          </NeoBanner>
        )}

        {blockingSecretPr && (
          <NeoBanner
            tone="danger"
            icon={<ShieldAlert />}
            title="Push Protection Blocked Merge"
            meta={`PR #${blockingSecretPr.number} · ${blockingSecretPr.secret?.id ?? 'secret-scan'}`}
            to={`/devhub/reviews?pr=${blockingSecretPr.id}`}
            action={
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--xs"
                onClick={() =>
                  void rotateSecretInVault({
                    prId: blockingSecretPr.id,
                    resource: `vault://${blockingSecretPr.service}/webhook-secret`,
                    reason: `Rotate leaked secret on PR #${blockingSecretPr.number}`,
                  })
                }
              >
                <KeyRound />
                <span>Rotate in Vault</span>
              </button>
            }
          >
            <span>{blockingSecretPr.secret?.kind}</span>
            <span> · </span>
            <span className="neo-mono">{blockingSecretPr.secret?.file}</span>
          </NeoBanner>
        )}
      </NeoBanners>

      <NeoKpis label="Forge cockpit metrics">
        <NeoKpi
          label="Awaiting my review"
          value={queue.length}
          sub="Priority review queue"
          icon={<GitPullRequest />}
          tone={queue.length > 2 ? 'warning' : 'app'}
          to="/devhub/reviews"
        />
        <NeoKpi
          label="Pipeline pass rate"
          value={`${Math.round(pipeKpis.successRate * 100)}%`}
          sub={`Median ${pipeKpis.medianMins}m · ${pipeKpis.cacheHitPct}% cache`}
          icon={<Activity />}
          tone={pipeKpis.failed > 0 ? 'warning' : 'success'}
          spark={<Spark data={[82, 85, 88, 90, 84, 89, 92, Math.round(pipeKpis.successRate * 100)]} />}
          to="/devhub/pipelines"
        />
        <NeoKpi
          label="Production canary"
          value={activeCanary ? `${CANARY_STEPS[activeCanary.canary?.step ?? 0]}%` : '100%'}
          sub={activeCanary ? `${activeCanary.service} ${activeCanary.version} · Held` : 'All regions healthy'}
          icon={<Rocket />}
          tone={activeCanary ? 'warning' : 'success'}
          to="/devhub/deploys"
        />
        <NeoKpi
          label="DORA velocity"
          value={dora.overall.toUpperCase()}
          sub={`${dora.deployFreq.perDay}/day · Lead ${dora.leadTime.hours}h`}
          icon={<TrendingUp />}
          tone="app"
          spark={<Spark data={depSpark.deploys} />}
          to="/devhub/insights"
        />
      </NeoKpis>

      <DeliveryStreamHero
        lanes={lanes}
        frozen={live.freezeState.frozen}
        action={
          <Link to="/devhub/deploys" className="neo-btn neo-btn--soft neo-btn--sm">
            <Rocket />
            <span>Release Control</span>
          </Link>
        }
      />

      <NeoHome
        main={
          <div className="dh-stack">
            <NeoNovaPrompt
              hud="Nova Forge Copilot"
              title="Ask Nova to audit a diff, diagnose the EU canary, or rebalance reviews"
              badge="Explainable AI"
              placeholder="e.g. Why is payments-svc v2.41.0 held at 25% in eu-west-2, or is PR #1847 safe to ship?"
              suggestions={[
                'Why is payments-svc v2.41.0 canary held in eu-west-2?',
                'Audit secret finding sec-find-1 on PR #1841',
                'Verify Lucas hotfix PR #1847 for INC-2047',
                'Show DORA bottleneck & tier-1 review load',
              ]}
              onSubmit={(text) => onOpenNova(text)}
              submitLabel="Analyze with Nova"
            />

            {activeCanary && (
              <NeoTracker
                hud="Progressive Canary Tracker · eu-west-2"
                title={`${activeCanary.service} ${activeCanary.version} rollout`}
                steps={canarySteps}
                current={activeCanary.canary?.step ?? 2}
                state={activeCanary.canary?.autoPaused ? 'blocked' : activeCanary.canary?.paused ? 'paused' : 'active'}
                eta="Auto-paused at 25% · Gate warning"
                message="Health gate held progression: eu-west-2 p95 latency is 820ms (baseline 240ms) following PR #1842."
                actions={
                  <div className="dh-inline-actions">
                    {caps.canDeploy && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--danger neo-btn--xs"
                        onClick={() => rollback(activeCanary.id, userId)}
                      >
                        <RotateCcw />
                        <span>1-Click Rollback (v2.40.3)</span>
                      </button>
                    )}
                    <Link to={`/devhub/deploys?deploy=${activeCanary.id}`} className="neo-btn neo-btn--soft neo-btn--xs">
                      <span>Canary Dial</span>
                      <ArrowUpRight />
                    </Link>
                  </div>
                }
              />
            )}

            <NeoPanel
              hud="Review SLA Queue"
              title="Pull Requests Waiting on You"
              icon={<GitPullRequest />}
              actions={
                <Link to="/devhub/reviews" className="neo-btn neo-btn--ghost neo-btn--xs">
                  <span>All Reviews</span>
                  <ArrowUpRight />
                </Link>
              }
            >
              <div className="dh-list">
                {(queue.length ? queue : prs.filter((p) => p.state === 'open').slice(0, 4)).map((pr) => {
                  const svc = services.find((s) => s.id === pr.service);
                  const risk = riskScore(pr, svc);
                  const stats = diffStats(pr.files);
                  const myRev = pr.reviewers.find((r) => r.reviewerId === userId) ?? pr.reviewers[0];
                  const sla = myRev ? reviewSla(pr, myRev, svc?.tier ?? 2, now) : null;
                  return (
                    <article key={pr.id} className="dh-pr-row neo-spot">
                      <div className="dh-pr-row__main">
                        <div className="dh-pr-row__top">
                          <span className="neo-mono dh-pr-num">{`#${pr.number}`}</span>
                          <Link to={`/devhub/reviews?pr=${pr.id}`} className="dh-pr-row__title">
                            {pr.title}
                          </Link>
                          {pr.incident && (
                            <Chip tone="danger" size="sm">
                              <span>{pr.incident}</span>
                            </Chip>
                          )}
                          <RiskBadge report={risk} compact />
                        </div>
                        <div className="dh-pr-row__meta">
                          <span className="neo-mono">{pr.service}</span>
                          <span>·</span>
                          <UserPill userId={pr.authorId} size={18} />
                          <span>·</span>
                          <span className="neo-mono dh-diff-add">{`+${stats.additions}`}</span>
                          <span className="neo-mono dh-diff-del">{`-${stats.deletions}`}</span>
                          {sla && (
                            <>
                              <span>·</span>
                              <Chip
                                tone={sla.state === 'breached' ? 'danger' : sla.state === 'warn' ? 'warning' : 'slate'}
                                size="sm"
                              >
                                <Clock />
                                <span>{sla.state === 'breached' ? 'SLA breached' : `SLA ${sla.slaMins}m`}</span>
                              </Chip>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="dh-pr-row__actions">
                        {caps.canReview && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--success neo-btn--xs"
                            onClick={() => submitReview(pr.id, userId, 'approved', 'Approved from Forge Cockpit')}
                          >
                            <Check />
                            <span>Approve</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--xs"
                          onClick={() => navigate(`/devhub/reviews?pr=${pr.id}`)}
                        >
                          <span>Inspect Diff</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </NeoPanel>

            <NeoPanel
              hud="Author Workbench"
              title="My Active Pull Requests"
              icon={<Flame />}
              actions={
                <div className="dh-inline-actions">
                  <Chip tone="app" size="sm">
                    <span>In review</span>
                    <span className="neo-mono">{myBuckets.review.length}</span>
                  </Chip>
                  <Chip tone="success" size="sm">
                    <span>Approved / Queued</span>
                    <span className="neo-mono">{myBuckets.approved.length + myBuckets.queued.length}</span>
                  </Chip>
                </div>
              }
            >
              <div className="dh-list">
                {prs
                  .filter((p) => p.authorId === userId || p.number === 1842 || p.number === 1841)
                  .slice(0, 4)
                  .map((pr) => (
                    <div key={pr.id} className="dh-pr-row">
                      <div className="dh-pr-row__main">
                        <div className="dh-pr-row__top">
                          <span className="neo-mono dh-pr-num">{`#${pr.number}`}</span>
                          <Link to={`/devhub/reviews?pr=${pr.id}`} className="dh-pr-row__title">
                            {pr.title}
                          </Link>
                          <Chip
                            tone={
                              pr.secret?.status === 'blocking'
                                ? 'danger'
                                : pr.state === 'merged' || pr.state === 'approved'
                                  ? 'success'
                                  : pr.state === 'queued'
                                    ? 'app'
                                    : 'slate'
                            }
                            size="sm"
                          >
                            <span>{pr.secret?.status === 'blocking' ? 'Secret blocked' : pr.state.replace('_', ' ')}</span>
                          </Chip>
                        </div>
                        <div className="dh-pr-row__meta">
                          <span className="neo-mono">{pr.branch}</span>
                          <span>→</span>
                          <span className="neo-mono">{pr.base}</span>
                          <span>·</span>
                          <RelTime at={pr.updatedAt} now={now} />
                        </div>
                      </div>
                      <Link to={`/devhub/reviews?pr=${pr.id}`} className="neo-btn neo-btn--ghost neo-btn--xs">
                        <span>View PR</span>
                        <ArrowUpRight />
                      </Link>
                    </div>
                  ))}
              </div>
            </NeoPanel>
          </div>
        }
        side={
          <div className="dh-stack">
            <NeoPanel hud="Cross-App Telemetry" title="Connected Engineering Ecosystem" icon={<Sparkles />}>
              <div className="dh-bridge-cards">
                <Link to="/incidents" className="dh-bridge-card neo-spot" data-tone={live.incidents.length ? 'danger' : 'success'}>
                  <div className="dh-bridge-card__head">
                    <Orb tone={live.incidents.length ? 'danger' : 'success'} pulse={!!live.incidents.length} />
                    <span className="neo-hud">Incident Command · Sentinel</span>
                    <ArrowUpRight />
                  </div>
                  <div className="dh-bridge-card__title">
                    {live.incidents[0] ? `${live.incidents[0].code} · ${live.incidents[0].title}` : '0 Active SEV1/SEV2 Incidents'}
                  </div>
                  <div className="dh-bridge-card__sub">
                    {live.incidents[0] ? `${live.incidents[0].severity} · On-call engaged` : 'All rotations healthy'}
                  </div>
                </Link>

                <Link to="/cloud/observability" className="dh-bridge-card neo-spot">
                  <div className="dh-bridge-card__head">
                    <Cloud className="dh-bridge-card__icon" />
                    <span className="neo-hud">Cloud Console · Stratos</span>
                    <ArrowUpRight />
                  </div>
                  <div className="dh-bridge-card__title">
                    <span>eu-west-2 p95 · </span>
                    <span className="neo-mono">{activeCanary ? '820ms' : '240ms'}</span>
                  </div>
                  <div className="dh-bridge-card__sub">
                    <span>MTD Cloud Spend </span>
                    <span className="neo-mono">{`$${Math.round(live.cloudSpend.mtdUsd / 1000)}k / $${Math.round(live.cloudSpend.budgetUsd / 1000)}k`}</span>
                  </div>
                </Link>

                <Link to="/vault/secrets" className="dh-bridge-card neo-spot">
                  <div className="dh-bridge-card__head">
                    <KeyRound className="dh-bridge-card__icon" />
                    <span className="neo-hud">Aegis Vault · Secrets</span>
                    <ArrowUpRight />
                  </div>
                  <div className="dh-bridge-card__title">
                    <span>Credential Hygiene · </span>
                    <span className="neo-mono">{`${live.vaultHygiene.score}/100`}</span>
                  </div>
                  <div className="dh-bridge-card__sub">
                    <span>Expiring soon: </span>
                    <span className="neo-mono">{live.vaultHygiene.expiringSoon}</span>
                    <span> · Exposed: </span>
                    <span className="neo-mono">{blockingSecretPr ? 1 : 0}</span>
                  </div>
                </Link>

                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--block"
                  onClick={() => startFocusSession(45)}
                >
                  <Play />
                  <span>Start 45m Deep Code Focus</span>
                </button>
              </div>
            </NeoPanel>

            <NeoPanel hud="Audit Stream" title="Recent Forge Activity" icon={<Activity />}>
              <div className="dh-activity-list">
                {activity.slice(0, 6).map((act) => (
                  <div key={act.id} className="dh-activity-item">
                    <div className="dh-activity-item__top">
                      <UserPill userId={act.actorId} size={18} />
                      <RelTime at={act.at} now={now} />
                    </div>
                    {act.to ? (
                      <Link to={act.to} className="dh-activity-item__text">
                        {act.text}
                      </Link>
                    ) : (
                      <p className="dh-activity-item__text">{act.text}</p>
                    )}
                  </div>
                ))}
              </div>
            </NeoPanel>
          </div>
        }
      />
    </div>
  );
}
