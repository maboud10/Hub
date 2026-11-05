import { useMemo, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Cpu,
  Eye,
  EyeOff,
  HardDrive,
  Headphones,
  KeyRound,
  Laptop,
  LifeBuoy,
  Monitor,
  Package,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Terminal,
  Ticket,
  UserCheck,
  UserMinus,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/primitives';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import type {
  CompliancePosture,
  DeviceCategory,
  DeviceLocation,
  DeviceStatus,
  HardwareDevice,
  MdmRemoteCommand,
  SelfServiceFixId,
  TicketCategory,
  TicketPriority,
  TicketSlaStatus,
  TicketStatus,
} from '@/helpdesk/types';
import {
  PRESET_DEVICE_TAGS,
  SELF_SERVICE_PLAYBOOKS,
  getTagMeta,
} from '@/helpdesk/seed';
import {
  SLA_HOURS_BY_PRIORITY,
  generateNextAssetTag,
  useHelpdesk,
} from '@/helpdesk/store';

export const DEVICE_CATEGORY_META: Record<
  DeviceCategory,
  { label: string; icon: LucideIcon; color: string }
> = {
  laptop: { label: 'Laptop / Workstation', icon: Laptop, color: '#22d3ee' },
  monitor: { label: '5K / External Display', icon: Monitor, color: '#a78bfa' },
  phone: { label: 'Managed Mobile', icon: Smartphone, color: '#f472b6' },
  security_key: { label: 'Hardware FIDO2 Key', icon: KeyRound, color: '#fbbf24' },
  peripheral: { label: 'Audio & Peripheral', icon: Headphones, color: '#34d399' },
};

export const DEVICE_STATUS_META: Record<
  DeviceStatus,
  { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }
> = {
  assigned: { label: 'Assigned', tone: 'success' },
  in_stock: { label: 'In Stock Depot', tone: 'info' },
  in_repair: { label: 'In Repair', tone: 'warning' },
  pending_return: { label: 'Pending Return', tone: 'danger' },
  retired: { label: 'Retired', tone: 'neutral' },
};

export const COMPLIANCE_META: Record<
  CompliancePosture,
  { label: string; tone: 'success' | 'warning' | 'danger'; icon: LucideIcon }
> = {
  compliant: { label: 'MDM Compliant', tone: 'success', icon: ShieldCheck },
  patch_required: { label: 'Patch Required', tone: 'warning', icon: AlertTriangle },
  non_compliant: { label: 'Non-Compliant', tone: 'danger', icon: ShieldAlert },
};

export const TICKET_PRIORITY_META: Record<
  TicketPriority,
  { label: string; short: string; sla: string; tone: 'danger' | 'warning' | 'info' | 'neutral' }
> = {
  p1: { label: 'P1 · Critical Blocker', short: 'P1', sla: '1h SLA', tone: 'danger' },
  p2: { label: 'P2 · High Impact', short: 'P2', sla: '4h SLA', tone: 'warning' },
  p3: { label: 'P3 · Normal', short: 'P3', sla: '8h SLA', tone: 'info' },
  p4: { label: 'P4 · Low / Request', short: 'P4', sla: '24h SLA', tone: 'neutral' },
};

