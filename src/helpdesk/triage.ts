/**
 * Nova Triage — a deterministic, local intent engine (pure).
 *
 * Reads a free-text description, scores it against weighted intents
 * (keywords, phrases, prefixes), blends in live context (active incidents in
 * the person's office, their device's telemetry/posture) and returns a
 * diagnosis: likely cause, evidence, confidence, a Fix-it playbook, related
 * guides and a fully prefilled ticket (category, impact, urgency, priority,
 * device, subject, description).
 */
import type { Device, DeviceKind, Impact, Incident, Office, PlaybookId, Priority, TicketCategory, Urgency } from './types';
import { priorityFor } from './sla';
import { last } from './fleet';
import { DAY } from './meta';
import { incidentFor } from './playbooks';

export type IntentId =
  | 'vpn'
  | 'wifi'
  | 'password'
  | 'mfa'
  | 'email'
  | 'calendar'
  | 'printer'
  | 'slow'
  | 'disk'
  | 'software'
  | 'access'
  | 'lost'
  | 'phishing'
  | 'display'
  | 'av';

interface IntentDef {
  id: IntentId;
  title: string;
  category: TicketCategory;
  playbookId?: PlaybookId;
  guides: string[];
  /** Device kind the issue usually concerns. */
  deviceKind?: DeviceKind;
  /** term → weight (single words also match as prefixes when ≥ 4 chars). */
  terms: Record<string, number>;
  cause: string;
  security?: boolean;
}

