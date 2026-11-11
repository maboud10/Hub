/**
 * DevHub ("Forge") — ServicesView (/devhub/services)
 * Service catalog with ownership scorecards, dependency blast radius,
 * Golden-Path Service Scaffolder (NeoTracker), and cross-repo Code Search.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowUpRight,
  Boxes,
  Check,
  Cloud,
  Code2,
  FolderKanban,
  GitBranch,
  KeyRound,
  PlusCircle,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoPanel,
  NeoSearch,
  NeoTracker,
  Ring,
} from '@/components/neo';
import { useSessionUser } from '@/store/selectors';
import { useDevHubAccess } from '@/devhub/access';
import {
  dependents,
  highlightSegments,
  scorecardGrade,
  searchCode,
  WIZARD_STEPS,
} from '@/devhub/engine';
import type { WizardTemplate } from '@/devhub/types';
import { useDevHub } from '@/devhub/store';
import { UserPill, createProjectTaskFromDevhub } from './parts';

export function ServicesView() {
  const me = useSessionUser();
  const userId = me?.id ?? 'u-priya';
  const caps = useDevHubAccess();
  const [params, setParams] = useSearchParams();

  const services = useDevHub((s) => s.services);
  const owners = useDevHub((s) => s.owners);
  const files = useDevHub((s) => s.files);
  const wizard = useDevHub((s) => s.wizard);
  const startWizard = useDevHub((s) => s.startWizard);
  const advanceWizard = useDevHub((s) => s.advanceWizard);
  const clearWizard = useDevHub((s) => s.clearWizard);

  const [svcFilter, setSvcFilter] = useState('');
  const [codeQuery, setCodeQuery] = useState('RetryPolicy');
  const [wizName, setWizName] = useState('settlement-worker');
  const [wizTemplate, setWizTemplate] = useState<WizardTemplate>('go-service');
  const [wizTeam, setWizTeam] = useState('Payments');
  const [wizTier, setWizTier] = useState<1 | 2 | 3>(2);
  const [showWizard, setShowWizard] = useState(params.get('wizard') === '1');

  useEffect(() => {
    if (params.get('wizard') === '1') setShowWizard(true);
  }, [params]);

  const filteredServices = useMemo(() => {
    const q = svcFilter.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => `${s.id} ${s.team} ${s.language} ${s.description}`.toLowerCase().includes(q));
  }, [services, svcFilter]);

  const selectedId = params.get('service') ?? filteredServices[0]?.id ?? services[0]?.id;
  const svc = services.find((s) => s.id === selectedId) ?? filteredServices[0] ?? services[0];

  const codeHits = useMemo(() => searchCode(files, codeQuery, 15), [files, codeQuery]);

  if (!svc) return null;

  const grade = scorecardGrade(svc.scorecard);
  const downstream = dependents(services, svc.id);
  const svcOwners = owners.filter((o) => o.prefix.startsWith(svc.id));

  return (
    <div className="dh-stack">
      <div className="dh-toolbar-row">
        <NeoSearch
          value={svcFilter}
          onChange={setSvcFilter}
          placeholder="Filter services by name, team or language…"
          className="dh-search-wide"
        />
        {caps.canManageCatalog && (
          <button
            type="button"
            className="neo-btn neo-btn--plasma neo-btn--sm"
            onClick={() => {
              setShowWizard((v) => !v);
              if (!wizard) {
                startWizard({
                  name: wizName,
                  template: wizTemplate,
                  team: wizTeam,
                  tier: wizTier,
                  ownerId: userId,
                });
              }
            }}
          >
            <PlusCircle />
            <span>Scaffold Golden-Path Service</span>
          </button>
        )}
      </div>

      {/* Golden-Path Scaffolder Wizard */}
      {(showWizard || wizard) && (
        <NeoPanel
          hud="Golden-Path Service Scaffolder"
          title="Provision Production-Ready Service in 6 Steps"
          icon={<Sparkles />}
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--ghost neo-btn--xs"
              onClick={() => {
                setShowWizard(false);
                clearWizard();
              }}
            >
              <span>Close Wizard</span>
            </button>
          }
        >
          <div className="dh-wizard-form">
            <label className="dh-field">
              <span className="neo-hud">Service Slug</span>
              <input
                type="text"
                className="neo-input neo-input--sm"
                value={wizName}
                onChange={(e) => setWizName(e.target.value)}
              />
            </label>
            <label className="dh-field">
              <span className="neo-hud">Template</span>
              <select
                className="neo-input neo-input--sm"
                value={wizTemplate}
                onChange={(e) => setWizTemplate(e.target.value as WizardTemplate)}
              >
                <option value="go-service">Go gRPC/HTTP Service</option>
                <option value="ts-api">TypeScript Fastify API</option>
                <option value="py-worker">Python Event Worker</option>
                <option value="web-app">React + Vite Micro-Frontend</option>
              </select>
            </label>
            <label className="dh-field">
              <span className="neo-hud">Owning Team</span>
              <input
                type="text"
                className="neo-input neo-input--sm"
                value={wizTeam}
                onChange={(e) => setWizTeam(e.target.value)}
              />
            </label>
            <label className="dh-field">
              <span className="neo-hud">Reliability Tier</span>
              <select
                className="neo-input neo-input--sm"
                value={wizTier}
                onChange={(e) => setWizTier(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>Tier 1 (99.95% SLO)</option>
                <option value={2}>Tier 2 (99.9% SLO)</option>
                <option value={3}>Tier 3 (99.5% SLO)</option>
              </select>
            </label>
            <div className="dh-wizard-form__btns">
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={() =>
                  startWizard({
                    name: wizName,
                    template: wizTemplate,
                    team: wizTeam,
                    tier: wizTier,
                    ownerId: userId,
                  })
                }
              >
                <span>Reset Wizard</span>
              </button>
              {wizard && !wizard.done && (
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={() => advanceWizard()}
                >
                  <Check />
                  <span>Advance Next Step</span>
                </button>
              )}
            </div>
          </div>

          {wizard && (
            <NeoTracker
              bare
              hud={`Scaffolding helix/${wizard.name}`}
              steps={WIZARD_STEPS.map((label) => ({ id: label, label }))}
              current={wizard.step}
              state={wizard.done ? 'done' : 'active'}
              eta={wizard.done ? 'Registered in Catalog' : `Step ${wizard.step} of ${WIZARD_STEPS.length}`}
              message={
                wizard.done
                  ? `Service ${wizard.name} is live in the catalog with SLSA L3 CI, Cloud namespace, and Vault dynamic secret mount.`
                  : 'Running automated Terraform & repository bootstrap…'
              }
            />
          )}
        </NeoPanel>
      )}

      {/* Service Catalog Split View */}
      <div className="dh-split">
        <aside className="dh-split__list" aria-label="Services catalog list">
          {filteredServices.map((item) => {
            const g = scorecardGrade(item.scorecard);
            const active = item.id === svc.id;
            return (
              <button
                key={item.id}
                type="button"
                className="dh-list-card neo-spot"
                data-active={active || undefined}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('service', item.id);
                  setParams(next, { replace: true });
                }}
              >
                <div className="dh-list-card__top">
                  <span className="neo-mono dh-list-card__title">{item.id}</span>
                  <Chip tone={item.tier === 1 ? 'app' : 'slate'} size="sm">
                    <span>{`Tier ${item.tier}`}</span>
                  </Chip>
                  <Chip
                    tone={g.grade === 'A' ? 'success' : g.grade === 'B' ? 'app' : 'warning'}
                    size="sm"
                  >
                    <span className="neo-mono">{`${g.grade} · ${g.score}`}</span>
                  </Chip>
                </div>
                <div className="dh-list-card__meta">
                  <span>{item.team}</span>
                  <span>·</span>
                  <span className="neo-mono">{item.language}</span>
                  <span>·</span>
                  <span className="neo-mono">{item.version}</span>
                </div>
              </button>
            );
          })}
        </aside>

        <div className="dh-split__detail dh-stack">
          <NeoPanel
            hud={`${svc.repo} · ${svc.team} · ${svc.language}`}
            title={`${svc.id} (${svc.version})`}
            icon={<Boxes />}
            actions={
              <div className="dh-inline-actions">
                <Link to="/cloud/services" className="neo-btn neo-btn--soft neo-btn--xs">
                  <Cloud />
                  <span>Cloud Console</span>
                  <ArrowUpRight />
                </Link>
                <Link to="/incidents/oncall" className="neo-btn neo-btn--soft neo-btn--xs">
                  <Users />
                  <span>{svc.rotation}</span>
                  <ArrowUpRight />
                </Link>
                <Link to="/vault/secrets" className="neo-btn neo-btn--soft neo-btn--xs">
                  <KeyRound />
                  <span>Vault Secrets</span>
                  <ArrowUpRight />
                </Link>
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() =>
                    void createProjectTaskFromDevhub({
                      title: `Scorecard hardening for ${svc.id}`,
                      notes: svc.description,
                      to: `/devhub/services?service=${svc.id}`,
                      label: svc.id,
                      assigneeId: svc.ownerId,
                    })
                  }
                >
                  <FolderKanban />
                  <span>Task in Projects</span>
                </button>
              </div>
            }
          >
            <p className="dh-pr-body">{svc.description}</p>

            <div className="dh-scorecard-row">
              <div className="dh-scorecard-ring">
                <Ring value={grade.score / 100} size={76} stroke={7}>
                  <span className="neo-mono">{`${grade.grade} · ${grade.score}`}</span>
                </Ring>
                <div>
                  <div className="neo-hud">Production Readiness Scorecard</div>
                  <div className="dh-scorecard-sub">
                    <span>Owner: </span>
                    <UserPill userId={svc.ownerId} size={18} />
                    <span> · SLO </span>
                    <span className="neo-mono">{`${svc.sloTarget}%`}</span>
                    <span> · Baseline p95 </span>
                    <span className="neo-mono">{`${svc.baselineP95}ms`}</span>
                  </div>
                </div>
              </div>

              <div className="dh-scorecard-bars">
                <div className="dh-scorecard-metric">
                  <span>Test coverage</span>
                  <span className="neo-mono">{`${Math.round(svc.scorecard.coverage * 100)}%`}</span>
                  <Bar value={svc.scorecard.coverage} />
                </div>
                <div className="dh-scorecard-metric">
                  <span>Dependency freshness</span>
                  <span className="neo-mono">{`${Math.round(svc.scorecard.depsFreshness * 100)}%`}</span>
                  <Bar value={svc.scorecard.depsFreshness} />
                </div>
                <div className="dh-inline-actions">
                  <Chip tone={svc.scorecard.docs ? 'success' : 'warning'} size="sm">
                    <span>{svc.scorecard.docs ? 'Architecture docs verified' : 'Missing docs'}</span>
                  </Chip>
                  <Chip tone={svc.scorecard.runbook ? 'success' : 'danger'} size="sm">
                    <span>{svc.scorecard.runbook ? 'On-call runbook linked' : 'Missing runbook'}</span>
                  </Chip>
                  <Chip
                    tone={svc.scorecard.vulns.high > 0 ? 'warning' : 'success'}
                    size="sm"
                  >
                    <ShieldAlert />
                    <span>{`Vulns: ${svc.scorecard.vulns.critical}C / ${svc.scorecard.vulns.high}H / ${svc.scorecard.vulns.medium}M`}</span>
                  </Chip>
                </div>
              </div>
            </div>

            {/* Dependency Blast Radius & CODEOWNERS */}
            <div className="dh-grid-2">
              <div className="dh-subcard">
                <div className="neo-hud">Dependency Topology & Blast Radius</div>
                <div className="dh-dep-group">
                  <span>Depends on upstream:</span>
                  <div className="dh-inline-actions">
                    {svc.dependsOn.length === 0 ? (
                      <Chip tone="slate" size="sm">
                        <span>Zero upstream deps (foundational)</span>
                      </Chip>
                    ) : (
                      svc.dependsOn.map((dep) => (
                        <Link key={dep} to={`/devhub/services?service=${dep}`} className="neo-chip neo-chip--sm" data-tone="slate">
                          <GitBranch />
                          <span className="neo-mono">{dep}</span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
                <div className="dh-dep-group">
                  <span>Downstream dependents (blast radius):</span>
                  <div className="dh-inline-actions">
                    {downstream.length === 0 ? (
                      <Chip tone="slate" size="sm">
                        <span>Edge / leaf service</span>
                      </Chip>
                    ) : (
                      downstream.map((dep) => (
                        <Link key={dep} to={`/devhub/services?service=${dep}`} className="neo-chip neo-chip--sm" data-tone="app">
                          <Boxes />
                          <span className="neo-mono">{dep}</span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="dh-subcard">
                <div className="neo-hud">CODEOWNERS Stewardship</div>
                <div className="dh-owners-list">
                  {svcOwners.map((o) => (
                    <div key={o.prefix} className="dh-owner-row">
                      <span className="neo-mono">{o.prefix}</span>
                      <div className="dh-inline-actions">
                        {o.owners.map((ow) => (
                          <span key={ow.userId} className="dh-owner-share">
                            <UserPill userId={ow.userId} size={16} />
                            <span className="neo-mono">{`${Math.round(ow.share * 100)}%`}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </NeoPanel>

          {/* Cross-Repo Code Search */}
          <NeoPanel
            hud="Cross-Repository Symbol & Literal Index"
            title="Instant Code Search"
            icon={<Code2 />}
          >
            <div className="dh-toolbar-row">
              <NeoSearch
                value={codeQuery}
                onChange={setCodeQuery}
                placeholder="Search symbols or code (e.g. lang:go RetryPolicy, sym:rotate_signing_keys, ArabicNormalizer)…"
                className="dh-search-wide"
              />
              <div className="dh-inline-actions">
                {['lang:go RetryPolicy', 'sym:rotate_signing_keys', 'ArabicNormalizer', 'MaxAttempts'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="neo-chip neo-chip--sm"
                    data-tone={codeQuery === preset ? 'app' : 'slate'}
                    onClick={() => setCodeQuery(preset)}
                  >
                    <Search />
                    <span className="neo-mono">{preset}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="dh-code-hits" dir="ltr">
              {codeHits.map((hit, idx) => {
                const segs = highlightSegments(hit.text, hit.ranges);
                return (
                  <div key={`${hit.file.path}-${hit.line}-${idx}`} className="dh-code-hit">
                    <div className="dh-code-hit__meta">
                      <span className="neo-mono dh-code-hit__repo">{hit.file.repo}</span>
                      <span className="neo-mono dh-code-hit__path">{`${hit.file.path}:${hit.line}`}</span>
                      {hit.symbol && (
                        <Chip tone="app" size="sm">
                          <span className="neo-mono">{`${hit.symbol.kind} ${hit.symbol.name}`}</span>
                        </Chip>
                      )}
                    </div>
                    <pre className="dh-code-hit__line neo-mono">
                      {segs.map((s, si) =>
                        s.hit ? (
                          <mark key={si} className="dh-code-mark">
                            {s.text}
                          </mark>
                        ) : (
                          <span key={si}>{s.text}</span>
                        ),
                      )}
                    </pre>
                  </div>
                );
              })}
            </div>
          </NeoPanel>
        </div>
      </div>
    </div>
  );
}
