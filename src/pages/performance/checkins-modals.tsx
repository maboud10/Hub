/**
 * Check-in hub dialogs:
 *  - <PeerFeedbackModal>    Start · Stop · Continue for a colleague (2 of 3 lanes, 3+ words), optional
 *                           competency highlight, anonymity switch, and quotes from feedback you already
 *                           gave them so you can build on real moments.
 *  - <UpwardFeedbackModal>  five statements on a 1–5 agreement scale + keep / change. Always anonymous,
 *                           shown to the manager only in aggregate.
 *  - <DeclineModal>         decline a peer / upward request with a reason (the manager is told for peers).
 * Unsent text survives closing the dialog for the session (per request).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Check, CircleSlash, EyeOff, Lightbulb, MessageSquareQuote, Play, Repeat, Send, ShieldCheck, TrendingUp, UserRoundX, Users } from 'lucide-react';
import { Chip } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { COMPETENCIES, COMPETENCY, UPWARD_DIMENSIONS } from '@/performance/constants';
import { canAnswerPeer } from '@/performance/cycle';
import { visibleFeedback } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { CompetencyId, CycleFeedback, Score5, UpwardDimension } from '@/performance/types';
import { toast } from '@/store/toast';
import { dueLabel, report, shortDate, useMinute, usePerfCtx } from './hooks';
import { PfModal } from './ui';
import { COMP_ICON, wordsIn } from './checkins-shared';

/** Remount the dialog body on every open so each session starts fresh (drafts are restored explicitly). */
function useSession(open: boolean) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [session, setSession] = useState(open ? 1 : 0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
  }
  return session;
}

const firstSentence = (s: string) => {
  const m = s.trim().match(/^(.{12,180}?[.!?])(\s|$)/);
  return (m ? m[1] : s.trim()).replace(/\s+/g, ' ');
};

/* ═════════════════════════ Peer feedback ═════════════════════════ */

type Lane = 'start' | 'stop' | 'continue';
interface PeerDraft {
  start: string;
  stop: string;
  continue: string;
  highlight?: CompetencyId;
  anonymous: boolean;
}
const peerDrafts = new Map<string, PeerDraft>();

const LANES: { id: Lane; label: string; icon: ReactNode; tone: string; q: (first: string) => string; ph: string }[] = [
  { id: 'start', label: 'Start', icon: <Play />, tone: 'teal', q: (f) => `What should ${f} start doing?`, ph: 'e.g. Sharing work-in-progress designs with engineering a week earlier' },
  { id: 'stop', label: 'Stop', icon: <CircleSlash />, tone: 'rose', q: (f) => `What should ${f} stop doing?`, ph: 'e.g. Absorbing schedule risk silently until the last stand-up' },
  { id: 'continue', label: 'Continue', icon: <Repeat />, tone: 'violet', q: (f) => `What should ${f} keep doing?`, ph: 'e.g. Opening crits with customer clips — decisions got faster' },
];

export interface AnswerModalProps {
  open: boolean;
  item: CycleFeedback | undefined;
  onClose: () => void;
  /** Switch to the decline dialog for this request. */
  onDecline: (id: string) => void;
}

export function PeerFeedbackModal(props: AnswerModalProps) {
  const session = useSession(props.open);
  if (!session || !props.item) return null;
  return <PeerDialog key={`${session}:${props.item.id}`} {...props} item={props.item} />;
}

