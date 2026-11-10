import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Plus,
  Sparkles,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { Chip, NovaChip, Ring, Spark } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { SEED_USERS } from '@/data/users';
import { relativeTime } from '@/lib/format';
import { ProjectSigil, type SigilId } from '@/projects/sigils';
import { useHub } from '@/store/hub';
import type { User } from '@/types';
import {
  computeDealWinProbability,
  computeMeddpiccScore,
  formatCompactUsd,
  formatUsd,
  nextDealStage,
} from '@/crm/engine';
import {
  CRM_MODULES,
  DEAL_STAGES,
  MEDDPICC_PILLARS,
} from '@/crm/seed';
import { useCrm } from '@/crm/store';
import type {
  CrmModuleId,
  CrmRegion,
  DealStage,
  MeddpiccPillarId,
} from '@/crm/types';

const CRM_OWNER_IDS = [
  'u-noah',
  'u-aisha',
  'u-yusuf',
  'u-omar',
  'u-layla',
  'u-daniel',
  'u-sofia',
  'u-mei',
];

export function useCrmUsersMap(): Map<string, User> {
  const hubUsers = useHub((s) => s.users);
  return useMemo(() => {
    const list = hubUsers?.length ? hubUsers : SEED_USERS;
    const map = new Map<string, User>();
    for (const u of SEED_USERS) map.set(u.id, u);
    for (const u of list) map.set(u.id, u);
    return map;
  }, [hubUsers]);
}

export function StageBadge({ stage }: { stage: DealStage }) {
  const meta = DEAL_STAGES.find((s) => s.id === stage) ?? DEAL_STAGES[0];
  return (
    <Chip tone={meta.tone} size="sm">
      {meta.shortLabel}
    </Chip>
  );
}

/**
 * Interactive 8-Pillar MEDDPICC Coverage Bar
 * (`Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition`).
 */
