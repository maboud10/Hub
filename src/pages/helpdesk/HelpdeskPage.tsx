/**
 * IT Helpdesk — "Support Deck & Fleet Command".
 * Employees: Home (Nova triage), Tickets, Devices, Catalog, Guides, Status.
 * IT (`helpdesk.manage`): Queue, Fleet, Tags, Insights.
 */
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Activity, BookOpen, ChartNoAxesCombined, House, Laptop, LayoutGrid, LifeBuoy, Lock, Radar, ShoppingBag, Tags, Ticket } from 'lucide-react';
import '@/styles/neo.css';
import '@/styles/helpdesk.css';
import { NeoEmpty, NeoHead, NeoRail, NeoStage, NeoWorkspace, type NeoNavItem } from '@/components/neo';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNow } from '@/hooks/useNow';
import { useHelpdesk } from '@/helpdesk/store';
import { activeIncidents, isUnread, requestsAwaiting } from '@/helpdesk/queries';
import { isBreaching } from '@/helpdesk/sla';
import { useOpenTicket, useSetParam, useViewer } from './ui';
import { HomeView } from './HomeView';
import { HealthCheckModal } from './HealthCheck';

const TINT = { c1: '#34d399', c2: '#0ea5e9' };

const TicketsView = lazy(() => import('./TicketsView').then((m) => ({ default: m.TicketsView })));
const TicketDetailView = lazy(() => import('./TicketDetail').then((m) => ({ default: m.TicketDetailView })));
const NewTicketWizard = lazy(() => import('./NewTicketWizard').then((m) => ({ default: m.NewTicketWizard })));
const DevicesView = lazy(() => import('./DevicesView').then((m) => ({ default: m.DevicesView })));
const DeviceDetailView = lazy(() => import('./DeviceDetail').then((m) => ({ default: m.DeviceDetailView })));
const CatalogView = lazy(() => import('./CatalogView').then((m) => ({ default: m.CatalogView })));
const RequestsView = lazy(() => import('./RequestsView').then((m) => ({ default: m.RequestsView })));
const GuidesView = lazy(() => import('./GuidesView').then((m) => ({ default: m.GuidesView })));
const GuideDetailView = lazy(() => import('./GuidesView').then((m) => ({ default: m.GuideDetailView })));
const StatusView = lazy(() => import('./StatusView').then((m) => ({ default: m.StatusView })));
const QueueView = lazy(() => import('./QueueView').then((m) => ({ default: m.QueueView })));
const FleetView = lazy(() => import('./FleetView').then((m) => ({ default: m.FleetView })));
const ScanOverlay = lazy(() => import('./ScanOverlay').then((m) => ({ default: m.ScanOverlay })));
const TagsView = lazy(() => import('./TagsView').then((m) => ({ default: m.TagsView })));
const InsightsView = lazy(() => import('./InsightsView').then((m) => ({ default: m.InsightsView })));

