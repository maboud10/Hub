/**
 * "My requests": time off waiting for approval, coming up and in the past
 * (collapsible), each with its type, dates, working days, status, who decides
 * or decided (and their note), cover, attachment and a cancel action behind a
 * confirm dialog whenever the policy allows it (`canCancelLeave`).
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarCheck, CalendarPlus, ChevronDown, Hourglass, Paperclip, Plane, Quote, RotateCcw, Undo2, UserRound, Zap } from 'lucide-react';
import type { LeaveRequest, LeaveTypeId } from '@/hr/types';
import { LEAVE_STATUS_META, LEAVE_TYPE_BY_ID } from '@/hr/constants';
import { canCancelLeave } from '@/hr/access';
import { addDaysISO, formatDay, formatDays, holidaySet, nextWorkingDay, todayISO } from '@/hr/calendar';
import { useHrViewer } from '@/hr/selectors';
import { useHr } from '@/hr/store';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { HrPanel, LeaveTypeBadge, ToneBadge } from '../components/shared';
import { fmtRange as formatRange, relDay } from './utils';

const first = (name?: string) => (name ?? '').split(/\s+/)[0];

export function MyRequests({ onRequest }: { onRequest: (type?: LeaveTypeId) => void }) {
  const me = useSessionUser();
  const leave = useHr((s) => s.leave);
  const now = useNow(60_000);
  const today = todayISO(now);
  const [showPast, setShowPast] = useState(false);
  const [cancel, setCancel] = useState<{ req: LeaveRequest; open: boolean } | null>(null);

  const { pending, upcoming, past } = useMemo(() => {
    const mine = leave.filter((r) => r.userId === me?.id);
    const isUpcoming = (r: LeaveRequest) => r.status === 'approved' && r.end >= today;
    return {
      pending: mine.filter((r) => r.status === 'pending').sort((a, b) => a.start.localeCompare(b.start)),
      upcoming: mine.filter(isUpcoming).sort((a, b) => a.start.localeCompare(b.start)),
      past: mine.filter((r) => r.status !== 'pending' && !isUpcoming(r)).sort((a, b) => b.start.localeCompare(a.start)),
    };
  }, [leave, me, today]);

  const total = pending.length + upcoming.length + past.length;
  const openCancel = (req: LeaveRequest) => setCancel({ req, open: true });

  return (
    <HrPanel
      className="hr-to-mine"
      title="My requests"
      icon={<CalendarCheck aria-hidden="true" />}
      sub={total ? `${pending.length} waiting · ${upcoming.length} coming up` : undefined}
      actions={
        <button type="button" className="btn btn--sm" onClick={() => onRequest()}>
          <CalendarPlus /> New request
        </button>
      }
    >
      {total === 0 ? (
        <EmptyState
          icon={<Plane />}
          title="No time off booked yet"
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onRequest('annual')}>
              <Plane /> Plan a break
            </button>
          }
        >
          Rest is part of the work. Your requests, approvals and history will live here.
        </EmptyState>
      ) : (
        <div className="hr-to-groups">
          {pending.length > 0 && (
            <section className="hr-to-group" aria-label="Waiting for approval">
              <h3 className="hr-to-group__title">
                <Hourglass aria-hidden="true" /> Waiting for approval <span className="count">{pending.length}</span>
              </h3>
              <ul className="hr-to-reqs">
                {pending.map((r) => (
                  <RequestRow key={r.id} req={r} today={today} onCancel={openCancel} onRebook={onRequest} />
                ))}
              </ul>
            </section>
          )}
          <section className="hr-to-group" aria-label="Coming up">
            <h3 className="hr-to-group__title">
              <Plane aria-hidden="true" /> Coming up <span className="count">{upcoming.length}</span>
            </h3>
            {upcoming.length ? (
              <ul className="hr-to-reqs">
                {upcoming.map((r) => (
                  <RequestRow key={r.id} req={r} today={today} onCancel={openCancel} onRebook={onRequest} />
                ))}
              </ul>
            ) : (
              <div className="hr-to-nudge">
                <span>Nothing approved on the horizon. Something to look forward to helps.</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRequest('annual')}>
                  Plan a break
                </button>
              </div>
            )}
          </section>
          {past.length > 0 && (
            <section className="hr-to-group" aria-label="Past and closed">
              <button type="button" className="hr-to-group__toggle" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
                <RotateCcw aria-hidden="true" /> Past &amp; closed <span className="count">{past.length}</span>
                <ChevronDown className={cx('hr-to-chev', showPast && 'is-up')} aria-hidden="true" />
              </button>
              {showPast && (
                <ul className="hr-to-reqs hr-to-reqs--past">
                  {past.map((r) => (
                    <RequestRow key={r.id} req={r} today={today} onCancel={openCancel} onRebook={onRequest} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
      {cancel && <CancelDialog key={cancel.req.id} req={cancel.req} open={cancel.open} onClose={() => setCancel((c) => (c ? { ...c, open: false } : c))} />}
    </HrPanel>
  );
}

function RequestRow({ req, today, onCancel, onRebook }: { req: LeaveRequest; today: string; onCancel: (r: LeaveRequest) => void; onRebook: (t: LeaveTypeId) => void }) {
  const viewer = useHrViewer();
  const users = useHub((s) => s.users);
  const me = useSessionUser();
  const meta = LEAVE_TYPE_BY_ID[req.type];
  const status = LEAVE_STATUS_META[req.status];
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name;
  const live = req.status === 'approved' && req.start <= today && req.end >= today;
  const canCancel = !!viewer && (req.status === 'pending' || req.status === 'approved') && canCancelLeave(viewer, req, today).ok;
  const decider = req.decidedBy === 'system' ? undefined : nameOf(req.decidedBy);
  const back = live ? nextWorkingDay(addDaysISO(req.end, 1), holidaySet(me?.location ?? '')) : '';

  let who: string;
  if (req.status === 'pending') who = `With ${req.approverId ? (nameOf(req.approverId) ?? 'your manager') : 'People Ops'} · sent ${relativeTime(req.createdAt)}`;
  else if (req.status === 'approved') who = req.decidedBy === 'system' ? 'Approved instantly' : `Approved by ${decider ?? 'People Ops'}${req.decidedAt ? ` · ${relativeTime(req.decidedAt)}` : ''}`;
  else if (req.status === 'rejected') who = `Declined by ${decider ?? 'People Ops'}${req.decidedAt ? ` · ${relativeTime(req.decidedAt)}` : ''}`;
  else who = 'Cancelled';

  return (
    <li className={cx('hr-to-req', `is-${req.status}`, live && 'is-live')} style={{ '--lt-h': meta.hue } as CSSProperties}>
      <div className="hr-to-req__date" aria-hidden="true">
        <span>{formatDay(req.start, { month: 'short' })}</span>
        <b>{Number(req.start.slice(8))}</b>
        <span>{formatDay(req.start, { weekday: 'short' })}</span>
      </div>
      <div className="hr-to-req__body">
        <div className="hr-to-req__top">
          <LeaveTypeBadge type={req.type} />
          <span className="hr-to-req__when">{formatRange(req.start, req.end, req.halfDay)}</span>
          <span className="hr-to-req__days">{formatDays(req.days)}</span>
          {live ? <ToneBadge tone="success">{meta.private ? 'Today · take care 💜' : 'Happening now 🌴'}</ToneBadge> : <ToneBadge tone={status.tone}>{status.label}</ToneBadge>}
        </div>
        {req.reason && <p className="hr-to-req__reason">{req.reason}</p>}
        <div className="hr-to-req__meta">
          <span>
            {req.decidedBy === 'system' ? <Zap aria-hidden="true" /> : req.status === 'pending' ? <Hourglass aria-hidden="true" /> : <UserRound aria-hidden="true" />}
            {who}
          </span>
          {req.coverId && (
            <span>
              <UserRound aria-hidden="true" /> Cover: {first(nameOf(req.coverId))}
            </span>
          )}
          {req.attachmentName && (
            <span>
              <Paperclip aria-hidden="true" /> {req.attachmentName}
            </span>
          )}
          {(req.status === 'pending' || req.status === 'approved') && req.start > today && <span className="hr-to-req__count">Starts {relDay(req.start, today)}</span>}
          {live && back && <span className="hr-to-req__count">Back {formatDay(back)}</span>}
        </div>
        {req.decisionNote && (
          <blockquote className={cx('hr-to-req__note', req.status === 'rejected' && 'is-declined')}>
            <Quote aria-hidden="true" />
            <span>
              {req.decisionNote}
              {decider && req.status !== 'cancelled' && <cite> · {first(decider)}</cite>}
            </span>
          </blockquote>
        )}
        {(canCancel || req.status === 'rejected') && (
          <div className="hr-to-req__actions">
            {req.status === 'rejected' && (
              <button type="button" className="btn btn--sm" onClick={() => onRebook(req.type)}>
                <CalendarPlus /> Pick new dates
              </button>
            )}
            {canCancel && (
              <button type="button" className="btn btn--ghost btn--sm hr-to-req__cancel" onClick={() => onCancel(req)}>
                <Undo2 /> {req.status === 'pending' ? 'Withdraw' : 'Cancel'}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CancelDialog({ req, open, onClose }: { req: LeaveRequest; open: boolean; onClose: () => void }) {
  const users = useHub((s) => s.users);
  const [note, setNote] = useState('');
  const meta = LEAVE_TYPE_BY_ID[req.type];
  const notify = req.approverId ? users.find((u) => u.id === req.approverId)?.name : undefined;
  const pending = req.status === 'pending';
  const confirm = () => {
    if (toast.result(useHr.getState().cancelLeave(req.id, note.trim() || undefined))) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={pending ? 'Withdraw this request?' : 'Cancel this time off?'}
      subtitle={`${meta.label} · ${formatRange(req.start, req.end, req.halfDay)} · ${formatDays(req.days)}`}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="btn btn--danger" onClick={confirm}>
            <Undo2 /> {pending ? 'Withdraw request' : 'Cancel time off'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="text-sm">
          {formatDays(req.days)} go straight back to your balance.
          {notify ? ` ${first(notify)} will get a quick notification.` : ''}
        </p>
        <label className="field">
          <span className="field-label">Note (optional)</span>
          <textarea className="textarea" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plans changed, I’ll rebook in spring" />
        </label>
      </div>
    </Modal>
  );
}
