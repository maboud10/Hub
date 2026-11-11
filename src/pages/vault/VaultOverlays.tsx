/**
 * Aegis Vault — Modals, Biometric Unlock Ritual & Nova AI Copilot Drawer
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Clock,
  Fingerprint,
  KeyRound,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { Chip, NeoNovaPrompt, NovaChip } from '@/components/neo';
import { useHub } from '@/store/hub';
import { generateCredential } from '@/vault/engine';
import { useVault } from '@/vault/store';
import type {
  JitResourceKind,
  ServiceEnvironment,
  VaultItemCategory,
} from '@/vault/types';
import { PasswordGeneratorCard } from './parts';

/* ───────────────────── 1. New Item / Generator Modal ───────────────────── */

export function NewItemModal({
  open,
  genOnlyInitial,
  onClose,
}: {
  open: boolean;
  genOnlyInitial?: boolean;
  onClose: () => void;
}) {
  const createItem = useVault((s) => s.createItem);
  const teamVaults = useVault((s) => s.teamVaults);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<VaultItemCategory>('login');
  const [vaultId, setVaultId] = useState('personal');
  const [username, setUsername] = useState('');
  const [secretValue, setSecretValue] = useState(
    () =>
      generateCredential({
        mode: 'password',
        length: 24,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
        wordCount: 5,
        separator: '-',
      }).value,
  );
  const [totpSecret, setTotpSecret] = useState('JBSWY3DPEHPK3PXP');
  const [travelSafe, setTravelSafe] = useState(true);

  if (!open) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !secretValue.trim()) return;
    createItem({
      vaultId,
      category,
      title,
      username,
      secretValue,
      totpSecret: totpSecret.trim() || undefined,
      travelSafe,
    });
    setTitle('');
    onClose();
  };

  return (
    <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-label={genOnlyInitial ? 'Password Generator' : 'Seal New Credential'}>
      <div className="vault-modal">
        <header className="vault-modal__head">
          <div>
            <div className="neo-hud">Aegis Zero-Knowledge Enclave</div>
            <h2 className="vault-modal__title">
              {genOnlyInitial ? 'Quantum-Grade Credential Generator' : 'Seal New Vault Credential'}
            </h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </header>

        <div className="vault-modal__body">
          <PasswordGeneratorCard onApplySecret={(val) => setSecretValue(val)} />

          <form className="vault-form" onSubmit={onSubmit}>
            <div className="vault-form__grid">
              <label className="vault-form__field">
                <span>Credential Title</span>
                <input
                  className="neo-input"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Production Database Admin"
                />
              </label>

              <label className="vault-form__field">
                <span>Category</span>
                <select
                  className="neo-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as VaultItemCategory)}
                >
                  <option value="login">Login</option>
                  <option value="passkey">FIDO2 Passkey</option>
                  <option value="api_key">API Key / Token</option>
                  <option value="ssh_key">SSH Key</option>
                  <option value="card">Corporate Card</option>
                  <option value="wifi">Enterprise Wi-Fi</option>
                  <option value="note">Secure Note</option>
                  <option value="identity">Travel Identity</option>
                </select>
              </label>

              <label className="vault-form__field">
                <span>Target Vault</span>
                <select
                  className="neo-input"
                  value={vaultId}
                  onChange={(e) => setVaultId(e.target.value)}
                >
                  <option value="personal">My Personal Vault</option>
                  {teamVaults.map((tv) => (
                    <option key={tv.id} value={tv.id}>
                      {tv.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="vault-form__field">
                <span>Username / Principal</span>
                <input
                  className="neo-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ops@helix.co"
                />
              </label>
            </div>

            <div className="vault-form__grid">
              <label className="vault-form__field">
                <span>Secret / Password Value</span>
                <input
                  className="neo-input neo-mono"
                  required
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                />
              </label>
              <label className="vault-form__field">
                <span>Base32 TOTP Secret (Optional)</span>
                <input
                  className="neo-input neo-mono"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="JBSWY3DPEHPK3PXP"
                />
              </label>
            </div>

            <label className="vault-form__check">
              <input
                type="checkbox"
                checked={travelSafe}
                onChange={(e) => setTravelSafe(e.target.checked)}
              />
              <span>Safe for Travel Mode (keep visible when crossing international borders)</span>
            </label>

            <footer className="vault-modal__foot">
              <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="neo-btn neo-btn--plasma">
                <KeyRound size={14} />
                <span>Seal in Aegis Enclave</span>
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── 2. One-Time Share Link Modal (`?share=1`) ───────────────────── */

export function ShareLinkModal({
  open,
  defaultItemId,
  onClose,
}: {
  open: boolean;
  defaultItemId?: string;
  onClose: () => void;
}) {
  const items = useVault((s) => s.items);
  const createShareLink = useVault((s) => s.createShareLink);
  const users = useHub((s) => s.users);
  const [itemId, setItemId] = useState(defaultItemId || items[0]?.id || '');
  const [channel, setChannel] = useState<'link' | 'chat' | 'mail'>('chat');
  const [recipientUserId, setRecipientUserId] = useState('u-lucas');
  const [ttlHours, setTtlHours] = useState(24);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  if (!open) return null;

  const activeItemId = defaultItemId || itemId || items[0]?.id || '';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const link = await createShareLink({
      itemId: activeItemId,
      recipientUserId,
      channel,
      ttlHours,
      maxViews: 1,
    });
    if (link) {
      setCreatedToken(link.token);
    }
  };

  return (
    <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-label="Share a credential securely">
      <div className="vault-modal">
        <header className="vault-modal__head">
          <div>
            <div className="neo-hud">Ephemeral Zero-Knowledge Transfer</div>
            <h2 className="vault-modal__title">Create 1-View Self-Destructing Share Link</h2>
          </div>
          <button
            type="button"
            className="neo-iconbtn"
            onClick={() => {
              setCreatedToken(null);
              onClose();
            }}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </header>

        <form className="vault-modal__body vault-form" onSubmit={onSubmit}>
          <label className="vault-form__field">
            <span>Credential to Seal</span>
            <select
              className="neo-input"
              value={activeItemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.title} ({it.subtitle})
                </option>
              ))}
            </select>
          </label>

          <div className="vault-form__grid">
            <label className="vault-form__field">
              <span>Recipient Colleague</span>
              <select
                className="neo-input"
                value={recipientUserId}
                onChange={(e) => setRecipientUserId(e.target.value)}
              >
                {users
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.department}
                    </option>
                  ))}
              </select>
            </label>

            <label className="vault-form__field">
              <span>Auto-Expire Window</span>
              <select
                className="neo-input"
                value={ttlHours}
                onChange={(e) => setTtlHours(Number(e.target.value))}
              >
                <option value={1}>1 Hour (or 1st view)</option>
                <option value={8}>8 Hours (or 1st view)</option>
                <option value={24}>24 Hours (or 1st view)</option>
              </select>
            </label>
          </div>

          <div className="vault-form__field">
            <span>Delivery Channel</span>
            <div className="vault-channel-pills">
              <button
                type="button"
                className={`neo-btn neo-btn--sm ${channel === 'chat' ? 'neo-btn--plasma' : 'neo-btn--soft'}`}
                onClick={() => setChannel('chat')}
              >
                <MessageSquare size={14} />
                <span>Pulse Chat DM</span>
              </button>
              <button
                type="button"
                className={`neo-btn neo-btn--sm ${channel === 'mail' ? 'neo-btn--plasma' : 'neo-btn--soft'}`}
                onClick={() => setChannel('mail')}
              >
                <Mail size={14} />
                <span>Nova Inbox Email</span>
              </button>
              <button
                type="button"
                className={`neo-btn neo-btn--sm ${channel === 'link' ? 'neo-btn--plasma' : 'neo-btn--soft'}`}
                onClick={() => setChannel('link')}
              >
                <Send size={14} />
                <span>Direct Link Only</span>
              </button>
            </div>
          </div>

          {createdToken && (
            <div className="vault-share-result" aria-live="polite">
              <Chip tone="emerald" size="sm" icon={<ShieldCheck size={12} />}>
                Sealed 1-View Link Ready
              </Chip>
              <code className="neo-mono" data-no-translate>
                https://vault.helix.co/s/{createdToken}
              </code>
            </div>
          )}

          <footer className="vault-modal__foot">
            <button
              type="button"
              className="neo-btn neo-btn--ghost"
              onClick={() => {
                setCreatedToken(null);
                onClose();
              }}
            >
              Close
            </button>
            <button type="submit" className="neo-btn neo-btn--plasma">
              <Send size={14} />
              <span>Seal &amp; Deliver 1-View Link</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/* ───────────────────── 3. JIT Access & Break-Glass Modal (`?new=1`) ───────────────────── */

