/**
 * HR Home · Ask People Ops: the home card (quick answers, your open
 * questions, "Write to People Ops") and the modal — quick answers first, then
 * a guided new-question form (category incl. Wellbeing & support, subject,
 * message, confidential toggle) and "My questions" with threads, replies and
 * "Mark resolved". Deep link: `/hr?ask=1[&case=<id>]`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, CircleCheckBig, LifeBuoy, Lock, MessageCircleQuestion, MessagesSquare, PenLine, Send } from 'lucide-react';
import type { CaseCategory, HrCase } from '@/hr/types';
import { CASE_CATEGORY_META, CASE_STATUS_META } from '@/hr/constants';
import { canReplyCase } from '@/hr/access';
import { nextPayDate } from '@/hr/engine';
import { daysBetween, formatDay, todayISO } from '@/hr/calendar';
import { useHr } from '@/hr/store';
import { useBalances, useHrViewer } from '@/hr/selectors';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Segmented, Switch } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { HrPanel, ToneBadge, UserLine } from '../components/shared';
import { ago } from './format';

export type AskMode = 'new' | 'cases';
export interface AskOptions {
  caseId?: string | null;
  mode?: AskMode | null;
  category?: CaseCategory | null;
  confidential?: boolean;
}

const CATEGORIES: CaseCategory[] = ['pay', 'leave', 'benefits', 'documents', 'visa', 'wellbeing', 'other'];

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** The signed-in person's cases, most recently updated first. */
export function useMyCases(): HrCase[] {
  const me = useSessionUser();
  const cases = useHr((s) => s.cases);
  return useMemo(() => (me ? cases.filter((c) => c.userId === me.id).sort((a, b) => b.updatedAt - a.updatedAt) : []), [cases, me]);
}

// ───────────────────────── quick answers ─────────────────────────
interface QuickAnswer {
  id: string;
  q: string;
  a: string;
  cta: string;
  to?: string;
  care?: boolean;
}

function useQuickAnswers(): QuickAnswer[] {
  const me = useSessionUser();
  const comp = useHr((s) => (me ? s.comp.find((c) => c.userId === me.id) : undefined));
  const balances = useBalances();
  const now = useNow(60_000);
  return useMemo(() => {
    const annual = balances.find((b) => b.type === 'annual')?.available ?? null;
    const wfa = balances.find((b) => b.type === 'wfa')?.available ?? null;
    const next = comp ? nextPayDate(comp, now) : null;
    const left = next ? daysBetween(todayISO(now), next) : 0;
    return [
      {
        id: 'payday',
        q: 'When is payday?',
        a:
          comp && next
            ? `Salaries land on the ${ordinal(comp.payDay)} of every month. Your next payday is ${formatDay(next, { weekday: 'long', day: 'numeric', month: 'long' })}${left ? ` (in ${left} day${left === 1 ? '' : 's'})` : ' (today!)'}. Your first month is pro-rated from your start date.`
            : 'Salaries land on the 25th of every month. Your pay details are still being set up.',
        to: '/hr/documents?tab=payslips',
        cta: 'See my payslips',
      },
      {
        id: 'salary-cert',
        q: 'How do I get a salary certificate?',
        a: 'Generate it yourself in seconds: Documents → Letters → Salary certificate. It’s issued instantly with a reference number and a verification code that banks and landlords can check.',
        to: '/hr/documents?tab=letters&new=salary-certificate',
        cta: 'Create a salary certificate',
      },
      {
        id: 'leave',
        q: 'How much leave do I have?',
        a:
          annual !== null
            ? `You have ${annual} annual leave day${annual === 1 ? '' : 's'}${wfa !== null ? ` and ${wfa} work-from-anywhere day${wfa === 1 ? '' : 's'}` : ''} left this year. Weekends and public holidays are never deducted.`
            : 'Your balances are on the Time off page, with a breakdown of what’s taken, booked and pending.',
        to: '/hr/time-off',
        cta: 'Open time off',
      },
      {
        id: 'dependent',
        q: 'How do I add a dependent?',
        a: 'Add your spouse, children or parents in Benefits. Life events like a new baby or a marriage can be added any time within 30 days, and People Ops confirms with the insurer within a day.',
        to: '/hr/benefits?enrol=1',
        cta: 'Update my benefits',
      },
      {
        id: 'docs',
        q: 'Where’s my contract?',
        a: 'Everything lives in Documents: your offer letter, contract, agreements, letters and payslips, ready to download any time.',
        to: '/hr/documents?tab=vault',
        cta: 'Open my documents',
      },
      {
        id: 'talk',
        q: 'I need someone to talk to',
        a: 'You’re not alone. Our Employee Assistance Programme offers free, confidential counselling 24/7 for you and your family, and nobody at Helix ever sees who uses it. You can also write to People Ops confidentially.',
        cta: 'Write confidentially',
        care: true,
      },
    ];
  }, [comp, balances, now]);
}

