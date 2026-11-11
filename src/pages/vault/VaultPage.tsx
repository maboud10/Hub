/**
 * Vault ("Aegis") — Main App Shell (`/vault/*`)
 * Zero-knowledge personal vault, team vaults with 1-view links, dynamic service secrets & rotation,
 * TLS/mTLS certificate lifecycle, Just-in-Time access with 5-stage tracker, and SHA-256 hash-chained audit trail.
 */
import '@/styles/neo.css';
import '@/styles/vault.css';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import {
  Award,
  Clock,
  FolderLock,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  Server,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { useVaultCapabilities } from '@/vault/access';
import { evaluateSecretStatus } from '@/vault/engine';
import { useVault } from '@/vault/store';
import { CertificatesView } from './CertificatesView';
import { JitAccessView } from './JitAccessView';
import { MyVaultView } from './MyVaultView';
import { SecretsView } from './SecretsView';
import { TeamVaultsView } from './TeamVaultsView';
import {
  JitRequestModal,
  NewItemModal,
  NovaVaultDrawer,
  ShareLinkModal,
  UnlockRitualOverlay,
} from './VaultOverlays';
import { WatchtowerView } from './WatchtowerView';
import { VaultUiCtx } from './parts';

const VAULT_TINT = { c1: '#facc15', c2: '#f59e0b', on: '#1a1205' };

interface SectionMeta {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/vault',
    end: true,
    icon: <KeyRound />,
    eyebrow: 'Vault deck',
    title: 'My Vault',
    sub: 'Zero-knowledge personal credentials, hardware FIDO2 passkeys, live 30-second TOTP rings, and Watchtower hygiene.',
  },
  {
    to: '/vault/shared',
    icon: <FolderLock />,
    eyebrow: 'Vault deck · Team Vaults',
    title: 'Team Vaults & Ephemeral Links',
    sub: 'Departmental zero-knowledge enclaves across Engineering, Finance, Growth, People Ops & Security with 1-view self-destructing links.',
  },
  {
    to: '/vault/secrets',
    icon: <Server />,
    eyebrow: 'Vault deck · Service Secrets',
    title: 'Service Secrets & Rotation',
    sub: 'Dynamic database credentials, KMS envelope keys, repo push-protection alerts, and 5-stage zero-downtime secret rotation.',
  },
  {
    to: '/vault/certs',
    icon: <Award />,
    eyebrow: 'Vault deck · Certificates',
    title: 'Certificates & Keys',
    sub: 'TLS and SPIFFE mTLS certificate inventory, 90-day expiry horizon, ACME DNS-01 auto-renewal, and Envoy SDS deployment.',
  },
  {
    to: '/vault/access',
    icon: <Clock />,
    eyebrow: 'Vault deck · JIT Access',
    title: 'Just-in-Time Access',
    sub: 'Zero standing privileges: time-boxed ephemeral leases with a 5-stage tracker and SOC-monitored Break-Glass emergency override.',
  },
  {
    to: '/vault/audit',
    icon: <ShieldAlert />,
    eyebrow: 'Vault deck · Watchtower & Audit',
    title: 'Watchtower & Audit Trail',
    sub: 'Tamper-evident FIPS 180-4 SHA-256 hash-chained audit ledger, Watchtower breach remediation, and SOC 2 / ISO 27001 evidence.',
  },
];

