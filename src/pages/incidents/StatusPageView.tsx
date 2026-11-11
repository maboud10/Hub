/**
 * Status Page View (`/incidents/status`) — Live component health matrix with
 * 45-day uptime bars, direct Launchpad Hub health sync (`setAppHealth`),
 * customer status update publisher, scheduled maintenance, and subscriber channels.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle2,
  Globe,
  Plus,
  Send,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { Chip, NeoHome, NeoPanel } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { DAY, HOUR, PHASE_META, SERVICES } from '@/incidents/meta';
import { buildUptimeBars } from '@/incidents/seed';
import { useIncidents } from '@/incidents/store';
import type { ComponentStatus, StatusPhase } from '@/incidents/types';
import { ComponentBadge, PhaseBadge, UserPill, relTimeShort } from './parts';

const PHASES: StatusPhase[] = ['investigating', 'identified', 'monitoring', 'resolved', 'maintenance'];

export function StatusPageView() {
  const me = useSessionUser();
  const now = useNow(30_000);
  const hubApps = useHub((s) => s.apps);

  const incidents = useIncidents((s) => s.incidents);
  const updates = useIncidents((s) => s.updates);
  const maintenance = useIncidents((s) => s.maintenance);
  const subscribers = useIncidents((s) => s.subscribers);
  const serviceStatus = useIncidents((s) => s.serviceStatus);

  const publishStatusUpdate = useIncidents((s) => s.publishStatusUpdate);
  const setComponentStatus = useIncidents((s) => s.setComponentStatus);
  const scheduleMaintenance = useIncidents((s) => s.scheduleMaintenance);
  const cancelMaintenance = useIncidents((s) => s.cancelMaintenance);
  const transitionIncident = useIncidents((s) => s.transitionIncident);

  const [incidentId, setIncidentId] = useState<string>('inc-2047');
  const [phase, setPhase] = useState<StatusPhase>('monitoring');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [compIds, setCompIds] = useState<string[]>(['payments-svc', 'expenses']);

  const [mntTitle, setMntTitle] = useState('');
  const [mntService, setMntService] = useState('search-svc');

  const trackedHubApps = useMemo(
    () => hubApps.filter((a) => ['incidents', 'expenses', 'procurement', 'mail', 'chat', 'meet', 'wiki', 'drive', 'analytics'].includes(a.id)),
    [hubApps],
  );

  const toggleComp = (id: string) => {
    setCompIds((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  };

  const draftWithNova = () => {
    const inc = incidents.find((i) => i.id === incidentId) ?? incidents[0];
    if (!inc) return;
    setTitle(`${inc.code} · ${inc.title} (${PHASE_META[phase].label})`);
    setBody(
      phase === 'resolved'
        ? `All affected services (${inc.services.join(', ')}) have recovered to normal latency and error budgets. Thank you for your patience.`
        : `${inc.summary} Next update in 30 minutes.`,
    );
    setCompIds([...inc.services, ...inc.impactedApps]);
  };

  const onPublish = (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim() || `Status update (${PHASE_META[phase].label})`;
    const cleanBody = body.trim() || `Engineering is ${phase} on ${compIds.join(', ')}.`;
    publishStatusUpdate({
      incidentId: incidentId || undefined,
      phase,
      title: cleanTitle,
      body: cleanBody,
      componentIds: compIds,
      authorId: me?.id ?? 'u-aisha',
    });
    setTitle('');
    setBody('');
  };

  const onScheduleMnt = (e: FormEvent) => {
    e.preventDefault();
    const clean = mntTitle.trim() || `${mntService} scheduled rolling maintenance`;
    scheduleMaintenance({
      title: clean,
      componentIds: [mntService],
      start: now + DAY,
      end: now + DAY + 2 * HOUR,
      createdBy: me?.id ?? 'u-lucas',
      notify: true,
    });
    setMntTitle('');
  };

  const totalSubscribers = subscribers.reduce((s, c) => s + c.count, 0);

  const mainCol = (
    <>
      {/* Core Services & Uptime Bars */}
      <NeoPanel
        hud="90-day reliability & live SLO state"
        title="Core Services & Launchpad App Status"
        icon={<Globe />}
        actions={
          <button
            type="button"
            className="neo-btn neo-btn--success neo-btn--xs"
            onClick={() => {
              setComponentStatus('incidents', 'operational', 'SMS carrier failover complete');
              setComponentStatus('incident-paging', 'operational', 'SMS carrier failover complete');
              transitionIncident('inc-2046', 'resolved', me?.id ?? 'u-lucas', 'SMS carrier failover complete');
            }}
            data-qa="status-restore-incidents"
          >
            <CheckCircle2 />
            <span>Restore SMS Paging Operational</span>
          </button>
        }
      >
        <div className="inc-uptime-list">
          {SERVICES.map((svc) => {
            const raw = serviceStatus[svc.id];
            const compStatus: ComponentStatus = raw === 'degraded' ? 'degraded' : raw === 'maintenance' ? 'maintenance' : 'operational';
            const bars = buildUptimeBars(svc.id, incidents, now, 40);
            const downTotal = bars.reduce((a, b) => a + b.downMins, 0);
            const uptimePct = Math.max(98.5, 100 - (downTotal / (40 * 1440)) * 100).toFixed(2);
            return (
              <div key={svc.id} className="inc-uptime-row">
                <div className="inc-uptime-row__head">
                  <div className="inc-uptime-row__title">
                    <b className="neo-mono">{svc.label}</b>
                    <span className="inc-muted">{svc.tier}</span>
                    {svc.apps.map((appId) => (
                      <Chip key={appId} tone="slate" size="sm">
                        <span>{appId}</span>
                      </Chip>
                    ))}
                  </div>
                  <div className="inc-uptime-row__right">
                    <span className="neo-mono inc-uptime-pct">{uptimePct}% uptime</span>
                    <ComponentBadge status={compStatus} />
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() =>
                        setComponentStatus(
                          svc.id,
                          compStatus === 'operational' ? 'degraded' : 'operational',
                          compStatus === 'operational' ? `Manual degradation on ${svc.id}` : 'SMS carrier failover complete',
                        )
                      }
                    >
                      <span>{compStatus === 'operational' ? 'Mark Degraded' : 'Mark Operational'}</span>
                    </button>
                  </div>
                </div>
                <div className="inc-uptime-bars" role="img" aria-label={`${svc.label} 40-day uptime history`}>
                  {bars.map((b, idx) => (
                    <i
                      key={idx}
                      className="inc-uptime-bar"
                      data-status={b.status}
                      title={`${new Date(b.dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${b.status}${b.downMins ? ` (${b.downMins}m impacted)` : ''}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="inc-hub-apps-strip">
          <div className="neo-hud">Synced Launchpad Workspace Apps (`useHub.setAppHealth`)</div>
          <div className="inc-hub-apps-grid">
            {trackedHubApps.map((app) => (
              <div key={app.id} className="inc-hub-app-pill" data-status={app.status}>
                <div>
                  <b>{app.name}</b>
                  <span className="neo-mono inc-muted">{app.status}</span>
                </div>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--xs"
                  onClick={() =>
                    setComponentStatus(
                      app.id,
                      app.status === 'operational' ? 'degraded' : 'operational',
                      app.id === 'incidents' ? 'SMS carrier failover complete' : `${app.name} status flipped from Sentinel`,
                    )
                  }
                  data-qa={`hub-health-${app.id}`}
                >
                  <span>{app.status === 'operational' ? 'Degrade' : 'Restore'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </NeoPanel>

      {/* Publish Customer Status Update */}
      <NeoPanel
        hud="External & internal status feed"
        title="Publish Status Page Update"
        icon={<Send />}
        actions={
          <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={draftWithNova} data-qa="status-nova-draft">
            <Sparkles />
            <span>Draft with Nova</span>
          </button>
        }
      >
        <form className="inc-status-form" onSubmit={onPublish}>
          <div className="inc-field-row">
            <label className="inc-field">
              <span className="inc-field__label">Linked incident</span>
              <select className="neo-input neo-input--sm" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
                <option value="">General status notice</option>
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.code} · {inc.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="inc-field">
              <span className="inc-field__label">Status phase</span>
              <div className="inc-chip-cloud">
                {PHASES.map((p) => (
                  <Chip
                    key={p}
                    tone={phase === p ? PHASE_META[p].tone : 'slate'}
                    size="sm"
                    pressed={phase === p}
                    onClick={() => setPhase(p)}
                  >
                    <span>{PHASE_META[p].label}</span>
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="inc-field">
            <span className="inc-field__label">Affected components (flips Launchpad health automatically)</span>
            <div className="inc-chip-cloud">
              {SERVICES.map((s) => (
                <Chip
                  key={s.id}
                  tone={compIds.includes(s.id) ? 'orange' : 'slate'}
                  size="sm"
                  pressed={compIds.includes(s.id)}
                  onClick={() => toggleComp(s.id)}
                >
                  <span className="neo-mono">{s.label}</span>
                </Chip>
              ))}
              {['incidents', 'expenses', 'procurement', 'mail', 'wiki'].map((appId) => (
                <Chip
                  key={appId}
                  tone={compIds.includes(appId) ? 'cyan' : 'slate'}
                  size="sm"
                  pressed={compIds.includes(appId)}
                  onClick={() => toggleComp(appId)}
                >
                  <span>app:{appId}</span>
                </Chip>
              ))}
            </div>
          </div>

          <label className="inc-field">
            <span className="inc-field__label">Headline</span>
            <input
              type="text"
              className="neo-input neo-input--sm"
              placeholder="e.g. EU card checkout latency recovering after rollback"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="inc-field">
            <span className="inc-field__label">Customer-facing message</span>
            <textarea
              className="neo-input"
              rows={2}
              placeholder="Clear, blameless update for subscribers and internal teams…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          <div className="inc-inline-actions">
            <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm" data-qa="status-publish-btn">
              <Send />
              <span>Publish Status Update</span>
            </button>
          </div>
        </form>

        <div className="inc-updates-history">
          {updates.map((u) => (
            <div key={u.id} className="inc-update-card">
              <div className="inc-row-card__badges">
                <PhaseBadge phase={u.phase} />
                <b>{u.title}</b>
                <span className="neo-mono inc-muted">{relTimeShort(u.at, now)}</span>
                <UserPill userId={u.authorId} size={18} />
              </div>
              <p className="inc-row-card__summary">{u.body}</p>
              <div className="inc-chip-cloud">
                {u.componentIds.map((c) => (
                  <Chip key={c} tone="slate" size="sm">
                    <span className="neo-mono">{c}</span>
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </NeoPanel>
    </>
  );

  const sideCol = (
    <>
      <NeoPanel
        hud={`${totalSubscribers.toLocaleString()} active subscribers`}
        title="Notification Channels"
        icon={<Bell />}
      >
        <div className="inc-side-list">
          {subscribers.map((sub) => (
            <div key={sub.id} className="inc-sub-row">
              <span className="inc-sub-row__label">{sub.id.toUpperCase()}</span>
              <b className="neo-mono">{sub.count.toLocaleString()}</b>
            </div>
          ))}
        </div>
      </NeoPanel>

      <NeoPanel
        hud="Planned change windows"
        title="Scheduled Maintenance"
        icon={<Wrench />}
      >
        <div className="inc-side-list">
          {maintenance
            .filter((m) => !m.cancelled)
            .map((m) => (
              <div key={m.id} className="inc-side-card">
                <div className="inc-row-card__badges">
                  <CalendarClock />
                  <b>{m.title}</b>
                </div>
                <div className="inc-chip-cloud">
                  {m.componentIds.map((c) => (
                    <Chip key={c} tone="blue" size="sm">
                      <span className="neo-mono">{c}</span>
                    </Chip>
                  ))}
                </div>
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() => cancelMaintenance(m.id)}
                >
                  <X />
                  <span>Cancel Window</span>
                </button>
              </div>
            ))}
        </div>

        <form className="inc-mnt-form" onSubmit={onScheduleMnt}>
          <select className="neo-input neo-input--sm" value={mntService} onChange={(e) => setMntService(e.target.value)}>
            {SERVICES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="neo-input neo-input--sm"
            placeholder="Maintenance title…"
            value={mntTitle}
            onChange={(e) => setMntTitle(e.target.value)}
          />
          <button type="submit" className="neo-btn neo-btn--soft neo-btn--xs">
            <Plus />
            <span>Schedule Maintenance</span>
          </button>
        </form>
      </NeoPanel>

      <NeoPanel hud="SLO summary" title="30-Day Availability" icon={<Activity />}>
        <div className="inc-side-card">
          <div className="inc-sub-row">
            <span>Global edge & auth</span>
            <b className="neo-mono">99.98%</b>
          </div>
          <div className="inc-sub-row">
            <span>Core collaboration</span>
            <b className="neo-mono">99.99%</b>
          </div>
          <div className="inc-sub-row">
            <span>Payments & ledger</span>
            <b className="neo-mono">99.91%</b>
          </div>
        </div>
      </NeoPanel>
    </>
  );

  return <NeoHome main={mainCol} side={sideCol} sideLabel="Status subscribers & maintenance" />;
}
