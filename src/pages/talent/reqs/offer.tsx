/**
 * Offer building blocks shared by the Offers board and the offer modal:
 * approval chain (HM → People Ops with four-eyes hints), approval brief,
 * comp figures, first-year total breakdown, salary-band guardrail and the
 * expiry countdown.
 */
import { Fragment, useMemo, type CSSProperties } from 'react';
import { BadgeCheck, CircleCheck, CircleX, Hourglass, Lock, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import type { Candidate, Offer, OfferApproval, Requisition } from '@/talent/types';
import { APPROVAL_STEP_LABEL } from '@/talent/constants';
import { useTalent } from '@/talent/store';
import { useTalentCaps } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { parseISODate } from '@/talent/onboarding';
import { useHub } from '@/store/hub';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { usersWithPermission } from '@/lib/rbac';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Avatar } from '@/components/ui/primitives';
import { Comp, PeopleStack } from '../components/shared';
import { fmtDay, formatMoney } from '../components/format';
import { DAY, expiryInfo, firstYearTotal } from './helpers';

// ───────────────────────── actions ─────────────────────────
/** Record the candidate's answer; an acceptance opens the hired celebration. */
export function recordOfferResponse(offer: Offer, response: 'accepted' | 'declined', note?: string): boolean {
  const res = useTalent.getState().recordOfferResponse(offer.id, response, note);
  const ok = toast.result(res);
  if (ok && response === 'accepted') useTalentUI.getState().openModal({ kind: 'hired', applicationId: offer.applicationId, journeyId: res.journeyId });
  return ok;
}

// ───────────────────────── approval brief ─────────────────────────
type BriefTone = 'ok' | 'warn' | 'wait';

