/**
 * Fleet intelligence (pure): device health checks & score, compliance,
 * warranty, asset-tag generation, filters and the Fleet Radar layout.
 */
import type { Department, User } from '@/types';
import type { Device, DeviceKind, DeviceStatus, FleetFilter, Office } from './types';
import { DAY, HOUR, isManagedKind } from './meta';
import { clamp, hashString, rng } from './util';

/* ------------------------------------------------------------ Health checks */

export type CheckId = 'os' | 'encryption' | 'firewall' | 'mdm' | 'disk' | 'battery' | 'vpn' | 'sso' | 'firmware' | 'warranty';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheck {
  id: CheckId;
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
  /** `auto`: one-click remediation; `ticket`: needs IT (opens a prefilled ticket). */
  fix?: { label: string; kind: 'auto' | 'ticket' };
}

const WEIGHTS: Record<CheckId, number> = {
  encryption: 22,
  firewall: 12,
  os: 14,
  mdm: 14,
  disk: 12,
  battery: 10,
  vpn: 8,
  sso: 8,
  firmware: 20,
  warranty: 15,
};

export const CHECK_LABEL: Record<CheckId, string> = {
  os: 'OS update',
  encryption: 'Disk encryption',
  firewall: 'Firewall',
  mdm: 'MDM check-in',
  disk: 'Disk space',
  battery: 'Battery health',
  vpn: 'VPN client',
  sso: 'SSO device trust',
  firmware: 'Firmware',
  warranty: 'Warranty',
};

export const last = (a: number[] | undefined, fallback = 0) => (a && a.length ? a[a.length - 1] : fallback);

function osFamily(d: Device): 'mac' | 'windows' | 'linux' | 'ios' | 'other' {
  const os = (d.os ?? '').toLowerCase();
  if (os.startsWith('macos')) return 'mac';
  if (os.startsWith('windows')) return 'windows';
  if (os.startsWith('ios') || os.startsWith('ipados')) return 'ios';
  if (/ubuntu|fedora|linux|debian/.test(os)) return 'linux';
  return 'other';
}

export function encryptionName(d: Device): string {
  switch (osFamily(d)) {
    case 'mac':
      return 'FileVault';
    case 'windows':
      return 'BitLocker';
    case 'linux':
      return 'LUKS';
    case 'ios':
      return 'Data protection';
    default:
      return 'Encryption';
  }
}

