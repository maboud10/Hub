/**
 * Self-service "Fix-it" playbooks (pure).
 *
 * `planPlaybook` turns a playbook + context (device, office, active incidents)
 * into a deterministic, realistic terminal transcript and an outcome. The UI
 * animates the steps; the store applies `applyPlaybookEffects` afterwards so
 * the fix genuinely changes the device (disk freed, client updated, …).
 */
import type { Device, FixOutcome, Incident, Office, PlaybookId, TicketCategory } from './types';
import { applyCheckFix, last } from './fleet';
import { DAY } from './meta';
import { hashString, rng } from './util';

export interface PlaybookDef {
  id: PlaybookId;
  title: string;
  /** Button verb, e.g. "Repair VPN". */
  verb: string;
  blurb: string;
  category: TicketCategory;
  /** Works on the person's primary computer. */
  needsDevice: boolean;
}

export const PLAYBOOKS: Record<PlaybookId, PlaybookDef> = {
  'reset-passkey': { id: 'reset-passkey', title: 'Reset passkey', verb: 'Reset passkey', blurb: 'Re-register your passkey and renew device trust', category: 'access', needsDevice: true },
  'repair-vpn': { id: 'repair-vpn', title: 'Repair VPN', verb: 'Repair VPN', blurb: 'Pick the healthiest gateway and rebuild the tunnel', category: 'network', needsDevice: true },
  'renew-wifi': { id: 'renew-wifi', title: 'Renew Wi-Fi certificate', verb: 'Renew certificate', blurb: 'Fresh 802.1X certificate for office Wi-Fi', category: 'network', needsDevice: true },
  'clear-disk': { id: 'clear-disk', title: 'Clear disk space', verb: 'Clear space', blurb: 'Safely remove caches, leftovers and installers', category: 'hardware', needsDevice: true },
  'fix-mail': { id: 'fix-mail', title: 'Fix mail & calendar sync', verb: 'Re-sync mail', blurb: 'Reset sync tokens and rebuild the search index', category: 'email', needsDevice: true },
  'add-printer': { id: 'add-printer', title: 'Add a printer', verb: 'Add printer', blurb: 'Install the nearest office printer + secure queue', category: 'hardware', needsDevice: true },
  'install-software': { id: 'install-software', title: 'Request software', verb: 'Check software', blurb: 'Update core apps, then request licensed tools', category: 'software', needsDevice: true },
  'report-phishing': { id: 'report-phishing', title: 'Report phishing', verb: 'Report phishing', blurb: 'Analyse, purge and block a suspicious email', category: 'security', needsDevice: false },
  'fix-display': { id: 'fix-display', title: 'Fix external display', verb: 'Fix display', blurb: 'Reset display config and update dock firmware', category: 'hardware', needsDevice: true },
  'fix-audio': { id: 'fix-audio', title: 'Fix camera & audio', verb: 'Fix audio', blurb: 'Restart audio services and set the right devices', category: 'hardware', needsDevice: true },
  'speed-up': { id: 'speed-up', title: 'Speed up my laptop', verb: 'Speed up', blurb: 'Tame runaway processes and cool things down', category: 'hardware', needsDevice: true },
};

/** The Quick fixes grid on Support Home (in order). */
export const QUICK_FIXES: PlaybookId[] = ['reset-passkey', 'repair-vpn', 'renew-wifi', 'clear-disk', 'fix-mail', 'add-printer', 'install-software', 'report-phishing'];

export interface PlanStep {
  label: string;
  lines: string[];
  status: 'ok' | 'warn' | 'fail';
  /** Suggested animation duration. */
  ms: number;
}

export interface PlaybookPlan {
  playbookId: PlaybookId;
  steps: PlanStep[];
  outcome: FixOutcome;
  summary: string;
  /** Storage % after the run (clear-disk / speed-up). */
  storageAfter?: number;
}

export interface PlaybookContext {
  now: number;
  email?: string;
  office: Office;
  device?: Device;
  /** Other devices of the person (dock, headset, monitor…). */
  peripherals?: Device[];
  /** Active (unresolved) incidents. */
  incidents: Incident[];
  /** Free text (e.g. the phishing email description). */
  input?: string;
}

