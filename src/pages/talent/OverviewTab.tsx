/**
 * Talent Hub command deck: KPIs, the hiring "flight path" (every step of the
 * process at a glance), personal next steps, copilot insights, requisition
 * radar, upcoming interviews, funnel, source mix and live activity.
 * Everything is permission-scoped through `useTalentScope`.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Gavel,
  Hourglass,
  Lightbulb,
  PartyPopper,
  Radar,
  Reply,
  Rocket,
  Send,
  Signature,
  Sparkles,
  StickyNote,
  Trophy,
  UserPlus,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityKind, StageId } from '@/talent/types';
import { INTERVIEW_KIND_META, SOURCE_META, STAGES, STAGE_BY_ID, STAGE_PHASES } from '@/talent/constants';
import { scoreMatch } from '@/talent/ai/engine';
import { daysUntilStart } from '@/talent/onboarding';
import { useTalent } from '@/talent/store';
import { useTalentUI } from '@/talent/ui';
import {
  useMyTalentTasks,
  useTalentCaps,
  useTalentData,
  useTalentLookups,
  useTalentScope,
  useTalentStats,
  type TalentStats,
  type TalentTask,
  type TalentTaskKind,
} from '@/talent/selectors';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { firstName, greeting, relativeTime } from '@/lib/format';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Funnel } from './components/Funnel';
import { CandidateAvatar, PeopleStack, PriorityBadge, ReqStatusBadge, SampleTag } from './components/shared';
import { fmtRelativeDay, slaState } from './components/format';
import { runTalentTask } from './components/actionRunner';

const DAY = 86_400_000;

// ───────────────────────── KPIs ─────────────────────────
function Kpi({ icon: Icon, label, value, unit, hint, to, hot, hue }: { icon: LucideIcon; label: string; value: ReactNode; unit?: string; hint: string; to?: string; hot?: boolean; hue: number }) {
  const navigate = useNavigate();
  return (
    <button type="button" className={cx('tl-ov-kpi', hot && 'is-hot')} style={{ '--k-h': hue } as CSSProperties} onClick={() => to && navigate(to)} disabled={!to}>
      <span className="tl-ov-kpi__top">
        <span className="tl-ov-kpi__icon">
          <Icon aria-hidden="true" />
        </span>
        <span className="tl-ov-kpi__label">{label}</span>
      </span>
      <span className="tl-ov-kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      <span className="tl-ov-kpi__hint">{hint}</span>
    </button>
  );
}

function KpiStrip({ stats }: { stats: TalentStats }) {
  const caps = useTalentCaps();
  const offersVisible = caps.manage || caps.approveOffers || caps.hire;
  return (
    <div className="tl-ov-kpis">
      <Kpi icon={Briefcase} hue={38} label="Open roles" value={stats.openReqs} hint={`${stats.openSeats} seat${stats.openSeats === 1 ? '' : 's'} to fill`} to="/talent/requisitions" />
      <Kpi icon={Users} hue={214} label="In pipeline" value={stats.activeCandidates} hint={stats.avgMatch !== null ? `Avg match ${stats.avgMatch}%` : 'Active candidates'} to="/talent/pipeline" />
      <Kpi icon={CalendarClock} hue={272} label="Interviews" value={stats.interviewsThisWeek} hint="Next 7 days" to="/talent/interviews" />
      <Kpi icon={Signature} hue={20} label="Offers out" value={stats.offersOut} hint="Approval or signature" to={offersVisible ? '/talent/offers' : undefined} />
      <Kpi
        icon={Trophy}
        hue={152}
        label="Hires · 90d"
        value={stats.hires90d}
        hint={stats.avgDaysToHire !== null ? `${stats.avgDaysToHire} days avg to hire` : 'Welcome aboard'}
        to="/talent/pipeline"
      />
      <Kpi icon={Hourglass} hue={350} label="Past SLA" value={stats.staleCount} hint={stats.staleCount ? 'Waiting too long' : 'Everyone is moving'} hot={stats.staleCount > 0} to="/talent/pipeline" />
    </div>
  );
}

// ───────────────────────── flight path ─────────────────────────
function FlightPath({ stats, stale }: { stats: TalentStats; stale: Map<StageId, number> }) {
  const navigate = useNavigate();
  const byStage = new Map(stats.funnel.map((f) => [f.stage, f]));
  return (
    <section className="card tl-ov-flight" aria-label="Hiring flight path">
      <div className="tl-ov-flight__scan" aria-hidden="true" />
      <header className="tl-ov-flight__head">
        <div>
          <div className="eyebrow">Hiring flight path</div>
          <h2 className="section-title">
            <Workflow aria-hidden="true" /> Every candidate, every step
          </h2>
        </div>
        <p className="text-sm muted tl-ov-flight__lede">
          Each stage has exit criteria, so nobody skips a step: outreach → interest &amp; consent → screen → scorecards → decision → approved offer → onboarding.
        </p>
      </header>
      <div className="tl-ov-flight__track">
        {STAGE_PHASES.map((phase, pi) => (
          <div key={phase} className="tl-ov-phase" style={{ '--pi': pi } as CSSProperties}>
            <div className="tl-ov-phase__label">
              <span>{String(pi + 1).padStart(2, '0')}</span> {phase}
            </div>
            <div className="tl-ov-phase__nodes">
              {STAGES.filter((s) => s.phase === phase).map((s) => {
                const f = byStage.get(s.id);
                const n = f?.current ?? 0;
                const late = stale.get(s.id) ?? 0;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={cx('tl-ov-node', n > 0 && 'has-items', late > 0 && 'is-late')}
                    style={{ '--stage-h': s.hue } as CSSProperties}
                    onClick={() => navigate(`/talent/pipeline?stage=${s.id}`)}
                    title={s.description}
                  >
                    <span className="tl-ov-node__orb">
                      <Icon aria-hidden="true" />
                      <span className="tl-ov-node__count">{n}</span>
                    </span>
                    <span className="tl-ov-node__label">{s.label}</span>
                    <span className="tl-ov-node__meta">
                      {f?.reached ?? 0} reached
                      {late > 0 && <span className="tl-ov-node__late"> · {late} late</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────── next steps ─────────────────────────
const TASK_META: Record<TalentTaskKind, { icon: LucideIcon; label: string; hue: number }> = {
  scorecard: { icon: ClipboardCheck, label: 'Scorecard', hue: 296 },
  interview: { icon: CalendarClock, label: 'Interview', hue: 262 },
  decision: { icon: Gavel, label: 'Decision', hue: 326 },
  'offer-approval': { icon: Signature, label: 'Approval', hue: 32 },
  'req-approval': { icon: BadgeCheck, label: 'Headcount', hue: 45 },
  'send-offer': { icon: Send, label: 'Send offer', hue: 16 },
  'follow-up': { icon: Reply, label: 'Follow-up', hue: 210 },
  onboarding: { icon: Rocket, label: 'Onboarding', hue: 152 },
};

function whenLabel(t: TalentTask, now: number) {
  if (t.at > now) return fmtRelativeDay(t.at, now);
  return t.kind === 'scorecard' || t.kind === 'onboarding' || t.kind === 'follow-up' ? `due ${relativeTime(t.at, now)}` : relativeTime(t.at, now);
}

function NextSteps({ tasks }: { tasks: TalentTask[] }) {
  const navigate = useNavigate();
  const me = useSessionUser();
  const now = useNow(60_000);
  const urgent = tasks.filter((t) => t.urgent).length;
  return (
    <section className="card tl-ov-panel tl-ov-tasks">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <CircleCheck aria-hidden="true" /> Your next steps <span className="count">{tasks.length}</span>
          </h2>
          <p className="text-sm muted">
            {greeting()}
            {me ? `, ${firstName(me.name)}` : ''}.{' '}
            {tasks.length === 0 ? 'Nothing is waiting on you.' : urgent ? `${urgent} item${urgent === 1 ? ' needs' : 's need'} you today.` : 'Nothing urgent, nice work.'}
          </p>
        </div>
      </header>
      {tasks.length === 0 ? (
        <EmptyState icon={<PartyPopper />} title="You’re all caught up">
          Scorecards, decisions, approvals and follow-ups show up here the moment they need you.
        </EmptyState>
      ) : (
        <ul className="tl-ov-tasklist">
          {tasks.slice(0, 7).map((t, i) => {
            const m = TASK_META[t.kind];
            const Icon = m.icon;
            return (
              <li key={t.id} style={{ '--i': i } as CSSProperties}>
                <button type="button" className={cx('tl-ov-task', t.urgent && 'is-urgent')} style={{ '--t-h': m.hue } as CSSProperties} onClick={() => runTalentTask(t, navigate)}>
                  <span className="tl-ov-task__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="tl-ov-task__body">
                    <span className="tl-ov-task__title">
                      <span className="tl-ov-task__kind">{m.label}</span>
                      <span className="truncate">{t.title}</span>
                    </span>
                    <span className="tl-ov-task__detail truncate">{t.detail}</span>
                  </span>
                  <span className="tl-ov-task__when">{whenLabel(t, now)}</span>
                  <ChevronRight className="tl-ov-task__chev" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length > 7 && <p className="text-xs faint tl-ov-more">+{tasks.length - 7} more across the tabs above</p>}
    </section>
  );
}

// ───────────────────────── copilot insights ─────────────────────────
interface Insight {
  id: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: { label: string; to?: string; candidateId?: string };
  weight: number;
}

function useInsights(): Insight[] {
  const scope = useTalentScope();
  const data = useTalentData();
  const caps = useTalentCaps();
  const now = useNow(60_000);
  return useMemo(() => {
    const out: Insight[] = [];
    const candName = (id: string) => data.candidates.find((c) => c.id === id)?.name ?? 'a candidate';

    // 1 · momentum: who is stuck past the stage SLA
    const staleBy = new Map<StageId, number>();
    for (const a of scope.applications) if (a.status === 'active' && slaState(a, now) === 'stale') staleBy.set(a.stage, (staleBy.get(a.stage) ?? 0) + 1);
    const worst = [...staleBy.entries()].sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      const m = STAGE_BY_ID[worst[0]];
      out.push({
        id: 'stale',
        tone: 'warning',
        icon: Hourglass,
        title: `${worst[1]} candidate${worst[1] === 1 ? '' : 's'} waiting too long in ${m.label}`,
        detail: `The target is ${m.slaDays} days. Fast processes win the best candidates.`,
        action: { label: 'Review pipeline', to: `/talent/pipeline?stage=${worst[0]}` },
        weight: 80,
      });
    }

    // 2 · offers stuck in approval
    if (caps.manage || caps.approveOffers || caps.hire)
      for (const o of data.offers)
        if (scope.reqIds.has(o.requisitionId) && o.status === 'pending-approval' && now - o.createdAt > DAY) {
          const d = Math.floor((now - o.createdAt) / DAY);
          out.push({
            id: `offer-${o.id}`,
            tone: 'danger',
            icon: Signature,
            title: `${candName(o.candidateId)}’s offer has waited ${d} day${d === 1 ? '' : 's'} for approval`,
            detail: 'Every day an offer waits raises the risk of a counter-offer.',
            action: { label: 'Open offers', to: '/talent/offers' },
            weight: 85,
          });
        }

    // 3 · thin pipelines on open roles
    for (const r of scope.requisitions) {
      if (r.status !== 'open' || r.headcount - r.hires <= 0) continue;
      const active = scope.applications.filter((a) => a.requisitionId === r.id && a.status === 'active').length;
      if (active >= 3) continue;
      out.push({
        id: `thin-${r.id}`,
        tone: 'info',
        icon: Radar,
        title: `${r.title} has only ${active} active candidate${active === 1 ? '' : 's'}`,
        detail: 'Drop the JD into AI Sourcing to rediscover your pool and generate LinkedIn searches.',
        action: caps.source ? { label: 'Source with AI', to: `/talent/sourcing?req=${r.id}` } : { label: 'Open requisition', to: `/talent/requisitions/${r.id}` },
        weight: 60 + (r.priority === 'critical' ? 20 : r.priority === 'high' ? 10 : 0),
      });
    }

    // 4 · job descriptions that will shrink the applicant pool
    for (const r of scope.requisitions) {
      const q = r.jd.profile?.quality;
      if (!q || q.score >= 65 || !['open', 'pending-approval', 'draft'].includes(r.status)) continue;
      const warn = q.flags.filter((f) => f.severity === 'warning');
      out.push({
        id: `jd-${r.id}`,
        tone: 'warning',
        icon: Lightbulb,
        title: `${r.title}: JD health ${q.score}/100`,
        detail: warn[0] ? `${warn.length} fix${warn.length === 1 ? '' : 'es'} suggested, e.g. ${warn[0].message.replace(/\.$/, '')}.` : 'A clearer JD attracts more and better applicants.',
        action: { label: 'Review JD', to: `/talent/requisitions/${r.id}` },
        weight: 55,
      });
    }

    // 5 · rediscover silver medalists for open roles
    if (caps.manage || caps.source) {
      const busy = new Set(data.applications.filter((a) => a.status === 'active').map((a) => a.candidateId));
      const silver = scope.candidates.filter((c) => c.status === 'active' && !busy.has(c.id) && (c.source === 'silver-medalist' || c.tags.includes('silver-medalist')));
      let best: { id: string; name: string; title: string; score: number } | null = null;
      for (const r of scope.requisitions) {
        if (r.status !== 'open' || !r.jd.profile) continue;
        for (const c of silver) {
          const m = scoreMatch(r.jd.profile, c, { location: r.location, workModel: r.workModel });
          if (!best || m.score > best.score) best = { id: c.id, name: c.name, title: r.title, score: m.score };
        }
      }
      if (best && best.score >= 55)
        out.push({
          id: 'rediscover',
          tone: 'success',
          icon: Sparkles,
          title: `Rediscover ${best.name} for ${best.title}`,
          detail: `Silver medalist · ${best.score}% match. Warm candidates convert up to 3× faster.`,
          action: { label: 'View profile', candidateId: best.id },
          weight: 70,
        });
    }

    // 6 · new hires starting soon without an account
    if (caps.onboarding)
      for (const j of data.onboarding) {
        const d = daysUntilStart(j, now);
        if (j.hubUserId || d < 0 || d > 14) continue;
        out.push({
          id: `acct-${j.id}`,
          tone: 'warning',
          icon: Rocket,
          title: `${j.name} starts in ${d} day${d === 1 ? '' : 's'} without a NEXUS account`,
          detail: 'Provision it now so day one starts with access, not tickets.',
          action: { label: 'Open journey', to: `/hr/onboarding/${j.id}` },
          weight: 75,
        });
      }

    return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [scope, data, caps, now]);
}

function Insights() {
  const insights = useInsights();
  const navigate = useNavigate();
  return (
    <section className="card tl-ov-panel tl-ov-insights">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <Sparkles aria-hidden="true" /> Copilot insights
          </h2>
          <p className="text-sm muted">Patterns spotted across your requisitions, pool and pipeline.</p>
        </div>
      </header>
      {insights.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title="All systems nominal">
          No bottlenecks detected. Insights appear when something needs attention.
        </EmptyState>
      ) : (
        <ul className="tl-ov-insight-list">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            return (
              <li key={ins.id} className={cx('tl-ov-insight', `tl-ov-insight--${ins.tone}`)} style={{ '--i': i } as CSSProperties}>
                <span className="tl-ov-insight__icon">
                  <Icon aria-hidden="true" />
                </span>
                <div className="grow">
                  <div className="tl-ov-insight__title">{ins.title}</div>
                  <div className="tl-ov-insight__detail">{ins.detail}</div>
                </div>
                {ins.action && (
                  <button
                    type="button"
                    className="btn btn--sm tl-ov-insight__cta"
                    onClick={() => {
                      const a = ins.action!;
                      if (a.candidateId) useTalentUI.getState().openCandidate(a.candidateId);
                      else if (a.to) navigate(a.to);
                    }}
                  >
                    {ins.action.label}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── requisition radar ─────────────────────────
const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 } as const;

function ReqRadar() {
  const scope = useTalentScope();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const rows = useMemo(
    () =>
      scope.requisitions
        .filter((r) => r.status === 'open' || r.status === 'pending-approval' || r.status === 'on-hold')
        .map((r) => {
          const apps = scope.applications.filter((a) => a.requisitionId === r.id && a.status === 'active');
          const phase = { Acquire: 0, Assess: 0, Decide: 0 };
          for (const a of apps) {
            const p = STAGE_BY_ID[a.stage].phase;
            if (p !== 'Onboard') phase[p] += 1;
          }
          return {
            r,
            active: apps.length,
            phase,
            stale: apps.filter((a) => slaState(a, now) === 'stale').length,
            days: Math.max(0, Math.floor((now - (r.openedAt ?? r.createdAt)) / DAY)),
            best: apps.reduce((m, a) => Math.max(m, a.match?.score ?? 0), 0),
          };
        })
        .sort((a, b) => PRIORITY_RANK[a.r.priority] - PRIORITY_RANK[b.r.priority] || b.stale - a.stale || b.days - a.days),
    [scope, now],
  );

  return (
    <section className="card tl-ov-panel tl-ov-radar">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <Radar aria-hidden="true" /> Requisition radar <span className="count">{rows.length}</span>
          </h2>
          <p className="text-sm muted">Where each role stands across Acquire, Assess and Decide.</p>
        </div>
        <Link to="/talent/requisitions" className="btn btn--sm btn--ghost">
          All roles <ArrowRight aria-hidden="true" />
        </Link>
      </header>
      {rows.length === 0 ? (
        <EmptyState icon={<Briefcase />} title="No active requisitions">
          Open a requisition to start building a pipeline.
        </EmptyState>
      ) : (
        <ul className="tl-ov-reqs">
          {rows.slice(0, 6).map(({ r, active, phase, stale, days, best }) => {
            const total = Math.max(1, phase.Acquire + phase.Assess + phase.Decide);
            return (
              <li key={r.id}>
                <button type="button" className="tl-ov-req" onClick={() => navigate(`/talent/requisitions/${r.id}`)}>
                  <span className={cx('tl-ov-req__pri', `is-${r.priority}`)} aria-hidden="true" />
                  <span className="tl-ov-req__main">
                    <span className="tl-ov-req__title">
                      <span className="truncate">{r.title}</span>
                      {r.status !== 'open' ? <ReqStatusBadge status={r.status} /> : r.priority === 'critical' || r.priority === 'high' ? <PriorityBadge priority={r.priority} /> : null}
                    </span>
                    <span className="tl-ov-req__meta truncate">
                      {r.department} · {r.location} · {active} active{best ? ` · best ${best}%` : ''}
                    </span>
                  </span>
                  <span className="tl-ov-req__bar" title={`Acquire ${phase.Acquire} · Assess ${phase.Assess} · Decide ${phase.Decide}`}>
                    {(['Acquire', 'Assess', 'Decide'] as const).map((p) => (
                      <i key={p} className={`is-${p.toLowerCase()}`} style={{ flexGrow: phase[p] / total || 0.0001 }} />
                    ))}
                  </span>
                  <span className="tl-ov-req__stat">
                    <b>
                      {r.hires}/{r.headcount}
                    </b>
                    <small>hired</small>
                  </span>
                  <span className={cx('tl-ov-req__stat', stale > 0 && 'is-warn')}>
                    <b>{days}d</b>
                    <small>{stale > 0 ? `${stale} late` : 'open'}</small>
                  </span>
                  <ChevronRight className="tl-ov-req__chev" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── upcoming interviews ─────────────────────────
function UpcomingInterviews() {
  const interviews = useTalent((s) => s.interviews);
  const scope = useTalentScope();
  const me = useSessionUser();
  const { candById, reqById } = useTalentLookups();
  const now = useNow(60_000);
  const list = useMemo(
    () =>
      interviews
        .filter((i) => i.status === 'scheduled' && i.scheduledAt + i.durationMins * 60_000 > now && (scope.reqIds.has(i.requisitionId) || (!!me && i.interviewerIds.includes(me.id))))
        .sort((a, b) => a.scheduledAt - b.scheduledAt)
        .slice(0, 5),
    [interviews, scope, me, now],
  );
  return (
    <section className="card tl-ov-panel tl-ov-upcoming">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <CalendarClock aria-hidden="true" /> Upcoming interviews
          </h2>
          <p className="text-sm muted">Structured loops, scored per competency.</p>
        </div>
        <Link to="/talent/interviews" className="btn btn--sm btn--ghost">
          Agenda <ArrowRight aria-hidden="true" />
        </Link>
      </header>
      {list.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title="Nothing scheduled">
          Interviews you schedule appear here.
        </EmptyState>
      ) : (
        <ul className="tl-ov-ivs">
          {list.map((iv) => {
            const c = candById.get(iv.candidateId);
            const r = reqById.get(iv.requisitionId);
            const k = INTERVIEW_KIND_META[iv.kind];
            const Icon = k.icon;
            const mine = !!me && iv.interviewerIds.includes(me.id);
            const live = iv.scheduledAt <= now;
            return (
              <li key={iv.id}>
                <button type="button" className={cx('tl-ov-iv', live && 'is-live')} onClick={() => c && useTalentUI.getState().openCandidate(c.id)}>
                  <span className="tl-ov-iv__time">
                    {live ? (
                      <>
                        <span className="dot dot--pulse dot--meeting" /> Now
                      </>
                    ) : (
                      fmtRelativeDay(iv.scheduledAt, now)
                    )}
                  </span>
                  <span className="tl-ov-iv__kind" title={k.label}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="tl-ov-iv__main">
                    <span className="tl-ov-iv__who truncate">
                      {c?.name ?? 'Candidate'}
                      {c?.sample && <SampleTag />}
                    </span>
                    <span className="tl-ov-iv__what truncate">
                      {iv.title} · {r?.title ?? 'Requisition'} · {iv.durationMins}m
                    </span>
                  </span>
                  {mine && <span className="badge badge--info tl-ov-iv__mine">You</span>}
                  <PeopleStack userIds={iv.interviewerIds} max={3} size={22} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── funnel & sources ─────────────────────────
function FunnelPanel({ stats }: { stats: TalentStats }) {
  const navigate = useNavigate();
  return (
    <section className="card tl-ov-panel">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <Activity aria-hidden="true" /> Hiring funnel
          </h2>
          <p className="text-sm muted">Reached each stage · conversion from the previous one.</p>
        </div>
      </header>
      <Funnel steps={stats.funnel} compact onSelect={(stage) => navigate(`/talent/pipeline?stage=${stage}`)} />
    </section>
  );
}

function SourceMix({ stats }: { stats: TalentStats }) {
  const max = Math.max(1, ...stats.sourceMix.map((s) => s.candidates));
  return (
    <section className="card tl-ov-panel">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <UserPlus aria-hidden="true" /> Source of hire
          </h2>
          <p className="text-sm muted">Where candidates come from, and who converts.</p>
        </div>
      </header>
      {stats.sourceMix.length === 0 ? (
        <p className="text-sm faint">No candidates yet.</p>
      ) : (
        <ul className="tl-ov-sources">
          {stats.sourceMix.map((s, i) => {
            const m = SOURCE_META[s.source];
            const Icon = m.icon;
            return (
              <li key={s.source} className="tl-ov-source" style={{ '--src-h': m.hue, '--w': `${Math.max(6, (s.candidates / max) * 100)}%`, '--i': i } as CSSProperties}>
                <span className="tl-ov-source__label">
                  <Icon aria-hidden="true" /> {m.label}
                </span>
                <span className="tl-ov-source__bar">
                  <i />
                </span>
                <span className="tl-ov-source__num">
                  {s.candidates}
                  {s.hires > 0 && (
                    <small title={`${s.hires} hired`}>
                      <Trophy aria-hidden="true" />
                      {s.hires}
                    </small>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── activity ─────────────────────────
const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  created: UserPlus,
  import: UserPlus,
  stage: ArrowRight,
  outreach: Send,
  reply: Reply,
  interview: CalendarClock,
  scorecard: ClipboardCheck,
  decision: Gavel,
  offer: Signature,
  hired: PartyPopper,
  rejected: CircleX,
  note: StickyNote,
  handoff: Rocket,
  requisition: Briefcase,
};

function ActivityFeed() {
  const activity = useTalent((s) => s.activity);
  const scope = useTalentScope();
  const { userById, candById } = useTalentLookups();
  const now = useNow(60_000);
  const items = useMemo(() => {
    const cands = new Set(scope.candidates.map((c) => c.id));
    return activity
      .filter((a) => (a.requisitionId && scope.reqIds.has(a.requisitionId)) || (a.candidateId && cands.has(a.candidateId)))
      .sort((a, b) => b.at - a.at)
      .slice(0, 8);
  }, [activity, scope]);
  return (
    <section className="card tl-ov-panel tl-ov-activity">
      <header className="tl-ov-panel__head">
        <div className="grow">
          <h2 className="section-title">
            <Activity aria-hidden="true" /> Live activity
          </h2>
          <p className="text-sm muted">Every action is audited and shared with the hiring team.</p>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="text-sm faint">No activity yet.</p>
      ) : (
        <ol className="tl-ov-feed">
          {items.map((a) => {
            const Icon = ACTIVITY_ICON[a.kind] ?? Activity;
            const actor = userById.get(a.actorId);
            const cand = a.candidateId ? candById.get(a.candidateId) : undefined;
            return (
              <li key={a.id} className={cx('tl-ov-feed__item', `is-${a.kind}`)}>
                <span className="tl-ov-feed__icon">
                  <Icon aria-hidden="true" />
                </span>
                <div className="grow">
                  <div className="tl-ov-feed__text">{a.text}</div>
                  <div className="tl-ov-feed__meta">
                    {actor ? (
                      <>
                        <Avatar user={actor} size={16} /> {actor.name.split(' ')[0]}
                      </>
                    ) : (
                      'System'
                    )}{' '}
                    · {relativeTime(a.at, now)}
                    {cand && (
                      <>
                        {' · '}
                        <button type="button" className="tl-ov-feed__cand" onClick={() => useTalentUI.getState().openCandidate(cand.id)}>
                          <CandidateAvatar person={cand} size={16} /> {cand.name}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ───────────────────────── page ─────────────────────────
export function OverviewTab() {
  const stats = useTalentStats();
  const tasks = useMyTalentTasks();
  const scope = useTalentScope();
  const now = useNow(60_000);
  const stale = useMemo(() => {
    const m = new Map<StageId, number>();
    for (const a of scope.applications) if (a.status === 'active' && slaState(a, now) === 'stale') m.set(a.stage, (m.get(a.stage) ?? 0) + 1);
    return m;
  }, [scope, now]);

  return (
    <div className="tl-ov">
      <KpiStrip stats={stats} />
      <FlightPath stats={stats} stale={stale} />
      <div className="tl-ov__grid">
        <div className="tl-ov__col tl-ov__col--main">
          <NextSteps tasks={tasks} />
          <ReqRadar />
          <div className="tl-ov__pair">
            <FunnelPanel stats={stats} />
            <SourceMix stats={stats} />
          </div>
        </div>
        <div className="tl-ov__col tl-ov__col--side">
          <Insights />
          <UpcomingInterviews />
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
