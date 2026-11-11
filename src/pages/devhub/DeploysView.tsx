/**
 * DevHub ("Forge") — DeploysView (/devhub/deploys)
 * Progressive delivery command deck: 5-stage Canary NeoTracker, interactive
 * Canary Traffic Dial, health-gate telemetry, 1-click rollback (allowed during
 * freeze), multi-region matrix, feature flags, and Calendar release windows.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarPlus,
  CheckCircle2,
  Cloud,
  Flag,
  Flame,
  FastForward,
  Globe,
  Lock,
  MessagesSquare,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Sliders,
  Unlock,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoBanner,
  NeoBanners,
  NeoPanel,
  NeoTabs,
  NeoTracker,
  Orb,
  Ring,
  Spark,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { useDevHubAccess } from '@/devhub/access';
import {
  CANARY_STEPS,
  canaryDecision,
  evaluateGates,
  gateVerdict,
  REGION_META,
  REGIONS,
  rollbackTarget,
} from '@/devhub/engine';
import type { EnvId } from '@/devhub/types';
import { useDevHub } from '@/devhub/store';
import {
  RelTime,
  UserPill,
  declareIncidentFromDevhub,
  scheduleWindowInCalendar,
  shareToPulseChat,
  useDevHubLive,
} from './parts';

export function DeploysView() {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const caps = useDevHubAccess();
  const now = useNow(15_000);
  const live = useDevHubLive();
  const [params, setParams] = useSearchParams();

  const services = useDevHub((s) => s.services);
  const deploys = useDevHub((s) => s.deploys);
  const health = useDevHub((s) => s.health);
  const canarySeries = useDevHub((s) => s.canarySeries);
  const flags = useDevHub((s) => s.flags);
  const windows = useDevHub((s) => s.windows);

  const promoteCanary = useDevHub((s) => s.promoteCanary);
  const setCanaryTraffic = useDevHub((s) => s.setCanaryTraffic);
  const toggleCanaryPause = useDevHub((s) => s.toggleCanaryPause);
  const rollback = useDevHub((s) => s.rollback);
  const setDeployFreeze = useDevHub((s) => s.setDeployFreeze);
  const toggleFlag = useDevHub((s) => s.toggleFlag);
  const setFlagRollout = useDevHub((s) => s.setFlagRollout);

  const [envFilter, setEnvFilter] = useState<'all' | EnvId>('all');
  const [freezeInput, setFreezeInput] = useState('INC-2047 · Elevated payment latency in eu-west-2');

  const selectedDeployId = params.get('deploy');
  const activeCanary =
    deploys.find((d) => d.id === selectedDeployId && d.canary) ??
    deploys.find((d) => d.env === 'production' && d.status === 'in_progress') ??
    deploys.find((d) => d.canary) ??
    deploys[0];

  const canarySvc = services.find((s) => s.id === activeCanary?.service) ?? services[0];
  const canaryHealth =
    health.find((h) => h.service === activeCanary?.service && h.region === activeCanary?.region) ??
    health[0];
  const gates = evaluateGates(canaryHealth, canarySvc);
  const verdict = gateVerdict(gates);
  const decision = canaryDecision(gates);
  const rbTarget = activeCanary ? rollbackTarget(deploys, activeCanary) : null;
  const series = canarySeries[activeCanary?.id ?? 'dep-pay-2410-euw2'] ?? {
    latency: [240, 245, 242, 248],
    errors: [0.002, 0.002, 0.002, 0.002],
  };

  const currentStepIdx = activeCanary?.canary?.step ?? 4;
  const currentTrafficPct = CANARY_STEPS[currentStepIdx] ?? 100;

  const filteredDeploys = deploys.filter((d) => (envFilter === 'all' ? true : d.env === envFilter));

  return (
    <div className="dh-stack">
      <NeoBanners>
        <NeoBanner
          tone={live.freezeState.blocking ? 'danger' : live.freezeState.advisory ? 'warning' : 'success'}
          icon={live.freezeState.blocking ? <Lock /> : <AlertTriangle />}
          title={
            live.freezeState.blocking
              ? 'Production Deploys Frozen'
              : live.freezeState.advisory
                ? 'Active SEV2 Incident · Production Caution Advised'
                : 'Production Release Window Open'
          }
          meta={live.freezeState.incident?.code ?? 'All regions'}
          action={
            caps.canFreeze ? (
              <button
                type="button"
                className={live.freezeState.frozen ? 'neo-btn neo-btn--success neo-btn--xs' : 'neo-btn neo-btn--danger neo-btn--xs'}
                onClick={() =>
                  setDeployFreeze({
                    frozen: !live.freezeState.frozen,
                    reason: freezeInput,
                    actorId: userId,
                  })
                }
              >
                {live.freezeState.frozen ? <Unlock /> : <Lock />}
                <span>{live.freezeState.frozen ? 'Lift Freeze' : 'Freeze Deploys'}</span>
              </button>
            ) : undefined
          }
        >
          {live.freezeState.reason || 'Rollbacks remain permitted at all times even when production deploys are frozen.'}
        </NeoBanner>
      </NeoBanners>

      {/* Canary Command & Health Gates */}
      {activeCanary && (
        <div className="dh-grid-canary">
          <NeoPanel
            hud={`Canary Progressive Delivery · ${activeCanary.region}`}
            title={`${activeCanary.service} ${activeCanary.version}`}
            icon={<Rocket />}
            actions={
              <div className="dh-inline-actions">
                <Chip
                  tone={
                    activeCanary.status === 'rolled_back' || activeCanary.status === 'failed'
                      ? 'danger'
                      : activeCanary.canary?.autoPaused
                        ? 'warning'
                        : 'success'
                  }
                >
                  <span>
                    {activeCanary.status === 'in_progress'
                      ? activeCanary.canary?.paused
                        ? 'Canary Held'
                        : 'Rolling Out'
                      : activeCanary.status.replace('_', ' ')}
                  </span>
                </Chip>
                <Link to="/cloud/observability" className="neo-btn neo-btn--ghost neo-btn--xs">
                  <Cloud />
                  <span>Cloud Metrics</span>
                </Link>
              </div>
            }
          >
            <NeoTracker
              bare
              hud="5-Stage Canary Traffic Progression"
              steps={CANARY_STEPS.map((pct, idx) => ({
                id: `c-${pct}`,
                label: `${pct}% Traffic`,
                sub: idx === 0 ? 'Smoke' : idx === 2 ? 'Regional gate' : idx === 4 ? 'Full GA' : 'Soak',
              }))}
              current={activeCanary.status === 'success' ? 5 : currentStepIdx}
              state={
                activeCanary.status === 'success'
                  ? 'done'
                  : activeCanary.status === 'failed'
                    ? 'blocked'
                    : activeCanary.canary?.autoPaused
                      ? 'blocked'
                      : activeCanary.canary?.paused
                        ? 'paused'
                        : 'active'
              }
              eta={`Recommendation: ${decision.toUpperCase()}`}
            />

            {/* Interactive Canary Dial */}
            <div className="dh-canary-dial">
              <div className="dh-canary-dial__ring">
                <Ring
                  value={currentTrafficPct / 100}
                  size={84}
                  stroke={8}
                  color={verdict === 'fail' ? 'var(--danger)' : verdict === 'warn' ? 'var(--warning)' : undefined}
                >
                  <span className="neo-mono">{`${currentTrafficPct}%`}</span>
                </Ring>
                <div className="dh-canary-dial__info">
                  <div className="neo-hud">Interactive Canary Dial</div>
                  <div className="dh-canary-dial__verdict">
                    <span>Gate verdict: </span>
                    <strong data-tone={verdict}>{verdict.toUpperCase()}</strong>
                    {rbTarget && (
                      <span className="neo-mono">{` · Baseline ${rbTarget.version}`}</span>
                    )}
                  </div>
                  <div className="dh-canary-dial__steps" role="group" aria-label="Set canary traffic percentage">
                    {CANARY_STEPS.map((pct, idx) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={!caps.canDeploy || activeCanary.status !== 'in_progress'}
                        className="neo-chip"
                        data-tone={currentStepIdx === idx ? 'app' : 'slate'}
                        onClick={() => setCanaryTraffic(activeCanary.id, idx, userId)}
                      >
                        <span className="neo-mono">{`${pct}%`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dh-canary-dial__actions">
                {caps.canDeploy && activeCanary.status === 'in_progress' && (
                  <>
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => promoteCanary(activeCanary.id, userId)}
                    >
                      <FastForward />
                      <span>Promote Step</span>
                    </button>
                    {verdict === 'warn' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--sm"
                        onClick={() =>
                          promoteCanary(activeCanary.id, userId, {
                            override: true,
                            note: 'Manual override by SRE',
                          })
                        }
                      >
                        <span>Override Gate & Promote</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--sm"
                      onClick={() => toggleCanaryPause(activeCanary.id, userId)}
                    >
                      {activeCanary.canary?.paused ? <Play /> : <Pause />}
                      <span>{activeCanary.canary?.paused ? 'Resume Canary' : 'Pause Canary'}</span>
                    </button>
                  </>
                )}

                {caps.canDeploy && !activeCanary.rolledBackBy && activeCanary.status !== 'rolled_back' && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--danger neo-btn--sm"
                    onClick={() => rollback(activeCanary.id, userId)}
                    data-qa="devhub-rollback-btn"
                  >
                    <RotateCcw />
                    <span>{`1-Click Rollback (${rbTarget?.version ?? 'v2.40.3'})`}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() =>
                    void declareIncidentFromDevhub({
                      title: `${activeCanary.service} ${activeCanary.version} canary regression in ${activeCanary.region}`,
                      severity: 'SEV2',
                      services: [activeCanary.service],
                      summary: `p95 latency at ${canaryHealth.latencyMs}ms during ${currentTrafficPct}% canary rollout.`,
                      to: `/devhub/deploys?deploy=${activeCanary.id}`,
                    })
                  }
                >
                  <Flame />
                  <span>Escalate to Incident Command</span>
                </button>

                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() =>
                    void shareToPulseChat({
                      title: `${activeCanary.service} ${activeCanary.version} (${activeCanary.region})`,
                      subtitle: `Canary at ${currentTrafficPct}% · Gate ${verdict.toUpperCase()}`,
                      to: `/devhub/deploys?deploy=${activeCanary.id}`,
                      status: activeCanary.status.toUpperCase(),
                      text: `Canary update for ${activeCanary.service} ${activeCanary.version} in ${activeCanary.region}: ${currentTrafficPct}% traffic.`,
                    })
                  }
                >
                  <MessagesSquare />
                  <span>Post to Chat</span>
                </button>
              </div>
            </div>
          </NeoPanel>

          {/* Automated Health Gates */}
          <NeoPanel
            hud="Automated Canary Analysis (ACA)"
            title="Live SLO Health Gates"
            icon={<Sliders />}
          >
            <div className="dh-gates-list">
              {gates.map((g) => (
                <div key={g.metric} className="dh-gate-card" data-status={g.status}>
                  <div className="dh-gate-card__top">
                    <span className="dh-gate-card__name">
                      {g.metric === 'latency'
                        ? 'p95 Latency'
                        : g.metric === 'errors'
                          ? '5xx Error Rate'
                          : 'CPU / Pod Saturation'}
                    </span>
                    <Chip
                      tone={g.status === 'pass' ? 'success' : g.status === 'warn' ? 'warning' : 'danger'}
                      size="sm"
                    >
                      <span>{g.status.toUpperCase()}</span>
                    </Chip>
                  </div>
                  <div className="dh-gate-card__vals neo-mono">
                    <strong>
                      {g.metric === 'latency'
                        ? `${g.value}ms`
                        : `${(g.value * 100).toFixed(2)}%`}
                    </strong>
                    <span>
                      {g.metric === 'latency'
                        ? `Baseline ${g.baseline}ms · SLO ${g.failAt}ms`
                        : `Baseline ${(g.baseline * 100).toFixed(1)}% · Fail ${(g.failAt * 100).toFixed(0)}%`}
                    </span>
                  </div>
                  <Bar
                    value={Math.min(1, g.value / g.failAt)}
                    fill={
                      g.status === 'fail'
                        ? 'var(--danger)'
                        : g.status === 'warn'
                          ? 'var(--warning)'
                          : 'var(--success)'
                    }
                  />
                </div>
              ))}
            </div>
            <div className="dh-canary-sparks">
              <div>
                <span className="neo-hud">Latency trend (p95 ms)</span>
                <Spark data={series.latency} width={160} height={38} color="var(--warning)" />
              </div>
              <div>
                <span className="neo-hud">Error rate trend</span>
                <Spark data={series.errors.map((x) => x * 1000)} width={160} height={38} color="var(--danger)" />
              </div>
            </div>
          </NeoPanel>
        </div>
      )}

      {/* Multi-Region Fleet Matrix */}
      <NeoPanel
        hud="Global Fleet Topology"
        title="Multi-Region Production Matrix"
        icon={<Globe />}
      >
        <div className="dh-region-grid">
          {REGIONS.map((reg) => {
            const meta = REGION_META[reg];
            const readings = health.filter((h) => h.region === reg);
            const degraded = readings.find((r) => r.status !== 'healthy');
            return (
              <div key={reg} className="dh-region-card neo-spot" data-status={degraded ? 'degraded' : 'healthy'}>
                <div className="dh-region-card__head">
                  <span className="dh-region-card__flag">{meta.flag}</span>
                  <div>
                    <div className="dh-region-card__city">{meta.city}</div>
                    <div className="neo-mono dh-region-card__id">{reg}</div>
                  </div>
                  <Orb tone={degraded ? 'warning' : 'success'} pulse={!!degraded} />
                </div>
                <div className="dh-region-card__rows">
                  {readings.slice(0, 5).map((r) => (
                    <div key={`${r.service}-${r.region}`} className="dh-region-card__row">
                      <span className="neo-mono">{r.service}</span>
                      <span className="neo-mono" data-status={r.status}>
                        {`${r.latencyMs}ms`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      <div className="dh-grid-2">
        {/* Feature Flags */}
        <NeoPanel
          hud="Runtime Feature Flags"
          title="Progressive Feature Rollouts"
          icon={<Flag />}
        >
          <div className="dh-list">
            {flags.map((fl) => (
              <div key={fl.key} className="dh-flag-row">
                <div className="dh-flag-row__main">
                  <div className="dh-pr-row__top">
                    <span className="neo-mono dh-pr-row__title">{fl.key}</span>
                    <Chip tone="slate" size="sm">
                      <span className="neo-mono">{fl.service}</span>
                    </Chip>
                  </div>
                  <p className="dh-flag-row__desc">{fl.description}</p>
                  <div className="dh-flag-row__envs">
                    {(['preview', 'staging', 'production'] as EnvId[]).map((env) => (
                      <button
                        key={env}
                        type="button"
                        className="neo-chip neo-chip--sm"
                        data-tone={fl.enabled[env] ? (env === 'production' ? 'app' : 'success') : 'slate'}
                        onClick={() => caps.canManageCatalog && toggleFlag(fl.key, env, userId)}
                      >
                        <span>{env}</span>
                        <span className="neo-mono">{`${fl.rollout[env]}%`}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {caps.canManageCatalog && (
                  <div className="dh-flag-row__slider">
                    <span className="neo-hud">Prod %</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={25}
                      value={fl.rollout.production}
                      aria-label={`${fl.key} production rollout percentage`}
                      onChange={(e) => setFlagRollout(fl.key, 'production', Number(e.target.value), userId)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </NeoPanel>

        {/* Release History & Change Windows */}
        <NeoPanel
          hud="Audit & Change Windows"
          title="Recent Deploys & Release Calendar"
          icon={<CheckCircle2 />}
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              onClick={() =>
                void scheduleWindowInCalendar({
                  title: windows[0]?.title ?? 'EU Release Window',
                  note: windows[0]?.note ?? 'Progressive canary rollout',
                  services: windows[0]?.services ?? ['payments-svc'],
                })
              }
            >
              <CalendarPlus />
              <span>Sync to Calendar</span>
            </button>
          }
        >
          <NeoTabs<'all' | EnvId>
            label="Filter deployments by environment"
            value={envFilter}
            onChange={setEnvFilter}
            items={[
              { value: 'all', label: 'All envs' },
              { value: 'production', label: 'Production' },
              { value: 'staging', label: 'Staging' },
            ]}
          />
          <div className="dh-list">
            {filteredDeploys.slice(0, 7).map((d) => (
              <div key={d.id} className="dh-pr-row">
                <div className="dh-pr-row__main">
                  <div className="dh-pr-row__top">
                    <Orb
                      tone={
                        d.status === 'success'
                          ? 'success'
                          : d.status === 'in_progress'
                            ? 'warning'
                            : d.status === 'rolled_back'
                              ? 'violet'
                              : 'danger'
                      }
                      size={7}
                    />
                    <span className="neo-mono dh-pr-row__title">{`${d.service} ${d.version}`}</span>
                    <Chip tone="slate" size="sm">
                      <span>{d.env}</span>
                    </Chip>
                    <span className="neo-mono">{d.region}</span>
                  </div>
                  <div className="dh-pr-row__meta">
                    <UserPill userId={d.authorId} size={16} />
                    <span>·</span>
                    <RelTime at={d.at} now={now} />
                    {d.prId && (
                      <>
                        <span>·</span>
                        <Link to={`/devhub/reviews?pr=${d.prId}`} className="neo-mono">
                          {`#${d.prNumber ?? d.prId}`}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <div className="dh-pr-row__actions">
                  {d.canary && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() => {
                        const next = new URLSearchParams(params);
                        next.set('deploy', d.id);
                        setParams(next, { replace: true });
                      }}
                    >
                      <span>Inspect</span>
                      <ArrowUpRight />
                    </button>
                  )}
                  {caps.canDeploy && d.env === 'production' && d.status !== 'rolled_back' && !d.rolledBackBy && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--danger neo-btn--xs"
                      onClick={() => rollback(d.id, userId)}
                    >
                      <RotateCcw />
                      <span>Rollback</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {caps.canFreeze && (
            <div className="dh-freeze-box">
              <input
                type="text"
                className="neo-input neo-input--sm"
                value={freezeInput}
                onChange={(e) => setFreezeInput(e.target.value)}
                placeholder="Reason for deploy freeze…"
                aria-label="Reason for deploy freeze"
              />
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--xs"
                onClick={() =>
                  setDeployFreeze({
                    frozen: !live.freezeState.frozen,
                    reason: freezeInput,
                    actorId: userId,
                  })
                }
              >
                {live.freezeState.frozen ? <Unlock /> : <Lock />}
                <span>{live.freezeState.frozen ? 'Unfreeze' : 'Set Freeze'}</span>
              </button>
            </div>
          )}
        </NeoPanel>
      </div>
    </div>
  );
}
