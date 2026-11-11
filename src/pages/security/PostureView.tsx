/**
 * Security Center ("Bastion") — Tab 3: Posture & Attack Surface
 * Cross-domain posture checks across Endpoints, Cloud, Code, Secrets, and Identity,
 * plus Cloud Misconfigurations (CSPM), External Attack Surface TLS inventory, and Perimeter Radar.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import {
  CheckCircle2,
  Cloud,
  Code2,
  ExternalLink,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  Radar,
  ShieldCheck,
  Ticket,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  Chip,
  CountUp,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoTabs,
  Ring,
} from '@/components/neo';
import { computeOrgPosture } from '@/security/engine';
import {
  MISCONFIGS,
  POSTURE_CHECKS,
  RADAR_ORIGINS,
  SEED_RADAR_ATTEMPTS,
  SURFACE_ASSETS,
} from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { PostureDomainId } from '@/security/types';
import {
  createEndpointHelpdeskTicket,
  relTime,
  SeverityBadge,
} from './parts';

const DOMAIN_META: { id: PostureDomainId; label: string; appLabel: string; to: string }[] = [
  { id: 'endpoints', label: 'Endpoints', appLabel: 'IT Helpdesk Fleet', to: '/helpdesk' },
  { id: 'cloud', label: 'Cloud', appLabel: 'Stratos Cloud', to: '/cloud/services' },
  { id: 'code', label: 'Code', appLabel: 'Forge DevHub', to: '/devhub/pipelines' },
  { id: 'secrets', label: 'Secrets', appLabel: 'Aegis Vault', to: '/vault/secrets' },
  { id: 'identity', label: 'Identity', appLabel: 'NEXUS IAM', to: '/security' },
];

export function PostureView() {
  const cases = useSecurity((s) => s.cases);
  const people = useSecurity((s) => s.people);
  const remediatedChecks = useSecurity((s) => s.remediatedChecks);
  const patchedCves = useSecurity((s) => s.patchedCves);
  const refs = useSecurity((s) => s.refs);
  const remediateCheck = useSecurity((s) => s.remediateCheck);

  const [domainFilter, setDomainFilter] = useState<'all' | PostureDomainId>('all');

  const org = computeOrgPosture({ cases, people, remediatedChecks, patchedCves });
  const visibleChecks =
    domainFilter === 'all'
      ? POSTURE_CHECKS
      : POSTURE_CHECKS.filter((c) => c.domain === domainFilter);

  const openChecksCount = POSTURE_CHECKS.filter(
    (c) => c.status !== 'pass' && !remediatedChecks.includes(c.id),
  ).length;

  return (
    <div className="sec-view">
      <NeoKpis>
        <NeoKpi
          label="Org Security Posture"
          value={
            <>
              <CountUp value={org.score} />
              <span>/100</span>
            </>
          }
          sub="Stitched across 5 security domains"
          icon={<ShieldCheck />}
          tone="app"
        />
        <NeoKpi
          label="Open Posture Drift"
          value={openChecksCount}
          sub={`${POSTURE_CHECKS.length - openChecksCount}/${POSTURE_CHECKS.length} controls passing`}
          icon={<Wrench />}
          tone={openChecksCount > 0 ? 'warning' : 'emerald'}
        />
        <NeoKpi
          label="External Attack Surface"
          value={`${SURFACE_ASSETS.length} Hosts`}
          sub="2 certificates renewing < 21d"
          icon={<Globe />}
          tone="cyan"
        />
        <NeoKpi
          label="Perimeter Block Rate"
          value="100%"
          sub={`${SEED_RADAR_ATTEMPTS.length} edge probes sinkholed`}
          icon={<Radar />}
          tone="emerald"
        />
      </NeoKpis>

      {/* 5 Cross-Domain Posture Pillars */}
      <NeoPanel
        hud="Stitched Cross-App Telemetry"
        title="Cross-Domain Security Posture Pillars"
        icon={<ShieldCheck />}
      >
        <div className="sec-pillar-grid">
          {DOMAIN_META.map((dom) => {
            const stat = org.domainScores[dom.id];
            const active = domainFilter === dom.id;
            return (
              <div
                key={dom.id}
                className={`sec-pillar-card neo-spot ${active ? 'is-selected' : ''}`}
              >
                <div className="sec-pillar-card__head">
                  <Ring value={stat.score / 100} size={58} stroke={6}>
                    <span className="neo-mono">{stat.score}%</span>
                  </Ring>
                  <div className="grow">
                    <div className="sec-pillar-card__title">{dom.label}</div>
                    <div className="sec-pillar-card__sub">{dom.appLabel}</div>
                  </div>
                </div>
                <Bar
                  value={stat.score / 100}
                  fill={stat.score >= 90 ? 'var(--success)' : stat.score >= 80 ? 'var(--app-c1)' : 'var(--warning)'}
                  label={`${dom.label} posture ${stat.score}%`}
                />
                <div className="sec-pillar-card__foot">
                  <span>
                    <span>{stat.passed}</span>
                    <span>/</span>
                    <span>{stat.total}</span>
                    <span> </span>
                    <span>checks green</span>
                  </span>
                  <div className="sec-row-actions">
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() => setDomainFilter(active ? 'all' : dom.id)}
                    >
                      <span>{active ? 'Show All' : 'Filter'}</span>
                    </button>
                    <Link to={dom.to} className="neo-iconbtn neo-iconbtn--sm" aria-label={`Open ${dom.appLabel}`}>
                      <ExternalLink size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Cross-Domain Posture Checks List */}
      <NeoPanel
        hud="Endpoints · Cloud · Code · Secrets · Identity"
        title="Continuous Posture Checks & Drift Remediation"
        icon={<Lock />}
        actions={
          <NeoTabs
            label="Filter posture domain"
            value={domainFilter}
            onChange={setDomainFilter}
            items={[
              { value: 'all', label: 'All Domains', count: POSTURE_CHECKS.length },
              { value: 'endpoints', label: 'Endpoints', icon: <Laptop size={13} /> },
              { value: 'cloud', label: 'Cloud', icon: <Cloud size={13} /> },
              { value: 'code', label: 'Code', icon: <Code2 size={13} /> },
              { value: 'secrets', label: 'Secrets', icon: <Lock size={13} /> },
              { value: 'identity', label: 'Identity', icon: <KeyRound size={13} /> },
            ]}
          />
        }
      >
        <div className="sec-check-list">
          {visibleChecks.map((chk) => {
            const isRemediated = remediatedChecks.includes(chk.id);
            const effectiveStatus = isRemediated ? 'pass' : chk.status;
            const linkedRef = refs[chk.id];
            return (
              <div key={chk.id} className="sec-check-row">
                <div className="sec-check-row__main">
                  <div className="sec-check-row__top">
                    <span className="neo-mono">{chk.id}</span>
                    <Chip tone="slate" size="sm">
                      <span>{chk.domain.toUpperCase()}</span>
                    </Chip>
                    <SeverityBadge severity={chk.severity} />
                    <Chip
                      tone={effectiveStatus === 'pass' ? 'emerald' : effectiveStatus === 'warn' ? 'warning' : 'danger'}
                      size="sm"
                      icon={effectiveStatus === 'pass' ? <CheckCircle2 size={12} /> : undefined}
                    >
                      <span>{effectiveStatus === 'pass' ? 'Passing' : effectiveStatus === 'warn' ? 'Drift Warning' : 'Failing'}</span>
                    </Chip>
                    <span className="neo-mono sec-check-row__service">{chk.service}</span>
                  </div>
                  <div className="sec-check-row__title">{chk.title}</div>
                  <div className="sec-check-row__rem">{chk.remediation}</div>
                </div>

                <div className="sec-check-row__actions">
                  {effectiveStatus !== 'pass' ? (
                    <>
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() => remediateCheck(chk.id)}
                        data-qa={`sec-remediate-${chk.id}`}
                      >
                        <Wrench size={13} />
                        <span>Remediate (+{chk.scoreImpact} pts)</span>
                      </button>
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => createEndpointHelpdeskTicket(`[${chk.id}] ${chk.title}`, chk.remediation, chk.id)}
                      >
                        <Ticket size={13} />
                        <span>File Helpdesk Ticket</span>
                      </button>
                    </>
                  ) : (
                    <Chip tone="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
                      <span>Verified</span>
                    </Chip>
                  )}
                  {linkedRef && (
                    <Link to={linkedRef.to} className="neo-btn neo-btn--ghost neo-btn--xs">
                      <span>{linkedRef.label}</span>
                      <ExternalLink size={12} />
                    </Link>
                  )}
                  <Link to={chk.sourceTo} className="neo-btn neo-btn--ghost neo-btn--xs">
                    <span>Inspect Source</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Attack Surface & Cloud Misconfigurations Split */}
      <div className="sec-two-col">
        <NeoPanel
          hud="External Perimeter & Certificates"
          title="External Attack Surface & TLS Inventory"
          icon={<Globe />}
        >
          <div className="sec-table-wrap">
            <table className="sec-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Kind</th>
                  <th>Ports</th>
                  <th>TLS Grade</th>
                  <th>Cert Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {SURFACE_ASSETS.map((a) => (
                  <tr key={a.host}>
                    <td className="neo-mono">{a.host}</td>
                    <td>{a.kind.toUpperCase()}</td>
                    <td className="neo-mono">{a.ports.join(', ')}</td>
                    <td>
                      <Chip tone={a.tls.startsWith('A') ? 'emerald' : 'warning'} size="sm">
                        <span>{a.tls}</span>
                      </Chip>
                    </td>
                    <td className="neo-mono">
                      <span>{a.certDays}</span>
                      <span>d</span>
                    </td>
                    <td>
                      {a.exposed ? (
                        <Chip tone="warning" size="sm">
                          <span>{a.exposed}</span>
                        </Chip>
                      ) : (
                        <Chip tone="emerald" size="sm">
                          <span>Hardened</span>
                        </Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </NeoPanel>

        <NeoPanel
          hud="Stratos CSPM & EdgeWAF"
          title="Cloud Misconfigurations & Perimeter Radar"
          icon={<Radar />}
        >
          <div className="sec-stack">
            {MISCONFIGS.map((m) => (
              <div key={m.id} className="sec-misconfig-card">
                <div className="sec-misconfig-card__top">
                  <span className="neo-mono">{m.rule}</span>
                  <SeverityBadge severity={m.severity} />
                  <span className="sec-misconfig-card__region">{m.region}</span>
                </div>
                <div className="sec-misconfig-card__title">{m.title}</div>
                <div className="sec-misconfig-card__meta neo-mono">{m.resource}</div>
              </div>
            ))}

            <div className="sec-radar-feed">
              <div className="neo-hud">Recent Blocked Perimeter Probes</div>
              {SEED_RADAR_ATTEMPTS.map((att) => {
                const origin = RADAR_ORIGINS.find((o) => o.id === att.originId);
                return (
                  <div key={att.id} className="sec-radar-row">
                    <Chip tone="emerald" size="sm">
                      <span>Blocked</span>
                    </Chip>
                    <span className="neo-mono">{att.vector}</span>
                    <span>→</span>
                    <strong>{att.hub}</strong>
                    <span className="sec-radar-row__origin">{origin?.city}</span>
                    <span className="sec-radar-row__time">{relTime(att.at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </NeoPanel>
      </div>
    </div>
  );
}
