/**
 * Security Center ("Bastion") — shared UI primitives, cross-app bridge helpers,
 * severity/stage chips, and the Nova Security Copilot drawer.
 */
import { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flame,
  Shield,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { Chip, NovaChip, type Tone } from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { askBastionNova } from '@/security/engine';
import { seedPersonalSecurity } from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { CaseStage, PersonalSecurity, SecCase, Severity } from '@/security/types';

/* ───────────── Contexts ───────────── */

export interface SecurityModalContextValue {
  openReport: (presetKind?: string) => void;
  openNova: (initialPrompt?: string) => void;
}

export const SecurityModalCtx = createContext<SecurityModalContextValue>({
  openReport: () => {},
  openNova: () => {},
});

export const useSecurityModals = () => useContext(SecurityModalCtx);

export function useMySecurity(): { meId: string; person: PersonalSecurity } {
  const me = useSessionUser();
  const meId = me?.id ?? 'u-layla';
  const person = useSecurity((s) => s.people[meId]) ?? seedPersonalSecurity(meId);
  return { meId, person };
}

/* ───────────── Formatting & Tone Helpers ───────────── */

export function severityTone(sev: Severity): Tone {
  switch (sev) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'orange';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'cyan';
  }
}

export function severityLabel(sev: Severity): string {
  switch (sev) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
  }
}

export function stageLabel(stage: CaseStage): string {
  switch (stage) {
    case 'detected':
      return 'Detected & Enriched';
    case 'triaged':
      return 'Triaged';
    case 'contained':
      return 'Contained';
    case 'eradicated':
      return 'Eradicated & Patched';
    case 'recovered':
    case 'lessons':
      return 'Verified & Closed';
  }
}

export function stageTone(stage: CaseStage): Tone {
  switch (stage) {
    case 'detected':
      return 'danger';
    case 'triaged':
      return 'orange';
    case 'contained':
      return 'amber';
    case 'eradicated':
      return 'cyan';
    case 'recovered':
    case 'lessons':
      return 'success';
  }
}

export function relTime(ts: number, now = Date.now()): string {
  const diffMins = Math.max(1, Math.round((now - ts) / 60_000));
  if (diffMins < 60) return `${diffMins}m ago`;
  const hrs = Math.round(diffMins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Chip
      tone={severityTone(severity)}
      size="sm"
      icon={severity === 'critical' ? <Flame size={12} /> : severity === 'high' ? <ShieldAlert size={12} /> : <Shield size={12} />}
    >
      <span>{severityLabel(severity)}</span>
    </Chip>
  );
}

