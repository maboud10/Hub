/**
 * Incident Command ("Sentinel") — NEO shell for /incidents/*:
 * 6 tabs (Command Deck, War Room, On-Call, Alerts, Status Page, Postmortems),
 * ?declare=1 deep-link modal, and Nova AI Sentinel Copilot drawer.
 */
import '@/styles/neo.css';
import '@/styles/incidents.css';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import {
  Bell,
  FileText,
  GitBranch,
  Globe,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  Siren,
  Sparkles,
  X,
} from 'lucide-react';
import { NeoAppFrame, NovaChip, isNavActive, type NeoNavItem } from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { activeIncidents } from '@/incidents/engine';
import { buildAlertGroups } from '@/incidents/seed';
import { useIncidents } from '@/incidents/store';
import type { Severity } from '@/incidents/types';
import { AlertsView } from './AlertsView';
import { CommandDeckView } from './CommandDeckView';
import { DeclareModal } from './DeclareModal';
import { OnCallView } from './OnCallView';
import { PostmortemsView } from './PostmortemsView';
import { StatusPageView } from './StatusPageView';
import { WarRoomView } from './WarRoomView';
import { SentinelCtx } from './parts';

const SENTINEL_TINT = { c1: '#f87171', c2: '#f97316' };

interface SectionMeta {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/incidents',
    end: true,
    icon: <Siren />,
    eyebrow: 'Incident deck',
    title: 'Command Deck',
    sub: 'Live blast-radius radar, 5-stage incident lifecycle tracker, MTTA/MTTR telemetry, and Nova root-cause synthesis.',
  },
  {
    to: '/incidents/war-room',
    icon: <ShieldAlert />,
    eyebrow: 'Incident deck · War Room',
    title: 'War Room',
    sub: 'Auto-captured incident timeline, 1-click DevHub deploy freeze, HoloMeet audio/video bridge, and stakeholder comms.',
  },
  {
    to: '/incidents/oncall',
    icon: <PhoneCall />,
    eyebrow: 'Incident deck · On-Call',
    title: 'On-Call & Rotations',
    sub: 'Follow-the-sun global schedule across 4 hubs, shift swap tracker, and responder fatigue radar wired to Wellbeing.',
  },
  {
    to: '/incidents/alerts',
    icon: <Bell />,
    eyebrow: 'Incident deck · Alerts',
    title: 'Alert Queue & Noise Rules',
    sub: 'Deduplicated alert groups, 1-click escalation to War Room, routing rules, and Nova noise-reduction recommendations.',
  },
  {
    to: '/incidents/status',
    icon: <Globe />,
    eyebrow: 'Incident deck · Status Page',
    title: 'Status Page',
    sub: 'Live service & Launchpad component health, 40-day uptime bars, customer status updates, and maintenance windows.',
  },
  {
    to: '/incidents/postmortems',
    icon: <FileText />,
    eyebrow: 'Incident deck · Postmortems',
    title: 'Blameless Postmortems',
    sub: 'Nova-drafted blameless RCAs, 5 Whys causal chain, and follow-up remediation tasks synced to Projects and Wiki.',
  },
];

