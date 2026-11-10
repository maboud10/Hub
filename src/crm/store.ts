import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SigilId } from '@/projects/sigils';
import { toast } from '@/store/toast';
import {
  createExpansionDealFromAccount,
  formatCompactUsd,
  generateNovaCrmResponse,
  nextDealStage,
} from './engine';
import {
  CRM_MODULES,
  DEAL_STAGES,
  MEDDPICC_PILLARS,
  SEED_ACCOUNTS,
  SEED_BUYING_SIGNALS,
  SEED_DEALS,
  SEED_GROWTH_PLAYS,
  SEED_PLAYBOOKS,
  SIMULATOR_PRESETS,
} from './seed';
import type {
  BuyingSignal,
  CrmAccount,
  CrmDeal,
  CrmModuleId,
  CrmRegion,
  CrmSegment,
  DealStage,
  GrowthPlay,
  GrowthPlaybook,
  MeddpiccPillarId,
  NovaCrmResponse,
  SimulatorConfig,
  SimulatorPresetId,
} from './types';

export interface CreateDealInput {
  title: string;
  accountId?: string;
  accountName: string;
  sigil?: SigilId;
  color?: string;
  stage?: DealStage;
  region: CrmRegion;
  segment?: CrmSegment;
  acv: number;
  closeDate: string;
  ownerId: string;
  execSponsorId?: string;
  targetModule?: CrmModuleId;
  nextBestAction?: string;
}

export interface CrmState {
  accounts: CrmAccount[];
  deals: CrmDeal[];
  growthPlays: GrowthPlay[];
  signals: BuyingSignal[];
  playbooks: GrowthPlaybook[];
  simulator: SimulatorConfig;
  novaResponse: NovaCrmResponse | null;
  selectedDealId: string | null;

  setSelectedDealId: (id: string | null) => void;
  createDeal: (input: CreateDealInput) => CrmDeal;
  moveDealStage: (dealId: string, stage?: DealStage) => void;
  toggleMeddpicc: (dealId: string, pillar: MeddpiccPillarId) => void;
  triggerDealNextBestAction: (dealId: string) => void;
  executeGrowthPlay: (playId: string) => void;
  launchAccountExpansion: (accountId: string, moduleId?: CrmModuleId) => CrmDeal | null;
  togglePlaybook: (playbookId: string) => void;
  runPlaybook: (playbookId: string) => void;
  updateSimulator: (patch: Partial<SimulatorConfig>) => void;
  applySimulatorPreset: (preset: SimulatorPresetId) => void;
  askNovaCrm: (query: string) => NovaCrmResponse;
  resetCrm: () => void;
}

const safeToast = {
  success: (title: string, description?: string) => {
    if (typeof window !== 'undefined') toast.success(title, description);
  },
  info: (title: string, description?: string) => {
    if (typeof window !== 'undefined') toast.info(title, description);
  },
};

const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: (name: string) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(name);
      }
    } catch {
      // fallback
    }
    return memoryStore.get(name) ?? null;
  },
  setItem: (name: string, value: string) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(name, value);
        return;
      }
    } catch {
      // fallback
    }
    memoryStore.set(name, value);
  },
  removeItem: (name: string) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(name);
        return;
      }
    } catch {
      // fallback
    }
    memoryStore.delete(name);
  },
};

function buildInitialData() {
  const accounts = structuredClone(SEED_ACCOUNTS);
  const deals = structuredClone(SEED_DEALS);
  return {
    accounts,
    deals,
    growthPlays: structuredClone(SEED_GROWTH_PLAYS),
    signals: structuredClone(SEED_BUYING_SIGNALS),
    playbooks: structuredClone(SEED_PLAYBOOKS),
    simulator: structuredClone(SIMULATOR_PRESETS.base),
    novaResponse: generateNovaCrmResponse(
      'Forecast Q4 Commit vs Neural AI projection',
      accounts,
      deals,
    ),
    selectedDealId: null as string | null,
  };
}

