import { useNavigate } from 'react-router';
import {
  ArrowRight,
  CheckCircle2,
  Laptop,
  LifeBuoy,
  Package,
  QrCode,
  RefreshCw,
  Sparkles,
  Tag,
  Terminal,
  Ticket,
} from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import {
  PRESET_DEVICE_TAGS,
  SELF_SERVICE_PLAYBOOKS,
} from '@/helpdesk/seed';
import { useHelpdesk } from '@/helpdesk/store';
import type { SelfServiceFixId } from '@/helpdesk/types';
import {
  AssetTagBadge,
  COMPLIANCE_META,
  DeviceTagChip,
  SLA_STATUS_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
  formatUsd,
} from './shared';

export function OverviewView({
  onInspectDevice,
  onRaiseTicket,
}: {
  onInspectDevice: (deviceId: string) => void;
  onRaiseTicket: (deviceId?: string) => void;
}) {
  const me = useSessionUser();
  const navigate = useNavigate();
  const devices = useHelpdesk((s) => s.devices);
  const tickets = useHelpdesk((s) => s.tickets);
  const runs = useHelpdesk((s) => s.selfServiceRuns);
  const runSelfService = useHelpdesk((s) => s.runSelfServiceDiagnostic);
  const runMdmCommand = useHelpdesk((s) => s.runMdmCommand);

  const myUserId = me?.id ?? 'u-mei';
  const myDevices = devices.filter((d) => d.assignedToUserId === myUserId);
  const myTickets = tickets.filter((t) => t.requesterId === myUserId);

  const fleetValue = devices.reduce((sum, d) => sum + d.costUsd, 0);
  const compliantCount = devices.filter((d) => d.compliance === 'compliant').length;
  const compliancePct = devices.length
    ? Math.round((compliantCount / devices.length) * 100)
    : 100;

  const handleRunPlaybook = (fixId: SelfServiceFixId) => {
    const res = runSelfService(fixId, myDevices[0]?.id, myUserId);
    toast.result(res);
  };

  return (
    <div className="hd-overview">
      {/* Row 1: My Assigned Hardware & Instant Self-Service Fixes */}
      <div className="hd-overview__grid">
        {/* Left: My Assigned Devices & MDM Posture */}
        <section className="hd-panel">
          <div className="hd-panel__head">
            <div>
              <div className="hd-panel__eyebrow">ENDPOINT CUSTODY & TELEMETRY</div>
              <h3 className="hd-panel__title">
                <Laptop size={17} /> My Assigned Devices ({myDevices.length})
              </h3>
            </div>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => navigate('/helpdesk/my-devices')}
            >
              Manage My Devices <ArrowRight size={13} />
            </button>
          </div>

          <div className="hd-device-stack">
            {myDevices.map((dev) => {
              const comp = COMPLIANCE_META[dev.compliance];
              const CompIcon = comp.icon;
              return (
                <div key={dev.id} className="hd-my-device-row">
                  <div className="hd-my-device-row__main">
                    <div className="hd-my-device-row__top">
                      <AssetTagBadge
                        assetTag={dev.assetTag}
                        category={dev.category}
                        onClick={() => onInspectDevice(dev.id)}
                      />
                      <strong className="hd-my-device-row__name">{dev.name}</strong>
                      <span className={cx('hd-pill', `hd-pill--${comp.tone}`)}>
                        <CompIcon size={12} /> {comp.label}
                      </span>
                    </div>

                    <div className="hd-my-device-row__specs text-xs muted">
                      <span>{dev.model}</span>
                      {dev.specs.cpu && <span>· {dev.specs.cpu}</span>}
                      {dev.specs.ram && <span>· {dev.specs.ram}</span>}
                      <span>· S/N {dev.serialNumber}</span>
                    </div>

                    <div className="hd-tag-list">
                      {dev.tags.map((tag) => (
                        <DeviceTagChip
                          key={tag}
                          tag={tag}
                          onClick={() => navigate(`/helpdesk/inventory?tag=${tag}`)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="hd-my-device-row__actions">
                    <button
                      type="button"
                      className="btn btn--xs btn--ghost"
                      onClick={() => onInspectDevice(dev.id)}
                      title="Inspect QR Sticker & Recovery Key"
                    >
                      <QrCode size={13} /> Asset Tag
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
                    <button
                      type="button"
                      className="btn btn--xs btn--ghost"
                      onClick={() => onRaiseTicket(dev.id)}
                    >
                      <Ticket size={13} /> Report Issue
                    </button>
                  </div>
                </div>
              );
            })}

            {myDevices.length === 0 && (
              <div className="hd-empty-inline">
                <p className="text-sm muted">No hardware currently assigned to your user profile.</p>
                <button
                  type="button"
                  className="btn btn--xs btn--primary"
                  onClick={() => navigate('/helpdesk/catalog')}
                >
                  Request Hardware from IT Catalog
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right: 1-Click Self-Service Instant Fixes */}
        <section className="hd-panel">
          <div className="hd-panel__head">
            <div>
              <div className="hd-panel__eyebrow">AUTOMATED REMEDIATION PLAYBOOKS</div>
              <h3 className="hd-panel__title">
                <Terminal size={17} /> 1-Click Self-Service IT Fixes
              </h3>
            </div>
            <span className="hd-pill hd-pill--info">Zero-Wait Resolution</span>
          </div>

          <div className="hd-quickfix-grid">
            {SELF_SERVICE_PLAYBOOKS.map((pb) => (
              <div key={pb.id} className="hd-quickfix-card">
                <div className="hd-quickfix-card__top">
                  <span className="text-xs muted">{pb.category}</span>
                  <span className="mono text-xs muted">{pb.estSeconds}s</span>
                </div>
                <strong className="hd-quickfix-card__title">{pb.title}</strong>
                <p className="text-xs muted">{pb.subtitle}</p>
                <button
                  type="button"
                  className="btn btn--xs btn--ghost hd-quickfix-card__btn"
                  onClick={() => handleRunPlaybook(pb.id)}
                >
                  <Sparkles size={13} /> Run Fix Now
                </button>
              </div>
            ))}
          </div>

          {runs[0] && (
            <div className="hd-last-run-strip">
              <CheckCircle2 size={14} className="text-success" />
              <span className="text-xs grow truncate">
                <strong>Latest automated fix:</strong> {runs[0].summary}
              </span>
              <span className="text-xs muted">{relativeTime(runs[0].ranAt)}</span>
            </div>
          )}
        </section>
      </div>

      {/* Row 2: My Recent Tickets & Fleet Tag Cloud Preview */}
      <div className="hd-overview__grid">
        {/* My Active & Recent Tickets */}
        <section className="hd-panel">
          <div className="hd-panel__head">
            <div>
              <div className="hd-panel__eyebrow">SLA SUPPORT TRACKER</div>
              <h3 className="hd-panel__title">
                <LifeBuoy size={17} /> My Helpdesk Tickets ({myTickets.length})
              </h3>
            </div>
            <div className="hd-panel__actions">
              <button
                type="button"
                className="btn btn--xs btn--ghost"
                onClick={() => navigate('/helpdesk/tickets')}
              >
                All Tickets <ArrowRight size={13} />
              </button>
              <button
                type="button"
                className="btn btn--xs btn--primary"
                onClick={() => onRaiseTicket()}
              >
                + Raise Ticket
              </button>
            </div>
          </div>

          <div className="hd-ticket-mini-list">
            {myTickets.slice(0, 4).map((t) => {
              const prio = TICKET_PRIORITY_META[t.priority];
              const stat = TICKET_STATUS_META[t.status];
              const sla = SLA_STATUS_META[t.slaStatus];
              const dev = devices.find((d) => d.id === t.deviceId);
              return (
                <div
                  key={t.id}
                  className="hd-ticket-mini-row"
                  onClick={() => navigate(`/helpdesk/tickets?ticket=${t.id}`)}
                >
                  <div className="hd-ticket-mini-row__left">
                    <div className="hd-ticket-mini-row__badges">
                      <span className="mono text-xs">{t.number}</span>
                      <span className={cx('hd-pill', `hd-pill--${prio.tone}`)}>{prio.short}</span>
                      <span className={cx('hd-pill', `hd-pill--${stat.tone}`)}>{stat.label}</span>
                      <span className={cx('hd-pill', `hd-pill--${sla.tone}`)}>{sla.label}</span>
                      {dev && <AssetTagBadge assetTag={dev.assetTag} category={dev.category} size="sm" />}
                    </div>
                    <strong className="hd-ticket-mini-row__title">{t.title}</strong>
                  </div>
                  <div className="text-xs muted">{relativeTime(t.updatedAt)}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Fleet & Asset Tag Command Snapshot */}
        <section className="hd-panel">
          <div className="hd-panel__head">
            <div>
              <div className="hd-panel__eyebrow">IT FLEET & ASSET TAG EXPLORER</div>
              <h3 className="hd-panel__title">
                <Tag size={17} /> Hardware Fleet & Custom Tags ({devices.length} assets)
              </h3>
            </div>
            <button
              type="button"
              className="btn btn--xs btn--primary"
              onClick={() => navigate('/helpdesk/inventory')}
            >
              Open Device & Tag Inventory <ArrowRight size={13} />
            </button>
          </div>

          <div className="hd-mini-kpis">
            <div className="hd-mini-kpi">
              <span className="hd-mini-kpi__k">Total Fleet Value</span>
              <strong className="hd-mini-kpi__v">{formatUsd(fleetValue)}</strong>
            </div>
            <div className="hd-mini-kpi">
              <span className="hd-mini-kpi__k">In-Stock Depot</span>
              <strong className="hd-mini-kpi__v">
                {devices.filter((d) => d.status === 'in_stock').length} ready
              </strong>
            </div>
            <div className="hd-mini-kpi">
              <span className="hd-mini-kpi__k">MDM Compliance</span>
              <strong className="hd-mini-kpi__v text-success">{compliancePct}%</strong>
            </div>
          </div>

          <div className="hd-overview-tags">
            <div className="text-xs muted mb-2">
              Click any asset tag to filter devices & view assigned users in Fleet Inventory:
            </div>
            <div className="hd-tag-list">
              {PRESET_DEVICE_TAGS.map((pt) => {
                const count = devices.filter((d) => d.tags.includes(pt.tag)).length;
                return (
                  <DeviceTagChip
                    key={pt.tag}
                    tag={pt.tag}
                    count={count}
                    onClick={() => navigate(`/helpdesk/inventory?tag=${pt.tag}`)}
                  />
                );
              })}
            </div>
          </div>

          <div className="hd-overview-catalog-cta">
            <Package size={16} />
            <span className="text-xs grow">
              Need a 5K Studio Display, mechanical keyboard, YubiKey 5C, or Claude Code seat?
            </span>
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => navigate('/helpdesk/catalog')}
            >
              Browse IT Catalog <ArrowRight size={12} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
