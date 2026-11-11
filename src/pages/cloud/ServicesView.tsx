/**
 * Stratos · Cloud Console — Services & SLOs view.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Activity,
  GitBranch,
  KeyRound,
  Network,
  RotateCcw,
  Server,
  Siren,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  Spark,
  type NeoTabItem,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useCloudCapabilities } from '@/cloud/access';
import {
  allServicesTelemetry,
  isStoryDegraded,
  serviceSloSummary,
  serviceTelemetry,
} from '@/cloud/engine';
import { SERVICE_BY_ID, TEAMS, TEAM_BY_ID, TOPO_NODES } from '@/cloud/seed';
import { useCloud } from '@/cloud/store';
import type { ServiceId, TeamId } from '@/cloud/types';
import { RegionBadge, SloBurnChart, StatusChip, TierChip } from './parts';

export function ServicesView() {
  const [params, setParams] = useSearchParams();
  const caps = useCloudCapabilities();
  const data = useCloud();
  const users = useHub((s) => s.users);

  const [teamFilter, setTeamFilter] = useState<'all' | TeamId>('all');
  const [query, setQuery] = useState('');
  const paramSvc = params.get('service') as ServiceId | null;
  const [selectedId, setSelectedId] = useState<ServiceId>(
    paramSvc && SERVICE_BY_ID[paramSvc] ? paramSvc : 'payments-svc',
  );

  useEffect(() => {
    if (paramSvc && SERVICE_BY_ID[paramSvc]) {
      setSelectedId(paramSvc);
    }
  }, [paramSvc]);

  const selectService = (id: ServiceId) => {
    setSelectedId(id);
    const next = new URLSearchParams(params);
    next.set('service', id);
    setParams(next, { replace: true });
  };

  const allTel = allServicesTelemetry(data.story);
  const filtered = allTel.filter((t) => {
    if (teamFilter !== 'all' && t.service.team !== teamFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = `${t.service.id} ${t.service.name} ${t.service.runtime} ${t.service.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeTel = serviceTelemetry(selectedId, data.story);
  const activeSlo = serviceSloSummary(selectedId, data.story);
  const svc = activeTel.service;
  const owner = users.find((u) => u.id === svc.ownerId);
  const onCall = users.find((u) => u.id === svc.onCallId);
  const degraded = isStoryDegraded(data.story);

  const teamTabs: NeoTabItem<'all' | TeamId>[] = [
    { value: 'all', label: 'All teams', count: allTel.length },
    ...TEAMS.map((t) => ({
      value: t.id,
      label: t.name,
      count: allTel.filter((x) => x.service.team === t.id).length,
    })),
  ];

  const activeNodes = new Set<string>(['edge', 'hub-web', svc.id, ...svc.deps]);

  return (
    <div className="cloud-services">
      <div className="cloud-toolbar-row">
        <NeoTabs
          value={teamFilter}
          onChange={setTeamFilter}
          items={teamTabs}
          label="Filter services by team"
        />
        <NeoSearch
          value={query}
          onChange={setQuery}
          placeholder="Search services, runtimes, or repositories…"
          className="cloud-toolbar-search"
        />
      </div>

      <div className="cloud-services__layout">
        {/* Left: Service catalog cards */}
        <div className="cloud-services__list" role="listbox" aria-label="Production services">
          {filtered.map((t) => {
            const slo = serviceSloSummary(t.service.id, data.story);
            const isSelected = t.service.id === selectedId;
            return (
              <button
                key={t.service.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`cloud-svc-card neo-spot ${isSelected ? 'is-selected' : ''}`}
                onClick={() => selectService(t.service.id)}
                data-qa={`svc-card-${t.service.id}`}
              >
                <div className="cloud-svc-card__top">
                  <div className="cloud-svc-card__titles">
                    <span className="cloud-svc-card__name">{t.service.name}</span>
                    <span className="cloud-svc-card__id neo-mono" data-no-translate="true">
                      {t.service.id}
                    </span>
                  </div>
                  <StatusChip status={t.status} />
                </div>

                <div className="cloud-svc-card__meta">
                  <TierChip tier={t.service.tier} />
                  <span>{TEAM_BY_ID[t.service.team].name}</span>
                  <span>·</span>
                  <span className="neo-mono" data-no-translate="true">
                    {t.service.runtime}
                  </span>
                </div>

                <div className="cloud-svc-card__metrics">
                  <div>
                    <span className="neo-hud">p95 latency</span>
                    <strong className="neo-mono" data-no-translate="true">
                      {t.p95}ms
                    </strong>
                  </div>
                  <div>
                    <span className="neo-hud">Error rate</span>
                    <strong className="neo-mono" data-no-translate="true">
                      {(t.errorRate * 100).toFixed(2)}%
                    </strong>
                  </div>
                  <div>
                    <span className="neo-hud">1h burn</span>
                    <strong
                      className={`neo-mono ${slo.fastBurn ? 'cloud-text-warn' : ''}`}
                      data-no-translate="true"
                    >
                      {slo.burnRate1h}×
                    </strong>
                  </div>
                  <Spark
                    data={t.series.p95}
                    width={88}
                    height={28}
                    color={t.status === 'degraded' ? '#f59e0b' : '#38bdf8'}
                  />
                </div>

                <div className="cloud-svc-card__budget">
                  <div className="cloud-svc-card__budget-row">
                    <span>SLO {(t.service.slo.target * 100).toFixed(2)}%</span>
                    <span className="neo-mono" data-no-translate="true">
                      {Math.round(slo.remainingFraction * 100)}% budget left
                    </span>
                  </div>
                  <Bar
                    value={slo.remainingFraction}
                    fill={slo.fastBurn ? 'var(--warning)' : 'var(--app-c1)'}
                    height={5}
                    label={`${t.service.name} error budget remaining`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Deep-dive SLO & topology inspector */}
        <div className="cloud-services__detail">
          <NeoPanel
            hud={`${TEAM_BY_ID[svc.team].name} · ${svc.repo}`}
            title={`${svc.name} (${svc.id})`}
            icon={<Server />}
            actions={
              <div className="cloud-panel-actions">
                <Link to="/devhub/deploys" className="neo-btn neo-btn--xs neo-btn--soft">
                  <GitBranch />
                  <span className="neo-mono" data-no-translate="true">
                    {svc.lastDeploy.version}
                  </span>
                </Link>
                {svc.id === 'payments-svc' && degraded && caps.canManageInfra && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--xs neo-btn--plasma"
                    onClick={() => data.recoverStory()}
                  >
                    <RotateCcw />
                    <span>Roll back v2.41.0</span>
                  </button>
                )}
                {caps.canDeclareIncident && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--xs neo-btn--danger"
                    onClick={() =>
                      data.escalateToIncident({
                        title: `SLO burn on ${svc.id} (${activeTel.p95}ms p95)`,
                        severity: svc.tier === 'critical' ? 'SEV2' : 'SEV3',
                        services: [svc.id],
                      })
                    }
                  >
                    <Siren />
                    <span>Declare incident</span>
                  </button>
                )}
              </div>
            }
          >
            <p className="cloud-svc-desc">{svc.description}</p>

            {/* Ownership, On-Call & Vault row */}
            <div className="cloud-owner-strip">
              {owner && (
                <div className="cloud-owner-pill">
                  <Avatar user={owner} size={24} presence />
                  <div>
                    <span className="neo-hud">Service owner</span>
                    <strong>{owner.name}</strong>
                  </div>
                </div>
              )}
              {onCall && (
                <Link to="/incidents/oncall" className="cloud-owner-pill">
                  <Avatar user={onCall} size={24} presence />
                  <div>
                    <span className="neo-hud">On-call responder</span>
                    <strong>{onCall.name}</strong>
                  </div>
                </Link>
              )}
              <button
                type="button"
                className="neo-btn neo-btn--xs neo-btn--soft"
                onClick={() => data.requestVaultLease(`${svc.id}-prod-credentials`)}
              >
                <KeyRound />
                <span>Request JIT lease in Vault</span>
              </button>
            </div>

            {/* 30-day SLO Burn Chart */}
            <SloBurnChart slo={activeSlo} />

            {/* Error budget hit log */}
            <div className="cloud-subhead">
              <Activity />
              <span>Error-budget consumption log (30-day window)</span>
            </div>
            <div className="cloud-hit-list">
              {svc.id === 'payments-svc' && degraded && (
                <div className="cloud-hit-item is-live">
                  <Chip tone="amber" size="sm">
                    Active now
                  </Chip>
                  <span className="cloud-hit-item__label">
                    Deploy v2.41.0 missing ledger_entries index in eu-west-2
                  </span>
                  <span className="neo-mono cloud-text-warn" data-no-translate="true">
                    -36% budget
                  </span>
                </div>
              )}
              {svc.budgetHits.map((h, i) => (
                <div key={i} className="cloud-hit-item">
                  <span className="neo-mono cloud-hit-item__ago" data-no-translate="true">
                    {h.daysAgo}d ago
                  </span>
                  <span className="cloud-hit-item__label">{h.label}</span>
                  <span className="neo-mono" data-no-translate="true">
                    -{Math.round(h.consumed * 100)}% budget
                  </span>
                </div>
              ))}
            </div>

            {/* Per-region telemetry breakdown */}
            <div className="cloud-subhead">
              <Zap />
              <span>Regional endpoints & latency</span>
            </div>
            <div className="cloud-reg-table">
              {svc.regions.map((rId) => {
                const rt = serviceTelemetry(svc.id, data.story, rId);
                return (
                  <div key={rId} className="cloud-reg-row">
                    <RegionBadge regionId={rId} />
                    <StatusChip status={rt.status} />
                    <span className="neo-mono" data-no-translate="true">
                      p95 {rt.p95}ms
                    </span>
                    <span className="neo-mono" data-no-translate="true">
                      {(rt.errorRate * 100).toFixed(2)}% err
                    </span>
                    <span className="neo-mono" data-no-translate="true">
                      {rt.rps.toLocaleString()} rps
                    </span>
                  </div>
                );
              })}
            </div>
          </NeoPanel>

          {/* Service Dependency Topology */}
          <NeoPanel
            hud="Blast radius · Upstream & downstream"
            title="Service Dependency Graph"
            icon={<Network />}
          >
            <svg
              viewBox="0 0 960 440"
              className="cloud-topo-svg"
              role="img"
              aria-label={`Dependency graph for ${svc.name}`}
            >
              {/* Edges from hub-web & selected service */}
              {svc.deps.map((depId) => {
                const from = TOPO_NODES.find((n) => n.id === svc.id);
                const to = TOPO_NODES.find((n) => n.id === depId);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${from.id}-${to.id}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className="cloud-topo-edge is-active"
                  />
                );
              })}

              {TOPO_NODES.map((node) => {
                const isSelected = node.id === svc.id;
                const isInPath = activeNodes.has(node.id);
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className={`cloud-topo-node ${isSelected ? 'is-selected' : ''} ${isInPath ? 'is-active' : 'is-dim'}`}
                    onClick={() => {
                      if (SERVICE_BY_ID[node.id as ServiceId]) {
                        selectService(node.id as ServiceId);
                      }
                    }}
                  >
                    <rect x={-64} y={-18} width={128} height={36} rx={9} />
                    <text x={0} y={4} textAnchor="middle" data-no-translate="true">
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </NeoPanel>
        </div>
      </div>
    </div>
  );
}
