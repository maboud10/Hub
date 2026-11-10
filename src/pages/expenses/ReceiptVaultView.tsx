import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
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
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { Chip, NeoBanner, NeoBanners, NeoEmpty, NeoPanel, NeoTabs, type NeoTabItem } from '@/components/neo';
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
import { toast } from '@/store/toast';
import { readReceiptDraft, RECEIPT_DRAFT_KEYS } from './nova';
import {
  CategoryGlyph,
  formatAed,
  formatOrigCurrency,
  PolicyWarningChips,
  RECEIPT_FILE_INPUT_ID,
} from './shared';

type VaultFilter = 'all' | 'unsubmitted' | 'attached' | 'warnings';

const CURRENCIES = Object.keys(FX_TO_AED) as CurrencyCode[];
const CATEGORIES = Object.keys(CATEGORY_META) as ExpenseCategory[];

export function ReceiptVaultView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [novaDrafted, setNovaDrafted] = useState(false);
  const [pulse, setPulse] = useState<'drop' | 'form' | null>(null);

  // Vault filter state
  const [filter, setFilter] = useState<VaultFilter>('all');

  // Nova hand-off (?nova=1&merchant=…&amount=…) and header "Scan receipt" (?scan=1)
  const appliedKey = useRef('');
  useEffect(() => {
    const draft = readReceiptDraft(searchParams);
    const scan = searchParams.get('scan') === '1';
    if (!draft && !scan) return;
    const key = searchParams.toString();
    if (appliedKey.current === key) return;
    appliedKey.current = key;

    if (draft) {
      if (draft.merchant) setMerchant(draft.merchant);
      if (draft.category) setCategory(draft.category);
      if (draft.currency) setCurrency(draft.currency);
      if (draft.amount) setOriginalAmount(draft.amount);
      if (draft.date) setDate(draft.date);
      if (draft.notes) setNotes(draft.notes);
      if (draft.attendees) setAttendees(draft.attendees);
      if (draft.payment) setPaymentMethod(draft.payment);
      setVatAed(0);
      setFileName('');
      setNovaDrafted(true);
      setPulse('form');
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    } else {
      setPulse('drop');
      requestAnimationFrame(() => dropRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    const next = new URLSearchParams(searchParams);
    for (const k of RECEIPT_DRAFT_KEYS) next.delete(k);
    next.delete('scan');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse(null), 2400);
    return () => window.clearTimeout(id);
  }, [pulse]);

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
    setNovaDrafted(false);
    setPulse('form');
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
      vatAed: vatAed || undefined,
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
      setNovaDrafted(false);
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

  const filterTabs: NeoTabItem<VaultFilter>[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'unsubmitted', label: 'Unsubmitted', count: counts.unsubmitted },
    { value: 'attached', label: 'On a report', count: counts.attached },
    { value: 'warnings', label: 'Policy notes', count: counts.warnings },
  ];

  return (
    <div className="neo-stack">
      {/* Top Action Banner when unbundled receipts exist */}
      {summary.unbundledReceipts.length > 0 && (
        <NeoBanners>
          <NeoBanner
            tone="teal"
            icon={<FileSpreadsheet />}
            title={`${summary.unbundledReceipts.length} receipt${summary.unbundledReceipts.length === 1 ? '' : 's'} ready to bundle`}
            meta={`${formatAed(summary.unsubmittedVaultAed, true)} out of pocket`}
            to="/expenses/reports?new=1"
          >
            Bundle them into an expense report to start reimbursement.
          </NeoBanner>
        </NeoBanners>
      )}

      {/* Scanner + OCR Extraction Studio */}
      <div className="ex-two-col">
        {/* Left: AI Smart Receipt Dropzone + 1-Click Samples + Per Diem Generator */}
        <NeoPanel hud="Smart OCR" title="Scan a receipt" icon={<ScanLine />}>
          <input
            id={RECEIPT_FILE_INPUT_ID}
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) applyScannedFile(f.name);
              e.target.value = '';
            }}
          />

          <div
            ref={dropRef}
            role="button"
            tabIndex={0}
            className={cx('ex-drop', dragging && 'is-dragging', pulse === 'drop' && 'is-pulse')}
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
            <span className="ex-drop__icon" aria-hidden="true">
              <FileUp />
            </span>
            <b className="ex-drop__title">
              Drop a receipt PDF or photo, or <span className="neo-tint">browse</span>
            </b>
            <span className="ex-drop__sub">AED, GBP, EUR, USD, SGD, SAR & JPY · 96–98% OCR confidence</span>
            {fileName && (
              <Chip tone="success" size="sm" icon={<CheckCircle2 />}>
                Scanned {fileName} · {ocrConfidence}% OCR
              </Chip>
            )}
          </div>

          {/* 1-Click Sample Smart Receipts Strip */}
          <div className="ex-subhead">
            <span className="neo-hud">
              <Sparkles className="ex-inline-icon" /> Try a sample receipt
            </span>
            <span className="ex-faint">Scans & saves instantly</span>
          </div>
          <div className="ex-samples">
            {SAMPLE_SMART_RECEIPTS.map((s) => {
              const conv = convertToAed(s.amount, s.currency);
              return (
                <button
                  key={s.id}
                  type="button"
                  className="ex-sample"
                  onClick={() => handleQuickSampleScan(s)}
                >
                  <CategoryGlyph category={s.category} size="sm" />
                  <span className="ex-sample__text">
                    <b>{s.label}</b>
                    <span>
                      {formatOrigCurrency(s.amount, s.currency)} ≈ {formatAed(conv.amountAed)}
                    </span>
                  </span>
                  <span className="ex-gl">{CATEGORY_META[s.category].glCode}</span>
                </button>
              );
            })}
          </div>

          {/* 1-Click Trip Per-Diem Generator */}
          {eligibleTrips.length > 0 && (
            <div className="ex-perdiem">
              <div>
                <b>Trip per diem in one click</b>
                <span>Days × city rate, 100% policy-compliant — no receipt needed.</span>
              </div>
              <div className="ex-chips">
                {eligibleTrips.map((t) => {
                  const alreadyHas = summary.myReceipts.some(
                    (r) => r.tripId === t.id && r.category === 'per_diem',
                  );
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cx('neo-btn neo-btn--sm', alreadyHas ? 'neo-btn--ghost' : 'neo-btn--soft')}
                      disabled={alreadyHas}
                      onClick={() => {
                        const res = generateTripPerDiemReceipt(t.id);
                        toast.result(res, 'Trip per diem added');
                      }}
                    >
                      {alreadyHas ? <CheckCircle2 /> : <Sparkles />}
                      {t.destinationCity} · {t.days}d · {formatAed(t.days * t.perDiemRateAed)}
                      {alreadyHas ? ' · in vault' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </NeoPanel>

        {/* Right: Editable OCR Receipt Form */}
        <section ref={formRef} className={cx('neo-panel ex-form-panel', pulse === 'form' && 'is-pulse')} aria-label="Receipt details">
          <header className="neo-panel__head">
            <span className="neo-panel__icon">
              <Receipt />
            </span>
            <div className="neo-panel__titles">
              <div className="neo-hud">{novaDrafted ? 'Drafted by Nova' : fileName ? 'OCR extract' : 'Manual entry'}</div>
              <h2 className="neo-panel__title">Receipt details</h2>
            </div>
            <div className="neo-panel__actions">
              {fileName ? (
                <Chip tone="success" size="sm">
                  OCR {ocrConfidence}%
                </Chip>
              ) : novaDrafted ? (
                <Chip tone="violet" size="sm" icon={<Sparkles />}>
                  Nova
                </Chip>
              ) : (
                <Chip size="sm">Draft</Chip>
              )}
            </div>
          </header>

          <div className="stack">
            {novaDrafted && (
              <div className="ex-callout" data-tone="app">
                <div className="ex-callout__row">
                  <Sparkles />
                  <span>Nova filled this in from your note — check the details, attach the file if you have it, then save.</span>
                </div>
              </div>
            )}

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
                <span className="field-label">Category & GL code</span>
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
                <span className="field-label">Amount & currency</span>
                <div className="row" style={{ gap: 8 }}>
                  <select
                    className="select mono"
                    style={{ width: 96, flex: 'none' }}
                    value={currency}
                    aria-label="Currency"
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
                <span className="field-label">Receipt date</span>
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
                <span className="field-label">Payment method</span>
                <select
                  className="select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="personal_reimbursable">Personal (out-of-pocket, reimbursable)</option>
                  <option value="corporate_card">Helix virtual corporate card</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Link to trip (optional)</span>
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
                <span className="field-label">Attendees (meals / client)</span>
                <input
                  className="input"
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                  placeholder="Optional guest names"
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Notes / business context</span>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Airport express rail transfer to customer workshop"
              />
            </label>

            {/* Live FX Conversion Box */}
            <div className="ex-split">
              <div className="ex-split__row">
                <span>FX rate ({currency} → AED)</span>
                <b>
                  1 {currency} = {liveConversion.fxRate} AED
                </b>
              </div>
              <div className="ex-split__row ex-split__row--net">
                <span>Converted vault amount</span>
                <b>{formatAed(liveConversion.amountAed, true)}</b>
              </div>
            </div>

            {liveWarnings.length > 0 && (
              <div className="ex-callout" data-tone="warning">
                {liveWarnings.map((w, i) => (
                  <div key={i} className="ex-callout__row">
                    <TriangleAlert />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--block"
              onClick={handleSaveDraftReceipt}
            >
              <Plus /> Save receipt to vault
            </button>
          </div>
        </section>
      </div>

      {/* Vault List Section */}
      <NeoPanel
        hud="Vault"
        title="My receipts"
        actions={
          <Link to="/expenses/reports?new=1" className="neo-btn neo-btn--ghost neo-btn--xs">
            Bundle into report <ArrowRight />
          </Link>
        }
      >
        <div className="ex-toolbar ex-toolbar--inset">
          <NeoTabs value={filter} onChange={setFilter} items={filterTabs} label="Receipt vault filters" />
        </div>

        {filteredReceipts.length === 0 ? (
          <NeoEmpty compact icon={<Receipt />} title="No receipts match this filter">
            Drop a receipt above, try a sample, or describe a spend to Nova on the Flow home.
          </NeoEmpty>
        ) : (
          <ul className="ex-rcpts">
            {filteredReceipts.map((r) => {
              const catMeta = CATEGORY_META[r.category];
              const linkedReport = r.reportId ? reportsById.get(r.reportId) : undefined;
              const linkedTrip = r.tripId ? tripsById.get(r.tripId) : undefined;
              const canRemove =
                !r.reportId ||
                linkedReport?.status === 'draft' ||
                linkedReport?.status === 'changes_requested';

              return (
                <li key={r.id} className="ex-rcpt">
                  <CategoryGlyph category={r.category} />
                  {/* Merchant, Category, Notes & Warnings */}
                  <div className="ex-rcpt__main">
                    <div className="ex-rcpt__top">
                      <b>{r.merchant}</b>
                      <span className="ex-gl">{catMeta.glCode}</span>
                    </div>
                    <div className="ex-rcpt__meta">
                      {formatDay(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {catMeta.label}
                      {r.fileName && ` · ${r.fileName} (${r.ocrConfidence}% OCR)`}
                      {linkedTrip && ` · Trip: ${linkedTrip.destinationCity}`}
                      {r.notes && ` · ${r.notes}`}
                    </div>
                    {r.warnings.length > 0 && <PolicyWarningChips warnings={r.warnings} />}
                  </div>

                  {/* Payment Method & Report Attachment Status */}
                  <div className="ex-chips ex-rcpt__tags">
                    {r.paymentMethod === 'corporate_card' ? (
                      <Chip size="sm" tone="cyan" icon={<CreditCard />}>
                        Virtual card
                      </Chip>
                    ) : (
                      <Chip size="sm" tone="success" icon={<Wallet />}>
                        Reimbursable
                      </Chip>
                    )}
                    {linkedReport ? (
                      <Chip size="sm" className="neo-mono">
                        {linkedReport.reference}
                      </Chip>
                    ) : (
                      <Chip size="sm" tone="warning">
                        Unsubmitted
                      </Chip>
                    )}
                  </div>

                  {/* Currency + AED Amount */}
                  <div className="ex-amt">
                    <b className="neo-num">{formatAed(r.amountAed, true)}</b>
                    <span>
                      {r.currency !== 'AED'
                        ? `${formatOrigCurrency(r.originalAmount, r.currency)} @ ${r.fxRateToAed}`
                        : r.vatAed > 0
                          ? `Incl. VAT ${formatAed(r.vatAed, true)}`
                          : 'Zero-rated VAT'}
                    </span>
                  </div>

                  {/* Delete Action */}
                  <div className="ex-rcpt__del">
                    {canRemove && (
                      <button
                        type="button"
                        className="neo-iconbtn"
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
                </li>
              );
            })}
          </ul>
        )}
      </NeoPanel>
    </div>
  );
}
