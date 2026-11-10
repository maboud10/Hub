/**
 * HR Portal · My HR — the personal, people-first home below the hero:
 * "Your next steps", the new-hire spotlight (day N of your first 90, your
 * people, onboarding tasks and pulse check-ins), the manager's team card,
 * at-a-glance widgets (time off, pay, benefits, public holidays, who's away)
 * and Ask People Ops.
 * Deep links: `?pulse=1` opens the due pulse check-in; `?ask=1[&case=<id>]`
 * opens Ask People Ops (new question or a case thread).
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTalent } from '@/talent/store';
import { daysUntilStart } from '@/talent/onboarding';
import { isNewHire } from '@/hr/engine';
import { useHrCaps, type HrTask } from '@/hr/selectors';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { NeoHome } from '@/components/neo';
import { cx } from '@/lib/cx';
import { useParamModal } from './home/useParamModal';
import { NextSteps } from './home/NextSteps';
import { NewHireSpotlight } from './home/NewHireSpotlight';
import { PulseModal } from './home/Pulse';
import { BenefitsWidget, HolidaysWidget, PayWidget, TeamAwayWidget, TimeOffWidget } from './home/Glance';
import { TeamCard } from './home/TeamCard';
import { AskModal, AskNova, type AskOptions } from './home/AskPeopleOps';

export function HRHome() {
  const me = useSessionUser();
  const caps = useHrCaps();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const journey = useTalent((s) => (me ? s.onboarding.find((j) => j.hubUserId === me.id) : undefined));
  const pulse = useParamModal('pulse');
  const ask = useParamModal('ask', 'case');
  const [askOptions, setAskOptions] = useState<AskOptions>({});

  const showAsk = ask.show;
  const openAsk = useCallback(
    (o: AskOptions) => {
      setAskOptions(o);
      showAsk();
    },
    [showAsk],
  );
  const closeAsk = () => {
    ask.close();
    setAskOptions({});
  };
  const onTask = (t: HrTask) => {
    if (t.kind === 'pulse') pulse.show();
    else if (t.kind === 'case') openAsk({ caseId: t.ref, mode: 'cases' });
    else navigate(t.link);
  };

  // New hires (and provisioned pre-boarders) get the spotlight in the main column.
  const spotlight = !!me && (isNewHire(me.startDate, now) || (!!journey && daysUntilStart(journey, now) > 0));
  const askFor: AskOptions = ask.param ? { ...askOptions, caseId: ask.param, mode: askOptions.mode ?? 'cases' } : askOptions;

  return (
    <div className={cx('hr-home', spotlight && 'hr-home--newhire')}>
      <NeoHome
        sideLabel="Holidays and who’s away"
        main={
          <>
            <AskNova onOpen={openAsk} />
            <NextSteps onTask={onTask} />
            {spotlight && <NewHireSpotlight onPulse={pulse.show} />}
            {caps.manager && <TeamCard />}
            <div className="hr-home__glance">
              <TimeOffWidget />
              <PayWidget />
              <BenefitsWidget />
            </div>
          </>
        }
        side={
          <>
            <HolidaysWidget />
            <TeamAwayWidget />
          </>
        }
      />
      <PulseModal open={pulse.open} onClose={pulse.close} />
      <AskModal open={ask.open} onClose={closeAsk} options={askFor} />
    </div>
  );
}
