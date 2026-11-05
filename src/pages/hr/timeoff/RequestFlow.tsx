/**
 * "Request time off" — a guided four-step flow in a modal (bottom sheet on
 * phones): 1 pick the type, 2 pick dates on the range calendar, 3 add the
 * details (reason, cover, an attachment when the policy needs one), 4 review a
 * live `previewLeave` summary that explains every number before sending.
 * Ends with a "what happens next" screen and a small celebration when the
 * request is approved instantly.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarRange,
  CircleAlert,
  EyeOff,
  Hourglass,
  ListChecks,
  Paperclip,
  PartyPopper,
  PenLine,
  Plane,
  Send,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Upload,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import type { User } from '@/types';
import type { HalfDay, LeaveTypeId } from '@/hr/types';
import { LEAVE_TYPE_BY_ID, holidaysFor, type PublicHoliday } from '@/hr/constants';
import { addDaysISO, eachDay, formatDay, formatDays, holidaySet, isWeekend, todayISO } from '@/hr/calendar';
import { balanceOf } from '@/hr/engine';
import { useAbsences, useBalances } from '@/hr/selectors';
import { useHr, type LeavePreview } from '@/hr/store';
import { isEmployee } from '@/hr/seed';
import { useHub } from '@/store/hub';
import { useSessionUser, useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { Stepper, type StepDef } from '@/pages/talent/components/shared';
import { UserSelect } from '@/pages/talent/components/pickers';
import { LeaveTypeBadge, UserLine } from '../components/shared';
import { RangeCalendar, type DayInfo } from './RangeCalendar';
import { fmtRange as formatRange, KEY_TYPES, MORE_TYPES, num, policyLine, quickPicks, rangeShape } from './utils';

export interface FlowPreset {
  start: string;
  end: string;
}

const STEPS: StepDef[] = [
  { id: 'type', label: 'Type', icon: ListChecks, hint: 'What kind of time off?' },
  { id: 'dates', label: 'Dates', icon: CalendarRange, hint: 'When are you away?' },
  { id: 'details', label: 'Details', icon: PenLine, hint: 'Reason, cover, documents' },
  { id: 'review', label: 'Review', icon: ShieldCheck, hint: 'Check and send' },
];
const SUBTITLES = ['What kind of time off do you need?', 'Pick your first and last day.', 'A few optional details for your manager.', 'Check everything, then send.'];
const first = (name?: string) => (name ?? '').split(/\s+/)[0];

interface DoneState {
  approved: boolean;
  days: number;
  approverId?: string;
}

export function RequestFlowModal({ open, onClose, initialType, preset }: { open: boolean; onClose: () => void; initialType?: LeaveTypeId; preset?: FlowPreset | null }) {
  const me = useSessionUser();
  const isMobile = useIsMobile();
  const startStep = initialType ? (preset ? 3 : 1) : 0;
  const [step, setStep] = useState(startStep);
  const [maxStep, setMaxStep] = useState(startStep);
  const [type, setType] = useState<LeaveTypeId | null>(initialType ?? null);
  const [start, setStart] = useState(preset?.start ?? '');
  const [end, setEnd] = useState(preset?.end ?? '');
  const [half, setHalf] = useState<'full' | HalfDay>('full');
  const [reason, setReason] = useState('');
  const [coverId, setCoverId] = useState('');
  const [attachment, setAttachment] = useState('');
  const [done, setDone] = useState<DoneState | null>(null);

  const previewLeave = useHr((s) => s.previewLeave);
  const leave = useHr((s) => s.leave);
  const adjustments = useHr((s) => s.adjustments);
  const meta = type ? LEAVE_TYPE_BY_ID[type] : null;
  const halfDay: HalfDay | undefined = meta?.halfDays && start && start === end && half !== 'full' ? half : undefined;
  const preview = useMemo(
    () => (type ? previewLeave({ type, start, end: end || start, halfDay }) : null),
    // `leave` / `adjustments` invalidate the preview when the store changes.
    [previewLeave, type, start, end, halfDay, leave, adjustments], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const approver = useUserById(preview?.approverId);

  const go = (i: number) => {
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
  };
  const pickType = (t: LeaveTypeId) => {
    setType(t);
    if (!LEAVE_TYPE_BY_ID[t].halfDays) setHalf('full');
    go(1);
  };
  const setRange = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
  };

  const valid = [!!type, !!start && !!preview && preview.errors.length === 0, !!preview && (!preview.needsAttachment || !!attachment)];
  const firstInvalid = valid.findIndex((v) => !v);
  const maxReachable = Math.min(maxStep, firstInvalid === -1 ? 3 : firstInvalid);
  const canNext = step < 3 && valid[step];
  const canSubmit = valid.every(Boolean);

  const submit = () => {
    if (!type || !preview || !canSubmit) return;
    const res = useHr.getState().requestLeave({
      type,
      start,
      end: end || start,
      halfDay,
      reason: reason.trim() || undefined,
      coverId: coverId || undefined,
      attachmentName: preview.needsAttachment ? attachment : undefined,
    });
    if (!toast.result(res)) return;
    const created = res.id ? useHr.getState().leave.find((r) => r.id === res.id) : undefined;
    const approved = created?.status === 'approved';
    if (approved) burstConfetti();
    setDone({ approved, days: created?.days ?? preview.days, approverId: preview.approverId });
  };

  const summary = type && start && preview && preview.days > 0 ? `${formatRange(start, end || start, halfDay)} · ${formatDays(preview.days)}` : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={880}
      className="hr-to-flow"
      icon={
        <span className="hr-to-flow__icon" aria-hidden="true">
          <Plane />
        </span>
      }
      title={done ? (done.approved ? 'Approved instantly' : 'Request sent') : 'Request time off'}
      subtitle={done ? undefined : SUBTITLES[step]}
      footer={
        done ? (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            {step > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)}>
                <ArrowLeft /> Back
              </button>
            )}
            <span className="hr-to-flow__sum" aria-live="polite">
              {summary}
            </span>
            {step < 3 ? (
              <button type="button" className="btn btn--primary" disabled={!canNext} onClick={() => go(step + 1)}>
                Next <ArrowRight />
              </button>
            ) : (
              <button type="button" className="btn btn--primary" disabled={!canSubmit} onClick={submit}>
                {preview?.autoApprove ? (
                  <>
                    <Zap /> Book it
                  </>
                ) : (
                  <>
                    <Send /> {approver ? `Send to ${first(approver.name)}` : 'Send to People Ops'}
                  </>
                )}
              </button>
            )}
          </>
        )
      }
    >
      {done && type ? (
        <DoneStep done={done} type={type} start={start} end={end || start} halfDay={halfDay} coverId={coverId} />
      ) : (
        <>
          <Stepper steps={STEPS} current={step} maxReached={Math.max(step, maxReachable)} onStep={(i) => i <= Math.max(step, maxReachable) && setStep(i)} />
          {step === 0 && <TypeStep value={type} onPick={pickType} />}
          {step === 1 && type && preview && (
            <DatesStep type={type} start={start} end={end} half={half} setHalf={setHalf} setRange={setRange} preview={preview} months={isMobile ? 1 : 2} onChangeType={() => go(0)} />
          )}
          {step === 2 && type && preview && (
            <DetailsStep
              type={type}
              meId={me?.id ?? ''}
              approverName={approver?.name}
              reason={reason}
              setReason={setReason}
              coverId={coverId}
              setCoverId={setCoverId}
              attachment={attachment}
              setAttachment={setAttachment}
              needsAttachment={preview.needsAttachment}
            />
          )}
          {step === 3 && type && preview && (
            <ReviewStep type={type} start={start} end={end || start} halfDay={halfDay} preview={preview} reason={reason} coverId={coverId} attachment={attachment} onEdit={go} />
          )}
        </>
      )}
    </Modal>
  );
}

// ───────────────────────── step 1: type ─────────────────────────
function TypeStep({ value, onPick }: { value: LeaveTypeId | null; onPick: (t: LeaveTypeId) => void }) {
  const balances = useBalances();
  const [more, setMore] = useState(() => !!value && MORE_TYPES.includes(value));
  if (!balances.length) return null;
  const card = (t: LeaveTypeId) => {
    const meta = LEAVE_TYPE_BY_ID[t];
    const b = balanceOf(balances, t);
    const Icon = meta.icon;
    const used = !!meta.oncePerEmployment && b.taken + b.booked + b.pending > 0;
    const none = b.available !== null && b.available <= 0;
    const left = b.available === null ? 'Flexible' : used ? 'Used' : `${num(b.available)} left`;
    return (
      <button
        key={t}
        type="button"
        className={cx('hr-to-type', value === t && 'is-selected')}
        style={{ '--lt-h': meta.hue } as CSSProperties}
        disabled={used || none}
        aria-pressed={value === t}
        onClick={() => onPick(t)}
      >
        <span className="hr-to-type__icon" aria-hidden="true">
          <Icon />
        </span>
        <span className="hr-to-type__body">
          <span className="hr-to-type__top">
            <b>{meta.label}</b>
            <span className={cx('hr-to-type__left', (used || none) && 'is-empty')}>{left}</span>
          </span>
          <span className="hr-to-type__line">{used ? 'You’ve already used this. Talk to People Ops if your plans changed.' : none ? 'None left this year. People Ops can help with options.' : policyLine(meta)}</span>
          <span className="hr-to-type__tags">
            {meta.private && (
              <span className="hr-to-tag">
                <EyeOff aria-hidden="true" /> Colleagues only see “Away”
              </span>
            )}
            {meta.autoApproveUpTo && (
              <span className="hr-to-tag">
                <Zap aria-hidden="true" /> Instant up to {meta.autoApproveUpTo} days
              </span>
            )}
            {meta.halfDays && (
              <span className="hr-to-tag">
                <Sun aria-hidden="true" /> Half days
              </span>
            )}
            {!meta.paid && <span className="hr-to-tag">Unpaid</span>}
          </span>
        </span>
      </button>
    );
  };
  return (
    <div className="hr-to-types">
      <div className="hr-to-types__grid">{KEY_TYPES.map(card)}</div>
      {more ? (
        <>
          <div className="hr-to-types__divider">Other leave</div>
          <div className="hr-to-types__grid">{MORE_TYPES.map(card)}</div>
        </>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm hr-to-types__more" onClick={() => setMore(true)}>
          Parental, Hajj or unpaid leave <ArrowRight />
        </button>
      )}
    </div>
  );
}

// ───────────────────────── step 2: dates ─────────────────────────
function DatesStep({
  type,
  start,
  end,
  half,
  setHalf,
  setRange,
  preview,
  months,
  onChangeType,
}: {
  type: LeaveTypeId;
  start: string;
  end: string;
  half: 'full' | HalfDay;
  setHalf: (h: 'full' | HalfDay) => void;
  setRange: (s: string, e: string) => void;
  preview: LeavePreview;
  months: 1 | 2;
  onChangeType: () => void;
}) {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const leave = useHr((s) => s.leave);
  const today = todayISO();
  const from = addDaysISO(today, -62);
  const to = addDaysISO(today, 400);
  const absences = useAbsences('team', from, to);
  const meta = LEAVE_TYPE_BY_ID[type];
  const location = me?.location ?? '';
  const holidays = useMemo(() => holidaySet(location), [location]);
  const picks = useMemo(() => quickPicks(type, today, holidays), [type, today, holidays]);

  const info = useMemo(() => {
    const m = new Map<string, DayInfo>();
    const at = (d: string) => {
      let x = m.get(d);
      if (!x) {
        x = {};
        m.set(d, x);
      }
      return x;
    };
    for (const h of holidaysFor(location)) at(h.date).holiday = h.name;
    for (const r of leave)
      if (r.userId === me?.id && (r.status === 'approved' || r.status === 'pending'))
        for (const d of eachDay(r.start, r.end)) if (!isWeekend(d)) at(d).mine = { type: r.type, status: r.status };
    for (const a of absences) {
      if (a.userId === me?.id) continue;
      const name = first(users.find((u) => u.id === a.userId)?.name) || 'Teammate';
      for (const d of eachDay(a.start < from ? from : a.start, a.end > to ? to : a.end)) {
        if (isWeekend(d)) continue;
        const x = at(d);
        if (!x.team?.includes(name)) x.team = [...(x.team ?? []), name];
      }
    }
    return m;
  }, [location, leave, absences, users, me, from, to]);

  const errors = preview.errors.filter((e) => e !== 'Pick your dates.');
  const single = !!start && start === (end || start);
  const b = preview.balance;

  return (
    <div className="hr-to-dates">
      <div className="hr-to-dates__bar">
        <LeaveTypeBadge type={type} size="md" />
        <span className="muted text-sm">{b.available === null ? 'No fixed allowance' : `${num(b.available)} day${b.available === 1 ? '' : 's'} available`}</span>
        <div className="hr-to-quick" role="group" aria-label="Quick picks">
          {picks.map((p) => (
            <button key={p.id} type="button" className={cx('chip', start === p.start && (end || start) === p.end && 'is-active')} onClick={() => setRange(p.start, p.end)}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onChangeType}>
          Change type
        </button>
      </div>
      <RangeCalendar start={start} end={end} onChange={setRange} months={months} info={info} today={today} min={addDaysISO(today, -60)} max={addDaysISO(today, 395)} />
      <div className="hr-to-legend" aria-hidden="true">
        <span>
          <i className="is-weekend" /> Weekend
        </span>
        {holidays.size > 0 && (
          <span>
            <i className="is-holiday" /> Public holiday
          </span>
        )}
        <span>
          <i className="is-mine" /> Your time off
        </span>
        <span>
          <i className="is-team" /> Teammates away
        </span>
      </div>
      <div className={cx('hr-to-pick', !start && 'is-empty')}>
        {start ? (
          <>
            <div className="hr-to-pick__what">
              <b>{formatRange(start, end || start, single && meta.halfDays && half !== 'full' ? half : undefined)}</b>
              <span>
                {preview.days > 0 ? `${formatDays(preview.days)} off` : 'Nothing to deduct'}
                {preview.after !== null && preview.days > 0 ? ` · ${num(b.available ?? 0)} → ${num(preview.after)} left` : ''}
              </span>
            </div>
            {single && meta.halfDays && (
              <Segmented
                label="Full or half day"
                value={half}
                onChange={setHalf}
                options={[
                  { value: 'full', label: 'Full day' },
                  { value: 'am', label: 'Morning' },
                  { value: 'pm', label: 'Afternoon' },
                ]}
              />
            )}
          </>
        ) : (
          <span className="muted text-sm">No dates yet. Use a quick pick or tap the calendar.</span>
        )}
      </div>
      {errors.length > 0 && (
        <div className="hr-to-callout hr-to-callout--danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── step 3: details ─────────────────────────
function DetailsStep({
  type,
  meId,
  approverName,
  reason,
  setReason,
  coverId,
  setCoverId,
  attachment,
  setAttachment,
  needsAttachment,
}: {
  type: LeaveTypeId;
  meId: string;
  approverName?: string;
  reason: string;
  setReason: (s: string) => void;
  coverId: string;
  setCoverId: (s: string) => void;
  attachment: string;
  setAttachment: (s: string) => void;
  needsAttachment: boolean;
}) {
  const meta = LEAVE_TYPE_BY_ID[type];
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const coverFilter = useCallback((u: User) => u.id !== meId && isEmployee(u), [meId]);
  const who = approverName ? first(approverName) : 'People Ops';
  const placeholder: Partial<Record<LeaveTypeId, string>> = {
    annual: 'e.g. Family trip to Kyoto 🍁',
    wfa: 'e.g. Working from Lisbon, same hours',
    study: 'e.g. AWS Solutions Architect exam',
    sick: 'Optional. You don’t need to share details.',
    compassionate: 'Optional. Share only what you’re comfortable with.',
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setAttachment(f.name);
  };
  return (
    <div className="hr-to-details">
      {meta.private && (
        <div className="hr-to-callout hr-to-callout--info">
          <EyeOff aria-hidden="true" />
          <p>
            <b>Private by default.</b> On the team calendar colleagues only see that you’re away. Only {who === 'People Ops' ? 'People Ops' : `${who} and People Ops`} see the type and your note.
          </p>
        </div>
      )}
      <label className="field">
        <span className="field-label">Note for {who} (optional)</span>
        <textarea className="textarea" rows={3} maxLength={280} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder[type] ?? 'Anything that helps your manager plan'} />
        <span className="field-hint">{meta.private ? 'Never shown to teammates.' : `Teammates see the dates and “${meta.short}”, never your note.`}</span>
      </label>
      <div className="field">
        <label className="field-label" htmlFor="hr-to-cover">
          Who’s covering for you? (optional)
        </label>
        <UserSelect id="hr-to-cover" value={coverId} onChange={setCoverId} filter={coverFilter} allowEmpty placeholder="No cover needed" ariaLabel="Cover colleague" />
        <span className="field-hint">They’ll get a heads-up so nothing falls through the cracks.</span>
      </div>
      {needsAttachment && (
        <div className="field">
          <span className="field-label">{type === 'sick' ? 'Medical certificate' : 'Supporting document'} (required)</span>
          <div
            className={cx('hr-to-drop', drag && 'is-drag', attachment && 'has-file')}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            {attachment ? (
              <span className="hr-to-file">
                <Paperclip aria-hidden="true" />
                <span className="truncate">{attachment}</span>
                <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove attachment" onClick={() => setAttachment('')}>
                  <X />
                </button>
              </span>
            ) : (
              <button type="button" className="hr-to-drop__btn" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" />
                <b>Attach a file</b>
                <span>or drop it here · PDF or photo</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setAttachment(f.name);
                e.target.value = '';
              }}
            />
          </div>
          <span className="field-hint">
            Needed for more than {meta.attachmentAfterDays} days. Only {who === 'People Ops' ? 'People Ops' : `${who} and People Ops`} can open it.
          </span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── step 4: review ─────────────────────────
function ReviewStep({
  type,
  start,
  end,
  halfDay,
  preview,
  reason,
  coverId,
  attachment,
  onEdit,
}: {
  type: LeaveTypeId;
  start: string;
  end: string;
  halfDay?: HalfDay;
  preview: LeavePreview;
  reason: string;
  coverId: string;
  attachment: string;
  onEdit: (step: number) => void;
}) {
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const meta = LEAVE_TYPE_BY_ID[type];
  const Icon = meta.icon;
  const location = me?.location ?? '';
  const holidayDates = useMemo(() => holidaySet(location), [location]);
  const shape = rangeShape(start, end, holidayDates);
  const absences = useAbsences('team', start, end);
  const others = absences.filter((a) => a.userId !== me?.id);
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? 'A teammate';
  const coverAway = !!coverId && others.some((a) => a.userId === coverId);
  const b = preview.balance;
  const year = Number(start.slice(0, 4));
  const thisYear = new Date().getFullYear();
  const holidayNames = uniqueHolidays(preview.holidays);
  const strip = shape.days.length <= 21 ? shape.days : [];

  return (
    <div className="hr-to-review">
      <div className="hr-to-review__hero" style={{ '--lt-h': meta.hue } as CSSProperties}>
        <span className="hr-to-review__icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="grow">
          <div className="hr-to-review__type">{meta.label}</div>
          <div className="hr-to-review__when">{formatRange(start, end, halfDay)}</div>
          {year !== thisYear && <div className="text-xs muted">Counts towards your {year} allowance</div>}
        </div>
        <div className="hr-to-review__days">
          <b>{num(preview.days)}</b>
          <span>working day{preview.days === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="hr-to-review__grid">
        <section className="hr-to-review__card">
          <h3 className="hr-to-review__h">
            Why {formatDays(preview.days)}?
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(1)}>
              Edit dates
            </button>
          </h3>
          {strip.length > 0 && (
            <div className="hr-to-strip" aria-hidden="true">
              {strip.map((d) => {
                const hol = !isWeekend(d) && holidayDates.has(d);
                return (
                  <span key={d} className={cx('hr-to-strip__day', isWeekend(d) ? 'is-weekend' : hol ? 'is-holiday' : 'is-work', halfDay && 'is-half')}>
                    <small>{formatDay(d, { weekday: 'narrow' })}</small>
                    {Number(d.slice(8))}
                  </span>
                );
              })}
            </div>
          )}
          <ul className="hr-to-why">
            <li>
              <span>Calendar days</span>
              <b>{shape.calendar}</b>
            </li>
            {shape.weekends > 0 && (
              <li className="is-minus">
                <span>Weekend days (never deducted)</span>
                <b>−{shape.weekends}</b>
              </li>
            )}
            {shape.holidays > 0 && (
              <li className="is-minus">
                <span>
                  Public holiday{shape.holidays === 1 ? '' : 's'}: {holidayNames.join(', ')}
                </span>
                <b>−{shape.holidays}</b>
              </li>
            )}
            {halfDay && (
              <li className="is-minus">
                <span>Half day ({halfDay === 'am' ? 'morning' : 'afternoon'})</span>
                <b>×½</b>
              </li>
            )}
            <li className="is-total">
              <span>Deducted</span>
              <b>{num(preview.days)}</b>
            </li>
          </ul>
        </section>

        <section className="hr-to-review__card">
          <h3 className="hr-to-review__h">Your balance</h3>
          {b.available === null ? (
            <p className="text-sm muted">{meta.paid ? 'No fixed allowance. Your manager decides.' : 'Unpaid: these days are not paid. Benefits continue for up to 30 days.'}</p>
          ) : (
            <div className="hr-to-balshift" style={{ '--lt-h': meta.hue } as CSSProperties}>
              <div>
                <b>{num(b.available)}</b>
                <span>now</span>
              </div>
              <ArrowRight aria-hidden="true" />
              <div className={cx(preview.after !== null && preview.after < 0 && 'is-neg')}>
                <b>{num(preview.after ?? 0)}</b>
                <span>after</span>
              </div>
              <div className="hr-to-balshift__bar" aria-hidden="true">
                <span style={{ width: `${b.entitled ? Math.max(0, Math.min(100, ((preview.after ?? 0) / b.entitled) * 100)) : 0}%` }} />
                <span className="is-this" style={{ width: `${b.entitled ? Math.max(0, Math.min(100, (preview.days / b.entitled) * 100)) : 0}%` }} />
              </div>
              <p className="text-xs muted">
                {meta.short} days left in {year} if approved{b.pending ? `, counting ${num(b.pending)} already pending` : ''}.
              </p>
            </div>
          )}
          <h3 className="hr-to-review__h hr-to-review__h--gap">Who approves</h3>
          {preview.autoApprove ? (
            <div className="hr-to-route is-instant">
              <Zap aria-hidden="true" />
              <div>
                <b>Approved instantly.</b> No waiting. {preview.approverId ? `${first(nameOf(preview.approverId))} just gets a heads-up.` : 'People Ops gets a heads-up.'}
              </div>
            </div>
          ) : preview.approverId ? (
            <div className="hr-to-route">
              <UserLine userId={preview.approverId} size={34} sub="Your manager · usually decides within 2 days" />
            </div>
          ) : (
            <div className="hr-to-route">
              <ShieldCheck aria-hidden="true" />
              <div>People Ops decides, because you don’t have an active line manager.</div>
            </div>
          )}
        </section>
      </div>

      {(preview.warnings.length > 0 || others.length > 0 || coverAway) && (
        <section className="hr-to-review__card hr-to-review__card--soft">
          <h3 className="hr-to-review__h">Good to know</h3>
          {preview.warnings.map((w) => (
            <div key={w} className="hr-to-callout hr-to-callout--warning">
              <TriangleAlert aria-hidden="true" />
              <p>{w}</p>
            </div>
          ))}
          {coverAway && (
            <div className="hr-to-callout hr-to-callout--warning">
              <TriangleAlert aria-hidden="true" />
              <p>{first(nameOf(coverId))}, your cover, is also away on some of these days.</p>
            </div>
          )}
          {others.length > 0 && (
            <div className="hr-to-overlap">
              <UsersRound aria-hidden="true" />
              <div>
                <span className="text-sm">Also away from your team:</span>
                <ul>
                  {others.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      <b>{nameOf(a.userId)}</b> · {formatRange(a.start, a.end, a.halfDay)}
                      {a.status === 'pending' && <span className="hr-to-pending-tag">pending</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="hr-to-review__card hr-to-review__card--soft">
        <h3 className="hr-to-review__h">
          Details
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(2)}>
            Edit
          </button>
        </h3>
        <dl className="hr-to-recap">
          <dt>Note</dt>
          <dd>{reason.trim() || <span className="faint">None</span>}</dd>
          <dt>Cover</dt>
          <dd>{coverId ? nameOf(coverId) : <span className="faint">No cover</span>}</dd>
          {preview.needsAttachment && (
            <>
              <dt>Attachment</dt>
              <dd>{attachment ? <span className="hr-to-file hr-to-file--inline"><Paperclip aria-hidden="true" /> {attachment}</span> : <span className="hr-to-error-text">Missing</span>}</dd>
            </>
          )}
        </dl>
      </section>

      {preview.errors.length > 0 && (
        <div className="hr-to-callout hr-to-callout--danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            {preview.errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function uniqueHolidays(list: PublicHoliday[]) {
  return [...new Set(list.map((h) => h.name))];
}

// ───────────────────────── done ─────────────────────────
function DoneStep({ done, type, start, end, halfDay, coverId }: { done: DoneState; type: LeaveTypeId; start: string; end: string; halfDay?: HalfDay; coverId: string }) {
  const me = useSessionUser();
  const approver = useUserById(done.approverId);
  const cover = useUserById(coverId || undefined);
  const meta = LEAVE_TYPE_BY_ID[type];
  const when = `${formatRange(start, end, halfDay)} · ${formatDays(done.days)}`;
  if (done.approved)
    return (
      <div className="hr-to-done is-approved" role="status">
        <span className="hr-to-done__badge" aria-hidden="true">
          <PartyPopper />
        </span>
        <h3>{type === 'sick' ? `Rest up, ${first(me?.name)} 💜` : 'You’re all set 🌴'}</h3>
        <p className="muted">
          {meta.label} · {when}. Approved instantly{approver ? `, and ${first(approver.name)} has been told. No action needed.` : '.'}
        </p>
        {type === 'sick' && <p className="text-sm muted">Feel better soon. If you need more days, request them the same way; over 2 days we’ll ask for a medical certificate.</p>}
      </div>
    );
  return (
    <div className="hr-to-done" role="status">
      <span className="hr-to-done__badge" aria-hidden="true">
        <Send />
      </span>
      <h3>Sent to {approver ? approver.name : 'People Ops'}</h3>
      <p className="muted">
        {meta.label} · {when}
      </p>
      <ol className="hr-to-next">
        <li>
          <Bell aria-hidden="true" />
          <span>
            <b>{approver ? first(approver.name) : 'People Ops'}</b> gets a notification right now.
          </span>
        </li>
        <li>
          <Hourglass aria-hidden="true" />
          <span>Your balance shows these days as pending until it’s decided.</span>
        </li>
        <li>
          <ShieldCheck aria-hidden="true" />
          <span>You’ll hear back here, usually within 2 days. You can cancel any time before then.</span>
        </li>
        {cover && (
          <li>
            <UsersRound aria-hidden="true" />
            <span>
              <b>{first(cover.name)}</b> knows you asked them to cover.
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
