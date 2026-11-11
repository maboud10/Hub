/**
 * Public App Bridge for Incident Command ("Sentinel") — see src/lib/appBridge.ts.
 */
import { Bell, FileText, Globe, PhoneCall, ShieldAlert, Siren } from 'lucide-react';
import type { BridgeIncident, IncidentsBridge, PaletteEntry } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { activeIncidents, effectiveStatus } from './engine';
import { SEV_META } from './meta';
import { onCallNow as computeOnCallNow, pageLoadFor } from './oncall';
import { canUseIncidents, useIncidents } from './store';

export const api: IncidentsBridge = {
  appId: 'incidents',

  paletteEntries(viewer) {
    if (!canUseIncidents(viewer.perms)) return [];
    const st = useIncidents.getState();
    const open = activeIncidents(st.incidents);
    const out: PaletteEntry[] = [
      {
        id: 'incidents:declare',
        group: 'Actions',
        title: 'Declare an incident',
        subtitle: 'Page on-call rotations, open a War Room & freeze deploys',
        icon: <Siren />,
        glyphColor: '#ef4444',
        keywords: ['incident', 'declare', 'outage', 'sev1', 'sev2', 'page', 'sentinel'],
        hint: 'Declare',
        to: '/incidents?declare=1',
      },
      {
        id: 'incidents:war-room',
        group: 'Actions',
        title: 'Open War Room',
        subtitle: open[0] ? `${open[0].code} · ${open[0].title}` : 'Live timeline, roles, runbook & comms',
        icon: <ShieldAlert />,
        glyphColor: '#f97316',
        keywords: ['war room', 'bridge', 'timeline', 'freeze', 'mitigate'],
        hint: 'Open',
        to: open[0] ? `/incidents/war-room?id=${open[0].id}` : '/incidents/war-room',
      },
      {
        id: 'incidents:oncall',
        group: 'Actions',
        title: "Who's on call",
        subtitle: 'Follow-the-sun schedule, shift swaps & pager fatigue radar',
        icon: <PhoneCall />,
        glyphColor: '#fb923c',
        keywords: ['on-call', 'oncall', 'rotation', 'swap', 'pager', 'fatigue'],
        hint: 'Open',
        to: '/incidents/oncall',
      },
      {
        id: 'incidents:alerts',
        group: 'Actions',
        title: 'Alert queue & Nova noise reduction',
        subtitle: 'Deduplicated alert groups, routing rules & suppression hints',
        icon: <Bell />,
        glyphColor: '#f59e0b',
        keywords: ['alerts', 'noise', 'routing', 'snooze', 'ack'],
        hint: 'Open',
        to: '/incidents/alerts',
      },
      {
        id: 'incidents:status',
        group: 'Actions',
        title: 'Status page',
        subtitle: 'Live component health, 90-day uptime & customer updates',
        icon: <Globe />,
        glyphColor: '#38bdf8',
        keywords: ['status page', 'uptime', 'degraded', 'maintenance', 'launchpad'],
        hint: 'Open',
        to: '/incidents/status',
      },
      {
        id: 'incidents:postmortems',
        group: 'Actions',
        title: 'Postmortems',
        subtitle: 'Nova-drafted blameless reviews, 5 Whys & follow-up tasks',
        icon: <FileText />,
        glyphColor: '#a855f7',
        keywords: ['postmortem', 'rca', 'root cause', '5 whys', 'blameless'],
        hint: 'Open',
        to: '/incidents/postmortems',
      },
    ];

    for (const inc of st.incidents.slice(0, 6)) {
      out.push({
        id: `incidents:inc:${inc.id}`,
        group: 'Work',
        title: `${inc.code} · ${inc.title}`,
        subtitle: `${inc.severity} · ${inc.status} · ${inc.services.join(', ')}`,
        icon: <Siren />,
        glyphColor: SEV_META[inc.severity].color,
        keywords: ['incident', inc.code.toLowerCase(), inc.severity.toLowerCase(), ...inc.services],
        hint: inc.status === 'resolved' ? 'Review' : 'War Room',
        to: `/incidents/war-room?id=${inc.id}`,
      });
    }

    for (const pm of st.postmortems.slice(0, 4)) {
      out.push({
        id: `incidents:pm:${pm.id}`,
        group: 'Work',
        title: `Postmortem · ${pm.title}`,
        subtitle: `Status: ${pm.status} · ${pm.actions.filter((a) => a.done).length}/${pm.actions.length} actions complete`,
        icon: <FileText />,
        glyphColor: '#a855f7',
        keywords: ['postmortem', 'rca', pm.title.toLowerCase()],
        hint: 'Open',
        to: `/incidents/postmortems?id=${pm.id}`,
      });
    }

    return out;
  },

  resetDemo() {
    useIncidents.getState().resetDemo();
  },

  listActive(viewer): BridgeIncident[] {
    if (!canUseIncidents(viewer.perms)) return [];
    const now = Date.now();
    const open = activeIncidents(useIncidents.getState().incidents);
    return open.map((inc) => ({
      id: inc.id,
      code: inc.code,
      title: inc.title,
      severity: inc.severity,
      status: effectiveStatus(inc, now),
      services: inc.services,
      commanderId: inc.roles.commander,
      startedAt: inc.startedAt,
      to: `/incidents/war-room?id=${inc.id}`,
    }));
  },

  declare(viewer, input) {
    if (!canUseIncidents(viewer.perms)) {
      return { ok: false, error: 'You do not have permission to declare incidents.' };
    }
    const cleanTitle = input.title?.trim();
    if (!cleanTitle || cleanTitle.length < 3) {
      return { ok: false, error: 'Incident title must be at least 3 characters.' };
    }
    const inc = useIncidents.getState().declareIncident(
      {
        title: cleanTitle,
        severity: input.severity,
        services: input.services,
        summary: input.summary,
        source: input.source,
      },
      viewer.user.id,
    );
    return {
      ok: true,
      incidentId: inc.id,
      to: `/incidents/war-room?id=${inc.id}`,
    };
  },

  onCallNow(viewer) {
    if (!canUseIncidents(viewer.perms)) return [];
    const st = useIncidents.getState();
    const now = Date.now();
    const slots = computeOnCallNow(st.rotations, now, st.overrides);
    return slots.map((slot) => {
      const rot = st.rotations.find((r) => r.id === slot.rotationId);
      return {
        rotation: rot?.name ?? slot.rotationId,
        userId: slot.userId,
        until: slot.until,
      };
    });
  },

  pageLoad(viewer, userId) {
    if (viewer.user.id !== userId && !canUseIncidents(viewer.perms)) {
      return { pagesThisWeek: 0, nightPages: 0 };
    }
    const st = useIncidents.getState();
    const user = useHub.getState().users.find((u) => u.id === userId);
    const tz = user?.timezone ?? 'UTC';
    return pageLoadFor(st.pages, userId, tz, Date.now());
  },
};
