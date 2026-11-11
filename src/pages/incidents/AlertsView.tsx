/**
 * Alerts View (`/incidents/alerts`) — Deduplicated alert groups, 1-click ack/snooze/escalate
 * to Incident War Room, Nova AI noise-reduction suggestions, and routing rules.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Bell,
  BellOff,
  Check,
  Clock,
  Filter,
  Flame,
  Siren,
  Sparkles,
  VolumeX,
  X,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoHome, NeoPanel, NeoSearch, NeoTabs, NovaChip } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { buildAlertGroups, buildNoiseSuggestions } from '@/incidents/seed';
import { useIncidents } from '@/incidents/store';
import { AlertSevBadge, relTimeShort, useSentinelCtx } from './parts';

type AlertTab = 'all' | 'firing' | 'acknowledged' | 'noisy';

export function AlertsView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const { setSelectedIncidentId } = useSentinelCtx();

  const alertEvents = useIncidents((s) => s.alertEvents);
  const alertStates = useIncidents((s) => s.alertStates);
  const rules = useIncidents((s) => s.rules);
  const dismissedSuggestions = useIncidents((s) => s.dismissedSuggestions);
  const incidents = useIncidents((s) => s.incidents);

  const ackAlert = useIncidents((s) => s.ackAlert);
  const snoozeAlert = useIncidents((s) => s.snoozeAlert);
  const resolveAlert = useIncidents((s) => s.resolveAlert);
  const escalateAlertToIncident = useIncidents((s) => s.escalateAlertToIncident);
  const toggleRule = useIncidents((s) => s.toggleRule);
  const applyNoiseSuggestion = useIncidents((s) => s.applyNoiseSuggestion);
  const dismissNoiseSuggestion = useIncidents((s) => s.dismissNoiseSuggestion);

  const [tab, setTab] = useState<AlertTab>('all');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => buildAlertGroups(alertEvents, alertStates, now), [alertEvents, alertStates, now]);
  const suggestions = useMemo(
    () => buildNoiseSuggestions(groups, dismissedSuggestions),
    [groups, dismissedSuggestions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (tab === 'firing' && g.state !== 'firing') return false;
      if (tab === 'acknowledged' && g.state !== 'acknowledged') return false;
      if (tab === 'noisy' && !g.noisy && !g.flapping) return false;
      if (q && !`${g.title} ${g.service} ${g.region} ${g.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, tab, query]);

  const onEscalate = (fp: string) => {
    const inc = escalateAlertToIncident(fp, me?.id ?? 'u-lucas');
    if (inc) {
      setSelectedIncidentId(inc.id);
      navigate(`/incidents/war-room?id=${inc.id}`);
    }
  };

  const mainCol = (
    <>
      <NeoPanel
        hud="Deduplicated telemetry stream"
        title="Alert Groups & Escalation Queue"
        icon={<Bell />}
        actions={
          <NeoTabs
            label="Filter alerts"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'all', label: 'All', count: groups.length },
              { value: 'firing', label: 'Firing', count: groups.filter((g) => g.state === 'firing').length },
              { value: 'acknowledged', label: 'Acked', count: groups.filter((g) => g.state === 'acknowledged').length },
              { value: 'noisy', label: 'Noisy', count: groups.filter((g) => g.noisy || g.flapping).length },
            ]}
          />
        }
      >
        <div className="inc-toolbar-row">
          <NeoSearch
            value={query}
            onChange={setQuery}
            placeholder="Filter by service, region, source, or symptom…"
          />
        </div>

        {filtered.length === 0 ? (
          <NeoEmpty icon={<BellOff />} title="No alert groups match this filter" compact />
        ) : (
          <div className="inc-list">
            {filtered.map((g) => {
              const linkedInc = g.incidentId ? incidents.find((i) => i.id === g.incidentId) : undefined;
              return (
                <div key={g.fingerprint} className="inc-alert-card neo-spot" data-state={g.state}>
                  <div className="inc-alert-card__main">
                    <div className="inc-row-card__badges">
                      <AlertSevBadge severity={g.severity} />
                      <Chip tone="slate" size="sm">
                        <span className="neo-mono">{g.service}</span>
                      </Chip>
                      <Chip tone="slate" size="sm">
                        <span className="neo-mono">{g.region}</span>
                      </Chip>
                      <Chip tone="blue" size="sm">
                        <span>{g.source}</span>
                      </Chip>
                      {g.count > 1 && (
                        <Chip tone="orange" size="sm">
                          <span>{g.count}x deduplicated</span>
                        </Chip>
                      )}
                      {g.flapping && (
                        <Chip tone="warning" size="sm" icon={<Flame />}>
                          <span>Flapping</span>
                        </Chip>
                      )}
                      {g.noisy && (
                        <Chip tone="violet" size="sm" icon={<VolumeX />}>
                          <span>Noisy ({g.count7d}/7d)</span>
                        </Chip>
                      )}
                      {linkedInc && (
                        <Link to={`/incidents/war-room?id=${linkedInc.id}`}>
                          <Chip tone="danger" size="sm" icon={<Siren />}>
                            <span>{linkedInc.code}</span>
                          </Chip>
                        </Link>
                      )}
                    </div>
                    <h3 className="inc-alert-card__title">{g.title}</h3>
                    <div className="inc-muted neo-mono">
                      <span>Last seen {relTimeShort(g.lastAt, now)}</span>
                      <span> · </span>
                      <span>State: {g.state}</span>
                      {g. count7d > 0 && (
                        <>
                          <span> · </span>
                          <span>{g.count7d} fires in 7d</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="inc-alert-card__actions">
                    {g.state === 'firing' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => ackAlert(g.fingerprint, me?.id ?? 'u-lucas')}
                        data-qa={`alert-ack-${g.service}`}
                      >
                        <Check />
                        <span>Ack</span>
                      </button>
                    )}
                    {g.state !== 'snoozed' && g.state !== 'resolved' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => snoozeAlert(g.fingerprint, 30, me?.id ?? 'u-lucas')}
                      >
                        <Clock />
                        <span>Snooze 30m</span>
                      </button>
                    )}
                    {g.state !== 'resolved' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => resolveAlert(g.fingerprint, me?.id ?? 'u-lucas')}
                      >
                        <span>Resolve</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--xs"
                      onClick={() => onEscalate(g.fingerprint)}
                      data-qa={`alert-escalate-${g.service}`}
                    >
                      <Siren />
                      <span>{linkedInc ? `Open ${linkedInc.code}` : 'Escalate to Incident'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </NeoPanel>

      {/* Routing Rules */}
      <NeoPanel
        hud="Automated pager triage"
        title="Alert Routing & Suppression Rules"
        icon={<Filter />}
      >
        <div className="inc-rules-list">
          {rules.map((r) => (
            <div key={r.id} className="inc-rule-row">
              <div className="inc-rule-row__main">
                <div className="inc-row-card__badges">
                  <b>{r.name}</b>
                  {r.nova && <NovaChip>Nova rule</NovaChip>}
                  <Chip tone={r.action === 'page' ? 'danger' : r.action === 'suppress' ? 'violet' : 'cyan'} size="sm">
                    <span>{r.action}</span>
                  </Chip>
                </div>
                <div className="inc-muted neo-mono">
                  <span>Target: {r.target ?? 'default'}</span>
                  <span> · </span>
                  <span>{r.hits7d} matches in 7d</span>
                </div>
              </div>
              <label className="inc-toggle-row">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={() => toggleRule(r.id)}
                />
                <span>{r.enabled ? 'Enabled' : 'Paused'}</span>
              </label>
            </div>
          ))}
        </div>
      </NeoPanel>
    </>
  );

  const sideCol = (
    <NeoPanel
      hud="Nova AI signal hygiene"
      title="Noise-Reduction Recommendations"
      icon={<Sparkles />}
    >
      {suggestions.length === 0 ? (
        <NeoEmpty icon={<Sparkles />} title="All noise recommendations applied" compact>
          <span>Your routing rules are suppressing non-actionable flapping alerts.</span>
        </NeoEmpty>
      ) : (
        <div className="inc-side-list">
          {suggestions.map((s) => (
            <div key={s.id} className="inc-suggest-card">
              <div className="inc-suggest-card__head">
                <NovaChip>{Math.round(s.confidence * 100)}% confidence</NovaChip>
                <Chip tone="emerald" size="sm">
                  <span>Saves {s.savings} pages/wk</span>
                </Chip>
              </div>
              <h4 className="inc-suggest-card__title">{s.title}</h4>
              <div className="inc-suggest-card__evidence">
                {s.evidence.map((ev) => (
                  <span key={ev.label} className="inc-ev-chip">
                    <small>{ev.label}:</small> <b>{ev.value}</b>
                  </span>
                ))}
              </div>
              <div className="inc-inline-actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--xs"
                  onClick={() => applyNoiseSuggestion(s.fingerprint, me?.id ?? 'u-lucas')}
                  data-qa={`apply-noise-${s.service}`}
                >
                  <Sparkles />
                  <span>Apply Rule</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() => dismissNoiseSuggestion(s.fingerprint)}
                >
                  <X />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </NeoPanel>
  );

  return <NeoHome main={mainCol} side={sideCol} sideLabel="Nova alert noise reduction" />;
}
