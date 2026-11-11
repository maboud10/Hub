/**
 * Allowances & claims: a budget meter per allowance (spent · pending · left)
 * with examples and a one-tap claim, plus the claims history from receipt to
 * payslip (status, reviewer note and the payroll it was paid with). Each claim
 * carries its tracker (receipt check → payroll → paid): full while it is in
 * flight, a compact bar once paid or declined.
 */
import { useMemo, type CSSProperties } from 'react';
import { Paperclip, Plus, Receipt, Wallet } from 'lucide-react';
import type { AllowanceId, BenefitClaim } from '@/hr/types';
import type { AllowanceMeta } from '@/hr/constants';
import { ALLOWANCE_BY_ID, ALLOWANCES, CLAIM_STATUS_META } from '@/hr/constants';
import type { AllowanceUsage } from '@/hr/engine';
import { useHr } from '@/hr/store';
import { useAllowanceUsage } from '@/hr/selectors';
import { claimTrack, type TrackContext } from '@/hr/trackers';
import { formatDay } from '@/hr/calendar';
import { useSessionUser, useUserById } from '@/store/selectors';
import { relativeTime } from '@/lib/format';
import { EmptyState } from '@/components/ui/primitives';
import { HrPanel, ToneBadge } from '../components/shared';
import { HrTracker, useTrackContext } from '../components/trackers';
import { aed, ALLOWANCES_TOTAL, money, payrollLabel } from './model';

const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);

export function AllowancesPanel({ onClaim }: { onClaim: (allowance?: AllowanceId) => void }) {
  const usage = useAllowanceUsage();
  const byId = useMemo(() => new Map(usage.map((u) => [u.id, u])), [usage]);
  const left = usage.reduce((n, u) => n + u.remaining, 0);
  return (
    <HrPanel
      className="hr-bn-allow-panel"
      hud="Yearly budgets"
      title="Allowances"
      icon={<Wallet aria-hidden="true" />}
      sub={`${aed(ALLOWANCES_TOTAL)} a year to grow, stay well and work comfortably. ${aed(left)} left to claim this year.`}
      actions={
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onClaim()}>
          <Plus aria-hidden="true" /> New claim
        </button>
      }
    >
      <div className="hr-bn-allowances">
        {ALLOWANCES.map((a) => (
          <AllowanceCard key={a.id} meta={a} usage={byId.get(a.id)} onClaim={() => onClaim(a.id)} />
        ))}
      </div>
    </HrPanel>
  );
}

