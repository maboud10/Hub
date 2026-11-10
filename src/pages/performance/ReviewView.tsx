/**
 * Quarterly Check-in Review Packet — `/performance/checkins/:reviewId`.
 *
 * Role-aware review workspace mounted inside `PerformancePage` (`NeoStage` + `NeoHead`):
 *  1. `self`    — Self-reflection editor (employee) with Nova grounded drafting (`useTypewriter`),
 *                 5-point competency ratings, evidence citations (`useEvidence`), and read-only view.
 *  2. `manager` — Manager review editor (direct manager) with side-by-side self answers, Nova draft &
 *                 rating advisor (`suggestRating`), live bias/quality coach (`checkReview`), overall
 *                 rating & potential, private manager note, submit & release flow.
 *  3. `peers`   — 360° & Peers: peer nominations (`nominatePeers`), manager approval (`approveNominations`),
 *                 Nova peer theme synthesis (`peerThemes`), submitted peer feedback (`peerAuthorVisible`)
 *                 and aggregated upward feedback (`upwardAccess`).
 *  4. `packet`  — Summary & packet (`?tab=summary` or `?tab=packet`): side-by-side self vs manager
 *                 competency `<Radar/>`, calibration 9-box badge, release & acknowledgment status,
 *                 side-by-side Q&A narrative, and quarter OKR `<Trajectory/>` charts.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  Grid3x3,
  Hourglass,
  Lock,
  MessagesSquare,
  NotebookPen,
  Paperclip,
  PenLine,
  Plus,
  Radar as RadarIcon,
  Send,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  Bar,
  Chip,
  NeoBanner,
  NeoBanners,
  NeoEmpty,
  NeoHead,
  NeoHome,
  NeoMenu,
  NeoPanel,
  NeoStage,
  NeoTabs,
  PeoplePicker,
  Ring,
  useTypewriter,
  type MenuEntry,
  type NeoTabItem,
  type Tone,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import {
  peerAuthorVisible,
  reviewAccess,
  upwardAccess,
  type ReviewAccess,
} from '@/performance/access';
import {
  BOX_META,
  COMPETENCIES,
  COMPETENCY,
  COMPETENCY_IDS,
  POTENTIALS,
  RATING,
  RATINGS,
  SCORE_LABEL,
  UPWARD_DIMENSIONS,
  potentialToAxis,
  ratingToAxis,
} from '@/performance/constants';
import {
  canAnswerPeer,
  canEditSelf,
  canWriteManager,
  currentPhaseKey,
  getPhase,
  managerUnlocked,
} from '@/performance/cycle';
import { evidenceSnippet, type EvidenceItem } from '@/performance/evidence';
import { defaultLadderFor, LADDER, levelOf } from '@/performance/ladders';
import { boxKey } from '@/performance/ninebox';
import {
  draftManagerAnswer,
  draftSelfAnswer,
  peerThemes,
  suggestRating,
  type DraftContext,
  type PeerThemes,
} from '@/performance/nova';
import { elapsed as periodElapsed, formatRange, formatValue, krProgress, krStatus } from '@/performance/okr';
import { usePerf } from '@/performance/store';
import type {
  CompetencyId,
  Cycle,
  CycleFeedback,
  KeyResult,
  PerfData,
  Period,
  Review,
  ReviewTemplate,
  Score5,
} from '@/performance/types';
import { toast } from '@/store/toast';
import { DeclineModal, PeerFeedbackModal, UpwardFeedbackModal } from './checkins-modals';
import {
  COMP_ICON,
  RatingChip,
  ReviewStatusChip,
  cycleShort,
  longDate,
  managerProgress,
  plural,
  selfProgress,
  templateFor,
  wordsIn,
} from './checkins-shared';
import { dayLabel, dueLabel, report, shortDate, useMinute, usePerfCtx, type PerfCtx } from './hooks';
import { Radar, type RadarSeries } from './Radar';
import {
  AcknowledgeModal,
  BiasCoachPanel,
  CompetencyRatingList,
  ConfirmActionModal,
  EvidenceDrawer,
  ScheduleConversationModal,
  buildDraftContext,
} from './review-shared';
import { Trajectory } from './Trajectory';
import { NovaBox, NovaThinking, OkrRing, StatusChip, Who } from './ui';
import { useEvidence } from './useEvidence';
import './styles/review.css';

export type ReviewTab = 'self' | 'manager' | 'peers' | 'packet';

function parseTabParam(raw: string | null): ReviewTab | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (v === 'self' || v === 'reflection') return 'self';
  if (v === 'manager' || v === 'mgr') return 'manager';
  if (v === 'peers' || v === 'peer' || v === '360') return 'peers';
  if (v === 'packet' || v === 'summary' || v === 'overview') return 'packet';
  return null;
}

const ROLE_BADGE: Record<ReviewAccess['role'], { label: string; tone: Tone }> = {
  employee: { label: 'Your packet', tone: 'app' },
  manager: { label: 'Direct manager', tone: 'pink' },
  skip: { label: 'Skip-level leader', tone: 'violet' },
  admin: { label: 'People Ops · Audited', tone: 'amber' },
  none: { label: 'Restricted', tone: 'slate' },
};

export function ReviewView() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const ctx = usePerfCtx();
  const now = useMinute();
  const data = usePerf();

  const review = useMemo(() => data.reviews.find((r) => r.id === reviewId), [data.reviews, reviewId]);
  const cycle = useMemo(() => (review ? data.cycles.find((c) => c.id === review.cycleId) : undefined), [data.cycles, review]);
  const period = useMemo(
    () => (cycle ? data.periods.find((p) => p.id === cycle.periodId) ?? data.periods[0] : data.periods[0]),
    [data.periods, cycle],
  );
  const tpl = useMemo(() => templateFor(data.templates, cycle), [data.templates, cycle]);
  const acc = useMemo(() => (ctx && review ? reviewAccess(ctx.v, ctx.users, review) : null), [ctx, review]);

  /* Record packet view (writes audit entry when People Ops views someone else's packet). */
  useEffect(() => {
    if (review?.id && acc?.canView) {
      usePerf.getState().viewPacket(review.id);
    }
  }, [review?.id, acc?.canView]);

  const { items: evidence } = useEvidence(ctx, review?.employeeId, period?.start ?? 0, period?.end);

  const peerItems = useMemo(
    () =>
      cycle && review
        ? data.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'peer' && f.subjectId === review.employeeId)
        : [],
    [data.cycleFeedback, cycle, review],
  );
  const upwardItems = useMemo(
    () =>
      cycle && review
        ? data.cycleFeedback.filter((f) => f.cycleId === cycle.id && f.kind === 'upward' && f.subjectId === review.employeeId)
        : [],
    [data.cycleFeedback, cycle, review],
  );
  const themes = useMemo(() => peerThemes(peerItems), [peerItems]);

  const draftCtx = useMemo(() => {
    if (!ctx || !review || !period) return null;
    return buildDraftContext({
      ctx,
      review,
      period,
      now,
      data,
      evidence,
      peerThemes: acc?.seePeers !== 'none' ? themes : undefined,
    });
  }, [ctx, review, period, now, data, evidence, acc?.seePeers, themes]);

  /* Modals */
  const [ackOpen, setAckOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<'self' | 'manager' | 'release' | null>(null);
  const [answerModalId, setAnswerModalId] = useState<string | null>(null);
  const [declineModalId, setDeclineModalId] = useState<string | null>(null);

  if (!ctx) return null;

  /* ───── Unknown or unauthorized reviewId ───── */
  if (!review || !cycle || !acc || !acc.canView) {
    const isUnauthorized = !!review && !!acc && !acc.canView;
    return (
      <NeoStage label="Review packet">
        <NeoHead
          icon={<Lock />}
          eyebrow="Reflect · Quarterly check-ins"
          title={isUnauthorized ? 'Private review packet' : 'Review packet not found'}
          sub={
            isUnauthorized
              ? 'Review packets are visible only to the employee, their management chain and People Ops.'
              : 'That review packet doesn’t exist or may have been removed.'
          }
          actions={
            <Link to="/performance/checkins" className="neo-btn neo-btn--soft" data-qa="rv-back-checkins">
              <ArrowLeft />
              <span className="neo-btn__label">Back to Check-ins</span>
            </Link>
          }
        />
        <div className="neo-body neo-pad">
          <NeoEmpty
            icon={<Lock />}
            title={isUnauthorized ? 'You don’t have access to this review packet' : 'We couldn’t find that review packet'}
            action={
              <Link to="/performance/checkins" className="neo-btn neo-btn--plasma">
                <ArrowLeft /> Back to Check-ins
              </Link>
            }
          >
            {isUnauthorized
              ? 'Each person’s check-in packet is confidential between them, their manager chain and People Ops.'
              : 'Head back to the Check-ins hub to open your active packet or your team’s reviews.'}
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  }

  const subject = ctx.user(review.employeeId);
  const first = ctx.first(review.employeeId);
  const mgr = review.managerId ? ctx.user(review.managerId) : undefined;
  const mgrFirst = review.managerId ? ctx.first(review.managerId) : 'Manager';
  const isSelf = acc.role === 'employee';
  const showManagerTab = !isSelf || acc.seeManager;

  /* Default tab logic & URL sync (`?tab=` or `?mode=`) */
  const rawParam = searchParams.get('tab') ?? searchParams.get('mode');
  const parsedTab = parseTabParam(rawParam);
  const defaultTab: ReviewTab = review.release
    ? 'packet'
    : acc.role === 'manager' && (managerUnlocked(cycle, review, now) || review.manager.status !== 'not-started')
      ? 'manager'
      : isSelf
        ? 'self'
        : 'packet';
  const activeTab: ReviewTab =
    parsedTab === 'manager' && !showManagerTab ? 'packet' : (parsedTab ?? defaultTab);

  const setTab = (next: ReviewTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('mode');
        p.set('tab', next === 'packet' ? 'summary' : next);
        return p;
      },
      { replace: true },
    );
  };

  /* Tab items for NeoHead center */
  const activePeers = peerItems.filter((f) => f.status !== 'declined');
  const submittedPeers = peerItems.filter((f) => f.status === 'submitted');
  const proposedPeers = peerItems.filter((f) => f.status === 'proposed');
  const tabs: NeoTabItem<ReviewTab>[] = [
    {
      value: 'self',
      label: (
        <>
          <span className="pf-rv-tab__full">Self-reflection</span>
          <span className="pf-rv-tab__short">Self</span>
        </>
      ),
      icon: <NotebookPen />,
      title: `Self-reflection (${review.self.status})`,
    },
    ...(showManagerTab
      ? [
          {
            value: 'manager' as const,
            label: (
              <>
                <span className="pf-rv-tab__full">Manager review</span>
                <span className="pf-rv-tab__short">Manager</span>
              </>
            ),
            icon: <PenLine />,
            title: `Manager review (${review.manager.status})`,
          },
        ]
      : []),
    {
      value: 'peers',
      label: (
        <>
          <span className="pf-rv-tab__full">360° & Peers</span>
          <span className="pf-rv-tab__short">360°</span>
        </>
      ),
      icon: <Users />,
      count: proposedPeers.length && !isSelf ? proposedPeers.length : submittedPeers.length || activePeers.length || null,
      title: 'Peer nominations, 360° themes & upward feedback',
    },
    {
      value: 'packet',
      label: (
        <>
          <span className="pf-rv-tab__full">Summary & packet</span>
          <span className="pf-rv-tab__short">Packet</span>
        </>
      ),
      icon: <RadarIcon />,
      title: 'Competency radar, calibration, side-by-side narrative & OKR trajectories',
    },
  ];

  /* Editable states */
  const selfEditable = isSelf && canEditSelf(cycle, review, now);
  const mgrEditable = review.managerId === ctx.me.id && canWriteManager(cycle, review, now);
  const selfProg = selfProgress(review.self, tpl);
  const mgrProg = managerProgress(review.manager, tpl);

  /* Sibling packets in this cycle (for managers/admins) and historical packets for this employee */
  const employeeCycles = data.reviews
    .filter((r) => r.employeeId === review.employeeId && reviewAccess(ctx.v, ctx.users, r).canView)
    .map((r) => ({ r, c: data.cycles.find((c) => c.id === r.cycleId) }))
    .sort((a, b) => (b.c?.createdAt ?? 0) - (a.c?.createdAt ?? 0));

  const teamPackets = data.reviews.filter(
    (r) => r.cycleId === cycle.id && r.managerId === ctx.me.id && r.employeeId !== ctx.me.id,
  );

  /* Menu items */
  const menu: MenuEntry[] = [];
  if (employeeCycles.length > 1) {
    for (const { r, c } of employeeCycles) {
      if (r.id === review.id) continue;
      menu.push({
        label: `${cycleShort(c)} packet${r.release ? ' (shared)' : ''}`,
        icon: <FileText />,
        onSelect: () => navigate(`/performance/checkins/${r.id}?tab=summary`),
      });
    }
    menu.push({ kind: 'sep' });
  }
  if (teamPackets.length > 0) {
    for (const tr of teamPackets.slice(0, 6)) {
      if (tr.id === review.id) continue;
      menu.push({
        label: `${ctx.name(tr.employeeId)}’s packet`,
        icon: <Users />,
        onSelect: () => navigate(`/performance/checkins/${tr.id}?tab=${activeTab === 'packet' ? 'summary' : activeTab}`),
      });
    }
    menu.push({ kind: 'sep' });
  }
  menu.push(
    {
      label: isSelf ? 'My growth plan' : `${first}’s growth plan`,
      icon: <Sprout />,
      onSelect: () => navigate(isSelf ? '/performance/growth' : `/performance/growth?u=${review.employeeId}`),
    },
    {
      label: '1:1 workspace',
      icon: <MessagesSquare />,
      onSelect: () => navigate('/performance/one-on-ones'),
    },
  );
  if (ctx.canCalibrate) {
    menu.push({
      label: 'Calibration 9-box',
      icon: <Grid3x3 />,
      onSelect: () => navigate('/performance/calibration'),
    });
  }

  /* Primary header CTA */
  let primaryAction: ReactNode = null;
  if (acc.acknowledge) {
    primaryAction = (
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={() => setAckOpen(true)}
        data-qa="rv-head-ack"
      >
        <BadgeCheck />
        <span className="neo-btn__label">Acknowledge review</span>
      </button>
    );
  } else if (acc.release && review.manager.status === 'submitted' && !review.release) {
    primaryAction = (
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={() => setConfirmKind('release')}
        data-qa="rv-head-release"
      >
        <Send />
        <span className="neo-btn__label">Share with {first}</span>
      </button>
    );
  } else if (activeTab === 'self' && selfEditable && review.self.status !== 'submitted') {
    primaryAction = (
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        disabled={!selfProg.ready}
        title={selfProg.ready ? 'Submit self-reflection' : selfProg.missing[0]}
        onClick={() => setConfirmKind('self')}
        data-qa="rv-head-submit-self"
      >
        <Send />
        <span className="neo-btn__label">Submit reflection</span>
      </button>
    );
  } else if (activeTab === 'manager' && mgrEditable && review.manager.status !== 'submitted') {
    primaryAction = (
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        disabled={!mgrProg.ready}
        title={mgrProg.ready ? 'Submit manager review' : mgrProg.missing[0]}
        onClick={() => setConfirmKind('manager')}
        data-qa="rv-head-submit-manager"
      >
        <Send />
        <span className="neo-btn__label">Submit review</span>
      </button>
    );
  }

  /* Banners */
  const banners: ReactNode[] = [];
  if (review.release && isSelf && !review.release.acknowledgedAt) {
    banners.push(
      <NeoBanner
        key="ack-banner"
        tone="app"
        icon={<BadgeCheck />}
        title={`Your ${cycleShort(cycle)} review has been shared by ${mgrFirst}`}
        meta={`Shared ${relativeTime(review.release.releasedAt, now)}`}
        action={
          <div className="pf-row">
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              onClick={() => setSchedOpen(true)}
              data-qa="rv-banner-schedule"
            >
              <CalendarClock /> Schedule 1:1
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--plasma neo-btn--xs"
              onClick={() => setAckOpen(true)}
              data-qa="rv-banner-ack"
            >
              <BadgeCheck /> Acknowledge & comment
            </button>
          </div>
        }
      >
        Read through your summary, competency radar and {mgrFirst}’s narrative, then acknowledge to record that you’ve reviewed it together.
      </NeoBanner>,
    );
  } else if (review.release && isSelf && review.release.acknowledgedAt) {
    banners.push(
      <NeoBanner
        key="acked-banner"
        tone="success"
        icon={<CircleCheck />}
        title={`Acknowledged ${relativeTime(review.release.acknowledgedAt, now)}`}
        meta={review.release.conversationAt ? `1:1 ${dayLabel(review.release.conversationAt, now)}` : undefined}
        action={
          <div className="pf-row">
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setAckOpen(true)}>
              {review.release.employeeComment ? 'Edit comment' : 'Add comment'}
            </button>
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setSchedOpen(true)}>
              <CalendarClock /> {review.release.conversationAt ? 'Reschedule 1:1' : 'Schedule 1:1'}
            </button>
          </div>
        }
      >
        {review.release.employeeComment
          ? `Your note: “${review.release.employeeComment}”`
          : `You acknowledged this review packet. Add a follow-up note or schedule a 1:1 conversation anytime.`}
      </NeoBanner>,
    );
  }

  if (acc.release && review.manager.status === 'submitted' && !review.release) {
    banners.push(
      <NeoBanner
        key="mgr-release"
        tone="app"
        icon={<Send />}
        title={`Ready to share with ${first}`}
        meta={cycle.calibrationLockedAt ? 'Calibration finalized' : 'Manager review submitted'}
        action={
          <button
            type="button"
            className="neo-btn neo-btn--plasma neo-btn--xs"
            onClick={() => setConfirmKind('release')}
            data-qa="rv-banner-release"
          >
            <Send /> Share review packet
          </button>
        }
      >
        Sharing unlocks your manager review, overall rating and anonymized 360° themes for {first}, and invites them to acknowledge.
      </NeoBanner>,
    );
  }

  if (acc.audited) {
    banners.push(
      <NeoBanner
        key="audit-banner"
        tone="slate"
        icon={<ShieldCheck />}
        title={`People Ops view · Audited`}
        meta={cycle.name}
      >
        You are viewing {subject?.name ?? first}’s packet with People Ops permissions (`performance.manage`). This view is logged in the audit trail.
      </NeoBanner>,
    );
  }

  const lv = levelOf(data.levels[review.employeeId]);
  const roleBadge = ROLE_BADGE[acc.role];
  const phaseKey = currentPhaseKey(cycle, now);

  /* Peer/Upward modal items if the viewer clicks "Write feedback" from the 360 tab */
  const answerItem = answerModalId ? data.cycleFeedback.find((f) => f.id === answerModalId) : undefined;
  const declineItem = declineModalId ? data.cycleFeedback.find((f) => f.id === declineModalId) : undefined;

  return (
    <NeoStage label={`${subject?.name ?? 'Employee'} · ${cycle.name}`}>
      <NeoHead
        icon={subject ? <Avatar user={subject} size={36} presence /> : <NotebookPen />}
        eyebrow={`Reflect · ${cycleShort(cycle)}`}
        title={isSelf ? `My ${cycleShort(cycle)} Review` : `${subject?.name ?? 'Review'} · ${cycleShort(cycle)}`}
        sub={`${subject?.title ?? ''}${subject?.department ? ` · ${subject.department}` : ''}${lv ? ` · ${lv.level.id}` : ''}`}
        center={<NeoTabs value={activeTab} onChange={setTab} items={tabs} label="Review packet mode" className="pf-rv-tabs" />}
        actions={
          <>
            <Link to="/performance/checkins" className="neo-btn neo-btn--soft" data-qa="rv-back">
              <ArrowLeft />
              <span className="neo-btn__label">Check-ins</span>
            </Link>
            {primaryAction}
            <NeoMenu
              label="More packet actions"
              items={menu}
              trigger={(p) => (
                <button {...p} type="button" className="neo-iconbtn" aria-label="More actions" data-qa="rv-more-menu">
                  <Ellipsis />
                </button>
              )}
            />
          </>
        }
      />

      <div className="neo-body neo-pad pf-rv-body">
        {banners.length > 0 && <NeoBanners>{banners.slice(0, 2)}</NeoBanners>}

        {/* Compact packet identity & cycle switcher ribbon */}
        <div className="neo-card pf-rv-ribbon">
          <div className="pf-rv-ribbon__who">
            {subject && <Avatar user={subject} size={42} presence />}
            <div className="pf-rv-ribbon__text">
              <div className="pf-row pf-row--wrap">
                <b>{subject?.name ?? 'Unknown'}</b>
                {roleBadge && (
                  <Chip size="sm" tone={roleBadge.tone}>
                    {roleBadge.label}
                  </Chip>
                )}
                {lv && (
                  <Chip size="sm" tone="violet">
                    {lv.level.id} · {lv.level.title}
                  </Chip>
                )}
                {review.release ? (
                  <Chip size="sm" tone={review.release.acknowledgedAt ? 'success' : 'app'} icon={<BadgeCheck />}>
                    {review.release.acknowledgedAt ? 'Shared & acknowledged' : 'Shared with employee'}
                  </Chip>
                ) : (
                  <ReviewStatusChip
                    status={activeTab === 'manager' ? review.manager.status : review.self.status}
                    label={
                      activeTab === 'manager'
                        ? `Manager: ${review.manager.status === 'submitted' ? 'Submitted' : review.manager.status === 'draft' ? 'Draft' : 'Not started'}`
                        : `Self: ${review.self.status === 'submitted' ? 'Submitted' : review.self.status === 'draft' ? 'Draft' : 'Not started'}`
                    }
                  />
                )}
                {acc.seeManager && review.manager.overall && <RatingChip rating={review.manager.overall} />}
              </div>
              <span className="pf-faint text-xs">
                {cycle.name}
                {phaseKey ? ` · ${phaseKey} phase active` : cycle.status === 'closed' ? ' · Cycle closed' : ''}
                {mgr ? ` · Reviewed by ${mgr.name}` : ''}
              </span>
            </div>
          </div>

          <div className="pf-rv-ribbon__right">
            {employeeCycles.length > 1 && (
              <div className="pf-rv-quarters" role="group" aria-label="Switch quarter packet">
                {employeeCycles.map(({ r, c }) => (
                  <Link
                    key={r.id}
                    to={`/performance/checkins/${r.id}${activeTab === 'packet' ? '?tab=summary' : `?tab=${activeTab}`}`}
                    className={cx('pf-rv-quarter', r.id === review.id && 'is-active')}
                    aria-current={r.id === review.id ? 'page' : undefined}
                  >
                    {cycleShort(c)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {activeTab === 'self' && (
          <SelfTab
            ctx={ctx}
            review={review}
            cycle={cycle}
            tpl={tpl}
            acc={acc}
            now={now}
            evidence={evidence}
            draftCtx={draftCtx}
            onRequestSubmit={() => setConfirmKind('self')}
          />
        )}

        {activeTab === 'manager' && (
          <ManagerTab
            ctx={ctx}
            review={review}
            cycle={cycle}
            period={period}
            tpl={tpl}
            acc={acc}
            now={now}
            data={data}
            evidence={evidence}
            themes={themes}
            draftCtx={draftCtx}
            onRequestSubmit={() => setConfirmKind('manager')}
            onRequestRelease={() => setConfirmKind('release')}
            onRequestSchedule={() => setSchedOpen(true)}
          />
        )}

        {activeTab === 'peers' && (
          <PeersTab
            ctx={ctx}
            review={review}
            cycle={cycle}
            acc={acc}
            now={now}
            data={data}
            peerItems={peerItems}
            upwardItems={upwardItems}
            themes={themes}
            onAnswerRequest={(id) => setAnswerModalId(id)}
            onDeclineRequest={(id) => setDeclineModalId(id)}
          />
        )}

        {activeTab === 'packet' && (
          <PacketTab
            ctx={ctx}
            review={review}
            cycle={cycle}
            period={period}
            tpl={tpl}
            acc={acc}
            now={now}
            data={data}
            evidence={evidence}
            themes={themes}
            onAcknowledge={() => setAckOpen(true)}
            onRelease={() => setConfirmKind('release')}
            onSchedule={() => setSchedOpen(true)}
            onSwitchTab={setTab}
          />
        )}
      </div>

      {/* Modals */}
      <AcknowledgeModal
        open={ackOpen}
        onClose={() => setAckOpen(false)}
        review={review}
        cycleName={cycleShort(cycle)}
        managerFirst={mgrFirst}
      />

      <ScheduleConversationModal
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        review={review}
        cycleName={cycle.name}
        partnerFirst={isSelf ? mgrFirst : first}
        now={now}
      />

      <ConfirmActionModal
        open={confirmKind === 'self'}
        onClose={() => setConfirmKind(null)}
        title={review.self.status === 'submitted' ? 'Update your self-reflection?' : 'Submit your self-reflection?'}
        subtitle={
          review.managerId
            ? `${mgrFirst} will be notified and their manager review will unlock. You can still polish your answers until the self-reflection window closes.`
            : 'Your reflection will be marked as submitted.'
        }
        confirmLabel={review.self.status === 'submitted' ? 'Save & update' : 'Submit self-reflection'}
        icon={<Send />}
        onConfirm={() => {
          const res = usePerf.getState().submitSelf(review.id);
          if (report(res)) setConfirmKind(null);
        }}
      >
        <div className="pf-rv-confirm-summary">
          <div>
            <span className="neo-hud">Answers written</span>
            <b>
              {selfProg.answered} of {selfProg.questions}
            </b>
          </div>
          <div>
            <span className="neo-hud">Competencies rated</span>
            <b>
              {selfProg.rated} of {selfProg.ratingsNeeded}
            </b>
          </div>
          <div>
            <span className="neo-hud">Evidence cited</span>
            <b>{selfProg.cited}</b>
          </div>
        </div>
      </ConfirmActionModal>

      <ConfirmActionModal
        open={confirmKind === 'manager'}
        onClose={() => setConfirmKind(null)}
        title={`Submit ${first}’s manager review?`}
        subtitle={`Submitting records your ${review.manager.overall ? RATING[review.manager.overall].label : ''} rating and adds ${first} to calibration. ${first} won’t see it until you share the packet.`}
        confirmLabel="Submit manager review"
        icon={<Send />}
        onConfirm={() => {
          const res = usePerf.getState().submitManager(review.id);
          if (report(res)) setConfirmKind(null);
        }}
      >
        <div className="pf-rv-confirm-summary">
          <div>
            <span className="neo-hud">Overall rating</span>
            <b>{review.manager.overall ? RATING[review.manager.overall].label : '—'}</b>
          </div>
          <div>
            <span className="neo-hud">Potential</span>
            <b className="capitalize">{review.manager.potential ?? '—'}</b>
          </div>
          <div>
            <span className="neo-hud">Competencies</span>
            <b>
              {mgrProg.rated}/{mgrProg.ratingsNeeded}
            </b>
          </div>
        </div>
      </ConfirmActionModal>

      <ConfirmActionModal
        open={confirmKind === 'release'}
        onClose={() => setConfirmKind(null)}
        title={`Share ${cycleShort(cycle)} review with ${first}?`}
        subtitle={`${first} will be notified immediately and can read your narrative, competency ratings and anonymized 360° themes (your private note stays hidden).`}
        confirmLabel={`Share with ${first}`}
        icon={<BadgeCheck />}
        onConfirm={() => {
          const res = usePerf.getState().releaseReview(review.id);
          if (report(res)) {
            setConfirmKind(null);
            setTab('packet');
          }
        }}
      >
        <div className="pf-rv-confirm-summary">
          <div>
            <span className="neo-hud">Recipient</span>
            <b>{subject?.name ?? first}</b>
          </div>
          <div>
            <span className="neo-hud">Overall rating</span>
            <b>{review.manager.overall ? RATING[review.manager.overall].label : '—'}</b>
          </div>
          <div>
            <span className="neo-hud">Private note</span>
            <b>Kept private to you</b>
          </div>
        </div>
      </ConfirmActionModal>

      <PeerFeedbackModal
        open={!!answerItem && answerItem.kind === 'peer'}
        item={answerItem?.kind === 'peer' ? answerItem : undefined}
        onClose={() => setAnswerModalId(null)}
        onDecline={(id) => {
          setAnswerModalId(null);
          setDeclineModalId(id);
        }}
      />
      <UpwardFeedbackModal
        open={!!answerItem && answerItem.kind === 'upward'}
        item={answerItem?.kind === 'upward' ? answerItem : undefined}
        onClose={() => setAnswerModalId(null)}
        onDecline={(id) => {
          setAnswerModalId(null);
          setDeclineModalId(id);
        }}
      />
      <DeclineModal
        open={!!declineItem}
        item={declineItem}
        onClose={() => setDeclineModalId(null)}
      />
    </NeoStage>
  );
}

/* ═════════════════════════ 1 · SELF-REFLECTION TAB ═════════════════════════ */

function SelfTab({
  ctx,
  review,
  cycle,
  tpl,
  acc,
  now,
  evidence,
  draftCtx,
  onRequestSubmit,
}: {
  ctx: PerfCtx;
  review: Review;
  cycle: Cycle;
  tpl?: ReviewTemplate;
  acc: ReviewAccess;
  now: number;
  evidence: EvidenceItem[];
  draftCtx: DraftContext | null;
  onRequestSubmit: () => void;
}) {
  const isSelf = acc.role === 'employee';
  const editable = isSelf && canEditSelf(cycle, review, now);
  const first = ctx.first(review.employeeId);
  const selfPhase = getPhase(cycle, 'self');
  const questions = tpl?.questions ?? [];
  const [activeQId, setActiveQId] = useState<string>(questions[0]?.id ?? 'q-wins');

  /* Nova typewriter draft state */
  const [novaTargetQ, setNovaTargetQ] = useState<string | 'all' | null>(null);
  const [novaRawText, setNovaRawText] = useState('');
  const [novaThinking, setNovaThinking] = useState(false);
  const [streamedText, streamDone] = useTypewriter(novaRawText, 190);

  const prog = selfProgress(review.self, tpl);
  const user = ctx.user(review.employeeId);
  const lv = levelOf(usePerf.getState().levels[review.employeeId]);
  const ladder = lv?.ladder ?? LADDER[defaultLadderFor(user?.department)];
  const targetLevel = lv?.next ?? lv?.level ?? ladder.levels[0];

  const updateAnswer = (qId: string, val: string) => {
    usePerf.getState().saveSelf(review.id, { answers: { [qId]: val } });
  };

  const updateRating = (compId: CompetencyId, score: Score5) => {
    usePerf.getState().saveSelf(review.id, { ratings: { [compId]: score } });
  };

  const toggleCite = (evId: string) => {
    const has = review.self.cited.includes(evId);
    if (!has) {
      usePerf.getState().saveSelf(review.id, { cited: [...review.self.cited, evId] });
      toast.success('Cited in your self-reflection');
    } else {
      const ok = usePerf.getState().saveSelf(review.id, {});
      if (ok.ok) {
        usePerf.setState((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === review.id
              ? { ...r, self: { ...r.self, cited: r.self.cited.filter((x) => x !== evId), updatedAt: Date.now() } }
              : r,
          ),
        }));
      }
    }
  };

  const insertSnippet = (item: EvidenceItem) => {
    const qId = activeQId || questions[0]?.id;
    if (!qId) return;
    const cur = review.self.answers[qId] ?? '';
    const snippet = evidenceSnippet(item);
    const next = cur.trim() ? `${cur.trim()}\n${snippet}` : snippet;
    usePerf.getState().saveSelf(review.id, {
      answers: { [qId]: next },
      cited: [...review.self.cited, item.id],
    });
    toast.success('Added quote & cited highlight');
  };

  const triggerNovaQuestion = (qId: string) => {
    if (!draftCtx) return;
    setActiveQId(qId);
    setNovaTargetQ(qId);
    setNovaThinking(true);
    setNovaRawText('');
    window.setTimeout(() => {
      setNovaThinking(false);
      setNovaRawText(draftSelfAnswer(qId, draftCtx));
    }, 420);
  };

  const triggerNovaAll = () => {
    if (!draftCtx) return;
    setNovaTargetQ('all');
    setNovaThinking(true);
    setNovaRawText('');
    window.setTimeout(() => {
      setNovaThinking(false);
      const allDrafts: Record<string, string> = {};
      const previewParts: string[] = [];
      for (const q of questions) {
        const d = draftSelfAnswer(q.id, draftCtx);
        allDrafts[q.id] = d;
        previewParts.push(`• ${q.prompt}\n${d}`);
      }
      setNovaRawText(previewParts.join('\n\n'));
      usePerf.getState().saveSelf(review.id, {
        answers: allDrafts,
        cited: evidence.slice(0, 3).map((e) => e.id),
      });
      toast.success('Nova drafted your self-reflection from your quarter highlights');
    }, 480);
  };

  if (!acc.seeSelf) {
    return (
      <NeoPanel hud="Self-reflection · Private draft" title={`${first} is still writing their self-reflection`} icon={<Lock />}>
        <NeoEmpty
          compact
          icon={<Hourglass />}
          title={`Unlocks when ${first} submits`}
        >
          Self-reflection drafts stay private to {first} while they reflect. You’ll see their answers and self-ratings as soon as they submit{selfPhase ? ` (or after ${longDate(selfPhase.end)})` : ''}.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  const questionLabels = Object.fromEntries(questions.map((q, i) => [q.id, `Q${i + 1}`]));
  const activePrompt = questions.find((q) => q.id === activeQId)?.prompt;

  return (
    <NeoHome
      sideLabel="Completeness & evidence"
      main={
        <>
          {editable && draftCtx && (
            <NovaBox
              title="Nova"
              hud={`Grounded in ${draftCtx.krs.length} OKRs · ${evidence.length} highlights`}
              actions={
                <div className="pf-row">
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => triggerNovaQuestion(activeQId || questions[0]?.id)}
                    data-qa="rv-nova-self-one"
                  >
                    <Sparkles /> Draft current question
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--nova neo-btn--xs"
                    onClick={triggerNovaAll}
                    data-qa="rv-nova-self-all"
                  >
                    <WandSparkles /> Draft all answers
                  </button>
                </div>
              }
            >
              {novaThinking ? (
                <NovaThinking label="Synthesizing your OKR check-ins, shipped work and kudos" />
              ) : novaRawText ? (
                <div className="pf-rv-nova-stream">
                  <p className="pf-rv-nova-stream__text">{streamedText}</p>
                  <div className="pf-rv-nova-stream__foot">
                    {novaTargetQ && novaTargetQ !== 'all' && streamDone && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() => {
                          updateAnswer(novaTargetQ, novaRawText);
                          toast.success('Inserted Nova draft into your answer');
                        }}
                        data-qa="rv-nova-apply"
                      >
                        <Check /> Use this draft in {questionLabels[novaTargetQ] ?? 'answer'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() => {
                        setNovaRawText('');
                        setNovaTargetQ(null);
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <p>
                  Nova pulls real numbers from your Q4 key results, projects you shipped and praise from colleagues to draft specific first-person answers. Everything remains editable before you submit.
                </p>
              )}
            </NovaBox>
          )}

          {/* Questions */}
          <NeoPanel
            hud={editable ? `${prog.answered} of ${prog.questions} answered (5+ words each)` : `${ cycleShort(cycle) } narrative`}
            title={isSelf ? 'Your quarterly reflection' : `${first}’s self-reflection`}
            icon={<NotebookPen />}
            actions={
              <ReviewStatusChip status={review.self.status} />
            }
          >
            <div className="pf-rv-qlist">
              {questions.map((q, idx) => {
                const ans = review.self.answers[q.id] ?? '';
                const w = wordsIn(ans);
                const done = w >= 5;
                const isFocused = activeQId === q.id;
                return (
                  <article
                    key={q.id}
                    className={cx('pf-rv-qcard', done && 'is-done', editable && isFocused && 'is-focused')}
                    onFocus={() => setActiveQId(q.id)}
                  >
                    <header className="pf-rv-qcard__head">
                      <span className="pf-rv-qcard__num">{String(idx + 1).padStart(2, '0')}</span>
                      <div className="pf-rv-qcard__titles">
                        <label className="pf-rv-qcard__prompt" htmlFor={`self-q-${q.id}`}>
                          {q.prompt}
                        </label>
                        {q.help && <p className="pf-rv-qcard__help">{q.help}</p>}
                      </div>
                      <div className="pf-rv-qcard__meta">
                        <Chip size="sm" tone={done ? 'success' : w > 0 ? 'warning' : 'slate'} icon={done ? <Check /> : undefined}>
                          {w} {w === 1 ? 'word' : 'words'}
                          {editable && !done ? ' · 5+ needed' : ''}
                        </Chip>
                        {editable && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--ghost neo-btn--xs"
                            onClick={() => triggerNovaQuestion(q.id)}
                            title="Draft this answer with Nova"
                            data-qa={`rv-nova-q-${q.id}`}
                          >
                            <Sparkles /> Nova draft
                          </button>
                        )}
                      </div>
                    </header>

                    {editable ? (
                      <textarea
                        id={`self-q-${q.id}`}
                        className="neo-textarea pf-rv-qcard__input"
                        rows={4}
                        value={ans}
                        onFocus={() => setActiveQId(q.id)}
                        onChange={(e) => updateAnswer(q.id, e.target.value)}
                        placeholder="Share concrete outcomes, numbers, and what changed because of your work…"
                        data-qa={`rv-self-ans-${q.id}`}
                      />
                    ) : ans.trim() ? (
                      <div className="pf-rv-qcard__read">{ans}</div>
                    ) : (
                      <p className="pf-faint text-sm">No answer recorded.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </NeoPanel>

          {/* Competency ratings */}
          {tpl?.competencies !== false && (
            <NeoPanel
              hud={`5 core competencies · ${prog.rated}/${prog.ratingsNeeded} rated`}
              title={isSelf ? 'Rate yourself on the five competencies' : `${first}’s competency self-ratings`}
              icon={< Sprout />}
              actions={
                targetLevel ? (
                  <Chip size="sm" tone="violet">
                    {targetLevel.id} bar
                  </Chip>
                ) : undefined
              }
            >
              <CompetencyRatingList
                values={review.self.ratings}
                onChange={editable ? updateRating : undefined}
                readOnly={!editable}
                compareLevel={targetLevel?.expect}
                levelLabel={targetLevel?.id}
              />
            </NeoPanel>
          )}
        </>
      }
      side={
        <>
          {/* Completeness & submit card */}
          <NeoPanel
            hud={editable ? 'Autosaved locally' : 'Self-reflection'}
            title={review.self.status === 'submitted' ? 'Self-reflection submitted' : 'Reflection checklist'}
            icon={<CircleCheck />}
          >
            <div className="pf-rv-prog">
              <Ring value={review.self.status === 'submitted' ? 1 : prog.value} size={84} stroke={7} label={`Completeness ${Math.round(prog.value * 100)}%`}>
                <span className="pf-rv-prog__pct">
                  {Math.round((review.self.status === 'submitted' ? 1 : prog.value) * 100)}
                  <small>%</small>
                </span>
              </Ring>
              <div className="pf-rv-prog__info">
                <ReviewStatusChip status={review.self.status} size="md" />
                <span className="pf-faint text-xs">
                  {review.self.submittedAt
                    ? `Submitted ${relativeTime(review.self.submittedAt, now)}`
                    : review.self.updatedAt
                      ? `Saved ${relativeTime(review.self.updatedAt, now)}`
                      : 'Not started'}
                </span>
                {selfPhase && editable && (
                  <Chip size="sm" tone={dueLabel(selfPhase.end, now).tone} icon={<CalendarClock />}>
                    {dueLabel(selfPhase.end, now).text}
                  </Chip>
                )}
              </div>
            </div>

            <ul className="pf-ck-check">
              <li data-done={(prog.answered === prog.questions && prog.questions > 0) || undefined}>
                {prog.answered === prog.questions ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
                <span className="grow">Questions (5+ words)</span>
                <b>
                  {prog.answered}/{prog.questions}
                </b>
              </li>
              {prog.ratingsNeeded > 0 && (
                <li data-done={prog.rated === prog.ratingsNeeded || undefined}>
                  {prog.rated === prog.ratingsNeeded ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
                  <span className="grow">Competency ratings</span>
                  <b>
                    {prog.rated}/{prog.ratingsNeeded}
                  </b>
                </li>
              )}
              <li data-done={prog.cited >= 1 || undefined}>
                {prog.cited >= 1 ? <CircleCheck aria-hidden="true" /> : <Paperclip aria-hidden="true" />}
                <span className="grow">
                  Evidence cited <small>· optional</small>
                </span>
                <b>{prog.cited}</b>
              </li>
            </ul>

            {editable && (
              <>
                {prog.missing.length > 0 && (
                  <p className="pf-rv-missing">Still needed: {prog.missing.join(' · ')}</p>
                )}
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--block"
                  disabled={!prog.ready}
                  onClick={onRequestSubmit}
                  data-qa="rv-submit-self-btn"
                >
                  <Send /> {review.self.status === 'submitted' ? 'Update submitted reflection' : 'Submit self-reflection'}
                </button>
              </>
            )}
          </NeoPanel>

          <EvidenceDrawer
            ctx={ctx}
            subjectId={review.employeeId}
            evidence={evidence}
            cited={review.self.cited}
            canCite={editable}
            onToggleCite={toggleCite}
            onInsertSnippet={editable ? insertSnippet : undefined}
            activeQuestionPrompt={activePrompt}
          />

          {editable && (
            <BiasCoachPanel
              answers={review.self.answers}
              evidence={evidence}
              cited={review.self.cited}
              now={now}
              questionLabels={questionLabels}
              onApplyRewrite={(qId, next) => updateAnswer(qId, next)}
            />
          )}
        </>
      }
    />
  );
}

/* ═════════════════════════ 2 · MANAGER REVIEW TAB ═════════════════════════ */

function ManagerTab({
  ctx,
  review,
  cycle,
  period,
  tpl,
  acc,
  now,
  data,
  evidence,
  themes,
  draftCtx,
  onRequestSubmit,
  onRequestRelease,
  onRequestSchedule,
}: {
  ctx: PerfCtx;
  review: Review;
  cycle: Cycle;
  period: Period;
  tpl?: ReviewTemplate;
  acc: ReviewAccess;
  now: number;
  data: PerfData;
  evidence: EvidenceItem[];
  themes: PeerThemes;
  draftCtx: DraftContext | null;
  onRequestSubmit: () => void;
  onRequestRelease: () => void;
  onRequestSchedule: () => void;
}) {
  const first = ctx.first(review.employeeId);
  const subject = ctx.user(review.employeeId);
  const unlocked = managerUnlocked(cycle, review, now) || review.manager.status !== 'not-started' || !!review.release;
  const editable = review.managerId === ctx.me.id && canWriteManager(cycle, review, now);
  const questions = tpl?.questions ?? [];
  const [activeQId, setActiveQId] = useState<string>(questions[0]?.id ?? 'q-wins');
  const [showSelfRef, setShowSelfRef] = useState(true);

  /* Nova typewriter draft state */
  const [novaTargetQ, setNovaTargetQ] = useState<string | 'all' | null>(null);
  const [novaRawText, setNovaRawText] = useState('');
  const [novaThinking, setNovaThinking] = useState(false);
  const [streamedText, streamDone] = useTypewriter(novaRawText, 190);

  const prog = managerProgress(review.manager, tpl);
  const mgrPhase = getPhase(cycle, 'manager');
  const selfPhase = getPhase(cycle, 'self');

  const lv = levelOf(data.levels[review.employeeId]);
  const ladder = lv?.ladder ?? LADDER[defaultLadderFor(subject?.department)];
  const targetLevel = lv?.next ?? lv?.level ?? ladder.levels[0];

  /* Nova Rating & Potential advisor */
  const suggestion = useMemo(() => {
    const avgProgress = draftCtx?.krs.length
      ? draftCtx.krs.reduce((s, k) => s + k.progress, 0) / draftCtx.krs.length
      : 0.65;
    const praiseCount = evidence.filter((e) => (e.kind === 'kudos' || e.kind === 'feedback') && e.positive).length;
    const critCount = evidence.filter((e) => e.kind === 'feedback' && !e.positive).length;
    const scores = Object.keys(review.manager.ratings).length ? review.manager.ratings : review.self.ratings;
    return suggestRating({
      avgProgress,
      expected: periodElapsed(period, now),
      praise: praiseCount,
      constructive: critCount,
      peerStrengths: themes.strengths.length,
      scores,
      next: lv?.next ?? targetLevel ?? null,
    });
  }, [draftCtx, evidence, review.manager.ratings, review.self.ratings, period, now, themes.strengths.length, lv?.next, targetLevel]);

  const updateAnswer = (qId: string, val: string) => {
    usePerf.getState().saveManager(review.id, { answers: { [qId]: val } });
  };

  const updateRating = (compId: CompetencyId, score: Score5) => {
    usePerf.getState().saveManager(review.id, { ratings: { [compId]: score } });
  };

  const toggleCite = (evId: string) => {
    const has = review.manager.cited.includes(evId);
    if (!has) {
      usePerf.getState().saveManager(review.id, { cited: [...review.manager.cited, evId] });
      toast.success('Cited in manager review');
    } else {
      const ok = usePerf.getState().saveManager(review.id, {});
      if (ok.ok) {
        usePerf.setState((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === review.id
              ? { ...r, manager: { ...r.manager, cited: r.manager.cited.filter((x) => x !== evId), updatedAt: Date.now() } }
              : r,
          ),
        }));
      }
    }
  };

  const insertSnippet = (item: EvidenceItem) => {
    const qId = activeQId || questions[0]?.id;
    if (!qId) return;
    const cur = review.manager.answers[qId] ?? '';
    const snippet = evidenceSnippet(item);
    const next = cur.trim() ? `${cur.trim()}\n${snippet}` : snippet;
    usePerf.getState().saveManager(review.id, {
      answers: { [qId]: next },
      cited: [...review.manager.cited, item.id],
    });
    toast.success('Added quote & cited highlight');
  };

  const triggerNovaQuestion = (qId: string) => {
    if (!draftCtx) return;
    setActiveQId(qId);
    setNovaTargetQ(qId);
    setNovaThinking(true);
    setNovaRawText('');
    window.setTimeout(() => {
      setNovaThinking(false);
      setNovaRawText(draftManagerAnswer(qId, draftCtx));
    }, 420);
  };

  const triggerNovaAll = () => {
    if (!draftCtx) return;
    setNovaTargetQ('all');
    setNovaThinking(true);
    setNovaRawText('');
    window.setTimeout(() => {
      setNovaThinking(false);
      const allDrafts: Record<string, string> = {};
      const previewParts: string[] = [];
      for (const q of questions) {
        const d = draftManagerAnswer(q.id, draftCtx);
        allDrafts[q.id] = d;
        previewParts.push(`• ${q.managerPrompt}\n${d}`);
      }
      setNovaRawText(previewParts.join('\n\n'));
      usePerf.getState().saveManager(review.id, {
        answers: allDrafts,
        cited: evidence.slice(0, 3).map((e) => e.id),
      });
      toast.success(`Nova drafted ${first}’s review from OKRs, evidence and 360° themes`);
    }, 480);
  };

  /* Locked state before employee submits self-reflection */
  if (!unlocked) {
    return (
      <NeoHome
        sideLabel="Quarter evidence"
        main={
          <NeoPanel
            hud="Manager review · Waiting on self-reflection"
            title={`Unlocks when ${first} submits their self-reflection`}
            icon={<Lock />}
          >
            <NeoEmpty
              compact
              icon={<Hourglass />}
              title={`${first}’s self-reflection is currently ${review.self.status === 'draft' ? 'in draft' : 'not started'}`}
            >
              Manager reviews unlock as soon as {first} submits their self-reflection{selfPhase ? `, or automatically when the self-reflection phase closes on ${longDate(selfPhase.end)}` : ''}. Meanwhile, you can review {first}’s quarter highlights and 360° peer nominations.
            </NeoEmpty>
          </NeoPanel>
        }
        side={
          <EvidenceDrawer
            ctx={ctx}
            subjectId={review.employeeId}
            evidence={evidence}
            cited={review.manager.cited}
            canCite={false}
          />
        }
      />
    );
  }

  if (!acc.seeManager && !editable) {
    return (
      <NeoPanel hud="Manager review" title="Manager review in progress" icon={<Lock />}>
        <NeoEmpty compact icon={<Hourglass />} title="Not shared yet">
          The manager review becomes visible once it is submitted and shared with the employee.
        </NeoEmpty>
      </NeoPanel>
    );
  }

  const questionLabels = Object.fromEntries(questions.map((q, i) => [q.id, `Q${i + 1}`]));
  const activePrompt = questions.find((q) => q.id === activeQId)?.managerPrompt;
  const previewBox =
    review.manager.overall && review.manager.potential
      ? BOX_META[boxKey(ratingToAxis(review.manager.overall), potentialToAxis(review.manager.potential))]
      : null;

  return (
    <NeoHome
      sideLabel="Quality coach & evidence"
      main={
        <>
          {/* Nova Manager Co-Pilot + Rating Advisor */}
          {editable && draftCtx && (
            <NovaBox
              title="Nova"
              hud={`${draftCtx.krs.length} OKRs · ${evidence.length} highlights · ${themes.responses} peer reviews`}
              actions={
                <div className="pf-row">
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => {
                      usePerf.getState().saveManager(review.id, {
                        overall: suggestion.overall,
                        potential: suggestion.potential,
                      });
                      toast.success(`Applied ${RATING[suggestion.overall].label} · ${suggestion.potential} potential`);
                    }}
                    data-qa="rv-nova-apply-rating"
                  >
                    <Sparkles /> Apply suggested rating
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--nova neo-btn--xs"
                    onClick={triggerNovaAll}
                    data-qa="rv-nova-mgr-all"
                  >
                    <WandSparkles /> Draft all answers
                  </button>
                </div>
              }
            >
              <div className="pf-rv-advisor">
                <div className="pf-rv-advisor__chips">
                  <span className="neo-hud">Suggested</span>
                  <RatingChip rating={suggestion.overall} />
                  <Chip size="sm" tone="violet">
                    {suggestion.potential.toUpperCase()} potential
                  </Chip>
                </div>
                <ul className="pf-rv-advisor__reasons">
                  {suggestion.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {novaThinking ? (
                <NovaThinking label={`Drafting ${first}’s narrative from OKRs, kudos and 360° themes`} />
              ) : novaRawText ? (
                <div className="pf-rv-nova-stream">
                  <p className="pf-rv-nova-stream__text">{streamedText}</p>
                  <div className="pf-rv-nova-stream__foot">
                    {novaTargetQ && novaTargetQ !== 'all' && streamDone && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() => {
                          updateAnswer(novaTargetQ, novaRawText);
                          toast.success('Inserted Nova draft into your review');
                        }}
                      >
                        <Check /> Use in {questionLabels[novaTargetQ] ?? 'answer'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() => {
                        setNovaRawText('');
                        setNovaTargetQ(null);
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
            </NovaBox>
          )}

          {/* Overall Rating & Potential */}
          <NeoPanel
            hud="Overall assessment & calibration input"
            title={`Overall rating & potential for ${first}`}
            icon={<Grid3x3 />}
            actions={
              previewBox ? (
                <Chip size="sm" tone={previewBox.tone as Tone} title={previewBox.blurb}>
                  9-box: {previewBox.label}
                </Chip>
              ) : undefined
            }
          >
            <div className="pf-stack pf-gap-lg">
              <div>
                <div className="pf-row" style={{ marginBottom: 8 }}>
                  <span className="neo-label">Overall performance rating</span>
                  <span className="pf-spacer" />
                  {review.manager.overall && <RatingChip rating={review.manager.overall} />}
                </div>
                <div className="pf-rv-ratings-grid" role="radiogroup" aria-label="Overall performance rating">
                  {RATINGS.map((r) => {
                    const checked = review.manager.overall === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={!editable}
                        className={cx('pf-rv-rating-card', checked && 'is-active')}
                        data-tone={r.tone}
                        onClick={() => editable && usePerf.getState().saveManager(review.id, { overall: r.id })}
                        data-qa={`rv-overall-${r.id}`}
                      >
                        <div className="pf-rv-rating-card__top">
                          <b>{r.label}</b>
                          <span className="neo-mono">{Math.round(r.guidance * 100)}%</span>
                        </div>
                        <p>{r.blurb}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {acc.role !== 'employee' && (
                <div>
                  <div className="pf-row" style={{ marginBottom: 8 }}>
                    <span className="neo-label">Growth potential (for calibration 9-box)</span>
                    <span className="pf-spacer" />
                    {previewBox && <span className="pf-faint text-xs">{previewBox.blurb}</span>}
                  </div>
                  <div className="pf-rv-potentials" role="radiogroup" aria-label="Potential level">
                    {POTENTIALS.map((p) => {
                      const checked = review.manager.potential === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          disabled={!editable}
                          className={cx('pf-rv-pot-card', checked && 'is-active')}
                          onClick={() => editable && usePerf.getState().saveManager(review.id, { potential: p.id })}
                          data-qa={`rv-potential-${p.id}`}
                        >
                          <b>{p.label} potential</b>
                          <span>{p.blurb}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </NeoPanel>

          {/* Manager Narrative Questions */}
          <NeoPanel
            hud={editable ? `${prog.answered} of ${prog.needAnswers}+ required answers (10+ words each)` : 'Manager narrative'}
            title={`Written review for ${first}`}
            icon={<PenLine />}
            actions={
              <div className="pf-row">
                {acc.seeSelf && (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => setShowSelfRef((s) => !s)}
                  >
                    {showSelfRef ? <EyeOff /> : <Eye />}
                    {showSelfRef ? `Hide ${first}’s self answers` : `Show ${first}’s self answers`}
                  </button>
                )}
                <ReviewStatusChip status={review.manager.status} />
              </div>
            }
          >
            <div className="pf-rv-qlist">
              {questions.map((q, idx) => {
                const ans = review.manager.answers[q.id] ?? '';
                const selfAns = review.self.answers[q.id] ?? '';
                const w = wordsIn(ans);
                const done = w >= 10;
                const isFocused = activeQId === q.id;
                return (
                  <article
                    key={q.id}
                    className={cx('pf-rv-qcard', done && 'is-done', editable && isFocused && 'is-focused')}
                    onFocus={() => setActiveQId(q.id)}
                  >
                    <header className="pf-rv-qcard__head">
                      <span className="pf-rv-qcard__num">{String(idx + 1).padStart(2, '0')}</span>
                      <div className="pf-rv-qcard__titles">
                        <label className="pf-rv-qcard__prompt" htmlFor={`mgr-q-${q.id}`}>
                          {q.managerPrompt}
                        </label>
                        {q.help && <p className="pf-rv-qcard__help">{q.help}</p>}
                      </div>
                      <div className="pf-rv-qcard__meta">
                        <Chip size="sm" tone={done ? 'success' : w > 0 ? 'warning' : 'slate'} icon={done ? <Check /> : undefined}>
                          {w} {w === 1 ? 'word' : 'words'}
                          {editable && !done ? ' · 10+ needed' : ''}
                        </Chip>
                        {editable && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--ghost neo-btn--xs"
                            onClick={() => triggerNovaQuestion(q.id)}
                            data-qa={`rv-nova-mgr-q-${q.id}`}
                          >
                            <Sparkles /> Nova draft
                          </button>
                        )}
                      </div>
                    </header>

                    {showSelfRef && acc.seeSelf && selfAns.trim() && (
                      <div className="pf-rv-self-ref">
                        <span className="neo-hud">{first}’s self-reflection:</span>
                        <p>“{selfAns}”</p>
                      </div>
                    )}

                    {editable ? (
                      <textarea
                        id={`mgr-q-${q.id}`}
                        className="neo-textarea pf-rv-qcard__input"
                        rows={4}
                        value={ans}
                        onFocus={() => setActiveQId(q.id)}
                        onChange={(e) => updateAnswer(q.id, e.target.value)}
                        placeholder={`Write directly to ${first} — cite specific outcomes, behaviours and next steps…`}
                        data-qa={`rv-mgr-ans-${q.id}`}
                      />
                    ) : ans.trim() ? (
                      <div className="pf-rv-qcard__read">{ans}</div>
                    ) : (
                      <p className="pf-faint text-sm">No answer recorded.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </NeoPanel>

          {/* Manager Competency Ratings */}
          {tpl?.competencies !== false && (
            <NeoPanel
              hud={`5 core competencies · ${prog.rated}/${prog.ratingsNeeded} rated`}
              title={`Competency assessment for ${first}`}
              icon={<Sprout />}
            >
              <CompetencyRatingList
                values={review.manager.ratings}
                onChange={editable ? updateRating : undefined}
                readOnly={!editable}
                compareSelf={acc.seeSelf ? review.self.ratings : undefined}
                compareLevel={targetLevel?.expect}
                levelLabel={targetLevel?.id}
                subjectFirst={first}
              />
            </NeoPanel>
          )}

          {/* Private Manager Note (author only) */}
          {(acc.seePrivateNote || review.managerId === ctx.me.id) && (
            <NeoPanel
              hud="Confidential · Author only"
              title="Private manager note"
              icon={<Lock />}
              actions={
                <Chip size="sm" tone="slate" icon={<EyeOff />}>
                  Never shared with {first}
                </Chip>
              }
            >
              <div className="neo-field">
                <label className="neo-label" htmlFor="rv-mgr-private-note">
                  Calibration context, promotion timing or retention notes (visible only to you)
                </label>
                <textarea
                  id="rv-mgr-private-note"
                  className="neo-textarea"
                  rows={3}
                  disabled={!editable}
                  value={review.manager.privateNote ?? ''}
                  onChange={(e) => usePerf.getState().saveManager(review.id, { privateNote: e.target.value })}
                  placeholder={`Private notes about ${first}’s trajectory, scope or calibration…`}
                  data-qa="rv-mgr-private-note"
                />
              </div>
            </NeoPanel>
          )}
        </>
      }
      side={
        <>
          {/* Manager Progress & Release Actions */}
          <NeoPanel
            hud={review.release ? 'Review shared' : editable ? 'Autosaved locally' : 'Manager review'}
            title={review.release ? 'Shared with employee' : review.manager.status === 'submitted' ? 'Submitted for calibration' : 'Manager checklist'}
            icon={<CircleCheck />}
          >
            <div className="pf-rv-prog">
              <Ring value={review.manager.status === 'submitted' ? 1 : prog.value} size={84} stroke={7} label={`Manager review ${Math.round(prog.value * 100)}% complete`}>
                <span className="pf-rv-prog__pct">
                  {Math.round((review.manager.status === 'submitted' ? 1 : prog.value) * 100)}
                  <small>%</small>
                </span>
              </Ring>
              <div className="pf-rv-prog__info">
                <ReviewStatusChip status={review.manager.status} size="md" />
                <span className="pf-faint text-xs">
                  {review.manager.submittedAt
                    ? `Submitted ${relativeTime(review.manager.submittedAt, now)}`
                    : review.manager.updatedAt
                      ? `Saved ${relativeTime(review.manager.updatedAt, now)}`
                      : 'Not started'}
                </span>
                {mgrPhase && editable && review.manager.status !== 'submitted' && (
                  <Chip size="sm" tone={dueLabel(mgrPhase.end, now).tone} icon={<CalendarClock />}>
                    {dueLabel(mgrPhase.end, now).text}
                  </Chip>
                )}
              </div>
            </div>

            <ul className="pf-ck-check">
              <li data-done={prog.answered >= prog.needAnswers || undefined}>
                {prog.answered >= prog.needAnswers ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
                <span className="grow">Narrative answers (10+ words)</span>
                <b>
                  {prog.answered}/{prog.needAnswers}+
                </b>
              </li>
              <li data-done={!!review.manager.overall || undefined}>
                {review.manager.overall ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
                <span className="grow">Overall rating</span>
                <b>{review.manager.overall ? RATING[review.manager.overall].label : '—'}</b>
              </li>
              <li data-done={!!review.manager.potential || undefined}>
                {review.manager.potential ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
                <span className="grow">Potential level</span>
                <b className="capitalize">{review.manager.potential ?? '—'}</b>
              </li>
              {prog.ratingsNeeded > 0 && (
                <li data-done={prog.rated === prog.ratingsNeeded || undefined}>
                  {prog.rated === prog.ratingsNeeded ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
                  <span className="grow">Competencies rated</span>
                  <b>
                    {prog.rated}/{prog.ratingsNeeded}
                  </b>
                </li>
              )}
            </ul>

            <div className="pf-stack" style={{ marginTop: 10 }}>
              {editable && (
                <>
                  {prog.missing.length > 0 && (
                    <p className="pf-rv-missing">Still needed: {prog.missing.join(' · ')}</p>
                  )}
                  <button
                    type="button"
                    className={cx('neo-btn neo-btn--block', review.manager.status === 'submitted' ? 'neo-btn--soft' : 'neo-btn--plasma')}
                    disabled={!prog.ready}
                    onClick={onRequestSubmit}
                    data-qa="rv-submit-mgr-btn"
                  >
                    <Send /> {review.manager.status === 'submitted' ? 'Update submitted review' : 'Submit manager review'}
                  </button>
                </>
              )}

              {acc.release && review.manager.status === 'submitted' && !review.release && (
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--block"
                  onClick={onRequestRelease}
                  data-qa="rv-release-btn"
                >
                  <BadgeCheck /> Share review with {first}
                </button>
              )}

              {(ctx.me.id === review.managerId || ctx.me.id === review.employeeId) && (
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block"
                  onClick={onRequestSchedule}
                  data-qa="rv-schedule-btn"
                >
                  <CalendarClock /> {review.release?.conversationAt ? `1:1: ${dayLabel(review.release.conversationAt, now)}` : `Schedule 1:1 with ${first}`}
                </button>
              )}
            </div>
          </NeoPanel>

          <BiasCoachPanel
            answers={review.manager.answers}
            rating={review.manager.overall}
            evidence={evidence}
            cited={review.manager.cited}
            now={now}
            questionLabels={questionLabels}
            onApplyRewrite={editable ? (qId, next) => updateAnswer(qId, next) : undefined}
          />

          <EvidenceDrawer
            ctx={ctx}
            subjectId={review.employeeId}
            evidence={evidence}
            cited={review.manager.cited}
            canCite={editable}
            onToggleCite={toggleCite}
            onInsertSnippet={editable ? insertSnippet : undefined}
            activeQuestionPrompt={activePrompt}
          />
        </>
      }
    />
  );
}

/* ═════════════════════════ 3 · 360° & PEERS TAB ═════════════════════════ */

function PeersTab({
  ctx,
  review,
  cycle,
  acc,
  now,
  data,
  peerItems,
  upwardItems,
  themes,
  onAnswerRequest,
  onDeclineRequest,
}: {
  ctx: PerfCtx;
  review: Review;
  cycle: Cycle;
  acc: ReviewAccess;
  now: number;
  data: PerfData;
  peerItems: CycleFeedback[];
  upwardItems: CycleFeedback[];
  themes: PeerThemes;
  onAnswerRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
}) {
  const first = ctx.first(review.employeeId);
  const isSelf = acc.role === 'employee';
  const isMgrOrAdmin = review.managerId === ctx.me.id || ctx.isAdmin;
  const peerWindowOpen = canAnswerPeer(cycle, now);
  const peerPhase = getPhase(cycle, 'peer');

  const lockedPeers = useMemo(
    () => peerItems.filter((f) => f.status === 'requested' || f.status === 'submitted'),
    [peerItems],
  );
  const proposedPeers = useMemo(() => peerItems.filter((f) => f.status === 'proposed'), [peerItems]);
  const submittedPeers = useMemo(() => peerItems.filter((f) => f.status === 'submitted'), [peerItems]);

  /* State for nominating peers (`nominatePeers`) */
  const [selectedPeers, setSelectedPeers] = useState<string[]>(() =>
    peerItems.filter((f) => f.status !== 'declined').map((f) => f.authorId),
  );
  useEffect(() => {
    setSelectedPeers(peerItems.filter((f) => f.status !== 'declined').map((f) => f.authorId));
  }, [peerItems]);

  /* State for manager approving proposed nominations (`approveNominations`) */
  const [keepProposed, setKeepProposed] = useState<string[]>(() => proposedPeers.map((f) => f.authorId));
  const [extraApprovePeers, setExtraApprovePeers] = useState<string[]>([]);
  useEffect(() => {
    setKeepProposed(proposedPeers.map((f) => f.authorId));
  }, [proposedPeers]);

  /* Eligible peer candidates (everyone with Performance access except the employee & their manager) */
  const candidateUsers = useMemo(
    () => ctx.people.filter((u) => u.id !== review.employeeId && u.id !== review.managerId),
    [ctx.people, review.employeeId, review.managerId],
  );

  /* Suggested peers based on recent feedback/kudos or same department */
  const suggestedPeers = useMemo(() => {
    const recentAuthors = new Set(
      data.feedback
        .filter((f) => f.toId === review.employeeId || f.fromId === review.employeeId)
        .map((f) => (f.toId === review.employeeId ? f.fromId : f.toId)),
    );
    const subj = ctx.user(review.employeeId);
    return candidateUsers
      .filter((u) => !selectedPeers.includes(u.id))
      .sort(
        (a, b) =>
          Number(recentAuthors.has(b.id)) - Number(recentAuthors.has(a.id)) ||
          Number(b.department === subj?.department) - Number(a.department === subj?.department) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 5);
  }, [candidateUsers, data.feedback, review.employeeId, ctx, selectedPeers]);

  /* Viewer's own pending request for this subject in this cycle */
  const myPendingRequest = useMemo(
    () =>
      [...peerItems, ...upwardItems].find(
        (f) => f.authorId === ctx.me.id && f.status === 'requested',
      ),
    [peerItems, upwardItems, ctx.me.id],
  );

  const canNominate = peerWindowOpen && (isSelf || isMgrOrAdmin);

  const handleSaveNominations = () => {
    const res = usePerf.getState().nominatePeers(review.id, selectedPeers);
    report(res);
  };

  const handleApproveNominations = () => {
    const res = usePerf.getState().approveNominations(review.id, keepProposed, extraApprovePeers);
    if (report(res)) setExtraApprovePeers([]);
  };

  /* Upward feedback access */
  const upAccess = useMemo(
    () => upwardAccess(ctx.v, ctx.users, review.employeeId, upwardItems, cycle.upwardMin),
    [ctx.v, ctx.users, review.employeeId, upwardItems, cycle.upwardMin],
  );
  const submittedUpward = useMemo(() => upwardItems.filter((f) => f.status === 'submitted'), [upwardItems]);

  return (
    <NeoHome
      sideLabel="360° roster & rules"
      main={
        <>
          {/* If the viewer owes peer/upward feedback to this person */}
          {myPendingRequest && (
            <NeoBanner
              tone="app"
              icon={<Send />}
              title={`${first} requested your ${myPendingRequest.kind === 'peer' ? 'peer' : 'upward'} feedback`}
              meta={dueLabel(myPendingRequest.dueAt, now).text}
              action={
                <div className="pf-row">
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => onDeclineRequest(myPendingRequest.id)}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => onAnswerRequest(myPendingRequest.id)}
                    data-qa="rv-write-360-now"
                  >
                    <Send /> Write feedback
                  </button>
                </div>
              }
            >
              {myPendingRequest.kind === 'peer'
                ? 'Share Start · Stop · Continue — takes about five minutes.'
                : 'Five quick statements on a 1–5 scale, pooled anonymously with your teammates.'}
            </NeoBanner>
          )}

          {/* Manager Approval Card when proposed nominations exist */}
          {isMgrOrAdmin && proposedPeers.length > 0 && (
            <NeoPanel
              hud={`Needs your approval · ${proposedPeers.length} nominated`}
              title={`Approve ${first}’s peer reviewers`}
              icon={<UserCheck />}
              className="pf-rv-approve"
              actions={
                <Chip size="sm" tone="warning">
                  2–4 peers total
                </Chip>
              }
            >
              <p className="pf-muted text-sm">
                {first} nominated {plural(proposedPeers.length, 'colleague')} for 360° feedback. Keep or adjust the list below, then approve to send their invitations.
              </p>

              <div className="pf-rv-nom-chips">
                {lockedPeers.map((f) => (
                  <div key={f.id} className="pf-rv-nom-chip is-locked">
                    <Who ctx={ctx} id={f.authorId} size={26} />
                    <Chip size="sm" tone={f.status === 'submitted' ? 'success' : 'app'}>
                      {f.status === 'submitted' ? 'Submitted' : 'Already requested'}
                    </Chip>
                  </div>
                ))}
                {proposedPeers.map((f) => {
                  const kept = keepProposed.includes(f.authorId);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={cx('pf-rv-nom-chip', kept ? 'is-kept' : 'is-dropped')}
                      onClick={() =>
                        setKeepProposed((prev) =>
                          prev.includes(f.authorId) ? prev.filter((x) => x !== f.authorId) : [...prev, f.authorId],
                        )
                      }
                      data-qa={`rv-approve-toggle-${f.authorId}`}
                    >
                      <Who ctx={ctx} id={f.authorId} size={26} />
                      <Chip size="sm" tone={kept ? 'warning' : 'slate'} icon={kept ? <Check /> : <X />}>
                        {kept ? 'Keep' : 'Skip'}
                      </Chip>
                    </button>
                  );
                })}
                {extraApprovePeers.map((uid) => (
                  <button
                    key={uid}
                    type="button"
                    className="pf-rv-nom-chip is-kept"
                    onClick={() => setExtraApprovePeers((prev) => prev.filter((x) => x !== uid))}
                  >
                    <Who ctx={ctx} id={uid} size={26} />
                    <Chip size="sm" tone="app" icon={<Plus />}>
                      Added
                    </Chip>
                  </button>
                ))}
              </div>

              <div className="pf-row pf-row--wrap" style={{ marginTop: 10 }}>
                <PeoplePicker
                  multiple
                  users={candidateUsers.filter(
                    (u) => !lockedPeers.some((f) => f.authorId === u.id) && !proposedPeers.some((f) => f.authorId === u.id),
                  )}
                  value={extraApprovePeers}
                  onChange={setExtraApprovePeers}
                  label="Add another peer reviewer"
                  trigger={(p) => (
                    <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--xs">
                      <UserPlus /> Add peer
                    </button>
                  )}
                />
                <span className="pf-faint text-xs">
                  Total active + approved: <b>{lockedPeers.length + keepProposed.length + extraApprovePeers.length}</b> (needs 2–4)
                </span>
                <span className="pf-spacer" />
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--sm"
                  onClick={handleApproveNominations}
                  data-qa="rv-approve-noms-btn"
                >
                  <UserCheck /> Approve & send requests
                </button>
              </div>
            </NeoPanel>
          )}

          {/* Nova 360° Theme Synthesis & Submitted Peer Feedback */}
          {acc.seePeers === 'none' ? (
            <NeoPanel
              hud="360° Peer feedback · Anonymized until release"
              title="Peer feedback is being collected"
              icon={<Users />}
            >
              <div className="pf-rv-peer-wait">
                <Ring
                  value={
                    peerItems.filter((f) => f.status !== 'declined').length
                      ? submittedPeers.length / peerItems.filter((f) => f.status !== 'declined').length
                      : 0
                  }
                  size={78}
                  stroke={7}
                  label={`${submittedPeers.length} peer responses in`}
                >
                  <span className="pf-rv-prog__pct">
                    {submittedPeers.length}/{peerItems.filter((f) => f.status !== 'declined').length}
                  </span>
                </Ring>
                <div className="pf-rv-peer-wait__text">
                  <b>
                    {submittedPeers.length
                      ? `${plural(submittedPeers.length, 'peer')} ${submittedPeers.length === 1 ? 'has' : 'have'} shared feedback so far`
                      : peerItems.length
                        ? 'Your nominated peers have been invited'
                        : 'Nominate 2–4 colleagues who worked closely with you this quarter'}
                  </b>
                  <p className="pf-muted text-sm">
                    To keep feedback candid and constructive, Nova’s synthesized themes and peer comments unlock together when your manager shares your completed review packet.
                  </p>
                </div>
              </div>
            </NeoPanel>
          ) : (
            <>
              {/* Nova Peer Themes */}
              <NeoPanel
                hud={`Nova 360° synthesis · ${themes.responses} submitted`}
                title="Peer feedback themes"
                icon={<Sparkles />}
                actions={
                  <Chip size="sm" tone={themes.responses > 0 ? 'app' : 'slate'}>
                    {themes.responses} {themes.responses === 1 ? 'response' : 'responses'}
                  </Chip>
                }
              >
                <p className="pf-rv-theme-summary">{themes.summary}</p>
                {(themes.strengths.length > 0 || themes.growth.length > 0) && (
                  <div className="pf-rv-themes-grid">
                    <div className="pf-rv-theme-col" data-kind="strengths">
                      <span className="neo-hud">Repeated strengths (Continue)</span>
                      {themes.strengths.length ? (
                        <ul>
                          {themes.strengths.map((s) => (
                            <li key={s.theme}>
                              <div className="pf-row">
                                <b>{s.theme}</b>
                                <Chip size="sm" tone="success">
                                  {s.count} of {themes.responses}
                                </Chip>
                              </div>
                              <p>“{s.quote}”</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pf-faint text-xs">No repeated strength pattern yet.</p>
                      )}
                    </div>
                    <div className="pf-rv-theme-col" data-kind="growth">
                      <span className="neo-hud">Growth themes (Start / Stop)</span>
                      {themes.growth.length ? (
                        <ul>
                          {themes.growth.map((g) => (
                            <li key={g.theme}>
                              <div className="pf-row">
                                <b>{g.theme}</b>
                                <Chip size="sm" tone="warning">
                                  {g.count} of {themes.responses}
                                </Chip>
                              </div>
                              <p>“{g.quote}”</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pf-faint text-xs">No repeated growth theme flagged.</p>
                      )}
                    </div>
                  </div>
                )}
              </NeoPanel>

              {/* Submitted Peer Responses */}
              <NeoPanel
                hud={acc.seePeers === 'named' ? 'Named view (Manager / People Ops)' : 'Respecting peer anonymity'}
                title={`Submitted peer feedback (${submittedPeers.length})`}
                icon={<Users />}
              >
                {submittedPeers.length > 0 ? (
                  <div className="pf-rv-peer-cards">
                    {submittedPeers.map((f, idx) => {
                      const showAuthor = peerAuthorVisible(acc, f, ctx.me.id);
                      const author = showAuthor ? ctx.user(f.authorId) : undefined;
                      return (
                        <article key={f.id} className="pf-rv-peer-card" data-qa={`rv-peer-card-${idx}`}>
                          <header className="pf-rv-peer-card__head">
                            {showAuthor && author ? (
                              <Who ctx={ctx} id={f.authorId} size={30} />
                            ) : (
                              <span className="pf-rv-anon-peer">
                                <span className="pf-rv-anon-peer__icon">
                                  <EyeOff />
                                </span>
                                <span>
                                  <b>Anonymous peer</b>
                                  <small>Colleague in {cycle.name}</small>
                                </span>
                              </span>
                            )}
                            <span className="pf-spacer" />
                            {f.highlight && (
                              <Chip size="sm" tone="violet" icon={COMP_ICON[f.highlight]}>
                                Strength: {COMPETENCY[f.highlight].label}
                              </Chip>
                            )}
                            {f.anonymous && showAuthor && (
                              <Chip size="sm" tone="slate" icon={<EyeOff />} title={`Anonymous to ${first}, visible to you as manager/admin`}>
                                Anon to {first}
                              </Chip>
                            )}
                          </header>

                          <div className="pf-rv-peer-card__lanes">
                            {f.continue && (
                              <div className="pf-rv-peer-lane" data-lane="continue">
                                <span className="neo-hud">Continue</span>
                                <p>{f.continue}</p>
                              </div>
                            )}
                            {f.start && (
                              <div className="pf-rv-peer-lane" data-lane="start">
                                <span className="neo-hud">Start</span>
                                <p>{f.start}</p>
                              </div>
                            )}
                            {f.stop && (
                              <div className="pf-rv-peer-lane" data-lane="stop">
                                <span className="neo-hud">Stop</span>
                                <p>{f.stop}</p>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <NeoEmpty compact icon={<Users />} title="No peer responses submitted yet">
                    Invited peers have until {peerPhase ? shortDate(peerPhase.end) : 'the peer deadline'} to share Start, Stop and Continue feedback.
                  </NeoEmpty>
                )}
              </NeoPanel>
            </>
          )}

          {/* Upward Feedback (if subject has upward requests in this cycle) */}
          {upwardItems.length > 0 && upAccess.allowed && (
            <NeoPanel
              hud={`Upward feedback · Pooled & anonymous (min ${cycle.upwardMin})`}
              title={`Direct reports’ upward feedback for ${first}`}
              icon={<TrendingUp />}
              actions={
                <Chip size="sm" tone={upAccess.visible ? 'success' : 'warning'} icon={<EyeOff />}>
                  {upAccess.count}/{upwardItems.length} answered
                </Chip>
              }
            >
              {upAccess.visible ? (
                <div className="pf-stack pf-gap-lg">
                  <ul className="pf-rv-upward-dims">
                    {UPWARD_DIMENSIONS.map((d) => {
                      const vals = submittedUpward.map((u) => u.scores?.[d.id]).filter((v): v is Score5 => !!v);
                      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                      return (
                        <li key={d.id} className="pf-rv-upward-dim">
                          <div className="pf-row">
                            <b>{d.label}</b>
                            <span className="pf-spacer" />
                            <span className="neo-mono">
                              <b>{avg.toFixed(1)}</b> / 5.0
                            </span>
                          </div>
                          <Bar value={avg / 5} label={`${d.short}: ${avg.toFixed(1)} of 5`} />
                        </li>
                      );
                    })}
                  </ul>

                  <div className="pf-rv-themes-grid">
                    <div className="pf-rv-theme-col" data-kind="strengths">
                      <span className="neo-hud">Keep doing (pooled)</span>
                      <ul>
                        {submittedUpward
                          .filter((u) => u.keep?.trim())
                          .map((u, i) => (
                            <li key={i}>
                              <p>“{u.keep}”</p>
                            </li>
                          ))}
                      </ul>
                    </div>
                    <div className="pf-rv-theme-col" data-kind="growth">
                      <span className="neo-hud">Change (pooled)</span>
                      <ul>
                        {submittedUpward
                          .filter((u) => u.change?.trim())
                          .map((u, i) => (
                            <li key={i}>
                              <p>“{u.change}”</p>
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <NeoEmpty compact icon={<ShieldCheck />} title={`Protected until ${cycle.upwardMin}+ direct reports respond`}>
                  {upAccess.count} of {upwardItems.length} direct reports have answered so far. Upward feedback is only ever shown in aggregate once at least {cycle.upwardMin} reports submit.
                </NeoEmpty>
              )}
            </NeoPanel>
          )}
        </>
      }
      side={
        <>
          {/* Nominate Peers & Current Roster */}
          <NeoPanel
            hud={`2–4 peer reviewers · ${peerPhase ? `Due ${shortDate(peerPhase.end)}` : cycle.name}`}
            title={isSelf ? 'Your peer reviewers' : `${first}’s peer reviewers`}
            icon={<UserPlus />}
          >
            {peerItems.length > 0 ? (
              <ul className="pf-rv-roster">
                {peerItems.map((f) => {
                  const statusMeta: Record<CycleFeedback['status'], { label: string; tone: Tone }> = {
                    proposed: { label: 'Awaiting approval', tone: 'warning' },
                    requested: { label: 'Invited', tone: 'app' },
                    submitted: { label: 'Submitted', tone: 'success' },
                    declined: { label: 'Declined', tone: 'slate' },
                  };
                  const sm = statusMeta[f.status];
                  return (
                    <li key={f.id} className="pf-rv-roster__item" data-status={f.status}>
                      <Who ctx={ctx} id={f.authorId} size={30} />
                      <span className="pf-spacer" />
                      <Chip size="sm" tone={sm.tone}>
                        {sm.label}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="pf-muted text-sm">No peer reviewers nominated yet for {cycleShort(cycle)}.</p>
            )}

            {canNominate && (
              <div className="pf-rv-nominate-box">
                <div className="pf-row">
                  <span className="neo-hud">Select 2–4 peers</span>
                  <span className="pf-spacer" />
                  <span className="neo-mono text-xs">{selectedPeers.length}/4 chosen</span>
                </div>

                <div className="pf-rv-selected-peers">
                  {selectedPeers.map((uid) => {
                    const isLocked = lockedPeers.some((f) => f.authorId === uid);
                    return (
                      <span key={uid} className="pf-rv-sel-pill">
                        <span>{ctx.name(uid)}</span>
                        {!isLocked && (
                          <button
                            type="button"
                            aria-label={`Remove ${ctx.name(uid)}`}
                            onClick={() => setSelectedPeers((prev) => prev.filter((x) => x !== uid))}
                          >
                            <X />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>

                {suggestedPeers.length > 0 && selectedPeers.length < 4 && (
                  <div className="pf-rv-quick-peers">
                    <span className="pf-faint text-xs">Quick add:</span>
                    {suggestedPeers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => setSelectedPeers((prev) => [...new Set([...prev, u.id])].slice(0, 4))}
                        data-qa={`rv-quick-peer-${u.id}`}
                      >
                        <Plus /> {u.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="pf-row" style={{ marginTop: 8 }}>
                  <PeoplePicker
                    multiple
                    users={candidateUsers}
                    value={selectedPeers}
                    onChange={(ids) => {
                      const lockedIds = lockedPeers.map((f) => f.authorId);
                      const merged = [...new Set([...lockedIds, ...ids])].slice(0, 4);
                      setSelectedPeers(merged);
                    }}
                    label="Choose 2–4 peer reviewers"
                    trigger={(p) => (
                      <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--xs" data-qa="rv-pick-peers">
                        <UserPlus /> Browse directory
                      </button>
                    )}
                  />
                  <span className="pf-spacer" />
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    disabled={selectedPeers.length < 2 || selectedPeers.length > 4}
                    onClick={handleSaveNominations}
                    data-qa="rv-save-noms-btn"
                  >
                    <Send /> {isSelf && !ctx.isAdmin && review.managerId ? 'Send for approval' : 'Send peer requests'}
                  </button>
                </div>
              </div>
            )}
          </NeoPanel>

          {/* Cycle privacy & anonymity rules */}
          <NeoPanel hud="How 360° works" title="Privacy & attribution" icon={<ShieldCheck />}>
            <ul className="pf-rv-rules-list">
              <li>
                {cycle.peerAnonymous ? <EyeOff aria-hidden="true" /> : <Users aria-hidden="true" />}
                <div>
                  <b>{cycle.peerAnonymous ? 'Peers can answer anonymously' : 'Signed peer feedback'}</b>
                  <p>
                    {cycle.peerAnonymous
                      ? `Peer authors can hide their name from ${first}. Their manager and People Ops still see attribution for context.`
                      : 'Peer feedback is signed with each colleague’s name.'}
                  </p>
                </div>
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                <div>
                  <b>Upward feedback threshold ({cycle.upwardMin}+)</b>
                  <p>Direct-report upward feedback is always pooled and only shown once {cycle.upwardMin} or more reports respond.</p>
                </div>
              </li>
            </ul>
          </NeoPanel>
        </>
      }
    />
  );
}

/* ═════════════════════════ 4 · SUMMARY & PACKET TAB ═════════════════════════ */

function PacketTab({
  ctx,
  review,
  cycle,
  period,
  tpl,
  acc,
  now,
  data,
  evidence,
  themes,
  onAcknowledge,
  onRelease,
  onSchedule,
  onSwitchTab,
}: {
  ctx: PerfCtx;
  review: Review;
  cycle: Cycle;
  period: Period;
  tpl?: ReviewTemplate;
  acc: ReviewAccess;
  now: number;
  data: PerfData;
  evidence: EvidenceItem[];
  themes: PeerThemes;
  onAcknowledge: () => void;
  onRelease: () => void;
  onSchedule: () => void;
  onSwitchTab: (tab: ReviewTab) => void;
}) {
  const first = ctx.first(review.employeeId);
  const subject = ctx.user(review.employeeId);
  const mgrFirst = review.managerId ? ctx.first(review.managerId) : 'Manager';
  const isSelf = acc.role === 'employee';
  const questions = tpl?.questions ?? [];

  const lv = levelOf(data.levels[review.employeeId]);
  const ladder = lv?.ladder ?? LADDER[defaultLadderFor(subject?.department)];
  const currentLevel = lv?.level ?? ladder.levels[0];
  const nextLevel = lv?.next ?? null;

  /* Calibration badge */
  const cal = review.calibration;
  const calBox = cal ? BOX_META[boxKey(cal.performance, cal.potential)] : null;
  const showCal = !!cal && (!isSelf || !!review.release);

  /* Build Radar Series (Self vs Manager vs Level Bar) */
  const radarSeries = useMemo<RadarSeries[]>(() => {
    const out: RadarSeries[] = [];
    if (acc.seeSelf && Object.keys(review.self.ratings).length > 0) {
      out.push({
        id: 'self',
        label: isSelf ? 'Your self-rating' : `${first} (self)`,
        sub: cycleShort(cycle),
        tone: 'self',
        values: review.self.ratings,
      });
    }
    if (acc.seeManager && Object.keys(review.manager.ratings).length > 0) {
      out.push({
        id: 'manager',
        label: `${mgrFirst} (manager)`,
        sub: review.manager.overall ? RATING[review.manager.overall].label : cycleShort(cycle),
        tone: 'manager',
        values: review.manager.ratings,
      });
    }
    if (nextLevel) {
      out.push({
        id: 'next',
        label: `${nextLevel.id} expectation`,
        sub: nextLevel.title,
        tone: 'next',
        values: nextLevel.expect,
        outline: true,
      });
    } else if (currentLevel) {
      out.push({
        id: 'level',
        label: `${currentLevel.id} expectation`,
        sub: currentLevel.title,
        tone: 'level',
        values: currentLevel.expect,
        outline: true,
      });
    }
    return out;
  }, [acc.seeSelf, acc.seeManager, review.self.ratings, review.manager.ratings, review.manager.overall, isSelf, first, mgrFirst, cycle, nextLevel, currentLevel]);

  /* Quarter OKRs & Trajectory selector */
  const subjectKrs = useMemo<KeyResult[]>(() => {
    const ownedObjIds = new Set(
      data.objectives
        .filter((o) => o.periodId === period.id && (o.ownerId === review.employeeId || o.coOwnerIds.includes(review.employeeId)))
        .map((o) => o.id),
    );
    const objById = new Map(data.objectives.map((o) => [o.id, o]));
    return data.keyResults.filter(
      (k) =>
        (k.ownerId === review.employeeId || ownedObjIds.has(k.objectiveId)) &&
        objById.get(k.objectiveId)?.periodId === period.id,
    );
  }, [data.objectives, data.keyResults, period.id, review.employeeId]);

  const [selectedKrId, setSelectedKrId] = useState<string | null>(subjectKrs[0]?.id ?? null);
  useEffect(() => {
    if (!subjectKrs.some((k) => k.id === selectedKrId)) {
      setSelectedKrId(subjectKrs[0]?.id ?? null);
    }
  }, [subjectKrs, selectedKrId]);
  const activeKr = subjectKrs.find((k) => k.id === selectedKrId) ?? subjectKrs[0];

  /* All cited evidence across self + manager */
  const allCitedIds = useMemo(
    () => new Set([...(acc.seeSelf ? review.self.cited : []), ...(acc.seeManager ? review.manager.cited : [])]),
    [acc.seeSelf, acc.seeManager, review.self.cited, review.manager.cited],
  );
  const citedItems = useMemo(
    () => evidence.filter((e) => allCitedIds.has(e.id)),
    [evidence, allCitedIds],
  );

  return (
    <div className="pf-stack pf-gap-lg" data-qa="rv-packet-view">
      {/* Packet Executive Summary Hero */}
      <section className="neo-card pf-rv-packet-hero neo-spot" aria-label="Review packet summary">
        <div className="pf-rv-packet-hero__main">
          <div className="pf-rv-packet-hero__kpis">
            <div className="pf-rv-kpi">
              <span className="neo-hud">Self-reflection</span>
              <ReviewStatusChip status={review.self.status} size="md" />
              <small className="pf-faint">
                {review.self.submittedAt ? `Submitted ${shortDate(review.self.submittedAt)}` : 'In progress'}
              </small>
            </div>

            <div className="pf-rv-kpi">
              <span className="neo-hud">Manager review</span>
              {acc.seeManager && review.manager.overall ? (
                <RatingChip rating={review.manager.overall} size="md" />
              ) : (
                <ReviewStatusChip status={review.manager.status} size="md" />
              )}
              <small className="pf-faint">
                {review.manager.submittedAt
                  ? `By ${mgrFirst} · ${shortDate(review.manager.submittedAt)}`
                  : `Assigned to ${mgrFirst}`}
              </small>
            </div>

            {showCal && calBox && cal && (
              <div className="pf-rv-kpi" data-qa="rv-cal-badge">
                <span className="neo-hud">Calibrated 9-box</span>
                <Chip tone={calBox.tone as Tone} icon={<Grid3x3 />}>
                  {calBox.label} ({cal.performance}×{cal.potential})
                </Chip>
                <small className="pf-faint">{cal.note ? `“${cal.note}”` : calBox.blurb}</small>
              </div>
            )}

            <div className="pf-rv-kpi">
              <span className="neo-hud">Release & 1:1</span>
              {review.release ? (
                <Chip
                  tone={review.release.acknowledgedAt ? 'success' : 'app'}
                  icon={review.release.acknowledgedAt ? <CircleCheck /> : <BadgeCheck />}
                >
                  {review.release.acknowledgedAt ? 'Acknowledged' : 'Shared — awaiting ack'}
                </Chip>
              ) : (
                <Chip tone="slate" icon={<Clock />}>
                  Not shared yet
                </Chip>
              )}
              <small className="pf-faint">
                {review.release?.conversationAt
                  ? `1:1 ${dayLabel(review.release.conversationAt, now)}`
                  : review.release
                    ? `Shared ${shortDate(review.release.releasedAt)}`
                    : 'Shares in release phase'}
              </small>
            </div>
          </div>

          {review.release?.employeeComment && (
            <div className="pf-rv-emp-comment" data-qa="rv-emp-comment">
              <span className="neo-hud">
                <Check aria-hidden="true" /> {first}’s acknowledgment note
              </span>
              <p>“{review.release.employeeComment}”</p>
            </div>
          )}
        </div>

        <div className="pf-rv-packet-hero__actions">
          {acc.acknowledge && (
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onAcknowledge} data-qa="rv-packet-ack">
              <BadgeCheck /> Acknowledge & comment
            </button>
          )}
          {acc.release && review.manager.status === 'submitted' && !review.release && (
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onRelease} data-qa="rv-packet-release">
              <Send /> Share packet with {first}
            </button>
          )}
          {(ctx.me.id === review.managerId || ctx.me.id === review.employeeId) && (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={onSchedule} data-qa="rv-packet-schedule">
              <CalendarClock /> {review.release?.conversationAt ? 'Reschedule 1:1' : 'Schedule 1:1 conversation'}
            </button>
          )}
        </div>
      </section>

      {/* Competency Radar + Side-by-Side Score Matrix */}
      <NeoPanel
        hud="5 core competencies · Self vs Manager vs Level bar"
        title="Competency radar & alignment"
        icon={<RadarIcon />}
        actions={
          <Link
            to={isSelf ? '/performance/growth' : `/performance/growth?u=${review.employeeId}`}
            className="neo-btn neo-btn--ghost neo-btn--xs"
          >
            Career ladder <ArrowRight />
          </Link>
        }
      >
        <div className="pf-rv-radar-split">
          <div className="pf-rv-radar-split__chart">
            <Radar
              series={radarSeries}
              basisId={acc.seeManager && Object.keys(review.manager.ratings).length ? 'manager' : 'self'}
              targetId={nextLevel ? 'next' : 'level'}
              label={`${subject?.name ?? first} competency radar`}
            />
          </div>

          <div className="pf-rv-radar-split__table">
            <div className="neo-hud">Side-by-side competency scores</div>
            <div className="pf-rv-matrix" role="table" aria-label="Competency ratings comparison">
              <div className="pf-rv-matrix__head" role="row">
                <span role="columnheader">Competency</span>
                <span role="columnheader">Self</span>
                <span role="columnheader">Manager</span>
                <span role="columnheader">{nextLevel ? nextLevel.id : currentLevel.id} bar</span>
              </div>
              {COMPETENCIES.map((c) => {
                const sVal = acc.seeSelf ? review.self.ratings[c.id] : undefined;
                const mVal = acc.seeManager ? review.manager.ratings[c.id] : undefined;
                const barVal = (nextLevel ?? currentLevel).expect[c.id];
                const diff = mVal !== undefined && sVal !== undefined ? mVal - sVal : null;
                return (
                  <div key={c.id} className="pf-rv-matrix__row" role="row">
                    <span className="pf-rv-matrix__comp" role="cell">
                      {COMP_ICON[c.id]}
                      <b>{c.label}</b>
                    </span>
                    <span role="cell" className="neo-mono">
                      {sVal ? `${sVal} · ${SCORE_LABEL[sVal]}` : '—'}
                    </span>
                    <span role="cell" className="neo-mono">
                      {mVal ? (
                        <span className="pf-row">
                          <b>
                            {mVal} · {SCORE_LABEL[mVal]}
                          </b>
                          {diff !== null && diff !== 0 && (
                            <small className={cx('pf-rv-comp__delta', diff > 0 ? 'is-up' : 'is-down')}>
                              {diff > 0 ? `+${diff}` : diff}
                            </small>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span role="cell" className="neo-mono pf-faint">
                      {barVal} · {SCORE_LABEL[barVal]}
                    </span>
                  </div>
                );
              })}
            </div>

            {themes.responses > 0 && acc.seePeers !== 'none' && (
              <div className="pf-rv-matrix__peers">
                <span className="neo-hud">360° Peer competency highlights</span>
                <div className="pf-row pf-row--wrap">
                  {COMPETENCY_IDS.filter((id) => themes.highlights[id]).map((id) => (
                    <Chip key={id} size="sm" tone="violet" icon={COMP_ICON[id]}>
                      {COMPETENCY[id].label} × {themes.highlights[id]}
                    </Chip>
                  ))}
                  {Object.keys(themes.highlights).length === 0 && (
                    <span className="pf-faint text-xs">{themes.summary}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </NeoPanel>

      {/* Side-by-Side Narrative Comparison (Self vs Manager) */}
      <NeoPanel
        hud={`${questions.length} template prompts`}
        title="Side-by-side narrative — Self-reflection vs Manager review"
        icon={<FileText />}
        actions={
          <div className="pf-row">
            {isSelf && canEditSelf(cycle, review, now) && (
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onSwitchTab('self')}>
                <NotebookPen /> Edit self-reflection
              </button>
            )}
            {review.managerId === ctx.me.id && canWriteManager(cycle, review, now) && (
              <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => onSwitchTab('manager')}>
                <PenLine /> Edit manager review
              </button>
            )}
          </div>
        }
      >
        <div className="pf-rv-compare-list">
          {questions.map((q, idx) => {
            const selfAns = acc.seeSelf ? review.self.answers[q.id] : undefined;
            const mgrAns = acc.seeManager ? review.manager.answers[q.id] : undefined;
            return (
              <article key={q.id} className="pf-rv-compare-card">
                <header className="pf-rv-compare-card__head">
                  <span className="pf-rv-qcard__num">{String(idx + 1).padStart(2, '0')}</span>
                  <div>
                    <h4 className="pf-rv-qcard__prompt">{q.prompt}</h4>
                    {q.managerPrompt !== q.prompt && (
                      <span className="pf-faint text-xs">Manager prompt: {q.managerPrompt}</span>
                    )}
                  </div>
                </header>
                <div className="pf-rv-compare-card__cols">
                  <div className="pf-rv-compare-col" data-side="self">
                    <div className="pf-row">
                      <span className="neo-hud">{first}’s self-reflection</span>
                      <span className="pf-spacer" />
                      <ReviewStatusChip status={review.self.status} />
                    </div>
                    {selfAns?.trim() ? (
                      <p>{selfAns}</p>
                    ) : (
                      <p className="pf-faint text-sm">
                        {!acc.seeSelf ? 'Private draft until submitted.' : 'No answer written yet.'}
                      </p>
                    )}
                  </div>

                  <div className="pf-rv-compare-col" data-side="manager">
                    <div className="pf-row">
                      <span className="neo-hud">{mgrFirst}’s manager review</span>
                      <span className="pf-spacer" />
                      {acc.seeManager ? (
                        <ReviewStatusChip status={review.manager.status} />
                      ) : (
                        <Chip size="sm" tone="slate" icon={<Lock />}>
                          Shared on release
                        </Chip>
                      )}
                    </div>
                    {mgrAns?.trim() ? (
                      <p>{mgrAns}</p>
                    ) : (
                      <p className="pf-faint text-sm">
                        {!acc.seeManager
                          ? `Shared when ${mgrFirst} releases your review packet.`
                          : 'No manager response written for this prompt yet.'}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </NeoPanel>

      {/* Quarter OKRs & Trajectory Chart */}
      <NeoPanel
        hud={`${period.label} OKRs · ${subjectKrs.length} key results`}
        title={`${isSelf ? 'Your' : `${first}’s`} key result trajectories`}
        icon={<Target />}
        actions={
          <Link to="/performance/okrs" className="neo-btn neo-btn--ghost neo-btn--xs">
            All OKRs <ArrowRight />
          </Link>
        }
      >
        {subjectKrs.length > 0 && activeKr ? (
          <div className="pf-rv-okr-grid">
            <ul className="pf-rv-kr-list" role="listbox" aria-label="Select a key result to view trajectory">
              {subjectKrs.map((kr) => {
                const st = krStatus(kr, period, now);
                const prog = krProgress(kr);
                const active = kr.id === activeKr.id;
                return (
                  <li key={kr.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cx('pf-rv-kr-item', active && 'is-active')}
                      onClick={() => setSelectedKrId(kr.id)}
                      data-qa={`rv-kr-select-${kr.id}`}
                    >
                      <OkrRing value={prog} status={st} size={42} />
                      <div className="pf-rv-kr-item__text">
                        <b className="truncate">{kr.title}</b>
                        <span>
                          {formatValue(kr, kr.current)} · target {formatRange(kr)}
                        </span>
                      </div>
                      <StatusChip status={st} />
                      <ChevronRight className="pf-rv-kr-item__chev" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="pf-rv-traj-stage">
              <div className="pf-rv-traj-stage__head">
                <div>
                  <span className="neo-hud">{period.label} Trajectory & forecast</span>
                  <h4>{activeKr.title}</h4>
                </div>
                <div className="pf-row">
                  <StatusChip status={krStatus(activeKr, period, now)} />
                  <Link to={`/performance/okrs/${activeKr.objectiveId}`} className="neo-btn neo-btn--ghost neo-btn--xs">
                    Open OKR <ArrowRight />
                  </Link>
                </div>
              </div>
              <Trajectory kr={activeKr} period={period} now={now} height={220} />
            </div>
          </div>
        ) : (
          <NeoEmpty compact icon={<Target />} title={`No individual key results in ${period.label}`}>
            When {first} owns or contributes to key results in {period.label}, their check-in trajectories appear here.
          </NeoEmpty>
        )}
      </NeoPanel>

      {/* Cited Evidence & Quarter Highlights */}
      {citedItems.length > 0 && (
        <NeoPanel
          hud={`Grounded in ${citedItems.length} cited highlights`}
          title="Evidence cited in this packet"
          icon={<Paperclip />}
        >
          <div className="pf-rv-cited-grid">
            {citedItems.map((e) => (
              <div key={e.id} className="pf-rv-cited-card">
                <div className="pf-row">
                  <span className="neo-hud">{e.sourceLabel}</span>
                  <span className="pf-spacer" />
                  <span className="neo-mono pf-faint text-xs">{shortDate(e.at)}</span>
                </div>
                <b>{e.title}</b>
                {e.detail && e.detail !== e.title && <p className="pf-muted text-xs">{e.detail}</p>}
              </div>
            ))}
          </div>
        </NeoPanel>
      )}
    </div>
  );
}
