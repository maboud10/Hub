/**
 * IT Helpdesk demo seed — generated relative to `now` so "2h ago", "due in
 * 4 days" and live SLA countdowns are always meaningful. IDs referenced by
 * other code/tests: tickets `HX-1042` (u-omar VPN), `HX-1031` (u-omar, awaiting
 * CSAT), `HX-1045` (u-mei, waiting on her), `HX-1047` (u-alex loaner question);
 * devices `HX-MBP-0142` (u-omar), `HX-MBA-0419` (u-alex loaner); request
 * `REQ-2041` (u-hana → awaiting u-omar); incident `INC-311` (VPN Singapore).
 */
import type {
  ApprovalStep,
  CatalogItem,
  CatalogRequest,
  CustodyEvent,
  Device,
  DeviceKind,
  DeviceStatus,
  DeviceTag,
  FixRun,
  Guide,
  HelpdeskData,
  Impact,
  Incident,
  ItAnnouncement,
  Macro,
  Maintenance,
  Office,
  Priority,
  ResolutionCode,
  Service,
  Ticket,
  TicketCategory,
  TicketEvent,
  TicketStatus,
  Urgency,
  WeekStat,
} from './types';
import { DAY, HOUR, MIN, isManagedKind } from './meta';
import { recoveryKeyFor } from './fleet';
import { hashString, rng } from './util';

export const HELPDESK_VERSION = 1;

/* =========================================================================
   Devices
   ========================================================================= */

export const SEED_TAGS = (now: number): DeviceTag[] => [
  { id: 'eng-heavy', name: 'eng-heavy', color: '#22d3ee', description: '64 GB+ build machines for containers, Rust and local Kubernetes.', createdAt: now - 400 * DAY },
  { id: 'design-rig', name: 'design-rig', color: '#f472b6', description: 'Colour-calibrated creative setups for Figma, 3D and 5K/6K displays.', createdAt: now - 380 * DAY },
  { id: 'exec-tier', name: 'exec-tier', color: '#a78bfa', description: 'Leadership fleet — priority swap and travel lockdown profile.', createdAt: now - 360 * DAY },
  { id: 'loaner-pool', name: 'loaner-pool', color: '#fbbf24', description: 'Hot-swap depot devices for loans, travel and repairs.', createdAt: now - 350 * DAY },
  { id: 'applecare', name: 'applecare+', color: '#38bdf8', description: 'Enterprise AppleCare+ — next-business-day onsite replacement.', createdAt: now - 300 * DAY },
  { id: 'refresh-2027', name: 'refresh-2027', color: '#94a3b8', description: 'Due for the 36-month hardware refresh in FY2027.', createdAt: now - 120 * DAY },
  { id: 'travel-kit', name: 'travel-kit', color: '#34d399', description: 'Hardened for travel: privacy screen, eSIM and travel lockdown profile.', createdAt: now - 90 * DAY },
];

interface DevSeed {
  tag: string;
  kind: DeviceKind;
  model: string;
  user?: string;
  status?: DeviceStatus;
  office: Office;
  tags?: string[];
  ageDays: number;
  warrantyYears?: number;
  cost?: number;
  os?: string;
  specs?: string;
  storageGb?: number;
  issues?: {
    osOld?: boolean;
    noEncrypt?: boolean;
    noFirewall?: boolean;
    staleDays?: number;
    storage?: number;
    battery?: number;
    vpnOld?: boolean;
    ssoDays?: number;
    wifiDays?: number;
    hot?: number;
    firmwareOld?: boolean;
  };
  loan?: { sinceDays: number; dueDays: number; note?: string };
  repair?: { vendor: string; sinceDays: number; etaDays?: number; note?: string };
  lostDaysAgo?: number;
  retiredDaysAgo?: number;
  returnedBy?: string;
  notes?: string;
}

function manufacturerOf(model: string): string {
  if (/^(MacBook|iPhone|iPad|Apple|Magic)/.test(model)) return 'Apple';
  if (/^Dell/.test(model)) return 'Dell';
  if (/^Lenovo/.test(model)) return 'Lenovo';
  if (/^YubiKey/.test(model)) return 'Yubico';
  if (/^Jabra/.test(model)) return 'Jabra';
  if (/^Poly/.test(model)) return 'HP Poly';
  if (/^CalDigit/.test(model)) return 'CalDigit';
  if (/^LG/.test(model)) return 'LG';
  if (/^Framework/.test(model)) return 'Framework';
  return 'Generic';
}

function defaultOs(kind: DeviceKind, model: string, old: boolean): { os?: string; target?: string } {
  if (kind === 'laptop' || kind === 'desktop') {
    if (/MacBook|Mac /.test(model)) return { os: old ? 'macOS 15.1' : 'macOS 15.2', target: 'macOS 15.2' };
    if (/Ubuntu/.test(model)) return { os: old ? 'Ubuntu 22.04 LTS' : 'Ubuntu 24.04 LTS', target: 'Ubuntu 24.04 LTS' };
    if (/Fedora/.test(model)) return { os: old ? 'Fedora 40' : 'Fedora 41', target: 'Fedora 41' };
    return { os: old ? 'Windows 11 23H2' : 'Windows 11 24H2', target: 'Windows 11 24H2' };
  }
  if (kind === 'phone') return { os: old ? 'iOS 18.1' : 'iOS 18.2', target: 'iOS 18.2' };
  if (kind === 'tablet') return { os: old ? 'iPadOS 18.1' : 'iPadOS 18.2', target: 'iPadOS 18.2' };
  return {};
}

function serialFor(tag: string, maker: string): string {
  const r = rng(hashString(`serial:${tag}`));
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const pick = (n: number) => Array.from({ length: n }, () => A[Math.floor(r() * A.length)]).join('');
  if (maker === 'Apple') return `C02${pick(9)}`;
  if (maker === 'Dell') return pick(7);
  if (maker === 'Lenovo') return `PF${pick(6)}`;
  if (maker === 'Yubico') return String(20_000_000 + Math.floor(r() * 9_000_000));
  return `${maker.slice(0, 2).toUpperCase()}${pick(8)}`;
}

function series(seed: string, n: number, from: number, to: number, noise: number, lo = 0, hi = 100): number[] {
  const r = rng(hashString(seed));
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 1 : i / (n - 1);
    const v = from + (to - from) * t + (i === n - 1 ? 0 : (r() - 0.5) * noise);
    return Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10;
  });
}

