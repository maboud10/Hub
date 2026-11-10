/**
 * Team (managers) — `/performance/team` (the shell gates it to people with reports or performance.manage).
 *
 *  - Direct-report cards: OKR ring (roll-up of their current-period objectives), check-in pipeline for the
 *    primary cycle (self · peers · manager review · shared/acknowledged), days since the last 1:1, feedback
 *    balance (60 days, visible to you), needs-attention flags with reasons, quick actions (write review,
 *    1:1, give feedback, message, nudge).
 *  - Nova "Team pulse" (deterministic, from the flags) · review progress funnel · team OKR roll-up.
 *  - Person drawer with recent feedback, OKRs, 1:1, private notes and growth.
 * URL: `?scope=org` (managers of managers) · `?person=<userId>` opens the drawer. Hotkeys: C give feedback · S search.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CircleCheck,
  Download,
  Ellipsis,
  Eye,
  Frown,
  Grid3x3,
  HandHeart,
  ListTodo,
  Lock,
  MessageCircle,
  MessageSquareDashed,
  MessageSquareHeart,
  MessagesSquare,
  NotebookPen,
  OctagonAlert,
  PenLine,
  RefreshCw,
  Sprout,
  Target,
  TriangleAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Avatars, Bar, Chip, NeoEmpty, NeoHead, NeoMenu, NeoSearch, NeoStage, type MenuEntry } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { useHotkeys } from '@/hooks/useHotkeys';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { downloadCsv } from '@/lib/csv';
import { relativeTime } from '@/lib/format';
import { canViewFeedback, canViewObjective, reviewAccess } from '@/performance/access';
import { PHASE, STATUS_META } from '@/performance/constants';
import { canWriteManager, currentPhaseKey, getPhase, managerUnlocked } from '@/performance/cycle';
import { levelOf } from '@/performance/ladders';
import { formatValue, krStatus, rollupStatus } from '@/performance/okr';
import { currentPeriod, daysSinceLastOneOnOne, primaryCycle, reviewOf, rollup, type ObjectiveRollup } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { Cycle, Feedback, GrowthGoal, KrStatus, Objective, OneOnOneSeries, PerfData, Period, PhaseKey, PrivateNote, Review, ReviewStatus } from '@/performance/types';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import { dayLabel, dueLabel, report, shortDate, useMinute, usePerfCtx, type PerfCtx } from './hooks';
import { Kbd, NovaBox, NovaThinking, OkrRing, Seg, StatusChip, useNova } from './ui';
import { GiveFeedbackModal, KindChip } from './FeedbackModals';
import './styles/team.css';

const DAY = 86_400_000;

/* ═════════════════════════ Model ═════════════════════════ */

type FlagTone = 'danger' | 'warning' | 'app' | 'info';
interface TeamFlag {
  id: string;
  tone: FlagTone;
  icon: ReactNode;
  text: string;
  /** Lower-case phrase for the Nova summary. */
  short: string;
  to?: string;
}
interface ReviewAction {
  label: string;
  to?: string;
  reason?: string;
}
interface Member {
  id: string;
  user: User;
  first: string;
  direct: boolean;
  level?: string;
  rolls: ObjectiveRollup[];
  progress: number;
  status: KrStatus | null;
  review?: Review;
  selfStatus: ReviewStatus | null;
  peers: { done: number; total: number; proposed: number };
  mgr: 'locked' | ReviewStatus | null;
  release: 'none' | 'shared' | 'acked';
  series?: OneOnOneSeries;
  daysSince: number | null;
  oneOnOneWith?: string;
  lastMood: number | null;
  praise: number;
  constructive: number;
  recent: Feedback[];
  flags: TeamFlag[];
  attention: number;
  score: number;
  nudge: { phase: PhaseKey; label: string } | null;
  reviewAction: ReviewAction | null;
  notes: PrivateNote[];
  goals: GrowthGoal[];
}

type Snap = Pick<PerfData, 'objectives' | 'keyResults' | 'periods' | 'reviews' | 'cycleFeedback' | 'series' | 'feedback' | 'notes' | 'goals' | 'levels' | 'cycles'>;

const SEV: Record<FlagTone, number> = { danger: 5, warning: 3, app: 1, info: 0.4 };
const FLAG_ORDER: Record<FlagTone, number> = { danger: 0, warning: 1, app: 2, info: 3 };
const STATUS_ORDER: Record<KrStatus, number> = { 'off-track': 0, 'at-risk': 1, 'on-track': 2, done: 3 };
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function teamName(me: User): string {
  const after = me.title.split(',')[1]?.trim();
  if (after) return `${after} team`;
  if (!me.managerId) return 'Leadership team';
  return `${me.department} team`;
}