function AllowanceCard({ meta, usage, onClaim }: { meta: AllowanceMeta; usage: AllowanceUsage | undefined; onClaim: () => void }) {
  const u = usage ?? { id: meta.id, budget: meta.annual, spent: 0, pending: 0, remaining: meta.annual };
  const Icon = meta.icon;
  return (
    <article className="hr-bn-allow" style={{ '--al-h': meta.hue } as CSSProperties}>
      <header className="hr-bn-allow__head">
        <span className="hr-bn-allow__icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="grow">
          <h3 className="hr-bn-allow__title">{meta.label}</h3>
          <span className="text-xs faint">{aed(u.budget)} a year</span>
        </div>
      </header>
      <div className="hr-bn-allow__left">
        <b>{aed(u.remaining)}</b>
        <span>left</span>
      </div>
      <div className="hr-bn-meter" role="img" aria-label={`${aed(u.spent)} spent, ${aed(u.pending)} pending, ${aed(u.remaining)} left of ${aed(u.budget)}`}>
        <span className="hr-bn-meter__spent" style={{ width: `${pct(u.spent, u.budget)}%` }} />
        <span className="hr-bn-meter__pending" style={{ width: `${pct(u.pending, u.budget)}%` }} />
      </div>
      <dl className="hr-bn-allow__legend">
        <div>
          <dt>
            <i className="is-spent" aria-hidden="true" />
            Spent
          </dt>
          <dd>{aed(u.spent)}</dd>
        </div>
        <div>
          <dt>
            <i className="is-pending" aria-hidden="true" />
            Pending
          </dt>
          <dd>{aed(u.pending)}</dd>
        </div>
      </dl>
      <p className="hr-bn-allow__desc">{meta.description}</p>
      <ul className="hr-bn-allow__examples" aria-label="Examples">
        {meta.examples.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <button type="button" className="btn btn--sm btn--block hr-bn-allow__cta" onClick={onClaim} disabled={u.remaining <= 0}>
        <Receipt aria-hidden="true" /> {u.remaining > 0 ? `Claim ${meta.label.toLowerCase()}` : 'Fully used this year'}
      </button>
    </article>
  );
}

export function ClaimsHistory({ onClaim }: { onClaim: (allowance?: AllowanceId) => void }) {
  const me = useSessionUser();
  const claims = useHr((s) => s.claims);
  const mine = useMemo(() => (me ? claims.filter((c) => c.userId === me.id).sort((a, b) => b.createdAt - a.createdAt) : []), [claims, me]);
  const pending = mine.filter((c) => c.status === 'submitted').length;
  const trackCtx = useTrackContext();
  return (
    <HrPanel
      className="hr-bn-claims-panel"
      hud="Reimbursements"
      title="My claims"
      icon={<Receipt aria-hidden="true" />}
      sub={mine.length ? `From receipt to payslip. ${pending ? `${pending} waiting for People Ops.` : 'Nothing waiting right now.'}` : 'Every claim you make shows up here, all the way to your payslip.'}
    >
      {mine.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No claims yet"
          action={
            <button type="button" className="btn btn--sm btn--primary" onClick={() => onClaim()}>
              <Plus aria-hidden="true" /> Make your first claim
            </button>
          }
        >
          Bought a course, a gym pass or a better chair? Claim it back in under a minute.
        </EmptyState>
      ) : (
        <ul className="hr-bn-claims">
          {mine.map((c) => (
            <ClaimRow key={c.id} claim={c} trackCtx={trackCtx} />
          ))}
        </ul>
      )}
    </HrPanel>
  );
}

function ClaimRow({ claim, trackCtx }: { claim: BenefitClaim; trackCtx: TrackContext }) {
  const meta = ALLOWANCE_BY_ID[claim.allowance];
  const status = CLAIM_STATUS_META[claim.status];
  const reviewer = useUserById(claim.reviewerId);
  const payroll = payrollLabel(claim.payrollMonth);
  const track = claimTrack(claim, trackCtx);
  const Icon = meta.icon;
  const detail =
    claim.status === 'submitted'
      ? `Sent ${relativeTime(claim.createdAt)} · waiting for People Ops`
      : claim.status === 'approved'
        ? payroll
          ? `Will be paid with ${payroll}`
          : 'Paid with the next payroll'
        : claim.status === 'paid'
          ? payroll
            ? `Paid with ${payroll}`
            : 'Paid'
          : `Declined${reviewer ? ` by ${reviewer.name.split(' ')[0]}` : ''}`;
  return (
    <li className={`hr-bn-claim is-${claim.status}`} style={{ '--al-h': meta.hue } as CSSProperties}>
      <span className="hr-bn-claim__icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="hr-bn-claim__main">
        <b className="hr-bn-claim__title">{claim.description}</b>
        <span className="hr-bn-claim__meta">
          {claim.merchant} · {formatDay(claim.date, { day: 'numeric', month: 'short' })} · {meta.label}
        </span>
        {claim.receiptName && (
          <span className="hr-bn-receipt">
            <Paperclip aria-hidden="true" />
            <span className="truncate">{claim.receiptName}</span>
          </span>
        )}
      </div>
      <span className="hr-bn-claim__amount">{money(claim.amount, claim.currency)}</span>
      <div className="hr-bn-claim__status">
        <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
        <span className="hr-bn-claim__detail">{detail}</span>
        {!track.inFlight && (
          <div className="hr-trk-slot is-compact">
            <HrTracker track={track} />
          </div>
        )}
      </div>
      {track.inFlight && (
        <div className="hr-trk-slot is-full hr-bn-claim__track">
          <HrTracker track={track} />
        </div>
      )}
      {claim.note && (
        <blockquote className="hr-bn-claim__note">
          “{claim.note}”{reviewer && <cite> {reviewer.name.split(' ')[0]}, People Ops</cite>}
        </blockquote>
      )}
    </li>
  );
}
