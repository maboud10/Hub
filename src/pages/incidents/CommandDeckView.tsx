/**
 * Command Deck (Home View `/incidents`) — Sentinel blast-radius radar,
 * 5-stage incident lifecycle tracker, KPI ribbon, Nova root-cause copilot,
 * active on-call roster, and Wellbeing fatigue recovery nudge.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  Bell,
  CheckCircle2,
  Clock,
  Flame,
  GitBranch,
  Globe,
  HeartPulse,
  Lock,
  Mail,
  MessageSquare,
  PhoneCall,
  ShieldAlert,
  Siren,
  Sparkles,
  Unlock,
  Video,
} from 'lucide-react';
import {
  Chip,
  CountUp,
  NeoBanner,
  NeoBanners,
  NeoEmpty,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  Orb,
  Spark,
  useTypewriter,
} from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { activeIncidents, mttaMinutes, mttrMinutes, weeklyTrend } from '@/incidents/engine';
import { REGIONS, SERVICES } from '@/incidents/meta';
import { fatigueFor, onCallNow as computeOnCallNow } from '@/incidents/oncall';
import { buildAlertGroups, buildNoiseSuggestions } from '@/incidents/seed';
import { useIncidents } from '@/incidents/store';
import {
  IncidentLifecycleTracker,
  LiveElapsedClock,
  SevBadge,
  StatusBadge,
  UserPill,
  broadcastToPulseChat,
  buildMailComposeUrl,
  relTimeShort,
   triggerDeployFreeze,
  useSentinelCtx,
} from './parts';

const NOVA_SUGGESTIONS = [
  'Correlate INC-2047 with recent DevHub deploys',
  'Draft stakeholder update for EU payment latency',
  'Check on-call fatigue & suggest shift swap',
  'Summarize 7-day alert noise savings',
];

function computeNovaAnswer(query: string): { title: string; body: string; confidence: string; actionTo?: string; actionLabel?: string } {
  const q = query.toLowerCase();
  if (q.includes('deploy') || q.includes('2047') || q.includes('correlate')) {
    return {
      title: 'Root-cause correlation · payments-svc v2.41.0',
      body: 'payments-svc v2.41.0 deployed to eu-west-2 4 minutes before card authorization p95 jumped from 320ms to 1,840ms. Commit diff shows maxPoolIdleTime reduced from 60s to 5s, causing TLS connection churn against the EU PSP gateway. Recommended action: keep production deploy freeze active, shift 60% EU traffic to me-central-1, and complete rollback to v2.40.9.',
      confidence: '96% confidence',
      actionTo: '/incidents/war-room?id=inc-2047',
      actionLabel: 'Open INC-2047 War Room',
    };
  }
  if (q.includes('stakeholder') || q.includes('mail') || q.includes('draft')) {
    return {
      title: 'Stakeholder comms draft · INC-2047 (SEV2)',
      body: 'Subject: [INC-2047 · SEV2] Elevated EU payment latency — mitigation in progress. Summary: We identified a connection-pool regression in payments-svc v2.41.0 affecting EU card checkouts. Traffic is failing over to me-central-1 while we roll back to v2.40.9. Next update in 30 minutes.',
      confidence: 'Comms ready',
      actionTo: '/incidents/status',
      actionLabel: 'Publish to Status Page',
    };
  }
  if (q.includes('fatigue') || q.includes('swap') || q.includes('wellbeing') || q.includes('on-call')) {
    return {
      title: 'Pager fatigue radar · Berlin–London shift',
      body: 'Lucas Meyer has received 5 pages in the last 7 days, including 3 overnight pages between 22:00 and 07:00 CET (fatigue score 66/100 · High). Priya Raman has already accepted a 6-hour coverage swap today so Lucas can take a recovery window and enable Wellbeing quiet hours.',
      confidence: 'Wellbeing signal',
      actionTo: '/incidents/oncall',
      actionLabel: 'Apply coverage swap',
    };
  }
  return {
    title: 'Alert noise reduction · 29 pages/week saved',
    body: 'Nova analyzed 142 alert events over the past 7 days: raising the chat-realtime WebSocket CPU burst window to 180s and suppressing hourly Kafka compaction spikes eliminates 29 non-actionable pages per week without hiding SLO regressions.',
    confidence: '93% confidence',
    actionTo: '/incidents/alerts',
    actionLabel: 'Review alert routing rules',
  };
}

export function CommandDeckView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const now = useNow(1_000);
  const { openDeclare, setSelectedIncidentId } = useSentinelCtx();

  const incidents = useIncidents((s) => s.incidents);
  const postmortems = useIncidents((s) => s.postmortems);
  const rotations = useIncidents((s) => s.rotations);
  const overrides = useIncidents((s) => s.overrides);
  const pages = useIncidents((s) => s.pages);
  const alertEvents = useIncidents((s) => s.alertEvents);
  const alertStates = useIncidents((s) => s.alertStates);
  const dismissedSuggestions = useIncidents((s) => s.dismissedSuggestions);
  const deploys = useIncidents((s) => s.deploys);
  const health = useIncidents((s) => s.health);
  const transitionIncident = useIncidents((s) => s.transitionIncident);

  const openList = useMemo(() => activeIncidents(incidents), [incidents]);
  const primary = openList[0] ?? incidents[0];
  const secondary = openList.find((i) => i.id === 'inc-2046') ?? openList[1];

  const mtta = useMemo(() => mttaMinutes(incidents), [incidents]);
  const mttr = useMemo(() => mttrMinutes(incidents), [incidents]);
  const mttaSeries = useMemo(() => weeklyTrend(incidents, 'mtta', 6, now), [incidents, now]);
  const mttrSeries = useMemo(() => weeklyTrend(incidents, 'mttr', 6, now), [incidents, now]);
  const countSeries = useMemo(() => weeklyTrend(incidents, 'count', 6, now), [incidents, now]);

  const alertGroups = useMemo(() => buildAlertGroups(alertEvents, alertStates, now), [alertEvents, alertStates, now]);
  const firingAlerts = useMemo(() => alertGroups.filter((g) => g.state === 'firing'), [alertGroups]);
  const noiseSuggestions = useMemo(() => buildNoiseSuggestions(alertGroups, dismissedSuggestions), [alertGroups, dismissedSuggestions]);
  const weeklySavings = useMemo(() => noiseSuggestions.reduce((acc, s) => acc + s.savings, 0), [noiseSuggestions]);

  const slots = useMemo(() => computeOnCallNow(rotations, now, overrides), [rotations, now, overrides]);
  const lucasFatigue = useMemo(() => fatigueFor(pages, 'u-lucas', 'Europe/Berlin', now), [pages, now]);

  const [novaQuery, setNovaQuery] = useState(NOVA_SUGGESTIONS[0]);
  const novaRes = useMemo(() => computeNovaAnswer(novaQuery), [novaQuery]);
  const [typedBody] = useTypewriter(novaRes.body, 110);

  const mainCol = (
    <>
      {openList.length > 0 && (
        <NeoBanners>
          {openList.map((inc) => (
            <NeoBanner
              key={inc.id}
              tone={inc.severity === 'SEV1' ? 'danger' : inc.severity === 'SEV2' ? 'orange' : 'warning'}
              icon={<Siren />}
              title={`${inc.code} · ${inc.title}`}
              meta={
                <span className="inc-banner-meta">
                  <SevBadge severity={inc.severity} />
                  <StatusBadge status={inc.status} />
                  <LiveElapsedClock startedAt={inc.startedAt} resolvedAt={inc.resolvedAt} now={now} />
                </span>
              }
              to={`/incidents/war-room?id=${inc.id}`}
              action={
                inc.id === 'inc-2046' ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--success neo-btn--xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      transitionIncident('inc-2046', 'resolved', me?.id ?? 'u-lucas', 'SMS carrier failover complete');
                    }}
                    data-qa="inc-resolve-2046"
                  >
                    <CheckCircle2 />
                    <span>Resolve & restore status</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIncidentId(inc.id);
                      navigate(`/incidents/war-room?id=${inc.id}`);
                    }}
                  >
                    <ShieldAlert />
                    <span>Open War Room</span>
                  </button>
                )
              }
            >
              <span>{inc.summary}</span>
            </NeoBanner>
          ))}
        </NeoBanners>
      )}

      <NeoKpis label="Incident Command key metrics">
        <NeoKpi
          label="Active incidents"
          value={<CountUp value={openList.length} />}
          sub={openList.length ? `${openList[0].code} (${openList[0].severity}) in flight` : 'All systems nominal'}
          icon={<Siren />}
          tone={openList.some((i) => i.severity === 'SEV1' || i.severity === 'SEV2') ? 'danger' : 'success'}
          spark={<Spark data={[2, 3, 1, 4, 2, ...countSeries.slice(-1)]} color="#ef4444" />}
          to="/incidents/war-room"
        />
        <NeoKpi
          label="Mean time to ack"
          value={
            <span>
              <CountUp value={Math.round(mtta)} />
              <span>m</span>
            </span>
          }
          sub="Target SLA < 5m for SEV1/SEV2"
          icon={<Clock />}
          tone="emerald"
          spark={<Spark data={[4.5, 3.8, 3.2, 2.9, 3.1, ...mttaSeries.slice(-1)]} color="#34d399" />}
          to="/incidents/oncall"
        />
        <NeoKpi
          label="Mean time to resolve"
          value={
            <span>
              <CountUp value={mttr} />
              <span>m</span>
            </span>
          }
          sub="Last 30 days · 100% blameless RCA"
          icon={<Activity />}
          tone="cyan"
          spark={<Spark data={[68, 54, 49, 44, 46, ...mttrSeries.slice(-1)]} color="#38bdf8" />}
          to="/incidents/postmortems"
        />
        <NeoKpi
          label="Firing alert groups"
          value={<CountUp value={firingAlerts.length} />}
          sub={`Nova can save ${weeklySavings} pages/wk`}
          icon={<Bell />}
          tone={firingAlerts.length > 0 ? 'warning' : 'slate'}
          spark={<Spark data={[19, 16, 14, 11, 9, firingAlerts.length]} color="#f59e0b" />}
          to="/incidents/alerts"
        />
      </NeoKpis>

      {primary ? (
        <IncidentLifecycleTracker
          incident={primary}
          postmortem={postmortems.find((p) => p.incidentId === primary.id)}
          now={now}
          actions={
            <div className="inc-tracker-actions">
              <button
                type="button"
                className={primary.freeze?.active ? 'neo-btn neo-btn--warning neo-btn--xs' : 'neo-btn neo-btn--danger neo-btn--xs'}
                onClick={() => triggerDeployFreeze(primary, !primary.freeze?.active, me?.id ?? 'u-omar')}
                data-qa="inc-toggle-freeze"
              >
                {primary.freeze?.active ? <Unlock /> : <Lock />}
                <span>{primary.freeze?.active ? 'Deploys frozen · Lift' : 'Freeze deploys'}</span>
              </button>
              <Link
                to={`/meet/room?incident=${encodeURIComponent(primary.code)}`}
                className="neo-btn neo-btn--soft neo-btn--xs"
                data-qa="inc-holomeet-link"
              >
                <Video />
                <span>HoloMeet Bridge</span>
              </Link>
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--xs"
                onClick={() => broadcastToPulseChat(primary, undefined, me?.id)}
                data-qa="inc-chat-broadcast"
              >
                <MessageSquare />
                <span>Broadcast to Chat</span>
              </button>
              <Link
                to={buildMailComposeUrl(primary)}
                className="neo-btn neo-btn--soft neo-btn--xs"
                data-qa="inc-mail-stakeholders"
              >
                <Mail />
                <span>Mail Stakeholders</span>
              </Link>
              {primary.status !== 'resolved' && (
                <button
                  type="button"
                  className="neo-btn neo-btn--success neo-btn--xs"
                  onClick={() =>
                    transitionIncident(
                      primary.id,
                      primary.status === 'mitigating' ? 'monitoring' : 'resolved',
                      me?.id ?? 'u-lucas',
                    )
                  }
                >
                  <CheckCircle2 />
                  <span>{primary.status === 'mitigating' ? 'Advance to Monitoring' : 'Resolve Incident'}</span>
                </button>
              )}
            </div>
          }
        />
      ) : (
        <NeoEmpty
          icon={<Siren />}
          title="Zero active incidents"
          action={
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openDeclare()}>
              <Siren />
              <span>Declare an incident</span>
            </button>
          }
        >
          <span>All regional hubs and core services are operating within SLO budgets.</span>
        </NeoEmpty>
      )}

      {/* Signature Hero Visual: Multi-Region Blast-Radius & Service Radar */}
      <NeoPanel
        hud="Sentinel blast-radius radar"
        title="Global Regional Health & Suspect Deploy Correlation"
        icon={<Globe />}
        actions={
          <div className="inc-inline-actions">
            <Link to="/devhub/deploys" className="neo-btn neo-btn--ghost neo-btn--xs">
              <GitBranch />
              <span>DevHub Deploys</span>
            </Link>
            <Link to="/cloud/services" className="neo-btn neo-btn--ghost neo-btn--xs">
              <Activity />
              <span>Cloud Console</span>
            </Link>
          </div>
        }
      >
        <div className="inc-radar-grid">
          <div className="inc-radar-regions">
            {REGIONS.map((reg) => {
              const regIncidents = openList.filter((i) => i.regions.includes(reg.id));
              const degraded = regIncidents.length > 0;
              return (
                <div key={reg.id} className="inc-region-card neo-spot" data-degraded={degraded || undefined}>
                  <div className="inc-region-card__head">
                    <Orb tone={degraded ? 'danger' : 'success'} pulse={degraded} size={9} />
                    <div>
                      <div className="inc-region-card__city">{reg.city}</div>
                      <div className="neo-mono inc-region-card__code">{reg.id}</div>
                    </div>
                    <Chip tone={degraded ? 'danger' : 'success'} size="sm">
                      <span>{degraded ? `${regIncidents.length} active` : 'Nominal'}</span>
                    </Chip>
                  </div>
                  <div className="inc-region-card__body">
                    {degraded ? (
                      regIncidents.map((inc) => (
                        <Link key={inc.id} to={`/incidents/war-room?id=${inc.id}`} className="inc-region-inc">
                          <Flame />
                          <span>{inc.code}</span>
                          <span>·</span>
                          <span className="truncate">{inc.title}</span>
                        </Link>
                      ))
                    ) : (
                      <span className="inc-muted">All synthetic probes <CheckCircle2 className="inc-inline-ico" /> 99.98% SLO</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="inc-service-matrix">
            {SERVICES.map((svc) => {
              const h = health.find((x) => x.service === svc.id);
              const dep = deploys.find((d) => d.service === svc.id);
              const openInc = openList.find((i) => i.services.includes(svc.id));
              const isSuspect = dep?.version === 'v2.41.0' && svc.id === 'payments-svc';
              return (
                <div
                  key={svc.id}
                  className="inc-svc-tile"
                  data-status={h?.status ?? 'healthy'}
                >
                  <div className="inc-svc-tile__top">
                    <Orb tone={h?.status === 'degraded' ? 'warning' : h?.status === 'down' ? 'danger' : 'success'} pulse={h?.status !== 'healthy'} size={8} />
                    <b className="neo-mono">{svc.label}</b>
                    <span className="inc-svc-tile__tier">{svc.tier}</span>
                  </div>
                  <div className="inc-svc-tile__metrics neo-mono">
                    <span>p95 {h?.latencyMs ?? 60}ms</span>
                    <span>·</span>
                    <span>err {((h?.errorRate ?? 0.0005) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="inc-svc-tile__foot">
                    {dep ? (
                      <Link
                        to={dep.to}
                        className={isSuspect ? 'inc-deploy-pill inc-deploy-pill--suspect' : 'inc-deploy-pill'}
                        title={isSuspect ? 'Suspect deploy correlated by Nova' : 'Latest production deploy'}
                      >
                        <GitBranch />
                        <span>{dep.version}</span>
                        {isSuspect && <b>Suspect</b>}
                      </Link>
                    ) : (
                      <span className="inc-muted">Stable</span>
                    )}
                    {openInc && (
                      <Link to={`/incidents/war-room?id=${openInc.id}`} className="inc-svc-inc-link">
                        <span>{openInc.code}</span>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </NeoPanel>

      {/* Active & Recent Incidents Roster */}
      <NeoPanel
        hud="Incident command log"
        title="Active & Recent Incidents"
        icon={<Siren />}
        actions={
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => openDeclare()}>
            <Siren />
            <span>Declare Incident</span>
          </button>
        }
      >
        <div className="inc-list">
          {incidents.map((inc) => {
            const pm = postmortems.find((p) => p.incidentId === inc.id);
            return (
              <div key={inc.id} className="inc-row-card neo-spot" data-active={inc.status !== 'resolved' || undefined}>
                <div className="inc-row-card__main">
                  <div className="inc-row-card__badges">
                    <span className="neo-mono inc-code">{inc.code}</span>
                    <SevBadge severity={inc.severity} />
                    <StatusBadge status={inc.status} />
                    <LiveElapsedClock startedAt={inc.startedAt} resolvedAt={inc.resolvedAt} now={now} />
                    {inc.freeze?.active && (
                      <Chip tone="warning" size="sm" icon={<Lock />}>
                        <span>Deploys frozen</span>
                      </Chip>
                    )}
                  </div>
                  <Link
                    to={`/incidents/war-room?id=${inc.id}`}
                    className="inc-row-card__title"
                    onClick={() => setSelectedIncidentId(inc.id)}
                  >
                    {inc.title}
                  </Link>
                  <p className="inc-row-card__summary">{inc.summary}</p>
                  <div className="inc-row-card__meta">
                    <UserPill userId={inc.roles.commander} roleLabel="IC" />
                    <UserPill userId={inc.roles.ops} roleLabel="Ops" />
                    <div className="inc-chip-cloud">
                      {inc.services.map((s) => (
                        <Chip key={s} tone="slate" size="sm">
                          <span className="neo-mono">{s}</span>
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="inc-row-card__actions">
                  <Link
                    to={`/incidents/war-room?id=${inc.id}`}
                    className="neo-btn neo-btn--soft neo-btn--sm"
                    onClick={() => setSelectedIncidentId(inc.id)}
                  >
                    <ShieldAlert />
                    <span>War Room</span>
                  </Link>
                  {pm ? (
                    <Link to={`/incidents/postmortems?id=${pm.id}`} className="neo-btn neo-btn--ghost neo-btn--sm">
                      <span>Postmortem</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Nova AI Incident Copilot */}
      <NeoNovaPrompt
        hud="Nova Sentinel AI Copilot"
        title="Explainable Root-Cause & Comms Synthesis"
        badge={novaRes.confidence}
        placeholder="Ask Nova to correlate deploys, draft stakeholder updates, or audit alert noise…"
        suggestions={NOVA_SUGGESTIONS}
        onSubmit={(q) => setNovaQuery(q)}
        submitLabel="Analyze"
      >
        <div className="inc-nova-answer" aria-live="polite">
          <div className="inc-nova-answer__head">
            <Sparkles />
            <b>{novaRes.title}</b>
          </div>
          <p className="inc-nova-answer__body">{typedBody}</p>
          {novaRes.actionTo && (
            <div className="inc-nova-answer__foot">
              <Link to={novaRes.actionTo} className="neo-btn neo-btn--plasma neo-btn--xs">
                <span>{novaRes.actionLabel}</span>
              </Link>
            </div>
          )}
        </div>
      </NeoNovaPrompt>
    </>
  );

  const sideCol = (
    <>
      <NeoPanel
        hud="Follow-the-sun roster"
        title="Who's On Call Now"
        icon={<PhoneCall />}
        actions={
          <Link to="/incidents/oncall" className="neo-btn neo-btn--ghost neo-btn--xs">
            <span>Schedule</span>
          </Link>
        }
      >
        <div className="inc-side-list">
          {slots.map((slot) => {
            const rot = rotations.find((r) => r.id === slot.rotationId);
            return (
              <div key={slot.rotationId} className="inc-oncall-mini">
                <div className="inc-oncall-mini__top">
                  <span className="inc-dot" style={{ background: rot?.color ?? '#f97316' }} />
                  <span className="inc-oncall-mini__rot">{rot?.name}</span>
                  {slot.shift && (
                    <Chip tone="slate" size="sm">
                      <span>{slot.shift.hub}</span>
                    </Chip>
                  )}
                </div>
                <div className="inc-oncall-mini__user">
                  <UserPill userId={slot.userId} />
                  <span className="inc-muted neo-mono">{relTimeShort(slot.from, now)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Wellbeing Recovery Nudge */}
      <NeoPanel
        hud="Aura Wellbeing × Sentinel"
        title="On-Call Fatigue & Recovery Nudge"
        icon={<HeartPulse />}
      >
        <div className="inc-wellbeing-card">
          <div className="inc-wellbeing-card__top">
            <UserPill userId="u-lucas" roleLabel="SRE · Berlin" />
            <Chip tone={lucasFatigue.level === 'high' ? 'danger' : 'warning'} size="sm">
              <span>{lucasFatigue.nightPages} night pages</span>
            </Chip>
          </div>
          <p className="inc-wellbeing-card__text">
            Lucas Meyer handled {lucasFatigue.pagesThisWeek} pages this week ({lucasFatigue.nightPages} between 22:00–07:00 CET). Aura recommends a recovery shift swap and a 2-minute breathwork reset.
          </p>
          <div className="inc-wellbeing-card__actions">
            <Link to="/wellbeing/breathe?pattern=box&mins=2" className="neo-btn neo-btn--soft neo-btn--xs">
              <HeartPulse />
              <span>Two-minute breather</span>
            </Link>
            <Link to="/incidents/oncall" className="neo-btn neo-btn--plasma neo-btn--xs">
              <span>Review shift swap</span>
            </Link>
          </div>
        </div>
      </NeoPanel>

      {/* Secondary Active Incident Quick Card */}
      {secondary && (
        <NeoPanel
          hud="Carrier & Paging Health"
          title={`${secondary.code} · ${secondary.title}`}
          icon={<ShieldAlert />}
        >
          <div className="inc-side-card">
            <p className="inc-muted">{secondary.summary}</p>
            <div className="inc-side-card__actions">
              <Link to={`/incidents/war-room?id=${secondary.id}`} className="neo-btn neo-btn--soft neo-btn--xs">
                <span>Inspect War Room</span>
              </Link>
              <button
                type="button"
                className="neo-btn neo-btn--success neo-btn--xs"
                onClick={() => transitionIncident(secondary.id, 'resolved', me?.id ?? 'u-lucas', 'SMS carrier failover complete')}
              >
                <CheckCircle2 />
                <span>Mark Resolved</span>
              </button>
            </div>
          </div>
        </NeoPanel>
      )}
    </>
  );

  return <NeoHome main={mainCol} side={sideCol} sideLabel="On-call & recovery overview" />;
}
