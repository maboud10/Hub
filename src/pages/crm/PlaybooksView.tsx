import { useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  Play,
  Radar,
  Rocket,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  Ring,
} from '@/components/neo';
import { Switch } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { ProjectSigil } from '@/projects/sigils';
import { formatCompactUsd } from '@/crm/engine';
import { useCrm } from '@/crm/store';

export function PlaybooksView() {
  const playbooks = useCrm((s) => s.playbooks);
  const signals = useCrm((s) => s.signals);
  const togglePlaybook = useCrm((s) => s.togglePlaybook);
  const runPlaybook = useCrm((s) => s.runPlaybook);
  const launchAccountExpansion = useCrm((s) => s.launchAccountExpansion);
  const setSelectedDealId = useCrm((s) => s.setSelectedDealId);

  const stats = useMemo(() => {
    const activeCount = playbooks.filter((p) => p.enabled).length;
    const totalPipeline = playbooks.reduce((s, p) => s + p.pipelineGenerated, 0);
    const totalRuns = playbooks.reduce((s, p) => s + p.runsCount, 0);
    const avgIntent =
      signals.length > 0
        ? Math.round(signals.reduce((s, sig) => s + sig.intentScore, 0) / signals.length)
        : 93;
    return { activeCount, totalPipeline, totalRuns, avgIntent };
  }, [playbooks, signals]);

  return (
    <div className="crm-playbooks">
      <NeoKpis label="Autonomous Growth Loops KPIs">
        <NeoKpi
          label="Armed Growth Playbooks"
          value={`${stats.activeCount} / ${playbooks.length}`}
          sub="24/7 autonomous telemetry triggers"
          tone="orange"
        />
        <NeoKpi
          label="Playbook Pipeline Generated"
          value={formatCompactUsd(stats.totalPipeline)}
          sub="Attributed expansion & fast-track ACV"
          tone="emerald"
        />
        <NeoKpi
          label="Autonomous Executions"
          value={stats.totalRuns.toLocaleString()}
          sub="Zero-touch multi-thread & trust rooms"
          tone="cyan"
        />
        <NeoKpi
          label="Dark-Funnel Intent Score"
          value={`${stats.avgIntent}%`}
          sub={`${signals.length} high-intent account surges`}
          tone="pink"
        />
      </NeoKpis>

      <NeoHome
        main={
          <NeoPanel
            hud="Zero-Touch Revenue Loops"
            title="Automated Growth Playbooks"
            icon={<Workflow />}
            actions={
              <Chip tone="emerald" size="sm">
                {stats.activeCount} Active Loops
              </Chip>
            }
          >
            <div className="crm-pb-list">
              {playbooks.map((pb) => (
                <article
                  key={pb.id}
                  className={pb.enabled ? 'crm-pb-card is-enabled neo-spot' : 'crm-pb-card neo-spot'}
                >
                  <div className="crm-pb-card__head">
                    <ProjectSigil icon={pb.sigil} color={pb.color} size={38} />
                    <div className="grow">
                      <div className="crm-pb-card__badges">
                        <Chip tone="orange" size="sm">{pb.conversionUplift}</Chip>
                        <Chip tone="slate" size="sm">Region: {pb.targetRegion}</Chip>
                      </div>
                      <h3 className="crm-pb-card__title">{pb.title}</h3>
                    </div>
                    <Switch
                      checked={pb.enabled}
                      onChange={() => togglePlaybook(pb.id)}
                      label={`Toggle ${pb.title}`}
                    />
                  </div>

                  <div className="crm-pb-card__body">
                    <div className="crm-pb-step">
                      <span className="neo-hud">WHEN TELEMETRY DETECTS</span>
                      <p>{pb.trigger}</p>
                    </div>
                    <div className="crm-pb-step">
                      <span className="neo-hud">AUTONOMOUS NOVA ACTION</span>
                      <p>{pb.actionSummary}</p>
                    </div>
                  </div>

                  <footer className="crm-pb-card__foot">
                    <div className="crm-pb-metrics">
                      <div>
                        <span className="neo-hud">Pipeline Attributed</span>
                        <strong>{formatCompactUsd(pb.pipelineGenerated)}</strong>
                      </div>
                      <div>
                        <span className="neo-hud">Executions</span>
                        <strong>{pb.runsCount} runs</strong>
                      </div>
                      <div>
                        <span className="neo-hud">Last Fired</span>
                        <span>{relativeTime(pb.lastRunAt)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => runPlaybook(pb.id)}
                    >
                      <Play />
                      <span>Run Playbook Now</span>
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          </NeoPanel>
        }
        side={
          <NeoPanel
            hud="Real-Time Telemetry Surges"
            title="Live Buying Intent Signal Stream"
            icon={<Radar />}
            actions={
              <Chip tone="cyan" size="sm" icon={<Activity />}>
                Live Feed
              </Chip>
            }
          >
            <div className="crm-signal-stream">
              {signals.map((sig) => (
                <article key={sig.id} className="crm-signal-card neo-spot">
                  <div className="crm-signal-card__head">
                    <ProjectSigil icon={sig.sigil} color={sig.color} size={32} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="crm-signal-card__acc">{sig.accountName}</div>
                      <div className="crm-signal-card__meta">
                        <Chip tone="slate" size="sm">{sig.region}</Chip>
                        <span>·</span>
                        <span>{relativeTime(sig.ts)}</span>
                      </div>
                    </div>
                    <Ring
                      value={sig.intentScore / 100}
                      size={40}
                      stroke={4}
                      color={sig.intentScore >= 92 ? '#34d399' : '#fb923c'}
                    >
                      {sig.intentScore}
                    </Ring>
                  </div>

                  <h4 className="crm-signal-card__title">{sig.title}</h4>
                  <p className="crm-signal-card__detail">{sig.detail}</p>

                  <div className="crm-signal-card__foot">
                    <button
                      type="button"
                      className={sig.actioned ? 'neo-btn neo-btn--soft neo-btn--sm' : 'neo-btn neo-btn--plasma neo-btn--sm'}
                      onClick={() => runPlaybook(sig.matchedPlaybookId)}
                    >
                      {sig.actioned ? <CheckCircle2 /> : <Zap />}
                      <span>{sig.actioned ? 'Playbook Triggered' : 'Trigger Matched Playbook'}</span>
                    </button>
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => {
                        const deal = launchAccountExpansion(sig.accountId);
                        if (deal) setSelectedDealId(deal.id);
                      }}
                    >
                      <Rocket />
                      <span>Expand</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </NeoPanel>
        }
      />
    </div>
  );
}
