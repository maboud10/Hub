/**
 * Declare Incident Modal — pages on-call rotations, opens a War Room, and optionally freezes deploys.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Flame, Globe, Lock, Radio, Server, Siren, Sparkles, X } from 'lucide-react';
import { Chip, PeoplePicker } from '@/components/neo';
import { useSessionUser } from '@/store/selectors';
import { REGIONS, SERVICES, SEVERITIES, SEV_META } from '@/incidents/meta';
import { pageTargets } from '@/incidents/oncall';
import { useIncidents } from '@/incidents/store';
import type { Region, Severity } from '@/incidents/types';
import { UserPill, triggerDeployFreeze } from './parts';

export interface DeclareModalProps {
  open: boolean;
  onClose: () => void;
  preset?: { title?: string; severity?: Severity; service?: string };
}

export function DeclareModal({ open, onClose, preset }: DeclareModalProps) {
  const me = useSessionUser();
  const navigate = useNavigate();
  const rotations = useIncidents((s) => s.rotations);
  const overrides = useIncidents((s) => s.overrides);
  const declareIncident = useIncidents((s) => s.declareIncident);

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('SEV2');
  const [services, setServices] = useState<string[]>(['payments-svc']);
  const [regions, setRegions] = useState<Region[]>(['eu-west-2']);
  const [commanderId, setCommanderId] = useState<string>('u-omar');
  const [summary, setSummary] = useState('');
  const [autoFreeze, setAutoFreeze] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTitle(preset?.title ?? '');
    const sev = preset?.severity ?? 'SEV2';
    setSeverity(sev);
    setServices(preset?.service ? [preset.service] : ['payments-svc']);
    setRegions(['eu-west-2']);
    setCommanderId(me?.id ?? 'u-omar');
    setSummary('');
    setAutoFreeze(sev === 'SEV1' || sev === 'SEV2');
  }, [open, preset, me?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const targets = useMemo(
    () => pageTargets(services, severity, rotations, overrides, Date.now()),
    [services, severity, rotations, overrides],
  );

  const impactedApps = useMemo(
    () => Array.from(new Set(services.flatMap((id) => SERVICES.find((s) => s.id === id)?.apps ?? []))),
    [services],
  );

  if (!open) return null;

  const toggleService = (id: string) => {
    setServices((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  };

  const toggleRegion = (id: Region) => {
    setRegions((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = title.trim() || `Elevated latency on ${services[0] ?? 'hub-web'} in ${regions[0] ?? 'eu-west-2'}`;
    const inc = declareIncident(
      {
        title: clean,
        severity,
        services,
        regions,
        impactedApps,
        commanderId,
        summary: summary.trim() || undefined,
      },
      me?.id ?? 'u-lucas',
    );
    if (autoFreeze) {
      await triggerDeployFreeze(inc, true, me?.id ?? 'u-omar');
    }
    onClose();
    navigate(`/incidents/war-room?id=${inc.id}`);
  };

  return (
    <div className="inc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Declare an incident" onClick={onClose}>
      <div className="inc-modal neo-panel" onClick={(e) => e.stopPropagation()}>
        <header className="inc-modal__head">
          <div className="inc-modal__title-wrap">
            <span className="inc-modal__glyph">
              <Siren />
            </span>
            <div>
              <div className="neo-hud">Sentinel incident declaration</div>
              <h2 className="neo-panel__title">Declare an incident</h2>
            </div>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close modal">
            <X />
          </button>
        </header>

        <form className="inc-modal__body" onSubmit={onSubmit}>
          <label className="inc-field">
            <span className="inc-field__label">Incident title</span>
            <input
              type="text"
              className="neo-input"
              placeholder="e.g. Elevated checkout latency in eu-west-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              data-qa="inc-declare-title"
            />
          </label>

          <div className="inc-field">
            <span className="inc-field__label">Severity level</span>
            <div className="inc-sev-grid" role="radiogroup" aria-label="Severity level">
              {SEVERITIES.map((sev) => {
                const m = SEV_META[sev];
                const active = severity === sev;
                return (
                  <button
                    key={sev}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className="inc-sev-card"
                    data-active={active || undefined}
                    data-tone={m.tone}
                    onClick={() => {
                      setSeverity(sev);
                      setAutoFreeze(sev === 'SEV1' || sev === 'SEV2');
                    }}
                  >
                    <div className="inc-sev-card__top">
                      <Flame />
                      <b>{sev}</b>
                      <span>{m.label}</span>
                    </div>
                    <p className="inc-sev-card__guide">{m.guide}</p>
                    <div className="inc-sev-card__policy">{m.response}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="inc-field-row">
            <div className="inc-field">
              <span className="inc-field__label">
                <Server />
                <span>Affected services</span>
              </span>
              <div className="inc-chip-cloud">
                {SERVICES.map((svc) => (
                  <Chip
                    key={svc.id}
                    tone={services.includes(svc.id) ? 'orange' : 'slate'}
                    size="sm"
                    pressed={services.includes(svc.id)}
                    onClick={() => toggleService(svc.id)}
                  >
                    <span>{svc.label}</span>
                  </Chip>
                ))}
              </div>
            </div>

            <div className="inc-field">
              <span className="inc-field__label">
                <Globe />
                <span>Impacted regions</span>
              </span>
              <div className="inc-chip-cloud">
                {REGIONS.map((reg) => (
                  <Chip
                    key={reg.id}
                    tone={regions.includes(reg.id) ? 'danger' : 'slate'}
                    size="sm"
                    pressed={regions.includes(reg.id)}
                    onClick={() => toggleRegion(reg.id)}
                  >
                    <span>{reg.city}</span>
                    <span>·</span>
                    <span>{reg.id}</span>
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="inc-field-row">
            <div className="inc-field">
              <span className="inc-field__label">Incident commander</span>
              <PeoplePicker
                value={commanderId ? [commanderId] : []}
                onChange={(ids) => setCommanderId(ids[0] ?? 'u-omar')}
                label="Choose incident commander"
                trigger={(props) => (
                  <button {...props} type="button" className="neo-btn neo-btn--soft">
                    <UserPill userId={commanderId} />
                  </button>
                )}
              />
            </div>

            <div className="inc-field">
              <span className="inc-field__label">Production deploy gate</span>
              <label className="inc-toggle-row">
                <input
                  type="checkbox"
                  checked={autoFreeze}
                  onChange={(e) => setAutoFreeze(e.target.checked)}
                />
                <Lock />
                <span>Freeze production deploys in DevHub</span>
              </label>
            </div>
          </div>

          <label className="inc-field">
            <span className="inc-field__label">Initial scope & customer impact</span>
            <textarea
              className="neo-input"
              rows={2}
              placeholder="Symptoms, error rate, suspect deploy version, or customer blast radius…"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>

          <div className="inc-declare-preview">
            <div className="inc-declare-preview__col">
              <span className="neo-hud">
                <Radio />
                <span>Immediate pager targets</span>
              </span>
              <div className="inc-declare-preview__pills">
                {targets.length > 0 ? (
                  targets.map((t) => <UserPill key={t.userId} userId={t.userId} />)
                ) : (
                  <span className="inc-muted">No immediate page for SEV4</span>
                )}
              </div>
            </div>
            <div className="inc-declare-preview__col">
              <span className="neo-hud">
                <Sparkles />
                <span>Launchpad status sync</span>
              </span>
              <div className="inc-declare-preview__pills">
                {impactedApps.length > 0 ? (
                  impactedApps.map((appId) => (
                    <Chip key={appId} tone="warning" size="sm">
                      <span>{appId}</span>
                    </Chip>
                  ))
                ) : (
                  <span className="inc-muted">Core infrastructure only</span>
                )}
              </div>
            </div>
          </div>

          <footer className="inc-modal__foot">
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              <span>Cancel</span>
            </button>
            <button type="submit" className="neo-btn neo-btn--danger" data-qa="inc-declare-submit">
              <Siren />
              <span>Declare & page on-call</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
