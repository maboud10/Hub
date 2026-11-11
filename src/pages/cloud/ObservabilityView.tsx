/**
 * Stratos · Cloud Console — Observability, Logs, Distributed Traces & Alerts view.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Activity,
  Bell,
  BellOff,
  BookOpen,
  CheckCircle2,
  GitBranch,
  RotateCcw,
  Siren,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  type NeoTabItem,
} from '@/components/neo';
import { useCloudCapabilities } from '@/cloud/access';
import {
  buildLogs,
  buildTraces,
  computeLiveAlerts,
  isStoryDegraded,
} from '@/cloud/engine';
import { ALERT_RULES, RUNBOOK_TO, SERVICES } from '@/cloud/seed';
import { useCloud } from '@/cloud/store';
import type { LogLevel, ServiceId } from '@/cloud/types';
import { RegionBadge } from './parts';

export function ObservabilityView() {
  const [params, setParams] = useSearchParams();
  const caps = useCloudCapabilities();
  const data = useCloud();
  const degraded = isStoryDegraded(data.story);

  const [svcFilter, setSvcFilter] = useState<'all' | ServiceId>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all');
  const [logQuery, setLogQuery] = useState('');

  const traces = buildTraces(data.story);
  const paramTrace = params.get('trace');
  const [selectedTraceId, setSelectedTraceId] = useState<string>(
    paramTrace && traces.some((t) => t.id === paramTrace) ? paramTrace : traces[0].id,
  );

  useEffect(() => {
    if (paramTrace && traces.some((t) => t.id === paramTrace)) {
      setSelectedTraceId(paramTrace);
    }
  }, [paramTrace, traces]);

  const selectTrace = (id: string) => {
    setSelectedTraceId(id);
    const next = new URLSearchParams(params);
    next.set('trace', id);
    setParams(next, { replace: true });
  };

  const activeTrace = traces.find((t) => t.id === selectedTraceId) ?? traces[0];
  const logs = buildLogs(data.story, Date.now(), {
    service: svcFilter,
    level: levelFilter,
    query: logQuery,
  });
  const liveAlerts = computeLiveAlerts(data, data.story);

  const levelTabs: NeoTabItem<'all' | LogLevel>[] = [
    { value: 'all', label: 'All levels' },
    { value: 'error', label: 'Errors' },
    { value: 'warn', label: 'Warnings' },
    { value: 'info', label: 'Info' },
  ];

  return (
    <div className="cloud-observability">
      <NeoBanners>
        <NeoBanner
          tone={degraded ? 'warning' : 'emerald'}
          icon={<Sparkles />}
          title={
            degraded
              ? 'Nova Root-Cause Correlation · 96% confidence on payments-svc eu-west-2'
              : 'Nova Root-Cause Correlation · payments-svc regression resolved'
          }
          meta={degraded ? 'Trace tr-pay-820 · 742ms seq scan on ledger_entries' : 'p95 238ms · Index scan active'}
          action={
            <div className="cloud-panel-actions">
              <Link to="/devhub/deploys" className="neo-btn neo-btn--xs neo-btn--soft">
                <GitBranch />
                <span>DevHub v2.41.0</span>
              </Link>
              <Link to="/incidents" className="neo-btn neo-btn--xs neo-btn--soft">
                <Siren />
                <span>INC-2047</span>
              </Link>
              {degraded && caps.canManageInfra && (
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--plasma"
                  onClick={() => data.recoverStory()}
                >
                  <RotateCcw />
                  <span>Roll back v2.41.0</span>
                </button>
              )}
            </div>
          }
        >
          <span>
            {degraded
              ? 'Latency spike began 4m after v2.41.0 shipped to eu-west-2. Span sp-4 isolates 90% of latency to a sequential scan on payments-pg.'
              : 'Rollback to v2.40.9 eliminated connection pool contention in eu-west-2.'}
          </span>
        </NeoBanner>
      </NeoBanners>

      <div className="cloud-obs-grid">
        {/* Left: Firing Alerts & Rules */}
        <NeoPanel
          hud="PagerDuty & Slack routing · Multi-window burn"
          title="Firing Alerts & Rules"
          icon={<Bell />}
          actions={
            <Link to={RUNBOOK_TO} className="neo-btn neo-btn--xs neo-btn--soft">
              <BookOpen />
              <span>Incident runbook</span>
            </Link>
          }
        >
          <div className="cloud-alert-list">
            {liveAlerts.map((al) => {
              const st = data.alerts[al.id];
              return (
                <div key={al.id} className="cloud-alert-row" data-qa={`obs-alert-${al.id}`}>
                  <div className="cloud-alert-row__main">
                    <div className="cloud-alert-row__top">
                      <Chip tone={al.rule.severity === 'critical' ? 'rose' : 'amber'} size="sm">
                        {al.rule.severity === 'critical' ? 'Critical' : 'Warning'}
                      </Chip>
                      <strong>{al.rule.name}</strong>
                      <span className="neo-mono cloud-text-warn" data-no-translate="true">
                        {al.value}
                      </span>
                      {al.region && <RegionBadge regionId={al.region} />}
                    </div>
                    <code className="cloud-alert-row__expr neo-mono" data-no-translate="true">
                      {al.rule.expr}
                    </code>
                  </div>

                  {caps.canManageAlerts && (
                    <div className="cloud-alert-row__actions">
                      {st?.status === 'acknowledged' ? (
                        <Chip tone="emerald" size="sm" icon={<CheckCircle2 />}>
                          Acknowledged
                        </Chip>
                      ) : st?.status === 'silenced' ? (
                        <Chip tone="slate" size="sm" icon={<BellOff />}>
                          Silenced
                        </Chip>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--soft"
                            onClick={() => data.acknowledgeAlert(al.id)}
                          >
                            <span>Acknowledge</span>
                          </button>
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--ghost"
                            onClick={() => data.silenceAlert(al.id, 60)}
                          >
                            <BellOff />
                            <span>Silence 1h</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="neo-btn neo-btn--xs neo-btn--danger"
                        onClick={() =>
                          data.escalateToIncident({
                            title: al.rule.name,
                            severity: al.rule.severity === 'critical' ? 'SEV2' : 'SEV3',
                            services: al.rule.service ? [al.rule.service] : ['hub-web'],
                            alertId: al.id,
                          })
                        }
                      >
                        <Siren />
                        <span>Page on-call</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="cloud-subhead">
            <Zap />
            <span>Configured Prometheus / OpenTelemetry rules</span>
          </div>
          <div className="cloud-rules-compact">
            {ALERT_RULES.slice(0, 6).map((rule) => {
              const enabled = data.rules[rule.id] ?? true;
              return (
                <div key={rule.id} className="cloud-rule-pill">
                  <div>
                    <strong>{rule.name}</strong>
                    <span className="neo-mono" data-no-translate="true">
                      {rule.channel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`neo-btn neo-btn--xs ${enabled ? 'neo-btn--soft' : 'neo-btn--ghost'}`}
                    onClick={() => data.toggleAlertRule(rule.id)}
                    disabled={!caps.canManageAlerts}
                  >
                    <span>{enabled ? 'Enabled' : 'Muted'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </NeoPanel>

        {/* Right: Distributed Trace Waterfall */}
        <NeoPanel
          hud="OpenTelemetry · Span waterfall"
          title="Distributed Trace Inspector"
          icon={<Activity />}
        >
          <div className="cloud-trace-tabs" role="tablist" aria-label="Sampled traces">
            {traces.map((tr) => {
              const active = tr.id === activeTrace.id;
              return (
                <button
                  key={tr.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`cloud-trace-tab neo-spot ${active ? 'is-active' : ''}`}
                  onClick={() => selectTrace(tr.id)}
                  data-qa={`trace-tab-${tr.id}`}
                >
                  <div className="cloud-trace-tab__top">
                    <span className="neo-mono" data-no-translate="true">
                      {tr.id}
                    </span>
                    <Chip
                      tone={tr.status === 'error' ? 'rose' : tr.status === 'slow' ? 'amber' : 'emerald'}
                      size="sm"
                    >
                      <span className="neo-mono" data-no-translate="true">
                        {tr.durMs}ms
                      </span>
                    </Chip>
                  </div>
                  <div className="cloud-trace-tab__sub neo-mono" data-no-translate="true">
                    {tr.service} · {tr.root}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="cloud-waterfall">
            <div className="cloud-waterfall__head">
              <span className="neo-mono" data-no-translate="true">
                {activeTrace.root} ({activeTrace.durMs}ms total)
              </span>
              <RegionBadge regionId={activeTrace.region} />
            </div>

            {activeTrace.spans.map((sp) => {
              const total = Math.max(1, activeTrace.durMs);
              const leftPct = Math.min(92, Math.round((sp.start / total) * 100));
              const widthPct = Math.max(4, Math.min(100 - leftPct, Math.round((sp.dur / total) * 100)));
              return (
                <div key={sp.id} className={`cloud-span-row is-${sp.status}`}>
                  <div className="cloud-span-row__meta">
                    <span className="cloud-span-row__svc neo-mono" data-no-translate="true">
                      {sp.service}
                    </span>
                    <span className="cloud-span-row__op neo-mono" data-no-translate="true">
                      {sp.op}
                    </span>
                  </div>
                  <div className="cloud-span-row__track">
                    <div
                      className={`cloud-span-row__bar is-${sp.status}`}
                      style={{ insetInlineStart: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                  </div>
                  <div className="cloud-span-row__dur neo-mono" data-no-translate="true">
                    {sp.dur}ms
                  </div>
                  {sp.note && <div className="cloud-span-row__note">{sp.note}</div>}
                </div>
              );
            })}
          </div>
        </NeoPanel>
      </div>

      {/* Bottom: Structured Log Stream */}
      <NeoPanel
        hud="Live structured logs · Trace-correlated"
        title="Log Explorer"
        icon={<Terminal />}
        actions={
          <div className="cloud-panel-actions">
            <select
              className="neo-input neo-input--sm"
              value={svcFilter}
              onChange={(e) => setSvcFilter(e.target.value as 'all' | ServiceId)}
              aria-label="Filter logs by service"
            >
              <option value="all">All services</option>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
            <NeoTabs
              value={levelFilter}
              onChange={setLevelFilter}
              items={levelTabs}
              label="Filter logs by level"
            />
          </div>
        }
      >
        <div className="cloud-log-toolbar">
          <NeoSearch
            value={logQuery}
            onChange={setLogQuery}
            placeholder="Search log messages, SQL queries, trace IDs, or regions…"
          />
        </div>

        <div className="cloud-log-stream" role="log" aria-label="Structured service logs">
          {logs.map((line) => (
            <div key={line.id} className={`cloud-log-line is-${line.level}`}>
              <span className={`cloud-log-level is-${line.level} neo-mono`} data-no-translate="true">
                {line.level.toUpperCase()}
              </span>
              <span className="cloud-log-svc neo-mono" data-no-translate="true">
                {line.service}
              </span>
              <RegionBadge regionId={line.region} />
              <span className="cloud-log-msg neo-mono" data-no-translate="true">
                {line.msg}
              </span>
              {line.traceId && (
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--soft neo-mono"
                  onClick={() => selectTrace(line.traceId!)}
                  data-no-translate="true"
                >
                  <span>{line.traceId}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </NeoPanel>
    </div>
  );
}
