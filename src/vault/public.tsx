/**
 * Aegis Vault — Public App Bridge (`VaultBridge`)
 * Enforces permission boundaries and guarantees zero secret leakage in command palette entries.
 */
import { Clock, KeyRound, Lock, Send, ShieldAlert, Sparkles } from 'lucide-react';
import type { BridgeViewer, PaletteEntry, VaultBridge } from '@/lib/appBridge';
import { getCapabilitiesForViewer } from './access';
import { computeVaultHygiene } from './engine';
import { useVault } from './store';

function visibleItemsForViewer(viewer: BridgeViewer) {
  const s = useVault.getState();
  const caps = getCapabilitiesForViewer(viewer);
  if (!caps.canUseVault) return [];
  if (caps.isSecurityAdmin) return s.items;

  const memberVaultIds = new Set(
    s.teamVaults
      .filter((tv) => tv.members.some((m) => m.userId === viewer.user.id))
      .map((tv) => tv.id),
  );

  return s.items.filter((it) => {
    if (s.travelMode && !it.travelSafe) return false;
    if (it.vaultId === 'personal') {
      return it.ownerId === 'u-self' || it.ownerId === viewer.user.id;
    }
    return memberVaultIds.has(it.vaultId);
  });
}

export const api: VaultBridge = {
  appId: 'vault',

  paletteEntries(viewer): PaletteEntry[] {
    const caps = getCapabilitiesForViewer(viewer);
    if (!caps.canUseVault) return [];

    const entries: PaletteEntry[] = [
      {
        id: 'vault:act:open',
        group: 'Actions',
        title: 'Open my vault',
        subtitle: 'Aegis Vault · Zero-knowledge credentials & passkeys',
        icon: <KeyRound size={15} />,
        glyphColor: '#facc15',
        keywords: ['vault', 'aegis', 'password', 'passkey', 'totp'],
        hint: 'Open',
        to: '/vault',
      },
      {
        id: 'vault:act:generate',
        group: 'Actions',
        title: 'Generate a password or passphrase',
        subtitle: 'Aegis Vault · Quantum-grade entropy generator',
        icon: <Sparkles size={15} />,
        glyphColor: '#f59e0b',
        keywords: ['password', 'generator', 'passphrase', 'entropy'],
        hint: 'Generate',
        to: '/vault?gen=1',
      },
      {
        id: 'vault:act:share',
        group: 'Actions',
        title: 'Share a credential securely',
        subtitle: 'Aegis Vault · 1-view self-destructing link',
        icon: <Send size={15} />,
        glyphColor: '#facc15',
        keywords: ['share', 'one-time', 'link', 'credential', 'vault'],
        hint: 'Share',
        to: '/vault/shared?share=1',
      },
      {
        id: 'vault:act:jit',
        group: 'Actions',
        title: 'Request just-in-time access',
        subtitle: 'Aegis Vault · Time-boxed dynamic lease',
        icon: <Clock size={15} />,
        glyphColor: '#f59e0b',
        keywords: ['jit', 'lease', 'access', 'request', 'break-glass'],
        hint: 'Request',
        to: '/vault/access?new=1',
      },
    ];

    if (caps.isEngineer) {
      entries.push({
        id: 'vault:act:secrets',
        group: 'Actions',
        title: 'Rotate expiring secrets',
        subtitle: 'Aegis Vault · Service secrets & dynamic DB leases',
        icon: <Lock size={15} />,
        glyphColor: '#f59e0b',
        keywords: ['secrets', 'rotate', 'kms', 'database', 'lease'],
        hint: 'Rotate',
        to: '/vault/secrets',
      });
    }

    if (caps.isSecurityAdmin) {
      entries.push({
        id: 'vault:act:audit',
        group: 'Actions',
        title: 'Inspect tamper-evident audit trail',
        subtitle: 'Aegis Vault · SHA-256 hash chain & Watchtower',
        icon: <ShieldAlert size={15} />,
        glyphColor: '#facc15',
        keywords: ['audit', 'sha256', 'hash', 'chain', 'watchtower', 'soc2'],
        hint: 'Inspect',
        to: '/vault/audit',
      });
    }

    // Favorite items by metadata ONLY — never include secretValue, totpSecret, or field values!
    const favs = visibleItemsForViewer(viewer).filter((it) => it.favorite);
    for (const item of favs) {
      entries.push({
        id: `vault:item:${item.id}`,
        group: 'Work',
        title: item.title,
        subtitle: `${item.category.replace('_', ' ').toUpperCase()} · ${item.subtitle}`,
        icon: <KeyRound size={15} />,
        glyphColor: '#facc15',
        keywords: [item.title, item.category, ...item.tags],
        hint: 'Open',
        to: `/vault?item=${item.id}`,
      });
    }

    return entries;
  },

  hygiene(viewer) {
    const caps = getCapabilitiesForViewer(viewer);
    if (!caps.canUseVault) {
      return { score: 0, expiringSoon: 0, stale: 0, exposed: 0, weak: 0 };
    }
    const s = useVault.getState();
    const items = visibleItemsForViewer(viewer);
    const full = computeVaultHygiene(items, s.secrets, s.certificates, Date.now(), caps.isSecurityAdmin);
    return {
      score: full.score,
      expiringSoon: full.expiringSoon,
      stale: full.stale,
      exposed: full.exposed,
      weak: full.weak,
    };
  },

  requestAccess(viewer, input) {
    const caps = getCapabilitiesForViewer(viewer);
    if (!caps.canUseVault) {
      return { ok: false, error: 'You do not have permission to request Aegis Vault access.' };
    }
    const res = useVault.getState().requestJitAccess(
      {
        resource: input.resource,
        reason: input.reason,
        durationMins: input.durationMins,
        source: input.source,
      },
      viewer.user.id,
    );
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
    return {
      ok: true,
      requestId: res.request.id,
      to: `/vault/access?req=${res.request.id}`,
    };
  },

  resetDemo() {
    useVault.getState().resetDemo();
  },
};