export function MeddpiccBar({
  meddpicc,
  onToggle,
  compact = false,
}: {
  meddpicc: Record<MeddpiccPillarId, boolean>;
  onToggle?: (pillar: MeddpiccPillarId) => void;
  compact?: boolean;
}) {
  const score = computeMeddpiccScore(meddpicc);
  return (
    <div className={compact ? 'crm-medbar crm-medbar--compact' : 'crm-medbar'}>
      <div className="crm-medbar__cells" role="group" aria-label="MEDDPICC coverage">
        {MEDDPICC_PILLARS.map((p) => {
          const active = !!meddpicc[p.id];
          if (onToggle) {
            return (
              <button
                key={p.id}
                type="button"
                className={active ? 'crm-medbar__cell is-on' : 'crm-medbar__cell'}
                title={`${p.label}: ${active ? 'Verified ✓' : 'Gap — click to verify'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(p.id);
                }}
              >
                <span>{p.short}</span>
              </button>
            );
          }
          return (
            <span
              key={p.id}
              className={active ? 'crm-medbar__cell is-on' : 'crm-medbar__cell'}
              title={`${p.label}: ${active ? 'Verified ✓' : 'Open'}`}
            >
              <span>{p.short}</span>
            </span>
          );
        })}
      </div>
      <span className="crm-medbar__count" title={`${score.weightedScore}% weighted MEDDPICC score`}>
        {score.completedCount}/8
      </span>
    </div>
  );
}

export function DealInspectorDrawer({
  dealId,
  onClose,
}: {
  dealId: string | null;
  onClose: () => void;
}) {
  const deals = useCrm((s) => s.deals);
  const toggleMeddpicc = useCrm((s) => s.toggleMeddpicc);
  const moveDealStage = useCrm((s) => s.moveDealStage);
  const triggerDealNextBestAction = useCrm((s) => s.triggerDealNextBestAction);
  const usersMap = useCrmUsersMap();

  const deal = useMemo(
    () => (dealId ? deals.find((d) => d.id === dealId) ?? null : null),
    [deals, dealId],
  );

  if (!deal) return null;

  const winProb = computeDealWinProbability(deal);
  const medScore = computeMeddpiccScore(deal.meddpicc);
  const owner = usersMap.get(deal.ownerId) ?? SEED_USERS[0];
  const sponsor = usersMap.get(deal.execSponsorId) ?? SEED_USERS[0];
  const nextStage = nextDealStage(deal.stage);
  const nextStageMeta = DEAL_STAGES.find((s) => s.id === nextStage);

  return (
    <div className="crm-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="neo-plane crm-drawer"
        aria-label={`Deal 360 Inspector: ${deal.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="crm-drawer__head">
          <ProjectSigil icon={deal.sigil} color={deal.color} size={42} />
          <div className="crm-drawer__titles">
            <div className="crm-drawer__eyebrow">
              <StageBadge stage={deal.stage} />
              <Chip tone="slate" size="sm">{deal.region}</Chip>
              <Chip tone="slate" size="sm">{deal.segment}</Chip>
            </div>
            <h2 className="crm-drawer__title">{deal.title}</h2>
            <div className="crm-drawer__sub">
              <span>{deal.accountName}</span>
              <span>·</span>
              <span>Close {deal.closeDate}</span>
            </div>
          </div>
          <button
            type="button"
            className="neo-iconbtn"
            onClick={onClose}
            aria-label="Close Deal 360 Inspector"
          >
            <X />
          </button>
        </header>

        <div className="crm-drawer__body">
          {/* Top KPI & Neural Win Probability strip */}
          <div className="crm-drawer__hero">
            <div className="crm-drawer__metric">
              <span className="neo-hud">Annual Contract Value</span>
              <strong className="crm-drawer__acv">{formatUsd(deal.acv)}</strong>
              <span className="crm-drawer__hint">
                Weighted: {formatCompactUsd(Math.round((deal.acv * winProb) / 100))}
              </span>
            </div>

            <div className="crm-drawer__prob">
              <Ring
                value={winProb / 100}
                size={68}
                stroke={6}
                color={winProb >= 75 ? '#34d399' : winProb >= 55 ? '#fb923c' : '#f43f5e'}
              >
                {winProb}%
              </Ring>
              <div>
                <div className="neo-hud">Neural Win Prob</div>
                <div className="crm-drawer__prob-sub">
                  {medScore.completedCount}/8 MEDDPICC ({medScore.weightedScore}%)
                </div>
                <Spark data={deal.momentum} width={96} height={24} color={deal.color} />
              </div>
            </div>
          </div>

          {/* Stage progression track */}
          <div className="crm-stage-track" role="group" aria-label="Deal stage progression">
            {DEAL_STAGES.map((s) => {
              const active = s.id === deal.stage;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={active ? 'crm-stage-step is-active' : 'crm-stage-step'}
                  onClick={() => moveDealStage(deal.id, s.id)}
                >
                  <span className="crm-stage-step__dot" style={{ background: s.color }} />
                  <span>{s.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Nova Next-Best-Action Box */}
          <div className="crm-nba-card">
            <div className="crm-nba-card__head">
              <NovaChip>Nova Next-Best-Action</NovaChip>
              {deal.riskFlags.length > 0 && (
                <Chip tone="warning" size="sm" icon={<AlertTriangle />}>
                  {deal.riskFlags.length} Risk Flag{deal.riskFlags.length === 1 ? '' : 's'}
                </Chip>
              )}
            </div>
            <p className="crm-nba-card__text">{deal.nextBestAction}</p>
            {deal.riskFlags.length > 0 && (
              <ul className="crm-risk-list">
                {deal.riskFlags.map((rf, i) => (
                  <li key={i}>{rf}</li>
                ))}
              </ul>
            )}
            <div className="crm-nba-card__actions">
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--sm"
                onClick={() => triggerDealNextBestAction(deal.id)}
              >
                <Sparkles />
                <span>Trigger Nova Next-Best-Action</span>
              </button>
              {deal.stage !== 'won' && (
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => moveDealStage(deal.id, nextStage)}
                >
                  <ArrowRight />
                  <span>Advance to {nextStageMeta?.shortLabel ?? 'Next Stage'}</span>
                </button>
              )}
              {deal.stage !== 'won' && (
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm"
                  onClick={() => moveDealStage(deal.id, 'won')}
                >
                  <Award />
                  <span>Mark Closed Won</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive 8-Pillar MEDDPICC Matrix */}
          <section className="crm-drawer__section">
            <div className="crm-drawer__sec-head">
              <div>
                <div className="neo-hud">Interactive Qualification</div>
                <h3 className="crm-drawer__sec-title">
                  8-Pillar MEDDPICC Matrix ({medScore.completedCount}/8 Verified)
                </h3>
              </div>
              <Chip tone={medScore.completedCount >= 7 ? 'emerald' : medScore.completedCount >= 5 ? 'amber' : 'rose'} size="sm">
                Click any pillar to toggle & recalculate AI score
              </Chip>
            </div>

            <div className="crm-med-grid">
              {MEDDPICC_PILLARS.map((pillar) => {
                const checked = !!deal.meddpicc[pillar.id];
                const note = deal.meddpiccNotes[pillar.id] ?? pillar.description;
                return (
                  <button
                    key={pillar.id}
                    type="button"
                    className={checked ? 'crm-med-card is-checked' : 'crm-med-card'}
                    onClick={() => toggleMeddpicc(deal.id, pillar.id)}
                  >
                    <div className="crm-med-card__top">
                      <span className="crm-med-card__letter">{pillar.short}</span>
                      <span className="crm-med-card__name">{pillar.label}</span>
                      <span className="crm-med-card__weight">+{pillar.weight}pt</span>
                      <span className="crm-med-card__status">
                        {checked ? <CheckCircle2 /> : <Plus />}
                      </span>
                    </div>
                    <p className="crm-med-card__note">{note}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Deal Ownership & Buying Committee */}
          <section className="crm-drawer__section">
            <div className="neo-hud">Pod & Buying Committee</div>
            <div className="crm-owners-row">
              <div className="crm-owner-pill">
                <Avatar user={owner} size={28} presence />
                <div>
                  <div className="crm-owner-pill__name">{owner.name}</div>
                  <div className="crm-owner-pill__role">Account Executive · {owner.location}</div>
                </div>
              </div>
              <div className="crm-owner-pill">
                <Avatar user={sponsor} size={28} presence />
                <div>
                  <div className="crm-owner-pill__name">{sponsor.name}</div>
                  <div className="crm-owner-pill__role">Exec Sponsor · {sponsor.title}</div>
                </div>
              </div>
            </div>

            <div className="crm-stakeholders">
              {deal.stakeholders.map((st, i) => (
                <div key={i} className="crm-stakeholder">
                  <UserCheck className="crm-stakeholder__ico" />
                  <div className="grow">
                    <div className="crm-stakeholder__name">{st.name}</div>
                    <div className="crm-stakeholder__role">{st.role}</div>
                  </div>
                  <Chip
                    tone={
                      st.stance === 'champion'
                        ? 'emerald'
                        : st.stance === 'supporter'
                          ? 'cyan'
                          : st.stance === 'blocker'
                            ? 'rose'
                            : 'amber'
                    }
                    size="sm"
                  >
                    {st.stance}
                  </Chip>
                  <span className="crm-stakeholder__touch">{st.lastTouch}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Activity Telemetry Log */}
          <section className="crm-drawer__section">
            <div className="neo-hud">Autonomous Telemetry Log</div>
            <div className="crm-activity-list">
              {deal.activities.map((act) => {
                const actor = usersMap.get(act.actorId) ?? owner;
                return (
                  <div key={act.id} className="crm-activity-item">
                    <Avatar user={actor} size={24} />
                    <div className="grow">
                      <div className="crm-activity-item__text">{act.text}</div>
                      <div className="crm-activity-item__meta">
                        {actor.name} · {relativeTime(act.ts)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

const MODAL_SIGILS: SigilId[] = ['rocket', 'orbit', 'brain', 'shield-key', 'globe', 'satellite', 'bolt', 'heart'];

export function NewDealModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const accounts = useCrm((s) => s.accounts);
  const createDeal = useCrm((s) => s.createDeal);
  const usersMap = useCrmUsersMap();

  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? 'acc-neom');
  const [customAccountName, setCustomAccountName] = useState('');
  const [title, setTitle] = useState('Sovereign AI Copilot & Zero-Trust Mesh');
  const [region, setRegion] = useState<CrmRegion>('MENA & GCC');
  const [stage, setStage] = useState<DealStage>('discovery');
  const [acv, setAcv] = useState('1850000');
  const [closeDate, setCloseDate] = useState('2027-01-29');
  const [ownerId, setOwnerId] = useState('u-noah');
  const [targetModule, setTargetModule] = useState<CrmModuleId>('novaCopilot');
  const [sigil, setSigil] = useState<SigilId>('rocket');

  if (!open) return null;

  const selectedAccount = accounts.find((a) => a.id === accountId);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const accountName =
      accountId === '__custom__'
        ? customAccountName.trim() || 'Enterprise Prospect'
        : selectedAccount?.name ?? 'NEOM Cognitive Mobility';

    createDeal({
      title: title.trim() || `${accountName} · Helix Expansion`,
      accountId: accountId === '__custom__' ? undefined : accountId,
      accountName,
      sigil: selectedAccount?.sigil ?? sigil,
      color: selectedAccount?.color ?? '#fb923c',
      stage,
      region: selectedAccount?.region ?? region,
      segment: selectedAccount?.segment ?? 'Enterprise',
      acv: Number(acv) || 1_500_000,
      closeDate,
      ownerId,
      targetModule,
    });
    onClose();
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="neo-plane crm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="New Enterprise Deal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="crm-modal__head">
          <div className="crm-modal__titles">
            <div className="neo-hud">Helix Revenue Orbit</div>
            <h2 className="crm-modal__title">Launch New Pipeline Opportunity</h2>
          </div>
          <button type="button" className="neo-iconbtn" onClick={onClose} aria-label="Close modal">
            <X />
          </button>
        </header>

        <form className="crm-modal__form" onSubmit={onSubmit}>
          <div className="crm-form-grid">
            <label className="crm-field">
              <span className="neo-hud">Enterprise Account</span>
              <select
                className="neo-input"
                value={accountId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAccountId(id);
                  const acc = accounts.find((a) => a.id === id);
                  if (acc) {
                    setRegion(acc.region);
                    setOwnerId(acc.ownerId);
                  }
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.region})
                  </option>
                ))}
                <option value="__custom__">+ New Logo Enterprise Account…</option>
              </select>
            </label>

            {accountId === '__custom__' ? (
              <label className="crm-field">
                <span className="neo-hud">New Account Name</span>
                <input
                  className="neo-input"
                  value={customAccountName}
                  onChange={(e) => setCustomAccountName(e.target.value)}
                  placeholder="e.g. Qiddiya Giga-Project"
                  required
                />
              </label>
            ) : (
              <label className="crm-field">
                <span className="neo-hud">Primary Expansion Module</span>
                <select
                  className="neo-input"
                  value={targetModule}
                  onChange={(e) => setTargetModule(e.target.value as CrmModuleId)}
                >
                  {CRM_MODULES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({formatCompactUsd(m.defaultExpansionArr)} avg ACV)
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="crm-field crm-field--full">
              <span className="neo-hud">Opportunity Title</span>
              <input
                className="neo-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. NEOM · Autonomous Fleet Nova AI Mesh"
                required
              />
            </label>

            <label className="crm-field">
              <span className="neo-hud">Annual Contract Value (USD)</span>
              <input
                type="number"
                className="neo-input"
                min={50000}
                step={50000}
                value={acv}
                onChange={(e) => setAcv(e.target.value)}
                required
              />
            </label>

            <label className="crm-field">
              <span className="neo-hud">Initial Stage</span>
              <select
                className="neo-input"
                value={stage}
                onChange={(e) => setStage(e.target.value as DealStage)}
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="crm-field">
              <span className="neo-hud">Region Pod</span>
              <select
                className="neo-input"
                value={selectedAccount ? selectedAccount.region : region}
                onChange={(e) => setRegion(e.target.value as CrmRegion)}
                disabled={!!selectedAccount}
              >
                <option value="MENA & GCC">MENA &amp; GCC</option>
                <option value="Europe">Europe</option>
                <option value="North America">North America</option>
                <option value="APAC">APAC</option>
              </select>
            </label>

            <label className="crm-field">
              <span className="neo-hud">Target Close Date</span>
              <input
                type="date"
                className="neo-input"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                required
              />
            </label>

            <label className="crm-field">
              <span className="neo-hud">Deal Owner (AE)</span>
              <select
                className="neo-input"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                {CRM_OWNER_IDS.map((uid) => {
                  const u = usersMap.get(uid);
                  if (!u) return null;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.title}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="crm-field">
              <span className="neo-hud">Identity Sigil</span>
              <div className="crm-sigil-picker">
                {MODAL_SIGILS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={sigil === s ? 'crm-sigil-btn is-selected' : 'crm-sigil-btn'}
                    onClick={() => setSigil(s)}
                  >
                    <ProjectSigil icon={s} color="#fb923c" size={26} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <footer className="crm-modal__foot">
            <button type="button" className="neo-btn neo-btn--soft" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="neo-btn neo-btn--plasma">
              <Zap />
              <span>Create Deal ({formatCompactUsd(Number(acv) || 0)})</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
