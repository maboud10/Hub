/**
 * Device building blocks shared by My devices, Device detail and the Fleet:
 * pointer-tracking 3D hologram cards, compliance pills, warranty bar,
 * telemetry sparklines, the security posture checklist and custody timeline.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BatteryMedium, Check, CircleAlert, Cpu, HardDrive, Loader2, TriangleAlert, Wrench } from 'lucide-react';
import { Spark } from '@/components/neo';
import { formatDate, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { CustodyKind, Device } from '@/helpdesk/types';
import { compliancePills, deviceHealth, healthChecks, last, warrantyInfo, type HealthCheck } from '@/helpdesk/fleet';
import { DEVICE_STATUS_COLOR, DEVICE_STATUS_LABEL, KIND_LABEL } from '@/helpdesk/meta';
import { DeviceGlyph } from './glyphs';
import { HealthRing } from './ui';

const reducedMotion = () =>
  typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Pointer-follow tilt: writes --rx/--ry (deg) and --mx/--my (glare %) on the element. */
export function useTilt(max = 9) {
  const ref = useRef<HTMLElement | null>(null);
  const raf = useRef(0);
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch' || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * max * 1.25).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
  };
  const onPointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return { ref, onPointerMove, onPointerLeave };
}

/** Status → hologram colour (healthy devices use the app plasma). */
export function holoColor(d: Device): string | undefined {
  return d.status === 'in_use' ? undefined : DEVICE_STATUS_COLOR[d.status];
}

export function CompliancePills({ d, now }: { d: Device; now: number }) {
  const pills = compliancePills(d, now);
  if (!pills.length) return null;
  return (
    <div className="hd-cpills" aria-label="Compliance">
      {pills.map((p) => (
        <span key={p.id} className="hd-cpill" data-ok={p.ok || undefined}>
          {p.ok ? <Check /> : <CircleAlert />}
          {p.label}
        </span>
      ))}
    </div>
  );
}

export function WarrantyBar({ d, now, compact }: { d: Device; now: number; compact?: boolean }) {
  const w = warrantyInfo(d, now);
  const label = w.state === 'expired' ? 'Out of warranty' : w.daysLeft > 60 ? `${Math.round(w.daysLeft / 30.4)} months left` : `${w.daysLeft} days left`;
  return (
    <div className={cx('hd-warranty', compact && 'hd-warranty--compact')} data-state={w.state}>
      <div className="hd-warranty__top">
        <span className="neo-hud">Warranty</span>
        <span className="hd-warranty__v">{label}</span>
      </div>
      <div className="hd-warranty__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w.pct * 100)} aria-label="Warranty remaining">
        <i style={{ width: `${Math.max(2, w.pct * 100)}%` }} />
      </div>
      {!compact && <div className="hd-warranty__end">Ends {formatDate(d.warrantyEnd)}</div>}
    </div>
  );
}

