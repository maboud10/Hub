import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  FileUp,
  Plus,
  Receipt,
  ScanLine,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatDay, todayISO } from '@/hr/calendar';
import {
  CATEGORY_META,
  convertToAed,
  evaluateReceiptWarnings,
  FX_TO_AED,
  SAMPLE_SMART_RECEIPTS,
  scanReceiptFile,
} from '@/expenses/constants';
import { useExpenses } from '@/expenses/store';
import { useMySpendSummary } from '@/expenses/selectors';
import type {
  CurrencyCode,
  ExpenseCategory,
  PaymentMethod,
} from '@/expenses/types';
import { EmptyState } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import {
  formatAed,
  formatOrigCurrency,
  PolicyWarningChips,
} from './shared';

type VaultFilter = 'all' | 'unsubmitted' | 'attached' | 'warnings';

const CURRENCIES = Object.keys(FX_TO_AED) as CurrencyCode[];
const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];

export function ReceiptVaultView() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const summary = useMySpendSummary();
  const reports = useExpenses((s) => s.reports);
  const uploadReceipt = useExpenses((s) => s.uploadReceipt);
  const generateTripPerDiemReceipt = useExpenses((s) => s.generateTripPerDiemReceipt);
  const deleteReceipt = useExpenses((s) => s.deleteReceipt);

  // Eligible trips for linking receipts & 1-click per-diem generation
  const eligibleTrips = useMemo(
    () =>
      summary.myTrips.filter(
        (t) => t.status === 'approved' || t.status === 'booked' || t.status === 'completed',
      ),
    [summary.myTrips],
  );

  // ── Smart OCR Scanner / Manual Entry Draft State ──
  const [dragging, setDragging] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('meals');
  const [currency, setCurrency] = useState<CurrencyCode>('AED');
  const [originalAmount, setOriginalAmount] = useState<number>(0);
  const [vatAed, setVatAed] = useState<number>(0);
  const [date, setDate] = useState(() => todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('personal_reimbursable');
  const [tripId, setTripId] = useState<string>(() => eligibleTrips[0]?.id ?? '');
  const [fileName, setFileName] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<number>(97);
  const [notes, setNotes] = useState('');
  const [attendees, setAttendees] = useState('');

  // Vault filter state
  const [filter, setFilter] = useState<VaultFilter>('all');

  const liveConversion = useMemo(
    () => convertToAed(originalAmount || 0, currency),
    [originalAmount, currency],
  );

  const liveWarnings = useMemo(() => {
    if (!merchant.trim() && !(originalAmount > 0)) return [];
    return evaluateReceiptWarnings({
      category,
      amountAed: liveConversion.amountAed,
      hasFile: Boolean(fileName.trim()) || category === 'per_diem',
      existingReceipts: summary.myReceipts,
      merchant: merchant || 'Merchant',
      date,
    });
  }, [category, liveConversion.amountAed, fileName, summary.myReceipts, merchant, date]);

  const applyScannedFile = (name: string) => {
    const draft = scanReceiptFile(name, todayISO());
    setFileName(name);
    setMerchant(draft.merchant);
    setCategory(draft.category);
    setCurrency(draft.currency);
    setOriginalAmount(draft.originalAmount);
    setDate(draft.date);
    setVatAed(draft.vatAed);
    setOcrConfidence(draft.confidence);
    setNotes(draft.notes);
    toast.info(
      `AI OCR extracted ${draft.merchant} (${draft.confidence}% confidence)`,
      `${formatOrigCurrency(draft.originalAmount, draft.currency)} → ${formatAed(convertToAed(draft.originalAmount, draft.currency).amountAed, true)}`,
    );
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyScannedFile(f.name);
  };

  const handleQuickSampleScan = (sample: (typeof SAMPLE_SMART_RECEIPTS)[number]) => {
    const conv = convertToAed(sample.amount, sample.currency);
    const estVat =
      sample.category === 'flights'
        ? 0
        : Math.round(conv.amountAed * (sample.currency === 'AED' ? 0.05 : 0.08) * 100) / 100;
    const confidence = sample.category === 'flights' ? 98 : sample.category === 'lodging' ? 97 : 96;
    const defaultTrip = eligibleTrips.find((t) => !t.linkedReportId) ?? eligibleTrips[0];
    const useCorpCard = Boolean(sample.category === 'flights' && defaultTrip?.virtualCard);

    const res = uploadReceipt({
      tripId: defaultTrip?.id,
      merchant: sample.merchant,
      category: sample.category,
      date: todayISO(),
      currency: sample.currency,
      originalAmount: sample.amount,
      vatAed: estVat,
      paymentMethod: useCorpCard ? 'corporate_card' : 'personal_reimbursable',
      fileName: sample.fileName,
      ocrConfidence: confidence,
      notes: sample.notes,
      attendees: sample.category === 'client' ? 'Enterprise Architecture Team (4 attendees)' : undefined,
    });
    toast.result(res, `Scanned ${sample.merchant} (${confidence}% OCR)`);
  };

  const handleSaveDraftReceipt = () => {
    const res = uploadReceipt({
      tripId: tripId || undefined,
      merchant,
      category,
      date,
      currency,
      originalAmount,
      vatAed,
      paymentMethod,
      fileName: fileName || undefined,
      ocrConfidence,
      notes: notes || undefined,
      attendees: attendees || undefined,
    });
    if (toast.result(res, 'Receipt saved to vault')) {
      setMerchant('');
      setOriginalAmount(0);
      setVatAed(0);
      setFileName('');
      setNotes('');
      setAttendees('');
    }
  };

  const reportsById = useMemo(() => new Map(reports.map((r) => [r.id, r])), [reports]);
  const tripsById = useMemo(() => new Map(summary.myTrips.map((t) => [t.id, t])), [summary.myTrips]);

  const counts = useMemo(() => {
    const all = summary.myReceipts.length;
    const unsubmitted = summary.myReceipts.filter((r) => !r.reportId).length;
    const attached = summary.myReceipts.filter((r) => Boolean(r.reportId)).length;
    const warnings = summary.myReceipts.filter((r) => r.warnings.length > 0).length;
    return { all, unsubmitted, attached, warnings };
  }, [summary.myReceipts]);

  const filteredReceipts = useMemo(() => {
    switch (filter) {
      case 'unsubmitted':
        return summary.myReceipts.filter((r) => !r.reportId);
      case 'attached':
        return summary.myReceipts.filter((r) => Boolean(r.reportId));
      case 'warnings':
        return summary.myReceipts.filter((r) => r.warnings.length > 0);
      default:
        return summary.myReceipts;
    }
  }, [summary.myReceipts, filter]);

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Top Action Banner when unbundled receipts exist */}
      {summary.unbundledReceipts.length > 0 && (
        <div
          className="card row row--between row--wrap"
          style={{
            padding: '14px 18px',
            borderColor: 'rgb(var(--ex-1-rgb) / 0.38)',
            background: 'rgb(var(--ex-1-rgb) / 0.08)',
          }}
        >
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <FileSpreadsheet style={{ width: 20, height: 20, color: 'var(--ex-ink)', flex: 'none' }} />
            <div style={{ minWidth: 0 }}>
              <div className="text-sm" style={{ fontWeight: 650 }}>
                {summary.unbundledReceipts.length} unbundled receipt{summary.unbundledReceipts.length === 1 ? '' : 's'} ready in your vault
              </div>
              <div className="text-xs muted">
                Out-of-pocket reimbursable: <b className="mono">{formatAed(summary.unsubmittedVaultAed, true)}</b>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn ex-btn-teal"
            onClick={() => navigate('/expenses/reports?new=1')}
          >
            Bundle into Expense Report →
          </button>
        </div>
      )}

      {/* Scanner + OCR Extraction Studio */}
      <div className="ex-two-col">
        {/* Left: AI Smart Receipt Dropzone + 1-Click Samples + Per Diem Generator */}
        <section className="card stack" style={{ minWidth: 0 }}>
          <div className="row row--between row--wrap">
            <div>
              <h2 className="section-title" style={{ fontSize: 16 }}>
                <ScanLine style={{ width: 18, height: 18, color: 'var(--ex-ink)' }} />
                AI Smart Receipt OCR Scanner
              </h2>
              <p className="text-xs muted" style={{ marginTop: 2 }}>
                Drop a PDF/photo or click a sample folio below to extract merchant, FX rate, GL code &amp; VAT automatically.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) applyScannedFile(f.name);
              e.target.value = '';
            }}
          />

          <div
            role="button"
            tabIndex={0}
            className={cx('ex-dropzone', dragging && 'is-dragging')}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleFileDrop}
          >
            <FileUp style={{ width: 28, height: 28, color: 'var(--ex-ink)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 650, fontSize: 14.5 }}>
              Drop receipt PDF / photo here, or <span style={{ color: 'var(--ex-ink)', textDecoration: 'underline' }}>browse file</span>
            </div>
            <div className="text-xs muted" style={{ marginTop: 4 }}>
              Supports multi-currency invoices (AED, GBP, EUR, USD, SGD, SAR, JPY) with 96%–98% OCR confidence
            </div>
            {fileName && (
              <div style={{ marginTop: 10 }}>
                <span className="badge badge--success mono">
                  <CheckCircle2 /> Scanned: {fileName} ({ocrConfidence}% OCR)
                </span>
              </div>
            )}
          </div>

          {/* 1-Click Sample Smart Receipts Strip */}
          <div>
            <div className="row row--between" style={{ marginBottom: 4 }}>
              <span className="field-label">
                <Sparkles style={{ width: 13, height: 13, display: 'inline', marginRight: 5, color: 'var(--ex-ink)' }} />
                1-Click Sample Multi-Currency Smart Receipts
              </span>
              <span className="text-xs muted">Instant scan &amp; save</span>
            </div>
            <div className="ex-sample-strip">
              {SAMPLE_SMART_RECEIPTS.map((s) => {
                const conv = convertToAed(s.amount, s.currency);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="ex-sample-card"
                    onClick={() => handleQuickSampleScan(s)}
                  >
                    <div className="row row--between" style={{ width: '100%' }}>
                      <span className="ex-gl-badge">{CATEGORY_META[s.category].glCode}</span>
                      <span className="mono text-xs" style={{ color: 'var(--ex-ink)', fontWeight: 650 }}>
                        {formatOrigCurrency(s.amount, s.currency)}
                      </span>
                    </div>
                    <div className="text-sm" style={{ fontWeight: 650, marginTop: 2 }}>
                      {s.label}
                    </div>
                    <div className="text-xs muted">
                      ≈ {formatAed(conv.amountAed, true)} · Click to scan
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1-Click Trip Per-Diem Generator */}
          {eligibleTrips.length > 0 && (
            <div className="ex-split-panel">
              <div className="row row--between row--wrap" style={{ gap: 8 }}>
                <div>
                  <div className="text-sm" style={{ fontWeight: 650 }}>
                    1-Click Statutory Trip Per-Diem Generator
                  </div>
                  <div className="text-xs muted">
                    Auto-calculates daily allowance (`days × city rate`) with 100% policy compliance.
                  </div>
                </div>
              </div>
              <div className="row row--wrap" style={{ gap: 8 }}>
                {eligibleTrips.map((t) => {
                  const alreadyHas = summary.myReceipts.some(
                    (r) => r.tripId === t.id && r.category === 'per_diem',
                  );
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cx('btn btn--sm', !alreadyHas && 'ex-btn-teal')}
                      disabled={alreadyHas}
                      onClick={() => {
                        const res = generateTripPerDiemReceipt(t.id);
                        toast.result(res, 'Trip per diem added');
                      }}
                    >
                      <Sparkles />
                      {t.destinationCity} ({t.days}d · {formatAed(t.days * t.perDiemRateAed)})
                      {alreadyHas ? ' ✓ In Vault' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right: Editable OCR Receipt Form */}
        <section className="card stack" style={{ minWidth: 0 }}>
          <div className="row row--between">
            <h2 className="section-title" style={{ fontSize: 16 }}>
              Receipt Details &amp; FX Preview
            </h2>
            {fileName ? (
              <span className="badge badge--success mono">OCR {ocrConfidence}%</span>
            ) : (
              <span className="badge badge--muted">Manual / OCR Draft</span>
            )}
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Merchant</span>
              <input
                className="input"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. CitizenM London, Uber, Emirates"
              />
            </label>
            <label className="field">
              <span className="field-label">Category &amp; GL Code</span>
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label} ({CATEGORY_META[c].glCode})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Original Amount &amp; Currency</span>
              <div className="row" style={{ gap: 8 }}>
                <select
                  className="select mono"
                  style={{ width: 104, flex: 'none' }}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                >
                  {CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input mono"
                  value={originalAmount || ''}
                  onChange={(e) => setOriginalAmount(Number(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Receipt Date</span>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Payment Method</span>
              <select
                className="select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value="personal_reimbursable">Personal (Out-of-Pocket Reimbursable)</option>
                <option value="corporate_card">Helix Virtual Corporate Card</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Link to Trip (Optional)</span>
              <select
                className="select"
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
              >
                <option value="">Standalone local spend</option>
                {summary.myTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.destinationCity} · {t.reference}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Extracted VAT (AED)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input mono"
                value={vatAed || ''}
                onChange={(e) => setVatAed(Number(e.target.value) || 0)}
                placeholder="Auto (5% UAE if AED)"
              />
            </label>
            <label className="field">
              <span className="field-label">Attendees (Meals / Client)</span>
              <input
                className="input"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="Optional guest names"
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Notes / Business Context</span>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Airport express rail transfer to customer workshop"
            />
          </label>

          {/* Live FX Conversion Box */}
          <div className="ex-split-panel">
            <div className="ex-split-row">
              <span>FX Rate ({currency} → AED)</span>
              <b>1 {currency} = {liveConversion.fxRate} AED</b>
            </div>
            <div className="ex-split-row ex-split-row--net">
              <span>Converted Vault Amount</span>
              <b>{formatAed(liveConversion.amountAed, true)}</b>
            </div>
          </div>

          {liveWarnings.length > 0 && (
            <div className="ex-policy-box">
              {liveWarnings.map((w, i) => (
                <div key={i} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: 'var(--warning)', flex: 'none', marginTop: 2 }} />
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn ex-btn-teal"
            onClick={handleSaveDraftReceipt}
          >
            <Plus /> Save Receipt to Vault
          </button>
        </section>
      </div>

      {/* Vault List Section */}
      <section className="stack" style={{ minWidth: 0 }}>
        <div className="row row--between row--wrap" style={{ gap: 12 }}>
          <div className="chips" role="tablist" aria-label="Receipt vault filters">
            <button
              type="button"
              className={cx('chip', filter === 'all' && 'is-active')}
              onClick={() => setFilter('all')}
            >
              All <span className="count">{counts.all}</span>
            </button>
            <button
              type="button"
              className={cx('chip', filter === 'unsubmitted' && 'is-active')}
              onClick={() => setFilter('unsubmitted')}
            >
              Unsubmitted <span className="count">{counts.unsubmitted}</span>
            </button>
            <button
              type="button"
              className={cx('chip', filter === 'attached' && 'is-active')}
              onClick={() => setFilter('attached')}
            >
              Attached to report <span className="count">{counts.attached}</span>
            </button>
            <button
              type="button"
              className={cx('chip', filter === 'warnings' && 'is-active')}
              onClick={() => setFilter('warnings')}
            >
              Policy warnings <span className="count">{counts.warnings}</span>
            </button>
          </div>

          <button
            type="button"
            className="btn btn--sm ex-btn-teal"
            onClick={() => navigate('/expenses/reports?new=1')}
          >
            Bundle into Expense Report <ArrowRight />
          </button>
        </div>

        {filteredReceipts.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title="No receipts match this filter"
          >
            Drop a receipt image above or click one of the 1-Click Sample Smart Receipts to test multi-currency OCR extraction.
          </EmptyState>
        ) : (
          <div className="ex-receipt-list">
            {filteredReceipts.map((r) => {
              const catMeta = CATEGORY_META[r.category];
              const linkedReport = r.reportId ? reportsById.get(r.reportId) : undefined;
              const linkedTrip = r.tripId ? tripsById.get(r.tripId) : undefined;
              const canRemove =
                !r.reportId ||
                linkedReport?.status === 'draft' ||
                linkedReport?.status === 'changes_requested';

              return (
                <article key={r.id} className="ex-receipt-row">
                  {/* Column 1: Merchant, Category, Notes & Warnings */}
                  <div className="stack stack--sm" style={{ minWidth: 0 }}>
                    <div className="row row--wrap" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 650, fontSize: 14.5 }}>{r.merchant}</span>
                      <span className="ex-gl-badge">{catMeta.glCode}</span>
                      <span className="badge badge--muted">{catMeta.label}</span>
                    </div>
                    <div className="text-xs muted">
                      {formatDay(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {r.fileName && ` · ${r.fileName} (${r.ocrConfidence}% OCR)`}
                      {linkedTrip && ` · Trip: ${linkedTrip.destinationCity}`}
                      {r.notes && ` · ${r.notes}`}
                    </div>
                    {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                  </div>

                  {/* Column 2: Payment Method & Report Attachment Status */}
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    {r.paymentMethod === 'corporate_card' ? (
                      <span className="badge badge--info">
                        <CreditCard /> Virtual Card
                      </span>
                    ) : (
                      <span className="badge badge--success">
                        <Wallet /> Personal (Reimbursable)
                      </span>
                    )}

                    {linkedReport ? (
                      <span className="badge badge--muted mono">{linkedReport.reference}</span>
                    ) : (
                      <span className="badge badge--warning">Unsubmitted</span>
                    )}
                  </div>

                  {/* Column 3: Currency + AED Amount */}
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
                      {formatAed(r.amountAed, true)}
                    </div>
                    <div className="text-xs mono muted">
                      {r.currency !== 'AED'
                        ? `${formatOrigCurrency(r.originalAmount, r.currency)} @ ${r.fxRateToAed}`
                        : r.vatAed > 0
                          ? `Incl. VAT ${formatAed(r.vatAed, true)}`
                          : 'Zero-rated VAT'}
                    </div>
                  </div>

                  {/* Column 4: Delete Action */}
                  <div>
                    {canRemove && (
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        title="Delete unsubmitted receipt"
                        aria-label={`Delete receipt ${r.merchant}`}
                        onClick={() => {
                          const res = deleteReceipt(r.id);
                          toast.result(res, 'Receipt deleted');
                        }}
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
