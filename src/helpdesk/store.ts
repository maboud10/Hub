import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionResult, User } from '@/types';
import { useHub } from '@/store/hub';
import { effectivePermissions, hasPermission } from '@/lib/rbac';
import { uid } from '@/lib/id';
import { todayKey } from '@/lib/format';
import type {
  CatalogItem,
  CompliancePosture,
  DeviceCategory,
  DeviceStatus,
  HardwareDevice,
  HelpdeskTicket,
  MdmRemoteCommand,
  NewDeviceInput,
  NewTicketInput,
  SelfServiceFixId,
  SelfServiceRun,
  TicketPriority,
  TicketStatus,
} from './types';
import {
  SELF_SERVICE_PLAYBOOKS,
  SEED_CATALOG,
  SEED_DEVICES,
  SEED_SELF_SERVICE_RUNS,
  SEED_TICKETS,
} from './seed';

export const SLA_HOURS_BY_PRIORITY: Record<TicketPriority, 1 | 4 | 8 | 24> = {
  p1: 1,
  p2: 4,
  p3: 8,
  p4: 24,
};

export const ASSET_PREFIX_BY_CATEGORY: Record<DeviceCategory, string> = {
  laptop: 'HX-MAC',
  monitor: 'HX-MON',
  phone: 'HX-PHN',
  security_key: 'HX-KEY',
  peripheral: 'HX-PER',
};

export function canUserManageHelpdesk(user: User | null | undefined): boolean {
  if (!user || !user.active) return false;
  if (user.department === 'IT & Security') return true;
  if (user.roleIds.includes('admin')) return true;
  const roles = useHub.getState().roles;
  const perms = effectivePermissions(user, roles);
  return (
    hasPermission(perms, 'helpdesk.manage') ||
    hasPermission(perms, 'hub.users.manage') ||
    hasPermission(perms, '*')
  );
}

