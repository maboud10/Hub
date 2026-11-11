/**
 * Shared UI primitives, trackers, and cross-app bridge helpers for Incident Command ("Sentinel").
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  GitBranch,
  Lock,
  MessageSquare,
  Radio,
  ShieldAlert,
  Siren,
  Sparkles,
  UserCheck,
  Video,
} from 'lucide-react';
import { Chip, NeoTracker, Orb, type NeoTrackStep, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import { clockText, minutesText } from '@/incidents/engine';
import { ALERT_SEV_META, COMPONENT_META, PHASE_META, SEV_META, STAKEHOLDERS, DEFAULT_STAKEHOLDERS, STATUS_META } from '@/incidents/meta';
import { useIncidents } from '@/incidents/store';
import type {
  AlertSeverity,
  ComponentStatus,
  Incident,
  IncidentStatus,
  Postmortem,
  Severity,
  StatusPhase,
} from '@/incidents/types';

export interface SentinelCtxValue {
  openDeclare: (preset?: { title?: string; severity?: Severity; service?: string }) => void;
  openNova: (prompt?: string) => void;
  selectedIncidentId: string;
  setSelectedIncidentId: (id: string) => void;
}

export const SentinelCtx = createContext<SentinelCtxValue>({
  openDeclare: () => {},
  openNova: () => {},
  selectedIncidentId: 'inc-2047',
  setSelectedIncidentId: () => {},
});

export const useSentinelCtx = () => useContext(SentinelCtx);

export function useHubUser(userId?: string): User | undefined {
  const users = useHub((s) => s.users);
  return users.find((u) => u.id === userId);
}

export function UserPill({ userId, roleLabel, size = 22 }: { userId?: string; roleLabel?: string; size?: number }) {
  const user = useHubUser(userId);
  if (!user) {
    return (
      <span className="inc-userpill inc-userpill--empty">
        <span>Unassigned</span>
      </span>
    );
  }
  return (
    <span className="inc-userpill" title={`${user.name} · ${user.title}`}>
      <Avatar user={user} size={size} presence />
      <span className="inc-userpill__name">{user.name}</span>
      {roleLabel && <span className="inc-userpill__role">{roleLabel}</span>}
    </span>
  );
}

export function SevBadge({ severity, solid = true }: { severity: Severity; solid?: boolean }) {
  const meta = SEV_META[severity];
  return (
    <Chip tone={meta.tone} size="sm" solid={solid} icon={<Flame />}>
      <span>{severity}</span>
      <span>·</span>
      <span>{meta.label}</span>
    </Chip>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const meta = STATUS_META[status];
  return (
    <Chip tone={meta.tone} size="sm" icon={<Orb tone={meta.tone} pulse={status !== 'resolved'} size={7} />}>
      <span>{meta.label}</span>
    </Chip>
  );
}

export function AlertSevBadge({ severity }: { severity: AlertSeverity }) {
  const meta = ALERT_SEV_META[severity];
  return (
    <Chip tone={meta.tone} size="sm">
      <span>{meta.label}</span>
    </Chip>
  );
}

export function ComponentBadge({ status }: { status: ComponentStatus }) {
  const meta = COMPONENT_META[status];
  return (
    <Chip tone={meta.tone} size="sm" icon={<Orb tone={meta.tone} pulse={status !== 'operational'} size={7} />}>
      <span>{meta.label}</span>
    </Chip>
  );
}

export function PhaseBadge({ phase }: { phase: StatusPhase }) {
  const meta = PHASE_META[phase];
  return (
    <Chip tone={meta.tone} size="sm">
      <span>{meta.label}</span>
    </Chip>
  );
}

export function relTimeShort(ts: number, now: number): string {
  const diffMins = Math.max(0, Math.round((now - ts) / 60_000));
  if (diffMins < 1) return 'Just now';
  return `${minutesText(diffMins)} ago`;
}

export function LiveElapsedClock({ startedAt, resolvedAt, now }: { startedAt: number; resolvedAt?: number; now: number }) {
  const elapsed = Math.max(0, (resolvedAt ?? now) - startedAt);
  return (
    <span className="inc-clock neo-mono" data-active={!resolvedAt || undefined} title="Elapsed incident duration">
      <Clock />
      <span>{clockText(elapsed)}</span>
    </span>
  );
}

/* ───────────── 5-Stage Incident Lifecycle NeoTracker ───────────── */

