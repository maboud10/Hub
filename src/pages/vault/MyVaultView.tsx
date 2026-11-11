/**
 * Aegis Vault — My Vault View (`/vault`)
 * Personal & accessible credentials across 8 categories, live 30s TOTP rings,
 * hold-to-reveal with 30s clipboard auto-scrub, and Watchtower remediation.
 */
import { useMemo, useState } from 'react';
import {
  CreditCard,
  FileText,
  Fingerprint,
  IdCard,
  KeyRound,
  Plus,
  RotateCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Terminal,
  Wifi,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoSearch,
  NeoTabs,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useVaultCapabilities } from '@/vault/access';
import {
  analyzeItemRisks,
  computeVaultHygiene,
  verifyAuditChain,
} from '@/vault/engine';
import { useVault } from '@/vault/store';
import type { VaultItem, VaultItemCategory } from '@/vault/types';
import {
  AegisShieldHero,
  PasswordGeneratorCard,
  RiskBadges,
  SecretRevealBox,
  TotpLiveWidget,
  useVaultUi,
} from './parts';

type CategoryFilter = 'all' | 'favorites' | VaultItemCategory;

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'login', label: 'Logins' },
  { value: 'passkey', label: 'Passkeys' },
  { value: 'api_key', label: 'API keys' },
  { value: 'ssh_key', label: 'SSH keys' },
  { value: 'card', label: 'Cards' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'note', label: 'Secure notes' },
  { value: 'identity', label: 'Identities' },
];

function categoryIcon(cat: VaultItemCategory) {
  switch (cat) {
    case 'passkey':
      return <Fingerprint size={16} />;
    case 'api_key':
      return <KeyRound size={16} />;
    case 'ssh_key':
      return <Terminal size={16} />;
    case 'card':
      return <CreditCard size={16} />;
    case 'wifi':
      return <Wifi size={16} />;
    case 'note':
      return <FileText size={16} />;
    case 'identity':
      return <IdCard size={16} />;
    default:
      return <KeyRound size={16} />;
  }
}

