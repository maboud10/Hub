import { useMemo } from 'react';
import {
  Activity,
  Award,
  DollarSign,
  Grid,
  Layers,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTabs,
  type NeoTabItem,
} from '@/components/neo';
import { ProjectSigil } from '@/projects/sigils';
import { computeCohortSummary, getSegmentAdjustedCohorts } from '@/insights/engine';
import { SEGMENT_META } from '@/insights/seed';
import { useInsights } from '@/insights/store';
import type { CohortMode } from '@/insights/types';
import { OwnerPill, SegmentFilterBar } from './shared';

const COHORT_MODE_TABS: NeoTabItem<CohortMode>[] = [
  { value: 'ndr', label: 'Net Dollar Retention (NDR %)', icon: <DollarSign /> },
  { value: 'logo', label: 'Logo Retention (%)', icon: <Users /> },
];

const QUARTER_COLS = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'];

function cellStyleFor(val: number | null, mode: CohortMode): React.CSSProperties {
  if (val === null) return {};
  if (mode === 'ndr') {
    if (val >= 138) {
      return {
        background: 'linear-gradient(135deg, rgb(52 211 153 / 0.34), rgb(56 189 248 / 0.28))',
        color: '#6ee7b7',
        borderColor: 'rgb(52 211 153 / 0.5)',
      };
    }
    if (val >= 124) {
      return {
        background: 'linear-gradient(135deg, rgb(52 211 153 / 0.24), rgb(56 189 248 / 0.2))',
        color: '#34d399',
        borderColor: 'rgb(52 211 153 / 0.36)',
      };
    }
    if (val >= 110) {
      return {
        background: 'rgb(56 189 248 / 0.18)',
        color: '#38bdf8',
        borderColor: 'rgb(56 189 248 / 0.32)',
      };
    }
    return {
      background: 'rgb(99 102 241 / 0.14)',
      color: 'var(--text)',
      borderColor: 'rgb(99 102 241 / 0.26)',
    };
  }

  // Logo retention mode
  if (val >= 96) {
    return {
      background: 'rgb(56 189 248 / 0.24)',
      color: '#38bdf8',
      borderColor: 'rgb(56 189 248 / 0.4)',
    };
  }
  if (val >= 92) {
    return {
      background: 'rgb(99 102 241 / 0.2)',
      color: '#a5b4fc',
      borderColor: 'rgb(99 102 241 / 0.34)',
    };
  }
  return {
    background: 'rgb(148 163 184 / 0.14)',
    color: 'var(--text-2)',
    borderColor: 'var(--border-2)',
  };
}

