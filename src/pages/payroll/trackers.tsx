/**
 * Payroll Console — NeoTracker journeys, the "pizza trackers" of the Payday deck:
 * the pay run lifecycle (draft → four-eyes sign-off → WPS bank release → paid),
 * bonus awards, and reimbursement claims riding the monthly run.
 *
 * Every stage, name, date and courier position comes from the live stores. Names,
 * dates, counts and amounts sit in their own elements so Arabic mode (which
 * translates DOM text nodes by exact match) can translate the wording around them.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { Banknote, FileCode2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { User } from '@/types';
import type { ExpenseReport } from '@/expenses/types';
import type { BenefitClaim } from '@/hr/types';
import { buildPayrollViewer, canCounterSignRun } from '@/payroll/access';
import { periodDates } from '@/payroll/engine';
import { usePayrollCaps } from '@/payroll/selectors';
import type { BonusAward, BonusStatus, PayrollRun, PayrollRunStatus } from '@/payroll/types';
import { useHub } from '@/store/hub';
import { firstName, formatDateTime, pluralize, relativeTime } from '@/lib/format';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { compactAed } from './shared';

/* ---------- Dates & courier position ---------- */

/** Local timestamp for a `YYYY-MM-DD` date at `hour`. */
function isoTs(iso: string, hour = 12): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hour).getTime();
}

/** "2026-11-25" → "Nov 25" (English; Arabic mode swaps the month token). */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/** Elapsed share (0..1) of the window `from → to` — places the courier inside the live stage. */
function elapsed(from: number | undefined, to: number, now = Date.now()): number | undefined {
  if (from === undefined) return undefined;
  if (now >= to) return 1;
  if (to <= from) return 0;
  return Math.max(0, (now - from) / (to - from));
}

/** Live stage index per run status (`paid` = journey complete). */
const RUN_STAGE: Record<PayrollRunStatus, number> = { draft: 0, pending_signoff: 1, approved_ready: 2, paid: 4 };

/**
 * Items queued into a pay run ride it, so their courier sits at that run's own
 * stage: ¼ while it is a draft, ½ at four-eyes sign-off, ¾ once approved.
 */
function rideProgress(run: PayrollRun | undefined): number {
  return run ? (Math.min(RUN_STAGE[run.status], 3) + 1) / 4 : 0;
}

/** The open (unpaid) run an item queued for `period` settles with — the earliest one at or after it. */
export function ridingRun(runs: PayrollRun[], period?: string): PayrollRun | undefined {
  return runs
    .filter((r) => r.status !== 'paid' && (!period || r.period >= period))
    .sort((a, b) => a.period.localeCompare(b.period))[0];
}

/* ---------- People ---------- */

/** A first name in its own element — Arabic mode maps person names by exact match. */
function Name({ user, id }: { user?: User; id?: string }) {
  return <b>{user ? firstName(user.name) : (id ?? '—')}</b>;
}

/** "Sara" · "Sara or Layla" · "Sara, Grace or Layla" — names and joiners as separate text nodes. */
function Names({ users }: { users: User[] }) {
  return (
    <>
      {users.map((u, i) => (
        <Fragment key={u.id}>
          {i > 0 && (i === users.length - 1 ? ' or ' : ', ')}
          <Name user={u} />
        </Fragment>
      ))}
    </>
  );
}

/** Who handled a stage, for a step `sub`: "Sara · People Ops". */
function Who({ user, id }: { user?: User; id?: string }) {
  return (
    <>
      <Name user={user} id={id} />
      {user && (
        <>
          {' · '}
          <span>{user.department}</span>
        </>
      )}
    </>
  );
}

/** Relative-time chip for a step `at`, with the exact timestamp on hover. */
function when(ts: number | undefined): ReactNode {
  return ts ? (
    <time dateTime={new Date(ts).toISOString()} title={formatDateTime(ts)}>
      {relativeTime(ts)}
    </time>
  ) : undefined;
}

/**
 * Everyone the four-eyes gate lets counter-sign `run` (the store's own rule,
 * `canCounterSignRun`), people who counter-signed recent runs first.
 */
function useCounterSigners(run: PayrollRun, runs: PayrollRun[]): User[] {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => {
    if (run.status !== 'pending_signoff') return [];
    const eligible = users.filter((u) => canCounterSignRun(buildPayrollViewer(u, roles), run).ok);
    // A System Admin may sign their own run — only list them when nobody else can.
    const second = eligible.filter((u) => u.id !== run.preparedBy);
    const recent = runs.map((r) => r.approvedBy).filter((id): id is string => Boolean(id));
    const rank = (u: User) => {
      const i = recent.indexOf(u.id);
      return i === -1 ? recent.length : i;
    };
    return (second.length ? second : eligible).sort((a, b) => rank(a) - rank(b));
  }, [users, roles, run, runs]);
}

