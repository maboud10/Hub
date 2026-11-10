/**
 * Service Status & Incident Command (/helpdesk/status)
 * Live health across Helix services, 90-day uptime telemetry, active incident
 * timelines with office impact, IT inline/modal incident commander, and
 * scheduled maintenance windows.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowRight,
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleCheck,
  Clock3,
  Globe,
  History,
  MapPin,
  Plus,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  TicketPlus,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoHead, NeoPanel, NeoStage, Orb, Ring, type Tone } from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime, relativeTime } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { Incident, IncidentSeverity, IncidentStatus, Maintenance, Office, Service } from '@/helpdesk/types';
import {
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUSES,
  OFFICES,
  officeOf,
  SERVICE_HEALTH_LABEL,
  SERVICE_HEALTH_TONE,
  SEVERITY_LABEL,
  SEVERITY_TONE,
} from '@/helpdesk/meta';
import { activeIncidents, serviceHealth, uptimePct } from '@/helpdesk/queries';
import { formatDuration } from '@/helpdesk/sla';
import { plural, useOpenTicket, useViewer, type HdViewer } from './ui';
import '@/styles/helpdesk/status.css';

type GroupFilter = 'All' | Service['group'];
const SERVICE_GROUPS: GroupFilter[] = ['All', 'Identity', 'Network', 'Collaboration', 'Engineering', 'Workplace'];
const SEVERITIES: IncidentSeverity[] = ['minor', 'major', 'critical'];

export function StatusView(_props?: { admin?: boolean; onClose?: () => void }) {
  const viewer = useViewer();
  const services = useHelpdesk((s) => s.services);
  const incidents = useHelpdesk((s) => s.incidents);
  const maintenance = useHelpdesk((s) => s.maintenance);
  const statusSubs = useHelpdesk((s) => s.statusSubs);
  const users = useHub((s) => s.users);
  const openTicket = useOpenTicket();
  const now = useNow(30_000);

  const [group, setGroup] = useState<GroupFilter>('All');
  const [declareOpen, setDeclareOpen] = useState(false);

  const it = !!viewer?.it;
  const me = viewer?.user.id ?? '';
  const myOffice = officeOf(viewer?.user.location);
  const subscribed = statusSubs.includes(me);

  const rows = useMemo(
    () =>
      services.map((s) => ({
        s,
        ...serviceHealth(s, incidents, maintenance, now),
        uptime90: uptimePct(s),
      })),
    [services, incidents, maintenance, now],
  );

  const degradedRows = useMemo(() => rows.filter((r) => r.health !== 'operational'), [rows]);
  const liveIncidents = useMemo(() => activeIncidents(incidents), [incidents]);
  const pastIncidents = useMemo(
    () => incidents.filter((i) => i.status === 'resolved').sort((a, b) => (b.resolvedAt ?? b.startedAt) - (a.resolvedAt ?? a.startedAt)),
    [incidents],
  );
  const upcomingMnt = useMemo(() => [...maintenance].filter((m) => m.endsAt > now).sort((a, b) => a.startsAt - b.startsAt), [maintenance, now]);

  const fleetUptime = useMemo(() => {
    if (!rows.length) return 100;
    const sum = rows.reduce((acc, r) => acc + r.uptime90, 0);
    return Math.round((sum / rows.length) * 100) / 100;
  }, [rows]);

  const filteredRows = useMemo(() => (group === 'All' ? rows : rows.filter((r) => r.s.group === group)), [rows, group]);

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? 'IT Command';

  const onToggleSub = () => {
    const r = useHelpdesk.getState().toggleStatusSub(viewer);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      r.subscribed ? 'Subscribed to status updates' : 'Unsubscribed from status updates',
      r.subscribed ? 'You’ll get bell notifications whenever an incident changes.' : 'Incident notifications turned off.',
    );
  };

  return (
    <NeoStage label="Service status">
      <NeoHead
        icon={<Activity />}
        eyebrow="Support deck · Live"
        title="Service status"
        sub={
          degradedRows.length === 0
            ? `All ${services.length} systems operational · ${fleetUptime.toFixed(2)}% 90-day uptime`
            : `${plural(degradedRows.length, 'service')} degraded · ${plural(liveIncidents.length, 'active incident')}`
        }
        actions={
          <>
            <button
              type="button"
              className="neo-btn neo-btn--soft"
              aria-pressed={subscribed}
              onClick={onToggleSub}
              data-qa="status-subscribe"
              title={subscribed ? 'Unsubscribe from live incident updates' : 'Get notified when incidents are posted or resolved'}
            >
              {subscribed ? <BellRing /> : <Bell />}
              <span className="neo-btn__label">{subscribed ? 'Subscribed' : 'Subscribe'}</span>
            </button>
            {it ? (
              <button
                type="button"
                className="neo-btn neo-btn--plasma"
                onClick={() => setDeclareOpen(true)}
                data-qa="status-declare"
              >
                <Siren />
                <span className="neo-btn__label">Declare incident</span>
              </button>
            ) : (
              <button
                type="button"
                className="neo-btn neo-btn--plasma"
                onClick={() => openTicket({ category: 'network', subject: 'Service connectivity issue' })}
                data-qa="status-report"
              >
                <Plus />
                <span className="neo-btn__label">Report issue</span>
              </button>
            )}
          </>
        }
      />

      <div className="neo-body neo-pad">
        <div className="hd-status-layout">
          <div className="hd-status-main">
            {/* Overall Health Hero Banner */}
            <section
              className="hd-status-hero"
              data-degraded={degradedRows.length > 0 ? 'true' : undefined}
              aria-label="Overall system health"
              data-qa="status-hero"
            >
              <div className="hd-status-hero__grid" aria-hidden="true" />
              <div className="hd-status-hero__left">
                <span className="hd-status-hero__badge">
                  <Orb
                    tone={degradedRows.length === 0 ? 'emerald' : 'amber'}
                    pulse={degradedRows.length > 0}
                    size={8}
                  />
                  {degradedRows.length === 0 ? 'Live telemetry · All green' : 'Incident command active'}
                </span>
                <h2 className="hd-status-hero__title">
                  {degradedRows.length === 0
                    ? 'All systems operational'
                    : `${plural(degradedRows.length, 'service')} degraded`}
                </h2>
                <p className="hd-status-hero__sub">
                  {degradedRows.length === 0
                    ? `Every core identity, network and workplace service is healthy${myOffice !== 'Remote' ? ` in ${myOffice}` : ''}.`
                    : liveIncidents.some((i) => !i.offices || i.offices.includes(myOffice))
                      ? `An active incident affects ${myOffice === 'Remote' ? 'your connection' : myOffice} — our engineering team is posting live updates below.`
                      : `Degradation is isolated to ${liveIncidents.flatMap((i) => i.offices ?? []).join(', ') || 'specific regions'} — ${myOffice === 'Remote' ? 'your setup' : myOffice} is unaffected.`}
                </p>
                <div className="hd-status-hero__pills">
                  <span className="hd-status-hero__stat">
                    <CheckCircle2 size={14} />
                    Operational <b>{services.length - degradedRows.length}/{services.length}</b>
                  </span>
                  <span className="hd-status-hero__stat">
                    <MapPin size={14} />
                    Your office <b>{myOffice}</b>
                  </span>
                  <span className="hd-status-hero__stat">
                    <BellRing size={14} />
                    Subscribers <b>{statusSubs.length}</b>
                  </span>
                </div>
              </div>

              <div className="hd-status-hero__right">
                <div className="hd-status-hero__ringwrap">
                  <Ring
                    value={fleetUptime / 100}
                    size={92}
                    stroke={7}
                    color={degradedRows.length === 0 ? 'var(--hd-ok)' : 'var(--hd-warn)'}
                    label={`${fleetUptime.toFixed(2)}% 90-day uptime`}
                  >
                    <span className="hd-status-hero__pct">
                      {fleetUptime < 100 ? (Math.floor(fleetUptime * 10) / 10).toFixed(1) : '100'}
                      <small>%</small>
                    </span>
                  </Ring>
                  <span className="neo-hud">90-day uptime</span>
                </div>
                <dl className="hd-status-hero__kv">
                  <div>
                    <dt className="neo-hud">Active incidents</dt>
                    <dd className="neo-num">{liveIncidents.length}</dd>
                  </div>
                  <div>
                    <dt className="neo-hud">Scheduled maint.</dt>
                    <dd className="neo-num">{upcomingMnt.length}</dd>
                  </div>
                  <div>
                    <dt className="neo-hud">Resolved (90d)</dt>
                    <dd className="neo-num">{pastIncidents.length}</dd>
                  </div>
                </dl>
              </div>
            </section>

            {/* Active Incidents */}
            <NeoPanel
              hud="Live command"
              title={liveIncidents.length ? `Active incidents (${liveIncidents.length})` : 'Active incidents'}
              icon={<Siren />}
              actions={
                it && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => setDeclareOpen(true)}
                  >
                    <Plus /> Declare
                  </button>
                )
              }
            >
              {liveIncidents.length === 0 ? (
                <div className="hd-allclear">
                  <CircleCheck />
                  <div>
                    <b>Zero active incidents</b>
                    <span>No service disruptions or degradations are open right now.</span>
                  </div>
                </div>
              ) : (
                <div className="hd-status-incidents">
                  {liveIncidents.map((inc) => (
                    <ActiveIncidentCard
                      key={inc.id}
                      inc={inc}
                      myOffice={myOffice}
                      it={it}
                      viewer={viewer}
                      serviceById={serviceById}
                      userName={userName}
                      now={now}
                      onOpenTicket={() =>
                        openTicket({
                          category: 'network',
                          subject: `Impacted by ${inc.id}: ${inc.title}`,
                          description: `Experiencing issues related to ${inc.id} (${inc.title}).`,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </NeoPanel>

            {/* Services Matrix with 90-day uptime bars */}
            <NeoPanel
              hud="90-day telemetry"
              title="Services matrix"
              icon={<Activity />}
              actions={<span className="neo-faint text-sm hd-status-hint">Daily uptime · oldest → today</span>}
            >
              <div className="hd-status-groups" role="tablist" aria-label="Filter services by group">
                {SERVICE_GROUPS.map((g) => {
                  const count = g === 'All' ? rows.length : rows.filter((r) => r.s.group === g).length;
                  return (
                    <Chip
                      key={g}
                      tone={group === g ? 'app' : 'slate'}
                      pressed={group === g}
                      onClick={() => setGroup(g)}
                    >
                      {g} <span className="neo-mono">{count}</span>
                    </Chip>
                  );
                })}
              </div>

              <div className="hd-status-matrix">
                {filteredRows.map(({ s, health, incident, maintenance: mnt, uptime90 }) => {
                  const tone = SERVICE_HEALTH_TONE[health] as Tone;
                  return (
                    <article
                      key={s.id}
                      className="hd-status-svc"
                      data-health={health}
                      data-qa={`service-row-${s.id}`}
                    >
                      <div className="hd-status-svc__top">
                        <div className="hd-status-svc__info">
                          <Orb tone={tone} pulse={health !== 'operational'} size={9} title={SERVICE_HEALTH_LABEL[health]} />
                          <div>
                            <div className="hd-status-svc__name">
                              {s.name}{' '}
                              {s.office && (
                                <Chip size="sm" tone={s.office === myOffice ? 'app' : 'slate'}>
                                  {s.office}
                                </Chip>
                              )}
                            </div>
                            <div className="hd-status-svc__desc">
                              {s.group} · {s.description}
                            </div>
                          </div>
                        </div>

                        <div className="hd-status-svc__right">
                          <span className="hd-status-svc__pct">{uptime90.toFixed(2)}% uptime</span>
                          <span className="hd-status-svc__state" data-tone={tone}>
                            <Orb tone={tone} pulse={health !== 'operational'} size={6} />
                            {SERVICE_HEALTH_LABEL[health]}
                          </span>
                        </div>
                      </div>

                      <div className="hd-status-bars" role="img" aria-label={`${s.name} 90-day uptime: ${uptime90.toFixed(2)}%`}>
                        {s.uptime.map((u, idx) => {
                          const daysAgo = s.uptime.length - 1 - idx;
                          const level = u >= 99.8 ? 'ok' : u >= 99.0 ? 'warn' : 'bad';
                          return (
                            <i
                              key={idx}
                              className="hd-status-bar"
                              data-level={level}
                              title={`${daysAgo === 0 ? 'Today' : `${daysAgo}d ago`} · ${u.toFixed(2)}%`}
                            />
                          );
                        })}
                      </div>

                      <div className="hd-status-svc__scale">
                        <span>90 days ago</span>
                        <span>{uptime90.toFixed(2)}% avg</span>
                        <span>Today</span>
                      </div>

                      {incident && (
                        <div className="hd-status-svc__note">
                          <span>
                            <b>{incident.id}</b> · {incident.title} ({INCIDENT_STATUS_LABEL[incident.status]})
                          </span>
                          <span className="neo-mono">{relativeTime(incident.startedAt, now)}</span>
                        </div>
                      )}
                      {mnt && (
                        <div className="hd-status-svc__note">
                          <span>
                            <b>{mnt.id}</b> · {mnt.title}
                          </span>
                          <span className="neo-mono">Ends {relativeTime(mnt.endsAt, now)}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </NeoPanel>
          </div>

          {/* Side Column: Upcoming Maintenance & Resolved Incident History */}
          <aside className="hd-status-side" aria-label="Maintenance and incident history">
            <NeoPanel
              hud="Planned windows"
              title="Upcoming maintenance"
              icon={<CalendarClock />}
              actions={<span className="neo-count">{upcomingMnt.length}</span>}
            >
              {upcomingMnt.length === 0 ? (
                <NeoEmpty compact icon={<Wrench />} title="No maintenance scheduled">
                  Planned upgrades and change windows will appear here in advance.
                </NeoEmpty>
              ) : (
                <div className="hd-status-mnts">
                  {upcomingMnt.map((m) => (
                    <MaintenanceCard key={m.id} m={m} serviceById={serviceById} now={now} />
                  ))}
                </div>
              )}
            </NeoPanel>

            <NeoPanel
              hud="Post-incident log"
              title="Resolved history"
              icon={<History />}
              actions={<span className="neo-faint text-sm">Last 90 days</span>}
            >
              {pastIncidents.length === 0 ? (
                <NeoEmpty compact icon={<History />} title="No past incidents" />
              ) : (
                <div className="hd-status-incidents">
                  {pastIncidents.map((inc) => (
                    <ResolvedIncidentCard
                      key={inc.id}
                      inc={inc}
                      serviceById={serviceById}
                      userName={userName}
                      now={now}
                    />
                  ))}
                </div>
              )}
            </NeoPanel>

            <NeoPanel hud="Self-service" title="Having trouble right now?" icon={<Sparkles />}>
              <p className="text-sm neo-faint" style={{ margin: '0 0 12px' }}>
                Even when services are green, local certificates or DNS caches can drift. Let Nova run a 60-second check on your device.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/helpdesk" className="neo-btn neo-btn--soft neo-btn--sm">
                  <Sparkles /> Ask Nova
                </Link>
                <Link to="/helpdesk/guides" className="neo-btn neo-btn--ghost neo-btn--sm">
                  Troubleshooting guides <ArrowRight />
                </Link>
              </div>
            </NeoPanel>
          </aside>
        </div>
      </div>

      <DeclareIncidentModal
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        services={services}
        viewer={viewer}
      />
    </NeoStage>
  );
}

/* ==========================================================================
   Active Incident Card + IT Inline Update Form
   ========================================================================== */

function ActiveIncidentCard({
  inc,
  myOffice,
  it,
  viewer,
  serviceById,
  userName,
  now,
  onOpenTicket,
}: {
  inc: Incident;
  myOffice: Office;
  it: boolean;
  viewer: HdViewer | null;
  serviceById: Map<string, Service>;
  userName: (id: string) => string;
  now: number;
  onOpenTicket: () => void;
}) {
  const [status, setStatus] = useState<IncidentStatus>(
    inc.status === 'investigating' ? 'identified' : inc.status === 'identified' ? 'monitoring' : 'resolved',
  );
  const [body, setBody] = useState('');

  const affectsMe = !inc.offices || inc.offices.includes(myOffice);
  const tone = SEVERITY_TONE[inc.severity] as Tone;
  const activeStatuses = INCIDENT_STATUSES;

  const submitUpdate = (e: FormEvent) => {
    e.preventDefault();
    const r = useHelpdesk.getState().postIncidentUpdate(inc.id, status, body, viewer);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${inc.id} · ${INCIDENT_STATUS_LABEL[status]}`, 'Subscribers and #it-help were notified.');
    setBody('');
  };

  return (
    <article className="hd-status-inc" data-tone={tone} data-qa={`incident-${inc.id}`}>
      <div className="hd-status-inc__head">
        <div className="hd-status-inc__titles">
          <div className="hd-status-inc__meta">
            <span className="neo-mono text-xs">{inc.id}</span>
            <Chip size="sm" tone={tone}>
              {SEVERITY_LABEL[inc.severity]}
            </Chip>
            <Chip size="sm" tone={inc.status === 'monitoring' ? 'cyan' : 'amber'}>
              {INCIDENT_STATUS_LABEL[inc.status]}
            </Chip>
            {affectsMe ? (
              <span className="hd-status-inc__affects" data-qa={`incident-affects-${inc.id}`}>
                <TriangleAlert size={12} /> Affects you{inc.offices ? ` (${myOffice})` : ''}
              </span>
            ) : (
              inc.offices && (
                <Chip size="sm" tone="slate" icon={<Globe />}>
                  {inc.offices.join(', ')} only
                </Chip>
              )
            )}
            <span className="text-xs neo-faint">
              <Clock3 size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Started {relativeTime(inc.startedAt, now)}
            </span>
          </div>
          <h3 className="hd-status-inc__title">{inc.title}</h3>
          <div className="hd-status-inc__svcs">
            {inc.serviceIds.map((sid) => {
              const svc = serviceById.get(sid);
              return (
                <Chip key={sid} size="sm" tone="slate">
                  {svc?.name ?? sid}
                </Chip>
              );
            })}
          </div>
        </div>

        <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={onOpenTicket}>
          <TicketPlus /> I’m affected
        </button>
      </div>

      <ol className="hd-status-timeline" aria-label={`Updates for ${inc.title}`}>
        {[...inc.updates].reverse().map((u) => (
          <li key={u.id} className="hd-status-timeline__item">
            <span className="hd-status-timeline__dot" />
            <div className="hd-status-timeline__top">
              <span className="hd-status-timeline__stage">{INCIDENT_STATUS_LABEL[u.status]}</span>
              <span>·</span>
              <span>{relativeTime(u.at, now)}</span>
              <span>·</span>
              <span>{userName(u.authorId)}</span>
            </div>
            <p className="hd-status-timeline__body">{u.body}</p>
          </li>
        ))}
      </ol>

      {it && (
        <form className="hd-status-compose" onSubmit={submitUpdate} data-qa={`incident-update-form-${inc.id}`}>
          <div className="hd-status-compose__row">
            <span className="neo-hud">Post incident update</span>
            <div className="hd-status-compose__stages" role="radiogroup" aria-label="Next incident status">
              {activeStatuses.map((st) => (
                <button
                  key={st}
                  type="button"
                  role="radio"
                  aria-checked={status === st}
                  aria-pressed={status === st}
                  className="hd-status-compose__stage"
                  onClick={() => setStatus(st)}
                >
                  {INCIDENT_STATUS_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
          <div className="hd-status-compose__input">
            <input
              type="text"
              className="neo-input neo-input--sm"
              placeholder={
                status === 'resolved'
                  ? 'Describe how the incident was resolved…'
                  : `Post an update (${INCIDENT_STATUS_LABEL[status].toLowerCase()})…`
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Incident update message"
              data-qa={`incident-update-input-${inc.id}`}
            />
            <button
              type="submit"
              className={status === 'resolved' ? 'neo-btn neo-btn--success neo-btn--sm' : 'neo-btn neo-btn--plasma neo-btn--sm'}
              data-qa={`incident-update-submit-${inc.id}`}
            >
              <Send /> {status === 'resolved' ? 'Resolve incident' : 'Post update'}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

/* ==========================================================================
   Maintenance & Resolved Incident Cards
   ========================================================================== */

function MaintenanceCard({
  m,
  serviceById,
  now,
}: {
  m: Maintenance;
  serviceById: Map<string, Service>;
  now: number;
}) {
  const active = m.startsAt <= now && m.endsAt > now;
  const duration = formatDuration(m.endsAt - m.startsAt, { compact: true });
  return (
    <article className="hd-status-mnt" data-qa={`maintenance-${m.id}`}>
      <div className="hd-status-mnt__top">
        <span className="neo-mono text-xs">{m.id}</span>
        <span className="hd-status-mnt__time">
          {active ? 'In progress now' : relativeTime(m.startsAt, now)} · {duration}
        </span>
      </div>
      <div className="hd-status-mnt__title">{m.title}</div>
      <p className="hd-status-mnt__body">{m.body}</p>
      <div className="hd-status-inc__meta" style={{ marginTop: 4 }}>
        {m.serviceIds.map((id) => (
          <Chip key={id} size="sm" tone="blue">
            {serviceById.get(id)?.name ?? id}
          </Chip>
        ))}
        <span className="text-xs neo-faint">{formatDateTime(m.startsAt)}</span>
      </div>
    </article>
  );
}

function ResolvedIncidentCard({
  inc,
  serviceById,
  userName,
  now,
}: {
  inc: Incident;
  serviceById: Map<string, Service>;
  userName: (id: string) => string;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const duration = formatDuration((inc.resolvedAt ?? now) - inc.startedAt, { compact: true });
  const lastUpdate = inc.updates[inc.updates.length - 1];

  return (
    <article className="hd-status-inc hd-status-inc--resolved" data-qa={`resolved-${inc.id}`}>
      <div className="hd-status-inc__head">
        <div className="hd-status-inc__titles">
          <div className="hd-status-inc__meta">
            <span className="neo-mono text-xs">{inc.id}</span>
            <Chip size="sm" tone="emerald">
              Resolved · {duration}
            </Chip>
            <Chip size="sm" tone={SEVERITY_TONE[inc.severity] as Tone}>
              {SEVERITY_LABEL[inc.severity]}
            </Chip>
            <span className="text-xs neo-faint">{relativeTime(inc.resolvedAt ?? inc.startedAt, now)}</span>
          </div>
          <h3 className="hd-status-inc__title" style={{ fontSize: 15 }}>{inc.title}</h3>
          <div className="hd-status-inc__svcs">
            {inc.serviceIds.map((sid) => (
              <Chip key={sid} size="sm" tone="slate">
                {serviceById.get(sid)?.name ?? sid}
              </Chip>
            ))}
            {inc.offices?.map((o) => (
              <Chip key={o} size="sm" tone="slate">
                {o}
              </Chip>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="neo-btn neo-btn--ghost neo-btn--xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide log' : `${inc.updates.length} updates`}
        </button>
      </div>

      {!expanded && lastUpdate && (
        <p className="text-sm neo-faint" style={{ margin: 0 }}>
          {lastUpdate.body}
        </p>
      )}

      {expanded && (
        <ol className="hd-status-timeline">
          {inc.updates.map((u) => (
            <li key={u.id} className="hd-status-timeline__item">
              <span className="hd-status-timeline__dot" />
              <div className="hd-status-timeline__top">
                <span className="hd-status-timeline__stage">{INCIDENT_STATUS_LABEL[u.status]}</span>
                <span>·</span>
                <span>{formatDateTime(u.at)}</span>
                <span>·</span>
                <span>{userName(u.authorId)}</span>
              </div>
              <p className="hd-status-timeline__body">{u.body}</p>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/* ==========================================================================
   Declare Incident Modal (IT-only)
   ========================================================================== */

function DeclareIncidentModal({
  open,
  onClose,
  services,
  viewer,
}: {
  open: boolean;
  onClose: () => void;
  services: Service[];
  viewer: HdViewer | null;
}) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('minor');
  const [serviceIds, setServiceIds] = useState<string[]>(['vpn']);
  const [offices, setOffices] = useState<Office[]>([]);
  const [body, setBody] = useState('');

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleOffice = (o: Office) => {
    setOffices((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = useHelpdesk.getState().createIncident(
      {
        title,
        serviceIds,
        severity,
        offices: offices.length ? offices : undefined,
        body,
      },
      viewer,
    );
    if (!r.ok) return toast.error(r.error);
    toast.success(`Declared ${r.incident.id}`, `${r.incident.title} is now live on the status page.`);
    setTitle('');
    setBody('');
    setOffices([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Declare incident"
      subtitle="Publish a live service incident and notify status subscribers + #it-help."
      icon={<ShieldAlert />}
      width={560}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="declare-incident-form" className="neo-btn neo-btn--plasma" data-qa="declare-submit">
            <Siren /> Declare incident
          </button>
        </>
      }
    >
      <form id="declare-incident-form" className="hd-status-form" onSubmit={submit}>
        <div className="neo-field">
          <label htmlFor="inc-title">Incident title</label>
          <input
            id="inc-title"
            className="neo-input"
            placeholder="e.g. SSO sign-in latency in Europe"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="neo-field">
          <label>Severity</label>
          <div className="hd-status-picks">
            {SEVERITIES.map((sev) => (
              <Chip
                key={sev}
                tone={SEVERITY_TONE[sev] as Tone}
                pressed={severity === sev}
                onClick={() => setSeverity(sev)}
              >
                {SEVERITY_LABEL[sev]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="neo-field">
          <label>Affected services ({serviceIds.length} selected)</label>
          <div className="hd-status-picks">
            {services.map((s) => (
              <Chip
                key={s.id}
                tone={serviceIds.includes(s.id) ? 'app' : 'slate'}
                pressed={serviceIds.includes(s.id)}
                onClick={() => toggleService(s.id)}
              >
                {s.name}
              </Chip>
            ))}
          </div>
        </div>

        <div className="neo-field">
          <label>Offices affected (leave empty for global)</label>
          <div className="hd-status-picks">
            {OFFICES.map((o) => (
              <Chip
                key={o}
                tone={offices.includes(o) ? 'amber' : 'slate'}
                pressed={offices.includes(o)}
                onClick={() => toggleOffice(o)}
              >
                {o}
              </Chip>
            ))}
          </div>
        </div>

        <div className="neo-field">
          <label htmlFor="inc-body">Initial update</label>
          <textarea
            id="inc-body"
            className="neo-textarea"
            rows={3}
            placeholder="What are people experiencing, and what is IT doing right now?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
      </form>
    </Modal>
  );
}
