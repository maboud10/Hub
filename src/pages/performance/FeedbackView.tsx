/**
 * Continuous feedback — `/performance/feedback`.
 *
 * Tabs (`?tab=received|given|requests|notes`): Received · Given · Requests (waiting on you + your
 * requests with per-respondent status) · Notes (managers/admins: private journal per report).
 * URL params: `?give=1[&to=<userId>]` opens Give feedback · `?request=1` opens Request feedback ·
 * `?answer=<requestId>` answers a request · `?scope=team` (managers: feedback shared with you about
 * your reports) · `?who=<userId>` (notes) · `?focus=<feedbackId>` scrolls to and highlights a card.
 * Hotkeys: C give · R request · S search.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  HandHeart,
  HeartHandshake,
  Hourglass,
  Inbox,
  Lightbulb,
  Lock,
  MessageSquareHeart,
  MessageSquarePlus,
  MessagesSquare,
  NotebookPen,
  Reply,
  SearchX,
  Send,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Avatars, Bar, Chip, NeoEmpty, NeoHead, NeoSearch, NeoStage, NeoTabs, PeoplePicker, type NeoTabItem } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { canViewObjective, isAbove } from '@/performance/access';
import { COMPETENCIES, COMPETENCY } from '@/performance/constants';
import { checkinStreak, startOfWeek, WEEK } from '@/performance/okr';
import { visibleFeedback } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { CompetencyId, Feedback, FeedbackKind, FeedbackRequest, Objective } from '@/performance/types';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import { dueLabel, report, shortDate, useMinute, usePerfCtx, withUndo, type PerfCtx } from './hooks';
import { Kbd, Num, Seg } from './ui';
import { CompetencyChip, GiveFeedbackModal, KindChip, RequestFeedbackModal, VisibilityChip } from './FeedbackModals';
import './styles/feedback.css';

type Tab = 'received' | 'given' | 'requests' | 'notes';
const TABS: Tab[] = ['received', 'given', 'requests', 'notes'];
const DAY = 86_400_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FeedbackView() {
  const ctx = usePerfCtx();
  const now = useMinute();
  const [params, setParams] = useSearchParams();
  const feedback = usePerf((s) => s.feedback);
  const requests = usePerf((s) => s.requests);
  const notes = usePerf((s) => s.notes);
  const objectives = usePerf((s) => s.objectives);
  const keyResults = usePerf((s) => s.keyResults);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<string | null>(null);
  const askedRef = useRef(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | FeedbackKind>('all');
  const [comp, setComp] = useState<CompetencyId | ''>('');
  const [reqScope, setReqScope] = useState<'open' | 'all'>('open');
  const [flash, setFlash] = useState<string | null>(null);

  const me = ctx?.me.id ?? '';
  const canNotes = !!ctx?.canTeam;
  const hasTeam = !!ctx && ctx.reportIds.length > 0;
  const rawTab = params.get('tab') as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) && (rawTab !== 'notes' || canNotes) ? rawTab : 'received';
  const scope: 'me' | 'team' = hasTeam && params.get('scope') === 'team' ? 'team' : 'me';
  const giveFlag = params.get('give');
  const toParam = params.get('to') ?? undefined;
  const answerId = params.get('answer');
  const requestFlag = params.get('request');
  const focusId = params.get('focus');
  const who = params.get('who');

  /** Apply several search-param changes in ONE navigation (two setParams calls in a tick would race). */
  const patch = useCallback(
    (changes: Record<string, string | null>, replace = true) => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null) n.delete(k);
            else n.set(k, v);
          }
          return n;
        },
        { replace },
      );
    },
    [setParams],
  );

  /* ───── ?answer=<requestId> ───── */
  const answerReq = useMemo(() => (answerId ? requests.find((r) => r.id === answerId) : undefined), [answerId, requests]);
  const answerOk = !!answerReq && answerReq.respondentIds.includes(me) && !answerReq.responses[me] && !answerReq.closedAt;
  useEffect(() => {
    if (!answerId || !me) return;
    const r = usePerf.getState().requests.find((x) => x.id === answerId);
    if (r && r.respondentIds.includes(me) && !r.responses[me] && !r.closedAt) return;
    if (!r || !r.respondentIds.includes(me)) toast.info('That request isn’t available', 'It may have been removed or wasn’t addressed to you.');
    else if (r.responses[me]) toast.info('You already answered this request — thank you!');
    else toast.info('This request was closed', 'No answer needed any more.');
    patch({ answer: null });
    // Only validate when the param changes (not when answering updates the store).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerId, me]);

  const giveOpen = !!giveFlag || answerOk;
  const requestOpen = !!requestFlag;
  const closeGive = () => {
    const sent = sentRef.current;
    sentRef.current = null;
    patch(sent && !answerOk ? { give: null, to: null, answer: null, tab: 'given', focus: sent } : { give: null, to: null, answer: null });
  };
  const closeRequest = () => {
    const asked = askedRef.current;
    askedRef.current = false;
    patch(asked ? { request: null, tab: 'requests' } : { request: null });
  };

  /* ───── ?focus=<feedbackId> → scroll + highlight ───── */
  useEffect(() => {
    if (!focusId) return;
    setQ('');
    setKind('all');
    setComp('');
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-fb="${CSS.escape(focusId)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setFlash(focusId);
        window.setTimeout(() => setFlash((f) => (f === focusId ? null : f)), 2600);
      }
      patch({ focus: null });
    }, 140);
    return () => window.clearTimeout(t);
  }, [focusId, patch]);

  /* ───── Data ───── */
  const visible = useMemo(() => (ctx ? visibleFeedback({ feedback }, ctx.v, ctx.users) : []), [feedback, ctx]);
  const received = useMemo(() => visible.filter((f) => f.toId === me), [visible, me]);
  const given = useMemo(() => visible.filter((f) => f.fromId === me), [visible, me]);
  const team = useMemo(() => (ctx ? visible.filter((f) => ctx.reportIds.includes(f.toId) && f.fromId !== me && f.toId !== me) : []), [visible, ctx, me]);
  const objById = useMemo(() => new Map(objectives.map((o) => [o.id, o])), [objectives]);
  const reqById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);
  const fbIds = useMemo(() => new Set(feedback.map((f) => f.id)), [feedback]);
  const base = tab === 'given' ? given : scope === 'team' ? team : received;
  const filtered = q.trim() !== '' || kind !== 'all' || !!comp;

  const list = useMemo(() => {
    if (!ctx) return [] as Feedback[];
    const s = q.trim().toLowerCase();
    return base
      .filter((f) => {
        if (kind !== 'all' && f.kind !== kind) return false;
        if (comp && f.competency !== comp) return false;
        if (!s) return true;
        const hay = [f.body, f.situation, f.behaviour, f.impact, ctx.name(f.fromId), ctx.name(f.toId), f.competency ? COMPETENCY[f.competency].label : '', f.objectiveId ? objById.get(f.objectiveId)?.title : '']
          .join(' ')
          .toLowerCase();
        return hay.includes(s);
      })
      .sort((a, b) => b.at - a.at);
  }, [ctx, base, q, kind, comp, objById]);

  const groups = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const buckets: { key: string; label: string; items: Feedback[] }[] = [
      { key: 'today', label: 'Today', items: [] },
      { key: 'week', label: 'This week', items: [] },
      { key: 'month', label: 'Last 30 days', items: [] },
      { key: 'older', label: 'Earlier', items: [] },
    ];
    for (const f of list) buckets[f.at >= start.getTime() ? 0 : now - f.at < 7 * DAY ? 1 : now - f.at < 30 * DAY ? 2 : 3].items.push(f);
    return buckets.filter((b) => b.items.length);
  }, [list, now]);

  const waiting = useMemo(() => requests.filter((r) => !r.closedAt && r.respondentIds.includes(me) && !r.responses[me]).sort((a, b) => a.dueAt - b.dueAt), [requests, me]);
  const mineReq = useMemo(() => requests.filter((r) => r.requesterId === me).sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt) || b.createdAt - a.createdAt), [requests, me]);
  const answered = useMemo(
    () =>
      requests
        .filter((r) => r.respondentIds.includes(me) && !!r.responses[me])
        .sort((a, b) => (b.responses[me]?.at ?? 0) - (a.responses[me]?.at ?? 0))
        .slice(0, 6),
    [requests, me],
  );
  const myNotesCount = useMemo(() => notes.filter((n) => n.authorId === me).length, [notes, me]);
  const goal = useMemo(() => {
    const kr = keyResults.find((k) => k.id === 'kr-ppl-weekly');
    const o = kr ? objById.get(kr.objectiveId) : undefined;
    if (!ctx || !kr || !o || !canViewObjective(ctx.v, ctx.users, o)) return undefined;
    return { pct: Math.round(kr.current), target: Math.round(kr.target), to: `/performance/okrs/${o.id}` };
  }, [keyResults, objById, ctx]);

  useHotkeys(
    {
      c: (e) => {
        e.preventDefault();
        patch({ give: '1' }, false);
      },
      r: (e) => {
        e.preventDefault();
        patch({ request: '1' }, false);
      },
      s: (e) => {
        if (!searchRef.current) return;
        e.preventDefault();
        searchRef.current.focus();
      },
    },
    !giveOpen && !requestOpen,
  );

  if (!ctx) return null;

  const newWeek = received.filter((f) => now - f.at < 7 * DAY).length;
  const sub =
    [waiting.length ? `${waiting.length} request${waiting.length === 1 ? '' : 's'} waiting on you` : null, newWeek ? `${newWeek} new for you this week` : null].filter(Boolean).join(' · ') ||
    'Specific, kind and timely — feedback that helps people grow';

  const tabs: NeoTabItem<Tab>[] = [
    { value: 'received', label: 'Received', icon: <Inbox />, count: received.length },
    { value: 'given', label: 'Given', icon: <Send />, count: given.length },
    { value: 'requests', label: 'Requests', icon: <MessagesSquare />, count: waiting.length || null, title: 'Feedback requests' },
  ];
  if (canNotes) tabs.push({ value: 'notes', label: 'Notes', icon: <NotebookPen />, count: myNotesCount || null, title: 'Private notes — only you can see them' });

  const openGive = (to?: string) => patch(to ? { give: '1', to } : { give: '1' }, false);
  const openAnswer = (id: string) => patch({ answer: id }, false);
  const openRequest = () => patch({ request: '1' }, false);
  const clearFilters = () => {
    setQ('');
    setKind('all');
    setComp('');
  };

  let content: ReactNode;
  if (tab === 'notes') {
    content = <NotesPanel ctx={ctx} now={now} who={who} onWho={(id) => patch({ who: id })} onGive={openGive} />;
  } else if (tab === 'requests') {
    content = (
      <RequestsPanel
        ctx={ctx}
        now={now}
        q={q}
        scope={reqScope}
        waiting={waiting}
        mine={mineReq}
        answered={answered}
        hasFeedback={(id) => fbIds.has(id)}
        onAnswer={openAnswer}
        onRequest={openRequest}
        onRead={(id) => patch({ tab: null, scope: null, focus: id })}
      />
    );
  } else {
    const empty = filtered ? (
      <NeoEmpty icon={<SearchX />} title="Nothing matches these filters" action={<button type="button" className="neo-btn neo-btn--soft" onClick={clearFilters}>Clear filters</button>}>
        Try a different word, kind or competency.
      </NeoEmpty>
    ) : tab === 'given' ? (
      <NeoEmpty icon={<HandHeart />} title="You haven’t given feedback yet" action={<button type="button" className="neo-btn neo-btn--plasma" onClick={() => openGive()}><HandHeart /> Give feedback</button>}>
        Catch someone doing something great — the SBI coach makes it quick and specific.
      </NeoEmpty>
    ) : scope === 'team' ? (
      <NeoEmpty icon={<Users />} title="Nothing shared about your team yet" action={<button type="button" className="neo-btn neo-btn--soft" onClick={() => openGive()}><HandHeart /> Give feedback</button>}>
        When someone gives your reports feedback marked “recipient + manager”, it appears here.
      </NeoEmpty>
    ) : (
      <NeoEmpty icon={<Inbox />} title="No feedback yet" action={<button type="button" className="neo-btn neo-btn--plasma" onClick={openRequest}><MessageSquarePlus /> Request feedback</button>}>
        Feedback you receive lands here. Ask a few people about something you’re working on.
      </NeoEmpty>
    );
    content = (
      <div className="pf-fb-layout">
        <div className="pf-fb-main">
          {waiting.length > 0 && (
            <div className="pf-fb-callout">
              <Inbox aria-hidden="true" />
              <span className="grow">
                {waiting.length} request{waiting.length === 1 ? ' is' : 's are'} waiting on you
              </span>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => patch({ tab: 'requests' })}>
                Answer
              </button>
            </div>
          )}
          {tab === 'received' && hasTeam && (
            <div className="pf-fb-scope">
              <Seg
                size="sm"
                value={scope}
                onChange={(v) => patch({ scope: v === 'team' ? 'team' : null })}
                label="Whose feedback"
                options={[
                  { value: 'me', label: `For you · ${received.length}` },
                  { value: 'team', label: `Your team · ${team.length}`, title: 'Feedback your reports received and shared with you' },
                ]}
              />
              {scope === 'team' && <span className="neo-hud">Shared with you as their manager</span>}
            </div>
          )}
          {groups.length
            ? groups.map((g) => (
                <section key={g.key} className="pf-fb-group" aria-label={g.label}>
                  <div className="pf-fb-group__head">
                    <span className="neo-hud">{g.label}</span>
                    <span className="neo-count">{g.items.length}</span>
                  </div>
                  <div className="pf-fb-group neo-stagger">
                    {g.items.map((f, i) => (
                      <FeedbackCard key={f.id} f={f} ctx={ctx} now={now} obj={f.objectiveId ? objById.get(f.objectiveId) : undefined} req={f.requestId ? reqById.get(f.requestId) : undefined} flash={flash === f.id} index={i} />
                    ))}
                  </div>
                </section>
              ))
            : empty}
        </div>
        <aside className="pf-fb-aside" aria-label="Your feedback habits">
          {waiting.length > 0 && <WaitingCard items={waiting} ctx={ctx} now={now} onAnswer={openAnswer} onAll={() => patch({ tab: 'requests' })} />}
          <RhythmCard given={given} now={now} goal={goal} />
        </aside>
      </div>
    );
  }

  return (
    <NeoStage label="Feedback">
      <NeoHead
        icon={<MessageSquareHeart />}
        eyebrow="Reflect · Continuous feedback"
        title="Feedback"
        sub={sub}
        actions={
          <>
            <button type="button" className="neo-btn neo-btn--soft" onClick={openRequest} data-tip="Request feedback · R" data-tip-pos="bottom" data-qa="fb-request" aria-label="Request feedback">
              <MessageSquarePlus />
              <span className="neo-btn__label">Request</span>
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openGive()} data-qa="fb-give" aria-label="Give feedback">
              <HandHeart />
              <span className="neo-btn__label">Give feedback</span>
              <span className="pf-fb-kbdhint">
                <Kbd>C</Kbd>
              </span>
            </button>
          </>
        }
      />
      <div className="neo-toolbar pf-fb-toolbar">
        <NeoTabs variant="underline" className="pf-fb-tabs" value={tab} onChange={(v) => patch({ tab: v === 'received' ? null : v, focus: null })} items={tabs} label="Feedback views" />
        {tab !== 'notes' && (
          <div className="pf-fb-filters">
            <NeoSearch value={q} onChange={setQ} placeholder={tab === 'requests' ? 'Search requests…' : 'Search feedback…'} kbd="S" inputRef={searchRef} size="sm" label="Search" />
            {tab === 'requests' ? (
              <Seg
                size="sm"
                value={reqScope}
                onChange={setReqScope}
                label="Which requests"
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'all', label: 'All' },
                ]}
              />
            ) : (
              <>
                <Seg
                  size="sm"
                  value={kind}
                  onChange={setKind}
                  label="Kind"
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'praise', label: 'Praise' },
                    { value: 'constructive', label: 'Constructive' },
                  ]}
                />
                <select className="neo-select neo-select--sm" value={comp} onChange={(e) => setComp(e.target.value as CompetencyId | '')} aria-label="Competency">
                  <option value="">All competencies</option>
                  {COMPETENCIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
      </div>
      <div className="neo-body neo-pad">{content}</div>

      <GiveFeedbackModal
        open={giveOpen}
        onClose={closeGive}
        toId={toParam}
        requestId={answerOk ? (answerId ?? undefined) : undefined}
        onSent={(id) => {
          sentRef.current = id;
        }}
      />
      <RequestFeedbackModal
        open={requestOpen}
        onClose={closeRequest}
        onSent={() => {
          askedRef.current = true;
        }}
      />
    </NeoStage>
  );
}