export function CohortsView() {
  const activeSegment = useInsights((s) => s.activeSegment);
  const setActiveSegment = useInsights((s) => s.setActiveSegment);
  const cohortMode = useInsights((s) => s.cohortMode);
  const setCohortMode = useInsights((s) => s.setCohortMode);
  const cohorts = useInsights((s) => s.cohorts);
  const causalDrivers = useInsights((s) => s.causalDrivers);

  const adjustedCohorts = useMemo(
    () => getSegmentAdjustedCohorts(cohorts, activeSegment),
    [cohorts, activeSegment],
  );

  const summary = useMemo(
    () => computeCohortSummary(cohorts, cohortMode, activeSegment),
    [cohorts, cohortMode, activeSegment],
  );

  const sortedDrivers = useMemo(() => {
    return [...causalDrivers].sort((a, b) => b.causalLiftPct - a.causalLiftPct);
  }, [causalDrivers]);

  return (
    <div className="ins-stack">
      <SegmentFilterBar
        value={activeSegment}
        onChange={setActiveSegment}
        rightSlot={
          <NeoTabs
            value={cohortMode}
            onChange={setCohortMode}
            items={COHORT_MODE_TABS}
            label="Cohort metric mode"
          />
        }
      />

      <NeoKpis label="Cohort Retention Summary">
        <NeoKpi
          label="Q1 Cohort Average"
          value={`${summary.q1Average}%`}
          sub={cohortMode === 'ndr' ? 'Immediate Quarter-1 expansion' : 'Quarter-1 logo stability'}
          icon={<Activity />}
          tone="cyan"
        />
        <NeoKpi
          label="Year-1 (Q4) Average"
          value={`${summary.q4Average}%`}
          sub={SEGMENT_META[activeSegment].shortLabel}
          icon={<TrendingUp />}
          tone="emerald"
        />
        <NeoKpi
          label="Peak Cohort Expansion"
          value={`${summary.peakRetentionPct}%`}
          sub={cohortMode === 'ndr' ? 'Multi-app compound expansion' : 'Best cohort retention'}
          icon={<Award />}
          tone="emerald"
        />
        <NeoKpi
          label="Tracked Cohort Logos"
          value={summary.totalLogos.toLocaleString()}
          sub="Across 8 quarterly cohorts"
          icon={<Users />}
          tone="indigo"
        />
        <NeoKpi
          label="Cohort Starting ARR"
          value={`$${summary.totalStartingArrM.toFixed(1)}M`}
          sub="Base vintage ARR"
          icon={<Layers />}
          tone="violet"
        />
      </NeoKpis>

      {/* 8-Quarter Retention Heatmap */}
      <NeoPanel
        hud={`8-Quarter Vintage Matrix · ${SEGMENT_META[activeSegment].label}`}
        title={
          cohortMode === 'ndr'
            ? 'Net Dollar Retention (NDR %) Expansion Heatmap'
            : 'Customer Logo Retention (%) Heatmap'
        }
        icon={<Grid />}
        actions={
          <Chip tone="emerald" icon={<Sparkles />}>
            {cohortMode === 'ndr'
              ? 'Cohorts compound from 100% → 108% → 118% → 127% → 138%+'
              : 'Enterprise & MENA logo retention holds >92% at Quarter 7'}
          </Chip>
        }
      >
        <div className="ins-heatmap-wrap">
          <table className="ins-heatmap" aria-label="Quarterly Cohort Retention Heatmap">
            <thead>
              <tr>
                <th>Cohort Vintage</th>
                <th>Orgs</th>
                <th>Start ARR</th>
                {QUARTER_COLS.map((q) => (
                  <th key={q} className="ins-heatmap__qcol">
                    {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adjustedCohorts.map((row) => {
                const series = cohortMode === 'ndr' ? row.ndrByQuarter : row.logoByQuarter;
                return (
                  <tr key={row.id}>
                    <td className="ins-heatmap__cohort">
                      <ProjectSigil
                        icon={row.segment === 'mena' ? 'globe' : row.segment === 'enterprise' ? 'shield-key' : 'chart'}
                        color={row.segment === 'mena' ? '#38bdf8' : row.segment === 'enterprise' ? '#818cf8' : '#34d399'}
                        size={24}
                      />
                      <b>{row.quarter}</b>
                    </td>
                    <td className="ins-heatmap__meta">{row.startingLogoCount}</td>
                    <td className="ins-heatmap__meta">${row.startingArrM.toFixed(1)}M</td>
                    {QUARTER_COLS.map((q, qIdx) => {
                      const val = series[qIdx] ?? null;
                      return (
                        <td key={q} className="ins-heatmap__cell-wrap">
                          {val !== null ? (
                            <span
                              className="ins-heatmap__cell"
                              style={cellStyleFor(val, cohortMode)}
                              data-qa={`ins-cohort-${row.quarter.replace(/\s+/g, '')}-${q}`}
                            >
                              {val}%
                            </span>
                          ) : (
                            <span className="ins-heatmap__empty">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </NeoPanel>

      {/* Causal Feature Correlation Matrix */}
      <NeoPanel
        hud={`Propensity-Matched Causal Inference · ${SEGMENT_META[activeSegment].label}`}
        title="Causal Feature Correlation Matrix (90-Day Retention Lift)"
        icon={<Sparkles />}
        actions={
          <Chip tone="cyan">
            AIPW Causal Estimator · n = 2,840 Workspaces
          </Chip>
        }
      >
        <div className="ins-causal-grid">
          {sortedDrivers.map((drv) => {
            const segAdoption = drv.adoptionPct[activeSegment];
            return (
              <article key={drv.id} className="ins-causal-card neo-spot">
                <div className="ins-causal-card__head">
                  <ProjectSigil icon={drv.sigil} color={drv.color} size={36} />
                  <div className="ins-causal-card__titles">
                    <div className="ins-causal-card__badges">
                      <Chip tone="slate" size="sm">
                        {drv.appBadge}
                      </Chip>
                      <Chip tone="emerald" size="sm">
                        +{drv.causalLiftPct}% lift
                      </Chip>
                      <Chip tone="cyan" size="sm">
                        r = {drv.pearsonR.toFixed(2)}
                      </Chip>
                    </div>
                    <h3 className="ins-causal-card__name">{drv.featureName}</h3>
                  </div>
                </div>

                <p className="ins-causal-card__habit">
                  <b>Activation Habit Threshold:</b> {drv.thresholdHabit}
                </p>

                <div className="ins-causal-bars">
                  <div className="ins-causal-bar-row">
                    <span>90-Day Retention (Adopted Habit)</span>
                    <b className="ins-pos">{drv.retention90dWithPct}%</b>
                    <Bar value={drv.retention90dWithPct / 100} fill="#34d399" />
                  </div>
                  <div className="ins-causal-bar-row">
                    <span>90-Day Retention (Not Adopted)</span>
                    <b>{drv.retention90dWithoutPct}%</b>
                    <Bar value={drv.retention90dWithoutPct / 100} fill="#64748b" />
                  </div>
                </div>

                <div className="ins-causal-card__foot">
                  <OwnerPill userId={drv.ownerId} prefix="Owner:" />
                  <span className="neo-hud">
                    {SEGMENT_META[activeSegment].shortLabel} Adoption: <b>{segAdoption}%</b>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
