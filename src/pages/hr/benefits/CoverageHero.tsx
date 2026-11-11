/**
 * "My coverage" hero: the digital insurance card next to a status-aware story —
 * an enrolment call-to-action with a deadline countdown, an "awaiting People
 * Ops" tracker (the shared NeoTracker, see `@/hr/trackers`), or the active
 * plan — plus a total-rewards view of what Helix pays versus what you pay each
 * month.
 */
import type { CSSProperties } from 'react';
import { ArrowRight, BadgeCheck, CalendarClock, Glasses, PencilLine, ShieldCheck, Smile, Sparkles, Umbrella, Wallet } from 'lucide-react';
import type { BenefitElection } from '@/hr/types';
import { HEALTH_PLAN_BY_ID, HEALTH_PLANS } from '@/hr/constants';
import { COMPANY_PREMIUM, electionCost } from '@/hr/engine';
import { formatDay, todayISO } from '@/hr/calendar';
import { electionTrack } from '@/hr/trackers';
import { useSessionUser, useUserById } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { formatDate } from '@/lib/format';
import { cx } from '@/lib/cx';
import { ToneBadge } from '../components/shared';
import { HrTracker, useTrackContext } from '../components/trackers';
import { InsuranceCard } from './InsuranceCard';
import { aed, ALLOWANCES_TOTAL, deadlineInfo, money, planYear, useMyComp, useMyElection, type DeadlineInfo, type LifeEvent } from './model';

export function CoverageHero({ onEnrol }: { onEnrol: (event?: LifeEvent) => void }) {
  const me = useSessionUser();
  const stored = useMyElection();
  const now = useNow(60_000);
  if (!me) return null;
  const year = planYear();
  // People who joined after the yearly sync still get a working (not-started) card.
  const election: BenefitElection = stored ?? { id: `${me.id}-${year}`, userId: me.id, year, health: 'plus', dental: false, vision: false, lifeMultiple: 2, dependents: [], status: 'not-started' };
  const dl = deadlineInfo(election.deadline, todayISO(now));

  return (
    <section className={cx('neo-panel hr-bn-hero card', `is-${election.status}`)} aria-labelledby="hr-bn-hero-title">
      <span className="hr-bn-hero__glow" aria-hidden="true" />
      <div className="hr-bn-hero__card">
        <InsuranceCard election={election} holder={me.name} />
      </div>
      <div className="hr-bn-hero__body">
        <div className="neo-hud neo-hud--tint">My coverage · {year}</div>
        {election.status === 'not-started' && <EnrolCta election={election} deadline={dl} onEnrol={onEnrol} />}
        {election.status === 'submitted' && <PendingState election={election} onEnrol={onEnrol} />}
        {election.status === 'confirmed' && <ActiveState election={election} onEnrol={onEnrol} />}
        {election.status !== 'not-started' && <TotalRewards election={election} />}
      </div>
    </section>
  );
}

