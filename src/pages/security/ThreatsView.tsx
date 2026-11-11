/**
 * Security Center ("Bastion") — Tab 2: Threat Queue with MITRE ATT&CK Matrix Ribbon,
 * 5-stage Threat Response NeoTracker (Detected & Enriched → Triaged → Contained →
 * Eradicated & Patched → Verified & Closed), 1-click Escalate to Incident Command, and Playbooks.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  ExternalLink,
  Flame,
  KeyRound,
  MessageSquareShare,
  Radio,
  RotateCw,
  ShieldAlert,
  Siren,
  Sparkles,
  UserPlus,
  Video,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoSearch,
  NeoTabs,
  NeoTracker,
  PeoplePicker,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import {
  caseTrackerStep,
  THREAT_RESPONSE_STAGES,
} from '@/security/engine';
import { MITRE_TACTICS } from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { CaseStage, Severity } from '@/security/types';
import {
  broadcastThreatToPulseChat,
  escalateCaseToIncidentCommand,
  launchSecurityBridgeMeet,
  relTime,
  SeverityBadge,
  StageBadge,
  useMySecurity,
  useSecurityModals,
} from './parts';

export function ThreatsView() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { meId } = useMySecurity();
  const { openReport, openNova } = useSecurityModals();
  const users = useHub((s) => s.users);

  const cases = useSecurity((s) => s.cases);
  const advanceCaseStage = useSecurity((s) => s.advanceCaseStage);
  const assignCase = useSecurity((s) => s.assignCase);
  const addCaseNote = useSecurity((s) => s.addCaseNote);
  const runPlaybook = useSecurity((s) => s.runPlaybook);

  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [statusTab, setStatusTab] = useState<'open' | 'closed' | 'all'>('open');
  const [selectedMitre, setSelectedMitre] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [noteText, setNoteText] = useState('');

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusTab === 'open' && c.closed) return false;
      if (statusTab === 'closed' && !c.closed) return false;
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
      if (selectedMitre && !c.mitre.includes(selectedMitre)) return false;
      if (q && !`${c.id} ${c.title} ${c.kind} ${c.iocs.join(' ')} ${c.mitre.join(' ')}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [cases, statusTab, severityFilter, selectedMitre, search]);

  const paramCaseId = params.get('case');
  const activeCase = useMemo(() => {
    if (paramCaseId) {
      const found = cases.find((c) => c.id === paramCaseId);
      if (found) return found;
    }
    return filteredCases[0] ?? cases[0] ?? null;
  }, [cases, filteredCases, paramCaseId]);

  const selectCase = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('case', id);
    setParams(next, { replace: true });
  };

  const handleAddNote = (e: FormEvent) => {
    e.preventDefault();
    if (!activeCase || !noteText.trim()) return;
    addCaseNote(activeCase.id, meId, noteText);
    setNoteText('');
  };

  const openCasesCount = cases.filter((c) => !c.closed).length;
  const criticalCount = cases.filter((c) => !c.closed && c.severity === 'critical').length;
  const containedCount = cases.filter((c) => c.stage === 'contained' || c.stage === 'eradicated' || c.closed).length;

  const assignee = activeCase?.assigneeId ? users.find((u) => u.id === activeCase.assigneeId) : undefined;

  return (
    <div className="sec-view">
      <NeoKpis>
        <NeoKpi
          label="Open Threat Cases"
          value={openCasesCount}
          sub={`${criticalCount} critical priority`}
          icon={<ShieldAlert />}
          tone={criticalCount > 0 ? 'danger' : 'app'}
        />
        <NeoKpi
          label="Contained / Eradicated"
          value={`${containedCount}/${cases.length}`}
          sub="NIST & MITRE response coverage"
          icon={<CheckCircle2 />}
          tone="emerald"
        />
        <NeoKpi
          label="MITRE ATT&CK Tactics"
          value={`${MITRE_TACTICS.length} Tactics`}
          sub="14 techniques mapped"
          icon={<Radio />}
          tone="cyan"
        />
        <NeoKpi
          label="Mean Time to Detect"
          value="4.8m"
          sub="Automated SIEM + Nova enrichment"
          icon={<Zap />}
          tone="violet"
        />
      </NeoKpis>

      {/* MITRE ATT&CK Matrix Ribbon */}
      <NeoPanel
        hud="Adversary Tactics & Techniques"
        title="MITRE ATT&CK Matrix Ribbon"
        icon={<Radio />}
        actions={
          selectedMitre ? (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setSelectedMitre(null)}>
              <span>Clear MITRE Filter ({selectedMitre})</span>
            </button>
          ) : (
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => openNova('Analyze our MITRE ATT&CK threat coverage')}>
              <Sparkles size={13} />
              <span>Ask Nova</span>
            </button>
          )
        }
      >
        <div className="sec-mitre-ribbon" role="region" aria-label="MITRE ATT&CK Matrix">
          {MITRE_TACTICS.map((tactic) => {
            const hits = cases.filter((c) => tactic.techniques.some((t) => c.mitre.includes(t.id))).length;
            return (
              <div key={tactic.id} className="sec-mitre-col">
                <div className="sec-mitre-col__head">
                  <span className="neo-mono">{tactic.id}</span>
                  <strong>{tactic.short}</strong>
                  <Chip tone={hits > 0 ? 'rose' : 'slate'} size="sm">
                    <span>{hits}</span>
                  </Chip>
                </div>
                <div className="sec-mitre-col__techs">
                  {tactic.techniques.map((tech) => {
                    const count = cases.filter((c) => c.mitre.includes(tech.id)).length;
                    const active = selectedMitre === tech.id;
                    return (
                      <button
                        key={tech.id}
                        type="button"
                        className={`sec-mitre-tech ${active ? 'is-active' : ''} ${count > 0 ? 'has-hits' : ''}`}
                        onClick={() => setSelectedMitre(active ? null : tech.id)}
                      >
                        <div className="sec-mitre-tech__top">
                          <span className="neo-mono">{tech.id}</span>
                          {count > 0 && <span className="sec-mitre-tech__badge">{count}</span>}
                        </div>
                        <div className="sec-mitre-tech__name">{tech.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Split Threat Queue + Active Case Command Deck */}
      <div className="sec-threat-layout">
        <NeoPanel
          hud="SOC Triage Queue"
          title="Threat Alerts"
          icon={<Flame />}
          actions={
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={() => openReport('phishing')}>
              <Siren size={13} />
              <span>New Signal</span>
            </button>
          }
        >
          <div className="sec-queue-controls">
            <NeoTabs
              label="Case status filter"
              value={statusTab}
              onChange={setStatusTab}
              items={[
                { value: 'open', label: 'Open cases', count: openCasesCount },
                { value: 'closed', label: 'Closed', count: cases.length - openCasesCount },
                { value: 'all', label: 'All', count: cases.length },
              ]}
            />
            <NeoSearch
              value={search}
              onChange={setSearch}
              placeholder="Filter cases, IOCs, MITRE ID…"
              size="sm"
            />
            <div className="sec-filter-chips">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                <Chip
                  key={sev}
                  tone={sev === 'critical' ? 'danger' : sev === 'high' ? 'orange' : 'slate'}
                  size="sm"
                  pressed={severityFilter === sev}
                  onClick={() => setSeverityFilter(sev)}
                >
                  <span>{sev === 'all' ? 'All Severities' : sev.toUpperCase()}</span>
                </Chip>
              ))}
            </div>
          </div>

          <div className="sec-case-list" role="listbox" aria-label="SOC Threat Cases">
            {filteredCases.length === 0 ? (
              <NeoEmpty icon={<CheckCircle2 />} title="No matching threat cases" compact />
            ) : (
              filteredCases.map((c) => {
                const isSelected = activeCase?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`sec-case-row ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => selectCase(c.id)}
                  >
                    <div className="sec-case-row__top">
                      <span className="neo-mono">{c.id}</span>
                      <SeverityBadge severity={c.severity} />
                      <StageBadge stage={c.stage} closed={c.closed} />
                      <span className="sec-case-row__time">{relTime(c.updatedAt)}</span>
                    </div>
                    <div className="sec-case-row__title">{c.title}</div>
                    <div className="sec-case-row__meta">
                      <span>{c.source.label}</span>
                      <span> · </span>
                      <span className="neo-mono">{c.mitre.join(', ')}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </NeoPanel>

        {/* Active Case Inspector */}
        {activeCase ? (
          <div className="sec-case-detail">
            {/* 5-Stage Threat Response NeoTracker */}
            <NeoTracker
              hud={`Threat Response Tracker · ${activeCase.id}`}
              title={activeCase.title}
              steps={THREAT_RESPONSE_STAGES.map((st) => ({
                id: st.id,
                label: st.label,
                sub: st.sub,
              }))}
              current={caseTrackerStep(activeCase)}
              eta={`Confidence ${Math.round(activeCase.confidence * 100)}% · MTTD ${activeCase.detectedAfterMins}m`}
              message={activeCase.detail}
              actions={
                <div className="sec-row-actions">
                  {!activeCase.closed && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--xs"
                      onClick={() => advanceCaseStage(activeCase.id, meId)}
                      data-qa="sec-advance-stage"
                    >
                      <ArrowRight size={13} />
                      <span>Advance Stage</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="neo-btn neo-btn--danger neo-btn--xs"
                    onClick={() => escalateCaseToIncidentCommand(activeCase, meId)}
                    data-qa="sec-escalate-incident"
                  >
                    <Siren size={13} />
                    <span>Escalate to Incident Command</span>
                  </button>
                </div>
              }
            />

            <NeoPanel
              hud="One-Click Automated Containment & Response"
              title="SOC Response Playbooks & Stage Controls"
              icon={<Zap />}
              actions={
                <PeoplePicker
                  value={activeCase.assigneeId ? [activeCase.assigneeId] : []}
                  onChange={(ids) => assignCase(activeCase.id, ids[0], meId)}
                  allowNone
                  label="Assign SOC owner"
                  trigger={(p) => (
                    <button type="button" {...p} className="neo-btn neo-btn--soft neo-btn--xs">
                      {assignee ? <Avatar user={assignee} size={18} /> : <UserPlus size={13} />}
                      <span>{assignee ? assignee.name : 'Assign Analyst'}</span>
                    </button>
                  )}
                />
              }
            >
              {/* Direct 5-stage selector bar */}
              <div className="sec-stage-pills" role="group" aria-label="Set Threat Response Stage">
                {THREAT_RESPONSE_STAGES.map((st) => {
                  const active = activeCase.stage === st.id || (st.id === 'recovered' && activeCase.closed);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className={`sec-stage-pill ${active ? 'is-active' : ''}`}
                      onClick={() => advanceCaseStage(activeCase.id, meId, st.id as CaseStage)}
                    >
                      <span>{st.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="sec-playbook-grid">
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => runPlaybook(activeCase.id, 'isolate', meId, { label: 'EDR Host Isolated', to: '/helpdesk' })}
                >
                  <ShieldAlert size={14} />
                  <span>Isolate Endpoint (EDR)</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => runPlaybook(activeCase.id, 'reset', meId, { label: 'SSO Sessions Revoked', to: '/security' })}
                >
                  <KeyRound size={14} />
                  <span>Revoke SSO & Force Passkey</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => runPlaybook(activeCase.id, 'block', meId, { label: 'IOC Sinkholed', to: '/security/dlp' })}
                >
                  <Ban size={14} />
                  <span>Sinkhole IOCs at Gateway</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => runPlaybook(activeCase.id, 'rotate', meId, { label: 'Vault Secret Rotated', to: '/vault/secrets' })}
                >
                  <RotateCw size={14} />
                  <span>Rotate Vault Lease</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => launchSecurityBridgeMeet(activeCase, meId, navigate)}
                >
                  <Video size={14} />
                  <span>Launch HoloMeet Bridge</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => broadcastThreatToPulseChat(activeCase, meId)}
                >
                  <MessageSquareShare size={14} />
                  <span>Post Advisory to Pulse Chat</span>
                </button>
              </div>

              {/* IOCs, Assets & Cross-App Source */}
              <div className="sec-ioc-grid">
                <div>
                  <div className="neo-hud">Indicators of Compromise (IOCs)</div>
                  <div className="sec-chip-wrap">
                    {activeCase.iocs.map((ioc) => (
                      <Chip key={ioc} tone="danger" size="sm">
                        <span className="neo-mono">{ioc}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="neo-hud">Targeted Assets & MITRE Techniques</div>
                  <div className="sec-chip-wrap">
                    {activeCase.assets.map((asset) => (
                      <Chip key={asset} tone="cyan" size="sm">
                        <span className="neo-mono">{asset}</span>
                      </Chip>
                    ))}
                    {activeCase.mitre.map((m) => (
                      <Chip key={m} tone="pink" size="sm">
                        <span className="neo-mono">{m}</span>
                      </Chip>
                    ))}
                    {activeCase.source.to && (
                      <Link to={activeCase.source.to} className="neo-btn neo-btn--ghost neo-btn--xs">
                        <span>{activeCase.source.label}</span>
                        <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </NeoPanel>

            {/* Case Timeline & Investigation Notes */}
            <NeoPanel hud="Forensic Audit Trail" title="Investigation Timeline">
              <div className="sec-timeline">
                {activeCase.timeline.map((ev) => (
                  <div key={ev.id} className="sec-timeline__item">
                    <span className="sec-timeline__dot" />
                    <div className="sec-timeline__content">
                      <div className="sec-timeline__text">{ev.text}</div>
                      <div className="sec-timeline__meta">
                        <span>{relTime(ev.at)}</span>
                        {ev.link && (
                          <>
                            <span> · </span>
                            <Link to={ev.link.to} className="sec-inline-link">
                              <span>{ev.link.label}</span>
                              <ExternalLink size={11} />
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form className="sec-note-form" onSubmit={handleAddNote}>
                <input
                  className="neo-input"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Append forensic note or remediation update to timeline…"
                />
                <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm">
                  <span>Log Note</span>
                </button>
              </form>
            </NeoPanel>
          </div>
        ) : null}
      </div>
    </div>
  );
}
