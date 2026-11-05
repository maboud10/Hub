import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import {
  canUserManageHelpdesk,
  generateNextAssetTag,
  useHelpdesk,
} from './store';

describe('IT Helpdesk & Fleet Command store', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    useHub.getState().login('u-mei');
    useHelpdesk.getState().resetHelpdeskDemo();
  });

  it('seeds at least 18 realistic devices, 10+ tickets, and 10 catalog items', () => {
    const state = useHelpdesk.getState();
    expect(state.devices.length).toBeGreaterThanOrEqual(18);
    expect(state.tickets.length).toBeGreaterThanOrEqual(10);
    expect(state.catalog.length).toBe(10);

    // Mei has laptop, monitor, and security key assigned
    const meiDevices = state.devices.filter((d) => d.assignedToUserId === 'u-mei');
    expect(meiDevices.map((d) => d.id)).toEqual(
      expect.arrayContaining(['dev-mac-mei', 'dev-mon-mei', 'dev-key-mei']),
    );
  });

  it('creates a ticket linked to an assigned hardware device and calculates SLA hours', () => {
    const res = useHelpdesk.getState().createTicket({
      title: 'Thunderbolt dock Ethernet port flapping on desk',
      description: 'Packet loss spikes when external 5K display wakes from sleep.',
      category: 'hardware',
      priority: 'p1',
      deviceId: 'dev-mac-mei',
      includeTelemetry: true,
    });

    expect(res.ok).toBe(true);
    expect(res.ticket).toBeDefined();
    expect(res.ticket?.slaTargetHours).toBe(1);
    expect(res.ticket?.deviceId).toBe('dev-mac-mei');
    expect(res.ticket?.requesterId).toBe('u-mei');
    expect(res.ticket?.number).toMatch(/^IT-\d+$/);
  });

  it('transitions ticket status, posts comments/internal notes, and records CSAT rating', () => {
    const ticketId = 'tkt-1042';
    const commentRes = useHelpdesk.getState().addTicketComment(
      ticketId,
      'Power-cycled the Thunderbolt cable; flicker stopped!',
      { authorId: 'u-mei' },
    );
    expect(commentRes.ok).toBe(true);

    const statusRes = useHelpdesk.getState().updateTicketStatus(ticketId, 'resolved', 'u-ethan');
    expect(statusRes.ok).toBe(true);

    const afterResolve = useHelpdesk.getState().tickets.find((t) => t.id === ticketId)!;
    expect(afterResolve.status).toBe('resolved');
    expect(afterResolve.slaStatus).toBe('met');
    expect(afterResolve.resolvedAt).toBeDefined();

    const csatRes = useHelpdesk.getState().rateTicketCsat(ticketId, 5);
    expect(csatRes.ok).toBe(true);

    const afterCsat = useHelpdesk.getState().tickets.find((t) => t.id === ticketId)!;
    expect(afterCsat.csatRating).toBe(5);
    expect(afterCsat.status).toBe('closed');
  });

  it('assigns, reassigns, and unassigns hardware devices with full chain-of-custody logs', () => {
    const stockId = 'dev-stock-mac1';
    const before = useHelpdesk.getState().devices.find((d) => d.id === stockId)!;
    expect(before.status).toBe('in_stock');

    // Assign stock device to Lucas
    const assignRes = useHelpdesk
      .getState()
      .assignDevice(stockId, 'u-lucas', 'Hot-swap loaner while HX-MAC-0067 is in Berlin repair.', 'u-layla');
    expect(assignRes.ok).toBe(true);

    const assigned = useHelpdesk.getState().devices.find((d) => d.id === stockId)!;
    expect(assigned.status).toBe('assigned');
    expect(assigned.assignedToUserId).toBe('u-lucas');
    expect(assigned.tags).not.toContain('loaner-pool');
    expect(assigned.custodyLog[0].action).toBe('assigned');
    expect(assigned.custodyLog[0].userId).toBe('u-lucas');

    // Reassign from Lucas to Noah
    const reassignRes = useHelpdesk
      .getState()
      .assignDevice(stockId, 'u-noah', 'Transferred to New York sales roadshow.', 'u-layla');
    expect(reassignRes.ok).toBe(true);

    const reassigned = useHelpdesk.getState().devices.find((d) => d.id === stockId)!;
    expect(reassigned.assignedToUserId).toBe('u-noah');
    expect(reassigned.custodyLog[0].action).toBe('reassigned');

    // Unassign back to stock depot
    const unassignRes = useHelpdesk
      .getState()
      .unassignDevice(stockId, 'Returned to Dubai Depot and wiped.', 'in_stock', 'u-mateo');
    expect(unassignRes.ok).toBe(true);

    const unassigned = useHelpdesk.getState().devices.find((d) => d.id === stockId)!;
    expect(unassigned.status).toBe('in_stock');
    expect(unassigned.assignedToUserId).toBeUndefined();
    expect(unassigned.tags).toContain('loaner-pool');
    expect(unassigned.custodyLog[0].action).toBe('unassigned');
  });

  it('adds and removes custom asset tags on devices and logs tag updates', () => {
    const devId = 'dev-mac-mei';
    const addRes = useHelpdesk.getState().addDeviceTag(devId, '#exec-tier', 'u-layla');
    expect(addRes.ok).toBe(true);

    let dev = useHelpdesk.getState().devices.find((d) => d.id === devId)!;
    expect(dev.tags).toContain('exec-tier');
    expect(dev.custodyLog[0].action).toBe('tag_updated');

    // Duplicate tag should fail gracefully
    const dupRes = useHelpdesk.getState().addDeviceTag(devId, 'exec-tier', 'u-layla');
    expect(dupRes.ok).toBe(false);

    // Remove tag
    const remRes = useHelpdesk.getState().removeDeviceTag(devId, 'exec-tier', 'u-layla');
    expect(remRes.ok).toBe(true);
    dev = useHelpdesk.getState().devices.find((d) => d.id === devId)!;
    expect(dev.tags).not.toContain('exec-tier');
  });

  it('executes remote MDM commands (patch push, FileVault rotation, repair toggle) and self-service diagnostics', () => {
    // Omar's laptop starts with patch_required
    const omarDevBefore = useHelpdesk.getState().devices.find((d) => d.id === 'dev-mac-omar')!;
    expect(omarDevBefore.compliance).toBe('patch_required');
    expect(omarDevBefore.tags).toContain('patch-required');

    const patchRes = useHelpdesk.getState().runMdmCommand('dev-mac-omar', 'push_os_patch', 'u-ethan');
    expect(patchRes.ok).toBe(true);

    const omarDevAfter = useHelpdesk.getState().devices.find((d) => d.id === 'dev-mac-omar')!;
    expect(omarDevAfter.compliance).toBe('compliant');
    expect(omarDevAfter.tags).not.toContain('patch-required');

    // Rotate FileVault key
    const oldKey = omarDevAfter.recoveryKeyEscrowed;
    const fvRes = useHelpdesk.getState().runMdmCommand('dev-mac-omar', 'rotate_filevault_key', 'u-layla');
    expect(fvRes.ok).toBe(true);
    const omarDevRotated = useHelpdesk.getState().devices.find((d) => d.id === 'dev-mac-omar')!;
    expect(omarDevRotated.recoveryKeyEscrowed).not.toBe(oldKey);

    // Self-service diagnostic playbook
    const diagRes = useHelpdesk.getState().runSelfServiceDiagnostic('vpn_wireguard', 'dev-mac-mei', 'u-mei');
    expect(diagRes.ok).toBe(true);
    expect(diagRes.run?.fixId).toBe('vpn_wireguard');
    expect(diagRes.run?.status).toBe('remediated');
  });

  it('registers a new hardware asset with auto-generated HX asset tag and checks IT admin permissions', () => {
    const existing = useHelpdesk.getState().devices;
    const nextTag = generateNextAssetTag('laptop', existing);
    expect(nextTag).toMatch(/^HX-MAC-\d{4}$/);

    const regRes = useHelpdesk.getState().registerDevice(
      {
        serialNumber: 'C02NEWM4MAX88',
        name: 'Sofia’s Brand Studio MacBook Pro 16"',
        model: 'MacBook Pro 16" (M3 Max)',
        category: 'laptop',
        location: 'London Hub',
        costUsd: 3899,
        assignedToUserId: 'u-sofia',
        tags: ['design-rig', 'new-hire-kit'],
      },
      'u-layla',
    );

    expect(regRes.ok).toBe(true);
    expect(regRes.device?.assignedToUserId).toBe('u-sofia');
    expect(regRes.device?.status).toBe('assigned');
    expect(regRes.device?.tags).toEqual(
      expect.arrayContaining(['design-rig', 'new-hire-kit', 'filevault-escrowed']),
    );

    // Check RBAC helper
    const users = useHub.getState().users;
    const layla = users.find((u) => u.id === 'u-layla')!;
    const ethan = users.find((u) => u.id === 'u-ethan')!;
    const mei = users.find((u) => u.id === 'u-mei')!;
    expect(canUserManageHelpdesk(layla)).toBe(true);
    expect(canUserManageHelpdesk(ethan)).toBe(true);
    expect(canUserManageHelpdesk(mei)).toBe(false);
  });
});