export function HelpdeskPage() {
  const viewer = useViewer();
  const tickets = useHelpdesk((s) => s.tickets);
  const requests = useHelpdesk((s) => s.requests);
  const incidents = useHelpdesk((s) => s.incidents);
  const seen = useHelpdesk((s) => s.seen);
  const now = useNow(30_000);
  const [sp] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const setParam = useSetParam();
  const openTicket = useOpenTicket();
  const it = !!viewer?.it;
  const me = viewer?.user.id ?? '';

  useEffect(() => {
    useHelpdesk.getState().resumeSimulations();
  }, []);

  const counts = useMemo(() => {
    const mine = tickets.filter((t) => t.requesterId === me);
    const attention = mine.filter((t) => t.status === 'waiting' || (t.status !== 'resolved' && isUnread(t, seen[me]?.[t.id], me))).length;
    return {
      attention,
      approvals: viewer ? requestsAwaiting(viewer, requests).length : 0,
      incidents: activeIncidents(incidents).length,
      breaching: it ? tickets.filter((t) => isBreaching(t, now)).length : 0,
    };
  }, [tickets, requests, incidents, seen, me, viewer, it, now]);

  const items: NeoNavItem[] = [
    { to: '/helpdesk', label: 'Home', icon: <House />, end: true },
    { to: '/helpdesk/tickets', label: 'Tickets', icon: <Ticket />, badge: counts.attention || null, title: counts.attention ? `Tickets · ${counts.attention} need you` : 'Tickets' },
    { to: '/helpdesk/devices', label: 'Devices', icon: <Laptop /> },
    { to: '/helpdesk/catalog', label: 'Catalog', icon: <ShoppingBag />, badge: counts.approvals || null, match: (p) => p.startsWith('/helpdesk/catalog') || p.startsWith('/helpdesk/requests'), title: counts.approvals ? `Catalog · ${counts.approvals} approvals waiting` : 'Catalog & requests' },
    { to: '/helpdesk/guides', label: 'Guides', icon: <BookOpen /> },
    { to: '/helpdesk/status', label: 'Status', icon: <Activity />, badge: counts.incidents || null, badgeTone: 'danger', title: counts.incidents ? `Status · ${counts.incidents} active incident` : 'Service status' },
  ];
  const footer: NeoNavItem[] | undefined = it
    ? [
        { to: '/helpdesk/queue', label: 'Queue', icon: <LayoutGrid />, badge: counts.breaching || null, badgeTone: 'danger', title: counts.breaching ? `Queue · ${counts.breaching} breaching SLA` : 'IT queue' },
        { to: '/helpdesk/fleet', label: 'Fleet', icon: <Radar /> },
        { to: '/helpdesk/tags', label: 'Tags', icon: <Tags /> },
        { to: '/helpdesk/insights', label: 'Insights', icon: <ChartNoAxesCombined /> },
      ]
    : undefined;

  useHotkeys({
    c: (e) => {
      if (sp.get('new') || sp.get('diag') || sp.get('scan') || document.querySelector('.modal, .sheet')) return;
      e.preventDefault();
      if (it && pathname.startsWith('/helpdesk/fleet')) setParam('register', '1');
      else if (it && pathname.startsWith('/helpdesk/tags')) setParam('newtag', '1');
      else openTicket();
    },
  });

  const closeParam = (k: string, also: string[] = []) => {
    const next = new URLSearchParams(sp);
    next.delete(k);
    for (const a of also) next.delete(a);
    const qs = next.toString();
    navigate(`${pathname}${qs ? `?${qs}` : ''}`, { replace: true });
  };

  return (
    <NeoWorkspace app="helpdesk" tint={TINT}>
      <NeoRail brand={{ icon: <LifeBuoy />, label: 'IT Helpdesk', to: '/helpdesk' }} items={items} footer={footer} label="IT Helpdesk" />
      <Suspense fallback={<StageFallback />}>
        <Routes>
          <Route index element={<HomeView />} />
          <Route path="tickets" element={<TicketsView />} />
          <Route path="tickets/:ticketId" element={<TicketDetailView />} />
          <Route path="devices" element={<DevicesView />} />
          <Route path="devices/:assetTag" element={<DeviceDetailView admin={false} />} />
          <Route path="catalog" element={<CatalogView />} />
          <Route path="requests" element={<RequestsView />} />
          <Route path="guides" element={<GuidesView />} />
          <Route path="guides/:slug" element={<GuideDetailView />} />
          <Route path="status" element={<StatusView />} />
          <Route path="queue" element={<ItOnly it={it}><QueueView /></ItOnly>} />
          <Route path="fleet" element={<ItOnly it={it}><FleetView /></ItOnly>} />
          <Route path="fleet/:assetTag" element={<ItOnly it={it}><DeviceDetailView admin /></ItOnly>} />
          <Route path="tags" element={<ItOnly it={it}><TagsView /></ItOnly>} />
          <Route path="insights" element={<ItOnly it={it}><InsightsView /></ItOnly>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <HealthCheckModal open={sp.get('diag') === '1'} onClose={() => closeParam('diag', ['device'])} deviceTag={sp.get('diag') === '1' ? (sp.get('device') ?? undefined) : undefined} />
      <Suspense fallback={null}>
        {sp.get('new') === '1' && <NewTicketWizard onClose={() => closeParam('new', ['category', 'device', 'subject'])} />}
        {it && sp.get('scan') === '1' && <ScanOverlay onClose={() => closeParam('scan')} />}
      </Suspense>
    </NeoWorkspace>
  );
}

function StageFallback() {
  return (
    <NeoStage>
      <div className="hd-skel">
        <i />
        <i />
        <i />
      </div>
    </NeoStage>
  );
}

function ItOnly({ it, children }: { it: boolean; children: ReactNode }) {
  if (it) return <>{children}</>;
  return (
    <NeoStage>
      <NeoHead icon={<Lock />} eyebrow="IT console" title="This area is for the IT team" />
      <div className="neo-body">
        <NeoEmpty
          icon={<Lock />}
          title="You need helpdesk admin access"
          action={
            <Link to="/helpdesk" className="neo-btn neo-btn--soft">
              Back to Support Home
            </Link>
          }
        >
          The queue, fleet, tags and insights are part of the IT console (helpdesk.manage). Your own tickets and devices are always available to you.
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}

function NotFound() {
  return (
    <NeoStage>
      <NeoHead icon={<LifeBuoy />} eyebrow="IT Helpdesk" title="Page not found" />
      <div className="neo-body">
        <NeoEmpty
          icon={<LifeBuoy />}
          title="Nothing lives here"
          action={
            <Link to="/helpdesk" className="neo-btn neo-btn--plasma">
              Go to Support Home
            </Link>
          }
        >
          The link may be old, or the item was removed.
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}
