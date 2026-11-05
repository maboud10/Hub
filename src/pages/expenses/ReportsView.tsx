import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  History,
  Plane,
  Receipt,
  Save,
  Send,
  Sparkles,
  Square,
  Wallet,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { formatDay } from '@/hr/calendar';
import { CATEGORY_META, DEPT_COST_CENTER } from '@/expenses/constants';
import { useExpenses } from '@/expenses/store';
import { useMySpendSummary } from '@/expenses/selectors';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { Avatar, EmptyState, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import {
  formatAed,
  formatOrigCurrency,
  PolicyWarningChips,
  ReportStatusBadge,
} from './shared';

export function ReportsView() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const summary = useMySpendSummary();
  const allReceipts = useExpenses((s) => s.receipts);
  const createAndSubmitReport = useExpenses((s) => s.createAndSubmitReport);
  const submitDraftReport = useExpenses((s) => s.submitDraftReport);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const receiptsById = useMemo(() => new Map(allReceipts.map((r) => [r.id, r])), [allReceipts]);
  const tripsById = useMemo(() => new Map(summary.myTrips.map((t) => [t.id, t])), [summary.myTrips]);

  const linkableTrips = useMemo(
    () =>
      summary.myTrips.filter(
        (t) =>
          (t.status === 'approved' || t.status === 'booked' || t.status === 'completed') &&
          !t.linkedReportId,
      ),
    [summary.myTrips],
  );

  // ── Builder Studio State ──
  const [selectedTripId, setSelectedTripId] = useState<string>(() => searchParams.get('tripId') ?? '');
  const [includePerDiem, setIncludePerDiem] = useState<boolean>(true);
  const [title, setTitle] = useState<string>('');
  const [submitNote, setSubmitNote] = useState<string>('');
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>(() =>
    summary.unbundledReceipts.map((r) => r.id),
  );

  // Sync URL ?tripId=... or ?new=1
  useEffect(() => {
    const paramTrip = searchParams.get('tripId');
    if (paramTrip) {
      setSelectedTripId(paramTrip);
      const trip = tripsById.get(paramTrip);
      if (trip) {
        setTitle(`${trip.destinationCity} — ${trip.title}`);
        const matching = summary.unbundledReceipts
          .filter((r) => r.tripId === paramTrip || !r.tripId)
          .map((r) => r.id);
        if (matching.length > 0) setSelectedReceiptIds(matching);
      }
    } else if (searchParams.get('new') === '1') {
      setSelectedReceiptIds(summary.unbundledReceipts.map((r) => r.id));
      if (!title && summary.unbundledReceipts.length > 0) {
        setTitle(`${me?.department ?? 'Team'} Travel & Business Expenses`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep selectedReceiptIds pruned to still-unbundled items
  const validSelectedSet = useMemo(() => {
    const unbundledSet = new Set(summary.unbundledReceipts.map((r) => r.id));
    return new Set(selectedReceiptIds.filter((id) => unbundledSet.has(id)));
  }, [selectedReceiptIds, summary.unbundledReceipts]);

  const selectedTrip = selectedTripId ? tripsById.get(selectedTripId) : undefined;
  const existingTripPerDiem = useMemo(
    () =>
      selectedTrip
        ? summary.myReceipts.find((r) => r.tripId === selectedTrip.id && r.category === 'per_diem')
        : undefined,
    [selectedTrip, summary.myReceipts],
  );

  // Live split summary math
  const splitPreview = useMemo(() => {
    const chosen = summary.unbundledReceipts.filter((r) => validSelectedSet.has(r.id));
    let totalSpendAed = chosen.reduce((s, r) => s + r.amountAed, 0);
    const corporateCardAed = chosen
      .filter((r) => r.paymentMethod === 'corporate_card')
      .reduce((s, r) => s + r.amountAed, 0);
    const vatTotalAed = chosen.reduce((s, r) => s + r.vatAed, 0);

    let autoPerDiemAdd = 0;
    if (selectedTrip && includePerDiem) {
      if (existingTripPerDiem && !existingTripPerDiem.reportId && !validSelectedSet.has(existingTripPerDiem.id)) {
        autoPerDiemAdd = existingTripPerDiem.amountAed;
      } else if (!existingTripPerDiem) {
        autoPerDiemAdd = Math.round(selectedTrip.days * selectedTrip.perDiemRateAed * 100) / 100;
      }
    }

    totalSpendAed = Math.round((totalSpendAed + autoPerDiemAdd) * 100) / 100;
    const reimbursableAed = Math.round((totalSpendAed - corporateCardAed) * 100) / 100;

    return {
      itemCount: chosen.length + (autoPerDiemAdd > 0 ? 1 : 0),
      totalSpendAed,
      corporateCardAed: Math.round(corporateCardAed * 100) / 100,
      reimbursableAed,
      vatTotalAed: Math.round(vatTotalAed * 100) / 100,
      autoPerDiemAdd,
    };
  }, [summary.unbundledReceipts, validSelectedSet, selectedTrip, includePerDiem, existingTripPerDiem]);

  const toggleReceipt = (id: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBuildReport = (submitNow: boolean) => {
    const res = createAndSubmitReport({
      title:
        title.trim() ||
        (selectedTrip
          ? `${selectedTrip.destinationCity} Trip Expenses`
          : `${me?.department ?? 'Business'} Expense Claim`),
      tripId: selectedTripId || undefined,
      receiptIds: [...validSelectedSet],
      includeTripPerDiem: Boolean(selectedTripId && includePerDiem),
      submitNow,
      note: submitNote || undefined,
    });
    if (toast.result(res, submitNow ? 'Expense report submitted' : 'Draft saved')) {
      setTitle('');
      setSubmitNote('');
      setSelectedReceiptIds([]);
      if (searchParams.size > 0) {
        setSearchParams(new URLSearchParams(), { replace: true });
      }
    }
  };

  // ── Expandable Reports List State ──
  const [expandedId, setExpandedId] = useState<string | null>(
    () => summary.myReports[0]?.id ?? null,
  );
  const [resubmitNotes, setResubmitNotes] = useState<Record<string, string>>({});

  const costCenter = me ? DEPT_COST_CENTER[me.department] : DEPT_COST_CENTER.Engineering;

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Expense Report Studio */}
      <section className="card stack" style={{ minWidth: 0 }}>
        <div className="row row--between row--wrap" style={{ gap: 10 }}>
          <div>
            <h2 className="section-title" style={{ fontSize: 17 }}>
              <FileSpreadsheet style={{ width: 18, height: 18, color: 'var(--ex-ink)' }} />
              Expense Report Builder Studio
            </h2>
            <p className="text-xs muted" style={{ marginTop: 2 }}>
              Bundle unsubmitted vault receipts, optionally attach a pre-approved trip + 1-click Per Diem, and split Corporate Card vs Out-of-Pocket reimbursement.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => navigate('/expenses/receipts')}
          >
            <Receipt /> Scan More Receipts
          </button>
        </div>

        <div className="ex-two-col">
          {/* Left: Title, Trip Link, Per Diem Toggle & Receipt Checklist */}
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="ex-form-grid">
              <label className="field">
                <span className="field-label">Report Title</span>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. London Architecture Sprint — Hotel, Rail & Per Diem"
                />
              </label>

              <label className="field">
                <span className="field-label">Link to Pre-Approved Trip (Optional)</span>
                <select
                  className="select"
                  value={selectedTripId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedTripId(nextId);
                    const tr = tripsById.get(nextId);
                    if (tr && !title.trim()) {
                      setTitle(`${tr.destinationCity} — ${tr.title}`);
                    }
                  }}
                >
                  <option value="">No linked trip (standalone claim)</option>
                  {linkableTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.destinationCity} ({t.days}d) · {t.reference}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedTrip && (
              <div
                className="row row--between row--wrap"
                style={{
                  padding: '10px 13px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid rgb(var(--ex-1-rgb) / 0.32)',
                  background: 'rgb(var(--ex-1-rgb) / 0.07)',
                  gap: 10,
                }}
              >
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <Switch
                    checked={includePerDiem}
                    onChange={setIncludePerDiem}
                    label="Auto-include Trip Per Diem"
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="text-sm" style={{ fontWeight: 600 }}>
                      <Sparkles style={{ width: 13, height: 13, display: 'inline', marginRight: 5, color: 'var(--ex-ink)' }} />
                      Auto-include {selectedTrip.destinationCity} Trip Per Diem
                    </div>
                    <div className="text-xs muted">
                      {selectedTrip.days} days × {formatAed(selectedTrip.perDiemRateAed)}/day ={' '}
                      <b className="mono">{formatAed(selectedTrip.days * selectedTrip.perDiemRateAed)}</b> tax-free allowance
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Unbundled Receipts Multi-Select Checklist */}
            <div className="stack stack--sm">
              <div className="row row--between">
                <span className="field-label">
                  Unsubmitted Vault Receipts ({validSelectedSet.size}/{summary.unbundledReceipts.length} selected)
                </span>
                {summary.unbundledReceipts.length > 0 && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => {
                      if (validSelectedSet.size === summary.unbundledReceipts.length) {
                        setSelectedReceiptIds([]);
                      } else {
                        setSelectedReceiptIds(summary.unbundledReceipts.map((r) => r.id));
                      }
                    }}
                  >
                    {validSelectedSet.size === summary.unbundledReceipts.length ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>

              {summary.unbundledReceipts.length === 0 ? (
                <div
                  className="text-xs muted"
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px dashed var(--border-2)',
                  }}
                >
                  Your Receipt Vault has 0 unsubmitted receipts right now.{' '}
                  {selectedTrip && includePerDiem
                    ? `You can still submit this report with your ${selectedTrip.days}-day Trip Per Diem (${formatAed(splitPreview.autoPerDiemAdd)})!`
                    : 'Scan a sample or PDF receipt in Smart Receipt Vault first.'}
                </div>
              ) : (
                <div className="stack stack--sm">
                  {summary.unbundledReceipts.map((r) => {
                    const checked = validSelectedSet.has(r.id);
                    return (
                      <div
                        key={r.id}
                        role="checkbox"
                        aria-checked={checked}
                        tabIndex={0}
                        className={cx('ex-check-item', checked && 'is-checked')}
                        onClick={() => toggleReceipt(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleReceipt(r.id);
                          }
                        }}
                      >
                        <div className="row" style={{ gap: 10, minWidth: 0 }}>
                          {checked ? (
                            <CheckSquare style={{ width: 17, height: 17, color: 'var(--ex-ink)', flex: 'none' }} />
                          ) : (
                            <Square style={{ width: 17, height: 17, color: 'var(--text-3)', flex: 'none' }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div className="row row--wrap" style={{ gap: 6 }}>
                              <span className="text-sm" style={{ fontWeight: 600 }}>
                                {r.merchant}
                              </span>
                              <span className="ex-gl-badge">{r.glCode}</span>
                              {r.paymentMethod === 'corporate_card' ? (
                                <span className="badge badge--info">Virtual Card</span>
                              ) : (
                                <span className="badge badge--success">Reimbursable</span>
                              )}
                            </div>
                            <div className="text-xs muted">
                              {formatDay(r.date)} ·{' '}
                              {r.currency !== 'AED'
                                ? `${formatOrigCurrency(r.originalAmount, r.currency)} → ${formatAed(r.amountAed, true)}`
                                : formatAed(r.amountAed, true)}
                            </div>
                          </div>
                        </div>

                        <b className="mono text-sm" style={{ flex: 'none' }}>
                          {formatAed(r.amountAed, true)}
                        </b>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="field">
              <span className="field-label">Submission Note for Manager (Optional)</span>
              <input
                className="input"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                placeholder="e.g. Flights settled on Virtual Card; hotel & UK per diem out-of-pocket."
              />
            </label>
          </div>

          {/* Right: Live Split Summary Panel */}
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="ex-split-panel">
              <div className="row row--between">
                <span style={{ fontWeight: 650, fontSize: 14.5 }}>Live Reconciliation &amp; Payout Split</span>
                <span className="badge badge--muted mono">{splitPreview.itemCount} line items</span>
              </div>

              <div className="ex-split-row">
                <span>Cost Center Allocation</span>
                <b>{costCenter}</b>
              </div>

              <div className="ex-split-row">
                <span>Total Business Spend</span>
                <b>{formatAed(splitPreview.totalSpendAed, true)}</b>
              </div>

              <div className="ex-split-row">
                <span>
                  <CreditCard style={{ width: 13, height: 13, display: 'inline', marginRight: 5 }} />
                  Less: Corporate Card Reconciled
                </span>
                <b>− {formatAed(splitPreview.corporateCardAed, true)}</b>
              </div>

              <div className="ex-split-row">
                <span>Recoverable Input VAT (Finance GL)</span>
                <b>{formatAed(splitPreview.vatTotalAed, true)}</b>
              </div>

              {splitPreview.autoPerDiemAdd > 0 && (
                <div className="ex-split-row">
                  <span>Auto-Generated Trip Per Diem</span>
                  <b style={{ color: 'var(--ex-ink)' }}>+ {formatAed(splitPreview.autoPerDiemAdd, true)}</b>
                </div>
              )}

              <div className="ex-split-row ex-split-row--net">
                <span>
                  <Wallet style={{ width: 15, height: 15, display: 'inline', marginRight: 6, color: 'var(--ex-ink)' }} />
                  Out-of-Pocket Reimbursable
                </span>
                <b>{formatAed(splitPreview.reimbursableAed, true)}</b>
              </div>
            </div>

            <div className="row row--wrap" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                disabled={splitPreview.itemCount === 0}
                onClick={() => handleBuildReport(false)}
              >
                <Save /> Save Draft
              </button>
              <button
                type="button"
                className="btn ex-btn-teal"
                style={{ flex: 1.4 }}
                disabled={splitPreview.itemCount === 0}
                onClick={() => handleBuildReport(true)}
              >
                <Send /> Submit to Manager
              </button>
            </div>

            <p className="text-xs muted">
              Once approved by your manager and verified by Finance, your{' '}
              <b className="mono">{formatAed(splitPreview.reimbursableAed, true)}</b> out-of-pocket claim is queued directly into your monthly tax-free paycheck.
            </p>
          </div>
        </div>
      </section>

      {/* Expandable List of User's Expense Reports */}
      <section className="stack" style={{ minWidth: 0 }}>
        <div className="row row--between row--wrap">
          <h2 className="section-title">
            My Expense Reports
            <span className="count">{summary.myReports.length}</span>
          </h2>
        </div>

        {summary.myReports.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet />}
            title="No expense reports created yet"
          >
            Select receipts in the Builder Studio above to save a draft or submit your first report.
          </EmptyState>
        ) : (
          <div className="stack">
            {summary.myReports.map((rep) => {
              const isOpen = expandedId === rep.id;
              const items = rep.receiptIds
                .map((id) => receiptsById.get(id))
                .filter((x): x is NonNullable<typeof x> => Boolean(x));
              const linkedTrip = rep.tripId ? tripsById.get(rep.tripId) : undefined;
              const canSubmitNow = rep.status === 'draft' || rep.status === 'changes_requested';

              return (
                <article key={rep.id} className="card stack" style={{ minWidth: 0 }}>
                  {/* Summary Header */}
                  <div
                    className="row row--between row--wrap"
                    style={{ gap: 12, cursor: 'pointer' }}
                    onClick={() => setExpandedId(isOpen ? null : rep.id)}
                  >
                    <div className="stack stack--sm" style={{ minWidth: 0 }}>
                      <div className="row row--wrap" style={{ gap: 8 }}>
                        <span className="mono text-xs muted">{rep.reference}</span>
                        <ReportStatusBadge status={rep.status} />
                        <span className="badge badge--muted">{rep.costCenter}</span>
                        {linkedTrip && (
                          <span className="badge badge--info">
                            <Plane /> {linkedTrip.destinationCity}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 650, fontSize: 15.5 }}>{rep.title}</div>
                      <div className="text-xs muted">
                        {items.length} line item{items.length === 1 ? '' : 's'} · Total spend{' '}
                        <b className="mono">{formatAed(rep.totalSpendAed, true)}</b>
                        {rep.corporateCardAed > 0 && (
                          <> · Corp card reconciled <b className="mono">{formatAed(rep.corporateCardAed)}</b></>
                        )}
                        {rep.payrollPeriod && (
                          <> · Target payroll <b className="mono">{rep.payrollPeriod}</b></>
                        )}
                      </div>
                    </div>

                    <div className="row" style={{ gap: 14 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div className="text-xs muted">Reimbursable</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--ex-ink)' }}>
                          {formatAed(rep.reimbursableAed, true)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label={isOpen ? 'Collapse report' : 'Expand report'}
                      >
                        {isOpen ? <ChevronUp /> : <ChevronDown />}
                      </button>
                    </div>
                  </div>

                  {/* Review / Revision Note Banner */}
                  {rep.reviewNote && (
                    <div
                      className="text-xs"
                      style={{
                        padding: '9px 12px',
                        borderRadius: 'var(--r-xs)',
                        background:
                          rep.status === 'changes_requested'
                            ? 'rgb(var(--warning-rgb) / 0.12)'
                            : 'var(--surface-2)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <b>Reviewer note:</b> {rep.reviewNote}
                    </div>
                  )}

                  {/* Expanded Line Items, Resubmit Form & Audit Trail */}
                  {isOpen && (
                    <div className="stack" style={{ paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      <div className="text-xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Attached Receipts ({items.length})
                      </div>
                      <div className="stack stack--sm">
                        {items.map((r) => (
                          <div
                            key={r.id}
                            className="row row--between row--wrap"
                            style={{
                              padding: '10px 12px',
                              borderRadius: 'var(--r-sm)',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              gap: 10,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div className="row row--wrap" style={{ gap: 6 }}>
                                <b className="text-sm">{r.merchant}</b>
                                <span className="ex-gl-badge">{r.glCode}</span>
                                <span className="badge badge--muted">{CATEGORY_META[r.category].label}</span>
                                {r.paymentMethod === 'corporate_card' ? (
                                  <span className="badge badge--info">Virtual Card</span>
                                ) : (
                                  <span className="badge badge--success">Out-of-Pocket</span>
                                )}
                              </div>
                              <div className="text-xs muted" style={{ marginTop: 2 }}>
                                {formatDay(r.date)}
                                {r.fileName && ` · ${r.fileName}`}
                                {r.notes && ` · ${r.notes}`}
                              </div>
                              {r.warnings.length > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  <PolicyWarningChips warnings={r.warnings} />
                                </div>
                              )}
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div className="mono text-sm" style={{ fontWeight: 650 }}>
                                {formatAed(r.amountAed, true)}
                              </div>
                              {r.currency !== 'AED' && (
                                <div className="mono text-xs muted">
                                  {formatOrigCurrency(r.originalAmount, r.currency)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Draft Submit / Changes Requested Resubmit Bar */}
                      {canSubmitNow && (
                        <div className="row row--wrap" style={{ gap: 8 }}>
                          <input
                            className="input grow"
                            style={{ minWidth: 200 }}
                            value={resubmitNotes[rep.id] ?? ''}
                            onChange={(e) =>
                              setResubmitNotes((s) => ({ ...s, [rep.id]: e.target.value }))
                            }
                            placeholder={
                              rep.status === 'changes_requested'
                                ? 'Add revision note for your manager...'
                                : 'Optional note before submitting...'
                            }
                          />
                          <button
                            type="button"
                            className="btn ex-btn-teal"
                            onClick={() => {
                              const res = submitDraftReport(rep.id, resubmitNotes[rep.id]);
                              toast.result(res, 'Submitted to manager');
                            }}
                          >
                            <Send />{' '}
                            {rep.status === 'changes_requested' ? 'Resubmit Report' : 'Submit Draft to Manager'}
                          </button>
                        </div>
                      )}

                      {rep.status === 'reimbursed' && (
                        <div className="row row--between row--wrap" style={{ gap: 8 }}>
                          <span className="text-xs muted">
                            Settled via <code className="mono">{rep.paymentRef}</code> in payroll period{' '}
                            <code className="mono">{rep.payrollPeriod}</code>
                          </span>
                          <button
                            type="button"
                            className="btn btn--sm btn--success"
                            onClick={() => navigate('/hr/documents?tab=payslips')}
                          >
                            View on HR Portal Payslip <ExternalLink />
                          </button>
                        </div>
                      )}

                      {/* Audit Trail History */}
                      <div className="stack stack--sm">
                        <div className="row" style={{ gap: 6 }}>
                          <History style={{ width: 14, height: 14, color: 'var(--text-3)' }} />
                          <span className="text-xs muted" style={{ fontWeight: 600 }}>
                            Four-Eyes Audit Trail
                          </span>
                        </div>
                        <div className="stack stack--sm">
                          {rep.history.map((step, idx) => {
                            const actor = usersById.get(step.actorId);
                            return (
                              <div
                                key={`${step.at}-${idx}`}
                                className="row row--between row--wrap text-xs"
                                style={{
                                  padding: '7px 10px',
                                  borderRadius: 'var(--r-xs)',
                                  background: 'var(--surface)',
                                  gap: 8,
                                }}
                              >
                                <div className="row" style={{ gap: 8, minWidth: 0 }}>
                                  {actor && <Avatar user={actor} size={22} />}
                                  <span style={{ fontWeight: 600 }}>{actor?.name ?? step.actorId}</span>
                                  <span className="badge badge--muted mono">{step.action.replace('_', ' ')}</span>
                                  {step.note && <span className="muted truncate">— “{step.note}”</span>}
                                </div>
                                <span className="mono muted">{formatDateTime(step.at)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
