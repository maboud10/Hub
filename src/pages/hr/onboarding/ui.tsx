/**
 * HR Portal onboarding building blocks shared by the onboarding board, the
 * journey detail and the onboarding widgets: progress ring, six-phase track,
 * start countdown, status badge, owner chips, task due state, journey roles
 * ("My tasks") and NEXUS account state. Styles: `.hr-onb-*` in hr.css.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { CircleCheckBig, KeyRound, Rocket, Sunrise } from 'lucide-react';
import type { OnboardingJourney, OnboardingPhase, OnboardingStatus, OnboardingTask, TaskOwner } from '@/talent/types';
import { OWNER_META, PHASE_META } from '@/talent/constants';
import * as access from '@/talent/access';
import { daysUntilStart, deriveJourneyStatus, journeyProgress, taskDueDate } from '@/talent/onboarding';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

export const DAY = 86_400_000;

export const startOfDay = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export const fmtShortDate = (ts: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(ts).toLocaleDateString(undefined, opts);

// ───────────────────────── progress ring ─────────────────────────
export function ProgressRing({ percent, size = 64, stroke = 6, label, sub, className }: { percent: number; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode; className?: string }) {
  const id = `hr-onb-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span className={cx('hr-onb-ring', className)} style={{ '--size': `${size}px` } as CSSProperties} role="img" aria-label={`${p}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--hr-1)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--hr-2)' }} />
          </linearGradient>
        </defs>
        <circle className="hr-onb-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="hr-onb-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="hr-onb-ring__label">
        {label ?? `${p}%`}
        {sub && <small>{sub}</small>}
      </span>
    </span>
  );
}

// ───────────────────────── phase track ─────────────────────────
/** Six segments (Pre-boarding → 90 days) filled by task completion; today's calendar phase glows. */
export function PhaseTrack({ journey, now, compact = false, onPick }: { journey: OnboardingJourney; now: number; compact?: boolean; onPick?: (phase: OnboardingPhase) => void }) {
  const prog = journeyProgress(journey, now);
  return (
    <ol className={cx('hr-onb-phases', compact && 'hr-onb-phases--compact')} aria-label="Onboarding phases">
      {prog.phases.map((p) => {
        const m = PHASE_META[p.phase];
        const current = prog.current === p.phase;
        const done = p.total > 0 && p.done === p.total;
        const title = `${m.label}: ${p.done}/${p.total} done${p.overdue ? ` · ${p.overdue} overdue` : ''}${current ? ' · current phase' : ''}`;
        const body = (
          <>
            <span className="hr-onb-phase__bar">
              <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
            </span>
            {!compact && (
              <span className="hr-onb-phase__label">
                {m.short}
                <span className="hr-onb-phase__count">
                  {p.done}/{p.total}
                </span>
              </span>
            )}
          </>
        );
        return (
          <li key={p.phase} className={cx('hr-onb-phase', current && 'is-current', done && 'is-done', p.overdue > 0 && 'is-overdue')} style={{ '--ph-h': m.hue } as CSSProperties} title={title}>
            {onPick ? (
              <button type="button" className="hr-onb-phase__btn" onClick={() => onPick(p.phase)} aria-label={title}>
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── countdown & status ─────────────────────────
export type Tone = 'info' | 'warning' | 'success' | 'accent' | 'danger' | 'muted';

/** "Starts in 9 days", "Starts tomorrow", "Day one today", "Day 27". */
export function countdown(j: OnboardingJourney, now: number): { label: string; short: string; tone: Tone; day?: number } {
  if (deriveJourneyStatus(j, now) === 'completed') return { label: 'Journey complete', short: 'Done', tone: 'success' };
  const d = daysUntilStart(j, now);
  if (d > 1) return { label: `Starts in ${d} days`, short: `T−${d}`, tone: 'info' };
  if (d === 1) return { label: 'Starts tomorrow', short: 'T−1', tone: 'warning' };
  if (d === 0) return { label: 'Day one today', short: 'Day 1', tone: 'success', day: 1 };
  return { label: `Day ${-d + 1}`, short: `Day ${-d + 1}`, tone: 'accent', day: -d + 1 };
}

export function Countdown({ journey, now, size = 'sm' }: { journey: OnboardingJourney; now: number; size?: 'sm' | 'lg' }) {
  const c = countdown(journey, now);
  const Icon = c.tone === 'success' && !c.day ? CircleCheckBig : c.day ? Sunrise : Rocket;
  return (
    <span className={cx('hr-onb-count', `hr-onb-count--${c.tone}`, size === 'lg' && 'hr-onb-count--lg')}>
      <Icon aria-hidden="true" />
      {c.label}
      {c.day && c.day <= 90 && <span className="hr-onb-count__of">of 90</span>}
    </span>
  );
}

export const STATUS_META: Record<OnboardingStatus, { label: string; tone: Tone; hint: string }> = {
  'pre-boarding': { label: 'Pre-boarding', tone: 'info', hint: 'Contract signed, day one ahead' },
  active: { label: 'Active', tone: 'accent', hint: 'Day one done, first 90 days' },
  completed: { label: 'Completed', tone: 'success', hint: 'Every step is done' },
};

export function StatusBadge({ status }: { status: OnboardingStatus }) {
  const m = STATUS_META[status];
  return <span className={cx('hr-onb-status', `hr-onb-status--${m.tone}`)}>{m.label}</span>;
}

/** Small tone pill used across the onboarding screens. */
export function Pill({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={cx('hr-onb-pill', `hr-onb-pill--${tone}`)} title={title}>
      {children}
    </span>
  );
}

// ───────────────────────── owners & tasks ─────────────────────────
export function OwnerChip({ owner, mine = false }: { owner: TaskOwner; mine?: boolean }) {
  const m = OWNER_META[owner];
  return (
    <span className={cx('hr-onb-owner', mine && 'is-mine')} style={{ '--ow-h': m.hue } as CSSProperties}>
      <i aria-hidden="true" />
      {m.label}
      {mine && <span className="hr-onb-owner__you">you</span>}
    </span>
  );
}

export type DueState = 'done' | 'overdue' | 'today' | 'soon' | 'later';

/** Due state of a task (overdue matches `journeyProgress`: due more than a day ago). */
export function dueState(j: OnboardingJourney, t: OnboardingTask, now: number): { state: DueState; label: string; at: number } {
  const at = taskDueDate(j, t);
  if (t.done) return { state: 'done', label: 'Done', at };
  const today = startOfDay(now);
  if (at < now - DAY) {
    const late = Math.max(1, Math.round((today - at) / DAY));
    return { state: 'overdue', label: `${late} day${late === 1 ? '' : 's'} overdue`, at };
  }
  if (at < today + DAY) return { state: 'today', label: 'Due today', at };
  const n = Math.round((at - today) / DAY);
  if (n < 4) return { state: 'soon', label: n === 1 ? 'Due tomorrow' : `Due in ${n} days`, at };
  return { state: 'later', label: `Due ${fmtShortDate(at)}`, at };
}

export function DueChip({ journey, task, now }: { journey: OnboardingJourney; task: OnboardingTask; now: number }) {
  const d = dueState(journey, task, now);
  return <span className={cx('hr-onb-due', `hr-onb-due--${d.state}`)}>{d.label}</span>;
}

export interface JourneyRoles {
  manager: boolean;
  buddy: boolean;
  newHire: boolean;
  ops: boolean;
}

export function journeyRoles(v: access.TalentViewer | null, j: OnboardingJourney): JourneyRoles {
  const me = v?.userId;
  return { manager: !!me && j.managerId === me, buddy: !!me && j.buddyId === me, newHire: !!me && j.hubUserId === me, ops: !!v && access.canManageOnboarding(v) };
}

export function isMyTask(roles: JourneyRoles, t: OnboardingTask) {
  return (t.owner === 'manager' && roles.manager) || (t.owner === 'buddy' && roles.buddy) || (t.owner === 'new-hire' && roles.newHire) || (roles.ops && (t.owner === 'people-ops' || t.owner === 'it'));
}

export function roleLabel(roles: JourneyRoles) {
  if (roles.newHire) return 'Your journey';
  if (roles.manager) return 'You’re the manager';
  if (roles.buddy) return 'You’re the buddy';
  if (roles.ops) return 'People Ops';
  return 'Viewer';
}

// ───────────────────────── people ─────────────────────────
export function JourneyAvatar({ journey, size = 40 }: { journey: Pick<OnboardingJourney, 'name' | 'avatarHue'>; size?: number }) {
  return <Avatar user={{ name: journey.name, avatarHue: journey.avatarHue }} size={size} />;
}

export function AccountState({ journey, compact = false }: { journey: OnboardingJourney; compact?: boolean }) {
  return journey.hubUserId ? (
    <span className="hr-onb-acct is-ready" title={journey.workEmail ? `NEXUS account · ${journey.workEmail}` : 'NEXUS account ready'}>
      <KeyRound aria-hidden="true" />
      {compact ? 'NEXUS ready' : (journey.workEmail ?? 'NEXUS account ready')}
    </span>
  ) : (
    <span className="hr-onb-acct is-pending" title="The NEXUS account, work email and SSO aren’t provisioned yet">
      <KeyRound aria-hidden="true" />
      {compact ? 'No account yet' : 'No NEXUS account yet'}
    </span>
  );
}