function buildMember(id: string, ctx: PerfCtx, d: Snap, cycle: Cycle | null, period: Period, now: number): Member | null {
  const user = ctx.user(id);
  if (!user) return null;
  const me = ctx.me.id;
  const first = user.name.split(' ')[0];
  const direct = user.managerId === me;
  const flags: TeamFlag[] = [];
  const canSee = (o: Objective) => canViewObjective(ctx.v, ctx.users, o);

  /* OKRs */
  const owned = d.objectives.filter((o) => o.periodId === period.id && (o.ownerId === id || o.coOwnerIds.includes(id)) && canSee(o));
  const rolls = owned.map((o) => rollup(d, o, now)).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.progress - b.progress);
  const progress = rolls.length ? rolls.reduce((s, r) => s + r.progress, 0) / rolls.length : 0;
  const status = rolls.length ? rollupStatus(rolls.map((r) => r.status)) : null;
  const activeIds = new Set(d.objectives.filter((o) => o.periodId === period.id && o.state === 'active' && canSee(o)).map((o) => o.id));
  const krs = d.keyResults.filter((k) => k.ownerId === id && activeIds.has(k.objectiveId)).map((k) => ({ k, s: krStatus(k, period, now) }));
  const off = krs.filter((x) => x.s === 'off-track');
  const risk = krs.filter((x) => x.s === 'at-risk');
  if (off.length)
    flags.push({ id: 'kr-off', tone: 'danger', icon: <OctagonAlert />, text: `KR off track: ${off[0].k.title}${off.length > 1 ? ` (+${off.length - 1} more)` : ''}`, short: `“${off[0].k.title}” is off track`, to: `/performance/okrs/${off[0].k.objectiveId}` });
  if (risk.length)
    flags.push({ id: 'kr-risk', tone: 'warning', icon: <TriangleAlert />, text: `KR at risk: ${risk[0].k.title}${risk.length > 1 ? ` (+${risk.length - 1} more)` : ''}`, short: `“${risk[0].k.title}” is at risk`, to: `/performance/okrs/${risk[0].k.objectiveId}` });
  if (!owned.length && !krs.length) flags.push({ id: 'okr-none', tone: 'warning', icon: <Target />, text: `No ${period.label} OKRs yet — help set the first ones`, short: `has no ${period.label} OKRs yet`, to: `/performance/okrs?new=1&owner=${id}` });

  /* Quarterly check-in */
  const review = cycle ? reviewOf(d, cycle.id, id) : undefined;
  const selfPhase = cycle ? getPhase(cycle, 'self') : undefined;
  const selfOpen = !!(cycle && cycle.status === 'active' && selfPhase && now <= selfPhase.end);
  if (review && selfPhase) {
    const due = lcFirst(dueLabel(selfPhase.end, now).text);
    if (selfOpen && review.self.status === 'not-started') flags.push({ id: 'self', tone: 'warning', icon: <CalendarClock />, text: `Self-reflection not started — ${due}`, short: 'the self-reflection isn’t started' });
    else if (selfOpen && review.self.status === 'draft' && selfPhase.end - now < 5 * DAY) flags.push({ id: 'self', tone: 'warning', icon: <CalendarClock />, text: `Self-reflection still a draft — ${due}`, short: 'the self-reflection is still a draft' });
    else if (!selfOpen && cycle?.status === 'active' && review.self.status !== 'submitted' && now > selfPhase.end) flags.push({ id: 'self', tone: 'danger', icon: <CalendarClock />, text: 'Self-reflection missed the deadline', short: 'the self-reflection deadline passed' });
  }
  const peerItems = cycle ? d.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.subjectId === id) : [];
  const peers = {
    done: peerItems.filter((f) => f.status === 'submitted').length,
    total: peerItems.filter((f) => f.status === 'submitted' || f.status === 'requested').length,
    proposed: peerItems.filter((f) => f.status === 'proposed').length,
  };
  const isMine = !!review && review.managerId === me;
  if (review && isMine && peers.proposed)
    flags.push({ id: 'noms', tone: 'warning', icon: <UserCheck />, text: `Peer nominations waiting for you (${peers.proposed})`, short: `${peers.proposed} peer nominations need your approval`, to: `/performance/checkins/${review.id}?tab=peers` });
  const unlocked = !!(cycle && review && managerUnlocked(cycle, review, now));
  const writable = !!(cycle && review && canWriteManager(cycle, review, now));
  const mgr: Member['mgr'] = !review ? null : review.manager.status === 'submitted' ? 'submitted' : unlocked ? review.manager.status : 'locked';
  if (review && isMine && writable && review.manager.status !== 'submitted' && !review.release)
    flags.push({
      id: 'mgr',
      tone: 'app',
      icon: <PenLine />,
      text: review.manager.status === 'draft' ? 'Your review is in draft — finish it' : 'Ready for your review — self-reflection is in',
      short: review.manager.status === 'draft' ? 'your review is in draft' : 'is ready for your review',
      to: `/performance/checkins/${review.id}?tab=manager`,
    });
  const release: Member['release'] = review?.release ? (review.release.acknowledgedAt ? 'acked' : 'shared') : 'none';
  const unacked = d.reviews.filter((r) => r.employeeId === id && r.release && !r.release.acknowledgedAt).sort((a, b) => (b.release?.releasedAt ?? 0) - (a.release?.releasedAt ?? 0))[0];
  if (unacked) {
    const name = (d.cycles.find((c) => c.id === unacked.cycleId)?.name ?? 'latest').replace(/ Check-in$/, '');
    flags.push({ id: 'ack', tone: 'info', icon: <Eye />, text: `Hasn’t acknowledged the ${name} review yet`, short: `hasn’t acknowledged the ${name} review`, to: `/performance/checkins/${unacked.id}?tab=summary` });
  }

  /* 1:1s (moods & action items only for series you are part of) */
  const series = d.series.find((s) => (s.leadId === me && s.memberId === id) || (s.leadId === id && s.memberId === me));
  const partner = series ? me : user.managerId;
  const daysSince = partner ? daysSinceLastOneOnOne(d, partner, id, now) : null;
  const lastMood = series?.meetings[0]?.moods[id] ?? null;
  const upcomingMood = series?.moods[id] ?? null;
  if (direct) {
    const to = series ? `/performance/one-on-ones/${series.id}` : undefined;
    if (!series) flags.push({ id: '1on1', tone: 'warning', icon: <CalendarX />, text: 'No 1:1 set up yet', short: 'there’s no 1:1 set up' });
    else if (daysSince === null) flags.push({ id: '1on1', tone: 'info', icon: <CalendarX />, text: 'No 1:1 held yet', short: 'no 1:1 has happened yet', to });
    else if (daysSince >= 21) flags.push({ id: '1on1', tone: 'warning', icon: <CalendarX />, text: `No 1:1 in ${daysSince} days`, short: `no 1:1 in ${daysSince} days`, to });
    if (lastMood !== null && lastMood <= 2) flags.push({ id: 'mood', tone: 'warning', icon: <Frown />, text: `Low mood last 1:1 (${lastMood}/5)`, short: `mood was ${lastMood}/5 at the last 1:1`, to });
    else if (upcomingMood !== null && upcomingMood <= 2) flags.push({ id: 'mood', tone: 'warning', icon: <Frown />, text: `Mood check-in: ${upcomingMood}/5 before your next 1:1`, short: `the mood check-in is ${upcomingMood}/5`, to });
    const overdue = series ? series.actionItems.filter((a) => !a.done && a.dueAt !== undefined && a.dueAt < now) : [];
    const theirs = overdue.filter((a) => a.ownerId === id);
    const owed = overdue.filter((a) => a.ownerId === me);
    if (theirs.length) flags.push({ id: 'act', tone: 'warning', icon: <ListTodo />, text: `Overdue action item: ${theirs[0].text}${theirs.length > 1 ? ` (+${theirs.length - 1})` : ''}`, short: 'an action item is overdue', to });
    if (owed.length) flags.push({ id: 'act-me', tone: 'warning', icon: <ListTodo />, text: `You owe ${first}: ${owed[0].text}`, short: `you owe ${first} an action item`, to });
  }

  /* Feedback (only what you may see) */
  const recent = d.feedback.filter((f) => f.toId === id && canViewFeedback(ctx.v, ctx.users, f)).sort((a, b) => b.at - a.at);
  const in60 = recent.filter((f) => now - f.at <= 60 * DAY);
  const praise = in60.filter((f) => f.kind === 'praise').length;
  if (direct && !recent.some((f) => now - f.at <= 45 * DAY)) flags.push({ id: 'fb', tone: 'info', icon: <MessageSquareDashed />, text: 'No feedback in 45+ days', short: 'hasn’t had feedback in 45+ days' });

  /* Nudge: the phase they are behind in */
  const peerPhase = cycle ? getPhase(cycle, 'peer') : undefined;
  const owes = cycle ? d.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.authorId === id && f.status === 'requested').length : 0;
  let nudge: Member['nudge'] = null;
  if (review && selfOpen && review.self.status !== 'submitted') nudge = { phase: 'self', label: `Nudge ${first} to write the self-reflection` };
  else if (owes && cycle?.status === 'active' && peerPhase && now <= peerPhase.end) nudge = { phase: 'peer', label: `Nudge ${first} to give peer feedback (${owes} waiting)` };

  /* Review action */
  let reviewAction: ReviewAction | null = null;
  if (review && isMine) {
    if (review.release) reviewAction = { label: 'View review', to: `/performance/checkins/${review.id}?tab=summary` };
    else if (writable)
      reviewAction = { label: review.manager.status === 'draft' ? 'Continue review' : review.manager.status === 'submitted' ? 'Edit review' : 'Write review', to: `/performance/checkins/${review.id}?tab=manager` };
    else if (!unlocked) reviewAction = { label: 'Write review', reason: `Unlocks when ${first} submits the self-reflection${selfPhase ? ` (or after ${shortDate(selfPhase.end)})` : ''}` };
    else reviewAction = review.manager.status === 'submitted' ? { label: 'View review', to: `/performance/checkins/${review.id}?tab=manager` } : { label: 'Write review', reason: 'Manager reviews are closed for this cycle' };
  } else if (review) {
    const acc = reviewAccess(ctx.v, ctx.users, review);
    if (acc.canView && (acc.seeSelf || acc.seeManager)) reviewAction = { label: 'View packet', to: `/performance/checkins/${review.id}` };
    else if (acc.canView) reviewAction = { label: 'View packet', reason: `Opens once ${first} submits the self-reflection` };
  }

  flags.sort((a, b) => FLAG_ORDER[a.tone] - FLAG_ORDER[b.tone]);
  const lv = levelOf(d.levels[id]);
  return {
    id,
    user,
    first,
    direct,
    level: lv ? `${lv.level.id} · ${lv.level.title}` : undefined,
    rolls,
    progress,
    status,
    review,
    selfStatus: review ? review.self.status : null,
    peers,
    mgr,
    release,
    series,
    daysSince,
    oneOnOneWith: partner,
    lastMood,
    praise,
    constructive: in60.length - praise,
    recent,
    flags,
    attention: flags.filter((f) => f.tone === 'danger' || f.tone === 'warning').length,
    score: flags.reduce((s, f) => s + SEV[f.tone], 0),
    nudge,
    reviewAction,
    notes: d.notes.filter((n) => n.authorId === me && n.subjectId === id).sort((a, b) => b.at - a.at),
    goals: d.goals.filter((g) => g.userId === id && g.status !== 'done'),
  };
}

