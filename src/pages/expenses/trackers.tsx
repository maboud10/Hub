/**
 * Travel & Expenses journey trackers — <NeoTracker> models derived from live store data:
 *
 *  - `reportTrack`   expense report → manager review → Finance audit → payroll run → paid
 *                    (the "Reimbursement tracker" on Reports, Payday and the Flow home)
 *  - `tripTrack`     travel request → pre-approval → booked → travel → expensed
 *  - `journeyTrack`  the 7-stage trip-to-paycheck journey rows on the Flow home
 *
 * Messages name whoever holds the live stage (approver, Finance auditor, payroll
 * signatory) with the same routing the expenses store uses for notifications.
 * They are JSX on purpose: names, amounts and dates sit in their own elements and
 * the wording in separate text nodes, so the Arabic DOM translator can match each
 * phrase exactly.
 */
import { useMemo, type ReactNode } from 'react';
import {
  BadgeCheck,
  Banknote,
  CalendarClock,
  FileCheck2,
  FileSpreadsheet,
  MapPin,
  Plane,
  Send,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { NeoTracker, type NeoTrackState, type NeoTrackStep } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { firstName, formatDate, relativeTime } from '@/lib/format';
import { daysBetween, formatDay, formatRange, todayISO } from '@/hr/calendar';
import { FLOW_STEPS } from '@/expenses/constants';
import { defaultPayrollPeriod } from '@/expenses/store';
import type { ExpenseReport, ExpenseReportStatus, SpendFlowStage, TravelRequest } from '@/expenses/types';
import { formatPeriodLabel, periodDates } from '@/payroll/engine';
import { usePayroll } from '@/payroll/store';
import type { PayrollRun, PayrollRunStatus } from '@/payroll/types';
import { useHub } from '@/store/hub';
import type { User } from '@/types';
import { formatAed, STAGE_ICON } from './shared';

/** The expenses store routes Finance-audit notifications to Daniel and uses him as the fallback approver. */
const FINANCE_DESK_ID = 'u-daniel';

/** Courier position inside the "Payroll run" stage as the run moves through sign-off. */
const RUN_PROGRESS: Record<PayrollRunStatus, number> = {
  draft: 0.25,
  pending_signoff: 0.55,
  approved_ready: 0.85,
  paid: 0.94,
};

export interface SpendTrackCtx {
  usersById: Map<string, User>;
  runsByPeriod: Map<string, PayrollRun>;
  viewerId?: string | null;
  now: number;
}

/** People, payroll runs and a minute clock shared by every tracker on a screen. */
export function useSpendTrackCtx(): SpendTrackCtx {
  const users = useHub((s) => s.users);
  const viewerId = useHub((s) => s.sessionUserId);
  const runs = usePayroll((s) => s.runs);
  const now = useNow(60_000);
  return useMemo(
    () => ({
      usersById: new Map(users.map((u) => [u.id, u])),
      runsByPeriod: new Map(runs.map((r) => [r.period, r])),
      viewerId,
      now,
    }),
    [users, runs, viewerId, now],
  );
}

/** Everything a <NeoTracker> needs — spread it: `<NeoTracker {...reportTrack(report, ctx)} />`. */
export interface SpendTrack {
  steps: NeoTrackStep[];
  current: number;
  state: NeoTrackState;
  title?: string;
  message: ReactNode;
  eta?: ReactNode;
  progress?: number;
}

const userOf = (ctx: SpendTrackCtx, id?: string | null) => (id ? ctx.usersById.get(id) : undefined);

/** A person's first name in bold (translated via AR_PERSON_NAMES), or a role fallback. */
function who(user: User | undefined, fallback: string): ReactNode {
  return <b className="ex-who">{user ? firstName(user.name) : fallback}</b>;
}

/** "Cut-off 18 Nov" as separate text nodes, so the label and the date translate on their own. */
function tag(label: string, value: string): ReactNode {
  return (
    <>
      {label} {value}
    </>
  );
}

const shortIso = (iso: string) => formatDay(iso, { day: 'numeric', month: 'short' });
const shortTs = (ts: number) => formatDate(ts, { day: 'numeric', month: 'short' });

/* ---------- Expense report → payslip ---------- */

/** Which review stage sent a report back (1 = manager, 2 = Finance), who did it and when. */
function reviewStop(rep: ExpenseReport): { stage: 1 | 2; actorId?: string; at?: number } {
  const h = rep.history;
  let i = h.length - 1;
  while (i >= 0 && h[i].action !== 'changes_requested' && h[i].action !== 'rejected') i -= 1;
  if (i < 0) return { stage: 1, actorId: rep.managerReviewerId, at: rep.managerDecidedAt };
  let managerApproved = false;
  for (let j = i - 1; j >= 0 && h[j].action !== 'submitted'; j -= 1) {
    if (h[j].action === 'manager_approved') managerApproved = true;
  }
  return { stage: managerApproved ? 2 : 1, actorId: h[i].actorId, at: h[i].at };
}

function payrollMessage(run: PayrollRun | undefined, runName: ReactNode, auditor: ReactNode, ctx: SpendTrackCtx): ReactNode {
  if (!run || run.status === 'draft') {
    return (
      <>
        {auditor}
        {' queued it for the '}
        {runName}
      </>
    );
  }
  if (run.status === 'pending_signoff') {
    const preparer = userOf(ctx, run.preparedBy);
    return preparer ? (
      <>
        {who(preparer, 'Payroll')}
        {' sent the '}
        {runName}
        {' for four-eyes sign-off'}
      </>
    ) : (
      <>
        {runName}
        {' is waiting on four-eyes sign-off'}
      </>
    );
  }
  if (run.status === 'approved_ready') {
    return (
      <>
        {who(userOf(ctx, run.approvedBy), 'Payroll')}
        {' signed off the '}
        {runName}
        {' — '}
        {'WPS payout is next'}
      </>
    );
  }
  return (
    <>
      {runName}
      {' is paying out now'}
    </>
  );
}

/**
 * Reimbursement journey of one report: Submitted → Manager review → Finance audit →
 * Payroll run → Paid. Changes requested / rejected block the stage that sent it back;
 * drafts are paused on the requester.
 */
export function reportTrack(rep: ExpenseReport, ctx: SpendTrackCtx): SpendTrack {
  const owner = userOf(ctx, rep.userId);
  const manager = userOf(ctx, rep.managerReviewerId ?? owner?.managerId ?? FINANCE_DESK_ID);
  const auditor = userOf(ctx, rep.financeReviewerId ?? (rep.userId === FINANCE_DESK_ID ? undefined : FINANCE_DESK_ID));
  const period = rep.payrollPeriod ?? defaultPayrollPeriod(ctx.now);
  const run = ctx.runsByPeriod.get(period);
  const { cutoffDate, payDate } = run ?? periodDates(period);
  const stop = rep.status === 'changes_requested' || rep.status === 'rejected' ? reviewStop(rep) : undefined;
  const ago = (ts?: number) => (ts ? relativeTime(ts, ctx.now) : undefined);

  let current = 1;
  let state: NeoTrackState = 'active';
  if (rep.status === 'draft') {
    current = 0;
    state = 'paused';
  } else if (rep.status === 'manager_approved') current = 2;
  else if (rep.status === 'payroll_queued') current = 3;
  else if (rep.status === 'reimbursed') {
    current = 5;
    state = 'done';
  } else if (stop) {
    current = stop.stage;
    state = 'blocked';
  }

  const steps: NeoTrackStep[] = [
    {
      id: 'submitted',
      label: rep.status === 'draft' ? 'Draft' : 'Submitted',
      icon: <Send />,
      sub: rep.userId === ctx.viewerId ? 'You' : owner?.name,
      at: ago(rep.status === 'draft' ? rep.createdAt : rep.submittedAt),
    },
    {
      id: 'manager',
      label: 'Manager review',
      icon: <ShieldCheck />,
      sub: manager?.name ?? 'Your manager',
      at: current > 1 || stop?.stage === 1 ? ago(rep.managerDecidedAt) : undefined,
    },
    {
      id: 'finance',
      label: 'Finance audit',
      icon: <FileCheck2 />,
      sub: auditor?.name ?? 'Finance team',
      at: current > 2 ? ago(rep.financeQueuedAt) : stop?.stage === 2 ? ago(stop.at) : undefined,
    },
    {
      id: 'payroll',
      label: 'Payroll run',
      icon: <CalendarClock />,
      sub: formatPeriodLabel(period),
      at: current < 3 ? tag('Cut-off', shortIso(cutoffDate)) : undefined,
    },
    {
      id: 'paid',
      label: 'Paid',
      icon: <Banknote />,
      sub: rep.paymentRef ?? 'WPS · payslip',
      at: rep.reimbursedAt ? ago(rep.reimbursedAt) : tag('ETA', shortIso(payDate)),
    },
  ];

  const mgr = who(manager, 'Your manager');
  const fin = who(auditor, 'Finance');
  const runName = <b>{`${formatPeriodLabel(period)} pay run`}</b>;
  const stopper = who(userOf(ctx, stop?.actorId), stop?.stage === 2 ? 'Finance' : 'Your manager');

  let title: string;
  let message: ReactNode;
  let eta: ReactNode;
  let progress: number | undefined;
  switch (rep.status) {
    case 'draft':
      title = 'Ready when you are';
      message = (
        <>
          {'Parked as a draft'}
          {' — '}
          {mgr}
          {' reviews it as soon as you submit'}
        </>
      );
      eta = tag('Cut-off', shortIso(cutoffDate));
      break;
    case 'submitted':
      title = 'With your manager';
      message = (
        <>
          {mgr}
          {' is reviewing your receipts'}
          {' — '}
          {'Finance audit is next'}
        </>
      );
      eta = tag('Payday', shortIso(payDate));
      break;
    case 'manager_approved':
      title = 'Finance is on it';
      message = (
        <>
          {mgr}
          {' approved it'}
          {' — '}
          {fin}
          {auditor ? ' in Finance is double-checking the receipts and VAT' : ' is double-checking the receipts and VAT'}
        </>
      );
      eta = tag('Payday', shortIso(payDate));
      break;
    case 'payroll_queued':
      title = 'Your money is on its way';
      message = payrollMessage(run, runName, fin, ctx);
      eta = tag('Lands', shortIso(payDate));
      progress = RUN_PROGRESS[run?.status ?? 'draft'];
      break;
    case 'reimbursed':
      title = 'Money in the bank';
      message = rep.paymentRef?.startsWith('EXP-FAST') ? (
        <>
          <b>{formatAed(rep.reimbursableAed)}</b>
          {' went out by express wire'}
        </>
      ) : (
        <>
          <b>{formatAed(rep.reimbursableAed)}</b>
          {' was paid in the '}
          {runName}
          {' — '}
          {'it’s on your payslip'}
        </>
      );
      eta = rep.reimbursedAt ? tag('Paid', shortTs(rep.reimbursedAt)) : undefined;
      break;
    case 'changes_requested':
      title = 'Needs a quick fix';
      message = (
        <>
          {stopper}
          {' sent it back for a fix'}
          {' — '}
          {'update it and resubmit'}
        </>
      );
      eta = tag('Cut-off', shortIso(cutoffDate));
      break;
    default:
      title = 'Claim declined';
      message = (
        <>
          {stopper}
          {' declined this claim'}
        </>
      );
  }

  return { steps, current, state, title, message, eta, progress };
}

const LEAD_ORDER: ExpenseReportStatus[] = ['payroll_queued', 'manager_approved', 'submitted', 'changes_requested', 'draft'];

/** The claim to feature on the payday panel: closest to the money first, then the latest payout. */
export function pickLeadClaim(reports: ExpenseReport[]): ExpenseReport | undefined {
  const latest = (list: ExpenseReport[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  for (const status of LEAD_ORDER) {
    const hit = latest(reports.filter((r) => r.status === status));
    if (hit) return hit;
  }
  return latest(reports.filter((r) => r.status === 'reimbursed'));
}

/* ---------- Travel request ---------- */

/**
 * Travel request journey: Requested → Pre-approval → Booked → Travel → Expensed.
 * During the trip the courier moves with the days travelled.
 */
export function tripTrack(trip: TravelRequest, ctx: SpendTrackCtx): SpendTrack {
  const traveller = userOf(ctx, trip.userId);
  const mine = trip.userId === ctx.viewerId;
  const approver = userOf(ctx, trip.approverId ?? traveller?.managerId ?? FINANCE_DESK_ID);
  const approverIsViewer = Boolean(approver) && approver?.id === ctx.viewerId;
  const appr = approverIsViewer ? <b className="ex-who">You</b> : who(approver, 'Your manager');
  const today = todayISO(ctx.now);
  const expensed = Boolean(trip.linkedReportId) && trip.status !== 'cancelled' && trip.status !== 'rejected';

  let current = 1;
  let state: NeoTrackState = 'active';
  let progress: number | undefined;
  let message: ReactNode;

  if (expensed) {
    current = 5;
    state = 'done';
    message = (
      <>
        {'Expensed'}
        {' — '}
        {mine ? 'follow the claim in Payday' : 'receipts are filed in an expense report'}
      </>
    );
  } else {
    switch (trip.status) {
      case 'draft':
        current = 0;
        state = 'paused';
        message = (
          <>
            {'Saved as a draft'}
            {' — '}
            {'submit it for pre-approval'}
          </>
        );
        break;
      case 'pending_approval':
        message = approverIsViewer ? (
          'Waiting on your pre-approval'
        ) : (
          <>
            {appr}
            {mine ? ' is reviewing your trip request' : ' is reviewing this trip request'}
            {' — '}
            {'the virtual card is issued on approval'}
          </>
        );
        break;
      case 'changes_requested':
        state = 'blocked';
        message = (
          <>
            {appr}
            {' asked for changes before approving'}
          </>
        );
        break;
      case 'rejected':
        state = 'blocked';
        message = (
          <>
            {appr}
            {' declined this trip'}
          </>
        );
        break;
      case 'approved':
        current = 2;
        message = (
          <>
            {appr}
            {' approved it'}
            {' — '}
            {mine ? 'book your flight and hotel next' : 'flight and hotel booking is next'}
          </>
        );
        break;
      case 'booked':
        current = 3;
        if (today < trip.departureDate) {
          progress = 0;
          message = (
            <>
              {'All booked'}
              {' — '}
              {'departs '}
              <b>{formatDay(trip.departureDate)}</b>
            </>
          );
        } else if (today <= trip.returnDate) {
          const total = Math.max(1, daysBetween(trip.departureDate, trip.returnDate) + 1);
          progress = (daysBetween(trip.departureDate, today) + 1) / total;
          message = (
            <>
              {'Safe travels'}
              {' — '}
              {'duty-of-care is on until '}
              <b>{formatDay(trip.returnDate)}</b>
            </>
          );
        } else {
          progress = 1;
          message = (
            <>
              {'Welcome back'}
              {' — '}
              {mine ? 'mark the trip completed and expense it' : 'waiting to be marked completed'}
            </>
          );
        }
        break;
      case 'completed':
        current = 4;
        message = (
          <>
            {'Trip wrapped'}
            {' — '}
            {mine ? 'bundle your receipts into an expense report' : 'waiting on the expense report'}
          </>
        );
        break;
      default:
        current = trip.itinerary ? 3 : trip.approvedAt ? 2 : 1;
        state = 'paused';
        message = 'This trip was cancelled';
    }
  }

  const steps: NeoTrackStep[] = [
    { id: 'requested', label: 'Requested', icon: <MapPin />, sub: mine ? 'You' : traveller?.name, at: relativeTime(trip.createdAt, ctx.now) },
    {
      id: 'approval',
      label: 'Pre-approval',
      icon: <BadgeCheck />,
      sub: approver?.name ?? 'Your manager',
      at: trip.approvedAt ? relativeTime(trip.approvedAt, ctx.now) : undefined,
    },
    {
      id: 'booked',
      label: 'Booked',
      icon: <Ticket />,
      sub: trip.itinerary?.airline,
      at: trip.itinerary ? relativeTime(trip.itinerary.bookedAt, ctx.now) : undefined,
    },
    { id: 'travel', label: 'Travel', icon: <Plane />, sub: formatRange(trip.departureDate, trip.returnDate) },
    { id: 'expensed', label: 'Expensed', icon: <FileSpreadsheet /> },
  ];

  return { steps, current, state, message, progress };
}

/** Compact trip tracker plus its one-line live status, for travel-desk cards. */
export function TripTracker({ trip, ctx }: { trip: TravelRequest; ctx: SpendTrackCtx }) {
  const t = tripTrack(trip, ctx);
  const tone = t.current >= t.steps.length ? 'done' : t.state;
  return (
    <div className="ex-track">
      <NeoTracker steps={t.steps} current={t.current} state={t.state} progress={t.progress} compact label={`${trip.reference} · Trip tracker`} />
      <p className="ex-track-note" data-state={tone} aria-live="polite">
        <i aria-hidden="true" />
        <span>{t.message}</span>
      </p>
    </div>
  );
}

/* ---------- 7-stage trip-to-paycheck journeys ---------- */

/** The seven trip-to-paycheck stages (`FLOW_STEPS`) as tracker steps. */
export const JOURNEY_STEPS: NeoTrackStep[] = FLOW_STEPS.map((s) => ({
  id: `stage-${s.step}`,
  label: s.title,
  icon: STAGE_ICON[s.step],
}));

/** Compact-tracker state for one journey row (stage from `computeJourneyStage`). */
export function journeyTrack(
  stage: SpendFlowStage,
  trip: TravelRequest | undefined,
  report: ExpenseReport | undefined,
  ctx: SpendTrackCtx,
): Pick<SpendTrack, 'steps' | 'current' | 'state' | 'progress'> {
  if (report?.status === 'reimbursed') return { steps: JOURNEY_STEPS, current: JOURNEY_STEPS.length, state: 'done' };

  let state: NeoTrackState = 'active';
  if (report && (report.status === 'changes_requested' || report.status === 'rejected')) state = 'blocked';
  else if (!report && trip && (trip.status === 'changes_requested' || trip.status === 'rejected')) state = 'blocked';
  else if (report?.status === 'draft') state = 'paused';

  let progress: number | undefined;
  if (stage === 2 && trip) progress = trip.status === 'approved' ? 0.3 : trip.status === 'booked' ? 0.65 : 0.94;
  else if (stage === 5 && report) progress = report.status === 'manager_approved' ? 0.75 : 0.3;
  else if (stage === 6 && report) {
    const run = ctx.runsByPeriod.get(report.payrollPeriod ?? defaultPayrollPeriod(ctx.now));
    progress = RUN_PROGRESS[run?.status ?? 'draft'];
  }

  return { steps: JOURNEY_STEPS, current: stage - 1, state, progress };
}
