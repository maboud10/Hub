/**
 * Talent Hub command deck (/talent) — the Support-Deck anatomy for hiring:
 * attention banners for the decisions and approvals waiting on you, a HUD
 * ribbon with the funnel numbers, the Nova console (hands a JD or a one-line
 * role brief to AI Sourcing — or, for hiring managers, to a new requisition),
 * next steps, copilot insights, the hiring flight path (every step of the
 * process at a glance), requisition radar, funnel and source mix — plus
 * interviews, offers in flight, SLA watch, live activity and system status in
 * the side column.
 * Everything is permission-scoped through `useTalentScope`.
 */
import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Briefcase,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Cloud,
  Database,
  FilePlus2,
  FileSearch,
  Gavel,
  Hourglass,
  Lightbulb,
  Linkedin,
  ListChecks,
  PartyPopper,
  Radar,
  Recycle,
  Reply,
  Rocket,
  Send,
  Signature,
  Sparkles,
  StickyNote,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Chip, NeoBanner, NeoBanners, NeoEmpty, NeoHome, NeoKpi, NeoKpis, NeoNovaPrompt, NeoPanel, Orb, type Tone as NeoTone } from '@/components/neo';
import type { ActivityKind, StageId } from '@/talent/types';
import { INTERVIEW_KIND_META, SOURCE_META, STAGES, STAGE_BY_ID, STAGE_PHASES } from '@/talent/constants';
import { aiStatus, scoreMatch } from '@/talent/ai/engine';
import { backendStatus } from '@/talent/backend';
import { getLinkedInConnector } from '@/talent/linkedin/connector';
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
import { relativeTime } from '@/lib/format';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Funnel } from './components/Funnel';
import { CandidateAvatar, PeopleStack, PriorityBadge, ReqStatusBadge, SampleTag } from './components/shared';
import { fmtRelativeDay, slaState } from './components/format';
import { runTalentTask } from './components/actionRunner';
import { studio, useStudio } from './sourcing/store';
import { OfferTracker } from './trackers';

const DAY = 86_400_000;
const s = (n: number) => (n === 1 ? '' : 's');
const openCandidate = (id: string) => useTalentUI.getState().openCandidate(id);

// ───────────────────────── attention banners ─────────────────────────
/** Decisions and approvals that block someone else until you act. */
const BANNERS: { kind: TalentTaskKind; tone: NeoTone; icon: LucideIcon; many: (n: number) => string; body: string }[] = [
  { kind: 'offer-approval', tone: 'warning', icon: Signature, many: (n) => `${n} offers await your approval`, body: 'Every day an offer waits raises the risk of a counter-offer.' },
  { kind: 'decision', tone: 'rose', icon: Gavel, many: (n) => `${n} hiring decisions are waiting on you`, body: 'The debriefs are in — make the call while the loop is fresh.' },
  { kind: 'send-offer', tone: 'cyan', icon: Send, many: (n) => `${n} approved offers are ready to send`, body: 'All approvals are in — send them while the momentum is there.' },
  { kind: 'req-approval', tone: 'amber', icon: BadgeCheck, many: (n) => `${n} headcount requests need your approval`, body: 'Approve or send back so recruiting can start.' },
];

function DeckBanners({ tasks }: { tasks: TalentTask[] }) {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const rows = BANNERS.map((b) => ({ b, list: tasks.filter((t) => t.kind === b.kind) })).filter((r) => r.list.length > 0);
  if (!rows.length) return null;
  return (
    <NeoBanners>
      {rows.slice(0, 3).map(({ b, list }) => {
        const Icon = b.icon;
        const first = list[0];
        const oldest = Math.min(...list.map((t) => t.at));
        const waited = oldest < now ? `waiting ${relativeTime(oldest, now).replace(/ ago$/, '')}` : fmtRelativeDay(oldest, now);
        return list.length === 1 ? (
          <NeoBanner key={b.kind} tone={b.tone} icon={<Icon />} title={first.title} meta={waited} onClick={() => runTalentTask(first, navigate)}>
            {first.detail}
          </NeoBanner>
        ) : (
          <NeoBanner key={b.kind} tone={b.tone} icon={<Icon />} title={b.many(list.length)} meta={waited} onClick={() => navigate(first.link)}>
            {b.body}
          </NeoBanner>
        );
      })}
    </NeoBanners>
  );
}

