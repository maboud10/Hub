/**
 * HR Portal · Benefits — "My coverage" (digital insurance card + total
 * rewards), the enrolment wizard (`?enrol=1`, life events via `&event=`),
 * allowances & claims (`?claim=1`, optional `&allowance=`), perks & wellbeing
 * and life events. Always about the signed-in person.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { AllowanceId } from '@/hr/types';
import { CoverageHero } from './benefits/CoverageHero';
import { EnrolWizard } from './benefits/EnrolWizard';
import { AllowancesPanel, ClaimsHistory } from './benefits/Allowances';
import { ClaimModal } from './benefits/ClaimModal';
import { LifeEvents, PerksPanel } from './benefits/Perks';
import { isAllowanceId, isLifeEvent, type LifeEvent } from './benefits/model';

export function BenefitsPage() {
  const [params, setParams] = useSearchParams();
  const enrolOpen = params.get('enrol') === '1';
  const claimOpen = params.get('claim') === '1';
  const eventParam = params.get('event');
  const allowanceParam = params.get('allowance');
  const event = isLifeEvent(eventParam) ? eventParam : null;
  const allowance = isAllowanceId(allowanceParam) ? allowanceParam : null;

  const update = useCallback(
    (fn: (p: URLSearchParams) => void) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          fn(next);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const openEnrol = useCallback(
    (ev?: LifeEvent) =>
      update((p) => {
        p.set('enrol', '1');
        p.delete('claim');
        p.delete('allowance');
        if (ev) p.set('event', ev);
        else p.delete('event');
      }),
    [update],
  );
  const closeEnrol = useCallback(
    () =>
      update((p) => {
        p.delete('enrol');
        p.delete('event');
      }),
    [update],
  );
  const openClaim = useCallback(
    (a?: AllowanceId) =>
      update((p) => {
        p.set('claim', '1');
        p.delete('enrol');
        p.delete('event');
        if (a) p.set('allowance', a);
        else p.delete('allowance');
      }),
    [update],
  );
  const closeClaim = useCallback(
    () =>
      update((p) => {
        p.delete('claim');
        p.delete('allowance');
      }),
    [update],
  );

  return (
    <div className="hr-bn">
      <CoverageHero onEnrol={openEnrol} />
      <AllowancesPanel onClaim={openClaim} />
      <ClaimsHistory onClaim={openClaim} />
      <div className="hr-bn-duo">
        <PerksPanel />
        <LifeEvents onEnrol={openEnrol} />
      </div>
      <EnrolWizard open={enrolOpen} onClose={closeEnrol} event={event} />
      <ClaimModal open={claimOpen} onClose={closeClaim} initialAllowance={allowance} />
    </div>
  );
}
