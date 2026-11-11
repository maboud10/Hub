/**
 * Helix Procurement — NeoTracker wiring.
 *   <PurchaseTracker req />          "Purchase tracker": approval gates → PO issued
 *   <PurchaseTracker req compact />  slim bar + live gate for rows and cards
 *   <PoTracker po />                 PO issued → receipt → invoice → 3-way match → ledger (compact)
 * Steps, live stage, mood, SLA ETA and courier position all come from the
 * procurement store via ./purchaseJourney.ts — nothing here is staged.
 *
 * i18n: the Arabic DOM translator matches whole text nodes, so dynamic values
 * (names, vendors, hours, PO numbers, reviewer notes) always sit in their own
 * element and every static fragment is a complete phrase on its own.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClipboardList, FileCheck2, Landmark, Scale, ShieldCheck, Wallet } from 'lucide-react';
import { NeoTracker, type NeoTrackStep } from '@/components/neo';
import { SEED_USERS } from '@/data/users';
import { cx } from '@/lib/cx';
import { firstName, formatDateTime, relativeTime } from '@/lib/format';
import type { ApprovalStageId, PurchaseOrder, PurchaseRequest } from '@/procurement/types';
import { useHub } from '@/store/hub';
import type { User } from '@/types';
import {
  derivePoJourney,
  derivePurchaseJourney,
  formatHours,
  GATE_LABEL,
  hoursBetween,
  PO_JOURNEY_LABELS,
  PO_STEP_LABEL,
  type PurchaseJourney,
  type PurchaseJourneyReason,
} from './purchaseJourney';

type UserMap = Map<string, User>;

const GATE_ICON: Record<ApprovalStageId, ReactNode> = {
  requester: <ClipboardList />,
  budget_owner: <Wallet />,
  security_privacy: <ShieldCheck />,
  legal_redline: <Scale />,
  finance_controller: <Landmark />,
};

/** Headline for the full tracker, per journey state. */
const TITLE: Record<PurchaseJourneyReason, string> = {
  review: 'Moving through approvals',
  flagged: 'Changes requested',
  rejected: 'Request declined',
  negotiating: 'On hold for pricing',
  with_requester: 'Back with the requester',
  ready_for_po: 'Cleared for a PO',
  po_issued: 'PO sent to the vendor',
};

/** What the live gate's reviewer is doing — rendered right after their name. */
const REVIEW_LINE: Partial<Record<ApprovalStageId, string>> = {
  budget_owner: ' is checking it against the budget',
  security_privacy: ' is vetting the vendor on security & privacy',
  legal_redline: ' is red-lining the contract',
  finance_controller: ' is giving it the final finance sign-off',
};

const PO_STEPS: NeoTrackStep[] = PO_JOURNEY_LABELS.map((label) => ({ id: label, label }));

function useUserMap(): UserMap {
  const users = useHub((s) => s.users);
  return useMemo(() => new Map((users.length ? users : SEED_USERS).map((u) => [u.id, u])), [users]);
}

/** Re-render once a minute so SLA countdowns stay honest on a long-open page. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
}

function Ago({ ts }: { ts: number }) {
  return (
    <time dateTime={new Date(ts).toISOString()} title={formatDateTime(ts)}>
      {relativeTime(ts)}
    </time>
  );
}

/** First name of whoever handles a stage (in its own element for the translator). */
function Who({ id, users }: { id?: string; users: UserMap }) {
  const user = id ? users.get(id) : undefined;
  return <b>{user ? firstName(user.name) : 'The reviewer'}</b>;
}

/** Reviewer's own note from the stage (free text, shown after an em dash). */
function Note({ text }: { text?: string }) {
  return text ? <span className="pr-trk-note">{text}</span> : null;
}

function purchaseSteps(req: PurchaseRequest, journey: PurchaseJourney, users: UserMap): NeoTrackStep[] {
  const gates = journey.gates.map<NeoTrackStep>((gate) => {
    const reviewer = users.get(gate.reviewerId);
    const signed = gate.status === 'approved';
    return {
      id: gate.id,
      label: GATE_LABEL[gate.id] ?? gate.label,
      icon: GATE_ICON[gate.id],
      sub: (
        <span title={reviewer ? `${reviewer.name} · ${reviewer.title}` : undefined}>
          {reviewer ? firstName(reviewer.name) : gate.reviewerId}
        </span>
      ),
      // Signed gates show when they signed; open gates show their SLA budget.
      at: signed ? gate.completedAt ? <Ago ts={gate.completedAt} /> : undefined : `SLA · ${formatHours(gate.slaHours)}`,
    };
  });
  const issued = req.status === 'po_issued';
  return [
    ...gates,
    {
      id: 'po',
      label: PO_STEP_LABEL,
      icon: <FileCheck2 />,
      sub: issued && req.linkedPoId ? req.linkedPoId : req.vendorName,
      at: issued ? <Ago ts={req.updatedAt} /> : undefined,
    },
  ];
}