function ago(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h ago`;
  return `${Math.round(ms / DAY)} days ago`;
}

/** Applicable checks for a device, worst first is NOT applied (stable order). */
export function healthChecks(d: Device, now: number): HealthCheck[] {
  const out: HealthCheck[] = [];
  const add = (id: CheckId, status: CheckStatus, detail: string, fix?: HealthCheck['fix']) =>
    out.push({ id, label: CHECK_LABEL[id], status, detail, weight: WEIGHTS[id], fix: status === 'pass' ? undefined : fix });

  if (!isManagedKind(d.kind)) {
    add('firmware', d.firmwareCurrent === false ? 'warn' : 'pass', d.firmwareCurrent === false ? 'Firmware update available' : 'Firmware up to date', {
      label: 'Update firmware',
      kind: 'auto',
    });
    const w = warrantyInfo(d, now);
    add('warranty', w.state === 'expired' ? 'fail' : w.state === 'expiring' ? 'warn' : 'pass', w.state === 'expired' ? 'Out of warranty' : `${w.daysLeft} days of cover left`);
    return out;
  }

  const c = d.compliance ?? { encrypted: false, firewall: false, osCurrent: false };
  const fam = osFamily(d);
  const portable = d.kind === 'laptop' || d.kind === 'phone' || d.kind === 'tablet';
  const computer = d.kind === 'laptop' || d.kind === 'desktop';

  add('os', c.osCurrent ? 'pass' : 'warn', c.osCurrent ? `${d.os ?? 'OS'} — up to date` : `${d.os ?? 'OS'} → ${d.osTarget ?? 'latest'} available`, {
    label: 'Install update',
    kind: 'auto',
  });
  add('encryption', c.encrypted ? 'pass' : 'fail', c.encrypted ? `${encryptionName(d)} on · key escrowed` : `${encryptionName(d)} is off`, {
    label: 'Turn on',
    kind: 'auto',
  });
  if (computer)
    add('firewall', c.firewall ? 'pass' : 'fail', c.firewall ? 'Firewall on · stealth mode' : 'Firewall is off', { label: 'Turn on', kind: 'auto' });

  const since = d.lastCheckIn ? now - d.lastCheckIn : Infinity;
  add('mdm', since <= DAY ? 'pass' : since <= 7 * DAY ? 'warn' : 'fail', d.lastCheckIn ? `Last check-in ${ago(since)}` : 'Never checked in', { label: 'Sync now', kind: 'auto' });

  if (d.telemetry) {
    const used = last(d.telemetry.storage);
    const free = Math.round(d.telemetry.storageGb * (1 - used / 100));
    add('disk', used < 80 ? 'pass' : used < 90 ? 'warn' : 'fail', `${Math.round(used)}% used · ${free} GB free`, { label: 'Clear space', kind: 'auto' });
    if (portable) {
      const b = last(d.telemetry.battery, 100);
      add('battery', b >= 85 ? 'pass' : b >= 75 ? 'warn' : 'fail', b >= 85 ? `Battery health ${Math.round(b)}%` : `Battery health ${Math.round(b)}% — service ${b >= 75 ? 'soon' : 'now'}`, {
        label: 'Book service',
        kind: 'ticket',
      });
    }
  }
  if (computer && d.posture)
    add('vpn', d.posture.vpnClient === 'current' ? 'pass' : 'warn', d.posture.vpnClient === 'current' ? 'Helix Connect 5.3.0' : 'Helix Connect 5.2.1 → 5.3.0', {
      label: 'Update client',
      kind: 'auto',
    });
  if (d.posture && fam !== 'other') {
    const left = d.posture.ssoExpiresAt - now;
    add('sso', left > 3 * DAY ? 'pass' : left > 0 ? 'warn' : 'fail', left > 3 * DAY ? `Device trust valid ${Math.round(left / DAY)} days` : left > 0 ? `Device trust expires in ${Math.max(1, Math.round(left / HOUR))}h` : 'Device trust expired', {
      label: 'Refresh trust',
      kind: 'auto',
    });
  }
  return out;
}

/** 0..100 health score (weighted checks, capped by lifecycle status). */
export function deviceHealth(d: Device, now: number): number {
  const checks = healthChecks(d, now);
  let score: number;
  if (!isManagedKind(d.kind)) {
    score = 100;
    for (const c of checks) if (c.status !== 'pass') score -= c.status === 'fail' ? c.weight : c.weight * 0.66;
    if (now - d.purchasedAt > 4 * 365 * DAY) score -= 10;
  } else {
    const total = checks.reduce((s, c) => s + c.weight, 0) || 1;
    const got = checks.reduce((s, c) => s + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0), 0);
    score = (got / total) * 100;
  }
  if (d.status === 'lost') score = Math.min(score, 12);
  if (d.status === 'in_repair') score = Math.min(score, 55);
  if (d.status === 'retired') score = Math.min(score, 30);
  return Math.round(clamp(score, 0, 100));
}

export type HealthBand = 'healthy' | 'fair' | 'at_risk' | 'critical';
export function healthBand(score: number): HealthBand {
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'fair';
  if (score >= 50) return 'at_risk';
  return 'critical';
}
export const HEALTH_BAND_LABEL: Record<HealthBand, string> = { healthy: 'Healthy', fair: 'Fair', at_risk: 'At risk', critical: 'Critical' };
export const HEALTH_BAND_COLOR: Record<HealthBand, string> = { healthy: '#34d399', fair: '#a3e635', at_risk: '#fbbf24', critical: '#fb7185' };
export const healthColor = (score: number) => HEALTH_BAND_COLOR[healthBand(score)];

/** Apply a one-click remediation (pure). */
export function applyCheckFix(d: Device, id: CheckId, now: number): Device {
  const next: Device = { ...d, lastCheckIn: now };
  const c = d.compliance ? { ...d.compliance } : undefined;
  const p = d.posture ? { ...d.posture } : undefined;
  switch (id) {
    case 'os':
      if (c) c.osCurrent = true;
      next.os = d.osTarget ?? d.os;
      break;
    case 'encryption':
      if (c) c.encrypted = true;
      next.recoveryKey = d.recoveryKey ?? recoveryKeyFor(d.assetTag, now);
      break;
    case 'firewall':
      if (c) c.firewall = true;
      break;
    case 'disk':
      if (d.telemetry) {
        const used = last(d.telemetry.storage);
        const after = Math.max(46, Math.round(used - Math.max(14, used * 0.24)));
        next.telemetry = { ...d.telemetry, storage: [...d.telemetry.storage.slice(1), after] };
      }
      break;
    case 'vpn':
      if (p) p.vpnClient = 'current';
      break;
    case 'sso':
      if (p) p.ssoExpiresAt = now + 30 * DAY;
      break;
    case 'firmware':
      next.firmwareCurrent = true;
      break;
    default:
      break;
  }
  if (c) next.compliance = c;
  if (p) next.posture = p;
  return next;
}

/* ------------------------------------------------------------ Compliance & warranty */

const MDM_STALE = 7 * DAY;

export function complianceIssues(d: Device, now: number): string[] {
  if (!isManagedKind(d.kind) || d.status === 'retired' || d.status === 'in_stock') return [];
  const c = d.compliance;
  const issues: string[] = [];
  if (!c?.encrypted) issues.push('Encryption off');
  if ((d.kind === 'laptop' || d.kind === 'desktop') && !c?.firewall) issues.push('Firewall off');
  if (!c?.osCurrent) issues.push('OS out of date');
  if (!d.lastCheckIn || now - d.lastCheckIn > MDM_STALE) issues.push('MDM check-in stale');
  return issues;
}

export const isCompliant = (d: Device, now: number) => complianceIssues(d, now).length === 0;

/** The four compliance pills for a managed device. */
export function compliancePills(d: Device, now: number): { id: string; label: string; ok: boolean }[] {
  if (!isManagedKind(d.kind)) return [];
  const c = d.compliance;
  const pills = [
    { id: 'enc', label: 'Encrypted', ok: !!c?.encrypted },
    { id: 'fw', label: 'Firewall', ok: !!c?.firewall },
    { id: 'os', label: 'Up to date', ok: !!c?.osCurrent },
    { id: 'mdm', label: 'MDM', ok: !!d.lastCheckIn && now - d.lastCheckIn <= MDM_STALE },
  ];
  return d.kind === 'laptop' || d.kind === 'desktop' ? pills : pills.filter((p) => p.id !== 'fw');
}

export function warrantyInfo(d: Pick<Device, 'purchasedAt' | 'warrantyEnd'>, now: number) {
  const total = Math.max(1, d.warrantyEnd - d.purchasedAt);
  const left = d.warrantyEnd - now;
  const daysLeft = Math.ceil(left / DAY);
  return {
    pct: clamp(left / total, 0, 1),
    daysLeft,
    state: (left <= 0 ? 'expired' : daysLeft <= 90 ? 'expiring' : 'ok') as 'ok' | 'expiring' | 'expired',
  };
}

/* ------------------------------------------------------------ Asset tags & keys */

const KIND_CODE: Record<DeviceKind, string> = {
  laptop: 'LAP',
  desktop: 'DSK',
  monitor: 'MON',
  phone: 'PHN',
  tablet: 'TAB',
  'security-key': 'KEY',
  headset: 'HDS',
  dock: 'DCK',
  keyboard: 'KBD',
};

export function kindCode(kind: DeviceKind, model = ''): string {
  if (kind === 'laptop') {
    if (/macbook pro/i.test(model)) return 'MBP';
    if (/macbook air/i.test(model)) return 'MBA';
    if (/xps/i.test(model)) return 'XPS';
  }
  return KIND_CODE[kind];
}

export const ASSET_TAG_RE = /^HX-[A-Z]{3}-\d{4}$/;

/** `HX-<KIND>-<NNNN>` with a fleet-wide sequence number. */
export function nextAssetTag(kind: DeviceKind, model: string, devices: Pick<Device, 'assetTag'>[]): string {
  const max = devices.reduce((m, d) => {
    const n = Number(d.assetTag.match(/(\d{4})$/)?.[1] ?? 0);
    return n > m ? n : m;
  }, 0);
  return `HX-${kindCode(kind, model)}-${String(max + 1).padStart(4, '0')}`;
}

/** Normalise user input ("hx mbp 142", "hx-mbp-0142") into an asset tag. */
export function normaliseTag(input: string): string {
  const s = input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const m = s.match(/^(?:HX-?)?([A-Z]{3})-?(\d{1,4})$/);
  if (!m) return s;
  return `HX-${m[1]}-${m[2].padStart(4, '0')}`;
}

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** FileVault-style recovery key, deterministic per tag + salt. */
export function recoveryKeyFor(tag: string, salt: number): string {
  const r = rng(hashString(`${tag}:${salt}`));
  const groups = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => KEY_ALPHABET[Math.floor(r() * KEY_ALPHABET.length)]).join(''));
  return groups.join('-');
}

/* ------------------------------------------------------------ Filters */

export interface FleetCtx {
  users: Pick<User, 'id' | 'name' | 'department'>[];
  now: number;
}

export function deviceSearchText(d: Device, users: FleetCtx['users']): string {
  const u = d.assigneeId ? users.find((x) => x.id === d.assigneeId) : undefined;
  return [d.assetTag, d.model, d.manufacturer, d.serial, d.kind, d.office, u?.name ?? '', d.tags.map((t) => `#${t}`).join(' ')].join(' ').toLowerCase();
}