export const INCIDENT_5_STAGES = [
  'Declared & Paged',
  'Triaging & Scope',
  'Mitigating',
  'Monitoring Fix',
  'Resolved & Postmortem',
] as const;

export function incidentStageIndex(inc: Pick<Incident, 'status'>, pm?: Pick<Postmortem, 'status'> | null): number {
  switch (inc.status) {
    case 'triggered':
      return 0;
    case 'acknowledged':
      return 1;
    case 'mitigating':
      return 2;
    case 'monitoring':
      return 3;
    case 'resolved':
      return pm && (pm.status === 'published' || pm.status === 'actions-complete') ? 5 : 4;
  }
}

export function IncidentLifecycleTracker({
  incident,
  postmortem,
  now,
  compact,
  bare,
  actions,
}: {
  incident: Incident;
  postmortem?: Postmortem | null;
  now: number;
  compact?: boolean;
  bare?: boolean;
  actions?: ReactNode;
}) {
  const commander = useHubUser(incident.roles.commander);
  const ops = useHubUser(incident.roles.ops);
  const current = incidentStageIndex(incident, postmortem);

  const steps: NeoTrackStep[] = [
    {
      id: 'declared',
      label: 'Declared & Paged',
      sub: commander ? commander.name : 'On-call paged',
      at: relTimeShort(incident.startedAt, now),
      icon: <Siren />,
    },
    {
      id: 'triaging',
      label: 'Triaging & Scope',
      sub: ops ? ops.name : 'Blast radius & deploys',
      at: incident.ackAt ? relTimeShort(incident.ackAt, now) : undefined,
      icon: <UserCheck />,
    },
    {
      id: 'mitigating',
      label: 'Mitigating',
      sub: incident.freeze?.active ? 'Deploys frozen · Rollback' : 'Traffic shift & fix',
      at: incident.mitigatingAt ? relTimeShort(incident.mitigatingAt, now) : undefined,
      icon: <ShieldAlert />,
    },
    {
      id: 'monitoring',
      label: 'Monitoring Fix',
      sub: 'Synthetic probes & SLOs',
      at: incident.monitoringAt ? relTimeShort(incident.monitoringAt, now) : undefined,
      icon: <Activity />,
    },
    {
      id: 'resolved',
      label: 'Resolved & Postmortem',
      sub: postmortem ? `RCA · ${postmortem.status}` : 'Blameless RCA',
      at: incident.resolvedAt ? relTimeShort(incident.resolvedAt, now) : undefined,
      icon: <CheckCircle2 />,
    },
  ];

  const liveMsg =
    incident.status === 'resolved'
      ? postmortem
        ? `Incident resolved — postmortem is in ${postmortem.status} stage.`
        : 'Incident resolved — ready for Nova blameless postmortem draft.'
      : incident.summary;

  return (
    <NeoTracker
      hud="Incident lifecycle tracker"
      title={`${incident.code} · ${incident.title}`}
      steps={steps}
      current={current}
      state={incident.status === 'resolved' && current >= 5 ? 'done' : 'active'}
      eta={<LiveElapsedClock startedAt={incident.startedAt} resolvedAt={incident.resolvedAt} now={now} />}
      message={liveMsg}
      compact={compact}
      bare={bare}
      actions={actions}
    />
  );
}

/* ───────────── 5-Stage Postmortem Lifecycle NeoTracker ───────────── */

