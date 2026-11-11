/**
 * "It's a hire!" — celebration after an accepted offer, plus the hand-off to
 * HR Portal: an animated Talent Hub → HR Portal relay, the live onboarding
 * tracker once the journey exists, what happens next (pre-boarding checklist,
 * manager, buddy, NEXUS account) and the CTA into the onboarding journey.
 * Confetti respects reduced motion.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, BriefcaseBusiness, CalendarHeart, Check, Contact, HeartHandshake, KeyRound, ListChecks, PartyPopper, Rocket, Send, SquareKanban, UserRound } from 'lucide-react';
import type { TalentModal } from '@/talent/ui';
import { ONBOARDING_TEMPLATE } from '@/talent/constants';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentViewer } from '@/talent/selectors';
import { daysUntilStart } from '@/talent/onboarding';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { burstConfetti } from '@/lib/confetti';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { CandidateAvatar, PersonChip } from '../components/shared';
import { fmtDay } from '../components/format';
import { OnboardingTracker } from '../trackers';

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function HiredModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'hired' }>; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const app = useTalent((s) => s.applications.find((a) => a.id === modal.applicationId));
  const cand = useTalent((s) => (app ? s.candidates.find((c) => c.id === app.candidateId) : undefined));
  const req = useTalent((s) => (app ? s.requisitions.find((r) => r.id === app.requisitionId) : undefined));
  const offer = useTalent((s) => s.offers.find((o) => o.applicationId === modal.applicationId && o.status === 'accepted'));
  const journey = useTalent((s) => s.onboarding.find((j) => (modal.journeyId ? j.id === modal.journeyId : false)) ?? s.onboarding.find((j) => j.applicationId === modal.applicationId));
  const handOffToHR = useTalent((s) => s.handOffToHR);
  const [handing, setHanding] = useState(false);
  const now = useNow(60_000);

  const hired = app?.status === 'hired';

  // Celebrate once per open (the timeout guard also survives StrictMode double effects).
  useEffect(() => {
    if (!open || !hired || reducedMotion()) return;
    const t1 = window.setTimeout(() => burstConfetti({ x: window.innerWidth / 2, y: window.innerHeight * 0.32 }), 260);
    const t2 = window.setTimeout(() => {
      burstConfetti({ x: window.innerWidth * 0.3, y: window.innerHeight * 0.4 });
      burstConfetti({ x: window.innerWidth * 0.7, y: window.innerHeight * 0.4 });
    }, 620);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, hired]);

  const first = cand?.name.split(/\s+/)[0] ?? 'friend';
  const startDate = journey?.startDate ?? offer?.startDate;
  const days = startDate ? daysUntilStart({ startDate }) : null;
  const preTasks = useMemo(() => {
    const list = journey ? journey.tasks.filter((t) => t.phase === 'pre-boarding') : ONBOARDING_TEMPLATE.filter((t) => t.phase === 'pre-boarding');
    return { total: list.length, done: journey ? journey.tasks.filter((t) => t.phase === 'pre-boarding' && t.done).length : 0 };
  }, [journey]);
  const managerId = journey?.managerId ?? req?.hiringManagerId;
  const canHandOff = caps.manage || caps.onboarding;
  const canSeeJourney = !!journey && (caps.onboarding || journey.managerId === viewer?.userId);

  const handOff = () => {
    if (!app) return;
    setHanding(true);
    const res = handOffToHR(app.id);
    setHanding(false);
    toast.result(res);
  };
  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={660}
      className="tl-hired-modal"
      title={hired ? 'It’s a hire!' : 'Not hired yet'}
      subtitle={offer ? `Offer accepted ${relativeTime(offer.respondedAt ?? Date.now())}` : hired ? 'Offer accepted' : 'Waiting for the signed offer'}
      icon={
        <span className="modal-icon tl-hired-icon">
          <PartyPopper />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => go('/talent/pipeline')}>
            <SquareKanban /> Back to pipeline
          </button>
          {!journey && hired && canHandOff && (
            <button type="button" className="btn btn--primary" onClick={handOff} disabled={handing}>
              <Send /> Hand off to HR Portal
            </button>
          )}
          {journey && canSeeJourney && (
            <button type="button" className="btn btn--primary tl-hired-cta" onClick={() => go(`/hr/onboarding/${journey.id}`)}>
              <Rocket /> Open onboarding journey <ArrowRight />
            </button>
          )}
        </>
      }
    >
      {!app || !cand ? (
        <p className="muted">This hire could not be found.</p>
      ) : (
        <div className="tl-hired">
          <div className="tl-hired__hero">
            <div className="tl-hired__rays" aria-hidden="true" />
            <div className="tl-hired__avatar">
              <span className="tl-hired__ring" aria-hidden="true" />
              <CandidateAvatar person={cand} size={84} />
              {hired && (
                <span className="tl-hired__badge" aria-hidden="true">
                  <Check />
                </span>
              )}
            </div>
            <h3 className="tl-hired__title">
              {hired ? (
                <>
                  Welcome aboard, <span className="tl-hired__name">{first}</span>!
                </>
              ) : (
                <>
                  Almost there, <span className="tl-hired__name">{first}</span>
                </>
              )}
            </h3>
            <div className="tl-hired__facts">
              <span>
                <BriefcaseBusiness aria-hidden="true" /> {offer?.title ?? req?.title}
              </span>
              {req && (
                <span>
                  <Contact aria-hidden="true" /> {req.department} team
                </span>
              )}
              {startDate && (
                <span>
                  <CalendarHeart aria-hidden="true" /> Starts {fmtDay(startDate)}
                  {days !== null && days > 0 ? ` · in ${days} day${days === 1 ? '' : 's'}` : ''}
                </span>
              )}
            </div>
            {!hired && <p className="text-sm muted">The offer hasn’t been accepted yet. Record the signed offer first, then hand off to HR Portal.</p>}
          </div>

          <div className={cx('tl-hired-relay', journey && 'is-done')} role="status" aria-label={journey ? 'Handed off to HR Portal' : 'Ready to hand off to HR Portal'}>
            <div className="tl-hired-relay__node tl-hired-relay__node--talent">
              <span className="tl-hired-relay__icon">
                <UserRound />
              </span>
              <span className="tl-hired-relay__name">Talent Hub</span>
              <span className="tl-hired-relay__sub">Offer signed</span>
            </div>
            <div className="tl-hired-relay__path" aria-hidden="true">
              <span className="tl-hired-relay__track" />
              <i style={{ '--d': '0s' } as CSSProperties} />
              <i style={{ '--d': '0.6s' } as CSSProperties} />
              <i style={{ '--d': '1.2s' } as CSSProperties} />
              <span className="tl-hired-relay__label">{journey ? `Handed off ${relativeTime(journey.handedOffAt)}` : 'Ready to hand off'}</span>
            </div>
            <div className="tl-hired-relay__node tl-hired-relay__node--hr">
              <span className="tl-hired-relay__icon">{journey ? <Check /> : <Rocket />}</span>
              <span className="tl-hired-relay__name">HR Portal</span>
              <span className="tl-hired-relay__sub">{journey ? 'Journey live' : 'Onboarding'}</span>
            </div>
          </div>

          {journey && <OnboardingTracker journey={journey} now={now} className="tl-hired__track" />}

          <div className="tl-hired-next">
            <div className="stat-label">What happens next</div>
            <ol className="tl-hired-next__list">
              <li style={{ '--i': 0 } as CSSProperties}>
                <span className="tl-hired-next__icon">
                  <ListChecks />
                </span>
                <div className="grow">
                  <strong>Pre-boarding checklist</strong>
                  <span>
                    {preTasks.total} tasks before day one{journey ? ` · ${preTasks.done} done` : ''}: contract, visa & Emirates ID, laptop, welcome pack.
                  </span>
                </div>
              </li>
              <li style={{ '--i': 1 } as CSSProperties}>
                <span className="tl-hired-next__icon">
                  <UserRound />
                </span>
                <div className="grow">
                  <strong>Manager</strong>
                  <span>Kick-off 1:1 and a 30/60/90 success plan.</span>
                </div>
                <PersonChip userId={managerId} />
              </li>
              <li style={{ '--i': 2 } as CSSProperties}>
                <span className="tl-hired-next__icon">
                  <HeartHandshake />
                </span>
                <div className="grow">
                  <strong>Onboarding buddy</strong>
                  <span>{journey?.buddyId ? 'A peer guide for the first 90 days.' : 'The manager pairs them with a peer before day one.'}</span>
                </div>
                {journey?.buddyId ? <PersonChip userId={journey.buddyId} /> : <span className="tl-hired-next__pending">To assign</span>}
              </li>
              <li style={{ '--i': 3 } as CSSProperties}>
                <span className="tl-hired-next__icon">
                  <KeyRound />
                </span>
                <div className="grow">
                  <strong>NEXUS account</strong>
                  <span>{journey?.workEmail ? `Ready: ${journey.workEmail}` : 'People Ops provisions the account, work email and SSO before day one.'}</span>
                </div>
                {journey?.hubUserId ? <span className="tl-hired-next__ok">Ready</span> : <span className="tl-hired-next__pending">Pending</span>}
              </li>
            </ol>
            {!journey && hired && !canHandOff && <p className="text-sm muted">A recruiter or People Ops will hand {first} off to HR Portal.</p>}
            {journey && !canSeeJourney && <p className="text-sm muted">People Ops and the hiring manager run the journey in HR Portal.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
