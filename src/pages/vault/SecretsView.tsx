/**
 * Aegis Vault — Service Secrets, Dynamic DB Leases & 5-Stage Rotation (`/vault/secrets`)
 */
import { useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Database,
  Lock,
  RefreshCw,
  RotateCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTabs,
  NeoTracker,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import {
  DAY,
  evaluateSecretStatus,
  MINUTE,
  ROTATION_STAGE_STEPS,
} from '@/vault/engine';
import { useVault } from '@/vault/store';
import type { ServiceEnvironment } from '@/vault/types';

type EnvFilter = 'all' | ServiceEnvironment;

export function SecretsView() {
  const now = useNow(10_000);
  const secrets = useVault((s) => s.secrets);
  const triggerSecretRotation = useVault((s) => s.triggerSecretRotation);
  const completeSecretRotation = useVault((s) => s.completeSecretRotation);
  const renewDynamicDbLease = useVault((s) => s.renewDynamicDbLease);
  const reportSecretExposureToSoc = useVault((s) => s.reportSecretExposureToSoc);

  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');

  const filtered = secrets.filter((s) => envFilter === 'all' || s.env === envFilter);
  const exposedSecrets = secrets.filter((s) => evaluateSecretStatus(s, now) === 'exposed');
  const overdueOrRotating = secrets.filter((s) => {
    const st = evaluateSecretStatus(s, now);
    return st === 'overdue' || st === 'expiring_soon' || st === 'rotating';
  });
  const totalActiveDbLeases = secrets.reduce(
    (sum, s) => sum + (s.dynamicDb?.activeLeases ?? 0),
    0,
  );

  const copyRef = (path: string) => {
    try {
      navigator.clipboard?.writeText(path);
    } catch {
      // ignore
    }
    toast.success('Vault URI copied', path);
  };

  return (
    <div className="vault-stack">
      {exposedSecrets.length > 0 && (
        <NeoBanners>
          {exposedSecrets.map((sec) => (
            <NeoBanner
              key={sec.id}
              tone="rose"
              icon={<ShieldAlert size={16} />}
              title={`Push Protection Alert · ${sec.service} (${sec.keyName})`}
              meta={sec.exposedInRepo?.repo}
              action={
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => reportSecretExposureToSoc(sec.id)}
                  >
                    <AlertTriangle size={12} />
                    <span>Escalate to Bastion SOC</span>
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => completeSecretRotation(sec.id)}
                  >
                    <RotateCw size={12} />
                    <span>Zero-Downtime Rotate</span>
                  </button>
                </div>
              }
            >
              Detected in commit <code className="neo-mono">{sec.exposedInRepo?.commit}</code>
            </NeoBanner>
          ))}
        </NeoBanners>
      )}

      <NeoKpis label="Service Secrets & Lease Telemetry">
        <NeoKpi
          label="Managed Secrets"
          value={secrets.length}
          sub="KMS envelope-encrypted keys"
          icon={<Lock size={14} />}
          tone="amber"
        />
        <NeoKpi
          label="Dynamic DB Leases"
          value={totalActiveDbLeases}
          sub="Ephemeral Postgres, Redis & ClickHouse"
          icon={<Database size={14} />}
          tone="cyan"
        />
        <NeoKpi
          label="Rotation Attention"
          value={overdueOrRotating.length + exposedSecrets.length}
          sub="Overdue, expiring, or in-flight"
          icon={<RotateCw size={14} />}
          tone={overdueOrRotating.length + exposedSecrets.length > 0 ? 'rose' : 'emerald'}
        />
        <NeoKpi
          label="Zero-Downtime SLA"
          value="100%"
          sub="Canary KMS hot-reload verified"
          icon={<ShieldCheck size={14} />}
          tone="emerald"
        />
      </NeoKpis>

      <div className="vault-filter-bar">
        <NeoTabs
          value={envFilter}
          onChange={setEnvFilter}
          items={[
            { value: 'all', label: 'All environments', count: secrets.length },
            {
              value: 'production',
              label: 'Production',
              count: secrets.filter((s) => s.env === 'production').length,
            },
            {
              value: 'staging',
              label: 'Staging',
              count: secrets.filter((s) => s.env === 'staging').length,
            },
            {
              value: 'development',
              label: 'Development',
              count: secrets.filter((s) => s.env === 'development').length,
            },
          ]}
          label="Environment filter"
        />
      </div>

      <NeoPanel
        hud="KMS Envelope & Dynamic Leases"
        title="Service Secrets & 5-Stage Rotation Schedules"
        icon={<Server size={16} />}
      >
        <div className="vault-stack">
          {filtered.map((sec) => {
            const st = evaluateSecretStatus(sec, now);
            const daysLeft = Math.round((sec.nextRotationAt - now) / DAY);
            const dbMinsLeft = sec.dynamicDb
              ? Math.max(1, Math.round((sec.dynamicDb.leaseExpiresAt - now) / MINUTE))
              : null;

            return (
              <article key={sec.id} className="vault-secret-card neo-spot">
                <div className="vault-secret-card__head">
                  <div>
                    <div className="vault-secret-card__badges">
                      <Chip
                        tone={sec.env === 'production' ? 'amber' : 'cyan'}
                        size="sm"
                      >
                        {sec.env}
                      </Chip>
                      <Chip tone="slate" size="sm" icon={<Server size={12} />}>
                        <span data-no-translate>{sec.service}</span>
                      </Chip>
                      <Chip
                        tone={
                          st === 'healthy'
                            ? 'emerald'
                            : st === 'rotating'
                              ? 'cyan'
                              : st === 'expiring_soon'
                                ? 'amber'
                                : 'rose'
                        }
                        size="sm"
                      >
                        {st === 'healthy'
                          ? 'Healthy SLA'
                          : st === 'rotating'
                            ? 'Rotating In-Flight'
                            : st === 'expiring_soon'
                              ? 'Expiring Soon'
                              : st === 'overdue'
                                ? 'Rotation Overdue'
                                : 'Exposed in Repo'}
                      </Chip>
                      <span className="neo-mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                        v{sec.version}
                      </span>
                    </div>

                    <h3 className="vault-secret-card__title" data-no-translate>
                      {sec.keyName}
                    </h3>

                    <div className="vault-secret-card__uri-row">
                      <code className="neo-mono" data-no-translate>
                        {sec.path}
                      </code>
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => copyRef(sec.path)}
                      >
                        <Copy size={12} />
                        <span>Copy URI</span>
                      </button>
                    </div>
                  </div>

                  <div className="vault-secret-card__actions">
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => triggerSecretRotation(sec.id)}
                    >
                      <RefreshCw size={13} />
                      <span>Step Rotation</span>
                    </button>
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => completeSecretRotation(sec.id)}
                    >
                      <Zap size={13} />
                      <span>Rotate Now</span>
                    </button>
                  </div>
                </div>

                {sec.dynamicDb && (
                  <div className="vault-db-strip">
                    <div className="vault-db-strip__info">
                      <Database size={14} />
                      <span>Dynamic DB Engine:</span>
                      <b className="neo-mono" data-no-translate>
                        {sec.dynamicDb.engine.toUpperCase()}
                      </b>
                      <span>· Active Leases:</span>
                      <b className="neo-mono">{sec.dynamicDb.activeLeases}</b>
                      <span>· Principal:</span>
                      <code className="neo-mono" data-no-translate>
                        {sec.dynamicDb.lastLeaseUser}
                      </code>
                      <span>· TTL:</span>
                      <b className="neo-mono" data-no-translate>
                        {dbMinsLeft}m
                      </b>
                    </div>
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--xs"
                      onClick={() => renewDynamicDbLease(sec.id)}
                    >
                      <RefreshCw size={12} />
                      <span>Renew DB Lease</span>
                    </button>
                  </div>
                )}

                <NeoTracker
                  bare
                  hud="5-Stage Zero-Downtime Secret Rotation"
                  title={
                    <span data-no-translate>
                      {sec.service} · {sec.maskedPreview}
                    </span>
                  }
                  eta={
                    daysLeft >= 0 ? (
                      <span data-no-translate>Next in {daysLeft}d</span>
                    ) : (
                      <span data-no-translate>Overdue {Math.abs(daysLeft)}d</span>
                    )
                  }
                  steps={ROTATION_STAGE_STEPS.map((label) => ({ label }))}
                  current={sec.rotationStage}
                  state={
                    st === 'exposed'
                      ? 'blocked'
                      : sec.rotationStage >= 5
                        ? 'done'
                        : 'active'
                  }
                  message={
                    sec.exposedInRepo
                      ? `Push-protection hit in ${sec.exposedInRepo.repo}${sec.exposedInRepo.reportedCaseId ? ` · Escalated (${sec.exposedInRepo.reportedCaseId})` : ''}`
                      : `Consumed by: ${sec.usedBy.join(', ')}`
                  }
                />
              </article>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