export function JitRequestModal({
  open,
  defaultBreakGlass = false,
  onClose,
}: {
  open: boolean;
  defaultBreakGlass?: boolean;
  onClose: () => void;
}) {
  const requestJitAccess = useVault((s) => s.requestJitAccess);
  const navigate = useNavigate();
  const [isBreakGlass, setIsBreakGlass] = useState(defaultBreakGlass);
  const [resource, setResource] = useState('vault://prod/payments-svc/postgres-primary-rw');
  const [resourceKind, setResourceKind] = useState<JitResourceKind>('db_lease');
  const [env, setEnv] = useState<ServiceEnvironment>('production');
  const [durationMins, setDurationMins] = useState(60);
  const [reason, setReason] = useState(
    'Investigating checkout settlement latency spike under INC-2041.',
  );
  const [incidentCode, setIncidentCode] = useState('INC-2041');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = requestJitAccess({
      resource,
      resourceKind: isBreakGlass ? 'break_glass' : resourceKind,
      env,
      durationMins,
      reason,
      isBreakGlass,
      incidentCode: isBreakGlass ? incidentCode : undefined,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    navigate('/vault/access');
  };

  return (
    <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-label="Request Just-in-Time Access">
      <div className="vault-modal">
        <header className="vault-modal__head">
          <div>
            <div className="neo-hud">
              {isBreakGlass ? 'Emergency SOC Escalation' : 'Time-Boxed Ephemeral Lease'}
            </div>
            <h2 className="vault-modal__title">
              {isBreakGlass ? 'Break-Glass Emergency Access' : 'Request Just-in-Time (JIT) Lease'}
            </h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </header>

        <form className="vault-modal__body vault-form" onSubmit={onSubmit}>
          <div className="vault-channel-pills">
            <button
              type="button"
              className={`neo-btn neo-btn--sm ${!isBreakGlass ? 'neo-btn--plasma' : 'neo-btn--soft'}`}
              onClick={() => setIsBreakGlass(false)}
            >
              <Clock size={14} />
              <span>Standard Peer-Approved JIT</span>
            </button>
            <button
              type="button"
              className={`neo-btn neo-btn--sm ${isBreakGlass ? 'neo-btn--danger' : 'neo-btn--soft'}`}
              onClick={() => setIsBreakGlass(true)}
            >
              <AlertTriangle size={14} />
              <span>Break-Glass Emergency Override</span>
            </button>
          </div>

          {isBreakGlass && (
            <div className="vault-breakglass-warn">
              <AlertTriangle size={16} />
              <div>
                <b>Break-Glass bypasses peer queue and issues an immediate lease.</b>
                <span>
                  Automatically pages Bastion Security Center (`security.reportSignal`), posts to Pulse Chat, and seals a critical SHA-256 audit block.
                </span>
              </div>
            </div>
          )}

          <label className="vault-form__field">
            <span>Target Resource URI</span>
            <select
              className="neo-input neo-mono"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
            >
              <option value="vault://prod/payments-svc/postgres-primary-rw">
                vault://prod/payments-svc/postgres-primary-rw
              </option>
              <option value="vault://prod/mail-api/nova_dkim_private_key">
                vault://prod/mail-api/nova_dkim_private_key
              </option>
              <option value="vault://prod/cloud/me-central-1-kms-admin">
                vault://prod/cloud/me-central-1-kms-admin
              </option>
              <option value="vault://prod/identity-svc/oidc_federation_client_secret">
                vault://prod/identity-svc/oidc_federation_client_secret
              </option>
              <option value="vault://staging/data-pipeline/clickhouse_ingest_writer_key">
                vault://staging/data-pipeline/clickhouse_ingest_writer_key
              </option>
            </select>
          </label>

          <div className="vault-form__grid">
            <label className="vault-form__field">
              <span>Resource Type</span>
              <select
                className="neo-input"
                value={resourceKind}
                onChange={(e) => setResourceKind(e.target.value as JitResourceKind)}
              >
                <option value="db_lease">Dynamic DB Credentials</option>
                <option value="secret">Service Secret</option>
                <option value="cloud_role">Cloud IAM Federation Role</option>
                <option value="team_vault">Team Vault Escalation</option>
              </select>
            </label>

            <label className="vault-form__field">
              <span>Environment</span>
              <select
                className="neo-input"
                value={env}
                onChange={(e) => setEnv(e.target.value as ServiceEnvironment)}
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </label>

            <label className="vault-form__field">
              <span>Lease TTL (15m – 8h)</span>
              <select
                className="neo-input"
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour (60m)</option>
                <option value={120}>2 hours (120m)</option>
                <option value={240}>4 hours (240m)</option>
                <option value={480}>8 hours (480m)</option>
              </select>
            </label>

            {isBreakGlass && (
              <label className="vault-form__field">
                <span>Incident / Drill Code</span>
                <input
                  className="neo-input neo-mono"
                  value={incidentCode}
                  onChange={(e) => setIncidentCode(e.target.value)}
                  placeholder="INC-2041"
                />
              </label>
            )}
          </div>

          <label className="vault-form__field">
            <span>Audit Justification (Mandatory)</span>
            <textarea
              className="neo-input"
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Detailed operational reason for SOC 2 & ISO 27001 audit log…"
            />
          </label>

          {error && (
            <div className="vault-form__error" role="alert">
              {error}
            </div>
          )}

          <footer className="vault-modal__foot">
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`neo-btn ${isBreakGlass ? 'neo-btn--danger' : 'neo-btn--plasma'}`}
            >
              {isBreakGlass ? <AlertTriangle size={14} /> : <Clock size={14} />}
              <span>{isBreakGlass ? 'Execute Break-Glass Lease' : 'Submit JIT Request'}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/* ───────────────────── 4. Biometric Unlock Ritual Overlay ───────────────────── */

export function UnlockRitualOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const locked = useVault((s) => s.locked);
  const setLocked = useVault((s) => s.setLocked);

  if (!open && !locked) return null;

  const completeUnlock = () => {
    setLocked(false);
    onClose();
  };

  return (
    <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-label="Aegis Biometric Unlock Ritual">
      <div className="vault-ritual-card">
        <div className="vault-ritual-ring">
          <Fingerprint size={48} />
        </div>
        <div className="neo-hud">FIDO2 Hardware Enclave · Zero-Knowledge</div>
        <h2 className="vault-ritual-card__title">Aegis Vault Biometric Ritual</h2>
        <p className="vault-ritual-card__sub">
          Verifying Ed25519 hardware passkey signature and deriving client-side AES-256-GCM memory keys.
        </p>
        <div className="vault-ritual-card__actions">
          <button type="button" className="neo-btn neo-btn--plasma" onClick={completeUnlock}>
            <Fingerprint size={15} />
            <span>Verify Passkey &amp; Unlock Enclave</span>
          </button>
          {!locked && (
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              <span>Skip Ritual</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── 5. Nova Vault Copilot Drawer ───────────────────── */

export function NovaVaultDrawer() {
  const open = useVault((s) => s.novaOpen);
  const setOpen = useVault((s) => s.setNovaOpen);
  const history = useVault((s) => s.novaHistory);
  const askNova = useVault((s) => s.askNova);
  const rotateAllVulnerableItems = useVault((s) => s.rotateAllVulnerableItems);
  const repairAuditChain = useVault((s) => s.repairAuditChain);
  const navigate = useNavigate();

  if (!open) return null;

  const handleAction = (kind: string) => {
    if (kind === 'rotate_reused') {
      rotateAllVulnerableItems();
    } else if (kind === 'rotate_overdue_secrets') {
      setOpen(false);
      navigate('/vault/secrets');
    } else if (kind === 'renew_certs') {
      setOpen(false);
      navigate('/vault/certs');
    } else if (kind === 'verify_chain') {
      repairAuditChain();
      setOpen(false);
      navigate('/vault/audit');
    }
  };

  return (
    <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova Aegis Copilot">
      <div className="vault-modal">
        <header className="vault-modal__head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NovaChip>Nova · Aegis Security AI</NovaChip>
            <h2 className="vault-modal__title">Zero-Knowledge Posture Copilot</h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={() => setOpen(false)} aria-label="Close Nova drawer">
            <X size={16} />
          </button>
        </header>

        <div className="vault-modal__body">
          <NeoNovaPrompt
            hud="Ask Aegis Nova"
            title="Inspect credential hygiene, service leases, or SHA-256 audit integrity"
            placeholder="e.g., Rotate reused passwords, inspect overdue service secrets, or verify the SHA-256 audit chain…"
            suggestions={[
              'Rotate reused and weak passwords',
              'Which service secrets are overdue for rotation?',
              'Verify SHA-256 audit hash chain integrity',
              'Check expiring TLS certificates',
            ]}
            onSubmit={(q) => askNova(q)}
          />

          <div className="vault-nova-list" aria-live="polite">
            {history.map((ans) => (
              <article key={ans.id} className="vault-nova-ans">
                <div className="vault-nova-ans__q">
                  <Sparkles size={13} />
                  <span data-no-translate>{ans.prompt}</span>
                </div>
                <p className="vault-nova-ans__sum" data-no-translate>
                  {ans.summary}
                </p>
                <ul className="vault-nova-ans__bullets">
                  {ans.bullets.map((b, i) => (
                    <li key={i} data-no-translate>
                      {b}
                    </li>
                  ))}
                </ul>
                {ans.recommendedAction && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--sm"
                    onClick={() => handleAction(ans.recommendedAction!.kind)}
                  >
                    <Wand2 size={13} />
                    <span>{ans.recommendedAction.label}</span>
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
