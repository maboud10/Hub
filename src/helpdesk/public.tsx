/**
 * Public App Bridge for IT Helpdesk (see src/lib/appBridge.ts).
 * Powers the ⌘K palette, Settings → Reset demo and cross-app features
 * (e.g. "Raise a ticket" from Projects or Chat). Every call re-checks the
 * viewer's permissions — this is an API boundary.
 */
import { createElement } from 'react';
import { Activity, Gauge, HardDrive, LayoutGrid, LifeBuoy, Radar, ScanLine, ShoppingBag, Stethoscope, Ticket as TicketIcon } from 'lucide-react';
import type { BridgeDevice, BridgeViewer, HelpdeskBridge, NewTicketFromApp, PaletteEntry } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { useHelpdesk } from './store';
import { isIT } from './access';
import { deviceHealth } from './fleet';
import { mapCategory } from './triage';
import { CATEGORY_LABEL, KIND_LABEL, STATUS_LABEL, STATUS_LABEL_AGENT } from './meta';

const icon = (C: typeof LifeBuoy) => createElement(C, { size: 16 });

function paletteEntries(viewer: BridgeViewer): PaletteEntry[] {
  if (!viewer?.user) return [];
  const s = useHelpdesk.getState();
  const it = isIT(viewer);
  const me = viewer.user.id;
  const now = Date.now();
  const users = useHub.getState().users;
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? '';

  const actions: PaletteEntry[] = [
    { id: 'helpdesk:new-ticket', group: 'Actions', title: 'Raise a ticket', subtitle: 'IT Helpdesk · Nova pre-fills it for you', icon: icon(TicketIcon), keywords: ['ticket', 'support', 'help', 'it', 'issue', 'problem', 'broken', 'report'], hint: 'Create', to: '/helpdesk/tickets?new=1' },
    { id: 'helpdesk:devices', group: 'Actions', title: 'My devices', subtitle: 'IT Helpdesk · laptops, phones, keys', icon: icon(HardDrive), keywords: ['laptop', 'device', 'macbook', 'phone', 'yubikey', 'hardware', 'asset'], hint: 'Open', to: '/helpdesk/devices' },
    { id: 'helpdesk:diag', group: 'Actions', title: 'Run device health check', subtitle: 'IT Helpdesk · scan & fix in one click', icon: icon(Stethoscope), keywords: ['diagnostics', 'health', 'scan', 'update', 'encryption', 'firewall', 'slow'], hint: 'Run', to: '/helpdesk?diag=1' },
    { id: 'helpdesk:catalog', group: 'Actions', title: 'Request hardware or software', subtitle: 'IT Helpdesk · catalog', icon: icon(ShoppingBag), keywords: ['request', 'order', 'buy', 'monitor', 'figma', 'licence', 'license', 'access', 'github', 'aws'], hint: 'Open', to: '/helpdesk/catalog' },
    { id: 'helpdesk:status', group: 'Actions', title: 'System status', subtitle: 'IT Helpdesk · incidents & maintenance', icon: icon(Activity), keywords: ['status', 'outage', 'incident', 'down', 'vpn', 'wifi', 'uptime'], hint: 'Open', to: '/helpdesk/status' },
  ];
  if (it)
    actions.push(
      { id: 'helpdesk:queue', group: 'Actions', title: 'IT queue', subtitle: 'IT Helpdesk · console', icon: icon(LayoutGrid), keywords: ['queue', 'tickets', 'kanban', 'sla', 'triage', 'agent'], hint: 'Open', to: '/helpdesk/queue' },
      { id: 'helpdesk:fleet', group: 'Actions', title: 'Fleet inventory', subtitle: 'IT Helpdesk · radar, assets, MDM', icon: icon(Radar), keywords: ['fleet', 'inventory', 'assets', 'mdm', 'radar', 'devices'], hint: 'Open', to: '/helpdesk/fleet' },
      { id: 'helpdesk:scan', group: 'Actions', title: 'Scan asset tag', subtitle: 'IT Helpdesk · scanner', icon: icon(ScanLine), keywords: ['scan', 'asset tag', 'barcode', 'qr', 'lookup'], hint: 'Scan', to: '/helpdesk/fleet?scan=1' },
      { id: 'helpdesk:insights', group: 'Actions', title: 'Helpdesk insights', subtitle: 'IT Helpdesk · SLA, CSAT, fleet health', icon: icon(Gauge), keywords: ['insights', 'analytics', 'sla', 'csat', 'reports', 'metrics'], hint: 'Open', to: '/helpdesk/insights' },
    );

  const myTickets = s.tickets
    .filter((t) => t.requesterId === me)
    .sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || b.updatedAt - a.updatedAt)
    .slice(0, 20)
    .map<PaletteEntry>((t) => ({
      id: `helpdesk:ticket:${t.id}`,
      group: 'Work',
      title: t.subject,
      subtitle: `${t.id} · ${STATUS_LABEL[t.status]} · ${CATEGORY_LABEL[t.category]}`,
      icon: icon(LifeBuoy),
      keywords: [t.id, t.id.replace('HX-', ''), t.category, 'ticket', ...(t.deviceTag ? [t.deviceTag] : [])],
      hint: 'Open',
      to: `/helpdesk/tickets/${t.id}`,
    }));

  const myDevices = s.devices
    .filter((d) => d.assigneeId === me && d.status !== 'retired')
    .map<PaletteEntry>((d) => ({
      id: `helpdesk:device:${d.assetTag}`,
      group: 'Work',
      title: d.model,
      subtitle: `${d.assetTag} · ${KIND_LABEL[d.kind]} · health ${deviceHealth(d, now)}`,
      icon: icon(HardDrive),
      keywords: [d.assetTag, d.serial, d.kind, 'device', 'my device'],
      hint: 'Open',
      to: `/helpdesk/devices/${d.assetTag}`,
    }));

  const out = [...actions, ...myTickets, ...myDevices];
  if (it) {
    const mine = new Set(myTickets.map((e) => e.id));
    for (const t of s.tickets) {
      if (t.status === 'resolved' || mine.has(`helpdesk:ticket:${t.id}`)) continue;
      out.push({
        id: `helpdesk:ticket:${t.id}`,
        group: 'Work',
        title: t.subject,
        subtitle: `${t.id} · ${t.priority} · ${STATUS_LABEL_AGENT[t.status]} · ${nameOf(t.requesterId)}`,
        icon: icon(TicketIcon),
        keywords: [t.id, t.id.replace('HX-', ''), t.category, nameOf(t.requesterId), 'queue'],
        hint: 'Open',
        to: `/helpdesk/tickets/${t.id}`,
      });
    }
    const myTags = new Set(myDevices.map((e) => e.id));
    for (const d of s.devices) {
      if (myTags.has(`helpdesk:device:${d.assetTag}`)) continue;
      out.push({
        id: `helpdesk:device:${d.assetTag}`,
        group: 'Work',
        title: `${d.assetTag} · ${d.model}`,
        subtitle: `${KIND_LABEL[d.kind]} · ${d.assigneeId ? nameOf(d.assigneeId) : d.status.replace('_', ' ')} · ${d.office}`,
        icon: icon(HardDrive),
        keywords: [d.assetTag, d.serial, d.model, nameOf(d.assigneeId), ...d.tags.map((t) => `#${t}`), 'asset'],
        hint: 'Open',
        to: `/helpdesk/fleet/${d.assetTag}`,
      });
    }
  }
  return out;
}

