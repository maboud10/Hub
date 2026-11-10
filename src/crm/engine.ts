import {
  BASE_QUARTER_TRAJECTORY,
  CRM_MODULES,
  MEDDPICC_PILLARS,
} from './seed';
import type {
  CrmAccount,
  CrmDeal,
  CrmModuleId,
  CrmRegion,
  DealStage,
  MeddpiccPillarId,
  NovaCrmResponse,
  QuarterForecastPoint,
  RegionalPodQuota,
  SimulatorConfig,
  SimulatorProjection,
} from './types';

export function formatCompactUsd(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${m >= 10 ? m.toFixed(1) : m.toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}K`;
  }
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

export function computeMeddpiccScore(meddpicc: Record<MeddpiccPillarId, boolean>): {
  completedCount: number;
  totalCount: number;
  weightedScore: number;
  missingPillars: string[];
} {
  let completedCount = 0;
  let weightedScore = 0;
  const missingPillars: string[] = [];

  for (const p of MEDDPICC_PILLARS) {
    if (meddpicc[p.id]) {
      completedCount += 1;
      weightedScore += p.weight;
    } else {
      missingPillars.push(p.label);
    }
  }

  return {
    completedCount,
    totalCount: MEDDPICC_PILLARS.length,
    weightedScore: Math.min(100, Math.max(0, weightedScore)),
    missingPillars,
  };
}

/**
 * Dynamically computes the Neural Win Probability (0..99%) from the deal's
 * stage, baseline score, and live 8-pillar MEDDPICC coverage.
 * Toggling any MEDDPICC pillar strictly increases/decreases the probability.
 */
export function computeDealWinProbability(
  deal: Pick<CrmDeal, 'stage' | 'baseWinProb' | 'meddpicc'>,
): number {
  if (deal.stage === 'won') return 99;
  const { weightedScore } = computeMeddpiccScore(deal.meddpicc);
  const stageBonus: Record<DealStage, number> = {
    discovery: -6,
    poc: 0,
    security: 4,
    commit: 9,
    won: 30,
  };
  // Baseline assumes ~72 weighted MEDDPICC score; each pillar (weight 10..16) shifts win prob by 4..7 pts
  const delta = (weightedScore - 72) * 0.42 + (stageBonus[deal.stage] ?? 0);
  const raw = Math.round(deal.baseWinProb + delta);
  return Math.max(5, Math.min(98, raw));
}

export function nextDealStage(stage: DealStage): DealStage {
  const order: DealStage[] = ['discovery', 'poc', 'security', 'commit', 'won'];
  const idx = order.indexOf(stage);
  if (idx < 0 || idx >= order.length - 1) return 'won';
  return order[idx + 1];
}

export function computeAccountWhitespace(account: CrmAccount): {
  totalWhitespaceArr: number;
  adoptedCount: number;
  totalModules: number;
  seatUtilizationPct: number;
  isSeatConstrained: boolean;
  openModules: {
    moduleId: CrmModuleId;
    label: string;
    state: 'trial' | 'whitespace';
    potentialArr: number;
    note?: string;
  }[];
} {
  let totalWhitespaceArr = 0;
  let adoptedCount = 0;
  const openModules: {
    moduleId: CrmModuleId;
    label: string;
    state: 'trial' | 'whitespace';
    potentialArr: number;
    note?: string;
  }[] = [];

  for (const modMeta of CRM_MODULES) {
    const slot = account.modules[modMeta.id];
    if (!slot || slot.state === 'adopted') {
      adoptedCount += 1;
    } else {
      const potential = slot.potentialArr || modMeta.defaultExpansionArr;
      totalWhitespaceArr += potential;
      openModules.push({
        moduleId: modMeta.id,
        label: modMeta.label,
        state: slot.state,
        potentialArr: potential,
        note: slot.note,
      });
    }
  }

  openModules.sort((a, b) => b.potentialArr - a.potentialArr);
  const seatUtilizationPct =
    account.seatsLicensed > 0
      ? Math.round((account.seatsActive / account.seatsLicensed) * 100)
      : 0;

  return {
    totalWhitespaceArr,
    adoptedCount,
    totalModules: CRM_MODULES.length,
    seatUtilizationPct,
    isSeatConstrained: seatUtilizationPct >= 90,
    openModules,
  };
}

export function createExpansionDealFromAccount(
  account: CrmAccount,
  moduleId?: CrmModuleId,
  now = Date.now(),
): CrmDeal {
  const ws = computeAccountWhitespace(account);
  const chosenModuleId =
    moduleId ?? ws.openModules[0]?.moduleId ?? 'novaCopilot';
  const modMeta =
    CRM_MODULES.find((m) => m.id === chosenModuleId) ?? CRM_MODULES[1];
  const slot = account.modules[chosenModuleId];
  const acv =
    slot && slot.potentialArr > 0
      ? slot.potentialArr
      : modMeta.defaultExpansionArr;
  const initialStage: DealStage = slot?.state === 'trial' ? 'poc' : 'discovery';

  return {
    id: `deal-exp-${account.id}-${chosenModuleId}-${now.toString(36).slice(-4)}`,
    title: `${account.name} · ${modMeta.label} Expansion`,
    accountId: account.id,
    accountName: account.name,
    sigil: modMeta.sigil,
    color: account.color,
    stage: initialStage,
    region: account.region,
    segment: account.segment,
    acv,
    closeDate: '2027-01-30',
    ownerId: account.ownerId,
    execSponsorId: 'u-layla',
    baseWinProb: initialStage === 'poc' ? 68 : 54,
    momentum: [48, 54, 60, 66, 72, 79, 86],
    meddpicc: {
      metrics: true,
      economicBuyer: initialStage === 'poc',
      decisionCriteria: true,
      decisionProcess: false,
      paperProcess: false,
      identifyPain: true,
      champion: true,
      competition: true,
    },
    meddpiccNotes: {
      metrics: `Projected ${formatCompactUsd(acv)} expansion ROI from telemetry & seat utilization signal`,
      economicBuyer: initialStage === 'poc' ? 'Executive sponsor briefed on pilot telemetry' : 'Scheduling C-level ROI readout',
      decisionCriteria: `${modMeta.label} technical & security requirements aligned`,
      decisionProcess: 'Standard customer addendum procurement path',
      paperProcess: 'Existing Master Services Agreement in place',
      identifyPain: account.expansionSignal,
      champion: 'Active account champion driving module adoption',
      competition: 'Incumbent workspace vendor lacks native Helix integration',
    },
    riskFlags: [],
    nextBestAction: `Deliver ${modMeta.label} executive expansion proposal & lock procurement schedule.`,
    stakeholders: [
      {
        name: 'Account Executive Sponsor',
        role: 'VP Digital Operations',
        stance: 'champion',
        lastTouch: 'Just now',
      },
    ],
    activities: [
      {
        id: `act-${now}`,
        ts: now,
        actorId: account.ownerId,
        kind: 'ai_play',
        text: `Launched ${modMeta.label} expansion deal (${formatCompactUsd(acv)} ACV) from Customer 360 White-Space Radar.`,
      },
    ],
    isExpansion: true,
    targetModule: chosenModuleId,
    updatedAt: now,
  };
}

export interface CrmCommandKpis {
  liveArr: number;
  weightedPipeline: number;
  totalOpenPipeline: number;
  pipelineCoverageRatio: number;
  netDollarRetention: number;
  neuralWinRate: number;
  q4ExpansionVelocity: number;
  atRiskDealsCount: number;
}

export function computeCrmCommandKpis(
  accounts: CrmAccount[],
  deals: CrmDeal[],
): CrmCommandKpis {
  const baseAccountsArr = accounts.reduce((sum, a) => sum + a.arr, 0);
  // Adjust baseline so seed starts at $42.8M Live ARR and grows when new deals are won
  const seedWonAcv = 3_100_000;
  const currentWonAcv = deals
    .filter((d) => d.stage === 'won')
    .reduce((sum, d) => sum + d.acv, 0);
  const liveArr = Math.max(0, baseAccountsArr - 2_400_000 + (currentWonAcv - seedWonAcv));

  const openDeals = deals.filter((d) => d.stage !== 'won');
  const totalOpenPipeline = openDeals.reduce((sum, d) => sum + d.acv, 0);

  const rawWeighted = openDeals.reduce((sum, d) => {
    const prob = computeDealWinProbability(d) / 100;
    return sum + d.acv * prob;
  }, 0);
  // Calibrate weighted pipeline around $19.6M on seed state while responding live to every deal/MEDDPICC edit
  const weightedPipeline = Math.round(rawWeighted * 1.415);

  const pipelineCoverageRatio = Number(
    Math.max(1.5, totalOpenPipeline / 5_100_000).toFixed(1),
  );

  const avgNrr =
    accounts.length > 0
      ? Math.round(
          accounts.reduce((sum, a) => sum + a.nrr, 0) / accounts.length,
        )
      : 134;

  const avgOpenWinProb =
    openDeals.length > 0
      ? openDeals.reduce((sum, d) => sum + computeDealWinProbability(d), 0) /
        openDeals.length
      : 70;
  // Calibrated neural win rate around 41.8% on seed and responsive to MEDDPICC toggles
  const neuralWinRate = Number((avgOpenWinProb * 0.608).toFixed(1));

  const expansionPipeline = deals
    .filter((d) => d.isExpansion)
    .reduce((sum, d) => {
      const weight = d.stage === 'won' ? 0.45 : computeDealWinProbability(d) / 220;
      return sum + d.acv * weight;
    }, 0);
  const q4ExpansionVelocity = Math.round(expansionPipeline);

  const atRiskDealsCount = openDeals.filter((d) => d.riskFlags.length > 0).length;

  return {
    liveArr,
    weightedPipeline,
    totalOpenPipeline,
    pipelineCoverageRatio,
    netDollarRetention: avgNrr,
    neuralWinRate,
    q4ExpansionVelocity,
    atRiskDealsCount,
  };
}

export function computeTriBandTrajectory(
  accounts: CrmAccount[],
  deals: CrmDeal[],
): QuarterForecastPoint[] {
  const kpis = computeCrmCommandKpis(accounts, deals);
  const deltaArr = kpis.liveArr - 42_800_000;
  const deltaWeighted = kpis.weightedPipeline - 19_600_000;

  return BASE_QUARTER_TRAJECTORY.map((pt, idx) => {
    if (idx < 2) return pt;
    const scale = idx === 2 ? 0.45 : 1;
    return {
      quarter: pt.quarter,
      committedArr: Math.round(pt.committedArr + deltaArr * scale + Math.max(0, deltaWeighted * 0.35 * scale)),
      bestCaseArr: Math.round(pt.bestCaseArr + deltaArr * scale + deltaWeighted * 0.65 * scale),
      neuralForecastArr: Math.round(pt.neuralForecastArr + deltaArr * scale + deltaWeighted * 0.52 * scale),
    };
  });
}

export function computeSimulatorProjection(
  config: SimulatorConfig,
  accounts: CrmAccount[],
  deals: CrmDeal[],
): SimulatorProjection {
  const kpis = computeCrmCommandKpis(accounts, deals);
  const baseArr = kpis.liveArr; // ~$42.8M

  // Win rate uplift (+0% to +15%) and cycle compression (0% to 35%) compound new & open pipeline conversion
  const winFactor = 1 + (config.winRateUplift / 100) * 1.45;
  const velocityFactor = 1 + (config.cycleCompression / 100) * 0.55;
  const ndrFactor = config.netDollarRetention / 100; // 1.10 .. 1.60
  const copilotFactor = config.copilotAttachRate / 100; // 0.20 .. 0.90

  const retainedAndExpandedBase = baseArr * ndrFactor;
  const newLogoArr = Math.round(9_400_000 * winFactor * velocityFactor);
  const aiCopilotArr = Math.round(baseArr * 0.19 * copilotFactor * velocityFactor);
  const expansionArr = Math.round(
    Math.max(4_200_000, retainedAndExpandedBase - baseArr) + aiCopilotArr * 0.45,
  );

  const fy27ProjectedArr = Math.round(baseArr + newLogoArr + expansionArr);
  const basePlanRefArr = 66_400_000;
  const arrDeltaVsBase = fy27ProjectedArr - basePlanRefArr;

  const effectiveWinRate = Number(
    Math.min(68, kpis.neuralWinRate + config.winRateUplift).toFixed(1),
  );
  const avgCycleDays = Math.max(
    28,
    Math.round(74 * (1 - config.cycleCompression / 100)),
  );

  const quarterlyCurve = [1, 2, 3, 4].map((q) => {
    const progress = q / 4;
    const baselineArr = Math.round(baseArr + (basePlanRefArr - baseArr) * progress);
    const simulatedArr = Math.round(
      baseArr + (fy27ProjectedArr - baseArr) * Math.pow(progress, 0.92),
    );
    const expansionSlice = Math.round(expansionArr * progress);
    return {
      quarter: `FY27 Q${q}`,
      baselineArr,
      simulatedArr,
      expansionSlice,
    };
  });

  const podSpecs: {
    region: CrmRegion;
    leadId: string;
    quotaArr: number;
    share: number;
    color: string;
  }[] = [
    { region: 'MENA & GCC', leadId: 'u-noah', quotaArr: 28_000_000, share: 0.44, color: '#fb923c' },
    { region: 'North America', leadId: 'u-aisha', quotaArr: 17_500_000, share: 0.25, color: '#34d399' },
    { region: 'Europe', leadId: 'u-sofia', quotaArr: 12_500_000, share: 0.18, color: '#a78bfa' },
    { region: 'APAC', leadId: 'u-mei', quotaArr: 9_000_000, share: 0.13, color: '#22d3ee' },
  ];

  const regionalPods: RegionalPodQuota[] = podSpecs.map((pod) => {
    const dealCount = deals.filter((d) => d.region === pod.region).length;
    const projectedArr = Math.round(fy27ProjectedArr * pod.share);
    const attainmentPct = Math.round((projectedArr / pod.quotaArr) * 100);
    return {
      region: pod.region,
      leadId: pod.leadId,
      quotaArr: pod.quotaArr,
      projectedArr,
      attainmentPct,
      dealCount,
      color: pod.color,
    };
  });

  return {
    fy27ProjectedArr,
    arrDeltaVsBase,
    newLogoArr,
    expansionArr,
    aiCopilotArr,
    effectiveWinRate,
    avgCycleDays,
    quarterlyCurve,
    regionalPods,
  };
}

export function generateNovaCrmResponse(
  query: string,
  accounts: CrmAccount[],
  deals: CrmDeal[],
  now = Date.now(),
): NovaCrmResponse {
  const q = query.toLowerCase();
  const kpis = computeCrmCommandKpis(accounts, deals);

  if (q.includes('neom') || q.includes('closing plan')) {
    const neomDeal = deals.find((d) => d.accountId === 'acc-neom') ?? deals[0];
    const winProb = neomDeal ? computeDealWinProbability(neomDeal) : 86;
    const med = neomDeal ? computeMeddpiccScore(neomDeal.meddpicc) : { completedCount: 7, totalCount: 8, missingPillars: ['Paper Process'] };
    return {
      id: `nova-${now}`,
      query,
      headline: 'Executive Closing Plan · NEOM Cognitive Mobility ($3.40M Q4 Commit)',
      summary:
        'NEOM is at 98% seat utilization (4,410/4,500 seats) with a 3.4x Arabic RTL telemetry surge across Tabuk command pods. 7 of 8 MEDDPICC pillars are locked; clearing the Sovereign BYOK Annex-B redline lifts win probability to 94%.',
      confidence: 95,
      metrics: [
        { label: 'Deal ACV', value: '$3.40M', sub: 'Q4 Commit · Dec 18', tone: 'amber' },
        { label: 'Neural Win Prob', value: `${winProb}%`, sub: `${med.completedCount}/8 MEDDPICC locked`, tone: 'emerald' },
        { label: 'Seat Utilization', value: '98.0%', sub: '4,410 / 4,500 active', tone: 'rose' },
      ],
      bullets: [
        'Step 1 (Today): Auto-dispatch Sovereign BYOK Annex-B legal packet signed by Layla Haddad (Head of IT & Security) to Procurement Counsel Faisal Al-Dossary.',
        'Step 2 (Within 24h): Bundle 420-user Nova AI Copilot pilot metrics ($14.2M annual shuttle command savings) into final order schedule.',
        'Step 3 (Dec 14): Executive sponsor sync between Dr. Tariq Al-Harbi (SVP Cognitive Infrastructure) and Noah Kim to countersign Q4 agreement.',
      ],
      recommendedAction: {
        label: 'Execute NEOM Sovereign BYOK & Commit Play',
        kind: 'execute_play',
        playId: 'play-neom-close',
        dealId: 'deal-neom-q4',
      },
      createdAt: now,
    };
  }

  if (q.includes('risk') || q.includes('champion') || q.includes('security')) {
    const risky = deals.filter((d) => d.stage !== 'won' && d.riskFlags.length > 0);
    const totalRiskAcv = risky.reduce((s, d) => s + d.acv, 0);
    return {
      id: `nova-${now}`,
      query,
      headline: `MEDDPICC & Security Risk Audit · ${risky.length} Active Enterprise Deals (${formatCompactUsd(totalRiskAcv)} ACV)`,
      summary:
        'Nova scanned call transcripts, Trust Center telemetry, and MEDDPICC coverage across your Q4/Q1 pipeline. The highest-leverage interventions are on Nordic Bank AB (stalled 9d in Security + missing CFO touch) and Meridian Health (Champion role change).',
      confidence: 93,
      metrics: [
        { label: 'At-Risk ACV', value: formatCompactUsd(totalRiskAcv), sub: `${risky.length} deals flagged`, tone: 'rose' },
        { label: 'Security Bottleneck', value: 'Nordic Bank ($2.18M)', sub: '9d in EU DORA HSM review', tone: 'amber' },
        { label: 'Champion Gap', value: 'Meridian ($2.85M)', sub: 'Multi-thread VP Nursing Info', tone: 'violet' },
      ],
      bullets: [
        'Nordic Bank AB ($2.18M · Security): Economic Buyer & Paper Process open. Auto-attach Zero-Trust DORA HSM Evidence Room and co-thread Daniel Okafor to Group CFO Henrik Lindqvist.',
        'Meridian Health Systems ($2.85M · Security): CISO read HIPAA packet 14x, but primary clinical sponsor moved to Board role. Activate Dr. Elena Cho (VP Nursing Informatics) as Champion.',
        'NEOM Cognitive Mobility ($3.40M · Commit): Only Paper Process (Annex-B BYOK) remains open before Dec 18 close.',
      ],
      recommendedAction: {
        label: 'Execute Nordic Bank CFO + DORA Vault Play',
        kind: 'execute_play',
        playId: 'play-nordic-multithread',
        dealId: 'deal-nordic-vault',
      },
      createdAt: now,
    };
  }

  if (q.includes('copilot') || q.includes('expansion') || q.includes('whitespace') || q.includes('white-space')) {
    const copilotCandidates = accounts.filter(
      (a) => a.modules.novaCopilot.state !== 'adopted',
    );
    const totalPot = copilotCandidates.reduce(
      (s, a) => s + a.modules.novaCopilot.potentialArr,
      0,
    );
    return {
      id: `nova-${now}`,
      query,
      headline: `Nova AI Copilot Expansion Radar · ${copilotCandidates.length} High-Intent Accounts (${formatCompactUsd(totalPot)} White-Space)`,
      summary:
        'Product telemetry shows surging autonomous workflow usage and seat compression across MENA & North America accounts that have not yet licensed enterprise-wide Nova AI Copilot.',
      confidence: 96,
      metrics: [
        { label: 'Copilot White-Space', value: formatCompactUsd(totalPot), sub: `Across ${copilotCandidates.length} enterprise accounts`, tone: 'cyan' },
        { label: 'Top Trial Surge', value: 'NEOM ($1.45M)', sub: '420 engineers active in pilot', tone: 'emerald' },
        { label: 'Ready to Launch', value: 'Meridian ($1.10M)', sub: '90% seat utilization + HIPAA ready', tone: 'violet' },
      ],
      bullets: [
        'NEOM Cognitive Mobility ($1.45M Copilot potential): 420 engineers in active trial + 98% seat utilization.',
        'Meridian Health Systems ($1.10M Copilot potential): Clinical ops triage copilot ready following 14x CISO security packet verification.',
        'Al-Futtaim Digital ($920K Copilot potential): Bilingual Arabic/English pilot achieved 94% CSAT across 300 regional managers.',
        'Emirates Flight Catering ($740K Copilot potential): 93.4% DXB Terminal 3 seat utilization driving urgent shift-forecasting AI demand.',
      ],
      recommendedAction: {
        label: 'Launch Emirates Flight Catering AI Expansion Deal ($740K)',
        kind: 'launch_expansion',
        accountId: 'acc-emirates',
      },
      createdAt: now,
    };
  }

  // Default / Forecast Q4 Commit vs Neural AI projection
  const trajectory = computeTriBandTrajectory(accounts, deals);
  const q4 = trajectory[3];
  return {
    id: `nova-${now}`,
    query,
    headline: `Q4 Autonomous Revenue Trajectory · ${formatCompactUsd(q4.neuralForecastArr)} Neural Forecast vs ${formatCompactUsd(q4.committedArr)} Commit`,
    summary: `Nova synthesized live MEDDPICC pillar velocity, Trust Center dark-funnel signals, and NRR expansion curves (${kpis.netDollarRetention}% NRR). Neural AI projects +${formatCompactUsd(q4.neuralForecastArr - q4.committedArr)} upside above baseline Commit by executing active Q4 closing plays.`,
    confidence: 94,
    metrics: [
      { label: 'Q4 Committed ARR', value: formatCompactUsd(q4.committedArr), sub: '+38% YoY locked floor', tone: 'cyan' },
      { label: 'Nova Neural Forecast', value: formatCompactUsd(q4.neuralForecastArr), sub: `+${formatCompactUsd(q4.neuralForecastArr - q4.committedArr)} AI upside`, tone: 'emerald' },
      { label: 'Q4 Best Case Orbit', value: formatCompactUsd(q4.bestCaseArr), sub: `${kpis.pipelineCoverageRatio}x pipeline coverage`, tone: 'violet' },
    ],
    bullets: [
      `Commit Core: NEOM ($3.40M), ADNOC Logistics ($2.65M), and SingTel Quantum Mesh ($2.42M) anchor $8.47M in high-probability Q4 Commit ACV.`,
      `Security-Stage Swing: Clearing Nordic Bank ($2.18M) and Meridian Health ($2.85M) via Zero-Trust auto-rooms unlocks $5.03M in immediate Q4 pull-forward.`,
      `Net Dollar Retention sits at ${kpis.netDollarRetention}% driven by MENA sovereign cloud & Nova AI Copilot attach.`,
    ],
    recommendedAction: {
      label: 'Execute Al-Futtaim Bilingual AI Pilot Advancement',
      kind: 'execute_play',
      playId: 'play-alfuttaim-copilot',
      dealId: 'deal-alfuttaim-gcc',
    },
    createdAt: now,
  };
}
