/**
 * HR Portal · Onboarding journey — one new hire's path from offer to day 90:
 * hero with countdown / "Day N", the Pre-boarding → 90-day timeline (today's
 * phase highlighted), the task checklist grouped by phase with owner chips,
 * due states and permission-aware toggles, an inline "add task" form, and a
 * side panel for people (buddy assignment), NEXUS account provisioning,
 * welcome note, start date and the Talent Hub hand-off source.
 */
import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  BookOpen,
  CalendarHeart,
  Check,
  CircleCheckBig,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  ListChecks,
  Lock,
  Mail,
  Pencil,
  Plus,
  Quote,
  SearchX,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sunrise,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import type { User } from '@/types';
import type { OnboardingJourney, OnboardingPhase, OnboardingTask, TaskOwner } from '@/talent/types';
import { OWNER_META, PHASE_META, PHASE_ORDER } from '@/talent/constants';
import * as access from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentViewer, useVisibleJourneys } from '@/talent/selectors';
import { addDaysISO, deriveJourneyStatus, journeyProgress, parseISODate } from '@/talent/onboarding';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { EmptyState, Switch } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { PersonChip } from '@/pages/talent/components/shared';
import { UserSelect } from '@/pages/talent/components/pickers';
import { AccountState, Countdown, DAY, dueState, fmtShortDate, isMyTask, journeyRoles, JourneyAvatar, OwnerChip, ProgressRing, roleLabel, StatusBadge, type JourneyRoles } from './onboarding/ui';
import { JourneyExtensions } from './home/JourneyExtensions';

type OwnerFilter = 'all' | 'mine' | TaskOwner;
const OWNERS = Object.keys(OWNER_META) as TaskOwner[];
/** Calendar offset (days from start) where each phase begins. */
const PHASE_START: Record<OnboardingPhase, number> = { 'pre-boarding': -30, 'day-1': 0, 'week-1': 1, 'day-30': 7, 'day-60': 30, 'day-90': 60 };
const PHASE_DEFAULT_DUE: Record<OnboardingPhase, number> = { 'pre-boarding': -3, 'day-1': 0, 'week-1': 3, 'day-30': 30, 'day-60': 60, 'day-90': 90 };

