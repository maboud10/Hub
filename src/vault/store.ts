/**
 * Aegis Vault — Zustand Persisted Store (`nexus-vault-v1`)
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { currentViewer, loadBridge, type BridgeSource } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { getCapabilitiesForViewer } from './access';
import {
  advanceJitLifecycle,
  advanceSecretRotation,
  analyzeItemRisks,
  appendAuditEntry,
  askVaultNova,
  computeAuditEntryHash,
  computeVaultHygiene,
  consumeShareLink,
  DAY,
  GENESIS_HASH,
  generateCredential,
  HOUR,
  MINUTE,
  validateJitRequest,
  verifyAuditChain,
} from './engine';
import { randomToken } from './hash';
import { buildVaultSeed, type VaultSeedData } from './seed';
import {
  VAULT_DATA_VERSION,
  type JitAccessRequest,
  type JitResourceKind,
  type NovaVaultAnswer,
  type OneTimeShareLink,
  type ServiceEnvironment,
  type TeamVaultJoinRequest,
  type VaultItem,
  type VaultItemCategory,
  type VaultMemberRole,
} from './types';

const memoryMap = new Map<string, string>();
const safeStorage: Storage = {
  getItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(k);
      }
    } catch {
      // fallback
    }
    return memoryMap.get(k) ?? null;
  },
  setItem: (k, v) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(k, v);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.set(k, v);
  },
  removeItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(k);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.delete(k);
  },
  clear: () => memoryMap.clear(),
  key: (i) => [...memoryMap.keys()][i] ?? null,
  get length() {
    return memoryMap.size;
  },
};

function safeToast(kind: 'success' | 'info' | 'warning' | 'error', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, desc);
  }
}

function activeActorId(explicit?: string): string {
  if (explicit) return explicit;
  try {
    return useHub.getState().sessionUserId || 'u-layla';
  } catch {
    return 'u-layla';
  }
}

export interface VaultState extends VaultSeedData {
  locked: boolean;
  travelMode: boolean;
  selectedItemId: string | null;
  novaOpen: boolean;
  novaHistory: NovaVaultAnswer[];

  setLocked: (locked: boolean, actorId?: string) => void;
  toggleTravelMode: (actorId?: string) => void;
  selectItem: (id: string | null) => void;
  setNovaOpen: (open: boolean) => void;
  toggleFavorite: (itemId: string) => void;

  createItem: (
    input: {
      vaultId?: string;
      category: VaultItemCategory;
      title: string;
      subtitle?: string;
      url?: string;
      username?: string;
      secretValue: string;
      totpSecret?: string;
      tags?: string[];
      travelSafe?: boolean;
    },
    actorId?: string,
  ) => VaultItem;

  rotateItemCredential: (
    itemId: string,
    newSecret?: string,
    method?: 'manual' | 'auto' | 'nova',
    actorId?: string,
  ) => string;

  rotateAllVulnerableItems: (actorId?: string) => number;
  recordItemAccess: (itemId: string, kind: 'reveal' | 'copy', actorId?: string) => void;

  createShareLink: (
    input: {
      itemId: string;
      recipientUserId?: string;
      recipientEmail?: string;
      channel: 'link' | 'chat' | 'mail';
      ttlHours?: number;
      maxViews?: number;
    },
    actorId?: string,
  ) => Promise<OneTimeShareLink | null>;

  consumeShareLinkById: (linkId: string, actorId?: string) => boolean;
  revokeShareLink: (linkId: string, actorId?: string) => void;

  requestTeamVaultJoin: (
    input: { vaultId: string; role: VaultMemberRole; reason: string },
    actorId?: string,
  ) => TeamVaultJoinRequest;
  advanceJoinRequest: (requestId: string, actorId?: string) => void;

  triggerSecretRotation: (secretId: string, actorId?: string) => void;
  completeSecretRotation: (secretId: string, actorId?: string) => void;
  renewDynamicDbLease: (secretId: string, actorId?: string) => void;
  reportSecretExposureToSoc: (secretId: string, actorId?: string) => Promise<string | null>;

  toggleCertAutoRenew: (certId: string) => void;
  advanceCertRenewal: (certId: string, actorId?: string) => void;

  requestJitAccess: (
    input: {
      resource: string;
      resourceKind?: JitResourceKind;
      env?: ServiceEnvironment;
      reason: string;
      durationMins: number;
      isBreakGlass?: boolean;
      incidentCode?: string;
      source?: BridgeSource;
    },
    actorId?: string,
  ) => { ok: true; request: JitAccessRequest } | { ok: false; error: string };

  approveJitRequest: (requestId: string, approverId?: string) => void;
  advanceJitStage: (requestId: string, actorId?: string) => void;
  revokeJitRequest: (requestId: string, actorId?: string) => void;

  simulateAuditTamper: () => void;
  repairAuditChain: () => void;
  askNova: (prompt: string) => NovaVaultAnswer;
  resetDemo: () => void;
}

export const useVault = create<VaultState>()(
  persist(
    (set, get) => {
      const initial = buildVaultSeed();
      return {
        ...initial,
        locked: false,
        travelMode: false,
        selectedItemId: initial.items[0]?.id ?? null,
        novaOpen: false,
        novaHistory: [],

        setLocked: (locked, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          set((s) => ({
            locked,
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: locked ? 'vault.lock' : 'vault.unlock',
              target: 'Aegis Enclave Session',
              detail: locked
                ? 'Vault locked manually; zero-knowledge memory keys zeroed.'
                : 'Biometric FIDO2 passkey ritual verified.',
              ip: '10.44.12.8',
              location: 'Zero-Trust Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'ISO-A.9.4'],
            }),
          }));
          safeToast('info', locked ? 'Vault locked' : 'Vault unlocked', locked ? 'Zero-knowledge session keys cleared' : 'Aegis biometric verification complete');
        },

        toggleTravelMode: (actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const next = !get().travelMode;
          set((s) => ({
            travelMode: next,
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'vault.travel_mode',
              target: 'Travel Mode Border Shield',
              detail: next
                ? 'Enabled Travel Mode — border-sensitive vaults and credentials cloaked.'
                : 'Disabled Travel Mode — full vault inventory restored.',
              ip: '10.44.12.8',
              location: 'Zero-Trust Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'UAE-IA-T4'],
            }),
          }));
          safeToast(
            'info',
            next ? 'Travel mode active' : 'Travel mode disabled',
            next ? 'Sensitive vaults are hidden from local inspection' : 'All vaults restored',
          );
        },

        selectItem: (id) => set({ selectedItemId: id }),
        setNovaOpen: (open) => set({ novaOpen: open }),

        toggleFavorite: (itemId) => {
          set((s) => ({
            items: s.items.map((it) => (it.id === itemId ? { ...it, favorite: !it.favorite } : it)),
          }));
        },

        createItem: (input, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const item: VaultItem = {
            id: `vi-${randomToken(6)}`,
            vaultId: input.vaultId || 'personal',
            ownerId: actor,
            category: input.category,
            title: input.title.trim(),
            subtitle: input.subtitle?.trim() || `${input.category.toUpperCase()} · Zero-Knowledge Item`,
            url: input.url?.trim() || undefined,
            username: input.username?.trim() || undefined,
            secretValue: input.secretValue,
            totpSecret: input.totpSecret?.trim() || undefined,
            fields: [],
            tags: input.tags?.length ? input.tags : ['Encrypted'],
            favorite: false,
            travelSafe: input.travelSafe ?? true,
            twoFactorSupported: Boolean(input.totpSecret),
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
            passwordUpdatedAt: now,
            rotationHistory: [{ at: now, by: actor, method: 'manual' }],
          };
          set((s) => ({
            items: [item, ...s.items],
            selectedItemId: item.id,
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'item.create',
              target: item.title,
              detail: `Sealed new ${item.category} item in ${item.vaultId === 'personal' ? 'Personal Vault' : item.vaultId}.`,
              ip: '10.44.12.8',
              location: 'Dubai HQ · Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'GDPR-Art32'],
            }),
          }));
          safeToast('success', 'Credential sealed in Aegis', item.title);
          return item;
        },

        rotateItemCredential: (itemId, newSecret, method = 'manual', actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const generated =
            newSecret ||
            generateCredential({
              mode: 'password',
              length: 24,
              uppercase: true,
              lowercase: true,
              digits: true,
              symbols: true,
              wordCount: 5,
              separator: '-',
            }).value;

          let targetTitle = itemId;
          set((s) => ({
            items: s.items.map((it) => {
              if (it.id !== itemId) return it;
              targetTitle = it.title;
              return {
                ...it,
                secretValue: generated,
                compromised: false,
                updatedAt: now,
                passwordUpdatedAt: now,
                expiresAt: it.expiresAt ? now + 90 * DAY : undefined,
                rotationHistory: [{ at: now, by: actor, method }, ...it.rotationHistory],
              };
            }),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'item.rotate',
              target: targetTitle,
              detail: `Rotated credential via ${method} generator (24-char high-entropy key).`,
              ip: '10.44.12.8',
              location: 'Dubai HQ · Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'ISO-A.9.4'],
            }),
          }));
          safeToast('success', 'Credential rotated', targetTitle);
          return generated;
        },

        rotateAllVulnerableItems: (actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const s = get();
          let rotatedCount = 0;
          const nextItems = s.items.map((it) => {
            const risks = analyzeItemRisks(it, s.items, now);
            if (
              risks.includes('exposed') ||
              risks.includes('reused') ||
              risks.includes('weak') ||
              risks.includes('expiring')
            ) {
              rotatedCount++;
              const nextVal = generateCredential({
                mode: 'password',
                length: 24,
                uppercase: true,
                lowercase: true,
                digits: true,
                symbols: true,
                wordCount: 5,
                separator: '-',
              }).value;
              return {
                ...it,
                secretValue: nextVal,
                compromised: false,
                updatedAt: now,
                passwordUpdatedAt: now,
                expiresAt: it.expiresAt ? now + 90 * DAY : undefined,
                rotationHistory: [{ at: now, by: actor, method: 'nova' as const }, ...it.rotationHistory],
              };
            }
            return it;
          });
          if (rotatedCount > 0) {
            set((curr) => ({
              items: nextItems,
              auditLog: appendAuditEntry(curr.auditLog, {
                at: now,
                actorId: actor,
                action: 'item.rotate',
                target: `Batch Watchtower Remediation (${rotatedCount} items)`,
                detail: `Nova rotated ${rotatedCount} exposed/reused/weak credentials to unique 24-char plasma keys.`,
                ip: '10.44.12.8',
                location: 'Aegis Nova Enclave',
                severity: 'info',
                controls: ['SOC2-CC6.1', 'ISO-A.9.4', 'UAE-IA-T4'],
              }),
            }));
            safeToast('success', 'Watchtower remediation complete', `Rotated ${rotatedCount} vulnerable credentials`);
          }
          return rotatedCount;
        },

        recordItemAccess: (itemId, kind, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const item = get().items.find((i) => i.id === itemId);
          if (!item) return;
          set((s) => ({
            items: s.items.map((i) => (i.id === itemId ? { ...i, lastUsedAt: now } : i)),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: kind === 'reveal' ? 'item.reveal' : 'item.copy',
              target: item.title,
              detail:
                kind === 'reveal'
                  ? 'Decrypted masked secret field via hold-to-reveal.'
                  : 'Copied credential to clipboard (30s auto-scrub armed).',
              ip: '10.44.12.8',
              location: 'Zero-Trust Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1'],
            }),
          }));
        },

        createShareLink: async (input, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const item = get().items.find((i) => i.id === input.itemId);
          if (!item) return null;
          const token = `otk_${randomToken(10)}`;
          const ttlHours = input.ttlHours ?? 24;
          const link: OneTimeShareLink = {
            id: `shl-${randomToken(6)}`,
            token,
            itemId: item.id,
            itemTitle: item.title,
            createdBy: actor,
            recipientUserId: input.recipientUserId,
            recipientEmail: input.recipientEmail,
            channel: input.channel,
            createdAt: now,
            expiresAt: now + ttlHours * HOUR,
            maxViews: input.maxViews ?? 1,
            views: 0,
            status: 'active',
          };

          set((s) => ({
            shareLinks: [link, ...s.shareLinks],
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'share.create',
              target: item.title,
              detail: `Created ${link.maxViews}-view expiring link (${token}) via ${input.channel}.`,
              ip: '10.44.12.8',
              location: 'Dubai HQ · Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'ISO-A.9.4'],
            }),
          }));

          const viewer = currentViewer();
          if (viewer && input.channel === 'chat' && input.recipientUserId) {
            try {
              const chat = await loadBridge('chat');
              chat.sendDirect(viewer, {
                toUserId: input.recipientUserId,
                text: `Shared a self-destructing Aegis Vault link for "${item.title}" (expires after ${link.maxViews} view or ${ttlHours}h): https://vault.helix.co/s/${token}`,
                card: {
                  app: 'vault',
                  title: item.title,
                  subtitle: `One-time link · ${token}`,
                  to: '/vault/shared',
                  status: '1-View Sealed',
                },
              });
            } catch {
              // ignore bridge failure
            }
          } else if (viewer && input.channel === 'mail' && (input.recipientUserId || input.recipientEmail)) {
            try {
              const mail = await loadBridge('mail');
              mail.sendMail(viewer, {
                to: [input.recipientUserId || input.recipientEmail || ''],
                subject: `[Aegis Vault] One-time credential link: ${item.title}`,
                body: `A zero-knowledge one-time link has been sealed for you.\n\nCredential: ${item.title}\nToken: ${token}\nPolicy: Self-destructs after ${link.maxViews} view(s) or ${ttlHours} hours.\n\nOpen in Aegis Vault: /vault/shared`,
                source: { app: 'vault', label: 'Aegis Vault · One-Time Share', to: '/vault/shared' },
              });
            } catch {
              // ignore bridge failure
            }
          }

          safeToast('success', 'One-time link sealed', `Token ${token} ready`);
          return link;
        },

        consumeShareLinkById: (linkId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const target = get().shareLinks.find((l) => l.id === linkId);
          if (!target) return false;
          const res = consumeShareLink(target, now);
          set((s) => ({
            shareLinks: s.shareLinks.map((l) => (l.id === linkId ? res.link : l)),
            auditLog: res.ok
              ? appendAuditEntry(s.auditLog, {
                  at: now,
                  actorId: actor,
                  action: 'share.consume',
                  target: target.itemTitle,
                  detail: `Consumed one-time share token ${target.token} (${res.link.views}/${res.link.maxViews} views).`,
                  ip: '10.44.12.8',
                  location: 'Zero-Trust Enclave',
                  severity: 'info',
                  controls: ['SOC2-CC6.1'],
                })
              : s.auditLog,
          }));
          if (res.ok) {
            safeToast('info', 'One-time link consumed', 'Link has self-destructed after single view');
          } else {
            safeToast('warning', 'Link unavailable', res.error);
          }
          return res.ok;
        },

        revokeShareLink: (linkId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const target = get().shareLinks.find((l) => l.id === linkId);
          if (!target) return;
          set((s) => ({
            shareLinks: s.shareLinks.map((l) => (l.id === linkId ? { ...l, status: 'revoked' } : l)),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'share.revoke',
              target: target.itemTitle,
              detail: `Revoked one-time share link ${target.token}.`,
              ip: '10.44.12.8',
              location: 'Zero-Trust Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1'],
            }),
          }));
          safeToast('info', 'Share link revoked', target.token);
        },

        requestTeamVaultJoin: (input, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const req: TeamVaultJoinRequest = {
            id: `vjr-${randomToken(5)}`,
            vaultId: input.vaultId,
            userId: actor,
            role: input.role,
            reason: input.reason.trim() || 'Cross-team operational collaboration',
            stageIndex: 1,
            state: 'active',
            requestedAt: now,
          };
          set((s) => ({
            joinRequests: [req, ...s.joinRequests],
          }));
          safeToast('success', 'Vault access requested', 'Routing through Manager Review → Key Escrow');
          return req;
        },

        advanceJoinRequest: (requestId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const req = get().joinRequests.find((r) => r.id === requestId);
          if (!req) return;
          const nextStage = Math.min(4, req.stageIndex + 1);
          const done = nextStage >= 4;
          set((s) => ({
            joinRequests: s.joinRequests.map((r) =>
              r.id === requestId
                ? { ...r, stageIndex: nextStage, state: done ? 'done' : 'active', approvedBy: actor }
                : r,
            ),
            teamVaults: done
              ? s.teamVaults.map((tv) =>
                  tv.id === req.vaultId && !tv.members.some((m) => m.userId === req.userId)
                    ? {
                        ...tv,
                        members: [...tv.members, { userId: req.userId, role: req.role, addedAt: now }],
                      }
                    : tv,
                )
              : s.teamVaults,
          }));
          safeToast('success', done ? 'Team vault access granted' : 'Approval stage advanced');
        },

        triggerSecretRotation: (secretId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const target = get().secrets.find((sec) => sec.id === secretId);
          if (!target) return;
          const updated = advanceSecretRotation(target, now);
          set((s) => ({
            secrets: s.secrets.map((sec) => (sec.id === secretId ? updated : sec)),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'secret.rotate',
              target: target.path,
              detail:
                updated.rotationStage >= 5
                  ? `Completed 5-stage rotation → v${updated.version} (${updated.maskedPreview}).`
                  : `Advanced secret rotation to stage ${updated.rotationStage + 1}/5.`,
              ip: '10.44.12.8',
              location: 'Aegis KMS Controller',
              severity: 'info',
              controls: ['SOC2-CC6.2', 'ISO-A.9.4'],
            }),
          }));
          safeToast(
            'success',
            updated.rotationStage >= 5 ? `Rotated to v${updated.version}` : 'Rotation stage advanced',
            target.path,
          );
        },

        completeSecretRotation: (secretId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const target = get().secrets.find((sec) => sec.id === secretId);
          if (!target) return;
          const suffix = randomToken(4);
          const nextVer = target.version + 1;
          set((s) => ({
            secrets: s.secrets.map((sec) =>
              sec.id === secretId
                ? {
                    ...sec,
                    version: nextVer,
                    maskedPreview: `aegis_v${nextVer}_••••_${suffix}`,
                    lastRotatedAt: now,
                    nextRotationAt: now + sec.rotationDays * DAY,
                    rotationStage: 5,
                    status: 'healthy',
                    exposedInRepo: undefined,
                  }
                : sec,
            ),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'secret.rotate',
              target: target.path,
              detail: `Executed full 5-stage zero-downtime rotation → v${nextVer}. Old lease revoked.`,
              ip: '10.44.12.8',
              location: 'Aegis KMS Controller',
              severity: 'info',
              controls: ['SOC2-CC6.2', 'ISO-A.9.4'],
            }),
          }));
          safeToast('success', `Zero-downtime rotation complete (v${nextVer})`, target.path);
        },

        renewDynamicDbLease: (secretId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          set((s) => ({
            secrets: s.secrets.map((sec) =>
              sec.id === secretId && sec.dynamicDb
                ? {
                    ...sec,
                    dynamicDb: {
                      ...sec.dynamicDb,
                      leaseExpiresAt: now + sec.dynamicDb.leaseTtlMins * MINUTE,
                      lastLeaseUser: `jit_${actor.replace('u-', '')}_${randomToken(4)}`,
                    },
                  }
                : sec,
            ),
          }));
          safeToast('success', 'Dynamic DB lease renewed');
        },

        reportSecretExposureToSoc: async (secretId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const sec = get().secrets.find((x) => x.id === secretId);
          if (!sec || !sec.exposedInRepo) return null;
          const exposedRepo = sec.exposedInRepo.repo;
          let caseId = `SOC-${randomToken(4).toUpperCase()}`;
          const viewer = currentViewer();
          if (viewer) {
            try {
              const security = await loadBridge('security');
              const res = security.reportSignal(viewer, {
                kind: 'secret_exposure',
                title: `Leaked secret in ${exposedRepo}: ${sec.keyName}`,
                detail: `Aegis secret scanner flagged ${sec.path} in commit ${sec.exposedInRepo.commit}.`,
                severity: 'critical',
                source: { app: 'vault', label: 'Aegis Vault · Secret Scanner', to: '/vault/secrets' },
              });
              if (res.ok) caseId = res.caseId;
            } catch {
              // fallback caseId
            }
          }
          set((s) => ({
            secrets: s.secrets.map((item) =>
              item.id === secretId && item.exposedInRepo
                ? { ...item, exposedInRepo: { ...item.exposedInRepo, reportedCaseId: caseId } }
                : item,
            ),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'secret.expose_report',
              target: sec.path,
              detail: `Escalated exposed secret in ${exposedRepo} to Bastion SOC (${caseId}).`,
              ip: '10.44.12.8',
              location: 'Aegis SOC Bridge',
              severity: 'critical',
              controls: ['SOC2-CC6.2', 'UAE-IA-T4'],
            }),
          }));
          safeToast('warning', 'Escalated to Security Center', `Case ${caseId} opened in Bastion SOC`);
          return caseId;
        },

        toggleCertAutoRenew: (certId) => {
          set((s) => ({
            certificates: s.certificates.map((c) => (c.id === certId ? { ...c, autoRenew: !c.autoRenew } : c)),
          }));
          safeToast('info', 'ACME auto-renew updated');
        },

        advanceCertRenewal: (certId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const cert = get().certificates.find((c) => c.id === certId);
          if (!cert) return;
          const nextStage = cert.stageIndex >= 4 ? 1 : cert.stageIndex + 1;
          const done = nextStage >= 4;
          set((s) => ({
            certificates: s.certificates.map((c) =>
              c.id === certId
                ? {
                    ...c,
                    stageIndex: nextStage,
                    status: done ? 'valid' : 'renewing',
                    issuedAt: done ? now : c.issuedAt,
                    expiresAt: done ? now + 90 * DAY : c.expiresAt,
                  }
                : c,
            ),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'cert.renew',
              target: cert.domain,
              detail: done
                ? `Issued and deployed renewed ${cert.algorithm} certificate to edge mTLS mesh.`
                : `Advanced ACME certificate renewal to stage ${nextStage}/4.`,
              ip: '10.44.12.8',
              location: 'Aegis PKI Authority',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'ISO-A.9.4'],
            }),
          }));
          safeToast('success', done ? `Certificate deployed for ${cert.domain}` : 'ACME renewal stage advanced');
        },

        requestJitAccess: (input, actorId) => {
          const actor = activeActorId(actorId);
          const check = validateJitRequest(input);
          if (!check.valid) {
            return { ok: false, error: check.error || 'Invalid JIT request.' };
          }
          const now = Date.now();
          const isBg = Boolean(input.isBreakGlass);
          const tokenSuffix = randomToken(6);
          const req: JitAccessRequest = {
            id: `jit-${randomToken(5)}`,
            requesterId: actor,
            resource: input.resource.trim(),
            resourceKind: isBg ? 'break_glass' : input.resourceKind || 'secret',
            env: input.env || 'production',
            reason: input.reason.trim(),
            durationMins: input.durationMins,
            requestedAt: now,
            approvedAt: isBg ? now : undefined,
            approverId: isBg ? actor : undefined,
            expiresAt: isBg ? now + input.durationMins * MINUTE : undefined,
            stageIndex: isBg ? 3 : 0,
            status: isBg ? 'active' : 'pending',
            isBreakGlass: isBg,
            incidentCode: input.incidentCode,
            source: input.source,
            leaseCredentials: isBg
              ? {
                  username: `jit_bg_${actor.replace('u-', '')}`,
                  maskedToken: `aegis_bg_••••_${tokenSuffix}`,
                  connectionUri: `${input.resource.trim()}?break_glass=true&ttl=${input.durationMins}m`,
                }
              : undefined,
          };

          set((s) => ({
            jitRequests: [req, ...s.jitRequests],
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: isBg ? 'jit.break_glass' : 'jit.request',
              target: req.resource,
              detail: isBg
                ? `EMERGENCY BREAK-GLASS lease activated (${req.durationMins}m): ${req.reason}`
                : `Requested ${req.durationMins}m JIT lease: ${req.reason}`,
              ip: '10.44.12.8',
              location: 'Zero-Trust Enclave',
              severity: isBg ? 'critical' : 'info',
              controls: isBg ? ['SOC2-CC6.2', 'ISO-A.9.4', 'UAE-IA-T4'] : ['SOC2-CC6.1', 'SOC2-CC6.2'],
              anomaly: isBg ? 'break_glass' : undefined,
            }),
          }));

          if (isBg) {
            const viewer = currentViewer();
            if (viewer) {
              loadBridge('security')
                .then((sec) =>
                  sec.reportSignal(viewer, {
                    kind: 'other',
                    title: `Break-Glass Vault Override: ${req.resource}`,
                    detail: `${viewer.user.name} activated a ${req.durationMins}m break-glass lease. Reason: ${req.reason}`,
                    severity: 'critical',
                    source: { app: 'vault', label: 'Aegis Break-Glass', to: '/vault/access' },
                  }),
                )
                .catch(() => {});
              loadBridge('chat')
                .then((chat) => {
                  const chans = chat.listChannels(viewer);
                  const targetChan = chans.find((c) => c.name.includes('security') || c.name.includes('eng')) ?? chans[0];
                  if (targetChan) {
                    chat.postToChannel(viewer, {
                      channelId: targetChan.id,
                      text: `🚨 **Break-Glass Emergency Lease Activated** on \`${req.resource}\` (${req.durationMins}m TTL) — Reason: ${req.reason}`,
                      asBot: true,
                      card: {
                        app: 'vault',
                        title: `Break-Glass · ${req.resource}`,
                        subtitle: `${req.durationMins}m emergency lease`,
                        to: '/vault/access',
                        status: 'Break-Glass Active',
                      },
                    });
                  }
                })
                .catch(() => {});
            }
            safeToast('warning', 'Break-glass lease active', 'Security Center & Pulse Chat notified');
          } else {
            safeToast('success', 'JIT access requested', `${req.resource} (${req.durationMins}m)`);
          }

          return { ok: true, request: req };
        },

        approveJitRequest: (requestId, approverId) => {
          const actor = activeActorId(approverId);
          const now = Date.now();
          const target = get().jitRequests.find((r) => r.id === requestId);
          if (!target) return;
          const updated = advanceJitLifecycle(target, actor, now);
          set((s) => ({
            jitRequests: s.jitRequests.map((r) => (r.id === requestId ? updated : r)),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'jit.approve',
              target: target.resource,
              detail: `Approved ${target.durationMins}m JIT lease for ${target.requesterId} (${updated.leaseCredentials?.username ?? 'lease'}).`,
              ip: '10.44.12.8',
              location: 'Dubai HQ · Enclave',
              severity: 'info',
              controls: ['SOC2-CC6.1', 'SOC2-CC6.2', 'ISO-A.9.4'],
            }),
          }));
          safeToast('success', 'Dynamic lease issued', target.resource);
        },

        advanceJitStage: (requestId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const target = get().jitRequests.find((r) => r.id === requestId);
          if (!target) return;
          if (target.stageIndex === 0) {
            get().approveJitRequest(requestId, actor);
            return;
          }
          const nextStage = Math.min(5, target.stageIndex + 1);
          const done = nextStage >= 4;
          set((s) => ({
            jitRequests: s.jitRequests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    stageIndex: done ? 5 : nextStage,
                    status: done ? 'expired' : 'active',
                    revokedAt: done ? now : r.revokedAt,
                  }
                : r,
            ),
          }));
          safeToast('info', done ? 'JIT lease auto-revoked & audited' : 'JIT session stage advanced');
        },

        revokeJitRequest: (requestId, actorId) => {
          const actor = activeActorId(actorId);
          const now = Date.now();
          const target = get().jitRequests.find((r) => r.id === requestId);
          if (!target) return;
          set((s) => ({
            jitRequests: s.jitRequests.map((r) =>
              r.id === requestId
                ? { ...r, status: 'revoked', stageIndex: 5, revokedAt: now }
                : r,
            ),
            auditLog: appendAuditEntry(s.auditLog, {
              at: now,
              actorId: actor,
              action: 'jit.revoke',
              target: target.resource,
              detail: `Revoked active JIT lease ${target.leaseCredentials?.username ?? target.id} early.`,
              ip: '10.44.12.8',
              location: 'Zero-Trust Enclave',
              severity: 'warning',
              controls: ['SOC2-CC6.2', 'ISO-A.9.4'],
            }),
          }));
          safeToast('info', 'JIT lease revoked', target.resource);
        },

        simulateAuditTamper: () => {
          set((s) => {
            if (s.auditLog.length < 2) return s;
            const copy = [...s.auditLog];
            const idx = Math.max(0, copy.length - 2);
            copy[idx] = {
              ...copy[idx],
              detail: `${copy[idx].detail} [UNAUTHORIZED-MUTATION]`,
            };
            return { auditLog: copy };
          });
          safeToast('error', 'Simulated tamper injected', 'SHA-256 chain verifier flagged broken block');
        },

        repairAuditChain: () => {
          set((s) => {
            const ordered = [...s.auditLog].sort((a, b) => a.seq - b.seq);
            let prevHash = GENESIS_HASH;
            const repaired = ordered.map((entry, idx) => {
              const cleanDetail = entry.detail.replace(' [UNAUTHORIZED-MUTATION]', '');
              const draft = {
                ...entry,
                seq: idx + 1,
                detail: cleanDetail,
                prevHash,
              };
              const hash = computeAuditEntryHash(draft);
              prevHash = hash;
              return { ...draft, hash };
            });
            return { auditLog: repaired };
          });
          safeToast('success', 'SHA-256 hash chain re-sealed', 'All blocks verified against Genesis');
        },

        askNova: (prompt) => {
          const now = Date.now();
          const s = get();
          const caps = getCapabilitiesForViewer(currentViewer());
          const hygiene = computeVaultHygiene(s.items, s.secrets, s.certificates, now, caps.isSecurityAdmin);
          const chainStatus = verifyAuditChain(s.auditLog);
          const ans = askVaultNova(prompt, {
            hygiene,
            secrets: s.secrets,
            certs: s.certificates,
            jitRequests: s.jitRequests,
            chainStatus,
            now,
          });
          set((curr) => ({
            novaHistory: [ans, ...curr.novaHistory.slice(0, 7)],
          }));
          return ans;
        },

        resetDemo: () => {
          const fresh = buildVaultSeed(Date.now());
          set({
            ...fresh,
            locked: false,
            travelMode: false,
            selectedItemId: fresh.items[0]?.id ?? null,
            novaHistory: [],
          });
          safeToast('info', 'Vault demo data reset');
        },
      };
    },
    {
      name: 'nexus-vault-v1',
      version: VAULT_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: () => ({
        ...buildVaultSeed(Date.now()),
        locked: false,
        travelMode: false,
        selectedItemId: 'vi-root-passkey',
        novaOpen: false,
        novaHistory: [],
      }),
    },
  ),
);