function buildDevice(s: DevSeed, now: number): Device {
  const r = rng(hashString(`dev:${s.tag}`));
  const maker = manufacturerOf(s.model);
  const managed = isManagedKind(s.kind);
  const iss = s.issues ?? {};
  const purchasedAt = now - s.ageDays * DAY;
  const status: DeviceStatus = s.status ?? (s.user ? 'in_use' : 'in_stock');
  const osInfo = s.os ? { os: s.os, target: s.os } : defaultOs(s.kind, s.model, !!iss.osOld);
  if (s.os && iss.osOld) osInfo.target = s.os.replace('23H2', '24H2');
  const storageGb = s.storageGb ?? (s.kind === 'phone' ? 256 : s.kind === 'tablet' ? 512 : /16"/.test(s.model) ? 2048 : /Air/.test(s.model) ? 512 : 1024);
  const portable = s.kind !== 'desktop';
  const battery = iss.battery ?? Math.round(100 - s.ageDays / 40 - r() * 3);
  const storage = iss.storage ?? Math.round(38 + r() * 30);
  const temp = iss.hot ?? Math.round(52 + r() * 12);

  const custody: CustodyEvent[] = [{ id: `c-${s.tag}-0`, at: purchasedAt, kind: 'purchased', note: `${maker} · $${(s.cost ?? 0).toLocaleString('en-US')}` }];
  if (s.returnedBy) {
    custody.push({ id: `c-${s.tag}-1`, at: purchasedAt + 3 * DAY, kind: 'assigned', userId: s.returnedBy, actorId: 'u-mateo' });
    custody.push({ id: `c-${s.tag}-2`, at: now - 40 * DAY, kind: 'returned', userId: s.returnedBy, actorId: 'u-mateo', note: 'Contract ended · wiped & re-imaged' });
  }
  if (s.user && status !== 'loaner') custody.push({ id: `c-${s.tag}-a`, at: purchasedAt + 2 * DAY, kind: 'assigned', userId: s.user, actorId: s.ageDays < 40 ? 'u-mateo' : 'u-layla' });
  if (s.loan && s.user) custody.push({ id: `c-${s.tag}-l`, at: now - s.loan.sinceDays * DAY, kind: 'loaned', userId: s.user, actorId: 'u-mateo', note: s.loan.note });
  if (s.repair) custody.push({ id: `c-${s.tag}-r`, at: now - s.repair.sinceDays * DAY, kind: 'repair', actorId: 'u-mateo', note: `${s.repair.vendor} — ${s.repair.note ?? ''}`.trim() });
  if (s.lostDaysAgo) custody.push({ id: `c-${s.tag}-x`, at: now - s.lostDaysAgo * DAY, kind: 'lost', userId: s.user, actorId: s.user, note: 'Reported lost · remote lock & wipe sent' });
  if (s.retiredDaysAgo) custody.push({ id: `c-${s.tag}-z`, at: now - s.retiredDaysAgo * DAY, kind: 'retired', actorId: 'u-layla', note: 'End of life · certified recycling (R2)' });

  const d: Device = {
    assetTag: s.tag,
    kind: s.kind,
    manufacturer: maker,
    model: s.model,
    serial: serialFor(s.tag, maker),
    status,
    assigneeId: status === 'retired' || status === 'in_repair' ? undefined : s.user,
    office: s.office,
    tags: s.tags ?? [],
    purchasedAt,
    warrantyEnd: purchasedAt + (s.warrantyYears ?? (managed ? 3 : 2)) * 365 * DAY,
    cost: s.cost ?? 0,
    os: osInfo.os,
    osTarget: osInfo.target,
    specs: s.specs,
    mdm: [],
    custody: custody.sort((a, b) => a.at - b.at),
    notes: s.notes,
  };
  if (managed) {
    d.compliance = { encrypted: !iss.noEncrypt, firewall: !iss.noFirewall, osCurrent: !iss.osOld };
    d.posture = {
      vpnClient: iss.vpnOld ? 'outdated' : 'current',
      ssoExpiresAt: now + (iss.ssoDays ?? 12 + Math.floor(r() * 16)) * DAY,
      wifiCertExpiresAt: now + (iss.wifiDays ?? 90 + Math.floor(r() * 220)) * DAY,
    };
    d.telemetry = {
      battery: portable ? series(`b:${s.tag}`, 12, Math.min(100, battery + 4 + r() * 3), battery, 1.2) : [],
      storage: series(`s:${s.tag}`, 12, Math.max(20, storage - 12), storage, 4),
      cpuTemp: series(`t:${s.tag}`, 24, temp - (iss.hot ? 18 : 4), temp, iss.hot ? 8 : 10, 35, 99),
      batteryCycles: portable ? Math.round(s.ageDays * 0.55 + r() * 40) : undefined,
      storageGb,
    };
    d.lastCheckIn = status === 'lost' ? now - (s.lostDaysAgo ?? 30) * DAY : status === 'retired' ? now - (s.retiredDaysAgo ?? 200) * DAY : iss.staleDays ? now - iss.staleDays * DAY : now - Math.round(5 + r() * 170) * MIN;
    if (d.compliance.encrypted) d.recoveryKey = recoveryKeyFor(s.tag, 1);
  } else {
    d.firmwareCurrent = !iss.firmwareOld;
  }
  if (s.loan) d.loan = { since: now - s.loan.sinceDays * DAY, dueAt: now + s.loan.dueDays * DAY, note: s.loan.note };
  if (s.repair) d.repair = { vendor: s.repair.vendor, since: now - s.repair.sinceDays * DAY, eta: s.repair.etaDays ? now + s.repair.etaDays * DAY : undefined, note: s.repair.note };
  if (status === 'lost') d.locked = true;
  return d;
}

const DEVICE_SEEDS: DevSeed[] = [
  // ── Omar (Dubai) ─────────────────────────────────────────────
  { tag: 'HX-MBP-0142', kind: 'laptop', model: 'MacBook Pro 16" M4 Max', user: 'u-omar', office: 'Dubai', tags: ['eng-heavy', 'applecare'], ageDays: 420, cost: 3999, specs: 'M4 Max · 64 GB · 2 TB', issues: { osOld: true, ssoDays: 1.6, storage: 72 } },
  { tag: 'HX-MON-0217', kind: 'monitor', model: 'LG UltraFine 5K 27"', user: 'u-omar', office: 'Dubai', ageDays: 700, warrantyYears: 3, cost: 1299 },
  { tag: 'HX-KEY-0388', kind: 'security-key', model: 'YubiKey 5C NFC', user: 'u-omar', office: 'Dubai', ageDays: 300, cost: 55 },
  { tag: 'HX-PHN-0451', kind: 'phone', model: 'iPhone 16 Pro', user: 'u-omar', office: 'Dubai', ageDays: 19, warrantyYears: 2, cost: 999, specs: '256 GB · eSIM' },
  // ── Mei (Singapore) ──────────────────────────────────────────
  { tag: 'HX-MBP-0187', kind: 'laptop', model: 'MacBook Pro 14" M4 Pro', user: 'u-mei', office: 'Singapore', tags: ['design-rig'], ageDays: 300, cost: 2399, specs: 'M4 Pro · 48 GB · 1 TB', issues: { noFirewall: true, storage: 87, wifiDays: 2 } },
  { tag: 'HX-MON-0188', kind: 'monitor', model: 'Apple Pro Display XDR 32"', user: 'u-mei', office: 'Singapore', tags: ['design-rig'], ageDays: 300, warrantyYears: 3, cost: 4999 },
  { tag: 'HX-TAB-0233', kind: 'tablet', model: 'iPad Pro 13" M4', user: 'u-mei', office: 'Singapore', tags: ['design-rig'], ageDays: 160, warrantyYears: 2, cost: 1299, specs: 'M4 · 512 GB · Pencil Pro' },
  { tag: 'HX-KEY-0402', kind: 'security-key', model: 'YubiKey 5C NFC', user: 'u-mei', office: 'Singapore', ageDays: 290, cost: 55 },
  // ── Alex (contractor, remote) ────────────────────────────────
  { tag: 'HX-MBA-0419', kind: 'laptop', model: 'MacBook Air 13" M3', user: 'u-alex', status: 'loaner', office: 'Remote', tags: ['loaner-pool', 'travel-kit'], ageDays: 380, cost: 1299, specs: 'M3 · 16 GB · 512 GB', loan: { sinceDays: 80, dueDays: 4, note: 'Contract term loaner' }, notes: 'Contractor DLP profile applied' },
  { tag: 'HX-HDS-0466', kind: 'headset', model: 'Jabra Evolve2 65', user: 'u-alex', office: 'Remote', ageDays: 75, cost: 279 },
  // ── Layla (Dubai) ────────────────────────────────────────────
  { tag: 'HX-MBP-0007', kind: 'laptop', model: 'MacBook Pro 14" M4 Max', user: 'u-layla', office: 'Dubai', tags: ['exec-tier', 'travel-kit'], ageDays: 200, cost: 3199, specs: 'M4 Max · 36 GB · 1 TB' },
  { tag: 'HX-PHN-0009', kind: 'phone', model: 'iPhone 16 Pro', user: 'u-layla', office: 'Dubai', tags: ['exec-tier'], ageDays: 50, warrantyYears: 2, cost: 999 },
  { tag: 'HX-KEY-0011', kind: 'security-key', model: 'YubiKey 5Ci', user: 'u-layla', office: 'Dubai', ageDays: 420, cost: 75 },
  // ── Sara (Dubai) ─────────────────────────────────────────────
  { tag: 'HX-MBA-0121', kind: 'laptop', model: 'MacBook Air 15" M3', user: 'u-sara', office: 'Dubai', tags: ['exec-tier'], ageDays: 330, cost: 1699, specs: 'M3 · 24 GB · 512 GB' },
  { tag: 'HX-DCK-0122', kind: 'dock', model: 'CalDigit TS4', user: 'u-sara', office: 'Dubai', ageDays: 330, cost: 399 },
  { tag: 'HX-PHN-0123', kind: 'phone', model: 'iPhone 15', user: 'u-sara', office: 'Dubai', ageDays: 410, warrantyYears: 2, cost: 799 },
  // ── Daniel (London) ──────────────────────────────────────────
  { tag: 'HX-LAP-0158', kind: 'laptop', model: 'Lenovo ThinkPad X1 Carbon Gen 12', user: 'u-daniel', office: 'London', tags: ['refresh-2027'], ageDays: 610, cost: 2149, os: 'Windows 11 23H2', specs: 'Core Ultra 7 · 32 GB · 1 TB', issues: { osOld: true, battery: 78 } },
  { tag: 'HX-MON-0159', kind: 'monitor', model: 'Dell UltraSharp U2723QE', user: 'u-daniel', office: 'London', ageDays: 610, cost: 579 },
  // ── Priya (Bengaluru · remote) ───────────────────────────────
  { tag: 'HX-MBP-0145', kind: 'laptop', model: 'MacBook Pro 16" M3 Max', user: 'u-priya', office: 'Remote', tags: ['eng-heavy', 'refresh-2027'], ageDays: 720, cost: 3999, specs: 'M3 Max · 64 GB · 2 TB' },
  { tag: 'HX-XPS-0146', kind: 'laptop', model: 'Dell XPS 13 (Ubuntu 24.04)', user: 'u-priya', office: 'Remote', tags: ['eng-heavy'], ageDays: 500, cost: 1699, specs: 'Core Ultra 7 · 32 GB · 1 TB', issues: { staleDays: 9 } },
  // ── Lucas (Berlin) ───────────────────────────────────────────
  { tag: 'HX-MBP-0160', kind: 'laptop', model: 'MacBook Pro 16" M4 Pro', user: 'u-lucas', office: 'Berlin', tags: ['eng-heavy'], ageDays: 6, cost: 3499, specs: 'M4 Pro · 48 GB · 2 TB' },
  { tag: 'HX-PHN-0162', kind: 'phone', model: 'iPhone 15 Pro', user: 'u-lucas', office: 'Berlin', ageDays: 380, warrantyYears: 2, cost: 999 },
  { tag: 'HX-MBP-0098', kind: 'laptop', model: 'MacBook Pro 16" M1 Max', status: 'in_repair', office: 'Berlin', tags: ['applecare'], ageDays: 1100, cost: 3499, repair: { vendor: 'Apple Authorised Service · Berlin', sinceDays: 6, etaDays: 3, note: 'Swollen battery — top case replacement' }, issues: { battery: 64 } },
  { tag: 'HX-KEY-0161', kind: 'security-key', model: 'YubiKey 5C NFC', user: 'u-lucas', office: 'Berlin', ageDays: 900, cost: 55 },
  // ── Aisha (London) ───────────────────────────────────────────
  { tag: 'HX-MBA-0171', kind: 'laptop', model: 'MacBook Air 15" M3', user: 'u-aisha', office: 'London', ageDays: 260, cost: 1699 },
  { tag: 'HX-DCK-0172', kind: 'dock', model: 'Dell WD22TB4 Thunderbolt Dock', user: 'u-aisha', office: 'London', ageDays: 900, cost: 329, issues: { firmwareOld: true } },
  { tag: 'HX-MON-0173', kind: 'monitor', model: 'Dell UltraSharp U2723QE', user: 'u-aisha', office: 'London', ageDays: 900, cost: 579 },
  // ── Noah (New York) ──────────────────────────────────────────
  { tag: 'HX-MBA-0181', kind: 'laptop', model: 'MacBook Air 13" M2', user: 'u-noah', office: 'New York', tags: ['refresh-2027'], ageDays: 860, cost: 1199, issues: { osOld: true, battery: 81 } },
  { tag: 'HX-PHN-0182', kind: 'phone', model: 'iPhone 16', user: 'u-noah', office: 'New York', ageDays: 33, warrantyYears: 2, cost: 899 },
  { tag: 'HX-PHN-0112', kind: 'phone', model: 'iPhone 13', user: 'u-noah', status: 'lost', office: 'New York', ageDays: 1000, warrantyYears: 2, cost: 799, lostDaysAgo: 34 },
  // ── Fatima (Dubai) ───────────────────────────────────────────
  { tag: 'HX-MBA-0191', kind: 'laptop', model: 'MacBook Air 13" M3', user: 'u-fatima', office: 'Dubai', ageDays: 400, cost: 1299 },
  { tag: 'HX-HDS-0192', kind: 'headset', model: 'Jabra Evolve2 65', user: 'u-fatima', office: 'Dubai', ageDays: 400, cost: 279 },
  // ── Ethan (Toronto) ──────────────────────────────────────────
  { tag: 'HX-MBP-0201', kind: 'laptop', model: 'MacBook Pro 14" M4 Max', user: 'u-ethan', office: 'Toronto', tags: ['eng-heavy'], ageDays: 240, cost: 3199 },
  { tag: 'HX-DSK-0202', kind: 'desktop', model: 'Framework Desktop (Fedora 41)', user: 'u-ethan', office: 'Toronto', tags: ['eng-heavy'], ageDays: 120, cost: 2099, specs: 'Ryzen AI Max+ 395 · 128 GB · 4 TB', storageGb: 4096 },
  { tag: 'HX-KEY-0203', kind: 'security-key', model: 'YubiKey 5C NFC', user: 'u-ethan', office: 'Toronto', ageDays: 500, cost: 55 },
  { tag: 'HX-KEY-0204', kind: 'security-key', model: 'YubiKey 5Ci', user: 'u-ethan', office: 'Toronto', ageDays: 500, cost: 75 },
  // ── Sofia (Milan · remote) ───────────────────────────────────
  { tag: 'HX-MBP-0211', kind: 'laptop', model: 'MacBook Pro 14" M3 Pro', user: 'u-sofia', office: 'Remote', tags: ['design-rig'], ageDays: 560, cost: 2499, issues: { storage: 93, hot: 94 } },
  { tag: 'HX-TAB-0212', kind: 'tablet', model: 'iPad Air 11" M2', user: 'u-sofia', office: 'Remote', ageDays: 300, warrantyYears: 2, cost: 749 },
  // ── Yusuf (Istanbul · remote) ────────────────────────────────
  { tag: 'HX-LAP-0221', kind: 'laptop', model: 'Dell Latitude 7450', user: 'u-yusuf', office: 'Remote', ageDays: 480, cost: 1799 },
  { tag: 'HX-HDS-0222', kind: 'headset', model: 'Poly Voyager Focus 2', user: 'u-yusuf', office: 'Remote', ageDays: 480, cost: 299 },
  // ── Hana (Singapore) ─────────────────────────────────────────
  { tag: 'HX-MBA-0231', kind: 'laptop', model: 'MacBook Air 13" M3', user: 'u-hana', office: 'Singapore', ageDays: 620, cost: 1299, issues: { vpnOld: true } },
  { tag: 'HX-HDS-0232', kind: 'headset', model: 'Jabra Evolve2 75', user: 'u-hana', office: 'Singapore', ageDays: 3, cost: 329 },
  // ── Mateo (Dubai) ────────────────────────────────────────────
  { tag: 'HX-MBA-0241', kind: 'laptop', model: 'MacBook Air 15" M3', user: 'u-mateo', office: 'Dubai', ageDays: 500, cost: 1699 },
  { tag: 'HX-TAB-0242', kind: 'tablet', model: 'iPad 10th gen', user: 'u-mateo', office: 'Dubai', ageDays: 700, warrantyYears: 2, cost: 449, notes: 'Front-desk visitor kiosk' },
  // ── Grace (Singapore) ────────────────────────────────────────
  { tag: 'HX-LAP-0251', kind: 'laptop', model: 'Lenovo ThinkPad X1 Carbon Gen 12', user: 'u-grace', office: 'Singapore', ageDays: 210, cost: 2149 },
  { tag: 'HX-MON-0252', kind: 'monitor', model: 'Dell UltraSharp U2723QE', user: 'u-grace', office: 'Singapore', ageDays: 210, cost: 579 },
  // ── Kwame (Accra · remote, new hire) ─────────────────────────
  { tag: 'HX-MBP-0431', kind: 'laptop', model: 'MacBook Pro 14" M4 Pro', user: 'u-kwame', office: 'Remote', tags: ['eng-heavy'], ageDays: 28, cost: 2399, specs: 'M4 Pro · 48 GB · 1 TB' },
  { tag: 'HX-KEY-0432', kind: 'security-key', model: 'YubiKey 5C NFC', user: 'u-kwame', office: 'Remote', ageDays: 28, cost: 55 },
  // ── Stock & loaner pool ─────────────────────────────────────
  { tag: 'HX-MBP-0440', kind: 'laptop', model: 'MacBook Pro 14" M4 Pro', office: 'Dubai', ageDays: 20, cost: 2399, specs: 'M4 Pro · 24 GB · 1 TB' },
  { tag: 'HX-MBP-0441', kind: 'laptop', model: 'MacBook Pro 14" M4 Pro', office: 'London', ageDays: 20, cost: 2399, specs: 'M4 Pro · 24 GB · 1 TB' },
  { tag: 'HX-MBP-0442', kind: 'laptop', model: 'MacBook Pro 16" M4 Max', office: 'Dubai', tags: ['eng-heavy'], ageDays: 14, cost: 3999, specs: 'M4 Max · 64 GB · 2 TB' },
  { tag: 'HX-XPS-0443', kind: 'laptop', model: 'Dell XPS 13 (Ubuntu 24.04)', office: 'London', ageDays: 40, cost: 1699 },
  { tag: 'HX-MON-0444', kind: 'monitor', model: 'LG UltraFine 5K 27"', office: 'Dubai', ageDays: 60, cost: 1299 },
  { tag: 'HX-MON-0445', kind: 'monitor', model: 'Apple Studio Display 27"', office: 'Singapore', ageDays: 45, cost: 1599 },
  { tag: 'HX-DCK-0446', kind: 'dock', model: 'CalDigit TS4', office: 'Dubai', ageDays: 60, cost: 399 },
  { tag: 'HX-KEY-0447', kind: 'security-key', model: 'YubiKey 5C NFC', office: 'Dubai', ageDays: 90, cost: 55 },
  { tag: 'HX-KEY-0448', kind: 'security-key', model: 'YubiKey 5C NFC', office: 'London', ageDays: 90, cost: 55 },
  { tag: 'HX-HDS-0449', kind: 'headset', model: 'Jabra Evolve2 65', office: 'London', ageDays: 70, cost: 279 },
  { tag: 'HX-PHN-0450', kind: 'phone', model: 'iPhone 16', office: 'Dubai', ageDays: 30, warrantyYears: 2, cost: 899 },
  { tag: 'HX-KBD-0452', kind: 'keyboard', model: 'Magic Keyboard with Touch ID', office: 'Dubai', ageDays: 30, cost: 199 },
  { tag: 'HX-MBA-0420', kind: 'laptop', model: 'MacBook Air 13" M3', office: 'Dubai', tags: ['loaner-pool', 'travel-kit'], ageDays: 380, cost: 1299 },
  { tag: 'HX-MBA-0301', kind: 'laptop', model: 'MacBook Air 13" M2', office: 'London', tags: ['loaner-pool'], ageDays: 760, cost: 1199, returnedBy: 'u-elena' },
  // ── Repair & retired ────────────────────────────────────────
  { tag: 'HX-MON-0134', kind: 'monitor', model: 'Dell UltraSharp U2723QE', status: 'in_repair', office: 'London', ageDays: 820, cost: 579, repair: { vendor: 'Dell ProSupport', sinceDays: 4, etaDays: 6, note: 'Dead pixel cluster — panel swap' } },
  { tag: 'HX-MBP-0031', kind: 'laptop', model: 'MacBook Pro 15" (2019)', status: 'retired', office: 'Dubai', ageDays: 2300, cost: 2799, retiredDaysAgo: 210 },
  { tag: 'HX-MBP-0044', kind: 'laptop', model: 'MacBook Pro 13" (2020)', status: 'retired', office: 'London', ageDays: 2050, cost: 1799, retiredDaysAgo: 95 },
];

/* =========================================================================
   Tickets
   ========================================================================= */

interface EvSeed {
  kind: TicketEvent['kind'];
  ago: number;
  actor?: string;
  body?: string;
  from?: string;
  to?: string;
}

interface TicketSeed {
  id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  impact?: Impact;
  urgency?: Urgency;
  status: TicketStatus;
  requester: string;
  assignee?: string;
  device?: string;
  createdAgo: number;
  responseAfter?: number;
  resolvedAgo?: number;
  pausedAgo?: number;
  resolution?: ResolutionCode;
  csat?: { score: 1 | 2 | 3 | 4 | 5; comment?: string; agoAfterResolve?: number };
  events: EvSeed[];
  incidentId?: string;
  escalated?: boolean;
  selfService?: Ticket['selfService'];
}

const TICKET_SEEDS: TicketSeed[] = [
  {
    id: 'HX-1042',
    subject: 'VPN drops every few minutes when working from home',
    description: 'Since yesterday Helix Connect disconnects every 5–10 minutes from home. Reconnecting works, but it kills my SSH sessions and Meet calls. Home fibre (Etisalat).',
    category: 'network',
    priority: 'P2',
    urgency: 'high',
    status: 'in_progress',
    requester: 'u-omar',
    assignee: 'u-layla',
    device: 'HX-MBP-0142',
    createdAgo: 5 * HOUR,
    responseAfter: 40 * MIN,
    events: [
      { kind: 'automation', ago: 5 * HOUR - MIN, body: 'Nova triaged this as Network & VPN · P2, linked HX-MBP-0142 and attached diagnostics: packet loss 4.1% on utun4 · DNS OK.' },
      { kind: 'assign', ago: 5 * HOUR - 22 * MIN, actor: 'u-layla', to: 'u-layla' },
      { kind: 'reply', ago: 4 * HOUR + 20 * MIN, actor: 'u-layla', body: 'Thanks Omar — I can see the drops on our side too (keep-alive timeouts from your client). Could you update Helix Connect to 5.3.0 from Self Service and leave it connected for an hour? I’ve also pinned you to the Frankfurt gateway while we look at the Dubai pool.' },
      { kind: 'status', ago: 4 * HOUR + 20 * MIN, actor: 'u-layla', from: 'new', to: 'in_progress' },
      { kind: 'reply', ago: 3 * HOUR, actor: 'u-omar', body: 'Updated to 5.3.0 — still dropped twice in the last hour, but it reconnects faster now.' },
      { kind: 'note', ago: 2 * HOUR, actor: 'u-layla', body: 'Same pattern on 3 other Dubai home users on Etisalat fibre — smells like MTU/fragmentation on their CGNAT. Testing an MTU 1380 profile on my machine first.' },
    ],
  },
  {
    id: 'HX-1031',
    subject: 'Studio display flickers after the macOS 15.1 update',
    description: 'My LG UltraFine flickers every few seconds since updating to macOS 15.1. Happens with the dock and with a direct cable.',
    category: 'hardware',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-omar',
    assignee: 'u-mateo',
    device: 'HX-MON-0217',
    createdAgo: 3 * DAY,
    responseAfter: 70 * MIN,
    resolvedAgo: 20 * HOUR,
    resolution: 'fixed',
    events: [
      { kind: 'reply', ago: 3 * DAY - 70 * MIN, actor: 'u-mateo', body: 'Hi Omar — this is a known issue with macOS 15.1 and LG UltraFine panels. Could you try the Thunderbolt port closest to the hinge and switch off “Prefer 60 Hz”? If it keeps flickering I’ll swap the cable today.' },
      { kind: 'status', ago: 3 * DAY - 70 * MIN, actor: 'u-mateo', from: 'new', to: 'in_progress' },
      { kind: 'reply', ago: 22 * HOUR, actor: 'u-omar', body: 'The hinge-side port fixed it — no flicker since this morning.' },
      { kind: 'reply', ago: 20 * HOUR, actor: 'u-mateo', body: 'Great news! I’ve also pushed the latest display firmware to your Mac via MDM so it shouldn’t come back. Marking this as resolved — let us know how we did.' },
      { kind: 'status', ago: 20 * HOUR, actor: 'u-mateo', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1046',
    subject: 'Clear disk space',
    description: 'Ran the Clear disk space fix from Support Home.',
    category: 'hardware',
    priority: 'P4',
    urgency: 'low',
    status: 'resolved',
    requester: 'u-omar',
    device: 'HX-MBP-0142',
    createdAgo: DAY + 5 * MIN,
    responseAfter: 0,
    resolvedAgo: DAY,
    resolution: 'self_service',
    selfService: { playbookId: 'clear-disk', outcome: 'success' },
    events: [
      { kind: 'automation', ago: DAY + 2 * MIN, body: 'Nova ran Clear disk space on HX-MBP-0142 — freed 21.4 GB · disk now 72% used.' },
      { kind: 'status', ago: DAY, from: 'new', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1045',
    subject: 'Figma plugins can’t load — blocked by the proxy?',
    description: 'Figma plugins (Stark, Contrast, Autoflow) fail to load — the plugin panel shows “Network error”. Started after the proxy change on Monday.',
    category: 'software',
    priority: 'P3',
    status: 'waiting',
    requester: 'u-mei',
    assignee: 'u-layla',
    device: 'HX-MBP-0187',
    createdAgo: 26 * HOUR,
    responseAfter: 50 * MIN,
    pausedAgo: 3 * HOUR,
    events: [
      { kind: 'automation', ago: 26 * HOUR - MIN, body: 'Nova matched this to Monday’s web-filter change and routed it to the IT lead.' },
      { kind: 'assign', ago: 26 * HOUR - 10 * MIN, actor: 'u-layla', to: 'u-layla' },
      { kind: 'reply', ago: 25 * HOUR + 10 * MIN, actor: 'u-layla', body: 'Hi Mei! The new web filter flagged a couple of plugin CDN domains as “uncategorised”. I’ve allow-listed figma.com/plugin-cdn — can you check whether Stark works now?' },
      { kind: 'status', ago: 25 * HOUR + 10 * MIN, actor: 'u-layla', from: 'new', to: 'in_progress' },
      { kind: 'reply', ago: 20 * HOUR, actor: 'u-mei', body: 'Stark works now, but Autoflow and Contrast still fail.' },
      { kind: 'reply', ago: 3 * HOUR, actor: 'u-layla', body: 'Thanks — could you send me the exact error from Figma’s developer console (Plugins → Development → Show console)? A screenshot is perfect.' },
      { kind: 'status', ago: 3 * HOUR, actor: 'u-layla', from: 'in_progress', to: 'waiting' },
    ],
  },
  {
    id: 'HX-1037',
    subject: 'Fix mail & calendar sync',
    description: 'Ran the mail re-sync fix from Support Home.',
    category: 'email',
    priority: 'P4',
    urgency: 'low',
    status: 'resolved',
    requester: 'u-mei',
    device: 'HX-MBP-0187',
    createdAgo: 2 * DAY + 4 * MIN,
    responseAfter: 0,
    resolvedAgo: 2 * DAY,
    resolution: 'self_service',
    selfService: { playbookId: 'fix-mail', outcome: 'success' },
    events: [
      { kind: 'automation', ago: 2 * DAY + MIN, body: 'Nova re-synced mail & calendar on HX-MBP-0187 — 0 conflicts.' },
      { kind: 'status', ago: 2 * DAY, from: 'new', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1047',
    subject: 'Loaner laptop: can I keep it past the due date?',
    description: 'My contract was extended to the end of January. The loaner MacBook Air is due back in a few days — can I extend the loan, or should I return it and get a different machine?',
    category: 'hardware',
    priority: 'P4',
    urgency: 'low',
    status: 'new',
    requester: 'u-alex',
    device: 'HX-MBA-0419',
    createdAgo: 2 * HOUR,
    events: [{ kind: 'automation', ago: 2 * HOUR - MIN, body: 'Nova linked HX-MBA-0419 (loaner · due in 4 days) and suggested a loan extension.' }],
  },
  {
    id: 'HX-1048',
    subject: 'Suspicious sign-in alert from São Paulo',
    description: 'Got an alert about a sign-in from São Paulo at 07:40. I’m in New York and wasn’t online then.',
    category: 'security',
    priority: 'P1',
    urgency: 'high',
    status: 'in_progress',
    requester: 'u-noah',
    assignee: 'u-ethan',
    createdAgo: 50 * MIN,
    responseAfter: 9 * MIN,
    escalated: true,
    events: [
      { kind: 'automation', ago: 50 * MIN, body: 'Nova flagged a possible account takeover: sessions revoked, password reset enforced, Security paged.' },
      { kind: 'escalation', ago: 49 * MIN, body: 'Escalated to Security' },
      { kind: 'assign', ago: 48 * MIN, actor: 'u-ethan', to: 'u-ethan' },
      { kind: 'reply', ago: 41 * MIN, actor: 'u-ethan', body: 'Noah — I’ve revoked all your sessions and forced a password reset. Quick question: did you approve any MFA prompt around 07:40 your time?' },
      { kind: 'status', ago: 41 * MIN, actor: 'u-ethan', from: 'new', to: 'in_progress' },
      { kind: 'reply', ago: 30 * MIN, actor: 'u-noah', body: 'No! I got two push prompts while I was asleep and declined both.' },
      { kind: 'note', ago: 22 * MIN, actor: 'u-ethan', body: 'Classic MFA-fatigue attempt. Source IP in AS28573 (residential proxy). Blocked the range at the IdP and opened SOC case #8812.' },
    ],
  },
  {
    id: 'HX-1049',
    subject: 'VPN extremely slow from the Singapore office',
    description: 'VPN is extremely slow from the Singapore office — internal tools time out and Meet keeps freezing.',
    category: 'network',
    priority: 'P2',
    impact: 'team',
    status: 'triaged',
    requester: 'u-hana',
    assignee: 'u-layla',
    device: 'HX-MBA-0231',
    createdAgo: 110 * MIN,
    responseAfter: 18 * MIN,
    incidentId: 'INC-311',
    events: [
      { kind: 'automation', ago: 109 * MIN, body: 'Nova linked this to incident INC-311 · VPN degraded in Singapore.' },
      { kind: 'assign', ago: 100 * MIN, actor: 'u-layla', to: 'u-layla' },
      { kind: 'reply', ago: 92 * MIN, actor: 'u-layla', body: 'Thanks Hana — this is part of an ongoing incident with our Singapore VPN gateway. Traffic is being rerouted via Tokyo; I’ll update you here the moment it’s fixed.' },
      { kind: 'status', ago: 92 * MIN, actor: 'u-layla', from: 'new', to: 'triaged' },
    ],
  },
  {
    id: 'HX-1050',
    subject: 'Fake DocuSign email asking me to sign in',
    description: 'Got an email “Please DocuSign: Q4 vendor agreement” asking me to sign in with Helix SSO. The link goes to a weird domain.',
    category: 'security',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-grace',
    assignee: 'u-ethan',
    createdAgo: 6 * DAY,
    responseAfter: 25 * MIN,
    resolvedAgo: 6 * DAY - 2 * HOUR,
    resolution: 'fixed',
    csat: { score: 5, comment: 'Super fast, thank you!' },
    events: [
      { kind: 'automation', ago: 6 * DAY - MIN, body: 'Nova: headers fail SPF/DMARC · link → credential-harvest page. Quarantined 11 copies.' },
      { kind: 'reply', ago: 6 * DAY - 25 * MIN, actor: 'u-ethan', body: 'Great catch, Grace! It was a phishing attempt. We’ve blocked docusign-helix[.]com and removed the message from all inboxes. You don’t need to do anything else.' },
      { kind: 'status', ago: 6 * DAY - 2 * HOUR, actor: 'u-ethan', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1036',
    subject: 'London 3F printer jams on double-sided jobs',
    description: 'LON-3F-01 jams on every double-sided job — single-sided is fine.',
    category: 'hardware',
    priority: 'P3',
    impact: 'team',
    urgency: 'low',
    status: 'in_progress',
    requester: 'u-daniel',
    assignee: 'u-mateo',
    createdAgo: 27 * HOUR,
    responseAfter: 2 * HOUR,
    events: [
      { kind: 'reply', ago: 25 * HOUR, actor: 'u-mateo', body: 'Thanks Daniel — the duplex unit needs a new roller. Canon’s engineer is booked for tomorrow 10:00. Meanwhile LON-3F-02 next to the kitchen works fine.' },
      { kind: 'status', ago: 25 * HOUR, actor: 'u-mateo', from: 'new', to: 'in_progress' },
    ],
  },
  {
    id: 'HX-1051',
    subject: 'Salesforce invites don’t show up in my calendar',
    description: 'Meeting invites sent from Salesforce don’t show up in my calendar — customers think I ignored them.',
    category: 'email',
    priority: 'P3',
    status: 'waiting',
    requester: 'u-yusuf',
    assignee: 'u-layla',
    device: 'HX-LAP-0221',
    createdAgo: 2 * DAY,
    responseAfter: HOUR,
    pausedAgo: 2 * DAY - HOUR,
    events: [
      { kind: 'reply', ago: 2 * DAY - HOUR, actor: 'u-layla', body: 'Hi Yusuf, could you forward one of those invites as an attachment so I can check the headers?' },
      { kind: 'status', ago: 2 * DAY - HOUR, actor: 'u-layla', from: 'new', to: 'waiting' },
    ],
  },
  {
    id: 'HX-1052',
    subject: 'Need access to the Grafana production dashboards',
    description: 'I need view access to the Grafana production dashboards for the data-pipeline on-call rotation that starts next week.',
    category: 'access',
    priority: 'P3',
    status: 'new',
    requester: 'u-kwame',
    createdAgo: 35 * MIN,
    events: [{ kind: 'automation', ago: 34 * MIN, body: 'Nova: access request with no Catalog item — routed to IT. Suggested approver: Omar Khalid (manager).' }],
  },
  {
    id: 'HX-1039',
    subject: 'Docker Desktop says my licence expired',
    description: 'Docker Desktop says my licence expired and won’t start containers — I can’t run the local stack.',
    category: 'software',
    priority: 'P3',
    status: 'in_progress',
    requester: 'u-priya',
    assignee: 'u-layla',
    device: 'HX-MBP-0145',
    createdAgo: 20 * HOUR,
    responseAfter: 50 * MIN,
    events: [
      { kind: 'reply', ago: 19 * HOUR, actor: 'u-layla', body: 'Hi Priya — our Docker Business seats were re-assigned during the renewal. I’ve requested a seat for you; it should activate within a day. OrbStack works in the meantime.' },
      { kind: 'status', ago: 19 * HOUR, actor: 'u-layla', from: 'new', to: 'in_progress' },
      { kind: 'note', ago: 16 * HOUR, actor: 'u-layla', body: 'Waiting on Docker to add 5 seats to the PO — Finance approved.' },
    ],
  },
  {
    id: 'HX-1024',
    subject: 'MacBook battery swelling — trackpad won’t click',
    description: 'My MacBook’s trackpad won’t click and the case is bulging near the hinge.',
    category: 'hardware',
    priority: 'P2',
    urgency: 'high',
    status: 'resolved',
    requester: 'u-lucas',
    assignee: 'u-mateo',
    device: 'HX-MBP-0098',
    createdAgo: 8 * DAY,
    responseAfter: 20 * MIN,
    resolvedAgo: 6 * DAY,
    resolution: 'replaced',
    csat: { score: 5, comment: 'Swapped in 30 minutes. Amazing.' },
    events: [
      { kind: 'reply', ago: 8 * DAY - 20 * MIN, actor: 'u-mateo', body: 'Stop using it right away and keep it unplugged — that’s a swollen battery. Bring it to the IT bar; I’ll have a replacement ready in 30 minutes.' },
      { kind: 'status', ago: 8 * DAY - 20 * MIN, actor: 'u-mateo', from: 'new', to: 'in_progress' },
      { kind: 'automation', ago: 6 * DAY + 5 * MIN, body: 'HX-MBP-0160 assigned to Lucas Meyer · HX-MBP-0098 sent to Apple for repair.' },
      { kind: 'reply', ago: 6 * DAY, actor: 'u-mateo', body: 'You’re all set with a new MacBook Pro 16 — files restored from backup. The old one is off to Apple.' },
      { kind: 'status', ago: 6 * DAY, actor: 'u-mateo', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1053',
    subject: 'Laptop fans at 100% all day and very sluggish',
    description: 'My laptop fans are at 100% all day and it’s very sluggish, even with only Figma and Chrome open.',
    category: 'hardware',
    priority: 'P3',
    status: 'new',
    requester: 'u-sofia',
    device: 'HX-MBP-0211',
    createdAgo: 3 * HOUR,
    events: [{ kind: 'automation', ago: 3 * HOUR - MIN, body: 'Nova diagnostics: disk 93% full · CPU 94°C. Suggested fix: Speed up my laptop.' }],
  },
  {
    id: 'HX-1043',
    subject: 'Dock doesn’t wake my external monitor',
    description: 'My Dell dock doesn’t wake the external monitor after lunch — I have to unplug it every time.',
    category: 'hardware',
    priority: 'P3',
    status: 'triaged',
    requester: 'u-aisha',
    assignee: 'u-mateo',
    device: 'HX-DCK-0172',
    createdAgo: 6 * HOUR,
    responseAfter: HOUR,
    events: [
      { kind: 'automation', ago: 6 * HOUR - MIN, body: 'Nova: HX-DCK-0172 firmware out of date (01.00.14 → 01.00.20).' },
      { kind: 'assign', ago: 5 * HOUR + 10 * MIN, actor: 'u-mateo', to: 'u-mateo' },
      { kind: 'reply', ago: 5 * HOUR, actor: 'u-mateo', body: 'Hi Aisha — I’ll push the dock firmware update tonight after 7pm. Please leave the dock connected and your Mac plugged in.' },
      { kind: 'status', ago: 5 * HOUR, actor: 'u-mateo', from: 'new', to: 'triaged' },
    ],
  },
  {
    id: 'HX-1028',
    subject: 'Camera not detected in Meet',
    description: 'Meet says “No camera found” — FaceTime works fine.',
    category: 'hardware',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-fatima',
    assignee: 'u-mateo',
    device: 'HX-MBA-0191',
    createdAgo: 4 * DAY + 3 * HOUR,
    responseAfter: 15 * MIN,
    resolvedAgo: 4 * DAY,
    resolution: 'fixed',
    csat: { score: 5, comment: 'Fixed before my next call — thanks Mateo!' },
    events: [
      { kind: 'reply', ago: 4 * DAY + 3 * HOUR - 15 * MIN, actor: 'u-mateo', body: 'Chrome lost camera permission after the last update. System Settings → Privacy & Security → Camera → enable Google Chrome, then restart Chrome.' },
      { kind: 'reply', ago: 4 * DAY + 10 * MIN, actor: 'u-fatima', body: 'That did it, thank you!' },
      { kind: 'status', ago: 4 * DAY, actor: 'u-mateo', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1033',
    subject: 'Locked out after password reset',
    description: 'Reset my password this morning and now every sign-in says “account locked”.',
    category: 'access',
    priority: 'P2',
    urgency: 'high',
    status: 'resolved',
    requester: 'u-yusuf',
    assignee: 'u-layla',
    createdAgo: 2 * DAY + 2 * HOUR,
    responseAfter: 12 * MIN,
    resolvedAgo: 2 * DAY + HOUR,
    resolution: 'fixed',
    csat: { score: 4 },
    events: [
      { kind: 'reply', ago: 2 * DAY + 2 * HOUR - 12 * MIN, actor: 'u-layla', body: 'Your old password was still saved in Outlook on your phone and kept tripping the lockout. I’ve unlocked the account — please update the password on your phone first.' },
      { kind: 'status', ago: 2 * DAY + HOUR, actor: 'u-layla', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1027',
    subject: 'New phone — move my authenticator',
    description: 'Upgraded my phone and the authenticator app didn’t come across.',
    category: 'access',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-sara',
    assignee: 'u-layla',
    createdAgo: 5 * DAY + 2 * HOUR,
    responseAfter: 30 * MIN,
    resolvedAgo: 5 * DAY,
    resolution: 'fixed',
    csat: { score: 5 },
    events: [
      { kind: 'reply', ago: 5 * DAY + 90 * MIN, actor: 'u-layla', body: 'I’ve issued a one-time bypass code by SMS. Sign in, then go to Helix ID → Security → Add authenticator and scan the QR code with your new phone.' },
      { kind: 'status', ago: 5 * DAY, actor: 'u-layla', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1019',
    subject: 'New hire setup: Kwame Mensah (Data Engineer)',
    description: 'Kwame starts on Monday — please prepare a MacBook Pro 14, YubiKey, GitHub + BigQuery access.',
    category: 'access',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-sara',
    assignee: 'u-mateo',
    createdAgo: 33 * DAY,
    responseAfter: HOUR,
    resolvedAgo: 27 * DAY,
    resolution: 'fixed',
    csat: { score: 5, comment: 'Kwame was productive on day one.' },
    events: [
      { kind: 'reply', ago: 33 * DAY - HOUR, actor: 'u-mateo', body: 'On it — zero-touch kit ordered (HX-MBP-0431 + HX-KEY-0432). Accounts will be ready Friday.' },
      { kind: 'status', ago: 27 * DAY, actor: 'u-mateo', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1012',
    subject: 'Lost iPhone in a taxi',
    description: 'Left my work iPhone in a taxi last night in Manhattan.',
    category: 'security',
    priority: 'P1',
    urgency: 'high',
    status: 'resolved',
    requester: 'u-noah',
    assignee: 'u-ethan',
    device: 'HX-PHN-0112',
    createdAgo: 34 * DAY,
    responseAfter: 6 * MIN,
    resolvedAgo: 33 * DAY,
    resolution: 'replaced',
    escalated: true,
    csat: { score: 4 },
    events: [
      { kind: 'automation', ago: 34 * DAY - MIN, body: 'Remote lock sent to HX-PHN-0112 · Activation Lock on · Find My enabled.' },
      { kind: 'reply', ago: 34 * DAY - 6 * MIN, actor: 'u-ethan', body: 'Locked and tracked — it went offline near Penn Station. We’ll wipe it in 24h if it doesn’t turn up. A replacement is on its way.' },
      { kind: 'automation', ago: 33 * DAY + HOUR, body: 'MDM wipe completed on HX-PHN-0112 · recovery keys rotated.' },
      { kind: 'status', ago: 33 * DAY, actor: 'u-ethan', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1054',
    subject: 'Salesforce keeps looping back to the sign-in page',
    description: 'Since this morning Salesforce bounces me back to the SSO page in an endless loop.',
    category: 'access',
    priority: 'P2',
    urgency: 'high',
    status: 'new',
    requester: 'u-grace',
    device: 'HX-LAP-0251',
    createdAgo: 140 * MIN,
    events: [{ kind: 'automation', ago: 139 * MIN, body: 'Nova: the Salesforce SSO certificate was rotated last night — likely a stale session.' }],
  },
  {
    id: 'HX-1044',
    subject: 'YubiKey not recognised on my Linux workstation',
    description: 'YubiKey 5C isn’t recognised on my Fedora workstation for SSH (FIDO2 resident keys).',
    category: 'hardware',
    priority: 'P3',
    status: 'waiting',
    requester: 'u-ethan',
    assignee: 'u-layla',
    device: 'HX-KEY-0203',
    createdAgo: 3 * DAY,
    responseAfter: 2 * HOUR,
    pausedAgo: 2 * DAY + 20 * HOUR,
    events: [
      { kind: 'reply', ago: 2 * DAY + 20 * HOUR, actor: 'u-layla', body: 'Hey Ethan — sounds like the udev rules didn’t ship with Fedora 41. Can you run `ykman info` and paste the output?' },
      { kind: 'status', ago: 2 * DAY + 20 * HOUR, actor: 'u-layla', from: 'new', to: 'waiting' },
    ],
  },
  {
    id: 'HX-1040',
    subject: 'Can’t push to GitHub — SSO authorization required',
    description: 'git push fails with “SAML SSO authorization required” for helix-platform repos.',
    category: 'access',
    priority: 'P2',
    status: 'resolved',
    requester: 'u-priya',
    assignee: 'u-layla',
    createdAgo: 2 * DAY + 5 * HOUR,
    responseAfter: 25 * MIN,
    resolvedAgo: 2 * DAY + 4 * HOUR,
    resolution: 'fixed',
    csat: { score: 4 },
    events: [
      { kind: 'reply', ago: 2 * DAY + 5 * HOUR - 25 * MIN, actor: 'u-layla', body: 'Your token needed SSO authorization for the helix-platform org. I’ve re-authorized it — try pushing again.' },
      { kind: 'status', ago: 2 * DAY + 4 * HOUR, actor: 'u-layla', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1038',
    subject: 'Reset passkey',
    description: 'Ran the Reset passkey fix from Support Home.',
    category: 'access',
    priority: 'P4',
    urgency: 'low',
    status: 'resolved',
    requester: 'u-kwame',
    device: 'HX-MBP-0431',
    createdAgo: 9 * DAY + 3 * MIN,
    responseAfter: 0,
    resolvedAgo: 9 * DAY,
    resolution: 'self_service',
    selfService: { playbookId: 'reset-passkey', outcome: 'success' },
    events: [
      { kind: 'automation', ago: 9 * DAY + MIN, body: 'Nova registered a new passkey and renewed device trust for 30 days.' },
      { kind: 'status', ago: 9 * DAY, from: 'new', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1056',
    subject: 'Need a Miro board exported for the Q4 workshop',
    description: 'Could someone export our Growth Q4 Miro board as a high-res PDF? The export keeps timing out.',
    category: 'software',
    priority: 'P4',
    urgency: 'low',
    status: 'new',
    requester: 'u-aisha',
    createdAgo: 30 * MIN,
    events: [],
  },
  {
    id: 'HX-1035',
    subject: 'Headset mic sounds robotic in calls',
    description: 'People say my voice sounds robotic on my Jabra headset in every call.',
    category: 'hardware',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-hana',
    assignee: 'u-mateo',
    device: 'HX-HDS-0232',
    createdAgo: 6 * DAY,
    responseAfter: 3 * HOUR,
    resolvedAgo: 3 * DAY,
    resolution: 'replaced',
    csat: { score: 3, comment: 'Took a while, but the new headset works great.' },
    events: [
      { kind: 'reply', ago: 6 * DAY - 3 * HOUR, actor: 'u-mateo', body: 'Sounds like a failing mic boom. I’ll courier a new Evolve2 75 to the Singapore office.' },
      { kind: 'status', ago: 3 * DAY, actor: 'u-mateo', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1041',
    subject: 'Ledger add-in for Excel crashes on launch',
    description: 'The Ledger add-in for Excel crashes on launch since this morning — I can’t run the month-end close reports.',
    category: 'software',
    priority: 'P2',
    impact: 'team',
    status: 'in_progress',
    requester: 'u-daniel',
    assignee: 'u-layla',
    device: 'HX-LAP-0158',
    createdAgo: 9 * HOUR,
    responseAfter: 3 * HOUR,
    events: [
      { kind: 'automation', ago: 9 * HOUR - MIN, body: 'Nova: 4 similar reports from Finance today — possible bad vendor update.' },
      { kind: 'reply', ago: 6 * HOUR, actor: 'u-layla', body: 'Hi Daniel — the vendor pushed a broken update (v7.3.0). We’re rolling everyone back to 7.2.4 via Intune; you should see it within the hour.' },
      { kind: 'status', ago: 6 * HOUR, actor: 'u-layla', from: 'new', to: 'in_progress' },
      { kind: 'reply', ago: 4 * HOUR, actor: 'u-daniel', body: 'Still on 7.3.0 here and still crashing.' },
      { kind: 'note', ago: 3 * HOUR, actor: 'u-layla', body: 'Intune rollback stuck for 12 London devices — re-pushing with a forced reboot window.' },
    ],
  },
  {
    id: 'HX-1032',
    subject: 'Adobe CC keeps asking me to sign in',
    description: 'Creative Cloud asks me to sign in every time I open Photoshop.',
    category: 'software',
    priority: 'P3',
    status: 'resolved',
    requester: 'u-sofia',
    assignee: 'u-layla',
    device: 'HX-MBP-0211',
    createdAgo: 3 * DAY + 5 * HOUR,
    responseAfter: 2 * HOUR,
    resolvedAgo: 3 * DAY,
    resolution: 'fixed',
    csat: { score: 4 },
    events: [
      { kind: 'reply', ago: 3 * DAY + 3 * HOUR, actor: 'u-layla', body: 'Your Adobe licence moved to the new SSO profile. Sign out of Creative Cloud, then sign back in with “Company or school account”.' },
      { kind: 'status', ago: 3 * DAY, actor: 'u-layla', from: 'in_progress', to: 'resolved' },
    ],
  },
  {
    id: 'HX-1058',
    subject: 'PagerDuty stopped getting push notifications',
    description: 'PagerDuty on my iPhone stopped receiving push notifications — I’m primary on-call this week.',
    category: 'software',
    priority: 'P2',
    urgency: 'high',
    status: 'in_progress',
    requester: 'u-lucas',
    assignee: 'u-layla',
    device: 'HX-PHN-0162',
    createdAgo: 90 * MIN,
    responseAfter: 20 * MIN,
    events: [
      { kind: 'reply', ago: 70 * MIN, actor: 'u-layla', body: 'Hi Lucas — Focus filters were reset by the iOS 18.2 MDM profile. I’m pushing a fix that allow-lists PagerDuty; please confirm in 10 minutes.' },
      { kind: 'status', ago: 70 * MIN, actor: 'u-layla', from: 'new', to: 'in_progress' },
    ],
  },
];

function buildTicket(s: TicketSeed, now: number): Ticket {
  const createdAt = now - s.createdAgo;
  const events: TicketEvent[] = [
    { id: `${s.id}-e0`, at: createdAt, kind: 'created', actorId: s.requester, body: s.description },
    ...s.events.map((e, i) => ({ id: `${s.id}-e${i + 1}`, at: now - e.ago, kind: e.kind, actorId: e.actor, body: e.body, from: e.from, to: e.to })),
  ];
  const resolvedAt = s.resolvedAgo !== undefined ? now - s.resolvedAgo : undefined;
  if (s.csat && resolvedAt) events.push({ id: `${s.id}-csat`, at: resolvedAt + (s.csat.agoAfterResolve ?? 3 * HOUR), kind: 'csat', actorId: s.requester, body: s.csat.comment, to: String(s.csat.score) });
  events.sort((a, b) => a.at - b.at);
  const lastAt = events[events.length - 1].at;
  return {
    id: s.id,
    subject: s.subject,
    description: s.description,
    category: s.category,
    priority: s.priority,
    impact: s.impact ?? 'me',
    urgency: s.urgency ?? 'normal',
    status: s.status,
    requesterId: s.requester,
    assigneeId: s.assignee,
    deviceTag: s.device,
    createdAt,
    updatedAt: lastAt,
    firstResponseAt: s.responseAfter !== undefined ? createdAt + s.responseAfter : undefined,
    resolvedAt,
    pausedAt: s.status === 'waiting' && s.pausedAgo !== undefined ? now - s.pausedAgo : undefined,
    pausedMs: 0,
    resolution: s.resolution ? { code: s.resolution } : undefined,
    csat: s.csat && resolvedAt ? { score: s.csat.score, comment: s.csat.comment, at: resolvedAt + (s.csat.agoAfterResolve ?? 3 * HOUR) } : undefined,
    events,
    escalated: s.escalated,
    selfService: s.selfService,
    incidentId: s.incidentId,
  };
}

/* =========================================================================
   Catalog & requests
   ========================================================================= */

export const SEED_CATALOG: CatalogItem[] = [
  {
    id: 'cat-mbp14',
    kind: 'hardware',
    name: 'MacBook Pro 14"',
    vendor: 'Apple · M4 Pro',
    blurb: 'The standard Helix laptop — fast, quiet, all-day battery.',
    description: 'M4 Pro, 1 TB SSD, zero-touch enrolment: sign in on day one and everything installs itself. Includes USB-C charger and a sleeve.',
    deviceKind: 'laptop',
    accent: '#94a3b8',
    cost: 2399,
    billing: 'one-time',
    etaDays: 3,
    options: [
      { id: 'memory', label: 'Memory', choices: ['24 GB', '48 GB'] },
      { id: 'keyboard', label: 'Keyboard', choices: ['English (US)', 'English (UK)', 'Arabic'] },
    ],
    stockModel: 'MacBook Pro 14"',
    popular: true,
  },
  {
    id: 'cat-mbp16',
    kind: 'hardware',
    name: 'MacBook Pro 16"',
    vendor: 'Apple · M4 Max',
    blurb: 'Workstation power for builds, ML and 3D.',
    description: 'M4 Max, 64 GB memory, 2 TB SSD. Standard for Engineering and Design; others can request it with a reason.',
    deviceKind: 'laptop',
    accent: '#64748b',
    cost: 3999,
    billing: 'one-time',
    etaDays: 5,
    departments: ['Engineering', 'Design'],
    stockModel: 'MacBook Pro 16"',
  },
  {
    id: 'cat-xps13',
    kind: 'hardware',
    name: 'Dell XPS 13 · Ubuntu',
    vendor: 'Dell · Developer Edition',
    blurb: 'A light Linux machine, certified for Ubuntu 24.04.',
    description: 'Core Ultra 7, 32 GB, 1 TB. Ships with Ubuntu 24.04 LTS, LUKS encryption and our Linux MDM agent.',
    deviceKind: 'laptop',
    accent: '#38bdf8',
    cost: 1699,
    billing: 'one-time',
    etaDays: 4,
    departments: ['Engineering', 'IT & Security'],
    stockModel: 'Dell XPS 13',
  },
  {
    id: 'cat-display',
    kind: 'hardware',
    name: '27" 5K display',
    vendor: 'LG UltraFine · Apple Studio Display',
    blurb: 'Retina-sharp second screen with a single-cable connection.',
    description: '5120×2880, Thunderbolt/USB-C with charging. Pick the LG for value or the Studio Display for its camera and speakers.',
    deviceKind: 'monitor',
    accent: '#a78bfa',
    cost: 1299,
    billing: 'one-time',
    etaDays: 2,
    options: [{ id: 'model', label: 'Model', choices: ['LG UltraFine 5K', 'Apple Studio Display'] }],
    popular: true,
  },
  {
    id: 'cat-dock',
    kind: 'hardware',
    name: 'Thunderbolt dock',
    vendor: 'CalDigit TS4',
    blurb: 'One cable for power, displays, Ethernet and USB.',
    description: '18 ports, 98 W charging, 2.5 GbE. Works with every Helix laptop.',
    deviceKind: 'dock',
    accent: '#22d3ee',
    cost: 399,
    billing: 'one-time',
    etaDays: 2,
  },
  {
    id: 'cat-keyboard',
    kind: 'hardware',
    name: 'Magic Keyboard with Touch ID',
    vendor: 'Apple',
    blurb: 'Unlock and approve passkeys without reaching for your laptop.',
    description: 'Wireless keyboard with Touch ID for Apple silicon Macs. English (US) layout by default.',
    deviceKind: 'keyboard',
    accent: '#cbd5e1',
    cost: 199,
    billing: 'one-time',
    etaDays: 1,
  },
  {
    id: 'cat-headset',
    kind: 'hardware',
    name: 'Jabra Evolve2 65',
    vendor: 'Jabra',
    blurb: 'Noise-cancelling wireless headset certified for Meet and Zoom.',
    description: 'All-day battery, busy light, USB-C dongle. Available to contractors.',
    deviceKind: 'headset',
    accent: '#fb923c',
    cost: 279,
    billing: 'one-time',
    etaDays: 2,
    contractors: true,
  },
  {
    id: 'cat-yubikey',
    kind: 'hardware',
    name: 'YubiKey 5C NFC',
    vendor: 'Yubico',
    blurb: 'Phishing-proof sign-in with a tap.',
    description: 'FIDO2 security key for SSO, GitHub and SSH. Everyone should have a primary and a backup key.',
    deviceKind: 'security-key',
    accent: '#fbbf24',
    cost: 55,
    billing: 'one-time',
    etaDays: 1,
    contractors: true,
    popular: true,
  },
  {
    id: 'cat-iphone',
    kind: 'hardware',
    name: 'iPhone 16',
    vendor: 'Apple · 128 GB',
    blurb: 'Managed phone for on-call, field and customer-facing roles.',
    description: 'Supervised via MDM with eSIM and a corporate plan. Standard for Sales, Customer Success and IT; others need a reason (e.g. on-call).',
    deviceKind: 'phone',
    accent: '#f472b6',
    cost: 899,
    billing: 'one-time',
    etaDays: 3,
    departments: ['Sales', 'Customer Success', 'IT & Security'],
  },
  {
    id: 'cat-figma',
    kind: 'software',
    name: 'Figma Professional',
    vendor: 'Figma',
    blurb: 'Editor seat for design files, prototypes and Dev Mode.',
    description: 'Viewer seats are free for everyone. Editor seats are standard for Design, Product and Marketing.',
    icon: 'figma',
    accent: '#f472b6',
    cost: 180,
    billing: 'yearly',
    etaDays: 0,
    departments: ['Design', 'Product', 'Marketing'],
    contractors: true,
    popular: true,
  },
  {
    id: 'cat-jetbrains',
    kind: 'software',
    name: 'JetBrains All Products',
    vendor: 'JetBrains',
    blurb: 'IntelliJ IDEA, GoLand, PyCharm, DataGrip and more.',
    description: 'Licence server seat — activates in the Toolbox app with your Helix SSO.',
    icon: 'code',
    accent: '#a78bfa',
    cost: 289,
    billing: 'yearly',
    etaDays: 0,
    departments: ['Engineering'],
  },
  {
    id: 'cat-adobe',
    kind: 'software',
    name: 'Adobe Creative Cloud',
    vendor: 'Adobe · All Apps',
    blurb: 'Photoshop, Illustrator, Premiere Pro, After Effects…',
    description: 'All Apps plan with 1 TB cloud storage. Standard for Design and Marketing.',
    icon: 'palette',
    accent: '#fb7185',
    cost: 660,
    billing: 'yearly',
    etaDays: 1,
    departments: ['Design', 'Marketing'],
  },
  {
    id: 'cat-docker',
    kind: 'software',
    name: 'Docker Desktop',
    vendor: 'Docker · Business',
    blurb: 'Containers on your laptop, with SSO and image access management.',
    description: 'Business seat with registry access controls. OrbStack remains available as a free alternative.',
    icon: 'container',
    accent: '#38bdf8',
    cost: 288,
    billing: 'yearly',
    etaDays: 0,
    departments: ['Engineering', 'IT & Security'],
    contractors: true,
  },
  {
    id: 'cat-miro',
    kind: 'software',
    name: 'Miro Business',
    vendor: 'Miro',
    blurb: 'Infinite whiteboards for workshops and planning.',
    description: 'Business seat in the Helix workspace — private boards, unlimited exports.',
    icon: 'presentation',
    accent: '#fbbf24',
    cost: 96,
    billing: 'yearly',
    etaDays: 0,
    contractors: true,
  },
  {
    id: 'cat-github',
    kind: 'access',
    name: 'GitHub · helix-platform',
    vendor: 'GitHub Enterprise',
    blurb: 'Write access to a team in the helix-platform org.',
    description: 'Added to the team you pick, with SSO enforcement. Contractor access is time-boxed to 90 days.',
    icon: 'git',
    accent: '#94a3b8',
    cost: 0,
    billing: 'free',
    etaDays: 0,
    options: [{ id: 'team', label: 'Team', choices: ['Platform', 'Web', 'Data', 'Mobile'] }],
    departments: ['Engineering', 'IT & Security'],
    contractors: true,
  },
  {
    id: 'cat-aws',
    kind: 'access',
    name: 'AWS sandbox account',
    vendor: 'Amazon Web Services',
    blurb: 'Personal sandbox with a $300/month budget guardrail.',
    description: 'An isolated account in the Sandbox OU, auto-nuked every 30 days. Not for customer data.',
    icon: 'cloud',
    accent: '#fb923c',
    cost: 0,
    billing: 'free',
    etaDays: 1,
    departments: ['Engineering', 'IT & Security'],
    strictDepartments: true,
  },
  {
    id: 'cat-salesforce',
    kind: 'access',
    name: 'Salesforce',
    vendor: 'Salesforce · Sales Cloud',
    blurb: 'CRM seat with your team’s profile and dashboards.',
    description: 'Standard for Sales, Customer Success, Marketing and Finance.',
    icon: 'crm',
    accent: '#38bdf8',
    cost: 900,
    billing: 'yearly',
    etaDays: 1,
    departments: ['Sales', 'Customer Success', 'Marketing', 'Finance'],
  },
  {
    id: 'cat-proddb',
    kind: 'access',
    name: 'Production DB · read-only',
    vendor: 'PostgreSQL via Teleport',
    blurb: 'Time-boxed, audited read access to a production cluster.',
    description: 'Session-recorded access through Teleport. Requires manager, IT and Security approval; expires automatically.',
    icon: 'database',
    accent: '#fb7185',
    cost: 0,
    billing: 'free',
    etaDays: 1,
    options: [
      { id: 'cluster', label: 'Cluster', choices: ['orders-prod', 'ledger-prod', 'analytics-prod'] },
      { id: 'duration', label: 'Duration', choices: ['7 days', '30 days', '90 days'] },
    ],
    sensitive: true,
    departments: ['Engineering', 'IT & Security'],
    strictDepartments: true,
  },
];

function req(
  id: string,
  itemId: string,
  requesterId: string,
  createdAgo: number,
  justification: string,
  steps: ApprovalStep[],
  status: CatalogRequest['status'],
  now: number,
  extra: Partial<CatalogRequest> = {},
): CatalogRequest {
  const updated = Math.max(now - createdAgo, ...steps.map((s) => s.decidedAt ?? 0), extra.fulfilment?.at ?? 0);
  return { id, itemId, requesterId, options: {}, justification, status, steps, createdAt: now - createdAgo, updatedAt: updated, ...extra };
}

function seedRequests(now: number): CatalogRequest[] {
  const ok = (role: ApprovalStep['role'], by: string, ago: number, extra: Partial<ApprovalStep> = {}): ApprovalStep => ({ role, state: 'approved', decidedBy: by, decidedAt: now - ago, ...extra });
  return [
    req('REQ-2041', 'cat-adobe', 'u-hana', 20 * HOUR, 'Editing research session videos into highlight reels for the onboarding study.', [{ role: 'manager', approverId: 'u-omar', state: 'pending' }, { role: 'it', state: 'waiting' }], 'pending', now),
    req('REQ-2044', 'cat-github', 'u-alex', 3 * HOUR, 'Need write access to helix-platform/web for the onboarding redesign tickets.', [{ role: 'manager', approverId: 'u-omar', state: 'pending' }, { role: 'it', state: 'waiting' }], 'pending', now, { options: { team: 'Web' } }),
    req('REQ-2046', 'cat-dock', 'u-daniel', 70 * MIN, 'Hot-desking on 3F — a dock would save me re-plugging four cables every morning.', [{ role: 'manager', approverId: 'u-layla', state: 'pending' }, { role: 'it', state: 'waiting' }], 'pending', now),
    req('REQ-2038', 'cat-display', 'u-mei', 2 * DAY, 'Second display for prototyping and design reviews.', [ok('manager', 'u-omar', DAY, { approverId: 'u-omar', note: 'Approved — go for it.' }), { role: 'it', state: 'pending' }], 'pending', now, { options: { model: 'Apple Studio Display' } }),
    req('REQ-2042', 'cat-jetbrains', 'u-kwame', 26 * HOUR, 'DataGrip for the warehouse migration and PyCharm for Airflow DAGs.', [ok('manager', 'u-omar', 20 * HOUR, { approverId: 'u-omar' }), { role: 'it', state: 'pending' }], 'pending', now),
    req('REQ-2035', 'cat-proddb', 'u-priya', 3 * DAY, 'Investigating the checkout latency regression — need to inspect slow query plans on orders-prod.', [ok('manager', 'u-omar', 2 * DAY, { approverId: 'u-omar' }), ok('it', 'u-layla', DAY, { note: 'Teleport role scoped to orders-prod.' }), { role: 'security', state: 'pending' }], 'pending', now, { options: { cluster: 'orders-prod', duration: '30 days' } }),
    req('REQ-2040', 'cat-keyboard', 'u-aisha', 2 * DAY, 'Touch ID keyboard for passkey approvals when docked.', [ok('manager', 'u-layla', 2 * DAY - 2 * HOUR, { approverId: 'u-layla' }), ok('it', 'u-layla', DAY + 4 * HOUR)], 'approved', now),
    req('REQ-2030', 'cat-iphone', 'u-omar', 24 * DAY, 'Primary on-call for platform incidents — need a managed phone for PagerDuty.', [ok('manager', 'u-layla', 23 * DAY, { approverId: 'u-layla' }), ok('it', 'u-layla', 22 * DAY)], 'fulfilled', now, {
      fulfilment: { at: now - 19 * DAY, by: 'u-mateo', deviceTag: 'HX-PHN-0451', note: 'eSIM activated, PagerDuty pre-installed.' },
    }),
    req('REQ-2029', 'cat-mbp14', 'u-kwame', 30 * DAY, 'New hire — Data Engineer starting Monday.', [ok('manager', 'u-omar', 30 * DAY - HOUR, { approverId: 'u-omar' }), ok('it', 'u-mateo', 29 * DAY)], 'fulfilled', now, {
      options: { memory: '48 GB', keyboard: 'English (US)' },
      fulfilment: { at: now - 28 * DAY, by: 'u-mateo', deviceTag: 'HX-MBP-0431', note: 'Zero-touch kit shipped to Accra.' },
    }),
    req('REQ-2033', 'cat-miro', 'u-sofia', 9 * DAY, 'Workshop boards for the brand sprint.', [{ role: 'manager', approverId: 'u-aisha', state: 'denied', decidedBy: 'u-aisha', decidedAt: now - 8 * DAY, note: 'Use the Marketing team workspace — I’ve added you as an editor.' }, { role: 'it', state: 'waiting' }], 'denied', now),
  ];
}

/* =========================================================================
   Status
   ========================================================================= */

function uptimeSeries(id: string, dips: Record<number, number>): number[] {
  const r = rng(hashString(`up:${id}`));
  return Array.from({ length: 90 }, (_, i) => {
    const daysAgo = 89 - i;
    if (dips[daysAgo] !== undefined) return dips[daysAgo];
    const v = r();
    if (v > 0.96) return Math.round((99.2 + r() * 0.7) * 100) / 100;
    if (v > 0.9) return Math.round((99.85 + r() * 0.14) * 100) / 100;
    return 100;
  });
}

const SEED_SERVICES: Omit<Service, 'uptime'>[] = [
  { id: 'sso', name: 'Helix ID (SSO)', group: 'Identity', description: 'Single sign-on, passkeys and MFA' },
  { id: 'vpn', name: 'Helix Connect VPN', group: 'Network', description: 'Remote access to internal tools' },
  { id: 'mail', name: 'Email & Calendar', group: 'Collaboration', description: 'Outlook, shared mailboxes, calendars' },
  { id: 'wifi-dub', name: 'Wi-Fi · Dubai HQ', group: 'Network', description: 'Helix-Corp and Guest networks', office: 'Dubai' },
  { id: 'wifi-lon', name: 'Wi-Fi · London', group: 'Network', description: 'Helix-Corp and Guest networks', office: 'London' },
  { id: 'wifi-sin', name: 'Wi-Fi · Singapore', group: 'Network', description: 'Helix-Corp and Guest networks', office: 'Singapore' },
  { id: 'github', name: 'GitHub', group: 'Engineering', description: 'Source control, Actions and Packages' },
  { id: 'pulse', name: 'Pulse Chat', group: 'Collaboration', description: 'Messaging, huddles and channels' },
  { id: 'drive', name: 'Helix Drive', group: 'Collaboration', description: 'Files, shared drives and sync' },
  { id: 'print', name: 'Printing', group: 'Workplace', description: 'Follow-me print in every office' },
];

const UPTIME_DIPS: Record<string, Record<number, number>> = {
  vpn: { 0: 97.6, 23: 99.4 },
  mail: { 12: 96.8 },
  sso: { 31: 98.1 },
  'wifi-lon': { 48: 91.7, 49: 99.1 },
  github: { 17: 99.3, 61: 98.9 },
  print: { 5: 99.0, 33: 98.4 },
};

function seedIncidents(now: number): Incident[] {
  return [
    {
      id: 'INC-311',
      title: 'VPN degraded in Singapore',
      serviceIds: ['vpn'],
      severity: 'minor',
      status: 'identified',
      startedAt: now - 130 * MIN,
      offices: ['Singapore'],
      updates: [
        { id: 'iu-311-1', at: now - 130 * MIN, status: 'investigating', body: 'We’re investigating slow VPN connections and timeouts for people in Singapore.', authorId: 'u-layla' },
        { id: 'iu-311-2', at: now - 85 * MIN, status: 'identified', body: 'Our upstream provider has packet loss on the SG-1 gateway. Traffic is being rerouted via Tokyo (tyo-1) — expect slower speeds until the fix lands.', authorId: 'u-layla' },
      ],
    },
    {
      id: 'INC-309',
      title: 'Email delivery delays',
      serviceIds: ['mail'],
      severity: 'major',
      status: 'resolved',
      startedAt: now - 12 * DAY - 3 * HOUR,
      resolvedAt: now - 12 * DAY,
      updates: [
        { id: 'iu-309-1', at: now - 12 * DAY - 3 * HOUR, status: 'investigating', body: 'Inbound external email is delayed by up to 40 minutes.', authorId: 'u-layla' },
        { id: 'iu-309-2', at: now - 12 * DAY - 2 * HOUR, status: 'identified', body: 'A misconfigured transport rule is queueing external mail. Rolling it back.', authorId: 'u-layla' },
        { id: 'iu-309-3', at: now - 12 * DAY - 40 * MIN, status: 'monitoring', body: 'Queues are draining; new mail is arriving normally.', authorId: 'u-layla' },
        { id: 'iu-309-4', at: now - 12 * DAY, status: 'resolved', body: 'All queued mail delivered. Root cause documented in the post-incident review.', authorId: 'u-layla' },
      ],
    },
    {
      id: 'INC-306',
      title: 'SSO sign-in errors for some users',
      serviceIds: ['sso'],
      severity: 'major',
      status: 'resolved',
      startedAt: now - 31 * DAY - 2 * HOUR,
      resolvedAt: now - 31 * DAY,
      updates: [
        { id: 'iu-306-1', at: now - 31 * DAY - 2 * HOUR, status: 'investigating', body: 'Some people see “invalid session” when signing in.', authorId: 'u-ethan' },
        { id: 'iu-306-2', at: now - 31 * DAY - HOUR, status: 'identified', body: 'An expired signing certificate on one IdP node. Rotating it now.', authorId: 'u-ethan' },
        { id: 'iu-306-3', at: now - 31 * DAY, status: 'resolved', body: 'Certificate rotated on all nodes; sign-in is healthy.', authorId: 'u-ethan' },
      ],
    },
    {
      id: 'INC-301',
      title: 'London office Wi-Fi outage',
      serviceIds: ['wifi-lon'],
      severity: 'major',
      status: 'resolved',
      startedAt: now - 48 * DAY - 2 * HOUR,
      resolvedAt: now - 48 * DAY,
      offices: ['London'],
      updates: [
        { id: 'iu-301-1', at: now - 48 * DAY - 2 * HOUR, status: 'investigating', body: 'Wi-Fi is down on all London floors. Wired desks are unaffected.', authorId: 'u-layla' },
        { id: 'iu-301-2', at: now - 48 * DAY, status: 'resolved', body: 'Controller failover completed; all access points are back.', authorId: 'u-layla' },
      ],
    },
  ];
}

function atLocal(now: number, daysAhead: number, hour: number): number {
  const d = new Date(now + daysAhead * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function seedMaintenance(now: number): Maintenance[] {
  return [
    { id: 'MNT-41', title: 'Print server upgrade', serviceIds: ['print'], startsAt: atLocal(now, 2, 20), endsAt: atLocal(now, 2, 21), body: 'Follow-me print will be unavailable for up to an hour in all offices.' },
    { id: 'MNT-42', title: 'Wi-Fi controller firmware · London', serviceIds: ['wifi-lon'], startsAt: atLocal(now, 5, 21), endsAt: atLocal(now, 5, 23), body: 'Brief Wi-Fi drops (under a minute) on each floor while access points reboot.' },
  ];
}

function seedAnnouncements(now: number): ItAnnouncement[] {
  return [
    { id: 'ann-passkeys', title: 'Passkeys are becoming mandatory', body: 'Enrol a passkey in under two minutes — accounts without phishing-resistant MFA will be paused soon.', tone: 'warning', at: now - 2 * DAY, link: '/helpdesk/guides/passkey-setup', linkLabel: 'Set up a passkey' },
    { id: 'ann-macos', title: 'macOS 15.2 is rolling out', body: 'Install it from System Settings — or let the health check do it for you.', tone: 'info', at: now - DAY, link: '/helpdesk?diag=1', linkLabel: 'Run health check' },
    { id: 'ann-travel', title: 'Travelling over the holidays?', body: 'Grab a travel kit (privacy screen, eSIM, charger) from the IT bar before you go.', tone: 'success', at: now - 4 * DAY, link: '/helpdesk/guides/travel-kit', linkLabel: 'Travel checklist' },
  ];
}

/* =========================================================================
   Guides & macros
   ========================================================================= */

function seedGuides(now: number): Guide[] {
  const g = (o: Omit<Guide, 'updatedAt'> & { updatedDays: number }): Guide => {
    const { updatedDays, ...rest } = o;
    return { ...rest, updatedAt: now - updatedDays * DAY };
  };
  return [
    g({
      slug: 'vpn-connect',
      title: 'Fix VPN connection drops',
      summary: 'Get Helix Connect stable again in four steps.',
      category: 'network',
      minutes: 4,
      playbookId: 'repair-vpn',
      keywords: ['vpn', 'helix connect', 'tunnel', 'disconnect', 'remote'],
      helpful: 182,
      notHelpful: 11,
      updatedDays: 6,
      steps: [
        { title: 'Check the status page', body: 'If there’s an active VPN incident for your office, the fix is on us — follow the incident for live updates.' },
        { title: 'Update Helix Connect', body: 'Open Self Service → Helix Connect → Update. Version 5.3.0 fixes most reconnect loops.' },
        { title: 'Let it pick the gateway', body: 'Menu-bar icon → Gateway → Automatic. Automatic chooses the healthiest gateway every time you connect.' },
        { title: 'Reset the tunnel', body: 'Still dropping? Quit Helix Connect and reset its keys from Terminal:', code: 'helixctl reset --keys && helixctl up' },
        { title: 'Tell us when it drops', body: 'Raise a ticket with the time of the last drop — we can trace it on the gateway logs.' },
      ],
    }),
    g({
      slug: 'wifi-certificate',
      title: 'Renew your office Wi-Fi certificate',
      summary: 'Helix-Corp uses a per-device certificate. Here’s how to refresh it.',
      category: 'network',
      minutes: 3,
      playbookId: 'renew-wifi',
      keywords: ['wifi', 'wi-fi', 'wireless', 'certificate', '802.1x', 'helix-corp'],
      helpful: 96,
      notHelpful: 4,
      updatedDays: 14,
      steps: [
        { title: 'Check the expiry', body: 'System Settings → Wi-Fi → Helix-Corp → Details shows when your certificate expires.' },
        { title: 'Request a new one', body: 'Self Service → “Renew Wi-Fi certificate”. It requests a fresh certificate from Helix PKI automatically.' },
        { title: 'Forget and rejoin', body: 'If you still can’t connect, forget Helix-Corp and join it again — it will use the new certificate.' },
      ],
    }),
    g({
      slug: 'passkey-setup',
      title: 'Set up or reset your passkey',
      summary: 'Phishing-proof sign-in with Touch ID, Windows Hello or a YubiKey.',
      category: 'access',
      minutes: 2,
      playbookId: 'reset-passkey',
      keywords: ['passkey', 'touch id', 'sso', 'sign in', 'mfa', 'yubikey'],
      helpful: 241,
      notHelpful: 9,
      updatedDays: 2,
      steps: [
        { title: 'Open Helix ID', body: 'Go to id.helix.co → Security → Passkeys.' },
        { title: 'Add a passkey', body: 'Click “Add passkey” and confirm with Touch ID, Windows Hello or your YubiKey.' },
        { title: 'Add a backup', body: 'Register a second passkey (your phone or a spare YubiKey) so you’re never locked out.' },
        { title: 'Remove old ones', body: 'Delete passkeys for devices you no longer use.' },
      ],
    }),
    g({
      slug: 'mfa-new-phone',
      title: 'Move MFA to a new phone',
      summary: 'Bring your authenticator across before you wipe the old phone.',
      category: 'access',
      minutes: 5,
      keywords: ['mfa', '2fa', 'authenticator', 'new phone', 'otp'],
      helpful: 77,
      notHelpful: 6,
      updatedDays: 30,
      steps: [
        { title: 'Keep the old phone for now', body: 'Don’t wipe it until the new phone works — you’ll need it to approve the move.' },
        { title: 'Add the new phone', body: 'Helix ID → Security → Add authenticator, then scan the QR code with the new phone.' },
        { title: 'Remove the old phone', body: 'Once you’ve signed in with the new phone, remove the old authenticator.' },
        { title: 'Lost the old phone?', body: 'Raise an Access ticket — we’ll verify you and issue a one-time bypass code.' },
      ],
    }),
    g({
      slug: 'outlook-sync',
      title: 'Fix mail & calendar sync',
      summary: 'When Outlook stops getting new mail or invites.',
      category: 'email',
      minutes: 4,
      playbookId: 'fix-mail',
      keywords: ['outlook', 'email', 'mail', 'calendar', 'sync', 'invite'],
      helpful: 133,
      notHelpful: 12,
      updatedDays: 9,
      steps: [
        { title: 'Check Outlook on the web', body: 'If mail shows up at outlook.office.com, the problem is your local app, not the mailbox.' },
        { title: 'Reset sync', body: 'Outlook → Settings → Accounts → your account → Reset. Your mail stays on the server.' },
        { title: 'Rebuild search', body: 'If search misses new mail, let Outlook rebuild its index overnight with your laptop plugged in.' },
      ],
    }),
    g({
      slug: 'add-printer',
      title: 'Add an office printer',
      summary: 'Follow-me print works on every Helix printer with your badge.',
      category: 'hardware',
      minutes: 3,
      playbookId: 'add-printer',
      keywords: ['printer', 'print', 'printing', 'follow-me', 'scan'],
      helpful: 88,
      notHelpful: 7,
      updatedDays: 21,
      steps: [
        { title: 'Install the secure queue', body: 'Self Service → “Helix Follow-me print” adds one queue that works in every office.' },
        { title: 'Print as usual', body: 'Choose “Helix Follow-me” in the print dialog.' },
        { title: 'Release at any printer', body: 'Tap your badge on any Helix printer to release your jobs. Unreleased jobs are deleted after 24 hours.' },
      ],
    }),
    g({
      slug: 'free-disk-space',
      title: 'Free up disk space safely',
      summary: 'What’s safe to delete — and what to leave alone.',
      category: 'hardware',
      minutes: 6,
      playbookId: 'clear-disk',
      keywords: ['disk', 'storage', 'space', 'full', 'caches'],
      helpful: 156,
      notHelpful: 8,
      updatedDays: 11,
      steps: [
        { title: 'See what’s using space', body: 'System Settings → General → Storage shows the big categories.' },
        { title: 'Clear developer leftovers', body: 'Xcode DerivedData and dangling Docker images are often 10 GB+.', code: 'rm -rf ~/Library/Developer/Xcode/DerivedData && docker system prune' },
        { title: 'Empty the Trash and Downloads', body: 'Old installers (.dmg, .pkg) can go. Move personal files you want to keep to Helix Drive.' },
        { title: 'Don’t touch system folders', body: 'Never delete files from /System or /Library — that’s what the Clear disk space fix is for.' },
      ],
    }),
    g({
      slug: 'slow-laptop',
      title: 'Speed up a slow or hot laptop',
      summary: 'Find the runaway process and cool things down.',
      category: 'hardware',
      minutes: 5,
      playbookId: 'speed-up',
      keywords: ['slow', 'fans', 'hot', 'overheating', 'freezing', 'performance'],
      helpful: 119,
      notHelpful: 14,
      updatedDays: 18,
      steps: [
        { title: 'Restart', body: 'Seriously — a restart clears stuck processes and applies pending updates.' },
        { title: 'Check Activity Monitor', body: 'Sort by CPU. Browser helpers and Docker are common culprits; quit what you don’t need.' },
        { title: 'Keep 15% disk free', body: 'Below that, macOS swaps heavily and everything slows down.' },
        { title: 'Still slow?', body: 'Raise a Hardware ticket — we can check the battery and thermals remotely.' },
      ],
    }),
    g({
      slug: 'install-software',
      title: 'Install approved software',
      summary: 'Self Service for free apps, Catalog for licensed ones.',
      category: 'software',
      minutes: 3,
      playbookId: 'install-software',
      keywords: ['install', 'software', 'licence', 'license', 'self service', 'admin'],
      helpful: 101,
      notHelpful: 5,
      updatedDays: 25,
      steps: [
        { title: 'Open Self Service', body: 'Free, pre-approved apps install in one click — no admin rights needed.' },
        { title: 'Licensed apps', body: 'Figma, Adobe CC, JetBrains, Docker Desktop and Miro are requested from the Catalog.' },
        { title: 'Something missing?', body: 'Raise a Software ticket with a link to the app — Security reviews new apps within two days.' },
      ],
    }),
    g({
      slug: 'request-access',
      title: 'Request access to a system',
      summary: 'Who approves what, and how long it takes.',
      category: 'access',
      minutes: 3,
      keywords: ['access', 'permission', 'github', 'aws', 'salesforce', 'database'],
      helpful: 64,
      notHelpful: 6,
      updatedDays: 40,
      steps: [
        { title: 'Find it in the Catalog', body: 'Most systems (GitHub, AWS sandbox, Salesforce, production databases) are Catalog items.' },
        { title: 'Say why you need it', body: 'A one-line reason speeds up approval — your manager sees it first.' },
        { title: 'Sensitive systems', body: 'Production data needs manager, IT and Security approval, and expires automatically.' },
      ],
    }),
    g({
      slug: 'report-phishing',
      title: 'Spot and report phishing',
      summary: 'Urgent tone, odd sender, a sign-in link? Report it.',
      category: 'security',
      minutes: 4,
      playbookId: 'report-phishing',
      keywords: ['phishing', 'scam', 'suspicious', 'email', 'link', 'spam'],
      helpful: 210,
      notHelpful: 3,
      updatedDays: 4,
      steps: [
        { title: 'Check the sender', body: 'Hover over the sender — look-alike domains (helix-co.com, docusign-helix.com) are a red flag.' },
        { title: 'Don’t click, don’t reply', body: 'Never enter your password from an email link. Open id.helix.co yourself instead.' },
        { title: 'Report it', body: 'Use “Report phishing” in Outlook or the Quick fix here — we purge every copy company-wide.' },
        { title: 'Clicked already?', body: 'Report it right away and say so. We’ll reset your password and revoke sessions — no blame.' },
      ],
    }),
    g({
      slug: 'lost-device',
      title: 'Lost or stolen device: what to do',
      summary: 'Report it first — we lock it within seconds.',
      category: 'security',
      minutes: 2,
      keywords: ['lost', 'stolen', 'theft', 'missing', 'laptop', 'phone'],
      helpful: 58,
      notHelpful: 1,
      updatedDays: 12,
      steps: [
        { title: 'Report it in the Helpdesk', body: 'Devices → your device → Report lost/stolen. We lock it remotely and rotate its keys immediately.' },
        { title: 'File a police report if stolen', body: 'Add the report number to your ticket — insurers need it.' },
        { title: 'Get a replacement', body: 'A loaner is ready at the IT bar, or we courier one to you.' },
      ],
    }),
    g({
      slug: 'external-display',
      title: 'External display or dock not working',
      summary: 'Flicker, no signal or wrong resolution.',
      category: 'hardware',
      minutes: 4,
      playbookId: 'fix-display',
      keywords: ['monitor', 'display', 'dock', 'flicker', 'no signal', 'resolution'],
      helpful: 92,
      notHelpful: 10,
      updatedDays: 16,
      steps: [
        { title: 'Try another port and cable', body: 'Thunderbolt ports closest to the hinge are usually the most reliable.' },
        { title: 'Update dock firmware', body: 'Self Service → “Dock firmware” updates CalDigit and Dell docks.' },
        { title: 'Reset display settings', body: 'Unplug everything, restart, then connect the display first and the dock second.' },
      ],
    }),
    g({
      slug: 'camera-audio',
      title: 'Fix camera & microphone in meetings',
      summary: 'When Meet or Zoom can’t see or hear you.',
      category: 'hardware',
      minutes: 3,
      playbookId: 'fix-audio',
      keywords: ['camera', 'microphone', 'mic', 'audio', 'headset', 'meet', 'zoom'],
      helpful: 74,
      notHelpful: 5,
      updatedDays: 22,
      steps: [
        { title: 'Check permissions', body: 'System Settings → Privacy & Security → Camera / Microphone → allow your browser or Zoom.' },
        { title: 'Pick the right device', body: 'In the meeting, open settings and choose your headset for both input and output.' },
        { title: 'Restart audio', body: 'Still silent? Quit the meeting app and run the Fix camera & audio Quick fix.' },
      ],
    }),
    g({
      slug: 'travel-kit',
      title: 'Travelling with company devices',
      summary: 'A five-minute checklist before you fly.',
      category: 'other',
      minutes: 5,
      keywords: ['travel', 'trip', 'esim', 'privacy screen', 'border'],
      helpful: 45,
      notHelpful: 2,
      updatedDays: 8,
      steps: [
        { title: 'Pick up a travel kit', body: 'Privacy screen, universal charger and an eSIM — free from the IT bar or the Catalog.' },
        { title: 'Update before you go', body: 'Run the device health check so everything is patched and encrypted.' },
        { title: 'Turn on travel mode', body: 'Self Service → Travel mode signs you out of sensitive apps at border crossings.' },
        { title: 'Lost on the road?', body: 'Report it from your phone at /helpdesk — we lock it remotely within seconds.' },
      ],
    }),
  ];
}

export const SEED_MACROS: Macro[] = [
  { id: 'm-screenshot', name: 'Ask for a screenshot', body: 'Hi {{first}}, could you attach a screenshot of the error (and roughly when it happened)? That’ll help us pinpoint it quickly.', status: 'waiting' },
  { id: 'm-restart', name: 'Restart & update', body: 'Hi {{first}}, please restart your device and install any pending updates (System Settings → General → Software Update), then let us know if the issue persists.', status: 'waiting' },
  { id: 'm-incident', name: 'Known incident', body: 'Hi {{first}}, this is related to an ongoing incident we’re actively working on — you can follow live updates on the status page. I’ll update this ticket as soon as it’s resolved.' },
  { id: 'm-swap', name: 'Hardware swap booked', body: 'Hi {{first}}, I’ve booked a hardware swap. A replacement will be ready at the IT bar tomorrow from 10:00 — please bring the old device and its charger.', status: 'in_progress' },
  { id: 'm-access', name: 'Access granted', body: 'Hi {{first}}, access has been granted. It can take up to 15 minutes to propagate — sign out and back in if you don’t see it yet.', status: 'resolved' },
  { id: 'm-phish', name: 'Phishing — thanks', body: 'Thanks for reporting this, {{first}}! It was a phishing attempt. We’ve blocked the sender and removed the message from all inboxes — nothing else to do.', status: 'resolved' },
  { id: 'm-resolved', name: 'Resolved — confirm', body: 'Hi {{first}}, we believe this is fixed. If anything still looks off, just reply and the ticket will reopen automatically.', status: 'resolved' },
];

/* =========================================================================
   Insights history & self-service runs
   ========================================================================= */

function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * DAY;
}

function seedHistory(now: number): WeekStat[] {
  const created = [24, 27, 22, 31, 29, 26, 33, 28, 30, 25, 27];
  const resolved = [23, 25, 24, 28, 30, 27, 30, 29, 31, 26, 28];
  const sla = [0.88, 0.9, 0.91, 0.86, 0.89, 0.92, 0.87, 0.9, 0.93, 0.94, 0.92];
  const frt = [38, 34, 31, 42, 36, 29, 33, 27, 24, 22, 21];
  const csat = [4.4, 4.5, 4.5, 4.3, 4.6, 4.6, 4.5, 4.7, 4.7, 4.8, 4.7];
  const thisWeek = startOfWeek(now);
  return created.map((c, i) => ({ weekStart: thisWeek - (created.length - i) * 7 * DAY, created: c, resolved: resolved[i], slaMet: sla[i], frtMedianMin: frt[i], csat: csat[i] }));
}

function seedFixRuns(now: number): FixRun[] {
  return [
    { id: 'fx-1', playbookId: 'clear-disk', userId: 'u-omar', deviceTag: 'HX-MBP-0142', at: now - DAY, outcome: 'success', summary: 'Freed 21.4 GB — disk now 72% used.', ticketId: 'HX-1046' },
    { id: 'fx-2', playbookId: 'fix-mail', userId: 'u-mei', deviceTag: 'HX-MBP-0187', at: now - 2 * DAY, outcome: 'success', summary: 'Mail & calendar re-synced — 0 conflicts.', ticketId: 'HX-1037' },
    { id: 'fx-3', playbookId: 'reset-passkey', userId: 'u-kwame', deviceTag: 'HX-MBP-0431', at: now - 9 * DAY, outcome: 'success', summary: 'New passkey registered and device trust renewed for 30 days.', ticketId: 'HX-1038' },
  ];
}

/* =========================================================================
   Assemble
   ========================================================================= */

export function createSeed(now = Date.now()): HelpdeskData {
  return {
    version: HELPDESK_VERSION,
    tickets: TICKET_SEEDS.map((t) => buildTicket(t, now)).sort((a, b) => b.updatedAt - a.updatedAt),
    devices: DEVICE_SEEDS.map((d) => buildDevice(d, now)),
    tags: SEED_TAGS(now),
    catalog: SEED_CATALOG,
    requests: seedRequests(now),
    services: SEED_SERVICES.map((s) => ({ ...s, uptime: uptimeSeries(s.id, UPTIME_DIPS[s.id] ?? {}) })),
    incidents: seedIncidents(now),
    maintenance: seedMaintenance(now),
    announcements: seedAnnouncements(now),
    guides: seedGuides(now),
    macros: SEED_MACROS,
    history: seedHistory(now),
    fixRuns: seedFixRuns(now),
    guideVotes: {},
    statusSubs: ['u-omar'],
    seen: {},
    fleetViews: {},
    diagRuns: {},
    seq: { ticket: 1059, request: 2047, incident: 312 },
  };
}