export function MyVaultView() {
  const now = useNow(15_000);
  const items = useVault((s) => s.items);
  const secrets = useVault((s) => s.secrets);
  const certificates = useVault((s) => s.certificates);
  const shareLinks = useVault((s) => s.shareLinks);
  const auditLog = useVault((s) => s.auditLog);
  const travelMode = useVault((s) => s.travelMode);
  const selectedItemId = useVault((s) => s.selectedItemId);
  const selectItem = useVault((s) => s.selectItem);
  const toggleFavorite = useVault((s) => s.toggleFavorite);
  const rotateItemCredential = useVault((s) => s.rotateItemCredential);
  const rotateAllVulnerableItems = useVault((s) => s.rotateAllVulnerableItems);

  const caps = useVaultCapabilities();
  const { openNewItem, openShareModal } = useVaultUi();

  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const visibleItems = useMemo(
    () => items.filter((it) => (!travelMode || it.travelSafe)),
    [items, travelMode],
  );

  const hygiene = useMemo(
    () => computeVaultHygiene(visibleItems, secrets, certificates, now, caps.isSecurityAdmin),
    [visibleItems, secrets, certificates, now, caps.isSecurityAdmin],
  );

  const chainStatus = useMemo(() => verifyAuditChain(auditLog), [auditLog]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleItems.filter((it) => {
      if (catFilter === 'favorites' && !it.favorite) return false;
      if (catFilter !== 'all' && catFilter !== 'favorites' && it.category !== catFilter) return false;
      if (!q) return true;
      return `${it.title} ${it.subtitle} ${it.username ?? ''} ${it.tags.join(' ')}`
        .toLowerCase()
        .includes(q);
    });
  }, [visibleItems, catFilter, query]);

  const selected: VaultItem | null =
    filteredItems.find((i) => i.id === selectedItemId) ??
    visibleItems.find((i) => i.id === selectedItemId) ??
    filteredItems[0] ??
    null;

  const passkeyAnd2faCount = visibleItems.filter(
    (i) => i.category === 'passkey' || Boolean(i.totpSecret),
  ).length;
  const activeShareCount = shareLinks.filter((l) => l.status === 'active').length;
  const totalRisks = hygiene.exposed + hygiene.reused + hygiene.weak + hygiene.expiringSoon;

  return (
    <div className="vault-stack">
      <AegisShieldHero
        hygiene={hygiene}
        chainValid={chainStatus.valid}
        chainCount={chainStatus.checkedCount}
        onRemediateAll={() => rotateAllVulnerableItems()}
      />

      <NeoKpis label="Vault Hygiene Telemetry">
        <NeoKpi
          label="Credential Hygiene"
          value={`${hygiene.score}/100`}
          sub="Zero-knowledge enclave score"
          icon={<ShieldCheck size={14} />}
          tone={hygiene.score >= 85 ? 'emerald' : hygiene.score >= 65 ? 'amber' : 'rose'}
        />
        <NeoKpi
          label="Passkeys & Live TOTP"
          value={passkeyAnd2faCount}
          sub="Hardware FIDO2 & RFC 6238 rings"
          icon={<Fingerprint size={14} />}
          tone="amber"
        />
        <NeoKpi
          label="Watchtower Findings"
          value={totalRisks}
          sub={totalRisks > 0 ? 'Exposed, reused, weak or expiring' : 'Zero active credential risks'}
          icon={<ShieldAlert size={14} />}
          tone={totalRisks > 0 ? 'rose' : 'emerald'}
        />
        <NeoKpi
          label="1-View Share Links"
          value={activeShareCount}
          sub="Self-destructing active tokens"
          icon={<Send size={14} />}
          tone="cyan"
        />
      </NeoKpis>

      <div className="vault-filter-bar">
        <NeoTabs
          value={catFilter}
          onChange={setCatFilter}
          items={CATEGORY_TABS}
          label="Credential category filter"
        />
        <div className="vault-filter-bar__search">
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Filter credentials, domains, or tags…"
            size="sm"
          />
          <button
            type="button"
            className="neo-btn neo-btn--plasma neo-btn--sm"
            onClick={() => openNewItem(false)}
          >
            <Plus size={14} />
            <span>New Credential</span>
          </button>
        </div>
      </div>

      <NeoHome
        main={
          <NeoPanel
            hud="Zero-Knowledge Vault"
            title="Sealed Credentials & Passkeys"
            icon={<KeyRound size={16} />}
            actions={
              <Chip tone="amber" size="sm">
                <span>Showing</span> <b className="neo-mono">{filteredItems.length}</b>
              </Chip>
            }
          >
            {filteredItems.length === 0 ? (
              <NeoEmpty
                icon={<KeyRound size={24} />}
                title="No credentials match this filter"
                action={
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => {
                      setCatFilter('all');
                      setQuery('');
                    }}
                  >
                    Reset Filter
                  </button>
                }
              />
            ) : (
              <div className="vault-item-list" role="listbox" aria-label="Vault credentials">
                {filteredItems.map((it) => {
                  const isSelected = selected?.id === it.id;
                  const risks = analyzeItemRisks(it, items, now);
                  return (
                    <div
                      key={it.id}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      className={`vault-item-row neo-spot ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => selectItem(it.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectItem(it.id);
                        }
                      }}
                    >
                      <span className="vault-item-row__glyph">{categoryIcon(it.category)}</span>
                      <div className="vault-item-row__main">
                        <div className="vault-item-row__title-line">
                          <h3 className="vault-item-row__title">{it.title}</h3>
                          <RiskBadges risks={risks} />
                        </div>
                        <div className="vault-item-row__sub" data-no-translate>
                          {it.subtitle}
                        </div>
                      </div>

                      {it.totpSecret && <TotpLiveWidget secretB32={it.totpSecret} compact />}

                      <div className="vault-item-row__acts" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="neo-iconbtn neo-iconbtn--sm"
                          onClick={() => toggleFavorite(it.id)}
                          aria-label={it.favorite ? 'Remove from favorites' : 'Pin to favorites'}
                          title={it.favorite ? 'Remove from favorites' : 'Pin to favorites'}
                        >
                          <Star
                            size={14}
                            fill={it.favorite ? '#facc15' : 'none'}
                            color={it.favorite ? '#facc15' : 'currentColor'}
                          />
                        </button>
                        <button
                          type="button"
                          className="neo-iconbtn neo-iconbtn--sm"
                          onClick={() => openShareModal(it.id)}
                          aria-label="Share 1-view link"
                          title="Share 1-view self-destructing link"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          type="button"
                          className="neo-iconbtn neo-iconbtn--sm"
                          onClick={() => rotateItemCredential(it.id)}
                          aria-label="Rotate credential"
                          title="Rotate credential now"
                        >
                          <RotateCw size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </NeoPanel>
        }
        side={
          <div className="vault-stack">
            {selected && (
              <NeoPanel
                hud="Credential Inspector"
                title={selected.title}
                icon={categoryIcon(selected.category)}
                actions={
                  <Chip tone={selected.vaultId === 'personal' ? 'amber' : 'cyan'} size="sm">
                    {selected.vaultId === 'personal' ? 'Personal Enclave' : 'Team Vault'}
                  </Chip>
                }
              >
                <div className="vault-inspector">
                  <div className="vault-inspector__meta" data-no-translate>
                    {selected.subtitle}
                  </div>
                  {selected.username && (
                    <div className="vault-inspector__kv">
                      <span className="neo-hud">Principal / Username</span>
                      <code className="neo-mono" data-no-translate>
                        {selected.username}
                      </code>
                    </div>
                  )}

                  <SecretRevealBox itemId={selected.id} value={selected.secretValue} />

                  {selected.totpSecret && <TotpLiveWidget secretB32={selected.totpSecret} />}

                  {selected.fields.length > 0 && (
                    <div className="vault-inspector__fields">
                      {selected.fields.map((f) => (
                        <div key={f.id} className="vault-inspector__kv">
                          <span className="neo-hud" data-no-translate>
                            {f.label}
                          </span>
                          <code className="neo-mono" data-no-translate>
                            {f.masked ? '••••••••••••' : f.value}
                          </code>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="vault-inspector__actions">
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => rotateItemCredential(selected.id)}
                    >
                      <RotateCw size={14} />
                      <span>Rotate Secret Now</span>
                    </button>
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => openShareModal(selected.id)}
                    >
                      <Send size={14} />
                      <span>1-View Share Link</span>
                    </button>
                  </div>
                </div>
              </NeoPanel>
            )}

            <NeoPanel
              hud="Entropy Forge"
              title="Password & Passphrase Generator"
              icon={<KeyRound size={16} />}
            >
              <PasswordGeneratorCard
                onApplySecret={
                  selected ? (val) => rotateItemCredential(selected.id, val, 'manual') : undefined
                }
              />
            </NeoPanel>
          </div>
        }
      />
    </div>
  );
}
