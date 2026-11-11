/**
 * Security Center — "Bastion"
 * NEO shell for /security/* with 6 tabs:
 *  1. My Security (/security)
 *  2. Threat Queue (/security/threats)
 *  3. Posture & Attack Surface (/security/posture)
 *  4. Vulnerabilities (/security/vulnerabilities)
 *  5. Compliance & Evidence (/security/compliance)
 *  6. DLP & Phishing Radar (/security/dlp)
 * Plus ?report=1 suspicious signal intake modal and Nova Security Copilot drawer.
 */
import '@/styles/neo.css';
import '@/styles/security.css';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Bug,
  FileCheck2,
  KeyRound,
  Radar,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  NeoAppFrame,
  NeoTabs,
  isNavActive,
  type NeoNavItem,
} from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useSessionUser } from '@/store/selectors';
import { SEED_CVES } from '@/security/seed';
import { useSecurity } from '@/security/store';
import { ComplianceView } from './ComplianceView';
import { DlpPhishingView } from './DlpPhishingView';
import { MySecurityView } from './MySecurityView';
import { PostureView } from './PostureView';
import { ReportModal } from './ReportModal';
import { ThreatsView } from './ThreatsView';
import { VulnerabilitiesView } from './VulnerabilitiesView';
import { NovaSecurityDrawer, SecurityModalCtx } from './parts';

const SECURITY_TINT = { c1: '#f472b6', c2: '#e11d48' };

type TabPath =
  | '/security'
  | '/security/threats'
  | '/security/posture'
  | '/security/vulnerabilities'
  | '/security/compliance'
  | '/security/dlp';

interface SectionMeta {
  to: TabPath;
  end?: boolean;
  icon: ReactNode;
  label: string;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/security',
    end: true,
    icon: <ShieldCheck />,
    label: 'My Security',
    eyebrow: 'Security deck',
    title: 'My Security Shield',
    sub: 'Your personal 0–100 zero-trust score across devices, passkeys, phishing resilience, policy attestations and Vault hygiene.',
  },
  {
    to: '/security/threats',
    icon: <Zap />,
    label: 'Threat Queue',
    eyebrow: 'Security deck · Threat Queue',
    title: 'SOC Threat Queue & Playbooks',
    sub: '5-stage Threat Response tracker mapped to MITRE ATT&CK tactics, 1-click containment playbooks and Incident Command escalation.',
  },
  {
    to: '/security/posture',
    icon: <ShieldAlert />,
    label: 'Posture & Attack Surface',
    eyebrow: 'Security deck · Posture & Attack Surface',
    title: 'Cross-Domain Posture & Attack Surface',
    sub: 'Live posture stitched across Endpoints, Cloud, Code, Secrets and Identity, plus external TLS perimeter and threat radar.',
  },
  {
    to: '/security/vulnerabilities',
    icon: <Bug />,
    label: 'Vulnerabilities',
    eyebrow: 'Security deck · Vulnerabilities',
    title: 'Vulnerabilities & CVE Triage',
    sub: 'CVSS 3.1 prioritization, CISA KEV active-exploitation tracking, 1-click hotfix rollouts and Forge CI remediation.',
  },
  {
    to: '/security/compliance',
    icon: <FileCheck2 />,
    label: 'Compliance & Evidence',
    eyebrow: 'Security deck · Compliance & Evidence',
    title: 'Compliance & Auditor Pack Generator',
    sub: 'Continuous readiness across ISO 27001, SOC 2 Type II, UAE IA / NESA and GDPR with automated cross-app evidence harvesting.',
  },
  {
    to: '/security/dlp',
    icon: <Radar />,
    label: 'DLP & Phishing Radar',
    eyebrow: 'Security deck · DLP & Phishing Radar',
    title: 'DLP & Phishing Radar',
    sub: 'Mail, Drive and GenAI data-loss interceptions, sovereign residency, department phishing drills and the Spot-the-Phish lab.',
  },
];

