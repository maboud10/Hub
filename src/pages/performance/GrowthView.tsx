/**
 * Growth — "where am I, where am I going, and how do I get there?"
 *
 * Career ladder stepper, competency radar (self vs manager vs next level),
 * level expectations, promotion readiness (leaders) or a softer path to the
 * next level (employee), rating history and the development plan with Nova
 * goal suggestions.
 *
 * Route: /performance/growth — `?u=<userId>` lets managers (their org) and
 * People Ops (everyone) open someone else's plan. Editing follows
 * `canEditGrowth` (self, direct manager, People Ops); skip-levels view only.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowUp,
  ArrowUpRight,
  Award,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Ellipsis,
  Eye,
  Gauge,
  GraduationCap,
  Hourglass,
  Layers,
  Lock,
  MessagesSquare,
  Pencil,
  Plus,
  Radar as RadarIcon,
  RotateCcw,
  Route,
  Sparkles,
  Sprout,
  Star,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { Bar, Chip, CountUp, Meter, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoStage, PeoplePicker, Ring, type MenuEntry, type Tone } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHotkeys } from '@/hooks/useHotkeys';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import { canEditGrowth, canViewGrowth, isManagerOf, reviewAccess } from '@/performance/access';
import { COMPETENCIES, COMPETENCY, RATING, SCORE_LABEL } from '@/performance/constants';
import { defaultLadderFor, gapsTo, LADDER, LADDERS, levelOf, promotionReadiness, type Gap } from '@/performance/ladders';
import { suggestGrowthGoal } from '@/performance/nova';
import { usePerf } from '@/performance/store';
import type { CompetencyId, GoalStatus, GrowthGoal, Ladder, LadderId, LadderLevel, OverallRating, Score5, UserLevel } from '@/performance/types';
import { dueLabel, report, shortDate, useMinute, usePerfCtx, withUndo, type PerfCtx } from './hooks';
import { Radar, type RadarSeries } from './Radar';
import { Kbd, NovaBox, NovaThinking, PfModal, Section, Seg, useNova } from './ui';
import './styles/growth.css';

const DAY = 86_400_000;
const MONTH = 30 * DAY;

type Ratings = Partial<Record<CompetencyId, Score5>>;
type Suggestion = ReturnType<typeof suggestGrowthGoal>;
type NovaState = ReturnType<typeof useNova>;

/** Academy paths offered when creating a goal (per competency). */
const LEARNING: Record<CompetencyId, { title: string; to: string }[]> = {
  craft: [
    { title: 'Academy · Advanced craft path', to: '/academy' },
    { title: 'Academy · Giving great reviews', to: '/academy' },
  ],
  collaboration: [
    { title: 'Academy · Collaborating across teams', to: '/academy' },
    { title: 'Academy · Facilitation essentials', to: '/academy' },
  ],
  ownership: [
    { title: 'Academy · Leading without authority', to: '/academy' },
    { title: 'Academy · Raising risks early', to: '/academy' },
  ],
  impact: [
    { title: 'Academy · Writing great OKRs', to: '/academy' },
    { title: 'Academy · Storytelling with data', to: '/academy' },
  ],
  customer: [
    { title: 'Academy · Customer discovery', to: '/academy' },
    { title: 'Academy · Running user interviews', to: '/academy' },
  ],
};

const endOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(18, 0, 0, 0);
  return d.getTime();
};
const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fromDateInput = (s: string): number | undefined => {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 18, 0, 0, 0).getTime();
};
const monthYear = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const isStrong = (r: OverallRating) => r === 'exceeds' || r === 'exceptional';
const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ───────── Assessments visible to the viewer ───────── */

interface Assessment {
  reviewId: string;
  label: string;
  ratings: Ratings;
}

interface Assessments {
  self: Assessment | null;
  manager: Assessment | null;
  /** A newer submitted manager review the viewer can't see yet (e.g. not released). */
  hiddenManager: string | null;
  /** Overall ratings of the last two visible manager reviews (newest first). */
  lastTwo: OverallRating[];
  /** Visible overall ratings, oldest → newest. */
  history: { id: string; label: string; overall: OverallRating; released: boolean }[];
}

function useAssessments(ctx: PerfCtx, uid: string): Assessments {
  const reviews = usePerf((s) => s.reviews);
  const cycles = usePerf((s) => s.cycles);
  const periods = usePerf((s) => s.periods);
  return useMemo(() => {
    const meta = (cycleId: string) => {
      const c = cycles.find((x) => x.id === cycleId);
      const p = c ? periods.find((x) => x.id === c.periodId) : undefined;
      return { start: p?.start ?? c?.createdAt ?? 0, label: p?.label ?? c?.name ?? 'Review' };
    };
    const rows = reviews
      .filter((r) => r.employeeId === uid)
      .map((r) => ({ r, acc: reviewAccess(ctx.v, ctx.users, r), ...meta(r.cycleId) }))
      .sort((a, b) => b.start - a.start);
    const has = (x: object) => Object.keys(x).length > 0;
    const self = rows.find((x) => x.acc.seeSelf && x.r.self.status === 'submitted' && has(x.r.self.ratings));
    const mgr = rows.find((x) => x.acc.seeManager && x.r.manager.status === 'submitted' && has(x.r.manager.ratings));
    const hidden = rows.find((x) => x.r.manager.status === 'submitted' && !x.acc.seeManager && (!mgr || x.start > mgr.start));
    const rated = rows.filter((x) => x.acc.seeManager && x.r.manager.status === 'submitted' && !!x.r.manager.overall);
    return {
      self: self ? { reviewId: self.r.id, label: self.label, ratings: self.r.self.ratings } : null,
      manager: mgr ? { reviewId: mgr.r.id, label: mgr.label, ratings: mgr.r.manager.ratings } : null,
      hiddenManager: hidden ? hidden.label : null,
      lastTwo: rated.slice(0, 2).map((x) => x.r.manager.overall as OverallRating),
      history: rated.map((x) => ({ id: x.r.id, label: x.label, overall: x.r.manager.overall as OverallRating, released: !!x.r.release })).reverse(),
    };
  }, [reviews, cycles, periods, ctx.v, ctx.users, uid]);
}