/** Pointer-tilting hologram card for a device (links to its detail page). */
export function HoloCard({ d, now, to, i = 0, footer }: { d: Device; now: number; to: string; i?: number; footer?: ReactNode }) {
  const tilt = useTilt();
  const health = deviceHealth(d, now);
  const color = holoColor(d);
  return (
    <Link
      to={to}
      ref={(el) => {
        tilt.ref.current = el;
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className="hd-holo"
      data-status={d.status}
      style={{ ['--i' as string]: i, ['--holo' as string]: color ?? 'var(--app-c1)' }}
      data-qa={`holo-${d.assetTag}`}
      aria-label={`${d.model}, ${d.assetTag}, health ${health}`}
    >
      <span className="hd-holo__plane">
        <span className="hd-holo__glare" aria-hidden="true" />
        <span className="hd-holo__top">
          <span className="neo-hud hd-holo__tag">{d.assetTag}</span>
          {d.status !== 'in_use' && (
            <span className="hd-devstate" data-status={d.status}>
              {d.status === 'loaner' && d.loan ? `Loaner · due ${relativeTime(d.loan.dueAt, now)}` : DEVICE_STATUS_LABEL[d.status]}
            </span>
          )}
        </span>
        <span className="hd-holo__stage" aria-hidden="true">
          <span className="hd-holo__beam" />
          <span className="hd-holo__glyph">
            <DeviceGlyph kind={d.kind} size={150} color={color} />
          </span>
          <span className="hd-holo__base" />
        </span>
        <span className="hd-holo__info">
          <span className="hd-holo__titles">
            <span className="hd-holo__model">{d.model}</span>
            <span className="hd-holo__meta">
              {KIND_LABEL[d.kind]} · {d.os ?? d.manufacturer}
            </span>
          </span>
          <HealthRing score={health} size={46} />
        </span>
        <CompliancePills d={d} now={now} />
        <WarrantyBar d={d} now={now} compact />
        <span className="hd-holo__foot">
          {footer ?? (
            <>
              <span className="neo-mono">SN {d.serial}</span>
              <span>{d.lastCheckIn ? `checked in ${relativeTime(d.lastCheckIn, now)}` : d.firmwareCurrent === false ? 'firmware update ready' : 'peripheral'}</span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------------- telemetry */

export function TelemetryTiles({ d }: { d: Device }) {
  const t = d.telemetry;
  if (!t) return null;
  const tiles = [
    t.battery.length > 1 && { k: 'Battery health', icon: <BatteryMedium />, v: `${Math.round(last(t.battery))}%`, sub: t.batteryCycles !== undefined ? `${t.batteryCycles} cycles` : 'weekly', data: t.battery, color: last(t.battery) < 80 ? 'var(--hd-warn)' : undefined },
    { k: 'Storage used', icon: <HardDrive />, v: `${Math.round(last(t.storage))}%`, sub: `${Math.round(t.storageGb * (1 - last(t.storage) / 100))} GB free of ${t.storageGb >= 1000 ? `${t.storageGb / 1024} TB` : `${t.storageGb} GB`}`, data: t.storage, color: last(t.storage) >= 85 ? 'var(--hd-bad)' : undefined },
    { k: 'CPU temperature', icon: <Cpu />, v: `${Math.round(last(t.cpuTemp))}°C`, sub: `peak ${Math.round(Math.max(...t.cpuTemp))}°C · 24h`, data: t.cpuTemp, color: Math.max(...t.cpuTemp) > 88 ? 'var(--hd-warn)' : undefined },
  ].filter(Boolean) as { k: string; icon: ReactNode; v: string; sub: string; data: number[]; color?: string }[];
  return (
    <div className="hd-telemetry">
      {tiles.map((x) => (
        <div key={x.k} className="hd-tele">
          <div className="hd-tele__head">
            <span className="hd-tele__icon">{x.icon}</span>
            <span className="neo-hud">{x.k}</span>
          </div>
          <div className="hd-tele__v neo-num">{x.v}</div>
          <Spark data={x.data} width={220} height={40} color={x.color} className="hd-tele__spark" />
          <div className="hd-tele__sub">{x.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- posture */

const CHECK_ICON = { pass: Check, warn: TriangleAlert, fail: CircleAlert } as const;

export function PostureList({ d, now, canFix, onTicket }: { d: Device; now: number; canFix: boolean; onTicket: (c: HealthCheck) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const checks = healthChecks(d, now);
  const run = (c: HealthCheck) => {
    if (c.fix?.kind === 'ticket') return onTicket(c);
    setBusy(c.id);
    window.setTimeout(
      () => {
        const r = useHelpdesk.getState().applyHealthFix(d.assetTag, c.id);
        setBusy(null);
        if (r.ok) toast.success(`${c.label} fixed`, d.assetTag);
        else toast.error(r.error);
      },
      reducedMotion() ? 0 : 900,
    );
  };
  return (
    <ul className="hd-posture">
      {checks.map((c) => {
        const Icon = CHECK_ICON[c.status];
        return (
          <li key={c.id} className="hd-posture__row" data-status={c.status}>
            <span className="hd-posture__icon">
              <Icon />
            </span>
            <span className="hd-posture__text">
              <b>{c.label}</b>
              <span>{c.detail}</span>
            </span>
            {c.fix && canFix && (
              <button type="button" className={cx('neo-btn neo-btn--xs', c.status === 'fail' ? 'neo-btn--plasma' : 'neo-btn--soft')} onClick={() => run(c)} disabled={busy === c.id} data-qa={`fix-check-${c.id}`}>
                {busy === c.id ? <Loader2 className="hd-spin" /> : <Wrench />} {busy === c.id ? 'Fixing…' : c.fix.label}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- custody */

const CUSTODY_LABEL: Record<CustodyKind, string> = {
  purchased: 'Purchased',
  registered: 'Registered',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  loaned: 'Loaned',
  returned: 'Returned',
  repair: 'Sent to repair',
  repaired: 'Back from repair',
  retired: 'Retired',
  lost: 'Reported lost',
  found: 'Recovered',
  return_scheduled: 'Return scheduled',
  fulfilled: 'Fulfilled request',
};

export function CustodyTimeline({ d }: { d: Device }) {
  const users = useHub((s) => s.users);
  const name = (id?: string) => users.find((u) => u.id === id)?.name;
  const items = [...d.custody].sort((a, b) => b.at - a.at);
  return (
    <ol className="hd-custody">
      {items.map((c) => (
        <li key={c.id} className="hd-custody__item" data-kind={c.kind}>
          <span className="hd-custody__dot" aria-hidden="true" />
          <div className="hd-custody__body">
            <div className="hd-custody__top">
              <b>{CUSTODY_LABEL[c.kind]}</b>
              {c.userId && <span>{name(c.userId) ?? 'Former employee'}</span>}
              <time dateTime={new Date(c.at).toISOString()}>{formatDate(c.at)}</time>
            </div>
            {(c.note || (c.actorId && c.actorId !== c.userId)) && (
              <div className="hd-custody__note">
                {c.note}
                {c.actorId && c.actorId !== c.userId && (
                  <span className="neo-faint">
                    {c.note ? ' · ' : ''}by {name(c.actorId) ?? 'IT'}
                  </span>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
