/**
 * Helix Procurement — Contract Vault, AI Redlines & Renewal Radar (`ContractsView`).
 * Features 12-Month Renewal Cliff Radar (30d / 60d / 90d notice windows),
 * AI Clause & Redline Scanner, Peer P25/P50/P75 Benchmark Comparison,
 * and 1-click "Apply Nova Counter-Offer".
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileSignature,
  Flame,
  Scale,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
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
import { CATEGORY_META } from '@/procurement/seed';
import { useProcurement } from '@/procurement/store';

type CliffFilter = 'all' | '30d' | '60d' | '90d' | 'locked';

export function ContractsView() {
  const [cliffFilter, setCliffFilter] = useState<CliffFilter>('all');
  const [query, setQuery] = useState('');

  const users = useHub((s) => s.users);
  const userList = users.length ? users : SEED_USERS;
  const userMap = useMemo(() => new Map(userList.map((u) => [u.id, u])), [userList]);

  const contracts = useProcurement((s) => s.contracts);
  const applyContractCounterOffer = useProcurement((s) => s.applyContractCounterOffer);

  const tabItems = useMemo<NeoTabItem<CliffFilter>[]>(
    () => [
      { value: 'all', label: 'All Contracts', count: contracts.length },
      {
        value: '30d',
        label: '≤ 30d Renewal Cliff',
        count: contracts.filter((c) => c.daysUntilCliff <= 30).length,
      },
      {
        value: '60d',
        label: '31–90d Window',
        count: contracts.filter((c) => c.daysUntilCliff > 30 && c.daysUntilCliff <= 90).length,
      },
      {
        value: '90d',
        label: '90d+ Horizon',
        count: contracts.filter((c) => c.daysUntilCliff > 90).length,
      },
      {
        value: 'locked',
        label: 'Counter-Offer Locked',
        count: contracts.filter((c) => c.counterOfferApplied).length,
      },
    ],
    [contracts],
  );

  const filteredContracts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (cliffFilter === '30d' && c.daysUntilCliff > 30) return false;
      if (cliffFilter === '60d' && (c.daysUntilCliff <= 30 || c.daysUntilCliff > 90)) return false;
      if (cliffFilter === '90d' && c.daysUntilCliff <= 90) return false;
      if (cliffFilter === 'locked' && !c.counterOfferApplied) return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.vendorName.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q)
      );
    });
  }, [contracts, cliffFilter, query]);

  const totalOpenCounterSavings = useMemo(
    () =>
      contracts
        .filter((c) => !c.counterOfferApplied)
        .reduce((acc, c) => acc + Math.max(0, c.proposedRenewalUsd - c.novaCounterOfferUsd), 0),
    [contracts],
  );

  return (
    <div className="pr-stack">
      {/* 12-Month Renewal Timeline & Cliff Radar Strip */}
      <NeoPanel
        hud="12-Month Renewal Timeline & Notice Window Radar"
        title="Autonomous Renewal Cliff Horizon (30d / 60d / 90d Notice Windows)"
        icon={<CalendarClock />}
        actions={
          <NovaChip>
            {formatUsd(totalOpenCounterSavings)} Open Counter-Offer Savings
          </NovaChip>
        }
      >
        <div className="pr-timeline-track">
          {contracts.map((c) => {
            const urgent = c.daysUntilCliff <= 30 && !c.counterOfferApplied;
            const potentialSav = Math.max(0, c.proposedRenewalUsd - c.novaCounterOfferUsd);
            return (
              <div
                key={c.id}
                className={`pr-timeline-node ${urgent ? 'is-urgent' : ''} ${
                  c.counterOfferApplied ? 'is-locked' : ''
                }`}
              >
                <div className="pr-timeline-node__top">
                  <ProjectSigil icon={c.vendorSigil} color={c.vendorColor} size={30} />
                  <div>
                    <div className="pr-timeline-node__vendor">{c.vendorName}</div>
                    <div className="pr-timeline-node__date">
                      Ends {c.endDate} · {c.noticeWindowDays}d notice
                    </div>
                  </div>
                </div>
                <div className="pr-timeline-node__cliff">
                  {c.counterOfferApplied ? (
                    <span className="pr-pos">
                      <CheckCircle2 /> Counter Locked ({formatUsd(c.novaCounterOfferUsd, true)})
                    </span>
                  ) : (
                    <span className={urgent ? 'pr-danger-text' : 'pr-warn-text'}>
                      {urgent && <Flame />} {c.daysUntilCliff}d to Cliff · Save{' '}
                      {formatUsd(potentialSav, true)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Toolbar */}
      <div className="pr-toolbar">
        <NeoTabs
          value={cliffFilter}
          onChange={setCliffFilter}
          items={tabItems}
          label="Filter contracts by renewal window"
        />
        <div className="pr-toolbar__right">
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Search contract ID, vendor, clause…"
            className="pr-search-box"
          />
        </div>
      </div>

      {/* Contract Cards with AI Clause Redlines & Benchmark Counter-Offers */}
      <div className="pr-constellation-list">
        {filteredContracts.map((contract) => {
          const owner = userMap.get(contract.ownerId);
          const cat = CATEGORY_META[contract.category];
          const savings = Math.max(
            0,
            contract.proposedRenewalUsd - contract.novaCounterOfferUsd,
          );
          const savingsPct =
            contract.proposedRenewalUsd > 0
              ? ((savings / contract.proposedRenewalUsd) * 100).toFixed(1)
              : '0.0';

          return (
            <NeoPanel key={contract.id} className="pr-contract-panel neo-spot">
              {/* Contract Header */}
              <div className="pr-constellation-head">
                <div className="pr-constellation-head__left">
                  <ProjectSigil
                    icon={contract.vendorSigil}
                    color={contract.vendorColor}
                    size={42}
                  />
                  <div>
                    <div className="pr-eyebrow-row">
                      <span className="pr-mono-id">{contract.id}</span>
                      <Chip
                        tone={
                          contract.counterOfferApplied
                            ? 'emerald'
                            : contract.daysUntilCliff <= 30
                              ? 'rose'
                              : 'amber'
                        }
                        size="sm"
                      >
                        {contract.counterOfferApplied
                          ? 'Nova Counter-Offer Locked'
                          : `${contract.daysUntilCliff}d to Renewal Cliff (${contract.noticeWindowDays}d Notice)`}
                      </Chip>
                      <Chip tone="slate" size="sm">
                        {cat.label}
                      </Chip>
                      <Chip tone="cyan" size="sm">
                        Uplift Cap ≤ {contract.upliftCapPct}%
                      </Chip>
                    </div>
                    <h2 className="pr-constellation-title">
                      {contract.vendorName} — {contract.title}
                    </h2>
                    <div className="pr-contract-dates">
                      Term: {contract.startDate} → {contract.endDate} · Owner:{' '}
                      {owner && <Avatar user={owner} size={18} />}{' '}
                      <b>{owner?.name ?? contract.ownerId}</b>
                    </div>
                  </div>
                </div>

                <div className="pr-constellation-head__right">
                  <div className="pr-hud-label">
                    {contract.counterOfferApplied
                      ? 'Locked Renewal Commit'
                      : 'Nova Target vs Vendor Proposal'}
                  </div>
                  <div className="pr-constellation-amount">
                    {formatUsd(contract.novaCounterOfferUsd)}
                    {!contract.counterOfferApplied && (
                      <span className="pr-strike-amount">
                        {formatUsd(contract.proposedRenewalUsd)}
                      </span>
                    )}
                  </div>
                  <div className="pr-constellation-subamount">
                    {formatAed(contract.novaCounterOfferUsd, true)} · Save{' '}
                    <b className="pr-pos">
                      {formatUsd(savings)} ({savingsPct}%)
                    </b>
                  </div>
                </div>
              </div>

              {/* Nova Peer Benchmark Strip */}
              <div className="pr-contract-bench">
                <div className="pr-contract-bench__head">
                  <NovaChip>Peer Price Benchmark ({contract.benchmark.peerSampleSize} Companies)</NovaChip>
                  <span className="pr-mono-tag">Unit: {contract.benchmark.unitLabel}</span>
                </div>
                <div className="pr-percentiles">
                  <div className="pr-percentile is-p25">
                    <span>Peer P25</span>
                    <strong>${contract.benchmark.p25Usd.toLocaleString()}</strong>
                  </div>
                  <div className="pr-percentile is-target">
                    <span>Nova Counter Target</span>
                    <strong>${contract.benchmark.targetCounterUsd.toLocaleString()}</strong>
                  </div>
                  <div className="pr-percentile">
                    <span>Peer Median (P50)</span>
                    <strong>${contract.benchmark.medianUsd.toLocaleString()}</strong>
                  </div>
                  <div className="pr-percentile is-quote">
                    <span>Vendor Proposed Rate</span>
                    <strong>${contract.benchmark.quotedUnitUsd.toLocaleString()}</strong>
                  </div>
                  <div className="pr-percentile">
                    <span>Peer P75</span>
                    <strong>${contract.benchmark.p75Usd.toLocaleString()}</strong>
                  </div>
                </div>
                <p className="pr-benchmark-rec">{contract.benchmark.recommendation}</p>
              </div>

              {/* AI Clause & Redline Scanner */}
              <div className="pr-clause-section">
                <div className="pr-clause-section__head">
                  <span className="neo-hud">
                    <Scale /> AI Legal Clause & Policy Redline Scanner
                  </span>
                  <span className="pr-faint">
                    {contract.clauses.filter((c) => c.status === 'compliant').length} compliant ·{' '}
                    {contract.clauses.filter((c) => c.status === 'redline_needed').length} redlines
                    flagged
                  </span>
                </div>

                <div className="pr-clause-grid">
                  {contract.clauses.map((cl) => (
                    <div key={cl.id} className={`pr-clause-card is-${cl.status}`}>
                      <div className="pr-clause-card__top">
                        <span className="pr-clause-card__label">{cl.label}</span>
                        <Chip
                          tone={
                            cl.status === 'compliant'
                              ? 'emerald'
                              : cl.status === 'negotiated'
                                ? 'cyan'
                                : 'amber'
                          }
                          size="sm"
                        >
                          {cl.status === 'compliant' ? (
                            <>
                              <ShieldCheck /> Compliant
                            </>
                          ) : cl.status === 'negotiated' ? (
                            <>
                              <CheckCircle2 /> Redline Accepted
                            </>
                          ) : (
                            <>
                              <AlertTriangle /> Redline Needed
                            </>
                          )}
                        </Chip>
                      </div>
                      <div className="pr-clause-diff">
                        <div className="pr-clause-diff__line is-vendor">
                          <span>Vendor Paper:</span> {cl.vendorDraft}
                        </div>
                        <div className="pr-clause-diff__line is-nova">
                          <span>
                            <Sparkles /> Nova Redline:
                          </span>{' '}
                          {cl.novaRedline}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Footer */}
              <div className="pr-constellation-foot">
                <div className="pr-faint">
                  <FileSignature className="pr-inline-svg" /> Master Services Agreement & UAE PDPL
                  DPA archived in Helix Vault
                </div>
                <div className="pr-row-actions">
                  {contract.counterOfferApplied ? (
                    <span className="pr-executed-pill">
                      <CheckCircle2 /> Nova Counter-Offer Locked · Saved {formatUsd(savings)}/yr
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm neo-btn--plasma"
                      data-qa={`pr-counter-offer-${contract.id}`}
                      onClick={() => applyContractCounterOffer(contract.id)}
                    >
                      <Zap />
                      <span>
                        Apply Nova Counter-Offer (Save {formatUsd(savings)})
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
