/**
 * Public App Bridge for Security Center ("Bastion") — implements SecurityBridge from src/lib/appBridge.ts.
 */
import { FileCheck2, Radar, ShieldAlert, ShieldCheck, Siren, Zap } from 'lucide-react';
import type { BridgeViewer, PaletteEntry, SecurityBridge } from '@/lib/appBridge';
import { viewerCapabilities } from './access';
import { computeOrgPosture, computePersonalShield } from './engine';
import { POLICIES, seedPersonalSecurity } from './seed';
import { useSecurity } from './store';

export const api: SecurityBridge = {
  appId: 'security',

  paletteEntries(viewer: BridgeViewer): PaletteEntry[] {
    const caps = viewerCapabilities(viewer);
    if (!caps.canAccess) return [];

    const state = useSecurity.getState();
    const entries: PaletteEntry[] = [
      {
        id: 'security:act:my-shield',
        group: 'Actions',
        title: 'My security score & passkeys',
        subtitle: 'Bastion · Personal Shield',
        icon: <ShieldCheck size={16} />,
        glyphColor: '#f472b6',
        keywords: ['security', 'score', 'mfa', 'passkey', 'shield', 'bastion'],
        hint: 'Open',
        to: '/security',
      },
      {
        id: 'security:act:report',
        group: 'Actions',
        title: 'Report something suspicious',
        subtitle: 'Bastion · 1-tap Phish & Incident Intake',
        icon: <Siren size={16} />,
        glyphColor: '#e11d48',
        keywords: ['report', 'phishing', 'suspicious', 'leak', 'lost device', 'soc'],
        hint: 'Report',
        to: '/security?report=1',
      },
      {
        id: 'security:act:threats',
        group: 'Actions',
        title: 'Open SOC Threat Queue',
        subtitle: 'Bastion · MITRE ATT&CK & Playbooks',
        icon: <Zap size={16} />,
        glyphColor: '#e11d48',
        keywords: ['threat', 'soc', 'mitre', 'incident', 'cases'],
        hint: 'Open',
        to: '/security/threats',
      },
      {
        id: 'security:act:compliance',
        group: 'Actions',
        title: 'Compliance & Auditor Pack',
        subtitle: 'Bastion · ISO 27001, SOC 2, UAE IA, GDPR',
        icon: <FileCheck2 size={16} />,
        glyphColor: '#f472b6',
        keywords: ['compliance', 'iso', 'soc2', 'nesa', 'gdpr', 'evidence', 'audit'],
        hint: 'Open',
        to: '/security/compliance',
      },
      {
        id: 'security:act:dlp',
        group: 'Actions',
        title: 'DLP & Phishing Radar',
        subtitle: 'Bastion · Mail & Drive DLP + Spot-the-Phish',
        icon: <Radar size={16} />,
        glyphColor: '#f472b6',
        keywords: ['dlp', 'phishing', 'radar', 'awareness', 'training'],
        hint: 'Open',
        to: '/security/dlp',
      },
    ];

    const visibleCases = caps.isSoc
      ? state.cases.slice(0, 6)
      : state.cases.filter((c) => c.reporterId === viewer.user.id || c.reporters.includes(viewer.user.id));

    for (const c of visibleCases) {
      entries.push({
        id: `security:case:${c.id}`,
        group: 'Work',
        title: `${c.id} · ${c.title}`,
        subtitle: `Bastion · ${c.severity.toUpperCase()} · ${c.stage}`,
        icon: <ShieldAlert size={16} />,
        glyphColor: c.severity === 'critical' ? '#ef4444' : '#f472b6',
        keywords: [c.id, c.kind, c.severity, ...c.mitre],
        hint: 'Inspect',
        to: `/security/threats?case=${c.id}`,
      });
    }

    return entries;
  },

  resetDemo() {
    useSecurity.getState().resetDemo();
  },

  postureScore(viewer: BridgeViewer): number {
    const caps = viewerCapabilities(viewer);
    if (!caps.canAccess) return 0;
    const state = useSecurity.getState();
    if (caps.isSoc) {
      return computeOrgPosture(state).score;
    }
    const person = state.people[viewer.user.id] ?? seedPersonalSecurity(viewer.user.id);
    const ackedIds = POLICIES.filter((p) => Boolean(state.acks[p.id]?.[viewer.user.id])).map((p) => p.id);
    return computePersonalShield(person, ackedIds).score;
  },

  reportSignal(viewer, input) {
    const caps = viewerCapabilities(viewer);
    if (!caps.canAccess) {
      return { ok: false, error: 'You do not have permission to access Security Center.' };
    }
    const title = input.title?.trim();
    if (!title) {
      return { ok: false, error: 'Signal title is required.' };
    }
    const { caseId } = useSecurity.getState().submitReport({
      reporterId: viewer.user.id,
      kind: input.kind,
      title,
      detail: input.detail,
      severity: input.severity,
      source: input.source ? { app: input.source.app, label: input.source.label, to: input.source.to } : undefined,
    });
    return {
      ok: true,
      caseId,
      to: `/security/threats?case=${caseId}`,
    };
  },
};
