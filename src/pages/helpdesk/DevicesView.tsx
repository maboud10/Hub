/**
 * My devices — floating, pointer-tilting device holograms with live health,
 * compliance, warranty and check-in; quick paths for problems, loss and returns.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Laptop, PackageOpen, Plus, ShieldAlert, Stethoscope, Truck, Wrench } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoStage } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import { complianceIssues, deviceHealth, primaryDevice } from '@/helpdesk/fleet';
import { HoloCard } from './DeviceParts';
import { Kbd, plural, useOpenTicket, useSetParam, useViewer } from './ui';

const KIND_RANK: Record<string, number> = { laptop: 0, desktop: 1, phone: 2, tablet: 3, monitor: 4, dock: 5, keyboard: 6, headset: 7, 'security-key': 8 };

export function DevicesView() {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const now = useNow(30_000);
  const setParam = useSetParam();
  const openTicket = useOpenTicket();
  const me = viewer?.user.id ?? '';

  const primary = useMemo(() => primaryDevice(devices, me), [devices, me]);
  const mine = useMemo(
    () =>
      devices
        .filter((d) => d.assigneeId === me && d.status !== 'retired')
        .sort((a, b) => Number(b.assetTag === primary?.assetTag) - Number(a.assetTag === primary?.assetTag) || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)),
    [devices, me, primary],
  );
  const attention = mine.filter((d) => complianceIssues(d, now).length > 0 || deviceHealth(d, now) < 70).length;
  const loaner = mine.find((d) => d.status === 'loaner' && d.loan);

  const sub = !mine.length
    ? 'Nothing assigned to you yet'
    : `${plural(mine.length, 'device')} · ${attention ? `${attention} need${attention === 1 ? 's' : ''} attention` : 'all healthy and compliant'}${loaner?.loan ? ` · loaner due ${new Date(loaner.loan.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`;

  return (
    <NeoStage label="My devices">
      <NeoHead
        icon={<Laptop />}
        eyebrow="Your setup"
        title="My devices"
        sub={sub}
        actions={
          <>
            <Link to="/helpdesk/catalog?kind=hardware" className="neo-btn neo-btn--soft" data-qa="devices-request">
              <Plus /> <span className="neo-btn__label">Request hardware</span>
            </Link>
            {primary && (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setParam('diag', '1')} data-qa="devices-diag">
                <Stethoscope /> <span className="neo-btn__label">Health check</span>
              </button>
            )}
          </>
        }
      />
      <div className="neo-body neo-pad">
        {!mine.length ? (
          <NeoEmpty
            icon={<Laptop />}
            title="No devices assigned to you"
            action={
              <Link to="/helpdesk/catalog?kind=hardware" className="neo-btn neo-btn--plasma">
                Browse hardware
              </Link>
            }
          >
            New laptops, displays and keys are requested from the catalog — most arrive within a few days.
          </NeoEmpty>
        ) : (
          <>
            <div className="hd-holos neo-stagger">
              {mine.map((d, i) => (
                <HoloCard key={d.assetTag} d={d} now={now} i={i} to={`/helpdesk/devices/${d.assetTag}`} />
              ))}
              <Link to="/helpdesk/catalog?kind=hardware" className="hd-holo-add" style={{ ['--i' as string]: mine.length }}>
                <span className="hd-holo-add__icon">
                  <Plus />
                </span>
                <b>Add to your setup</b>
                <span>Displays, docks, keys and headsets from the catalog</span>
              </Link>
            </div>

            <section className="hd-devhelp" aria-label="Device help">
              <button type="button" className="hd-devhelp__item neo-spot" onClick={() => openTicket({ category: 'hardware', device: primary?.assetTag })}>
                <span className="hd-devhelp__icon">
                  <Wrench />
                </span>
                <span>
                  <b>Something’s wrong</b>
                  <span>Report a problem with any device</span>
                </span>
              </button>
              {primary && (
                <Link to={`/helpdesk/devices/${primary.assetTag}?lost=1`} className="hd-devhelp__item neo-spot" data-tone="danger">
                  <span className="hd-devhelp__icon">
                    <ShieldAlert />
                  </span>
                  <span>
                    <b>Lost or stolen?</b>
                    <span>Lock it remotely and alert Security</span>
                  </span>
                </Link>
              )}
              {primary && (
                <Link to={`/helpdesk/devices/${primary.assetTag}?return=1`} className="hd-devhelp__item neo-spot">
                  <span className="hd-devhelp__icon">
                    <Truck />
                  </span>
                  <span>
                    <b>Returning a device</b>
                    <span>Book a drop-off at your IT bar</span>
                  </span>
                </Link>
              )}
              <Link to="/helpdesk/requests" className="hd-devhelp__item neo-spot">
                <span className="hd-devhelp__icon">
                  <PackageOpen />
                </span>
                <span>
                  <b>Track a request</b>
                  <span>See approvals and deliveries</span>
                </span>
              </Link>
            </section>
            <div className="hd-listfoot">
              Move your pointer over a hologram · <Kbd>C</Kbd> new ticket
            </div>
          </>
        )}
      </div>
    </NeoStage>
  );
}