function CountdownRing({ info }: { info: DeadlineInfo }) {
  const size = 112;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const remaining = info.overdue ? 0 : 1 - info.elapsed;
  return (
    <div className={cx('hr-bn-count', info.urgent && 'is-urgent', info.overdue && 'is-overdue')} role="img" aria-label={`Enrolment deadline: ${info.label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="hr-bn-count__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="hr-bn-count__fill"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * remaining} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="hr-bn-count__label">
        <b>{info.overdue ? '!' : Math.max(0, info.left)}</b>
        <small>{info.overdue ? 'overdue' : info.left === 1 ? 'day left' : 'days left'}</small>
      </span>
    </div>
  );
}

function EnrolCta({ election, deadline, onEnrol }: { election: BenefitElection; deadline: DeadlineInfo | null; onEnrol: (event?: LifeEvent) => void }) {
  const cheapest = Math.min(...HEALTH_PLANS.map((p) => p.monthlyEmployee));
  const maxHelix = Math.max(...Object.values(COMPANY_PREMIUM));
  return (
    <div className="hr-bn-cta">
      <div className="hr-bn-cta__main">
        {deadline && <CountdownRing info={deadline} />}
        <div className="hr-bn-cta__text">
          <h2 id="hr-bn-hero-title" className="hr-bn-title">
            Choose your benefits
          </h2>
          <p className="muted">Pick a health plan, add your family and choose extras. It takes about three minutes, and Helix pays most of the premium for you.</p>
          {deadline && election.deadline && (
            <p className={cx('hr-bn-cta__deadline', deadline.urgent && 'is-urgent')}>
              <CalendarClock aria-hidden="true" />
              {deadline.overdue ? (
                <span>
                  The window closed on <b>{formatDay(election.deadline)}</b>. You can still enrol; People Ops will review it with you.
                </span>
              ) : (
                <span>
                  Enrol by <b>{formatDay(election.deadline)}</b> · {deadline.label}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <ol className="hr-bn-cta__steps" aria-label="Enrolment steps">
        {['Health plan', 'Dependents', 'Add-ons', 'Review'].map((s, i) => (
          <li key={s}>
            <span>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="hr-bn-cta__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={() => onEnrol()}>
          Start enrolment <ArrowRight aria-hidden="true" />
        </button>
        <span className="hr-bn-cta__from">
          <Sparkles aria-hidden="true" />
          Plans from <b>{cheapest ? aed(cheapest) : 'Free'}</b> · Helix pays up to {aed(maxHelix)}/mo
        </span>
      </div>
    </div>
  );
}

function PendingState({ election, onEnrol }: { election: BenefitElection; onEnrol: (event?: LifeEvent) => void }) {
  const plan = HEALTH_PLAN_BY_ID[election.health];
  const trackCtx = useTrackContext();
  return (
    <div className="hr-bn-state">
      <h2 id="hr-bn-hero-title" className="hr-bn-title">
        Submitted · awaiting People Ops
      </h2>
      <p className="muted">
        Your {plan.label} choices are with People Ops. They confirm them with {plan.insurer}, usually within a day, and your card goes live the moment they do.
      </p>
      <div className="hr-trk-slot hr-bn-state__track">
        <HrTracker track={electionTrack(election, trackCtx)} variant="full" />
      </div>
      <div className="row row--wrap">
        <button type="button" className="btn btn--sm" onClick={() => onEnrol()}>
          <PencilLine aria-hidden="true" /> Change my choices
        </button>
      </div>
    </div>
  );
}

function ActiveState({ election, onEnrol }: { election: BenefitElection; onEnrol: (event?: LifeEvent) => void }) {
  const plan = HEALTH_PLAN_BY_ID[election.health];
  const confirmer = useUserById(election.confirmedBy);
  return (
    <div className="hr-bn-state">
      <h2 id="hr-bn-hero-title" className="hr-bn-title">
        You’re covered <span className="hr-bn-title__plan">· {plan.label} plan</span>
      </h2>
      <p className="muted">
        {plan.insurer} · {plan.network}
        {election.confirmedAt ? ` · active since ${formatDate(election.confirmedAt)}` : ''}
        {confirmer ? ` (confirmed by ${confirmer.name.split(' ')[0]})` : ''}.
      </p>
      <div className="row row--wrap hr-bn-state__chips">
        <ToneBadge tone="success" icon={ShieldCheck}>
          Active
        </ToneBadge>
        {election.memberNumber && (
          <span className="hr-bn-pill">
            <BadgeCheck aria-hidden="true" /> Member <b className="mono">{election.memberNumber}</b>
          </span>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEnrol()}>
          <PencilLine aria-hidden="true" /> Update after a life event
        </button>
      </div>
    </div>
  );
}

function TotalRewards({ election }: { election: BenefitElection }) {
  const comp = useMyComp();
  const cost = electionCost(election);
  const total = cost.companyMonthly + cost.employeeMonthly;
  const helixPct = total ? Math.round((cost.companyMonthly / total) * 100) : 100;
  const life = comp ? election.lifeMultiple * comp.baseMonthly * 12 : null;
  return (
    <div className="hr-bn-rewards" aria-label="Total rewards">
      <div className="hr-bn-rewards__head">
        <span className="stat-label">Total rewards · per month</span>
        <span className="text-xs faint">Helix pays {helixPct}% of your cover</span>
      </div>
      <div className="hr-bn-split" role="img" aria-label={`Helix pays ${aed(cost.companyMonthly)}, you pay ${aed(cost.employeeMonthly)} a month`}>
        <span className="hr-bn-split__helix" style={{ '--w': `${helixPct}%` } as CSSProperties} />
        <span className="hr-bn-split__you" />
      </div>
      <div className="hr-bn-rewards__stats">
        <div className="hr-bn-rstat hr-bn-rstat--helix">
          <small>Helix pays</small>
          <b>{aed(cost.companyMonthly)}</b>
          <span>{aed(cost.companyMonthly * 12)} a year</span>
        </div>
        <div className="hr-bn-rstat">
          <small>You pay</small>
          <b>{cost.employeeMonthly ? aed(cost.employeeMonthly) : 'Nothing'}</b>
          <span>{cost.employeeMonthly ? `${aed(cost.employeeMonthly * 12)} a year, from salary` : 'Fully paid by Helix'}</span>
        </div>
      </div>
      <ul className="hr-bn-rewards__lines">
        {cost.lines.map((l) => (
          <li key={l.label}>
            <span>{l.label}</span>
            <span>{l.amount ? aed(l.amount) : 'Free'}</span>
          </li>
        ))}
      </ul>
      <div className="hr-bn-rewards__chips">
        <span className="hr-bn-pill">
          <Umbrella aria-hidden="true" /> Life cover {election.lifeMultiple}× salary
          {life && comp ? <b>{money(life, comp.currency, { compact: true })}</b> : null}
        </span>
        <span className={cx('hr-bn-pill', !election.dental && 'is-off')}>
          <Smile aria-hidden="true" /> Dental plus {election.dental ? '' : '· not added'}
        </span>
        <span className={cx('hr-bn-pill', !election.vision && 'is-off')}>
          <Glasses aria-hidden="true" /> Vision {election.vision ? '' : '· not added'}
        </span>
        <span className="hr-bn-pill">
          <Wallet aria-hidden="true" /> <b>{aed(ALLOWANCES_TOTAL)}</b> a year in allowances
        </span>
      </div>
    </div>
  );
}