/** Self first, then direct reports, then the rest of the org (or everyone for People Ops). */
function viewablePeople(ctx: PerfCtx): User[] {
  const ids = new Set<string>([ctx.me.id, ...(ctx.isAdmin ? ctx.people.map((p) => p.id) : ctx.orgIds)]);
  const rank = (u: User) => (u.id === ctx.me.id ? 0 : ctx.reportIds.includes(u.id) ? 1 : 2);
  return [...ids]
    .map((id) => ctx.user(id))
    .filter((u): u is User => !!u && u.active)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function suggestionText(s: Suggestion, isSelf: boolean, first: string): string {
  if (!s)
    return `${isSelf ? 'You already have' : `${first} already has`} a goal for every competency in Nova’s library. Write a custom stretch goal — a mentoring commitment or a cross-team initiative works well.`;
  const steps = s.actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  return `${s.why}\n\nSuggested goal: ${s.title}\n${steps}\nLearning: ${s.learning.map((l) => l.title).join(', ')}`;
}

/* ═════════════════════════ Screen ═════════════════════════ */

export function GrowthView() {
  const ctx = usePerfCtx();
  const [params] = useSearchParams();
  if (!ctx) return null;
  const uParam = params.get('u');
  const user = uParam ? ctx.user(uParam) : ctx.me;
  if (!user || !user.active || !ctx.peopleIds.has(user.id)) return <PlanUnavailable reason="missing" />;
  if (!canViewGrowth(ctx.v, ctx.users, user.id)) return <PlanUnavailable reason="private" />;
  return <GrowthPlan key={user.id} ctx={ctx} user={user} />;
}

interface GoalDraft {
  mode: 'new' | 'edit';
  goal?: GrowthGoal;
  initial?: { title: string; competency?: CompetencyId; why?: string; actions?: string[]; learning?: { title: string; to: string }[] };
}

function GrowthPlan({ ctx, user }: { ctx: PerfCtx; user: User }) {
  const now = useMinute();
  const navigate = useNavigate();
  const levels = usePerf((s) => s.levels);
  const allGoals = usePerf((s) => s.goals);
  const series = usePerf((s) => s.series);

  const uid = user.id;
  const isSelf = uid === ctx.me.id;
  const first = user.name.split(' ')[0];
  const canEdit = canEditGrowth(ctx.v, ctx.users, uid);
  const isManager = isManagerOf(ctx.users, ctx.me.id, uid);
  const canSetLevel = !isSelf && (isManager || ctx.isAdmin);

  const ul = levels[uid];
  const lv = levelOf(ul);
  const ladder = lv?.ladder ?? LADDER[defaultLadderFor(user.department)];
  const current = lv?.level ?? null;
  const next = lv ? lv.next : null;
  const bar = next ?? current;
  const months = ul ? Math.max(0, (now - ul.since) / MONTH) : 0;

  const assessed = useAssessments(ctx, uid);
  const basis = assessed.manager ?? assessed.self;
  const basisKind: 'manager' | 'self' | null = assessed.manager ? 'manager' : assessed.self ? 'self' : null;
  const scores = useMemo<Ratings>(() => basis?.ratings ?? {}, [basis]);
  const gaps = useMemo<Gap[]>(() => (bar ? gapsTo(bar, scores) : []), [bar, scores]);
  const focusAxis = useMemo(() => [...gaps].filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap)[0]?.competency, [gaps]);
  const readiness = useMemo(
    () => (current && next ? promotionReadiness({ next, scores, ratings: assessed.lastTwo, monthsInLevel: months }) : null),
    [current, next, scores, assessed.lastTwo, months],
  );

  const goals = useMemo(() => allGoals.filter((g) => g.userId === uid), [allGoals, uid]);
  const titles = useMemo(() => goals.map((g) => g.title), [goals]);
  const people = useMemo(() => viewablePeople(ctx), [ctx]);
  const oneOnOne = useMemo(
    () =>
      series.find((s) =>
        isSelf ? s.memberId === uid && s.leadId === user.managerId : (s.leadId === ctx.me.id && s.memberId === uid) || (s.memberId === ctx.me.id && s.leadId === uid),
      ),
    [series, isSelf, uid, user.managerId, ctx.me.id],
  );
  const mgr = user.managerId ? ctx.user(user.managerId) : undefined;

  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [levelOpen, setLevelOpen] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);

  /* Nova growth coach */
  const [skipped, setSkipped] = useState<string[]>([]);
  const suggestion = useMemo(() => suggestGrowthGoal(gaps.map((g) => ({ competency: g.competency, gap: g.gap })), [...titles, ...skipped]), [gaps, titles, skipped]);
  const nova = useNova(() => suggestionText(suggestion, isSelf, first), uid, 700);
  const [runTick, setRunTick] = useState(0);
  const runNova = nova.run;
  useEffect(() => {
    if (runTick) runNova();
  }, [runTick, runNova]);

  /* People Ops opening someone else's review data is audited (the store dedupes per session). */
  const selfReviewId = assessed.self?.reviewId;
  const mgrReviewId = assessed.manager?.reviewId;
  useEffect(() => {
    if (isSelf) return;
    const st = usePerf.getState();
    if (selfReviewId) st.viewPacket(selfReviewId);
    if (mgrReviewId) st.viewPacket(mgrReviewId);
  }, [isSelf, selfReviewId, mgrReviewId]);

  const pick = (id: string) => navigate(id === ctx.me.id ? '/performance/growth' : `/performance/growth?u=${encodeURIComponent(id)}`);
  const step = (dir: 1 | -1) => {
    if (people.length < 2) return;
    const i = people.findIndex((p) => p.id === uid);
    pick(people[(i + dir + people.length) % people.length].id);
  };
  const scrollToPlan = () => planRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const suggest = () => {
    setRunTick((t) => t + 1);
    scrollToPlan();
  };
  const addSuggestion = () => {
    if (!suggestion) return;
    const res = usePerf.getState().addGoal(uid, {
      title: suggestion.title,
      competency: suggestion.competency,
      why: suggestion.why,
      dueAt: endOfDay(now + 60 * DAY),
      actions: suggestion.actions,
      learning: suggestion.learning,
    });
    if (report(res, isSelf ? 'Added to your plan — nice move' : `Added to ${first}’s plan`)) nova.clear();
  };
  const tryAnother = () => {
    if (suggestion) setSkipped((s) => [...s, suggestion.title]);
    setRunTick((t) => t + 1);
  };
  const customize = () => {
    if (!suggestion) return;
    setGoalDraft({ mode: 'new', initial: { title: suggestion.title, competency: suggestion.competency, why: suggestion.why, actions: suggestion.actions, learning: suggestion.learning } });
  };

  useHotkeys({
    c: (e) => {
      if (!canEdit) return;
      e.preventDefault();
      setGoalDraft({ mode: 'new' });
    },
    j: () => step(1),
    k: () => step(-1),
  });

  const radarSeries = useMemo<RadarSeries[]>(() => {
    const out: RadarSeries[] = [];
    if (assessed.self) out.push({ id: 'self', label: isSelf ? 'You' : 'Self', sub: `Self-rating · ${assessed.self.label}`, tone: 'self', values: assessed.self.ratings });
    if (assessed.manager) out.push({ id: 'manager', label: 'Manager', sub: `Manager review · ${assessed.manager.label}`, tone: 'manager', values: assessed.manager.ratings });
    if (next) out.push({ id: 'next', label: `${next.id} expectation`, sub: next.title, tone: 'next', values: next.expect, outline: true });
    if (current) out.push({ id: 'level', label: `${current.id} expectation`, sub: `${current.title} · today`, tone: 'level', values: current.expect, outline: true, hidden: !!next });
    return out;
  }, [assessed.self, assessed.manager, next, current, isSelf]);

  let radarNote: ReactNode = null;
  if (!assessed.self && !assessed.manager)
    radarNote = isSelf
      ? 'No ratings yet — your self-reflection and manager review fill this in after your first quarterly check-in.'
      : `No ratings for ${first} yet — they appear after the first quarterly check-in.`;
  else if (!assessed.manager)
    radarNote = isSelf
      ? 'Your manager’s ratings appear here once a review is shared with you.'
      : isManager
        ? `Your ratings appear here once you submit ${first}’s review.`
        : `Manager ratings appear once ${first}’s review is submitted.`;
  else if (isSelf && assessed.hiddenManager) radarNote = `Your ${assessed.hiddenManager} manager review isn’t shared yet — showing the ${assessed.manager.label} review.`;

  const menu: MenuEntry[] = [];
  if (canSetLevel) menu.push({ label: 'Set career level', icon: <Layers />, onSelect: () => setLevelOpen(true) });
  if (oneOnOne)
    menu.push({
      label: isSelf ? `Open 1:1 with ${mgr ? mgr.name.split(' ')[0] : 'your manager'}` : `Open 1:1 with ${first}`,
      icon: <MessagesSquare />,
      onSelect: () => navigate(`/performance/one-on-ones/${oneOnOne.id}`),
    });
  if (canEdit) menu.push({ label: 'Suggest a goal with Nova', icon: <Sparkles />, onSelect: suggest });
  if (!isSelf) menu.push({ label: 'Back to my growth plan', icon: <Sprout />, onSelect: () => pick(ctx.me.id) });
  menu.push({ label: 'Browse the Academy', icon: <GraduationCap />, onSelect: () => navigate('/academy') });

  const title = isSelf ? 'Your growth' : `${first}’s growth`;
  const radarHud = `${basis ? `${basisKind === 'manager' ? 'Manager' : 'Self'} ratings · ${basis.label}` : 'No ratings yet'}${bar ? ` vs ${bar.id}` : ''}`;

  return (
    <NeoStage label={title}>
      <NeoHead
        icon={<Sprout />}
        eyebrow={
          <>
            Grow <span aria-hidden="true">·</span> {ladder.name} ladder
          </>
        }
        title={title}
        sub={
          current
            ? `${current.title} (${current.id}) · ${plural(Math.round(months), 'month')} in level${next ? ` · next: ${next.title}` : ' · top of the ladder'}`
            : 'Career level not set yet'
        }
        actions={
          <>
            {canEdit && (
              <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setGoalDraft({ mode: 'new' })} data-qa="gr-add" title="Add a growth goal (C)">
                <Plus />
                <span className="neo-btn__label">Add growth goal</span>
              </button>
            )}
            {canEdit && (
              <button type="button" className="neo-btn neo-btn--nova" onClick={suggest} data-qa="gr-nova" title="Nova suggests a goal from the radar gaps">
                <Sparkles />
                <span className="neo-btn__label">Suggest</span>
              </button>
            )}
            {!canEdit && oneOnOne && (
              <Link to={`/performance/one-on-ones/${oneOnOne.id}`} className="neo-btn neo-btn--soft">
                <MessagesSquare />
                <span className="neo-btn__label">Open 1:1</span>
              </Link>
            )}
            <NeoMenu
              label="More growth actions"
              items={menu}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions" data-qa="gr-more">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />
      <div className="neo-toolbar pf-gr-toolbar">
        {people.length > 1 ? (
          <PersonSwitcher ctx={ctx} user={user} people={people} onPick={pick} />
        ) : (
          <span className="pf-gr-who">
            <Avatar user={user} size={28} presence />
            <span className="pf-gr-switch__text">
              <b>{user.name}</b>
              <small>{user.title}</small>
            </span>
          </span>
        )}
        <span className="pf-spacer" />
        <Chip tone={isSelf ? 'app' : canEdit ? 'pink' : 'slate'} icon={isSelf ? <Sprout /> : canEdit ? <Pencil /> : <Eye />}>
          {isSelf ? 'Your plan' : canEdit ? 'You can edit' : 'View only'}
        </Chip>
        <span className="pf-gr-privacy">
          <Lock aria-hidden="true" />
          Visible to {isSelf ? 'you' : first}, {isSelf ? 'your' : 'their'} management chain and People Ops
        </span>
      </div>
      <div className="neo-body neo-pad pf-gr-body">
        <LadderHero
          ladder={ladder}
          current={current}
          next={next}
          ul={ul}
          now={now}
          isSelf={isSelf}
          first={first}
          canSetLevel={canSetLevel}
          onSetLevel={() => setLevelOpen(true)}
        />
        <div className="pf-gr-grid">
          <Section className="pf-gr-radarcard" title="Competency radar" icon={<RadarIcon />} hud={radarHud}>
            <Radar
              key={uid}
              series={radarSeries}
              basisId={basisKind ?? undefined}
              targetId={next ? 'next' : current ? 'level' : undefined}
              initialAxis={focusAxis}
              label={`${isSelf ? 'Your' : `${first}’s`} competency radar`}
              note={radarNote}
            />
          </Section>
          <div className="pf-gr-side">
            {readiness && current && next ? (
              isSelf ? (
                <PathCard r={readiness} next={next} gaps={gaps} months={months} lastTwo={assessed.lastTwo} canEdit={canEdit} onPlan={suggest} />
              ) : (
                <ReadinessCard
                  r={readiness}
                  current={current}
                  next={next}
                  months={months}
                  lastTwo={assessed.lastTwo}
                  basisLabel={basis ? `${basisKind === 'manager' ? 'manager' : 'self'} ratings from ${basis.label}` : 'no ratings yet'}
                  first={first}
                  canEdit={canEdit}
                  canSetLevel={canSetLevel}
                  onPlan={suggest}
                  onSetLevel={() => setLevelOpen(true)}
                />
              )
            ) : current ? (
              <TopOfLadder ladder={ladder} current={current} isSelf={isSelf} first={first} />
            ) : (
              <NoLevel isSelf={isSelf} first={first} canSetLevel={canSetLevel} onSetLevel={() => setLevelOpen(true)} />
            )}
            <RatingsHistory history={assessed.history} isSelf={isSelf} first={first} />
          </div>
        </div>
        {current && <Expectations current={current} next={next} scores={scores} basisKind={basisKind} basisLabel={basis?.label} isSelf={isSelf} />}
        <div ref={planRef} className="pf-gr-planwrap">
          <DevelopmentPlan
            ctx={ctx}
            goals={goals}
            isSelf={isSelf}
            first={first}
            canEdit={canEdit}
            now={now}
            nova={nova}
            suggestion={suggestion}
            onRunNova={() => setRunTick((t) => t + 1)}
            onAddSuggestion={addSuggestion}
            onTryAnother={tryAnother}
            onCustomize={customize}
            onNew={() => setGoalDraft({ mode: 'new' })}
            onEdit={(g) => setGoalDraft({ mode: 'edit', goal: g })}
          />
        </div>
      </div>
      <GoalModal draft={goalDraft} onClose={() => setGoalDraft(null)} uid={uid} first={first} isSelf={isSelf} now={now} defaultCompetency={focusAxis} />
      {canSetLevel && <SetLevelModal open={levelOpen} onClose={() => setLevelOpen(false)} user={user} ul={ul} />}
    </NeoStage>
  );
}

