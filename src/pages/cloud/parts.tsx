/**
 * Stratos · Cloud Console — shared visual components:
 * Interactive world/region map, SLO burn chart, status chips, cross-app bridge bar, and Nova drawer.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Chip, NeoNovaPrompt, NeoPopover, Orb, type Tone } from '@/components/neo';
import {
  NOVA_SUGGESTIONS,
  allRegionSummaries,
  askCloudNova,
  effectiveResources,
  type NovaAnswer,
  type SloSummary,
} from '@/cloud/engine';
import { MAP_VIEW, arcPath, landDots, project } from '@/cloud/geo';
import { REGION_BY_ID } from '@/cloud/seed';
import { useCloud } from '@/cloud/store';
import type { HealthStatus, PolicyOutcome, RegionId } from '@/cloud/types';

export function healthTone(status: HealthStatus): Tone {
  if (status === 'healthy') return 'emerald';
  if (status === 'degraded') return 'amber';
  return 'rose';
}

export function StatusChip({ status }: { status: HealthStatus }) {
  const label = status === 'healthy' ? 'Healthy' : status === 'degraded' ? 'Degraded' : 'Down';
  return (
    <Chip tone={healthTone(status)} size="sm" icon={<Orb tone={healthTone(status)} pulse={status !== 'healthy'} size={7} />}>
      {label}
    </Chip>
  );
}

export function TierChip({ tier }: { tier: 'critical' | 'high' | 'standard' }) {
  const tone: Tone = tier === 'critical' ? 'rose' : tier === 'high' ? 'cyan' : 'slate';
  const label = tier === 'critical' ? 'Critical tier' : tier === 'high' ? 'High tier' : 'Standard tier';
  return (
    <Chip tone={tone} size="sm">
      {label}
    </Chip>
  );
}

export function PolicyBadge({ outcome }: { outcome: PolicyOutcome }) {
  if (outcome === 'pass') {
    return (
      <Chip tone="emerald" size="sm" icon={<CheckCircle2 />}>
        Pass
      </Chip>
    );
  }
  if (outcome === 'warn') {
    return (
      <Chip tone="amber" size="sm" icon={<TriangleAlert />}>
        Approval needed
      </Chip>
    );
  }
  return (
    <Chip tone="rose" size="sm" icon={<ShieldAlert />}>
      Blocked
    </Chip>
  );
}

/* ───────────────────────── Interactive World / Region Map ───────────────────────── */

const TRAFFIC_LINKS: { from: RegionId; to: RegionId; label: string; anomaly?: boolean }[] = [
  { from: 'me-central-1', to: 'eu-west-2', label: '1.8 Gbps' },
  { from: 'eu-west-2', to: 'us-east-1', label: '1.9 TB/d egress (+340%)', anomaly: true },
  { from: 'me-central-1', to: 'ap-southeast-1', label: '940 Mbps' },
  { from: 'eu-west-2', to: 'ap-southeast-1', label: '620 Mbps' },
];

