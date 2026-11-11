/**
 * Aegis Vault — Team Vaults & Ephemeral One-Time Share Links (`/vault/shared`)
 */
import { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Cpu,
  Eye,
  FolderLock,
  Landmark,
  Megaphone,
  Plus,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Avatars,
  Chip,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTracker,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { evaluateShareLink, JOIN_STAGE_STEPS } from '@/vault/engine';
import { useVault } from '@/vault/store';
import type { TeamVault } from '@/vault/types';
import { SecretRevealBox, TotpLiveWidget, useVaultUi } from './parts';

function vaultIcon(icon: string) {
  switch (icon) {
    case 'Cpu':
      return <Cpu size={18} />;
    case 'ShieldCheck':
      return <ShieldCheck size={18} />;
    case 'Landmark':
      return <Landmark size={18} />;
    case 'Megaphone':
      return <Megaphone size={18} />;
    default:
      return <Users size={18} />;
  }
}

export function TeamVaultsView() {
  const now = useNow(15_000);
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const teamVaults = useVault((s) => s.teamVaults);
  const items = useVault((s) => s.items);
  const shareLinks = useVault((s) => s.shareLinks);
  const joinRequests = useVault((s) => s.joinRequests);
  const travelMode = useVault((s) => s.travelMode);
  const consumeShareLinkById = useVault((s) => s.consumeShareLinkById);
  const revokeShareLink = useVault((s) => s.revokeShareLink);
  const requestTeamVaultJoin = useVault((s) => s.requestTeamVaultJoin);
  const advanceJoinRequest = useVault((s) => s.advanceJoinRequest);

  const { openShareModal } = useVaultUi();

  const visibleVaults = teamVaults.filter((tv) => (!travelMode || !tv.travelHidden));
  const [selectedVaultId, setSelectedVaultId] = useState<string>(
    visibleVaults[0]?.id ?? teamVaults[0]?.id ?? 'tv-eng-prod',
  );

  const activeVault: TeamVault | undefined =
    visibleVaults.find((tv) => tv.id === selectedVaultId) ?? visibleVaults[0] ?? teamVaults[0];

  const vaultItems = items.filter((i) => i.vaultId === activeVault?.id);
  const activeLinksCount = shareLinks.filter((l) => evaluateShareLink(l, now) === 'active').length;

  return (
    <div className="vault-stack">
      <NeoKpis label="Team Vaults & Ephemeral Sharing">
        <NeoKpi
          label="Team Enclaves"
          value={visibleVaults.length}
          sub="Departmental zero-knowledge vaults"
          icon={<FolderLock size={14} />}
          tone="amber"
        />
        <NeoKpi
          label="Shared Credentials"
          value={items.filter((i) => i.vaultId !== 'personal').length}
          sub="Role-gated team secrets & TOTP"
          icon={<ShieldCheck size={14} />}
          tone="emerald"
        />
        <NeoKpi
          label="Active 1-View Links"
          value={activeLinksCount}
          sub="Self-destruct after 1st decryption"
          icon={<Send size={14} />}
          tone="cyan"
        />
        <NeoKpi
          label="Vault Join Flows"
          value={joinRequests.length}
          sub="Multi-custodian key escrow"
          icon={<Users size={14} />}
          tone="violet"
        />
      </NeoKpis>

      <NeoHome
        main={
          <div className="vault-stack">
            <NeoPanel
              hud="Departmental Enclaves"
              title="Team Vaults Across NEXUS"
              icon={<FolderLock size={16} />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => openShareModal()}
                >
                  <Send size={14} />
                  <span>Create 1-View Share Link</span>
                </button>
              }
            >
              <div className="vault-tv-grid">
                {visibleVaults.map((tv) => {
                  const isSelected = activeVault?.id === tv.id;
                  const memberUsers = tv.members
                    .map((m) => users.find((u) => u.id === m.userId))
                    .filter((u): u is NonNullable<typeof u> => Boolean(u));
                  const myMember = tv.members.find((m) => m.userId === me?.id);
                  const count = items.filter((i) => i.vaultId === tv.id).length;

                  return (
                    <div
                      key={tv.id}
                      role="button"
                      tabIndex={0}
                      className={`vault-tv-card neo-spot ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedVaultId(tv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedVaultId(tv.id);
                        }
                      }}
                    >
                      <div className="vault-tv-card__head">
                        <span className="vault-tv-card__icon">{vaultIcon(tv.icon)}</span>
                        <div className="vault-tv-card__titles">
                          <h3 className="vault-tv-card__name">{tv.name}</h3>
                          <span className="neo-hud">{tv.department}</span>
                        </div>
                        <Chip
                          tone={
                            tv.classification === 'restricted'
                              ? 'rose'
                              : tv.classification === 'confidential'
                                ? 'amber'
                                : 'cyan'
                          }
                          size="sm"
                        >
                          {tv.classification}
                        </Chip>
                      </div>

                      <p className="vault-tv-card__desc">{tv.description}</p>

                      <div className="vault-tv-card__foot">
                        <Avatars users={memberUsers} max={5} size={24} />
                        <div className="vault-tv-card__meta">
                          <Chip tone="slate" size="sm">
                            <span>Items</span> <b className="neo-mono">{count}</b>
                          </Chip>
                          {myMember ? (
                            <Chip tone="emerald" size="sm">
                              {myMember.role}
                            </Chip>
                          ) : (
                            <button
                              type="button"
                              className="neo-btn neo-btn--soft neo-btn--xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestTeamVaultJoin({
                                  vaultId: tv.id,
                                  role: 'viewer',
                                  reason: `Requesting viewer access to ${tv.name}`,
                                });
                              }}
                            >
                              <Plus size={12} />
                              <span>Request Access</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            {activeVault && (
              <NeoPanel
                hud={`Enclave Contents · ${activeVault.department}`}
                title={activeVault.name}
                icon={vaultIcon(activeVault.icon)}
              >
                <div className="vault-stack">
                  {vaultItems.map((it) => (
                    <div key={it.id} className="vault-shared-item">
                      <div className="vault-shared-item__top">
                        <div>
                          <h3 className="vault-item-row__title">{it.title}</h3>
                          <div className="vault-item-row__sub" data-no-translate>
                            {it.subtitle}
                          </div>
                        </div>
                        {it.totpSecret && <TotpLiveWidget secretB32={it.totpSecret} compact />}
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--xs"
                          onClick={() => openShareModal(it.id)}
                        >
                          <Send size={12} />
                          <span>1-View Share</span>
                        </button>
                      </div>
                      <SecretRevealBox itemId={it.id} value={it.secretValue} />
                    </div>
                  ))}
                </div>
              </NeoPanel>
            )}
          </div>
        }
        side={
          <div className="vault-stack">
            <NeoPanel
              hud="Ephemeral Zero-Knowledge Links"
              title="One-Time Share Links"
              icon={<Send size={16} />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--xs"
                  onClick={() => openShareModal()}
                >
                  <Plus size={12} />
                  <span>New Link</span>
                </button>
              }
            >
              <div className="vault-stack">
                {shareLinks.map((lnk) => {
                  const status = evaluateShareLink(lnk, now);
                  const recipient = users.find((u) => u.id === lnk.recipientUserId);
                  return (
                    <div key={lnk.id} className="vault-link-card">
                      <div className="vault-link-card__head">
                        <strong className="vault-link-card__title">{lnk.itemTitle}</strong>
                        <Chip
                          tone={
                            status === 'active'
                              ? 'emerald'
                              : status === 'viewed'
                                ? 'amber'
                                : 'slate'
                          }
                          size="sm"
                        >
                          {status === 'active'
                            ? 'Active (0/1 Views)'
                            : status === 'viewed'
                              ? 'Viewed · Self-Destructed'
                              : status}
                        </Chip>
                      </div>

                      <div className="vault-link-card__meta">
                        <code className="neo-mono" data-no-translate>
                          https://vault.helix.co/s/{lnk.token}
                        </code>
                        <span data-no-translate>
                          {recipient ? `→ ${recipient.name}` : lnk.recipientEmail ? `→ ${lnk.recipientEmail}` : ''}
                        </span>
                      </div>

                      {status === 'active' && (
                        <div className="vault-link-card__actions">
                          <button
                            type="button"
                            className="neo-btn neo-btn--plasma neo-btn--xs"
                            onClick={() => consumeShareLinkById(lnk.id)}
                          >
                            <Eye size={12} />
                            <span>Simulate 1st View</span>
                          </button>
                          <button
                            type="button"
                            className="neo-btn neo-btn--ghost neo-btn--xs"
                            onClick={() => revokeShareLink(lnk.id)}
                          >
                            <Ban size={12} />
                            <span>Revoke</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </NeoPanel>

            <NeoPanel
              hud="Key Escrow Workflow"
              title="Team Vault Join Requests"
              icon={<Users size={16} />}
            >
              <div className="vault-stack">
                {joinRequests.map((req) => {
                  const vault = teamVaults.find((tv) => tv.id === req.vaultId);
                  const requester = users.find((u) => u.id === req.userId);
                  return (
                    <div key={req.id} className="vault-join-card">
                      <NeoTracker
                        bare
                        hud={vault?.name ?? req.vaultId}
                        title={
                          <span data-no-translate>
                            {requester?.name ?? req.userId} · {req.role.toUpperCase()}
                          </span>
                        }
                        steps={JOIN_STAGE_STEPS.map((label) => ({ label }))}
                        current={req.state === 'done' ? JOIN_STAGE_STEPS.length : req.stageIndex}
                        state={req.state}
                        message={req.reason}
                        actions={
                          req.state !== 'done' ? (
                            <button
                              type="button"
                              className="neo-btn neo-btn--soft neo-btn--xs"
                              onClick={() => advanceJoinRequest(req.id)}
                            >
                              <CheckCircle2 size={12} />
                              <span>Advance Stage</span>
                            </button>
                          ) : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </NeoPanel>
          </div>
        }
      />
    </div>
  );
}
