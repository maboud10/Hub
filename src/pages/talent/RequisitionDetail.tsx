/**
 * Requisition detail — the cockpit for one role: lifecycle rail, permission-
 * aware actions (submit, approve, hold, reopen, close, edit, source), and
 * sections for overview, ranked candidates, the decoded JD, the interview
 * loop and the activity log. Tabs on desktop, accordion on phones.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Archive,
  ArrowLeft,
  Award,
  BrainCircuit,
  Briefcase,
  Building2,
  CalendarClock,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  FilePen,
  FileText,
  Gauge,
  Gavel,
  Handshake,
  History,
  Laptop,
  Layers,
  ListChecks,
  LoaderCircle,
  Lock,
  MapPin,
  MessagesSquare,
  PartyPopper,
  Pause,
  Pencil,
  PenLine,
  Play,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Signature,
  SquareKanban,
  Target,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityKind, Application, Interview, Offer, Requisition, StageId, TalentActivity } from '@/talent/types';
import { APPLICATION_STATUS_LABEL, EMPLOYMENT_LABEL, SENIORITY_LABEL, STAGE_BY_ID, WORK_MODEL_LABEL } from '@/talent/constants';
import { canApproveRequisition, canEditRequisition } from '@/talent/access';
import { useTalent } from '@/talent/store';
import { computeFunnel, useTalentCaps, useTalentLookups, useTalentScope, useTalentViewer } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { analyzeJD } from '@/talent/ai/engine';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { EmptyState } from '@/components/ui/primitives';
import {
  CandidateAvatar,
  EngineBadge,
  MatchRing,
  NextActionButton,
  OfferStatusBadge,
  PeopleStack,
  PersonChip,
  PriorityBadge,
  ReqStatusBadge,
  SampleTag,
  StageBadge,
} from './components/shared';
import { Funnel } from './components/Funnel';
import { JDHealth, JDInput, JDScanning, JDXray, SearchDNA, SkillEditor, useJDAnalysis } from './components/jd';
import { daysInStage, fmtDay, fmtRelativeDay, slaState } from './components/format';
import { CompRange, KpiTile, ReqApprovalFacts, ReqPipelineBar, SeatMeter } from './reqs/pieces';
import { InterviewPlanEditor, InterviewPlanView, PlanSummary } from './reqs/InterviewPlan';
import { ReqEditModal } from './reqs/ReqEditModal';
import { useNoteDialog } from './reqs/NoteDialog';
import { avgMatch, daysOpen, isActiveOffer, planInterviewers, DAY } from './reqs/helpers';

type SectionId = 'overview' | 'candidates' | 'jd' | 'plan' | 'activity';
const SECTION_IDS: SectionId[] = ['overview', 'candidates', 'jd', 'plan', 'activity'];

export function RequisitionDetail() {
  const { id = '' } = useParams();
  const scope = useTalentScope();
  const req = scope.requisitions.find((r) => r.id === id);
  const exists = useTalent((s) => s.requisitions.some((r) => r.id === id));
  if (!req) return <ReqMissing exists={exists} />;
  return <ReqDetailBody key={req.id} req={req} apps={scope.applications} />;
}

function ReqMissing({ exists }: { exists: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="card card--flat tl-req-missing">
      <EmptyState
        icon={exists ? <Lock /> : <Briefcase />}
        title={exists ? 'You don’t have access to this requisition' : 'Requisition not found'}
        action={
          <button type="button" className="btn btn--sm" onClick={() => navigate('/talent/requisitions')}>
            <ArrowLeft /> All requisitions
          </button>
        }
      >
        {exists
          ? 'Requisitions are visible to recruiters and to the hiring team (hiring manager, recruiter and interviewers).'
          : 'It may have been removed, or the link is mistyped.'}
      </EmptyState>
    </div>
  );
}

// ───────────────────────── body ─────────────────────────
function ReqDetailBody({ req, apps: allApps }: { req: Requisition; apps: Application[] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const now = useNow(60_000);
  const isMobile = useIsMobile();
  const note = useNoteDialog();
  const interviewsAll = useTalent((s) => s.interviews);
  const offersAll = useTalent((s) => s.offers);
  const activityAll = useTalent((s) => s.activity);

  const apps = useMemo(() => allApps.filter((a) => a.requisitionId === req.id), [allApps, req.id]);
  const interviews = useMemo(() => interviewsAll.filter((i) => i.requisitionId === req.id), [interviewsAll, req.id]);
  const offers = useMemo(() => offersAll.filter((o) => o.requisitionId === req.id).sort((a, b) => b.createdAt - a.createdAt), [offersAll, req.id]);
  const activity = useMemo(() => activityAll.filter((a) => a.requisitionId === req.id).sort((a, b) => b.at - a.at), [activityAll, req.id]);

  const initialTab = params.get('tab') as SectionId | null;
  const [tab, setTab] = useState<SectionId>(initialTab && SECTION_IDS.includes(initialTab) ? initialTab : 'overview');
  const [openSections, setOpenSections] = useState<Set<SectionId>>(() => new Set([initialTab && SECTION_IDS.includes(initialTab) ? initialTab : 'overview']));
  const [stageFilter, setStageFilter] = useState<StageId | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);

  const canEdit = viewer ? canEditRequisition(viewer, req) : { ok: false, reason: 'Sign in first.' };
  const approval = viewer ? canApproveRequisition(viewer, req) : { ok: false, reason: 'Sign in first.' };
  const active = apps.filter((a) => a.status === 'active');
  const activeOffer = offers.find(isActiveOffer);
  const store = useTalent.getState;

  const showSection = (s: SectionId) => {
    setTab(s);
    setOpenSections((prev) => new Set(prev).add(s));
  };

  // ── actions
  const approve = () =>
    note.ask({
      title: 'Approve headcount',
      subtitle: `${req.title} · ${req.department}`,
      icon: <ShieldCheck />,
      tone: 'success',
      confirmLabel: 'Approve & open',
      label: 'Approval note',
      placeholder: 'e.g. Budgeted in the Q4 plan; band confirmed with Finance.',
      body: <ReqApprovalFacts req={req} />,
      onConfirm: (text) => toast.result(store().approveRequisition(req.id, text || undefined)),
    });
  const hold = () =>
    note.ask({
      title: 'Put on hold',
      subtitle: req.title,
      icon: <Pause />,
      confirmLabel: 'Put on hold',
      label: 'Why pause?',
      placeholder: 'e.g. Budget review until January.',
      body: <p className="muted text-sm">Candidates stay where they are and the team is notified. Reopen any time.</p>,
      onConfirm: (text) => toast.result(store().setRequisitionStatus(req.id, 'on-hold', text || undefined)),
    });
  const close = () =>
    note.ask({
      title: 'Close requisition',
      subtitle: req.title,
      icon: <Archive />,
      tone: 'danger',
      confirmLabel: 'Close requisition',
      label: 'Reason',
      placeholder: 'e.g. Role no longer needed after the re-org.',
      body: active.length ? (
        <p className="tl-req-warn">
          <ShieldAlert aria-hidden="true" /> {active.length} active candidate{active.length === 1 ? '' : 's'} will stay in the pipeline. Close them out kindly afterwards.
        </p>
      ) : (
        <p className="muted text-sm">No new candidates can be added once it’s closed.</p>
      ),
      onConfirm: (text) => toast.result(store().setRequisitionStatus(req.id, 'closed', text || undefined)),
    });
  const reopen = () => toast.result(store().setRequisitionStatus(req.id, 'open'));
  const submit = () => toast.result(store().submitRequisition(req.id));
  const openEdit = () => {
    setEditKey((k) => k + 1);
    setEditOpen(true);
  };

  const actions: ReactNode[] = [];
  if (req.status === 'draft' && canEdit.ok)
    actions.push(
      <button key="submit" type="button" className="btn btn--primary" onClick={submit}>
        <Send /> Submit for approval
      </button>,
    );
  if (req.status === 'pending-approval') {
    if (approval.ok)
      actions.push(
        <button key="approve" type="button" className="btn btn--primary" onClick={approve}>
          <ShieldCheck /> Approve headcount
        </button>,
      );
    else if (caps.manage)
      actions.push(
        <span key="approve" className="tl-req-tip" data-tip={approval.reason}>
          <button type="button" className="btn" disabled aria-describedby="tl-req-approve-why">
            <ShieldCheck /> Approve headcount
          </button>
        </span>,
      );
  }
  if (caps.source && (req.status === 'open' || req.status === 'on-hold'))
    actions.push(
      req.status === 'open' ? (
        <button key="source" type="button" className="btn btn--primary" onClick={() => navigate(`/talent/sourcing?req=${req.id}`)}>
          <Radar /> Source candidates
        </button>
      ) : (
        <span key="source" className="tl-req-tip" data-tip="Reopen the requisition to add candidates">
          <button type="button" className="btn" disabled>
            <Radar /> Source candidates
          </button>
        </span>
      ),
    );
  if (req.status !== 'draft' && req.status !== 'pending-approval')
    actions.push(
      <button key="pipe" type="button" className="btn" onClick={() => navigate(`/talent/pipeline?req=${req.id}`)}>
        <SquareKanban /> Open pipeline
      </button>,
    );
  if (caps.manage && (req.status === 'on-hold' || req.status === 'closed' || (req.status === 'filled' && req.headcount > req.hires)))
    actions.push(
      <button key="reopen" type="button" className={cx('btn', req.status !== 'filled' && 'btn--primary')} onClick={reopen}>
        <Play /> Reopen
      </button>,
    );
  const secondary: ReactNode[] = [];
  if (canEdit.ok)
    secondary.push(
      <button key="edit" type="button" className="btn btn--ghost" onClick={openEdit}>
        <Pencil /> Edit basics
      </button>,
    );
  if (caps.manage && req.status === 'open')
    secondary.push(
      <button key="hold" type="button" className="btn btn--ghost" onClick={hold}>
        <Pause /> Put on hold
      </button>,
    );
  if (caps.manage && (req.status === 'open' || req.status === 'on-hold' || req.status === 'filled'))
    secondary.push(
      <button key="close" type="button" className="btn btn--ghost tl-req-danger" onClick={close}>
        <Archive /> Close
      </button>,
    );

  const sections: { id: SectionId; label: string; icon: LucideIcon; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'candidates', label: 'Candidates', icon: Users, count: active.length },
    { id: 'jd', label: 'Job description', icon: FileText },
    { id: 'plan', label: 'Interview plan', icon: ListChecks, count: req.interviewPlan.length },
    { id: 'activity', label: 'Activity', icon: History, count: activity.length },
  ];

  const renderSection = (s: SectionId) => {
    switch (s) {
      case 'overview':
        return (
          <OverviewSection
            req={req}
            apps={apps}
            interviews={interviews}
            offers={offers}
            now={now}
            onStage={(stage) => {
              setStageFilter(stage);
              showSection('candidates');
            }}
          />
        );
      case 'candidates':
        return <CandidatesSection apps={apps} now={now} stage={stageFilter} onClearStage={() => setStageFilter(null)} />;
      case 'jd':
        return <JDSection req={req} canEdit={canEdit.ok} />;
      case 'plan':
        return <PlanSection req={req} canEdit={canEdit} />;
      case 'activity':
        return <ActivitySection items={activity} now={now} />;
    }
  };

  return (
    <div className="tl-req-detail">
      <header className="tl-req-hero">
        <span className="tl-req-hero__grid" aria-hidden="true" />
        <span className="tl-req-hero__glow" aria-hidden="true" />
        <div className="tl-req-hero__top">
          <Link to="/talent/requisitions" className="tl-req-back">
            <ArrowLeft aria-hidden="true" /> Requisitions
          </Link>
          <span className="mono faint text-xs">{req.id}</span>
        </div>
        <div className="tl-req-hero__main">
          <div className="tl-req-hero__id">
            <div className="eyebrow">
              {req.department} · {SENIORITY_LABEL[req.seniority]}
            </div>
            <h1 className="tl-req-hero__title">{req.title}</h1>
            <div className="tl-req-hero__badges">
              <ReqStatusBadge status={req.status} />
              <PriorityBadge priority={req.priority} />
              {req.jd.profile && (
                <span className={cx('tag', 'tl-req-health-tag', req.jd.profile.quality.score >= 80 ? 'is-good' : req.jd.profile.quality.score >= 60 ? 'is-ok' : 'is-poor')}>JD health {req.jd.profile.quality.score}</span>
              )}
            </div>
            <ul className="tl-req-hero__facts">
              <li>
                <Building2 aria-hidden="true" /> {req.department}
              </li>
              <li>
                <MapPin aria-hidden="true" /> {req.location}
              </li>
              <li>
                <Laptop aria-hidden="true" /> {WORK_MODEL_LABEL[req.workModel]}
              </li>
              <li>
                <Briefcase aria-hidden="true" /> {EMPLOYMENT_LABEL[req.employmentType]}
              </li>
              <li>
                <Layers aria-hidden="true" /> {SENIORITY_LABEL[req.seniority]}
              </li>
              <li>
                <Award aria-hidden="true" /> Band <b className="mono">{req.band}</b>
              </li>
            </ul>
            {req.jd.profile?.summary && <p className="tl-req-hero__summary clamp-2">{req.jd.profile.summary}</p>}
            <div className="tl-req-hero__pipe">
              <div className="row row--between">
                <span className="stat-label">Live pipeline</span>
                <span className="tl-req-card__count">
                  {active.length} active · {apps.filter((a) => a.status === 'hired').length} hired
                </span>
              </div>
              <ReqPipelineBar apps={apps} />
              {req.jd.profile && req.jd.profile.skills.some((s) => s.must) && (
                <div className="tl-req-hero__skills" aria-label="Must-have skills">
                  {req.jd.profile.skills
                    .filter((s) => s.must)
                    .slice(0, 6)
                    .map((s) => (
                      <span key={s.skill} className="tag">
                        {s.skill}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="tl-req-hero__panel">
            <div className="tl-req-hero__stat">
              <span className="stat-label">Salary range</span>
              <span className="tl-req-hero__money">
                <CompRange salary={req.salary} compact={false} emptyLabel={caps.manage ? 'Not set yet' : 'People Ops will set it'} />
              </span>
            </div>
            <div className="tl-req-hero__stat">
              <span className="stat-label">Headcount</span>
              <SeatMeter hires={req.hires} headcount={req.headcount} />
            </div>
            <div className="tl-req-hero__stat">
              <span className="stat-label">Target start</span>
              <span className="tl-req-hero__value">
                {req.targetStartDate ? (
                  <>
                    {fmtDay(req.targetStartDate)}
                    <small>{targetHint(req.targetStartDate, now)}</small>
                  </>
                ) : (
                  <span className="faint">Not set</span>
                )}
              </span>
            </div>
            <div className="tl-req-hero__team">
              <span>
                <span className="stat-label">Hiring manager</span>
                <PersonChip userId={req.hiringManagerId} size={24} label={undefined} />
              </span>
              <span>
                <span className="stat-label">Recruiter</span>
                <PersonChip userId={req.recruiterId} size={24} />
              </span>
            </div>
            <ReqDates req={req} />
          </div>
        </div>
        <ReqLifecycle req={req} activeOffer={activeOffer} activeCount={active.length} upcoming={interviews.filter((i) => i.status === 'scheduled' && i.scheduledAt >= now).length} canEdit={canEdit.ok} canApprove={approval.ok} />
        {(actions.length > 0 || secondary.length > 0) && (
          <div className="tl-req-hero__actions">
            {actions}
            <span className="spacer" />
            {secondary}
          </div>
        )}
        {req.status === 'pending-approval' && !approval.ok && caps.manage && (
          <p id="tl-req-approve-why" className="tl-req-hero__why">
            <ShieldAlert aria-hidden="true" /> {approval.reason}
          </p>
        )}
      </header>

      {isMobile ? (
        <div className="tl-req-accordion">
          {sections.map((s) => {
            const open = openSections.has(s.id);
            const Icon = s.icon;
            return (
              <section key={s.id} className={cx('tl-req-acc', open && 'is-open')}>
                <h2 className="tl-req-acc__h">
                  <button
                    type="button"
                    className="tl-req-acc__btn"
                    aria-expanded={open}
                    aria-controls={`tl-req-acc-${s.id}`}
                    onClick={() =>
                      setOpenSections((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span className="grow">{s.label}</span>
                    {s.count !== undefined && <span className="tl-req-acc__count">{s.count}</span>}
                    <ChevronDown className="tl-req-acc__chev" aria-hidden="true" />
                  </button>
                </h2>
                {open && (
                  <div id={`tl-req-acc-${s.id}`} className="tl-req-acc__body">
                    {renderSection(s.id)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="tabs tl-req-tabs" role="tablist" aria-label="Requisition sections">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  id={`tl-req-tab-${s.id}`}
                  aria-selected={tab === s.id}
                  aria-controls={`tl-req-panel-${s.id}`}
                  className={cx('tab', tab === s.id && 'is-active')}
                  onClick={() => setTab(s.id)}
                >
                  <Icon aria-hidden="true" />
                  {s.label}
                  {s.count !== undefined && s.count > 0 && <span className="tl-req-tabs__count">{s.count}</span>}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" id={`tl-req-panel-${tab}`} aria-labelledby={`tl-req-tab-${tab}`} className="tl-req-panelwrap" key={tab}>
            {renderSection(tab)}
          </div>
        </>
      )}
      {note.dialog}
      {canEdit.ok && <ReqEditModal key={editKey} req={req} open={editOpen} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function targetHint(iso: string, now: number) {
  const d = Math.round((new Date(`${iso}T00:00:00`).getTime() - now) / DAY);
  if (d > 1) return `in ${d} days`;
  if (d === 1) return 'tomorrow';
  if (d === 0) return 'today';
  return `${-d} days ago`;
}

function ReqDates({ req }: { req: Requisition }) {
  const creator = useUserById(req.createdBy);
  const approver = useUserById(req.approvedBy);
  return (
    <div className="tl-req-hero__dates">
      <span>
        Raised {fmtDay(req.createdAt)}
        {creator ? ` by ${creator.name.split(' ')[0]}` : ''}
      </span>
      {req.openedAt && (
        <span>
          Opened {fmtDay(req.openedAt)}
          {approver ? ` · approved by ${approver.name.split(' ')[0]}` : ''}
        </span>
      )}
      {req.closedAt && (req.status === 'filled' || req.status === 'closed') && (
        <span>
          {req.status === 'filled' ? 'Filled' : 'Closed'} {fmtDay(req.closedAt)}
        </span>
      )}
    </div>
  );
}

// ───────────────────────── lifecycle rail ─────────────────────────
const LIFE: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'draft', label: 'Drafted', icon: FilePen },
  { id: 'approval', label: 'Headcount approval', icon: ShieldCheck },
  { id: 'sourcing', label: 'Sourcing & interviews', icon: Radar },
  { id: 'offer', label: 'Offer', icon: Signature },
  { id: 'filled', label: 'Filled', icon: PartyPopper },
];

function ReqLifecycle({
  req,
  activeOffer,
  activeCount,
  upcoming,
  canEdit,
  canApprove,
}: {
  req: Requisition;
  activeOffer?: Offer;
  activeCount: number;
  upcoming: number;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const current =
    req.status === 'draft' ? 0 : req.status === 'pending-approval' ? 1 : req.status === 'filled' ? 5 : req.status === 'closed' ? (req.openedAt ? 2 : 0) : activeOffer ? 3 : 2;
  const paused = req.status === 'on-hold';
  const closed = req.status === 'closed';
  const hint =
    req.status === 'draft'
      ? canEdit
        ? 'Next: check the details, then submit it for headcount approval.'
        : 'The hiring manager is still drafting this requisition.'
      : req.status === 'pending-approval'
        ? canApprove
          ? 'Next: you can approve this headcount. It opens straight away.'
          : 'Waiting for a recruiter with “Run recruiting” who isn’t the hiring manager to approve the headcount.'
        : req.status === 'open'
          ? activeOffer
            ? `An offer is in flight (${activeOffer.status.replace('-', ' ')}). ${activeCount} candidate${activeCount === 1 ? '' : 's'} still active.`
            : activeCount
              ? `${activeCount} candidate${activeCount === 1 ? '' : 's'} in flight · ${upcoming} interview${upcoming === 1 ? '' : 's'} booked.`
              : 'Next: source candidates. Decode the JD and search LinkedIn from the sourcing studio.'
          : req.status === 'on-hold'
            ? 'Paused. Candidates stay where they are; reopen to continue.'
            : req.status === 'filled'
              ? `All ${req.headcount} seat${req.headcount === 1 ? '' : 's'} filled. Onboarding continues in HR Portal.`
              : 'Closed. No new candidates can be added.';
  return (
    <div className={cx('tl-req-life', paused && 'is-paused', closed && 'is-closed')}>
      <ol className="tl-req-life__rail" aria-label="Requisition lifecycle">
        {LIFE.map((n, i) => {
          const state = i < current ? 'done' : i === current ? (paused ? 'paused' : closed ? 'closed' : 'active') : 'idle';
          const Icon = state === 'done' ? CircleCheck : state === 'closed' ? CircleX : state === 'paused' ? Pause : n.icon;
          return (
            <li key={n.id} className={cx('tl-req-life__node', `is-${state}`)} aria-current={state === 'active' ? 'step' : undefined} style={{ '--i': i } as CSSProperties}>
              <span className="tl-req-life__dot">
                <Icon aria-hidden="true" />
              </span>
              <span className="tl-req-life__label">{n.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="tl-req-life__hint" role="status">
        {hint}
      </p>
    </div>
  );
}

// ───────────────────────── overview ─────────────────────────
function OverviewSection({
  req,
  apps,
  interviews,
  offers,
  now,
  onStage,
}: {
  req: Requisition;
  apps: Application[];
  interviews: Interview[];
  offers: Offer[];
  now: number;
  onStage: (stage: StageId) => void;
}) {
  const { candById } = useTalentLookups();
  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const active = apps.filter((a) => a.status === 'active');
  const hired = apps.filter((a) => a.status === 'hired').length;
  const upcoming = interviews.filter((i) => i.status === 'scheduled' && i.scheduledAt >= now).sort((a, b) => a.scheduledAt - b.scheduledAt);
  const offersOut = offers.filter((o) => o.status === 'pending-approval' || o.status === 'approved' || o.status === 'sent').length;
  const accepted = offers.filter((o) => o.status === 'accepted').length;
  const open = daysOpen(req, now);
  const avg = avgMatch(apps);
  const panel = planInterviewers(req.interviewPlan).filter((id) => id !== req.hiringManagerId && id !== req.recruiterId);

  return (
    <div className="tl-req-overview">
      <div className="tl-req-kpis tl-req-kpis--5">
        <KpiTile icon={Users} label="In pipeline" value={active.length} hint={`${apps.length} all-time · ${hired} hired`} tone="amber" />
        <KpiTile icon={CalendarClock} label="Interviews booked" value={upcoming.length} hint={upcoming[0] ? `Next ${fmtRelativeDay(upcoming[0].scheduledAt, now)}` : 'Nothing on the calendar'} tone="info" />
        <KpiTile icon={Signature} label="Offers" value={offersOut} hint={`${accepted} accepted`} tone="rose" />
        <KpiTile icon={Clock} label="Days open" value={open ?? '—'} hint={open === null ? 'Not open yet' : req.status === 'open' ? 'And counting' : 'Total'} tone="warning" />
        <KpiTile icon={Target} label="Avg match" value={avg !== null ? `${avg}%` : '—'} hint="Active candidates" tone="success" />
      </div>
      <div className="tl-req-overview__grid">
        <section className="card tl-req-panel" aria-labelledby="tl-req-funnel-h">
          <div className="tl-req-panel__head">
            <h3 id="tl-req-funnel-h">Hiring funnel</h3>
            <span className="faint text-xs">Select a stage to see who’s there</span>
          </div>
          {apps.length ? (
            <Funnel steps={funnel} onSelect={onStage} />
          ) : (
            <EmptyState icon={<Radar />} title="No candidates yet">
              {req.status === 'open' ? 'Source from the JD or import profiles to start the pipeline.' : 'Candidates can be added once the requisition is open.'}
            </EmptyState>
          )}
        </section>
        <div className="tl-req-overview__side">
          <section className="card tl-req-panel" aria-labelledby="tl-req-team-h">
            <div className="tl-req-panel__head">
              <h3 id="tl-req-team-h">Hiring team</h3>
            </div>
            <ul className="tl-req-team">
              <li>
                <span className="tl-req-team__role">Hiring manager</span>
                <PersonChip userId={req.hiringManagerId} size={26} label={undefined} />
              </li>
              <li>
                <span className="tl-req-team__role">Recruiter</span>
                <PersonChip userId={req.recruiterId} size={26} />
              </li>
              <li>
                <span className="tl-req-team__role">Interview panel</span>
                {panel.length ? <PeopleStack userIds={panel} max={6} size={26} /> : <span className="faint text-sm">Not assigned</span>}
              </li>
            </ul>
          </section>
          <section className="card tl-req-panel" aria-labelledby="tl-req-up-h">
            <div className="tl-req-panel__head">
              <h3 id="tl-req-up-h">Coming up</h3>
              <span className="faint text-xs">{upcoming.length} booked</span>
            </div>
            {upcoming.length ? (
              <ul className="tl-req-mini">
                {upcoming.slice(0, 4).map((iv) => {
                  const c = candById.get(iv.candidateId);
                  return (
                    <li key={iv.id}>
                      <button type="button" className="tl-req-mini__row" onClick={() => c && useTalentUI.getState().openCandidate(c.id)}>
                        {c && <CandidateAvatar person={c} size={28} />}
                        <span className="grow">
                          <span className="tl-req-mini__title truncate">{c?.name ?? 'Candidate'}</span>
                          <span className="tl-req-mini__sub truncate">{iv.title}</span>
                        </span>
                        <span className="tl-req-mini__when">{fmtRelativeDay(iv.scheduledAt, now)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="faint text-sm">No interviews on the calendar.</p>
            )}
          </section>
          {offers.length > 0 && (
            <section className="card tl-req-panel" aria-labelledby="tl-req-of-h">
              <div className="tl-req-panel__head">
                <h3 id="tl-req-of-h">Offers</h3>
                <Link to="/talent/offers" className="text-xs accent-ink">
                  Offers board
                </Link>
              </div>
              <ul className="tl-req-mini">
                {offers.slice(0, 4).map((o) => {
                  const c = candById.get(o.candidateId);
                  return (
                    <li key={o.id}>
                      <button type="button" className="tl-req-mini__row" onClick={() => useTalentUI.getState().openModal({ kind: 'offer', applicationId: o.applicationId, offerId: o.id })}>
                        {c && <CandidateAvatar person={c} size={28} />}
                        <span className="grow">
                          <span className="tl-req-mini__title truncate">{c?.name ?? 'Candidate'}</span>
                          <span className="tl-req-mini__sub truncate">
                            {o.band} · starts {fmtDay(o.startDate)}
                          </span>
                        </span>
                        <OfferStatusBadge status={o.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── candidates ─────────────────────────
type CandFilter = 'active' | 'hired' | 'closed' | 'all';

function CandidatesSection({ apps, now, stage, onClearStage }: { apps: Application[]; now: number; stage: StageId | null; onClearStage: () => void }) {
  const { candById } = useTalentLookups();
  const [filter, setFilter] = useState<CandFilter>('active');
  const counts = {
    active: apps.filter((a) => a.status === 'active').length,
    hired: apps.filter((a) => a.status === 'hired').length,
    closed: apps.filter((a) => a.status === 'rejected' || a.status === 'withdrawn').length,
    all: apps.length,
  };
  const rows = useMemo(() => {
    const byStatus = apps.filter((a) =>
      stage ? a.stage === stage && (a.status === 'active' || (stage === 'hired' && a.status === 'hired')) : filter === 'all' ? true : filter === 'closed' ? a.status === 'rejected' || a.status === 'withdrawn' : a.status === filter,
    );
    return byStatus.sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
  }, [apps, filter, stage]);

  return (
    <div className="tl-req-cands">
      <div className="tl-req-cands__bar">
        {stage ? (
          <button type="button" className="chip is-active tl-req-stagechip" onClick={onClearStage} style={{ '--stage-h': STAGE_BY_ID[stage].hue } as CSSProperties}>
            Stage: {STAGE_BY_ID[stage].label}
            <X aria-label="Clear stage filter" />
          </button>
        ) : (
          <div className="chips" role="group" aria-label="Filter candidates">
            {(['active', 'hired', 'closed', 'all'] as CandFilter[]).map((f) => (
              <button key={f} type="button" className={cx('chip', filter === f && 'is-active')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'active' ? 'Active' : f === 'hired' ? 'Hired' : f === 'closed' ? 'Closed' : 'All'}
                <span className="count">{counts[f]}</span>
              </button>
            ))}
          </div>
        )}
        <span className="faint text-xs">Ranked by AI match</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Users />} title="Nobody here yet">
          {stage ? 'No active candidates in this stage.' : 'Candidates you add to this requisition show up here, best match first.'}
        </EmptyState>
      ) : (
        <ol className="tl-req-cands__list">
          {rows.map((a, i) => {
            const c = candById.get(a.candidateId);
            if (!c) return null;
            const d = daysInStage(a, now);
            const sla = a.status === 'active' ? slaState(a, now) : 'ok';
            return (
              <li key={a.id} className="tl-req-cand" onClick={() => useTalentUI.getState().openCandidate(c.id)} style={{ '--i': i } as CSSProperties}>
                <span className="tl-req-cand__rank mono" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {a.match ? <MatchRing score={a.match.score} size={42} /> : <CandidateAvatar person={c} size={42} />}
                <div className="tl-req-cand__who">
                  <span className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="tl-req-cand__name"
                      onClick={(e) => {
                        e.stopPropagation();
                        useTalentUI.getState().openCandidate(c.id);
                      }}
                    >
                      {c.name}
                    </button>
                    {c.sample && <SampleTag />}
                  </span>
                  <span className="tl-req-cand__sub truncate">
                    {c.currentTitle} · {c.currentCompany} · {c.location}
                  </span>
                </div>
                <div className="tl-req-cand__stage">
                  <StageBadge stage={a.stage} />
                  {a.status === 'active' ? (
                    <span className={cx('tl-req-cand__days', `is-${sla}`)} title={`SLA ${STAGE_BY_ID[a.stage].slaDays} days`}>
                      <Clock aria-hidden="true" /> {d}d in stage
                    </span>
                  ) : (
                    <span className={cx('badge', a.status === 'hired' ? 'badge--success' : 'badge--muted')}>{APPLICATION_STATUS_LABEL[a.status]}</span>
                  )}
                </div>
                <div className="tl-req-cand__next" onClick={(e) => e.stopPropagation()}>
                  <NextActionButton applicationId={a.id} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ───────────────────────── job description ─────────────────────────
function JDSection({ req, canEdit }: { req: Requisition; canEdit: boolean }) {
  const [decoding, setDecoding] = useState(false);
  const decode = async () => {
    setDecoding(true);
    try {
      const res = await analyzeJD(req.jd.text, { fileName: req.jd.fileName });
      const out = useTalent.getState().updateRequisition(req.id, { jd: { ...req.jd, profile: res.profile } });
      if (out.ok) toast.success('Job description decoded', `${res.profile.skills.length} skills · JD health ${res.profile.quality.score}${res.fallbackReason ? ' · offline engine' : ''}`);
      else toast.result(out);
    } finally {
      setDecoding(false);
    }
  };

  if (!req.jd.text.trim())
    return canEdit ? (
      <AttachJD req={req} />
    ) : (
      <EmptyState icon={<FileText />} title="No job description yet">
        The hiring team hasn’t attached a JD to this requisition.
      </EmptyState>
    );

  const words = req.jd.text.trim().split(/\s+/).length;
  const profile = req.jd.profile;
  const fileLine = (
    <div className="tl-req-jd__file">
      <FileText aria-hidden="true" />
      <span className="truncate">{req.jd.fileName ?? 'Pasted text'}</span>
      <span className="faint">· {words.toLocaleString()} words</span>
      {profile && <span className="faint">· decoded {relativeTime(profile.analyzedAt)}</span>}
      <span className="spacer" />
      {profile && <EngineBadge engine={profile.engine} />}
      {canEdit && profile && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void decode()} disabled={decoding}>
          {decoding ? <LoaderCircle className="spin" /> : <RefreshCw />} Decode again
        </button>
      )}
    </div>
  );

  if (!profile)
    return (
      <div className="tl-req-jd tl-req-jd--raw">
        <div className="tl-req-decode">
          <span className="tl-req-decode__icon" aria-hidden="true">
            <BrainCircuit />
          </span>
          <div className="grow">
            <b>This JD hasn’t been decoded yet</b>
            <span className="muted text-sm">Decoding extracts skills, seniority and salary signals for matching, LinkedIn searches and a JD health check.</span>
          </div>
          {canEdit ? (
            <button type="button" className="btn btn--primary" onClick={() => void decode()} disabled={decoding}>
              {decoding ? <LoaderCircle className="spin" /> : <BrainCircuit />} {decoding ? 'Decoding…' : 'Decode with AI'}
            </button>
          ) : (
            <span className="faint text-xs">A recruiter can decode it.</span>
          )}
        </div>
        {decoding && <JDScanning />}
        {fileLine}
        <pre className="tl-req-jd__text">{req.jd.text}</pre>
      </div>
    );

  return (
    <div className="tl-req-jd">
      <div className="tl-req-jd__side">
        <SearchDNA profile={profile} readOnly />
        <section className="card tl-req-panel" aria-labelledby="tl-req-skills-h">
          <div className="tl-req-panel__head">
            <h3 id="tl-req-skills-h">Skills the matcher looks for</h3>
          </div>
          <SkillEditor skills={profile.skills} readOnly />
        </section>
        <JDHealth quality={profile.quality} />
      </div>
      <div className="tl-req-jd__main">
        {fileLine}
        {decoding && <JDScanning label="Decoding again" />}
        <JDXray text={req.jd.text} profile={profile} maxHeight={620} />
      </div>
    </div>
  );
}

/** Attach a JD to a requisition that was created without one. */
function AttachJD({ req }: { req: Requisition }) {
  const jd = useJDAnalysis();
  const attach = () => {
    if (!jd.profile) return;
    const res = useTalent.getState().updateRequisition(req.id, { jd: { text: jd.text, fileName: jd.fileName, profile: jd.profile } });
    if (res.ok) toast.success('Job description attached', `${jd.profile.skills.length} skills decoded`);
    else toast.result(res);
  };
  return (
    <div className="tl-req-attach">
      <div className="tl-req-decode">
        <span className="tl-req-decode__icon" aria-hidden="true">
          <FileText />
        </span>
        <div className="grow">
          <b>No job description yet</b>
          <span className="muted text-sm">Add one to unlock AI matching, LinkedIn searches and the JD health check.</span>
        </div>
      </div>
      {jd.status === 'analyzing' || jd.status === 'reading' ? (
        <JDScanning />
      ) : jd.profile ? (
        <div className="tl-req-attach__ready">
          <JDHealth quality={jd.profile.quality} compact />
          <div className="row row--wrap">
            <span className="muted text-sm">
              Decoded “{jd.profile.title}” · {jd.profile.skills.length} skills
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" onClick={jd.reset}>
              Start over
            </button>
            <button type="button" className="btn btn--primary" onClick={attach}>
              <CircleCheck /> Attach to requisition
            </button>
          </div>
        </div>
      ) : (
        <JDInput jd={jd} compact cta="Decode JD" />
      )}
    </div>
  );
}

