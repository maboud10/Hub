/**
 * Security Center ("Bastion") — Tab 4: Vulnerabilities & CVEs
 * CVSS 3.1 prioritization, CISA KEV active-exploitation badges, 1-click hotfix patching,
 * and cross-app remediation task creation in Projects & Forge DevHub.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Bug,
  CheckCircle2,
  ExternalLink,
  Flame,
  GitPullRequest,
  ListTodo,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoSearch,
  NeoTabs,
} from '@/components/neo';
import { SEED_CVES } from '@/security/seed';
import { useSecurity } from '@/security/store';
import type { Severity } from '@/security/types';
import {
  createSecurityRemediationTask,
  SeverityBadge,
  useSecurityModals,
} from './parts';

export function VulnerabilitiesView() {
  const { openNova } = useSecurityModals();
  const patchedCves = useSecurity((s) => s.patchedCves);
  const refs = useSecurity((s) => s.refs);
  const patchCve = useSecurity((s) => s.patchCve);
  const patchAllCriticalCves = useSecurity((s) => s.patchAllCriticalCves);

  const [sevFilter, setSevFilter] = useState<'all' | Severity>('all');
  const [onlyExploited, setOnlyExploited] = useState(false);
  const [search, setSearch] = useState('');

  const openCves = SEED_CVES.filter((c) => !patchedCves.includes(c.id));
  const criticalOpen = openCves.filter((c) => c.severity === 'critical').length;
  const exploitedOpen = openCves.filter((c) => c.exploited).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SEED_CVES.filter((c) => {
      if (sevFilter !== 'all' && c.severity !== sevFilter) return false;
      if (onlyExploited && !c.exploited) return false;
      if (q && !`${c.id} ${c.service} ${c.title}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sevFilter, onlyExploited, search]);

  return (
    <div className="sec-view">
      <NeoKpis>
        <NeoKpi
          label="Open CVEs"
          value={openCves.length}
          sub={`${patchedCves.length} patched in current cycle`}
          icon={<Bug />}
          tone={openCves.length > 0 ? 'warning' : 'emerald'}
        />
        <NeoKpi
          label="Critical (CVSS >= 9.0)"
          value={criticalOpen}
          sub="72-hour SLA compliance gate"
          icon={<Flame />}
          tone={criticalOpen > 0 ? 'danger' : 'emerald'}
        />
        <NeoKpi
          label="CISA KEV Exploited"
          value={exploitedOpen}
          sub="Active perimeter probes detected"
          icon={<ShieldAlert />}
          tone={exploitedOpen > 0 ? 'danger' : 'emerald'}
        />
        <NeoKpi
          label="Fix Availability"
          value="86%"
          sub="Signed container base images ready"
          icon={<CheckCircle2 />}
          tone="cyan"
        />
      </NeoKpis>

      <NeoPanel
        hud="Software Composition & Container Advisory"
        title="Vulnerabilities & CVE Triage Catalog"
        icon={<Bug />}
        actions={
          <div className="sec-row-actions">
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() => openNova('Which critical CVE should we patch first?')}
            >
              <Sparkles size={13} />
              <span>Ask Nova Priority</span>
            </button>
            {criticalOpen > 0 && (
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--sm"
                onClick={patchAllCriticalCves}
                data-qa="sec-patch-all-critical"
              >
                <Wrench size={14} />
                <span>Patch All Critical CVEs</span>
              </button>
            )}
          </div>
        }
      >
        <div className="sec-vuln-toolbar">
          <NeoTabs
            label="Filter CVEs by severity"
            value={sevFilter}
            onChange={setSevFilter}
            items={[
              { value: 'all', label: 'All CVEs', count: SEED_CVES.length },
              { value: 'critical', label: 'Critical', count: SEED_CVES.filter((c) => c.severity === 'critical').length },
              { value: 'high', label: 'High', count: SEED_CVES.filter((c) => c.severity === 'high').length },
              { value: 'medium', label: 'Medium', count: SEED_CVES.filter((c) => c.severity === 'medium').length },
              { value: 'low', label: 'Low', count: SEED_CVES.filter((c) => c.severity === 'low').length },
            ]}
          />
          <div className="sec-row-actions">
            <Chip
              tone={onlyExploited ? 'danger' : 'slate'}
              size="sm"
              pressed={onlyExploited}
              onClick={() => setOnlyExploited((v) => !v)}
            >
              <span>CISA KEV Exploited Only</span>
            </Chip>
            <NeoSearch
              value={search}
              onChange={setSearch}
              placeholder="Search CVE ID, service, package…"
              size="sm"
            />
          </div>
        </div>

        <div className="sec-check-list">
          {filtered.length === 0 ? (
            <NeoEmpty icon={<CheckCircle2 />} title="No CVEs match your filter" compact />
          ) : (
            filtered.map((cve) => {
              const isPatched = patchedCves.includes(cve.id);
              const linkedRef = refs[cve.id];
              return (
                <div key={cve.id} className={`sec-check-row ${isPatched ? 'is-patched' : ''}`}>
                  <div className="sec-check-row__main">
                    <div className="sec-check-row__top">
                      <span className="neo-mono sec-cve-id">{cve.id}</span>
                      <SeverityBadge severity={cve.severity} />
                      <Chip tone={cve.cvss >= 9 ? 'danger' : cve.cvss >= 7 ? 'orange' : 'amber'} size="sm">
                        <span className="neo-mono">CVSS {cve.cvss.toFixed(1)}</span>
                      </Chip>
                      <Chip tone="cyan" size="sm">
                        <span className="neo-mono">{cve.service}</span>
                      </Chip>
                      {cve.exploited && (
                        <Chip tone="danger" size="sm" solid icon={<Flame size={11} />}>
                          <span>Exploited in the wild</span>
                        </Chip>
                      )}
                      {isPatched && (
                        <Chip tone="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
                          <span>Patched</span>
                        </Chip>
                      )}
                    </div>
                    <div className="sec-check-row__title">{cve.title}</div>
                    <div className="sec-check-row__rem">
                      <span>Discovered </span>
                      <span>{cve.foundDaysAgo}</span>
                      <span>d ago · </span>
                      <span>{cve.fixAvailable ? 'Upstream patch image verified in Forge CI' : 'WAF virtual patch rule active'}</span>
                    </div>
                  </div>

                  <div className="sec-check-row__actions">
                    {!isPatched ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() => patchCve(cve.id)}
                        data-qa={`sec-patch-${cve.id}`}
                      >
                        <Wrench size={13} />
                        <span>Deploy Hotfix</span>
                      </button>
                    ) : (
                      <Chip tone="emerald" size="sm" icon={<CheckCircle2 size={12} />}>
                        <span>Rolled Out</span>
                      </Chip>
                    )}

                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--xs"
                      onClick={() =>
                        createSecurityRemediationTask(
                          `Patch ${cve.id} on ${cve.service} (CVSS ${cve.cvss})`,
                          cve.title,
                          cve.id,
                        )
                      }
                    >
                      <ListTodo size={13} />
                      <span>Create Task</span>
                    </button>

                    {linkedRef && (
                      <Link to={linkedRef.to} className="neo-btn neo-btn--ghost neo-btn--xs">
                        <span>{linkedRef.label}</span>
                        <ExternalLink size={12} />
                      </Link>
                    )}

                    <Link to="/devhub/pipelines" className="neo-btn neo-btn--ghost neo-btn--xs">
                      <GitPullRequest size={13} />
                      <span>Forge CI</span>
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </NeoPanel>
    </div>
  );
}
