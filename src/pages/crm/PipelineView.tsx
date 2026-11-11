import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Columns3,
  Kanban,
  Plus,
  Sparkles,
  Table2,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  Ring,
  Spark,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import { ProjectSigil } from '@/projects/sigils';
import {
  computeDealWinProbability,
  formatCompactUsd,
  formatUsd,
  nextDealStage,
} from '@/crm/engine';
import { CRM_REGIONS, DEAL_STAGES, MEDDPICC_PILLARS } from '@/crm/seed';
import { useCrm } from '@/crm/store';
import type { CrmDeal, CrmRegion } from '@/crm/types';
import { DealCloseDate, DealTrackerCompact, formatDealDate } from './DealTracker';
import { MeddpiccBar, useCrmUsersMap } from './shared';

type PipelineMode = 'board' | 'table';

export function PipelineView({ onOpenNewDeal }: { onOpenNewDeal: () => void }) {
  const deals = useCrm((s) => s.deals);
  const toggleMeddpicc = useCrm((s) => s.toggleMeddpicc);
  const moveDealStage = useCrm((s) => s.moveDealStage);
  const setSelectedDealId = useCrm((s) => s.setSelectedDealId);
  const usersMap = useCrmUsersMap();

  const [mode, setMode] = useState<PipelineMode>('board');
  const [regionFilter, setRegionFilter] = useState<'All' | CrmRegion>('All');
  const [query, setQuery] = useState('');

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((d) => {
      if (regionFilter !== 'All' && d.region !== regionFilter) return false;
      if (
        q &&
        !`${d.title} ${d.accountName} ${d.region} ${d.segment}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [deals, regionFilter, query]);

  const summary = useMemo(() => {
    const totalAcv = filteredDeals.reduce((s, d) => s + d.acv, 0);
    const weightedAcv = filteredDeals.reduce(
      (s, d) => s + (d.acv * computeDealWinProbability(d)) / 100,
      0,
    );
    const avgProb =
      filteredDeals.length > 0
        ? Math.round(
            filteredDeals.reduce((s, d) => s + computeDealWinProbability(d), 0) /
              filteredDeals.length,
          )
        : 0;
    return { totalAcv, weightedAcv, avgProb };
  }, [filteredDeals]);

  return (
    <div className="crm-pipeline">
      {/* Filter & View Switcher Toolbar */}
      <div className="crm-filterbar">
        <NeoTabs<PipelineMode>
          label="Pipeline View Mode"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'board', label: 'Kanban Board', icon: <Kanban />, count: filteredDeals.length },
            { value: 'table', label: 'MEDDPICC Telemetry Table', icon: <Table2 /> },
          ]}
        />

        <div className="crm-region-chips" role="group" aria-label="Filter by region">
          {CRM_REGIONS.map((reg) => (
            <Chip
              key={reg}
              tone={regionFilter === reg ? 'orange' : 'slate'}
              pressed={regionFilter === reg}
              onClick={() => setRegionFilter(reg)}
            >
              {reg}
            </Chip>
          ))}
        </div>

        <div className="crm-filterbar__right">
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Search deals, accounts, regions…"
            size="sm"
          />
          <button
            type="button"
            className="neo-btn neo-btn--plasma neo-btn--sm"
            onClick={onOpenNewDeal}
          >
            <Plus />
            <span>New Deal</span>
          </button>
        </div>
      </div>

      {/* Pipeline Summary Strip */}
      <div className="crm-pipe-strip">
        <div className="crm-pipe-strip__stat">
          <span className="neo-hud">Filtered Pipeline ACV</span>
          <strong>{formatCompactUsd(summary.totalAcv)}</strong>
        </div>
        <div className="crm-pipe-strip__stat">
          <span className="neo-hud">Neural Weighted Value</span>
          <strong style={{ color: '#fb923c' }}>{formatCompactUsd(summary.weightedAcv)}</strong>
        </div>
        <div className="crm-pipe-strip__stat">
          <span className="neo-hud">Avg Neural Win Score</span>
          <strong>{summary.avgProb}%</strong>
        </div>
        <div className="crm-pipe-strip__legend">
          <span className="neo-hud">8-Pillar MEDDPICC Key:</span>
          {MEDDPICC_PILLARS.map((p) => (
            <span key={p.id} className="crm-med-key" title={p.description}>
              <b>{p.short}</b> {p.label}
            </span>
          ))}
        </div>
      </div>

      {filteredDeals.length === 0 ? (
        <NeoEmpty
          icon={<Columns3 />}
          title="No deals match your filter"
          action={
            <button
              type="button"
              className="neo-btn neo-btn--soft"
              onClick={() => {
                setRegionFilter('All');
                setQuery('');
              }}
            >
              Reset Filters
            </button>
          }
        >
          Try selecting another region pod or clearing the search filter.
        </NeoEmpty>
      ) : mode === 'board' ? (
        <div className="crm-kanban">
          {DEAL_STAGES.map((stageMeta) => {
            const stageDeals = filteredDeals.filter((d) => d.stage === stageMeta.id);
            const stageAcv = stageDeals.reduce((s, d) => s + d.acv, 0);

            return (
              <section key={stageMeta.id} className="neo-panel crm-kanban__col">
                <header className="crm-kanban__head">
                  <div className="crm-kanban__title-row">
                    <span className="crm-kanban__dot" style={{ background: stageMeta.color }} />
                    <h3 className="crm-kanban__title">{stageMeta.shortLabel}</h3>
                    <span className="neo-count">{stageDeals.length}</span>
                  </div>
                  <div className="crm-kanban__acv">{formatCompactUsd(stageAcv)} ACV</div>
                </header>

                <div className="crm-kanban__list">
                  {stageDeals.map((deal) => {
                    const winProb = computeDealWinProbability(deal);
                    const owner = usersMap.get(deal.ownerId) ?? SEED_USERS[0];
                    return (
                      <article
                        key={deal.id}
                        className="crm-deal-card neo-spot"
                        onClick={() => setSelectedDealId(deal.id)}
                      >
                        <div className="crm-deal-card__top">
                          <ProjectSigil icon={deal.sigil} color={deal.color} size={32} />
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="crm-deal-card__acc truncate">{deal.accountName}</div>
                            <h4 className="crm-deal-card__title">{deal.title}</h4>
                          </div>
                          <Ring
                            value={winProb / 100}
                            size={42}
                            stroke={4.5}
                            color={
                              winProb >= 75
                                ? '#34d399'
                                : winProb >= 55
                                  ? '#fb923c'
                                  : '#f43f5e'
                            }
                          >
                            {winProb}%
                          </Ring>
                        </div>

                        <div className="crm-deal-card__nums">
                          <div>
                            <span className="neo-hud">ACV</span>
                            <strong className="crm-deal-card__acv">{formatCompactUsd(deal.acv)}</strong>
                          </div>
                          <div>
                            <span className="neo-hud">Close</span>
                            <span className="crm-deal-card__date">{formatDealDate(deal.closeDate)}</span>
                          </div>
                          <Spark data={deal.momentum} width={76} height={24} color={deal.color} />
                        </div>

                        <MeddpiccBar
                          meddpicc={deal.meddpicc}
                          onToggle={(pillar) => toggleMeddpicc(deal.id, pillar)}
                        />

                        {deal.riskFlags.length > 0 && (
                          <div className="crm-deal-card__risk">
                            <AlertTriangle />
                            <span className="truncate">{deal.riskFlags[0]}</span>
                          </div>
                        )}

                        <div className="crm-deal-card__foot">
                          <div className="crm-deal-card__owner">
                            <Avatar user={owner} size={22} />
                            <span>{owner.name.split(' ')[0]}</span>
                            <Chip tone="slate" size="sm">{deal.region}</Chip>
                          </div>
                          {deal.stage !== 'won' && (
                            <button
                              type="button"
                              className="neo-iconbtn neo-iconbtn--sm"
                              title={`Advance to ${nextDealStage(deal.stage)}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveDealStage(deal.id);
                              }}
                            >
                              <ArrowRight />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <NeoPanel
          hud="8-Pillar Qualification & Telemetry"
          title="Enterprise Pipeline & MEDDPICC Matrix"
          flush
        >
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Opportunity &amp; Account</th>
                  <th>Stage</th>
                  <th>Region</th>
                  <th>ACV</th>
                  <th>Neural Win Prob</th>
                  <th>8-Pillar MEDDPICC Coverage (Click to Toggle)</th>
                  <th>Momentum</th>
                  <th>Owner</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal: CrmDeal) => {
                  const winProb = computeDealWinProbability(deal);
                  const owner = usersMap.get(deal.ownerId) ?? SEED_USERS[0];
                  return (
                    <tr
                      key={deal.id}
                      className="crm-table__row"
                      onClick={() => setSelectedDealId(deal.id)}
                    >
                      <td>
                        <div className="crm-table__deal">
                          <ProjectSigil icon={deal.sigil} color={deal.color} size={30} />
                          <div>
                            <div className="crm-table__title">{deal.title}</div>
                            <div className="crm-table__sub">
                              {deal.accountName} · <DealCloseDate deal={deal} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="crm-table__journey">
                        <DealTrackerCompact deal={deal} />
                      </td>
                      <td>
                        <Chip tone="slate" size="sm">{deal.region}</Chip>
                      </td>
                      <td>
                        <strong className="crm-table__acv">{formatUsd(deal.acv)}</strong>
                      </td>
                      <td>
                        <Ring
                          value={winProb / 100}
                          size={40}
                          stroke={4.5}
                          color={winProb >= 75 ? '#34d399' : winProb >= 55 ? '#fb923c' : '#f43f5e'}
                        >
                          {winProb}%
                        </Ring>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <MeddpiccBar
                          meddpicc={deal.meddpicc}
                          onToggle={(pillar) => toggleMeddpicc(deal.id, pillar)}
                        />
                      </td>
                      <td>
                        <Spark data={deal.momentum} width={88} height={26} color={deal.color} />
                      </td>
                      <td>
                        <div className="crm-table__owner">
                          <Avatar user={owner} size={24} />
                          <span>{owner.name}</span>
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="crm-table__acts">
                          <button
                            type="button"
                            className="neo-btn neo-btn--soft neo-btn--sm"
                            onClick={() => setSelectedDealId(deal.id)}
                          >
                            <Sparkles />
                            <span>360°</span>
                          </button>
                          {deal.stage !== 'won' && (
                            <button
                              type="button"
                              className="neo-btn neo-btn--plasma neo-btn--sm"
                              onClick={() => moveDealStage(deal.id)}
                            >
                              <ArrowRight />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </NeoPanel>
      )}
    </div>
  );
}