const GATEWAYS: Record<Office, string[]> = {
  Dubai: ['dxb-1', 'dxb-2', 'fra-1'],
  London: ['lon-1', 'lon-2', 'ams-1'],
  Singapore: ['sin-1', 'tyo-1', 'syd-1'],
  Berlin: ['fra-1', 'ams-1', 'lon-1'],
  'New York': ['nyc-1', 'tor-1', 'iad-1'],
  Toronto: ['tor-1', 'nyc-1', 'iad-1'],
  Remote: ['fra-1', 'ams-1', 'lon-1'],
};

const PRINTERS: Record<Office, string[]> = {
  Dubai: ['DXB-4F-01 · HP Color LaserJet E786', 'DXB-4F-02 · HP LaserJet M611'],
  London: ['LON-3F-02 · Canon imageRUNNER C3826', 'LON-3F-01 · Canon imageRUNNER C3826'],
  Singapore: ['SIN-12-01 · Ricoh IM C3000', 'SIN-12-02 · Ricoh IM 430'],
  Berlin: ['BER-2F-01 · Kyocera TASKalfa 2554ci'],
  'New York': ['NYC-21-01 · Xerox VersaLink C7130'],
  Toronto: ['TOR-5-01 · Brother MFC-L9670CDN'],
  Remote: [],
};

