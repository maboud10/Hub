import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Compass,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  Plane,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatDay, formatRange } from '@/hr/calendar';
import { FLOW_STEPS } from '@/expenses/constants';
import { useExpenses } from '@/expenses/store';
import {
  computeJourneyStage,
  useDeptTravelBudget,
  useExpensesCaps,
  useMySpendSummary,
  useSpendApprovals,
} from '@/expenses/selectors';
import type { ExpenseReport, SpendFlowStage, TravelRequest } from '@/expenses/types';
import { useSessionUser } from '@/store/selectors';
import { EmptyState } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import {
  formatAed,
  ProcessFlowRail,
  ReportStatusBadge,
  TripStatusBadge,
  useActivePaydayInfo,
  VirtualCorporateCard,
} from './shared';

interface JourneyItem {
  id: string;
  stage: SpendFlowStage;
  trip?: TravelRequest;
  report?: ExpenseReport;
  unbundledForTripCount: number;
  updatedAt: number;
}

export function OverviewView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const caps = useExpensesCaps();
  const summary = useMySpendSummary();
  const approvals = useSpendApprovals();
  const budget = useDeptTravelBudget();
  const payday = useActivePaydayInfo();
  const generateTripPerDiemReceipt = useExpenses((s) => s.generateTripPerDiemReceipt);

  const [stageFilter, setStageFilter] = useState<SpendFlowStage | null>(null);

  // Build unified Trip-to-Paycheck journeys for the signed-in user
  const journeys = useMemo<JourneyItem[]>(() => {
    const reportsById = new Map(summary.myReports.map((r) => [r.id, r]));
    const reportsByTrip = new Map<string, ExpenseReport>();
    for (const r of summary.myReports) {
      if (r.tripId) reportsByTrip.set(r.tripId, r);
    }

    const usedReportIds = new Set<string>();
    const list: JourneyItem[] = [];

    for (const trip of summary.myTrips) {
      if (trip.status === 'cancelled' || trip.status === 'rejected') continue;
      const linkedReport =
        (trip.linkedReportId ? reportsById.get(trip.linkedReportId) : undefined) ??
        reportsByTrip.get(trip.id);
      if (linkedReport) usedReportIds.add(linkedReport.id);

      const unbundledForTripCount = summary.unbundledReceipts.filter((r) => r.tripId === trip.id).length;
      const stage = computeJourneyStage(trip, linkedReport, unbundledForTripCount);
      list.push({
        id: `j-trip-${trip.id}`,
        stage,
        trip,
        report: linkedReport,
        unbundledForTripCount,
        updatedAt: Math.max(trip.updatedAt, linkedReport?.updatedAt ?? 0),
      });
    }

    // Standalone Expense Reports (without a linked trip)
    for (const report of summary.myReports) {
      if (usedReportIds.has(report.id)) continue;
      const stage = computeJourneyStage(undefined, report, 0);
      list.push({
        id: `j-rep-${report.id}`,
        stage,
        report,
        unbundledForTripCount: 0,
        updatedAt: report.updatedAt,
      });
    }

    // Standalone unbundled receipts not attached to any trip
    const looseUnbundled = summary.unbundledReceipts.filter((r) => !r.tripId);
    if (looseUnbundled.length > 0) {
      list.push({
        id: 'j-vault-loose',
        stage: 3,
        unbundledForTripCount: looseUnbundled.length,
        updatedAt: Math.max(...looseUnbundled.map((r) => r.createdAt)),
      });
    }

    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [summary.myTrips, summary.myReports, summary.unbundledReceipts]);

  const stageCounts = useMemo(() => {
    const counts: Partial<Record<SpendFlowStage, number>> = {};
    for (const j of journeys) {
      counts[j.stage] = (counts[j.stage] ?? 0) + 1;
    }
    return counts;
  }, [journeys]);

  const visibleJourneys = useMemo(
    () => (stageFilter ? journeys.filter((j) => j.stage === stageFilter) : journeys),
    [journeys, stageFilter],
  );

  const activeCardTrip = useMemo(
    () =>
      summary.myTrips.find((t) => t.virtualCard && (t.status === 'booked' || t.status === 'approved')) ??
      summary.myTrips.find((t) => t.virtualCard),
    [summary.myTrips],
  );

  const renderNextAction = (j: JourneyItem) => {
    const { trip, report } = j;

    if (report) {
      if (report.status === 'reimbursed') {
        return (
          <button
            type="button"
            className="btn btn--sm btn--success"
            onClick={() => navigate('/hr/documents?tab=payslips')}
          >
            View on HR Payslip <ExternalLink />
          </button>
        );
      }
      if (report.status === 'payroll_queued') {
        return (
          <button
            type="button"
            className="btn btn--sm ex-btn-teal"
            onClick={() => navigate('/expenses/reimbursements')}
          >
            Track Payday Payout <ArrowRight />
          </button>
        );
      }
      if (report.status === 'draft' || report.status === 'changes_requested') {
        return (
          <button
            type="button"
            className="btn btn--sm ex-btn-teal"
            onClick={() => navigate('/expenses/reports')}
          >
            Review &amp; Submit Report <ArrowRight />
          </button>
        );
      }
      return (
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => navigate('/expenses/reimbursements')}
        >
          View Audit Status <ArrowRight />
        </button>
      );
    }

    if (trip) {
      if (trip.status === 'approved') {
        return (
          <button
            type="button"
            className="btn btn--sm ex-btn-teal"
            onClick={() => navigate(`/expenses/travel?book=${trip.id}`)}
          >
            Book Flight &amp; Hotel <Plane />
          </button>
        );
      }
      if (trip.status === 'booked' || trip.status === 'completed') {
        const hasPerDiem = summary.myReceipts.some(
          (r) => r.tripId === trip.id && r.category === 'per_diem',
        );
        return (
          <div className="row row--wrap" style={{ gap: 8 }}>
            {!hasPerDiem && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  const res = generateTripPerDiemReceipt(trip.id);
                  toast.result(res, 'Per diem added to vault');
                }}
              >
                <Sparkles /> Generate per diem
              </button>
            )}
            <button
              type="button"
              className="btn btn--sm ex-btn-teal"
              onClick={() => navigate(`/expenses/reports?tripId=${trip.id}`)}
            >
              Bundle &amp; submit report <ArrowRight />
            </button>
          </div>
        );
      }
      return (
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => navigate('/expenses/travel')}
        >
          View in Travel Desk <ArrowRight />
        </button>
      );
    }

    return (
      <button
        type="button"
        className="btn btn--sm ex-btn-teal"
        onClick={() => navigate('/expenses/reports?new=1')}
      >
        Bundle into Report <ArrowRight />
      </button>
    );
  };

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* 7-Stage Interactive Process Flow Stepper */}
      <ProcessFlowRail
        selectedStage={stageFilter}
        onSelectStage={setStageFilter}
        stageCounts={stageCounts}
        canApproveOrAudit={caps.canApprove || caps.canAudit}
      />

      {/* Manager / Finance Inbox Callout */}
      {(caps.canApprove || caps.canAudit) && approvals.totalCount > 0 && (
        <div
          className="card row row--between row--wrap"
          style={{
            padding: '14px 18px',
            borderColor: 'rgb(var(--warning-rgb) / 0.36)',
            background: 'rgb(var(--warning-rgb) / 0.08)',
          }}
        >
          <div className="row" style={{ gap: 12, minWidth: 0 }}>
            <ShieldCheck style={{ width: 20, height: 20, color: 'var(--warning)', flex: 'none' }} />
            <div style={{ minWidth: 0 }}>
              <div className="text-sm" style={{ fontWeight: 650 }}>
                {approvals.totalCount} team or Finance item{approvals.totalCount === 1 ? '' : 's'} awaiting your review
              </div>
              <div className="text-xs muted">
                {approvals.pendingTrips.length} travel pre-approval{approvals.pendingTrips.length === 1 ? '' : 's'} ·{' '}
                {approvals.managerReports.length} manager expense review{approvals.managerReports.length === 1 ? '' : 's'} ·{' '}
                {approvals.financeReports.length} Finance payroll audit{approvals.financeReports.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--sm ex-btn-teal"
            onClick={() => navigate('/expenses/approvals')}
          >
            Review Inbox ({approvals.totalCount}) <ArrowRight />
          </button>
        </div>
      )}

      <div className="ex-overview-grid">
        {/* Left Column: Active Trip-to-Paycheck Journeys */}
        <section className="card stack" style={{ minWidth: 0 }}>
          <div className="row row--between row--wrap">
            <div>
              <h2 className="section-title">
                Active Trip-to-Paycheck Journeys
                <span className="count">{visibleJourneys.length}</span>
              </h2>
              <p className="text-xs muted" style={{ marginTop: 2 }}>
                Live stage tracker across Travel Pre-Approval, Smart Receipt Vault, Audit, and Payroll disbursement.
              </p>
            </div>
            <div className="row row--wrap" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => navigate('/expenses/receipts')}
              >
                <Receipt /> Scan Receipt
              </button>
              <button
                type="button"
                className="btn btn--sm ex-btn-teal"
                onClick={() => navigate('/expenses/travel?new=1')}
              >
                <Plane /> Request Travel
              </button>
            </div>
          </div>

          {visibleJourneys.length === 0 ? (
            <EmptyState
              icon={<Compass />}
              title={stageFilter ? `No journeys currently at Stage ${stageFilter}` : 'No travel or expense journeys yet'}
              action={
                stageFilter ? (
                  <button type="button" className="btn btn--sm" onClick={() => setStageFilter(null)}>
                    Show all journeys
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--sm ex-btn-teal"
                    onClick={() => navigate('/expenses/travel?new=1')}
                  >
                    <Plane /> Request your first trip
                  </button>
                )
              }
            >
              {stageFilter
                ? 'Select another stage on the pipeline stepper above or view all journeys.'
                : 'Plan a business trip or scan an out-of-pocket receipt to start tracking your reimbursement.'}
            </EmptyState>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {visibleJourneys.map((j) => {
                const stepMeta = FLOW_STEPS.find((s) => s.step === j.stage) ?? FLOW_STEPS[0];
                const { trip, report } = j;
                return (
                  <article key={j.id} className="ex-journey-card">
                    <div className="row row--between row--wrap" style={{ gap: 8 }}>
                      <div className="row row--wrap" style={{ gap: 8, minWidth: 0 }}>
                        <span className="badge badge--info mono">
                          Stage {j.stage}/7 · {stepMeta.title}
                        </span>
                        {trip && <TripStatusBadge status={trip.status} />}
                        {report && <ReportStatusBadge status={report.status} />}
                      </div>
                      <span className="mono text-xs muted">
                        {report?.reference ?? trip?.reference ?? 'VAULT-UNBUNDLED'}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontWeight: 650, fontSize: 15 }}>
                        {trip
                          ? `${trip.originCity} → ${trip.destinationCity} · ${trip.title}`
                          : report
                            ? report.title
                            : `${j.unbundledForTripCount} Unsubmitted Receipt${j.unbundledForTripCount === 1 ? '' : 's'} in Vault`}
                      </div>
                      <div className="text-xs muted" style={{ marginTop: 4 }}>
                        {trip && (
                          <>
                            {formatRange(trip.departureDate, trip.returnDate)} ({trip.days}d) · Est.{' '}
                            <b className="mono">{formatAed(trip.totalEstimatedAed)}</b>
                            {trip.itinerary?.flightBookingRef && ` · PNR ${trip.itinerary.flightBookingRef}`}
                          </>
                        )}
                        {!trip && report && (
                          <>
                            {report.receiptIds.length} receipt{report.receiptIds.length === 1 ? '' : 's'} ·{' '}
                            Cost center {report.costCenter}
                          </>
                        )}
                        {!trip && !report && (
                          <>
                            Ready to bundle into an Expense Report ({formatAed(summary.unsubmittedVaultAed, true)} out-of-pocket)
                          </>
                        )}
                      </div>
                    </div>

                    {/* 1..7 Segmented Stage Progress Bar */}
                    <div>
                      <div className="ex-journey-progress" aria-label={`Stage ${j.stage} of 7`}>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <span
                            key={n}
                            className={cx(
                              n < j.stage && 'is-done',
                              n === j.stage && 'is-current',
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {trip?.virtualCard && !report && (
                      <VirtualCorporateCard
                        card={trip.virtualCard}
                        holderName={me?.name}
                        tripLabel={`${trip.destinationCity} · ${trip.reference}`}
                        compact
                      />
                    )}

                    <div className="row row--between row--wrap" style={{ gap: 10 }}>
                      <div className="row row--wrap" style={{ gap: 12 }}>
                        {report ? (
                          <>
                            <span className="text-xs muted">
                              Reimbursable:{' '}
                              <b className="mono" style={{ color: 'var(--ex-ink)' }}>
                                {formatAed(report.reimbursableAed, true)}
                              </b>
                            </span>
                            {report.corporateCardAed > 0 && (
                              <span className="text-xs muted">
                                Corp Card: <b className="mono">{formatAed(report.corporateCardAed)}</b>
                              </span>
                            )}
                            {report.payrollPeriod && (
                              <span className="text-xs muted">
                                Payroll: <b className="mono">{report.payrollPeriod}</b>
                              </span>
                            )}
                          </>
                        ) : j.unbundledForTripCount > 0 ? (
                          <span className="text-xs muted">
                            <b className="mono">{j.unbundledForTripCount}</b> vault receipt
                            {j.unbundledForTripCount === 1 ? '' : 's'} ready to attach
                          </span>
                        ) : (
                          <span className="text-xs muted">{stepMeta.sub}</span>
                        )}
                      </div>

                      {renderNextAction(j)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Corporate Card + Live Payday Sync + Dept Budget */}
        <aside className="stack" style={{ minWidth: 0 }}>
          {/* Virtual Corporate Travel Card Widget */}
          <div className="card stack" style={{ minWidth: 0 }}>
            <div className="row row--between">
              <span className="section-title" style={{ fontSize: 15 }}>
                <CreditCard style={{ width: 17, height: 17, color: 'var(--ex-ink)' }} />
                Virtual Corporate Travel Card
              </span>
              {activeCardTrip && <span className="badge badge--success">Issued</span>}
            </div>

            {activeCardTrip?.virtualCard ? (
              <>
                <VirtualCorporateCard
                  card={activeCardTrip.virtualCard}
                  holderName={me?.name}
                  tripLabel={`${activeCardTrip.destinationCity} (${activeCardTrip.days}d)`}
                />
                <p className="text-xs muted">
                  Scoped to <b>{activeCardTrip.reference}</b> ({activeCardTrip.originCity} →{' '}
                  {activeCardTrip.destinationCity}). Charges auto-reconcile with zero out-of-pocket impact.
                </p>
              </>
            ) : (
              <>
                <VirtualCorporateCard
                  card={{
                    last4: '4821',
                    limitAed: 9500,
                    spentAed: 0,
                    activeFrom: payday.cutoffDate,
                    activeTo: payday.payDate,
                    frozen: true,
                  }}
                  holderName={me?.name ?? 'Helix Traveller'}
                  tripLabel="Issued on Pre-Approval"
                />
                <p className="text-xs muted">
                  Request travel pre-approval to automatically provision a date-scoped corporate card for flights &amp; hotels.
                </p>
              </>
            )}
          </div>

          {/* Live Payroll Run & Payday Sync */}
          <div className="card stack" style={{ minWidth: 0 }}>
            <div className="row row--between">
              <span className="section-title" style={{ fontSize: 15 }}>
                <CalendarClock style={{ width: 17, height: 17, color: 'var(--ex-ink)' }} />
                Payroll &amp; Reimbursement Sync
              </span>
              <span className="badge badge--info mono">{payday.period}</span>
            </div>

            <div className="ex-split-panel">
              <div className="ex-split-row">
                <span>Active Payroll Run</span>
                <b>{payday.statusLabel}</b>
              </div>
              <div className="ex-split-row">
                <span>Next Scheduled Payday</span>
                <b>{formatDay(payday.payDate, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
              </div>
              <div className="ex-split-row">
                <span>Queued for Payday</span>
                <b style={{ color: 'var(--ex-ink)' }}>{formatAed(summary.queuedPayrollAed, true)}</b>
              </div>
              <div className="ex-split-row">
                <span>Reimbursed YTD (Tax-Free)</span>
                <b style={{ color: 'var(--success)' }}>{formatAed(summary.reimbursedYtdAed, true)}</b>
              </div>
            </div>

            <div className="row row--wrap" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => navigate('/expenses/reimbursements')}
              >
                <Wallet /> Where is my money?
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => navigate('/hr/documents?tab=payslips')}
              >
                HR Payslips <ExternalLink />
              </button>
            </div>
          </div>

          {/* Department Quarterly Travel Budget Snapshot */}
          <div className="card stack" style={{ minWidth: 0 }}>
            <div className="row row--between">
              <span className="section-title" style={{ fontSize: 15 }}>
                <FileSpreadsheet style={{ width: 17, height: 17, color: 'var(--ex-ink)' }} />
                {budget.dept} Q4 Travel Pool
              </span>
              <span className="mono text-xs muted">{budget.pct}% committed</span>
            </div>
            <div>
              <div className="ex-meter-track" style={{ margin: '4px 0 8px' }}>
                <div
                  className={cx('ex-meter-fill', budget.pct >= 85 && 'ex-meter-fill--high')}
                  style={{ width: `${budget.pct}%` }}
                />
              </div>
              <div className="row row--between text-xs muted">
                <span>
                  Committed: <b className="mono">{formatAed(budget.committedAed)}</b>
                </span>
                <span>
                  Available: <b className="mono">{formatAed(budget.remainingAed)}</b>
                </span>
              </div>
            </div>
            <div className="row text-xs muted" style={{ gap: 6 }}>
              <CheckCircle2 style={{ width: 14, height: 14, color: 'var(--success)', flex: 'none' }} />
              Quarterly envelope: {formatAed(budget.budgetAed)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
