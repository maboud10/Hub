/**
 * Aegis Vault — TLS / mTLS Certificate Lifecycle & ACME PKI Tracker (`/vault/certs`)
 */
import {
  Award,
  CheckCircle2,
  Globe,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTracker,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { CERT_STAGE_STEPS, DAY } from '@/vault/engine';
import { useVault } from '@/vault/store';

export function CertificatesView() {
  const now = useNow(30_000);
  const certificates = useVault((s) => s.certificates);
  const toggleCertAutoRenew = useVault((s) => s.toggleCertAutoRenew);
  const advanceCertRenewal = useVault((s) => s.advanceCertRenewal);

  const mtlsCount = certificates.filter((c) => c.mtlsEnabled).length;
  const autoRenewCount = certificates.filter((c) => c.autoRenew).length;
  const expiringOrRenewing = certificates.filter((c) => c.status !== 'valid').length;

  return (
    <div className="vault-stack">
      <NeoKpis label="TLS & SPIFFE mTLS Telemetry">
        <NeoKpi
          label="TLS Inventory"
          value={certificates.length}
          sub="Edge & internal service mesh"
          icon={<Award size={14} />}
          tone="amber"
        />
        <NeoKpi
          label="SPIFFE mTLS Mesh"
          value={mtlsCount}
          sub="Envoy SDS zero-downtime reload"
          icon={<Lock size={14} />}
          tone="emerald"
        />
        <NeoKpi
          label="ACME Auto-Renew"
          value={`${autoRenewCount}/${certificates.length}`}
          sub="DNS-01 Route53 automation"
          icon={<RefreshCw size={14} />}
          tone="cyan"
        />
        <NeoKpi
          label="Renewal Queue"
          value={expiringOrRenewing}
          sub="Expiring within 14d or mid-flight"
          icon={<ShieldCheck size={14} />}
          tone={expiringOrRenewing > 0 ? 'amber' : 'emerald'}
        />
      </NeoKpis>

      <NeoPanel
        hud="PKI & ACME Automation"
        title="TLS & Internal Mesh Certificates"
        icon={<Globe size={16} />}
      >
        <div className="vault-stack">
          {certificates.map((cert) => {
            const daysRemaining = Math.max(0, Math.round((cert.expiresAt - now) / DAY));
            const lifeProgress = Math.max(0.06, Math.min(1, daysRemaining / 90));
            const barColor =
              daysRemaining <= 10
                ? 'var(--danger)'
                : daysRemaining <= 25
                  ? 'var(--warning)'
                  : 'var(--success)';

            return (
              <article key={cert.id} className="vault-secret-card neo-spot">
                <div className="vault-secret-card__head">
                  <div>
                    <div className="vault-secret-card__badges">
                      <Chip
                        tone={
                          cert.status === 'valid'
                            ? 'emerald'
                            : cert.status === 'renewing'
                              ? 'cyan'
                              : 'amber'
                        }
                        size="sm"
                      >
                        {cert.status === 'valid'
                          ? 'Valid & Deployed'
                          : cert.status === 'renewing'
                            ? 'ACME Renewing'
                            : 'Expiring Soon'}
                      </Chip>
                      <Chip tone="amber" size="sm">
                        <span data-no-translate>{cert.algorithm}</span>
                      </Chip>
                      {cert.mtlsEnabled && (
                        <Chip tone="violet" size="sm" icon={<Lock size={11} />}>
                          SPIFFE mTLS
                        </Chip>
                      )}
                    </div>

                    <h3 className="vault-secret-card__title" data-no-translate>
                      {cert.domain}
                    </h3>
                    <div className="vault-item-row__sub" data-no-translate>
                      {cert.issuer} · Serial {cert.serialHex}
                    </div>
                  </div>

                  <div className="vault-secret-card__actions">
                    <button
                      type="button"
                      className={`neo-btn neo-btn--xs ${cert.autoRenew ? 'neo-btn--soft' : 'neo-btn--ghost'}`}
                      onClick={() => toggleCertAutoRenew(cert.id)}
                    >
                      <CheckCircle2 size={12} />
                      <span>{cert.autoRenew ? 'Auto-Renew ON' : 'Auto-Renew OFF'}</span>
                    </button>
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => advanceCertRenewal(cert.id)}
                    >
                      <RefreshCw size={13} />
                      <span>{cert.stageIndex >= 4 ? 'Trigger Renewal' : 'Advance Stage'}</span>
                    </button>
                  </div>
                </div>

                <div className="vault-cert-timeline">
                  <div className="vault-cert-timeline__row">
                    <span className="neo-hud">90-Day Validity Horizon</span>
                    <b className="neo-mono" data-no-translate>
                      {daysRemaining}d remaining
                    </b>
                  </div>
                  <Bar value={lifeProgress} height={6} fill={barColor} label="Certificate validity remaining" />
                  <div className="vault-cert-timeline__meta">
                    <span className="neo-mono" data-no-translate>
                      SHA-256: {cert.fingerprintSha256}
                    </span>
                    <span data-no-translate>SANs: {cert.sanDomains.join(', ')}</span>
                  </div>
                </div>

                <NeoTracker
                  bare
                  hud="ACME DNS-01 & Envoy SDS Lifecycle"
                  title={
                    <span data-no-translate>
                      {cert.domain} → {cert.services.join(', ')}
                    </span>
                  }
                  steps={CERT_STAGE_STEPS.map((label) => ({ label }))}
                  current={cert.stageIndex}
                  state={cert.stageIndex >= 4 ? 'done' : 'active'}
                />
              </article>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