export const INTENTS: IntentDef[] = [
  {
    id: 'vpn',
    title: 'VPN connection problem',
    category: 'network',
    playbookId: 'repair-vpn',
    guides: ['vpn-connect'],
    deviceKind: 'laptop',
    terms: { vpn: 3, 'helix connect': 3, tunnel: 2, wireguard: 3, 'remote access': 2, 'internal sites': 2.5, intranet: 1.5, 'split dns': 2, disconnect: 1.2, drops: 1, dropping: 1, 'keeps dropping': 1.2, 'cant reach': 1, ssh: 0.6, gateway: 1 },
    cause: 'The VPN client is holding on to an unhealthy gateway, so keep-alives time out and the tunnel resets.',
  },
  {
    id: 'wifi',
    title: 'Wi-Fi connectivity',
    category: 'network',
    playbookId: 'renew-wifi',
    guides: ['wifi-certificate'],
    deviceKind: 'laptop',
    terms: { wifi: 3, 'wi fi': 3, wireless: 2.5, 'helix corp': 3, ssid: 2, 'no internet': 2, internet: 1, 'access point': 2, '802.1x': 3, certificate: 1, signal: 1.5, 'meeting room': 0.6, 'meeting rooms': 0.6, network: 0.8 },
    cause: 'Office Wi-Fi uses a per-device certificate; when it nears expiry the access points start rejecting re-authentication.',
  },
  {
    id: 'password',
    title: 'Sign-in or password issue',
    category: 'access',
    playbookId: 'reset-passkey',
    guides: ['passkey-setup', 'request-access'],
    deviceKind: 'laptop',
    terms: { password: 3, 'locked out': 3.5, 'lock out': 2.5, login: 1.5, 'log in': 1.5, 'sign in': 1.5, signin: 1.5, sso: 2, okta: 2, forgot: 2, expired: 0.8, passkey: 3, 'touch id': 2, reset: 0.8, 'keeps asking': 1.5 },
    cause: 'Your device-trust certificate or passkey is stale, so single sign-on keeps rejecting the session.',
  },
  {
    id: 'mfa',
    title: 'MFA or authenticator',
    category: 'access',
    playbookId: 'reset-passkey',
    guides: ['mfa-new-phone', 'passkey-setup'],
    deviceKind: 'phone',
    terms: { mfa: 3.5, '2fa': 3.5, authenticator: 3.5, 'two factor': 3, 'one time code': 2.5, otp: 2.5, 'verification code': 2.5, 'new phone': 2, 'push prompt': 1.5, 'push notification': 1, yubikey: 1.5, 'security key': 1.5 },
    cause: 'Your second factor is still bound to an old device or the authenticator lost its registration.',
  },
  {
    id: 'email',
    title: 'Mail sync problem',
    category: 'email',
    playbookId: 'fix-mail',
    guides: ['outlook-sync'],
    deviceKind: 'laptop',
    terms: { email: 2.5, emails: 2.5, 'e mail': 2.5, mail: 2, outlook: 3, inbox: 2.5, 'not syncing': 2, sync: 1, syncing: 1, mailbox: 2.5, 'out of office': 2, 'shared inbox': 2.5, receive: 0.8, bounce: 1.5 },
    cause: 'Outlook’s local sync token drifted from the server, so new items stop arriving until the cache is rebuilt.',
  },
  {
    id: 'calendar',
    title: 'Calendar problem',
    category: 'email',
    playbookId: 'fix-mail',
    guides: ['outlook-sync'],
    deviceKind: 'laptop',
    terms: { calendar: 3, invite: 2.5, invites: 2.5, invitation: 2.5, 'not showing': 1, 'time zone': 1.5, 'room booking': 2, 'busy free': 1.5 },
    cause: 'Calendar delta sync is stuck on an old token, so new or external invites don’t render.',
  },
  {
    id: 'printer',
    title: 'Printing problem',
    category: 'hardware',
    playbookId: 'add-printer',
    guides: ['add-printer'],
    terms: { printer: 3, print: 2.5, printing: 2.5, 'paper jam': 3, jam: 2, jams: 2, jamming: 2, toner: 3, scanner: 2, duplex: 2, 'double sided': 2 },
    cause: 'The print queue or driver on your machine is out of date for this printer, or the printer itself needs attention.',
  },
  {
    id: 'slow',
    title: 'Slow or overheating laptop',
    category: 'hardware',
    playbookId: 'speed-up',
    guides: ['slow-laptop', 'free-disk-space'],
    deviceKind: 'laptop',
    terms: { slow: 2.5, sluggish: 2.5, lag: 2, laggy: 2, freezes: 2, freezing: 2, frozen: 1.5, 'spinning wheel': 2.5, beachball: 2.5, fans: 2.5, fan: 2, hot: 1.5, overheating: 2.5, 'takes forever': 2, unresponsive: 2, crash: 0.8, crashes: 0.8 },
    cause: 'A few runaway processes plus low free disk space are forcing heavy swapping and thermal throttling.',
  },
  {
    id: 'disk',
    title: 'Disk almost full',
    category: 'hardware',
    playbookId: 'clear-disk',
    guides: ['free-disk-space'],
    deviceKind: 'laptop',
    terms: { disk: 2.5, storage: 2.5, 'disk full': 3.5, 'out of space': 3.5, 'low space': 3, 'no space': 3, 'free up': 2, 'startup disk': 3, 'almost full': 2.5 },
    cause: 'Caches, build artefacts and old installers have filled the startup disk.',
  },
  {
    id: 'software',
    title: 'Software install or licence',
    category: 'software',
    playbookId: 'install-software',
    guides: ['install-software'],
    deviceKind: 'laptop',
    terms: { install: 2.5, installing: 2.5, licence: 3, license: 3, 'admin rights': 2.5, 'admin password': 2, 'self service': 2, application: 1, activation: 2, figma: 1.5, docker: 1.5, jetbrains: 1.5, intellij: 1.5, adobe: 1.5, photoshop: 1.5, plugin: 1, plugins: 1, homebrew: 1.5 },
    cause: 'The app needs a licensed seat or an approved installer from Self Service — local admin installs are blocked.',
  },
  {
    id: 'access',
    title: 'Access to a system',
    category: 'access',
    guides: ['request-access'],
    terms: { access: 2.5, permission: 2, permissions: 2, 'request access': 3.5, 'need access': 3.5, grant: 1.2, denied: 1.5, '403': 2, 'not authorized': 2.5, unauthorized: 2.5, github: 1, aws: 1.5, salesforce: 1.5, grafana: 1.5, repo: 1, 'production database': 2, 'read only': 1 },
    cause: 'Your account isn’t in the group that grants this system yet — access is approved by your manager and the system owner.',
  },
  {
    id: 'lost',
    title: 'Lost or stolen device',
    category: 'security',
    guides: ['lost-device'],
    security: true,
    terms: {
      lost: 2,
      'lost my': 1.5,
      'lost my phone': 4,
      'lost my laptop': 4,
      stolen: 4,
      theft: 4,
      'left my': 2,
      missing: 1.5,
      'cant find': 2.5,
      misplaced: 3,
      taxi: 1.5,
      airport: 1,
      robbed: 4,
      snatched: 3,
      'left it': 1.5,
      // connectivity / account wording means "lost connection", not a lost device
      connection: -3,
      connectivity: -3,
      signal: -2,
      vpn: -3,
      wifi: -2,
      'wi fi': -2,
      password: -2,
      access: -2,
      data: -1.5,
    },
    cause: 'A missing device is a security incident: we lock it remotely and rotate its keys before anything else.',
  },
  {
    id: 'phishing',
    title: 'Suspected phishing',
    category: 'security',
    playbookId: 'report-phishing',
    guides: ['report-phishing'],
    security: true,
    terms: { phishing: 4, phish: 4, suspicious: 2.5, scam: 3, spam: 1.2, fake: 2, 'clicked a link': 3.5, clicked: 1, 'gift card': 3, docusign: 2, 'verify your account': 3, 'strange email': 3, 'weird email': 3, malware: 3, virus: 3, hacked: 3, 'sign in alert': 2, 'entered my password': 3, 'typed my password': 3, link: 0.8 },
    cause: 'This has the hallmarks of a credential-harvesting email: spoofed sender, urgent tone and a fake sign-in link.',
  },
  {
    id: 'display',
    title: 'Monitor or dock issue',
    category: 'hardware',
    playbookId: 'fix-display',
    guides: ['external-display'],
    deviceKind: 'monitor',
    terms: { monitor: 3, display: 2.5, screen: 1.2, dock: 3, docking: 3, 'external display': 3.5, flicker: 2.5, flickers: 2.5, flickering: 2.5, 'no signal': 3, hdmi: 2.5, thunderbolt: 2, 'second screen': 3, resolution: 1.5, docked: 2.5 },
    cause: 'The display link is negotiating at the wrong mode — usually stale display prefs or outdated dock firmware.',
  },
  {
    id: 'av',
    title: 'Camera or audio issue',
    category: 'hardware',
    playbookId: 'fix-audio',
    guides: ['camera-audio'],
    deviceKind: 'headset',
    terms: { camera: 3, webcam: 3, microphone: 3, mic: 2.5, audio: 2.5, sound: 2, headset: 2.5, speaker: 2, speakers: 2, echo: 2, 'cant hear': 3, 'cannot hear': 3, robotic: 2.5, airpods: 2, bluetooth: 1.2, zoom: 1, meet: 0.6, muffled: 2 },
    cause: 'Your meeting app grabbed the wrong input device, or the audio daemon needs a restart after a sleep/wake cycle.',
  },
];

