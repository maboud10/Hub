/**
 * DevHub ("Forge") — shared UI building blocks, live cross-app bridge hook,
 * signature Delivery Stream hero, and Nova Copilot drawer.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  GitPullRequest,
  Lock,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { Chip, NovaChip, Orb, type NeoTint, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import {
  currentViewer,
  loadBridge,
  type BridgeCloudSpend,
  type BridgeIncident,
  type BridgeServiceHealth,
  type BridgeVaultHygiene,
} from '@/lib/appBridge';
import { useI18n } from '@/lib/i18n';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import {
  DAY,
  HOUR,
  MIN,
   type EffectiveFreeze,
   type LaneState,
   type RiskReport,
   type StreamLane,
  effectiveFreeze,
} from '@/devhub/engine';
import { useDevHub } from '@/devhub/store';

export const DEVHUB_TINT: NeoTint = { c1: '#a3e635', c2: '#22c55e', on: '#052e16' };

export const LANE_LABELS: Record<StreamLane, string> = {
  code: 'Code',
  review: 'Review',
  build: 'Build',
  test: 'Test',
  scan: 'Scan',
  staging: 'Staging',
  canary: 'Canary',
  production: 'Production',
};

export const RISK_FACTOR_LABELS: Record<string, string> = {
  size: 'Change size',
  hot: 'Hotspot path churn',
  tests: 'Test coverage gap',
  migration: 'Database migration',
  security: 'Security-sensitive path',
  config: 'Runtime config change',
  tier: 'Tier-1 blast radius',
  secret: 'Push-protection secret',
};

export function riskTone(level: RiskReport['level']): Tone {
  if (level === 'critical') return 'danger';
  if (level === 'high') return 'orange';
  if (level === 'medium') return 'warning';
  return 'success';
}

export function RiskBadge({ report, compact }: { report: RiskReport; compact?: boolean }) {
  const label =
    report.level === 'critical'
      ? 'Critical risk'
      : report.level === 'high'
        ? 'High risk'
        : report.level === 'medium'
          ? 'Medium risk'
          : 'Low risk';
  return (
    <Chip tone={riskTone(report.level)} size={compact ? 'sm' : undefined} title={`${label} · ${report.score}/100`}>
      <Flame />
      <span>{label}</span>
      <span className="neo-mono">{report.score}</span>
    </Chip>
  );
}

export function UserPill({ userId, size = 22, showTitle }: { userId: string; size?: number; showTitle?: boolean }) {
  const users = useHub((s) => s.users);
  if (userId === 'nova') {
    return (
      <span className="dh-user-pill">
        <NovaChip>Nova AI</NovaChip>
      </span>
    );
  }
  const u = users.find((x) => x.id === userId);
  if (!u) return <span className="dh-user-pill neo-mono">{userId}</span>;
  return (
    <span className="dh-user-pill">
      <Avatar user={u} size={size} />
      <span className="dh-user-pill__name">{u.name}</span>
      {showTitle && <span className="dh-user-pill__role">{u.title}</span>}
    </span>
  );
}

export function RelTime({ at, now }: { at: number; now: number }) {
  const diff = Math.max(0, now - at);
  if (diff < MIN) return <span className="dh-reltime">Just now</span>;
  if (diff < HOUR) return <span className="dh-reltime">{`${Math.round(diff / MIN)}m ago`}</span>;
  if (diff < DAY) return <span className="dh-reltime">{`${Math.round(diff / HOUR)}h ago`}</span>;
  return <span className="dh-reltime">{`${Math.round(diff / DAY)}d ago`}</span>;
}

/* ───────────────────────── Live Cross-App Bridge Hook ───────────────────────── */

export interface DevHubLiveContext {
  incidents: BridgeIncident[];
  bridgeFrozen: boolean;
  freezeState: EffectiveFreeze;
  cloudHealth: BridgeServiceHealth[];
  cloudSpend: BridgeCloudSpend;
  vaultHygiene: BridgeVaultHygiene;
}

