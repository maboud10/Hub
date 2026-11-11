/**
 * Security Center ("Bastion") — Tab 6: DLP & Phishing Radar
 * Data Loss Prevention (Mail, Drive, GenAI), Sovereign Residency, Phishing Simulation
 * campaigns by department, and the interactive Spot-the-Phish training drill.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Ban,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  FileWarning,
  MailWarning,
  Radar,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  Bar,
  Chip,
  CountUp,
  NeoKpi,
  NeoKpis,
  NeoPanel,
} from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { firstName } from '@/lib/format';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { scoreCampaignMetrics } from '@/security/engine';
import {
  DATASETS,
  GAME_EMAILS,
  RETENTION_POLICIES,
} from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { GameZone } from '@/security/types';
import { relTime, useMySecurity } from './parts';

export function DlpPhishingView() {
  const me = useSessionUser();
  const { meId } = useMySecurity();
  const users = useHub((s) => s.users);

  const dlp = useSecurity((s) => s.dlp);
  const campaigns = useSecurity((s) => s.campaigns);
  const blocklist = useSecurity((s) => s.blocklist);

  const updateDlpAction = useSecurity((s) => s.updateDlpAction);
  const recordGameRound = useSecurity((s) => s.recordGameRound);
  const launchCampaignDrill = useSecurity((s) => s.launchCampaignDrill);
  const blockIoc = useSecurity((s) => s.blockIoc);

  const [emailIdx, setEmailIdx] = useState(0);
  const [selectedZones, setSelectedZones] = useState<GameZone[]>([]);
  const [gameResult, setGameResult] = useState<{ correct: boolean; message: string } | null>(null);
  const [newIoc, setNewIoc] = useState('');

  const activeCampaign = campaigns[0];
  const campStats = scoreCampaignMetrics(activeCampaign);
  const currentEmail = GAME_EMAILS[emailIdx % GAME_EMAILS.length];

  const toggleZone = (z: GameZone) => {
    setSelectedZones((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
  };

  const submitVerdict = (guessedPhish: boolean) => {
    const correct = guessedPhish === currentEmail.phish;
    const scorePct = correct ? 100 : 50;
    recordGameRound(meId, scorePct);
    setGameResult({
      correct,
      message: `${correct ? 'Spot on! +25 Shield XP.' : 'Look closer next time.'} ${currentEmail.lesson}`,
    });
  };

  const nextEmail = () => {
    setSelectedZones([]);
    setGameResult(null);
    setEmailIdx((i) => i + 1);
  };

  const handleCoachUser = async (dlpId: string, userId: string, objectName: string) => {
    updateDlpAction(dlpId, 'blocked', true);
    const viewer = currentViewer();
    try {
      if (viewer) {
        const mail = await loadBridge('mail');
        mail.sendMail(viewer, {
          to: [userId],
          subject: `Bastion DLP Coaching · Safe handling of ${objectName}`,
          body: `Hi — Bastion DLP intercepted an external transfer of "${objectName}". Please use expiring Aegis Vault or internal Drive links for confidential records.`,
          source: { app: 'security', label: 'Bastion DLP Radar', to: '/security/dlp' },
        });
      }
    } catch {
      // Fallback
    }
    toast.success('Sent Nova DLP coaching nudge via Mail');
  };

  const handleAddIoc = (e: FormEvent) => {
    e.preventDefault();
    if (!newIoc.trim()) return;
    blockIoc(newIoc);
    setNewIoc('');
  };

  return (
    <div className="sec-view">
      <NeoKpis>
        <NeoKpi
          label="DLP Interceptions (24h)"
          value={dlp.length}
          sub="Mail, Drive & GenAI egress policies"
          icon={<FileWarning />}
          tone="warning"
        />
        <NeoKpi
          label="Phish Drill Report Rate"
          value={
            <>
              <CountUp value={campStats.reportRate} />
              <span>%</span>
            </>
          }
          sub={`${campStats.totalSent} employees tested in ${activeCampaign.id}`}
          icon={<Target />}
          tone="emerald"
        />
        <NeoKpi
          label="Sinkholed IOCs"
          value={blocklist.length}
          sub="Edge DNS & Mail gateway blocklist"
          icon={<Ban />}
          tone="danger"
        />
        <NeoKpi
          label="Sovereign Data Vaults"
          value={`${DATASETS.length} Regions`}
          sub="UAE · EU · SG residency verified"
          icon={<Database />}
          tone="cyan"
        />
      </NeoKpis>

      {/* DLP Event Stream from Mail, Drive, and GenAI */}
      <NeoPanel
        hud="Mail · Helix Drive · GenAI Prompt Guard"
        title="Data Loss Prevention (DLP) Interceptions"
        icon={<Radar />}
      >
        <div className="sec-check-list">
          {dlp.map((d) => {
            const actor = users.find((u) => u.id === d.userId);
            return (
              <div key={d.id} className="sec-check-row">
                <div className="sec-check-row__main">
                  <div className="sec-check-row__top">
                    <span className="neo-mono">{d.id}</span>
                    <Chip tone="pink" size="sm">
                      <span>{d.channel.toUpperCase()}</span>
                    </Chip>
                    <Chip tone={d.label === 'restricted' ? 'danger' : 'warning'} size="sm">
                      <span>{d.label.toUpperCase()}</span>
                    </Chip>
                    <Chip
                      tone={d.action === 'blocked' || d.action === 'revoked' ? 'emerald' : 'orange'}
                      size="sm"
                    >
                      <span>{d.action.toUpperCase()}</span>
                    </Chip>
                    <span className="neo-mono">{d.policy}</span>
                    <span className="sec-case-row__time">{relTime(d.at)}</span>
                  </div>
                  <div className="sec-check-row__title">
                    <span>{actor?.name ?? d.userId}</span>
                    <span> · </span>
                    <span className="neo-mono">{d.object}</span>
                  </div>
                  <div className="sec-check-row__rem">
                    <span>Destination: </span>
                    <span>{d.destination}</span>
                  </div>
                </div>

                <div className="sec-check-row__actions">
                  {d.action !== 'revoked' && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--danger neo-btn--xs"
                      onClick={() => updateDlpAction(d.id, 'revoked')}
                      data-qa={`sec-dlp-revoke-${d.id}`}
                    >
                      <Ban size={12} />
                      <span>Revoke & Quarantine</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => handleCoachUser(d.id, d.userId, d.object)}
                  >
                    <Send size={12} />
                    <span>{d.coached ? 'Coached' : 'Coach via Mail'}</span>
                  </button>
                  {d.to && (
                    <Link to={d.to} className="neo-btn neo-btn--ghost neo-btn--xs">
                      <span>Source App</span>
                      <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>

      {/* Phishing Simulations + Interactive Spot-the-Phish Drill */}
      <div className="sec-two-col">
        <NeoPanel
          hud="Workforce Phishing Resilience"
          title="Phishing Simulation Campaigns"
          icon={<MailWarning />}
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--xs"
              onClick={() =>
                launchCampaignDrill(
                  'Executive Voice-Clone Wire Drill',
                  'Urgent CFO callback & invoice signature request',
                  3,
                )
              }
              data-qa="sec-launch-drill"
            >
              <Target size={13} />
              <span>Launch New Drill</span>
            </button>
          }
        >
          <div className="sec-stack">
            <div className="sec-camp-summary">
              <div>
                <div className="neo-hud">{activeCampaign.id} · Active Simulation</div>
                <h3>{activeCampaign.name}</h3>
                <p>{activeCampaign.lure}</p>
              </div>
              <Chip tone="emerald" size="sm">
                <span>Resilience {campStats.resilienceScore}/100</span>
              </Chip>
            </div>

            <div className="sec-dept-list">
              {activeCampaign.results.map((r) => {
                const repPct = Math.round((r.reported / Math.max(1, r.sent)) * 100);
                const clkPct = Math.round((r.clicked / Math.max(1, r.sent)) * 100);
                return (
                  <div key={r.department} className="sec-dept-row">
                    <div className="sec-dept-row__head">
                      <strong>{r.department}</strong>
                      <span className="neo-mono">
                        <span>{repPct}% reported</span>
                        <span> · </span>
                        <span>{clkPct}% clicked</span>
                      </span>
                    </div>
                    <Bar
                      value={repPct / 100}
                      fill={repPct >= 85 ? 'var(--success)' : 'var(--app-c1)'}
                      label={`${r.department} report rate ${repPct}%`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </NeoPanel>

        {/* Spot-the-Phish Interactive Inspector */}
        <NeoPanel
          hud="Interactive Awareness Lab (+25 XP)"
          title="Spot-the-Phish Live Inspector"
          icon={<Eye />}
          actions={
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={nextEmail}>
              <span>Next Sample</span>
            </button>
          }
        >
          <div className="sec-phish-game">
            <p className="sec-phish-game__hint">
              Click any suspicious zones below, then render your verdict:
            </p>
            <div className="sec-email-card">
              <button
                type="button"
                className={`sec-email-zone ${selectedZones.includes('sender') ? 'is-flagged' : ''}`}
                onClick={() => toggleZone('sender')}
              >
                <span className="neo-hud">From:</span>
                <strong>{currentEmail.fromName}</strong>
                <span className="neo-mono">&lt;{currentEmail.fromAddr}&gt;</span>
              </button>

              <button
                type="button"
                className={`sec-email-zone ${selectedZones.includes('subject') ? 'is-flagged' : ''}`}
                onClick={() => toggleZone('subject')}
              >
                <span className="neo-hud">Subject:</span>
                <strong>{currentEmail.subject}</strong>
              </button>

              <div className="sec-email-body">
                <p>{currentEmail.greeting.replace('{first}', firstName(me?.name ?? 'Layla'))}</p>
                <p>{currentEmail.body}</p>
                {currentEmail.urge && (
                  <button
                    type="button"
                    className={`sec-email-zone sec-email-zone--warn ${selectedZones.includes('urge') ? 'is-flagged' : ''}`}
                    onClick={() => toggleZone('urge')}
                  >
                    <ShieldAlert size={13} />
                    <span>{currentEmail.urge}</span>
                  </button>
                )}
                {currentEmail.link && (
                  <button
                    type="button"
                    className={`sec-email-zone sec-email-zone--link ${selectedZones.includes('link') ? 'is-flagged' : ''}`}
                    onClick={() => toggleZone('link')}
                  >
                    <span>{currentEmail.link.text}</span>
                    <span className="neo-mono">{currentEmail.link.href}</span>
                  </button>
                )}
                {currentEmail.attachment && (
                  <button
                    type="button"
                    className={`sec-email-zone ${selectedZones.includes('attachment') ? 'is-flagged' : ''}`}
                    onClick={() => toggleZone('attachment')}
                  >
                    <span className="neo-mono">📎 {currentEmail.attachment}</span>
                  </button>
                )}
                <div className="sec-email-sig">{currentEmail.signature}</div>
              </div>
            </div>

            {gameResult ? (
              <div className="sec-game-feedback" aria-live="polite">
                <div className="sec-game-feedback__title">
                  <Sparkles size={15} />
                  <span>{gameResult.message}</span>
                </div>
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={nextEmail}>
                  <span>Inspect Next Message</span>
                </button>
              </div>
            ) : (
              <div className="sec-row-actions">
                <button
                  type="button"
                  className="neo-btn neo-btn--danger neo-btn--sm"
                  onClick={() => submitVerdict(true)}
                  data-qa="sec-verdict-phish"
                >
                  <ShieldAlert size={14} />
                  <span>Report as Phishing</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--success neo-btn--sm"
                  onClick={() => submitVerdict(false)}
                >
                  <CheckCircle2 size={14} />
                  <span>Mark Legitimate</span>
                </button>
              </div>
            )}
          </div>
        </NeoPanel>
      </div>

      {/* Sovereign Residency & Gateway IOC Blocklist */}
      <div className="sec-two-col">
        <NeoPanel
          hud="GDPR · UAE IA · SG PDPA"
          title="Sovereign Data Residency & Retention"
          icon={<Database />}
        >
          <div className="sec-stack">
            {DATASETS.map((ds) => (
              <div key={ds.id} className="sec-ev-row">
                <div className="grow">
                  <div className="sec-ev-row__top">
                    <span className="neo-mono">{ds.id}</span>
                    <strong>{ds.name}</strong>
                  </div>
                  <div className="sec-ev-row__meta">
                    <span>{ds.regime}</span>
                    <span> · </span>
                    <span>{ds.records.toLocaleString()} records</span>
                  </div>
                </div>
                <Chip tone="emerald" size="sm">
                  <span>Pinned: {ds.region}</span>
                </Chip>
              </div>
            ))}
            {RETENTION_POLICIES.map((ret) => (
              <div key={ret.id} className="sec-ev-row">
                <div className="grow">
                  <div className="sec-ev-row__top">
                    <span className="neo-mono">{ret.duration}</span>
                    <strong>{ret.scope}</strong>
                  </div>
                  <div className="sec-ev-row__meta">
                    <span>{ret.basis}</span>
                    <span> · </span>
                    <span>Legal holds: {ret.legalHolds}</span>
                  </div>
                </div>
                <Chip tone="cyan" size="sm">
                  <span>Purge in {ret.nextPurgeDays}d</span>
                </Chip>
              </div>
            ))}
          </div>
        </NeoPanel>

        <NeoPanel
          hud="Gateway Sinkhole"
          title="Blocked Domains, IPs & IOCs"
          icon={<Ban />}
        >
          <form className="sec-note-form" onSubmit={handleAddIoc}>
            <input
              className="neo-input"
              value={newIoc}
              onChange={(e) => setNewIoc(e.target.value)}
              placeholder="Add malicious domain, IP, or SHA-256 to sinkhole…"
            />
            <button type="submit" className="neo-btn neo-btn--danger neo-btn--sm">
              <Ban size={14} />
              <span>Block IOC</span>
            </button>
          </form>
          <div className="sec-chip-wrap" style={{ marginTop: 12 }}>
            {blocklist.map((b) => (
              <Chip key={b} tone="danger" size="sm">
                <span className="neo-mono">{b}</span>
              </Chip>
            ))}
          </div>
        </NeoPanel>
      </div>
    </div>
  );
}
