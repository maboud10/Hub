/**
 * Security Center ("Bastion") — Tab 1: My Security (Personal Shield 0–100,
 * 5 explainable segments, managed device posture, and 5-stage Suspicious Report NeoTracker).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Laptop,
  Lock,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Bar,
  Chip,
  CountUp,
  NeoBanner,
  NeoBanners,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  NeoTracker,
  Ring,
} from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import {
  computeOrgPosture,
  computePersonalShield,
  deriveDeviceSignals,
  REPORT_TRACKER_STAGES,
  reportTrackerStep,
} from '@/security/engine';
import { POLICIES, TRAINING_MODULES } from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { DeviceSeed, Fix, VaultHygieneLite } from '@/security/types';
import {
  relTime,
  SeverityBadge,
  StageBadge,
  useMySecurity,
  useSecurityModals,
} from './parts';

export function MySecurityView() {
  const navigate = useNavigate();
  const { meId, person } = useMySecurity();
  const { openReport, openNova } = useSecurityModals();

  const cases = useSecurity((s) => s.cases);
  const reports = useSecurity((s) => s.reports);
  const acks = useSecurity((s) => s.acks);
  const people = useSecurity((s) => s.people);
  const remediatedChecks = useSecurity((s) => s.remediatedChecks);
  const patchedCves = useSecurity((s) => s.patchedCves);

  const enrollPasskey = useSecurity((s) => s.enrollPasskey);
  const revokeStaleSessions = useSecurity((s) => s.revokeStaleSessions);
  const ackAllPolicies = useSecurity((s) => s.ackAllPolicies);
  const completeTraining = useSecurity((s) => s.completeTraining);

  const [liveDevices, setLiveDevices] = useState<DeviceSeed[] | null>(null);
  const [liveVault, setLiveVault] = useState<VaultHygieneLite | null>(null);

  useEffect(() => {
    let active = true;
    const viewer = currentViewer();
    if (!viewer) return;

    loadBridge('helpdesk')
      .then((hd) => {
        if (!active) return;
        const list = hd.listDevicesFor(viewer, meId);
        if (list && list.length > 0) {
          setLiveDevices(list.map((d) => ({ assetTag: d.assetTag, name: d.name, kind: d.kind, health: d.health })));
        }
      })
      .catch(() => {});

    loadBridge('vault')
      .then((vt) => {
        if (!active) return;
        const h = vt.hygiene(viewer);
        if (h && h.score > 0) {
          setLiveVault(h);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [meId]);

  const ackedPolicyIds = POLICIES.filter((pol) => Boolean(acks[pol.id]?.[meId])).map((pol) => pol.id);
  const shield = computePersonalShield(person, ackedPolicyIds, liveVault, liveDevices);
  const org = computeOrgPosture({ cases, people, remediatedChecks, patchedCves });
  const deviceSignals = deriveDeviceSignals(liveDevices && liveDevices.length > 0 ? liveDevices : person.devices);

  const myReports = reports.filter((r) => r.reporterId === meId);
  const activeReport = myReports[0] ?? reports[0];
  const linkedCase = activeReport ? cases.find((c) => c.id === activeReport.caseId) : cases[0];

  const handleFix = (fix: Fix) => {
    if (fix.action === 'passkey') {
      enrollPasskey(meId);
      return;
    }
    if (fix.action === 'ack') {
      ackAllPolicies(meId);
      return;
    }
    if (fix.to) {
      navigate(fix.to);
    }
  };

  const main = (
    <>
      <NeoBanners>
        {person.staleSessions > 0 ? (
          <NeoBanner
            tone="warning"
            icon={<KeyRound />}
            title="Idle SSO sessions detected on your identity profile"
            meta={`${person.staleSessions} stale token(s)`}
            action={
              <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={() => revokeStaleSessions(meId)}>
                <span>Revoke Idle Sessions</span>
              </button>
            }
          >
            <span>Revoking unused browser and mobile sessions boosts your Identity segment by +10 pts.</span>
          </NeoBanner>
        ) : (
          <NeoBanner
            tone="rose"
            icon={<Zap />}
            title="Active SOC Advisory · SEC-1048 & DocuSign OAuth Phishing Wave"
            to="/security/threats"
            meta="MITRE T1566.001 · T1552.001"
          >
            <span>Never approve unsolicited OAuth mail.readwrite prompts. Use 1-Tap Report if you spot lookalike domains.</span>
          </NeoBanner>
        )}
      </NeoBanners>

      {/* Hero Personal Security Score Ring (0-100) */}
      <NeoPanel
        hud="Personal Zero-Trust Posture"
        title="My Personal Security Shield"
        icon={<ShieldCheck />}
        actions={
          <div className="sec-row-actions">
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => enrollPasskey(meId)}
              data-qa="sec-enroll-passkey"
            >
              <Fingerprint size={14} />
              <span>Register Passkey</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--sm"
              onClick={() => openReport('phishing')}
              data-qa="sec-hero-report"
            >
              <Siren size={14} />
              <span>Report Something Suspicious</span>
            </button>
          </div>
        }
      >
        <div className="sec-shield-hero">
          <div className="sec-shield-hero__ring">
            <Ring
              value={shield.score / 100}
              size={138}
              stroke={11}
              label={`Personal security score ${shield.score} out of 100`}
            >
              <div className="sec-shield-hero__score">
                <strong>
                  <CountUp value={shield.score} />
                </strong>
                <span>/ 100</span>
              </div>
            </Ring>
            <Chip
              tone={shield.score >= 90 ? 'emerald' : shield.score >= 80 ? 'cyan' : 'warning'}
              size="sm"
              solid
            >
              <span>{shield.tier}</span>
            </Chip>
          </div>

          <div className="sec-shield-hero__details">
            <div className="sec-shield-hero__summary">
              <div className="neo-hud">5-Segment Explainable Posture</div>
              <h3>
                <span>Your shield is </span>
                <span>{shield.tier}</span>
                <span> · Org Posture </span>
                <span>{org.score}</span>
                <span>/100</span>
              </h3>
              <p>
                Calculated live from your IT Helpdesk endpoints, Okta FastPass passkeys, Spot-the-Phish drills, policy attestations, and Aegis Vault credential hygiene.
              </p>
              <div className="sec-badge-strip">
                <Chip tone="pink" size="sm" icon={<Award size={12} />}>
                  <span>{person.xp}</span>
                  <span> </span>
                  <span>Shield XP</span>
                </Chip>
                <Chip tone="violet" size="sm" icon={<Fingerprint size={12} />}>
                  <span>{person.passkeys}</span>
                  <span> </span>
                  <span>Passkeys</span>
                </Chip>
                {person.game.badges.map((b) => (
                  <Chip key={b} tone="cyan" size="sm">
                    <span>{b}</span>
                  </Chip>
                ))}
              </div>
            </div>

            <div className="sec-segment-grid">
              {shield.segments.map((seg) => (
                <div key={seg.id} className="sec-segment-card neo-spot">
                  <div className="sec-segment-card__top">
                    <span className="sec-segment-card__title">{seg.label}</span>
                    <span className="sec-segment-card__score neo-mono">
                      <span>{seg.score}</span>
                      <span>/100</span>
                    </span>
                  </div>
                  <Bar
                    value={seg.score / 100}
                    label={`${seg.label} score ${seg.score}%`}
                    fill={seg.score >= 90 ? 'var(--success)' : seg.score >= 78 ? 'var(--app-c1)' : 'var(--warning)'}
                  />
                  <div className="sec-segment-card__drivers">
                    {seg.drivers.map((d) => (
                      <div key={d.label} className="sec-driver-row">
                        <span>{d.label}</span>
                        <span data-tone={d.tone}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                  {seg.fixes.length > 0 && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--xs sec-segment-card__fix"
                      onClick={() => handleFix(seg.fixes[0])}
                    >
                      <Sparkles size={12} />
                      <span>{seg.fixes[0].label}</span>
                      <span className="neo-mono">+{seg.fixes[0].gain}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </NeoPanel>

      {/* 5-Stage Suspicious Report Tracker */}
      {activeReport && (
        <NeoTracker
          hud="Suspicious Report Tracker · 5 Stages"
          title={`${activeReport.id} · ${activeReport.title}`}
          steps={REPORT_TRACKER_STAGES}
          current={reportTrackerStep(linkedCase)}
          eta={linkedCase ? `Case ${linkedCase.id}` : 'SLA 15m'}
          message={
            linkedCase
              ? `Linked to SOC case ${linkedCase.id} (${linkedCase.severity.toUpperCase()}) · MITRE ${linkedCase.mitre.join(', ')}`
              : 'Your report is being enriched by Nova and triaged by the SOC.'
          }
          actions={
            linkedCase ? (
              <Link to={`/security/threats?case=${linkedCase.id}`} className="neo-btn neo-btn--soft neo-btn--xs">
                <span>Inspect SOC Case</span>
                <ExternalLink size={12} />
              </Link>
            ) : undefined
          }
        />
      )}

      {/* Nova Security Copilot Prompt */}
      <NeoNovaPrompt
        hud="Nova Security Copilot"
        title="Ask Nova to analyze a suspicious message, explain a CVE, or harden your posture"
        badge="Zero-Trust AI"
        placeholder="e.g. Why is CVE-2026-24811 critical, or how do I reach 100/100 on my Personal Shield?"
        suggestions={[
          'Summarize active critical threats',
          'Which critical CVE should we patch first?',
          'Check ISO 27001 & SOC 2 readiness',
          'How can I boost my personal shield score?',
        ]}
        submitLabel="Ask Nova"
        onSubmit={(text) => openNova(text)}
      />
    </>
  );

  const side = (
    <>
      <NeoPanel
        hud="IT Helpdesk · Endpoint Telemetry"
        title="My Managed Devices"
        icon={<Laptop />}
        actions={
          <Link to="/helpdesk" className="neo-btn neo-btn--ghost neo-btn--xs">
            <span>Helpdesk</span>
            <ExternalLink size={12} />
          </Link>
        }
      >
        <div className="sec-stack">
          {deviceSignals.map((dev) => (
            <div key={dev.assetTag} className="sec-device-card">
              <div className="sec-device-card__head">
                <span className="sec-device-card__icon">
                  {dev.kind === 'phone' ? <Smartphone size={16} /> : <Laptop size={16} />}
                </span>
                <div className="grow">
                  <div className="sec-device-card__name">{dev.name}</div>
                  <div className="sec-device-card__meta neo-mono">{dev.assetTag}</div>
                </div>
                <Chip tone={dev.health >= 90 ? 'emerald' : 'warning'} size="sm">
                  <span>{dev.health}%</span>
                </Chip>
              </div>
              <div className="sec-device-card__checks">
                <Chip tone={dev.encrypted ? 'emerald' : 'danger'} size="sm" icon={<Lock size={11} />}>
                  <span>{dev.encrypted ? 'FileVault Encrypted' : 'Unencrypted'}</span>
                </Chip>
                <Chip tone={dev.osCurrent ? 'cyan' : 'warning'} size="sm">
                  <span>{dev.osCurrent ? 'OS Current' : 'Update Pending'}</span>
                </Chip>
                <Chip tone={dev.edr === 'healthy' || dev.edr === 'n/a' ? 'emerald' : 'warning'} size="sm">
                  <span>EDR:</span>
                  <span> </span>
                  <span>{dev.edr.toUpperCase()}</span>
                </Chip>
              </div>
            </div>
          ))}
        </div>
      </NeoPanel>

      <NeoPanel
        hud="Micro-Training & Attestations"
        title="Required Security Modules"
        icon={<CheckCircle2 />}
      >
        <div className="sec-stack">
          {TRAINING_MODULES.map((m) => {
            const st = person.training.find((t) => t.moduleId === m.id)?.status ?? 'todo';
            return (
              <div key={m.id} className="sec-train-row">
                <div className="grow">
                  <div className="sec-train-row__title">{m.title}</div>
                  <div className="sec-train-row__meta">
                    <span>{m.minutes}</span>
                    <span> </span>
                    <span>min micro-drill</span>
                  </div>
                </div>
                {st === 'done' ? (
                  <Chip tone="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
                    <span>Completed</span>
                  </Chip>
                ) : (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => completeTraining(meId, m.id)}
                  >
                    <span>Complete</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </NeoPanel>

      <NeoPanel
        hud="Active Threat Queue Snapshot"
        title="Recent SOC Alerts"
        icon={<Zap />}
        actions={
          <Link to="/security/threats" className="neo-btn neo-btn--ghost neo-btn--xs">
            <span>All Threats</span>
          </Link>
        }
      >
        <div className="sec-stack">
          {cases.slice(0, 3).map((c) => (
            <Link key={c.id} to={`/security/threats?case=${c.id}`} className="sec-mini-case">
              <div className="sec-mini-case__top">
                <span className="neo-mono">{c.id}</span>
                <SeverityBadge severity={c.severity} />
                <StageBadge stage={c.stage} closed={c.closed} />
              </div>
              <div className="sec-mini-case__title">{c.title}</div>
              <div className="sec-mini-case__meta">
                <span>{c.source.label}</span>
                <span> · </span>
                <span>{relTime(c.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </NeoPanel>
    </>
  );

  return (
    <div className="sec-view">
      <NeoKpis>
        <NeoKpi
          label="My Security Score"
          value={
            <>
              <CountUp value={shield.score} />
              <span>/100</span>
            </>
          }
          sub={`Tier · ${shield.tier}`}
          icon={<ShieldCheck />}
          tone="app"
        />
        <NeoKpi
          label="Org Security Posture"
          value={
            <>
              <CountUp value={org.score} />
              <span>/100</span>
            </>
          }
          sub={`MTTD ${org.mttdMins}m · MTTR ${org.mttrMins}m`}
          icon={<Zap />}
          tone="cyan"
          to="/security/posture"
        />
        <NeoKpi
          label="Active SOC Cases"
          value={<CountUp value={cases.filter((c) => !c.closed).length} />}
          sub={`${org.openCritical} critical uncontained`}
          icon={<Siren />}
          tone={org.openCritical > 0 ? 'danger' : 'emerald'}
          to="/security/threats"
        />
        <NeoKpi
          label="Passkeys & Sessions"
          value={`${person.passkeys} Passkeys`}
          sub={person.staleSessions > 0 ? `${person.staleSessions} stale session(s)` : `${person.sessions} verified sessions`}
          icon={<Fingerprint />}
          tone={person.staleSessions === 0 ? 'emerald' : 'warning'}
        />
      </NeoKpis>

      <NeoHome main={main} side={side} />
    </div>
  );
}