const hex = (r: () => number, n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
const gb = (n: number) => `${n.toFixed(1)} GB`;

/** Incidents touching a service in the person's office. */
export function incidentFor(incidents: Incident[], serviceIds: string[], office: Office): Incident | undefined {
  return incidents.find((i) => i.status !== 'resolved' && i.serviceIds.some((s) => serviceIds.includes(s)) && (!i.offices || i.offices.includes(office)));
}

export function planPlaybook(id: PlaybookId, ctx: PlaybookContext): PlaybookPlan {
  const d = ctx.device;
  const tag = d?.assetTag ?? 'no-device';
  const r = rng(hashString(`${id}:${tag}:${Math.floor(ctx.now / DAY)}`));
  const step = (label: string, lines: string[], status: PlanStep['status'] = 'ok', ms = 700 + Math.round(r() * 600)): PlanStep => ({ label, lines, status, ms });
  const isMac = (d?.os ?? '').toLowerCase().startsWith('macos');

  switch (id) {
    case 'reset-passkey': {
      const stale = 30 + Math.floor(r() * 300);
      return {
        playbookId: id,
        outcome: 'success',
        summary: 'New passkey registered and device trust renewed for 30 days.',
        steps: [
          step('Verifying it’s really you', [`› helix-id verify --device ${tag}`, isMac ? 'Touch ID ✓ · Secure Enclave attestation valid' : 'Windows Hello ✓ · TPM attestation valid']),
          step('Revoking the stale passkey', [`found 2 passkeys for ${ctx.email ?? 'you'} (1 unused for ${stale} days)`, `revoked pk_${hex(r, 8)}`]),
          step('Registering a new passkey', ['WebAuthn create() · platform authenticator', `passkey pk_${hex(r, 8)} bound to this device`]),
          step('Renewing device trust', ['device-trust certificate renewed · valid 30 days', 'SSO session refreshed ✓']),
        ],
      };
    }
    case 'repair-vpn': {
      const gws = GATEWAYS[ctx.office];
      const inc = incidentFor(ctx.incidents, ['vpn'], ctx.office);
      const outdated = d?.posture?.vpnClient === 'outdated';
      const rows = gws.map((g, i) => {
        const degraded = !!inc && i === 0;
        const ms = degraded ? 0 : 14 + Math.round(r() * 40) + i * 38;
        return { g, ms, degraded, loss: degraded ? 38 : i === 0 ? Math.round(r() * 30) / 10 : 0 };
      });
      const best = [...rows].filter((x) => !x.degraded).sort((a, b) => a.ms + a.loss * 40 - (b.ms + b.loss * 40))[0];
      const steps: PlanStep[] = [
        step('Inspecting Helix Connect', ['› helixctl status', `client ${outdated ? '5.2.1' : '5.3.0'} · profile helix-split · gateway ${gws[0]}`, `utun4 keepalive timeouts: ${3 + Math.floor(r() * 9)} in the last 30 min`], outdated || inc ? 'warn' : 'ok'),
      ];
      if (outdated) steps.push(step('Updating the VPN client', ['5.2.1 → 5.3.0 downloaded (38 MB)', 'signature verified · installed ✓']));
      steps.push(
        step(
          'Measuring gateways',
          rows.map((x) => `${x.g.padEnd(6)} ${x.degraded ? 'timeout   loss 38%  ⚠ degraded' : `${String(x.ms).padStart(3)} ms    loss ${x.loss.toFixed(1)}%`}`),
          inc ? 'warn' : 'ok',
        ),
        step('Rotating WireGuard keys', ['› helixctl rotate-keys', `new key ${hex(r, 4)}:${hex(r, 4)}:${hex(r, 4)} registered with ${best.g}`]),
        step('Re-establishing the tunnel', [`handshake ok · ${best.g} · MTU 1380`, `*.helix.internal resolved in ${8 + Math.floor(r() * 14)} ms · 0% loss`]),
      );
      return {
        playbookId: id,
        steps,
        outcome: inc ? 'partial' : 'success',
        summary: inc
          ? `Connected via ${best.g} — ${gws[0]} is degraded (${inc.id}). Expect slower speeds until the incident is resolved.`
          : `Tunnel healthy via ${best.g} · ${best.ms} ms · 0% loss.`,
      };
    }
    case 'renew-wifi': {
      const left = d?.posture ? Math.round((d.posture.wifiCertExpiresAt - ctx.now) / DAY) : 2;
      const inc = incidentFor(ctx.incidents, [`wifi-${ctx.office.slice(0, 3).toLowerCase()}`], ctx.office);
      return {
        playbookId: id,
        outcome: inc ? 'partial' : 'success',
        summary: inc ? `Certificate renewed, but office Wi-Fi is degraded (${inc.id}).` : 'Wi-Fi certificate renewed — valid for 365 days.',
        steps: [
          step('Checking your Wi-Fi certificate', [`802.1X EAP-TLS · CN=${tag}`, left < 0 ? `expired ${-left} days ago` : `expires in ${left} days`], left < 14 ? 'warn' : 'ok'),
          step('Requesting a new certificate', ['SCEP → Helix PKI Issuing CA 02', `CSR signed · serial ${hex(r, 2)}:${hex(r, 2)}:${hex(r, 2)}:${hex(r, 2)}`.toUpperCase()]),
          step('Installing the Wi-Fi profile', ['profile “Helix-Corp 802.1X” updated', 'old certificate removed ✓']),
          step('Reconnecting', [`associated Helix-Corp · 5 GHz ch ${[36, 44, 149, 157][Math.floor(r() * 4)]} · RSSI −${48 + Math.floor(r() * 12)} dBm`, 'DHCP lease ok · captive check ok ✓']),
        ],
      };
    }
    case 'clear-disk': {
      const cap = d?.telemetry?.storageGb ?? 512;
      const used = d?.telemetry ? last(d.telemetry.storage) : 82;
      const parts = [
        ['~/Library/Caches', 2.5 + r() * 3],
        ['Browser caches', 1.2 + r() * 2],
        ['System & app logs', 0.4 + r() * 1.2],
        ['Xcode DerivedData', used > 80 ? 4 + r() * 6 : 0],
        ['Docker dangling images', used > 80 ? 2 + r() * 4 : 0],
        ['Trash', 0.5 + r() * 2],
        ['Old installers (.dmg/.pkg)', 0.8 + r() * 2.5],
      ].filter(([, v]) => (v as number) > 0) as [string, number][];
      const freed = parts.reduce((s, [, v]) => s + v, 0);
      const after = Math.max(38, Math.round(used - (freed / cap) * 100));
      const partial = after >= 85;
      return {
        playbookId: id,
        storageAfter: after,
        outcome: partial ? 'partial' : 'success',
        summary: partial
          ? `Freed ${gb(freed)}, but the disk is still ${after}% full — large files in ~/Movies and ~/Downloads need your review.`
          : `Freed ${gb(freed)} — disk now ${after}% used.`,
        steps: [
          step('Scanning storage', [`startup disk ${cap} GB · ${Math.round(used)}% used`, `analysing ${(380_000 + Math.floor(r() * 90_000)).toLocaleString('en-US')} files…`], used >= 85 ? 'warn' : 'ok', 1100),
          step('Clearing caches & logs', parts.slice(0, 3).map(([k, v]) => `${k.padEnd(26)} ${gb(v)}`)),
          step('Removing leftovers', parts.slice(3).map(([k, v]) => `${k.padEnd(26)} ${gb(v)}`)),
          step('Verifying', [`freed ${gb(freed)} · disk now ${after}% used`, partial ? 'still above 85% — review large files' : 'APFS snapshot thinned ✓'], partial ? 'warn' : 'ok'),
        ],
      };
    }
    case 'fix-mail': {
      const inc = incidentFor(ctx.incidents, ['mail'], ctx.office);
      return {
        playbookId: id,
        outcome: inc ? 'partial' : 'success',
        summary: inc ? `Your mailbox is re-synced, but email is degraded (${inc.id}) — some delay is expected.` : 'Mail & calendar re-synced — 0 conflicts.',
        steps: [
          step('Checking mailbox connectivity', [`Graph API: 200 OK (${60 + Math.floor(r() * 60)} ms)`, `mailbox ${ctx.email ?? 'you'} · ${(3 + r() * 9).toFixed(1)} GB of 50 GB`]),
          step('Resetting sync state', ['Outlook profile: sync token reset', 'calendar delta link renewed']),
          step('Rebuilding the search index', [`indexed ${(30_000 + Math.floor(r() * 40_000)).toLocaleString('en-US')} items`]),
          step('Verifying', [`inbox 0 conflicts · calendar ${(800 + Math.floor(r() * 900)).toLocaleString('en-US')} events · shared mailboxes 2 ✓`]),
        ],
      };
    }
    case 'add-printer': {
      const list = PRINTERS[ctx.office];
      if (!list.length)
        return {
          playbookId: id,
          outcome: 'partial',
          summary: 'No office printer near you — Follow-me print is set up for your next office visit.',
          steps: [
            step('Discovering printers near you', ['location: remote', 'no Helix printers on this network'], 'warn'),
            step('Adding Follow-me secure queue', ['queue helix-followme added', 'release jobs at any office printer with your badge ✓']),
          ],
        };
      return {
        playbookId: id,
        outcome: 'success',
        summary: `${list[0].split(' · ')[0]} is ready — a test page is on its way.`,
        steps: [
          step(`Discovering printers near you (${ctx.office})`, list.map((p) => `found ${p}`)),
          step('Installing the driver', [isMac ? 'AirPrint + vendor PPD · signed ✓' : 'Universal PCL 6 driver · signed ✓']),
          step('Adding Follow-me secure queue', ['queue helix-followme added · release with your badge']),
          step('Printing a test page', [`test page queued to ${list[0].split(' · ')[0]} ✓`]),
        ],
      };
    }
    case 'install-software':
      return {
        playbookId: id,
        outcome: 'success',
        summary: 'Core apps are up to date. Licensed tools (Figma, Adobe CC, JetBrains…) are one request away in the Catalog.',
        steps: [
          step('Scanning installed apps', [`${120 + Math.floor(r() * 50)} apps · 3 updates available`]),
          step('Updating core apps', ['Helix Connect 5.3.0 ✓', '1Password 8.10 ✓', 'Zoom 6.2 ✓']),
          step('Checking licences', ['licensed apps need a request: Figma, Adobe CC, JetBrains, Docker Desktop, Miro']),
        ],
      };
    case 'report-phishing': {
      const t = (ctx.input ?? '').toLowerCase();
      const domain = /docusign/.test(t)
        ? 'docusign-helix[.]com'
        : /microsoft|office|365/.test(t)
          ? 'm1crosoft-support[.]net'
          : /payroll|salary|bonus/.test(t)
            ? 'helix-payroll[.]info'
            : /gift|ceo|urgent favour|urgent favor/.test(t)
              ? 'ceo-request[.]co'
              : 'secure-helix-login[.]com';
      const copies = 4 + Math.floor(r() * 22);
      return {
        playbookId: id,
        outcome: 'success',
        summary: `Phishing confirmed — ${copies} copies purged and ${domain} blocked. Thanks for reporting!`,
        steps: [
          step('Analysing message headers', ['SPF: fail · DKIM: none · DMARC: fail (p=reject)', 'Reply-To differs from From'], 'warn'),
          step('Detonating links in the sandbox', ['1 link → credential-harvest page (Helix SSO clone)', 'verdict: PHISHING · confidence 0.98'], 'warn'),
          step('Purging copies', [`found ${copies} copies across Helix inboxes · purged ✓`]),
          step('Blocking the sender', [`blocked ${domain} at the mail gateway and DNS filter ✓`]),
        ],
      };
    }
    case 'fix-display': {
      const monitor = ctx.peripherals?.find((p) => p.kind === 'monitor');
      const dock = ctx.peripherals?.find((p) => p.kind === 'dock');
      const steps = [
        step('Detecting displays', [`internal panel · external ${monitor?.model ?? 'display'} via ${dock ? dock.model : 'USB-C'}`]),
        step('Resetting display configuration', [isMac ? 'WindowServer display prefs reset' : 'display topology reset']),
      ];
      if (dock?.firmwareCurrent === false) steps.push(step('Updating dock firmware', [`${dock.model}: firmware 64.1 → 64.3 ✓`]));
      steps.push(step('Re-negotiating the link', ['5120×2880 @ 60 Hz · DSC on ✓']));
      return { playbookId: id, steps, outcome: 'success', summary: 'External display back at full resolution.' };
    }
    case 'fix-audio': {
      const headset = ctx.peripherals?.find((p) => p.kind === 'headset');
      const name = headset?.model ?? 'built-in microphone';
      return {
        playbookId: id,
        outcome: 'success',
        summary: `Audio reset — ${name} set as default and tested.`,
        steps: [
          step('Enumerating audio & video devices', [`input: ${name} · output: ${headset ? name : 'built-in speakers'}`, 'camera: FaceTime HD · 1080p']),
          step('Restarting audio services', [isMac ? 'coreaudiod restarted · VDCAssistant restarted' : 'Windows Audio service restarted']),
          step('Setting defaults', [`default input/output → ${name}`, 'echo cancellation on · noise suppression medium']),
          step('Testing', [`mic level −${14 + Math.floor(r() * 8)} dB ✓ · camera 1080p30 ✓`]),
        ],
      };
    }
    case 'speed-up': {
      const temp = d?.telemetry ? Math.round(last(d.telemetry.cpuTemp, 70)) : 78;
      const used = d?.telemetry ? last(d.telemetry.storage) : 70;
      const after = Math.max(38, Math.round(used - 4));
      const partial = after >= 90;
      return {
        playbookId: id,
        storageAfter: after,
        outcome: partial ? 'partial' : 'success',
        summary: partial ? `Running cooler now, but your disk is ${after}% full — run Clear disk space next.` : `Cooler and snappier: ${temp}°C → ${Math.max(48, temp - 18)}°C, memory pressure green.`,
        steps: [
          step('Sampling performance', ['top: Chrome Helper 142% · Docker 88% · mds_stores 61%', `memory pressure: yellow · CPU ${temp}°C`], 'warn'),
          step('Taming runaway processes', ['quit 3 idle browser renderers', 'paused Spotlight re-index (resumes tonight)']),
          step('Clearing caches', [`freed ${gb(4 + r() * 4)}`]),
          step('Checking thermals', [`${temp}°C → ${Math.max(48, temp - 18)}°C · fans ${1900 + Math.floor(r() * 500)} rpm`, 'memory pressure: green ✓']),
        ],
      };
    }
  }
}

/** Apply the device side-effects of a finished run (pure). */
export function applyPlaybookEffects(d: Device, plan: PlaybookPlan, now: number): Device {
  if (plan.outcome === 'failed') return d;
  let next: Device = { ...d, lastCheckIn: now };
  switch (plan.playbookId) {
    case 'reset-passkey':
      next = applyCheckFix(next, 'sso', now);
      break;
    case 'repair-vpn':
      next = applyCheckFix(next, 'vpn', now);
      break;
    case 'renew-wifi':
      if (next.posture) next = { ...next, posture: { ...next.posture, wifiCertExpiresAt: now + 365 * DAY } };
      break;
    case 'clear-disk':
    case 'speed-up':
      if (next.telemetry && plan.storageAfter !== undefined) {
        const t = next.telemetry;
        const temp = plan.playbookId === 'speed-up' ? [...t.cpuTemp.slice(1), Math.max(48, last(t.cpuTemp, 70) - 18)] : t.cpuTemp;
        next = { ...next, telemetry: { ...t, storage: [...t.storage.slice(1), plan.storageAfter], cpuTemp: temp } };
      }
      break;
    case 'install-software':
      next = applyCheckFix(next, 'vpn', now);
      break;
    default:
      break;
  }
  return next;
}

export const totalMs = (plan: PlaybookPlan) => plan.steps.reduce((s, x) => s + x.ms, 0);
