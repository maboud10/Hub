/**
 * Helix Procurement — Purchase Orders & 3-Way Match Engine (`OrdersView`).
 * Features Department Budget vs Committed vs Actual Spend telemetry bars,
 * issued Purchase Orders (`PO-2026-401`, etc.), automated 3-Way Match
 * (`PO Amount ↔ Goods/License Receipt ↔ Vendor Invoice`), variance flags,
 * and 1-click "Verify 3-Way Match & Queue to Ledger".
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  Landmark,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  Chip,
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
import { formatAed, formatUsd } from '@/procurement/engine';
import { useProcurement } from '@/procurement/store';
import type { ThreeWayMatchStatus } from '@/procurement/types';

type MatchFilter = 'all' | ThreeWayMatchStatus;

export function OrdersView() {
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [query, setQuery] = useState('');

  const users = useHub((s) => s.users);
  const userList = users.length ? users : SEED_USERS;
  const userMap = useMemo(() => new Map(userList.map((u) => [u.id, u])), [userList]);

  const purchaseOrders = useProcurement((s) => s.purchaseOrders);
  const budgets = useProcurement((s) => s.budgets);
  const verifyThreeWayMatch = useProcurement((s) => s.verifyThreeWayMatch);

  const tabItems = useMemo<NeoTabItem<MatchFilter>[]>(() => {
    const countBy = (st: ThreeWayMatchStatus) =>
      purchaseOrders.filter((p) => p.matchStatus === st).length;
    return [
      { value: 'all', label: 'All Purchase Orders', count: purchaseOrders.length },
      {
        value: 'variance_flagged',
        label: 'Variance Flagged',
        count: countBy('variance_flagged'),
      },
      {
        value: 'matched',
        label: '3-Way Matched · Ready',
        count: countBy('matched'),
      },
      {
        value: 'verified_queued',
        label: 'Queued to Ledger',
        count: countBy('verified_queued'),
      },
    ];
  }, [purchaseOrders]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (matchFilter !== 'all' && po.matchStatus !== matchFilter) return false;
      if (!q) return true;
      return (
        po.id.toLowerCase().includes(q) ||
        po.vendorName.toLowerCase().includes(q) ||
        po.title.toLowerCase().includes(q) ||
        po.invoiceNumber.toLowerCase().includes(q) ||
        po.department.toLowerCase().includes(q)
      );
    });
  }, [purchaseOrders, matchFilter, query]);

  const totalVarianceHeld = useMemo(
    () =>
      purchaseOrders
        .filter((p) => p.matchStatus === 'variance_flagged')
        .reduce((acc, p) => acc + p.varianceUsd, 0),
    [purchaseOrders],
  );

  return (
    <div className="pr-stack">
      {/* Department Budget vs Committed vs Actual Spend Telemetry */}
      <NeoPanel
        hud="Department Envelopes & FinOps Controls"
        title="Department Budget vs Committed vs Actual Spend Telemetry"
        icon={<Wallet />}
        actions={
          <NovaChip>
            Total Envelope: {formatUsd(budgets.reduce((a, b) => a + b.annualBudgetUsd, 0), true)}
          </NovaChip>
        }
      >
        <div className="pr-budget-grid">
          {budgets.map((b) => {
            const owner = userMap.get(b.ownerId);
            const committedRatio = b.committedUsd / b.annualBudgetUsd;
            const actualRatio = b.actualSpentUsd / b.annualBudgetUsd;
            const remaining = Math.max(0, b.annualBudgetUsd - b.committedUsd);

            return (
              <div key={b.department} className="pr-budget-card neo-spot">
                <div className="pr-budget-card__head">
                  <div>
                    <h3 className="pr-budget-card__dept">{b.department}</h3>
                    <div className="pr-budget-card__owner">
                      {owner && <Avatar user={owner} size={18} />}
                      <span>{owner?.name ?? b.ownerId}</span>
                    </div>
                  </div>
                  <Chip tone="emerald" size="sm">
                    {formatUsd(remaining, true)} Avail
                  </Chip>
                </div>

                <div className="pr-budget-bars">
                  <div className="pr-budget-bar-row">
                    <span>
                      Committed ({Math.round(committedRatio * 100)}%)
                    </span>
                    <strong>
                      {formatUsd(b.committedUsd, true)} / {formatUsd(b.annualBudgetUsd, true)}
                    </strong>
                  </div>
                  <Bar
                    value={committedRatio}
                    fill="#fbbf24"
                    height={7}
                    label={`${b.department} committed spend`}
                  />

                  <div className="pr-budget-bar-row">
                    <span>
                      Actual Settled ({Math.round(actualRatio * 100)}%)
                    </span>
                    <strong>{formatUsd(b.actualSpentUsd, true)}</strong>
                  </div>
                  <Bar
                    value={actualRatio}
                    fill="#10b981"
                    height={6}
                    label={`${b.department} actual settled spend`}
                  />
                </div>

                <div className="pr-budget-card__foot">
                  <span>Nova Negotiated Savings</span>
                  <b className="pr-pos">+{formatUsd(b.savingsLockedUsd, true)}</b>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Toolbar */}
      <div className="pr-toolbar">
        <NeoTabs
          value={matchFilter}
          onChange={setMatchFilter}
          items={tabItems}
          label="Filter purchase orders by 3-way match status"
        />
        <div className="pr-toolbar__right">
          {totalVarianceHeld > 0 && (
            <Chip tone="rose" size="sm">
              {formatUsd(totalVarianceHeld)} Invoice Overage Held
            </Chip>
          )}
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Search PO #, invoice #, vendor…"
            className="pr-search-box"
          />
        </div>
      </div>

      {/* Purchase Orders & 3-Way Match Cards */}
      <div className="pr-constellation-list">
        {filteredOrders.map((po) => {
          const owner = userMap.get(po.ownerId);
          const hasVariance = po.varianceUsd > 0 && po.matchStatus === 'variance_flagged';

          return (
            <NeoPanel key={po.id} className="pr-po-panel neo-spot">
              <div className="pr-constellation-head">
                <div className="pr-constellation-head__left">
                  <ProjectSigil icon={po.vendorSigil} color={po.vendorColor} size={42} />
                  <div>
                    <div className="pr-eyebrow-row">
                      <span className="pr-mono-id">{po.id}</span>
                      <Chip
                        tone={
                          po.matchStatus === 'verified_queued'
                            ? 'emerald'
                            : po.matchStatus === 'variance_flagged'
                              ? 'rose'
                              : 'cyan'
                        }
                        size="sm"
                      >
                        {po.matchStatus === 'verified_queued'
                          ? '3-Way Verified · Queued to Ledger'
                          : po.matchStatus === 'variance_flagged'
                            ? `Variance Flagged (+${formatUsd(po.varianceUsd)})`
                            : '3-Way Matched · Ready'}
                      </Chip>
                      <span className="pr-mono-tag">{po.glCode}</span>
                      <Chip tone="slate" size="sm">
                        {po.paymentTerms}
                      </Chip>
                    </div>
                    <h2 className="pr-constellation-title">
                      {po.vendorName} — {po.title}
                    </h2>
                    <div className="pr-contract-dates">
                      Issued {po.issuedAt} · Req: <b>{po.requestId}</b> · Dept:{' '}
                      <b>{po.department}</b> · Owner:{' '}
                      {owner && <Avatar user={owner} size={18} />}{' '}
                      <b>{owner?.name ?? po.ownerId}</b>
                    </div>
                  </div>
                </div>

                <div className="pr-constellation-head__right">
                  <div className="pr-hud-label">Authorized PO Ceiling</div>
                  <div className="pr-constellation-amount">{formatUsd(po.poAmountUsd)}</div>
                  <div className="pr-constellation-subamount">
                    {formatAed(po.poAmountUsd)} · {po.orderedUnits} {po.unitLabel}
                  </div>
                </div>
              </div>

              {/* 3-Way Match Verification Matrix (PO <-> Goods Receipt <-> Vendor Invoice) */}
              <div className="pr-match-matrix" role="group" aria-label="3-way match verification">
                <div className="pr-match-leg is-ok">
                  <div className="pr-match-leg__head">
                    <FileCheck2 />
                    <span>1. Purchase Order ({po.id})</span>
                    <CheckCircle2 className="pr-leg-check" />
                  </div>
                  <div className="pr-match-leg__val">{formatUsd(po.poAmountUsd)}</div>
                  <div className="pr-match-leg__sub">
                    Authorized for {po.orderedUnits} {po.unitLabel}
                  </div>
                </div>

                <div className="pr-match-arrow" aria-hidden="true">
                  <ArrowRight />
                </div>

                <div className="pr-match-leg is-ok">
                  <div className="pr-match-leg__head">
                    <PackageCheck />
                    <span>2. Goods / SCIM Receipt</span>
                    <CheckCircle2 className="pr-leg-check" />
                  </div>
                  <div className="pr-match-leg__val">
                    {po.receiptConfirmedUnits} / {po.orderedUnits} {po.unitLabel}
                  </div>
                  <div className="pr-match-leg__sub">
                    100% Provisioned & SCIM Verified
                  </div>
                </div>

                <div className="pr-match-arrow" aria-hidden="true">
                  <ArrowRight />
                </div>

                <div className={`pr-match-leg ${hasVariance ? 'is-variance' : 'is-ok'}`}>
                  <div className="pr-match-leg__head">
                    <Receipt />
                    <span>3. Vendor Invoice ({po.invoiceNumber})</span>
                    {hasVariance ? (
                      <AlertTriangle className="pr-leg-warn" />
                    ) : (
                      <CheckCircle2 className="pr-leg-check" />
                    )}
                  </div>
                  <div className="pr-match-leg__val">{formatUsd(po.invoiceAmountUsd)}</div>
                  <div className="pr-match-leg__sub">
                    {hasVariance
                      ? `+${formatUsd(po.varianceUsd)} variance vs PO ceiling`
                      : 'Exact 0.00% variance match'}
                  </div>
                </div>
              </div>

              {po.varianceReason && (
                <div className={`pr-alert-strip ${hasVariance ? '' : 'is-resolved'}`}>
                  {hasVariance ? <AlertTriangle /> : <ShieldCheck />}
                  <span>{po.varianceReason}</span>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pr-constellation-foot">
                <div className="pr-faint">
                  <Landmark className="pr-inline-svg" /> Automated 3-Way Match Engine · IFRS & UAE
                  VAT 5% compliant
                </div>
                <div className="pr-row-actions">
                  {po.matchStatus === 'verified_queued' ? (
                    <span className="pr-executed-pill">
                      <CheckCircle2 /> Verified & Queued to Helix Ledger
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm neo-btn--plasma"
                      data-qa={`pr-verify-po-${po.id}`}
                      onClick={() => verifyThreeWayMatch(po.id)}
                    >
                      <BadgeCheck />
                      <span>
                        {hasVariance
                          ? `Clamp ${formatUsd(po.varianceUsd)} Variance & Queue to Ledger`
                          : 'Verify 3-Way Match & Queue to Ledger'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </NeoPanel>
          );
        })}
      </div>
    </div>
  );
}
