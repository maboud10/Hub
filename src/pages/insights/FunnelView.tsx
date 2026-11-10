import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  FlaskConical,
  Rocket,
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
  Ring,
} from '@/components/neo';
import { ProjectSigil } from '@/projects/sigils';
import { computeFunnelMetrics } from '@/insights/engine';
import { SEGMENT_META } from '@/insights/seed';
import { useInsights } from '@/insights/store';
import { OwnerPill, SegmentFilterBar } from './shared';

export function FunnelView() {
  const activeSegment = useInsights((s) => s.activeSegment);
  const setActiveSegment = useInsights((s) => s.setActiveSegment);
  const funnelStages = useInsights((s) => s.funnelStages);
  const experiments = useInsights((s) => s.experiments);
  const shipExperimentWinner = useInsights((s) => s.shipExperimentWinner);

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const computedStages = useMemo(
    () => computeFunnelMetrics(funnelStages, activeSegment),
    [funnelStages, activeSegment],
  );

  const topStage = computedStages[0];
  const finalStage = computedStages[computedStages.length - 1];
  const endToEndRate = finalStage?.cumulativeConversionPct ?? 0;
  const totalPlusOneImpactK = computedStages.reduce((acc, s) => acc + s.plusOnePctArrImpactK, 0);
  const shippedCount = experiments.filter((e) => e.status === 'shipped').length;

  const visibleExperiments = useMemo(() => {
    if (!selectedStageId) return experiments;
    return experiments.filter((e) => e.targetStageId === selectedStageId);
  }, [experiments, selectedStageId]);

  return (
    <div className="ins-stack">
      <SegmentFilterBar
        value={activeSegment}
        onChange={setActiveSegment}
        rightSlot={
          selectedStageId ? (
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => setSelectedStageId(null)}
            >
              <Filter />
              <span>Show All Experiment Stages</span>
            </button>
          ) : null
        }
      />

      <NeoKpis label="Funnel & Experimentation Summary">
        <NeoKpi
          label="Top-of-Funnel Intent"
          value={topStage.volume.toLocaleString()}
          sub={SEGMENT_META[activeSegment].shortLabel}
          icon={<Users />}
          tone="cyan"
        />
        <NeoKpi
          label="Day-7 Team Activation"
          value={`${computedStages[2]?.conversionFromPrevPct ?? 64}%`}
          sub={`${computedStages[2]?.volume.toLocaleString()} active teams`}
          icon={<Sparkles />}
          tone="emerald"
        />
        <NeoKpi
          label="End-to-End Expansion Rate"
          value={`${endToEndRate}%`}
          sub={`${finalStage?.volume.toLocaleString()} multi-app orgs`}
          icon={<TrendingUp />}
          tone="indigo"
        />
        <NeoKpi
          label="+1% Stage Lift Value"
          value={`+$${(totalPlusOneImpactK / 1000).toFixed(2)}M`}
          sub="Annualized ARR sensitivity"
          icon={<DollarSign />}
          tone="emerald"
        />
        <NeoKpi
          label="Live Growth Experiments"
          value={`${experiments.length - shippedCount} Running`}
          sub={`${shippedCount} shipped to 100%`}
          icon={<FlaskConical />}
          tone="violet"
        />
      </NeoKpis>

      {/* 5-Stage Full-Lifecycle Growth Funnel */}
      <NeoPanel
        hud={`Full-Lifecycle Conversion Architecture · ${SEGMENT_META[activeSegment].label}`}
        title="5-Stage Growth Funnel & Bottleneck Telemetry"
        icon={<Filter />}
        actions={
          <Chip tone="cyan">
            Click any stage to filter A/B experiments
          </Chip>
        }
      >
        <div className="ins-funnel-list">
          {computedStages.map((st, idx) => {
            const isSelected = selectedStageId === st.id;
            const stageExps = experiments.filter((e) => e.targetStageId === st.id);
            const widthPct = Math.max(24, st.cumulativeConversionPct);

            return (
              <div
                key={st.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedStageId(isSelected ? null : st.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedStageId(isSelected ? null : st.id);
                  }
                }}
                className={`ins-funnel-stage neo-spot ${isSelected ? 'is-selected' : ''}`}
                data-qa={`ins-funnel-stage-${st.order}`}
              >
                <div className="ins-funnel-stage__left">
                  <span className="ins-stage-num">0{st.order}</span>
                  <ProjectSigil icon={st.sigil} color={st.color} size={36} />
                  <div className="ins-funnel-stage__info">
                    <div className="ins-funnel-stage__title-row">
                      <h3 className="ins-funnel-stage__name">{st.name}</h3>
                      {stageExps.length > 0 && (
                        <Chip tone="indigo" size="sm">
                          {stageExps.length} exp
                        </Chip>
                      )}
                    </div>
                    <p className="ins-funnel-stage__sub">{st.subtitle}</p>
                    <div className="ins-funnel-stage__bottleneck">
                      <span>Bottleneck diagnosis: {st.bottleneckDiagnosis}</span>
                    </div>
                  </div>
                </div>

                <div className="ins-funnel-stage__bar-col">
                  <div className="ins-funnel-bar-track">
                    <div
                      className="ins-funnel-bar-fill"
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, ${st.color}, color-mix(in oklab, ${st.color} 60%, #6366f1))`,
                      }}
                    />
                    <span className="ins-funnel-bar-label">
                      <b>{st.volume.toLocaleString()}</b> workspaces ({st.cumulativeConversionPct}% of top)
                    </span>
                  </div>
                  <div className="ins-funnel-stage__meta-row">
                    <span>
                      <Clock className="ins-inline-ico" /> Median time in stage: <b>{st.medianHours}h</b>
                    </span>
                    {idx > 0 && (
                      <span className="ins-dropoff">
                        Drop-off: -{st.dropOffPct}% ({st.dropOffCount.toLocaleString()} orgs)
                      </span>
                    )}
                    <OwnerPill userId={st.ownerId} />
                  </div>
                </div>

                <div className="ins-funnel-stage__right">
                  <div className="ins-funnel-conv">
                    <span className="neo-hud">{idx === 0 ? 'Entry Cohort' : 'Stage Conv.'}</span>
                    <b className="ins-funnel-conv__val" style={{ color: st.color }}>
                      {st.conversionFromPrevPct}%
                    </b>
                  </div>
                  <Chip tone="emerald" size="sm" title="Annualized ARR impact of +1% conversion at this stage">
                    +1% = +${st.plusOnePctArrImpactK}K ARR
                  </Chip>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* A/B Growth Experimentation Lab */}
      <NeoPanel
        hud="Bayesian & Frequentist Experimentation Engine"
        title="A/B Growth Experimentation Lab"
        icon={<FlaskConical />}
        actions={
          <Chip tone="emerald" icon={<Sparkles />}>
            1-Click Ship Winner Updates Live Funnel Conversion
          </Chip>
        }
      >
        <div className="ins-exp-grid">
          {visibleExperiments.map((exp) => {
            const targetStage = funnelStages.find((s) => s.id === exp.targetStageId);
            const isShipped = exp.status === 'shipped';

            return (
              <article key={exp.id} className={`ins-exp-card neo-spot ${isShipped ? 'is-shipped' : ''}`}>
                <div className="ins-exp-card__head">
                  <ProjectSigil icon={exp.sigil} color={exp.color} size={36} />
                  <div className="ins-exp-card__titles">
                    <div className="ins-exp-card__meta">
                      <span className="neo-hud">{exp.code}</span>
                      <Chip tone={isShipped ? 'emerald' : 'cyan'} size="sm">
                        {isShipped ? 'Shipped 100%' : 'Live Variant Test'}
                      </Chip>
                      {targetStage && (
                        <Chip tone="slate" size="sm">
                          Stage {targetStage.order}: {targetStage.name}
                        </Chip>
                      )}
                    </div>
                    <h3 className="ins-exp-card__title">{exp.title}</h3>
                  </div>
                  <Ring
                    value={exp.confidence}
                    size={54}
                    stroke={5}
                    color={exp.confidence >= 0.99 ? '#34d399' : '#38bdf8'}
                    label={`Statistical confidence ${(exp.confidence * 100).toFixed(1)}%`}
                  >
                    {(exp.confidence * 100).toFixed(1)}%
                  </Ring>
                </div>

                <p className="ins-exp-card__hyp">{exp.hypothesis}</p>

                <div className="ins-exp-bars">
                  <div className="ins-exp-bar-row">
                    <span>Control Baseline</span>
                    <b>{exp.controlRatePct.toFixed(1)}%</b>
                    <Bar value={exp.controlRatePct / 100} fill="#64748b" />
                  </div>
                  <div className="ins-exp-bar-row">
                    <span>Variant B (Treatment)</span>
                    <b className="ins-pos">{exp.variantRatePct.toFixed(1)}%</b>
                    <Bar value={exp.variantRatePct / 100} fill="#34d399" />
                  </div>
                </div>

                <div className="ins-exp-stats">
                  <div>
                    <span className="neo-hud">Relative Uplift</span>
                    <b className="ins-pos">+{exp.relativeUpliftPct}%</b>
                  </div>
                  <div>
                    <span className="neo-hud">Sample Size</span>
                    <b>n = {exp.sampleSize.toLocaleString()}</b>
                  </div>
                  <div>
                    <span className="neo-hud">Projected ARR Lift</span>
                    <b className="ins-pos">+${exp.arrLiftK.toLocaleString()}K</b>
                  </div>
                </div>

                <div className="ins-exp-card__foot">
                  <OwnerPill userId={exp.ownerId} prefix="Lead:" />
                  {isShipped ? (
                    <span className="ins-shipped-pill">
                      <CheckCircle2 /> Live at 100% Traffic
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => shipExperimentWinner(exp.id)}
                      data-qa={`ins-ship-${exp.id}`}
                    >
                      <Rocket />
                      <span>Ship Winner to 100%</span>
                      <ArrowRight />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
