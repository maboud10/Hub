/**
 * Helix Procurement — Intake & Command (`CommandView`).
 * Features attention banners, 5-KPI HUD ribbon with Spark charts,
 * Nova Autonomous Intake & Price Benchmark Copilot, Live Approval Queue,
 * Spend Breakdown by Category, and 1-click Nova Savings Playbooks.
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  FileCheck2,
  Flame,
  Plus,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wallet,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  CountUp,
  NeoBanner,
  NeoBanners,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  NovaChip,
  Orb,
  Ring,
  Spark,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import { ProjectSigil } from '@/projects/sigils';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import {
  computeCategorySpendBreakdown,
  computeProcurementKpis,
  formatAed,
  formatUsd,
} from '@/procurement/engine';
import { CATEGORY_META, NOVA_PROMPT_SUGGESTIONS } from '@/procurement/seed';
import { useProcurement } from '@/procurement/store';

export function CommandView() {
  const navigate = useNavigate();
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const userList = users.length ? users : SEED_USERS;

  const vendors = useProcurement((s) => s.vendors);
  const requests = useProcurement((s) => s.requests);
  const contracts = useProcurement((s) => s.contracts);
  const purchaseOrders = useProcurement((s) => s.purchaseOrders);
  const budgets = useProcurement((s) => s.budgets);
  const playbooks = useProcurement((s) => s.playbooks);
  const baselineManagedSpendUsd = useProcurement((s) => s.baselineManagedSpendUsd);
  const baselineSavingsUsd = useProcurement((s) => s.baselineSavingsUsd);
  const extraNegotiatedSavingsUsd = useProcurement((s) => s.extraNegotiatedSavingsUsd);
  const autonomousCycleDays = useProcurement((s) => s.autonomousCycleDays);
  const activeIntakeDraft = useProcurement((s) => s.activeIntakeDraft);

  const runNovaIntake = useProcurement((s) => s.runNovaIntake);
  const clearNovaIntake = useProcurement((s) => s.clearNovaIntake);
  const createRequestFromNovaDraft = useProcurement((s) => s.createRequestFromNovaDraft);
  const advanceApproval = useProcurement((s) => s.advanceApproval);
  const negotiateRequest = useProcurement((s) => s.negotiateRequest);
  const issuePurchaseOrder = useProcurement((s) => s.issuePurchaseOrder);
  const executeSavingsPlaybook = useProcurement((s) => s.executeSavingsPlaybook);

  const userMap = useMemo(() => new Map(userList.map((u) => [u.id, u])), [userList]);

  const kpis = useMemo(
    () =>
      computeProcurementKpis({
        vendors,
        requests,
        contracts,
        purchaseOrders,
        budgets,
        playbooks,
        baselineManagedSpendUsd,
        baselineSavingsUsd,
        extraNegotiatedSavingsUsd,
        autonomousCycleDays,
      }),
    [
      vendors,
      requests,
      contracts,
      purchaseOrders,
      budgets,
      playbooks,
      baselineManagedSpendUsd,
      baselineSavingsUsd,
      extraNegotiatedSavingsUsd,
      autonomousCycleDays,
    ],
  );

  const categoryRows = useMemo(() => computeCategorySpendBreakdown(vendors), [vendors]);

  const urgentContracts = useMemo(
    () => contracts.filter((c) => c.daysUntilCliff <= 30 && !c.counterOfferApplied),
    [contracts],
  );

  const flaggedOrders = useMemo(
    () => purchaseOrders.filter((p) => p.matchStatus === 'variance_flagged'),
    [purchaseOrders],
  );

  const activeQueue = useMemo(
    () =>
      requests
        .filter((r) => r.status !== 'po_issued' && r.status !== 'rejected')
        .slice(0, 4),
    [requests],
  );

  return (
    <div className="pr-stack">
      {/* Attention Banners */}
      <NeoBanners>
        {urgentContracts.length > 0 && (
          <NeoBanner
            tone="warning"
            icon={<Flame />}
            title={`30-Day Renewal Cliff Alert · ${urgentContracts.map((c) => `${c.vendorName} (${c.daysUntilCliff}d)`).join(' & ')}`}
            meta={`${formatUsd(urgentContracts.reduce((acc, c) => acc + (c.proposedRenewalUsd - c.novaCounterOfferUsd), 0), true)} counter-offer savings ready`}
            to="/procurement/contracts"
          >
            Auto-renewal notice window closes soon — review AI clause redlines & lock Nova P25 counter-offers.
          </NeoBanner>
        )}
        {flaggedOrders.length > 0 && (
          <NeoBanner
            tone="danger"
            icon={<AlertTriangle />}
            title={`3-Way Match Variance Detected · ${flaggedOrders.length} Purchase Order${flaggedOrders.length === 1 ? '' : 's'} Held`}
            meta={`${formatUsd(flaggedOrders.reduce((acc, p) => acc + p.varianceUsd, 0))} unapproved invoice overage`}
            to="/procurement/orders"
          >
            {flaggedOrders.map((p) => p.vendorName).join(' & ')} billed above PO ceiling — verify 3-way match to clamp variance & release to Ledger.
          </NeoBanner>
        )}
      </NeoBanners>

      {/* 5-KPI HUD Ribbon */}
      <NeoKpis label="Procurement telemetry">
        <NeoKpi
          label="Managed Spend"
          icon={<Wallet />}
          value={
            <CountUp
              value={kpis.managedSpendUsd}
              format={(n) => `$${(n / 1_000_000).toFixed(2)}M`}
            />
          }
          sub={`${formatAed(kpis.managedSpendUsd, true)} · 9 active vendors`}
          spark={<Spark data={[19.6, 19.2, 18.9, 18.7, 18.5, kpis.managedSpendUsd / 1_000_000]} color="#fbbf24" />}
          to="/procurement/vendors"
        />
        <NeoKpi
          label="Nova Negotiated Savings"
          icon={<TrendingDown />}
          tone="emerald"
          value={
            <span>
              <CountUp
                value={kpis.totalSavingsUsd}
                format={(n) => `$${(n / 1_000_000).toFixed(2)}M`}
              />{' '}
              <small className="pr-kpi-pct">· {kpis.savingsPct}%</small>
            </span>
          }
          sub={`+${formatUsd(kpis.potentialIdleSavingsUsd, true)} reclaimable idle seats`}
          spark={<Spark data={[1.42, 1.68, 1.91, 2.12, 2.25, kpis.totalSavingsUsd / 1_000_000]} color="#10b981" />}
          to="/procurement/contracts"
        />
        <NeoKpi
          label="Autonomous Cycle Time"
          icon={<Clock />}
          value={`${kpis.autonomousCycleDays}d`}
          sub="5-stage parallel SLA (vs 14.2d industry)"
          spark={<Spark data={[6.4, 4.8, 3.5, 2.6, 2.1, 1.8]} color="#38bdf8" />}
          to="/procurement/requests"
        />
        <NeoKpi
          label="Active POs & Requests"
          icon={<FileCheck2 />}
          value={`${kpis.activePosCount} POs · ${kpis.openRequestsCount} Req`}
          sub={`${flaggedOrders.length} invoice variance · ${requests.filter((r) => r.status === 'approved').length} ready for PO`}
          spark={<Spark data={[8, 9, 10, 11, 11, kpis.activePosCount + kpis.openRequestsCount]} color="#a855f7" />}
          to="/procurement/orders"
        />
        <NeoKpi
          label="Vendor Security Score"
          icon={<ShieldCheck />}
          tone="emerald"
          value={`${kpis.avgSecurityScore}%`}
          sub="SOC2 Type II · ISO 27001 · UAE PDPL"
          spark={<Spark data={[92, 93, 94, 95, 96, kpis.avgSecurityScore]} color="#10b981" />}
          to="/procurement/vendors"
        />
      </NeoKpis>

      {/* Nova Autonomous Intake & Price Benchmark Copilot */}
      <NeoNovaPrompt
        hud="Nova Autonomous Intake & Price Benchmark Copilot"
        title="Describe any software, cloud commit, or hardware need — Nova benchmarks peer pricing & builds your approval constellation"
        badge="P25 Peer Intelligence · Live"
        placeholder='e.g. "25 Figma Enterprise seats for Design in Singapore" or "Renew Snowflake Enterprise with 15% multi-year cap"'
        suggestions={NOVA_PROMPT_SUGGESTIONS}
        submitLabel="Benchmark & Scope"
        onSubmit={(text) => {
          runNovaIntake(text);
        }}
      >
        {activeIntakeDraft && (
          <div className="pr-nova-blueprint" data-qa="pr-nova-blueprint">
            <div className="pr-nova-blueprint__head">
              <div className="pr-nova-blueprint__title-row">
                <ProjectSigil
                  icon={activeIntakeDraft.vendorSigil}
                  color={activeIntakeDraft.vendorColor}
                  size={38}
                />
                <div>
                  <div className="pr-eyebrow-row">
                    <NovaChip>Scoped Requisition Blueprint</NovaChip>
                    <Chip tone="amber" size="sm">
                      {CATEGORY_META[activeIntakeDraft.category].label}
                    </Chip>
                    <Chip tone="emerald" size="sm">
                      {activeIntakeDraft.confidencePct}% Benchmark Match
                    </Chip>
                  </div>
                  <h3 className="pr-nova-blueprint__title">{activeIntakeDraft.title}</h3>
                  <div className="pr-nova-blueprint__sub">
                    {activeIntakeDraft.quantity} {activeIntakeDraft.unitLabel} ·{' '}
                    {activeIntakeDraft.department} ({activeIntakeDraft.location}) ·{' '}
                    {activeIntakeDraft.termMonths}-month term
                  </div>
                </div>
              </div>
              <div className="pr-nova-blueprint__price-box">
                <div className="pr-hud-label">Nova Target Counter-Offer</div>
                <div className="pr-nova-blueprint__price">
                  {formatUsd(activeIntakeDraft.recommendedAnnualUsd)}
                  <span>/yr</span>
                </div>
                <div className="pr-nova-blueprint__savings">
                  Saves {formatUsd(activeIntakeDraft.estimatedSavingsUsd)} vs{' '}
                  {formatUsd(activeIntakeDraft.quotedAnnualUsd)} list quote
                </div>
              </div>
            </div>

            {activeIntakeDraft.duplicateWarning && (
              <div className="pr-alert-strip">
                <AlertTriangle />
                <span>
                  <b>Overlap & Idle License Radar:</b> {activeIntakeDraft.duplicateWarning}
                </span>
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--soft"
                  onClick={() => navigate('/procurement/vendors')}
                >
                  Inspect Vendor 360
                </button>
              </div>
            )}

            {/* Peer Price Benchmark Percentiles */}
            <div className="pr-benchmark-grid">
              <div className="pr-benchmark-card">
                <div className="pr-benchmark-card__head">
                  <span className="neo-hud">
                    Peer Price Benchmark ({activeIntakeDraft.benchmark.peerSampleSize} Enterprise Deals)
                  </span>
                  <span className="pr-mono-tag">
                    Unit: {activeIntakeDraft.benchmark.unitLabel}
                  </span>
                </div>
                <div className="pr-percentiles">
                  <div className="pr-percentile is-p25">
                    <span>P25 Best-in-Class</span>
                    <strong>{formatUsd(activeIntakeDraft.benchmark.p25Usd)}</strong>
                  </div>
                  <div className="pr-percentile is-target">
                    <span>Nova Counter Target</span>
                    <strong>{formatUsd(activeIntakeDraft.benchmark.targetCounterUsd)}</strong>
                  </div>
                  <div className="pr-percentile">
                    <span>Peer Median (P50)</span>
                    <strong>{formatUsd(activeIntakeDraft.benchmark.medianUsd)}</strong>
                  </div>
                  <div className="pr-percentile is-quote">
                    <span>Vendor List Quote</span>
                    <strong>{formatUsd(activeIntakeDraft.benchmark.quotedUnitUsd)}</strong>
                  </div>
                  <div className="pr-percentile">
                    <span>Peer P75</span>
                    <strong>{formatUsd(activeIntakeDraft.benchmark.p75Usd)}</strong>
                  </div>
                </div>
                <p className="pr-benchmark-rec">{activeIntakeDraft.benchmark.recommendation}</p>
              </div>

              {/* 5-Stage Parallel Approval Constellation Preview */}
              <div className="pr-benchmark-card">
                <div className="pr-benchmark-card__head">
                  <span className="neo-hud">5-Stage Parallel Approval Constellation</span>
                  <span className="pr-mono-tag">Est. SLA: 1.8d</span>
                </div>
                <div className="pr-mini-constellation">
                  {activeIntakeDraft.stagesPreview.map((st, idx) => {
                    const reviewer = userMap.get(st.reviewerId);
                    return (
                      <div key={st.id} className="pr-mini-stage">
                        <span className="pr-mini-stage__num">{idx + 1}</span>
                        {reviewer && <Avatar user={reviewer} size={22} />}
                        <div className="pr-mini-stage__info">
                          <div className="pr-mini-stage__label">{st.label}</div>
                          <div className="pr-mini-stage__meta">
                            {reviewer?.name ?? st.reviewerId} · {st.slaHours}h SLA
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pr-nova-blueprint__actions">
              <button
                type="button"
                className="neo-btn neo-btn--plasma"
                data-qa="pr-create-from-nova"
                onClick={() => {
                  const created = createRequestFromNovaDraft(activeIntakeDraft, me?.id ?? 'u-layla');
                  if (created) {
                    navigate('/procurement/requests');
                  }
                }}
              >
                <Zap />
                <span>Create Purchase Requisition ({formatUsd(activeIntakeDraft.recommendedAnnualUsd)})</span>
              </button>
              <button
                type="button"
                className="neo-btn neo-btn--soft"
                onClick={() => clearNovaIntake()}
              >
                <X />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}
      </NeoNovaPrompt>

      {/* Main + Side Two-Column Workspace */}
      <NeoHome
        main={
          <div className="pr-stack">
            {/* Live Approval Constellation Queue */}
            <NeoPanel
              hud="In-Flight Requisitions"
              title="Live 5-Stage Approval Constellation Queue"
              icon={<Radar />}
              actions={
                <div className="pr-row-actions">
                  <button
                    type="button"
                    className="neo-btn neo-btn--sm neo-btn--soft"
                    onClick={() => navigate('/procurement/requests?new=1')}
                  >
                    <Plus /> New Request
                  </button>
                  <Link to="/procurement/requests" className="neo-btn neo-btn--sm neo-btn--ghost">
                    All Requisitions ({requests.length}) <ArrowRight />
                  </Link>
                </div>
              }
            >
              <div className="pr-req-list">
                {activeQueue.map((req) => {
                  const approvedCount = req.stages.filter((s) => s.status === 'approved').length;
                  const currentStage = req.stages.find((s) => s.status !== 'approved');
                  const currentReviewer = currentStage ? userMap.get(currentStage.reviewerId) : null;
                  const savings = Math.max(0, req.quotedAnnualUsd - req.negotiatedAnnualUsd);

                  return (
                    <article key={req.id} className="pr-req-card neo-spot">
                      <div className="pr-req-card__top">
                        <div className="pr-req-card__identity">
                          <ProjectSigil
                            icon={req.vendorSigil}
                            color={req.vendorColor}
                            size={36}
                          />
                          <div>
                            <div className="pr-req-card__meta">
                              <span className="pr-mono-id">{req.id}</span>
                              <Chip
                                tone={
                                  req.status === 'approved'
                                    ? 'emerald'
                                    : req.status === 'negotiating'
                                      ? 'amber'
                                      : 'cyan'
                                }
                                size="sm"
                              >
                                {req.status === 'approved'
                                  ? 'Ready for PO'
                                  : req.status === 'negotiating'
                                    ? 'Nova Negotiating'
                                    : `${approvedCount}/5 Gates Cleared`}
                              </Chip>
                              <span className="pr-faint">
                                {req.department} · {req.location}
                              </span>
                            </div>
                            <h3 className="pr-req-card__title">{req.title}</h3>
                          </div>
                        </div>

                        <div className="pr-req-card__amount">
                          <strong>{formatUsd(req.negotiatedAnnualUsd)}</strong>
                          <span>
                            {savings > 0 ? (
                              <em className="pr-pos">Saved {formatUsd(savings)}</em>
                            ) : (
                              formatAed(req.negotiatedAnnualUsd, true)
                            )}
                          </span>
                        </div>
                      </div>

                      {/* 5-Stage Pill Track */}
                      <div className="pr-stage-strip" role="list" aria-label="Approval stages">
                        {req.stages.map((st, i) => {
                          const rev = userMap.get(st.reviewerId);
                          return (
                            <div
                              key={st.id}
                              role="listitem"
                              className={`pr-stage-pill is-${st.status}`}
                              title={`${st.label} · ${rev?.name ?? st.reviewerId} (${st.status})`}
                            >
                              <span className="pr-stage-pill__idx">{i + 1}</span>
                              <span className="pr-stage-pill__name">{st.label}</span>
                              {rev && <Avatar user={rev} size={18} />}
                            </div>
                          );
                        })}
                      </div>

                      <div className="pr-req-card__foot">
                        <div className="pr-req-card__gate">
                          {currentStage ? (
                            <>
                              <Orb tone="amber" pulse />
                              <span>
                                Next gate: <b>{currentStage.label}</b> ({currentReviewer?.name ?? currentStage.reviewerId} · {currentStage.slaHours}h SLA)
                              </span>
                            </>
                          ) : (
                            <>
                              <Orb tone="emerald" />
                              <span>All 5 parallel gates signed off — cleared for PO dispatch.</span>
                            </>
                          )}
                        </div>
                        <div className="pr-row-actions">
                          {req.status !== 'approved' && (
                            <>
                              <button
                                type="button"
                                className="neo-btn neo-btn--xs neo-btn--soft"
                                onClick={() => negotiateRequest(req.id)}
                              >
                                <WandSparkles /> Nova Negotiate
                              </button>
                              <button
                                type="button"
                                className="neo-btn neo-btn--xs neo-btn--plasma"
                                onClick={() => advanceApproval(req.id)}
                              >
                                <BadgeCheck /> Approve Stage
                              </button>
                            </>
                          )}
                          {req.status === 'approved' && (
                            <button
                              type="button"
                              className="neo-btn neo-btn--xs neo-btn--plasma"
                              onClick={() => issuePurchaseOrder(req.id)}
                            >
                              <FileCheck2 /> Issue PO Now
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </NeoPanel>

            {/* Nova Autonomous Savings Playbooks */}
            <NeoPanel
              hud="Autonomous FinOps & License Optimization"
              title="Nova 1-Click Savings Playbooks"
              icon={<Sparkles />}
              actions={
                <NovaChip>
                  {formatUsd(
                    playbooks
                      .filter((p) => !p.executed)
                      .reduce((acc, p) => acc + p.estimatedSavingsUsd, 0),
                  )}{' '}
                  Available
                </NovaChip>
              }
            >
              <div className="pr-playbook-grid">
                {playbooks.map((pb) => {
                  const cat = CATEGORY_META[pb.category];
                  return (
                    <div
                      key={pb.id}
                      className={`pr-playbook-card neo-spot ${pb.executed ? 'is-executed' : ''}`}
                    >
                      <div className="pr-playbook-card__top">
                        <ProjectSigil icon={cat.sigil} color={cat.color} size={32} />
                        <div className="pr-playbook-card__badges">
                          <Chip tone={pb.executed ? 'emerald' : 'amber'} size="sm">
                            {pb.executed
                              ? 'Executed & Locked'
                              : `${pb.confidencePct}% Confidence`}
                          </Chip>
                          <span className="pr-playbook-card__sav">
                            +{formatUsd(pb.estimatedSavingsUsd)}/yr
                          </span>
                        </div>
                      </div>
                      <h3 className="pr-playbook-card__title">{pb.title}</h3>
                      <p className="pr-playbook-card__desc">{pb.description}</p>
                      <div className="pr-playbook-card__foot">
                        <span className="pr-mono-tag">{cat.glCode}</span>
                        {pb.executed ? (
                          <span className="pr-executed-pill">
                            <CheckCircle2 /> Savings Added to Ledger
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--plasma"
                            onClick={() => executeSavingsPlaybook(pb.id)}
                          >
                            <Zap /> Execute Playbook
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </NeoPanel>
          </div>
        }
        side={
          <div className="pr-stack">
            {/* Spend Breakdown by Category */}
            <NeoPanel
              hud="GL Allocation & Orbit"
              title="Spend Breakdown by Category"
              icon={<Wallet />}
            >
              <div className="pr-cat-list">
                {categoryRows.map((row) => (
                  <div key={row.category} className="pr-cat-row">
                    <div className="pr-cat-row__head">
                      <div className="pr-cat-row__left">
                        <ProjectSigil icon={row.sigil} color={row.color} size={28} />
                        <div>
                          <div className="pr-cat-row__name">{row.label}</div>
                          <div className="pr-cat-row__gl">
                            {row.glCode} · {row.vendorCount} vendor{row.vendorCount === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <div className="pr-cat-row__right">
                        <strong>{formatUsd(row.annualSpendUsd, true)}</strong>
                        <span>{row.sharePct}%</span>
                      </div>
                    </div>
                    <Bar value={row.sharePct / 100} fill={row.color} height={6} label={row.label} />
                  </div>
                ))}
              </div>
            </NeoPanel>

            {/* License Utilization & Idle Seat Radar */}
            <NeoPanel
              hud="SCIM License Telemetry"
              title="Unused SaaS Seat Radar"
              icon={<ShieldCheck />}
              actions={
                <Link to="/procurement/vendors" className="neo-btn neo-btn--xs neo-btn--ghost">
                  Vendor 360 <ArrowRight />
                </Link>
              }
            >
              <div className="pr-radar-summary">
                <Ring value={0.86} size={64} stroke={6} color="#10b981">
                  86%
                </Ring>
                <div>
                  <div className="pr-radar-summary__title">
                    {kpis.totalIdleSeats} Idle Seats Detected
                  </div>
                  <div className="pr-radar-summary__sub">
                    Reclaiming inactive licenses (&gt;45d) saves{' '}
                    <b className="pr-pos">{formatUsd(kpis.potentialIdleSavingsUsd)}/yr</b> across
                    Figma, Datadog, Snowflake & Rippling.
                  </div>
                </div>
              </div>
              <div className="pr-idle-mini-list">
                {vendors
                  .filter((v) => v.provisionedSeats > v.activeSeats)
                  .slice(0, 4)
                  .map((v) => {
                    const idle = v.provisionedSeats - v.activeSeats;
                    const sav = idle * v.unitCostPerSeatUsd;
                    return (
                      <div key={v.id} className="pr-idle-mini-row">
                        <ProjectSigil icon={v.sigil} color={v.color} size={24} />
                        <div className="grow">
                          <div className="pr-idle-mini-row__name">{v.name}</div>
                          <div className="pr-idle-mini-row__meta">
                            {v.activeSeats}/{v.provisionedSeats} active · {idle} idle
                          </div>
                        </div>
                        <span className="pr-pos">+{formatUsd(sav, true)}</span>
                      </div>
                    );
                  })}
              </div>
            </NeoPanel>
          </div>
        }
      />
    </div>
  );
}
