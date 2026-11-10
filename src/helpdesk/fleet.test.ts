import { describe, expect, it } from 'vitest';
import {
  applyCheckFix,
  complianceIssues,
  deviceHealth,
  healthBand,
  healthChecks,
  isCompliant,
  kindCode,
  matchesFleetFilter,
  nextAssetTag,
  normaliseTag,
  radarDistance,
  radarLayout,
  recoveryKeyFor,
  warrantyInfo,
  ASSET_TAG_RE,
} from './fleet';
import { applyPlaybookEffects, planPlaybook } from './playbooks';
import { createSeed } from './seed';
import { DAY } from './meta';

const NOW = Date.UTC(2026, 10, 6, 8, 0, 0);
const seed = createSeed(NOW);
const dev = (tag: string) => seed.devices.find((d) => d.assetTag === tag)!;
const users = [
  { id: 'u-omar', name: 'Omar Khalid', department: 'Engineering' as const },
  { id: 'u-mei', name: 'Mei Tanaka', department: 'Design' as const },
];

describe('seed integrity', () => {
  it('has a realistic fleet with unique, well-formed asset tags', () => {
    expect(seed.devices.length).toBeGreaterThanOrEqual(50);
    const tags = seed.devices.map((d) => d.assetTag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const t of tags) expect(t).toMatch(ASSET_TAG_RE);
    expect(dev('HX-MBP-0142').assigneeId).toBe('u-omar');
    expect(dev('HX-MBA-0419').status).toBe('loaner');
    expect(seed.devices.some((d) => d.status === 'lost')).toBe(true);
    expect(seed.devices.some((d) => d.status === 'in_repair')).toBe(true);
    expect(seed.devices.some((d) => d.status === 'retired')).toBe(true);
  });
});

describe('device health', () => {
  it('scores a clean device as healthy', () => {
    const h = deviceHealth(dev('HX-MBP-0007'), NOW);
    expect(h).toBeGreaterThanOrEqual(90);
    expect(healthBand(h)).toBe('healthy');
  });

  it('penalises missing firewall and a filling disk (Mei)', () => {
    const d = dev('HX-MBP-0187');
    const checks = healthChecks(d, NOW);
    expect(checks.find((c) => c.id === 'firewall')?.status).toBe('fail');
    expect(checks.find((c) => c.id === 'disk')?.status).toBe('warn');
    expect(deviceHealth(d, NOW)).toBeLessThan(85);
    expect(complianceIssues(d, NOW)).toContain('Firewall off');
  });

  it('one-click fixes genuinely raise the score', () => {
    let d = dev('HX-MBP-0187');
    const before = deviceHealth(d, NOW);
    d = applyCheckFix(d, 'firewall', NOW);
    d = applyCheckFix(d, 'disk', NOW);
    expect(d.compliance?.firewall).toBe(true);
    expect(deviceHealth(d, NOW)).toBeGreaterThan(before);
    expect(isCompliant(d, NOW)).toBe(true);
  });

  it('flags stale MDM check-ins as non-compliant (Priya’s XPS)', () => {
    const d = dev('HX-XPS-0146');
    expect(healthChecks(d, NOW).find((c) => c.id === 'mdm')?.status).toBe('fail');
    expect(isCompliant(d, NOW)).toBe(false);
  });

  it('caps lost and in-repair devices', () => {
    expect(deviceHealth(dev('HX-PHN-0112'), NOW)).toBeLessThanOrEqual(12);
    expect(deviceHealth(dev('HX-MBP-0098'), NOW)).toBeLessThanOrEqual(55);
  });

  it('battery issues route to a ticket, not a self-fix', () => {
    const c = healthChecks(dev('HX-LAP-0158'), NOW).find((x) => x.id === 'battery');
    expect(c?.status).toBe('warn');
    expect(c?.fix?.kind).toBe('ticket');
  });

  it('peripherals use firmware & warranty', () => {
    const dock = dev('HX-DCK-0172');
    expect(healthChecks(dock, NOW).map((c) => c.id)).toEqual(['firmware', 'warranty']);
    expect(deviceHealth(applyCheckFix(dock, 'firmware', NOW), NOW)).toBeGreaterThan(deviceHealth(dock, NOW));
  });
});

