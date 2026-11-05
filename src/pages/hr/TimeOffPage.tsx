/**
 * HR Portal · Time off — balances that explain themselves, a guided
 * "Request time off" flow (deep link `?new=1[&type=sick]`), my requests,
 * public holidays with smart-break ideas, who's away on the team and the
 * policy in plain words. People-first: fast paths for the common cases
 * ("I'm sick today" is two taps), privacy by default, and every number
 * explained before you send anything.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Globe, Plane, Thermometer } from 'lucide-react';
import type { LeaveTypeId } from '@/hr/types';
import { holidaySet, nextWorkingDay, todayISO } from '@/hr/calendar';
import { useSessionUser } from '@/store/selectors';
import { BalanceCards } from './timeoff/BalanceCards';
import { HolidaysPanel } from './timeoff/Holidays';
import { MyRequests } from './timeoff/MyRequests';
import { PolicyTips } from './timeoff/PolicyTips';
import { RequestFlowModal, type FlowPreset } from './timeoff/RequestFlow';
import { WhosAway } from './timeoff/WhosAway';
import { isLeaveType } from './timeoff/utils';

export function TimeOffPage() {
  const me = useSessionUser();
  const [params, setParams] = useSearchParams();
  const open = params.get('new') === '1';
  const typeParam = params.get('type');
  const initialType = isLeaveType(typeParam) ? typeParam : undefined;
  const [preset, setPreset] = useState<FlowPreset | null>(null);
  // A fresh flow (fresh state) every time it opens, whether from a button or a deep link.
  const [flowKey, setFlowKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFlowKey((k) => k + 1);
  }

  const startRequest = (type?: LeaveTypeId, dates?: FlowPreset) => {
    setPreset(type && dates ? dates : null);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('new', '1');
        if (type) next.set('type', type);
        else next.delete('type');
        return next;
      },
      { replace: false },
    );
  };
  const close = () => {
    setPreset(null);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        next.delete('type');
        return next;
      },
      { replace: true },
    );
  };

  if (!me) return null;
  const sickDay = nextWorkingDay(todayISO(), holidaySet(me.location));

  return (
    <div className="hr-to">
      <section className="hr-to-bar" aria-label="Quick actions">
        <div className="hr-to-bar__text">
          <span className="eyebrow">Time off</span>
          <h2 className="hr-to-bar__title">Rest is part of the work.</h2>
        </div>
        <div className="hr-to-bar__actions">
          <button type="button" className="btn btn--primary" onClick={() => startRequest()}>
            <Plane /> Request time off
          </button>
          <button type="button" className="btn" onClick={() => startRequest('sick', { start: sickDay, end: sickDay })}>
            <Thermometer /> {sickDay === todayISO() ? 'I’m sick today' : 'Sick next working day'}
          </button>
          <button type="button" className="btn" onClick={() => startRequest('wfa')} aria-label="Work from anywhere">
            <Globe /> <span className="hr-to-lg-only">Work from anywhere</span>
            <span className="hr-to-sm-only">Anywhere</span>
          </button>
        </div>
      </section>

      <BalanceCards onRequest={(t) => startRequest(t)} />

      <div className="hr-to-row">
        <MyRequests onRequest={(t) => startRequest(t)} />
        <HolidaysPanel onPlan={(start, end) => startRequest('annual', { start, end })} />
      </div>

      <WhosAway />

      <PolicyTips onRequest={(t) => startRequest(t)} />

      <RequestFlowModal key={flowKey} open={open} onClose={close} initialType={initialType} preset={initialType ? preset : null} />
    </div>
  );
}
