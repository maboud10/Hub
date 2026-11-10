/**
 * HR Portal · Time off — balances that explain themselves, a guided
 * "Request time off" flow (deep link `?new=1[&type=sick][&from=YYYY-MM-DD&to=YYYY-MM-DD]`),
 * my requests, public holidays with smart-break ideas, who's away on the team
 * and the policy in plain words. People-first: fast paths for the common cases
 * ("I'm sick today" is two taps, from the header), privacy by default, and
 * every number explained before you send anything.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { LeaveTypeId } from '@/hr/types';
import { useSessionUser } from '@/store/selectors';
import { BalanceCards } from './timeoff/BalanceCards';
import { HolidaysPanel } from './timeoff/Holidays';
import { MyRequests } from './timeoff/MyRequests';
import { PolicyTips } from './timeoff/PolicyTips';
import { RequestFlowModal, type FlowPreset } from './timeoff/RequestFlow';
import { WhosAway } from './timeoff/WhosAway';
import { isLeaveType } from './timeoff/utils';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function TimeOffPage() {
  const me = useSessionUser();
  const [params, setParams] = useSearchParams();
  const open = params.get('new') === '1';
  const typeParam = params.get('type');
  const initialType = isLeaveType(typeParam) ? typeParam : undefined;
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const urlPreset: FlowPreset | null = fromParam && ISO_DAY.test(fromParam) ? { start: fromParam, end: toParam && ISO_DAY.test(toParam) && toParam >= fromParam ? toParam : fromParam } : null;
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
        next.delete('from');
        next.delete('to');
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
        next.delete('from');
        next.delete('to');
        return next;
      },
      { replace: true },
    );
  };

  if (!me) return null;

  return (
    <div className="hr-to">
      <BalanceCards onRequest={(t) => startRequest(t)} />

      <div className="hr-to-row">
        <MyRequests onRequest={(t) => startRequest(t)} />
        <HolidaysPanel onPlan={(start, end) => startRequest('annual', { start, end })} />
      </div>

      <WhosAway />

      <PolicyTips onRequest={(t) => startRequest(t)} />

      <RequestFlowModal key={flowKey} open={open} onClose={close} initialType={initialType} preset={initialType ? (preset ?? urlPreset) : null} />
    </div>
  );
}