/** Domino's-style live line naming the person who has the request right now. */
function PurchaseMessage({ req, journey, users }: { req: PurchaseRequest; journey: PurchaseJourney; users: UserMap }) {
  const { live } = journey;
  switch (journey.reason) {
    case 'review':
      return (
        <>
          <Who id={live?.reviewerId} users={users} />
          {(live && REVIEW_LINE[live.id]) ?? ' is reviewing it'}
          <Note text={live?.note} />
        </>
      );
    case 'flagged':
      return live?.note ? (
        <>
          <Who id={live.reviewerId} users={users} />
          {' flagged it'}
          <Note text={live.note} />
        </>
      ) : (
        <>
          <Who id={live?.reviewerId} users={users} />
          {' flagged it for changes'}
        </>
      );
    case 'rejected':
      return live ? (
        <>
          <Who id={live.reviewerId} users={users} />
          {' declined it'}
          <Note text={live.note} />
        </>
      ) : (
        <>This request was declined</>
      );
    case 'negotiating':
      return (
        <>
          {live ? (
            <>
              <Who id={live.reviewerId} users={users} />
              {' is holding sign-off while Nova negotiates with '}
            </>
          ) : (
            'The PO is on hold while Nova negotiates with '
          )}
          <b>{req.vendorName}</b>
        </>
      );
    case 'with_requester':
      return (
        <>
          <Who id={live?.reviewerId ?? req.requesterId} users={users} />
          {' needs to add a few details before it can move on'}
          <Note text={live?.note} />
        </>
      );
    case 'ready_for_po':
      return journey.lastCleared ? (
        <>
          <Who id={journey.lastCleared.reviewerId} users={users} />
          {' cleared the final gate — the PO is ready to issue'}
        </>
      ) : (
        <>Every gate is cleared — the PO is ready to issue</>
      );
    case 'po_issued':
      return (
        <>
          {req.linkedPoId ? <b>{req.linkedPoId}</b> : 'The PO'}
          {' is out — '}
          <b>{req.vendorName}</b>
          {' has it'}
        </>
      );
  }
}

/** ETA chip: the live gate's SLA (start + SLA hours vs now), or how the journey ended. */
function purchaseEta(req: PurchaseRequest, journey: PurchaseJourney): ReactNode {
  if (journey.reason === 'po_issued') {
    return `Cycle time · ${formatHours(hoursBetween(req.createdAt, req.updatedAt))}`;
  }
  if (journey.reason === 'ready_for_po') {
    const at = journey.lastCleared?.completedAt;
    return at ? `Cleared · ${relativeTime(at)}` : null;
  }
  const { sla } = journey;
  if (!sla || journey.reason === 'rejected') return null;
  return sla.overdue ? (
    <span className="pr-trk-eta" data-late="">
      {'Overdue by '}
      <b>{formatHours(sla.hoursLeft)}</b>
    </span>
  ) : (
    <span className="pr-trk-eta">
      <b>{formatHours(sla.hoursLeft)}</b>
      {' left on SLA'}
    </span>
  );
}

export interface PurchaseTrackerProps {
  req: PurchaseRequest;
  /** Slim bar + live gate for rows and cards. */
  compact?: boolean;
  /** No card chrome (when the tracker already sits inside a card). */
  bare?: boolean;
  /** State headline — off where the card already carries the request title. */
  showTitle?: boolean;
  className?: string;
}

/** "Purchase tracker": requester → budget → security → legal → finance → PO issued. */
export function PurchaseTracker({ req, compact, bare, showTitle = true, className }: PurchaseTrackerProps) {
  useMinuteTick();
  const users = useUserMap();
  const journey = derivePurchaseJourney(req, Date.now());
  const shared = {
    steps: purchaseSteps(req, journey, users),
    current: journey.current,
    state: journey.mood,
    // Courier = share of the live gate's SLA window already used.
    progress: journey.sla?.elapsed,
    label: `${req.id} · Purchase tracker`,
    className: cx('pr-trk', className),
  };

  if (compact) return <NeoTracker {...shared} compact />;

  return (
    <NeoTracker
      {...shared}
      bare={bare}
      hud="Purchase tracker"
      title={showTitle ? TITLE[journey.reason] : undefined}
      eta={purchaseEta(req, journey)}
      message={<PurchaseMessage req={req} journey={journey} users={users} />}
    />
  );
}

/** Compact PO journey for purchase-order rows. */
export function PoTracker({ po, className }: { po: PurchaseOrder; className?: string }) {
  const journey = derivePoJourney(po);
  return (
    <NeoTracker
      compact
      steps={PO_STEPS}
      current={journey.current}
      state={journey.mood}
      progress={journey.progress}
      label={`${po.id} · PO tracker`}
      className={cx('pr-trk', className)}
    />
  );
}
