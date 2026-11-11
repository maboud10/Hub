/**
 * Security Center ("Bastion") — Tab 5: Compliance & Evidence
 * 4 frameworks (ISO 27001, SOC 2 Type II, UAE IA / NESA, GDPR), automated cross-app
 * evidence collection, policy attestations, and the Compliance Auditor Pack Generator.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FolderSync,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  Chip,
  CountUp,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  Ring,
} from '@/components/neo';
import { scoreFrameworkReadiness } from '@/security/engine';
import {
  CONTROLS,
  EVIDENCE_SPECS,
  FRAMEWORKS,
  POLICIES,
} from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { FrameworkId } from '@/security/types';
import {
  relTime,
  scheduleComplianceReviewCalendar,
  useMySecurity,
} from './parts';

const PRIMARY_FRAMEWORKS = FRAMEWORKS.filter((f) =>
  ['iso27001', 'soc2', 'nesa', 'gdpr'].includes(f.id),
);

export function ComplianceView() {
  const { meId } = useMySecurity();
  const evidenceAt = useSecurity((s) => s.evidenceAt);
  const patchedCves = useSecurity((s) => s.patchedCves);
  const acks = useSecurity((s) => s.acks);
  const auditorPacks = useSecurity((s) => s.auditorPacks);

  const refreshEvidence = useSecurity((s) => s.refreshEvidence);
  const generateAuditorPack = useSecurity((s) => s.generateAuditorPack);
  const ackPolicy = useSecurity((s) => s.ackPolicy);
  const ackAllPolicies = useSecurity((s) => s.ackAllPolicies);

  const [selectedFw, setSelectedFw] = useState<FrameworkId>('iso27001');

  const activeFw = PRIMARY_FRAMEWORKS.find((f) => f.id === selectedFw) ?? PRIMARY_FRAMEWORKS[0];
  const readiness = scoreFrameworkReadiness(selectedFw, evidenceAt, patchedCves, acks);
  const fwControls = CONTROLS.filter((c) => Boolean(c.refs[selectedFw]));

  const now = Date.now();
  const DAY = 86_400_000;

  return (
    <div className="sec-view">
      <NeoKpis>
        <NeoKpi
          label={`${activeFw.short} Readiness`}
          value={
            <>
              <CountUp value={readiness.score} />
              <span>%</span>
            </>
          }
          sub={`${readiness.passingControls}/${readiness.totalControls} controls passing`}
          icon={<ShieldCheck />}
          tone={readiness.score >= 88 ? 'emerald' : 'app'}
        />
        <NeoKpi
          label="Fresh Evidence Artifacts"
          value={`${readiness.freshEvidence}/${readiness.totalEvidence}`}
          sub="Auto-collected across 7 hub apps"
          icon={<FolderSync />}
          tone={readiness.freshEvidence === readiness.totalEvidence ? 'emerald' : 'warning'}
        />
        <NeoKpi
          label="Policy Attestation Rate"
          value={`${readiness.policyAckRate}%`}
          sub={`${POLICIES.length} active security charters`}
          icon={<FileCheck2 />}
          tone="cyan"
        />
        <NeoKpi
          label="Signed Auditor Packs"
          value={auditorPacks.length}
          sub="SHA-256 tamper-evident manifests"
          icon={<PackageCheck />}
          tone="violet"
        />
      </NeoKpis>

      {/* 4 Compliance Frameworks Selector Grid */}
      <NeoPanel
        hud="Continuous GRC & Regulatory Posture"
        title="Compliance Frameworks (ISO 27001 · SOC 2 Type II · UAE IA / NESA · GDPR)"
        icon={<ShieldCheck />}
        actions={
          <div className="sec-row-actions">
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--sm"
              onClick={() => scheduleComplianceReviewCalendar(activeFw.name)}
            >
              <CalendarPlus size={14} />
              <span>Schedule Audit Review</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--sm"
              onClick={() => generateAuditorPack(selectedFw, meId)}
              data-qa="sec-generate-auditor-pack"
            >
              <PackageCheck size={14} />
              <span>Generate Auditor Pack ({activeFw.short})</span>
            </button>
          </div>
        }
      >
        <div className="sec-fw-grid" role="tablist" aria-label="Compliance frameworks">
          {PRIMARY_FRAMEWORKS.map((fw) => {
            const st = scoreFrameworkReadiness(fw.id, evidenceAt, patchedCves, acks);
            const isSelected = selectedFw === fw.id;
            return (
              <button
                key={fw.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`sec-fw-card neo-spot ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedFw(fw.id)}
              >
                <div className="sec-fw-card__head">
                  <Ring value={st.score / 100} size={62} stroke={6}>
                    <span className="neo-mono">{st.score}%</span>
                  </Ring>
                  <div className="grow">
                    <div className="sec-fw-card__name">{fw.name}</div>
                    <div className="sec-fw-card__region">{fw.region}</div>
                    <div className="sec-fw-card__auditor">Auditor: {fw.auditor}</div>
                  </div>
                </div>
                <Bar
                  value={st.score / 100}
                  fill={st.score >= 88 ? 'var(--success)' : 'var(--app-c1)'}
                  label={`${fw.name} readiness ${st.score}%`}
                />
                <div className="sec-fw-card__foot">
                  <span>
                    <span>{st.passingControls}</span>
                    <span>/</span>
                    <span>{st.totalControls}</span>
                    <span> </span>
                    <span>controls green</span>
                  </span>
                  <Chip tone={st.readyForAudit ? 'emerald' : 'warning'} size="sm">
                    <span>{st.readyForAudit ? 'Audit Ready' : 'Action Needed'}</span>
                  </Chip>
                </div>
              </button>
            );
          })}
        </div>
      </NeoPanel>

      {/* Compliance Auditor Pack Generator & Manifest History */}
      <NeoPanel
        hud="Tamper-Evident Cryptographic Attestation"
        title="Compliance Auditor Pack Generator"
        icon={<PackageCheck />}
        actions={
          <button
            type="button"
            className="neo-btn neo-btn--soft neo-btn--xs"
            onClick={() => refreshEvidence()}
            data-qa="sec-refresh-all-evidence"
          >
            <FolderSync size={13} />
            <span>Refresh All Evidence</span>
          </button>
        }
      >
        <div className="sec-pack-list">
          {auditorPacks.map((pack) => {
            const fw = FRAMEWORKS.find((f) => f.id === pack.frameworkId);
            return (
              <div key={pack.id} className="sec-pack-card">
                <div className="sec-pack-card__main">
                  <div className="sec-pack-card__top">
                    <span className="neo-mono">{pack.id}</span>
                    <Chip tone="pink" size="sm">
                      <span>{fw?.name ?? pack.frameworkId.toUpperCase()}</span>
                    </Chip>
                    <Chip tone="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
                      <span>Readiness {pack.readinessScore}%</span>
                    </Chip>
                    <span className="sec-pack-card__time">{relTime(pack.generatedAt)}</span>
                  </div>
                  <div className="sec-pack-card__digest neo-mono">
                    <span>SHA-256: </span>
                    <span>{pack.sha256}</span>
                  </div>
                  <div className="sec-pack-card__meta">
                    <span>{pack.controlsPassed}</span>
                    <span>/</span>
                    <span>{pack.controlsTotal}</span>
                    <span> controls verified · </span>
                    <span>{pack.evidenceCount}</span>
                    <span> cross-app evidence snapshots bundled</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      <div className="sec-two-col">
        {/* Controls Matrix for Selected Framework */}
        <NeoPanel
          hud={`${activeFw.name} · Clause Mapping`}
          title="Mapped Security Controls & Test Status"
          icon={<FileSpreadsheet />}
        >
          <div className="sec-stack">
            {fwControls.map((ctl) => {
              const clause = ctl.refs[selectedFw];
              return (
                <div key={ctl.id} className="sec-control-card">
                  <div className="sec-control-card__top">
                    <span className="neo-mono">{ctl.id}</span>
                    <Chip tone="pink" size="sm">
                      <span className="neo-mono">{clause}</span>
                    </Chip>
                    <Chip tone="slate" size="sm">
                      <span>{ctl.family}</span>
                    </Chip>
                    <Chip
                      tone={ctl.test === 'pass' ? 'emerald' : ctl.test === 'warn' ? 'warning' : 'danger'}
                      size="sm"
                    >
                      <span>{ctl.test === 'pass' ? 'Verified Pass' : ctl.test === 'warn' ? 'Evidence Stale' : 'SLA Breach'}</span>
                    </Chip>
                  </div>
                  <div className="sec-control-card__title">{ctl.title}</div>
                  <div className="sec-chip-wrap">
                    {ctl.evidence.map((evId) => (
                      <Chip key={evId} tone="cyan" size="sm">
                        <span className="neo-mono">{evId}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </NeoPanel>

        {/* Automated Cross-App Evidence & Policies */}
        <div className="sec-stack">
          <NeoPanel
            hud="Zero-Touch Evidence Harvester"
            title="Cross-App Evidence Snapshots"
            icon={<FolderSync />}
          >
            <div className="sec-stack">
              {EVIDENCE_SPECS.map((ev) => {
                const ts = evidenceAt[ev.id];
                const ageDays = ts ? Math.max(0, Math.round((now - ts) / DAY)) : ev.collectedDaysAgo;
                const fresh = ageDays <= ev.maxAgeDays;
                return (
                  <div key={ev.id} className="sec-ev-row">
                    <div className="grow">
                      <div className="sec-ev-row__top">
                        <span className="neo-mono">{ev.id}</span>
                        <strong>{ev.label}</strong>
                      </div>
                      <div className="sec-ev-row__meta">
                        <span>{ev.appLabel}</span>
                        <span> · </span>
                        <span>{ageDays === 0 ? 'Collected just now' : `${ageDays}d old (max ${ev.maxAgeDays}d)`}</span>
                      </div>
                    </div>
                    <div className="sec-row-actions">
                      <Chip tone={fresh ? 'emerald' : 'warning'} size="sm">
                        <span>{fresh ? 'Fresh' : 'Stale'}</span>
                      </Chip>
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => refreshEvidence(ev.id)}
                      >
                        <FolderSync size={12} />
                        <span>Re-collect</span>
                      </button>
                      <Link to={ev.to} className="neo-iconbtn neo-iconbtn--sm" aria-label={`Open ${ev.appLabel}`}>
                        <ExternalLink size={12} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </NeoPanel>

          <NeoPanel
            hud="Employee Governance"
            title="Security Charters & Policy Attestation"
            icon={<FileCheck2 />}
            actions={
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--xs"
                onClick={() => ackAllPolicies(meId)}
              >
                <span>Attest All Policies</span>
              </button>
            }
          >
            <div className="sec-stack">
              {POLICIES.map((pol) => {
                const signed = Boolean(acks[pol.id]?.[meId]);
                return (
                  <div key={pol.id} className="sec-ev-row">
                    <div className="grow">
                      <div className="sec-ev-row__top">
                        <span className="neo-mono">{pol.version}</span>
                        <strong>{pol.title}</strong>
                      </div>
                    </div>
                    {signed ? (
                      <Chip tone="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
                        <span>Attested</span>
                      </Chip>
                    ) : (
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => ackPolicy(meId, pol.id)}
                      >
                        <span>Attest</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </NeoPanel>
        </div>
      </div>
    </div>
  );
}