export function matchesFleetFilter(d: Device, f: FleetFilter, ctx: FleetCtx): boolean {
  if (f.status?.length && !f.status.includes(d.status)) return false;
  if (f.kind?.length && !f.kind.includes(d.kind)) return false;
  if (f.office?.length && !f.office.includes(d.office)) return false;
  if (f.tag?.length && !f.tag.some((t) => d.tags.includes(t))) return false;
  if (f.compliance === 'noncompliant' && isCompliant(d, ctx.now)) return false;
  if (f.compliance === 'compliant' && (!isManagedKind(d.kind) || !isCompliant(d, ctx.now))) return false;
  if (f.warranty) {
    const w = warrantyInfo(d, ctx.now);
    if (f.warranty === 'expiring' && w.state !== 'expiring') return false;
    if (f.warranty === 'expired' && w.state !== 'expired') return false;
  }
  const q = f.q?.trim().toLowerCase();
  if (q) {
    const hay = deviceSearchText(d, ctx.users);
    const terms = q.replace(/^#/, '').split(/\s+/);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

export const filterCount = (f: FleetFilter) =>
  (f.status?.length ?? 0) + (f.kind?.length ?? 0) + (f.office?.length ?? 0) + (f.tag?.length ?? 0) + (f.compliance ? 1 : 0) + (f.warranty ? 1 : 0);

/* ------------------------------------------------------------ Fleet Radar */

export interface RadarSector {
  key: string;
  label: string;
  /** Radians, 0 = top, clockwise. */
  start: number;
  end: number;
  count: number;
}

export interface RadarBlip {
  tag: string;
  sector: string;
  angle: number;
  /** 0 (centre, healthy) .. 1 (edge, risky). */
  dist: number;
  /** Unit-circle coordinates (y down). */
  x: number;
  y: number;
  risk: number;
  health: number;
  status: DeviceStatus;
  pulse: boolean;
}

/** Distance from centre grows with risk (= 100 − health). */
export const radarDistance = (risk: number) => 0.13 + 0.83 * Math.pow(clamp(risk, 0, 100) / 100, 0.8);

export function radarLayout(
  devices: Device[],
  opts: { groupOf: (d: Device) => string; sectors: string[]; now: number },
): { sectors: RadarSector[]; blips: RadarBlip[] } {
  const keys = opts.sectors.filter((k) => devices.some((d) => opts.groupOf(d) === k));
  const n = Math.max(1, keys.length);
  const span = (Math.PI * 2) / n;
  const sectors: RadarSector[] = keys.map((k, i) => ({
    key: k,
    label: k,
    start: i * span,
    end: (i + 1) * span,
    count: devices.filter((d) => opts.groupOf(d) === k).length,
  }));
  const blips: RadarBlip[] = [];
  for (const d of devices) {
    const key = opts.groupOf(d);
    const s = sectors.find((x) => x.key === key);
    if (!s) continue;
    const h = hashString(d.assetTag);
    const pad = Math.min(0.12, span * 0.12);
    const frac = (h % 997) / 997;
    const angle = s.start + pad + (s.end - s.start - pad * 2) * frac;
    const health = deviceHealth(d, opts.now);
    const risk = 100 - health;
    const jitter = (((h >>> 10) % 100) / 100 - 0.5) * 0.05;
    const dist = clamp(radarDistance(risk) + jitter, 0.08, 0.97);
    const a = angle - Math.PI / 2;
    blips.push({
      tag: d.assetTag,
      sector: key,
      angle,
      dist,
      x: Math.cos(a) * dist,
      y: Math.sin(a) * dist,
      risk,
      health,
      status: d.status,
      pulse: d.status === 'lost' || (isManagedKind(d.kind) && complianceIssues(d, opts.now).length > 0),
    });
  }
  return { sectors, blips };
}

/* ------------------------------------------------------------ Aggregates (Insights) */

export function healthHistogram(devices: Device[], now: number, bins = 10): number[] {
  const out = Array.from({ length: bins }, () => 0);
  for (const d of devices) {
    const h = deviceHealth(d, now);
    out[Math.min(bins - 1, Math.floor((h / 100) * bins))] += 1;
  }
  return out;
}

export function complianceByDepartment(
  devices: Device[],
  users: Pick<User, 'id' | 'department'>[],
  now: number,
): { department: Department; devices: number; encryption: number; firewall: number; os: number; mdm: number }[] {
  const rows = new Map<Department, Device[]>();
  for (const d of devices) {
    if (!isManagedKind(d.kind) || !d.assigneeId || (d.status !== 'in_use' && d.status !== 'loaner')) continue;
    const u = users.find((x) => x.id === d.assigneeId);
    if (!u) continue;
    rows.set(u.department, [...(rows.get(u.department) ?? []), d]);
  }
  const share = (list: Device[], f: (d: Device) => boolean) => (list.length ? list.filter(f).length / list.length : 1);
  return [...rows.entries()]
    .map(([department, list]) => {
      const computers = list.filter((d) => d.kind === 'laptop' || d.kind === 'desktop');
      return {
        department,
        devices: list.length,
        encryption: share(list, (d) => !!d.compliance?.encrypted),
        firewall: share(computers, (d) => !!d.compliance?.firewall),
        os: share(list, (d) => !!d.compliance?.osCurrent),
        mdm: share(list, (d) => !!d.lastCheckIn && now - d.lastCheckIn <= MDM_STALE),
      };
    })
    .sort((a, b) => b.devices - a.devices);
}

/** Primary device of a person: their in-use/loaner computer, most recent first. */
export function primaryDevice(devices: Device[], userId: string): Device | undefined {
  const mine = devices.filter((d) => d.assigneeId === userId && (d.status === 'in_use' || d.status === 'loaner'));
  const rank = (k: DeviceKind) => (k === 'laptop' ? 0 : k === 'desktop' ? 1 : k === 'tablet' ? 3 : k === 'phone' ? 2 : 4);
  return [...mine].sort((a, b) => rank(a.kind) - rank(b.kind) || b.purchasedAt - a.purchasedAt)[0];
}

export const officeLabel = (o: Office) => (o === 'Remote' ? 'Remote' : o);