export function postmortemStageIndex(pm: Postmortem): number {
  const allActionsDone = pm.actions.length > 0 && pm.actions.every((a) => a.done);
  if (pm.status === 'actions-complete' || (pm.status === 'published' && allActionsDone)) return 5;
  if (pm.status === 'published') return 4;
  if (pm.status === 'review') return 2;
  return 1; // draft -> Timeline Captured (0 done), live on Nova RCA Draft (1)
}

export function PostmortemLifecycleTracker({
  postmortem,
  compact,
  bare,
  actions,
}: {
  postmortem: Postmortem;
  compact?: boolean;
  bare?: boolean;
  actions?: ReactNode;
}) {
  const author = useHubUser(postmortem.authorId);
  const doneCount = postmortem.actions.filter((a) => a.done).length;
  const totalCount = postmortem.actions.length;
  const current = postmortemStageIndex(postmortem);

  const steps: NeoTrackStep[] = [
    {
      id: 'captured',
      label: 'Timeline Captured',
      sub: 'War Room signals locked',
      icon: <Clock />,
    },
    {
      id: 'draft',
      label: 'Nova RCA Draft',
      sub: author ? author.name : '5 Whys & root cause',
      icon: <Sparkles />,
    },
    {
      id: 'review',
      label: 'Team Review',
      sub: `${postmortem.reviewerIds.length} reviewers`,
      icon: <UserCheck />,
    },
    {
      id: 'published',
      label: 'Published to Wiki',
      sub: postmortem.wikiTo ? 'Shared in Handbook' : 'Pending publish',
      icon: <FileText />,
    },
    {
      id: 'actions',
      label: 'Actions Verified',
      sub: `${doneCount}/${totalCount} tasks done`,
      icon: <CheckCircle2 />,
    },
  ];

  return (
    <NeoTracker
      hud="Blameless postmortem tracker"
      title={postmortem.title}
      steps={steps}
      current={current}
      state={current >= 5 ? 'done' : 'active'}
      eta={`${doneCount}/${totalCount} actions`}
      compact={compact}
      bare={bare}
      actions={actions}
    />
  );
}

/* ───────────── Cross-App Bridge Actions ───────────── */

export async function triggerDeployFreeze(incident: Incident, freeze: boolean, actorId: string) {
  const reason = freeze
    ? `Frozen by Incident Command during ${incident.code} (${incident.severity}: ${incident.title})`
    : `Deploy freeze lifted for ${incident.code}`;
  let synced = false;
  try {
    const viewer = currentViewer();
    if (viewer) {
      const devhub = await loadBridge('devhub');
      const res = devhub.setDeployFreeze(viewer, {
        frozen: freeze,
        reason,
        source: { app: 'incidents', label: incident.code, to: `/incidents/war-room?id=${incident.id}` },
      });
      synced = res.ok;
    }
  } catch {
    synced = false;
  }
  useIncidents.getState().setDeployFreeze(incident.id, freeze, reason, actorId, synced);
  toast.success(freeze ? 'Production deploys frozen' : 'Deploy freeze lifted', reason);
}

export async function broadcastToPulseChat(incident: Incident, customText?: string, actorId = 'u-aisha') {
  const text =
    customText?.trim() ||
    `[${incident.code} · ${incident.severity}] Status: ${incident.status.toUpperCase()} — ${incident.summary}`;
  try {
    const viewer = currentViewer();
    if (viewer) {
      const chat = await loadBridge('chat');
      const channels = chat.listChannels(viewer);
      const target =
        channels.find((c) => c.name.toLowerCase().includes('incident') || c.name.toLowerCase().includes('eng') || c.name.toLowerCase().includes('general')) ??
        channels[0];
      if (target) {
        chat.postToChannel(viewer, {
          channelId: target.id,
          text,
          asBot: true,
          card: {
            app: 'incidents',
            title: `${incident.code} · ${incident.title}`,
            subtitle: `${incident.severity} · ${incident.services.join(', ')} · ${incident.regions.join(', ')}`,
            to: `/incidents/war-room?id=${incident.id}`,
            status: STATUS_META[incident.status].label,
          },
        });
      }
    }
  } catch {
    // fallback if chat store unavailable
  }
  useIncidents.getState().recordComms(incident.id, 'chat', `Broadcast status to Pulse Chat: ${text}`, actorId);
  toast.success('Status broadcast to Pulse Chat', `${incident.code} card posted to #incidents`);
}

