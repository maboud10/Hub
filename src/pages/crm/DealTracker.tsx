import type { ReactNode } from 'react';
import { Compass, FlaskConical, Handshake, ShieldCheck, Trophy } from 'lucide-react';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { cx } from '@/lib/cx';
import { firstName, relativeTime } from '@/lib/format';
import type { User } from '@/types';
import { DEAL_STAGES, MEDDPICC_PILLARS } from '@/crm/seed';
import type {
  CrmAccount,
  CrmDeal,
  DealStage,
  DealStakeholder,
  MeddpiccPillarId,
} from '@/crm/types';

/* ==========================================================================
   Deal tracker — the DealStage journey (Discovery → POC / Pilot → Security
   Review → Commit → Closed Won) on the shared NeoTracker.

   Nothing here is decorative: every part is read from the live CRM record.
   - current   · `deal.stage` (complete once Closed Won)
   - state     · blocked when a risk flag says the stage stalled, paused when a
                 risk flag says we're waiting on the buyer, otherwise active
   - progress  · weighted share of the live stage's MEDDPICC exit criteria
                 already locked, so verifying a pillar moves the courier
   - message   · the deal owner (hub user) + the heaviest open exit criterion,
                 or the risk flag behind a blocked / paused stage
   - sub / at  · the pod and buying committee per stage, stage-move activity
                 times and the close date

   Copy rule (Arabic DOM translator): static phrases and dynamic values (names,
   dates, flags) always render as separate text nodes.
   ========================================================================== */

type OpenStage = Exclude<DealStage, 'won'>;

const DAY = 86_400_000;

const WON_LABEL = DEAL_STAGES.find((s) => s.id === 'won')?.label ?? 'Closed Won';

const STAGE_ICONS: Record<DealStage, ReactNode> = {
  discovery: <Compass />,
  poc: <FlaskConical />,
  security: <ShieldCheck />,
  commit: <Handshake />,
  won: <Trophy />,
};

/**
 * MEDDPICC exit criteria: the pillars a deal has to lock before it is ready to
 * leave each stage. Commit needs all eight, the same set the store locks when a
 * deal is marked Closed Won.
 */
const STAGE_GATES: Record<OpenStage, MeddpiccPillarId[]> = {
  discovery: ['identifyPain', 'metrics', 'champion', 'economicBuyer', 'decisionCriteria'],
  poc: ['decisionCriteria', 'competition', 'metrics', 'champion', 'economicBuyer'],
  security: ['paperProcess', 'decisionProcess', 'economicBuyer', 'champion'],
  commit: MEDDPICC_PILLARS.map((p) => p.id),
};

const PILLAR_WEIGHT = Object.fromEntries(MEDDPICC_PILLARS.map((p) => [p.id, p.weight])) as Record<
  MeddpiccPillarId,
  number
>;

/** Risk flags are free text: these mark the live stage as stalled (blocked) or waiting on the buyer (paused). */
const STALLED_FLAG = /\b(stall(?:s|ed|ing)?|stuck|blocked|blocker)\b/i;
const WAITING_FLAG = /\b(await(?:s|ing)?|waiting|pending|on hold)\b/i;

/** What the deal owner is doing in each open stage (the name renders separately, before it). */
const STAGE_DOING: Record<OpenStage, string> = {
  discovery: ' is scoping the architecture',
  poc: ' is running the pilot',
  security: ' is lining up the security review',
  commit: ' is steering it to signature',
};

/** The heaviest open exit criterion, in plain words. */
const GAP_COPY: Record<MeddpiccPillarId, string> = {
  metrics: 'ROI case not signed off yet',
  economicBuyer: 'still no Economic Buyer',
  decisionCriteria: 'decision criteria still fuzzy',
  decisionProcess: 'approval path not mapped yet',
  paperProcess: 'paperwork still with legal',
  identifyPain: 'pain not proven yet',
  champion: 'still hunting for a champion',
  competition: 'competition still in play',
};

/** Compact rows only need the stage names. */
const COMPACT_STEPS: NeoTrackStep[] = DEAL_STAGES.map((s) => ({ id: s.id, label: s.shortLabel }));

