/**
 * Spend deck home — attention banners, HUD ribbon, the Nova smart-receipt
 * prompt, the 7-stage trip-to-paycheck flow with live journeys, and a status
 * column (virtual card, payday tracker, policy tips).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Car,
  CreditCard,
  ExternalLink,
  FilePen,
  FileSpreadsheet,
  Plane,
  Receipt,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Utensils,
  Wallet,
  WandSparkles,
} from 'lucide-react';
import { Bar, Chip, NeoBanner, NeoBanners, NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoNovaPrompt, NeoPanel, Ring } from '@/components/neo';
import { relativeTime } from '@/lib/format';
import { daysBetween, formatDay, formatRange, todayISO } from '@/hr/calendar';
import { CATEGORY_META, FLOW_STEPS, TRIP_PURPOSE_META } from '@/expenses/constants';
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
import { toast } from '@/store/toast';
import { parseNovaIntent, receiptDraftToSearch, tripDraftToSearch } from './nova';
import {
  compactAed,
  formatAed,
  formatOrigCurrency,
  JourneyProgress,
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

const NOVA_SUGGESTIONS = [
  'Taxi to DXB airport 85 AED',
  'Trip to London next week for the summit',
  'Team lunch at Zuma 640 AED with 4 clients',
  'Hotel in Riyadh 2 nights SAR 1,240',
  'Where is my money?',
];

export function OverviewView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const caps = useExpensesCaps();
  const summary = useMySpendSummary();
  const approvals = useSpendApprovals();
  const payday = useActivePaydayInfo();
  const generateTripPerDiemReceipt = useExpenses((s) => s.generateTripPerDiemReceipt);

  const [stageFilter, setStageFilter] = useState<SpendFlowStage | null>(null);
  const canApproveOrAudit = caps.canApprove || caps.canAudit;
  const homeCity = me?.location.split('·')[0].trim() || 'Dubai';

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

  const inReview = useMemo(
    () => summary.myReports.filter((r) => r.status === 'submitted' || r.status === 'manager_approved'),
    [summary.myReports],
  );
  const inReviewAed = inReview.reduce((s, r) => s + r.reimbursableAed, 0);

  /* ---------- Nova hand-off ---------- */
  const handleNova = (text: string) => {
    const intent = parseNovaIntent(text, { today: todayISO(), homeCity });
    switch (intent.kind) {
      case 'expense': {
        const d = intent.draft;
        toast.info(`Nova drafted a ${CATEGORY_META[d.category].label.toLowerCase()} receipt`, `${d.merchant} · ${formatOrigCurrency(d.amount, d.currency)} — check it and save it to your vault.`);
        navigate(`/expenses/receipts?${receiptDraftToSearch(d)}`);
        return;
      }
      case 'trip': {
        const d = intent.draft;
        toast.info(`Nova started a trip request${d.city ? ` to ${d.city}` : ''}`, `${formatRange(d.departureDate, d.returnDate)} · ${TRIP_PURPOSE_META[d.purpose].label} — review the estimate and submit.`);
        navigate(`/expenses/travel?${tripDraftToSearch(d)}`);
        return;
      }
      case 'status':
        toast.info('Here’s where your money is', `${formatAed(summary.queuedPayrollAed)} queued for payday ${formatDay(payday.payDate, { day: 'numeric', month: 'short' })}.`);
        navigate('/expenses/reimbursements');
        return;
      case 'report':
        toast.info('Report studio is ready', `${summary.unbundledReceipts.length} unsubmitted receipt${summary.unbundledReceipts.length === 1 ? '' : 's'} pre-selected.`);
        navigate('/expenses/reports?new=1');
        return;
      default:
        toast.info('Nova couldn’t spot an amount', 'Opened the receipt vault with your note — add the amount or drop the receipt file.');
        navigate(`/expenses/receipts?${receiptDraftToSearch({ notes: intent.notes })}`);
    }
  };

  /* ---------- Attention banners (most urgent first, max 3) ---------- */
  const changesRequested = summary.myReports.filter((r) => r.status === 'changes_requested');
  const tripChanges = summary.myTrips.filter((t) => t.status === 'changes_requested');
  const tripsToBook = summary.myTrips.filter((t) => t.status === 'approved');
  const awaitingTrips = summary.myTrips.filter((t) => t.status === 'pending_approval');
  const drafts = summary.myReports.filter((r) => r.status === 'draft');

  const banners: ReactNode[] = [];
  if (changesRequested.length) {
    const first = changesRequested[0];
    banners.push(
      <NeoBanner key="changes" tone="warning" icon={<FilePen />} title={`${changesRequested.length} report${changesRequested.length === 1 ? ' needs' : 's need'} changes`} meta={first.reference} to="/expenses/reports">
        {first.reviewNote ? `“${first.reviewNote}”` : first.title}
      </NeoBanner>,
    );
  }
  if (tripChanges.length) {
    const t = tripChanges[0];
    banners.push(
      <NeoBanner key="trip-changes" tone="warning" icon={<Plane />} title={`Trip to ${t.destinationCity} needs changes`} meta={t.reference} to="/expenses/travel">
        {t.decisionNote ? `“${t.decisionNote}”` : 'Your manager asked for a revision before approving.'}
      </NeoBanner>,
    );
  }
  if (canApproveOrAudit && approvals.totalCount > 0) {
    banners.push(
      <NeoBanner key="inbox" tone="cyan" icon={<ShieldCheck />} title={`${approvals.totalCount} item${approvals.totalCount === 1 ? '' : 's'} await your review`} meta="Approvals" to="/expenses/approvals">
        {approvals.pendingTrips.length} trip pre-approval{approvals.pendingTrips.length === 1 ? '' : 's'} · {approvals.managerReports.length} expense review{approvals.managerReports.length === 1 ? '' : 's'} · {approvals.financeReports.length} finance audit{approvals.financeReports.length === 1 ? '' : 's'}
      </NeoBanner>,
    );
  }
  if (tripsToBook.length) {
    const t = tripsToBook[0];
    banners.push(
      <NeoBanner key="book" tone="success" icon={<BadgeCheck />} title={`${t.destinationCity} trip approved — book it`} meta={formatRange(t.departureDate, t.returnDate)} to={`/expenses/travel?book=${t.id}`}>
        Confirm your flight PNR and hotel{t.virtualCard ? ` · virtual card •••• ${t.virtualCard.last4} is ready` : ''}.
      </NeoBanner>,
    );
  }
  if (awaitingTrips.length) {
    const t = awaitingTrips[0];
    banners.push(
      <NeoBanner key="awaiting" tone="blue" icon={<Plane />} title={awaitingTrips.length === 1 ? `Trip to ${t.destinationCity} awaits approval` : `${awaitingTrips.length} trips await approval`} meta={`Sent ${relativeTime(t.createdAt)}`} to="/expenses/travel">
        Your manager has been notified — the virtual card is issued on approval.
      </NeoBanner>,
    );
  }
  if (drafts.length) {
    banners.push(
      <NeoBanner key="drafts" tone="app" icon={<FileSpreadsheet />} title={`${drafts.length} draft report${drafts.length === 1 ? '' : 's'} ready to submit`} meta={compactAed(drafts.reduce((s, r) => s + r.reimbursableAed, 0))} to="/expenses/reports">
        Submit to start the four-eyes review.
      </NeoBanner>,
    );
  }

  const renderNextAction = (j: JourneyItem) => {
    const { trip, report } = j;

    if (report) {
      if (report.status === 'reimbursed') {
        return (
          <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => navigate('/hr/documents?tab=payslips')}>
            Payslip <ExternalLink />
          </button>
        );
      }
      if (report.status === 'payroll_queued') {
        return (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => navigate('/expenses/reimbursements')}>
            Track payday <ArrowRight />
          </button>
        );
      }
      if (report.status === 'draft' || report.status === 'changes_requested') {
        return (
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate('/expenses/reports')}>
            {report.status === 'draft' ? 'Review & submit' : 'Fix & resubmit'} <ArrowRight />
          </button>
        );
      }
      return (
        <button type="button" className="neo-btn neo-btn--sm" onClick={() => navigate('/expenses/reimbursements')}>
          Audit status <ArrowRight />
        </button>
      );
    }

    if (trip) {
      if (trip.status === 'approved') {
        return (
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate(`/expenses/travel?book=${trip.id}`)}>
            <Plane /> Book trip
          </button>
        );
      }
      if (trip.status === 'booked' || trip.status === 'completed') {
        const hasPerDiem = summary.myReceipts.some((r) => r.tripId === trip.id && r.category === 'per_diem');
        return (
          <>
            {!hasPerDiem && (
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={() => {
                  const res = generateTripPerDiemReceipt(trip.id);
                  toast.result(res, 'Per diem added to vault');
                }}
              >
                <Sparkles /> Per diem
              </button>
            )}
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate(`/expenses/reports?tripId=${trip.id}`)}>
              Bundle report <ArrowRight />
            </button>
          </>
        );
      }
      return (
        <button type="button" className="neo-btn neo-btn--sm" onClick={() => navigate('/expenses/travel')}>
          Travel desk <ArrowRight />
        </button>
      );
    }

    return (
      <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate('/expenses/reports?new=1')}>
        Bundle report <ArrowRight />
      </button>
    );
  };

  const main = (
    <>
      <NeoNovaPrompt
        hud="Nova · Smart receipts"
        title="Describe an expense or a trip"
        badge="Files it in seconds"
        placeholder="e.g. Taxi to DXB airport 85 AED — or — Trip to London next week for the summit"
        suggestions={NOVA_SUGGESTIONS}
        submitLabel="File it"
        submitIcon={<WandSparkles />}
        onSubmit={handleNova}
        label="Nova smart receipts"
      >
        <div className="ex-nova-routes" aria-label="How Nova routes your request">
          <span>
            <Receipt /> Amounts → receipt vault
          </span>
          <span>
            <Plane /> Plans → travel desk
          </span>
          <span>
            <Wallet /> “Where’s my money?” → payday
          </span>
        </div>
      </NeoNovaPrompt>

      <NeoPanel hud="End to end" title="Trip-to-paycheck flow" actions={<Chip size="sm" tone="app">{journeys.length} active</Chip>}>
        <ProcessFlowRail
          selectedStage={stageFilter}
          onSelectStage={setStageFilter}
          stageCounts={stageCounts}
          canApproveOrAudit={canApproveOrAudit}
        />
      </NeoPanel>

      <NeoPanel
        hud={stageFilter ? `Stage ${stageFilter} · ${FLOW_STEPS[stageFilter - 1].title}` : 'In flight'}
        title="My journeys"
        actions={
          stageFilter ? (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setStageFilter(null)}>
              Show all
            </button>
          ) : (
            <Link to="/expenses/reports" className="neo-btn neo-btn--ghost neo-btn--xs">
              Reports <ArrowRight />
            </Link>
          )
        }
      >
        {visibleJourneys.length === 0 ? (
          <NeoEmpty
            compact
            icon={<RouteIcon />}
            title={stageFilter ? `Nothing at stage ${stageFilter} right now` : 'No trips or claims in flight'}
            action={
              stageFilter ? (
                <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => setStageFilter(null)}>
                  Show all journeys
                </button>
              ) : (
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => navigate('/expenses/travel?new=1')}>
                  <Plane /> Request your first trip
                </button>
              )
            }
          >
            {stageFilter
              ? 'Pick another stage above, or show every journey.'
              : 'Plan a business trip or describe a receipt to Nova to start tracking your reimbursement.'}
          </NeoEmpty>
        ) : (
          <ul className="ex-jrnys neo-stagger">
            {visibleJourneys.map((j, i) => {
              const stepMeta = FLOW_STEPS.find((s) => s.step === j.stage) ?? FLOW_STEPS[0];
              const { trip, report } = j;
              const title = trip
                ? `${trip.originCity} → ${trip.destinationCity} · ${trip.title}`
                : report
                  ? report.title
                  : `${j.unbundledForTripCount} receipt${j.unbundledForTripCount === 1 ? '' : 's'} not on a report yet`;
              return (
                <li key={j.id} className="ex-jrny" style={{ ['--i' as string]: i }}>
                  <span className="ex-jrny__icon" data-kind={trip ? 'trip' : report ? 'report' : 'vault'} aria-hidden="true">
                    {trip ? <Plane /> : report ? <FileSpreadsheet /> : <Receipt />}
                  </span>
                  <div className="ex-jrny__body">
                    <div className="ex-jrny__top">
                      <span className="ex-jrny__title">{title}</span>
                      <span className="ex-jrny__ref neo-mono">{report?.reference ?? trip?.reference ?? 'VAULT'}</span>
                    </div>
                    <div className="ex-jrny__meta">
                      {trip && (
                        <>
                          {formatRange(trip.departureDate, trip.returnDate)} · {trip.days}d · est. <b>{formatAed(trip.totalEstimatedAed)}</b>
                          {trip.itinerary?.flightBookingRef && <> · PNR {trip.itinerary.flightBookingRef}</>}
                        </>
                      )}
                      {report && (
                        <>
                          {trip ? ' · ' : ''}
                          {report.receiptIds.length} receipt{report.receiptIds.length === 1 ? '' : 's'} · reimbursable <b className="neo-tint">{formatAed(report.reimbursableAed, true)}</b>
                          {report.payrollPeriod && <> · payroll {report.payrollPeriod}</>}
                        </>
                      )}
                      {!trip && !report && <>Ready to bundle · {formatAed(summary.unsubmittedVaultAed, true)} out of pocket</>}
                      {trip && !report && j.unbundledForTripCount > 0 && <> · {j.unbundledForTripCount} receipt{j.unbundledForTripCount === 1 ? '' : 's'} to attach</>}
                    </div>
                    <div className="ex-jrny__chips">
                      <Chip size="sm" tone="app">
                        Stage {j.stage}/7 · {stepMeta.title}
                      </Chip>
                      {trip && <TripStatusBadge status={trip.status} size="sm" />}
                      {report && <ReportStatusBadge status={report.status} size="sm" />}
                      {trip?.virtualCard && !report && (
                        <Chip size="sm" icon={<CreditCard />}>
                          •••• {trip.virtualCard.last4}
                        </Chip>
                      )}
                    </div>
                    <JourneyProgress stage={j.stage} />
                  </div>
                  <div className="ex-jrny__act">{renderNextAction(j)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </NeoPanel>
    </>
  );

  return (
    <>
      {banners.length > 0 && <NeoBanners>{banners.slice(0, 3)}</NeoBanners>}

      <NeoKpis label="Spend at a glance">
        <NeoKpi
          icon={<Wallet />}
          label="Pending reimbursement"
          value={compactAed(summary.pendingReimbursementAed)}
          sub={inReview.length ? `${inReview.length} claim${inReview.length === 1 ? '' : 's'} in review` : 'Nothing in review'}
          to="/expenses/reimbursements"
          title="Out-of-pocket claims in review or queued for payday"
        />
        <NeoKpi
          icon={<Banknote />}
          label="Queued for payday"
          value={compactAed(summary.queuedPayrollAed)}
          sub={`Payday ${formatDay(payday.payDate, { day: 'numeric', month: 'short' })} · ${payday.statusLabel}`}
          tone={summary.queuedPayrollAed > 0 ? 'success' : undefined}
          to="/expenses/reimbursements"
        />
        <NeoKpi
          icon={<Receipt />}
          label="Unsubmitted receipts"
          value={summary.unbundledReceipts.length}
          sub={`${formatAed(summary.unsubmittedVaultAed)} out of pocket`}
          to="/expenses/receipts"
        />
        {canApproveOrAudit ? (
          <NeoKpi
            icon={<ShieldCheck />}
            label="Approvals inbox"
            value={approvals.totalCount}
            sub={`${approvals.pendingTrips.length} trips · ${approvals.managerReports.length} reports · ${approvals.financeReports.length} audits`}
            tone={approvals.totalCount > 0 ? 'warning' : undefined}
            to="/expenses/approvals"
          />
        ) : (
          <NeoKpi icon={<BadgeCheck />} label="Reimbursed YTD" value={compactAed(summary.reimbursedYtdAed)} sub="Tax-free on your payslip" to="/expenses/reimbursements" />
        )}
      </NeoKpis>

      <NeoHome
        main={main}
        sideLabel="Your spend overview"
        side={
          <>
            <CardPanel />
            <PaydayPanel inReviewAed={inReviewAed} />
            <PolicyPanel />
          </>
        }
      />
    </>
  );
}

/* ---------- Side column ---------- */

function CardPanel() {
  const me = useSessionUser();
  const summary = useMySpendSummary();
  const payday = useActivePaydayInfo();
  const activeCardTrip = useMemo(
    () =>
      summary.myTrips.find((t) => t.virtualCard && (t.status === 'booked' || t.status === 'approved')) ??
      summary.myTrips.find((t) => t.virtualCard),
    [summary.myTrips],
  );

  return (
    <NeoPanel
      hud="Your card"
      title="Virtual travel card"
      actions={
        activeCardTrip ? (
          <Chip size="sm" tone="success">
            Issued
          </Chip>
        ) : (
          <Link to="/expenses/travel?new=1" className="neo-btn neo-btn--ghost neo-btn--xs">
            Request <ArrowRight />
          </Link>
        )
      }
    >
      {activeCardTrip?.virtualCard ? (
        <>
          <VirtualCorporateCard card={activeCardTrip.virtualCard} holderName={me?.name} tripLabel={`${activeCardTrip.destinationCity} · ${activeCardTrip.days}d`} />
          <p className="ex-side-note">
            Scoped to <b className="neo-mono">{activeCardTrip.reference}</b> ({activeCardTrip.originCity} → {activeCardTrip.destinationCity}). Charges reconcile automatically — nothing out of pocket.
          </p>
        </>
      ) : (
        <>
          <VirtualCorporateCard
            card={{ last4: '4821', limitAed: 9500, spentAed: 0, activeFrom: payday.cutoffDate, activeTo: payday.payDate, frozen: true }}
            holderName={me?.name ?? 'Helix Traveller'}
            tripLabel="Issued on pre-approval"
          />
          <p className="ex-side-note">Request travel pre-approval and a date-scoped card is provisioned for flights and hotels.</p>
        </>
      )}
    </NeoPanel>
  );
}

function PaydayPanel({ inReviewAed }: { inReviewAed: number }) {
  const summary = useMySpendSummary();
  const payday = useActivePaydayInfo();
  const daysLeft = Math.max(0, daysBetween(todayISO(), payday.payDate));

  return (
    <NeoPanel
      hud="Payday"
      title="Reimbursement tracker"
      actions={
        <Link to="/expenses/reimbursements" className="neo-btn neo-btn--ghost neo-btn--xs">
          Track <ArrowRight />
        </Link>
      }
    >
      <div className="ex-payday">
        <Ring value={1 - Math.min(daysLeft, 30) / 30} size={64} stroke={6} label={`${daysLeft} days to payday`}>
          {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
        </Ring>
        <div className="ex-payday__info">
          <span className="neo-hud">Next payday · {payday.period}</span>
          <b className="ex-payday__date">{formatDay(payday.payDate, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          <Chip size="sm" tone="cyan">
            {payday.statusLabel}
          </Chip>
        </div>
      </div>
      <dl className="ex-rows">
        <div>
          <dt>In review</dt>
          <dd>{formatAed(inReviewAed)}</dd>
        </div>
        <div>
          <dt>Queued for payday</dt>
          <dd className="neo-tint">{formatAed(summary.queuedPayrollAed)}</dd>
        </div>
        <div>
          <dt>Reimbursed YTD · tax-free</dt>
          <dd className="ex-pos">{formatAed(summary.reimbursedYtdAed)}</dd>
        </div>
      </dl>
      <Link to="/hr/documents?tab=payslips" className="ex-side-link">
        Open my HR payslips <ExternalLink />
      </Link>
    </NeoPanel>
  );
}

function PolicyPanel() {
  const budget = useDeptTravelBudget();
  const quarter = `Q${Math.floor(new Date().getMonth() / 3) + 1}`;
  const meals = CATEGORY_META.meals;
  const tips: { icon: ReactNode; tone: string; title: string; body: string }[] = [
    { icon: <Utensils />, tone: 'amber', title: `Meals up to ${formatAed(meals.dailyCapAed ?? 280)}`, body: 'Per meal. Add attendees when you host clients.' },
    { icon: <Car />, tone: 'cyan', title: `Receipts from ${formatAed(meals.receiptThresholdAed)}`, body: 'Taxis and meals; hotels and flights always need one.' },
    { icon: <Plane />, tone: 'violet', title: 'Book 7+ days ahead', body: 'Business class only on flights over 6 hours.' },
    { icon: <Sparkles />, tone: 'emerald', title: 'Per diem is automatic', body: 'City rates are added to trip reports — no receipts.' },
  ];

  return (
    <NeoPanel hud="Policy" title="Spend smart">
      <ul className="ex-tips">
        {tips.map((t) => (
          <li key={t.title} className="ex-tip">
            <span className="ex-tip__icon" data-tone={t.tone} aria-hidden="true">
              {t.icon}
            </span>
            <div>
              <b>{t.title}</b>
              <p>{t.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="ex-pool">
        <div className="ex-pool__row">
          <span className="neo-hud">
            {budget.dept} · {quarter} travel pool
          </span>
          <b className="neo-num">{budget.pct}%</b>
        </div>
        <Bar value={budget.pct / 100} fill={budget.pct >= 85 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : undefined} label={`${budget.pct}% of the travel pool committed`} />
        <div className="ex-pool__row ex-pool__row--faint">
          <span>{formatAed(budget.committedAed)} committed</span>
          <span>{formatAed(budget.remainingAed)} left</span>
        </div>
      </div>
    </NeoPanel>
  );
}
