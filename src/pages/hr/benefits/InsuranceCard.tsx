/**
 * Digital insurance card: a plan-tinted ID-1 card that flips to show who is
 * covered, the annual limit, add-ons and life cover. Before enrolment it
 * renders as a desaturated draft so people can see what they're choosing.
 */
import { useId, useState, type CSSProperties } from 'react';
import { Nfc, RotateCw } from 'lucide-react';
import type { BenefitElection } from '@/hr/types';
import { ELECTION_STATUS_META, HEALTH_PLAN_BY_ID, RELATION_LABEL } from '@/hr/constants';
import { cx } from '@/lib/cx';
import { HelixGlyph } from '../documents/brand';
import { aed } from './model';

type CardElection = Pick<BenefitElection, 'health' | 'dental' | 'vision' | 'lifeMultiple' | 'dependents' | 'status' | 'memberNumber' | 'year'>;

/** "DM-ABCD2345" → "DM · ABCD 2345" for readability. */
function formatMember(n: string) {
  const [prefix, rest = ''] = n.split('-');
  return rest ? `${prefix} · ${rest.slice(0, 4)} ${rest.slice(4)}`.trim() : n;
}

export function InsuranceCard({ election, holder, className }: { election: CardElection; holder: string; className?: string }) {
  const [flipped, setFlipped] = useState(false);
  const id = useId();
  const plan = HEALTH_PLAN_BY_ID[election.health];
  const status = ELECTION_STATUS_META[election.status];
  const draft = election.status === 'not-started';
  const member = election.memberNumber ? formatMember(election.memberNumber) : draft ? 'Issued after enrolment' : 'Issued on confirmation';
  const addOns = [election.dental && 'Dental plus', election.vision && 'Vision'].filter(Boolean).join(' · ');
  const covered = [{ id: 'me', name: holder, role: 'Member' }, ...election.dependents.map((d) => ({ id: d.id, name: d.name || 'New dependent', role: RELATION_LABEL[d.relation] }))];
  const shown = covered.slice(0, 6);
  const flip = () => setFlipped((f) => !f);

  return (
    <div className={cx('hr-bn-card', flipped && 'is-flipped', draft && 'is-draft', className)} style={{ '--plan-h': plan.hue } as CSSProperties}>
      <div className="hr-bn-card__scene" onClick={flip} id={id}>
        <div className="hr-bn-card__inner">
          <div className="hr-bn-card__face hr-bn-card__front" aria-hidden={flipped}>
            <span className="hr-bn-card__shine" aria-hidden="true" />
            <div className="hr-bn-card__top">
              <span className="hr-bn-card__brand">
                <HelixGlyph />
                Helix <em>Health</em>
              </span>
              <span className={cx('hr-bn-card__status', `is-${status.tone}`)}>{status.label}</span>
            </div>
            <div className="hr-bn-card__mid">
              <span className="hr-bn-card__chip" aria-hidden="true" />
              <Nfc className="hr-bn-card__nfc" aria-hidden="true" />
              <span className="hr-bn-card__insurer">{plan.insurer}</span>
            </div>
            <span className="hr-bn-card__plan">
              {plan.label} plan
              <small>{plan.network}</small>
            </span>
            <div className={cx('hr-bn-card__number', !election.memberNumber && 'is-placeholder')}>{member}</div>
            <div className="hr-bn-card__bottom">
              <span className="hr-bn-card__field hr-bn-card__holder">
                <small>Member</small>
                <b>{holder}</b>
              </span>
              <span className="hr-bn-card__field">
                <small>Valid thru</small>
                <b>12/{String(election.year).slice(2)}</b>
              </span>
            </div>
          </div>
          <div className="hr-bn-card__face hr-bn-card__back" aria-hidden={!flipped}>
            <span className="hr-bn-card__stripe" aria-hidden="true" />
            <div className="hr-bn-card__back-body">
              <div className="hr-bn-card__members">
                <small>Covered · {covered.length}</small>
                <ul>
                  {shown.map((c) => (
                    <li key={c.id}>
                      <span className="truncate">{c.name}</span>
                      <em>{c.role}</em>
                    </li>
                  ))}
                  {covered.length > shown.length && <li className="is-more">+{covered.length - shown.length} more</li>}
                </ul>
              </div>
              <div className="hr-bn-card__facts">
                <span>
                  <small>Annual limit</small>
                  <b>{aed(plan.annualLimit, { compact: true })}</b>
                </span>
                <span>
                  <small>Add-ons</small>
                  <b>{addOns || 'None'}</b>
                </span>
                <span>
                  <small>Life cover</small>
                  <b>{election.lifeMultiple}× salary</b>
                </span>
              </div>
            </div>
            <div className="hr-bn-card__assist">24/7 assistance in the {plan.insurer} app · show this card at reception</div>
          </div>
        </div>
      </div>
      <button type="button" className="btn btn--ghost btn--sm hr-bn-card__flip" aria-controls={id} aria-pressed={flipped} onClick={flip}>
        <RotateCw aria-hidden="true" />
        {flipped ? 'Show the front' : `See who’s covered (${covered.length})`}
      </button>
    </div>
  );
}
