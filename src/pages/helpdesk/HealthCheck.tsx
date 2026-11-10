/**
 * Device Health Check (`?diag=1`): radar-sweep scan of the primary device →
 * health score + per-check one-click fixes that genuinely change the device.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, ScanSearch, Stethoscope, TicketPlus, Wrench } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { CountUp, NeoEmpty } from '@/components/neo';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import { deviceHealth, healthBand, healthChecks, healthColor, HEALTH_BAND_LABEL, primaryDevice, type HealthCheck } from '@/helpdesk/fleet';
import { DeviceGlyph } from './glyphs';
import { useOpenTicket, useViewer } from './ui';

const reduced = () => document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function HealthCheckModal({ open, onClose, deviceTag }: { open: boolean; onClose: () => void; deviceTag?: string }) {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const openTicket = useOpenTicket();
  const now = useNow(5000);
  const me = viewer?.user.id ?? '';
  const device = useMemo(() => (deviceTag ? devices.find((d) => d.assetTag === deviceTag && (d.assigneeId === me || viewer?.it)) : primaryDevice(devices, me)), [devices, deviceTag, me, viewer?.it]);
  const checks = useMemo(() => (device ? healthChecks(device, now) : []), [device, now]);
  const score = device ? deviceHealth(device, now) : 0;
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<'scan' | 'done'>('scan');
  const [busy, setBusy] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const tag = device?.assetTag;

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (!open || !tag) return;
    setPhase('scan');
    setRevealed(0);
    const n = healthChecks(useHelpdesk.getState().devices.find((d) => d.assetTag === tag)!, Date.now()).length;
    const beat = reduced() ? 40 : 330;
    for (let i = 1; i <= n; i++) timers.current.push(window.setTimeout(() => setRevealed(i), 300 + beat * i));
    timers.current.push(
      window.setTimeout(() => {
        setPhase('done');
        useHelpdesk.getState().markDiagRun(tag);
      }, 500 + beat * (n + 1)),
    );
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, [open, tag]);

  const fix = (c: HealthCheck) =>
    new Promise<void>((resolve) => {
      if (!device) return resolve();
      if (c.fix?.kind === 'ticket') {
        onClose();
        openTicket({ category: 'hardware', device: device.assetTag, subject: `${c.label}: ${device.model} needs service`, description: `${c.detail}. Found by the device health check.`, urgency: 'normal' });
        return resolve();
      }
      setBusy(c.id);
      window.setTimeout(
        () => {
          const r = useHelpdesk.getState().applyHealthFix(device.assetTag, c.id);
          setBusy(null);
          if (!r.ok) toast.error(r.error);
          resolve();
        },
        reduced() ? 80 : 750,
      );
    });

  const autoFixable = checks.filter((c) => c.status !== 'pass' && c.fix?.kind === 'auto');
  const fixAll = async () => {
    for (const c of autoFixable) await fix(c);
    toast.success('All fixable issues resolved', `${device?.model} is now at health ${deviceHealth(useHelpdesk.getState().devices.find((d) => d.assetTag === tag)!, Date.now())}`);
  };

  const issues = checks.filter((c) => c.status !== 'pass').length;
  const n = checks.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={880}
      className="neo-portal hd-diagmodal"
      icon={
        <span className="hd-fixmodal__icon">
          <Stethoscope />
        </span>
      }
      title="Device health check"
      subtitle={device ? `${device.model} · ${device.assetTag}` : 'No managed device found'}
      footer={
        device ? (
          <>
            <span className="grow neo-faint text-sm">{phase === 'scan' ? 'Scanning security posture and telemetry…' : issues ? `${issues} ${issues === 1 ? 'issue' : 'issues'} found` : 'Everything looks great'}</span>
            <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
              Close
            </button>
            {phase === 'done' && autoFixable.length > 0 && (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={fixAll} disabled={!!busy} data-qa="diag-fixall">
                <Wrench /> Fix {autoFixable.length === 1 ? 'it' : `all ${autoFixable.length}`}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {!device ? (
        <NeoEmpty icon={<ScanSearch />} title="No managed device to scan" compact>
          Health checks run on MDM-enrolled laptops, desktops, phones and tablets.
        </NeoEmpty>
      ) : (
        <div className="hd-scan" data-phase={phase}>
          <div className="hd-scan__radar" style={{ ['--hc' as string]: phase === 'done' ? healthColor(score) : 'var(--app-c1)' }}>
            <svg viewBox="-120 -120 240 240" aria-hidden="true">
              <circle r="112" className="hd-scan__ring" />
              <circle r="80" className="hd-scan__ring" />
              <circle r="48" className="hd-scan__ring" />
              <path d="M-112 0H112M0 -112V112" className="hd-scan__cross" />
              {checks.map((c, i) => {
                const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                const x = Math.cos(a) * 96;
                const y = Math.sin(a) * 96;
                const st = i < revealed ? c.status : 'pending';
                return (
                  <g key={c.id} className="hd-scan__node" data-status={st} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                    <circle r="9" className="hd-scan__halo" />
                    <circle r="4.5" />
                  </g>
                );
              })}
            </svg>
            <div className="hd-scan__sweep" aria-hidden="true" />
            <div className="hd-scan__device" aria-hidden="true">
              <DeviceGlyph kind={device.kind} size={86} />
            </div>
            <div className="hd-scan__score">
              {phase === 'scan' ? (
                <>
                  <span className="neo-hud">Scanning</span>
                  <b className="neo-num">
                    {revealed}/{n}
                  </b>
                </>
              ) : (
                <>
                  <b className="neo-num" style={{ color: healthColor(score) }}>
                    <CountUp value={score} />
                  </b>
                  <span className="neo-hud">{HEALTH_BAND_LABEL[healthBand(score)]}</span>
                </>
              )}
            </div>
          </div>

          <ul className="hd-scan__list" aria-live="polite">
            {checks.map((c, i) => {
              const st = i < revealed ? c.status : 'pending';
              return (
                <li key={c.id} data-status={st} className="hd-scan__row">
                  <span className="hd-scan__dot" aria-hidden="true" />
                  <div className="hd-scan__txt">
                    <b>{c.label}</b>
                    <span>{st === 'pending' ? 'Waiting…' : c.detail}</span>
                  </div>
                  {phase === 'done' && c.status === 'pass' && <Check className="hd-scan__ok" aria-label="Passed" />}
                  {phase === 'done' && c.status !== 'pass' && c.fix && (
                    <button type="button" className={c.fix.kind === 'ticket' ? 'neo-btn neo-btn--xs neo-btn--ghost' : 'neo-btn neo-btn--xs neo-btn--soft'} onClick={() => fix(c)} disabled={!!busy} data-qa={`diag-fix-${c.id}`}>
                      {busy === c.id ? <Loader2 className="hd-spin" /> : c.fix.kind === 'ticket' ? <TicketPlus /> : <Wrench />}
                      {busy === c.id ? 'Fixing' : c.fix.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