/* ═════════════════════════ Toolbar ═════════════════════════ */

function PersonSwitcher({ ctx, user, people, onPick }: { ctx: PerfCtx; user: User; people: User[]; onPick: (id: string) => void }) {
  const isSelf = user.id === ctx.me.id;
  const rel = isSelf ? 'Your plan' : ctx.reportIds.includes(user.id) ? 'Direct report' : ctx.orgIds.includes(user.id) ? 'In your org' : 'People Ops view';
  const quick = people.filter((p) => ctx.reportIds.includes(p.id)).slice(0, 7);
  return (
    <div className="pf-gr-switchrow">
      <PeoplePicker
        value={[user.id]}
        onChange={(ids) => {
          if (ids[0]) onPick(ids[0]);
        }}
        users={people}
        label="Open someone’s growth plan"
        trigger={(p) => (
          <button {...p} type="button" className="pf-gr-switch" data-qa="gr-switcher" title="Switch person (J / K)">
            <Avatar user={user} size={28} presence />
            <span className="pf-gr-switch__text">
              <b>{isSelf ? `${user.name} (you)` : user.name}</b>
              <small>
                {rel} · {user.title}
              </small>
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
        )}
      />
      {quick.length > 0 && (
        <div className="pf-gr-quick" role="group" aria-label="Jump to a plan">
          <button type="button" className={cx('pf-gr-quick__btn', isSelf && 'is-on')} onClick={() => onPick(ctx.me.id)} title="Your plan" aria-label="Your plan" aria-pressed={isSelf}>
            <Avatar user={ctx.me} size={26} />
          </button>
          {quick.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cx('pf-gr-quick__btn', p.id === user.id && 'is-on')}
              onClick={() => onPick(p.id)}
              title={`${p.name}’s plan`}
              aria-label={`${p.name}’s plan`}
              aria-pressed={p.id === user.id}
            >
              <Avatar user={p} size={26} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════ Career ladder ═════════════════════════ */

function LadderHero({
  ladder,
  current,
  next,
  ul,
  now,
  isSelf,
  first,
  canSetLevel,
  onSetLevel,
}: {
  ladder: Ladder;
  current: LadderLevel | null;
  next: LadderLevel | null;
  ul?: UserLevel;
  now: number;
  isSelf: boolean;
  first: string;
  canSetLevel: boolean;
  onSetLevel: () => void;
}) {
  const ci = current ? ladder.levels.findIndex((l) => l.id === current.id) : -1;
  const [sel, setSel] = useState<string>(next?.id ?? current?.id ?? ladder.levels[0].id);
  const selected = ladder.levels.find((l) => l.id === sel) ?? ladder.levels[0];
  const si = ladder.levels.indexOf(selected);
  const months = ul ? Math.round((now - ul.since) / MONTH) : 0;
  const stateOf = (i: number) => (ci < 0 ? 'future' : i < ci ? 'past' : i === ci ? 'current' : next && i === ci + 1 ? 'next' : 'future');
  const selState = stateOf(si);
  const style = { '--n': ladder.levels.length, '--ci': Math.max(0, ci), '--has-next': next ? 1 : 0 } as CSSProperties;

  return (
    <section className="neo-card pf-gr-ladder" aria-label="Career ladder">
      <header className="pf-gr-ladder__top">
        <div className="pf-gr-ladder__id">
          <div className="neo-hud neo-hud--tint">
            Career ladder · {ladder.name} · {ladder.track}
          </div>
          <h2 className="pf-gr-ladder__title">
            {current ? current.title : 'Career level not set yet'}
            {current && <span className="pf-gr-lvl">{current.id}</span>}
          </h2>
          <p className="pf-gr-ladder__sub">
            {current && ul
              ? `${plural(months, 'month')} in level · since ${monthYear(ul.since)}${next ? ` · next stop: ${next.title} (${next.id})` : ' · top of this ladder'}`
              : canSetLevel
                ? `Set ${first}’s level to unlock expectations and readiness.`
                : isSelf
                  ? 'Your manager or People Ops sets your level — meanwhile, explore what each level looks like.'
                  : 'Level not set yet.'}
          </p>
        </div>
        {canSetLevel && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onSetLevel} data-qa="gr-setlevel">
            <Layers /> Set level
          </button>
        )}
      </header>

      <div className="pf-gr-stepwrap" style={style} data-placed={ci >= 0 ? 'true' : undefined}>
        <ol className="pf-gr-steps">
          {ladder.levels.map((l, i) => {
            const st = stateOf(i);
            return (
              <li key={l.id} className="pf-gr-step" data-state={st}>
                <button
                  type="button"
                  className="pf-gr-step__btn"
                  aria-pressed={sel === l.id}
                  onClick={() => setSel(l.id)}
                  aria-label={`${l.id} ${l.title}${st === 'current' ? ' — current level' : st === 'next' ? ' — next level' : st === 'past' ? ' — achieved' : ''}`}
                >
                  <span className="pf-gr-step__node">
                    <span className="pf-gr-step__disc">{st === 'past' ? <Check aria-hidden="true" /> : l.id}</span>
                  </span>
                  <span className="pf-gr-step__title">{l.title}</span>
                  <span className="pf-gr-step__tag">{st === 'current' ? (isSelf ? 'You are here' : `${first} is here`) : st === 'next' ? 'Next level' : st === 'past' ? 'Achieved' : l.id}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="pf-gr-ladder__detail" aria-live="polite">
        <div className="pf-gr-ladder__dhead">
          <span className="pf-gr-lvl">{selected.id}</span>
          <b>{selected.title}</b>
          {selState === 'current' && (
            <Chip tone="app" size="sm" icon={<Target />}>
              Current
            </Chip>
          )}
          {selState === 'next' && (
            <Chip tone="amber" size="sm" icon={<ArrowUp />}>
              Next level
            </Chip>
          )}
          {selState === 'past' && (
            <Chip tone="success" size="sm" icon={<Check />}>
              Achieved
            </Chip>
          )}
        </div>
        <p className="pf-gr-ladder__summary">{selected.summary}</p>
        <div className="pf-gr-expect">
          {COMPETENCIES.map((c) => {
            const v = selected.expect[c.id];
            const d = current && si !== ci ? v - current.expect[c.id] : 0;
            return (
              <div key={c.id} className="pf-gr-expect__item">
                <span className="pf-gr-expect__label">{c.label}</span>
                <Meter value={v} segments={5} label={`${c.label}: ${v} of 5 at ${selected.id}`} />
                <span className="pf-gr-expect__val">
                  {v}
                  {d > 0 && <em className="is-up">+{d}</em>}
                  {d < 0 && <em className="is-down">{d}</em>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════ Readiness & path ═════════════════════════ */

type Readiness = ReturnType<typeof promotionReadiness>;

function readinessBand(score: number): { label: string; tone: Tone; icon: ReactNode } {
  if (score >= 85) return { label: 'Ready now', tone: 'success', icon: <CircleCheck /> };
  if (score >= 70) return { label: 'Ready soon', tone: 'teal', icon: <Route /> };
  if (score >= 40) return { label: 'Emerging', tone: 'amber', icon: <Sprout /> };
  return { label: 'Building foundations', tone: 'slate', icon: <Hourglass /> };
}

function GaugeArc({ value }: { value: number }) {
  const gid = useId().replace(/:/g, '');
  const p = Math.max(0, Math.min(100, value)) / 100;
  const r = 80;
  const len = Math.PI * r;
  const th = Math.PI * (1 - p);
  const dot = [100 + r * Math.cos(th), 100 - r * Math.sin(th)];
  return (
    <svg className="pf-gr-gauge__svg" viewBox="0 0 200 112" aria-hidden="true">
      <defs>
        <linearGradient id={`gg${gid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--app-c1)" />
          <stop offset="100%" stopColor="var(--app-c2)" />
        </linearGradient>
      </defs>
      <path d="M20 100 A80 80 0 0 1 180 100" className="pf-gr-gauge__track" />
      {[0.25, 0.5, 0.75].map((t) => {
        const a = Math.PI * (1 - t);
        return <line key={t} className="pf-gr-gauge__tick" x1={100 + 64 * Math.cos(a)} y1={100 - 64 * Math.sin(a)} x2={100 + 70 * Math.cos(a)} y2={100 - 70 * Math.sin(a)} />;
      })}
      <path d="M20 100 A80 80 0 0 1 180 100" className="pf-gr-gauge__value" stroke={`url(#gg${gid})`} strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
      <circle cx={dot[0]} cy={dot[1]} r="6" className="pf-gr-gauge__dot" />
    </svg>
  );
}

function ReadinessCard({
  r,
  current,
  next,
  months,
  lastTwo,
  basisLabel,
  first,
  canEdit,
  canSetLevel,
  onPlan,
  onSetLevel,
}: {
  r: Readiness;
  current: LadderLevel;
  next: LadderLevel;
  months: number;
  lastTwo: OverallRating[];
  basisLabel: string;
  first: string;
  canEdit: boolean;
  canSetLevel: boolean;
  onPlan: () => void;
  onSetLevel: () => void;
}) {
  const band = readinessBand(r.score);
  const strong = lastTwo.slice(0, 2).filter(isStrong).length;
  const factors = [
    { label: `Competencies at ${next.id}`, value: `${r.meets} of ${r.total}`, fill: r.total ? r.meets / r.total : 0, weight: 60, icon: <Layers /> },
    { label: 'Last two ratings', value: lastTwo.length ? `${strong} strong` : 'None yet', fill: strong / 2, weight: 30, icon: <Award /> },
    { label: 'Time in level', value: `${Math.round(months)} mo`, fill: Math.min(1, months / 12), weight: 10, icon: <Hourglass /> },
  ];
  return (
    <Section className="pf-gr-ready" title="Promotion readiness" icon={<Gauge />} hud={`${current.id} → ${next.id} · leader view`}>
      <div className="pf-gr-gauge" role="img" aria-label={`Promotion readiness ${r.score} of 100: ${band.label}`}>
        <GaugeArc value={r.score} />
        <div className="pf-gr-gauge__center">
          <span className="pf-gr-gauge__num neo-num">
            <CountUp value={r.score} />
            <small>/100</small>
          </span>
          <Chip tone={band.tone} size="sm" icon={band.icon}>
            {band.label}
          </Chip>
        </div>
      </div>
      <ul className="pf-gr-factors">
        {factors.map((f) => (
          <li key={f.label} className="pf-gr-factor">
            <span className="pf-gr-factor__icon" aria-hidden="true">
              {f.icon}
            </span>
            <div>
              <div className="pf-gr-factor__head">
                <span>{f.label}</span>
                <b>{f.value}</b>
              </div>
              <Bar value={f.fill} label={`${f.label}: ${f.value}`} />
            </div>
            <span className="pf-gr-factor__w" title="Weight in the readiness score">
              {f.weight}%
            </span>
          </li>
        ))}
      </ul>
      <p className="pf-gr-ready__basis">
        Based on {basisLabel}. Readiness starts a conversation with {first} — it isn’t a verdict.
      </p>
      <div className="pf-gr-ready__actions">
        {canEdit && (
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onPlan}>
            <Target /> Plan the gaps
          </button>
        )}
        {canSetLevel && (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onSetLevel}>
            <Layers /> Set level
          </button>
        )}
      </div>
    </Section>
  );
}

function PathCard({ r, next, gaps, months, lastTwo, canEdit, onPlan }: { r: Readiness; next: LadderLevel; gaps: Gap[]; months: number; lastTwo: OverallRating[]; canEdit: boolean; onPlan: () => void }) {
  const focus = gaps.filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap);
  const strong = lastTwo.slice(0, 2).filter(isStrong).length;
  const msg =
    r.meets === r.total
      ? `You meet every ${next.id} expectation — a great moment to talk timing with your manager.`
      : r.meets >= 3
        ? `You’re well on your way. Close ${focus.length === 1 ? 'one gap' : `${focus.length} gaps`} to reach the ${next.id} bar.`
        : 'Every step counts — pick one competency to grow this quarter.';
  return (
    <Section className="pf-gr-path" title={`Path to ${next.title}`} icon={<Route />} hud={`${next.id} · your next level`}>
      <div className="pf-gr-path__hero">
        <Ring value={r.total ? r.meets / r.total : 0} size={88} stroke={8} label={`${r.meets} of ${r.total} competencies at ${next.id}`}>
          <span className="pf-gr-path__ringnum">
            {r.meets}
            <small>/{r.total}</small>
          </span>
        </Ring>
        <div>
          <b className="pf-gr-path__lead">
            {r.meets} of {r.total} competencies already at the {next.id} bar.
          </b>
          <p className="pf-gr-path__msg">{msg}</p>
        </div>
      </div>
      {focus.length > 0 && (
        <div className="pf-gr-path__focus">
          <span className="neo-hud">Focus next</span>
          <div className="pf-row pf-row--wrap">
            {focus.map((g) => (
              <Chip key={g.competency} tone="amber" icon={<ArrowUp />}>
                {COMPETENCY[g.competency].label} +{g.gap}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <ul className="pf-gr-facts">
        <li>
          <Hourglass aria-hidden="true" /> {plural(Math.round(months), 'month')} in your current level
        </li>
        <li>
          <Award aria-hidden="true" />
          {lastTwo.length
            ? `${strong} of your last ${lastTwo.length === 1 ? 'shared review' : `${lastTwo.length} shared reviews`} rated Exceeds or above`
            : 'Your first shared review will show up here'}
        </li>
      </ul>
      {canEdit && focus.length > 0 && (
        <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onPlan}>
          <Sparkles /> Turn a gap into a goal
        </button>
      )}
    </Section>
  );
}

function TopOfLadder({ ladder, current, isSelf, first }: { ladder: Ladder; current: LadderLevel; isSelf: boolean; first: string }) {
  return (
    <Section title="Top of the ladder" icon={<Star />} hud={`${current.id} · ${ladder.name}`}>
      <p className="pf-gr-muted">
        {isSelf ? 'You’re' : `${first} is`} at the top of the {ladder.name} {ladder.track.toLowerCase()} ladder. Growth from here is about scope and
        influence — mentoring, cross-company bets, or a move into people leadership.
      </p>
    </Section>
  );
}

function NoLevel({ isSelf, first, canSetLevel, onSetLevel }: { isSelf: boolean; first: string; canSetLevel: boolean; onSetLevel: () => void }) {
  return (
    <Section title="Path to the next level" icon={<Route />} hud="Level not set">
      <p className="pf-gr-muted">
        {canSetLevel
          ? `Set ${first}’s level to see the expectations for their next step and how ready they are.`
          : isSelf
            ? 'Once your manager sets your level you’ll see exactly what the next step looks like.'
            : `${first}’s level hasn’t been set yet.`}
      </p>
      {canSetLevel && (
        <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onSetLevel}>
          <Layers /> Set level
        </button>
      )}
    </Section>
  );
}

function RatingsHistory({ history, isSelf, first }: { history: Assessments['history']; isSelf: boolean; first: string }) {
  return (
    <Section title="Rating history" icon={<ChartNoAxesColumn />} hud={isSelf ? 'Shared reviews' : 'Manager reviews'}>
      {history.length ? (
        <div className="pf-gr-hist" role="list">
          {history.map((h, i) => {
            const meta = RATING[h.overall];
            return (
              <div key={h.id} role="listitem" className={cx('pf-gr-hist__col', i === history.length - 1 && 'is-latest')} data-tone={meta.tone} aria-label={`${h.label}: ${meta.label}`}>
                <div className="pf-gr-hist__bar" aria-hidden="true">
                  {[5, 4, 3, 2, 1].map((v) => (
                    <i key={v} className={v <= meta.value ? 'on' : undefined} />
                  ))}
                </div>
                <span className="pf-gr-hist__label">{meta.label}</span>
                <span className="pf-gr-hist__period">{h.label}</span>
                {!h.released && <span className="pf-gr-hist__draft">Not shared yet</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="pf-gr-muted">
          {isSelf ? 'Your first overall rating appears here once a review is shared with you.' : `No submitted reviews for ${first} yet.`}
        </p>
      )}
    </Section>
  );
}

/* ═════════════════════════ Expectations ═════════════════════════ */

function Dots({ value, tone, ring }: { value: number; tone?: 'manager' | 'self' | null; ring?: boolean }) {
  return (
    <span className={cx('pf-gr-dots', tone && `is-${tone}`, ring && 'is-ring')} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'on' : undefined} />
      ))}
    </span>
  );
}

function GapChip({ gap, target }: { gap: number | null; target: string }) {
  if (gap === null)
    return (
      <Chip tone="slate" size="sm">
        No rating yet
      </Chip>
    );
  if (gap > 0)
    return (
      <Chip tone="amber" size="sm" icon={<ArrowUp />}>
        Grow +{gap}
      </Chip>
    );
  if (gap === 0)
    return (
      <Chip tone="success" size="sm" icon={<Check />}>
        At {target} bar
      </Chip>
    );
  return (
    <Chip tone="violet" size="sm" icon={<Star />}>
      Above bar
    </Chip>
  );
}

function Expectations({
  current,
  next,
  scores,
  basisKind,
  basisLabel,
  isSelf,
}: {
  current: LadderLevel;
  next: LadderLevel | null;
  scores: Ratings;
  basisKind: 'manager' | 'self' | null;
  basisLabel?: string;
  isSelf: boolean;
}) {
  const target = next ?? current;
  const style = { '--cols': next ? 3 : 2 } as CSSProperties;
  return (
    <Section
      className="pf-gr-exp"
      title="Level expectations"
      icon={<Layers />}
      hud={next ? `${current.id} today → ${next.id} next` : `${current.id} expectations`}
      actions={
        basisKind ? (
          <span className="pf-gr-exp__basis">
            Assessed with {basisKind === 'manager' ? 'manager' : isSelf ? 'your self-' : 'self-'}ratings{basisLabel ? ` · ${basisLabel}` : ''}
          </span>
        ) : undefined
      }
    >
      <div className="pf-gr-exp__head" style={style} aria-hidden="true">
        <span>Competency</span>
        <span>{current.id} bar</span>
        <span>Assessed</span>
        {next && <span>{next.id} bar</span>}
        <span>Gap</span>
      </div>
      <ul className="pf-gr-exp__list">
        {COMPETENCIES.map((c) => {
          const cur = current.expect[c.id];
          const nx = target.expect[c.id];
          const sc = scores[c.id];
          const gap = sc === undefined ? null : nx - sc;
          return (
            <li key={c.id} className="pf-gr-exp__row" style={style}>
              <div className="pf-gr-exp__comp">
                <b>{c.label}</b>
                <span>{c.blurb}</span>
              </div>
              <div className="pf-gr-exp__cell">
                <span className="pf-gr-exp__lbl">{current.id} bar</span>
                <Dots value={cur} />
                <span>{cur}</span>
              </div>
              <div className="pf-gr-exp__cell">
                <span className="pf-gr-exp__lbl">Assessed</span>
                {sc === undefined ? (
                  <span className="pf-faint">Not rated</span>
                ) : (
                  <>
                    <Dots value={sc} tone={basisKind} />
                    <span>
                      {sc} · {SCORE_LABEL[sc]}
                    </span>
                  </>
                )}
              </div>
              {next && (
                <div className="pf-gr-exp__cell">
                  <span className="pf-gr-exp__lbl">{next.id} bar</span>
                  <Dots value={nx} ring />
                  <span>{nx}</span>
                </div>
              )}
              <div className="pf-gr-exp__cell">
                <span className="pf-gr-exp__lbl">Gap</span>
                <GapChip gap={gap} target={target.id} />
              </div>
              <p className="pf-gr-exp__anchor">
                <span className="neo-hud">{target.id} looks like</span>
                {c.anchors[Math.max(0, Math.min(4, nx - 1))]}
              </p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function PlanUnavailable({ reason }: { reason: 'missing' | 'private' }) {
  return (
    <NeoStage label="Growth">
      <NeoHead icon={<Lock />} eyebrow="Grow" title="Growth plan" sub="This plan isn’t available to you" />
      <div className="neo-body neo-pad">
        <NeoEmpty
          icon={<Lock />}
          title={reason === 'missing' ? 'We couldn’t find that person' : 'This growth plan is private'}
          action={
            <Link to="/performance/growth" className="neo-btn neo-btn--soft">
              <Sprout /> Open my growth plan
            </Link>
          }
        >
          Growth plans are visible to the person, their management chain and People Ops.
        </NeoEmpty>
      </div>
    </NeoStage>
  );
}

/* ═════════════════════════ Development plan ═════════════════════════ */

const GOAL_ORDER: Record<GoalStatus, number> = { 'in-progress': 0, 'not-started': 1, done: 2 };

function DevelopmentPlan({
  ctx,
  goals,
  isSelf,
  first,
  canEdit,
  now,
  nova,
  suggestion,
  onRunNova,
  onAddSuggestion,
  onTryAnother,
  onCustomize,
  onNew,
  onEdit,
}: {
  ctx: PerfCtx;
  goals: GrowthGoal[];
  isSelf: boolean;
  first: string;
  canEdit: boolean;
  now: number;
  nova: NovaState;
  suggestion: Suggestion;
  onRunNova: () => void;
  onAddSuggestion: () => void;
  onTryAnother: () => void;
  onCustomize: () => void;
  onNew: () => void;
  onEdit: (g: GrowthGoal) => void;
}) {
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');
  const [q, setQ] = useState('');
  const active = goals.filter((g) => g.status !== 'done').length;
  const done = goals.length - active;
  const term = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      [...goals]
        .sort((a, b) => GOAL_ORDER[a.status] - GOAL_ORDER[b.status] || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
        .filter((g) => filter === 'all' || (filter === 'done' ? g.status === 'done' : g.status !== 'done'))
        .filter((g) => !term || `${g.title} ${g.why ?? ''} ${g.actions.map((a) => a.text).join(' ')}`.toLowerCase().includes(term)),
    [goals, filter, term],
  );

  return (
    <Section
      className="pf-gr-plan"
      id="plan"
      title="Development plan"
      icon={<Sprout />}
      hud={`${plural(active, 'active goal')} · ${done} completed`}
      actions={
        goals.length > 0 ? (
          <Seg
            size="sm"
            label="Filter goals"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: `Active ${active}` },
              { value: 'done', label: `Done ${done}` },
              { value: 'all', label: 'All' },
            ]}
          />
        ) : undefined
      }
    >
      {canEdit && (
        <NovaCoach
          nova={nova}
          suggestion={suggestion}
          isSelf={isSelf}
          first={first}
          onRun={onRunNova}
          onAdd={onAddSuggestion}
          onTryAnother={onTryAnother}
          onCustomize={onCustomize}
        />
      )}
      {goals.length > 3 && <NeoSearch value={q} onChange={setQ} placeholder="Search goals and actions…" size="sm" className="pf-gr-plan__search" label="Search growth goals" />}
      {goals.length === 0 ? (
        <div className="pf-gr-plan__empty">
          <NeoEmpty
            compact
            icon={<Sprout />}
            title={isSelf ? 'Start your development plan' : `${first} has no growth goals yet`}
            action={
              canEdit ? (
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onNew}>
                  <Plus /> Add a growth goal
                </button>
              ) : undefined
            }
          >
            Pick one competency to grow this quarter — small, concrete actions beat big intentions.
            {canEdit ? ' Nova can draft one from the radar gaps.' : ''}
          </NeoEmpty>
        </div>
      ) : list.length ? (
        <div className="pf-gr-goals">
          {list.map((g, i) => (
            <GoalCard key={g.id} g={g} i={i} ctx={ctx} now={now} canEdit={canEdit} onEdit={onEdit} />
          ))}
        </div>
      ) : (
        <p className="pf-gr-plan__none">
          {term
            ? `No goals match “${q.trim()}”.`
            : filter === 'done'
              ? 'No completed goals yet — finishing one is worth celebrating.'
              : 'Every goal is complete. Time to pick the next growth edge?'}
        </p>
      )}
      {canEdit && goals.length > 0 && (
        <div className="pf-hint-row">
          <Kbd>C</Kbd> adds a goal · tick actions as you go — finishing the last one completes the goal.
        </div>
      )}
    </Section>
  );
}

function NovaCoach({
  nova,
  suggestion,
  isSelf,
  first,
  onRun,
  onAdd,
  onTryAnother,
  onCustomize,
}: {
  nova: NovaState;
  suggestion: Suggestion;
  isSelf: boolean;
  first: string;
  onRun: () => void;
  onAdd: () => void;
  onTryAnother: () => void;
  onCustomize: () => void;
}) {
  const idle = !nova.thinking && !nova.text;
  return (
    <NovaBox
      className="pf-gr-nova"
      title="Nova · growth coach"
      hud={idle ? 'Reads the radar gaps' : nova.thinking ? 'Thinking' : 'Suggestion'}
      actions={
        !idle ? (
          <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="Dismiss suggestion" onClick={nova.clear}>
            <X />
          </button>
        ) : undefined
      }
    >
      {idle ? (
        <div className="pf-gr-nova__idle">
          <p>
            {isSelf ? 'Not sure what to work on next?' : `Looking for a growth goal for ${first}?`} Nova compares {isSelf ? 'your' : 'their'} latest ratings with the
            next level and drafts a goal with concrete actions and learning.
          </p>
          <button type="button" className="neo-btn neo-btn--nova neo-btn--sm" onClick={onRun} data-qa="gr-nova-run">
            <Sparkles /> Suggest a growth goal
          </button>
        </div>
      ) : nova.thinking ? (
        <NovaThinking label="Nova is reading the radar" />
      ) : (
        <>
          <div className={cx('pf-gr-nova__text', !nova.done && 'pf-caret')} aria-live="polite">
            {nova.shown}
          </div>
          {nova.done && (
            <div className="pf-gr-nova__actions">
              {suggestion && (
                <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onAdd} data-qa="gr-nova-add">
                  <Plus /> Add to plan
                </button>
              )}
              {suggestion && (
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onCustomize}>
                  <Pencil /> Edit first
                </button>
              )}
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={onTryAnother} data-qa="gr-nova-another">
                <RotateCcw /> Try another
              </button>
            </div>
          )}
        </>
      )}
    </NovaBox>
  );
}

function GoalStatusChip({ status }: { status: GoalStatus }) {
  if (status === 'done')
    return (
      <Chip tone="success" size="sm" icon={<CircleCheck />}>
        Done
      </Chip>
    );
  if (status === 'in-progress')
    return (
      <Chip tone="app" size="sm" icon={<CircleDot />}>
        In progress
      </Chip>
    );
  return (
    <Chip tone="slate" size="sm" icon={<CircleDashed />}>
      Not started
    </Chip>
  );
}

function GoalCard({ g, i, ctx, now, canEdit, onEdit }: { g: GrowthGoal; i: number; ctx: PerfCtx; now: number; canEdit: boolean; onEdit: (g: GrowthGoal) => void }) {
  const [draft, setDraft] = useState('');
  const cardRef = useRef<HTMLElement>(null);
  const doneN = g.actions.filter((a) => a.done).length;
  const total = g.actions.length;
  const due = g.dueAt && g.status !== 'done' ? dueLabel(g.dueAt, now) : null;
  const author = g.createdBy !== g.userId ? ctx.user(g.createdBy) : undefined;

  const celebrate = (el?: Element | null) => {
    const r = el?.getBoundingClientRect();
    burstConfetti(r ? { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 60) } : undefined);
  };
  const toggle = (actionId: string, el: HTMLElement) => {
    const was = g.status;
    const res = usePerf.getState().toggleGoalAction(g.id, actionId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.status === 'done' && was !== 'done') {
      celebrate(el);
      toast.success('Growth goal complete!', `“${g.title}” — that’s real progress.`);
    }
  };
  const addAction = () => {
    const t = draft.trim();
    if (!t) return;
    if (report(usePerf.getState().addGoalAction(g.id, t), '')) setDraft('');
  };
  const setStatus = (status: GoalStatus) => {
    const ok = report(usePerf.getState().updateGoal(g.id, { status }), status === 'done' ? 'Growth goal completed — well done' : status === 'in-progress' ? 'Goal in progress' : undefined);
    if (ok && status === 'done') celebrate(cardRef.current);
  };

  const menu: MenuEntry[] = [{ label: 'Edit goal', icon: <Pencil />, onSelect: () => onEdit(g) }];
  if (g.status === 'not-started') menu.push({ label: 'Mark in progress', icon: <CircleDot />, onSelect: () => setStatus('in-progress') });
  if (g.status === 'done') menu.push({ label: 'Reopen goal', icon: <RotateCcw />, onSelect: () => setStatus('in-progress') });
  else menu.push({ label: 'Mark as done', icon: <CircleCheck />, onSelect: () => setStatus('done') });
  menu.push({ kind: 'sep' });
  menu.push({ label: 'Delete goal', icon: <Trash2 />, danger: true, onSelect: () => withUndo(usePerf.getState().deleteGoal(g.id), `Deleted “${g.title}”`) });

  return (
    <article ref={cardRef} className={cx('neo-card pf-gr-goal neo-spot', g.status === 'done' && 'is-done')} style={{ ['--i' as string]: i }} data-qa={`gr-goal-${g.id}`}>
      <header className="pf-gr-goal__head">
        <div className="pf-gr-goal__chips">
          <GoalStatusChip status={g.status} />
          {g.competency && (
            <Chip tone="indigo" size="sm">
              {COMPETENCY[g.competency].label}
            </Chip>
          )}
          {due && (
            <Chip tone={due.tone} size="sm">
              {due.text}
            </Chip>
          )}
          {g.status === 'done' && (
            <Chip tone="slate" size="sm">
              Updated {shortDate(g.updatedAt)}
            </Chip>
          )}
        </div>
        {canEdit && (
          <NeoMenu
            label={`Actions for ${g.title}`}
            items={menu}
            trigger={(p) => (
              <button {...p} type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`More actions for “${g.title}”`}>
                <Ellipsis />
              </button>
            )}
          />
        )}
      </header>
      <h3 className="pf-gr-goal__title">{g.title}</h3>
      {g.why && <p className="pf-gr-goal__why">{g.why}</p>}
      {total > 0 && (
        <div className="pf-gr-goal__progress">
          <Bar value={doneN / total} label={`${doneN} of ${total} actions done`} />
          <span>
            {doneN}/{total}
          </span>
        </div>
      )}
      {total > 0 && (
        <ul className="pf-gr-goal__actions">
          {g.actions.map((a) => (
            <li key={a.id}>
              <label className={cx('pf-gr-goal__action', a.done && 'is-done')}>
                <input type="checkbox" className="neo-check" checked={a.done} disabled={!canEdit} onChange={(e) => toggle(a.id, e.currentTarget)} />
                <span>{a.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="pf-gr-goal__add">
          <Plus aria-hidden="true" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAction();
              }
              if (e.key === 'Escape') setDraft('');
            }}
            placeholder="Add an action and press Enter"
            aria-label={`Add an action to “${g.title}”`}
            maxLength={160}
          />
        </div>
      )}
      {(g.learning.length > 0 || author) && (
        <footer className="pf-gr-goal__foot">
          {g.learning.map((l) => (
            <Link key={l.title + l.to} to={l.to} className="pf-gr-learn">
              <GraduationCap aria-hidden="true" />
              <span>{l.title}</span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ))}
          {author && (
            <span className="pf-gr-goal__by">
              <Avatar user={author} size={16} /> Added by {author.id === ctx.me.id ? 'you' : author.name.split(' ')[0]}
            </span>
          )}
        </footer>
      )}
    </article>
  );
}

/* ═════════════════════════ Modals ═════════════════════════ */

function GoalModal({
  draft,
  onClose,
  uid,
  first,
  isSelf,
  now,
  defaultCompetency,
}: {
  draft: GoalDraft | null;
  onClose: () => void;
  uid: string;
  first: string;
  isSelf: boolean;
  now: number;
  defaultCompetency?: CompetencyId;
}) {
  const editing = draft?.mode === 'edit' ? draft.goal : undefined;
  const [title, setTitle] = useState('');
  const [competency, setCompetency] = useState<CompetencyId | undefined>(undefined);
  const [why, setWhy] = useState('');
  const [due, setDue] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [actionDraft, setActionDraft] = useState('');
  const [learning, setLearning] = useState<{ title: string; to: string }[]>([]);

  useEffect(() => {
    if (!draft) return;
    const g = draft.goal;
    const init = draft.initial;
    setTitle(g?.title ?? init?.title ?? '');
    setCompetency(g?.competency ?? init?.competency ?? defaultCompetency);
    setWhy(g?.why ?? init?.why ?? '');
    setDue(toDateInput(g?.dueAt ?? now + 60 * DAY));
    setActions(init?.actions ?? []);
    setActionDraft('');
    setLearning(init?.learning ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const presets = competency ? LEARNING[competency] : [];
  const learningOptions = [...learning, ...presets.filter((p) => !learning.some((l) => l.title === p.title))];
  const toggleLearning = (l: { title: string; to: string }) =>
    setLearning((cur) => (cur.some((x) => x.title === l.title) ? cur.filter((x) => x.title !== l.title) : [...cur, l]));
  const addAction = () => {
    const t = actionDraft.trim();
    if (!t) return;
    if (actions.length >= 8) {
      toast.info('Keep it focused', 'Up to 8 actions per goal.');
      return;
    }
    setActions((a) => [...a, t]);
    setActionDraft('');
  };
  const valid = title.trim().length >= 4;

  const save = () => {
    const dueAt = due ? fromDateInput(due) : undefined;
    const st = usePerf.getState();
    if (editing) {
      if (report(st.updateGoal(editing.id, { title: title.trim(), why: why.trim() || undefined, dueAt, competency }))) onClose();
      return;
    }
    const all = [...actions, actionDraft.trim()].filter(Boolean);
    if (report(st.addGoal(uid, { title: title.trim(), competency, why: why.trim() || undefined, dueAt, actions: all, learning }), isSelf ? 'Added to your plan' : `Added to ${first}’s plan`))
      onClose();
  };

  return (
    <PfModal
      open={!!draft}
      onClose={onClose}
      icon={editing ? <Pencil /> : <Sprout />}
      title={editing ? 'Edit growth goal' : isSelf ? 'New growth goal' : `New growth goal for ${first}`}
      subtitle={editing ? 'Actions are edited right on the goal card' : 'Concrete actions and a date make goals happen'}
      width={600}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" disabled={!valid} onClick={save} data-qa="gr-goal-save">
            <Check /> {editing ? 'Save changes' : 'Add to plan'}
          </button>
        </>
      }
    >
      <div className="pf-gr-form">
        <div className="neo-field">
          <label htmlFor="gr-goal-title">Goal</label>
          <input
            id="gr-goal-title"
            className="neo-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Own risks early and visibly"
            maxLength={120}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid && editing) save();
            }}
          />
        </div>
        <div className="neo-field">
          <span className="neo-label">Competency</span>
          <div className="pf-gr-comps">
            {COMPETENCIES.map((c) => (
              <Chip key={c.id} tone="app" pressed={competency === c.id} onClick={() => setCompetency(competency === c.id ? undefined : c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="neo-field">
          <label htmlFor="gr-goal-why">Why it matters</label>
          <textarea id="gr-goal-why" className="neo-textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What will be different when this is done?" maxLength={400} />
        </div>
        <div className="pf-form-row">
          <div className="neo-field">
            <label htmlFor="gr-goal-due">Target date</label>
            <input id="gr-goal-due" type="date" className="neo-input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        {!editing && (
          <div className="neo-field">
            <span className="neo-label">Actions</span>
            {actions.length > 0 && (
              <ul className="pf-gr-actlist">
                {actions.map((a, idx) => (
                  <li key={`${idx}-${a}`}>
                    <span>{a}</span>
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove “${a}”`} onClick={() => setActions((list) => list.filter((_x, j) => j !== idx))}>
                      <X />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="pf-gr-goal__add">
              <Plus aria-hidden="true" />
              <input
                value={actionDraft}
                onChange={(e) => setActionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAction();
                  }
                }}
                placeholder="Add a concrete action and press Enter"
                aria-label="Add an action"
                maxLength={160}
              />
            </div>
            <span className="neo-hint">Small, concrete steps — you can add more on the card later.</span>
          </div>
        )}
        {!editing && learningOptions.length > 0 && (
          <div className="neo-field">
            <span className="neo-label">Learning</span>
            <div className="pf-gr-learnpick">
              {learningOptions.map((l) => (
                <Chip key={l.title} tone="app" icon={<GraduationCap />} pressed={learning.some((x) => x.title === l.title)} onClick={() => toggleLearning(l)}>
                  {l.title.replace(/^Academy · /, '')}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </PfModal>
  );
}

function SetLevelModal({ open, onClose, user, ul }: { open: boolean; onClose: () => void; user: User; ul?: UserLevel }) {
  const first = user.name.split(' ')[0];
  const initialLadder = ul?.ladderId ?? defaultLadderFor(user.department);
  const [ladderId, setLadderId] = useState<LadderId>(initialLadder);
  const [levelId, setLevelId] = useState<string>(ul?.levelId ?? LADDER[initialLadder].levels[0].id);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setLadderId(initialLadder);
    setLevelId(ul?.levelId ?? LADDER[initialLadder].levels[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ladder = LADDER[ladderId];
  const prev = levelOf(ul);
  const idx = Math.max(0, ladder.levels.findIndex((l) => l.id === levelId));
  const promotion = !!prev && prev.ladder.id === ladderId && idx > prev.index;
  const unchanged = !!ul && ul.ladderId === ladderId && ul.levelId === levelId;

  const save = () => {
    const res = usePerf.getState().setLevel(user.id, ladderId, levelId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const lvl = ladder.levels[idx];
    if (promotion) {
      const r = btn.current?.getBoundingClientRect();
      burstConfetti(r ? { x: r.left + r.width / 2, y: r.top } : undefined);
      toast.success(`${first} is now ${lvl.title} (${lvl.id})`, 'Congratulations! They’ve been notified.');
    } else toast.success(res.message ?? 'Level updated', `${first} has been notified.`);
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      icon={<Layers />}
      title={`Set ${first}’s level`}
      subtitle="Updates their ladder, expectations and readiness"
      width={600}
      footer={
        <>
          <span className="pf-gr-modal__hint">
            <Lock aria-hidden="true" /> Audited · {first} is notified
          </span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button ref={btn} type="button" className="neo-btn neo-btn--plasma" disabled={unchanged} onClick={save} data-qa="gr-setlevel-confirm">
            {promotion ? <Award /> : <Check />} {promotion ? `Promote to ${levelId}` : `Set level to ${levelId}`}
          </button>
        </>
      }
    >
      <div className="pf-gr-form">
        <div className="neo-field">
          <label htmlFor="gr-ladder">Ladder</label>
          <select
            id="gr-ladder"
            className="neo-select"
            value={ladderId}
            onChange={(e) => {
              const l = e.target.value as LadderId;
              setLadderId(l);
              setLevelId(l === ul?.ladderId ? ul.levelId : LADDER[l].levels[0].id);
            }}
          >
            {LADDERS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.track}
              </option>
            ))}
          </select>
        </div>
        <div className="pf-gr-levelpick" role="radiogroup" aria-label="Level">
          {ladder.levels.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={levelId === l.id} className="pf-gr-levelopt" onClick={() => setLevelId(l.id)}>
              <span className="pf-gr-lvl">{l.id}</span>
              <span className="pf-gr-levelopt__text">
                <b>{l.title}</b>
                <small>{l.summary}</small>
              </span>
              {ul?.ladderId === ladderId && ul.levelId === l.id && (
                <Chip tone="slate" size="sm">
                  Current
                </Chip>
              )}
            </button>
          ))}
        </div>
      </div>
    </PfModal>
  );
}