// ───────────────────────── interview plan ─────────────────────────
function PlanSection({ req, canEdit }: { req: Requisition; canEdit: { ok: boolean; reason?: string } }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(req.interviewPlan);
  const start = () => {
    setDraft(req.interviewPlan);
    setEditing(true);
  };
  const save = () => {
    if (!draft.length) {
      toast.error('Add at least one interview step.');
      return;
    }
    const res = useTalent.getState().updateRequisition(req.id, { interviewPlan: draft });
    if (res.ok) {
      toast.success('Interview plan saved', `${draft.length} steps`);
      setEditing(false);
    } else toast.result(res);
  };
  return (
    <section className="card tl-req-panel tl-req-planwrap" aria-labelledby="tl-req-plan-h">
      <div className="tl-req-panel__head tl-req-panel__head--wrap">
        <div>
          <h3 id="tl-req-plan-h">Interview loop</h3>
          <PlanSummary steps={editing ? draft : req.interviewPlan} />
        </div>
        <span className="spacer" />
        {canEdit.ok ? (
          editing ? (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={save}>
                <CircleCheck /> Save plan
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--sm" onClick={start}>
              <Pencil /> Edit plan
            </button>
          )
        ) : (
          <span className="faint text-xs row" style={{ gap: 6 }}>
            <Lock aria-hidden="true" className="inline-icon" /> {canEdit.reason}
          </span>
        )}
      </div>
      {editing ? <InterviewPlanEditor steps={draft} onChange={setDraft} /> : <InterviewPlanView steps={req.interviewPlan} />}
      <p className="field-hint">Each step becomes a scorecard; interviewers rate the listed competencies from 1 to 4.</p>
    </section>
  );
}

