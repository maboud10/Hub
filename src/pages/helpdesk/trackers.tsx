/**
 * Helpdesk journey trackers on the shared NeoTracker ("pizza tracker"):
 *  - `FixTracker` — a ticket from Received to Resolved, paced by its SLA
 *    clocks and narrated with the assignee's name.
 *  - `RequestTracker` — a catalog request through its approval chain to
 *    hand-over (also renders the "approval route" preview before submitting).
 * Stage maths (live stage, mood, timestamps, pacing, ETA) live in
 * `@/helpdesk/journey`; this file owns the wording.
 */
import { useMemo, type ReactNode } from 'react';
import { BadgeCheck, CircleCheck, Inbox, PackageCheck, PackageOpen, Send, ShieldCheck, UserCheck, Wrench } from 'lucide-react';
import { NeoTracker, type NeoTrackerProps, type NeoTrackStep } from '@/components/neo';
import { formatDate, formatDateTime, formatTime, relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { useHelpdesk } from '@/helpdesk/store';
import type { CatalogItem, CatalogKind, CatalogRequest, Device, Ticket, TicketCategory } from '@/helpdesk/types';
import { requestTrack, ticketTrack } from '@/helpdesk/journey';
import { formatDuration, slaLabel } from '@/helpdesk/sla';
import { DAY, PRIORITY_LABEL, RESOLUTION_LABEL, STATUS_LABEL, STATUS_LABEL_AGENT } from '@/helpdesk/meta';
import { firstNameOf } from '@/helpdesk/util';
import { etaLabel } from './catalogParts';

type TrackerView = Pick<NeoTrackerProps, 'steps' | 'current' | 'state' | 'hud' | 'title' | 'message' | 'eta' | 'progress'>;
type NameOf = (id?: string) => string | undefined;

const dur = (ms: number) => formatDuration(ms, { compact: true });
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
/** Absolute, stable time for status lines ("14:05", or "12 Nov, 14:05" when not today). */
const when = (ts: number, now: number) => (sameDay(ts, now) ? formatTime(ts) : formatDateTime(ts));
const endOfDay = (ts: number) => new Date(ts).setHours(23, 59, 59, 999);
/** "today" / "tomorrow" / "14 Nov" for ETA chips. */
const dayLabel = (ts: number, now: number) => (ts <= endOfDay(now) ? 'today' : ts <= endOfDay(now + DAY) ? 'tomorrow' : formatDate(ts, { day: 'numeric', month: 'short' }));

function useNameOf(): NameOf {
  const users = useHub((s) => s.users);
  return useMemo(() => (id?: string) => (id ? users.find((u) => u.id === id)?.name : undefined), [users]);
}

/* ==========================================================================
   Fix tracker — tickets
   ========================================================================== */

const FIX_TITLE: Record<TicketCategory, string> = {
  hardware: 'Your hardware fix is on its way',
  software: 'Your software fix is on its way',
  access: 'Your access is on its way',
  network: 'Your connection fix is on its way',
  email: 'Your mailbox fix is on its way',
  security: 'Security is on the case',
  other: 'Your fix is on its way',
};

/** What the assignee is doing right now, by category (requester-facing). */
function fixVerb(t: Ticket, device?: Device): ReactNode {
  switch (t.category) {
    case 'hardware':
      return device ? (
        <>
          is working on your <b>{device.model}</b>
        </>
      ) : (
        'is working on your hardware'
      );
    case 'software':
      return 'is sorting out your software';
    case 'access':
      return 'is chasing your access with the system owner';
    case 'network':
      return 'is tracing your connection issue';
    case 'email':
      return 'is resyncing your mailbox';
    case 'security':
      return 'is investigating with Security';
    default:
      return 'is working on your fix';
  }
}

interface FixCtx {
  now: number;
  nameOf: NameOf;
  /** Viewer is the requester (agents get queue-style wording). */
  requester: boolean;
  device?: Device;
}

function fixTrackerView(t: Ticket, c: FixCtx): TrackerView {
  const { now } = c;
  const tr = ticketTrack(t, now);
  const agent = c.nameOf(t.assigneeId);
  const who = agent ? firstNameOf(agent) : undefined;
  const nova = !!t.selfService;
  const waiting = t.status === 'waiting';
  const resolved = t.status === 'resolved';
  const replyLate = tr.reply.state === 'breached';
  const fixLate = tr.fix.state === 'breached';
  const ago = (ts?: number) => (ts === undefined ? undefined : relativeTime(ts, now));
  const labels = c.requester ? STATUS_LABEL : STATUS_LABEL_AGENT;

  const steps: NeoTrackStep[] = [
    { id: 'received', label: 'Received', sub: `${t.priority} · ${PRIORITY_LABEL[t.priority]}`, icon: <Inbox />, at: ago(tr.at.received) },
    {
      id: 'triaged',
      label: labels.triaged,
      sub: nova ? 'Nova' : (agent ?? (t.sim === 'pickup' ? 'Finding a specialist' : 'IT queue')),
      icon: <UserCheck />,
      at: ago(tr.at.triaged),
    },
    {
      id: 'in_progress',
      label: waiting ? labels.waiting : labels.in_progress,
      sub: nova
        ? 'Nova'
        : waiting
          ? c.requester
            ? 'Your reply needed'
            : c.nameOf(t.requesterId)
          : t.firstResponseAt
            ? `First reply · ${dur(t.firstResponseAt - t.createdAt)}`
            : `First reply · ${slaLabel(tr.reply)}`,
      icon: <Wrench />,
      at: ago(waiting && t.pausedAt ? t.pausedAt : tr.at.in_progress),
    },
    {
      id: 'resolved',
      label: labels.resolved,
      sub: resolved
        ? nova
          ? 'Fixed by Nova'
          : t.resolution && RESOLUTION_LABEL[t.resolution.code]
        : waiting
          ? 'On hold'
          : fixLate
            ? `Overdue · ${dur(-tr.fix.remaining)}`
            : `Target · ${when(tr.fix.due, now)}`,
      icon: <CircleCheck />,
      at: ago(tr.at.resolved),
    },
  ];

  const eta = resolved
    ? nova
      ? 'Instant fix'
      : `Resolved in ${dur(Math.max(0, (t.resolvedAt ?? now) - t.createdAt - (t.pausedMs || 0)))}`
    : waiting
      ? 'SLA paused'
      : fixLate
        ? `Overdue · ${dur(-tr.fix.remaining)}`
        : `ETA · ${dur(tr.fix.remaining)}`;

  let title: string;
  let message: ReactNode;
  if (c.requester) {
    title = resolved ? (nova ? 'Nova fixed it for you' : 'Fixed — you’re all set') : waiting ? 'Over to you — one reply keeps it moving' : t.escalated ? FIX_TITLE.security : FIX_TITLE[t.category];
    if (resolved)
      message = nova ? (
        <>
          Nova fixed this <b>{ago(t.resolvedAt ?? t.updatedAt)}</b> — no queue, no wait.
        </>
      ) : (
        <>
          <b>{who ?? 'IT'}</b> wrapped this up <b>{ago(t.resolvedAt ?? t.updatedAt)}</b>. Still acting up? Reopen it and we’ll jump straight back in.
        </>
      );
    else if (waiting)
      message = (
        <>
          <b>{who ?? 'IT'}</b> needs a quick reply from you to keep going — the SLA clock is paused until you answer.
        </>
      );
    else if (!who)
      message =
        t.sim === 'pickup' ? (
          <>
            Nova is matching you with the right specialist — first reply due by <b>{when(tr.reply.due, now)}</b>.
          </>
        ) : replyLate ? (
          <>You’re in the IT queue and the first reply is running late — we’ve flagged it to the team.</>
        ) : (
          <>
            You’re in the IT queue — first reply due by <b>{when(tr.reply.due, now)}</b>.
          </>
        );
    else if (!t.firstResponseAt)
      message = replyLate ? (
        <>
          <b>{who}</b> grabbed your ticket — the first reply is running a little late.
        </>
      ) : (
        <>
          <b>{who}</b> grabbed your ticket — first reply due by <b>{when(tr.reply.due, now)}</b>.
        </>
      );
    else if (t.escalated || t.category === 'security')
      message = (
        <>
          <b>{who}</b> is investigating with Security — please don’t wipe or reset anything in the meantime.
        </>
      );
    else if (fixLate)
      message = (
        <>
          <b>{who}</b> is still on it — this is taking longer than the <b>{dur(tr.fix.target)}</b> target, sorry for the wait.
        </>
      );
    else
      message = (
        <>
          <b>{who}</b> {fixVerb(t, c.device)} — target fix by <b>{when(tr.fix.due, now)}</b>.
        </>
      );
  } else {
    const requester = firstNameOf(c.nameOf(t.requesterId));
    title = resolved ? STATUS_LABEL.resolved : waiting ? 'Paused on the requester' : t.status === 'new' ? 'Waiting for an owner' : t.status === 'triaged' ? 'Owned · not started' : 'Fix in progress';
    if (resolved)
      message = (
        <>
          <b>{nova ? 'Nova' : (who ?? 'IT')}</b> resolved it <b>{ago(t.resolvedAt ?? t.updatedAt)}</b>
          {t.csat ? (
            <>
              {' '}
              · rated <b>{t.csat.score}/5</b>
            </>
          ) : null}
          .
        </>
      );
    else if (waiting)
      message = (
        <>
          Waiting on <b>{requester}</b> — the fix clock is paused until they reply.
        </>
      );
    else if (!who)
      message = replyLate ? (
        <>
          Unassigned and past the <b>{dur(tr.reply.target)}</b> first-response target — grab it.
        </>
      ) : (
        <>
          Unassigned — first response due by <b>{when(tr.reply.due, now)}</b>.
        </>
      );
    else if (!t.firstResponseAt)
      message = replyLate ? (
        <>
          <b>{who}</b> owns it — the first response is overdue.
        </>
      ) : (
        <>
          <b>{who}</b> owns it — first response due by <b>{when(tr.reply.due, now)}</b>.
        </>
      );
    else
      message = fixLate ? (
        <>
          <b>{who}</b> is working it — past the <b>{dur(tr.fix.target)}</b> fix target.
        </>
      ) : (
        <>
          <b>{who}</b> is working it — fix due by <b>{when(tr.fix.due, now)}</b>.
        </>
      );
  }

  return { steps, current: tr.current, state: tr.mood, hud: 'Fix tracker', title, message, eta, progress: tr.progress };
}

/**
 * Live "pizza tracker" for a ticket. `compact` renders the slim row version;
 * `note` adds the live status line under the compact bar (small screens).
 */
export function FixTracker({
  ticket,
  requester = true,
  compact,
  bare,
  note,
  actions,
  className,
}: {
  ticket: Ticket;
  requester?: boolean;
  compact?: boolean;
  bare?: boolean;
  note?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const nameOf = useNameOf();
  const device = useHelpdesk((s) => (ticket.deviceTag ? s.devices.find((d) => d.assetTag === ticket.deviceTag) : undefined));
  const now = useNow(30_000);
  const view = useMemo(() => fixTrackerView(ticket, { now, nameOf, requester, device }), [ticket, now, nameOf, requester, device]);
  const tracker = <NeoTracker {...view} compact={compact} bare={bare} actions={actions} label={`Fix tracker · ${ticket.id}`} className={cx('hd-track', className)} />;
  if (!compact || !note) return tracker;
  return (
    <div className="hd-track-note">
      {tracker}
      <p className="hd-track-note__msg" aria-live="polite">
        {view.message}
      </p>
    </div>
  );
}

/* ==========================================================================
   Request tracker — catalog requests
   ========================================================================== */

const APPROVAL_LABEL = { manager: 'Manager', it: 'IT approval', security: 'Security review' } as const;
const APPROVAL_ICON = { manager: UserCheck, it: Wrench, security: ShieldCheck } as const;
const DONE_LABEL: Record<CatalogKind, string> = { hardware: 'Delivered', software: 'Ready to use', access: 'Access granted' };
const READYING: Record<CatalogKind, string> = {
  hardware: 'IT is getting it ready for hand-over',
  software: 'IT is setting up your licence',
  access: 'IT is switching on your access',
};

interface ReqCtx {
  now: number;
  nameOf: NameOf;
  history: readonly CatalogRequest[];
  /** Viewer is the requester ("You" vs. their name). */
  requester: boolean;
  /** Route preview before submitting: no times, no narration. */
  preview?: boolean;
}

function requestTrackerView(r: CatalogRequest, item: CatalogItem, c: ReqCtx): TrackerView {
  const { now } = c;
  const tr = requestTrack(r, { now, item, history: c.history });
  const first = (id?: string) => {
    const n = c.nameOf(id);
    return n ? firstNameOf(n) : undefined;
  };
  const ago = (ts?: number) => (c.preview || ts === undefined ? undefined : relativeTime(ts, now));
  const doneLabel = DONE_LABEL[item.kind];

  const steps: NeoTrackStep[] = tr.stages.map((s, i): NeoTrackStep => {
    switch (s.kind) {
      case 'requested':
        return { id: 'requested', label: 'Requested', sub: c.requester ? 'You' : c.nameOf(r.requesterId), icon: <Send />, at: ago(s.doneAt) };
      case 'fulfilment':
        return { id: 'fulfilment', label: 'Fulfilment', sub: (r.fulfilment && c.nameOf(r.fulfilment.by)) || 'IT team', icon: <PackageOpen />, at: ago(s.doneAt) };
      case 'delivered':
        return {
          id: 'delivered',
          label: doneLabel,
          sub: r.fulfilment ? (r.fulfilment.deviceTag ? <span className="neo-mono">{r.fulfilment.deviceTag}</span> : 'Live') : etaLabel(item),
          icon: item.kind === 'hardware' ? <PackageCheck /> : <BadgeCheck />,
          at: ago(s.doneAt),
        };
      default: {
        const step = s.step!;
        const Icon = APPROVAL_ICON[step.role];
        const sub = step.role === 'manager' ? (step.state === 'skipped' ? (step.note ?? 'Not needed') : (c.nameOf(step.approverId) ?? 'Your manager')) : (c.nameOf(step.decidedBy) ?? (step.role === 'it' ? 'IT team' : 'Security team'));
        return { id: `${step.role}-${i}`, label: APPROVAL_LABEL[step.role], sub, icon: <Icon />, at: step.state === 'skipped' ? 'Skipped' : ago(s.doneAt) };
      }
    }
  });

  if (c.preview) return { steps, current: tr.current, state: 'active', progress: 0 };

  const live = tr.stages[tr.current];
  const usually = tr.expected !== undefined ? dur(tr.expected) : '';
  const waited = tr.since !== undefined ? now - tr.since : 0;
  const slow = tr.expected !== undefined && waited > tr.expected;
  let message: ReactNode;
  switch (r.status) {
    case 'pending': {
      const role = live?.step?.role ?? 'it';
      if (role === 'manager') {
        const m = first(live?.step?.approverId) ?? 'Your manager';
        message = slow ? (
          <>
            <b>{m}</b> has had it for <b>{dur(waited)}</b> — longer than usual, so a friendly nudge might help.
          </>
        ) : (
          <>
            <b>{m}</b> is reviewing your request — managers usually reply within <b>~{usually}</b>.
          </>
        );
      } else if (role === 'it')
        message = slow ? (
          <>
            IT is taking a little longer than usual — it’s been <b>{dur(waited)}</b>.
          </>
        ) : (
          <>
            IT is checking licences, stock and fit — usually takes <b>~{usually}</b>.
          </>
        );
      else
        message = slow ? (
          <>
            Security is taking a little longer than usual — it’s been <b>{dur(waited)}</b>.
          </>
        ) : (
          <>
            Security is reviewing the access risk — usually takes <b>~{usually}</b>.
          </>
        );
      break;
    }
    case 'approved': {
      const last = r.steps.reduce<CatalogRequest['steps'][number] | undefined>((a, s) => (s.decidedAt !== undefined && (!a || s.decidedAt > (a.decidedAt ?? 0)) ? s : a), undefined);
      message = (
        <>
          <b>{first(last?.decidedBy) ?? 'IT'}</b> signed it off — {READYING[item.kind]}.
        </>
      );
      break;
    }
    case 'fulfilled': {
      const by = first(r.fulfilment?.by) ?? 'IT';
      message =
        item.kind === 'hardware' ? (
          <>
            <b>{by}</b> handed it over <b>{ago(r.fulfilment?.at ?? r.updatedAt)}</b> — enjoy!
          </>
        ) : (
          <>
            <b>{by}</b> switched it on <b>{ago(r.fulfilment?.at ?? r.updatedAt)}</b> — you’re good to go.
          </>
        );
      break;
    }
    case 'denied': {
      const d = r.steps.find((s) => s.state === 'denied');
      message = (
        <>
          <b>{first(d?.decidedBy) ?? 'An approver'}</b> declined it <b>{ago(d?.decidedAt ?? r.updatedAt)}</b>
          {d?.note ? ' — their note is below.' : '.'}
        </>
      );
      break;
    }
    case 'cancelled':
      message = (
        <>
          You cancelled this request <b>{ago(r.updatedAt)}</b>.
        </>
      );
      break;
  }

  const eta = r.status === 'fulfilled' && r.fulfilment ? `${doneLabel} · ${formatDate(r.fulfilment.at, { day: 'numeric', month: 'short' })}` : tr.eta !== undefined ? `ETA · ${dayLabel(tr.eta, now)}` : undefined;

  return { steps, current: tr.current, state: tr.mood, hud: 'Request tracker', message, eta, progress: tr.progress };
}

/** Live tracker for a catalog request (or, with `preview`, the route it will take). */
export function RequestTracker({
  r,
  item,
  requester = true,
  compact,
  bare,
  preview,
  className,
}: {
  r: CatalogRequest;
  item: CatalogItem;
  requester?: boolean;
  compact?: boolean;
  bare?: boolean;
  preview?: boolean;
  className?: string;
}) {
  const nameOf = useNameOf();
  const history = useHelpdesk((s) => s.requests);
  const now = useNow(60_000);
  const view = useMemo(() => requestTrackerView(r, item, { now, nameOf, history, requester, preview }), [r, item, now, nameOf, history, requester, preview]);
  return <NeoTracker {...view} compact={compact} bare={bare} label={preview ? 'Approval route' : `Request tracker · ${r.id}`} className={cx('hd-track', className)} />;
}