/* ═════════════════════════ Feedback card ═════════════════════════ */

function FeedbackCard({ f, ctx, now, obj, req, flash, index }: { f: Feedback; ctx: PerfCtx; now: number; obj?: Objective; req?: FeedbackRequest; flash: boolean; index: number }) {
  const me = ctx.me.id;
  const isTo = f.toId === me;
  const isFrom = f.fromId === me;
  const from = ctx.user(f.fromId);
  const to = ctx.user(f.toId);
  const showObj = !!obj && canViewObjective(ctx.v, ctx.users, obj);
  const thank = () => report(usePerf.getState().thankFeedback(f.id), `Thanks sent to ${ctx.first(f.fromId)}`);
  const remove = () => withUndo(usePerf.getState().deleteFeedback(f.id), 'Feedback deleted');
  const other = isFrom ? to : from;
  return (
    <article
      className={cx('neo-card pf-fb-card', flash && 'is-flash')}
      data-kind={f.kind}
      data-fb={f.id}
      style={{ '--i': index } as CSSProperties}
      aria-label={`${f.kind === 'praise' ? 'Praise' : 'Constructive feedback'} from ${from?.name ?? 'someone'} to ${to?.name ?? 'someone'}`}
    >
      <header className="pf-fb-card__head">
        <span className="pf-fb-pair" aria-hidden="true">
          {from && <Avatar user={from} size={34} />}
          <span className="pf-fb-pair__arrow">
            <ArrowRight />
          </span>
          {to && <Avatar user={to} size={34} />}
        </span>
        <div className="pf-fb-card__names">
          <div className="pf-fb-card__line">
            <b>{isFrom ? 'You' : (from?.name ?? 'Someone')}</b> <span className="pf-faint">to</span> <b>{isTo ? 'you' : (to?.name ?? 'someone')}</b>
          </div>
          <div className="pf-fb-card__sub" title={new Date(f.at).toLocaleString()}>
            {relativeTime(f.at, now)}
            {other?.title ? ` · ${other.title}` : ''}
          </div>
        </div>
        <KindChip kind={f.kind} />
      </header>
      <p className="pf-fb-card__body">{f.body}</p>
      <SbiTrail f={f} />
      <footer className="pf-fb-card__foot">
        <div className="pf-fb-chips">
          <VisibilityChip visibility={f.visibility} viewerIsRecipient={isTo} />
          {f.competency && <CompetencyChip id={f.competency} />}
          {showObj && obj && (
            <Link to={`/performance/okrs/${obj.id}`} className="neo-chip neo-chip--sm pf-fb-okr" data-tone="violet" title={`Linked OKR: ${obj.title}`}>
              <Target aria-hidden="true" />
              <span className="truncate">{obj.title}</span>
            </Link>
          )}
          {f.kudosValue && (
            <Chip tone="amber" size="sm" icon={<Trophy />} title="Also shared as kudos on the Hub">
              Kudos · {cap(f.kudosValue)}
            </Chip>
          )}
          {req && (
            <Chip tone="slate" size="sm" icon={<Reply />} title={`Answer to the request “${req.topic}”`} className="pf-fb-re">
              <span className="truncate">Re: {req.topic}</span>
            </Chip>
          )}
        </div>
        <div className="pf-fb-actions">
          {isTo &&
            (f.thankedAt ? (
              <span className="pf-fb-thanked" title={`You said thanks ${relativeTime(f.thankedAt, now)}`}>
                <HeartHandshake aria-hidden="true" /> Thanked
              </span>
            ) : (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={thank} data-qa="fb-thank">
                <HandHeart /> Say thanks
              </button>
            ))}
          {isFrom && f.thankedAt && (
            <span className="pf-fb-thanked" title={`Thanked ${relativeTime(f.thankedAt, now)}`}>
              <HeartHandshake aria-hidden="true" /> {ctx.first(f.toId)} said thanks
            </span>
          )}
          {isFrom && (
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Delete feedback" data-tip="Delete" onClick={remove}>
              <Trash2 />
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

/** Subtle Situation → Behaviour → Impact anatomy. Expanded when it adds context beyond the message. */
function SbiTrail({ f }: { f: Feedback }) {
  const steps: [string, string][] = [];
  if (f.situation?.trim()) steps.push(['Situation', f.situation]);
  if (f.behaviour?.trim()) steps.push(['Behaviour', f.behaviour]);
  if (f.impact?.trim()) steps.push(['Impact', f.impact]);
  const covered = steps.every(([, t]) => norm(f.body).includes(norm(t)));
  const [open, setOpen] = useState(!covered);
  if (steps.length < 2) return null;
  return (
    <div className="pf-fb-sbi">
      <button type="button" className="pf-fb-sbi__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={open ? 'Hide the structure' : 'Show situation, behaviour and impact'}>
        {steps.map(([label]) => (
          <span key={label} className="pf-fb-sbi__pip">
            <i />
            {label}
          </span>
        ))}
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <ol className="pf-fb-sbi__steps" style={{ '--n': steps.length } as CSSProperties}>
          {steps.map(([label, text]) => (
            <li key={label} className="pf-fb-sbi__step">
              <span className="pf-fb-sbi__label">{label}</span>
              <span className="pf-fb-sbi__text">{text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ═════════════════════════ Aside ═════════════════════════ */

function WaitingCard({ items, ctx, now, onAnswer, onAll }: { items: FeedbackRequest[]; ctx: PerfCtx; now: number; onAnswer: (id: string) => void; onAll: () => void }) {
  return (
    <section className="neo-card pf-fb-waiting" aria-label="Waiting on you">
      <div className="pf-row">
        <span className="neo-hud grow">Waiting on you</span>
        <span className="neo-count neo-count--app">{items.length}</span>
      </div>
      <div className="neo-list">
        {items.slice(0, 3).map((r) => {
          const u = ctx.user(r.requesterId);
          const due = dueLabel(r.dueAt, now);
          return (
            <div key={r.id} className="neo-li">
              {u && <Avatar user={u} size={30} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="truncate text-sm" style={{ fontWeight: 600 }}>
                  {r.topic}
                </div>
                <div className="truncate text-xs pf-faint">
                  {u ? u.name.split(' ')[0] : 'Someone'} · {due.text}
                </div>
              </div>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => onAnswer(r.id)}>
                Answer
              </button>
            </div>
          );
        })}
      </div>
      {items.length > 3 && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onAll}>
          See all {items.length} <ArrowRight />
        </button>
      )}
    </section>
  );
}

function RhythmCard({ given, now, goal }: { given: Feedback[]; now: number; goal?: { pct: number; target: number; to: string } }) {
  const thisWeek = startOfWeek(now);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = thisWeek - (7 - i) * WEEK;
    const items = given.filter((f) => f.at >= start && f.at < start + WEEK);
    return { start, praise: items.filter((f) => f.kind === 'praise').length, constructive: items.filter((f) => f.kind === 'constructive').length };
  });
  const max = Math.max(2, ...weeks.map((w) => w.praise + w.constructive));
  const streak = checkinStreak(
    given.map((f) => f.at),
    now,
  );
  const recent = given.filter((f) => now - f.at <= 60 * DAY);
  const praise = recent.filter((f) => f.kind === 'praise').length;
  const constructive = recent.length - praise;
  const tip = !recent.length
    ? 'Catch someone doing something great today — specific praise takes two minutes.'
    : !constructive
      ? 'Growth feedback, kindly delivered, is a gift. Try one constructive note this week.'
      : !praise
        ? 'Balance it out — celebrate a win you noticed recently.'
        : 'A healthy mix of praise and growth feedback. Keep it specific.';
  return (
    <section className="neo-card pf-fb-rhythm" aria-label="Your feedback rhythm">
      <div className="pf-row">
        <span className="neo-hud grow">Your feedback rhythm</span>
        <Zap aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--app-ink)' }} />
      </div>
      <div className="pf-fb-streak">
        <Num value={streak} />
        <span className="pf-muted text-sm">{streak ? `week${streak === 1 ? '' : 's'} in a row` : 'No streak yet — give feedback this week'}</span>
      </div>
      <div className="pf-fb-bars" role="img" aria-label={`Feedback given over the last 8 weeks: ${weeks.map((w) => w.praise + w.constructive).join(', ')}`}>
        {weeks.map((w, i) => (
          <span key={w.start} className={cx('pf-fb-bars__col', i === 7 && 'is-now')} title={`Week of ${shortDate(w.start)} · ${w.praise} praise, ${w.constructive} constructive`}>
            {w.praise > 0 && <i data-k="praise" style={{ height: `${(w.praise / max) * 100}%` }} />}
            {w.constructive > 0 && <i data-k="constructive" style={{ height: `${(w.constructive / max) * 100}%` }} />}
          </span>
        ))}
      </div>
      <div className="pf-fb-legend">
        <span>
          <i /> Praise {praise}
        </span>
        <span>
          <i data-k="constructive" /> Constructive {constructive}
        </span>
        <span>· last 60 days</span>
      </div>
      <div className="pf-fb-tipline">
        <Lightbulb aria-hidden="true" />
        <span>{tip}</span>
      </div>
      {goal && (
        <Link to={goal.to} className="pf-fb-goal" title="Company OKR: Make feedback a weekly habit">
          <span className="pf-row">
            <span className="grow">Company goal · giving feedback weekly</span>
            <b className="neo-num">
              {goal.pct}% → {goal.target}%
            </b>
          </span>
          <Bar value={goal.pct / Math.max(1, goal.target)} label="Company feedback habit goal" />
        </Link>
      )}
    </section>
  );
}

/* ═════════════════════════ Requests ═════════════════════════ */

function RequestsPanel({
  ctx,
  now,
  q,
  scope,
  waiting,
  mine,
  answered,
  hasFeedback,
  onAnswer,
  onRequest,
  onRead,
}: {
  ctx: PerfCtx;
  now: number;
  q: string;
  scope: 'open' | 'all';
  waiting: FeedbackRequest[];
  mine: FeedbackRequest[];
  answered: FeedbackRequest[];
  hasFeedback: (id: string) => boolean;
  onAnswer: (id: string) => void;
  onRequest: () => void;
  onRead: (feedbackId: string) => void;
}) {
  const s = q.trim().toLowerCase();
  const match = (r: FeedbackRequest) => !s || [r.topic, r.note ?? '', ctx.name(r.requesterId), ...r.respondentIds.map((id) => ctx.name(id))].join(' ').toLowerCase().includes(s);
  const w = waiting.filter(match);
  const m = mine.filter((r) => match(r) && (scope === 'all' || !r.closedAt));
  const a = scope === 'all' ? answered.filter(match) : [];
  if (!waiting.length && !mine.length && !answered.length)
    return (
      <NeoEmpty icon={<MessagesSquare />} title="No feedback requests yet" action={<button type="button" className="neo-btn neo-btn--plasma" onClick={onRequest}><MessageSquarePlus /> Request feedback</button>}>
        Ask two or three people about something specific — a launch, a meeting you ran, a skill you’re building.
      </NeoEmpty>
    );
  return (
    <div className="pf-fb-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 920 }}>
      <div className="pf-fb-main">
        <section className="pf-fb-section" aria-label="Waiting on you">
          <div className="pf-fb-section__head">
            <h2>Waiting on you</h2>
            <span className={cx('neo-count', w.length > 0 && 'neo-count--app')}>{w.length}</span>
          </div>
          {w.length ? (
            <div className="pf-fb-section neo-stagger">
              {w.map((r, i) => (
                <WaitingItem key={r.id} r={r} ctx={ctx} now={now} onAnswer={onAnswer} index={i} />
              ))}
            </div>
          ) : (
            <div className="neo-card">
              <NeoEmpty compact icon={<Check />} title={s ? 'No matching requests' : 'You’re all caught up'}>
                {s ? 'Try a different search.' : 'No one is waiting on your feedback right now.'}
              </NeoEmpty>
            </div>
          )}
        </section>

        <section className="pf-fb-section" aria-label="Your requests">
          <div className="pf-fb-section__head">
            <h2>Your requests</h2>
            <span className="neo-count">{m.length}</span>
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onRequest} style={{ marginLeft: 'auto' }}>
              <MessageSquarePlus /> New request
            </button>
          </div>
          {m.length ? (
            <div className="pf-fb-section neo-stagger">
              {m.map((r, i) => (
                <MyRequestItem key={r.id} r={r} ctx={ctx} now={now} hasFeedback={hasFeedback} onRead={onRead} index={i} />
              ))}
            </div>
          ) : (
            <div className="neo-card">
              <NeoEmpty compact icon={<MessageSquarePlus />} title={mine.length ? 'No open requests' : 'You haven’t asked for feedback yet'} action={<button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onRequest}>Request feedback</button>}>
                {mine.length ? 'Switch to “All” to see closed requests.' : 'Specific asks get specific answers.'}
              </NeoEmpty>
            </div>
          )}
        </section>

        {a.length > 0 && (
          <section className="pf-fb-section" aria-label="You answered">
            <div className="pf-fb-section__head">
              <h2>You answered</h2>
              <span className="neo-count">{a.length}</span>
            </div>
            <div className="neo-card neo-card--flush">
              <div className="neo-list pf-fb-history">
                {a.map((r) => {
                  const u = ctx.user(r.requesterId);
                  const resp = r.responses[ctx.me.id];
                  return (
                    <div key={r.id} className="neo-li">
                      {u && <Avatar user={u} size={28} />}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="truncate text-sm" style={{ fontWeight: 600 }}>
                          {r.topic}
                        </div>
                        <div className="truncate text-xs pf-faint">
                          For {u?.name ?? 'someone'} · {resp ? relativeTime(resp.at, now) : ''}
                        </div>
                      </div>
                      {resp?.declinedAt ? (
                        <Chip tone="slate" size="sm" icon={<X />}>
                          Passed
                        </Chip>
                      ) : (
                        <Chip tone="success" size="sm" icon={<Check />}>
                          Answered
                        </Chip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function WaitingItem({ r, ctx, now, onAnswer, index }: { r: FeedbackRequest; ctx: PerfCtx; now: number; onAnswer: (id: string) => void; index: number }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirm]);
  const requester = ctx.user(r.requesterId);
  const others = r.respondentIds
    .filter((id) => id !== ctx.me.id)
    .map((id) => ctx.user(id))
    .filter((u): u is User => !!u);
  const due = dueLabel(r.dueAt, now);
  const decline = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    report(usePerf.getState().declineRequest(r.id), `We let ${ctx.first(r.requesterId)} know you’ll pass`);
  };
  return (
    <article className="neo-card pf-fb-req" data-state="waiting" style={{ '--i': index } as CSSProperties}>
      <header className="pf-fb-req__head">
        {requester && <Avatar user={requester} size={38} presence />}
        <div className="pf-fb-req__titles">
          <div className="neo-hud">
            {requester ? requester.name.split(' ')[0] : 'Someone'} asked · {relativeTime(r.createdAt, now)}
          </div>
          <h3 className="pf-fb-req__topic">{r.topic}</h3>
        </div>
        <Chip tone={due.tone} size="sm" icon={<CalendarClock />}>
          {due.text}
        </Chip>
      </header>
      {r.note && <p className="pf-fb-req__note">“{r.note}”</p>}
      <footer className="pf-fb-req__foot">
        {others.length > 0 && (
          <span className="pf-row text-xs pf-faint" style={{ gap: 6 }}>
            Also asked <Avatars users={others} size={22} max={3} />
          </span>
        )}
        <span className="pf-spacer" />
        <button type="button" className={cx('neo-btn neo-btn--sm', confirm ? 'neo-btn--danger' : 'neo-btn--ghost')} onClick={decline}>
          {confirm ? 'Confirm pass' : 'Decline'}
        </button>
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => onAnswer(r.id)} data-qa="fb-respond">
          <Reply /> Respond
        </button>
      </footer>
    </article>
  );
}

function MyRequestItem({ r, ctx, now, hasFeedback, onRead, index }: { r: FeedbackRequest; ctx: PerfCtx; now: number; hasFeedback: (id: string) => boolean; onRead: (id: string) => void; index: number }) {
  const total = r.respondentIds.length;
  const answeredN = r.respondentIds.filter((id) => r.responses[id]?.feedbackId).length;
  const passedN = r.respondentIds.filter((id) => r.responses[id]?.declinedAt).length;
  const pending = r.respondentIds.filter((id) => !r.responses[id]);
  const closed = !!r.closedAt;
  const due = dueLabel(r.dueAt, now);
  return (
    <article className="neo-card pf-fb-req" data-state={closed ? 'closed' : 'open'} style={{ '--i': index } as CSSProperties}>
      <header className="pf-fb-req__head">
        <span className="pf-section__icon" aria-hidden="true">
          <MessagesSquare />
        </span>
        <div className="pf-fb-req__titles">
          <div className="neo-hud">You asked · {relativeTime(r.createdAt, now)}</div>
          <h3 className="pf-fb-req__topic">{r.topic}</h3>
        </div>
        {closed ? (
          <Chip tone="slate" size="sm" icon={<Check />}>
            Closed
          </Chip>
        ) : pending.length ? (
          <Chip tone={due.tone} size="sm" icon={<CalendarClock />}>
            {due.text}
          </Chip>
        ) : (
          <Chip tone="success" size="sm" icon={<Check />}>
            Everyone replied
          </Chip>
        )}
      </header>
      {r.note && <p className="pf-fb-req__note">“{r.note}”</p>}
      <div className="pf-fb-req__progress">
        <Bar value={total ? answeredN / total : 0} label={`${answeredN} of ${total} answered`} />
        <span>
          {answeredN}/{total} answered{passedN ? ` · ${passedN} passed` : ''}
        </span>
      </div>
      <div className="pf-fb-resp">
        {r.respondentIds.map((id) => {
          const u = ctx.user(id);
          const resp = r.responses[id];
          const fbId = resp?.feedbackId;
          return (
            <div key={id} className="pf-fb-resp__row">
              {u && <Avatar user={u} size={24} />}
              <span className="pf-fb-resp__name">{u?.name ?? 'Unknown'}</span>
              {fbId ? (
                hasFeedback(fbId) ? (
                  <Chip tone="success" size="sm" icon={<Check />} onClick={() => onRead(fbId)} title="Read the answer">
                    Read
                  </Chip>
                ) : (
                  <Chip tone="success" size="sm" icon={<Check />}>
                    Answered
                  </Chip>
                )
              ) : resp?.declinedAt ? (
                <Chip tone="slate" size="sm" icon={<X />}>
                  Passed
                </Chip>
              ) : (
                <Chip tone={closed ? 'slate' : r.dueAt < now ? 'danger' : 'warning'} size="sm" icon={<Hourglass />}>
                  {closed ? 'No reply' : r.dueAt < now ? 'Overdue' : 'Waiting'}
                </Chip>
              )}
            </div>
          );
        })}
      </div>
      {!closed && (
        <footer className="pf-fb-req__foot">
          <span className="pf-spacer" />
          {pending.length > 0 && (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => report(usePerf.getState().remindRequest(r.id))}>
              <Bell /> Remind {pending.length}
            </button>
          )}
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => report(usePerf.getState().closeRequest(r.id))}>
            <Check /> Close request
          </button>
        </footer>
      )}
    </article>
  );
}

/* ═════════════════════════ Private notes ═════════════════════════ */

const NOTE_PROMPTS = [
  { label: 'Win to remember', prefix: 'Win to remember: ' },
  { label: 'Coaching moment', prefix: 'Coaching moment: ' },
  { label: 'Raise in our 1:1', prefix: 'Raise in our next 1:1: ' },
  { label: 'Context for the review', prefix: 'Context for the review: ' },
];

function NotesPanel({ ctx, now, who, onWho, onGive }: { ctx: PerfCtx; now: number; who: string | null; onWho: (id: string) => void; onGive: (id: string) => void }) {
  const notes = usePerf((s) => s.notes);
  const series = usePerf((s) => s.series);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const me = ctx.me.id;
  const mine = useMemo(() => notes.filter((n) => n.authorId === me).sort((a, b) => b.at - a.at), [notes, me]);
  const allowed = useCallback((id: string) => id !== me && !!ctx.user(id)?.active && (ctx.isAdmin || isAbove(ctx.users, me, id)), [ctx, me]);
  const groups = useMemo(() => {
    const direct = ctx.reportIds.filter(allowed);
    const org = ctx.orgIds.filter((id) => !direct.includes(id) && allowed(id));
    const extra = [...new Set([...mine.map((n) => n.subjectId), ...(who ? [who] : [])])].filter((id) => !direct.includes(id) && !org.includes(id) && allowed(id));
    return [
      { label: 'Direct reports', ids: direct },
      { label: 'Your org', ids: org },
      { label: 'Others', ids: extra },
    ].filter((g) => g.ids.length);
  }, [ctx, mine, allowed, who]);
  const allIds = groups.flatMap((g) => g.ids);
  const selected = who && allowed(who) ? who : (allIds[0] ?? null);
  const subject = selected ? ctx.user(selected) : undefined;
  const s = q.trim().toLowerCase();
  const countFor = (id: string) => mine.filter((n) => n.subjectId === id && (!s || n.body.toLowerCase().includes(s))).length;
  const list = mine.filter((n) => n.subjectId === selected && (!s || n.body.toLowerCase().includes(s)));
  const oneOnOne = selected ? series.find((x) => (x.leadId === me && x.memberId === selected) || (x.leadId === selected && x.memberId === me)) : undefined;
  const pickable = useMemo(() => ctx.people.filter((u) => allowed(u.id)), [ctx, allowed]);

  useEffect(() => setDraft(''), [selected]);

  const save = () => {
    if (!selected) return;
    if (report(usePerf.getState().addNote(selected, draft))) setDraft('');
  };

  if (!allIds.length && !ctx.isAdmin)
    return (
      <NeoEmpty icon={<NotebookPen />} title="No one to journal about yet">
        Private notes are for people in your org. They appear here when you have direct reports.
      </NeoEmpty>
    );

  return (
    <div className="pf-fb-notes">
      <aside className="neo-card pf-fb-notes__people" aria-label="People">
        <NeoSearch value={q} onChange={setQ} placeholder="Search notes…" size="sm" label="Search notes" />
        <div className="pf-fb-people-list">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label} style={{ display: 'contents' }}>
              <div className="neo-hud" style={{ padding: '8px 6px 2px' }}>
                {g.label}
              </div>
              {g.ids.map((id) => {
                const u = ctx.user(id);
                if (!u) return null;
                const n = countFor(id);
                const last = mine.find((x) => x.subjectId === id);
                return (
                  <button key={id} type="button" className="pf-fb-person" aria-current={id === selected} onClick={() => onWho(id)}>
                    <Avatar user={u} size={30} />
                    <span className="pf-fb-person__text">
                      <b>{u.name}</b>
                      <small>{last ? `Last note ${relativeTime(last.at, now)}` : u.title}</small>
                    </span>
                    {n > 0 && <span className="neo-count">{n}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {ctx.isAdmin && (
          <PeoplePicker
            value={selected ? [selected] : []}
            onChange={(ids) => ids[0] && onWho(ids[0])}
            users={pickable}
            label="Journal about someone"
            trigger={(p) => (
              <button {...p} type="button" className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--block">
                <UserPlus /> Someone else
              </button>
            )}
          />
        )}
      </aside>

      <section className="pf-fb-journal" aria-label={subject ? `Notes about ${subject.name}` : 'Notes'}>
        <div className="pf-fb-banner">
          <span className="pf-fb-banner__icon" aria-hidden="true">
            <Lock />
          </span>
          <span>
            <b>Only you can see these notes</b>
            <small>A private coaching journal — never shown to {subject ? subject.name.split(' ')[0] : 'them'}, People Ops or in reviews.</small>
          </span>
        </div>

        {subject ? (
          <>
            <div className="pf-fb-journal__head">
              <Avatar user={subject} size={40} presence />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="neo-title truncate">{subject.name}</div>
                <div className="text-xs pf-faint truncate">
                  {subject.title} · {list.length} note{list.length === 1 ? '' : 's'}
                </div>
              </div>
              {oneOnOne && (
                <Link to={`/performance/one-on-ones/${oneOnOne.id}`} className="neo-btn neo-btn--ghost neo-btn--sm">
                  <MessagesSquare /> Open 1:1
                </Link>
              )}
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => onGive(subject.id)}>
                <HandHeart /> Give feedback
              </button>
            </div>

            <div className="neo-card pf-fb-composer">
              <textarea
                ref={inputRef}
                className="neo-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    save();
                  }
                }}
                placeholder={`What did you notice about ${subject.name.split(' ')[0]}? Coaching moments, wins to remember, context for reviews…`}
                aria-label={`New private note about ${subject.name}`}
                data-qa="fb-note-input"
              />
              <div className="pf-fb-composer__bar">
                <div className="pf-fb-prompts">
                  {NOTE_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="neo-chip neo-chip--sm"
                      data-tone="slate"
                      onClick={() => {
                        setDraft((d) => (d.trim() ? d : p.prefix));
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={draft.trim().length < 3} onClick={save} data-qa="fb-note-save" title="Save (⌘/Ctrl + Enter)">
                  <Lock /> Save note
                </button>
              </div>
            </div>

            {list.length ? (
              <ol className="pf-fb-timeline neo-stagger">
                {list.map((n, i) => (
                  <li key={n.id} className="neo-card pf-fb-note" style={{ '--i': i } as CSSProperties}>
                    <div className="pf-fb-note__body">
                      <span className="neo-hud">
                        {shortDate(n.at)} · {relativeTime(n.at, now)}
                      </span>
                      <p>{n.body}</p>
                    </div>
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Delete note" data-tip="Delete" onClick={() => withUndo(usePerf.getState().deleteNote(n.id), 'Note deleted')}>
                      <Trash2 />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="neo-card">
                <NeoEmpty compact icon={<NotebookPen />} title={s ? 'No notes match your search' : `No notes about ${subject.name.split(' ')[0]} yet`}>
                  {s ? 'Try another word.' : 'Jot down coaching moments as they happen — your future self will thank you at review time.'}
                </NeoEmpty>
              </div>
            )}
          </>
        ) : (
          <div className="neo-card">
            <NeoEmpty compact icon={<Users />} title="Pick someone to start a journal">
              Choose a person on the left{ctx.isAdmin ? ' or add someone else' : ''}.
            </NeoEmpty>
          </div>
        )}
      </section>
    </div>
  );
}
