/**
 * Store-level tests: every action re-checks permissions "server-side",
 * writes the audit trail and drives real state transitions.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

type HubMod = typeof import('@/store/hub');
type StoreMod = typeof import('./store');
type BridgeMod = typeof import('./public');
let hub: HubMod['useHub'];
let store: StoreMod['useHelpdesk'];
let runtime: StoreMod['HD_RUNTIME'];
let api: BridgeMod['api'];
let viewerOf: () => ReturnType<typeof import('@/lib/appBridge').currentViewer>;

beforeAll(async () => {
  mem.set('nexus.helpdesk.v2', '{"legacy":true}');
  ({ useHub: hub } = await import('@/store/hub'));
  ({ useHelpdesk: store, HD_RUNTIME: runtime } = await import('./store'));
  ({ api } = await import('./public'));
  ({ currentViewer: viewerOf } = await import('@/lib/appBridge'));
  runtime.simulate = false;
  runtime.bridges = false;
});

beforeEach(() => {
  hub.getState().resetDemo();
  store.getState().resetDemo();
});

const s = () => store.getState();
const as = (id: string) => expect(hub.getState().login(id).ok).toBe(true);
const ticket = (id: string) => s().tickets.find((t) => t.id === id)!;
const device = (tag: string) => s().devices.find((d) => d.assetTag === tag)!;
const lastAudit = () => hub.getState().audit[0];

describe('persistence', () => {
  it('removes the legacy helpdesk key on load', () => {
    expect(mem.has('nexus.helpdesk.v2')).toBe(false);
  });
});

describe('tickets', () => {
  it('validates and creates a ticket with auto priority, SLA and Nova triage note', () => {
    as('u-mei');
    expect(s().createTicket({ subject: 'no', category: 'hardware' }).ok).toBe(false);
    const r = s().createTicket({ subject: 'Monitor flickers', category: 'hardware', impact: 'team', urgency: 'high', deviceTag: 'HX-MON-0188' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ticket.id).toBe('HX-1059');
    expect(r.ticket.priority).toBe('P1');
    expect(r.ticket.requesterId).toBe('u-mei');
    expect(r.ticket.events.some((e) => e.kind === 'automation' && /Nova triaged/.test(e.body ?? ''))).toBe(true);
  });

  it('won’t link someone else’s device', () => {
    as('u-mei');
    expect(s().createTicket({ subject: 'Borrowed laptop', category: 'hardware', deviceTag: 'HX-MBP-0142' }).ok).toBe(false);
  });

  it('links network tickets to an active incident in the requester’s office', () => {
    as('u-hana');
    const r = s().createTicket({ subject: 'VPN slow again', category: 'network' });
    expect(r.ok && r.ticket.incidentId).toBe('INC-311');
  });

  it('only IT can file on behalf of others', () => {
    as('u-mei');
    expect(s().createTicket({ subject: 'For Hana', category: 'other', requesterId: 'u-hana' }).ok).toBe(false);
    as('u-layla');
    const r = s().createTicket({ subject: 'For Hana', category: 'other', requesterId: 'u-hana' });
    expect(r.ok && r.ticket.requesterId).toBe('u-hana');
  });

  it('simulated pickup assigns a category-aware agent and replies', () => {
    as('u-mei');
    const r = s().createTicket({ subject: 'Printer offline', category: 'hardware' });
    if (!r.ok) throw new Error(r.error);
    s().simulatePickup(r.ticket.id);
    const t = ticket(r.ticket.id);
    expect(t.assigneeId).toBe('u-mateo');
    expect(t.status).toBe('in_progress');
    expect(t.firstResponseAt).toBeDefined();
    expect(t.events.some((e) => e.kind === 'reply' && e.actorId === 'u-mateo')).toBe(true);
    expect(hub.getState().notifications.some((n) => n.userId === 'u-mei' && n.link === `/helpdesk/tickets/${t.id}`)).toBe(true);
  });

  it('a requester reply moves "waiting" back to in progress and unpauses the SLA', () => {
    as('u-mei');
    expect(ticket('HX-1045').status).toBe('waiting');
    expect(s().reply('HX-1045', 'Here is the console error: CSP blocked plugin-cdn').ok).toBe(true);
    const t = ticket('HX-1045');
    expect(t.status).toBe('in_progress');
    expect(t.pausedAt).toBeUndefined();
    expect(t.pausedMs).toBeGreaterThan(0);
  });

  it('keeps internal notes away from requesters and blocks them from writing one', () => {
    as('u-omar');
    expect(s().reply('HX-1042', 'sneaky', { internal: true }).ok).toBe(false);
    expect(lastAudit()).toMatchObject({ outcome: 'denied', actorId: 'u-omar' });
  });

  it('blocks access to other people’s tickets', () => {
    as('u-alex');
    expect(s().reply('HX-1042', 'hi').ok).toBe(false);
    expect(s().assign('HX-1047', 'u-mateo').ok).toBe(false);
    expect(s().setStatus('HX-1047', 'resolved').ok).toBe(false);
  });

  it('agents can assign, reply (first response) and resolve; requesters can confirm & rate', () => {
    as('u-layla');
    expect(s().assign('HX-1052', 'u-layla').ok).toBe(true);
    expect(ticket('HX-1052').status).toBe('triaged');
    expect(s().reply('HX-1052', 'Added you to grafana-viewers.').ok).toBe(true);
    expect(ticket('HX-1052').firstResponseAt).toBeDefined();
    expect(ticket('HX-1052').status).toBe('in_progress');
    expect(s().setStatus('HX-1052', 'resolved', { resolution: 'fixed' }).ok).toBe(true);
    as('u-kwame');
    expect(s().rate('HX-1052', 6).ok).toBe(false);
    expect(s().rate('HX-1052', 5, 'Speedy!').ok).toBe(true);
    expect(s().rate('HX-1052', 4).ok).toBe(false);
    expect(ticket('HX-1052').csat?.score).toBe(5);
  });

  it('requester can confirm a fix and reopen it later', () => {
    as('u-omar');
    expect(s().confirmFixed('HX-1042').ok).toBe(true);
    expect(ticket('HX-1042').status).toBe('resolved');
    expect(s().reopen('HX-1042', 'Dropped again').ok).toBe(true);
    expect(ticket('HX-1042').status).toBe('in_progress');
    expect(ticket('HX-1042').resolvedAt).toBeUndefined();
  });

  it('escalation to Security is audited and reassigns', () => {
    as('u-layla');
    expect(s().escalate('HX-1053').ok).toBe(true);
    const t = ticket('HX-1053');
    expect(t).toMatchObject({ category: 'security', escalated: true, assigneeId: 'u-ethan' });
    expect(lastAudit()).toMatchObject({ action: 'helpdesk.ticket.escalate', severity: 'warning' });
  });

  it('macros fill in the requester’s name and apply a status', () => {
    as('u-layla');
    expect(s().applyMacro('HX-1053', 'm-screenshot').ok).toBe(true);
    const t = ticket('HX-1053');
    expect(t.events.find((e) => e.macroId === 'm-screenshot')?.body).toMatch(/^Hi Sofia,/);
    expect(t.assigneeId).toBe('u-layla');
    expect(t.status).toBe('waiting');
  });

  it('grab next takes the most urgent unassigned ticket', () => {
    as('u-layla');
    const r = s().grabNext();
    expect(r.ok && r.ticketId).toBe('HX-1054');
  });
});

describe('devices', () => {
  it('reveals a recovery key only to the owner or IT, and audits it', () => {
    as('u-mei');
    expect(s().revealRecoveryKey('HX-MBP-0142').ok).toBe(false);
    expect(lastAudit()).toMatchObject({ action: 'helpdesk.recovery_key.reveal', outcome: 'denied', severity: 'critical' });
    as('u-omar');
    const r = s().revealRecoveryKey('HX-MBP-0142');
    expect(r.ok && r.key).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    expect(lastAudit()).toMatchObject({ action: 'helpdesk.recovery_key.reveal', outcome: 'success', severity: 'warning' });
  });

  it('reporting a device lost opens a P1 security ticket, locks it and audits critically', () => {
    as('u-omar');
    const r = s().reportLost('HX-PHN-0451', { where: 'Dubai Mall taxi rank', when: 'tonight 9pm', stolen: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = ticket(r.ticketId);
    expect(t).toMatchObject({ priority: 'P1', category: 'security', escalated: true, assigneeId: 'u-ethan' });
    const d = device('HX-PHN-0451');
    expect(d.status).toBe('lost');
    expect(d.locked).toBe(true);
    expect(d.mdm[0]).toMatchObject({ action: 'lock', state: 'completed' });
    expect(hub.getState().audit.some((a) => a.action === 'helpdesk.device.lost' && a.severity === 'critical')).toBe(true);
  });

  it('health fixes are owner-only and genuinely improve the device', () => {
    as('u-omar');
    expect(s().applyHealthFix('HX-MBP-0187', 'firewall').ok).toBe(false);
    as('u-mei');
    expect(s().applyHealthFix('HX-MBP-0187', 'firewall').ok).toBe(true);
    expect(device('HX-MBP-0187').compliance?.firewall).toBe(true);
  });

  it('MDM wipe requires IT and typing the asset tag', () => {
    as('u-omar');
    expect(s().mdmAction('HX-MBP-0142', 'sync').ok).toBe(false);
    as('u-layla');
    expect(s().mdmAction('HX-MBP-0145', 'wipe').ok).toBe(false);
    expect(s().mdmAction('HX-MBP-0145', 'wipe', { confirmTag: 'hx-mbp-0145' }).ok).toBe(true);
    expect(lastAudit()).toMatchObject({ action: 'helpdesk.mdm.wipe', severity: 'critical' });
    expect(s().mdmAction('HX-MBP-0142', 'push_update').ok).toBe(true);
    expect(device('HX-MBP-0142').compliance?.osCurrent).toBe(true);
  });

  it('assigning keeps a custody log, and registration auto-tags', () => {
    as('u-layla');
    expect(s().assignDevice('HX-MBP-0440', 'u-kwame', 'Second machine for GPU work').ok).toBe(true);
    const d = device('HX-MBP-0440');
    expect(d).toMatchObject({ status: 'in_use', assigneeId: 'u-kwame' });
    expect(d.custody.at(-1)).toMatchObject({ kind: 'assigned', userId: 'u-kwame' });
    const r = s().registerDevice({ kind: 'monitor', manufacturer: 'Dell', model: 'Dell U3225QE', serial: 'ABC1234', office: 'London' });
    expect(r.ok && r.assetTag).toBe('HX-MON-0467');
    expect(s().registerDevice({ kind: 'monitor', manufacturer: 'Dell', model: 'Dell U3225QE', serial: 'ABC1234', office: 'London' }).ok).toBe(false);
  });

  it('loaners check out and back in', () => {
    as('u-layla');
    expect(s().checkoutLoaner('HX-MBA-0420', 'u-hana', Date.now() + 7 * 86_400_000).ok).toBe(true);
    expect(device('HX-MBA-0420').status).toBe('loaner');
    expect(s().checkinLoaner('HX-MBA-0420').ok).toBe(true);
    expect(device('HX-MBA-0420')).toMatchObject({ status: 'in_stock', assigneeId: undefined });
  });

  it('tags support create, bulk apply and delete with undo', () => {
    as('u-layla');
    const r = s().createTag({ name: '#Field Kit', color: '#22c55e', description: 'Rugged gear' });
    expect(r.ok && r.tag.name).toBe('field-kit');
    if (!r.ok) return;
    expect(s().bulkTag(['HX-MBA-0420', 'HX-MBA-0301'], r.tag.id, true).ok).toBe(true);
    const del = s().deleteTag(r.tag.id);
    expect(del.ok).toBe(true);
    expect(device('HX-MBA-0420').tags).not.toContain(r.tag.id);
    if (del.ok) s().restoreTag(del.snapshot);
    expect(device('HX-MBA-0420').tags).toContain(r.tag.id);
    as('u-mei');
    expect(s().createTag({ name: 'nope', color: '#22c55e', description: '' }).ok).toBe(false);
  });
});

describe('catalog requests', () => {
  it('contractors are blocked from laptops but can request a YubiKey', () => {
    as('u-alex');
    expect(s().submitRequest('cat-mbp14', { justification: 'Need a faster laptop' }).ok).toBe(false);
    const r = s().submitRequest('cat-yubikey', {});
    expect(r.ok).toBe(true);
  });

  it('Omar approves Hana’s request, which then waits on IT', () => {
    as('u-mei');
    expect(s().decideRequest('REQ-2041', true).ok).toBe(false);
    as('u-omar');
    expect(s().decideRequest('REQ-2041', false).ok).toBe(false); // deny needs a note
    expect(s().decideRequest('REQ-2041', true).ok).toBe(true);
    const r = s().requests.find((x) => x.id === 'REQ-2041')!;
    expect(r.steps[0]).toMatchObject({ state: 'approved', decidedBy: 'u-omar' });
    expect(r.steps[1].state).toBe('pending');
    expect(hub.getState().notifications.some((n) => n.userId === 'u-hana' && n.kind === 'request')).toBe(true);
  });

  it('IT fulfils an approved hardware request with a matching stock device', () => {
    as('u-layla');
    expect(s().fulfilRequest('REQ-2040', {}).ok).toBe(false);
    expect(s().fulfilRequest('REQ-2040', { deviceTag: 'HX-MBP-0440' }).ok).toBe(false); // wrong kind
    expect(s().fulfilRequest('REQ-2040', { deviceTag: 'HX-KBD-0452', note: 'At the London IT bar' }).ok).toBe(true);
    expect(device('HX-KBD-0452')).toMatchObject({ status: 'in_use', assigneeId: 'u-aisha' });
    expect(s().requests.find((x) => x.id === 'REQ-2040')?.status).toBe('fulfilled');
  });

  it('sensitive access needs Security after IT', () => {
    as('u-sara');
    expect(s().decideRequest('REQ-2035', true).ok).toBe(false); // People Ops is IT but not Security
    as('u-layla');
    expect(s().decideRequest('REQ-2035', true).ok).toBe(true);
    expect(s().requests.find((x) => x.id === 'REQ-2035')?.status).toBe('approved');
  });
});

describe('self-service & status', () => {
  it('recording a fix applies device effects and logs a resolved self-service ticket', async () => {
    as('u-sofia');
    const { planPlaybook } = await import('./playbooks');
    const plan = planPlaybook('clear-disk', { now: Date.now(), office: 'Remote', device: device('HX-MBP-0211'), incidents: [] });
    const r = s().recordFix({ plan, deviceTag: 'HX-MBP-0211' });
    expect(r.ok).toBe(true);
    if (!r.ok || !r.ticketId) throw new Error('no ticket');
    expect(ticket(r.ticketId)).toMatchObject({ status: 'resolved', resolution: { code: 'self_service' } });
    expect(device('HX-MBP-0211').telemetry!.storage.at(-1)).toBe(plan.storageAfter);
  });

  it('only IT can post incident updates; subscribers get notified', () => {
    as('u-omar');
    expect(s().postIncidentUpdate('INC-311', 'monitoring', 'Looks better').ok).toBe(false);
    as('u-layla');
    expect(s().postIncidentUpdate('INC-311', 'resolved', 'Provider fixed SG-1; latency back to normal.').ok).toBe(true);
    expect(s().incidents.find((i) => i.id === 'INC-311')?.status).toBe('resolved');
    expect(hub.getState().notifications.some((n) => n.userId === 'u-omar' && n.link === '/helpdesk/status')).toBe(true);
    // Hana's linked ticket owner hears about it too
    expect(hub.getState().notifications.some((n) => n.userId === 'u-hana' && /resolved/.test(n.title))).toBe(true);
  });

  it('guide votes are per person and toggle', () => {
    as('u-mei');
    s().voteGuide('vpn-connect', 1);
    expect(s().guideVotes['vpn-connect']['u-mei']).toBe(1);
    s().voteGuide('vpn-connect', 1);
    expect(s().guideVotes['vpn-connect']['u-mei']).toBeUndefined();
  });
});

describe('bridge', () => {
  it('lists devices only for self or IT', () => {
    as('u-mei');
    const v = viewerOf()!;
    expect(api.listDevicesFor(v, 'u-mei').map((d) => d.assetTag)).toContain('HX-MBP-0187');
    expect(api.listDevicesFor(v, 'u-omar')).toEqual([]);
    as('u-layla');
    expect(api.listDevicesFor(viewerOf()!, 'u-omar').length).toBeGreaterThan(0);
  });

  it('creates tickets from other apps with mapped categories', () => {
    as('u-omar');
    const r = api.createTicket(viewerOf()!, { subject: 'Need GitHub access for the new repo', category: 'Access request', source: { app: 'projects', label: 'Helix Projects · Platform', to: '/projects' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.to).toBe(`/helpdesk/tickets/${r.ticketId}`);
    expect(ticket(r.ticketId)).toMatchObject({ category: 'access', source: { app: 'projects' } });
  });

  it('palette respects permissions', () => {
    as('u-alex');
    const alex = api.paletteEntries(viewerOf()!);
    expect(alex.some((e) => e.to === '/helpdesk/queue')).toBe(false);
    expect(alex.some((e) => e.to === '/helpdesk/devices/HX-MBA-0419')).toBe(true);
    expect(alex.some((e) => e.to === '/helpdesk/tickets/HX-1042')).toBe(false);
    as('u-layla');
    const layla = api.paletteEntries(viewerOf()!);
    expect(layla.some((e) => e.to === '/helpdesk/fleet?scan=1')).toBe(true);
    expect(layla.some((e) => e.to === '/helpdesk/fleet/HX-MBP-0142')).toBe(true);
    expect(new Set(layla.map((e) => e.id)).size).toBe(layla.length);
  });

  it('resetDemo restores the seed', () => {
    as('u-layla');
    s().retireDevice('HX-MBP-0142', 'test');
    api.resetDemo();
    expect(device('HX-MBP-0142').status).toBe('in_use');
  });
});