export function useDevHubLive(): DevHubLiveContext {
  const manualFreeze = useDevHub((s) => s.freeze);
  const deploys = useDevHub((s) => s.deploys);
  const seededAt = useDevHub((s) => s.seededAt);
  const [incidents, setIncidents] = useState<BridgeIncident[]>([]);
  const [bridgeFrozen, setBridgeFrozen] = useState(false);
  const [cloudHealth, setCloudHealth] = useState<BridgeServiceHealth[]>([]);
  const [cloudSpend, setCloudSpend] = useState<BridgeCloudSpend>({ mtdUsd: 48_200, forecastUsd: 54_900, budgetUsd: 52_000, anomalies: 1 });
  const [vaultHygiene, setVaultHygiene] = useState<BridgeVaultHygiene>({ score: 88, expiringSoon: 2, stale: 1, exposed: 1, weak: 0 });

  useEffect(() => {
    let active = true;
    const viewer = currentViewer();
    if (!viewer) return;

    void loadBridge('incidents')
      .then((inc) => {
        if (!active) return;
        const list = inc.listActive?.(viewer) ?? [];
        const extraFrozen = Boolean(
          (inc as unknown as { isDeployFrozen?: (serviceId?: string) => boolean }).isDeployFrozen?.('payments-svc'),
        );
        setBridgeFrozen(extraFrozen);
        setIncidents(list);
      })
      .catch(() => undefined);

    void loadBridge('cloud')
      .then((cl) => {
        if (!active) return;
        const h = cl.serviceHealth?.(viewer) ?? [];
        const sp = cl.spend?.(viewer);
        if (h.length) setCloudHealth(h);
        if (sp && sp.budgetUsd > 0) setCloudSpend(sp);
      })
      .catch(() => undefined);

    void loadBridge('vault')
      .then((vt) => {
        if (!active) return;
        const hyg = vt.hygiene?.(viewer);
        if (hyg && hyg.score > 0) setVaultHygiene(hyg);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [deploys.length, manualFreeze.frozen]);

  const effectiveIncidents = useMemo<BridgeIncident[]>(() => {
    if (incidents.length > 0) return incidents;
    const canaryActive = deploys.some((d) => d.id === 'dep-pay-2410-euw2' && d.status === 'in_progress');
    if (!canaryActive) return [];
    return [
      {
        id: 'inc-2047',
        code: 'INC-2047',
        title: 'Elevated payment latency in EU',
        severity: 'SEV2',
        status: 'mitigating',
        services: ['payments-svc'],
        commanderId: 'u-lucas',
        startedAt: seededAt - 31 * MIN,
        to: '/incidents',
      },
    ];
  }, [incidents, deploys, seededAt]);

  const freezeState = useMemo(() => {
    const base = effectiveFreeze(manualFreeze, effectiveIncidents);
    if (bridgeFrozen && !base.frozen) {
      return {
        ...base,
        frozen: true,
        blocking: true,
        reason: base.reason || 'Frozen by Incident Command (payments-svc)',
      };
    }
    return base;
  }, [manualFreeze, effectiveIncidents, bridgeFrozen]);

  return {
    incidents: effectiveIncidents,
    bridgeFrozen,
    freezeState,
    cloudHealth,
    cloudSpend,
    vaultHygiene,
  };
}

/* ───────────────────────── Cross-App Hand-off Actions ───────────────────────── */

export async function shareToPulseChat(input: {
  title: string;
  subtitle: string;
  to: string;
  status?: string;
  text: string;
}): Promise<boolean> {
  try {
    const viewer = currentViewer();
    if (!viewer) return false;
    const chat = await loadBridge('chat');
    const channels = chat.listChannels(viewer);
    const target = channels.find((c) => c.name.includes('eng') || c.name.includes('dev') || c.kind === 'channel') ?? channels[0];
    if (!target) {
      toast.info('Shared to Pulse Chat', input.title);
      return true;
    }
    const res = chat.postToChannel(viewer, {
      channelId: target.id,
      text: input.text,
      card: { app: 'devhub', title: input.title, subtitle: input.subtitle, to: input.to, status: input.status },
      asBot: true,
    });
    if (res.ok) {
      toast.success('Posted to Pulse Chat', `#${target.name}`);
      return true;
    }
  } catch {
    // fallback
  }
  toast.success('Shared to Pulse Chat', input.title);
  return true;
}

export async function createProjectTaskFromDevhub(input: {
  title: string;
  notes?: string;
  to: string;
  label: string;
  assigneeId?: string;
}): Promise<{ id: string; title: string; to: string }> {
  const fallback = { id: `t-${Date.now().toString(36)}`, title: input.title, to: '/projects' };
  try {
    const viewer = currentViewer();
    if (!viewer) return fallback;
    const projects = await loadBridge('projects');
    const res = projects.createTask(viewer, {
      title: input.title,
      notes: input.notes,
      assigneeId: input.assigneeId ?? viewer.user.id,
      source: { app: 'devhub', label: input.label, to: input.to },
    });
    if (res.ok) {
      toast.success('Created task in Projects', input.title);
      return { id: res.taskId, title: input.title, to: res.to };
    }
  } catch {
    // fallback
  }
  toast.success('Created task in Projects', input.title);
  return fallback;
}

export async function logPerformanceEvidenceFromDevhub(input: {
  userId: string;
  title: string;
  detail: string;
  to: string;
  label: string;
}): Promise<boolean> {
  try {
    const viewer = currentViewer();
    if (!viewer) return false;
    const perf = await loadBridge('performance');
    const res = perf.addEvidence(viewer, {
      userId: input.userId,
      title: input.title,
      detail: input.detail,
      source: { app: 'devhub', label: input.label, to: input.to },
    });
    if (res.ok) {
      toast.success('Pinned evidence to Performance & OKRs', input.title);
      return true;
    }
  } catch {
    // fallback
  }
  toast.success('Pinned evidence to Performance & OKRs', input.title);
  return true;
}

export async function declareIncidentFromDevhub(input: {
  title: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  services: string[];
  summary: string;
  to: string;
}): Promise<string> {
  try {
    const viewer = currentViewer();
    if (viewer) {
      const inc = await loadBridge('incidents');
      const res = inc.declare(viewer, {
        title: input.title,
        severity: input.severity,
        services: input.services,
        summary: input.summary,
        source: { app: 'devhub', label: 'DevHub Forge', to: input.to },
      });
      if (res.ok) {
        toast.warning('Incident declared in Incident Command', input.title);
        return res.to;
      }
    }
  } catch {
    // fallback
  }
  toast.warning('Escalated to Incident Command', input.title);
  return '/incidents';
}

export async function rotateSecretInVault(input: {
  prId: string;
  resource: string;
  reason: string;
}): Promise<string> {
  let targetTo = '/vault/secrets';
  try {
    const viewer = currentViewer();
    if (viewer) {
      const vault = await loadBridge('vault');
      const res = vault.requestAccess(viewer, {
        resource: input.resource,
        reason: input.reason,
        durationMins: 60,
        source: { app: 'devhub', label: `PR ${input.prId}`, to: `/devhub/reviews?pr=${input.prId}` },
      });
      if (res.ok) targetTo = res.to;
    }
  } catch {
    // fallback
  }
  useDevHub.getState().updateSecretStatus(input.prId, { status: 'rotated', requestTo: targetTo });
  toast.success('Secret rotated via Aegis Vault', 'Push-protection check is now green');
  return targetTo;
}

export async function reportSecretToSecuritySoc(input: {
  prId: string;
  title: string;
  detail: string;
}): Promise<string> {
  let caseTo = '/security/threats';
  let caseId = `SOC-${Date.now().toString(36).toUpperCase()}`;
  try {
    const viewer = currentViewer();
    if (viewer) {
      const sec = await loadBridge('security');
      const res = sec.reportSignal(viewer, {
        kind: 'secret_exposure',
        title: input.title,
        detail: input.detail,
        severity: 'high',
        source: { app: 'devhub', label: 'Push protection', to: `/devhub/reviews?pr=${input.prId}` },
      });
      if (res.ok) {
        caseTo = res.to;
        caseId = res.caseId;
      }
    }
  } catch {
    // fallback
  }
  useDevHub.getState().updateSecretStatus(input.prId, { status: 'reported', caseId, caseTo });
  toast.warning('Reported secret exposure to Security Center', caseId);
  return caseTo;
}

export async function launchPairRoom(title: string, navigate: (to: string) => void) {
  try {
    const { useMeet } = await import('@/meet/store');
    const room = useMeet.getState().launchInstantRoom(title, 'pair');
    toast.success('Launched HoloMeet pair session', title);
    navigate(`/meet/room?room=${room.id}`);
  } catch {
    toast.info('Opening HoloMeet', title);
    navigate('/meet');
  }
}

export async function scheduleWindowInCalendar(input: {
  title: string;
  note: string;
  services: string[];
}) {
  try {
    const { useCalendar } = await import('@/calendar/store');
    useCalendar.getState().createEvent({
      title: input.title,
      description: input.note,
      category: 'meet',
      dayOffset: 1,
      startHour: 14,
      durationMins: 60,
      linkedContext: { app: 'devhub', label: 'Forge Release Window', to: '/devhub/deploys' },
      agendaBullets: [`Services: ${input.services.join(', ')}`, input.note],
    });
    toast.success('Scheduled change window on Calendar', input.title);
  } catch {
    toast.success('Scheduled change window', input.title);
  }
}

/* ───────────────────────── Signature Delivery Stream Hero ───────────────────────── */

export function DeliveryStreamHero({
  lanes,
  frozen,
  action,
}: {
  lanes: LaneState[];
  frozen: boolean;
  action?: ReactNode;
}) {
  return (
    <section className="neo-panel dh-stream" aria-label="Continuous delivery stream">
      <header className="dh-stream__head">
        <div className="dh-stream__titles">
          <div className="neo-hud">Forge pipeline telemetry</div>
          <h2 className="dh-stream__title">Commit-to-Production Delivery Stream</h2>
        </div>
        <div className="dh-stream__meta">
          {frozen ? (
            <Chip tone="danger" icon={<Lock />}>
              <span>Production freeze active</span>
            </Chip>
          ) : (
            <Chip tone="app" icon={<CheckCircle2 />}>
              <span>Progressive delivery armed</span>
            </Chip>
          )}
          {action}
        </div>
      </header>

      <ol className="dh-stream__lanes">
        {lanes.map((lane, idx) => (
          <li
            key={lane.key}
            className="dh-stream__lane neo-spot"
            data-alert={lane.alert ?? undefined}
          >
            <div className="dh-stream__lane-top">
              <span className="dh-stream__step neo-mono">{`0${idx + 1}`}</span>
              <span className="dh-stream__name">{LANE_LABELS[lane.key]}</span>
              <span className="dh-stream__count neo-mono">{lane.count}</span>
            </div>
            <div className="dh-stream__items">
              {lane.items.length === 0 ? (
                <span className="dh-stream__idle">Idle</span>
              ) : (
                lane.items.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    to={item.to}
                    className="dh-stream__pill"
                    data-tone={item.tone}
                  >
                    <Orb
                      tone={item.tone}
                      pulse={lane.key === 'canary' || lane.key === 'test'}
                      size={6}
                    />
                    <span className="neo-mono">{item.label}</span>
                  </Link>
                ))
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────── Nova Copilot Drawer ───────────────────────── */

export function NovaForgeDrawer({
  open,
  onClose,
  initialPrompt,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
}) {
  const navigate = useNavigate();
  const locale = useI18n((s) => s.locale);
  const prs = useDevHub((s) => s.prs);
  const deploys = useDevHub((s) => s.deploys);
  const rollback = useDevHub((s) => s.rollback);
  const me = useHub((s) => s.users.find((u) => u.id === s.sessionUserId));
  const [topic, setTopic] = useState<'canary' | 'secret' | 'pr1847' | 'dora'>('canary');

  useEffect(() => {
    if (!initialPrompt) return;
    const q = initialPrompt.toLowerCase();
    if (q.includes('secret') || q.includes('1841') || q.includes('vault')) setTopic('secret');
    else if (q.includes('1847') || q.includes('review')) setTopic('pr1847');
    else if (q.includes('dora') || q.includes('metric') || q.includes('flake')) setTopic('dora');
    else setTopic('canary');
  }, [initialPrompt]);

  if (!open) return null;

  const canaryDep = deploys.find((d) => d.id === 'dep-pay-2410-euw2');
  const pr1842 = prs.find((p) => p.number === 1842);

  return (
    <div className="dh-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="dh-drawer neo-plane"
        onClick={(e) => e.stopPropagation()}
        aria-label="Nova Engineering Copilot"
      >
        <header className="dh-drawer__head">
          <div className="dh-drawer__title-wrap">
            <NovaChip>Nova Forge AI</NovaChip>
            <h2 className="dh-drawer__title">Explainable Engineering Copilot</h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close Nova drawer">
            <X />
          </button>
        </header>

        <div className="dh-drawer__tabs" role="tablist" aria-label="Nova analysis topics">
          <button
            type="button"
            role="tab"
            aria-selected={topic === 'canary'}
            className="neo-chip"
            data-tone={topic === 'canary' ? 'app' : 'slate'}
            onClick={() => setTopic('canary')}
          >
            <AlertTriangle />
            <span>EU Canary Regression</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={topic === 'secret'}
            className="neo-chip"
            data-tone={topic === 'secret' ? 'danger' : 'slate'}
            onClick={() => setTopic('secret')}
          >
            <ShieldAlert />
            <span>Secret Finding #1841</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={topic === 'pr1847'}
            className="neo-chip"
            data-tone={topic === 'pr1847' ? 'app' : 'slate'}
            onClick={() => setTopic('pr1847')}
          >
            <GitPullRequest />
            <span>Hotfix PR #1847</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={topic === 'dora'}
            className="neo-chip"
            data-tone={topic === 'dora' ? 'app' : 'slate'}
            onClick={() => setTopic('dora')}
          >
            <Sparkles />
            <span>DORA & Review Load</span>
          </button>
        </div>

        <div className="dh-drawer__body" aria-live="polite">
          {topic === 'canary' && (
            <div className="dh-drawer__card">
              <div className="neo-hud">Root-cause correlation · payments-svc v2.41.0</div>
              <h3>Why eu-west-2 canary is held at 25% traffic</h3>
              <p>
                {locale === 'ar' && pr1842?.nova?.ar
                  ? pr1842.nova.ar
                  : 'PR #1842 raised MaxAttempts from 2 to 5 with 250ms exponential backoff and increased the eu-west-2 acquirer timeout to 1200ms. Under peak EU acquirer timeouts, retries compound to ~1.2s per charge, pushing p95 latency to 820ms (3.4× the 240ms baseline) and triggering INC-2047 (SEV2).'}
              </p>
              <div className="dh-drawer__kv">
                <div>
                  <span>Suspect deploy</span>
                  <strong className="neo-mono">payments-svc v2.41.0 (eu-west-2)</strong>
                </div>
                <div>
                  <span>Safe rollback target</span>
                  <strong className="neo-mono">v2.40.3 (4a8b11e)</strong>
                </div>
              </div>
              <div className="dh-drawer__actions">
                {canaryDep && canaryDep.status === 'in_progress' && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--danger neo-btn--sm"
                    onClick={() => {
                      rollback(canaryDep.id, me?.id ?? 'u-priya');
                      onClose();
                      navigate('/devhub/deploys');
                    }}
                  >
                    <RotateCcw />
                    <span>Rollback v2.41.0 to v2.40.3</span>
                  </button>
                )}
                <Link to="/devhub/reviews?pr=pr-1842" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onClose}>
                  <span>Inspect PR #1842 diff</span>
                  <ArrowUpRight />
                </Link>
                <Link to="/incidents" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onClose}>
                  <span>Open INC-2047 War Room</span>
                  <ArrowUpRight />
                </Link>
              </div>
            </div>
          )}

          {topic === 'secret' && (
            <div className="dh-drawer__card">
              <div className="neo-hud">Push protection · sec-find-1</div>
              <h3>Leaked acquirer webhook secret on PR #1841</h3>
              <p>
                Aegis push protection blocked merge on PR #1841 after detecting a live HMAC secret in
                <code className="neo-mono"> config/regions/eu-west-2-webhooks.env:2</code>. Rotate the credential in
                Aegis Vault and reference a dynamic lease instead of plain-text env vars.
              </p>
              <div className="dh-drawer__actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => {
                    void rotateSecretInVault({
                      prId: 'pr-1841',
                      resource: 'vault://payments-svc/eu-west-2/webhook-secret',
                      reason: 'Rotate exposed webhook secret from PR #1841 (sec-find-1)',
                    });
                  }}
                >
                  <span>Rotate in Aegis Vault</span>
                </button>
                <Link to="/devhub/reviews?pr=pr-1841" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onClose}>
                  <span>Open PR #1841</span>
                  <ArrowUpRight />
                </Link>
              </div>
            </div>
          )}

          {topic === 'pr1847' && (
            <div className="dh-drawer__card">
              <div className="neo-hud">Fix-forward verification · PR #1847</div>
              <h3>Lucas’s hotfix reverts retry budget to 2 attempts</h3>
              <p>
                PR #1847 restores 2 attempts and 50ms backoff while preserving 0.2 jitter. Risk score is Low (16/100),
                and review SLA is 30 minutes (hotfix policy).
              </p>
              <div className="dh-drawer__actions">
                <Link to="/devhub/reviews?pr=pr-1847" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onClose}>
                  <span>Review & Approve PR #1847</span>
                  <ArrowUpRight />
                </Link>
              </div>
            </div>
          )}

          {topic === 'dora' && (
            <div className="dh-drawer__card">
              <div className="neo-hud">Engineering health · DORA & Equity</div>
              <h3>Priya & Lucas carry 58% of tier-1 review load</h3>
              <p>
                Deployment frequency is Elite, but review pickup time on tier-1 services rose 18% this week because
                CODEOWNERS routes most payments and mail changes to Priya. Consider adding Kwame and Ethan as secondary
                owners on non-crypto paths.
              </p>
              <div className="dh-drawer__actions">
                <Link to="/devhub/insights" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onClose}>
                  <span>Open DORA & Review Load</span>
                  <ArrowUpRight />
                </Link>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
