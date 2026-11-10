/**
 * Quarterly check-ins — `/performance/checkins`.
 *
 * The check-in hub: the active cycle as a mission timeline (phases + "your part" in each),
 * your tasks, your packet's status, the 360 desk (peer / upward requests you were asked
 * for — write or decline), your direct reports' packets (managers), cycle completion
 * (People Ops) and your released reviews.
 * URL params: `?answer=<cycleFeedbackId>` opens the peer / upward form for that request.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  Ellipsis,
  EyeOff,
  Gauge,
  Grid3x3,
  History,
  Hourglass,
  Lock,
  MessageSquarePlus,
  MessagesSquare,
  NotebookPen,
  PenLine,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  UserRoundX,
  Users,
} from 'lucide-react';
import { Bar, Chip, Meter, NeoBanner, NeoBanners, NeoEmpty, NeoHead, NeoHome, NeoMenu, NeoPanel, NeoStage, Ring, Spark, type MenuEntry, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { COMPETENCY, PHASE, PHASES, RATING } from '@/performance/constants';
import { canAnswerPeer, canEditSelf, canWriteManager, currentPhaseKey, cycleCompletion, getPhase, managerUnlocked, pct, timelineSegments } from '@/performance/cycle';
import { primaryCycle, reviewOf, todosFor, type Todo } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { Cycle, CycleFeedback, PerfData, PhaseKey, Review, ReviewTemplate } from '@/performance/types';
import { toast } from '@/store/toast';
import { CycleTimeline, type PhaseMark } from './CycleTimeline';
import { dueLabel, shortDate, useMinute, usePerfCtx, useSearchFlag, type PerfCtx } from './hooks';
import { Seg } from './ui';
import { DeclineModal, PeerFeedbackModal, UpwardFeedbackModal } from './checkins-modals';
import { DAY, RatingChip, ReviewStatusChip, clamp01, cycleShort, longDate, plural, selfProgress, templateFor } from './checkins-shared';
import './styles/checkins.css';

const CHECKIN_KINDS = new Set<Todo['kind']>(['self', 'ack', 'peer', 'upward', 'nominations', 'manager']);

export function CheckinsView() {
  const ctx = usePerfCtx();
  const now = useMinute();
  const navigate = useNavigate();
  const data = usePerf();
  const [answerId, clearAnswer, setAnswer] = useSearchFlag('answer');
  const [declineId, setDeclineId] = useState<string | null>(null);
  const me = ctx?.me.id ?? '';

  const cycle = useMemo(() => primaryCycle(data, now), [data, now]);
  const tpl = templateFor(data.templates, cycle);
  const todos = useMemo(() => (ctx ? todosFor(data, ctx.me, ctx.v, ctx.users, now).filter((t) => CHECKIN_KINDS.has(t.kind)) : []), [data, ctx, now]);
  const mine = cycle ? reviewOf(data, cycle.id, me) : undefined;
  const asked = useMemo(() => (cycle ? data.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.authorId === me && f.status !== 'proposed') : []), [data.cycleFeedback, cycle, me]);
  const about = useMemo(() => (cycle ? data.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.subjectId === me) : []), [data.cycleFeedback, cycle, me]);
  const team = useMemo(() => (cycle ? data.reviews.filter((r) => r.cycleId === cycle.id && r.managerId === me && r.employeeId !== me) : []), [data.reviews, cycle, me]);
  const history = useMemo(() => data.reviews.filter((r) => r.employeeId === me && r.release).sort((a, b) => (b.release?.releasedAt ?? 0) - (a.release?.releasedAt ?? 0)), [data.reviews, me]);
  const pending = useMemo(() => asked.filter((f) => f.status === 'requested').sort((a, b) => a.dueAt - b.dueAt), [asked]);

  /* ───── ?answer=<cycleFeedbackId> ───── */
  const answerItem = answerId ? data.cycleFeedback.find((f) => f.id === answerId) : undefined;
  const answerOk = !!answerItem && answerItem.authorId === me && answerItem.status === 'requested';
  useEffect(() => {
    if (!answerId || !me) return;
    const f = usePerf.getState().cycleFeedback.find((x) => x.id === answerId);
    if (f && f.authorId === me && f.status === 'requested') return;
    if (!f || f.authorId !== me) toast.info('That request isn’t available', 'It may have been withdrawn, or it was addressed to someone else.');
    else if (f.status === 'submitted') toast.info('You already shared this feedback — thank you!');
    else if (f.status === 'declined') toast.info('You declined this request');
    else toast.info('This request is waiting for manager approval');
    clearAnswer();
    // Validate only when the param changes (answering updates the store and closes the dialog itself).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerId, me]);
  const declineItem = declineId ? data.cycleFeedback.find((f) => f.id === declineId && f.authorId === me && (f.status === 'requested' || f.status === 'proposed')) : undefined;
  const startDecline = (id: string) => {
    clearAnswer();
    setDeclineId(id);
  };

  if (!ctx) return null;

  const phase = cycle ? currentPhaseKey(cycle, now) : null;
  const unacked = history.filter((r) => !r.release?.acknowledgedAt);
  const readyTeam = cycle ? team.filter((r) => canWriteManager(cycle, r, now) && r.manager.status !== 'submitted').sort((a, b) => Number(b.manager.status === 'draft') - Number(a.manager.status === 'draft')) : [];
  const selfEditable = !!(cycle && mine && canEditSelf(cycle, mine, now));
  const openCount = todos.length;

  const sub = cycle
    ? `${cycle.name} · ${phase ? `${PHASE[phase].label} open` : cycle.status === 'active' ? 'opening soon' : 'wrapped'} · ${openCount ? `${plural(openCount, 'thing')} waiting on you` : 'you’re all caught up'}`
    : history.length
      ? 'No check-in is running right now — your released reviews live here'
      : 'Your quarterly check-ins appear here once People Ops opens a cycle';

  /* ───── Header actions ───── */
  let primary: ReactNode = null;
  let primaryIsFeedback = false;
  if (mine && selfEditable && mine.self.status !== 'submitted') {
    primary = (
      <Link to={`/performance/checkins/${mine.id}`} className="neo-btn neo-btn--plasma" data-qa="ck-self">
        <NotebookPen />
        <span className="neo-btn__label">{mine.self.status === 'draft' ? 'Continue self-review' : 'Start self-review'}</span>
      </Link>
    );
  } else if (pending.length) {
    primaryIsFeedback = true;
    primary = (
      <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setAnswer(pending[0].id)} data-qa="ck-give">
        <Send />
        <span className="neo-btn__label">Give feedback</span>
      </button>
    );
  } else if (unacked[0]) {
    primary = (
      <Link to={`/performance/checkins/${unacked[0].id}?tab=summary`} className="neo-btn neo-btn--plasma">
        <BadgeCheck />
        <span className="neo-btn__label">Read your review</span>
      </Link>
    );
  } else if (readyTeam[0]) {
    primary = (
      <Link to={`/performance/checkins/${readyTeam[0].id}?tab=manager`} className="neo-btn neo-btn--plasma">
        <PenLine />
        <span className="neo-btn__label">Write reviews</span>
      </Link>
    );
  } else if (mine) {
    primary = (
      <Link to={`/performance/checkins/${mine.id}`} className="neo-btn neo-btn--plasma">
        <NotebookPen />
        <span className="neo-btn__label">Open my review</span>
      </Link>
    );
  }
  const secondary =
    pending.length && !primaryIsFeedback ? (
      <button type="button" className="neo-btn neo-btn--soft" onClick={() => setAnswer(pending[0].id)} data-tip="Peer & upward requests waiting on you" data-tip-pos="bottom">
        <Send />
        <span className="neo-btn__label">
          Answer {pending.length} request{pending.length === 1 ? '' : 's'}
        </span>
      </button>
    ) : ctx.canTeam ? (
      <Link to="/performance/team" className="neo-btn neo-btn--soft">
        <Users />
        <span className="neo-btn__label">Team view</span>
      </Link>
    ) : (
      <Link to="/performance/feedback?request=1" className="neo-btn neo-btn--soft">
        <MessageSquarePlus />
        <span className="neo-btn__label">Request feedback</span>
      </Link>
    );
  const menu: MenuEntry[] = [];
  if (mine) menu.push({ label: 'Open my review packet', icon: <NotebookPen />, onSelect: () => navigate(`/performance/checkins/${mine.id}`) });
  if (mine && cycle && canAnswerPeer(cycle, now)) menu.push({ label: 'Choose my peer reviewers', icon: <UserPlus />, onSelect: () => navigate(`/performance/checkins/${mine.id}?tab=peers`) });
  if (ctx.canTeam) menu.push({ label: 'Team view', icon: <Users />, onSelect: () => navigate('/performance/team') });
  if (ctx.canCalibrate) menu.push({ label: 'Calibration', icon: <Grid3x3 />, onSelect: () => navigate('/performance/calibration') });
  if (ctx.isAdmin) menu.push({ label: 'Cycles & templates', icon: <Gauge />, onSelect: () => navigate('/performance/cycles') });
  menu.push({ kind: 'sep' }, { label: 'Request feedback', icon: <MessageSquarePlus />, onSelect: () => navigate('/performance/feedback?request=1') }, { label: '1:1s', icon: <MessagesSquare />, onSelect: () => navigate('/performance/one-on-ones') });

  /* ───── Banners (only when something needs attention) ───── */
  const banners: ReactNode[] = [];
  if (unacked[0]) {
    const r = unacked[0];
    const c = data.cycles.find((x) => x.id === r.cycleId);
    banners.push(
      <NeoBanner key="ack" tone="app" icon={<BadgeCheck />} title={`Your ${cycleShort(c)} review is ready`} to={`/performance/checkins/${r.id}?tab=summary`} meta={`Shared ${relativeTime(r.release!.releasedAt, now)}`}>
        {ctx.first(r.release!.releasedBy)} shared it — read it, acknowledge and add your thoughts.
      </NeoBanner>,
    );
  }
  const selfPhase = cycle ? getPhase(cycle, 'self') : undefined;
  if (mine && selfEditable && mine.self.status !== 'submitted' && selfPhase && selfPhase.end - now < 3 * DAY) {
    banners.push(
      <NeoBanner key="self" tone="warning" icon={<CalendarClock />} title={`Self-reflection ${dueLabel(selfPhase.end, now).text.toLowerCase()}`} to={`/performance/checkins/${mine.id}`} meta={longDate(selfPhase.end)}>
        Nova can draft it from your highlights — you stay in control.
      </NeoBanner>,
    );
  }
  const peerPhase = cycle ? getPhase(cycle, 'peer') : undefined;
  if (pending.length && peerPhase && now <= peerPhase.end && peerPhase.end - now < 2 * DAY) {
    banners.push(
      <NeoBanner key="peer" tone="warning" icon={<Users />} title="Peer feedback closes soon" onClick={() => setAnswer(pending[0].id)} meta={longDate(peerPhase.end)}>
        {plural(pending.length, 'colleague')} still waiting on your perspective.
      </NeoBanner>,
    );
  }

  const side = (
    <>
      {cycle && mine && <MyPacketCard ctx={ctx} cycle={cycle} review={mine} tpl={tpl} about={about} now={now} />}
      {cycle && ctx.isAdmin && <CompletionCard cycle={cycle} data={data} />}
      <HistoryCard ctx={ctx} data={data} history={history} />
    </>
  );

  return (
    <NeoStage label="Quarterly check-ins">
      <NeoHead
        icon={<CalendarCheck2 />}
        eyebrow="Reflect · Quarterly check-ins"
        title="Check-ins"
        sub={sub}
        actions={
          <>
            {secondary}
            {primary}
            <NeoMenu
              label="More check-in actions"
              items={menu}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-body neo-pad pf-ck-body">
        {banners.length > 0 && <NeoBanners>{banners.slice(0, 2)}</NeoBanners>}
        {cycle ? <CycleHero ctx={ctx} cycle={cycle} now={now} mine={mine} tpl={tpl} asked={asked} about={about} team={team} /> : <QuietHero ctx={ctx} history={history} data={data} />}
        <NeoHome
          sideLabel="Your packet"
          main={
            <>
              <TaskDeck ctx={ctx} cycle={cycle} now={now} mine={mine} tpl={tpl} todos={todos} asked={asked} about={about} team={team} onAnswer={setAnswer} />
              {cycle && <RequestsPanel ctx={ctx} cycle={cycle} now={now} asked={asked} onAnswer={setAnswer} onDecline={startDecline} />}
              {cycle && team.length > 0 && <TeamPanel ctx={ctx} cycle={cycle} now={now} team={team} data={data} />}
            </>
          }
          side={side}
        />
      </div>

      <PeerFeedbackModal open={answerOk && answerItem?.kind === 'peer'} item={answerOk && answerItem?.kind === 'peer' ? answerItem : undefined} onClose={clearAnswer} onDecline={startDecline} />
      <UpwardFeedbackModal open={answerOk && answerItem?.kind === 'upward'} item={answerOk && answerItem?.kind === 'upward' ? answerItem : undefined} onClose={clearAnswer} onDecline={startDecline} />
      <DeclineModal open={!!declineItem} item={declineItem} onClose={() => setDeclineId(null)} />
    </NeoStage>
  );
}

/* ═════════════════════════ Cycle hero ═════════════════════════ */

interface Part {
  tone: Tone;
  icon: ReactNode;
  text: string;
  title?: string;
}

function CycleHero({ ctx, cycle, now, mine, tpl, asked, about, team }: { ctx: PerfCtx; cycle: Cycle; now: number; mine?: Review; tpl?: ReviewTemplate; asked: CycleFeedback[]; about: CycleFeedback[]; team: Review[] }) {
  const phase = currentPhaseKey(cycle, now);
  const segs = timelineSegments(cycle);
  const start = segs[0]?.from ?? cycle.createdAt;
  const end = segs[segs.length - 1]?.to ?? start;
  const day = Math.min(Math.max(1, Math.ceil((now - start) / DAY)), Math.max(1, Math.round((end - start) / DAY)));
  const days = Math.max(1, Math.round((end - start) / DAY));
  const selfP = getPhase(cycle, 'self');
  const peerP = getPhase(cycle, 'peer');
  const mgrP = getPhase(cycle, 'manager');
  const relP = getPhase(cycle, 'release');
  const prog = mine ? selfProgress(mine.self, tpl) : null;
  const owed = asked.filter((f) => f.status === 'requested');
  const given = asked.filter((f) => f.status === 'submitted' || f.status === 'declined');
  const teamOpen = team.filter((r) => r.manager.status !== 'submitted' && !r.release);
  const mgrFirst = mine?.managerId ? ctx.first(mine.managerId) : 'Your manager';

  /* The next deadline that is yours. */
  let deadline: { at: number; from: number; label: string } | null = null;
  if (mine && selfP && mine.self.status !== 'submitted' && canEditSelf(cycle, mine, now)) deadline = { at: selfP.end, from: selfP.start, label: 'Self-reflection due' };
  else if (owed.length && peerP && now <= peerP.end) deadline = { at: peerP.end, from: peerP.start, label: 'Peer feedback due' };
  else if (teamOpen.length && mgrP && now <= mgrP.end) deadline = { at: mgrP.end, from: mgrP.start, label: 'Manager reviews due' };
  else if (relP && now <= relP.end) deadline = { at: relP.end, from: start, label: 'Reviews shared by' };
  const left = deadline ? Math.max(0, Math.ceil((deadline.at - now) / DAY)) : 0;
  const frac = deadline ? clamp01((now - deadline.from) / Math.max(1, deadline.at - deadline.from)) : 1;

  let title: string;
  let sub: string;
  if (cycle.status !== 'active') {
    title = `${cycle.name} has wrapped`;
    sub = 'Reviews are shared — read yours and keep the conversation going in your 1:1s.';
  } else if (phase === 'self') {
    title = !mine ? 'Self-reflections are open' : mine.self.status === 'submitted' ? 'Your self-reflection is in — nice work' : mine.self.status === 'draft' ? 'Your self-reflection is in draft' : 'Time to reflect on your quarter';
    sub =
      mine && prog && mine.self.status !== 'submitted'
        ? `${prog.answered} of ${prog.questions} answers and ${prog.rated} of ${prog.ratingsNeeded} ratings so far. Nova drafts from your highlights — you stay in control.`
        : mine?.self.status === 'submitted'
          ? `${mgrFirst} can now start your review. Meanwhile, ${owed.length ? `${plural(owed.length, 'colleague')} would value your feedback.` : 'keep an eye on your peer reviewers.'}`
          : PHASE.self.blurb;
  } else if (phase) {
    title = phase === 'manager' && team.length ? `Manager reviews are due ${shortDate(mgrP?.end ?? now)}` : phase === 'manager' && mine ? `${mgrFirst} is writing your review` : `${PHASE[phase].label} is underway`;
    sub = PHASE[phase].blurb;
  } else {
    title = now < start ? `${cycle.name} opens ${shortDate(start)}` : `${cycle.name}`;
    sub = 'Your quarterly rhythm: reflect, gather 360 feedback, calibrate, then talk it through.';
  }

  const marks: Partial<Record<PhaseKey, PhaseMark>> = {
    self: mine?.self.status === 'submitted' ? 'done' : 'todo',
    peer: asked.length && asked.every((f) => f.status !== 'requested') ? 'done' : asked.length ? 'todo' : 'na',
    manager: team.length && team.every((r) => r.manager.status === 'submitted' || r.release) ? 'done' : 'na',
    release: mine?.release?.acknowledgedAt ? 'done' : 'na',
  };

  /* "Your part" in each phase. */
  const activeAbout = about.filter((f) => f.status !== 'declined');
  const proposed = about.filter((f) => f.status === 'proposed');
  const answered = about.filter((f) => f.status === 'submitted');
  const parts: Record<PhaseKey, Part> = {
    self: !mine
      ? { tone: 'slate', icon: <Circle />, text: 'Not in this cycle' }
      : mine.self.status === 'submitted'
        ? { tone: 'success', icon: <CircleCheck />, text: 'Submitted' }
        : mine.self.status === 'draft'
          ? { tone: 'warning', icon: <PenLine />, text: `Draft · ${prog?.answered ?? 0}/${prog?.questions ?? 0}` }
          : { tone: phase === 'self' ? 'app' : 'slate', icon: <NotebookPen />, text: 'Not started' },
    peer: owed.length
      ? { tone: 'app', icon: <Send />, text: `${given.length}/${asked.length} given`, title: `${plural(owed.length, 'request')} waiting on you` }
      : asked.length
        ? { tone: 'success', icon: <CircleCheck />, text: 'All given', title: 'Every request answered — thank you' }
        : proposed.length
          ? { tone: 'warning', icon: <Hourglass />, text: `${proposed.length} awaiting ${mgrFirst}`, title: 'Your nominations are waiting for approval' }
          : activeAbout.length
            ? { tone: 'slate', icon: <Users />, text: `${answered.length}/${activeAbout.length} peers in`, title: 'Peers writing about you' }
            : { tone: 'slate', icon: <UserPlus />, text: mine ? 'Nominate peers' : '—' },
    manager: team.length
      ? { tone: teamOpen.length ? 'app' : 'success', icon: teamOpen.length ? <PenLine /> : <CircleCheck />, text: `${team.length - teamOpen.length}/${team.length} written` }
      : { tone: 'slate', icon: <PenLine />, text: mine?.managerId ? `${mgrFirst} writes` : '—' },
    calibration: { tone: cycle.calibrationLockedAt ? 'success' : 'slate', icon: cycle.calibrationLockedAt ? <Lock /> : <Grid3x3 />, text: cycle.calibrationLockedAt ? 'Locked' : ctx.canCalibrate ? 'You calibrate' : 'Leaders calibrate' },
    release: mine?.release
      ? mine.release.acknowledgedAt
        ? { tone: 'success', icon: <CircleCheck />, text: 'Acknowledged' }
        : { tone: 'app', icon: <BadgeCheck />, text: 'Ready to read' }
      : { tone: 'slate', icon: <MessagesSquare />, text: 'Read & discuss' },
  };
  const q = tpl?.questions.length ?? 0;

  return (
    <section className="neo-card pf-ck-hero neo-spot" aria-label={cycle.name}>
      <div className="pf-ck-hero__grid" aria-hidden="true" />
      <div className="pf-ck-hero__top">
        <div className="pf-ck-hero__intro">
          <div className="pf-ck-hero__hud">
            <span className="neo-hud neo-hud--tint">{cycle.name}</span>
            {cycle.status === 'active' && phase && (
              <span className="pf-ck-live">
                <i aria-hidden="true" /> Live
              </span>
            )}
            <span className="neo-hud">
              Day {day} of {days}
            </span>
          </div>
          <h2 className="pf-ck-hero__title">{title}</h2>
          <p className="pf-ck-hero__sub">{sub}</p>
          <div className="pf-ck-rules" aria-label="How this cycle works">
            <Chip size="sm" tone="slate" icon={cycle.peerAnonymous ? <EyeOff /> : <Users />} title={cycle.peerAnonymous ? 'Peers stay anonymous to the employee (managers still see authors)' : 'Peer feedback is signed'}>
              {cycle.peerAnonymous ? 'Peers anonymous' : 'Peers signed'}
            </Chip>
            <Chip size="sm" tone="slate" icon={<ShieldCheck />} title="Upward feedback is only shown aggregated">
              Upward at {cycle.upwardMin}+ answers
            </Chip>
            {tpl && (
              <Chip size="sm" tone="slate" icon={<NotebookPen />} title={tpl.name}>
                {q} questions{tpl.competencies ? ' · 5 competencies' : ''}
              </Chip>
            )}
          </div>
        </div>
        {deadline && (
          <div className="pf-ck-count">
            <Ring value={frac} size={118} stroke={8} label={`${left} days left: ${deadline.label}`}>
              <span className="pf-ck-count__num">
                {left}
                <small>{left === 1 ? 'day' : 'days'}</small>
              </span>
            </Ring>
            <div className="pf-ck-count__text">
              <span className="neo-hud">{deadline.label}</span>
              <b>{longDate(deadline.at)}</b>
              <span className="pf-faint">{dueLabel(deadline.at, now).text}</span>
            </div>
          </div>
        )}
      </div>
      <div className="pf-ck-hero__tl">
        <CycleTimeline cycle={cycle} now={now} marks={marks} />
        <ol className="pf-ck-parts" aria-label="Your part in each phase">
          {PHASES.map((p) => {
            const part = parts[p.key];
            return (
              <li key={p.key} className="pf-ck-part" data-tone={part.tone} data-current={phase === p.key || undefined} title={part.title}>
                <span className="pf-ck-part__phase">{p.short}</span>
                <span className="pf-ck-part__chip">
                  {part.icon}
                  <span className="truncate">{part.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Between cycles: a calm hero that points at the last review. */
function QuietHero({ ctx, history, data }: { ctx: PerfCtx; history: Review[]; data: PerfData }) {
  const last = history[0];
  const c = last ? data.cycles.find((x) => x.id === last.cycleId) : undefined;
  return (
    <section className="neo-card pf-ck-hero pf-ck-hero--quiet" aria-label="Between cycles">
      <div className="pf-ck-hero__grid" aria-hidden="true" />
      <div className="pf-ck-hero__intro">
        <span className="neo-hud neo-hud--tint">Between cycles</span>
        <h2 className="pf-ck-hero__title">No check-in is running right now</h2>
        <p className="pf-ck-hero__sub">
          {last
            ? `Your ${cycleShort(c)} review is your latest. Keep the momentum with weekly OKR check-ins and feedback, ${ctx.me.name.split(' ')[0]} — next quarter’s reflection will practically write itself.`
            : 'When People Ops opens the next quarterly check-in, your tasks and timeline appear here.'}
        </p>
        {last && (
          <div className="pf-row pf-row--wrap">
            <Link to={`/performance/checkins/${last.id}?tab=summary`} className="neo-btn neo-btn--soft neo-btn--sm">
              <BadgeCheck /> Open my {cycleShort(c)} review
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/* ═════════════════════════ Task deck ═════════════════════════ */

interface TaskTile {
  id: string;
  kind: string;
  icon: ReactNode;
  hud: string;
  title: string;
  sub: string;
  due?: number;
  progress?: { done: number; total: number };
  state: 'open' | 'waiting' | 'done';
  rank: number;
  action?: { label: string; to?: string; onClick?: () => void };
}

function TaskDeck({
  ctx,
  cycle,
  now,
  mine,
  tpl,
  todos,
  asked,
  about,
  team,
  onAnswer,
}: {
  ctx: PerfCtx;
  cycle: Cycle | null;
  now: number;
  mine?: Review;
  tpl?: ReviewTemplate;
  todos: Todo[];
  asked: CycleFeedback[];
  about: CycleFeedback[];
  team: Review[];
  onAnswer: (id: string) => void;
}) {
  const tiles: TaskTile[] = [];
  const link = mine ? `/performance/checkins/${mine.id}` : '/performance/checkins';
  const mgrFirst = mine?.managerId ? ctx.first(mine.managerId) : 'your manager';

  if (cycle && mine) {
    const p = selfProgress(mine.self, tpl);
    const sp = getPhase(cycle, 'self');
    const editable = canEditSelf(cycle, mine, now);
    const total = p.questions + p.ratingsNeeded;
    if (mine.self.status === 'submitted')
      tiles.push({
        id: 'self',
        kind: 'self',
        icon: <NotebookPen />,
        hud: 'Self-reflection',
        title: 'Submitted — nice work',
        sub: editable && sp ? `You can still polish it until ${shortDate(sp.end)}` : `Submitted ${mine.self.submittedAt ? shortDate(mine.self.submittedAt) : ''}`,
        progress: { done: total, total },
        state: 'done',
        rank: 100,
        action: { label: 'Open', to: link },
      });
    else if (editable)
      tiles.push({
        id: 'self',
        kind: 'self',
        icon: <NotebookPen />,
        hud: 'Self-reflection',
        title: mine.self.status === 'draft' ? 'Finish your self-reflection' : 'Write your self-reflection',
        sub: `${p.answered}/${p.questions} answers · ${p.rated}/${p.ratingsNeeded} ratings · Nova can draft it`,
        due: sp?.end,
        progress: { done: p.answered + p.rated, total },
        state: 'open',
        rank: 100,
        action: { label: mine.self.status === 'draft' ? 'Continue' : 'Start', to: link },
      });
    else
      tiles.push({ id: 'self', kind: 'self', icon: <NotebookPen />, hud: 'Self-reflection', title: 'Self-reflection closed', sub: `The self phase ended ${sp ? shortDate(sp.end) : ''} — ${mgrFirst} reviews from evidence`, state: 'done', rank: 100, action: { label: 'Open', to: link } });

    // Your 360 (peer reviewers about you)
    if (mine.managerId) {
      const active = about.filter((f) => f.status !== 'declined');
      const proposed = about.filter((f) => f.status === 'proposed');
      const inn = about.filter((f) => f.status === 'submitted').length;
      const peerP = getPhase(cycle, 'peer');
      if (!active.length && canAnswerPeer(cycle, now))
        tiles.push({ id: 'nominate', kind: 'nominate', icon: <UserPlus />, hud: 'Your 360', title: 'Choose 2–4 peer reviewers', sub: `${mgrFirst} approves · they answer by ${peerP ? shortDate(peerP.end) : 'the deadline'}`, due: peerP?.end, state: 'open', rank: 50, action: { label: 'Choose', to: `${link}?tab=peers` } });
      else if (proposed.length)
        tiles.push({ id: 'peers-wait', kind: 'nominate', icon: <Hourglass />, hud: 'Your 360', title: `Waiting for ${mgrFirst} to approve`, sub: `${proposed.map((f) => ctx.first(f.authorId)).join(', ')} nominated`, state: 'waiting', rank: 40, action: { label: 'Edit', to: `${link}?tab=peers` } });
      else if (active.length)
        tiles.push({
          id: 'peers-in',
          kind: 'nominate',
          icon: <Users />,
          hud: 'Your 360',
          title: inn === active.length ? 'All your peers have answered' : `${inn} of ${active.length} peers have answered`,
          sub: 'You’ll read their themes when your review is shared',
          progress: { done: inn, total: active.length },
          state: inn === active.length ? 'done' : 'waiting',
          rank: 40,
          action: { label: 'View', to: `${link}?tab=peers` },
        });
    }
  }

  // Feedback you owe others
  for (const kind of ['peer', 'upward'] as const) {
    const items = asked.filter((f) => f.kind === kind);
    if (!items.length) continue;
    const done = items.filter((f) => f.status !== 'requested').length;
    const next = items.filter((f) => f.status === 'requested').sort((a, b) => a.dueAt - b.dueAt)[0];
    const more = items.filter((f) => f.status === 'requested').length - 1;
    tiles.push({
      id: `give-${kind}`,
      kind,
      icon: kind === 'peer' ? <Users /> : <TrendingUp />,
      hud: kind === 'peer' ? 'Peer feedback' : 'Upward feedback',
      title: next ? `${kind === 'peer' ? 'Give' : 'Share upward feedback for'} ${ctx.first(next.subjectId)}${kind === 'peer' ? ' peer feedback' : ''}${more > 0 ? ` +${more}` : ''}` : kind === 'peer' ? 'Peer feedback shared' : 'Upward feedback shared',
      sub: next ? (kind === 'peer' ? 'Start · Stop · Continue — about 5 minutes' : 'Anonymous · shown only in aggregate') : `Thank you — ${plural(done, 'request')} answered`,
      due: next?.dueAt,
      progress: { done, total: items.length },
      state: next ? 'open' : 'done',
      rank: kind === 'peer' ? 70 : 55,
      action: next ? { label: 'Write', onClick: () => onAnswer(next.id) } : undefined,
    });
  }

  // Manager to-dos
  for (const t of todos.filter((x) => x.kind === 'nominations')) tiles.push({ id: t.id, kind: 'nominations', icon: <UserPlus />, hud: 'Approve peers', title: t.title, sub: t.sub, state: 'open', rank: 80, action: { label: 'Review', to: t.to } });
  if (cycle && team.length) {
    const done = team.filter((r) => r.manager.status === 'submitted' || r.release).length;
    const ready = team.filter((r) => canWriteManager(cycle, r, now) && r.manager.status !== 'submitted').sort((a, b) => Number(b.manager.status === 'draft') - Number(a.manager.status === 'draft'));
    const next = ready[0];
    const mgrP = getPhase(cycle, 'manager');
    tiles.push({
      id: 'manager',
      kind: 'manager',
      icon: <PenLine />,
      hud: 'Manager reviews',
      title: next ? `${plural(ready.length, 'review')} ready to write` : done === team.length ? 'Every review is submitted' : 'Waiting on self-reflections',
      sub: next ? `${next.manager.status === 'draft' ? 'Finish' : 'Start with'} ${ctx.first(next.employeeId)} — self-reflection and evidence are in` : `${done} of ${team.length} submitted · unlocks as people submit`,
      due: next ? mgrP?.end : undefined,
      progress: { done, total: team.length },
      state: next ? 'open' : done === team.length ? 'done' : 'waiting',
      rank: 60,
      action: next ? { label: next.manager.status === 'draft' ? 'Continue' : 'Write', to: `/performance/checkins/${next.id}?tab=manager` } : undefined,
    });
  }
  for (const t of todos.filter((x) => x.kind === 'ack')) tiles.push({ id: t.id, kind: 'ack', icon: <BadgeCheck />, hud: 'Your review', title: t.title, sub: t.sub, state: 'open', rank: 90, action: { label: 'Read', to: t.to } });

  const order = { open: 0, waiting: 1, done: 2 } as const;
  tiles.sort((a, b) => order[a.state] - order[b.state] || b.rank - a.rank);
  const open = tiles.filter((t) => t.state === 'open').length;

  return (
    <NeoPanel hud={open ? `Needs you · ${open} open` : 'All clear'} title="Your tasks" icon={<CircleCheck />} className="pf-ck-deck">
      {tiles.length ? (
        <div className="pf-ck-tasks">
          {tiles.map((t, i) => {
            const due = t.due && t.state === 'open' ? dueLabel(t.due, now) : null;
            return (
              <article key={t.id} className="pf-ck-task neo-spot" data-state={t.state} data-kind={t.kind} style={{ '--i': i } as CSSProperties}>
                <div className="pf-ck-task__top">
                  <span className="pf-ck-task__icon">{t.icon}</span>
                  <span className="neo-hud">{t.hud}</span>
                  <span className="pf-spacer" />
                  {due && (
                    <Chip tone={due.tone} size="sm">
                      {due.text.replace('Due in ', '')}
                    </Chip>
                  )}
                  {t.state === 'done' && (
                    <Chip tone="success" size="sm" icon={<Check />}>
                      Done
                    </Chip>
                  )}
                  {t.state === 'waiting' && (
                    <Chip tone="slate" size="sm" icon={<Hourglass />}>
                      Waiting
                    </Chip>
                  )}
                </div>
                <h3 className="pf-ck-task__title">{t.title}</h3>
                <p className="pf-ck-task__sub">{t.sub}</p>
                <div className="pf-ck-task__foot">
                  {t.progress && t.progress.total > 0 ? (
                    <span className="pf-ck-task__meter">
                      {t.progress.total <= 12 ? <Meter value={t.progress.done} segments={t.progress.total} label={`${t.progress.done} of ${t.progress.total}`} /> : <Bar value={t.progress.done / t.progress.total} label="Progress" />}
                      <span className="neo-mono">
                        {t.progress.done}/{t.progress.total}
                      </span>
                    </span>
                  ) : (
                    <span className="pf-spacer" />
                  )}
                  {t.action &&
                    (t.action.to ? (
                      <Link to={t.action.to} className={cx('neo-btn neo-btn--xs', t.state === 'open' ? 'neo-btn--plasma' : 'neo-btn--ghost')}>
                        {t.action.label} <ArrowRight />
                      </Link>
                    ) : (
                      <button type="button" className={cx('neo-btn neo-btn--xs', t.state === 'open' ? 'neo-btn--plasma' : 'neo-btn--ghost')} onClick={t.action.onClick}>
                        {t.action.label} <ArrowRight />
                      </button>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <NeoEmpty compact icon={<Sparkles />} title="Nothing waiting on you">
          When a cycle opens, your self-reflection, peer requests and reviews show up here.
        </NeoEmpty>
      )}
    </NeoPanel>
  );
}

/* ═════════════════════════ 360 desk ═════════════════════════ */

function RequestsPanel({ ctx, cycle, now, asked, onAnswer, onDecline }: { ctx: PerfCtx; cycle: Cycle; now: number; asked: CycleFeedback[]; onAnswer: (id: string) => void; onDecline: (id: string) => void }) {
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = asked.filter((f) => f.status === 'requested').sort((a, b) => a.dueAt - b.dueAt);
  const rest = asked.filter((f) => f.status !== 'requested').sort((a, b) => (b.submittedAt ?? b.requestedAt) - (a.submittedAt ?? a.requestedAt));
  const list = scope === 'open' && open.length ? open : [...open, ...rest];
  const windowOpen = canAnswerPeer(cycle, now);
  return (
    <NeoPanel
      hud="360 · Peer & upward"
      title="Feedback you’ve been asked for"
      icon={<Users />}
      className="pf-ck-reqs"
      actions={
        asked.length > 0 && open.length > 0 && rest.length > 0 ? (
          <Seg
            size="sm"
            value={scope}
            onChange={setScope}
            label="Which requests"
            options={[
              { value: 'open', label: `Open · ${open.length}` },
              { value: 'all', label: `All · ${asked.length}` },
            ]}
          />
        ) : undefined
      }
    >
      {list.length ? (
        <ul className="pf-ck-reqlist">
          {list.map((f) => {
            const u = ctx.user(f.subjectId);
            const due = dueLabel(f.dueAt, now);
            const expanded = openId === f.id;
            return (
              <li key={f.id} className="pf-ck-req" data-status={f.status} data-kind={f.kind}>
                <div className="pf-ck-req__row">
                  <span className="pf-ck-req__avatar">
                    {u && <Avatar user={u} size={36} />}
                    <span className="pf-ck-req__kind" aria-hidden="true">
                      {f.kind === 'peer' ? <Users /> : <TrendingUp />}
                    </span>
                  </span>
                  <div className="pf-ck-req__text">
                    <b className="truncate">
                      {f.kind === 'peer' ? 'Peer feedback for ' : 'Upward feedback for '}
                      {u?.name ?? 'a colleague'}
                    </b>
                    <span className="truncate">
                      {f.kind === 'peer' ? 'Start · Stop · Continue' : 'Five statements · always anonymous'}
                      {f.kind === 'peer' && f.nominatedBy === f.subjectId ? ` · ${ctx.first(f.subjectId)} asked for you` : f.kind === 'peer' && f.nominatedBy ? ` · requested by ${ctx.first(f.nominatedBy)}` : ''}
                    </span>
                  </div>
                  <div className="pf-ck-req__meta">
                    {f.status === 'requested' &&
                      (windowOpen ? (
                        <Chip tone={due.tone} size="sm" icon={<CalendarClock />}>
                          {due.text}
                        </Chip>
                      ) : (
                        <Chip tone="slate" size="sm" icon={<Lock />}>
                          Closed
                        </Chip>
                      ))}
                    {f.status === 'submitted' && (
                      <Chip tone="success" size="sm" icon={<Check />} title={f.submittedAt ? new Date(f.submittedAt).toLocaleString() : undefined}>
                        Shared{f.submittedAt ? ` ${relativeTime(f.submittedAt, now)}` : ''}
                      </Chip>
                    )}
                    {f.status === 'declined' && (
                      <Chip tone="slate" size="sm" icon={<UserRoundX />} title={f.declineReason}>
                        Declined
                      </Chip>
                    )}
                  </div>
                  <div className="pf-ck-req__actions">
                    {f.status === 'requested' && (
                      <>
                        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onDecline(f.id)} data-qa="ck-decline">
                          Decline
                        </button>
                        {windowOpen && (
                          <button type="button" className="neo-btn neo-btn--plasma neo-btn--xs" onClick={() => onAnswer(f.id)} data-qa="ck-answer">
                            <Send /> Write
                          </button>
                        )}
                      </>
                    )}
                    {f.status === 'submitted' && (
                      <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : f.id)}>
                        {expanded ? 'Hide' : 'What I wrote'} <ChevronDown className={cx('pf-ck-chev', expanded && 'is-open')} />
                      </button>
                    )}
                  </div>
                </div>
                {expanded && f.status === 'submitted' && <WhatIWrote f={f} />}
                {f.status === 'declined' && f.declineReason && <p className="pf-ck-req__reason">“{f.declineReason}”</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <NeoEmpty compact icon={<Users />} title="No one has asked you yet">
          When colleagues nominate you as a peer reviewer — or your manager asks for upward feedback — it lands here.
        </NeoEmpty>
      )}
    </NeoPanel>
  );
}

function WhatIWrote({ f }: { f: CycleFeedback }) {
  if (f.kind === 'upward')
    return (
      <div className="pf-ck-mine-fb">
        <span className="neo-hud">
          <EyeOff aria-hidden="true" /> Anonymous · pooled with your teammates
        </span>
        {f.keep && (
          <p>
            <b>Keep:</b> {f.keep}
          </p>
        )}
        {f.change && (
          <p>
            <b>Change:</b> {f.change}
          </p>
        )}
      </div>
    );
  return (
    <div className="pf-ck-mine-fb">
      <span className="neo-hud">
        {f.anonymous ? <EyeOff aria-hidden="true" /> : <Users aria-hidden="true" />} {f.anonymous ? 'Anonymous to them' : 'Signed'}
        {f.highlight ? ` · strength: ${COMPETENCY[f.highlight].label}` : ''}
      </span>
      {f.start && (
        <p>
          <b>Start:</b> {f.start}
        </p>
      )}
      {f.stop && (
        <p>
          <b>Stop:</b> {f.stop}
        </p>
      )}
      {f.continue && (
        <p>
          <b>Continue:</b> {f.continue}
        </p>
      )}
    </div>
  );
}

/* ═════════════════════════ Team (managers) ═════════════════════════ */

function TeamPanel({ ctx, cycle, now, team, data }: { ctx: PerfCtx; cycle: Cycle; now: number; team: Review[]; data: PerfData }) {
  const rows = team
    .map((r) => {
      const peers = data.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.subjectId === r.employeeId);
      const active = peers.filter((f) => f.status === 'requested' || f.status === 'submitted');
      const submitted = peers.filter((f) => f.status === 'submitted').length;
      const proposed = peers.filter((f) => f.status === 'proposed').length;
      const unlocked = managerUnlocked(cycle, r, now) || r.manager.status !== 'not-started';
      const writable = canWriteManager(cycle, r, now);
      const first = ctx.first(r.employeeId);
      let action: { label: string; to?: string; reason?: string; tone: 'plasma' | 'soft' | 'ghost' };
      let rank: number;
      if (proposed) {
        action = { label: 'Approve peers', to: `/performance/checkins/${r.id}?tab=peers`, tone: 'soft' };
        rank = 0;
      } else if (r.release) {
        action = { label: 'View', to: `/performance/checkins/${r.id}?tab=summary`, tone: 'ghost' };
        rank = 4;
      } else if (writable && r.manager.status !== 'submitted') {
        action = { label: r.manager.status === 'draft' ? 'Continue' : 'Write', to: `/performance/checkins/${r.id}?tab=manager`, tone: 'plasma' };
        rank = 1;
      } else if (r.manager.status === 'submitted') {
        action = { label: 'Review & share', to: `/performance/checkins/${r.id}?tab=summary`, tone: 'soft' };
        rank = 2;
      } else {
        action = { label: 'Write', reason: `Unlocks when ${first} submits the self-reflection`, tone: 'ghost' };
        rank = 3;
      }
      return { r, active, submitted, proposed, unlocked, action, rank };
    })
    .sort((a, b) => a.rank - b.rank || ctx.name(a.r.employeeId).localeCompare(ctx.name(b.r.employeeId)));
  const written = team.filter((r) => r.manager.status === 'submitted' || r.release).length;

  return (
    <NeoPanel
      id="team"
      hud={`Your team · ${written}/${team.length} written`}
      title="Direct reports’ reviews"
      icon={<PenLine />}
      flush
      className="pf-ck-team"
      actions={
        <Link to="/performance/team" className="neo-btn neo-btn--ghost neo-btn--xs">
          Team view <ArrowRight />
        </Link>
      }
    >
      <div className="pf-ck-tbl" role="table" aria-label="Direct reports’ reviews">
        <div className="pf-ck-tbl__head" role="row">
          <span role="columnheader">Person</span>
          <span role="columnheader">Self</span>
          <span role="columnheader">Peers</span>
          <span role="columnheader">Your review</span>
          <span role="columnheader" className="neo-sr">
            Next step
          </span>
        </div>
        {rows.map(({ r, active, submitted, proposed, unlocked, action }) => {
          const u = ctx.user(r.employeeId);
          return (
            <div key={r.id} className="pf-ck-tbl__row" role="row">
              <span className="pf-ck-tbl__who" role="cell">
                {u && <Avatar user={u} size={32} presence />}
                <span className="pf-ck-tbl__name">
                  <b className="truncate">{u?.name ?? 'Unknown'}</b>
                  <small className="truncate">{u?.title}</small>
                </span>
              </span>
              <span role="cell" data-label="Self">
                <ReviewStatusChip status={r.self.status} />
              </span>
              <span role="cell" data-label="Peers" className="pf-ck-tbl__peers">
                {proposed ? (
                  <Chip tone="warning" size="sm" icon={<UserPlus />}>
                    {proposed} to approve
                  </Chip>
                ) : active.length ? (
                  <>
                    <Bar value={submitted / active.length} label={`${submitted} of ${active.length} peers answered`} />
                    <span className="neo-mono">
                      {submitted}/{active.length}
                    </span>
                  </>
                ) : (
                  <span className="pf-faint text-xs">None yet</span>
                )}
              </span>
              <span role="cell" data-label="Your review">
                {r.release ? (
                  <Chip tone={r.release.acknowledgedAt ? 'success' : 'app'} size="sm" icon={r.release.acknowledgedAt ? <CircleCheck /> : <BadgeCheck />}>
                    {r.release.acknowledgedAt ? 'Acknowledged' : 'Shared'}
                  </Chip>
                ) : !unlocked ? (
                  <Chip tone="slate" size="sm" icon={<Lock />}>
                    Locked
                  </Chip>
                ) : (
                  <ReviewStatusChip status={r.manager.status} />
                )}
              </span>
              <span role="cell" className="pf-ck-tbl__act">
                {action.to ? (
                  <Link to={action.to} className={`neo-btn neo-btn--xs neo-btn--${action.tone}`}>
                    {action.label}
                    <ChevronRight />
                  </Link>
                ) : (
                  <span className="neo-btn neo-btn--xs neo-btn--ghost pf-ck-tbl__locked" aria-disabled="true" title={action.reason} data-tip={action.reason}>
                    <Lock /> {action.label}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </NeoPanel>
  );
}

/* ═════════════════════════ Side: my packet, completion, history ═════════════════════════ */

function MyPacketCard({ ctx, cycle, review, tpl, about, now }: { ctx: PerfCtx; cycle: Cycle; review: Review; tpl?: ReviewTemplate; about: CycleFeedback[]; now: number }) {
  const p = selfProgress(review.self, tpl);
  const submitted = review.self.status === 'submitted';
  const value = submitted ? 1 : p.value;
  const sp = getPhase(cycle, 'self');
  const mgrP = getPhase(cycle, 'manager');
  const calP = getPhase(cycle, 'calibration');
  const relP = getPhase(cycle, 'release');
  const editable = canEditSelf(cycle, review, now);
  const link = `/performance/checkins/${review.id}`;
  const mgr = review.managerId ? ctx.first(review.managerId) : null;
  const active = about.filter((f) => f.status !== 'declined');
  const proposed = about.filter((f) => f.status === 'proposed').length;
  const peersText = !mgr ? 'Not needed' : proposed ? `${proposed} awaiting ${mgr}` : active.length ? `${about.filter((f) => f.status === 'submitted').length}/${active.length} answered` : 'None yet';
  const checks: { label: string; value: string; done: boolean; optional?: boolean }[] = [
    { label: 'Answers', value: `${p.answered}/${p.questions}`, done: p.answered === p.questions && p.questions > 0 },
    ...(p.ratingsNeeded ? [{ label: 'Competency ratings', value: `${p.rated}/${p.ratingsNeeded}`, done: p.rated === p.ratingsNeeded }] : []),
    { label: 'Evidence cited', value: String(p.cited), done: p.cited >= 2, optional: true },
    { label: 'Peer reviewers', value: peersText, done: !mgr || (active.length >= 2 && !proposed) },
  ];

  if (review.release) {
    return (
      <NeoPanel hud="Your packet" title={`${cycleShort(cycle)} review`} icon={<BadgeCheck />}>
        <div className="pf-ck-mine">
          <Ring value={1} size={84} stroke={7} label="Review shared">
            <BadgeCheck className="pf-ck-mine__icon" />
          </Ring>
          <div className="pf-ck-mine__meta">
            {review.manager.overall && <RatingChip rating={review.manager.overall} size="md" />}
            <span className="pf-faint text-xs">Shared {relativeTime(review.release.releasedAt, now)}</span>
            {review.release.acknowledgedAt ? (
              <span className="pf-ck-ok">
                <Check aria-hidden="true" /> Acknowledged
              </span>
            ) : (
              <Chip tone="warning" size="sm">
                Waiting for you
              </Chip>
            )}
          </div>
        </div>
        <Link to={`${link}?tab=summary`} className="neo-btn neo-btn--plasma neo-btn--sm neo-btn--block">
          <BadgeCheck /> {review.release.acknowledgedAt ? 'Open my review' : 'Read & acknowledge'}
        </Link>
      </NeoPanel>
    );
  }

  return (
    <NeoPanel
      hud="Your packet"
      title={`${cycleShort(cycle)} self-reflection`}
      icon={<NotebookPen />}
      actions={
        <Link to={link} className="neo-btn neo-btn--ghost neo-btn--xs">
          Open <ArrowRight />
        </Link>
      }
      className="pf-ck-minecard"
    >
      <div className="pf-ck-mine">
        <Ring value={value} size={96} stroke={8} label={`Self-reflection ${Math.round(value * 100)}% complete`}>
          <span className="pf-ck-mine__pct">
            {Math.round(value * 100)}
            <small>%</small>
          </span>
        </Ring>
        <div className="pf-ck-mine__meta">
          <ReviewStatusChip status={review.self.status} size="md" />
          <span className="pf-faint text-xs">
            {submitted && review.self.submittedAt ? `Submitted ${relativeTime(review.self.submittedAt, now)}` : review.self.updatedAt ? `Saved ${relativeTime(review.self.updatedAt, now)}` : 'Not started yet'}
          </span>
          {!submitted && editable && sp && (
            <Chip tone={dueLabel(sp.end, now).tone} size="sm" icon={<CalendarClock />}>
              {dueLabel(sp.end, now).text}
            </Chip>
          )}
        </div>
      </div>
      <ul className="pf-ck-check">
        {checks.map((c) => (
          <li key={c.label} data-done={c.done || undefined}>
            {c.done ? <CircleCheck aria-hidden="true" /> : <Circle aria-hidden="true" />}
            <span className="grow">
              {c.label}
              {c.optional && <small> · optional</small>}
            </span>
            <b>{c.value}</b>
          </li>
        ))}
      </ul>
      <div className="pf-ck-next">
        <span className="neo-hud">What happens next</span>
        <ol>
          {mgr && mgrP && (
            <li>
              <i aria-hidden="true" />
              <span className="grow">{mgr} writes your review</span>
              <span className="neo-mono">{shortDate(mgrP.end)}</span>
            </li>
          )}
          {calP && (
            <li>
              <i aria-hidden="true" />
              <span className="grow">Calibration</span>
              <span className="neo-mono">{shortDate(calP.end)}</span>
            </li>
          )}
          {relP && (
            <li>
              <i aria-hidden="true" />
              <span className="grow">Shared with you · 1:1 conversation</span>
              <span className="neo-mono">{shortDate(relP.end)}</span>
            </li>
          )}
        </ol>
      </div>
      {editable && (
        <Link to={link} className={cx('neo-btn neo-btn--sm neo-btn--block', submitted ? 'neo-btn--soft' : 'neo-btn--plasma')}>
          <NotebookPen /> {submitted ? 'Polish my reflection' : review.self.status === 'draft' ? 'Continue writing' : 'Start reflecting'}
        </Link>
      )}
    </NeoPanel>
  );
}

function CompletionCard({ cycle, data }: { cycle: Cycle; data: PerfData }) {
  const c = cycleCompletion(cycle.id, data.reviews, data.cycleFeedback);
  const rows: [string, { done: number; total: number }][] = [
    ['Self-reflections', c.self],
    ['Peer feedback', c.peer],
    ['Upward feedback', c.upward],
    ['Manager reviews', c.manager],
    ['Shared', c.released],
    ['Acknowledged', c.acknowledged],
  ];
  const overall = pct(c.overall);
  return (
    <NeoPanel
      hud="People Ops · Live"
      title="Cycle completion"
      icon={<Gauge />}
      actions={
        <Link to="/performance/cycles" className="neo-btn neo-btn--ghost neo-btn--xs">
          Manage <ArrowRight />
        </Link>
      }
    >
      <div className="pf-ck-org__top">
        <Ring value={overall} size={58} stroke={6} label={`${Math.round(overall * 100)}% of requested input submitted`}>
          <span className="pf-ck-org__pct">{Math.round(overall * 100)}</span>
        </Ring>
        <p className="pf-ck-org__lead">
          <b>{Math.round(overall * 100)}%</b> of self, peer and upward input is in across {plural(c.self.total, 'participant')}.
        </p>
      </div>
      <ul className="pf-ck-org">
        {rows.map(([label, t]) => (
          <li key={label}>
            <span className="truncate">{label}</span>
            <Bar value={pct(t)} label={`${label}: ${t.done} of ${t.total}`} />
            <b className="neo-mono">
              {t.done}/{t.total}
            </b>
          </li>
        ))}
      </ul>
    </NeoPanel>
  );
}

function HistoryCard({ ctx, data, history }: { ctx: PerfCtx; data: PerfData; history: Review[] }) {
  const values = [...history]
    .reverse()
    .map((r) => (r.manager.overall ? RATING[r.manager.overall].value : null))
    .filter((v): v is number => v !== null);
  const trend = values.length >= 2 ? values[values.length - 1] - values[values.length - 2] : 0;
  return (
    <NeoPanel hud="History" title="Released reviews" icon={<History />}>
      {history.length ? (
        <>
          {values.length >= 2 && (
            <div className="pf-ck-trend">
              <Spark data={values} width={120} height={34} />
              <span className="pf-ck-trend__text">
                <b>{trend > 0 ? 'Trending up' : trend < 0 ? 'Dipped last quarter' : 'Holding steady'}</b>
                <small>Overall rating · last {values.length} quarters</small>
              </span>
            </div>
          )}
          <ul className="pf-ck-hist">
            {history.map((r) => {
              const c = data.cycles.find((x) => x.id === r.cycleId);
              return (
                <li key={r.id}>
                  <Link to={`/performance/checkins/${r.id}?tab=summary`} className="pf-ck-hist__item">
                    <span className="pf-ck-hist__q">{cycleShort(c)}</span>
                    {r.manager.overall && <RatingChip rating={r.manager.overall} />}
                    <span className="pf-spacer" />
                    {r.release?.acknowledgedAt ? (
                      <span className="pf-ck-ok" title={`Acknowledged ${new Date(r.release.acknowledgedAt).toLocaleDateString()}`}>
                        <Check aria-hidden="true" /> Read
                      </span>
                    ) : (
                      <Chip tone="warning" size="sm">
                        Acknowledge
                      </Chip>
                    )}
                    <ChevronRight className="pf-ck-hist__chev" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="pf-muted text-sm">Your shared reviews will collect here, {ctx.me.name.split(' ')[0]} — with ratings over time.</p>
      )}
    </NeoPanel>
  );
}
