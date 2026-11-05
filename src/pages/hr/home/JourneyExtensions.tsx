/**
 * Onboarding journey extensions, mounted in the journey detail side panel
 * (visible to People Ops, the manager, the buddy and the new hire):
 *   • Pulse check-ins of the journey's new hire: schedule states, per-question
 *     score bars (People Ops and the new hire only) and the comment (People
 *     Ops, the new hire, or the manager when the hire chose to share it).
 *   • Paperwork for the hire's NEXUS account: signatures, benefits enrolment
 *     and must-read policy acknowledgements. Managers and buddies see
 *     statuses only, never documents, plan details or pay.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Award, BellRing, BookOpen, Check, ClipboardCheck, Clock, EyeOff, GraduationCap, HeartPulse, KeyRound, Lock, ScrollText, Signature, Smile, TriangleAlert, X } from 'lucide-react';
import type { OnboardingJourney } from '@/talent/types';
import { canSeeJourney } from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentViewer } from '@/talent/selectors';
import { useAcademy } from '@/academy/store';
import { computeUserCourses } from '@/academy/selectors';
import { useWiki } from '@/wiki/store';
import { ELECTION_STATUS_META, HEALTH_PLAN_BY_ID, POLICIES } from '@/hr/constants';
import { canManageHR } from '@/hr/access';
import { pulseSchedule, pulseScore } from '@/hr/engine';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { useHr } from '@/hr/store';
import { useHrViewer } from '@/hr/selectors';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { ToneBadge, type Tone } from '../components/shared';
import { PulseBars, scoreEmoji, slotMeta } from './Pulse';
import { MILESTONE_NOUN } from './format';

interface Roles {
  ops: boolean;
  hire: boolean;
  manager: boolean;
  buddy: boolean;
}

const MANDATORY = POLICIES.filter((p) => p.mandatory);
const shortDate = (ts: number) => formatDay(todayISO(ts), { day: 'numeric', month: 'short' });

export function JourneyExtensions({ journeyId }: { journeyId: string }) {
  const journey = useTalent((s) => s.onboarding.find((j) => j.id === journeyId));
  const tv = useTalentViewer();
  const hv = useHrViewer();
  if (!journey || !tv || !hv || !canSeeJourney(tv, journey)) return null;
  const roles: Roles = {
    ops: canManageHR(hv),
    hire: !!journey.hubUserId && journey.hubUserId === hv.userId,
    manager: journey.managerId === hv.userId,
    buddy: journey.buddyId === hv.userId,
  };
  return (
    <div className="hr-home-jx">
      <div className="hr-home-jx__grid">
        <PulsePanel journey={journey} roles={roles} />
        <PaperworkPanel journey={journey} roles={roles} />
        <TrainingPanel journey={journey} roles={roles} />
      </div>
    </div>
  );
}

// ───────────────────────── pulse ─────────────────────────
function PulsePanel({ journey: j, roles }: { journey: OnboardingJourney; roles: Roles }) {
  const navigate = useNavigate();
  const pulses = useHr((s) => s.pulses);
  const hire = useUserById(j.hubUserId);
  const manager = useUserById(j.managerId);
  const now = useNow(60_000);
  const startDate = hire?.startDate ?? j.startDate;
  const uid = j.hubUserId;
  const slots = useMemo(() => pulseSchedule(startDate, uid ? pulses.filter((p) => p.userId === uid) : [], now), [startDate, uid, pulses, now]);
  const first = j.name.split(/\s+/)[0];
  const boss = manager ? manager.name.split(/\s+/)[0] : 'the manager';
  const seeScores = roles.ops || roles.hire;
  const open = slots.find((s) => s.state === 'open');
  const scored = slots.filter((s) => s.response).map((s) => pulseScore(s.response!));
  const avg = seeScores && scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;
  const sub = roles.hire
    ? 'Your check-ins. Scores stay with People Ops; your manager only sees comments you choose to share.'
    : roles.ops
      ? `${first}’s check-ins and scores. Unshared comments are for People Ops only.`
      : roles.manager
        ? `Scores stay private with People Ops. You’ll see comments ${first} chooses to share with you.`
        : `Scores and comments stay private with People Ops. You’ll see when ${first} has checked in.`;

  return (
    <section className="hr-home-jx__card" aria-labelledby={`hr-home-jx-pulse-${j.id}`}>
      <h2 id={`hr-home-jx-pulse-${j.id}`} className="hr-home-jx__title">
        <HeartPulse aria-hidden="true" /> Pulse check-ins
        {avg !== null && (
          <span className={cx('hr-home-jx__avg', avg <= 2.5 && 'is-low')} title="Average across check-ins">
            <span aria-hidden="true">{scoreEmoji(avg)}</span> {avg}/5
          </span>
        )}
      </h2>
      <p className="hr-home-jx__sub">{sub}</p>
      <ol className="hr-home-jx__slots">
        {slots.map((s) => {
          const r = s.response;
          const score = r ? pulseScore(r) : null;
          const showComment = !!r?.comment && (roles.ops || roles.hire || (roles.manager && r.shareWithManager));
          return (
            <li key={s.milestone} className={cx('hr-home-jx__slot', `is-${s.state}`)}>
              <div className="hr-home-jx__slot-head">
                <span className="hr-home-jx__node" aria-hidden="true">
                  {s.state === 'done' ? <Check /> : s.state === 'open' ? <i /> : s.state === 'missed' ? <X /> : <Clock />}
                </span>
                <span className="hr-home-jx__slot-text">
                  <b>{s.label}</b>
                  <span>{s.state === 'open' && !uid ? 'Open' : slotMeta(s, now)}</span>
                </span>
                {r && score !== null && seeScores && (
                  <span className={cx('hr-home-jx__score', score <= 2.5 && 'is-low')} title={`Average ${score} out of 5`}>
                    <span aria-hidden="true">{scoreEmoji(score)}</span> {score}
                  </span>
                )}
                {r && !seeScores && (
                  <span className="hr-home-jx__checked">
                    <Check aria-hidden="true" /> Checked in
                  </span>
                )}
              </div>
              {r && seeScores && <PulseBars scores={r.scores} compact />}
              {r && roles.ops && score !== null && score <= 2.5 && (
                <p className="hr-home-jx__alert">
                  <TriangleAlert aria-hidden="true" /> Averaged {score}/5. A friendly check-in conversation could help.
                </p>
              )}
              {showComment && r && (
                <blockquote className="hr-home-jx__comment">
                  “{r.comment}”
                  <span className="hr-home-jx__shared">
                    {r.shareWithManager ? (
                      <>
                        <Check aria-hidden="true" /> Shared with {roles.manager ? 'you' : boss}
                      </>
                    ) : (
                      <>
                        <EyeOff aria-hidden="true" /> Not shared with {boss}
                      </>
                    )}
                  </span>
                </blockquote>
              )}
            </li>
          );
        })}
      </ol>
      {!uid ? (
        <p className="hr-home-jx__note">
          <Clock aria-hidden="true" /> Check-ins start in the first week, once {first} has a NEXUS account.
        </p>
      ) : open && roles.hire ? (
        <button type="button" className="btn btn--primary btn--sm btn--block" onClick={() => navigate('/hr?pulse=1')}>
          <Smile /> Check in now
        </button>
      ) : open ? (
        <p className="hr-home-jx__note">
          <Clock aria-hidden="true" /> {first}’s {MILESTONE_NOUN[open.milestone]} check-in is open until {formatDay(open.closesOn, { day: 'numeric', month: 'short' })}.
        </p>
      ) : null}
    </section>
  );
}

// ───────────────────────── paperwork ─────────────────────────
function PaperworkPanel({ journey: j, roles }: { journey: OnboardingJourney; roles: Roles }) {
  const navigate = useNavigate();
  const documents = useHr((s) => s.documents);
  const elections = useHr((s) => s.elections);
  const acks = useHr((s) => s.acks);
  const now = useNow(60_000);
  const uid = j.hubUserId;
  const first = j.name.split(/\s+/)[0];
  const year = new Date(now).getFullYear();
  const data = useMemo(() => {
    if (!uid) return null;
    return {
      docs: documents.filter((d) => d.userId === uid && d.signature?.required).sort((a, b) => a.createdAt - b.createdAt),
      election: elections.find((e) => e.userId === uid && e.year === year),
      policies: MANDATORY.map((p) => ({ p, done: acks.some((a) => a.userId === uid && a.policyId === p.id && a.version === p.version) })),
    };
  }, [uid, documents, elections, acks, year]);

  if (!data)
    return (
      <section className="hr-home-jx__card is-waiting" aria-labelledby={`hr-home-jx-docs-${j.id}`}>
        <h2 id={`hr-home-jx-docs-${j.id}`} className="hr-home-jx__title">
          <ClipboardCheck aria-hidden="true" /> Paperwork
        </h2>
        <div className="hr-home-jx__waiting">
          <KeyRound aria-hidden="true" />
          <p>
            <b>Paperwork starts once the NEXUS account is provisioned.</b> Then {first} will be asked to:
          </p>
        </div>
        <ul className="hr-home-jx__todo">
          <li>
            <Signature aria-hidden="true" /> E-sign the contract and IP agreement
          </li>
          <li>
            <HeartPulse aria-hidden="true" /> Choose benefits within 30 days of day one
          </li>
          <li>
            <ScrollText aria-hidden="true" /> Read {MANDATORY.length} must-read policies
          </li>
        </ul>
      </section>
    );

  const e = data.election;
  const status = e?.status ?? 'not-started';
  const signed = data.docs.filter((d) => d.signature?.signedAt).length;
  const unsigned = data.docs.length - signed;
  const policiesDone = data.policies.filter((x) => x.done).length;
  const benefitsDone = status !== 'not-started';
  const total = data.docs.length + data.policies.length + 1;
  const done = signed + policiesDone + (benefitsDone ? 1 : 0);
  const left = e?.deadline ? daysBetween(todayISO(now), e.deadline) : null;
  const benefitsTone: Tone = status === 'confirmed' ? 'success' : status === 'submitted' ? 'info' : left !== null && left <= 7 ? 'danger' : 'warning';
  const benefitsLine =
    status === 'confirmed'
      ? `Active${e?.confirmedAt ? ` since ${shortDate(e.confirmedAt)}` : ''}`
      : status === 'submitted'
        ? 'People Ops is confirming with the insurer'
        : left === null
          ? 'Not enrolled yet'
          : left > 0
            ? `Due ${formatDay(e!.deadline!, { day: 'numeric', month: 'short' })} · ${left} day${left === 1 ? '' : 's'} left`
            : left === 0
              ? 'Due today'
              : `Overdue by ${-left} day${left === -1 ? '' : 's'}`;

  return (
    <section className="hr-home-jx__card" aria-labelledby={`hr-home-jx-docs-${j.id}`}>
      <h2 id={`hr-home-jx-docs-${j.id}`} className="hr-home-jx__title">
        <ClipboardCheck aria-hidden="true" /> Paperwork
        <span className={cx('hr-home-jx__count', done === total && 'is-done')}>
          {done}/{total} done
        </span>
      </h2>
      <div className="progress hr-home-jx__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Paperwork progress">
        <span style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <div className="hr-home-jx__group">
        <span className="hr-home-jx__label">
          <Signature aria-hidden="true" /> Signatures
        </span>
        <ul className="hr-home-jx__items">
          {data.docs.map((d) => {
            const at = d.signature?.signedAt;
            return (
              <li key={d.id} className={cx('hr-home-jx__item', at ? 'is-done' : 'is-todo')}>
                <span className="hr-home-jx__tick" aria-hidden="true">
                  {at ? <Check /> : <Clock />}
                </span>
                <span className="hr-home-jx__name">{d.title}</span>
                <span className="hr-home-jx__state">{at ? `Signed ${shortDate(at)}` : 'Awaiting signature'}</span>
              </li>
            );
          })}
          {!data.docs.length && <li className="hr-home-jx__item is-done">Nothing to sign.</li>}
        </ul>
      </div>

      <div className="hr-home-jx__group">
        <span className="hr-home-jx__label">
          <HeartPulse aria-hidden="true" /> Benefits enrolment
        </span>
        <div className="hr-home-jx__benefits">
          <ToneBadge tone={benefitsTone}>{ELECTION_STATUS_META[status].label}</ToneBadge>
          <span className="hr-home-jx__state">{benefitsLine}</span>
          {(roles.ops || roles.hire) && e && benefitsDone && (
            <span className="hr-home-jx__plan">
              {HEALTH_PLAN_BY_ID[e.health].label} plan · {e.dependents.length ? `${e.dependents.length} dependent${e.dependents.length === 1 ? '' : 's'}` : 'no dependents'}
            </span>
          )}
        </div>
      </div>

      <div className="hr-home-jx__group">
        <span className="hr-home-jx__label">
          <ScrollText aria-hidden="true" /> Must-read policies · {policiesDone}/{data.policies.length}
        </span>
        <ul className="hr-home-jx__policies">
          {data.policies.map(({ p, done: ok }) => (
            <li key={p.id} className={cx('hr-home-jx__policy', ok && 'is-done')}>
              {ok ? <Check aria-hidden="true" /> : <Clock aria-hidden="true" />}
              {p.title} v{p.version}
              <span className="sr-only">{ok ? 'acknowledged' : 'not yet acknowledged'}</span>
            </li>
          ))}
        </ul>
      </div>

      {roles.hire && done < total && (
        <div className="hr-home-jx__actions">
          {unsigned > 0 && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/hr/documents?tab=sign')}>
              <Signature /> Sign now
            </button>
          )}
          {!benefitsDone && (
            <button type="button" className="btn btn--sm" onClick={() => navigate('/hr/benefits?enrol=1')}>
              <HeartPulse /> Choose benefits
            </button>
          )}
          {policiesDone < data.policies.length && (
            <button type="button" className="btn btn--sm" onClick={() => navigate('/hr/documents?tab=policies')}>
              <ScrollText /> Read policies
            </button>
          )}
        </div>
      )}
      {roles.ops && !roles.hire && done < total && (
        <button type="button" className="btn btn--sm btn--block" onClick={() => toast.success('Reminder sent', `${first} will get a friendly nudge about the open paperwork.`)}>
          <BellRing /> Nudge {first}
        </button>
      )}
      <p className="hr-home-jx__privacy">
        <Lock aria-hidden="true" />
        {roles.hire ? 'Your manager and buddy only see these statuses, never your documents or pay.' : roles.ops ? 'Managers and buddies see statuses only.' : 'Statuses only: documents, plan details and pay stay private.'}
      </p>
    </section>
  );
}

// ───────────────────────── training & reading ─────────────────────────
function TrainingPanel({ journey: j, roles }: { journey: OnboardingJourney; roles: Roles }) {
  const navigate = useNavigate();
  const courses = useAcademy((s) => s.courses);
  const enrollments = useAcademy((s) => s.enrollments);
  const certificates = useAcademy((s) => s.certificates);
  const nudgeLearner = useAcademy((s) => s.nudgeLearner);
  const collections = useWiki((s) => s.collections);
  const userState = useWiki((s) => s.userState);
  const now = useNow(60_000);
  const uid = j.hubUserId;
  const first = j.name.split(/\s+/)[0];

  const summary = useMemo(() => {
    const pack = collections.find((c) => c.id === 'col-new-hire');
    if (!uid) return { items: [], certsCount: 0, packRead: 0, packTotal: pack?.articleSlugs.length ?? 5 };
    const all = computeUserCourses(uid, courses, enrollments, todayISO(now));
    const items = all.filter((x) => x.enrollment && (x.enrollment.source === 'onboarding' || x.enrollment.required));
    const certsCount = certificates.filter((c) => c.userId === uid).length;
    const readSet = new Set(userState[uid]?.readSlugs ?? []);
    const packRead = pack ? pack.articleSlugs.filter((slug) => readSet.has(slug)).length : 0;
    return { items, certsCount, packRead, packTotal: pack?.articleSlugs.length ?? 5 };
  }, [uid, courses, enrollments, certificates, collections, userState, now]);

  if (!uid) {
    return (
      <section className="hr-home-jx__card hr-home-jx__card--wide is-waiting" aria-labelledby={`hr-home-jx-acad-${j.id}`}>
        <h2 id={`hr-home-jx-acad-${j.id}`} className="hr-home-jx__title">
          <GraduationCap aria-hidden="true" /> Academy &amp; Reading Pack
        </h2>
        <div className="hr-home-jx__waiting">
          <KeyRound aria-hidden="true" />
          <p>
            <b>Role-based Academy courses auto-assign when {first}’s NEXUS account is provisioned.</b> Passing a course quiz automatically ticks off the linked task in this journey.
          </p>
        </div>
      </section>
    );
  }

  const doneCount = summary.items.filter((x) => x.enrollment?.status === 'completed').length;
  const totalCount = summary.items.length;
  const nextOpen = summary.items.find((x) => x.enrollment?.status !== 'completed');

  return (
    <section className="hr-home-jx__card hr-home-jx__card--wide" aria-labelledby={`hr-home-jx-acad-${j.id}`}>
      <h2 id={`hr-home-jx-acad-${j.id}`} className="hr-home-jx__title">
        <GraduationCap aria-hidden="true" /> Required Training &amp; Reading
        <span className={cx('hr-home-jx__count', totalCount > 0 && doneCount === totalCount && 'is-done')}>
          {doneCount}/{totalCount} certified
        </span>
      </h2>
      {totalCount > 0 && (
        <div className="progress hr-home-jx__bar" role="progressbar" aria-valuemin={0} aria-valuemax={totalCount} aria-valuenow={doneCount} aria-label="Onboarding training progress">
          <span style={{ width: `${(doneCount / totalCount) * 100}%` }} />
        </div>
      )}

      <div className="hr-home-jx__group">
        <span className="hr-home-jx__label">
          <Award aria-hidden="true" /> Helix Academy curriculum · {summary.certsCount} certificate{summary.certsCount === 1 ? '' : 's'} earned
        </span>
        <ul className="hr-home-jx__items">
          {summary.items.map(({ course, enrollment, progressPct, daysUntilDue, overdue }) => {
            const done = enrollment?.status === 'completed';
            const stateLabel = done
              ? `Certified${enrollment?.bestQuizScore ? ` · ${enrollment.bestQuizScore}%` : ''}`
              : overdue
                ? `Overdue by ${Math.abs(daysUntilDue ?? 0)}d · ${progressPct}%`
                : daysUntilDue !== null
                  ? `Due in ${daysUntilDue}d · ${progressPct}%`
                  : `${progressPct}% complete`;
            return (
              <li key={course.id} className={cx('hr-home-jx__item', done ? 'is-done' : 'is-todo')}>
                <span className="hr-home-jx__tick" aria-hidden="true">
                  {done ? <Check /> : <Clock />}
                </span>
                <span className="hr-home-jx__name">{course.title}</span>
                <span className="hr-home-jx__state">{stateLabel}</span>
              </li>
            );
          })}
          {!summary.items.length && <li className="hr-home-jx__item is-done">No required courses pending.</li>}
        </ul>
      </div>

      <div className="hr-home-jx__group">
        <span className="hr-home-jx__label">
          <BookOpen aria-hidden="true" /> New-Hire Week-1 Reading Pack · {summary.packRead}/{summary.packTotal} read
        </span>
      </div>

      <div className="hr-home-jx__actions">
        {roles.hire ? (
          <>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => navigate(nextOpen ? `/academy/course/${nextOpen.course.id}` : '/academy')}
            >
              <GraduationCap /> {nextOpen ? 'Continue training' : 'Open Academy'}
            </button>
            <button type="button" className="btn btn--sm" onClick={() => navigate('/wiki/collections/col-new-hire')}>
              <BookOpen /> Reading pack
            </button>
          </>
        ) : (
          <>
            {(roles.ops || roles.manager) && nextOpen && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  const res = nudgeLearner(uid, nextOpen.course.id);
                  toast.result(res);
                }}
              >
                <BellRing /> Nudge {first}
              </button>
            )}
            {(roles.ops || roles.manager) && (
              <button type="button" className="btn btn--sm" onClick={() => navigate('/academy/manage')}>
                <GraduationCap /> Team compliance
              </button>
            )}
            <button type="button" className="btn btn--sm" onClick={() => navigate('/wiki/collections/col-new-hire')}>
              <BookOpen /> Reading pack
            </button>
          </>
        )}
      </div>
    </section>
  );
}