export async function sendStakeholderEmail(incident: Incident, actorId = 'u-aisha') {
  const recipientIds = Array.from(
    new Set([
      ...(incident.services.flatMap((s) => STAKEHOLDERS[s] ?? [])),
      ...DEFAULT_STAKEHOLDERS,
    ]),
  );
  const subject = `[${incident.code} · ${incident.severity}] ${incident.title} (${STATUS_META[incident.status].label})`;
  const body = `Stakeholder update for ${incident.code}:\n\n• Severity: ${incident.severity}\n• Status: ${STATUS_META[incident.status].label}\n• Services: ${incident.services.join(', ')}\n• Regions: ${incident.regions.join(', ')}\n• Summary: ${incident.summary}\n• Customer impact: ${incident.impactNote || `${incident.impact}/100`}`;

  try {
    const viewer = currentViewer();
    if (viewer) {
      const mail = await loadBridge('mail');
      mail.sendMail(viewer, {
        to: recipientIds,
        subject,
        body,
        source: { app: 'incidents', label: incident.code, to: `/incidents/war-room?id=${incident.id}` },
      });
    }
  } catch {
    // fallback
  }
  useIncidents.getState().recordComms(incident.id, 'mail', `Sent stakeholder email update (${recipientIds.length} recipients)`, actorId);
  toast.success('Stakeholder update emailed', `Sent via Nova Inbox to ${recipientIds.length} stakeholders`);
}

export function buildMailComposeUrl(incident: Incident): string {
  const recipientIds = Array.from(
    new Set([
      ...(incident.services.flatMap((s) => STAKEHOLDERS[s] ?? [])),
      ...DEFAULT_STAKEHOLDERS,
    ]),
  );
  const users = useHub.getState().users;
  const emails = recipientIds.map((id) => users.find((u) => u.id === id)?.email ?? id).join(',');
  const subject = `[${incident.code} · ${incident.severity}] ${incident.title}`;
  const body = `${incident.summary}\n\nWar Room: /incidents/war-room?id=${incident.id}`;
  return `/mail?compose=1&to=${encodeURIComponent(emails)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function timelineKindMeta(kind: Incident['timeline'][number]['kind']): { icon: ReactNode; tone: Tone; label: string } {
  switch (kind) {
    case 'alert':
      return { icon: <Bell />, tone: 'danger', label: 'Alert' };
    case 'deploy':
      return { icon: <GitBranch />, tone: 'orange', label: 'Deploy' };
    case 'freeze':
      return { icon: <Lock />, tone: 'warning', label: 'Freeze' };
    case 'nova':
      return { icon: <Sparkles />, tone: 'violet', label: 'Nova AI' };
    case 'page':
      return { icon: <Radio />, tone: 'orange', label: 'Pager' };
    case 'comms':
      return { icon: <MessageSquare />, tone: 'cyan', label: 'Comms' };
    case 'status':
      return { icon: <Siren />, tone: 'app', label: 'Lifecycle' };
    case 'action':
      return { icon: <CheckCircle2 />, tone: 'success', label: 'Runbook' };
    case 'role':
      return { icon: <UserCheck />, tone: 'blue', label: 'Role' };
    case 'health':
      return { icon: <AlertTriangle />, tone: 'warning', label: 'Health' };
    default:
      return { icon: <Video />, tone: 'slate', label: 'Note' };
  }
}

export function WarRoomBridgeLink({ incident }: { incident: Incident }) {
  return (
    <Link
      to={`/meet/room?incident=${encodeURIComponent(incident.code)}`}
      className="neo-btn neo-btn--soft neo-btn--sm"
      title="Join HoloMeet incident bridge"
    >
      <Video />
      <span>HoloMeet War Room</span>
    </Link>
  );
}