describe('warranty & tags', () => {
  it('computes warranty state', () => {
    expect(warrantyInfo({ purchasedAt: NOW - 100 * DAY, warrantyEnd: NOW + 30 * DAY }, NOW).state).toBe('expiring');
    expect(warrantyInfo({ purchasedAt: NOW - 900 * DAY, warrantyEnd: NOW - DAY }, NOW).state).toBe('expired');
    expect(warrantyInfo({ purchasedAt: NOW, warrantyEnd: NOW + 900 * DAY }, NOW).state).toBe('ok');
  });

  it('generates HX-<KIND>-<NNNN> tags with a fleet-wide sequence', () => {
    expect(kindCode('laptop', 'MacBook Pro 14"')).toBe('MBP');
    expect(kindCode('laptop', 'Dell XPS 13')).toBe('XPS');
    expect(kindCode('monitor')).toBe('MON');
    expect(nextAssetTag('security-key', 'YubiKey', seed.devices)).toBe('HX-KEY-0467');
  });

  it('normalises scanned or typed tags', () => {
    expect(normaliseTag('hx mbp 142')).toBe('HX-MBP-0142');
    expect(normaliseTag('HX-MBP-0142')).toBe('HX-MBP-0142');
    expect(normaliseTag('mon0217')).toBe('HX-MON-0217');
  });

  it('recovery keys are deterministic and well-formed', () => {
    const k = recoveryKeyFor('HX-MBP-0142', 1);
    expect(k).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    expect(recoveryKeyFor('HX-MBP-0142', 1)).toBe(k);
    expect(recoveryKeyFor('HX-MBP-0142', 2)).not.toBe(k);
  });
});

describe('filters & radar', () => {
  it('filters by status, tag, compliance and free text', () => {
    const ctx = { users, now: NOW };
    const all = seed.devices;
    expect(all.filter((d) => matchesFleetFilter(d, { status: ['loaner'] }, ctx)).map((d) => d.assetTag)).toEqual(['HX-MBA-0419']);
    expect(all.filter((d) => matchesFleetFilter(d, { tag: ['design-rig'] }, ctx)).length).toBeGreaterThanOrEqual(4);
    expect(all.filter((d) => matchesFleetFilter(d, { q: 'omar' }, ctx)).length).toBe(4);
    expect(all.filter((d) => matchesFleetFilter(d, { q: '#eng-heavy' }, ctx)).every((d) => d.tags.includes('eng-heavy'))).toBe(true);
    expect(all.filter((d) => matchesFleetFilter(d, { compliance: 'noncompliant' }, ctx)).some((d) => d.assetTag === 'HX-MBP-0187')).toBe(true);
  });

  it('places risky devices further from the centre and pulses non-compliant ones', () => {
    expect(radarDistance(0)).toBeLessThan(radarDistance(50));
    expect(radarDistance(50)).toBeLessThan(radarDistance(100));
    const { sectors, blips } = radarLayout(seed.devices, { groupOf: (d) => d.office, sectors: ['Dubai', 'London', 'Singapore', 'Berlin', 'New York', 'Toronto', 'Remote'], now: NOW });
    expect(sectors.length).toBe(7);
    const healthy = blips.find((b) => b.tag === 'HX-MBP-0007')!;
    const lost = blips.find((b) => b.tag === 'HX-PHN-0112')!;
    expect(lost.dist).toBeGreaterThan(healthy.dist);
    expect(lost.pulse).toBe(true);
    for (const b of blips) {
      const s = sectors.find((x) => x.key === b.sector)!;
      expect(b.angle).toBeGreaterThanOrEqual(s.start);
      expect(b.angle).toBeLessThanOrEqual(s.end);
      expect(Math.hypot(b.x, b.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('playbooks', () => {
  const inc = seed.incidents.filter((i) => i.status !== 'resolved');

  it('VPN repair is partial during the Singapore incident and routes around it', () => {
    const plan = planPlaybook('repair-vpn', { now: NOW, office: 'Singapore', device: dev('HX-MBA-0231'), incidents: inc });
    expect(plan.outcome).toBe('partial');
    expect(plan.summary).toMatch(/INC-311/);
    expect(plan.steps.some((s) => s.label === 'Updating the VPN client')).toBe(true);
    const fixed = applyPlaybookEffects(dev('HX-MBA-0231'), plan, NOW);
    expect(fixed.posture?.vpnClient).toBe('current');
  });

  it('VPN repair succeeds elsewhere', () => {
    expect(planPlaybook('repair-vpn', { now: NOW, office: 'Dubai', device: dev('HX-MBP-0142'), incidents: inc }).outcome).toBe('success');
  });

  it('disk cleanup frees real space and is deterministic', () => {
    const d = dev('HX-MBP-0211');
    const a = planPlaybook('clear-disk', { now: NOW, office: 'Remote', device: d, incidents: [] });
    const b = planPlaybook('clear-disk', { now: NOW, office: 'Remote', device: d, incidents: [] });
    expect(a).toEqual(b);
    expect(a.storageAfter!).toBeLessThan(93);
    const after = applyPlaybookEffects(d, a, NOW);
    expect(after.telemetry!.storage.at(-1)).toBe(a.storageAfter);
  });

  it('printer setup uses the office’s printers and is partial for remote people', () => {
    expect(planPlaybook('add-printer', { now: NOW, office: 'London', incidents: [] }).summary).toMatch(/LON-3F-02/);
    expect(planPlaybook('add-printer', { now: NOW, office: 'Remote', incidents: [] }).outcome).toBe('partial');
  });
});