function PeerDialog({ open, item, onClose, onDecline }: AnswerModalProps & { item: CycleFeedback }) {
  const ctx = usePerfCtx();
  const now = useMinute();
  const cycle = usePerf((s) => s.cycles.find((c) => c.id === item.cycleId));
  const feedback = usePerf((s) => s.feedback);
  const [saved] = useState(() => peerDrafts.get(item.id));
  const [text, setText] = useState<Record<Lane, string>>({ start: saved?.start ?? '', stop: saved?.stop ?? '', continue: saved?.continue ?? '' });
  const [highlight, setHighlight] = useState<CompetencyId | undefined>(saved?.highlight);
  const [anonymous, setAnonymous] = useState(saved?.anonymous ?? cycle?.peerAnonymous ?? true);
  const sentRef = useRef(false);
  const sendRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (sentRef.current) return;
    const d: PeerDraft = { ...text, highlight, anonymous };
    if (text.start.trim() || text.stop.trim() || text.continue.trim()) peerDrafts.set(item.id, d);
    else peerDrafts.delete(item.id);
  }, [item.id, text, highlight, anonymous]);

  const history = useMemo(() => {
    if (!ctx) return [];
    return visibleFeedback({ feedback }, ctx.v, ctx.users)
      .filter((f) => f.fromId === ctx.me.id && f.toId === item.subjectId)
      .sort((a, b) => b.at - a.at)
      .slice(0, 2);
  }, [ctx, feedback, item.subjectId]);

  if (!ctx) return null;
  const subject = ctx.user(item.subjectId);
  const first = ctx.first(item.subjectId);
  const filled = LANES.filter((l) => wordsIn(text[l.id]) >= 3).length;
  const open_ = !!cycle && canAnswerPeer(cycle, now);
  const disabledReason = !open_ ? 'The peer feedback phase is closed' : filled < 2 ? 'Fill in at least two lanes (3+ words each)' : '';
  const due = dueLabel(item.dueAt, now);
  const mgr = subject?.managerId ? ctx.user(subject.managerId) : undefined;

  const insert = (lane: Lane, sentence: string) => setText((t) => ({ ...t, [lane]: t[lane].trim() ? `${t[lane].trim()} ${sentence}` : sentence }));

  const send = () => {
    if (disabledReason) {
      toast.info(disabledReason);
      return;
    }
    const res = usePerf.getState().submitPeer(item.id, { start: text.start, stop: text.stop, continue: text.continue, highlight, anonymous });
    if (!report(res)) return;
    sentRef.current = true;
    peerDrafts.delete(item.id);
    const r = sendRef.current?.getBoundingClientRect();
    burstConfetti(r ? { x: r.left + r.width / 2, y: r.top } : undefined);
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={880}
      className="pf-ck-modal"
      icon={<Users />}
      title={`Peer feedback for ${first}`}
      subtitle={`${cycle?.name ?? 'Quarterly check-in'} · Start · Stop · Continue — about five minutes`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost pf-ck-modal__decline" onClick={() => onDecline(item.id)}>
            <UserRoundX /> Can’t do it
          </button>
          <span className="pf-ck-modal__meta">
            <b>{filled}/3</b> lanes · 2 needed
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button ref={sendRef} type="button" className="neo-btn neo-btn--plasma" onClick={send} disabled={!!disabledReason} title={disabledReason || 'Share feedback'} data-qa="ck-peer-send">
            <Send /> Share feedback
          </button>
        </>
      }
    >
      <div className="pf-ck-form">
        <div className="pf-ck-subject">
          {subject && <Avatar user={subject} size={40} />}
          <div className="pf-ck-subject__text">
            <b>{subject?.name ?? 'A colleague'}</b>
            <span>
              {subject?.title}
              {item.nominatedBy === item.subjectId ? ` · ${first} asked for your perspective` : mgr ? ` · requested by ${mgr.name.split(' ')[0]}` : ''}
            </span>
          </div>
          <Chip tone={due.tone} size="sm" icon={<CalendarDays />}>
            {due.text}
          </Chip>
        </div>

        {!open_ && cycle && (
          <div className="pf-ck-note" data-tone="warning" role="status">
            <CalendarDays aria-hidden="true" /> The peer feedback window closed on {shortDate(item.dueAt)}. You can still decline so {first}’s manager knows.
          </div>
        )}

        <div className="pf-ck-lanes">
          {LANES.map((l) => {
            const done = wordsIn(text[l.id]) >= 3;
            return (
              <div key={l.id} className={cx('pf-ck-lane', done && 'is-done')} data-tone={l.tone}>
                <label className="pf-ck-lane__head" htmlFor={`ck-${l.id}`}>
                  <span className="pf-ck-lane__icon" aria-hidden="true">
                    {l.icon}
                  </span>
                  <span className="pf-ck-lane__titles">
                    <b>{l.label}</b>
                    <span>{l.q(first)}</span>
                  </span>
                  {done && <Check className="pf-ck-lane__tick" aria-label="Filled" />}
                </label>
                <textarea
                  id={`ck-${l.id}`}
                  className="neo-textarea pf-ck-lane__input"
                  rows={4}
                  value={text[l.id]}
                  onChange={(e) => setText((t) => ({ ...t, [l.id]: e.target.value }))}
                  placeholder={l.ph}
                  data-qa={`ck-peer-${l.id}`}
                />
              </div>
            );
          })}
        </div>

        {history.length > 0 ? (
          <div className="pf-ck-history" aria-label="Feedback you gave before">
            <span className="neo-hud">
              <MessageSquareQuote aria-hidden="true" /> Build on what you told {first} before
            </span>
            {history.map((f) => {
              const s = firstSentence(f.body);
              return (
                <div key={f.id} className="pf-ck-history__item">
                  <span className="pf-ck-history__quote">“{s}”</span>
                  <span className="pf-ck-history__meta">
                    {f.kind === 'praise' ? 'Praise' : 'Constructive'} · {shortDate(f.at)}
                  </span>
                  <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => insert(f.kind === 'praise' ? 'continue' : 'start', s)}>
                    Use in {f.kind === 'praise' ? 'Continue' : 'Start'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pf-hint-row">
            <Lightbulb aria-hidden="true" /> Think of one specific moment from this quarter for each lane — behaviour and effect, not personality.
          </p>
        )}

        <div className="pf-ck-form__row">
          <div className="neo-field grow">
            <span className="neo-label">Biggest strength (optional)</span>
            <div className="pf-ck-comps" role="radiogroup" aria-label="Competency to highlight">
              {COMPETENCIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={highlight === c.id}
                  className="pf-ck-comp"
                  title={c.blurb}
                  onClick={() => setHighlight((h) => (h === c.id ? undefined : c.id))}
                >
                  {COMP_ICON[c.id]}
                  {c.short}
                </button>
              ))}
            </div>
          </div>
          <div className="neo-field">
            <span className="neo-label">Attribution</span>
            <button type="button" role="switch" aria-checked={anonymous} className="pf-ck-switch" onClick={() => setAnonymous((a) => !a)} data-qa="ck-peer-anon">
              <span className="pf-ck-switch__track" aria-hidden="true">
                <i />
              </span>
              <span className="pf-ck-switch__text">
                <b>{anonymous ? 'Anonymous to ' + first : `Signed with your name`}</b>
                <small>{anonymous ? `${mgr ? mgr.name.split(' ')[0] : 'Their manager'} still sees it’s from you` : `${first} will see it came from you`}</small>
              </span>
            </button>
          </div>
        </div>
        {highlight && (
          <p className="pf-hint-row">
            {COMP_ICON[highlight]} {COMPETENCY[highlight].label}: {COMPETENCY[highlight].blurb}
          </p>
        )}
      </div>
    </PfModal>
  );
}

/* ═════════════════════════ Upward feedback ═════════════════════════ */

const LIKERT: { v: Score5; label: string }[] = [
  { v: 1, label: 'Strongly disagree' },
  { v: 2, label: 'Disagree' },
  { v: 3, label: 'Neutral' },
  { v: 4, label: 'Agree' },
  { v: 5, label: 'Strongly agree' },
];

interface UpwardDraft {
  scores: Partial<Record<UpwardDimension, Score5>>;
  keep: string;
  change: string;
}
const upDrafts = new Map<string, UpwardDraft>();

export function UpwardFeedbackModal(props: AnswerModalProps) {
  const session = useSession(props.open);
  if (!session || !props.item) return null;
  return <UpwardDialog key={`${session}:${props.item.id}`} {...props} item={props.item} />;
}

function UpwardDialog({ open, item, onClose, onDecline }: AnswerModalProps & { item: CycleFeedback }) {
  const ctx = usePerfCtx();
  const now = useMinute();
  const cycle = usePerf((s) => s.cycles.find((c) => c.id === item.cycleId));
  const [saved] = useState(() => upDrafts.get(item.id));
  const [scores, setScores] = useState<Partial<Record<UpwardDimension, Score5>>>(saved?.scores ?? {});
  const [keep, setKeep] = useState(saved?.keep ?? '');
  const [change, setChange] = useState(saved?.change ?? '');
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    if (Object.keys(scores).length || keep.trim() || change.trim()) upDrafts.set(item.id, { scores, keep, change });
    else upDrafts.delete(item.id);
  }, [item.id, scores, keep, change]);

  if (!ctx) return null;
  const first = ctx.first(item.subjectId);
  const subject = ctx.user(item.subjectId);
  const rated = UPWARD_DIMENSIONS.filter((d) => scores[d.id]).length;
  const open_ = !!cycle && canAnswerPeer(cycle, now);
  const disabledReason = !open_ ? 'The upward feedback phase is closed' : rated < 5 ? 'Rate every statement' : wordsIn(keep) + wordsIn(change) < 4 ? 'Add a sentence on what to keep or change' : '';
  const due = dueLabel(item.dueAt, now);
  const min = cycle?.upwardMin ?? 3;

  const send = () => {
    if (disabledReason) {
      toast.info(disabledReason);
      return;
    }
    const res = usePerf.getState().submitUpward(item.id, { scores, keep, change });
    if (!report(res)) return;
    sentRef.current = true;
    upDrafts.delete(item.id);
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={720}
      className="pf-ck-modal"
      icon={<TrendingUp />}
      title={`Upward feedback for ${first}`}
      subtitle={`Always anonymous · ${first} only sees averages once ${min}+ reports answer`}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost pf-ck-modal__decline" onClick={() => onDecline(item.id)}>
            <UserRoundX /> Can’t do it
          </button>
          <span className="pf-ck-modal__meta">
            <b>{rated}/5</b> rated
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={send} disabled={!!disabledReason} title={disabledReason || 'Share anonymously'} data-qa="ck-up-send">
            <EyeOff /> Share anonymously
          </button>
        </>
      }
    >
      <div className="pf-ck-form">
        <div className="pf-ck-subject">
          {subject && <Avatar user={subject} size={40} />}
          <div className="pf-ck-subject__text">
            <b>{subject?.name ?? 'Your manager'}</b>
            <span>{subject?.title}</span>
          </div>
          <Chip tone={due.tone} size="sm" icon={<CalendarDays />}>
            {due.text}
          </Chip>
        </div>
        <div className="pf-ck-note" data-tone="app">
          <ShieldCheck aria-hidden="true" /> Your answers are pooled with your teammates’. Nobody — including People Ops dashboards — sees individual upward responses.
        </div>
        {!open_ && cycle && (
          <div className="pf-ck-note" data-tone="warning" role="status">
            <CalendarDays aria-hidden="true" /> The upward feedback window closed on {shortDate(item.dueAt)}.
          </div>
        )}

        <ol className="pf-ck-likerts">
          {UPWARD_DIMENSIONS.map((d, i) => {
            const v = scores[d.id];
            return (
              <li key={d.id} className={cx('pf-ck-likert', v && 'is-set')}>
                <div className="pf-ck-likert__q">
                  <span className="pf-ck-likert__n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="pf-ck-likert__label" id={`ck-up-${d.id}`}>
                    {d.label}
                  </span>
                  <span className="pf-ck-likert__val">{v ? LIKERT[v - 1].label : 'Not rated'}</span>
                </div>
                <div className="pf-ck-likert__scale" role="radiogroup" aria-labelledby={`ck-up-${d.id}`}>
                  {LIKERT.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={v === o.v}
                      aria-label={`${o.v} — ${o.label}`}
                      title={o.label}
                      className="pf-ck-likert__opt"
                      data-v={o.v}
                      onClick={() => setScores((s) => ({ ...s, [d.id]: o.v }))}
                    >
                      {o.v}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="pf-ck-form__row pf-ck-form__row--2">
          <div className="neo-field">
            <label className="neo-label" htmlFor="ck-up-keep">
              Keep doing
            </label>
            <textarea id="ck-up-keep" className="neo-textarea" rows={3} value={keep} onChange={(e) => setKeep(e.target.value)} placeholder={`What does ${first} do that helps you most?`} />
          </div>
          <div className="neo-field">
            <label className="neo-label" htmlFor="ck-up-change">
              Change
            </label>
            <textarea id="ck-up-change" className="neo-textarea" rows={3} value={change} onChange={(e) => setChange(e.target.value)} placeholder="One thing that would make the biggest difference" />
          </div>
        </div>
      </div>
    </PfModal>
  );
}

/* ═════════════════════════ Decline ═════════════════════════ */

const REASONS = ['I haven’t worked closely with them this quarter', 'I’m out of office until after the deadline', 'I’ve been asked for a lot of feedback this cycle'];

export function DeclineModal({ open, item, onClose }: { open: boolean; item: CycleFeedback | undefined; onClose: () => void }) {
  const session = useSession(open);
  if (!session || !item) return null;
  return <DeclineDialog key={`${session}:${item.id}`} open={open} item={item} onClose={onClose} />;
}

function DeclineDialog({ open, item, onClose }: { open: boolean; item: CycleFeedback; onClose: () => void }) {
  const ctx = usePerfCtx();
  const [reason, setReason] = useState('');
  if (!ctx) return null;
  const first = ctx.first(item.subjectId);
  const subject = ctx.user(item.subjectId);
  const mgr = item.kind === 'peer' && subject?.managerId ? ctx.first(subject.managerId) : null;
  const confirm = () => {
    if (report(usePerf.getState().declinePeer(item.id, reason))) onClose();
  };
  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={500}
      className="pf-ck-modal"
      icon={<UserRoundX />}
      title={`Decline ${first}’s ${item.kind === 'peer' ? 'peer' : 'upward'} request?`}
      subtitle={mgr ? `${mgr} will be told so they can pick another reviewer.` : 'Your manager won’t see a reason for upward requests.'}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="neo-btn neo-btn--danger" onClick={confirm} data-qa="ck-decline-confirm">
            <UserRoundX /> Decline request
          </button>
        </>
      }
    >
      <div className="pf-ck-form">
        <div className="pf-ck-reasons" role="group" aria-label="Quick reasons">
          {REASONS.map((r) => (
            <button key={r} type="button" className="pf-ck-reason" aria-pressed={reason === r} onClick={() => setReason((x) => (x === r ? '' : r))}>
              {r}
            </button>
          ))}
        </div>
        <div className="neo-field">
          <label className="neo-label" htmlFor="ck-decline">
            Reason {mgr ? `(shared with ${mgr})` : '(optional)'}
          </label>
          <textarea id="ck-decline" className="neo-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short, kind note helps them find someone else." />
        </div>
      </div>
    </PfModal>
  );
}
