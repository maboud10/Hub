/**
 * Aegis Vault — Just-in-Time (JIT) Access & Break-Glass Emergency Override (`/vault/access`)
 * 5-Stage NeoTracker: Requested → Peer/Owner Approved → Dynamic Lease Issued → Active Session → Auto-Revoked & Audited
 */
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Plus,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTracker,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useVaultCapabilities } from '@/vault/access';
import { computeJitRemaining, JIT_STAGE_STEPS } from '@/vault/engine';
import { useVault } from '@/vault/store';
import { useVaultUi } from './parts';

export function JitAccessView() {
  const now = useNow(5_000);
  const users = useHub((s) => s.users);
  const jitRequests = useVault((s) => s.jitRequests);
  const approveJitRequest = useVault((s) => s.approveJitRequest);
  const advanceJitStage = useVault((s) => s.advanceJitStage);
  const revokeJitRequest = useVault((s) => s.revokeJitRequest);

  const caps = useVaultCapabilities();
  const { openJitModal } = useVaultUi();

  const pendingCount = jitRequests.filter((r) => r.status === 'pending').length;
  const activeCount = jitRequests.filter((r) => r.status === 'active').length;
  const breakGlassCount = jitRequests.filter((r) => r.isBreakGlass).length;

  const copyUri = (uri: string) => {
    try {
      navigator.clipboard?.writeText(uri);
    } catch {
      // ignore
    }
    toast.success('Ephemeral connection URI copied', uri);
  };

  return (
    <div className="vault-stack">
      <NeoBanners>
        <NeoBanner
          tone="amber"
          icon={<ShieldAlert size={16} />}
          title="Zero Standing Privileges · Ephemeral Lease Broker"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--xs"
                onClick={() => openJitModal(false)}
              >
                <Plus size={12} />
                <span>Request JIT Lease</span>
              </button>
              <button
                type="button"
                className="neo-btn neo-btn--danger neo-btn--xs"
                onClick={() => openJitModal(true)}
              >
                <AlertTriangle size={12} />
                <span>Break-Glass Override</span>
              </button>
            </div>
          }
        >
          Every lease auto-revokes on TTL expiry and seals a cryptographic SHA-256 block into Watchtower &amp; Audit.
        </NeoBanner>
      </NeoBanners>

      <NeoKpis label="JIT Access & Ephemeral Leases">
        <NeoKpi
          label="Active Sessions"
          value={activeCount}
          sub="Live time-boxed credentials"
          icon={<Zap size={14} />}
          tone="emerald"
        />
        <NeoKpi
          label="Pending Approvals"
          value={pendingCount}
          sub="Awaiting peer/owner sign-off"
          icon={<Clock size={14} />}
          tone={pendingCount > 0 ? 'amber' : 'slate'}
        />
        <NeoKpi
          label="Break-Glass Events"
          value={breakGlassCount}
          sub="SOC-monitored emergency leases"
          icon={<AlertTriangle size={14} />}
          tone="rose"
        />
        <NeoKpi
          label="Auto-Revocation"
          value="100%"
          sub="Zero standing production privileges"
          icon={<KeyRound size={14} />}
          tone="cyan"
        />
      </NeoKpis>

      <NeoPanel
        hud="5-Stage Ephemeral Lease Broker"
        title="Just-in-Time Access Requests & Active Sessions"
        icon={<Clock size={16} />}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => openJitModal(true)}
            >
              <AlertTriangle size={14} />
              <span>Break-Glass Emergency</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--sm"
              onClick={() => openJitModal(false)}
            >
              <Plus size={14} />
              <span>New JIT Request</span>
            </button>
          </div>
        }
      >
        <div className="vault-stack">
          {jitRequests.map((req) => {
            const requester = users.find((u) => u.id === req.requesterId);
            const approver = users.find((u) => u.id === req.approverId);
            const rem = computeJitRemaining(req, now);

            return (
              <article key={req.id} className="vault-secret-card neo-spot">
                <div className="vault-secret-card__head">
                  <div>
                    <div className="vault-secret-card__badges">
                      {req.isBreakGlass && (
                        <Chip tone="rose" size="sm" icon={<AlertTriangle size={12} />}>
                          Break-Glass Emergency
                        </Chip>
                      )}
                      <Chip
                        tone={
                          req.status === 'active'
                            ? 'emerald'
                            : req.status === 'pending'
                              ? 'amber'
                              : 'slate'
                        }
                        size="sm"
                      >
                        {req.status === 'active'
                          ? 'Active Session'
                          : req.status === 'pending'
                            ? 'Awaiting Approval'
                            : req.status === 'revoked'
                              ? 'Revoked Early'
                              : 'Auto-Revoked'}
                      </Chip>
                      <Chip tone="cyan" size="sm">
                        {req.env}
                      </Chip>
                      <span className="neo-mono" data-no-translate style={{ fontSize: 12 }}>
                        {requester?.name ?? req.requesterId}
                      </span>
                    </div>

                    <h3 className="vault-secret-card__title neo-mono" data-no-translate>
                      {req.resource}
                    </h3>
                    <p className="vault-tv-card__desc" data-no-translate>
                      {req.reason}
                    </p>
                  </div>

                  <div className="vault-secret-card__actions">
                    {req.status === 'pending' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--sm"
                        onClick={() => approveJitRequest(req.id)}
                        title={
                          caps.canApproveJit
                            ? 'Approve and issue dynamic lease'
                            : 'Simulate peer owner approval'
                        }
                      >
                        <CheckCircle2 size={14} />
                        <span>Approve &amp; Issue Lease</span>
                      </button>
                    )}
                    {req.status === 'active' && (
                      <>
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--sm"
                          onClick={() => advanceJitStage(req.id)}
                        >
                          <Clock size={13} />
                          <span>Complete &amp; Auto-Revoke</span>
                        </button>
                        <button
                          type="button"
                          className="neo-btn neo-btn--danger neo-btn--sm"
                          onClick={() => revokeJitRequest(req.id)}
                        >
                          <Ban size={13} />
                          <span>Revoke Lease</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {req.leaseCredentials && (
                  <div className="vault-db-strip">
                    <div className="vault-db-strip__info">
                      <span>Ephemeral Principal:</span>
                      <code className="neo-mono" data-no-translate>
                        {req.leaseCredentials.username}
                      </code>
                      <span>· Token:</span>
                      <code className="neo-mono" data-no-translate>
                        {req.leaseCredentials.maskedToken}
                      </code>
                    </div>
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--xs"
                      onClick={() => copyUri(req.leaseCredentials!.connectionUri)}
                    >
                      <Copy size={12} />
                      <span>Copy Connection URI</span>
                    </button>
                  </div>
                )}

                <NeoTracker
                  bare
                  hud="5-Stage JIT Lease Lifecycle"
                  title={
                    <span data-no-translate>
                      {req.id.toUpperCase()} · {req.durationMins}m TTL
                    </span>
                  }
                  eta={<span data-no-translate>{rem.remainingLabel}</span>}
                  progress={rem.progress}
                  steps={JIT_STAGE_STEPS.map((label) => ({ label }))}
                  current={req.stageIndex}
                  state={req.stageIndex >= 5 ? 'done' : 'active'}
                  message={
                    approver
                      ? `Approved by ${approver.name} · Audited in SHA-256 ledger`
                      : 'Waiting for Peer / Owner approval to mint dynamic credentials'
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