export function generateNextAssetTag(
  category: DeviceCategory,
  existingDevices: HardwareDevice[],
): string {
  const prefix = ASSET_PREFIX_BY_CATEGORY[category] ?? 'HX-DEV';
  const nums = existingDevices
    .map((d) => {
      const m = d.assetTag.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => !Number.isNaN(n));
  const next = Math.max(450, ...nums) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function generateRecoveryKey(category: DeviceCategory, assetTag: string): string {
  if (category === 'monitor' || category === 'peripheral') {
    return 'N/A (Peripheral Asset)';
  }
  if (category === 'security_key') {
    return 'FIDO2-ATTESTED-PIN-SET';
  }
  const suffix = assetTag.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FV2-${suffix}-${rand}-774C-ZT99`;
}

export interface HelpdeskState {
  version: number;
  devices: HardwareDevice[];
  tickets: HelpdeskTicket[];
  catalog: CatalogItem[];
  selfServiceRuns: SelfServiceRun[];
  adminPreviewOverride: boolean;
}

export interface HelpdeskActions {
  setAdminPreviewOverride(enabled: boolean): void;
  createTicket(
    input: NewTicketInput,
  ): ActionResult & { ticket?: HelpdeskTicket };
  updateTicketStatus(
    ticketId: string,
    status: TicketStatus,
    actorId?: string,
  ): ActionResult;
  assignTicket(
    ticketId: string,
    assigneeId: string | undefined,
    actorId?: string,
  ): ActionResult;
  updateTicketPriority(
    ticketId: string,
    priority: TicketPriority,
    actorId?: string,
  ): ActionResult;
  addTicketComment(
    ticketId: string,
    body: string,
    opts?: { internal?: boolean; authorId?: string },
  ): ActionResult;
  rateTicketCsat(ticketId: string, rating: number): ActionResult;
  requestCatalogItem(
    catalogItemId: string,
    opts?: { justification?: string; deviceId?: string; requesterId?: string },
  ): ActionResult & { ticket?: HelpdeskTicket };
  assignDevice(
    deviceId: string,
    userId: string,
    note?: string,
    actorId?: string,
  ): ActionResult;
  unassignDevice(
    deviceId: string,
    note?: string,
    targetStatus?: Extract<DeviceStatus, 'in_stock' | 'in_repair' | 'pending_return' | 'retired'>,
    actorId?: string,
  ): ActionResult;
  addDeviceTag(
    deviceId: string,
    tag: string,
    actorId?: string,
  ): ActionResult;
  removeDeviceTag(
    deviceId: string,
    tag: string,
    actorId?: string,
  ): ActionResult;
  runMdmCommand(
    deviceId: string,
    command: MdmRemoteCommand,
    actorId?: string,
  ): ActionResult;
  registerDevice(
    input: NewDeviceInput,
    actorId?: string,
  ): ActionResult & { device?: HardwareDevice };
  runSelfServiceDiagnostic(
    fixId: SelfServiceFixId,
    deviceId?: string,
    userId?: string,
  ): ActionResult & { run?: SelfServiceRun };
  resetHelpdeskDemo(): void;
}

export type HelpdeskStore = HelpdeskState & HelpdeskActions;

const HELPDESK_DATA_VERSION = 2;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

function currentActorId(explicit?: string): string {
  if (explicit) return explicit;
  return useHub.getState().sessionUserId ?? 'u-layla';
}

function userById(id?: string): User | undefined {
  if (!id) return undefined;
  return useHub.getState().users.find((u) => u.id === id);
}

export const useHelpdesk = create<HelpdeskStore>()(
  persist(
    (set, get) => ({
      version: HELPDESK_DATA_VERSION,
      devices: SEED_DEVICES,
      tickets: SEED_TICKETS,
      catalog: SEED_CATALOG,
      selfServiceRuns: SEED_SELF_SERVICE_RUNS,
      adminPreviewOverride: false,

      setAdminPreviewOverride(enabled) {
        set({ adminPreviewOverride: enabled });
      },

      createTicket(input) {
        const title = input.title.trim();
        const description = input.description.trim();
        if (title.length < 4) {
          return fail('Please provide a ticket summary (4+ characters).');
        }
        if (description.length < 6) {
          return fail('Please add a brief description (6+ characters).');
        }

        const requesterId = input.requesterId ?? currentActorId();
        const state = get();
        const maxNum = state.tickets.reduce((max, t) => {
          const n = Number(t.number.replace(/\D/g, '')) || 1040;
          return Math.max(max, n);
        }, 1041);
        const number = `IT-${maxNum + 1}`;
        const slaTargetHours = SLA_HOURS_BY_PRIORITY[input.priority];
        const now = Date.now();

        // Auto-route to an IT & Security specialist based on category
        const defaultAssignee =
          input.category === 'security' || input.category === 'network_vpn'
            ? 'u-ethan'
            : input.category === 'onboarding_kit'
              ? 'u-mateo'
              : 'u-layla';

        const ticket: HelpdeskTicket = {
          id: uid('tkt'),
          number,
          requesterId,
          assigneeId: defaultAssignee,
          title,
          description,
          category: input.category,
          priority: input.priority,
          slaTargetHours,
          slaStatus: 'on_track',
          status: 'open',
          deviceId: input.deviceId || undefined,
          requestedCatalogItemId: input.requestedCatalogItemId || undefined,
          includeTelemetry: input.includeTelemetry ?? Boolean(input.deviceId),
          createdAt: now,
          updatedAt: now,
          comments: [],
        };

        set((s) => ({
          tickets: [ticket, ...s.tickets],
        }));

        const hub = useHub.getState();
        const linkedDevice = state.devices.find((d) => d.id === input.deviceId);
        hub.logAudit({
          actorId: requesterId,
          action: 'helpdesk.ticket.created',
          target: `${ticket.number} · ${ticket.title}`,
          detail: `${ticket.priority.toUpperCase()} (${slaTargetHours}h SLA)${linkedDevice ? ` · Asset ${linkedDevice.assetTag}` : ''}`,
          outcome: 'success',
          severity: ticket.priority === 'p1' ? 'warning' : 'info',
        });

        if (defaultAssignee && defaultAssignee !== requesterId) {
          hub.pushNotifications([defaultAssignee], {
            kind: 'system',
            title: `New ${ticket.priority.toUpperCase()} ticket ${ticket.number}`,
            body: title,
            link: `/helpdesk/tickets?ticket=${ticket.id}`,
          });
        }

        return {
          ok: true,
          message: `Ticket ${ticket.number} filed (${slaTargetHours}h SLA target)`,
          ticket,
        };
      },

      updateTicketStatus(ticketId, status, actorId) {
        const actor = currentActorId(actorId);
        const ticket = get().tickets.find((t) => t.id === ticketId);
        if (!ticket) return fail('Ticket not found.');

        const now = Date.now();
        const isResolved = status === 'resolved' || status === 'closed';
        const slaStatus = isResolved
          ? ticket.slaStatus === 'breached'
            ? 'breached'
            : 'met'
          : ticket.slaStatus;

        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === ticketId
              ? {
                  ...t,
                  status,
                  slaStatus,
                  updatedAt: now,
                  resolvedAt: isResolved ? t.resolvedAt ?? now : undefined,
                }
              : t,
          ),
        }));

        const hub = useHub.getState();
        hub.logAudit({
          actorId: actor,
          action: 'helpdesk.ticket.status',
          target: `${ticket.number}`,
          detail: `${ticket.status} → ${status}`,
          outcome: 'success',
          severity: 'info',
        });

        if (ticket.requesterId !== actor) {
          hub.pushNotifications([ticket.requesterId], {
            kind: 'system',
            title: `${ticket.number} updated to ${status.replace(/_/g, ' ')}`,
            body: ticket.title,
            link: `/helpdesk/tickets?ticket=${ticket.id}`,
          });
        }

        return ok(`${ticket.number} marked ${status.replace(/_/g, ' ')}`);
      },

      assignTicket(ticketId, assigneeId, actorId) {
        const actor = currentActorId(actorId);
        const ticket = get().tickets.find((t) => t.id === ticketId);
        if (!ticket) return fail('Ticket not found.');
        const assignee = userById(assigneeId);

        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === ticketId
              ? {
                  ...t,
                  assigneeId: assigneeId || undefined,
                  status: t.status === 'open' && assigneeId ? 'triaged' : t.status,
                  updatedAt: Date.now(),
                }
              : t,
          ),
        }));

        useHub.getState().logAudit({
          actorId: actor,
          action: 'helpdesk.ticket.assigned',
          target: ticket.number,
          detail: assignee ? `Assigned to ${assignee.name}` : 'Unassigned',
          outcome: 'success',
          severity: 'info',
        });

        return ok(
          assignee
            ? `Assigned ${ticket.number} to ${assignee.name}`
            : `Unassigned ${ticket.number}`,
        );
      },

      updateTicketPriority(ticketId, priority, actorId) {
        const actor = currentActorId(actorId);
        const ticket = get().tickets.find((t) => t.id === ticketId);
        if (!ticket) return fail('Ticket not found.');
        const slaTargetHours = SLA_HOURS_BY_PRIORITY[priority];

        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === ticketId
              ? {
                  ...t,
                  priority,
                  slaTargetHours,
                  updatedAt: Date.now(),
                }
              : t,
          ),
        }));

        useHub.getState().logAudit({
          actorId: actor,
          action: 'helpdesk.ticket.priority',
          target: ticket.number,
          detail: `Priority set to ${priority.toUpperCase()} (${slaTargetHours}h SLA)`,
          outcome: 'success',
          severity: priority === 'p1' ? 'warning' : 'info',
        });

        return ok(`${ticket.number} priority updated to ${priority.toUpperCase()}`);
      },

      addTicketComment(ticketId, body, opts = {}) {
        const trimmed = body.trim();
        if (!trimmed) return fail('Comment cannot be empty.');
        const ticket = get().tickets.find((t) => t.id === ticketId);
        if (!ticket) return fail('Ticket not found.');

        const authorId = opts.authorId ?? currentActorId();
        const now = Date.now();
        const comment = {
          id: uid('cm'),
          authorId,
          body: trimmed,
          internal: opts.internal ?? false,
          createdAt: now,
        };

        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === ticketId
              ? {
                  ...t,
                  updatedAt: now,
                  comments: [...t.comments, comment],
                }
              : t,
          ),
        }));

        return ok(opts.internal ? 'Internal note added' : 'Reply posted');
      },

      rateTicketCsat(ticketId, rating) {
        if (rating < 1 || rating > 5) return fail('Rating must be between 1 and 5.');
        const ticket = get().tickets.find((t) => t.id === ticketId);
        if (!ticket) return fail('Ticket not found.');

        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === ticketId
              ? { ...t, csatRating: rating, status: 'closed', updatedAt: Date.now() }
              : t,
          ),
        }));

        return ok(`Thank you! Rated ${ticket.number} ${rating}/5 stars`);
      },

      requestCatalogItem(catalogItemId, opts = {}) {
        const item = get().catalog.find((c) => c.id === catalogItemId);
        if (!item) return fail('Catalog item not found.');

        const requesterId = opts.requesterId ?? currentActorId();
        const myDevices = get().devices.filter((d) => d.assignedToUserId === requesterId);
        const linkedDevice = opts.deviceId ?? myDevices[0]?.id;

        const categoryMap = {
          laptop: 'hardware',
          monitor: 'hardware',
          peripheral: 'hardware',
          security_key: 'security',
          ergonomics: 'hardware',
          software_license: 'software',
          network_access: 'network_vpn',
        } as const;

        const reason =
          opts.justification?.trim() ||
          `Catalog request for ${item.name} (${item.specsOrTier}) · Delivery SLA: ${item.deliverySla}.`;

        const res = get().createTicket({
          requesterId,
          title: `Catalog Request: ${item.name}`,
          description: reason,
          category: categoryMap[item.category],
          priority: 'p3',
          deviceId: linkedDevice,
          requestedCatalogItemId: item.id,
          includeTelemetry: false,
        });

        if (res.ok && item.inStockCount > 0 && item.billingModel === 'one_time') {
          set((s) => ({
            catalog: s.catalog.map((c) =>
              c.id === item.id ? { ...c, inStockCount: Math.max(0, c.inStockCount - 1) } : c,
            ),
          }));
        }

        return res;
      },

      assignDevice(deviceId, userId, note, actorId) {
        const actor = currentActorId(actorId);
        const device = get().devices.find((d) => d.id === deviceId);
        if (!device) return fail('Device not found.');
        const targetUser = userById(userId);
        if (!targetUser) return fail('Target user not found in directory.');

        const previousUser = userById(device.assignedToUserId);
        const isReassign = Boolean(device.assignedToUserId && device.assignedToUserId !== userId);
        const actionType = isReassign ? 'reassigned' : 'assigned';
        const now = Date.now();
        const defaultNote = isReassign
          ? `Transferred custody from ${previousUser?.name ?? device.assignedToUserId} to ${targetUser.name} (${targetUser.department}).`
          : `Assigned ${device.assetTag} (${device.model}) to ${targetUser.name} (${targetUser.department}).`;

        const nextTags = device.tags.filter((t) => t !== 'loaner-pool');

        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  status: 'assigned',
                  assignedToUserId: userId,
                  assignedAt: todayKey(new Date(now)),
                  tags: nextTags,
                  lastCheckInAt: now,
                  custodyLog: [
                    {
                      id: uid('cl'),
                      at: now,
                      action: actionType,
                      userId,
                      actorId: actor,
                      note: note?.trim() || defaultNote,
                    },
                    ...d.custodyLog,
                  ],
                }
              : d,
          ),
        }));

        const hub = useHub.getState();
        hub.logAudit({
          actorId: actor,
          action: `helpdesk.device.${actionType}`,
          target: `${device.assetTag} → ${targetUser.name}`,
          detail: note?.trim() || defaultNote,
          outcome: 'success',
          severity: 'info',
        });

        if (userId !== actor) {
          hub.pushNotifications([userId], {
            kind: 'system',
            title: `Hardware assigned: ${device.name}`,
            body: `Asset Tag ${device.assetTag} is now registered to your profile.`,
            link: '/helpdesk/my-devices',
          });
        }

        return ok(`Assigned ${device.assetTag} to ${targetUser.name}`);
      },

      unassignDevice(deviceId, note, targetStatus = 'in_stock', actorId) {
        const actor = currentActorId(actorId);
        const device = get().devices.find((d) => d.id === deviceId);
        if (!device) return fail('Device not found.');

        const prevUser = userById(device.assignedToUserId);
        const now = Date.now();
        const defaultNote = prevUser
          ? `Returned from ${prevUser.name} to ${device.location} IT Depot (${targetStatus.replace(/_/g, ' ')}).`
          : `Moved asset ${device.assetTag} to ${targetStatus.replace(/_/g, ' ')}.`;

        const nextTags =
          targetStatus === 'in_stock' && !device.tags.includes('loaner-pool')
            ? [...device.tags, 'loaner-pool']
            : device.tags;

        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  status: targetStatus,
                  assignedToUserId: undefined,
                  assignedAt: undefined,
                  tags: nextTags,
                  custodyLog: [
                    {
                      id: uid('cl'),
                      at: now,
                      action: targetStatus === 'in_repair' ? 'repair' : 'unassigned',
                      userId: prevUser?.id,
                      actorId: actor,
                      note: note?.trim() || defaultNote,
                    },
                    ...d.custodyLog,
                  ],
                }
              : d,
          ),
        }));

        useHub.getState().logAudit({
          actorId: actor,
          action: 'helpdesk.device.unassigned',
          target: `${device.assetTag}`,
          detail: note?.trim() || defaultNote,
          outcome: 'success',
          severity: 'info',
        });

        return ok(
          `${device.assetTag} returned to ${targetStatus === 'in_stock' ? 'Stock Depot' : targetStatus.replace(/_/g, ' ')}`,
        );
      },

      addDeviceTag(deviceId, rawTag, actorId) {
        const actor = currentActorId(actorId);
        const tag = rawTag
          .replace(/^#/, '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/(^-|-$)/g, '');
        if (!tag) return fail('Enter a valid tag name.');

        const device = get().devices.find((d) => d.id === deviceId);
        if (!device) return fail('Device not found.');
        if (device.tags.includes(tag)) return fail(`Device already has #${tag}.`);

        const now = Date.now();
        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  tags: [...d.tags, tag],
                  custodyLog: [
                    {
                      id: uid('cl'),
                      at: now,
                      action: 'tag_updated',
                      userId: d.assignedToUserId,
                      actorId: actor,
                      note: `Added asset tag #${tag} to ${d.assetTag}.`,
                    },
                    ...d.custodyLog,
                  ],
                }
              : d,
          ),
        }));

        return ok(`Tagged ${device.assetTag} with #${tag}`);
      },

      removeDeviceTag(deviceId, rawTag, actorId) {
        const actor = currentActorId(actorId);
        const tag = rawTag.replace(/^#/, '').trim().toLowerCase();
        const device = get().devices.find((d) => d.id === deviceId);
        if (!device) return fail('Device not found.');
        if (!device.tags.includes(tag)) return fail(`Tag #${tag} is not on this device.`);

        const now = Date.now();
        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  tags: d.tags.filter((t) => t !== tag),
                  custodyLog: [
                    {
                      id: uid('cl'),
                      at: now,
                      action: 'tag_updated',
                      userId: d.assignedToUserId,
                      actorId: actor,
                      note: `Removed asset tag #${tag} from ${d.assetTag}.`,
                    },
                    ...d.custodyLog,
                  ],
                }
              : d,
          ),
        }));

        return ok(`Removed #${tag} from ${device.assetTag}`);
      },

      runMdmCommand(deviceId, command, actorId) {
        const actor = currentActorId(actorId);
        const device = get().devices.find((d) => d.id === deviceId);
        if (!device) return fail('Device not found.');

        const now = Date.now();
        let note = '';
        let patch: Partial<HardwareDevice> = { lastCheckInAt: now };

        if (command === 'sync_telemetry') {
          note = 'Forced live Kandji/Jamf MDM check-in & verified CrowdStrike Falcon EDR heartbeat.';
          patch = {
            lastCheckInAt: now,
            mdmEnrolled: true,
            edrActive: true,
            firewallOn: true,
          };
        } else if (command === 'push_os_patch') {
          const nextOs =
            device.category === 'laptop'
              ? device.model.includes('ThinkPad')
                ? 'Windows 11 Enterprise 24H2 (KB5052093)'
                : 'macOS 15.3.1'
              : device.category === 'phone'
                ? 'iOS 18.3.1'
                : device.specs.osVersion;
          const nextTags = device.tags.filter((t) => t !== 'patch-required');
          const nextCompliance: CompliancePosture = 'compliant';
          note = `Pushed zero-day OS security patch (${nextOs}) via MDM; cleared #patch-required posture.`;
          patch = {
            lastCheckInAt: now,
            compliance: nextCompliance,
            encrypted: true,
            edrActive: true,
            firewallOn: true,
            tags: nextTags,
            specs: {
              ...device.specs,
              osVersion: nextOs,
            },
          };
        } else if (command === 'rotate_filevault_key') {
          const newKey = generateRecoveryKey(device.category, device.assetTag);
          const nextTags = device.tags.includes('filevault-escrowed')
            ? device.tags
            : [...device.tags, 'filevault-escrowed'];
          note = `Rotated disk recovery key & escrowed new secret (${newKey.slice(0, 12)}…) in Helix Vault.`;
          patch = {
            lastCheckInAt: now,
            encrypted: true,
            recoveryKeyEscrowed: newKey,
            tags: nextTags,
          };
        } else if (command === 'toggle_repair_status') {
          const nextStatus: DeviceStatus =
            device.status === 'in_repair'
              ? device.assignedToUserId
                ? 'assigned'
                : 'in_stock'
              : 'in_repair';
          note =
            nextStatus === 'in_repair'
              ? `Checked ${device.assetTag} into IT Hardware Repair bench.`
              : `Completed hardware repair on ${device.assetTag}; restored to ${nextStatus.replace(/_/g, ' ')}.`;
          patch = {
            lastCheckInAt: now,
            status: nextStatus,
          };
        }

        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  ...patch,
                  custodyLog: [
                    {
                      id: uid('cl'),
                      at: now,
                      action: command === 'toggle_repair_status' ? 'repair' : 'mdm_action',
                      userId: d.assignedToUserId,
                      actorId: actor,
                      note,
                    },
                    ...d.custodyLog,
                  ],
                }
              : d,
          ),
        }));

        useHub.getState().logAudit({
          actorId: actor,
          action: `helpdesk.mdm.${command}`,
          target: `${device.assetTag} (${device.name})`,
          detail: note,
          outcome: 'success',
          severity: 'info',
        });

        return ok(`${device.assetTag}: ${note}`);
      },

      registerDevice(input, actorId) {
        const actor = currentActorId(actorId);
        const name = input.name.trim();
        const model = input.model.trim();
        const serialNumber = input.serialNumber.trim().toUpperCase();
        if (name.length < 3) return fail('Device name is required (3+ characters).');
        if (model.length < 3) return fail('Device model is required.');
        if (serialNumber.length < 4) return fail('Serial number is required.');

        const state = get();
        const assetTag = (
          input.assetTag?.trim().toUpperCase() ||
          generateNextAssetTag(input.category, state.devices)
        );

        if (state.devices.some((d) => d.assetTag.toLowerCase() === assetTag.toLowerCase())) {
          return fail(`Asset tag ${assetTag} already exists in fleet inventory.`);
        }
        if (
          state.devices.some((d) => d.serialNumber.toLowerCase() === serialNumber.toLowerCase())
        ) {
          return fail(`Serial number ${serialNumber} is already registered.`);
        }

        const now = Date.now();
        const today = todayKey(new Date(now));
        const assignedUser = userById(input.assignedToUserId);
        const status: DeviceStatus = assignedUser ? 'assigned' : 'in_stock';
        const baseTags = (input.tags ?? [])
          .map((t) => t.replace(/^#/, '').trim().toLowerCase())
          .filter(Boolean);
        const tags = Array.from(
          new Set([
            ...baseTags,
            'filevault-escrowed',
            ...(!assignedUser ? ['loaner-pool'] : []),
          ]),
        );

        const newDevice: HardwareDevice = {
          id: uid('dev'),
          assetTag,
          serialNumber,
          name,
          model,
          category: input.category,
          specs: {
            cpu: input.specs?.cpu || (input.category === 'laptop' ? 'Apple M3 Pro (12-core)' : undefined),
            ram: input.specs?.ram || (input.category === 'laptop' ? '36 GB Unified' : undefined),
            storage: input.specs?.storage || (input.category === 'laptop' ? '1 TB NVMe' : undefined),
            osVersion:
              input.specs?.osVersion ||
              (input.category === 'laptop'
                ? 'macOS 15.3.1'
                : input.category === 'phone'
                  ? 'iOS 18.3.1'
                  : 'Firmware 2.4'),
            batteryHealthPct: input.category === 'laptop' || input.category === 'phone' ? 100 : undefined,
            cycleCount: input.category === 'laptop' || input.category === 'phone' ? 1 : undefined,
          },
          status,
          assignedToUserId: assignedUser?.id,
          assignedAt: assignedUser ? today : undefined,
          location: input.location,
          tags,
          compliance: 'compliant',
          encrypted: true,
          edrActive: true,
          firewallOn: true,
          mdmEnrolled: true,
          lastCheckInAt: now,
          recoveryKeyEscrowed: generateRecoveryKey(input.category, assetTag),
          purchaseDate: input.purchaseDate || today,
          warrantyUntil: input.warrantyUntil || '2029-11-01',
          costUsd: Math.max(0, Number(input.costUsd) || 1299),
          custodyLog: [
            {
              id: uid('cl'),
              at: now,
              action: assignedUser ? 'assigned' : 'unassigned',
              userId: assignedUser?.id,
              actorId: actor,
              note: assignedUser
                ? `Enrolled asset ${assetTag} in ABM/MDM and assigned directly to ${assignedUser.name}.`
                : `Registered new hardware asset ${assetTag} in ${input.location} depot.`,
            },
          ],
        };

        set((s) => ({
          devices: [newDevice, ...s.devices],
        }));

        useHub.getState().logAudit({
          actorId: actor,
          action: 'helpdesk.device.registered',
          target: `${newDevice.assetTag} · ${newDevice.model}`,
          detail: assignedUser ? `Assigned to ${assignedUser.name}` : `Stocked at ${newDevice.location}`,
          outcome: 'success',
          severity: 'info',
        });

        return {
          ok: true,
          message: `Registered ${newDevice.assetTag} (${newDevice.model})`,
          device: newDevice,
        };
      },

      runSelfServiceDiagnostic(fixId, deviceId, userId) {
        const playbook = SELF_SERVICE_PLAYBOOKS.find((p) => p.id === fixId);
        if (!playbook) return fail('Diagnostic playbook not found.');

        const actor = userId ?? currentActorId();
        const myDevices = get().devices.filter((d) => d.assignedToUserId === actor);
        const targetDeviceId = deviceId ?? myDevices[0]?.id;
        const now = Date.now();

        const run: SelfServiceRun = {
          id: uid('ssr'),
          fixId,
          userId: actor,
          deviceId: targetDeviceId,
          ranAt: now,
          status: 'remediated',
          summary: playbook.successSummary,
          stepsCompleted: playbook.steps,
        };

        set((s) => ({
          selfServiceRuns: [run, ...s.selfServiceRuns].slice(0, 50),
          devices: targetDeviceId
            ? s.devices.map((d) =>
                d.id === targetDeviceId
                  ? {
                      ...d,
                      lastCheckInAt: now,
                      mdmEnrolled: true,
                      edrActive: true,
                    }
                  : d,
              )
            : s.devices,
        }));

        return {
          ok: true,
          message: playbook.successSummary,
          run,
        };
      },

      resetHelpdeskDemo() {
        set({
          version: HELPDESK_DATA_VERSION,
          devices: SEED_DEVICES,
          tickets: SEED_TICKETS,
          catalog: SEED_CATALOG,
          selfServiceRuns: SEED_SELF_SERVICE_RUNS,
          adminPreviewOverride: false,
        });
      },
    }),
    {
      name: 'nexus.helpdesk.v2',
      version: HELPDESK_DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
