import { describe, expect, it } from 'vitest';
import { detectImpact, detectUrgency, mapCategory, subjectFrom, triage, type TriageContext } from './triage';
import { createSeed } from './seed';
import type { Incident } from './types';

const NOW = Date.UTC(2026, 10, 6, 8, 0, 0);
const seed = createSeed(NOW);
const devicesOf = (id: string) => seed.devices.filter((d) => d.assigneeId === id);
const ctx = (over: Partial<TriageContext> = {}): TriageContext => ({ now: NOW, office: 'Dubai', devices: devicesOf('u-omar'), incidents: [], ...over });

describe('Nova triage — intents', () => {
  const cases: [string, string][] = [
    ['My VPN keeps dropping every few minutes', 'vpn'],
    ['Wi-Fi keeps disconnecting in the meeting rooms', 'wifi'],
    ['I’m locked out after resetting my password', 'password'],
    ['Moving my authenticator app to a new phone', 'mfa'],
    ['Outlook stopped syncing my inbox', 'email'],
    ['Calendar invites from Salesforce are not showing', 'calendar'],
    ['The 3F printer keeps jamming on double-sided jobs', 'printer'],
    ['Laptop is really slow and the fans are loud', 'slow'],
    ['Startup disk is almost full', 'disk'],
    ['Docker Desktop says my licence expired', 'software'],
    ['I need access to the AWS sandbox', 'access'],
    ['I left my laptop in a taxi', 'lost'],
    ['Got a weird email asking me to verify your account', 'phishing'],
    ['My external monitor flickers when docked', 'display'],
    ['People say my headset mic sounds robotic', 'av'],
  ];
  for (const [text, intent] of cases)
    it(`“${text}” → ${intent}`, () => {
      expect(triage(text, ctx()).intent).toBe(intent);
    });

  it('does not mistake "lost my VPN connection" for a lost device', () => {
    expect(triage('I lost my VPN connection again', ctx()).intent).toBe('vpn');
  });

  it('returns no intent (low confidence) for gibberish', () => {
    const r = triage('hello there', ctx());
    expect(r.intent).toBeNull();
    expect(r.confidence).toBeLessThan(0.35);
    expect(r.ticket.category).toBe('other');
  });

  it('is confident on clear descriptions and suggests a playbook + guides', () => {
    const r = triage('Outlook stopped syncing my inbox', ctx());
    expect(r.confidence).toBeGreaterThan(0.75);
    expect(r.playbookId).toBe('fix-mail');
    expect(r.guides).toContain('outlook-sync');
  });
});

describe('Nova triage — security', () => {
  it('treats a lost device as a P1 security incident with no self-fix', () => {
    const r = triage('I left my phone in a taxi last night', ctx());
    expect(r.intent).toBe('lost');
    expect(r.security).toBe(true);
    expect(r.ticket.priority).toBe('P1');
    expect(r.ticket.category).toBe('security');
    expect(r.playbookId).toBeUndefined();
    expect(r.ticket.deviceTag).toBe('HX-PHN-0451');
  });

  it('escalates phishing to P1 when credentials may be compromised', () => {
    const r = triage('I clicked a link in a weird email and entered my password', ctx());
    expect(r.intent).toBe('phishing');
    expect(r.ticket.priority).toBe('P1');
    expect(r.signals[0].tone).toBe('bad');
  });

  it('keeps a plain phishing report at normal priority', () => {
    const r = triage('Got a suspicious email pretending to be DocuSign', ctx());
    expect(r.intent).toBe('phishing');
    expect(r.ticket.priority).toBe('P2');
  });
});

describe('Nova triage — context', () => {
  const inc: Incident = { id: 'INC-311', title: 'VPN degraded in Singapore', serviceIds: ['vpn'], severity: 'minor', status: 'identified', startedAt: NOW - 3_600_000, offices: ['Singapore'], updates: [] };

  it('cites an active incident in the person’s office', () => {
    const r = triage('VPN is super slow', ctx({ office: 'Singapore', devices: devicesOf('u-hana'), incidents: [inc] }));
    expect(r.intent).toBe('vpn');
    expect(r.incidentId).toBe('INC-311');
    expect(r.signals.some((s) => s.text.includes('INC-311'))).toBe(true);
    expect(r.cause).toMatch(/known incident/);
    // Hana's laptop runs an outdated VPN client
    expect(r.signals.some((s) => s.text.includes('out of date'))).toBe(true);
  });

  it('ignores incidents in other offices', () => {
    const r = triage('VPN is super slow', ctx({ incidents: [inc] }));
    expect(r.incidentId).toBeUndefined();
  });

  it('uses telemetry as evidence (Sofia’s disk and CPU)', () => {
    const r = triage('my laptop is so slow today', ctx({ office: 'Remote', devices: devicesOf('u-sofia') }));
    expect(r.intent).toBe('slow');
    expect(r.signals.map((s) => s.text).join(' ')).toMatch(/93% full/);
    expect(r.ticket.deviceTag).toBe('HX-MBP-0211');
  });

  it('prefills a ticket with the user’s words and diagnostics', () => {
    const r = triage('Wi-Fi keeps dropping in the meeting rooms. It started this week.', ctx({ office: 'Singapore', devices: devicesOf('u-mei') }));
    expect(r.ticket.subject).toBe('Wi-Fi keeps dropping in the meeting rooms');
    expect(r.ticket.description).toMatch(/Nova diagnostics/);
    expect(r.ticket.description).toMatch(/certificate expires/);
  });
});

describe('impact, urgency & mapping', () => {
  it('detects impact', () => {
    expect(detectImpact('The whole team can’t reach GitHub')).toBe('team');
    expect(detectImpact('Nobody can print in the whole office')).toBe('company');
    expect(detectImpact('everyone on my team is affected')).toBe('team');
    expect(detectImpact('my mouse is laggy')).toBe('me');
  });

  it('detects urgency', () => {
    expect(detectUrgency('I can’t work at all, demo in an hour')).toBe('high');
    expect(detectUrgency('happens occasionally, no rush')).toBe('low');
    expect(detectUrgency('printer is grumpy')).toBe('normal');
  });

  it('combines impact and urgency into priority', () => {
    expect(triage('The whole team can’t work — VPN is down', ctx()).ticket.priority).toBe('P1');
  });

  it('maps free-form categories from other apps', () => {
    expect(mapCategory('VPN')).toBe('network');
    expect(mapCategory('Access request')).toBe('access');
    expect(mapCategory('laptop')).toBe('hardware');
    expect(mapCategory(undefined, 'Outlook is not syncing my mail')).toBe('email');
    expect(mapCategory('weird')).toBe('other');
  });

  it('builds subjects from the first sentence', () => {
    expect(subjectFrom('fans are loud. please help', 'x')).toBe('Fans are loud');
    expect(subjectFrom('help', 'Fallback')).toBe('Fallback');
    expect(subjectFrom('a'.repeat(100), 'x').endsWith('…')).toBe(true);
  });
});