const BY_ID = Object.fromEntries(INTENTS.map((i) => [i.id, i])) as Record<IntentId, IntentDef>;
export const intentById = (id: IntentId) => BY_ID[id];

/** Lowercase, straighten quotes, drop apostrophes ("can't" → "cant"), hyphens → spaces, collapse punctuation. */
export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’`´']/g, '')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9.+\s]/g, ' ')
    .replace(/\.(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function termHits(norm: string, tokens: string[], term: string): boolean {
  const t = normalize(term).trim();
  if (!t) return false;
  if (t.includes(' ')) return norm.includes(` ${t} `);
  if (t.length >= 4) return tokens.some((tok) => tok.startsWith(t));
  return tokens.includes(t);
}

export interface TriageContext {
  now: number;
  office: Office;
  /** The person's active devices. */
  devices: Device[];
  /** Unresolved incidents. */
  incidents: Incident[];
}

export interface TriageSignal {
  tone: 'info' | 'warn' | 'bad' | 'good';
  text: string;
}

export interface TriageResult {
  intent: IntentId | null;
  title: string;
  confidence: number;
  cause: string;
  signals: TriageSignal[];
  playbookId?: PlaybookId;
  guides: string[];
  security: boolean;
  matched: string[];
  alternatives: { intent: IntentId; title: string; confidence: number }[];
  ticket: {
    category: TicketCategory;
    impact: Impact;
    urgency: Urgency;
    priority: Priority;
    subject: string;
    description: string;
    deviceTag?: string;
  };
  incidentId?: string;
}

const TEAM_RE = /\b(my team|our team|whole team|the team|we all|all of us|several of us|colleagues|teammates|everyone (on|in) (my|our|the) (team|squad)|my squad)\b/;
const COMPANY_STRONG_RE = /\b(whole company|entire company|entire office|whole office|all offices|nobody can|no one can|company wide|all users|whole floor)\b/;
const COMPANY_RE = /\b(everyone|everybody)\b/;
const HIGH_RE = /\b(cant work|cannot work|cant do any|blocked|blocking|urgent|asap|right now|immediately|deadline|outage|down for|completely down|is down|customer call|client call|demo|presentation|board meeting|stolen|clicked|entered my password)\b/;
const LOW_RE = /\b(sometimes|occasionally|minor|no rush|when you can|whenever|nice to have|low priority|not urgent|once in a while|every now and then)\b/;

/** "the whole team can't…" → team; "nobody in the office…" → company. */
export function detectImpact(text: string): Impact {
  const norm = normalize(text);
  if (COMPANY_STRONG_RE.test(norm)) return 'company';
  if (TEAM_RE.test(norm)) return 'team';
  if (COMPANY_RE.test(norm)) return 'company';
  return 'me';
}

export function detectUrgency(text: string): Urgency {
  const norm = normalize(text);
  return HIGH_RE.test(norm) ? 'high' : LOW_RE.test(norm) ? 'low' : 'normal';
}

const KIND_WORDS: [DeviceKind, RegExp][] = [
  ['security-key', /\b(yubikey|security key)\b/],
  ['monitor', /\b(monitor|external display|second screen|display|xdr)\b/],
  ['dock', /\b(dock|docking station|docked)\b/],
  ['headset', /\b(headset|headphones|airpods|jabra|earbuds)\b/],
  ['tablet', /\b(ipad|tablet)\b/],
  ['phone', /\b(phone|iphone|mobile|android|pixel)\b/],
  ['keyboard', /\b(keyboard)\b/],
  ['laptop', /\b(laptop|macbook|mac|notebook|thinkpad|xps|computer|pc)\b/],
];

function mentionedKind(norm: string): DeviceKind | undefined {
  return KIND_WORDS.find(([, re]) => re.test(norm))?.[0];
}

function pickDevice(devices: Device[], kind: DeviceKind | undefined): Device | undefined {
  if (!kind) return undefined;
  const active = devices.filter((d) => d.status === 'in_use' || d.status === 'loaner');
  return active.find((d) => d.kind === kind) ?? (kind === 'monitor' ? active.find((d) => d.kind === 'dock') : undefined);
}

/** First sentence of the user's words as a subject (≤ 72 chars). */
export function subjectFrom(text: string, fallback: string): string {
  const first = text
    .trim()
    .split(/(?<=[.!?])\s|\n/)[0]
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:\s]+$/, '')
    .trim();
  if (first.length < 12) return fallback;
  const cut = first.length > 72 ? `${first.slice(0, 70).replace(/\s+\S*$/, '')}…` : first;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

export function triage(text: string, ctx: TriageContext, opts: { intent?: IntentId } = {}): TriageResult {
  const norm = normalize(text);
  const tokens = norm.trim().split(' ').filter(Boolean);

  // 1) keyword scores
  const scored = INTENTS.map((def) => {
    const matched: string[] = [];
    let score = 0;
    for (const [term, w] of Object.entries(def.terms)) {
      if (termHits(norm, tokens, term)) {
        score += w;
        if (w > 0) matched.push(term);
      }
    }
    return { def, score, matched };
  });

  // 2) context boosts + evidence
  const active = ctx.devices.filter((d) => d.status === 'in_use' || d.status === 'loaner');
  const laptop = active.find((d) => d.kind === 'laptop') ?? active.find((d) => d.kind === 'desktop');
  const evidence: Partial<Record<IntentId, TriageSignal[]>> = {};
  const addEv = (id: IntentId, s: TriageSignal) => (evidence[id] = [...(evidence[id] ?? []), s]);
  const boost = (id: IntentId, by: number) => {
    const row = scored.find((x) => x.def.id === id);
    if (row && row.score > 0) row.score += by;
  };

  const vpnInc = incidentFor(ctx.incidents, ['vpn'], ctx.office);
  if (vpnInc) {
    addEv('vpn', { tone: 'bad', text: `Active incident ${vpnInc.id}: ${vpnInc.title}` });
    boost('vpn', 2.5);
  }
  const wifiInc = incidentFor(ctx.incidents, [`wifi-${ctx.office.slice(0, 3).toLowerCase()}`], ctx.office);
  if (wifiInc) {
    addEv('wifi', { tone: 'bad', text: `Active incident ${wifiInc.id}: ${wifiInc.title}` });
    boost('wifi', 2.5);
  }
  const mailInc = incidentFor(ctx.incidents, ['mail'], ctx.office);
  if (mailInc) {
    addEv('email', { tone: 'bad', text: `Active incident ${mailInc.id}: ${mailInc.title}` });
    addEv('calendar', { tone: 'bad', text: `Active incident ${mailInc.id}: ${mailInc.title}` });
    boost('email', 2);
  }
  if (laptop) {
    const name = `${laptop.model} (${laptop.assetTag})`;
    if (laptop.posture?.vpnClient === 'outdated') {
      addEv('vpn', { tone: 'warn', text: `${name}: Helix Connect is out of date (5.2.1 → 5.3.0)` });
      boost('vpn', 1.5);
    }
    if (laptop.posture) {
      const certDays = Math.round((laptop.posture.wifiCertExpiresAt - ctx.now) / DAY);
      if (certDays < 7) {
        addEv('wifi', { tone: 'warn', text: certDays < 0 ? `Your Wi-Fi certificate expired ${-certDays} days ago` : `Your Wi-Fi certificate expires in ${certDays} days` });
        boost('wifi', 1.5);
      }
      const trustDays = (laptop.posture.ssoExpiresAt - ctx.now) / DAY;
      if (trustDays < 3) {
        const s: TriageSignal = { tone: trustDays < 0 ? 'bad' : 'warn', text: trustDays < 0 ? 'Your device-trust certificate has expired' : 'Your device-trust certificate expires in under 3 days' };
        addEv('password', s);
        addEv('mfa', s);
        boost('password', 1.5);
      }
    }
    if (laptop.telemetry) {
      const used = last(laptop.telemetry.storage);
      if (used >= 85) {
        const s: TriageSignal = { tone: used >= 90 ? 'bad' : 'warn', text: `${name}: startup disk is ${Math.round(used)}% full` };
        addEv('disk', s);
        addEv('slow', s);
        boost('disk', 1.5);
        boost('slow', 1.2);
      }
      const temp = last(laptop.telemetry.cpuTemp, 60);
      if (temp >= 85) {
        addEv('slow', { tone: 'warn', text: `${name}: CPU running hot (${Math.round(temp)}°C)` });
        boost('slow', 1);
      }
    }
  }
  const dock = active.find((d) => d.kind === 'dock' && d.firmwareCurrent === false);
  if (dock) {
    addEv('display', { tone: 'warn', text: `${dock.model} (${dock.assetTag}) has a firmware update pending` });
    boost('display', 1);
  }

  scored.sort((a, b) => b.score - a.score);
  if (opts.intent) {
    const i = scored.findIndex((x) => x.def.id === opts.intent);
    if (i > 0) {
      const [row] = scored.splice(i, 1);
      row.score = Math.max(row.score, scored[0].score + 1, 3);
      scored.unshift(row);
    }
  }
  const top = scored[0];
  const second = scored[1];
  const hasIntent = top.score >= 1.5;
  const def = hasIntent ? top.def : null;

  const margin = hasIntent ? Math.min(1, (top.score - (second?.score ?? 0)) / Math.max(1, top.score)) : 0;
  const confidence = hasIntent ? Math.min(0.97, Math.max(0.42, 0.3 + 0.07 * top.score + 0.2 * margin)) : Math.min(0.3, 0.12 + 0.06 * top.score);

  // 3) impact & urgency
  const impact: Impact = detectImpact(text);
  let urgency: Urgency = detectUrgency(text);
  if (def?.id === 'lost') urgency = 'high';
  const category: TicketCategory = def?.category ?? 'other';
  let priority = priorityFor(impact, urgency, category);
  const credentialRisk = def?.id === 'phishing' && /\b(clicked|entered my password|typed my password|gave my password|opened the attachment)\b/.test(norm);
  if (def?.id === 'lost' || credentialRisk) priority = 'P1';

  // 4) device
  const kind = mentionedKind(norm) ?? def?.deviceKind;
  const laptopFallback = !!def && def.category !== 'access' && def.category !== 'security' && def.deviceKind !== 'phone';
  const device = pickDevice(active, kind) ?? (laptopFallback ? laptop : undefined);

  // 5) narrative
  const signals: TriageSignal[] = [...(def ? (evidence[def.id] ?? []) : [])];
  if (device) signals.push({ tone: 'info', text: `Looking at ${device.model} · ${device.assetTag}` });
  if (credentialRisk) signals.unshift({ tone: 'bad', text: 'You may have entered your password — we’ll reset it and revoke sessions' });
  if (def?.id === 'lost') signals.unshift({ tone: 'bad', text: 'Security incident: remote lock + key rotation start as soon as you report it' });

  let cause = def?.cause ?? 'I couldn’t match this to a known issue with confidence — a specialist will take a look.';
  if (def?.id === 'vpn' && vpnInc) cause = `There’s a known incident degrading VPN in ${ctx.office}. The Fix-it routes you through a healthy gateway while the provider repairs it.`;
  if (def?.id === 'disk' || def?.id === 'slow') {
    const used = laptop?.telemetry ? last(laptop.telemetry.storage) : 0;
    if (used >= 85 && def.id === 'slow') cause = `Your disk is ${Math.round(used)}% full, which forces heavy swapping — and a few runaway processes are keeping the CPU hot.`;
  }
  if (credentialRisk) cause = 'If you entered your password on that page, treat it as compromised. Report it now — Security resets your credentials and revokes sessions.';

  const title = def?.title ?? 'Something else';
  const subject = subjectFrom(text, title);
  const evidenceLines = signals.filter((s) => s.tone !== 'info').map((s) => `• ${s.text}`);
  const description = [text.trim(), evidenceLines.length ? `\nNova diagnostics:\n${evidenceLines.join('\n')}` : ''].join('\n').trim();

  return {
    intent: def?.id ?? null,
    title,
    confidence: Math.round(confidence * 100) / 100,
    cause,
    signals,
    playbookId: def?.id === 'lost' ? undefined : def?.playbookId,
    guides: def?.guides ?? [],
    security: !!def?.security,
    matched: hasIntent ? top.matched : [],
    alternatives: scored
      .slice(1, 4)
      .filter((s) => s.score >= 1.5)
      .map((s) => ({ intent: s.def.id, title: s.def.title, confidence: Math.round(Math.min(0.9, 0.2 + 0.07 * s.score) * 100) / 100 })),
    ticket: { category, impact, urgency, priority, subject, description, deviceTag: device?.assetTag },
    incidentId: def?.id === 'vpn' ? vpnInc?.id : def?.id === 'wifi' ? wifiInc?.id : def?.id === 'email' || def?.id === 'calendar' ? mailInc?.id : undefined,
  };
}

/** Map a free-form category from another app ("vpn", "laptop", "Access") to ours. */
export function mapCategory(input: string | undefined, fallbackText = ''): TicketCategory {
  const s = (input ?? '').toLowerCase().trim();
  const direct: Record<string, TicketCategory> = {
    hardware: 'hardware',
    device: 'hardware',
    laptop: 'hardware',
    software: 'software',
    app: 'software',
    licence: 'software',
    license: 'software',
    access: 'access',
    account: 'access',
    accounts: 'access',
    permissions: 'access',
    network: 'network',
    vpn: 'network',
    wifi: 'network',
    'wi-fi': 'network',
    email: 'email',
    mail: 'email',
    calendar: 'email',
    security: 'security',
    phishing: 'security',
    incident: 'security',
    other: 'other',
  };
  if (direct[s]) return direct[s];
  for (const [k, v] of Object.entries(direct)) if (s && s.includes(k)) return v;
  const guess = triage(`${input ?? ''} ${fallbackText}`, { now: Date.now(), office: 'Remote', devices: [], incidents: [] });
  return guess.intent ? guess.ticket.category : 'other';
}

/** Suggestion chips for the Nova prompt. */
export const TRIAGE_SUGGESTIONS = [
  'My VPN keeps dropping every few minutes',
  'Laptop is really slow and the fans are loud',
  'I think I clicked a phishing link',
  'Outlook stopped syncing my inbox',
  'My external monitor flickers when docked',
  'I left my phone in a taxi',
];
