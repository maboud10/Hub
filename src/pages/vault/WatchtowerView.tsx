/**
 * Aegis Vault — Watchtower Hygiene & Tamper-Evident SHA-256 Audit Ledger (`/vault/audit`)
 */
import { useMemo, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Download,
  Hash,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTabs,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import {
  computeVaultHygiene,
  GENESIS_HASH,
  verifyAuditChain,
} from '@/vault/engine';
import { useVault } from '@/vault/store';

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

export function WatchtowerView() {
  const now = useNow(15_000);
  const users = useHub((s) => s.users);
  const items = useVault((s) => s.items);
  const secrets = useVault((s) => s.secrets);
  const certificates = useVault((s) => s.certificates);
  const auditLog = useVault((s) => s.auditLog);
  const rotateItemCredential = useVault((s) => s.rotateItemCredential);
  const completeSecretRotation = useVault((s) => s.completeSecretRotation);
  const rotateAllVulnerableItems = useVault((s) => s.rotateAllVulnerableItems);
  const simulateAuditTamper = useVault((s) => s.simulateAuditTamper);
  const repairAuditChain = useVault((s) => s.repairAuditChain);

  const [sevFilter, setSevFilter] = useState<SeverityFilter>('all');

  const hygiene = useMemo(
    () => computeVaultHygiene(items, secrets, certificates, now, true),
    [items, secrets, certificates, now],
  );

  const chainStatus = useMemo(() => verifyAuditChain(auditLog), [auditLog]);

  const orderedAudit = useMemo(
    () =>
      [...auditLog]
        .sort((a, b) => b.seq - a.seq)
        .filter((e) => sevFilter === 'all' || e.severity === sevFilter),
    [auditLog, sevFilter],
  );

  const exportAuditEvidence = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date(now).toISOString(),
        genesisHash: GENESIS_HASH,
        chainVerification: chainStatus,
        entries: auditLog,
      },
      null,
      2,
    );
    try {
      navigator.clipboard?.writeText(payload);
    } catch {
      // ignore
    }
    toast.success('Compliance evidence exported', `${auditLog.length} SHA-256 chained blocks copied as JSON`);
  };

  return (
    <div className="vault-stack">
      <NeoBanners>
        {chainStatus.valid ? (
          <NeoBanner
            tone="emerald"
            icon={<ShieldCheck size={16} />}
            title={`FIPS 180-4 SHA-256 Hash Chain Verified · ${chainStatus.checkedCount} Blocks Intact`}
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--xs"
                  onClick={simulateAuditTamper}
                >
                  <AlertOctagon size={12} />
                  <span>Simulate 1-Byte Tamper</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--xs"
                  onClick={exportAuditEvidence}
                >
                  <Download size={12} />
                  <span>Export SOC 2 Evidence</span>
                </button>
              </div>
            }
          >
            Head digest <code className="neo-mono">{chainStatus.headHash.slice(0, 20)}…</code> linked to Genesis <code className="neo-mono">00000000…</code>
          </NeoBanner>
        ) : (
          <NeoBanner
            tone="rose"
            icon={<ShieldAlert size={16} />}
            title={`CRYPTOGRAPHIC TAMPER DETECTED at Block #${chainStatus.brokenAtSeq}`}
            action={
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--xs"
                onClick={repairAuditChain}
              >
                <CheckCircle2 size={12} />
                <span>Repair &amp; Re-Seal Chain</span>
              </button>
            }
          >
            Expected SHA-256 <code className="neo-mono">{chainStatus.expectedHash?.slice(0, 16)}…</code> but found <code className="neo-mono">{chainStatus.actualHash?.slice(0, 16)}…</code>
          </NeoBanner>
        )}
      </NeoBanners>

      <NeoKpis label="Watchtower & Cryptographic Audit Telemetry">
        <NeoKpi
          label="Org Hygiene Score"
          value={`${hygiene.score}/100`}
          sub="Credentials, secrets & PKI"
          icon={<ShieldCheck size={14} />}
          tone={hygiene.score >= 85 ? 'emerald' : 'amber'}
        />
        <NeoKpi
          label="Breached / Exposed"
          value={hygiene.exposed}
          sub="k-anonymity SHA-1 & repo scanner"
          icon={<ShieldAlert size={14} />}
          tone={hygiene.exposed > 0 ? 'rose' : 'emerald'}
        />
        <NeoKpi
          label="Reused & Weak"
          value={hygiene.reused + hygiene.weak}
          sub="Ready for 1-click rotation"
          icon={<Wand2 size={14} />}
          tone={hygiene.reused + hygiene.weak > 0 ? 'amber' : 'emerald'}
        />
        <NeoKpi
          label="SHA-256 Blocks"
          value={chainStatus.checkedCount}
          sub={chainStatus.valid ? '100% cryptographically verified' : `Broken at #${chainStatus.brokenAtSeq}`}
          icon={<Hash size={14} />}
          tone={chainStatus.valid ? 'emerald' : 'rose'}
        />
      </NeoKpis>

      <NeoHome
        main={
          <NeoPanel
            hud="Tamper-Evident Cryptographic Ledger"
            title="SHA-256 Hash-Chained Audit Trail"
            icon={<Hash size={16} />}
            actions={
              <NeoTabs
                value={sevFilter}
                onChange={setSevFilter}
                items={[
                  { value: 'all', label: 'All' },
                  { value: 'critical', label: 'Critical' },
                  { value: 'warning', label: 'Warning' },
                  { value: 'info', label: 'Info' },
                ]}
                label="Audit severity filter"
              />
            }
          >
            <div className="vault-stack">
              {orderedAudit.map((entry) => {
                const actor = users.find((u) => u.id === entry.actorId);
                const isBroken = !chainStatus.valid && chainStatus.brokenAtSeq === entry.seq;

                return (
                  <article
                    key={entry.id}
                    className={`vault-audit-row neo-spot ${isBroken ? 'is-tampered' : ''}`}
                  >
                    <div className="vault-audit-row__head">
                      <div className="vault-audit-row__badges">
                        <span className="neo-mono vault-audit-seq">#{entry.seq}</span>
                        <Chip
                          tone={
                            entry.severity === 'critical'
                              ? 'rose'
                              : entry.severity === 'warning'
                                ? 'amber'
                                : 'slate'
                          }
                          size="sm"
                        >
                          {entry.severity}
                        </Chip>
                        <Chip tone="amber" size="sm">
                          <span className="neo-mono" data-no-translate>
                            {entry.action}
                          </span>
                        </Chip>
                        {entry.anomaly && (
                          <Chip tone="rose" size="sm" icon={<ShieldAlert size={11} />}>
                            {entry.anomaly === 'break_glass'
                              ? 'Break-Glass Anomaly'
                              : entry.anomaly === 'off_hours'
                                ? 'Off-Hours Access'
                                : 'Impossible Travel'}
                          </Chip>
                        )}
                      </div>
                      <span className="neo-mono" data-no-translate style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                        {actor?.name ?? entry.actorId} · {entry.location} ({entry.ip})
                      </span>
                    </div>

                    <div className="vault-audit-row__target" data-no-translate>
                      {entry.target}
                    </div>
                    <p className="vault-audit-row__detail" data-no-translate>
                      {entry.detail}
                    </p>

                    <div className="vault-audit-row__foot">
                      <div className="vault-audit-hashes neo-mono" data-no-translate>
                        <span>prev: {entry.prevHash.slice(0, 12)}…</span>
                        <span>→</span>
                        <b>sha256: {entry.hash.slice(0, 16)}…</b>
                      </div>
                      <div className="vault-audit-controls">
                        {entry.controls.map((ctrl) => (
                          <Chip key={ctrl} tone="cyan" size="sm">
                            <span className="neo-mono" data-no-translate>
                              {ctrl}
                            </span>
                          </Chip>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </NeoPanel>
        }
        side={
          <NeoPanel
            hud="Watchtower Remediation Queue"
            title="Active Credential Findings"
            icon={<ShieldAlert size={16} />}
            actions={
              hygiene.findings.length > 0 ? (
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--xs"
                  onClick={() => rotateAllVulnerableItems()}
                >
                  <Wand2 size={12} />
                  <span>Auto-Fix All</span>
                </button>
              ) : undefined
            }
          >
            {hygiene.findings.length === 0 ? (
              <div className="vault-clean-box">
                <ShieldCheck size={28} color="var(--success)" />
                <strong>Zero Active Watchtower Risks</strong>
                <span>All personal credentials and service secrets meet quantum-grade entropy policy.</span>
              </div>
            ) : (
              <div className="vault-stack">
                {hygiene.findings.map((f) => (
                  <div key={f.id} className="vault-finding-card">
                    <div className="vault-finding-card__top">
                      <strong className="vault-finding-card__title" data-no-translate>
                        {f.title}
                      </strong>
                      <Chip
                        tone={
                          f.severity === 'critical'
                            ? 'rose'
                            : f.severity === 'high'
                              ? 'amber'
                              : 'cyan'
                        }
                        size="sm"
                      >
                        {f.risk}
                      </Chip>
                    </div>
                    <p className="vault-finding-card__desc" data-no-translate>
                      {f.remediation}
                    </p>
                    {(f.itemId || f.secretId) && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => {
                          if (f.itemId) rotateItemCredential(f.itemId, undefined, 'nova');
                          if (f.secretId) completeSecretRotation(f.secretId);
                        }}
                      >
                        <RotateCw size={12} />
                        <span>Rotate Now</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </NeoPanel>
        }
      />
    </div>
  );
}
