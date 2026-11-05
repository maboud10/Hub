import '@/styles/helpdesk.css';
import { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from 'react-router';
import {
  Laptop,
  LifeBuoy,
  Package,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  Ticket,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useSessionUser } from '@/store/selectors';
import { firstName, greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { canUserManageHelpdesk, useHelpdesk } from '@/helpdesk/store';
import { OverviewView } from './OverviewView';
import { TicketsView } from './TicketsView';
import { MyDevicesView } from './MyDevicesView';
import { CatalogView } from './CatalogView';
import { InventoryView } from './InventoryView';
import { QueueView } from './QueueView';
import {
  DeviceInspectorSheet,
  DiagnosticsModal,
  NewTicketModal,
  RegisterDeviceModal,
} from './shared';

interface HelpdeskTab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number | string;
  adminBadge?: boolean;
}

export function HelpdeskPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const devices = useHelpdesk((s) => s.devices);
  const tickets = useHelpdesk((s) => s.tickets);
  const catalog = useHelpdesk((s) => s.catalog);
  const adminPreviewOverride = useHelpdesk((s) => s.adminPreviewOverride);
  const setAdminPreviewOverride = useHelpdesk((s) => s.setAdminPreviewOverride);

  const isNativeItAdmin = canUserManageHelpdesk(me);
  const isItAdmin = isNativeItAdmin || adminPreviewOverride;

  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newTicketDeviceId, setNewTicketDeviceId] = useState<string | undefined>(undefined);
  const [diagOpen, setDiagOpen] = useState(false);
  const [registerDeviceOpen, setRegisterDeviceOpen] = useState(false);
  const [inspectingDeviceId, setInspectingDeviceId] = useState<string | null>(null);

  // Deep-link triggers (`?new=1`, `?diag=1`, `?device=<id>`)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewTicketOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    if (searchParams.get('diag') === '1') {
      setDiagOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('diag');
      setSearchParams(next, { replace: true });
    }
    const devParam = searchParams.get('device');
    if (devParam) {
      setInspectingDeviceId(devParam);
      const next = new URLSearchParams(searchParams);
      next.delete('device');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const myUserId = me?.id ?? 'u-mei';
  const myDevicesCount = useMemo(
    () => devices.filter((d) => d.assignedToUserId === myUserId).length,
    [devices, myUserId],
  );
  const myOpenTicketsCount = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.requesterId === myUserId &&
          t.status !== 'resolved' &&
          t.status !== 'closed',
      ).length,
    [tickets, myUserId],
  );
  const openQueueCount = useMemo(
    () => tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length,
    [tickets],
  );
  const inStockCount = useMemo(
    () => devices.filter((d) => d.status === 'in_stock').length,
    [devices],
  );
  const compliancePct = useMemo(() => {
    if (!devices.length) return 100;
    const comp = devices.filter((d) => d.compliance === 'compliant').length;
    return Math.round((comp / devices.length) * 100);
  }, [devices]);

  const tabs: HelpdeskTab[] = [
    {
      to: '/helpdesk',
      label: 'Overview & Quick Fix',
      icon: Sparkles,
      end: true,
    },
    {
      to: '/helpdesk/tickets',
      label: 'My Tickets',
      icon: Ticket,
      badge: myOpenTicketsCount,
    },
    {
      to: '/helpdesk/my-devices',
      label: 'My Assigned Devices',
      icon: Laptop,
      badge: myDevicesCount,
    },
    {
      to: '/helpdesk/catalog',
      label: 'IT Request Catalog',
      icon: Package,
      badge: catalog.length,
    },
    {
      to: '/helpdesk/inventory',
      label: 'Admin: Device & Tag Inventory',
      icon: Tag,
      badge: devices.length,
      adminBadge: true,
    },
    {
      to: '/helpdesk/queue',
      label: 'Admin: Ticket Triage Queue',
      icon: Wrench,
      badge: openQueueCount,
      adminBadge: true,
    },
  ];

  const handleOpenRaiseTicket = (deviceId?: string) => {
    setNewTicketDeviceId(deviceId);
    setNewTicketOpen(true);
  };

  return (
    <div className="hd-page">
      {/* Top Hero Banner */}
      <header className="hd-hero">
        <div className="hd-hero__main">
          <div className="hd-hero__eyebrow">
            <LifeBuoy size={14} />
            <span>Helix IT Helpdesk & Fleet Command · Zero-Trust Endpoint Ops</span>
            {isNativeItAdmin ? (
              <span className="hd-role-badge hd-role-badge--admin">
                <ShieldCheck size={12} /> IT & Fleet Admin
              </span>
            ) : (
              <button
                type="button"
                className={cx('hd-role-badge', isItAdmin && 'hd-role-badge--admin')}
                onClick={() => setAdminPreviewOverride(!adminPreviewOverride)}
                title="Toggle IT Admin Fleet & Triage Governance Preview"
              >
                <ShieldCheck size={12} />
                {isItAdmin ? 'IT Admin Preview: ON' : 'Preview as IT Admin'}
              </button>
            )}
          </div>

          <h1 className="hd-hero__title">
            {greeting()}, {me ? firstName(me.name) : 'Team'} — how can IT & Fleet Ops help today?
          </h1>
          <p className="hd-hero__sub">
            Run 1-click zero-trust diagnostics, inspect your assigned hardware & physical QR asset tags, request pre-approved gear, or govern the global device & tag inventory.
          </p>

          {/* Live KPI Pills */}
          <div className="hd-hero__kpis">
            <button
              type="button"
              className="hd-hero-pill"
              onClick={() => navigate('/helpdesk/my-devices')}
            >
              <Laptop size={14} />
              <span>My Assigned Devices:</span>
              <strong>{myDevicesCount}</strong>
            </button>

            <button
              type="button"
              className="hd-hero-pill"
              onClick={() => navigate('/helpdesk/tickets')}
            >
              <Ticket size={14} />
              <span>My Open Tickets:</span>
              <strong>{myOpenTicketsCount}</strong>
            </button>

            <button
              type="button"
              className="hd-hero-pill"
              onClick={() => navigate('/helpdesk/inventory')}
            >
              <QrCode size={14} />
              <span>Fleet Size:</span>
              <strong>
                {devices.length} ({inStockCount} in stock)
              </strong>
            </button>

            <button
              type="button"
              className="hd-hero-pill"
              onClick={() => navigate('/helpdesk/inventory')}
            >
              <ShieldCheck size={14} className="text-success" />
              <span>MDM Compliance:</span>
              <strong className="text-success">{compliancePct}%</strong>
            </button>

            <button
              type="button"
              className="hd-hero-pill"
              onClick={() => navigate('/helpdesk/queue')}
            >
              <Wrench size={14} />
              <span>Open Queue:</span>
              <strong>{openQueueCount}</strong>
            </button>
          </div>
        </div>

        {/* Hero Primary CTA Buttons */}
        <div className="hd-hero__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => handleOpenRaiseTicket()}
          >
            <Plus size={16} /> Raise a Ticket
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setDiagOpen(true)}
          >
            <Terminal size={16} /> Self-Service Diagnostics
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setRegisterDeviceOpen(true)}
          >
            <QrCode size={16} /> + Register Device
          </button>
        </div>
      </header>

      {/* Sub-navigation Tabs */}
      <nav className="hd-tabs" aria-label="IT Helpdesk navigation">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx('hd-tab', isActive && 'is-active', t.adminBadge && 'hd-tab--admin')
              }
            >
              <Icon size={15} />
              <span>{t.label}</span>
              {typeof t.badge !== 'undefined' && (
                <span className="hd-tab__badge">{t.badge}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Main View Router */}
      <div className="hd-content">
        <Routes>
          <Route
            index
            element={
              <OverviewView
                onInspectDevice={(id) => setInspectingDeviceId(id)}
                onRaiseTicket={(devId) => handleOpenRaiseTicket(devId)}
              />
            }
          />
          <Route
            path="tickets"
            element={
              <TicketsView
                onInspectDevice={(id) => setInspectingDeviceId(id)}
                onRaiseTicket={(devId) => handleOpenRaiseTicket(devId)}
              />
            }
          />
          <Route
            path="my-devices"
            element={
              <MyDevicesView
                onInspectDevice={(id) => setInspectingDeviceId(id)}
                onRaiseTicket={(devId) => handleOpenRaiseTicket(devId)}
              />
            }
          />
          <Route path="catalog" element={<CatalogView />} />
          <Route
            path="inventory"
            element={
              <InventoryView
                onInspectDevice={(id) => setInspectingDeviceId(id)}
                onOpenRegisterModal={() => setRegisterDeviceOpen(true)}
              />
            }
          />
          <Route
            path="queue"
            element={
              <QueueView onInspectDevice={(id) => setInspectingDeviceId(id)} />
            }
          />
          <Route path="*" element={<Navigate to="/helpdesk" replace />} />
        </Routes>
      </div>

      {/* Global Slide-over Device Inspector & Modals */}
      <DeviceInspectorSheet
        deviceId={inspectingDeviceId}
        onClose={() => setInspectingDeviceId(null)}
        onReportIssue={(devId) => handleOpenRaiseTicket(devId)}
      />

      <NewTicketModal
        open={newTicketOpen}
        onClose={() => setNewTicketOpen(false)}
        initialDeviceId={newTicketDeviceId}
        onCreated={(tktId) => navigate(`/helpdesk/tickets?ticket=${tktId}`)}
      />

      <DiagnosticsModal
        open={diagOpen}
        onClose={() => setDiagOpen(false)}
        onEscalateTicket={() => handleOpenRaiseTicket()}
      />

      <RegisterDeviceModal
        open={registerDeviceOpen}
        onClose={() => setRegisterDeviceOpen(false)}
        onRegistered={(devId) => {
          navigate('/helpdesk/inventory');
          setInspectingDeviceId(devId);
        }}
      />
    </div>
  );
}