export const useCrm = create<CrmState>()(
  persist(
    (set, get) => ({
      ...buildInitialData(),

      setSelectedDealId(id) {
        set({ selectedDealId: id });
      },

      createDeal(input) {
        const now = Date.now();
        const account = get().accounts.find((a) => a.id === input.accountId);
        const stage = input.stage ?? 'discovery';
        const newDeal: CrmDeal = {
          id: `deal-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          title: input.title.trim(),
          accountId: account?.id ?? input.accountId ?? `acc-custom-${now.toString(36)}`,
          accountName: account?.name ?? input.accountName.trim(),
          sigil: input.sigil ?? account?.sigil ?? 'rocket',
          color: input.color ?? account?.color ?? '#fb923c',
          stage,
          region: input.region,
          segment: input.segment ?? account?.segment ?? 'Enterprise',
          acv: Math.max(50_000, Number(input.acv) || 500_000),
          closeDate: input.closeDate || '2027-01-31',
          ownerId: input.ownerId || 'u-noah',
          execSponsorId: input.execSponsorId ?? 'u-layla',
          baseWinProb: stage === 'commit' ? 78 : stage === 'security' ? 64 : stage === 'poc' ? 56 : 45,
          momentum: [42, 48, 54, 61, 68, 75, 82],
          meddpicc: {
            metrics: true,
            economicBuyer: stage === 'commit' || stage === 'security',
            decisionCriteria: true,
            decisionProcess: stage === 'commit',
            paperProcess: false,
            identifyPain: true,
            champion: true,
            competition: false,
          },
          meddpiccNotes: {
            metrics: 'Quantified ROI & executive value model created',
            economicBuyer: 'Executive budget sponsor mapped',
            decisionCriteria: 'Technical & security scope defined',
            decisionProcess: 'Procurement milestones outlined',
            paperProcess: 'Standard MSA draft queued',
            identifyPain: 'High-priority operational pain verified',
            champion: 'Internal sponsor engaged',
            competition: 'Competitive positioning active',
          },
          riskFlags: [],
          nextBestAction:
            input.nextBestAction?.trim() ||
            'Schedule technical architecture & MEDDPICC alignment session.',
          stakeholders: [
            {
              name: 'Executive Sponsor',
              role: 'VP Digital Transformation',
              stance: 'champion',
              lastTouch: 'Just now',
            },
          ],
          activities: [
            {
              id: `act-${now}`,
              ts: now,
              actorId: input.ownerId || 'u-noah',
              kind: 'stage_move',
              text: `Created pipeline opportunity (${formatCompactUsd(input.acv)} ACV).`,
            },
          ],
          targetModule: input.targetModule,
          isExpansion: !!account,
          updatedAt: now,
        };

        set((s) => ({
          deals: [newDeal, ...s.deals],
          selectedDealId: newDeal.id,
        }));

        safeToast.success(
          'Deal added to Helix Pipeline',
          `${newDeal.title} · ${formatCompactUsd(newDeal.acv)} ACV`,
        );
        return newDeal;
      },

      moveDealStage(dealId, targetStage) {
        const now = Date.now();
        const deal = get().deals.find((d) => d.id === dealId);
        if (!deal) return;
        const nextStage = targetStage ?? nextDealStage(deal.stage);
        const stageMeta = DEAL_STAGES.find((s) => s.id === nextStage);

        set((s) => ({
          deals: s.deals.map((d) => {
            if (d.id !== dealId) return d;
            const isWon = nextStage === 'won';
            const updatedMeddpicc = isWon
              ? {
                  metrics: true,
                  economicBuyer: true,
                  decisionCriteria: true,
                  decisionProcess: true,
                  paperProcess: true,
                  identifyPain: true,
                  champion: true,
                  competition: true,
                }
              : d.meddpicc;
            return {
              ...d,
              stage: nextStage,
              meddpicc: updatedMeddpicc,
              riskFlags: isWon ? [] : d.riskFlags,
              momentum: [...d.momentum.slice(1), Math.min(100, (d.momentum.at(-1) ?? 75) + 6)],
              activities: [
                {
                  id: `act-${now}`,
                  ts: now,
                  actorId: d.ownerId,
                  kind: 'stage_move',
                  text: `Moved deal stage to ${stageMeta?.label ?? nextStage}.`,
                },
                ...d.activities,
              ],
              updatedAt: now,
            };
          }),
        }));

        safeToast.success(
          nextStage === 'won' ? 'Deal Closed Won! 🎉' : `Stage → ${stageMeta?.shortLabel ?? nextStage}`,
          `${deal.accountName} · ${formatCompactUsd(deal.acv)} ACV`,
        );
      },

      toggleMeddpicc(dealId, pillar) {
        const now = Date.now();
        const pillarMeta = MEDDPICC_PILLARS.find((p) => p.id === pillar);
        let nextVal = false;
        let dealTitle = '';

        set((s) => ({
          deals: s.deals.map((d) => {
            if (d.id !== dealId) return d;
            nextVal = !d.meddpicc[pillar];
            dealTitle = d.accountName;
            const updatedMeddpicc = { ...d.meddpicc, [pillar]: nextVal };
            const updatedRisks = nextVal
              ? d.riskFlags.filter((r) => !r.toLowerCase().includes((pillarMeta?.label ?? '').toLowerCase()))
              : d.riskFlags;
            return {
              ...d,
              meddpicc: updatedMeddpicc,
              riskFlags: updatedRisks,
              activities: [
                {
                  id: `act-${now}`,
                  ts: now,
                  actorId: d.ownerId,
                  kind: 'meddpicc',
                  text: `${nextVal ? 'Verified' : 'Re-opened'} MEDDPICC pillar: ${pillarMeta?.label ?? pillar}.`,
                },
                ...d.activities,
              ],
              updatedAt: now,
            };
          }),
        }));

        if (dealTitle) {
          safeToast.info(
            `MEDDPICC · ${pillarMeta?.label ?? pillar} ${nextVal ? 'Verified ✓' : 'Unchecked'}`,
            `${dealTitle} neural win probability recalculated`,
          );
        }
      },

      triggerDealNextBestAction(dealId) {
        const now = Date.now();
        const deal = get().deals.find((d) => d.id === dealId);
        if (!deal) return;

        // Find first missing MEDDPICC pillar and lock it, plus boost momentum
        const missingPillar = MEDDPICC_PILLARS.find((p) => !deal.meddpicc[p.id]);

        set((s) => ({
          deals: s.deals.map((d) => {
            if (d.id !== dealId) return d;
            const nextMeddpicc = missingPillar
              ? { ...d.meddpicc, [missingPillar.id]: true }
              : d.meddpicc;
            return {
              ...d,
              baseWinProb: Math.min(96, d.baseWinProb + 5),
              meddpicc: nextMeddpicc,
              riskFlags: d.riskFlags.slice(1),
              momentum: [...d.momentum.slice(1), Math.min(100, (d.momentum.at(-1) ?? 80) + 7)],
              activities: [
                {
                  id: `act-${now}`,
                  ts: now,
                  actorId: d.ownerId,
                  kind: 'ai_play',
                  text: `Nova executed Next-Best-Action: ${d.nextBestAction}${missingPillar ? ` (Locked ${missingPillar.label})` : ''}`,
                },
                ...d.activities,
              ],
              updatedAt: now,
            };
          }),
        }));

        safeToast.success(
          'Nova Next-Best-Action Executed',
          `${deal.accountName} · ${missingPillar ? `Locked ${missingPillar.label} & boosted momentum` : 'Momentum & win probability boosted'}`,
        );
      },

      executeGrowthPlay(playId) {
        const now = Date.now();
        const play = get().growthPlays.find((p) => p.id === playId);
        if (!play) return;
        if (play.executed) {
          safeToast.info('Growth Play already active', play.title);
          return;
        }

        set((s) => ({
          growthPlays: s.growthPlays.map((p) =>
            p.id === playId ? { ...p, executed: true, executedAt: now } : p,
          ),
          deals: s.deals.map((d) => {
            if (d.id !== play.dealId && d.accountId !== play.accountId) return d;
            const unlockedMeddpicc = {
              ...d.meddpicc,
              economicBuyer: true,
              paperProcess: play.kind === 'security_packet' ? true : d.meddpicc.paperProcess,
              champion: true,
            };
            const nextStage: DealStage =
              play.kind === 'expansion_launch' && d.stage === 'poc'
                ? 'security'
                : d.stage;
            return {
              ...d,
              stage: nextStage,
              baseWinProb: Math.min(95, d.baseWinProb + 6),
              meddpicc: unlockedMeddpicc,
              riskFlags: [],
              momentum: [...d.momentum.slice(1), Math.min(100, (d.momentum.at(-1) ?? 82) + 8)],
              activities: [
                {
                  id: `act-${now}`,
                  ts: now,
                  actorId: d.ownerId,
                  kind: 'ai_play',
                  text: `Executed Nova Autonomous Growth Play: ${play.title}`,
                },
                ...d.activities,
              ],
              updatedAt: now,
            };
          }),
        }));

        safeToast.success(
          'Nova Autonomous Play Executed ⚡',
          `${play.accountName} · +${formatCompactUsd(play.impactArr)} pipeline velocity unlocked`,
        );
      },

      launchAccountExpansion(accountId, moduleId) {
        const now = Date.now();
        const account = get().accounts.find((a) => a.id === accountId);
        if (!account) return null;

        const newDeal = createExpansionDealFromAccount(account, moduleId, now);
        const targetMod = newDeal.targetModule ?? 'novaCopilot';
        const modLabel =
          CRM_MODULES.find((m) => m.id === targetMod)?.label ?? 'Expansion';

        set((s) => ({
          deals: [newDeal, ...s.deals],
          selectedDealId: newDeal.id,
          accounts: s.accounts.map((a) => {
            if (a.id !== accountId) return a;
            return {
              ...a,
              modules: {
                ...a.modules,
                [targetMod]: {
                  ...a.modules[targetMod],
                  state: 'trial',
                  note: 'Expansion deal active in pipeline',
                },
              },
            };
          }),
        }));

        safeToast.success(
          'Expansion Deal Launched 🚀',
          `${account.name} · ${modLabel} (${formatCompactUsd(newDeal.acv)} ACV)`,
        );
        return newDeal;
      },

      togglePlaybook(playbookId) {
        const pb = get().playbooks.find((p) => p.id === playbookId);
        if (!pb) return;
        const nextEnabled = !pb.enabled;
        set((s) => ({
          playbooks: s.playbooks.map((p) =>
            p.id === playbookId ? { ...p, enabled: nextEnabled } : p,
          ),
        }));
        safeToast.info(
          nextEnabled ? 'Autonomous Playbook Armed' : 'Playbook Paused',
          pb.title,
        );
      },

      runPlaybook(playbookId) {
        const now = Date.now();
        const pb = get().playbooks.find((p) => p.id === playbookId);
        if (!pb) return;

        const upliftArr = 420_000;
        set((s) => ({
          playbooks: s.playbooks.map((p) =>
            p.id === playbookId
              ? {
                  ...p,
                  enabled: true,
                  runsCount: p.runsCount + 1,
                  pipelineGenerated: p.pipelineGenerated + upliftArr,
                  lastRunAt: now,
                }
              : p,
          ),
          signals: s.signals.map((sig) =>
            sig.matchedPlaybookId === playbookId
              ? { ...sig, actioned: true }
              : sig,
          ),
        }));

        safeToast.success(
          'Autonomous Playbook Executed ⚡',
          `${pb.title} · +${formatCompactUsd(upliftArr)} qualified expansion pipeline`,
        );
      },

      updateSimulator(patch) {
        set((s) => ({
          simulator: {
            ...s.simulator,
            ...patch,
          },
        }));
      },

      applySimulatorPreset(preset) {
        const cfg = SIMULATOR_PRESETS[preset];
        set({ simulator: structuredClone(cfg) });
        safeToast.info(
          `Simulator Preset · ${preset === 'hypergrowth' ? 'Hypergrowth Orbit' : preset === 'base' ? 'Base Plan' : 'Conservative'}`,
          `NDR ${cfg.netDollarRetention}% · Win Rate +${cfg.winRateUplift}% · Copilot Attach ${cfg.copilotAttachRate}%`,
        );
      },

      askNovaCrm(query) {
        const { accounts, deals } = get();
        const res = generateNovaCrmResponse(query, accounts, deals);
        set({ novaResponse: res });
        return res;
      },

      resetCrm() {
        const fresh = buildInitialData();
        set(fresh);
        safeToast.info('Helix CRM Reset', 'Restored autonomous revenue & pipeline seed data.');
      },
    }),
    {
      name: 'nexus-crm-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        accounts: s.accounts,
        deals: s.deals,
        growthPlays: s.growthPlays,
        signals: s.signals,
        playbooks: s.playbooks,
        simulator: s.simulator,
        novaResponse: s.novaResponse,
      }),
    },
  ),
);

export function resetCrm() {
  useCrm.getState().resetCrm();
}