export function IncidentsPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();

  const incidents = useIncidents((s) => s.incidents);
  const alertEvents = useIncidents((s) => s.alertEvents);
  const alertStates = useIncidents((s) => s.alertStates);
  const postmortems = useIncidents((s) => s.postmortems);
  const resetDemo = useIncidents((s) => s.resetDemo);
  const syncExternalSignals = useIncidents((s) => s.syncExternalSignals);

  const openList = useMemo(() => activeIncidents(incidents), [incidents]);
  const firingCount = useMemo(
    () => buildAlertGroups(alertEvents, alertStates, Date.now()).filter((g) => g.state === 'firing').length,
    [alertEvents, alertStates],
  );
  const draftPmCount = useMemo(
    () => postmortems.filter((p) => p.status === 'draft' || p.status === 'review').length,
    [postmortems],
  );

  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('inc-2047');
  const [declareOpen, setDeclareOpen] = useState(false);
  const [declarePreset, setDeclarePreset] = useState<{ title?: string; severity?: Severity; service?: string } | undefined>();
  const [novaDrawerOpen, setNovaDrawerOpen] = useState(false);

  const deepDeclare = params.get('declare') === '1';
  useEffect(() => {
    if (deepDeclare) setDeclareOpen(true);
  }, [deepDeclare]);

  // Pull live deploys from DevHub and service health from Cloud Console if available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const viewer = currentViewer();
        if (!viewer) return;
        const [devRes, cloudRes] = await Promise.allSettled([loadBridge('devhub'), loadBridge('cloud')]);
        if (cancelled) return;
        const liveDeploys =
          devRes.status === 'fulfilled'
            ? devRes.value.recentDeploys(viewer, { limit: 6 }).map((d) => ({ ...d, live: true }))
            : undefined;
        const liveHealth =
          cloudRes.status === 'fulfilled'
            ? cloudRes.value.serviceHealth(viewer).map((h) => ({ ...h, live: true }))
            : undefined;
        if ((liveDeploys && liveDeploys.length > 0) || (liveHealth && liveHealth.length > 0)) {
          syncExternalSignals(liveDeploys, liveHealth);
        }
      } catch {
        // fallback to Sentinel seeded snapshots
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncExternalSignals]);

  const openDeclare = useCallback((preset?: { title?: string; severity?: Severity; service?: string }) => {
    setDeclarePreset(preset);
    setDeclareOpen(true);
  }, []);

  const closeDeclare = useCallback(() => {
    setDeclareOpen(false);
    setDeclarePreset(undefined);
    if (params.has('declare')) {
      const next = new URLSearchParams(params);
      next.delete('declare');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const openNova = useCallback(() => {
    setNovaDrawerOpen(true);
  }, []);

  const items: NeoNavItem[] = [
    {
      to: '/incidents',
      label: 'Command Deck',
      icon: <Siren />,
      end: true,
      badge: openList.length || null,
      badgeTone: 'danger',
      title: 'Command Deck · Active incidents & blast-radius radar',
    },
    {
      to: '/incidents/war-room',
      label: 'War Room',
      icon: <ShieldAlert />,
      badge: openList.length ? 'LIVE' : null,
      badgeTone: 'danger',
      title: 'War Room · Timeline, roles, runbook & deploy freeze',
    },
    {
      to: '/incidents/oncall',
      label: 'On-Call',
      icon: <PhoneCall />,
      title: 'Follow-the-sun rotations, shift swaps & pager fatigue',
    },
    {
      to: '/incidents/alerts',
      label: 'Alerts',
      icon: <Bell />,
      badge: firingCount || null,
      title: 'Deduplicated alert groups & Nova noise reduction',
    },
    {
      to: '/incidents/status',
      label: 'Status Page',
      icon: <Globe />,
      title: 'Component health, 40-day uptime & Launchpad sync',
    },
    {
      to: '/incidents/postmortems',
      label: 'Postmortems',
      icon: <FileText />,
      badge: draftPmCount || null,
      title: 'Blameless postmortems, 5 Whys & follow-up actions',
    },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/incidents';

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--nova"
        onClick={() => setNovaDrawerOpen((o) => !o)}
        data-qa="inc-nova-drawer-btn"
      >
        <Sparkles />
        <span className="neo-btn__label">Nova Copilot</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetDemo}
        title="Reset Incident Command demo data"
        data-qa="inc-reset-btn"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--danger"
        onClick={() => openDeclare()}
        data-qa="inc-declare-btn"
      >
        <Siren />
        <span className="neo-btn__label">Declare Incident</span>
      </button>
    </>
  );

  const overlays = (
    <>
      <DeclareModal open={declareOpen} onClose={closeDeclare} preset={declarePreset} />
      {novaDrawerOpen && (
        <div className="inc-drawer-backdrop" onClick={() => setNovaDrawerOpen(false)}>
          <aside
            className="inc-drawer neo-panel"
            aria-label="Nova Sentinel AI Copilot"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="inc-drawer__head">
              <div>
                <NovaChip>Nova Sentinel AI</NovaChip>
                <h2 className="neo-panel__title">Live Incident Intelligence</h2>
              </div>
              <button
                type="button"
                className="neo-iconbtn"
                onClick={() => setNovaDrawerOpen(false)}
                aria-label="Close Nova drawer"
              >
                <X />
              </button>
            </header>
            <div className="inc-drawer__body">
              <div className="inc-drawer__card">
                <div className="neo-hud">Suspect deploy correlation (96% confidence)</div>
                <h4>INC-2047 · payments-svc v2.41.0</h4>
                <p>
                  Deployed 4m prior to eu-west-2 latency spike (320ms → 1,840ms). Connection pool idle timeout reduced in commit 9f3c2ab.
                </p>
                <div className="inc-inline-actions">
                  <Link
                    to="/incidents/war-room?id=inc-2047"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => setNovaDrawerOpen(false)}
                  >
                    <span>Open INC-2047 War Room</span>
                  </Link>
                  <Link to="/devhub/deploys" className="neo-btn neo-btn--soft neo-btn--xs">
                    <span>Inspect in DevHub</span>
                  </Link>
                </div>
              </div>

              <div className="inc-drawer__card">
                <div className="neo-hud">Carrier failover verification</div>
                <h4>INC-2046 · EU SMS Paging</h4>
                <p>
                  Secondary carrier DLR latency is stable at 2.1s across Berlin and London. Ready to mark INC-2046 resolved and restore Launchpad health.
                </p>
                <Link
                  to="/incidents/status"
                  className="neo-btn neo-btn--success neo-btn--xs"
                  onClick={() => setNovaDrawerOpen(false)}
                >
                  <span>Open Status Page</span>
                </Link>
              </div>

              <div className="inc-drawer__card">
                <div className="neo-hud">On-call wellbeing & fatigue</div>
                <h4>Berlin–London SRE Shift</h4>
                <p>
                  Lucas Meyer has 3 overnight pages this week. Priya Raman has accepted a 6h coverage swap on Core Platform Follow-the-Sun.
                </p>
                <Link
                  to="/incidents/oncall"
                  className="neo-btn neo-btn--soft neo-btn--xs"
                  onClick={() => setNovaDrawerOpen(false)}
                >
                  <span>Review Swap Tracker</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );

  return (
    <SentinelCtx.Provider
      value={{
        openDeclare,
        openNova,
        selectedIncidentId,
        setSelectedIncidentId,
      }}
    >
      <NeoAppFrame
        app="incidents"
        tint={SENTINEL_TINT}
        className="incidents-page"
        brand={{ icon: <Siren />, label: 'Incident Command', to: '/incidents' }}
        items={items}
        footer={[
          {
            to: '/devhub/deploys',
            label: 'DevHub',
            icon: <GitBranch />,
            title: 'Open DevHub deployments',
          },
        ]}
        head={{
          icon: section.icon,
          eyebrow: section.eyebrow,
          title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
          sub: section.sub,
          actions,
        }}
        overlays={overlays}
      >
        <Routes>
          <Route index element={<CommandDeckView />} />
          <Route path="war-room" element={<WarRoomView />} />
          <Route path="oncall" element={<OnCallView />} />
          <Route path="alerts" element={<AlertsView />} />
          <Route path="status" element={<StatusPageView />} />
          <Route path="postmortems" element={<PostmortemsView />} />
          <Route path="*" element={<Navigate to="/incidents" replace />} />
        </Routes>
      </NeoAppFrame>
    </SentinelCtx.Provider>
  );
}

export default IncidentsPage;
