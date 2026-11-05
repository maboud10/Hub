/**
 * Schedule or reschedule an interview, guided by the requisition's interview
 * plan: format + title from the next unbooked plan step, panel prefilled from
 * the plan, live panel availability (clashes, time zones, working hours),
 * smart slot suggestions over the next five business days and one-tap
 * location presets (Google Meet link generated for you).
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Building2, CalendarClock, CalendarPlus, Check, CircleCheck, Clock, Moon, Phone, RotateCcw, ShieldAlert, Sparkles, TriangleAlert, Users, Video } from 'lucide-react';
import type { InterviewKind } from '@/talent/types';
import type { TalentModal } from '@/talent/ui';
import { INTERVIEW_KIND_META } from '@/talent/constants';
import * as access from '@/talent/access';
import { useTalent } from '@/talent/store';
import { useTalentViewer } from '@/talent/selectors';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { tzLabel } from '@/lib/format';
import { cx } from '@/lib/cx';
import { CandidateAvatar, PersonChip, SampleTag } from '../components/shared';
import { UserMultiSelect } from '../components/pickers';
import { MiniPerson } from '../interviews/bits';
import {
  candidateClash,
  findClashes,
  fmtDate,
  fmtDayShort,
  fmtDuration,
  fmtTime,
  fmtTimeShort,
  fromInputs,
  HQ_ROOM,
  ivEnd,
  KIND_HUE,
  meetLocation,
  outsideHours,
  parseLocation,
  PHONE_LOCATION,
  planProgress,
  planStepFor,
  suggestSlots,
  toDateInput,
  toTimeInput,
  viewerTimeZone,
  type PlanState,
} from '../interviews/utils';

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 180, 240];
const KINDS = Object.keys(INTERVIEW_KIND_META) as InterviewKind[];

export function ScheduleModal({ modal, open, onClose }: { modal: Extract<TalentModal, { kind: 'schedule' }>; open: boolean; onClose: () => void }) {
  const viewer = useTalentViewer();
  const app = useTalent((s) => s.applications.find((a) => a.id === modal.applicationId));
  const req = useTalent((s) => (app ? s.requisitions.find((r) => r.id === app.requisitionId) : undefined));
  const cand = useTalent((s) => (app ? s.candidates.find((c) => c.id === app.candidateId) : undefined));
  const existing = useTalent((s) => (modal.interviewId ? s.interviews.find((i) => i.id === modal.interviewId) : undefined));
  const interviews = useTalent((s) => s.interviews);
  const scorecards = useTalent((s) => s.scorecards);
  const scheduleInterview = useTalent((s) => s.scheduleInterview);
  const updateInterview = useTalent((s) => s.updateInterview);
  const users = useHub((s) => s.users);
  const now = useNow(60_000);

  const appIvs = useMemo(() => interviews.filter((i) => i.applicationId === modal.applicationId), [interviews, modal.applicationId]);
  const plan = useMemo(() => planProgress(req, appIvs, scorecards, now), [req, appIvs, scorecards, now]);

  // ── initial values (the host re-keys this modal per request)
  const [kind, setKind] = useState<InterviewKind>(() => existing?.kind ?? modal.interviewKind ?? plan.find((p) => p.state === 'todo')?.step.kind ?? req?.interviewPlan[0]?.kind ?? 'screen');
  const initialStep = planStepFor(req, kind);
  const [title, setTitle] = useState(() => existing?.title ?? initialStep?.label ?? INTERVIEW_KIND_META[kind].label);
  const [titleTouched, setTitleTouched] = useState(!!existing);
  const [duration, setDuration] = useState(() => existing?.durationMins ?? initialStep?.durationMins ?? INTERVIEW_KIND_META[kind].defaultMins);
  const [panel, setPanel] = useState<string[]>(() => existing?.interviewerIds ?? (initialStep?.interviewerIds.length ? initialStep.interviewerIds : req ? [req.hiringManagerId] : []));
  const [location, setLocation] = useState(() => existing?.location ?? (kind === 'screen' || req?.workModel === 'remote' || !/dubai/i.test(req?.location ?? '') ? meetLocation() : HQ_ROOM));
  const [when, setWhen] = useState(() => {
    if (existing && existing.scheduledAt > Date.now()) return { date: toDateInput(existing.scheduledAt), time: toTimeInput(existing.scheduledAt) };
    const first = suggestSlots({ interviews, interviewerIds: panel, durationMins: duration, now: Date.now(), candidateId: app?.candidateId, excludeId: existing?.id })[0];
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(10, 0, 0, 0);
    const ts = first?.at ?? fallback.getTime();
    return { date: toDateInput(ts), time: toTimeInput(ts) };
  });
  const [error, setError] = useState<string | null>(null);

  const step = planStepFor(req, kind);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const myTz = viewerTimeZone();
  const at = fromInputs(when.date, when.time);

  const slots = useMemo(
    () =>
      suggestSlots({
        interviews,
        interviewerIds: panel,
        durationMins: duration,
        now,
        candidateId: app?.candidateId,
        excludeId: existing?.id,
        timeZones: panel.map((id) => userById.get(id)?.timezone),
      }),
    [interviews, panel, duration, now, app?.candidateId, existing?.id, userById],
  );
  const clashes = useMemo(() => (at ? findClashes(interviews, panel, at, duration, existing?.id) : []), [interviews, panel, at, duration, existing?.id]);
  const candBusy = useMemo(() => (at && app ? candidateClash(interviews, app.candidateId, at, duration, existing?.id) : undefined), [interviews, app, at, duration, existing?.id]);

  // ── permission + validation
  const verdict: access.Verdict = !viewer ? { ok: false, reason: 'Sign in to schedule interviews.' } : !app || !req ? { ok: false, reason: 'This application no longer exists.' } : access.canScheduleInterview(viewer, req);
  const closed = !!app && app.status !== 'active';
  const allowed = verdict.ok && !closed;
  const nameOf = (id: string) => userById.get(id)?.name ?? 'Someone';
  const problems: string[] = [];
  if (!at) problems.push('Pick a date and a start time.');
  else if (at < Date.now() - 5 * 60_000) problems.push('Pick a time in the future.');
  if (!panel.length) problems.push('Add at least one interviewer.');
  if (clashes.length) problems.push(`${nameOf(clashes[0].userId)} already has an interview at that time.`);
  if (candBusy) problems.push(`${cand?.name.split(' ')[0] ?? 'The candidate'} already has “${candBusy.title}” at that time.`);

  const chooseKind = (k: InterviewKind) => {
    setKind(k);
    const st = planStepFor(req, k);
    if (!titleTouched) setTitle(st?.label ?? INTERVIEW_KIND_META[k].label);
    setDuration(st?.durationMins ?? INTERVIEW_KIND_META[k].defaultMins);
    if (st?.interviewerIds.length) setPanel(st.interviewerIds);
    setError(null);
  };

  const submit = () => {
    if (!at || !app || problems.length) return;
    setError(null);
    const loc = location.trim() || meetLocation();
    if (existing) {
      const res = updateInterview(existing.id, { scheduledAt: at, durationMins: duration, interviewerIds: panel, location: loc, title: title.trim() || existing.title, status: 'scheduled' });
      if (res.ok) {
        toast.success(`${existing.status === 'scheduled' ? 'Rescheduled' : 'Rebooked'} · ${fmtDate(at)} ${fmtTime(at)}`, 'The panel has been notified.');
        onClose();
      } else {
        setError(res.error);
        toast.result(res);
      }
      return;
    }
    const res = scheduleInterview({ applicationId: app.id, kind, title: title.trim(), scheduledAt: at, durationMins: duration, interviewerIds: panel, location: loc });
    if (toast.result(res)) onClose();
    else if (!res.ok) setError(res.error);
  };

  const heading = existing ? (existing.status === 'scheduled' ? 'Reschedule interview' : 'Rebook interview') : 'Schedule an interview';
  const locKind = parseLocation(location).kind;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={780}
      className="tl-iv-sched-modal"
      icon={<span className="modal-icon">{existing ? <CalendarClock /> : <CalendarPlus />}</span>}
      title={heading}
      subtitle={
        cand && req ? (
          <span className="tl-iv-sched__who">
            <CandidateAvatar person={cand} size={20} />
            {cand.name}
            {cand.sample && <SampleTag />}
            <span className="faint">· {req.title}</span>
          </span>
        ) : undefined
      }
      footer={
        allowed ? (
          <>
            <div className="tl-iv-sched__summary" aria-live="polite">
              {at ? (
                <>
                  <Clock aria-hidden="true" />
                  <span className="truncate">
                    {fmtDate(at)} · {fmtTime(at)}–{fmtTime(ivEnd({ scheduledAt: at, durationMins: duration }))}
                  </span>
                  <span className="faint">
                    · <Users aria-hidden="true" className="inline-icon" /> {panel.length}
                  </span>
                </>
              ) : (
                <span className="faint">Pick a time</span>
              )}
            </div>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit} disabled={problems.length > 0} title={problems[0]}>
              {existing ? <CalendarClock /> : <CalendarPlus />}
              {existing ? 'Save new time' : 'Schedule'}
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {!allowed ? (
        <div className="tl-iv-blocked" role="alert">
          <span className="tl-iv-blocked__icon" aria-hidden="true">
            <ShieldAlert />
          </span>
          <div className="stack stack--sm">
            <strong>{closed ? 'This application is closed' : 'You can’t schedule this interview'}</strong>
            <p className="muted text-sm">{closed ? 'Reopen the application from the pipeline before booking interviews.' : verdict.reason}</p>
            {req && !closed && (
              <div className="row row--wrap text-sm muted">
                Ask <PersonChip userId={req.recruiterId} /> (recruiter) or <PersonChip userId={req.hiringManagerId} /> (hiring manager) to book it.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="tl-iv-sched">
          {plan.length > 0 && (
            <div className="tl-iv-plan-wrap">
              <div className="tl-iv-sched__label">
                Interview loop <span className="faint">· {plan.filter((p) => p.state === 'done').length}/{plan.length} done</span>
              </div>
              <ol className="tl-iv-plan" aria-label="Interview plan">
                {plan.map(({ step: s, state, interview }) => {
                  const Icon = INTERVIEW_KIND_META[s.kind].icon;
                  const current = s.kind === kind;
                  return (
                    <li key={s.id} className={cx('tl-iv-plan__step', `is-${state}`, current && 'is-current')} style={{ '--kind-h': KIND_HUE[s.kind] } as CSSProperties}>
                      <button type="button" onClick={() => chooseKind(s.kind)} disabled={!!existing} aria-pressed={current} title={stateHint(state, interview?.scheduledAt)}>
                        <span className="tl-iv-plan__dot">{state === 'done' ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
                        <span className="tl-iv-plan__text">
                          <span className="tl-iv-plan__name">{s.label}</span>
                          <span className="tl-iv-plan__state">{stateHint(state, interview?.scheduledAt)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="tl-iv-sched__row tl-iv-sched__row--2">
            <label className="field">
              <span className="field-label">Format</span>
              <select className="select" value={kind} onChange={(e) => chooseKind(e.target.value as InterviewKind)} disabled={!!existing}>
                {req && req.interviewPlan.length > 0 && (
                  <optgroup label="Interview plan">
                    {req.interviewPlan.map((s) => (
                      <option key={s.id} value={s.kind}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Other formats">
                  {KINDS.filter((k) => !req?.interviewPlan.some((s) => s.kind === k)).map((k) => (
                    <option key={k} value={k}>
                      {INTERVIEW_KIND_META[k].label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Title</span>
              <input
                className="input"
                value={title}
                maxLength={80}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                }}
                placeholder={step?.label ?? INTERVIEW_KIND_META[kind].label}
              />
            </label>
          </div>

          <div className="tl-iv-sched__row tl-iv-sched__row--3">
            <label className="field">
              <span className="field-label">Date</span>
              <input className="input" type="date" min={toDateInput(now)} value={when.date} onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))} />
            </label>
            <label className="field">
              <span className="field-label">Start time</span>
              <input className="input" type="time" step={900} value={when.time} onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))} />
            </label>
            <label className="field">
              <span className="field-label">Duration</span>
              <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[...new Set([...DURATIONS, duration])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      {fmtDuration(m)}
                      {m === (step?.durationMins ?? INTERVIEW_KIND_META[kind].defaultMins) ? ' · recommended' : ''}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="tl-iv-slots">
            <div className="tl-iv-sched__label">
              <Sparkles aria-hidden="true" /> Smart slots <span className="faint">· the whole panel{cand ? ` and ${cand.name.split(' ')[0]}` : ''} are free</span>
            </div>
            {slots.length ? (
              <div className="tl-iv-slots__chips" role="group" aria-label="Suggested times">
                {slots.map((s) => {
                  const active = at === s.at;
                  return (
                    <button
                      key={s.at}
                      type="button"
                      className={cx('tl-iv-slot', active && 'is-active', s.best && 'is-best')}
                      aria-pressed={active}
                      onClick={() => setWhen({ date: toDateInput(s.at), time: toTimeInput(s.at) })}
                      title={s.offHours ? `${s.offHours} interviewer${s.offHours === 1 ? ' is' : 's are'} outside working hours` : 'Inside everyone’s working hours'}
                    >
                      <span className="tl-iv-slot__day">{fmtDayShort(s.at)}</span>
                      <span className="tl-iv-slot__time">{fmtTimeShort(s.at)}</span>
                      {s.best && <span className="tl-iv-slot__best">Best</span>}
                      {s.offHours > 0 && <Moon className="tl-iv-slot__moon" aria-label="Outside someone’s working hours" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="tl-iv-slots__none">{panel.length ? 'No common free slot in the next five business days. Try a shorter interview or a smaller panel.' : 'Add interviewers to see when everyone is free.'}</p>
            )}
          </div>

          <div className="field">
            <span className="field-label tl-iv-sched__label-row">
              Interviewers
              {step && step.interviewerIds.length > 0 && step.interviewerIds.join() !== panel.join() && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPanel(step.interviewerIds)}>
                  <RotateCcw /> Plan panel
                </button>
              )}
            </span>
            <UserMultiSelect value={panel} onChange={setPanel} placeholder="Add interviewers…" ariaLabel="Interviewers" max={6} />
          </div>

          {panel.length > 0 && at && (
            <ul className="tl-iv-avail" aria-label="Panel availability">
              {panel.map((id) => {
                const u = userById.get(id);
                const clash = clashes.find((c) => c.userId === id);
                const off = !clash && u && outsideHours(at, u.timezone);
                const otherTz = u?.timezone && u.timezone !== myTz;
                return (
                  <li key={id} className={cx('tl-iv-avail__row', clash ? 'is-busy' : off ? 'is-off' : 'is-free')}>
                    <MiniPerson userId={id}>
                      {otherTz ? (
                        <>
                          {fmtTime(at, u.timezone)} local · {tzLabel(u.timezone, new Date(at))}
                        </>
                      ) : (
                        u?.title
                      )}
                    </MiniPerson>
                    <span className="tl-iv-avail__state">
                      {clash ? (
                        <>
                          <TriangleAlert aria-hidden="true" /> Busy · {clash.interview.title} {fmtTime(clash.interview.scheduledAt)}
                        </>
                      ) : off ? (
                        <>
                          <Moon aria-hidden="true" /> Outside working hours
                        </>
                      ) : (
                        <>
                          <CircleCheck aria-hidden="true" /> Free
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
              {candBusy && cand && (
                <li className="tl-iv-avail__row is-busy">
                  <span className="tl-iv-person">
                    <CandidateAvatar person={cand} size={26} />
                    <span className="tl-iv-person__text">
                      <span className="tl-iv-person__name">{cand.name}</span>
                      <span className="tl-iv-person__meta">Candidate</span>
                    </span>
                  </span>
                  <span className="tl-iv-avail__state">
                    <TriangleAlert aria-hidden="true" /> Busy · {candBusy.title} {fmtTime(candBusy.scheduledAt)}
                  </span>
                </li>
              )}
            </ul>
          )}

          <div className="field">
            <span className="field-label">Location</span>
            <div className="tl-iv-locs" role="group" aria-label="Location presets">
              <button type="button" className={cx('chip', locKind === 'video' && 'is-active')} onClick={() => setLocation(meetLocation())} title="Generates a fresh Google Meet link">
                <Video /> Google Meet
              </button>
              <button type="button" className={cx('chip', location === HQ_ROOM && 'is-active')} onClick={() => setLocation(HQ_ROOM)}>
                <Building2 /> Dubai HQ · Atrium room
              </button>
              <button type="button" className={cx('chip', locKind === 'phone' && 'is-active')} onClick={() => setLocation(PHONE_LOCATION)}>
                <Phone /> Phone
              </button>
            </div>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, address or meeting link" aria-label="Location" />
          </div>

          {(error || (problems.length > 0 && at)) && (
            <div className="tl-iv-sched__error" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>{error ?? problems[0]}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function stateHint(state: PlanState, at?: number) {
  if (state === 'done') return 'Done';
  if (state === 'scheduled' && at) return `${fmtDayShort(at)} · ${fmtTimeShort(at)}`;
  return 'To book';
}