function pulseText(members: Member[], me: string): string {
  if (!members.length) return 'No one in this view yet.';
  const parts: string[] = [];
  const ranked = [...members].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const topFlags = top.flags.filter((f) => f.tone === 'danger' || f.tone === 'warning');
  if (topFlags.length >= 2) parts.push(`${top.first} needs you most this week: ${listJoin(topFlags.slice(0, 3).map((f) => f.short))}.`);
  else if (topFlags.length === 1) parts.push(`${top.first} could use a hand: ${topFlags[0].short}.`);
  const ready = members.filter((m) => m.review?.managerId === me && !!m.reviewAction?.to && (m.mgr === 'not-started' || m.mgr === 'draft') && !m.review?.release);
  if (ready.length) {
    const drafts = ready.filter((m) => m.mgr === 'draft');
    parts.push(`${listJoin(ready.map((m) => m.first))} ${ready.length === 1 ? 'is' : 'are'} ready for your review${drafts.length ? ` (${listJoin(drafts.map((m) => m.first))} already in draft)` : ''}.`);
  }
  const noms = members.filter((m) => m.flags.some((f) => f.id === 'noms'));
  if (noms.length) parts.push(`Approve ${listJoin(noms.map((m) => `${m.first}’s ${m.peers.proposed}`))} peer nominations to keep the 360 on schedule.`);
  const notStarted = members.filter((m) => m !== top && m.selfStatus === 'not-started' && m.nudge?.phase === 'self');
  if (notStarted.length) parts.push(`${listJoin(notStarted.map((m) => m.first))} ${notStarted.length === 1 ? 'hasn’t' : 'haven’t'} started the self-reflection yet.`);
  const st = members.flatMap((m) => m.rolls.map((r) => r.status));
  if (st.length) {
    const c = (s: KrStatus) => st.filter((x) => x === s).length;
    parts.push(`Team OKRs: ${c('on-track') + c('done')} on track, ${c('at-risk')} at risk, ${c('off-track')} off track.`);
  }
  if (!parts.length) parts.push('Everyone is on track — a great week to recognise someone’s work.');
  return parts.join(' ');
}

/* ═════════════════════════ View ═════════════════════════ */

type Sort = 'attention' | 'name' | 'okr' | 'oneonone';