export interface DealJourney {
  /** 0-based index of `deal.stage` in DEAL_STAGES. */
  stageIndex: number;
  /** NeoTracker `current`: the stage index, or DEAL_STAGES.length once Closed Won. */
  current: number;
  state: NeoTrackState;
  /** The risk flag behind a blocked / paused state. */
  reason?: string;
  /** Heaviest MEDDPICC exit criterion still open for the live stage; `null` = ready to advance. */
  gap: MeddpiccPillarId | null;
  /** 0..1 weighted share of the live stage's exit criteria already locked. */
  progress: number;
}

export function deriveDealJourney(deal: CrmDeal): DealJourney {
  const stageIndex = Math.max(
    0,
    DEAL_STAGES.findIndex((s) => s.id === deal.stage),
  );
  if (deal.stage === 'won') {
    return { stageIndex, current: DEAL_STAGES.length, state: 'done', gap: null, progress: 1 };
  }

  let total = 0;
  let locked = 0;
  let gap: MeddpiccPillarId | null = null;
  for (const id of STAGE_GATES[deal.stage] ?? []) {
    const weight = PILLAR_WEIGHT[id] ?? 0;
    total += weight;
    if (deal.meddpicc[id]) locked += weight;
    else if (!gap || weight > PILLAR_WEIGHT[gap]) gap = id;
  }

  const stalled = deal.riskFlags.find((f) => STALLED_FLAG.test(f));
  const waiting = deal.riskFlags.find((f) => WAITING_FLAG.test(f));
  return {
    stageIndex,
    current: stageIndex,
    state: stalled ? 'blocked' : waiting ? 'paused' : 'active',
    reason: stalled ?? waiting,
    gap,
    progress: total > 0 ? locked / total : 0,
  };
}

/* ---------- Dates ---------- */

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date(iso);
}

/**
 * "Dec 18" (plus the year when it isn't this year). Formatted in English on
 * purpose: the Arabic DOM translator maps the month names.
 */
export function formatDealDate(value: string | number, now = new Date()): string {
  const date = typeof value === 'number' ? new Date(value) : parseDay(value);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('en-US', opts);
}

/** Whole days from today to the close date (negative once it has slipped). */
export function daysToClose(deal: Pick<CrmDeal, 'closeDate'>, now = Date.now()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDay(deal.closeDate).getTime() - today.getTime()) / DAY);
}

/** When the deal last moved into a stage, from the store's own stage-move activity. */
function reachedAt(deal: CrmDeal, stageLabel: string): number | undefined {
  const text = `Moved deal stage to ${stageLabel}.`;
  let ts: number | undefined;
  for (const a of deal.activities) {
    if (a.kind === 'stage_move' && a.text === text && (ts === undefined || a.ts > ts)) ts = a.ts;
  }
  return ts;
}

/** "Closes Dec 18" · "Slipped past Dec 18" · "Won Nov 4". */
export function DealCloseDate({ deal }: { deal: CrmDeal }) {
  if (deal.stage === 'won') {
    return (
      <>
        {'Won'} <span className="crm-trk-date">{formatDealDate(reachedAt(deal, WON_LABEL) ?? deal.closeDate)}</span>
      </>
    );
  }
  return (
    <>
      {daysToClose(deal) < 0 ? 'Slipped past' : 'Closes'}{' '}
      <span className="crm-trk-date">{formatDealDate(deal.closeDate)}</span>
    </>
  );
}

/* ---------- Buying committee ---------- */

function findChampion(deal: CrmDeal): DealStakeholder | undefined {
  return deal.stakeholders.find((s) => s.stance === 'champion');
}

/** The committee member tagged Economic Buyer, or the one named in the deal's Economic Buyer MEDDPICC note. */
function findEconomicBuyer(deal: CrmDeal): DealStakeholder | undefined {
  const note = deal.meddpiccNotes?.economicBuyer ?? '';
  return (
    deal.stakeholders.find((s) => /economic buyer/i.test(s.role)) ??
    deal.stakeholders.find((s) => note.includes(s.name) || (s.role.length > 3 && note.includes(s.role)))
  );
}

/** "Noah · AE" — one text node the translator splits on ' · '. */
const who = (name: string | undefined, role: string) => (name ? `${name} · ${role}` : role);

const Who = ({ children }: { children: ReactNode }) => <b className="crm-trk-who">{children}</b>;

const Dash = () => <span className="crm-trk-dash">{' — '}</span>;

/* ---------- Trackers ---------- */