/* ==========================================================================
   Payday tracker — the pay run lifecycle
   ========================================================================== */

/**
 * Pay run as the "Payday tracker": draft (live sync) → four-eyes sign-off →
 * WPS bank release → paid. Names the preparer, the eligible counter-signers,
 * the approver and the releaser; payday is the ETA.
 */
export function PaydayTracker({ run, runs, className }: { run: PayrollRun; runs: PayrollRun[]; className?: string }) {
  const users = useHub((s) => s.users);
  const caps = usePayrollCaps();
  const signers = useCounterSigners(run, runs);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const s = run.status;
  const current = RUN_STAGE[s];
  const preparer = run.preparedBy ? userById.get(run.preparedBy) : undefined;
  const approver = run.approvedBy ? userById.get(run.approvedBy) : undefined;
  const disburser = run.disbursedBy ? userById.get(run.disbursedBy) : undefined;
  const me = caps.viewer ? userById.get(caps.viewer.userId) : undefined;
  const myTurn = s === 'pending_signoff' && canCounterSignRun(caps.viewer, run).ok;
  // Nobody can give the run its second signature: the four-eyes rule holds it.
  const blocked = s === 'pending_signoff' && signers.length === 0;
  const state: NeoTrackState = s === 'paid' ? 'done' : blocked ? 'blocked' : 'active';
  const waitingOn = (myTurn && me ? [me, ...signers.filter((u) => u.id !== me.id)] : signers).slice(0, 2);
  const cutoff = dayLabel(run.cutoffDate);

  const steps: NeoTrackStep[] = [
    {
      id: 'draft',
      label: 'Draft',
      icon: <RefreshCw />,
      sub:
        current === 0 ? (
          <span>{pluralize(run.headcount, 'employee')}</span>
        ) : run.preparedBy ? (
          <Who user={preparer} id={run.preparedBy} />
        ) : undefined,
      at:
        current > 0 ? (
          when(run.preparedAt)
        ) : (
          <>
            <span>Cut-off</span> <span>{cutoff}</span>
          </>
        ),
    },
    {
      id: 'signoff',
      label: 'Sign-off',
      icon: <ShieldCheck />,
      sub: current > 1 ? <Who user={approver} id={run.approvedBy} /> : current === 1 && waitingOn.length ? <Names users={waitingOn} /> : undefined,
      at: current > 1 ? when(run.approvedAt) : undefined,
    },
    {
      id: 'release',
      label: 'Bank release',
      icon: <FileCode2 />,
      sub:
        current > 2 ? (
          run.disbursedBy ? (
            <Who user={disburser} id={run.disbursedBy} />
          ) : undefined
        ) : current === 2 ? (
          <span>{compactAed(run.totalNetAed)}</span>
        ) : undefined,
      at: current > 2 ? when(run.disbursedAt) : undefined,
    },
    {
      id: 'paid',
      label: 'Paid',
      icon: <Banknote />,
      sub: current > 3 && run.wpsBatchRef ? <span className="py-mono">{run.wpsBatchRef}</span> : undefined,
      at: current > 3 ? <span>{dayLabel(run.payDate)}</span> : undefined,
    },
  ];

  let message: ReactNode;
  if (s === 'draft') {
    message = (
      <>
        {run.preparedBy
          ? 'Back in draft for edits — re-submit for sign-off by '
          : caps.canRun
            ? 'You’re up — submit for sign-off by '
            : 'The payroll team submits for sign-off by '}
        <b>{cutoff}</b>
      </>
    );
  } else if (s === 'pending_signoff') {
    message = blocked ? (
      <>
        {'Stuck at four-eyes — no second approver besides '}
        <Name user={preparer} id={run.preparedBy} />
      </>
    ) : myTurn ? (
      <>
        <Name user={preparer} id={run.preparedBy} />
        {' sent it over — it’s your turn for the four-eyes check'}
      </>
    ) : (
      <>
        <Name user={preparer} id={run.preparedBy} />
        {' sent it over — waiting on '}
        <Names users={waitingOn} />
        {' for the four-eyes check'}
      </>
    );
  } else if (s === 'approved_ready') {
    message = (
      <>
        <Name user={approver} id={run.approvedBy} />
        {' signed off — the WPS batch for '}
        <b>{pluralize(run.headcount, 'employee')}</b>
        {' is ready for bank release'}
      </>
    );
  } else {
    message = (
      <>
        {'Paid! WPS batch '}
        {run.wpsBatchRef && <b className="py-mono">{run.wpsBatchRef}</b>}
        {' landed in '}
        <b>{run.headcount}</b>
        {' accounts'}
      </>
    );
  }

  const eta = (
    <>
      <span>{s === 'paid' ? 'Paid' : 'Payday'}</span>
      {' · '}
      <span>{dayLabel(run.payDate)}</span>
    </>
  );

  // Courier: share of the stage's window already used — period open → cut-off for the
  // draft, submission/approval → payday for sign-off and bank release.
  const [py, pm] = run.period.split('-').map(Number);
  const opened = new Date(py, (pm || 1) - 1, 1).getTime();
  const payTs = isoTs(run.payDate, 9);
  const progress =
    s === 'draft'
      ? elapsed(opened, isoTs(run.cutoffDate, 18))
      : s === 'pending_signoff'
        ? elapsed(run.preparedAt ?? opened, payTs)
        : s === 'approved_ready'
          ? elapsed(run.approvedAt ?? opened, payTs)
          : undefined;

  return (
    <NeoTracker
      bare
      className={className}
      label="Payday tracker"
      steps={steps}
      current={current}
      state={state}
      message={message}
      eta={eta}
      progress={progress}
    />
  );
}

