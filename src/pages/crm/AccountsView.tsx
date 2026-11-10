import { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Flame,
  Globe2,
  Rocket,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoSearch,
  Ring,
  Spark,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import { ProjectSigil } from '@/projects/sigils';
import {
  computeAccountWhitespace,
  formatCompactUsd,
} from '@/crm/engine';
import { CRM_MODULES, CRM_REGIONS } from '@/crm/seed';
import { useCrm } from '@/crm/store';
import type { CrmModuleId, CrmRegion } from '@/crm/types';
import { useCrmUsersMap } from './shared';

export function AccountsView() {
  const accounts = useCrm((s) => s.accounts);
  const launchAccountExpansion = useCrm((s) => s.launchAccountExpansion);
  const setSelectedDealId = useCrm((s) => s.setSelectedDealId);
  const usersMap = useCrmUsersMap();

  const [regionFilter, setRegionFilter] = useState<'All' | CrmRegion>('All');
  const [query, setQuery] = useState('');

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (regionFilter !== 'All' && a.region !== regionFilter) return false;
      if (
        q &&
        !`${a.name} ${a.industry} ${a.region} ${a.segment}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [accounts, regionFilter, query]);

  const totals = useMemo(() => {
    let totalArr = 0;
    let totalWhitespace = 0;
    let constrainedCount = 0;
    let nrrSum = 0;

    for (const acc of filteredAccounts) {
      totalArr += acc.arr;
      nrrSum += acc.nrr;
      const ws = computeAccountWhitespace(acc);
      totalWhitespace += ws.totalWhitespaceArr;
      if (ws.isSeatConstrained) constrainedCount += 1;
    }

    return {
      totalArr,
      totalWhitespace,
      constrainedCount,
      avgNrr: filteredAccounts.length ? Math.round(nrrSum / filteredAccounts.length) : 134,
    };
  }, [filteredAccounts]);

  const handleLaunchExpansion = (accountId: string, moduleId?: CrmModuleId) => {
    const deal = launchAccountExpansion(accountId, moduleId);
    if (deal) {
      setSelectedDealId(deal.id);
    }
  };

  return (
    <div className="crm-accounts">
      <NeoKpis label="Customer 360 & White-Space Summary">
        <NeoKpi
          label="Enterprise Base ARR"
          value={formatCompactUsd(totals.totalArr)}
          sub={`${filteredAccounts.length} active strategic accounts`}
          tone="emerald"
        />
        <NeoKpi
          label="Untapped Expansion White-Space"
          value={formatCompactUsd(totals.totalWhitespace)}
          sub="Across 5 Helix product modules"
          tone="orange"
        />
        <NeoKpi
          label="Cohort Net Dollar Retention"
          value={`${totals.avgNrr}%`}
          sub="Driven by Nova AI & GCC Sovereign"
          tone="cyan"
        />
        <NeoKpi
          label=">90% Seat Ceiling Alerts"
          value={`${totals.constrainedCount} Accounts`}
          sub="Immediate license true-up ready"
          tone="pink"
        />
      </NeoKpis>

      {/* Filter Bar */}
      <div className="crm-filterbar">
        <div className="crm-region-chips" role="group" aria-label="Filter accounts by region">
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
            placeholder="Search accounts, industry, region…"
            size="sm"
          />
        </div>
      </div>

      {/* 5-Module Product Adoption Matrix Legend */}
      <NeoPanel
        hud="5-Module Product Adoption & White-Space Matrix"
        title="Customer 360° & Autonomous Expansion Radar"
        icon={<Building2 />}
        actions={
          <div className="crm-matrix-legend">
            <Chip tone="emerald" size="sm">Adopted</Chip>
            <Chip tone="violet" size="sm">Active Pilot / Trial</Chip>
            <Chip tone="orange" size="sm">Untapped White-Space ($)</Chip>
          </div>
        }
      >
        <div className="crm-accounts-grid">
          {filteredAccounts.map((acc) => {
            const ws = computeAccountWhitespace(acc);
            const owner = usersMap.get(acc.ownerId) ?? SEED_USERS[0];
            const csm = usersMap.get(acc.csmId) ?? SEED_USERS[1];
            const topModule = ws.openModules[0];

            return (
              <article key={acc.id} className="crm-account-card neo-spot">
                <header className="crm-account-card__head">
                  <ProjectSigil icon={acc.sigil} color={acc.color} size={40} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="crm-account-card__badges">
                      <Chip tone="slate" size="sm">{acc.region}</Chip>
                      <Chip tone="slate" size="sm">{acc.segment}</Chip>
                      {acc.rtlTelemetryActive && (
                        <Chip tone="emerald" size="sm" icon={<Globe2 />}>
                          Arabic RTL Active
                        </Chip>
                      )}
                    </div>
                    <h3 className="crm-account-card__name">{acc.name}</h3>
                    <div className="crm-account-card__industry">{acc.industry}</div>
                  </div>

                  <div className="crm-account-card__health">
                    <Ring
                      value={acc.healthScore / 100}
                      size={50}
                      stroke={5}
                      color={acc.healthScore >= 90 ? '#34d399' : acc.healthScore >= 80 ? '#38bdf8' : '#fb923c'}
                    >
                      {acc.healthScore}
                    </Ring>
                    <span className="neo-hud">Health</span>
                  </div>
                </header>

                {/* ARR, NRR, White-Space & Telemetry Sparkline */}
                <div className="crm-account-card__stats">
                  <div className="crm-account-stat">
                    <span className="neo-hud">Live ARR</span>
                    <strong>{formatCompactUsd(acc.arr)}</strong>
                  </div>
                  <div className="crm-account-stat">
                    <span className="neo-hud">NRR</span>
                    <strong style={{ color: '#34d399' }}>{acc.nrr}%</strong>
                  </div>
                  <div className="crm-account-stat">
                    <span className="neo-hud">Expansion White-Space</span>
                    <strong style={{ color: '#fb923c' }}>
                      +{formatCompactUsd(ws.totalWhitespaceArr)}
                    </strong>
                  </div>
                  <div className="crm-account-stat">
                    <span className="neo-hud">Telemetry Pulse</span>
                    <Spark data={acc.telemetryTrend} width={84} height={24} color={acc.color} />
                  </div>
                </div>

                {/* Seat Utilization Bar */}
                <div className="crm-seat-box">
                  <div className="crm-seat-box__top">
                    <span className="neo-hud">
                      Seat Utilization ({acc.seatsActive.toLocaleString()} / {acc.seatsLicensed.toLocaleString()} seats)
                    </span>
                    <span className={ws.isSeatConstrained ? 'crm-seat-pct is-hot' : 'crm-seat-pct'}>
                      {ws.isSeatConstrained && <Flame />}
                      {ws.seatUtilizationPct}% utilized
                    </span>
                  </div>
                  <Bar
                    value={ws.seatUtilizationPct / 100}
                    fill={ws.isSeatConstrained ? 'linear-gradient(90deg, #fb923c, #ec4899)' : undefined}
                    label={`${acc.name} seat utilization`}
                  />
                </div>

                {/* 5-Module Product Adoption Matrix */}
                <div className="crm-mod-matrix">
                  <div className="neo-hud">5-Module Product Adoption &amp; White-Space Matrix</div>
                  <div className="crm-mod-slots">
                    {CRM_MODULES.map((mod) => {
                      const slot = acc.modules[mod.id];
                      const state = slot?.state ?? 'whitespace';
                      const pot = slot?.potentialArr || mod.defaultExpansionArr;

                      return (
                        <div
                          key={mod.id}
                          className={`crm-mod-slot crm-mod-slot--${state}`}
                          title={slot?.note ?? mod.blurb}
                        >
                          <div className="crm-mod-slot__head">
                            <ProjectSigil icon={mod.sigil} color={mod.color} size={20} />
                            <span className="crm-mod-slot__name">{mod.shortLabel}</span>
                          </div>
                          {state === 'adopted' ? (
                            <div className="crm-mod-slot__status is-adopted">
                              <CheckCircle2 />
                              <span>Adopted</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="crm-mod-slot__launch"
                              onClick={() => handleLaunchExpansion(acc.id, mod.id)}
                              title={`Launch ${mod.label} expansion deal (${formatCompactUsd(pot)})`}
                            >
                              <span>
                                {state === 'trial' ? 'Pilot' : 'White-Space'} · +{formatCompactUsd(pot)}
                              </span>
                              <Zap />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Expansion Signal Callout */}
                <div className="crm-account-signal">
                  <Sparkles className="crm-account-signal__ico" />
                  <span>{acc.expansionSignal}</span>
                </div>

                {/* Card Footer: Pod Owners + 1-Click Launch Expansion Deal */}
                <footer className="crm-account-card__foot">
                  <div className="crm-account-owners">
                    <Avatar user={owner} size={24} />
                    <span>AE: {owner.name.split(' ')[0]}</span>
                    <span>·</span>
                    <Avatar user={csm} size={24} />
                    <span>CSM: {csm.name.split(' ')[0]}</span>
                  </div>

                  {topModule && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => handleLaunchExpansion(acc.id, topModule.moduleId)}
                    >
                      <Rocket />
                      <span>
                        Launch Expansion Deal (+{formatCompactUsd(topModule.potentialArr)})
                      </span>
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