// ───────────────────────── HUD ribbon ─────────────────────────
function DeckKpis({ stats }: { stats: TalentStats }) {
  const caps = useTalentCaps();
  const offersVisible = caps.manage || caps.approveOffers || caps.hire;
  return (
    <NeoKpis label="Hiring at a glance">
      <NeoKpi icon={<Briefcase />} label="Open roles" value={stats.openReqs} sub={`${stats.openSeats} seat${s(stats.openSeats)} to fill`} to="/talent/requisitions" />
      <NeoKpi icon={<Users />} label="In pipeline" value={stats.activeCandidates} sub={stats.avgMatch !== null ? `Avg match ${stats.avgMatch}%` : 'Active candidates'} to="/talent/pipeline" />
      <NeoKpi icon={<CalendarClock />} label="Interviews" value={stats.interviewsThisWeek} sub="Next 7 days" to="/talent/interviews" />
      <NeoKpi icon={<Signature />} label="Offers out" value={stats.offersOut} sub="Approval or signature" to={offersVisible ? '/talent/offers' : undefined} />
      <NeoKpi icon={<Trophy />} label="Hires · 90d" value={stats.hires90d} sub={stats.avgDaysToHire !== null ? `${stats.avgDaysToHire} days avg to hire` : 'Welcome aboard'} />
      <NeoKpi
        icon={<Hourglass />}
        label="Past SLA"
        value={stats.staleCount}
        sub={stats.staleCount ? 'Waiting too long' : 'Everyone is moving'}
        tone={stats.staleCount > 0 ? 'danger' : undefined}
        to="/talent/pipeline"
      />
    </NeoKpis>
  );
}

// ───────────────────────── Nova console ─────────────────────────
const EXAMPLE_ROLES = ['Senior React engineer · fintech · Dubai hybrid', 'Data scientist, demand forecasting, Python', 'Head of Talent Acquisition for a scale-up', 'Flutter mobile engineer, remote GCC'];
const EXAMPLE_REQS = ['Backend engineer for payments · Go · Dubai hybrid', 'Product designer, growth squad, 5+ years', 'Customer success lead, Arabic + English'];

