import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ClipboardCopy,
  Eye,
  EyeOff,
  Laptop,
  Package,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Zap,
} from 'lucide-react';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useHelpdesk } from '@/helpdesk/store';
import {
  AssetTagBadge,
  COMPLIANCE_META,
  DEVICE_CATEGORY_META,
  DEVICE_STATUS_META,
  DeviceTagChip,
  PhysicalAssetSticker,
  formatUsd,
} from './shared';

export function MyDevicesView({
  onInspectDevice,
  onRaiseTicket,
}: {
  onInspectDevice: (deviceId: string) => void;
  onRaiseTicket: (deviceId?: string) => void;
}) {
  const me = useSessionUser();
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const devices = useHelpdesk((s) => s.devices);
  const runMdmCommand = useHelpdesk((s) => s.runMdmCommand);

  const [viewingUserId, setViewingUserId] = useState<string>(me?.id ?? 'u-mei');
  const [revealedKeyIds, setRevealedKeyIds] = useState<Record<string, boolean>>({});
  const [stickerOpenIds, setStickerOpenIds] = useState<Record<string, boolean>>({});

  const activeUserId = viewingUserId || me?.id || 'u-mei';
  const targetUser = users.find((u) => u.id === activeUserId) ?? me;
  const userDevices = devices.filter((d) => d.assignedToUserId === activeUserId);

  const toggleRevealKey = (id: string) => {
    setRevealedKeyIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSticker = (id: string) => {
    setStickerOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="hd-my-devices-view">
      {/* Header bar with employee custody selector */}
      <div className="hd-my-devices-bar">
        <div className="hd-my-devices-bar__left">
          {targetUser && <Avatar user={targetUser} size={42} presence />}
          <div>
            <div className="hd-panel__eyebrow">ASSIGNED HARDWARE & ENDPOINT POSTURE</div>
            <h3 className="hd-my-devices-bar__title">
              {targetUser?.id === me?.id
                ? `My Assigned Hardware (${userDevices.length})`
                : `${targetUser?.name}’s Assigned Hardware (${userDevices.length})`}
            </h3>
            <p className="text-xs muted">
              {targetUser?.title} · {targetUser?.department} · Employee ID {targetUser?.employeeId}
            </p>
          </div>
        </div>

        <div className="hd-my-devices-bar__right">
          <label className="text-xs muted" htmlFor="hd-custody-user-picker">
            Inspect user custody:
          </label>
          <select
            id="hd-custody-user-picker"
            className="input input--sm"
            value={activeUserId}
            onChange={(e) => setViewingUserId(e.target.value)}
          >
            {users.map((u) => {
              const cnt = devices.filter((d) => d.assignedToUserId === u.id).length;
              return (
                <option key={u.id} value={u.id}>
                  {u.id === me?.id ? `★ ${u.name} (Me)` : u.name} — {cnt} device
                  {cnt === 1 ? '' : 's'}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => navigate('/helpdesk/catalog')}
          >
            <Package size={14} /> Request Gear
          </button>
        </div>
      </div>

      {/* Cards grid for assigned devices */}
      <div className="hd-my-devices-grid">
        {userDevices.map((dev) => {
          const catMeta = DEVICE_CATEGORY_META[dev.category];
          const CatIcon = catMeta.icon;
          const compMeta = COMPLIANCE_META[dev.compliance];
          const CompIcon = compMeta.icon;
          const statusMeta = DEVICE_STATUS_META[dev.status];
          const isKeyRevealed = Boolean(revealedKeyIds[dev.id]);
          const isStickerOpen = Boolean(stickerOpenIds[dev.id]);

          return (
            <article key={dev.id} className="hd-device-card">
              <div className="hd-device-card__head">
                <span
                  className="hd-device-card__cat-icon"
                  style={{ '--cat-c': catMeta.color } as React.CSSProperties}
                >
                  <CatIcon size={20} />
                </span>
                <div className="grow min-w-0">
                  <div className="hd-device-card__badges">
                    <AssetTagBadge
                      assetTag={dev.assetTag}
                      category={dev.category}
                      onClick={() => onInspectDevice(dev.id)}
                    />
                    <span className={cx('hd-pill', `hd-pill--${statusMeta.tone}`)}>
                      {statusMeta.label}
                    </span>
                    <span className={cx('hd-pill', `hd-pill--${compMeta.tone}`)}>
                      <CompIcon size={12} /> {compMeta.label}
                    </span>
                  </div>
                  <h4 className="hd-device-card__name">{dev.name}</h4>
                  <div className="text-xs muted">
                    {dev.model} · S/N <span className="mono">{dev.serialNumber}</span>
                  </div>
                </div>
              </div>

              {/* Specs & Telemetry Grid */}
              <div className="hd-device-card__specs">
                <div className="hd-spec-box">
                  <span className="hd-spec-box__k">OS / Firmware</span>
                  <strong className="hd-spec-box__v">{dev.specs.osVersion ?? 'Managed'}</strong>
                </div>
                <div className="hd-spec-box">
                  <span className="hd-spec-box__k">Compute / Memory</span>
                  <strong className="hd-spec-box__v">
                    {[dev.specs.cpu, dev.specs.ram].filter(Boolean).join(' · ') || catMeta.label}
                  </strong>
                </div>
                <div className="hd-spec-box">
                  <span className="hd-spec-box__k">Storage & Battery</span>
                  <strong className="hd-spec-box__v">
                    {dev.specs.storage ?? 'Hardware Token'}
                    {dev.specs.batteryHealthPct ? ` · ${dev.specs.batteryHealthPct}% Health` : ''}
                  </strong>
                </div>
                <div className="hd-spec-box">
                  <span className="hd-spec-box__k">MDM Check-in & Value</span>
                  <strong className="hd-spec-box__v">
                    {relativeTime(dev.lastCheckInAt)} · {formatUsd(dev.costUsd)}
                  </strong>
                </div>
              </div>

              {/* Zero-Trust Signals */}
              <div className="hd-posture-strip">
                <span className={cx('hd-posture-chip', dev.encrypted && 'is-ok')}>
                  <ShieldCheck size={12} /> FileVault / Disk Encrypted
                </span>
                <span className={cx('hd-posture-chip', dev.edrActive && 'is-ok')}>
                  <ShieldCheck size={12} /> CrowdStrike EDR Active
                </span>
                <span className={cx('hd-posture-chip', dev.mdmEnrolled && 'is-ok')}>
                  <ShieldCheck size={12} /> MDM Enrolled ({dev.location})
                </span>
              </div>

              {/* Custom Fleet Tags */}
              <div className="hd-tag-list">
                {dev.tags.map((tag) => (
                  <DeviceTagChip
                    key={tag}
                    tag={tag}
                    onClick={() => navigate(`/helpdesk/inventory?tag=${tag}`)}
                  />
                ))}
              </div>

              {/* Escrowed Recovery Key Bar */}
              <div className="hd-recovery-box">
                <div className="grow min-w-0">
                  <span className="text-xs muted block">Escrowed Recovery Key</span>
                  <span className="mono text-xs">
                    {isKeyRevealed ? dev.recoveryKeyEscrowed : '••••-••••-••••-ESCROWED'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--xs btn--ghost"
                  onClick={() => toggleRevealKey(dev.id)}
                >
                  {isKeyRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                  {isKeyRevealed ? 'Hide' : 'Reveal Key'}
                </button>
                <button
                  type="button"
                  className="btn btn--xs btn--ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(dev.recoveryKeyEscrowed).catch(() => {});
                    toast.success(`Copied recovery key for ${dev.assetTag}`);
                  }}
                >
                  <ClipboardCopy size={13} />
                </button>
              </div>

              {/* Toggleable Physical Asset Tag Sticker Preview */}
              {isStickerOpen && (
                <PhysicalAssetSticker device={dev} assignedUser={targetUser} />
              )}

              {/* Footer Actions */}
              <div className="hd-device-card__foot">
                <button
                  type="button"
                  className="btn btn--xs btn--ghost"
                  onClick={() => toggleSticker(dev.id)}
                >
                  <QrCode size={13} />
                  {isStickerOpen ? 'Hide QR Sticker' : 'QR Asset Sticker'}
                </button>
                <button
                  type="button"
                  className="btn btn--xs btn--ghost"
                  onClick={() => {
                    const res = runMdmCommand(dev.id, 'sync_telemetry');
                    toast.result(res);
                  }}
                >
                  <RefreshCw size={13} /> Sync MDM
                </button>
                {dev.compliance === 'patch_required' && (
                  <button
                    type="button"
                    className="btn btn--xs btn--primary"
                    onClick={() => {
                      const res = runMdmCommand(dev.id, 'push_os_patch');
                      toast.result(res);
                    }}
                  >
                    <Zap size={13} /> Install Security Patch
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--xs btn--ghost"
                  onClick={() => onInspectDevice(dev.id)}
                >
                  Custody & Details
                </button>
                <button
                  type="button"
                  className="btn btn--xs btn--ghost ml-auto"
                  onClick={() => onRaiseTicket(dev.id)}
                >
                  <Ticket size={13} /> Report Issue
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {userDevices.length === 0 && (
        <EmptyState
          icon={<Laptop size={26} />}
          title="No hardware devices assigned to this user"
          action={
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => navigate('/helpdesk/inventory')}
            >
              Assign from Fleet Inventory
            </button>
          }
        >
          Open the Fleet & Tag Inventory to assign an in-stock laptop, display, or YubiKey to{' '}
          {targetUser?.name}.
        </EmptyState>
      )}
    </div>
  );
}
