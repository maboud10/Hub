/**
 * Device detail — hologram stage + spec sheet, security posture with fixes,
 * telemetry, recovery key, related tickets and custody. On the Fleet route
 * (`admin`) IT also gets lifecycle, MDM (live log), tags and the sticker.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Copy, Laptop, Loader2, Lock, MoreHorizontal, PackagePlus, QrCode, RefreshCw, ShieldAlert, Stethoscope, Truck, Wrench } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoMenu, NeoStage, type MenuEntry } from '@/components/neo';
import { formatDate, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device } from '@/helpdesk/types';
import { canViewDevice, canViewTicket } from '@/helpdesk/access';
import { complianceIssues, deviceHealth, encryptionName, healthBand, HEALTH_BAND_LABEL } from '@/helpdesk/fleet';
import { DEVICE_STATUS_LABEL, formatMoney, isManagedKind, KIND_LABEL } from '@/helpdesk/meta';
import { DeviceGlyph } from './glyphs';
import { CompliancePills, CustodyTimeline, holoColor, PostureList, TelemetryTiles, useTilt, WarrantyBar } from './DeviceParts';
import { RecoveryKeyCard, ReportLostModal, ScheduleReturnModal } from './DeviceDialogs';
import { LifecyclePanel, MdmPanel, TagEditor } from './DeviceAdmin';
import { StickerModal } from './Sticker';
import { HealthRing, Panel, Person, StatusPill, useOpenTicket, useSetParam, useViewer } from './ui';

export function DeviceDetailView({ admin }: { admin: boolean }) {
  const { assetTag = '' } = useParams();
  const viewer = useViewer();
  const d = useHelpdesk((s) => s.devices.find((x) => x.assetTag === assetTag.toUpperCase()));
  const [sp] = useSearchParams();
  const setParam = useSetParam();
  const back = admin ? '/helpdesk/fleet' : '/helpdesk/devices';

  if (!viewer) return null;
  if (!d)
    return (
      <Blocked icon={<Laptop />} title={`No device tagged ${assetTag}`} back={back}>
        Check the sticker on the device — tags look like HX-MBP-0142.
      </Blocked>
    );
  if (!admin && !canViewDevice(viewer, d))
    return (
      <Blocked icon={<Lock />} title="This device isn’t assigned to you" back={back} extra={viewer.it ? <Link to={`/helpdesk/fleet/${d.assetTag}`} className="neo-btn neo-btn--plasma">Open in Fleet</Link> : undefined}>
        Devices are visible to the person they’re assigned to and to IT.
      </Blocked>
    );

  return (
    <>
      <DeviceBody d={d} admin={admin} back={back} />
      <ReportLostModal d={d} open={sp.get('lost') === '1'} onClose={() => setParam('lost', null, { replace: true })} />
      <ScheduleReturnModal d={d} open={sp.get('return') === '1'} onClose={() => setParam('return', null, { replace: true })} />
      <StickerModal d={d} open={sp.get('sticker') === '1'} onClose={() => setParam('sticker', null, { replace: true })} />
    </>
  );
}

function Blocked({ icon, title, back, children, extra }: { icon: ReactNode; title: string; back: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <NeoStage>
      <NeoHead icon={icon} eyebrow="Devices" title={title} />
      <div className="neo-body">
        <NeoEmpty
          icon={icon}
          title={title}
          action={
            <div className="row">
              <Link to={back} className="neo-btn neo-btn--soft">
                Back
              </Link>
              {extra}
            </div>
          }
        >
          {children}
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}

function DeviceBody({ d, admin, back }: { d: Device; admin: boolean; back: string }) {
  const viewer = useViewer()!;
  const now = useNow(30_000);
  const users = useHub((s) => s.users);
  const tickets = useHelpdesk((s) => s.tickets);
  const setParam = useSetParam();
  const openTicket = useOpenTicket();
  const navigate = useNavigate();
  const owner = users.find((u) => u.id === d.assigneeId);
  const mine = d.assigneeId === viewer.user.id;
  const managed = isManagedKind(d.kind);
  const active = d.status === 'in_use' || d.status === 'loaner';
  const related = useMemo(() => tickets.filter((t) => t.deviceTag === d.assetTag && canViewTicket(viewer, t)).sort((a, b) => b.updatedAt - a.updatedAt), [tickets, d.assetTag, viewer]);
  const syncing = d.mdm.some((c) => c.action === 'sync' && c.state !== 'completed' && c.state !== 'failed');
  const ticketPath = (id: string) => `/helpdesk/tickets/${id}`;

  const report = () => openTicket({ category: 'hardware', device: d.assetTag, subject: `Problem with my ${d.model}` });
  const menu: MenuEntry[] = [];
  if (mine && managed && active) menu.push({ label: 'Run health check', icon: <Stethoscope />, onSelect: () => setParam('diag', '1') });
  if ((mine || admin) && active) menu.push({ label: 'Report lost or stolen', icon: <ShieldAlert />, danger: true, onSelect: () => setParam('lost', '1') });
  if (mine && active) menu.push({ label: 'Schedule a return', icon: <Truck />, onSelect: () => setParam('return', '1') });
  if (mine) menu.push({ label: 'Request replacement or upgrade', icon: <PackagePlus />, onSelect: () => navigate('/helpdesk/catalog?kind=hardware') });
  if (admin) menu.push({ label: 'Raise ticket for this device', icon: <Wrench />, onSelect: () => openTicket({ category: 'hardware', device: d.assetTag }) });
  if (menu.length) menu.push({ kind: 'sep' });
  menu.push({
    label: 'Copy asset tag',
    icon: <Copy />,
    onSelect: () => {
      void navigator.clipboard?.writeText(d.assetTag).catch(() => undefined);
      toast.success('Asset tag copied', d.assetTag);
    },
  });

  const sync = () => {
    const r = useHelpdesk.getState().mdmAction(d.assetTag, 'sync');
    if (r.ok) toast.info('Sync sent', d.assetTag);
    else toast.error(r.error);
  };

  return (
    <NeoStage label={`Device ${d.assetTag}`}>
      <NeoHead
        className="hd-thead"
        icon={
          <Link to={back} className="hd-back" aria-label="Back" data-tip="Back">
            <ArrowLeft />
          </Link>
        }
        eyebrow={
          <>
            <span className="neo-mono">{d.assetTag}</span> · {KIND_LABEL[d.kind]}
            {admin && <span className="hd-devstate hd-devstate--inline" data-status={d.status}>{DEVICE_STATUS_LABEL[d.status]}</span>}
          </>
        }
        title={d.model}
        sub={owner ? `${mine ? 'Assigned to you' : `${d.status === 'loaner' ? 'On loan to' : 'Assigned to'} ${owner.name}`} · ${d.office}${d.lastCheckIn ? ` · checked in ${relativeTime(d.lastCheckIn, now)}` : ''}` : `${DEVICE_STATUS_LABEL[d.status]} · ${d.office}`}
        actions={
          <>
            {admin && (
              <button type="button" className="neo-btn neo-btn--soft" onClick={() => setParam('sticker', '1')} data-qa="dev-sticker">
                <QrCode /> <span className="neo-btn__label">Sticker</span>
              </button>
            )}
            {admin && managed && d.status !== 'retired' ? (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={sync} disabled={syncing} data-qa="dev-sync">
                {syncing ? <Loader2 className="hd-spin" /> : <RefreshCw />} <span className="neo-btn__label">{syncing ? 'Syncing…' : 'Sync now'}</span>
              </button>
            ) : (
              !admin &&
              d.status !== 'retired' && (
                <button type="button" className="neo-btn neo-btn--plasma" onClick={report} data-qa="dev-report">
                  <Wrench /> <span className="neo-btn__label">Report issue</span>
                </button>
              )
            )}
            <NeoMenu
              items={menu}
              label="Device actions"
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions" data-qa="dev-more">
                  <MoreHorizontal />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-body neo-pad">
        {d.status === 'lost' && (
          <div className="hd-alertline" data-tone="bad">
            <ShieldAlert /> Reported lost — remote lock {d.locked ? 'is active' : 'pending'}. {admin ? 'Mark it found once it’s back with IT.' : 'Security is handling this.'}
          </div>
        )}
        <div className="hd-dd">
          <div className="hd-dd__main">
            <section className="hd-dd__hero">
              <HoloStage d={d} now={now} />
              <SpecSheet d={d} now={now} admin={admin} />
            </section>
            {d.status !== 'retired' && (
              <Panel hud="Security posture" title={managed ? 'Health checks' : 'Peripheral health'} actions={complianceIssues(d, now).length ? <span className="hd-issuecount">{complianceIssues(d, now).length} compliance issue{complianceIssues(d, now).length === 1 ? '' : 's'}</span> : undefined}>
                <PostureList d={d} now={now} canFix={mine || admin} onTicket={(c) => openTicket({ category: 'hardware', device: d.assetTag, subject: `${c.label}: ${c.detail}` })} />
              </Panel>
            )}
            {managed && d.telemetry && (
              <Panel hud="Telemetry" title="Battery, storage & thermals">
                <TelemetryTiles d={d} />
              </Panel>
            )}
            {admin && managed && (
              <Panel hud="Remote management" title="MDM actions">
                <MdmPanel d={d} />
              </Panel>
            )}
          </div>
          <aside className="hd-dd__side" aria-label="Device details">
            {admin && (
              <Panel hud="Lifecycle" title="Status & custody">
                <LifecyclePanel d={d} />
              </Panel>
            )}
            {admin && (
              <Panel hud="Fleet tags" title="Tags">
                <TagEditor d={d} />
              </Panel>
            )}
            {managed && (mine || admin) && d.status !== 'retired' && (
              <Panel hud="Encryption" title={encryptionName(d)}>
                <RecoveryKeyCard d={d} />
              </Panel>
            )}
            <Panel hud="Support" title="Related tickets" actions={mine ? <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={report}>New</button> : undefined}>
              {related.length === 0 ? (
                <p className="hd-muted-note">No tickets about this device.</p>
              ) : (
                <div className="hd-reltix">
                  {related.slice(0, 5).map((t) => (
                    <Link key={t.id} to={ticketPath(t.id)} className="hd-reltix__row">
                      <span className="hd-reltix__text">
                        <b>{t.subject}</b>
                        <span>
                          <span className="neo-mono">{t.id}</span> · {relativeTime(t.updatedAt, now)}
                          {!mine && t.requesterId !== d.assigneeId ? ` · ${users.find((u) => u.id === t.requesterId)?.name ?? ''}` : ''}
                        </span>
                      </span>
                      <StatusPill status={t.status} size="sm" agent={admin} />
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
            <Panel hud="Chain of custody" title="History">
              <CustodyTimeline d={d} />
            </Panel>
          </aside>
        </div>
      </div>
    </NeoStage>
  );
}

function HoloStage({ d, now }: { d: Device; now: number }) {
  const tilt = useTilt(12);
  const health = deviceHealth(d, now);
  const color = holoColor(d);
  return (
    <div
      className="hd-stage3d"
      ref={(el) => {
        tilt.ref.current = el;
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      data-status={d.status}
      style={{ ['--holo' as string]: color ?? 'var(--app-c1)' }}
    >
      <div className="hd-stage3d__plane">
        <span className="hd-stage3d__grid" aria-hidden="true" />
        <span className="hd-stage3d__rig">
          <span className="hd-stage3d__orbit" aria-hidden="true" />
          <span className="hd-stage3d__orbit hd-stage3d__orbit--2" aria-hidden="true" />
          <span className="hd-stage3d__beam" aria-hidden="true" />
          <span className="hd-stage3d__pad" aria-hidden="true" />
          <span className="hd-stage3d__glyph">
            <DeviceGlyph kind={d.kind} size={220} color={color} title={`${d.model} hologram`} />
          </span>
        </span>
        <span className="hd-stage3d__hud hd-stage3d__hud--tl neo-hud">{d.assetTag}</span>
        <span className="hd-stage3d__hud hd-stage3d__hud--bl neo-hud">{d.locked ? 'Locked · MDM' : (d.os ?? d.manufacturer)}</span>
        <span className="hd-stage3d__health">
          <HealthRing score={health} size={64} />
          <span className="neo-hud">{HEALTH_BAND_LABEL[healthBand(health)]}</span>
        </span>
      </div>
    </div>
  );
}

function SpecSheet({ d, now, admin }: { d: Device; now: number; admin: boolean }) {
  const ageMonths = Math.max(0, Math.floor((now - d.purchasedAt) / (30.4 * 86_400_000)));
  return (
    <div className="hd-spec">
      <CompliancePills d={d} now={now} />
      <dl className="neo-kv hd-spec__kv">
        <dt>Serial</dt>
        <dd className="neo-mono">{d.serial}</dd>
        <dt>Maker</dt>
        <dd>{d.manufacturer}</dd>
        {d.specs && (
          <>
            <dt>Specs</dt>
            <dd>{d.specs}</dd>
          </>
        )}
        {d.os && (
          <>
            <dt>OS</dt>
            <dd>
              {d.os}
              {d.compliance && !d.compliance.osCurrent && d.osTarget && <span className="hd-spec__hint"> → {d.osTarget}</span>}
            </dd>
          </>
        )}
        <dt>Office</dt>
        <dd>{d.office}</dd>
        <dt>Purchased</dt>
        <dd>
          {formatDate(d.purchasedAt)} <span className="neo-faint">· {ageMonths} mo</span>
        </dd>
        {admin && (
          <>
            <dt>Cost</dt>
            <dd>{formatMoney(d.cost)}</dd>
          </>
        )}
        {d.assigneeId && (
          <>
            <dt>Owner</dt>
            <dd>
              <Person userId={d.assigneeId} size={22} nameOnly />
            </dd>
          </>
        )}
        {d.notes && admin && (
          <>
            <dt>Notes</dt>
            <dd>{d.notes}</dd>
          </>
        )}
      </dl>
      <WarrantyBar d={d} now={now} />
    </div>
  );
}