/** Recruiters: paste a JD or describe the role → AI Sourcing decodes it and starts the search. */
function SourcingConsole() {
  const navigate = useNavigate();
  const scope = useTalentScope();
  const resumeTitle = useStudio((st) => st.profile?.title ?? null);
  const resumeStep = useStudio((st) => st.step);

  // Thin pipelines on open roles become one-click suggestions (→ the studio with that JD loaded).
  const reqHints = useMemo(() => {
    const rank = { critical: 0, high: 1, normal: 2, low: 3 } as const;
    return scope.requisitions
      .filter((r) => r.status === 'open' && r.headcount > r.hires)
      .map((r) => ({ r, active: scope.applications.filter((a) => a.requisitionId === r.id && a.status === 'active').length }))
      .sort((a, b) => a.active - b.active || rank[a.r.priority] - rank[b.r.priority])
      .slice(0, 2)
      .map(({ r }) => ({ id: r.id, label: `Find more for ${r.title}` }));
  }, [scope]);

  return (
    <NeoNovaPrompt
      className="tl-deck-nova"
      hud="Nova · AI sourcing"
      title="Paste a job description or describe the role"
      badge="Pool + LinkedIn in one pass"
      placeholder="e.g. Senior React engineer · fintech payments · Dubai hybrid — or paste the full JD"
      suggestions={[...reqHints.map((h) => h.label), ...EXAMPLE_ROLES].slice(0, 5)}
      submitLabel="Source"
      submitIcon={<Radar />}
      label="Nova AI sourcing"
      onSubmit={(text) => {
        const hint = reqHints.find((h) => h.label === text);
        if (hint) {
          navigate(`/talent/sourcing?req=${hint.id}`);
          return;
        }
        void studio.prefill(text);
        navigate('/talent/sourcing');
      }}
    >
      <div className="tl-deck-nova__foot">
        <ol className="tl-deck-flow" aria-label="What Nova does next">
          <li>
            <FileSearch aria-hidden="true" /> Decode the JD
          </li>
          <li>
            <Recycle aria-hidden="true" /> Rediscover your pool
          </li>
          <li>
            <Linkedin aria-hidden="true" /> Build LinkedIn searches
          </li>
          <li>
            <Send aria-hidden="true" /> Draft outreach
          </li>
        </ol>
        {resumeTitle && (
          <Link to="/talent/sourcing" className="tl-deck-resume" title="Pick up the sourcing session where you left it">
            <span className="neo-hud">Resume</span>
            <span className="truncate">{resumeTitle}</span>
            <span className="neo-mono tl-deck-resume__step">{resumeStep + 1}/5</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </div>
    </NeoNovaPrompt>
  );
}

/** Hiring managers: describe the role → the requisition wizard opens with the brief prefilled. */
function RequisitionConsole() {
  const navigate = useNavigate();
  return (
    <NeoNovaPrompt
      className="tl-deck-nova"
      hud="Nova · Requisition drafting"
      title="Describe the role you need"
      badge="JD + interview loop drafted"
      placeholder="e.g. Backend engineer for payments · Go + Postgres · Dubai hybrid — or paste a JD"
      suggestions={EXAMPLE_REQS}
      submitLabel="Draft requisition"
      submitIcon={<FilePlus2 />}
      label="Nova requisition drafting"
      onSubmit={(text) => navigate('/talent/requisitions/new', { state: { brief: text } })}
    >
      <div className="tl-deck-nova__foot">
        <ol className="tl-deck-flow" aria-label="What Nova does next">
          <li>
            <BrainCircuit aria-hidden="true" /> Decode the brief
          </li>
          <li>
            <FileSearch aria-hidden="true" /> Draft the JD
          </li>
          <li>
            <ListChecks aria-hidden="true" /> Plan the loop
          </li>
          <li>
            <BadgeCheck aria-hidden="true" /> Route approval
          </li>
        </ol>
      </div>
    </NeoNovaPrompt>
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
  const now = useNow(60_000);
  const urgent = tasks.filter((t) => t.urgent).length;
  return (
    <NeoPanel
      hud="Needs you"
      title="Your next steps"
      className="tl-deck-panel"
      actions={tasks.length > 0 && <Chip tone={urgent ? 'danger' : 'app'} size="sm">{urgent ? `${urgent} urgent` : `${tasks.length} open`}</Chip>}
    >
      {tasks.length === 0 ? (
        <NeoEmpty compact icon={<PartyPopper />} title="You’re all caught up">
          Scorecards, decisions, approvals and follow-ups land here the moment they need you.
        </NeoEmpty>
      ) : (
        <ul className="tl-deck-tasks neo-stagger">
          {tasks.slice(0, 6).map((t, i) => {
            const m = TASK_META[t.kind];
            const Icon = m.icon;
            return (
              <li key={t.id} style={{ '--i': i } as CSSProperties}>
                <button type="button" className="tl-deck-task" data-urgent={t.urgent || undefined} style={{ '--h': m.hue } as CSSProperties} onClick={() => runTalentTask(t, navigate)}>
                  <span className="tl-deck-task__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="tl-deck-task__body">
                    <span className="tl-deck-task__top">
                      <span className="tl-deck-task__kind">{m.label}</span>
                      <span className="tl-deck-task__when">{whenLabel(t, now)}</span>
                    </span>
                    <span className="tl-deck-task__title truncate">{t.title}</span>
                    <span className="tl-deck-task__detail truncate">{t.detail}</span>
                  </span>
                  <ChevronRight className="tl-deck-task__chev" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length > 6 && <p className="tl-deck-more">+{tasks.length - 6} more in the sections on the left</p>}
    </NeoPanel>
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

const INSIGHT_TONE: Record<Insight['tone'], NeoTone> = { danger: 'danger', warning: 'warning', info: 'cyan', success: 'success' };

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
        title: `${worst[1]} candidate${s(worst[1])} waiting too long in ${m.label}`,
        detail: `The target is ${m.slaDays} days. Fast processes win the best candidates.`,
        action: { label: 'Review', to: `/talent/pipeline?stage=${worst[0]}` },
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
            title: `${candName(o.candidateId)}’s offer has waited ${d} day${s(d)} for approval`,
            detail: 'Every day an offer waits raises the risk of a counter-offer.',
            action: { label: 'Offers', to: '/talent/offers' },
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
        title: `${r.title} has only ${active} active candidate${s(active)}`,
        detail: 'Drop the JD into AI Sourcing to rediscover your pool and generate LinkedIn searches.',
        action: caps.source ? { label: 'Source', to: `/talent/sourcing?req=${r.id}` } : { label: 'Open', to: `/talent/requisitions/${r.id}` },
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
          action: { label: 'Profile', candidateId: best.id },
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
          title: `${j.name} starts in ${d} day${s(d)} without a NEXUS account`,
          detail: 'Provision it now so day one starts with access, not tickets.',
          action: { label: 'Journey', to: `/hr/onboarding/${j.id}` },
          weight: 75,
        });
      }

    return out.sort((a, b) => b.weight - a.weight).slice(0, 4);
  }, [scope, data, caps, now]);
}

function Insights() {
  const insights = useInsights();
  const navigate = useNavigate();
  return (
    <NeoPanel hud="Nova suggests" title="Copilot insights" className="tl-deck-panel" actions={<Sparkles className="tl-deck-sparkle" aria-hidden="true" />}>
      {insights.length === 0 ? (
        <NeoEmpty compact icon={<CircleCheck />} title="All systems nominal">
          No bottlenecks detected. Insights appear when something needs attention.
        </NeoEmpty>
      ) : (
        <ul className="tl-deck-insights neo-stagger">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            return (
              <li key={ins.id} className="tl-deck-insight" data-tone={INSIGHT_TONE[ins.tone]} style={{ '--i': i } as CSSProperties}>
                <span className="tl-deck-insight__icon">
                  <Icon aria-hidden="true" />
                </span>
                <div className="tl-deck-insight__text">
                  <b>{ins.title}</b>
                  <span>{ins.detail}</span>
                </div>
                {ins.action && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs tl-deck-insight__cta"
                    onClick={() => {
                      const a = ins.action!;
                      if (a.candidateId) openCandidate(a.candidateId);
                      else if (a.to) navigate(a.to);
                    }}
                  >
                    {ins.action.label} <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}

// ───────────────────────── flight path ─────────────────────────
function FlightPath({ stats, stale }: { stats: TalentStats; stale: Map<StageId, number> }) {
  const navigate = useNavigate();
  const byStage = new Map(stats.funnel.map((f) => [f.stage, f]));
  return (
    <NeoPanel
      hud="Hiring flight path"
      title="Every candidate, every step"
      className="tl-flight"
      actions={
        <Link to="/talent/pipeline" className="neo-btn neo-btn--ghost neo-btn--xs">
          Board <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      <div className="tl-flight__scan" aria-hidden="true" />
      <div className="tl-flight__track">
        {STAGE_PHASES.map((phase, pi) => (
          <div key={phase} className="tl-flight__phase" style={{ '--pi': pi } as CSSProperties}>
            <div className="tl-flight__label neo-hud">
              <span>{String(pi + 1).padStart(2, '0')}</span> {phase}
            </div>
            <div className="tl-flight__nodes">
              {STAGES.filter((st) => st.phase === phase).map((st) => {
                const f = byStage.get(st.id);
                const n = f?.current ?? 0;
                const late = stale.get(st.id) ?? 0;
                const Icon = st.icon;
                return (
                  <button
                    key={st.id}
                    type="button"
                    className={cx('tl-flight__node', n > 0 && 'has-items', late > 0 && 'is-late')}
                    style={{ '--stage-h': st.hue } as CSSProperties}
                    onClick={() => navigate(`/talent/pipeline?stage=${st.id}`)}
                    title={st.description}
                  >
                    <span className="tl-flight__orb">
                      <Icon aria-hidden="true" />
                      <span className="tl-flight__count">{n}</span>
                    </span>
                    <span className="tl-flight__name">{st.label}</span>
                    <span className="tl-flight__meta">
                      {f?.reached ?? 0} reached
                      {late > 0 && <span className="tl-flight__late"> · {late} late</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="tl-flight__lede">Exit criteria at every stage — outreach → interest &amp; consent → screen → scorecards → decision → approved offer → onboarding.</p>
    </NeoPanel>
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
    <NeoPanel
      hud="Open roles"
      title="Requisition radar"
      flush
      className="tl-deck-panel"
      actions={
        <Link to="/talent/requisitions" className="neo-btn neo-btn--ghost neo-btn--xs">
          All {rows.length > 0 && <span className="neo-count">{rows.length}</span>} <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <NeoEmpty compact icon={<Briefcase />} title="No active requisitions">
          Open a requisition to start building a pipeline.
        </NeoEmpty>
      ) : (
        <>
          <div className="tl-deck-legend" aria-hidden="true">
            <span>
              <i className="is-acquire" /> Acquire
            </span>
            <span>
              <i className="is-assess" /> Assess
            </span>
            <span>
              <i className="is-decide" /> Decide
            </span>
          </div>
          <ul className="tl-deck-reqs">
            {rows.slice(0, 6).map(({ r, active, phase, stale, days, best }) => {
              const total = Math.max(1, phase.Acquire + phase.Assess + phase.Decide);
              return (
                <li key={r.id}>
                  <button type="button" className="tl-deck-req" onClick={() => navigate(`/talent/requisitions/${r.id}`)}>
                    <span className={cx('tl-deck-req__pri', `is-${r.priority}`)} aria-hidden="true" />
                    <span className="tl-deck-req__main">
                      <span className="tl-deck-req__title">
                        <span className="truncate">{r.title}</span>
                        {r.status !== 'open' ? <ReqStatusBadge status={r.status} /> : r.priority === 'critical' || r.priority === 'high' ? <PriorityBadge priority={r.priority} /> : null}
                      </span>
                      <span className="tl-deck-req__meta truncate">
                        {r.department} · {r.location} · {active} active{best ? ` · best ${best}%` : ''}
                      </span>
                    </span>
                    <span className="tl-deck-req__bar" title={`Acquire ${phase.Acquire} · Assess ${phase.Assess} · Decide ${phase.Decide}`}>
                      {(['Acquire', 'Assess', 'Decide'] as const).map((p) => (
                        <i key={p} className={`is-${p.toLowerCase()}`} style={{ flexGrow: phase[p] / total || 0.0001 }} />
                      ))}
                    </span>
                    <span className="tl-deck-req__stat">
                      <b className="neo-num">
                        {r.hires}/{r.headcount}
                      </b>
                      <small>hired</small>
                    </span>
                    <span className={cx('tl-deck-req__stat', stale > 0 && 'is-warn')}>
                      <b className="neo-num">{days}d</b>
                      <small>{stale > 0 ? `${stale} late` : 'open'}</small>
                    </span>
                    <ChevronRight className="tl-deck-req__chev" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </NeoPanel>
  );
}

// ───────────────────────── funnel & sources ─────────────────────────
function FunnelPanel({ stats }: { stats: TalentStats }) {
  const navigate = useNavigate();
  return (
    <NeoPanel hud="Conversion" title="Hiring funnel" className="tl-deck-panel">
      <Funnel steps={stats.funnel} compact onSelect={(stage) => navigate(`/talent/pipeline?stage=${stage}`)} />
    </NeoPanel>
  );
}

function SourceMix({ stats }: { stats: TalentStats }) {
  const max = Math.max(1, ...stats.sourceMix.map((x) => x.candidates));
  return (
    <NeoPanel hud="Channels" title="Source of hire" className="tl-deck-panel">
      {stats.sourceMix.length === 0 ? (
        <p className="tl-deck-faint">No candidates yet.</p>
      ) : (
        <ul className="tl-deck-sources">
          {stats.sourceMix.map((x, i) => {
            const m = SOURCE_META[x.source];
            const Icon = m.icon;
            return (
              <li key={x.source} className="tl-deck-source" style={{ '--src-h': m.hue, '--w': `${Math.max(6, (x.candidates / max) * 100)}%`, '--i': i } as CSSProperties}>
                <span className="tl-deck-source__label">
                  <Icon aria-hidden="true" /> <span className="truncate">{m.label}</span>
                </span>
                <span className="tl-deck-source__bar">
                  <i />
                </span>
                <span className="tl-deck-source__num neo-num">
                  {x.candidates}
                  {x.hires > 0 && (
                    <small title={`${x.hires} hired`}>
                      <Trophy aria-hidden="true" />
                      {x.hires}
                    </small>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}

// ───────────────────────── side: interviews ─────────────────────────
function UpcomingInterviews() {
  const interviews = useTalent((st) => st.interviews);
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
  const endOfDay = new Date(now).setHours(23, 59, 59, 999);
  const today = list.filter((i) => i.scheduledAt <= endOfDay).length;
  return (
    <NeoPanel
      hud={today ? `Today · ${today}` : 'Up next'}
      title="Interviews"
      className="tl-deck-panel"
      actions={
        <Link to="/talent/interviews" className="neo-btn neo-btn--ghost neo-btn--xs">
          Agenda <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {list.length === 0 ? (
        <div className="tl-deck-clear">
          <CircleCheck aria-hidden="true" />
          <div>
            <b>Nothing scheduled</b>
            <span>Interviews you schedule or sit on appear here.</span>
          </div>
        </div>
      ) : (
        <ul className="tl-deck-ivs">
          {list.map((iv) => {
            const c = candById.get(iv.candidateId);
            const r = reqById.get(iv.requisitionId);
            const k = INTERVIEW_KIND_META[iv.kind];
            const Icon = k.icon;
            const mine = !!me && iv.interviewerIds.includes(me.id);
            const live = iv.scheduledAt <= now;
            return (
              <li key={iv.id}>
                <button type="button" className={cx('tl-deck-iv', live && 'is-live')} onClick={() => c && openCandidate(c.id)}>
                  <span className="tl-deck-iv__time">
                    {live ? (
                      <>
                        <Orb tone="success" pulse size={7} /> Now
                      </>
                    ) : (
                      fmtRelativeDay(iv.scheduledAt, now)
                    )}
                  </span>
                  <span className="tl-deck-iv__kind" title={k.label}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="tl-deck-iv__main">
                    <span className="tl-deck-iv__who">
                      <span className="truncate">{c?.name ?? 'Candidate'}</span>
                      {c?.sample && <SampleTag />}
                      {mine && (
                        <Chip tone="app" size="sm">
                          You
                        </Chip>
                      )}
                    </span>
                    <span className="tl-deck-iv__what truncate">
                      {iv.title} · {r?.title ?? 'Requisition'} · {iv.durationMins}m
                    </span>
                  </span>
                  <PeopleStack userIds={iv.interviewerIds} max={3} size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}

// ───────────────────────── side: offers in flight ─────────────────────────
function OffersInFlight() {
  const data = useTalentData();
  const scope = useTalentScope();
  const { candById, reqById } = useTalentLookups();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const list = useMemo(
    () =>
      data.offers
        .filter((o) => scope.reqIds.has(o.requisitionId) && (o.status === 'pending-approval' || o.status === 'approved' || o.status === 'sent'))
        .sort((a, b) => ({ 'pending-approval': 0, approved: 1, sent: 2 })[a.status as 'sent'] - ({ 'pending-approval': 0, approved: 1, sent: 2 })[b.status as 'sent'] || a.createdAt - b.createdAt),
    [data.offers, scope],
  );
  return (
    <NeoPanel
      hud="In flight"
      title="Offers"
      className="tl-deck-panel"
      actions={
        <Link to="/talent/offers" className="neo-btn neo-btn--ghost neo-btn--xs">
          All <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {list.length === 0 ? (
        <div className="tl-deck-clear">
          <Signature aria-hidden="true" />
          <div>
            <b>No offers in flight</b>
            <span>Approved decisions turn into offers here.</span>
          </div>
        </div>
      ) : (
        <ul className="tl-deck-offers">
          {list.slice(0, 4).map((o) => {
            const c = candById.get(o.candidateId);
            const expires = o.status === 'sent' ? Math.ceil((o.expiresAt - now) / DAY) : null;
            return (
              <li key={o.id} className="tl-deck-offer-item">
                <button type="button" className="tl-deck-offer" onClick={() => navigate('/talent/offers')}>
                  {c ? <CandidateAvatar person={c} size={30} /> : <span className="tl-deck-offer__ph" />}
                  <span className="tl-deck-offer__main">
                    <span className="tl-deck-offer__who truncate">{c?.name ?? 'Candidate'}</span>
                    <span className="tl-deck-offer__what truncate">
                      {o.title}
                      {expires !== null && ` · ${expires > 0 ? `expires in ${expires}d` : 'expired'}`}
                    </span>
                  </span>
                  <ChevronRight className="tl-deck-offer__chev" aria-hidden="true" />
                </button>
                <OfferTracker offer={o} req={reqById.get(o.requisitionId)} candName={c?.name} now={now} compact className="tl-deck-offer__track" />
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}

// ───────────────────────── side: SLA watch ─────────────────────────
function SlaWatch() {
  const scope = useTalentScope();
  const { candById } = useTalentLookups();
  const now = useNow(60_000);
  const { ok, warn, stale, worst } = useMemo(() => {
    const active = scope.applications.filter((a) => a.status === 'active' && STAGE_BY_ID[a.stage].slaDays > 0);
    const tally = { ok: 0, warn: 0, stale: 0 };
    for (const a of active) tally[slaState(a, now)] += 1;
    const over = active
      .map((a) => ({ a, over: (now - a.stageEnteredAt) / DAY - STAGE_BY_ID[a.stage].slaDays }))
      .filter((x) => x.over > 0)
      .sort((x, y) => y.over - x.over)
      .slice(0, 3);
    return { ...tally, worst: over };
  }, [scope, now]);
  const total = Math.max(1, ok + warn + stale);
  return (
    <NeoPanel
      hud="Momentum"
      title="SLA watch"
      className="tl-deck-panel"
      actions={
        <Link to="/talent/pipeline" className="neo-btn neo-btn--ghost neo-btn--xs">
          Board <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      <div className="tl-deck-sla" role="img" aria-label={`${ok} on track, ${warn} at risk, ${stale} past SLA`}>
        <span className="tl-deck-sla__bar" aria-hidden="true">
          <i data-state="ok" style={{ flexGrow: ok / total || 0.0001 }} />
          <i data-state="warn" style={{ flexGrow: warn / total || 0.0001 }} />
          <i data-state="stale" style={{ flexGrow: stale / total || 0.0001 }} />
        </span>
        <span className="tl-deck-sla__legend">
          <span data-state="ok">
            <b className="neo-num">{ok}</b> on track
          </span>
          <span data-state="warn">
            <b className="neo-num">{warn}</b> at risk
          </span>
          <span data-state="stale">
            <b className="neo-num">{stale}</b> past SLA
          </span>
        </span>
      </div>
      {worst.length === 0 ? (
        <div className="tl-deck-clear">
          <CircleCheck aria-hidden="true" />
          <div>
            <b>Everyone is moving</b>
            <span>No candidate has waited past a stage target.</span>
          </div>
        </div>
      ) : (
        <ul className="tl-deck-late">
          {worst.map(({ a, over }) => {
            const c = candById.get(a.candidateId);
            const st = STAGE_BY_ID[a.stage];
            return (
              <li key={a.id}>
                <button type="button" className="tl-deck-late__row" onClick={() => openCandidate(a.candidateId)} style={{ '--stage-h': st.hue } as CSSProperties}>
                  {c ? <CandidateAvatar person={c} size={26} /> : <span className="tl-deck-offer__ph" />}
                  <span className="tl-deck-late__main">
                    <span className="truncate">{c?.name ?? 'Candidate'}</span>
                    <small>
                      {st.label} · target {st.slaDays}d
                    </small>
                  </span>
                  <span className="tl-deck-late__over neo-mono">+{Math.max(1, Math.round(over))}d</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </NeoPanel>
  );
}

// ───────────────────────── side: activity ─────────────────────────
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
  const activity = useTalent((st) => st.activity);
  const scope = useTalentScope();
  const { userById, candById } = useTalentLookups();
  const now = useNow(60_000);
  const items = useMemo(() => {
    const cands = new Set(scope.candidates.map((c) => c.id));
    return activity
      .filter((a) => (a.requisitionId && scope.reqIds.has(a.requisitionId)) || (a.candidateId && cands.has(a.candidateId)))
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
  }, [activity, scope]);
  return (
    <NeoPanel hud="Live" title="Activity" className="tl-deck-panel">
      {items.length === 0 ? (
        <p className="tl-deck-faint">No activity yet.</p>
      ) : (
        <ol className="tl-deck-feed">
          {items.map((a) => {
            const Icon = ACTIVITY_ICON[a.kind] ?? Activity;
            const actor = userById.get(a.actorId);
            const cand = a.candidateId ? candById.get(a.candidateId) : undefined;
            return (
              <li key={a.id} className={cx('tl-deck-feed__item', `is-${a.kind}`)}>
                <span className="tl-deck-feed__icon">
                  <Icon aria-hidden="true" />
                </span>
                <div className="tl-deck-feed__body">
                  <div className="tl-deck-feed__text">{a.text}</div>
                  <div className="tl-deck-feed__meta">
                    {actor ? (
                      <>
                        <Avatar user={actor} size={14} /> {actor.name.split(' ')[0]}
                      </>
                    ) : (
                      'System'
                    )}{' '}
                    · {relativeTime(a.at, now)}
                    {cand && (
                      <>
                        {' · '}
                        <button type="button" className="tl-deck-feed__cand" onClick={() => openCandidate(cand.id)}>
                          {cand.name}
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
    </NeoPanel>
  );
}

// ───────────────────────── side: systems ─────────────────────────
/** AI engine · data backend · LinkedIn connector — honest about what's live. */
function SystemsPanel() {
  const ai = aiStatus();
  const be = backendStatus();
  const li = getLinkedInConnector();
  const rows: { icon: LucideIcon; label: string; value: string; detail: string; tone: NeoTone }[] = [
    { icon: Sparkles, label: 'AI engine', value: ai.engine === 'gemini' ? (ai.model ?? 'Gemini') : 'Offline engine', detail: ai.detail, tone: ai.engine === 'gemini' ? 'success' : 'amber' },
    { icon: be.kind === 'firestore' ? Cloud : Database, label: 'Data', value: be.kind === 'firestore' ? `Firestore · ${be.database}` : `Local · ${be.database}`, detail: be.detail, tone: be.kind === 'firestore' ? 'success' : 'cyan' },
    { icon: Linkedin, label: 'LinkedIn', value: li.id === 'assisted' ? 'Assisted mode' : 'Recruiter System Connect', detail: li.description, tone: li.id === 'assisted' ? 'blue' : 'success' },
  ];
  return (
    <NeoPanel hud="Under the hood" title="Systems" className="tl-deck-panel">
      <ul className="tl-deck-sys">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label} title={r.detail}>
              <span className="tl-deck-sys__icon" data-tone={r.tone}>
                <Icon aria-hidden="true" />
              </span>
              <span className="tl-deck-sys__main">
                <span className="neo-hud">{r.label}</span>
                <span className="truncate">{r.value}</span>
              </span>
              <Orb tone={r.tone} size={7} />
            </li>
          );
        })}
      </ul>
    </NeoPanel>
  );
}

// ───────────────────────── page ─────────────────────────
export function OverviewTab() {
  const stats = useTalentStats();
  const tasks = useMyTalentTasks();
  const scope = useTalentScope();
  const caps = useTalentCaps();
  const now = useNow(60_000);
  const stale = useMemo(() => {
    const m = new Map<StageId, number>();
    for (const a of scope.applications) if (a.status === 'active' && slaState(a, now) === 'stale') m.set(a.stage, (m.get(a.stage) ?? 0) + 1);
    return m;
  }, [scope, now]);
  const offersVisible = caps.manage || caps.approveOffers || caps.hire;
  const console_ = caps.source ? <SourcingConsole /> : caps.hire ? <RequisitionConsole /> : null;

  return (
    <div className="tl-deck">
      <DeckBanners tasks={tasks} />
      <DeckKpis stats={stats} />
      <NeoHome
        sideLabel="Interviews, offers and momentum"
        main={
          <>
            {console_}
            <div className="tl-deck-pair">
              <NextSteps tasks={tasks} />
              <Insights />
            </div>
            <FlightPath stats={stats} stale={stale} />
            <ReqRadar />
            <div className="tl-deck-pair">
              <FunnelPanel stats={stats} />
              <SourceMix stats={stats} />
            </div>
          </>
        }
        side={
          <>
            <UpcomingInterviews />
            {offersVisible && <OffersInFlight />}
            <SlaWatch />
            <ActivityFeed />
            <SystemsPanel />
          </>
        }
      />
    </div>
  );
}