/* ==========================================================================
   Compact row trackers — bonuses & reimbursement claims
   ========================================================================== */

const BONUS_STAGE: Record<BonusStatus, number> = { pending_approval: 1, declined: 1, approved_queued: 2, paid: 4 };

/**
 * Bonus award journey for ledger rows: nominated → four-eyes sign-off → pay run
 * → paid. A declined award stops, flagged, at sign-off.
 */
export function BonusTracker({ bonus, run }: { bonus: BonusAward; run?: PayrollRun }) {
  const declined = bonus.status === 'declined';
  const steps: NeoTrackStep[] = [
    { id: 'nominated', label: 'Nominated' },
    { id: 'signoff', label: declined ? 'Declined' : 'Sign-off' },
    { id: 'payrun', label: 'Pay run' },
    { id: 'paid', label: 'Paid' },
  ];
  // Pending: time used toward the target period's cut-off. Queued: rides its pay run.
  const progress =
    bonus.status === 'pending_approval'
      ? elapsed(bonus.nominatedAt, isoTs(periodDates(bonus.payrollPeriod).cutoffDate, 18))
      : bonus.status === 'approved_queued'
        ? rideProgress(run)
        : undefined;
  return (
    <NeoTracker
      compact
      className="py-trk-row"
      label="Bonus tracker"
      steps={steps}
      current={BONUS_STAGE[bonus.status]}
      state={declined ? 'blocked' : undefined}
      progress={progress}
    />
  );
}

/**
 * Travel & expense claim journey on the reimbursements bridge: submitted →
 * manager → finance audit → pay run → paid. `run` is the run it will be queued
 * into (finance audit) or the run it rides (queued).
 */
export function ExpenseClaimTracker({ report, run }: { report: ExpenseReport; run?: PayrollRun }) {
  const r = report;
  const returned = r.status === 'changes_requested' || r.status === 'rejected';
  const current =
    r.status === 'reimbursed'
      ? 5
      : r.status === 'payroll_queued'
        ? 3
        : r.status === 'manager_approved' || (returned && r.financeReviewerId)
          ? 2
          : r.status === 'draft'
            ? 0
            : 1;
  const steps: NeoTrackStep[] = [
    { id: 'submitted', label: 'Submitted' },
    { id: 'manager', label: 'Manager' },
    { id: 'finance', label: 'Finance' },
    { id: 'payrun', label: 'Pay run' },
    { id: 'paid', label: 'Paid' },
  ];
  // Finance audit: time used between manager approval and the run's cut-off. Queued: rides its pay run.
  const progress =
    r.status === 'manager_approved' && run
      ? elapsed(r.managerDecidedAt, isoTs(run.cutoffDate, 18))
      : r.status === 'payroll_queued'
        ? rideProgress(run)
        : undefined;
  return (
    <NeoTracker
      compact
      className="py-trk-card"
      label="Reimbursement tracker"
      steps={steps}
      current={current}
      state={returned ? 'blocked' : undefined}
      progress={progress}
    />
  );
}

/** HR allowance claim journey: submitted → HR review → pay run → paid (rejected stops at HR review). */
export function HrClaimTracker({ claim, run }: { claim: BenefitClaim; run?: PayrollRun }) {
  const current = claim.status === 'paid' ? 4 : claim.status === 'approved' ? 2 : 1;
  const steps: NeoTrackStep[] = [
    { id: 'submitted', label: 'Submitted' },
    { id: 'review', label: 'HR review' },
    { id: 'payrun', label: 'Pay run' },
    { id: 'paid', label: 'Paid' },
  ];
  return (
    <NeoTracker
      compact
      className="py-trk-card"
      label="Reimbursement tracker"
      steps={steps}
      current={current}
      state={claim.status === 'rejected' ? 'blocked' : undefined}
      progress={claim.status === 'approved' ? rideProgress(run) : undefined}
    />
  );
}
