/**
 * Stratos · Cloud Console — Self-Service Infrastructure Provisioning view.
 * Includes the 5-stage NeoTracker journey:
 * Draft & sizing → Policy & security check → FinOps budget check → Terraform plan & apply → Live & monitored
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Code2,
  Cpu,
  KeyRound,
  Lock,
  Play,
  Plus,
  Rocket,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoPanel, NeoTracker } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { useSessionUser } from '@/store/selectors';
import { useCloudCapabilities } from '@/cloud/access';
import {
  PROVISION_STEPS,
  buildDefaultProvisionSpec,
  estimateProvisionMonthlyUsd,
  evaluateProvisionPolicies,
  provisionJourneyStage,
} from '@/cloud/engine';
import {
  REGIONS,
  REGION_BY_ID,
  TEAMS,
  TEAM_BY_ID,
  TEMPLATES,
  TEMPLATE_BY_ID,
} from '@/cloud/seed';
import { useCloud } from '@/cloud/store';
import type { DataClass, Env, PolicyId, ProvisionSpec, ProvisionTemplate, RegionId, TeamId } from '@/cloud/types';
import { PolicyBadge, RegionBadge } from './parts';

const POLICY_LABELS: Record<PolicyId, string> = {
  tags: 'Showback tags',
  encryption: 'KMS encryption',
  residency: 'Data residency',
  public: 'Public access block',
  budget: 'FinOps budget gate',
};

export function ProvisioningView() {
  const [params] = useSearchParams();
  const me = useSessionUser();
  const caps = useCloudCapabilities();
  const data = useCloud();
  const now = useNow(1500);

  const [spec, setSpec] = useState<ProvisionSpec>(() => buildDefaultProvisionSpec('postgres', 'payments'));

  const paramReg = params.get('region') as RegionId | null;
  useEffect(() => {
    if (paramReg && REGION_BY_ID[paramReg]) {
      setSpec((s) => ({
        ...s,
        region: paramReg,
        dataClass:
          paramReg === 'me-central-1'
            ? 'uae-personal'
            : paramReg === 'eu-west-2'
              ? 'eu-personal'
              : 'internal',
      }));
    }
  }, [paramReg]);

  const selectTemplate = (tplId: ProvisionTemplate) => {
    const tpl = TEMPLATE_BY_ID[tplId];
    setSpec((s) => ({
      ...s,
      template: tplId,
      size: tpl.defaultSize,
      name: `${s.team}-${tplId === 'gpu-notebook' ? 'notebook' : tplId}-01`,
      hoursPerDay: tplId === 'gpu-notebook' ? 8 : undefined,
    }));
  };

  const selectTeam = (team: TeamId) => {
    const tDef = TEAM_BY_ID[team];
    setSpec((s) => ({
      ...s,
      team,
      name: `${team}-${s.template === 'gpu-notebook' ? 'notebook' : s.template}-01`,
      tags: { ...s.tags, team, 'cost-center': tDef.costCenter },
    }));
  };

  const tpl = TEMPLATE_BY_ID[spec.template];
  const monthlyUsd = estimateProvisionMonthlyUsd(spec);
  const checks = evaluateProvisionPolicies(spec);
  const hasFail = checks.some((c) => c.outcome === 'fail');
  const hasWarn = checks.some((c) => c.outcome === 'warn');
  const reg = REGION_BY_ID[spec.region];

  // Live draft stage on the 5-stage tracker before submitting
  const draftCurrent = hasFail ? 1 : hasWarn ? 2 : 2;
  const draftState = hasFail ? 'blocked' : 'active';

  const handleSubmit = () => {
    data.submitProvisionRequest(spec, me?.id ?? 'u-priya');
  };

  const terraformHcl = `module "${spec.name.replace(/[^a-z0-9_]/gi, '_')}" {
  source      = "git::ssh://git@helix.co/infra/modules//${spec.template}?ref=v4.8.0"
  name        = "${spec.name}"
  region      = "${spec.region}"
  instance    = "${spec.size}"
  environment = "${spec.env}"
  kms_cmk     = ${spec.encrypted}
  public      = ${spec.publicAccess}
  tags = {
    team        = "${spec.tags.team ?? ''}"
    env         = "${spec.tags.env ?? ''}"
    cost_center = "${spec.tags['cost-center'] ?? ''}"
    owner       = "${spec.tags.owner ?? ''}"
    data_class  = "${spec.dataClass}"
  }
}`;

  return (
    <div className="cloud-provisioning">
      <NeoTracker
        hud="5-Stage Infrastructure Delivery Journey"
        title={`Drafting ${spec.name} · ${tpl.label} in ${reg.name} (${spec.region})`}
        steps={PROVISION_STEPS.map((s) => ({ label: s.label, sub: s.sub }))}
        current={draftCurrent}
        state={draftState}
        progress={hasFail ? 0.35 : 0.72}
        eta={`$${monthlyUsd}/mo · ${reg.gridIntensity} gCO₂e/kWh`}
        message={
          hasFail
            ? 'One or more OPA security or data-residency policies are failing — resolve below to unlock Terraform apply.'
            : hasWarn
              ? 'All security & residency checks pass. FinOps lead approval will be auto-requested on submit.'
              : 'All 5 policy, residency and budget checks pass — ready for zero-touch Terraform apply.'
        }
      />

      <div className="cloud-prov-grid">
        {/* Left column: Template & Spec Builder */}
        <NeoPanel
          hud="Step 1 · Golden infrastructure templates"
          title="Configure Cloud Resource"
          icon={<Cpu />}
        >
          <div className="cloud-tpl-grid" role="radiogroup" aria-label="Resource templates">
            {TEMPLATES.map((t) => {
              const active = t.id === spec.template;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`cloud-tpl-card neo-spot ${active ? 'is-active' : ''}`}
                  onClick={() => selectTemplate(t.id)}
                  data-qa={`tpl-${t.id}`}
                >
                  <strong>{t.label}</strong>
                  <span>{t.sub}</span>
                </button>
              );
            })}
          </div>

          <div className="cloud-form-grid">
            <label className="cloud-field">
              <span className="neo-hud">Resource identifier</span>
              <input
                className="neo-input neo-mono"
                value={spec.name}
                onChange={(e) => setSpec({ ...spec, name: e.target.value })}
              />
            </label>

            <label className="cloud-field">
              <span className="neo-hud">Owning team & cost center</span>
              <select
                className="neo-input"
                value={spec.team}
                onChange={(e) => selectTeam(e.target.value as TeamId)}
              >
                {TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.costCenter})
                  </option>
                ))}
              </select>
            </label>

            <label className="cloud-field">
              <span className="neo-hud">Target region</span>
              <select
                className="neo-input"
                value={spec.region}
                onChange={(e) => setSpec({ ...spec, region: e.target.value as RegionId })}
              >
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.id} ({Math.round(r.cfe * 100)}% CFE)
                  </option>
                ))}
              </select>
            </label>

            <label className="cloud-field">
              <span className="neo-hud">Capacity tier & SKU</span>
              <select
                className="neo-input"
                value={spec.size}
                onChange={(e) => setSpec({ ...spec, size: e.target.value })}
              >
                {tpl.sizes.map((sz) => (
                  <option key={sz.id} value={sz.id}>
                    {sz.id} — {sz.specs} (${sz.hourlyUsd}/h)
                  </option>
                ))}
              </select>
            </label>

            <label className="cloud-field">
              <span className="neo-hud">Environment</span>
              <select
                className="neo-input"
                value={spec.env}
                onChange={(e) => {
                  const env = e.target.value as Env;
                  setSpec({ ...spec, env, tags: { ...spec.tags, env } });
                }}
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="dev">Development</option>
              </select>
            </label>

            <label className="cloud-field">
              <span className="neo-hud">Data residency class</span>
              <select
                className="neo-input"
                value={spec.dataClass}
                onChange={(e) => setSpec({ ...spec, dataClass: e.target.value as DataClass })}
              >
                <option value="uae-personal">UAE personal data (me-central-1)</option>
                <option value="eu-personal">EU/UK personal data (eu-west-2)</option>
                <option value="confidential">Confidential</option>
                <option value="internal">Internal</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>

          <div className="cloud-toggles-row">
            <label className="cloud-check">
              <input
                type="checkbox"
                checked={spec.encrypted}
                onChange={(e) => setSpec({ ...spec, encrypted: e.target.checked })}
              />
              <Lock />
              <span>Encrypt at rest with KMS customer-managed key</span>
            </label>
            <label className="cloud-check">
              <input
                type="checkbox"
                checked={spec.publicAccess}
                onChange={(e) => setSpec({ ...spec, publicAccess: e.target.checked })}
              />
              <span>Allow public internet endpoint</span>
            </label>
          </div>

          <div className="cloud-tags-editor">
            <div className="neo-hud">Required FinOps showback tags</div>
            <div className="cloud-tags-editor__grid">
              {(['team', 'env', 'cost-center', 'owner'] as const).map((k) => (
                <label key={k} className="cloud-field">
                  <span className="neo-mono" data-no-translate="true">
                    {k}
                  </span>
                  <input
                    className="neo-input neo-input--sm neo-mono"
                    value={spec.tags[k] ?? ''}
                    onChange={(e) =>
                      setSpec({
                        ...spec,
                        tags: { ...spec.tags, [k]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </NeoPanel>

        {/* Right column: Policy Guardrails & Terraform HCL Preview */}
        <NeoPanel
          hud="Step 2 & 3 · OPA & FinOps Guardrails"
          title="Policy & Budget Evaluation"
          icon={<ShieldCheck />}
          actions={
            <Chip tone={hasFail ? 'rose' : hasWarn ? 'amber' : 'emerald'} size="sm">
              <span className="neo-mono" data-no-translate="true">
                ${monthlyUsd}/mo
              </span>
            </Chip>
          }
        >
          <div className="cloud-policy-list">
            {checks.map((chk) => (
              <div key={chk.id} className="cloud-policy-item">
                <div className="cloud-policy-item__top">
                  <strong>{POLICY_LABELS[chk.id]}</strong>
                  <PolicyBadge outcome={chk.outcome} />
                </div>
                <div className="cloud-policy-item__detail">
                  <span>{chk.detail}</span>
                  {chk.values && chk.values.length > 0 && (
                    <span className="neo-mono" data-no-translate="true">
                      {' '}
                      ({chk.values.join(', ')})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="cloud-subhead">
            <Code2 />
            <span>Generated Terraform HCL</span>
          </div>
          <pre className="cloud-hcl neo-mono" data-no-translate="true">
            {terraformHcl}
          </pre>

          <div className="cloud-prov-submit">
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--block"
              disabled={!caps.canProvision}
              onClick={handleSubmit}
              data-qa="submit-provision-btn"
            >
              <Rocket />
              <span>Run Terraform Plan & Provision</span>
            </button>
          </div>
        </NeoPanel>
      </div>

      {/* Provisioning Requests Queue */}
      <NeoPanel
        hud="Step 4 & 5 · Terraform execution & Vault credential delivery"
        title="Provisioning Requests & Live Trackers"
        icon={<Terminal />}
      >
        {data.requests.length === 0 ? (
          <NeoEmpty
            icon={<Plus />}
            title="No provisioning requests submitted in this session"
            compact
          >
            <span>Configure a template above and click Run Terraform Plan & Provision to launch a tracked deployment.</span>
          </NeoEmpty>
        ) : (
          <div className="cloud-req-list">
            {data.requests.map((req) => {
              const st = provisionJourneyStage(req, now);
              return (
                <div key={req.id} className="cloud-req-card" data-qa={`prov-req-${req.id}`}>
                  <NeoTracker
                    bare
                    hud={`${TEMPLATE_BY_ID[req.spec.template].label} · ${req.spec.size}`}
                    title={
                      <span className="neo-mono" data-no-translate="true">
                        {req.spec.name}
                      </span>
                    }
                    steps={PROVISION_STEPS.map((s) => ({ label: s.label, sub: s.sub }))}
                    current={st.current}
                    state={st.state}
                    progress={st.progress}
                    eta={`$${req.monthlyUsd}/mo`}
                    message={st.message}
                    actions={
                      <div className="cloud-panel-actions">
                        <RegionBadge regionId={req.spec.region} />
                        {st.state !== 'done' && !req.cancelled && (
                          <>
                            <button
                              type="button"
                              className="neo-btn neo-btn--xs neo-btn--plasma"
                              onClick={() => data.completeProvisionRequest(req.id)}
                              data-qa={`complete-req-${req.id}`}
                            >
                              <Play />
                              <span>Fast-forward apply</span>
                            </button>
                            <button
                              type="button"
                              className="neo-btn neo-btn--xs neo-btn--ghost"
                              onClick={() => data.cancelProvisionRequest(req.id)}
                            >
                              <XCircle />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}
                        {st.state === 'done' && (
                          <Link to="/vault/secrets" className="neo-btn neo-btn--xs neo-btn--soft">
                            <KeyRound />
                            <span>Open in Vault</span>
                          </Link>
                        )}
                      </div>
                    }
                  />
                  <div className="cloud-req-card__foot">
                    <CheckCircle2 />
                    <span>Vault secret lease path:</span>
                    <code className="neo-mono" data-no-translate="true">
                      {req.vaultPath}
                    </code>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </NeoPanel>
    </div>
  );
}
