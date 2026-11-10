/**
 * Home — "Your quarter at a glance": where the cycle is, what needs you next,
 * your OKRs, the highlights you've earned, your next 1:1 and growth focus.
 */
import { useMemo, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Compass,
  Ellipsis,
  Flame,
  Grid3x3,
  MessageSquareHeart,
  MessageSquarePlus,
  MessagesSquare,
  NotebookPen,
  Orbit,
  Pencil,
  Pin,
  Send,
  Sprout,
  SquareCheckBig,
  Target,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { Bar, Chip, NeoHead, NeoMenu, NeoStage, NovaChip } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { greeting } from '@/lib/format';
import { cx } from '@/lib/cx';
import { COMPETENCY, PHASE, STATUS_META } from '@/performance/constants';
import { currentPhaseKey, getPhase } from '@/performance/cycle';
import type { EvidenceItem } from '@/performance/evidence';
import { checkinStreak, elapsed, formatValue, krProgress, rollupStatus } from '@/performance/okr';
import { currentPeriod, myCheckinKrs, objectivesOwnedBy, primaryCycle, reviewOf, rollup, todosFor, visibleFeedback, type Todo } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { KrStatus } from '@/performance/types';
import { CycleTimeline, type PhaseMark } from './CycleTimeline';
import { dayLabel, dueLabel, shortDate, useMinute, usePerfCtx, type PerfCtx } from './hooks';
import { OkrRing, Section, StatusChip } from './ui';
import { useEvidence } from './useEvidence';

const DAY = 86_400_000;

const TODO_ICON: Record<Todo['kind'], ReactElement> = {
  self: <NotebookPen />,
  ack: <BadgeCheck />,
  peer: <Users />,
  upward: <TrendingUp />,
  request: <MessageSquarePlus />,
  checkin: <Target />,
  nominations: <UserPlus />,
  manager: <Pencil />,
  'okr-first': <Compass />,
  oneonone: <MessagesSquare />,
  calibrate: <Grid3x3 />,
};

const EVIDENCE_ICON: Record<EvidenceItem['kind'], ReactElement> = {
  work: <SquareCheckBig />,
  kudos: <Award />,
  feedback: <MessageSquareHeart />,
  okr: <Target />,
  pinned: <Pin />,
};

export function HomeView() {
  const ctx = usePerfCtx();
  const now = useMinute();
  const navigate = useNavigate();
  const data = usePerf();
  const period = currentPeriod(data, now);
  const cycle = primaryCycle(data, now);
  const todos = useMemo(() => (ctx ? todosFor(data, ctx.me, ctx.v, ctx.users, now) : []), [data, ctx, now]);
  if (!ctx) return null;

  const phase = cycle ? currentPhaseKey(cycle, now) : null;
  const day = Math.max(1, Math.ceil((now - period.start) / DAY));
  const days = Math.round((period.end - period.start) / DAY);
  const primary = todos[0];

  return (
    <NeoStage label="Performance home">
      <NeoHead
        icon={<Orbit />}
        eyebrow={
          <>
            {period.label}
            {phase && (
              <>
                <span aria-hidden="true">·</span> {PHASE[phase].label} open
              </>
            )}
          </>
        }
        title={`${greeting(new Date(now))}, ${ctx.me.name.split(' ')[0]}`}
        sub={`Day ${day} of ${days} · ${todos.length ? `${todos.length} thing${todos.length === 1 ? '' : 's'} worth your attention` : 'You’re all caught up'}`}
        actions={
          <>
            {primary ? (
              <Link to={primary.to} className="neo-btn neo-btn--plasma" data-qa="home-primary">
                {TODO_ICON[primary.kind]}
                <span className="neo-btn__label">{ctaLabel(primary)}</span>
              </Link>
            ) : (
              <Link to="?checkin=1" className="neo-btn neo-btn--plasma">
                <Target />
                <span className="neo-btn__label">Check in</span>
              </Link>
            )}
            <Link to="/performance/feedback?give=1" className="neo-btn neo-btn--soft" data-tip="Praise or constructive, with the SBI coach">
              <Send />
              <span className="neo-btn__label">Give feedback</span>
            </Link>
            <NeoMenu
              label="More actions"
              items={[
                { label: 'Check in on my OKRs', icon: <Target />, hint: 'I', onSelect: () => navigate('?checkin=1') },
                { label: 'Request feedback', icon: <MessageSquarePlus />, onSelect: () => navigate('/performance/feedback?request=1') },
                { label: 'Create an objective', icon: <Compass />, onSelect: () => navigate('/performance/okrs?new=1') },
                { label: 'Open the Goal Galaxy', icon: <Orbit />, onSelect: () => navigate('/performance/okrs?view=galaxy') },
                { label: 'My growth plan', icon: <Sprout />, onSelect: () => navigate('/performance/growth') },
              ]}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-body neo-pad pf-home">
        {cycle && <QuarterCard ctx={ctx} now={now} />}
        {ctx.reportIds.length > 0 && <TeamPulse ctx={ctx} now={now} />}
        <div className="pf-home__grid">
          <div className="pf-home__main">
            <MyOkrs ctx={ctx} now={now} />
            <HighlightsReel ctx={ctx} since={period.start} />
            <FeedbackInbox ctx={ctx} now={now} />
          </div>
          <aside className="pf-home__aside" aria-label="Up next">
            <UpNext todos={todos} now={now} />
            <NextOneOnOne ctx={ctx} now={now} />
            <GrowthFocus ctx={ctx} now={now} />
          </aside>
        </div>
      </div>
    </NeoStage>
  );
}

function ctaLabel(t: Todo) {
  switch (t.kind) {
    case 'self':
      return t.title.startsWith('Finish') ? 'Finish self-reflection' : 'Write self-reflection';
    case 'ack':
      return 'Read your review';
    case 'okr-first':
      return 'Set first OKRs';
    case 'checkin':
      return 'Check in';
    case 'nominations':
      return 'Approve peers';
    case 'manager':
      return 'Write reviews';
    case 'request':
      return 'Answer request';
    case 'peer':
    case 'upward':
      return 'Give feedback';
    case 'oneonone':
      return 'Prep 1:1';
    default:
      return 'Open';
  }
}

/* ───────── Quarter / cycle ───────── */

function QuarterCard({ ctx, now }: { ctx: PerfCtx; now: number }) {
  const data = usePerf();
  const cycle = primaryCycle(data, now)!;
  const review = reviewOf(data, cycle.id, ctx.me.id);
  const phase = currentPhaseKey(cycle, now);
  const self = getPhase(cycle, 'self');
  const myPeers = data.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.authorId === ctx.me.id && f.status !== 'proposed' && f.status !== 'declined');
  const marks: Partial<Record<keyof typeof PHASE, PhaseMark>> = {
    self: review?.self.status === 'submitted' ? 'done' : 'todo',
    peer: myPeers.length && myPeers.every((f) => f.status === 'submitted') ? 'done' : myPeers.length ? 'todo' : 'na',
  };
  const selfDue = self ? dueLabel(self.end, now) : null;
  const status = review?.self.status ?? 'not-started';
  const headline =
    phase === 'self'
      ? status === 'submitted'
        ? 'Your self-reflection is in — nice work.'
        : status === 'draft'
          ? 'Your self-reflection is in draft.'
          : 'Time to reflect on your quarter.'
      : phase
        ? `${PHASE[phase].label} is underway.`
        : `${cycle.name}`;
  return (
    <section className="neo-card pf-quarter neo-spot" aria-label={cycle.name}>
      <div className="pf-quarter__intro">
        <div className="neo-hud neo-hud--tint">{cycle.name}</div>
        <h2 className="pf-quarter__title">{headline}</h2>
        <p className="pf-quarter__sub">
          {phase === 'self' && status !== 'submitted' && selfDue
            ? `${selfDue.text} · ${shortDate(self!.end)}. Nova drafts it from your highlights — you stay in control.`
            : phase
              ? PHASE[phase].blurb
              : 'Your quarterly check-in rhythm.'}
        </p>
        <div className="pf-row pf-row--wrap">
          {review && (
            <Link to={`/performance/checkins/${review.id}`} className={cx('neo-btn neo-btn--sm', status === 'submitted' ? 'neo-btn--soft' : 'neo-btn--plasma')}>
              <NotebookPen />
              {status === 'submitted' ? 'Review my reflection' : status === 'draft' ? 'Continue writing' : 'Start reflecting'}
            </Link>
          )}
          <Link to="/performance/checkins" className="neo-btn neo-btn--ghost neo-btn--sm">
            Check-in hub <ArrowRight />
          </Link>
        </div>
      </div>
      <div className="pf-quarter__tl">
        <CycleTimeline cycle={cycle} now={now} marks={marks} />
      </div>
    </section>
  );
}

/* ───────── Team pulse (managers) ───────── */

function TeamPulse({ ctx, now }: { ctx: PerfCtx; now: number }) {
  const data = usePerf();
  const period = currentPeriod(data, now);
  const cycle = primaryCycle(data, now);
  const rows = ctx.reportIds.map((id) => {
    const objs = objectivesOwnedBy(data, id, period.id).map((o) => rollup(data, o, now));
    const krs = myCheckinKrs(data, id, period.id);
    const status: KrStatus = objs.length ? rollupStatus(objs.map((r) => r.status)) : 'on-track';
    const progress = objs.length ? objs.reduce((s, r) => s + r.progress, 0) / objs.length : 0;
    const r = cycle ? reviewOf(data, cycle.id, id) : undefined;
    const series = data.series.find((s) => (s.leadId === ctx.me.id && s.memberId === id) || (s.memberId === ctx.me.id && s.leadId === id));
    const mood = series?.meetings[0]?.moods[id];
    const risky = krs.map((k) => ({ k, s: rollup(data, data.objectives.find((o) => o.id === k.objectiveId)!, now).statuses[k.id] })).find((x) => x.s === 'off-track' || x.s === 'at-risk');
    let flag: { text: string; tone: 'danger' | 'warning' | 'success' | 'slate' };
    if (mood !== undefined && mood <= 2) flag = { text: `Mood ${mood}/5 last 1:1`, tone: 'danger' };
    else if (risky) flag = { text: `${risky.s === 'off-track' ? 'Off track' : 'At risk'}: ${risky.k.title}`, tone: risky.s === 'off-track' ? 'danger' : 'warning' };
    else if (r && r.self.status !== 'submitted') flag = { text: r.self.status === 'draft' ? 'Self-reflection in draft' : 'Self-reflection not started', tone: 'warning' };
    else if (r && r.self.status === 'submitted' && r.manager.status !== 'submitted') flag = { text: 'Ready for your review', tone: 'success' };
    else flag = { text: 'All good', tone: 'slate' };
    return { id, status, progress, flag, hasObjs: objs.length > 0 };
  });
  return (
    <section className="pf-pulse" aria-label="Team pulse">
      <div className="pf-pulse__head">
        <span className="neo-hud">Team pulse</span>
        <Link to="/performance/team" className="pf-link pf-pulse__all">
          Team view <ChevronRight />
        </Link>
      </div>
      <div className="pf-pulse__row">
        {rows.map((r) => {
          const u = ctx.user(r.id)!;
          return (
            <Link key={r.id} to="/performance/team" className="pf-pulse__chip neo-card--hover" data-tone={r.flag.tone}>
              <span className="pf-pulse__avatar">
                <OkrRing value={r.hasObjs ? r.progress : 0} status={r.hasObjs ? r.status : undefined} size={40} stroke={3} label={<Avatar user={u} size={30} />} />
              </span>
              <span className="pf-pulse__text">
                <b>{u.name.split(' ')[0]}</b>
                <span className="truncate">{r.flag.text}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ───────── My OKRs ───────── */

function MyOkrs({ ctx, now }: { ctx: PerfCtx; now: number }) {
  const data = usePerf();
  const period = currentPeriod(data, now);
  const owned = objectivesOwnedBy(data, ctx.me.id, period.id).map((o) => rollup(data, o, now));
  const order: KrStatus[] = ['off-track', 'at-risk', 'on-track', 'done'];
  owned.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.o.level.localeCompare(b.o.level));
  const ownedIds = new Set(owned.map((r) => r.o.id));
  const extraKrs = myCheckinKrs(data, ctx.me.id, period.id).filter((k) => !ownedIds.has(k.objectiveId));
  const myTimes = data.keyResults.flatMap((k) => k.checkins.filter((c) => c.byId === ctx.me.id).map((c) => c.at));
  const streak = checkinStreak(myTimes, now);
  const exp = elapsed(period, now);

  if (!owned.length && !extraKrs.length) {
    return (
      <Section title="My OKRs" icon={<Target />} hud={period.label}>
        <div className="pf-first-okr">
          <div className="pf-first-okr__orb" aria-hidden="true">
            <Compass />
          </div>
          <div className="grow">
            <div className="pf-first-okr__title">Set your first OKRs</div>
            <p className="pf-muted text-sm">Describe what you want to achieve in one sentence — Nova turns it into an objective with measurable key results, aligned to your team.</p>
          </div>
          <Link to="/performance/okrs?new=1" className="neo-btn neo-btn--nova" data-qa="first-okr">
            <NovaChip>Draft with Nova</NovaChip>
          </Link>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="My OKRs"
      icon={<Target />}
      hud={`${period.label} · ${Math.round(exp * 100)}% of the quarter gone`}
      actions={
        <>
          {streak > 0 && (
            <span className="pf-streak" data-tip={`${streak}-week check-in streak`}>
              <Flame /> {streak}w
            </span>
          )}
          <Link to="?checkin=1" className="neo-btn neo-btn--soft neo-btn--sm" data-qa="home-checkin">
            <Target /> Check in
          </Link>
        </>
      }
    >
      <div className="pf-myokrs">
        {owned.slice(0, 3).map((r) => (
          <Link key={r.o.id} to={`/performance/okrs/${r.o.id}`} className="pf-myokr neo-spot">
            <OkrRing value={r.progress} status={r.status} size={52} />
            <div className="pf-myokr__body">
              <div className="pf-row">
                <span className="pf-myokr__title truncate">{r.o.title}</span>
                <StatusChip status={r.status} />
              </div>
              <div className="pf-myokr__krs">
                {r.krs.slice(0, 3).map((k) => (
                  <div key={k.id} className="pf-krline" data-status={r.statuses[k.id]}>
                    <span className="pf-dot" aria-hidden="true" />
                    <span className="pf-krline__title truncate">{k.title}</span>
                    <Bar value={krProgress(k)} fill={`rgb(${STATUS_META[r.statuses[k.id]].rgb})`} className="pf-krline__bar" label={`${k.title} progress`} />
                    <span className="pf-krline__val neo-mono">{formatValue(k, k.current, { unit: false })}</span>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        ))}
        {extraKrs.length > 0 && (
          <div className="pf-myokrs__extra">
            <div className="neo-hud">Key results you own on others’ objectives</div>
            {extraKrs.slice(0, 4).map((k) => {
              const o = data.objectives.find((x) => x.id === k.objectiveId)!;
              const st = rollup(data, o, now).statuses[k.id];
              return (
                <Link key={k.id} to={`/performance/okrs/${o.id}`} className="pf-krline pf-krline--link" data-status={st}>
                  <span className="pf-dot" aria-hidden="true" />
                  <span className="pf-krline__title truncate">
                    {k.title} <span className="pf-faint">· {o.title}</span>
                  </span>
                  <Bar value={krProgress(k)} fill={`rgb(${STATUS_META[st].rgb})`} className="pf-krline__bar" label={`${k.title} progress`} />
                  <span className="pf-krline__val neo-mono">{formatValue(k, k.current, { unit: false })}</span>
                </Link>
              );
            })}
          </div>
        )}
        {owned.length > 3 && (
          <Link to="/performance/okrs?tab=mine" className="pf-link text-sm">
            View all {owned.length} objectives <ArrowRight className="pf-inline-icon" />
          </Link>
        )}
      </div>
    </Section>
  );
}

/* ───────── Highlights reel ───────── */

function HighlightsReel({ ctx, since }: { ctx: PerfCtx; since: number }) {
  const { items, workStatus } = useEvidence(ctx, ctx.me.id, since);
  return (
    <Section
      title="Highlights reel"
      icon={<Award />}
      hud={`${items.length} moments this quarter · auto-collected`}
      actions={
        <span className="pf-faint text-xs" data-tip="Shipped work, kudos, feedback and OKR progress flow in automatically and power your self-reflection">
          {workStatus === 'unavailable' ? 'Projects offline' : 'Live'}
        </span>
      }
    >
      {items.length ? (
        <div className="pf-reel" role="list">
          {items.slice(0, 14).map((e, i) => (
            <Link key={e.id} to={e.to ?? '/performance'} className="pf-reel__card" data-kind={e.kind} role="listitem" style={{ ['--i' as string]: i }}>
              <span className="pf-reel__icon">{EVIDENCE_ICON[e.kind]}</span>
              <span className="pf-reel__title pf-clamp-3">{e.kind === 'kudos' || e.kind === 'feedback' ? `“${e.title}”` : e.title}</span>
              <span className="pf-reel__meta">
                <span className="truncate">{e.sourceLabel}</span>
                <span>{shortDate(e.at)}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="pf-muted text-sm">Your highlights appear here as you ship work, receive kudos and check in on OKRs.</p>
      )}
    </Section>
  );
}

/* ───────── Aside cards ───────── */

function UpNext({ todos, now }: { todos: Todo[]; now: number }) {
  return (
    <Section title="Up next" icon={<CalendarClock />} hud={todos.length ? `${todos.length} open` : 'All clear'} className="pf-upnext">
      {todos.length ? (
        <ul className="pf-todos">
          {todos.slice(0, 6).map((t) => {
            const due = t.due ? dueLabel(t.due, now) : null;
            return (
              <li key={t.id}>
                <Link to={t.to} className="pf-todo" data-kind={t.kind}>
                  <span className="pf-todo__icon">{TODO_ICON[t.kind]}</span>
                  <span className="pf-todo__text">
                    <span className="pf-todo__title">{t.title}</span>
                    <span className="pf-todo__sub truncate">{t.sub}</span>
                  </span>
                  {due && (
                    <Chip tone={due.tone} size="sm" className="pf-todo__due">
                      {due.text.replace('Due in ', '')}
                    </Chip>
                  )}
                  <ChevronRight className="pf-todo__chev" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pf-muted text-sm">Nothing waiting on you. A great moment to give someone feedback.</p>
      )}
    </Section>
  );
}

function NextOneOnOne({ ctx, now }: { ctx: PerfCtx; now: number }) {
  const series = usePerf((s) => s.series);
  const next = useMemo(() => series.filter((s) => s.leadId === ctx.me.id || s.memberId === ctx.me.id).sort((a, b) => a.nextAt - b.nextAt)[0], [series, ctx.me.id]);
  if (!next) return null;
  const other = next.leadId === ctx.me.id ? next.memberId : next.leadId;
  const u = ctx.user(other);
  const open = next.agenda.filter((a) => !a.done);
  return (
    <Section title="Next 1:1" icon={<MessagesSquare />} hud={dayLabel(next.nextAt, now)} className="pf-next11">
      <Link to={`/performance/one-on-ones/${next.id}`} className="pf-next11__who">
        {u && <Avatar user={u} size={34} presence />}
        <span className="grow">
          <b>{u?.name}</b>
          <span className="pf-faint text-xs">{next.kind === 'mentor' ? 'Mentoring' : next.leadId === ctx.me.id ? 'Your report' : 'Your manager'}</span>
        </span>
        <ChevronRight className="pf-faint" />
      </Link>
      {open.length ? (
        <ul className="pf-agenda-mini">
          {open.slice(0, 3).map((a) => (
            <li key={a.id}>
              <span className="pf-agenda-mini__dot" aria-hidden="true" />
              <span className="truncate">{a.text}</span>
              <span className="pf-faint text-xs">{ctx.first(a.byId)}</span>
            </li>
          ))}
          {open.length > 3 && <li className="pf-faint text-xs">+{open.length - 3} more</li>}
        </ul>
      ) : (
        <p className="pf-muted text-sm">No talking points yet — add one before you meet.</p>
      )}
    </Section>
  );
}

function FeedbackInbox({ ctx, now }: { ctx: PerfCtx; now: number }) {
  const feedback = usePerf((s) => s.feedback);
  const requests = usePerf((s) => s.requests);
  const recent = useMemo(() => visibleFeedback({ feedback }, ctx.v, ctx.users).filter((f) => f.toId === ctx.me.id).sort((a, b) => b.at - a.at).slice(0, 2), [feedback, ctx]);
  const waiting = requests.filter((r) => !r.closedAt && r.respondentIds.includes(ctx.me.id) && !r.responses[ctx.me.id]).length;
  return (
    <Section
      title="Feedback"
      icon={<MessageSquareHeart />}
      hud={waiting ? `${waiting} request${waiting === 1 ? '' : 's'} waiting on you` : 'Inbox'}
      actions={
        <Link to="/performance/feedback?give=1" className="neo-btn neo-btn--ghost neo-btn--xs">
          <Send /> Give
        </Link>
      }
    >
      {recent.length ? (
        <ul className="pf-fbmini">
          {recent.map((f) => {
            const from = ctx.user(f.fromId);
            return (
              <li key={f.id}>
                <Link to="/performance/feedback" className="pf-fbmini__item">
                  {from && <Avatar user={from} size={26} />}
                  <span className="grow">
                    <span className="pf-fbmini__text pf-clamp-2">“{f.body}”</span>
                    <span className="pf-faint text-xs">
                      {from?.name.split(' ')[0]} · {f.kind === 'praise' ? 'Praise' : 'Constructive'} · {Math.max(0, Math.round((now - f.at) / DAY))}d ago
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pf-muted text-sm">No feedback yet this quarter. Ask for some — people love being asked.</p>
      )}
      {waiting > 0 && (
        <Link to="/performance/feedback?tab=requests" className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block">
          Answer {waiting} request{waiting === 1 ? '' : 's'}
        </Link>
      )}
    </Section>
  );
}

function GrowthFocus({ ctx, now }: { ctx: PerfCtx; now: number }) {
  const goals = usePerf((s) => s.goals);
  const goal = useMemo(() => goals.filter((g) => g.userId === ctx.me.id && g.status !== 'done').sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))[0], [goals, ctx.me.id]);
  return (
    <Section title="Growth focus" icon={<Sprout />} hud={goal?.competency ? COMPETENCY[goal.competency].label : 'Development plan'}>
      {goal ? (
        <Link to="/performance/growth" className="pf-growthmini">
          <span className="pf-growthmini__title">{goal.title}</span>
          <Bar value={goal.actions.length ? goal.actions.filter((a) => a.done).length / goal.actions.length : 0} label="Goal progress" />
          <span className="pf-row text-xs pf-faint">
            <span>
              {goal.actions.filter((a) => a.done).length}/{goal.actions.length} actions
            </span>
            {goal.dueAt && <span className="pf-spacer" />}
            {goal.dueAt && <span>{dueLabel(goal.dueAt, now).text}</span>}
          </span>
          {goal.actions.find((a) => !a.done) && (
            <span className="pf-growthmini__next">
              Next: <b>{goal.actions.find((a) => !a.done)!.text}</b>
            </span>
          )}
        </Link>
      ) : (
        <div className="pf-stack">
          <p className="pf-muted text-sm">No active growth goal. Nova can suggest one from your competency gaps.</p>
          <Link to="/performance/growth" className="neo-btn neo-btn--soft neo-btn--sm">
            <Sprout /> Plan my growth
          </Link>
        </div>
      )}
    </Section>
  );
}

