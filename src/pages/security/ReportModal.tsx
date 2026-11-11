/**
 * Security Center ("Bastion") — Report Something Suspicious modal (?report=1)
 * with live Nova Phishing/Signal Analyzer and 5-stage Suspicious Report NeoTracker.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  MailWarning,
  ShieldAlert,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { Chip, NeoTracker, NovaChip } from '@/components/neo';
import { analyzeSuspiciousSignal, REPORT_TRACKER_STAGES, reportTrackerStep } from '@/security/engine';
import { useSecurity } from '@/security/store';
import type { ReportKind, SecCase } from '@/security/types';
import { SeverityBadge, useMySecurity } from './parts';

const REPORT_KINDS: { id: ReportKind; label: string; sub: string }[] = [
  { id: 'phishing', label: 'Phishing Email / Link', sub: 'Lookalike domain, OAuth lure, urgent wire' },
  { id: 'suspicious_login', label: 'Suspicious Login / MFA Push', sub: 'Unexpected prompt or unfamiliar location' },
  { id: 'lost_device', label: 'Lost or Stolen Device', sub: 'Trigger immediate MDM lock & token revoke' },
  { id: 'data_leak', label: 'Accidental Data Exposure', sub: 'External share link, leaked token or PII' },
  { id: 'other', label: 'Other Security Concern', sub: 'Tailgating, rogue USB, physical or policy issue' },
];

export function ReportModal({
  open,
  presetKind,
  onClose,
}: {
  open: boolean;
  presetKind?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { meId } = useMySecurity();
  const submitReport = useSecurity((s) => s.submitReport);

  const [kind, setKind] = useState<ReportKind>('phishing');
  const [title, setTitle] = useState('Urgent DocuSign OAuth consent request from docusign-verify-helix.com');
  const [channel, setChannel] = useState('Nova Inbox');
  const [detail, setDetail] = useState(
    'Received an email claiming Q4 equity vesting expires in 2 hours unless I grant OAuth mail.readwrite at https://docusign-verify-helix.com/oauth.',
  );
  const [createdCase, setCreatedCase] = useState<SecCase | null>(null);

  useEffect(() => {
    if (open) {
      setCreatedCase(null);
      if (presetKind && ['phishing', 'suspicious_login', 'lost_device', 'data_leak', 'other'].includes(presetKind)) {
        setKind(presetKind as ReportKind);
      }
    }
  }, [open, presetKind]);

  if (!open) return null;

  const analysis = analyzeSuspiciousSignal({ title, detail, kind });

  const applyPreset = (type: 'phish' | 'login' | 'device') => {
    if (type === 'phish') {
      setKind('phishing');
      setChannel('Nova Inbox');
      setTitle('Urgent DocuSign OAuth consent request from docusign-verify-helix.com');
      setDetail('Asks to authorise mail.readwrite OAuth permissions at https://docusign-verify-helix.com/oauth within 2 hours.');
    } else if (type === 'login') {
      setKind('suspicious_login');
      setChannel('Okta FastPass');
      setTitle('Repeated unsolicited MFA push notifications at 02:15 GST');
      setDetail('Received 4 MFA push challenges from unfamiliar Frankfurt ASN-49981 IP while not signing in.');
    } else {
      setKind('lost_device');
      setChannel('Physical / Airport Lounge');
      setTitle('Managed iPhone 16 Pro left at DXB Terminal 3 lounge');
      setDetail('Requesting immediate remote MDM lock and corporate SSO token revocation.');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const res = submitReport({
      reporterId: meId,
      kind,
      title,
      detail,
      channel,
    });
    setCreatedCase(res.secCase);
  };

  return (
    <div className="sec-modal-backdrop" role="dialog" aria-modal="true" aria-label="Report Something Suspicious">
      <div className="sec-modal">
        <header className="sec-modal__head">
          <div className="sec-modal__titles">
            <div className="neo-hud">Bastion · 1-Tap Threat Intake</div>
            <h2 className="sec-modal__title">
              <ShieldAlert size={18} />
              <span>Report Something Suspicious</span>
              <NovaChip>+25 Shield XP</NovaChip>
            </h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close report dialog">
            <X size={16} />
          </button>
        </header>

        {createdCase ? (
          <div className="sec-modal__body">
            <div className="sec-report-success" role="status" aria-live="polite">
              <div className="sec-report-success__head">
                <CheckCircle2 size={22} />
                <div>
                  <div className="neo-hud">Signal Logged & Auto-Enriched</div>
                  <h3>
                    <span>{createdCase.id}</span>
                    <span> · </span>
                    <span>{createdCase.title}</span>
                  </h3>
                </div>
                <SeverityBadge severity={createdCase.severity} />
              </div>

              <NeoTracker
                bare
                hud="Suspicious Report Tracker"
                title="Live SOC Triage & Containment Journey"
                steps={REPORT_TRACKER_STAGES}
                current={reportTrackerStep(createdCase)}
                eta="SLA < 15m"
                message="Nova extracted IOCs and routed your report to Ethan Brooks in the SOC queue."
              />

              <div className="sec-modal__footer">
                <button type="button" className="neo-btn neo-btn--soft" onClick={onClose}>
                  <span>Done</span>
                </button>
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma"
                  onClick={() => {
                    const id = createdCase.id;
                    onClose();
                    navigate(`/security/threats?case=${id}`);
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Open in Threat Queue</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form className="sec-modal__body" onSubmit={handleSubmit}>
            <div className="sec-preset-row">
              <span className="neo-hud">Quick Fill Presets</span>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => applyPreset('phish')}>
                <MailWarning size={13} />
                <span>OAuth Phish Lure</span>
              </button>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => applyPreset('login')}>
                <KeyRound size={13} />
                <span>MFA Fatigue Push</span>
              </button>
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => applyPreset('device')}>
                <Smartphone size={13} />
                <span>Lost Managed Device</span>
              </button>
            </div>

            <div className="sec-kind-grid" role="radiogroup" aria-label="Signal category">
              {REPORT_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  className={`sec-kind-card ${kind === k.id ? 'is-selected' : ''}`}
                  onClick={() => setKind(k.id)}
                >
                  <div className="sec-kind-card__title">{k.label}</div>
                  <div className="sec-kind-card__sub">{k.sub}</div>
                </button>
              ))}
            </div>

            <div className="sec-form-grid">
              <label className="sec-field">
                <span className="neo-hud">Signal Summary / Subject</span>
                <input
                  className="neo-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Describe what looked suspicious…"
                  required
                />
              </label>

              <label className="sec-field">
                <span className="neo-hud">Where did you spot it?</span>
                <select className="neo-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="Nova Inbox">Nova Inbox</option>
                  <option value="Pulse Chat">Pulse Chat</option>
                  <option value="Helix Drive">Helix Drive</option>
                  <option value="Okta FastPass">Okta FastPass</option>
                  <option value="SMS / WhatsApp">SMS / WhatsApp</option>
                  <option value="Physical / Endpoint">Physical / Endpoint</option>
                </select>
              </label>
            </div>

            <label className="sec-field">
              <span className="neo-hud">Indicators, Sender, URL or Context</span>
              <textarea
                className="neo-input"
                rows={3}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Paste sender address, suspicious link, or what happened…"
              />
            </label>

            <div className="sec-analyzer-box" aria-live="polite">
              <div className="sec-analyzer-box__head">
                <span className="neo-hud">
                  <Sparkles size={12} />
                  <span>Nova Live Signal Pre-Scan</span>
                </span>
                <div className="sec-analyzer-box__badges">
                  <SeverityBadge severity={analysis.severity} />
                  <Chip tone={analysis.verdict === 'malicious' ? 'danger' : 'warning'} size="sm">
                    <span>Risk</span>
                    <span> </span>
                    <span>{analysis.riskScore}%</span>
                  </Chip>
                  {analysis.mitre.map((m) => (
                    <Chip key={m} tone="pink" size="sm">
                      <span>{m}</span>
                    </Chip>
                  ))}
                </div>
              </div>
              <ul className="sec-analyzer-box__reasons">
                {analysis.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="sec-modal__footer">
              <button type="button" className="neo-btn neo-btn--soft" onClick={onClose}>
                <span>Cancel</span>
              </button>
              <button type="submit" className="neo-btn neo-btn--plasma" data-qa="sec-submit-report">
                <AlertTriangle size={15} />
                <span>Submit to SOC & Track</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
