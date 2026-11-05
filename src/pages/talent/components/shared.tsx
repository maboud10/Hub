/**
 * Shared Talent Hub building blocks used across every tab.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, Cloud, Database, Linkedin, Lock, Sparkles, type LucideIcon } from 'lucide-react';
import type { AiEngine, CandidateSource, OfferStatus, OutreachStatus, ReqPriority, ReqStatus, StageId } from '@/talent/types';
import { OFFER_STATUS_META, OUTREACH_STATUS_META, PRIORITY_META, REQ_STATUS_META, SOURCE_META, STAGE_BY_ID } from '@/talent/constants';
import { matchTier } from '@/talent/ai/match';
import { aiStatus } from '@/talent/ai/engine';
import { backendStatus } from '@/talent/backend';
import { getLinkedInConnector } from '@/talent/linkedin/connector';
import { useTalentCaps, useNextActions } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { useUserById } from '@/store/selectors';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { formatMoney } from './format';
import { runNextAction } from './actionRunner';

// ───────────────────────── match ring ─────────────────────────
const TIER_COLOR: Record<string, string> = {
  exceptional: '#34d399',
  strong: '#22d3ee',
  good: '#60a5fa',
  partial: '#fbbf24',
  low: '#94a3b8',
};

/** Circular fit score (0–100) with tier colour. */
export function MatchRing({ score, size = 44, stroke = 4, label = true, className }: { score: number; size?: number; stroke?: number; label?: boolean; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tier = matchTier(score);
  const color = TIER_COLOR[tier.tier];
  return (
    <span
      className={cx('match-ring', className)}
      style={{ '--size': `${size}px`, '--ring': color } as CSSProperties}
      role="img"
      aria-label={`${score}% match · ${tier.label}`}
      title={`${score}% · ${tier.label}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * Math.max(0, Math.min(100, score))) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
      </svg>
      {label && <span className="match-ring__value">{score}</span>}
    </span>
  );
}

// ───────────────────────── stage & source ─────────────────────────
export function StageBadge({ stage, size = 'sm', className }: { stage: StageId; size?: 'sm' | 'md'; className?: string }) {
  const m = STAGE_BY_ID[stage];
  const Icon = m.icon;
  return (
    <span className={cx('stage-badge', `stage-badge--${size}`, className)} style={{ '--stage-h': m.hue } as CSSProperties}>
      <Icon aria-hidden="true" />
      {m.label}
    </span>
  );
}

export function SourceBadge({ source, detail }: { source: CandidateSource; detail?: string }) {
  const m = SOURCE_META[source];
  const Icon = m.icon;
  return (
    <span className="source-badge" style={{ '--src-h': m.hue } as CSSProperties} title={detail ?? m.label}>
      <Icon aria-hidden="true" />
      {m.label}
    </span>
  );
}

// ───────────────────────── people ─────────────────────────
/** A NEXUS colleague (interviewer, hiring manager…) as a compact chip. */
export function PersonChip({ userId, label, size = 22 }: { userId: string | undefined; label?: string; size?: number }) {
  const u = useUserById(userId);
  if (!u) return <span className="person-chip person-chip--empty">{label ?? 'Unassigned'}</span>;
  return (
    <span className="person-chip" title={`${u.name} · ${u.title}`}>
      <Avatar user={u} size={size} />
      <span className="truncate">{label ?? u.name.split(' ')[0]}</span>
    </span>
  );
}

export function PeopleStack({ userIds, max = 4, size = 24 }: { userIds: string[]; max?: number; size?: number }) {
  return (
    <span className="people-stack">
      {userIds.slice(0, max).map((id) => (
        <StackAvatar key={id} id={id} size={size} />
      ))}
      {userIds.length > max && <span className="people-stack__more">+{userIds.length - max}</span>}
    </span>
  );
}

function StackAvatar({ id, size }: { id: string; size: number }) {
  const u = useUserById(id);
  return u ? (
    <span title={u.name}>
      <Avatar user={u} size={size} />
    </span>
  ) : null;
}

// ───────────────────────── compensation (permission-aware) ─────────────────────────
/** Shows money only to holders of `talent.comp.view`; everyone else sees a lock. */
export function Comp({ amount, currency, suffix, compact }: { amount: number | null | undefined; currency: string; suffix?: string; compact?: boolean }) {
  const caps = useTalentCaps();
  if (!caps.comp)
    return (
      <span className="redacted" title="Compensation is restricted to People Ops (View compensation)">
        <Lock aria-hidden="true" /> Restricted
      </span>
    );
  if (amount === null || amount === undefined) return <span className="faint">—</span>;
  return (
    <span className="comp">
      {formatMoney(amount, currency, { compact })}
      {suffix && <span className="faint"> {suffix}</span>}
    </span>
  );
}

// ───────────────────────── skills ─────────────────────────
export function SkillChips({
  skills,
  matched = [],
  missing = [],
  max = 8,
  size = 'sm',
}: {
  skills: string[];
  matched?: string[];
  missing?: string[];
  max?: number;
  size?: 'sm' | 'md';
}) {
  const m = new Set(matched.map((s) => s.toLowerCase()));
  const x = new Set(missing.map((s) => s.toLowerCase()));
  const list = skills.slice(0, max);
  return (
    <span className={cx('skill-chips', size === 'md' && 'skill-chips--md')}>
      {list.map((s) => (
        <span key={s} className={cx('skill-chip', m.has(s.toLowerCase()) && 'is-match', x.has(s.toLowerCase()) && 'is-missing')}>
          {m.has(s.toLowerCase()) && <Check aria-hidden="true" />}
          {s}
        </span>
      ))}
      {skills.length > max && <span className="skill-chip skill-chip--more">+{skills.length - max}</span>}
    </span>
  );
}

// ───────────────────────── system status ─────────────────────────
function StatusChip({ icon: Icon, label, detail, tone }: { icon: LucideIcon; label: ReactNode; detail: string; tone: 'ai' | 'local' | 'cloud' | 'linkedin' }) {
  return (
    <span className={cx('sys-chip', `sys-chip--${tone}`)} title={detail}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

/** AI engine · data backend · LinkedIn connector, honest about what's live. */
export function SystemStatusChips() {
  const ai = aiStatus();
  const be = backendStatus();
  const li = getLinkedInConnector();
  return (
    <span className="sys-chips">
      <StatusChip icon={Sparkles} tone="ai" label={ai.engine === 'gemini' ? ai.model : 'Offline AI'} detail={ai.detail} />
      <StatusChip icon={be.kind === 'firestore' ? Cloud : Database} tone={be.kind === 'firestore' ? 'cloud' : 'local'} label={be.kind === 'firestore' ? `Firestore · ${be.database}` : `Local · ${be.database} schema`} detail={be.detail} />
      <StatusChip icon={Linkedin} tone="linkedin" label={`LinkedIn · ${li.id === 'assisted' ? 'assisted' : 'RSC'}`} detail={li.description} />
    </span>
  );
}

export function EngineBadge({ engine }: { engine: AiEngine }) {
  return (
    <span className={cx('engine-badge', engine === 'gemini' && 'engine-badge--gemini')} title={engine === 'gemini' ? 'Generated by Gemini via Firebase AI Logic' : 'Generated by the NEXUS offline engine'}>
      <Sparkles aria-hidden="true" />
      {engine === 'gemini' ? 'Gemini' : 'Offline AI'}
    </span>
  );
}

// ───────────────────────── stepper ─────────────────────────
export interface StepDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
}

/** HUD-style step indicator for guided flows (wizard, sourcing studio). */
export function Stepper({ steps, current, onStep, maxReached = current }: { steps: StepDef[]; current: number; onStep?: (i: number) => void; maxReached?: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'idle';
        const Icon = s.icon;
        const clickable = !!onStep && i <= maxReached && i !== current;
        return (
          <li key={s.id} className={cx('stepper__item', `is-${state}`)} aria-current={state === 'active' ? 'step' : undefined}>
            <button type="button" className="stepper__btn" disabled={!clickable} onClick={() => clickable && onStep?.(i)} title={s.hint}>
              <span className="stepper__dot">{state === 'done' ? <Check aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : i + 1}</span>
              <span className="stepper__text">
                <span className="stepper__index">Step {i + 1}</span>
                <span className="stepper__label">{s.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── next action ─────────────────────────
/** The single most useful button for an application right now. */
export function NextActionButton({ applicationId, size = 'sm', className }: { applicationId: string; size?: 'sm' | 'md'; className?: string }) {
  const actions = useNextActions();
  const app = useTalent((s) => s.applications.find((a) => a.id === applicationId));
  const navigate = useNavigate();
  const action = actions.get(applicationId);
  if (!app || !action || action.kind === 'none') return null;
  return (
    <button
      type="button"
      className={cx('btn', size === 'sm' && 'btn--sm', action.waiting ? 'btn--ghost' : action.urgent ? 'btn--primary' : '', 'next-action', className)}
      onClick={(e) => {
        e.stopPropagation();
        runNextAction(action, app, navigate);
      }}
      title={action.detail}
    >
      {action.label}
    </button>
  );
}

// ───────────────────────── status badges ─────────────────────────
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function ToneBadge({ tone, children, icon: Icon, title }: { tone: Tone; children: ReactNode; icon?: LucideIcon; title?: string }) {
  return (
    <span className={cx('badge', `badge--${tone}`)} title={title}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  );
}

export function ReqStatusBadge({ status }: { status: ReqStatus }) {
  const m = REQ_STATUS_META[status];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}

export function PriorityBadge({ priority }: { priority: ReqPriority }) {
  const m = PRIORITY_META[priority];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const m = OFFER_STATUS_META[status];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}

export function OutreachStatusBadge({ status }: { status: OutreachStatus }) {
  const m = OUTREACH_STATUS_META[status];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}

/** Marks generated demo profiles so nobody mistakes them for real people. */
export function SampleTag() {
  return (
    <span className="tag sample-tag" title="Generated sample profile, not a real person">
      Sample
    </span>
  );
}

/** Candidates / prospects aren't NEXUS users but share the gradient avatar. */
export function CandidateAvatar({ person, size = 36 }: { person: { name: string; avatarHue: number }; size?: number }) {
  return <Avatar user={person} size={size} />;
}