export function VaultPage() {
  const me = useSessionUser();
  const now = useNow(30_000);
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const caps = useVaultCapabilities();

  const secrets = useVault((s) => s.secrets);
  const jitRequests = useVault((s) => s.jitRequests);
  const setLocked = useVault((s) => s.setLocked);
  const setNovaOpen = useVault((s) => s.setNovaOpen);
  const resetDemo = useVault((s) => s.resetDemo);

  const [newItemOpen, setNewItemOpen] = useState(false);
  const [genOnlyMode, setGenOnlyMode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareItemId, setShareItemId] = useState<string | undefined>(undefined);
  const [jitOpen, setJitOpen] = useState(false);
  const [jitBreakGlass, setJitBreakGlass] = useState(false);
  const [ritualOpen, setRitualOpen] = useState(false);

  // Deep-link modal triggers (`?new=1`, `?share=1`, `?gen=1`, `?breakglass=1`)
  const hasNewParam = params.get('new') === '1';
  const hasShareParam = params.get('share') === '1';
  const hasGenParam = params.get('gen') === '1';
  const hasBgParam = params.get('breakglass') === '1';

  useEffect(() => {
    if (hasNewParam) {
      if (pathname.includes('/access')) {
        setJitBreakGlass(false);
        setJitOpen(true);
      } else {
        setGenOnlyMode(false);
        setNewItemOpen(true);
      }
    }
    if (hasShareParam) {
      setShareOpen(true);
    }
    if (hasGenParam) {
      setGenOnlyMode(true);
      setNewItemOpen(true);
    }
    if (hasBgParam) {
      setJitBreakGlass(true);
      setJitOpen(true);
    }
  }, [hasNewParam, hasShareParam, hasGenParam, hasBgParam, pathname]);

  const clearParam = useCallback(
    (key: string) => {
      if (params.has(key)) {
        const next = new URLSearchParams(params);
        next.delete(key);
        setParams(next, { replace: true });
      }
    },
    [params, setParams],
  );

  const openNewItem = useCallback((genOnly = false) => {
    setGenOnlyMode(genOnly);
    setNewItemOpen(true);
  }, []);

  const openShareModal = useCallback((itemId?: string) => {
    setShareItemId(itemId);
    setShareOpen(true);
  }, []);

  const openJitModal = useCallback((breakGlass = false) => {
    setJitBreakGlass(breakGlass);
    setJitOpen(true);
  }, []);

  const openUnlockRitual = useCallback(() => {
    setRitualOpen(true);
  }, []);

  const uiCtx = useMemo(
    () => ({
      openNewItem,
      openShareModal,
      openJitModal,
      openUnlockRitual,
    }),
    [openNewItem, openShareModal, openJitModal, openUnlockRitual],
  );

  const expiringSecretsBadge = secrets.filter((s) => {
    const st = evaluateSecretStatus(s, now);
    return st === 'overdue' || st === 'exposed' || st === 'expiring_soon';
  }).length;

  const pendingJitBadge = jitRequests.filter((r) => r.status === 'pending').length;

  const items: NeoNavItem[] = useMemo(() => {
    const list: NeoNavItem[] = [
      {
        to: '/vault',
        label: 'My Vault',
        icon: <KeyRound />,
        end: true,
        title: 'Personal credentials, passkeys & TOTP rings',
      },
      {
        to: '/vault/shared',
        label: 'Team Vaults',
        icon: <FolderLock />,
        title: 'Departmental vaults & 1-view share links',
      },
    ];
    if (caps.isEngineer) {
      list.push(
        {
          to: '/vault/secrets',
          label: 'Service Secrets',
          icon: <Server />,
          badge: expiringSecretsBadge || null,
          badgeTone: 'danger',
          title: 'Dynamic service secrets & 5-stage rotation',
        },
        {
          to: '/vault/certs',
          label: 'Certificates',
          icon: <Award />,
          title: 'TLS & SPIFFE mTLS certificates',
        },
      );
    }
    list.push({
      to: '/vault/access',
      label: 'JIT Access',
      icon: <Clock />,
      badge: caps.canApproveJit && pendingJitBadge > 0 ? pendingJitBadge : null,
      title: 'Just-in-time access leases & Break-Glass',
    });
    if (caps.canViewAudit) {
      list.push({
        to: '/vault/audit',
        label: 'Watchtower & Audit',
        icon: <ShieldAlert />,
        title: 'Watchtower hygiene & SHA-256 hash-chained audit trail',
      });
    }
    return list;
  }, [caps.isEngineer, caps.canApproveJit, caps.canViewAudit, expiringSecretsBadge, pendingJitBadge]);

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/vault';

  const headActions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--nova neo-btn--sm"
        onClick={() => setNovaOpen(true)}
        title="Open Nova Aegis Security Copilot"
      >
        <Sparkles size={14} />
        <span className="neo-btn__label">Ask Nova</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--soft neo-btn--sm"
        onClick={() => setLocked(true)}
        title="Lock Aegis Vault enclave"
      >
        <Lock size={14} />
        <span className="neo-btn__label">Lock Vault</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--soft neo-btn--sm"
        onClick={resetDemo}
        title="Reset Vault demo data"
      >
        <RotateCcw size={14} />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma neo-btn--sm"
        onClick={() => openNewItem(false)}
        data-qa="vault-new-item-btn"
      >
        <Plus size={14} />
        <span className="neo-btn__label">New Item</span>
      </button>
    </>
  );

  const overlays = (
    <>
      <NewItemModal
        open={newItemOpen}
        genOnlyInitial={genOnlyMode}
        onClose={() => {
          setNewItemOpen(false);
          clearParam('new');
          clearParam('gen');
        }}
      />
      <ShareLinkModal
        open={shareOpen}
        defaultItemId={shareItemId}
        onClose={() => {
          setShareOpen(false);
          clearParam('share');
        }}
      />
      <JitRequestModal
        open={jitOpen}
        defaultBreakGlass={jitBreakGlass}
        onClose={() => {
          setJitOpen(false);
          clearParam('new');
          clearParam('breakglass');
        }}
      />
      <UnlockRitualOverlay open={ritualOpen} onClose={() => setRitualOpen(false)} />
      <NovaVaultDrawer />
    </>
  );

  return (
    <VaultUiCtx.Provider value={uiCtx}>
      <NeoAppFrame
        app="vault"
        tint={VAULT_TINT}
        className="vault-page"
        brand={{ icon: <KeyRound />, label: 'Vault', to: '/vault' }}
        items={items}
        head={{
          icon: section.icon,
          eyebrow: section.eyebrow,
          title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
          sub: section.sub,
          actions: headActions,
        }}
        overlays={overlays}
      >
        <Routes>
          <Route index element={<MyVaultView />} />
          <Route path="shared" element={<TeamVaultsView />} />
          <Route path="secrets" element={<SecretsView />} />
          <Route path="certs" element={<CertificatesView />} />
          <Route path="certificates" element={<CertificatesView />} />
          <Route path="access" element={<JitAccessView />} />
          <Route path="jit" element={<JitAccessView />} />
          <Route path="audit" element={<WatchtowerView />} />
          <Route path="watchtower" element={<WatchtowerView />} />
          <Route path="*" element={<Navigate to="/vault" replace />} />
        </Routes>
      </NeoAppFrame>
    </VaultUiCtx.Provider>
  );
}

export default VaultPage;
