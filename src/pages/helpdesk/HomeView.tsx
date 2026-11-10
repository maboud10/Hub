/**
 * Support Home — Nova triage console, quick fixes, my setup (mini holograms),
 * open tickets with live SLA rings, service status and IT announcements.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Activity, ArrowRight, BellRing, ChevronRight, CircleCheck, Info, LifeBuoy, Megaphone, Plus, Siren, Stethoscope, TriangleAlert } from 'lucide-react';
import { NeoEmpty, NeoHead, NeoStage, Orb } from '@/components/neo';
import { relativeTime } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device, PlaybookId } from '@/helpdesk/types';
import { QUICK_FIXES, PLAYBOOKS } from '@/helpdesk/playbooks';
import { deviceHealth, primaryDevice } from '@/helpdesk/fleet';
import { activeIncidents, isOpen, serviceHealth } from '@/helpdesk/queries';
import { headlineSla, slaLabel } from '@/helpdesk/sla';
import { DEVICE_STATUS_LABEL, KIND_LABEL, officeOf, SERVICE_HEALTH_LABEL, SERVICE_HEALTH_TONE, SEVERITY_TONE } from '@/helpdesk/meta';
import { firstNameOf } from '@/helpdesk/util';
import { NovaTriage } from './NovaTriage';
import { PlaybookModal } from './playbook';
import { PLAYBOOK_ICON } from './icons';
import { DeviceGlyph } from './glyphs';
import { HealthRing, Kbd, Panel, SlaRing, StatusPill, useOpenTicket, useSetParam, useViewer } from './ui';

export function HomeView() {
  const viewer = useViewer();
  const openTicket = useOpenTicket();
  const setParam = useSetParam();
  const [fix, setFix] = useState<PlaybookId | null>(null);
  const first = firstNameOf(viewer?.user.name);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <NeoStage label="Support home">
      <NeoHead
        icon={<LifeBuoy />}
        eyebrow="Support deck"
        title={`${hello}, ${first}`}
        sub="Describe a problem and Nova will diagnose it — and usually fix it."
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--soft" onClick={() => setParam('diag', '1')} data-qa="home-diag">
              <Stethoscope /> <span className="neo-btn__label">Health check</span>
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openTicket()} data-tip="New ticket (C)" data-qa="home-new">
              <Plus /> <span className="neo-btn__label">New ticket</span>
            </button>
          </>
        }
      />
      <div className="neo-body neo-pad">
        <IncidentBanner />
        <div className="hd-home">
          <div className="hd-home__main">
            <NovaTriage />
            <QuickFixes onRun={setFix} />
          </div>
          <aside className="hd-home__side" aria-label="Your support overview">
            <MySetup />
            <OpenTickets />
            <StatusStrip />
            <Announcements />
          </aside>
        </div>
      </div>
      <PlaybookModal playbookId={fix} onClose={() => setFix(null)} />
    </NeoStage>
  );
}

function IncidentBanner() {
  const viewer = useViewer();
  const incidents = useHelpdesk((s) => s.incidents);
  useNow(60_000);
  const office = officeOf(viewer?.user.location);
  const live = activeIncidents(incidents);
  if (!live.length) return null;
  const mineFirst = [...live].sort((a, b) => Number(!!b.offices?.includes(office)) - Number(!!a.offices?.includes(office)));
  return (
    <div className="hd-banners">
      {mineFirst.slice(0, 2).map((inc) => {
        const last = inc.updates[inc.updates.length - 1];
        const affectsMe = !inc.offices || inc.offices.includes(office);
        return (
          <Link key={inc.id} to="/helpdesk/status" className="hd-banner" data-tone={SEVERITY_TONE[inc.severity]}>
            <span className="hd-banner__icon">
              <Siren />
            </span>
            <span className="hd-banner__text">
              <b>{inc.title}</b>
              <span>{last?.body}</span>
            </span>
            <span className="hd-banner__meta">
              {affectsMe ? 'Affects you' : inc.offices?.join(', ')} · updated {relativeTime(last?.at ?? inc.startedAt)}
            </span>
            <ChevronRight />
          </Link>
        );
      })}
    </div>
  );
}

function QuickFixes({ onRun }: { onRun: (id: PlaybookId) => void }) {
  const runs = useHelpdesk((s) => s.fixRuns);
  const viewer = useViewer();
  const mine = runs.filter((r) => r.userId === viewer?.user.id).length;
  return (
    <Panel hud="One-click fixes" title="Quick fixes" actions={mine > 0 ? <span className="neo-faint text-sm">{mine} run by you</span> : undefined}>
      <div className="hd-fixes neo-stagger">
        {QUICK_FIXES.map((id, i) => {
          const Icon = PLAYBOOK_ICON[id];
          const p = PLAYBOOKS[id];
          return (
            <button key={id} type="button" className="hd-fix neo-spot" style={{ ['--i' as string]: i }} onClick={() => onRun(id)} data-qa={`fix-${id}`}>
              <span className="hd-fix__icon">
                <Icon />
              </span>
              <span className="hd-fix__title">{p.title}</span>
              <span className="hd-fix__blurb">{p.blurb}</span>
              <span className="hd-fix__go" aria-hidden="true">
                Run <ArrowRight />
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function MySetup() {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const setParam = useSetParam();
  const now = useNow(30_000);
  const me = viewer?.user.id ?? '';
  const mine = useMemo(() => devices.filter((d) => d.assigneeId === me && d.status !== 'retired'), [devices, me]);
  const primary = useMemo(() => primaryDevice(devices, me), [devices, me]);
  const others = mine.filter((d) => d.assetTag !== primary?.assetTag);

  return (
    <Panel hud="Your setup" title="My devices" actions={<Link to="/helpdesk/devices" className="neo-btn neo-btn--ghost neo-btn--xs">All <ArrowRight /></Link>}>
      {!mine.length ? (
        <NeoEmpty compact icon={<LifeBuoy />} title="No devices yet">
          Request one from the <Link to="/helpdesk/catalog" className="neo-tint">catalog</Link>.
        </NeoEmpty>
      ) : (
        <>
          {primary && <PrimaryDevice d={primary} now={now} onScan={() => setParam('diag', '1')} />}
          <div className="hd-minidevs">
            {others.map((d) => (
              <Link key={d.assetTag} to={`/helpdesk/devices/${d.assetTag}`} className="hd-minidev" title={`${d.model} · ${d.assetTag}`}>
                <DeviceGlyph kind={d.kind} size={44} />
                <span className="hd-minidev__name">{KIND_LABEL[d.kind]}</span>
                <span className="hd-minidev__tag neo-mono">{d.assetTag.slice(3)}</span>
                {d.status !== 'in_use' ? <span className="hd-minidev__state" data-status={d.status}>{DEVICE_STATUS_LABEL[d.status]}</span> : <span className="hd-minidev__dot" style={{ background: `var(--hd-h-${band(deviceHealth(d, now))})` }} />}
              </Link>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

const band = (h: number) => (h >= 85 ? 'ok' : h >= 70 ? 'fair' : h >= 50 ? 'warn' : 'bad');
const shortService = (id: string, name: string) => (id === 'sso' ? 'SSO' : id === 'vpn' ? 'VPN' : name.replace('Helix ', ''));

function PrimaryDevice({ d, now, onScan }: { d: Device; now: number; onScan: () => void }) {
  const h = deviceHealth(d, now);
  return (
    <div className="hd-primary">
      <Link to={`/helpdesk/devices/${d.assetTag}`} className="hd-primary__holo" aria-label={`${d.model} details`}>
        <DeviceGlyph kind={d.kind} size={118} />
        <span className="hd-primary__base" aria-hidden="true" />
      </Link>
      <div className="hd-primary__info">
        <div className="neo-hud">{d.status === 'loaner' ? 'Loaner' : 'Primary device'}</div>
        <div className="hd-primary__model">{d.model}</div>
        <div className="hd-primary__meta">
          <span className="neo-mono">{d.assetTag}</span> · {d.os ?? KIND_LABEL[d.kind]}
          {d.loan && <> · due {relativeTime(d.loan.dueAt, now)}</>}
        </div>
        <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={onScan}>
          <Stethoscope /> Run check
        </button>
      </div>
      <HealthRing score={h} size={58} />
    </div>
  );
}

function OpenTickets() {
  const viewer = useViewer();
  const tickets = useHelpdesk((s) => s.tickets);
  const now = useNow(1000);
  const me = viewer?.user.id ?? '';
  const open = useMemo(() => tickets.filter((t) => t.requesterId === me && isOpen(t)).sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting') || b.updatedAt - a.updatedAt), [tickets, me]);
  const toRate = useMemo(() => tickets.filter((t) => t.requesterId === me && t.status === 'resolved' && !t.csat && !t.selfService), [tickets, me]);
  return (
    <Panel hud="In flight" title="My open tickets" actions={<Link to="/helpdesk/tickets" className="neo-btn neo-btn--ghost neo-btn--xs">All <ArrowRight /></Link>}>
      {!open.length && !toRate.length ? (
        <div className="hd-allclear">
          <CircleCheck />
          <div>
            <b>Nothing open</b>
            <span>That’s the dream. If something breaks, describe it to Nova above.</span>
          </div>
        </div>
      ) : (
        <div className="hd-opentix">
          {open.slice(0, 4).map((t) => {
            const sla = headlineSla(t, now);
            return (
              <Link key={t.id} to={`/helpdesk/tickets/${t.id}`} className="hd-opentix__row">
                <SlaRing sla={sla} size={40} caption={sla.kind === 'response' ? 'First response' : 'Resolution'} />
                <span className="hd-opentix__text">
                  <span className="hd-opentix__subj">{t.subject}</span>
                  <span className="hd-opentix__meta">
                    <span className="neo-mono">{t.id}</span> · {t.status === 'waiting' ? 'Your reply needed' : slaLabel(sla)} · {relativeTime(t.updatedAt, now)}
                  </span>
                </span>
                <StatusPill status={t.status} size="sm" />
              </Link>
            );
          })}
          {toRate.slice(0, 2).map((t) => (
            <Link key={t.id} to={`/helpdesk/tickets/${t.id}#rate`} className="hd-opentix__row hd-opentix__row--rate">
              <span className="hd-rateicon" aria-hidden="true">
                ★
              </span>
              <span className="hd-opentix__text">
                <span className="hd-opentix__subj">{t.subject}</span>
                <span className="hd-opentix__meta">Resolved {relativeTime(t.resolvedAt ?? t.updatedAt, now)} · how did we do?</span>
              </span>
              <span className="neo-btn neo-btn--soft neo-btn--xs">Rate</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function StatusStrip() {
  const services = useHelpdesk((s) => s.services);
  const incidents = useHelpdesk((s) => s.incidents);
  const maintenance = useHelpdesk((s) => s.maintenance);
  const now = useNow(60_000);
  const rows = services.map((s) => ({ s, ...serviceHealth(s, incidents, maintenance, now) }));
  const bad = rows.filter((r) => r.health !== 'operational');
  const next = [...maintenance].filter((m) => m.endsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0];
  return (
    <Panel hud="Live" title="Service status" actions={<Link to="/helpdesk/status" className="neo-btn neo-btn--ghost neo-btn--xs">Status <ArrowRight /></Link>}>
      <div className="hd-svcsum" data-ok={bad.length === 0 || undefined}>
        {bad.length === 0 ? <Activity /> : <TriangleAlert />}
        <span>{bad.length === 0 ? 'All systems operational' : `${bad.length} ${bad.length === 1 ? 'service' : 'services'} degraded`}</span>
      </div>
      <div className="hd-svcgrid">
        {rows.map(({ s, health }) => (
          <span key={s.id} className="hd-svc" title={`${s.name} · ${SERVICE_HEALTH_LABEL[health]}`}>
            <Orb tone={SERVICE_HEALTH_TONE[health] as never} pulse={health !== 'operational'} size={7} />
            <span className="truncate">{shortService(s.id, s.name)}</span>
          </span>
        ))}
      </div>
      {next && (
        <div className="hd-nextmnt">
          <BellRing />
          <span>
            <b>{next.title}</b> · {next.startsAt > now ? relativeTime(next.startsAt, now) : 'now'}
          </span>
        </div>
      )}
    </Panel>
  );
}

function Announcements() {
  const items = useHelpdesk((s) => s.announcements);
  return (
    <Panel hud="From IT" title="Announcements">
      <ul className="hd-anns">
        {items.map((a) => (
          <li key={a.id} className="hd-ann" data-tone={a.tone}>
            <span className="hd-ann__icon">{a.tone === 'warning' ? <Megaphone /> : a.tone === 'success' ? <CircleCheck /> : <Info />}</span>
            <div>
              <b>{a.title}</b>
              <p>{a.body}</p>
              {a.link && (
                <Link to={a.link} className="hd-ann__link">
                  {a.linkLabel ?? 'Open'} <ArrowRight />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="hd-kbdhint">
        <Kbd>C</Kbd> new ticket · <Kbd>⌘K</Kbd> search everything
      </div>
    </Panel>
  );
}
