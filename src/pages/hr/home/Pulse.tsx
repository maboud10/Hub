/**
 * HR Home · new-hire pulse check-ins: the check-in card, the four-milestone
 * timeline (first week, 30, 60 and 90 days), per-question score bars and the
 * check-in modal — emoji scale, optional comment, "share my comment with my
 * manager", an honest "who sees what" explainer and a heartfelt thank-you.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, Clock, HeartHandshake, Lock, Send, Smile, X } from 'lucide-react';
import type { PulseMilestone, PulseQuestion, PulseResponse } from '@/hr/types';
import { PULSE_QUESTIONS, PULSE_SCALE } from '@/hr/constants';
import { isNewHire, pulseSchedule, pulseScore, type PulseSlot } from '@/hr/engine';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { useHr } from '@/hr/store';
import { useTeam } from '@/hr/selectors';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { firstName } from '@/lib/format';
import { cx } from '@/lib/cx';
import { MILESTONE_NOUN } from './format';

export type PulseValue = 1 | 2 | 3 | 4 | 5;

/** Emoji for an average score (1–5). */
export function scoreEmoji(avg: number) {
  return PULSE_SCALE[Math.max(0, Math.min(4, Math.round(avg) - 1))].emoji;
}

export const QUESTION_SHORT: Record<PulseQuestion, string> = {
  welcome: 'Welcomed',
  clarity: 'Clarity',
  tools: 'Tools & access',
  belonging: 'Belonging',
};

const PROMPT: Record<PulseMilestone, string> = {
  'week-1': 'How was your first week?',
  'day-30': 'How’s your first month going?',
  'day-60': 'Two months in. How are things?',
  'day-90': '90 days! How do you feel?',
};

const shortDay = (iso: string) => formatDay(iso, { day: 'numeric', month: 'short' });

/** One line describing a pulse slot ("Open · closes 18 Nov", "Opens 3 Dec"…). */
export function slotMeta(s: PulseSlot, now: number): string {
  switch (s.state) {
    case 'done':
      return s.response ? `Shared ${shortDay(todayISO(s.response.at))}` : 'Shared';
    case 'open':
      return daysBetween(todayISO(now), s.closesOn) <= 0 ? 'Open · closes today' : `Open · closes ${shortDay(s.closesOn)}`;
    case 'upcoming':
      return `Opens ${shortDay(s.opensOn)}`;
    default:
      return 'Window closed';
  }
}

/** The signed-in person's pulse schedule. */
export function useMyPulseSlots(): PulseSlot[] {
  const me = useSessionUser();
  const pulses = useHr((s) => s.pulses);
  const now = useNow(60_000);
  return useMemo(() => (me ? pulseSchedule(me.startDate, pulses.filter((p) => p.userId === me.id), now) : []), [me, pulses, now]);
}