export function StageBadge({ stage, closed }: { stage: CaseStage; closed?: boolean }) {
  const effective: CaseStage = closed ? 'recovered' : stage;
  return (
    <Chip
      tone={stageTone(effective)}
      size="sm"
      icon={effective === 'recovered' || effective === 'lessons' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
    >
      <span>{stageLabel(effective)}</span>
    </Chip>
  );
}

/* ───────────── Cross-App Bridge Actions ───────────── */

export async function escalateCaseToIncidentCommand(c: SecCase, actorId: string): Promise<{ label: string; to: string }> {
  const viewer = currentViewer();
  const sevMap = { critical: 'SEV1', high: 'SEV2', medium: 'SEV3', low: 'SEV4' } as const;
  let ref = { label: 'Sentinel · INC-2049', to: '/incidents' };

  try {
    if (viewer) {
      const incidents = await loadBridge('incidents');
      const res = incidents.declare(viewer, {
        title: `[${c.id}] ${c.title}`,
        severity: sevMap[c.severity],
        services: c.assets.slice(0, 2),
        summary: `${c.detail} (MITRE: ${c.mitre.join(', ')})`,
        source: { app: 'security', label: `Bastion · ${c.id}`, to: `/security/threats?case=${c.id}` },
      });
      if (res.ok) {
        ref = { label: `Incident ${res.incidentId}`, to: res.to };
      }
    }
  } catch {
    // Fallback when sibling bridge is warming up
  }

  useSecurity.getState().runPlaybook(c.id, 'declare', actorId, ref);
  toast.success('Escalated to Sentinel Incident Command', `${c.id} linked to ${ref.label}`);
  return ref;
}

export async function createSecurityRemediationTask(
  title: string,
  notes: string,
  refKey: string,
): Promise<{ label: string; to: string }> {
  const viewer = currentViewer();
  let ref = { label: 'Projects · Remediation Task', to: '/projects' };
  try {
    if (viewer) {
      const projects = await loadBridge('projects');
      const res = projects.createTask(viewer, {
        title,
        notes,
        source: { app: 'security', label: 'Bastion Security Center', to: '/security/vulnerabilities' },
      });
      if (res.ok) {
        ref = { label: 'Projects Task', to: res.to };
      }
    }
  } catch {
    // Fallback
  }
  useSecurity.getState().saveRef(refKey, ref);
  toast.success('Remediation task created in Projects', title);
  return ref;
}

export async function createEndpointHelpdeskTicket(
  subject: string,
  description: string,
  refKey: string,
): Promise<{ label: string; to: string }> {
  const viewer = currentViewer();
  let ref = { label: 'Helpdesk · Security Ticket', to: '/helpdesk' };
  try {
    if (viewer) {
      const hd = await loadBridge('helpdesk');
      const res = hd.createTicket(viewer, {
        subject,
        description,
        category: 'Security & Access',
        priority: 'P1',
        source: { app: 'security', label: 'Bastion Security Center', to: '/security/posture' },
      });
      if (res.ok) {
        ref = { label: `Ticket ${res.ticketId}`, to: res.to };
      }
    }
  } catch {
    // Fallback
  }
  useSecurity.getState().saveRef(refKey, ref);
  toast.success('Filed P1 ticket with IT Helpdesk', subject);
  return ref;
}

export async function broadcastThreatToPulseChat(c: SecCase, actorId: string) {
  const viewer = currentViewer();
  let ref = { label: 'Pulse Chat · #security-alerts', to: '/chat' };
  try {
    if (viewer) {
      const chat = await loadBridge('chat');
      const channels = chat.listChannels(viewer);
      const target = channels.find((ch) => ch.kind === 'channel') ?? channels[0];
      if (target) {
        const res = chat.postToChannel(viewer, {
          channelId: target.id,
          text: `🛡️ **Bastion SOC Advisory (${c.id})** — ${c.title} · Stage: ${stageLabel(c.stage)} · MITRE: ${c.mitre.join(', ')}`,
          card: {
            app: 'security',
            title: `${c.id} · ${c.title}`,
            subtitle: `Severity: ${c.severity.toUpperCase()} · ${stageLabel(c.stage)}`,
            to: `/security/threats?case=${c.id}`,
            status: stageLabel(c.stage),
          },
          asBot: true,
        });
        if (res.ok) ref = { label: `Posted to #${target.name}`, to: res.to };
      }
    }
  } catch {
    // Fallback
  }
  useSecurity.getState().runPlaybook(c.id, 'notify', actorId, ref);
  toast.success('Security advisory posted to Pulse Chat');
}

export async function launchSecurityBridgeMeet(c: SecCase, actorId: string, navigate: ReturnType<typeof useNavigate>) {
  let ref = { label: 'HoloMeet · Security War Room', to: '/meet' };
  try {
    const { useMeet } = await import('@/meet/store');
    const room = useMeet.getState().launchInstantRoom(`Bastion War Room · ${c.id}`, 'incident');
    ref = { label: `HoloMeet · ${room.code}`, to: `/meet/room?room=${room.id}` };
    useSecurity.getState().runPlaybook(c.id, 'warroom', actorId, ref);
    toast.success('Launched HoloMeet security bridge', room.title);
    navigate(ref.to);
    return;
  } catch {
    useSecurity.getState().runPlaybook(c.id, 'warroom', actorId, ref);
    toast.info('Security war room link attached');
  }
}

export async function scheduleComplianceReviewCalendar(frameworkName: string) {
  try {
    const { useCalendar } = await import('@/calendar/store');
    useCalendar.getState().createEvent({
      title: `Bastion Audit Readiness Review · ${frameworkName}`,
      description: `Review automated compliance evidence and signed SHA-256 auditor pack for ${frameworkName}.`,
      category: 'meet',
      dayOffset: 1,
      startHour: 14,
      durationMins: 45,
      attendeeIds: ['u-layla', 'u-ethan', 'u-grace'],
      linkedContext: { app: 'security', label: `Bastion · ${frameworkName}`, to: '/security/compliance' },
      agendaBullets: [
        'Verify fresh cross-app evidence artifacts (IAM, Helpdesk, Vault, Cloud, DevHub)',
        'Sign off on control test exceptions and export SHA-256 auditor pack',
      ],
    });
    toast.success('Scheduled Audit Review in Helix Calendar', `${frameworkName} · Tomorrow 14:00`);
  } catch {
    toast.info('Calendar hold created for Audit Readiness Review');
  }
}

/* ───────────── Nova Security Copilot Drawer ───────────── */

export function NovaSecurityDrawer({
  open,
  prompt,
  onClose,
  onOpenReport,
}: {
  open: boolean;
  prompt: string;
  onClose: () => void;
  onOpenReport: () => void;
}) {
  const navigate = useNavigate();
  const { meId } = useMySecurity();
  const data = useSecurity();
  const [query, setQuery] = useState(prompt || 'Summarize active critical threats and top posture fixes');

  if (!open) return null;

  const activeQuery = query || prompt || 'Summarize active critical threats and top posture fixes';
  const response = askBastionNova(activeQuery, data, meId);

  const runAction = (act: { label: string; to?: string; actionId?: string }) => {
    if (act.actionId === 'patch-critical-cves') {
      useSecurity.getState().patchAllCriticalCves();
      return;
    }
    if (act.actionId === 'refresh-evidence') {
      useSecurity.getState().refreshEvidence();
      return;
    }
    if (act.actionId === 'enroll-passkey') {
      useSecurity.getState().enrollPasskey(meId);
      return;
    }
    if (act.actionId === 'open-report') {
      onClose();
      onOpenReport();
      return;
    }
    if (act.to) {
      onClose();
      navigate(act.to);
    }
  };

  return (
    <div className="sec-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova Security Copilot">
      <div className="sec-modal sec-nova-drawer">
        <header className="sec-modal__head">
          <div className="sec-modal__titles">
            <div className="neo-hud">Bastion · Explainable AI</div>
            <h2 className="sec-modal__title">
              <Sparkles size={18} />
              <span>Nova Security Copilot</span>
              <NovaChip>SOC Analyst</NovaChip>
            </h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close Nova Security Copilot">
            <X size={16} />
          </button>
        </header>

        <div className="sec-modal__body">
          <div className="sec-nova-presets" role="list" aria-label="Suggested security prompts">
            {[
              'Summarize active critical threats',
              'Which critical CVE should we patch first?',
              'Check ISO 27001 & SOC 2 readiness',
              'How can I boost my personal shield score?',
              'Inspect DLP & phishing radar',
            ].map((p) => (
              <button
                key={p}
                type="button"
                className="neo-suggest"
                onClick={() => setQuery(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="sec-nova-answer" aria-live="polite">
            <div className="neo-hud">Nova Assessment</div>
            <h3 className="sec-nova-answer__headline">{response.headline}</h3>
            <p className="sec-nova-answer__body">{response.body}</p>
            <ul className="sec-nova-answer__list">
              {response.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <div className="sec-nova-answer__actions">
              {response.actions.map((act) => (
                <button
                  key={act.label}
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => runAction(act)}
                >
                  <ExternalLink size={14} />
                  <span>{act.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useUserById(userId?: string) {
  const users = useHub((s) => s.users);
  if (!userId) return undefined;
  return users.find((u) => u.id === userId);
}