export function TeamView() {
  const ctx = usePerfCtx();
  const now = useMinute();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const objectives = usePerf((s) => s.objectives);
  const keyResults = usePerf((s) => s.keyResults);
  const periods = usePerf((s) => s.periods);
  const reviews = usePerf((s) => s.reviews);
  const cycleFeedback = usePerf((s) => s.cycleFeedback);
  const series = usePerf((s) => s.series);
  const feedback = usePerf((s) => s.feedback);
  const notes = usePerf((s) => s.notes);
  const goals = usePerf((s) => s.goals);
  const levels = usePerf((s) => s.levels);
  const cycles = usePerf((s) => s.cycles);
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [attnOnly, setAttnOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('attention');
  const [give, setGive] = useState<{ open: boolean; to?: string }>({ open: false });

  const me = ctx?.me.id ?? '';
  const hasOrg = !!ctx && ctx.orgIds.length > ctx.reportIds.length;
  const scope: 'direct' | 'org' = hasOrg && params.get('scope') === 'org' ? 'org' : 'direct';
  const personId = params.get('person');
  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const period = useMemo(() => currentPeriod({ periods }, now), [periods, now]);
  const cycle = useMemo(() => primaryCycle({ cycles, periods }, now), [cycles, periods, now]);
  const snap: Snap = useMemo(
    () => ({ objectives, keyResults, periods, reviews, cycleFeedback, series, feedback, notes, goals, levels, cycles }),
    [objectives, keyResults, periods, reviews, cycleFeedback, series, feedback, notes, goals, levels, cycles],
  );
  const ids = useMemo(() => (!ctx ? [] : scope === 'org' ? ctx.orgIds : ctx.reportIds), [ctx, scope]);
  const members = useMemo(() => (ctx && period ? ids.map((id) => buildMember(id, ctx, snap, cycle, period, now)).filter((m): m is Member => !!m) : []), [ctx, ids, snap, cycle, period, now]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = members.filter((m) => (!attnOnly || m.attention > 0) && (!s || `${m.user.name} ${m.user.title} ${m.user.department}`.toLowerCase().includes(s)));
    const by: Record<Sort, (a: Member, b: Member) => number> = {
      attention: (a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name),
      name: (a, b) => a.user.name.localeCompare(b.user.name),
      okr: (a, b) => (a.status ? a.progress : 2) - (b.status ? b.progress : 2),
      oneonone: (a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999),
    };
    return list.sort(by[sort]);
  }, [members, q, attnOnly, sort]);

  const groups = useMemo(() => {
    if (scope === 'direct' || !ctx) return [{ key: 'direct', label: null as string | null, manager: undefined as User | undefined, items: shown }];
    const out: { key: string; label: string | null; manager?: User; items: Member[] }[] = [{ key: 'direct', label: 'Your direct reports', manager: ctx.me, items: shown.filter((m) => m.direct) }];
    const mgrs = [...new Set(shown.filter((m) => !m.direct).map((m) => m.user.managerId ?? ''))].filter(Boolean);
    for (const mid of mgrs) {
      const u = ctx.user(mid);
      out.push({ key: mid, label: `${u?.name ?? 'Unknown'}’s team`, manager: u, items: shown.filter((m) => !m.direct && m.user.managerId === mid) });
    }
    return out.filter((g) => g.items.length);
  }, [scope, ctx, shown]);

  const person = personId ? (members.find((m) => m.id === personId) ?? (ctx && period && ctx.orgIds.includes(personId) ? buildMember(personId, ctx, snap, cycle, period, now) : null)) : null;
  const attentionN = members.filter((m) => m.attention > 0).length;
  const behind = members.filter((m) => m.nudge);
  const pulse = useMemo(() => pulseText(members, me), [members, me]);

  useHotkeys(
    {
      c: (e) => {
        e.preventDefault();
        setGive({ open: true });
      },
      s: (e) => {
        e.preventDefault();
        searchRef.current?.focus();
      },
    },
    !give.open && !person,
  );

  if (!ctx || !period) return null;

  const openPerson = (id: string) => setParam('person', id);
  const message = async (id: string) => {
    try {
      const api = await loadBridge('chat');
      const viewer = currentViewer();
      if (!viewer) throw new Error('signed out');
      navigate(api.dmRoute(viewer, id));
    } catch {
      toast.warning('Pulse Chat is unavailable right now', 'Try again in a moment — or give feedback here instead.');
    }
  };
  const nudgeOne = (m: Member) => {
    if (!cycle || !m.nudge) {
      toast.info(`${m.first} is all caught up`, 'Nothing to nudge right now.');
      return;
    }
    report(usePerf.getState().nudge(cycle.id, [m.id], m.nudge.phase), `Nudged ${m.first} — ${PHASE[m.nudge.phase].verb.toLowerCase()}`);
  };
  const nudgeAll = () => {
    if (!cycle) return;
    const self = behind.filter((m) => m.nudge?.phase === 'self').map((m) => m.id);
    const peer = behind.filter((m) => m.nudge?.phase === 'peer').map((m) => m.id);
    if (!self.length && !peer.length) {
      toast.info('Everyone is on track', 'No one needs a nudge right now.');
      return;
    }
    if (self.length) report(usePerf.getState().nudge(cycle.id, self, 'self'));
    if (peer.length) report(usePerf.getState().nudge(cycle.id, peer, 'peer'));
  };
  const setup = (m: Member) => {
    const d = new Date(now + DAY);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const res = usePerf.getState().createSeries({ partnerId: m.id, kind: 'manager', cadence: 'biweekly', firstAt: d.getTime() });
    if (!report(res, `1:1 with ${m.first} set up · first on ${dayLabel(d.getTime(), now)}`)) return;
    if (res.ok) navigate(`/performance/one-on-ones/${res.id}`);
  };
  const exportCsv = () => {
    downloadCsv(
      `team-snapshot-${new Date(now).toISOString().slice(0, 10)}.csv`,
      members.map((m) => ({
        Name: m.user.name,
        Title: m.user.title,
        Relationship: m.direct ? 'Direct report' : `Reports to ${ctx.name(m.user.managerId)}`,
        'OKR progress %': m.status ? Math.round(m.progress * 100) : '',
        'OKR status': m.status ? STATUS_META[m.status].label : 'No OKRs',
        'Self-reflection': m.selfStatus ?? '',
        Peers: `${m.peers.done}/${m.peers.total}${m.peers.proposed ? ` (+${m.peers.proposed} proposed)` : ''}`,
        'Manager review': m.mgr ?? '',
        Shared: m.release,
        'Days since 1:1': m.daysSince ?? '',
        'Praise (60d)': m.praise,
        'Constructive (60d)': m.constructive,
        'Needs attention': m.flags.map((f) => f.text).join('; '),
      })),
    );
    toast.success('Team snapshot downloaded');
  };

  const pulseActions: { key: string; label: string; icon: ReactNode; to?: string; run?: () => void }[] = [];
  const topNudge = [...members].sort((a, b) => b.score - a.score).find((m) => m.nudge && m.attention > 0);
  if (topNudge) pulseActions.push({ key: 'nudge', label: `Nudge ${topNudge.first}`, icon: <BellRing />, run: () => nudgeOne(topNudge) });
  const nomFlag = members.map((m) => ({ m, f: m.flags.find((f) => f.id === 'noms') })).find((x) => x.f);
  if (nomFlag?.f?.to) pulseActions.push({ key: 'noms', label: `Approve ${nomFlag.m.first}’s peers`, icon: <UserCheck />, to: nomFlag.f.to });
  const readyM = members.find((m) => m.flags.some((f) => f.id === 'mgr'));
  if (readyM?.reviewAction?.to) pulseActions.push({ key: 'review', label: `${readyM.reviewAction.label} · ${readyM.first}`, icon: <PenLine />, to: readyM.reviewAction.to });

  const directCount = ctx.reportIds.length;
  const sub = `${directCount} direct report${directCount === 1 ? '' : 's'}${hasOrg ? ` · ${ctx.orgIds.length} in your org` : ''} · ${attentionN ? `${attentionN} need${attentionN === 1 ? 's' : ''} attention` : 'everyone’s on track'}`;
  const menu: MenuEntry[] = [
    { label: behind.length ? `Nudge everyone behind (${behind.length})` : 'Nudge everyone behind', icon: <BellRing />, onSelect: nudgeAll, disabled: !behind.length || !cycle },
    { label: 'Open team OKRs', icon: <Target />, onSelect: () => navigate('/performance/okrs?view=team') },
  ];
  if (ctx.canCalibrate) menu.push({ label: 'Calibrate on the 9-box', icon: <Grid3x3 />, onSelect: () => navigate('/performance/calibration') });
  menu.push({ kind: 'sep' }, { label: 'Download team snapshot (CSV)', icon: <Download />, onSelect: exportCsv });

  return (
    <NeoStage label="Team">
      <NeoHead
        icon={<Users />}
        eyebrow={`Team · ${cycle?.name ?? period.label}`}
        title={teamName(ctx.me)}
        sub={sub}
        actions={
          <>
            <NeoMenu
              label="More team actions"
              items={menu}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More team actions" data-qa="tm-menu">
                  <Ellipsis />
                </button>
              )}
            />
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setGive({ open: true })} data-qa="tm-give" aria-label="Give feedback">
              <MessageSquareHeart />
              <span className="neo-btn__label">Give feedback</span>
              <span className="pf-tm-kbdhint">
                <Kbd>C</Kbd>
              </span>
            </button>
          </>
        }
      />
      <div className="neo-toolbar pf-tm-toolbar">
        {hasOrg && (
          <Seg
            value={scope}
            onChange={(v) => setParam('scope', v === 'org' ? 'org' : null)}
            label="Team scope"
            options={[
              { value: 'direct', label: `Direct reports · ${directCount}` },
              { value: 'org', label: `My org · ${ctx.orgIds.length}` },
            ]}
          />
        )}
        <NeoSearch value={q} onChange={setQ} placeholder="Find a person…" kbd="S" inputRef={searchRef} size="sm" label="Find a person" className="pf-tm-search" />
        <Chip tone={attnOnly ? 'warning' : 'slate'} icon={<TriangleAlert />} onClick={() => setAttnOnly((v) => !v)} pressed={attnOnly} title="Show only people who need attention">
          Needs attention · {attentionN}
        </Chip>
        <select className="neo-select neo-select--sm pf-tm-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort people">
          <option value="attention">Needs attention first</option>
          <option value="name">Name</option>
          <option value="okr">Lowest OKR progress</option>
          <option value="oneonone">Longest since 1:1</option>
        </select>
      </div>

      <div className="neo-body neo-pad">
        {!members.length ? (
          <NeoEmpty icon={<Users />} title="No direct reports yet" action={<Link to="/performance/calibration" className="neo-btn neo-btn--soft">Open calibration</Link>}>
            When people report to you in the directory, their cards appear here automatically.
          </NeoEmpty>
        ) : (
          <div className="pf-tm-layout">
            <div className="pf-tm-main">
              <PulseBox text={pulse} scopeKey={scope} actions={pulseActions} />
              {groups.length ? (
                groups.map((g) => (
                  <section key={g.key} className="pf-tm-group" aria-label={g.label ?? 'Direct reports'}>
                    {g.label && (
                      <div className="pf-tm-group__head">
                        {g.manager && <Avatar user={g.manager} size={22} />}
                        <span className="neo-hud">{g.label}</span>
                        <span className="neo-count">{g.items.length}</span>
                      </div>
                    )}
                    <div className="pf-tm-grid neo-stagger">
                      {g.items.map((m, i) => (
                        <MemberCard key={m.id} m={m} index={i} onOpen={openPerson} onGive={(id) => setGive({ open: true, to: id })} onMessage={message} onNudge={nudgeOne} onSetup={setup} />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="neo-card">
                  <NeoEmpty
                    compact
                    icon={<CircleCheck />}
                    title={attnOnly ? 'No one needs attention right now' : 'No one matches'}
                    action={
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--sm"
                        onClick={() => {
                          setQ('');
                          setAttnOnly(false);
                        }}
                      >
                        Show everyone
                      </button>
                    }
                  >
                    {attnOnly ? 'Lovely — a good moment to recognise someone’s work.' : 'Try another name.'}
                  </NeoEmpty>
                </div>
              )}
            </div>
            <aside className="pf-tm-aside" aria-label="Team overview">
              <FunnelCard members={members} cycle={cycle} now={now} onNudge={nudgeAll} />
              <OkrRollup ctx={ctx} members={members} snap={snap} period={period} now={now} />
            </aside>
          </div>
        )}
      </div>

      <PersonSheet m={person} ctx={ctx} now={now} cycleName={cycle?.name} onClose={() => setParam('person', null)} onGive={(id) => setGive({ open: true, to: id })} onMessage={message} onNudge={nudgeOne} />
      <GiveFeedbackModal open={give.open} onClose={() => setGive({ open: false })} toId={give.to} />
    </NeoStage>
  );
}

/* ═════════════════════════ Pieces ═════════════════════════ */

function PulseBox({ text, scopeKey, actions }: { text: string; scopeKey: string; actions: { key: string; label: string; icon: ReactNode; to?: string; run?: () => void }[] }) {
  const key = `${scopeKey}:${text}`;
  const nova = useNova(() => text, key, 650);
  useEffect(() => {
    nova.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <NovaBox
      className="pf-tm-pulse"
      title="Team pulse"
      hud="From live signals"
      actions={
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={nova.run} aria-label="Refresh team pulse">
          <RefreshCw />
        </button>
      }
    >
      {nova.thinking || !nova.text ? <NovaThinking label="Reading your team’s signals" /> : <p className={cx(!nova.done && 'pf-caret')}>{nova.shown}</p>}
      {actions.length > 0 && (
        <div className="pf-tm-pulse__acts">
          {actions.map((a) =>
            a.to ? (
              <Link key={a.key} to={a.to} className="neo-btn neo-btn--soft neo-btn--xs">
                {a.icon}
                {a.label}
              </Link>
            ) : (
              <button key={a.key} type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={a.run}>
                {a.icon}
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </NovaBox>
  );
}

function Track({ m, large }: { m: Member; large?: boolean }) {
  const steps: { key: string; label: string; state: string; detail: string }[] = [
    {
      key: 'self',
      label: 'Self',
      state: m.selfStatus === 'submitted' ? 'done' : m.selfStatus === 'draft' ? 'active' : m.selfStatus ? 'todo' : 'na',
      detail: m.selfStatus === 'submitted' ? 'Submitted' : m.selfStatus === 'draft' ? 'Draft' : m.selfStatus ? 'Not started' : '—',
    },
    {
      key: 'peers',
      label: 'Peers',
      state: !m.review ? 'na' : m.peers.proposed ? 'attn' : !m.peers.total ? 'todo' : m.peers.done >= m.peers.total ? 'done' : 'active',
      detail: !m.review ? '—' : m.peers.proposed ? `${m.peers.proposed} to approve` : m.peers.total ? `${m.peers.done}/${m.peers.total} in` : 'None yet',
    },
    {
      key: 'review',
      label: 'Review',
      state: m.mgr === 'submitted' ? 'done' : m.mgr === 'draft' ? 'active' : m.mgr === 'locked' ? 'locked' : m.mgr === 'not-started' ? 'todo' : 'na',
      detail: m.mgr === 'submitted' ? 'Submitted' : m.mgr === 'draft' ? 'Draft' : m.mgr === 'locked' ? 'Locked' : m.mgr === 'not-started' ? 'Unlocked' : '—',
    },
    {
      key: 'shared',
      label: 'Shared',
      state: m.release === 'acked' ? 'done' : m.release === 'shared' ? 'active' : m.review ? 'todo' : 'na',
      detail: m.release === 'acked' ? 'Acknowledged' : m.release === 'shared' ? 'Awaiting ack' : m.review ? 'Not yet' : '—',
    },
  ];
  return (
    <ol className={cx('pf-tm-track', large && 'pf-tm-track--lg')} aria-label="Quarterly check-in progress">
      {steps.map((s) => (
        <li key={s.key} className="pf-tm-step" data-state={s.state} title={`${s.label}: ${s.detail}`}>
          <i aria-hidden="true" />
          <span className="pf-tm-step__label">{s.label}</span>
          <span className="pf-tm-step__detail">{s.detail}</span>
        </li>
      ))}
    </ol>
  );
}

function Balance({ praise, constructive }: { praise: number; constructive: number }) {
  const total = praise + constructive;
  return (
    <div className="pf-tm-balance" role="img" aria-label={`${praise} praise and ${constructive} constructive in the last 60 days`}>
      <div className="pf-tm-balance__bar">
        {total ? (
          <>
            {praise > 0 && <i data-k="praise" style={{ flexGrow: praise }} />}
            {constructive > 0 && <i data-k="constructive" style={{ flexGrow: constructive }} />}
          </>
        ) : (
          <i data-k="none" />
        )}
      </div>
      <div className="pf-tm-balance__legend">
        <span title="Praise">
          <HandHeart aria-hidden="true" /> {praise}
        </span>
        <span title="Constructive">
          <Sprout aria-hidden="true" /> {constructive}
        </span>
      </div>
    </div>
  );
}

function MemberCard({
  m,
  index,
  onOpen,
  onGive,
  onMessage,
  onNudge,
  onSetup,
}: {
  m: Member;
  index: number;
  onOpen: (id: string) => void;
  onGive: (id: string) => void;
  onMessage: (id: string) => void;
  onNudge: (m: Member) => void;
  onSetup: (m: Member) => void;
}) {
  const flags = m.flags.slice(0, 3);
  const more = m.flags.length - flags.length;
  const attn = m.flags.some((f) => f.tone === 'danger') ? 'danger' : m.attention ? 'warning' : 'ok';
  const onCard = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea')) return;
    onOpen(m.id);
  };
  const oneOnOne =
    m.daysSince === null ? (m.series ? 'No 1:1 yet' : m.direct ? 'Not set up' : '—') : m.daysSince === 0 ? 'Today' : `${m.daysSince}d ago`;
  const next = m.series && m.series.nextAt > Date.now() - DAY ? `Next ${relativeTime(m.series.nextAt).replace(/^in /, 'in ')}` : m.direct ? '' : m.oneOnOneWith ? 'with their manager' : '';
  return (
    <article className="neo-card neo-spot pf-tm-card" data-attn={attn} style={{ '--i': index } as CSSProperties} onClick={onCard} data-qa="tm-card">
      <header className="pf-tm-card__head">
        <Avatar user={m.user} size={44} presence />
        <div className="pf-tm-card__who">
          <button type="button" className="pf-tm-card__name" onClick={() => onOpen(m.id)} aria-label={`Open ${m.user.name}’s details`}>
            {m.user.name}
          </button>
          <div className="pf-tm-card__title">
            {m.user.title}
            {m.level ? ` · ${m.level.split(' · ')[0]}` : ''}
          </div>
        </div>
        <div className="pf-tm-card__ring">
          {m.status ? (
            <>
              <OkrRing value={m.progress} status={m.status} size={50} />
              <StatusChip status={m.status} />
            </>
          ) : (
            <span className="pf-tm-noring" title="No objectives this period">
              <Target aria-hidden="true" />
              No OKRs
            </span>
          )}
        </div>
      </header>

      {flags.length ? (
        <ul className="pf-tm-flags" aria-label="Needs attention">
          {flags.map((f) => (
            <li key={f.id} className="pf-tm-flag" data-tone={f.tone}>
              {f.icon}
              {f.to ? (
                <Link to={f.to} className="pf-tm-flag__text">
                  {f.text}
                </Link>
              ) : (
                <span className="pf-tm-flag__text">{f.text}</span>
              )}
            </li>
          ))}
          {more > 0 && (
            <li className="pf-tm-flag pf-tm-flag--more">
              <button type="button" onClick={() => onOpen(m.id)}>
                +{more} more
              </button>
            </li>
          )}
        </ul>
      ) : (
        <div className="pf-tm-calm">
          <CircleCheck aria-hidden="true" /> All good — nothing needs you right now
        </div>
      )}

      <Track m={m} />

      <div className="pf-tm-signals">
        <div className="pf-tm-sig">
          <span className="neo-hud">{m.direct || !m.oneOnOneWith ? 'Last 1:1' : 'Last 1:1 (mgr)'}</span>
          <b className={cx(m.daysSince !== null && m.daysSince >= 21 && 'is-warn')}>{oneOnOne}</b>
          {next && <small>{next}</small>}
        </div>
        <div className="pf-tm-sig">
          <span className="neo-hud">Feedback · 60d</span>
          <Balance praise={m.praise} constructive={m.constructive} />
        </div>
      </div>

      <footer className="pf-tm-actions">
        {m.reviewAction &&
          (m.reviewAction.to ? (
            <Link to={m.reviewAction.to} className="neo-btn neo-btn--soft neo-btn--sm" data-qa="tm-review">
              <PenLine /> {m.reviewAction.label}
            </Link>
          ) : (
            <span className="pf-tm-locked" title={m.reviewAction.reason}>
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" disabled aria-label={`${m.reviewAction.label}: ${m.reviewAction.reason}`}>
                <Lock /> {m.reviewAction.label}
              </button>
            </span>
          ))}
        {m.series ? (
          <Link to={`/performance/one-on-ones/${m.series.id}`} className="neo-btn neo-btn--ghost neo-btn--sm">
            <MessagesSquare /> 1:1
          </Link>
        ) : m.direct ? (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => onSetup(m)}>
            <CalendarPlus /> Set up 1:1
          </button>
        ) : null}
        <span className="pf-spacer" />
        <button type="button" className="neo-iconbtn" aria-label={`Give ${m.first} feedback`} data-tip="Give feedback" onClick={() => onGive(m.id)} data-qa="tm-give-one">
          <MessageSquareHeart />
        </button>
        <button type="button" className="neo-iconbtn" aria-label={`Message ${m.first}`} data-tip="Message" onClick={() => onMessage(m.id)}>
          <MessageCircle />
        </button>
        <span title={m.nudge ? m.nudge.label : `${m.first} is all caught up`}>
          <button type="button" className="neo-iconbtn" aria-label={m.nudge ? m.nudge.label : `${m.first} is all caught up`} disabled={!m.nudge} onClick={() => onNudge(m)} data-qa="tm-nudge">
            <BellRing />
          </button>
        </span>
      </footer>
    </article>
  );
}

function FunnelCard({ members, cycle, now, onNudge }: { members: Member[]; cycle: Cycle | null; now: number; onNudge: () => void }) {
  if (!cycle) return null;
  const rs = members.filter((m) => m.review);
  const total = rs.length;
  const steps = [
    { key: 'self', label: 'Self-reflections in', done: rs.filter((m) => m.selfStatus === 'submitted') },
    { key: 'peer', label: 'Peer feedback complete', done: rs.filter((m) => m.peers.done >= 2 && m.peers.done >= m.peers.total && !m.peers.proposed) },
    { key: 'manager', label: 'Manager reviews written', done: rs.filter((m) => m.mgr === 'submitted') },
    { key: 'release', label: 'Shared with them', done: rs.filter((m) => m.release !== 'none') },
    { key: 'ack', label: 'Acknowledged', done: rs.filter((m) => m.release === 'acked') },
  ];
  const cur = currentPhaseKey(cycle, now);
  const phase = cur ? getPhase(cycle, cur) : undefined;
  const selfBehind = rs.filter((m) => m.nudge?.phase === 'self').length;
  return (
    <section className="neo-card pf-tm-funnel" aria-label="Review progress">
      <div className="pf-tm-aside__head">
        <span className="pf-section__icon" aria-hidden="true">
          <CalendarClock />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="neo-hud">{cycle.name}</div>
          <h2 className="pf-section__title">Review progress</h2>
        </div>
      </div>
      {cur && phase && (
        <div className="pf-tm-phase">
          <span className="pf-tm-phase__dot" aria-hidden="true" />
          <b>{PHASE[cur].label}</b>
          <span className="pf-faint">· {lcFirst(dueLabel(phase.end, now).text)}</span>
        </div>
      )}
      <ol className="pf-tm-funnel__steps">
        {steps.map((s, i) => {
          const pending = rs.filter((m) => !s.done.includes(m));
          const pct = total ? s.done.length / total : 0;
          return (
            <li key={s.key} className="pf-tm-funnel__row" style={{ '--w': `${Math.max(36, 100 - i * 12)}%` } as CSSProperties}>
              <div className="pf-tm-funnel__top">
                <span>{s.label}</span>
                <b className="neo-num">
                  {s.done.length}
                  <small>/{total}</small>
                </b>
              </div>
              <div className="pf-tm-funnel__bar">
                <Bar value={pct} label={`${s.label}: ${s.done.length} of ${total}`} />
              </div>
              {pending.length > 0 && pending.length < total + 1 && i < 3 && (
                <div className="pf-tm-funnel__pending">
                  <Avatars users={pending.map((m) => m.user)} size={20} max={5} />
                  <span className="pf-faint">waiting</span>
                  {s.key === 'self' && selfBehind > 0 && (
                    <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={onNudge}>
                      <BellRing /> Nudge {selfBehind}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OkrRollup({ ctx, members, snap, period, now }: { ctx: PerfCtx; members: Member[]; snap: Snap; period: Period; now: number }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const mine = snap.objectives
      .filter((o) => o.periodId === period.id && o.level !== 'individual' && (o.ownerId === ctx.me.id || o.coOwnerIds.includes(ctx.me.id)) && canViewObjective(ctx.v, ctx.users, o))
      .map((o) => rollup(snap, o, now));
    const seen = new Set(mine.map((r) => r.o.id));
    const theirs: ObjectiveRollup[] = [];
    for (const m of members) for (const r of m.rolls) if (!seen.has(r.o.id)) {
      seen.add(r.o.id);
      theirs.push(r);
    }
    const order = (a: ObjectiveRollup, b: ObjectiveRollup) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.progress - b.progress;
    return { mine: mine.sort(order), theirs: theirs.sort(order) };
  }, [snap, period, ctx, members, now]);
  const every = [...rows.mine, ...rows.theirs];
  if (!every.length) return null;
  const avg = every.reduce((s, r) => s + r.progress, 0) / every.length;
  const count = (s: KrStatus) => every.filter((r) => r.status === s).length;
  const overall = rollupStatus(every.map((r) => r.status));
  const limit = 6;
  const list = (items: ObjectiveRollup[], max: number) =>
    items.slice(0, max).map((r) => (
      <Link key={r.o.id} to={`/performance/okrs/${r.o.id}`} className="pf-tm-okr" title={r.o.title}>
        <OkrRing value={r.progress} status={r.status} size={34} />
        <span className="pf-tm-okr__text">
          <b>{r.o.title}</b>
          <small>
            {ctx.first(r.o.ownerId)} · {r.krs.length} KR{r.krs.length === 1 ? '' : 's'}
          </small>
        </span>
        <StatusChip status={r.status} />
      </Link>
    ));
  const mineShown = all ? rows.mine.length : Math.min(rows.mine.length, 3);
  const theirsShown = all ? rows.theirs.length : Math.max(0, limit - mineShown);
  return (
    <section className="neo-card pf-tm-okrs" aria-label="Team OKR roll-up">
      <div className="pf-tm-aside__head">
        <OkrRing value={avg} status={overall} size={52} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="neo-hud">{period.label} · team OKRs</div>
          <h2 className="pf-section__title">OKR roll-up</h2>
        </div>
        <Link to="/performance/okrs?view=team" className="neo-iconbtn" aria-label="Open team OKRs" data-tip="Open in OKRs">
          <ArrowRight />
        </Link>
      </div>
      <div className="pf-tm-okrs__legend">
        <span data-status="on-track">
          <i className="pf-dot" /> {count('on-track') + count('done')} on track
        </span>
        <span data-status="at-risk">
          <i className="pf-dot" /> {count('at-risk')} at risk
        </span>
        <span data-status="off-track">
          <i className="pf-dot" /> {count('off-track')} off track
        </span>
      </div>
      {rows.mine.length > 0 && (
        <div className="pf-tm-okrs__group">
          <span className="neo-hud">You own</span>
          {list(rows.mine, mineShown)}
        </div>
      )}
      {rows.theirs.length > 0 && theirsShown > 0 && (
        <div className="pf-tm-okrs__group">
          <span className="neo-hud">Your people</span>
          {list(rows.theirs, theirsShown)}
        </div>
      )}
      {every.length > mineShown + theirsShown && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setAll(true)}>
          Show all {every.length}
        </button>
      )}
      {all && every.length > limit && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setAll(false)}>
          Show fewer
        </button>
      )}
    </section>
  );
}

function PersonSheet({
  m,
  ctx,
  now,
  cycleName,
  onClose,
  onGive,
  onMessage,
  onNudge,
}: {
  m: Member | null;
  ctx: PerfCtx;
  now: number;
  cycleName?: string;
  onClose: () => void;
  onGive: (id: string) => void;
  onMessage: (id: string) => void;
  onNudge: (m: Member) => void;
}) {
  const [last, setLast] = useState<Member | null>(m);
  if (m && m !== last) setLast(m);
  const cur = m ?? last;
  if (!cur) return null;
  const s1 = cur.series;
  const openActions = s1 ? s1.actionItems.filter((a) => !a.done).slice(0, 3) : [];
  return (
    <Sheet
      open={!!m}
      onClose={onClose}
      width={520}
      className="neo-portal pf-tm-sheet"
      label={`${cur.user.name} — details`}
      header={
        <div className="sheet__head pf-tm-sheet__head">
          <Avatar user={cur.user} size={46} presence />
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="sheet__title truncate">{cur.user.name}</h2>
            <div className="text-xs pf-faint truncate">
              {cur.user.title}
              {cur.level ? ` · ${cur.level}` : ''}
            </div>
          </div>
          {cur.status && <OkrRing value={cur.progress} status={cur.status} size={44} />}
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label="Close details">
            <X />
          </button>
        </div>
      }
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => onGive(cur.id)}>
            <MessageSquareHeart /> Give feedback
          </button>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => onMessage(cur.id)}>
            <MessageCircle /> Message
          </button>
          <span className="pf-spacer" />
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" disabled={!cur.nudge} title={cur.nudge?.label ?? `${cur.first} is all caught up`} onClick={() => onNudge(cur)}>
            <BellRing /> Nudge
          </button>
        </>
      }
    >
      <div className="pf-tm-sheet__body">
        <section className="pf-tm-sec">
          <h3 className="neo-hud">Needs attention</h3>
          {cur.flags.length ? (
            <ul className="pf-tm-flags">
              {cur.flags.map((f) => (
                <li key={f.id} className="pf-tm-flag" data-tone={f.tone}>
                  {f.icon}
                  {f.to ? (
                    <Link to={f.to} className="pf-tm-flag__text">
                      {f.text}
                    </Link>
                  ) : (
                    <span className="pf-tm-flag__text">{f.text}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="pf-tm-calm">
              <CircleCheck aria-hidden="true" /> Nothing needs you right now
            </div>
          )}
        </section>

        {cur.review && (
          <section className="pf-tm-sec">
            <h3 className="neo-hud">{cycleName ?? 'Quarterly check-in'}</h3>
            <Track m={cur} large />
            <div className="pf-row pf-row--wrap">
              {cur.reviewAction?.to ? (
                <Link to={cur.reviewAction.to} className="neo-btn neo-btn--soft neo-btn--sm">
                  <PenLine /> {cur.reviewAction.label}
                </Link>
              ) : cur.reviewAction ? (
                <span className="pf-hint-row">
                  <Lock aria-hidden="true" style={{ width: 13, height: 13 }} /> {cur.reviewAction.reason}
                </span>
              ) : null}
              {cur.flags.find((f) => f.id === 'noms')?.to && (
                <Link to={cur.flags.find((f) => f.id === 'noms')!.to!} className="neo-btn neo-btn--ghost neo-btn--sm">
                  <UserCheck /> Approve peers
                </Link>
              )}
            </div>
          </section>
        )}

        <section className="pf-tm-sec">
          <h3 className="neo-hud">OKRs this quarter</h3>
          {cur.rolls.length ? (
            <div className="pf-tm-sheet__okrs">
              {cur.rolls.map((r) => (
                <div key={r.o.id} className="pf-tm-sheet__okr">
                  <Link to={`/performance/okrs/${r.o.id}`} className="pf-tm-okr">
                    <OkrRing value={r.progress} status={r.status} size={34} />
                    <span className="pf-tm-okr__text">
                      <b>{r.o.title}</b>
                      <small>{r.o.level === 'individual' ? 'Individual' : r.o.level === 'team' ? 'Team' : 'Company'} objective</small>
                    </span>
                    <StatusChip status={r.status} />
                  </Link>
                  <ul className="pf-tm-krs">
                    {r.krs.slice(0, 3).map((k) => (
                      <li key={k.id} data-status={r.statuses[k.id]}>
                        <i className="pf-dot" aria-hidden="true" />
                        <span className="grow truncate">{k.title}</span>
                        <span className="pf-tm-krs__val">
                          {formatValue(k, k.current)} / {formatValue(k, k.target)}
                        </span>
                        <span className="neo-sr">{STATUS_META[r.statuses[k.id]].label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="pf-tm-empty">No objectives yet this quarter.</p>
          )}
        </section>

        <section className="pf-tm-sec">
          <h3 className="neo-hud">1:1s</h3>
          {s1 ? (
            <div className="pf-tm-sheet__oo">
              <div className="pf-tm-kv">
                <span>Next</span>
                <b>{dayLabel(s1.nextAt, now)}</b>
                <span>Last</span>
                <b>{cur.daysSince === null ? 'Not held yet' : `${cur.daysSince} days ago`}</b>
                {cur.lastMood !== null && (
                  <>
                    <span>Mood</span>
                    <b>{cur.lastMood}/5 last time</b>
                  </>
                )}
              </div>
              {openActions.length > 0 && (
                <ul className="pf-tm-actionsList">
                  {openActions.map((a) => (
                    <li key={a.id} data-overdue={a.dueAt !== undefined && a.dueAt < now ? 'true' : undefined}>
                      <ListTodo aria-hidden="true" />
                      <span className="grow">{a.text}</span>
                      <small>
                        {ctx.first(a.ownerId)}
                        {a.dueAt ? ` · ${dueLabel(a.dueAt, now).text}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              <Link to={`/performance/one-on-ones/${s1.id}`} className="neo-btn neo-btn--ghost neo-btn--sm">
                <MessagesSquare /> Open 1:1
              </Link>
            </div>
          ) : (
            <p className="pf-tm-empty">{cur.direct ? 'No 1:1 set up yet.' : cur.daysSince !== null ? `Last 1:1 with their manager ${cur.daysSince} days ago.` : 'No 1:1 data you can see.'}</p>
          )}
        </section>

        <section className="pf-tm-sec">
          <div className="pf-row">
            <h3 className="neo-hud grow">Recent feedback</h3>
            {cur.direct && (
              <Link to="/performance/feedback?scope=team" className="pf-link text-xs">
                See all
              </Link>
            )}
          </div>
          {cur.recent.length ? (
            <ul className="pf-tm-fb">
              {cur.recent.slice(0, 4).map((f) => (
                <li key={f.id}>
                  <div className="pf-row">
                    <KindChip kind={f.kind} />
                    <span className="text-xs pf-faint grow truncate">
                      from {f.fromId === ctx.me.id ? 'you' : ctx.name(f.fromId)} · {relativeTime(f.at, now)}
                    </span>
                  </div>
                  <p className="pf-clamp-2">{f.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pf-tm-empty">No feedback you can see yet.</p>
          )}
        </section>

        <section className="pf-tm-sec">
          <div className="pf-row">
            <h3 className="neo-hud grow">Your private notes · {cur.notes.length}</h3>
            <Link to={`/performance/feedback?tab=notes&who=${cur.id}`} className="pf-link text-xs">
              Open journal
            </Link>
          </div>
          {cur.notes[0] ? (
            <p className="pf-tm-note">
              <NotebookPen aria-hidden="true" />
              <span>
                <span className="pf-clamp-2">{cur.notes[0].body}</span>
                <small className="pf-faint">{relativeTime(cur.notes[0].at, now)} · only you can see this</small>
              </span>
            </p>
          ) : (
            <p className="pf-tm-empty">No notes yet — capture coaching moments as they happen.</p>
          )}
        </section>

        {cur.goals.length > 0 && (
          <section className="pf-tm-sec">
            <div className="pf-row">
              <h3 className="neo-hud grow">Growth goals</h3>
              <Link to="/performance/growth" className="pf-link text-xs">
                Growth
              </Link>
            </div>
            <ul className="pf-tm-goals">
              {cur.goals.map((g) => {
                const done = g.actions.filter((a) => a.done).length;
                return (
                  <li key={g.id}>
                    <span className="grow truncate">{g.title}</span>
                    <span className="pf-faint text-xs">
                      {done}/{g.actions.length}
                    </span>
                    <Bar value={g.actions.length ? done / g.actions.length : 0} label={`${g.title}: ${done} of ${g.actions.length} actions`} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
