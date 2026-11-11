/**
 * Helix Procurement — Requisitions & 5-Stage Parallel Approval Constellation (`RequestsView`).
 * Includes New Purchase Request Modal with live peer benchmark & department budget check.
 * Each request detail opens with its live "Purchase tracker" (see ./PurchaseTracker.tsx).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  FileCheck2,
  Plus,
  Radar,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoEmpty,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  NovaChip,
  type NeoTabItem,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import { ProjectSigil } from '@/projects/sigils';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import {
  buildBenchmarkForQuote,
  formatAed,
  formatDualCurrency,
  formatUsd,
} from '@/procurement/engine';
import { CATEGORY_META } from '@/procurement/seed';
import { useProcurement } from '@/procurement/store';
import type { CurrencyCode, ProcurementCategory, RequisitionStatus } from '@/procurement/types';
import { PurchaseTracker } from './PurchaseTracker';

type FilterTab = 'all' | RequisitionStatus;

export function RequestsView() {
  const [sp, setSp] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [query, setQuery] = useState('');

  const users = useHub((s) => s.users);
  const userList = users.length ? users : SEED_USERS;
  const userMap = useMemo(() => new Map(userList.map((u) => [u.id, u])), [userList]);

  const requests = useProcurement((s) => s.requests);
  const advanceApproval = useProcurement((s) => s.advanceApproval);
  const negotiateRequest = useProcurement((s) => s.negotiateRequest);
  const issuePurchaseOrder = useProcurement((s) => s.issuePurchaseOrder);

  const tabItems = useMemo<NeoTabItem<FilterTab>[]>(() => {
    const countBy = (st: RequisitionStatus) => requests.filter((r) => r.status === st).length;
    return [
      { value: 'all', label: 'All Requisitions', count: requests.length },
      { value: 'pending_approval', label: 'Pending Approval', count: countBy('pending_approval') },
      { value: 'negotiating', label: 'Nova Negotiating', count: countBy('negotiating') },
      { value: 'approved', label: 'Approved · Ready for PO', count: countBy('approved') },
      { value: 'po_issued', label: 'PO Issued', count: countBy('po_issued') },
    ];
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, query]);

  const openNewModal = () => {
    const next = new URLSearchParams(sp);
    next.set('new', '1');
    setSp(next, { replace: true });
  };

  return (
    <div className="pr-stack">
      {/* Filter & Search Toolbar */}
      <div className="pr-toolbar">
        <NeoTabs
          value={statusFilter}
          onChange={setStatusFilter}
          items={tabItems}
          label="Filter requisitions by status"
        />
        <div className="pr-toolbar__right">
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Search REQ ID, vendor, department…"
            className="pr-search-box"
          />
          <button
            type="button"
            className="neo-btn neo-btn--plasma"
            data-qa="pr-open-new-request"
            onClick={openNewModal}
          >
            <Plus />
            <span>New Purchase Request</span>
          </button>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <NeoPanel>
          <NeoEmpty
            icon={<Radar />}
            title="No purchase requisitions match this filter"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--soft"
                onClick={() => {
                  setStatusFilter('all');
                  setQuery('');
                }}
              >
                Reset filters
              </button>
            }
          >
            Try clearing your search query or create a new autonomous requisition.
          </NeoEmpty>
        </NeoPanel>
      ) : (
        <div className="pr-constellation-list">
          {filteredRequests.map((req) => {
            const requester = userMap.get(req.requesterId);
            const cat = CATEGORY_META[req.category];
            const dual = formatDualCurrency(req.negotiatedAnnualUsd, req.currency);
            const savings = Math.max(0, req.quotedAnnualUsd - req.negotiatedAnnualUsd);
            const savingsPct =
              req.quotedAnnualUsd > 0
                ? Math.round((savings / req.quotedAnnualUsd) * 100)
                : 0;
            const currentStage = req.stages.find((s) => s.status !== 'approved');

            return (
              <NeoPanel key={req.id} className="pr-constellation-panel neo-spot">
                {/* Header */}
                <div className="pr-constellation-head">
                  <div className="pr-constellation-head__left">
                    <ProjectSigil icon={req.vendorSigil} color={req.vendorColor} size={42} />
                    <div>
                      <div className="pr-eyebrow-row">
                        <span className="pr-mono-id">{req.id}</span>
                        <Chip
                          tone={
                            req.status === 'po_issued'
                              ? 'emerald'
                              : req.status === 'approved'
                                ? 'lime'
                                : req.status === 'negotiating'
                                  ? 'amber'
                                  : 'cyan'
                          }
                          size="sm"
                        >
                          {req.status === 'po_issued'
                            ? `PO Issued (${req.linkedPoId ?? 'PO-2026'})`
                            : req.status === 'approved'
                              ? 'All 5 Gates Approved'
                              : req.status === 'negotiating'
                                ? 'Nova Price Negotiation'
                                : 'In 5-Stage Constellation'}
                        </Chip>
                        <Chip tone="slate" size="sm">
                          {cat.label} · {cat.glCode}
                        </Chip>
                        <Chip
                          tone={req.priority === 'critical' ? 'rose' : 'amber'}
                          size="sm"
                        >
                          {req.priority.toUpperCase()}
                        </Chip>
                      </div>
                      <h2 className="pr-constellation-title">{req.title}</h2>
                      <p className="pr-constellation-just">{req.justification}</p>
                    </div>
                  </div>

                  <div className="pr-constellation-head__right">
                    <div className="pr-hud-label">Negotiated Annual Total</div>
                    <div className="pr-constellation-amount">{dual.primary}</div>
                    <div className="pr-constellation-subamount">
                      {dual.secondary} · {req.quantity} {req.unitLabel} · {req.termMonths}mo
                    </div>
                    {savings > 0 && (
                      <div className="pr-savings-badge">
                        <Sparkles /> Saved {formatUsd(savings)} ({savingsPct}% below quote)
                      </div>
                    )}
                  </div>
                </div>

                {req.duplicateWarning && (
                  <div className="pr-alert-strip">
                    <AlertTriangle />
                    <span>{req.duplicateWarning}</span>
                  </div>
                )}

                {/* Purchase tracker — where the request is, who has it and the live SLA clock */}
                <PurchaseTracker req={req} />

                {/* 5-Stage Parallel Approval Constellation */}
                <div className="pr-constellation-grid" role="list" aria-label="5-stage approval workflow">
                  {req.stages.map((stage, idx) => {
                    const reviewer = userMap.get(stage.reviewerId);
                    const isCurrent = currentStage?.id === stage.id;
                    return (
                      <div
                        key={stage.id}
                        role="listitem"
                        className={`pr-stage-node is-${stage.status} ${isCurrent ? 'is-current' : ''}`}
                      >
                        <div className="pr-stage-node__top">
                          <span className="pr-stage-node__step">STAGE 0{idx + 1}</span>
                          <span className={`pr-stage-node__badge is-${stage.status}`}>
                            {stage.status === 'approved' ? (
                              <>
                                <CheckCircle2 /> Approved
                              </>
                            ) : stage.status === 'pending' ? (
                              <>
                                <Clock /> Active Gate
                              </>
                            ) : (
                              <>Queued · {stage.slaHours}h SLA</>
                            )}
                          </span>
                        </div>

                        <div className="pr-stage-node__title">{stage.label}</div>

                        <div className="pr-stage-node__reviewer">
                          {reviewer && <Avatar user={reviewer} size={26} presence />}
                          <div>
                            <div className="pr-stage-node__rname">
                              {reviewer?.name ?? stage.reviewerId}
                            </div>
                            <div className="pr-stage-node__rtitle">
                              {reviewer?.title ?? 'Approver'}
                            </div>
                          </div>
                        </div>

                        {stage.checks && stage.checks.length > 0 && (
                          <ul className="pr-stage-node__checks">
                            {stage.checks.map((ch) => (
                              <li key={ch}>
                                <ShieldCheck /> {ch}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Benchmark & Action Footer */}
                <div className="pr-constellation-foot">
                  <div className="pr-constellation-bench">
                    <NovaChip>Benchmark</NovaChip>
                    <span>
                      P25: <b>{formatUsd(req.benchmark.p25Usd)}</b> · Median:{' '}
                      <b>{formatUsd(req.benchmark.medianUsd)}</b> · P75:{' '}
                      <b>{formatUsd(req.benchmark.p75Usd)}</b> per {req.benchmark.unitLabel}
                    </span>
                    <span className="pr-faint">
                      ({req.benchmark.recommendation})
                    </span>
                  </div>

                  <div className="pr-row-actions">
                    {requester && (
                      <span className="pr-requester-pill">
                        Requested by <b>{requester.name}</b> ({req.department} · {req.location})
                      </span>
                    )}

                    {req.status !== 'po_issued' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--soft"
                        data-qa={`pr-negotiate-${req.id}`}
                        onClick={() => negotiateRequest(req.id)}
                      >
                        <WandSparkles />
                        <span>Run Nova Price Negotiation</span>
                      </button>
                    )}

                    {currentStage && req.status !== 'po_issued' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--plasma"
                        data-qa={`pr-approve-${req.id}`}
                        onClick={() => advanceApproval(req.id)}
                      >
                        <BadgeCheck />
                        <span>Approve Current Stage ({currentStage.label})</span>
                      </button>
                    )}

                    {!currentStage && req.status !== 'po_issued' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--plasma"
                        data-qa={`pr-issue-po-${req.id}`}
                        onClick={() => issuePurchaseOrder(req.id)}
                      >
                        <FileCheck2 />
                        <span>Issue PO</span>
                      </button>
                    )}
                  </div>
                </div>
              </NeoPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── New Purchase Request Modal ───────────────────────── */

export function NewRequestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const me = useSessionUser();
  const vendors = useProcurement((s) => s.vendors);
  const budgets = useProcurement((s) => s.budgets);
  const createRequest = useProcurement((s) => s.createRequest);

  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? 'v-anthropic');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProcurementCategory>('ai_models');
  const [department, setDepartment] = useState('Engineering');
  const [location, setLocation] = useState('Dubai');
  const [quantity, setQuantity] = useState(30);
  const [unitLabel, setUnitLabel] = useState('seats');
  const [quotedAnnualUsd, setQuotedAnnualUsd] = useState(45_000);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [termMonths, setTermMonths] = useState<12 | 24 | 36>(12);
  const [justification, setJustification] = useState('');

  if (!open) return null;

  const selectedVendor = vendors.find((v) => v.id === vendorId) ?? vendors[0];
  const unitCost = Math.max(10, Math.round(quotedAnnualUsd / Math.max(1, quantity)));
  const liveBenchmark = buildBenchmarkForQuote(
    unitCost,
    unitLabel,
    selectedVendor?.name ?? 'Vendor',
  );
  const targetTotalUsd = Math.round(quotedAnnualUsd * 0.88);
  const deptBudget =
    budgets.find((b) =>
      b.department.toLowerCase().includes(department.toLowerCase().split(' ')[0]),
    ) ?? budgets[0];
  const remainingBudgetUsd = Math.max(
    0,
    deptBudget.annualBudgetUsd - deptBudget.committedUsd,
  );
  const utilizationAfter =
    (deptBudget.committedUsd + targetTotalUsd) / deptBudget.annualBudgetUsd;

  const handleVendorChange = (nextId: string) => {
    setVendorId(nextId);
    const v = vendors.find((x) => x.id === nextId);
    if (v) {
      setCategory(v.category);
      setQuotedAnnualUsd(Math.max(5_000, quantity * v.unitCostPerSeatUsd));
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createRequest({
      title:
        title.trim() ||
        `${selectedVendor.name} · ${quantity} ${unitLabel} (${department})`,
      vendorId: selectedVendor.id,
      category,
      department,
      location,
      quantity,
      unitLabel,
      quotedAnnualUsd,
      currency,
      termMonths,
      justification:
        justification.trim() ||
        `Scoped ${quantity} ${unitLabel} with ${selectedVendor.name} for ${department} (${location}).`,
      requesterId: me?.id ?? 'u-layla',
    });
    onClose();
  };

  return (
    <div
      className="pr-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="New Purchase Request"
    >
      <div className="pr-modal neo-plane">
        <header className="pr-modal__head">
          <div className="pr-modal__title-group">
            <ProjectSigil
              icon={selectedVendor.sigil}
              color={selectedVendor.color}
              size={36}
            />
            <div>
              <div className="neo-hud">Autonomous Source-to-Pay Intake</div>
              <h2 className="pr-modal__title">New Purchase Requisition</h2>
            </div>
          </div>
          <button
            type="button"
            className="neo-iconbtn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X />
          </button>
        </header>

        <form className="pr-modal__body" onSubmit={handleSubmit}>
          <div className="pr-form-grid">
            <label className="pr-field">
              <span>Vendor</span>
              <select
                className="neo-input"
                value={vendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({CATEGORY_META[v.category].shortLabel} · {v.securityScore}% Sec)
                  </option>
                ))}
              </select>
            </label>

            <label className="pr-field">
              <span>Spend Category & GL</span>
              <select
                className="neo-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as ProcurementCategory)}
              >
                {Object.values(CATEGORY_META).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.glCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="pr-field pr-field--full">
              <span>Requisition Title</span>
              <input
                className="neo-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${selectedVendor.name} · ${quantity} ${unitLabel} for ${department}`}
              />
            </label>

            <label className="pr-field">
              <span>Department</span>
              <select
                className="neo-input"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="Engineering">Engineering</option>
                <option value="IT & Security">IT & Security</option>
                <option value="Design">Design & Product</option>
                <option value="Operations">Operations & GCC</option>
              </select>
            </label>

            <label className="pr-field">
              <span>Hub Location</span>
              <select
                className="neo-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="Dubai">Dubai (HQ · UAE)</option>
                <option value="Singapore">Singapore (APAC)</option>
                <option value="London">London (EMEA)</option>
                <option value="Berlin">Berlin (EU)</option>
                <option value="Toronto">Toronto (NA)</option>
              </select>
            </label>

            <label className="pr-field">
              <span>Seats / Quantity</span>
              <input
                className="neo-input"
                type="number"
                min={1}
                max={10000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>

            <label className="pr-field">
              <span>Unit Label</span>
              <input
                className="neo-input"
                type="text"
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                placeholder="seats / nodes / M-tokens"
              />
            </label>

            <label className="pr-field">
              <span>Quoted Annual Amount (USD)</span>
              <input
                className="neo-input"
                type="number"
                min={500}
                step={500}
                value={quotedAnnualUsd}
                onChange={(e) => setQuotedAnnualUsd(Math.max(500, Number(e.target.value) || 500))}
              />
            </label>

            <label className="pr-field">
              <span>Billing Currency & Term</span>
              <div className="pr-inline-inputs">
                <select
                  className="neo-input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                >
                  <option value="USD">USD ($)</option>
                  <option value="AED">AED (Peg 3.6725)</option>
                </select>
                <select
                  className="neo-input"
                  value={termMonths}
                  onChange={(e) => setTermMonths(Number(e.target.value) as 12 | 24 | 36)}
                >
                  <option value={12}>12 Months</option>
                  <option value={24}>24 Months</option>
                  <option value={36}>36 Months</option>
                </select>
              </div>
            </label>

            <label className="pr-field pr-field--full">
              <span>Business Justification & OKR Alignment</span>
              <textarea
                className="neo-input"
                rows={2}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain operational impact, security posture, or headcount growth driver…"
              />
            </label>
          </div>

          {/* Live Nova Price Benchmark & Department Budget Check */}
          <div className="pr-modal-check">
            <div className="pr-modal-check__top">
              <div>
                <div className="neo-hud">Live Nova Benchmark & Budget Gate</div>
                <div className="pr-modal-check__title">
                  Nova Target: <b>{formatUsd(targetTotalUsd)}/yr</b> ({formatAed(targetTotalUsd, true)}) · Saves{' '}
                  <span className="pr-pos">{formatUsd(quotedAnnualUsd - targetTotalUsd)}</span>
                </div>
              </div>
              <Chip tone={utilizationAfter <= 1 ? 'emerald' : 'amber'} size="sm">
                {deptBudget.department}: {formatUsd(remainingBudgetUsd, true)} Remaining Envelope
              </Chip>
            </div>
            <Bar
              value={Math.min(1, utilizationAfter)}
              fill={utilizationAfter <= 0.9 ? '#10b981' : '#fbbf24'}
              height={7}
              label="Department budget utilization"
            />
            <div className="pr-modal-check__sub">
              Peer P25: {formatUsd(liveBenchmark.p25Usd)}/{unitLabel} · Median:{' '}
              {formatUsd(liveBenchmark.medianUsd)}/{unitLabel} · P75:{' '}
              {formatUsd(liveBenchmark.p75Usd)}/{unitLabel}
            </div>
          </div>

          <footer className="pr-modal__foot">
            <button type="button" className="neo-btn neo-btn--soft" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="neo-btn neo-btn--plasma"
              data-qa="pr-submit-new-request"
            >
              <BadgeCheck />
              <span>Submit to 5-Stage Constellation ({formatUsd(targetTotalUsd)})</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