function QuickAnswers({ ids, onCare }: { ids?: string[]; onCare: () => void }) {
  const all = useQuickAnswers();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = ids ? all.filter((a) => ids.includes(a.id)) : all;
  const active = list.find((a) => a.id === openId);
  return (
    <div className="hr-home-qa">
      <div className="hr-home-qa__chips" role="group" aria-label="Quick answers">
        {list.map((a) => (
          <button key={a.id} type="button" className={cx('chip hr-home-qa__chip', openId === a.id && 'is-active', a.care && 'is-care')} aria-expanded={openId === a.id} onClick={() => setOpenId((id) => (id === a.id ? null : a.id))}>
            {a.care && <LifeBuoy aria-hidden="true" />}
            {a.q}
          </button>
        ))}
      </div>
      {active && (
        <div className={cx('hr-home-qa__answer', active.care && 'is-care')} role="region" aria-live="polite" aria-label={active.q}>
          <p>{active.a}</p>
          {active.care ? (
            <button type="button" className="btn btn--sm" onClick={onCare}>
              <Lock /> {active.cta}
            </button>
          ) : (
            active.to && (
              <button type="button" className="btn btn--sm" onClick={() => navigate(active.to!)}>
                {active.cta} <ArrowRight />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CatIcon({ category }: { category: CaseCategory }) {
  const Icon = CASE_CATEGORY_META[category].icon;
  return (
    <span className={cx('hr-home-caticon', category === 'wellbeing' && 'is-care')} aria-hidden="true">
      <Icon />
    </span>
  );
}

// ───────────────────────── card ─────────────────────────
export function AskCard({ onOpen }: { onOpen: (o: AskOptions) => void }) {
  const cases = useMyCases();
  const now = useNow(60_000);
  const active = cases.filter((c) => c.status !== 'closed');
  return (
    <HrPanel className="hr-home-ask" title="Ask People Ops" icon={<MessageCircleQuestion aria-hidden="true" />} sub="Real people, usually within one working day.">
      <QuickAnswers ids={['payday', 'salary-cert', 'leave', 'talk']} onCare={() => onOpen({ mode: 'new', category: 'wellbeing', confidential: true })} />
      {active.length > 0 && (
        <div className="hr-home-ask__cases">
          <span className="stat-label">Your questions</span>
          <ul>
            {active.slice(0, 3).map((c) => (
              <li key={c.id}>
                <button type="button" className={cx('hr-home-ask__case', c.status === 'answered' && 'is-answered')} onClick={() => onOpen({ caseId: c.id, mode: 'cases' })}>
                  <CatIcon category={c.category} />
                  <span className="grow">
                    <span className="hr-home-ask__subject truncate">{c.subject}</span>
                    <span className="text-xs faint">
                      {c.status === 'answered' ? 'People Ops replied' : 'With People Ops'} · {ago(c.updatedAt, now)}
                    </span>
                  </span>
                  {c.confidential && <Lock className="hr-home-ask__lock" aria-label="Confidential" />}
                  {c.status === 'answered' && <span className="hr-home-ask__dot" aria-label="New reply" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="hr-home-ask__foot">
        <button type="button" className="btn btn--primary btn--block" onClick={() => onOpen({ mode: 'new' })}>
          <PenLine /> Write to People Ops
        </button>
        {cases.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={() => onOpen({ mode: 'cases' })}>
            <MessagesSquare /> All my questions ({cases.length})
          </button>
        )}
      </div>
    </HrPanel>
  );
}

// ───────────────────────── modal ─────────────────────────
export function AskModal({ open, onClose, options }: { open: boolean; onClose: () => void; options: AskOptions }) {
  const cases = useMyCases();
  const openCase = useHr((s) => s.openCase);
  const [mode, setMode] = useState<AskMode>('new');
  const [selected, setSelected] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [category, setCategory] = useState<CaseCategory | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const target = options.caseId ? cases.find((c) => c.id === options.caseId) : undefined;
    const answered = cases.find((c) => c.status === 'answered');
    setMode(options.mode ?? (target || answered ? 'cases' : 'new'));
    setSelected(target?.id ?? answered?.id ?? cases.find((c) => c.status !== 'closed')?.id ?? cases[0]?.id ?? null);
    setShowThread(!!target);
    setCategory(options.category ?? null);
    setSubject('');
    setMessage('');
    setConfidential(!!options.confidential);
    setSentId(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = !!category && subject.trim().length >= 4 && message.trim().length >= 10;
  const pick = (c: CaseCategory) => {
    setCategory(c);
    if (c === 'wellbeing') setConfidential(true);
  };
  const send = () => {
    if (!category || !valid) return;
    const res = openCase({ category, subject, message, confidential });
    if (!toast.result(res)) return;
    setSentId(res.id ?? null);
    setSelected(res.id ?? null);
    setShowThread(true);
    setMode('cases');
    setCategory(null);
    setSubject('');
    setMessage('');
    setConfidential(false);
  };
  const startNew = (o?: { category?: CaseCategory; confidential?: boolean }) => {
    setMode('new');
    if (o?.category) pick(o.category);
    if (o?.confidential) setConfidential(true);
  };

  const current = cases.find((c) => c.id === selected) ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ask People Ops"
      subtitle="Real people, usually within one working day."
      icon={
        <span className="hr-home-modal-icon" aria-hidden="true">
          <MessageCircleQuestion />
        </span>
      }
      width={860}
      className="hr-home-askm"
      footer={
        mode === 'new' ? (
          <>
            <span className="hr-home-askm__hint">
              {confidential ? (
                <>
                  <Lock aria-hidden="true" className="inline-icon" /> Confidential: People Ops only
                </>
              ) : (
                'Your manager never sees your questions.'
              )}
            </span>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={send} disabled={!valid}>
              <Send /> Send to People Ops
            </button>
          </>
        ) : undefined
      }
    >
      <div className="hr-home-askm__switch">
        <Segmented
          value={mode}
          onChange={(m) => setMode(m)}
          label="Ask People Ops"
          options={[
            { value: 'new', label: 'New question', icon: <PenLine aria-hidden="true" /> },
            { value: 'cases', label: `My questions${cases.length ? ` (${cases.length})` : ''}`, icon: <MessagesSquare aria-hidden="true" /> },
          ]}
        />
      </div>

      {mode === 'new' ? (
        <div className="hr-home-newq">
          <section className="hr-home-newq__step">
            <h3 className="hr-home-newq__h">
              <span>1</span> Maybe we already have an answer
            </h3>
            <QuickAnswers onCare={() => startNew({ category: 'wellbeing', confidential: true })} />
          </section>

          <fieldset className="hr-home-newq__step">
            <legend className="hr-home-newq__h">
              <span>2</span> What’s it about?
            </legend>
            <div className="hr-home-cats">
              {CATEGORIES.map((c) => {
                const m = CASE_CATEGORY_META[c];
                const Icon = m.icon;
                return (
                  <label key={c} className={cx('hr-home-cat', category === c && 'is-on', c === 'wellbeing' && 'is-care')}>
                    <input type="radio" className="sr-only" name="hr-case-category" value={c} checked={category === c} onChange={() => pick(c)} />
                    <span className="hr-home-cat__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="hr-home-cat__label">{m.label}</span>
                    <span className="hr-home-cat__hint">{m.hint}</span>
                  </label>
                );
              })}
            </div>
            {category === 'wellbeing' && (
              <div className="hr-home-care" role="note">
                <LifeBuoy aria-hidden="true" />
                <p>
                  <b>Thank you for reaching out.</b> If you’re in immediate danger, please contact local emergency services. For confidential counselling any time, the Employee Assistance Programme is free and available 24/7, and nobody at Helix sees who uses it.
                </p>
              </div>
            )}
          </fieldset>

          <section className="hr-home-newq__step">
            <h3 className="hr-home-newq__h">
              <span>3</span> Your question
            </h3>
            <label className="field">
              <span className="field-label">Subject</span>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder={category ? `e.g. ${CASE_CATEGORY_META[category].hint.split(',')[0]}` : 'A few words that sum it up'} />
            </label>
            <label className="field">
              <span className="field-label">Message</span>
              <textarea className="textarea" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Tell us what’s going on and how we can help. The more context, the faster we can sort it." />
              <span className="field-hint">{message.trim().length < 10 ? `${10 - message.trim().length} more characters, please` : 'Looks good. We’ll take it from here.'}</span>
            </label>
          </section>

          <section className="hr-home-newq__step">
            <h3 className="hr-home-newq__h">
              <span>4</span> Privacy
            </h3>
            <div className={cx('hr-home-conf', confidential && 'is-on')}>
              <Switch checked={confidential} onChange={setConfidential} label="Keep this confidential" />
              <div className="grow">
                <strong>
                  <Lock aria-hidden="true" className="inline-icon" /> Keep this confidential
                </strong>
                <span>Only People Ops can open it. Managers never see confidential cases, and notifications and inbox previews hide the details.</span>
              </div>
            </div>
          </section>
        </div>
      ) : cases.length ? (
        <div className={cx('hr-home-cases', showThread && 'is-thread')}>
          <ul className="hr-home-cases__list" aria-label="My questions">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cx('hr-home-cases__item', c.id === current?.id && 'is-active', c.status === 'answered' && 'is-answered')}
                  aria-current={c.id === current?.id ? 'true' : undefined}
                  onClick={() => {
                    setSelected(c.id);
                    setShowThread(true);
                  }}
                >
                  <CatIcon category={c.category} />
                  <span className="grow">
                    <span className="hr-home-cases__subject truncate">{c.subject}</span>
                    <span className="hr-home-cases__meta">
                      <ToneBadge tone={CASE_STATUS_META[c.status].tone}>{CASE_STATUS_META[c.status].label}</ToneBadge>
                      {c.confidential && <Lock aria-label="Confidential" className="hr-home-cases__lock" />}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current ? <CaseThread key={current.id} hrCase={current} justSent={sentId === current.id} onBack={() => setShowThread(false)} onNew={() => startNew()} /> : <div className="hr-home-thread hr-home-thread--empty">Pick a question to read the conversation.</div>}
        </div>
      ) : (
        <EmptyState
          icon={<MessagesSquare />}
          title="No questions yet"
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => startNew()}>
              <PenLine /> Ask your first question
            </button>
          }
        >
          Pay, leave, visas, documents or something harder: People Ops is here for all of it.
        </EmptyState>
      )}
    </Modal>
  );
}

// ───────────────────────── thread ─────────────────────────
function CaseThread({ hrCase: c, justSent, onBack, onNew }: { hrCase: HrCase; justSent: boolean; onBack: () => void; onNew: () => void }) {
  const v = useHrViewer();
  const replyCase = useHr((s) => s.replyCase);
  const closeCase = useHr((s) => s.closeCase);
  const now = useNow(60_000);
  const [text, setText] = useState('');
  const canReply = !!v && canReplyCase(v, c).ok;
  const cat = CASE_CATEGORY_META[c.category];
  const status = CASE_STATUS_META[c.status];

  const reply = () => {
    if (toast.result(replyCase(c.id, text))) setText('');
  };

  return (
    <section className="hr-home-thread" aria-label={c.subject}>
      <header className="hr-home-thread__head">
        <button type="button" className="icon-btn icon-btn--sm hr-home-thread__back" onClick={onBack} aria-label="Back to my questions">
          <ArrowLeft />
        </button>
        <div className="grow">
          <h3 className="hr-home-thread__title">{c.subject}</h3>
          <div className="hr-home-thread__tags">
            <span className="tag">{cat.label}</span>
            <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
            {c.confidential && (
              <span className="hr-home-lock">
                <Lock aria-hidden="true" /> Confidential · only you and People Ops
              </span>
            )}
          </div>
        </div>
      </header>
      {justSent && (
        <div className="hr-home-thread__sent" role="status">
          <Check aria-hidden="true" /> Sent to People Ops. We usually reply within one working day, and you’ll get a notification.
        </div>
      )}
      <ol className="hr-home-msgs">
        {c.messages.map((m) =>
          m.by === c.userId ? (
            <li key={m.id} className="hr-home-msg is-mine">
              <div className="hr-home-msg__bubble">{m.text}</div>
              <span className="hr-home-msg__meta">You · {ago(m.at, now)}</span>
            </li>
          ) : (
            <li key={m.id} className="hr-home-msg is-ops">
              <UserLine userId={m.by} size={28} sub={`People Ops · ${ago(m.at, now)}`} />
              <div className="hr-home-msg__bubble">{m.text}</div>
            </li>
          ),
        )}
      </ol>
      {c.status === 'closed' ? (
        <div className="hr-home-thread__closed">
          <CircleCheckBig aria-hidden="true" />
          <span className="grow">Resolved {ago(c.updatedAt, now)}. Need more help?</span>
          <button type="button" className="btn btn--sm" onClick={onNew}>
            <PenLine /> Ask a new question
          </button>
        </div>
      ) : (
        <div className="hr-home-reply">
          <p className="hr-home-reply__status">{c.status === 'answered' ? 'People Ops replied. Reply if you need more, or mark it resolved.' : 'With People Ops. We usually reply within one working day.'}</p>
          {canReply && (
            <>
              <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" aria-label="Your reply" maxLength={2000} />
              <div className="hr-home-reply__bar">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => toast.result(closeCase(c.id))}>
                  <CircleCheckBig /> Mark resolved
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={reply} disabled={text.trim().length < 2}>
                  <Send /> Reply
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
