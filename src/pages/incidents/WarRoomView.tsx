/**
 * War Room View (`/incidents/war-room`) — live 5-stage incident lifecycle tracker,
 * 1-click deploy freeze, HoloMeet war-room bridge, Pulse Chat status broadcast,
 * Mail stakeholder update, interactive runbook checklist, command roles, and timeline.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Activity,
  CheckCircle2,
  FileText,
  GitBranch,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Unlock,
  UserCheck,
  Video,
} from 'lucide-react';
import { Bar, Chip, NeoHome, NeoPanel, NeoTabs, PeoplePicker } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { canTransition } from '@/incidents/engine';
import { ROLE_KEYS, ROLE_META, STATUS_META } from '@/incidents/meta';
import { useIncidents } from '@/incidents/store';
import type { IncidentStatus } from '@/incidents/types';
import {
  IncidentLifecycleTracker,
  SevBadge,
  UserPill,
  broadcastToPulseChat,
  buildMailComposeUrl,
  relTimeShort,
  sendStakeholderEmail,
  timelineKindMeta,
  triggerDeployFreeze,
  useSentinelCtx,
} from './parts';

type TimelineFilter = 'all' | 'signals' | 'actions' | 'comms';

export function WarRoomView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const now = useNow(1_000);
  const [params, setParams] = useSearchParams();
  const { selectedIncidentId, setSelectedIncidentId } = useSentinelCtx();

  const incidents = useIncidents((s) => s.incidents);
  const postmortems = useIncidents((s) => s.postmortems);
  const deploys = useIncidents((s) => s.deploys);
  const health = useIncidents((s) => s.health);

  const transitionIncident = useIncidents((s) => s.transitionIncident);
  const assignRole = useIncidents((s) => s.assignRole);
  const addTimelineNote = useIncidents((s) => s.addTimelineNote);
  const toggleRunbookItem = useIncidents((s) => s.toggleRunbookItem);
  const ackPaging = useIncidents((s) => s.ackPaging);
  const escalatePaging = useIncidents((s) => s.escalatePaging);
  const setWarRoomBridge = useIncidents((s) => s.setWarRoomBridge);
  const generatePostmortem = useIncidents((s) => s.generatePostmortem);

  const paramId = params.get('id');
  useEffect(() => {
    if (paramId && incidents.some((i) => i.id === paramId)) {
      setSelectedIncidentId(paramId);
    }
  }, [paramId, incidents, setSelectedIncidentId]);

  const incident = useMemo(
    () => incidents.find((i) => i.id === (paramId ?? selectedIncidentId)) ?? incidents[0],
    [incidents, paramId, selectedIncidentId],
  );

  const pm = useMemo(
    () => (incident ? postmortems.find((p) => p.incidentId === incident.id) : undefined),
    [incident, postmortems],
  );

  const [tlFilter, setTlFilter] = useState<TimelineFilter>('all');
  const [noteText, setNoteText] = useState('');
  const [chatText, setChatText] = useState('');

  if (!incident) return null;

  const selectIncident = (id: string) => {
    setSelectedIncidentId(id);
    setParams({ id }, { replace: true });
  };

  const filteredTimeline = incident.timeline
    .slice()
    .sort((a, b) => b.at - a.at)
    .filter((entry) => {
      if (tlFilter === 'all') return true;
      if (tlFilter === 'signals') return entry.kind === 'alert' || entry.kind === 'deploy' || entry.kind === 'health' || entry.kind === 'nova';
      if (tlFilter === 'actions') return entry.kind === 'status' || entry.kind === 'action' || entry.kind === 'freeze' || entry.kind === 'role';
      return entry.kind === 'comms' || entry.kind === 'page' || entry.kind === 'update';
    });

  const doneSteps = incident.runbook.filter((r) => r.done).length;
  const runbookPct = incident.runbook.length ? doneSteps / incident.runbook.length : 0;

  const serviceDeploys = deploys.filter((d) => incident.services.includes(d.service));
  const serviceHealth = health.filter((h) => incident.services.includes(h.service));

  const onAddNote = (e: FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    addTimelineNote(incident.id, noteText, me?.id ?? 'u-lucas', 'update', 'human');
    setNoteText('');
  };

  const launchHoloMeetWarRoom = async () => {
    try {
      const { useMeet } = await import('@/meet/store');
      const room = useMeet.getState().launchInstantRoom(`${incident.code} · ${incident.title}`, 'incident');
      setWarRoomBridge(incident.id, room.id, me?.id ?? 'u-omar');
      navigate(`/meet/room?incident=${encodeURIComponent(incident.code)}&room=${encodeURIComponent(room.id)}`);
    } catch {
      navigate(`/meet/room?incident=${encodeURIComponent(incident.code)}`);
    }
  };

  const nextStatuses: IncidentStatus[] = (['acknowledged', 'mitigating', 'monitoring', 'resolved'] as IncidentStatus[]).filter((st) =>
    canTransition(incident.status, st),
  );

  const mainCol = (
    <>
      {/* Incident Switcher Strip */}
      <div className="inc-switcher" role="tablist" aria-label="Select incident for War Room">
        {incidents.map((inc) => {
          const active = inc.id === incident.id;
          return (
            <button
              key={inc.id}
              type="button"
              role="tab"
              aria-selected={active}
              className="inc-switcher__pill"
              data-active={active || undefined}
              onClick={() => selectIncident(inc.id)}
            >
              <span className="neo-mono">{inc.code}</span>
              <SevBadge severity={inc.severity} solid={active} />
              <span className="truncate">{inc.title}</span>
            </button>
          );
        })}
      </div>

      {/* 5-Stage Lifecycle NeoTracker */}
      <IncidentLifecycleTracker
        incident={incident}
        postmortem={pm}
        now={now}
        actions={
          <div className="inc-tracker-actions">
            {nextStatuses.map((st) => (
              <button
                key={st}
                type="button"
                className={st === 'resolved' ? 'neo-btn neo-btn--success neo-btn--xs' : 'neo-btn neo-btn--plasma neo-btn--xs'}
                onClick={() => transitionIncident(incident.id, st, me?.id ?? 'u-lucas')}
                data-qa={`inc-transition-${st}`}
              >
                <CheckCircle2 />
                <span>{STATUS_META[st].label}</span>
              </button>
            ))}
            {incident.status === 'resolved' && !pm && (
              <button
                type="button"
                className="neo-btn neo-btn--nova neo-btn--xs"
                onClick={() => {
                  const created = generatePostmortem(incident.id, me?.id ?? 'u-priya');
                  if (created) navigate(`/incidents/postmortems?id=${created.id}`);
                }}
              >
                <Sparkles />
                <span>Draft Nova Postmortem</span>
              </button>
            )}
          </div>
        }
      />

      {/* War Room Command Deck: Deploy Freeze + HoloMeet + Pulse Chat + Mail */}
      <NeoPanel
        hud="War Room bridge & tactical controls"
        title="Command Controls & Stakeholder Comms"
        icon={<ShieldAlert />}
      >
        <div className="inc-war-controls">
          <div className="inc-war-control-card" data-tone={incident.freeze?.active ? 'warning' : 'slate'}>
            <div className="inc-war-control-card__head">
              {incident.freeze?.active ? <Lock /> : <Unlock />}
              <div>
                <div className="neo-hud">DevHub deploy gate</div>
                <h3>{incident.freeze?.active ? 'Production Deploys Frozen' : 'Production Deploys Open'}</h3>
              </div>
            </div>
            <p className="inc-muted">
              {incident.freeze?.active
                ? incident.freeze.reason
                : 'Freeze production pipelines in DevHub to prevent concurrent changes during mitigation.'}
            </p>
            <button
              type="button"
              className={incident.freeze?.active ? 'neo-btn neo-btn--warning neo-btn--sm' : 'neo-btn neo-btn--danger neo-btn--sm'}
              onClick={() => triggerDeployFreeze(incident, !incident.freeze?.active, me?.id ?? 'u-omar')}
              data-qa="war-freeze-btn"
            >
              {incident.freeze?.active ? <Unlock /> : <Lock />}
              <span>{incident.freeze?.active ? 'Lift Deploy Freeze' : '1-Click Freeze Deploys'}</span>
            </button>
          </div>

          <div className="inc-war-control-card">
            <div className="inc-war-control-card__head">
              <Video />
              <div>
                <div className="neo-hud">HoloMeet video bridge</div>
                <h3>{incident.bridge ? `Bridge Active (${incident.bridge.meetRoomId})` : 'Incident Audio/Video Bridge'}</h3>
              </div>
            </div>
            <p className="inc-muted">
              Spin up or join the spatial HoloMeet War Room pre-configured for {incident.code} responders.
            </p>
            <div className="inc-inline-actions">
              <Link
                to={`/meet/room?incident=${encodeURIComponent(incident.code)}`}
                className="neo-btn neo-btn--plasma neo-btn--sm"
                data-qa="war-holomeet-link"
              >
                <Video />
                <span>Join War Room Bridge</span>
              </Link>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={launchHoloMeetWarRoom}>
                <Plus />
                <span>Launch Instant Room</span>
              </button>
            </div>
          </div>

          <div className="inc-war-control-card">
            <div className="inc-war-control-card__head">
              <MessageSquare />
              <div>
                <div className="neo-hud">Pulse Chat & Nova Inbox</div>
                <h3>Stakeholder Broadcast ({incident.chatPosts} Chat · {incident.mails} Mail)</h3>
              </div>
            </div>
            <div className="inc-comms-inline">
              <input
                type="text"
                className="neo-input neo-input--sm"
                placeholder={`Status update for ${incident.code}…`}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
              />
              <div className="inc-inline-actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--xs"
                  onClick={() => {
                    broadcastToPulseChat(incident, chatText || undefined, me?.id ?? 'u-aisha');
                    setChatText('');
                  }}
                  data-qa="war-chat-btn"
                >
                  <MessageSquare />
                  <span>Broadcast to Chat</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--xs"
                  onClick={() => sendStakeholderEmail(incident, me?.id ?? 'u-aisha')}
                >
                  <Send />
                  <span>1-Click Email</span>
                </button>
                <Link
                  to={buildMailComposeUrl(incident)}
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  data-qa="war-mail-compose"
                >
                  <Mail />
                  <span>Compose in Mail</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </NeoPanel>

      {/* Auto-Captured War Room Timeline */}
      <NeoPanel
        hud="Immutable audit & signal stream"
        title="Auto-Captured War Room Timeline"
        icon={<Activity />}
        actions={
          <NeoTabs
            label="Filter timeline"
            value={tlFilter}
            onChange={setTlFilter}
            items={[
              { value: 'all', label: 'All', count: incident.timeline.length },
              { value: 'signals', label: 'Signals' },
              { value: 'actions', label: 'Actions' },
              { value: 'comms', label: 'Comms' },
            ]}
          />
        }
      >
        <form className="inc-scribe-form" onSubmit={onAddNote}>
          <input
            type="text"
            className="neo-input"
            placeholder="Log a scribe note, mitigation hypothesis, or customer metric…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            data-qa="war-scribe-input"
          />
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm">
            <Plus />
            <span>Append to Timeline</span>
          </button>
        </form>

        <ol className="inc-timeline">
          {filteredTimeline.map((entry) => {
            const meta = timelineKindMeta(entry.kind);
            return (
              <li key={entry.id} className="inc-timeline__item">
                <span className="inc-timeline__node" data-tone={meta.tone}>
                  {meta.icon}
                </span>
                <div className="inc-timeline__content">
                  <div className="inc-timeline__meta">
                    <Chip tone={meta.tone} size="sm">
                      <span>{meta.label}</span>
                    </Chip>
                    <span className="neo-mono inc-muted">{relTimeShort(entry.at, now)}</span>
                    {entry.authorId && <UserPill userId={entry.authorId} size={18} />}
                  </div>
                  <p className="inc-timeline__text">{entry.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </NeoPanel>
    </>
  );

  const sideCol = (
    <>
      {/* Command Roles */}
      <NeoPanel hud="ICS command chain" title="Incident Roles" icon={<UserCheck />}>
        <div className="inc-roles-list">
          {ROLE_KEYS.map((roleKey) => {
            const meta = ROLE_META[roleKey];
            const uid = incident.roles[roleKey];
            return (
              <div key={roleKey} className="inc-role-row">
                <div>
                  <div className="inc-role-row__label">{meta.label}</div>
                  <div className="inc-muted">{meta.hint}</div>
                </div>
                <PeoplePicker
                  value={uid ? [uid] : []}
                  allowNone
                  onChange={(ids) => assignRole(incident.id, roleKey, ids[0], me?.id)}
                  label={`Assign ${meta.label}`}
                  trigger={(props) => (
                    <button {...props} type="button" className="neo-btn neo-btn--soft neo-btn--xs">
                      <UserPill userId={uid} />
                    </button>
                  )}
                />
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Paging Status */}
      <NeoPanel hud="Responder paging" title="Pager & Escalation Status" icon={<Radio />}>
        <div className="inc-side-card">
          <div className="inc-paging-targets">
            {incident.paging.targets.map((t) => (
              <UserPill key={t.userId} userId={t.userId} />
            ))}
          </div>
          <p className="inc-muted">
            {incident.paging.ackAt
              ? `Acknowledged ${relTimeShort(incident.paging.ackAt, now)}`
              : 'Awaiting on-call acknowledgement'}
          </p>
          <div className="inc-inline-actions">
            {!incident.paging.ackAt && (
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--xs"
                onClick={() => ackPaging(incident.id, me?.id ?? 'u-lucas')}
              >
                <CheckCircle2 />
                <span>Acknowledge Page</span>
              </button>
            )}
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              onClick={() => escalatePaging(incident.id, me?.id ?? 'u-omar')}
            >
              <Radio />
              <span>Escalate Page</span>
            </button>
          </div>
        </div>
      </NeoPanel>

      {/* Runbook Checklist */}
      <NeoPanel
        hud={`Remediation runbook · ${doneSteps}/${incident.runbook.length}`}
        title="Service Runbook Steps"
        icon={<FileText />}
      >
        <Bar value={runbookPct} label="Runbook completion" />
        <div className="inc-runbook-list">
          {incident.runbook.map((item) => (
            <label key={item.id} className="inc-runbook-item" data-done={item.done || undefined}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleRunbookItem(incident.id, item.id, me?.id ?? 'u-lucas')}
              />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      </NeoPanel>

      {/* Suspect Deploys & Cloud Telemetry */}
      <NeoPanel hud="Correlated signals" title="Suspect Deploys & SLOs" icon={<GitBranch />}>
        <div className="inc-side-list">
          {serviceDeploys.map((dep) => (
            <div key={dep.id} className="inc-signal-row">
              <div>
                <b className="neo-mono">{dep.service} · {dep.version}</b>
                <div className="inc-muted">{relTimeShort(dep.at, now)} · {dep.region ?? 'global'}</div>
              </div>
              <Link to={dep.to} className="neo-btn neo-btn--soft neo-btn--xs">
                <span>Inspect in DevHub</span>
              </Link>
            </div>
          ))}
          {serviceHealth.map((h) => (
            <div key={h.service} className="inc-signal-row">
              <div>
                <b className="neo-mono">{h.service} ({h.region})</b>
                <div className="inc-muted neo-mono">p95 {h.latencyMs}ms · err {(h.errorRate * 100).toFixed(2)}%</div>
              </div>
              <Chip tone={h.status === 'healthy' ? 'success' : 'warning'} size="sm">
                <span>{h.status}</span>
              </Chip>
            </div>
          ))}
        </div>
      </NeoPanel>
    </>
  );

  return (
    <NeoHome
      main={mainCol}
      side={sideCol}
      sideLabel="War Room roles, runbook, and signals"
    />
  );
}
