/**
 * DevHub ("Forge") — PipelinesView (/devhub/pipelines)
 * 5-stage CI/CD pipeline NeoTracker, live terminal log inspector,
 * remote cache & runner cost telemetry, and Flaky Test Quarantine radar.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Activity,
  Bug,
  CheckCircle2,
  Cpu,
  DollarSign,
  FolderKanban,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Timer,
  XCircle,
} from 'lucide-react';
import {
  Chip,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTabs,
  NeoTracker,
  Orb,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { useDevHubAccess } from '@/devhub/access';
import {
  durParts,
  flakeReport,
  liveRun,
  pipelineKpis,
} from '@/devhub/engine';
import type { PipelineStage } from '@/devhub/types';
import { useDevHub } from '@/devhub/store';
import { RelTime, UserPill, createProjectTaskFromDevhub } from './parts';

type RunFilter = 'all' | 'running' | 'failed' | 'success';

const STAGE_LABELS: Record<PipelineStage, string> = {
  build: 'Build',
  test: 'Test Suite',
  scan: 'Security Scan',
  package: 'OCI Package',
  deploy: 'Rollout',
};

export function PipelinesView() {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const caps = useDevHubAccess();
  const now = useNow(5_000);
  const [params, setParams] = useSearchParams();

  const runs = useDevHub((s) => s.runs);
  const flaky = useDevHub((s) => s.flaky);
  const triggerRun = useDevHub((s) => s.triggerRun);
  const retryRun = useDevHub((s) => s.retryRun);
  const cancelRun = useDevHub((s) => s.cancelRun);
  const toggleQuarantine = useDevHub((s) => s.toggleQuarantine);

  const [filter, setFilter] = useState<RunFilter>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const projectedRuns = useMemo(() => runs.map((r) => liveRun(r, now)), [runs, now]);
  const kpis = useMemo(() => pipelineKpis(projectedRuns.map((p) => p.run)), [projectedRuns]);

  const filtered = useMemo(() => {
    return projectedRuns.filter(({ run }) => {
      if (filter === 'running') return run.status === 'running' || run.status === 'queued';
      if (filter === 'failed') return run.status === 'failed';
      if (filter === 'success') return run.status === 'success';
      return true;
    });
  }, [projectedRuns, filter]);

  const selectedRunId = params.get('run') ?? filtered[0]?.run.id ?? projectedRuns[0]?.run.id;
  const activeProjected =
    projectedRuns.find((p) => p.run.id === selectedRunId) ?? filtered[0] ?? projectedRuns[0];
  const run = activeProjected?.run;

  const selectRun = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('run', id);
    setParams(next, { replace: true });
    setSelectedJobId(null);
  };

  if (!run) return null;

  const activeJob =
    run.jobs.find((j) => j.id === selectedJobId) ??
    run.jobs.find((j) => j.status === 'failed' || j.status === 'running') ??
    run.jobs[0];

  const failedIndex = run.jobs.findIndex((j) => j.status === 'failed');
  const runningIndex = run.jobs.findIndex((j) => j.status === 'running');
  const trackerCurrent =
    run.status === 'success'
      ? run.jobs.length
      : failedIndex >= 0
        ? failedIndex
        : runningIndex >= 0
          ? runningIndex
          : 0;
  const trackerState =
    run.status === 'success'
      ? 'done'
      : run.status === 'failed'
        ? 'blocked'
        : run.status === 'canceled'
          ? 'paused'
          : 'active';

  const dur = durParts(activeProjected.elapsedSec);

  return (
    <div className="dh-stack">
      <NeoKpis label="CI/CD pipeline performance">
        <NeoKpi
          label="Pass rate"
          value={`${Math.round(kpis.successRate * 100)}%`}
          sub={`${kpis.failed} failed · ${kpis.running} running`}
          icon={<CheckCircle2 />}
          tone={kpis.failed > 0 ? 'warning' : 'success'}
        />
        <NeoKpi
          label="Median duration"
          value={`${kpis.medianMins}m`}
          sub="5-stage SLSA L3 pipeline"
          icon={<Timer />}
          tone="app"
        />
        <NeoKpi
          label="Remote cache hit"
          value={`${kpis.cacheHitPct}%`}
          sub="Bazel / Turbo shared cache"
          icon={<Cpu />}
          tone="success"
        />
        <NeoKpi
          label="Avg runner cost"
          value={`$${kpis.costPerRun.toFixed(2)}`}
          sub="Ephemeral arm64/amd64 runners"
          icon={<DollarSign />}
          tone="cyan"
        />
      </NeoKpis>

      <div className="dh-toolbar-row">
        <NeoTabs<RunFilter>
          label="Filter pipeline runs"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All runs', count: projectedRuns.length },
            { value: 'running', label: 'Running', count: kpis.running },
            { value: 'failed', label: 'Failed', count: kpis.failed },
            { value: 'success', label: 'Succeeded', count: projectedRuns.filter((p) => p.run.status === 'success').length },
          ]}
        />

        {caps.canMerge && (
          <button
            type="button"
            className="neo-btn neo-btn--plasma neo-btn--sm"
            onClick={() => {
              const created = triggerRun(run.service, run.branch, userId, run.prId);
              selectRun(created.id);
            }}
          >
            <Play />
            <span>Trigger Pipeline</span>
          </button>
        )}
      </div>

      <div className="dh-split">
        <aside className="dh-split__list" aria-label="Pipeline runs list">
          {filtered.map(({ run: r }) => {
            const active = r.id === run.id;
            return (
              <button
                key={r.id}
                type="button"
                className="dh-list-card neo-spot"
                data-active={active || undefined}
                onClick={() => selectRun(r.id)}
              >
                <div className="dh-list-card__top">
                  <Orb
                    tone={
                      r.status === 'success'
                        ? 'success'
                        : r.status === 'failed'
                          ? 'danger'
                          : r.status === 'running'
                            ? 'warning'
                            : 'slate'
                    }
                    pulse={r.status === 'running'}
                    size={8}
                  />
                  <span className="neo-mono dh-pr-num">{`#${r.number}`}</span>
                  <span className="dh-list-card__title">{r.message}</span>
                </div>
                <div className="dh-list-card__meta">
                  <span className="neo-mono">{r.service}</span>
                  <span>·</span>
                  <span className="neo-mono">{r.branch}</span>
                  <span>·</span>
                  <RelTime at={r.startedAt} now={now} />
                </div>
              </button>
            );
          })}
        </aside>

        <div className="dh-split__detail dh-stack">
          <NeoPanel
            hud={`${run.service} · ${run.branch} (${run.sha})`}
            title={`Run #${run.number} · ${run.message}`}
            icon={<Activity />}
            actions={
              <div className="dh-inline-actions">
                {run.prId && (
                  <Link to={`/devhub/reviews?pr=${run.prId}`} className="neo-btn neo-btn--ghost neo-btn--xs">
                    <span>Open PR</span>
                  </Link>
                )}
                {run.status === 'failed' && caps.canMerge && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => {
                      const next = retryRun(run.id, userId);
                      if (next) selectRun(next.id);
                    }}
                  >
                    <RotateCcw />
                    <span>Retry Failed Run</span>
                  </button>
                )}
                {run.status === 'running' && caps.canMerge && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--danger neo-btn--xs"
                    onClick={() => cancelRun(run.id, userId)}
                  >
                    <XCircle />
                    <span>Cancel Run</span>
                  </button>
                )}
              </div>
            }
          >
            <div className="dh-pr-meta-bar">
              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Triggered by</span>
                <UserPill userId={run.authorId} size={20} />
              </div>
              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Trigger</span>
                <Chip tone="slate" size="sm">
                  <span>{run.trigger.replace('_', ' ')}</span>
                </Chip>
              </div>
              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Duration</span>
                <span className="neo-mono">{`${dur.m}m ${dur.s}s`}</span>
              </div>
              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Cache hit</span>
                <span className="neo-mono">{`${run.cacheHitPct}%`}</span>
              </div>
              <div className="dh-pr-meta-bar__group">
                <span className="neo-hud">Runner cost</span>
                <span className="neo-mono">{`$${run.costUsd.toFixed(2)}`}</span>
              </div>
            </div>

            <NeoTracker
              bare
              hud="5-Stage CI/CD Execution Graph"
              steps={run.jobs.map((j) => ({
                id: j.id,
                label: STAGE_LABELS[j.stage],
                sub: j.name,
                at: `${j.durationSec}s`,
              }))}
              current={trackerCurrent}
              state={trackerState}
              progress={activeProjected.progress}
            />

            {/* Stage Selector Pills */}
            <div className="dh-stage-grid" role="tablist" aria-label="Pipeline jobs">
              {run.jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  role="tab"
                  aria-selected={activeJob?.id === job.id}
                  className="dh-stage-card neo-spot"
                  data-active={activeJob?.id === job.id || undefined}
                  data-status={job.status}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <div className="dh-stage-card__top">
                    <Orb
                      tone={
                        job.status === 'success'
                          ? 'success'
                          : job.status === 'failed'
                            ? 'danger'
                            : job.status === 'running'
                              ? 'warning'
                              : 'slate'
                      }
                      pulse={job.status === 'running'}
                      size={7}
                    />
                    <span className="dh-stage-card__stage">{STAGE_LABELS[job.stage]}</span>
                    <span className="neo-mono dh-stage-card__dur">{`${job.durationSec}s`}</span>
                  </div>
                  <div className="dh-stage-card__name neo-mono">{job.name}</div>
                </button>
              ))}
            </div>

            {/* Terminal Log Output */}
            {activeJob && (
              <div className="dh-terminal" dir="ltr">
                <header className="dh-terminal__head">
                  <Terminal />
                  <span className="neo-mono">{`${run.service} › ${activeJob.name}`}</span>
                  {activeJob.cacheHit && (
                    <Chip tone="success" size="sm">
                      <span>Cache hit</span>
                    </Chip>
                  )}
                </header>
                <div className="dh-terminal__body neo-mono">
                  {activeJob.log.map((line, idx) => (
                    <div key={idx} className="dh-terminal__line" data-level={line.level}>
                      <span className="dh-terminal__ts">{`+${line.t}s`}</span>
                      <span className="dh-terminal__text">{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </NeoPanel>

          {/* Flaky Test Quarantine Radar */}
          <NeoPanel
            hud="Test Reliability Radar"
            title="Flaky Test Detection & Quarantine"
            icon={<Bug />}
          >
            <div className="dh-list">
              {flaky.map((test) => {
                const rep = flakeReport(test);
                return (
                  <div key={test.id} className="dh-pr-row">
                    <div className="dh-pr-row__main">
                      <div className="dh-pr-row__top">
                        <span className="neo-mono dh-pr-row__title">{test.name}</span>
                        <Chip tone={test.quarantined ? 'violet' : 'warning'} size="sm">
                          <span>{test.quarantined ? 'Quarantined' : `Flake ${Math.round(rep.rate * 100)}%`}</span>
                        </Chip>
                      </div>
                      <div className="dh-pr-row__meta">
                        <span className="neo-mono">{test.service}</span>
                        <span>·</span>
                        <span className="neo-mono">{test.file}</span>
                        <span>·</span>
                        <UserPill userId={test.ownerId} size={16} />
                        <span>·</span>
                        <span className="dh-flake-dots neo-mono" dir="ltr" title="P = Pass, R = Retry flake, F = Hard fail">
                          {[...test.history].map((ch, i) => (
                            <i key={i} data-c={ch}>
                              {ch}
                            </i>
                          ))}
                        </span>
                      </div>
                    </div>
                    <div className="dh-pr-row__actions">
                      {caps.canMerge && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--soft neo-btn--xs"
                          onClick={() => toggleQuarantine(test.id, userId)}
                        >
                          <ShieldCheck />
                          <span>{test.quarantined ? 'Unquarantine' : 'Quarantine Flake'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() =>
                          void createProjectTaskFromDevhub({
                            title: `Deflake ${test.name} in ${test.service}`,
                            notes: `File: ${test.file} (flake rate ${Math.round(rep.rate * 100)}%)`,
                            to: '/devhub/pipelines',
                            label: 'Flaky Test Radar',
                            assigneeId: test.ownerId,
                          })
                        }
                      >
                        <FolderKanban />
                        <span>Task in Projects</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </NeoPanel>
        </div>
      </div>
    </div>
  );
}
