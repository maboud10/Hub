/**
 * Helix Insights — Persisted Zustand Store ('nexus-insights-v1')
 * Orchestrates Nova Causal Copilot queries, Executive Board pinned cards,
 * live A/B experiment winner promotion into funnel conversion rates,
 * Z-score anomaly acknowledgment & growth play creation, and Monte-Carlo
 * $100M ARR scenario snapshots.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult } from '@/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import {
  promoteExperimentWinnerToStages,
  runMonteCarloProjection,
  synthesizeNovaAnswer,
} from './engine';
import { buildInsightsSeed, INSIGHTS_DATA_VERSION, SCENARIO_PRESETS } from './seed';
import type {
  AnomalyStatus,
  CohortMode,
  ForecastLevers,
  GrowthExperiment,
  InsightsData,
  InsightsSegment,
  NovaInsightAnswer,
  ScenarioPresetId,
  ScenarioSnapshot,
  TelemetryCanvasMode,
} from './types';

export interface InsightsActions {
  setActiveSegment(segment: InsightsSegment): void;
  setCanvasMode(mode: TelemetryCanvasMode): void;
  setCohortMode(mode: CohortMode): void;
  askNovaInsights(question: string): NovaInsightAnswer;
  pinInsightCard(cardId?: string): ActionResult;
  unpinInsightCard(cardId: string): void;
  shipExperimentWinner(experimentId: string): ActionResult;
  acknowledgeAnomaly(anomalyId: string, status?: AnomalyStatus): ActionResult;
  convertAnomalyToGrowthPlay(anomalyId: string): ActionResult;
  updateForecastLevers(patch: Partial<ForecastLevers>): void;
  applyScenarioPreset(presetId: ScenarioPresetId): void;
  saveScenarioSnapshot(customName?: string): ActionResult & { snapshot?: ScenarioSnapshot };
  deleteScenarioSnapshot(snapshotId: string): void;
  resetInsights(): void;
}

export type InsightsStore = InsightsData & InsightsActions;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

const safeToast = {
  success: (title: string, description?: string) => {
    if (typeof window !== 'undefined') toast.success(title, description);
  },
  info: (title: string, description?: string) => {
    if (typeof window !== 'undefined') toast.info(title, description);
  },
};

export const useInsights = create<InsightsStore>()(
  persist(
    (set, get) => ({
      ...buildInsightsSeed(),

      setActiveSegment(segment) {
        set({ activeSegment: segment });
      },

      setCanvasMode(mode) {
        set({ canvasMode: mode });
      },

      setCohortMode(mode) {
        set({ cohortMode: mode });
      },

      askNovaInsights(question) {
        const q = question.trim();
        const answer = synthesizeNovaAnswer(q || 'Why did MENA Net Dollar Retention jump to 142%?');
        const alreadyPinned = get().pinnedCards.some(
          (c) => c.headline.toLowerCase() === answer.headline.toLowerCase(),
        );
        const hydrated: NovaInsightAnswer = { ...answer, pinned: alreadyPinned };
        set({ activeNovaAnswer: hydrated });
        return hydrated;
      },

      pinInsightCard(cardId) {
        const state = get();
        const target =
          !cardId || cardId === state.activeNovaAnswer.id
            ? state.activeNovaAnswer
            : state.pinnedCards.find((c) => c.id === cardId) ?? state.activeNovaAnswer;

        const exists = state.pinnedCards.some(
          (c) => c.id === target.id || c.headline === target.headline,
        );
        if (exists) {
          safeToast.info('Already pinned to Executive Board', target.headline);
          return ok('Already pinned to Executive Board');
        }

        const pinnedCard: NovaInsightAnswer = { ...target, pinned: true };
        set((s) => ({
          activeNovaAnswer:
            s.activeNovaAnswer.id === target.id
              ? { ...s.activeNovaAnswer, pinned: true }
              : s.activeNovaAnswer,
          pinnedCards: [pinnedCard, ...s.pinnedCards].slice(0, 8),
        }));
        safeToast.success('Pinned to Executive Board', target.headline);
        return ok('Pinned to Executive Board');
      },

      unpinInsightCard(cardId) {
        set((s) => ({
          pinnedCards: s.pinnedCards.filter((c) => c.id !== cardId),
          activeNovaAnswer:
            s.activeNovaAnswer.id === cardId
              ? { ...s.activeNovaAnswer, pinned: false }
              : s.activeNovaAnswer,
        }));
        safeToast.info('Removed from Executive Board');
      },

      shipExperimentWinner(experimentId) {
        const state = get();
        const exp = state.experiments.find((e) => e.id === experimentId);
        if (!exp) return fail('Experiment not found.');
        if (exp.status === 'shipped') {
          safeToast.info(`${exp.code} is already shipped to 100% traffic.`);
          return ok(`${exp.code} is already shipped.`);
        }

        const nextStages = promoteExperimentWinnerToStages(state.funnelStages, exp);
        const now = Date.now();

        set((s) => ({
          funnelStages: nextStages,
          experiments: s.experiments.map((e) =>
            e.id === experimentId ? { ...e, status: 'shipped', shippedAt: now } : e,
          ),
          metrics: s.metrics.map((m) => {
            if (m.id === 'mtr-north-star') {
              const nextVal = Math.min(99.4, Math.round((m.numericValue + 0.6) * 10) / 10);
              return {
                ...m,
                numericValue: nextVal,
                value: `${nextVal}%`,
                spark: [...m.spark.slice(1), nextVal],
              };
            }
            return m;
          }),
        }));

        const msg = `Shipped ${exp.code} (${exp.title}) to 100% — funnel conversion updated (+$${exp.arrLiftK.toLocaleString()}K ARR impact)!`;
        safeToast.success(`Shipped ${exp.code} to 100%`, `+${exp.relativeUpliftPct}% uplift live in funnel`);
        return ok(msg);
      },

      acknowledgeAnomaly(anomalyId, nextStatus) {
        const state = get();
        const anom = state.anomalies.find((a) => a.id === anomalyId);
        if (!anom) return fail('Anomaly signal not found.');

        const resolvedStatus: AnomalyStatus =
          nextStatus ?? (anom.status === 'active' ? 'investigating' : 'resolved');

        set((s) => ({
          anomalies: s.anomalies.map((a) =>
            a.id === anomalyId ? { ...a, status: resolvedStatus } : a,
          ),
        }));

        const label =
          resolvedStatus === 'resolved'
            ? `Resolved signal ${anom.code}`
            : `Acknowledged ${anom.code} · Now investigating`;
        safeToast.success(label, anom.title);
        return ok(label);
      },

      convertAnomalyToGrowthPlay(anomalyId) {
        const state = get();
        const anom = state.anomalies.find((a) => a.id === anomalyId);
        if (!anom) return fail('Anomaly signal not found.');

        const expCode = `HX-EXP-${405 + state.experiments.length}`;
        const alreadyCreated = anom.growthPlayCreated;

        if (alreadyCreated) {
          safeToast.info(`Growth play already active for ${anom.code}`);
          return ok(`Growth play already active for ${anom.code}`);
        }

        const newExperiment: GrowthExperiment = {
          id: `exp-from-${anom.id}`,
          code: expCode,
          title:
            anom.category === 'breakout'
              ? `Scale ${anom.title} across Global Cohorts`
              : `Auto-Remediate ${anom.title}`,
          hypothesis: `Triggered from Neural Signal ${anom.code} (Z = ${anom.zScore > 0 ? '+' : ''}${anom.zScore}σ): ${anom.driverAttribution}`,
          targetStageId: anom.category === 'breakout' ? 'stage-expansion' : 'stage-trial',
          segment: anom.title.toLowerCase().includes('mena') ? 'mena' : 'all',
          ownerId: anom.ownerId,
          sigil: anom.sigil,
          color: anom.color,
          status: 'running',
          controlRatePct: 44.0,
          variantRatePct: 54.6,
          relativeUpliftPct: 24.1,
          confidence: 0.992,
          sampleSize: 11200,
          arrLiftK: 860,
        };

        set((s) => ({
          anomalies: s.anomalies.map((a) =>
            a.id === anomalyId
              ? {
                  ...a,
                  growthPlayCreated: true,
                  status: a.status === 'active' ? 'investigating' : a.status,
                }
              : a,
          ),
          experiments: [newExperiment, ...s.experiments],
        }));

        try {
          import('@/crm/store').then(({ useCrm }) => {
            const crm = useCrm.getState();
            const playId = `play-ins-${anom.id}`;
            if (!crm.growthPlays.some((p) => p.id === playId)) {
              const targetAcc = crm.accounts[0];
              if (targetAcc) {
                useCrm.setState((cs) => ({
                  growthPlays: [
                    {
                      id: playId,
                      title: `Insights Signal ${anom.code} · ${anom.title}`,
                      subtitle: anom.driverAttribution,
                      accountId: targetAcc.id,
                      accountName: targetAcc.name,
                      sigil: 'spark',
                      color: anom.color,
                      impactArr: 860_000,
                      confidence: 96,
                      kind: 'expansion_launch',
                      ctaLabel: 'Execute Telemetry Play',
                      executed: false,
                      tags: ['Insights Bridge', anom.code, anom.segmentLabel],
                    },
                    ...cs.growthPlays,
                  ],
                }));
              }
            }
          });
        } catch {
          // ignore bridge error in isolated tests
        }

        safeToast.success(
          `Created Growth Play ${expCode}`,
          `Added "${newExperiment.title}" to Experiment Lab & Helix CRM`,
        );
        return ok(`Created Growth Play ${expCode}`);
      },

      updateForecastLevers(patch) {
        set((s) => ({
          activePreset: 'custom',
          forecastLevers: { ...s.forecastLevers, ...patch },
        }));
      },

      applyScenarioPreset(presetId) {
        const preset = SCENARIO_PRESETS[presetId];
        if (!preset) return;
        set({
          activePreset: presetId,
          forecastLevers: { ...preset.levers },
        });
        safeToast.info(`Loaded scenario: ${preset.label}`, preset.description);
      },

      saveScenarioSnapshot(customName) {
        const state = get();
        const proj = runMonteCarloProjection(state.forecastLevers);
        const sessionUserId = useHub.getState().sessionUserId ?? 'u-daniel';
        const presetLabel =
          state.activePreset === 'custom'
            ? 'Custom Monte-Carlo Model'
            : SCENARIO_PRESETS[state.activePreset].label;

        const name =
          customName?.trim() ||
          `${presetLabel} ($${proj.endingP50ArrM.toFixed(1)}M Q8)`;

        const snapshot: ScenarioSnapshot = {
          id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          presetId: state.activePreset,
          levers: { ...state.forecastLevers },
          endingP50ArrM: proj.endingP50ArrM,
          ruleOf40Score: proj.ruleOf40Score,
          quartersTo100M: proj.quartersTo100M,
          createdAt: Date.now(),
          authorId: sessionUserId,
        };

        set((s) => ({
          snapshots: [snapshot, ...s.snapshots].slice(0, 10),
        }));

        safeToast.success(
          'Saved Scenario Snapshot',
          `${snapshot.name} · P50 Ending ARR $${snapshot.endingP50ArrM}M`,
        );
        return { ok: true, message: `Saved snapshot "${snapshot.name}"`, snapshot };
      },

      deleteScenarioSnapshot(snapshotId) {
        set((s) => ({
          snapshots: s.snapshots.filter((sn) => sn.id !== snapshotId),
        }));
        safeToast.info('Removed scenario snapshot');
      },

      resetInsights() {
        set(buildInsightsSeed());
        safeToast.info('Helix Insights telemetry reset to baseline seed');
      },
    }),
    {
      name: 'nexus-insights-v1',
      version: INSIGHTS_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): InsightsData => ({
        version: s.version,
        activeSegment: s.activeSegment,
        canvasMode: s.canvasMode,
        cohortMode: s.cohortMode,
        metrics: s.metrics,
        activeNovaAnswer: s.activeNovaAnswer,
        pinnedCards: s.pinnedCards,
        funnelStages: s.funnelStages,
        experiments: s.experiments,
        cohorts: s.cohorts,
        causalDrivers: s.causalDrivers,
        anomalies: s.anomalies,
        activePreset: s.activePreset,
        forecastLevers: s.forecastLevers,
        snapshots: s.snapshots,
      }),
      migrate: (persisted, version) =>
        version === INSIGHTS_DATA_VERSION ? (persisted as InsightsData) : buildInsightsSeed(),
    },
  ),
);

export function resetInsights(): void {
  useInsights.getState().resetInsights();
}