// ───────────────────────── building blocks ─────────────────────────
/** Per-question score bars (1–5); scores of 2 or less are highlighted. */
export function PulseBars({ scores, compact = false }: { scores: PulseResponse['scores']; compact?: boolean }) {
  return (
    <ul className={cx('hr-home-pbars', compact && 'hr-home-pbars--compact')}>
      {PULSE_QUESTIONS.map((q) => {
        const v = scores[q.id];
        return (
          <li key={q.id} className={cx('hr-home-pbar', v <= 2 && 'is-low')} style={{ '--v': v / 5 } as CSSProperties}>
            <span className="hr-home-pbar__label" aria-hidden="true">
              {QUESTION_SHORT[q.id]}
            </span>
            <span className="hr-home-pbar__track" aria-hidden="true">
              <i />
            </span>
            <span className="hr-home-pbar__value" aria-hidden="true">
              {v}
            </span>
            <span className="sr-only">
              {q.label}: {v} out of 5 ({PULSE_SCALE[v - 1].label})
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** First week → 90 days with done / open / upcoming / missed states. */
export function PulseTimeline({ slots, now, layout = 'row', showScores = true }: { slots: PulseSlot[]; now: number; layout?: 'row' | 'column'; showScores?: boolean }) {
  return (
    <ol className={cx('hr-home-ptl', `hr-home-ptl--${layout}`)} aria-label="Pulse check-ins">
      {slots.map((s) => {
        const avg = s.response ? pulseScore(s.response) : null;
        return (
          <li key={s.milestone} className={cx('hr-home-ptl__step', `is-${s.state}`)}>
            <span className="hr-home-ptl__node" aria-hidden="true">
              {s.state === 'done' ? <Check /> : s.state === 'open' ? <i /> : s.state === 'missed' ? <X /> : <Clock />}
            </span>
            <span className="hr-home-ptl__text">
              <span className="hr-home-ptl__label">{s.label}</span>
              <span className="hr-home-ptl__meta">{slotMeta(s, now)}</span>
            </span>
            {showScores && avg !== null && (
              <span className="hr-home-ptl__score" title={`Average ${avg} out of 5`}>
                <span aria-hidden="true">{scoreEmoji(avg)}</span> {avg}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── card ─────────────────────────
export function PulseCard({ onOpen }: { onOpen: () => void }) {
  const slots = useMyPulseSlots();
  const now = useNow(60_000);
  const open = slots.find((s) => s.state === 'open');
  const next = slots.find((s) => s.state === 'upcoming');
  const done = slots.filter((s) => s.state === 'done').length;
  if (!slots.length) return null;
  return (
    <section className={cx('hr-home-pulse', open && 'is-open')} aria-labelledby="hr-home-pulse-title">
      <div className="hr-home-pulse__head">
        <div className="grow">
          <div className="eyebrow">Pulse check-in{open ? ' · open now' : ''}</div>
          <h3 id="hr-home-pulse-title" className="hr-home-pulse__title">
            {open ? PROMPT[open.milestone] : next ? `Next up: your ${MILESTONE_NOUN[next.milestone]} check-in` : 'All check-ins done. Thank you!'}
          </h3>
          <p className="text-sm muted">
            {open
              ? `4 quick questions · about 30 seconds · ${slotMeta(open, now).replace('Open · ', '')}`
              : next
                ? `Opens ${formatDay(next.opensOn)}. We’ll remind you when it’s time.`
                : `You shared ${done} check-in${done === 1 ? '' : 's'}. They shape onboarding for everyone after you.`}
          </p>
        </div>
        {open && (
          <div className="hr-home-pulse__faces" aria-hidden="true">
            {PULSE_SCALE.map((p) => (
              <span key={p.value} style={{ '--i': p.value } as CSSProperties}>
                {p.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
      <PulseTimeline slots={slots} now={now} />
      {open && (
        <button type="button" className="btn btn--primary hr-home-pulse__cta" onClick={onOpen}>
          <Smile /> Check in now
        </button>
      )}
    </section>
  );
}

// ───────────────────────── modal ─────────────────────────
interface Thanks {
  label: string;
  avg: number;
  commented: boolean;
  shared: boolean;
}

export function PulseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useSessionUser();
  const { manager } = useTeam();
  const submitPulse = useHr((s) => s.submitPulse);
  const slots = useMyPulseSlots();
  const now = useNow(60_000);
  const [scores, setScores] = useState<Partial<Record<PulseQuestion, PulseValue>>>({});
  const [comment, setComment] = useState('');
  const [share, setShare] = useState(false);
  const [thanks, setThanks] = useState<Thanks | null>(null);

  useEffect(() => {
    if (!open) return;
    setScores({});
    setComment('');
    setShare(false);
    setThanks(null);
  }, [open]);

  const slot = slots.find((s) => s.state === 'open');
  const next = slots.find((s) => s.state === 'upcoming');
  const answered = PULSE_QUESTIONS.filter((q) => scores[q.id]).length;
  const complete = answered === PULSE_QUESTIONS.length;
  const hasComment = comment.trim().length > 0;
  const boss = manager ? firstName(manager.name) : 'your manager';
  const newHire = !!me && isNewHire(me.startDate, now);

  const submit = () => {
    if (!slot || !complete) return;
    const full = scores as PulseResponse['scores'];
    const res = submitPulse({ milestone: slot.milestone, scores: full, comment: comment.trim() || undefined, shareWithManager: share && hasComment });
    if (!res.ok) {
      toast.result(res);
      return;
    }
    setThanks({ label: MILESTONE_NOUN[slot.milestone], avg: pulseScore({ scores: full }), commented: hasComment, shared: share && hasComment });
  };

  const title = thanks ? 'Check-in shared' : slot ? `Your ${MILESTONE_NOUN[slot.milestone]} check-in` : 'Pulse check-ins';
  const footer = thanks ? (
    <button type="button" className="btn btn--primary" onClick={onClose}>
      Back to My HR
    </button>
  ) : slot ? (
    <>
      <span className="hr-home-pmodal__hint">{complete ? 'Ready when you are.' : `${PULSE_QUESTIONS.length - answered} to go`}</span>
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        Not now
      </button>
      <button type="button" className="btn btn--primary" onClick={submit} disabled={!complete}>
        <Send /> Send check-in
      </button>
    </>
  ) : (
    <button type="button" className="btn" onClick={onClose}>
      Close
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={thanks ? undefined : slot ? '4 quick questions · about 30 seconds' : undefined}
      icon={
        <span className="hr-home-modal-icon" aria-hidden="true">
          <Smile />
        </span>
      }
      width={620}
      className="hr-home-pmodal"
      footer={footer}
    >
      {thanks ? (
        <div className="hr-home-thanks" role="status">
          <div className="hr-home-thanks__burst" aria-hidden="true">
            <span className="hr-home-thanks__heart">💜</span>
            {['✨', '🎉', '💫', '🌟', '🎊', '✨'].map((e, i) => (
              <i key={i} style={{ '--i': i } as CSSProperties}>
                {e}
              </i>
            ))}
          </div>
          <h3 className="hr-home-thanks__title">Thank you{me ? `, ${firstName(me.name)}` : ''}!</h3>
          <p className="muted">Your {thanks.label} check-in is in. It shapes onboarding for everyone who joins after you.</p>
          <ul className="hr-home-thanks__next">
            <li>
              <HeartHandshake aria-hidden="true" />
              {thanks.avg <= 2.5 ? 'It sounds like things could be better. Someone from People Ops will reach out for a friendly, no-pressure chat.' : 'People Ops reads every check-in and turns them into better first weeks.'}
            </li>
            {thanks.commented && (
              <li>
                <Lock aria-hidden="true" />
                {thanks.shared ? `${boss} can see your comment, never your scores.` : 'Your comment stays with People Ops.'}
              </li>
            )}
            {next && (
              <li>
                <Clock aria-hidden="true" />
                Next: your {MILESTONE_NOUN[next.milestone]} check-in opens {formatDay(next.opensOn)}.
              </li>
            )}
          </ul>
        </div>
      ) : slot ? (
        <div className="hr-home-pform">
          <div className="hr-home-pform__progress" role="status" aria-live="polite">
            <span>
              {answered}/{PULSE_QUESTIONS.length} answered
            </span>
            <span className="progress" aria-hidden="true">
              <span style={{ width: `${(answered / PULSE_QUESTIONS.length) * 100}%` }} />
            </span>
          </div>
          {PULSE_QUESTIONS.map((q, i) => (
            <fieldset key={q.id} className={cx('hr-home-pq', scores[q.id] && 'is-answered')}>
              <legend className="hr-home-pq__q">
                <span className="hr-home-pq__n" aria-hidden="true">
                  {scores[q.id] ? <Check /> : i + 1}
                </span>
                {q.label}
              </legend>
              <div className="hr-home-pq__scale">
                {PULSE_SCALE.map((p) => (
                  <label key={p.value} className={cx('hr-home-pq__opt', scores[q.id] === p.value && 'is-on')}>
                    <input type="radio" className="sr-only" name={`hr-pulse-${q.id}`} value={p.value} checked={scores[q.id] === p.value} onChange={() => setScores((s) => ({ ...s, [q.id]: p.value }))} />
                    <span className="hr-home-pq__emoji" aria-hidden="true">
                      {p.emoji}
                    </span>
                    <span className="hr-home-pq__label">{p.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <label className="field">
            <span className="field-label">
              Anything you’d like to share? <span className="faint">(optional)</span>
            </span>
            <textarea className="textarea" rows={3} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What’s going well? What would make the next few weeks even better?" />
          </label>
          <div className={cx('hr-home-pform__share', !hasComment && 'is-idle')}>
            <Switch checked={share && hasComment} onChange={setShare} label={`Share my comment with ${boss}`} disabled={!hasComment} />
            <div className="grow">
              <strong>Share my comment with {boss}</strong>
              <span>{hasComment ? (share ? `${boss} will see your comment, not your scores.` : 'Off: your comment stays with People Ops.') : 'Write a comment first if you’d like to share it.'}</span>
            </div>
          </div>
          <div className="hr-home-privacy">
            <Lock aria-hidden="true" />
            <div>
              <strong>Who sees what</strong>
              <ul>
                <li>
                  <b>Your scores</b> always go to People Ops. They read every check-in so they can help, and combine scores anonymously with other new hires’ to improve onboarding.
                </li>
                <li>
                  <b>{manager ? boss : 'Your manager'}</b> never sees your scores: only that you checked in, plus your comment if you choose to share it.
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="hr-home-pnone">
          <EmptyState icon={<Smile />} title={newHire ? 'No check-in is open right now' : 'Pulse check-ins are for your first 90 days'}>
            {newHire
              ? next
                ? `Your ${MILESTONE_NOUN[next.milestone]} check-in opens ${formatDay(next.opensOn)}. We’ll remind you.`
                : 'You’ve shared every check-in. Thank you for helping us welcome people better.'
              : 'They help new joiners tell us how onboarding is going. If something’s on your mind, Ask People Ops any time.'}
          </EmptyState>
          {newHire && <PulseTimeline slots={slots} now={now} />}
        </div>
      )}
    </Modal>
  );
}
