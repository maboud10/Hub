/**
 * DevHub ("Forge") — persisted Zustand store ('nexus-devhub-v1').
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BridgeSource } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import {
  CANARY_STEPS,
  canPromote,
  evaluateGates,
  gateVerdict,
  promoteDeploy,
  rollbackDeploy,
} from './engine';
import { buildDevHubSeed, DEVHUB_DATA_VERSION } from './seed';
import type {
  ChangeWindow,
  Deploy,
  DevHubData,
  EnvId,
  PipelineRun,
  ReviewComment,
  ReviewState,
  SecretFinding,
  Service,
  ServiceId,
  Suggestion,
  WizardRun,
  WizardTemplate,
} from './types';

export interface DevHubActions {
  submitReview(prId: string, reviewerId: string, state: ReviewState, comment?: string): void;
  addComment(
    prId: string,
    input: { authorId: string; body: string; file?: string; line?: number; suggestion?: Suggestion; nova?: boolean },
  ): ReviewComment | null;
  applySuggestion(prId: string, commentId: string, actorId: string): boolean;
  resolveComment(prId: string, commentId: string): void;
  requestReviewer(prId: string, reviewerId: string): void;
  enqueuePr(prId: string, actorId: string): { ok: boolean; error?: string };
  mergePr(prId: string, actorId: string): { ok: boolean; error?: string; deployId?: string };
  updateSecretStatus(prId: string, patch: Partial<SecretFinding>, actorId?: string): void;
  markPrTaskLinked(prId: string, linkedTask: { id: string; title: string; to: string }): void;
  markPrEvidence(prId: string): void;
  markPrChatShared(prId: string): void;

  triggerRun(service: ServiceId, branch: string, actorId: string, prId?: string): PipelineRun;
  retryRun(runId: string, actorId: string): PipelineRun | null;
  cancelRun(runId: string, actorId: string): void;
  toggleQuarantine(flakyId: string, actorId: string): void;

  promoteCanary(
    deployId: string,
    actorId: string,
    opts?: { override?: boolean; note?: string },
  ): { ok: boolean; code?: string; deploy?: Deploy };
  setCanaryTraffic(deployId: string, stepIndex: number, actorId: string, note?: string): Deploy | null;
  toggleCanaryPause(deployId: string, actorId: string): void;
  rollback(deployId: string, actorId: string): Deploy | null;
  setDeployFreeze(input: { frozen: boolean; reason: string; source?: BridgeSource; actorId: string }): void;
  addChangeWindow(win: Omit<ChangeWindow, 'id'>): ChangeWindow;
  toggleFlag(key: string, env: EnvId, actorId: string): void;
  setFlagRollout(key: string, env: EnvId, pct: number, actorId: string): void;

  startWizard(input: { name: string; template: WizardTemplate; team: string; tier: 1 | 2 | 3; ownerId: string }): WizardRun;
  advanceWizard(): WizardRun | null;
  clearWizard(): void;
  voteDevEx(userId: string, itemId: string, score: number): void;
  resetDemo(): void;
}

export type DevHubStore = DevHubData & DevHubActions;

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

export const useDevHub = create<DevHubStore>()(
  persist(
    (set, get) => ({
      ...buildDevHubSeed(),

      submitReview(prId, reviewerId, state, comment) {
        const now = Date.now();
        set((s) => {
          const pr = s.prs.find((p) => p.id === prId);
          if (!pr) return s;
          const exists = pr.reviewers.some((r) => r.reviewerId === reviewerId);
          const reviewers = exists
            ? pr.reviewers.map((r) => (r.reviewerId === reviewerId ? { ...r, state, at: now } : r))
            : [...pr.reviewers, { reviewerId, state, requestedAt: now, at: now }];
          const comments = comment?.trim()
            ? [...pr.comments, { id: `cm-${now.toString(36)}`, authorId: reviewerId, at: now, body: comment.trim() }]
            : pr.comments;
          let nextState = pr.state;
          if (state === 'changes_requested') nextState = 'changes_requested';
          else if (state === 'approved' && !reviewers.some((r) => r.state === 'changes_requested')) {
            nextState = 'approved';
          }
          return {
            prs: s.prs.map((p) => (p.id === prId ? { ...p, reviewers, comments, state: nextState, updatedAt: now } : p)),
            activity: [
              {
                id: `act-${now.toString(36)}`,
                at: now,
                actorId: reviewerId,
                kind: 'review',
                text: `Reviewed PR #${pr.number} (${state.replace('_', ' ')})`,
                to: `/devhub/reviews?pr=${pr.id}`,
              },
              ...s.activity,
            ],
          };
        });
        safeToast('success', 'Review submitted');
      },

      addComment(prId, input) {
        const body = input.body.trim();
        if (!body) return null;
        const now = Date.now();
        const cm: ReviewComment = {
          id: `cm-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          authorId: input.authorId,
          at: now,
          body,
          file: input.file,
          line: input.line,
          suggestion: input.suggestion,
          nova: input.nova,
        };
        set((s) => ({
          prs: s.prs.map((p) => (p.id === prId ? { ...p, comments: [...p.comments, cm], updatedAt: now } : p)),
        }));
        return cm;
      },

      applySuggestion(prId, commentId, actorId) {
        const now = Date.now();
        const pr = get().prs.find((p) => p.id === prId);
        const cm = pr?.comments.find((c) => c.id === commentId);
        if (!pr || !cm?.suggestion || cm.applied) return false;
        const { replace, with: replacement } = cm.suggestion;
        set((s) => ({
          prs: s.prs.map((p) => {
            if (p.id !== prId) return p;
            const files = p.files.map((f) => {
              if (cm.file && f.path !== cm.file) return f;
              return {
                ...f,
                hunks: f.hunks.map((h) => ({
                  ...h,
                  lines: h.lines.map((l) => (l.kind !== 'del' && l.text === replace ? { ...l, kind: 'add' as const, text: replacement } : l)),
                })),
              };
            });
            const comments = p.comments.map((c) => (c.id === commentId ? { ...c, applied: true, resolved: true } : c));
            return { ...p, files, comments, updatedAt: now };
          }),
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'review',
              text: `Applied Nova suggestion on PR #${pr.number}`,
              to: `/devhub/reviews?pr=${pr.id}`,
            },
            ...s.activity,
          ],
        }));
        safeToast('success', 'Suggestion committed to branch');
        return true;
      },

      resolveComment(prId, commentId) {
        set((s) => ({
          prs: s.prs.map((p) =>
            p.id === prId
              ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)) }
              : p,
          ),
        }));
      },

      requestReviewer(prId, reviewerId) {
        const now = Date.now();
        set((s) => ({
          prs: s.prs.map((p) => {
            if (p.id !== prId) return p;
            if (p.reviewers.some((r) => r.reviewerId === reviewerId)) return p;
            return {
              ...p,
              reviewers: [...p.reviewers, { reviewerId, state: 'pending', requestedAt: now }],
              updatedAt: now,
            };
          }),
        }));
        safeToast('info', 'Reviewer requested');
      },

      enqueuePr(prId, actorId) {
        const s = get();
        const pr = s.prs.find((p) => p.id === prId);
        if (!pr) return { ok: false, error: 'Pull request not found.' };
        if (pr.secret && pr.secret.status === 'blocking') {
          safeToast('error', 'Push protection active', 'Rotate or resolve the secret finding before queueing.');
          return { ok: false, error: 'Blocked by push protection secret finding.' };
        }
        const now = Date.now();
        const maxPos = Math.max(0, ...s.prs.map((p) => p.queuePosition ?? 0));
        set((st) => ({
          prs: st.prs.map((p) => (p.id === prId ? { ...p, state: 'queued', queuePosition: maxPos + 1, updatedAt: now } : p)),
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'merge',
              text: `Added PR #${pr.number} to merge queue (#${maxPos + 1})`,
              to: `/devhub/reviews?pr=${pr.id}`,
            },
            ...st.activity,
          ],
        }));
        safeToast('success', 'Added to merge queue');
        return { ok: true };
      },

      mergePr(prId, actorId) {
        const s = get();
        const pr = s.prs.find((p) => p.id === prId);
        if (!pr) return { ok: false, error: 'Pull request not found.' };
        if (pr.secret && pr.secret.status === 'blocking') {
          safeToast('error', 'Merge blocked by push protection');
          return { ok: false, error: 'Blocked by push protection secret finding.' };
        }
        const now = Date.now();
        const deployId = `dep-stg-${pr.number}-${now.toString(36)}`;
        const svc = s.services.find((sv) => sv.id === pr.service);
        const stgDeploy: Deploy = {
          id: deployId,
          service: pr.service,
          version: `${svc?.version ?? 'v1.0.0'}-pr${pr.number}`,
          sha: pr.id.replace('pr-', 'c0'),
          env: 'staging',
          region: 'me-central-1',
          status: 'success',
          authorId: actorId,
          at: now,
          finishedAt: now + 45_000,
          prId: pr.id,
          prNumber: pr.number,
        };
        set((st) => ({
          prs: st.prs.map((p) =>
            p.id === prId
              ? {
                  ...p,
                  state: 'merged',
                  queuePosition: undefined,
                  mergedAt: now,
                  deployedAt: now,
                  deployId,
                  updatedAt: now,
                }
              : p,
          ),
          deploys: [stgDeploy, ...st.deploys],
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'merge',
              text: `Merged PR #${pr.number} (${pr.title}) and deployed to staging`,
              to: `/devhub/reviews?pr=${pr.id}`,
            },
            ...st.activity,
          ],
        }));
        safeToast('success', 'Pull request merged', 'Staging rollout complete');
        return { ok: true, deployId };
      },

      updateSecretStatus(prId, patch, actorId = 'u-priya') {
        const now = Date.now();
        set((s) => ({
          prs: s.prs.map((p) => {
            if (p.id !== prId || !p.secret) return p;
            const nextSecret = { ...p.secret, ...patch };
            const checks =
              nextSecret.status === 'rotated'
                ? p.checks.map((c) => (c.name === 'secret-scan' || c.name === 'security-scan' ? { ...c, status: 'success' as const } : c))
                : p.checks;
            return { ...p, secret: nextSecret, checks, updatedAt: now };
          }),
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'secret',
              text: `Updated secret finding on PR (${patch.status ?? 'updated'})`,
              to: `/devhub/reviews?pr=${prId}`,
            },
            ...s.activity,
          ],
        }));
      },

      markPrTaskLinked(prId, linkedTask) {
        set((s) => ({
          prs: s.prs.map((p) => (p.id === prId ? { ...p, linkedTask } : p)),
        }));
      },

      markPrEvidence(prId) {
        set((s) => ({
          prs: s.prs.map((p) => (p.id === prId ? { ...p, evidenceLogged: true } : p)),
        }));
      },

      markPrChatShared(prId) {
        set((s) => ({
          prs: s.prs.map((p) => (p.id === prId ? { ...p, chatShared: (p.chatShared ?? 0) + 1 } : p)),
        }));
      },

      triggerRun(service, branch, actorId, prId) {
        const now = Date.now();
        const num = get().nextRun;
        const run: PipelineRun = {
          id: `run-${num}`,
          number: num,
          service,
          branch,
          sha: Math.random().toString(16).slice(2, 9),
          message: `Manual pipeline dispatch on ${branch}`,
          authorId: actorId,
          trigger: 'manual',
          prId,
          status: 'running',
          outcome: 'success',
          startedAt: now,
          durationSec: 160,
          costUsd: 1.35,
          cacheHitPct: 91,
          jobs: [
            {
              id: 'job-build',
              name: 'compile & typecheck',
              stage: 'build',
              status: 'running',
              startSec: 0,
              durationSec: 35,
              needs: [],
              cacheHit: true,
              log: [{ t: 1, level: 'cmd', text: '$ forge build --cache=remote' }],
            },
            {
              id: 'job-test',
              name: 'unit & integration suite',
              stage: 'test',
              status: 'queued',
              startSec: 35,
              durationSec: 55,
              needs: ['job-build'],
              cacheHit: true,
              log: [{ t: 36, level: 'info', text: 'Running unit & integration test suite…' }],
            },
            {
              id: 'job-scan',
              name: 'SAST, SBOM & secret scan',
              stage: 'scan',
              status: 'queued',
              startSec: 35,
              durationSec: 30,
              needs: ['job-build'],
              log: [{ t: 36, level: 'info', text: 'Scanning dependencies and secrets…' }],
            },
            {
              id: 'job-pkg',
              name: 'OCI image & cosign',
              stage: 'package',
              status: 'queued',
              startSec: 90,
              durationSec: 30,
              needs: ['job-test', 'job-scan'],
              log: [{ t: 91, level: 'info', text: 'Signing OCI container image…' }],
            },
            {
              id: 'job-deploy',
              name: 'staging + canary rollout',
              stage: 'deploy',
              status: 'queued',
              startSec: 120,
              durationSec: 40,
              needs: ['job-pkg'],
              log: [{ t: 121, level: 'ok', text: 'Staging verification complete' }],
            },
          ],
        };
        set((s) => ({
          runs: [run, ...s.runs],
          nextRun: s.nextRun + 1,
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'pipeline',
              text: `Triggered pipeline #${run.number} for ${service}`,
              to: `/devhub/pipelines?run=${run.id}`,
            },
            ...s.activity,
          ],
        }));
        safeToast('info', `Pipeline #${run.number} started`);
        return run;
      },

      retryRun(runId, actorId) {
        const s = get();
        const prev = s.runs.find((r) => r.id === runId);
        if (!prev) return null;
        const now = Date.now();
        const num = s.nextRun;
        const retried: PipelineRun = {
          ...prev,
          id: `run-${num}`,
          number: num,
          status: 'success',
          outcome: 'success',
          startedAt: now,
          retryOf: prev.id,
          jobs: prev.jobs.map((j) => ({
            ...j,
            status: 'success',
            log: [...j.log, { t: j.durationSec, level: 'ok', text: 'Retry succeeded — all assertions passed' }],
          })),
        };
        set((st) => ({
          runs: [retried, ...st.runs],
          nextRun: st.nextRun + 1,
          prs: prev.prId
            ? st.prs.map((p) =>
                p.id === prev.prId
                  ? {
                      ...p,
                      runId: retried.id,
                      checks: p.checks.map((c) => (c.status === 'failure' && c.name !== 'secret-scan' ? { ...c, status: 'success' } : c)),
                    }
                  : p,
              )
            : st.prs,
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'pipeline',
              text: `Retried failed pipeline #${prev.number} → #${retried.number} passed`,
              to: `/devhub/pipelines?run=${retried.id}`,
            },
            ...st.activity,
          ],
        }));
        safeToast('success', `Pipeline #${retried.number} passed on retry`);
        return retried;
      },

      cancelRun(runId, actorId) {
        const now = Date.now();
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === runId
              ? {
                  ...r,
                  status: 'canceled',
                  jobs: r.jobs.map((j) => (j.status === 'running' || j.status === 'queued' ? { ...j, status: 'canceled' } : j)),
                }
              : r,
          ),
          activity: [
            { id: `act-${now.toString(36)}`, at: now, actorId, kind: 'pipeline', text: `Canceled pipeline run ${runId}` },
            ...s.activity,
          ],
        }));
        safeToast('info', 'Pipeline run canceled');
      },

      toggleQuarantine(flakyId, actorId) {
        const now = Date.now();
        set((s) => ({
          flaky: s.flaky.map((f) => (f.id === flakyId ? { ...f, quarantined: !f.quarantined } : f)),
          activity: [
            { id: `act-${now.toString(36)}`, at: now, actorId, kind: 'pipeline', text: `Updated flaky test quarantine (${flakyId})` },
            ...s.activity,
          ],
        }));
        safeToast('success', 'Flaky test quarantine updated');
      },

      promoteCanary(deployId, actorId, opts) {
        const s = get();
        const dep = s.deploys.find((d) => d.id === deployId);
        if (!dep) return { ok: false, code: 'not-canary' };
        const svc = s.services.find((sv) => sv.id === dep.service);
        const reading = s.health.find((h) => h.service === dep.service && h.region === dep.region) ?? {
          latencyMs: svc?.baselineP95 ?? 150,
          errorRate: 0.002,
          saturation: 0.45,
        };
        const gates = evaluateGates(reading, svc ?? { baselineP95: 200, latencySloMs: 600 });
        const verdict = gateVerdict(gates);
        const check = canPromote(dep, { blockingFreeze: s.freeze.frozen, verdict, override: opts?.override });
        if (!check.ok) {
          safeToast('warning', 'Cannot promote canary', `Blocked by ${check.code}`);
          return { ok: false, code: check.code };
        }
        const now = Date.now();
        const updated = promoteDeploy(dep, actorId, now, opts?.note);
        const pct = CANARY_STEPS[updated.canary?.step ?? 0];
        set((st) => ({
          deploys: st.deploys.map((d) => (d.id === deployId ? updated : d)),
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'deploy',
              text: `Promoted ${dep.service} ${dep.version} canary to ${pct}% in ${dep.region}`,
              to: `/devhub/deploys?deploy=${dep.id}`,
            },
            ...st.activity,
          ],
        }));
        safeToast('success', `Canary promoted to ${pct}%`);
        return { ok: true, deploy: updated };
      },

      setCanaryTraffic(deployId, stepIndex, actorId, note) {
        const s = get();
        const dep = s.deploys.find((d) => d.id === deployId);
        if (!dep || !dep.canary) return null;
        if (dep.env === 'production' && s.freeze.frozen) {
          safeToast('error', 'Production deploys are frozen', s.freeze.reason);
          return null;
        }
        const step = Math.max(0, Math.min(CANARY_STEPS.length - 1, stepIndex));
        const done = step === CANARY_STEPS.length - 1;
        const now = Date.now();
        const updated: Deploy = {
          ...dep,
          status: done ? 'success' : 'in_progress',
          finishedAt: done ? now : dep.finishedAt,
          canary: {
            ...dep.canary,
            step,
            paused: false,
            autoPaused: false,
            stepAt: now,
            history: [...dep.canary.history, { step, at: now, by: actorId, note: note ?? `Dialed canary to ${CANARY_STEPS[step]}%` }],
          },
        };
        set((st) => ({
          deploys: st.deploys.map((d) => (d.id === deployId ? updated : d)),
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'deploy',
              text: `Set ${dep.service} ${dep.version} canary traffic to ${CANARY_STEPS[step]}%`,
              to: `/devhub/deploys?deploy=${dep.id}`,
            },
            ...st.activity,
          ],
        }));
        safeToast('info', `Canary traffic set to ${CANARY_STEPS[step]}%`);
        return updated;
      },

      toggleCanaryPause(deployId, actorId) {
        const now = Date.now();
        set((s) => ({
          deploys: s.deploys.map((d) =>
            d.id === deployId && d.canary
              ? { ...d, canary: { ...d.canary, paused: !d.canary.paused, autoPaused: false, stepAt: now } }
              : d,
          ),
          activity: [
            { id: `act-${now.toString(36)}`, at: now, actorId, kind: 'deploy', text: `Toggled canary pause on ${deployId}` },
            ...s.activity,
          ],
        }));
      },

      rollback(deployId, actorId) {
        const s = get();
        const now = Date.now();
        const res = rollbackDeploy(s.deploys, deployId, actorId, now);
        if (!res) return null;
        const { deploys, rollback: rb } = res;
        const svc = s.services.find((sv) => sv.id === rb.service);
        set((st) => ({
          deploys,
          services: st.services.map((sv) => (sv.id === rb.service ? { ...sv, version: rb.version } : sv)),
          health: st.health.map((h) =>
            h.service === rb.service && h.region === rb.region
              ? {
                  ...h,
                  status: 'healthy',
                  latencyMs: svc?.baselineP95 ?? 240,
                  errorRate: 0.002,
                  saturation: 0.48,
                }
              : h,
          ),
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId,
              kind: 'rollback',
              text: `Rolled back ${rb.service} in ${rb.region} to ${rb.version} (from ${rb.fromVersion})`,
              to: `/devhub/deploys?deploy=${rb.id}`,
            },
            ...st.activity,
          ],
        }));
        safeToast('success', `Rolled back ${rb.service} to ${rb.version}`, `Health restored in ${rb.region}`);
        return rb;
      },

      setDeployFreeze(input) {
        const now = Date.now();
        set((s) => ({
          freeze: {
            frozen: input.frozen,
            reason: input.frozen ? input.reason.trim() || 'Production change freeze active' : '',
            source: input.source,
            setBy: input.actorId,
            at: now,
          },
          activity: [
            {
              id: `act-${now.toString(36)}`,
              at: now,
              actorId: input.actorId,
              kind: 'freeze',
              text: input.frozen ? `Froze production deploys: ${input.reason}` : 'Lifted production deploy freeze',
              to: '/devhub/deploys',
            },
            ...s.activity,
          ],
        }));
        safeToast(input.frozen ? 'warning' : 'success', input.frozen ? 'Deploy freeze enabled' : 'Deploy freeze lifted');
      },

      addChangeWindow(win) {
        const now = Date.now();
        const created: ChangeWindow = { ...win, id: `win-${now.toString(36)}` };
        set((s) => ({ windows: [created, ...s.windows] }));
        safeToast('success', 'Change window scheduled');
        return created;
      },

      toggleFlag(key, env, actorId) {
        const now = Date.now();
        set((s) => ({
          flags: s.flags.map((f) => {
            if (f.key !== key) return f;
            const nextOn = !f.enabled[env];
            return {
              ...f,
              enabled: { ...f.enabled, [env]: nextOn },
              rollout: { ...f.rollout, [env]: nextOn ? Math.max(25, f.rollout[env]) : 0 },
              updatedAt: now,
              updatedBy: actorId,
            };
          }),
          activity: [
            { id: `act-${now.toString(36)}`, at: now, actorId, kind: 'flag', text: `Toggled flag ${key} in ${env}` },
            ...s.activity,
          ],
        }));
        safeToast('info', `Flag ${key} updated`);
      },

      setFlagRollout(key, env, pct, actorId) {
        const now = Date.now();
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        set((s) => ({
          flags: s.flags.map((f) =>
            f.key === key
              ? {
                  ...f,
                  enabled: { ...f.enabled, [env]: clamped > 0 },
                  rollout: { ...f.rollout, [env]: clamped },
                  updatedAt: now,
                  updatedBy: actorId,
                }
              : f,
          ),
        }));
      },

      startWizard(input) {
        const now = Date.now();
        const slug = input.name
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '') || 'new-svc';
        const wiz: WizardRun = {
          id: `wiz-${now.toString(36)}`,
          name: slug,
          template: input.template,
          team: input.team,
          tier: input.tier,
          ownerId: input.ownerId,
          step: 1,
          startedAt: now,
          done: false,
        };
        set({ wizard: wiz });
        return wiz;
      },

      advanceWizard() {
        const s = get();
        const wiz = s.wizard;
        if (!wiz) return null;
        const nextStep = Math.min(6, wiz.step + 1);
        const done = nextStep >= 6;
        const now = Date.now();
        const updated: WizardRun = { ...wiz, step: nextStep, done };
        const langMap: Record<WizardTemplate, Service['language']> = {
          'ts-api': 'TypeScript',
          'go-service': 'Go',
          'py-worker': 'Python',
          'web-app': 'TypeScript',
        };
        const newService: Service | null =
          done && !s.services.some((sv) => sv.id === wiz.name)
            ? {
                id: wiz.name,
                repo: `helix/${wiz.name}`,
                team: wiz.team,
                ownerId: wiz.ownerId,
                tier: wiz.tier,
                language: langMap[wiz.template],
                description: `Golden-path ${wiz.template} service provisioned via Forge.`,
                regions: ['me-central-1', 'eu-west-2'],
                rotation: 'Platform Primary',
                dependsOn: ['identity-svc'],
                scorecard: { coverage: 0.9, docs: true, runbook: true, slo: true, depsFreshness: 1, vulns: { critical: 0, high: 0, medium: 0 } },
                sloTarget: wiz.tier === 1 ? 99.95 : 99.9,
                baselineP95: 90,
                latencySloMs: 300,
                version: 'v0.1.0',
                scaffolded: true,
              }
            : null;
        set((st) => ({
          wizard: updated,
          services: newService ? [newService, ...st.services] : st.services,
          activity: done
            ? [
                {
                  id: `act-${now.toString(36)}`,
                  at: now,
                  actorId: wiz.ownerId,
                  kind: 'catalog',
                  text: `Scaffolded golden-path service ${wiz.name} (${wiz.template})`,
                  to: `/devhub/services?service=${wiz.name}`,
                },
                ...st.activity,
              ]
            : st.activity,
        }));
        if (done) safeToast('success', `Service ${wiz.name} provisioned`);
        return updated;
      },

      clearWizard() {
        set({ wizard: null });
      },

      voteDevEx(userId, itemId, score) {
        const clamped = Math.max(1, Math.min(100, Math.round(score)));
        set((s) => {
          const prevUser = s.devexVotes[userId] ?? {};
          return {
            devexVotes: { ...s.devexVotes, [userId]: { ...prevUser, [itemId]: clamped } },
            devex: s.devex.map((d) => (d.id === itemId ? { ...d, score: Math.round((d.score * 4 + clamped) / 5) } : d)),
          };
        });
        safeToast('success', 'DevEx pulse recorded');
      },

      resetDemo() {
        set(buildDevHubSeed());
        safeToast('info', 'DevHub demo data reset');
      },
    }),
    {
      name: 'nexus-devhub-v1',
      version: DEVHUB_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: () => buildDevHubSeed(),
    },
  ),
);
