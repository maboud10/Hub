/**
 * Stratos · Cloud Console — persisted Zustand store (`nexus-cloud-v1`).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import {
  effectiveResources,
  estimateProvisionMonthlyUsd,
  evaluateProvisionPolicies,
  rightsizeStepDown,
} from './engine';
import {
  CLOUD_DATA_VERSION,
  FINOPS_CONTACT_ID,
  TEAM_BY_ID,
  buildCloudSeed,
  buildSeedStory,
} from './seed';
import type {
  CloudData,
  ProvisionRequest,
  ProvisionSpec,
  ServiceId,
  Story,
} from './types';

export interface CloudActions {
  story: Story;
  acknowledgeAlert: (alertId: string, by?: string) => void;
  silenceAlert: (alertId: string, mins?: number, by?: string) => void;
  toggleAlertRule: (ruleId: string) => void;
  acknowledgeAnomaly: (anomalyId: string, by?: string) => void;
  resolveAnomaly: (anomalyId: string, by?: string) => void;
  applyRecommendation: (recId: string, by?: string) => void;
  dismissRecommendation: (recId: string, by?: string) => void;
  rightsizeResource: (resourceId: string, by?: string) => void;
  reconcileDrift: (resourceId: string) => void;
  fixResourceTags: (resourceId: string) => void;
  submitProvisionRequest: (spec: ProvisionSpec, requesterId?: string) => ProvisionRequest;
  completeProvisionRequest: (requestId: string) => void;
  cancelProvisionRequest: (requestId: string) => void;
  shiftBatchJob: (jobId: string, startHourUtc: number, by?: string) => void;
  recoverStory: () => void;
  retriggerStory: () => void;
  escalateToIncident: (input: {
    title: string;
    severity: 'SEV1' | 'SEV2' | 'SEV3';
    services: ServiceId[];
    summary?: string;
    alertId?: string;
  }) => Promise<{ ok: boolean; to?: string }>;
  createFollowUpTask: (input: {
    title: string;
    notes?: string;
    recId?: string;
    anomalyId?: string;
  }) => Promise<{ ok: boolean; to?: string }>;
  reportDriftToSecurity: (resourceId: string) => Promise<{ ok: boolean; to?: string }>;
  requestVaultLease: (resourceName: string, reason?: string) => Promise<{ ok: boolean; to?: string }>;
  notifyFinance: (summaryText?: string) => Promise<void>;
  resetDemo: () => void;
}

export type CloudStore = CloudData & CloudActions;

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

export const useCloud = create<CloudStore>()(
  persist(
    (set, get) => ({
      ...buildCloudSeed(),
      story: buildSeedStory(),

      acknowledgeAlert: (alertId, by = 'u-lucas') => {
        set((s) => ({
          alerts: {
            ...s.alerts,
            [alertId]: { status: 'acknowledged', at: Date.now(), by },
          },
        }));
        safeToast('info', 'Alert acknowledged', 'On-call responder recorded.');
      },

      silenceAlert: (alertId, mins = 60, by = 'u-lucas') => {
        const now = Date.now();
        set((s) => ({
          alerts: {
            ...s.alerts,
            [alertId]: { status: 'silenced', at: now, by, until: now + mins * 60_000 },
          },
        }));
        safeToast('info', 'Alert silenced', `Muted for ${mins} minutes.`);
      },

      toggleAlertRule: (ruleId) => {
        set((s) => {
          const cur = s.rules[ruleId] ?? true;
          return { rules: { ...s.rules, [ruleId]: !cur } };
        });
      },

      acknowledgeAnomaly: (anomalyId, by = 'u-grace') => {
        set((s) => ({
          anomalies: {
            ...s.anomalies,
            [anomalyId]: { status: 'acknowledged', at: Date.now(), by },
          },
        }));
        safeToast('info', 'Anomaly acknowledged', 'Logged in FinOps review queue.');
      },

      resolveAnomaly: (anomalyId, by = 'u-omar') => {
        set((s) => {
          const nextPatches = { ...s.patches };
          if (anomalyId === 'an-gpu') {
            nextPatches['nb-embeddings-lab'] = {
              ...(nextPatches['nb-embeddings-lab'] ?? {}),
              status: 'idle',
              monthlyUsd: 0,
            };
          }
          return {
            patches: nextPatches,
            anomalies: {
              ...s.anomalies,
              [anomalyId]: { status: 'resolved', at: Date.now(), by },
            },
          };
        });
        safeToast('success', 'Cost anomaly remediated', 'Run-rate forecast updated.');
      },

      applyRecommendation: (recId, by = 'u-omar') => {
        const s = get();
        const resources = effectiveResources(s);
        const nextPatches = { ...s.patches };

        if (recId.startsWith('rec-rs-')) {
          const resId = recId.replace('rec-rs-', '');
          const res = resources.find((r) => r.id === resId);
          if (res) {
            const step = rightsizeStepDown(res);
            if (step) {
              nextPatches[resId] = {
                ...(nextPatches[resId] ?? {}),
                size: step.nextSize,
                monthlyUsd: step.nextMonthlyUsd,
                cpu: Math.min(0.62, (res.cpu ?? 0.25) * 1.65),
              };
            }
          }
        } else if (recId === 'rec-idle-nb') {
          nextPatches['nb-embeddings-lab'] = {
            ...(nextPatches['nb-embeddings-lab'] ?? {}),
            monthlyUsd: 0,
            detail: 'Stopped via FinOps recommendation · auto-stop enabled',
          };
        } else if (recId === 'rec-tiering') {
          nextPatches['helix-mail-attachments'] = {
            ...(nextPatches['helix-mail-attachments'] ?? {}),
            monthlyUsd: 540,
            detail: 'S3 Intelligent-Tiering enabled · archiving >90d objects',
          };
        }

        set({
          patches: nextPatches,
          recs: {
            ...s.recs,
            [recId]: { status: 'applied', at: Date.now(), by },
          },
        });
        safeToast('success', 'Recommendation applied', 'Monthly spend and carbon forecast reduced.');
      },

      dismissRecommendation: (recId, by = 'u-omar') => {
        set((s) => ({
          recs: {
            ...s.recs,
            [recId]: { status: 'dismissed', at: Date.now(), by },
          },
        }));
      },

      rightsizeResource: (resourceId, by = 'u-omar') => {
        const s = get();
        const res = effectiveResources(s).find((r) => r.id === resourceId);
        if (!res) return;
        const step = rightsizeStepDown(res);
        if (!step) return;
        set({
          patches: {
            ...s.patches,
            [resourceId]: {
              ...(s.patches[resourceId] ?? {}),
              size: step.nextSize,
              monthlyUsd: step.nextMonthlyUsd,
              cpu: Math.min(0.62, (res.cpu ?? 0.25) * 1.65),
            },
          },
          recs: {
            ...s.recs,
            [`rec-rs-${resourceId}`]: { status: 'applied', at: Date.now(), by },
          },
        });
        safeToast('success', 'Resource rightsized', `${res.name} resized to ${step.nextSize} (-$${step.savingsUsd}/mo).`);
      },

      reconcileDrift: (resourceId) => {
        set((s) => ({
          patches: {
            ...s.patches,
            [resourceId]: {
              ...(s.patches[resourceId] ?? {}),
              drift: [],
            },
          },
        }));
        safeToast('success', 'Terraform drift reconciled', 'Live resource state aligned with Git manifest.');
      },

      fixResourceTags: (resourceId) => {
        const s = get();
        const res = effectiveResources(s).find((r) => r.id === resourceId);
        if (!res) return;
        const teamDef = TEAM_BY_ID[res.team];
        set({
          patches: {
            ...s.patches,
            [resourceId]: {
              ...(s.patches[resourceId] ?? {}),
              tags: {
                team: res.team,
                env: res.tags.env || 'production',
                'cost-center': res.tags['cost-center'] || teamDef.costCenter,
                owner: res.tags.owner || 'omar.khalid',
                ...res.tags,
              },
            },
          },
        });
        safeToast('success', 'Showback tags applied', `All required tags reconciled on ${res.name}.`);
      },

      submitProvisionRequest: (spec, requesterId = 'u-priya') => {
        const checks = evaluateProvisionPolicies(spec);
        const monthlyUsd = estimateProvisionMonthlyUsd(spec);
        const needsApproval = checks.some((c) => c.outcome === 'warn');
        const hasFail = checks.some((c) => c.outcome === 'fail');
        const req: ProvisionRequest = {
          id: `req-${Date.now().toString(36)}`,
          spec,
          createdAt: Date.now(),
          requesterId,
          monthlyUsd,
          checks,
          needsApproval,
          approverId: TEAM_BY_ID[spec.team].leadId,
          stageMs: [2500, 3000, 3500, 4000],
          vaultPath: `vault://cloud/${spec.team}/${spec.region}/${spec.name}`,
          delivered: false,
        };
        set((s) => ({ requests: [req, ...s.requests] }));
        if (hasFail) {
          safeToast('warning', 'Policy guardrail blocked request', 'Fix failing security or residency checks to proceed.');
        } else {
          safeToast('success', 'Provisioning started', `${spec.name} queued in ${spec.region}.`);
        }
        return req;
      },

      completeProvisionRequest: (requestId) => {
        set((s) => ({
          requests: s.requests.map((r) => (r.id === requestId ? { ...r, delivered: true, cancelled: false } : r)),
        }));
        safeToast('success', 'Resource live & monitored', 'Terraform apply finished and credentials sealed in Vault.');
      },

      cancelProvisionRequest: (requestId) => {
        set((s) => ({
          requests: s.requests.map((r) => (r.id === requestId ? { ...r, cancelled: true } : r)),
        }));
        safeToast('info', 'Provisioning cancelled', 'Terraform plan discarded.');
      },

      shiftBatchJob: (jobId, startHourUtc, by = 'u-kwame') => {
        set((s) => ({
          schedules: {
            ...s.schedules,
            [jobId]: { startHourUtc, at: Date.now(), by },
          },
        }));
        safeToast('success', 'Batch schedule shifted', `Moved to ${String(startHourUtc).padStart(2, '0')}:00 UTC low-carbon window.`);
      },

      recoverStory: () => {
        set((s) => ({
          story: { ...s.story, recoveredAt: Date.now() },
        }));
        safeToast('success', 'payments-svc rolled back to v2.40.9', 'Latency in eu-west-2 restored to 240ms baseline.');
      },

      retriggerStory: () => {
        set({ story: buildSeedStory() });
        safeToast('info', 'Regression simulation active', 'payments-svc v2.41.0 latency spike active in eu-west-2.');
      },

      escalateToIncident: async ({ title, severity, services, summary, alertId }) => {
        const viewer = currentViewer();
        let to = '/incidents?declare=1';
        let code = 'INC-2048';
        try {
          if (viewer) {
            const bridge = await loadBridge('incidents');
            const res = bridge.declare(viewer, {
              title,
              severity,
              services,
              summary,
              source: { app: 'cloud', label: 'Stratos Cloud Console', to: '/cloud/observability' },
            });
            if (res.ok) {
              to = res.to;
              code = res.incidentId;
            }
          }
        } catch {
          // graceful fallback
        }
        const now = Date.now();
        set((s) => ({
          declared: { ...s.declared, [alertId ?? title]: { incidentId: code, to, at: now } },
          alerts: alertId
            ? {
                ...s.alerts,
                [alertId]: {
                  status: 'sent',
                  at: now,
                  by: viewer?.user.id ?? 'u-lucas',
                  incidentTo: to,
                  incidentCode: code,
                },
              }
            : s.alerts,
        }));
        safeToast('success', 'Escalated to Incident Command', `${severity} · ${title}`);
        return { ok: true, to };
      },

      createFollowUpTask: async ({ title, notes, recId, anomalyId }) => {
        const viewer = currentViewer();
        let to = '/projects';
        try {
          if (viewer) {
            const bridge = await loadBridge('projects');
            const res = bridge.createTask(viewer, {
              title,
              notes,
              source: { app: 'cloud', label: 'Stratos FinOps', to: '/cloud/finops' },
            });
            if (res.ok) to = res.to;
          }
        } catch {
          // graceful fallback
        }
        const now = Date.now();
        const by = viewer?.user.id ?? 'u-omar';
        set((s) => ({
          recs: recId ? { ...s.recs, [recId]: { status: 'task', at: now, by, taskTo: to } } : s.recs,
          anomalies: anomalyId ? { ...s.anomalies, [anomalyId]: { status: 'acknowledged', at: now, by, taskTo: to } } : s.anomalies,
        }));
        safeToast('success', 'Task created in Projects', title);
        return { ok: true, to };
      },

      reportDriftToSecurity: async (resourceId) => {
        const viewer = currentViewer();
        const res = effectiveResources(get()).find((r) => r.id === resourceId);
        let to = '/security';
        try {
          if (viewer && res) {
            const bridge = await loadBridge('security');
            const out = bridge.reportSignal(viewer, {
              kind: 'misconfiguration',
              title: `Terraform drift on ${res.name} (${res.region})`,
              detail: res.drift?.map((d) => `${d.field}: code=${d.code}, live=${d.live}`).join('; '),
              severity: 'high',
              source: { app: 'cloud', label: 'Stratos Drift Guard', to: '/cloud/clusters' },
            });
            if (out.ok) to = out.to;
          }
        } catch {
          // fallback
        }
        safeToast('info', 'Forwarded to Security Center', `Misconfiguration signal logged for ${res?.name ?? resourceId}.`);
        return { ok: true, to };
      },

      requestVaultLease: async (resourceName, reason = 'Production database inspection & index migration') => {
        const viewer = currentViewer();
        let to = '/vault/access?new=1';
        try {
          if (viewer) {
            const bridge = await loadBridge('vault');
            const out = bridge.requestAccess(viewer, {
              resource: resourceName,
              reason,
              durationMins: 120,
              source: { app: 'cloud', label: 'Stratos Cloud Console', to: '/cloud/clusters' },
            });
            if (out.ok) to = out.to;
          }
        } catch {
          // fallback
        }
        safeToast('success', 'JIT lease requested in Vault', `${resourceName} · 120m window`);
        return { ok: true, to };
      },

      notifyFinance: async (summaryText) => {
        const viewer = currentViewer();
        const body =
          summaryText ??
          'Monthly cloud spend forecast and active anomaly remediation plan shared from Stratos FinOps.';
        try {
          if (viewer) {
            const mail = await loadBridge('mail');
            mail.sendMail(viewer, {
              to: [FINOPS_CONTACT_ID],
              subject: 'Stratos FinOps · Monthly Forecast & Anomaly Digest',
              body,
              source: { app: 'cloud', label: 'Stratos FinOps', to: '/cloud/finops' },
            });
          }
        } catch {
          // fallback
        }
        set((s) => ({ notified: { ...s.notified, finance: Date.now() } }));
        safeToast('success', 'Finance notified via Nova Inbox', 'Sent FinOps digest to Grace Chen.');
      },

      resetDemo: () => {
        set({
          ...buildCloudSeed(),
          story: buildSeedStory(),
        });
        safeToast('info', 'Cloud Console demo reset', 'Restored multi-region telemetry, SLOs and FinOps state.');
      },
    }),
    {
      name: 'nexus-cloud-v1',
      version: CLOUD_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): CloudData => ({
        version: s.version,
        alerts: s.alerts,
        rules: s.rules,
        anomalies: s.anomalies,
        recs: s.recs,
        patches: s.patches,
        requests: s.requests,
        schedules: s.schedules,
        declared: s.declared,
        notified: s.notified,
      }),
      migrate: (persisted, version) => {
        if (!persisted || version !== CLOUD_DATA_VERSION) {
          return buildCloudSeed();
        }
        return persisted as CloudData;
      },
    },
  ),
);
