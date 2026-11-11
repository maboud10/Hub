import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowRight,
  CheckSquare,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FilePen,
  FileSpreadsheet,
  History,
  Plane,
  Save,
  Send,
  Sparkles,
  Square,
  Wallet,
} from 'lucide-react';
import { Chip, NeoBanner, NeoBanners, NeoEmpty, NeoPanel, NeoTracker } from '@/components/neo';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { formatDay } from '@/hr/calendar';
import { CATEGORY_META, DEPT_COST_CENTER } from '@/expenses/constants';
import { useExpenses } from '@/expenses/store';
import { useMySpendSummary } from '@/expenses/selectors';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { Avatar, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import {
  CategoryGlyph,
  formatAed,
  formatOrigCurrency,
  PolicyWarningChips,
  ReportStatusBadge,
} from './shared';
import { reportTrack, useSpendTrackCtx } from './trackers';

export function ReportsView() {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const summary = useMySpendSummary();
  const trackCtx = useSpendTrackCtx();
  const allReceipts = useExpenses((s) => s.receipts);
  const createAndSubmitReport = useExpenses((s) => s.createAndSubmitReport);
  const submitDraftReport = useExpenses((s) => s.submitDraftReport);

  const studioRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

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
    if (paramTrip || searchParams.get('new') === '1') {
      requestAnimationFrame(() => {
        studioRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        titleRef.current?.focus({ preventScroll: true });
      });
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
  const needsChanges = summary.myReports.filter((r) => r.status === 'changes_requested');
  const allSelected = summary.unbundledReceipts.length > 0 && validSelectedSet.size === summary.unbundledReceipts.length;

  const openReport = (id: string) => {
    setExpandedId(id);
    requestAnimationFrame(() => document.getElementById(`ex-rep-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  return (
    <div className="neo-stack">
      {needsChanges.length > 0 && (
        <NeoBanners>
          {needsChanges.slice(0, 2).map((rep) => (
            <NeoBanner key={rep.id} tone="warning" icon={<FilePen />} title={`${rep.reference} needs changes`} meta={rep.title} onClick={() => openReport(rep.id)}>
              {rep.reviewNote ? `“${rep.reviewNote}”` : 'Open the report to see what to fix, then resubmit.'}
            </NeoBanner>
          ))}
        </NeoBanners>
      )}

      {/* Expense Report Studio */}
      <section ref={studioRef} className="neo-panel" aria-label="Report studio">
        <header className="neo-panel__head">
          <span className="neo-panel__icon">
            <FileSpreadsheet />
          </span>
          <div className="neo-panel__titles">
            <div className="neo-hud">Report studio</div>
            <h2 className="neo-panel__title">Build an expense report</h2>
          </div>
          <div className="neo-panel__actions">
            <Link to="/expenses/receipts" className="neo-btn neo-btn--ghost neo-btn--xs">
              Scan more <ArrowRight />
            </Link>
          </div>
        </header>

        <div className="ex-two-col">
          {/* Left: Title, Trip Link, Per Diem Toggle & Receipt Checklist */}
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="ex-form-grid">
              <label className="field">
                <span className="field-label">Report title</span>
                <input
                  ref={titleRef}
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. London Architecture Sprint — Hotel, Rail & Per Diem"
                />
              </label>

              <label className="field">
                <span className="field-label">Link a pre-approved trip (optional)</span>
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
              <div className="ex-perdiem ex-perdiem--row">
                <Switch
                  checked={includePerDiem}
                  onChange={setIncludePerDiem}
                  label="Auto-include Trip Per Diem"
                />
                <div>
                  <b>
                    <Sparkles className="ex-inline-icon" /> Include {selectedTrip.destinationCity} per diem
                  </b>
                  <span>
                    {selectedTrip.days} days × {formatAed(selectedTrip.perDiemRateAed)}/day ={' '}
                    <b className="neo-mono">{formatAed(selectedTrip.days * selectedTrip.perDiemRateAed)}</b> tax-free allowance
                  </span>
                </div>
              </div>
            )}

            {/* Unbundled Receipts Multi-Select Checklist */}
            <div className="stack stack--sm">
              <div className="ex-subhead">
                <span className="neo-hud">
                  Unsubmitted receipts · {validSelectedSet.size}/{summary.unbundledReceipts.length} selected
                </span>
                {summary.unbundledReceipts.length > 0 && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => {
                      if (allSelected) {
                        setSelectedReceiptIds([]);
                      } else {
                        setSelectedReceiptIds(summary.unbundledReceipts.map((r) => r.id));
                      }
                    }}
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>

              {summary.unbundledReceipts.length === 0 ? (
                <div className="ex-dashed">
                  Your receipt vault has no unsubmitted receipts right now.{' '}
                  {selectedTrip && includePerDiem
                    ? `You can still submit this report with your ${selectedTrip.days}-day trip per diem (${formatAed(splitPreview.autoPerDiemAdd)}).`
                    : 'Scan a receipt in the vault first — or describe one to Nova on the Flow home.'}
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
                        className={cx('ex-check', checked && 'is-checked')}
                        onClick={() => toggleReceipt(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleReceipt(r.id);
                          }
                        }}
                      >
                        {checked ? <CheckSquare className="ex-check__box is-on" /> : <Square className="ex-check__box" />}
                        <CategoryGlyph category={r.category} size="sm" />
                        <div className="ex-check__text">
                          <div className="ex-check__top">
                            <b>{r.merchant}</b>
                            <span className="ex-gl">{r.glCode}</span>
                            {r.paymentMethod === 'corporate_card' ? (
                              <Chip size="sm" tone="cyan">
                                Virtual card
                              </Chip>
                            ) : (
                              <Chip size="sm" tone="success">
                                Reimbursable
                              </Chip>
                            )}
                          </div>
                          <span className="ex-check__meta">
                            {formatDay(r.date)} ·{' '}
                            {r.currency !== 'AED'
                              ? `${formatOrigCurrency(r.originalAmount, r.currency)} → ${formatAed(r.amountAed, true)}`
                              : formatAed(r.amountAed, true)}
                          </span>
                        </div>
                        <b className="ex-check__amt neo-num">{formatAed(r.amountAed, true)}</b>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="field">
              <span className="field-label">Note for your manager (optional)</span>
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
            <div className="ex-split">
              <div className="ex-split__head">
                <span className="neo-hud">Live reconciliation</span>
                <Chip size="sm">{splitPreview.itemCount} line items</Chip>
              </div>

              <div className="ex-split__row">
                <span>Cost center</span>
                <b>{costCenter}</b>
              </div>

              <div className="ex-split__row">
                <span>Total business spend</span>
                <b>{formatAed(splitPreview.totalSpendAed, true)}</b>
              </div>

              <div className="ex-split__row">
                <span>
                  <CreditCard className="ex-inline-icon" /> Less corporate card
                </span>
                <b>− {formatAed(splitPreview.corporateCardAed, true)}</b>
              </div>

              <div className="ex-split__row">
                <span>Recoverable input VAT</span>
                <b>{formatAed(splitPreview.vatTotalAed, true)}</b>
              </div>

              {splitPreview.autoPerDiemAdd > 0 && (
                <div className="ex-split__row">
                  <span>Trip per diem (auto)</span>
                  <b className="neo-tint">+ {formatAed(splitPreview.autoPerDiemAdd, true)}</b>
                </div>
              )}

              <div className="ex-split__row ex-split__row--net">
                <span>
                  <Wallet className="ex-inline-icon" /> Out-of-pocket reimbursable
                </span>
                <b>{formatAed(splitPreview.reimbursableAed, true)}</b>
              </div>
            </div>

            <div className="ex-btn-row">
              <button
                type="button"
                className="neo-btn"
                disabled={splitPreview.itemCount === 0}
                onClick={() => handleBuildReport(false)}
              >
                <Save /> Save draft
              </button>
              <button
                type="button"
                className="neo-btn neo-btn--plasma"
                disabled={splitPreview.itemCount === 0}
                onClick={() => handleBuildReport(true)}
              >
                <Send /> Submit to manager
              </button>
            </div>

            <p className="ex-hint">
              Once your manager approves and Finance verifies it, the{' '}
              <b className="neo-mono">{formatAed(splitPreview.reimbursableAed, true)}</b> out-of-pocket claim is queued straight into your monthly, tax-free paycheck.
            </p>
          </div>
        </div>
      </section>

      {/* Expandable List of User's Expense Reports */}
      <NeoPanel hud="History" title="My expense reports" actions={<Chip size="sm">{summary.myReports.length}</Chip>}>
        {summary.myReports.length === 0 ? (
          <NeoEmpty compact icon={<FileSpreadsheet />} title="No expense reports yet">
            Select receipts in the studio above to save a draft or submit your first report.
          </NeoEmpty>
        ) : (
          <ul className="ex-reps">
            {summary.myReports.map((rep) => {
              const isOpen = expandedId === rep.id;
              const items = rep.receiptIds
                .map((id) => receiptsById.get(id))
                .filter((x): x is NonNullable<typeof x> => Boolean(x));
              const linkedTrip = rep.tripId ? tripsById.get(rep.tripId) : undefined;
              const canSubmitNow = rep.status === 'draft' || rep.status === 'changes_requested';
              const track = reportTrack(rep, trackCtx);
              const trackLabel = `${rep.reference} · Reimbursement tracker`;

              return (
                <li key={rep.id} id={`ex-rep-${rep.id}`} className={cx('ex-rep', isOpen && 'is-open')}>
                  {/* Summary Header */}
                  <button
                    type="button"
                    className="ex-rep__head"
                    aria-expanded={isOpen}
                    onClick={() => setExpandedId(isOpen ? null : rep.id)}
                  >
                    <span className="ex-rep__icon" aria-hidden="true">
                      <FileSpreadsheet />
                    </span>
                    <span className="ex-rep__text">
                      <span className="ex-rep__chips">
                        <span className="neo-mono ex-faint">{rep.reference}</span>
                        <ReportStatusBadge status={rep.status} size="sm" />
                        {linkedTrip && (
                          <Chip size="sm" icon={<Plane />}>
                            {linkedTrip.destinationCity}
                          </Chip>
                        )}
                      </span>
                      <span className="ex-rep__title">{rep.title}</span>
                      <span className="ex-rep__meta">
                        {items.length} line item{items.length === 1 ? '' : 's'} · total {formatAed(rep.totalSpendAed, true)}
                        {rep.corporateCardAed > 0 && <> · card {formatAed(rep.corporateCardAed)}</>}
                        {rep.payrollPeriod && <> · payroll {rep.payrollPeriod}</>} · {rep.costCenter}
                      </span>
                    </span>
                    <span className="ex-amt">
                      <span className="neo-hud">Reimbursable</span>
                      <b className="neo-num neo-tint">{formatAed(rep.reimbursableAed, true)}</b>
                    </span>
                    <ChevronDown className="ex-rep__chev" aria-hidden="true" />
                  </button>

                  {/* Compact journey tracker for scanning (the full tracker opens with the report) */}
                  {!isOpen && (
                    <div className="ex-rep__track">
                      <NeoTracker {...track} compact label={trackLabel} />
                    </div>
                  )}

                  {/* Review / Revision Note Banner */}
                  {rep.reviewNote && (
                    <div className="ex-callout" data-tone={rep.status === 'changes_requested' ? 'warning' : 'slate'}>
                      <div className="ex-callout__row">
                        <FilePen />
                        <span>
                          <b>Reviewer note</b> {rep.reviewNote}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Expanded Line Items, Resubmit Form & Audit Trail */}
                  {isOpen && (
                    <div className="ex-rep__body">
                      <NeoTracker {...track} hud="Reimbursement tracker" label={trackLabel} />

                      <span className="neo-hud">Attached receipts · {items.length}</span>
                      <ul className="ex-lines">
                        {items.map((r) => (
                          <li key={r.id} className="ex-line">
                            <CategoryGlyph category={r.category} size="sm" />
                            <div className="ex-line__text">
                              <div className="ex-line__top">
                                <b>{r.merchant}</b>
                                <span className="ex-gl">{r.glCode}</span>
                                <span className="ex-faint">{CATEGORY_META[r.category].label}</span>
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
                              <span className="ex-line__meta">
                                {formatDay(r.date)}
                                {r.fileName && ` · ${r.fileName}`}
                                {r.notes && ` · ${r.notes}`}
                              </span>
                              {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                            </div>
                            <span className="ex-amt">
                              <b className="neo-mono">{formatAed(r.amountAed, true)}</b>
                              {r.currency !== 'AED' && <span>{formatOrigCurrency(r.originalAmount, r.currency)}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Draft Submit / Changes Requested Resubmit Bar */}
                      {canSubmitNow && (
                        <div className="ex-decide">
                          <input
                            className="input"
                            value={resubmitNotes[rep.id] ?? ''}
                            onChange={(e) =>
                              setResubmitNotes((s) => ({ ...s, [rep.id]: e.target.value }))
                            }
                            placeholder={
                              rep.status === 'changes_requested'
                                ? 'Add a revision note for your manager...'
                                : 'Optional note before submitting...'
                            }
                          />
                          <button
                            type="button"
                            className="neo-btn neo-btn--plasma"
                            onClick={() => {
                              const res = submitDraftReport(rep.id, resubmitNotes[rep.id]);
                              toast.result(res, 'Submitted to manager');
                            }}
                          >
                            <Send /> {rep.status === 'changes_requested' ? 'Resubmit report' : 'Submit to manager'}
                          </button>
                        </div>
                      )}

                      {rep.status === 'reimbursed' && (
                        <div className="ex-paidbar">
                          <span>
                            Settled via <code className="neo-mono">{rep.paymentRef}</code> in payroll period{' '}
                            <code className="neo-mono">{rep.payrollPeriod}</code>
                          </span>
                          <button
                            type="button"
                            className="neo-btn neo-btn--success neo-btn--sm"
                            onClick={() => navigate('/hr/documents?tab=payslips')}
                          >
                            View on HR payslip <ExternalLink />
                          </button>
                        </div>
                      )}

                      {/* Audit Trail History */}
                      <div className="ex-trail">
                        <span className="neo-hud">
                          <History className="ex-inline-icon" /> Four-eyes audit trail
                        </span>
                        <ol className="ex-trail__list">
                          {rep.history.map((step, idx) => {
                            const actor = usersById.get(step.actorId);
                            return (
                              <li key={`${step.at}-${idx}`} className="ex-trail__step">
                                {actor && <Avatar user={actor} size={22} />}
                                <span className="ex-trail__who">{actor?.name ?? step.actorId}</span>
                                <Chip size="sm" className="neo-mono">
                                  {step.action.replace('_', ' ')}
                                </Chip>
                                {step.note && <span className="ex-trail__note truncate">“{step.note}”</span>}
                                <span className="ex-trail__at neo-mono">{formatDateTime(step.at)}</span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </NeoPanel>
    </div>
  );
}
