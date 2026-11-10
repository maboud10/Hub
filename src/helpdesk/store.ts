/**
 * IT Helpdesk store — behaves like an API: every action validates input,
 * re-checks permissions (UI hints are never trusted), writes the security
 * audit trail, notifies affected people with deep links, and returns
 * `{ ok: true, … } | { ok: false, error }`.
 *
 * Persisted under `nexus-helpdesk-v2` (re-seeds on version mismatch).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NotificationKind } from '@/types';
import { useHub } from '@/store/hub';
import { currentViewer, loadBridge, type BridgeCard, type BridgeSource, type BridgeViewer } from '@/lib/appBridge';
import { uid } from '@/lib/id';
import type {
  Attachment,
  CatalogRequest,
  Device,
  DeviceKind,
  DeviceStatus,
  DeviceTag,
  FleetFilter,
  HelpdeskData,
  Impact,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  MdmAction,
  MdmCommand,
  Office,
  Priority,
  ResolutionCode,
  SavedView,
  Ticket,
  TicketCategory,
  TicketEvent,
  TicketStatus,
  Urgency,
} from './types';
import { createSeed, HELPDESK_VERSION } from './seed';
import { canViewDevice, canViewTicket, canWorkTicket, isIT, isSecurity, isStaff, pickAgent } from './access';
import { maxPriority, priorityFor, SLA_TARGETS, formatDuration } from './sla';
import { applyCheckFix, healthChecks, nextAssetTag, recoveryKeyFor, type CheckId } from './fleet';
import { applyPlaybookEffects, incidentFor, PLAYBOOKS, type PlaybookPlan } from './playbooks';
import { approvalChain, canDecide, checkEligibility, currentStep, decide } from './eligibility';
import { assignableAgents } from './queries';
import {
  APPROVAL_ROLE_LABEL,
  CATEGORIES,
  CATEGORY_LABEL,
  DAY,
  DEVICE_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  isManagedKind,
  MDM_LABEL,
  officeOf,
  STATUS_LABEL,
} from './meta';
import { firstNameOf } from './util';

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
type V = BridgeViewer | null | undefined;

/** Runtime switches (tests turn simulations and cross-app side effects off). */
export const HD_RUNTIME = {
  simulate: typeof window !== 'undefined',
  bridges: typeof window !== 'undefined',
  pickupMs: [4500, 8000] as [number, number],
  mdmStepMs: 950,
};

const LEGACY_KEYS = ['nexus.helpdesk.v2', 'nexus.helpdesk.v1', 'nexus.helpdesk', 'nexus-helpdesk'];
try {
  if (typeof localStorage !== 'undefined') for (const k of LEGACY_KEYS) localStorage.removeItem(k);
} catch {
  /* storage unavailable */
}

/* ---------------------------------------------------------------- helpers */

const ok = <T extends object>(extra?: T): Result<T> => ({ ok: true, ...(extra as T) });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const who = (v: V): BridgeViewer | null => v ?? currentViewer();

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function later(key: string, ms: number, fn: () => void) {
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fn();
    }, ms),
  );
}
function clearTimers() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

const hub = () => useHub.getState();
const userById = (id: string | undefined) => (id ? hub().users.find((u) => u.id === id) : undefined);
const nameOf = (id: string | undefined) => userById(id)?.name ?? 'Someone';
const firstOf = (id: string | undefined) => firstNameOf(userById(id)?.name);

function audit(entry: { action: string; target: string; detail?: string; outcome?: 'success' | 'denied'; severity?: 'info' | 'warning' | 'critical'; actorId?: string }) {
  hub().logAudit({ outcome: 'success', severity: 'info', ...entry });
}

function deny(v: BridgeViewer, action: string, target: string, detail: string, error = 'You don’t have permission to do that.') {
  audit({ action, target, detail, outcome: 'denied', severity: 'warning', actorId: v.user.id });
  return fail(error);
}

/** Hub bell notification (skips the actor and unknown users). */
function notify(userIds: (string | undefined)[], actorId: string | undefined, n: { kind: NotificationKind; title: string; body?: string; link?: string }) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== actorId && !!userById(id)))];
  if (ids.length) hub().pushNotifications(ids, n);
}

function bridgeViewer(v: BridgeViewer): BridgeViewer {
  return { user: v.user, perms: v.perms, roles: v.roles ?? hub().roles };
}

/** DM from the IT bot in Pulse Chat (best effort — chat may be mid-rebuild). */
function chatDM(v: BridgeViewer, toUserId: string, text: string, card?: BridgeCard) {
  if (!HD_RUNTIME.bridges || !userById(toUserId)) return;
  loadBridge('chat')
    .then((chat) => chat.sendDirect(bridgeViewer(v), { toUserId, text, card, asBot: true }))
    .catch(() => undefined);
}

function chatPost(v: BridgeViewer, channelId: string, text: string, card?: BridgeCard) {
  if (!HD_RUNTIME.bridges) return;
  loadBridge('chat')
    .then((chat) => chat.postToChannel(bridgeViewer(v), { channelId, text, card, asBot: true }))
    .catch(() => undefined);
}

const ticketRoute = (id: string) => `/helpdesk/tickets/${id}`;
const ticketCard = (t: Ticket, status?: string): BridgeCard => ({
  app: 'helpdesk',
  title: `${t.id} · ${t.subject}`,
  subtitle: `${CATEGORY_LABEL[t.category]} · ${t.priority}`,
  to: ticketRoute(t.id),
  status: status ?? STATUS_LABEL[t.status],
});

const ev = (kind: TicketEvent['kind'], props: Omit<TicketEvent, 'id' | 'at' | 'kind'> = {}, at = Date.now()): TicketEvent => ({ id: uid('ev'), at, kind, ...props });

/** Pure status transition with SLA pause bookkeeping. */
export function withStatus(t: Ticket, to: TicketStatus, now: number, actorId?: string, body?: string): Ticket {
  if (t.status === to) return t;
  let pausedMs = t.pausedMs || 0;
  let pausedAt = t.pausedAt;
  if (t.status === 'waiting' && pausedAt) {
    pausedMs += Math.max(0, now - pausedAt);
    pausedAt = undefined;
  }
  if (to === 'waiting') pausedAt = now;
  const reopening = t.status === 'resolved';
  return {
    ...t,
    status: to,
    pausedMs,
    pausedAt,
    resolvedAt: to === 'resolved' ? now : undefined,
    resolution: reopening ? undefined : t.resolution,
    csat: reopening ? undefined : t.csat,
    updatedAt: now,
    events: [...t.events, ev('status', { actorId, from: t.status, to, body }, now)],
  };
}

function agentReply(t: Ticket, agentId: string, device?: Device): string {
  const first = firstOf(t.requesterId);
  const a = firstOf(agentId);
  const office = officeOf(userById(t.requesterId)?.location);
  switch (t.category) {
    case 'network':
      return `Hi ${first}, ${a} from IT here — I’ve picked this up.${device ? ` ${device.assetTag} checked in recently, so I can see it from our side.` : ''} Roughly when does it happen, and where are you working from? Meanwhile, the Repair VPN fix on Support Home often clears this in under a minute.`;
    case 'hardware':
      return `Hi ${first}, thanks for the details — I’m on it.${device ? ` I’ve pulled up your ${device.model} (${device.assetTag}).` : ''} If it turns out to be hardware, I’ll have a loaner ready${office === 'Remote' ? ' to courier to you' : ` at the ${office} IT bar`} so you’re not blocked.`;
    case 'software':
      return `Hi ${first}, ${a} here. I’m checking the licence pool and your device’s install logs now — I’ll update you shortly.`;
    case 'access':
      return `Hi ${first}, I’ve picked this up and sent it to the system owner for approval. You’ll get a notification the moment it’s granted.`;
    case 'email':
      return `Hi ${first}, I’m resetting your mailbox sync on our side. Please quit and reopen Outlook in about five minutes and tell me if new mail arrives.`;
    case 'security':
      return `Hi ${first}, Security has this now. Please don’t delete anything or wipe the device yourself — we may need it for the investigation. I’ll keep you posted right here.`;
    default:
      return `Hi ${first}, ${a} from IT — I’ve picked this up and will get back to you shortly.`;
  }
}

const isRealUser = (id: string | undefined) => !!userById(id);

/* ---------------------------------------------------------------- inputs */

export interface NewTicketInput {
  subject: string;
  description?: string;
  category: TicketCategory;
  impact?: Impact;
  urgency?: Urgency;
  /** Explicit priority (bridge / IT override). Defaults to impact × urgency. */
  priority?: Priority;
  deviceTag?: string;
  attachments?: Attachment[];
  source?: BridgeSource;
  /** IT only: file on behalf of someone else. */
  requesterId?: string;
}

export interface RegisterDeviceInput {
  kind: DeviceKind;
  manufacturer: string;
  model: string;
  serial: string;
  office: Office;
  cost?: number;
  warrantyMonths?: number;
  tags?: string[];
  assigneeId?: string;
  os?: string;
}

export interface TagSnapshot {
  tag: DeviceTag;
  deviceTags: string[];
}

/* ---------------------------------------------------------------- store */

