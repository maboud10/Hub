import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Lock,
  Plane,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
  Zap,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoPanel, NeoTabs, type NeoTabItem } from '@/components/neo';
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
import { Avatar, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import {
  AllClear,
  CategoryGlyph,
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
      <NeoPanel>
        <NeoEmpty
          icon={<Lock />}
          title="Manager or Finance audit access required"
          action={
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/expenses')}>
              Back to my spend <ArrowRight />
            </button>
          }
        >
          Approvals & audit is for people managers reviewing their reports’ trips and claims, and Finance auditors queueing claims into payroll.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  const showTrips = section === 'all' || section === 'trips';
  const showManager = section === 'all' || section === 'manager';
  const showFinance = caps.canAudit && (section === 'all' || section === 'finance');

  const tabs: NeoTabItem<InboxSection>[] = [
    { value: 'all', label: 'All actionable', count: approvals.totalCount },
    { value: 'trips', label: 'Trips', icon: <Plane />, count: visiblePendingTrips.length },
    { value: 'manager', label: 'Expense reviews', icon: <ShieldCheck />, count: visibleManagerReports.length },
    ...(caps.canAudit ? [{ value: 'finance' as const, label: 'Finance audit', icon: <FileCheck2 />, count: visibleFinanceReports.length }] : []),
  ];

  return (
    <div className="neo-stack">
      <div className="ex-toolbar">
        <NeoTabs value={section} onChange={setSection} items={tabs} label="Approvals & audit sections" />
      </div>

      {/* ── SECTION 1: Travel Pre-Approvals ── */}
      {showTrips && (
        <NeoPanel hud="Step 1 · Manager" title="Travel pre-approvals" icon={<Plane />} actions={<Chip size="sm">{visiblePendingTrips.length}</Chip>}>
          {visiblePendingTrips.length === 0 ? (
            <AllClear title="All caught up">Every direct-report and company travel request is decided.</AllClear>
          ) : (
            <div className="ex-reviews">
              {visiblePendingTrips.map((trip) => {
                const reqUser = usersById.get(trip.userId);
                const gate = canDecideTrip(viewer, trip, reqUser);
                const isOwn = trip.userId === me?.id;
                const issueCard = issueCardMap[trip.id] ?? true;
                const note = notesMap[trip.id] ?? '';

                return (
                  <article key={trip.id} className="ex-review">
                    <header className="ex-review__head">
                      {reqUser && <Avatar user={reqUser} size={36} />}
                      <div className="ex-review__who">
                        <div className="ex-chips">
                          <b>{reqUser?.name ?? trip.userId}</b>
                          <Chip size="sm">{trip.department}</Chip>
                          <span className="neo-mono ex-faint">{trip.reference}</span>
                          <TripStatusBadge status={trip.status} size="sm" />
                          {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                        </div>
                        <span className="ex-review__sub">
                          {trip.originCity} → <b>{trip.destinationCity}</b> ({trip.destinationCountry}) · {formatRange(trip.departureDate, trip.returnDate)} · {trip.days}d · {trip.cabinClass}
                        </span>
                      </div>
                      <div className="ex-amt ex-amt--lg">
                        <span className="neo-hud">Est. budget</span>
                        <b className="neo-num neo-tint">{formatAed(trip.totalEstimatedAed)}</b>
                      </div>
                    </header>

                    <div className="ex-review__body">
                      <div className="ex-trip__why">
                        <b>{trip.title}</b>
                        <Chip size="sm" tone="app">
                          {TRIP_PURPOSE_META[trip.purpose]?.label ?? trip.purpose}
                        </Chip>
                      </div>
                      <p className="ex-quote">“{trip.businessJustification}”</p>
                    </div>

                    <div className="ex-breakdown">
                      <div>
                        <span>Flights · {trip.flightHours}h</span>
                        <b>{formatAed(trip.estimatedFlightAed)}</b>
                      </div>
                      <div>
                        <span>Hotel</span>
                        <b>{formatAed(trip.estimatedHotelAed)}</b>
                      </div>
                      <div>
                        <span>Per diem · {trip.days}d</span>
                        <b>{formatAed(trip.estimatedPerDiemAed)}</b>
                      </div>
                      <div>
                        <span>Other · CO₂</span>
                        <b>
                          {formatAed(trip.estimatedOtherAed)} · {trip.co2Kg}kg
                        </b>
                      </div>
                    </div>

                    {trip.policyFlags.length > 0 && (
                      <div className="ex-callout" data-tone="warning">
                        {trip.policyFlags.map((flag, idx) => (
                          <div key={idx} className="ex-callout__row">
                            <TriangleAlert />
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Toggle Virtual Corporate Card + Decision Note */}
                    <div className="ex-switch-row">
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <Switch
                          checked={issueCard}
                          disabled={!gate.ok}
                          onChange={(v) => setIssueCardMap((s) => ({ ...s, [trip.id]: v }))}
                          label="Issue Scoped Virtual Corporate Card"
                        />
                        <span className="text-sm">
                          <CreditCard className="ex-inline-icon neo-tint" /> Issue a scoped virtual card · limit {formatAed(Math.ceil(trip.totalEstimatedAed / 500) * 500)}
                        </span>
                      </div>
                    </div>

                    {!gate.ok ? (
                      <p className="ex-gate">
                        <Lock /> {gate.reason}
                      </p>
                    ) : (
                      <div className="ex-decide">
                        <input
                          className="input"
                          value={note}
                          onChange={(e) => setNotesMap((s) => ({ ...s, [trip.id]: e.target.value }))}
                          placeholder="Approval note (required to request changes or reject)..."
                        />
                        <div className="ex-decide__btns">
                          <button
                            type="button"
                            className="neo-btn neo-btn--plasma"
                            onClick={() => {
                              const res = decideTravel(trip.id, 'approved', note, issueCard);
                              toast.result(res, 'Trip pre-approved');
                            }}
                          >
                            <CheckCircle2 /> Approve trip
                          </button>
                          <button
                            type="button"
                            className="neo-btn"
                            onClick={() => {
                              const res = decideTravel(trip.id, 'changes_requested', note, false);
                              toast.result(res, 'Requested revision');
                            }}
                          >
                            <RotateCcw /> Request changes
                          </button>
                          <button
                            type="button"
                            className="neo-btn neo-btn--danger"
                            onClick={() => {
                              const res = decideTravel(trip.id, 'rejected', note, false);
                              toast.result(res, 'Trip rejected');
                            }}
                          >
                            <XCircle /> Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </NeoPanel>
      )}

      {/* ── SECTION 2: Manager Expense Reviews ── */}
      {showManager && (
        <NeoPanel hud="Step 2 · Manager" title="Expense reviews" icon={<ShieldCheck />} actions={<Chip size="sm">{visibleManagerReports.length}</Chip>}>
          {visibleManagerReports.length === 0 ? (
            <AllClear title="Nothing to review">No submitted expense reports are waiting for first-stage manager review.</AllClear>
          ) : (
            <div className="ex-reviews">
              {visibleManagerReports.map((rep) => {
                const reqUser = usersById.get(rep.userId);
                const gate = canManagerDecideReport(viewer, rep, reqUser);
                const isOwn = rep.userId === me?.id;
                const items = rep.receiptIds
                  .map((id) => receiptsById.get(id))
                  .filter((x): x is NonNullable<typeof x> => Boolean(x));
                const note = notesMap[rep.id] ?? '';

                return (
                  <article key={rep.id} className="ex-review">
                    <header className="ex-review__head">
                      {reqUser && <Avatar user={reqUser} size={36} />}
                      <div className="ex-review__who">
                        <div className="ex-chips">
                          <b>{reqUser?.name ?? rep.userId}</b>
                          <Chip size="sm">{rep.costCenter}</Chip>
                          <span className="neo-mono ex-faint">{rep.reference}</span>
                          <ReportStatusBadge status={rep.status} size="sm" />
                          {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                        </div>
                        <span className="ex-review__sub">
                          <b>{rep.title}</b>
                        </span>
                      </div>
                      <div className="ex-amt ex-amt--lg">
                        <span className="neo-hud">Reimbursable</span>
                        <b className="neo-num neo-tint">{formatAed(rep.reimbursableAed, true)}</b>
                        <span>
                          Total {formatAed(rep.totalSpendAed, true)} · card {formatAed(rep.corporateCardAed)}
                        </span>
                      </div>
                    </header>

                    {/* Line Items Inspection */}
                    <ul className="ex-lines">
                      {items.map((r) => (
                        <li key={r.id} className="ex-line">
                          <CategoryGlyph category={r.category} size="sm" />
                          <div className="ex-line__text">
                            <div className="ex-line__top">
                              <b>{r.merchant}</b>
                              <span className="ex-gl">{r.glCode}</span>
                              <span className="ex-faint">
                                {CATEGORY_META[r.category].label} · {formatDay(r.date)}
                              </span>
                              {r.paymentMethod === 'corporate_card' ? (
                                <Chip size="sm" tone="cyan">
                                  Virtual card
                                </Chip>
                              ) : (
                                <Chip size="sm" tone="success">
                                  Out of pocket
                                </Chip>
                              )}
                            </div>
                            {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                          </div>
                          <span className="ex-amt">
                            <b className="neo-mono">{formatAed(r.amountAed, true)}</b>
                            {r.currency !== 'AED' && <span>{formatOrigCurrency(r.originalAmount, r.currency)}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {!gate.ok ? (
                      <p className="ex-gate">
                        <Lock /> {gate.reason}
                      </p>
                    ) : (
                      <div className="ex-decide">
                        <input
                          className="input"
                          value={note}
                          onChange={(e) => setNotesMap((s) => ({ ...s, [rep.id]: e.target.value }))}
                          placeholder="Review note (required to request changes or reject)..."
                        />
                        <div className="ex-decide__btns">
                          <button
                            type="button"
                            className="neo-btn neo-btn--plasma"
                            onClick={() => {
                              const res = managerDecideReport(rep.id, 'manager_approved', note);
                              toast.result(res, 'Approved & routed to Finance');
                            }}
                          >
                            <CheckCircle2 /> Approve & route to Finance
                          </button>
                          <button
                            type="button"
                            className="neo-btn"
                            onClick={() => {
                              const res = managerDecideReport(rep.id, 'changes_requested', note);
                              toast.result(res, 'Returned for revision');
                            }}
                          >
                            <RotateCcw /> Request changes
                          </button>
                          <button
                            type="button"
                            className="neo-btn neo-btn--danger"
                            onClick={() => {
                              const res = managerDecideReport(rep.id, 'rejected', note);
                              toast.result(res, 'Report rejected');
                            }}
                          >
                            <XCircle /> Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </NeoPanel>
      )}

      {/* ── SECTION 3: Finance Audit & Payroll Queue (`caps.canAudit`) ── */}
      {showFinance && (
        <>
          <NeoPanel hud="Step 3 · Finance" title="Finance audit" icon={<FileCheck2 />} actions={<Chip size="sm">{visibleFinanceReports.length}</Chip>}>
            <p className="ex-hint ex-hint--top">Verify GL codes, input VAT recovery and OCR confidence, then queue the claim into a monthly payroll run.</p>
            {visibleFinanceReports.length === 0 ? (
              <AllClear title="Audit queue is empty">Every manager-approved report has been audited and queued for payroll.</AllClear>
            ) : (
              <div className="ex-reviews">
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
                    <article key={rep.id} className="ex-review">
                      <header className="ex-review__head">
                        {reqUser && <Avatar user={reqUser} size={36} />}
                        <div className="ex-review__who">
                          <div className="ex-chips">
                            <b>{reqUser?.name ?? rep.userId}</b>
                            <Chip size="sm">{rep.costCenter}</Chip>
                            <span className="neo-mono ex-faint">{rep.reference}</span>
                            <ReportStatusBadge status={rep.status} size="sm" />
                            {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                          </div>
                          <span className="ex-review__sub">
                            <b>{rep.title}</b>
                            {mgrUser && ` · signed off by ${mgrUser.name}`}
                          </span>
                        </div>
                        <div className="ex-amt ex-amt--lg">
                          <span className="neo-hud">Net payroll payout</span>
                          <b className="neo-num neo-tint">{formatAed(rep.reimbursableAed, true)}</b>
                          <span>
                            VAT {formatAed(rep.vatTotalAed, true)} · card {formatAed(rep.corporateCardAed)}
                          </span>
                        </div>
                      </header>

                      {/* GL, VAT & OCR Inspection Rows */}
                      <ul className="ex-lines">
                        {items.map((r) => (
                          <li key={r.id} className="ex-line">
                            <CategoryGlyph category={r.category} size="sm" />
                            <div className="ex-line__text">
                              <div className="ex-line__top">
                                <span className="ex-gl">{r.glCode}</span>
                                <b>{r.merchant}</b>
                                <Chip size="sm" className="neo-mono">
                                  OCR {r.ocrConfidence}%
                                </Chip>
                                {r.vatAed > 0 && (
                                  <Chip size="sm" tone="cyan" className="neo-mono">
                                    VAT {formatAed(r.vatAed, true)}
                                  </Chip>
                                )}
                              </div>
                              {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                            </div>
                            <span className="ex-amt">
                              <b className="neo-mono">{formatAed(r.amountAed, true)}</b>
                            </span>
                          </li>
                        ))}
                      </ul>

                      {!gate.ok ? (
                        <p className="ex-gate">
                          <Lock /> {gate.reason}
                        </p>
                      ) : (
                        <div className="ex-decide">
                          <select
                            className="select mono ex-decide__period"
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
                            className="input"
                            value={note}
                            onChange={(e) => setNotesMap((s) => ({ ...s, [rep.id]: e.target.value }))}
                            placeholder="Finance GL / VAT audit note..."
                          />

                          <div className="ex-decide__btns">
                            <button
                              type="button"
                              className="neo-btn neo-btn--plasma"
                              onClick={() => {
                                const res = financeAuditReport(rep.id, 'payroll_queued', targetPeriod, note);
                                toast.result(res, `Queued into ${targetPeriod} payroll`);
                              }}
                            >
                              <Banknote /> Verify & queue into payroll
                            </button>

                            <button
                              type="button"
                              className="neo-btn"
                              onClick={() => {
                                const res = financeAuditReport(rep.id, 'changes_requested', undefined, note);
                                toast.result(res, 'Returned to employee');
                              }}
                            >
                              <RotateCcw /> Request changes
                            </button>

                            <button
                              type="button"
                              className="neo-btn neo-btn--danger"
                              onClick={() => {
                                const res = financeAuditReport(rep.id, 'rejected', undefined, note);
                                toast.result(res, 'Report rejected');
                              }}
                            >
                              <XCircle /> Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </NeoPanel>

          {/* Currently `payroll_queued` Reports + Express Off-Cycle Wire */}
          <NeoPanel
            hud="Step 4 · Payroll"
            title="Queued for payroll"
            icon={<Banknote />}
            actions={<Chip size="sm">{queuedPayrollReports.length}</Chip>}
          >
            <p className="ex-hint ex-hint--top">Synced automatically into the monthly WPS pay run — or send an express off-cycle wire for urgent, high-outlay claims.</p>
            {queuedPayrollReports.length === 0 ? (
              <AllClear title="Payroll queue is empty">No expense reports are currently waiting for the next pay run.</AllClear>
            ) : (
              <ul className="ex-queue">
                {queuedPayrollReports.map((rep) => {
                  const emp = usersById.get(rep.userId);
                  const isOwn = rep.userId === me?.id;
                  const canWire = !isOwn || isBreakGlassAdmin;
                  return (
                    <li key={rep.id} className="ex-queue__row">
                      {emp && <Avatar user={emp} size={30} />}
                      <div className="ex-queue__text">
                        <div className="ex-chips">
                          <b>{emp?.name ?? rep.userId}</b>
                          <span className="neo-mono ex-faint">{rep.reference}</span>
                          <Chip size="sm" tone="cyan" className="neo-mono">
                            Payroll {rep.payrollPeriod}
                          </Chip>
                          {isOwn && <SeparationOfDutiesBadge breakGlass={isBreakGlassAdmin} />}
                        </div>
                        <span className="ex-faint truncate">{rep.title}</span>
                      </div>
                      <b className="neo-num neo-tint ex-queue__amt">{formatAed(rep.reimbursableAed, true)}</b>
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--sm"
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
                        <Zap /> Express wire
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </NeoPanel>
        </>
      )}
    </div>
  );
}