/** The gate checklist an approver reads before signing: band, expectation, dates, sign-offs. */
export function ApprovalBrief({ offer, req, cand, now }: { offer: Offer; req: Requisition | undefined; cand: Candidate; now: number }) {
  const caps = useTalentCaps();
  const hmStep = offer.approvals.find((a) => a.step === 'hiring-manager');
  const hmUser = useUserById(hmStep?.approverId ?? req?.hiringManagerId);
  const drafter = useUserById(offer.createdBy);
  const checks: { tone: BriefTone; text: string }[] = [];
  const band = req?.salary;
  const fmt = (n: number, c: string) => formatMoney(n, c, { compact: true });

  if (!caps.comp) checks.push({ tone: 'wait', text: 'Band check is visible to People Ops only' });
  else if (!band) checks.push({ tone: 'warn', text: 'No salary band on the requisition to check against' });
  else if (band.currency !== offer.currency) checks.push({ tone: 'warn', text: `Band is in ${band.currency}; the offer is in ${offer.currency}` });
  else if (offer.baseSalary < band.min || offer.baseSalary > band.max)
    checks.push({ tone: 'warn', text: `${offer.baseSalary > band.max ? 'Above' : 'Below'} the ${fmt(band.min, band.currency)}–${fmt(band.max, band.currency)} band${offer.note ? `. Justification: “${offer.note}”` : ''}` });
  else checks.push({ tone: 'ok', text: `In band: ${Math.round(((offer.baseSalary - band.min) / Math.max(1, band.max - band.min)) * 100)}% through ${fmt(band.min, band.currency)}–${fmt(band.max, band.currency)}` });

  const exp = cand.salaryExpectation;
  if (caps.comp && exp && exp.currency === offer.currency) {
    const amount = exp.amount * (exp.period === 'month' ? 12 : 1);
    const gap = Math.round(((offer.baseSalary - amount) / amount) * 100);
    checks.push(gap >= 0 ? { tone: 'ok', text: `Meets the candidate’s expectation of ${fmt(amount, exp.currency)}` } : { tone: 'warn', text: `${-gap}% below the candidate’s expectation of ${fmt(amount, exp.currency)}` });
  }

  const notice = cand.noticePeriodDays ?? 30;
  const startIn = Math.round((parseISODate(offer.startDate) - now) / DAY);
  checks.push(startIn >= notice ? { tone: 'ok', text: `Starts in ${startIn} days, after the ${notice}-day notice period` } : { tone: 'warn', text: `Starts in ${startIn} days, inside the ${notice}-day notice period` });

  const e = expiryInfo(offer.expiresAt, now);
  checks.push({ tone: e.tone === 'ok' ? 'ok' : 'warn', text: e.tone === 'expired' ? 'The offer window has lapsed; it will be extended when sent' : `Offer window: ${e.label.toLowerCase()}` });

  if (hmStep)
    checks.push(
      hmStep.decision === 'approved'
        ? { tone: 'ok', text: `${hmUser?.name.split(' ')[0] ?? 'Hiring manager'} signed off as hiring manager` }
        : { tone: 'wait', text: `Hiring-manager sign-off pending${hmUser ? ` (${hmUser.name.split(' ')[0]})` : ''}` },
    );
  checks.push({ tone: 'ok', text: `Separation of duties: drafted by ${drafter?.name.split(' ')[0] ?? 'a recruiter'}, approved by someone else` });

  return (
    <div className="tl-offer-brief">
      <span className="stat-label">Approval brief</span>
      <ul>
        {checks.map((c) => (
          <li key={c.text} className={`is-${c.tone}`}>
            {c.tone === 'ok' ? <CircleCheck aria-hidden="true" /> : c.tone === 'warn' ? <TriangleAlert aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── expiry ─────────────────────────
export function ExpiryPill({ offer, now }: { offer: Offer; now: number }) {
  if (offer.status === 'accepted' || offer.status === 'declined' || offer.status === 'rescinded') {
    const when = offer.respondedAt ?? offer.createdAt;
    return (
      <span className={cx('tl-offer-expiry', `tl-offer-expiry--${offer.status}`)}>
        {offer.status === 'accepted' ? <CircleCheck aria-hidden="true" /> : offer.status === 'declined' ? <CircleX aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
        {offer.status === 'accepted' ? 'Signed' : offer.status === 'declined' ? 'Declined' : 'Rescinded'} {relativeTime(when, now)}
      </span>
    );
  }
  const e = expiryInfo(offer.expiresAt, now);
  return (
    <span className={cx('tl-offer-expiry', `tl-offer-expiry--${e.tone}`)} title={`Offer valid until ${new Date(offer.expiresAt).toLocaleString()}`}>
      <Hourglass aria-hidden="true" />
      {e.label}
    </span>
  );
}

// ───────────────────────── approval chain ─────────────────────────
function useOfferApprovers(offer: Offer) {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  return useMemo(() => {
    const hmApprover = offer.approvals.find((a) => a.step === 'hiring-manager' && a.decision === 'approved')?.approverId;
    return usersWithPermission(users, roles, 'talent.offers.approve')
      .filter((u) => u.active && u.id !== offer.createdBy && u.id !== hmApprover)
      .map((u) => u.id);
  }, [users, roles, offer]);
}

function ChainNode({ approval, req, offer, poolIds, now }: { approval: OfferApproval; req: Requisition | undefined; offer: Offer; poolIds: string[]; now: number }) {
  const expectedId = approval.approverId ?? (approval.step === 'hiring-manager' ? req?.hiringManagerId : undefined);
  const user = useUserById(expectedId);
  const state = approval.decision;
  const idle = offer.status === 'draft' && state === 'pending';
  return (
    <li className={cx('tl-offer-chain__node', `is-${state}`, idle && 'is-idle')}>
      <span className="tl-offer-chain__avatar">
        {user ? (
          <Avatar user={user} size={30} />
        ) : (
          <span className="tl-offer-chain__pool" aria-hidden="true">
            <BadgeCheck />
          </span>
        )}
        <span className="tl-offer-chain__badge" aria-hidden="true">
          {state === 'approved' ? <CircleCheck /> : state === 'rejected' ? <Undo2 /> : <Hourglass />}
        </span>
      </span>
      <span className="tl-offer-chain__body">
        <span className="tl-offer-chain__step">{APPROVAL_STEP_LABEL[approval.step]}</span>
        <span className="tl-offer-chain__who">
          {state === 'approved'
            ? `${user?.name.split(' ')[0] ?? 'Approved'} approved${approval.at ? ` · ${relativeTime(approval.at, now)}` : ''}`
            : state === 'rejected'
              ? `${user?.name.split(' ')[0] ?? 'Reviewer'} returned it${approval.at ? ` · ${relativeTime(approval.at, now)}` : ''}`
              : idle
                ? 'Not routed yet'
                : user
                  ? `Waiting on ${user.name.split(' ')[0]}`
                  : 'Any People Ops approver'}
        </span>
        {state === 'pending' && !user && poolIds.length > 0 && (
          <span className="tl-offer-chain__pool-people">
            <PeopleStack userIds={poolIds} max={4} size={18} />
          </span>
        )}
        {approval.note && <q className="tl-offer-chain__note">{approval.note}</q>}
      </span>
    </li>
  );
}

/** HM → People Ops sign-off with decision state, notes and separation-of-duties hints. */
export function OfferApprovalChain({ offer, req, now, hints = true }: { offer: Offer; req: Requisition | undefined; now: number; hints?: boolean }) {
  const poolIds = useOfferApprovers(offer);
  const drafter = useUserById(offer.createdBy);
  const order = ['hiring-manager', 'people-ops'] as const;
  const approvals = order.map((step) => offer.approvals.find((a) => a.step === step) ?? { step, decision: 'pending' as const });
  const approvedBy = offer.approvals.filter((a) => a.decision === 'approved').map((a) => a.approverId);
  return (
    <div className="tl-offer-chain-wrap">
      <ol className="tl-offer-chain" aria-label="Approval chain">
        {approvals.map((ap, i) => (
          <Fragment key={ap.step}>
            {i > 0 && <li className={cx('tl-offer-chain__link', approvals[i - 1].decision === 'approved' && 'is-lit')} aria-hidden="true" />}
            <ChainNode approval={ap} req={req} offer={offer} poolIds={poolIds} now={now} />
          </Fragment>
        ))}
      </ol>
      {hints && (
        <div className="tl-offer-chain__hints">
          <span>
            <ShieldCheck aria-hidden="true" /> Four-eyes: each step needs a different approver
            {approvedBy.length === 2 && approvedBy[0] !== approvedBy[1] ? ' ✓' : ''}
          </span>
          {drafter && (
            <span>
              <Lock aria-hidden="true" /> {drafter.name.split(' ')[0]} drafted it, so can’t approve it
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── figures ─────────────────────────
/** Offer package figures; money is redacted without `talent.comp.view`. */
export function OfferFigures({ offer, compact = false }: { offer: Offer; compact?: boolean }) {
  const caps = useTalentCaps();
  const total = firstYearTotal(offer);
  const lock = <Comp amount={null} currency={offer.currency} />;
  return (
    <dl className={cx('tl-offer-figs', compact && 'tl-offer-figs--compact')}>
      <div>
        <dt>Base</dt>
        <dd>
          <Comp amount={offer.baseSalary} currency={offer.currency} compact={compact} />
        </dd>
      </div>
      <div>
        <dt>Bonus</dt>
        <dd>{caps.comp ? `${offer.bonusPct}%` : lock}</dd>
      </div>
      <div>
        <dt>Sign-on</dt>
        <dd>{caps.comp && !offer.signOnBonus ? <span className="faint">None</span> : <Comp amount={offer.signOnBonus} currency={offer.currency} compact={compact} />}</dd>
      </div>
      <div className="tl-offer-figs__wide">
        <dt>Equity</dt>
        <dd className="truncate" title={caps.comp ? offer.equity : undefined}>
          {caps.comp ? offer.equity || '—' : lock}
        </dd>
      </div>
      <div>
        <dt>Band</dt>
        <dd className="mono">{offer.band}</dd>
      </div>
      <div>
        <dt>Start date</dt>
        <dd>{fmtDay(offer.startDate)}</dd>
      </div>
      <div className="tl-offer-figs__total">
        <dt>First-year total</dt>
        <dd>
          <Comp amount={total} currency={offer.currency} compact={compact} />
        </dd>
      </div>
    </dl>
  );
}

// ───────────────────────── first-year breakdown ─────────────────────────
export function FirstYearBreakdown({ base, bonusPct, signOn, currency }: { base: number; bonusPct: number; signOn: number; currency: string }) {
  const caps = useTalentCaps();
  const bonus = Math.round((base * bonusPct) / 100);
  const total = firstYearTotal({ baseSalary: base, bonusPct, signOnBonus: signOn });
  if (!caps.comp)
    return (
      <div className="tl-offer-total tl-offer-total--locked">
        <Lock aria-hidden="true" /> First-year total is visible to People Ops only.
      </div>
    );
  const parts = [
    { key: 'base', label: 'Base', value: base },
    { key: 'bonus', label: `Bonus ${bonusPct || 0}%`, value: bonus },
    { key: 'signon', label: 'Sign-on', value: signOn },
  ].filter((p) => p.value > 0);
  return (
    <div className="tl-offer-total" role="status" aria-live="polite">
      <span className="stat-label">First-year total</span>
      <span className="tl-offer-total__value">{total > 0 ? formatMoney(total, currency) : '—'}</span>
      <span className="tl-offer-total__bar" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.key} className={`tl-offer-total__seg tl-offer-total__seg--${p.key}`} style={{ flexGrow: p.value } as CSSProperties} />
        ))}
      </span>
      <span className="tl-offer-total__legend">
        {parts.map((p) => (
          <span key={p.key} className={`tl-offer-total__key tl-offer-total__key--${p.key}`}>
            <i aria-hidden="true" />
            {p.label} <b>{formatMoney(p.value, currency, { compact: true })}</b>
          </span>
        ))}
      </span>
    </div>
  );
}

// ───────────────────────── band guardrail ─────────────────────────
/** Requisition band vs. candidate expectation vs. this offer. */
export function BandGuardrail({
  band,
  expectation,
  amount,
  currency,
}: {
  band: Requisition['salary'];
  expectation?: { amount: number; currency: string } | null;
  amount: number;
  currency: string;
}) {
  const caps = useTalentCaps();
  if (!caps.comp)
    return (
      <div className="tl-offer-band tl-offer-band--note">
        <Lock aria-hidden="true" /> Salary band is visible to People Ops only.
      </div>
    );
  if (!band)
    return (
      <div className="tl-offer-band tl-offer-band--note">
        <Lock aria-hidden="true" /> This requisition has no approved salary band yet, so the offer can’t be checked against one.
      </div>
    );
  if (band.currency !== currency)
    return (
      <div className="tl-offer-band tl-offer-band--note">
        The band is in {band.currency}; this offer is in {currency}. Switch to {band.currency} to check it against the band.
      </div>
    );
  const exp = expectation && expectation.currency === currency ? expectation.amount : null;
  const has = amount > 0;
  const values = [band.min, band.max, ...(has ? [amount] : []), ...(exp !== null ? [exp] : [])];
  const lo = Math.min(...values) * 0.92;
  const hi = Math.max(...values) * 1.05;
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const mid = (band.min + band.max) / 2;
  const out = has && (amount < band.min || amount > band.max);
  const through = band.max > band.min ? Math.round(((amount - band.min) / (band.max - band.min)) * 100) : 50;
  const compa = has ? (amount / mid).toFixed(2) : null;
  return (
    <div className={cx('tl-offer-band', out && 'is-out')}>
      <div className="tl-offer-band__head">
        <span className="stat-label">Band guardrail</span>
        {has && <span className={cx('badge', out ? 'badge--danger' : 'badge--success')}>{out ? (amount < band.min ? 'Below band' : 'Above band') : `In band · ${through}% through`}</span>}
      </div>
      <div className="tl-offer-band__track" aria-hidden="true">
        <span className="tl-offer-band__range" style={{ left: `${pos(band.min)}%`, width: `${pos(band.max) - pos(band.min)}%` }} />
        <span className="tl-offer-band__mid" style={{ left: `${pos(mid)}%` }} />
        {exp !== null && <span className="tl-offer-band__exp" style={{ left: `${pos(exp)}%` }} />}
        {has && <span className="tl-offer-band__offer" style={{ left: `${pos(amount)}%` }} />}
      </div>
      <div className="tl-offer-band__legend">
        <span className="tl-offer-band__key tl-offer-band__key--band">
          <i aria-hidden="true" /> Band{' '}
          <b>
            {formatMoney(band.min, currency, { compact: true })}–{formatMoney(band.max, currency, { compact: true })}
          </b>
        </span>
        {has && (
          <span className="tl-offer-band__key tl-offer-band__key--offer">
            <i aria-hidden="true" /> Offer <b>{formatMoney(amount, currency, { compact: true })}</b>
          </span>
        )}
        {exp !== null && (
          <span className="tl-offer-band__key tl-offer-band__key--exp">
            <i aria-hidden="true" /> Expects <b>{formatMoney(exp, currency, { compact: true })}</b>
          </span>
        )}
        {expectation && exp === null && <span className="faint">Expectation is in {expectation.currency}</span>}
        {compa && (
          <span className="tl-offer-band__key" title="Offer ÷ band midpoint">
            Compa <b>{compa}</b>
          </span>
        )}
      </div>
      <span className="sr-only">
        Band {formatMoney(band.min, currency)} to {formatMoney(band.max, currency)}.{has ? ` Offer ${formatMoney(amount, currency)}${out ? ', outside the band' : ', inside the band'}.` : ''}
      </span>
    </div>
  );
}