function listDevicesFor(viewer: BridgeViewer, userId: string): BridgeDevice[] {
  if (!viewer?.user) return [];
  if (viewer.user.id !== userId && !isIT(viewer)) return [];
  const now = Date.now();
  const self = viewer.user.id === userId;
  return useHelpdesk
    .getState()
    .devices.filter((d) => d.assigneeId === userId && (d.status === 'in_use' || d.status === 'loaner' || d.status === 'in_repair'))
    .map((d) => ({ assetTag: d.assetTag, name: d.model, kind: d.kind, health: deviceHealth(d, now), to: self ? `/helpdesk/devices/${d.assetTag}` : `/helpdesk/fleet/${d.assetTag}` }));
}

function createTicket(viewer: BridgeViewer, input: NewTicketFromApp) {
  if (!viewer?.user) return { ok: false as const, error: 'Sign in to raise a ticket.' };
  const r = useHelpdesk.getState().createTicket(
    {
      subject: input.subject,
      description: input.description,
      category: mapCategory(input.category, `${input.subject} ${input.description ?? ''}`),
      priority: input.priority,
      urgency: input.priority === 'P1' || input.priority === 'P2' ? 'high' : 'normal',
      source: input.source,
    },
    viewer,
  );
  if (!r.ok) return r;
  return { ok: true as const, ticketId: r.ticket.id, to: `/helpdesk/tickets/${r.ticket.id}` };
}

export const api: HelpdeskBridge = {
  appId: 'helpdesk',
  paletteEntries,
  resetDemo: () => useHelpdesk.getState().resetDemo(),
  listDevicesFor,
  createTicket,
};