export interface DealTrackerProps {
  deal: CrmDeal;
  /** Hub users by id (`useCrmUsersMap`). */
  users: Map<string, User>;
  /** The account record behind the deal, when it really is the same company (for the CSM). */
  account?: CrmAccount;
  actions?: ReactNode;
  className?: string;
}

/** Full journey card for the single-deal view (Deal 360 inspector). */
export function DealTracker({ deal, users, account, actions, className }: DealTrackerProps) {
  const journey = deriveDealJourney(deal);
  const won = deal.stage === 'won';
  const owner = users.get(deal.ownerId);
  const sponsor = users.get(deal.execSponsorId);
  const csm = account ? users.get(account.csmId) : undefined;
  const ownerFirst = owner ? firstName(owner.name) : undefined;
  const sponsorFirst = sponsor ? firstName(sponsor.name) : undefined;
  const lead = ownerFirst ?? 'The deal team';
  const champion = findChampion(deal);
  const economicBuyer = findEconomicBuyer(deal);
  const days = daysToClose(deal);

  const sub: Record<DealStage, string> = {
    discovery: who(ownerFirst, 'AE'),
    poc: champion ? who(champion.name, 'Champion') : who(ownerFirst, 'AE'),
    security: who(sponsorFirst, 'Exec sponsor'),
    commit: economicBuyer ? who(economicBuyer.name, 'Economic Buyer') : who(sponsorFirst, 'Exec sponsor'),
    won: csm ? who(firstName(csm.name), 'CSM') : who(ownerFirst, 'AE'),
  };

  const steps: NeoTrackStep[] = DEAL_STAGES.map((s, i) => {
    let at: string | undefined;
    if (s.id === 'won') {
      const wonAt = reachedAt(deal, s.label);
      if (won) at = wonAt ? relativeTime(wonAt) : formatDealDate(deal.closeDate);
      else if (days > 0) at = `in ${days}d`;
      else if (days === 0) at = 'Today';
    } else if (i <= journey.stageIndex) {
      const ts = reachedAt(deal, s.label);
      if (ts) at = relativeTime(ts);
    }
    return { id: s.id, label: s.shortLabel, icon: STAGE_ICONS[s.id], sub: sub[s.id], at };
  });

  let message: ReactNode;
  if (deal.stage === 'won') {
    const handler = csm ?? owner;
    message = (
      <>
        <Who>{handler ? firstName(handler.name) : lead}</Who>
        <span>{' is taking it live'}</span>
        {owner && handler && owner.id !== handler.id && (
          <>
            <Dash />
            <span>{'closed by '}</span>
            <Who>{firstName(owner.name)}</Who>
          </>
        )}
      </>
    );
  } else if (journey.state === 'blocked' || journey.state === 'paused') {
    message = (
      <>
        <Who>{lead}</Who>
        <span>{journey.state === 'blocked' ? ' is working to unblock it' : ' is waiting on the customer'}</span>
        <Dash />
        <span className="crm-trk-why">{journey.reason}</span>
      </>
    );
  } else {
    const next = DEAL_STAGES[journey.stageIndex + 1];
    message = (
      <>
        <Who>{lead}</Who>
        <span>{STAGE_DOING[deal.stage]}</span>
        <Dash />
        {journey.gap ? (
          <span>{GAP_COPY[journey.gap]}</span>
        ) : deal.stage === 'commit' || !next ? (
          <span>{'ready to sign'}</span>
        ) : (
          <span>
            {'ready for '}
            <b>{next.shortLabel}</b>
          </span>
        )}
      </>
    );
  }

  return (
    <NeoTracker
      className={cx('crm-trk', className)}
      hud="Deal tracker"
      title={DEAL_STAGES[journey.stageIndex]?.label}
      label="Deal tracker"
      steps={steps}
      current={journey.current}
      state={journey.state}
      progress={journey.progress}
      eta={<DealCloseDate deal={deal} />}
      actions={actions}
      message={message}
    />
  );
}

/** Slim bar + live stage for rows and cards; hovering shows the flag behind a blocked / paused stage. */
export function DealTrackerCompact({ deal, className }: { deal: CrmDeal; className?: string }) {
  const journey = deriveDealJourney(deal);
  return (
    <div className={cx('crm-trk-compact', className)} title={journey.reason}>
      <NeoTracker
        compact
        steps={COMPACT_STEPS}
        current={journey.current}
        state={journey.state}
        progress={journey.progress}
        label={`Deal tracker · ${deal.accountName}`}
      />
    </div>
  );
}
