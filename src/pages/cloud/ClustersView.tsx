/**
 * Stratos · Cloud Console — Clusters & Regions view.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  Globe2,
  KeyRound,
  Lock,
  Plus,
  ShieldAlert,
  Sparkles,
  Tag,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  type NeoTabItem,
} from '@/components/neo';
import { useCloudCapabilities } from '@/cloud/access';
import {
  effectiveResources,
  missingTags,
  resourcesWithDrift,
  rightsizeStepDown,
} from '@/cloud/engine';
import { QUOTAS, REGIONS, REGION_BY_ID, TEAM_BY_ID } from '@/cloud/seed';
import { useCloud } from '@/cloud/store';
import type { RegionId, ResourceKind } from '@/cloud/types';
import { RegionBadge, StratosWorldMap } from './parts';

type KindFilter = 'all' | 'compute' | 'data' | 'storage';

function matchesKindFilter(kind: ResourceKind, f: KindFilter): boolean {
  if (f === 'all') return true;
  if (f === 'compute') return kind === 'k8s' || kind === 'nodepool' || kind === 'namespace' || kind === 'notebook';
  if (f === 'data') return kind === 'postgres' || kind === 'redis' || kind === 'queue';
  return kind === 'bucket' || kind === 'cdn';
}

export function ClustersView() {
  const [params, setParams] = useSearchParams();
  const caps = useCloudCapabilities();
  const data = useCloud();
  const resources = effectiveResources(data);

  const paramRegion = params.get('region') as RegionId | null;
  const [regionFilter, setRegionFilter] = useState<'all' | RegionId>(
    paramRegion && REGION_BY_ID[paramRegion] ? paramRegion : 'all',
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [driftOnly, setDriftOnly] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (paramRegion && REGION_BY_ID[paramRegion]) {
      setRegionFilter(paramRegion);
    }
  }, [paramRegion]);

  const handleSelectRegion = (reg: 'all' | RegionId) => {
    setRegionFilter(reg);
    const next = new URLSearchParams(params);
    if (reg === 'all') next.delete('region');
    else next.set('region', reg);
    setParams(next, { replace: true });
  };

  const regionTabs: NeoTabItem<'all' | RegionId>[] = [
    { value: 'all', label: 'All regions', count: resources.length },
    ...REGIONS.map((r) => ({
      value: r.id,
      label: `${r.name} (${r.code})`,
      count: resources.filter((x) => x.region === r.id).length,
    })),
  ];

  const kindTabs: NeoTabItem<KindFilter>[] = [
    { value: 'all', label: 'All resources' },
    { value: 'compute', label: 'K8s & Compute' },
    { value: 'data', label: 'Databases & Queues' },
    { value: 'storage', label: 'Buckets & CDN' },
  ];

  const filtered = resources.filter((r) => {
    if (regionFilter !== 'all' && r.region !== regionFilter) return false;
    if (!matchesKindFilter(r.kind, kindFilter)) return false;
    if (driftOnly && !(r.drift && r.drift.length > 0)) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = `${r.name} ${r.kind} ${r.region} ${r.size} ${r.detail}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const quotas = QUOTAS.filter((q) => regionFilter === 'all' || q.region === regionFilter);
  const driftCount = resourcesWithDrift(resources).length;

  return (
    <div className="cloud-clusters">
      <NeoPanel
        hud="Multi-region infrastructure · 4 global hubs"
        title="Regional Footprint & Capacity Quotas"
        icon={<Globe2 />}
        actions={
          <div className="cloud-panel-actions">
            <button
              type="button"
              className={`neo-btn neo-btn--xs ${driftOnly ? 'neo-btn--plasma' : 'neo-btn--soft'}`}
              onClick={() => setDriftOnly((v) => !v)}
            >
              <ShieldAlert />
              <span>Terraform drift</span>
              <span className="neo-mono" data-no-translate="true">
                ({driftCount})
              </span>
            </button>
            {caps.canProvision && (
              <Link to="/cloud/provisioning" className="neo-btn neo-btn--xs neo-btn--plasma">
                <Plus />
                <span>Provision resource</span>
              </Link>
            )}
          </div>
        }
      >
        <StratosWorldMap
          selectedRegion={regionFilter}
          onSelectRegion={(r) => handleSelectRegion(r === regionFilter ? 'all' : r)}
          compact
        />

        <div className="cloud-quota-grid">
          {quotas.map((q) => {
            const ratio = q.used / q.limit;
            const warn = ratio >= 0.82;
            return (
              <div key={q.id} className="cloud-quota-card">
                <div className="cloud-quota-card__top">
                  <span className="cloud-quota-card__label">{q.label}</span>
                  <RegionBadge regionId={q.region} />
                </div>
                <div className="cloud-quota-card__nums neo-mono" data-no-translate="true">
                  <strong>
                    {q.used} / {q.limit}
                  </strong>
                  <span>{Math.round(ratio * 100)}%</span>
                </div>
                <Bar
                  value={ratio}
                  fill={warn ? 'var(--warning)' : 'var(--app-c1)'}
                  height={6}
                  label={`${q.label} in ${q.region}`}
                />
              </div>
            );
          })}
        </div>
      </NeoPanel>

      <div className="cloud-toolbar-row">
        <NeoTabs
          value={regionFilter}
          onChange={handleSelectRegion}
          items={regionTabs}
          label="Filter resources by region"
        />
        <NeoTabs
          value={kindFilter}
          onChange={setKindFilter}
          items={kindTabs}
          label="Filter resources by kind"
        />
        <NeoSearch
          value={query}
          onChange={setQuery}
          placeholder="Filter EKS nodepools, Aurora clusters, Redis, S3 buckets…"
          className="cloud-toolbar-search"
        />
      </div>

      <NeoPanel
        hud="Live inventory · Rightsizing · Drift guard"
        title="Cloud Resource Inventory"
        icon={<Database />}
      >
        <div className="cloud-resource-list">
          {filtered.map((res) => {
            const stepDown = rightsizeStepDown(res);
            const missing = missingTags(res);
            const hasDrift = (res.drift?.length ?? 0) > 0;
            return (
              <div key={res.id} className="cloud-res-card" data-qa={`res-card-${res.id}`}>
                <div className="cloud-res-card__main">
                  <div className="cloud-res-card__head">
                    <span className="cloud-res-card__icon">
                      <Cpu />
                    </span>
                    <div>
                      <div className="cloud-res-card__title-row">
                        <strong className="neo-mono" data-no-translate="true">
                          {res.name}
                        </strong>
                        <RegionBadge regionId={res.region} />
                        <Chip tone="slate" size="sm">
                          {TEAM_BY_ID[res.team].name}
                        </Chip>
                        {res.encrypted && (
                          <Chip tone="emerald" size="sm" icon={<Lock />}>
                            KMS encrypted
                          </Chip>
                        )}
                        <Chip tone={res.dataClass.includes('personal') ? 'cyan' : 'slate'} size="sm">
                          {res.dataClass}
                        </Chip>
                      </div>
                      <div className="cloud-res-card__sub">
                        <span className="neo-mono" data-no-translate="true">
                          {res.size}
                        </span>
                        <span> · </span>
                        <span>{res.detail}</span>
                      </div>
                    </div>
                  </div>

                  <div className="cloud-res-card__stats">
                    {res.cpu !== undefined && (
                      <div className="cloud-res-util">
                        <div className="cloud-res-util__top">
                          <span className="neo-hud">p95 CPU</span>
                          <span className="neo-mono" data-no-translate="true">
                            {Math.round(res.cpu * 100)}%
                          </span>
                        </div>
                        <Bar
                          value={res.cpu}
                          fill={res.cpu > 0.75 ? 'var(--warning)' : res.cpu < 0.3 ? 'var(--info, #38bdf8)' : 'var(--success)'}
                          height={5}
                          label={`${res.name} CPU utilization`}
                        />
                      </div>
                    )}
                    {res.mem !== undefined && (
                      <div className="cloud-res-util">
                        <div className="cloud-res-util__top">
                          <span className="neo-hud">Memory</span>
                          <span className="neo-mono" data-no-translate="true">
                            {Math.round(res.mem * 100)}%
                          </span>
                        </div>
                        <Bar value={res.mem} height={5} label={`${res.name} memory utilization`} />
                      </div>
                    )}
                    <div className="cloud-res-cost">
                      <span className="neo-hud">Monthly run rate</span>
                      <strong className="neo-mono" data-no-translate="true">
                        ${res.monthlyUsd.toLocaleString()}/mo
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Guardrails, Drift, Rightsizing & Vault Actions */}
                <div className="cloud-res-card__foot">
                  <div className="cloud-res-card__Notices">
                    {hasDrift &&
                      res.drift!.map((d, idx) => (
                        <div key={idx} className="cloud-drift-pill">
                          <ShieldAlert />
                          <span>Drift:</span>
                          <strong>{d.field}</strong>
                          <span className="neo-mono" data-no-translate="true">
                            (Terraform: {d.code} → Live: {d.live})
                          </span>
                        </div>
                      ))}

                    {missing.length > 0 && (
                      <div className="cloud-drift-pill cloud-drift-pill--warn">
                        <Tag />
                        <span>Missing showback tags:</span>
                        <strong className="neo-mono" data-no-translate="true">
                          {missing.join(', ')}
                        </strong>
                      </div>
                    )}

                    {stepDown && (
                      <div className="cloud-drift-pill cloud-drift-pill--save">
                        <Gauge />
                        <span>Under-utilised · step down to</span>
                        <strong className="neo-mono" data-no-translate="true">
                          {stepDown.nextSize} (-${stepDown.savingsUsd}/mo)
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="cloud-res-card__actions">
                    {stepDown && caps.canManageFinOps && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--plasma"
                        onClick={() => data.rightsizeResource(res.id)}
                        data-qa={`rightsize-${res.id}`}
                      >
                        <Sparkles />
                        <span>Rightsize</span>
                      </button>
                    )}
                    {hasDrift && caps.canManageInfra && (
                      <>
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--soft"
                          onClick={() => data.reconcileDrift(res.id)}
                          data-qa={`reconcile-${res.id}`}
                        >
                          <Wrench />
                          <span>Reconcile drift</span>
                        </button>
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--ghost"
                          onClick={() => data.reportDriftToSecurity(res.id)}
                        >
                          <ShieldAlert />
                          <span>Report to Security</span>
                        </button>
                      </>
                    )}
                    {missing.length > 0 && caps.canManageFinOps && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--soft"
                        onClick={() => data.fixResourceTags(res.id)}
                      >
                        <CheckCircle2 />
                        <span>Fix tags</span>
                      </button>
                    )}
                    {caps.isEngineer && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--ghost"
                        onClick={() => data.requestVaultLease(res.name)}
                      >
                        <KeyRound />
                        <span>Vault lease</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
