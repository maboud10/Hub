/**
 * Public App Bridge for Stratos · Cloud Console (see src/lib/appBridge.ts).
 */
import { Activity, Cpu, Globe2, Plus, Server, Wallet, Zap } from 'lucide-react';
import type { CloudBridge, PaletteEntry } from '@/lib/appBridge';
import {
  buildBridgeServiceHealth,
  buildBridgeSpend,
  canUseCloud,
  computeCloudCapabilities,
  serviceTelemetry,
} from './engine';
import { REGIONS, SERVICES } from './seed';
import { useCloud } from './store';

export const api: CloudBridge = {
  appId: 'cloud',

  paletteEntries(viewer) {
    if (!canUseCloud(viewer.perms)) return [];
    const caps = computeCloudCapabilities(viewer.perms, viewer.user.department);
    const st = useCloud.getState();
    const spend = buildBridgeSpend(st, st.story);
    const out: PaletteEntry[] = [];

    const action = (
      id: string,
      title: string,
      to: string,
      icon: PaletteEntry['icon'],
      keywords: string[],
      subtitle?: string,
    ) =>
      out.push({
        id: `cloud:${id}`,
        group: 'Actions',
        title,
        subtitle,
        to,
        icon,
        keywords: ['cloud', 'stratos', 'infra', ...keywords],
        hint: 'Open',
        glyphColor: '#38bdf8',
      });

    action(
      'services',
      'Service health',
      '/cloud/services',
      <Activity />,
      ['slo', 'latency', 'error budget', 'services'],
      'SLOs, p95 latency & error budgets',
    );
    action(
      'finops',
      'FinOps spend & budgets',
      '/cloud/finops',
      <Wallet />,
      ['finops', 'cost', 'budget', 'anomalies', 'carbon', 'greenops'],
      `$${spend.mtdUsd.toLocaleString()} MTD · ${spend.anomalies} anomalies`,
    );
    action(
      'clusters',
      'Clusters & regions',
      '/cloud/clusters',
      <Globe2 />,
      ['regions', 'kubernetes', 'eks', 'drift', 'quotas'],
      '4 global regions · EKS, Aurora & Redis',
    );

    if (caps.canProvision) {
      action(
        'provision',
        'Provision a resource',
        '/cloud/resources?new=1',
        <Plus />,
        ['provision', 'terraform', 'database', 'postgres', 'redis', 'bucket', 'gpu'],
        'Self-service IaC with policy guardrails',
      );
    }
    if (caps.isEngineer) {
      action(
        'observability',
        'Observability & alerts',
        '/cloud/observability',
        <Zap />,
        ['logs', 'traces', 'alerts', 'root cause', 'nova'],
        'Live alerts, logs & distributed traces',
      );
    }

    for (const s of SERVICES) {
      const tel = serviceTelemetry(s.id, st.story);
      out.push({
        id: `cloud:service:${s.id}`,
        group: 'Work',
        title: `${s.name} (${s.id})`,
        subtitle: `${tel.status.toUpperCase()} · p95 ${tel.p95}ms · ${(s.slo.target * 100).toFixed(2)}% SLO`,
        icon: <Server />,
        glyphColor: tel.status === 'degraded' ? '#f59e0b' : '#38bdf8',
        keywords: ['cloud', 'service', s.id, s.name.toLowerCase(), s.team],
        hint: 'Inspect',
        to: `/cloud/services?service=${s.id}`,
      });
    }

    for (const r of REGIONS) {
      out.push({
        id: `cloud:region:${r.id}`,
        group: 'Work',
        title: `${r.name} · ${r.id}`,
        subtitle: `${r.city} · ${r.gridIntensity} gCO₂e/kWh · ${Math.round(r.cfe * 100)}% CFE`,
        icon: <Cpu />,
        glyphColor: '#0ea5e9',
        keywords: ['cloud', 'region', r.id, r.name.toLowerCase(), r.city.toLowerCase()],
        hint: 'Open region',
        to: `/cloud/clusters?region=${r.id}`,
      });
    }

    return out;
  },

  resetDemo() {
    useCloud.getState().resetDemo();
  },

  serviceHealth(viewer) {
    if (!canUseCloud(viewer.perms)) return [];
    const st = useCloud.getState();
    return buildBridgeServiceHealth(st.story);
  },

  spend(viewer) {
    if (!canUseCloud(viewer.perms)) {
      return { mtdUsd: 0, forecastUsd: 0, budgetUsd: 0, anomalies: 0 };
    }
    const st = useCloud.getState();
    return buildBridgeSpend(st, st.story);
  },
};