export const TICKET_STATUS_META: Record<
  TicketStatus,
  { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' | 'danger' }
> = {
  open: { label: 'Open', tone: 'danger' },
  triaged: { label: 'Triaged', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'info' },
  waiting_on_user: { label: 'Waiting on User', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const TICKET_CATEGORY_META: Record<TicketCategory, { label: string; icon: LucideIcon }> = {
  hardware: { label: 'Hardware & Peripherals', icon: Laptop },
  access_sso: { label: 'Access, Passkey & SSO', icon: KeyRound },
  software: { label: 'Software & AI Licenses', icon: Cpu },
  network_vpn: { label: 'Network, Wi-Fi & VPN', icon: Activity },
  security: { label: 'Security & Encryption', icon: Shield },
  onboarding_kit: { label: 'Onboarding Hardware Kit', icon: Package },
};

export const SLA_STATUS_META: Record<
  TicketSlaStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  on_track: { label: 'SLA On Track', tone: 'success' },
  met: { label: 'SLA Met', tone: 'success' },
  at_risk: { label: 'SLA At Risk', tone: 'warning' },
  breached: { label: 'SLA Breached', tone: 'danger' },
};

export const DEVICE_LOCATIONS: DeviceLocation[] = [
  'Dubai HQ',
  'Singapore Hub',
  'London Hub',
  'Berlin',
  'New York',
  'Remote',
];

export function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Stylized monospace Asset Tag badge (`HX-MAC-0102`) */
export function AssetTagBadge({
  assetTag,
  category,
  onClick,
  size = 'md',
}: {
  assetTag: string;
  category?: DeviceCategory;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  const Icon = category ? DEVICE_CATEGORY_META[category].icon : QrCode;
  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cx('hd-asset-badge', size === 'sm' && 'hd-asset-badge--sm', onClick && 'is-clickable')}
      title={`IT Asset Tag ${assetTag}`}
    >
      <Icon size={size === 'sm' ? 12 : 13} />
      <span>{assetTag}</span>
    </span>
  );
}

/** Color-coded IT Fleet Tag pill (`#design-rig`, `#eng-heavy`, etc.) */
export function DeviceTagChip({
  tag,
  active,
  count,
  onClick,
  onRemove,
}: {
  tag: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  const meta = getTagMeta(tag);
  return (
    <span
      className={cx('hd-tag-chip', active && 'is-active', onClick && 'is-clickable')}
      style={{ '--tag-color': meta.color } as CSSProperties}
      onClick={onClick}
      title={meta.description}
    >
      <i className="hd-tag-chip__dot" />
      <span className="hd-tag-chip__text">{meta.label}</span>
      {typeof count === 'number' && <span className="hd-tag-chip__count">{count}</span>}
      {onRemove && (
        <button
          type="button"
          className="hd-tag-chip__remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${meta.label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Deterministic SVG QR + Barcode Physical Asset Tag Sticker */
export function PhysicalAssetSticker({
  device,
  assignedUser,
}: {
  device: HardwareDevice;
  assignedUser?: User | null;
}) {
  const [copied, setCopied] = useState(false);

  // Generate deterministic 7x7 QR matrix from assetTag + serialNumber
  const qrCells = useMemo(() => {
    const seedStr = `${device.assetTag}:${device.serialNumber}`;
    let hash = 2166136261;
    const grid: boolean[] = [];
    for (let i = 0; i < 49; i++) {
      const ch = seedStr.charCodeAt(i % seedStr.length);
      hash ^= ch + i * 31;
      hash = Math.imul(hash, 16777619);
      const r = Math.floor(i / 7);
      const c = i % 7;
      // Corner finder patterns
      const isCorner =
        (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2);
      grid.push(isCorner ? true : (Math.abs(hash) % 10) > 4);
    }
    return grid;
  }, [device.assetTag, device.serialNumber]);

  const barcodeBars = useMemo(() => {
    const str = `${device.assetTag}${device.serialNumber}`;
    return Array.from({ length: 28 }, (_, i) => {
      const code = str.charCodeAt(i % str.length);
      return (code + i * 7) % 3 === 0 ? 3 : (code + i) % 2 === 0 ? 2 : 1;
    });
  }, [device.assetTag, device.serialNumber]);

  const handleCopySticker = () => {
    const text = `HELIX CORP IT ASSET · TAG: ${device.assetTag} · S/N: ${device.serialNumber} · MODEL: ${device.model} · CUSTODY: ${assignedUser ? assignedUser.name : `Depot (${device.location})`}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    toast.success(`Copied asset label ${device.assetTag}`, text);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="hd-sticker" aria-label={`Physical Asset Tag Sticker for ${device.assetTag}`}>
      <div className="hd-sticker__top">
        <div>
          <div className="hd-sticker__brand">HELIX CORP · ZERO-TRUST IT ASSET</div>
          <div className="hd-sticker__tag">{device.assetTag}</div>
        </div>
        <div className="hd-sticker__qr" aria-hidden="true">
          {qrCells.map((on, idx) => (
            <span key={idx} className={cx('hd-sticker__qr-cell', on && 'is-on')} />
          ))}
        </div>
      </div>

      <div className="hd-sticker__meta">
        <div>
          <span className="hd-sticker__k">SERIAL NO</span>
          <strong className="hd-sticker__v mono">{device.serialNumber}</strong>
        </div>
        <div>
          <span className="hd-sticker__k">HARDWARE MODEL</span>
          <strong className="hd-sticker__v">{device.model}</strong>
        </div>
        <div>
          <span className="hd-sticker__k">CUSTODY HOLDER</span>
          <strong className="hd-sticker__v">
            {assignedUser ? `${assignedUser.name} (${assignedUser.employeeId})` : `STOCK · ${device.location}`}
          </strong>
        </div>
        <div>
          <span className="hd-sticker__k">HUB LOCATION</span>
          <strong className="hd-sticker__v">{device.location}</strong>
        </div>
      </div>

      <div className="hd-sticker__barcode-row">
        <div className="hd-sticker__bars" aria-hidden="true">
          {barcodeBars.map((w, idx) => (
            <i key={idx} style={{ width: `${w * 2}px` }} />
          ))}
        </div>
        <div className="hd-sticker__actions">
          <button
            type="button"
            className="btn btn--xs btn--ghost"
            onClick={handleCopySticker}
          >
            {copied ? <Check size={13} /> : <Printer size={13} />}
            {copied ? 'Copied Label' : 'Print / Copy Asset Tag'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Slide-Over Device Inspector & Custody / Tag / MDM Controller */
export function DeviceInspectorSheet({
  deviceId,
  onClose,
  onReportIssue,
}: {
  deviceId: string | null;
  onClose: () => void;
  onReportIssue?: (deviceId: string) => void;
}) {
  const devices = useHelpdesk((s) => s.devices);
  const tickets = useHelpdesk((s) => s.tickets);
  const assignDevice = useHelpdesk((s) => s.assignDevice);
  const unassignDevice = useHelpdesk((s) => s.unassignDevice);
  const addDeviceTag = useHelpdesk((s) => s.addDeviceTag);
  const removeDeviceTag = useHelpdesk((s) => s.removeDeviceTag);
  const runMdmCommand = useHelpdesk((s) => s.runMdmCommand);

  const users = useHub((s) => s.users);
  const device = devices.find((d) => d.id === deviceId) ?? null;

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [custodyNote, setCustodyNote] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');
  const [revealKey, setRevealKey] = useState(false);

  if (!device) {
    return <Sheet open={false} onClose={onClose} title="Device Inspector"><div /></Sheet>;
  }

  const assignedUser = users.find((u) => u.id === device.assignedToUserId) ?? null;
  const activeUsers = users.filter((u) => u.active);
  const effectiveTargetUser = selectedUserId || device.assignedToUserId || activeUsers[0]?.id || 'u-mei';
  const linkedTickets = tickets.filter((t) => t.deviceId === device.id);
  const compMeta = COMPLIANCE_META[device.compliance];
  const CompIcon = compMeta.icon;
  const statusMeta = DEVICE_STATUS_META[device.status];

  const handleAssignSubmit = () => {
    if (!effectiveTargetUser) return;
    const res = assignDevice(device.id, effectiveTargetUser, custodyNote);
    if (toast.result(res)) {
      setCustodyNote('');
    }
  };

  const handleUnassign = (target: 'in_stock' | 'in_repair') => {
    const res = unassignDevice(device.id, custodyNote, target);
    if (toast.result(res)) {
      setCustodyNote('');
    }
  };

  const handleAddTag = (tag: string) => {
    const res = addDeviceTag(device.id, tag);
    if (toast.result(res)) {
      setCustomTagInput('');
    }
  };

  const handleMdm = (cmd: MdmRemoteCommand) => {
    const res = runMdmCommand(device.id, cmd);
    toast.result(res);
  };

  return (
    <Sheet
      open={Boolean(device)}
      onClose={onClose}
      width={540}
      title={`${device.assetTag} · ${device.name}`}
      label={`Inspect hardware asset ${device.assetTag}`}
      footer={
        <div className="hd-sheet-foot">
          {onReportIssue && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                const id = device.id;
                onClose();
                onReportIssue(id);
              }}
            >
              <Ticket size={14} /> Report Issue on {device.assetTag}
            </button>
          )}
          <button type="button" className="btn btn--sm btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="hd-inspector">
        {/* Status & MDM Posture Header strip */}
        <div className="hd-inspector__status-bar">
          <span className={cx('hd-pill', `hd-pill--${statusMeta.tone}`)}>
            {statusMeta.label}
          </span>
          <span className={cx('hd-pill', `hd-pill--${compMeta.tone}`)}>
            <CompIcon size={13} />
            {compMeta.label}
          </span>
          <span className="hd-pill hd-pill--neutral">
            Check-in {relativeTime(device.lastCheckInAt)}
          </span>
        </div>

        {/* Printable Physical Asset Tag Sticker */}
        <PhysicalAssetSticker device={device} assignedUser={assignedUser} />

        {/* Custody & User Assignment Section */}
        <section className="hd-inspector__section">
          <div className="hd-inspector__sec-head">
            <h4>
              <UserCheck size={15} /> User Custody & Assignment
            </h4>
            {assignedUser ? (
              <span className="text-xs muted">Assigned {device.assignedAt ?? 'recently'}</span>
            ) : (
              <span className="text-xs muted">Currently unassigned ({device.location})</span>
            )}
          </div>

          {assignedUser ? (
            <div className="hd-custody-card">
              <Avatar user={assignedUser} size={38} presence />
              <div className="grow min-w-0">
                <div className="hd-custody-card__name">{assignedUser.name}</div>
                <div className="text-xs muted">
                  {assignedUser.title} · {assignedUser.department} · {assignedUser.employeeId}
                </div>
              </div>
              <button
                type="button"
                className="btn btn--xs btn--ghost"
                onClick={() => handleUnassign('in_stock')}
                title="Unassign and return device to Stock Depot"
              >
                <UserMinus size={13} /> Return to Stock
              </button>
            </div>
          ) : (
            <div className="hd-custody-card hd-custody-card--empty">
              <Package size={20} />
              <div className="grow">
                <div className="hd-custody-card__name">In Stock · {device.location} Depot</div>
                <div className="text-xs muted">Ready for immediate employee assignment or loaner dispatch</div>
              </div>
            </div>
          )}

          <div className="hd-assign-controls">
            <div className="hd-assign-controls__row">
              <select
                className="input input--sm grow"
                aria-label="Assign device to user"
                value={effectiveTargetUser}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.department} ({u.location})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={handleAssignSubmit}
              >
                <UserCheck size={14} />
                {assignedUser ? 'Transfer / Reassign' : 'Assign to User'}
              </button>
            </div>
            <input
              type="text"
              className="input input--sm"
              placeholder="Optional custody handoff note (e.g. Day-1 kit, temporary travel loaner)…"
              value={custodyNote}
              onChange={(e) => setCustodyNote(e.target.value)}
            />
          </div>
        </section>

        {/* Asset Tags Manager */}
        <section className="hd-inspector__section">
          <div className="hd-inspector__sec-head">
            <h4>
              <Tag size={15} /> Fleet Asset Tags ({device.tags.length})
            </h4>
            <span className="text-xs muted">Click × to remove or + to attach</span>
          </div>

          <div className="hd-tag-list">
            {device.tags.map((tag) => (
              <DeviceTagChip
                key={tag}
                tag={tag}
                onRemove={() => {
                  const res = removeDeviceTag(device.id, tag);
                  toast.result(res);
                }}
              />
            ))}
            {device.tags.length === 0 && (
              <span className="text-xs muted">No asset tags attached yet.</span>
            )}
          </div>

          <div className="hd-tag-adder">
            <input
              type="text"
              className="input input--sm grow"
              placeholder="Add custom tag (e.g. #gpu-cluster, #berlin-lab)…"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customTagInput.trim()) {
                  e.preventDefault();
                  handleAddTag(customTagInput);
                }
              }}
            />
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={!customTagInput.trim()}
              onClick={() => handleAddTag(customTagInput)}
            >
              <Plus size={14} /> Add Tag
            </button>
          </div>

          <div className="hd-preset-tags">
            <span className="text-xs muted">Quick presets:</span>
            <div className="hd-preset-tags__wrap">
              {PRESET_DEVICE_TAGS.filter((p) => !device.tags.includes(p.tag)).map((p) => (
                <button
                  key={p.tag}
                  type="button"
                  className="hd-preset-pill"
                  onClick={() => handleAddTag(p.tag)}
                  title={p.description}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Remote MDM Command Bar & Telemetry */}
        <section className="hd-inspector__section">
          <div className="hd-inspector__sec-head">
            <h4>
              <Shield size={15} /> Zero-Trust MDM Posture & Remote Actions
            </h4>
          </div>

          <div className="hd-telemetry-grid">
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">Disk Encryption</span>
              <strong className={cx('hd-telemetry-cell__v', device.encrypted ? 'text-success' : 'text-danger')}>
                {device.encrypted ? 'FileVault / BitLocker Active' : 'Unencrypted'}
              </strong>
            </div>
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">CrowdStrike EDR</span>
              <strong className={cx('hd-telemetry-cell__v', device.edrActive ? 'text-success' : 'text-danger')}>
                {device.edrActive ? 'Sensor Protecting' : 'Sensor Offline'}
              </strong>
            </div>
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">OS / Firmware</span>
              <strong className="hd-telemetry-cell__v">{device.specs.osVersion ?? 'Managed OS'}</strong>
            </div>
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">Hardware Specs</span>
              <strong className="hd-telemetry-cell__v">
                {[device.specs.cpu, device.specs.ram, device.specs.storage].filter(Boolean).join(' · ') ||
                  device.model}
              </strong>
            </div>
          </div>

          {/* Escrowed Recovery Key */}
          <div className="hd-recovery-box">
            <div className="grow min-w-0">
              <div className="text-xs muted">Escrowed Recovery Key (Helix Vault)</div>
              <div className="mono text-sm">
                {revealKey ? device.recoveryKeyEscrowed : '••••-••••-••••-••••-ESCROWED'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => setRevealKey((v) => !v)}
            >
              {revealKey ? <EyeOff size={13} /> : <Eye size={13} />}
              {revealKey ? 'Hide' : 'Reveal'}
            </button>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => {
                navigator.clipboard?.writeText(device.recoveryKeyEscrowed).catch(() => {});
                toast.success('Copied recovery key to clipboard');
              }}
            >
              <ClipboardCopy size={13} /> Copy
            </button>
          </div>

          <div className="hd-mdm-actions">
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => handleMdm('sync_telemetry')}
            >
              <RefreshCw size={13} /> Sync MDM Telemetry
            </button>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => handleMdm('push_os_patch')}
            >
              <Zap size={13} /> Push OS Security Patch
            </button>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => handleMdm('rotate_filevault_key')}
            >
              <KeyRound size={13} /> Rotate FileVault Key
            </button>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => handleMdm('toggle_repair_status')}
            >
              <Wrench size={13} />
              {device.status === 'in_repair' ? 'Complete Repair' : 'Mark In-Repair'}
            </button>
          </div>
        </section>

        {/* Financial & Warranty Metadata */}
        <section className="hd-inspector__section">
          <div className="hd-inspector__sec-head">
            <h4>
              <HardDrive size={15} /> Lifecycle & Warranty
            </h4>
          </div>
          <div className="hd-telemetry-grid">
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">Purchase Date</span>
              <strong className="hd-telemetry-cell__v">{device.purchaseDate}</strong>
            </div>
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">AppleCare+ / Warranty</span>
              <strong className="hd-telemetry-cell__v">Until {device.warrantyUntil}</strong>
            </div>
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">Acquisition Cost</span>
              <strong className="hd-telemetry-cell__v">{formatUsd(device.costUsd)}</strong>
            </div>
            <div className="hd-telemetry-cell">
              <span className="hd-telemetry-cell__k">Battery Health</span>
              <strong className="hd-telemetry-cell__v">
                {device.specs.batteryHealthPct
                  ? `${device.specs.batteryHealthPct}% (${device.specs.cycleCount ?? 0} cycles)`
                  : 'AC Powered'}
              </strong>
            </div>
          </div>
        </section>

        {/* Linked Helpdesk Tickets */}
        {linkedTickets.length > 0 && (
          <section className="hd-inspector__section">
            <div className="hd-inspector__sec-head">
              <h4>
                <Ticket size={15} /> Linked Helpdesk Tickets ({linkedTickets.length})
              </h4>
            </div>
            <div className="hd-linked-tickets">
              {linkedTickets.map((t) => (
                <div key={t.id} className="hd-linked-ticket">
                  <span className="mono text-xs">{t.number}</span>
                  <span className="grow truncate text-sm">{t.title}</span>
                  <span className={cx('hd-pill', `hd-pill--${TICKET_STATUS_META[t.status].tone}`)}>
                    {TICKET_STATUS_META[t.status].label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Chain-of-Custody Timeline */}
        <section className="hd-inspector__section">
          <div className="hd-inspector__sec-head">
            <h4>
              <RotateCcw size={15} /> Chain-of-Custody & Audit Log ({device.custodyLog.length})
            </h4>
          </div>
          <div className="hd-custody-timeline">
            {device.custodyLog.map((entry) => {
              const actor = users.find((u) => u.id === entry.actorId);
              const target = users.find((u) => u.id === entry.userId);
              return (
                <div key={entry.id} className="hd-custody-entry">
                  <span className={cx('hd-custody-entry__dot', `is-${entry.action}`)} />
                  <div className="hd-custody-entry__body">
                    <div className="hd-custody-entry__top">
                      <strong className="text-xs uppercase">{entry.action.replace(/_/g, ' ')}</strong>
                      {target && <span className="text-xs muted">→ {target.name}</span>}
                      <span className="text-xs muted ml-auto">{formatDateTime(entry.at)}</span>
                    </div>
                    <p className="text-sm">{entry.note}</p>
                    <div className="text-xs muted">Logged by {actor?.name ?? entry.actorId}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

/** Modal to file a new IT Helpdesk Ticket */
export function NewTicketModal({
  open,
  onClose,
  initialDeviceId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialDeviceId?: string;
  onCreated?: (ticketId: string) => void;
}) {
  const me = useSessionUser();
  const devices = useHelpdesk((s) => s.devices);
  const createTicket = useHelpdesk((s) => s.createTicket);

  const myDevices = useMemo(
    () => devices.filter((d) => d.assignedToUserId === (me?.id ?? 'u-mei')),
    [devices, me?.id],
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('hardware');
  const [priority, setPriority] = useState<TicketPriority>('p2');
  const [deviceId, setDeviceId] = useState<string>(initialDeviceId ?? myDevices[0]?.id ?? '');
  const [includeTelemetry, setIncludeTelemetry] = useState(true);

  const effectiveDeviceId = initialDeviceId || deviceId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createTicket({
      requesterId: me?.id ?? 'u-mei',
      title,
      description,
      category,
      priority,
      deviceId: effectiveDeviceId || undefined,
      includeTelemetry,
    });
    if (toast.result(res) && res.ticket) {
      setTitle('');
      setDescription('');
      onClose();
      onCreated?.(res.ticket.id);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="Raise an IT Helpdesk Ticket"
      subtitle={`Auto-routed to IT & Security with live SLA tracking (${SLA_HOURS_BY_PRIORITY[priority]}h target)`}
      icon={
        <span className="hd-modal-icon">
          <LifeBuoy size={18} />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="hd-new-ticket-form" className="btn btn--primary">
            <Ticket size={15} /> Submit Ticket ({SLA_HOURS_BY_PRIORITY[priority]}h SLA)
          </button>
        </>
      }
    >
      <form id="hd-new-ticket-form" className="hd-form" onSubmit={handleSubmit}>
        <div className="hd-form__field">
          <label htmlFor="hd-tkt-title">Issue Summary</label>
          <input
            id="hd-tkt-title"
            className="input"
            placeholder="e.g. WireGuard VPN tunnel drops when roaming or USB-C port not charging"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="hd-form__grid2">
          <div className="hd-form__field">
            <label htmlFor="hd-tkt-cat">Category</label>
            <select
              id="hd-tkt-cat"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
            >
              {(Object.keys(TICKET_CATEGORY_META) as TicketCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {TICKET_CATEGORY_META[cat].label}
                </option>
              ))}
            </select>
          </div>

          <div className="hd-form__field">
            <label htmlFor="hd-tkt-prio">Priority & SLA Target</label>
            <select
              id="hd-tkt-prio"
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {(Object.keys(TICKET_PRIORITY_META) as TicketPriority[]).map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_META[p].label} ({TICKET_PRIORITY_META[p].sla})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="hd-form__field">
          <label htmlFor="hd-tkt-dev">Affected Hardware Device / Asset Tag</label>
          <select
            id="hd-tkt-dev"
            className="input"
            value={effectiveDeviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">No specific hardware asset</option>
            {myDevices.length > 0 && (
              <optgroup label="My Assigned Devices">
                {myDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.assetTag} — {d.name} ({d.model})
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="All Fleet Devices">
              {devices
                .filter((d) => !myDevices.some((m) => m.id === d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.assetTag} — {d.name} ({d.location})
                  </option>
                ))}
            </optgroup>
          </select>
        </div>

        <div className="hd-form__field">
          <label htmlFor="hd-tkt-desc">Steps to Reproduce / Context</label>
          <textarea
            id="hd-tkt-desc"
            className="input"
            rows={4}
            placeholder="Describe what happened, any error codes, and whether you need a hot-swap loaner device…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <label className="hd-telemetry-toggle">
          <input
            type="checkbox"
            checked={includeTelemetry}
            onChange={(e) => setIncludeTelemetry(e.target.checked)}
          />
          <div>
            <strong>Attach live MDM & Zero-Trust endpoint snapshot</strong>
            <span className="text-xs muted block">
              Includes OS build, FileVault status, CrowdStrike sensor heartbeat, and recent network interface logs.
            </span>
          </div>
        </label>
      </form>
    </Modal>
  );
}

/** Modal to run interactive Self-Service Diagnostics */
export function DiagnosticsModal({
  open,
  onClose,
  onEscalateTicket,
}: {
  open: boolean;
  onClose: () => void;
  onEscalateTicket: () => void;
}) {
  const me = useSessionUser();
  const devices = useHelpdesk((s) => s.devices);
  const runs = useHelpdesk((s) => s.selfServiceRuns);
  const runSelfService = useHelpdesk((s) => s.runSelfServiceDiagnostic);

  const myDevices = devices.filter((d) => d.assignedToUserId === (me?.id ?? 'u-mei'));
  const [selectedDeviceId, setSelectedDeviceId] = useState(myDevices[0]?.id ?? '');
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const handleRun = (fixId: SelfServiceFixId) => {
    const res = runSelfService(fixId, selectedDeviceId || myDevices[0]?.id, me?.id);
    if (toast.result(res) && res.run) {
      setLastRunId(res.run.id);
    }
  };

  const latestRun = runs.find((r) => r.id === lastRunId) ?? runs[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={660}
      title="Self-Service Zero-Trust Diagnostics & Instant Fixes"
      subtitle="Run automated 1-click remediations on your endpoint before waiting on a ticket"
      icon={
        <span className="hd-modal-icon">
          <Terminal size={18} />
        </span>
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              onClose();
              onEscalateTicket();
            }}
          >
            Still broken? Raise a Ticket
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="hd-diag-modal">
        {myDevices.length > 0 && (
          <div className="hd-diag-target">
            <span className="text-xs muted">Target Endpoint:</span>
            <select
              className="input input--sm"
              value={selectedDeviceId || myDevices[0]?.id}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {myDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.assetTag} · {d.name} ({d.specs.osVersion ?? d.model})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="hd-playbook-grid">
          {SELF_SERVICE_PLAYBOOKS.map((pb) => (
            <div key={pb.id} className="hd-playbook-card">
              <div className="hd-playbook-card__top">
                <span className="hd-pill hd-pill--info">{pb.category}</span>
                <span className="text-xs muted">~{pb.estSeconds}s</span>
              </div>
              <h4 className="hd-playbook-card__title">{pb.title}</h4>
              <p className="text-xs muted">{pb.subtitle}</p>
              <button
                type="button"
                className="btn btn--xs btn--primary mt-auto"
                onClick={() => handleRun(pb.id)}
              >
                <Sparkles size={13} /> Run Instant Fix
              </button>
            </div>
          ))}
        </div>

        {latestRun && (
          <div className="hd-diag-output">
            <div className="hd-diag-output__head">
              <CheckCircle2 size={15} className="text-success" />
              <strong>Last Diagnostic Output ({relativeTime(latestRun.ranAt)})</strong>
            </div>
            <div className="hd-diag-output__steps">
              {latestRun.stepsCompleted.map((step, i) => (
                <div key={i} className="hd-diag-output__step">
                  <span className="mono text-xs text-success">[OK]</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <div className="hd-diag-output__summary">{latestRun.summary}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Admin Modal to Register a New Hardware Asset in Fleet Inventory */
export function RegisterDeviceModal({
  open,
  onClose,
  onRegistered,
}: {
  open: boolean;
  onClose: () => void;
  onRegistered?: (deviceId: string) => void;
}) {
  const devices = useHelpdesk((s) => s.devices);
  const registerDevice = useHelpdesk((s) => s.registerDevice);
  const users = useHub((s) => s.users);

  const [category, setCategory] = useState<DeviceCategory>('laptop');
  const [customAssetTag, setCustomAssetTag] = useState('');
  const [serialNumber, setSerialNumber] = useState('C02X88NEW99M');
  const [name, setName] = useState('Engineering MacBook Pro 16"');
  const [model, setModel] = useState('MacBook Pro 16" (M3 Max)');
  const [cpu, setCpu] = useState('Apple M3 Max (16-core)');
  const [ram, setRam] = useState('64 GB Unified');
  const [storage, setStorage] = useState('2 TB NVMe');
  const [location, setLocation] = useState<DeviceLocation>('Dubai HQ');
  const [costUsd, setCostUsd] = useState(3899);
  const [assignedToUserId, setAssignedToUserId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['eng-heavy', 'applecare-plus']);

  const suggestedTag = useMemo(
    () => generateNextAssetTag(category, devices),
    [category, devices],
  );

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = registerDevice({
      assetTag: customAssetTag.trim() || suggestedTag,
      serialNumber,
      name,
      model,
      category,
      specs: { cpu, ram, storage },
      location,
      costUsd,
      assignedToUserId: assignedToUserId || undefined,
      tags: selectedTags,
    });
    if (toast.result(res) && res.device) {
      onClose();
      onRegistered?.(res.device.id);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title="Register New Hardware Asset in Fleet Inventory"
      subtitle="Enrolls device into Zero-Trust MDM, generates an HX asset tag, and logs custody"
      icon={
        <span className="hd-modal-icon">
          <QrCode size={18} />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="hd-register-device-form" className="btn btn--primary">
            <Plus size={15} /> Register Asset ({customAssetTag.trim() || suggestedTag})
          </button>
        </>
      }
    >
      <form id="hd-register-device-form" className="hd-form" onSubmit={handleSubmit}>
        <div className="hd-form__grid3">
          <div className="hd-form__field">
            <label htmlFor="hd-reg-cat">Category</label>
            <select
              id="hd-reg-cat"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as DeviceCategory)}
            >
              {(Object.keys(DEVICE_CATEGORY_META) as DeviceCategory[]).map((c) => (
                <option key={c} value={c}>
                  {DEVICE_CATEGORY_META[c].label}
                </option>
              ))}
            </select>
          </div>

          <div className="hd-form__field">
            <label htmlFor="hd-reg-tag">Asset Tag (Auto HX-…)</label>
            <input
              id="hd-reg-tag"
              className="input mono"
              placeholder={suggestedTag}
              value={customAssetTag}
              onChange={(e) => setCustomAssetTag(e.target.value)}
            />
          </div>

          <div className="hd-form__field">
            <label htmlFor="hd-reg-sn">Serial Number</label>
            <input
              id="hd-reg-sn"
              className="input mono"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="hd-form__grid2">
          <div className="hd-form__field">
            <label htmlFor="hd-reg-name">Asset Label / Friendly Name</label>
            <input
              id="hd-reg-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="hd-form__field">
            <label htmlFor="hd-reg-model">Hardware Model</label>
            <input
              id="hd-reg-model"
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="hd-form__grid3">
          <div className="hd-form__field">
            <label htmlFor="hd-reg-cpu">Processor / Chip</label>
            <input
              id="hd-reg-cpu"
              className="input"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
            />
          </div>
          <div className="hd-form__field">
            <label htmlFor="hd-reg-ram">Memory (RAM)</label>
            <input
              id="hd-reg-ram"
              className="input"
              value={ram}
              onChange={(e) => setRam(e.target.value)}
            />
          </div>
          <div className="hd-form__field">
            <label htmlFor="hd-reg-storage">Storage</label>
            <input
              id="hd-reg-storage"
              className="input"
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
            />
          </div>
        </div>

        <div className="hd-form__grid3">
          <div className="hd-form__field">
            <label htmlFor="hd-reg-loc">Hub / Depot Location</label>
            <select
              id="hd-reg-loc"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value as DeviceLocation)}
            >
              {DEVICE_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="hd-form__field">
            <label htmlFor="hd-reg-cost">Cost (USD)</label>
            <input
              id="hd-reg-cost"
              type="number"
              className="input"
              value={costUsd}
              onChange={(e) => setCostUsd(Number(e.target.value))}
            />
          </div>

          <div className="hd-form__field">
            <label htmlFor="hd-reg-user">Initial User Custody</label>
            <select
              id="hd-reg-user"
              className="input"
              value={assignedToUserId}
              onChange={(e) => setAssignedToUserId(e.target.value)}
            >
              <option value="">In Stock Depot (Unassigned)</option>
              {users
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.department})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="hd-form__field">
          <label>Attach Fleet Asset Tags</label>
          <div className="hd-preset-tags__wrap">
            {PRESET_DEVICE_TAGS.map((p) => {
              const active = selectedTags.includes(p.tag);
              return (
                <button
                  key={p.tag}
                  type="button"
                  className={cx('hd-preset-pill', active && 'is-selected')}
                  onClick={() => toggleTag(p.tag)}
                >
                  {active ? '✓ ' : '+ '}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