// ───────────────────────── activity ─────────────────────────
const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  created: UserPlus,
  import: FileText,
  stage: SquareKanban,
  outreach: Send,
  reply: MessagesSquare,
  interview: CalendarClock,
  scorecard: ListChecks,
  decision: Gavel,
  offer: Signature,
  hired: PartyPopper,
  rejected: CircleX,
  note: PenLine,
  handoff: Handshake,
  requisition: Briefcase,
};

function Actor({ id }: { id: string }) {
  const u = useUserById(id);
  return <>{u ? u.name : id === 'system' ? 'NEXUS' : 'Someone'}</>;
}

function dayLabel(ts: number, now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((ts - start.getTime()) / DAY);
  if (diff >= 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function ActivitySection({ items, now }: { items: TalentActivity[]; now: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 30);
  const groups = useMemo(() => {
    const out: { label: string; items: TalentActivity[] }[] = [];
    for (const a of shown) {
      const label = dayLabel(a.at, now);
      const g = out[out.length - 1];
      if (g?.label === label) g.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [shown, now]);
  if (!items.length)
    return (
      <EmptyState icon={<History />} title="No activity yet">
        Stage moves, interviews, offers and approvals for this requisition appear here.
      </EmptyState>
    );
  return (
    <section className="card tl-req-panel">
      <ol className="tl-req-feed">
        {groups.map((g) => (
          <li key={g.label} className="tl-req-feed__group">
            <div className="tl-req-feed__day">{g.label}</div>
            <ol>
              {g.items.map((a) => {
                const Icon = ACTIVITY_ICON[a.kind] ?? History;
                return (
                  <li key={a.id} className={cx('tl-req-feed__item', `tl-req-feed__item--${a.kind}`)}>
                    <span className="tl-req-feed__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="grow">
                      <div className="tl-req-feed__text">{a.text}</div>
                      <div className="tl-req-feed__meta">
                        <Actor id={a.actorId} /> · <time dateTime={new Date(a.at).toISOString()}>{relativeTime(a.at, now)}</time>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
      {items.length > 30 && (
        <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${items.length} events`}
        </button>
      )}
    </section>
  );
}