export function SecurityPage() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();

  const cases = useSecurity((s) => s.cases);
  const patchedCves = useSecurity((s) => s.patchedCves);
  const resetDemo = useSecurity((s) => s.resetDemo);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportPreset, setReportPreset] = useState<string | undefined>(undefined);
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaPrompt, setNovaPrompt] = useState('');

  const deepReport = params.get('report') === '1';
  useEffect(() => {
    if (deepReport) setReportOpen(true);
  }, [deepReport]);

  const openReport = useCallback((presetKind?: string) => {
    setReportPreset(presetKind);
    setReportOpen(true);
  }, []);

  const closeReport = useCallback(() => {
    setReportOpen(false);
    if (params.has('report')) {
      const next = new URLSearchParams(params);
      next.delete('report');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const openNova = useCallback((promptText?: string) => {
    if (promptText) setNovaPrompt(promptText);
    setNovaOpen(true);
  }, []);

  const closeNova = useCallback(() => setNovaOpen(false), []);

  const openThreatsCount = cases.filter((c) => !c.closed).length;
  const openCvesCount = SEED_CVES.filter((c) => !patchedCves.includes(c.id)).length;

  const items: NeoNavItem[] = useMemo(
    () => [
      {
        to: '/security',
        label: 'My Security',
        icon: <ShieldCheck />,
        end: true,
        title: 'Personal Security Score & Passkeys',
      },
      {
        to: '/security/threats',
        label: 'Threat Queue',
        icon: <Zap />,
        badge: openThreatsCount || null,
        badgeTone: 'danger',
        title: 'SOC Threat Queue & MITRE ATT&CK',
      },
      {
        to: '/security/posture',
        label: 'Posture & Surface',
        icon: <ShieldAlert />,
        title: 'Cross-Domain Posture & Attack Surface',
      },
      {
        to: '/security/vulnerabilities',
        label: 'Vulnerabilities',
        icon: <Bug />,
        badge: openCvesCount || null,
        title: 'Vulnerabilities & CVEs',
      },
      {
        to: '/security/compliance',
        label: 'Compliance',
        icon: <FileCheck2 />,
        title: 'ISO 27001, SOC 2, UAE IA & GDPR Evidence',
      },
      {
        to: '/security/dlp',
        label: 'DLP & Phishing',
        icon: <Radar />,
        title: 'DLP Events & Spot-the-Phish Radar',
      },
    ],
    [openThreatsCount, openCvesCount],
  );

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/security';

  const toolbar = (
    <div className="sec-top-toolbar">
      <NeoTabs<TabPath>
        label="Security Center sections"
        value={section.to}
        onChange={(to) => navigate(to)}
        items={SECTIONS.map((s) => ({
          value: s.to,
          label: s.label,
          icon: s.icon,
          count:
            s.to === '/security/threats'
              ? openThreatsCount
              : s.to === '/security/vulnerabilities'
                ? openCvesCount
                : undefined,
        }))}
      />
      <button
        type="button"
        className="neo-btn neo-btn--nova neo-btn--sm"
        onClick={() => openNova('Summarize active critical threats and top posture fixes')}
        data-qa="sec-nova-bar-btn"
      >
        <Sparkles size={14} />
        <span>Nova Security Brief</span>
      </button>
    </div>
  );

  const actions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetDemo}
        title="Reset Security Center demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={() => openReport('phishing')}
        data-qa="sec-report-btn"
      >
        <Siren />
        <span className="neo-btn__label">Report Something Suspicious</span>
      </button>
    </>
  );

  const ctxValue = useMemo(() => ({ openReport, openNova }), [openReport, openNova]);

  return (
    <SecurityModalCtx.Provider value={ctxValue}>
      <NeoAppFrame
        app="security"
        tint={SECURITY_TINT}
        className="security-page"
        brand={{ icon: <ShieldCheck />, label: 'Security Center', to: '/security' }}
        items={items}
        footer={[
          {
            to: '/vault',
            label: 'Aegis Vault',
            icon: <KeyRound />,
            title: 'Open Aegis Vault',
          },
          {
            to: '/incidents',
            label: 'Incidents',
            icon: <Siren />,
            title: 'Open Sentinel Incident Command',
          },
        ]}
        head={{
          icon: section.icon,
          eyebrow: section.eyebrow,
          title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
          sub: section.sub,
          actions,
        }}
        toolbar={toolbar}
        overlays={
          <>
            <ReportModal open={reportOpen} presetKind={reportPreset} onClose={closeReport} />
            <NovaSecurityDrawer
              open={novaOpen}
              prompt={novaPrompt}
              onClose={closeNova}
              onOpenReport={() => openReport('phishing')}
            />
          </>
        }
      >
        <Routes>
          <Route index element={<MySecurityView />} />
          <Route path="threats" element={<ThreatsView />} />
          <Route path="posture" element={<PostureView />} />
          <Route path="vulnerabilities" element={<VulnerabilitiesView />} />
          <Route path="compliance" element={<ComplianceView />} />
          <Route path="dlp" element={<DlpPhishingView />} />
          <Route path="awareness" element={<DlpPhishingView />} />
          <Route path="data" element={<DlpPhishingView />} />
          <Route path="*" element={<Navigate to="/security" replace />} />
        </Routes>
      </NeoAppFrame>
    </SecurityModalCtx.Provider>
  );
}

export default SecurityPage;