export interface HelpdeskActions {
  createTicket(input: NewTicketInput, viewer?: V): Result<{ ticket: Ticket }>;
  reply(ticketId: string, body: string, opts?: { internal?: boolean; attachments?: Attachment[]; macroId?: string }, viewer?: V): Result;
  setStatus(ticketId: string, status: TicketStatus, opts?: { resolution?: ResolutionCode; note?: string }, viewer?: V): Result;
  assign(ticketId: string, assigneeId: string | null, viewer?: V): Result;
  setPriority(ticketId: string, priority: Priority, viewer?: V): Result;
  setCategory(ticketId: string, category: TicketCategory, viewer?: V): Result;
  linkDevice(ticketId: string, tag: string | null, viewer?: V): Result;
  applyMacro(ticketId: string, macroId: string, viewer?: V): Result;
  escalate(ticketId: string, viewer?: V): Result;
  confirmFixed(ticketId: string, viewer?: V): Result;
  reopen(ticketId: string, reason?: string, viewer?: V): Result;
  rate(ticketId: string, score: number, comment?: string, viewer?: V): Result;
  markSeen(ticketId: string, viewer?: V): void;
  bulkAssign(ids: string[], assigneeId: string | null, viewer?: V): Result<{ count: number }>;
  bulkStatus(ids: string[], status: TicketStatus, viewer?: V): Result<{ count: number }>;
  grabNext(viewer?: V): Result<{ ticketId: string }>;
  simulatePickup(ticketId: string): void;
  resumeSimulations(): void;

  recordFix(input: { plan: PlaybookPlan; deviceTag?: string }, viewer?: V): Result<{ ticketId?: string }>;
  applyHealthFix(tag: string, check: CheckId, viewer?: V): Result;
  markDiagRun(tag: string): void;

  revealRecoveryKey(tag: string, viewer?: V): Result<{ key: string }>;
  reportLost(tag: string, input: { where: string; when: string; details?: string; stolen?: boolean }, viewer?: V): Result<{ ticketId: string }>;
  scheduleReturn(tag: string, at: number, viewer?: V): Result;

  updateDevice(tag: string, patch: Partial<Pick<Device, 'model' | 'serial' | 'office' | 'notes' | 'warrantyEnd' | 'cost' | 'specs' | 'os'>>, viewer?: V): Result;
  assignDevice(tag: string, userId: string | null, note?: string, viewer?: V): Result;
  checkoutLoaner(tag: string, userId: string, dueAt: number, viewer?: V): Result;
  checkinLoaner(tag: string, viewer?: V): Result;
  extendLoan(tag: string, dueAt: number, viewer?: V): Result;
  sendToRepair(tag: string, input: { vendor: string; eta?: number; note?: string }, viewer?: V): Result;
  returnFromRepair(tag: string, viewer?: V): Result;
  retireDevice(tag: string, reason: string, viewer?: V): Result;
  markLost(tag: string, viewer?: V): Result;
  markFound(tag: string, viewer?: V): Result;
  registerDevice(input: RegisterDeviceInput, viewer?: V): Result<{ assetTag: string }>;
  mdmAction(tag: string, action: MdmAction, opts?: { confirmTag?: string }, viewer?: V): Result<{ commandId: string }>;
  setDeviceTags(tag: string, tagIds: string[], viewer?: V): Result;
  bulkTag(tags: string[], tagId: string, on: boolean, viewer?: V): Result<{ count: number }>;
  bulkDeviceStatus(tags: string[], status: 'in_stock' | 'in_repair' | 'retired', viewer?: V): Result<{ count: number }>;

  createTag(input: { name: string; color: string; description: string }, viewer?: V): Result<{ tag: DeviceTag }>;
  updateTag(id: string, patch: Partial<Pick<DeviceTag, 'name' | 'color' | 'description'>>, viewer?: V): Result;
  deleteTag(id: string, viewer?: V): Result<{ snapshot: TagSnapshot }>;
  restoreTag(snapshot: TagSnapshot, viewer?: V): Result;

  submitRequest(itemId: string, input: { options?: Record<string, string>; justification?: string }, viewer?: V): Result<{ request: CatalogRequest }>;
  decideRequest(requestId: string, approve: boolean, note?: string, viewer?: V): Result;
  cancelRequest(requestId: string, viewer?: V): Result;
  fulfilRequest(requestId: string, input: { deviceTag?: string; note?: string }, viewer?: V): Result;

  postIncidentUpdate(incidentId: string, status: IncidentStatus, body: string, viewer?: V): Result;
  createIncident(input: { title: string; serviceIds: string[]; severity: IncidentSeverity; offices?: Office[]; body: string }, viewer?: V): Result<{ incident: Incident }>;
  toggleStatusSub(viewer?: V): Result<{ subscribed: boolean }>;

  voteGuide(slug: string, vote: 1 | -1, viewer?: V): Result;

  saveFleetView(name: string, filter: FleetFilter, viewer?: V): Result<{ view: SavedView }>;
  deleteFleetView(id: string, viewer?: V): Result;

  resetDemo(): void;
}

export type HelpdeskStore = HelpdeskData & HelpdeskActions;

const DATA_KEYS: (keyof HelpdeskData)[] = [
  'version',
  'tickets',
  'devices',
  'tags',
  'catalog',
  'requests',
  'services',
  'incidents',
  'maintenance',
  'announcements',
  'guides',
  'macros',
  'history',
  'fixRuns',
  'guideVotes',
  'statusSubs',
  'seen',
  'fleetViews',
  'diagRuns',
  'seq',
];

const VALID_CATEGORIES = new Set(CATEGORIES.map((c) => c.id));

