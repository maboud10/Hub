import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Lock,
  Plane,
  RotateCcw,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatDay, formatRange } from '@/hr/calendar';
import { hasPermission } from '@/lib/rbac';
import {
  canDecideTrip,
  canFinanceAuditReport,
  canManagerDecideReport,
  canSeeReport,
  canSeeTrip,
} from '@/expenses/access';
import { CATEGORY_META, TRIP_PURPOSE_META } from '@/expenses/constants';
import { defaultPayrollPeriod, useExpenses } from '@/expenses/store';
import {
  useExpensesCaps,
  useExpensesViewer,
  useSpendApprovals,
} from '@/expenses/selectors';
import { periodFromTimestamp } from '@/payroll/engine';
import { useHub } from '@/store/hub';
import { usePermissions, useSessionUser } from '@/store/selectors';
import { Avatar, EmptyState, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import {
  formatAed,
  formatOrigCurrency,
  PolicyWarningChips,
  ReportStatusBadge,
  SeparationOfDutiesBadge,
  TripStatusBadge,
} from './shared';

type InboxSection = 'all' | 'trips' | 'manager' | 'finance';

export function ApprovalsView() {
  const me = useSessionUser();
  const perms = usePermissions();
  const viewer = useExpensesViewer();
  const caps = useExpensesCaps();
  const approvals = useSpendApprovals();
  const navigate = useNavigate();

  const users = useHub((s) => s.users);
  const allTrips = useExpenses((s) => s.trips);
  const allReports = useExpenses((s) => s.reports);
  const allReceipts = useExpenses((s) => s.receipts);

  const decideTravel = useExpenses((s) => s.decideTravel);
  const managerDecideReport = useExpenses((s) => s.managerDecideReport);
  const financeAuditReport = useExpenses((s) => s.financeAuditReport);
  const disburseExpressReimbursement = useExpenses((s) => s.disburseExpressReimbursement);

  const [section, setSection] = useState<InboxSection>('all');
  const [issueCardMap, setIssueCardMap] = useState<Record<string, boolean>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [periodMap, setPeriodMap] = useState<Record<string, string>>({});

  const defaultPeriod = useMemo(() => defaultPayrollPeriod(), []);
  const periodOptions = useMemo(() => {
    const p0 = periodFromTimestamp(Date.now(), 0);
    const p1 = periodFromTimestamp(Date.now(), 1);
    return [...new Set([defaultPeriod, p0, p1])].sort();
  }, [defaultPeriod]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const receiptsById = useMemo(() => new Map(allReceipts.map((r) => [r.id, r])), [allReceipts]);
  const isBreakGlassAdmin = hasPermission(perms, '*');

  // Include viewer's own pending items in company/manager scope so Separation-of-Duties is explicitly visible!
  const visiblePendingTrips = useMemo(() => {
    const ids = new Set(approvals.pendingTrips.map((t) => t.id));
    const ownBlocked = allTrips.filter(
      (t) =>
        t.status === 'pending_approval' &&
        t.userId === me?.id &&
        !ids.has(t.id) &&
        canSeeTrip(viewer, t, usersById.get(t.userId)),
    );
    return [...approvals.pendingTrips, ...ownBlocked];
  }, [approvals.pendingTrips, allTrips, me?.id, viewer, usersById]);

  const visibleManagerReports = useMemo(() => {
    const ids = new Set(approvals.managerReports.map((r) => r.id));
    const ownBlocked = allReports.filter(
      (r) =>
        r.status === 'submitted' &&
        r.userId === me?.id &&
        !ids.has(r.id) &&
        canSeeReport(viewer, r, usersById.get(r.userId)),
    );
    return [...approvals.managerReports, ...ownBlocked];
  }, [approvals.managerReports, allReports, me?.id, viewer, usersById]);

  const visibleFinanceReports = useMemo(() => {
    if (!caps.canAudit) return [];
    const ids = new Set(approvals.financeReports.map((r) => r.id));
    const ownBlocked = allReports.filter(
      (r) => r.status === 'manager_approved' && r.userId === me?.id && !ids.has(r.id),
    );
    return [...approvals.financeReports, ...ownBlocked];
  }, [caps.canAudit, approvals.financeReports, allReports, me?.id]);

  const queuedPayrollReports = useMemo(
    () => (caps.canAudit ? allReports.filter((r) => r.status === 'payroll_queued') : []),
    [caps.canAudit, allReports],
  );

  // Clean guard if user holds neither manager approval nor Finance audit rights
  if (!caps.canApprove && !caps.canAudit) {
    return (
      <div className="card">
        <EmptyState
          icon={<Lock />}
          title="Manager or Finance Audit Access Required"
          action={
            <button type="button" className="btn ex-btn-teal" onClick={() => navigate('/expenses')}>
              Back to My Spend &amp; Mobility <ArrowRight />
            </button>
          }
        >
          Approvals &amp; Audit is reserved for people managers reviewing direct reports’ trips and Finance auditors queueing claims into Payroll.
        </EmptyState>
      </div>
    );
  }

  const showTrips = section === 'all' || section === 'trips';
  const showManager = section === 'all' || section === 'manager';
  const showFinance = caps.canAudit && (section === 'all' || section === 'finance');

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Filter Chips */}
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div className="chips" role="tablist" aria-label="Approvals & Audit sections">
          <button
            type="button"
            className={cx('chip', section === 'all' && 'is-active')}
            onClick={() => setSection('all')}
          >
            All Actionable <span className="count">{approvals.totalCount}</span>
          </button>
          <button
            type="button"
            className={cx('chip', section === 'trips' && 'is-active')}
            onClick={() => setSection('trips')}
          >
            <Plane /> Travel Pre-Approvals <span className="count">{visiblePendingTrips.length}</span>
          </button>
          <button
            type="button"
            className={cx('chip', section === 'manager' && 'is-active')}
            onClick={() => setSection('manager')}
          >
            <ShieldCheck /> Manager Expense Reviews <span className="count">{visibleManagerReports.length}</span>
          </button>
          {caps.canAudit && (
            <button
              type="button"
              className={cx('chip', section === 'finance' && 'is-active')}
              onClick={() => setSection('finance')}
            >
              <FileCheck2 /> Finance Audit &amp; Payroll Queue{' '}
              <span className="count">{visibleFinanceReports.length}</span>
            </button>
          )}
        </div>

        {hasPermission(perms, 'app:payroll') && (
          <Link to="/payroll/reimbursements" className="btn btn--sm">
            Open Payroll Reimbursements → <ExternalLink />
          </Link>
        )}
      </div>

      {/* ── SECTION 1: Travel Pre-Approvals ── */}
      {showTrips && (
        <section className="stack" style={{ minWidth: 0 }}>
          <div className="row row--between">
            <h2 className="section-title">
              <Plane style={{ width: 18, height: 18, color: 'var(--ex-ink)' }} />
              1. Travel Pre-Approvals
              <span className="count">{visiblePendingTrips.length}</span>
            </h2>
          </div>

          {visiblePendingTrips.length === 0 ? (
            <div className="card card--tight text-sm muted">
              All direct-report and company travel pre-approval requests are up to date.
            </div>
          ) : (
            <div className="stack">
              {visiblePendingTrips.map((trip) => {
                const reqUser = usersById.get(trip.userId);
                const gate = canDecideTrip(viewer, trip, reqUser);
                const isOwn = trip.userId === me?.id;
                const issueCard = issueCardMap[trip.id] ?? true;
                const note = notesMap[trip.id] ?? '';

                return (
                  <article key={trip.id} className="card stack" style={{ minWidth: 0 }}>
                    <div className="row row--between row--wrap" style={{ gap: 10 }}>
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {reqUser && <Avatar user={reqUser} size={36} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 8 }}>
                            <b style={{ fontSize: 15 }}>{reqUser?.name ?? trip.userId}</b>
                            <span className="badge badge--muted">{trip.department}</span>
                            <span className="mono text-xs muted">{trip.reference}</span>
                            <TripStatusBadge status={trip.status} />
                            {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                          </div>
                          <div className="text-xs muted" style={{ marginTop: 2 }}>
                            {trip.originCity} → <b>{trip.destinationCity}</b> ({trip.destinationCountry}) ·{' '}
                            {formatRange(trip.departureDate, trip.returnDate)} ({trip.days}d · {trip.cabinClass})
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div className="text-xs muted">Estimated Budget</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 17, color: 'var(--ex-ink)' }}>
                          {formatAed(trip.totalEstimatedAed)}
                        </div>
                      </div>
                    </div>

                    <div className="text-sm">
                      <b>{trip.title}</b>{' '}
                      <span className="badge badge--muted" style={{ marginLeft: 6 }}>
                        {TRIP_PURPOSE_META[trip.purpose]?.label ?? trip.purpose}
                      </span>
                      <p className="text-xs muted" style={{ marginTop: 4 }}>
                        “{trip.businessJustification}”
                      </p>
                    </div>

                    <div className="ex-breakdown-strip">
                      <div className="ex-breakdown-cell">
                        <span>Flights ({trip.flightHours}h)</span>
                        <b>{formatAed(trip.estimatedFlightAed)}</b>
                      </div>
                      <div className="ex-breakdown-cell">
                        <span>Hotel</span>
                        <b>{formatAed(trip.estimatedHotelAed)}</b>
                      </div>
                      <div className="ex-breakdown-cell">
                        <span>Per Diem ({trip.days}d)</span>
                        <b>{formatAed(trip.estimatedPerDiemAed)}</b>
                      </div>
                      <div className="ex-breakdown-cell">
                        <span>Other / CO₂</span>
                        <b>
                          {formatAed(trip.estimatedOtherAed)} · {trip.co2Kg}kg
                        </b>
                      </div>
                    </div>

                    {trip.policyFlags.length > 0 && (
                      <div className="ex-policy-box">
                        {trip.policyFlags.map((flag, idx) => (
                          <div key={idx} className="row" style={{ gap: 6 }}>
                            <AlertTriangle style={{ width: 14, height: 14, color: 'var(--warning)', flex: 'none' }} />
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Toggle Virtual Corporate Card + Decision Note */}
                    <div className="row row--between row--wrap" style={{ gap: 12 }}>
                      <div className="row" style={{ gap: 10 }}>
                        <Switch
                          checked={issueCard}
                          disabled={!gate.ok}
                          onChange={(v) => setIssueCardMap((s) => ({ ...s, [trip.id]: v }))}
                          label="Issue Scoped Virtual Corporate Card"
                        />
                        <span className="text-sm">
                          <CreditCard style={{ width: 14, height: 14, display: 'inline', marginRight: 5, color: 'var(--ex-ink)' }} />
                          Issue Scoped Virtual Corporate Card (Limit {formatAed(Math.ceil(trip.totalEstimatedAed / 500) * 500)})
                        </span>
                      </div>
                    </div>

                    {!gate.ok ? (
                      <div className="text-xs muted">{gate.reason}</div>
                    ) : (
                      <div className="row row--wrap" style={{ gap: 8 }}>
                        <input
                          className="input grow"
                          style={{ minWidth: 200 }}
                          value={note}
                          onChange={(e) => setNotesMap((s) => ({ ...s, [trip.id]: e.target.value }))}
                          placeholder="Approval note (required if requesting changes or rejecting)..."
                        />
                        <button
                          type="button"
                          className="btn ex-btn-teal"
                          onClick={() => {
                            const res = decideTravel(trip.id, 'approved', note, issueCard);
                            toast.result(res, 'Trip pre-approved');
                          }}
                        >
                          <CheckCircle2 /> Approve Trip
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            const res = decideTravel(trip.id, 'changes_requested', note, false);
                            toast.result(res, 'Requested revision');
                          }}
                        >
                          <RotateCcw /> Request Changes
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => {
                            const res = decideTravel(trip.id, 'rejected', note, false);
                            toast.result(res, 'Trip rejected');
                          }}
                        >
                          <XCircle /> Reject
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── SECTION 2: Manager Expense Reviews ── */}
      {showManager && (
        <section className="stack" style={{ minWidth: 0 }}>
          <div className="row row--between">
            <h2 className="section-title">
              <ShieldCheck style={{ width: 18, height: 18, color: 'var(--ex-ink)' }} />
              2. Manager Expense Reviews
              <span className="count">{visibleManagerReports.length}</span>
            </h2>
          </div>

          {visibleManagerReports.length === 0 ? (
            <div className="card card--tight text-sm muted">
              No submitted expense reports awaiting first-stage manager review.
            </div>
          ) : (
            <div className="stack">
              {visibleManagerReports.map((rep) => {
                const reqUser = usersById.get(rep.userId);
                const gate = canManagerDecideReport(viewer, rep, reqUser);
                const isOwn = rep.userId === me?.id;
                const items = rep.receiptIds
                  .map((id) => receiptsById.get(id))
                  .filter((x): x is NonNullable<typeof x> => Boolean(x));
                const note = notesMap[rep.id] ?? '';

                return (
                  <article key={rep.id} className="card stack" style={{ minWidth: 0 }}>
                    <div className="row row--between row--wrap" style={{ gap: 10 }}>
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {reqUser && <Avatar user={reqUser} size={36} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 8 }}>
                            <b style={{ fontSize: 15 }}>{reqUser?.name ?? rep.userId}</b>
                            <span className="badge badge--muted">{rep.costCenter}</span>
                            <span className="mono text-xs muted">{rep.reference}</span>
                            <ReportStatusBadge status={rep.status} />
                            {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{rep.title}</div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div className="text-xs muted">Employee Reimbursable</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 17, color: 'var(--ex-ink)' }}>
                          {formatAed(rep.reimbursableAed, true)}
                        </div>
                        <div className="text-xs muted">
                          Total spend {formatAed(rep.totalSpendAed, true)} · Card {formatAed(rep.corporateCardAed)}
                        </div>
                      </div>
                    </div>

                    {/* Line Items Inspection */}
                    <div className="stack stack--sm">
                      {items.map((r) => (
                        <div
                          key={r.id}
                          className="row row--between row--wrap text-xs"
                          style={{
                            padding: '8px 11px',
                            borderRadius: 'var(--r-xs)',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            gap: 8,
                          }}
                        >
                          <div className="row row--wrap" style={{ gap: 6, minWidth: 0 }}>
                            <b>{r.merchant}</b>
                            <span className="ex-gl-badge">{r.glCode}</span>
                            <span className="muted">{CATEGORY_META[r.category].label}</span>
                            <span className="muted">· {formatDay(r.date)}</span>
                            {r.paymentMethod === 'corporate_card' ? (
                              <span className="badge badge--info">Virtual Card</span>
                            ) : (
                              <span className="badge badge--success">Out-of-Pocket</span>
                            )}
                            {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                          </div>
                          <span className="mono" style={{ fontWeight: 650 }}>
                            {r.currency !== 'AED' && `${formatOrigCurrency(r.originalAmount, r.currency)} → `}
                            {formatAed(r.amountAed, true)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {!gate.ok ? (
                      <div className="text-xs muted">{gate.reason}</div>
                    ) : (
                      <div className="row row--wrap" style={{ gap: 8 }}>
                        <input
                          className="input grow"
                          style={{ minWidth: 200 }}
                          value={note}
                          onChange={(e) => setNotesMap((s) => ({ ...s, [rep.id]: e.target.value }))}
                          placeholder="Manager review note (required if requesting changes or rejecting)..."
                        />
                        <button
                          type="button"
                          className="btn ex-btn-teal"
                          onClick={() => {
                            const res = managerDecideReport(rep.id, 'manager_approved', note);
                            toast.result(res, 'Approved & routed to Finance');
                          }}
                        >
                          <CheckCircle2 /> Approve &amp; Route to Finance
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            const res = managerDecideReport(rep.id, 'changes_requested', note);
                            toast.result(res, 'Returned for revision');
                          }}
                        >
                          <RotateCcw /> Request Changes
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => {
                            const res = managerDecideReport(rep.id, 'rejected', note);
                            toast.result(res, 'Report rejected');
                          }}
                        >
                          <XCircle /> Reject
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── SECTION 3: Finance Audit & Payroll Queue (`caps.canAudit`) ── */}
      {showFinance && (
        <section className="stack" style={{ minWidth: 0 }}>
          <div className="row row--between row--wrap" style={{ gap: 10 }}>
            <div>
              <h2 className="section-title">
                <FileCheck2 style={{ width: 18, height: 18, color: 'var(--ex-ink)' }} />
                3. Finance Audit &amp; Payroll Queue
                <span className="count">{visibleFinanceReports.length}</span>
              </h2>
              <p className="text-xs muted" style={{ marginTop: 2 }}>
                Verify GL account codes, input VAT recovery &amp; OCR confidence, then queue into the target monthly Payroll Run.
              </p>
            </div>
          </div>

          {visibleFinanceReports.length === 0 ? (
            <div className="card card--tight text-sm muted">
              All manager-approved expense reports have been audited and queued for payroll.
            </div>
          ) : (
            <div className="stack">
              {visibleFinanceReports.map((rep) => {
                const reqUser = usersById.get(rep.userId);
                const mgrUser = rep.managerReviewerId ? usersById.get(rep.managerReviewerId) : undefined;
                const gate = canFinanceAuditReport(viewer, rep);
                const isOwn = rep.userId === me?.id;
                const items = rep.receiptIds
                  .map((id) => receiptsById.get(id))
                  .filter((x): x is NonNullable<typeof x> => Boolean(x));
                const targetPeriod = periodMap[rep.id] ?? defaultPeriod;
                const note = notesMap[rep.id] ?? '';

                return (
                  <article key={rep.id} className="card stack" style={{ minWidth: 0 }}>
                    <div className="row row--between row--wrap" style={{ gap: 10 }}>
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {reqUser && <Avatar user={reqUser} size={36} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 8 }}>
                            <b style={{ fontSize: 15 }}>{reqUser?.name ?? rep.userId}</b>
                            <span className="badge badge--muted">{rep.costCenter}</span>
                            <span className="mono text-xs muted">{rep.reference}</span>
                            <ReportStatusBadge status={rep.status} />
                            {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                          </div>
                          <div className="text-xs muted" style={{ marginTop: 2 }}>
                            <b>{rep.title}</b>
                            {mgrUser && ` · Manager signed off by ${mgrUser.name}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div className="text-xs muted">Net Payroll Payout</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 17, color: 'var(--ex-ink)' }}>
                          {formatAed(rep.reimbursableAed, true)}
                        </div>
                        <div className="text-xs mono muted">
                          Input VAT: {formatAed(rep.vatTotalAed, true)} · Corp Card: {formatAed(rep.corporateCardAed)}
                        </div>
                      </div>
                    </div>

                    {/* GL, VAT & OCR Inspection Rows */}
                    <div className="stack stack--sm">
                      {items.map((r) => (
                        <div
                          key={r.id}
                          className="row row--between row--wrap text-xs"
                          style={{
                            padding: '8px 11px',
                            borderRadius: 'var(--r-xs)',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            gap: 8,
                          }}
                        >
                          <div className="row row--wrap" style={{ gap: 6, minWidth: 0 }}>
                            <span className="ex-gl-badge">{r.glCode}</span>
                            <b>{r.merchant}</b>
                            <span className="badge badge--muted mono">OCR {r.ocrConfidence}%</span>
                            {r.vatAed > 0 && (
                              <span className="badge badge--info mono">VAT {formatAed(r.vatAed, true)}</span>
                            )}
                            {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                          </div>
                          <span className="mono" style={{ fontWeight: 650 }}>
                            {formatAed(r.amountAed, true)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {!gate.ok ? (
                      <div className="text-xs muted">{gate.reason}</div>
                    ) : (
                      <div className="row row--wrap" style={{ gap: 8 }}>
                        <select
                          className="select mono"
                          style={{ width: 148, flex: 'none' }}
                          aria-label="Target payroll period"
                          value={targetPeriod}
                          onChange={(e) =>
                            setPeriodMap((s) => ({ ...s, [rep.id]: e.target.value }))
                          }
                        >
                          {periodOptions.map((p) => (
                            <option key={p} value={p}>
                              Run {p}
                            </option>
                          ))}
                        </select>

                        <input
                          className="input grow"
                          style={{ minWidth: 180 }}
                          value={note}
                          onChange={(e) => setNotesMap((s) => ({ ...s, [rep.id]: e.target.value }))}
                          placeholder="Finance GL / VAT audit note..."
                        />

                        <button
                          type="button"
                          className="btn ex-btn-teal"
                          onClick={() => {
                            const res = financeAuditReport(rep.id, 'payroll_queued', targetPeriod, note);
                            toast.result(res, `Queued into ${targetPeriod} payroll`);
                          }}
                        >
                          <Banknote /> Verify &amp; Queue into Payroll
                        </button>

                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            const res = financeAuditReport(rep.id, 'changes_requested', undefined, note);
                            toast.result(res, 'Returned to employee');
                          }}
                        >
                          <RotateCcw /> Request Changes
                        </button>

                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => {
                            const res = financeAuditReport(rep.id, 'rejected', undefined, note);
                            toast.result(res, 'Report rejected');
                          }}
                        >
                          <XCircle /> Reject
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* Currently `payroll_queued` Reports + Express Off-Cycle Wire */}
          <div className="card stack" style={{ marginTop: 8, minWidth: 0 }}>
            <div className="row row--between row--wrap" style={{ gap: 10 }}>
              <div>
                <h3 className="section-title" style={{ fontSize: 15.5 }}>
                  <Banknote style={{ width: 17, height: 17, color: 'var(--ex-ink)' }} />
                  Active Payroll Reimbursement Queue (`payroll_queued`)
                  <span className="count">{queuedPayrollReports.length}</span>
                </h3>
                <p className="text-xs muted" style={{ marginTop: 2 }}>
                  Synced automatically into the monthly WPS Pay Run in Payroll Console — or trigger a 1-click Express Off-Cycle Wire for urgent high-outlay claims.
                </p>
              </div>
              {hasPermission(perms, 'app:payroll') && (
                <Link to="/payroll/reimbursements" className="btn btn--sm ex-btn-teal">
                  Settle in Payroll Console → <ExternalLink />
                </Link>
              )}
            </div>

            {queuedPayrollReports.length === 0 ? (
              <div className="text-xs muted">No expense reports currently waiting in the Payroll queue.</div>
            ) : (
              <div className="stack stack--sm">
                {queuedPayrollReports.map((rep) => {
                  const emp = usersById.get(rep.userId);
                  const isOwn = rep.userId === me?.id;
                  const canWire = !isOwn || isBreakGlassAdmin;
                  return (
                    <div
                      key={rep.id}
                      className="row row--between row--wrap"
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--r-sm)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        gap: 12,
                      }}
                    >
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        {emp && <Avatar user={emp} size={30} />}
                        <div style={{ minWidth: 0 }}>
                          <div className="row row--wrap" style={{ gap: 6 }}>
                            <b className="text-sm">{emp?.name ?? rep.userId}</b>
                            <span className="mono text-xs muted">{rep.reference}</span>
                            <span className="badge badge--info mono">Payroll {rep.payrollPeriod}</span>
                            {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                          </div>
                          <div className="text-xs muted truncate">{rep.title}</div>
                        </div>
                      </div>

                      <div className="row row--wrap" style={{ gap: 10 }}>
                        <b className="mono" style={{ color: 'var(--ex-ink)', fontSize: 14.5 }}>
                          {formatAed(rep.reimbursableAed, true)}
                        </b>
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!canWire}
                          title={
                            canWire
                              ? 'Disburse immediately via off-cycle wire transfer'
                              : 'Separation of duties: another Finance auditor must disburse your own claim'
                          }
                          onClick={() => {
                            const res = disburseExpressReimbursement(rep.id);
                            toast.result(res, 'Express wire sent');
                          }}
                        >
                          <Zap /> Express Off-Cycle Wire
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