export function JourneyDetail() {
  const { id = '' } = useParams();
  const viewer = useTalentViewer();
  const caps = useTalentCaps();
  const visible = useVisibleJourneys();
  const journey = useTalent((s) => s.onboarding.find((j) => j.id === id));
  const req = useTalent((s) => (journey ? s.requisitions.find((r) => r.id === journey.requisitionId) : undefined));
  const toggleTask = useTalent((s) => s.toggleOnboardingTask);
  const now = useNow(60_000);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [hideDone, setHideDone] = useState(false);
  const [adding, setAdding] = useState(false);

  const back = caps.onboarding || visible.length ? '/hr/onboarding' : '/hr';
  const roles = useMemo(() => (journey ? journeyRoles(viewer, journey) : null), [viewer, journey]);

  if (!journey)
    return (
      <div className="card card--flat">
        <EmptyState
          icon={<SearchX />}
          title="Journey not found"
          action={
            <Link to={back} className="btn btn--sm">
              <ArrowLeft /> Back to onboarding
            </Link>
          }
        >
          It may have been removed, or the link is wrong.
        </EmptyState>
      </div>
    );

  if (!viewer || !roles || !access.canSeeJourney(viewer, journey))
    return (
      <div className="card card--flat">
        <EmptyState
          icon={<ShieldAlert />}
          title="You don’t have access to this journey"
          action={
            <Link to="/hr" className="btn btn--sm">
              <ArrowLeft /> Back to My HR
            </Link>
          }
        >
          Onboarding journeys are visible to People Ops, the hiring manager, the onboarding buddy and the new hire.
        </EmptyState>
      </div>
    );

  const j = journey;
  const prog = journeyProgress(j, now);
  const status = deriveJourneyStatus(j, now);
  const canAdd = caps.onboarding || roles.manager;
  const myCount = j.tasks.filter((t) => !t.done && isMyTask(roles, t)).length;
  const hasRole = roles.ops || roles.manager || roles.buddy || roles.newHire;
  const tasksShown = j.tasks.filter((t) => (ownerFilter === 'all' ? true : ownerFilter === 'mine' ? isMyTask(roles, t) : t.owner === ownerFilter) && (!hideDone || !t.done));
  const reduced = typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';
  const jumpTo = (phase: OnboardingPhase) => document.getElementById(`hr-jd-phase-${phase}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

  const onToggle = (t: OnboardingTask) => {
    const verdict = access.canToggleTask(viewer, j, t);
    if (!verdict.ok) {
      toast.info('Not your task', verdict.reason);
      return;
    }
    toast.result(toggleTask(j.id, t.id));
  };

  return (
    <div className="hr-jd">
      {/* Status summary strip (person's name & title are in NeoHead) */}
      <section className="neo-panel hr-jd-hero" aria-label="Journey summary">
        <div className="hr-jd-hero__glow" aria-hidden="true" />
        <div className="hr-jd-hero__main">
          <div className="hr-jd-hero__avatar">
            <ProgressRing percent={prog.percent} size={96} stroke={6} label={<JourneyAvatar journey={j} size={72} />} />
          </div>
          <div className="hr-jd-hero__info">
            <div className="neo-hud neo-hud--tint">Offer to day 90 · journey status</div>
            <div className="hr-jd-hero__tags">
              <StatusBadge status={status} />
              <Countdown journey={j} now={now} size="lg" />
              {prog.overdue > 0 && (
                <span className="hr-onb-pill hr-onb-pill--danger">
                  <TriangleAlert aria-hidden="true" /> {prog.overdue} overdue
                </span>
              )}
              {hasRole && <span className="hr-onb-pill hr-onb-pill--accent">{roleLabel(roles)}</span>}
            </div>
            <div className="hr-jd-hero__facts">
              <span>
                <CalendarHeart aria-hidden="true" /> Day one {new Date(parseISODate(j.startDate)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span>
                <ListChecks aria-hidden="true" /> {prog.done}/{prog.total} tasks
              </span>
              <AccountState journey={j} compact />
            </div>
          </div>
          <div className="hr-jd-hero__pct" aria-label={`${prog.percent}% complete`}>
            <span className="hr-jd-hero__pct-value">
              {prog.percent}
              <small>%</small>
            </span>
            <span className="stat-label">complete</span>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="neo-panel hr-jd-tl-wrap" aria-label="Journey timeline">
        <ol className="hr-jd-tl">
          {prog.phases.map((p, i) => {
            const m = PHASE_META[p.phase];
            const currentIdx = PHASE_ORDER.indexOf(prog.current);
            const state = i < currentIdx ? 'past' : i === currentIdx ? 'current' : 'future';
            const done = p.total > 0 && p.done === p.total;
            const startTs = parseISODate(j.startDate) + PHASE_START[p.phase] * DAY;
            return (
              <li key={p.phase} className={cx('hr-jd-tl__step', `is-${state}`, done && 'is-done', p.overdue > 0 && 'is-overdue')} style={{ '--ph-h': m.hue } as CSSProperties}>
                <button type="button" className="hr-jd-tl__btn" onClick={() => jumpTo(p.phase)} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="hr-jd-tl__node">{done ? <Check aria-hidden="true" /> : state === 'current' ? <Sunrise aria-hidden="true" /> : <span>{m.short}</span>}</span>
                  <span className="hr-jd-tl__label">{m.label}</span>
                  <span className="hr-jd-tl__window">{p.phase === 'pre-boarding' ? `Until ${fmtShortDate(parseISODate(j.startDate) - DAY)}` : `${m.window} · ${fmtShortDate(startTs)}`}</span>
                  <span className="hr-jd-tl__count">
                    {p.done}/{p.total}
                    {p.overdue > 0 && <span className="hr-jd-tl__late"> · {p.overdue} late</span>}
                  </span>
                  {state === 'current' && <span className="hr-jd-tl__here">Today</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="hr-jd__grid">
        {/* Checklist */}
        <section className="neo-panel hr-jd-panel hr-jd-checklist" aria-labelledby="hr-jd-checklist-title">
          <header className="hr-jd-panel__head hr-jd-checklist__head">
            <div>
              <div className="neo-hud">Step by step</div>
              <h2 id="hr-jd-checklist-title" className="hr-jd-panel__title">
                <ListChecks aria-hidden="true" /> Checklist
                <span className="hr-jd-panel__meta">
                  {prog.done}/{prog.total} done
                </span>
              </h2>
            </div>
            {canAdd && !adding && (
              <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
                <Plus /> Add task
              </button>
            )}
          </header>
          <div className="hr-jd-checklist__filters">
            <div className="chips" role="group" aria-label="Filter by owner">
              <button type="button" className={cx('chip', ownerFilter === 'all' && 'is-active')} aria-pressed={ownerFilter === 'all'} onClick={() => setOwnerFilter('all')}>
                All <span className="count">{j.tasks.length}</span>
              </button>
              {hasRole && (
                <button type="button" className={cx('chip', ownerFilter === 'mine' && 'is-active')} aria-pressed={ownerFilter === 'mine'} onClick={() => setOwnerFilter('mine')}>
                  <UserRound aria-hidden="true" /> My tasks <span className="count">{myCount}</span>
                </button>
              )}
              {OWNERS.map((o) => (
                <button key={o} type="button" className={cx('chip hr-jd-ownerchip', ownerFilter === o && 'is-active')} style={{ '--ow-h': OWNER_META[o].hue } as CSSProperties} aria-pressed={ownerFilter === o} onClick={() => setOwnerFilter(o)}>
                  <i aria-hidden="true" /> {OWNER_META[o].label} <span className="count">{j.tasks.filter((t) => t.owner === o && !t.done).length}</span>
                </button>
              ))}
            </div>
            <label className="hr-jd-toggle">
              <Switch checked={hideDone} onChange={setHideDone} label="Hide completed tasks" />
              <span>Hide done</span>
            </label>
          </div>

          {adding && <AddTaskForm journey={j} onDone={() => setAdding(false)} />}

          {PHASE_ORDER.map((phase) => {
            const all = j.tasks.filter((t) => t.phase === phase);
            const list = tasksShown.filter((t) => t.phase === phase).sort((a, b) => a.dueOffsetDays - b.dueOffsetDays || Number(a.done) - Number(b.done));
            const m = PHASE_META[phase];
            const done = all.filter((t) => t.done).length;
            if (!list.length && (ownerFilter !== 'all' || hideDone)) return null;
            return (
              <div key={phase} id={`hr-jd-phase-${phase}`} className={cx('hr-jd-pgroup', prog.current === phase && 'is-current')} style={{ '--ph-h': m.hue } as CSSProperties}>
                <header className="hr-jd-pgroup__head">
                  <span className="hr-jd-pgroup__dot" aria-hidden="true" />
                  <h3 className="hr-jd-pgroup__title">{m.label}</h3>
                  <span className="hr-jd-pgroup__window">{m.window}</span>
                  {prog.current === phase && <span className="hr-onb-pill hr-onb-pill--accent">Now</span>}
                  <span className="spacer" />
                  <span className="hr-jd-pgroup__count">
                    {done}/{all.length}
                  </span>
                  <span className="hr-jd-pgroup__bar" aria-hidden="true">
                    <i style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
                  </span>
                </header>
                {list.length ? (
                  <ul className="hr-jd-tasks">
                    {list.map((t) => (
                      <TaskRow key={t.id} journey={j} task={t} now={now} roles={roles} viewer={viewer} onToggle={() => onToggle(t)} />
                    ))}
                  </ul>
                ) : (
                  <p className="hr-jd-pgroup__empty">No tasks in this phase.</p>
                )}
              </div>
            );
          })}
          {tasksShown.length === 0 && (ownerFilter !== 'all' || hideDone) && (
            <p className="hr-jd-checklist__empty">
              <CircleCheckBig aria-hidden="true" /> Nothing left here. {ownerFilter === 'mine' ? 'All your tasks are done.' : 'Try another filter.'}
            </p>
          )}
        </section>

        {/* Side panel */}
        <aside className="hr-jd-side">
          <PeoplePanel journey={j} canAssign={caps.onboarding || roles.manager} />
          <AccountPanel journey={j} canProvision={caps.onboarding} />
          <WelcomePanel journey={j} canEdit={caps.onboarding || roles.manager} />
          <StartDatePanel journey={j} now={now} canEdit={caps.onboarding} />
          <section className="neo-panel hr-jd-panel hr-jd-sidecard" aria-labelledby="hr-jd-handoff">
            <div className="neo-hud">Source</div>
            <h2 id="hr-jd-handoff" className="hr-jd-sidecard__title">
              <Send aria-hidden="true" /> Hand-off from Talent Hub
            </h2>
            <dl className="hr-jd-dl">
              <dt>Handed off by</dt>
              <dd>
                <PersonChip userId={j.handedOffBy} /> <span className="faint text-xs">{relativeTime(j.handedOffAt, now)}</span>
              </dd>
              <dt>Requisition</dt>
              <dd>{req ? caps.hire || caps.manage ? <Link to={`/talent/requisitions/${req.id}`}>{req.title}</Link> : req.title : '—'}</dd>
              {j.offerId && (
                <>
                  <dt>Offer</dt>
                  <dd className="mono text-xs">{j.offerId} · accepted</dd>
                </>
              )}
              {caps.onboarding && j.email && (
                <>
                  <dt>Personal email</dt>
                  <dd className="truncate">{j.email}</dd>
                </>
              )}
            </dl>
          </section>
          {/* Extension point: pulse check-ins & documents are mounted here by the HR Portal. */}
          <section className="hr-jd-extensions">
            <JourneyExtensions journeyId={j.id} />
          </section>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────── checklist ─────────────────────────
function TaskRow({ journey: j, task: t, now, roles, viewer, onToggle }: { journey: OnboardingJourney; task: OnboardingTask; now: number; roles: JourneyRoles; viewer: access.TalentViewer; onToggle: () => void }) {
  const doneBy = useUserById(t.doneBy);
  const verdict = access.canToggleTask(viewer, j, t);
  const due = dueState(j, t, now);
  const mine = isMyTask(roles, t);
  return (
    <li className={cx('hr-jd-task', t.done && 'is-done', `is-${due.state}`, mine && 'is-mine', !verdict.ok && 'is-locked')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={t.done}
        aria-disabled={!verdict.ok}
        aria-label={`${t.done ? 'Mark as not done' : 'Mark as done'}: ${t.title}`}
        className="hr-onb-check"
        onClick={onToggle}
        data-tip={verdict.ok ? undefined : verdict.reason}
        data-tip-pos="right"
      >
        {verdict.ok || t.done ? <Check aria-hidden="true" /> : <Lock aria-hidden="true" />}
      </button>
      <div className="hr-jd-task__body">
        <div className="hr-jd-task__title">{t.title}</div>
        <div className="hr-jd-task__meta">
          <OwnerChip owner={t.owner} mine={mine} />
          {t.done ? (
            <span className="hr-onb-due hr-onb-due--done">
              <Check aria-hidden="true" /> Done{doneBy ? ` by ${doneBy.name.split(' ')[0]}` : ''}
              {t.doneAt ? ` · ${fmtShortDate(t.doneAt)}` : ''}
            </span>
          ) : (
            <>
              <span className={cx('hr-onb-due', `hr-onb-due--${due.state}`)}>{due.label}</span>
              {due.state !== 'later' && <span className="hr-jd-task__date">{fmtShortDate(due.at, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
            </>
          )}
          {t.courseId && (
            <Link to={`/academy/course/${t.courseId}`} className="hr-jd-task__link hr-jd-task__link--course">
              <GraduationCap aria-hidden="true" /> {t.done ? 'Review course' : 'Take course'}
            </Link>
          )}
          {t.articleSlug && (
            <Link to={`/wiki/doc/${t.articleSlug}`} className="hr-jd-task__link hr-jd-task__link--doc">
              <BookOpen aria-hidden="true" /> Playbook
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function AddTaskForm({ journey: j, onDone }: { journey: OnboardingJourney; onDone: () => void }) {
  const addTask = useTalent((s) => s.addOnboardingTask);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState<TaskOwner>('manager');
  const [phase, setPhase] = useState<OnboardingPhase>(() => {
    const d = (Date.now() - parseISODate(j.startDate)) / DAY;
    return d < 0 ? 'pre-boarding' : d < 1 ? 'day-1' : d < 7 ? 'week-1' : d < 30 ? 'day-30' : d < 60 ? 'day-60' : 'day-90';
  });
  const [offset, setOffset] = useState(PHASE_DEFAULT_DUE[phase]);
  const due = addDaysISO(j.startDate, offset);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = addTask(j.id, { title, owner, phase, dueOffsetDays: offset });
    if (toast.result(res)) onDone();
  };
  return (
    <form className="hr-jd-addtask" onSubmit={submit}>
      <div className="hr-jd-addtask__title">
        <Plus aria-hidden="true" /> New task
      </div>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen? e.g. Book a team lunch" aria-label="Task title" autoFocus maxLength={120} />
      <div className="hr-jd-addtask__row">
        <label className="field">
          <span className="field-label">Owner</span>
          <select className="select" value={owner} onChange={(e) => setOwner(e.target.value as TaskOwner)}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>
                {OWNER_META[o].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Phase</span>
          <select
            className="select"
            value={phase}
            onChange={(e) => {
              const p = e.target.value as OnboardingPhase;
              setPhase(p);
              setOffset(PHASE_DEFAULT_DUE[p]);
            }}
          >
            {PHASE_ORDER.map((p) => (
              <option key={p} value={p}>
                {PHASE_META[p].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Due (days from day one)</span>
          <input className="input" type="number" min={-60} max={120} value={offset} onChange={(e) => setOffset(Math.max(-60, Math.min(120, Math.round(Number(e.target.value) || 0))))} />
        </label>
      </div>
      <div className="hr-jd-addtask__foot">
        <span className="field-hint">
          Due {new Date(parseISODate(due)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {offset === 0 ? 'on day one' : offset < 0 ? `${-offset} days before day one` : `${offset} days after day one`}
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn--sm btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={title.trim().length < 3}>
          <Plus /> Add task
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── side panels ─────────────────────────
function PeoplePanel({ journey: j, canAssign }: { journey: OnboardingJourney; canAssign: boolean }) {
  const assignBuddy = useTalent((s) => s.assignBuddy);
  const manager = useUserById(j.managerId);
  const buddy = useUserById(j.buddyId);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState('');
  const filter = useCallback((u: User) => u.id !== j.managerId && u.id !== j.hubUserId, [j.managerId, j.hubUserId]);
  const save = () => {
    if (!choice) return;
    if (toast.result(assignBuddy(j.id, choice))) {
      setPicking(false);
      setChoice('');
    }
  };
  return (
    <section className="neo-panel hr-jd-panel hr-jd-sidecard" aria-labelledby="hr-jd-people">
      <div className="neo-hud">Support circle</div>
      <h2 id="hr-jd-people" className="hr-jd-sidecard__title">
        <UserRound aria-hidden="true" /> People
      </h2>
      <div className="hr-jd-person">
        <span className="hr-jd-person__role">Manager</span>
        <PersonChip userId={j.managerId} label={manager?.name} />
        {manager && <span className="hr-jd-person__meta">{manager.title}</span>}
      </div>
      <div className="hr-jd-person">
        <span className="hr-jd-person__role">
          <HeartHandshake aria-hidden="true" className="inline-icon" /> Buddy
        </span>
        {buddy ? (
          <>
            <PersonChip userId={buddy.id} label={buddy.name} />
            <span className="hr-jd-person__meta">{buddy.title}</span>
          </>
        ) : (
          <span className="hr-onb-pill hr-onb-pill--warning">No buddy yet</span>
        )}
      </div>
      {canAssign &&
        (picking ? (
          <div className="hr-jd-assign">
            <UserSelect value={choice} onChange={setChoice} filter={filter} placeholder="Pick a peer…" ariaLabel="Onboarding buddy" allowEmpty />
            <div className="row">
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPicking(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={!choice}>
                <Check /> Assign buddy
              </button>
            </div>
            <p className="field-hint">A peer outside the reporting line works best. They’re notified straight away.</p>
          </div>
        ) : (
          <button type="button" className="btn btn--sm btn--block" onClick={() => setPicking(true)}>
            <HeartHandshake /> {buddy ? 'Change buddy' : 'Assign buddy'}
          </button>
        ))}
    </section>
  );
}

function AccountPanel({ journey: j, canProvision }: { journey: OnboardingJourney; canProvision: boolean }) {
  const provision = useTalent((s) => s.provisionHubAccount);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    const res = provision(j.id);
    setBusy(false);
    toast.result(res);
  };
  return (
    <section className={cx('neo-panel hr-jd-panel hr-jd-sidecard hr-jd-acct', j.hubUserId ? 'is-ready' : 'is-pending')} aria-labelledby="hr-jd-acct-title">
      <div className="neo-hud">Identity &amp; SSO</div>
      <h2 id="hr-jd-acct-title" className="hr-jd-sidecard__title">
        <KeyRound aria-hidden="true" /> NEXUS account
      </h2>
      {j.hubUserId ? (
        <>
          <div className="hr-jd-acct__ok">
            <ShieldCheck aria-hidden="true" />
            <div className="grow">
              <strong>Account active</strong>
              <span className="mono text-xs truncate">
                <Mail aria-hidden="true" className="inline-icon" /> {j.workEmail}
              </span>
            </div>
          </div>
          <PersonChip userId={j.hubUserId} label="View in directory" />
        </>
      ) : (
        <>
          <p className="text-sm muted">Creates the NEXUS identity, work email and SSO in one step, then ticks off the IT task.</p>
          <ul className="hr-jd-acct__steps">
            <li>
              <Check aria-hidden="true" /> Directory profile with manager & team
            </li>
            <li>
              <Check aria-hidden="true" /> Work email @helix.co
            </li>
            <li>
              <Check aria-hidden="true" /> Passkey-ready SSO for day one
            </li>
          </ul>
          {canProvision ? (
            <button type="button" className="btn btn--primary btn--block" onClick={run} disabled={busy}>
              <KeyRound /> Provision NEXUS account
            </button>
          ) : (
            <p className="hr-jd-sidecard__note">
              <Lock aria-hidden="true" className="inline-icon" /> People Ops provisions accounts before day one.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function WelcomePanel({ journey: j, canEdit }: { journey: OnboardingJourney; canEdit: boolean }) {
  const update = useTalent((s) => s.updateJourney);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(j.welcomeNote ?? '');
  const save = () => {
    if (toast.result(update(j.id, { welcomeNote: text.trim() || undefined }))) setEditing(false);
  };
  return (
    <section className="neo-panel hr-jd-panel hr-jd-sidecard" aria-labelledby="hr-jd-welcome">
      <div className="neo-hud">Day one message</div>
      <h2 id="hr-jd-welcome" className="hr-jd-sidecard__title">
        <Quote aria-hidden="true" /> Welcome note
        {canEdit && !editing && (
          <button
            type="button"
            className="icon-btn icon-btn--sm hr-jd-sidecard__edit"
            onClick={() => {
              setText(j.welcomeNote ?? '');
              setEditing(true);
            }}
            aria-label="Edit welcome note"
          >
            <Pencil />
          </button>
        )}
      </h2>
      {editing ? (
        <div className="stack stack--sm">
          <textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={`A few warm words for ${j.name.split(' ')[0]}’s first day…`} maxLength={400} />
          <div className="row row--between">
            <span className="field-hint">{text.length}/400</span>
            <span className="row">
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)}>
                <X /> Cancel
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={save}>
                <Check /> Save
              </button>
            </span>
          </div>
        </div>
      ) : j.welcomeNote ? (
        <blockquote className="hr-jd-quote">{j.welcomeNote}</blockquote>
      ) : (
        <p className="text-sm faint">{canEdit ? 'No note yet. A personal welcome makes day one feel special.' : 'No welcome note yet.'}</p>
      )}
    </section>
  );
}

function StartDatePanel({ journey: j, now, canEdit }: { journey: OnboardingJourney; now: number; canEdit: boolean }) {
  const update = useTalent((s) => s.updateJourney);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(j.startDate);
  const save = () => {
    if (date === j.startDate) return setEditing(false);
    if (toast.result(update(j.id, { startDate: date }))) setEditing(false);
  };
  return (
    <section className="neo-panel hr-jd-panel hr-jd-sidecard" aria-labelledby="hr-jd-start-title">
      <div className="neo-hud">Schedule</div>
      <h2 id="hr-jd-start-title" className="hr-jd-sidecard__title">
        <CalendarHeart aria-hidden="true" /> Start date
        {canEdit && !editing && (
          <button
            type="button"
            className="icon-btn icon-btn--sm hr-jd-sidecard__edit"
            onClick={() => {
              setDate(j.startDate);
              setEditing(true);
            }}
            aria-label="Change start date"
          >
            <Pencil />
          </button>
        )}
      </h2>
      {editing ? (
        <div className="stack stack--sm">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Start date" />
          <p className="field-hint">Every task due date moves with it. The manager and buddy are notified.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}>
              <Check /> Save date
            </button>
          </div>
        </div>
      ) : (
        <div className="hr-jd-start">
          <span className="hr-jd-start__tile" aria-hidden="true">
            <span>{new Date(parseISODate(j.startDate)).toLocaleDateString(undefined, { month: 'short' })}</span>
            <strong>{new Date(parseISODate(j.startDate)).getDate()}</strong>
          </span>
          <div className="grow">
            <div className="hr-jd-start__day">{new Date(parseISODate(j.startDate)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <Countdown journey={j} now={now} />
          </div>
        </div>
      )}
    </section>
  );
}