export function StratosWorldMap({
  selectedRegion,
  onSelectRegion,
  compact = false,
}: {
  selectedRegion: RegionId | 'all';
  onSelectRegion: (region: RegionId) => void;
  compact?: boolean;
}) {
  const data = useCloud();
  const resources = effectiveResources(data);
  const summaries = allRegionSummaries(resources, data.story);
  const dots = landDots(2.5);

  const coords = Object.fromEntries(
    summaries.map((s) => [s.region.id, project(s.region.lon, s.region.lat, MAP_VIEW)]),
  ) as Record<RegionId, { x: number; y: number }>;

  return (
    <div className={`cloud-map ${compact ? 'cloud-map--compact' : ''}`}>
      <svg
        viewBox={`0 0 ${MAP_VIEW.w} ${MAP_VIEW.h}`}
        className="cloud-map__svg"
        role="img"
        aria-label="Global multi-region infrastructure map"
      >
        <defs>
          <radialGradient id="cloudNodeHealthy" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cloudNodeDegraded" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle lat/lon graticule */}
        {[90, 180, 270, 340].map((y) => (
          <line key={`lat-${y}`} x1={0} y1={y} x2={MAP_VIEW.w} y2={y} className="cloud-map__grid" />
        ))}
        {[200, 400, 600, 800].map((x) => (
          <line key={`lon-${x}`} x1={x} y1={0} x2={x} y2={MAP_VIEW.h} className="cloud-map__grid" />
        ))}

        {/* Continent dot matrix */}
        <path d={dots.d} className="cloud-map__dots" />

        {/* Inter-region traffic arcs */}
        {TRAFFIC_LINKS.map((lk) => {
          const a = coords[lk.from];
          const b = coords[lk.to];
          const d = arcPath(a, b, 0.24);
          return (
            <g key={`${lk.from}-${lk.to}`}>
              <path
                d={d}
                className={`cloud-map__arc ${lk.anomaly ? 'cloud-map__arc--anomaly' : ''}`}
              />
            </g>
          );
        })}

        {/* Region nodes */}
        {summaries.map((s) => {
          const pt = coords[s.region.id];
          const isSelected = selectedRegion === s.region.id;
          const isDegraded = s.status === 'degraded';
          return (
            <g
              key={s.region.id}
              transform={`translate(${pt.x}, ${pt.y})`}
              className={`cloud-map__node ${isSelected ? 'is-selected' : ''} ${isDegraded ? 'is-degraded' : ''}`}
              onClick={() => onSelectRegion(s.region.id)}
              role="button"
              tabIndex={0}
              aria-label={`${s.region.name} (${s.region.id}) · p95 ${s.p95}ms`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectRegion(s.region.id);
                }
              }}
            >
              <circle
                r={isSelected ? 34 : 26}
                fill={isDegraded ? 'url(#cloudNodeDegraded)' : 'url(#cloudNodeHealthy)'}
              />
              {isSelected && <circle r={16} className="cloud-map__ring" />}
              <circle r={7.5} className="cloud-map__core" />
              <g transform="translate(0, -18)">
                <rect x={-52} y={-22} width={104} height={20} rx={6} className="cloud-map__tag" />
                <text x={0} y={-9} textAnchor="middle" className="cloud-map__tag-text" data-no-translate="true">
                  {s.region.code} · {s.p95}ms
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Bottom Interactive Region Strip */}
      <div className="cloud-map__strip" role="tablist" aria-label="Cloud regions">
        {summaries.map((s) => {
          const active = selectedRegion === s.region.id;
          return (
            <button
              key={s.region.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`cloud-region-pill neo-spot ${active ? 'is-active' : ''}`}
              onClick={() => onSelectRegion(s.region.id)}
              data-qa={`region-pill-${s.region.id}`}
            >
              <div className="cloud-region-pill__top">
                <Orb tone={healthTone(s.status)} pulse={s.status !== 'healthy'} size={8} />
                <span className="cloud-region-pill__name">{s.region.name}</span>
                <span className="cloud-region-pill__code neo-mono" data-no-translate="true">
                  {s.region.id}
                </span>
              </div>
              <div className="cloud-region-pill__metrics neo-mono" data-no-translate="true">
                <span>p95 {s.p95}ms</span>
                <span>·</span>
                <span>{s.rps.toLocaleString()} rps</span>
                <span>·</span>
                <span>{Math.round(s.region.cfe * 100)}% CFE</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── 30-Day SLO Burn Chart ───────────────────────── */

export function SloBurnChart({ slo }: { slo: SloSummary }) {
  const w = 520;
  const h = 130;
  const pad = 16;
  const pts = slo.burnCurve;
  const coords = pts.map((v, i) => {
    const x = pad + (i / Math.max(1, pts.length - 1)) * (w - pad * 2);
    const y = h - pad - (v / 100) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const fill = `${d} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;
  const stroke = slo.fastBurn ? '#f59e0b' : '#38bdf8';

  return (
    <div className="cloud-slo-chart">
      <div className="cloud-slo-chart__head">
        <div>
          <span className="neo-hud">30-day error budget remaining</span>
          <div className="cloud-slo-chart__val neo-mono" data-no-translate="true">
            {Math.round(slo.remainingFraction * 100)}% ({slo.budgetMinutesRemaining}m / {slo.budgetMinutesTotal}m)
          </div>
        </div>
        <div className="cloud-slo-chart__badges">
          <Chip tone={slo.fastBurn ? 'amber' : 'emerald'} size="sm">
            <span>1h burn</span>
            <span className="neo-mono" data-no-translate="true">
              {slo.burnRate1h}×
            </span>
          </Chip>
          <Chip tone="slate" size="sm">
            <span>6h burn</span>
            <span className="neo-mono" data-no-translate="true">
              {slo.burnRate6h}×
            </span>
          </Chip>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="cloud-slo-chart__svg" aria-label="SLO error budget burn chart">
        <defs>
          <linearGradient id={`sloGrad-${slo.serviceId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.38" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border)" strokeDasharray="3 3" />
        <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="var(--border)" strokeDasharray="3 3" />
        <path d={fill} fill={`url(#sloGrad-${slo.serviceId})`} />
        <path d={d} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
        <circle
          cx={coords[coords.length - 1][0]}
          cy={coords[coords.length - 1][1]}
          r={4}
          fill={stroke}
        />
      </svg>
    </div>
  );
}

/* ───────────────────────── Cross-App Links Bar ───────────────────────── */

export function CrossAppLinksBar() {
  const links = [
    { to: '/devhub/deploys', label: 'DevHub Deploys', sub: 'v2.41.0 correlation', icon: <GitBranch /> },
    { to: '/incidents', label: 'Incident Command', sub: 'INC-2047 war room', icon: <Siren /> },
    { to: '/vault/secrets', label: 'Aegis Vault', sub: 'Dynamic DB & KMS leases', icon: <KeyRound /> },
    { to: '/security/compliance', label: 'Security Center', sub: 'Drift & cloud posture', icon: <ShieldCheck /> },
    { to: '/procurement', label: 'Procurement', sub: 'AWS & GCP commits', icon: <ShoppingBag /> },
  ];
  return (
    <div className="cloud-bridge-bar" role="navigation" aria-label="Connected workspace apps">
      {links.map((lk) => (
        <Link key={lk.to} to={lk.to} className="cloud-bridge-card neo-spot">
          <span className="cloud-bridge-card__icon">{lk.icon}</span>
          <span className="cloud-bridge-card__body">
            <span className="cloud-bridge-card__title">{lk.label}</span>
            <span className="cloud-bridge-card__sub">{lk.sub}</span>
          </span>
          <ExternalLink className="cloud-bridge-card__ext" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

/* ───────────────────────── Nova Copilot Drawer ───────────────────────── */

export function CloudNovaDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const data = useCloud();
  const [answer, setAnswer] = useState<NovaAnswer>(() =>
    askCloudNova(NOVA_SUGGESTIONS[0], data, data.story),
  );

  const handleAsk = (q: string) => {
    setAnswer(askCloudNova(q, data, data.story));
  };

  return (
    <NeoPopover
      open={open}
      anchor={typeof document !== 'undefined' ? ({ x: window.innerWidth - 520, y: 72 } as const) : null}
      onClose={onClose}
      width={480}
      label="Stratos Nova Copilot"
      className="cloud-nova-drawer"
    >
      <div className="cloud-nova-drawer__inner">
        <div className="cloud-nova-drawer__top">
          <div className="cloud-nova-drawer__brand">
            <Sparkles />
            <span>Nova Cloud & FinOps Copilot</span>
          </div>
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onClose} aria-label="Close Nova drawer">
            <X />
          </button>
        </div>

        <NeoNovaPrompt
          hud="Telemetry · SLOs · FinOps · Carbon"
          title="Ask Nova about your cloud fleet"
          placeholder="Ask about latency spikes, SLO burn, egress anomalies, or carbon windows…"
          suggestions={NOVA_SUGGESTIONS}
          onSubmit={handleAsk}
          submitLabel="Analyze"
        >
          <div className="cloud-nova-answer" aria-live="polite">
            <div className="cloud-nova-answer__head">
              <Activity />
              <strong>{answer.headline}</strong>
            </div>
            <p className="cloud-nova-answer__summary">{answer.summary}</p>
            <ul className="cloud-nova-answer__list">
              {answer.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <div className="cloud-nova-answer__foot">
              <span className="neo-hud">{answer.confidence}</span>
              <div className="cloud-nova-answer__links">
                {answer.links.map((lk) => (
                  <Link key={lk.to} to={lk.to} className="neo-btn neo-btn--xs neo-btn--soft" onClick={onClose}>
                    <span>{lk.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </NeoNovaPrompt>
      </div>
    </NeoPopover>
  );
}

export function RegionBadge({ regionId }: { regionId: RegionId }) {
  const reg = REGION_BY_ID[regionId];
  return (
    <span className="cloud-reg-badge neo-mono" data-no-translate="true">
      {reg.code} · {reg.id}
    </span>
  );
}