export const useHelpdesk = create<HelpdeskStore>()(
  persist(
    (set, get) => {
      const findTicket = (id: string) => get().tickets.find((t) => t.id === id);
      const findDevice = (tag: string) => get().devices.find((d) => d.assetTag === tag);
      const patchTicket = (id: string, fn: (t: Ticket) => Ticket) => set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? fn(t) : t)) }));
      const patchDevice = (tag: string, fn: (d: Device) => Device) => set((s) => ({ devices: s.devices.map((d) => (d.assetTag === tag ? fn(d) : d)) }));
      const custody = (d: Device, kind: Device['custody'][number]['kind'], props: { userId?: string; actorId?: string; note?: string } = {}): Device => ({
        ...d,
        custody: [...d.custody, { id: uid('cu'), at: Date.now(), kind, ...props }],
      });

      /** Notify requester (bell + IT bot DM) about a status change made by someone else. */
      const announceStatus = (v: BridgeViewer, t: Ticket, to: TicketStatus) => {
        if (v.user.id === t.requesterId) return;
        const label = STATUS_LABEL[to];
        notify([t.requesterId], v.user.id, { kind: 'work', title: `${t.id} · ${label}`, body: t.subject, link: ticketRoute(t.id) });
        chatDM(v, t.requesterId, `Your ticket ${t.id} is now ${label.toLowerCase()}.`, ticketCard({ ...t, status: to }, label));
      };

      const requireIT = (v: BridgeViewer | null, action: string, target: string): BridgeViewer | { ok: false; error: string } => {
        if (!v) return fail('Sign in first.');
        if (!isIT(v)) return deny(v, action, target, 'Requires helpdesk.manage', 'Only IT can do that.');
        return v;
      };

      const runMdm = (tag: string, action: MdmAction, actorId: string): string => {
        const id = uid('mdm');
        const now = Date.now();
        const d0 = findDevice(tag)!;
        const cmd: MdmCommand = { id, action, state: 'queued', actorId, createdAt: now, updatedAt: now, log: [{ at: now, line: `› mdm ${action.replace('_', '-')} ${tag}` }, { at: now, line: 'Command queued (APNs priority 10)' }] };
        patchDevice(tag, (d) => ({ ...d, mdm: [cmd, ...d.mdm].slice(0, 25) }));
        const finalLine: Record<MdmAction, string> = {
          sync: `Inventory updated · ${180 + (tag.charCodeAt(9) % 60)} apps · compliance re-evaluated`,
          lock: 'Device locked · lock-screen message set · Find My enabled',
          unlock: 'Device unlocked · lock-screen message cleared',
          wipe: 'Erase All Content and Settings started · Activation Lock retained',
          rotate_key: 'New recovery key escrowed · previous key invalidated',
          push_update: `${d0.osTarget ?? 'Latest OS'} downloaded · installing at next restart`,
        };
        const steps: { state: MdmCommand['state']; line: string }[] = [
          { state: 'sent', line: 'Push delivered to device' },
          { state: 'acknowledged', line: `Device acknowledged · ${d0.os ?? d0.model}` },
          { state: 'completed', line: finalLine[action] },
        ];
        const apply = (i: number) => {
          const st = steps[i];
          const t = Date.now();
          patchDevice(tag, (d) => {
            let next: Device = { ...d, mdm: d.mdm.map((c) => (c.id === id ? { ...c, state: st.state, updatedAt: t, log: [...c.log, { at: t, line: st.line }] } : c)) };
            if (st.state === 'completed') {
              next = { ...next, lastCheckIn: t };
              if (action === 'lock') next.locked = true;
              if (action === 'unlock') next.locked = false;
              if (action === 'rotate_key') next.recoveryKey = recoveryKeyFor(tag, t);
              if (action === 'push_update' && next.compliance) next = { ...next, os: next.osTarget ?? next.os, compliance: { ...next.compliance, osCurrent: true } };
              if (action === 'wipe') next = { ...next, locked: true, notes: [next.notes, `Wiped ${new Date(t).toISOString().slice(0, 10)}`].filter(Boolean).join(' · ') };
            }
            return next;
          });
        };
        if (!HD_RUNTIME.simulate) steps.forEach((_, i) => apply(i));
        else steps.forEach((_, i) => later(`mdm:${id}:${i}`, HD_RUNTIME.mdmStepMs * (i + 1) + (i === 2 ? 600 : 0), () => apply(i)));
        return id;
      };

      const nextTicketId = () => {
        const n = get().seq.ticket;
        set((s) => ({ seq: { ...s.seq, ticket: n + 1 } }));
        return `HX-${n}`;
      };

      return {
        ...createSeed(),

        /* ============================================================ tickets */

        createTicket(input, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in to raise a ticket.');
          const subject = (input.subject ?? '').trim().replace(/\s+/g, ' ');
          const description = (input.description ?? '').trim();
          if (subject.length < 4) return fail('Add a short subject (at least 4 characters).');
          if (subject.length > 140) return fail('Keep the subject under 140 characters.');
          if (description.length > 5000) return fail('The description is too long.');
          if (!VALID_CATEGORIES.has(input.category)) return fail('Pick a category.');
          let requesterId = v.user.id;
          if (input.requesterId && input.requesterId !== v.user.id) {
            if (!isIT(v)) return deny(v, 'helpdesk.ticket.create', input.requesterId, 'Filing on behalf of someone else', 'Only IT can file tickets on behalf of others.');
            if (!isRealUser(input.requesterId)) return fail('Unknown requester.');
            requesterId = input.requesterId;
          }
          if (input.deviceTag) {
            const d = findDevice(input.deviceTag);
            if (!d) return fail(`Device ${input.deviceTag} not found.`);
            if (d.assigneeId !== requesterId && !isIT(v)) return fail('You can only link your own devices.');
          }
          const impact = input.impact ?? 'me';
          const urgency = input.urgency ?? 'normal';
          let priority = input.priority ?? priorityFor(impact, urgency, input.category);
          if (input.category === 'security' && /\b(lost|stolen|theft)\b/i.test(`${subject} ${description}`)) priority = 'P1';
          const now = Date.now();
          const id = nextTicketId();
          const requester = userById(requesterId);
          const office = officeOf(requester?.location);
          const related = input.category === 'network' ? incidentFor(get().incidents, ['vpn', `wifi-${office.slice(0, 3).toLowerCase()}`], office) : input.category === 'email' ? incidentFor(get().incidents, ['mail'], office) : undefined;
          const events: TicketEvent[] = [
            ev('created', { actorId: requesterId, body: description || subject, attachments: input.attachments?.slice(0, 6) }, now),
            ev('automation', { body: `Nova triaged this as ${CATEGORY_LABEL[input.category]} · ${priority} — first response within ${formatDuration(SLA_TARGETS[priority].response)}.${input.deviceTag ? ` Linked ${input.deviceTag}.` : ''}` }, now + 1),
          ];
          if (related) events.push(ev('automation', { body: `Linked to incident ${related.id} · ${related.title}.` }, now + 2));
          if (input.source) events.push(ev('automation', { body: `Raised from ${input.source.label}.` }, now + 3));
          const ticket: Ticket = {
            id,
            subject,
            description: description || subject,
            category: input.category,
            priority,
            impact,
            urgency,
            status: 'new',
            requesterId,
            deviceTag: input.deviceTag,
            createdAt: now,
            updatedAt: now,
            pausedMs: 0,
            events,
            source: input.source,
            incidentId: related?.id,
            sim: 'pickup',
          };
          set((s) => ({ tickets: [ticket, ...s.tickets] }));
          if (requesterId !== v.user.id) notify([requesterId], v.user.id, { kind: 'work', title: `${nameOf(v.user.id)} opened ${id} for you`, body: subject, link: ticketRoute(id) });
          if (input.category === 'security') {
            audit({ action: 'helpdesk.ticket.security', target: id, detail: subject, severity: priority === 'P1' ? 'critical' : 'warning', actorId: v.user.id });
            notify(['u-ethan'], v.user.id, { kind: 'work', title: `Security ticket ${id} (${priority})`, body: subject, link: ticketRoute(id) });
          }
          if (HD_RUNTIME.simulate) {
            const [a, b] = HD_RUNTIME.pickupMs;
            later(`pickup:${id}`, a + Math.random() * (b - a), () => get().simulatePickup(id));
          }
          return ok({ ticket });
        },

        reply(ticketId, body, opts = {}, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (!canViewTicket(v, t)) return deny(v, 'helpdesk.ticket.reply', ticketId, 'Not requester, assignee or IT', 'You can’t reply on this ticket.');
          const text = body.trim();
          if (!text && !opts.attachments?.length) return fail('Write a message first.');
          if (text.length > 5000) return fail('That message is too long.');
          const agent = canWorkTicket(v, t);
          if (opts.internal && !agent) return deny(v, 'helpdesk.ticket.note', ticketId, 'Internal note without agent access', 'Only IT can add internal notes.');
          const now = Date.now();
          let next: Ticket = { ...t, updatedAt: now, events: [...t.events, ev(opts.internal ? 'note' : 'reply', { actorId: v.user.id, body: text, attachments: opts.attachments?.slice(0, 6), macroId: opts.macroId }, now)] };
          let statusTo: TicketStatus | null = null;
          if (!opts.internal && agent && v.user.id !== t.requesterId) {
            next.firstResponseAt = next.firstResponseAt ?? now;
            if (!next.assigneeId && isStaff(v.user.id)) next = { ...next, assigneeId: v.user.id, events: [...next.events, ev('assign', { actorId: v.user.id, to: v.user.id }, now + 1)] };
            if (t.status === 'new' || t.status === 'triaged') statusTo = 'in_progress';
            notify([t.requesterId], v.user.id, { kind: 'work', title: `${firstOf(v.user.id)} replied on ${t.id}`, body: text.slice(0, 120), link: ticketRoute(t.id) });
            chatDM(v, t.requesterId, `${firstOf(v.user.id)} replied on your ticket ${t.id}: “${text.slice(0, 140)}${text.length > 140 ? '…' : ''}”`, ticketCard(t));
          } else if (v.user.id === t.requesterId) {
            if (t.status === 'waiting') statusTo = 'in_progress';
            if (t.status === 'resolved') statusTo = t.assigneeId ? 'in_progress' : 'triaged';
            notify([t.assigneeId], v.user.id, { kind: 'work', title: `${firstOf(v.user.id)} replied on ${t.id}`, body: text.slice(0, 120), link: ticketRoute(t.id) });
          }
          if (statusTo) next = withStatus(next, statusTo, now + 2, v.user.id === t.requesterId ? undefined : v.user.id, v.user.id === t.requesterId ? (t.status === 'resolved' ? 'Reopened — requester replied' : 'Requester replied') : undefined);
          patchTicket(ticketId, () => next);
          if (statusTo && v.user.id !== t.requesterId) announceStatus(v, next, statusTo);
          return ok();
        },

        setStatus(ticketId, status, opts = {}, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (!canWorkTicket(v, t)) return deny(v, 'helpdesk.ticket.status', ticketId, `→ ${status}`, 'Only IT can change the status.');
          if (t.status === status) return ok();
          const now = Date.now();
          let next = t;
          if (opts.note?.trim()) {
            next = { ...next, events: [...next.events, ev('reply', { actorId: v.user.id, body: opts.note.trim() }, now)] };
            next.firstResponseAt = next.firstResponseAt ?? now;
          }
          next = withStatus(next, status, now + 1, v.user.id);
          if (status === 'resolved') next = { ...next, resolution: { code: opts.resolution ?? 'fixed', note: opts.note?.trim() || undefined } };
          patchTicket(ticketId, () => next);
          announceStatus(v, next, status);
          return ok();
        },

        assign(ticketId, assigneeId, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.ticket.assign', ticketId);
          if ('ok' in v) return v;
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (assigneeId) {
            const team = assignableAgents(hub().users, hub().roles).map((u) => u.id);
            if (!team.includes(assigneeId)) return fail('Pick someone from the IT team.');
          }
          if ((t.assigneeId ?? null) === assigneeId) return ok();
          const now = Date.now();
          let next: Ticket = { ...t, assigneeId: assigneeId ?? undefined, updatedAt: now, events: [...t.events, ev('assign', { actorId: v.user.id, from: t.assigneeId, to: assigneeId ?? undefined }, now)] };
          if (assigneeId && t.status === 'new') next = withStatus(next, 'triaged', now + 1, v.user.id);
          next.sim = undefined;
          patchTicket(ticketId, () => next);
          if (assigneeId) notify([assigneeId], v.user.id, { kind: 'work', title: `${t.id} assigned to you`, body: `${t.priority} · ${t.subject}`, link: ticketRoute(t.id) });
          return ok();
        },

        setPriority(ticketId, priority, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (!canWorkTicket(v, t)) return deny(v, 'helpdesk.ticket.priority', ticketId, `→ ${priority}`, 'Only IT can change the priority.');
          if (!['P1', 'P2', 'P3', 'P4'].includes(priority)) return fail('Unknown priority.');
          if (t.priority === priority) return ok();
          const now = Date.now();
          patchTicket(ticketId, (x) => ({ ...x, priority, updatedAt: now, events: [...x.events, ev('priority', { actorId: v.user.id, from: x.priority, to: priority }, now)] }));
          return ok();
        },

        setCategory(ticketId, category, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (!canWorkTicket(v, t)) return deny(v, 'helpdesk.ticket.category', ticketId, `→ ${category}`, 'Only IT can recategorise tickets.');
          if (!VALID_CATEGORIES.has(category)) return fail('Unknown category.');
          if (t.category === category) return ok();
          const now = Date.now();
          patchTicket(ticketId, (x) => ({ ...x, category, updatedAt: now, events: [...x.events, ev('category', { actorId: v.user.id, from: x.category, to: category }, now)] }));
          return ok();
        },

        linkDevice(ticketId, tag, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          const agent = canWorkTicket(v, t);
          if (!agent && t.requesterId !== v.user.id) return deny(v, 'helpdesk.ticket.device', ticketId, String(tag), 'You can’t change this ticket.');
          if (tag) {
            const d = findDevice(tag);
            if (!d) return fail('Device not found.');
            if (!isIT(v) && d.assigneeId !== t.requesterId) return fail('That device isn’t assigned to the requester.');
          }
          const now = Date.now();
          patchTicket(ticketId, (x) => ({ ...x, deviceTag: tag ?? undefined, updatedAt: now, events: [...x.events, ev('device', { actorId: v.user.id, from: x.deviceTag, to: tag ?? undefined }, now)] }));
          return ok();
        },

        applyMacro(ticketId, macroId, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          const m = get().macros.find((x) => x.id === macroId);
          if (!t || !m) return fail('Not found.');
          if (!canWorkTicket(v, t)) return deny(v, 'helpdesk.ticket.macro', ticketId, m.name, 'Only IT can use macros.');
          const body = m.body.replace(/\{\{first\}\}/g, firstOf(t.requesterId)).replace(/\{\{agent\}\}/g, firstOf(v.user.id));
          const r = get().reply(ticketId, body, { macroId }, v);
          if (!r.ok) return r;
          if (m.status && findTicket(ticketId)?.status !== m.status) return get().setStatus(ticketId, m.status, m.status === 'resolved' ? { resolution: 'fixed' } : {}, v);
          return ok();
        },

        escalate(ticketId, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (!canWorkTicket(v, t)) return deny(v, 'helpdesk.ticket.escalate', ticketId, 'Escalate to Security', 'Only IT can escalate tickets.');
          if (t.escalated) return fail('Already escalated to Security.');
          const sec = t.requesterId === 'u-ethan' ? 'u-layla' : 'u-ethan';
          const now = Date.now();
          patchTicket(ticketId, (x) => ({
            ...x,
            category: 'security',
            priority: maxPriority(x.priority, 'P2'),
            escalated: true,
            assigneeId: sec,
            updatedAt: now,
            events: [...x.events, ev('escalation', { actorId: v.user.id, body: 'Escalated to Security' }, now), ev('assign', { actorId: v.user.id, from: x.assigneeId, to: sec }, now + 1)],
          }));
          audit({ action: 'helpdesk.ticket.escalate', target: ticketId, detail: `${t.subject} → Security (${nameOf(sec)})`, severity: 'warning', actorId: v.user.id });
          notify([sec], v.user.id, { kind: 'work', title: `Escalated to you: ${ticketId}`, body: t.subject, link: ticketRoute(ticketId) });
          return ok();
        },

        confirmFixed(ticketId, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (t.requesterId !== v.user.id) return deny(v, 'helpdesk.ticket.resolve', ticketId, 'Not the requester', 'Only the requester can confirm a fix.');
          if (t.status === 'resolved') return ok();
          const now = Date.now();
          patchTicket(ticketId, (x) => ({ ...withStatus(x, 'resolved', now, v.user.id, 'Confirmed fixed by requester'), resolution: { code: 'fixed', note: 'Confirmed fixed by requester' }, sim: undefined }));
          notify([t.assigneeId], v.user.id, { kind: 'work', title: `${firstOf(v.user.id)} confirmed ${t.id} is fixed`, body: t.subject, link: ticketRoute(t.id) });
          return ok();
        },

        reopen(ticketId, reason, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (t.requesterId !== v.user.id && !canWorkTicket(v, t)) return deny(v, 'helpdesk.ticket.reopen', ticketId, 'Not requester or agent', 'You can’t reopen this ticket.');
          if (t.status !== 'resolved') return fail('Only resolved tickets can be reopened.');
          const now = Date.now();
          let next = t;
          if (reason?.trim()) next = { ...next, events: [...next.events, ev('reply', { actorId: v.user.id, body: reason.trim() }, now)] };
          next = withStatus(next, t.assigneeId ? 'in_progress' : 'triaged', now + 1, v.user.id, 'Reopened');
          patchTicket(ticketId, () => next);
          notify([t.assigneeId, t.requesterId], v.user.id, { kind: 'work', title: `${t.id} was reopened`, body: reason?.trim() || t.subject, link: ticketRoute(t.id) });
          return ok();
        },

        rate(ticketId, score, comment, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const t = findTicket(ticketId);
          if (!t) return fail('Ticket not found.');
          if (t.requesterId !== v.user.id) return deny(v, 'helpdesk.ticket.csat', ticketId, 'Not the requester', 'Only the requester can rate a ticket.');
          if (t.status !== 'resolved') return fail('You can rate a ticket once it’s resolved.');
          if (t.csat) return fail('Thanks — you already rated this ticket.');
          if (!Number.isInteger(score) || score < 1 || score > 5) return fail('Pick a rating from 1 to 5.');
          const now = Date.now();
          const s = score as 1 | 2 | 3 | 4 | 5;
          const note = comment?.trim().slice(0, 500) || undefined;
          patchTicket(ticketId, (x) => ({ ...x, csat: { score: s, comment: note, at: now }, updatedAt: now, events: [...x.events, ev('csat', { actorId: v.user.id, to: String(s), body: note }, now)] }));
          notify([t.assigneeId], v.user.id, { kind: s >= 4 ? 'kudos' : 'work', title: `${firstOf(v.user.id)} rated ${t.id} ${s}/5`, body: note ?? t.subject, link: ticketRoute(t.id) });
          return ok();
        },

        markSeen(ticketId, viewer) {
          const v = who(viewer);
          if (!v) return;
          const t = findTicket(ticketId);
          if (!t) return;
          const prev = get().seen[v.user.id]?.[ticketId] ?? 0;
          if (prev >= t.updatedAt) return;
          set((s) => ({ seen: { ...s.seen, [v.user.id]: { ...(s.seen[v.user.id] ?? {}), [ticketId]: Date.now() } } }));
        },

        bulkAssign(ids, assigneeId, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.ticket.bulk_assign', `${ids.length} tickets`);
          if ('ok' in v) return v;
          let count = 0;
          for (const id of ids) if (get().assign(id, assigneeId, v).ok) count++;
          return ok({ count });
        },

        bulkStatus(ids, status, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.ticket.bulk_status', `${ids.length} tickets`);
          if ('ok' in v) return v;
          let count = 0;
          for (const id of ids) if (get().setStatus(id, status, status === 'resolved' ? { resolution: 'fixed' } : {}, v).ok) count++;
          return ok({ count });
        },

        grabNext(viewer) {
          const v = requireIT(who(viewer), 'helpdesk.ticket.grab', 'queue');
          if ('ok' in v) return v;
          const rank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
          const next = get()
            .tickets.filter((t) => t.status !== 'resolved' && !t.assigneeId && t.requesterId !== v.user.id)
            .sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt - b.createdAt)[0];
          if (!next) return fail('Nothing unassigned — the queue is clear.');
          const team = assignableAgents(hub().users, hub().roles).map((u) => u.id);
          if (!team.includes(v.user.id)) return fail('You’re not on the IT team roster.');
          const r = get().assign(next.id, v.user.id, v);
          return r.ok ? ok({ ticketId: next.id }) : r;
        },

        simulatePickup(ticketId) {
          const t = findTicket(ticketId);
          if (!t) return;
          if (t.status !== 'new' || t.assigneeId) {
            if (t.sim) patchTicket(ticketId, (x) => ({ ...x, sim: undefined }));
            return;
          }
          const agentId = pickAgent(t.category, t.requesterId);
          const device = t.deviceTag ? findDevice(t.deviceTag) : undefined;
          const now = Date.now();
          const body = agentReply(t, agentId, device);
          let next: Ticket = {
            ...t,
            sim: undefined,
            assigneeId: agentId,
            firstResponseAt: t.firstResponseAt ?? now,
            updatedAt: now,
            events: [...t.events, ev('assign', { actorId: agentId, to: agentId }, now), ev('reply', { actorId: agentId, body }, now + 1)],
          };
          next = withStatus(next, 'in_progress', now + 2, agentId);
          patchTicket(ticketId, () => next);
          const v = currentViewer();
          notify([t.requesterId], agentId, { kind: 'work', title: `${firstOf(agentId)} picked up ${t.id}`, body: body.slice(0, 120), link: ticketRoute(t.id) });
          if (v) chatDM(v, t.requesterId, `${nameOf(agentId)} picked up your ticket ${t.id} — status is now in progress.`, ticketCard(next, STATUS_LABEL.in_progress));
        },

        resumeSimulations() {
          if (!HD_RUNTIME.simulate) return;
          const now = Date.now();
          for (const t of get().tickets) {
            if (t.sim === 'pickup' && !timers.has(`pickup:${t.id}`)) {
              if (now - t.createdAt > 30 * 60_000) patchTicket(t.id, (x) => ({ ...x, sim: undefined }));
              else later(`pickup:${t.id}`, 2500 + Math.random() * 2500, () => get().simulatePickup(t.id));
            }
          }
        },

        /* ============================================================ self-service */

        recordFix({ plan, deviceTag }, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const book = PLAYBOOKS[plan.playbookId];
          if (!book) return fail('Unknown fix.');
          const now = Date.now();
          if (deviceTag) {
            const d = findDevice(deviceTag);
            if (!d) return fail('Device not found.');
            if (!canViewDevice(v, d)) return deny(v, 'helpdesk.fix.run', deviceTag, book.title, 'That isn’t your device.');
            patchDevice(deviceTag, (x) => applyPlaybookEffects(x, plan, now));
          }
          const run = { id: uid('fx'), playbookId: plan.playbookId, userId: v.user.id, deviceTag, at: now, outcome: plan.outcome, summary: plan.summary } as const;
          if (plan.outcome === 'failed') {
            set((s) => ({ fixRuns: [run, ...s.fixRuns].slice(0, 200) }));
            return ok({});
          }
          const id = nextTicketId();
          const ticket: Ticket = {
            id,
            subject: book.title,
            description: `Ran the ${book.title} fix from Support Home.`,
            category: book.category,
            priority: 'P4',
            impact: 'me',
            urgency: 'low',
            status: 'resolved',
            requesterId: v.user.id,
            deviceTag,
            createdAt: now,
            updatedAt: now + 2,
            firstResponseAt: now,
            resolvedAt: now + 2,
            pausedMs: 0,
            resolution: { code: 'self_service', note: plan.summary },
            selfService: { playbookId: plan.playbookId, outcome: plan.outcome },
            events: [
              ev('created', { actorId: v.user.id, body: `Ran the ${book.title} fix from Support Home.` }, now),
              ev('automation', { body: `Nova ran ${book.title}${deviceTag ? ` on ${deviceTag}` : ''} — ${plan.summary}\n\n${plan.steps.map((s) => `${s.status === 'ok' ? '✓' : '!'} ${s.label}`).join('\n')}` }, now + 1),
              ev('status', { from: 'new', to: 'resolved', body: plan.outcome === 'partial' ? 'Partially resolved by Nova' : 'Resolved by Nova' }, now + 2),
            ],
          };
          set((s) => ({ tickets: [ticket, ...s.tickets], fixRuns: [{ ...run, ticketId: id }, ...s.fixRuns].slice(0, 200) }));
          if (plan.playbookId === 'report-phishing') audit({ action: 'helpdesk.phishing.reported', target: id, detail: plan.summary, severity: 'warning', actorId: v.user.id });
          return ok({ ticketId: id });
        },

        applyHealthFix(tag, check, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (!canViewDevice(v, d)) return deny(v, 'helpdesk.device.fix', tag, check, 'That isn’t your device.');
          const c = healthChecks(d, Date.now()).find((x) => x.id === check);
          if (!c) return fail('Unknown check.');
          if (c.status === 'pass') return ok();
          if (c.fix?.kind !== 'auto') return fail('This one needs IT — raise a ticket.');
          patchDevice(tag, (x) => applyCheckFix(x, check, Date.now()));
          return ok();
        },

        markDiagRun(tag) {
          set((s) => ({ diagRuns: { ...s.diagRuns, [tag]: Date.now() } }));
        },

        /* ============================================================ devices: owner */

        revealRecoveryKey(tag, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (!canViewDevice(v, d)) {
            audit({ action: 'helpdesk.recovery_key.reveal', target: tag, detail: 'Not the owner or IT', outcome: 'denied', severity: 'critical', actorId: v.user.id });
            return fail('Only the device owner or IT can reveal recovery keys.');
          }
          if (!d.recoveryKey) return fail('No recovery key is escrowed for this device.');
          audit({ action: 'helpdesk.recovery_key.reveal', target: tag, detail: `${d.model} · revealed by ${d.assigneeId === v.user.id ? 'owner' : 'IT'} for 30s`, severity: 'warning', actorId: v.user.id });
          if (d.assigneeId && d.assigneeId !== v.user.id) notify([d.assigneeId], v.user.id, { kind: 'system', title: `IT viewed the recovery key for ${tag}`, body: `${nameOf(v.user.id)} revealed it — this is logged.`, link: `/helpdesk/devices/${tag}` });
          return ok({ key: d.recoveryKey });
        },

        reportLost(tag, input, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (!canViewDevice(v, d)) return deny(v, 'helpdesk.device.lost', tag, 'Not the owner', 'You can only report your own devices.');
          if (d.status === 'lost') return fail('This device is already reported lost.');
          if (d.status !== 'in_use' && d.status !== 'loaner') return fail(`A device that is ${DEVICE_STATUS_LABEL[d.status].toLowerCase()} can’t be reported lost.`);
          if (input.where.trim().length < 2) return fail('Tell us roughly where you last had it.');
          const owner = d.assigneeId ?? v.user.id;
          const verb = input.stolen ? 'stolen' : 'lost';
          const r = get().createTicket(
            {
              subject: `${input.stolen ? 'Stolen' : 'Lost'} device: ${d.model} (${tag})`,
              description: `Reported ${verb}.\nLast seen: ${input.where.trim()} · ${input.when.trim() || 'unknown time'}.${input.details?.trim() ? `\n\n${input.details.trim()}` : ''}`,
              category: 'security',
              priority: 'P1',
              impact: 'me',
              urgency: 'high',
              deviceTag: tag,
              requesterId: owner !== v.user.id && isIT(v) ? owner : undefined,
            },
            v,
          );
          if (!r.ok) return r;
          const now = Date.now();
          const sec = owner === 'u-ethan' ? 'u-layla' : 'u-ethan';
          patchTicket(r.ticket.id, (x) => ({
            ...x,
            sim: undefined,
            escalated: true,
            assigneeId: sec,
            events: [...x.events, ev('escalation', { body: 'Security incident — remote lock sent automatically' }, now), ev('assign', { to: sec }, now + 1)],
          }));
          patchDevice(tag, (x) => custody({ ...x, status: 'lost', loan: undefined }, 'lost', { userId: owner, actorId: v.user.id, note: `Reported ${verb} · ${input.where.trim()}` }));
          runMdm(tag, 'lock', v.user.id);
          audit({ action: 'helpdesk.device.lost', target: tag, detail: `${d.model} reported ${verb} (${r.ticket.id})`, severity: 'critical', actorId: v.user.id });
          notify([sec, 'u-layla'], v.user.id, { kind: 'work', title: `P1: ${d.model} reported ${verb}`, body: `${nameOf(owner)} · ${tag} · ${r.ticket.id}`, link: ticketRoute(r.ticket.id) });
          return ok({ ticketId: r.ticket.id });
        },

        scheduleReturn(tag, at, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (!canViewDevice(v, d)) return deny(v, 'helpdesk.device.return', tag, 'Not the owner', 'You can only return your own devices.');
          if (d.status !== 'in_use' && d.status !== 'loaner') return fail('Only devices in use can be returned.');
          if (!Number.isFinite(at) || at < Date.now() - DAY) return fail('Pick a date from today onwards.');
          patchDevice(tag, (x) => custody({ ...x, returnAt: at }, 'return_scheduled', { userId: x.assigneeId, actorId: v.user.id, note: `Drop-off ${new Date(at).toDateString()}` }));
          notify(['u-mateo'], v.user.id, { kind: 'work', title: `Return scheduled: ${tag}`, body: `${nameOf(d.assigneeId)} · ${d.model} · ${new Date(at).toDateString()}`, link: `/helpdesk/fleet/${tag}` });
          return ok();
        },

        /* ============================================================ devices: IT */

        updateDevice(tag, patch, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.update', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (patch.model !== undefined && patch.model.trim().length < 2) return fail('Model is required.');
          if (patch.serial !== undefined && patch.serial.trim().length < 4) return fail('Serial looks too short.');
          if (patch.cost !== undefined && (!Number.isFinite(patch.cost) || patch.cost < 0)) return fail('Cost must be a positive number.');
          patchDevice(tag, (x) => ({ ...x, ...patch, model: patch.model?.trim() ?? x.model, serial: patch.serial?.trim().toUpperCase() ?? x.serial }));
          audit({ action: 'helpdesk.device.update', target: tag, detail: Object.keys(patch).join(', '), actorId: v.user.id });
          return ok();
        },

        assignDevice(tag, userId, note, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.assign', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (d.status === 'retired' || d.status === 'lost') return fail(`A ${DEVICE_STATUS_LABEL[d.status].toLowerCase()} device can’t be assigned.`);
          if (userId) {
            const u = userById(userId);
            if (!u || !u.active) return fail('Pick an active person.');
          }
          if ((d.assigneeId ?? null) === userId) return ok();
          let next: Device = { ...d };
          if (d.assigneeId) next = custody(next, 'unassigned', { userId: d.assigneeId, actorId: v.user.id, note });
          next = userId ? custody({ ...next, assigneeId: userId, status: 'in_use', loan: undefined, returnAt: undefined }, 'assigned', { userId, actorId: v.user.id, note }) : { ...next, assigneeId: undefined, status: 'in_stock', loan: undefined, returnAt: undefined };
          patchDevice(tag, () => next);
          audit({ action: 'helpdesk.device.assign', target: tag, detail: userId ? `${nameOf(d.assigneeId) === 'Someone' ? 'stock' : nameOf(d.assigneeId)} → ${nameOf(userId)}` : `${nameOf(d.assigneeId)} → stock`, actorId: v.user.id });
          if (userId) notify([userId], v.user.id, { kind: 'work', title: `${d.model} is now assigned to you`, body: `${tag} · see it in My devices`, link: `/helpdesk/devices/${tag}` });
          return ok();
        },

        checkoutLoaner(tag, userId, dueAt, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.loan', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (d.status !== 'in_stock') return fail('Only devices in stock can be loaned.');
          if (!userById(userId)?.active) return fail('Pick an active person.');
          if (!Number.isFinite(dueAt) || dueAt <= Date.now()) return fail('The due date must be in the future.');
          const now = Date.now();
          patchDevice(tag, (x) => custody({ ...x, status: 'loaner', assigneeId: userId, loan: { since: now, dueAt } }, 'loaned', { userId, actorId: v.user.id, note: `Due ${new Date(dueAt).toDateString()}` }));
          audit({ action: 'helpdesk.device.loan', target: tag, detail: `Loaned to ${nameOf(userId)} until ${new Date(dueAt).toDateString()}`, actorId: v.user.id });
          notify([userId], v.user.id, { kind: 'work', title: `Loaner ${d.model} checked out to you`, body: `Due back ${new Date(dueAt).toDateString()}`, link: `/helpdesk/devices/${tag}` });
          return ok();
        },

        checkinLoaner(tag, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.loan_return', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (d.status !== 'loaner') return fail('This device isn’t on loan.');
          patchDevice(tag, (x) => custody({ ...x, status: 'in_stock', assigneeId: undefined, loan: undefined, returnAt: undefined }, 'returned', { userId: d.assigneeId, actorId: v.user.id, note: 'Loaner checked in · wiped & re-imaged' }));
          audit({ action: 'helpdesk.device.loan_return', target: tag, detail: `Returned by ${nameOf(d.assigneeId)}`, actorId: v.user.id });
          return ok();
        },

        extendLoan(tag, dueAt, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.loan_extend', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d || d.status !== 'loaner' || !d.loan) return fail('This device isn’t on loan.');
          if (!Number.isFinite(dueAt) || dueAt <= Date.now()) return fail('The new due date must be in the future.');
          patchDevice(tag, (x) => custody({ ...x, loan: { ...x.loan!, dueAt } }, 'loaned', { userId: x.assigneeId, actorId: v.user.id, note: `Loan extended to ${new Date(dueAt).toDateString()}` }));
          notify([d.assigneeId], v.user.id, { kind: 'work', title: `Loan extended: ${d.model}`, body: `Now due ${new Date(dueAt).toDateString()}`, link: `/helpdesk/devices/${tag}` });
          return ok();
        },

        sendToRepair(tag, input, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.repair', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (d.status === 'retired' || d.status === 'lost' || d.status === 'in_repair') return fail(`Can’t send a ${DEVICE_STATUS_LABEL[d.status].toLowerCase()} device to repair.`);
          if (input.vendor.trim().length < 2) return fail('Who is repairing it?');
          patchDevice(tag, (x) => custody({ ...x, status: 'in_repair', repair: { vendor: input.vendor.trim(), since: Date.now(), eta: input.eta, note: input.note?.trim() } }, 'repair', { actorId: v.user.id, note: `${input.vendor.trim()}${input.note ? ` — ${input.note.trim()}` : ''}` }));
          notify([d.assigneeId], v.user.id, { kind: 'work', title: `${d.model} sent for repair`, body: input.eta ? `Expected back ${new Date(input.eta).toDateString()}` : input.vendor, link: `/helpdesk/devices/${tag}` });
          return ok();
        },

        returnFromRepair(tag, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.repaired', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d || d.status !== 'in_repair') return fail('This device isn’t in repair.');
          patchDevice(tag, (x) => custody({ ...x, status: x.assigneeId ? 'in_use' : 'in_stock', repair: undefined }, 'repaired', { actorId: v.user.id, note: 'Back from repair · QA passed' }));
          notify([d.assigneeId], v.user.id, { kind: 'work', title: `${d.model} is back from repair`, body: tag, link: `/helpdesk/devices/${tag}` });
          return ok();
        },

        retireDevice(tag, reason, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.retire', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (d.status === 'retired') return ok();
          if (reason.trim().length < 3) return fail('Add a short reason.');
          patchDevice(tag, (x) => custody({ ...x, status: 'retired', assigneeId: undefined, loan: undefined, returnAt: undefined }, 'retired', { userId: d.assigneeId, actorId: v.user.id, note: reason.trim() }));
          audit({ action: 'helpdesk.device.retire', target: tag, detail: reason.trim(), actorId: v.user.id });
          return ok();
        },

        markLost(tag, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.lost', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (d.status === 'lost' || d.status === 'retired') return fail(`Device is already ${DEVICE_STATUS_LABEL[d.status].toLowerCase()}.`);
          patchDevice(tag, (x) => custody({ ...x, status: 'lost' }, 'lost', { userId: x.assigneeId, actorId: v.user.id, note: 'Marked lost by IT' }));
          if (isManagedKind(d.kind)) runMdm(tag, 'lock', v.user.id);
          audit({ action: 'helpdesk.device.lost', target: tag, detail: `${d.model} marked lost by IT`, severity: 'critical', actorId: v.user.id });
          return ok();
        },

        markFound(tag, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.found', tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d || d.status !== 'lost') return fail('This device isn’t marked lost.');
          patchDevice(tag, (x) => custody({ ...x, status: x.assigneeId ? 'in_use' : 'in_stock', locked: false }, 'found', { actorId: v.user.id, note: 'Recovered · unlocked after identity check' }));
          audit({ action: 'helpdesk.device.found', target: tag, detail: d.model, severity: 'warning', actorId: v.user.id });
          return ok();
        },

        registerDevice(input, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.register', input.model);
          if ('ok' in v) return v;
          const model = input.model.trim();
          const serial = input.serial.trim().toUpperCase();
          if (model.length < 2) return fail('Model is required.');
          if (serial.length < 4) return fail('Serial number looks too short.');
          if (get().devices.some((d) => d.serial === serial)) return fail('A device with that serial is already registered.');
          if (input.assigneeId && !userById(input.assigneeId)?.active) return fail('Pick an active person.');
          const tags = (input.tags ?? []).filter((t) => get().tags.some((x) => x.id === t));
          const now = Date.now();
          const assetTag = nextAssetTag(input.kind, model, get().devices);
          const managed = isManagedKind(input.kind);
          let d: Device = {
            assetTag,
            kind: input.kind,
            manufacturer: input.manufacturer.trim() || 'Generic',
            model,
            serial,
            status: input.assigneeId ? 'in_use' : 'in_stock',
            assigneeId: input.assigneeId,
            office: input.office,
            tags,
            purchasedAt: now,
            warrantyEnd: now + (input.warrantyMonths ?? (managed ? 36 : 24)) * 30.4 * DAY,
            cost: Math.max(0, input.cost ?? 0),
            os: input.os,
            osTarget: input.os,
            mdm: [],
            custody: [{ id: uid('cu'), at: now, kind: 'registered', actorId: v.user.id, note: `Registered by ${nameOf(v.user.id)}` }],
          };
          if (managed) {
            d = {
              ...d,
              compliance: { encrypted: true, firewall: true, osCurrent: true },
              posture: { vpnClient: 'current', ssoExpiresAt: now + 30 * DAY, wifiCertExpiresAt: now + 365 * DAY },
              telemetry: { battery: input.kind === 'desktop' ? [] : [100, 100, 100], storage: [12, 14, 15], cpuTemp: [48, 52, 50], batteryCycles: 0, storageGb: 1024 },
              lastCheckIn: now,
              recoveryKey: recoveryKeyFor(assetTag, now),
            };
          } else d.firmwareCurrent = true;
          if (input.assigneeId) d = custody(d, 'assigned', { userId: input.assigneeId, actorId: v.user.id });
          set((s) => ({ devices: [d, ...s.devices] }));
          audit({ action: 'helpdesk.device.register', target: assetTag, detail: `${model} · ${serial}`, actorId: v.user.id });
          if (input.assigneeId) notify([input.assigneeId], v.user.id, { kind: 'work', title: `${model} is now assigned to you`, body: assetTag, link: `/helpdesk/devices/${assetTag}` });
          return ok({ assetTag });
        },

        mdmAction(tag, action, opts = {}, viewer) {
          const v = requireIT(who(viewer), `helpdesk.mdm.${action}`, tag);
          if ('ok' in v) return v;
          const d = findDevice(tag);
          if (!d) return fail('Device not found.');
          if (!isManagedKind(d.kind)) return fail('Remote actions need an MDM-enrolled device.');
          if (d.status === 'retired') return fail('Retired devices are no longer enrolled.');
          if (action === 'wipe' && (opts.confirmTag ?? '').trim().toUpperCase() !== tag) return fail(`Type ${tag} to confirm the wipe.`);
          if (action === 'unlock' && !d.locked) return fail('This device isn’t locked.');
          if (d.mdm.some((c) => c.action === action && c.state !== 'completed' && c.state !== 'failed')) return fail(`${MDM_LABEL[action]} is already in progress.`);
          const commandId = runMdm(tag, action, v.user.id);
          const severity = action === 'wipe' ? 'critical' : action === 'lock' || action === 'rotate_key' || action === 'unlock' ? 'warning' : 'info';
          audit({ action: `helpdesk.mdm.${action}`, target: tag, detail: `${MDM_LABEL[action]} · ${d.model}${d.assigneeId ? ` (${nameOf(d.assigneeId)})` : ''}`, severity, actorId: v.user.id });
          if ((action === 'lock' || action === 'wipe') && d.assigneeId) notify([d.assigneeId], v.user.id, { kind: 'system', title: `IT sent “${MDM_LABEL[action]}” to ${tag}`, body: d.model, link: `/helpdesk/devices/${tag}` });
          return ok({ commandId });
        },

        setDeviceTags(tag, tagIds, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.tags', tag);
          if ('ok' in v) return v;
          if (!findDevice(tag)) return fail('Device not found.');
          const valid = [...new Set(tagIds)].filter((t) => get().tags.some((x) => x.id === t));
          patchDevice(tag, (x) => ({ ...x, tags: valid }));
          return ok();
        },

        bulkTag(tags, tagId, on, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.bulk_tag', tagId);
          if ('ok' in v) return v;
          if (!get().tags.some((t) => t.id === tagId)) return fail('Tag not found.');
          const set_ = new Set(tags);
          let count = 0;
          set((s) => ({
            devices: s.devices.map((d) => {
              if (!set_.has(d.assetTag)) return d;
              const has = d.tags.includes(tagId);
              if (on === has) return d;
              count++;
              return { ...d, tags: on ? [...d.tags, tagId] : d.tags.filter((t) => t !== tagId) };
            }),
          }));
          return ok({ count });
        },

        bulkDeviceStatus(tags, status, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.device.bulk_status', status);
          if ('ok' in v) return v;
          if (!['in_stock', 'in_repair', 'retired'].includes(status)) return fail('Unsupported status.');
          let count = 0;
          for (const tag of tags) {
            const d = findDevice(tag);
            if (!d || d.status === status || d.status === 'lost') continue;
            if (status === 'retired') {
              if (get().retireDevice(tag, 'Bulk retire', v).ok) count++;
            } else if (status === 'in_repair') {
              if (get().sendToRepair(tag, { vendor: 'Helix IT bench' }, v).ok) count++;
            } else {
              patchDevice(tag, (x) => custody({ ...x, status: 'in_stock' as DeviceStatus, assigneeId: undefined, loan: undefined, repair: undefined }, 'returned', { userId: x.assigneeId, actorId: v.user.id, note: 'Bulk move to stock' }));
              count++;
            }
          }
          audit({ action: 'helpdesk.device.bulk_status', target: `${count} devices`, detail: `→ ${DEVICE_STATUS_LABEL[status]}`, actorId: v.user.id });
          return ok({ count });
        },

        /* ============================================================ tags */

        createTag(input, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.tag.create', input.name);
          if ('ok' in v) return v;
          const name = normaliseTagName(input.name);
          if (name.length < 2 || name.length > 24) return fail('Tag names are 2–24 characters (letters, numbers, - and +).');
          if (get().tags.some((t) => t.name === name)) return fail(`#${name} already exists.`);
          if (!/^#[0-9a-f]{6}$/i.test(input.color)) return fail('Pick a colour.');
          const id = name.replace(/\+/g, '-plus') + (get().tags.some((t) => t.id === name) ? `-${Date.now().toString(36).slice(-3)}` : '');
          const tag: DeviceTag = { id, name, color: input.color, description: input.description.trim().slice(0, 160), createdAt: Date.now() };
          set((s) => ({ tags: [...s.tags, tag] }));
          return ok({ tag });
        },

        updateTag(id, patch, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.tag.update', id);
          if ('ok' in v) return v;
          const t = get().tags.find((x) => x.id === id);
          if (!t) return fail('Tag not found.');
          const name = patch.name !== undefined ? normaliseTagName(patch.name) : t.name;
          if (name.length < 2 || name.length > 24) return fail('Tag names are 2–24 characters.');
          if (get().tags.some((x) => x.id !== id && x.name === name)) return fail(`#${name} already exists.`);
          if (patch.color !== undefined && !/^#[0-9a-f]{6}$/i.test(patch.color)) return fail('Pick a colour.');
          set((s) => ({ tags: s.tags.map((x) => (x.id === id ? { ...x, name, color: patch.color ?? x.color, description: patch.description?.trim().slice(0, 160) ?? x.description } : x)) }));
          return ok();
        },

        deleteTag(id, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.tag.delete', id);
          if ('ok' in v) return v;
          const tag = get().tags.find((x) => x.id === id);
          if (!tag) return fail('Tag not found.');
          const deviceTags = get().devices.filter((d) => d.tags.includes(id)).map((d) => d.assetTag);
          set((s) => ({ tags: s.tags.filter((x) => x.id !== id), devices: s.devices.map((d) => (d.tags.includes(id) ? { ...d, tags: d.tags.filter((t) => t !== id) } : d)) }));
          audit({ action: 'helpdesk.tag.delete', target: `#${tag.name}`, detail: `Removed from ${deviceTags.length} devices`, actorId: v.user.id });
          return ok({ snapshot: { tag, deviceTags } });
        },

        restoreTag(snapshot, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.tag.restore', snapshot.tag.id);
          if ('ok' in v) return v;
          if (get().tags.some((t) => t.id === snapshot.tag.id)) return ok();
          const on = new Set(snapshot.deviceTags);
          set((s) => ({ tags: [...s.tags, snapshot.tag], devices: s.devices.map((d) => (on.has(d.assetTag) && !d.tags.includes(snapshot.tag.id) ? { ...d, tags: [...d.tags, snapshot.tag.id] } : d)) }));
          return ok();
        },

        /* ============================================================ catalog */

        submitRequest(itemId, input, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const item = get().catalog.find((c) => c.id === itemId);
          if (!item) return fail('Catalog item not found.');
          const now = Date.now();
          const elig = checkEligibility(item, { user: v.user, devices: get().devices, requests: get().requests, now });
          if (elig.status === 'ineligible') {
            audit({ action: 'helpdesk.request.blocked', target: item.name, detail: elig.reasons[0], outcome: 'denied', severity: 'info', actorId: v.user.id });
            return fail(elig.reasons[0] ?? 'You’re not eligible for this item.');
          }
          const justification = (input.justification ?? '').trim();
          if (elig.needsJustification && justification.length < 10) return fail('Add a short reason (at least 10 characters).');
          const options: Record<string, string> = {};
          for (const o of item.options ?? []) {
            const choice = input.options?.[o.id] ?? o.choices[0];
            if (!o.choices.includes(choice)) return fail(`Pick a valid ${o.label.toLowerCase()}.`);
            options[o.id] = choice;
          }
          const n = get().seq.request;
          const request: CatalogRequest = {
            id: `REQ-${n}`,
            itemId,
            requesterId: v.user.id,
            options,
            justification,
            status: 'pending',
            steps: approvalChain(item, v.user),
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ requests: [request, ...s.requests], seq: { ...s.seq, request: n + 1 } }));
          notifyApprover(request, v.user.id, item.name);
          if (item.sensitive) audit({ action: 'helpdesk.request.sensitive', target: request.id, detail: `${item.name} requested`, severity: 'warning', actorId: v.user.id });
          return ok({ request });
        },

        decideRequest(requestId, approve, note, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const r = get().requests.find((x) => x.id === requestId);
          if (!r) return fail('Request not found.');
          const item = get().catalog.find((c) => c.id === r.itemId);
          const approver = { id: v.user.id, isIT: isIT(v), isSecurity: isSecurity(v) };
          const can = canDecide(r, approver);
          if (!can.ok) return deny(v, 'helpdesk.request.decide', requestId, can.reason ?? 'Not an approver', can.reason ?? 'You can’t decide this request.');
          if (!approve && !(note ?? '').trim()) return fail('Add a short note so the requester knows why.');
          const step = currentStep(r)!;
          const next = decide(r, approver, approve, note?.trim() || undefined, Date.now());
          set((s) => ({ requests: s.requests.map((x) => (x.id === requestId ? next : x)) }));
          const label = APPROVAL_ROLE_LABEL[step.role];
          if (item?.sensitive || step.role === 'security')
            audit({ action: approve ? 'helpdesk.request.approve' : 'helpdesk.request.deny', target: requestId, detail: `${item?.name} · ${label} step`, severity: step.role === 'security' ? 'warning' : 'info', actorId: v.user.id });
          const link = `/helpdesk/requests?r=${requestId}`;
          if (!approve) notify([r.requesterId], v.user.id, { kind: 'request', title: `${item?.name ?? 'Request'} was declined`, body: note?.trim(), link });
          else if (next.status === 'approved') {
            notify([r.requesterId], v.user.id, { kind: 'request', title: `${item?.name ?? 'Request'} approved`, body: 'IT will fulfil it shortly.', link });
            notify(['u-mateo', 'u-layla'], v.user.id, { kind: 'request', title: `Ready to fulfil: ${requestId}`, body: `${item?.name} for ${nameOf(r.requesterId)}`, link: '/helpdesk/queue?view=fulfilment' });
          } else {
            notify([r.requesterId], v.user.id, { kind: 'request', title: `${label} approved ${item?.name ?? 'your request'}`, body: `Next: ${APPROVAL_ROLE_LABEL[currentStep(next)?.role ?? 'it']}`, link });
            notifyApprover(next, v.user.id, item?.name ?? 'an item');
          }
          return ok();
        },

        cancelRequest(requestId, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const r = get().requests.find((x) => x.id === requestId);
          if (!r) return fail('Request not found.');
          if (r.requesterId !== v.user.id) return deny(v, 'helpdesk.request.cancel', requestId, 'Not the requester', 'Only the requester can cancel.');
          if (r.status !== 'pending') return fail('Only pending requests can be cancelled.');
          set((s) => ({ requests: s.requests.map((x) => (x.id === requestId ? { ...x, status: 'cancelled', updatedAt: Date.now() } : x)) }));
          return ok();
        },

        fulfilRequest(requestId, input, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.request.fulfil', requestId);
          if ('ok' in v) return v;
          const r = get().requests.find((x) => x.id === requestId);
          if (!r) return fail('Request not found.');
          if (r.status !== 'approved') return fail('Only approved requests can be fulfilled.');
          const item = get().catalog.find((c) => c.id === r.itemId);
          if (!item) return fail('Catalog item not found.');
          const now = Date.now();
          if (item.kind === 'hardware') {
            if (!input.deviceTag) return fail('Pick a stock device to hand over.');
            const d = findDevice(input.deviceTag);
            if (!d || d.status !== 'in_stock') return fail('That device isn’t in stock.');
            if (item.deviceKind && d.kind !== item.deviceKind) return fail(`Pick a ${item.deviceKind.replace('-', ' ')}.`);
            if (item.stockModel && !d.model.startsWith(item.stockModel)) return fail(`Pick a ${item.stockModel} from stock.`);
            patchDevice(d.assetTag, (x) =>
              custody(custody({ ...x, status: 'in_use', assigneeId: r.requesterId }, 'fulfilled', { actorId: v.user.id, note: `${requestId} · ${item.name}` }), 'assigned', { userId: r.requesterId, actorId: v.user.id }),
            );
            audit({ action: 'helpdesk.device.assign', target: d.assetTag, detail: `stock → ${nameOf(r.requesterId)} (${requestId})`, actorId: v.user.id });
          }
          set((s) => ({ requests: s.requests.map((x) => (x.id === requestId ? { ...x, status: 'fulfilled', updatedAt: now, fulfilment: { at: now, by: v.user.id, deviceTag: input.deviceTag, note: input.note?.trim() || undefined } } : x)) }));
          notify([r.requesterId], v.user.id, {
            kind: 'request',
            title: `${item.name} is ready`,
            body: input.deviceTag ? `${input.deviceTag} is assigned to you${input.note ? ` — ${input.note.trim()}` : ''}` : (input.note?.trim() ?? 'Access is live.'),
            link: input.deviceTag ? `/helpdesk/devices/${input.deviceTag}` : `/helpdesk/requests?r=${requestId}`,
          });
          return ok();
        },

        /* ============================================================ status */

        postIncidentUpdate(incidentId, status, body, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.incident.update', incidentId);
          if ('ok' in v) return v;
          const inc = get().incidents.find((i) => i.id === incidentId);
          if (!inc) return fail('Incident not found.');
          if (inc.status === 'resolved') return fail('This incident is already resolved.');
          const text = body.trim();
          if (text.length < 5) return fail('Write a short update for people.');
          const now = Date.now();
          const next: Incident = { ...inc, status, resolvedAt: status === 'resolved' ? now : undefined, updates: [...inc.updates, { id: uid('iu'), at: now, status, body: text, authorId: v.user.id }] };
          set((s) => ({ incidents: s.incidents.map((i) => (i.id === incidentId ? next : i)) }));
          const label = INCIDENT_STATUS_LABEL[status];
          notify(get().statusSubs, v.user.id, { kind: 'system', title: `${inc.title} · ${label}`, body: text.slice(0, 140), link: '/helpdesk/status' });
          if (status === 'resolved') {
            const linked = get().tickets.filter((t) => t.incidentId === incidentId && t.status !== 'resolved');
            for (const t of linked) notify([t.requesterId], v.user.id, { kind: 'work', title: `${inc.title} is resolved`, body: `Related to your ticket ${t.id}`, link: ticketRoute(t.id) });
          }
          chatPost(v, 'ch-it-help', `${label}: ${inc.title} — ${text}`, { app: 'helpdesk', title: `${inc.id} · ${inc.title}`, subtitle: label, to: '/helpdesk/status', status: label });
          audit({ action: 'helpdesk.incident.update', target: incidentId, detail: `${label}: ${text.slice(0, 80)}`, actorId: v.user.id });
          return ok();
        },

        createIncident(input, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.incident.create', input.title);
          if ('ok' in v) return v;
          const title = input.title.trim();
          if (title.length < 5) return fail('Give the incident a clear title.');
          const services = input.serviceIds.filter((id) => get().services.some((s) => s.id === id));
          if (!services.length) return fail('Pick at least one affected service.');
          if (input.body.trim().length < 5) return fail('Write a first update for people.');
          const now = Date.now();
          const n = get().seq.incident;
          const incident: Incident = {
            id: `INC-${n}`,
            title,
            serviceIds: services,
            severity: input.severity,
            status: 'investigating',
            startedAt: now,
            offices: input.offices?.length ? input.offices : undefined,
            updates: [{ id: uid('iu'), at: now, status: 'investigating', body: input.body.trim(), authorId: v.user.id }],
          };
          set((s) => ({ incidents: [incident, ...s.incidents], seq: { ...s.seq, incident: n + 1 } }));
          notify(get().statusSubs, v.user.id, { kind: 'system', title: `New incident: ${title}`, body: input.body.trim().slice(0, 140), link: '/helpdesk/status' });
          chatPost(v, 'ch-it-help', `New incident: ${title} — ${input.body.trim()}`, { app: 'helpdesk', title: `${incident.id} · ${title}`, subtitle: 'Investigating', to: '/helpdesk/status', status: 'Investigating' });
          audit({ action: 'helpdesk.incident.create', target: incident.id, detail: `${title} (${input.severity})`, severity: input.severity === 'critical' ? 'critical' : 'warning', actorId: v.user.id });
          return ok({ incident });
        },

        toggleStatusSub(viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          const on = get().statusSubs.includes(v.user.id);
          set((s) => ({ statusSubs: on ? s.statusSubs.filter((x) => x !== v.user.id) : [...s.statusSubs, v.user.id] }));
          return ok({ subscribed: !on });
        },

        /* ============================================================ guides */

        voteGuide(slug, vote, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          if (!get().guides.some((g) => g.slug === slug)) return fail('Guide not found.');
          set((s) => {
            const cur = { ...(s.guideVotes[slug] ?? {}) };
            if (cur[v.user.id] === vote) delete cur[v.user.id];
            else cur[v.user.id] = vote;
            return { guideVotes: { ...s.guideVotes, [slug]: cur } };
          });
          return ok();
        },

        /* ============================================================ fleet views */

        saveFleetView(name, filter, viewer) {
          const v = requireIT(who(viewer), 'helpdesk.fleet.view', name);
          if ('ok' in v) return v;
          const n = name.trim();
          if (n.length < 2 || n.length > 40) return fail('Name the view (2–40 characters).');
          const view: SavedView = { id: uid('view'), name: n, filter };
          set((s) => ({ fleetViews: { ...s.fleetViews, [v.user.id]: [...(s.fleetViews[v.user.id] ?? []), view].slice(-12) } }));
          return ok({ view });
        },

        deleteFleetView(id, viewer) {
          const v = who(viewer);
          if (!v) return fail('Sign in first.');
          set((s) => ({ fleetViews: { ...s.fleetViews, [v.user.id]: (s.fleetViews[v.user.id] ?? []).filter((x) => x.id !== id) } }));
          return ok();
        },

        resetDemo() {
          clearTimers();
          set({ ...createSeed() });
        },
      };

      function notifyApprover(r: CatalogRequest, actorId: string, itemName: string) {
        const step = currentStep(r);
        if (!step) return;
        const title = `${nameOf(r.requesterId)} requested ${itemName}`;
        const link = '/helpdesk/requests?tab=approvals';
        if (step.role === 'manager') notify([step.approverId], actorId, { kind: 'request', title, body: r.justification || undefined, link });
        else if (step.role === 'it') notify(['u-layla'], actorId, { kind: 'request', title: `IT approval: ${itemName}`, body: `${nameOf(r.requesterId)} · ${r.id}`, link });
        else notify(['u-ethan', 'u-layla'], actorId, { kind: 'request', title: `Security approval: ${itemName}`, body: `${nameOf(r.requesterId)} · ${r.id}`, link });
      }
    },
    {
      name: 'nexus-helpdesk-v2',
      version: HELPDESK_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as HelpdeskStore,
      migrate: (persisted, version) => (version === HELPDESK_VERSION ? persisted : createSeed()) as HelpdeskStore,
    },
  ),
);

export function normaliseTagName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9+-]/g, '')
    .replace(/-+/g, '-');
}
